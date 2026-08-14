import path from 'node:path';
import {deny, readStdinJson, resolveInsideProject} from './hook-utils.mjs';

function isEnvExample(base) {
  return base === '.env.example' || base.endsWith('.env.example');
}

function isProjectSource(relative) {
  return relative === 'Requirements.md'
    || relative === 'IMPLEMENTATION_DECISIONS.md'
    || relative === 'CLAUDE.md'
    || relative === 'README_START_HERE_FA.md'
    || relative === 'tools' || relative.startsWith('tools/')
    || relative === 'prompts' || relative.startsWith('prompts/')
    || relative === '.claude' || relative.startsWith('.claude/')
    || relative === 'DESIGN_SOURCE.md'
    || relative === '.table-companion-backups' || relative.startsWith('.table-companion-backups/');
}

function isSecret(relative) {
  const base = path.posix.basename(relative);
  if (!isEnvExample(base) && (base === '.env' || base.startsWith('.env.'))) return true;
  if (relative === 'secrets' || relative.startsWith('secrets/') || relative.includes('/secrets/')) return true;
  if (/(?:^|\/)config\/credentials\.json$/i.test(relative)) return true;
  if (/(?:^|\/)(?:credentials|secrets?)\.(?:json|ya?ml|toml)$/i.test(relative)) return true;
  if (/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(relative)) return true;
  if (/(?:^|\/)(?:id_rsa|id_ed25519|known_hosts)$/i.test(relative)) return true;
  if (/(?:^|\/)(?:\.npmrc|\.pypirc|\.netrc|\.git-credentials|service-account\.json|auth\.json)$/i.test(relative)) return true;
  if (/(?:^|\/)(?:\.ssh|\.aws|\.kube|\.docker)(?:\/|$)/i.test(relative)) return true;
  return false;
}

try {
  const input = await readStdinJson();
  const toolName = String(input?.tool_name || '');
  const candidate = String(input?.tool_input?.file_path || input?.tool_input?.notebook_path || '');
  if (!candidate) process.exit(0);

  const writing = /^(?:Edit|Write|NotebookEdit)$/i.test(toolName);
  const resolved = resolveInsideProject(candidate, {rejectSymlinks: writing});

  if (isSecret(resolved.relative)) deny(`Blocked: ${resolved.relative} is a protected secret path.`);
  if (writing && isProjectSource(resolved.relative)) {
    deny(`Blocked: ${resolved.relative} is protected project source. Edit it manually outside Claude Code if the design itself must change.`);
  }
  if (writing && (resolved.relative === '.git' || resolved.relative.startsWith('.git/'))) {
    deny(`Blocked: ${resolved.relative} is internal Git metadata.`);
  }
} catch (error) {
  deny(`Blocked by file guard: ${error.message}`);
}
