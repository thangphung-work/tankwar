/**
 * LỰC LƯỢNG & LỐI CHƠI — BUỔI B (record.js --map RIVER_LAKE --seed 17 --q "ptype=ARTILLERY&calm=1&gfx=high" --script .../roles.js)
 *  1. Pháo tự hành hạ chân chống, khai hỏa (2 góc)          2. Xe trinh sát phóng tên lửa chống tăng (máy bám theo quả tên lửa)
 *  3. Đấu tay đôi trước cổng căn cứ: xuyên giáp, cháy nổ   4. Màn hình UAV trinh sát (xe người chơi)
 *  5. Màn hình UAV cảm tử lao vào xe địch (xe người chơi)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, P = g.player;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const it = T.landmarkSet && T.landmarkSet.items && T.landmarkSet.items[0];
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  try {
    await S.wait(0.4);
    // 1. pháo tự hành
    const arts = [take('BLUE', ['ARTILLERY']), take('RED', ['ARTILLERY']), take('RED', ['ARTILLERY'])].filter(Boolean);
    if (arts.length) {
      const c = S.findOpen(260), ang = sunA + Math.PI * 0.6, dx = Math.sin(ang), dz = -Math.cos(ang), px = -dz, pz = dx;
      const far = { x: c.x + dx * 3000, z: c.z + dz * 3000 };
      arts.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + px * (i - 1) * 70, c.z + pz * (i - 1) * 70, Math.atan2(dx, -dz)); u.isDeployed = false; u.deployProgress = 0; u.standStillTimer = 0; });
      const cam1 = { x: c.x + px * 40 + dx * 150, z: c.z + pz * 40 + dz * 150 }; cam1.y = S.ground(cam1.x, cam1.z) + 7;
      S.shot('fixed', { pos: cam1, look: { x: arts[0].x, y: arts[0].y + 12, z: arts[0].z }, dur: 30, fov: 34 });
      S.log('scene', { n: 1, name: 'arty-deploy' });
      await S.wait(2.8);
      arts.forEach(u => S.aim(u, far, 40));
      await S.wait(1.2);
      for (const u of arts) { S.log('artyFire', {}); S.fire(u); await S.wait(0.45); }
      await S.wait(2.0);
      const cam2 = { x: c.x - dx * 110 + px * 25, z: c.z - dz * 110 + pz * 25 }; cam2.y = S.ground(cam2.x, cam2.z) + 9;
      S.shot('fixed', { pos: cam2, look: { x: c.x + dx * 400, y: S.ground(c.x, c.z) + 60, z: c.z + dz * 400 }, dur: 30, fov: 42 });
      S.log('scene', { n: 2, name: 'arty-salvo' });
      await S.wait(0.8);
      for (const u of arts) { u.reloadTimer = 0; S.fire(u); await S.wait(0.4); }
      await S.wait(2.5);
      arts.forEach(u => S.freeze(u, false));
    }
    // 2. trinh sát phóng tên lửa
    const sc = take('BLUE', ['SCOUT']), tg = take('RED', ['ALL_ROUNDER', 'GATLING']);
    if (sc && tg) {
      const c = S.findOpen(300), ang = sunA + Math.PI * 0.4, dx = Math.sin(ang), dz = -Math.cos(ang);
      S.freeze(sc, true); S.freeze(tg, true);
      S.teleport(sc, c.x - dx * 230, c.z - dz * 230, Math.atan2(dx, -dz));
      S.teleport(tg, c.x + dx * 230, c.z + dz * 230, Math.atan2(-dz, -dx));
      tg.hp = tg.maxHp * 0.35;
      sc.selectedAmmo = 'ANTI_TANK_MISSILE';
      S.aim(sc, { x: tg.x, z: tg.z }, 1.5);
      S.shot('chase', { subject: sc, dur: 30, shellP: 1 });
      S.log('scene', { n: 3, name: 'scout-atgm' });
      await S.wait(1.6);
      sc.antiTankCooldown = 0; S.fire(sc);
      await S.until(() => tg.isDead, 6);
      await S.wait(3);
      S.freeze(sc, false); S.freeze(tg, false);
    }
    // 3. đấu tay đôi trước cổng căn cứ (máy qua vai, bám theo viên đạn)
    const a = take('BLUE', ['ALL_ROUNDER']), b = take('RED', ['ALL_ROUNDER', 'GATLING']);
    if (a && b) {
      const base = it ? { x: it.x, z: it.z } : S.findOpen(300);
      const ang = sunA + Math.PI * 0.7, dx = Math.sin(ang), dz = -Math.cos(ang);
      const R = it ? it.reach || 500 : 300;
      const c = { x: base.x + dx * (R + 120), z: base.z + dz * (R + 120) };
      S.duel(a, b, c, 300, 0.2, true);
      S.freeze(a, true); S.freeze(b, true);
      S.log('scene', { n: 4, name: 'gate-duel' });
      S.shot('shoulder', { subject: a, target: b, dur: 30, shellP: 1, side: 1 });
      for (let k = 0; k < 4 && !b.isDead; k++) {
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        S.aim(a, { x: b.x, y: b.y + 9, z: b.z }, Math.atan2(b.y + 9 - (a.y + 14), d) * 180 / Math.PI + 0.15);
        await S.wait(1.3); S.fire(a); await S.wait(2.6);
      }
      // xác xe cháy: máy tĩnh cự ly vừa
      const pw = { x: b.x + Math.cos(sunA + 2) * 140, z: b.z + Math.sin(sunA + 2) * 140 }; pw.y = S.ground(pw.x, pw.z) + 10;
      S.shot('fixed', { pos: pw, look: { x: b.x, y: b.y + 10, z: b.z }, dur: 30, fov: 36 });
      await S.wait(5);
      S.freeze(a, false); S.freeze(b, false);
    }
    // 4–5. xe người chơi là pháo tự hành: UAV trinh sát rồi UAV cảm tử
    if (P.tankType === 'ARTILLERY') {
      const c = S.findOpen(400), ang = sunA + Math.PI * 0.5, dx = Math.sin(ang), dz = -Math.cos(ang);
      S.drive(true);
      S.teleport(P, c.x - dx * 320, c.z - dz * 320, Math.atan2(dx, -dz));
      const reds = [take('RED', ['ALL_ROUNDER']), take('RED', ['GATLING', 'SCOUT']), take('RED', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);
      reds.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + dx * 330 + (i - 1) * 70 * -dz, c.z + dz * 330 + (i - 1) * 70 * dx, Math.atan2(-dx, dz)); u.hp = u.maxHp * 0.4; });
      await S.wait(0.8);
      // UAV trinh sát
      S.pov(true); g.setSightMode(true);
      S.log('scene', { n: 5, name: 'recon-drone' });
      const D = g.droneState();
      await S.wait(2.5);
      D.yaw = Math.atan2(-dx, -dz);
      S.keys({ KeyW: true }); await S.wait(4); S.keys({ KeyW: false });
      await S.wait(1.5);
      g.setSightMode(false); S.pov(false);
      await S.wait(1.5);
      // UAV cảm tử
      if (typeof Equipment !== 'undefined' && (!P.kamiRack || (P.kamikazeCount || 0) <= 0)) {
        try { Equipment.equip(P, { m: ['kami'], p: [], a: { KAMIKAZE: 2 } }, { local: true, stock: { KAMIKAZE: 9 } }); } catch (e) { console.error('[ROLES] equip', e); }
      }
      P.kamikazeCount = Math.max(1, P.kamikazeCount || 0);
      const Dr = g.droneState(); Dr.state = 'docked'; Dr.reloadT = 0;
      S.pov(true); g.launchKami(); await S.wait(0.5); g.setSightMode(true);
      S.log('scene', { n: 6, name: 'kami-fpv' });
      await S.wait(1.6);
      if (reds[0]) { Dr.lock = reds[0]; Dr.attack = null; g.kamiTryLock(); }
      await S.until(() => Dr.state !== 'launching' && Dr.state !== 'flying', 16);
      await S.wait(1.6);
      g.setSightMode(false); S.pov(false); S.drive(false);
      reds.forEach(u => S.freeze(u, false));
    }
    S.log('done', {});
  } catch (e) { console.error('[ROLES]', e); S.log('error', { m: String(e && e.message) }); }
})();
