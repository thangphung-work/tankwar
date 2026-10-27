/**
 * KỊCH BẢN SHOWCASE (record.js --map URBAN --q ptype=ALL_ROUNDER --script tools/trailer/scenes/showcase.js)
 *  1. Dàn 4 loại xe: camera vòng quanh từng chiếc
 *  2. Bắn thử: xe tăng khai hỏa (máy sát đất), pháo tự hành bắn cầu vồng (camera bay theo đạn), xe trinh sát phóng tên lửa
 *  3. Xe tăng cán bẹp ô tô dân sự trên phố (xe người chơi tự lái bằng phím)
 *  4. UAV cảm tử phóng khỏi ống, bổ nhào vào xe địch
 *  5. Drone trinh sát bay tới, pháo 6 nòng phòng không bắn hạ
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const one = (team, type) => S.units(team, type)[0];
  const lineup = [];

  try {
    await S.wait(0.5);
    // ---------------- 1. dàn xe
    const types = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
    const c = S.findOpen(320);
    const ang = S.rnd() * Math.PI * 2, ax = Math.cos(ang), az = Math.sin(ang);   // trục hàng xe
    const faceDir = { x: -az, z: ax };   // các xe cùng nhìn vuông góc với hàng
    types.forEach((t, i) => {
      const u = one('BLUE', t);
      if (!u) return;
      const x = c.x + ax * (i - 1.5) * 170, z = c.z + az * (i - 1.5) * 170;
      S.freeze(u, true);
      S.teleport(u, x, z, Math.atan2(faceDir.x, -faceDir.z));
      S.aim(u, { x: x + faceDir.x * 500, z: z + faceDir.z * 500 }, 2);
      lineup.push(u);
    });
    await S.wait(0.6);
    S.log('scene', { n: 1, name: 'roster' });
    for (const u of lineup) {
      S.log('roster', { tt: u.tankType, u: u.id });
      S.shot('orbit', { subject: u, dur: 4.1, shellP: 0, noDrone: true });
      await S.wait(3.8);
    }

    // ---------------- 2. bắn thử
    S.log('scene', { n: 2, name: 'firing' });
    const tank = lineup.find(u => u.tankType === 'ALL_ROUNDER'), arty = lineup.find(u => u.tankType === 'ARTILLERY'), scout = lineup.find(u => u.tankType === 'SCOUT');
    if (tank) {
      S.shot('shoulder', { subject: tank, dur: 9, shellP: 1, side: 1, noDrone: true });
      await S.wait(1.2);
      S.aim(tank, { x: tank.x + faceDir.x * 700, z: tank.z + faceDir.z * 700 }, 1);
      S.log('fireTest', { tt: 'ALL_ROUNDER' });
      S.fire(tank);
      await S.wait(5.5);
    }
    if (arty) {
      S.aim(arty, { x: arty.x + faceDir.x * 2000, z: arty.z + faceDir.z * 2000 }, 38);
      const sa = arty.bodyAngle + Math.PI / 2, sx = arty.x + Math.sin(sa) * 150 + faceDir.x * 70, sz = arty.z - Math.cos(sa) * 150 + faceDir.z * 70;
      S.shot('fixed', { pos: { x: sx, y: S.ground(sx, sz) + 14, z: sz }, look: { x: arty.x + faceDir.x * 30, y: arty.y + 30, z: arty.z + faceDir.z * 30 }, dur: 6, fov: 46, noDrone: true, drift: { x: 0, y: 1, z: 0 } });
      await S.wait(1.8);
      S.log('fireTest', { tt: 'ARTILLERY' });
      S.fire(arty);
      await S.wait(4);
    }
    if (scout) {
      scout.selectedAmmo = 'ANTI_TANK_MISSILE';
      S.aim(scout, { x: scout.x + faceDir.x * 900, z: scout.z + faceDir.z * 900 }, 3);
      S.shot('chase', { subject: scout, dur: 9, shellP: 1, noDrone: true });
      await S.wait(1.2);
      S.log('fireTest', { tt: 'SCOUT' });
      S.fire(scout);
      await S.wait(6);
    }
    lineup.forEach(u => S.freeze(u, false));

    // ---------------- 3. cán ô tô dân sự
    const T = g.terrain;
    const pools = [T.propSet && T.propSet.data && T.propSet.data.cars, T.map && T.map.props && T.map.props.cars, T.map && T.map.cars];
    const cars = (pools.find(p => p && p.length) || []).filter(o => !o.burnt && !o.crushed && !(o.c > 0.3));
    if (cars.length) {
      // ô tô có lối chạy thẳng tới (130 đv trước mặt không vướng nhà / dốc)
      let best = null;
      for (let i = 0; i < 80 && !best; i++) {
        const o = cars[Math.floor(S.rnd() * cars.length)];
        for (let k = 0; k < 8 && !best; k++) {
          const a = k * Math.PI / 4 + S.rnd() * 0.3, sx = o.x + Math.sin(a) * 150, sz = o.z - Math.cos(a) * 150;
          let ok = true;
          for (let t = 0; t <= 1.25 && ok; t += 0.05) {
            const x = sx + (o.x - sx) * t, z = sz + (o.z - sz) * t;
            if (S.obstacleTop(x, z) - S.ground(x, z) > 2 || Math.abs(S.ground(x, z) - S.ground(o.x, o.z)) > 12) ok = false;
          }
          if (ok) best = { o, sx, sz };
        }
      }
      if (best) {
        const P = S.drive(true), o = best.o;
        S.teleport(P, best.sx, best.sz, Math.atan2(o.x - best.sx, -(o.z - best.sz)));
        P.azimuth = ((P.bodyAngle * 180 / Math.PI) % 360 + 360) % 360;
        // máy đặt thấp cạnh ô tô, nhìn theo xe tăng lao tới
        const sa = Math.atan2(o.x - best.sx, -(o.z - best.sz)) + Math.PI / 2;
        const cp = { x: o.x + Math.sin(sa) * 55 + (best.sx - o.x) * 0.12, z: o.z - Math.cos(sa) * 55 + (best.sz - o.z) * 0.12 };
        cp.y = S.ground(cp.x, cp.z) + 7;
        S.shot('fixed', { pos: cp, look: { x: o.x, y: S.ground(o.x, o.z) + 5, z: o.z }, lookAt: P, dur: 30, fov: 48, noDrone: true });
        S.log('scene', { n: 3, name: 'crush', car: o.kind || '' });
        await S.wait(0.6);
        // chỉnh hướng theo chiều xe thật sự chạy (quy ước góc thân xe)
        S.keys({ KeyW: true });
        const p0 = { x: P.x, z: P.z };
        await S.wait(0.5);
        const mv = { x: P.x - p0.x, z: P.z - p0.z }, want = { x: o.x - p0.x, z: o.z - p0.z };
        if (Math.hypot(mv.x, mv.z) > 1) {
          const err = Math.atan2(want.x, -want.z) - Math.atan2(mv.x, -mv.z);
          if (Math.abs(Math.atan2(Math.sin(err), Math.cos(err))) > 0.15) { S.keys({ KeyW: false }); S.teleport(P, p0.x, p0.z, P.bodyAngle + err); await S.wait(0.2); S.keys({ KeyW: true }); S.log('steerFix', { err: +err.toFixed(2) }); }
        }
        await S.until(() => dist(P, o) < 6, 9);
        S.log('crushHit', {});
        await S.wait(2.2);
        S.shot('chase', { subject: P, dur: 4, shellP: 0, noDrone: true });
        await S.wait(3);
        S.keys({ KeyW: false });
        await S.wait(1);
        S.drive(false);
      } else S.log('skip', { n: 3 });
    }

    // ---------------- 4. UAV cảm tử
    const kamis = S.units(null, 'ARTILLERY').filter(u => u.uavKind === 'kami' && (u.kamikazeCount || 0) > 0);
    if (kamis.length && g.otherDrone) {
      const A = kamis[0], foeTeam = A.team === 'BLUE' ? 'RED' : 'BLUE';
      const tgt = one(foeTeam, 'ALL_ROUNDER') || S.units(foeTeam)[0];
      const c2 = S.findOpen(300);
      S.freeze(A, true);
      S.teleport(A, c2.x - 450, c2.z, 0);
      S.teleport(tgt, c2.x + 450, c2.z, Math.PI / 2);
      S.freeze(tgt, true);
      const R = g.otherDrone(A);
      if (R.bot) R.bot.wait = 0.4;
      S.shot('orbit', { subject: A, dur: 20, shellP: 0, noDrone: true });
      S.log('scene', { n: 4, name: 'kamikaze' });
      await S.until(() => R.state === 'launching' || R.state === 'flying', 10);
      S.shot('drone', { rec: R, subject: A, dur: 40, noDrone: true });
      await S.until(() => R.state !== 'launching' && R.state !== 'flying', 25);
      await S.wait(3.5);
      S.freeze(A, false); S.freeze(tgt, false);
    } else S.log('skip', { n: 4, why: 'no kami' });

    // ---------------- 5. drone trinh sát bị pháo 6 nòng bắn hạ
    const recon = S.units(null, 'ARTILLERY').find(u => u.uavKind !== 'kami');
    if (recon && g.otherDrone) {
      const foe = recon.team === 'BLUE' ? 'RED' : 'BLUE';
      const gats = S.units(foe, 'GATLING').slice(0, 2);
      const c3 = S.findOpen(300);
      S.teleport(recon, c3.x - 500, c3.z, 0); S.freeze(recon, true);
      gats.forEach((u, i) => S.teleport(u, c3.x + 250, c3.z + (i - 0.5) * 80, -Math.PI / 2));
      const R = g.otherDrone(recon);
      if (R.bot) R.bot.wait = 0.3;
      S.log('scene', { n: 5, name: 'aa' });
      await S.until(() => R.state === 'launching' || R.state === 'flying', 10);
      S.shot('drone', { rec: R, subject: recon, dur: 40, noDrone: true });
      await S.until(() => R.state !== 'launching' && R.state !== 'flying', 14);
      await S.wait(3);
      S.freeze(recon, false);
    } else S.log('skip', { n: 5 });
    S.log('done', {});
  } catch (e) { console.error('[SHOWCASE]', e); S.log('error', { m: String(e && e.message) }); }
})();
