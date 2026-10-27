/**
 * ĐẤU TAY ĐÔI CÓ KỊCH BẢN (record.js --script tools/trailer/scenes/duels.js): cú hạ chắc chắn nằm trong khung hình.
 * Xe bị bắn đứng yên (tắt AI, không bắn trả, máu thấp), xe bắn ngắm thẳng vào thân xe kia và khai hỏa tới khi hạ được.
 * Đạo diễn tự bám theo viên đạn (shellP 1) -> quay chậm lúc trúng -> vòng quanh xác xe cháy.
 */
(async () => {
  const S = __TR.scene, g = window.game;
  const pickU = (team, types) => { for (const t of types) { const l = S.units(team, t); if (l.length) return l[Math.floor(S.rnd() * l.length)]; } return null; };

  async function duel(n, name, typesA, typesB, opt) {
    const a = pickU('BLUE', typesA), b = pickU('RED', typesB);
    if (!a || !b) { S.log('skip', { n }); return; }
    const c = S.findOpen(260);
    S.duel(a, b, c, opt.dist, opt.hp, opt.broadside !== false);
    S.freeze(b, true);
    if (opt.scripted) S.freeze(a, true);
    S.log('scene', { n, name });
    await S.wait(0.4);
    S.shot(opt.cam || 'shoulder', Object.assign({ subject: a, target: b, dur: 30, shellP: opt.shellP === undefined ? 1 : opt.shellP, side: S.rnd() < 0.5 ? 1 : -1, noDrone: true }, opt.extra || {}));
    const tgt = () => ({ x: b.x, y: b.y + 9, z: b.z });
    const t0 = performance.now() / 1000;
    while (!b.isDead && performance.now() / 1000 - t0 < (opt.max || 16)) {
      if (opt.scripted) {
        const d = Math.hypot(b.x - a.x, b.z - a.z), el = Math.atan2(tgt().y - (a.y + 14), d) * 180 / Math.PI + 0.15;
        S.aim(a, tgt(), el);
        await S.wait(1.4);
        if (!b.isDead) { S.log('fire', { n }); S.fire(a); }
        await S.wait(opt.gap || 2.6);
      } else await S.wait(0.2);
    }
    S.log('sceneEnd', { n, killed: b.isDead });
    await S.wait(6);   // cảnh xác xe
    S.freeze(a, false); S.freeze(b, false);
  }

  try {
    await S.wait(0.5);
    await duel(1, 'mbt-duel', ['ALL_ROUNDER'], ['ALL_ROUNDER'], { dist: 300, hp: 0.2, scripted: true });
    await duel(2, 'mbt-duel2', ['ALL_ROUNDER'], ['ARTILLERY', 'GATLING'], { dist: 260, hp: 0.25, scripted: true, cam: 'front', shellP: 0 });
    await duel(3, 'gatling', ['GATLING'], ['SCOUT', 'ALL_ROUNDER'], { dist: 200, hp: 0.35, cam: 'shoulder', shellP: 0, max: 14 });
    await duel(4, 'mbt-duel3', ['ALL_ROUNDER'], ['SCOUT', 'GATLING'], { dist: 340, hp: 0.2, scripted: true, cam: 'low', shellP: 1, extra: { side: 1 } });
    S.log('done', {});
  } catch (e) { console.error('[DUELS]', e); S.log('error', { m: String(e && e.message) }); }
})();
