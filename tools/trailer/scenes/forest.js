/**
 * RỪNG & HẦM CỨ ĐIỂM DƯỚI MƯA PHÁO (record.js --map RIVER_LAKE --seed 15 --q lens=1 --script .../forest.js)
 *  1. Xe địch núp bìa rừng — đạn chùm + lựu pháo trút từ trên cao: bom con loé khắp vùng, sóng xung kích quật rạp cây
 *     (máy drone nhìn xuống; lần 2 máy tele sát đất ngoài trảng trống)
 *  2. Mưa pháo dồn dập vào hầm cứ điểm có xe địch nấp (máy tele mặt đất; lần 2 drone)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const sh = () => S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
  let redFrom = 0;
  function hideReds(cx, cz, spread) {
    const reds = S.units('RED').slice(redFrom, redFrom + 3); redFrom += 3;
    reds.forEach((u, i) => { S.freeze(u, true); S.teleport(u, cx + (i - 1) * 50 + (S.rnd() - 0.5) * 20, cz + (S.rnd() - 0.5) * spread, S.rnd() * 6.28); u.hp = u.maxHp * 0.3; });
    return reds;
  }
  async function rain(cx, cz, count, gap, spread, from, clusterEvery) {
    const gy = S.ground(cx, cz);
    for (let i = 0; i < count; i++) {
      const r = spread * Math.sqrt(S.rnd()), q = S.rnd() * Math.PI * 2;
      S.shellAt(sh(), cx + Math.cos(q) * r, gy + 4, cz + Math.sin(q) * r, i % clusterEvery === 0 ? 'CLUSTER' : 'HE', from + (S.rnd() - 0.5) * 0.7, 0.9);
      await S.wait(gap * (0.5 + S.rnd()));
    }
  }
  try {
    await S.wait(0.4);
    // ---------- 1. bìa rừng
    const TF = T.trees;
    const clusters = [];
    if (TF && TF.items && TF.items.length) {
      for (let i = 0; i < 300 && clusters.length < 2; i++) {
        const t = TF.items[Math.floor(S.rnd() * TF.items.length)];
        if (TF.near(t.x, t.z, 90).length < 14) continue;
        if (clusters.some(c => Math.hypot(c.x - t.x, c.z - t.z) < 900)) continue;
        // hướng ra trảng trống: thử 8 hướng, chỗ 450 đv không có cây
        let open = null;
        for (let k = 0; k < 8 && !open; k++) {
          const a = k * Math.PI / 4, px = t.x + Math.cos(a) * 480, pz = t.z + Math.sin(a) * 480;
          if (!TF.near(px, pz, 60).length && S.obstacleTop(px, pz) - S.ground(px, pz) < 2) open = a;
        }
        if (open !== null) clusters.push({ x: t.x, z: t.z, open });
      }
    }
    for (let k = 0; k < clusters.length; k++) {
      const c = clusters[k], gy = S.ground(c.x, c.z);
      // xe địch nấp ở bìa rừng, phía trảng trống
      hideReds(c.x + Math.cos(c.open) * 70, c.z + Math.sin(c.open) * 70, 60);
      let cam;
      if (k === 0) { cam = { x: c.x + Math.cos(c.open + 0.4) * 360, z: c.z + Math.sin(c.open + 0.4) * 360 }; cam.y = gy + 240; }
      else { cam = { x: c.x + Math.cos(c.open) * 520, z: c.z + Math.sin(c.open) * 520 }; cam.y = S.ground(cam.x, cam.z) + 8; }
      S.shot('fixed', { pos: cam, look: { x: c.x, y: gy + (k === 0 ? 0 : 25), z: c.z }, dur: 30, fov: k === 0 ? 46 : 28, noDrone: true, drift: { x: Math.sin(c.open) * 12, y: k === 0 ? -5 : 0.3, z: -Math.cos(c.open) * 12 } });
      S.log('scene', { n: 1 + k, name: k === 0 ? 'forest-drone' : 'forest-ground' });
      await S.wait(0.8);
      await rain(c.x, c.z, 22, 0.24, 170, c.open + Math.PI, 2);
      await S.wait(5);
      S.log('sceneEnd', { n: 1 + k });
    }
    // ---------- 2. hầm cứ điểm
    const cps = (g.capturePoints || []).slice(0, 2);
    for (let k = 0; k < cps.length; k++) {
      const cp = cps[k], gy = S.ground(cp.x, cp.z), a = S.rnd() * Math.PI * 2;
      hideReds(cp.x, cp.z, 40);
      let cam;
      if (k === 0) { cam = { x: cp.x + Math.cos(a) * 430, z: cp.z + Math.sin(a) * 430 }; cam.y = Math.max(S.obstacleTop(cam.x, cam.z), gy) + 12; }
      else { cam = { x: cp.x + Math.cos(a) * 300, z: cp.z + Math.sin(a) * 300 }; cam.y = gy + 200; }
      S.shot('fixed', { pos: cam, look: { x: cp.x, y: gy + 12, z: cp.z }, dur: 30, fov: k === 0 ? 30 : 44, noDrone: true, drift: { x: Math.sin(a) * 9, y: k === 0 ? 0.4 : -3, z: -Math.cos(a) * 9 } });
      S.log('scene', { n: 3 + k, name: k === 0 ? 'bunker-ground' : 'bunker-drone' });
      await S.wait(0.8);
      await rain(cp.x, cp.z, 26, 0.26, 150, a + Math.PI, 3);
      await S.wait(5);
      S.log('sceneEnd', { n: 3 + k });
    }
    S.log('done', {});
  } catch (e) { console.error('[FOREST]', e); S.log('error', { m: String(e && e.message) }); }
})();
