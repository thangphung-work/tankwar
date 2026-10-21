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
    this.keys = {};                      // phím lái thử đang giữ (W A S D, Shift, Q E, Z X)
    this.camFocus = { x: 0, z: 0 };      // tâm camera: bám theo xe khi lái thử

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
            <div class="ti-currency gold ti-silver off" id="ti-silver" title="Bạc hiện có"><span><i class="ti ti-coins" aria-hidden="true"></i></span><b>0</b><small>Bạc</small></div>
            <div class="ti-profile"><img src="assets/commander_avatar.jpg" alt="Chỉ huy"><span><b class="ti-profile-name">Chưa đăng nhập</b><small class="ti-profile-rank"></small></span><i><i class="ti ti-settings" aria-hidden="true"></i></i></div>
          </div>
        </header>
        <div class="ti-body">
          <section class="ti-viewport-container" id="ti-vehicle-stage">
            <div class="ti-stage">
              <canvas id="ti-canvas"></canvas>
              <div class="ti-stage-foot">
                <div class="ti-range-readout" id="ti-range-readout" aria-live="polite"></div>
                <div class="ti-range-bar" id="ti-range-bar" aria-label="Chọn bãi thử"></div>
                <div class="ti-controls-hint"><span><kbd>W A S D</kbd> lái</span><span><kbd>Shift</kbd> tăng tốc</span><span><kbd>Q E</kbd> xoay tháp</span><span><kbd>Z X</kbd> nâng hạ nòng</span><span><kbd>Space</kbd> bắn</span><span><kbd>G</kbd> thả khói</span><span><i class="ti ti-mouse" aria-hidden="true"></i> nhấp trái ngắm + bắn · nhấp phải lái tới · kéo xoay · cuộn zoom</span><button id="ti-autorotate-toggle" class="ti-hint-toggle active">TỰ XOAY</button></div>
              </div>
              <div class="ti-toast" id="ti-toast" role="status"></div>
              <div class="ti-test-panel"><button id="ti-test-fire-btn" class="ti-hint-toggle ti-test-fire-btn" title="Giữ để xả đạn liên thanh / bấm để khai hỏa pháo"><i class="ti ti-flame" aria-hidden="true"></i> BẮN THỬ [SPACE]</button><div class="ti-ammo-test" id="ti-ammo-test"></div><button id="ti-range-enter" class="ti-range-enter" title="Phòng thử đạn toàn màn hình: chọn địa hình (đồi dốc, lội nước, sa mạc, rừng & vật cản), lái thử, bắn thử, thả khói với đúng xe + bộ trang bị đang lắp"><i class="ti ti-target-arrow" aria-hidden="true"></i> PHÒNG THỬ ĐẠN</button><a class="ti-lab-link ti-lab-detail" href="fx_lab.html" target="_blank" rel="noopener" title="Trang riêng: quỹ đạo, tốc độ chậm, bắn vào tường / tòa nhà / xe bia / boong-ke"><i class="ti ti-flask" aria-hidden="true"></i> THỬ ĐẠN CHI TIẾT ↗</a><button id="ti-wall-reset-btn" class="ti-lab-link ti-wall-btn" title="Tường tự dựng lại sau 5 giây không trúng đạn"><i class="ti ti-wall" aria-hidden="true"></i> DỰNG LẠI TƯỜNG</button></div>
              <div class="ti-range-head"><button id="ti-range-exit" class="ti-range-exit" title="Về màn thông tin xe [ESC]"><i class="ti ti-chevron-left" aria-hidden="true"></i> THOÁT</button><div class="ti-range-title"><b>PHÒNG THỬ ĐẠN</b><span id="ti-range-tank"></span></div></div>
            </div>
            <div class="ti-equip-dock" id="ti-equip-dock" aria-label="Chọn trang bị"></div>
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

    const rect = (canvas.parentElement || canvas).getBoundingClientRect();   // khung .ti-stage (phần trên dải trang bị)
    const width = rect.width || 800;
    const height = rect.height || 600;

    this.camera = new THREE.PerspectiveCamera(38, width / height, 1, 2800);
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
    // Cùng chuẩn màu với renderer trong trận: output Linear, màu hex / texture canvas dùng thẳng.
    // (Trước đây bật sRGB output: màu đã ở hệ sRGB bị mã hóa gamma thêm lần nữa -> sơn bạc, xám, như phủ sương.)
    // Tông màu dùng chung đường cong "vai mềm" của cảnh trận (SkySystem.installToneCurve): trung tông giữ nguyên,
    // chỉ nén vùng sáng -> xe ở phòng xem trông y như trong trận. (ACES của three r128 tự nhân exposure / 0.6
    // rồi nén vùng sáng nên sơn xanh ô-liu bị đẩy thành xanh bạc hà.)
    if (typeof SkySystem !== 'undefined' && SkySystem.installToneCurve) {
      SkySystem.installToneCurve(this.renderer, 1.1);
    } else if (THREE.ACESFilmicToneMapping !== undefined) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.9;
    }
    this.renderer.outputEncoding = THREE.LinearEncoding;

    // Ánh sáng chiếu rọi chuẩn studio khí tài (tổng gần bằng nắng + trời trong trận: đèn quá mạnh làm mặt sáng ngả pastel)
    const ambientLight = new THREE.AmbientLight(0xbfd3e6, 0.25);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xdceeff, 0x4b3828, 0.42);
    this.scene.add(hemisphereLight);

    const dirLightMain = new THREE.DirectionalLight(0xfff1d8, 1.2);
    dirLightMain.position.set(70, 110, 80);
    dirLightMain.castShadow = true;
    dirLightMain.shadow.mapSize.width = 1024;
    dirLightMain.shadow.mapSize.height = 1024;
    dirLightMain.shadow.camera.near = 10;
    dirLightMain.shadow.camera.far = 420;
    const d = 110;
    dirLightMain.shadow.camera.left = -d;
    dirLightMain.shadow.camera.right = d;
    dirLightMain.shadow.camera.top = d;
    dirLightMain.shadow.camera.bottom = -d;
    this.scene.add(dirLightMain);
    // nắng + vùng đổ bóng đi theo xe khi lái ra xa bệ (xem animate)
    this.sunLight = dirLightMain;
    this.scene.add(dirLightMain.target);

    // Đèn viền phản xạ sau lưng (Rim Light) làm nổi bật đường nét kim loại
    const rimLight = new THREE.DirectionalLight(0xd9cfb4, 0.45);
    rimLight.position.set(-80, 50, -70);
    this.scene.add(rimLight);

    const softFillLight = new THREE.DirectionalLight(0xd7e8ff, 0.25);
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

    this.scene.add(this.platformGroup);
    this.testRangeCamSet = true;   // bãi thử hiện sẵn, giữ góc nhìn gần lúc mới mở
    this.showTestRange();
    this.buildTestWall();

    // Lắng nghe đổi kích thước khung (cửa sổ đổi cỡ, dải trang bị cao/thấp)
    const fit = () => {
      if (!this.renderer || !this.camera) return;
      const r = (canvas.parentElement || canvas).getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      this.camera.aspect = r.width / r.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(r.width, r.height);
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(canvas.parentElement || canvas);
    else window.addEventListener('resize', fit);

    this.setupMouseControls(canvas);
  }

  // Chuột: kéo trái xoay camera 360°, cuộn thu phóng; nhấp trái (không kéo) ngắm + bắn vào điểm đó, nhấp phải lái xe tới điểm đó
  setupMouseControls(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.isMouseDown = true;
      this._dragPx = 0;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isMouseDown && e.button === 0 && this._dragPx < 6) this.mouseAimFire(e.clientX, e.clientY);
      this.isMouseDown = false;
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.mouseDriveTo(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.isMouseDown) return;

      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;
      this._dragPx += Math.abs(deltaX) + Math.abs(deltaY);

      this.cameraYaw -= deltaX * 0.005;
      this.cameraPitch += deltaY * 0.004;

      // Giới hạn góc nhìn cao và thấp để không bị lật ngược
      this.cameraPitch = Math.max(0.08, Math.min(Math.PI / 2.3, this.cameraPitch));

      this.updateCameraPosition();
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.08;
      this.cameraDistance += e.deltaY * zoomSpeed;
      this.cameraDistance = Math.max(50, Math.min(400, this.cameraDistance));
      this.updateCameraPosition();
    }, { passive: false });
  }

  // Điểm dưới con trỏ: tường thử hoặc mặt sân (đồi, nước, đá, cây...) — null nếu trỏ lên trời
  pickPoint(clientX, clientY) {
    if (!this.camera || !this.renderer) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = this._pickRay || (this._pickRay = new THREE.Raycaster());
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    let best = null;
    const wallG = this.testWallGroup;
    if (wallG && wallG.visible) {
      for (const it of ray.intersectObject(wallG, true)) {
        const mt = Array.isArray(it.object.material) ? it.object.material[0] : it.object.material;
        if (!it.object.visible || it.object.userData.isFxDecal || (mt && mt.isMeshBasicMaterial)) continue;
        best = { point: it.point.clone(), dist: it.distance };
        break;
      }
    }
    // mặt sân: dò dọc tia từng đoạn ngắn
    const o = ray.ray.origin, d = ray.ray.direction, F = this.field;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let t = 0; t < 3000 && (!best || t < best.dist); t += 12) {
      a.copy(o).addScaledVector(d, t);
      b.copy(o).addScaledVector(d, t + 12);
      if (F) {
        const h = F.segmentHit(a, b);
        if (h) { const dist = h.point.distanceTo(o); if (!best || dist < best.dist) best = { point: h.point.clone(), dist }; break; }
      } else if (b.y <= 0) {
        const k = a.y / Math.max(1e-6, a.y - b.y);
        best = { point: a.clone().lerp(b, k).setY(0), dist: t + 12 * k };
        break;
      }
    }
    return best ? best.point : null;
  }

  // Nhấp trái: tháp quay / nòng nâng tới điểm trỏ (đúng tốc độ thật), quay xong thì tự bắn
  // (pháo 1 phát khi nạp xong, súng liên thanh 1 loạt ngắn)
  mouseAimFire(clientX, clientY) {
    const u = this.activeUnit;
    if (!u || u.isDead) return;
    const p = this.pickPoint(clientX, clientY);
    if (!p) return;
    const m = typeof u.getMuzzleWorldTransform === 'function' ? u.getMuzzleWorldTransform() : null;
    const sy = m ? m.position.y : (u.y || 0) + 17;
    const dx = p.x - u.x, dz = p.z - u.z, d = Math.hypot(dx, dz);
    if (d < 20) return;
    const az = Math.atan2(dx, -dz) * 180 / Math.PI;
    // góc nòng theo cùng sơ tốc / trọng lực với đường đạn mô phỏng (queueTestImpact):
    // xe tăng gần như bắn thẳng, lựu pháo bắn cầu vồng (nghiệm góc cao)
    const arty = u.tankType === 'ARTILLERY';
    const v2 = Math.pow(this.testShotSpeed(u, u.selectedAmmo), 2), g = 78, h = p.y - sy;
    const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
    let el = disc < 0 ? 45 : Math.atan((v2 + (arty ? 1 : -1) * Math.sqrt(disc)) / (g * d)) * 180 / Math.PI;
    const elMax = this.testBallistics ? this.testBallistics.maxElevationFor(u) : 45;
    el = Math.max(-10, Math.min(elMax, el));
    u.aimTo(az, u.tankType === 'GATLING' ? undefined : el);
    this.mouseShot = { t: 0, fireT: 0, fired: false };
    if (this.autoRotate) { this.autoRotate = false; this.syncAutoRotateBtn(); }
    this.resumeTestSound();
  }

  // Nhấp phải: lái tự động tới điểm trỏ (bấm W A S D để tự lái lại)
  mouseDriveTo(clientX, clientY) {
    const u = this.activeUnit;
    if (!u || u.isDead) return;
    const p = this.pickPoint(clientX, clientY);
    if (!p) return;
    this.driveTo = { x: p.x, z: p.z };
    if (typeof WorldMarkers !== 'undefined' && this.scene) {
      if (!this._driveMarker || this._driveMarker.parent !== this.scene) {
        this._driveMarker = WorldMarkers.groundMarker('move');
        this.scene.add(this._driveMarker);
      }
      const M = this._driveMarker;
      M.userData.pop = 0; M.userData.fade = 1; M.visible = true;
    }
    if (this.autoRotate) { this.autoRotate = false; this.syncAutoRotateBtn(); }
    this.resumeTestSound();
  }

  resumeTestSound() {
    const se = window.soundEngine;
    if (!se) return;
    if (typeof se.init === 'function') se.init();
    if (typeof se.resume === 'function') se.resume();
  }

  // Lái tới điểm nhấp phải: thân xe quay về hướng điểm rồi chạy, gần tới thì giảm tốc và dừng (như lái tự động trong trận)
  updateDriveTo(u, dt, boost) {
    const A = this.driveTo, M = this._driveMarker;
    if (A) {
      const dx = A.x - u.x, dz = A.z - u.z, dist = Math.hypot(dx, dz);
      if (dist < 14 || u.isDead) { u.steer(0, 0, dt, false); this.driveTo = null; }
      else {
        u.steer(dx, dz, dt, boost && dist > 250);
        const cap = Math.max(22, dist * 1.1);
        if (dist < 140 && Math.abs(u.speed) > cap) u.speed = Math.sign(u.speed) * Math.max(cap, Math.abs(u.speed) - u.acceleration * 1.5 * dt);
      }
    }
    if (M && typeof WorldMarkers !== 'undefined') {
      if (this.driveTo) {
        const T = this.getTestTerrain(), y = T.getElevationAt(this.driveTo.x, this.driveTo.z);
        M.userData.r0 = WorldMarkers.sizeFor(this.camera, this.driveTo.x, y, this.driveTo.z, 12, 0.026);
        WorldMarkers.placeOnGround(M, T, this.driveTo.x, this.driveTo.z, null, M.userData.r0, 0);
        const k = 1 - M.userData.pop;
        M.scale.setScalar(M.userData.r0 * (1 + k * k * 0.6));
      }
      WorldMarkers.tickMove(M, dt, !!this.driveTo);
    }
  }

  // Sơ tốc đạn thử (đơn vị / giây, 8 đơn vị = 1 m). Lựu pháo thu nhỏ để quỹ đạo cầu vồng rơi gọn trong bãi thử
  testShotSpeed(u, ammoType) {
    const rapid = ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY';
    return u.tankType === 'ARTILLERY' ? 170
      : rapid ? 7200 : ammoType === 'ANTI_TANK_MISSILE' || ammoType === 'RPG' ? 2200 : 12000;
  }

  updateCameraPosition() {
    if (!this.camera) return;
    const x = this.cameraDistance * Math.cos(this.cameraPitch) * Math.sin(this.cameraYaw);
    const y = this.cameraDistance * Math.sin(this.cameraPitch) + 10;
    const z = this.cameraDistance * Math.cos(this.cameraPitch) * Math.cos(this.cameraYaw);

    const f = this.camFocus || { x: 0, z: 0 };
    // lái lên đồi / xuống sông: camera nâng hạ theo mặt đất dưới xe (mượt)
    const gy = this.field ? this.field.groundAt(f.x, f.z) : 0;
    this.camGroundY = this.camGroundY === undefined ? gy : this.camGroundY + (gy - this.camGroundY) * 0.12;
    const fy = this.camGroundY;
    this.camera.position.set(f.x + x, y + fy, f.z + z);
    if (this.field) {   // không chui xuống dưới sườn đồi phía sau camera
      const cg = this.field.groundAt(this.camera.position.x, this.camera.position.z) + 8;
      if (this.camera.position.y < cg) this.camera.position.y = cg;
    }
    this.camera.lookAt(f.x, 10 + fy, f.z);
  }

  // Tải xe tăng 3D lên sàn bục
  loadTankModel(tankType, team = this.currentTeam) {
    if (!this.scene) return;
    this.driveTo = null; this.mouseShot = null;

    // Xóa xe cũ (kèm khói/lửa đầu nòng còn đang bay)
    if (this.activeUnit && this.activeUnit.group) {
      this.clearUnitFX(this.activeUnit);
      this.clearTestImpacts();
      if (typeof TireTracks !== 'undefined') TireTracks.clear(this.activeUnit);   // vệt xích của xe cũ
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
    this.activeUnit.idleVibeAmp = 0;   // xe đứng yên trên bệ: không rung máy nổ (nhìn gần thấy cả xe run)
    this.testFiring = false;
    this.camFocus = { x: 0, z: 0 };
    this._sndBody = this._sndTurret = undefined;
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

    const nowMs = performance.now();
    const dt = Math.min(0.05, Math.max(0, (nowMs - (this.lastFrameMs || nowMs)) / 1000));
    this.lastFrameMs = nowMs;

    // Lái thử / bắn thử: chạy đúng logic xe trong trận (spg.js)
    if (this.activeUnit) this.simulateTestFire(this.activeUnit, dt);

    // Camera bám theo xe (mượt) + tự xoay rất chậm (~100 giây một vòng) khi không kéo chuột
    const u = this.activeUnit;
    if (u) {
      const k = Math.min(1, dt * 4);
      this.camFocus.x += (u.x - this.camFocus.x) * k;
      this.camFocus.z += (u.z - this.camFocus.z) * k;
    }
    if (this.autoRotate && !this.isMouseDown) this.cameraYaw += 0.06 * dt;
    this.updateCameraPosition();
    if (this.sunLight) {
      const f = this.camFocus, gy = this.field ? this.field.groundAt(f.x, f.z) : 0;
      this.sunLight.position.set(f.x + 70, gy + 110, f.z + 80);
      this.sunLight.target.position.set(f.x, gy, f.z);
    }
    this.updateRangeReadout(dt);

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

  // Mặt đất của sân thử cho spg.update() / hiệu ứng nổ / khói: độ cao + loại đất theo bãi đang chọn (proving_ground.js),
  // biên tròn + đá tảng / xác xe chắn đường, và bức tường thử: thân xe (hộp xoay) + nòng pháo va từng khối bê tông,
  // khối đã vỡ thì đi qua được
  getTestTerrain() {
    if (this.testTerrain) return this.testTerrain;
    if (!this.field) this.ensureField();
    const debris = (x, z) => {
      // gốc tường gãy thấp + ụ gạch vụn dưới chân tường thử: xích bò lên được
      const W = this.testWall;
      if (!W || !W.wall.visible || typeof VehicleCollision === 'undefined') return null;
      if (Math.abs(x - W.cx) > W.hw + 60 || Math.abs(z - W.cz) > W.hd + 60) return null;
      const out = this._testDebris || (this._testDebris = []);
      out.length = 0;
      VehicleCollision.blockDebris(W.wall.S, W.wall.group.position.y, x, z, 40, out);
      return out.length ? out : null;
    };
    if (this.field) {
      this.testTerrain = this.field.makeTerrain({ boxes: (x, z, unit) => this.testWallBoxes(x, z, unit), debris });
      return this.testTerrain;
    }
    // dự phòng (thiếu proving_ground.js): bãi phẳng tròn bán kính 380 như cũ
    const info = { type: 'GRASS', name: 'Bãi thử', speedMult: 1, engineLoad: 1, bumpiness: 0.35, sinkY: 0 };
    this.testTerrain = {
      width: 900, depth: 900, mapType: 'GRASSLAND',
      getElevationAt: () => 0,
      getTerrainInfoAt: () => info,
      checkHorseshoeCollision: () => null,
      resolveVehicleCollision: (x0, z0, x1, z1, r, unit) => {
        const R = 380, d = Math.hypot(x1, z1);
        if (d > R) { x1 *= R / d; z1 *= R / d; }
        const boxes = unit ? this.testWallBoxes(x1, z1, unit) : null;
        if (boxes && boxes.length && typeof VehicleCollision !== 'undefined') {
          const res = VehicleCollision.resolve(unit, x0, z0, x1, z1, boxes);
          return { x: res.x, z: res.z, hit: res.hit || d > R };
        }
        return { x: x1, z: z1, hit: d > R };
      },
      vehicleObstacles: (x, z, unit) => this.testWallBoxes(x, z, unit),
      vehicleDebris: debris
    };
    return this.testTerrain;
  }

  // ---------------------------------------------------------------------------
  // SÂN THỬ NHIỀU ĐỊA HÌNH (src/ui/proving_ground.js) + MÀN KHÓI THỬ (phím G)
  // ---------------------------------------------------------------------------
  ensureField() {
    if (this.field || !this.scene || typeof ProvingGround === 'undefined') return this.field || null;
    this.field = new ProvingGround.Field(this.scene);
    this.field.build(this.rangeMode ? this.savedRange() : 'flat');   // màn thông tin xe: luôn bãi phẳng + tường thử
    this.renderRangeBar();
    return this.field;
  }

  savedRange() {
    let id = 'hills';
    try { id = localStorage.getItem('ti-range') || 'hills'; } catch (e) { /* bỏ qua */ }
    return ProvingGround.PRESETS[id] ? id : 'hills';
  }

  // PHÒNG THỬ ĐẠN (trường bắn): màn riêng toàn màn hình (ẩn thông tin xe + dải trang bị), chọn địa hình, lái / bắn / thả khói
  // với đúng xe + bộ trang bị đang lắp. Thoát (nút / Esc) -> về màn thông tin xe, bãi phẳng như cũ.
  enterRangeMode() {
    if (this.rangeMode || !this.isOpen) return;
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay) return;
    this.rangeMode = true;
    overlay.classList.add('ti-range-mode');
    const nm = document.getElementById('ti-tank-name'), tk = document.getElementById('ti-range-tank');
    if (tk) tk.textContent = nm ? nm.textContent : '';
    if (this.autoRotate) { this.autoRotate = false; this.syncAutoRotateBtn(); }
    this.cameraDistance = 200; this.cameraPitch = 0.42;
    this.setRange(this.savedRange());
  }

  exitRangeMode(opts = {}) {
    if (!this.rangeMode) return;
    this.rangeMode = false;
    const overlay = document.getElementById('tank-inspector-overlay');
    if (overlay) overlay.classList.remove('ti-range-mode');
    const ro = document.getElementById('ti-range-readout');
    if (ro) { ro.innerHTML = ''; this._roHtml = ''; }
    if (!opts.closing) this.setRange('flat', { silent: true });
    else if (this.field && this.field.id !== 'flat') { this.clearTestImpacts(); if (this.smoke) this.smoke.clear(); this.field.build('flat'); if (this.testWall) this.resetTestWall(); }
  }

  // Đổi bãi thử: dựng lại mặt đất + vật thể, dọn hố / vết đạn / khói / vệt xích cũ, đưa xe về bệ
  setRange(id, opts = {}) {
    if (!this.field) this.ensureField();
    if (!this.field || !ProvingGround.PRESETS[id]) return;
    if (this.rangeMode) { try { localStorage.setItem('ti-range', id); } catch (e) { /* bỏ qua */ } }
    this.clearTestImpacts();
    if (this.smoke) this.smoke.clear();
    if (this.activeUnit && typeof TireTracks !== 'undefined') TireTracks.clear(this.activeUnit);
    try { this.field.build(id); } catch (e) { console.warn('[Sân thử] Lỗi dựng bãi', id, e); this.field.build('flat'); }
    if (this.testWall) this.resetTestWall();
    this.camGroundY = undefined;
    this.loadTankModel(this.currentTankType, this.currentTeam);
    this.renderRangeBar();
    const P = ProvingGround.PRESETS[this.field.id];
    if (!opts.silent) this.toast(`<i class="ti ti-${P.icon}"></i> Bãi thử: <b>${P.name}</b> — ${P.desc}`);
  }

  renderRangeBar() {
    const bar = document.getElementById('ti-range-bar');
    if (!bar || typeof ProvingGround === 'undefined') return;
    const cur = this.field ? this.field.id : 'flat';
    bar.innerHTML = '<span class="ti-range-lbl"><i class="ti ti-map-2" aria-hidden="true"></i> BÃI THỬ</span>' +
      ProvingGround.list().map(p => `<button class="ti-range-chip${p.id === cur ? ' active' : ''}" data-range="${p.id}" title="${p.desc}"><i class="ti ti-${p.icon}" aria-hidden="true"></i>${p.name}</button>`).join('') +
      '<button class="ti-range-chip ti-range-home" data-range-home="1" title="Đưa xe về bệ (cả khi xe kẹt / bị phá hủy vì ngập nước)"><i class="ti ti-home" aria-hidden="true"></i>Về bệ</button>';
    if (!bar._bound) {
      bar._bound = true;
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        b.blur();   // để phím W A S D / Space không bấm lại nút
        if (b.dataset.rangeHome) { this.loadTankModel(this.currentTankType, this.currentTeam); this.camGroundY = undefined; return; }
        if (b.dataset.range && (!this.field || b.dataset.range !== this.field.id)) this.setRange(b.dataset.range);
      });
    }
  }

  // Ô thông tin dưới góc trái: mặt đất dưới xe, độ dốc, độ sâu nước, tốc độ, cảnh báo leo dốc / lội nước
  updateRangeReadout(dt) {
    this._roT = (this._roT || 0) + dt;
    if (this._roT < 0.15) return;
    this._roT = 0;
    const el = document.getElementById('ti-range-readout'), u = this.activeUnit, F = this.field;
    if (!el || !u || !F || !this.rangeMode) return;
    const info = F.infoAt(u.x, u.z);
    const slope = Math.round(Math.atan(F.slopeAt(u.x, u.z)) * 180 / Math.PI);
    const v = Math.abs(u.speed || 0) * ((u.waterDepth || 0) > 0.6 ? (u._groundMult || 1) : 1);
    const kmh = Math.round(typeof GameTiming !== 'undefined' && GameTiming.kmh ? GameTiming.kmh(v) : v * 0.45);
    const parts = [`<b>${info.name}</b>`, `Dốc ${slope}°`];
    if ((u.waterDepth || 0) > 0.3) parts.push(`Nước sâu ${(u.waterDepth / 8).toFixed(1)} m <small>(lội tối đa ${((u.wadeMax || 14) / 8).toFixed(1)} m)</small>`);
    parts.push(`${kmh} km/h`);
    let warn = '';
    if (u.isDead && u.submerged) warn = '<i class="ti ti-ripple"></i> XE CHÌM VÌ NGẬP NƯỚC — bấm “Về bệ”';
    else if (u.submerged) warn = `<i class="ti ti-ripple"></i> NGẬP NƯỚC — mất máu dần (còn ${Math.round(100 * u.hp / (u.maxHp || 1))}%)`;
    else if (u.climbStall) warn = '<i class="ti ti-mountain"></i> DỐC QUÁ CAO — xe không leo nổi';
    const html = parts.join(' · ') + (warn ? `<div class="ti-range-warn">${warn}</div>` : '');
    if (html !== this._roHtml) { el.innerHTML = html; this._roHtml = html; }
  }

  toast(html, ms = 2600) {
    const el = document.getElementById('ti-toast');
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  // Phím G: phóng màn khói trước mũi xe (cần lắp "Ống phóng lựu khói"); trong phòng xem thả không giới hạn.
  // Khói thử dùng bãi khói riêng (Equipment.SmokeField) -> không lọt vào trận đang chơi nếu mở phòng xem giữa trận.
  testSmoke() {
    const u = this.activeUnit;
    if (!u || u.isDead || typeof Equipment === 'undefined') return;
    if (!Equipment.has(u, 'smoke')) {
      this.toast('<i class="ti ti-cloud"></i> Xe chưa lắp <b>Ống phóng lựu khói</b> — chọn ở dải trang bị bên dưới, nhóm <b>PHỤ KIỆN</b>', 3600);
      return;
    }
    if (!this.smoke && Equipment.SmokeField) this.smoke = Equipment.SmokeField();
    if (!this.smoke) return;
    if (window.soundEngine) {
      if (typeof window.soundEngine.init === 'function') window.soundEngine.init();
      if (typeof window.soundEngine.resume === 'function') window.soundEngine.resume();
    }
    this.smoke.deploy(u, null);
    const n = Equipment.smokeMax ? Equipment.smokeMax(u) : 3;
    this.toast(`<i class="ti ti-cloud"></i> Đã bắn 1 loạt lựu đạn khói (~15 giây). Trong trận: ${n} ống mỗi bên, mang tối đa ${2 * n} quả lấy từ kho; ở đây bắn thoải mái`);
  }

  // Các khối còn đứng của tường thử gần xe (hộp vật cản cho VehicleCollision)
  testWallBoxes(x, z, unit) {
    const W = this.testWall;
    if (!W || !W.wall.visible || typeof VehicleCollision === 'undefined') return null;
    const reach = VehicleCollision.reach(unit) + 6;
    if (Math.abs(x - W.cx) > W.hw + reach || Math.abs(z - W.cz) > W.hd + reach) return null;
    return VehicleCollision.blockBoxes(W.wall.S, W.wall.group.position.y);
  }

  // Có đang trong trận không (khi đó trận tự lo tiếng máy, phòng xem không đè lên)
  inLiveMatch() {
    const g = window.game;
    return !!(g && g.isGameStarted && !g.isGameOver);
  }

  simulateTestFire(u, dt) {
    if (!this.testBallistics) {
      const BP = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.prototype : null;
      this.testBallistics = {
        wind: { direction: 0, speed: 0, vx: 0, vz: 0 },
        maxElevationFor: BP ? (sh) => BP.maxElevationFor.call(null, sh) : () => 20,
        maxLobElevationFor: BP ? (sh) => BP.maxLobElevationFor.call(null, sh) : () => 20,
        fireShell3D: (shooter, az, el, charge, ammoType) => {
          this.queueTestImpact(shooter, ammoType || 'NORMAL');
          return {};
        }
      };
      this.testRadar = { registerShot() {} };
    }
    const K = this.keys || {};
    if (u.isDead) return;

    // LÁI THỬ: W/S tiến lùi, A/D quay thân xe (xe xích xoay tại chỗ; xe bánh lốp bẻ lái, chỉ quay khi lăn bánh), Shift tăng tốc (theo hướng xe)
    const fwd = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), turn = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    const boost = !!(K.ShiftLeft || K.ShiftRight);
    if (this.driveTo && (fwd || turn)) this.driveTo = null;   // tự cầm lái: hủy lái tới điểm nhấp phải
    if (this.driveTo) this.updateDriveTo(u, dt, boost);
    else { u.move(fwd, turn, dt, boost); this.updateDriveTo(u, dt, boost); }
    // THÁP & NÒNG: Q/E xoay tháp, Z nâng / X hạ nòng — đúng tốc độ thật của từng xe như phím mũi tên trong trận
    const TR = u.turretRates ? u.turretRates() : { traverse: 42, elevate: 24 };
    if (K.KeyQ) u.azimuth = (u.azimuth - TR.traverse * dt + 360) % 360;
    if (K.KeyE) u.azimuth = (u.azimuth + TR.traverse * dt) % 360;
    if ((K.KeyZ || K.KeyX) && u.canElevate !== false && u.tankType !== 'GATLING') {
      const elMax = this.testBallistics.maxElevationFor(u);
      if (K.KeyZ) u.elevation = Math.min(elMax, u.elevation + TR.elevate * dt);
      if (K.KeyX) u.elevation = Math.max(-10, u.elevation - TR.elevate * dt);
    }

    // BẮN THỬ: xe liên thanh xả theo nút / Space; pháo bắn khi nạp xong (pháo tự hành phải đứng yên hạ càng)
    const rapid = (u.tankType === 'GATLING' || u.tankType === 'SCOUT') && u.selectedAmmo !== 'ANTI_TANK_MISSILE';
    if (u.antiTankCooldown > 0) u.antiTankCooldown = Math.max(0, Math.min(u.antiTankCooldown, 1.2) - dt);   // ống phóng nạp nhanh để thử liên tục
    // Nhấp trái: chờ tháp quay tới điểm ngắm rồi bắn (pháo: 1 phát khi nạp xong; liên thanh: loạt ~0.6 s); quá 8 s thì bỏ
    const MS = this.mouseShot;
    let mouseFire = false;
    if (MS) {
      MS.t += dt;
      if (u.aimAz === undefined || MS.t > 4) { mouseFire = true; MS.fireT += dt; }
      if (MS.t > 8 || MS.fired || (rapid && MS.fireT > 0.6)) { this.mouseShot = null; mouseFire = mouseFire && !MS.fired; }
    }
    const firing = !!this.testFiring || mouseFire;
    u.isFiringGatling = rapid && firing;
    // Pháo tự hành đang gác nòng trên nóc cabin (không bắn được qua cabin): bấm bắn thử thì tự quay tháp ra sau xe
    if (this.testFiring && u.tankType === 'ARTILLERY' && u.turretInBlind && !K.KeyQ && !K.KeyE && u.aimAz === undefined) {
      u.aimAz = ((-(Math.PI + (u.bodyAngle || 0)) * 180 / Math.PI) % 360 + 360) % 360;
    }
    if (!rapid && firing && u.reloadTimer <= 0 && (u.tankType !== 'ARTILLERY' || u.isDeployed)) {
      u.fire(this.testBallistics, this.testRadar);
      if (MS && mouseFire) MS.fired = true;
    }

    // Toàn bộ chuyển động, hệ treo, xích, bụi, khói xả, nạp đạn, tháp / nòng: đúng như trong trận
    const T = this.getTestTerrain();
    u.update(dt, T, this.testBallistics, this.testRadar, null, [u]);
    this.updateTestSound(u, dt, boost);
    this.updateTestImpacts(dt);
    this.updateTestWall(dt);
    // sân thử: cây đổ / cháy, khói xác xe; xe chạy qua húc đổ cây, hàng rào, cán bẹp bao cát (như trong trận)
    const fxs = this.testEffects && this.testEffects.fx;
    if (this.field) {
      this.field.update(dt, fxs, this.camera ? this.camera.position : null);
      if (!u.isDead && Math.abs(u.speed || 0) >= 8) {
        const a = u.bodyAngle || 0;
        this.field.crush(u.x, u.z, u.tankType === 'SCOUT' ? 9 : 14, -Math.sin(a) * u.speed, -Math.cos(a) * u.speed, fxs);
      }
    }
    if (this.smoke) this.smoke.step(dt, fxs, T, this.camera ? this.camera.position : u);
  }

  // Tiếng máy nổ (nghỉ / chạy / tăng tốc), xích rít khi quay, mô-tơ quay tháp — cùng hàm âm thanh trong trận
  updateTestSound(u, dt, boost) {
    const se = window.soundEngine;
    if (!se || !se.ctx || this.inLiveMatch() || dt <= 0) return;
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const ba = u.bodyAngle || 0;
    let dBody = this._sndBody === undefined ? 0 : wrap(ba - this._sndBody);
    if (Math.abs(dBody) > 0.5) dBody = 0;
    this._sndBody = ba;
    if (se.updateEngine) se.updateEngine(Math.abs(u.speed) / (u.baseMaxSpeed || 1), boost, u.engineLoad || 1, { turn: dBody / dt, tankType: u.tankType, turbo: typeof Equipment !== 'undefined' && Equipment.has(u, 'turbo') });
    if (se.updateTurretDrive && u._turretYaw !== undefined) {
      const ty = -(u.azimuth || 0) * Math.PI / 180;   // hướng tháp trong thế giới (như trong trận)
      let dy = this._sndTurret === undefined ? 0 : wrap(ty - this._sndTurret);
      if (Math.abs(dy) > 0.5) dy = 0;
      this._sndTurret = ty;
      se.updateTurretDrive(dy / dt, u.tankType, false);
    }
    // bơm nâng hạ nòng (Z / X), cùng hàm trong trận
    if (se.updateElevationDrive) se.updateElevationDrive(se.elevationRate(this._sndElev || (this._sndElev = {}), u, dt), u.tankType);
  }

  syncAutoRotateBtn() {
    const b = document.getElementById('ti-autorotate-toggle');
    if (!b) return;
    b.classList.toggle('active', this.autoRotate);
    b.innerHTML = this.autoRotate ? '<i class="ti ti-refresh" aria-hidden="true"></i> TỰ XOAY' : '<i class="ti ti-player-pause" aria-hidden="true"></i> TỰ XOAY: TẮT';
  }

  stopTestSound() {
    const se = window.soundEngine;
    if (!se || this.inLiveMatch()) return;
    if (se.updateEngine) se.updateEngine(0, false, 1, { dead: true });   // tắt máy (lần mở sau sẽ đề máy lại)
    if (se.updateTurretDrive && this.activeUnit) se.updateTurretDrive(0, this.activeUnit.tankType);
    if (se.updateElevationDrive && this.activeUnit) se.updateElevationDrive(0, this.activeUnit.tankType);
    this._sndBody = this._sndTurret = undefined;
    this._sndElev = null;
  }

  // ---------------------------------------------------------------------------
  // TƯỜNG THỬ: tường bê tông phá hủy được (đúng lớp tường trong trận) trước mũi xe; tự dựng lại khi thôi bắn
  // ---------------------------------------------------------------------------
  buildTestWall() {
    if (!this.scene || this.testWall || typeof Destructibles === 'undefined' || !Destructibles.ConcreteWall) return;
    const cols = 14, rows = 5, cz = -112;
    const wall = new Destructibles.ConcreteWall(this.scene, { x: 0, z: cz, yaw: 0, cols, rows });
    wall.visible = true;
    this.testWall = { wall, group: wall.group, cx: 0, cz, hw: cols * 5.9 / 2, hd: Destructibles.ConcreteWall.THICK / 2, lastHit: -1, rise: 1 };
  }

  get testWallGroup() { return this.testWall && this.testWall.wall.group; }

  // Tường bị bắn: sau 5 giây không trúng thêm phát nào thì dựng lại (trồi lên từ mặt đất)
  updateTestWall(dt) {
    const W = this.testWall;
    if (!W) return;
    if (W.lastHit >= 0 && performance.now() - W.lastHit > 5000) this.resetTestWall();
    if (W.rise < 1) {
      W.rise = Math.min(1, W.rise + dt / 0.7);
      const e = 1 - Math.pow(1 - W.rise, 3);
      W.wall.group.position.y = -26 * (1 - e);
    }
  }

  resetTestWall() {
    const W = this.testWall;
    if (!W) return;
    W.wall.reset();
    W.wall.visible = true;
    W.group = W.wall.group;
    W.lastHit = -1;
    W.rise = 0;
    W.wall.group.position.y = -26;
    // vết đạn / muội dán trên mặt tường cũ không còn chỗ bám: dọn cùng
    const fx = this.testEffects;
    if (fx && fx.fx && typeof fx.fx.clear === 'function') fx.fx.clear();
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

  // Bãi đất bắn thử quanh bệ trưng bày (sân thử nhiều địa hình, proving_ground.js) + lùi camera để thấy cả điểm nổ
  showTestRange() {
    if (!this.scene) return;
    if (this.ensureField()) {
      // đã có sân thử
    } else if (!this.testRange) {
      // dự phòng (thiếu proving_ground.js): bãi đất phẳng tròn + vạch cự ly như cũ
      const g = new THREE.Group();
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(420, 64),
        new THREE.MeshStandardMaterial({ color: 0x463d32, roughness: 1, metalness: 0 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.04;
      ground.receiveShadow = true;
      g.add(ground);
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
    if (this.testRange) this.testRange.visible = true;
    if (!this.testRangeCamSet) {
      this.testRangeCamSet = true;
      this.cameraDistance = Math.max(this.cameraDistance, 240);
      this.cameraPitch = Math.max(this.cameraPitch, 0.38);
      this.updateCameraPosition();
    }
  }

  getTestEffects() {
    if (!this.testEffects && typeof EffectsManager !== 'undefined' && this.scene) {
      // EffectsManager chỉ cần scene + terrain: cấp mặt đất của sân thử (độ cao + loại đất -> màu đất / bụi văng đúng bãi)
      this.testEffects = new EffectsManager({
        scene: this.scene,
        terrain: this.getTestTerrain()
      });
    }
    return this.testEffects;
  }

  queueTestImpact(shooter, ammoType) {
    const u = shooter || this.activeUnit;
    if (!u || !this.pendingImpacts) return;
    const rapid = ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY';
    let P = new THREE.Vector3(u.x, 20, u.z), D = new THREE.Vector3(-Math.sin(u.bodyAngle || 0), 0, -Math.cos(u.bodyAngle || 0));
    const m = ammoType === 'ANTI_TANK_MISSILE' && u.getLauncherWorldTransform ? u.getLauncherWorldTransform()
      : (typeof u.getMuzzleWorldTransform === 'function' ? u.getMuzzleWorldTransform() : null);
    if (m) { P = m.position.clone(); D = m.direction.clone().normalize(); }
    if (rapid) {   // tản mát của súng liên thanh
      D.x += (Math.random() - 0.5) * 0.03; D.y += (Math.random() - 0.5) * 0.02; D.z += (Math.random() - 0.5) * 0.03;
      D.normalize();
    }
    const V0 = this.testShotSpeed(u, ammoType);
    const G = 78;
    const vel = D.clone().multiplyScalar(V0);
    const pos = P.clone(), prev = new THREE.Vector3();
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    const wallG = this.testWallGroup;
    let t = 0, hit = null;
    for (let i = 0; i < 2400 && !hit; i++) {
      const h = Math.max(0.004, Math.min(0.05, 6 / V0));   // bước ~6 đơn vị
      prev.copy(pos);
      vel.y -= G * h;
      pos.addScaledVector(vel, h);
      t += h;
      const seg = pos.clone().sub(prev), len = seg.length();
      if (wallG && wallG.visible && len > 1e-4) {
        ray.set(prev, seg.clone().divideScalar(len));
        ray.far = len;
        for (const it of ray.intersectObject(wallG, true)) {
          const mt = Array.isArray(it.object.material) ? it.object.material[0] : it.object.material;
          if (!it.object.visible || it.object.userData.isFxDecal || (mt && mt.isMeshBasicMaterial)) continue;
          const n = it.face ? it.face.normal.clone().transformDirection(it.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
          hit = { point: it.point.clone(), normal: n, object: it.object, hitType: 'WALL', faceIndex: it.faceIndex, instanceId: it.instanceId };
          break;
        }
        if (hit) break;
      }
      const F = this.field;
      if (F) {
        // sân thử: mặt đất có đồi / hào, mặt nước, đá tảng, xác xe, bao cát, thân cây (ụ đất quanh bãi hứng đạn bay quá)
        const fh = F.segmentHit(prev, pos);
        if (fh) { hit = { point: fh.point, normal: fh.normal, object: null, hitType: fh.hitType, tree: fh.tree, sandbag: fh.sandbag }; break; }
        // bay qua tán cây: lá rụng (đạn bay thẳng tới gần như tức thì; lựu pháo bay lâu thì bỏ qua cho khỏi rụng lá trước khi đạn tới)
        if (u.tankType !== 'ARTILLERY' && (!rapid || (i & 3) === 0)) F.passSegment(prev, pos, ammoType, this.testEffects && this.testEffects.fx);
        if (Math.hypot(pos.x, pos.z) > F.R + 140) return;
      } else {
        if (pos.y <= 0) {
          const k = prev.y / Math.max(1e-6, prev.y - pos.y);
          hit = { point: prev.clone().lerp(pos, k).setY(0), normal: new THREE.Vector3(0, 1, 0), object: null, hitType: 'GROUND' };
          break;
        }
        // ụ đất chắn đạn quanh rìa bãi (bán kính 330): đạn bắn thẳng nổ ở chân ụ
        if (Math.hypot(pos.x, pos.z) > 330) {
          hit = { point: new THREE.Vector3(pos.x, 0, pos.z), normal: new THREE.Vector3(0, 1, 0), object: null, hitType: 'GROUND' };
          break;
        }
      }
      if (t > 12) return;
    }
    if (!hit) return;
    const dist = hit.point.distanceTo(P);
    const delay = Math.max(rapid ? 0.04 : 0.08, Math.min(t, 6));
    this.pendingImpacts.push({ t: delay, x: hit.point.x, y: hit.point.y, z: hit.point.z, ammoType, dist, hit, dir: vel.clone().normalize() });
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
    const W = this.testWall, F = this.field;
    if (p.y === undefined) p.y = F ? F.groundAt(p.x, p.z) : 0;   // đạn con rơi xuống mặt đất (đồi / hào)
    const hitWall = p.hit && p.hit.hitType === 'WALL' && W && W.wall.visible;
    // trúng đá / xác xe / thân cây: nổ kiểu va vật cứng; rơi xuống nước: nổ trên mặt nước (không khoét hố dưới đáy)
    const ht = p.hit ? p.hit.hitType : 'GROUND';
    const fxType = ht === 'BOULDER' ? 'BOULDER' : ht === 'WATER' ? 'AIRBURST' : 'GROUND';
    if (hitWall && fx && fx.fx && fx.fx.impactSurface) fx.fx.impactSurface(p.ammoType, p.hit, p.dir || new THREE.Vector3(0, 0, -1), {});
    else if (fx) fx.createImpactEffects(p.x, p.y, p.z, p.ammoType, fxType);
    if (se && typeof se.playExplosionAtDistance === 'function') se.playExplosionAtDistance(p.dist, hitWall || ht === 'BOULDER' ? 'WALL' : ht === 'WATER' ? 'AIRBURST' : 'GROUND', p.ammoType);
    // cây rung / đổ / cháy, hàng rào đổ theo sức nổ (như terrain.damageAt trong trận)
    if (F) F.damageAt(p.x, p.y, p.z, p.ammoType, false, fx && fx.fx);
    // Sức phá kết cấu theo loại đạn (như phòng thử đạn): trúng thẳng tường, hoặc nổ trên đất sát chân tường
    if (W && W.wall.visible && p.ammoType !== 'CLUSTER') {
      const SP = { NORMAL: [24, 1.8], HE: [38, 2.8], AP: [3.6, 4.2], CLUSTER_SUBMUNITION: [12, 0.9], RPG: [20, 2.2], ANTI_TANK_MISSILE: [20, 2.6],
        GATLING_BULLET: [3.2, 0.2], INCENDIARY: [3.8, 0.24], SCOUT_BULLET: [1.8, 0.09] }[p.ammoType] || [24, 1.8];
      const pt = new THREE.Vector3(p.x, p.y, p.z);
      const near = Math.abs(p.x - W.cx) < W.hw + SP[0] && Math.abs(p.z - W.cz) < W.hd + SP[0];
      if (hitWall || (near && p.ammoType !== 'AP')) {
        W.wall.damageAt(pt, SP[0], SP[1] * (hitWall ? 1 : 0.7), p.ammoType, fx && fx.fx);
        W.lastHit = performance.now();
      }
    }
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
    }
    // Dải chọn trang bị dưới khung 3D (giáp / đạn / phụ kiện): gắn sự kiện bấm thẻ + cuộn ngang bằng con lăn.
    // Gọi mỗi lần mở (attach tự bỏ qua nếu đã gắn) — overlay được tạo sẵn từ constructor nên không gắn ở nhánh trên được.
    if (window.ArmoryUI) ArmoryUI.attach(this);
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay) return;

    this.isOpen = true;
    overlay.classList.remove('hidden');

    // Hồ sơ góc trên: lấy đúng như góc sảnh (tên tài khoản, hoặc "Chưa đăng nhập")
    const srcName = document.getElementById('mm-display-name'), srcRank = document.querySelector('.mm-commander-profile .rank-text');
    const nameEl = overlay.querySelector('.ti-profile-name'), rankEl = overlay.querySelector('.ti-profile-rank');
    if (nameEl && srcName) nameEl.textContent = srcName.textContent;
    if (rankEl && srcRank) rankEl.textContent = srcRank.textContent;
    // Bạc góc trên (account.js cập nhật tiếp mỗi khi hồ sơ đổi: mua đạn, nhận thưởng…)
    const acc = window.Account, silverBox = overlay.querySelector('#ti-silver');
    if (silverBox) {
      const p = acc && acc.profile;
      silverBox.classList.toggle('off', !p);
      if (p) silverBox.querySelector('b').textContent = acc.fmtSilver ? acc.fmtSilver(p.silver) : p.silver;
    }

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
    this.exitRangeMode({ closing: true });
    this.stopTestFire();
    this.keys = {};
    this.driveTo = null; this.mouseShot = null;
    this.stopTestSound();
    if (this.activeUnit) this.clearUnitFX(this.activeUnit);
    this.clearTestImpacts();
    if (this.smoke) this.smoke.clear();
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
    // Lái thử: W A S D (Shift tăng tốc), Q / E xoay tháp, Z / X nâng / hạ nòng
    const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX'];
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || !DRIVE_KEYS.includes(e.code)) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!this.keys[e.code] && window.soundEngine) {
        if (typeof window.soundEngine.init === 'function') window.soundEngine.init();
        if (typeof window.soundEngine.resume === 'function') window.soundEngine.resume();
      }
      this.keys[e.code] = true;
      if (/Key[WASD]/.test(e.code) && this.autoRotate) { this.autoRotate = false; this.syncAutoRotateBtn(); }   // đang lái: thôi tự xoay camera
    }, true);
    window.addEventListener('keyup', (e) => {
      if (!this.isOpen || !DRIVE_KEYS.includes(e.code)) return;
      e.stopPropagation();
      this.keys[e.code] = false;
    }, true);
    window.addEventListener('blur', () => { this.keys = {}; });
    // G: thả khói thử (chặn luôn phím G của trận để mở phòng xem giữa trận không phóng khói thật)
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.code !== 'KeyG') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.testSmoke();
    }, true);
    const wallBtn = document.getElementById('ti-wall-reset-btn');
    if (wallBtn) wallBtn.addEventListener('click', () => this.resetTestWall());
    const rIn = document.getElementById('ti-range-enter'), rOut = document.getElementById('ti-range-exit');
    if (rIn) rIn.addEventListener('click', () => { rIn.blur(); this.enterRangeMode(); });
    if (rOut) rOut.addEventListener('click', () => { rOut.blur(); this.exitRangeMode(); });

    // Nút bật/tắt tự động xoay
    const autoRotateToggle = document.getElementById('ti-autorotate-toggle');
    if (autoRotateToggle) {
      autoRotateToggle.addEventListener('click', () => {
        this.autoRotate = !this.autoRotate;
        this.syncAutoRotateBtn();
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
        if (this.rangeMode) this.exitRangeMode();
        else this.close();
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
