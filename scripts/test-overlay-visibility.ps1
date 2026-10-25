$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskManifest = Join-Path $taskRoot 'src-tauri/examples/overlay_visibility_probe.manifest'
$taskProbe = Join-Path $taskRoot 'src-tauri/target/debug/examples/overlay_visibility_probe.exe'
$taskMt = Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin' -Filter mt.exe -Recurse |
  Where-Object { $_.Directory.Name -eq 'x64' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $taskMt) { throw 'Windows SDK x64 mt.exe is required for the probe manifest' }
cargo build --manifest-path (Join-Path $taskRoot 'src-tauri/Cargo.toml') --offline --locked --example overlay_visibility_probe
if ($LASTEXITCODE -ne 0) { throw 'Native visibility probe build failed' }
& $taskMt.FullName -nologo -manifest $taskManifest ('-outputresource:' + $taskProbe + ';#1')
if ($LASTEXITCODE -ne 0) { throw 'Native visibility probe manifest embedding failed' }
& $taskProbe
if ($LASTEXITCODE -ne 0) { throw 'Native visibility probe failed' }
