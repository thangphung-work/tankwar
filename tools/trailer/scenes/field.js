/**
 * CHIẾN TRƯỜNG BÃO (record.js --map RIVER_LAKE --seed 15 --q "calm=1&fog=0.5&gfx=high" --script .../field.js)
 * Máy tĩnh / trượt rất chậm, không rung, không quay chậm (trừ ù tai). Lửa & nổ ưu tiên nhìn từ xa.
 *  1. Pháo binh: 3 xe pháo dừng, HẠ CHÂN CHỐNG thủy lực, nòng ngóc 40°, khai hỏa lần lượt (2 góc máy)
 *  2. Chân trời bão lửa: máy tele cực xa — mưa đạn chùm / lựu pháo chớp loé dọc cả dải đất (tiếng nổ tới trễ theo khoảng cách)
 *  3. Hai hàng xe đấu pháo nhìn ngang chiến tuyến từ xa
 *  4. Ù tai: máy sát đất cạnh xe bị bắn
 *  5. Xác xe cháy dưới mưa nhìn từ xa
 *  6. Nhà trúng pháo kích sập
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const face = (a) => Math.atan2(Math.sin(a), -Math.cos(a));   // góc thân xe nhìn theo hướng (sin a, cos a)... dùng S.face khi có điểm
  try {
    await S.wait(0.4);
    // ---------- 1. pháo binh
    const arts = [take('BLUE', ['ARTILLERY']), take('BLUE', ['ARTILLERY']), take('RED', ['ARTILLERY'])].filter(Boolean);
    if (arts.length) {
      const c = S.findOpen(260), ang = S.rnd() * Math.PI * 2, dx = Math.sin(ang), dz = -Math.cos(ang), px = -dz, pz = dx;
      const far = { x: c.x + dx * 3000, z: c.z + dz * 3000 };
      arts.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + px * (i - 1) * 70, c.z + pz * (i - 1) * 70, Math.atan2(dx, -dz)); u.isDeployed = false; u.deployProgress = 0; u.standStillTimer = 0; });
      // góc 1: ngang hông, thấp, tele — thấy chân chống hạ xuống
      const cam1 = { x: c.x + px * 40 + dx * 150, z: c.z + pz * 40 + dz * 150 }; cam1.y = S.ground(cam1.x, cam1.z) + 7;
      S.shot('fixed', { pos: cam1, look: { x: arts[0].x, y: arts[0].y + 12, z: arts[0].z }, dur: 30, fov: 34, noDrone: true });
      S.log('scene', { n: 1, name: 'arty-deploy' });
      await S.wait(2.8);
      arts.forEach(u => S.aim(u, far, 40));
      await S.wait(1.2);
      for (const u of arts) { S.log('artyFire', {}); S.fire(u); await S.wait(0.45); }
      await S.wait(2.2);
      // góc 2: sau dàn pháo, thấp, nhìn dọc nòng ra chân trời
      const cam2 = { x: c.x - dx * 110 + px * 25, z: c.z - dz * 110 + pz * 25 }; cam2.y = S.ground(cam2.x, cam2.z) + 9;
      S.shot('fixed', { pos: cam2, look: { x: c.x + dx * 400, y: S.ground(c.x, c.z) + 60, z: c.z + dz * 400 }, dur: 30, fov: 42, noDrone: true });
      S.log('scene', { n: 2, name: 'arty-salvo' });
      await S.wait(0.8);
      for (const u of arts) { u.reloadTimer = 0; S.fire(u); await S.wait(0.4); }
      await S.wait(2.5);
      arts.forEach(u => S.freeze(u, false));
    }

    // ---------- 2. chân trời bão lửa
    {
      const c = S.findOpen(400), ang = S.rnd() * Math.PI * 2;
      const cam = { x: c.x + Math.cos(ang) * 1500, z: c.z + Math.sin(ang) * 1500 };
      cam.y = Math.max(S.ground(cam.x, cam.z), S.ground(c.x, c.z)) + 26;
      const reds = [take('RED', ['ALL_ROUNDER']), take('RED', ['GATLING']), take('RED', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);
      reds.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + (i - 1) * 140, c.z + (S.rnd() - 0.5) * 80, S.rnd() * 6.28); u.hp = u.maxHp * 0.4; });
      S.shot('fixed', { pos: cam, look: { x: c.x, y: S.ground(c.x, c.z) + 25, z: c.z }, dur: 30, fov: 16, noDrone: true, drift: { x: Math.sin(ang) * 6, y: 0, z: -Math.cos(ang) * 6 } });
      S.log('scene', { n: 3, name: 'horizon-barrage' });
      await S.wait(0.6);
      const sh = S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
      const gy = S.ground(c.x, c.z);
      for (let i = 0; i < 34; i++) {
        // dải dài vuông góc hướng nhìn
        const along = (S.rnd() - 0.5) * 900, deep = (S.rnd() - 0.5) * 260;
        const x = c.x - Math.sin(ang) * along + Math.cos(ang) * deep, z = c.z + Math.cos(ang) * along + Math.sin(ang) * deep;
        S.shellAt(sh, x, gy + 4, z, i % 3 === 0 ? 'CLUSTER' : 'HE', ang + Math.PI + (S.rnd() - 0.5), 0.9);
        await S.wait(0.18 + S.rnd() * 0.22);
      }
      await S.wait(6);
      reds.forEach(u => S.freeze(u, false));
      S.log('sceneEnd', { n: 3 });
    }

    // ---------- 3–5. đấu pháo, ù tai, xác xe
    async function lines(n, mode) {
      const A = [take('BLUE', ['ALL_ROUNDER', 'GATLING']), take('BLUE', ['ALL_ROUNDER', 'GATLING'])].filter(Boolean);
      const B = [take('RED', ['ALL_ROUNDER', 'GATLING', 'SCOUT']), take('RED', ['ALL_ROUNDER', 'GATLING', 'SCOUT'])].filter(Boolean);
      if (!A.length || !B.length) { S.log('skip', { n }); return null; }
      const c = S.findOpen(320), ang = S.rnd() * Math.PI * 2, dx = Math.sin(ang), dz = -Math.cos(ang), px = -dz, pz = dx, D = 300;
      A.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x - dx * D / 2 + px * (i - 0.5) * 90, c.z - dz * D / 2 + pz * (i - 0.5) * 90, Math.atan2(dx, -dz)); u.hp = u.maxHp * 0.3; });
      B.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + dx * D / 2 + px * (i - 0.5) * 90, c.z + dz * D / 2 + pz * (i - 0.5) * 90, Math.atan2(-dx, dz)); u.hp = u.maxHp * 0.3; });
      await S.wait(0.3);
      const victim = B[0];
      if (mode === 'far') {
        const pos = { x: c.x + px * 480, z: c.z + pz * 480 }; pos.y = S.ground(pos.x, pos.z) + 12;
        S.shot('fixed', { pos, look: { x: c.x, y: S.ground(c.x, c.z) + 10, z: c.z }, dur: 30, fov: 30, noDrone: true });
      } else {
        // sát đất cạnh xe sẽ bị bắn, nhìn về phía hàng xe bên kia
        const pos = { x: victim.x - px * 70 + dx * 40, z: victim.z - pz * 70 + dz * 40 }; pos.y = S.ground(pos.x, pos.z) + 6;
        S.shot('fixed', { pos, look: { x: victim.x, y: victim.y + 10, z: victim.z }, dur: 30, fov: 44, noDrone: true });
      }
      S.log('scene', { n, name: 'lines-' + mode });
      let k = 0, shocked = false;
      const t0 = performance.now() / 1000;
      while (performance.now() / 1000 - t0 < 11) {
        const shooters = [...A, ...B].filter(u => !u.isDead && u.tankType === 'ALL_ROUNDER');
        if (!shooters.length) break;
        const u = shooters[k++ % shooters.length];
        const foes = (A.includes(u) ? B : A).filter(v => !v.isDead);
        if (!foes.length) break;
        const v = mode === 'shock' && A.includes(u) && !victim.isDead ? victim : foes[Math.floor(S.rnd() * foes.length)];
        S.aim(u, { x: v.x, y: v.y + 9, z: v.z }, Math.atan2(v.y + 9 - (u.y + 14), Math.hypot(v.x - u.x, v.z - u.z)) * 180 / Math.PI + 0.15);
        await S.wait(0.6);
        S.fire(u);
        await S.wait(0.5 + S.rnd() * 0.4);
        if (mode === 'shock' && !shocked && victim.isDead) { shocked = true; S.shock(2.4); await S.wait(3.5); break; }
      }
      await S.wait(2);
      [...A, ...B].forEach(u => S.freeze(u, false));
      S.log('sceneEnd', { n });
      return { c, px, pz, A, B };
    }
    const L1 = await lines(4, 'far');
    await lines(5, 'shock');
    if (L1) {
      // xác xe cháy dưới mưa, nhìn từ xa, máy trượt rất chậm
      const pos = { x: L1.c.x + L1.px * 380, z: L1.c.z + L1.pz * 380 }; pos.y = S.ground(pos.x, pos.z) + 9;
      S.shot('fixed', { pos, look: { x: L1.c.x, y: S.ground(L1.c.x, L1.c.z) + 12, z: L1.c.z }, dur: 9, fov: 26, noDrone: true, drift: { x: -L1.pz * 5, y: 0, z: L1.px * 5 } });
      S.log('scene', { n: 6, name: 'wrecks-far' });
      await S.wait(8);
    }

    // ---------- 6. nhà sập
    const BS = T.buildingSet;
    if (BS && BS.items && BS.items.length) {
      const list = BS.items.filter(B => !B.collapsed && (B.topY || 0) < 70).sort((p, q) => (q.halfW * q.halfD) - (p.halfW * p.halfD)).slice(0, 15);
      const B = list[Math.floor(S.rnd() * list.length)];
      if (B) {
        const r = Math.max(B.halfW, B.halfD), a = S.rnd() * Math.PI * 2, d = r * 3.4 + 120;
        const cp = { x: B.x + Math.cos(a) * d, z: B.z + Math.sin(a) * d }; cp.y = S.obstacleTop(cp.x, cp.z) + 12;
        const gy = B.y || S.ground(B.x, B.z), top = gy + (B.topY || 40);
        S.shot('fixed', { pos: cp, look: { x: B.x, y: (gy + top) / 2, z: B.z }, dur: 30, fov: 36, noDrone: true });
        S.log('scene', { n: 7, name: 'house' });
        await S.wait(0.8);
        const sh = S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
        for (let i = 0; i < 16 && !B.collapsed; i++) {
          S.shellAt(sh, B.x + (S.rnd() - 0.5) * r, gy + 6 + S.rnd() * 12, B.z + (S.rnd() - 0.5) * r, 'HE', a + Math.PI + (S.rnd() - 0.5) * 0.8, i % 2 ? 0.2 : 0.8);
          await S.wait(0.45 + S.rnd() * 0.3);
        }
        S.log('collapse', { collapsed: !!B.collapsed });
        await S.wait(6);
      }
    }
    S.log('done', {});
  } catch (e) { console.error('[FIELD]', e); S.log('error', { m: String(e && e.message) }); }
})();
