/**
 * TRAILER V17 — BUỔI K2 (bản sửa của k1: UAV lượn quanh tâm trận, không nghiêng/zoom gắt; xe chui vào hầm) (record.js --map RIVER_LAKE --seed 17 --preroll 3 --sec 34
 *   --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1&nosmoke=1" --script tools/trailer/scenes/k1.js)
 *  1. kami-pov : góc nhìn UAV cảm tử — lượn vòng trên cao bao quát hai tuyến xe đang giao tranh, khoá một xe tăng Đỏ
 *                (ống kính zoom vào), bổ nhào thẳng xuống -> chạm nổ; rồi máy ngoài nhìn xác xe nổ kho đạn, tháp bật bay
 *  2. siege2   : chiếm cứ điểm MỘT cảnh liền: máy cao gần như thẳng đứng, pháo dồn dập giã nóc hầm, xe Đỏ quanh hầm bị diệt,
 *                5 xe Xanh tiến vào và DỪNG trên sân trước miệng hầm (luôn thấy được), cờ Xanh kéo lên khi xe còn trong khung
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;
  const alive = (l) => l.filter(u => u && !u.isDead);
  const pick = (l) => l[Math.floor(S.rnd() * l.length)];
  const now = () => performance.now() / 1000;
  const noSmoke = () => { for (const u of g.units) u.smokeLeft = 0; };
  const ease = (k) => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a + (b - a) * k;
  // tháp xoay MƯỢT (S.slew), giữ mục tiêu tới khi nó bị hạ, chỉ bắn khi nòng đã quay tới — không nhảy cóc
  const shoot = (u, v) => {
    if (!u || u.isDead) return;
    if (u._tg && !u._tg.isDead) v = u._tg; else u._tg = v;
    if (!v || v.isDead) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.slew(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    if (S.slewReady(u)) { u.reloadTimer = 0; S.fire(u); }
  };
  const kinds = ['ALL_ROUNDER', 'GATLING', 'SCOUT'];
  const used = new Set();
  const grab = (team, n, pref) => {
    const l = S.units(team).filter(u => kinds.includes(u.tankType) && !used.has(u));
    if (pref) l.sort((a, b) => (b.tankType === pref) - (a.tankType === pref));
    const r = l.slice(0, n); r.forEach(u => used.add(u)); return r;
  };
  try {
    await S.wait(0.4);
    noSmoke();

    // ---- 1. góc nhìn UAV cảm tử
    {
      // bãi đất KHÔ, bằng (không xe nào đứng dưới sông / hồ)
      const dry = (c) => { const g0 = T.groundAtRaw(c.x, c.z); for (let r = 0; r <= 520; r += 65) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, h = T.groundAtRaw(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); if (h < T.waterLevel + 1.5 || Math.abs(h - g0) > 18) return false; } return true; };
      let M = null;
      for (let i = 0; i < 80 && !M; i++) { const c = S.findOpen(460); if (c && dry(c)) M = c; }
      if (!M) M = S.findOpen(460);
      M.y = S.ground(M.x, M.z);
      const ox = Math.cos(LIT), oz = Math.sin(LIT), px = -oz, pz = ox;
      const bl = grab('BLUE', 6), rl = grab('RED', 6, 'ALL_ROUNDER');
      const line = (list, side) => list.forEach((u, i) => {
        S.freeze(u, true); u.hp = u.maxHp * 8;
        const along = (i - (list.length - 1) / 2) * 110 + (S.rnd() - 0.5) * 50, dist = 170 + S.rnd() * 80;   // rải rác, không sát nhau
        S.teleport(u, M.x + px * side * dist + ox * along, M.z + pz * side * dist + oz * along, Math.atan2(-px * side, pz * side));
      });
      line(bl, -1); line(rl, 1); noSmoke();
      // mục tiêu: xe tăng Đỏ gần giữa tuyến
      const Tg = rl.filter(u => u.tankType === 'ALL_ROUNDER').sort((a, b) => Math.hypot(a.x - M.x, a.z - M.z) - Math.hypot(b.x - M.x, b.z - M.z))[0] || rl[0];
      await S.wait(0.3);
      // quỹ đạo: vòng cung quanh mục tiêu phía thuận nắng (bán kính 720 -> 480, cao 260 -> 210), lượn nghiêng vào tâm
      const C = { x: M.x, z: M.z }, G0 = M.y;   // lượn quanh TÂM trận đánh, nhìn bao quát cả hai phe
      const a0 = LIT - Math.PI / 2 - 0.45, a1 = LIT - Math.PI / 2 + 0.3, TC = 3.6, TL = 1.1, TD = 1.9;   // phía sau tuyến Xanh: nhìn ngang qua chiến tuyến, xe không chồng lên nhau
      let lockPos = null, lockLook = null, lockDive = null;
      const orbit = (k) => { const a = lerp(a0, a1, k), r = lerp(720, 580, k); return { a, x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r, y: G0 + lerp(310, 270, k) }; };
      let tP = null;   // đồng hồ chung với kịch bản (đồng hồ cảnh của máy có thể chậm hơn)
      const fn = () => {
        if (tP === null) tP = now();
        const el = now() - tP;
        if (el < TC + TL) {
          const k = Math.min(1, el / (TC + TL)), o = orbit(k * 0.98 + 0.02 * Math.min(1, el / TC));
          // nhìn tới trước theo tiếp tuyến + chúc xuống bao quát chiến trường; khi khoá: nhìn dần vào mục tiêu
          const tx = -Math.sin(o.a), tz = Math.cos(o.a);
          const ahead = { x: C.x, y: G0, z: C.z };   // tâm trận luôn giữa khung
          const lk = el < TC ? 0 : ease(Math.min(1, (el - TC) / (TL * 0.7)));
          const look = { x: lerp(ahead.x, Tg.x, lk), y: lerp(ahead.y, Tg.y + 3, lk), z: lerp(ahead.z, Tg.z, lk) };
          lockPos = { x: o.x, y: o.y, z: o.z }; lockLook = look;
          return { pos: lockPos, look, fov: 50, roll: 0 };   // không nghiêng khung, không zoom
        }
        // bổ nhào: lao thẳng, nhanh dần, dừng cách xe ~22 đv (cắt sang vụ nổ) — không chui vào thân xe / cỏ
        // LƯỢN XUỐNG (không lao thẳng — lao thẳng nhìn như zoom): vòng quanh mục tiêu thêm ~40° vừa hạ độ cao, tầm gần dần
        const k = Math.min(1, (el - TC - TL) / TD), e = ease(k);
        const a0L = Math.atan2(lockPos.z - Tg.z, lockPos.x - Tg.x), r0 = Math.hypot(lockPos.x - Tg.x, lockPos.z - Tg.z), h0 = lockPos.y - Tg.y;
        const a = a0L + 0.7 * e, r = lerp(r0, 150, Math.pow(e, 0.85)), h = lerp(h0, 42, Math.pow(e, 1.15));
        const pos = { x: Tg.x + Math.cos(a) * r, y: Tg.y + h, z: Tg.z + Math.sin(a) * r };
        lockDive = pos;
        return { pos, look: { x: Tg.x, y: Tg.y + 4, z: Tg.z }, fov: 50, roll: -0.12 * Math.sin(Math.PI * k), minClear: 4 };
      };
      S.shot('path', { fn, dur: 30 });
      S.log('scene', { n: 1, name: 'kami-pov' });
      // giao tranh bên dưới (không xe nào chết trước cú bổ nhào)
      let firing = true;
      (async () => { while (firing) { const a = alive(bl), r = alive(rl).filter(u => u !== Tg); if (a.length && r.length) { if (S.rnd() < 0.5) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); } noSmoke(); await S.wait(0.3 + S.rnd() * 0.2); } })();
      // PHÒNG KHÔNG: 2 xe 6 nòng Đỏ xả đạn 30 ly vạch lên đường bay UAV suốt lúc lượn (đạn thật bắn từ chỗ xe, nòng xe chỉ
      // ngóc 20° nên phát ra bằng _launchOverride như pháo kích); đạn bay sượt quanh ống kính, không trúng
      const aa = rl.filter(u => u !== Tg).sort((p, q) => (q.tankType === 'GATLING') - (p.tankType === 'GATLING')).slice(0, 2);
      const flak = (u) => {
        if (!u || u.isDead || !lockPos) return;
        const p = new THREE.Vector3(u.x, u.y + 9, u.z);
        const off = { x: (S.rnd() - 0.5) * 70, y: (S.rnd() - 0.3) * 40, z: (S.rnd() - 0.5) * 70 };
        const d = new THREE.Vector3(lockPos.x + off.x - p.x, lockPos.y + off.y - p.y, lockPos.z + off.z - p.z).normalize();
        S.slew(u, { x: lockPos.x, y: u.y, z: lockPos.z }, 20);
        u._launchOverride = { position: p, direction: d }; B._remoteShot = true;
        try { B.fireShell3D(u, 0, 0, 1, 'GATLING_BULLET'); } catch (e) {} finally { u._launchOverride = null; B._remoteShot = false; }
      };
      let flakOn = true;
      (async () => { await S.wait(0.9); let i = 0; while (flakOn) { flak(aa[i++ % Math.max(1, aa.length)]); await S.wait(0.05 + (i % 9 === 0 ? 0.35 : 0)); } })();
      S.log('flak', { n: aa.length });
      await S.until(() => tP !== null, 5);
      await S.until(() => now() - tP >= TC, 10); S.log('lock', {});
      await S.until(() => now() - tP >= TC + TL * 0.5, 10); flakOn = false;
      await S.until(() => now() - tP >= TC + TL + TD, 10);
      S.log('impact', {});
      S.ammoKill(Tg, bl[0], { x: Tg.x - (lockDive || lockPos).x, y: -20, z: Tg.z - (lockDive || lockPos).z });
      S.shellAt(bl[0], Tg.x, Tg.y + 4, Tg.z, 'HE', Math.atan2(Tg.x - lockPos.x, Tg.z - lockPos.z), 0.95);
      await S.wait(0.35);
      // máy ngoài: nhìn xác xe nổ, tháp bật bay
      // máy ngoài CÙNG PHÍA hướng UAV lao tới (nối mạch, không đảo trục): lùi theo đường bay, lệch nhẹ sang bên
      const LP = lockDive || lockPos, ax = LP.x - Tg.x, az = LP.z - Tg.z, al = Math.hypot(ax, az) || 1;
      const cp = { x: Tg.x + ax / al * 165 - az / al * 45, z: Tg.z + az / al * 165 + ax / al * 45 }; cp.y = top(cp.x, cp.z) + 48;
      S.shot('fixed', { pos: cp, look: { x: Tg.x, y: Tg.y + 14, z: Tg.z }, dur: 30, fov: 46 });
      S.log('scene', { n: 2, name: 'kami-after' });
      await S.wait(3.5);
      firing = false;
      [...bl, ...rl].forEach(u => S.freeze(u, false));
    }

    // ---- 2. chiếm cứ điểm (v17): đoàn 5 xe nối đuôi CHUI VÀO HẦM; pháo kích thưa, nổ gọn (không phủ khói)
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      const HB = 96, sg = (K.fx * Math.cos(LIT) + K.fz * Math.sin(LIT)) >= 0 ? 1 : -1;
      const W = (f, r) => ({ x: K.x + K.fx * f * sg + K.rx * r, z: K.z + K.fz * f * sg + K.rz * r });
      const G = K.G || S.ground(K.x, K.z);
      for (const u of g.units) if (u !== g.player && Math.hypot(u.x - K.x, u.z - K.z) < 900) { S.freeze(u, true); S.teleport(u, u.x + K.rx * 2200, u.z + K.rz * 2200); }
      const team = S.units('BLUE').filter(u => kinds.includes(u.tankType)).slice(0, 5);
      const red = S.units('RED').filter(u => kinds.includes(u.tankType)).slice(0, 2);
      const head = Math.atan2(-K.fx * sg, K.fz * sg);
      // tiến công tự nhiên: 5 xe xuất phát rải rác hình quạt trên bãi trước hầm, mỗi xe một đường cong riêng (tốc độ, lúc
      // khởi hành lệch nhau), dồn dần về dốc rồi lần lượt chui vào hầm; điểm dừng: 3 xe trong hầm, 1 ở miệng, 1 trên dốc
      const endF = [-50, -5, 40, 88, 140], laneR = [-8, 8, -8, 8, 0];
      const startFR = [[HB + 260, -40], [HB + 320, 140], [HB + 300, -170], [HB + 370, 60], [HB + 400, -110]];
      const V0 = [56, 52, 54, 50, 48], DELAY = [0, 0.25, 0.1, 0.5, 0.75];
      // đường đi: Bezier bậc 2 từ điểm xuất phát -> đầu dốc (lệch làn) qua điểm điều khiển kéo về trục, rồi thẳng vào hầm
      const paths = team.map((u, i) => {
        const P0 = W(startFR[i][0], startFR[i][1]), P2 = W(HB + 165, laneR[i]), C1 = W((startFR[i][0] + HB + 165) / 2 - 20, startFR[i][1] * 0.15 + laneR[i]);
        const pts = [];
        for (let k = 0; k <= 24; k++) { const t = k / 24, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; pts.push({ x: a * P0.x + b * C1.x + c * P2.x, z: a * P0.z + b * C1.z + c * P2.z }); }
        pts.push(W(endF[i], laneR[i]));
        let L = 0; const cum = [0];
        for (let k = 1; k < pts.length; k++) { L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z); cum.push(L); }
        return { pts, cum, L, s: 0 };
      });
      const along = (P, d) => { let k = 1; while (k < P.cum.length - 1 && P.cum[k] < d) k++; const t = Math.min(1, (d - P.cum[k - 1]) / Math.max(1e-6, P.cum[k] - P.cum[k - 1])); const A = P.pts[k - 1], B = P.pts[k]; return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, h: Math.atan2(B.x - A.x, -(B.z - A.z)) }; };
      team.forEach((u, i) => {
        S.freeze(u, true); u.hp = u.maxHp * 30;
        const q = along(paths[i], 0); S.teleport(u, q.x, q.z, q.h);
        S.aim(u, { x: K.x, y: G + 6, z: K.z }, 1);
      });
      // 2 xe Đỏ giữ hai bên nóc hầm, phía xa máy (khói xác cháy không che lối vào)
      const rp = [W(-40, -125), W(-40, 125)];
      red.forEach((u, i) => { S.freeze(u, true); u.hp = u.maxHp * 8; S.teleport(u, rp[i].x, rp[i].z, head + Math.PI); });
      K.capture = 0; K.owner = null;
      noSmoke();
      await S.wait(0.5);
      // máy cao sau đuôi đoàn xe, dọc trục hầm: thấy dốc xuống + miệng hầm + nóc hầm
      const cam = W(HB + 540, 120); cam.y = G + 270;
      const lk = W(HB - 10, 0);
      S.shot('fixed', { pos: cam, look: { x: lk.x, y: G, z: lk.z }, dur: 40, fov: 46, drift: { x: -K.fx * sg * 8, y: -6, z: -K.fz * sg * 8 } });
      S.log('scene', { n: 3, name: 'siege2' });
      const art = S.units('BLUE', 'ARTILLERY')[0] || team[0];
      const t0 = now();
      let shelling = true;
      (async () => {
        let i = 0;
        while (shelling) {
          const p = W(-HB * 0.2 - S.rnd() * HB * 0.7, (S.rnd() - 0.5) * 140);   // nửa xa của nóc hầm
          S.shellAt(art, p.x, G + 38, p.z, 'HE', LIT + Math.PI + (S.rnd() - 0.5), 0.85);
          i++;
          await S.wait(0.38 + S.rnd() * 0.22);
        }
      })();
      let firing = true;
      (async () => {
        while (firing) {
          const a = alive(team), r = alive(red);
          if (r.length && a.length) { if (S.rnd() < 0.7) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); }
          noSmoke();
          await S.wait(0.35 + S.rnd() * 0.2);
        }
      })();
      (async () => {
        for (const [d, j] of [[1.2, 0], [2.4, 1]]) {
          await S.until(() => now() - t0 >= d, 10);
          const r = red[j]; if (!r || r.isDead) continue;
          S.shellAt(art, r.x, r.y + 3, r.z, 'HE', LIT + Math.PI, 0.85);
          setTimeout(() => { if (!r.isDead) S.ammoKill(r, team[0]); }, 900);
        }
      })();
      (async () => { await S.until(() => now() - t0 >= 3.4, 10); shelling = false; firing = false; })();
      // cờ kéo lên khi xe đầu vào vùng chiếm (f < HB + 74)
      (async () => {
        await S.until(() => team.some(u => ((u.x - K.x) * K.fx + (u.z - K.z) * K.fz) * sg < HB + 74), 14);
        S.log('capStart', {});
        for (const r of red) if (!r.isDead) S.ammoKill(r, team[0]);
        while (now() - t0 < 14) { K.capture = Math.min(100, Math.max(K.capture, 30) + 4); await S.wait(0.1); }
      })();
      // mỗi xe bám đường cong riêng; thân xe xoay mượt theo hướng chạy; tới cuối đường thì dừng
      await new Promise(res => {
        let last = now();
        const id = setInterval(() => {
          const tt = now(), dt = Math.min(0.1, tt - last), el = tt - t0; last = tt; let moving = 0;
          team.forEach((u, i) => {
            const P = paths[i]; if (u.isDead) return;
            if (P.s >= P.L) { u.speed = 0; return; }
            moving++;
            if (el < DELAY[i]) return;
            const v = V0[i] * Math.min(1, (el - DELAY[i]) / 0.8) * (P.s > P.L - 40 ? Math.max(0.25, (P.L - P.s) / 40) : 1);
            P.s = Math.min(P.L, P.s + v * dt);
            const q = along(P, P.s);
            let dh = q.h - (u.bodyAngle || 0); dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            u.bodyAngle = (u.bodyAngle || 0) + dh * Math.min(1, dt * 4);
            u.x = q.x; u.z = q.z; u.y = S.ground(u.x, u.z); u.speed = v;
            if (u.group) { u.group.position.set(u.x, u.y, u.z); u.group.rotation.y = u.bodyAngle; }
          });
          if (!moving || el > 12) { clearInterval(id); team.forEach(u => { u.speed = 0; }); res(); }
        }, 33);
      });
      S.log('arrived', { cap: K.capture, f: team.map(u => Math.round(((u.x - K.x) * K.fx + (u.z - K.z) * K.fz) * sg)) });
      await S.wait(2.5);
      S.log('captured', { owner: K.owner, cap: K.capture });
      team.forEach(u => S.freeze(u, false));
    }
    S.log('done', {});
  } catch (e) { console.error('[K1]', e); S.log('error', { m: String(e && e.message) }); }
})();
