/**
 * CÁN / ỦI Ô TÔ DÂN SỰ (record.js --map URBAN --q ptype=ALL_ROUNDER|GATLING --script tools/trailer/scenes/crush.js)
 * Đúng luật game (spg.js -> props vehicleContact): xe xích (tăng chủ lực) leo lên cán bẹp ô tô; xe 6 nòng lưỡi ủi đẩy ô tô
 * trượt xoay sang bên. Máy đặt thấp PHÍA TRƯỚC, lệch sang bên: xe lao về ống kính, ô tô nằm tiền cảnh; quay chậm lúc chạm.
 * Mỗi buổi quay 3 lần trên 3 ô tô khác nhau để chọn lần đẹp nhất.
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const T = g.terrain;
  const pools = [T.propSet && T.propSet.data && T.propSet.data.cars, T.map && T.map.props && T.map.props.cars, T.map && T.map.cars];
  const all = pools.find(p => p && p.length) || [];
  const used = new Set();
  const flat = (ax, az, bx, bz, h0) => {
    for (let t = 0; t <= 1; t += 0.04) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (S.obstacleTop(x, z) - S.ground(x, z) > 2 || Math.abs(S.ground(x, z) - h0) > 10) return false;
    }
    return true;
  };
  // ahead: máy đứng trước ô tô bao xa theo chiều xe lao tới; side: lệch ngang; h: cao; fov: tele (nhỏ) nén khoảng cách -> xe
  // lừng lững đè lên ô tô; góc rộng (lớn) sát mặt đường -> xe lướt sát ống kính
  const LENS = [{ ahead: 120, side: 36, h: 3.5, fov: 24 }, { ahead: 30, side: 27, h: 2.2, fov: 62 }, { ahead: 10, side: 48, h: 4, fov: 40, track: true }];
  let take = 0;
  function pickTake() {
    const cars = all.filter(o => !o.burnt && !(o.c > 0.3) && !used.has(o));
    for (let i = 0; i < 200; i++) {
      const o = cars[Math.floor(S.rnd() * cars.length)];
      if (!o) return null;
      const h0 = S.ground(o.x, o.z);
      // lao tới dọc chiều đường (ô tô đỗ theo hướng đường: o.angle) — thử 4 cách hiểu góc, giữ hướng nào thông
      const ang = o.angle || 0, dirs = [[Math.cos(ang), Math.sin(ang)], [-Math.cos(ang), -Math.sin(ang)], [Math.sin(ang), Math.cos(ang)], [-Math.sin(ang), -Math.cos(ang)]];
      for (const [dx, dz] of dirs) {
        const sx = o.x - dx * 170, sz = o.z - dz * 170;           // xe xuất phát
        if (!flat(sx, sz, o.x + dx * 70, o.z + dz * 70, h0)) continue;
        // ô tô khác chắn ngay trên đường lao (ngoài chiếc mục tiêu) thì bỏ
        // cả lộ trình (170 trước -> 70 sau ô tô): không vướng ô tô khác, cây / bụi
        let blocked = false;
        for (let t = -170; t <= 70 && !blocked; t += 10) {
          const x = o.x + dx * t, z = o.z + dz * t;
          if (Math.abs(t) > 14 && cars.some(c => c !== o && Math.hypot(c.x - x, c.z - z) < 22)) blocked = true;
          if (T.trees && T.trees.near && T.trees.near(x, z, 16).length) blocked = true;
        }
        if (blocked) continue;
        for (const side of [1, -1]) {
          const px = dz * side, pz = -dx * side;                    // vuông góc hướng chạy
          const L = LENS[take % LENS.length];
          const cam = { x: o.x + dx * L.ahead + px * L.side, z: o.z + dz * L.ahead + pz * L.side };
          if (S.obstacleTop(cam.x, cam.z) - S.ground(cam.x, cam.z) > 1 || Math.abs(S.ground(cam.x, cam.z) - h0) > 8) continue;
          cam.y = S.ground(cam.x, cam.z) + L.h;
          used.add(o);
          return { o, sx, sz, dx, dz, cam, L };
        }
      }
    }
    return null;
  }

  try {
    const P = S.drive(true);
    await S.wait(0.3);
    for (take = 0; take < 3; take++) {
      const tk = pickTake();
      if (!tk) { S.log('skip', { take }); break; }
      const { o } = tk;
      S.keys({ KeyW: false });
      S.teleport(P, tk.sx, tk.sz, Math.atan2(tk.dx, -tk.dz));
      P.azimuth = ((P.bodyAngle * 180 / Math.PI) % 360 + 360) % 360;
      if (tk.L.track) S.shot('low', { subject: P, dur: 30, shellP: 0, noDrone: true, side: 1 });
      else S.shot('fixed', { pos: tk.cam, look: { x: o.x, y: S.ground(o.x, o.z) + 6, z: o.z }, lookAt: P, dur: 30, fov: tk.L.fov, noDrone: true });
      S.log('scene', { n: take, name: 'crush-' + P.tankType, car: o.kind || '' });
      await S.wait(0.5);
      S.keys({ KeyW: true });
      // chỉnh hướng theo chiều xe thật sự chạy
      const p0 = { x: P.x, z: P.z };
      await S.wait(0.5);
      const mv = { x: P.x - p0.x, z: P.z - p0.z };
      if (Math.hypot(mv.x, mv.z) > 1) {
        const err = Math.atan2(o.x - p0.x, -(o.z - p0.z)) - Math.atan2(mv.x, -mv.z);
        const e = Math.atan2(Math.sin(err), Math.cos(err));
        if (Math.abs(e) > 0.08 && Math.abs(e) < 0.7 && Math.hypot(mv.x, mv.z) > 4) { S.keys({ KeyW: false }); S.teleport(P, p0.x, p0.z, P.bodyAngle + e); await S.wait(0.2); S.keys({ KeyW: true }); }
      }
      // tiến độ dọc lộ trình (lưỡi ủi đẩy ô tô trôi theo -> không dùng khoảng cách tới ô tô)
      const prog = () => (P.x - o.x) * tk.dx + (P.z - o.z) * tk.dz;
      await S.until(() => prog() > -24, 12);
      S.log('contact', { take });
      S.slow(0.35, 2.2);
      await S.until(() => prog() > 45, 7);
      S.keys({ KeyW: false });
      S.log('passed', { take });
      await S.wait(1.5);
    }
    S.drive(false);
    S.log('done', {});
  } catch (e) { console.error('[CRUSH]', e); S.log('error', { m: String(e && e.message) }); }
})();
