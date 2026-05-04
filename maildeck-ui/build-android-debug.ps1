# Android debug build script (for logcat debugging)

$envFile = Join-Path $PSScriptRoot "android-build.env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $key, $value = $line -split '=', 2
        $key = $key.Trim()
        $value = $value.Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

[System.Environment]::SetEnvironmentVariable("VITE_API_URL", 'https://maildeck.shuit.net/api', 'Process')

Write-Host "Building frontend assets..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Copying frontend assets to Android assets directory..." -ForegroundColor Cyan
$distDir = Join-Path $PSScriptRoot "dist"
$androidAssetsDir = Join-Path $PSScriptRoot "src-tauri\gen\android\app\src\main\assets"
if (-not (Test-Path $androidAssetsDir)) { New-Item -ItemType Directory -Path $androidAssetsDir | Out-Null }
Copy-Item -Path "$distDir\*" -Destination $androidAssetsDir -Recurse -Force

Write-Host "Building Android debug APK..." -ForegroundColor Cyan
npm run tauri android build -- --debug
