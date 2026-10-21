@echo off
title Tactical SPG Command 3D [DEV - hot reload]
cd /d "%~dp0"
echo ======================================================
echo    DEV MODE: luu file la trinh duyet tu cap nhat
echo    (sua server*.js -> may chu tu khoi dong lai)
echo ======================================================
node --watch server.js --dev
pause
