/**
 * Module Phòng Trưng Bày & Chi Tiết Thiết Kế Xe Tăng 3D (Tank 3D Showroom & Inspector)
 * - Khởi tạo không gian 3D tương tác độc lập bằng Three.js
 * - Cho phép người chơi xoay 360 độ, zoom phóng to thu nhỏ, tự động xoay
 * - Chuyển đổi mượt mà giữa 4 dòng xe: Đa dụng, 6 Nòng cận chiến, Pháo tự hành, Trinh sát 8 bánh
 * - Tùy biến đổi màu sơn ngụy trang: Phe Xanh Liên Minh và Phe Đỏ Sa Mạc
 * - Hiển thị chi tiết thông số kỹ thuật, cấu tạo cơ giới và hệ thống đạn dược dễ hiểu cho người dùng
 */

class TankInspector {
  constructor(game) {
    this.game = game;
    this.currentTankType = 'ALL_ROUNDER';
    this.currentTeam = 'BLUE';
    this.autoRotate = true;
    this.isMouseDown = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.cameraDistance = 165;
    this.cameraPitch = 0.24;
    this.cameraYaw = 0.6;
    this.activeUnit = null;
    this.animationFrameId = null;
    this.isOpen = false;

    // Dữ liệu thông số & đặc điểm thiết kế của 4 dòng xe
    this.tankSpecs = {
      ALL_ROUNDER: {
        className: 'BINH CHỦNG THIẾT GIÁP ĐA DỤNG',
        name: 'XE TĂNG CHỦ LỰC HALBERD MK.3',
        summary: 'Xe tăng chiến đấu chủ lực thế hệ mới với tháp pháo giáp nêm hình mũi tên, pháo nòng trơn 120mm nòng dài và hệ thống điều khiển hỏa lực hiện đại. Cân bằng giữa độ bền bỉ và sức công phá, rất thích hợp cho người mới lẫn chiến thuật đánh chắc tiến chắc.',
        hpText: '3.5 MÁU · GIÁP NẶNG (MŨI DÀY NHẤT)',
        hpPercent: 100,
        speedText: '70 KM/H ĐƯỜNG TỐT · ~60 VIỆT DÃ',
        speedPercent: 67,
        rofText: '2.5 GIÂY / PHÁT',
        rofPercent: 70,
        rangeText: 'BẮN THẲNG ~3400 M',
        rangePercent: 90,
        features: [
          { icon: 'shield', title: 'Giáp nêm mũi tên', desc: 'Hai khối giáp nêm hai bên nòng cùng tấm giáp mũi bắt bu-lông làm trượt hướng đạn đối phương khi bị bắn trúng.' },
          { icon: 'crosshair', title: 'Pháo nòng trơn 120mm L/55', desc: 'Ống bọc nhiệt chia đoạn chống cong nòng, bầu hút khói và gương chuẩn nòng giữ độ chính xác ở tầm xa.' },
          { icon: 'tank', title: 'Xích 7 cặp bánh chịu tải', desc: '7 cặp bánh chịu tải kép treo thanh xoắn, bánh sao chủ động phía sau và dải xích đệm cao su bám đường chắc chắn.' },
          { icon: 'radar-2', title: 'Kính toàn cảnh & trạm vũ khí', desc: 'Kính toàn cảnh trưởng xe xoay quét độc lập cùng trạm súng máy 12.7mm điều khiển từ xa trên nóc tháp.' }
        ],
        ammoList: [
          { name: 'Đạn Tiêu Chuẩn', desc: 'Đạn pháo thông dụng, uy lực nổ cân bằng và tốc độ bay ổn định.' },
          { name: 'Đạn Nổ Mạnh', desc: 'Sức ép nổ lớn, dọn dẹp cụm kẻ địch và phá hủy chướng ngại vật hiệu quả.' },
          { name: 'Đạn Xuyên Giáp Lõi Urani Nghèo', desc: 'Mũi tên APFSDS tự bốc cháy khi xuyên giáp. Chỉ xe tăng chủ lực bắn được.' }
        ]
      },
      GATLING: {
        className: 'BINH CHỦNG CHI VIỆN HỎA LỰC CẬN CHIẾN',
        name: 'XE CHI VIỆN HỎA LỰC HAILSTORM R6',
        summary: 'Chiến xa càn quét áp sát tầm gần sở hữu cụm 6 nòng xoay xả đạn như bão táp. Càng bắn lâu nòng càng nóng đỏ tăng nhiệt, cần nhịp ngắt để tản nhiệt làm mát nòng súng.',
        hpText: '3.0 MÁU · GIÁP TRUNG BÌNH + ERA',
        hpPercent: 86,
        speedText: '70 KM/H ĐƯỜNG TỐT · ~60 VIỆT DÃ',
        speedPercent: 71,
        rofText: '300 VIÊN / BĂNG · 1800 PHÁT/PHÚT · THAY BĂNG 4 S',
        rofPercent: 96,
        rangeText: 'TẦM GẦN ~780 M',
        rangePercent: 30,
        features: [
          { icon: 'bolt', title: 'Cụm 6 nòng xoay 30mm', desc: 'Nòng súng xoay tròn liên tục bằng motor điện, tự đổi màu phát sáng nóng đỏ rực rỡ khi khai hỏa.' },
          { icon: 'link', title: 'Gạch ERA & lồng chống RPG', desc: 'Váy xích gắn gạch giáp phản ứng nổ, lồng thanh thép bao đuôi xe và đuôi tháp kích nổ đạn trước khi chạm vào giáp chính.' },
          { icon: 'tank', title: 'Lưỡi ủi thủy lực', desc: 'Lưỡi ủi mặt lõm nâng hạ bằng 2 xi-lanh thủy lực, dọn rào cản và che chắn phần mũi xe khỏi sức ép nổ mặt đất.' },
          { icon: 'package', title: '2 hòm đạn & máng tiếp đạn', desc: 'Hai hòm đạn bọc giáp hai bên tháp nối vào khối pháo bằng máng tiếp đạn khớp đốt, cấp đạn liên tục không gián đoạn.' }
        ],
        ammoList: [
          { name: 'Đạn 30mm Nổ-Cháy', desc: 'Xả đạn liên hồi, xé giáp nhẹ và xe tải; với xe tăng chủ lực chỉ bóc phụ kiện, váy xích và kính ngắm.' },
          { name: 'Đạn Cháy Nhiệt Độ Cao', desc: 'Gây bỏng rát và duy trì thiêu đốt mục tiêu thêm một thời gian.' }
        ]
      },
      ARTILLERY: {
        className: 'BINH CHỦNG PHÁO BINH TỰ HÀNH HẠNG NẶNG',
        name: 'PHÁO TỰ HÀNH BÁNH LỐP ARBALEST 155',
        summary: 'Lựu pháo 155mm đặt trên xe tải quân sự 6x6 bọc giáp, tháp pháo phía sau với nạp đạn tự động. Tầm bắn bao quát toàn bộ bản đồ, đạn bay theo quỹ đạo cầu vồng vượt núi cao. Khi dừng lại 2 giây, xe hạ 2 chân chống thủy lực và lưỡi càng sau cắm đất để khai hỏa uy lực cực đại.',
        hpText: '1.6 MÁU · CABIN GIÁP MỎNG',
        hpPercent: 46,
        speedText: '70 KM/H ĐƯỜNG TỐT · LEO DỐC KÉM',
        speedPercent: 67,
        rofText: '3 GIÂY / PHÁT · 5 LIỀU PHÓNG',
        rofPercent: 40,
        rangeText: 'CẦU VỒNG 440 – 3300 M',
        rangePercent: 100,
        features: [
          { icon: 'crane', title: 'Chân chống & lưỡi càng thủy lực', desc: 'Khi dừng 2 giây, 2 chân chống hạ xuống đất rồi lưỡi càng sau cắm sâu, triệt tiêu lực giật lùi của phát bắn 155mm.' },
          { icon: 'crosshair', title: 'Lựu pháo 155mm L/52', desc: 'Nòng dài 8 mét đặt trên nóc tháp, hãm lùi đầu nòng 2 tầng xả khí sang hai bên; hành quân thì gác nòng lên giá khóa trên nóc cabin.' },
          { icon: 'wheel', title: 'Xe tải 6x6 cabin bọc giáp', desc: 'Cabin đầu bằng kính chống đạn, 3 trục bánh lốp địa hình có bơm hơi trung tâm, trục trước bẻ lái cơ động trên đường dài.' },
          { icon: 'radar-2', title: 'Khí tượng & radar sơ tốc', desc: 'Cột đo gió trên nóc tháp và radar đo sơ tốc đầu nòng trên giá pháo giúp phát bắn trúng mục tiêu từ khoảng cách hàng kilomet.' }
        ],
        ammoList: [
          { name: 'Đạn Nổ Mạnh Cực Đại', desc: 'Sức công phá vô song, tạo hố đạn sâu và thổi bay đối thủ trong bán kính nổ.' },
          { name: 'Đạn Chùm Nổ Trên Không', desc: 'Kích nổ thấp sát mặt đất, rải bom con và mảnh văng bao trùm diện tích rộng, dọn dẹp các cụm xe địch.' }
        ]
      },
      SCOUT: {
        className: 'BINH CHỦNG TRINH SÁT & TÁC CHIẾN CƠ ĐỘNG',
        name: 'XE TRINH SÁT BỌC GIÁP NHẸ MARTEN R4',
        summary: 'Xe trinh sát 4x4 bọc giáp nhẹ, thân thấp nhiều mặt vát, đáy chữ V chống mìn. Cột cảm biến ống lồng với radar giám sát xoay vạch trần kẻ địch ẩn trong bụi rậm từ xa; trạm vũ khí điều khiển từ xa với súng máy hạng nặng và 2 ống phóng tên lửa chống tăng.',
        hpText: '1.8 MÁU · GIÁP NHẸ CHỐNG ĐẠN NHỎ',
        hpPercent: 51,
        speedText: '100 KM/H ĐƯỜNG TỐT · ~85 VIỆT DÃ',
        speedPercent: 100,
        rofText: '100 VIÊN / HỘP · 600 PHÁT/PHÚT · TÊN LỬA NẠP 7.5 S',
        rofPercent: 80,
        rangeText: 'SÚNG MÁY ~620 M · TÊN LỬA ~2000 M',
        rangePercent: 60,
        features: [
          { icon: 'wheel', title: '4x4 treo độc lập', desc: '4 bánh lốp lớn chạy được khi xịt, giảm xóc tay đòn kép, trục trước bẻ lái cho phép ôm cua nhanh ở tốc độ cao.' },
          { icon: 'rocket', title: 'Trạm vũ khí điều khiển từ xa', desc: 'Súng máy hạng nặng có kính ngắm nhiệt cùng 2 ống phóng tên lửa chống tăng gắn bên cạnh, điều khiển từ trong cabin.' },
          { icon: 'radar-2', title: 'Cột cảm biến ống lồng', desc: 'Đầu quan sát quang điện / hồng ngoại và anten radar giám sát xoay liên tục, phát hiện xe địch ẩn nấp từ rất xa.' },
          { icon: 'shield', title: 'Thân giáp vát & đáy chữ V', desc: 'Thân liền khối nhiều mặt vát bọc giáp nhẹ, đáy chữ V phân tán sức ép mìn; kính chống đạn toàn cabin.' }
        ],
        ammoList: [
          { name: 'Đạn Súng Máy Bắn Nhanh', desc: 'Khởi động 0.25 giây là xả đạn. Xé nát xe giáp nhẹ, lốp và phụ kiện; gần như vô hại với giáp xe tăng.' },
          { name: 'Đạn Cháy Áp Chế', desc: 'Đốt cháy mục tiêu và cản trở tầm nhìn đối phương.' },
          { name: 'Tên Lửa Chống Tăng Tầm Xa', desc: 'Hỏa lực uy lực lớn gây sát thương nặng lên xe địch ở tầm xa.' }
        ]
      }
    };

    this.init();
  }

  init() {
    this.createDomElements();
    this.bindEvents();
  }

  // Tạo và nhúng DOM Modal vào trang
  createDomElements() {
    if (document.getElementById('tank-inspector-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tank-inspector-overlay';
    overlay.className = 'tank-inspector-overlay hidden';

    overlay.innerHTML = `
      <div class="ti-backdrop"></div>
      
      <div class="ti-modal">
        <!-- Header Giao diện 3D -->
        <div class="ti-header">
          <div class="ti-title-box">
            <span class="ti-title-badge">KHU TRIỂN LÃM KHÍ TÀI CHIẾN ĐẤU 3D</span>
            <h2 class="ti-main-title">THIẾT KẾ & THÔNG SỐ XE TĂNG TÁC CHIẾN</h2>
          </div>
          <div class="ti-header-actions">
            <!-- Chuyển đổi màu sơn quân sự -->
            <div class="ti-camo-switcher">
              <span class="ti-camo-lbl">SƠN NGỤY TRANG:</span>
              <button class="ti-camo-btn active" data-team="BLUE"><i class="ti ti-circle-filled ic-blue" aria-hidden="true"></i> PHE XANH</button>
              <button class="ti-camo-btn" data-team="RED"><i class="ti ti-circle-filled ic-red" aria-hidden="true"></i> PHE ĐỎ</button>
            </div>
            <!-- Nút Đóng -->
            <button id="ti-close-btn" class="ti-close-btn" title="Đóng giao diện [Phím ESC hoặc I]"><i class="ti ti-x" aria-hidden="true"></i> ĐÓNG</button>
          </div>
        </div>

        <!-- Khu vực chính: Trái là Khung 3D tương tác, Phải là Bảng thông số & Cấu tạo -->
        <div class="ti-body">
          <!-- Cột trái: Viewport 3D -->
          <div class="ti-viewport-container">
            <canvas id="ti-canvas"></canvas>

            <!-- Thanh chọn nhanh 4 loại xe nổi phía dưới khung 3D -->
            <div class="ti-class-tabs">
              <button class="ti-tab-btn active" data-tank-type="ALL_ROUNDER">
                <span class="ti-tab-ico"><i class="ti ti-shield" aria-hidden="true"></i></span>
                <div class="ti-tab-text">
                  <span class="ti-tab-name">ĐA DỤNG</span>
                  <span class="ti-tab-sub">Giáp dày • Cân bằng</span>
                </div>
              </button>
              <button class="ti-tab-btn" data-tank-type="GATLING">
                <span class="ti-tab-ico"><i class="ti ti-bolt" aria-hidden="true"></i></span>
                <div class="ti-tab-text">
                  <span class="ti-tab-name">6 NÒNG CẬN CHIẾN</span>
                  <span class="ti-tab-sub">Xả đạn liên tục • Lồng thép</span>
                </div>
              </button>
              <button class="ti-tab-btn" data-tank-type="ARTILLERY">
                <span class="ti-tab-ico"><i class="ti ti-crosshair" aria-hidden="true"></i></span>
                <div class="ti-tab-text">
                  <span class="ti-tab-name">PHÁO TỰ HÀNH</span>
                  <span class="ti-tab-sub">Tầm xa • Càng thủy lực</span>
                </div>
              </button>
              <button class="ti-tab-btn" data-tank-type="SCOUT">
                <span class="ti-tab-ico"><i class="ti ti-radar-2" aria-hidden="true"></i></span>
                <div class="ti-tab-text">
                  <span class="ti-tab-name">TRINH SÁT 4X4</span>
                  <span class="ti-tab-sub">Cơ động • Tên lửa vác vai</span>
                </div>
              </button>
            </div>

            <!-- Bảng điều khiển góc nhìn & Gợi ý thao tác chuột -->
            <div class="ti-controls-hint">
              <span class="hint-item"><i class="ti ti-mouse" aria-hidden="true"></i> Kéo chuột để xoay 360°</span>
              <span class="hint-item"><i class="ti ti-zoom-in" aria-hidden="true"></i> Cuộn chuột để phóng to / thu nhỏ</span>
              <button id="ti-autorotate-toggle" class="ti-hint-toggle active"><i class="ti ti-refresh" aria-hidden="true"></i> Tự động xoay: BẬT</button>
            </div>
          </div>

          <!-- Cột phải: Bảng chi tiết kỹ thuật & thiết kế khí tài -->
          <div class="ti-spec-panel">
            <div class="ti-spec-header">
              <div class="ti-tank-class-badge" id="ti-class-badge">BINH CHỦNG THIẾT GIÁP ĐA DỤNG</div>
              <h3 class="ti-tank-name" id="ti-tank-name">XE TĂNG CHỦ LỰC HALBERD MK.3</h3>
              <p class="ti-tank-summary" id="ti-tank-summary">Dòng xe tăng toàn năng với lớp giáp dày dặn, hỏa lực pháo nòng rãnh xoắn cân bằng giữa độ bền bỉ và sức công phá tầm trung.</p>
            </div>

            <!-- 4 Thanh chỉ số tác chiến dạng đồ họa trực quan -->
            <div class="ti-stat-bars-group">
              <div class="ti-stat-row">
                <div class="ti-stat-label-wrap">
                  <span class="ti-stat-name"><i class="ti ti-shield" aria-hidden="true"></i> ĐỘ BỀN VÀ GIÁP HỘ THÂN</span>
                  <span class="ti-stat-val" id="ti-stat-hp">3.0 VẠCH MÁU</span>
                </div>
                <div class="ti-stat-bar-track">
                  <div class="ti-stat-bar-fill hp" id="ti-bar-hp" style="width: 100%;"></div>
                </div>
              </div>

              <div class="ti-stat-row">
                <div class="ti-stat-label-wrap">
                  <span class="ti-stat-name"><i class="ti ti-bolt" aria-hidden="true"></i> TỐC ĐỘ CƠ ĐỘNG CHIẾN TRƯỜNG</span>
                  <span class="ti-stat-val" id="ti-stat-speed">54 KM/H</span>
                </div>
                <div class="ti-stat-bar-track">
                  <div class="ti-stat-bar-fill speed" id="ti-bar-speed" style="width: 58%;"></div>
                </div>
              </div>

              <div class="ti-stat-row">
                <div class="ti-stat-label-wrap">
                  <span class="ti-stat-name"><i class="ti ti-flame" aria-hidden="true"></i> TỐC ĐỘ XẢ ĐẠN & NẠP ĐẠN</span>
                  <span class="ti-stat-val" id="ti-stat-rof">2.5S / VIÊN</span>
                </div>
                <div class="ti-stat-bar-track">
                  <div class="ti-stat-bar-fill rof" id="ti-bar-rof" style="width: 70%;"></div>
                </div>
              </div>

              <div class="ti-stat-row">
                <div class="ti-stat-label-wrap">
                  <span class="ti-stat-name"><i class="ti ti-crosshair" aria-hidden="true"></i> TẦM BẮN HIỆU QUẢ</span>
                  <span class="ti-stat-val" id="ti-stat-range">TẦM TRUNG - XA</span>
                </div>
                <div class="ti-stat-bar-track">
                  <div class="ti-stat-bar-fill range" id="ti-bar-range" style="width: 75%;"></div>
                </div>
              </div>
            </div>

            <!-- Các đặc điểm thiết kế cơ giới độc quyền -->
            <div class="ti-tech-features">
              <h4 class="ti-section-title"><i class="ti ti-settings" aria-hidden="true"></i> ĐẶC ĐIỂM THIẾT KẾ & CÔNG NGHỆ KHÍ TÀI</h4>
              <div class="ti-feature-cards" id="ti-feature-cards"></div>
            </div>

            <!-- Hệ thống đạn dược tương thích -->
            <div class="ti-ammo-system">
              <h4 class="ti-section-title"><i class="ti ti-bomb" aria-hidden="true"></i> HỆ THỐNG ĐẠN DƯỢC TƯƠNG THÍCH</h4>
              <div class="ti-ammo-list" id="ti-ammo-list"></div>
            </div>

            <!-- Nút chọn xe này làm xe xuất trận -->
            <div class="ti-action-row">
              <button id="ti-select-this-tank-btn" class="ti-select-btn">
                <i class="ti ti-check" aria-hidden="true"></i> CHỌN LOẠI XE NÀY ĐỂ XUẤT TRẬN
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    overlay.innerHTML = this.buildRedesignedMarkup();
    document.body.appendChild(overlay);
  }

  buildRedesignedMarkup() {
    return `
      <div class="ti-backdrop"></div>
      <div class="ti-modal">
        <header class="ti-header">
          <button id="ti-close-btn" class="ti-close-btn" title="Quay lại [ESC]"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
          <div class="ti-title-box"><h2 class="ti-main-title">THÔNG TIN XE TĂNG</h2><span class="ti-title-badge">XEM CHI TIẾT VÀ CHỌN TRANG BỊ CHO XE</span></div>
          <div class="ti-header-actions">
            <div class="ti-profile"><img src="assets/commander_avatar.jpg" alt="Chỉ huy"><span><b class="ti-profile-name">Chưa đăng nhập</b><small class="ti-profile-rank"></small></span><i><i class="ti ti-settings" aria-hidden="true"></i></i></div>
          </div>
        </header>
        <div class="ti-body">
          <nav class="ti-side-nav eqp" aria-label="Chọn trang bị"></nav>
          <section class="ti-viewport-container" id="ti-vehicle-stage">
            <canvas id="ti-canvas"></canvas>
            <div class="ti-class-tabs">
              <button class="ti-tab-btn active" data-tank-type="ALL_ROUNDER"><span class="ti-tab-ico"><i class="ti ti-tank" aria-hidden="true"></i></span><span class="ti-tab-text"><b class="ti-tab-name">HALBERD MK.3</b><small class="ti-tab-sub">Chủ lực • Cân bằng</small></span></button>
              <button class="ti-tab-btn" data-tank-type="GATLING"><span class="ti-tab-ico"><i class="ti ti-bolt" aria-hidden="true"></i></span><span class="ti-tab-text"><b class="ti-tab-name">HAILSTORM R6</b><small class="ti-tab-sub">Hỏa lực • Cận chiến</small></span></button>
              <button class="ti-tab-btn" data-tank-type="ARTILLERY"><span class="ti-tab-ico"><i class="ti ti-crosshair" aria-hidden="true"></i></span><span class="ti-tab-text"><b class="ti-tab-name">ARBALEST 155</b><small class="ti-tab-sub">Pháo binh • Tầm xa</small></span></button>
              <button class="ti-tab-btn" data-tank-type="SCOUT"><span class="ti-tab-ico"><i class="ti ti-radar-2" aria-hidden="true"></i></span><span class="ti-tab-text"><b class="ti-tab-name">MARTEN R4</b><small class="ti-tab-sub">Trinh sát • Cơ động</small></span></button>
            </div>
            <div class="ti-controls-hint"><span><i class="ti ti-mouse" aria-hidden="true"></i> Kéo chuột để xoay</span><span>• Cuộn để zoom</span><span>• Nhấp vào bộ phận để xem chi tiết</span><button id="ti-autorotate-toggle" class="ti-hint-toggle active">TỰ XOAY</button></div>
            <div class="ti-test-panel"><button id="ti-test-fire-btn" class="ti-hint-toggle ti-test-fire-btn" title="Giữ để xả đạn liên thanh / bấm để khai hỏa pháo"><i class="ti ti-flame" aria-hidden="true"></i> BẮN THỬ [SPACE]</button><div class="ti-ammo-test" id="ti-ammo-test"></div><a class="ti-lab-link" href="fx_lab.html" target="_blank" rel="noopener" title="Trang riêng xem mọi loại đạn bay & nổ"><i class="ti ti-flask" aria-hidden="true"></i> PHÒNG THỬ ĐẠN ↗</a></div>
          </section>
          <aside class="ti-spec-panel">
            <div class="ti-spec-header"><div class="ti-tank-class-badge" id="ti-class-badge">XE TĂNG CHIẾN ĐẤU CHỦ LỰC</div><div class="ti-name-line"><h3 class="ti-tank-name" id="ti-tank-name">HALBERD MK.3</h3><span>BẬC THƯỢNG</span></div><p class="ti-role-line" id="ti-role-line">Giáp dày kiên cố – Cân bằng công thủ toàn diện</p><p class="ti-tank-summary" id="ti-tank-summary"></p></div>
            <section class="ti-stat-section"><h4 class="ti-section-title"><i class="ti ti-bolt" aria-hidden="true"></i> THÔNG SỐ CHIẾN ĐẤU</h4><div class="ti-stat-bars-group">
              <div class="ti-stat-row"><div class="ti-stat-label-wrap"><span class="ti-stat-name"><i class="ti ti-hexagon" aria-hidden="true"></i> GIÁP</span><b class="ti-stat-val" id="ti-stat-hp">85</b></div><div class="ti-stat-bar-track"><div class="ti-stat-bar-fill hp" id="ti-bar-hp"></div></div></div>
              <div class="ti-stat-row"><div class="ti-stat-label-wrap"><span class="ti-stat-name"><i class="ti ti-flame" aria-hidden="true"></i> HỎA LỰC</span><b class="ti-stat-val" id="ti-stat-rof">78</b></div><div class="ti-stat-bar-track"><div class="ti-stat-bar-fill rof" id="ti-bar-rof"></div></div></div>
              <div class="ti-stat-row"><div class="ti-stat-label-wrap"><span class="ti-stat-name"><i class="ti ti-settings" aria-hidden="true"></i> CƠ ĐỘNG</span><b class="ti-stat-val" id="ti-stat-speed">62</b></div><div class="ti-stat-bar-track"><div class="ti-stat-bar-fill speed" id="ti-bar-speed"></div></div></div>
              <div class="ti-stat-row"><div class="ti-stat-label-wrap"><span class="ti-stat-name"><i class="ti ti-crosshair" aria-hidden="true"></i> TẦM BẮN</span><b class="ti-stat-val" id="ti-stat-range">75</b></div><div class="ti-stat-bar-track"><div class="ti-stat-bar-fill range" id="ti-bar-range"></div></div></div>
            </div></section>
            <section class="ti-tech-features"><h4 class="ti-section-title"><i class="ti ti-bolt" aria-hidden="true"></i> TRANG BỊ & HỆ THỐNG</h4><div class="ti-feature-cards" id="ti-feature-cards"></div></section>
            <section class="ti-ammo-system"><h4 class="ti-section-title"><i class="ti ti-bolt" aria-hidden="true"></i> ĐẠN DƯỢC</h4><div class="ti-ammo-list" id="ti-ammo-list"></div></section>
            <section class="ti-tactical-overview"><h4 class="ti-section-title"><i class="ti ti-bolt" aria-hidden="true"></i> TỔNG QUAN CHIẾN THUẬT</h4><div class="ti-pros-cons"><div><b><i class="ti ti-thumb-up" aria-hidden="true"></i> ƯU ĐIỂM</b><p>• Giáp dày, chịu đựng tốt<br>• Hỏa lực ổn định, sát thương cao<br>• Hiệu quả ở nhiều địa hình</p></div><div><b><i class="ti ti-thumb-down" aria-hidden="true"></i> NHƯỢC ĐIỂM</b><p>• Cơ động trung bình<br>• Dễ bị áp đảo bởi xe siêu nhẹ<br>• Cần phối hợp đồng đội</p></div></div></section>
            <div class="ti-action-row"><button id="ti-select-this-tank-btn" class="ti-select-btn"><i class="ti ti-check" aria-hidden="true"></i> CHỌN XE NÀY ĐỂ XUẤT TRẬN</button></div>
          </aside>
        </div>
      </div>`;
  }

  // Khởi tạo Three.js Scene cho phòng trưng bày
  initThreeScene() {
    if (this.renderer) return;

    const canvas = document.getElementById('ti-canvas');
    if (!canvas) return;

    this.scene = new THREE.Scene();

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    this.camera = new THREE.PerspectiveCamera(38, width / height, 1, 1000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.ACESFilmicToneMapping !== undefined) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.62;
    }
    if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;

    // Ánh sáng chiếu rọi chuẩn studio khí tài
    const ambientLight = new THREE.AmbientLight(0xbfd3e6, 0.38);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xdceeff, 0x4b3828, 0.48);
    this.scene.add(hemisphereLight);

    const dirLightMain = new THREE.DirectionalLight(0xfff1d8, 1.25);
    dirLightMain.position.set(70, 110, 80);
    dirLightMain.castShadow = true;
    dirLightMain.shadow.mapSize.width = 1024;
    dirLightMain.shadow.mapSize.height = 1024;
    dirLightMain.shadow.camera.near = 10;
    dirLightMain.shadow.camera.far = 400;
    const d = 80;
    dirLightMain.shadow.camera.left = -d;
    dirLightMain.shadow.camera.right = d;
    dirLightMain.shadow.camera.top = d;
    dirLightMain.shadow.camera.bottom = -d;
    this.scene.add(dirLightMain);

    // Đèn viền phản xạ sau lưng (Rim Light) làm nổi bật đường nét kim loại
    const rimLight = new THREE.DirectionalLight(0xd9cfb4, 0.62);
    rimLight.position.set(-80, 50, -70);
    this.scene.add(rimLight);

    const softFillLight = new THREE.DirectionalLight(0xd7e8ff, 0.45);
    softFillLight.position.set(0, -30, 80);
    this.scene.add(softFillLight);

    // Bục triển lãm hình đĩa xoay công nghệ cao
    this.platformGroup = new THREE.Group();
    
    // Đĩa kim loại chính
    const discGeo = new THREE.CylinderGeometry(55, 58, 3.5, 48);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x161b18,
      roughness: 0.55,
      metalness: 0.85
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.position.y = -1.75;
    discMesh.receiveShadow = true;
    this.platformGroup.add(discMesh);

    // Vòng đèn LED phát quang trên mặt bục
    const ringGeo = new THREE.RingGeometry(46, 48.5, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe7a63a,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.05;
    this.platformGroup.add(ringMesh);

    // Lưới grid chiến thuật phát sáng nhẹ dưới chân xe
    const gridHelper = new THREE.GridHelper(90, 18, 0x8d978b, 0x2a302b);
    gridHelper.position.y = 0.1;
    this.platformGroup.add(gridHelper);

    this.scene.add(this.platformGroup);

    // Lắng nghe resize
    window.addEventListener('resize', () => {
      if (this.isOpen && this.renderer && this.camera) {
        const c = document.getElementById('ti-canvas');
        if (c) {
          const r = c.getBoundingClientRect();
          this.camera.aspect = (r.width || 800) / (r.height || 600);
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(r.width || 800, r.height || 600);
        }
      }
    });

    this.setupMouseControls(canvas);
  }

  // Điều khiển xoay chuột 360 độ và cuộn chuột thu phóng
  setupMouseControls(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      this.isMouseDown = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointerup', () => {
      this.isMouseDown = false;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.isMouseDown) return;

      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      this.cameraYaw -= deltaX * 0.008;
      this.cameraPitch += deltaY * 0.006;

      // Giới hạn góc nhìn cao và thấp để không bị lật ngược
      this.cameraPitch = Math.max(0.08, Math.min(Math.PI / 2.3, this.cameraPitch));

      this.updateCameraPosition();
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.08;
      this.cameraDistance += e.deltaY * zoomSpeed;
      this.cameraDistance = Math.max(50, Math.min(this.testRange && this.testRange.visible ? 400 : 220, this.cameraDistance));
      this.updateCameraPosition();
    }, { passive: false });
  }

  updateCameraPosition() {
    if (!this.camera) return;
    const x = this.cameraDistance * Math.cos(this.cameraPitch) * Math.sin(this.cameraYaw);
    const y = this.cameraDistance * Math.sin(this.cameraPitch) + 10;
    const z = this.cameraDistance * Math.cos(this.cameraPitch) * Math.cos(this.cameraYaw);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 10, 0);
  }

  // Tải xe tăng 3D lên sàn bục
  loadTankModel(tankType, team = this.currentTeam) {
    if (!this.scene) return;

    // Xóa xe cũ (kèm khói/lửa đầu nòng còn đang bay)
    if (this.activeUnit && this.activeUnit.group) {
      this.clearUnitFX(this.activeUnit);
      this.clearTestImpacts();
      this.scene.remove(this.activeUnit.group);
      this.activeUnit = null;
    }

    this.currentTankType = tankType;
    this.currentTeam = team;

    if (typeof SPGUnit3D === 'undefined') {
      console.warn('SPGUnit3D chưa được nạp.');
      return;
    }

    // Khởi tạo xe mới bằng lớp SPGUnit3D có sẵn
    this.activeUnit = new SPGUnit3D(this.scene, {
      tankType: tankType,
      team: team,
      isPlayer: true,
      x: 0,
      z: 0,
      bodyAngle: 0
    });
    this.activeUnit.alwaysFX = true;
    this.testFiring = false;
    // Phòng xem: đạn đặc biệt không giới hạn để thử thoải mái
    const u = this.activeUnit;
    u.apAmmoCount = u.heAmmoCount = u.clusterAmmoCount = u.incendiaryAmmoCount = u.missileAmmoCount = 9999;
    this.pendingImpacts = [];
    this.renderAmmoTestChips();

    // Tinh chỉnh riêng cho phòng trưng bày: Ẩn thanh máu 3D
    if (this.activeUnit.hpBgMesh) this.activeUnit.hpBgMesh.visible = false;
    if (this.activeUnit.hpBarMesh) this.activeUnit.hpBarMesh.visible = false;
    if (this.activeUnit.reactiveArmorMesh) this.activeUnit.reactiveArmorMesh.visible = false;

    // Cập nhật thông số kỹ thuật bên phải
    this.updateSpecPanel(tankType);
    // Lắp bộ trang bị đang dùng lên xe xem trước + vẽ lại trang cửa hàng / trang bị
    if (window.ArmoryUI) ArmoryUI.onTankLoaded(this, tankType);
  }

  // Cập nhật nội dung bảng thông số kỹ thuật
  updateSpecPanel(tankType) {
    const spec = this.tankSpecs[tankType] || this.tankSpecs.ALL_ROUNDER;
    const displayNames = {
      ALL_ROUNDER: 'HALBERD MK.3',
      GATLING: 'HAILSTORM R6',
      ARTILLERY: 'ARBALEST 155',
      SCOUT: 'MARTEN R4'
    };
    const roleLines = {
      ALL_ROUNDER: 'Giáp dày kiên cố – Cân bằng công thủ toàn diện',
      GATLING: 'Bão lửa cận chiến – Áp chế mục tiêu trong tích tắc',
      ARTILLERY: 'Hỏa lực tầm xa – Sát thương diện rộng',
      SCOUT: 'Tốc độ vượt trội – Trinh sát và đột kích'
    };

    const classBadge = document.getElementById('ti-class-badge');
    const tankName = document.getElementById('ti-tank-name');
    const tankSummary = document.getElementById('ti-tank-summary');
    const roleLine = document.getElementById('ti-role-line');

    if (classBadge) classBadge.textContent = spec.className;
    if (tankName) tankName.textContent = displayNames[tankType] || spec.name;
    if (roleLine) roleLine.textContent = roleLines[tankType] || roleLines.ALL_ROUNDER;
    if (tankSummary) tankSummary.textContent = spec.summary;

    // Cập nhật thanh chỉ số
    const hpVal = document.getElementById('ti-stat-hp');
    const barHp = document.getElementById('ti-bar-hp');
    if (hpVal && barHp) {
      hpVal.textContent = Math.round(spec.hpPercent);
      barHp.style.width = `${spec.hpPercent}%`;
    }

    const speedVal = document.getElementById('ti-stat-speed');
    const barSpeed = document.getElementById('ti-bar-speed');
    if (speedVal && barSpeed) {
      speedVal.textContent = Math.round(spec.speedPercent);
      barSpeed.style.width = `${spec.speedPercent}%`;
    }

    const rofVal = document.getElementById('ti-stat-rof');
    const barRof = document.getElementById('ti-bar-rof');
    if (rofVal && barRof) {
      rofVal.textContent = Math.round(spec.rofPercent);
      barRof.style.width = `${spec.rofPercent}%`;
    }

    const rangeVal = document.getElementById('ti-stat-range');
    const barRange = document.getElementById('ti-bar-range');
    if (rangeVal && barRange) {
      rangeVal.textContent = Math.round(spec.rangePercent);
      barRange.style.width = `${spec.rangePercent}%`;
    }

    // Render danh sách đặc điểm thiết kế
    const featContainer = document.getElementById('ti-feature-cards');
    if (featContainer) {
      featContainer.innerHTML = spec.features.map(f => `
        <div class="ti-feature-card">
          <div class="feat-ico"><i class="ti ti-${f.icon}" aria-hidden="true"></i></div>
          <div class="feat-body">
            <h5 class="feat-title">${f.title}</h5>
            <p class="feat-desc">${f.desc}</p>
          </div>
        </div>
      `).join('');
    }

    // Render danh sách đạn dược
    const ammoContainer = document.getElementById('ti-ammo-list');
    if (ammoContainer) {
      ammoContainer.innerHTML = spec.ammoList.map(a => `
        <div class="ti-ammo-card">
          <span class="ammo-tag"><i class="ti ti-bomb" aria-hidden="true"></i></span>
          <div class="ammo-body">
            <span class="ammo-name">${a.name}</span>
            <span class="ammo-desc">${a.desc}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // Vòng lặp render liên tục 60fps cho phòng trưng bày
  animate() {
    if (!this.isOpen) return;

    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

    // Tự động xoay nhẹ nhàng khi không kéo chuột
    if (this.autoRotate && !this.isMouseDown) {
      this.cameraYaw += 0.004;
      this.updateCameraPosition();
    }

    const nowMs = performance.now();
    const dt = Math.min(0.05, Math.max(0, (nowMs - (this.lastFrameMs || nowMs)) / 1000));
    this.lastFrameMs = nowMs;

    // Hoạt ảnh linh kiện xe (radar xoay, nòng súng...)
    if (this.activeUnit) {
      if (this.activeUnit.radarDish) {
        this.activeUnit.radarDish.rotation.y += 0.035;
      }
      this.simulateTestFire(this.activeUnit, dt);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // =========================================================================
  // BẮN THỬ TRONG PHÒNG TRƯNG BÀY: chạy đúng logic bắn của spg.js với đạn giả
  // (không tạo đạn thật), để xem hiệu ứng nòng, khói, giật nòng, nóng nòng và nghe âm thanh
  // =========================================================================
  startTestFire() {
    this.showTestRange();
    if (window.soundEngine) {
      if (typeof window.soundEngine.init === 'function') window.soundEngine.init();
      if (typeof window.soundEngine.resume === 'function') window.soundEngine.resume();
    }
    this.testFiring = true;
    const btn = document.getElementById('ti-test-fire-btn');
    if (btn) btn.classList.add('active');
  }

  stopTestFire() {
    this.testFiring = false;
    const btn = document.getElementById('ti-test-fire-btn');
    if (btn) btn.classList.remove('active');
  }

  simulateTestFire(u, dt) {
    if (!this.testBallistics) {
      this.testBallistics = {
        wind: { direction: 0, speed: 0, vx: 0, vz: 0 },
        fireShell3D: (shooter, az, el, charge, ammoType) => {
          this.queueTestImpact(shooter, ammoType || 'NORMAL');
          return {};
        }
      };
      this.testRadar = { registerShot() {} };
    }
    const rapid = (u.tankType === 'GATLING' || u.tankType === 'SCOUT') && u.selectedAmmo !== 'ANTI_TANK_MISSILE';
    // Phòng xem: ống phóng nạp lại nhanh (1.2 s) để bắn thử liên tục
    if (u.antiTankCooldown > 0) u.antiTankCooldown = Math.max(0, Math.min(u.antiTankCooldown, 1.2) - dt);
    if (rapid) {
      u.updateGatling(dt, !!this.testFiring, this.testBallistics, this.testRadar);
    } else {
      if (u.reloadTimer > 0) {
        u.reloadTimer = Math.max(0, u.reloadTimer - dt);
        if (u.reloadTimer === 0 && window.soundEngine) window.soundEngine.playReloadDone();
      }
      let canFire = true;
      if (u.tankType === 'ARTILLERY') {
        // Pháo tự hành: bấm bắn thử -> hạ chân chống & càng sau, nâng nòng, rồi mới khai hỏa
        if (this.testFiring) u.deployProgress = Math.min(2.0, (u.deployProgress || 0) + dt * 1.4);
        u.isDeployed = (u.deployProgress || 0) >= 2.0;
        canFire = u.isDeployed;
        if (u.barrelPivot && (u.deployProgress || 0) > 0) {
          const targetEl = 0.5 * Math.min(1, u.deployProgress / 2);
          u.barrelPivot.rotation.x += (targetEl - u.barrelPivot.rotation.x) * Math.min(1, dt * 3);
        }
      }
      if (this.testFiring && canFire && u.reloadTimer <= 0) {
        u.fire(this.testBallistics, this.testRadar);
      }
    }

    // Phục hồi giật nòng & nhún thân xe như trong trận
    if (u.barrelRecoil > 0 && u.barrelGroup) {
      u.barrelRecoil = Math.max(0, u.barrelRecoil - dt * 38);
      u.barrelGroup.position.z = u.barrelRecoil;
    }
    if (typeof u.updateRecoilRock === 'function') u.updateRecoilRock(dt);
    if (u.chassisGroup) {
      u.chassisGroup.rotation.x = u.rockPitch || 0;
      u.chassisGroup.rotation.z = u.rockRoll || 0;
    }

    if (u.barrelSmokeTimer > 0) {
      u.barrelSmokeTimer -= dt;
      if (Math.random() < 0.4) u.spawnBarrelSmokePuff(this.testBallistics.wind);
    }
    if (typeof u.updateFXParticles === 'function') u.updateFXParticles(dt);
    if (u.modelAnimator) u.modelAnimator.update(dt, u);
    this.updateTestImpacts(dt);
  }

  // ---------------------------------------------------------------------------
  // MÔ PHỎNG ĐIỂM NỔ CUỐI: không mô phỏng đường bay, chỉ cho đạn nổ trên mặt đất phía trước nòng
  // sau một khoảnh khắc (giả lập thời gian bay), dùng đúng hiệu ứng + âm thanh trong trận
  // ---------------------------------------------------------------------------
  renderAmmoTestChips() {
    const box = document.getElementById('ti-ammo-test');
    const u = this.activeUnit;
    if (!box || !u) return;
    const labels = {
      NORMAL: 'THƯỜNG', AP: 'XUYÊN GIÁP', HE: 'NỔ MẠNH', CLUSTER: 'ĐẠN CHÙM',
      GATLING_BULLET: '30MM', SCOUT_BULLET: 'SÚNG MÁY', INCENDIARY: 'ĐẠN CHÁY', ANTI_TANK_MISSILE: 'TÊN LỬA'
    };
    const list = u.availableAmmos || ['NORMAL'];
    if (!list.includes(u.selectedAmmo)) u.selectedAmmo = list[0];
    box.innerHTML = list.map(a =>
      `<button class="ti-ammo-chip${a === u.selectedAmmo ? ' active' : ''}" data-ammo="${a}">${labels[a] || a}</button>`
    ).join('');
    box.querySelectorAll('.ti-ammo-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        u.selectedAmmo = btn.getAttribute('data-ammo');
        box.querySelectorAll('.ti-ammo-chip').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  }

  // Bãi đất bắn thử quanh bệ trưng bày + lùi camera để thấy cả điểm nổ
  showTestRange() {
    if (!this.scene) return;
    if (!this.testRange) {
      const g = new THREE.Group();
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(420, 64),
        new THREE.MeshStandardMaterial({ color: 0x241f19, roughness: 1, metalness: 0 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.04;
      ground.receiveShadow = true;
      g.add(ground);
      // Vạch cự ly mờ để dễ ước lượng khoảng cách nổ
      for (const r of [100, 200, 300]) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.6, r + 0.6, 96),
          new THREE.MeshBasicMaterial({ color: 0x6b5e45, transparent: true, opacity: 0.45, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.0;
        g.add(ring);
      }
      this.scene.add(g);
      this.testRange = g;
    }
    this.testRange.visible = true;
    if (!this.testRangeCamSet) {
      this.testRangeCamSet = true;
      this.cameraDistance = Math.max(this.cameraDistance, 240);
      this.cameraPitch = Math.max(this.cameraPitch, 0.38);
      this.updateCameraPosition();
    }
  }

  getTestEffects() {
    if (!this.testEffects && typeof EffectsManager !== 'undefined' && this.scene) {
      // EffectsManager chỉ cần scene + terrain: cấp mặt đất phẳng của phòng trưng bày
      this.testEffects = new EffectsManager({
        scene: this.scene,
        terrain: { getElevationAt: () => 0, checkHorseshoeCollision: () => null }
      });
    }
    return this.testEffects;
  }

  queueTestImpact(shooter, ammoType) {
    const u = shooter || this.activeUnit;
    if (!u || !this.pendingImpacts) return;
    const rapid = ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY';
    // Hướng nằm ngang của nòng -> điểm chạm đất phía trước
    let dx = 0, dz = -1;
    if (typeof u.getMuzzleWorldTransform === 'function') {
      const m = u.getMuzzleWorldTransform();
      const h = Math.hypot(m.direction.x, m.direction.z);
      if (h > 0.05) { dx = m.direction.x / h; dz = m.direction.z / h; }
    }
    const dist = rapid ? 82 + Math.random() * 22 : 108;
    const spread = rapid ? 7 : 2;
    const x = dx * dist + (Math.random() - 0.5) * spread * 2;
    const z = dz * dist + (Math.random() - 0.5) * spread * 2;
    const delay = rapid ? 0.12 : (u.tankType === 'ARTILLERY' ? 0.7 : 0.28);
    this.pendingImpacts.push({ t: delay, x, z, ammoType, dist });
  }

  updateTestImpacts(dt) {
    const fx = this.getTestEffects();
    if (fx) fx.update(dt);
    if (!this.pendingImpacts) return;
    for (let i = this.pendingImpacts.length - 1; i >= 0; i--) {
      const p = this.pendingImpacts[i];
      p.t -= dt;
      if (p.t > 0) continue;
      this.pendingImpacts.splice(i, 1);
      this.spawnTestImpact(p);
    }
  }

  spawnTestImpact(p) {
    const fx = this.getTestEffects();
    const se = window.soundEngine;
    if (p.ammoType === 'CLUSTER') {
      // Đạn chùm: nổ mẹ trên không rồi rải đạn con xuống mặt đất xung quanh
      if (se) se.playExplosionAtDistance(p.dist, 'AIRBURST', 'CLUSTER');
      for (let k = 0; k < 9; k++) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 30;
        this.pendingImpacts.push({ t: 0.25 + Math.random() * 0.45, x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, ammoType: 'CLUSTER_SUBMUNITION', dist: p.dist });
      }
      return;
    }
    if (fx) fx.createImpactEffects(p.x, 0, p.z, p.ammoType, 'GROUND');
    if (se && typeof se.playExplosionAtDistance === 'function') se.playExplosionAtDistance(p.dist, 'GROUND', p.ammoType);
  }

  clearTestImpacts() {
    this.pendingImpacts = [];
    const fx = this.testEffects;
    if (fx && fx.fx) fx.fx.clear();
    if (fx && fx.explosions3D) {
      for (const e of fx.explosions3D) {
        if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
        if (e.light && e.light.parent) e.light.parent.remove(e.light);
      }
      fx.explosions3D.length = 0;
    }
  }

  clearUnitFX(u) {
    if (!u || !u.fxParticles) return;
    for (const p of u.fxParticles) {
      if (p.mesh && p.mesh.userData && p.mesh.userData.fxKind && window.SpgFXPool) window.SpgFXPool.release(p.mesh);
      else if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    }
    u.fxParticles.length = 0;
    if (window.soundEngine && typeof window.soundEngine.updateGatlingMotor === 'function') {
      window.soundEngine.updateGatlingMotor(0, false, 0, false, u.tankType);
    }
  }

  // Mở giao diện 3D
  open(tankType = 'ALL_ROUNDER') {
    if (!document.getElementById('tank-inspector-overlay')) {
      this.createDomElements();
      this.bindEvents();
      if (window.ArmoryUI) ArmoryUI.attach(this);   // bảng chọn trang bị cột trái (giáp / đạn / phụ kiện)
    }
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay) return;

    this.isOpen = true;
    overlay.classList.remove('hidden');

    // Hồ sơ góc trên: lấy đúng như góc sảnh (tên tài khoản, hoặc "Chưa đăng nhập")
    const srcName = document.getElementById('mm-display-name'), srcRank = document.querySelector('.mm-commander-profile .rank-text');
    const nameEl = overlay.querySelector('.ti-profile-name'), rankEl = overlay.querySelector('.ti-profile-rank');
    if (nameEl && srcName) nameEl.textContent = srcName.textContent;
    if (rankEl && srcRank) rankEl.textContent = srcRank.textContent;

    this.initThreeScene();

    // Đồng bộ nút tab đang active
    const tabs = document.querySelectorAll('.ti-tab-btn');
    tabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tank-type') === tankType);
    });

    this.loadTankModel(tankType, this.currentTeam);
    this.animate();
  }

  // Đóng giao diện
  close() {
    const overlay = document.getElementById('tank-inspector-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    this.stopTestFire();
    if (this.activeUnit) this.clearUnitFX(this.activeUnit);
    this.clearTestImpacts();
    this.isOpen = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Gắn sự kiện click và phím tắt
  bindEvents() {
    // Nút đóng
    const closeBtn = document.getElementById('ti-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Bấm vào nền mờ để đóng
    const backdrop = document.querySelector('.ti-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.close());
    }

    // Nút chuyển tab 4 dòng xe
    const tabs = document.querySelectorAll('.ti-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tType = tab.getAttribute('data-tank-type') || 'ALL_ROUNDER';
        this.loadTankModel(tType, this.currentTeam);
      });
    });

    // Nút chuyển màu sơn ngụy trang
    const camoBtns = document.querySelectorAll('.ti-camo-btn');
    camoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        camoBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const team = btn.getAttribute('data-team') || 'BLUE';
        this.loadTankModel(this.currentTankType, team);
      });
    });

    // Nút bắn thử: giữ chuột để xả liên thanh, bấm để khai hỏa pháo
    const testFireBtn = document.getElementById('ti-test-fire-btn');
    if (testFireBtn) {
      testFireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.startTestFire(); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => testFireBtn.addEventListener(ev, () => this.stopTestFire()));
    }
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.code !== 'Space') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.startTestFire();
    }, true);
    window.addEventListener('keyup', (e) => {
      if (!this.isOpen || e.code !== 'Space') return;
      e.preventDefault();
      e.stopPropagation();
      this.stopTestFire();
    }, true);

    // Nút bật/tắt tự động xoay
    const autoRotateToggle = document.getElementById('ti-autorotate-toggle');
    if (autoRotateToggle) {
      autoRotateToggle.addEventListener('click', () => {
        this.autoRotate = !this.autoRotate;
        autoRotateToggle.classList.toggle('active', this.autoRotate);
        autoRotateToggle.innerHTML = this.autoRotate ? '<i class="ti ti-refresh" aria-hidden="true"></i> Tự động xoay: BẬT' : '<i class="ti ti-player-pause" aria-hidden="true"></i> Tự động xoay: TẮT';
      });
    }

    // Nút Info trên thanh trên cùng của sảnh chờ
    const mmOpenBtn = document.getElementById('mm-open-tank-inspector-btn');
    if (mmOpenBtn) {
      mmOpenBtn.addEventListener('click', () => {
        let currentType = 'ALL_ROUNDER';
        if (window.matchmakingController && window.matchmakingController.selectedTankType) {
          currentType = window.matchmakingController.selectedTankType;
        }
        this.open(currentType);
      });
    }

    // Nút Info trên thanh tác chiến trong trận đấu
    const inGameOpenBtn = document.getElementById('toggle-tank-inspector-btn');
    if (inGameOpenBtn) {
      inGameOpenBtn.addEventListener('click', () => {
        let currentType = 'ALL_ROUNDER';
        if (this.game && this.game.playerUnit && this.game.playerUnit.tankType) {
          currentType = this.game.playerUnit.tankType;
        } else if (window.matchmakingController && window.matchmakingController.selectedTankType) {
          currentType = window.matchmakingController.selectedTankType;
        }
        if (this.isOpen) {
          this.close();
        } else {
          this.open(currentType);
        }
      });
    }

    // Các nút "<i class="ti ti-zoom-in" aria-hidden="true"></i> XEM 3D" trên từng thẻ xe
    const inspectCardBtns = document.querySelectorAll('.btn-inspect-tank-3d');
    inspectCardBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tType = btn.getAttribute('data-tank-type') || 'ALL_ROUNDER';
        this.open(tType);
      });
    });

    // Nút chọn loại xe này để xuất trận
    const selectBtn = document.getElementById('ti-select-this-tank-btn');
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        const selectedType = this.currentTankType;

        // Cập nhật vào sảnh chờ Matchmaking nếu có
        if (window.matchmakingController) {
          window.matchmakingController.selectedTankType = selectedType;
          const mySlot = window.matchmakingController.slots.find(s => s.isMe);
          if (mySlot) mySlot.tankType = selectedType;
          
          const classCards = document.querySelectorAll('.mm-class-card');
          classCards.forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-tank-type') === selectedType);
          });

          window.matchmakingController.renderLobby();
          window.matchmakingController.broadcastRoomUpdate();
        }

        // Đóng popup sau khi chọn
        this.close();
      });
    }

    // Lắng nghe sự kiện click mở Inspector trên toàn bộ trang (Event Delegation)
    document.addEventListener('click', (e) => {
      // 1. Nút xem 3D trên thẻ xe sảnh chờ (.btn-inspect-tank-3d)
      const btnCard = e.target.closest('.btn-inspect-tank-3d');
      if (btnCard) {
        e.preventDefault();
        e.stopPropagation();
        const tType = btnCard.getAttribute('data-tank-type') || 'ALL_ROUNDER';
        this.open(tType);
        return;
      }

      // 2. Nút Xem xe 3D trên thanh header sảnh chờ (#mm-open-tank-inspector-btn)
      const btnHeader = e.target.closest('#mm-open-tank-inspector-btn');
      if (btnHeader) {
        e.preventDefault();
        e.stopPropagation();
        let curType = 'ALL_ROUNDER';
        if (window.matchmakingController && window.matchmakingController.selectedTankType) {
          curType = window.matchmakingController.selectedTankType;
        }
        this.open(curType);
        return;
      }

      // 3. Nút Xem xe 3D trên thanh tác chiến trong trận (#toggle-tank-inspector-btn)
      const btnInGame = e.target.closest('#toggle-tank-inspector-btn');
      if (btnInGame) {
        e.preventDefault();
        e.stopPropagation();
        let curType = 'ALL_ROUNDER';
        if (window.game && window.game.player && window.game.player.tankType) {
          curType = window.game.player.tankType;
        }
        if (this.isOpen) this.close();
        else this.open(curType);
        return;
      }
    });

    // Phím tắt bàn phím: ESC hoặc phím I để mở/đóng
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      } else if ((e.key === 'i' || e.key === 'I') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (this.isOpen) {
          this.close();
        } else {
          // Lấy loại xe đang chọn từ sảnh chờ
          let initialType = 'ALL_ROUNDER';
          if (window.matchmakingController && window.matchmakingController.selectedTankType) {
            initialType = window.matchmakingController.selectedTankType;
          }
          this.open(initialType);
        }
      }
    });
  }
}

window.TankInspector = TankInspector;

// Khởi tạo phòng ngắm xe 3D độc lập an toàn ngay khi trang tải xong
if (typeof document !== 'undefined') {
  const initInspectorSafely = () => {
    if (!window.tankInspector && typeof TankInspector !== 'undefined') {
      try {
        window.tankInspector = new TankInspector(window.artilleryGame || null);
        console.log('Phòng ngắm xe 3D đã sẵn sàng tương tác!');
      } catch (err) {
        console.warn('Lỗi khi tự động khởi tạo TankInspector:', err);
      }
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInspectorSafely);
  } else {
    initInspectorSafely();
  }
}
