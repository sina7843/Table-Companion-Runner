import {deny, readStdinJson} from './hook-utils.mjs';

const input = await readStdinJson();
const command = String(input?.tool_input?.command || '').trim();
if (!command) process.exit(0);

const normalized = command.replaceAll('\\', '/');

const network = /\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|Start-BitsTransfer|ssh|scp|sftp|ftp|nc|ncat|telnet)\b/i;
if (network.test(command)) deny('Reviewer is read-only and may not make remote requests.');

const mutation = [
  /\b(?:touch|mkdir|install|cp|mv|rm|truncate|tee|sed\s+-i|perl\s+-pi|patch)\b/i,
  /\b(?:New-Item|Set-Content|Add-Content|Clear-Content|Copy-Item|Move-Item|Remove-Item|Rename-Item|Out-File|Export-Csv|ConvertTo-Json\s+[^|]*\|\s*Set-Content)\b/i,
  /(?:^|[^>])>>?\s*[^&]/,
  /\bgit\s+(?:add|commit|merge|rebase|reset|checkout|switch|restore|clean|stash|tag|push|pull|fetch|cherry-pick|revert)\b/i,
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|upgrade|link|publish)\b/i,
  /\b(?:docker|podman)\s+(?:run|build|pull|push|compose\s+(?:up|down|build|pull|restart|start|stop)|system|volume|container|image)\b/i,
  /\b(?:mongosh|mongo|psql|mysql|sqlite3)\b[^\n]*(?:insert|update|delete|drop|alter|create|truncate)\b/i
];
if (mutation.some((pattern) => pattern.test(normalized))) {
  deny('Reviewer is read-only and may not mutate files, dependencies, Git state, services, or data.');
}

const allowedStart = /^(?:\s*(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint|typecheck|check|build|verify)(?:\s|$)|\s*(?:node|npx|pnpm\s+exec|yarn\s+exec|bunx)\s+[^\n]+|\s*git\s+(?:status|diff|log|show|branch|rev-parse|ls-files)(?:\s|$)|\s*(?:Get-Content|Select-String|Get-ChildItem|Test-Path|Resolve-Path|Measure-Object|Compare-Object)\b|\s*(?:cat|head|tail|grep|rg|find|findstr|dir|ls|pwd|where|which|wc|sort|uniq|diff)\b)/i;
if (!allowedStart.test(command)) {
  deny('Reviewer may run only read-only inspection, build, lint, typecheck, and test commands.');
}
