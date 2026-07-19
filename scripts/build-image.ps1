# UI 同梱の MailDeck.Api イメージをビルドする (PowerShell 版)。
# maildeck-ui/.env の VITE_* をビルド時 --build-arg に自動展開する
# (VITE_API_URL は同一オリジン配信で相対パス /api になるため除外)。
#
# -Push 時は docker buildx でマルチアーキ (linux/amd64 + linux/arm64) ビルド & push。
# push しないローカル確認ビルドはホストの native アーキ単体 (docker build) のまま。
#
# 使い方:
#   ./scripts/build-image.ps1                    # ローカル確認用 maildeck-api:integrated (push しない)
#   ./scripts/build-image.ps1 -Push              # クラスタ内レジストリ用タグでマルチアーキ build & push
#   ./scripts/build-image.ps1 -ImageTag <tag>    # 任意タグでビルド
#   ./scripts/build-image.ps1 -ImageTag <tag> -Push
#   ./scripts/build-image.ps1 -EnvFile maildeck-ui/.env.prod -Push
#   ./scripts/build-image.ps1 -Push -Platforms linux/amd64   # push 時のプラットフォームを絞る
param(
    # 省略時: -Push ありならレジストリタグ、なしならローカルタグを自動採用
    [string]$ImageTag,
    [string]$EnvFile = "maildeck-ui/.env",
    [string]$Platforms = "linux/amd64,linux/arm64",
    [switch]$Push
)
$ErrorActionPreference = "Stop"

# クラスタ内プライベートレジストリ (ENVIRONMENT.md: TLS なし、認証なし)
$Registry = "k3s-05.tailef9ae7.ts.net:30500"
$BuilderName = "maildeck-multiarch"

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

if (-not $Push) {
    Write-Host "==> building $ImageTag (env: $EnvFile, native arch only)"
    docker build -f MailDeck.Api/Dockerfile @buildArgs -t $ImageTag .
    if ($LASTEXITCODE -ne 0) { Write-Error "docker build failed" }
    Write-Host "==> built: $ImageTag"
    return
}

# ---- ここから push 時のマルチアーキ (amd64 + arm64) ビルド ----

docker buildx version | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker buildx が見つかりません。Docker Buildx プラグインを導入してください。"
}

# タグの先頭セグメントがホスト名っぽければ (例: k3s-05...:30500/foo, localhost/foo)
# insecure レジストリ設定の対象に加える。namespace/repo 形式 (Docker Hub) は対象外。
function Get-RegistryHost([string]$Tag) {
    $slashIndex = $Tag.IndexOf("/")
    if ($slashIndex -lt 0) { return $null }
    $firstSegment = $Tag.Substring(0, $slashIndex)
    if ($firstSegment -match "\.|:" -or $firstSegment -eq "localhost") {
        return $firstSegment
    }
    return $null
}

$registries = [System.Collections.Generic.List[string]]::new()
$registries.Add($Registry)
$extraHost = Get-RegistryHost $ImageTag
if ($extraHost -and -not $registries.Contains($extraHost)) {
    $registries.Add($extraHost)
}

# insecure (TLSなし) レジストリ向け buildkitd 設定を生成
$buildkitdConfig = New-TemporaryFile
$configLines = foreach ($host_ in $registries) {
    "[registry.`"$host_`"]"
    "  http = true"
    "  insecure = true"
}
Set-Content -Path $buildkitdConfig -Value $configLines

try {
    # マルチアーキ対応の buildx ビルダーを (再) 作成する。
    # insecure レジストリ設定が変わり得るため毎回作り直して常に最新設定を反映する。
    docker buildx rm $BuilderName 2>$null | Out-Null
    docker buildx create --name $BuilderName --driver docker-container --config $buildkitdConfig --use
    if ($LASTEXITCODE -ne 0) { Write-Error "docker buildx create failed" }

    # クロスアーキビルド用の QEMU エミュレータ登録 (ベストエフォート、失敗しても続行)
    docker run --privileged --rm tonistiigi/binfmt --install all 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "警告: QEMU binfmt 登録に失敗またはスキップ (既に登録済みの可能性あり)"
    }

    docker buildx inspect --bootstrap

    Write-Host "==> building & pushing $ImageTag (env: $EnvFile, platforms: $Platforms)"
    docker buildx build --platform $Platforms -f MailDeck.Api/Dockerfile @buildArgs -t $ImageTag --push .
    if ($LASTEXITCODE -ne 0) { Write-Error "docker buildx build failed" }
    Write-Host "==> built & pushed: $ImageTag ($Platforms)"
}
finally {
    Remove-Item -Path $buildkitdConfig -ErrorAction SilentlyContinue
}
