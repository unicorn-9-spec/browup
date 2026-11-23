# Walkthrough video: narration with a built-in Windows voice (offline).
#   powershell -ExecutionPolicy Bypass -File scripts/walkthrough/tts.ps1 <lines.json> <out-dir> [voice] [rate]
# lines.json: [{ "id": "n01", "text": "..." }, ...] -> <out-dir>/n01.wav ...
param(
  [Parameter(Mandatory = $true)][string]$LinesJson,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Voice = 'Zira',
  [double]$Rate = 1.0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Wait-WinRt($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$match = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*$Voice*" } | Select-Object -First 1
if ($match) { $synth.Voice = $match }
$synth.Options.SpeakingRate = $Rate
Write-Output ("voice: " + $synth.Voice.DisplayName)

$null = New-Item -ItemType Directory -Force $OutDir
$lines = Get-Content -Raw -Encoding UTF8 $LinesJson | ConvertFrom-Json
foreach ($l in $lines) {
  $stream = Wait-WinRt ($synth.SynthesizeTextToStreamAsync($l.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Wait-WinRt ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes((Join-Path $OutDir ($l.id + '.wav')), $bytes)
  $reader.Dispose()
  $stream.Dispose()
  Write-Output ("wrote " + $l.id)
}
