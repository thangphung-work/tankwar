@echo off
title Tactical SPG Command 3D
cd /d "%~dp0"
set "PORT=8080"
echo ======================================================
echo    STARTING TACTICAL SPG COMMAND 3D...
echo ======================================================
node server.js
pause
