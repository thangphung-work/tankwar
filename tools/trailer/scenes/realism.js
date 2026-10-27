/**
 * KỊCH BẢN CẢNH DÀN DỰNG "ĐỘ CHÂN THỰC" (record.js --script tools/trailer/scenes/realism.js)
 * Chạy trong trang sau khi bắt đầu ghi, theo đồng hồ ảo. Mỗi cảnh ghi nhật ký 'stage' để dựng phim tìm đúng đoạn.
 *  1. Đấu tay đôi xe tăng: bắn xuyên sườn, bám theo viên đạn, quay chậm lúc hạ, vòng quanh xác xe cháy
 *  2. Pháo 6 nòng rót đạn vạch đường vào xe trinh sát (máy sát đất cạnh nạn nhân)
 *  3. Xe tăng khai hỏa thẳng về phía ống kính (lửa đầu nòng, sóng bụi)
 *  4. Pháo kích phá sập nhà
 *  5. Pháo kích vào rừng: cây gãy đổ, bốc cháy
 *  6. Đạn chùm trùm lên cụm xe, nhìn từ drone
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const pickU = (team, types) => { for (const t of types) { const l = S.units(team, t); if (l.length) return l[Math.floor(S.rnd() * l.length)]; } return S.units(team)[0]; };
  const dead = (u) => !u || u.isDead;

  async function duel(n, typesA, typesB, opts) {
    const a = pickU('BLUE', typesA), b = pickU('RED', typesB);
    if (!a || !b) { S.log('skip', { n }); return; }
    const c = S.findOpen(260);
    const geo = S.duel(a, b, c, opts.dist || 260, opts.hp || 0.3, opts.broadside !== false);
    S.log('scene', { n, name: opts.name });
    await S.wait(0.3);
    if (opts.cam === 'shoulder') S.shot('shoulder', { subject: a, target: b, dur: 30, shellP: 1, side: 1 });
    else if (opts.cam === 'victim') S.shot('low', { subject: b, dur: 30, shellP: 0 });
    else if (opts.cam === 'front') S.shot('front', { subject: a, dur: 30, shellP: 0 });
    await S.until(() => dead(b) || dead(a), opts.max || 20);
    S.log('sceneEnd', { n, killed: dead(b) });
    await S.wait(5.5);   // cảnh xác xe (đạo diễn tự chuyển sang 'wreck' khi xe bị hạ)
  }

  async function bombard(n, name, center, look, camPos, ammo, count, gap, shooterType) {
    const sh = pickU('RED', [shooterType || 'ARTILLERY']);
    S.shot('fixed', { pos: camPos, look, dur: count * gap + 8, fov: 50, drift: { x: (S.rnd() - 0.5) * 6, y: 0.6, z: (S.rnd() - 0.5) * 6 } });
    S.log('scene', { n, name });
    await S.wait(1.2);
    for (let i = 0; i < count; i++) {
      const j = center.spread || 30;
      S.shellAt(sh, center.x + (S.rnd() - 0.5) * j, center.y, center.z + (S.rnd() - 0.5) * j, typeof ammo === 'function' ? ammo(i) : ammo, center.from || 0, 0.8);
      await S.wait(gap * (0.6 + S.rnd() * 0.8));
    }
    await S.wait(6);
    S.log('sceneEnd', { n });
  }

  try {
    await S.wait(0.5);
    // 1. đấu tay đôi xe tăng chủ lực: bám theo viên đạn xuyên sườn
    await duel(1, ['ALL_ROUNDER'], ['ALL_ROUNDER'], { name: 'mbt-duel', cam: 'shoulder', hp: 0.25, dist: 300 });
    // 2. pháo 6 nòng rót đạn vào xe trinh sát, máy sát đất cạnh nạn nhân
    await duel(2, ['GATLING'], ['SCOUT', 'ALL_ROUNDER'], { name: 'gatling', cam: 'victim', hp: 0.5, dist: 220 });
    // 3. khai hỏa về phía ống kính
    await duel(3, ['ALL_ROUNDER'], ['GATLING', 'SCOUT'], { name: 'muzzle', cam: 'front', hp: 0.3, dist: 280, broadside: false });

    // 4. pháo kích phá sập nhà (nhà to nhất còn nguyên, có chỗ đặt máy nhìn thông)
    const BS = g.terrain.buildingSet;
    if (BS && BS.items && BS.items.length) {
      const list = BS.items.filter(B => !B.collapsed).sort((p, q) => (q.halfW * q.halfD) - (p.halfW * p.halfD)).slice(0, 12);
      const B = list[Math.floor(S.rnd() * list.length)];
      const r = Math.max(B.halfW, B.halfD), a = S.rnd() * Math.PI * 2, d = r * 3.2 + 90;
      const cp = { x: B.x + Math.sin(a) * d, z: B.z + Math.cos(a) * d };
      cp.y = S.obstacleTop(cp.x, cp.z) + 22;
      const top = (B.y || S.ground(B.x, B.z)) + (B.topY || 40);
      await bombard(4, 'house', { x: B.x, y: (B.y || S.ground(B.x, B.z)) + 10, z: B.z, spread: r * 1.2, from: a + Math.PI }, { x: B.x, y: (top + S.ground(B.x, B.z)) / 2, z: B.z }, cp, 'HE', 9, 0.55);
    }

    // 5. pháo kích vào rừng: cụm cây dày nhất quanh vài điểm thử
    const TF = g.terrain.trees;
    if (TF && TF.items && TF.items.length) {
      let best = null, bn = 0;
      for (let i = 0; i < 60; i++) {
        const t = TF.items[Math.floor(S.rnd() * TF.items.length)];
        const n = TF.near(t.x, t.z, 70).length;
        if (n > bn) { bn = n; best = t; }
      }
      if (best) {
        const a = S.rnd() * Math.PI * 2, d = 230;
        const cp = { x: best.x + Math.sin(a) * d, z: best.z + Math.cos(a) * d };
        cp.y = S.obstacleTop(cp.x, cp.z) + 30;
        const gy = S.ground(best.x, best.z);
        await bombard(5, 'forest', { x: best.x, y: gy + 5, z: best.z, spread: 90, from: a + Math.PI }, { x: best.x, y: gy + 30, z: best.z }, cp, (i) => i % 3 === 2 ? 'INCENDIARY' : 'HE', 9, 0.5);
      }
    }

    // 6. đạn chùm trùm lên cụm xe địch, nhìn từ drone
    const reds = S.units('RED');
    if (reds.length) {
      const c = S.findOpen(200);
      const vic = reds.slice(0, 3);
      vic.forEach((u, i) => S.teleport(u, c.x + (i - 1) * 70, c.z + (S.rnd() - 0.5) * 60, S.rnd() * 6.28));
      const a = S.rnd() * Math.PI * 2;
      const cp = { x: c.x + Math.sin(a) * 330, z: c.z + Math.cos(a) * 330 };
      cp.y = S.ground(c.x, c.z) + 190;
      await bombard(6, 'cluster', { x: c.x, y: c.y + 4, z: c.z, spread: 140, from: a }, { x: c.x, y: c.y, z: c.z }, cp, (i) => i % 2 ? 'CLUSTER' : 'HE', 7, 0.6, 'ARTILLERY');
    }
    S.log('done', {});
  } catch (e) { console.error('[SCENES]', e); S.log('error', { m: String(e && e.message) }); }
})();
