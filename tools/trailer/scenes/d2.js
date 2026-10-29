/**
 * TRAILER V15 — BUỔI D2: SA MẠC (record.js --map DESERT --seed 5 --preroll 3 --sec 22
 *   --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1&nosmoke=1" --script tools/trailer/scenes/d2.js)
 *  (v16: phát kết liễu trúng kho đạn -> nổ, tháp bật bay) Đấu tay đôi qua vai xe Xanh: máy GIỮ NGUYÊN sau xe bắn (không bám đạn — d1 bám đạn làm khung giật), xuyên giáp, xe Đỏ cháy
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  try {
    await S.wait(0.4);
    for (const u of g.units) u.smokeLeft = 0;
    const a = S.units('BLUE', 'ALL_ROUNDER')[0], b = S.units('RED', 'ALL_ROUNDER')[0] || S.units('RED', 'GATLING')[0];
    if (a && b) {
      const c = S.findOpen(320);
      S.duel(a, b, c, 230, 1, true);
      S.freeze(a, true); S.freeze(b, true); b.hp = b.maxHp * 40;   // xe Đỏ nguyên vẹn (không cháy sẵn) tới lúc trúng đạn
      // xe Đỏ chạy ngang tầm nhìn (đổi hướng nhẹ), tháp xe Xanh bám theo, ngắm đón đầu rồi khai hỏa khi xe đang chạy
      const bh0 = b.bodyAngle || 0;
      S.shot('shoulder', { subject: a, target: b, dur: 30, shellP: 0, side: 1, keepTg: true });
      S.log('scene', { n: 1, name: 'duel' });
      const t0 = performance.now() / 1000; let lastT = t0, alive = true, coast = 0;
      const mv = setInterval(() => {
        const tt = performance.now() / 1000, dt = Math.min(0.1, tt - lastT), el = tt - t0; lastT = tt;
        let v = 26 * Math.min(1, el / 0.6);
        if (b.isDead) { coast = Math.min(1, coast + dt / 1.6); v *= (1 - coast); if (coast >= 1) { clearInterval(mv); return; } }
        const h = bh0 + 0.18 * Math.sin(el * 0.9);
        b.bodyAngle = h; b.x += Math.sin(h) * v * dt; b.z += -Math.cos(h) * v * dt; b.y = S.ground(b.x, b.z); b.speed = v;
        if (b.group) { b.group.position.set(b.x, b.y, b.z); b.group.rotation.y = h; }
        if (!b.isDead) {   // tháp xe Xanh bám đón đầu
          const lead = 0.35, px = b.x + Math.sin(h) * v * lead, pz = b.z - Math.cos(h) * v * lead;
          const sol = B.solveAimingForTarget(a.x, a.y, a.z, px, pz, T, a, { atUnit: true });
          S.aim(a, { x: px, y: b.y + 9, z: pz }, sol ? sol.elevation : 1);
          if (sol && sol.charge) a.charge = sol.charge;
        }
      }, 33);
      await S.wait(2.2);
      a.reloadTimer = 0;
      const before = B.activeShells.slice(); S.fire(a); S.log('fire', {}); await S.wait(0.05);
      const sh = B.activeShells.find(x => x.shooterId === a.id && !before.includes(x));
      await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 3);
      if (!b.isDead) S.ammoKill(b, a, { x: b.x - a.x, y: 0, z: b.z - a.z });   // trúng kho đạn: nổ tung, tháp bật bay, xác cháy
      await S.wait(4.5);
      S.log('duelEnd', { dead: !!b.isDead });
      await S.wait(4);
    }
    S.log('done', {});
  } catch (e) { console.error('[D2]', e); S.log('error', { m: String(e && e.message) }); }
})();
