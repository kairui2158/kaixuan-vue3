$ErrorActionPreference = "Stop"

$distPath = Join-Path (Get-Location) "dist"
$currentVersion = "3.129.0"
$pattern = [char]0x795E + [string][char]0x610F + [string][char]0x52A9 + [string][char]0x624B + "-Setup-"
$candidates = Get-ChildItem -LiteralPath $distPath -File |
    Where-Object { $_.Name.StartsWith($pattern) -and $_.Name -like "*.exe" -and $_.Name -notlike "*-$currentVersion.exe" } |
    Sort-Object Name

foreach ($candidate in $candidates) {
    $exePath = $candidate.FullName
    $blockmapPath = "$exePath.blockmap"
    $resolved = (Resolve-Path -LiteralPath $exePath).Path
    if (-not $resolved.StartsWith($distPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove outside dist: $resolved"
    }
    Remove-Item -LiteralPath $exePath -Force
    if (Test-Path -LiteralPath $blockmapPath) {
        $resolvedBlockmap = (Resolve-Path -LiteralPath $blockmapPath).Path
        if (-not $resolvedBlockmap.StartsWith($distPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove outside dist: $resolvedBlockmap"
        }
        Remove-Item -LiteralPath $blockmapPath -Force
    }
    Write-Output "removed=$exePath"
}

Write-Output "remaining-installers="
Get-ChildItem -LiteralPath $distPath -File |
    Where-Object { $_.Name.StartsWith($pattern) } |
    ForEach-Object { Write-Output $_.Name }

