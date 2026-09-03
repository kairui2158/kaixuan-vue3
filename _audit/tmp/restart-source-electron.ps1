$ErrorActionPreference = 'Stop'

$oldProcesses = Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*remote-debugging-port=9227*' }

foreach ($process in $oldProcesses) {
  Stop-Process -Id $process.ProcessId -Force
}

Start-Sleep -Milliseconds 800

Start-Process -FilePath 'D:\codex\novel-workshop-vue3\node_modules\electron\dist\electron.exe' `
  -ArgumentList @('.', '--remote-debugging-port=9227') `
  -WorkingDirectory 'D:\codex\novel-workshop-vue3'

Start-Sleep -Seconds 8
$response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:9227/json/version'
$response.Content
