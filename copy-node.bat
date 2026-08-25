@echo off
echo Copying Node.js into project folder...
robocopy "C:\Program Files\nodejs" "C:\Calculator\node" /E /NFL /NDL /NJH /NJS
echo.
echo Node.js copied! Now running npm install...
echo.
"C:\Calculator\node\node.exe" "C:\Calculator\node\node_modules\npm\bin\npm-cli.js" install --prefix "C:\Calculator\client"
echo.
echo Done! Run start-dev.bat to launch the app.
pause
