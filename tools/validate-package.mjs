import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'CLAUDE.md','Requirements.md','DESIGN_SOURCE.md','IMPLEMENTATION_DECISIONS.md','PROJECT_STATUS.md','DECISIONS.md',
  'IMPLEMENTATION_STATUS.md','REQUIREMENTS_TRACEABILITY.md','.claude/settings.json','.mcp.json',
  'prompts/prompt-manifest.json','prompts/requirements-traceability.json','prompts/QUICK_START.md',
  'tools/Copy-TableCompanionPrompt.ps1','tools/Setup-Project.ps1','tools/Initialize-LocalEnv.ps1',
  '01-INSTALL-TOOLS.cmd','02-SETUP-PROJECT.cmd','03-CHECK-PACKAGE.cmd','04-COPY-NEXT-PROMPT.cmd','05-START-CLAUDE.cmd','06-CREATE-LOCAL-ENV.cmd'
];
for (const relative of required) assert.ok(fs.existsSync(path.join(root, relative)), `Missing required file: ${relative}`);

const prompts = fs.readdirSync(path.join(root,'prompts')).filter(n => /^\d{2}-.*\.md$/.test(n)).sort();
assert.equal(prompts.length, 18, 'Expected 18 main TC prompts (00-17).');
for (let i=0;i<18;i++) {
  assert.ok(prompts[i].startsWith(String(i).padStart(2,'0')+'-'), `Prompt order mismatch at ${i}`);
  const text=fs.readFileSync(path.join(root,'prompts',prompts[i]),'utf8');
  assert.match(text,/```text\s*\r?\n[\s\S]+?\r?\n```/,`Main prompt is not copyable: ${prompts[i]}`);
}
const sliceDir=path.join(root,'prompts','slices');
const slices=fs.readdirSync(sliceDir).filter(n => /^(08|10|11)[a-c]-.*\.md$/.test(n)).sort();
assert.equal(slices.length,9,'Expected 9 prompt slices.');
for (const name of slices) {
  const text=fs.readFileSync(path.join(sliceDir,name),'utf8').trim();
  assert.ok(text.length>200,`Slice is incomplete: ${name}`);
  assert.match(text,/^# TC-/m,`Slice lacks TC heading: ${name}`);
}
const status=fs.readFileSync(path.join(root,'PROJECT_STATUS.md'),'utf8');
for (const parent of ['08','10','11']) {
  assert.doesNotMatch(status,new RegExp(`^- \\[ \\] TC-${parent}$`,'m'));
  for (const suffix of ['a','b','c']) assert.match(status,new RegExp(`^- \\[ \\] TC-${parent}${suffix}$`,'m'));
}
const copyTool=fs.readFileSync(path.join(root,'tools','Copy-TableCompanionPrompt.ps1'),'utf8');
assert.match(copyTool,/Get-Content \$statusPath -Raw -Encoding UTF8/);
assert.match(copyTool,/Get-Content \$files\[0\]\.FullName -Raw -Encoding UTF8/);
assert.match(copyTool,/\(\?:\[a-c\]\)\?/);
assert.match(copyTool,/elseif \(\$isSlice\)/);
const setupTool=fs.readFileSync(path.join(root,'tools','Setup-Project.ps1'),'utf8');
assert.match(setupTool,/baseline Table Companion runner starter/);
assert.match(setupTool,/bundle/);
const mcp=JSON.parse(fs.readFileSync(path.join(root,'.mcp.json'),'utf8'));
assert.equal(mcp.mcpServers.claude_design.url,'https://api.anthropic.com/v1/design/mcp');
const design=fs.readFileSync(path.join(root,'DESIGN_SOURCE.md'),'utf8');
assert.match(design,/406209e5-597a-4335-a60f-0d1acae9251c/);
assert.match(design,/Table Companion Phase 1 - Part 4\.dc\.html/);
const attrs=fs.readFileSync(path.join(root,'.gitattributes'),'utf8');
for (const rule of ['*.yml text eol=lf','*.yaml text eol=lf','Dockerfile text eol=lf','*entrypoint* text eol=lf']) assert.ok(attrs.includes(rule),`Missing .gitattributes rule: ${rule}`);
console.log('Package validation passed: Table Companion source docs, claude_design MCP, 18 prompts, 9 slices, Windows wrappers, UTF-8 copy flow, and recovery baseline configuration.');
