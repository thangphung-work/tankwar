// CHẨN ĐOÁN: quỹ đạo đạn pháo tự hành (vị trí / vận tốc / trạng thái từng 0,2 s) — record.js --sec 10 --script .../diag_arty.js
(async () => {
  const S = __TR.scene, g = window.game, T = g.terrain, B = g.ballistics;
  try {
    await S.wait(0.4);
    const art = S.units('BLUE', 'ARTILLERY')[0];
    const c = S.findOpen(420), tg = { x: c.x + 330, z: c.z };
    S.freeze(art, true); S.teleport(art, c.x - 330, c.z, Math.PI / 2);
    art.isDeployed = true; art.deployProgress = 1;
    const sol = B.solveAimingForTarget(art.x, art.y, art.z, tg.x, tg.z, T, art);
    S.aim(art, tg, sol ? sol.elevation : 40);
    S.log('sol', { el: sol && sol.elevation, ammo: art.selectedAmmo, keys: sol ? Object.keys(sol).join(',') : '' });
    await S.wait(1.5);
    const before = B.activeShells.slice();
    S.fire(art);
    await S.wait(0.02);
    const mine = B.activeShells.filter(s => !before.includes(s));
    S.log('new', { n: mine.length, list: mine.map(s => [s.shooterId === art.id, s.ammoType, Math.round(s.vx), Math.round(s.vy), Math.round(s.vz)].join(':')).join(' | '), arrs: Object.keys(B).filter(k => Array.isArray(B[k])).join(',') });
    const sh = mine.find(s => s.shooterId === art.id);
    for (let i = 0; i < 40 && sh; i++) {
      S.log('tr', { i, x: Math.round(sh.x - art.x), y: Math.round(sh.y - art.y), z: Math.round(sh.z - art.z), vy: Math.round(sh.vy), v: Math.round(Math.hypot(sh.vx, sh.vy, sh.vz)), ex: !!sh.exploded, live: B.activeShells.includes(sh) });
      await S.wait(0.2);
    }
  } catch (e) { S.log('error', { m: String(e && e.message) }); }
})();
