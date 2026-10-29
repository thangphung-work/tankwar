(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, gc = T.groundCover;
  await S.wait(0.4);
  const P = { x: 2612, z: 2390 }, a = 0.7, cp = { x: P.x + Math.cos(a) * 300, z: P.z + Math.sin(a) * 300 }; cp.y = S.ground(cp.x, cp.z) + 70;
  S.shot('fixed', { pos: cp, look: { x: P.x, y: S.ground(P.x, P.z) + 4, z: P.z }, dur: 40, fov: 36 });
  await S.wait(0.6);
  const mp = g.renderer.properties.get(gc.grass.material), U = mp.uniforms || {}, out = {};
  const ser = (v) => v == null ? v : (v.toArray ? v.toArray() : Array.isArray(v) ? v.map(ser) : (typeof v === 'object' ? (v.isTexture ? 'tex' : Object.keys(v).slice(0, 4)) : v));
  for (const k of ['gTime', 'uWindV', 'uShock', 'uShockH', 'uFocus', 'uCoverRadius', 'uFadeDist', 'diffuse', 'opacity', 'alphaTest']) out[k] = U[k] ? ser(U[k].value) : 'MISSING';
  out.extra = Object.keys(U).filter(k => !/^(diffuse|opacity|map|uvTransform|alphaTest|emissive|roughness|metalness|ambientLightColor|lightProbe|directionalLights|directionalLightShadows|directionalShadowMap|directionalShadowMatrix|spotLights|spotLightShadows|spotShadowMap|spotShadowMatrix|pointLights|pointLightShadows|pointShadowMap|pointShadowMatrix|hemisphereLights|rectAreaLights|ltc_1|ltc_2|fogDensity|fogNear|fogFar|fogColor|envMap|flipEnvMap|envMapIntensity|reflectivity|refractionRatio|maxMipLevel|uv2Transform|lightMap|lightMapIntensity|aoMap|aoMapIntensity|alphaMap|bumpMap|bumpScale|normalMap|normalScale|displacementMap|displacementScale|displacementBias|roughnessMap|metalnessMap|emissiveMap|specularMap|gTime|uWindV|uShock|uShockH|uFocus|uCoverRadius|uFadeDist)$/.test(k));
  out.prog = mp.program && mp.program.name; out.vsHasFocus = !!(mp.program && mp.program.cacheKey);
  S.log('unif', out);
  S.log('done', {});
})();
