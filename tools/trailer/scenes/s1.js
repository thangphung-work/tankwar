/**
 * TRAILER V13 — BUỔI S (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1" --script .../s1.js)
 *  1. TÁC CHIẾN NHIỀU NGƯỜI CHƠI: hai tuyến xe Xanh / Đỏ nổ súng qua lại — máy gần hơn r2 (xe đủ lớn trong khung)
 *  2. CHIẾM CỨ ĐIỂM: đoàn xe Xanh tiến lên ụ hầm có cờ — máy thấp bên đường tiến quân, ụ hầm + cờ làm nền (flycam: ụ đất che xe)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;
  const alive = (l) => l.filter(u => u && !u.isDead);
  const pick = (l) => l[Math.floor(S.rnd() * l.length)];
  const shoot = (u, v) => {
    if (!u || u.isDead || !v) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.aim(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    u.reloadTimer = 0; S.fire(u);
  };
  try {
    await S.wait(0.4);
    // ---- 1. hai tuyến giao tranh
    const M = S.findOpen(420); M.y = S.ground(M.x, M.z);
    const ox = Math.cos(LIT), oz = Math.sin(LIT), px = -oz, pz = ox;   // o: về phía máy (thuận nắng); p: trục hai tuyến
    const kinds = ['ALL_ROUNDER', 'GATLING', 'SCOUT'];
    const blues = S.units('BLUE').filter(u => kinds.includes(u.tankType)).slice(0, 5);
    const reds = S.units('RED').filter(u => kinds.includes(u.tankType)).slice(0, 5);
    const line = (list, side, hpK) => list.forEach((u, i) => {
      S.freeze(u, true);
      const along = (i - (list.length - 1) / 2) * 55 + (S.rnd() - 0.5) * 12, dist = 170 + (i % 2) * 30;
      S.teleport(u, M.x + px * side * dist + ox * along, M.z + pz * side * dist + oz * along, Math.atan2(-px * side, pz * side));
      u.hp = u.maxHp * hpK;
    });
    line(blues, -1, 0.85); line(reds, 1, 0.4);
    await S.wait(0.4);
    const cam = { x: M.x + ox * 300, z: M.z + oz * 300 }; cam.y = top(cam.x, cam.z) + 22;
    S.shot('fixed', { pos: cam, look: { x: M.x, y: M.y + 10, z: M.z }, dur: 30, fov: 44, drift: { x: px * 5, y: 0, z: pz * 5 } });
    S.log('scene', { n: 1, name: 'clash' });
    await S.wait(0.8);
    let t0 = performance.now() / 1000;
    while (performance.now() / 1000 - t0 < 7) {
      const bl = alive(blues), rl = alive(reds);
      if (!bl.length || !rl.length) break;
      if (S.rnd() < 0.55) shoot(pick(bl), pick(rl)); else shoot(pick(rl), pick(bl));
      await S.wait(0.25 + S.rnd() * 0.2);
    }
    await S.wait(1);
    [...blues, ...reds].forEach(u => S.freeze(u, false));

    // ---- 2. chiếm cứ điểm
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      // hầm xuyên dọc trục f (K.fx, K.fz), miệng hầm ở f = ±96; chọn đầu hầm phía nắng
      const HB = 96, sg = (K.fx * Math.cos(LIT) + K.fz * Math.sin(LIT)) >= 0 ? 1 : -1;
      const W = (f, r) => ({ x: K.x + K.fx * f * sg + K.rx * r, z: K.z + K.fz * f * sg + K.rz * r });
      const G = K.G || S.ground(K.x, K.z);
      const team = alive(blues).slice(0, 3);
      const head = Math.atan2(-K.fx * sg, K.fz * sg);   // mũi xe hướng vào miệng hầm (-f)
      team.forEach((u, i) => { S.freeze(u, true); u.hp = u.maxHp; const p = W(HB + 430 + i * 65, (i - 1) * 36); S.teleport(u, p.x, p.z, head); });
      await S.wait(0.4);
      const p = W(HB + 330, 170); p.y = top(p.x, p.z) + 22;
      const m = W(HB, 0);
      S.shot('fixed', { pos: p, look: { x: m.x, y: G + 22, z: m.z }, dur: 30, fov: 44 });
      S.log('scene', { n: 2, name: 'capture', sg });
      await S.glide(team, -K.fx * sg, -K.fz * sg, 55, 7);
      team.forEach(u => S.freeze(u, false));
    }
    S.log('done', {});
  } catch (e) { console.error('[S1]', e); S.log('error', { m: String(e && e.message) }); }
})();
