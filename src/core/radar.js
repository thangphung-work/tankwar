/**
 * DẤU LỘ VỊ TRÍ KHI KHAI HỎA (trước đây là "radar phản pháo" — đã bỏ: không còn khóa vị trí, không cảnh báo, bot không
 * bắn trả theo dấu này). Mỗi phát bắn chỉ để lại một chấm mờ dần trên bản đồ tại chỗ xe vừa khai hỏa (chớp lửa đầu nòng).
 * (Giữ tên lớp CounterBatteryRadar để không phải sửa các chỗ gọi registerShot / renderOnTacticalMap)
 */
class CounterBatteryRadar {
  constructor() {
    // Danh sách phát hiện phản pháo đang hoạt động (tối đa 5 điểm mới nhất)
    this.detections = [];
    this.sweepAngle = 0;
    this.maxAge = 6.0; // Tồn tại tối đa 6 giây là tự động biến mất
  }

  /**
   * Đăng ký một phát bắn mới vào mạng lưới radar
   */
  registerShot(shooter) {
    const isPlayer = shooter.isPlayer;

    // Mỗi chiếc xe chỉ lưu duy nhất 1 điểm bắn gần nhất, xóa điểm bắn cũ đi
    this.detections = this.detections.filter(d => d.shooterId !== shooter.id);

    const detection = {
      id: Math.random().toString(36).substring(2, 9),
      shooterId: shooter.id,
      isPlayer: isPlayer,
      originX: shooter.x,
      originY: shooter.y,
      currentRadius: 40,
      timeElapsed: 0,
      alpha: 1.0,
      active: true
    };

    // Giữ tối đa 5 vết bắn gần nhất trên toàn bản đồ
    if (this.detections.length >= 5) {
      this.detections.shift();
    }
    this.detections.push(detection);

    // Không phát còi khi chính mình bắn: trong xe thật không có tiếng báo nào lúc khai hỏa, và súng 6 nòng / súng máy
    // gọi hàm này cho TỪNG viên (30 viên/giây -> 30 chuỗi tiếng "tít" mỗi giây, vừa loạn tai vừa nặng máy)
    void isPlayer;

    return detection;
  }

  // Cập nhật trạng thái các vùng radar theo thời gian (dt giây)
  update(dt, player) {
    this.sweepAngle = (this.sweepAngle + dt * 180) % 360;
    let playerIsTracked = false;

    for (let i = this.detections.length - 1; i >= 0; i--) {
      const d = this.detections[i];
      d.timeElapsed += dt;

      d.currentRadius = 0;   // chỉ còn chấm vị trí, không khoanh vùng tìm kiếm
      d.alpha = Math.max(0, 1 - (d.timeElapsed / this.maxAge));

      if (d.isPlayer && d.timeElapsed < 5) {
        playerIsTracked = true;
      }

      if (d.timeElapsed >= this.maxAge) {
        this.detections.splice(i, 1);
      }
    }

    // Băng cảnh báo (#warning-banner) do game.js quản lý (đạn lao xuống / bị radar khóa).
    // Trước đây chỗ này chạy sau game.js và ẩn băng mỗi khung hình -> cảnh báo đạn lao xuống không bao giờ hiện.
    this.playerIsTracked = playerIsTracked;
  }

  // Vẽ các điểm phản pháo TINH GỌN, SẠCH SẼ TRÊN BẢN ĐỒ (Không tô màu đỏ đặc, không in chữ rác mắt)
  renderOnTacticalMap(ctx, mapScale) {
    this.detections.forEach(d => {
      const x = d.originX * mapScale;
      const y = d.originY * mapScale;
      const r = d.currentRadius * mapScale;

      ctx.save();
      const baseColor = d.isPlayer ? '255, 140, 0' : '255, 60, 60';

      void r;

      // 2. Chấm đỏ nhỏ gọn ở tâm phát bắn ban đầu
      ctx.fillStyle = `rgba(${baseColor}, ${0.9 * d.alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  // Vẽ màn hình Mini-Radar ở góc dưới bên phải HUD
  renderMiniRadar(canvas, player, worldWidth, worldHeight) {
    if (!canvas || !player) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radarRadius = (w / 2) - 6;

    ctx.clearRect(0, 0, w, h);

    // 1. Các vòng đồng tâm cự ly
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.25)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radarRadius / 3) * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Trục chữ thập
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx, h - 6);
    ctx.moveTo(6, cy);
    ctx.lineTo(w - 6, cy);
    ctx.stroke();

    // 2. Tia quét radar (sweep beam)
    const sweepRad = (this.sweepAngle * Math.PI) / 180;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radarRadius);
    grad.addColorStop(0, 'rgba(0, 255, 157, 0)');
    grad.addColorStop(1, 'rgba(0, 255, 157, 0.25)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radarRadius, sweepRad - 0.4, sweepRad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Vạch sáng đầu tia quét
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepRad) * radarRadius, cy + Math.sin(sweepRad) * radarRadius);
    ctx.stroke();
    ctx.restore();

    // 3. Hiển thị các chấm phát hiện radar trong bán kính quét (~ 1800 mét)
    const radarRange = 1800;
    this.detections.forEach(d => {
      const relX = d.originX - player.x;
      const relY = d.originY - player.y;
      const dist = Math.hypot(relX, relY);

      if (dist < radarRange) {
        const dotRadius = (dist / radarRange) * radarRadius;
        const angle = Math.atan2(relY, relX);
        const px = cx + Math.cos(angle) * dotRadius;
        const py = cy + Math.sin(angle) * dotRadius;

        // Vùng khoanh radar
        const spreadR = (d.currentRadius / radarRange) * radarRadius;
        ctx.fillStyle = d.isPlayer ? 'rgba(255, 150, 0, 0.3)' : 'rgba(255, 50, 70, 0.3)';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(3, spreadR), 0, Math.PI * 2);
        ctx.fill();

        // Chấm đỏ chớp
        ctx.fillStyle = d.isPlayer ? '#ffaa00' : '#ff3344';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 4. Vị trí xe của bạn ở chính giữa radar (chấm xanh lá)
    ctx.fillStyle = '#00ff9d';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

window.CounterBatteryRadar = CounterBatteryRadar;
