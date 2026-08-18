$ErrorActionPreference = 'SilentlyContinue'
$electronPath = 'D:\codex\novel-workshop-vue3\node_modules\electron\dist\electron.exe'
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electronPath } | Stop-Process -Force
Start-Sleep -Seconds 1
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  $conn = Get-NetTCPConnection -LocalPort 9227 -ErrorAction SilentlyContinue
  if (-not $conn) { break }
  Start-Sleep -Milliseconds 500
}
Start-Process cmd.exe -ArgumentList '/c', 'D:\codex\novel-workshop-vue3\start-electron.bat' -WindowStyle Hidden | Out-Null
Start-Sleep -Seconds 9
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | Where-Object {
  $matches = $false
  try { $matches = $_.CommandLine -like '*start-electron.bat*' } catch { $matches = $false }
  $matches
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$conn = Get-NetTCPConnection -LocalPort 9227 -ErrorAction SilentlyContinue
if ($conn) {
  Write-Output ('PORT_OK pid=' + ($conn.OwningProcess -join ','))
} else {
  Write-Output 'PORT_MISSING'
}
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electronPath } | Select-Object Id, Path
