/**
 * CĂN CỨ HẠT NHÂN — QUAY BÙ 2 (record.js --map RIVER_LAKE --seed 17 --q "ptype=ALL_ROUNDER&calm=1&gfx=high" --script .../nuke4.js)
 * Bãi trống ngay trước căn cứ, căn cứ làm phông nền (không đặt xe lên bệ phóng: dưới nắp hầm trượt là khối đặc).
 *  1. Kính ngắm xe tăng: một phát hạ xe Đỏ cự ly ~120 m       2. Đối đầu Xanh – Đỏ chĩa nòng vào nhau (máy thấp ngang + qua vai)
 */
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, P = g.player;
  const used = new Set();
  const take = (team, types) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };
  const top = (x, z) => Math.max(S.obstacleTop(x, z), S.ground(x, z));
  const flat = (p, r) => { const g0 = S.ground(p.x, p.z); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(S.ground(x, z) - g0) > 4 || S.obstacleTop(x, z) > S.ground(x, z) + 0.5) return false; } return true; };
  try {
    await S.wait(0.4);
    const it = T.landmarkSet && T.landmarkSet.items && T.landmarkSet.items[0];
    if (!it) { S.log('skip', { why: 'no base' }); return; }
    const gy = it.G || S.ground(it.x, it.z), R = it.reach || 500;
    const sun = (T.map && T.map.sun) || { azimuth: 0 }, sunA = Math.PI / 2 - (sun.azimuth || 0), A0 = sunA + Math.PI * 0.62;
    // bãi đối đầu: ngoài rào căn cứ phía máy (nắng xiên), bằng phẳng
    let M = null, aM = A0;
    for (let k = 0; k < 14 && !M; k++) {
      const a = A0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.2;
      for (const d of [R + 120, R + 200, R + 300]) { const p = { x: it.x + Math.cos(a) * d, z: it.z + Math.sin(a) * d }; if (flat(p, 90)) { M = p; aM = a; break; } }
    }
    M = M || { x: it.x + Math.cos(A0) * (R + 200), z: it.z + Math.sin(A0) * (R + 200) };
    M.y = S.ground(M.x, M.z);
    const ox = Math.cos(aM), oz = Math.sin(aM), px = -oz, pz = ox;   // o: từ căn cứ ra ngoài; p: trục đối đầu
    S.log('arena', { d: Math.round(Math.hypot(M.x - it.x, M.z - it.z)), a: +aM.toFixed(2) });

    // 1. kính ngắm
    const tgt = take('RED', ['ALL_ROUNDER', 'GATLING']);
    if (tgt && P.tankType === 'ALL_ROUNDER') {
      S.freeze(tgt, true);
      S.teleport(tgt, M.x + px * 60, M.z + pz * 60, Math.atan2(ox, -oz));
      S.drive(true);
      S.teleport(P, M.x - px * 60 + ox * 20, M.z - pz * 60 + oz * 20, Math.atan2(tgt.x - (M.x - px * 60), -(tgt.z - (M.z - pz * 60))));
      tgt.hp = 1;
      await S.wait(0.6);
      S.pov(true); g.setSightMode(true); g.setLockedTarget(tgt);
      S.log('scene', { n: 1, name: 'gunsight' });
      await S.wait(1.6);
      P.reloadTimer = 0; g.triggerPlayerFire();
      await S.until(() => tgt.isDead, 3);
      if (!tgt.isDead) { P.reloadTimer = 0; g.triggerPlayerFire(); await S.until(() => tgt.isDead, 3); }
      S.log('gunKill', { dead: !!tgt.isDead });
      await S.wait(3.0);
      g.setSightMode(false); S.pov(false); S.drive(false);
      S.teleport(tgt, M.x + ox * 900, M.z + oz * 900);   // dọn xác khỏi bãi
    }

    // 2. đối đầu
    const b1 = take('BLUE', ['ALL_ROUNDER']), r1 = take('RED', ['ALL_ROUNDER', 'GATLING']);
    if (b1 && r1) {
      S.freeze(b1, true); S.freeze(r1, true);
      S.teleport(b1, M.x - px * 42, M.z - pz * 42, Math.atan2(px, -pz));
      S.teleport(r1, M.x + px * 42, M.z + pz * 42, Math.atan2(-px, pz));
      b1.hp = b1.maxHp; r1.hp = r1.maxHp;
      await S.wait(0.3);
      S.aim(b1, { x: r1.x, y: r1.y + 5, z: r1.z }, 0.5); S.aim(r1, { x: b1.x, y: b1.y + 5, z: b1.z }, 0.5);
      await S.wait(0.6);
      // máy thấp ngang, căn cứ phía sau hai xe
      let pc = null;
      for (const d of [75, 95, 120]) for (const h of [5, 7, 9]) {
        if (pc) break;
        const p = { x: M.x + ox * d, z: M.z + oz * d }; p.y = top(p.x, p.z) + h;
        if (S.clear(p, { x: b1.x, y: b1.y + 5, z: b1.z }) && S.clear(p, { x: r1.x, y: r1.y + 5, z: r1.z })) pc = p;
      }
      pc = pc || { x: M.x + ox * 95, z: M.z + oz * 95, y: top(M.x + ox * 95, M.z + oz * 95) + 8 };
      S.shot('fixed', { pos: pc, look: { x: M.x - ox * 40, y: M.y + 7, z: M.z - oz * 40 }, dur: 30, fov: 38, drift: { x: -ox * 3, y: 0, z: -oz * 3 } });
      S.log('scene', { n: 2, name: 'standoff-wide' });
      await S.wait(5);
      // qua vai xe Xanh nhìn sang xe Đỏ
      const ps = { x: b1.x - px * 22 + ox * 9, z: b1.z - pz * 22 + oz * 9 }; ps.y = top(ps.x, ps.z) + 8;
      S.shot('fixed', { pos: ps, look: { x: r1.x, y: r1.y + 6, z: r1.z }, dur: 30, fov: 30, drift: { x: px * 2, y: 0, z: pz * 2 } });
      S.log('scene', { n: 3, name: 'standoff-shoulder' });
      await S.wait(4);
      // ngược lại: qua vai xe Đỏ
      const pr = { x: r1.x + px * 22 - ox * 9, z: r1.z + pz * 22 - oz * 9 }; pr.y = top(pr.x, pr.z) + 8;
      S.shot('fixed', { pos: pr, look: { x: b1.x, y: b1.y + 6, z: b1.z }, dur: 30, fov: 30, drift: { x: -px * 2, y: 0, z: -pz * 2 } });
      S.log('scene', { n: 4, name: 'standoff-reverse' });
      await S.wait(4);
    }
    S.log('done', {});
  } catch (e) { console.error('[NUKE4]', e); S.log('error', { m: String(e && e.message) }); }
})();
