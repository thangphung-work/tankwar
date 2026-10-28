/**
 * V1 CHUỐT LẠI — quay bù 3 (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&kami=1&nocamo=1" --script .../v8d.js)
 *  1. Pháo tự hành khai hỏa vào một ngôi nhà (không bắn xuống bãi trống): máy bay song song viên đạn -> trúng nhà
 *  2. Góc rộng thuận sáng: loạt đạn tiếp theo tới khi nhà sập
 *  3. UAV cảm tử: bay xuôi nắng (máy bám không nhìn ngược mặt trời), bám liền mạch tới lúc nổ
 *  4. UAV cảm tử thứ hai: máy tĩnh cạnh xe, thấy UAV lao vào liền một hơi
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics, TR = window.__TR;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;   // hướng đặt máy so với vật: máy quay lưng về mặt trời
  const newShell = (u, before) => B.activeShells.find(s => s.shooterId === u.id && !before.includes(s)) || null;
  const flatOpen = (p, r) => { const g0 = S.ground(p.x, p.z); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(S.ground(x, z) - g0) > 6 || S.obstacleTop(x, z) > S.ground(x, z) + 0.5) return false; } return true; };
  try {
    await S.wait(0.4);
    // ---- 1-2. nhà mục tiêu: nhà thấp tầng, quanh nó không chen chúc
    const BS = T.buildingSet, list = (BS && BS.items || []).filter(b => !b.collapsed && b.floors <= 3 && Math.max(b.halfW, b.halfD) < 60);
    let H = null, artP = null;
    for (const b of list) {
      const crowd = list.filter(o => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 90).length;
      if (crowd > 2) continue;
      for (let k = 0; k < 8 && !artP; k++) {
        const a = LIT + Math.PI / 2 + k * Math.PI / 4, p = { x: b.x + Math.cos(a) * 1800, z: b.z + Math.sin(a) * 1800 };
        if (flatOpen(p, 40)) artP = p;
      }
      if (artP) { H = b; break; }
    }
    const art = take('BLUE', ['ARTILLERY']);
    S.log('house', { ok: !!H, n: list.length, kind: H && H.kind, floors: H && H.floors });
    if (H && art) {
      const hp = { x: H.x, z: H.z }, dx = (hp.x - artP.x) / 1800, dz = (hp.z - artP.z) / 1800;
      S.freeze(art, true);
      S.teleport(art, artP.x, artP.z, Math.atan2(dx, -dz) + 0.35);
      art.isDeployed = true; art.deployProgress = 1;
      const aimAt = () => { const sol = B.solveAimingForTarget(art.x, art.y, art.z, hp.x, hp.z, T, art); S.aim(art, hp, sol ? sol.elevation : 30); if (sol && sol.charge) art.charge = sol.charge; return sol; };
      const sol = aimAt();
      const pa = { x: art.x + Math.cos(LIT) * 85 + dx * 30, z: art.z + Math.sin(LIT) * 85 + dz * 30 }; pa.y = top(pa.x, pa.z) + 6;
      S.shot('fixed', { pos: pa, look: { x: art.x + dx * 20, y: art.y + 16, z: art.z + dz * 20 }, dur: 30, fov: 38 });
      S.log('scene', { n: 1, name: 'arty-fire', el: sol && sol.elevation });
      await S.wait(1.8);
      const before = B.activeShells.slice();
      S.fire(art);
      await S.wait(0.05);
      const sh = newShell(art, before);
      await S.wait(0.25);
      if (sh) S.shot('shellside', { subject: art, shell: sh, dur: 30, side: 1, off: 130, hold: 3.5, fov: 44 });
      S.log('scene', { n: 2, name: 'arty-shellside', ok: !!sh });
      await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 10);
      S.log('hit1', {});
      await S.wait(3.6);
      // 2. góc rộng thuận sáng: bắn tiếp tới khi nhà sập
      const wp = { x: hp.x + Math.cos(LIT) * 260, z: hp.z + Math.sin(LIT) * 260 }; wp.y = top(wp.x, wp.z) + 20;
      S.shot('fixed', { pos: wp, look: { x: hp.x, y: S.ground(hp.x, hp.z) + 22, z: hp.z }, dur: 40, fov: 30 });
      S.log('scene', { n: 3, name: 'house-wide' });
      await S.wait(0.6);
      for (let i = 0; i < 9 && !H.collapsed; i++) { art.reloadTimer = 0; aimAt(); S.fire(art); await S.wait(1.3); }
      S.log('house2', { collapsed: !!H.collapsed });
      await S.wait(4.5);
      S.freeze(art, false);
    }

    // ---- 3-4. UAV cảm tử: xe pháo đỏ đặt phía mặt trời của mục tiêu -> UAV bay xuôi nắng, máy bám không ngược sáng
    const ks = S.units('RED', 'ARTILLERY').filter(u => u.uavKind === 'kami');
    S.log('kamis', { n: ks.length });
    for (let k = 0; k < Math.min(2, ks.length); k++) {
      const L = ks[k], tgt = take('BLUE', ['ALL_ROUNDER', 'GATLING']);
      if (!tgt) break;
      const c = S.findOpen(400), back = LIT + Math.PI + (k ? 0.35 : -0.25);   // từ mục tiêu về phía mặt trời
      S.freeze(L, true); S.freeze(tgt, true);
      S.teleport(tgt, c.x, c.z, back + Math.PI / 2);
      S.teleport(L, c.x + Math.cos(back) * 620, c.z + Math.sin(back) * 620, Math.atan2(-Math.cos(back), Math.sin(back)));
      tgt.hp = tgt.maxHp * 0.3;
      const R = g.otherDrone(L);
      if (R.bot) { R.bot.wait = 0.4; R.bot.reloadT = 0; }
      if (R.state === 'lost') R.state = 'docked';
      L.kamikazeCount = Math.max(1, L.kamikazeCount || 0);
      const okn = g.botKnownEnemy;
      g.botKnownEnemy = function (u) { return u === L ? tgt : okn.apply(this, arguments); };
      if (k === 0) S.shot('drone', { rec: R, subject: L, dur: 30, side: 1 });
      else {
        const fp = { x: tgt.x + Math.cos(LIT + 0.5) * 110, z: tgt.z + Math.sin(LIT + 0.5) * 110 }; fp.y = top(fp.x, fp.z) + 9;
        S.shot('fixed', { pos: fp, look: { x: tgt.x + Math.cos(back) * 60, y: tgt.y + 30, z: tgt.z + Math.sin(back) * 60 }, dur: 30, fov: 44 });
      }
      S.log('scene', { n: 4 + k, name: k ? 'kami-fixed' : 'kami-chase' });
      const t0 = performance.now() / 1000;
      while (performance.now() / 1000 - t0 < 18) {
        if (R.bot && R.state !== 'docked') { R.bot.tgt = tgt; R.bot.lostT = 0; }
        if (tgt.isDead || (R.state === 'lost' && performance.now() / 1000 - t0 > 2)) break;
        await S.wait(0.1);
      }
      g.botKnownEnemy = okn;
      S.log('kamiEnd', { st: R.state, dead: !!tgt.isDead });
      await S.wait(2.8);
      S.freeze(L, false); S.freeze(tgt, false);
    }
    S.log('done', {});
  } catch (e) { console.error('[V8D]', e); S.log('error', { m: String(e && e.message) }); }
})();
