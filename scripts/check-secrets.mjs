/**
 * Nothing secret is committed.
 *
 * A guardrail rather than a scanner: it does not try to recognise every credential ever
 * minted, it checks the small number of ways *this* repository could leak one. Those are the
 * ones worth failing a build over, and each has a false-positive story short enough to fix.
 *
 *   node scripts/check-secrets.mjs
 *
 * Run in CI, and worth running by hand before a first push to a public remote.
 *
 * It lives here rather than in `tools/`, which is protected source belonging to the delivery
 * package. `tools/validate-package.mjs` checks that package; this checks the repository.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every file git is actually tracking. What is ignored cannot be committed. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

const problems = [];
const say = (file, what) => problems.push(`${file}: ${what}`);

/* ── An env file that is not the example ────────────────────────────────────── */

for (const file of trackedFiles()) {
  const base = path.basename(file);
  if (base === '.env.example' || base.endsWith('.env.example')) continue;
  if (base === '.env' || base.startsWith('.env.')) {
    say(file, 'an environment file is committed; only .env.example may be');
  }
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base)) {
    say(file, 'a key file is committed');
  }
}

/* ── A credential in the source ─────────────────────────────────────────────── */

const ALLOWED_LITERALS = new Set([
  'localdev',
  'ci-only-not-a-secret',
  'table-companion-dev',
  'table-companion-e2e-password',
]);

/**
 * Exact fake credentials used to prove redaction and strict payload handling.
 *
 * This is intentionally path-and-value specific. We do not skip test files, and we do not
 * weaken a pattern globally: a new hash/token/connection string in any test still fails CI.
 */
const TEST_FIXTURES = new Map([
  ['server/account.test.ts', ['scrypt$1$2$3$x$y']],
  [
    'server/operations.test.ts',
    [
      'postgres://user:pw@localhost:5432/db',
      'scrypt$32768$8$1$abc$def',
      'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
    ],
  ],
]);

const PATTERNS = [
  { name: 'a password hash', test: /scrypt\$\d+\$\d+\$\d+\$/ },
  { name: 'a private key', test: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'an AWS access key id', test: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'a GitHub token', test: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'a bearer token', test: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/ },
  {
    name: 'an API key assignment',
    test: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9._~+/-]{16,}['"]/i,
  },
];

/** A connection string carrying a password that is not one of the allowed ones. */
const CONNECTION_STRING = /postgres(?:ql)?:\/\/[^\s:'"]+:([^\s@'"]+)@/g;

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2']);

for (const file of trackedFiles()) {
  if (SKIP_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  // This file is a list of what a secret looks like, so every pattern in it matches itself.
  if (file === 'scripts/check-secrets.mjs') continue;

  let text;
  try {
    text = fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;

  for (const fixture of TEST_FIXTURES.get(file) ?? []) {
    text = text.replaceAll(fixture, '[explicit-test-fixture]');
  }

  for (const pattern of PATTERNS) {
    pattern.test.lastIndex = 0;
    if (pattern.test.test(text)) say(file, `looks like it contains ${pattern.name}`);
  }

  CONNECTION_STRING.lastIndex = 0;
  for (const match of text.matchAll(CONNECTION_STRING)) {
    const password = match[1];
    if (password && !ALLOWED_LITERALS.has(password) && !password.startsWith('$')) {
      say(file, `a connection string carries a password ("${password.slice(0, 4)}…")`);
    }
  }
}

/* ── The example file documents names, never values ─────────────────────────── */

const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const line of example.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) continue;
  const match = /^(DATABASE_URL|[A-Z_]*SECRET[A-Z_]*|[A-Z_]*PASSWORD[A-Z_]*)\s*=\s*(.+)$/.exec(
    trimmed,
  );
  if (!match) continue;
  const [, name, value] = match;
  const looksLikeLocal = value.includes('127.0.0.1') || value.includes('localhost');
  if (!looksLikeLocal && !ALLOWED_LITERALS.has(value)) {
    say('.env.example', `${name} has a value; it may only have a name`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`Secret check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  'Secret check passed: no environment files, keys, hashes, tokens or unexpected connection-string passwords are tracked.\n',
);
