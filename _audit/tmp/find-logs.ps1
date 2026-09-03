$base = Get-ChildItem -Path (Join-Path $env:APPDATA 'shenyi*') -Directory -ErrorAction SilentlyContinue
if ($base) {
  $logDir = Join-Path $base.FullName 'logs'
  Get-ChildItem $logDir -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, Length, LastWriteTime | Format-Table -AutoSize
  $latest = Get-ChildItem $logDir -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) { Get-Content $latest.FullName -Tail 30 }
} else {
  Write-Output 'No shenyi appdata found'
}
