import fs from 'node:fs';
import path from 'node:path';

export function deny(message) {
  console.error(message);
  process.exit(2);
}

export async function readStdinJson({allowEmpty = true} = {}) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw && allowEmpty) return {};
  if (!raw) deny('Blocked: hook input is empty.');

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('input must be a JSON object');
    }
    return parsed;
  } catch (error) {
    deny(`Blocked: malformed hook input (${error.message}).`);
  }
}

export function projectRoot() {
  const configured = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return fs.realpathSync.native(path.resolve(configured));
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolveInsideProject(candidate, {rejectSymlinks = false} = {}) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('A non-empty path is required.');
  }

  const root = projectRoot();
  const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  if (!isInside(root, absolute)) throw new Error('Path escapes the project root.');

  const parts = path.relative(root, absolute).split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (!stat.isSymbolicLink()) continue;
    if (rejectSymlinks) throw new Error(`Symlink paths are not writable: ${path.relative(root, cursor)}`);
    const resolved = fs.realpathSync.native(cursor);
    if (!isInside(root, resolved)) throw new Error('Path resolves outside the project through a symlink.');
    cursor = resolved;
  }

  return {
    root,
    absolute,
    relative: path.relative(root, absolute).split(path.sep).join('/') || '.'
  };
}
