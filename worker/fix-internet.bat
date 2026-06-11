@echo off
title Fix Internet & Network Settings
echo =======================================================
echo     Fixing internet issues (System Proxy ^& Stray VPNs)
echo =======================================================
echo.

echo [1] Killing stray tester processes (xray-knife, xray, sing-box)...
taskkill /F /IM xray-knife.exe /T >nul 2>&1
taskkill /F /IM xray.exe /T >nul 2>&1
taskkill /F /IM sing-box.exe /T >nul 2>&1
taskkill /F /IM v2ray.exe /T >nul 2>&1

echo.
echo [2] Resetting Windows System Proxy...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f >nul 2>&1

echo.
echo [3] Flushing DNS cache...
ipconfig /flushdns >nul 2>&1

echo.
echo =======================================================
echo Done! Your internet connection should be working now.
echo You don't need to restart your PC anymore.
echo =======================================================
pause
