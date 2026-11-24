<#
.SYNOPSIS
  Checks whether a device can connect to the MQTT broker with its login, and says why not.

.DESCRIPTION
  Runs three checks, like a real device would:
    1. Network : can this computer reach host:port at all (TCP)?
    2. Login   : does the broker accept the username, password and client ID (MQTT CONNECT)?
    3. Topics  : may this login subscribe to its own command topic (MQTT SUBSCRIBE)?
  Prints CONNECTED or NOT CONNECTED with a hint, and exits with code 0 or 1.

  Self-contained: needs only Windows PowerShell 5.1 or PowerShell 7 (no Node, no Docker),
  so you can copy it to any PC on the device's network. Supports TLS (mqtts:// or port 8883).

  Anything you do not pass on the command line is asked for. The password is read hidden
  and never printed. Defaults come from MQTT_DEVICE_URL in apps/api/.env when present.

  Note: the broker allows one connection per client ID. If the real device is online, this
  test briefly disconnects it (it reconnects by itself).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\check-mqtt.ps1
  (asks for everything)

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\check-mqtt.ps1 -Url mqtt://10.37.122.35:1883 -DeviceId LED-02

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\check-mqtt.ps1 -Url mqtts://mqtt.example.org:8883 -DeviceId LED-02
#>
param(
  # Broker address, e.g. mqtt://10.37.122.35:1883 or mqtts://mqtt.example.org:8883
  [string]$Url,
  # Device ID. Used as username and client ID unless you give those separately.
  [string]$DeviceId,
  [string]$Username,
  [string]$ClientId,
  # Topic segment of the device type: led, humidifier, steam, environment
  [string]$TypeSegment = 'led',
  # Seconds to wait for each step
  [int]$TimeoutSeconds = 5,
  # Accept any TLS certificate (only for self-signed test brokers)
  [switch]$SkipCertificateCheck,
  # Only test network + login, not the topic permission
  [switch]$SkipTopicCheck
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- output helpers
function Write-Step([string]$text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }
function Write-Ok([string]$text) { Write-Host ('  [OK]   ' + $text) -ForegroundColor Green }
function Write-Bad([string]$text) { Write-Host ('  [FAIL] ' + $text) -ForegroundColor Red }
function Write-Info([string]$text) { Write-Host ('         ' + $text) -ForegroundColor Gray }

function Stop-WithResult([bool]$connected, [string]$reason, [string[]]$hints) {
  Write-Host ''
  if ($connected) {
    Write-Host '==> CONNECTED: the device can use this broker and login.' -ForegroundColor Green
    exit 0
  }
  Write-Host ('==> NOT CONNECTED: ' + $reason) -ForegroundColor Red
  foreach ($h in $hints) { Write-Host ('    - ' + $h) -ForegroundColor Yellow }
  exit 1
}

function Read-Value([string]$prompt, [string]$default) {
  if ($default) { $answer = Read-Host ($prompt + ' [' + $default + ']') } else { $answer = Read-Host $prompt }
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer.Trim()
}

# ---------------------------------------------------------------- defaults
function Get-DefaultUrl {
  $envFile = Join-Path $PSScriptRoot '..\..\apps\api\.env'
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^MQTT_DEVICE_URL=' } | Select-Object -First 1
    if ($line) {
      $value = ($line -split '=', 2)[1].Trim().Trim('"')
      if ($value) { return $value }
    }
  }
  $cfg = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1
  if ($cfg) { return 'mqtt://' + $cfg.IPv4Address.IPAddress + ':1883' }
  return 'mqtt://localhost:1883'
}

# ---------------------------------------------------------------- inputs
if (-not $Url) { $Url = Read-Value 'Broker address (mqtt://host:port or mqtts://host:8883)' (Get-DefaultUrl) }
if ($Url -notmatch '^[a-z]+://') { $Url = 'mqtt://' + $Url }
try { $uri = [Uri]$Url } catch { Stop-WithResult $false ('"' + $Url + '" is not a valid address.') @('Use the form mqtt://10.37.122.35:1883') }
$brokerHost = $uri.Host
$port = $uri.Port
$useTls = ($uri.Scheme -eq 'mqtts' -or $uri.Scheme -eq 'ssl' -or $port -eq 8883)
if ($port -le 0) { if ($useTls) { $port = 8883 } else { $port = 1883 } }

if (-not $DeviceId) { $DeviceId = Read-Value 'Device ID (e.g. LED-02)' '' }
if (-not $DeviceId) { Stop-WithResult $false 'No device ID given.' @('Run again and enter the device ID shown in the web app.') }
if (-not $Username) { $Username = $DeviceId }
if (-not $ClientId) { $ClientId = $DeviceId }

if ($env:MQTT_TEST_PASSWORD) {
  $password = $env:MQTT_TEST_PASSWORD
} else {
  $secure = Read-Host ('Password for ' + $Username) -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$timeoutMs = [Math]::Max(1, $TimeoutSeconds) * 1000
$commandTopic = 'cimcms/' + $TypeSegment + '/' + $DeviceId + '/command'

$tlsText = 'no'
if ($useTls) { $tlsText = 'yes' }
Write-Host ''
Write-Host 'MQTT connection check' -ForegroundColor White
Write-Info ('Broker    : ' + $brokerHost + ':' + $port + '  (TLS: ' + $tlsText + ')')
Write-Info ('Username  : ' + $Username)
Write-Info ('Client ID : ' + $ClientId)

# ---------------------------------------------------------------- MQTT 3.1.1 encoding
function Get-Utf8Field([string]$text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $out = New-Object 'System.Collections.Generic.List[byte]'
  $out.Add([byte](($bytes.Length -shr 8) -band 0xFF))
  $out.Add([byte]($bytes.Length -band 0xFF))
  $out.AddRange([byte[]]$bytes)
  return ,$out.ToArray()
}

function Get-RemainingLength([int]$length) {
  $out = New-Object 'System.Collections.Generic.List[byte]'
  do {
    $digit = $length % 128
    $length = [Math]::Floor($length / 128)
    if ($length -gt 0) { $digit = $digit -bor 0x80 }
    $out.Add([byte]$digit)
  } while ($length -gt 0)
  return ,$out.ToArray()
}

function New-Packet([byte]$firstByte, [byte[]]$body) {
  $out = New-Object 'System.Collections.Generic.List[byte]'
  $out.Add($firstByte)
  $out.AddRange([byte[]](Get-RemainingLength $body.Length))
  $out.AddRange($body)
  return ,$out.ToArray()
}

function Read-Exact($stream, [int]$count) {
  $buffer = New-Object byte[] $count
  $read = 0
  while ($read -lt $count) {
    $n = $stream.Read($buffer, $read, $count - $read)
    if ($n -le 0) { throw 'connection closed by the broker' }
    $read += $n
  }
  return ,$buffer
}

function Read-Packet($stream) {
  $first = (Read-Exact $stream 1)[0]
  $multiplier = 1
  $length = 0
  do {
    $digit = (Read-Exact $stream 1)[0]
    $length += ($digit -band 127) * $multiplier
    $multiplier *= 128
  } while (($digit -band 128) -ne 0)
  $body = New-Object byte[] 0
  if ($length -gt 0) { $body = Read-Exact $stream $length }
  return @{ Type = ($first -shr 4); Body = $body }
}

# ---------------------------------------------------------------- 1. network
Write-Step '1. Network: can this computer reach the broker?'
$tcp = New-Object Net.Sockets.TcpClient
try {
  $async = $tcp.BeginConnect($brokerHost, $port, $null, $null)
  if (-not $async.AsyncWaitHandle.WaitOne($timeoutMs)) { throw 'timed out' }
  $tcp.EndConnect($async)
  Write-Ok ('Reached ' + $brokerHost + ':' + $port)
} catch {
  $msg = $_.Exception.Message
  if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
  Write-Bad ('Cannot reach ' + $brokerHost + ':' + $port + ' (' + $msg + ')')
  $tcp.Close()
  Stop-WithResult $false 'the broker is not reachable on the network.' @(
    'Is the broker running? On the PC with Docker: npm run dev:infra',
    'Is the address still right? The PC address can change: (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway }).IPv4Address.IPAddress',
    'Windows Firewall on the broker PC must allow inbound TCP 1883 (see the firewall rule in the project notes).',
    'The device and the broker PC must be on the same network.'
  )
}

$stream = $tcp.GetStream()
$stream.ReadTimeout = $timeoutMs
$stream.WriteTimeout = $timeoutMs
if ($useTls) {
  try {
    if ($SkipCertificateCheck) {
      $callback = [Net.Security.RemoteCertificateValidationCallback] { param($s, $c, $ch, $e) $true }
      $ssl = New-Object Net.Security.SslStream($stream, $false, $callback)
    } else {
      $ssl = New-Object Net.Security.SslStream($stream, $false)
    }
    $ssl.ReadTimeout = $timeoutMs
    $ssl.WriteTimeout = $timeoutMs
    $ssl.AuthenticateAsClient($brokerHost)
    $stream = $ssl
    Write-Ok 'TLS handshake done, certificate accepted'
  } catch {
    $msg = $_.Exception.Message
    if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
    Write-Bad ('TLS failed: ' + $msg)
    $tcp.Close()
    Stop-WithResult $false 'the TLS connection failed.' @(
      'Use the host name that is in the certificate (not the IP address).',
      'Port 8883 is TLS, port 1883 is plain MQTT: check the address scheme (mqtts:// vs mqtt://).',
      'For a self-signed test broker only, add -SkipCertificateCheck.'
    )
  }
}

# ---------------------------------------------------------------- 2. login
Write-Step '2. Login: does the broker accept this username, password and client ID?'
$body = New-Object 'System.Collections.Generic.List[byte]'
$body.AddRange([byte[]](Get-Utf8Field 'MQTT'))
$body.Add([byte]4)                       # protocol level 4 = MQTT 3.1.1
$body.Add([byte](0x80 -bor 0x40 -bor 0x02)) # username + password + clean session
$body.Add([byte]0); $body.Add([byte]30)  # keep alive 30 s
$body.AddRange([byte[]](Get-Utf8Field $ClientId))
$body.AddRange([byte[]](Get-Utf8Field $Username))
$body.AddRange([byte[]](Get-Utf8Field $password))
$password = $null

$connackCodes = @{
  1 = 'the broker does not support MQTT 3.1.1';
  2 = 'the client ID was rejected';
  3 = 'the broker is not available right now';
  4 = 'wrong username or password';
  5 = 'not authorised (wrong password, unknown user, or the client ID does not match the device ID)'
}

try {
  $packet = New-Packet 0x10 $body.ToArray()
  $stream.Write($packet, 0, $packet.Length)
  $stream.Flush()
  $reply = Read-Packet $stream
} catch {
  Write-Bad ('No answer to the login: ' + $_.Exception.Message)
  $tcp.Close()
  Stop-WithResult $false 'the broker did not answer the login.' @(
    'Something else may be listening on this port, or TLS is required (try mqtts:// and port 8883).'
  )
}

if ($reply.Type -ne 2 -or $reply.Body.Length -lt 2) {
  $tcp.Close()
  Stop-WithResult $false ('unexpected reply from the broker (packet type ' + $reply.Type + ').') @('Is this really an MQTT broker?')
}
$code = [int]$reply.Body[1]
if ($code -ne 0) {
  $reason = $connackCodes[$code]
  if (-not $reason) { $reason = 'refused with code ' + $code }
  Write-Bad ('Login refused: ' + $reason)
  $tcp.Close()
  Stop-WithResult $false ('login refused: ' + $reason + '.') @(
    'Copy the password again from the Add device dialog, or use Reset password on the device page.',
    'Username and client ID must both be exactly the device ID (case matters).',
    'Was the device deleted or its password reset since you copied it?'
  )
}
Write-Ok 'Login accepted'

# ---------------------------------------------------------------- 3. topics
if (-not $SkipTopicCheck) {
  Write-Step ('3. Topics: may this login subscribe to ' + $commandTopic + '?')
  $sub = New-Object 'System.Collections.Generic.List[byte]'
  $sub.Add([byte]0); $sub.Add([byte]1)   # packet id 1
  $sub.AddRange([byte[]](Get-Utf8Field $commandTopic))
  $sub.Add([byte]1)                      # QoS 1
  try {
    $packet = New-Packet 0x82 $sub.ToArray()
    $stream.Write($packet, 0, $packet.Length)
    $stream.Flush()
    $suback = Read-Packet $stream
    while ($suback.Type -ne 9) { $suback = Read-Packet $stream } # skip anything that is not SUBACK
    $granted = [int]$suback.Body[$suback.Body.Length - 1]
  } catch {
    $granted = 128
  }
  if ($granted -ge 128) {
    Write-Bad 'Subscribe refused: this login may not use the device topics'
    $tcp.Close()
    Stop-WithResult $false ('logged in, but not allowed to use ' + $commandTopic + '.') @(
      'Check the device ID and the device type (-TypeSegment led / humidifier).',
      'The account must belong to this device: use Reset password on the device page to rebuild it.'
    )
  }
  Write-Ok ('Allowed to subscribe (QoS ' + $granted + ')')
}

# ---------------------------------------------------------------- done
try {
  $disconnect = [byte[]](0xE0, 0x00)
  $stream.Write($disconnect, 0, 2)
  $stream.Flush()
} catch { }
$tcp.Close()
Stop-WithResult $true '' @()
