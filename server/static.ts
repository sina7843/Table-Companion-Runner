/**
 * Serving the built bundle from the same process that serves the API.
 *
 * The deployment topology is same-origin — that is what lets the session cookie be
 * `SameSite=Strict` and why there is no CORS configuration to get wrong — and one process
 * serving both is the simplest thing that satisfies it. No proxy, no second container, no
 * third place for a header to be set differently.
 *
 * Deliberately small: an index, a content type, an immutable cache for the hashed assets and
 * a no-store for the entry document, and a fallback to `index.html` so a deep link into the
 * router works on a hard refresh. Anything more is a web server, and a deployment that wants
 * one can put it in front and leave `TC_STATIC_DIR` unset.
 *
 * The one rule it must not get wrong is the path: a request is data, and a request that walks
 * out of the directory is how a static handler becomes a way to read `/etc/passwd`.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

/**
 * The file a request asks for, or null if it is asking for something else entirely.
 *
 * Resolved against the root and then checked to still be inside it. `path.normalize` collapses
 * `..` before the check, and the check is what makes it safe rather than the normalisation:
 * a decoded `%2e%2e%2f`, a Windows backslash and a symlinked name all end up compared against
 * the same prefix.
 */
export function resolveStaticPath(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const relative = decoded.replace(/^\/+/, '');
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relative);

  // `startsWith(root)` alone would accept `/srv/app-secrets` for a root of `/srv/app`.
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) return null;
  return candidate;
}

export interface StaticHandler {
  /** True when it answered. False means "not mine" — the caller should 404. */
  serve(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean>;
}

export function createStaticHandler(root: string): StaticHandler {
  const indexFile = path.join(path.resolve(root), 'index.html');

  const sendFile = (
    request: IncomingMessage,
    response: ServerResponse,
    file: string,
    size: number,
    immutable: boolean,
  ): void => {
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': size,
      // Hashed asset names are immutable by construction; the entry document must never be,
      // or a deploy is invisible until somebody clears their cache.
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  };

  return {
    async serve(request, response, pathname) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return false;

      const file = resolveStaticPath(root, pathname === '/' ? '/index.html' : pathname);
      if (file) {
        const found = await stat(file).catch(() => null);
        if (found?.isFile()) {
          // `/assets/index-B3sedocy.js` carries its content in its name; `/index.html` does not.
          sendFile(request, response, file, found.size, pathname.startsWith('/assets/'));
          return true;
        }
      }

      // A deep link into the router — `/dm/campaigns/…` — is a document request for a path
      // no file matches, and the answer is the application. A request that looks like an
      // asset is not: answering it with HTML turns a missing file into a parse error three
      // layers away, which is a worse thing to debug than a 404.
      if (path.extname(pathname) !== '') return false;

      const index = await stat(indexFile).catch(() => null);
      if (!index?.isFile()) return false;
      sendFile(request, response, indexFile, index.size, false);
      return true;
    },
  };
}
