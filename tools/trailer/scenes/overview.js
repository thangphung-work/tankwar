/**
 * FLYCAM GIỚI THIỆU BẢN ĐỒ (record.js --script tools/trailer/scenes/overview.js), chạy đầu buổi quay trận bot:
 * 3 cảnh drone trượt chậm trên cao qua công trình đặc trưng của bản đồ và các cứ điểm, rồi trả máy cho đạo diễn tự động.
 */
(async () => {
  const S = __TR.scene, g = window.game;
  try {
    const T = g.terrain, pts = [];
    const lm = T.map && T.map.landmarks && T.map.landmarks[0];
    if (lm) pts.push({ x: lm.x, z: lm.z, r: 620, h: 300, name: 'landmark' });
    for (const cp of (g.capturePoints || []).slice(0, 3)) pts.push({ x: cp.x, z: cp.z, r: 380, h: 170, name: 'cp' });
    const list = pts.slice(0, 3);
    for (let i = 0; i < list.length; i++) {
      const p = list[i], a = S.rnd() * Math.PI * 2, gy = S.ground(p.x, p.z);
      const pos = { x: p.x + Math.sin(a) * p.r, z: p.z + Math.cos(a) * p.r };
      pos.y = Math.max(S.ground(pos.x, pos.z), gy) + p.h;
      // trượt ngang (vuông góc hướng nhìn) + hạ dần độ cao
      const side = (i % 2 ? 1 : -1) * 34;
      S.shot('fixed', { pos, look: { x: p.x, y: gy + 15, z: p.z }, dur: 5, fov: 52, noDrone: true, drift: { x: Math.cos(a) * side, y: -9, z: -Math.sin(a) * side } });
      S.log('overview', { i, name: p.name });
      await S.wait(5);
    }
    S.log('overviewDone', {});
  } catch (e) { console.error('[OVERVIEW]', e); }
})();
