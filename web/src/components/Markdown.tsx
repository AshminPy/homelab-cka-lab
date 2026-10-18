import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';

/** Renders trusted lab Markdown (sanitized anyway) and adds a Copy button to code blocks. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string), [text]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const pre of root.querySelectorAll('pre')) {
      if (pre.querySelector('.copy-btn')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? '';
        void navigator.clipboard.writeText(code.replace(/\n$/, '')).then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = 'Copy'), 1200);
        });
      });
      pre.appendChild(btn);
    }
  }, [html]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
