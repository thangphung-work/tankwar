/**
 * GÓC NHÌN CHỦ QUAN 3 — trời nắng (record.js --map RIVER_LAKE --seed 17 --q "ptype=ARTILLERY|GATLING&calm=1&gfx=high" --script .../pov3.js)
 *  - ARTILLERY: màn hình UAV trinh sát soi đội hình địch, rồi UAV cảm tử lao vào xe địch
 *  - GATLING:   phòng không — kính ngắm xe 6 nòng khóa drone trinh sát địch, xả đạn tới khi drone rơi
 */
(async () => {
  const S = __TR.scene, g = window.game, P = g.player;
  const sun = (g.terrain.map && g.terrain.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  try {
    await S.wait(0.5);
    const c = S.findOpen(400), ang = sunA + Math.PI * 0.55, dx = Math.sin(ang), dz = -Math.cos(ang);
    const foes = S.units().filter(u => u !== P && u.team !== P.team);
    S.drive(true);
    S.teleport(P, c.x - dx * 300, c.z - dz * 300, Math.atan2(dx, -dz));
    if (P.tankType === 'ARTILLERY') {
      const reds = foes.filter(u => u.tankType !== 'ARTILLERY').slice(0, 4);
      reds.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + dx * 260 + (i - 1.5) * 70 * -dz, c.z + dz * 260 + (i - 1.5) * 70 * dx, Math.atan2(-dx, dz)); u.hp = u.maxHp * 0.4; });
      await S.wait(0.8);
      // UAV trinh sát
      S.pov(true); g.setSightMode(true);
      S.log('scene', { n: 1, name: 'recon-drone' });
      const D = g.droneState();
      await S.wait(2.5);
      D.yaw = Math.atan2(-dx, -dz);
      S.keys({ KeyW: true }); await S.wait(4.5); S.keys({ KeyW: false });
      await S.wait(2.5);
      g.setSightMode(false); S.pov(false);
      await S.wait(1.2);
      // UAV cảm tử
      if (typeof Equipment !== 'undefined' && (P.uavKind !== 'kami' || (P.kamikazeCount || 0) <= 0)) {
        try { Equipment.equip(P, { m: ['kami'], p: [], a: { KAMIKAZE: 2 } }, { local: true, stock: { KAMIKAZE: 9 } }); } catch (e) { console.error('[POV3] equip', e); }
      }
      P.kamikazeCount = Math.max(1, P.kamikazeCount || 0);
      S.log('kamiKit', { kind: P.uavKind, n: P.kamikazeCount });
      const Dr = g.droneState(); Dr.state = 'docked'; Dr.reloadT = 0;
      S.pov(true); g.launchKami(); await S.wait(0.5); g.setSightMode(true);
      S.log('scene', { n: 2, name: 'kami-fpv' });
      await S.wait(1.6);
      if (reds[1]) { Dr.lock = reds[1]; Dr.attack = null; g.kamiTryLock(); }
      await S.until(() => Dr.state !== 'launching' && Dr.state !== 'flying', 16);
      S.log('kamiEnd', { st: Dr.state });
      await S.wait(1.6);
      g.setSightMode(false); S.pov(false);
      reds.forEach(u => S.freeze(u, false));
    } else if (P.tankType === 'GATLING') {
      const arts = foes.filter(u => u.tankType === 'ARTILLERY');
      S.log('foes', { n: foes.length, arts: arts.map(u => u.uavKind || '-') });
      const L = arts.find(u => u.uavKind !== 'kami') || arts[0];
      if (!L) { S.log('skip', { why: 'no arty' }); return; }
      if (L.uavKind === 'kami') L.uavKind = 'recon';
      S.freeze(L, true); S.teleport(L, c.x + dx * 700, c.z + dz * 700, Math.atan2(-dx, dz));
      const R = g.otherDrone(L);
      if (R.bot) R.bot.wait = 0.2;
      S.shot('fixed', { pos: { x: P.x - dx * 60 + dz * 30, y: S.ground(P.x, P.z) + 10, z: P.z - dz * 60 - dx * 30 }, look: { x: c.x + dx * 400, y: S.ground(c.x, c.z) + 200, z: c.z + dz * 400 }, dur: 30, fov: 46, noDrone: true });
      await S.until(() => R.state === 'flying' && Math.hypot(R.x - P.x, R.z - P.z) < 900, 25);
      S.log('droneNear', { st: R.state, d: Math.round(Math.hypot(R.x - P.x, R.z - P.z)) });
      S.pov(true);
      g.setAirAim({ kind: 'drone', dr: R, hard: true });
      g.setSightMode(true);
      S.log('scene', { n: 3, name: 'aa-sight' });
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
      g.setSightMode(false); S.pov(false);
    }
    S.drive(false);
    S.log('done', {});
  } catch (e) { console.error('[POV3]', e); S.log('error', { m: String(e && e.message) }); }
})();
