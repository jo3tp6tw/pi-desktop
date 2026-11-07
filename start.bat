@echo off
chcp 65001 >nul
title Pi-UI (Start)

cd /d "%~dp0"

if not exist "node_modules" (
  echo 檢測到尚未安裝相依套件，正在執行 npm install...
  call npm install
  if %ERRORLEVEL% neq 0 (
    echo.
    echo [錯誤] npm install 失敗，請檢查網路或環境！
    pause
    exit /b %ERRORLEVEL%
  )
)

:: 檢查檔案是否有更新（無更新時 exit code 為 0，有更新或首次建置為 1）
node scripts/check-build.cjs %*
if %ERRORLEVEL% neq 0 (
  echo [1/2] 正在進行打包 (npm run build)...
  call npm run build
  if %ERRORLEVEL% neq 0 (
    echo.
    echo [錯誤] 打包編譯失敗，請檢查上方錯誤訊息！
    pause
    exit /b %ERRORLEVEL%
  )
)

echo [2/2] 正在啟動 Electron 桌面應用程式...
call npm run electron:start

exit /b 0
