# Android release build script
# Reads signing config from .env file

$envFile = Join-Path $PSScriptRoot "android-build.env"
if (-not (Test-Path $envFile)) {
    Write-Error "android-build.env file not found: $envFile"
    exit 1
}

# Parse .env
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $key, $value = $line -split '=', 2
    $key = $key.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
}

# Verify required vars
$required = @("ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
foreach ($var in $required) {
    if (-not [System.Environment]::GetEnvironmentVariable($var)) {
        Write-Error "Missing required env var: $var"
        exit 1
    }
}

Write-Host "Building Android release APK..." -ForegroundColor Cyan
npm run tauri android build --release
