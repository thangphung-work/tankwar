/**
 * CĂN CỨ HẠT NHÂN — QUAY BÙ (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high" --script .../nuke3.js)
 * Các góc máy dò đường nhìn (S.clear) + tránh gò cỏ / tường bệ phóng; không đặt máy mù như nuke.js.
 *  1. Nắp giếng phóng, máy thấp-vừa ngước lên       2. Kính ngắm xe tăng bắn hạ xe Đỏ cự ly gần
 *  3. Xanh – Đỏ chĩa nòng vào nhau trên bệ phóng     4. Căn cứ trúng pháo kích, nổ dây chuyền, sụp — một góc mặt đất tele
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, P = g.player;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  // đoạn đầu tia nhìn (gần máy) phải cao hơn mặt đất / cỏ ít nhất `m` — tránh lá cỏ quệt ống kính
  const nearClear = (p, q, m) => { for (let i = 1; i <= 10; i++) { const t = i / 25, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t, z = p.z + (q.z - p.z) * t; if (top(x, z) > y - m) return false; } return true; };
  // dò chỗ đặt máy quanh điểm c: góc a0 ± lệch, các cự ly, các độ cao; nhìn thông tới mọi điểm trong `tg`
  const findCam = (c, a0, dists, hs, tg, spread) => {
    for (const h of hs) for (const d of dists) for (let k = 0; k < 13; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (spread || 0.18);
      const p = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d };
      const gnd = S.ground(p.x, p.z);
      if (S.obstacleTop(p.x, p.z) > gnd + 0.5) continue;   // không đặt máy trong khối nhà / tường
      p.y = gnd + h;
      if (tg.every(q => S.clear(p, q) && nearClear(p, q, 4))) { p.a = a; return p; }
    }
    return null;
  };
  try {
    await S.wait(0.4);
    const LS = T.landmarkSet, it = LS && LS.items && LS.items[0];
    if (!it) { S.log('skip', { why: 'no base' }); return; }
    const Lm = it.L || {}, an = Lm.angle || 0, sf = Lm.silo ? Lm.silo.f : 0, sr = Lm.silo ? Lm.silo.r : 0;
    const gy = it.G || S.ground(it.x, it.z), R = it.reach || 500;
    const silo = { x: it.x + sf * Math.cos(an) - sr * Math.sin(an), z: it.z + sf * Math.sin(an) + sr * Math.cos(an) };
    silo.y = gy + (Lm.silo ? Lm.silo.h + 3 : 30);
    const sun = (T.map && T.map.sun) || { azimuth: 0 };
    const sunA = Math.PI / 2 - (sun.azimuth || 0), A0 = sunA + Math.PI * 0.62;
    S.log('geo', { silo: [Math.round(silo.x), Math.round(silo.y), Math.round(silo.z)], gy: Math.round(gy), gS: Math.round(S.ground(silo.x, silo.z)), oS: Math.round(S.obstacleTop(silo.x, silo.z)) });

    // 1. nắp giếng phóng
    {
      const tg = [{ x: silo.x, y: silo.y + 2, z: silo.z }];
      const p = findCam(silo, A0 - 0.4, [120, 160, 210, 260], [10, 16, 24, 34], tg) || Object.assign({ x: silo.x + Math.cos(A0) * 260, z: silo.z + Math.sin(A0) * 260 }, { y: top(silo.x + Math.cos(A0) * 260, silo.z + Math.sin(A0) * 260) + 40 });
      S.log('cam', { n: 1, d: Math.round(Math.hypot(p.x - silo.x, p.z - silo.z)), h: Math.round(p.y - S.ground(p.x, p.z)) });
      const ux = (silo.x - p.x), uz = (silo.z - p.z), ul = Math.hypot(ux, uz);
      S.shot('fixed', { pos: p, look: { x: silo.x, y: silo.y + 10, z: silo.z }, dur: 30, fov: 34, drift: { x: ux / ul * 7, y: -0.3, z: uz / ul * 7 } });
      S.log('scene', { n: 1, name: 'silo-low' });
      await S.wait(5.5);
    }

    const blues = [take('BLUE', ['ALL_ROUNDER']), take('BLUE', ['GATLING'])].filter(Boolean);
    const reds = [take('RED', ['ALL_ROUNDER']), take('RED', ['GATLING']), take('RED', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);

    // 2. kính ngắm: xe Đỏ đứng ngoài rào căn cứ, xe người chơi cách ~170 m, đường ngắm thông, không cây sát xe
    const tgt = reds[2] || reds[0];
    if (tgt && P.tankType === 'ALL_ROUNDER') {
      const aT = A0 + 1.4, tp = { x: it.x + Math.cos(aT) * (R + 80), z: it.z + Math.sin(aT) * (R + 80) };
      S.freeze(tgt, true); S.teleport(tgt, tp.x, tp.z, aT + Math.PI / 2);
      await S.wait(0.3);
      S.drive(true);
      const q = { x: tgt.x, y: tgt.y + 6, z: tgt.z };
      const sp = findCam(tgt, aT, [170, 200, 230], [4], [q], 0.25) || { x: tgt.x + Math.cos(aT) * 190, z: tgt.z + Math.sin(aT) * 190 };
      S.teleport(P, sp.x, sp.z, Math.atan2(tgt.x - sp.x, -(tgt.z - sp.z)));
      tgt.hp = tgt.maxHp * 0.3;
      await S.wait(0.5);
      S.pov(true); g.setSightMode(true); g.setLockedTarget(tgt);
      S.log('scene', { n: 2, name: 'gunsight', d: Math.round(Math.hypot(sp.x - tgt.x, sp.z - tgt.z)) });
      await S.wait(1.8);
      for (let k = 0; k < 3 && !tgt.isDead; k++) { P.reloadTimer = 0; g.triggerPlayerFire(); await S.until(() => tgt.isDead, 2.6); }
      await S.wait(2.4);
      g.setSightMode(false); S.pov(false); S.drive(false);
    }

    // 3. đối đầu trên bệ phóng
    const b1 = blues[0], r1 = reds[0];
    if (b1 && r1) {
      const ax = Math.cos(A0 + Math.PI / 2), az = Math.sin(A0 + Math.PI / 2);
      S.freeze(b1, true); S.freeze(r1, true);
      S.teleport(b1, silo.x - ax * 50, silo.z - az * 50, Math.atan2(ax, -az));
      S.teleport(r1, silo.x + ax * 50, silo.z + az * 50, Math.atan2(-ax, az));
      b1.hp = b1.maxHp; r1.hp = r1.maxHp;
      await S.wait(0.3);
      S.aim(b1, { x: r1.x, y: r1.y + 6, z: r1.z }, 0.5); S.aim(r1, { x: b1.x, y: b1.y + 6, z: b1.z }, 0.5);
      const tg = [{ x: b1.x, y: b1.y + 5, z: b1.z }, { x: r1.x, y: r1.y + 5, z: r1.z }, { x: silo.x, y: silo.y + 3, z: silo.z }];
      const p = findCam(silo, A0, [120, 150, 190, 240], [7, 12, 18, 26], tg, 0.12)
        || { x: silo.x + Math.cos(A0) * 240, z: silo.z + Math.sin(A0) * 240, y: top(silo.x + Math.cos(A0) * 240, silo.z + Math.sin(A0) * 240) + 30 };
      S.log('cam', { n: 3, d: Math.round(Math.hypot(p.x - silo.x, p.z - silo.z)), h: Math.round(p.y - S.ground(p.x, p.z)) });
      const ux = silo.x - p.x, uz = silo.z - p.z, ul = Math.hypot(ux, uz);
      const midY = (b1.y + r1.y) / 2 + 6;
      S.shot('fixed', { pos: p, look: { x: silo.x, y: midY, z: silo.z }, dur: 30, fov: 30, drift: { x: ux / ul * 6, y: 0, z: uz / ul * 6 } });
      S.log('scene', { n: 3, name: 'standoff' });
      await S.wait(7);
    }

    // 4. căn cứ trúng pháo kích tới sập — một góc mặt đất tele, không đổi máy giữa chừng
    {
      const sh = S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
      const c = { x: it.x, y: gy + 25, z: it.z };
      const p = findCam(c, A0 + 0.3, [R + 380, R + 500, R + 650], [30, 50, 80], [c], 0.15)
        || { x: it.x + Math.cos(A0 + 0.3) * (R + 450), z: it.z + Math.sin(A0 + 0.3) * (R + 450), y: gy + 80 };
      S.log('cam', { n: 4, d: Math.round(Math.hypot(p.x - it.x, p.z - it.z)), h: Math.round(p.y - S.ground(p.x, p.z)) });
      S.shot('fixed', { pos: p, look: { x: it.x, y: gy + 30, z: it.z }, dur: 40, fov: 30, drift: { x: 0, y: -1.2, z: 0 } });
      S.log('scene', { n: 4, name: 'base-strike', hp: it.hp, hp0: it.hp0 });
      await S.wait(0.8);
      let shots = 0;
      const t0 = performance.now() / 1000;
      while (!it.dead && shots < 140 && performance.now() / 1000 - t0 < 22) {
        const r = R * 0.6 * Math.sqrt(S.rnd()), q = S.rnd() * 6.28;
        S.shellAt(sh, it.x + Math.cos(q) * r, gy + 6, it.z + Math.sin(q) * r, shots % 4 === 3 ? 'CLUSTER' : 'HE', A0 + Math.PI + (S.rnd() - 0.5), 0.85);
        shots++;
        await S.wait(0.2 + S.rnd() * 0.15);
      }
      S.log('baseDead', { dead: !!it.dead, shots });
      await S.wait(8);
    }
    S.log('done', {});
  } catch (e) { console.error('[NUKE3]', e); S.log('error', { m: String(e && e.message) }); }
})();
