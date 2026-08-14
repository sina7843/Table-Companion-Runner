[CmdletBinding()]
param(
    [ValidatePattern('^\d{1,2}[a-c]?$')]
    [string]$Id
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Find-NextId {
    $statusPath = Join-Path $Root 'PROJECT_STATUS.md'
    $status = Get-Content $statusPath -Raw -Encoding UTF8
    $match = [regex]::Match($status, '(?m)^- \[ \] TC-(\d{2}(?:[a-c])?)\s*$')
    if (-not $match.Success) { throw 'No unchecked TC prompt or slice was found in PROJECT_STATUS.md.' }
    return $match.Groups[1].Value
}

if (-not $Id) { $Id = Find-NextId }
if ($Id.ToLower() -notmatch '^(\d{1,2})([a-c]?)$') { throw "Unsupported prompt ID: $Id" }
$normalized = $Matches[1].PadLeft(2, '0') + $Matches[2]

$isSlice = $normalized -match '^(08|10|11)[a-c]$'
if ($isSlice) {
    $pattern = "prompts\slices\$normalized-*.md"
} elseif ($normalized -match '^[0-9]{2}$') {
    if ($normalized -match '^(08|10|11)$') {
        throw "TC-$normalized is split into slices. Copy $($normalized)a, then b, then c; do not execute the parent prompt."
    }
    $pattern = "prompts\$normalized-*.md"
} else {
    throw "Unsupported prompt ID: $Id"
}

$files = @(Get-ChildItem -Path (Join-Path $Root $pattern) -File)
if ($files.Count -ne 1) {
    throw "Expected exactly one prompt file for '$Id', found $($files.Count)."
}

$content = Get-Content $files[0].FullName -Raw -Encoding UTF8
$match = [regex]::Match($content, '(?s)```text\s*\r?\n(.*?)\r?\n```')
if ($match.Success) {
    $prompt = $match.Groups[1].Value.Trim()
} elseif ($isSlice) {
    $prompt = $content.Trim()
} else {
    throw "No fenced text prompt found in $($files[0].Name)."
}

Set-Clipboard -Value $prompt
$copyPath = Join-Path $Root '.table-companion-current-prompt.txt'
[System.IO.File]::WriteAllText($copyPath, $prompt + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

Write-Host "Copied to clipboard: $($files[0].Name)" -ForegroundColor Green
Write-Host "Backup copy: $copyPath"
Write-Host 'Paste it into Claude Code. Execute only one TC prompt or one slice at a time.'
