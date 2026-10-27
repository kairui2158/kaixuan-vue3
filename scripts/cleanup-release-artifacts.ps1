$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath '.').Path
$dist = Join-Path $workspace 'dist'
$obsolete = @(
  (Join-Path $dist '神意助手-Setup-3.108.1.exe'),
  (Join-Path $dist '神意助手-Setup-3.108.1.exe.blockmap')
)

foreach ($target in $obsolete) {
  if (-not (Test-Path -LiteralPath $target)) {
    throw "Expected old release artifact is missing: $target"
  }
  $resolved = (Resolve-Path -LiteralPath $target).Path
  if (-not $resolved.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete outside dist: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Force
}

Get-ChildItem -LiteralPath $dist -Force |
  Where-Object { $_.Name -match 'Setup|blockmap' } |
  Select-Object Name,Length |
  Format-Table -AutoSize
