/**
 * NHÀ MÁY ĐIỆN NHIỆT HẠCH (bản đồ thành phố) nhìn vào MẶT TRƯỚC nhà lò Tokamak, tháp giải nhiệt, ống khói triti
 * (record.js --map URBAN --seed 6 --q "ptype=ALL_ROUNDER&calm=1&gfx=high" --script .../pp.js)
 * Cổng nhà máy ở +f, nhà tua-bin / biến đổi điện (f 22..128) che lò khi nhìn từ cổng; nhà lò ở f -240..-28.
 * 3 góc flycam trôi chậm phía TRƯỚC nhà lò (qua khe giữa nhà tua-bin và nhà biến đổi điện), mặt này được nắng chiếu.
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  try {
    await S.wait(0.4);
    const items = (T.landmarkSet && T.landmarkSet.items) || [];
    const it = items.find(i => /power/i.test(i.kind)) || items[0];
    if (!it) { S.log('skip', { why: 'no landmark' }); return; }
    const L = it.L, G = it.G || S.ground(it.x, it.z);
    const W = (f, r) => ({ x: L.x + L.fx * f - L.fz * r, z: L.z + L.fz * f + L.fx * r });
    const sun = (T.map && T.map.sun) || { azimuth: 0 };
    S.log('plant', { kind: it.kind, fx: +L.fx.toFixed(2), fz: +L.fz.toFixed(2), sunAz: sun.azimuth });
    // mặt TRƯỚC nhà lò (f = -28: biển TOKAMAK / REACTOR, cửa thiết bị) — phía sau toàn tường kín trong bóng râm
    const core = W(-40, -20);
    const look = { x: core.x, y: G + 80, z: core.z };
    for (const [n, f, r, h, dr] of [[1, 650, 0, 260, 12], [2, 520, -280, 220, 14], [3, 460, 140, 300, -14]]) {
      const p = W(f, r); p.y = top(p.x, p.z) + h;
      const d = W(f, r + dr); const dx = d.x - p.x, dz = d.z - p.z;   // trôi ngang chậm (đv / s)
      S.shot('fixed', { pos: p, look, dur: 30, fov: 34, drift: { x: dx, y: -2, z: dz } });
      S.log('scene', { n, name: 'plant-back-' + n });
      await S.wait(5);
    }
    S.log('done', {});
  } catch (e) { console.error('[PP]', e); S.log('error', { m: String(e && e.message) }); }
})();
