/**
 * CĂN CỨ HẠT NHÂN — ĐỐI ĐẦU (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high" --script .../nuke5.js)
 * Bãi trống phía nắng của căn cứ: máy quay lưng về mặt trời (xe được chiếu sáng), căn cứ làm phông nền.
 * nuke4 bị ngược sáng, hai nòng gần chạm nhau, máy qua vai lọt vào thân xe -> xe cách 160 m, máy lùi xa, cao hơn cỏ.
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const flat = (p, r) => { const g0 = S.ground(p.x, p.z); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(S.ground(x, z) - g0) > 4 || S.obstacleTop(x, z) > S.ground(x, z) + 0.5) return false; } return true; };
  try {
    await S.wait(0.4);
    const it = T.landmarkSet && T.landmarkSet.items && T.landmarkSet.items[0];
    if (!it) { S.log('skip', { why: 'no base' }); return; }
    const R = it.reach || 500;
    const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0);
    const A1 = sunA + Math.PI * 0.62 + Math.PI;   // phía đối diện bãi nuke4 (nuke4 ngược sáng)
    let M = null, aM = A1;
    for (let k = 0; k < 14 && !M; k++) {
      const a = A1 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.2;
      for (const d of [R + 140, R + 220, R + 320]) { const p = { x: it.x + Math.cos(a) * d, z: it.z + Math.sin(a) * d }; if (flat(p, 120)) { M = p; aM = a; break; } }
    }
    M = M || { x: it.x + Math.cos(A1) * (R + 220), z: it.z + Math.sin(A1) * (R + 220) };
    M.y = S.ground(M.x, M.z);
    const ox = Math.cos(aM), oz = Math.sin(aM), px = -oz, pz = ox;
    S.log('arena', { d: Math.round(Math.hypot(M.x - it.x, M.z - it.z)), a: +aM.toFixed(2) });

    const b1 = take('BLUE', ['ALL_ROUNDER']), r1 = take('RED', ['ALL_ROUNDER', 'GATLING']);
    if (b1 && r1) {
      S.freeze(b1, true); S.freeze(r1, true);
      S.teleport(b1, M.x - px * 80, M.z - pz * 80, Math.atan2(px, -pz));
      S.teleport(r1, M.x + px * 80, M.z + pz * 80, Math.atan2(-px, pz));
      b1.hp = b1.maxHp; r1.hp = r1.maxHp;
      await S.wait(0.3);
      S.aim(b1, { x: r1.x, y: r1.y + 5, z: r1.z }, 0.5); S.aim(r1, { x: b1.x, y: b1.y + 5, z: b1.z }, 0.5);
      await S.wait(0.6);
      // 1. máy ngang xa, căn cứ phía sau hai xe
      let pc = null;
      for (const d of [170, 200, 230]) for (const h of [7, 10]) {
        if (pc) break;
        const p = { x: M.x + ox * d, z: M.z + oz * d }; p.y = top(p.x, p.z) + h;
        if (S.clear(p, { x: b1.x, y: b1.y + 5, z: b1.z }) && S.clear(p, { x: r1.x, y: r1.y + 5, z: r1.z })) pc = p;
      }
      pc = pc || { x: M.x + ox * 180, z: M.z + oz * 180, y: top(M.x + ox * 180, M.z + oz * 180) + 10 };
      S.shot('fixed', { pos: pc, look: { x: M.x - ox * 60, y: M.y + 9, z: M.z - oz * 60 }, dur: 30, fov: 30 });
      S.log('scene', { n: 1, name: 'standoff-wide' });
      await S.wait(5);
      // 2. sau lưng xe Xanh, lệch ngang, nhìn qua nòng sang xe Đỏ
      const ps = { x: b1.x - px * 120 + ox * 40, z: b1.z - pz * 120 + oz * 40 }; ps.y = top(ps.x, ps.z) + 15;
      S.shot('fixed', { pos: ps, look: { x: r1.x, y: r1.y + 7, z: r1.z }, dur: 30, fov: 26 });
      S.log('scene', { n: 2, name: 'standoff-blue' });
      await S.wait(3.5);
      // 3. ngược lại: sau lưng xe Đỏ
      const pr = { x: r1.x + px * 120 + ox * 40, z: r1.z + pz * 120 + oz * 40 }; pr.y = top(pr.x, pr.z) + 15;
      S.shot('fixed', { pos: pr, look: { x: b1.x, y: b1.y + 7, z: b1.z }, dur: 30, fov: 26 });
      S.log('scene', { n: 3, name: 'standoff-red' });
      await S.wait(3.5);
    }
    S.log('done', {});
  } catch (e) { console.error('[NUKE5]', e); S.log('error', { m: String(e && e.message) }); }
})();
