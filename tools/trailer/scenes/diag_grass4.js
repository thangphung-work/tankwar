(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, gc = T.groundCover;
  await S.wait(0.4);
  const P = { x: 2612, z: 2390 }, a = 0.7, cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  T.terrainMesh.visible = false; gc.grass.material.color.set(0xff0000);
  await S.wait(0.8); S.log('ph', { p: 'A' });
  gc.uCoverRadius.value = 99999; await S.wait(0.8); S.log('ph', { p: 'B radius' });
  gc.grass.material.alphaToCoverage = false; gc.grass.material.alphaTest = 0.05; gc.grass.material.needsUpdate = true; await S.wait(0.8); S.log('ph', { p: 'C a2c off' });
  gc.grass.material.map = null; gc.grass.material.needsUpdate = true; await S.wait(0.8); S.log('ph', { p: 'D no map' });
  S.log('done', {});
})();
