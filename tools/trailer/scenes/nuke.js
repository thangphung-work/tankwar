/**
 * CĂN CỨ HẠT NHÂN — BUỔI A (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high" --script .../nuke.js)
 * Trời quang, nắng hoàng hôn. Thứ tự: cảnh căn cứ nguyên vẹn trước, phá huỷ căn cứ sau cùng.
 *  1. Toàn cảnh căn cứ hùng vĩ (flycam xa, trượt chậm)        2. Lướt qua bệ phóng (máy cao, tiến dần)
 *  3. Nắp giếng phóng nhìn từ dưới lên (máy thấp)              4. Hai phe Xanh / Đỏ cùng lao về căn cứ (2 góc)
 *  5. Kính ngắm xe tăng bắn hạ xe địch gần căn cứ              6. Đạn chùm phủ quanh căn cứ nhìn từ drone
 *  7. Hai xe Xanh – Đỏ chĩa nòng vào nhau trên bệ phóng        8. Căn cứ trúng pháo kích, nổ dây chuyền, sụp đổ (2 góc)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, P = g.player;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const at = (cx, cz, a, d, h) => { const p = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }; p.y = Math.max(S.obstacleTop(p.x, p.z), S.ground(p.x, p.z)) + h; return p; };
  try {
    await S.wait(0.4);
    const LS = T.landmarkSet, it = LS && LS.items && LS.items[0];
    if (!it) { S.log('skip', { why: 'no base' }); return; }
    const Lm = it.L || {}, an = Lm.angle || 0, sf = Lm.silo ? Lm.silo.f : 0, sr = Lm.silo ? Lm.silo.r : 0;
    const silo = { x: it.x + sf * Math.cos(an) - sr * Math.sin(an), z: it.z + sf * Math.sin(an) + sr * Math.cos(an) };
    silo.y = S.ground(silo.x, silo.z) + (Lm.silo ? Lm.silo.h : 30);
    const gy = it.G || S.ground(it.x, it.z), R = it.reach || 500;
    const sun = (T.map && T.map.sun) || { azimuth: 0 };
    // hướng nắng ngang (game: π/2 - azimuth); đặt máy lệch ~110° so với hướng nắng: công trình được nắng xiên chiếu sáng
    const sunA = Math.PI / 2 - (sun.azimuth || 0);
    const A0 = sunA + Math.PI * 0.62;

    // 1. toàn cảnh
    S.shot('fixed', { pos: at(it.x, it.z, A0, R + 700, 160), look: { x: it.x, y: gy + 30, z: it.z }, dur: 30, fov: 34, drift: { x: Math.sin(A0) * 26, y: -3, z: -Math.cos(A0) * 26 } });
    S.log('scene', { n: 1, name: 'establish' });
    await S.wait(6);
    // 2. lướt qua bệ phóng
    const a2 = A0 + 0.5, p2 = at(silo.x, silo.z, a2, 420, 70);
    S.shot('fixed', { pos: p2, look: { x: silo.x, y: silo.y, z: silo.z }, dur: 30, fov: 40, drift: { x: -Math.cos(a2) * 40, y: -4, z: -Math.sin(a2) * 40 } });
    S.log('scene', { n: 2, name: 'silo-glide' });
    await S.wait(5.5);
    // 3. nắp giếng phóng nhìn từ dưới (máy thấp, ngước lên, đẩy chậm)
    const a3 = A0 - 0.4, p3 = at(silo.x, silo.z, a3, 150, 15);
    S.shot('fixed', { pos: p3, look: { x: silo.x, y: silo.y + 20, z: silo.z }, dur: 30, fov: 36, drift: { x: -Math.cos(a3) * 8, y: 0.4, z: -Math.sin(a3) * 8 } });
    S.log('scene', { n: 3, name: 'silo-low' });
    await S.wait(5);

    // 4. hai phe lao về căn cứ: Xanh từ một phía, Đỏ từ phía đối diện
    const blues = [take('BLUE', ['ALL_ROUNDER']), take('BLUE', ['GATLING']), take('BLUE', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);
    const reds = [take('RED', ['ALL_ROUNDER']), take('RED', ['GATLING']), take('RED', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);
    const aB = A0 + 1.2, aR = aB + Math.PI, D0 = R + 520;
    const place = (list, a) => list.forEach((u, i) => { S.freeze(u, true); const d = D0 + i * 70, off = (i % 2 ? 1 : -1) * 28 * (i ? 1 : 0); S.teleport(u, it.x + Math.cos(a) * d - Math.sin(a) * off, it.z + Math.sin(a) * d + Math.cos(a) * off, Math.atan2(-Math.cos(a), Math.sin(a))); });
    place(blues, aB); place(reds, aR);
    // góc 1: phe Xanh — máy thấp phía trước đoàn xe, xe lao tới ống kính
    const lead = blues[0];
    if (lead) {
      const ahead = at(lead.x - Math.cos(aB) * 260, lead.z - Math.sin(aB) * 260, aB + Math.PI / 2, 40, 8);
      S.shot('fixed', { pos: ahead, look: { x: lead.x, y: lead.y + 10, z: lead.z }, lookAt: lead, dur: 30, fov: 32 });
      S.log('scene', { n: 4, name: 'blue-advance' });
      await S.glide(blues, -Math.cos(aB), -Math.sin(aB), 70, 4.5);
    }
    // góc 2: phe Đỏ — flycam cao bên sườn, đoàn xe tiến về căn cứ phía sau
    const rl = reds[0];
    if (rl) {
      const side = at(rl.x - Math.cos(aR) * 140, rl.z - Math.sin(aR) * 140, aR + Math.PI / 2, 230, 70);
      S.shot('fixed', { pos: side, look: { x: rl.x, y: rl.y + 6, z: rl.z }, lookAt: rl, dur: 30, fov: 36 });
      S.log('scene', { n: 5, name: 'red-advance' });
      await S.glide(reds, -Math.cos(aR), -Math.sin(aR), 70, 4.5);
    }

    // 5. kính ngắm xe tăng (xe người chơi) hạ xe Đỏ gần căn cứ
    const tgt = reds[0];
    if (tgt && P.tankType === 'ALL_ROUNDER') {
      S.drive(true);
      // chỗ đứng bắn nhìn thông tới mục tiêu (không cây / nhà chắn kính ngắm)
      let sp = null;
      for (let k = 0; k < 12 && !sp; k++) {
        const a = aR + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3, p = { x: tgt.x + Math.cos(a) * 320, z: tgt.z + Math.sin(a) * 320 };
        p.y = S.ground(p.x, p.z) + 14;
        if (S.clear(p, { x: tgt.x, y: tgt.y + 8, z: tgt.z })) sp = p;
      }
      sp = sp || { x: tgt.x + Math.cos(aR) * 320, z: tgt.z + Math.sin(aR) * 320 };
      S.teleport(P, sp.x, sp.z, Math.atan2(tgt.x - sp.x, -(tgt.z - sp.z)));
      tgt.hp = tgt.maxHp * 0.3;
      await S.wait(0.4);
      S.pov(true); g.setSightMode(true); g.setLockedTarget(tgt);
      S.log('scene', { n: 6, name: 'gunsight' });
      await S.wait(2.0);
      for (let k = 0; k < 3 && !tgt.isDead; k++) { P.reloadTimer = 0; g.triggerPlayerFire(); await S.until(() => tgt.isDead, 3); }
      await S.wait(2.2);
      g.setSightMode(false); S.pov(false); S.drive(false);
    }

    // 6. đạn chùm phủ quanh căn cứ nhìn từ drone (chưa nhắm vào khối công trình chính)
    const sh = S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
    {
      const c = { x: it.x + Math.cos(aR) * (R * 0.9), z: it.z + Math.sin(aR) * (R * 0.9) };
      reds.slice(1).forEach((u, i) => { if (!u.isDead) S.teleport(u, c.x + (i - 0.5) * 70, c.z + (S.rnd() - 0.5) * 50, u.bodyAngle); });
      S.shot('fixed', { pos: at(c.x, c.z, aR + 1.0, 330, 210), look: { x: c.x, y: S.ground(c.x, c.z), z: c.z }, dur: 30, fov: 44, drift: { x: 6, y: -2, z: 6 } });
      S.log('scene', { n: 7, name: 'cluster-aerial' });
      await S.wait(0.6);
      for (let i = 0; i < 14; i++) {
        const r = 140 * Math.sqrt(S.rnd()), q = S.rnd() * 6.28;
        S.shellAt(sh, c.x + Math.cos(q) * r, S.ground(c.x, c.z) + 4, c.z + Math.sin(q) * r, i % 2 ? 'CLUSTER' : 'HE', aB, 0.9);
        await S.wait(0.3 + S.rnd() * 0.25);
      }
      await S.wait(4);
    }

    // 7. đối đầu trên bệ phóng: một xe Xanh, một xe Đỏ chĩa nòng vào nhau
    const b1 = blues[0], r1 = reds.find(u => !u.isDead) || take('RED', ['ALL_ROUNDER', 'GATLING']);
    if (b1 && r1) {
      const ax = Math.cos(A0 + Math.PI / 2), az = Math.sin(A0 + Math.PI / 2);
      S.teleport(b1, silo.x - ax * 55, silo.z - az * 55, Math.atan2(ax, -az));
      S.teleport(r1, silo.x + ax * 55, silo.z + az * 55, Math.atan2(-ax, az));
      S.freeze(b1, true); S.freeze(r1, true);
      b1.hp = b1.maxHp; r1.hp = r1.maxHp;
      S.aim(b1, { x: r1.x, z: r1.z }, 0.5); S.aim(r1, { x: b1.x, z: b1.z }, 0.5);
      // máy thấp nhìn ngang giữa hai xe (kiểu đấu súng miền Tây), đẩy chậm
      const pc = at(silo.x, silo.z, A0, 110, 7);
      S.shot('fixed', { pos: pc, look: { x: silo.x, y: silo.y + 8, z: silo.z }, dur: 30, fov: 40, drift: { x: -Math.cos(A0) * 5, y: 0, z: -Math.sin(A0) * 5 } });
      S.log('scene', { n: 8, name: 'standoff' });
      await S.wait(6);
    }

    // 8. căn cứ trúng pháo kích, nổ dây chuyền, sụp đổ — góc mặt đất xa rồi drone
    {
      const pw = at(it.x, it.z, A0 + 0.3, R + 450, 25);
      S.shot('fixed', { pos: pw, look: { x: it.x, y: gy + 40, z: it.z }, dur: 40, fov: 30 });
      S.log('scene', { n: 9, name: 'base-strike' });
      await S.wait(0.6);
      let shots = 0, switched = false;
      const t0 = performance.now() / 1000;
      while (!it.dead && shots < 110 && performance.now() / 1000 - t0 < 30) {
        const r = R * 0.65 * Math.sqrt(S.rnd()), q = S.rnd() * 6.28;
        S.shellAt(sh, it.x + Math.cos(q) * r, gy + 6, it.z + Math.sin(q) * r, shots % 4 === 3 ? 'CLUSTER' : 'HE', A0 + Math.PI + (S.rnd() - 0.5), 0.85);
        shots++;
        if (!switched && it.hp < it.hp0 * 0.5) {
          switched = true;
          S.shot('fixed', { pos: at(it.x, it.z, A0 + 1.6, R + 260, 240), look: { x: it.x, y: gy, z: it.z }, dur: 40, fov: 46, drift: { x: 10, y: -3, z: 10 } });
          S.log('scene', { n: 10, name: 'base-collapse-aerial' });
        }
        await S.wait(0.22 + S.rnd() * 0.18);
      }
      S.log('baseDead', { dead: !!it.dead, shots });
      await S.wait(7);
    }
    S.log('done', {});
  } catch (e) { console.error('[NUKE]', e); S.log('error', { m: String(e && e.message) }); }
})();
