$ErrorActionPreference = 'Stop'
$root = 'D:\codex\novel-workshop-vue3'
$exe = Join-Path $root 'node_modules\electron\dist\electron.exe'

# Kill any previous instance for this project so CDP port is clean.
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*novel-workshop-vue3*' } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output ("killed pid={0}" -f $_.ProcessId)
  }

Start-Sleep -Milliseconds 800

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Error "Electron executable not found: $exe"
}

$args = @(
  '--remote-debugging-port=9227',
  '--remote-allow-origins=*',
  $root
)

$p = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $root -PassThru -WindowStyle Hidden
Write-Output ("launched pid={0}" -f $p.Id)

# Wait for CDP endpoint.
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9227/json/version' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
}

if (-not $ready) {
  Write-Error 'CDP endpoint did not become ready on port 9227'
}

Write-Output 'cdp ready'
