/**
 * Zero-dependency static server for local use: `node server.mjs [port]`.
 * Serves `/` → public/index.html, plus files under /public and /src only.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const ALLOWED_DIRS = ['public', 'src'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'",
};

/** Maps a URL path to a file inside an allowed directory, or null. */
export function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (decoded === '/' || decoded === '/index.html') decoded = '/public/index.html';
  const file = normalize(join(ROOT, decoded));
  const ok = ALLOWED_DIRS.some((dir) => file.startsWith(join(ROOT, dir) + sep));
  return ok && TYPES[extname(file)] ? file : null;
}

export function startServer(port = 5173) {
  const server = createServer(async (req, res) => {
    const file = req.method === 'GET' || req.method === 'HEAD' ? resolvePath(req.url ?? '/') : null;
    if (!file) {
      res.writeHead(404, SECURITY_HEADERS).end('Not found');
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, SECURITY_HEADERS).end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 5173);
  startServer(port).then(() => console.log(`Homeowner Health running at http://localhost:${port}`));
}
