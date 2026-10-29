// Tách lớp: A thường | B ẩn mặt đất | C cỏ: tắt gió + shock | D lá cỏ alphaToCoverage=false
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, gc = T.groundCover;
  const P = { x: 2612, z: 2390 }, a = 0.7;
  await S.wait(0.4);
  const cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  S.log('phase', { p: 'A', wind: Weather.WINDV.value.toArray(), gt: GroundShader.time && GroundShader.time.value, sc: gc.grass.scale.toArray(), pos: gc.grass.position.toArray(), gv: gc.group.visible, gpos: gc.group.position.toArray(), mv: gc.grass.visible, layers: gc.grass.layers.mask, ro: gc.grass.renderOrder, op: gc.grass.material.opacity, tr: gc.grass.material.transparent });
  await S.wait(1.0);
  T.terrainMesh.visible = false; S.log('phase', { p: 'B' });
  await S.wait(1.0);
  T.terrainMesh.visible = true; Weather.WINDV.value.set(0.8, 0.6, 1, 0); S.log('phase', { p: 'C', wind: Weather.WINDV.value.toArray() });
  await S.wait(1.0);
  gc.grass.material.alphaToCoverage = false; gc.grass.material.needsUpdate = true; S.log('phase', { p: 'D' });
  await S.wait(1.0);
  S.log('done', {});
})();
