/**
 * TRAILER V16 — BUỔI K1 (record.js --map RIVER_LAKE --seed 17 --preroll 3 --sec 34
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
  const shoot = (u, v) => {
    if (!u || u.isDead || !v || v.isDead) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.aim(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    u.reloadTimer = 0; S.fire(u);
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
      const M = S.findOpen(460); M.y = S.ground(M.x, M.z);
      const ox = Math.cos(LIT), oz = Math.sin(LIT), px = -oz, pz = ox;
      const bl = grab('BLUE', 6), rl = grab('RED', 6, 'ALL_ROUNDER');
      const line = (list, side) => list.forEach((u, i) => {
        S.freeze(u, true); u.hp = u.maxHp * 8;
        const along = (i - (list.length - 1) / 2) * 70 + (S.rnd() - 0.5) * 14, dist = 150 + (i % 2) * 30;
        S.teleport(u, M.x + px * side * dist + ox * along, M.z + pz * side * dist + oz * along, Math.atan2(-px * side, pz * side));
      });
      line(bl, -1); line(rl, 1); noSmoke();
      // mục tiêu: xe tăng Đỏ gần giữa tuyến
      const Tg = rl.find(u => u.tankType === 'ALL_ROUNDER') || rl[0];
      await S.wait(0.3);
      // quỹ đạo: vòng cung quanh mục tiêu phía thuận nắng (bán kính 720 -> 480, cao 260 -> 210), lượn nghiêng vào tâm
      const C = { x: Tg.x, z: Tg.z }, G0 = S.ground(Tg.x, Tg.z);
      const a0 = LIT + 0.35, a1 = LIT + 1.3, TC = 3.8, TL = 1.1, TD = 1.5;
      let lockPos = null, lockLook = null;
      const orbit = (k) => { const a = lerp(a0, a1, k), r = lerp(720, 480, k); return { a, x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r, y: G0 + lerp(260, 215, k) }; };
      let tP = null;   // đồng hồ chung với kịch bản (đồng hồ cảnh của máy có thể chậm hơn)
      const fn = () => {
        if (tP === null) tP = now();
        const el = now() - tP;
        if (el < TC + TL) {
          const k = Math.min(1, el / (TC + TL)), o = orbit(k * 0.98 + 0.02 * Math.min(1, el / TC));
          // nhìn tới trước theo tiếp tuyến + chúc xuống bao quát chiến trường; khi khoá: nhìn dần vào mục tiêu
          const tx = -Math.sin(o.a), tz = Math.cos(o.a);
          const ahead = { x: lerp(o.x + tx * 380, C.x, 0.8), y: G0, z: lerp(o.z + tz * 380, C.z, 0.8) };   // chiến trường luôn trong khung
          const lk = el < TC ? 0 : ease(Math.min(1, (el - TC) / (TL * 0.7)));
          const look = { x: lerp(ahead.x, Tg.x, lk), y: lerp(ahead.y, Tg.y + 3, lk), z: lerp(ahead.z, Tg.z, lk) };
          lockPos = { x: o.x, y: o.y, z: o.z }; lockLook = look;
          return { pos: lockPos, look, fov: lerp(58, 30, lk), roll: lerp(0.22, 0.04, lk) };
        }
        // bổ nhào: lao thẳng, nhanh dần, dừng cách xe ~22 đv (cắt sang vụ nổ) — không chui vào thân xe / cỏ
        // khoảng cách giảm sao cho kích thước xe trong khung tăng ĐỀU (1/d tuyến tính) — không đứng im rồi vụt tới
        const k = Math.min(1, (el - TC - TL) / TD);
        const dx = Tg.x - lockPos.x, dy = Tg.y + 6 - lockPos.y, dz = Tg.z - lockPos.z, D = Math.hypot(dx, dy, dz), Dend = 60;
        const d = 1 / (1 / D + k * (1 / Dend - 1 / D)), f = 1 - d / D;
        const pos = { x: lockPos.x + dx * f, y: lockPos.y + dy * f, z: lockPos.z + dz * f };
        return { pos, look: { x: Tg.x, y: Tg.y + 4, z: Tg.z }, fov: lerp(30, 36, k), roll: 0.025 * Math.sin(el * 11) * k, minClear: 4 };
      };
      S.shot('path', { fn, dur: 30 });
      S.log('scene', { n: 1, name: 'kami-pov' });
      // giao tranh bên dưới (không xe nào chết trước cú bổ nhào)
      let firing = true;
      (async () => { while (firing) { const a = alive(bl), r = alive(rl).filter(u => u !== Tg); if (a.length && r.length) { if (S.rnd() < 0.5) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); } noSmoke(); await S.wait(0.3 + S.rnd() * 0.2); } })();
      await S.until(() => tP !== null, 5);
      await S.until(() => now() - tP >= TC, 10); S.log('lock', {});
      await S.until(() => now() - tP >= TC + TL + TD, 10);
      S.log('impact', {});
      S.ammoKill(Tg, bl[0], { x: Tg.x - lockPos.x, y: Tg.y - lockPos.y, z: Tg.z - lockPos.z });
      S.shellAt(bl[0], Tg.x, Tg.y + 4, Tg.z, 'HE', Math.atan2(Tg.x - lockPos.x, Tg.z - lockPos.z), 0.95);
      await S.wait(0.35);
      // máy ngoài: nhìn xác xe nổ, tháp bật bay
      const cp = { x: Tg.x + Math.cos(LIT + 0.5) * 120, z: Tg.z + Math.sin(LIT + 0.5) * 120 }; cp.y = top(cp.x, cp.z) + 26;
      S.shot('fixed', { pos: cp, look: { x: Tg.x, y: Tg.y + 14, z: Tg.z }, dur: 30, fov: 46 });
      S.log('scene', { n: 2, name: 'kami-after' });
      await S.wait(3.5);
      firing = false;
      [...bl, ...rl].forEach(u => S.freeze(u, false));
    }

    // ---- 2. chiếm cứ điểm — một cảnh liền
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      const HB = 96, sg = (K.fx * Math.cos(LIT) + K.fz * Math.sin(LIT)) >= 0 ? 1 : -1;
      const W = (f, r) => ({ x: K.x + K.fx * f * sg + K.rx * r, z: K.z + K.fz * f * sg + K.rz * r });
      const G = K.G || S.ground(K.x, K.z);
      for (const u of g.units) if (u !== g.player && Math.hypot(u.x - K.x, u.z - K.z) < 900) { S.freeze(u, true); S.teleport(u, u.x + K.rx * 2200, u.z + K.rz * 2200); }
      const team = S.units('BLUE').filter(u => kinds.includes(u.tankType)).slice(0, 5), red = S.units('RED').filter(u => kinds.includes(u.tankType)).slice(0, 4);
      const head = Math.atan2(-K.fx * sg, K.fz * sg);
      // đích dừng: sân trước miệng hầm, xếp hình nêm (không chui xuống dốc hầm)
      const stopF = [HB + 95, HB + 125, HB + 125, HB + 155, HB + 155], stopR = [0, -48, 48, -92, 92];
      const RUN = 5.2, V = 46;
      team.forEach((u, i) => {
        S.freeze(u, true); u.hp = u.maxHp * 30;
        const p = W(stopF[i] + V * RUN, stopR[i]); S.teleport(u, p.x, p.z, head);
        S.aim(u, { x: K.x, y: G + 6, z: K.z }, 1);
      });
      const rp = [W(HB + 30, -150), W(HB + 30, 150), W(-30, -150), W(-30, 150)];
      red.forEach((u, i) => { S.freeze(u, true); u.hp = u.maxHp * 8; S.teleport(u, rp[i].x, rp[i].z, head + Math.PI); });
      K.capture = 0; K.owner = null;
      noSmoke();
      await S.wait(0.5);
      const cc = W(HB + 120, 0), cam = W(HB + 430, 250); cam.y = G + 290;
      S.shot('fixed', { pos: cam, look: { x: cc.x, y: G, z: cc.z }, dur: 40, fov: 48, drift: { x: -K.fx * sg * 5, y: -5, z: -K.fz * sg * 5 } });
      S.log('scene', { n: 3, name: 'siege2', team: team.length, red: red.length });
      const art = S.units('BLUE', 'ARTILLERY')[0] || team[0];
      let shelling = true;
      (async () => {
        let i = 0;
        while (shelling) {
          let p;
          if (i % 3 === 1) { const r = rp[Math.floor(S.rnd() * rp.length)]; p = { x: r.x + (S.rnd() - 0.5) * 50, z: r.z + (S.rnd() - 0.5) * 50 }; }
          else p = W((S.rnd() - 0.5) * 2 * (HB - 15), (S.rnd() - 0.5) * 150);
          S.shellAt(art, p.x, G + 38, p.z, i % 5 === 4 ? 'CLUSTER' : 'HE', LIT + Math.PI + (S.rnd() - 0.5), 0.85);
          i++;
          await S.wait(0.13 + S.rnd() * 0.12);
        }
      })();
      let firing = true;
      (async () => {
        while (firing) {
          const a = alive(team), r = alive(red);
          if (r.length && a.length) { if (S.rnd() < 0.65) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); }
          noSmoke();
          await S.wait(0.25 + S.rnd() * 0.15);
        }
      })();
      const t0 = now();
      (async () => {
        for (const [d, j] of [[0.9, 0], [1.8, 2], [2.7, 1], [3.5, 3]]) {
          await S.until(() => now() - t0 >= d, 10);
          const r = red[j]; if (!r || r.isDead) continue;
          S.shellAt(art, r.x, r.y + 3, r.z, 'HE', LIT + Math.PI, 0.85);
          setTimeout(() => { if (!r.isDead) S.ammoKill(r, team[0]); }, 900);
        }
      })();
      // pháo ngừng sớm cho khói tan khi xe tới; cờ bắt đầu kéo lên lúc xe vào vùng
      (async () => { await S.until(() => now() - t0 >= 4.0, 10); shelling = false; })();
      (async () => {
        await S.until(() => now() - t0 >= 3.6, 10);
        S.log('capStart', {});
        for (const r of red) if (!r.isDead) S.ammoKill(r, team[0]);
        while (now() - t0 < 9) { K.capture = Math.min(100, Math.max(K.capture, 30) + 4.5); await S.wait(0.1); }
      })();
      // mỗi xe chạy tới đúng điểm dừng của nó rồi đứng lại (không trôi quá đà chui vào hầm)
      const goal = team.map((u, i) => W(stopF[i], stopR[i]));
      await new Promise(res => {
        let last = now();
        const id = setInterval(() => {
          const tt = now(), dt = Math.min(0.1, tt - last); last = tt; let moving = 0;
          team.forEach((u, i) => {
            if (u.isDead) return;
            const dx = goal[i].x - u.x, dz = goal[i].z - u.z, d = Math.hypot(dx, dz), st = Math.min(d, V * dt);
            if (d > 0.5) { moving++; u.x += dx / d * st; u.z += dz / d * st; u.y = S.ground(u.x, u.z); u.speed = V; } else u.speed = 0;
            if (u.group) u.group.position.set(u.x, u.y, u.z);
          });
          if (!moving || tt - t0 > RUN + 3) { clearInterval(id); team.forEach(u => { u.speed = 0; }); res(); }
        }, 33);
      });
      S.log('arrived', { cap: K.capture, f: team.map(u => Math.round(((u.x - K.x) * K.fx + (u.z - K.z) * K.fz) * sg)), cam: Math.round(((cam.x - K.x) * K.fx + (cam.z - K.z) * K.fz) * sg) });
      // đến nơi: xe nhắm vào hầm, bắn thêm vài phát
      for (const u of team) S.aim(u, { x: K.x, y: G + 4, z: K.z }, 1);
      await S.wait(3);
      firing = false;
      S.log('captured', { owner: K.owner, cap: K.capture });
      await S.wait(1.5);
      team.forEach(u => S.freeze(u, false));
    }
    S.log('done', {});
  } catch (e) { console.error('[K1]', e); S.log('error', { m: String(e && e.message) }); }
})();
