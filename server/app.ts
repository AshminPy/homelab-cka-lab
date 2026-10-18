import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HttpError, type AttemptService } from './attempts.ts';
import { findLab, qdirFor, renderText, type Catalog } from './content.ts';
import { computeProgress, daysUntil, type ProgressStore } from './progress.ts';
import { securityMiddleware, type Security } from './security.ts';
import type { ExamSummary, LabDetail, Mode, TargetStatus } from './shared.ts';

export interface AppDeps {
  catalog: Catalog;
  store: ProgressStore;
  service: AttemptService;
  security: Security;
  targetStatus: (force: boolean) => Promise<TargetStatus>;
  nodes: () => Record<string, string>;
  courseDir: string;
  staticDir?: string;
  now?: () => Date;
}

const MODES: Mode[] = ['practice', 'exam'];

export function createApp(deps: AppDeps): express.Express {
  const now = () => (deps.now ? deps.now() : new Date());
  const app = express();
  app.disable('x-powered-by');
  app.use(securityMiddleware(deps.security));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '64kb' }));

  const finishedAttempts = () => deps.store.data.attempts.filter((a) => a.finishedAt && a.summary);

  function catalogSummary(): ExamSummary[] {
    const active = deps.store.data.activeAttempt;
    return deps.catalog.exams.map((exam) => ({
      id: exam.id,
      short: exam.short,
      name: exam.name,
      passPercent: exam.passPercent,
      durationMinutes: exam.durationMinutes,
      kubernetesVersion: exam.kubernetesVersion,
      targetDate: exam.targetDate,
      daysToTarget: daysUntil(exam.targetDate, now()),
      domains: exam.domains,
      labs: deps.catalog.labs
        .filter((l) => l.examId === exam.id)
        .map((l) => {
          const runs = finishedAttempts()
            .filter((a) => a.examId === exam.id && a.labId === l.id)
            .sort((a, b) => (a.finishedAt as string).localeCompare(b.finishedAt as string));
          const percents = runs.map((a) => a.summary!.percent);
          return {
            id: l.id,
            examId: l.examId,
            title: l.title,
            description: l.description,
            level: l.level,
            durationMinutes: l.durationMinutes,
            questionCount: l.questions.length,
            totalPoints: l.questions.reduce((s, q) => s + q.points, 0),
            attempts: runs.length,
            bestPercent: percents.length ? Math.max(...percents) : null,
            lastPercent: percents.at(-1) ?? null,
            inProgress: active?.examId === exam.id && active.labId === l.id,
          };
        }),
    }));
  }

  function labDetail(examId: string, labId: string): LabDetail {
    const lab = findLab(deps.catalog, examId, labId);
    const exam = deps.catalog.exams.find((e) => e.id === examId);
    if (!lab || !exam) throw new HttpError(404, `Unknown lab ${examId}/${labId}`);
    const nodes = deps.nodes();
    return {
      id: lab.id,
      examId,
      examShort: exam.short,
      title: lab.title,
      description: lab.description,
      durationMinutes: lab.durationMinutes,
      passPercent: exam.passPercent,
      questions: lab.questions.map((q, i) => {
        const vars = { nodes, qdir: qdirFor(deps.courseDir, lab, q.id) };
        return {
          id: q.id,
          number: i + 1,
          title: q.title,
          domain: q.domain,
          difficulty: q.difficulty,
          points: q.points,
          context: renderText(q.context, vars),
          tasks: renderText(q.tasks, vars),
        };
      }),
    };
  }

  const param = (req: Request, name: string): string => String(req.params[name] ?? '');

  app.get('/api/session', (req, res) => {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Forbidden');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ token: deps.security.token });
  });
  app.get('/api/target', async (req, res) => {
    // A forced refresh rewrites the kubeconfig and runs kubectl, so only our own page may trigger it.
    const site = req.headers['sec-fetch-site'];
    const sameSite = !site || site === 'same-origin' || site === 'none';
    res.json(await deps.targetStatus(req.query.refresh === '1' && sameSite));
  });
  app.get('/api/catalog', (_req, res) => {
    res.json(catalogSummary());
  });
  app.get('/api/labs/:examId/:labId', (req, res) => {
    res.json(labDetail(param(req, 'examId'), param(req, 'labId')));
  });
  app.get('/api/attempts/active', (_req, res) => {
    res.json({ attempt: deps.service.active() });
  });
  app.post('/api/attempts', async (req, res) => {
    const { examId, labId, mode } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof examId !== 'string' || typeof labId !== 'string' || !MODES.includes(mode as Mode)) {
      throw new HttpError(400, 'Body must be {"examId": string, "labId": string, "mode": "practice" | "exam"}');
    }
    res.status(201).json(await deps.service.start(examId, labId, mode as Mode));
  });
  app.get('/api/attempts/:id', (req, res) => {
    res.json(deps.service.get(param(req, 'id')));
  });
  app.patch('/api/attempts/:id/questions/:qid', (req, res) => {
    res.json(deps.service.mark(param(req, 'id'), param(req, 'qid'), req.body));
  });
  app.post('/api/attempts/:id/questions/:qid/reset', async (req, res) => {
    res.json(await deps.service.reset(param(req, 'id'), param(req, 'qid')));
  });
  app.post('/api/attempts/:id/questions/:qid/check', async (req, res) => {
    res.json(await deps.service.check(param(req, 'id'), param(req, 'qid')));
  });
  app.get('/api/attempts/:id/questions/:qid/solution', (req, res) => {
    res.json(deps.service.solution(param(req, 'id'), param(req, 'qid')));
  });
  app.post('/api/attempts/:id/finish', async (req, res) => {
    res.json(await deps.service.finish(param(req, 'id')));
  });
  app.delete('/api/attempts/:id', async (req, res) => {
    await deps.service.abandon(param(req, 'id'));
    res.status(204).end();
  });
  app.get('/api/progress', (_req, res) => {
    res.json(computeProgress(deps.store.data, deps.catalog, now()));
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (deps.staticDir && existsSync(path.join(deps.staticDir, 'index.html'))) {
    const wsSources = [...deps.security.allowedHosts].map((h) => `ws://${h}`).join(' ');
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      `connect-src 'self' ${wsSources}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    const staticDir = deps.staticDir;
    app.use((_req, res, next) => {
      res.setHeader('Content-Security-Policy', csp);
      next();
    });
    app.use(express.static(staticDir, { index: false }));
    app.use((req, res, next) => {
      if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api')) res.sendFile(path.join(staticDir, 'index.html'));
      else next();
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const e = err as { type?: string; message?: string };
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: e?.message ?? 'Internal error' });
  });

  return app;
}
