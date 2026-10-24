param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\assets\sfx\radio')
)

$ErrorActionPreference = 'Stop'
python (Join-Path $PSScriptRoot 'generate_radio_sfx.py') --output $OutputDir
if ($LASTEXITCODE -ne 0) { throw "Radio voice generation failed ($LASTEXITCODE)." }
