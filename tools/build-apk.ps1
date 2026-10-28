param(
  # package a dist older than the sources on purpose, when the timestamps lie:
  # a checkout writes every file now, and the build it carries may be current
  [switch]$Force,
  # verify one package against the keystore and exit, so the guard is testable
  # without a full build
  [string]$Check,
  # publish the package as the latest GitHub release, the address the README
  # links, so the package no longer rides in every commit; needs gh, signed in
  [switch]$Release
)
$ErrorActionPreference = 'Continue'
# the app folder is the folder this script lives in, so the repo can
# move without this file knowing about it
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sdk = 'C:\Android\sdk'
$bt = Join-Path $sdk 'build-tools\34.0.0'
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'
$app = Join-Path $root 'app'
$out = Join-Path $root 'build'
$javaHome = 'C:\Program Files\Java\jdk-25'
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$keystore = Join-Path $root 'keys\custom-sheet.keystore'

# The signing certificate of a package, and of the keystore, so the two can be
# compared. The file bytes are not compared: a rebuild is a new package, and
# what the phone checks is the certificate.
function Get-PackageDigest([string]$apk) {
  if (-not (Test-Path $apk)) { throw "no package at $apk" }
  $text = & "$bt\apksigner.bat" verify --print-certs $apk 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "apksigner cannot read $apk" }
  $found = [regex]::Match($text, 'certificate SHA-256 digest:\s*([0-9A-Fa-f]+)')
  if (-not $found.Success) { throw "no signing certificate in $apk" }
  return $found.Groups[1].Value.ToLower()
}

function Get-KeystoreDigest([string]$path) {
  if (-not (Test-Path $path)) { throw "the keystore is not here: $path" }
  # the alias is not named: the keystore the script signs with holds one key,
  # and an older one was minted under another name
  $text = & "$javaHome\bin\keytool.exe" -list -v -keystore $path -storepass android 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "keytool cannot read the keystore" }
  $found = [regex]::Match($text, 'SHA256:\s*([0-9A-Fa-f:]+)')
  if (-not $found.Success) { throw "no certificate in the keystore" }
  return ($found.Groups[1].Value -replace ':', '').ToLower()
}

# -Check answers whether one package carries the certificate of the keystore,
# and leaves by a non-zero code when it does not.
if ($Check) {
  $package = Get-PackageDigest $Check
  $expected = Get-KeystoreDigest $keystore
  if ($package -ne $expected) {
    Write-Output ("refused: " + $Check + " is signed by " + $package + ", the keystore holds " + $expected)
    exit 1
  }
  Write-Output ("ok: " + $Check + " carries the certificate of the keystore, " + $package)
  exit 0
}

if (-not (Test-Path $androidJar)) { throw "android-34 is missing, run tools/install-android-sdk.ps1" }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# A dist older than the newest source or data file would carry a stale page
# inside a fresh package, so it is refused before anything is copied.
$page = Join-Path $root 'dist\index.html'
if (-not (Test-Path $page)) { throw "there is no dist\index.html: run node build.mjs first" }
$newest = Get-ChildItem (Join-Path $root 'src'), (Join-Path $root 'data') -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $Force -and $newest.LastWriteTime -gt (Get-Item $page).LastWriteTime) {
  throw ("dist is older than " + $newest.FullName + ": run node build.mjs first, or pass -Force to package it anyway")
}

Write-Output "1. the page travels with the app"
$assets = Join-Path $app 'assets'
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Copy-Item $page (Join-Path $assets 'index.html') -Force
Get-ChildItem (Join-Path $root 'dist\data') -Filter *.json | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $assets $_.Name) -Force
}

Write-Output "2. compiling resources"
$resZip = Join-Path $out 'res.zip'
if (Test-Path $resZip) { Remove-Item $resZip -Force }
& "$bt\aapt2.exe" compile --dir "$app\res" -o $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Output "3. linking resources"
$baseApk = Join-Path $out 'base.apk'
if (Test-Path $baseApk) { Remove-Item $baseApk -Force }
& "$bt\aapt2.exe" link -o $baseApk --manifest "$app\AndroidManifest.xml" -I $androidJar -A $assets $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Output "4. compiling java"
$classes = Join-Path $out 'classes'
if (Test-Path $classes) { Remove-Item $classes -Recurse -Force }
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$src = @(
  "$app\java\com\newbornai\customsheet\MainActivity.java"
  "$app\java\com\newbornai\customsheet\ApkProvider.java"
)
& "$javaHome\bin\javac.exe" --release 11 -cp $androidJar -d $classes $src
if ($LASTEXITCODE -ne 0) {
  Write-Output "retrying javac with source and target 11"
  & "$javaHome\bin\javac.exe" -source 11 -target 11 -bootclasspath $androidJar -d $classes $src
}
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Output "5. dexing"
$dexDir = Join-Path $out 'dex'
if (Test-Path $dexDir) { Remove-Item $dexDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dexDir | Out-Null
$classesJar = Join-Path $out 'classes.jar'
if (Test-Path $classesJar) { Remove-Item $classesJar -Force }
& "$javaHome\bin\jar.exe" cf $classesJar -C $classes .
& "$bt\d8.bat" --lib $androidJar --min-api 24 --output $dexDir $classesJar
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Output "6. putting the dex in the package"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($baseApk, 'Update')
$entry = $zip.CreateEntry('classes.dex')
$stream = $entry.Open()
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $dexDir 'classes.dex'))
$stream.Write($bytes, 0, $bytes.Length)
$stream.Close()
$zip.Dispose()

Write-Output "7. aligning"
$aligned = Join-Path $out 'aligned.apk'
if (Test-Path $aligned) { Remove-Item $aligned -Force }
& "$bt\zipalign.exe" -f -p 4 $baseApk $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Output "8. signing"
New-Item -ItemType Directory -Force -Path (Split-Path $keystore) | Out-Null
if (-not (Test-Path $keystore)) {
  & "$javaHome\bin\keytool.exe" -genkeypair -v -keystore $keystore -alias sheet -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=custom-sheet, O=Newborn AI, C=FR"
  if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
$fresh = Join-Path $out 'signed.apk'
if (Test-Path $fresh) { Remove-Item $fresh -Force }
& "$bt\apksigner.bat" sign --ks $keystore --ks-pass pass:android --key-pass pass:android --min-sdk-version 24 --out $fresh $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

Write-Output "9. verifying"
$shipped = Join-Path $root 'dist\custom-sheet.apk'
$freshDigest = Get-PackageDigest $fresh
# The package that ships is signed by the key that signed the one before it.
# A new key on another machine would sign a package the phone refuses to
# install over the old one, and the failure would only show on the phone.
if (Test-Path $shipped) {
  $shippedDigest = Get-PackageDigest $shipped
  if ($freshDigest -ne $shippedDigest) {
    throw ("the package would be signed by " + $freshDigest + " but the one that shipped is " + $shippedDigest + ": the phone would refuse the update, so this package is not written")
  }
}
& "$bt\apksigner.bat" verify --print-certs $fresh
Copy-Item $fresh $shipped -Force
Copy-Item $shipped (Join-Path $out 'custom-sheet.apk') -Force

# A phone asks the machine for version.json and installs custom-sheet.apk, so
# the version it is offered must be the version inside that package. It is
# read from the page that was packaged, which makes the two one fact.
Write-Output "10. the advertised version is the packaged one"
$packed = Get-Content (Join-Path $assets 'index.html') -Raw
$found = [regex]::Match($packed, '<script id="version-data" type="application/json">\{"version":"([^"]+)"\}</script>')
if (-not $found.Success) { throw "the packaged page carries no version" }
$advertised = '{"version":"' + $found.Groups[1].Value + '","apk":"custom-sheet.apk"}' + [char]10
[System.IO.File]::WriteAllText((Join-Path $root 'dist\version.json'), $advertised)
Write-Output ("version.json advertises " + $found.Groups[1].Value)

# 11. the packaged page is the built page
# The package holds assets/index.html, copied byte for byte from dist/index.html
# when the packaging started, so the comparison is exact and needs no
# normalisation to pass. The one thing a build can change under the packaging
# is the version stamp the build writes into the page; when that is the only
# difference, the check names that exact block and both stamps, and fails all
# the same. Nothing here is a wildcard.
Write-Output "11. the packaged page is the built page"
$zip = [System.IO.Compression.ZipFile]::OpenRead($shipped)
$packedEntry = $null
foreach ($one in $zip.Entries) {
  if ($one.FullName -eq 'assets/index.html') { $packedEntry = $one; break }
}
if (-not $packedEntry) {
  $zip.Dispose()
  throw ("the package " + $shipped + " holds no assets/index.html")
}
$packedStream = $packedEntry.Open()
$packedBuffer = New-Object System.IO.MemoryStream
$packedStream.CopyTo($packedBuffer)
$packedBytes = $packedBuffer.ToArray()
$packedStream.Close()
$packedBuffer.Dispose()
$zip.Dispose()
$distBytes = [System.IO.File]::ReadAllBytes($page)

$limit = [Math]::Min($packedBytes.Length, $distBytes.Length)
$at = -1
for ($i = 0; $i -lt $limit; $i++) {
  if ($packedBytes[$i] -ne $distBytes[$i]) { $at = $i; break }
}
if ($at -lt 0 -and $packedBytes.Length -ne $distBytes.Length) { $at = $limit }

if ($at -lt 0) {
  Write-Output ("the packaged page is dist/index.html, byte for byte (" + $packedBytes.Length + " bytes)")
} else {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $packedText = $utf8.GetString($packedBytes)
  $distText = $utf8.GetString($distBytes)
  $stamp = '<script id="version-data" type="application/json">\{"version":"([^"]+)"\}</script>'
  $packedStamp = [regex]::Match($packedText, $stamp)
  $distStamp = [regex]::Match($distText, $stamp)
  $blank = '<script id="version-data" type="application/json">STAMP</script>'
  $packedPlain = [regex]::Replace($packedText, '<script id="version-data" type="application/json">[^<]*</script>', $blank)
  $distPlain = [regex]::Replace($distText, '<script id="version-data" type="application/json">[^<]*</script>', $blank)
  $onlyStamp = ($packedPlain -eq $distPlain) -and $packedStamp.Success -and $distStamp.Success
  if ($onlyStamp) {
    throw ("the page inside " + $shipped + " carries version " + $packedStamp.Groups[1].Value + " and " + $page + " carries version " + $distStamp.Groups[1].Value + ": the pages differ only in the version-data block, so the build was re-stamped after the package was made. Run node build.mjs and package the current page again.")
  }
  throw ("the page inside " + $shipped + " (" + $packedBytes.Length + " bytes) and " + $page + " (" + $distBytes.Length + " bytes) first differ at byte " + $at + ", outside the version-data block: the package does not hold the page the build wrote")
}
Write-Output ("APK ready: " + (Get-Item $shipped).Length + " bytes at " + $shipped)

# 12. the release
# The install link of the README is the latest release of the repository, and
# the package lives there rather than in the history: every build committed
# made the repository 600 KB heavier. The tag is the version of the page.
if ($Release) {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "-Release needs the gh command, signed in to GitHub" }
  $version = $found.Groups[1].Value
  $tag = 'app-' + ($version -replace '[^0-9T]', '' -replace 'T', '-').Substring(0, 15)
  & gh release create $tag $shipped --repo NewbornAI/custom-sheet --title ("custom-sheet " + $version) --notes ("The package built from the page of " + $version + ".") --latest
  if ($LASTEXITCODE -ne 0) { throw "gh could not publish the release $tag" }
  Write-Output ("released as " + $tag + ": https://github.com/NewbornAI/custom-sheet/releases/latest/download/custom-sheet.apk")
}
