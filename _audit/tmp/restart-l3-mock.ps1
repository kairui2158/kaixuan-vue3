$ErrorActionPreference = 'Stop'

$existing = Get-NetTCPConnection -LocalPort 19098 -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $existing) {
  Stop-Process -Id $connection.OwningProcess -Force
}
Start-Sleep -Milliseconds 300
Start-Process -FilePath 'node.exe' `
  -ArgumentList '_audit\tmp\l3-mock-server.cjs' `
  -WorkingDirectory 'D:\codex\novel-workshop-vue3' `
  -WindowStyle Hidden
Start-Sleep -Seconds 1
$response = Invoke-RestMethod -Uri 'http://127.0.0.1:19098/health'
"L3_MOCK_RESTARTED phase=$($response.phase)"
