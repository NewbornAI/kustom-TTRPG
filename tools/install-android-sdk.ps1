$ErrorActionPreference = 'Continue'
$sdk = 'C:\Android\sdk'
$stage = 'C:\stg'
New-Item -ItemType Directory -Force -Path $stage | Out-Null

function Get-PackageUrl($manifest, $path) {
  $blocks = [regex]::Matches($manifest, '(?s)<remotePackage path="' + [regex]::Escape($path) + '"[^>]*>(.*?)</remotePackage>')
  if ($blocks.Count -eq 0) { return $null }
  $archives = [regex]::Matches($blocks[0].Groups[1].Value, '(?s)<archive>(.*?)</archive>')
  $any = $null
  foreach ($a in $archives) {
    $body = $a.Groups[1].Value
    $url = [regex]::Match($body, '<url>([^<]+)</url>').Groups[1].Value
    $hostOs = [regex]::Match($body, '<host-os>([^<]+)</host-os>').Groups[1].Value
    if (-not $url) { continue }
    if ($hostOs -eq 'windows') { return $url }
    if (-not $any) { $any = $url }
  }
  return $any
}

function Install-ZipPackage($url, $target, $tag) {
  $name = [System.IO.Path]::GetFileName($url)
  $zip = Join-Path $stage $name
  if (-not (Test-Path $zip)) {
    Write-Output "downloading $name"
    & curl.exe -L --fail --silent --show-error --retry 3 -o $zip ("https://dl.google.com/android/repository/" + $url)
    if ($LASTEXITCODE -ne 0) { throw "curl failed for $name" }
  }
  Write-Output ("  " + $name + " " + (Get-Item $zip).Length + " bytes")
  $work = Join-Path $stage $tag
  cmd /c "rmdir /s /q $work" 2>&1 | Out-Null
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  Expand-Archive -Path $zip -DestinationPath $work -Force
  $roots = @(Get-ChildItem $work -Directory)
  $src = if ($roots.Count -eq 1) { $roots[0].FullName } else { $work }
  cmd /c "rmdir /s /q $target" 2>&1 | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Move-Item $src $target
  Write-Output "  installed to $target"
}

$manifest = ((& curl.exe -sS -L 'https://dl.google.com/android/repository/repository2-3.xml') -join ' ')
if ($manifest.Length -lt 1000) { throw "manifest download failed" }

$platformTools = Get-PackageUrl $manifest 'platform-tools'
$platform34 = Get-PackageUrl $manifest 'platforms;android-34'
$buildTools = Get-PackageUrl $manifest 'build-tools;34.0.0'
Write-Output "platform-tools: $platformTools"
Write-Output "platform 34:    $platform34"
Write-Output "build-tools:    $buildTools"

Install-ZipPackage $platformTools (Join-Path $sdk 'platform-tools') 'pt'
Install-ZipPackage $platform34 (Join-Path $sdk 'platforms\android-34') 'p34'
Install-ZipPackage $buildTools (Join-Path $sdk 'build-tools\34.0.0') 'bt34'

Write-Output "DONE"
Write-Output ("android.jar present: " + (Test-Path (Join-Path $sdk 'platforms\android-34\android.jar')))
Write-Output ("aapt2 present: " + (Test-Path (Join-Path $sdk 'build-tools\34.0.0\aapt2.exe')))
Write-Output ("d8 present: " + (Test-Path (Join-Path $sdk 'build-tools\34.0.0\d8.bat')))
Write-Output ("apksigner present: " + (Test-Path (Join-Path $sdk 'build-tools\34.0.0\apksigner.bat')))
