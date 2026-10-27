/**
 * CĂN CỨ TÊN LỬA HẠT NHÂN (record.js --map RIVER_LAKE --seed 15 --q "ptype=ALL_ROUNDER&lens=1" --script .../base.js)
 *  1. Máy thấp ngoài vành căn cứ dưới mưa bão, nâng dần lộ giếng phóng (2 góc: nâng máy / tele đẩy chậm)
 *  2. Xe tăng (xe người chơi tự lái) lừ lừ tiến về căn cứ trong màn mưa — máy tele sát đất, xe lao tới ống kính
 *  3. Pháo kích dồn dập vào chính căn cứ tới khi nổ dây chuyền & sụp đổ, cháy đen (máy xa tele + máy drone)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  try {
    await S.wait(0.4);
    const LS = T.landmarkSet, it = LS && LS.items && LS.items[0];
    if (!it) { S.log('skip', { why: 'no landmark' }); return; }
    const gy = it.G || S.ground(it.x, it.z), R = Math.max(220, (it.reach || 400) - 30), top = it.top || gy + 120;
    const look = { x: it.x, y: gy + (top - gy) * 0.45, z: it.z };
    // ---------- 1. mở đầu: hai góc
    let a = S.rnd() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {   // góc có mặt đất trống phía trước máy (không vướng nhà / gò)
      const p = { x: it.x + Math.cos(a) * (R + 240), z: it.z + Math.sin(a) * (R + 240) };
      if (S.obstacleTop(p.x, p.z) - S.ground(p.x, p.z) < 2) break;
      a += 1.05;
    }
    const p0 = { x: it.x + Math.cos(a) * (R + 240), z: it.z + Math.sin(a) * (R + 240) };
    p0.y = S.ground(p0.x, p0.z) + 10;
    S.shot('fixed', { pos: p0, look, dur: 7, fov: 46, noDrone: true, drift: { x: -Math.cos(a) * 14, y: 26, z: -Math.sin(a) * 14 } });
    S.log('scene', { n: 1, name: 'base-crane' });
    await S.wait(7);
    const b = a + 2.1, p1 = { x: it.x + Math.cos(b) * (R + 700), z: it.z + Math.sin(b) * (R + 700) };
    p1.y = Math.max(S.ground(p1.x, p1.z), gy) + 45;
    S.shot('fixed', { pos: p1, look, dur: 6, fov: 20, noDrone: true, drift: { x: -Math.cos(b) * 28, y: -2, z: -Math.sin(b) * 28 } });
    S.log('scene', { n: 2, name: 'base-tele' });
    await S.wait(6);

    // ---------- 2. xe tăng tiến về căn cứ (máy tele sát đất phía trước, xe lao tới ống kính)
    {
      const P = S.drive(true);
      const c = a + 0.5, dx = -Math.cos(c), dz = -Math.sin(c);   // hướng vào căn cứ
      const start = { x: it.x - dx * (R + 650), z: it.z - dz * (R + 650) };
      S.teleport(P, start.x, start.z, Math.atan2(dx, -dz));
      P.azimuth = ((P.bodyAngle * 180 / Math.PI) % 360 + 360) % 360;
      const cam = { x: start.x + dx * 330 + dz * 30, z: start.z + dz * 330 - dx * 30 };
      cam.y = S.ground(cam.x, cam.z) + 5;
      S.shot('fixed', { pos: cam, look: { x: start.x, y: S.ground(start.x, start.z) + 14, z: start.z }, lookAt: P, dur: 30, fov: 24, noDrone: true });
      S.log('scene', { n: 3, name: 'advance' });
      await S.wait(0.4);
      S.keys({ KeyW: true });
      await S.wait(6.5);
      // máy sát đất bám hông
      S.shot('low', { subject: P, dur: 30, shellP: 0, noDrone: true, side: -1 });
      await S.wait(4);
      S.keys({ KeyW: false });
      await S.wait(0.5);
      S.drive(false);
    }

    // ---------- 3. pháo kích phá huỷ căn cứ
    const sh = S.units('BLUE', 'ARTILLERY')[0] || S.units('BLUE')[0];
    const d = a + 1.0, pw = { x: it.x + Math.cos(d) * (R + 900), z: it.z + Math.sin(d) * (R + 900) };
    pw.y = Math.max(S.ground(pw.x, pw.z), gy) + 30;
    S.shot('fixed', { pos: pw, look, dur: 40, fov: 30, noDrone: true, drift: { x: -Math.sin(d) * 10, y: 0.5, z: Math.cos(d) * 10 } });
    S.log('scene', { n: 4, name: 'base-strike' });
    await S.wait(0.8);
    let shots = 0, aerialDone = false;
    const t0 = performance.now() / 1000;
    while (!it.dead && shots < 110 && performance.now() / 1000 - t0 < 30) {
      const r = R * 0.7 * Math.sqrt(S.rnd()), q = S.rnd() * Math.PI * 2;
      S.shellAt(sh, it.x + Math.cos(q) * r, gy + 6, it.z + Math.sin(q) * r, shots % 4 === 3 ? 'CLUSTER' : 'HE', d + Math.PI + (S.rnd() - 0.5), 0.85);
      shots++;
      if (!aerialDone && it.hp < it.hp0 * 0.45) {
        // giữa chừng: chuyển sang máy drone trên cao cho lúc sụp
        aerialDone = true;
        const e = d + 1.4, pa = { x: it.x + Math.cos(e) * (R + 320), z: it.z + Math.sin(e) * (R + 320) };
        pa.y = gy + 330;
        S.shot('fixed', { pos: pa, look: { x: it.x, y: gy, z: it.z }, dur: 40, fov: 46, noDrone: true, drift: { x: Math.sin(e) * 16, y: -4, z: -Math.cos(e) * 16 } });
        S.log('stage', { what: 'aerial', hp: +(it.hp / it.hp0).toFixed(2) });
      }
      await S.wait(0.2 + S.rnd() * 0.18);
    }
    S.log('baseDead', { dead: !!it.dead, shots });
    await S.wait(7);
    S.log('done', {});
  } catch (e) { console.error('[BASE]', e); S.log('error', { m: String(e && e.message) }); }
})();
