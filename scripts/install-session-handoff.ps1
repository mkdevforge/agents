[CmdletBinding()]
param()

$source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\plugins\session-handoff\skills\session-handoff")).Path
$skillsRoot = Join-Path $HOME ".claude\skills"
$target = Join-Path $skillsRoot "session-handoff"

New-Item -ItemType Directory -Path $skillsRoot -Force | Out-Null

if (Test-Path -LiteralPath $target) {
    $existing = Get-Item -LiteralPath $target -Force
    $resolvedTarget = if ($existing.LinkType) { [string]$existing.Target } else { $existing.FullName }
    if ([System.IO.Path]::GetFullPath($resolvedTarget) -eq [System.IO.Path]::GetFullPath($source)) {
        Write-Output "The /session-handoff skill already points to $source"
        exit 0
    }
    throw "Refusing to replace the existing path: $target"
}

New-Item -ItemType Junction -Path $target -Target $source | Out-Null
Write-Output "Installed /session-handoff from $source"
