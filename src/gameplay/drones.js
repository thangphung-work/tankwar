/**
 * DRONE TRINH SÁT (pháo tự hành) & PHÒNG KHÔNG (xe 6 nòng)
 * - Mọi drone đang bay trên chiến trường gom về một danh sách: drone của người chơi pháo tự hành (lái trong màn hình
 *   điều khiển hỏa lực, game.js), drone của bot pháo tự hành (tự bay ra trinh sát phía trước trận địa), drone của máy
 *   khác báo qua mạng. Mỗi drone: vị trí, vận tốc, máu.
 * - TRINH SÁT: drone đang bay soi được xe địch dưới vùng nhìn camera (SIGHT quanh hình chiếu drone) cho CẢ PHE
 *   (TeamIntel.knows) — trừ xe trinh sát núp bụi / xe trong rừng rậm ở xa (máy chủ server_auth.js tính y hệt).
 * - PHÒNG KHÔNG: chỉ đạn 30mm của xe 6 nòng bắn trúng được drone (ballistics.js gọi segmentHit); hết máu -> drone rơi,
 *   xe pháo chờ REBUILD giây mới có drone dự phòng. Xe 6 nòng người chơi: phím F khóa drone địch, tháp & nòng tự bám
 *   (đón đầu theo vận tốc drone), giữ Space để xả đạn. Bot 6 nòng tự ưu tiên bắn hạ drone địch trong tầm.
 * - Mạng: máy có quyền với xe pháo gửi vị trí drone (DRONE, ~8 lần/giây); máy bắn trúng drone của máy khác gửi DRONE_HIT,
 *   máy chủ quyền tự trừ máu rồi báo drone rơi cho mọi máy.
 */
const DroneOps = (() => {
  const SIGHT = 420;          // bán kính vùng nhìn của camera drone trên mặt đất (khớp server_auth.js DRONE_SIGHT)
  const HP = 1;
  const BULLET_DMG = { GATLING_BULLET: 0.2, INCENDIARY: 0.25 };   // 5 viên 30mm / 4 viên đạn cháy trúng là rơi
  const HIT_R = 9;            // bán kính va chạm: sải cánh quạt ~1.2 m + ngòi nổ cận đích của đạn 30mm
  const BODY_Y = 2.5;         // tâm thân drone so với gốc mô hình (đáy càng đáp)
  const REBUILD = 30;         // giây chờ drone dự phòng sau khi bị bắn hạ
  const AA_RANGE = 1000;      // tầm phòng không của xe 6 nòng (≈ tầm bay của đạn 30mm, đo theo đường thẳng 3D)
  const DETECT = 1100;        // tầm nhìn / nghe thấy drone địch trên trời (theo phương ngang)
  const NET_DT = 0.125;       // nhịp gửi vị trí drone qua mạng
  const NET_TTL = 1.5;        // drone từ máy khác quá lâu không có tin -> coi như đã đáp
  const AIRBORNE = { launching: 1, flying: 1, returning: 1 };
  // drone của bot: bay / sạc như drone người chơi (ArtilleryGame3D.DRONE), bay chậm hơn, độ cao trinh sát thấp hơn chút
  const BOT = { speed: 240, alt: 340, loiter: 140, minLaunch: 0.85, restation: 6 };

  let game = null;
  const recs = new Map();     // unit.id -> { unit, team, kind: 'player'|'bot'|'net', x, y, z, vx, vy, vz, local, hp, model? }
  const wrecks = [];          // drone đang rơi { m, x, y, z, vx, vy, vz, spin }
  let netAcc = 0;
  let aaHintAt = -99;

  const now = () => performance.now() / 1000;
  const C = () => (typeof ArtilleryGame3D !== 'undefined' && ArtilleryGame3D.DRONE) || { flight: 120, charge: 60, rthSpeed: 700, reserveS: 3 };

  function bind(g) { game = g; }
  function reset() {
    for (const r of recs.values()) dropModel(r);
    recs.clear();
    for (const w of wrecks) disposeModel(w.m);
    wrecks.length = 0;
    netAcc = 0;
    if (game && game.units) for (const u of game.units) u._bd = null;
  }

  function disposeModel(m) {
    if (!m) return;
    if (m.parent) m.parent.remove(m);
    m.traverse(o => { if (o.isMesh) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } });
  }
  function dropModel(r) { if (r && r.model) { disposeModel(r.model); r.model = null; } }
  function modelFor(r) {
    if (r.model || !game || !game.scene || typeof ReconDrone === 'undefined') return r.model;
    r.model = ReconDrone.build(r.team);
    game.scene.add(r.model);
    return r.model;
  }

  // Bãi đáp trên nóc cabin của một xe pháo (tọa độ thế giới)
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  function padOf(u) {
    const ch = u && u.chassisGroup;
    if (ch && _v && typeof ReconDrone !== 'undefined') {
      ch.updateWorldMatrix(true, false);
      _v.set(ReconDrone.PAD.x, ReconDrone.PAD.y, ReconDrone.PAD.z);
      ch.localToWorld(_v);
      return { x: _v.x, y: _v.y, z: _v.z };
    }
    return { x: u.x, y: (u.y || 0) + 24, z: u.z };
  }
  const ground = (x, z) => (game && game.terrain ? game.terrain.getElevationAt(x, z) : 0);
  const owns = (u) => !game || !game.netSync || (game.netSync.owns ? game.netSync.owns(u) : true);

  /** Các drone đang bay (mọi phe) */
  function airborne() {
    const out = [];
    for (const r of recs.values()) if (r.alive) out.push(r);
    return out;
  }

  // ---------------------------------------------------------------------------
  // TRINH SÁT: drone của phe `team` có soi thấy xe t không
  // ---------------------------------------------------------------------------
  function sees(team, t) {
    if (!t || t.isDead) return false;
    for (const r of recs.values()) {
      if (!r.alive || r.team !== team) continue;
      const d = Math.hypot(t.x - r.x, t.z - r.z);
      if (d > SIGHT) continue;
      // bụi che theo loại xe (xe trinh sát núp bụi: drone phải bay sát trên đầu mới thấy)
      const bc = typeof TeamIntel !== 'undefined' && TeamIntel.bushCover ? TeamIntel.bushCover(t) : null;
      if (bc && bc.spot && d > bc.spot) continue;
      // rừng rậm che từ trên xuống (tán cây), trừ khi xe vừa nổ súng
      const dense = typeof BattleTerrain3D !== 'undefined' ? BattleTerrain3D.FOREST_DENSE : 10;
      if ((t.forestDens || 0) >= dense && d > 170 && !((t.revealTimer || 0) > 0)) continue;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // PHÒNG KHÔNG
  // ---------------------------------------------------------------------------
  /** Drone địch gần nhất xe `u` thấy được (trên trời, trong DETECT) và nằm trong tầm `range` (3D) */
  function enemyDroneFor(u, range = AA_RANGE) {
    if (!u || u.isDead) return null;
    let best = null, bd = range;
    const my = (u.y || 0) + 18;
    for (const r of recs.values()) {
      if (!r.alive || r.team === u.team) continue;
      if (Math.hypot(r.x - u.x, r.z - u.z) > DETECT) continue;
      const d = Math.hypot(r.x - u.x, r.y - my, r.z - u.z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  /**
   * Nghiệm bắn phòng không của xe 6 nòng vào drone r: đón đầu theo vận tốc drone & thời gian bay của đạn 30mm
   * (có cản không khí), bù đạn rơi. Trả { x, y, z, az (độ, quy ước azimuth của game), el (độ), t, d }
   */
  function aaSolution(shooter, r) {
    const GT = typeof GameTiming !== 'undefined' ? GameTiming : null;
    const ammo = shooter.selectedAmmo === 'INCENDIARY' ? 'INCENDIARY' : 'GATLING_BULLET';
    const rp = GT ? GT.round(ammo, shooter.tankType) : { v: 540, g: 0, k: 0 };
    const mx = shooter.x, my = (shooter.y || 0) + 18, mz = shooter.z;
    let tx = r.x, ty = r.y + BODY_Y, tz = r.z, t = 0, s = 0;
    for (let k = 0; k < 3; k++) {
      s = Math.hypot(tx - mx, ty - my, tz - mz);
      t = rp.k > 0 ? (Math.exp(rp.k * s) - 1) / (rp.k * rp.v) : s / Math.max(1, rp.v);
      tx = r.x + r.vx * t; ty = r.y + BODY_Y + r.vy * t; tz = r.z + r.vz * t;
    }
    const aimY = ty + 0.5 * rp.g * t * t;
    const h = Math.hypot(tx - mx, tz - mz);
    return {
      x: tx, y: aimY, z: tz, t, d: s,
      az: (Math.atan2(tx - mx, -(tz - mz)) * 180 / Math.PI + 360) % 360,
      el: Math.atan2(aimY - my, Math.max(1, h)) * 180 / Math.PI
    };
  }

  /** Đoạn bay của đạn (a -> b) cắt hộp va chạm drone địch nào (bắn bởi phe `team`): { rec, t, x, y, z } | null */
  function segmentHit(ax, ay, az, bx, by, bz, team) {
    let best = null;
    const ex = bx - ax, ey = by - ay, ez = bz - az, L2 = ex * ex + ey * ey + ez * ez;
    for (const r of recs.values()) {
      if (!r.alive || r.team === team) continue;
      const cy = r.y + BODY_Y;
      let t = L2 > 1e-6 ? ((r.x - ax) * ex + (cy - ay) * ey + (r.z - az) * ez) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + ex * t, py = ay + ey * t, pz = az + ez * t;
      if (Math.hypot(px - r.x, py - cy, pz - r.z) > HIT_R) continue;
      if (!best || t < best.t) best = { rec: r, t, x: px, y: py, z: pz };
    }
    return best;
  }

  function unitById(id) {
    if (!game || !game.units) return null;
    for (const u of game.units) if (u.id === id) return u;
    return null;
  }

  /** Đạn 30mm trúng drone (gọi từ ballistics.js): tia lửa tại chỗ; máy có quyền với viên đạn mới tính sát thương */
  function onBulletHit(hit, shell) {
    const fx = game && game.ballistics && game.ballistics.fx;
    if (fx && fx.spawn) fx.spawn(hit.x, hit.y, hit.z, 'GATLING_BULLET', 'AIR', {});
    const shooter = unitById(shell.shooterId);
    if (!shooter || shooter.tankType !== 'GATLING' || !owns(shooter)) return;
    damage(hit.rec, BULLET_DMG[shell.ammoType] || 0.2, shooter);
  }

  function damage(r, amount, shooter) {
    if (!r || !r.alive) return;
    if (!r.local) {
      if (game && game.netSync && game.netSync.sendDroneHit) game.netSync.sendDroneHit(r.unit, amount, shooter);
      return;
    }
    const S = stateOf(r);
    if (!S) return;
    S.hp = (S.hp === undefined ? HP : S.hp) - amount;
    if (S.hp <= 1e-6) kill(r, shooter);
  }

  // trạng thái gốc chứa máu / pin của drone máy này (người chơi: game._drone, bot: unit._bd)
  function stateOf(r) {
    if (r.kind === 'player') return game && game._drone && game._drone.unit === r.unit ? game._drone : null;
    if (r.kind === 'bot') return r.unit._bd;
    return null;
  }

  function kill(r, shooter, fromNet) {
    if (!r.alive) return;
    r.alive = false;
    spawnWreck(r);
    const P = game && game.player;
    if (r.kind === 'player' && game && game.onPlayerDroneDown) game.onPlayerDroneDown(shooter);
    else if (r.kind === 'bot') {
      const B = r.unit._bd;
      if (B) { B.state = 'docked'; B.hp = HP; B.batt = 0; B.downUntil = now() + REBUILD; }
    }
    if (r.kind !== 'player') dropModel(r);
    if (!fromNet && r.local && game && game.netSync && game.netSync.sendDrone) game.netSync.sendDrone(r.unit, r, false, true);
    if (game && game.addCombatLog && P) {
      if (shooter === P) game.addCombatLog('[[target]] ĐÃ BẮN HẠ DRONE TRINH SÁT ĐỊCH — pháo địch mất mắt nhìn', 'tip');
      else if (r.team === P.team && r.unit !== P) game.addCombatLog(`[[drone-off]] Drone trinh sát của ${r.unit.name} bị phòng không địch bắn hạ`, 'alert');
      else if (r.team !== P.team && shooter && shooter.team === P.team) game.addCombatLog(`[[target]] ${shooter.name} bắn hạ drone trinh sát địch`, 'tip');
    }
  }

  // drone rơi: lật nghiêng, xoáy tròn, chạm đất thì nổ nhỏ
  function spawnWreck(r) {
    if (!game || !game.scene || typeof ReconDrone === 'undefined') return;
    const m = ReconDrone.build(r.team);
    m.position.set(r.x, r.y, r.z);
    game.scene.add(m);
    wrecks.push({ m, x: r.x, y: r.y, z: r.z, vx: r.vx * 0.6, vy: Math.max(-20, r.vy), vz: r.vz * 0.6, spin: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3) });
    const fx = game.ballistics && game.ballistics.fx;
    if (fx && fx.spawn) fx.spawn(r.x, r.y + BODY_Y, r.z, 'CLUSTER_SUBMUNITION', 'AIR', {});
    const P = game.player, SE = window.soundEngine;
    if (P && SE && SE.playExplosionAtDistance) SE.playExplosionAtDistance(Math.hypot(P.x - r.x, (P.y || 0) - r.y, P.z - r.z), 'AIRBURST', 'CLUSTER_SUBMUNITION', { x: r.x, z: r.z });
  }

  function stepWrecks(dt) {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i];
      w.vy -= 160 * dt;
      w.vx *= 1 - Math.min(1, dt * 0.6); w.vz *= 1 - Math.min(1, dt * 0.6);
      w.x += w.vx * dt; w.y += w.vy * dt; w.z += w.vz * dt;
      w.m.position.set(w.x, w.y, w.z);
      w.m.rotation.y += w.spin * dt;
      w.m.rotation.x = Math.min(1.1, w.m.rotation.x + dt * 1.4);
      ReconDrone.animate(w.m, dt, 0);
      const gy = ground(w.x, w.z);
      if (w.y <= gy + 0.5) {
        const fx = game && game.ballistics && game.ballistics.fx;
        if (fx && fx.spawn) fx.spawn(w.x, gy + 2, w.z, 'CLUSTER_SUBMUNITION', 'AIR', {});
        disposeModel(w.m);
        wrecks.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DRONE CỦA BOT PHÁO TỰ HÀNH: đã vào trận địa (hạ chân chống) và đủ pin thì bay ra trước trận địa trinh sát,
  // lượn vòng trên khu vực có địch, pin yếu thì bay về đáp nóc cabin sạc
  // ---------------------------------------------------------------------------
  function pickStation(u) {
    let best = null, bd = 2600;
    if (game && game.units) for (const e of game.units) {
      if (e.isDead || e.team === u.team) continue;
      if (typeof TeamIntel !== 'undefined' && !TeamIntel.knows(u, e)) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return { x: best.x, z: best.z };
    // chưa biết địch ở đâu: bay về phía giữa bản đồ / phía đội địch ~1000 đơn vị
    let dx = -u.x, dz = -u.z;
    if (Math.hypot(dx, dz) < 300) dz = u.team === 'BLUE' ? -1 : 1, dx = 0;
    const d = Math.hypot(dx, dz) || 1, L = Math.min(1000, Math.max(600, Math.hypot(u.x, u.z)));
    return { x: u.x + dx / d * L, z: u.z + dz / d * L };
  }

  function botStep(u, dt) {
    const K = C();
    const B = u._bd || (u._bd = { batt: 0.6 + Math.random() * 0.4, state: 'docked', hp: HP, downUntil: 0, x: u.x, y: u.y || 0, z: u.z, ang: Math.random() * 6.28, restation: 0 });
    let r = recs.get(u.id);
    if (!r) { r = { unit: u, team: u.team, kind: 'bot', local: true, x: B.x, y: B.y, z: B.z, vx: 0, vy: 0, vz: 0, alive: false }; recs.set(u.id, r); }
    r.kind = 'bot'; r.local = true; r.team = u.team;
    if (u.isDead) {
      if (r.alive) { r.alive = false; dropModel(r); sendState(r); }
      B.state = 'docked'; B.batt = Math.max(B.batt, 0.5);
      return;
    }
    const pad = padOf(u);
    if (B.state === 'docked') {
      B.x = pad.x; B.y = pad.y; B.z = pad.z;
      B.batt = Math.min(1, B.batt + dt / K.charge);
      if (u.isDeployed && B.batt >= BOT.minLaunch && now() >= (B.downUntil || 0)) {
        B.state = 'out'; B.hp = HP; B.restation = 0;
      }
    } else {
      B.batt = Math.max(0, B.batt - dt / K.flight);
      let tx, tz, sp, wantY;
      if (B.state === 'out') {
        if ((B.restation -= dt) <= 0) { B.restation = BOT.restation; B.station = pickStation(u); }
        const S = B.station;
        B.ang += dt * BOT.speed * 0.5 / BOT.loiter;
        tx = S.x + Math.cos(B.ang) * BOT.loiter; tz = S.z + Math.sin(B.ang) * BOT.loiter;
        sp = BOT.speed;
        wantY = ground(B.x, B.z) + BOT.alt;
        const home = Math.hypot(B.x - pad.x, B.z - pad.z);
        if (B.batt <= (home / K.rthSpeed + K.reserveS) / K.flight + 0.05 || !u.isDeployed) B.state = 'rth';
      } else {
        tx = pad.x; tz = pad.z; sp = K.rthSpeed * 0.5;
        const dh = Math.hypot(B.x - pad.x, B.z - pad.z);
        wantY = dh > 60 ? Math.max(ground(B.x, B.z) + 90, pad.y + 40) : pad.y;
        if (dh < 3 && Math.abs(B.y - pad.y) < 1.5) { B.state = 'docked'; }
      }
      const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz), st = sp * dt;
      if (d > st) { B.x += dx / d * st; B.z += dz / d * st; } else { B.x = tx; B.z = tz; }
      B.y += Math.max(-140 * dt, Math.min(140 * dt, wantY - B.y));
      // không cắm đầu xuống sườn đồi
      if (B.state === 'out') B.y = Math.max(B.y, ground(B.x, B.z) + 40);
      B.yaw = d > 1 ? Math.atan2(-dx, -dz) : (B.yaw || 0);
    }
    const flying = B.state !== 'docked';
    move(r, B.x, B.y, B.z, dt);
    if (flying !== r.alive) { r.alive = flying; sendState(r); }
    const M = modelFor(r);
    if (M) {
      M.visible = true;
      M.position.set(B.x, B.y, B.z);
      if (flying) { M.rotation.set(-0.1, B.yaw || 0, 0); ReconDrone.animate(M, dt, 1); }
      else { if (u.chassisGroup) u.chassisGroup.getWorldQuaternion(M.quaternion); ReconDrone.animate(M, dt, 0); }
      // đang đậu: drone dự phòng chưa lắp xong thì không có gì trên nóc cabin
      if (!flying && now() < (B.downUntil || 0)) M.visible = false;
      // xe pháo địch đang khuất tầm: drone đậu trên nóc cũng ẩn theo xe (drone đang bay thì ai cũng thấy trên trời)
      if (!flying && u.group && !u.group.visible) M.visible = false;
    }
  }

  // cập nhật vị trí + ước lượng vận tốc (lọc nhẹ) cho đón đầu phòng không
  function move(r, x, y, z, dt) {
    if (dt > 0 && r.alive) {
      const k = 1 - Math.exp(-dt * 6);
      const ivx = (x - r.x) / dt, ivy = (y - r.y) / dt, ivz = (z - r.z) / dt;
      if (Math.hypot(ivx, ivz) < 1500) { r.vx += (ivx - r.vx) * k; r.vy += (ivy - r.vy) * k; r.vz += (ivz - r.vz) * k; }
    } else { r.vx = r.vy = r.vz = 0; }
    r.x = x; r.y = y; r.z = z;
  }

  function sendState(r) {
    if (game && game.netSync && game.netSync.sendDrone && r.local) game.netSync.sendDrone(r.unit, r, r.alive, false);
  }

  // drone của người chơi máy này (pháo tự hành): đọc trạng thái do game.js điều khiển
  function playerStep(dt) {
    const P = game && game.player;
    let r = P ? recs.get(P.id) : null;
    // người chơi đổi xe / hết trận: bỏ bản ghi cũ
    for (const [id, q] of recs) if (q.kind === 'player' && (!P || q.unit !== P)) { if (q.alive) { q.alive = false; sendState(q); } recs.delete(id); }
    if (!P || P.tankType !== 'ARTILLERY') return;
    const D = game._drone && game._drone.unit === P ? game._drone : null;
    if (!r) { r = { unit: P, team: P.team, kind: 'player', local: true, x: P.x, y: P.y || 0, z: P.z, vx: 0, vy: 0, vz: 0, alive: false }; recs.set(P.id, r); }
    r.team = P.team;
    const flying = !!D && !P.isDead && !!AIRBORNE[D.state];
    if (D) { if (D.hp === undefined) D.hp = HP; move(r, D.x, D.y, D.z, flying ? dt : 0); }
    if (flying !== r.alive) { r.alive = flying; sendState(r); }
  }

  // xe 6 nòng người chơi: có drone địch trong tầm phòng không mà chưa khóa -> nhắc phím F (tối đa ~12 s / lần)
  function aaHint() {
    const P = game && game.player;
    if (!P || P.isDead || P.tankType !== 'GATLING' || game._aaLock) return;
    const t = now();
    if (t - aaHintAt < 12) return;
    if (enemyDroneFor(P, AA_RANGE)) {
      aaHintAt = t;
      game.addCombatLog('[[drone]] DRONE TRINH SÁT ĐỊCH trong tầm phòng không — bấm [F] để khóa, giữ [Space] để bắn hạ', 'alert');
    }
  }

  function update(dt) {
    if (!game || !(dt >= 0)) return;
    playerStep(dt);
    if (game.units) for (const u of game.units) {
      if (u.tankType !== 'ARTILLERY' || u === game.player || u.isPlayer || u.isRemotePlayer || u._netProxy) continue;
      botStep(u, dt);
    }
    // drone từ máy khác: trôi mượt về vị trí mới nhất; mất tin quá lâu -> coi như đã đáp
    const t = now();
    for (const [id, r] of recs) {
      if (r.kind !== 'net') continue;
      if (!r.alive || t - r.t > NET_TTL || !r.unit || r.unit.isDead) { dropModel(r); recs.delete(id); continue; }
      const k = 1 - Math.exp(-dt * 10);
      move(r, r.x + (r.nx - r.x) * k, r.y + (r.ny - r.y) * k, r.z + (r.nz - r.z) * k, dt);
      const M = modelFor(r);
      if (M) {
        M.visible = true;
        M.position.set(r.x, r.y, r.z);
        if (Math.hypot(r.vx, r.vz) > 5) M.rotation.set(-0.1, Math.atan2(-r.vx, -r.vz), 0);
        ReconDrone.animate(M, dt, 1);
      }
    }
    // gửi vị trí drone của máy này
    netAcc += dt;
    if (netAcc >= NET_DT) {
      netAcc = 0;
      for (const r of recs.values()) if (r.local && r.alive) sendState(r);
    }
    stepWrecks(dt);
    aaHint();
  }

  // ---------------------------------------------------------------------------
  // MẠNG (netcode.js gọi)
  // ---------------------------------------------------------------------------
  function onNet(u, d) {
    if (!u) return;
    let r = recs.get(u.id);
    if (r && r.local) return;   // drone của máy này: không nhận vị trí từ máy khác
    if (!r) {
      if (!d.a) return;
      r = { unit: u, team: u.team, kind: 'net', local: false, x: d.x, y: d.y, z: d.z, nx: d.x, ny: d.y, nz: d.z, vx: 0, vy: 0, vz: 0, alive: true, t: now() };
      recs.set(u.id, r);
    }
    r.team = u.team;
    r.nx = d.x; r.ny = d.y; r.nz = d.z; r.t = now();
    if (d.k) { r.x = d.x; r.y = d.y; r.z = d.z; r.alive = true; kill(r, null, true); recs.delete(u.id); return; }
    r.alive = !!d.a;
  }
  // máy khác bắn trúng drone của máy này
  function onNetHit(u, amount, shooter) {
    const r = u && recs.get(u.id);
    if (!r || !r.local || !r.alive) return;
    damage(r, Math.max(0, Math.min(1, amount)), shooter);
  }

  return {
    SIGHT, HP, REBUILD, AA_RANGE, DETECT,
    bind, reset, update, airborne, sees, enemyDroneFor, aaSolution, segmentHit, onBulletHit, damage, onNet, onNetHit,
    get count() { return recs.size; }
  };
})();

if (typeof window !== 'undefined') window.DroneOps = DroneOps;
