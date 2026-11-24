# Starts the LED-01 device simulator against the local dev broker on localhost:1883: the own broker
# (npm run dev:broker; LED-01 must exist in table MqttAccount, see infra/dev/mosquitto/README.md)
# or the old Mosquitto container (infra/dev/docker-compose.yml).
# The LED-01 broker password is read from infra/dev/.dev-credentials.local (git-ignored) and passed
# through an environment variable; it is never printed or put on the command line.
# Works from cmd.exe and PowerShell. Extra simulator options are passed through as-is.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\run-sim.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\run-sim.ps1 --ignore-commands
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\run-sim.ps1 --fail-rate 0.3
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\run-sim.ps1 --latency 3000
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\run-sim.ps1 -NoInteractive
param([switch]$NoInteractive)
$ErrorActionPreference = 'Stop'
# Options this script does not know (for example --ignore-commands) arrive in $args.
$extra = @($args)

$creds = Join-Path $PSScriptRoot '.dev-credentials.local'
if (-not (Test-Path $creds)) { throw "Missing $creds (see infra/dev/mosquitto/README.md)" }
$line = Get-Content $creds | Where-Object { $_ -match '^MQTT_LED01_PASSWORD=' } | Select-Object -First 1
if (-not $line) { throw "MQTT_LED01_PASSWORD not found in $creds" }
$env:SIM_PASSWORD = ($line -split '=', 2)[1].Trim()

Set-Location (Join-Path $PSScriptRoot '..\..')
$simArgs = @('run', 'sim', '--', '--url', 'mqtt://localhost:1883', '--device', 'LED-01',
  '--username', 'LED-01', '--password-env', 'SIM_PASSWORD')
if (-not $NoInteractive) { $simArgs += '--interactive' }
$simArgs += $extra
if ($extra.Count -gt 0) { Write-Host "simulator options: $($extra -join ' ')" }
npm @simArgs
