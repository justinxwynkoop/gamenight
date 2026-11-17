@echo off
rem Game Night offline backup: runs the game on this computer, for when there is no internet.
rem Needs Node.js (https://nodejs.org, the LTS version). Double-click this file to start.
cd /d "%~dp0"
where node >NUL 2>&1 || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and try again. & pause & exit /b 1)
if not exist node_modules (echo Installing, first time only... & call npm install --omit=dev --no-audit --no-fund)
node server.js
pause
