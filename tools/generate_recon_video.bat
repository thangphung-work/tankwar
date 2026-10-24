@echo off
chcp 65001 > nul
echo ====================================================================
echo  TỰ ĐỘNG DỰNG VÀ QUAY VIDEO 3D FLYCAM 360 CỨ ĐIỂM CHIẾN THUẬT
echo ====================================================================
echo.

if "%1"=="" (
    echo Đang quay video cho bản đồ URBAN mặc định...
    node tools/generate_recon_video.js URBAN
) else (
    echo Đang quay video cho bản đồ: %1...
    node tools/generate_recon_video.js %1
)

echo.
echo ====================================================================
echo  HOÀN TẤT! Video đã được xuất vào thư mục assets/
echo ====================================================================
pause
