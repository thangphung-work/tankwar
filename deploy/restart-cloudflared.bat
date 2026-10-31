@echo off
:: Tự động yêu cầu quyền Administrator nếu chưa có
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Yeu cau quyen Quan tri vien...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================================
echo   KHOI DONG LAI DICH VU CLOUDFLARED DE AP DUNG IP MOI
echo ========================================================
echo.
powershell -Command "Restart-Service Cloudflared -Force"

if %errorLevel% equ 0 (
    echo.
    echo [THANH CONG] Da khoi dong lai Cloudflared!
    echo Ten mien tankwar.online da tro sang VPS 222.255.214.114.
) else (
    echo.
    echo [THAT BAI] Khong the khoi dong lai dich vu.
)

echo.
pause
