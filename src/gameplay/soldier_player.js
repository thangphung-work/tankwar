/**
 * ĐIỀU KHIỂN CHIẾN BINH (góc nhìn thứ ba): WASD đi, Shift chạy, chuột nhìn, giữ chuột phải ngắm, chuột trái bắn, R nạp đạn, C quỳ.
 * Chỉ đưa ý định vào Soldier (intent.drive) nên di chuyển, va chạm, bám đất dùng chung SoldierEngine với lính AI.
 * Đơn vị: 8 đv = 1 m. Hướng: heading = góc quay quanh Y, mặt trước = (-sin h, 0, -cos h).
 */
const SoldierPlayer = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CAM = {
    free: { dist: 26, right: 5, up: 14.6, fov: 50 },
    aim: { dist: 11, right: 3.6, up: 13.4, fov: 30 },
    prone: { dist: 11, right: 2.4, up: 6.2, fov: 30 }     // đang nằm xuống, chưa áp mắt vào kính: camera thấp
  };
  // KÍNH TỪNG SÚNG. eye: mắt trong hệ súng, nằm trên trục quang. Kính quang: fovs = trường nhìn thật của kính, x = độ phóng đại.
  // Chấm đỏ 1x: fov gần mắt thường. drum: thước ngắm phóng lựu [gần, xa, nấc] (m): con lăn đặt cự ly, nòng ngóc theo, đường ngắm vẫn ở mục tiêu.
  const SIGHTS = {
    rifle: { reflex: true, eye: V(0, 0.78, 1.97), fov: 44 },   // mắt cách thân kính ~30 cm khi áp má vào báng
    gl: { reflex: true, eye: V(0, 0.8, 2.1), fov: 44, drum: [50, 400, 25] },
    rpg: { eye: V(-0.8, 1.42, 0.405), fovs: [13], x: [2.7], lead: 5, holds: [200, 300], stadia: [100, 150, 200, 300] },   // kiểu PGO-7: 2,7x, trường nhìn 13 độ
    atr: { lens: [0, 1.3, 1.105, 0.14], eye: V(0, 1.3, 1.4), fovs: [13, 6.25, 4.2], x: [4, 8, 12], lead: 1, holds: [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000], stadia: [400, 800, 1200, 2000] }
  };
  // CHẾ ĐỘ HỖ TRỢ (kiểu game bắn súng phổ thông, người dùng chọn 2026-11-03): súng tự tính góc tới điểm ngắm, kính chỉ có chữ thập + số cự ly,
  // rung tay nhẹ, trỏ tâm vào xe / lính địch là tự khoá và đạn tự đón đầu. false: trở về kiểu mô phỏng (tự canh vạch, tự vặn thước ngắm)
  const ASSIST = true;
  // khoá mục tiêu: bán kính bắt (đv) theo loại, góc tối thiểu để bắt, nhân góc khi giữ khoá, giây ra khỏi vùng thì nhả
  const LOCK = { rVeh: 16, rInf: 5, minAng: 0.012, keepMul: 2.5, keepAdd: 0.02, loseS: 0.6, scanS: 0.15 };
  const SCOPE_SIGHT = [4000, 10000, 16000];   // tầm nhìn qua từng nấc kính (đv), khớp server_auth.js SCOPE_SIGHT
  const ZERO = 1600;             // cự ly chỉnh kính mặc định (đv) khi đạn không khai báo zero
  const STADIA_H = 2.4;          // vạch ước cự ly: chiều cao xe tăng (m) lọt vừa khung ở cự ly ghi cạnh vạch
  const GL_RELOAD_CAM = { az: 2.3, dist: 12, up: 3.4 };   // lúc nạp súng ổ quay: góc so với hướng lính (pi = sau lưng), cách súng, cao hơn súng
  const PITCH = [-0.7, 0.7];     // giới hạn ngẩng / cúi (rad)
  const MUZZLE = { rifle: V(0, 0.22, -4.55), gl: V(0, 0.22, -3.5) };
  // ----- ảnh và lưới dùng chung cho hiệu ứng súng -----
  let FXR = null;
  function fxRes() {
    if (FXR) return FXR;
    const tex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t; };
    const soft = tex(x => { const g = x.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
    const smoke = tex(x => {
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * 6.28, d = 26 * Math.sqrt(Math.random()), px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d, r = 24 + Math.random() * 20;
        const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      }
      x.globalCompositeOperation = 'destination-in';
      const e = x.createRadialGradient(64, 64, 6, 64, 64, 63); e.addColorStop(0, 'rgba(255,255,255,1)'); e.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = e; x.fillRect(0, 0, 128, 128);
    });
    // lửa đầu nòng nhìn nghiêng: lõi gần miệng nòng, thon nhọn dần ra trước (u: ngang, v: dọc nòng)
    const plume = tex(x => {
      const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(255,245,210,1)'); g.addColorStop(0.3, 'rgba(255,190,90,.95)'); g.addColorStop(0.7, 'rgba(255,120,30,.5)'); g.addColorStop(1, 'rgba(255,90,10,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(50, 128); x.quadraticCurveTo(14, 70, 58, 0); x.lineTo(70, 0); x.quadraticCurveTo(114, 70, 78, 128); x.closePath(); x.fill();
    });
    // lửa nhìn thẳng: sao nhiều cánh lệch nhau
    const star = tex(x => {
      x.translate(64, 64); const g = x.createRadialGradient(0, 0, 2, 0, 0, 60); g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.35, 'rgba(255,190,90,.9)'); g.addColorStop(1, 'rgba(255,110,20,0)'); x.fillStyle = g;
      for (let i = 0; i < 5; i++) { x.rotate(Math.PI * 2 / 5); x.beginPath(); x.moveTo(-11, 0); x.lineTo(0, -60); x.lineTo(11, 0); x.lineTo(0, 12); x.closePath(); x.fill(); }
    });
    const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, 0.5, 0);    // gốc tại miệng nòng, kéo dài theo +y
    const brass = new THREE.MeshBasicMaterial({ color: 0xb08a3c }), caseGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6);
    return (FXR = { soft, smoke, plume, star, plane, brass, caseGeo });
  }
  const _fq = new THREE.Quaternion(), _fup = new THREE.Vector3(0, 1, 0), _pv2 = new THREE.Vector2(), _pv3 = new THREE.Vector3();
  // trúng người: bán kính (đv) và sát thương theo vùng
  const ZONES = SoldierEngine.ZONES;

  // góc nòng: theo đường ngắm + góc chỉnh kính cố định (zero, đv), không bù theo cự ly mục tiêu
  const zeroAngle = (B, zero = B.zero || ZERO) => B.k ? SoldierEngine.lob({ x: 0, y: 0, z: 0 }, { x: zero, y: 0, z: 0 }, B).elev : 0.5 * Math.asin(Math.min(1, B.g * zero / (B.v * B.v)));
  const boreElev = (from, to, B, zero) => Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z)) + zeroAngle(B, zero);
  // đạn thấp hơn tâm ngắm bao nhiêu rad ở cự ly d (đv): vị trí vạch trên kính
  const holdAt = (d, B) => B.k ? -SoldierEngine.dragY(B, zeroAngle(B), d) / d : B.g * d / (2 * B.v * B.v) - zeroAngle(B);

  // Lớp kính đè lên khung hình: vùng tối quanh ống + vạch khắc. Vẽ một lần ra canvas phần mềm (không qua shader giao diện của Chrome, xem warmSightOverlay ở game.js)
  // Nằm trên mọi lớp HUD: nhìn qua kính quang thì ngoài lòng kính chỉ là vách ống tối, số đạn ghi nhỏ trong vùng tối.
  const MASK_PAD = 130;
  class SightOverlay {
    constructor(parent) {
      const el = this.el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;display:none;z-index:950';
      const mk = css => { const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;' + css; el.appendChild(c); return c; };
      // ngoài thị kính không đen kịt: mắt vẫn thấy cảnh quanh nhưng nhoè, tối (kính chặn bớt sáng); lớp làm nhoè nằm dưới vành ống
      this.blur = document.createElement('div');
      this.blur.style.cssText = `position:absolute;left:${-MASK_PAD}px;top:${-MASK_PAD}px;backdrop-filter:blur(9px) brightness(.62) saturate(.75);-webkit-backdrop-filter:blur(9px) brightness(.62) saturate(.75)`;
      el.appendChild(this.blur);
      this.mask = mk(`left:${-MASK_PAD}px;top:${-MASK_PAD}px`); this.ret = mk('left:0;top:0');
      this.info = document.createElement('div');
      this.info.style.cssText = 'position:absolute;right:4%;bottom:5%;font:600 13px/1.5 system-ui,sans-serif;letter-spacing:.04em;color:rgba(205,212,198,.72);text-align:right;white-space:pre';
      this.hit = document.createElement('div');
      this.hit.style.cssText = 'position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;display:none;background:linear-gradient(45deg,transparent 46%,#ff5a4a 46%,#ff5a4a 54%,transparent 54%),linear-gradient(-45deg,transparent 46%,#ff5a4a 46%,#ff5a4a 54%,transparent 54%);-webkit-mask:radial-gradient(circle,transparent 5px,#000 5.5px);mask:radial-gradient(circle,transparent 5px,#000 5.5px)';
      el.appendChild(this.info); el.appendChild(this.hit);
      (parent || document.body).appendChild(el);
      // lòng kính trong suốt: HUD nằm dưới vẫn lộ qua, nên ẩn hẳn khi đang nhìn qua kính quang
      if (!document.getElementById('sight-scoped-css')) { const c = document.createElement('style'); c.id = 'sight-scoped-css'; c.textContent = 'body.sight-scoped #hud-overlay, body.sight-scoped #playHud { visibility: hidden !important; }'; document.head.appendChild(c); }
      this._key = ''; this._on = false; this._tf = ''; this._op = -1; this._info = null; this._hit = false;
    }
    update(st) {
      if (!st) { if (this._on) { this._on = false; this.el.style.display = 'none'; this.scoped(false); } return; }
      if (!this._on) { this._on = true; this.el.style.display = ''; }
      this.scoped(!SIGHTS[st.weapon].reflex && st.op > 0.5);
      const W = this.el.clientWidth || window.innerWidth, H = this.el.clientHeight || window.innerHeight, key = [st.weapon, st.fov, W, H, window.devicePixelRatio].join();
      if (key !== this._key) { this._key = key; this.draw(st, W, H); }
      if (st.op !== this._op) { this._op = st.op; this.el.style.opacity = st.op.toFixed(2); }
      const tf = `translate(${st.ox.toFixed(1)}px,${st.oy.toFixed(1)}px)`;
      if (tf !== this._tf) { this._tf = tf; this.mask.style.transform = tf; this.blur.style.transform = tf; }
      const info = SIGHTS[st.weapon].reflex ? '' : st.info || '';
      if (info !== this._info) { this._info = info; this.info.textContent = info; }
      if (!!st.hit !== this._hit) { this._hit = !!st.hit; this.hit.style.display = this._hit ? '' : 'none'; }
    }
    draw(st, W, H) {
      const S = SIGHTS[st.weapon], pxOf = rad => Math.tan(rad) / Math.tan(st.fov * Math.PI / 360) * H / 2, cx = W / 2, cy = H / 2, R = H * 0.49;
      // vẽ theo điểm ảnh thật của màn hình kẻo nét mảnh nhoè
      const dpr = Math.min(2, window.devicePixelRatio || 1), m = this.mask, r = this.ret, MW = W + MASK_PAD * 2, MH = H + MASK_PAD * 2;
      m.width = Math.round(MW * dpr); m.height = Math.round(MH * dpr); m.style.width = MW + 'px'; m.style.height = MH + 'px';
      r.width = Math.round(W * dpr); r.height = Math.round(H * dpr); r.style.width = W + 'px'; r.style.height = H + 'px';
      const a = m.getContext('2d'), x = r.getContext('2d');
      a.setTransform(dpr, 0, 0, dpr, 0, 0); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      a.clearRect(0, 0, MW, MH); x.clearRect(0, 0, W, H);
      this.blur.style.display = 'none';
      if (S.reflex) {
        // chấm đỏ 2 MOA chiếu vô cực nên luôn nằm trên đường ngắm: lõi sáng + quầng mờ, không vòng ngoài
        const rr = Math.max(1.6, pxOf(0.00058)), gl = x.createRadialGradient(cx, cy, 0, cx, cy, rr * 4);
        gl.addColorStop(0, 'rgba(255,70,50,.55)'); gl.addColorStop(1, 'rgba(255,40,30,0)');
        x.fillStyle = gl; x.beginPath(); x.arc(cx, cy, rr * 4, 0, 6.3); x.fill();
        x.fillStyle = '#ff5038'; x.beginPath(); x.arc(cx, cy, rr, 0, 6.3); x.fill();
        x.fillStyle = 'rgba(255,225,205,.9)'; x.beginPath(); x.arc(cx, cy, rr * 0.45, 0, 6.3); x.fill();
        return;
      }
      // vách ống: tối hẳn ngoài lòng kính, mép mờ; trong lòng tối dần về mép (thị kính), viền tán sắc rất mảnh
      const mx = cx + MASK_PAD, my = cy + MASK_PAD;
      // vành thị kính tối đặc quanh lòng kính, ra ngoài nhạt dần thành cảnh nhoè xung quanh
      const rim = a.createRadialGradient(mx, my, R, mx, my, R * 1.32);
      rim.addColorStop(0, 'rgba(4,5,4,1)'); rim.addColorStop(0.05, 'rgba(6,7,6,.75)'); rim.addColorStop(0.16, 'rgba(8,9,8,0)'); rim.addColorStop(1, 'rgba(8,9,8,0)');
      a.fillStyle = rim; a.fillRect(0, 0, MW, MH);
      const bm = `radial-gradient(circle at ${mx}px ${my}px, transparent ${(R * 0.97).toFixed(0)}px, #000 ${(R * 1.04).toFixed(0)}px)`;
      Object.assign(this.blur.style, { width: MW + 'px', height: MH + 'px', maskImage: bm, webkitMaskImage: bm, display: 'none' });
      a.globalCompositeOperation = 'destination-out';
      const g = a.createRadialGradient(mx, my, R * 0.94, mx, my, R);
      g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      a.fillStyle = g; a.beginPath(); a.arc(mx, my, R, 0, 6.3); a.fill();
      a.globalCompositeOperation = 'source-over';
      const vg = a.createRadialGradient(mx, my, R * 0.5, mx, my, R * 0.97);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
      a.fillStyle = vg; a.beginPath(); a.arc(mx, my, R, 0, 6.3); a.fill();
      a.lineWidth = 2; a.strokeStyle = 'rgba(255,150,70,.12)'; a.beginPath(); a.arc(mx, my, R * 0.955, 0, 6.3); a.stroke();
      a.strokeStyle = 'rgba(90,150,255,.08)'; a.beginPath(); a.arc(mx, my, R * 0.94, 0, 6.3); a.stroke();
      // vạch khắc: nét đen mảnh; viền sáng rất mờ chỉ để còn đọc được trên nền tối
      const ink = '#0b0c0a', halo = 'rgba(220,226,210,.16)';
      const stroke = (draw, w = 1) => { x.lineCap = 'butt'; x.lineJoin = 'miter'; x.lineWidth = w + 1.5; x.strokeStyle = halo; x.beginPath(); draw(); x.stroke(); x.lineWidth = w; x.strokeStyle = ink; x.beginPath(); draw(); x.stroke(); };
      const line = (x0, y0, x1, y1, w = 1) => stroke(() => { x.moveTo(x0, y0); x.lineTo(x1, y1); }, w);
      const text = (s, tx, ty, align = 'center', size = 10) => { x.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`; x.textAlign = align; x.textBaseline = 'middle'; x.lineWidth = 2.2; x.strokeStyle = halo; x.strokeText(s, tx, ty); x.fillStyle = ink; x.fillText(s, tx, ty); };
      if (ASSIST) {
        // chữ thập gọn kiểu game bắn súng: thanh dày ở rìa, nét mảnh vào gần tâm, chừa khe giữa + chấm đỏ
        const post = R * 0.55, gap = 10;
        line(cx - R, cy, cx - post, cy, 3.5); line(cx + post, cy, cx + R, cy, 3.5); line(cx, cy + post, cx, cy + R, 3.5); line(cx, cy - R, cx, cy - post, 3.5);
        line(cx - post, cy, cx - gap, cy, 1.1); line(cx + gap, cy, cx + post, cy, 1.1); line(cx, cy - post, cx, cy - gap, 1.1); line(cx, cy + gap, cx, cy + post, 1.1);
        x.fillStyle = '#ff4a30'; x.beginPath(); x.arc(cx, cy, 2, 0, 6.3); x.fill();
        return;
      }
      const B = st.weapon === 'rpg' ? SoldierEngine.RPG_B : SoldierEngine.ATR_B;
      // thước ước cự ly kiểu PSO / PGO: đường cong trên vạch đáy, mục tiêu cao STADIA_H lọt giữa đáy và đường cong ở cự ly ghi dưới
      const rangefinder = (list) => {
        const base = cy + R * 0.5, x0 = cx - R * 0.66, w = R * 0.42, pts = list.map((d, i) => [x0 + w * i / (list.length - 1), base - pxOf(STADIA_H / d)]);
        stroke(() => { x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; x.quadraticCurveTo(p[0], q[1] + (p[1] - q[1]) * 0.35, q[0], q[1]); } });
        line(x0, base, x0 + w, base);
        list.forEach((d, i) => { line(pts[i][0], base, pts[i][0], base + 4); if (i % 2 === 0 || list.length < 6) text(String(d / 100).replace('.', ','), pts[i][0], base + 12); });
      };
      if (st.weapon === 'rpg') {
        // PGO-7: không có chữ thập, chỉ cột mũi tên ngắm (đỉnh là điểm ngắm) theo cự ly + thang đón ngang
        const chev = (y, s) => stroke(() => { x.moveTo(cx - s, y + s * 0.9); x.lineTo(cx, y); x.lineTo(cx + s, y + s * 0.9); }, 1.3);
        chev(cy, 9);
        for (const dm of S.holds) { const y = cy + pxOf(holdAt(dm * 8, B)); chev(y, 6); text(String(dm / 100), cx - 16, y + 3, 'right'); }
        line(cx, cy + pxOf(holdAt(S.holds[S.holds.length - 1] * 8, B)) + 10, cx, cy + R * 0.42);
        const sp = pxOf(S.lead / 1000);
        for (let i = 1; sp * i < R * 0.62; i++) {
          const dx = sp * i, big = i % 2 === 0;
          for (const sg of [-1, 1]) { line(cx + sg * dx, cy + 2, cx + sg * dx, cy + (big ? 10 : 6)); if (big) text(String(i * S.lead / 10), cx + sg * dx, cy + 20); }
        }
        line(cx - sp * 0.6, cy + 2, cx - R * 0.62, cy + 2); line(cx + sp * 0.6, cy + 2, cx + R * 0.62, cy + 2);
        rangefinder([100, 150, 200, 250, 300, 400]);
      } else {
        // kính bắn tỉa: chữ thập hai lớp (thanh dày ngoài, nét mảnh trong), vạch mil, vạch cự ly dưới tâm
        const post = R * 0.5, mil = pxOf(0.001), every = mil >= 7 ? 1 : mil >= 3.5 ? 2 : 5;
        line(cx - R, cy, cx - post, cy, 4); line(cx + post, cy, cx + R, cy, 4); line(cx, cy + post, cx, cy + R, 4); line(cx, cy - R, cx, cy - post, 4);
        line(cx - post, cy, cx + post, cy, 0.9); line(cx, cy - post, cx, cy + post, 0.9);
        for (let i = every; mil * i < post - 4; i += every) {
          const d = mil * i, big = i % 5 === 0, hh = big ? 5 : 3;
          for (const sg of [-1, 1]) { line(cx + sg * d, cy - hh, cx + sg * d, cy + hh); line(cx - hh, cy - sg * d, cx + hh, cy - sg * d); }
          if (big && i % 10 === 0 && mil * 5 >= 18) { text(String(i), cx + d, cy - 13); text(String(i), cx - d, cy - 13); }
        }
        // cự ly giữ tâm: gạch ngắn lệch phải trục dọc, ghi số trăm mét khi còn chỗ
        let lastY = -Infinity;
        for (const dm of S.holds) {
          const y = cy + pxOf(holdAt(dm * 8, B));
          line(cx + 2, y, cx + 11, y, 1.2);
          if (y - lastY >= 12) { text(String(dm / 100), cx + 18, y, 'left', 9); lastY = y; }
        }
        rangefinder([200, 300, 400, 500, 600, 800]);
      }
      // tâm chiếu sáng
      x.fillStyle = '#ff4a30'; x.beginPath(); x.arc(cx, cy, 1.3, 0, 6.3); x.fill();
    }
    scoped(on) { if (on !== this._scoped) { this._scoped = on; document.body.classList.toggle('sight-scoped', on); } }
    dispose() { this.scoped(false); this.el.remove(); }
  }

  // Thân kính chấm đỏ thấy được khi áp má: khối 3D thật đặt theo mắt, gốc ở mắt (x, y = 0 là trục quang). Phóng to đều quanh mắt thì nhìn từ mắt y hệt, nên
  // không phải hạ camera.near (1 đv = 12,5 cm, mặt sau kính cách mắt ~30 cm). Xoá độ sâu trước khi vẽ để không bị nhà / đất trước mặt cắt.
  // Núm cự ly súng phóng lựu: số 50..400 m quanh trống (trục x), mỗi nấc DRUM_STEP rad; đọc số ở đỉnh trống, ngay dưới vạch chỉ
  const DRUM_STEP = Math.PI * 2 / 16;
  let DRUM_TEX = null;
  function drumTex() {
    if (DRUM_TEX) return DRUM_TEX;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#1c1d19'; x.fillRect(0, 0, 1024, 128);
    for (let i = 0; i < 16; i++) {
      const u = (0.25 + i / 16) % 1 * 1024, val = 50 + i * 25;
      x.fillStyle = 'rgba(230,232,220,.55)'; x.fillRect(u - 1, 0, 2, 22); x.fillRect(u - 1, 106, 2, 22);
      if (val > 400) continue;
      // số chạy dọc trục trống: nhìn từ sau tới, chữ nằm ngang trên đỉnh trống
      x.save(); x.translate(u, 64); x.rotate(Math.PI / 2);
      x.font = '600 34px "Segoe UI", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = val % 100 ? 'rgba(225,228,215,.75)' : '#f2f0e4'; x.fillText(String(val), 0, 0);
      x.restore();
    }
    DRUM_TEX = new THREE.CanvasTexture(c); DRUM_TEX.anisotropy = 4;
    return DRUM_TEX;
  }
  function reflexModel(kind) {
    const withRail = kind === 'rifle', G = new THREE.Group(), mats = [];
    // nhôm sơn tĩnh điện đen mờ, chịu nắng của cảnh (ánh sáng thật cho khối tròn, không tô màu dải phẳng)
    const mat = (o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0x24261f, roughness: 0.62, metalness: 0.25, fog: false, transparent: true, side: THREE.DoubleSide }, o)); mats.push(m); return m; };
    const body = mat(), inner = mat({ color: 0x0c0d0b, roughness: 0.9, metalness: 0 });
    let order = 9000;
    const add = (geo, m, px, py, pz, P = G) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.renderOrder = order++; o.frustumCulled = false; P.add(o); return o; };
    const tube = (r0, r1, len, z, m = body, open = true) => { const g = new THREE.CylinderGeometry(r1, r0, len, 40, 1, open); g.rotateX(Math.PI / 2); return add(g, m, 0, 0, z); };
    const ring = (ri, ro, z, m = body) => add(new THREE.RingGeometry(ri, ro, 40), m, 0, 0, z);
    // vách trong tối (vẽ trước), vỏ ngoài, mép vát hai đầu
    const first = tube(0.118, 0.118, 0.84, -2.8, inner);
    first.onBeforeRender = r => { if (G.userData.warm) return; r.state.buffers.depth.setMask(true); r.clearDepth(); };
    tube(0.132, 0.132, 0.64, -2.72);
    tube(0.132, 0.142, 0.06, -2.37); ring(0.118, 0.142, -2.34);
    tube(0.145, 0.145, 0.2, -3.12); ring(0.118, 0.145, -3.22);
    // đai kẹp + đế ngắn thấp dưới ống: mắt trên trục nên chỉ thấy mép đế
    add(new THREE.BoxGeometry(0.09, 0.07, 0.3), body, 0, -0.16, -2.75);
    add(new THREE.BoxGeometry(0.2, 0.035, 0.42), body, 0, -0.205, -2.75);
    const knob = new THREE.CylinderGeometry(0.042, 0.042, 0.08, 16); knob.rotateZ(Math.PI / 2);
    add(knob, body, 0.17, 0.0, -2.66);
    if (withRail) add(new THREE.BoxGeometry(0.2, 0.05, 3), body, 0, -0.25, -4);
    if (kind === 'gl') {
      // loa che nắng dài phía trước kính (kiểu kính súng phóng lựu)
      tube(0.15, 0.158, 0.42, -3.43); ring(0.135, 0.158, -3.64);
      // đế nghiêng: kính giữ trên đường ngắm, còn đế + ray súng xoay quanh chốt sau. Vặn trống càng xa, nòng (và đế) càng ngóc so với kính
      const mount = new THREE.Group(); mount.position.set(0, -0.24, -2.45); G.add(mount);
      add(new THREE.BoxGeometry(0.24, 0.045, 0.9), body, 0, -0.02, -0.4, mount);              // tấm đế
      add(new THREE.BoxGeometry(0.06, 0.12, 0.1), body, 0, 0.03, 0, mount);                   // chốt xoay
      add(new THREE.BoxGeometry(0.2, 0.06, 0.9), body, 0, -0.08, -0.35, mount);               // đoạn ray dưới kính (ray dài ngóc lên sẽ che lòng kính)
      for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.22, 0.02, 0.06), body, 0, -0.04, -0.05 - k * 0.17, mount);   // răng ray
      // trống cự ly bên trái đế + vạch chỉ trắng trên vỏ trống
      const dg = new THREE.CylinderGeometry(0.1, 0.1, 0.11, 48); dg.rotateZ(Math.PI / 2);
      const drum = add(dg, mat({ map: drumTex(), color: 0xffffff, roughness: 0.7, metalness: 0.1 }), -0.27, 0.02, -0.12, mount);
      add(new THREE.BoxGeometry(0.06, 0.06, 0.06), body, -0.27, 0.02, 0.0, mount);           // ổ trục trống
      // vạch chỉ hai bên trống, ngang mặt trống quay về phía mắt
      const idx = mat({ color: 0xe8e4d0, roughness: 0.5, metalness: 0 });
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.01, 0.012), idx, -0.27 + sx * 0.07, 0.02, -0.025, mount);
      G.userData.mount = mount; G.userData.drum = drum;
    }
    // mặt kính trong, lớp phủ ám hổ phách rất nhẹ, vẽ sau cùng
    const glass = new THREE.MeshBasicMaterial({ color: 0xc8a060, opacity: 0.07, transparent: true, depthWrite: false, fog: false });
    mats.push(glass);
    add(new THREE.CircleGeometry(0.12, 40), glass, 0, 0, -3);
    G.visible = false; G.scale.setScalar(2);
    G.userData.mats = mats; G.userData.kind = kind;
    return G;
  }

  class Controller {
    /** o: { world, terrain, scene, cam, fireGrenade(soldier, aimPoint, muzzle), onHud(state) } */
    constructor(o) {
      Object.assign(this, o);
      this.active = false; this.soldier = null;
      this.yaw = 0; this.pitch = 0; this.aimK = 0;
      this.keys = {}; this.aiming = false; this.firing = false;
      this.kick = 0; this.spreadNow = 0; this.kills = 0; this.hitT = 0;
      this.fx = []; this.wisps = [];
      this._tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85 });
      this._flashGeo = new THREE.SphereGeometry(1, 8, 6);
      this._ray = new THREE.Vector3(); this._org = new THREE.Vector3();
      this._trigPrev = false; this._shot = false; this._dry = false;
      this.elev = 0; this._elevTo = 0; this._rangeT = 0; this.rangeM = null; this.rangeOk = true;
      this._firePrev = false;
      this.zoom = 0;
      this.drum = 100;                       // thước ngắm phóng lựu đang đặt (m)
      this.sightK = 0; this.recP = 0;        // mức áp mắt vào kính; phần giật súng tự trở về (rad)
      this.swayY = 0; this.swayP = 0; this._swayT = Math.random() * 40; this._swayA = 0;
      this.breath = 1; this._winded = false; this.holding = false;
      this._eye = new THREE.Vector3(); this._vmQ = new THREE.Quaternion();
    }

    enter(soldier) {
      this.soldier = soldier; this.active = true;
      this.yaw = soldier.heading; this.pitch = 0;
      this._elevTo = 0; this.elev = 0; this.zoom = 0; this.sightK = 0; this.recP = 0; this.breath = 1; this._winded = false;
      if (this._hidden) { this._hidden.visible = true; this._hidden = null; }
      soldier.guard = false; soldier.stop(); soldier.intent.drive = { x: 0, z: 0, gait: 'walk', mul: 1, face: null };
    }
    exit() {
      this.scopeFar(false); this.scopeNear(0);
      if (this.soldier) { this.soldier.intent.drive = null; this.soldier.clearAim(); const F = this.soldier.figure; F.aimBlend = 0; F.aimPitch = 0; F.recoil = 0; }
      if (this._hidden) { this._hidden.visible = true; this._hidden = null; }
      if (this._overlay) { this._overlay.dispose(); this._overlay = null; }
      if (this._vm) { this.scene.remove(this._vm); this._vm = null; }
      if (this._lockEl) { this._lockEl.el.remove(); this._lockEl = null; }
      this.lock = null; this._elevAs = null; this._aimPt = null;
      this.sightK = 0;
      this.active = false; this.soldier = null; this.keys = {}; this.aiming = false; this.firing = false;
    }

    // ----- nhập liệu (trang gọi từ chuột / bàn phím; thử headless gọi trực tiếp) -----
    look(dx, dy) {
      // qua kính: chuột quay đúng theo độ phóng đại (cùng một cú rê, vật trên màn hình dời bằng nhau ở mọi nấc)
      const S = this.sight(), k = 0.0022 * (S && this.sightK > 0.5 ? Math.tan(this.sightFov(S) * Math.PI / 360) / Math.tan(CAM.free.fov * Math.PI / 360) : this.aiming ? 0.6 : 1);
      this.yaw -= dx * k; this.pitch = clamp(this.pitch - dy * k, PITCH[0], PITCH[1]);
      if (Math.abs(dx) + Math.abs(dy) > 2) this._glOff = true;   // đang nạp mà rê chuột: người chơi muốn nhìn chỗ khác, trả camera về
    }
    sight() { return this.soldier ? SIGHTS[this.soldier.weapon] || null : null; }
    // nhìn qua kính tầm xa: nới mặt phẳng cắt xa của camera (mặc định 9000) và mỏng sương để thấy tới 2 km; trả lại khi rời kính
    // kính phóng đại: cọng cỏ / vật sát vật kính nằm ngoài vùng hội tụ, nhoè tới mức trong suốt -> cắt bỏ vật gần hơn khoảng mà
    // mép dưới trường nhìn còn chưa chạm đất (không mất mặt đất nào thấy được trong kính). Nằm trong cỏ vẫn nhìn được qua kính
    scopeNear(fov) {
      const cam = this.cam; if (!cam) return;
      if (this._near0 === undefined) this._near0 = cam.near;
      let near = this._near0;
      if (fov > 0 && fov < 20) {
        const h = cam.position.y - this.terrain.getElevationAt(cam.position.x, cam.position.z);
        near = Math.max(this._near0, Math.min(60, 0.5 * Math.max(0, h) / Math.tan(fov * Math.PI / 360)));
      }
      if (Math.abs(cam.near - near) > 0.05) { cam.near = near; cam.updateProjectionMatrix(); }
    }
    // NGOÀI THỊ KÍNH: mắt thấy cảnh ở cỡ thật (không phóng đại) nhưng nhoè, tối -> vẽ thêm một lượt cảnh bằng camera góc rộng ở 1/4
    // độ phân giải (3 khung một lần), làm nhoè và dán quanh lòng kính. Trong kính phóng to, ngoài kính cỡ thật: lệch tỉ lệ đúng như kính thật
    // (game.js gọi ngay sau lượt vẽ chính; trang thử không gọi)
    periPass(renderer, scene) {
      const st = this._periSt, was = this._periWas;
      this._periWas = !!st;
      if (!st || !this.cam) return;
      const size = renderer.getDrawingBufferSize(_pv2), W = size.x, H = size.y, rw = Math.max(64, Math.round(W / 5)), rh = Math.max(64, Math.round(H / 5));
      let P = this._peri;
      if (!P) {
        const rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
        const mat = new THREE.ShaderMaterial({
          uniforms: { map: { value: rt.texture }, c: { value: new THREE.Vector2() }, r: { value: 0 }, px: { value: new THREE.Vector2() }, shift: { value: new THREE.Vector2() } },
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: `uniform sampler2D map; uniform vec2 c; uniform float r; uniform vec2 px; uniform vec2 shift; varying vec2 vUv;
            void main() {
              if (distance(gl_FragCoord.xy, c) < r) discard;
              vec3 s = vec3(0.0);
              for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += texture2D(map, clamp(vUv + shift + vec2(float(i), float(j)) * px * 1.7, 0.0, 1.0)).rgb;
              s /= 25.0;
              float l = dot(s, vec3(0.3, 0.59, 0.11));
              gl_FragColor = vec4(mix(vec3(l), s, 0.8) * 0.7, 1.0);
            }`,
          depthTest: false, depthWrite: false
        });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
        const qs = new THREE.Scene(); qs.add(quad);
        P = this._peri = { rt, mat, qs, cam: new THREE.PerspectiveCamera(55, W / H, 0.5, 9000), oc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), n: 0, t: -1e9, q: new THREE.Quaternion(), p: new THREE.Vector3(), iq: new THREE.Quaternion(), fresh: false };
      }
      if (P.rt.width !== rw || P.rt.height !== rh) { P.rt.setSize(rw, rh); P.fresh = false; }
      // chỉ vẽ lại cảnh khi nhìn sang chỗ khác đáng kể, dời chỗ, hoặc ảnh đã cũ (~0,7 s): xạ thủ nằm ngắm gần như đứng yên nên phần lớn
      // thời gian không tốn lượt vẽ nào; xoay nhẹ thì trượt ảnh cũ theo hướng nhìn (ảnh đã nhoè, sai lệch nhỏ không thấy)
      const now = performance.now(), turn = P.fresh ? P.q.angleTo(this.cam.quaternion) : 1, moved = P.fresh ? P.p.distanceTo(this.cam.position) : 1;
      if (!was) P.fresh = false;
      const ac = renderer.autoClear;
      const s = this.soldier, F = s && s.figure, Wd = s && SoldierModel.WEAPONS[s.weapon];
      if (!P.fresh || turn > 0.035 || moved > 0.8 || now - P.t > 700) {
        P.fresh = true; P.t = now; P.q.copy(this.cam.quaternion); P.p.copy(this.cam.position); P.n++;
        const C = P.cam; C.position.copy(this.cam.position); C.quaternion.copy(this.cam.quaternion); C.aspect = W / H; C.far = this.cam.far;
        // thân súng thật trước mắt (thị kính, ống kính, hộp khoá) che cảnh ngoài: người lính đã gộp chung một lưới nên dựng riêng một bản
        // súng không xương, đặt theo xương súng. Góc nhìn chọn sao cho mặt thấu kính thị kính lọt khít lòng kính trên màn hình
        let gun = null;
        if (F && F.rifle && Wd && Wd.build && SIGHTS[s.weapon] && SIGHTS[s.weapon].lens) {
          if (!P.gun || P.gunW !== s.weapon) {
            const M = SoldierModel.getMaterials(s.team);
            const add = (par, geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); par.add(m); return m; };
            P.gun = Wd.build(M, add); P.gunW = s.weapon; P.gun.matrixAutoUpdate = false;
          }
          gun = P.gun; F.rifle.updateWorldMatrix(true, false); gun.matrix.copy(F.rifle.matrixWorld);
          const a = gun.userData.atr, b = F.rifle.userData.atr;
          if (a && b) { a.legs.forEach((l, i) => l.quaternion.copy(b.legs[i].quaternion)); a.bolt.position.copy(b.bolt.position); a.bolt.rotation.copy(b.bolt.rotation); a.mag.position.copy(b.mag.position); a.mag.scale.copy(b.mag.scale); }
          const L = SIGHTS[s.weapon].lens, lw = F.rifle.localToWorld(_pv3.set(L[0], L[1], L[2])), de = Math.max(0.05, C.position.distanceTo(lw));
          C.fov = clamp(2 * Math.atan(L[3] / de / 0.98) * 180 / Math.PI, 18, 75); C.near = 0.04;
        } else { C.fov = 55; C.near = 0.5; }
        C.updateProjectionMatrix();
        const prev = renderer.getRenderTarget();
        if (gun) scene.add(gun);
        renderer.setRenderTarget(P.rt); renderer.autoClear = true; renderer.render(scene, C); renderer.setRenderTarget(prev);
        if (gun) scene.remove(gun);
      }
      // hướng nhìn hiện tại trong hệ camera lúc vẽ ảnh -> độ trượt ảnh (toạ độ uv)
      const f = _pv3.set(0, 0, -1).applyQuaternion(this.cam.quaternion).applyQuaternion(P.iq.copy(P.q).invert()), th = Math.tan(P.cam.fov * Math.PI / 360);
      P.mat.uniforms.shift.value.set(f.z < -0.1 ? f.x / -f.z / (th * P.cam.aspect) * 0.5 : 0, f.z < -0.1 ? f.y / -f.z / th * 0.5 : 0);
      const dpr = W / (window.innerWidth || W);
      P.mat.uniforms.c.value.set(W / 2 + st.ox * dpr, H / 2 - st.oy * dpr);
      P.mat.uniforms.r.value = st.R * 0.985 * dpr; P.mat.uniforms.px.value.set(1 / rw, 1 / rh);
      renderer.autoClear = false; renderer.render(P.qs, P.oc); renderer.autoClear = ac;
    }
    scopeFar(on) {
      const cam = this.cam; if (!cam) return;
      if (this._far0 === undefined) this._far0 = cam.far;
      const far = on ? Math.max(this._far0, 17500) : this._far0;
      if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); }
      const fog = this.scene && this.scene.fog;
      if (!fog || fog.density === undefined) return;
      if (on) { if (this._fog0 === undefined || Math.abs(fog.density - this._fog0 * 0.3) > 1e-9) this._fog0 = fog.density; fog.density = this._fog0 * 0.3; }
      else if (this._fog0 !== undefined) { fog.density = this._fog0; this._fog0 = undefined; }
    }
    // gió so với hướng ngắm (m/s): ngang > 0 thổi sang phải, dọc > 0 thổi xuôi về phía mục tiêu. Lính cảm được gió qua cỏ, khói, cờ
    windRel() {
      const B = typeof window !== 'undefined' && window.game && window.game.ballistics, w = B && B.wind;
      if (!w) return null;
      const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
      return { cross: w.vx * c - w.vz * sn, head: -(w.vx * sn + w.vz * c) };
    }
    sightFov(S) { return S.reflex ? S.fov : S.fovs[Math.min(this.zoom, S.fovs.length - 1)]; }
    // đang nhìn qua kính quang (mắt đã áp vào thị kính)
    scoped() {
      const S = this.sight();
      return !!S && !S.reflex && this.sightK > 0.9;
    }
    // đường ngắm thật: hướng chuột + rung tay + phần giật súng chưa trở về
    losPitch() { return clamp(this.pitch + this.swayP + this.recP, PITCH[0] - 0.1, PITCH[1] + 0.1); }
    losDir(v) { const y = this.yaw + this.swayY, p = this.losPitch(), c = Math.cos(p); return v.set(-Math.sin(y) * c, Math.sin(p), -Math.cos(y) * c); }
    // cự ly kính / thước ngắm đang chỉnh (đv)
    sightZero(s) { const S = SIGHTS[s.weapon]; return S && S.drum ? this.drum * 8 : (s.arms.def.ball.zero || ZERO); }
    // góc nòng của phát do người chơi bắn. Hỗ trợ: đúng góc để đạn rơi vào điểm ngắm. Mô phỏng: đường ngắm + góc chỉnh, người bắn tự lo cự ly
    boreFor(s, from, to) {
      const B = s.arms.def.ball;
      if (ASSIST) { const L = SoldierEngine.lob(from, to, B); return L.ok ? L.elev : B.maxElev; }
      return boreElev(from, to, B, this.sightZero(s));
    }
    muzzleOf(s) { return s.arms.def.muzzle ? s.muzzlePos() : s.figure.rifle.localToWorld((MUZZLE[s.weapon] || MUZZLE.rifle).clone()); }
    // ----- KHOÁ MỤC TIÊU: tâm ngắm nằm trên xe / lính địch là khoá; giữ khoá khi tâm còn quanh mục tiêu, lệch hẳn quá LOCK.loseS giây thì nhả -----
    lockCands(s) {
      const out = [], W = this.world;
      if (this.aimVehicles) for (const v of this.aimVehicles()) {
        if (!v || v.isDead || v.team === s.team || (v.group && v.group.visible === false)) continue;
        out.push({ t: v, r: LOCK.rVeh, x: v.x, y: (v.y || 0) + 9, z: v.z });
      }
      if (W && W.soldiers) for (const o of W.soldiers) {
        if (o === s || !o.alive || !W.isEnemy(s, o) || (o.root && o.root.visible === false)) continue;
        out.push({ t: o, r: LOCK.rInf * (o.k || 1), x: o.x, y: o.y + 9 * (o.k || 1), z: o.z });
      }
      return out;
    }
    stepLock(dt, s) {
      const A = s.arms;
      if (!ASSIST || A.def.kami || !s.alive || !this.cam) { this.lock = null; return; }
      const org = this.cam.position, ray = this.losDir(_pv3), range = (A.def.ball ? A.def.ball.range : A.def.range) || 2400;
      const angOf = (c) => { const dx = c.x - org.x, dy = c.y - org.y, dz = c.z - org.z, d = Math.hypot(dx, dy, dz) || 1; return { d, a: Math.acos(clamp((dx * ray.x + dy * ray.y + dz * ray.z) / d, -1, 1)) }; };
      let L = this.lock;
      if (L) {
        const t = L.t, gone = t.isDead || t.alive === false || (t.group && t.group.visible === false);
        const c = { x: t.x, y: L.vehicle ? (t.y || 0) + 9 : t.y + 9 * (t.k || 1), z: t.z }, q = angOf(c);
        L.lost = q.a > Math.max(LOCK.minAng, Math.atan(L.r / q.d)) * LOCK.keepMul + LOCK.keepAdd || q.d > range + 200 ? L.lost + dt : 0;
        if (gone || L.lost > LOCK.loseS) { this.lock = L = null; }
        else {
          // vận tốc mục tiêu đo từ vị trí qua các khung (mượt), dùng cho điểm đón đầu
          const vx = (c.x - L.p.x) / Math.max(dt, 1e-3), vz = (c.z - L.p.z) / Math.max(dt, 1e-3), k = Math.min(1, dt * 4);
          if (L.age > 0) { L.v.x += (clamp(vx, -200, 200) - L.v.x) * k; L.v.z += (clamp(vz, -200, 200) - L.v.z) * k; }
          L.p.set(c.x, c.y, c.z); L.d = q.d; L.age += dt;
        }
      }
      if (!L && (this._lockScan = (this._lockScan || 0) - dt) <= 0) {
        this._lockScan = LOCK.scanS;
        let best = null, bestA = Infinity;
        for (const c of this.lockCands(s)) {
          const q = angOf(c);
          if (q.d > range + 200 || q.a > Math.max(LOCK.minAng, Math.atan(c.r / q.d)) || q.a >= bestA) continue;
          best = c; bestA = q.a; best.d = q.d;
        }
        // không khoá xuyên đất / nhà
        if (best) { const h = this.traceShot(org, _pv3.set(best.x - org.x, best.y - org.y, best.z - org.z).normalize(), best.d); if (h.dist < best.d - best.r * 1.5 && !h.target) best = null; }
        if (best) {
          L = this.lock = { t: best.t, r: best.r, vehicle: best.r === LOCK.rVeh, p: new THREE.Vector3(best.x, best.y, best.z), v: new THREE.Vector3(), lead: new THREE.Vector3(best.x, best.y, best.z), d: best.d, lost: 0, age: 0 };
          const SE = typeof window !== 'undefined' && window.soundEngine;
          if (SE && SE.playTargetLockSound) try { SE.playTargetLockSound(); } catch (e) { /* tiếng không bắt buộc */ }
        }
      }
      if (L) {
        // đón đầu: thời gian bay theo sơ tốc ngang (lặp 2 lần vì điểm đón dời thì cự ly đổi)
        const B = A.def.ball;
        L.lead.copy(L.p);
        if (B) for (let i = 0; i < 2; i++) {
          const d = Math.hypot(L.lead.x - s.x, L.lead.z - s.z), el = SoldierEngine.lob(s, L.lead, B).elev, tf = d / (B.v * Math.cos(el) * (B.k ? 0.85 : 1));
          L.lead.set(L.p.x + L.v.x * tf, L.p.y, L.p.z + L.v.z * tf);
        }
      }
    }
    // khung khoá + điểm đón đầu trên màn hình (DOM, nằm trên cả lớp kính)
    drawLock() {
      if (typeof document === 'undefined') return;
      const L = this.active && this.soldier && this.soldier.alive ? this.lock : null;
      let E = this._lockEl;
      if (!L) { if (E && E.el.style.display !== 'none') E.el.style.display = 'none'; return; }
      if (!E) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:960;display:none';
        const corner = 'position:absolute;width:30%;height:30%;border:0 solid #ffa040;filter:drop-shadow(0 0 2px #000)';
        el.innerHTML = `<div class="lk" style="position:absolute"><i style="${corner};left:0;top:0;border-width:2px 0 0 2px"></i><i style="${corner};right:0;top:0;border-width:2px 2px 0 0"></i><i style="${corner};left:0;bottom:0;border-width:0 0 2px 2px"></i><i style="${corner};right:0;bottom:0;border-width:0 2px 2px 0"></i>`
          + '<b style="position:absolute;left:50%;top:100%;transform:translate(-50%,4px);font:600 12px/1 system-ui,sans-serif;color:#ffb060;text-shadow:0 1px 2px #000;white-space:nowrap"></b></div>'
          + '<div class="ld" style="position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid #ffa040;border-radius:50%;box-shadow:0 0 2px #000"></div>';
        document.body.appendChild(el);
        E = this._lockEl = { el, box: el.querySelector('.lk'), txt: el.querySelector('b'), lead: el.querySelector('.ld') };
      }
      const cam = this.cam, W = window.innerWidth, H = window.innerHeight, v = _pv3.copy(L.p).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { E.el.style.display = 'none'; return; }
      E.el.style.display = '';
      const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H, pp = H / 2 / Math.tan(cam.fov * Math.PI / 360);
      const grow = 1 + 0.7 * Math.max(0, 1 - L.age / 0.22), size = clamp(L.r / Math.max(1, L.d) * pp * 2.2, 26, 260) * grow;
      Object.assign(E.box.style, { left: (px - size / 2).toFixed(1) + 'px', top: (py - size / 2).toFixed(1) + 'px', width: size.toFixed(1) + 'px', height: size.toFixed(1) + 'px' });
      E.txt.textContent = Math.round(Math.hypot(L.p.x - this.soldier.x, L.p.z - this.soldier.z) / 8) + ' m';
      const w = _pv3.copy(L.lead).project(cam), lx = (w.x + 1) / 2 * W, ly = (1 - w.y) / 2 * H;
      E.lead.style.display = Math.hypot(lx - px, ly - py) > 6 && w.z < 1 ? '' : 'none';
      E.lead.style.left = lx.toFixed(1) + 'px'; E.lead.style.top = ly.toFixed(1) + 'px';
    }
    // rung tay: thở (dọc là chính) + run mỏi; giữ Shift nín thở vài giây, hết hơi thì rung mạnh hơn cho tới khi lấy lại sức
    stepSway(dt, s, inSight) {
      this._swayT += dt;
      const prone = (s.figure._proneK || 0) > 0.5, kneel = s.intent.stance === 'kneel', moving = s.speed > 1;
      const fat = 1 - (s.stam == null ? 1 : s.stam);
      // vừa chạy xong đang thở dốc: nín thở được ngắn hơn, kiệt sức thì không nín được
      this.holding = inSight && !moving && !this._winded && !s.tired && !!(this.keys.ShiftLeft || this.keys.ShiftRight);
      this.breath = clamp(this.breath + dt * (this.holding ? -(1 + 2 * fat) / 7 : 1 / 9), 0, 1);
      if (this.breath <= 0) this._winded = true; else if (this.breath > 0.4) this._winded = false;
      let A = prone ? 0.00022 : kneel ? 0.0011 : 0.0019;
      if (s.weapon === 'rpg') A *= 1.25;
      if (moving) A *= 3;
      A *= this.holding ? 0.2 + 0.5 * fat : this._winded ? 2 : 1;
      A *= 1 + 2.2 * fat * fat;   // thở dốc: tâm ngắm nhấp nhô mạnh
      if (ASSIST) A *= 0.25;      // hỗ trợ: chỉ còn nhịp thở nhẹ cho kính có hồn, không phải nín thở mới bắn trúng
      this._swayA += ((inSight ? A : 0) - this._swayA) * Math.min(1, dt * 3);
      const t = this._swayT, a = this._swayA;
      this.swayY = a * (0.65 * Math.sin(t * 0.83) + 0.35 * Math.sin(t * 2.17 + 1.3));
      this.swayP = a * (0.9 * Math.sin(t * (1.36 + 2.6 * fat) + 0.6) + 0.3 * Math.sin(t * 3.1));   // thở càng gấp nhịp nhấp nhô càng nhanh
    }
    // vùng nhìn của kính cho TeamIntel: hướng ngang + nửa góc, chỉ khi đã nằm và lên súng; null khi không ngắm
    scopeCone() {
      const s = this.soldier;
      if (!s || !s.alive || !s.arms.def.prone || this.aimK < 0.9 || (s.figure._proneK || 0) < 0.95) return null;
      const half = Math.tan(this.sightFov(SIGHTS.atr) * Math.PI / 360);
      return { dx: -Math.sin(this.yaw), dz: -Math.cos(this.yaw), cos: Math.cos(Math.atan(half)), r: SCOPE_SIGHT[this.zoom] };
    }
    // con lăn: kính quang đổi nấc phóng đại; phóng lựu vặn thước ngắm
    zoomStep(dir) {
      const S = this.sight();
      if (!S || this.aimK <= 0.5) return;
      if (S.drum && ASSIST) return;   // hỗ trợ: trống tự quay theo cự ly đo được
      if (S.drum) { this.drum = clamp(this.drum + dir * S.drum[2], S.drum[0], S.drum[1]); return; }
      if (S.fovs) this.zoom = clamp(this.zoom + dir, 0, S.fovs.length - 1);
    }
    key(code, down) {
      this.keys[code] = down;
      if (!down) return;
      if (code === 'KeyR') this.reload();
      if (code === 'KeyC' && this.soldier) this.soldier.setStance(this.soldier.intent.stance === 'kneel' ? 'stand' : 'kneel');
      if (code === 'Enter' && this.soldier && !this.soldier.alive) this.soldier.revive();
    }
    reload() {
      const s = this.soldier; if (!s || !s.alive) return;
      this._dry = false;
      s.startReload();
    }

    // ----- mỗi khung, trước world.update -----
    update(dt) {
      const s = this.soldier; if (!s) return;
      const F = s.figure, K = this.keys, A = s.arms;
      this.hitT = Math.max(0, this.hitT - dt);
      this.stepFx(dt);
      if (!s.alive) { this.sightK = 0; this.hud(); return; }
      const fw = K.KeyW ? 1 : K.KeyS ? -1 : 0, st = K.KeyD ? 1 : K.KeyA ? -1 : 0;
      const kami = !!A.def.kami, moving = !!(fw || st) && !(kami && (F.kamiSeq != null || F.kamiCtl));   // đang phóng / lái UAV: quỳ tại chỗ
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      let mx = -sin * fw + cos * st, mz = -cos * fw - sin * st;
      const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      // RPG vừa bắn: còn giữ ống trên vai một nhịp (RPG_RELOAD.lower) nên chưa tính là đang nạp, vẫn nhìn kính theo đạn bay
      const rpHold = A.rp && A.rp.t != null && A.rp.t < SoldierModel.RPG_RELOAD.lower[0];
      const reloading = A.reload > 0 && !rpHold, proneNow = (s.figure._proneK || 0) > 0.5;
      // súng bắn tỉa: đang nằm thì thay băng ngay trên chân chống, không đứng dậy
      const wantAim = !kami && (A.ar && reloading ? this.aiming || proneNow : this.aiming && !reloading);
      // bóp cò lúc đang nạp không kéo súng lên vai: chỉ báo dừng nạp sớm, nhét xong viên đang cầm thì khép khung
      const pull = this.firing && !this._trigPrev; this._trigPrev = this.firing;
      if (pull && reloading && A.def.seq) s.interruptReload();
      const combat = wantAim || (this.firing && !reloading && !kami);
      const run = K.ShiftLeft && !combat && !reloading && fw > 0;
      if (moving && s.intent.stance === 'kneel') s.setStance('stand');
      const D = s.intent.drive;
      const pinned = A.def.prone && wantAim;   // đang ngắm súng bắn tỉa là nằm tại chỗ
      D.x = moving && !pinned ? mx : 0; D.z = moving && !pinned ? mz : 0;
      D.gait = run ? 'run' : 'walk'; D.mul = wantAim ? 0.7 : fw < 0 ? 0.75 : 1;
      // khi ngắm / bắn thân luôn quay theo hướng nhìn (đi ngang, đi lùi); còn lại quay theo hướng đi, đứng yên thì giữ hướng
      D.face = combat ? this.yaw : moving ? null : s.heading;
      this.aimK += ((combat ? 1 : 0) - this.aimK) * Math.min(1, dt * 11);
      F.aimBlend = this.aimK > 0.005 ? this.aimK : 0;
      // áp mắt vào kính khi giữ chuột phải và súng đã lên vai (súng bắn tỉa: đã nằm hẳn); đang nạp, đi nhờ xe thì rời kính
      const S = SIGHTS[s.weapon], wantSight = !!S && this.aiming && !reloading && !s.ride && this.aimK > 0.55 && (!A.def.prone || (F._proneK || 0) > 0.95);
      const skTo = wantSight ? 1 : 0, skStep = dt * (wantSight ? 7 : 11);
      this.sightK = Math.abs(skTo - this.sightK) <= skStep ? skTo : this.sightK + Math.sign(skTo - this.sightK) * skStep;
      this.stepSway(dt, s, this.sightK > 0.5);
      this.recP *= Math.exp(-dt * 5.5);
      // nòng theo đường ngắm + góc chỉnh của kính; phóng lựu: thước ngắm càng xa nòng càng ngóc, đường ngắm vẫn ở mục tiêu
      let gunPitch = this.pitch;
      this.stepLock(dt, s);
      if (A.def.ball) {
        if ((ASSIST || (S && S.drum)) && (this._rangeT -= dt) <= 0 && this.aimK > 0.2) { this._rangeT = 0.1; this.measure(); }
        this._elevTo = ASSIST && this._elevAs != null ? this._elevAs : this.losPitch() + zeroAngle(A.def.ball, this.sightZero(s));
        this.elev += (this._elevTo - this.elev) * Math.min(1, dt * 7);
        gunPitch = this.elev;
      }
      F.aimPitch = gunPitch * this.aimK;
      this.kick = Math.max(0, this.kick - dt * (A.def.seq || A.ar ? 2.2 : 9));   // súng ổ quay: F.recoil đi qua đường cong SoldierModel.recoilEnv
      // mở khung sau khi vừa bắn: khói còn trong buồng bay ra
      if (A.rl && A.rl.stage === 'open' && this._openRl !== A.rl) {
        this._openRl = A.rl;
        const P = F.rifle.userData.gl;
        if (P && A.cham.includes(2) && performance.now() - (s._shotAt || -1e9) < 30000) this.wisps.push({ s, t: 1.5, T: 1.5, n: 0.1, at: () => P.drum.localToWorld(new THREE.Vector3(0, 0, 0.5)) });
      }
      this.shake = Math.max(0, (this.shake || 0) - dt * 4.2);
      F.recoil = this.kick;
      this.spreadNow = Math.max(0, this.spreadNow - dt * 0.12);
      // UAV cảm tử: mỗi lần bấm phóng một quả (đứng yên mới phóng được); trận / phòng thử phóng UAV thật ở sự kiện 'launch'
      if (kami) { const pull2 = this.firing && !this._firePrev; this._firePrev = this.firing; if (pull2 && !(this.canKami && !this.canKami(s))) s.startKami(); }
      else if (A.def.semi) {
        // cò đơn: mỗi lần bóp một phát; phát đang chờ súng lên vai vẫn nổ nếu còn giữ cò
        if (pull) this._shot = true; else if (!this.firing) this._shot = false;
        if (this._shot && this.tryFire(pull)) this._shot = false;
      } else if (this.firing) this.tryFire();
      this.hud();
    }
    hud() {
      const s = this.soldier; if (!s || !this.onHud) return;
      this.onHud({ load: Math.round(s.loadKg), hp: Math.max(0, s.hp), alive: s.alive, mag: s.arms.mag, cap: s.arms.def.mag, reserve: s.reserve, reloading: s.arms.reload > 0, range: (ASSIST ? s.arms.def.ball : s.weapon === 'gl') && this.aimK > 0.5 ? this.rangeM : null, lock: !!this.lock, drum: s.weapon === 'gl' ? this.drum : null, sight: this.sightK > 0.5, holding: this.holding, winded: this._winded, stam: s.stam, tired: s.tired, scope: this.scoped() ? { x: SIGHTS[s.weapon].x[Math.min(this.zoom, SIGHTS[s.weapon].x.length - 1)], wind: this.windRel() } : null, rangeOk: this.rangeOk, aim: this.aimK, weapon: s.weapon, stance: s.intent.stance, hit: this.hitT > 0, kills: this.kills, motion: s.motion, spread: this.spreadNow,
        kami: s.arms.def.kami ? { left: s.arms.mag, launching: s.figure.kamiSeq != null, flying: !!s.figure.kamiCtl } : null });
    }

    // ----- camera, sau world.update -----
    placeCamera() {
      const s = this.soldier; if (!s) return;
      const cam = this.cam, a = this.aimK, f = CAM.free, g = s.arms.def.prone ? CAM.prone : CAM.aim;
      // ống UAV cảm tử dựng sau ba lô che giữa khung: dời camera sang phải
      const tubeOff = s.arms.def.kami && (s.figure.kamiLeft === undefined ? s.arms.mag : s.figure.kamiLeft) > 0 ? 1 : 0;
      // đi nhờ xe: lùi camera ra cho thấy xe (ngồi trong khoang lùi xa hơn)
      const R = s.ride, extra = R && R.dir > 0 ? (R.inside ? 34 : 12) * (1 - a) : 0;
      this.camExtra = (this.camExtra || 0) + (extra - (this.camExtra || 0)) * 0.08;
      // súng ổ quay đang nạp, đứng yên: camera lượn sang bên phải - trước để thấy tay (từ sau lưng thân che hết); đi lại hoặc rê chuột thì trả về camera thường
      const rlNow = s.arms.def.seq && s.arms.reload > 0;
      if (!rlNow) this._glOff = false;
      this._glK = (this._glK || 0) + ((rlNow && s.speed < 1.5 && !this._glOff ? 1 : 0) - (this._glK || 0)) * 0.05;
      const glK = this._glK * (1 - a), kickE = (s.arms.def.seq || s.arms.ar) && this.kick > 0 ? SoldierModel.recoilEnv(this.kick) : 0;
      const dist = f.dist + (g.dist - f.dist) * a + this.camExtra + 0.22 * kickE, right = f.right + (g.right - f.right) * a + 6 * tubeOff, up = (f.up + (g.up - f.up) * a + 3 * tubeOff) * s.k;
      const kneel = s.intent.stance === 'kneel' ? -3.6 : 0;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const px = s.x + cy * right, py = s.y + up + kneel, pz = s.z - sy * right;
      // kéo camera lại gần khi vướng nhà / đất
      let d = dist;
      const T = this.terrain;
      for (let t = 0.2; t <= 1; t += 0.2) {
        const x = px + sy * cp * dist * t, z = pz + cy * cp * dist * t, y = py - sp * dist * t;
        const hitWall = T.resolveVehicleCollision && T.resolveVehicleCollision(px, pz, x, z, 1.5, null).hit;
        if (hitWall || y < T.getElevationAt(x, z) + 1.5) { d = Math.max(3, dist * (t - 0.2)); break; }
      }
      cam.position.set(px + sy * cp * d, py - sp * d, pz + cy * cp * d);
      // áp mắt: camera về đúng chỗ mắt sau kính (theo súng thật), hướng là đường ngắm; thân mình ẩn đi vì mắt nằm trong đầu
      const S = SIGHTS[s.weapon], sk = S ? this.sightK : 0, ks = sk * sk * (3 - 2 * sk);
      if (sk > 0) {
        const gun = s.figure.rifle; gun.updateWorldMatrix(true, false);
        const E = gun.localToWorld(this._eye.copy(S.eye));
        E.y = Math.max(E.y, T.getElevationAt(E.x, E.z) + 0.6);
        cam.position.lerp(E, ks);
      }
      if (sk > 0.4) { s.root.visible = false; this._hidden = s.root; }
      else if (this._hidden) { this._hidden.visible = true; this._hidden = null; }
      // sóng nổ liều đẩy RPG dội vào người: camera rung nhanh, tắt dần
      if (this.shake > 0) { const e = this.shake * this.shake * 0.5, w = performance.now() * 0.05; cam.position.x += Math.sin(w * 1.13) * e; cam.position.y += Math.sin(w * 1.71 + 1) * e * 0.8; cam.position.z += Math.sin(w * 0.93 + 2) * e; }
      this.losDir(this._ray);
      const eyeK = 1 - ks;   // cúi nhìn tay nạp, nảy camera khi bắn chỉ thuộc về camera sau vai
      const lx = cam.position.x + this._ray.x * 100, ly = cam.position.y + this._ray.y * 100 + 0.5 * kickE * eyeK, lz = cam.position.z + this._ray.z * 100;
      const orbitK = glK * glK * (3 - 2 * glK);
      if (orbitK > 0.001) {
        const G = s.figure.rifle.getWorldPosition(this._org), az = s.heading + GL_RELOAD_CAM.az, ox = G.x + Math.sin(az) * GL_RELOAD_CAM.dist, oz = G.z + Math.cos(az) * GL_RELOAD_CAM.dist;
        // vướng tường / đất thì ở lại camera thường
        const blocked = (T.resolveVehicleCollision && T.resolveVehicleCollision(s.x, s.z, ox, oz, 1.5, null).hit) || G.y + GL_RELOAD_CAM.up < T.getElevationAt(ox, oz) + 1.5;
        const q = blocked ? 0 : orbitK;
        cam.position.x += (ox - cam.position.x) * q; cam.position.y += (G.y + GL_RELOAD_CAM.up - cam.position.y) * q; cam.position.z += (oz - cam.position.z) * q;
        cam.lookAt(lx + (G.x - lx) * q, ly + (G.y - ly) * q, lz + (G.z - lz) * q);
      } else cam.lookAt(lx, ly, lz);
      // đang thay băng súng bắn tỉa: nới góc nhìn cho thấy động tác
      this._rlK = (this._rlK || 0) + ((s.arms.ar && s.arms.reload > 0 ? 1 : 0) - (this._rlK || 0)) * 0.1;
      const fov0 = f.fov + (g.fov - f.fov) * a, fov1 = fov0 + (Math.max(fov0, 42) - fov0) * this._rlK, fovS = S ? this.sightFov(S) : fov1;
      // ống kính quang đổi trường nhìn dứt khoát ở cuối lúc áp mắt; chấm đỏ 1x thì chỉ khác chút ít
      const fov = S && !S.reflex ? (sk > 0.8 ? fovS : fov1) : fov1 + (fovS - fov1) * ks;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      this.placeSight(S, sk, fov);
      this.drawLock();
      this.scopeFar(S && !S.reflex && sk > 0.8 && s.arms.def.ball && s.arms.def.ball.range > 9000);
      this.scopeNear(S && !S.reflex && sk > 0.8 ? fov : 0);
    }
    // lớp kính + thân kính chấm đỏ theo camera
    placeSight(S, sk, fov) {
      const s = this.soldier, cam = this.cam, on = !!S && sk > 0.05;
      if (!this._overlay && on && typeof document !== 'undefined') this._overlay = new SightOverlay(this.sightParent || document.body);
      if (this._overlay) {
        if (!on) { this._overlay.update(null); this._periSt = null; }
        else {
          // mắt lệch khỏi tâm thị kính khi giật súng / đi lại: viền tối dịch đi còn vạch vẫn đúng đường ngắm (kính không thị sai)
          const H = window.innerHeight, pp = H / 2 / Math.tan(fov * Math.PI / 360), walk = s.speed > 1 ? 1 : 0;
          const ox = clamp(this.swayY * pp * 0.5 + walk * 5 * Math.sin(this._swayT * 7), -MASK_PAD, MASK_PAD), oy = clamp(this.recP * pp * 0.3 + this.swayP * pp * 0.5 + walk * 7 * Math.abs(Math.sin(this._swayT * 7)), -MASK_PAD, MASK_PAD);
          const A = s.arms, zx = S.x ? S.x[Math.min(this.zoom, S.x.length - 1)] : 1;
          const info = (A.mag + (s.reserve != null ? ' / ' + s.reserve : '')) + '\n' + String(zx).replace('.', ',') + '×' + (ASSIST && this.rangeM != null ? ' · ' + Math.round(this.rangeM) + ' m' : '') + (this.holding ? ' · nín thở' : this._winded ? ' · hụt hơi' : '');
          const op = Math.min(1, Math.max(0, (sk - (S.reflex ? 0.6 : 0.8)) / (S.reflex ? 0.4 : 0.2)));
          this._overlay.update({ weapon: s.weapon, fov: this.sightFov(S), op, ox: S.reflex ? 0 : ox, oy: S.reflex ? 0 : oy, info, hit: this.hitT > 0 });
          this._periSt = !S.reflex && op > 0.5 ? { ox, oy, R: H * 0.49 } : null;
        }
      }
      // đổi sang lính cầm súng khác: dựng lại thân kính đúng mẫu
      if (S && S.reflex && this._vm && this._vm.userData.kind !== s.weapon && !this._vm.userData.warm) { this.scene.remove(this._vm); this._vm = null; }
      if (S && S.reflex && !this._vm) { this._vm = reflexModel(s.weapon); this.scene.add(this._vm); }
      if (this._vm && !this._vm.userData.warm) {
        const vis = !!S && S.reflex && sk > 0.75, U = this._vm.userData;
        this._vm.visible = vis;
        if (vis && U.mount) {
          // đế + ray ngóc theo góc nòng so với đường ngắm; trống quay tới số đang đặt (đuổi theo mượt như vặn tay)
          U.mount.rotation.x = clamp(this.elev - this.losPitch(), 0, 0.45);
          const want = ((this.drum - 50) / 25 + 2) * DRUM_STEP;   // +2 nấc: đưa số đang đặt về mặt trống quay vào mắt
          U.drum.rotation.x += (want - U.drum.rotation.x) * 0.35;
        }
        if (vis) { this._vm.position.copy(cam.position); this._vm.quaternion.copy(cam.quaternion); this._vm.updateMatrixWorld(true); }
      }
    }
    // dịch sẵn shader thân kính lúc vào trận (vẽ trong suốt vài khung) để lần ngắm đầu không khựng
    warmSight() {
      const S = this.sight();
      if (!S || !S.reflex || this._vm) return;
      const vm = this._vm = reflexModel(this.soldier.weapon), mats = vm.userData.mats, ops = mats.map(m => m.opacity);
      this.scene.add(vm);
      vm.userData.warm = true; vm.visible = true; vm.position.copy(this.cam.position);
      mats.forEach(m => { m.opacity = 0; });
      setTimeout(() => { mats.forEach((m, i) => { m.opacity = ops[i]; }); vm.userData.warm = false; }, 400);
    }

    // súng phóng lựu: cự ly từ tâm ngắm tới mục tiêu để hiện trên HUD; người bắn tự vặn thước ngắm cho khớp
    // hỗ trợ: đo luôn góc nòng để đạn rơi vào điểm ngắm (đang khoá thì vào điểm đón đầu); phóng lựu quay trống theo cự ly
    measure() {
      const s = this.soldier, dir = this.losDir(new THREE.Vector3()), B = s.arms.def.ball;
      let pt, sky = false;
      if (this.lock) pt = this.lock.lead.clone();
      else { const hit = this.traceShot(this.cam.position, dir, B.range + 200); pt = hit.point; sky = hit.sky; }
      this.rangeM = sky ? null : Math.hypot(pt.x - s.x, pt.z - s.z) / 8;
      this.rangeOk = sky || this.rangeM * 8 <= B.range;
      this._aimPt = sky ? null : pt;
      if (!ASSIST) return;
      const L = sky ? null : SoldierEngine.lob(this.muzzleOf(s), pt, B);
      this._elevAs = L ? (L.ok ? L.elev : B.maxElev) : null;
      const S = SIGHTS[s.weapon];
      if (S && S.drum && this.rangeM != null) this.drum = clamp(Math.round(this.rangeM / S.drum[2]) * S.drum[2], S.drum[0], S.drum[1]);
    }
    // ----- bắn -----
    tryFire(pull = true) {
      const s = this.soldier, A = s.arms;
      if (!s.alive || A.reload > 0 || A.cd > 0 || s.cycling) return false;
      if (this.aimK < 0.6) return false;      // súng phải lên vai rồi mới nổ
      if (A.def.prone && (s.figure._proneK || 0) < 0.95) return false;   // súng bắn tỉa: nằm xuống hẳn mới bắn
      if (A.mag <= 0) {
        // súng ổ quay không tự nạp: bóp cò nghe "tách", bóp lần nữa mới hạ súng nạp
        if (!A.def.seq) { this.reload(); return false; }
        if (pull) { if (this._dry) this.reload(); else { this._dry = true; A.cd = 0.25; this.world.sfx(s, 'dry'); } }
        return true;
      }
      this._dry = false;
      s.fireRound(); A.cd = A.def.rof; s._shotAt = performance.now();
      if (A.mag <= 0 && !A.def.seq) s.startReload();
      const muzzle = A.def.muzzle ? s.muzzlePos() : s.figure.rifle.localToWorld((MUZZLE[s.weapon] || MUZZLE.rifle).clone());
      // điểm đến theo tâm ngắm trên màn hình (camera), lệch theo độ tản
      const cam = this.cam, dir = this.losDir(this._ray).clone(), LK = ASSIST ? this.lock : null;
      // đang khoá: súng bắn thẳng (tức thời) nhắm vào tâm mục tiêu, đạn bay nhắm vào điểm đón đầu
      if (LK && !A.def.ball) dir.copy(LK.p).sub(cam.position).normalize();
      // bắn không qua kính (chưa áp mắt) tản rộng hơn hẳn
      const moving = s.speed > 1 ? 0.012 : 0, hip = this.sightK > 0.9 || LK ? 0 : ASSIST ? 0.005 : 0.014, spread = (s.weapon === 'gl' ? 0.006 : s.weapon === 'atr' ? 0.0006 : 0.0035) + moving + hip + this.spreadNow;
      dir.x += (Math.random() - 0.5) * spread * 2; dir.y += (Math.random() - 0.5) * spread * 2; dir.z += (Math.random() - 0.5) * spread * 2; dir.normalize();
      // súng phóng lựu tính tản trên vận tốc đầu; tia chỉ đo điểm ngắm
      const hit = LK && A.def.ball ? { point: LK.lead.clone(), dist: LK.d, target: null, sky: false } : this.traceShot(cam.position, A.def.ball ? this._ray.clone() : dir, A.def.range + 200);
      this.kick = 1; this.spreadNow = Math.min(0.03, this.spreadNow + (s.weapon === 'gl' ? 0.012 : 0.005));
      // giật súng: nòng nhích lên, lệch ngang nhẹ
      const rec = s.weapon === 'gl' ? 0.02 : s.weapon === 'atr' ? 0.007 : s.weapon === 'rpg' ? 0.024 : 0.0065;
      // phần lớn tự trở về (vai, chân chống đẩy súng lại chỗ cũ), phần nhỏ ở lại nên bắn liên tục vẫn bị bốc nòng
      this.recP += rec * 0.75; this.pitch = clamp(this.pitch + rec * 0.25, PITCH[0], PITCH[1]); this.yaw += (Math.random() - 0.5) * rec * 0.8;
      // trong trận: phát bắn đi qua hệ đạn của game (InfantryMatch), các nhánh dưới là bản phòng thử
      if (this.fireLive) { this.fireLive(s, muzzle, hit, dir); return true; }
      if (s.weapon === 'gl') {
        this.muzzleFx(s, muzzle, 'gl');
        const L = SoldierEngine.lob(muzzle, hit.point), el = this.boreFor(s, muzzle, hit.point), h = Math.hypot(L.vx, L.vz) || 1, c = Math.cos(el) * SoldierEngine.GL40.v;
        const v = new THREE.Vector3(L.vx / h * c, Math.sin(el) * SoldierEngine.GL40.v, L.vz / h * c);
        v.x += (Math.random() - 0.5) * spread * 2 * SoldierEngine.GL40.v; v.y += (Math.random() - 0.5) * spread * 2 * SoldierEngine.GL40.v; v.z += (Math.random() - 0.5) * spread * 2 * SoldierEngine.GL40.v;
        if (this.fireGrenade) this.fireGrenade(s, hit.point, muzzle, v);
        return true;
      }
      if (s.weapon === 'atr') {
        // đạn bay thật: tính góc bù từ miệng nòng tới điểm ngắm, tản trên vận tốc đầu; trúng hay không là do đường bay
        const B = A.def.ball, L = SoldierEngine.lob(muzzle, hit.point, B), el = this.boreFor(s, muzzle, hit.point), h = Math.hypot(L.vx, L.vz) || 1, c = Math.cos(el) * B.v;
        const v = new THREE.Vector3(L.vx / h * c, Math.sin(el) * B.v, L.vz / h * c);
        v.x += (Math.random() - 0.5) * spread * 2 * B.v; v.y += (Math.random() - 0.5) * spread * 2 * B.v; v.z += (Math.random() - 0.5) * spread * 2 * B.v;
        this.muzzleFx(s, muzzle, 'atr');
        this.world.sfx(s, 'atrShot');
        this.world.fireBullet({ shooter: s, from: muzzle, vel: v, onHit: r => {
          if (r.target) { this.hitT = 0.14; if (r.killed) this.kills++; this.addFlash(r.point, 0.5, 0.08, 0x9a2a1c); }
          else this.impactFx(r.point);
        } });
        return true;
      }
      if (s.weapon === 'rpg') {
        // đạn phản lực: nòng theo đường ngắm + góc chỉnh kính, tản trên hướng phóng; xa hơn cự ly chỉnh thì người bắn nâng theo vạch
        const B = A.def.ball, L = SoldierEngine.lob(muzzle, hit.point, B), el = this.boreFor(s, muzzle, hit.point), h = Math.hypot(L.vx, L.vz) || 1, c = Math.cos(el) * B.v;
        const v = new THREE.Vector3(L.vx / h * c, Math.sin(el) * B.v, L.vz / h * c);
        v.x += (Math.random() - 0.5) * spread * B.v; v.y += (Math.random() - 0.5) * spread * B.v; v.z += (Math.random() - 0.5) * spread * B.v;
        this.muzzleFx(s, muzzle, 'rpg');
        if (this.fireRocket) this.fireRocket(s, muzzle, v);
        return true;
      }
      this.world.sfx(s, 'rifle');
      this.muzzleFx(s, muzzle, 'rifle');
      this.addTracer(muzzle, hit.point);
      if (hit.target) {
        const killed = hit.target.damage(hit.zone[2] * (0.85 + Math.random() * 0.3), 'BULLET', { zone: hit.zone[0], x: hit.point.x, z: hit.point.z });
        this.hitT = 0.14;
        if (killed) this.kills++;
        this.addFlash(hit.point, 0.5, 0.08, 0x9a2a1c);
      } else if (hit.dist < A.def.range) this.impactFx(hit.point);
      return true;
    }
    // dò đường đạn từ camera: đất, nhà, rồi lính địch gần nhất trên đường
    traceShot(org, dir, range) {
      const T = this.terrain, W = this.world, s = this.soldier;
      let end = range, px = org.x, pz = org.z;
      for (let t = 4, n = 0; t < range; t += t < 1200 ? 4 : t < 4000 ? 8 : 16, n++) {
        const x = org.x + dir.x * t, y = org.y + dir.y * t, z = org.z + dir.z * t;
        if (y < T.getElevationAt(x, z)) { end = t; break; }
        if (n % 4 === 3) {
          if (y < T.getElevationAt(x, z) + 90 && T.resolveVehicleCollision && T.resolveVehicleCollision(px, pz, x, z, 0.5, null).hit) { end = t; break; }
          px = x; pz = z;
        }
      }
      let best = null, bestT = end;
      for (const o of W.soldiers) {
        if (o === s || !o.alive || !W.isEnemy(s, o)) continue;
        const F = o.figure, pts = [[ZONES[0], F.head.localToWorld(V(0, 0.72, 0))], [ZONES[1], F.chest.localToWorld(V(0, 1.9, 0))], [ZONES[2], F.hips.localToWorld(V(0, -1.15, 0))]];
        for (const [z, c] of pts) {
          const r = z[1] * o.k, ox = c.x - org.x, oy = c.y - org.y, oz = c.z - org.z, tc = ox * dir.x + oy * dir.y + oz * dir.z;
          if (tc < 0 || tc >= bestT) continue;
          const d2 = ox * ox + oy * oy + oz * oz - tc * tc;
          if (d2 < r * r) { bestT = tc; best = { o, z }; }
        }
      }
      // xe chỉ dùng để đo điểm ngắm (súng phóng lựu, súng bắn tỉa bù góc theo cự ly); trúng hay không do đường đạn thật
      if (this.aimVehicles) for (const v of this.aimVehicles()) {
        const ox = v.x - org.x, oy = (v.y || 0) + 9 - org.y, oz = v.z - org.z, tc = ox * dir.x + oy * dir.y + oz * dir.z;
        if (tc > 0 && tc < bestT && ox * ox + oy * oy + oz * oz - tc * tc < 256) { bestT = tc; best = null; }
      }
      return { point: org.clone().addScaledVector(dir, bestT), dist: bestT, target: best && best.o, zone: best && best.z, sky: !best && bestT >= range };
    }

    // ----- hiệu ứng ngắn -----
    addTracer(a, b) {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]), m = new THREE.Line(g, this._tracerMat.clone());
      m.frustumCulled = false; this.scene.add(m); this.fx.push({ m, t: 0, life: 0.06, line: true });
    }
    // đốm sáng / khói mềm (không phải khối cầu): màu vàng cộng sáng, màu khác trộn thường
    addFlash(p, r, life, color = 0xffd27a) {
      const add = color === 0xffd27a, m = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxRes().soft, color, transparent: true, opacity: 0.9, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.position.copy(p); m.scale.setScalar(r * 2.2); this.scene.add(m); this.fx.push({ m, t: 0, life, r: r * 2.2 });
    }
    // một cụm khói bay theo vận tốc v, chậm dần và nở ra
    addSmoke(p, v, r0, r1, life, op = 0.5, color = 0xb6b1a6, o = {}) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: o.map || fxRes().soft, color, transparent: true, opacity: op, depthWrite: false }));
      m.position.copy(p); m.scale.setScalar(r0); m.material.rotation = o.flat ? (Math.random() - 0.5) * 0.3 : Math.random() * 6.28; this.scene.add(m);
      this.fx.push({ m, t: 0, life, smoke: true, v: v.clone(), r0, r1, op, drag: o.drag || 3.2, lift: o.lift || 0, flat: o.flat || 1 });
    }
    // lửa đầu nòng 3D: hai mặt chéo dọc nòng + một sao nhìn thẳng, mỗi phát xoay ngẫu nhiên, tắt sau vài khung
    addPlume(p, dir, L, W, life) {
      const R = fxRes(), g = new THREE.Group(), roll = Math.random() * 3.14;
      const mk = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const m1 = mk(R.plume);
      for (let i = 0; i < 2; i++) { const q = new THREE.Mesh(R.plane, m1); q.rotation.y = roll + i * Math.PI / 2; q.scale.set(W, L, 1); g.add(q); }
      const st = new THREE.Mesh(R.plane, mk(R.star)); st.geometry = R.starG || (R.starG = new THREE.PlaneGeometry(1, 1)); st.rotation.set(-Math.PI / 2, 0, roll); st.scale.setScalar(W * 1.7); st.position.y = 0.04; g.add(st);
      g.position.copy(p); g.quaternion.setFromUnitVectors(_fup, dir); this.scene.add(g);
      this.fx.push({ m: g, t: 0, life, group: true, mats: [m1, st.material] });
    }
    // vỏ đạn văng sang phải + ra sau, nảy một lần trên đất rồi biến mất
    addCasing(p, right, dir, k = 1) {
      const R = fxRes(), m = new THREE.Mesh(R.caseGeo, R.brass); m.position.copy(p); m.scale.setScalar(k); this.scene.add(m);
      const sp = 14 + Math.random() * 6, v = right.clone().multiplyScalar(sp).addScaledVector(dir, -2 - Math.random() * 3); v.y += 7 + Math.random() * 5;
      this.fx.push({ m, t: 0, life: 1.1, cas: true, v, spin: 16 + Math.random() * 20, hops: 0 });
    }
    // sỏi đất bị luồng phụt hất lên: rơi theo trọng lực, nảy một lần rồi mất (dùng chung nhánh vỏ đạn trong stepFx)
    addChip(p, v) {
      const R = fxRes(), m = new THREE.Mesh(R.chipGeo || (R.chipGeo = new THREE.TetrahedronGeometry(0.2, 0)), R.chip || (R.chip = new THREE.MeshBasicMaterial({ color: 0x3b3529 })));
      m.position.copy(p); m.scale.setScalar(0.6 + Math.random() * 1.1); this.scene.add(m);
      this.fx.push({ m, t: 0, life: 0.9 + Math.random() * 0.6, cas: true, v, spin: 10 + Math.random() * 18, hops: 0 });
    }
    // RPG khai hoả. Liều đẩy nổ trong ống hở hai đầu nên gần như toàn bộ khí phụt ra sau: chớp trắng + lưỡi lửa ngắn sau loa, khí nóng xé ra thành nón,
    // chạm đất thì đất bụi loang ra theo hướng thổi và sỏi văng; miệng ống chỉ có vòng khói nhỏ quanh đầu đạn. Đầu đạn rời ống ~11 m mới đánh lửa (ballistics coldTo)
    rpgFx(s, muzzle, R, dir, right, up) {
      const back = R.localToWorld(new THREE.Vector3(0, 0.86, 4.42)), bd = dir.clone().negate(), T = this.terrain, jit = (a) => (Math.random() - 0.5) * a;
      if (s === this.soldier) this.shake = 1;
      this.addPlume(muzzle, dir, 1.3, 0.9, 0.045);
      this.addFlash(muzzle, 1.0, 0.05);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.283 + jit(0.6), v = right.clone().multiplyScalar(Math.cos(a) * (9 + jit(5))).addScaledVector(up, Math.sin(a) * (9 + jit(5))).addScaledVector(dir, 8 + Math.random() * 12);
        this.addSmoke(muzzle, v, 0.8, 3.4, 0.8 + Math.random() * 0.5, 0.3, 0xc4bfb3);
      }
      this.addFlash(back, 3.4, 0.08);
      this.addPlume(back, bd, 8.5, 3.4, 0.075);
      for (let i = 0; i < 3; i++) this.addPlume(back, bd.clone().add(new THREE.Vector3(jit(0.8), jit(0.8), jit(0.8))).normalize(), 3.8 + Math.random() * 2.6, 1.8, 0.06);
      // nón khí: hạt đầu nóng màu be, hạt sau xám; bay nhanh rồi bị không khí hãm lại (stepFx)
      // tốc độ rải đều từ chậm tới nhanh để các cụm gối lên nhau thành một nón liền, không rời từng cục
      for (let i = 0; i < 30; i++) {
        const q = (i + Math.random()) / 30, sp = 22 + q * 190, v = bd.clone().multiplyScalar(sp).add(new THREE.Vector3(jit(sp * 0.26), jit(sp * 0.2) + 1.5, jit(sp * 0.26)));
        this.addSmoke(back, v, 2.2 + q * 2.4, 8 + q * 7 + Math.random() * 3, 1.3 + Math.random() * 1.7, 0.36, q > 0.6 ? 0xcfc0a2 : 0xa8a397);
      }
      // điểm luồng phụt chạm đất (đứng bắn: ~4-6 m sau lưng; quỳ / ống dốc xuống: gần hơn và mạnh hơn)
      const P = new THREE.Vector3();
      for (let d = 3; T && d < 78; d += 3) {
        P.copy(back).addScaledVector(bd, d);
        const g = T.getElevationAt(P.x, P.z);
        if (P.y - g > 2.6 + d * 0.2) continue;
        P.y = g + 0.8;
        const k = 1 - d / 90, fs = this.fxSys || (typeof window !== 'undefined' && window.game && window.game.effectsManager && window.game.effectsManager.fx);
        let col = 0xb5a78c;
        try { const pal = fs && fs.surfacePalette && fs.surfacePalette(P.x, P.z, 'GROUND'); if (pal && pal.dust) col = new THREE.Color(Math.min(1, pal.dust[0] * 1.15), Math.min(1, pal.dust[1] * 1.15), Math.min(1, pal.dust[2] * 1.15)).getHex(); } catch (e) { /* giữ màu mặc định */ }
        const h = Math.hypot(bd.x, bd.z) || 1, bx = bd.x / h, bz = bd.z / h;
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * 6.283, sp = (10 + Math.random() * 84) * k, wx = Math.cos(a), wz = Math.sin(a), fw = 0.55 + Math.random() * 0.75;
          const v = new THREE.Vector3((wx + bx * fw) * sp, 1 + Math.random() * 7, (wz + bz * fw) * sp);
          this.addSmoke(P, v, 2.4, 10 + Math.random() * 9, 2 + Math.random() * 2.6, 0.2 + 0.32 * k, col);
        }
        for (let i = 0; i < 12; i++) this.addChip(P, new THREE.Vector3(bx * (12 + Math.random() * 36) + jit(26), 12 + Math.random() * 26, bz * (12 + Math.random() * 36) + jit(26)));
        break;
      }
      // khói còn rỉ ra hai đầu ống vài giây, bám theo ống khi người lính hạ xuống
      this.fx.push({ tail: true, R, t: 0, life: 2.6, next: 0.1 });
    }
    // luồng hơi hãm nòng quét mặt đất khi nằm bắn: bụi hất thành hai cánh sang bên + một vệt ra trước, rồi treo lơ lửng vài giây (dấu hiệu lộ vị trí xạ thủ)
    muzzleDust(s, muzzle, dir, right, far) {
      const T = this.terrain, gy = T.getElevationAt(muzzle.x, muzzle.z), h = muzzle.y - gy;
      if (h > 16 || (this.world.waterDepth && this.world.waterDepth(muzzle.x, muzzle.z) > 0)) return;
      // cỏ dày: rễ giữ đất, ít bụi; luồng hơi rạp cỏ hai bên nòng thành vệt (dấu vị trí khi nhìn gần)
      const grass = this.world.grassAt ? this.world.grassAt(muzzle.x, muzzle.z) : 0;
      if (this.world.flattenGrass) { this.world.flattenGrass(muzzle.x, muzzle.z, right.x, right.z, 4, 16); this.world.flattenGrass(muzzle.x + dir.x * 10, muzzle.z + dir.z * 10, dir.x, dir.z, 3, 10); }
      const k = (1 - Math.max(0, h - 3) / 13) * (1 - 0.65 * grass), map = fxRes().smoke;
      const col = new THREE.Color().copy(SoldierModel.dustColor()).multiplyScalar(1.2);   // hạt không chiếu nắng: nâng màu đất cho khớp mặt đất dưới nắng, sáng quá thành bông trắng
      const base = new THREE.Vector3(muzzle.x, gy + 0.9, muzzle.z), hex = col.getHex();
      const n = far ? 8 : 30;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, a = (Math.random() - 0.5) * 0.7;   // quạt ngang hai bên theo cửa hãm nòng
        const d = right.clone().multiplyScalar(side * Math.cos(a)).addScaledVector(dir, Math.sin(a) - 0.05).normalize();
        const sp = (40 + Math.random() * 80) * k;
        const v = d.multiplyScalar(sp); v.y = 2 + Math.random() * 7;
        const p = base.clone().addScaledVector(right, side * Math.random() * 2);
        this.addSmoke(p, v, 1.6, 8 + Math.random() * 8, 1.4 + Math.random() * 1.9, (0.4 + Math.random() * 0.18) * k, hex, { map, drag: 3.2, lift: 0.9, flat: 0.6 });
      }
      if (far) return;
      // vệt thấp ra trước nòng và làn bụi loãng treo lại
      for (let i = 0; i < 2; i++) this.addSmoke(base.clone().addScaledVector(dir, 1 + i * 2), dir.clone().multiplyScalar(30 + Math.random() * 30).add(new THREE.Vector3(0, 2 + Math.random() * 4, 0)), 1.4, 7 + Math.random() * 4, 1.2 + Math.random(), 0.34 * k, hex, { map, drag: 4, lift: 0.6, flat: 0.5 });
      for (let i = 0; i < 4; i++) this.addSmoke(base.clone().addScaledVector(right, (Math.random() - 0.5) * 14).addScaledVector(dir, Math.random() * 9), new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), 5, 18 + Math.random() * 8, 3.6 + Math.random() * 1.6, 0.2 * k, hex, { map, drag: 1, lift: 0.2, flat: 0.42 });
      // sỏi đất văng: hạt nhỏ bắn lên
      for (let i = 0; i < 8; i++) { const sd = i % 2 ? 1 : -1; this.addSmoke(base.clone().addScaledVector(right, sd * (1 + Math.random() * 3)), right.clone().multiplyScalar(sd * (20 + Math.random() * 30)).add(new THREE.Vector3(0, 12 + Math.random() * 16, 0)), 0.22, 0.34, 0.35 + Math.random() * 0.25, 0.65, 0x4b4232, { drag: 2.4, lift: -22 }); }
    }
    // toàn bộ hiệu ứng một phát bắn theo loại súng
    muzzleFx(s, muzzle, kind = s.weapon) {
      const R = s.figure.rifle; R.updateMatrixWorld(true);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(R.matrixWorld), right = new THREE.Vector3(1, 0, 0).transformDirection(R.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(R.matrixWorld);
      const puff = (n, sp, r0, r1, life, op, jit = 1.5) => { for (let i = 0; i < n; i++) this.addSmoke(muzzle, dir.clone().multiplyScalar(sp * (0.6 + Math.random() * 0.8)).add(new THREE.Vector3((Math.random() - 0.5) * jit, 0.6 + Math.random() * jit, (Math.random() - 0.5) * jit)), r0, r1, life * (0.8 + Math.random() * 0.4), op); };
      if (kind === 'gl') {
        // đạn áp suất thấp: gần như không lửa. Khí xả ra miệng nòng tạo vòng khói trắng xám, loang rất nhanh rồi lửng lơ; khe giữa ổ và nòng xì một ít; sau đó nòng còn bốc khói mảnh
        this.addPlume(muzzle, dir, 0.9, 0.6, 0.03);
        const C = this.cam, far = C && C.position.distanceTo(muzzle) > 420, map = fxRes().smoke, jit = k => new THREE.Vector3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
        const opK = s === this.soldier && this.sightK > 0.5 ? 0.75 : 1, grey = 0xa9a69d;
        for (let i = 0; i < (far ? 3 : 7); i++) { const q = i / 6; this.addSmoke(muzzle, dir.clone().multiplyScalar(5 + 34 * q).add(jit(2 + 5 * (1 - q))), 0.35 + 0.3 * q, 1.7 + 2.3 * q + Math.random() * 0.8, 0.6 + Math.random() * 0.55, (0.2 - 0.08 * q) * opK, grey, { map, drag: 8.5, lift: 1.4 }); }
        if (far) return;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * 6.28 + Math.random() * 0.5, d = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
          this.addSmoke(muzzle, d.multiplyScalar(9 + Math.random() * 6).addScaledVector(dir, 4), 0.5, 2.5 + Math.random() * 0.9, 0.55 + Math.random() * 0.45, 0.16 * opK, grey, { map, drag: 11, lift: 1.6 });
        }
        for (let i = 0; i < 2; i++) this.addSmoke(muzzle.clone().addScaledVector(dir, 1 + i * 1.3), jit(1.2), 1, 4.8, 1.7 + Math.random() * 0.5, 0.09 * opK, grey, { map, drag: 2, lift: 2.2 });
        const gap = R.localToWorld(new THREE.Vector3(0, 0.22, -1.2));
        for (const sx of [-1, 1]) this.addSmoke(gap, right.clone().multiplyScalar(sx * (7 + Math.random() * 3)).add(jit(1.5)), 0.12, 0.9, 0.35, 0.18, grey, { map, drag: 10 });
        this.wisps.push({ s, t: 2.4, T: 2.4, n: 0.2, at: () => R.localToWorld(MUZZLE.gl.clone()) });
        return;
      }
      if (kind === 'atr') {   // đạn lớn + hãm nòng: lửa ngắn phụt ngang hai bên, bụi và khói dày
        const C = this.cam, far = C && C.position.distanceTo(muzzle) > 420, map = fxRes().smoke;
        // lửa: hãm nòng ép phần lớn khí sang hai bên nên lửa ngang dài hơn lửa thẳng; tắt sau ~2 khung
        this.addPlume(muzzle, dir, 1.1, 0.7, 0.03);
        this.addFlash(muzzle, 1.7, 0.04);
        for (const sx of [-1, 1]) {
          // các cửa hãm nòng hơi xiên về sau: khí phụt ngang, hơi ngả ra sau về phía xạ thủ
          const d = right.clone().multiplyScalar(sx).addScaledVector(dir, -0.12).normalize();
          this.addPlume(muzzle, d, 3.8, 1.6, 0.04);
          // hơi xả xé ngang rất nhanh rồi khựng lại trong không khí, loang thành hai cụm khói xám
          for (let i = 0; i < (far ? 2 : 5); i++) this.addSmoke(muzzle, d.clone().multiplyScalar(70 + Math.random() * 60).add(new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 10, (Math.random() - 0.5) * 12)), 0.8, 6 + Math.random() * 3, 0.8 + Math.random() * 0.7, 0.17, 0xaba69a, { map, drag: 9, lift: 1.2 });
        }
        puff(far ? 0 : 1, 14, 0.5, 3, 0.7, 0.12);
        this.muzzleDust(s, muzzle, dir, right, far);
        if (s === this.soldier) this.shake = 0.85;   // vỏ đạn văng lúc kéo khoá (SoldierEngine ejectAtrCase), không phải lúc nổ
        return;
      }
      if (kind === 'rpg') { this.rpgFx(s, muzzle, R, dir, right, up); return; }
      // súng trường: lửa nhọn ngắn tắt trong ~1 khung, khói nhẹ, vỏ đạn bay qua cửa thoát bên phải
      this.addPlume(muzzle, dir, 1.0 + Math.random() * 0.35, 0.55, 0.035);
      puff(2, 5, 0.18, 1.1, 0.42, 0.22, 0.9);
      this.addCasing(R.localToWorld(new THREE.Vector3(0.12, 0.34, -0.2)), right, dir);
    }
    // bụi + mảnh đất nơi đạn chạm (dùng hệ nổ của game nếu có)
    impactFx(p) {
      if (this.fxSys) { try { this.fxSys.spawn(p.x, p.y, p.z, 'SCOUT_BULLET', 'GROUND', {}); return; } catch (e) { /* rơi về khói đơn giản */ } }
      for (let i = 0; i < 3; i++) this.addSmoke(p, new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 5, (Math.random() - 0.5) * 4), 0.2, 1.6, 0.6, 0.45, 0xb9a98a);
    }
    stepFx(dt) {
      // khói mảnh từ nòng / buồng vừa bắn: thưa dần rồi tắt, ở xa khỏi tốn
      for (let i = this.wisps.length - 1; i >= 0; i--) {
        const w = this.wisps[i];
        if ((w.t -= dt) <= 0 || !w.s.alive) { this.wisps.splice(i, 1); continue; }
        if ((w.n -= dt) > 0) continue;
        w.n = 0.09 + Math.random() * 0.05;
        const p = w.at();
        if (this.cam && this.cam.position.distanceTo(p) > 160) continue;
        this.addSmoke(p, new THREE.Vector3((Math.random() - 0.5) * 0.7, 1.2 + Math.random() * 0.9, (Math.random() - 0.5) * 0.7), 0.09, 0.6 + Math.random() * 0.45, 0.9 + Math.random() * 0.5, 0.2 * Math.min(1, w.t / w.T * 1.5), 0xc8c5bd, { map: fxRes().smoke, drag: 0.8, lift: 0.9 });
      }
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i]; f.t += dt;
        if (f.tail) {
          if ((f.next -= dt) <= 0) {
            f.next = 0.13 + Math.random() * 0.06; f.R.updateMatrixWorld(true);
            const op = 0.2 * (1 - f.t / f.life), wv = () => new THREE.Vector3((Math.random() - 0.5) * 2, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 2);
            this.addSmoke(f.R.localToWorld(new THREE.Vector3(0, 0.86, 4.35)), wv(), 0.22, 1.9, 1.2, op, 0xb9b4a9);
            this.addSmoke(f.R.localToWorld(new THREE.Vector3(0, 0.86, -2.7)), wv(), 0.18, 1.5, 1.0, op * 0.8, 0xb9b4a9);
          }
          if (f.t >= f.life) this.fx.splice(i, 1);
          continue;
        }
        const k = 1 - f.t / f.life;
        if (f.group) {
          for (const mt of f.mats) mt.opacity = Math.max(0, k);
          if (f.t >= f.life) { this.scene.remove(f.m); for (const mt of f.mats) mt.dispose(); this.fx.splice(i, 1); }
          continue;
        }
        if (f.cas) {
          f.v.y -= 78 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.spin * dt; f.m.rotation.z += f.spin * 0.6 * dt;
          const gy = this.terrain ? this.terrain.getElevationAt(f.m.position.x, f.m.position.z) + 0.05 : -1e9;
          if (f.m.position.y < gy) { f.m.position.y = gy; if (f.hops++ < 1) { f.v.y = Math.abs(f.v.y) * 0.3; f.v.x *= 0.45; f.v.z *= 0.45; } else f.v.set(0, 0, 0); }
          if (f.t >= f.life) { this.scene.remove(f.m); this.fx.splice(i, 1); }
          continue;
        }
        if (f.smoke) {
          f.m.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.max(0, 1 - f.drag * dt)); f.v.y += f.lift * dt;
          const u = f.t / f.life, sz = f.r0 + (f.r1 - f.r0) * Math.sqrt(u);
          f.m.scale.set(sz, sz * f.flat, 1);
          // khói sát camera mờ đi: camera sau lưng nằm đúng trong luồng phụt, không để phủ kín màn hình
          const dc = this.cam ? f.m.position.distanceTo(this.cam.position) : 1e9, nearK = dc < sz * 1.6 ? Math.max(0.12, (dc - sz * 0.3) / (sz * 1.3)) : 1;
          f.m.material.opacity = Math.max(0, f.op * nearK * (1 - u) * Math.min(1, u * 12 + 0.4));
          if (f.t >= f.life) { this.scene.remove(f.m); f.m.material.dispose(); this.fx.splice(i, 1); }
          continue;
        }
        f.m.material.opacity = Math.max(0, k * 0.9);
        if (f.r) f.m.scale.setScalar(f.r * (1 + (1 - k) * 0.8));
        if (f.t >= f.life) { this.scene.remove(f.m); f.m.material.dispose(); if (f.line) f.m.geometry.dispose(); this.fx.splice(i, 1); }
      }
    }
  }

  // ----- TRANG BỊ -----
  const LOADOUT_KEY = 'tankwar.soldierLoadout';
  const DEFAULT_LOADOUT = { weapon: 'rifle', weapons: null, team: 'BLUE', biome: null, gear: { goggles: true, tags: true, pouches: true, backPanel: true, radio: true } };
  function loadLoadout() {
    const L = JSON.parse(JSON.stringify(DEFAULT_LOADOUT));
    try { const raw = localStorage.getItem(LOADOUT_KEY); if (raw) { const o = JSON.parse(raw); Object.assign(L, o); L.gear = Object.assign({}, DEFAULT_LOADOUT.gear, o.gear); } } catch (e) { /* trình duyệt chặn lưu trữ: dùng mặc định */ }
    return L;
  }
  // vũ khí từng lính trong tổ (mỗi lính đúng 1 món); chưa chọn thì lính 1 theo weapon cũ, còn lại món đầu danh sách
  function squadWeapons(L) {
    const w = Array.isArray(L.weapons) ? L.weapons : [];
    const ok = x => (Equipment.SQUAD_WEAPONS.includes(x) ? x : null);
    return [0, 1, 2, 3].map(i => ok(w[i]) || (i === 0 && ok(L.weapon)) || Equipment.SQUAD_WEAPONS[0]);
  }
  // bộ ngụy trang cỏ từng lính; chưa chọn riêng thì theo công tắc cũ của cả tổ (L.ghillie)
  function squadGhillie(L) {
    const g = Array.isArray(L.ghillies) ? L.ghillies : [];
    return [0, 1, 2, 3].map(i => (typeof g[i] === 'boolean' ? g[i] : L.ghillie !== false));
  }
  // bộ y tế từng lính; chưa chọn riêng thì mang (chỉ có tác dụng khi đã mở khóa)
  function squadMedkit(L) {
    const m = Array.isArray(L.medkits) ? L.medkits : [];
    return [0, 1, 2, 3].map(i => m[i] !== false);
  }
  function saveLoadout(L) { try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(L)); } catch (e) { /* bỏ qua */ } }

  return { Controller, SIGHTS, ASSIST, LOCK, loadLoadout, saveLoadout, squadWeapons, squadGhillie, squadMedkit, DEFAULT_LOADOUT, boreElev, holdAt, ZERO };
})();

if (typeof window !== 'undefined') window.SoldierPlayer = SoldierPlayer;
