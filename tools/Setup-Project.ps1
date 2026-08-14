[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command([string]$Name, [string]$Help) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is not available. $Help"
    }
}

function Run-Git([string[]]$Arguments, [string]$FailureMessage) {
    & git @Arguments
    if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

Require-Command 'node' 'Run 01-INSTALL-TOOLS.cmd, reopen the terminal, and retry.'
Require-Command 'git' 'Run 01-INSTALL-TOOLS.cmd, reopen the terminal, and retry.'
Require-Command 'claude' 'Run 01-INSTALL-TOOLS.cmd, reopen the terminal, and retry.'

$required = @(
    '.claude\settings.json',
    '.claude\hooks\validate-command.mjs',
    '.claude\hooks\protect-files.mjs',
    'CLAUDE.md',
    'Requirements.md',
    'IMPLEMENTATION_DECISIONS.md',
    'PROJECT_STATUS.md',
    'DESIGN_SOURCE.md',
    '.mcp.json',
    'prompts\00-foundation-design-import-and-repository-audit.md',
    '01-INSTALL-TOOLS.cmd',
    '02-SETUP-PROJECT.cmd',
    '03-CHECK-PACKAGE.cmd',
    '04-COPY-NEXT-PROMPT.cmd',
    '05-START-CLAUDE.cmd',
    '06-CREATE-LOCAL-ENV.cmd'
)
foreach ($item in $required) {
    if (-not (Test-Path (Join-Path $Root $item))) {
        throw "Required file is missing: $item"
    }
}

if (-not (Test-Path (Join-Path $Root '.git'))) {
    Write-Host 'Initializing a local Git repository...' -ForegroundColor Cyan
    Run-Git @('init') 'git init failed.'
}

$gitBashCandidates = @(@(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "$env:LocalAppData\Programs\Git\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path $_) })

$localSettingsPath = Join-Path $Root '.claude\settings.local.json'
if ($gitBashCandidates.Count -gt 0) {
    $gitBashPath = [string]$gitBashCandidates[0]
    $localSettings = @{
        env = @{
            CLAUDE_CODE_GIT_BASH_PATH = $gitBashPath
        }
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($localSettingsPath, $localSettings + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Configured Git Bash: $gitBashPath" -ForegroundColor Green
} else {
    Write-Warning 'Git Bash was not found at a standard path. Reinstall Git for Windows or set CLAUDE_CODE_GIT_BASH_PATH manually.'
}

# Warn about user-level hooks. Project setup does not mutate user-global Claude settings.
$userClaudeSettings = Join-Path $HOME '.claude\settings.json'
if (Test-Path $userClaudeSettings) {
    try {
        $userSettingsRaw = Get-Content $userClaudeSettings -Raw -Encoding UTF8
        if ($userSettingsRaw -match '"Stop"\s*:') {
            Write-Warning "A user-level Claude Stop hook exists at $userClaudeSettings. It is outside this project and may still run. Review or disable it manually if it causes unexpected behavior."
        }
    } catch {
        Write-Warning "Could not inspect user-level Claude settings: $($_.Exception.Message)"
    }
}

# Warn about common local resource conflicts without blocking setup.

try {
    $systemDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
    if ($systemDrive) {
        $freeGb = [math]::Round($systemDrive.FreeSpace / 1GB, 1)
        if ($freeGb -lt 25) {
            Write-Warning "Only $freeGb GB is free on $env:SystemDrive. Docker Desktop normally stores images and volumes there; consider moving Docker data to a drive with more space."
        }
    }
} catch {}

Write-Host 'Running package validation...' -ForegroundColor Cyan
& node '.claude\tests\guardrails.test.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Claude guardrail tests failed.' }

& node 'tools\validate-package.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Package validation failed.' }

# Establish a recoverable baseline before Claude is allowed to scaffold the workspace.
$commitCountText = [string](& git rev-list --all --count 2>$null)
$commitCount = 0
if (-not [string]::IsNullOrWhiteSpace($commitCountText)) {
    [void][int]::TryParse($commitCountText.Trim(), [ref]$commitCount)
}

if ($commitCount -eq 0) {
    Write-Host 'Creating the mandatory baseline commit...' -ForegroundColor Cyan
    Run-Git @('branch', '-M', 'main') 'Could not set the initial branch to main.'

    $localName = [string](& git config --local user.name)
    if ([string]::IsNullOrWhiteSpace($localName)) {
        $safeName = if ($env:USERNAME) { $env:USERNAME } else { 'Table Companion Developer' }
        Run-Git @('config', '--local', 'user.name', $safeName) 'Could not set the local Git user name.'
        Write-Warning "Git user.name was missing. Set a repository-local value: $safeName"
    }

    $localEmail = [string](& git config --local user.email)
    if ([string]::IsNullOrWhiteSpace($localEmail)) {
        $safeUser = if ($env:USERNAME) { $env:USERNAME.ToLowerInvariant() } else { 'table-companion-developer' }
        $safeEmail = "$safeUser@local.invalid"
        Run-Git @('config', '--local', 'user.email', $safeEmail) 'Could not set the local Git email.'
        Write-Warning "Git user.email was missing. Set a repository-local placeholder: $safeEmail"
    }

    Run-Git @('add', '-A') 'git add failed while creating the baseline.'
    Run-Git @('commit', '-m', 'chore: baseline Table Companion runner starter') 'Baseline commit failed. Do not run TC-00 until this succeeds.'

    $backupDir = Join-Path $Root '.table-companion-backups'
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $bundlePath = Join-Path $backupDir 'baseline.bundle'
    Run-Git @('bundle', 'create', $bundlePath, '--all') 'Could not create the baseline Git bundle.'
    $hash = Get-FileHash -Algorithm SHA256 -Path $bundlePath
    [System.IO.File]::WriteAllText("$bundlePath.sha256", "$($hash.Hash.ToLowerInvariant())  baseline.bundle`r`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host "Recovery bundle created: $bundlePath" -ForegroundColor Green
} else {
    $currentBranch = [string](& git branch --show-current)
    if ($currentBranch.Trim() -ne 'main') {
        Write-Warning "Current branch is '$($currentBranch.Trim())', not 'main'. Keep it only if intentional."
    }
    $dirty = [string](& git status --porcelain)
    if (-not [string]::IsNullOrWhiteSpace($dirty)) {
        Write-Warning 'The repository already has commits but also has uncommitted changes. Commit or stash them before TC-00.'
    }
}

$finalCommitCount = [string](& git rev-list --all --count)
if ([string]::IsNullOrWhiteSpace($finalCommitCount) -or [int]$finalCommitCount.Trim() -lt 1) {
    throw 'No recoverable Git commit exists. TC-00 remains blocked.'
}

$remoteText = [string](& git remote -v)
if ([string]::IsNullOrWhiteSpace($remoteText)) {
    Write-Warning 'No Git remote is configured. The baseline commit and local bundle provide recovery, but adding a private remote is strongly recommended.'
}

Write-Host ''
Write-Host 'Setup completed with a recoverable Git baseline.' -ForegroundColor Green
Write-Host 'Next: run 03-CHECK-PACKAGE.cmd. Then copy TC-00 with 04-COPY-NEXT-PROMPT.cmd and start Claude with 05-START-CLAUDE.cmd.'
