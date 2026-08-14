[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    throw 'Claude Code is not installed or is not in PATH. Run 01-INSTALL-TOOLS.cmd and reopen the terminal.'
}

Write-Host "Project: $Root" -ForegroundColor Cyan
& claude --version
if ($LASTEXITCODE -ne 0) { throw 'Claude Code version check failed.' }
Write-Host 'Starting Claude Code. Paste the prompt copied by 04-COPY-NEXT-PROMPT.cmd.' -ForegroundColor Green
Write-Host 'If claude_design asks for authentication, run /design-login inside Claude Code, then continue the same prompt.' -ForegroundColor Yellow
& claude
exit $LASTEXITCODE
