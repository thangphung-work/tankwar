/**
 * ĐÔ THỊ DƯỚI MƯA (record.js --map URBAN --seed 3 --q "ptype=SCOUT&calm=1&fog=0.6&gfx=high" --script .../street.js)
 *  1. Xe trinh sát (xe người chơi tự lái) lao nhanh dọc phố — máy sát đất đứng chờ, xe vụt qua; rồi máy bám hông
 *  2. Xe trinh sát (bot, đứng yên) phóng TÊN LỬA CHỐNG TĂNG vào xe tăng địch cuối phố — máy sau lưng, bám theo quả tên lửa
 *  3. Pháo 6 nòng xả đạn vạch đường dọc phố vào cụm xe địch (AI tự bắn) — máy sát đất ngang hông, rồi máy trước mặt lệch bên
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // đường thẳng thông thoáng dài L (không nhà / gò), mặt phẳng — chọn quanh các ô tô đỗ ven đường (ô tô đỗ dọc đường)
  const T = g.terrain;
  const cars = ((T.propSet && T.propSet.data && T.propSet.data.cars) || []).filter(o => !o.burnt);
  function street(L) {
    for (let i = 0; i < 300; i++) {
      const o = cars[Math.floor(S.rnd() * cars.length)];
      if (!o) break;
      const a0 = o.angle || 0;
      for (const [dx, dz] of [[Math.cos(a0), Math.sin(a0)], [Math.sin(a0), Math.cos(a0)]]) {
        // tim đường lệch khỏi hàng xe đỗ ~22 đv
        for (const off of [22, -22]) {
          const sx = o.x - dz * off - dx * L / 2, sz = o.z + dx * off - dz * L / 2, h0 = S.ground(sx, sz);
          let ok = true;
          for (let t = 0; t <= L && ok; t += 12) {
            const x = sx + dx * t, z = sz + dz * t;
            if (S.obstacleTop(x, z) - S.ground(x, z) > 2 || Math.abs(S.ground(x, z) - h0) > 10) ok = false;
            else if (cars.some(c => Math.hypot(c.x - x, c.z - z) < 14)) ok = false;
          }
          if (ok) return { sx, sz, dx, dz, L };
        }
      }
    }
    return null;
  }
  try {
    await S.wait(0.4);
    // ---------- 1. trinh sát lao qua phố
    const P = g.player;
    const st = street(700);
    if (st && P.tankType === 'SCOUT') {
      S.drive(true);
      S.teleport(P, st.sx, st.sz, Math.atan2(st.dx, -st.dz));
      const mid = { x: st.sx + st.dx * 380, z: st.sz + st.dz * 380 };
      const cam = { x: mid.x - st.dz * 20, z: mid.z + st.dx * 20 }; cam.y = S.ground(cam.x, cam.z) + 3;
      S.shot('fixed', { pos: cam, look: { x: st.sx, y: S.ground(st.sx, st.sz) + 6, z: st.sz }, lookAt: P, dur: 30, fov: 40, noDrone: true });
      S.log('scene', { n: 1, name: 'scout-dash' });
      await S.wait(0.4);
      S.keys({ KeyW: true, ShiftLeft: true });
      await S.until(() => (P.x - mid.x) * st.dx + (P.z - mid.z) * st.dz > 60, 9);
      S.shot('low', { subject: P, dur: 30, shellP: 0, noDrone: true, side: 1 });
      await S.wait(3);
      S.keys({ KeyW: false, ShiftLeft: false });
      await S.wait(0.4);
      S.drive(false);
    } else S.log('skip', { n: 1 });

    // ---------- 2. tên lửa chống tăng
    const sc = S.units('BLUE', 'SCOUT')[0], tg = S.units('RED', 'ALL_ROUNDER')[0];
    const st2 = street(520);
    if (sc && tg && st2) {
      S.freeze(sc, true); S.freeze(tg, true);
      S.teleport(sc, st2.sx, st2.sz, Math.atan2(st2.dx, -st2.dz));
      S.teleport(tg, st2.sx + st2.dx * 480, st2.sz + st2.dz * 480, Math.atan2(-st2.dz, -st2.dx));
      tg.hp = tg.maxHp * 0.35;
      sc.selectedAmmo = 'ANTI_TANK_MISSILE';
      S.aim(sc, { x: tg.x, y: tg.y + 8, z: tg.z }, 1.5);
      S.shot('chase', { subject: sc, dur: 30, shellP: 1, noDrone: true });
      S.log('scene', { n: 2, name: 'scout-atgm' });
      await S.wait(1.6);
      sc.antiTankCooldown = 0;
      S.fire(sc);
      await S.until(() => tg.isDead, 6);
      await S.wait(3);
      S.freeze(sc, false); S.freeze(tg, false);
    } else S.log('skip', { n: 2 });

    // ---------- 3. pháo 6 nòng xả đạn dọc phố
    const gt = S.units('BLUE', 'GATLING')[0];
    const foes = S.units('RED').filter(u => u.tankType !== 'ARTILLERY').slice(1, 3);
    const st3 = street(420);
    if (gt && foes.length && st3) {
      S.teleport(gt, st3.sx, st3.sz, Math.atan2(st3.dx, -st3.dz));
      foes.forEach((u, i) => { S.freeze(u, true); S.teleport(u, st3.sx + st3.dx * 300 + (i - 0.5) * 30 * -st3.dz, st3.sz + st3.dz * 300 + (i - 0.5) * 30 * st3.dx, S.rnd() * 6.28); u.hp = u.maxHp * 0.5; });
      S.freeze(gt, false);   // AI tự ngắm & xả đạn
      S.shot('low', { subject: gt, dur: 30, shellP: 0, noDrone: true, side: -1 });
      S.log('scene', { n: 3, name: 'gatling-street' });
      await S.wait(5);
      S.shot('front', { subject: gt, target: foes[0], dur: 30, shellP: 0, noDrone: true });
      await S.wait(4);
      foes.forEach(u => S.freeze(u, false));
    } else S.log('skip', { n: 3 });
    S.log('done', {});
  } catch (e) { console.error('[STREET]', e); S.log('error', { m: String(e && e.message) }); }
})();
