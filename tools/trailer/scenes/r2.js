/**
 * TRAILER V12 — BUỔI R2: TRẬN GIAO TRANH LIỀN MẠCH trước căn cứ tên lửa
 * (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1" --script .../r2.js)
 *  1. Hai tuyến xe Xanh / Đỏ đối mặt, nổ súng qua lại (máy ngang xa thuận nắng, căn cứ phía sau)
 *  2. Qua vai xe tăng Xanh: bắn -> máy bám viên đạn -> trúng xe Đỏ
 *  3. Xe 6 nòng xả đạn vạch đường vào xe Đỏ (máy bên sườn)
 *  4. Pháo chùm phủ tuyến Đỏ (flycam cao)
 *  5. Nhà trúng pháo tới khi sập (máy tĩnh thuận nắng)
 *  6. Căn cứ trúng pháo kích, nổ dây chuyền, sụp (mặt đất tele -> flycam khi còn nửa máu)
 *  7. Toàn cảnh sau trận: khói bốc trên căn cứ đổ nát (nền logo)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62, A0 = sunA + Math.PI * 0.62;
  const flat = (p, r) => { const g0 = S.ground(p.x, p.z); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(S.ground(x, z) - g0) > 5 || S.obstacleTop(x, z) > S.ground(x, z) + 0.5) return false; } return true; };
  const at = (cx, cz, a, d, h) => { const p = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }; p.y = top(p.x, p.z) + h; return p; };
  const alive = (l) => l.filter(u => u && !u.isDead);
  const pick = (l) => l[Math.floor(S.rnd() * l.length)];
  // bắn thẳng có giải đường đạn (đạn rơi đúng xe, không cắm đất / vọt qua)
  const shoot = (u, v) => {
    if (!u || u.isDead || !v) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.aim(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    u.reloadTimer = 0; S.fire(u);
  };
  try {
    await S.wait(0.4);
    const it = T.landmarkSet && T.landmarkSet.items && T.landmarkSet.items[0];
    const R = it ? it.reach || 500 : 400, gy = it ? it.G || S.ground(it.x, it.z) : 0;
    // ---- bãi giao tranh: phía nắng của căn cứ, bằng phẳng
    let M = null, aM = LIT;
    for (let k = 0; k < 14 && !M && it; k++) {
      const a = LIT + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.2;
      for (const d of [R + 300, R + 420, R + 560]) { const p = { x: it.x + Math.cos(a) * d, z: it.z + Math.sin(a) * d }; if (flat(p, 260)) { M = p; aM = a; break; } }
    }
    M = M || S.findOpen(400);
    M.y = S.ground(M.x, M.z);
    const ox = Math.cos(aM), oz = Math.sin(aM), px = -oz, pz = ox;   // o: từ căn cứ ra ngoài; p: trục hai tuyến
    S.log('arena', { d: it ? Math.round(Math.hypot(M.x - it.x, M.z - it.z)) : -1 });
    const kinds = ['ALL_ROUNDER', 'GATLING', 'SCOUT'];
    const blues = S.units('BLUE').filter(u => kinds.includes(u.tankType)).slice(0, 5);
    const reds = S.units('RED').filter(u => kinds.includes(u.tankType)).slice(0, 5);
    const line = (list, side, hpK) => list.forEach((u, i) => {
      S.freeze(u, true);
      const along = (i - (list.length - 1) / 2) * 70 + (S.rnd() - 0.5) * 16, dist = 240 + (i % 2) * 35;
      S.teleport(u, M.x + px * side * dist + ox * along, M.z + pz * side * dist + oz * along, Math.atan2(-px * side, pz * side));
      u.hp = u.maxHp * hpK;
    });
    line(blues, -1, 0.8); line(reds, 1, 0.35);
    await S.wait(0.4);

    // ---- 1. hai tuyến nổ súng qua lại
    const wide = { x: M.x + ox * 470, z: M.z + oz * 470 }; wide.y = top(wide.x, wide.z) + 16;
    S.shot('fixed', { pos: wide, look: { x: M.x - ox * 80, y: M.y + 14, z: M.z - oz * 80 }, dur: 30, fov: 40, drift: { x: px * 6, y: 0, z: pz * 6 } });
    S.log('scene', { n: 1, name: 'lines-clash' });
    let t0 = performance.now() / 1000;
    while (performance.now() / 1000 - t0 < 7.5) {
      const bl = alive(blues), rl = alive(reds);
      if (!bl.length || !rl.length) break;
      if (S.rnd() < 0.55) shoot(pick(bl), pick(rl)); else shoot(pick(rl), pick(bl));
      await S.wait(0.28 + S.rnd() * 0.22);
    }

    // ---- 2. qua vai xe tăng Xanh: bắn -> bám đạn -> trúng
    const a = alive(blues).find(u => u.tankType === 'ALL_ROUNDER') || alive(blues)[0];
    let b = alive(reds).sort((x, y) => Math.hypot(x.x - a.x, x.z - a.z) - Math.hypot(y.x - a.x, y.z - a.z))[0];
    if (a && b) {
      b.hp = Math.min(b.hp, b.maxHp * 0.3);
      S.shot('shoulder', { subject: a, target: b, dur: 30, shellP: 1, side: 1 });
      S.log('scene', { n: 2, name: 'duel', a: a.id, b: b.id });
      for (let k = 0; k < 3 && !b.isDead; k++) { await S.wait(1.2); shoot(a, b); await S.wait(2.4); }
      await S.wait(1.0);
    }

    // ---- 3. 6 nòng xả đạn vạch đường
    const gt = alive(blues).find(u => u.tankType === 'GATLING');
    const gv = alive(reds)[0] || b;
    if (gt && gv) {
      const dx = gv.x - gt.x, dz = gv.z - gt.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
      const gp = { x: gt.x - ux * 45 - uz * 38, z: gt.z - uz * 45 + ux * 38 }; gp.y = top(gp.x, gp.z) + 7;
      S.shot('fixed', { pos: gp, look: { x: gt.x + ux * dl * 0.5, y: gt.y + 8, z: gt.z + uz * dl * 0.5 }, dur: 30, fov: 46 });
      S.log('scene', { n: 3, name: 'gatling' });
      gv.hp = gv.maxHp * 0.5;
      await S.wait(0.5);
      t0 = performance.now() / 1000;
      while (performance.now() / 1000 - t0 < 3.2) { shoot(gt, gv); await S.wait(0.07); }
      await S.wait(1.2);
    }

    // ---- 4. pháo chùm phủ tuyến Đỏ
    const sh = S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
    const rc = { x: M.x + px * 260, z: M.z + pz * 260 };
    S.shot('fixed', { pos: at(rc.x, rc.z, LIT + 0.6, 360, 230), look: { x: rc.x, y: S.ground(rc.x, rc.z), z: rc.z }, dur: 30, fov: 46, drift: { x: 6, y: -2, z: 6 } });
    S.log('scene', { n: 4, name: 'cluster' });
    await S.wait(0.5);
    for (let i = 0; i < 14; i++) {
      const r = 170 * Math.sqrt(S.rnd()), q = S.rnd() * 6.28;
      S.shellAt(sh, rc.x + Math.cos(q) * r, S.ground(rc.x, rc.z) + 4, rc.z + Math.sin(q) * r, i % 2 ? 'CLUSTER' : 'HE', aM, 0.9);
      await S.wait(0.25 + S.rnd() * 0.2);
    }
    await S.wait(3);
    [...blues, ...reds].forEach(u => S.freeze(u, false));

    // ---- 5. nhà trúng pháo tới khi sập
    const BS = T.buildingSet, houses = (BS && BS.items || []).filter(h => !h.collapsed && h.floors <= 2 && Math.max(h.halfW, h.halfD) < 50);
    const H = houses.sort((x, y) => Math.hypot(x.x - M.x, x.z - M.z) - Math.hypot(y.x - M.x, y.z - M.z))[0];
    if (H) {
      const hp = { x: H.x, y: S.ground(H.x, H.z), z: H.z };
      let cam = null;
      for (let k = 0; k < 10 && !cam; k++) {
        const c = at(hp.x, hp.z, LIT + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25, 230, 18);
        if (S.obstacleTop(c.x, c.z) <= S.ground(c.x, c.z) + 0.5 && S.clear(c, { x: hp.x, y: hp.y + 20, z: hp.z })) cam = c;
      }
      cam = cam || at(hp.x, hp.z, LIT, 230, 30);
      S.shot('fixed', { pos: cam, look: { x: hp.x, y: hp.y + 22, z: hp.z }, dur: 40, fov: 32 });
      S.log('scene', { n: 5, name: 'house', floors: H.floors, kind: H.kind });
      await S.wait(0.6);
      for (let i = 0; i < 30 && !H.collapsed; i++) {
        S.shellAt(sh, hp.x + (S.rnd() - 0.5) * H.halfW, hp.y + 8, hp.z + (S.rnd() - 0.5) * H.halfD, 'HE', LIT + Math.PI + (S.rnd() - 0.5), 0.7);
        await S.wait(0.3);
      }
      S.log('houseEnd', { collapsed: !!H.collapsed });
      await S.wait(3.5);
    }

    // ---- 6. căn cứ trúng pháo kích, sụp
    if (it) {
      S.shot('fixed', { pos: at(it.x, it.z, A0 + 0.3, R + 450, 25), look: { x: it.x, y: gy + 40, z: it.z }, dur: 40, fov: 30 });
      S.log('scene', { n: 6, name: 'base-strike' });
      await S.wait(0.6);
      let shots = 0, switched = false;
      t0 = performance.now() / 1000;
      while (!it.dead && shots < 120 && performance.now() / 1000 - t0 < 30) {
        const r = R * 0.65 * Math.sqrt(S.rnd()), q = S.rnd() * 6.28;
        S.shellAt(sh, it.x + Math.cos(q) * r, gy + 6, it.z + Math.sin(q) * r, shots % 4 === 3 ? 'CLUSTER' : 'HE', A0 + Math.PI + (S.rnd() - 0.5), 0.85);
        shots++;
        if (!switched && it.hp < it.hp0 * 0.5) {
          switched = true;
          S.shot('fixed', { pos: at(it.x, it.z, A0 + 1.6, R + 260, 240), look: { x: it.x, y: gy, z: it.z }, dur: 40, fov: 46, drift: { x: 10, y: -3, z: 10 } });
          S.log('scene', { n: 7, name: 'base-collapse-aerial' });
        }
        await S.wait(0.22 + S.rnd() * 0.18);
      }
      S.log('baseDead', { dead: !!it.dead, shots });
      await S.wait(6);
      // ---- 7. toàn cảnh sau trận (nền logo)
      S.shot('fixed', { pos: at(it.x, it.z, LIT, R + 900, 320), look: { x: it.x, y: gy + 20, z: it.z }, dur: 30, fov: 34, drift: { x: -Math.sin(LIT) * 14, y: -2, z: Math.cos(LIT) * 14 } });
      S.log('scene', { n: 8, name: 'aftermath' });
      await S.wait(8);
    }
    S.log('done', {});
  } catch (e) { console.error('[R2]', e); S.log('error', { m: String(e && e.message) }); }
})();
