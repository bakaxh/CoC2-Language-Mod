@echo off
chcp 65001 >nul
if "%~1"=="" (
    powershell -Sta -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-gui.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
    echo.
    pause
)
