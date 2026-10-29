/**
 * TRAILER V12 — xe 6 nòng xả đạn vạch đường vào xe Đỏ (record.js --map RIVER_LAKE --seed 17
 *   --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1" --script .../g1.js)
 * r2.js: máy thấp lọt vào cỏ cao -> máy cao hơn (14 đv trên mặt đất / vật cản), dò đường nhìn, chếch xuống.
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;
  const shoot = (u, v) => {
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.aim(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    u.reloadTimer = 0; S.fire(u);
  };
  try {
    await S.wait(0.4);
    const gt = S.units('BLUE', 'GATLING')[0], vs = [S.units('RED', 'SCOUT')[0], S.units('RED', 'ALL_ROUNDER')[0]].filter(Boolean);
    if (!gt || !vs.length) { S.log('skip', {}); return; }
    const c = S.findOpen(320), dir = LIT + Math.PI / 2, dx = Math.cos(dir), dz = Math.sin(dir);
    S.freeze(gt, true); S.teleport(gt, c.x - dx * 130, c.z - dz * 130, Math.atan2(dx, -dz));
    vs.forEach((v, i) => { S.freeze(v, true); S.teleport(v, c.x + dx * 130 + (i - 0.5) * 60 * -dz, c.z + dz * 130 + (i - 0.5) * 60 * dx, Math.atan2(-dx, dz)); v.hp = v.maxHp * 0.45; });
    await S.wait(0.4);
    // máy phía mặt trời của trục bắn, sau lưng xe 6 nòng một chút: thấy nòng, dải đạn và xe địch cùng khung
    let cam = null;
    for (const [back, side, h] of [[40, 70, 14], [60, 90, 18], [30, 110, 22]]) {
      const p = { x: gt.x - dx * back + Math.cos(LIT) * side, z: gt.z - dz * back + Math.sin(LIT) * side }; p.y = top(p.x, p.z) + h;
      if (S.clear(p, { x: gt.x, y: gt.y + 8, z: gt.z }) && S.clear(p, { x: c.x + dx * 130, y: S.ground(c.x, c.z) + 8, z: c.z + dz * 130 })) { cam = p; break; }
    }
    cam = cam || { x: gt.x - dx * 60 + Math.cos(LIT) * 90, z: gt.z - dz * 60 + Math.sin(LIT) * 90, y: top(gt.x, gt.z) + 22 };
    S.shot('fixed', { pos: cam, look: { x: c.x + dx * 30, y: S.ground(c.x, c.z) + 6, z: c.z + dz * 30 }, dur: 30, fov: 44 });
    S.log('scene', { n: 1, name: 'gatling' });
    await S.wait(0.8);
    for (const v of vs) {
      const t0 = performance.now() / 1000;
      while (performance.now() / 1000 - t0 < 2.4 && !v.isDead) { shoot(gt, v); await S.wait(0.07); }
      await S.wait(0.6);
    }
    await S.wait(2.5);
    S.log('done', {});
  } catch (e) { console.error('[G1]', e); S.log('error', { m: String(e && e.message) }); }
})();
