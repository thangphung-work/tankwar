/**
 * GÓC NHÌN CHỦ QUAN 2 (record.js --map RIVER_LAKE --seed 15 --q "ptype=ARTILLERY|GATLING&calm=1&fog=0.5&gfx=high" --script .../pov2.js)
 *  - ARTILLERY: UAV TRINH SÁT — màn hình drone cất cánh từ nóc xe pháo, bay tới soi đội hình xe địch trong mưa
 *  - GATLING:   PHÒNG KHÔNG — drone trinh sát địch bay tới; kính ngắm xe 6 nòng khóa drone, xả đạn tới khi drone rơi
 */
(async () => {
  const S = __TR.scene, g = window.game, P = g.player;
  try {
    await S.wait(0.5);
    const c = S.findOpen(400), ang = S.rnd() * Math.PI * 2, dx = Math.sin(ang), dz = -Math.cos(ang);
    S.drive(true);
    S.teleport(P, c.x - dx * 300, c.z - dz * 300, Math.atan2(dx, -dz));
    if (P.tankType === 'ARTILLERY') {
      // đội hình địch phía trước
      const reds = S.units('RED').filter(u => u.tankType !== 'ARTILLERY').slice(0, 4);
      reds.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + dx * 260 + (i - 1.5) * 70 * -dz, c.z + dz * 260 + (i - 1.5) * 70 * dx, Math.atan2(-dx, dz)); });
      await S.wait(0.8);
      S.pov(true);
      g.setSightMode(true);
      S.log('scene', { n: 1, name: 'recon-drone' });
      const D = g.droneState();
      await S.wait(2.5);   // drone thẳng lên độ cao làm việc
      D.yaw = Math.atan2(-dx, -dz);   // mũi drone hướng về đội hình địch
      S.keys({ KeyW: true });
      await S.wait(4.5);
      S.keys({ KeyW: false });
      await S.wait(3);
      g.setSightMode(false);
      S.pov(false);
      reds.forEach(u => S.freeze(u, false));
    } else if (P.tankType === 'GATLING') {
      // drone trinh sát địch cất cánh từ xe pháo đỏ phía trước, bay tới quan sát xe mình
      const L = S.units('RED', 'ARTILLERY').find(u => u.uavKind !== 'kami');
      if (!L || !g.otherDrone) { S.log('skip', { why: 'no recon' }); return; }
      S.freeze(L, true); S.teleport(L, c.x + dx * 700, c.z + dz * 700, Math.atan2(-dx, dz));
      const R = g.otherDrone(L);
      if (R.bot) R.bot.wait = 0.2;
      S.shot('fixed', { pos: { x: P.x - dx * 60 + dz * 30, y: S.ground(P.x, P.z) + 10, z: P.z - dz * 60 - dx * 30 }, look: { x: c.x + dx * 400, y: S.ground(c.x, c.z) + 200, z: c.z + dz * 400 }, dur: 30, fov: 46, noDrone: true });
      await S.until(() => R.state === 'flying' && Math.hypot(R.x - P.x, R.z - P.z) < 900, 25);
      S.log('droneNear', { st: R.state, d: Math.round(Math.hypot(R.x - P.x, R.z - P.z)) });
      S.pov(true);
      g.setAirAim({ kind: 'drone', dr: R, hard: true });
      g.setSightMode(true);
      S.log('scene', { n: 2, name: 'aa-sight' });
      await S.wait(1.5);
      const t0 = performance.now() / 1000;
      while ((R.state === 'flying' || R.state === 'returning') && performance.now() / 1000 - t0 < 14) {
        if (!g._airAim) g.setAirAim({ kind: 'drone', dr: R, hard: true });
        S.keys({ Space: true }); await S.wait(1.6);
        S.keys({ Space: false }); await S.wait(0.5);
      }
      S.keys({ Space: false });
      S.log('aaEnd', { st: R.state });
      await S.wait(3);
      g.setSightMode(false);
      S.pov(false);
    }
    S.drive(false);
    S.log('done', {});
  } catch (e) { console.error('[POV2]', e); S.log('error', { m: String(e && e.message) }); }
})();
