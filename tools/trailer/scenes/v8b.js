/**
 * V1 CHUỐT LẠI — quay bù 2 (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1" --script .../v8b.js)
 *  1. Pháo tự hành khai hỏa (máy thuận sáng bên sườn) -> máy bay song song viên đạn cầu vồng -> nổ giữa cụm xe, sóng xung kích
 *  2. Loạt thứ hai nhìn góc rộng (máy tĩnh) — chờ đúng tới lúc đạn rơi
 *  3. Flycam cao, xa trên cứ điểm làm nền logo
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics, TR = window.__TR;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;
  const newShell = (u, before) => B.activeShells.find(s => s.shooterId === u.id && !before.includes(s)) || null;
  const impactNear = (p, from, r) => TR.log.slice(from).find(e => e.type === 'impact' && Math.hypot(e.x - p.x, e.z - p.z) < r);
  try {
    await S.wait(0.4);
    const art = take('BLUE', ['ARTILLERY']);
    const reds = [take('RED', ['ALL_ROUNDER']), take('RED', ['GATLING', 'SCOUT']), take('RED', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);
    if (art && reds.length) {
      const c = S.findOpen(420), dir = LIT + Math.PI / 2, dx = Math.cos(dir), dz = Math.sin(dir);
      const tg = { x: c.x + dx * 1200, z: c.z + dz * 1200 };   // ~2,4 km: đạn bay đủ lâu để bám theo
      S.freeze(art, true);
      S.teleport(art, c.x - dx * 1200, c.z - dz * 1200, Math.atan2(dx, -dz) + 0.35);
      const place = () => reds.forEach((u, i) => { if (u.isDead) return; S.freeze(u, true); S.teleport(u, tg.x + (i - 1) * 24 * -dz + (S.rnd() - 0.5) * 8, tg.z + (i - 1) * 24 * dx, Math.atan2(-dx, dz) + (S.rnd() - 0.5)); u.hp = u.maxHp * 0.25; });
      place();
      art.isDeployed = true; art.deployProgress = 1;
      // liều phóng theo lời giải (giống máy tính hỏa lực của game) — thiếu bước này đạn bay liều đầy, vọt 4 km rồi tự hủy
      const aimAt = (p) => { const sol = B.solveAimingForTarget(art.x, art.y, art.z, p.x, p.z, T, art); S.aim(art, p, sol ? sol.elevation : 40); if (sol && sol.charge) art.charge = sol.charge; return sol; };
      const sol = aimAt(tg);
      // 1a. máy thuận sáng bên sườn xe pháo
      const pa = { x: art.x + Math.cos(LIT) * 85 + dx * 30, z: art.z + Math.sin(LIT) * 85 + dz * 30 }; pa.y = top(pa.x, pa.z) + 6;
      S.shot('fixed', { pos: pa, look: { x: art.x + dx * 20, y: art.y + 16, z: art.z + dz * 20 }, dur: 30, fov: 38 });
      S.log('scene', { n: 1, name: 'arty-fire', el: sol && sol.elevation, ch: sol && sol.charge, ft: sol && sol.flightTime, d: Math.round(Math.hypot(tg.x - art.x, tg.z - art.z)) });
      await S.wait(1.8);
      let before = B.activeShells.slice(), mark = TR.log.length;
      S.fire(art);
      await S.wait(0.05);
      const sh = newShell(art, before);
      S.log('shell', { ok: !!sh });
      await S.wait(0.3);
      // 1b. bay song song viên đạn
      if (sh) S.shot('shellside', { subject: art, shell: sh, dur: 30, side: 1, off: 130, hold: 4, fov: 44 });
      S.log('scene', { n: 2, name: 'arty-shellside' });
      await S.until(() => impactNear(tg, mark, 260), 14);
      S.log('impact1', {});
      await S.wait(4.2);
      // 2. góc rộng: loạt thứ hai vào cụm xe khác (khói loạt 1 không che), cách chỗ cũ ~260 m về phía xe pháo
      const tg2 = { x: tg.x - dx * 300 + Math.cos(LIT) * 60, z: tg.z - dz * 300 + Math.sin(LIT) * 60 };
      const reds2 = [take('RED', ['ALL_ROUNDER', 'GATLING']), take('RED', ['GATLING', 'SCOUT', 'ALL_ROUNDER'])].filter(Boolean);
      reds2.forEach((u, i) => { S.freeze(u, true); S.teleport(u, tg2.x + (i - 0.5) * 26 * -dz, tg2.z + (i - 0.5) * 26 * dx, Math.atan2(-dx, dz) + (S.rnd() - 0.5)); u.hp = u.maxHp * 0.2; });
      const wp = { x: tg2.x + Math.cos(LIT) * 240, z: tg2.z + Math.sin(LIT) * 240 }; wp.y = top(wp.x, wp.z) + 24;
      S.shot('fixed', { pos: wp, look: { x: tg2.x, y: S.ground(tg2.x, tg2.z) + 12, z: tg2.z }, dur: 30, fov: 32 });
      S.log('scene', { n: 3, name: 'arty-impact-wide' });
      await S.wait(0.6);
      mark = TR.log.length; art.reloadTimer = 0; const sol2 = aimAt(tg2); S.fire(art);
      S.log('fire2', { el: sol2 && sol2.elevation, ft: sol2 && sol2.flightTime });
      await S.until(() => impactNear(tg2, mark, 260), 14);
      reds2.forEach(u => S.freeze(u, false));
      S.log('impact2', {});
      await S.wait(4.5);
      reds.forEach(u => S.freeze(u, false));
      S.freeze(art, false);
    }
    // 3. flycam cao trên cứ điểm
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      const p = { x: K.x + Math.cos(LIT) * 950, z: K.z + Math.sin(LIT) * 950 }; p.y = top(p.x, p.z) + 300;
      const sx = -Math.sin(LIT) * 12, sz = Math.cos(LIT) * 12;
      S.shot('fixed', { pos: p, look: { x: K.x, y: S.ground(K.x, K.z) + 10, z: K.z }, dur: 30, fov: 24, drift: { x: sx, y: -2, z: sz } });
      S.log('scene', { n: 4, name: 'stronghold-aerial' });
      await S.wait(8);
    }
    S.log('done', {});
  } catch (e) { console.error('[V8B]', e); S.log('error', { m: String(e && e.message) }); }
})();
