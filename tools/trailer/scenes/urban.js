/**
 * ĐÔ THỊ DƯỚI MƯA BÃO (record.js --map URBAN --seed 3 --q "kami=1&lens=1" --script .../urban.js)
 *  1. CÚ MÁY BIỂU TƯỢNG: xe tăng in bóng đen ở tiền cảnh, phía sau cao ốc trúng pháo kích gãy đổ, bụi bê tông cuộn trào
 *     (máy tele thấp sau xe). Lần 2: cao ốc khác, máy thấp ngước lên.
 *  2. Phòng không: UAV cảm tử lao tới cụm xe có 2 xe 6 nòng -> 6 nòng ngóc nòng xả đạn chặn
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const sh = () => S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
  try {
    await S.wait(0.4);
    const BS = T.buildingSet;
    const list = BS && BS.items ? BS.items.filter(B => !B.collapsed && (B.topY || 0) > 70).sort((p, q) => (q.topY || 0) - (p.topY || 0)).slice(0, 30) : [];
    const used = new Set();
    for (let take = 0; take < 2; take++) {
      let pick = null;
      for (let i = 0; i < 60 && !pick; i++) {
        const B = list[Math.floor(S.rnd() * list.length)];
        if (!B || used.has(B)) continue;
        const r = Math.max(B.halfW, B.halfD), a = S.rnd() * Math.PI * 2, d = r * 2.2 + (take === 0 ? 300 : 110);
        const cp = { x: B.x + Math.cos(a) * d, z: B.z + Math.sin(a) * d };
        let ok = S.obstacleTop(cp.x, cp.z) - S.ground(cp.x, cp.z) < 2;
        // tầm nhìn từ máy tới chân nhà không bị nhà khác chắn
        for (let t = 0.15; t < 0.8 && ok; t += 0.08) { const x = cp.x + (B.x - cp.x) * t, z = cp.z + (B.z - cp.z) * t; if (S.obstacleTop(x, z) - S.ground(x, z) > 25) ok = false; }
        if (ok) pick = { B, cp, a, r, d };
      }
      if (!pick) { S.log('skip', { take }); continue; }
      used.add(pick.B);
      const { B, cp, a, r } = pick, gy = B.y || S.ground(B.x, B.z), top = gy + (B.topY || 80);
      cp.y = S.ground(cp.x, cp.z) + (take === 0 ? 5 : 4);
      if (take === 0) {
        // xe tăng tiền cảnh, giữa máy và cao ốc
        const hero = S.units('BLUE', 'ALL_ROUNDER')[0];
        if (hero) { S.freeze(hero, true); const hx = cp.x + (B.x - cp.x) * 0.3, hz = cp.z + (B.z - cp.z) * 0.3; S.teleport(hero, hx, hz, Math.atan2(B.x - hx, -(B.z - hz)) + 0.5); }
      }
      S.shot('fixed', { pos: cp, look: { x: B.x, y: take === 0 ? gy + (top - gy) * 0.35 : (gy + top) / 2, z: B.z }, dur: 30, fov: take === 0 ? 26 : 42, noDrone: true, drift: { x: 0, y: 0.6, z: 0 } });
      S.log('scene', { n: take, name: take === 0 ? 'hero-collapse' : 'tower-collapse' });
      await S.wait(0.8);
      // nhà sập khi tầng trệt mất quá nửa sức chịu (destructibles: dropFloors / collapse) -> nã gần ngang vào chân nhà, luân phiên
      // hai mặt bên (không bắn xuyên qua xe tiền cảnh), vài phát dội nóc cho có khói lửa trên cao
      for (let i = 0; i < 60 && !B.collapsed; i++) {
        const side = i % 2 ? 1 : -1, high = i % 6 === 5;
        const h = high ? gy + (top - gy) * (0.5 + 0.4 * S.rnd()) : gy + 4 + S.rnd() * 22;
        const sx = Math.cos(a + side * Math.PI / 2), sz = Math.sin(a + side * Math.PI / 2);
        S.shellAt(sh(), B.x + sx * B.halfW * 0.9 + (S.rnd() - 0.5) * r * 0.8, h, B.z + sz * B.halfD * 0.9 + (S.rnd() - 0.5) * r * 0.8, 'HE', a + side * Math.PI / 2, high ? 0.8 : 0.12);
        await S.wait(0.2 + S.rnd() * 0.18);
      }
      S.log('collapse', { take, collapsed: !!B.collapsed });
      await S.wait(7);
    }
    // ---------- 2. phòng không
    const L = S.units(null, 'ARTILLERY').find(u => u.uavKind === 'kami' && (u.kamikazeCount || 0) > 0);
    if (L && g.otherDrone) {
      const foe = L.team === 'BLUE' ? 'RED' : 'BLUE';
      const c = S.findOpen(260);
      const tg = S.units(foe, 'ALL_ROUNDER')[0], aa = S.units(foe, 'GATLING').slice(0, 2);
      S.freeze(L, true); S.teleport(L, c.x - 520, c.z, Math.PI / 2);
      if (tg) { S.freeze(tg, true); S.teleport(tg, c.x + 60, c.z, -Math.PI / 2); }
      aa.forEach((u, i) => S.teleport(u, c.x - 30, c.z + (i - 0.5) * 110, -Math.PI / 2));
      const R = g.otherDrone(L);
      if (R.bot) R.bot.wait = 0.3;
      if (aa[0]) {
        const pos = { x: aa[0].x + 70, z: aa[0].z + 40 }; pos.y = S.ground(pos.x, pos.z) + 16;
        S.shot('fixed', { pos, look: { x: c.x - 260, y: S.ground(c.x, c.z) + 170, z: c.z }, dur: 30, fov: 50, noDrone: true });
      }
      S.log('scene', { n: 3, name: 'aa' });
      await S.until(() => R.state === 'launching' || R.state === 'flying', 10);
      if (R.bot && tg) R.bot.tgt = tg;
      await S.until(() => R.state !== 'launching' && R.state !== 'flying', 16);
      S.log('aaEnd', { st: R.state });
      await S.wait(3);
    } else S.log('skip', { n: 3, why: 'no kami' });
    S.log('done', {});
  } catch (e) { console.error('[URBAN]', e); S.log('error', { m: String(e && e.message) }); }
})();
