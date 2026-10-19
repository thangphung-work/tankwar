THƯ MỤC ÂM THANH GHI ÂM THẬT (TÙY CHỌN)
========================================

Game tự tổng hợp toàn bộ âm thanh, không cần file nào. Nếu muốn dùng tiếng ghi âm thật
(ví dụ file CC0 từ freesound.org, sonniss GDC bundle...), làm như sau:

1. Chép file .ogg / .mp3 / .wav vào thư mục này.
2. Tạo file manifest.json ngay trong thư mục này, khai báo khóa -> tên file, ví dụ:

   {
     "cannon_fire": "tank_cannon_120mm.ogg",
     "artillery_fire": "howitzer_155mm.ogg",
     "explosion": "explosion_heavy.ogg",
     "gatling_shot": "autocannon_30mm_single.ogg",
     "bullet_impact": "30mm_impact.ogg",
     "missile_launch": "atgm_launch.ogg"
   }

3. Chạy game qua server (run-game.bat) — trình duyệt chặn đọc file khi mở trực tiếp index.html.

Ghi chú:
- Chỉ cần khai báo khóa nào có file; khóa thiếu sẽ dùng âm tổng hợp.
- gatling_shot là MỘT phát đơn ngắn (game tự ghép thành tràng theo tốc độ bắn).
- Khoảng cách, hướng trái/phải, hồi âm, độ trễ âm thanh vẫn được áp dụng cho file thật.
- Mỗi lần phát, cao độ thay đổi ngẫu nhiên vài % để không bị lặp máy móc.
