import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = process.env.LAB_CONTENT_DIR ?? path.join(REPO_ROOT, 'content');
export const TARGETS_FILE = process.env.LAB_TARGETS_FILE ?? path.join(REPO_ROOT, 'config', 'targets.yaml');
export const STATE_DIR = process.env.LAB_STATE_DIR ?? path.join(homedir(), '.local', 'state', 'homelab-cka-lab');
export const COURSE_DIR = process.env.LAB_COURSE_DIR ?? '/tmp/course';
export const CHECK_LIB = path.join(CONTENT_DIR, 'lib', 'check-lib.sh');
export const TERMINAL_RC = path.join(REPO_ROOT, 'terminal', 'bashrc');
export const BIN_DIR = path.join(REPO_ROOT, 'bin');
export const WEB_DIST = path.join(REPO_ROOT, 'web', 'dist');

export const HOST = '127.0.0.1';
export const PORT = Number(process.env.PORT ?? 8088);
export const DEV = process.env.LAB_DEV === '1';

export const TIMEOUTS = {
  checkMs: 20_000,
  scriptMs: 180_000,
};
