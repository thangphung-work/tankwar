/**
 * CHUỐT LẠI TRAILER V1 — các cảnh quay bù (record.js --map RIVER_LAKE --seed 17
 *   --q "ptype=ALL_ROUNDER&calm=1&gfx=high&kami=1&nocamo=1" --script .../v8.js)
 *  1. Xe trinh sát (không lưới ngụy trang) lướt qua dưới nắng
 *  2. Pháo tự hành khai hỏa -> máy bám theo viên đạn -> nổ giữa cụm xe địch, sóng xung kích quét bụi
 *  3. Cùng loạt đó nhìn từ xa (máy tĩnh, góc rộng): đạn rơi, sóng xung kích lan trên mặt đất
 *  4. UAV cảm tử của bot lao vào xe tăng: máy bám sau UAV rồi máy tĩnh cạnh mục tiêu (2 lần phóng)
 *  5. Flycam chậm trên cứ điểm (cờ đã chỉnh vẫy chậm) làm nền logo
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  // máy quay lưng về mặt trời (nuke5: hướng sunA + 1.62π thuận sáng)
  const LIT = sunA + Math.PI * 1.62;
  const lastShell = (u) => { const L = B.activeShells; for (let i = L.length - 1; i >= 0; i--) if (L[i].shooterId === u.id) return L[i]; return L[L.length - 1] || null; };
  try {
    await S.wait(0.4);
    // ---- 1. xe trinh sát lướt qua
    const sc = take('BLUE', ['SCOUT']);
    if (sc) {
      const c = S.findOpen(260), mx = Math.cos(LIT + Math.PI / 2), mz = Math.sin(LIT + Math.PI / 2);
      S.freeze(sc, true);
      S.teleport(sc, c.x - mx * 150, c.z - mz * 150, Math.atan2(mx, -mz));
      const cp = { x: c.x + Math.cos(LIT) * 75, z: c.z + Math.sin(LIT) * 75 }; cp.y = top(cp.x, cp.z) + 5;
      S.shot('fixed', { pos: cp, look: { x: c.x, y: S.ground(c.x, c.z) + 6, z: c.z }, lookAt: sc, dur: 30, fov: 34 });
      S.log('scene', { n: 1, name: 'scout-drive', camo: (sc.kit && sc.kit.m || []).join(',') });
      await S.glide([sc], mx, mz, 70, 4.2);
      S.freeze(sc, false);
    }

    // ---- 2-3. pháo tự hành bắn cụm xe địch
    const art = take('BLUE', ['ARTILLERY']);
    const reds = [take('RED', ['ALL_ROUNDER']), take('RED', ['GATLING', 'SCOUT']), take('RED', ['ALL_ROUNDER', 'SCOUT'])].filter(Boolean);
    if (art && reds.length) {
      const c = S.findOpen(420), dir = LIT + Math.PI / 2, dx = Math.cos(dir), dz = Math.sin(dir);
      const tg = { x: c.x + dx * 380, z: c.z + dz * 380 };
      S.freeze(art, true);
      S.teleport(art, c.x - dx * 380, c.z - dz * 380, Math.atan2(dx, -dz) + 0.35);
      const place = () => reds.forEach((u, i) => { if (u.isDead) return; S.freeze(u, true); S.teleport(u, tg.x + (i - 1) * 26 * -dz + (S.rnd() - 0.5) * 10, tg.z + (i - 1) * 26 * dx, Math.atan2(-dx, dz) + (S.rnd() - 0.5)); u.hp = u.maxHp * 0.25; });
      place();
      art.isDeployed = true; art.deployProgress = 1;
      const aimAt = () => { const sol = B.solveAimingForTarget(art.x, art.y, art.z, tg.x, tg.z, T, art); S.aim(art, tg, sol ? sol.elevation : 6); return sol; };
      // 2. sau lưng xe pháo -> bám đạn
      const pc = { x: art.x - dx * 70 + dz * 18, z: art.z - dz * 70 - dx * 18 }; pc.y = top(pc.x, pc.z) + 12;
      S.shot('fixed', { pos: pc, look: { x: tg.x, y: S.ground(tg.x, tg.z) + 20, z: tg.z }, dur: 30, fov: 40 });
      const sol = aimAt();
      S.log('scene', { n: 2, name: 'arty-follow', el: sol && sol.elevation, d: Math.round(Math.hypot(tg.x - art.x, tg.z - art.z)) });
      await S.wait(1.6);
      S.fire(art);
      const sh = lastShell(art);
      if (sh) S.shot('shell', { subject: art, shell: sh, track: 8, dur: 30 });
      await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 9);
      S.log('impact', { ok: !!sh });
      await S.wait(2.4);
      // 3. máy tĩnh góc rộng bên sườn: loạt thứ hai rơi, sóng xung kích lan trên mặt đất
      place();
      const wp = { x: tg.x + Math.cos(LIT) * 330, z: tg.z + Math.sin(LIT) * 330 }; wp.y = top(wp.x, wp.z) + 26;
      S.shot('fixed', { pos: wp, look: { x: tg.x, y: S.ground(tg.x, tg.z) + 6, z: tg.z }, dur: 30, fov: 32 });
      S.log('scene', { n: 3, name: 'arty-impact-wide' });
      await S.wait(1.0);
      art.reloadTimer = 0; aimAt(); S.fire(art);
      await S.wait(5.5);
      reds.forEach(u => S.freeze(u, false));
      S.freeze(art, false);
    }

    // ---- 4. UAV cảm tử của bot đỏ lao vào xe tăng xanh (2 lần: máy bám UAV, máy tĩnh cạnh mục tiêu)
    const ks = S.units('RED', 'ARTILLERY').filter(u => u.uavKind === 'kami');
    S.log('kamis', { n: ks.length });
    for (let k = 0; k < Math.min(2, ks.length); k++) {
      const L = ks[k], tgt = take('BLUE', ['ALL_ROUNDER', 'GATLING']);
      if (!tgt) break;
      const c = S.findOpen(400), dir = LIT + Math.PI / 2 + (k ? 0.5 : -0.3), dx = Math.cos(dir), dz = Math.sin(dir);
      S.freeze(L, true); S.freeze(tgt, true);
      S.teleport(tgt, c.x + dx * 250, c.z + dz * 250, Math.atan2(dz, dx));
      S.teleport(L, c.x - dx * 350, c.z - dz * 350, Math.atan2(dx, -dz));
      tgt.hp = tgt.maxHp * 0.3;
      const R = g.otherDrone(L);
      if (R.bot) { R.bot.wait = 0.4; R.bot.reloadT = 0; }
      if (R.state === 'lost') R.state = 'docked';
      L.kamikazeCount = Math.max(1, L.kamikazeCount || 0);
      // bot phóng / bám theo mục tiêu "đã lộ" (TeamIntel): ép xe pháo này chọn đúng xe xanh đã dàn dựng
      const okn = g.botKnownEnemy;
      g.botKnownEnemy = function (u) { return u === L ? tgt : okn.apply(this, arguments); };
      if (k === 0) S.shot('drone', { rec: R, subject: L, dur: 30, side: 1 });
      else {
        const fp = { x: tgt.x + Math.cos(LIT) * 120 + dz * 30, z: tgt.z + Math.sin(LIT) * 120 - dx * 30 }; fp.y = top(fp.x, fp.z) + 8;
        S.shot('fixed', { pos: fp, look: { x: tgt.x, y: tgt.y + 25, z: tgt.z }, dur: 30, fov: 40 });
      }
      S.log('scene', { n: 4 + k, name: k ? 'kami-fixed' : 'kami-chase' });
      const t0 = performance.now() / 1000;
      // bot tự chọn mục tiêu; gán khóa vào xe xanh khi UAV đã bay
      while (performance.now() / 1000 - t0 < 18) {
        if (R.bot && R.state !== 'docked') { R.bot.tgt = tgt; R.bot.lostT = 0; }
        if (tgt.isDead || (R.state === 'lost' && performance.now() / 1000 - t0 > 2)) break;
        await S.wait(0.1);
      }
      g.botKnownEnemy = okn;
      S.log('kamiEnd', { st: R.state, dead: !!tgt.isDead });
      await S.wait(2.5);
      S.freeze(L, false); S.freeze(tgt, false);
    }

    // ---- 5. flycam trên cứ điểm làm nền logo
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      const p = { x: K.x + Math.cos(LIT) * 330, z: K.z + Math.sin(LIT) * 330 }; p.y = top(p.x, p.z) + 120;
      const sx = -Math.sin(LIT) * 9, sz = Math.cos(LIT) * 9;
      S.shot('fixed', { pos: p, look: { x: K.x, y: S.ground(K.x, K.z) + 10, z: K.z }, dur: 30, fov: 36, drift: { x: sx, y: -1.5, z: sz } });
      S.log('scene', { n: 6, name: 'stronghold-aerial' });
      await S.wait(8);
    }
    S.log('done', {});
  } catch (e) { console.error('[V8]', e); S.log('error', { m: String(e && e.message) }); }
})();
