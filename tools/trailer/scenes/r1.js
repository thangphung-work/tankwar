/**
 * TRAILER V12 — BUỔI R1 (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&kami=1&nocamo=1" --script .../r1.js)
 *  1. Toàn cảnh căn cứ tên lửa (flycam xa, trôi chậm)          2. Nắp giếng phóng (máy dò đường nhìn)
 *  3. Dàn xe lăn bánh qua máy thấp thuận nắng: xe tăng, 6 nòng, pháo tự hành, trinh sát
 *  4. Pháo tự hành khai hỏa (máy bên sườn thuận nắng) -> bay song song viên đạn -> nổ trúng nhà
 *  5. UAV cảm tử bay thuận nắng, máy bám liền tới lúc nổ        6. UAV cảm tử thứ hai, máy tĩnh cạnh xe
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;   // máy đặt theo hướng này so với vật: quay lưng về mặt trời
  const A0 = sunA + Math.PI * 0.62;    // góc toàn cảnh căn cứ (nuke2: nắng xiên)
  const newShell = (u, before) => B.activeShells.find(s => s.shooterId === u.id && !before.includes(s)) || null;
  const flatOpen = (p, r) => { const g0 = S.ground(p.x, p.z); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(S.ground(x, z) - g0) > 6 || S.obstacleTop(x, z) > S.ground(x, z) + 0.5) return false; } return true; };
  const at = (cx, cz, a, d, h) => { const p = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }; p.y = top(p.x, p.z) + h; return p; };
  const nearClear = (p, q, m) => { for (let i = 1; i <= 10; i++) { const t = i / 25, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t, z = p.z + (q.z - p.z) * t; if (top(x, z) > y - m) return false; } return true; };
  const findCam = (c, a0, dists, hs, tg, spread) => {
    for (const h of hs) for (const d of dists) for (let k = 0; k < 13; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (spread || 0.18);
      const p = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d }, gnd = S.ground(p.x, p.z);
      if (S.obstacleTop(p.x, p.z) > gnd + 0.5) continue;
      p.y = gnd + h;
      if (tg.every(q => S.clear(p, q) && nearClear(p, q, 4))) return p;
    }
    return null;
  };
  try {
    await S.wait(0.4);
    const it = T.landmarkSet && T.landmarkSet.items && T.landmarkSet.items[0];
    // ---- 1-2. căn cứ
    if (it) {
      const Lm = it.L || {}, an = Lm.angle || 0, sf = Lm.silo ? Lm.silo.f : 0, sr = Lm.silo ? Lm.silo.r : 0;
      const gy = it.G || S.ground(it.x, it.z), R = it.reach || 500;
      S.shot('fixed', { pos: at(it.x, it.z, A0, R + 700, 160), look: { x: it.x, y: gy + 30, z: it.z }, dur: 30, fov: 34, drift: { x: Math.sin(A0) * 26, y: -3, z: -Math.cos(A0) * 26 } });
      S.log('scene', { n: 1, name: 'establish' });
      await S.wait(5.5);
      const silo = { x: it.x + sf * Math.cos(an) - sr * Math.sin(an), z: it.z + sf * Math.sin(an) + sr * Math.cos(an) };
      silo.y = gy + (Lm.silo ? Lm.silo.h + 3 : 30);
      const p = findCam(silo, A0 - 0.4, [120, 160, 210, 260], [10, 16, 24, 34], [{ x: silo.x, y: silo.y + 2, z: silo.z }]) || at(silo.x, silo.z, A0, 260, 40);
      const ux = silo.x - p.x, uz = silo.z - p.z, ul = Math.hypot(ux, uz);
      S.shot('fixed', { pos: p, look: { x: silo.x, y: silo.y + 10, z: silo.z }, dur: 30, fov: 34, drift: { x: ux / ul * 7, y: -0.3, z: uz / ul * 7 } });
      S.log('scene', { n: 2, name: 'silo' });
      await S.wait(4.5);
    }

    // ---- 3. dàn xe lăn bánh qua máy thấp thuận nắng
    const roll = [['ALL_ROUNDER', 'tank'], ['GATLING', 'gatling'], ['ARTILLERY', 'arty'], ['SCOUT', 'scout']];
    for (const [type, nm] of roll) {
      const u = take('BLUE', [type]);
      if (!u) continue;
      const c = S.findOpen(260), mx = Math.cos(LIT + Math.PI / 2), mz = Math.sin(LIT + Math.PI / 2);
      S.freeze(u, true);
      S.teleport(u, c.x - mx * 140, c.z - mz * 140, Math.atan2(mx, -mz));
      if (type === 'ARTILLERY') { u.isDeployed = false; u.deployProgress = 0; }
      const cp = { x: c.x + Math.cos(LIT) * 70, z: c.z + Math.sin(LIT) * 70 }; cp.y = top(cp.x, cp.z) + 5;
      S.shot('fixed', { pos: cp, look: { x: c.x, y: S.ground(c.x, c.z) + 6, z: c.z }, lookAt: u, dur: 30, fov: 34 });
      S.log('scene', { n: 3, name: 'roll-' + nm });
      await S.glide([u], mx, mz, 70, 3.2);
      S.freeze(u, false);
    }

    // ---- 4. pháo tự hành bắn vào nhà
    const BS = T.buildingSet, list = (BS && BS.items || []).filter(b => !b.collapsed && b.floors <= 3 && Math.max(b.halfW, b.halfD) < 60);
    let H = null, artP = null;
    for (const b of list) {
      if (list.filter(o => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 90).length > 2) continue;
      for (let k = 0; k < 8 && !artP; k++) {
        const a = LIT + Math.PI / 2 + k * Math.PI / 4, p = { x: b.x + Math.cos(a) * 1800, z: b.z + Math.sin(a) * 1800 };
        if (flatOpen(p, 40)) artP = p;
      }
      if (artP) { H = b; break; }
    }
    const art = take('BLUE', ['ARTILLERY']);
    if (H && art) {
      const hp = { x: H.x, z: H.z }, dx = (hp.x - artP.x) / 1800, dz = (hp.z - artP.z) / 1800;
      S.freeze(art, true);
      S.teleport(art, artP.x, artP.z, Math.atan2(dx, -dz) + 0.35);
      art.isDeployed = true; art.deployProgress = 1;
      const aimAt = () => { const sol = B.solveAimingForTarget(art.x, art.y, art.z, hp.x, hp.z, T, art); S.aim(art, hp, sol ? sol.elevation : 30); if (sol && sol.charge) art.charge = sol.charge; return sol; };
      aimAt();
      // máy bên sườn xe pháo, đặt về phía mặt trời của xe (thuận sáng) — dò đường nhìn tránh cây
      const pa = findCam({ x: art.x, y: art.y + 12, z: art.z }, LIT, [80, 100], [6, 9], [{ x: art.x, y: art.y + 12, z: art.z }], 0.25) || at(art.x, art.z, LIT, 90, 6);
      S.shot('fixed', { pos: pa, look: { x: art.x + dx * 20, y: art.y + 16, z: art.z + dz * 20 }, dur: 30, fov: 38 });
      S.log('scene', { n: 4, name: 'arty-fire' });
      await S.wait(1.8);
      const before = B.activeShells.slice();
      S.fire(art);
      S.log('artyShot', {});
      await S.wait(0.05);
      const sh = newShell(art, before);
      await S.wait(0.25);
      if (sh) S.shot('shellside', { subject: art, shell: sh, dur: 30, side: 1, off: 130, hold: 3.5, fov: 44 });
      S.log('scene', { n: 5, name: 'arty-shellside', ok: !!sh });
      await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 10);
      S.log('hit1', {});
      await S.wait(3.6);
      const wp = { x: hp.x + Math.cos(LIT) * 260, z: hp.z + Math.sin(LIT) * 260 }; wp.y = top(wp.x, wp.z) + 20;
      S.shot('fixed', { pos: wp, look: { x: hp.x, y: S.ground(hp.x, hp.z) + 22, z: hp.z }, dur: 40, fov: 30 });
      S.log('scene', { n: 6, name: 'house-wide' });
      await S.wait(0.6);
      for (let i = 0; i < 4 && !H.collapsed; i++) { art.reloadTimer = 0; aimAt(); S.fire(art); await S.wait(1.3); }
      await S.wait(3.5);
      S.freeze(art, false);
    }

    // ---- 5-6. UAV cảm tử: xe pháo đỏ đặt phía mặt trời của mục tiêu -> UAV bay xuôi nắng
    const ks = S.units('RED', 'ARTILLERY').filter(u => u.uavKind === 'kami');
    S.log('kamis', { n: ks.length });
    for (let k = 0; k < Math.min(2, ks.length); k++) {
      const L = ks[k], tgt = take('BLUE', ['ALL_ROUNDER', 'GATLING']);
      if (!tgt) break;
      const c = S.findOpen(400), back = LIT + Math.PI + (k ? 0.35 : -0.25);
      S.freeze(L, true); S.freeze(tgt, true);
      S.teleport(tgt, c.x, c.z, back + Math.PI / 2);
      S.teleport(L, c.x + Math.cos(back) * 620, c.z + Math.sin(back) * 620, Math.atan2(-Math.cos(back), Math.sin(back)));
      tgt.hp = tgt.maxHp * 0.3;
      const R = g.otherDrone(L);
      if (R.bot) { R.bot.wait = 0.4; R.bot.reloadT = 0; }
      if (R.state === 'lost') R.state = 'docked';
      L.kamikazeCount = Math.max(1, L.kamikazeCount || 0);
      const okn = g.botKnownEnemy;
      g.botKnownEnemy = function (u) { return u === L ? tgt : okn.apply(this, arguments); };
      if (k === 0) S.shot('drone', { rec: R, subject: L, dur: 30, side: 1 });
      else {
        const fp = { x: tgt.x + Math.cos(LIT + 0.5) * 110, z: tgt.z + Math.sin(LIT + 0.5) * 110 }; fp.y = top(fp.x, fp.z) + 9;
        S.shot('fixed', { pos: fp, look: { x: tgt.x + Math.cos(back) * 60, y: tgt.y + 30, z: tgt.z + Math.sin(back) * 60 }, dur: 30, fov: 44 });
      }
      S.log('scene', { n: 7 + k, name: k ? 'kami-fixed' : 'kami-chase' });
      const t0 = performance.now() / 1000;
      while (performance.now() / 1000 - t0 < 18) {
        if (R.bot && R.state !== 'docked') { R.bot.tgt = tgt; R.bot.lostT = 0; }
        if (tgt.isDead || (R.state === 'lost' && performance.now() / 1000 - t0 > 2)) break;
        await S.wait(0.1);
      }
      g.botKnownEnemy = okn;
      S.log('kamiEnd', { st: R.state, dead: !!tgt.isDead });
      await S.wait(2.8);
      S.freeze(L, false); S.freeze(tgt, false);
    }
    S.log('done', {});
  } catch (e) { console.error('[R1]', e); S.log('error', { m: String(e && e.message) }); }
})();
