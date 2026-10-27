/**
 * KỊCH BẢN "SỬ THI" A (record.js --map URBAN --seed 3 (mưa) --script tools/trailer/scenes/epicA.js)
 *  1. Mở đầu: căn cứ hạt nhân dưới mưa — máy thấp sát hàng rào, nâng dần lộ toàn cảnh; rồi máy tele đẩy chậm vào tháp
 *  2. Pháo kích dồn dập + đạn chùm trùm lên hầm cứ điểm (xe địch nấp trong đó) — 2 cứ điểm, 2 góc máy (mặt đất tele / drone)
 *  3. Pháo kích đánh sập cao ốc (máy thấp ngước lên)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const pickU = (team, type) => S.units(team, type)[0] || S.units(team)[0];

  async function barrage(n, cp, cam, count, gap, opts = {}) {
    const shooters = S.units('BLUE', 'ARTILLERY');
    const sh = shooters[0] || pickU('BLUE');
    // xe địch nấp trong / quanh cứ điểm
    const reds = S.units('RED').slice(opts.from || 0, (opts.from || 0) + 3);
    reds.forEach((u, i) => { S.freeze(u, true); S.teleport(u, cp.x + (i - 1) * 45, cp.z + (S.rnd() - 0.5) * 50, S.rnd() * 6.28); u.hp = u.maxHp * 0.35; });
    const gy = S.ground(cp.x, cp.z);
    S.shot('fixed', Object.assign({ look: { x: cp.x, y: gy + 15, z: cp.z }, dur: count * gap + 6, noDrone: true }, cam));
    S.log('scene', { n, name: opts.name || 'barrage' });
    await S.wait(0.8);
    for (let i = 0; i < count; i++) {
      const r = (opts.spread || 140) * Math.sqrt(S.rnd()), a = S.rnd() * Math.PI * 2;
      const ammo = i % 3 === 1 ? 'CLUSTER' : 'HE';
      S.shellAt(sh, cp.x + Math.cos(a) * r, gy + 4, cp.z + Math.sin(a) * r, ammo, (opts.dir || 0) + (S.rnd() - 0.5) * 0.6, 0.88);
      await S.wait(gap * (0.5 + S.rnd()));
    }
    await S.wait(4);
    reds.forEach(u => S.freeze(u, false));
    S.log('sceneEnd', { n });
  }

  try {
    await S.wait(0.3);
    // ---------- 1. căn cứ hạt nhân dưới mưa
    const lm = T.map && T.map.landmarks && T.map.landmarks[0];
    if (lm) {
      const gy = S.ground(lm.x, lm.z), r = (lm.radius || 300);
      const a = S.rnd() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // nâng máy: từ sát đất ngoài rào lên cao, trượt vào trong
      const p0 = { x: lm.x + ca * (r + 260), y: gy + 14, z: lm.z + sa * (r + 260) };
      p0.y = Math.max(p0.y, S.obstacleTop(p0.x, p0.z) + 10);
      S.shot('fixed', { pos: p0, look: { x: lm.x, y: gy + 90, z: lm.z }, dur: 6.5, fov: 48, noDrone: true, drift: { x: -ca * 22, y: 30, z: -sa * 22 } });
      S.log('scene', { n: 1, name: 'base-crane' });
      await S.wait(6.5);
      // tele đẩy chậm vào lõi căn cứ, góc khác
      const b = a + 1.9, p1 = { x: lm.x + Math.cos(b) * (r + 520), z: lm.z + Math.sin(b) * (r + 520) };
      p1.y = Math.max(S.ground(p1.x, p1.z), gy) + 60;
      S.shot('fixed', { pos: p1, look: { x: lm.x, y: gy + 60, z: lm.z }, dur: 5, fov: 22, noDrone: true, drift: { x: -Math.cos(b) * 30, y: -4, z: -Math.sin(b) * 30 } });
      S.log('scene', { n: 2, name: 'base-tele' });
      await S.wait(5);
    }

    // ---------- 2. pháo kích hầm cứ điểm
    const cps = (g.capturePoints || []).slice(0, 3);
    if (cps[0]) {
      const cp = cps[0], gy = S.ground(cp.x, cp.z), a = S.rnd() * Math.PI * 2;
      const pos = { x: cp.x + Math.cos(a) * 420, z: cp.z + Math.sin(a) * 420 };
      pos.y = Math.max(S.obstacleTop(pos.x, pos.z), gy) + 12;
      await barrage(3, cp, { pos, fov: 30, drift: { x: Math.sin(a) * 8, y: 0.5, z: -Math.cos(a) * 8 } }, 26, 0.32, { name: 'barrage-ground', dir: a + Math.PI });
    }
    if (cps[1]) {
      const cp = cps[1], gy = S.ground(cp.x, cp.z), a = S.rnd() * Math.PI * 2;
      const pos = { x: cp.x + Math.cos(a) * 300, z: cp.z + Math.sin(a) * 300 };
      pos.y = Math.max(S.ground(pos.x, pos.z), gy) + 190;
      await barrage(4, cp, { pos, fov: 44, drift: { x: Math.sin(a) * 18, y: -3, z: -Math.cos(a) * 18 } }, 30, 0.26, { name: 'barrage-drone', from: 3, spread: 170 });
    }

    // ---------- 3. đánh sập cao ốc
    const BS = T.buildingSet;
    if (BS && BS.items && BS.items.length) {
      const list = BS.items.filter(B => !B.collapsed && (B.topY || 0) > 60).sort((p, q) => (q.halfW * q.halfD) - (p.halfW * p.halfD)).slice(0, 25);
      let pick = null;
      for (let i = 0; i < 40 && !pick; i++) {
        const B = list[Math.floor(S.rnd() * list.length)];
        if (!B) break;
        const r = Math.max(B.halfW, B.halfD), a = S.rnd() * Math.PI * 2, d = r * 2.4 + 120;
        const cp = { x: B.x + Math.cos(a) * d, z: B.z + Math.sin(a) * d };
        if (S.obstacleTop(cp.x, cp.z) - S.ground(cp.x, cp.z) > 2) continue;
        cp.y = S.ground(cp.x, cp.z) + 6;
        pick = { B, cp, a, r };
      }
      if (pick) {
        const { B, cp, a, r } = pick, gy = B.y || S.ground(B.x, B.z), top = gy + (B.topY || 80);
        const sh = S.units('BLUE', 'ARTILLERY')[0] || pickU('BLUE');
        S.shot('fixed', { pos: cp, look: { x: B.x, y: (gy + top) / 2 + 10, z: B.z }, dur: 16, fov: 40, noDrone: true, drift: { x: 0, y: 0.8, z: 0 } });
        S.log('scene', { n: 5, name: 'tower-collapse' });
        await S.wait(0.8);
        for (let i = 0; i < 28; i++) {
          // nửa đầu đánh thẳng vào thân nhà (đạn bay gần ngang), nửa sau dội từ trên xuống
          const h = gy + 10 + S.rnd() * (top - gy) * 0.8;
          S.shellAt(sh, B.x + (S.rnd() - 0.5) * r, h, B.z + (S.rnd() - 0.5) * r, 'HE', a + Math.PI + (S.rnd() - 0.5) * 0.5, i < 14 ? 0.35 : 0.85);
          await S.wait(0.22 + S.rnd() * 0.2);
        }
        await S.wait(5);
        S.log('sceneEnd', { n: 5, collapsed: !!B.collapsed });
      }
    }
    S.log('done', {});
  } catch (e) { console.error('[EPIC A]', e); S.log('error', { m: String(e && e.message) }); }
})();
