/**
 * TRAILER V19 — BUỔI B1: TRẬN LIỀN MẠCH (gộp "tác chiến nhiều người chơi" + "giao chiến khốc liệt")
 *   record.js --map RIVER_LAKE --seed 17 --preroll 3 --sec 13 --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1&nosmoke=1"
 *   --script tools/trailer/scenes/b1.js
 *  Một cảnh ~9 s: máy mở từ trên cao thấy cả hai phe (6 đấu 6) rồi hạ dần, êm, vào giữa hỗn chiến. Xe không xếp hàng —
 *  mỗi xe chạy lượn một đường riêng, tháp bám mục tiêu, bắn trong lúc chạy. Xe lần lượt bị hạ; mốc 'boom' (nổ kho đạn, tháp
 *  bay) dùng để khớp đúng cú "ẦM" của nhạc khi dựng.
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;
  const alive = (l) => l.filter(u => u && !u.isDead);
  const pick = (l) => l[Math.floor(S.rnd() * l.length)];
  const now = () => performance.now() / 1000;
  const noSmoke = () => { for (const u of g.units) u.smokeLeft = 0; };
  const ease = (k) => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a + (b - a) * k;
  // tháp xoay MƯỢT (S.slew), giữ mục tiêu tới khi nó bị hạ, chỉ bắn khi nòng đã quay tới — không nhảy cóc
  const shoot = (u, v) => {
    if (!u || u.isDead) return;
    if (u._tg && !u._tg.isDead) v = u._tg; else u._tg = v;
    if (!v || v.isDead) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.slew(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    if (S.slewReady(u)) { u.reloadTimer = 0; S.fire(u); }
  };
  const kinds = ['ALL_ROUNDER', 'GATLING', 'SCOUT'];
  try {
    await S.wait(0.4);
    noSmoke();
    // bãi đất khô, bằng
    const dry = (c) => { const g0 = T.groundAtRaw(c.x, c.z); for (let r = 0; r <= 480; r += 60) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, h = T.groundAtRaw(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); if (h < T.waterLevel + 1.5 || Math.abs(h - g0) > 16) return false; } return true; };
    let M = null;
    for (let i = 0; i < 80 && !M; i++) { const c = S.findOpen(440); if (c && dry(c)) M = c; }
    if (!M) M = S.findOpen(440);
    M.y = S.ground(M.x, M.z);
    const ox = Math.cos(LIT), oz = Math.sin(LIT), px = -oz, pz = ox;   // o: về phía máy (thuận nắng); p: trục hai phe
    const bl = S.units('BLUE').filter(u => kinds.includes(u.tankType)).slice(0, 6);
    const rl = S.units('RED').filter(u => kinds.includes(u.tankType)).slice(0, 6);
    const plan = (u, i, side, n) => {
      const along = (i - (n - 1) / 2) * 85 + (S.rnd() - 0.5) * 60, dist = 80 + S.rnd() * 130;
      const x = M.x + px * side * dist + ox * along, z = M.z + pz * side * dist + oz * along;
      const base = Math.atan2(-px * side, pz * side) + (S.rnd() - 0.5) * 1.2;
      return { u, x, z, h: base, base, amp: 0.3 + S.rnd() * 0.55, w: 0.45 + S.rnd() * 0.7, ph: S.rnd() * 6, v: (side < 0 ? 10 : 8) + S.rnd() * 10, rev: S.rnd() < 0.2 };
    };
    const P = [...bl.map((u, i) => plan(u, i, -1, bl.length)), ...rl.map((u, i) => plan(u, i, 1, rl.length))];
    P.forEach(q => { S.freeze(q.u, true); q.u.hp = q.u.maxHp * 8; S.teleport(q.u, q.x, q.z, q.h); });
    noSmoke();
    await S.wait(0.4);
    // máy: mở trên cao (thấy cả 12 xe) -> hạ dần vào giữa trận, trượt ngang nhẹ; không nghiêng khung, không zoom
    const DUR = 9.0;
    const c0 = { x: M.x + ox * 330 - px * 170, z: M.z + oz * 330 - pz * 170 }, c1 = { x: M.x + ox * 150 - px * 40, z: M.z + oz * 150 - pz * 40 };
    const y0 = top(c0.x, c0.z) + 165, y1 = top(c1.x, c1.z) + 30;
    let tP = null;
    S.shot('path', {
      dur: 40, fn: () => {
        if (tP === null) tP = now();
        const k = ease(Math.min(1, (now() - tP) / DUR));
        return { pos: { x: lerp(c0.x, c1.x, k), y: lerp(y0, y1, k), z: lerp(c0.z, c1.z, k) }, look: { x: M.x + px * lerp(20, 50, k), y: M.y + lerp(0, 6, k), z: M.z + pz * lerp(20, 50, k) }, fov: 48, roll: 0, stiff: 12, lookStiff: 12 };
      }
    });
    S.log('scene', { n: 1, name: 'battle' });
    await S.until(() => tP !== null, 5);
    // bộ lái: hướng = base + lượn sin, tốc độ riêng, vài xe lùi
    let last = tP;
    const drv = setInterval(() => {
      const tt = now(), dt = Math.min(0.1, tt - last), el = tt - tP; last = tt;
      for (const q of P) {
        const u = q.u; if (u.isDead) continue;
        q.h = q.base + q.amp * Math.sin(q.w * el + q.ph);
        const sp = q.v * Math.min(1, el / 0.8) * (q.rev ? -0.7 : 1), dx = Math.sin(q.h), dz = -Math.cos(q.h);
        u.x += dx * sp * dt; u.z += dz * sp * dt; u.y = S.ground(u.x, u.z); u.speed = Math.abs(sp);
        u.bodyAngle = q.h; if (u.group) { u.group.position.set(u.x, u.y, u.z); u.group.rotation.y = q.h; }
      }
    }, 33);
    const killShot = async (u, v, ammo, tag) => {
      if (!u || u.isDead || !v || v.isDead) return;
      u._tg = v;
      const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
      S.slew(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
      if (sol && sol.charge) u.charge = sol.charge;
      await S.until(() => S.slewReady(u) || u.isDead || v.isDead, 1.6);
      const before = B.activeShells.slice();
      u.reloadTimer = 0; S.fire(u);
      await S.wait(0.05);
      const sh = B.activeShells.find(x => x.shooterId === u.id && !before.includes(x));
      await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 3);
      if (!v.isDead) { if (ammo) S.ammoKill(v, u, { x: v.x - u.x, y: 0, z: v.z - u.z }); else try { v.takeDamage(v.hp + 50, u, 'SHELL'); } catch (e) {} }
      S.log(tag || 'kill1', { dead: !!v.isDead, ammo: !!ammo });
    };
    // lịch hạ xe (giây kể từ lúc máy bắt đầu): 'boom' ~5,4 s = nổ kho đạn lớn nhất, giữa lúc máy đang hạ xuống
    const sched = [[2.0, bl[1], rl[2], false], [3.6, rl[0], bl[4], false], [5.1, bl[2], rl[3], true, 'boom'], [6.6, rl[4], bl[0], false], [7.7, bl[3], rl[1], true]];
    let k = 0;
    while (now() - tP < DUR + 0.5) {
      const el = now() - tP;
      if (k < sched.length && el >= sched[k][0]) { const [, u, v, am, tag] = sched[k++]; killShot(alive([u])[0] || alive(u.team === 'BLUE' ? bl : rl)[0], v, am, tag); }
      else {
        const a = alive(bl), r = alive(rl);
        if (a.length && r.length) { if (S.rnd() < 0.55) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); }
      }
      noSmoke();
      await S.wait(0.22 + S.rnd() * 0.16);
    }
    clearInterval(drv);
    S.log('battleEnd', { r: alive(rl).length, b: alive(bl).length });
    await S.wait(0.6);
    [...bl, ...rl].forEach(u => S.freeze(u, false));
    S.log('done', {});
  } catch (e) { console.error('[B1]', e); S.log('error', { m: String(e && e.message) }); }
})();
