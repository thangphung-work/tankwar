/**
 * TRAILER V15 — BUỔI N3 (record.js --map RIVER_LAKE --seed 17 --preroll 3 --sec 50
 *   --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1&nosmoke=1" --script tools/trailer/scenes/n3.js)
 *  1. fight-low : (v17) hỗn chiến cơ động, máy cao chếch, xe chạy lượn từng chiếc —, 3 xe Xanh đấu 3 xe Đỏ, từng xe bị hạ (xe chỉ cháy khi trúng phát quyết định)
 *  2. siege     : toàn cảnh cứ điểm từ trên cao — pháo kích dồn dập giã nóc hầm, xe Đỏ phòng thủ quanh hầm bị diệt,
 *                 đoàn 5 xe Xanh vừa bắn vừa tiến vào, cờ Xanh kéo lên
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
  const shoot = (u, v, kill) => {
    if (!u || u.isDead || !v || v.isDead) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.aim(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    u.reloadTimer = 0; S.fire(u);
    if (kill) v.hp = 1;
  };
  const kinds = ['ALL_ROUNDER', 'GATLING', 'SCOUT'];
  const used = new Set();
  const grab = (team, n) => { const l = S.units(team).filter(u => kinds.includes(u.tankType) && !used.has(u)).slice(0, n); l.forEach(u => used.add(u)); return l; };
  try {
    await S.wait(0.4);
    noSmoke();

    // ---- 1. hỗn chiến cơ động (v17): máy cao chếch; xe KHÔNG xếp hàng — mỗi xe một đường chạy riêng (vòng, lượn,
    //      tiến / lùi khác tốc độ), tháp xoay bám mục tiêu và bắn trong lúc chạy; lần lượt có xe bị hạ
    {
      // bãi đất KHÔ, bằng: mọi điểm lấy mẫu trong bán kính 420 cao hơn mặt nước, chênh cao nhỏ
      const dry = (c) => { const g0 = T.groundAtRaw(c.x, c.z); for (let r = 0; r <= 420; r += 70) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, h = T.groundAtRaw(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); if (h < T.waterLevel + 1.5 || Math.abs(h - g0) > 14) return false; } return true; };
      let M = null;
      for (let i = 0; i < 60 && !M; i++) { const c = S.findOpen(420); if (c && dry(c)) M = c; }
      if (!M) M = S.findOpen(420);
      M.y = S.ground(M.x, M.z);
      S.log('fightSpot', { dry: dry(M) });
      const ox = Math.cos(LIT), oz = Math.sin(LIT), px = -oz, pz = ox;
      const bl = grab('BLUE', 4), rl = grab('RED', 4);
      // vị trí rải rác hai phía (không thẳng hàng), hướng chạy + biên độ lượn + tốc độ riêng
      const plan = (u, i, side) => {
        const along = (i - 1.5) * 75 + (S.rnd() - 0.5) * 50, dist = 70 + S.rnd() * 90;
        const x = M.x + px * side * dist + ox * along, z = M.z + pz * side * dist + oz * along;
        const base = Math.atan2(-px * side, pz * side) + (S.rnd() - 0.5) * 1.1;   // hướng chung về phía địch, lệch ngẫu nhiên
        return { u, x, z, h: base, base, amp: 0.35 + S.rnd() * 0.5, w: 0.5 + S.rnd() * 0.7, ph: S.rnd() * 6, v: (side < 0 ? 11 : 8) + S.rnd() * 9, rev: side > 0 && i === 3 };
      };
      const P = [...bl.map((u, i) => plan(u, i, -1)), ...rl.map((u, i) => plan(u, i, 1))];
      P.forEach(q => { S.freeze(q.u, true); q.u.hp = q.u.maxHp * 8; S.teleport(q.u, q.x, q.z, q.h); });
      noSmoke();
      await S.wait(0.4);
      const cp = { x: M.x - px * 210 + ox * 150, z: M.z - pz * 210 + oz * 150 }; cp.y = top(cp.x, cp.z) + 78;
      S.shot('fixed', { pos: cp, look: { x: M.x + px * 20, y: M.y, z: M.z + pz * 20 }, dur: 30, fov: 46, drift: { x: px * 4, y: 0, z: pz * 4 } });
      S.log('scene', { n: 1, name: 'fight-low' });
      // bộ lái: hướng = base + lượn sin, tốc độ riêng; xe trinh sát Đỏ cuối lùi (rev)
      const t0 = now(); let last = t0;
      const drv = setInterval(() => {
        const tt = now(), dt = Math.min(0.1, tt - last), el = tt - t0; last = tt;
        for (const q of P) {
          const u = q.u; if (u.isDead) continue;
          q.h = q.base + q.amp * Math.sin(q.w * el + q.ph);
          const sp = q.v * Math.min(1, el / 0.8) * (q.rev ? -0.7 : 1), dx = Math.sin(q.h), dz = -Math.cos(q.h);
          u.x += dx * sp * dt; u.z += dz * sp * dt; u.y = S.ground(u.x, u.z); u.speed = Math.abs(sp);
          u.bodyAngle = q.h; if (u.group) { u.group.position.set(u.x, u.y, u.z); u.group.rotation.y = q.h; }
        }
      }, 33);
      const killShot = async (u, v, ammo) => {
        if (!u || u.isDead || !v || v.isDead) return;
        const before = B.activeShells.slice();
        shoot(u, v);
        await S.wait(0.05);
        const sh = B.activeShells.find(x => x.shooterId === u.id && !before.includes(x));
        await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 3);
        if (!v.isDead) { if (ammo) S.ammoKill(v, u, { x: v.x - u.x, y: 0, z: v.z - u.z }); else try { v.takeDamage(v.hp + 50, u, 'SHELL'); } catch (e) {} }
        S.log('kill1', { dead: !!v.isDead });
      };
      await S.wait(0.4);
      const sched = [[1.3, bl[0], rl[1], true], [3.0, rl[2], bl[3], false], [4.3, bl[2], rl[0], false]];
      let k = 0;
      while (now() - t0 < 7) {
        const el = now() - t0;
        if (k < sched.length && el >= sched[k][0]) { const [, u, v, am] = sched[k++]; killShot(alive([u])[0] || alive(u.team === 'BLUE' ? bl : rl)[0], v, am); }
        else {
          const a = alive(bl), r = alive(rl);
          if (a.length && r.length) { if (S.rnd() < 0.55) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); }
        }
        noSmoke();
        await S.wait(0.32 + S.rnd() * 0.2);
      }
      clearInterval(drv);
      S.log('fightEnd', { r: alive(rl).length, b: alive(bl).length });
      await S.wait(0.5);
      [...bl, ...rl].forEach(u => S.freeze(u, false));
    }

    // ---- 2. vây đánh cứ điểm, toàn cảnh trên cao
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      const HB = 96, sg = (K.fx * Math.cos(LIT) + K.fz * Math.sin(LIT)) >= 0 ? 1 : -1;
      const W = (f, r) => ({ x: K.x + K.fx * f * sg + K.rx * r, z: K.z + K.fz * f * sg + K.rz * r });
      const G = K.G || S.ground(K.x, K.z);
      // dọn mọi xe khác quanh cứ điểm (tránh tranh chấp / lọt khung)
      for (const u of g.units) if (u !== g.player && Math.hypot(u.x - K.x, u.z - K.z) < 900) { S.freeze(u, true); S.teleport(u, u.x + K.rx * 2200, u.z + K.rz * 2200); }
      const team = grab('BLUE', 5), red = grab('RED', 4);
      const head = Math.atan2(-K.fx * sg, K.fz * sg);
      team.forEach((u, i) => {
        S.freeze(u, true); u.hp = u.maxHp * 30;
        const p = W(HB + 360 + (i % 2) * 40, (i - 2) * 58); S.teleport(u, p.x, p.z, head);
        S.aim(u, { x: K.x, y: G + 6, z: K.z }, 1);
      });
      // xe Đỏ giữ hai bên hầm + phía đầu hầm
      const rp = [W(HB + 40, -105), W(HB + 40, 105), W(-20, -120), W(-20, 120)];
      red.forEach((u, i) => { S.freeze(u, true); u.hp = u.maxHp * 8; S.teleport(u, rp[i].x, rp[i].z, head + Math.PI); });
      K.capture = 0; K.owner = null;
      noSmoke();
      await S.wait(0.5);
      const cc = W(HB + 120, 0), cam = W(HB + 430, 250); cam.y = G + 290;
      S.shot('fixed', { pos: cam, look: { x: cc.x, y: G, z: cc.z }, dur: 40, fov: 46, drift: { x: -K.fx * sg * 6, y: -5, z: -K.fz * sg * 6 } });
      S.log('scene', { n: 2, name: 'siege' });
      const art = S.units('BLUE', 'ARTILLERY')[0] || team[0];
      // pháo kích dồn dập: nóc hầm + quanh vị trí xe Đỏ
      let shelling = true;
      (async () => {
        let i = 0;
        while (shelling) {
          let p;
          if (i % 3 === 1) { const r = rp[Math.floor(S.rnd() * rp.length)]; p = { x: r.x + (S.rnd() - 0.5) * 60, z: r.z + (S.rnd() - 0.5) * 60 }; }
          else p = W((S.rnd() - 0.5) * 2 * (HB - 10), (S.rnd() - 0.5) * 170);
          S.shellAt(art, p.x, G + 38, p.z, i % 4 === 3 ? 'CLUSTER' : 'HE', LIT + Math.PI + (S.rnd() - 0.5), 0.85);
          i++;
          await S.wait(0.11 + S.rnd() * 0.12);
        }
      })();
      // giao tranh: xe Đỏ bắn trả, xe Xanh bắn trong lúc tiến
      let firing = true;
      (async () => {
        while (firing) {
          const a = alive(team), r = alive(red);
          if (r.length) { if (S.rnd() < 0.6) shoot(pick(a), pick(r)); else shoot(pick(r), pick(a)); }
          else if (a.length) { const u = pick(a); S.aim(u, { x: K.x, y: G + 10, z: K.z }, 1); }
          noSmoke();
          await S.wait(0.25 + S.rnd() * 0.15);
        }
      })();
      // xe Đỏ lần lượt bị diệt (đạn pháo rơi trúng)
      (async () => {
        const t0 = now();
        for (const [d, j] of [[1.6, 0], [2.8, 2], [4.0, 1], [5.2, 3]]) {
          await S.until(() => now() - t0 >= d, 10);
          const r = red[j]; if (!r || r.isDead) continue;
          r.hp = 1; S.shellAt(art, r.x, r.y + 3, r.z, 'HE', LIT + Math.PI, 0.85);
          setTimeout(() => { if (!r.isDead) try { r.takeDamage(r.hp + 50, team[0], 'SHELL'); } catch (e) {} }, 1200);
        }
      })();
      await S.wait(0.8);
      await S.glide(team, -K.fx * sg, -K.fz * sg, 38, 7.4);
      for (const r of red) if (!r.isDead) { r.hp = 1; S.shellAt(art, r.x, r.y + 3, r.z, 'HE', LIT + Math.PI, 0.85); }
      shelling = false;
      S.log('inZone', { cap: K.capture, redAlive: alive(red).length });
      await S.wait(0.4);
      for (const r of red) if (!r.isDead) S.teleport(r, r.x + K.rx * 2200, r.z + K.rz * 2200);
      const t1 = now();
      while (now() - t1 < 4) { K.capture = Math.min(100, Math.max(K.capture, 40) + 4); await S.wait(0.1); }
      firing = false;
      S.log('captured', { owner: K.owner, cap: K.capture });
      await S.wait(2.5);
      team.forEach(u => S.freeze(u, false));
    }
    S.log('done', {});
  } catch (e) { console.error('[N3]', e); S.log('error', { m: String(e && e.message) }); }
})();
