param(
  [Parameter(Mandatory = $true)]
  [string]$DataDir
)

$resolved = (Resolve-Path -LiteralPath $DataDir).Path
$expectedRoot = (Resolve-Path -LiteralPath (Join-Path $env:USERPROFILE 'Documents')).Path
if (-not $resolved.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing cleanup outside app data directory: $resolved"
}

$backup = Join-Path $resolved 'wa_providers.provider_rootfix.bak'
$providers = Join-Path $resolved 'wa_providers.json'
if (-not (Test-Path -LiteralPath $backup)) {
  throw "Real provider backup not found: $backup"
}
Copy-Item -LiteralPath $backup -Destination $providers -Force

foreach ($name in @('wa_lastProjectId.json', 'wa_lastProjectId.json.bak', 'wa_providers.json.bak')) {
  $path = Join-Path $resolved $name
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
  }
}

Get-ChildItem -LiteralPath $resolved -Filter 'wa_*api-direct-write*' -File |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

$remaining = @(Get-ChildItem -LiteralPath $resolved -Filter 'wa_*api-direct-write*' -File)
if ($remaining.Count -ne 0) {
  throw "Cleanup incomplete: $($remaining.Count) files remain"
}

Write-Output 'API_DIRECT_WRITE_USER_DATA_CLEANED'
