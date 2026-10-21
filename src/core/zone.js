/**
 * Hệ thống vòng bo an toàn thu hẹp dần theo thời gian (Battle Zone System)
 */
class BattleZone {
  constructor(worldWidth = MapGen.SIZE, worldHeight = MapGen.SIZE) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // Vòng bo hiện tại (giới hạn đang co)
    this.current = {
      x: worldWidth / 2,
      y: worldHeight / 2,
      radius: worldWidth * 0.48
    };

    // Vòng bo an toàn tiếp theo
    this.next = {
      x: worldWidth / 2,
      y: worldHeight / 2,
      radius: worldWidth * 0.32
    };

    this.phase = 1;
    this.maxPhases = 5;

    // Trạng thái: 'waiting' (chờ đếm ngược) hoặc 'shrinking' (đang thu hẹp)
    this.state = 'waiting';
    this.waitTime = 80; // 80 giây mỗi pha chờ
    this.shrinkTime = 40; // 40 giây thời gian co
    this.timer = this.waitTime;

    // Điểm bắt đầu co
    this.shrinkStart = { ...this.current };

    // Sát thương ngoài bo (máu / giây). Xe chỉ có 1.6–3.5 máu: 0.35/s cho ~5–10 s để chạy về vùng an toàn,
    // mỗi pha co tăng thêm (trước đây 20/s -> ra ngoài bo là chết gần như tức thì)
    this.damagePerSecond = 0.35;
    this.damagePerPhase = 0.15;
    this.generateNextZone();
  }

  /**
   * Bản đồ có cứ điểm: bo co dần về quanh các cứ điểm (tọa độ thế giới, tâm bản đồ ở gốc).
   * Vòng cuối vẫn ôm trọn cả 3 cứ điểm + ụ đất -> trận đánh dồn về tranh giành cứ điểm.
   */
  focusOn(points, pad = 260) {
    if (!points || !points.length) return;
    const H = this.worldWidth / 2;
    let cx = 0, cz = 0;
    for (const p of points) { cx += p.x; cz += p.z; }
    cx /= points.length; cz /= points.length;
    let R = 0;
    for (const p of points) R = Math.max(R, Math.hypot(p.x - cx, p.z - cz));
    R += pad;
    // khoảng lùi từng pha thiết kế cho bản đồ 3600, giãn theo kích thước bản đồ
    const k = this.worldWidth / 3600;
    this.plan = [R + 560 * k, R + 320 * k, R + 140 * k, R].map(r => ({ x: cx + H, y: cz + H, radius: r }));
    this.maxPhases = this.plan.length;
    this.phase = 1;
    this.state = 'waiting';
    this.timer = this.waitTime;
    this.generateNextZone();
  }

  generateNextZone() {
    if (this.plan) {
      this.next = { ...this.plan[Math.min(this.plan.length - 1, Math.max(0, this.phase - 1))] };
      return;
    }
    // Vòng tiếp theo nhỏ hơn 60% vòng hiện tại
    const nextRadius = this.current.radius * 0.62;
    // Tâm vòng mới nằm ngẫu nhiên bên trong vòng hiện tại
    const maxOffset = this.current.radius - nextRadius;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * maxOffset * 0.85;

    this.next = {
      x: Math.max(nextRadius + 50, Math.min(this.worldWidth - nextRadius - 50, this.current.x + Math.cos(angle) * dist)),
      y: Math.max(nextRadius + 50, Math.min(this.worldHeight - nextRadius - 50, this.current.y + Math.sin(angle) * dist)),
      radius: Math.max(120, nextRadius)
    };
  }

  /**
   * spgUnits: các xe (SPGUnit3D), toạ độ thế giới (tâm bản đồ ở gốc); ox / oz: độ dời sang hệ toạ độ của vòng bo
   * (góc bản đồ ở gốc). Truyền thẳng xe thật — không sao chép mỗi khung hình.
   */
  update(dt, spgUnits, ox = 0, oz = 0) {
    this.timer -= dt;

    if (this.state === 'waiting') {
      if (this.timer <= 0) {
        // Bắt đầu thu hẹp bo
        this.state = 'shrinking';
        this.timer = this.shrinkTime;
        this.shrinkStart = { ...this.current };
      }
    } else if (this.state === 'shrinking') {
      const progress = Math.min(1.0, 1.0 - (this.timer / this.shrinkTime));

      // Nội suy vị trí tâm và bán kính bo
      this.current.x = this.shrinkStart.x + (this.next.x - this.shrinkStart.x) * progress;
      this.current.y = this.shrinkStart.y + (this.next.y - this.shrinkStart.y) * progress;
      this.current.radius = this.shrinkStart.radius + (this.next.radius - this.shrinkStart.radius) * progress;

      if (this.timer <= 0) {
        // Hoàn tất thu hẹp, chuyển sang pha kế tiếp
        this.current = { ...this.next };
        this.phase++;
        this.damagePerSecond += this.damagePerPhase || 0.15; // Tăng sát thương ngoài bo

        if (this.phase <= this.maxPhases) {
          this.state = 'waiting';
          this.waitTime = Math.max(30, 80 - this.phase * 10);
          this.shrinkTime = Math.max(25, 40 - this.phase * 5);
          this.timer = this.waitTime;
          this.generateNextZone();
        } else {
          // Giai đoạn cuối cùng cực hẹp
          this.state = 'final';
          this.timer = 999;
        }
      }
    }

    // Gây sát thương liên tục cho các xe nằm ngoài vòng bo
    for (const unit of spgUnits) {
      if (!unit || unit.isDead) continue;
      const distFromCenter = Math.hypot(unit.x + ox - this.current.x, unit.z + oz - this.current.y);
      const outside = distFromCenter > this.current.radius;
      unit.isOutsideZone = outside;
      if (outside) unit.takeDamage(this.damagePerSecond * dt, null, 'ZONE');
    }

    // Cập nhật text hiển thị trên HUD
    this.updateHUD();
  }

  updateHUD() {
    const cdEl = document.getElementById('zone-countdown');
    const statusEl = document.getElementById('zone-status');
    if (!cdEl || !statusEl) return;

    const mins = Math.floor(Math.max(0, this.timer) / 60);
    const secs = Math.floor(Math.max(0, this.timer) % 60);
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (this.state === 'waiting') {
      cdEl.textContent = `BO THU SAU: ${timeFormatted}`;
      cdEl.style.color = '#ffffff';
      statusEl.textContent = `GIAI ĐOẠN ${this.phase}/${this.maxPhases} // CHUẨN BỊ DI CHUYỂN VÀO VÙNG TRẮNG`;
    } else if (this.state === 'shrinking') {
      cdEl.textContent = `BO ĐANG THU: ${timeFormatted}`;
      cdEl.style.color = '#ffaa00';
      statusEl.textContent = `CẢNH BÁO: VÒNG CHIẾN SỰ ĐANG CO LẠI!`;
    } else {
      cdEl.textContent = `BO TẬN CÙNG!`;
      cdEl.style.color = '#ff3344';
      statusEl.textContent = `GIAI ĐOẠN CUỐI // TIÊU DIỆT TẤT CẢ MỤC TIÊU CÒN LẠI`;
    }
  }

  // Vẽ các vòng bo trên Tactical Map
  renderOnTacticalMap(ctx, mapScale) {
    const curX = this.current.x * mapScale;
    const curY = this.current.y * mapScale;
    const curR = this.current.radius * mapScale;

    // 1. Vòng bo an toàn tiếp theo (Viền trắng nét đứt)
    if (this.next && this.state !== 'final') {
      const nX = this.next.x * mapScale;
      const nY = this.next.y * mapScale;
      const nR = this.next.radius * mapScale;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(nX, nY, nR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Share Tech Mono';
      ctx.textAlign = 'center';
      ctx.fillText('VÙNG AN TOÀN TIẾP THEO', nX, nY - nR - 6);
    }

    // 2. Vòng bo giới hạn hiện tại (Màu xanh lam neon)
    ctx.strokeStyle = '#00b0ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(curX, curY, curR, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Phủ màu vùng nguy hiểm ngoài bo
    ctx.fillStyle = 'rgba(0, 50, 150, 0.18)';
    ctx.save();
    ctx.beginPath();
    // Vẽ đảo ngược vùng ngoài hình tròn
    ctx.rect(0, 0, this.worldWidth * mapScale, this.worldHeight * mapScale);
    ctx.arc(curX, curY, curR, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  }

  // Vẽ vòng bo khi hiển thị trên khung nhìn camera của xe
  renderInViewport(ctx, camera) {
    // Vẽ ranh giới bo nếu camera nằm gần đường biên
    const distToCenter = Math.hypot(camera.x - this.current.x, camera.y - this.current.y);
    const viewRadius = Math.max(camera.viewportWidth, camera.viewportHeight);

    if (Math.abs(distToCenter - this.current.radius) < viewRadius * 1.5) {
      ctx.strokeStyle = 'rgba(0, 176, 255, 0.8)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(this.current.x, this.current.y, this.current.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

window.BattleZone = BattleZone;
