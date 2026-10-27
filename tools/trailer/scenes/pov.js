/**
 * GÓC NHÌN CHỦ QUAN (record.js --q "ptype=ALL_ROUNDER|ARTILLERY" --script tools/trailer/scenes/pov.js)
 *  - Xe người chơi là xe tăng: nhìn QUA KÍNH NGẮM pháo thủ — khóa xe địch (nòng tự tính góc), khai hỏa, đạn bay, trúng
 *  - Xe người chơi là pháo tự hành: phóng UAV CẢM TỬ, màn hình camera UAV — khóa mục tiêu, tự lao vào tới lúc chạm
 * Camera & giao diện kính ngắm / màn hình UAV do chính game vẽ (TR.pov) — y như người chơi thấy.
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const P = g.player;
  const fac = (a, b) => Math.atan2(b.x - a.x, -(b.z - a.z));
  try {
    await S.wait(0.5);
    for (let take = 0; take < 2; take++) {
      const c = S.findOpen(360);
      const ang = S.rnd() * Math.PI * 2, dx = Math.sin(ang), dz = -Math.cos(ang);
      const kami = P.tankType === 'ARTILLERY';
      const D = kami ? 720 : 380;
      S.drive(true);
      S.teleport(P, c.x - dx * D / 2, c.z - dz * D / 2, Math.atan2(dx, -dz));
      const foes = S.units('RED').filter(u => u.tankType === 'ALL_ROUNDER' || u.tankType === 'GATLING').slice(take * 2, take * 2 + 2);
      foes.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + dx * D / 2 + (i ? -dz * 70 : 0), c.z + dz * D / 2 + (i ? dx * 70 : 0), fac(u, P) + Math.PI / 2); u.hp = u.maxHp * 0.3; });
      const T0 = foes[0];
      if (!T0) { S.log('skip', { take }); break; }
      await S.wait(0.6);
      if (!kami) {
        // ---- kính ngắm xe tăng
        S.pov(true);
        g.setSightMode(true);
        g.setLockedTarget(T0);
        S.log('scene', { n: take, name: 'gunsight' });
        await S.wait(2.2);
        for (let k = 0; k < 3 && !T0.isDead; k++) {
          P.reloadTimer = 0;
          S.log('fire', { take });
          g.triggerPlayerFire();
          await S.until(() => T0.isDead, 3.2);
        }
        await S.wait(2.5);
        g.setSightMode(false);
      } else {
        // ---- UAV cảm tử
        if (typeof Equipment !== 'undefined' && (!P.kamiRack || (P.kamikazeCount || 0) <= 0)) {
          try { Equipment.equip(P, { m: ['kami'], p: [], a: { KAMIKAZE: 2 } }, { local: true, stock: { KAMIKAZE: 9 } }); } catch (e) { console.error('[POV] equip', e); }
        }
        P.kamikazeCount = Math.max(1, P.kamikazeCount || 0);
        const Dr = g.droneState();
        Dr.state = 'docked'; Dr.reloadT = 0;
        S.pov(true);
        g.launchKami();
        await S.wait(0.5);
        g.setSightMode(true);
        S.log('scene', { n: take, name: 'kami-fpv', st: Dr.state });
        await S.wait(1.6);
        Dr.lock = T0; Dr.attack = null;
        g.kamiTryLock();   // đã khóa -> xác nhận: UAV tự chúc mũi lao vào
        S.log('kamiAttack', { st: Dr.state, attack: !!Dr.attack });
        await S.until(() => Dr.state !== 'launching' && Dr.state !== 'flying', 16);
        S.log('kamiEnd', { st: Dr.state, tgtDead: T0.isDead });
        await S.wait(1.6);
        g.setSightMode(false);
      }
      S.pov(false);
      // máy ngoài nhìn lại hiện trường (xác xe cháy)
      S.shot('wreck', { subject: T0, at: { x: T0.x, y: T0.y, z: T0.z }, dur: 4 });
      await S.wait(4);
      foes.forEach(u => S.freeze(u, false));
    }
    S.drive(false);
    S.log('done', {});
  } catch (e) { console.error('[POV]', e); S.log('error', { m: String(e && e.message) }); }
})();
