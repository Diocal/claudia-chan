# Claudia-chan on Windows: npm packages, Whisper (speech to text), Kokoro (her voice) and the
# claude-chan command. Needs Node, uv and ffmpeg on PATH (winget install OpenJS.NodeJS.LTS astral-sh.uv Gyan.FFmpeg).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
foreach ($tool in 'node', 'npm', 'uv', 'ffmpeg') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Falta $tool. Instala: winget install OpenJS.NodeJS.LTS astral-sh.uv Gyan.FFmpeg" }
}
npm ci
node node_modules/electron/install.js
uv venv -q vendor/whisper --python 3.11
uv pip install -q --python vendor/whisper/Scripts/python.exe faster-whisper
uv venv -q vendor/kokoro --python 3.11
uv pip install -q --python vendor/kokoro/Scripts/python.exe kokoro-onnx soundfile
New-Item -ItemType Directory -Force vendor/kokoro/model | Out-Null
foreach ($f in 'kokoro-v1.0.int8.onnx', 'voices-v1.0.bin') {
  $out = "vendor/kokoro/model/$f"
  if (-not (Test-Path $out)) { Invoke-WebRequest "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f" -OutFile $out }
}
# The claude-chan command, in a folder on the user's PATH.
$bin = Join-Path $HOME '.local\bin'
New-Item -ItemType Directory -Force $bin | Out-Null
Set-Content -Encoding ASCII (Join-Path $bin 'claude-chan.cmd') "@echo off`r`nclaude --plugin-dir `"$PSScriptRoot\plugin`" %*"
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($path -notlike "*$bin*") { [Environment]::SetEnvironmentVariable('Path', "$path;$bin", 'User'); Write-Host "Agregado $bin al PATH (abre una terminal nueva)." }
Write-Host 'Listo: abre una terminal nueva y escribe claude-chan'
