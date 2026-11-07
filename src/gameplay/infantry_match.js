/**
 * BỘ BINH TRONG TRẬN (tankType: INFANTRY, thẻ VANGUARD ở sảnh chờ).
 * Mỗi lính vẫn có một SPGUnit3D làm "đơn vị" của trận: bot, trúng đạn, cứ điểm, minimap, mạng, hồi sinh dùng chung với xe.
 * Đơn vị đó không có hình, chỉ có hộp trúng đạn cỡ người; hình + bước đi + động tác do SoldierEngine lo, vị trí chép sang đơn vị mỗi khung.
 * Phát bắn đi qua BallisticsSystem3D như đạn của xe nên trúng xe tính bằng VehicleDamage, đồng bộ mạng như mọi phát khác.
 */
const InfantryMatch = (() => {
  const TYPE = 'INFANTRY';
  // đối thủ trong trận là xe nên chỉ mang vũ khí chống xe; cối cần màn bắn gián tiếp riêng, chưa đưa vào trận
  const WEAPONS = ['gl', 'rpg', 'atr', 'kami'];
  const WEAPON_NAME = { gl: 'Phóng lựu 40 mm', atr: 'Bắn tỉa hạng nặng', rpg: 'RPG', kami: 'UAV cảm tử' };
  const KAMI_PER = 3;     // mỗi lính mang 3 UAV cảm tử (3 ống trên khung lưng), không tiếp đạn trong trận; hồi sinh mang lại đủ
  const BOX = { minX: -3.2, maxX: 3.2, minY: 0, maxY: 14.5, minZ: -3.2, maxZ: 3.2 };   // hộp trúng đạn: 0,8 x 0,8 x 1,8 m
  // trên xe (đo từ khớp lính, y tính từ mặt ngồi, -Z = trước mặt): ngồi thì chân thòng xuống + duỗi tới trước, ngắm thì quỳ trên sàn
  const BOX_SIT = { minX: -3.2, maxX: 3.2, minY: -3.5, maxY: 10.4, minZ: -4.5, maxZ: 3.2 };
  const BOX_KNEEL = { minX: -3.2, maxX: 3.2, minY: 0, maxY: 11.2, minZ: -4.6, maxZ: 3.2 };
  const SHOT_AIM_PRONE_S = 7;                 // súng bắn tỉa: nằm xuống mất 1 giây, giữ nằm giữa các phát thay vì đứng dậy rồi lại nằm
  const SHOT_AIM_S = 1.6;                     // lính máy khác giữ súng trên vai bấy nhiêu giây sau phát bắn
  // luồng nổ đầu nòng pháo xe: R tầm tới (đv), inner sát nòng (mạnh nhất), base sát thương phía trước nòng (máu tối đa của lính = 1)
  const MUZZLE_BLAST = { ALL_ROUNDER: { R: 56, inner: 14, base: 1.3 }, ARTILLERY: { R: 76, inner: 18, base: 1.6 }, GATLING: { R: 20, inner: 6, base: 0.05 } };
  const NOT_MAIN_GUN = new Set(['SCOUT_BULLET', 'GATLING_BULLET', 'ANTI_TANK_MISSILE', 'RPG']);
  // nòng quét trúng người (chỉ khi nòng thật sự đang chuyển động)
  const STRIKE = { minV: 5, head: 0.35, body: 0.15, perV: 0.006, headMax: 0.8, bodyMax: 0.4, cool: 1.2, r: 1.2, bodyR: 2 };
  // đi nhờ xe đồng minh (chỗ ngồi: vehicle_ride.js)
  const RIDE = {
    reach: 12,        // sát thân xe bao nhiêu đv thì lên được (~1,5 m)
    boardV: 14,       // xe chạy nhanh hơn thì không leo lên được (đv/s, ~ tốc độ lính chạy)
    jumpV: 45,        // xe chạy nhanh hơn thì không nhảy xuống được
    moved: 8,         // xe phải lăn bánh rồi mới tính là "dừng xe" (lên xe đang đứng yên thì không bị thả xuống ngay)
    still: 2,         // nhanh hơn thì chưa gọi là dừng
    stopS: 2.5,       // xe dừng bấy nhiêu giây thì lính xuống, mỗi ghế lệch nhau một chút
    gather: 120,      // đồng đội cách xe trong tầm này chạy theo lên cùng
    resendS: 2
  };
  // dấu bắn trúng: màu, giây hiện, cỡ, ưu tiên (phát nhẹ không đè dấu nặng đang hiện), chữ dưới dấu
  const MARK = {
    splash: { c: '#d8d8cc', t: 0.16, k: 0.75, p: 0 },
    hit: { c: '#f4f4ea', t: 0.18, k: 1, p: 1 },
    plate: { c: '#9fc4e8', t: 0.22, k: 1, p: 1, txt: 'TRÚNG TẤM GIÁP' },
    armor: { c: '#a8aeb4', t: 0.55, k: 0.85, p: 1, txt: 'KHÔNG XUYÊN' },
    pen: { c: '#ffb040', t: 0.6, k: 1.15, p: 2, txt: 'XUYÊN GIÁP' },
    head: { c: '#ff5a40', t: 0.35, k: 1.2, p: 3 },
    kill: { c: '#ff3a28', t: 0.75, k: 1.45, p: 4, txt: 'HẠ GỤC' }
  };
  // chỉ báo trúng đạn: giây tắt dần, gộp cùng hướng (rad), bán kính vòng (phần chiều cao màn hình), viền đỏ khi máu dưới low
  const HURT = { fade: 2.4, merge: 0.5, R: 0.21, n: 4, flashTau: 0.55, low: 0.5, lowOp: 0.8 };
  // mặt cung chỉ hướng (điểm ảnh CSS): cỡ canvas, nửa chiều dài cung, khe giữa, nhịp vạch khắc; giây thu vòng lúc mới hiện
  const ARC = { w: 250, h: 72, half: 80, gap: 13, tick: 16, inS: 0.16, inK: 0.14 };
  // đạn sượt qua: tầm nghe (đv). Vận tốc đạn của game đã quy đổi nên không so được với tốc độ âm thanh: chọn tiếng theo loại đạn
  const NEAR = { small: 64, big: 110 };
  const SMALL_AMMO = new Set(['SCOUT_BULLET', 'SCOUT_INCENDIARY', 'GATLING_BULLET', 'GATLING_HE', 'INCENDIARY']), SLOW_AMMO = new Set(['RPG', 'ANTI_TANK_MISSILE']);
  const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyR', 'KeyC', 'KeyX', 'Space', 'Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'KeyQ', 'KeyE', 'KeyF', 'KeyT', 'KeyG', 'KeyB', 'Tab', 'AltLeft', 'AltRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  const CSS = `
    body.inf-mode .hx-dock,
    body.inf-mode #ammo-selector,
    body.inf-mode #fire-btn,
    body.inf-mode #target-lock-stat-box,
    body.inf-mode .hx-speed {
      display: none !important;
    }

    #inf-hud {
      position: absolute;
      inset: 0;
      pointer-events: none;
      color: var(--tc-text, #dfe4d9);
      font-family: var(--font-tech, 'Chakra Petch', sans-serif);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    }

    /* Tâm ngắm tiêu chuẩn hiện đại kiểu game bắn súng góc nhìn thứ 3 */
    #inf-cross { position: absolute; left: 50%; top: 50%; --g: 6px; pointer-events: none; transition: transform 0.08s ease-out; }
    #inf-cross i { position: absolute; background: rgba(245, 248, 240, 0.95); box-shadow: 0 0 2px rgba(0, 0, 0, 0.9); }
    #inf-cross i:nth-child(1) { width: 2px; height: 8px; left: -1px; bottom: var(--g); }
    #inf-cross i:nth-child(2) { width: 2px; height: 8px; left: -1px; top: var(--g); }
    #inf-cross i:nth-child(3) { width: 8px; height: 2px; top: -1px; right: var(--g); }
    #inf-cross i:nth-child(4) { width: 8px; height: 2px; top: -1px; left: var(--g); }
    #inf-cross .cross-dot {
      position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px;
      background: rgba(245, 248, 240, 0.95); border-radius: 50%; box-shadow: 0 0 2px #000;
    }
    #inf-cross.aim .cross-dot { background: #3bf07c; box-shadow: 0 0 4px #3bf07c; }
    #inf-cross.lock i, #inf-cross.lock .cross-dot { background: var(--tc-accent, #e7a63a); box-shadow: 0 0 4px var(--tc-accent); }
    #inf-cross.hit i, #inf-cross.hit .cross-dot { background: var(--tc-danger, #d9534a); box-shadow: 0 0 5px var(--tc-danger); }
    #inf-cross.hit .cross-dot { transform: scale(1.6); }

    /* Với súng phóng lựu: thước ngắm rơi đạn đạo cầu vồng thanh mảnh, hiện đại */
    #inf-cross.gl i:nth-child(1) { height: 24px; }
    #inf-cross.gl .gl-notch-1, #inf-cross.gl .gl-notch-2, #inf-cross.gl .gl-notch-3 {
      position: absolute; left: 50%; height: 1.5px; background: rgba(245, 248, 240, 0.85); box-shadow: 0 0 2px #000;
      transform: translateX(-50%);
    }
    #inf-cross.gl .gl-notch-1 { bottom: calc(var(--g, 6px) + 6px); width: 8px; }
    #inf-cross.gl .gl-notch-2 { bottom: calc(var(--g, 6px) + 13px); width: 6px; }
    #inf-cross.gl .gl-notch-3 { bottom: calc(var(--g, 6px) + 20px); width: 4px; }
    #inf-cross.gl.aim .gl-notch-1, #inf-cross.gl.aim .gl-notch-2, #inf-cross.gl.aim .gl-notch-3 { background: rgba(255, 255, 255, 0.95); }
    #inf-cross.gl.lock .gl-notch-1, #inf-cross.gl.lock .gl-notch-2, #inf-cross.gl.lock .gl-notch-3 { background: var(--tc-accent, #e7a63a); }
    #inf-cross.gl.hit .gl-notch-1, #inf-cross.gl.hit .gl-notch-2, #inf-cross.gl.hit .gl-notch-3 { background: var(--tc-danger, #d9534a); }
    #inf-cross:not(.gl) .gl-notch-1, #inf-cross:not(.gl) .gl-notch-2, #inf-cross:not(.gl) .gl-notch-3 { display: none !important; }

    /* ==========================================================================
       THANH TÁC CHIẾN BỘ BINH CHÍNH GIỮA (CHUẨN THEO .hx-dock VÀ .hx-bar)
       ========================================================================== */
    #inf-dock {
      position: absolute;
      left: 50%;
      bottom: var(--hx-gap, 14px);
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      pointer-events: auto;
    }

    /* Hàng chip trạng thái phụ (phía trên thanh bar) */
    #inf-chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 5px;
    }
    .inf-chip {
      height: 18px;
      padding: 0 6px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 10px;
      white-space: nowrap;
      color: var(--tc-dim, #8d978b);
      border: 1px solid var(--tc-line-2, rgba(200, 210, 192, 0.26));
      background: var(--hx-bg, rgba(10, 13, 12, 0.76));
    }
    .inf-chip kbd {
      min-width: 14px;
      height: 13px;
      padding: 0 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font: 700 9px/1 var(--font-mono);
      color: #061014;
      background: #8fd3ff;
      border: 0;
      border-radius: 1px;
    }
    .inf-chip b {
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--tc-bright, #f1f4ec);
    }
    .inf-chip.active {
      border-color: var(--tc-accent, #e7a63a);
      color: var(--tc-accent, #e7a63a);
    }
    .inf-chip.active b {
      color: var(--tc-accent-2, #f5c46b);
    }

    /* Khung tác chiến chính giữa */
    #inf-bar {
      display: flex;
      align-items: stretch;
      height: 48px;
      background: var(--hx-bg, rgba(10, 13, 12, 0.76));
      border: 1px solid var(--hx-line, rgba(200, 210, 192, 0.26));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    }
    #inf-bar > * + * {
      border-left: 1px solid var(--hx-line, rgba(200, 210, 192, 0.26));
    }

    /* Ngăn 1: Lính, Tốc độ, Máu & Thể lực */
    .inf-section-soldier {
      width: 220px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 3px;
      padding: 0 10px;
    }
    .inf-soldier-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
    }
    #inf-soldier-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: var(--tc-bright, #f1f4ec);
      white-space: nowrap;
    }
    #inf-motion-val {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--tc-dim, #8d978b);
      white-space: nowrap;
    }
    /* Thanh máu quân sự vát góc */
    .inf-hp-row {
      --hp-c: var(--tc-ok, #8fc46f);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .inf-hp-row.med { --hp-c: var(--tc-accent, #e7a63a); }
    .inf-hp-row.low { --hp-c: var(--tc-danger, #d9534a); }
    .inf-hp-ico {
      flex: none;
      width: 12px;
      height: 12px;
      color: var(--hp-c);
      transition: color 0.3s;
    }
    .inf-hp-track {
      --cut: 4px;
      position: relative;
      flex: 1;
      height: 12px;
      background: rgba(200, 210, 192, 0.32);
      clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut));
    }
    .inf-hp-track::before {
      content: '';
      position: absolute;
      inset: 1px;
      background: rgb(8, 11, 9);
      clip-path: polygon(calc(var(--cut) - 0.5px) 0, 100% 0, 100% calc(100% - var(--cut) + 0.5px), calc(100% - var(--cut) + 0.5px) 100%, 0 100%, 0 calc(var(--cut) - 0.5px));
    }
    .inf-hp-fill {
      position: absolute;
      left: 2px;
      top: 2px;
      bottom: 2px;
      background: var(--hp-c);
      transition: width 0.15s ease-out, background 0.25s;
    }
    .inf-hp-track::after {
      content: '';
      position: absolute;
      inset: 2px;
      background-image: linear-gradient(90deg, transparent calc(100% - 2px), rgb(8, 11, 9) calc(100% - 2px));
      background-size: 10% 100%;
    }
    #inf-hp-num {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--tc-bright);
      white-space: nowrap;
    }
    /* Vạch thể lực */
    .inf-stam-bar {
      height: 2.5px;
      width: 100%;
      background: rgba(200, 210, 192, 0.15);
      position: relative;
    }
    #inf-stam-fill {
      height: 100%;
      background: var(--tc-accent, #e7a63a);
      transition: width 0.1s linear;
    }

    /* Ngăn 2: Vũ khí & Đạn dược */
    .inf-section-weapon {
      padding: 0 14px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-width: 180px;
    }
    #inf-weapon-name {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.6px;
      color: var(--tc-bright, #f1f4ec);
      white-space: nowrap;
    }
    .inf-ammo-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-family: var(--font-mono);
    }
    #inf-ammo-count {
      font-size: 16px;
      font-weight: 700;
      color: var(--tc-bright, #f1f4ec);
    }
    #inf-ammo-extra {
      font-size: 10.5px;
      color: var(--tc-accent, #e7a63a);
      white-space: nowrap;
    }

    /* Ngăn 3: Tiến trình nạp đạn / Băng bó */
    .inf-section-action {
      padding: 0 12px;
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 3px;
      width: 160px;
    }
    .inf-action-lbl {
      font-family: var(--font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--tc-accent, #e7a63a);
    }
    .inf-action-track {
      height: 4px;
      width: 100%;
      background: rgba(200, 210, 192, 0.15);
      border-radius: 1px;
      overflow: hidden;
    }
    .inf-action-fill {
      height: 100%;
      background: var(--tc-accent, #e7a63a);
      transition: width 0.06s linear;
    }

    /* ==========================================================================
       BẢNG TIỂU ĐỘI GÓC TRÁI DƯỚI (CHUẨN THEO BÀN TÁC CHIẾN)
       ========================================================================== */
    #inf-squad {
      position: absolute;
      left: var(--hx-gap, 14px);
      bottom: var(--hx-gap, 14px);
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: auto;
    }
    .inf-sq-slot {
      display: flex;
      align-items: center;
      gap: 7px;
      width: 190px;
      height: 28px;
      padding: 0 8px;
      background: var(--hx-bg, rgba(10, 13, 12, 0.76));
      border: 1px solid var(--hx-line, rgba(200, 210, 192, 0.26));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      transition: all 0.12s ease;
    }
    .inf-sq-slot.active {
      border-color: var(--tc-accent, #e7a63a);
      background: rgba(28, 22, 14, 0.85);
      box-shadow: 0 0 8px rgba(231, 166, 58, 0.25);
    }
    .inf-sq-slot.dead {
      opacity: 0.45;
      filter: grayscale(1);
    }
    .inf-sq-num {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font: 700 9px/1 var(--font-mono);
      background: rgba(200, 210, 192, 0.1);
      color: var(--tc-accent, #e7a63a);
      border-radius: 1px;
    }
    .inf-sq-slot.active .inf-sq-num {
      background: var(--tc-accent, #e7a63a);
      color: #061014;
    }
    .inf-sq-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .inf-sq-name {
      font-size: 10.5px;
      font-weight: 700;
      color: var(--tc-bright);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .inf-sq-hp {
      width: 100%;
      height: 2.5px;
      background: rgba(200, 210, 192, 0.15);
      border-radius: 1px;
      overflow: hidden;
    }
    .inf-sq-hp-fill {
      height: 100%;
      background: var(--tc-ok, #8fc46f);
      transition: width 0.15s ease;
    }
    .inf-sq-ammo {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--tc-dim, #8d978b);
      margin-left: auto;
    }

    /* Hướng dẫn phím góc phải dưới */
    #inf-keys {
      position: absolute;
      right: var(--hx-gap, 14px);
      bottom: var(--hx-gap, 14px);
      max-width: 380px;
      text-align: right;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--tc-dim, #8d978b);
      line-height: 1.4;
      pointer-events: none;
    }

    #inf-heal { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse closest-side, transparent 58%, rgba(70, 210, 120, .42) 100%); }
    #inf-heal.on { animation: inf-heal 1.2s ease-out; }
    @keyframes inf-heal { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }
    #inf-msg { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); padding: 5px 12px; font-size: 12px; font-weight: 700; background: var(--hx-bg); border: 1px solid var(--tc-accent); color: var(--tc-bright); }
    #inf-fb { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 961; }
    #inf-fb canvas { position: absolute; opacity: 0; }
    #inf-fb .vig { left: 0; top: 0; width: 100%; height: 100%; }
    #inf-fb .arc { left: 50%; top: 50%; }
    #inf-fb .brg { position: absolute; left: 50%; top: 50%; opacity: 0; font: 600 11px/1 var(--font-mono); letter-spacing: .08em; color: #ff8a6a; }
  `;

  // Sát thương (máu tối đa của lính = 1): bảng chung ở SoldierEngine.WOUND
  const directDamage = (shell, ammoType) => {
    const d = SoldierEngine.WOUND.direct(ammoType, shell);
    if (typeof window !== 'undefined' && window.devLog) window.devLog('hit', 'lính trúng ' + (shell._infZone || '?') + ' | đạn ' + (shell.aaMG ? '7,62' : shell.gl40 ? 'lựu 40' : ammoType) + ' | sát thương ' + d.toFixed(2));
    return d;
  };
  const splashDamage = (base, unit, shell) => Math.round(base * SoldierEngine.WOUND.blastMul(!!unit._infLow, shell) * 1000) / 1000;
  const deathMode = (shell, ammoType) => SoldierEngine.WOUND.deathMode(ammoType, shell);

  // Mô hình của đơn vị: chỉ khung rỗng cho các hook của SPGUnit3D; hình người nằm ở SoldierEngine
  if (typeof TankModelBuilder !== 'undefined') {
    TankModelBuilder.registerModel(TYPE, (b) => {
      const u = b.unit;
      u.chassisGroup = new THREE.Group(); u.group.add(u.chassisGroup);
      u.turretGroup = new THREE.Group(); u.turretGroup.position.y = 11; u.chassisGroup.add(u.turretGroup);
      u.barrelPivot = new THREE.Group(); u.turretGroup.add(u.barrelPivot);
      u.barrelGroup = new THREE.Group(); u.barrelPivot.add(u.barrelGroup);
      u.muzzleTipLocal = new THREE.Vector3(0, 0, -5);
      u._shBox = BOX; u._shBoxGroup = u.group;
      return { hullW: 3 };
    });
  }

  // Trang bị + vũ khí của 1 lính trong trận; prebake và lúc vào trận phải ra cùng kết quả mới trúng bộ nhớ đệm hình lính
  const gearOf = (mine, ghillie, loadout, medkit) => {
    const gear = mine ? loadout.gear : undefined;
    if (!ghillie && !medkit) return gear;
    return Object.assign({}, gear, ghillie ? { ghillie: true } : null, medkit ? { medkit: true } : null);
  };
  const weaponOf = (infWeapon, isMe, loadout) => WEAPONS.includes(infWeapon) ? infWeapon : isMe && WEAPONS.includes(loadout.weapon) ? loadout.weapon : WEAPONS[0];
  // Lúc chờ vào trận: dựng trước hình lính của từng kế hoạch đơn vị (lần đầu ~300 ms mỗi tổ hợp), vào trận chỉ còn lấy từ bộ nhớ đệm
  function prebake(e, biome) {
    if (!e.opts || e.opts.tankType !== TYPE || typeof SoldierModel === 'undefined') return;
    const L = SoldierPlayer.loadLoadout();
    if (biome && SoldierModel.setBiome) SoldierModel.setBiome(biome);
    if (e.terrain && SoldierEngine.walkIndex) SoldierEngine.walkIndex(e.terrain);   // bảng mặt đi được (~150 ms): dựng lúc chờ, không phải lúc vào trận
    const gear = gearOf(e.isMe || e.squadOf, e.opts.infGhillie, L, e.opts.infMedkit);
    const F = SoldierModel.buildFigure(e.opts.team, { role: 'infantry', weapon: weaponOf(e.opts.infWeapon, e.isMe, L), renderOrder: 2, ...(gear ? { gear } : {}) });
    // giữ hình lại trong nhóm (ẩn) của đơn vị dựng sẵn để game.warmGpuUploads vẽ thử một lượt: GPU dựng sẵn shader + định dạng đỉnh
    // của mọi bậc chi tiết (vẽ lần đầu trong trận mất tới vài giây: getProgramParameter / vertexAttribPointer). Vào trận thì gỡ ra
    if (e.unit && e.unit.group) {
      if (F.lod) { for (const L of F.lod.levels) for (const m of L) m.visible = true; if (F.lod.caster) F.lod.caster.visible = true; }
      if (SoldierModel.setShadow) SoldierModel.setShadow(F, true);   // lượt bóng làm nóng biên dịch luôn chương trình độ sâu có xương
      F.root.position.set(0, -SoldierModel.FOOT_Y, 0);
      e.unit.group.add(F.root);
      e.unit._preFig = F;
      return;
    }
    F.root.traverse(o => { if (o.isSkinnedMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  class Match {
    constructor(game) {
      this.game = game;
      this.pairs = [];
      this.me = null;
      this.mine = [];     // lính của máy này, theo số thứ tự phím 1-4
      this.veh = [];
      this.locked = false; this.noLock = false;
      this.loadout = SoldierPlayer.loadLoadout();
      this.fov0 = game.camera.fov;
      // đạn xuyên giáp xuyên qua lính: chết, đạn bay tiếp không nổ (ballistics)
      if (game.ballistics) game.ballistics.onInfantryPass = (sh, u) => {
        if (u.isDead) return;
        u._infDeath = { mode: 'pierce', vel: { x: sh.vx || 0, z: sh.vz || 0 } };
        const r = u.takeDamage(u.maxHp * 9, sh.shooter, 'DIRECT_HIT');
        if (r && r.killed) game.onUnitDestroyed(u, sh.shooter);
      };
      // mọi phát bắn (cả bot, máy khác) đều qua fireShell3D: máy có quyền với lính tự tính luồng nổ đầu nòng cho lính của mình
      const BL = game.ballistics;
      if (BL) {
        if (!BL._firedHook) {
          const f = BL.fireShell3D;
          BL._firedHook = true;
          BL.fireShell3D = function (...a) { const sh = f.apply(this, a); if (this.onShellFired) this.onShellFired(sh, a[0], a[4]); return sh; };
        }
        BL.onShellFired = (sh, u, ammo) => this.muzzleBlast(u, ammo, sh);
      }
      this.world = new SoldierEngine.World(game.scene, game.terrain, { vehicles: () => this.veh, isEnemy: (a, b) => a.team !== b.team, onFire: (s, t, aim) => this.fireGuard(s, aim), onKami: (s, ev) => this.onKami(s, ev), onMedkit: s => this.onMedkit(s), onCrush: (s, v) => this.onSoldierCrushed(s, v) });
      this.world.fireBullet = () => {};   // đạn thật của trận đi qua fireGuard / fireLive, không dùng đạn riêng của engine
      const biome = game.terrain && game.terrain.mapType;
      if (biome && SoldierModel.setBiome) SoldierModel.setBiome(biome);
      for (const u of game.units) if (u._preFig) { const R = u._preFig.root; if (R.parent) R.parent.remove(R); u._preFig = null; }   // hình làm nóng GPU lúc chờ
      for (const u of game.units) {
        if (u.tankType !== TYPE) continue;
        const weapon = weaponOf(u.infWeapon, u === game.player, this.loadout);
        const gear = gearOf(u === game.player || u.localSquad, u.infGhillie, this.loadout, u.infMedkit);   // bộ ngụy trang cỏ, bộ y tế: kit g, mk, mọi máy cùng thấy
        const s = this.world.spawn({ team: u.team, weapon, gear, x: u.x, z: u.z, heading: u.bodyAngle, size: 1 });
        s.intent.drive = { x: 0, z: 0, gait: 'walk', mul: 1, face: null };
        s.bleedOwned = false;   // máu đồng bộ từ đơn vị: chảy máu trừ vào u (bleedOut), không trừ thẳng s.hp
        const P = { u, s, shotAt: -1e9, boardV: null, rideT: 0, medLeft: u.infMedkit ? Equipment.MEDKIT.uses : 0 };
        if (SoldierEngine.RESERVE[weapon] !== undefined) s.arms.res = SoldierEngine.RESERVE[weapon];   // RPG / bắn tỉa: hết là hết, hồi sinh mang lại đủ
        // UAV cảm tử: dùng chung UAV của game (kamikaze_uav.js); ống phóng là ống lính đặt xuống đất
        u.infWeapon = weapon;
        if (weapon === 'kami') { u.uavKind = 'kami'; u.kamikazeCount = KAMI_PER; u.kamiTube = () => SoldierModel.kamiTubeWorld(s.figure); }
        this.pairs.push(P);
        if (u === game.player) this.me = P;
        if (u === game.player || u.localSquad) this.mine.push(P);
      }
      for (const P of this.mine) if (P !== this.me) this.standGuard(P);
      if (this.me) this.initPlayer();
    }

    initPlayer() {
      const G = this.game;
      this.ctl = new SoldierPlayer.Controller({
        world: this.world, terrain: G.terrain, scene: G.scene, cam: G.camera,
        onHud: h => this.drawHud(h),
        fireLive: (s, muzzle, hit, dir) => this.fireLive(s, muzzle, hit, dir),
        canKami: s => this.canKami(s),
        aimVehicles: () => this.veh
      });
      this.ctl.enter(this.me.s);
      this.buildHud();
      this.ctl.warmSight();
      document.body.classList.add('inf-mode');
      const canvas = G.renderer.domElement;
      const on =(t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._off.push(() => t.removeEventListener(ev, fn, o)); };
      this._off = [];
      on(window, 'keydown', e => this.onKey(e, true), true);
      on(window, 'keyup', e => this.onKey(e, false), true);
      // cùng tầng capture nên chặn được mọi trình xử lý chuột của xe trên màn 3D (ngắm nhanh, khóa xe, zoom...)
      on(window, 'pointerdown', e => {
        if (e.target !== canvas || !this.usable()) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if (!this.locked && !this.noLock) { this.lock(); return; }
        if (e.button === 0) this.ctl.firing = true;
        else if (e.button === 2) this.ctl.setAim(true);
      }, true);
      on(window, 'pointerup', e => {
        if (e.button === 0) this.ctl.firing = false;
        else if (e.button === 2) this.ctl.setAim(false);
      }, true);
      for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) {
        on(window, ev, e => {
          if (e.target !== canvas) return;
          e.stopImmediatePropagation();
          if (ev === 'wheel' && this.usable() && e.deltaY) this.ctl.zoomStep(e.deltaY < 0 ? 1 : -1);
          if (ev === 'contextmenu') e.preventDefault();
        }, ev === 'wheel' ? { capture: true, passive: true } : true);
      }
      on(document, 'mousemove', e => {
        if (!this.usable() || !(this.locked || (this.noLock && e.target === canvas))) return;
        this.ctl.look(e.movementX || 0, e.movementY || 0);
      });
      on(document, 'pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) this.releaseInput();
      });
      on(document, 'pointerlockerror', () => { this.noLock = true; });
    }

    lock() {
      const canvas = this.game.renderer.domElement;
      try {
        const r = canvas.requestPointerLock && canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => { this.noLock = true; });
      } catch (err) { this.noLock = true; }
    }
    // UAV cảm tử của lính đang điều khiển: chỉ bắt đầu phóng khi UAV trước đã xong (nổ / bị bắn hạ); UAV còn đang lượn thì mở lại màn hình
    kamiState() { const G = this.game; return this.me && G.kamiOn && G.kamiOn(this.me.u) ? G.droneState().state : null; }
    canKami(s) {
      const G = this.game, st = this.kamiState();
      if (!st || s !== this.me.s) return false;
      if (st === 'flying' || st === 'returning') { G.setSightMode(true); return false; }
      if (st !== 'docked') { if (G.addCombatLog) G.addCombatLog(this.me.u.kamikazeCount > 0 ? '[[hourglass]] UAV trước còn đang bay — chờ xong mới phóng tiếp' : '[[alert-triangle]] Hết UAV cảm tử', 'alert'); return false; }
      return true;
    }
    onKami(s, ev) {
      const G = this.game;
      if (ev !== 'launch' || !this.me || s !== this.me.s || this.me.u.isDead) return;
      if (G.launchKami) G.launchKami();
    }
    releaseInput() { if (this.ctl) { this.ctl.firing = false; this.ctl.aiming = false; this.ctl.keys = {}; } }
    usable() {
      const G = this.game;
      return !!this.me && G.isGameStarted && !G.isGameOver && !G._sight   // màn hình UAV đang mở: phím / chuột thuộc về UAV
        && !(window.GameMenu && GameMenu.isOpen && GameMenu.isOpen())
        && !(G.tacticalMap && G.tacticalMap.isOpen)
        && !(window.tankInspector && window.tankInspector.isOpen)
        && !(typeof QuickComms !== 'undefined' && QuickComms.isOpen());
    }

    // game.js hỏi trước khi xử lý phím của xe: phím này đã thuộc về lính
    ownsKey(e) {
      const t = e.target;
      return !!this.ctl && KEYS.has(e.code) && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) && this.usable();
    }
    onKey(e, down) {
      if (!this.ownsKey(e)) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const C = this.ctl;
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') { C.setAim(down); return; }
      if (e.code === 'Space') { C.firing = down; return; }
      if (e.code === 'KeyF') { if (down && !e.repeat && this.me.s.alive) this.toggleRide(); return; }
      if (e.code === 'KeyE') { if (down && !e.repeat && this.me.s.alive) this.useMedkit(); return; }
      if (e.code === 'ShiftRight') { C.keys.ShiftLeft = down; return; }
      const dig = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (dig) { if (down && !e.repeat) this.switchTo(dig[1] - 1); return; }
      if (e.code === 'Backquote') { if (down && !e.repeat) this.callAll(); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'AltLeft', 'AltRight', 'KeyQ'].includes(e.code)) { C.key(e.code, down); return; }
      if ((e.code === 'KeyR' || e.code === 'KeyC' || e.code === 'KeyX') && !e.repeat && this.me.s.alive) C.key(e.code, down);
    }

    // ----- BỘ Y TẾ -----
    // E: bắt đầu băng bó; lượt chỉ trừ khi băng xong (onMedkit)
    useMedkit() {
      const M = this.me, u = M.u, log = (t) => { if (this.game.addCombatLog) this.game.addCombatLog(t, 'alert'); };
      if (M.s._medUse) return;
      if (!u.infMedkit) { log('[[alert-triangle]] Lính này không mang bộ y tế'); return; }
      if (M.medLeft <= 0) { log('[[alert-triangle]] Đã hết bộ y tế'); return; }
      if (u.hp >= u.maxHp) { log('[[alert-triangle]] Máu đang đầy'); return; }
      if (!M.s.useMedkit()) log('[[alert-triangle]] Đứng yên, không ngắm mới dùng được bộ y tế');
    }
    onMedkit(s) {
      const P = this.mine.find(q => q.s === s), G = this.game;
      if (!P || P.u.isDead || P.medLeft <= 0) return;
      P.medLeft--;
      if (Equipment.MEDKIT.uses > 0) P.s.gearKg = Math.max(0, P.s.gearKg - 1.2 / Equipment.MEDKIT.uses);   // dùng bớt bộ y tế: nhẹ đi
      if (G.netSync && G.netSync.sendMedkit) G.netSync.sendMedkit(P.u);
      P.u.hp = Math.min(P.u.maxHp, P.u.hp + Equipment.MEDKIT.heal * P.u.maxHp);
      s.hp = P.u.hp / P.u.maxHp * 100;
      P.bleedAcc = 0; P.bleedT = 0;
      if (P !== this.me) return;
      if (G.addCombatLog) G.addCombatLog(`[[first-aid-kit]] Đã hồi đầy máu · bộ y tế còn ${P.medLeft} lần`, 'info');
      // viền xanh chớp lên đúng lúc máu hồi
      const H = this.$heal;
      if (H) { H.classList.remove('on'); void H.offsetWidth; H.classList.add('on'); }
    }

    // lính không được điều khiển: đứng giữ chỗ, tự bắn địch trong tầm
    standGuard(P) {
      P.s.intent.drive = null;
      P.s.setGuard(!(P.s.ride && P.s.ride.inside));   // trong khoang không bắn được
    }

    // ----- LUỒNG NỔ ĐẦU NÒNG / NÒNG QUÉT TRÚNG -----
    // sát thương không ghi công ai (như xe cán): máy có quyền với lính là máy này, không phải máy của xe
    hurtBy(P, dmg, why, death, shoveX, shoveZ) {
      const u = P.u, G = this.game;
      if (u.isDead || u.invulnerableTimer > 0) return;
      u._infDeath = death;
      const r = u.takeDamage(dmg * u.maxHp, null, 'BURN');
      if (r && r.killed) { G.onUnitDestroyed(u, null, why); return; }
      u._infDeath = null;
      P.s._bkAmt = 1; P.s._bkHold = 0.4;   // khựng người (động tác phanh của engine)
      if (!P.s.ride && (shoveX || shoveZ)) P.shove = { x: shoveX, z: shoveZ, t: 0.25 };
      // nguồn 'BURN' không tính là trúng đạn mới nên stepHurt không thấy: báo hướng ở đây
      if (P === this.me) this.noteHurt(death && death.x != null ? { x: death.x, z: death.z } : shoveX || shoveZ ? { x: P.s.x - shoveX * 10, z: P.s.z - shoveZ * 10 } : null, dmg, !!(death && death.mode === 'blast'));
      const now = performance.now();   // súng 6 nòng gây sát thương từng viên: không báo dồn dập
      if (P === this.me && G.addCombatLog && now - (this._hurtLogAt || -1e9) > 2000) { this._hurtLogAt = now; G.addCombatLog('[[alert-triangle]] ' + why, 'alert'); }
    }
    muzzleBlast(u, ammo, sh) {
      const B = u && sh && MUZZLE_BLAST[u.tankType];
      if (!B || u._roofShot || (u.tankType === 'GATLING' ? ammo !== 'GATLING_BULLET' : NOT_MAIN_GUN.has(ammo))) return;
      const v = Math.hypot(sh.vx, sh.vy, sh.vz) || 1, ux = sh.vx / v, uy = sh.vy / v, uz = sh.vz / v;
      for (const P of this.mine) {
        const s = P.s;
        if (!s.alive || P.u._inVeh) continue;
        const dx = s.x - sh.x, dy = s.y + 8 - sh.y, dz = s.z - sh.z, d = Math.hypot(dx, dy, dz);
        if (d > B.R) continue;
        const c = d > 0.01 ? (dx * ux + dy * uy + dz * uz) / d : 1;   // 1 = ngay trước nòng, -1 = sau nòng
        const dirK = c > 0 ? 0.45 + 0.55 * c : 0.15 + 0.3 * (1 + c);
        const f = d < B.inner ? 1 : Math.pow(1 - (d - B.inner) / (B.R - B.inner), 2);
        const dmg = B.base * f * dirK * (P.u._infLow ? 0.7 : 1);
        if (dmg < 0.005 || !this.world.lineFree(sh.x, sh.z, s.x, s.z)) continue;   // nấp sau tường / nhà thì tránh được
        const h = Math.hypot(dx, dz) || 1, push = dmg > 0.1 ? 30 : 0;
        this.hurtBy(P, dmg, 'Trúng luồng nổ đầu nòng ' + (u.name || 'xe'), { mode: 'blast', x: sh.x, y: sh.y, z: sh.z, power: dmg }, dx / h * push, dz / h * push);
      }
    }
    // nòng từng xe: đầu nòng + hướng nòng thật (cả góc ngóc, giật), tốc độ đầu nòng so với khung trước
    barrelNow(v, dt) {
      const bp = v.barrelPivot, Rg = VehicleRide.barrelRig(v);
      if (!bp || !Rg) return null;
      const B = v._bn || (v._bn = { tip: new THREE.Vector3(), dir: new THREE.Vector3(), prev: new THREE.Vector3(), q: new THREE.Quaternion(), has: false, sp: 0, L: Rg.L, frame: -9 });
      // bỏ qua vài khung (không có lính nào gần) thì vị trí cũ đã lỗi thời: khung này chưa tính tốc độ
      this._frame = this._frame || 0;
      if (this._frame - B.frame > 1) B.has = false;
      B.frame = this._frame;
      B.prev.copy(B.tip);
      (v.barrelGroup || bp).updateWorldMatrix(true, false);
      (v.barrelGroup || bp).localToWorld(B.tip.copy(v.muzzleTipLocal));
      bp.getWorldQuaternion(B.q); B.dir.set(0, 0, -1).applyQuaternion(B.q);
      B.sp = B.has && dt > 0 ? B.tip.distanceTo(B.prev) / dt : 0;
      B.vx = B.has && dt > 0 ? (B.tip.x - B.prev.x) / dt : 0; B.vz = B.has && dt > 0 ? (B.tip.z - B.prev.z) / dt : 0;
      B.has = true;
      return B;
    }
    stepStrikes(dt) {
      this._frame = (this._frame || 0) + 1;
      for (const P of this.mine) P.strikeT = Math.max(0, (P.strikeT || 0) - dt);
      for (const v of this.veh) {
        if (!VehicleRide.SEATS[v.tankType] || !v.muzzleTipLocal) continue;
        let B = null;
        const Rg = VehicleRide.barrelRig(v);
        if (!Rg) continue;
        for (const P of this.mine) {
          const s = P.s;
          if (!s.alive || s.ride || Math.hypot(s.x - v.x, s.z - v.z) > Rg.L + 40) continue;
          B = B || this.barrelNow(v, dt);
          if (B.sp < STRIKE.minV || P.strikeT > 0) continue;
          // đoạn nòng từ đầu nòng lùi về gốc, thân lính là trụ đứng
          const tx = B.tip.x, tz = B.tip.z, ax = -B.dir.x * B.L, az = -B.dir.z * B.L, l2 = ax * ax + az * az || 1;
          const t = Math.max(0, Math.min(1, ((s.x - tx) * ax + (s.z - tz) * az) / l2));
          const lat = Math.hypot(tx + ax * t - s.x, tz + az * t - s.z), yb = B.tip.y - B.dir.y * B.L * t;
          const top = s.y + (s.figure._proneK > 0.5 ? 3.5 : P.u._infLow ? 10 : 14.5) * s.k;
          if (lat > STRIKE.bodyR + STRIKE.r || yb - STRIKE.r > top || yb + STRIKE.r < s.y) continue;
          // điểm chạm càng xa gốc càng nhanh
          const hitV = B.sp * (1 - t), head = yb > top - 3;
          if (hitV < STRIKE.minV) continue;
          const dmg = head ? Math.min(STRIKE.headMax, STRIKE.head + hitV * STRIKE.perV) : Math.min(STRIKE.bodyMax, STRIKE.body + hitV * STRIKE.perV);
          P.strikeT = STRIKE.cool;
          const vl = Math.hypot(B.vx, B.vz) || 1;
          this.hurtBy(P, dmg, 'Nòng ' + (v.name || 'xe') + (head ? ' đập vào đầu' : ' quét trúng người'), { mode: 'fall' }, B.vx / vl * 34, B.vz / vl * 34);
        }
      }
    }
    stepShoves(dt) {
      for (const P of this.mine) {
        const S = P.shove, s = P.s;
        if (!S) continue;
        if ((S.t -= dt) <= 0 || !s.alive || s.ride) { P.shove = null; continue; }
        const nx = s.x + S.x * dt, nz = s.z + S.z * dt;
        if (this.world.canStand(nx, nz)) { s.x = nx; s.z = nz; }
      }
    }

    // ----- ĐI NHỜ XE ĐỒNG MINH -----
    gapTo(v, s) {
      const VC = VehicleCollision;
      return VC.circleGap(VC.vehObb(v, v.x, v.z, v.bodyAngle, this._ob || (this._ob = {})), s.x, s.z, 2, this._gap || (this._gap = {})).gap;
    }
    freeSeat(v) {
      const S = VehicleRide.SEATS[v.tankType], R = v._riders;
      if (!S) return -1;
      for (let i = 0; i < S.length; i++) if (!R || !R[i]) return i;
      return -1;
    }
    // xe đồng minh sát lính nhất (kể cả đang chạy / hết chỗ, để báo cho người chơi biết)
    vehicleNear(s) {
      let best = null, bg = RIDE.reach;
      for (const v of this.veh) {
        if (v.team !== s.team || !VehicleRide.SEATS[v.tankType] || Math.hypot(v.x - s.x, v.z - s.z) > 70 || Math.abs((v.y || 0) - s.y) > 24) continue;
        const g = this.gapTo(v, s);
        if (g < bg) { bg = g; best = v; }
      }
      return best;
    }
    canBoard(P) {
      const F = P.s.figure;
      return P.s.alive && !P.s.ride && F.kamiSeq == null && !F.kamiCtl && !(F._proneK > 0.05);
    }
    board(P, v, i) {
      const s = P.s, S = VehicleRide.SEATS[v.tankType][i];
      (v._riders || (v._riders = []))[i] = P;
      s.stop(); s._orders.length = 0; s.intent.aim = null; s.intent.stance = 'stand'; s.speed = 0;
      s.enemy = null;
      if (S.in) s.setGuard(false);
      const cg = v.chassisGroup || v.group, fl = this._rp || (this._rp = new THREE.Vector3());
      cg.updateWorldMatrix(true, false);
      cg.worldToLocal(fl.set(s.x, s.y, s.z));
      s.ride = { v, seat: S, i, inside: !!S.in, k: 0, dir: 1, from: { x: s.x, y: s.y, z: s.z }, fromL: [fl.x, fl.y, fl.z], hu: VehicleCollision.vehObb(v, v.x, v.z, v.bodyAngle, this._ob || (this._ob = {})).hu, rel: s.heading - (v.bodyAngle || 0), armed: false, stopT: 0, frame: {} };
      P.boardV = null; P.called = false; P.rideT = 0;
      P.u._rideV = v;
      if (this.mine.includes(P) && P !== this.me) this.standGuard(P);   // ngồi ngoài vẫn canh gác, tự bắn (đồng đội chạy lại lên xe đã tắt canh gác)
      if (this.mine.includes(P) && this.game.netSync && this.game.netSync.sendRide) this.game.netSync.sendRide(P.u, v, i);
    }
    // vệt tối chỗ người tiếp xúc sàn xe: bóng nắng rơi sang hướng khác thì người vẫn không lơ lửng (gắn vào root, theo người cả khi quỳ xoay)
    contactOf(P) {
      if (P.contact) return P.contact;
      const R = Match._contact || (Match._contact = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 3, 32, 32, 32);
        gr.addColorStop(0, 'rgba(0,0,0,.72)'); gr.addColorStop(0.55, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        const geo = new THREE.PlaneGeometry(6.4, 5.6); geo.rotateX(-Math.PI / 2);
        return { geo, mat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) };
      })());
      const m = P.contact = new THREE.Mesh(R.geo, R.mat);
      m.position.set(0, SoldierModel.FOOT_Y + 0.08, 0.7);   // lệch vào trong sàn (+z = sau lưng người ngồi quay mặt ra ngoài)
      m.castShadow = false; m.receiveShadow = false; m.visible = false;
      P.s.root.add(m);
      return m;
    }
    // chỗ nhảy xuống: phía ghế trước, không được thì phía kia, rồi tới sau đuôi xe
    exitPoint(s, R, force) {
      const v = R.v, W = this.world, VC = VehicleCollision, ob = VC.vehObb(v, v.x, v.z, v.bodyAngle, this._ob || (this._ob = {}));
      const a = v.bodyAngle || 0, ca = Math.cos(a), sa = Math.sin(a), o = R.seat.o, off = ob.hu + 7, back = ob.hv + 7;
      const opts = [[o * off, R.seat.z], [-o * off, R.seat.z], [o * 5, back], [o * off, -R.seat.z]];
      for (const [lx, lz] of opts) {
        const x = v.x + lx * ca + lz * sa, z = v.z - lx * sa + lz * ca;
        if (W.canStand(x, z) && W.lineFree(v.x, v.z, x, z)) return { x, z };
      }
      if (!force) return null;
      return { x: v.x + opts[0][0] * ca + opts[0][1] * sa, z: v.z - opts[0][0] * sa + opts[0][1] * ca };
    }
    // bắt đầu nhảy xuống; false = quanh xe không có chỗ đứng (nước sâu, vướng nhà), ở lại trên xe
    leave(P, force) {
      const s = P.s, R = s.ride;
      if (!R || R.dir < 0) return true;
      const e = this.exitPoint(s, R, force);
      if (!e) return false;
      if (R.v._riders && R.v._riders[R.i] === P) R.v._riders[R.i] = null;
      if (R.k < 1) R.abort = { x: s.x, y: s.y, z: s.z };   // đang leo dở: rơi thẳng xuống chỗ đứng
      R.dir = -1; R.k = 1;
      if (R.inside) R.rel = R.seat.o < 0 ? Math.PI / 2 : -Math.PI / 2;   // ra khỏi cửa là đã quay mặt ra ngoài
      R.from = { x: e.x, y: this.world.groundAt(e.x, e.z, null), z: e.z };
      P.u._inVeh = false;
      if (this.mine.includes(P) && this.game.netSync && this.game.netSync.sendRide) this.game.netSync.sendRide(P.u, null, 0);
      return true;
    }
    // chết trên xe / lúc đang leo: xác rơi từ đúng chỗ đang ở, mang theo đà xe, tiếp đất ngoài thân xe (Soldier.startDeath)
    rideFall(s) {
      const v = s.ride.v, a = v.bodyAngle || 0, sp = v.isDead ? 0 : v.speed || 0;
      return { x: s.x, y: s.y, z: s.z, vx: -Math.sin(a) * sp, vz: -Math.cos(a) * sp, ob: VehicleCollision.vehObb(v, v.x, v.z, a, {}) };
    }
    // chạm đất (hoặc chết / bỏ trận): trả lính về SoldierEngine đi bộ như thường
    endRide(P) {
      const s = P.s, R = s.ride;
      if (!R) return;
      if (R.v._riders && R.v._riders[R.i] === P) R.v._riders[R.i] = null;
      s.ride = null;
      const u = P.u;
      u._rideV = null; u._inVeh = false; u._shBox = BOX;
      s.figure.seated = false; s.figure.stow = false; s.figure.climb = null; if (s.figure.grab) s.figure.grab.on = false;
      if (P.contact) P.contact.visible = false;
      if (!P.called) s.stop();   // lệnh di chuyển lúc còn trên xe không còn đúng
      s.heading = (R.v.bodyAngle || 0) + R.rel;
      if (R.dir < 0) { s.x = R.from.x; s.z = R.from.z; }
      s.y = this.world.groundAt(s.x, s.z, null);
      s.root.rotation.set(0, s.heading, 0);
      s.applyTransform();
      u.x = s.x; u.z = s.z; u.y = s.y;
      if (this.mine.includes(P) && P !== this.me && !P.called) this.standGuard(P);
    }
    // xe nổ: trong khoang chết theo xe; ngoài xe bị hất xuống, mất nửa máu (phần nổ của xác xe tính riêng)
    vehicleLost(P) {
      const { u, s } = P, R = s.ride, inside = R.inside && R.dir > 0, mine = this.mine.includes(P), seated = R.k >= 1;
      if (inside && mine) {
        // giữ nguyên ghế để syncIn biết là chết trong khoang, không rơi xác ra ngoài
        u._inVeh = false;
        u._infDeath = { mode: 'direct' };
        const r = u.takeDamage(u.maxHp + 1, null, 'DIRECT_HIT');
        if (r && r.killed) { this.game.onUnitDestroyed(u, null, R.v.name || 'xe nổ'); return; }
      }
      this.leave(P, true);
      if (!mine || inside) return;
      if (seated) {
        u._infDeath = { mode: 'blast', x: R.v.x, y: R.v.y + 8, z: R.v.z, power: 0.5 };
        const r = u.takeDamage(u.maxHp * 0.5, null, 'BURN');
        if (r && r.killed) this.game.onUnitDestroyed(u, null, R.v.name || 'xe nổ');
      }
    }
    // F: lên xe sát bên / xuống xe (đồng đội cùng xe xuống theo, đồng đội đứng gần chạy lại lên cùng)
    toggleRide() {
      const G = this.game, M = this.me, R = M.s.ride, log = (t) => { if (G.addCombatLog) G.addCombatLog(t, 'alert'); };
      if (R) {
        if (R.dir < 0 || R.k < 1) return;
        if (Math.abs(R.v.speed || 0) > RIDE.jumpV) { log('[[alert-triangle]] Xe chạy nhanh quá, chưa nhảy xuống được'); return; }
        if (!this.leave(M)) { log('[[alert-triangle]] Quanh xe không có chỗ đứng'); return; }
        for (const P of this.mine) if (P !== M && P.s.ride && P.s.ride.v === R.v) this.leave(P);
        return;
      }
      const v = this.vehicleNear(M.s);
      if (!v) return;
      if (Math.abs(v.speed || 0) > RIDE.boardV) { log('[[alert-triangle]] Xe đang chạy, chờ xe chậm lại mới leo lên được'); return; }
      const i = this.freeSeat(v);
      if (i < 0) { log('[[alert-triangle]] Xe hết chỗ'); return; }
      if (!this.canBoard(M)) return;
      this.board(M, v, i);
      for (const P of this.mine) {
        if (P === M || !P.s.alive || P.s.ride || Math.hypot(P.s.x - v.x, P.s.z - v.z) > RIDE.gather) continue;
        P.boardV = v; P.s.setGuard(false); P.s.moveTo(v.x, v.z, 'run');
      }
    }
    // đồng đội đang chạy lại lên xe: tới sát thì leo, xe chạy mất / hết chỗ thì về canh gác
    stepBoarders() {
      for (const P of this.mine) {
        const v = P.boardV;
        if (!v) continue;
        if (!P.s.alive || v.isDead || Math.abs(v.speed || 0) > RIDE.boardV || this.freeSeat(v) < 0 || P === this.me) { P.boardV = null; if (P !== this.me && P.s.alive) { P.s.stop(); this.standGuard(P); } continue; }
        if (this.gapTo(v, P.s) < RIDE.reach && this.canBoard(P)) this.board(P, v, this.freeSeat(v));
      }
    }
    stepRiders(dt) {
      for (const P of this.pairs) {
        const s = P.s, R = s.ride;
        if (!R) continue;
        const T = VehicleRide.TIME;
        R.k = Math.max(0, Math.min(1, R.k + R.dir * dt / (R.dir > 0 ? (R.inside ? T.upIn : T.upOut) : (R.inside ? T.downIn : T.downOut))));
        if (R.dir < 0 && R.k <= 0) { this.endRide(P); continue; }
        if (R.dir > 0 && R.k >= 1 && R.inside) P.u._inVeh = true;
        const v = R.v;
        if (R.dir > 0 && v.isDead) { this.vehicleLost(P); if (!s.ride) continue; }
        // nòng xe đang quét tới chỗ ngồi: tụt người qua mép rồi trở lại (mọi máy tự tính theo góc tháp)
        if (R.dir > 0 && !R.inside && R.k >= 1 && v.turretGroup) {
          const rot = v.turretGroup.rotation.y, om = dt > 0 ? Math.atan2(Math.sin(rot - (R.prot === undefined ? rot : R.prot)), Math.cos(rot - (R.prot === undefined ? rot : R.prot))) / dt : 0;
          R.prot = rot;
          const drop = VehicleRide.barrelDrop(v, R.seat, rot, om, v.barrelPivot ? v.barrelPivot.rotation.x : 0);
          if (drop > 0) { R.duckD = Math.max(R.duckD && R.duck > 0 ? R.duckD : 0, drop); R.duckHold = 0.5; }
          else R.duckHold = Math.max(0, (R.duckHold || 0) - dt);
          R.duck = Math.max(0, Math.min(1, (R.duck || 0) + (R.duckHold > 0 ? dt * 4.5 : -dt * 2.5)));
        }
        if (R.dir < 0 || !this.mine.includes(P)) continue;
        const sp = Math.abs(v.speed || 0);
        if (sp > RIDE.moved) R.armed = true;
        if (R.armed && sp < RIDE.still) { R.stopT += dt; if (R.stopT >= RIDE.stopS + R.i * 0.35) this.leave(P); }
        else R.stopT = 0;
        if ((P.rideT += dt) >= RIDE.resendS) { P.rideT = 0; if (this.game.netSync && this.game.netSync.sendRide) this.game.netSync.sendRide(P.u, v, R.i); }
      }
    }
    // đặt lính theo ghế / theo đường nhảy; gọi cả sau khi các xe đã cập nhật để lính không trễ xe 1 khung
    placeRider(P) {
      const s = P.s, R = s.ride, v = R.v, cg = v.chassisGroup || v.group, S = R.seat;
      const q = this._rq || (this._rq = new THREE.Quaternion()), q2 = this._rq2 || (this._rq2 = new THREE.Quaternion()), p = this._rp || (this._rp = new THREE.Vector3()), up = this._ru || (this._ru = new THREE.Vector3(0, 1, 0));
      cg.updateWorldMatrix(true, false);
      const f = VehicleRide.frame(R, R.frame), k = R.k, F = s.figure;
      if (R.abort) {
        const u = f.drop;
        s.x = R.abort.x + (R.from.x - R.abort.x) * u; s.z = R.abort.z + (R.from.z - R.abort.z) * u; s.y = R.abort.y + (R.from.y - R.abort.y) * u * u;
      } else {
        p.set(f.x, f.y, f.z); cg.localToWorld(p);
        if (f.drop != null) {
          const u = f.drop;   // rơi: ngang đều, dọc nhanh dần
          s.x = p.x + (R.from.x - p.x) * u; s.z = p.z + (R.from.z - p.z) * u; s.y = p.y + (R.from.y - p.y) * u * u;
        } else { s.x = p.x; s.y = p.y; s.z = p.z; }
      }
      R.sit = f.sit; R.face = f.face; R.walk = f.walk;
      // xe đang chạy: một tay bám điểm cố định trên xe (ngưỡng trễ để xe nhích nhẹ không làm tay đưa ra đưa vào)
      if (S.g) {
        const G = F.grab || (F.grab = { p: new THREE.Vector3(), side: 1, lean: 0, on: false }), sp = Math.abs(v.speed || 0);
        G.frame = cg; G.p.set(S.g[0], S.g[1], S.g[2]); G.lean = S.l || 0;
        G.side = (S.g[0] - S.x) * Math.cos(S.h) - (S.g[2] - S.z) * Math.sin(S.h) < 0 ? -1 : 1;
        G.on = !(R.duck > 0.02) && (G.on ? sp > 3 : sp > 8);
      }
      if (f.k > 0 || f.handK > 0) {
        const C = F.climb || (F.climb = { hands: [new THREE.Vector3(), new THREE.Vector3()] });
        C.k = f.k; C.pose = f.pose; C.handK = f.handK; C.frame = cg;
        if (f.handK > 0) { C.hands[0].copy(f.hands[0]); C.hands[1].copy(f.hands[1]); }
      } else F.climb = null;
      s.heading = (v.bodyAngle || 0) + R.rel;
      s.root.position.set(s.x, s.y - SoldierModel.FOOT_Y * s.k, s.z);
      cg.getWorldQuaternion(q); q2.setFromAxisAngle(up, R.rel);
      s.root.quaternion.copy(q).multiply(q2);
      P.u.x = s.x; P.u.y = s.y; P.u.z = s.z; P.u.bodyAngle = s.heading;
      this.hitBox(P);
      if (!R.inside) this.contactOf(P).visible = R.dir > 0 && k > 0.9 && !(R.duck > 0.1);
    }
    lateUpdate() {
      for (const P of this.pairs) if (P.s.ride) { this.placeRider(P); P.s.root.visible = !P.s._gone && !(P.s.ride.inside && P.s.ride.k >= 1 && P.s.ride.dir > 0) && (P.u.isDead || !P.u.group || P.u.group.visible); }
    }
    // tin từ máy khác: lính của máy đó lên / xuống xe. Trùng ghế (hai máy leo cùng lúc): lính số nhỏ giữ ghế, lính còn lại xuống
    onNetRide(u, v, i) {
      const P = this.pairs.find(q => q.u === u);
      if (!P || !P.s.alive) return;
      const R = P.s.ride;
      if (!v) { if (R) this.leave(P, true); return; }
      if (R && R.v === v && R.dir > 0) return;   // gửi lại định kỳ
      if (R) this.endRide(P);
      if (!VehicleRide.SEATS[v.tankType] || !VehicleRide.SEATS[v.tankType][i]) return;
      const cur = v._riders && v._riders[i];
      if (cur && cur !== P) {
        if (this.mine.includes(cur) && u.netId < cur.u.netId) { if (!this.leave(cur, true)) this.endRide(cur); }
        else if (cur.u.netId < u.netId) return;
      }
      this.board(P, v, i);
    }
    rideHint(s) {
      const R = s.ride;
      if (R) return R.dir < 0 || R.k < 1 ? '' : R.inside ? 'Trong khoang xe · F xuống · xe dừng thì tự xuống' : 'Trên xe · bắn được · F xuống · xe dừng thì tự xuống';
      const v = this.vehicleNear(s);
      if (!v) return '';
      if (Math.abs(v.speed || 0) > RIDE.boardV) return 'Xe đang chạy, chờ chậm lại mới leo lên được';
      const S = VehicleRide.SEATS[v.tankType], T = v._riders || [];
      let inF = 0, inN = 0, outF = 0, outN = 0;
      S.forEach((q, j) => { if (q.in) { inN++; if (!T[j]) inF++; } else { outN++; if (!T[j]) outF++; } });
      if (!inF && !outF) return 'Xe hết chỗ';
      return 'F lên xe · ' + (inN ? 'trong khoang còn ' + inF + '/' + inN + ' · ' : '') + 'ngồi ngoài còn ' + outF + '/' + outN;
    }
    // phím 1-4: chuyển sang lính đó (mỗi lính mang đúng 1 vũ khí chọn ở kho). Lính cũ ở lại canh gác
    switchTo(i) {
      const P = this.mine[i], C = this.ctl;
      if (!P || P === this.me || P.u.isDead) return;
      const ks = this.kamiState();
      if (ks === 'launching' || ks === 'flying' || ks === 'returning' || this.me.s.figure.kamiSeq != null) { if (this.game.addCombatLog) this.game.addCombatLog('[[drone]] Đang phóng / lái UAV cảm tử — xong mới đổi lính được', 'alert'); return; }
      const keys = C.keys, old = this.me;
      C.exit();
      this.standGuard(old);
      P.s.setGuard(false);
      P.called = false; P.boardV = null; P.run = null;
      this.me = P;
      P.hitSeen = P.u._lastHitAt;   // vết thương lúc chưa điều khiển lính này không báo lại
      this.game.switchPlayerUnit(P.u);
      C.enter(P.s);
      C.keys = keys;
      C.aimK = 0; C.rangeM = null;
    }
    // phím `: cả tổ về chỗ lính đang điều khiển rồi canh gác tiếp
    callAll() {
      const M = this.me.s;
      this.mine.forEach((P, i) => {
        if (P === this.me || !P.s.alive) return;
        if (P.run) return;    // đang chạy đi lấy đạn: lấy xong tự về
        if (M.ride) return;   // đang đi xe: đồng đội ở nguyên vị trí
        if (P.s.ride && !this.leave(P)) return;
        P.boardV = null;
        const a = i / this.mine.length * Math.PI * 2;
        P.s.setGuard(false);   // chạy về trước, tới nơi mới canh gác lại (update)
        P.called = true;
        P.s.moveTo(M.x + Math.cos(a) * 14, M.z + Math.sin(a) * 14, 'run', 0.1);
      });
    }
    // lính canh gác tự bắn: đi cùng đường đạn của trận như phát do người chơi bắn
    fireGuard(s, aim) {
      const P = this.mine.find(q => q.s === s);
      if (!P || P === this.me || P.u.isDead || !this.ctl) return;
      this.fireLive(s, s.arms.def.muzzle ? s.muzzlePos() : s.figure.rifle.localToWorld(new THREE.Vector3(0, 0.4, -6)), { point: new THREE.Vector3(aim.x, aim.y, aim.z) }, null);
    }

    // Controller gọi khi một phát rời nòng: bắn đạn thật của trận thay cho dò tia của phòng thử
    fireLive(s, muzzle, hit, dir) {
      const G = this.game, u = (this.pairs.find(q => q.s === s) || this.me).u, B = G.ballistics, W = s.weapon, def = s.arms.def;
      if (s.ride && (s.ride.inside || s.ride.k < 1 || s.ride.duck > 0.05)) return;
      // người chơi: nòng theo đường ngắm + góc chỉnh của kính / thước ngắm, tự nâng tâm theo vạch; lính canh gác vẫn tự tính góc
      const L = SoldierEngine.lob(muzzle, hit.point, def.ball), lobEl = dir ? this.ctl.boreFor(s, muzzle, hit.point) : L.elev;
      const h = Math.hypot(L.vx, L.vz) || 1, c = Math.cos(lobEl) * def.ball.v;
      const v = new THREE.Vector3(L.vx / h * c, Math.sin(lobEl) * def.ball.v, L.vz / h * c);
      // độ tản (giật súng, đang đi) của phát bắn: lệch trên vận tốc đầu
      if (dir) v.addScaledVector(dir.clone().sub(this.ctl._ray), def.ball.v * (W === 'rpg' ? 0.5 : 1));
      const d = v.clone().normalize();
      const az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      let shell = null;
      u.azimuth = az; u.elevation = el;
      u._launchOverride = { position: muzzle.clone(), direction: d };
      u.revealTimer = Math.max(u.revealTimer || 0, W === 'gl' ? 2 : 3);   // chớp lửa / khói phụt sau: lộ vị trí (TeamIntel)
      u._roofShot = true; u.roofWeapon = W === 'gl' ? 'agl' : null;
      if (W === 'rpg') B._modelOverride = 'PG7';   // hình đạn PG-7 thay tên lửa giàn xe (đạn vẫn là 'RPG')
      try { shell = B.fireShell3D(u, az, el, 1, W === 'gl' ? 'GATLING_BULLET' : W === 'rpg' ? 'RPG' : 'SCOUT_BULLET'); } finally { u._launchOverride = null; u._roofShot = false; u.roofWeapon = null; B._modelOverride = null; }
      if (W === 'atr') {
        this.ctl.muzzleFx(s, muzzle, 'atr');
        this.world.sfx(s, 'atrShot');
      } else if (W === 'rpg') {
        this.ctl.muzzleFx(s, muzzle, 'rpg');
      } else this.ctl.muzzleFx(s, muzzle, 'gl');
      if (!shell) return;
      shell.isGatling = W !== 'gl' && W !== 'rpg';
      if (W === 'rpg') B.coldLaunch(shell);
      // đạn đạo theo đúng thông số súng (không cản gió, trọng lực riêng) để nòng ngóc theo SoldierEngine.lob rơi trúng tâm ngắm
      shell.vx = v.x; shell.vy = v.y; shell.vz = v.z;
      shell.g = def.ball.g; shell.k = def.ball.k || 0; shell.maxTravel = def.ball.range;
      if (def.ball.wind && !(dir && SoldierPlayer.ASSIST)) shell.windMul = def.ball.wind;   // chế độ hỗ trợ: phát của người chơi không bị gió đẩy   // đạn bắn tỉa: cản không khí + gió đẩy lệch (ballistics.integrateFlight)
      if (W === 'gl') {
        const R = DroneAir.C.ROOF.agl;
        shell.gl40 = true; shell.roofDirect = R.direct; shell.roofSplash = R.splash; shell.roofBlast = R.blast;
      } else if (W !== 'rpg') { shell.roofDirect = 0.8; shell.atr = true; }   // lõi xuyên giáp (VehicleDamage PEN.ATR20): thủng đuôi / nóc / sườn xe tăng, không thủng mặt trước
      const sync = G.netSync, pf = sync && sync.pendingFires && sync.pendingFires.find(f => f.shell === shell);
      if (pf) pf.v = [v.x, v.y, v.z];
    }

    // lính máy khác bắn RPG (gói mạng chỉ dựng viên đạn): tái hiện tiếng, lửa + khói, ống trống rồi nạp. Đang lái xe thì không có Controller: giữ một bộ chỉ để vẽ hiệu ứng
    onNetShot(u, ammo) {
      const P = this.pairs.find(q => q.u === u);
      if (P && ammo === 'SCOUT_BULLET' && P.s.weapon === 'atr' && P.s.alive && !(P.s.arms.reload > 0)) {
        // súng bắn tỉa: tiếng nổ, lửa hãm nòng, rồi kéo khoá như máy bắn (băng giữ đầy: máy bắn tự đếm đạn)
        const s = P.s; s.arms.mag = s.arms.def.mag;
        s.fireRound(); s.figure.recoil = 1; P.recoilT = 0.2;
        const G = this.game, fx = this.ctl || this.fxCtl || (this.fxCtl = new SoldierPlayer.Controller({ world: this.world, terrain: G.terrain, scene: G.scene, cam: G.camera }));
        fx.muzzleFx(s, s.muzzlePos(), 'atr');
        this.world.sfx(s, 'atrShot');
        return;
      }
      if (!P || ammo !== 'RPG' || P.s.weapon !== 'rpg' || !P.s.alive) return;
      const s = P.s, A = s.arms;
      A.res = undefined;   // lính máy khác: máy bắn tự đếm đạn, ở đây chỉ tái hiện hình nạp
      if (A.reload > 0) { A.reload = 0; if (A.rp) A.rp.t = null; }   // phát này tới trước khi hình nạp xong: máy bắn mới là chuẩn
      A.mag = A.def.mag;
      s.fireRound(); s.startReload();
      s.figure.recoil = 1; P.recoilT = 0.2;
      const G = this.game, fx = this.ctl || this.fxCtl || (this.fxCtl = new SoldierPlayer.Controller({ world: this.world, terrain: G.terrain, scene: G.scene, cam: G.camera }));
      fx.muzzleFx(s, s.muzzlePos(), 'rpg');
    }

    // ----- HẾT ĐẠN: TỰ ĐI LẤY ĐẠN -----
    // Đạn dự trữ có hạn (SoldierEngine.RESERVE, băng phóng lựu). Lính máy (không phải lính đang điều khiển) bắn hết sạch -> thôi canh gác, chạy tới nguồn
    // đạn gần nhất: hòm ĐẠN / TỔNG HỢP còn trên bản đồ (SupplyManager) hoặc điểm tiếp tế hậu phương của phe (SupplyDepot, luôn có). Hòm do chủ phòng
    // xét ai chạm (takeCrate gọi onCrate), điểm tiếp tế đứng trong vùng ~1,5 s là nhận. Lấy xong chạy về chỗ lính đang điều khiển, canh gác tiếp.
    // UAV cảm tử không tiếp đạn trong trận (KAMI_PER).
    dryOut(s) { const A = s.arms; return !A.def.kami && A.mag <= 0 && !(A.reload > 0) && s.reserve === 0; }
    // còn thiếu đạn so với lúc xuất kích (điểm tiếp tế / hòm nạp cho cả người chưa hết hẳn)
    shortAmmo(s) {
      const A = s.arms, cap = SoldierEngine.RESERVE[s.weapon];
      if (A.def.kami) return false;
      if (A.front !== undefined) { const B = s.figure.chest.userData.glBelt, side = B ? B.slots.length / 2 : 12; return A.front + A.back < 2 * side || A.mag < A.def.mag; }
      return cap !== undefined && ((A.res !== undefined ? A.res : cap) < cap || A.mag < A.def.mag);
    }
    // nạp lại như lúc xuất kích. Đang dở động tác nạp / phóng thì để lượt sau
    restock(P) {
      const s = P.s, A = s.arms;
      if (!s.alive || A.def.kami || A.reload > 0 || (A.rp && A.rp.t != null) || s.figure.kamiSeq != null) return false;
      s.initArms();
      const cap = SoldierEngine.RESERVE[s.weapon];
      if (cap !== undefined) s.arms.res = cap;
      s.figure.rpgEmpty = false;
      P.restockPend = false;
      if (P === this.me && this.game.addCombatLog) this.game.addCombatLog('[[package]] Đã nhận đạn · ' + (WEAPON_NAME[s.weapon] || s.weapon) + ' đủ cơ số', 'info');
      return true;
    }
    // hòm tiếp tế bị lính chạm (SupplyManager.takeCrate, chỉ phần thưởng trên máy có quyền với lính)
    onCrate(u, crate) {
      const P = this.mine.find(q => q.u === u);
      if (!P || !(crate.type === 'AMMO' || crate.type === 'ALL')) return false;
      if (!this.restock(P)) P.restockPend = true;
      if (P.run) this.endAmmoRun(P);
      return true;
    }
    ammoSources(team) {
      const G = this.game, out = [], SM = G.supplyManager;
      if (SM && SM.supplyCrates) for (const c of SM.supplyCrates) if (c.active && (c.type === 'AMMO' || c.type === 'ALL')) out.push({ crate: c, x: c.x, z: c.z, name: c.name });
      const D = typeof SupplyDepot !== 'undefined' && SupplyDepot.of(G, team);
      // đứng phía trước xe tải / đống pallet (khối đặc), trong vùng nạp
      if (D) out.push({ depot: D, x: D.x - Math.sin(D.rot || 0) * D.R * 0.6, z: D.z - Math.cos(D.rot || 0) * D.R * 0.6, name: 'ĐIỂM TIẾP TẾ HẬU PHƯƠNG' });
      return out;
    }
    startAmmoRun(P) {
      const s = P.s, L = this.ammoSources(s.team);
      if (!L.length) return;
      let best = null, bd = Infinity;
      for (const q of L) { const d = Math.hypot(q.x - s.x, q.z - s.z) * (q.depot ? 1.15 : 1); if (d < bd) { bd = d; best = q; } }   // hòm gần thì ưu tiên hòm
      P.run = Object.assign({ t: 0, still: 0, re: 3 }, best);
      s.setGuard(false); P.called = false;
      s.moveTo(best.x, best.z, 'run');
      if (this.game.addCombatLog) this.game.addCombatLog('[[package]] Lính ' + (this.mine.indexOf(P) + 1) + ' hết đạn · chạy tới [' + best.name + '] lấy đạn (' + Math.round(bd / 8) + ' m)', 'info');
    }
    endAmmoRun(P) {
      P.run = null;
      const M = this.me && this.me.s;
      if (!M || !M.alive || M.ride || P === this.me) { this.standGuard(P); return; }
      const a = this.mine.indexOf(P) / this.mine.length * Math.PI * 2;
      P.called = true;
      P.s.moveTo(M.x + Math.cos(a) * 14, M.z + Math.sin(a) * 14, 'run', 0.3);
    }
    stepAmmoRuns(dt) {
      const G = this.game;
      for (const P of this.mine) {
        const s = P.s;
        if (!s.alive || P.u.isDead) { P.run = null; P.depotT = 0; continue; }
        if (P.restockPend && this.restock(P) && P.run) this.endAmmoRun(P);
        // điểm tiếp tế hậu phương: đứng trong vùng một lúc là nhận (cả lính đang điều khiển)
        const D = !s.ride && typeof SupplyDepot !== 'undefined' && SupplyDepot.at(G, P.u);
        P.depotT = D && this.shortAmmo(s) && s.speed < 2 ? (P.depotT || 0) + dt : 0;
        if (P.depotT > 1.5 && this.restock(P)) { P.depotT = 0; if (P.run) this.endAmmoRun(P); continue; }
        if (P === this.me) { if (P.run) { P.run = null; } continue; }
        if (s.ride) continue;
        const R = P.run;
        if (!R) { if (this.dryOut(s) && !P.called) this.startAmmoRun(P); continue; }
        R.t += dt;
        // hòm vừa bị người khác lấy mất: chọn nguồn khác; tới nơi rồi mà đường đi bỏ dở thì đi tiếp
        if (R.crate && !R.crate.active) { this.startAmmoRun(P); continue; }
        if ((R.re -= dt) <= 0) { R.re = 3; if (!s.intent.target && Math.hypot(R.x - s.x, R.z - s.z) > (R.depot ? R.depot.R * 0.5 : 20)) s.moveTo(R.x, R.z, 'run'); }
      }
    }

    // ----- PHẢN HỒI CHIẾN ĐẤU: đạn mình trúng, mình trúng đạn, đạn sượt qua -----
    // kind: bảng MARK. Gọi từ game.js khi đạn của người chơi trúng địch
    markHit(kind = 'hit') {
      const D = MARK[kind];
      if (!D || !this.ctl) return;
      const M = this._mk;
      if (!(M && M.t > 0 && MARK[M.kind].p > D.p)) this._mk = { kind, t: D.t, fresh: true };
      const SE = window.soundEngine;
      if (SE && SE.playHitMark) SE.playHitMark(kind);
    }
    // from: điểm nguồn (toạ độ thế giới) hoặc null nếu không rõ hướng; amt: phần máu vừa mất; blast: vụ nổ chứ không phải đạn thẳng (ghi cạnh số phương vị)
    noteHurt(from, amt, blast) {
      this._hurtK = Math.max(this._hurtK || 0, Math.min(1, 0.4 + amt * 1.2));
      if (!from || !this.$arcs) return;
      const M = this.me.s, ang = Math.atan2(from.x - M.x, from.z - M.z);
      let A = this.$arcs.find(q => q.t > 0 && Math.abs(Math.atan2(Math.sin(q.ang - ang), Math.cos(q.ang - ang))) < HURT.merge);
      if (!A) A = this.$arcs.reduce((a, b) => (b.t < a.t ? b : a));
      A.x = from.x; A.z = from.z; A.ang = ang; A.t = HURT.fade;
      // phương vị la bàn như thước trên cùng màn hình (bắc = -z), đọc được ngay để báo đồng đội
      A.lb.textContent = String(Math.round(((Math.atan2(from.x - M.x, -(from.z - M.z)) * 180 / Math.PI) + 360) % 360) % 360).padStart(3, '0') + '°' + (blast ? ' · NỔ' : '');
    }
    // chạy trước syncIn (syncIn dùng hết u._infDeath). Trúng đạn thật có u._lastHitAt mới, cả tin DAMAGE từ máy khác; chảy máu / cháy thì không
    stepHurt() {
      const M = this.me;
      if (!M) return;
      const u = M.u, at = u._lastHitAt, amt = Math.max(0, ((M.hpSeen === undefined ? u.hp : M.hpSeen) - u.hp) / (u.maxHp || 1));
      M.hpSeen = u.hp;
      if (at === M.hitSeen) return;
      M.hitSeen = at;
      const D = u._infDeath, A = u._lastAttacker, vl = D && D.vel ? Math.hypot(D.vel.x, D.vel.z) : 0, blast = !!(D && D.mode === 'blast' && D.x != null);
      let from = null;
      if (blast && Math.hypot(D.x - u.x, D.z - u.z) > 6) from = { x: D.x, z: D.z };
      else if (vl > 1) from = { x: u.x - D.vel.x / vl * 400, z: u.z - D.vel.z / vl * 400 };   // ngược hướng đạn bay
      else if (A && A !== u && performance.now() - (u._lastAttackerAt || -1e9) < 1500) from = { x: A.x, z: A.z };
      this.noteHurt(from, amt, blast && from && from.x === D.x);
      const SE = window.soundEngine;
      if (blast) {
        if (SE && SE.shellShock) SE.shellShock(Math.min(1.0, 0.5 + amt * 0.9));
        if (this.ctl) this.ctl.shake = Math.max(this.ctl.shake || 0, Math.min(1.6, 0.85 + amt * 1.2));
      } else if (SE && SE.playSelfHit) {
        SE.playSelfHit(D && D.zone === 'plate' ? 'plate' : 'flesh');
      }
    }
    // đạn địch bay ngang người: tìm điểm gần nhất trên đoạn đạn vừa đi trong khung này. Đạn bay qua trọn một khung nên không dò theo điểm đầu mút
    // (khung đầu thấy viên đạn: lùi theo vận tốc, viên bắn từ gần có thể đã bay qua người ngay trong khung đó)
    stepNearMiss(dt) {
      const M = this.me, B = this.game.ballistics, SE = window.soundEngine, cam = this.game.camera;
      if (!M || !B || !B.activeShells || !SE || !SE.playBulletNear || M.u.isDead || M.u._inVeh) return;
      const S = M.s, px = S.x, py = S.y + 10, pz = S.z, e = cam.matrixWorld.elements;
      for (const sh of B.activeShells) {
        const first = sh._nmX === undefined, ax = first ? sh.x - (sh.vx || 0) * dt : sh._nmX, ay = first ? sh.y - (sh.vy || 0) * dt : sh._nmY, az = first ? sh.z - (sh.vz || 0) * dt : sh._nmZ;
        sh._nmX = sh.x; sh._nmY = sh.y; sh._nmZ = sh.z;
        if (sh._nmDone || sh.shooterId === M.u.id || sh.shooterTeam === S.team || sh.isHeavyArty || sh.whistleSnd) continue;
        const dx = sh.x - ax, dy = sh.y - ay, dz = sh.z - az, L2 = dx * dx + dy * dy + dz * dz;
        if (L2 < 1e-4) continue;
        const t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2;
        if (t >= 1) { sh._nmNear = true; continue; }      // còn đang bay tới
        if (t <= 0 && !sh._nmNear) { sh._nmDone = true; continue; }   // đã đi xa dần từ đầu: không ngang qua
        sh._nmDone = true;
        const k = Math.max(0, t), cx = ax + dx * k - px, cy = ay + dy * k - py, cz = az + dz * k - pz, d = Math.hypot(cx, cy, cz);
        const slow = !!sh.gl40 || !!sh.guide || SLOW_AMMO.has(sh.ammoType), small = !slow && (!!sh.isGatling || SMALL_AMMO.has(sh.ammoType)), R = small ? NEAR.small : NEAR.big;
        if (d > R) continue;
        const dh = Math.hypot(cx, cz), pan = dh > 1 ? Math.max(-0.85, Math.min(0.85, (cx * e[0] + cz * e[2]) / dh)) : 0;
        const kind = slow ? 'whoosh' : small ? 'crack' : 'shell';
        SE.playBulletNear(kind, 1 - d / R, pan);
      }
    }
    // vẽ dấu + chỉ báo: chỉ đụng DOM khi giá trị đổi đáng kể (hoạt ảnh CSS / bóng mờ làm Chrome dịch shader giữa trận, xem warmSightOverlay ở game.js)
    drawFeedback(dt) {
      if (!this.$fb) return;
      const G = this.game, u = this.me.u, cam = G.camera;
      const M = this._mk, E = this.$mark, T = this.$markTxt;
      if (M && M.t > 0) {
        const D = MARK[M.kind];
        if (M.fresh) {
          M.fresh = false;
          E.style.display = 'block';
          for (const i of this.$markI) i.style.background = D.c;
          T.style.color = D.c; T.textContent = D.txt || ''; T.style.display = D.txt ? 'block' : 'none';
        }
        const a = M.t / D.t, pop = 1 + 0.35 * Math.max(0, a - 0.72) / 0.28;   // nở nhanh rồi về cỡ thật
        E.style.transform = 'scale(' + (D.k * pop).toFixed(3) + ')';
        const op = Math.min(1, a * 2.2).toFixed(2);
        E.style.opacity = op; T.style.opacity = op;
        M.t -= dt;
      } else if (M) { this._mk = null; E.style.display = 'none'; T.style.display = 'none'; }
      this._hurtK = Math.max(0, (this._hurtK || 0) * Math.exp(-dt / HURT.flashTau) - dt * 0.02);
      const hp = u.isDead ? 1 : u.hp / (u.maxHp || 1);
      let low = 0;
      if (hp < HURT.low) {
        const danger = (HURT.low - hp) / HURT.low;
        // Nhịp tim đập dồn dập khi nguy kịch (máu càng thấp nhịp tim đập càng nhanh)
        const heartRate = 8.0 + danger * 6.0;
        const heartBeat = Math.pow(Math.max(0, Math.sin(performance.now() * 0.001 * heartRate)), 3.0);
        low = danger * HURT.lowOp * (0.62 + 0.48 * heartBeat);
      }
      this._fbWarm = Math.max(0, (this._fbWarm || 0) - dt);
      const warm = this._fbWarm > 0 ? 0.01 : 0, vo = Math.max(this._hurtK, low, warm);
      if (Math.abs(vo - this._vigOp) > 0.008 || (vo === 0 && this._vigOp !== 0)) {
        this._vigOp = vo;
        this.$vig.style.opacity = vo.toFixed(3);
        if (low > 0.15) {
          const sc = (1.0 + 0.035 * (low / HURT.lowOp)).toFixed(3);
          this.$vig.style.transform = 'scale(' + sc + ')';
        } else if (this.$vig.style.transform) {
          this.$vig.style.transform = '';
        }
      }
      const e = cam.matrixWorld.elements, H = window.innerHeight * HURT.R, fx = -e[8], fz = -e[10], rx = e[0], rz = e[2];
      // cung đồng tâm với tâm ngắm: bán kính đổi theo cỡ cửa sổ thì vẽ lại
      if (Math.abs(H - this._arcR) > 4) { this._arcR = H; for (const A of this.$arcs) this.drawArc(A.el); }
      for (const A of this.$arcs) {
        if (A.t > 0) {
          A.t -= dt;
          const dx = A.x - cam.position.x, dz = A.z - cam.position.z, th = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
          const k = Math.min(1, (HURT.fade - A.t) / ARC.inS), Rn = H * (1 + ARC.inK * (1 - k)), op = (Math.min(1, A.t / (HURT.fade * 0.45)) * (0.3 + 0.7 * k)).toFixed(2);   // thu vào vòng lúc mới hiện
          A.el.style.transform = 'rotate(' + th.toFixed(3) + 'rad) translateY(' + (-Rn).toFixed(1) + 'px)';
          A.el.style.opacity = op;
          // số phương vị luôn đứng thẳng, nằm ngoài cung
          A.lb.style.transform = 'translate(-50%, -50%) translate(' + (Math.sin(th) * (Rn + 40)).toFixed(1) + 'px, ' + (-Math.cos(th) * (Rn + 40)).toFixed(1) + 'px)';
          A.lb.style.opacity = op;
          A.on = true;
        } else if (A.on || (A.warm && !warm)) { A.on = false; A.warm = false; A.el.style.opacity = '0'; A.lb.style.opacity = '0'; }
        else if (warm && !A.warm) { A.warm = true; A.el.style.opacity = '0.01'; }
      }
    }

    // ----- mỗi khung, trước khi cập nhật các đơn vị -----
    update(dt) {
      const G = this.game;
      this.veh.length = 0;
      for (const u of G.units) if (u.tankType !== TYPE && !u.isDead && u.group) this.veh.push(u);
      this.stepHurt();
      this.stepNearMiss(dt);
      this.drawFeedback(dt);
      for (const P of this.pairs) this.syncIn(P, dt);
      for (const P of this.mine) if (P.called && !P.s.ride && !P.s.intent.target && !P.s._orders.length) { P.called = false; this.standGuard(P); }
      this.stepAmmoRuns(dt);
      this.stepBoarders();
      this.stepRiders(dt);
      this.stepStrikes(dt);
      this.stepShoves(dt);
      if (this.me && this.ctl) {
        const usable = this.usable();
        if (!usable) this.releaseInput();
        const MR = this.me.s.ride;
        if (MR && (MR.inside || MR.k < 1 || MR.dir < 0 || MR.duck > 0.05)) { this.ctl.firing = false; this.ctl.aiming = false; }   // trong khoang / đang leo: không bắn
        if ((this._hintT = (this._hintT || 0) - dt) <= 0) { this._hintT = 0.2; this._rideMsg = this.me.s.alive ? this.rideHint(this.me.s) : ''; }
        if (this.ctl.firing && G.inNoFireZone && G.inNoFireZone()) { this.ctl.firing = false; if (G.noFireWarn) G.noFireWarn(); }
        this.ctl.update(dt);
        // UAV đang bay: lính quỳ tại chỗ, hai tay cầm máy điều khiển
        const ks = this.kamiState();
        this.me.s.figure.kamiCtl = ks === 'launching' || ks === 'flying' || ks === 'returning';
        // tay lính làm đúng lệnh người chơi đang bấm: cần lái, ngón cái, người nghiêng theo (SoldierModel.kamiPose)
        const sk = ks === 'flying' && G._sight && G._sight.arty && G._sight.keys;
        this.me.s.figure.kamiIn = sk ? { turn: (sk.KeyD ? 1 : 0) - (sk.KeyA ? 1 : 0), pitch: (sk.KeyW ? 1 : 0) - (sk.KeyS ? 1 : 0), boost: !!(sk.ShiftLeft || sk.ShiftRight) } : null;
      }
      if (this.fxCtl && !this.ctl) this.fxCtl.stepFx(dt);
      for (const P of this.pairs) if (P.recoilT > 0 && (P.recoilT -= dt) <= 0) P.s.figure.recoil = 0;
      this.world.update(dt, G.camera);
      for (const P of this.pairs) this.syncOut(P);
      for (const P of this.mine) { if (!P.s.ride) this.runOver(P); this.bleedOut(P, dt); }
    }

    // chảy máu: máy có quyền với lính trừ máu đơn vị (nguồn 'BURN' như cháy âm ỉ: không tính là trúng đạn mới,
    // chết thì game.sweepUnhandledDeaths ghi công kẻ bắn gần nhất)
    bleedOut(P, dt) {
      const { u, s } = P;
      if (u.isDead || !s.alive || !(s.bleed > 0)) return;
      u._bled = true;
      // mỗi lần trừ gửi 1 gói mạng: gộp 0,5 s một lần như nhịp cháy (spg.js), không gọi theo khung
      P.bleedAcc = (P.bleedAcc || 0) + s.bleed * dt; P.bleedT = (P.bleedT || 0) + dt;
      if (P.bleedT < 0.5) return;
      const r = u.takeDamage(P.bleedAcc / 100 * u.maxHp, null, 'BURN');
      P.bleedAcc = 0; P.bleedT = 0;
      if (r && r.killed) u._infDeath = { mode: 'fall' };
    }

    syncIn(P) {
      const { u, s } = P;
      if (u.isDead) {
        if (s.alive) {
          const inCab = s.ride && s.ride.inside && s.ride.dir > 0 && s.ride.k >= 1, info = u._infDeath || {};
          if (s.ride && !inCab) info.rideFall = this.rideFall(s);
          if (s.ride) { if (this.mine.includes(P) && this.game.netSync && this.game.netSync.sendRide) this.game.netSync.sendRide(u, null, 0); this.endRide(P); }
          P.boardV = null;
          s.kill('match', info); u._infDeath = null;
          if (inCab) { s._gone = true; s.root.visible = false; }   // chết trong khoang: không rơi xác ra ngoài
          if (P === this.me) this.releaseInput();
        }
        return;
      }
      if (!s.alive) {
        s.revive(u.x, u.z, u.bodyAngle);
        P.bleedAcc = 0; P.bleedT = 0;
        if (s.arms.def.kami) { s.arms.mag = s.arms.def.mag; s.figure.kamiLeft = s.arms.mag; s.figure.kamiCtl = false; u.kamikazeCount = KAMI_PER; }
        s.morDeploy = false;
        P.medLeft = u.infMedkit ? Equipment.MEDKIT.uses : 0;
        P.s.gearKg = P.s.gearKg0 || 0;
        if (s.restStamina) s.restStamina();
        if (SoldierEngine.RESERVE[s.weapon] !== undefined) { s.arms.res = SoldierEngine.RESERVE[s.weapon]; s.arms.mag = s.arms.def.mag; }
        if (P === this.me) { s.intent.stance = 'stand'; this.ctl.yaw = u.bodyAngle; this.ctl.pitch = 0; this.ctl.aimK = 0; }
      }
      if (u._infDeath) { s._woundFrom = u._infDeath; u._infDeath = null; }   // dùng một lần: phát sau không có vùng (nổ lan, cháy) thì không mượn vùng cũ   // điểm nổ / hướng đạn của phát vừa trúng: chọn bên bị thương (stepWound)
      s.hp = u.hp / u.maxHp * 100;
      // nằm trong cỏ: thân người khuất sau ngọn cỏ (TeamIntel); xạ thủ nằm lâu đè rạp cỏ chỗ nằm và dọn một vệt trước nòng để kính không bị cỏ che
      const pr = (s.figure._proneK || 0) > 0.9;
      u._infProne = pr;
      if ((P._grassT = (P._grassT || 0) - 1) <= 0) { P._grassT = 20; u._infGrass = this.world.grassAt ? this.world.grassAt(s.x, s.z) : 0; }
      if (pr && u._infGrass > 0.05) {
        const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading), G = P._flat;
        if (!G || Math.hypot(G.x - s.x, G.z - s.z) > 3 || Math.abs(G.h - s.heading) > 0.15) {
          P._flat = { x: s.x, z: s.z, h: s.heading };
          this.world.flattenGrass(s.x - fx * 2, s.z - fz * 2, fx, fz, 3.4, 9);       // thân người nằm
          // vệt bắn trước nòng: gạt cỏ ~12 m, xa dần mở rộng theo góc nhìn kính (cỏ gần ống kính phóng đại che kín cả trường nhìn)
          // (súng nằm lệch vai phải ~2 đv: dải đặt theo đầu nòng, không theo tâm người)
          const m = s.arms.def.muzzle ? s.muzzlePos() : { x: s.x, z: s.z };
          this.world.flattenGrass(m.x + fx * 18, m.z + fz * 18, fx, fz, 4.5, 24);
          this.world.flattenGrass(m.x + fx * 72, m.z + fz * 72, fx, fz, 7.5, 32);
        }
      } else if (!pr) P._flat = null;
      if (this.mine.includes(P)) { u._infLow = s.intent.stance === 'kneel' || (s.figure._proneK || 0) > 0.5; return; }
      // tư thế lính máy khác theo mạng (quỳ / nằm): máy này bắn trúng đúng hình người đang thấy, nổ lan tính đúng người thấp
      const ns = this.owned(u) ? null : u._netStance;
      if (ns != null) {
        const want = ns === 1 ? 'kneel' : ns === 2 ? 'prone' : 'stand';   // máy chủ quyền báo tư thế: quỳ / nằm (mọi súng) / đứng
        if (s.intent.stance !== want) s.setStance(want);
        u._infLow = ns > 0;
      }
      // lính của máy khác: đi theo vị trí mạng, xa quá (hồi sinh, mất gói) thì nhảy tới luôn
      const D = s.intent.drive, dx = u.x - s.x, dz = u.z - s.z, d = Math.hypot(dx, dz);
      if (s.ride) { D.x = D.z = 0; }
      else if (d > 160) { s.x = u.x; s.z = u.z; D.x = D.z = 0; }
      else if (d > 3) { D.x = dx / d; D.z = dz / d; D.gait = Math.abs(u.speed || 0) > 30 || d > 40 ? 'run' : 'walk'; }
      else { D.x = D.z = 0; }
      const firing = performance.now() - (u._infShotAt || -1e9) < (s.arms.def.prone ? SHOT_AIM_PRONE_S : SHOT_AIM_S) * 1000 || (ns === 2 && s.arms.def.prone);   // máy chủ quyền báo đang nằm: nằm theo
      D.face = firing ? -(u.azimuth || 0) * Math.PI / 180 : (D.x || D.z) ? null : s.heading;
      const F = s.figure, k = F.aimBlend || 0, next = k + ((firing ? 1 : 0) - k) * 0.15;
      F.aimBlend = next > 0.005 ? next : 0;
      F.aimPitch = (u.elevation || 0) * Math.PI / 180 * F.aimBlend;
    }

    // vùng trúng đạn theo hình người thật: hộp lọc của ballistics (u._shBox) ôm sát các viên thuốc của tư thế hiện tại (đứng / quỳ / nằm / ngồi xe),
    // trong hộp thì dò từng viên (u._infHit). Máy bắn tính trúng nên mọi máy đều dựng cho mọi lính (cả lính máy khác, đã theo tư thế mạng)
    hitBox(P) {
      const { u, s } = P;
      if (u.isDead || !s.alive || s._gone) return;
      u._shBox = SoldierModel.hitAABB(s.figure, u.x, u.y || 0, u.z, u.bodyAngle || 0, 0.6, P._box || (P._box = {}));
      u._shBoxGroup = u.group;
      if (!u._infHit) u._infHit = (x0, y0, z0, x1, y1, z1) => { const S = P.s; return S && S.alive && !S._gone && !u.isDead ? SoldierModel.segHit(S.figure, x0, y0, z0, x1, y1, z1) : null; };
    }
    owned(u) { const N = this.game.netSync; return !N || N.detached || !N.owns || N.owns(u); }

    syncOut(P) {
      const { u, s } = P;
      s.root.visible = !s._gone && (u.isDead || !u.group || u.group.visible);
      if (s.ride) this.placeRider(P);
      // tư thế gửi qua mạng (netcode ghép vào góc ngẩng): 0 đứng, 1 quỳ, 2 nằm
      if (!u.isDead && this.owned(u)) u._infStance = s.intent.stance === 'prone' || (s.figure._proneK || 0) > 0.5 ? 2 : s.intent.stance === 'kneel' ? 1 : 0;
      this.hitBox(P);
      if (u.isDead || !this.mine.includes(P)) return;
      u.x = s.x; u.z = s.z; u.y = s.y; u.bodyAngle = s.heading; u.speed = s.speed;
      if (P !== this.me) { u.azimuth = ((-s.heading * 180 / Math.PI) % 360 + 360) % 360; return; }
      u.azimuth = ((-this.ctl.yaw * 180 / Math.PI) % 360 + 360) % 360;
      u.elevation = this.ctl.pitch * 180 / Math.PI;
    }

    onSoldierCrushed(s, v) {
      const P = this.pairs.find(p => p.s === s);
      if (!P) return;
      const { u } = P;
      if (u && !u.isDead) {
        u._infDeath = { mode: 'crush' };
        const r = u.takeDamage(u.maxHp + 1, v, 'DIRECT_HIT');
        if (r && r.killed) this.game.onUnitDestroyed(u, v, v.name || 'xe cán');
      }
    }

    // xe đang chạy cán phải: chết ngay (không tính công cho xe: máy có quyền với lính là máy này)
    runOver(P) {
      const { u, s } = P, VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      if (u.isDead || u.invulnerableTimer > 0 || !VC || !VC.vehObb || !VC.circleGap) return;
      for (const v of this.veh) {
        if (Math.abs(v.speed || 0) < 1.5 || Math.hypot(v.x - s.x, v.z - s.z) > 50 || Math.abs((v.y || 0) - s.y) > 16) continue;
        const g = VC.circleGap(VC.vehObb(v, v.x, v.z, v.bodyAngle, this._ob || (this._ob = {})), s.x, s.z, 2, this._gap || (this._gap = {}));
        if (!g || g.gap >= 0) continue;
        u._infDeath = { mode: 'crush' };
        const r = u.takeDamage(u.maxHp + 1, v, 'DIRECT_HIT');
        if (r && r.killed) this.game.onUnitDestroyed(u, v, v.name || 'xe cán');
        return;
      }
    }

    // ----- camera: game.updateChaseCamera gọi, true = đã đặt camera -----
    placeCamera() {
      if (!this.me || !this.ctl || this.game._sight) return false;   // màn hình UAV cảm tử: camera mũi UAV
      this.ctl.placeCamera();
      for (const P of this.mine) P.u._scope = P === this.me ? this.ctl.scopeCone() : null;
      this.placeViewFocus();
      return true;
    }

    // Camera lính chiếm quyền nên game bỏ qua phần bám camera của xe: khung bóng đổ đứng yên ở cỡ lớn nhất (±900, ~225 m) vẽ
    // lại cả dãy nhà + xe đỗ cho bóng mỗi khung, tâm cỏ 3D / chọn vật đổ bóng (_viewFocus) kẹt ở chỗ cũ. Đặt lại theo tầm mắt người:
    // nhìn thường ±360 phía trước (~45 m, bóng xa hơn chìm trong cảnh, texel ~4 cm), soi kính thì khung trượt ra theo cự ly nhìn
    placeViewFocus() {
      const G = this.game, cam = G.camera;
      if (!G.placeSunShadow || !cam) return;
      const e = cam.matrixWorld.elements;
      let fx = -e[8], fz = -e[10];
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const zoom = Math.max(1, (this.fov0 || 55) / Math.max(1, cam.fov || 55));
      const S = this._vf || (this._vf = { half: 360, d: 220 });
      const half = Math.min(720, 360 * Math.sqrt(zoom)), d = Math.min(2400, 220 * zoom);
      S.half += (half - S.half) * 0.15; S.d += (d - S.d) * 0.15;
      const H = Math.ceil(S.half / 20) * 20, cx = cam.position.x + fx * S.d, cz = cam.position.z + fz * S.d;
      const y = G.terrain && G.terrain.getElevationAt ? G.terrain.getElevationAt(cx, cz) : cam.position.y;
      G.placeSunShadow(cx, y, cz, H, 1600);
      G._viewFocus = { x: cx, z: cz, gx: cam.position.x + fx * Math.min(S.d, 600), gz: cam.position.z + fz * Math.min(S.d, 600) };
    }

    // ----- HUD -----
    buildHud() {
      const box = document.getElementById('hud-overlay') || document.body;
      if (!document.getElementById('inf-css')) {
        const st = document.createElement('style'); st.id = 'inf-css'; st.textContent = CSS; document.head.appendChild(st);
      }
      const el = this.hudEl = document.createElement('div');
      el.id = 'inf-hud';
      el.innerHTML = '<div id="inf-heal"></div><div id="inf-cross"><i></i><i></i><i></i><i></i><span class="cross-dot"></span><span class="gl-notch-1"></span><span class="gl-notch-2"></span><span class="gl-notch-3"></span></div><div id="inf-msg"></div>'
        + '<div id="inf-squad"></div>'
        + '<div id="inf-dock">'
        + '  <div id="inf-chips">'
        + '    <span id="inf-chip-posture" class="inf-chip"><kbd>C</kbd><b id="inf-posture-val">ĐỨNG</b></span>'
        + '    <span id="inf-chip-shoulder" class="inf-chip"><kbd>Q</kbd><b id="inf-shoulder-val">VAI PHẢI</b></span>'
        + '    <span id="inf-chip-freelook" class="inf-chip" style="display:none"><kbd>Alt</kbd><b>NHÌN TỰ DO</b></span>'
        + '    <span id="inf-chip-breath" class="inf-chip" style="display:none"><kbd>Shift</kbd><b id="inf-breath-val">NÍN THỞ</b></span>'
        + '  </div>'
        + '  <div id="inf-bar">'
        + '    <div class="inf-section-soldier">'
        + '      <div class="inf-soldier-top">'
        + '        <span id="inf-soldier-title">CHIẾN BINH #1</span>'
        + '        <span id="inf-motion-val">ĐỨNG YÊN</span>'
        + '      </div>'
        + '      <div class="inf-hp-row" id="inf-hp-row">'
        + '        <svg class="inf-hp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/></svg>'
        + '        <div class="inf-hp-track"><div id="inf-hp-fill" class="inf-hp-fill"></div></div>'
        + '        <span id="inf-hp-num">100 / 100</span>'
        + '      </div>'
        + '      <div class="inf-stam-bar"><div id="inf-stam-fill"></div></div>'
        + '    </div>'
        + '    <div class="inf-section-weapon">'
        + '      <span id="inf-weapon-name">VŨ KHÍ</span>'
        + '      <div class="inf-ammo-row">'
        + '        <span id="inf-ammo-count">0 / 0</span>'
        + '        <span id="inf-ammo-extra"></span>'
        + '      </div>'
        + '    </div>'
        + '    <div class="inf-section-action" id="inf-section-action">'
        + '      <span class="inf-action-lbl" id="inf-action-lbl">ĐANG NẠP ĐẠN...</span>'
        + '      <div class="inf-action-track"><div class="inf-action-fill" id="inf-action-fill"></div></div>'
        + '    </div>'
        + '  </div>'
        + '</div>'
        + '<div id="inf-keys">W A S D chạy nhẹ · Shift bứt tốc · Ctrl / Chuột phải ngắm · Q đổi vai · Alt nhìn tự do · Chuột trái bắn · R nạp · C quỳ · X nằm · E băng bó · 1 2 3 4 đổi lính</div>';
      box.appendChild(el);
      this.$keys = el.querySelector('#inf-keys'); this.$cross = el.querySelector('#inf-cross'); this.$msg = el.querySelector('#inf-msg'); this.$heal = el.querySelector('#inf-heal');
      this.$squad = el.querySelector('#inf-squad');
      this.$postureVal = el.querySelector('#inf-posture-val');
      this.$shoulderVal = el.querySelector('#inf-shoulder-val');
      this.$chipFreelook = el.querySelector('#inf-chip-freelook');
      this.$chipBreath = el.querySelector('#inf-chip-breath');
      this.$breathVal = el.querySelector('#inf-breath-val');
      this.$soldierTitle = el.querySelector('#inf-soldier-title');
      this.$motionVal = el.querySelector('#inf-motion-val');
      this.$hpRow = el.querySelector('#inf-hp-row');
      this.$hpFill = el.querySelector('#inf-hp-fill');
      this.$hpNum = el.querySelector('#inf-hp-num');
      this.$stamFill = el.querySelector('#inf-stam-fill');
      this.$weaponName = el.querySelector('#inf-weapon-name');
      this.$ammoCount = el.querySelector('#inf-ammo-count');
      this.$ammoExtra = el.querySelector('#inf-ammo-extra');
      this.$sectionAction = el.querySelector('#inf-section-action');
      this.$actionLbl = el.querySelector('#inf-action-lbl');
      this.$actionFill = el.querySelector('#inf-action-fill');
      this.buildFeedback();
    }
    // lớp phản hồi nằm ngoài #hud-overlay (bị ẩn khi soi kính) và trên lớp kính (z-index 950). Viền đỏ, cung hướng vẽ một lần ra canvas phần mềm
    buildFeedback() {
      const fb = this.$fb = document.createElement('div');
      fb.id = 'inf-fb';
      const mk = (w, h, cls, draw) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.className = cls;
        draw(c.getContext('2d', { willReadFrequently: true }), w, h);
        fb.appendChild(c);
        return c;
      };
      this.$vig = mk(160, 90, 'vig', (x, w, h) => {
        x.translate(w / 2, h / 2); x.scale(w / 2, h / 2);
        const g = x.createRadialGradient(0, 0, 0.68, 0, 0, 1.25);
        g.addColorStop(0, 'rgba(150,10,4,0)'); g.addColorStop(0.45, 'rgba(150,10,4,.7)'); g.addColorStop(1, 'rgba(90,2,0,.97)');
        x.fillStyle = g; x.fillRect(-1, -1, 2, 2);
      });
      this._vigOp = 0; this._fbWarm = 1.5;
      this.$arcs = [];
      this._arcR = window.innerHeight * HURT.R;
      for (let i = 0; i < HURT.n; i++) {
        const el = document.createElement('canvas'); el.className = 'arc';
        this.drawArc(el);
        fb.appendChild(el);
        const lb = document.createElement('div'); lb.className = 'brg';
        fb.appendChild(lb);
        this.$arcs.push({ el, lb, t: 0, x: 0, z: 0, ang: 0, on: false, warm: false });
      }
      const m = this.$mark = document.createElement('div'); m.id = 'inf-mark'; m.innerHTML = '<i></i><i></i><i></i><i></i>';
      const t = this.$markTxt = document.createElement('div'); t.id = 'inf-marktxt';
      fb.appendChild(m); fb.appendChild(t);
      this.$markI = Array.from(m.children);
      document.body.appendChild(fb);
    }
    // cung chỉ hướng kiểu thước ngắm: nét mảnh hở giữa, vạch khắc, ngoặc hai đầu, chevron kép chỉ ra ngoài. Mọi nét có viền tối mảnh để đọc được trên trời sáng
    drawArc(c) {
      const R = this._arcR, W = ARC.w, H = ARC.h, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px'; c.style.margin = (-H / 2) + 'px 0 0 ' + (-W / 2) + 'px';
      const x = c.getContext('2d', { willReadFrequently: true }), cx = W / 2, cy = H / 2 + R, sp = ARC.half / R, gap = ARC.gap / R, up = -Math.PI / 2;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.lineCap = 'butt'; x.lineJoin = 'miter';
      const rad = (a, r0, r1) => { const s = Math.sin(a), k = Math.cos(a); x.moveTo(cx + s * r0, cy - k * r0); x.lineTo(cx + s * r1, cy - k * r1); };
      const chev = (r, s) => { x.moveTo(cx - s, cy - r); x.lineTo(cx, cy - r - s * 0.72); x.lineTo(cx + s, cy - r); };
      // hai lượt: viền tối rồi nét màu
      const pass = (color, grow, alpha) => {
        x.strokeStyle = color; x.globalAlpha = alpha;
        x.lineWidth = 2 + grow; x.beginPath(); x.arc(cx, cy, R, up - sp, up - gap); x.moveTo(cx + Math.sin(gap) * R, cy - Math.cos(gap) * R); x.arc(cx, cy, R, up + gap, up + sp); x.stroke();
        x.lineWidth = 2 + grow; x.beginPath(); rad(-sp, R - 9, R + 1); rad(sp, R - 9, R + 1); x.stroke();                 // ngoặc hai đầu
        x.lineWidth = 1 + grow; x.beginPath();
        const n = Math.floor(ARC.half / ARC.tick);
        for (let i = -n; i <= n; i++) { const a = i * ARC.tick / R; if (Math.abs(a) > gap && Math.abs(a) < sp - 0.5 * ARC.tick / R) rad(a, R + 1, R + (i % 2 ? 4 : 7)); }   // vạch khắc
        x.stroke();
        x.lineWidth = 2.4 + grow; x.beginPath(); chev(R + 3, 9); x.stroke();
        x.globalAlpha = alpha * 0.55; x.beginPath(); chev(R + 11, 9); x.stroke();
      };
      pass('#000', 1.6, 0.5);
      pass('#ff6a48', 0, 1);
      x.globalAlpha = 1;
    }
    drawHud(h) {
      if (!this.hudEl) return;
      const rs = h.kami ? ' / ' + KAMI_PER + (h.kami.launching ? ' · đang phóng…' : h.kami.flying ? ' · đang lái UAV' : h.kami.left > 0 ? ' · chuột trái: phóng' : ' · hết UAV') : h.reserve != null ? ' / ' + h.reserve : '';
      const rg = h.range != null ? ' · ' + Math.round(h.range) + ' m' + (h.rangeOk ? (h.weapon === 'gl' && h.range < 14 ? ' (chưa đủ cự ly)' : '') : ' (quá tầm)') : '';
      const drumStr = (h.drum != null && h.aim > 0.5 ? ' · nấc ' + h.drum + 'm' : '') + (h.scope ? ' · ' + String(h.scope.x).replace('.', ',') + '×' : '');

      // Cập nhật Khung Vũ khí & Đạn dược
      if (this.$weaponName) this.$weaponName.textContent = WEAPON_NAME[h.weapon] || h.weapon;
      if (this.$ammoCount) this.$ammoCount.textContent = h.mag + rs;
      if (this.$ammoExtra) this.$ammoExtra.textContent = rg + drumStr;

      // Cập nhật Thanh Tiến trình Hành động (Action Bar)
      const isMed = this.me && this.me.s && this.me.s._medUse;
      if (isMed) {
        if (this.$sectionAction) this.$sectionAction.style.display = 'flex';
        const pct = Math.min(100, Math.round((this.me.s.figure.aidT || 0) / SoldierModel.AID_SEQ.wrap * 100));
        if (this.$actionLbl) this.$actionLbl.textContent = 'ĐANG BĂNG BÓ ' + pct + '%';
        if (this.$actionFill) this.$actionFill.style.width = pct + '%';
      } else if (h.reloading) {
        if (this.$sectionAction) this.$sectionAction.style.display = 'flex';
        const pct = Math.min(100, Math.round((h.reloadProgress || 0) * 100));
        if (this.$actionLbl) this.$actionLbl.textContent = 'ĐANG NẠP ĐẠN ' + pct + '%';
        if (this.$actionFill) this.$actionFill.style.width = pct + '%';
      } else {
        if (this.$sectionAction) this.$sectionAction.style.display = 'none';
      }

      // Cập nhật Hàng Chip trạng thái phụ
      if (this.$shoulderVal) this.$shoulderVal.textContent = h.shoulder === -1 ? 'VAI TRÁI' : 'VAI PHẢI';
      if (this.$chipFreelook) this.$chipFreelook.style.display = h.freeLook ? '' : 'none';
      if (this.$chipBreath) this.$chipBreath.style.display = (h.holding || h.winded) ? '' : 'none';
      if (h.holding || h.winded) {
        if (this.$breathVal) this.$breathVal.textContent = h.holding ? 'NÍN THỞ' : 'HỤT HƠI';
        if (this.$chipBreath) this.$chipBreath.classList.toggle('active', !!h.holding);
      }

      // Cập nhật Ngăn Lính & Máu & Thể lực
      const myIdx = this.mine.indexOf(this.me);
      if (this.$soldierTitle) this.$soldierTitle.textContent = 'CHIẾN BINH #' + (myIdx >= 0 ? myIdx + 1 : 1);
      if (this.$motionVal) {
        const mot = h.stance === 'prone' ? 'NẰM' : h.stance === 'kneel' ? 'QUỲ' : h.motion === 'run' ? 'CHẠY' : h.motion === 'walk' ? 'ĐI BỘ' : 'ĐỨNG YÊN';
        this.$motionVal.textContent = mot;
      }
      if (this.$postureVal) this.$postureVal.textContent = h.stance === 'prone' ? 'NẰM' : h.stance === 'kneel' ? 'QUỲ' : 'ĐỨNG';

      const hpVal = Math.max(0, Math.round(h.hp || 0));
      if (this.$hpFill) this.$hpFill.style.width = Math.min(100, hpVal) + '%';
      if (this.$hpRow) {
        this.$hpRow.classList.toggle('med', hpVal <= 50 && hpVal > 25);
        this.$hpRow.classList.toggle('low', hpVal <= 25);
      }
      if (this.$hpNum) this.$hpNum.textContent = hpVal + ' / 100';

      const stamPct = Math.max(0, Math.min(100, Math.round((h.stam != null ? h.stam : 1) * 100)));
      if (this.$stamFill) this.$stamFill.style.width = stamPct + '%';

      // Cập nhật Bảng Tiểu đội 4 lính
      if (this.mine && this.mine.length > 0) {
        let sqHtml = '';
        for (let i = 0; i < this.mine.length; i++) {
          const P = this.mine[i];
          const isAct = P === this.me;
          const isDead = P.u.isDead;
          const hp = isDead ? 0 : Math.max(0, Math.round((P.u.hp / (P.u.maxHp || 1)) * 100));
          const wShort = WEAPON_NAME[P.s.weapon] || P.s.weapon;
          const ammoStr = isDead ? 'HY SINH' : P.s.arms.mag + (P.s.reserve != null ? '/' + P.s.reserve : '');
          sqHtml += `<div class="inf-sq-slot ${isAct ? 'active' : ''} ${isDead ? 'dead' : ''}">`
            + `<span class="inf-sq-num">${i + 1}</span>`
            + `<div class="inf-sq-info"><div class="inf-sq-name">${wShort}</div><div class="inf-sq-hp"><div class="inf-sq-hp-fill" style="width:${hp}%;background:${hp>50?'var(--tc-ok, #8fc46f)':hp>25?'var(--tc-accent, #e7a63a)':'var(--tc-danger, #d9534a)'}"></div></div></div>`
            + `<span class="inf-sq-ammo">${ammoStr}</span>`
            + `</div>`;
        }
        if (this.$squad && this.$squad.innerHTML !== sqHtml) this.$squad.innerHTML = sqHtml;
      }

      // Dấu tâm ngắm chuẩn game bắn súng góc nhìn thứ 3
      if (this.$keys) this.$keys.style.display = h.sight ? 'none' : '';
      if (this.$cross) {
        this.$cross.classList.toggle('gl', h.weapon === 'gl');
        this.$cross.classList.toggle('aim', h.aim > 0.4);
        this.$cross.classList.toggle('hit', !!h.hit);
        const gap = Math.round((h.aim > 0.4 ? 2 : 5) + (1 - h.aim) * 4 + h.spread * 220);
        this.$cross.style.setProperty('--g', gap + 'px');
        this.$cross.classList.toggle('lock', !!h.lock);
        this.$cross.style.display = h.alive && !h.sight && !h.kami ? '' : 'none';
      }
      const msg = h.alive && !this.locked && !this.noLock && this.usable() ? 'Bấm vào màn hình để điều khiển' : this._rideMsg || '';
      if (this.$msg) { this.$msg.textContent = msg; this.$msg.style.display = msg ? '' : 'none'; }
    }

    dispose() {
      if (this._off) for (const f of this._off) f();
      this._off = null;
      for (const P of this.pairs) if (P.s.ride) this.endRide(P);
      if (this.game.ballistics) this.game.ballistics.onShellFired = null;
      if (this.hudEl) this.hudEl.remove();
      this.hudEl = null;
      if (this.$fb) this.$fb.remove();
      this.$fb = null;
      document.body.classList.remove('inf-mode');
      if (this.ctl) this.ctl.exit();
      for (const s of this.world.soldiers.slice()) s.dispose();
      this.world.soldiers.length = 0;
      const cam = this.game.camera;
      if (cam.fov !== this.fov0) { cam.fov = this.fov0; cam.updateProjectionMatrix(); }
      if (document.pointerLockElement === this.game.renderer.domElement && document.exitPointerLock) document.exitPointerLock();
    }
  }

  // Gọi lúc vào trận: chỉ dựng khi trận có lính, trận toàn xe không tốn gì
  function attach(game) {
    if (!game.units || !game.units.some(u => u.tankType === TYPE) || typeof SoldierEngine === 'undefined' || typeof SoldierPlayer === 'undefined') return null;
    return new Match(game);
  }

  return { TYPE, attach, prebake, directDamage, splashDamage, deathMode };
})();

if (typeof window !== 'undefined') window.InfantryMatch = InfantryMatch;
