(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, gc = T.groundCover;
  await S.wait(0.4);
  const P = { x: 2612, z: 2390 }, a = 0.7, cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  await S.wait(0.8);
  const A = gc.grass.instanceMatrix.array, n = gc.grass.count, cam = g.camera.position;
  let near = 0, nanc = 0, ys = [];
  for (let i = 0; i < n; i++) { const o = i * 16, x = A[o + 12], y = A[o + 13], z = A[o + 14]; if (!isFinite(x + y + z)) nanc++; const d = Math.hypot(x - cam.x, z - cam.z); if (d < 200) { near++; if (ys.length < 6) ys.push([Math.round(x), Math.round(y), Math.round(z), Math.round(S.ground(x, z)), +Math.hypot(A[o], A[o + 1], A[o + 2]).toFixed(2), +Math.hypot(A[o + 4], A[o + 5], A[o + 6]).toFixed(2)]); } }
  const ia = gc.grass.instanceMatrix;
  S.log('cpu', { n, near, nanc, ys, ur: ia.updateRange, ver: ia.version, usage: ia.usage, bufLen: A.length, cam: [Math.round(cam.x), Math.round(cam.y), Math.round(cam.z)] });
  // ép tải lại toàn bộ bộ đệm lên GPU rồi xem cỏ gần có hiện không
  T.terrainMesh.visible = false; gc.grass.material.color.set(0xff0000);
  await S.wait(0.5); S.log('ph', { p: 'before full upload' });
  ia.updateRange.offset = 0; ia.updateRange.count = -1; ia.needsUpdate = true; gc.grass.instanceColor.updateRange.count = -1; gc.grass.instanceColor.needsUpdate = true;
  await S.wait(0.6); S.log('ph', { p: 'after full upload' });
  S.log('done', {});
})();
