@echo off
title RJ Jewellers - Full App
echo.
echo ========================================
echo   RJ Jewellers - Starting Full App
echo ========================================
echo.
echo This starts the FRONTEND only (no database).
echo For full app with database, run:
echo   start-server.bat  (in one CMD window)
echo   start-client.bat  (in another CMD window)
echo.
set PATH=%~dp0nodejs;%PATH%
cd /d "%~dp0client"
call npm run dev
pause
