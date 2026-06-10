@echo off
REM ============================================================================
REM   GalaxyVPN — start the local Tester Worker
REM   Double-click. Opens a live terminal that:
REM     - runs the worker (real test via xray-knife, from your machine)
REM     - listens on Supabase Realtime for "Re-check all" from the admin page
REM     - reruns the sync on a schedule (default every 30 min)
REM ============================================================================
title GalaxyVPN  Tester Worker
chcp 65001 >nul
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

cd /d "%~dp0worker"

if not exist node_modules\ (
  echo Installing worker dependencies the first time...
  call npm install || (echo npm install failed & pause & exit /b 1)
)
if not exist .env (
  echo [!] worker\.env is missing. Copy .env.example to .env and fill it in.
  pause
  exit /b 1
)

node --env-file-if-exists=.env src\index.js
echo.
echo Worker exited.
pause
