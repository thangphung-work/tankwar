/**
 * KÍP XE TRINH SÁT (2 người: LÁI XE trong cabin + XẠ THỦ đứng ở lỗ nóc vòng súng)
 *
 * Xạ thủ là hình người thật trên vòng súng (quay theo vòng tháp), hai tay bám đúng vị trí bằng IK 2 khớp (vai - khuỷu -
 * bàn tay) nên luôn cầm đúng tay nắm / nắp / hộp đạn / ống tên lửa đang chuyển động:
 *  - Bình thường: hai tay nắm tay cầm súng 12.7mm (theo nòng ngóc / giật)
 *  - THAY HỘP ĐẠN SÚNG MÁY (thủ công): lật nắp khóa nòng, gỡ hộp rỗng thả xuống, cúi xuống khoang lấy hộp mới, đặt vào
 *    khay, sập nắp, kéo tay kéo lên đạn 2 lần
 *  - NẠP TÊN LỬA kiểu TOW (thủ công, ống phóng cố định dùng lại): đứng nhô lên khỏi lỗ nóc, quay sang ống phóng, mở nắp
 *    khóa sau, rút vỏ chứa rỗng ra vứt xuống đất, cúi xuống khoang lấy quả mới, nâng lên đẩy vào ống từ phía sau, đóng
 *    nắp, ngồi về súng. Xe chạy nhanh thì nạp chậm hẳn (phải đứng trên nóc giữ thăng bằng)
 *  - XẠ THỦ HY SINH: gục lên súng; súng máy & tên lửa không còn người điều khiển (vô hiệu), không nạp được nữa
 *  - LÁI XE HY SINH: xe mất khả năng cơ động
 * Thương vong: đạn trúng thẳng hình người xạ thủ (đứng nạp tên lửa thì lộ cả nửa người trên tấm chắn), mảnh nổ gần
 * (nhô người càng cao càng dễ trúng), phát xuyên vào khoang kíp lái. Ghi vào bộ phận đã mất của VehicleDamage
 * ('crewGunner' / 'crewDriver') -> đồng bộ mạng theo bản tóm tắt hư hại như các bộ phận khác.
 */
const VehicleCrew = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const c01 = x => Math.max(0, Math.min(1, x));
  const sm = x => { x = c01(x); return x * x * (3 - 2 * x); };
  const UP = V(0, 1, 0);

  // ---------- HÌNH NGƯỜI ----------
  const MATS = {};
  function mats(team) {
    if (MATS[team]) return MATS[team];
    const std = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    return (MATS[team] = {
      uni: std(team === 'RED' ? 0x4a3d2a : 0x3a422b),     // quân phục
      vest: std(team === 'RED' ? 0x3b3122 : 0x2e3523),    // áo giáp
      helm: std(team === 'RED' ? 0x413726 : 0x343c28, 0.7),
      skin: std(0xc49a74, 0.8),
      glove: std(0x1d1c19),
      dead: std(0x2a201a)
    });
  }

  // Kích thước người thật (8 đv = 1 m): vai rộng ~0.45 m, thân ~0.55 m, cánh tay trên 0.29 m, cẳng tay 0.27 m
  const ARM_UP = 2.3, ARM_FORE = 2.15;
  function buildFigure(team) {
    const M = mats(team);
    const root = new THREE.Group();
    const torso = new THREE.Group();          // gốc ở hông (khớp hông): nghiêng (cúi) / vặn người
    root.add(torso);
    const meshes = [];
    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true;
      parent.add(m); meshes.push(m);
      return m;
    };
    add(torso, new THREE.BoxGeometry(2.9, 2.4, 1.45), M.uni, 0, -1.0, 0);          // hông (chìm trong lỗ nóc)
    add(torso, new THREE.BoxGeometry(3.1, 3.4, 1.55), M.uni, 0, 1.8, 0);           // ngực
    add(torso, new THREE.BoxGeometry(3.3, 2.6, 1.8), M.vest, 0, 2.0, 0.02);      // áo giáp
    add(torso, new THREE.BoxGeometry(1.0, 0.7, 0.9), M.skin, 0, 3.75, 0);         // cổ
    const head = new THREE.Group();
    head.position.set(0, 4.0, 0);
    torso.add(head);
    add(head, new THREE.BoxGeometry(1.45, 1.7, 1.55), M.skin, 0, 0.75, 0);
    const hel = add(head, new THREE.SphereGeometry(1.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.helm, 0, 1.2, 0.05);
    hel.scale.set(1, 0.85, 1.05);
    add(head, new THREE.BoxGeometry(2.0, 0.18, 2.1), M.helm, 0, 1.2, 0.08);      // vành mũ
    // tay: cánh tay trên / cẳng tay dựng dọc +Y từ gốc khớp (con của root để IK tính trong không gian root)
    const arms = [-1, 1].map(s => {
      const up = new THREE.Group(), fore = new THREE.Group(), hand = new THREE.Group();
      root.add(up, fore, hand);
      add(up, new THREE.BoxGeometry(0.85, ARM_UP, 0.85), M.uni, 0, ARM_UP / 2, 0);
      add(fore, new THREE.BoxGeometry(0.72, ARM_FORE, 0.72), M.uni, 0, ARM_FORE / 2, 0);
      add(hand, new THREE.BoxGeometry(0.6, 0.65, 0.5), M.glove, 0, 0, 0);
      return { s, up, fore, hand, sh: V(s * 1.65, 3.25, 0) };   // vai (hệ thân)
    });
    for (const m of meshes) m.userData.crewRole = 'gunner';
    return { root, torso, head, arms, meshes, M, rise: 0, bend: 0, twist: 0 };
  }

  // IK 2 khớp trong hệ root: vai S -> khuỷu E -> bàn tay T; khuỷu bẻ về phía pole
  const _q = new THREE.Quaternion(), _d = V(0, 0, 0);
  function aim(obj, from, to) {
    _d.subVectors(to, from);
    const L = _d.length();
    obj.position.copy(from);
    if (L > 1e-5) obj.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / L));
  }
  function solveArm(F, arm, targetW, poleL) {
    const S = F.torso.localToWorld(arm.sh.clone());
    F.root.worldToLocal(S);
    const T = F.root.worldToLocal(targetW.clone());
    const a = ARM_UP, b = ARM_FORE;
    const ST = T.clone().sub(S);
    let d = ST.length();
    const dir = d > 1e-5 ? ST.clone().multiplyScalar(1 / d) : V(0, -1, 0);
    d = Math.max(Math.abs(a - b) + 0.05, Math.min(a + b - 0.02, d));
    const Tc = S.clone().addScaledVector(dir, d);   // tay không với tới: duỗi thẳng về phía mục tiêu
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pv = poleL.clone().sub(S);
    pv.addScaledVector(dir, -pv.dot(dir));
    if (pv.lengthSq() < 1e-6) pv.set(0, -1, 0);
    pv.normalize();
    const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
    aim(arm.up, S, E);
    aim(arm.fore, E, Tc);
    arm.hand.position.copy(Tc);
    arm.hand.quaternion.copy(arm.fore.quaternion);
  }

  // ---------- XẠ THỦ XE TRINH SÁT ----------
  // turret: vòng súng; mg: { cover, ammo, barrel } của súng 12.7mm (recon_marten buildRingMount)
  function attachScoutGunner(unit, turret, mg) {
    hook();
    const F = buildFigure(unit.team);
    F.base = V(0, -0.9, 2.55);           // đứng trong lỗ nóc, sau tay cầm súng
    F.root.position.copy(F.base);
    turret.add(F.root);
    unit.crew = { gunner: F, mg, turret, kind: 'scout' };
    return F;
  }

  const wp = (obj, x, y, z) => obj.localToWorld(V(x, y, z));
  const lerpV = (a, b, k) => a.clone().lerp(b, k);

  // khung hình chính: [mốc thời gian, hàm(ctx) -> { L, R (Vector3 thế giới), rise, bend, twist }]; nội suy mượt giữa 2 mốc liền kề
  function track(keys, t, ctx) {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const [t0, f0] = keys[i], [t1, f1] = keys[i + 1];
    const k = t1 > t0 ? sm((t - t0) / (t1 - t0)) : 1;
    const A = f0(ctx), B = f1(ctx);
    return {
      L: lerpV(A.L, B.L, k), R: lerpV(A.R, B.R, k),
      rise: A.rise + (B.rise - A.rise) * k, bend: A.bend + (B.bend - A.bend) * k, twist: A.twist + (B.twist - A.twist) * k
    };
  }

  const pose = (L, R, rise = 0, bend = 0, twist = 0) => ({ L, R, rise, bend, twist });

  // Thay hộp đạn súng máy (pr 0..1 theo reloadTimer — đồng bộ với hoạt cảnh nắp / hộp trong recon_marten)
  const MG_KEYS = [
    [0.00, c => pose(c.gripL, c.gripR)],
    [0.07, c => pose(c.gripL, c.coverH)],
    [0.20, c => pose(c.boxH, c.coverH, 0, 0.12)],
    [0.40, c => pose(c.boxH, c.coverH, 0, 0.25)],
    [0.48, c => pose(c.hatchL, c.hatchR, -0.2, 0.62)],
    [0.56, c => pose(c.boxH, c.boxH2, -0.1, 0.45)],
    [0.74, c => pose(c.boxH, c.boxH2, 0, 0.12)],
    [0.80, c => pose(c.boxH, c.coverH, 0, 0.08)],
    [0.90, c => pose(c.gripL, c.coverH)],
    [0.93, c => pose(c.gripL, c.chargeB)],
    [0.955, c => pose(c.gripL, c.chargeF)],
    [0.975, c => pose(c.gripL, c.chargeB)],
    [1.00, c => pose(c.gripL, c.gripR)]
  ];

  // Nạp tên lửa kiểu TOW (pr 0..1 theo antiTankCooldown). Mốc chuyển động của ống phóng: xem animateLauncher
  const AT = { capOpen: [0.20, 0.26], spentOut: [0.26, 0.42], toss: 0.45, newUp: [0.60, 0.66], push: [0.66, 0.80], capClose: [0.80, 0.86] };
  const AT_KEYS = [
    [0.00, c => pose(c.gripL, c.gripR)],
    [0.10, c => pose(c.gripL, c.gripR)],
    [0.18, c => pose(c.tubeL, c.capH, 1.6, 0.05, -0.55)],
    [0.26, c => pose(c.tubeL, c.capH, 1.6, 0.05, -0.55)],
    [0.30, c => pose(c.spentL, c.spentR, 1.6, 0.1, -0.55)],
    [0.42, c => pose(c.spentL, c.spentR, 1.6, 0.0, -0.75)],
    [0.46, c => pose(c.tossL, c.tossR, 1.6, -0.05, -0.9)],
    [0.51, c => pose(c.hatchL, c.hatchR, 0.5, 0.72, -0.3)],
    [0.58, c => pose(c.hatchL, c.hatchR, 0.5, 0.72, -0.3)],
    [0.63, c => pose(c.misL, c.misR, 1.6, 0.12, -0.55)],
    [0.80, c => pose(c.tubeL, c.misR, 1.6, 0.18, -0.55)],
    [0.83, c => pose(c.tubeL, c.capH, 1.6, 0.1, -0.55)],
    [0.87, c => pose(c.tubeL, c.capH, 1.6, 0.05, -0.55)],
    [0.96, c => pose(c.gripL, c.gripR)],
    [1.00, c => pose(c.gripL, c.gripR)]
  ];

  // vỏ chứa rỗng (đẩy ra từ đuôi ống) — tạo khi cần trong ống phóng
  function spentOf(A) {
    if (A.spent) return A.spent;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3a33, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 4.6, 12), mat);
    body.rotation.x = Math.PI / 2; g.add(body);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.7 }));
    ring.rotation.x = Math.PI / 2; ring.position.z = 2.1; g.add(ring);
    g.visible = false;
    A.can.add(g);
    A.spent = g;
    return g;
  }

  // Ống phóng theo tiến trình nạp: nắp sau mở / đóng, vỏ rỗng trượt ra, quả mới nâng lên & đẩy vào, nắp trước
  function animateLauncher(u, A, pr, reloading, has, dead) {
    const spent = spentOf(A);
    if (!reloading) {
      A.rearCap.rotation.x = 0; A.missile.visible = false; spent.visible = false; A.can.position.z = 0;
      A.capCover.visible = has; A.capOpen.visible = !has;
      return;
    }
    const open = sm((pr - AT.capOpen[0]) / (AT.capOpen[1] - AT.capOpen[0])) * (1 - sm((pr - AT.capClose[0]) / (AT.capClose[1] - AT.capClose[0])));
    A.rearCap.rotation.x = -1.6 * open;
    // vỏ rỗng: nằm trong ống tới lúc rút; trượt lùi ra sau; vứt đi ở mốc toss
    const so = sm((pr - AT.spentOut[0]) / (AT.spentOut[1] - AT.spentOut[0]));
    spent.position.set(0, 0, -0.9 + 5.6 * so);
    spent.visible = pr < AT.toss && so > 0.02;
    const load = has && !dead;
    const up = sm((pr - AT.newUp[0]) / (AT.newUp[1] - AT.newUp[0])), push = sm((pr - AT.push[0]) / (AT.push[1] - AT.push[0]));
    A.missile.visible = load && pr > AT.newUp[0] - 0.02 && push < 0.97;
    A.missile.position.set(0, -1.6 * (1 - up), 5.4 * (1 - push));
    A.can.position.z = pr > AT.capClose[0] && pr < AT.capClose[1] + 0.02 ? Math.sin(c01((pr - AT.capClose[0]) / 0.08) * Math.PI) * 0.1 : 0;
    A.capOpen.visible = !(load && pr >= AT.capClose[1]); A.capCover.visible = !A.capOpen.visible;
  }

  let SPENT_GEO = null;
  function tossSpent(u, A) {
    if (typeof ReloadFX === 'undefined' || !u.scene || !A.spent) return;
    if (!SPENT_GEO) { SPENT_GEO = new THREE.CylinderGeometry(0.44, 0.44, 4.6, 10); SPENT_GEO.rotateX(Math.PI / 2); SPENT_GEO.userData.shared = true; }
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3a33, roughness: 0.85 }); mat.userData.own = true;
    const m = new THREE.Mesh(SPENT_GEO, mat);
    m.castShadow = true; m.userData.half = 0.45;
    A.spent.updateWorldMatrix(true, false);
    const pos = A.spent.getWorldPosition(V(0, 0, 0));
    A.spent.getWorldQuaternion(m.quaternion);
    const q = new THREE.Quaternion();
    u.turretGroup.getWorldQuaternion(q);
    const side = V(1, 0.15, 0.4).applyQuaternion(q);
    ReloadFX.toss(u.scene, m, pos, { x: side.x * 14, y: 10, z: side.z * 14 }, { x: 0.8, y: 1.6, z: -2.4 }, 12);
  }

  // ---------- MỖI KHUNG HÌNH ----------
  function animate(u, dt) {
    const C = u.crew;
    if (!C || !(dt > 0)) return;
    const d = u.dmg, F = C.gunner;
    const gDead = !!(d && d.lost && d.lost.has('crewGunner')), dDead = !!(d && d.lost && d.lost.has('crewDriver'));
    applyEffects(u, gDead, dDead, dt);

    const A = u.atgmCan;
    const cd = u.antiTankCooldown || 0, cdMax = u.antiTankCooldownMax || 1;
    const S = C.st || (C.st = { lastCd: 0, at: false, tossed: false });
    if (cd > S.lastCd + 0.05 && !u.isDead) { S.at = true; S.tossed = false; S.puffs = 0; S.t = 0; }
    S.lastCd = cd;
    const atPr = S.at ? (cd > 0 ? 1 - cd / cdMax : 1) : 1;
    const has = u.missileAmmoCount === undefined || u.missileAmmoCount > 0;
    if (A) {
      animateLauncher(u, A, atPr, S.at, has, gDead);
      if (S.at) {
        S.t += dt;
        // khói thuốc phóng còn rỉ ra miệng & đuôi ống sau khi phóng
        if (S.puffs < 3 && S.t > 0.15 + S.puffs * 0.35 && typeof ReloadFX !== 'undefined' && u.getLauncherWorldTransform) {
          S.puffs++;
          const L = u.getLauncherWorldTransform();
          ReloadFX.puff(u, L.position, { x: L.direction.x * 0.3, y: 0.6, z: L.direction.z * 0.3 }, 1);
          if (L.rear) ReloadFX.puff(u, L.rear, { x: -L.direction.x * 0.3, y: 0.6, z: -L.direction.z * 0.3 }, 1);
        }
        if (!S.tossed && atPr >= AT.toss && !gDead) { S.tossed = true; tossSpent(u, A); }
      }
      if (S.at && cd <= 0) S.at = false;
    }
    if (!F) return;
    // xa camera: không cần tính tư thế từng khung (giữ tư thế cũ)
    const cam = window.game && window.game.camera;
    if (cam && Math.hypot(cam.position.x - u.x, cam.position.z - u.z) > 900) return;

    u.group.updateMatrixWorld(true);
    const P = u.barrelPivot, T = C.turret, mg = C.mg;
    const c = {
      gripL: wp(P, -0.42, 0.12, 2.85), gripR: wp(P, 0.42, 0.12, 2.85),
      hatchL: wp(T, -0.6, -0.4, 2.0), hatchR: wp(T, 0.5, -0.4, 2.1)
    };
    let tgt;
    const mgReload = !u.isDead && u.gatlingMag <= 0 && u.reloadTimer > 0 && u.reloadDuration > 0;
    if (gDead || u.isDead) {
      // gục xuống: người đổ về trước lên súng, hai tay buông thõng
      tgt = pose(wp(T, -1.0, 0.6, 0.9), wp(T, 1.0, 0.4, 0.8), -0.5, 1.0, 0.18);
    } else if (S.at && A && atPr < 1) {
      const can = A.can;
      Object.assign(c, {
        tubeL: wp(can, 0.25, 0.62, 1.2),
        capH: wp(A.rearCap, 0, -1.15, 0.2),
        spentL: wp(spentOf(A), -0.35, 0.1, 2.3), spentR: wp(spentOf(A), 0.38, 0.0, 2.25),
        tossL: wp(T, 3.6, 4.6, 1.6), tossR: wp(T, 3.9, 4.1, 0.4),
        misL: wp(A.missile, 0, -0.42, -0.4), misR: wp(A.missile, 0.3, 0.1, 1.25)
      });
      tgt = track(AT_KEYS, atPr, c);
    } else if (mgReload && mg) {
      const pr = 1 - u.reloadTimer / u.reloadDuration;
      Object.assign(c, {
        coverH: wp(mg.cover, 0, 0.3, 1.55),
        boxH: mg.ammo.visible ? wp(mg.ammo, 0, 0.95, 0) : wp(T, -0.9, -0.2, 1.9),
        boxH2: mg.ammo.visible ? wp(mg.ammo, 0.6, 0.6, 0.2) : wp(T, -0.2, -0.3, 2.0),
        chargeF: wp(P, 0.6, 0.15, 0.9), chargeB: wp(P, 0.6, 0.15, 1.9)
      });
      tgt = track(MG_KEYS, pr, c);
    } else tgt = pose(c.gripL, c.gripR);

    // thân người: nhô lên / cúi / vặn mượt (không giật cục khi đổi hoạt cảnh)
    const k = 1 - Math.exp(-dt * (gDead ? 3 : 10));
    F.rise += (tgt.rise - F.rise) * k; F.bend += (tgt.bend - F.bend) * k; F.twist += (tgt.twist - F.twist) * k;
    F.root.position.set(F.base.x, F.base.y + F.rise, F.base.z);
    F.torso.rotation.set(-F.bend, F.twist, gDead ? 0.12 : 0, 'YXZ');
    F.head.rotation.x = gDead ? -0.6 : -F.bend * 0.3;
    F.root.updateMatrixWorld(true);
    const H = F.hT || (F.hT = [tgt.L.clone(), tgt.R.clone()]);
    const kh = 1 - Math.exp(-dt * 16);
    H[0].lerp(tgt.L, kh); H[1].lerp(tgt.R, kh);
    // khuỷu tay bẻ ra hai bên (tư thế ôm tay cầm súng máy), hơi xuống
    for (const arm of F.arms) solveArm(F, arm, H[arm.s < 0 ? 0 : 1], V(arm.s * 7, 1.6, 0.6));
    if (gDead && !F.deadTint) { F.deadTint = true; for (const m of F.meshes) if (m.material === F.M.uni || m.material === F.M.vest) m.material = F.M.dead; }
    else if (!gDead && F.deadTint) { F.deadTint = false; for (const m of F.meshes) if (m.material === F.M.dead) m.material = F.M.uni; }
  }

  // Ảnh hưởng của kíp xe lên xe (xe máy mình điều khiển): xạ thủ hy sinh -> súng & tên lửa vô hiệu, không nạp; lái xe hy sinh
  // -> xe đứng im. Đang nạp tên lửa mà xe chạy nhanh: nạp chậm (xạ thủ phải đứng trên nóc bám giữ)
  function applyEffects(u, gDead, dDead, dt) {
    const d = u.dmg;
    if (gDead && d) { d.gunDead = true; d.rpgDisabled = true; u.isFiringGatling = false; }
    if (dDead && d) { u.baseMaxSpeed = 0; u.speed = (u.speed || 0) * Math.exp(-dt * 3); }
    if (u._netProxy || u.isDead) return;
    if (gDead) {
      // không ai nạp: hồi nạp đứng yên
      if (u.antiTankCooldown > 0) u.antiTankCooldown += dt;
      if (u.reloadTimer > 0) u.reloadTimer += dt;
      return;
    }
    if (u.antiTankCooldown > 0 && u.crew && u.crew.st && u.crew.st.at) {
      const vmax = (d && d.base && d.base.baseMaxSpeed) || u.baseMaxSpeed || 100;
      if (Math.abs(u.speed || 0) > vmax * 0.25) {
        u.antiTankCooldown += dt * 0.6;   // còn ~40% tốc độ nạp
        if (u.isPlayer && window.game && (!u._atSlowT || performance.now() - u._atSlowT > 6000)) {
          u._atSlowT = performance.now();
          window.game.addCombatLog('[[rocket]] Xe đang chạy — xạ thủ đứng trên nóc nạp tên lửa rất chậm. Dừng / chạy chậm lại để nạp nhanh', 'tip');
        }
      }
    }
  }

  // ---------- THƯƠNG VONG ----------
  function killCrew(u, role, events, how) {
    const d = window.VehicleDamage.state(u), tag = role === 'gunner' ? 'crewGunner' : 'crewDriver';
    if (d.lost.has(tag)) return false;
    d.lost.add(tag);
    events.push(crewEvent(role, how));
    return true;
  }
  function crewEvent(role, how) {
    return role === 'gunner'
      ? { type: 'crew', text: `XẠ THỦ ${how || 'TRÚNG ĐẠN'} HY SINH — súng máy & tên lửa không còn người điều khiển` }
      : { type: 'crew', text: `LÁI XE ${how || 'TRÚNG ĐẠN'} HY SINH — xe mất khả năng cơ động` };
  }
  const exposure = u => (u.crew && u.crew.gunner ? (u.crew.gunner.rise > 0.8 ? 1 : 0.5) : 0);

  function onHit(u, opts, r) {
    if (!u || u.isDead || !u.crew || u.crew.kind !== 'scout' || !r || !r.events || r.intercepted) return;
    const VD = window.VehicleDamage, d = VD.state(u), hit = opts && opts.hit;
    if (hit && hit.object && hit.object.userData && hit.object.userData.crewRole === 'gunner') {
      if (!hit.ricochet) killCrew(u, 'gunner', r.events, 'TRÚNG ĐẠN');
      return;
    }
    const AO = d.lastOutcome;
    if (!AO || !AO.pen || AO.zone !== 'crew' || r.mul <= 0) return;
    const cls = VD.ammoClass(opts.ammo);
    const p = cls === 'small' ? 0.15 : cls === 'cannon' ? 0.3 : 0.6;
    if (Math.random() > p) return;
    // phát xuyên vào khoang: nửa trước (cabin) trúng lái xe, nửa sau (dưới lỗ nóc) trúng chân / thân dưới xạ thủ
    let front = true;
    if (hit && hit.point && u.chassisGroup) front = u.chassisGroup.worldToLocal(hit.point.clone()).z < 0;
    killCrew(u, front ? 'driver' : 'gunner', r.events, 'TRÚNG MẢNH XUYÊN KHOANG');
  }

  function onSplash(u, opts, r) {
    if (!u || u.isDead || !u.crew || !u.crew.gunner || !r || !r.events) return;
    const d = window.VehicleDamage.state(u);
    if (d.lost.has('crewGunner')) return;
    const cls = window.VehicleDamage.ammoClass(opts.ammo);
    if (cls === 'small' || cls === 'cannon' || !(opts.radius > 0)) return;
    const h = u.crew.gunner.head.getWorldPosition(V(0, 0, 0));
    const dist = Math.hypot(h.x - opts.x, h.y - opts.y, h.z - opts.z);
    const p = exposure(u) * Math.pow(c01(1 - dist / (opts.radius * 0.85)), 1.3) * (opts.heavy ? 1.2 : 1);
    if (Math.random() < p) killCrew(u, 'gunner', r.events, 'TRÚNG MẢNH NỔ');
  }

  // gắn vào VehicleDamage: tính thương vong trên máy có quyền với phát bắn (không chạy ở lượt chỉ vẽ hình), báo khi nhận
  // bản tóm tắt hư hại từ máy khác
  function hook() {
    const VD = typeof window !== 'undefined' && window.VehicleDamage;
    if (!VD || VD.__crew) return;
    VD.__crew = true;
    let vis = 0;
    const oV = VD.visualOnly;
    VD.visualOnly = function (fn) { vis++; try { return oV.call(this, fn); } finally { vis--; } };
    const oH = VD.onDirectHit;
    VD.onDirectHit = function (u, opts) {
      const r = oH.apply(this, arguments);
      if (!vis) { try { onHit(u, opts, r); } catch (e) { console.error('[VehicleCrew]', e); } }
      return r;
    };
    const oS = VD.onSplash;
    VD.onSplash = function (u, opts) {
      const r = oS.apply(this, arguments);
      if (!vis) { try { onSplash(u, opts, r); } catch (e) { console.error('[VehicleCrew]', e); } }
      return r;
    };
    const oA = VD.applyDigest;
    VD.applyDigest = function (u, s) {
      const had = u && u.dmg && u.dmg.lost ? { g: u.dmg.lost.has('crewGunner'), d: u.dmg.lost.has('crewDriver') } : { g: false, d: false };
      const ev = oA.apply(this, arguments);
      try {
        const L = u && u.dmg && u.dmg.lost;
        if (L && Array.isArray(ev)) {
          if (!had.g && L.has('crewGunner')) ev.push(crewEvent('gunner'));
          if (!had.d && L.has('crewDriver')) ev.push(crewEvent('driver'));
        }
      } catch (e) { /* bỏ qua */ }
      return ev;
    };
  }
  hook();

  return { attachScoutGunner, animate, buildFigure, hook, AT };
})();

if (typeof window !== 'undefined') window.VehicleCrew = VehicleCrew;
