/**
 * MINIMAP RADAR (góc trên trái): vòng tròn lấy xe mình làm tâm, hướng Bắc lên trên, chỉ phủ đúng vùng xe QUAN SÁT ĐƯỢC
 * (tầm nhìn / bán kính radar — TeamIntel). Ngoài vòng không vẽ gì (trước đây vẽ cả bản đồ, kể cả chấm lộ vị trí mọi phát
 * bắn ở bất cứ đâu), trừ các chấm chỉ hướng trên mép vòng:
 * - cứ điểm A/B/C, hòm thả dù, điểm ngắm / điểm rơi ở xa (pháo tự hành bắn xa ngoài tầm nhìn)
 * - BỊ BẮN: vùng cảnh báo nơi kẻ bắn có thể đang đứng. Đang thấy kẻ bắn: vòng nhỏ đúng chỗ; không thấy: vòng lớn ~25% cự ly
 *   bao quanh vị trí thật (tâm lệch ngẫu nhiên), mỗi phát trúng tiếp từ cùng kẻ đó khoanh hẹp dần. Vùng nằm ngoài vòng
 *   radar: cung đỏ trên mép vòng đúng hướng + cự ly
 * Tọa độ màn hình <-> thế giới cho nhấp chuột (khóa xe / lái tới) dùng chung view() — xem tactical_map.js
 */
const RadarMinimap = (() => {
  const TWO_PI = Math.PI * 2;
  const RIM = 7;               // px dải viền ngoài vòng radar (vạch chia độ, chấm chỉ hướng)
  const THREAT_TTL = 10;       // giây vùng cảnh báo còn hiện (mờ dần 3 s cuối)
  const threats = new Map();   // id kẻ bắn -> { x, z, r, t, exact }
  const C = { red: '255,77,61', amber: '#e7a63a', blue: '#5fb0dc', redCp: '#e0675c', ink: 'rgba(223,228,217,' };

  const now = () => performance.now() / 1000;
  const fmtD = (d) => d >= 1000 ? (d / 1000).toFixed(1) + 'K' : Math.round(d) + '';

  // Bán kính quan sát của xe (đơn vị game): tầm nhìn, xe có radar lấy bán kính radar nếu xa hơn
  function viewRange(P) {
    if (typeof TeamIntel === 'undefined') return 600;
    let R = TeamIntel.sightRange(P);
    if (TeamIntel.hasRadar(P)) R = Math.max(R, TeamIntel.radarRange(P));
    return R;
  }

  function view(g, cv) {
    const P = g.player, W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, Rpx = Math.min(W, H) / 2 - RIM, Rw = viewRange(P), s = Rpx / Rw;
    return { P, W, H, cx, cy, Rpx, Rw, s, toScreen: (x, z) => ({ x: cx + (x - P.x) * s, y: cy + (z - P.z) * s }) };
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

  function reset() { threats.clear(); }

  // Chấm chỉ hướng trên mép vòng (điểm nằm ngoài vùng quan sát): hình + chữ cự ly phía trong
  function rimMark(ctx, V, x, z, draw, label, col) {
    const a = Math.atan2(z - V.P.z, x - V.P.x), r = V.Rpx - 5;
    const mx = V.cx + Math.cos(a) * r, my = V.cy + Math.sin(a) * r;
    draw(mx, my, a);
    if (label) {
      ctx.font = '8px Share Tech Mono, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = col;
      const tx = V.cx + Math.cos(a) * (r - 13), ty = V.cy + Math.sin(a) * (r - 11);
      ctx.strokeText(label, tx, ty); ctx.fillText(label, tx, ty);
    }
  }

  function render(g, ctx, cv, base) {
    const V = view(g, cv), { P, W, H, cx, cy, Rpx, Rw, s, toScreen } = V;
    const half = g.worldWidth / 2, halfD = (g.worldDepth || g.worldWidth) / 2, tn = now();
    const inside = (x, z) => Math.hypot(x - P.x, z - P.z) <= Rw;
    if (P.isDead) threats.clear();
    for (const [id, T] of threats) if (tn - T.t > THREAT_TTL) threats.delete(id);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, TWO_PI); ctx.clip();
    ctx.fillStyle = '#0d100d'; ctx.fillRect(0, 0, W, H);
    // nền địa hình: cắt đúng ô vuông quanh xe từ nền bản đồ tác chiến (phủ cả bản đồ)
    if (base && base.width) {
      const bx = base.width / g.worldWidth, by = base.height / (halfD * 2);
      ctx.drawImage(base, (P.x + half - Rw) * bx, (P.z + halfD - Rw) * by, Rw * 2 * bx, Rw * 2 * by, cx - Rpx, cy - Rpx, Rpx * 2, Rpx * 2);
      ctx.fillStyle = 'rgba(6,9,7,0.3)'; ctx.fillRect(0, 0, W, H);
    }
    // vòng cự ly nửa bán kính + chữ thập mảnh
    ctx.strokeStyle = C.ink + '0.16)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, Rpx / 2, 0, TWO_PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - Rpx); ctx.lineTo(cx, cy + Rpx); ctx.moveTo(cx - Rpx, cy); ctx.lineTo(cx + Rpx, cy); ctx.stroke();
    ctx.setLineDash([]);

    // lớp vẽ theo tọa độ bản đồ đầy đủ ((x + nửa bản đồ) * tỉ lệ): dấu chớp lửa phát bắn trong vùng nhìn
    ctx.save();
    ctx.translate(cx - (P.x + half) * s, cy - (P.z + halfD) * s);
    if (g.radar) g.radar.renderOnTacticalMap(ctx, s);
    ctx.restore();

    // bụi rậm ngụy trang (chỗ núp)
    if (g.terrain && g.terrain.bushClusters) {
      ctx.fillStyle = 'rgba(46,125,50,0.28)'; ctx.strokeStyle = 'rgba(76,175,80,0.45)'; ctx.lineWidth = 1;
      for (const bc of g.terrain.bushClusters) {
        if (Math.hypot(bc.x - P.x, bc.z - P.z) > Rw + bc.radius) continue;
        const b = toScreen(bc.x, bc.z);
        ctx.beginPath(); ctx.arc(b.x, b.y, bc.radius * s, 0, TWO_PI); ctx.fill(); ctx.stroke();
      }
    }

    // cứ điểm trong vùng nhìn
    const cpCol = (cp) => { const o = String(cp.owner || '').toUpperCase(); return o === 'BLUE' ? C.blue : o === 'RED' ? C.redCp : '#ffffff'; };
    const cps = g.capturePoints || [];
    for (const cp of cps) {
      if (Math.hypot(cp.x - P.x, cp.z - P.z) > Rw + cp.radius) continue;
      const c = toScreen(cp.x, cp.z), col = cpCol(cp);
      ctx.strokeStyle = col; ctx.lineWidth = cp.isDisputed ? 2 : 1.2;
      ctx.setLineDash(cp.isDisputed ? [3, 2] : []);
      ctx.beginPath(); ctx.arc(c.x, c.y, cp.radius * s, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 7px Chakra Petch'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cp.id, c.x, c.y);
    }

    // hòm tiếp tế
    for (const crate of g.supplyCrates || []) {
      if (!crate.active || !inside(crate.x, crate.z)) continue;
      const c = toScreen(crate.x, crate.z);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.2 + Math.sin(tn * 8 + crate.x) * 1.5, 0, TWO_PI); ctx.stroke();
      ctx.fillStyle = C.amber; ctx.fillRect(c.x - 2.5, c.y - 2.5, 5, 5);
    }
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
      ctx.strokeStyle = C.ink + '0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, maxR * s, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
    }
    // đường dẫn bắn tới điểm rơi dự kiến (đường đạn của khung hình hiện tại)
    const L = g._lastTraj && !g._lastTraj.out && !P.isDead ? g._lastTraj : null;
    if (L) {
      const col = L.wall ? '#e0675c' : C.amber, i = toScreen(L.x, L.z);
      ctx.strokeStyle = L.wall ? 'rgba(255,59,48,0.75)' : 'rgba(231,166,58,0.75)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(i.x, i.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(i.x, i.y, 3.5, 0, TWO_PI); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(i.x, i.y, 1.5, 0, TWO_PI); ctx.fill();
    }

    // xe 2 phe (chỉ xe mình biết — TeamIntel) + drone đang bay
    if (typeof TeamIntel !== 'undefined') TeamIntel.drawOnMap(ctx, P, g.units, toScreen, s, { dot: 3.4, playerDot: 4.5 });
    if (g.drawDronesOnMap) g.drawDronesOnMap(ctx, toScreen, false);

    // xe địch đang khóa: khung khóa đỏ (vàng khi đang ngắm tay)
    const LT = g.lockedTarget, lp = LT && !LT.isDead && g.tacticalMap && g.tacticalMap.shownPos ? g.tacticalMap.shownPos(LT) : null;
    if (lp) {
      const l = toScreen(lp.x, lp.z), r = 7, k = 3;
      ctx.strokeStyle = g._manualAim ? C.amber : '#ff4d4d'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(l.x + sx * r, l.y + sy * (r - k)); ctx.lineTo(l.x + sx * r, l.y + sy * r); ctx.lineTo(l.x + sx * (r - k), l.y + sy * r);
      }
      ctx.stroke();
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
      ctx.strokeStyle = `rgba(${C.red},${0.9 * fade})`; ctx.lineWidth = 1.4; ctx.setLineDash(T.exact ? [] : [3, 2]);
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, TWO_PI); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      if (age < 0.7) {   // vừa trúng đạn: vòng sáng thu lại
        ctx.strokeStyle = `rgba(${C.red},${1 - age / 0.7})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, rr + (1 - age / 0.7) * 16, 0, TWO_PI); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${C.red},${fade})`; ctx.font = 'bold 9px Share Tech Mono, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', c.x, c.y);
    }

    // hình quạt hướng camera + hướng nòng
    {
      const yaw = g._camYaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const hf = g.camera ? Math.atan(Math.tan(g.camera.fov * Math.PI / 360) * g.camera.aspect) : 0.6, Lc = Rpx * 0.4;
      const rot = (a) => ({ x: fx * Math.cos(a) - fz * Math.sin(a), z: fx * Math.sin(a) + fz * Math.cos(a) });
      const l = rot(-hf), r = rot(hf);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + l.x * Lc, cy + l.z * Lc); ctx.lineTo(cx + r.x * Lc, cy + r.z * Lc); ctx.closePath();
      ctx.fill(); ctx.stroke();
      const br = (P.azimuth || 0) * Math.PI / 180;
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(br) * 12, cy - Math.cos(br) * 12); ctx.stroke();
    }
    ctx.restore();   // hết vùng cắt tròn

    // VIỀN: vòng mép + vạch chia 30° (vạch Bắc màu hổ phách)
    ctx.strokeStyle = C.ink + '0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, TWO_PI); ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6 - Math.PI / 2, n = k === 0, r0 = Rpx + 1, r1 = Rpx + (n ? 6 : k % 3 === 0 ? 4 : 2.5);
      ctx.strokeStyle = n ? C.amber : C.ink + '0.5)'; ctx.lineWidth = n ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }

    // CHẤM CHỈ HƯỚNG trên mép: cứ điểm, hòm thả dù, điểm rơi / điểm ngắm ở xa
    for (const cp of cps) {
      if (Math.hypot(cp.x - P.x, cp.z - P.z) <= Rw) continue;
      const col = cpCol(cp);
      rimMark(ctx, V, cp.x, cp.z, (mx, my) => {
        ctx.fillStyle = 'rgba(10,13,12,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, TWO_PI); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = 'bold 7px Chakra Petch'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cp.id, mx, my + 0.5);
      }, null);
    }
    if (AD && !inside(AD.x, AD.z)) {
      rimMark(ctx, V, AD.x, AD.z, (mx, my) => {
        ctx.fillStyle = C.amber; ctx.beginPath(); ctx.moveTo(mx, my - 4); ctx.lineTo(mx + 4, my); ctx.lineTo(mx, my + 4); ctx.lineTo(mx - 4, my); ctx.closePath(); ctx.fill();
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
      QuickComms.drawOnMap(ctx, toScreen, { inside, rim: (x, z, draw, label, col) => rimMark(ctx, V, x, z, draw, label, col) });
    }

    // VÙNG CẢNH BÁO ngoài vùng nhìn: cung đỏ trên mép vòng phủ đúng góc của vùng + mũi tên + cự ly
    for (const T of threats.values()) {
      const d = Math.hypot(T.x - P.x, T.z - P.z);
      if (d <= Rw + T.r) continue;
      const age = tn - T.t, fade = Math.min(1, (THREAT_TTL - age) / 3), pulse = 0.5 + 0.5 * Math.sin(tn * 7);
      const a = Math.atan2(T.z - P.z, T.x - P.x), hw = Math.max(0.12, Math.min(0.6, Math.asin(Math.min(1, T.r / d))));
      ctx.strokeStyle = `rgba(${C.red},${(0.55 + 0.45 * pulse) * fade})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, Rpx - 2, a - hw, a + hw); ctx.stroke();
      rimMark(ctx, V, T.x, T.z, (mx, my) => {
        ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
        ctx.fillStyle = `rgba(${C.red},${fade})`;
        ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }, fmtD(d), `rgba(${C.red},${fade})`);
    }

    // bán kính vùng quan sát
    ctx.font = '8px Share Tech Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = C.ink + '0.75)';
    ctx.strokeText(Math.round(Rw) + 'M', cx, cy + Rpx - 4); ctx.fillText(Math.round(Rw) + 'M', cx, cy + Rpx - 4);
  }

  // Nhấp chuột lên minimap (tọa độ pixel canvas) -> tọa độ thế giới
  function toWorld(g, cv, px, py) {
    const V = view(g, cv);
    return { x: V.P.x + (px - V.cx) / V.s, z: V.P.z + (py - V.cy) / V.s };
  }

  return { render, noteHit, reset, view, toWorld, viewRange };
})();

if (typeof window !== 'undefined') window.RadarMinimap = RadarMinimap;
