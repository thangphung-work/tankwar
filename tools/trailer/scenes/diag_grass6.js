(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, gc = T.groundCover;
  await S.wait(0.4);
  const P = { x: 2612, z: 2390 }, a = 0.7, cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  T.terrainMesh.visible = false; gc.grass.material.color.set(0xff0000);
  const gl = g.renderer.getContext();
  await S.wait(0.6);
  const geo = gc.grass.geometry;
  S.log('geo', { attrs: Object.keys(geo.attributes).map(k => [k, geo.attributes[k].count, geo.attributes[k].itemSize]), idx: geo.index && geo.index.count, err: gl.getError(), carpetGeoSame: gc.carpet.geometry === geo });
  gc.grass.geometry = geo.clone(); S.log('ph', { p: 'clone' });
  await S.wait(0.6);
  S.log('geo2', { err: gl.getError() });
  S.log('done', {});
})();
