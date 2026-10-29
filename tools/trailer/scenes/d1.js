/**
 * TRAILER V12 — BUỔI D: SA MẠC (record.js --map DESERT --seed 5 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1" --script .../d1.js)
 *  1. Flycam toàn cảnh công trình lớn của bản đồ (thuận nắng, trôi chậm)
 *  2. Đấu tay đôi: qua vai xe Xanh, bám viên đạn, xuyên giáp -> xe Đỏ bốc cháy (máy tĩnh nhìn xác xe)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;
  const at = (cx, cz, a, d, h) => { const p = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }; p.y = top(p.x, p.z) + h; return p; };
  try {
    await S.wait(0.4);
    const it = T.landmarkSet && T.landmarkSet.items && T.landmarkSet.items[0];
    if (it) {
      const R = it.reach || 500, gy = it.G || S.ground(it.x, it.z);
      S.shot('fixed', { pos: at(it.x, it.z, LIT, R + 650, 240), look: { x: it.x, y: gy + 20, z: it.z }, dur: 30, fov: 36, drift: { x: -Math.sin(LIT) * 22, y: -3, z: Math.cos(LIT) * 22 } });
      S.log('scene', { n: 1, name: 'landmark', kind: it.kind });
      await S.wait(6);
    }
    const a = S.units('BLUE', 'ALL_ROUNDER')[0], b = S.units('RED', 'ALL_ROUNDER')[0] || S.units('RED', 'GATLING')[0];
    if (a && b) {
      const c = S.findOpen(320);
      S.duel(a, b, c, 300, 0.2, true);
      S.freeze(a, true); S.freeze(b, true);
      S.shot('shoulder', { subject: a, target: b, dur: 30, shellP: 1, side: 1 });
      S.log('scene', { n: 2, name: 'duel' });
      for (let k = 0; k < 4 && !b.isDead; k++) {
        const sol = B.solveAimingForTarget(a.x, a.y, a.z, b.x, b.z, T, a, { atUnit: true });
        S.aim(a, { x: b.x, y: b.y + 9, z: b.z }, sol ? sol.elevation : 1);
        await S.wait(1.3); a.reloadTimer = 0; S.fire(a); await S.wait(2.6);
      }
      const pw = at(b.x, b.z, LIT, 140, 10);
      S.shot('fixed', { pos: pw, look: { x: b.x, y: b.y + 10, z: b.z }, dur: 30, fov: 36 });
      S.log('scene', { n: 3, name: 'wreck', dead: !!b.isDead });
      await S.wait(5);
    }
    S.log('done', {});
  } catch (e) { console.error('[D1]', e); S.log('error', { m: String(e && e.message) }); }
})();
