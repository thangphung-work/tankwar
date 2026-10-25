# Cloudflare ingress for tankwar.online expects this fixed production port.
# Run hidden at user logon; keep the production server alive independently of dev.
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serverFile = Join-Path $projectRoot 'server.js'
$nodeBinary = (Get-Command node.exe -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot 'logs'
$null = New-Item -ItemType Directory -Path $logDirectory -Force
$serverMutex = New-Object System.Threading.Mutex($false, 'Local\TankwarPublic8080')
if (-not $serverMutex.WaitOne(0)) { $serverMutex.Dispose(); exit 0 }
try {
  $env:PORT = '8080'
  $env:NO_BROWSER = '1'
  $env:NODE_ENV = 'production'
  while ($true) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      # Another copy already owns the port. Never stop or replace that process.
      Start-Sleep -Seconds 10
      continue
    }
    $serverProcess = Start-Process -FilePath $nodeBinary -ArgumentList @('"' + $serverFile + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'public-server.log') -RedirectStandardError (Join-Path $logDirectory 'public-server.error.log')
    Wait-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
  }
} finally {
  $serverMutex.ReleaseMutex()
  $serverMutex.Dispose()
}
