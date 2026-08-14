import {deny, readStdinJson} from './hook-utils.mjs';

const input = await readStdinJson();
const command = String(input?.tool_input?.command || '').trim();
if (!command) process.exit(0);

function referencesRealEnv(value) {
  const normalized = value.replaceAll('\\', '/');
  const matches = normalized.match(/(?:^|[\s'"=:(/])(?:[^\s'"=:(/]*\/)*\.env(?:\.[a-z0-9_.-]+)?/gi) || [];
  return matches.some((raw) => {
    const token = raw.trim().replace(/^[\s'"=:(]+/, '').toLowerCase();
    return token !== '.env.example' && !token.endsWith('/.env.example') && !token.endsWith('.env.example');
  });
}

const normalized = command.replaceAll('\\', '/');
const secretPath = referencesRealEnv(command)
  || /(?:^|[\s'"=:(/])[^\s'"=:(/]*\.(?:pem|key|p12|pfx|jks|keystore)\b/i.test(normalized)
  || /(?:^|[\s'"=:(/])(?:secrets?|credentials)(?:\/|\.(?:json|ya?ml|toml)\b)/i.test(normalized)
  || /(?:^|[\s'"=:(/])(?:\.npmrc|\.pypirc|\.netrc|\.git-credentials|service-account\.json|auth\.json)(?:$|[\s'";&|)])/i.test(normalized)
  || /(?:^|[\s'"=:(/])(?:\.ssh|\.aws|\.kube|\.docker)(?:\/|$)/i.test(normalized);
if (secretPath) deny('Blocked: reading or referencing a real secret file is not allowed.');

const sensitiveName = String.raw`[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|CREDENTIAL)[A-Z0-9_]*`;
const environmentDump = /(^|[;&|]\s*)\s*(?:env|printenv|set|export\s+-p|compgen\s+-e)\s*(?:$|[;&|])/im.test(command)
  || /(?:Get-ChildItem|Get-Item|gci|gi|dir|ls)\s+(?:Env:|env:\\?)/i.test(command)
  || /\$env:[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|CREDENTIAL)[A-Z0-9_]*/i.test(command)
  || new RegExp(`\\$\\{?(?:${sensitiveName})\\}?`, 'i').test(command)
  || /\/proc\/(?:self|[0-9]+)\/environ\b/i.test(normalized)
  || /\b(?:node\s+(?:-e|--eval|-p|--print)|python3?\s+-c|ruby\s+-e|php\s+-r)\b[^\n]*(?:process\.env|os\.environ|environ\[|getenv\s*\()/i.test(command);
if (environmentDump) deny('Blocked: dumping credential-bearing environment variables is not allowed.');

const remoteToShell = [
  /\b(?:curl|wget)\b[^\n|;]*(?:\||\|&)\s*(?:env\s+)?(?:ba|z|k|c)?sh\b/i,
  /\b(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest)\b[^\n|;]*(?:\||\|&)\s*(?:iex|Invoke-Expression)\b/i,
  /\b(?:curl|wget)\b[^\n|;]*(?:\||\|&)\s*(?:powershell|pwsh)(?:\.exe)?\b/i
];
if (remoteToShell.some((pattern) => pattern.test(command))) {
  deny('Blocked: remote downloads may not be piped into a shell.');
}

const dangerousDocker = [
  /\bdocker\b[^\n;&|]*(?:--privileged\b|--pid(?:=|\s+)host\b|--ipc(?:=|\s+)host\b|--network(?:=|\s+)host\b|--cap-add(?:=|\s+)ALL\b)/i,
  /\bdocker\b[^\n;&|]*(?:\/var\/run\/docker\.sock|\/run\/docker\.sock|docker\.sock\s*:)/i,
  /\bdocker\s+(?:system|volume|builder|image|container)\s+prune\b/i,
  /\bdocker\s+compose\b[^\n;&|]*\bdown\b[^\n;&|]*(?:-v\b|--volumes\b|--rmi\b)/i
];
if (dangerousDocker.some((pattern) => pattern.test(normalized))) {
  deny('Blocked: dangerous or destructive Docker access requires manual execution.');
}

if (process.env.CLAUDE_ALLOW_DESTRUCTIVE !== '1') {
  const destructive = [
    /\brm\b[^\n;&|]*(?:\s|^)-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b/i,
    /\brm\b[^\n;&|]*(?:(?:--recursive|-r|-R)\b[^\n;&|]*(?:--force|-f)\b|(?:--force|-f)\b[^\n;&|]*(?:--recursive|-r|-R)\b)/i,
    /\brm\b[^\n;&|]*\s(?:\/|~|\$home|\$\{home\}|\.\.?|\.\/\*|\*)\s*(?:$|[;&|])/i,
    /\bfind\b[^\n;&|]*(?:-delete|-exec(?:dir)?\s+rm\b)/i,
    /\bRemove-Item\b[^\n;&|]*(?=[^\n;&|]*(?:-Recurse|-r\b))(?=[^\n;&|]*(?:-Force|-f\b))[^\n;&|]*(?:[A-Za-z]:[\\/]?(?:\s|$)|[.]{1,2}(?:[\\/]|\s|$)|\*(?:\s|$))/i,
    /\b(?:rd|rmdir)\b[^\n;&|]*\/s\b[^\n;&|]*\/q\b/i,
    /\bdel\b[^\n;&|]*\/f\b[^\n;&|]*\/s\b[^\n;&|]*\/q\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\b[^\n;&|]*-[^\s]*[fdx]/i,
    /\bgit\s+push\b[^\n;&|]*(?:--force|-f\b)/i,
    /(?:\b(?:dropdatabase|drop\s+(?:database|schema|table)|truncate\s+table)\b|\.drop\s*\()/i,
    /\b(?:mkfs|wipefs|shred|fdisk|parted|Format-Volume|Clear-Disk|Initialize-Disk|Remove-Partition)\b/i
  ];
  if (destructive.some((pattern) => pattern.test(command))) {
    deny('Blocked: destructive command requires explicit manual authorization.');
  }
}
