@echo off
echo Installing client dependencies...
REM Resolve Node.js: bundled runtime if present, else the system install.
call "%~dp0_setup-node.bat"
if errorlevel 1 ( pause & exit /b 1 )
cd client
call npm install
echo.
echo Done! Run start.bat to launch the app.
pause
