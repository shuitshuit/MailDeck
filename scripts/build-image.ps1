# UI 同梱の MailDeck.Api イメージをビルドする (PowerShell 版)。
# maildeck-ui/.env の VITE_* をビルド時 --build-arg に自動展開する
# (VITE_API_URL は同一オリジン配信で相対パス /api になるため除外)。
#
# 使い方:
#   ./scripts/build-image.ps1                    # ローカル確認用 maildeck-api:integrated (push しない)
#   ./scripts/build-image.ps1 -Push              # クラスタ内レジストリ用タグでビルド & push
#   ./scripts/build-image.ps1 -ImageTag <tag>    # 任意タグでビルド
#   ./scripts/build-image.ps1 -ImageTag <tag> -Push
#   ./scripts/build-image.ps1 -EnvFile maildeck-ui/.env.prod -Push
param(
    # 省略時: -Push ありならレジストリタグ、なしならローカルタグを自動採用
    [string]$ImageTag,
    [string]$EnvFile = "maildeck-ui/.env",
    [switch]$Push
)
$ErrorActionPreference = "Stop"

# クラスタ内プライベートレジストリ (ENVIRONMENT.md: TLS なし、認証なし)
$Registry = "k3s-05.tailef9ae7.ts.net:30500"

# タグ未指定なら push 有無で既定を切り替え
if (-not $ImageTag) {
    if ($Push) {
        $ImageTag = "$Registry/maildeck-api:latest"
    } else {
        $ImageTag = "maildeck-api:integrated"
    }
}

# リポジトリルートへ移動 (このスクリプトの1つ上)
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path $EnvFile)) {
    Write-Error "env ファイルが見つかりません: $EnvFile"
}

# VITE_API_URL 以外の VITE_* 行を --build-arg に変換
$buildArgs = @()
foreach ($line in Get-Content $EnvFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    if ($trimmed -like "VITE_API_URL=*") { continue }
    if ($trimmed -like "VITE_*=*") {
        $buildArgs += "--build-arg"
        $buildArgs += $trimmed
    }
}

Write-Host "==> building $ImageTag (env: $EnvFile)"
docker build -f MailDeck.Api/Dockerfile @buildArgs -t $ImageTag .
if ($LASTEXITCODE -ne 0) { Write-Error "docker build failed" }
Write-Host "==> built: $ImageTag"

if ($Push) {
    Write-Host "==> pushing $ImageTag"
    docker push $ImageTag
    if ($LASTEXITCODE -ne 0) { Write-Error "docker push failed" }
    Write-Host "==> pushed: $ImageTag"
}
