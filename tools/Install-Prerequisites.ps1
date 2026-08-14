[CmdletBinding()]
param(
    [switch]$IncludeVSCode,
    [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WingetPackage([string]$Id, [string]$Label) {
    Write-Host "Installing $Label ($Id)..." -ForegroundColor Cyan
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed while installing $Label."
    }
}

if (-not (Test-Command 'winget')) {
    throw 'WinGet is not available. Install or update App Installer from Microsoft Store, then run this script again.'
}

$packages = @()
if (-not (Test-Command 'git')) { $packages += @{ Id = 'Git.Git'; Label = 'Git for Windows' } }
if (-not (Test-Command 'node')) { $packages += @{ Id = 'OpenJS.NodeJS.LTS'; Label = 'Node.js LTS' } }
if (-not (Test-Command 'claude')) { $packages += @{ Id = 'Anthropic.ClaudeCode'; Label = 'Claude Code' } }
if (-not $SkipDocker) {
    $dockerFound = (Test-Command 'docker') -or (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe")
    if (-not $dockerFound) { $packages += @{ Id = 'Docker.DockerDesktop'; Label = 'Docker Desktop' } }
}
if ($IncludeVSCode -and -not (Test-Command 'code')) {
    $packages += @{ Id = 'Microsoft.VisualStudioCode'; Label = 'Visual Studio Code' }
}

if ($packages.Count -eq 0) {
    Write-Host 'All requested tools are already available.' -ForegroundColor Green
    exit 0
}

Write-Host 'The following tools will be installed:' -ForegroundColor Yellow
$packages | ForEach-Object { Write-Host " - $($_.Label)" }
$answer = Read-Host 'Continue? [Y/N]'
if ($answer -notmatch '^(y|yes)$') {
    Write-Host 'Cancelled.'
    exit 1
}

foreach ($package in $packages) {
    Install-WingetPackage -Id $package.Id -Label $package.Label
}

Write-Host ''
Write-Host 'Installation finished. Close and reopen this terminal before running 02-SETUP-PROJECT.cmd.' -ForegroundColor Green
