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

GIỌNG LÍNH BỘ BINH (tuỳ chọn, thiếu thì game tổng hợp): khai trong manifest.json khoá vox_<loại>_<số>, nhiều file mỗi loại càng đỡ lặp.
Loại: hit (hự ngắn khi trúng nhẹ), hitBad (gào ngắn khi trúng nặng), moan (rên), breath (thở dốc), hiss (rít răng khi tiêm / siết băng), death (nghẹn tắt).
Ví dụ: { "vox_hit_1": "voice/hit1.ogg", "vox_hit_2": "voice/hit2.ogg", "vox_moan_1": "voice/moan1.ogg" }
