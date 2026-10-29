// Dò cỏ 3D trong game lúc quay: ghi số khóm / thảm / tâm rải, so với góc máy tĩnh giống cảnh đoàn xe
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const P = { x: 2612, z: 2390 }, a = 0.7;
  await S.wait(0.4);
  const cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  S.log('scene', { name: 'diag' });
  const gc = T.groundCover;
  for (let i = 0; i < 6; i++) {
    await S.wait(0.5);
    const vf = g._viewFocus;
    const R = g.renderer, pr = R.properties.get(gc.grass.material), pc = R.properties.get(gc.carpet.material);
    S.log('gc', { aa: R.getContext().getContextAttributes().antialias, skipped: R.__asyncShaders && R.__asyncShaders.skipped(), progT: !!(pr && pr.currentProgram), progC: !!(pc && pc.currentProgram), pr: R.getPixelRatio(), vis: gc && gc.group.visible, nt: gc && gc.grass.count, nc: gc && gc.carpet.count, np: gc && gc.peb.count, pend: gc && gc.pending, lastC: gc && [gc.lastCx, gc.lastCz], carpetC: gc && gc.carpetC, vf, cam: [Math.round(g.camera.position.x), Math.round(g.camera.position.z)], gfxGrass: g.gfxGrass, tier: g.gfxTier, maxT: gc && gc.maxT, uC: gc && gc.uCarpet && gc.uCarpet.value });
  }
  S.log('done', {});
})();
