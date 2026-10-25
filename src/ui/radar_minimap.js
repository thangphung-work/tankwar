/**
 * MINIMAP RADAR (góc trên trái): vòng tròn lấy xe mình làm tâm, hướng Bắc lên trên, chỉ phủ đúng vùng xe QUAN SÁT ĐƯỢC
 * (tầm nhìn / bán kính radar — TeamIntel). Ngoài vòng không vẽ gì (trước đây vẽ cả bản đồ, kể cả chấm lộ vị trí mọi phát
 * bắn ở bất cứ đâu), trừ các chấm chỉ hướng trên mép vòng:
 * - cứ điểm A/B/C, hòm thả dù, điểm ngắm / điểm rơi ở xa (pháo tự hành bắn xa ngoài tầm nhìn)
 * - BỊ BẮN: vùng cảnh báo nơi kẻ bắn có thể đang đứng. Đang thấy kẻ bắn: vòng nhỏ đúng chỗ; không thấy: vòng lớn ~25% cự ly
 *   bao quanh vị trí thật (tâm lệch ngẫu nhiên), mỗi phát trúng tiếp từ cùng kẻ đó khoanh hẹp dần. Vùng nằm ngoài vòng
 *   radar: cung đỏ trên mép vòng đúng hướng + cự ly
 * Nền: vùng vuông quanh xe dựng riêng ở độ phân giải cao (tactical_map.js paintTerrain, nội suy bậc ba) — nền bản đồ tác
 * chiến 512 px cho cả bản đồ 16 km (~32 m/điểm ảnh) phóng lên minimap bị nhòe thành vệt. Canvas theo devicePixelRatio,
 * mọi kích thước vẽ tính theo điểm ảnh CSS (size()).
 * Tọa độ màn hình <-> thế giới cho nhấp chuột (khóa xe / lái tới) dùng chung view() — xem tactical_map.js
 */
const RadarMinimap = (() => {
  const TWO_PI = Math.PI * 2;
  const RIM = 10;              // px dải viền la bàn ngoài vòng radar (vạch chia độ, chữ B/Đ/N/T)
  const THREAT_TTL = 10;       // giây vùng cảnh báo còn hiện (mờ dần 3 s cuối)
  const threats = new Map();   // id kẻ bắn -> { x, z, r, t, exact }
  const C = { red: '255,77,61', amber: '#e7a63a', blue: '#5fb0dc', redCp: '#e0675c', ink: 'rgba(223,228,217,' };
  const MONO = '"JetBrains Mono", "Share Tech Mono", monospace', TECH = '"Chakra Petch", sans-serif';

  const now = () => performance.now() / 1000;
  const fmtD = (d) => d >= 1000 ? (d / 1000).toFixed(1) + 'K' : Math.round(d) + '';

  // Bán kính quan sát của xe (đơn vị game): tầm nhìn, xe có radar lấy bán kính radar nếu xa hơn
  function viewRange(P) {
    if (typeof TeamIntel === 'undefined') return 600;
    let R = TeamIntel.sightRange(P);
    if (TeamIntel.hasRadar(P)) R = Math.max(R, TeamIntel.radarRange(P));
    return R;
  }

  // Cạnh canvas theo điểm ảnh CSS (bộ đệm canvas = cạnh này x devicePixelRatio)
  function size(cv) { return cv._mmL || cv.width; }

  function view(g, cv) {
    const P = g.player, W = size(cv), H = W;
    const cx = W / 2, cy = H / 2, Rpx = Math.min(W, H) / 2 - RIM, Rw = viewRange(P), s = Rpx / Rw;
    return { P, W, H, cx, cy, Rpx, Rw, s, toScreen: (x, z) => ({ x: cx + (x - P.x) * s, y: cy + (z - P.z) * s }) };
  }

  // Bộ đệm canvas khớp kích thước hiển thị x devicePixelRatio (chữ, nét không nhòe trên màn hình độ phân giải cao)
  function fitCanvas(cv) {
    const css = Math.round(cv.clientWidth || cv._mmL || cv.width);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const px = Math.round(css * dpr);
    if (cv._mmL !== css || cv.width !== px) { cv._mmL = css; cv.width = cv.height = px; }
    return px / css;
  }

  // ---------------------------------------------------------------------------
  // NỀN CỤC BỘ quanh xe: vùng vuông cạnh 3 x bán kính quan sát, độ phân giải đúng bằng điểm ảnh thiết bị của minimap.
  // Xe đi xa tâm vùng > 0.45 x bán kính (hoặc đổi tầm nhìn / bản đồ / tỉ lệ màn hình) thì dựng vùng mới; việc dựng chia
  // nhiều chặng (paintTerrain là generator), mỗi khung chạy ~2.5 ms; vùng cũ (hoặc nền bản đồ tác chiến) dùng tới khi xong
  // ---------------------------------------------------------------------------
  const local = { ready: null, job: null };
  function localBase(g, V, k) {
    const tm = g.tacticalMap, T = g.terrain;
    if (!tm || !tm.paintTerrain || !T || !T.map || !T.heightData) return null;
    const P = V.P, cur = local.ready;
    const covers = (b) => b && b.map === T.map && Math.abs(b.Rw - V.Rw) < 1 && b.k === k
      && Math.max(Math.abs(P.x - b.cx), Math.abs(P.z - b.cz)) + V.Rw <= b.span / 2;
    const stale = !cur || cur.map !== T.map || Math.abs(cur.Rw - V.Rw) >= 1 || cur.k !== k || Math.hypot(P.x - cur.cx, P.z - cur.cz) > V.Rw * 0.45;
    if (local.job && (local.job.out.map !== T.map || local.job.out.k !== k || Math.abs(local.job.out.Rw - V.Rw) >= 1)) local.job = null;
    if (stale && !local.job) {
      const span = V.Rw * 3, N = Math.min(900, Math.ceil(V.Rpx * 3 * k));
      const c = document.createElement('canvas'); c.width = c.height = N;
      const out = { canvas: c, cx: P.x, cz: P.z, x0: P.x - span / 2, z0: P.z - span / 2, span, N, Rw: V.Rw, k, map: T.map };
      local.job = { out, it: tm.paintTerrain(c.getContext('2d'), out.x0, out.z0, span, N, { smooth: true, lw: k }) };
    }
    if (local.job) {
      try {
        if (TacticalMapController.runFor(local.job.it, 2.5)) { local.ready = local.job.out; local.job = null; }
      } catch (e) { local.job = null; }
    }
    return covers(local.ready) ? local.ready : null;
  }

  // Xe mình trúng đạn của kẻ địch: ghi / thu hẹp vùng cảnh báo quanh kẻ bắn
  function noteHit(P, attacker) {
    if (!P || !attacker || attacker === P || attacker.team === P.team || attacker.x === undefined) return;
    const seen = typeof TeamIntel === 'undefined' || TeamIntel.knows(P, attacker);
    const d = Math.hypot(attacker.x - P.x, attacker.z - P.z);
    const T = threats.get(attacker.id);
    let r = seen ? 30 : Math.max(60, d * 0.25);
    if (T && !seen) r = Math.max(45, Math.min(r, T.r * 0.7));
    const ea = Math.random() * TWO_PI, er = seen ? 0 : Math.sqrt(Math.random()) * r * 0.7;
    threats.set(attacker.id, { x: attacker.x + Math.cos(ea) * er, z: attacker.z + Math.sin(ea) * er, r, t: now(), exact: seen });
  }

  function reset() { threats.clear(); local.ready = null; local.job = null; }

  // chữ có viền tối (đọc được trên mọi nền)
  function label(ctx, txt, x, y, col, font) {
    ctx.font = font || `600 8px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = col;
    ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
  }

  // Chấm chỉ hướng trên mép vòng (điểm nằm ngoài vùng quan sát): hình + chữ cự ly phía trong
  function rimMark(ctx, V, x, z, draw, txt, col) {
    const a = Math.atan2(z - V.P.z, x - V.P.x), r = V.Rpx - 6;
    const mx = V.cx + Math.cos(a) * r, my = V.cy + Math.sin(a) * r;
    draw(mx, my, a);
    if (txt) label(ctx, txt, V.cx + Math.cos(a) * (r - 14), V.cy + Math.sin(a) * (r - 11), col);
  }

  function render(g, ctx, cv, base) {
    const k = fitCanvas(cv);
    const V = view(g, cv), { P, W, H, cx, cy, Rpx, Rw, s, toScreen } = V;
    const half = g.worldWidth / 2, halfD = (g.worldDepth || g.worldWidth) / 2, tn = now();
    const inside = (x, z) => Math.hypot(x - P.x, z - P.z) <= Rw;
    if (P.isDead) threats.clear();
    for (const [id, T] of threats) if (tn - T.t > THREAT_TTL) threats.delete(id);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, TWO_PI); ctx.clip();
    ctx.fillStyle = '#0d100d'; ctx.fillRect(0, 0, W, H);
    // nền địa hình: vùng nét cao quanh xe; chưa có thì cắt ô vuông quanh xe từ nền bản đồ tác chiến (phủ cả bản đồ)
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const LB = localBase(g, V, k);
    if (LB) {
      const q = LB.N / LB.span;
      ctx.drawImage(LB.canvas, (P.x - Rw - LB.x0) * q, (P.z - Rw - LB.z0) * q, Rw * 2 * q, Rw * 2 * q, cx - Rpx, cy - Rpx, Rpx * 2, Rpx * 2);
    } else if (base && base.width) {
      const bx = base.width / g.worldWidth, by = base.height / (halfD * 2);
      ctx.drawImage(base, (P.x + half - Rw) * bx, (P.z + halfD - Rw) * by, Rw * 2 * bx, Rw * 2 * by, cx - Rpx, cy - Rpx, Rpx * 2, Rpx * 2);
    }
    // phủ tối nhẹ ở giữa, đậm dần ra mép (nổi khối, chấm chỉ hướng trên mép dễ đọc)
    {
      const vg = ctx.createRadialGradient(cx, cy, Rpx * 0.35, cx, cy, Rpx);
      vg.addColorStop(0, 'rgba(6,9,7,0.12)'); vg.addColorStop(0.75, 'rgba(6,9,7,0.28)'); vg.addColorStop(1, 'rgba(6,9,7,0.62)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    // vòng cự ly nửa bán kính + chữ thập mảnh
    ctx.strokeStyle = C.ink + '0.13)'; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.arc(cx, cy, Rpx / 2, 0, TWO_PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - Rpx); ctx.lineTo(cx, cy + Rpx); ctx.moveTo(cx - Rpx, cy); ctx.lineTo(cx + Rpx, cy); ctx.stroke();

    // lớp vẽ theo tọa độ bản đồ đầy đủ ((x + nửa bản đồ) * tỉ lệ): dấu chớp lửa phát bắn trong vùng nhìn
    ctx.save();
    ctx.translate(cx - (P.x + half) * s, cy - (P.z + halfD) * s);
    if (g.radar) g.radar.renderOnTacticalMap(ctx, s);
    ctx.restore();

    // bụi rậm ngụy trang (chỗ núp)
    if (g.terrain && g.terrain.bushClusters) {
      ctx.fillStyle = 'rgba(64,140,58,0.24)'; ctx.strokeStyle = 'rgba(120,196,104,0.4)'; ctx.lineWidth = 0.75;
      ctx.setLineDash([2, 2]);
      for (const bc of g.terrain.bushClusters) {
        if (Math.hypot(bc.x - P.x, bc.z - P.z) > Rw + bc.radius) continue;
        const b = toScreen(bc.x, bc.z);
        ctx.beginPath(); ctx.arc(b.x, b.y, bc.radius * s, 0, TWO_PI); ctx.fill(); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // cứ điểm trong vùng nhìn: vùng chiếm phủ màu phe + nhãn tròn
    const cpCol = (cp) => { const o = String(cp.owner || '').toUpperCase(); return o === 'BLUE' ? C.blue : o === 'RED' ? C.redCp : '#e8e8e0'; };
    const cpBadge = (x, y, cp, col) => {
      ctx.fillStyle = 'rgba(10,13,12,0.88)'; ctx.strokeStyle = col; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TWO_PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.font = `700 8px ${TECH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cp.id, x, y + 0.5);
    };
    const cps = g.capturePoints || [];
    for (const cp of cps) {
      if (Math.hypot(cp.x - P.x, cp.z - P.z) > Rw + cp.radius) continue;
      const c = toScreen(cp.x, cp.z), col = cpCol(cp);
      ctx.save();
      ctx.globalAlpha = 0.14; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(c.x, c.y, cp.radius * s, 0, TWO_PI); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = col; ctx.lineWidth = cp.isDisputed ? 1.6 : 1.1;
      ctx.setLineDash(cp.isDisputed ? [3, 2] : []);
      ctx.beginPath(); ctx.arc(c.x, c.y, cp.radius * s, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      cpBadge(c.x, c.y, cp, col);
    }

    // hòm tiếp tế
    for (const crate of g.supplyCrates || []) {
      if (!crate.active || !inside(crate.x, crate.z)) continue;
      const c = toScreen(crate.x, crate.z);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(c.x, c.y, 5 + Math.sin(tn * 8 + crate.x) * 1.5, 0, TWO_PI); ctx.stroke();
      ctx.fillStyle = C.amber; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.fillRect(c.x - 2.5, c.y - 2.5, 5, 5); ctx.strokeRect(c.x - 3, c.y - 3, 6, 6);
    }
    // điểm tiếp tế hậu phương 2 phe (supply_depot.js)
    if (typeof SupplyDepot !== 'undefined') SupplyDepot.drawOnMap(ctx, g, toScreen, s, { inside, size: 4.5 });
    const AD = g.airdrop && !g.airdrop.collected ? g.airdrop : null;
    if (AD && inside(AD.x, AD.z)) {
      const c = toScreen(AD.x, AD.z);
      ctx.fillStyle = C.amber; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.5, 0, TWO_PI); ctx.fill(); ctx.stroke();
    }

    if (g.drawAutoDrivePath) g.drawAutoDrivePath(ctx, toScreen, false);

    // tầm bắn tối đa (chỉ thấy khi nằm trong vùng nhìn — súng bắn thẳng)
    const maxR = g.ballistics && g.ballistics.maxRangeFor ? g.ballistics.maxRangeFor(P) : 0;
    if (maxR > 0 && maxR < Rw) {
      ctx.strokeStyle = 'rgba(231,166,58,0.32)'; ctx.lineWidth = 0.9; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, maxR * s, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
    }
    // đường dẫn bắn tới điểm rơi dự kiến (đường đạn của khung hình hiện tại)
    const L = g._lastTraj && !g._lastTraj.out && !P.isDead ? g._lastTraj : null;
    if (L) {
      const col = L.wall ? '#e0675c' : C.amber, i = toScreen(L.x, L.z);
      ctx.strokeStyle = L.wall ? 'rgba(255,59,48,0.7)' : 'rgba(231,166,58,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(i.x, i.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(i.x, i.y, 3.5, 0, TWO_PI); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(i.x, i.y, 3.5, 0, TWO_PI); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(i.x, i.y, 1.3, 0, TWO_PI); ctx.fill();
    }

    // hình quạt hướng camera: sáng ở gốc, mờ dần ra xa (vẽ dưới các xe)
    {
      const yaw = g._camYaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const hf = g.camera ? Math.atan(Math.tan(g.camera.fov * Math.PI / 360) * g.camera.aspect) : 0.6, Lc = Rpx * 0.62;
      const a0 = Math.atan2(fz, fx);
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Lc);
      fg.addColorStop(0, 'rgba(235,250,255,0.34)'); fg.addColorStop(1, 'rgba(235,250,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Lc, a0 - hf, a0 + hf); ctx.closePath(); ctx.fill();
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Lc);
      eg.addColorStop(0, 'rgba(235,250,255,0.55)'); eg.addColorStop(1, 'rgba(235,250,255,0)');
      ctx.strokeStyle = eg; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0 - hf) * Lc, cy + Math.sin(a0 - hf) * Lc);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0 + hf) * Lc, cy + Math.sin(a0 + hf) * Lc);
      ctx.stroke();
    }

    // xe 2 phe (chỉ xe mình biết — TeamIntel) + drone đang bay; xe mình vẽ biểu tượng riêng ở dưới
    if (typeof TeamIntel !== 'undefined') TeamIntel.drawOnMap(ctx, P, g.units, toScreen, s, { dot: 3.4, playerDot: 0, outline: true, sightRing: false });
    if (g.drawDronesOnMap) g.drawDronesOnMap(ctx, toScreen, false);

    // xe địch đang khóa: khung khóa đỏ (vàng khi đang ngắm tay)
    const LT = g.lockedTarget, lp = LT && !LT.isDead && g.tacticalMap && g.tacticalMap.shownPos ? g.tacticalMap.shownPos(LT) : null;
    if (lp) {
      const l = toScreen(lp.x, lp.z), r = 7.5, kk = 3;
      const brackets = () => {
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.moveTo(l.x + sx * r, l.y + sy * (r - kk)); ctx.lineTo(l.x + sx * r, l.y + sy * r); ctx.lineTo(l.x + sx * (r - kk), l.y + sy * r);
        }
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3; brackets();
      ctx.strokeStyle = g._manualAim ? C.amber : '#ff4d4d'; ctx.lineWidth = 1.5; brackets();
      ctx.lineCap = 'butt';
    }
    // điểm neo ngắm bắn (chữ thập vàng / xanh khi đã ngắm trúng)
    const AP = g._aimPoint;
    if (AP) {
      const a = toScreen(AP.x, AP.z);
      ctx.strokeStyle = g._aimState === 'on' ? '#5cf08a' : '#ffb020'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, TWO_PI);
      ctx.moveTo(a.x - 7, a.y); ctx.lineTo(a.x - 2, a.y); ctx.moveTo(a.x + 2, a.y); ctx.lineTo(a.x + 7, a.y);
      ctx.moveTo(a.x, a.y - 7); ctx.lineTo(a.x, a.y - 2); ctx.moveTo(a.x, a.y + 2); ctx.lineTo(a.x, a.y + 7);
      ctx.stroke();
    }

    // VÙNG CẢNH BÁO kẻ bắn nằm trong vùng nhìn
    for (const T of threats.values()) {
      if (Math.hypot(T.x - P.x, T.z - P.z) > Rw + T.r) continue;
      const age = tn - T.t, fade = Math.min(1, (THREAT_TTL - age) / 3), pulse = 0.5 + 0.5 * Math.sin(tn * 7);
      const c = toScreen(T.x, T.z), rr = Math.max(5, T.r * s);
      ctx.fillStyle = `rgba(${C.red},${(0.1 + 0.1 * pulse) * fade})`;
      ctx.strokeStyle = `rgba(${C.red},${0.9 * fade})`; ctx.lineWidth = 1.3; ctx.setLineDash(T.exact ? [] : [3, 2]);
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, TWO_PI); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      if (age < 0.7) {   // vừa trúng đạn: vòng sáng thu lại
        ctx.strokeStyle = `rgba(${C.red},${1 - age / 0.7})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, rr + (1 - age / 0.7) * 16, 0, TWO_PI); ctx.stroke();
      }
      label(ctx, '!', c.x, c.y, `rgba(${C.red},${fade})`, `700 10px ${MONO}`);
    }

    // XE MÌNH: mũi tên theo hướng nòng (màu phe, viền trắng) + chấm tâm
    if (!P.isDead) {
      const br = (P.azimuth || 0) * Math.PI / 180, col = P.team === 'RED' ? '#ff5a4a' : '#22d3f0';
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(br);
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 5.5); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 5.5); ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = '#f4fdff'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = C.ink + '0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4); ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4); ctx.stroke();
    }
    ctx.restore();   // hết vùng cắt tròn

    // VIỀN LA BÀN: dải tối quanh vòng, vạch mỗi 15° (dài hơn mỗi 45°), chữ B/Đ/N/T (B màu hổ phách)
    {
      const ro = Rpx + RIM - 0.5;
      ctx.fillStyle = 'rgba(9,11,10,0.86)';
      ctx.beginPath(); ctx.arc(cx, cy, ro, 0, TWO_PI); ctx.arc(cx, cy, Rpx, 0, TWO_PI, true); ctx.fill();
      ctx.strokeStyle = C.ink + '0.42)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, TWO_PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(cx, cy, ro, 0, TWO_PI); ctx.stroke();
      for (let i = 0; i < 24; i++) {
        if (i % 6 === 0) continue;   // chỗ chữ hướng
        const a = i * Math.PI / 12 - Math.PI / 2, big = i % 3 === 0, r0 = Rpx + 2, r1 = Rpx + (big ? 5.5 : 3.5);
        ctx.strokeStyle = C.ink + (big ? '0.55)' : '0.3)'); ctx.lineWidth = big ? 1 : 0.75;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
      }
      const rm = Rpx + RIM / 2;
      ctx.font = `700 8px ${TECH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [['B', 0, C.amber], ['Đ', 1, C.ink + '0.7)'], ['N', 2, C.ink + '0.7)'], ['T', 3, C.ink + '0.7)']].forEach(([t, q, col]) => {
        const a = q * Math.PI / 2 - Math.PI / 2;
        ctx.fillStyle = col; ctx.fillText(t, cx + Math.cos(a) * rm, cy + Math.sin(a) * rm + 0.5);
      });
    }

    // bán kính vùng quan sát: huy hiệu HTML trên viền góc 7h30 (.hx-map-range, đối xứng nút M) — không che chấm chỉ hướng
    if (cv._mmRange === undefined) cv._mmRange = cv.parentElement && cv.parentElement.querySelector('.hx-map-range');
    if (cv._mmRange) {
      const t = Math.round(Rw) + 'M';
      if (cv._mmRange.textContent !== t) cv._mmRange.textContent = t;
    }

    // CHẤM CHỈ HƯỚNG trên mép: cứ điểm, hòm thả dù, điểm rơi / điểm ngắm ở xa
    for (const cp of cps) {
      if (Math.hypot(cp.x - P.x, cp.z - P.z) <= Rw) continue;
      rimMark(ctx, V, cp.x, cp.z, (mx, my) => cpBadge(mx, my, cp, cpCol(cp)), null);
    }
    if (AD && !inside(AD.x, AD.z)) {
      rimMark(ctx, V, AD.x, AD.z, (mx, my) => {
        ctx.fillStyle = C.amber; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx, my - 4.5); ctx.lineTo(mx + 4.5, my); ctx.lineTo(mx, my + 4.5); ctx.lineTo(mx - 4.5, my); ctx.closePath(); ctx.fill(); ctx.stroke();
      }, null);
    }
    const far = L && !inside(L.x, L.z) ? { x: L.x, z: L.z, col: L.wall ? '#e0675c' : C.amber } : AP && !inside(AP.x, AP.z) ? { x: AP.x, z: AP.z, col: '#ffb020' } : null;
    if (far) {
      rimMark(ctx, V, far.x, far.z, (mx, my, a) => {
        ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
        ctx.strokeStyle = far.col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(3, 0); ctx.lineTo(-2, 4); ctx.stroke();
        ctx.restore();
      }, fmtD(Math.hypot(far.x - P.x, far.z - P.z)), far.col);
    }
    // lệnh bộ đàm của đồng đội (quick_comms.js): trong vùng nhìn vẽ đúng chỗ, ngoài vùng thành chấm chỉ hướng trên mép
    if (typeof QuickComms !== 'undefined') {
      QuickComms.drawOnMap(ctx, toScreen, { inside, rim: (x, z, draw, txt, col) => rimMark(ctx, V, x, z, draw, txt, col) });
    }

    // VÙNG CẢNH BÁO ngoài vùng nhìn: cung đỏ trên mép vòng phủ đúng góc của vùng + mũi tên + cự ly
    for (const T of threats.values()) {
      const d = Math.hypot(T.x - P.x, T.z - P.z);
      if (d <= Rw + T.r) continue;
      const age = tn - T.t, fade = Math.min(1, (THREAT_TTL - age) / 3), pulse = 0.5 + 0.5 * Math.sin(tn * 7);
      const a = Math.atan2(T.z - P.z, T.x - P.x), hw = Math.max(0.12, Math.min(0.6, Math.asin(Math.min(1, T.r / d))));
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${C.red},${(0.55 + 0.45 * pulse) * fade})`; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(cx, cy, Rpx + RIM / 2, a - hw, a + hw); ctx.stroke();
      ctx.lineCap = 'butt';
      rimMark(ctx, V, T.x, T.z, (mx, my) => {
        ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
        ctx.fillStyle = `rgba(${C.red},${fade})`; ctx.strokeStyle = `rgba(0,0,0,${0.6 * fade})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-5, -4); ctx.lineTo(-3, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }, fmtD(d), `rgba(${C.red},${fade})`);
    }

  }

  // Nhấp chuột lên minimap (tọa độ điểm ảnh CSS của canvas) -> tọa độ thế giới
  function toWorld(g, cv, px, py) {
    const V = view(g, cv);
    return { x: V.P.x + (px - V.cx) / V.s, z: V.P.z + (py - V.cy) / V.s };
  }

  // vùng cảnh báo kẻ bắn (thước la bàn compass_tape.js vẽ vệt đỏ đúng hướng): Map id -> { x, z, r, t, exact }
  // busy(): đang dựng nền cục bộ (game.js nhường khung hình, chưa dựng nền bản đồ tác chiến)
  return { render, noteHit, reset, view, toWorld, viewRange, size, threats: () => threats, THREAT_TTL, busy: () => !!local.job };
})();

if (typeof window !== 'undefined') window.RadarMinimap = RadarMinimap;
