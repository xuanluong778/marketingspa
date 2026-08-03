import { existsSync } from 'fs';
import { join } from 'path';

/** Resolve widget.js on disk (dev tsc, nest build assets, or monorepo web public). */
export function resolveChatbotWidgetPath(): string | null {
  const candidates = [
    join(process.cwd(), 'src', 'public', 'chatbot', 'widget.js'),
    join(process.cwd(), 'apps', 'api', 'src', 'public', 'chatbot', 'widget.js'),
    join(__dirname, '..', '..', '..', 'src', 'public', 'chatbot', 'widget.js'),
    join(__dirname, '..', '..', '..', '..', 'web', 'public', 'chatbot', 'widget.js'),
    join(process.cwd(), 'apps', 'web', 'public', 'chatbot', 'widget.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
