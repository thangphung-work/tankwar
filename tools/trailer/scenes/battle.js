/**
 * GIAO TRANH (record.js --map RIVER_LAKE --seed 15 --q "kami=1&lens=1" --script tools/trailer/scenes/battle.js)
 *  1. Hai hàng xe tăng đấu pháo (3 vs 3, máu thấp): mỗi xe ngắm một xe địch, khai hỏa liên tục -> trúng, cháy, nổ kho đạn.
 *     Máy: ngang chiến tuyến tele thấp; qua vai bám theo đạn; sát đất cạnh xe bị bắn
 *  2. UAV cảm tử phóng khỏi ống, lao cắm đầu vào cụm xe đứng yên (máy bám UAV tới lúc nổ)
 *  3. Phòng không: UAV lao vào cụm có 2 xe 6 nòng -> xe 6 nòng ngóc nòng bắn chặn (máy thấp sau xe 6 nòng nhìn lên)
 *  4. Ù TAI: máy sát đất cạnh xe bị bắn — xe nổ sát ống kính: tiếng bị bóp nghẹt, quay chậm, rồi ập trở lại
 *  5. Máy trượt chậm dọc hàng xác xe cháy phừng phừng dưới mưa
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const pick = (team, types, used) => { for (const t of types) { const u = S.units(team, t).find(x => !used.has(x)); if (u) { used.add(u); return u; } } return null; };

  let lastLines = null;
  // máy trượt chậm dọc một hàng xe (xác xe cháy)
  async function wreckPass(n) {
    const L = lastLines; if (!L) return;
    const side = L.B.filter(u => u.isDead).length >= L.A.filter(u => u.isDead).length ? 1 : -1;
    const mx = L.c.x + L.dx * side * L.D / 2, mz = L.c.z + L.dz * side * L.D / 2;
    const pos = { x: mx - L.dx * side * 95 - L.px * 160, z: mz - L.dz * side * 95 - L.pz * 160 };
    pos.y = S.ground(pos.x, pos.z) + 7;
    S.shot('fixed', { pos, look: { x: mx - L.px * 40, y: S.ground(mx, mz) + 8, z: mz - L.pz * 40 }, dur: 8, fov: 38, noDrone: true, drift: { x: L.px * 38, y: 0.4, z: L.pz * 38 } });
    S.log('scene', { n, name: 'wreck-row' });
    await S.wait(7);
  }
  async function battle(n, camKind) {
    const used = new Set();
    const A = [0, 1, 2].map(() => pick('BLUE', ['ALL_ROUNDER', 'GATLING'], used)).filter(Boolean);
    const B = [0, 1, 2].map(() => pick('RED', ['ALL_ROUNDER', 'GATLING', 'SCOUT'], used)).filter(Boolean);
    if (!A.length || !B.length) { S.log('skip', { n }); return; }
    const c = S.findOpen(320), ang = S.rnd() * Math.PI * 2, dx = Math.sin(ang), dz = -Math.cos(ang), px = -dz, pz = dx;
    const D = 300;
    A.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x - dx * D / 2 + px * (i - 1) * 70, c.z - dz * D / 2 + pz * (i - 1) * 70, Math.atan2(dx, -dz)); u.hp = u.maxHp * 0.3; });
    B.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + dx * D / 2 + px * (i - 1) * 70, c.z + dz * D / 2 + pz * (i - 1) * 70, Math.atan2(-dx, dz)); u.hp = u.maxHp * 0.3; });
    await S.wait(0.3);
    if (camKind === 'line') {
      // ngang chiến tuyến, tele, thấp: hai hàng xe đối mặt, đạn bay ngang khung
      const pos = { x: c.x + px * 330, z: c.z + pz * 330 };
      pos.y = S.ground(pos.x, pos.z) + 9;
      S.shot('fixed', { pos, look: { x: c.x, y: S.ground(c.x, c.z) + 10, z: c.z }, dur: 30, fov: 34, noDrone: true, drift: { x: dx * 6, y: 0, z: dz * 6 } });
    } else if (camKind === 'shoulder') S.shot('shoulder', { subject: A[1] || A[0], target: B[1] || B[0], dur: 30, shellP: 1, noDrone: true });
    else S.shot('low', { subject: B[1] || B[0], dur: 30, shellP: 0, noDrone: true });
    S.log('scene', { n, name: 'battle-' + camKind });
    lastLines = { A, B, c, dx, dz, px, pz, D };
    let shocked = false;
    const victim = B[1] || B[0];
    const t0 = performance.now() / 1000;
    let k = 0;
    while (performance.now() / 1000 - t0 < 13) {
      const shooters = [...A, ...B].filter(u => !u.isDead && u.tankType !== 'GATLING' && u.tankType !== 'SCOUT');
      if (!shooters.length) break;
      const u = shooters[k++ % shooters.length];
      const foes = (A.includes(u) ? B : A).filter(v => !v.isDead);
      if (!foes.length) break;
      const v = foes[Math.floor(S.rnd() * foes.length)];
      const d = Math.hypot(v.x - u.x, v.z - u.z);
      S.aim(u, { x: v.x, y: v.y + 9, z: v.z }, Math.atan2(v.y + 9 - (u.y + 14), d) * 180 / Math.PI + 0.15);
      await S.wait(0.5);
      S.fire(u);
      await S.wait(0.35 + S.rnd() * 0.4);
      // xe bị bắn nổ sát máy (cảnh sát đất): ù tai
      if (camKind === 'low' && !shocked && victim.isDead) { shocked = true; S.shock(2.4); }
      if (A.every(x => x.isDead) || B.every(x => x.isDead)) break;
    }
    // xe 6 nòng / trinh sát trong hàng: thả AI cho chúng tự xả đạn
    await S.wait(3);
    [...A, ...B].forEach(u => S.freeze(u, false));
    S.log('sceneEnd', { n });
    await S.wait(2);
  }

  async function kami(n, withAA) {
    const used = new Set();
    const L = S.units(null, 'ARTILLERY').find(u => u.uavKind === 'kami' && (u.kamikazeCount || 0) > 0);
    if (!L || !g.otherDrone) { S.log('skip', { n, why: 'no kami' }); return; }
    const foe = L.team === 'BLUE' ? 'RED' : 'BLUE';
    const c = S.findOpen(260);
    const tgts = [pick(foe, ['ALL_ROUNDER'], used), pick(foe, ['ALL_ROUNDER', 'SCOUT'], used)].filter(Boolean);
    const aa = withAA ? [pick(foe, ['GATLING'], used), pick(foe, ['GATLING'], used)].filter(Boolean) : [];
    S.freeze(L, true); S.teleport(L, c.x - 520, c.z, Math.PI / 2);
    tgts.forEach((u, i) => { S.freeze(u, true); S.teleport(u, c.x + 40, c.z + (i - 0.5) * 60, -Math.PI / 2); u.hp = u.maxHp * 0.4; });
    aa.forEach((u, i) => S.teleport(u, c.x - 40, c.z + (i - 0.5) * 120, -Math.PI / 2));   // xe 6 nòng chặn đường bay, AI tự bắn
    const R = g.otherDrone(L);
    if (R.bot) { R.bot.wait = 0.3; }
    S.shot('orbit', { subject: L, dur: 20, shellP: 0, noDrone: true });
    S.log('scene', { n, name: withAA ? 'kami-aa' : 'kami-hit' });
    await S.until(() => R.state === 'launching' || R.state === 'flying', 10);
    if (R.bot && tgts[0]) R.bot.tgt = tgts[0];
    if (withAA && aa[0]) {
      // máy thấp sau xe 6 nòng nhìn lên hướng UAV lao tới; nửa sau chuyển máy bám UAV
      S.shot('fixed', { pos: { x: aa[0].x + 45, y: S.ground(aa[0].x + 45, aa[0].z) + 6, z: aa[0].z + 25 }, look: { x: c.x - 300, y: S.ground(c.x, c.z) + 150, z: c.z }, lookAt: null, dur: 30, fov: 46, noDrone: true });
      await S.until(() => R.state !== 'launching' && R.state !== 'flying', 14);
    } else {
      S.shot('drone', { rec: R, subject: L, dur: 40, noDrone: true });
      await S.until(() => R.state !== 'launching' && R.state !== 'flying', 20);
    }
    S.log('kamiEnd', { n, state: R.state });
    await S.wait(3.5);
    [L, ...tgts].forEach(u => S.freeze(u, false));
  }

  try {
    await S.wait(0.5);
    await battle(1, 'line');
    await wreckPass(11);
    await battle(2, 'shoulder');
    await battle(3, 'low');
    await wreckPass(31);
    await kami(4, false);
    await kami(5, true);
    S.log('done', {});
  } catch (e) { console.error('[EPIC B]', e); S.log('error', { m: String(e && e.message) }); }
})();
