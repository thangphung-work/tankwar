(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, gc = T.groundCover;
  await S.wait(0.4);
  const P = { x: 2612, z: 2390 }, a = 0.7, cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  await S.wait(0.6);
  const root = (o) => { let n = 0; while (o.parent) { o = o.parent; n++; } return { root: o === g.scene ? 'game.scene' : (o.type + ':' + o.name), depth: n }; };
  const ims = []; g.scene.traverse(o => { if (o.isInstancedMesh && o.material && o.material.customProgramCacheKey) { const k = o.material.customProgramCacheKey(); if (/grass|carpet|tuft/i.test(k)) ims.push({ k, count: o.count, vis: o.visible, mine: o === gc.grass || o === gc.carpet, pv: o.parent && o.parent.visible }); } });
  const R = g.renderer, mpT = R.properties.get(gc.grass.material), mpC = R.properties.get(gc.carpet.material);
  const U = (mp, own) => mp && mp.uniforms ? { same: mp.uniforms.uFocus === own, val: mp.uniforms.uFocus && mp.uniforms.uFocus.value, rad: mp.uniforms.uCoverRadius && mp.uniforms.uCoverRadius.value, own: own.value } : 'none';
  S.log('unif', { tuft: U(mpT, gc.uFocus), carpet: U(mpC, gc.uFocus) });
  S.log('gc3', { inScene: root(gc.group), groupVis: gc.group.visible, ims, sceneKids: g.scene.children.length, terrainSame: g.terrain === T, mats: [gc.grass.material.uuid, gc.carpet.material.uuid] });
  // ẩn nền đất + đổi màu khóm cỏ sang đỏ để thấy chắc chắn đó là lớp nào
  T.terrainMesh.visible = false; gc.grass.material.color.set(0xff0000); gc.carpet.material.color && gc.carpet.material.color.set(0x0000ff);
  S.log('red', {});
  await S.wait(1);
  S.log('done', {});
})();
