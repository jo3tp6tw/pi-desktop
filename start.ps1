[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -Path $PSScriptRoot

if (-not (Test-Path "node_modules")) {
    Write-Host "檢測到尚未安裝相依套件，正在執行 npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install 失敗，請檢查環境！"
        Read-Host "按 Enter 鍵離開..."
        exit $LASTEXITCODE
    }
}

# 檢查檔案是否有更新（無更新時 exit code 為 0，有更新或首次建置為 1）
node scripts/check-build.cjs $args
if ($LASTEXITCODE -ne 0) {
    Write-Host "[1/2] 正在進行打包 (npm run build)..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "打包編譯失敗，請檢查上方錯誤訊息！"
        Read-Host "按 Enter 鍵離開..."
        exit $LASTEXITCODE
    }
}

Write-Host "[2/2] 正在啟動 Electron 桌面應用程式..." -ForegroundColor Green
npm run electron:start
