/**
 * TRAILER V14 — BUỔI N2 (chỉ cảnh 1-2 của n1, quay lại) (record.js --map RIVER_LAKE --seed 17 --preroll 3 --sec 100
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
        const d = 60 + i * 95;
        S.teleport(u, c.x - mx * d, c.z - mz * d, Math.atan2(mx, -mz));
        if (u.tankType === 'ARTILLERY') { u.isDeployed = false; u.deployProgress = 0; }
        S.aim(u, { x: u.x + mx * 400, y: u.y + 6, z: u.z + mz * 400 }, 1);
      });
      await S.wait(0.4);
      // máy xa + chéo: lệch về phía trước đoàn (đoàn chạy chếch về phía ống kính rồi lướt qua), cao, tiêu cự dài nén đoàn xe
      const ca = LIT + 0.45, cp = { x: c.x + Math.cos(ca) * 150, z: c.z + Math.sin(ca) * 150 }; cp.y = top(cp.x, cp.z) + 15;   // góc thấp sát cỏ, chéo
      S.shot('fixed', { pos: cp, look: { x: c.x - mx * 90, y: S.ground(c.x, c.z) + 12, z: c.z - mz * 90 }, dur: 40, fov: 40 });
      S.log('scene', { n: 1, name: 'convoy' });
      await S.glide(conv, mx, mz, 36, 12);
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
        const sol = B.solveAimingForTarget(art.x, art.y, art.z, hp.x, hp.z, T, art, { preferLob: true });   // cầu vồng: đạn bay vòng cao, cắm dốc xuống
        S.aim(art, hp, sol ? sol.elevation : 30); if (sol && sol.charge) art.charge = sol.charge;
        // bộ giải nâng nòng cho đạn KHÔNG vướng nhà trước điểm đích -> đạn rơi ra sân cạnh nhà, lửa cháy trên đất trống mà
        // nhà ở xa lại sập. Dò thêm góc nòng quanh nghiệm để đường đạn dự kiến cắm thẳng vào nhà
        {
          const inHouse = (r) => r.hitType === 'BUILDING' || r.hitType === 'WALL' || Math.hypot(r.impactX - H.x, r.impactZ - H.z) < Math.min(H.halfW, H.halfD) * 0.8;
          // ưu tiên CẦU VỒNG: dò góc 55° -> 32° với từng liều phóng (1 đầy .. 10 nhỏ nhất), lấy tổ hợp đầu tiên cắm trúng nhà
          let lob = null;
          for (let ch = 1; ch <= 10; ch++) for (let el = 38; el <= 62; el += 0.1) {
            const r = B.predictTrajectoryImpact(art.x, art.y + 14, art.z, art.azimuth, el, ch, T, { tankType: 'ARTILLERY', selectedAmmo: art.selectedAmmo || 'NORMAL' });
            const d = inHouse(r) ? 0 : Math.hypot(r.impactX - H.x, r.impactZ - H.z);
            if (!lob || d < lob.d) lob = { el: +el.toFixed(2), ch, d: Math.round(d), ft: r.flightTime };
          }
          if (lob && lob.d < 30) { art.elevation = lob.el; art.charge = lob.ch; } else lob = Object.assign({ miss: true }, lob);
          S.log('lob', lob || {});
          const el0 = art.elevation;
          let fix = lob && !lob.miss ? lob.el : null;
          for (let k = 0; k <= 80 && fix === null; k++) for (const sg of k ? [-1, 1] : [1]) {
            const el = el0 + sg * k * 0.04, r = B.predictTrajectoryImpact(art.x, art.y, art.z, art.azimuth, el, art.charge, T, art);
            if (inHouse(r)) { fix = el; break; }
          }
          if (fix !== null) art.elevation = fix;
          S.log('aimfix', { el0: +el0.toFixed(2), el: fix === null ? null : +fix.toFixed(2) });
        }
        // NHỊP 1 — phát bắn: máy thấp sát bánh xe pháo, chếch trước nòng; quả cầu lửa, nòng giật, bụi bị thổi bung
        const fx = Math.sin(art.azimuth * Math.PI / 180), fz = -Math.cos(art.azimuth * Math.PI / 180);   // hướng nòng
        // máy thấp bên sườn, lùi về sau xe: thấy trọn nòng ngóc cao + đầu nòng (quả cầu lửa) trong khung
        const sd = (fz * Math.cos(LIT) - fx * Math.sin(LIT)) >= 0 ? 1 : -1;   // bên sườn cùng phía mặt trời (thuận sáng, không ngược nắng)
        const c1 = { x: art.x - fx * 18 + fz * 75 * sd, z: art.z - fz * 18 - fx * 75 * sd }; c1.y = S.ground(c1.x, c1.z) + 5;
        S.shot('fixed', { pos: c1, look: { x: art.x + fx * 22, y: art.y + 30, z: art.z + fz * 22 }, dur: 30, fov: 56 });
        S.log('scene', { n: 2, name: 'arty-house' });
        await S.wait(1.2);
        const before = B.activeShells.slice();
        // phát này không tản mát (đạn rơi đúng nhà như kịch bản)
        const DP = window.Dispersion, op = DP && DP.perturb;
        if (op) DP.perturb = function (sh, am, el, vx, vy, vz) { return sh === art ? { vx, vy, vz } : op.apply(this, arguments); };
        S.fire(art);
        if (op) DP.perturb = op;
        S.log('b1', {});
        await S.wait(0.05);
        const sh = newShell(art, before);
        const hc = { x: H.x, y: S.ground(H.x, H.z), z: H.z };
        // bám MỌI viên đạn của xe pháo này (đối tượng đạn có thể đổi giữa đường bay): nhớ vị trí cuối, biết lúc đạn hết bay
        const trk = { last: sh ? { x: sh.x, y: sh.y, z: sh.z, vx: sh.vx, vy: sh.vy, vz: sh.vz } : null, gone: 0, t0: performance.now() };
        const tid = setInterval(() => {
          const l = B.activeShells.filter(x => x.shooterId === art.id && !x.exploded);
          if (l.length) { const x = l[l.length - 1]; trk.last = { x: x.x, y: x.y, z: x.z, vx: x.vx, vy: x.vy, vz: x.vz }; trk.gone = 0; } else trk.gone++;
        }, 20);
        const flying = () => trk.gone < 3;
        // NHỊP 2 (đạn bay — game nén thời gian bay, đạn quá nhanh/nhỏ để bắt hình) -> cắt thẳng sang NHỊP 3: máy đứng yên nhìn
        // rộng ngôi nhà; quả đạn cắm dốc đúng mái nhà (đạn thả từ trên trời theo hướng xe pháo), CHÍNH ngôi nhà đó sập
        await S.wait(1.0);
        clearInterval(tid);
        // đạn thật của phát bắn (rơi chỗ khác) bỏ đi lặng lẽ sau cú cắt — không nổ lệch ngoài khung
        for (let i = B.activeShells.length - 1; i >= 0; i--) if (B.activeShells[i].shooterId === art.id) B.removeShellMesh(B.activeShells[i], i);
        const ax = H.x - art.x, az = H.z - art.z, al = Math.hypot(ax, az) || 1;
        const c3 = { x: H.x - ax / al * 120 + az / al * 230, z: H.z - az / al * 120 - ax / al * 230 }; c3.y = top(c3.x, c3.z) + 40;
        S.shot('fixed', { pos: c3, look: { x: H.x, y: S.ground(H.x, H.z) + 14, z: H.z }, dur: 30, fov: 44 });
        S.log('b3', {});
        await S.wait(0.7);
        const roof = S.obstacleTop(H.x, H.z);
        const pr = S.shellAt(art, H.x, roof, H.z, 'HE', Math.atan2(ax, az), 0.82);
        await S.until(() => !pr || pr.exploded || !B.activeShells.includes(pr), 6);
        trk.last = { x: H.x, y: roof, z: H.z };
        // nhà gần chỗ nổ nhất sập hẳn (một phát pháo lớn), máy lùi ra nhìn vào nó
        const L = trk.last ? { x: trk.last.x, z: trk.last.z } : hc;   // điểm nổ thật (vị trí cuối của viên đạn)
        const edge = (b) => Math.hypot(b.x - L.x, b.z - L.z) - Math.max(b.halfW, b.halfD);   // ~khoảng cách tới mép nhà
        const hit = H.collapsed ? null : H;   // đúng ngôi nhà trong khung
        if (hit && edge(hit) < 80) {
          try { BS.collapse(hit, g.effectsManager && g.effectsManager.fx); } catch (e) { console.error(e); }
        }
        S.log("hit1", { d: hit ? Math.round(Math.hypot(hit.x - L.x, hit.z - L.z)) : -1, e: hit ? Math.round(edge(hit)) : -1, down: !!(hit && hit.collapsed) });
        await S.wait(7.2);
        S.freeze(art, false);
      }
    }

    S.log('done', {});
  } catch (e) { console.error('[N2]', e); S.log('error', { m: String(e && e.message) }); }
})();
