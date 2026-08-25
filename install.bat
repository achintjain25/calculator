@echo off
echo Installing client dependencies...
set PATH=%~dp0nodejs;%PATH%
cd client
call npm install
echo.
echo Done! Run start.bat to launch the app.
pause
