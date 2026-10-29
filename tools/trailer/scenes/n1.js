/**
 * TRAILER V14 — BUỔI N1 (record.js --map RIVER_LAKE --seed 17 --preroll 3 --sec 100
 *   --q "ptype=ALL_ROUNDER&calm=1&gfx=high&nocamo=1&nosmoke=1" --script tools/trailer/scenes/n1.js)
 *  1. convoy      : máy ĐỨNG YÊN thuận nắng, đoàn 4 xe (tăng, 6 nòng, pháo tự hành, trinh sát) lần lượt chạy ngang qua khung
 *  2. arty-house  : pháo tự hành bắn -> máy bay song song viên đạn -> trúng nhà, nhà sập; máy lùi ra xa thấy trọn đống đổ nát
 *  3. clash-high  : nhìn từ trên cao chếch một bên, hai tuyến thiết giáp vừa tiến vừa nổ súng (bot không phóng khói)
 *  4. duel        : qua vai xe tăng Xanh, máy GIỮ NGUYÊN sau xe (không bám đạn) -> trúng xe Đỏ
 *  5. kill-side   : máy ngang sườn, xe Xanh bắn hạ xe Đỏ, cả hai trong khung
 *  6. capture     : nhìn từ trên cao xuống cứ điểm: pháo kích giã vào nóc hầm, đoàn xe Xanh tiến vào dốc hầm chiếm cờ
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
  const LIT = sunA + Math.PI * 1.62;   // máy đặt theo hướng này so với vật: quay lưng về mặt trời
  const alive = (l) => l.filter(u => u && !u.isDead);
  const pick = (l) => l[Math.floor(S.rnd() * l.length)];
  const now = () => performance.now() / 1000;
  const newShell = (u, before) => B.activeShells.find(s => s.shooterId === u.id && !before.includes(s)) || null;
  const flatOpen = (p, r) => { const g0 = S.ground(p.x, p.z); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(S.ground(x, z) - g0) > 6 || S.obstacleTop(x, z) > S.ground(x, z) + 0.5) return false; } return true; };
  const shoot = (u, v) => {
    if (!u || u.isDead || !v) return;
    const sol = B.solveAimingForTarget(u.x, u.y, u.z, v.x, v.z, T, u, { atUnit: true });
    S.aim(u, { x: v.x, y: v.y + 8, z: v.z }, sol ? sol.elevation : 1);
    if (sol && sol.charge) u.charge = sol.charge;
    u.reloadTimer = 0; S.fire(u);
  };
  const noSmoke = () => { for (const u of g.units) u.smokeLeft = 0; };
  try {
    await S.wait(0.4);
    noSmoke();

    // ---- 1. đoàn xe chạy qua máy tĩnh
    {
      const c = S.findOpen(300), mx = Math.cos(LIT + Math.PI / 2), mz = Math.sin(LIT + Math.PI / 2);
      const types = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
      const conv = types.map(t => take('BLUE', [t])).filter(Boolean);
      conv.forEach((u, i) => {
        S.freeze(u, true); u.hp = u.maxHp;
        const d = 140 + i * 70;
        S.teleport(u, c.x - mx * d, c.z - mz * d, Math.atan2(mx, -mz));
        if (u.tankType === 'ARTILLERY') { u.isDeployed = false; u.deployProgress = 0; }
        S.aim(u, { x: u.x + mx * 400, y: u.y + 6, z: u.z + mz * 400 }, 1);
      });
      await S.wait(0.4);
      const cp = { x: c.x + Math.cos(LIT) * 190, z: c.z + Math.sin(LIT) * 190 }; cp.y = top(cp.x, cp.z) + 13;
      S.shot('fixed', { pos: cp, look: { x: c.x, y: S.ground(c.x, c.z) + 8, z: c.z }, dur: 40, fov: 40 });
      S.log('scene', { n: 1, name: 'convoy' });
      await S.glide(conv, mx, mz, 50, 10);
      conv.forEach(u => S.freeze(u, false));
    }

    // ---- 2. pháo bắn sập nhà, máy lùi ra
    {
      const BS = T.buildingSet, list = (BS && BS.items || []).filter(b => !b.collapsed && b.floors >= 2 && b.floors <= 3 && Math.max(b.halfW, b.halfD) < 60);
      let H = null, artP = null;
      for (const b of list) {
        if (list.filter(o => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 90).length > 2) continue;
        for (let k = 0; k < 8 && !artP; k++) {
          const a = LIT + Math.PI / 2 + k * Math.PI / 4, p = { x: b.x + Math.cos(a) * 1800, z: b.z + Math.sin(a) * 1800 };
          if (flatOpen(p, 40)) artP = p;
        }
        if (artP) { H = b; break; }
      }
      const art = take('BLUE', ['ARTILLERY']) || S.units('BLUE', 'ARTILLERY')[0];
      if (H && art) {
        const hp = { x: H.x, z: H.z }, dx = (hp.x - artP.x) / 1800, dz = (hp.z - artP.z) / 1800;
        S.freeze(art, true);
        S.teleport(art, artP.x, artP.z, Math.atan2(dx, -dz) + 0.35);
        art.isDeployed = true; art.deployProgress = 1;
        const sol = B.solveAimingForTarget(art.x, art.y, art.z, hp.x, hp.z, T, art);
        S.aim(art, hp, sol ? sol.elevation : 30); if (sol && sol.charge) art.charge = sol.charge;
        await S.wait(1.2);
        const before = B.activeShells.slice();
        S.fire(art);
        await S.wait(0.05);
        const sh = newShell(art, before);
        await S.wait(0.2);
        const hc = { x: H.x, y: S.ground(H.x, H.z), z: H.z };
        if (sh) S.shot('shellside', { subject: art, shell: sh, dur: 30, side: 1, off: 130, hold: 7, fov: 44, pull: 230, pullUp: 75, pullT: 4.5, lookAt: hc, lookUp: 6 });
        S.log('scene', { n: 2, name: 'arty-house', ok: !!sh });
        await S.until(() => !sh || sh.exploded || !B.activeShells.includes(sh), 12);
        // nhà gần chỗ nổ nhất sập hẳn (một phát pháo lớn), máy lùi ra nhìn vào nó
        const L = (S.cam.shot && S.cam.shot.last) || (sh ? { x: sh.x, z: sh.z } : hc);
        const hit = (BS.items || []).filter(b => !b.collapsed).sort((p, q) => Math.hypot(p.x - L.x, p.z - L.z) - Math.hypot(q.x - L.x, q.z - L.z))[0];
        if (hit && Math.hypot(hit.x - L.x, hit.z - L.z) < 120) {
          try { BS.collapse(hit, g.effectsManager && g.effectsManager.fx); } catch (e) { console.error(e); }
          if (S.cam.shot && S.cam.shot.type === 'shellside') S.cam.shot.lookAt = { x: hit.x, y: S.ground(hit.x, hit.z), z: hit.z };
        }
        S.log('hit1', { d: hit ? Math.round(Math.hypot(hit.x - L.x, hit.z - L.z)) : -1, down: !!(hit && hit.collapsed) });
        await S.wait(7.2);
        S.freeze(art, false);
      }
    }

    // ---- 3. giao tranh nhìn từ trên cao, chếch một bên
    const M = S.findOpen(460); M.y = S.ground(M.x, M.z);
    const ox = Math.cos(LIT), oz = Math.sin(LIT), px = -oz, pz = ox;   // o: về phía máy (thuận nắng); p: trục hai tuyến
    const kinds = ['ALL_ROUNDER', 'GATLING', 'SCOUT'];
    const blues = S.units('BLUE').filter(u => kinds.includes(u.tankType)).slice(0, 7);
    const reds = S.units('RED').filter(u => kinds.includes(u.tankType)).slice(0, 7);
    {
      const line = (list, side, hpK) => list.forEach((u, i) => {
        S.freeze(u, true);
        const along = (i - (list.length - 1) / 2) * 75 + (S.rnd() - 0.5) * 16, dist = 170 + (i % 2) * 36;
        S.teleport(u, M.x + px * side * dist + ox * along, M.z + pz * side * dist + oz * along, Math.atan2(-px * side, pz * side));
        u.hp = u.maxHp * hpK;
      });
      // không xe nào bị hạ ở cảnh này: không có cột khói xe cháy che mất giao tranh
      line(blues, -1, 6); line(reds, 1, 6);
      noSmoke();
      await S.wait(0.4);
      // trên cao ~150, lùi về phía nắng và lệch sang phía tuyến Xanh: nhìn chéo xuống cả hai tuyến
      const cam = { x: M.x + ox * 270 - px * 120, z: M.z + oz * 270 - pz * 120 }; cam.y = top(cam.x, cam.z) + 115;
      S.shot('fixed', { pos: cam, look: { x: M.x + px * 30, y: M.y, z: M.z + pz * 30 }, dur: 30, fov: 46, drift: { x: px * 6, y: -1.5, z: pz * 6 } });
      S.log('scene', { n: 3, name: 'clash-high' });
      await S.wait(0.6);
      S.glide(blues, px, pz, 9, 8.5); S.glide(reds, -px, -pz, 7, 8.5);
      const t0 = now();
      while (now() - t0 < 8.5) {
        const bl = alive(blues), rl = alive(reds);
        if (!bl.length || !rl.length) break;
        if (S.rnd() < 0.55) shoot(pick(bl), pick(rl)); else shoot(pick(rl), pick(bl));
        noSmoke();
        await S.wait(0.2 + S.rnd() * 0.18);
      }
      await S.wait(0.8);
    }

    // ---- 4. qua vai xe tăng Xanh, máy giữ nguyên
    {
      const a = alive(blues).find(u => u.tankType === 'ALL_ROUNDER') || take('BLUE', ['ALL_ROUNDER']);
      const b = alive(reds).find(u => u.tankType === 'ALL_ROUNDER') || alive(reds)[0] || take('RED', ['ALL_ROUNDER', 'GATLING']);
      if (a && b) {
        const c = S.findOpen(320);
        S.duel(a, b, c, 220, 0.08, true);
        S.freeze(a, true); S.freeze(b, true); a.hp = a.maxHp; b.hp = b.maxHp * 0.08; noSmoke();
        S.shot('shoulder', { subject: a, target: b, dur: 30, shellP: 0, side: 1, keepTg: true });
        S.log('scene', { n: 4, name: 'duel' });
        for (let k = 0; k < 4 && !b.isDead; k++) { await S.wait(1.3); shoot(a, b); await S.wait(2.4); }
        S.log('duelEnd', { dead: !!b.isDead });
        await S.wait(1.5);
        S.freeze(a, false); S.freeze(b, false);
      }
    }

    // ---- 5. bắn hạ nhìn ngang sườn
    {
      const a = alive(blues).find(u => u.tankType === 'ALL_ROUNDER' || u.tankType === 'GATLING') || alive(blues)[0];
      const b = alive(reds).find(u => u.tankType === 'ALL_ROUNDER') || alive(reds)[0];
      if (a && b) {
        const c = S.findOpen(300), ax = Math.cos(LIT + Math.PI / 2), az = Math.sin(LIT + Math.PI / 2);
        S.freeze(a, true); S.freeze(b, true);
        S.teleport(a, c.x - ax * 85, c.z - az * 85, Math.atan2(ax, -az));
        S.teleport(b, c.x + ax * 85, c.z + az * 85, Math.atan2(ax, -az) + Math.PI * 0.6);
        a.hp = a.maxHp; b.hp = b.maxHp * 0.22; noSmoke();
        await S.wait(0.3);
        const cp = { x: c.x + Math.cos(LIT) * 175, z: c.z + Math.sin(LIT) * 175 }; cp.y = top(cp.x, cp.z) + 22;
        S.shot('fixed', { pos: cp, look: { x: c.x + ax * 20, y: S.ground(c.x, c.z) + 6, z: c.z + az * 20 }, dur: 30, fov: 40 });
        S.log('scene', { n: 5, name: 'kill-side' });
        for (let k = 0; k < 4 && !b.isDead; k++) { await S.wait(1.1); shoot(a, b); await S.wait(1.4); }
        S.log('killSideEnd', { dead: !!b.isDead });
        await S.wait(3);
        S.freeze(a, false); S.freeze(b, false);
      }
    }

    // ---- 6. chiếm cứ điểm nhìn từ trên cao
    const SS = T.strongholdSet, K = SS && SS.items && SS.items[0];
    if (K) {
      const HB = 96, sg = (K.fx * Math.cos(LIT) + K.fz * Math.sin(LIT)) >= 0 ? 1 : -1;
      const W = (f, r) => ({ x: K.x + K.fx * f * sg + K.rx * r, z: K.z + K.fz * f * sg + K.rz * r });
      const G = K.G || S.ground(K.x, K.z);
      const team = alive(blues).slice(0, 3);
      while (team.length < 3) { const u = take('BLUE', ['ALL_ROUNDER', 'GATLING', 'SCOUT']); if (!u) break; team.push(u); }
      const head = Math.atan2(-K.fx * sg, K.fz * sg);
      team.forEach((u, i) => { S.freeze(u, true); u.hp = u.maxHp; const p = W(HB + [460, 445, 470][i], (i - 1) * 42); S.teleport(u, p.x, p.z, head); S.aim(u, { x: K.x, y: G + 6, z: K.z }, 1); });
      K.capture = 0; K.owner = null;
      // xe Đỏ nấp trong hầm làm cứ điểm 'tranh chấp' -> dời đi xa
      for (const u of S.units('RED')) if (Math.hypot(u.x - K.x, u.z - K.z) < 450) S.teleport(u, u.x + K.rx * 1400, u.z + K.rz * 1400);
      noSmoke();
      await S.wait(0.4);
      // máy cao trên đầu, chếch về phía nắng + phía đầu hầm xe tiến vào: thấy nóc hầm, cờ và dốc ra vào cùng khung
      const cc = W(HB + 40, 0), cam = W(HB + 300, 210); cam.y = G + 240;
      S.shot('fixed', { pos: cam, look: { x: cc.x, y: G + 5, z: cc.z }, dur: 40, fov: 46, drift: { x: 0, y: -4, z: 0 } });
      S.log('scene', { n: 6, name: 'capture' });
      const sh = S.units('BLUE', 'ARTILLERY')[0] || team[0];
      // pháo kích giã vào nóc hầm trong lúc đoàn xe tiến lên
      let shelling = true;
      (async () => {
        let i = 0;
        while (shelling && i < 22) {
          const p = W((S.rnd() - 0.5) * 2 * (HB - 15), (S.rnd() - 0.5) * 150);
          S.shellAt(sh, p.x, G + 38, p.z, i % 3 === 2 ? 'CLUSTER' : 'HE', LIT + Math.PI + (S.rnd() - 0.5), 0.85);
          i++;
          await S.wait(0.32 + S.rnd() * 0.22);
        }
      })();
      await S.wait(2.2);
      // xe tiến vào dốc hầm (vùng chiếm cờ kéo dài tới f = HB + 74) rồi dừng
      await S.glide(team, -K.fx * sg, -K.fz * sg, 50, 8);
      shelling = false;
      S.log('inZone', { cap: K.capture });
      // tiến độ chiếm kéo đều lên 100 -> cờ Xanh kéo lên đỉnh cột
      const t1 = now();
      while (now() - t1 < 7) { K.capture = Math.min(100, Math.max(K.capture, 40) + 2.2); await S.wait(0.1); }
      S.log('captured', { owner: K.owner, cap: K.capture });
      team.forEach(u => S.freeze(u, false));
    }
    S.log('done', {});
  } catch (e) { console.error('[N1]', e); S.log('error', { m: String(e && e.message) }); }
})();
