/**
 * XE BỌC GIÁP TRINH SÁT HẠNG NHẸ MARTEN R4  (tankType: SCOUT)
 *
 * Thiết kế hư cấu theo kiểu xe bọc giáp hạng nhẹ 4x4 cabin hộp:
 * - Động cơ đặt trước: nắp máy dốc, lưới tản nhiệt nan ngang ở mũi, vè trước loe ôm bánh
 * - Cabin hộp đứng bọc giáp, kính chắn gió 2 tấm phẳng có gạt mưa, 4 cửa có ô kính nhỏ & bản lề lộ
 * - Lỗ nóc gắn súng máy hạng nặng có tấm chắn đạn, nắp mở dựng phía sau, lan can ống quanh nóc sau
 * - 3 ăng-ten liên lạc cao, khung bảo vệ đèn, gương trên cần ở 2 góc trước, biển số trắng
 * - Bánh lốp lớn vành thép đen; trên nóc sau có cảm biến giám sát xoay (radar trinh sát)
 *
 * Hook gameplay: radarDish (spg.js xoay), barrelPivot/barrelGroup/muzzleTipLocal (súng máy & tên lửa),
 * antiTankLauncherMesh, gatlingShotFlash (chớp lửa nòng). Tỉ lệ ~8 đơn vị = 1 mét, mũi xe hướng -Z.
 */

(function () {
  if (typeof TankModelBuilder === 'undefined' || typeof VehicleKit === 'undefined') return;

  const WHEEL_R = 3.8;
  const TIRE_W = 2.9;
  const WHEEL_X = 7.0;
  const WHEEL_Y = WHEEL_R;
  const AXLES = [{ z: -11.6, steer: 1 }, { z: 11.0, steer: 0 }];
  const HALF_W = 8.0;          // nửa bề ngang thân
  const HOOD_HALF = 6.6;       // nửa bề ngang nắp máy
  const ROOF_Y = 15.4;
  const CAB_CH = 0.6;          // mép nóc cabin vát chéo 45° quanh 4 phía (~7 cm) như thân xe bọc thép hàn tấm
  const CAB_FRONT = -9.4;      // chân kính chắn gió
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const RING_Z = 1.6;          // vị trí lỗ nóc gắn súng (dời lên trước: nắp mở dựng phía sau không vướng đồ nóc sau)
  const HATCH_R = 3.4;         // bán kính lỗ nóc (vừa một người đứng)
  const HINGE_Z = HATCH_R + 0.45, LID_OPEN = 2.6;   // bản lề ngay mép sau vòng; nắp mở ngả hẳn ra sau (~150°) tựa trên nóc, chừa chỗ xoay người bắn   // bản lề lùi xa về đuôi xe: nắp mở không chắn chỗ xoay người bắn   // trục bản lề nắp (lùi sau vòng), góc nắp khi mở
  const GUN_Y = 1.8, GUN_Z = -4.5;   // khớp ngóc súng máy: trên chốt ở mép trước lỗ nóc, tay cầm ngang ngực xạ thủ
  const ATGM_AT = new THREE.Vector3(2.9, 0.7, -0.4);   // ống tên lửa trên khối ngóc súng (bên phải, ngoài tấm chắn)
  const TIRE_LUG = 0.5;        // chiều cao gai lốp
  const TIRE_BEAD = 2.3;       // bán kính mép vành

  function buildMarten(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team, { battle: 1 });
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    M.rim = new THREE.MeshStandardMaterial({ color: 0x1f2120, roughness: 0.7, metalness: 0.35 });
    M.plate = new THREE.MeshStandardMaterial({ color: 0xe9ecea, roughness: 0.6, metalness: 0.1 });
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildBody(chassis, M, unit, rnd);
    const wheels = buildWheels(chassis, M);
    buildSuspension(chassis, M);
    buildStowage(chassis, M, rnd);
    buildSpareWheel(chassis, M);
    unit.wheelSet = wheels;
    const sensor = buildRoofSensor(chassis, M, unit);
    const mg = buildRingMount(chassis, M, unit);
    // xạ thủ đứng ở lỗ nóc vòng súng (hình người, nạp đạn thủ công, có thể hy sinh) — vehicle_crew.js
    if (typeof VehicleCrew !== 'undefined') VehicleCrew.attachScoutGunner(unit, unit.turretGroup, mg);
    // Ô VŨ KHÍ CHÍNH: súng 12.7 mặc định; Equipment.equip đổi sang trạm trên chân đế mô-đun (roof_mounts.js) theo bộ đồ
    unit._hmg = { pivot: unit.barrelPivot, barrel: unit.barrelGroup, muzzle: unit.muzzleTipLocal.clone(), mount: mg.hmgMount, parts: mg.hmgParts, mg };
    const weaponCtx = { key: 'weapon', asMain: true, parent: unit.turretGroup, seat: [0, 0.25, -0.9], yBase: ROOF_Y, M, P: M.paint, D: M.dark, unit, rnd };
    unit.mountWeapon = (id) => mountWeapon(weaponCtx, id);
    unit.setTopAttack = (on) => setTopAttack(unit, M, on);

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.rcwsTurret = null;

    let lastYaw = null;
    let scanTime = rnd() * 10;
    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        // kíp xe: xạ thủ (tư thế / nạp đạn thủ công / thương vong) + ống phóng tên lửa nạp kiểu TOW — vehicle_crew.js
        if (u.crew && typeof VehicleCrew !== 'undefined') VehicleCrew.animate(u, dt);
        const yaw = u.group.rotation.y;
        let dYaw = lastYaw === null ? 0 : yaw - lastYaw;
        lastYaw = yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const v = u.isDead ? 0 : (u.speed || 0);
        const dl = v * dt - dYaw * WHEEL_X;
        const dr = v * dt + dYaw * WHEEL_X;
        wheels.steerAngle = Math.max(-0.55, Math.min(0.55, (u.currentSteer || 0) * 1.3));
        wheels.roll(dl, dr);
        if (!u.isDead) {
          scanTime += dt;
          sensor.head.rotation.y = Math.sin(scanTime * 0.4) * 1.2;
        }
        // vũ khí chính trên chân đế mô-đun: khối ngóc giật lùi rồi về, đầu đạn rocket trong ống theo số quả còn lại
        if (u.mainGun) {
          const G = u.mainGun;
          if (G.recoil) G.recoil.position.z *= Math.exp(-dt * 14);
          if (G.rounds) {
            // đang nạp lại giàn: đầu đạn hiện dần từng ống theo tiến độ nạp
            const left = u.reloadTimer > 0 && u.gatlingMag <= 0 ? Math.floor((1 - u.reloadTimer / Math.max(0.1, u.reloadDuration || 1)) * G.rounds.length) : u.gatlingMag;
            G.rounds.forEach((m, i) => { m.visible = i >= G.rounds.length - left; });
          }
        }
        // Nạp đạn súng máy: nòng ngóc lên, lật nắp khóa nòng, tháo hộp đạn rỗng, lắp hộp mới, đóng nắp
        const reloading = !u.isDead && u.gatlingMag <= 0 && u.reloadTimer > 0 && u.reloadDuration > 0;
        const pr = reloading ? 1 - u.reloadTimer / u.reloadDuration : 1;
        const seg = (a, b) => Math.max(0, Math.min(1, (pr - a) / (b - a)));
        const sm = x => x * x * (3 - 2 * x);
        const tilt = reloading ? sm(seg(0, 0.12)) * (1 - sm(seg(0.88, 1))) : 0;
        // súng đang lắp: 12.7 (mặc định) hoặc phóng lựu cầm tay trên cùng chốt (u._mgParts — nắp / hộp đạn riêng)
        const K = u._mgParts || mg;
        if (!u._mgParts) mg.barrel.rotation.x = 0.2 * tilt;
        // TRÌNH TỰ THAY ĐẠN (pr 0..1, khớp MG_KEYS bên vehicle_crew):
        //  0.08-0.20 lật nắp khóa nòng | 0.20-0.42 tháo hộp rỗng thả xuống khoang | 0.44-0.56 cúi xuống khoang móc hộp mới
        //  0.56-0.68 nhấc hộp lên qua lỗ nóc, đặt vào khay | 0.68-0.74 mở nắp hộp | 0.74-0.86 kéo dây đạn đặt vào khay nạp
        //  0.86-0.92 sập nắp khóa nòng | 0.93-1 kéo tay lên đạn
        K.cover.rotation.x = reloading ? -1.2 * sm(seg(0.08, 0.2)) * (1 - sm(seg(0.86, 0.92))) : 0;
        let off = 0, rz = 0, vis = true;
        if (reloading) {
          if (pr < 0.44) { off = sm(seg(0.2, 0.42)); rz = off * 0.7; vis = pr < 0.42; }
          else { off = 1 - sm(seg(0.5, 0.68)); rz = -off * 0.4; vis = pr > 0.5; }
        }
        K.ammo.position.set(K.ammo0.x - 0.9 * off, K.ammo0.y - 3.2 * off, K.ammo0.z + 0.3 * off);
        K.ammo.rotation.z = rz;
        K.ammo.visible = vis;
        if (K.ammoLid) {
          // nắp hộp: hộp cũ đang mở (dây đạn đã kéo hết); hộp mới đóng tới lúc xạ thủ lật ra
          const lidOpen = !reloading ? 1 : pr < 0.44 ? 1 : sm(seg(0.68, 0.74));
          K.ammoLid.rotation.z = 1.9 * lidOpen;
          // dây đạn: số mắt xích hiện theo đoạn đã kéo vào súng; đầu dây (cho tay xạ thủ bám)
          const feed = !reloading ? 1 : pr < 0.2 ? 1 : pr < 0.74 ? 0 : sm(seg(0.74, 0.86));
          const n = K.links.length, shown = Math.round(feed * n);
          K.links.forEach((l, i) => { l.visible = i < shown; });
          K.beltTip = K.beltPts.getPointAt(Math.max(0, Math.min(1, feed)));
        }
        // Chớp lửa đầu nòng súng máy (spg.js đặt gatlingShotFlash = 1 mỗi phát)
        let f = u.gatlingShotFlash || 0;
        if (u.isDead) f = 0;
        if (f > 0.02) {
          if (f >= 0.999) {
            const k = 0.7 + Math.random() * 0.6;
            mg.flash.scale.set(k, k, 0.8 + Math.random() * 0.5);
            mg.flash.rotation.z = Math.random() * Math.PI;
          }
          mg.flash.visible = true;
          mg.flashMat.opacity = Math.min(1, f) * (u.stealthAlpha !== undefined ? u.stealthAlpha : 1);
          mg.flashMat.depthWrite = false;
          u.gatlingShotFlash = f * Math.exp(-dt * 30);
        } else {
          mg.flash.visible = false;
          u.gatlingShotFlash = 0;
        }
      }
    };
    return { hullW: HALF_W * 2 };
  }

  // Cắt vát góc đa giác [x, z]: mỗi đỉnh thay bằng 2 đỉnh lùi k đơn vị theo hai cạnh kề (góc đứng thân xe vát chéo)
  function cutCorners(pts, k) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      out.push([p[0] + (a[0] - p[0]) * k / la, p[1] + (a[1] - p[1]) * k / la]);
      out.push([p[0] + (b[0] - p[0]) * k / lb, p[1] + (b[1] - p[1]) * k / lb]);
    }
    return out;
  }

  function archPoints(cz, r, yCut) {
    const a0 = Math.asin(Math.max(-1, Math.min(1, (yCut - WHEEL_Y) / r)));
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const a = a0 + (Math.PI - 2 * a0) * (i / 9);
      pts.push([cz + r * Math.cos(a), WHEEL_Y + r * Math.sin(a)]);
    }
    return pts;
  }

  // ===========================================================================
  // THÂN XE: KHOANG MÁY TRƯỚC + CABIN HỘP BỌC GIÁP
  // ===========================================================================
  function buildBody(chassis, M, unit, rnd) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;
    const AR = 4.7;

    // Thân dưới (sườn + đuôi), khoét 2 hốc bánh
    hb.add(VehicleKit.sideProfile([
      [-14.6, 9.8], [17.6, 9.8], [18.2, 9.0], [18.0, 5.0],
      ...archPoints(AXLES[1].z, AR, 5.0),
      ...archPoints(AXLES[0].z, AR, 5.2),
      [-16.0, 5.2], [-16.0, 9.0]
    ], HALF_W * 2, 0.22), P);
    for (const a of AXLES) hb.box(10.6, 5.0, 9.2, D, [0, 7.6, a.z]);
    // Gầm thép + giá đỡ
    hb.box(11.2, 0.8, 30, M.paintDusty, [0, 4.6, 1.0]);

    // Khoang máy phía trước: nắp máy dốc lên về phía kính
    hb.add(VehicleKit.sideProfile([
      [-18.4, 5.6], [-18.6, 8.6], [-17.6, 10.6], [CAB_FRONT + 0.4, 11.6], [CAB_FRONT + 0.4, 8.6], [-16.0, 5.6]
    ], HOOD_HALF * 2, 0.5), P);
    // Lưới tản nhiệt nan ngang ở mặt trước (dốc)
    const grillA = Math.atan2(1.0, 2.0);
    for (let i = 0; i < 7; i++) {
      const y = 8.75 + i * 0.27;
      hb.box(HOOD_HALF * 2 - 2.6, 0.12, 0.4, D, [0, y, -18.62 + i * 0.135], [grillA, 0, 0]);
    }
    for (let i = 0; i < 9; i++) hb.box(HOOD_HALF * 2 - 2.4, 0.16, 0.28, M.paintDusty, [0, 5.9 + i * 0.32, -18.66]);
    // Nắp thăm máy + đường ghép trên nắp
    hb.box(9.6, 0.06, 0.14, D, [0, 11.02, -14.0], [-0.12, 0, 0]);
    hb.box(0.14, 0.06, 7.2, D, [0, 11.15, -13.6], [-0.12, 0, 0]);

    // Vè trước loe ôm bánh (tấm sườn + viền cao su)
    for (const s of [-1, 1]) {
      const fender = [];
      const fz = AXLES[0].z;
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * 0.08 + Math.PI * 0.84 * (i / 10);
        fender.push([fz + (AR + 0.5) * Math.cos(a), WHEEL_Y + (AR + 0.5) * Math.sin(a)]);
      }
      for (let i = 10; i >= 0; i--) {
        const a = Math.PI * 0.08 + Math.PI * 0.84 * (i / 10);
        fender.push([fz + (AR - 0.1) * Math.cos(a), WHEEL_Y + (AR - 0.1) * Math.sin(a)]);
      }
      hb.add(VehicleKit.sideProfile(fender, 2.2, 0.08), P, [s * (HALF_W - 0.4), 0, 0]);
      hb.box(2.4, 0.5, 4.2, P, [s * (HALF_W - 0.6), 10.0, fz - 2.6]);
      // Khối vè ngang nối nắp máy
      hb.box(HALF_W - HOOD_HALF + 0.6, 1.2, 8.6, P, [s * ((HALF_W + HOOD_HALF) / 2), 9.6, fz]);
      // Vè sau bằng cao su
      hb.add(new THREE.TorusGeometry(AR + 0.15, 0.3, 6, 14, Math.PI * 0.84), M.rubber,
        [s * (HALF_W + 0.04), WHEEL_Y, AXLES[1].z], [0, Math.PI / 2, Math.PI * 0.08]);
    }

    // Đèn pha trên đầu vè có khung bảo vệ + đèn xi-nhan
    for (const s of [-1, 1]) {
      const x = s * 6.6, z = -17.2, y = 10.9;
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(2.2, 1.6, 1.4, D, [x, y, z]);
      hb.cyl(0.5, 0.5, 0.2, 14, (s < 0 ? M.headLensL : M.headLensR) || M.lens, [x, y + 0.05, z - 0.75], 'z');
      hb.box(0.5, 0.35, 0.15, M.amberLens || M.tailLens, [x + s * 0.75, y - 0.4, z - 0.72]);
      // Khung lồng đèn
      hb.box(2.8, 0.16, 0.16, D, [x, y + 1.0, z - 1.2]);
      hb.box(2.8, 0.16, 0.16, D, [x, y - 0.9, z - 1.2]);
      for (const dx of [-1.3, 0, 1.3]) hb.box(0.14, 2.0, 0.14, D, [x + dx, y + 0.05, z - 1.25]);
      hb.box(0.16, 0.16, 1.4, D, [x - 1.3, y + 1.0, z - 0.5]);
      hb.box(0.16, 0.16, 1.4, D, [x + 1.3, y + 1.0, z - 0.5]);
      // Gương chiếu hậu trên cần cao ở góc trước
      hb.setTag('mirror' + (s < 0 ? 'L' : 'R'));
      hb.box(0.25, 3.6, 0.25, D, [s * 8.0, 12.8, -15.6]);
      hb.box(0.25, 0.25, 1.4, D, [s * 8.0, 14.6, -16.2]);
      hb.box(0.4, 2.0, 1.0, D, [s * 8.0, 15.3, -16.9]);
      hb.box(0.08, 1.7, 0.8, M.mirror || M.glass, [s * 8.22, 15.3, -16.9]);
      hb.setTag(null);
    }
    // Cản trước, móc kéo, biển số trắng
    hb.box(13.4, 1.4, 1.2, D, [0, 6.0, -18.8]);
    for (const s of [-1, 1]) {
      hb.add(new THREE.TorusGeometry(0.55, 0.16, 6, 12, Math.PI * 1.3), M.steel, [s * 4.6, 5.2, -19.3], [0, Math.PI / 2, Math.PI * 0.85]);
    }
    hb.box(4.2, 1.2, 0.12, M.plate, [0, 6.0, -19.45]);

    // Cản ủi ống thép trước mũi + tời kéo có cáp quấn, móc tời gác lên cản
    hb.setTag('bullbar');
    const bar = (a, b) => hb.strut(a, b, 0.22, D, 8);
    for (const s of [-1, 1]) {
      bar([s * 5.6, 5.4, -19.4], [s * 5.6, 9.4, -19.9]);
      bar([s * 5.6, 9.4, -19.9], [s * 2.2, 10.0, -19.7]);
      bar([s * 5.6, 5.4, -19.4], [s * 5.6, 5.6, -18.6]);
    }
    bar([-2.2, 10.0, -19.7], [2.2, 10.0, -19.7]);
    bar([-5.6, 7.6, -19.65], [5.6, 7.6, -19.65]);
    hb.box(4.6, 1.3, 1.1, D, [0, 6.9, -19.25]);
    hb.cyl(0.55, 0.55, 2.6, 12, M.steel, [0, 6.9, -19.4], 'x');
    for (let i = -3; i <= 3; i++) hb.cyl(0.6, 0.6, 0.08, 10, D, [i * 0.36, 6.9, -19.4], 'x');
    hb.add(new THREE.TorusGeometry(0.32, 0.1, 5, 10), M.steel, [0.6, 8.0, -19.95]);
    hb.strut([0.4, 7.2, -19.9], [0.6, 7.7, -19.95], 0.06, M.steel, 5);

    for (const s of [-1, 1]) {
      // Tấm thoát lầy (sand channel) kẹp dọc sườn dưới giữa hai bánh, 2 đai giữ
      hb.setTag('sand' + (s < 0 ? 'L' : 'R'));
      const sx = s * (HALF_W + 0.2);
      hb.box(0.22, 1.5, 7.6, M.paintDusty, [sx, 7.4, -0.4]);
      for (let i = 0; i < 7; i++) hb.box(0.26, 0.9, 0.3, D, [sx + s * 0.02, 7.4, -3.6 + i * 1.07]);
      for (const z of [-2.6, 1.8]) hb.box(0.4, 1.8, 0.32, M.steel, [sx + s * 0.08, 7.4, z]);
      // Tấm chắn bùn cao su sau bánh sau
      hb.setTag('flap' + (s < 0 ? 'L' : 'R'));
      hb.box(TIRE_W + 0.2, 2.6, 0.12, M.rubber, [s * WHEEL_X, 3.6, AXLES[1].z + WHEEL_R + 1.4], [0.08, 0, 0]);
      // Tấm chắn bùn cao su sau bánh trước: treo dưới thân ngay sau đuôi vè, lùi xa hơn bánh sau để bánh đánh lái không quệt;
      // thanh kẹp thép ở mép trên
      hb.setTag('flapF' + (s < 0 ? 'L' : 'R'));
      const ffz = AXLES[0].z + WHEEL_R + 1.6;
      hb.box(TIRE_W + 0.2, 2.6, 0.12, M.rubber, [s * WHEEL_X, 3.8, ffz], [0.08, 0, 0]);
      hb.box(TIRE_W + 0.3, 0.32, 0.22, M.steel, [s * WHEEL_X, 4.95, ffz - 0.06]);
    }
    hb.setTag(null);

    // Cabin hộp: mặt kính dốc nhẹ, sườn hơi vát vào trong, 4 góc đứng cắt vát
    hb.add(VehicleKit.loft(
      cutCorners([[-HALF_W, CAB_FRONT], [HALF_W, CAB_FRONT], [HALF_W, 17.6], [-HALF_W, 17.6]], 0.7),
      cutCorners([[-7.4, -6.9], [7.4, -6.9], [7.4, 17.0], [-7.4, 17.0]], 0.7),
      9.7, ROOF_Y, CAB_CH
    ), P);

    // Kính chắn gió 2 tấm phẳng + khung giữa + gạt mưa (nằm đúng trên mặt dốc của cabin)
    const CAB_TOP = -6.9, CAB_BASE_Y = 9.7;
    const slope = (CAB_TOP - CAB_FRONT) / (ROOF_Y - CAB_BASE_Y);
    const wsA = Math.atan(slope);
    const nY = Math.sin(wsA), nZ = -Math.cos(wsA);           // pháp tuyến hướng ra trước-lên
    const onFace = (y, out) => [y + nY * out, CAB_FRONT + (y - CAB_BASE_Y) * slope + nZ * out];
    for (const s of [-1, 1]) {
      const [gy, gz] = onFace(13.15, 0.08);
      hb.box(6.1, 3.1, 0.1, (s < 0 ? M.glassWindL : M.glassWindR) || M.glass, [s * 3.55, gy, gz], [wsA, 0, 0]);
      const [ty, tz] = onFace(14.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, ty, tz], [wsA, 0, 0]);
      const [by, bz] = onFace(11.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, by, bz], [wsA, 0, 0]);
      // Gạt mưa nằm trên kính, chốt ở mép trên
      const [wy, wz] = onFace(13.4, 0.2);
      hb.box(0.14, 2.9, 0.12, D, [s * 3.1, wy, wz], [wsA, 0, s * 0.55]);
    }
    const [py, pz] = onFace(13.2, 0.14);
    hb.box(0.7, 3.4, 0.24, P, [0, py, pz], [wsA, 0, 0]);

    // 4 cửa: viền cửa, ô kính nhỏ, bản lề tròn lộ, tay nắm, bậc lên
    for (const s of [-1, 1]) {
      const x = s * (HALF_W - 0.05);
      const sideA = Math.atan2(0.6, ROOF_Y - 9.7);
      for (const [z0, z1] of [[-6.6, 0.4], [0.8, 7.8]]) {
        const zc = (z0 + z1) / 2;
        hb.box(0.1, 4.9, 0.14, D, [x, 12.2, z0], [0, 0, s * sideA]);
        hb.box(0.1, 4.9, 0.14, D, [x, 12.2, z1], [0, 0, s * sideA]);
        hb.box(0.1, 0.14, z1 - z0, D, [s * (HALF_W - (14.55 - 9.7) * (0.6 / 5.7) + 0.05), 14.55, zc]);
        hb.box(0.1, 0.14, z1 - z0, D, [x + s * 0.05, 9.85, zc]);
        // Ô kính nhỏ + khung
        hb.box(0.12, 1.9, 2.4, M.glassDusty || M.glass, [x + s * 0.04 - s * 0.12, 13.6, zc - 0.6], [0, 0, s * sideA]);
        hb.box(0.14, 2.3, 0.18, P, [x + s * 0.06 - s * 0.12, 13.6, zc - 2.0], [0, 0, s * sideA]);
        hb.box(0.14, 2.3, 0.18, P, [x + s * 0.06 - s * 0.12, 13.6, zc + 0.8], [0, 0, s * sideA]);
        // Bản lề (2 cái) ở mép trước cửa + tay nắm ở mép sau
        for (const y of [11.0, 13.8]) hb.cyl(0.38, 0.38, 0.35, 10, P, [x + s * 0.2, y, z0 + 0.5], 'x');
        hb.box(0.3, 0.3, 1.2, M.steel, [x + s * 0.18, 12.2, z1 - 1.0]);
      }
      hb.box(2.2, 0.3, 4.4, D, [s * 7.6, 5.2, 0.6]);
      // Nắp bình nhiên liệu tròn + hộp phụ kiện sau cửa
      hb.cyl(0.6, 0.6, 0.3, 12, D, [x + s * 0.12, 12.0, 11.8], 'x');
      hb.setTag('box' + (s < 0 ? 'L' : 'R'));
      hb.box(0.6, 2.2, 3.2, P, [x + s * 0.3, 11.2, 14.8]);
      hb.setTag(null);
    }

    // Đuôi xe: cửa sau, đèn hậu, can nhiên liệu, móc kéo
    hb.box(7.0, 4.6, 0.25, P, [0, 12.2, 17.7]);
    hb.box(7.2, 0.1, 0.3, D, [0, 14.6, 17.72]);
    hb.box(0.3, 1.2, 0.3, M.steel, [2.6, 12.0, 17.9]);
    for (const s of [-1, 1]) {
      hb.box(1.4, 0.9, 0.35, D, [s * 6.6, 8.6, 18.1]);
      hb.box(0.55, 0.45, 0.1, M.tailLens, [s * 6.9, 8.65, 18.3]);
      hb.setTag('can' + (s < 0 ? 'L' : 'R'));
      hb.jerrycan([s * 5.4, 12.0, 18.33], Math.PI / 2, 0.95, 2.9, 2.1, P, D);
      hb.box(2.3, 0.2, 0.08, D, [s * 5.4, 11.3, 18.84]);
      hb.setTag(null);
    }
    hb.box(1.8, 1.0, 1.0, D, [0, 6.0, 18.4]);
    hb.cyl(0.36, 0.36, 1.8, 10, D, [-6.0, 5.4, 17.6], 'z');
    unit.exhaustLeft = new THREE.Object3D();
    unit.exhaustLeft.position.set(-6.0, 5.4, 18.7);
    unit.exhaustRight = new THREE.Object3D();
    unit.exhaustRight.position.set(-5.8, 5.6, 18.5);
    chassis.add(unit.exhaustLeft);
    chassis.add(unit.exhaustRight);

    // Lan can ống quanh nóc sau (như xe mẫu)
    const rail = (a, b) => hb.strut(a, b, 0.18, D, 6);
    const RY = ROOF_Y + 1.6;
    for (const s of [-1, 1]) {
      hb.setTag('rail' + (s < 0 ? 'L' : 'R'));
      rail([s * 6.4, ROOF_Y, 6.6], [s * 6.4, RY, 7.2]);
      rail([s * 6.4, ROOF_Y, 15.9], [s * 6.4, RY, 15.6]);
      rail([s * 6.4, RY, 7.2], [s * 6.4, RY, 15.6]);
      rail([s * 6.4, ROOF_Y, 11.4], [s * 6.4, RY, 11.4]);
    }
    hb.setTag('railRear');
    rail([-6.4, RY, 15.6], [6.4, RY, 15.6]);
    hb.setTag(null);
    // Nóc: đường ghép, ống phóng lựu đạn khói, bệ ăng-ten
    hb.box(13.4, 0.06, 0.12, D, [0, ROOF_Y + 0.03, -2.0]);
    for (const s of [-1, 1]) {
      hb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      for (let i = 0; i < 3; i++) hb.cyl(0.32, 0.32, 1.3, 10, D, [s * 6.5, ROOF_Y + 0.45, -5.6 + i * 0.8], 'y', [0.45, 0, -s * 0.7]);
      hb.setTag(null);
    }
    const antennas = [[-6.2, -5.4], [-6.2, 15.9], [6.2, 15.9]];
    const ant = new VehicleKit.AntennaSet(D, chassis);
    for (const [ax, az] of antennas) {
      hb.cyl(0.38, 0.45, 0.8, 8, D, [ax, ROOF_Y + 0.4, az]);
      ant.add([ax, ROOF_Y + 0.8, az], 17, { tilt: [0.08, 0], r0: 0.085, r1: 0.04 });
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // --- Chi tiết bề mặt: bu-lông viền nóc, mối hàn mép nóc, đường ghép tấm, móc cẩu, nắp thông gió ---
    for (const s of [-1, 1]) {
      hb.boltRow([s * (7.4 - CAB_CH - 0.4), ROOF_Y, -3.2], [s * (7.4 - CAB_CH - 0.4), ROOF_Y, 15.9], 12, 'y', D, 0.13);
      // mối hàn theo đường gãy nóc phẳng - dải vát mép
      hb.weld([s * (7.4 - CAB_CH), ROOF_Y + 0.02, -6.9 + CAB_CH], [s * (7.4 - CAB_CH), ROOF_Y + 0.02, 17.0 - CAB_CH], P, 0.1);
      for (const z of [-1.0, 14.6]) {
        hb.box(0.8, 0.28, 0.5, P, [s * 5.6, ROOF_Y + 0.12, z]);
        hb.add(new THREE.TorusGeometry(0.4, 0.13, 5, 10), M.steel, [s * 5.6, ROOF_Y + 0.42, z], [0, Math.PI / 2, 0]);
      }
      // Sườn sau cửa: đường ghép dọc + bu-lông tấm giáp
      const fx = (y) => s * (HALF_W - (y - 9.7) * (0.6 / 5.7) + 0.03);
      hb.seam([fx(10.2), 10.2, 9.0], [fx(14.8), 14.8, 9.0], [s, 0, 0], D);
      const bx = s * (HALF_W - (14.6 - 9.7) * (0.6 / 5.7));
      hb.boltRow([bx, 14.6, 9.6], [bx, 14.6, 16.6], 6, 'x', D, 0.13, s, [0, 0, s * Math.atan2(0.6, 5.7)]);
    }
    hb.seam([-6.7, ROOF_Y + 0.02, 9.2], [6.7, ROOF_Y + 0.02, 9.2], [0, 1, 0], D);
    hb.seam([0, ROOF_Y + 0.02, -6.2], [0, ROOF_Y + 0.02, -2.1], [0, 1, 0], D);
    // Nắp thông gió hộp có lá chớp trên nóc sau
    hb.box(3.0, 0.5, 2.4, P, [-2.6, ROOF_Y + 0.25, 13.0]);
    for (let i = 0; i < 4; i++) hb.box(2.6, 0.08, 0.32, D, [-2.6, ROOF_Y + 0.52, 12.2 + i * 0.52], [0.5, 0, 0]);
    // Cửa sau: bản lề + bu-lông viền
    hb.hinge([-3.75, 12.2, 17.86], 'y', 3.8, P, 0.22);
    hb.boltRow([-3.0, 14.25, 17.83], [3.0, 14.25, 17.83], 6, 'z', D, 0.12, 1);
    // Nắp máy: hàng bu-lông mép nắp thăm
    hb.boltRow([-4.6, 11.0, -13.9], [4.6, 11.0, -13.9], 7, 'y', D, 0.12, 1, [-0.12, 0, 0]);

    const meshes = hb.build(chassis, [0, 10, 0]);
    unit.hullMainMesh = meshes.get(P);

    // Biển số + số hiệu chiến thuật
    const plate = VehicleKit.createStencilDecal(`0${1 + Math.floor(rnd() * 8)}-${1000 + Math.floor(rnd() * 8999)}`, 3.9, 1.0, 'rgba(25,60,35,0.95)');
    if (plate) { plate.position.set(0, 6.0, -19.53); plate.rotation.y = Math.PI; chassis.add(plate); }
    const tac = `${1 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const d = VehicleKit.createStencilDecal(tac, 2.6, 1.0);
      if (d) { d.position.set(s * (HALF_W + 0.04), 8.2, 14.6); d.rotation.y = s * Math.PI / 2; chassis.add(d); }
    }
  }

  // Lathe quanh trục đứng, UV chiếu từ trên xuống (đơn vị thế giới) -> vân sơn / bùn liền mạch trên mặt vành
  function latheTopUV(points, seg) {
    const smoothPts = new THREE.SplineCurve(points).getPoints(points.length * 3);
    const geo = new THREE.LatheGeometry(smoothPts, seg).toNonIndexed();
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * VehicleKit.UV_SCALE, pos.getZ(i) * VehicleKit.UV_SCALE + pos.getY(i) * 0.02);
    geo.userData.customUV = true;
    return geo;
  }

  // Mặt vành thép lòng chảo (trục Y, mặt ngoài hướng +Y): mép vành cuộn, thành chảo lõm, mặt bắt bu-lông, moay-ơ
  function rimFaceGeo(bead, H) {
    return latheTopUV([
      [bead + 0.26, H * 0.74], [bead + 0.24, H * 0.9], [bead + 0.02, H * 0.95], [bead - 0.12, H * 0.8],
      [bead - 0.3, H * 0.45], [bead - 0.5, H * 0.32], [1.3, H * 0.32], [1.2, H * 0.4], [1.08, H * 0.56], [0.8, H * 0.6]
    ].map(([r, y]) => new THREE.Vector2(r, y)), 30);
  }

  // Lốp từ VehicleKit.tireGeometry; không có vật liệu lốp riêng thì trụ cao su đơn giản
  function tireGeos(opts, M) {
    if (M.tire && M.tire !== M.rubber) return VehicleKit.tireGeometry(opts);
    return [new THREE.CylinderGeometry(opts.R + opts.lugH, opts.R + opts.lugH, opts.H * 2, 24)];
  }

  // ===========================================================================
  // HỆ TREO ĐỘC LẬP TAY ĐÒN KÉP: tay đòn trên/dưới, giảm chấn lò xo trụ, bán trục, vi sai, các-đăng
  // ===========================================================================
  function buildSuspension(chassis, M) {
    const b = new VehicleKit.PartBatch(0);
    const D = M.dark;
    for (const a of AXLES) {
      for (const s of [-1, 1]) {
        const hubX = s * (WHEEL_X - TIRE_W / 2 - 0.35), z = a.z;
        // Tay đòn chữ A dưới + tay đòn trên ngắn hơn, mỗi tay 2 nhánh về khung
        for (const dz of [-1.1, 1.1]) {
          b.strut([s * 3.4, 2.6, z + dz], [hubX, 2.9, z], 0.2, D, 6);
          b.strut([s * 3.9, 5.6, z + dz * 0.8], [hubX, 5.2, z], 0.16, D, 6);
        }
        b.box(0.7, 3.2, 1.0, M.steel, [hubX, 4.0, z]);
        // Bán trục + chụp cao su chống bụi
        b.cyl(0.24, 0.24, Math.abs(hubX) - 1.6, 8, M.steel, [(hubX + s * 1.6) / 2, WHEEL_Y, z], 'x');
        b.cyl(0.42, 0.3, 0.7, 10, M.rubber, [hubX - s * 0.5, WHEEL_Y, z], 'x');
        // Giảm chấn lò xo trụ nghiêng lên tai bắt trên khung
        const p0 = [s * 4.8, 3.1, z + 0.4], p1 = [s * 3.8, 8.6, z + 0.6];
        b.strut(p0, p1, 0.22, M.steel, 8);
        for (let i = 1; i < 9; i++) {
          const t = 0.12 + i * 0.085;
          b.add(new THREE.TorusGeometry(0.42, 0.08, 4, 10), M.paintDusty,
            [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t],
            [Math.PI / 2, 0, s * 0.18]);
        }
        b.box(1.2, 0.6, 1.2, D, [s * 3.8, 8.9, z + 0.6]);
      }
      // Bộ vi sai giữa cầu + thanh cân bằng ngang
      b.box(3.0, 2.2, 2.6, D, [0, WHEEL_Y, a.z]);
      b.cyl(0.18, 0.18, 7.2, 8, D, [0, 2.2, a.z + (a.steer ? 2.0 : -2.0)], 'x');
    }
    b.cyl(0.32, 0.32, AXLES[1].z - AXLES[0].z - 2.6, 10, M.steel, [0, WHEEL_Y, (AXLES[0].z + AXLES[1].z) / 2], 'z');
    b.build(chassis);
  }

  // ===========================================================================
  // ĐỒ CHẰNG TRÊN NÓC SAU (trong lan can): hòm đạn, cuộn bạt, bó lưới ngụy trang, xẻng
  // ===========================================================================
  function buildStowage(chassis, M, rnd) {
    const b = new VehicleKit.PartBatch(ROOF_Y);
    const Y = ROOF_Y, D = M.dark;
    b.setTag('stowage');
    for (const z of [8.4, 10.9]) {
      const h = 1.5;
      b.box(2.4, h, 2.2, M.paint, [4.0, Y + h / 2, z], [0, (rnd() - 0.5) * 0.1, 0]);
      b.box(2.5, 0.2, 2.3, M.paint, [4.0, Y + h + 0.1, z]);
      b.box(0.9, 0.12, 0.2, M.steel, [4.0, Y + h + 0.28, z]);
      b.box(0.04, 0.5, 0.7, M.canvas, [5.22, Y + h * 0.5, z]);
    }
    // Cuộn bạt ngang sát lan can sau, phồng xẹp không đều, 3 dây chằng
    const tz = 14.9, ty = Y + 0.9;
    for (let i = 0; i < 5; i++) {
      const r = 0.82 + rnd() * 0.12;
      b.cyl(r, r * 0.95, 2.24, 12, M.canvasDark, [-5.6 + i * 2.24 + 1.12, ty, tz + (rnd() - 0.5) * 0.12], 'x');
    }
    for (const x of [-3.4, 0, 3.4]) b.add(new THREE.TorusGeometry(0.9, 0.07, 4, 14), D, [x, ty, tz], [0, Math.PI / 2, 0]);
    for (const x of [-5.62, 5.62]) b.cyl(0.6, 0.6, 0.1, 12, M.canvas, [x, ty, tz], 'x');
    // Bó lưới ngụy trang bẹp phía trái + 2 dây chằng
    b.box(3.2, 1.0, 4.4, M.canvas, [-4.4, Y + 0.5, 9.4], [0, 0.06, 0.03]);
    b.box(3.0, 0.5, 3.6, M.canvasDark, [-4.3, Y + 1.15, 9.5], [0.05, -0.08, 0]);
    for (const z of [8.2, 10.6]) b.beam([-6.0, Y + 1.2, z], [-2.8, Y + 1.45, z], 0.4, 0.06, D);
    // Xẻng kẹp dọc lan can trái
    b.strut([-6.85, Y + 1.0, 7.0], [-6.85, Y + 1.0, 12.4], 0.14, M.wood || M.dark, 6);
    b.box(0.1, 1.3, 1.6, M.paintDusty, [-6.85, Y + 1.0, 13.3]);
    b.build(chassis);
  }

  // Bánh dự phòng trên giá bắt vào cửa sau (đứng, hông ngoài quay ra sau)
  function buildSpareWheel(chassis, M) {
    const g = new THREE.Group();
    const H = TIRE_W / 2;
    g.position.set(0, 12.6, 17.95 + H + 0.35);
    g.rotation.set(Math.PI / 2, 0, 0);
    chassis.add(g);
    const b = new VehicleKit.PartBatch(0);
    b.setTag('spare');
    for (const geo of tireGeos({ R: WHEEL_R - TIRE_LUG, H, bead: TIRE_BEAD, lugH: TIRE_LUG, seed: 29 }, M)) b.add(geo, M.tire || M.rubber, [0, 0, 0], [0, 0.4, 0]);
    b.cyl(TIRE_BEAD + 0.02, TIRE_BEAD + 0.02, H * 1.6, 28, M.rim, [0, 0, 0], 'y', null, true);
    b.add(rimFaceGeo(TIRE_BEAD, H), M.rim, [0, 0, 0]);
    b.cyl(0.75, 0.85, 0.5, 12, M.steel, [0, H * 0.6 + 0.2, 0]);
    b.box(3.0, 0.22, 0.7, M.dark, [0, H * 0.6 + 0.5, 0]);
    b.cyl(0.3, 0.3, 0.3, 6, M.steel, [0, H * 0.6 + 0.75, 0]);
    for (const x of [-1.6, 1.6]) b.box(0.4, H * 2 + 0.6, 0.4, M.dark, [x, -0.3, 0]);
    b.build(g);
  }

  // ===========================================================================
  // 4 BÁNH LỐP LỚN, VÀNH THÉP ĐEN
  // ===========================================================================
  function buildWheels(chassis, M) {
    const positions = [];
    for (const a of AXLES) for (const s of [-1, 1]) positions.push({ x: s * WHEEL_X, y: WHEEL_Y, z: a.z, steer: a.steer });
    return new VehicleKit.WheelSet(chassis, (b) => {
      const hw = TIRE_W / 2;
      // Lốp địa hình mặt cắt thật, gai đúc liền (trục Y xoay thành X)
      for (const geo of tireGeos({ R: WHEEL_R - TIRE_LUG, H: hw, bead: TIRE_BEAD, lugH: TIRE_LUG, seed: 17 }, M)) {
        geo.rotateZ(-Math.PI / 2);
        b.add(geo, M.tire || M.rubber, [0, 0, 0]);
      }
      // Vành thép lòng chảo, moay-ơ giảm tốc, đai ốc, van bơm hơi trung tâm + ống dẫn hơi ra mép vành
      b.cyl(TIRE_BEAD + 0.02, TIRE_BEAD + 0.02, TIRE_W * 0.82, 24, M.rim, [0, 0, 0], 'x', null, true);
      const face = rimFaceGeo(TIRE_BEAD, hw);
      face.rotateZ(-Math.PI / 2);
      b.add(face, M.rim, [0, 0, 0]);
      b.cyl(0.95, 1.05, 1.4, 14, M.rim, [hw - 0.1, 0, 0], 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cyl(0.15, 0.15, 0.3, 6, M.steel, [hw * 0.32 + 0.15, Math.cos(a) * 1.5, Math.sin(a) * 1.5], 'x');
      }
      b.cyl(0.4, 0.4, 0.7, 10, M.rim, [hw + 0.65, 0, 0], 'x');
      b.beam([hw + 0.5, 0.25, 0], [hw * 0.9, 2.1, 0.4], 0.14, 0.14, M.dark);
    }, positions, WHEEL_R);
  }

  // ===========================================================================
  // CẢM BIẾN GIÁM SÁT XOAY TRÊN NÓC SAU (radar trinh sát)
  // ===========================================================================
  function buildRoofSensor(chassis, M, unit) {
    const base = new THREE.Group();
    base.position.set(-3.6, ROOF_Y, 12.6);
    chassis.add(base);
    const mb = new VehicleKit.PartBatch(ROOF_Y);
    mb.box(1.6, 0.8, 1.6, M.dark, [0, 0.4, 0]);
    mb.cyl(0.32, 0.32, 3.2, 10, M.steel, [0, 2.4, 0]);
    mb.build(base);
    const head = new THREE.Group();
    head.position.set(0, 4.2, 0);
    const hb = new VehicleKit.PartBatch(ROOF_Y + 4.2);
    hb.box(1.6, 1.1, 1.3, M.paint, [0, 0, 0]);
    hb.cyl(0.32, 0.32, 0.2, 12, M.glass, [-0.35, 0.05, -0.7], 'z');
    hb.cyl(0.22, 0.22, 0.2, 12, M.glass, [0.38, 0.05, -0.7], 'z');
    hb.build(head);
    base.add(head);
    const radar = new THREE.Group();
    radar.position.set(0, 5.1, 0);
    const rb = new VehicleKit.PartBatch(ROOF_Y + 5.1);
    // Ăng-ten radar mảng phẳng giám sát mặt đất: quay tròn liên tục (góc quay = tia quét thật của radar)
    rb.cyl(0.3, 0.4, 0.5, 10, M.dark, [0, 0, 0]);                       // bàn xoay
    rb.cyl(0.14, 0.14, 0.7, 8, M.steel, [0, 0.55, 0]);                  // trục
    rb.box(5.0, 1.55, 0.3, M.paint, [0, 1.45, 0], [-0.2, 0, 0]);         // mặt anten ngả nhẹ lên trời
    rb.box(4.7, 1.3, 0.06, M.dark, [0, 1.47, -0.17], [-0.2, 0, 0]);      // mặt phát sóng
    for (let i = -2; i <= 2; i++) rb.box(0.05, 1.32, 0.02, M.steel, [i * 0.9, 1.47, -0.21], [-0.2, 0, 0]);
    rb.box(1.3, 0.75, 0.55, M.paint, [0, 1.3, 0.48]);                   // hộp thu phát phía sau
    rb.build(radar);
    base.add(radar);
    unit.radarDish = radar;
    VehicleKit.registerPartGroup(unit, 'sensor', base);
    return { head, radar };
  }

  // ===========================================================================
  // LỖ NÓC GẮN SÚNG MÁY HẠNG NẶNG CÓ TẤM CHẮN + ỐNG PHÓNG TÊN LỬA CHỐNG TĂNG
  // ===========================================================================
  function buildRingMount(chassis, M, unit) {
    const turret = new THREE.Group();
    turret.position.set(0, ROOF_Y, RING_Z);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(ROOF_Y);
    // Lỗ nóc cỡ người thật (Ø ~0.85 m, 8 đv = 1 m): vòng xoay có tay nắm, lòng lỗ tối; xạ thủ đứng giữa lỗ (HATCH_R)
    // vòng xoay 2 tầng (vòng đế bắt bu-lông vào nóc + vòng bi xoay trên), gioăng cao su mép lỗ, tay nắm xoay vòng
    tb.add(new THREE.TorusGeometry(HATCH_R + 0.35, 0.22, 6, 36), M.dark, [0, 0.12, 0], [Math.PI / 2, 0, 0]);
    tb.add(new THREE.TorusGeometry(HATCH_R + 0.05, 0.3, 8, 36), M.paint, [0, 0.42, 0], [Math.PI / 2, 0, 0]);
    tb.add(new THREE.TorusGeometry(HATCH_R - 0.22, 0.09, 6, 36), M.rubber || M.dark, [0, 0.62, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      tb.cyl(0.08, 0.08, 0.1, 6, M.dark, [Math.sin(a) * (HATCH_R + 0.45), 0.36, Math.cos(a) * (HATCH_R + 0.45)]);
    }
    for (const a of [1.2, 5.1]) {
      tb.box(0.18, 0.18, 0.9, M.dark, [Math.sin(a) * (HATCH_R - 0.1), 0.85, Math.cos(a) * (HATCH_R - 0.1)], [0, a + Math.PI / 2, 0]);
      tb.box(0.14, 0.4, 0.14, M.dark, [Math.sin(a) * (HATCH_R - 0.1), 0.65, Math.cos(a) * (HATCH_R - 0.1)]);
    }
    // bản lề nắp ở mép sau: 2 tai bản lề + thanh xoắn trợ lực, cữ chặn nắp khi mở
    tb.box(2.6, 0.2, 0.9, M.paint, [0, 0.42, HINGE_Z]);   // tấm đế bản lề
    for (const s of [-1, 1]) tb.box(0.4, 0.55, 0.6, M.dark, [s * 0.9, 0.65, HINGE_Z]);
    tb.cyl(0.13, 0.13, 2.6, 10, M.dark, [0, 0.85, HINGE_Z], 'x');
    tb.box(0.25, 0.5, 0.25, M.dark, [1.5, 0.7, HINGE_Z + 0.35]);   // cữ chặn nắp
    tb.build(turret);

    // LÒNG HỐ: nóc xe là khối đặc nên phải "khoét" bằng mặt nạ độ sâu: đĩa vô hình ngay trên mặt nóc đẩy độ sâu ra xa nhất
    // (xóa mặt nóc trong vòng lỗ), rồi vẽ ống khoang bên trong — nhìn qua lỗ thấy thành khoang, sàn, ghế treo, hộp đạn.
    // Thứ tự vẽ: nóc / xe (0) -> mặt nạ (1) -> lòng khoang (2) -> xạ thủ & đồ thò xuống lỗ (3)
    const holeR = HATCH_R - 0.25, DEPTH = 8.5;
    // mặt nạ STENCIL: đĩa vô hình trên miệng lỗ đánh dấu stencil = 1 ở những điểm ảnh nhìn thấy miệng lỗ (bị súng / tấm
    // chắn che thì không) -> lòng khoang chỉ vẽ trong vùng đó, không xét độ sâu (vẽ đè lên mặt nóc như thể nóc bị khoét)
    const holeGeo = new THREE.CircleGeometry(holeR, 32);
    const mask = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp
    }));
    mask.rotation.x = -Math.PI / 2; mask.position.y = 0.04; mask.renderOrder = 1;
    mask.userData.isFxDecal = true;
    turret.add(mask);
    // lượt 2: trong vùng stencil, xóa độ sâu về xa nhất (mặt nóc không còn che) -> lòng khoang & chân xạ thủ vẽ với độ
    // sâu bình thường, che khuất nhau đúng
    const clear = new THREE.Mesh(holeGeo, new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); gl_FragDepthEXT = 1.0; }',
      extensions: { fragDepth: true }, colorWrite: false, depthFunc: THREE.AlwaysDepth, transparent: true,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp
    }));
    // chạy ở lượt vẽ trong suốt (sau mọi lớp phủ / vết bẩn / decal trong suốt trên nóc) -> không bị lớp nào vẽ đè lại
    clear.rotation.x = -Math.PI / 2; clear.position.y = 0.04; clear.renderOrder = 10;
    clear.userData.isFxDecal = true;
    turret.add(clear);
    const pit = new THREE.Group();
    pit.renderOrder = 2;
    // thành khoang: tối dần xuống sâu (màu đỉnh theo độ sâu)
    const wallGeo = new THREE.CylinderGeometry(holeR, holeR, DEPTH, 28, 6, true);
    const wc = [], wp = wallGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) { const k = 0.3 * Math.pow((wp.getY(i) + DEPTH / 2) / DEPTH, 2.2) + 0.02; wc.push(k * 0.62, k * 0.66, k * 0.55); }
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    const pitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(wallGeo, pitMat);
    wall.position.y = -DEPTH / 2;
    pit.add(wall);
    const dark = new THREE.MeshStandardMaterial({ color: 0x151612, roughness: 1 });
    const inner = new THREE.MeshStandardMaterial({ color: 0x2c2e27, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(holeR, 28), dark);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -DEPTH + 0.02;
    pit.add(floor);
    // vành lót trong miệng lỗ (thép dày lộ ra) + vòng bu-lông
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(holeR + 0.01, holeR + 0.01, 0.7, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a4c40, roughness: 0.8, side: THREE.DoubleSide }));
    liner.position.y = -0.3;
    pit.add(liner);
    // ghế treo xạ thủ (đai vải căng ngang khoang), bậc đứng, hộp đạn & ống rocket dự phòng xếp đáy khoang, thùng bộ đàm
    const pk = new VehicleKit.PartBatch(ROOF_Y - 4);
    pk.box(holeR * 1.9, 0.12, 1.0, inner, [0, -4.6, 0.6]);
    pk.box(0.18, 0.18, holeR * 1.9, inner, [0, -5.0, -1.2]);
    pk.box(2.0, 0.25, 1.2, inner, [0.4, -6.3, -0.8]);
    pk.box(1.1, 1.0, 1.5, M.paint, [-1.6, -DEPTH + 0.5, 0.6]);
    pk.box(1.1, 1.0, 1.5, M.paint, [-1.5, -DEPTH + 1.5, 0.7], [0, 0.2, 0]);
    pk.cyl(0.45, 0.45, 3.2, 10, M.paint, [1.4, -DEPTH + 0.5, 0.2], 'z');
    pk.box(1.4, 1.3, 0.8, inner, [0.9, -2.4, holeR - 0.4]);
    pk.box(0.3, 0.3, 0.06, M.lens || dark, [0.6, -2.2, holeR - 0.82]);
    pk.build(pit);
    const stencilMat = (m) => { const c = m.clone(); Object.assign(c, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp, transparent: true, opacity: 1, depthWrite: true }); return c; };
    // thứ tự vẽ (không xét độ sâu): thành khoang -> đáy -> đồ đạc trong khoang -> vành lót miệng lỗ
    pit.traverse(o => {
      if (!o.isMesh) return;
      o.material = stencilMat(o.material);
      o.renderOrder = o === wall ? 11 : o === floor ? 11.1 : o === liner ? 11.3 : 11.2;
      o.castShadow = false; o.receiveShadow = false; o.userData.isFxDecal = true;
    });
    turret.add(pit);

    // NẮP LỖ NÓC: thép dày có gân chữ thập, gioăng mép, tay khóa xoay trong, quai nắm ngoài, kính tiềm vọng nhỏ.
    // Bản lề lùi hẳn ra sau vòng (2 tay đòn nối nắp -> trục bản lề trên tấm đế sau): mở dựng ra sau không đè lưng xạ
    // thủ / đồ sau lưng. Đóng khi xạ thủ ngồi hẳn trong xe (giàn rocket bắn từ trong), chỉ mở khi nhô lên — vehicle_crew
    const lid = new THREE.Group();
    lid.position.set(0, 0.85, HINGE_Z);
    const lb = new VehicleKit.PartBatch(ROOF_Y + 0.7);
    const LC = -HINGE_Z, R = HATCH_R - 0.1;
    // thân nắp: thép đúc dày, mặt ngoài hơi vồng, mép vát; mặt trong phẳng có gioăng cao su
    lb.cyl(R - 0.25, R, 0.22, 36, M.paint, [0, 0.11, LC]);
    lb.cyl(R - 0.7, R - 0.25, 0.14, 36, M.paint, [0, 0.29, LC]);
    lb.cyl(R, R - 0.08, 0.16, 36, M.paint, [0, -0.08, LC]);
    lb.add(new THREE.TorusGeometry(R - 0.35, 0.09, 6, 36), M.rubber || M.dark, [0, -0.17, LC], [Math.PI / 2, 0, 0]);   // gioăng
    // mặt ngoài: quai nắm chữ U gập, 4 đầu bu-lông bản lề, gờ chặn nước
    lb.box(0.16, 0.22, 1.1, M.dark, [-1.2, 0.46, LC - 0.6]);
    for (const z of [-1.1, -0.1]) lb.box(0.16, 0.22, 0.16, M.dark, [-1.2, 0.4, LC + z]);
    for (const x of [-1.1, -0.4, 0.4, 1.1]) lb.cyl(0.09, 0.09, 0.08, 8, M.dark, [x, 0.25, LC + R - 0.45]);
    // mặt trong: tay quay khóa trung tâm + 2 lẫy chốt chạy ra mép, tấm đệm đầu, móc giữ nắp mở
    lb.cyl(0.32, 0.32, 0.16, 16, M.dark, [0, -0.26, LC]);
    lb.box(2.0, 0.1, 0.22, M.dark, [0, -0.3, LC], [0, 0.4, 0]);
    for (const sx of [-1, 1]) lb.box(0.35, 0.16, 0.45, M.dark, [sx * Math.cos(0.4) * 1.15, -0.27, LC - sx * Math.sin(0.4) * 1.15]);
    lb.box(1.4, 0.12, 0.9, M.canvasDark || M.dark, [0.4, -0.24, LC + 1.0]);
    lb.box(0.3, 0.3, 0.2, M.dark, [0, -0.25, LC - R + 0.35]);
    // quai kéo chữ U mặt trong (xạ thủ nắm kéo sập nắp từ trong lỗ)
    lb.box(0.9, 0.1, 0.12, M.dark, [0, -0.5, LC * 0.45]);
    for (const x of [-0.42, 0.42]) lb.box(0.12, 0.32, 0.12, M.dark, [x, -0.36, LC * 0.45]);
    // 2 tai bản lề liền nắp
    for (const s of [-1, 1]) lb.box(0.45, 0.4, 0.7, M.dark, [s * 0.9, 0.0, -0.25]);
    lb.build(lid);
    turret.add(lid);
    unit.hatchLid = lid;
    lid.userData.open = LID_OPEN;
    lid.rotation.x = LID_OPEN;   // mặc định mở (xạ thủ đứng súng); 0 = đóng nằm phẳng trên vòng
    // Trụ súng (chốt trên mép trước vòng) + tấm chắn đạn (2 cánh nghiêng hai bên khe súng + tấm trên / dưới): cụm riêng —
    // lắp vũ khí chính khác lên chân đế mô-đun thì tháo cả cụm (mountWeapon)
    const hmgMount = new THREE.Group();
    turret.add(hmgMount);
    const sb = new VehicleKit.PartBatch(ROOF_Y);
    sb.cyl(0.35, 0.5, GUN_Y, 10, M.dark, [0, GUN_Y / 2, GUN_Z]);
    sb.box(1.0, 0.4, 1.4, M.dark, [0, 0.35, GUN_Z]);                     // đế chốt bắt vào vòng
    sb.setTag('shield');
    const SZ = GUN_Z - 1.5;
    // 2 tấm trước vát chéo RA SAU từ khe súng (mũi tên chĩa về trước, làm trượt đạn) — không gập vào trong
    for (const s of [-1, 1]) sb.box(1.9, 2.3, 0.22, M.paint, [s * 1.35, 2.8, SZ], [0.18, -s * 0.28, 0]);
    // CÁNH CHẮN HAI BÊN: tấm thép vát chéo ra sau mỗi bên (che sườn xạ thủ khỏi đạn bắn chéo), gân tăng cứng, lỗ quan sát
    for (const s of [-1, 1]) {
      const th = s * 0.62, L = 2.5, x0 = s * 2.2, z0 = SZ + 0.26, cx = x0 + Math.sin(th) * L / 2, cz = z0 + Math.cos(th) * L / 2;
      sb.box(0.22, 2.6, L, M.paint, [cx, 2.75, cz], [0, th, s * -0.06]);
      sb.box(0.3, 0.16, L, M.dark, [cx + s * 0.05, 4.02, cz], [0, th, 0]);                                // mép trên gờ
      sb.box(0.26, 0.4, 0.5, M.dark, [cx - Math.sin(th) * 0.4, 3.3, cz - Math.cos(th) * 0.4], [0, th, 0]);   // khe quan sát
      sb.box(0.5, 0.22, 0.22, M.dark, [x0 + s * 0.05, 2.75, z0 + 0.05], [0, th, 0]);                        // bản lề nối tấm trước
    }
    sb.box(4.8, 0.7, 0.22, M.paint, [0, 4.15, SZ - 0.02], [0.18, 0, 0]);
    sb.box(4.8, 0.5, 0.22, M.paint, [0, 0.9, SZ + 0.1], [0.18, 0, 0]);
    for (const s of [-1, 1]) sb.box(0.16, 0.16, 1.5, M.dark, [s * 0.6, 1.0, GUN_Z - 0.75]);   // giằng tấm chắn về trụ
    sb.setTag(null);
    sb.build(hmgMount);

    const pivot = new THREE.Group();
    pivot.position.set(0, GUN_Y, GUN_Z);
    unit.barrelPivot = pivot;
    turret.add(pivot);
    const cb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    cb.box(0.4, 0.9, 0.6, M.dark, [0, -0.6, 0]);
    cb.box(0.3, 0.5, 0.9, M.dark, [-0.55, -0.35, 0.4]);  // khay đỡ hộp đạn
    cb.build(pivot);
    // Hộp đạn 100 viên rời (thay khi nạp đạn)
    const ammo = new THREE.Group();
    ammo.position.set(-1.15, 0.05, 0.25);   // sát khay, cao hơn: súng ngóc lên hộp không chúi vào vòng tháp
    const amb = new VehicleKit.PartBatch(ROOF_Y + 2.6);
    amb.box(1.4, 1.3, 1.6, M.paint, [0, -0.05, 0]);
    amb.box(1.46, 0.08, 1.66, M.dark, [0, -0.5, 0]);          // gờ đáy
    for (const z of [-0.5, 0.5]) amb.box(1.44, 1.1, 0.06, M.dark, [0, -0.05, z]);   // gân dập hai bên
    amb.build(ammo);
    // nắp hộp đạn (bản lề cạnh ngoài, lật mở để kéo dây đạn) + quai xách
    const ammoLid = new THREE.Group();
    ammoLid.position.set(-0.72, 0.62, 0);
    const alb = new VehicleKit.PartBatch(ROOF_Y + 3.3);
    alb.box(1.45, 0.12, 1.65, M.dark, [0.72, 0.05, 0]);
    alb.box(0.5, 0.1, 0.2, M.dark, [0.72, 0.16, 0]);
    alb.box(0.2, 0.2, 0.3, M.dark, [1.4, 0.0, 0]);             // lẫy khóa
    alb.build(ammoLid);
    ammo.add(ammoLid);
    pivot.add(ammo);
    // DÂY ĐẠN 12.7: mắt xích + đầu đạn từ miệng hộp vào khay nạp bên trái khóa nòng (hiện dần khi xạ thủ kéo dây vào súng)
    const belt = new THREE.Group();
    pivot.add(belt);
    const beltPts = new THREE.CatmullRomCurve3([V3(-1.15, 0.75, 0.3), V3(-1.0, 1.0, 0.4), V3(-0.7, 0.85, 0.5), V3(-0.42, 0.3, 0.55)]);
    // vỏ đạn đồng xỉn ám dầu / muội (không bóng vàng như mới), đầu đạn đen (xuyên giáp), mắt xích thép sẫm
    const brass = new THREE.MeshStandardMaterial({ color: 0x5e4a26, roughness: 0.55, metalness: 0.55 });
    const tipM = new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 0.5, metalness: 0.4 });
    const linkM = new THREE.MeshStandardMaterial({ color: 0x1e1e1c, roughness: 0.6, metalness: 0.5 });
    const rnd = new THREE.CylinderGeometry(0.065, 0.07, 0.42, 8), tipG = new THREE.ConeGeometry(0.055, 0.18, 8), lnk = new THREE.BoxGeometry(0.5, 0.06, 0.1);
    const links = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group(), t = i / 8, pt = beltPts.getPointAt(t), tan = beltPts.getTangentAt(t);
      const r = new THREE.Mesh(rnd, brass); r.rotation.x = Math.PI / 2; r.position.z = 0.04; g.add(r);
      const tp = new THREE.Mesh(tipG, tipM); tp.rotation.x = -Math.PI / 2; tp.position.z = -0.26; g.add(tp);
      const l = new THREE.Mesh(lnk, linkM); l.rotation.y = Math.PI / 2; g.add(l);
      g.position.copy(pt); g.lookAt(pt.clone().add(new THREE.Vector3(tan.z, 0, -tan.x)));
      belt.add(g); links.push(g);
    }
    // hộp đạn & dây đạn đi qua lỗ nóc khi thay: vẽ ở lượt trong suốt sau lòng hố (vật liệu riêng)
    const overPit = (root) => root.traverse(o => { if (o.isMesh) { const m0 = o.material, m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.customProgramCacheKey = m0.customProgramCacheKey; m.userData = Object.assign({}, m0.userData); m.transparent = true; m.opacity = 1; o.material = m; o.renderOrder = 12; } });
    overPit(ammo); overPit(belt);
    const hmgParts = [...pivot.children, belt];   // giá súng + hộp đạn + dây đạn (ẩn khi lắp vũ khí khác)

    // Ống phóng tên lửa chống tăng gắn bên phải giá súng (cố định, dùng lại): phóng xong nắp trước bung (lòng ống đen), luồng
    // phụt ngược sau ống (ExplosionFX.missileLaunch); xạ thủ mở nắp sau nạp quả mới từ phía sau vào (modelAnimator)
    const atgm = new THREE.Group();
    atgm.position.copy(ATGM_AT);   // ngoài cánh tấm chắn (trước đây ống đâm xuyên tấm chắn)
    const ab = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    ab.box(0.7, 0.7, 1.2, M.dark, [0, -0.75, -0.6]);
    ab.box(1.1, 0.16, 3.2, M.dark, [0, -0.62, -0.8]);           // máng đỡ ống
    ab.build(atgm);
    const can = new THREE.Group();
    const cnb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    cnb.cyl(0.6, 0.6, 5.6, 14, M.paint, [0, 0, -0.8], 'z');
    cnb.cyl(0.62, 0.62, 0.22, 14, M.dark, [0, 0, -3.65], 'z');
    cnb.cyl(0.64, 0.64, 0.3, 14, M.dark, [0, 0, 2.0], 'z');
    cnb.box(0.22, 0.3, 0.9, M.dark, [0, 0.66, -0.6]);           // quai xách
    cnb.build(can);
    // nắp trước (còn đạn) / lòng ống đen ám khói (đã phóng)
    const capCover = new THREE.Mesh(new THREE.CircleGeometry(0.56, 14), M.dark);
    capCover.position.set(0, 0, -3.77); capCover.rotation.y = Math.PI;
    const capOpen = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), new THREE.MeshBasicMaterial({ color: 0x070605 }));
    capOpen.position.set(0, 0, -3.78); capOpen.rotation.y = Math.PI; capOpen.visible = false;
    // nắp khóa sau (bản lề mép trên) + quả tên lửa mới (chỉ hiện khi đang được đẩy vào từ phía sau)
    const rearCap = new THREE.Group();
    rearCap.position.set(0, 0.64, 2.16);
    const rc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14), M.dark);
    rc.rotation.x = Math.PI / 2; rc.position.set(0, -0.64, 0.07);
    rearCap.add(rc);
    const missile = new THREE.Group();
    const mb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    mb.cyl(0.42, 0.42, 4.6, 12, M.paint, [0, 0, -1.2], 'z');
    mb.cyl(0.44, 0.44, 0.5, 12, M.dark, [0, 0, 1.0], 'z');      // khối động cơ / đuôi
    mb.build(missile);
    missile.visible = false;
    can.add(capCover, capOpen, rearCap, missile);
    atgm.add(can);
    unit.atgmCan = { can, capCover, capOpen, rearCap, missile };
    pivot.add(atgm);
    unit.antiTankLauncherMesh = atgm;
    VehicleKit.registerPartGroup(unit, 'atgm', atgm);
    unit.atgmTipLocal = new THREE.Vector3(0, 0, -3.9);
    unit.atgmRearLocal = new THREE.Vector3(0, 0, 2.3);

    // Súng máy hạng nặng: thân súng, nòng có ống làm mát đục lỗ, loa che lửa
    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);
    const gb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    gb.box(0.8, 0.95, 3.2, M.dark, [0, 0, 0.6]);
    gb.box(0.25, 0.6, 0.9, M.dark, [0, 0.2, 2.6]);
    // tấm đáy sau + 2 tay cầm chữ D (kiểu M2) và lẫy bóp cò giữa — chỗ hai bàn tay xạ thủ nắm (vehicle_crew GRIP)
    gb.box(1.1, 0.8, 0.14, M.dark, [0, 0, 2.25]);
    for (const s of [-1, 1]) {
      gb.cyl(0.11, 0.11, 0.75, 8, M.dark, [s * 0.45, 0.0, 3.3]);
      gb.box(0.12, 0.12, 1.1, M.dark, [s * 0.45, 0.36, 2.8]);
      gb.box(0.12, 0.12, 1.1, M.dark, [s * 0.45, -0.36, 2.8]);
    }
    gb.box(0.3, 0.25, 0.12, M.dark, [0, 0.0, 2.4]);
    gb.cyl(0.27, 0.27, 2.0, 10, M.dark, [0, 0.05, -2.0], 'z');
    gb.cyl(0.17, 0.17, 6.6, 10, M.dark, [0, 0.05, -5.6], 'z');
    gb.cyl(0.26, 0.24, 1.0, 10, M.dark, [0, 0.05, -9.3], 'z');
    gb.cyl(0.12, 0.12, 0.06, 8, M.bore, [0, 0.05, -9.82], 'z');
    gb.box(0.18, 0.45, 0.18, M.dark, [0, 0.4, -8.4]);
    gb.build(barrel);
    unit.muzzleTipLocal = new THREE.Vector3(0, 0.05, -10.0);
    // Nắp hộp khóa nòng (lật lên khi lắp dây đạn mới), bản lề phía trước
    const cover = new THREE.Group();
    cover.position.set(0, 0.48, -0.2);
    const cvb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    cvb.box(0.84, 0.12, 1.7, M.dark, [0, 0.06, 0.85]);
    cvb.box(0.2, 0.18, 0.3, M.dark, [0, 0.18, 1.55]);
    cvb.build(cover);
    barrel.add(cover);

    const flashMat = new THREE.MeshBasicMaterial({
      map: VehicleKit.getMuzzleFlashTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flash = new THREE.Group();
    flash.position.set(0, 0.05, -10.9);
    flash.add(new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), flashMat));
    for (const rz of [0, Math.PI / 2]) {
      const petal = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 4.4), flashMat);
      petal.rotation.set(Math.PI / 2, 0, rz);
      petal.position.z = -1.7;
      flash.add(petal);
    }
    flash.visible = false;
    barrel.add(flash);
    hmgParts.push(barrel);
    return { flash, flashMat, ammo, ammo0: ammo.position.clone(), ammoLid, belt, links, beltPts, cover, barrel, hmgMount, hmgParts };
  }

  // ===========================================================================
  // Ô VŨ KHÍ CHÍNH (vòng tháp): súng máy 12.7mm có tấm chắn (mặc định) hoặc trạm vũ khí trên chân đế mô-đun dùng chung
  // (roof_mounts.js — súng phóng lựu 40mm HV / giàn rocket 8 ống). Chân đế đặt trên vòng tháp, quay theo tháp; khối ngóc
  // của trạm thành nòng mới (spg.js ngóc / giật / tính đầu nòng qua barrelPivot / barrelGroup), ống tên lửa chống tăng
  // chuyển sang bắt bên khối ngóc mới. Equipment.equip gọi unit.mountWeapon(id)
  // ===========================================================================
  function mountWeapon(ctx, id) {
    const u = ctx.unit, H = u._hmg;
    if (!H || u.weaponId === id || !window.RoofMounts) return;
    const atgm = u.antiTankLauncherMesh;
    u.group.updateMatrixWorld(true);
    // trả ống tên lửa về chỗ cố định trên giá súng 12.7 trước khi gỡ trạm (đặt thẳng vị trí: khối ngóc cũ có thể đang ngóc)
    if (atgm && atgm.parent !== H.pivot) { H.pivot.add(atgm); atgm.position.copy(ATGM_AT); atgm.rotation.set(0, 0, 0); }
    u.mainGun = null;
    // xe trinh sát là vòng súng CÓ NGƯỜI: phóng lựu & rocket dựng riêng trên chốt súng mép trước lỗ nóc (không dùng trạm
    // điều khiển từ xa của RoofMounts — bệ to đè lên lỗ nóc, chỗ xạ thủ đứng)
    if (u._manned) { u._manned.parent && u._manned.parent.remove(u._manned); u._manned.traverse(o => { if (o.geometry) o.geometry.dispose(); }); u._manned = null; }
    u._mgParts = null;
    const manned = id === 'sagl' || id === 'agl' ? buildMannedAGL : id === 'srocket' || id === 'rocket' ? buildMannedRockets : null;
    RoofMounts.mount(ctx, manned || id === 'hmg' ? 'none' : id);
    if (manned) manned(ctx);
    const G = u.mainGun, on = !!G;
    // phóng lựu giữ trụ + tấm chắn của súng 12.7 (cùng chốt); giàn rocket có trụ riêng, bỏ tấm chắn (chắn đường rocket)
    H.mount.visible = !on || G.kind === 'agl';
    for (const p of H.parts) p.visible = !on;
    if (u.crew) u.crew.mg = u._mgParts || H.mg;
    if (on) {
      // khối ngóc của trạm = nòng mới; thêm nhóm giật lùi bên trong (spg.js đặt barrelGroup.position.z khi bắn)
      const pivot = G.pivot, recoil = new THREE.Group();
      while (pivot.children.length) recoil.add(pivot.children[0]);
      pivot.add(recoil);
      G.recoil = recoil;
      u.barrelPivot = pivot; u.barrelGroup = recoil; u.muzzleTipLocal = G.muzzle.clone();
      u.group.updateMatrixWorld(true);
      // giàn rocket thay luôn ống tên lửa chống tăng (không bắn tên lửa nữa); vũ khí khác giữ ống, bắt sang khối ngóc mới
      if (atgm && G.kind !== 'rocket') pivot.attach(atgm);
    } else {
      u.barrelPivot = H.pivot; u.barrelGroup = H.barrel; u.muzzleTipLocal = H.muzzle.clone();
    }
    // nhịp bắn / dây đạn / thời gian nạp theo vũ khí đang lắp (spg.js SPGUnit3D.MAIN_WEAPONS)
    const cfg = on && typeof SPGUnit3D !== 'undefined' ? SPGUnit3D.MAIN_WEAPONS[G.kind] : null;
    const gt = (x) => (typeof GameTiming !== 'undefined' && GameTiming.t ? GameTiming.t(x) : x * 0.5);
    u.gatlingMagMax = cfg ? cfg.mag : 100;
    u.gatlingMag = u.gatlingMagMax;
    u.reloadDuration = gt(cfg ? cfg.reload : 8);
    u._noAtgm = !!(on && G.kind === 'rocket');
    if (atgm) atgm.visible = !u._noAtgm;
    u.availableAmmos = u._noAtgm ? ['SCOUT_BULLET'] : on ? ['SCOUT_BULLET', 'ANTI_TANK_MISSILE'] : ['SCOUT_BULLET', 'INCENDIARY', 'ANTI_TANK_MISSILE'];
    if ((on && u.selectedAmmo === 'INCENDIARY') || (u._noAtgm && u.selectedAmmo === 'ANTI_TANK_MISSILE')) u.selectedAmmo = 'SCOUT_BULLET';
    u.weaponId = id;
  }

  // Súng phóng lựu tự động 40mm cầm tay kiểu Mk 19 trên nôi Mk 64, lắp vào ĐÚNG chốt + tấm chắn của súng 12.7 (vòng súng
  // có người): thân hộp vuông dài, nắp trên bản lề trước (lật khi nạp), ống áo nòng khoan lỗ + loa, khay & máng cấp đạn
  // trái, cửa nhả mắt xích phải, 2 tay cầm chữ D + lẫy cò bướm sau tấm hậu (chỗ xạ thủ nắm — vehicle_crew), tay kéo lên
  // đạn, thước ngắm lá. Hộp 48 quả treo bên trái (thay khi nạp)
  function buildMannedAGL(ctx) {
    const u = ctx.unit, M = ctx.M, P = M.paint, D = M.dark, soot = M.soot || D;
    const root = new THREE.Group();
    ctx.parent.add(root);
    u._manned = root;
    const pivot = new THREE.Group();
    pivot.position.set(0, GUN_Y, GUN_Z);
    root.add(pivot);
    const b = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    // nôi: khay đỡ dưới thân súng, hai má ôm trục ngóc trên đầu trụ
    b.box(1.5, 0.28, 2.8, D, [0, -0.68, 0.5]);
    for (const s of [-1, 1]) {
      b.box(0.16, 0.85, 1.1, D, [s * 0.8, -0.4, 0]);
      b.cyl(0.22, 0.22, 0.2, 10, D, [s * 0.92, -0.4, 0], 'x');
    }
    // thân súng: hộp dài vuông vức, gờ mép nắp, đường ghép
    b.box(1.25, 1.0, 3.7, P, [0, 0, 0.55]);
    b.box(1.29, 0.08, 3.74, D, [0, -0.3, 0.55]);
    b.box(0.08, 0.5, 1.0, D, [0.66, -0.08, -0.1]);               // cửa nhả mắt xích (phải)
    b.box(0.35, 0.4, 1.1, D, [-0.8, 0.18, -0.15]);               // khay cấp đạn (trái)
    b.box(1.12, 0.9, 0.16, D, [0, 0, 2.45]);                     // tấm hậu
    for (const s of [-1, 1]) {
      // tay cầm chữ D
      b.cyl(0.11, 0.11, 0.75, 8, D, [s * 0.45, 0.0, 3.3]);
      b.box(0.12, 0.12, 0.95, D, [s * 0.45, 0.36, 2.87]);
      b.box(0.12, 0.12, 0.95, D, [s * 0.45, -0.36, 2.87]);
      // tay kéo lên đạn hai bên
      b.box(0.1, 0.1, 0.7, D, [s * 0.7, 0.15, 1.55]);
      b.box(0.1, 0.32, 0.12, D, [s * 0.76, 0.15, 1.95]);
    }
    b.box(0.55, 0.16, 0.12, D, [0, 0.0, 2.72]);                  // lẫy cò bướm
    // nòng: ống áo tản nhiệt khoan lỗ, nòng ló, loa che lửa có rãnh
    b.cyl(0.34, 0.34, 3.0, 14, P, [0, 0.05, -2.75], 'z');
    for (let k0 = 0; k0 < 4; k0++) {
      const z = -1.6 - k0 * 0.7;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + (k0 % 2 ? Math.PI / 6 : 0);
        b.box(0.12, 0.05, 0.22, D, [Math.cos(a) * 0.335, 0.05 + Math.sin(a) * 0.335, z], [0, 0, a + Math.PI / 2]);
      }
    }
    b.cyl(0.36, 0.36, 0.14, 14, D, [0, 0.05, -4.25], 'z');       // vành đầu ống áo
    b.cyl(0.2, 0.2, 0.6, 12, D, [0, 0.05, -4.6], 'z');
    b.cyl(0.27, 0.25, 0.5, 12, soot, [0, 0.05, -5.1], 'z');
    for (const s of [-1, 1]) b.box(0.06, 0.12, 0.3, D, [s * 0.26, 0.05, -5.1]);
    // thước ngắm lá (khung + lá dựng) trên nóc bên trái, đầu ruồi trước
    b.box(0.12, 0.08, 0.5, D, [-0.42, 0.56, 1.5]);
    b.box(0.08, 0.55, 0.06, D, [-0.42, 0.85, 1.5]);
    b.box(0.32, 0.06, 0.06, D, [-0.42, 1.1, 1.5]);
    b.box(0.08, 0.3, 0.08, D, [-0.42, 0.62, -1.0]);
    // máng cấp đạn từ hộp lên khay
    b.box(0.5, 0.16, 0.8, D, [-1.15, 0.12, -0.15], [0, 0, 0.6]);
    b.build(pivot);
    // nắp trên (bản lề mép trước, lật lên khi nạp dây đạn mới — modelAnimator)
    const cover = new THREE.Group();
    cover.position.set(0, 0.52, -0.55);
    const cb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y + 0.5);
    cb.box(1.2, 0.1, 2.6, P, [0, 0.05, 1.3]);
    cb.box(0.3, 0.14, 0.2, D, [0, 0.14, 2.5]);                  // chốt khóa nắp
    cb.cyl(0.07, 0.07, 1.1, 8, D, [0, 0.02, 0], 'x');           // bản lề
    cb.build(cover);
    pivot.add(cover);
    // hộp đạn 48 quả treo trái: thân, nắp gờ, quai, nhãn lô bạc màu
    const ammo = new THREE.Group();
    ammo.position.set(-1.75, -0.35, 0.3);
    const ab = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    ab.box(1.0, 1.25, 1.7, P, [0, 0, 0]);
    ab.box(1.06, 0.08, 1.76, D, [0, 0.64, 0]);
    ab.box(0.12, 0.12, 0.6, D, [0, 0.74, 0]);
    ab.box(0.04, 0.5, 0.6, M.canvas || P, [-0.52, 0, 0.1]);
    ab.build(ammo);
    ammo.traverse(o => { if (o.isMesh) o.renderOrder = 3; });
    pivot.add(ammo);
    u.mainGun = { pivot, muzzle: new THREE.Vector3(0, 0.05, -5.4), kind: 'agl' };
    u._mgParts = { cover, ammo, ammo0: ammo.position.clone(), barrel: pivot };
  }

  // Hộp phóng rocket 8 ống (4 x 2) trên trụ chạc chữ U riêng ở mép trước lỗ nóc: vỏ tôn bọc kín bó ống (thấy miệng / đuôi
  // từng ống ở hai đầu), khung mép trước / sau, 3 đai gân, quai cẩu, giắc + cáp điện phóng xuống trụ, nhãn lô, kính ngắm
  // phản xạ trên chạc trái. Xạ thủ bắn từ trong xe (thụp hẳn xuống lỗ), chỉ trèo lên nhét rocket vào đuôi ống khi hết giàn
  function buildMannedRockets(ctx) {
    const u = ctx.unit, M = ctx.M, P = M.paint, D = M.dark, soot = M.soot || D;
    const root = new THREE.Group();
    ctx.parent.add(root);
    u._manned = root;
    const PY = 3.5, cols = 4, rows = 2, pitch = 1.0, rowP = 0.95;
    const W = cols * pitch + 0.2, Hh = rows * rowP + 0.2, Lf = -4.0, Lr = 2.0, Lc = (Lf + Lr) / 2, L = Lr - Lf;
    // trụ + chạc chữ U
    const pb = new VehicleKit.PartBatch(ROOF_Y);
    pb.box(1.4, 0.4, 1.6, D, [0, 0.35, GUN_Z]);
    pb.cyl(0.42, 0.55, 1.9, 10, D, [0, 1.15, GUN_Z]);
    pb.box(W + 0.9, 0.3, 1.0, P, [0, 2.15, GUN_Z]);
    for (const s of [-1, 1]) {
      pb.box(0.28, 1.5, 0.9, P, [s * (W / 2 + 0.3), 2.85, GUN_Z]);
      pb.cyl(0.3, 0.3, 0.14, 12, D, [s * (W / 2 + 0.5), PY, GUN_Z], 'x');
    }
    // kính ngắm phản xạ trên tay chạc trái
    pb.box(0.4, 0.45, 0.6, D, [-(W / 2 + 0.3), 3.85, GUN_Z + 0.4]);
    pb.box(0.32, 0.3, 0.04, M.glass || D, [-(W / 2 + 0.3), 4.15, GUN_Z + 0.2], [0.3, 0, 0]);
    pb.build(root);
    const pivot = new THREE.Group();
    pivot.position.set(0, PY, GUN_Z);
    root.add(pivot);
    const b = new VehicleKit.PartBatch(ROOF_Y + PY);
    const tubes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tubes.push([(c - (cols - 1) / 2) * pitch, ((rows - 1) / 2 - r) * rowP]);
    for (const [tx, ty] of tubes) {
      b.cyl(0.42, 0.42, L, 14, D, [tx, ty, Lc], 'z');            // ống (chỉ lộ ở hai đầu)
      b.cyl(0.34, 0.34, 0.06, 14, soot, [tx, ty, Lf - 0.02], 'z');   // lòng miệng ống ám muội
      b.cyl(0.34, 0.34, 0.06, 14, soot, [tx, ty, Lr + 0.02], 'z');
    }
    // vỏ tôn 4 mặt bọc bó ống
    b.box(W, 0.08, L - 0.1, P, [0, Hh / 2, Lc]);
    b.box(W, 0.08, L - 0.1, P, [0, -Hh / 2, Lc]);
    for (const s of [-1, 1]) b.box(0.08, Hh, L - 0.1, P, [s * W / 2, 0, Lc]);
    // khung mép trước / sau + 3 đai gân
    for (const z of [Lf + 0.1, Lr - 0.1, Lc - 1.6, Lc, Lc + 1.6]) {
      const t = z === Lf + 0.1 || z === Lr - 0.1 ? 0.2 : 0.14;
      b.box(W + 0.14, 0.14, t, D, [0, Hh / 2 + 0.03, z]); b.box(W + 0.14, 0.14, t, D, [0, -Hh / 2 - 0.03, z]);
      for (const s of [-1, 1]) b.box(0.14, Hh + 0.14, t, D, [s * (W / 2 + 0.03), 0, z]);
    }
    // quai cẩu trên nóc, giắc điện phóng bên trái + cáp xuống trụ, nhãn lô, vệt muội trước miệng
    for (const z of [Lc - 1.0, Lc + 1.0]) {
      b.box(0.1, 0.28, 0.1, D, [-0.5, Hh / 2 + 0.16, z]); b.box(0.1, 0.28, 0.1, D, [0.5, Hh / 2 + 0.16, z]);
      b.box(1.1, 0.1, 0.1, D, [0, Hh / 2 + 0.3, z]);
    }
    b.cyl(0.18, 0.18, 0.25, 10, D, [-W / 2 - 0.12, -0.3, Lr - 0.8], 'x');
    b.strut([-W / 2 - 0.2, -0.3, Lr - 0.8], [-0.4, -1.9, 0.5], 0.05, D, 5);
    b.box(1.4, 0.5, 0.03, M.canvas || P, [W / 2 * 0.2, 0, 0]);
    b.box(0.03, 0.5, 1.4, M.canvas || P, [W / 2 + 0.05, 0.1, Lc + 0.6]);
    b.box(W * 0.5, 0.03, 0.9, soot, [0.3, Hh / 2 + 0.05, Lf + 0.5]);
    // trunnion
    b.cyl(0.2, 0.2, W + 0.9, 10, D, [0, 0, 0], 'x');
    b.build(pivot);
    // đầu đạn nhìn thấy trong miệng ống (ẩn khi ống đó đã phóng)
    const noseGeo = new THREE.ConeGeometry(0.27, 0.6, 12);
    noseGeo.rotateX(-Math.PI / 2);
    const rounds = tubes.map(([tx, ty]) => {
      const m = new THREE.Mesh(noseGeo, M.canvasDark || D);
      m.position.set(tx, ty, Lf + 0.25);
      pivot.add(m);
      return m;
    });
    const muzzles = tubes.map(([tx, ty]) => new THREE.Vector3(tx, ty, Lf - 0.05));
    // ống tên lửa chống tăng bắt ra ngoài tay chạc phải
    u.mainGun = { pivot, muzzle: new THREE.Vector3(0, 0, Lf - 0.05), muzzles, rounds, rear: Lr, kind: 'rocket', atgmAt: new THREE.Vector3(W / 2 + 1.25, -1.0, -0.5) };
  }

  // Tên lửa tấn công đỉnh (đạn cao cấp 'topatk'): ống phóng kiểu Javelin — ống to hơn bọc đệm, khối ngắm nhiệt CLU gắn
  // bên trái ống (thấu kính, tấm che nắng, quai), dây đeo bạt; ống cũ vẫn giữ cơ cấu nạp (animateAtgmReload)
  function setTopAttack(u, M, on) {
    const A = u.atgmCan;
    if (!A || !!u._topLook === !!on) return;
    if (u._topLook) { u._topLook.parent && u._topLook.parent.remove(u._topLook); u._topLook = null; }
    if (!on) { A.can.scale.set(1, 1, 1); return; }
    A.can.scale.set(1.28, 1.28, 1.08);   // ống Javelin to hơn ống tên lửa thường
    const g = new THREE.Group();
    const b = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    // khối CLU (ngắm nhiệt / ngày) bên trái ống
    b.box(1.0, 0.9, 1.5, M.paint, [-0.95, 0.15, 0.6]);
    b.box(1.06, 0.1, 1.56, M.dark, [-0.95, 0.62, 0.6]);
    b.cyl(0.24, 0.24, 0.1, 14, M.glass, [-0.95, 0.15, -0.17], 'z');
    b.box(0.6, 0.12, 0.4, M.dark, [-0.95, 0.45, -0.25], [0.3, 0, 0]);       // tấm che nắng ống kính
    b.cyl(0.07, 0.07, 0.6, 6, M.dark, [-1.48, 0.15, 0.6], 'z');              // quai cầm
    b.box(0.5, 0.42, 0.25, M.dark, [-0.95, 0.15, 1.42]);                     // hộp pin
    // đai bạt + dây đeo, đệm cao su hai đầu ống
    for (const z of [-2.6, 1.4]) b.cyl(0.66, 0.66, 0.42, 14, M.rubber || M.dark, [0, 0, z], 'z');
    b.box(0.08, 0.08, 3.8, M.canvasDark || M.dark, [0.55, -0.5, -0.4], [0, 0, 0.3]);
    b.build(g);
    A.can.parent.add(g);
    u._topLook = g;
  }


  TankModelBuilder.registerModel('SCOUT', buildMarten);
})();
