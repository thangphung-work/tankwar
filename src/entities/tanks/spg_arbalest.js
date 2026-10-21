/**
 * PHÁO TỰ HÀNH BÁNH LỐP ARBALEST 155  (tankType: ARTILLERY)
 *
 * Thiết kế hư cấu: lựu pháo 155mm đặt trên xe tải quân sự 6x6, tháp pháo bọc giáp phía sau.
 * - Cabin bọc giáp đầu bằng (cab-over) với kính chống đạn dày, khoang động cơ phía sau cabin
 * - 3 trục: trục trước bẻ lái, 2 trục sau tải nặng; lốp địa hình gai to có bơm hơi trung tâm
 * - Tháp pháo bọc giáp phía sau; pháo 155mm L/52 đặt trên nóc tháp, 2 xi-lanh lùi / đẩy lên nằm trên nòng,
 *   lò xo cân bằng, hãm lùi 2 tầng, radar đo sơ tốc đầu nòng; hành quân thì nòng gác lên giá khóa trên nóc cabin
 * - Nạp đạn tự động (chạy theo đồng hồ nạp gameplay): nắp khoang trượt mở -> cầu trục kẹp gắp đạn từ thang nâng
 *   trái đặt lên máng -> máng xoay theo góc nâng nòng, xích đẩy đạn vào buồng -> lặp lại với bó liều phóng bên phải
 *   -> máng thu về, nắp đóng. Thang nâng đẩy viên kế tiếp lên từ hầm đạn trong tháp.
 * - Dừng xe: 2 chân chống thủy lực hạ xuống đất, lưỡi càng sau hạ cắm đất (xi-lanh chuyển động thật)
 *
 * Hook gameplay: barrelPivot (spg.js ghi góc nâng -> model giới hạn khi nòng vắt qua cabin),
 * barrelGroup (giật nòng, hiển thị thu nhỏ cho thật), muzzleTipLocal, deployProgress (đọc để hạ càng).
 * Tỉ lệ ~8 đơn vị = 1 mét, đầu xe hướng -Z, mặt đất y = 0.
 */

(function () {
  if (typeof TankModelBuilder === 'undefined' || typeof VehicleKit === 'undefined') return;

  const WHEEL_R = 5.55;   // lốp 14.00R20 cỡ ~1.4 m; đỉnh lốp sau còn hở ~2 cm dưới sàn
  const TIRE_W = 3.6;
  const WHEEL_X = 9.0;
  const WHEEL_Y = WHEEL_R;
  const AXLES = [{ z: -26, steer: 1 }, { z: 12.4, steer: 0 }, { z: 24, steer: 0 }];
  const HALF_W = 10.6;
  const DECK_Y = 12.4;
  const CAB_ROOF = 22.5;
  const TURRET_Z = 17;
  const PIVOT = { y: 11.6, z: -4.0 };       // trục quay nòng trong hệ tọa độ tháp
  const RECOIL_VISUAL = 0.3;                // giật nòng 32 đơn vị của gameplay -> hiển thị ~1.2 m
  const SPADE_PIVOT = { y: 8.4, z: 38.2 };  // bản lề lưỡi càng ở đuôi khung gầm
  const SPADE_LEN = 10.6;                   // từ bản lề tới lưỡi cắt
  const SPADE_TRAVEL = -2.99;               // hành quân: dựng đứng gọn sau đuôi xe
  const SPADE_DEPLOYED = -0.62;             // triển khai: lưỡi cắt cắm sâu xuống đất
  const SPADE_CYL_LOCAL = { y: 4.0, z: -0.9 }; // điểm bám xi-lanh trên dầm ngang (cục bộ)
  const JACK_Z = [-17.2, 33.6];             // 2 cặp chân chống: sau bánh trước & sau cụm bánh sau
  const JACK_X = 11.0;
  const JACK_DROP = 3.85;                   // hành trình hạ để đế tì chạm đất
  // KHOANG NẠP ĐẠN TỰ ĐỘNG trên nóc sau tháp (hệ tọa độ tháp): z0 mặt sau hộp giáp bệ nòng, z1 vách sau, hw nửa bề ngang
  // ngoài, h chiều cao vách, t bề dày vách; 2 nắp trượt ra hai bên khi nạp. Bên trái thang nâng đạn, bên phải thang
  // nâng liều phóng module; cầu trục kẹp gắp chuyển vào máng nạp giữa khoang, máng xoay theo góc nâng nòng rồi xích đẩy
  const BAY = { z0: 2.0, z1: 12.0, hw: 4.4, h: 3.9, t: 0.45 };
  const LOAD = {
    z: 7.0,          // tâm dọc viên đạn / bó liều khi nằm trên thang nâng & dưới kẹp gắp
    rackX: 3.0,      // tâm thang nâng hai bên
    pickY: 11.6,     // tâm đạn ở cửa thang nâng = độ cao trục nòng (máng nạp nâng lên ngang đây)
    carryY: 12.0,    // độ cao kẹp nhấc đạn khi chạy ngang (khung kẹp sát đáy xe con cầu trục)
    railY: 13.3,     // ray cầu trục
    sinkY: 8.3,      // đáy giếng thang nâng (khuất dưới nóc tháp)
    trayDrop: -2.9,  // máng nạp hạ chìm xuống khe sàn khi nghỉ (để khóa nòng giật lùi lướt qua)
    trayZ: 11.0,     // tâm đạn trên máng theo trục máng (gốc = trục quay nòng) = LOAD.z - PIVOT.z
    ram: 9.0,        // hành trình xích đẩy: đuôi đạn lọt hẳn vào buồng đạn
    hatchSlide: 3.6
  };

  function buildArbalest(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    // Xe đã qua chiến trường: bùn văng, muội, dầu loang, xước, lỗ mảnh đạn, gỉ chảy, lốp bám bùn, kính bụi
    const M = K.createMaterials(unit.team, { battle: 1 });
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    M.tire = M.tire || M.rubber;
    M.soot = M.soot || M.dark;
    M.wood = M.wood || M.canvasDark;
    M.glassWindL = M.glassWindL || M.glass;
    M.glassWindR = M.glassWindR || M.glass;
    M.glassDusty = M.glassDusty || M.glass;
    M.headLensL = M.headLensL || M.lens;
    M.headLensR = M.headLensR || M.lens;
    M.amberLens = M.amberLens || M.tailLens;
    M.mirror = M.mirror || M.glass;
    // Đạn 155: vỏ thép sơn ô-liu, đai dẫn đồng, vạch vàng HE; liều phóng module vỏ cháy màu vải bạt
    M.shellBody = new THREE.MeshStandardMaterial({ color: 0x565c3c, roughness: 0.55, metalness: 0.35 });
    M.shellBand = new THREE.MeshStandardMaterial({ color: 0xb2693a, roughness: 0.35, metalness: 0.85 });
    M.shellMark = new THREE.MeshStandardMaterial({ color: 0xd1a52a, roughness: 0.6, metalness: 0.1 });
    M.charge = new THREE.MeshStandardMaterial({ color: 0xc4ad7c, roughness: 0.82, metalness: 0.03 });
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildTruck(chassis, M, unit, rnd);
    buildSpareWheel(chassis, M);
    const wheels = buildWheels(chassis, M);
    unit.wheelSet = wheels;
    const deploy = buildDeployGear(chassis, M);
    updateDeployGear(deploy, 0);
    const turretParts = buildTurret(chassis, M, unit, rnd);
    const gun = buildHowitzer(unit, M);
    // Nòng thật theo trục giả ngay lập tức (giới hạn khi vắt qua cabin): spg.js gọi khi thử góc nòng (chạm trần hầm / tường)
    // trong cùng khung hình — không thì phép thử đo nòng ở góc khung trước
    const syncGun = () => {
      let el = gun.pivotProxy.rotation.x;
      let rel = unit.turretGroup.rotation.y % (Math.PI * 2);
      if (rel > Math.PI) rel -= Math.PI * 2;
      if (rel < -Math.PI) rel += Math.PI * 2;
      if (typeof BallisticsSystem3D !== 'undefined' && BallisticsSystem3D.artyMinElevation) {
        el = Math.max(el, BallisticsSystem3D.artyMinElevation(rel) * Math.PI / 180);
      } else if (Math.abs(rel) < 0.85) el = Math.max(el, 0);
      gun.pivot.rotation.x = el;
      return el;
    };
    unit.syncBarrelPose = syncGun;

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.radarDish = null;
    unit.rcwsTurret = null;
    // spg.js tự điều khiển 3 hook cũ này; model mới tự làm hoạt ảnh hạ càng nên để trống
    unit.artySpadeGroup = null;
    unit.outriggerLeft = null;
    unit.outriggerRight = null;

    let lastYaw = null;
    let scanTime = rnd() * 10;
    let deployVis = 0;

    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        const yaw = u.group.rotation.y;
        let dYaw = lastYaw === null ? 0 : yaw - lastYaw;
        lastYaw = yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;

        // Bánh lăn theo từng bên + bánh trước bẻ lái
        const v = u.isDead ? 0 : (u.speed || 0);
        const dl = v * dt - dYaw * WHEEL_X;
        const dr = v * dt + dYaw * WHEEL_X;
        wheels.steerAngle = Math.max(-0.5, Math.min(0.5, (u.currentSteer || 0) * 1.2));
        wheels.roll(dl, dr);

        // Hạ / thu chân chống và lưỡi càng theo tiến độ gameplay (deployProgress 0..2)
        const target = Math.max(0, Math.min(1, (u.deployProgress || 0) / 2));
        deployVis += (target - deployVis) * Math.min(1, dt * 8);
        updateDeployGear(deploy, deployVis);

        // Nòng: lấy góc nâng spg.js ghi vào trục giả, giới hạn khi nòng vắt qua cabin
        // (vắt qua nóc cabin / khoang máy thì tự nâng vượt giá khóa nòng, drone, ống xả... — ballistics.js artyMinElevation)
        const el = syncGun();
        // Giật nòng hiển thị thu nhỏ (độ giật gameplay vẫn giữ nguyên)
        gun.barrel.position.z = (u.barrelRecoil || 0) * RECOIL_VISUAL;

        if (!u.isDead) {
          updateLoader(turretParts.loader, u, dt, el);
          scanTime += dt;
          turretParts.periHead.rotation.y = Math.sin(scanTime * 0.25) * 1.5;
          turretParts.anemometer.rotation.y += dt * 9;
        }
      }
    };

    return { hullW: HALF_W * 2 };
  }

  // ===========================================================================
  // XE TẢI: CABIN BỌC GIÁP, KHUNG GẦM, SÀN, KHOANG MÁY
  // ===========================================================================
  function buildTruck(chassis, M, unit, rnd) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;

    // Cabin đầu bằng bọc giáp, khoét hốc bánh trước
    const arch = [];
    const ax = AXLES[0].z, ar = 6.6;
    const a0 = Math.asin((8.0 - WHEEL_Y) / ar);
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (Math.PI - 2 * a0) * (i / 8);
      arch.push([ax + ar * Math.cos(a), WHEEL_Y + ar * Math.sin(a)]);
    }
    hb.add(VehicleKit.sideProfile([
      [-37.0, 6.5], [-37.5, 11.0], [-36.8, 15.0], [-33.5, CAB_ROOF], [-19.5, CAB_ROOF], [-18.5, 21.6],
      [-18.5, 8.0], ...arch, [-35.5, 8.0], [-35.5, 6.5]
    ], HALF_W * 2, 0.35), P);
    // Lấp lòng hốc bánh (khối động cơ/khung phía trong)
    hb.box(14.0, 6.5, 12.0, D, [0, 8.8, ax]);

    // Kính chắn gió 2 tấm nghiêng (bên lái có vô-lăng sau kính, bên phụ dính vết đá văng) + gạt nước nằm nghỉ
    // dọc mép dưới: gốc cần ở góc ngoài-dưới mỗi tấm, khớp với cung quét sạch vẽ trên texture kính
    const wsAngle = Math.atan2(36.8 - 33.5, CAB_ROOF - 15.0);
    const wc = Math.cos(wsAngle), wsn = Math.sin(wsAngle);
    for (const s of [-1, 1]) {
      hb.box(8.9, 7.0, 0.16, s < 0 ? M.glassWindL : M.glassWindR, [s * 4.85, 18.65, -35.42], [wsAngle, 0, 0]);
      // điểm trên mặt kính: lx dọc bề ngang tấm, ly dọc chiều cao, lz pháp tuyến (âm = ra phía trước)
      const W = (lx, ly, lz) => [s * 4.85 + lx, 18.65 + ly * wc - lz * wsn, -35.42 + ly * wsn + lz * wc];
      const tilt = s < 0 ? 0.03 : 0.1;   // cần bên phụ nghỉ lệch, không nằm sát mép
      const piv = W(3.15, -3.85, -0.2);
      hb.cyl(0.2, 0.22, 0.35, 8, D, piv, 'z', [wsAngle, 0, 0]);
      hb.beam(piv, W(-0.1, -3.05 + tilt * 3, -0.32), 0.14, 0.1, D);
      hb.box(4.6, 0.1, 0.16, M.rubber, W(-0.15, -3.12 + tilt * 3, -0.2), [wsAngle, 0, tilt]);
      hb.box(4.4, 0.08, 0.1, D, W(-0.15, -3.05 + tilt * 3, -0.3), [wsAngle, 0, tilt]);
    }
    hb.box(0.6, 7.6, 0.3, P, [0, 18.65, -35.45], [wsAngle, 0, 0]);
    // Khung viền kính chắn gió
    hb.box(20.4, 0.35, 0.3, P, [0, 15.25, -36.82], [wsAngle, 0, 0]);
    hb.box(20.4, 0.35, 0.3, P, [0, 22.05, -33.75], [wsAngle, 0, 0]);
    hb.box(21.6, 0.35, 1.4, P, [0, CAB_ROOF + 0.1, -33.6]);

    // Cửa, kính cửa, tay nắm, bậc lên xuống, gương chiếu hậu
    for (const s of [-1, 1]) {
      const x = s * (HALF_W + 0.04);
      hb.box(0.1, 6.0, 7.5, M.glassDusty, [x, 18.0, -28.6]);
      hb.box(0.1, 4.0, 3.0, M.glassDusty, [x, 18.6, -22.4]);
      hb.box(0.08, 13.0, 0.12, D, [x, 15.2, -32.5]);
      hb.box(0.08, 13.0, 0.12, D, [x, 15.2, -23.9]);
      hb.box(0.08, 0.12, 8.6, D, [x, 21.7, -28.2]);
      hb.box(0.25, 0.35, 1.4, M.steel, [s * (HALF_W + 0.2), 14.2, -25.0]);
      hb.box(0.2, 5.0, 0.2, M.steel, [s * (HALF_W + 0.25), 15.5, -23.3]);
      hb.box(2.4, 0.3, 1.4, D, [s * 9.6, 7.0, -19.6]);
      hb.box(2.4, 0.3, 1.4, D, [s * 9.6, 4.6, -19.6]);
      hb.setTag('mirror' + (s < 0 ? 'L' : 'R'));
      hb.beam([s * (HALF_W - 0.2), 19.5, -34.8], [s * (HALF_W + 2.0), 19.0, -35.6], 0.25, 0.25, D);
      hb.box(0.5, 3.2, 1.8, D, [s * (HALF_W + 2.2), 18.2, -35.6]);
      hb.box(0.1, 2.8, 1.5, M.mirror, [s * (HALF_W + 2.48), 18.2, -35.6], [0, 0, s * 0.05]);
      hb.setTag(null);
    }

    // Cản trước, lưới tản nhiệt, đèn pha có khung bảo vệ, móc kéo, tời
    hb.box(22.8, 3.6, 2.0, P, [0, 8.4, -37.6]);
    for (let i = 0; i < 6; i++) hb.box(9.0, 0.25, 0.3, D, [0, 11.5 + i * 0.55, -37.25], [-0.15, 0, 0]);
    for (const s of [-1, 1]) {
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      // Hộp đèn: đèn pha tròn lõm trong chén đèn có vành thép, kính vòm khía rãnh (đèn trái nứt), xi-nhan hổ phách
      // khía gân, đèn mờ hành quân ban đêm (khe hẹp); lồng thép bảo vệ có một thanh bị cong
      hb.box(3.0, 1.8, 0.6, D, [s * 8.3, 8.8, -38.7]);
      const lx = s * 7.6, ly = 8.9;
      hb.cyl(0.78, 0.74, 0.4, 18, D, [lx, ly, -39.15], 'z');
      hb.add(new THREE.TorusGeometry(0.68, 0.08, 6, 20), M.steel, [lx, ly, -39.36]);
      hb.add(domeLens(0.64, 0.12), s < 0 ? M.headLensL : M.headLensR, [lx, ly, -39.3]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        hb.cyl(0.05, 0.05, 0.08, 6, M.steel, [lx + Math.cos(a) * 0.68, ly + Math.sin(a) * 0.68, -39.42], 'z');
      }
      hb.box(0.62, 0.42, 0.2, D, [s * 9.3, 9.28, -39.05]);
      hb.box(0.52, 0.32, 0.08, M.amberLens, [s * 9.3, 9.28, -39.17]);
      for (let i = 0; i < 3; i++) hb.box(0.5, 0.03, 0.04, M.amberLens, [s * 9.3, 9.18 + i * 0.1, -39.22]);
      hb.box(0.62, 0.36, 0.22, D, [s * 9.3, 8.45, -39.06]);
      for (let i = 0; i < 3; i++) hb.box(0.36, 0.035, 0.05, M.lens, [s * 9.3, 8.36 + i * 0.09, -39.18]);
      hb.box(3.4, 0.18, 0.18, P, [s * 8.3, 10.0, -39.6]);
      hb.box(0.18, 2.2, 0.18, P, [s * 6.6, 8.9, -39.6]);
      hb.box(0.18, 2.2, 0.18, P, [s * 10.0, 8.9, -39.6]);
      for (const bx of [-0.35, 0.35]) {
        const bent = s < 0 && bx > 0;
        hb.box(0.12, 2.0, 0.12, P, [lx + bx + (bent ? 0.12 : 0), 8.9, -39.62 + (bent ? 0.08 : 0)], [bent ? 0.12 : 0, 0, bent ? -0.14 : 0]);
      }
      hb.setTag(null);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12, Math.PI * 1.3), M.steel, [s * 4.0, 6.4, -38.8], [0, Math.PI / 2, Math.PI * 0.85]);
    }
    hb.box(5.0, 2.2, 1.8, D, [0, 7.6, -38.8]);
    hb.cyl(0.9, 0.9, 3.8, 12, M.steel, [0, 7.6, -39.2], 'x');

    // Nóc cabin: cửa nóc, đèn quay, ăng-ten, giá khóa nòng hành quân
    hb.cyl(1.9, 2.0, 0.4, 18, P, [-4.6, CAB_ROOF + 0.2, -27.0]);
    hb.box(1.0, 0.35, 0.6, D, [-4.6, CAB_ROOF + 0.35, -25.0]);
    hb.cyl(0.4, 0.45, 0.6, 8, D, [7.6, CAB_ROOF + 0.3, -31.5]);
    const cabAnt = new VehicleKit.AntennaSet(D, chassis);
    cabAnt.add([7.6, CAB_ROOF + 0.6, -31.5], 11, { tilt: [0.1, 0], r0: 0.08, r1: 0.045 });
    cabAnt.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(cabAnt);
    hb.setTag('travelLock');
    for (const s of [-1, 1]) hb.beam([s * 3.4, CAB_ROOF, -21.6], [s * 1.6, CAB_ROOF + 2.3, -21.6], 0.5, 0.5, P);
    hb.box(4.2, 0.5, 1.2, P, [0, CAB_ROOF + 2.4, -21.6]);
    hb.add(new THREE.TorusGeometry(1.55, 0.28, 6, 14, Math.PI), D, [0, CAB_ROOF + 2.6, -21.6], [0, 0, Math.PI]);
    hb.setTag(null);

    // Khoang động cơ sau cabin + lá chớp tản nhiệt + ống xả dựng đứng + ống hút gió
    hb.box(19.0, 9.0, 7.4, P, [0, 12.6, -14.8]);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) hb.box(0.2, 0.3, 5.6, D, [s * 9.55, 10.4 + i * 0.9, -14.8], [0, 0, s * 0.5]);
    }
    hb.cyl(0.75, 0.75, 11.5, 12, D, [9.6, 17.2, -12.0]);
    hb.cyl(0.95, 0.95, 5.0, 12, M.steel, [9.6, 16.0, -12.0], 'y', null, true);
    // Đầu ống xả đen muội, mũ chắn mưa vênh
    hb.cyl(0.78, 0.78, 3.2, 12, M.soot, [9.6, 21.5, -12.0], 'y', null, true);
    hb.cyl(0.85, 0.75, 0.6, 12, M.soot, [9.6, 23.2, -12.0]);
    hb.box(1.5, 0.08, 1.3, M.soot, [9.75, 23.62, -11.9], [0.08, 0, -0.32]);
    hb.cyl(0.65, 0.65, 10.0, 12, P, [-9.7, 17.0, -12.4]);
    hb.box(1.6, 1.4, 1.6, P, [-9.7, 22.5, -12.4]);
    unit.exhaustLeft = new THREE.Object3D();
    unit.exhaustLeft.position.set(9.6, 23.8, -12.0);
    unit.exhaustRight = new THREE.Object3D();
    unit.exhaustRight.position.set(9.6, 23.6, -11.6);
    chassis.add(unit.exhaustLeft);
    chassis.add(unit.exhaustRight);

    // Khung gầm 2 dầm dọc + dầm ngang
    for (const s of [-1, 1]) hb.box(1.8, 4.0, 74, D, [s * 4.6, 9.2, 0.5]);
    for (const z of [-30, -10, 4, 18, 30, 36]) hb.box(9.2, 1.4, 1.0, D, [0, 9.6, z]);

    // Sàn xe sau
    hb.box(HALF_W * 2 - 0.4, 1.2, 48.4, P, [0, DECK_Y - 0.6, 13.0]);
    hb.box(HALF_W * 2 - 0.2, 0.5, 0.5, P, [0, DECK_Y - 0.25, -11.0]);

    // Cầu xe: vỏ cầu, vi sai, nhíp/giảm chấn, chắn bùn
    for (const a of AXLES) {
      hb.cyl(0.85, 0.85, 14.4, 10, D, [0, WHEEL_Y, a.z], 'x');
      hb.cyl(1.7, 1.7, 2.4, 12, D, [0, WHEEL_Y, a.z + 0.4], 'z');
      for (const s of [-1, 1]) {
        hb.box(1.4, 0.9, 9.0, D, [s * 4.6, WHEEL_Y + 1.3, a.z]);
        hb.strut([s * 6.4, WHEEL_Y + 0.5, a.z - 1.2], [s * 5.8, 9.4, a.z - 2.6], 0.32, M.steel, 8);
      }
    }
    for (const s of [-1, 1]) {
      // Chắn bùn cụm bánh sau + tấm chắn bùn cao su
      if (s > 0) {
        hb.box(4.6, 0.3, 25.0, P, [s * 9.0, 11.4, 18.2]);
      } else {
        // Bên trái: đuôi chắn bùn bị va quệt, gập xuống & vặn méo
        hb.box(4.6, 0.3, 18.4, P, [s * 9.0, 11.4, 14.9]);
        hb.box(4.6, 0.3, 6.7, P, [s * 9.0 - 0.08, 11.4 - 3.35 * Math.sin(0.14), 24.1 + 3.35 * Math.cos(0.14)], [0.14, 0, 0.06]);
      }
      hb.setTag('flap' + (s < 0 ? 'L' : 'R'));
      if (s < 0) {
        hb.box(3.8, 3.2, 0.15, M.rubber, [s * 9.0, 3.85, 31.0], [0.12, 0, 0]);
      } else {
        // Tấm phải rách mất một góc dưới, cong vênh do bùn đá
        hb.box(3.8, 2.0, 0.15, M.rubber, [s * 9.0, 4.6, 30.3], [0.1, 0.06, 0.03]);
        hb.box(2.2, 1.3, 0.15, M.rubber, [s * 9.0 - 0.75, 3.05, 30.45], [0.2, 0.08, 0.1]);
      }
      hb.setTag(null);
      hb.box(3.8, 3.2, 0.15, M.rubber, [s * 9.0, 4.0, -20.2], [s < 0 ? 0.05 : -0.04, 0, 0]);
    }

    // Thùng nhiên liệu, hộp ắc quy/dụng cụ, tủ đồ giữa hai cụm bánh
    hb.setTag('fuelTank');
    hb.cyl(1.75, 1.75, 9.0, 16, P, [-9.0, 9.0, -5.5], 'z');
    for (const z of [-8.0, -3.0]) hb.cyl(1.82, 1.82, 0.3, 16, D, [-9.0, 9.0, z], 'z');
    hb.setTag(null);
    hb.box(3.2, 3.4, 8.0, P, [8.8, 9.2, -5.8]);
    hb.box(0.1, 0.1, 7.6, D, [10.42, 10.6, -5.8]);
    for (const s of [-1, 1]) {
      hb.setTag('box' + (s < 0 ? 'L' : 'R'));
      hb.box(3.2, 3.4, 4.6, P, [s * 8.8, 9.2, 3.0]);
      hb.box(0.1, 3.0, 0.1, D, [s * 10.42, 9.2, 3.0]);
      hb.setTag(null);
    }

    // Trên sàn trước tháp (bánh dự phòng dựng riêng ở buildSpareWheel): thùng đạn, máy phát, xẻng, cuộn bạt
    buildDeckStowage(hb, M, rnd);

    // Đuôi xe: cản sau, đèn hậu, móc kéo, bậc lên tháp
    hb.box(21.4, 1.8, 1.2, P, [0, 9.6, 37.4]);
    for (const s of [-1, 1]) {
      hb.box(2.0, 1.0, 0.4, D, [s * 8.6, 10.6, 38.1]);
      hb.box(0.8, 0.6, 0.12, M.tailLens, [s * 9.1, 10.6, 38.32]);
      hb.box(0.6, 0.5, 0.12, M.lens, [s * 8.0, 10.6, 38.32]);
    }
    hb.box(2.2, 1.4, 1.4, D, [0, 6.4, 37.6]);

    // --- Chi tiết bề mặt cabin bọc giáp: khung kính dày, bản lề, gờ thoát nước, bu-lông tấm giáp ---
    for (const s of [-1, 1]) {
      const x = s * (HALF_W + 0.1);
      // Khung kính cửa (gioăng cao su + nẹp thép bắt bu-lông)
      const frame = (z0, z1, y0, y1) => {
        hb.box(0.22, 0.35, z1 - z0 + 0.35, P, [x, y1 + 0.17, (z0 + z1) / 2]);
        hb.box(0.22, 0.35, z1 - z0 + 0.35, P, [x, y0 - 0.17, (z0 + z1) / 2]);
        hb.box(0.22, y1 - y0, 0.35, P, [x, (y0 + y1) / 2, z0 - 0.17]);
        hb.box(0.22, y1 - y0, 0.35, P, [x, (y0 + y1) / 2, z1 + 0.17]);
      };
      frame(-32.35, -24.85, 15.0, 21.0);
      frame(-23.9, -20.9, 16.6, 20.6);
      hb.boltRow([x, 21.45, -32.0], [x, 21.45, -25.2], 6, 'x', D, 0.13, s);
      hb.boltRow([x, 14.55, -32.0], [x, 14.55, -25.2], 6, 'x', D, 0.13, s);
      // Bản lề cửa trước (mép trước cửa)
      for (const y of [12.6, 19.6]) hb.hinge([s * (HALF_W + 0.22), y, -32.75], 'y', 1.7, P, 0.24);
      // Gờ thoát nước mưa dọc mép nóc
      hb.box(0.3, 0.3, 13.8, P, [s * (HALF_W + 0.05), CAB_ROOF - 0.45, -26.4]);
      // Đường ghép tấm giáp sườn cabin dưới cửa + hàng bu-lông
      hb.seam([s * (HALF_W + 0.02), 13.2, -35.6], [s * (HALF_W + 0.02), 13.2, -33.0], [s, 0, 0], D);
      hb.boltRow([s * HALF_W, 12.6, -24.0], [s * HALF_W, 12.6, -19.2], 4, 'x', D, 0.15, s);
    }
    // Nóc cabin: đường ghép, bu-lông viền, móc cẩu
    hb.seam([-HALF_W + 0.8, CAB_ROOF + 0.02, -29.6], [HALF_W - 0.8, CAB_ROOF + 0.02, -29.6], [0, 1, 0], D);
    for (const s of [-1, 1]) {
      hb.boltRow([s * (HALF_W - 0.6), CAB_ROOF, -32.4], [s * (HALF_W - 0.6), CAB_ROOF, -20.4], 8, 'y', D, 0.15);
      for (const z of [-32.4, -20.2]) {
        hb.add(new THREE.TorusGeometry(0.42, 0.13, 5, 10), M.steel, [s * (HALF_W - 1.6), CAB_ROOF + 0.4, z], [0, Math.PI / 2, 0]);
      }
    }
    // Viền khung kính chắn gió bắt bu-lông
    hb.boltRow([-9.6, 15.0, -37.05], [9.6, 15.0, -37.05], 14, 'z', D, 0.14, -1, [wsAngle, 0, 0]);
    // Khoang máy: bu-lông viền nắp, móc cẩu, đường ghép nắp thăm
    for (const s of [-1, 1]) {
      hb.boltRow([s * 8.9, 17.1, -17.8], [s * 8.9, 17.1, -11.8], 5, 'y', D, 0.15);
      hb.add(new THREE.TorusGeometry(0.42, 0.13, 5, 10), M.steel, [s * 7.6, 17.5, -14.8], [0, Math.PI / 2, 0]);
    }
    hb.seam([-8.6, 17.12, -14.8], [8.6, 17.12, -14.8], [0, 1, 0], D);
    hb.seam([0, 17.12, -18.2], [0, 17.12, -11.4], [0, 1, 0], D);

    const meshes = hb.build(chassis, [0, 12, 0]);
    unit.hullMainMesh = meshes.get(P);
  }

  // ===========================================================================
  // BÁNH DỰ PHÒNG: lốp thật (mặt cắt bo tròn, gai chữ V, chữ nổi hông lốp), vành thép lòng chảo có moay-ơ
  // và đai ốc, nằm trên 2 thanh gỗ kê, kẹp bằng ty ren + tai hồng giữa moay-ơ và 1 dây chằng tăng đơ.
  // Đặt hơi lệch (không thẳng tăm tắp) như được quăng lên & chằng vội ngoài thực địa.
  // ===========================================================================
  function buildSpareWheel(chassis, M) {
    const g = new THREE.Group();
    g.position.set(-4.7, DECK_Y, -4.4);
    g.rotation.set(0.016, 0.42, -0.012);
    chassis.add(g);
    const b = new VehicleKit.PartBatch(DECK_Y);
    b.setTag('spare');
    const LUG = 0.55, R = WHEEL_R - LUG, H = TIRE_W * 0.47, BEAD = 2.55;
    const yc = 0.95 + H;

    // Lốp cùng kiểu 6 bánh xe (gai chữ V đúc liền, chữ nổi hông), nằm ngửa hông ngoài lên trên
    for (const geo of tireGeos({ R, H, bead: BEAD, lugH: LUG, seed: 23 }, M)) b.add(geo, M.tire, [0, yc, 0], [0, 0.3, 0]);

    // Vành thép: ống vành trong lốp + mặt vành lòng chảo (lathe từ mép ngoài vào tâm)
    b.cyl(BEAD + 0.02, BEAD + 0.02, H * 1.6, 30, M.paintDusty, [0, yc, 0], 'y', null, true);
    b.add(rimFaceGeo(BEAD, H), M.paintDusty, [0, yc, 0]);
    // Moay-ơ, đai ốc bánh (thiếu 1 con — mất ngoài chiến trường chưa kịp thay), van bơm hơi
    b.cyl(0.82, 0.92, 0.42, 14, M.steel, [0, yc + H * 0.6 + 0.2, 0]);
    for (let i = 0; i < 10; i++) {
      if (i === 3) continue;
      const a = (i / 10) * Math.PI * 2 + 0.2;
      b.cyl(0.18, 0.18, 0.3, 6, M.steel, [Math.cos(a) * 1.72, yc + H * 0.3 + 0.15, Math.sin(a) * 1.72]);
    }
    b.cyl(0.07, 0.07, 0.55, 6, M.steel, [2.15, yc + H * 0.55, 0.75], 'y', [0, 0, -0.45]);

    // Kê trên 2 thanh gỗ, ty ren giữa moay-ơ + tấm kẹp + tai hồng
    for (const x of [-2.6, 2.6]) b.box(1.0, 0.95, 9.6, M.wood, [x, 0.475, 0], [0, x > 0 ? 0.03 : -0.02, 0]);
    const top = yc + H * 0.6 + 0.41;
    b.strut([0, -0.1, 0], [0, top + 0.75, 0], 0.17, M.steel, 8);
    b.box(3.4, 0.22, 0.8, M.paintDusty, [0, top + 0.11, 0], [0, 0.25, 0]);
    b.cyl(0.32, 0.32, 0.3, 6, M.steel, [0, top + 0.37, 0]);
    for (const s of [-1, 1]) b.box(0.7, 0.42, 0.1, M.steel, [s * 0.45, top + 0.45, 0], [0, 0.25, s * 0.2]);

    // Dây chằng vải + khóa tăng đơ, hai đầu móc vào khoen trên sàn (chạy dọc trục z cục bộ, lệch khỏi moay-ơ)
    const sx = 1.7;
    const zo = Math.sqrt((R + LUG * 0.3) ** 2 - sx * sx), zr = Math.sqrt((BEAD + 0.2) ** 2 - sx * sx);
    const path = [
      [0.02, -6.3], [yc - 0.5, -zo - 0.62], [yc + 0.85, -zo - 0.5], [yc + H + 0.1, -zo + 0.35], [yc + H + 0.08, -zr],
      [yc + H + 0.02, 0], [yc + H + 0.08, zr], [yc + H + 0.1, zo - 0.35], [yc + 0.85, zo + 0.5], [yc - 0.5, zo + 0.62], [0.02, 6.3]
    ];
    for (let i = 0; i < path.length - 1; i++) {
      b.beam([sx, path[i][0], path[i][1]], [sx, path[i + 1][0], path[i + 1][1]], 0.75, 0.07, M.canvasDark);
    }
    b.box(0.95, 1.15, 0.5, M.steel, [sx, yc + 0.1, -zo - 0.68], [-0.08, 0, 0]);
    b.box(1.1, 0.12, 0.22, M.steel, [sx, yc + 0.72, -zo - 0.9], [0.5, 0, 0]);
    for (const z of [-6.4, 6.4]) b.add(new THREE.TorusGeometry(0.4, 0.12, 5, 10), M.steel, [sx, 0.2, z], [0, Math.PI / 2, 0]);

    b.build(g);
  }

  // Lathe quanh trục đứng, UV chiếu từ trên xuống (đơn vị thế giới) -> vân sơn / bùn liền mạch trên mặt vành, lốp nằm
  function latheTopUV(points, seg) {
    // nắn mặt cắt thành đường cong mượt: không gãy góc > 35° -> shader mòn mép không vẽ răng cưa quanh vành
    const smoothPts = new THREE.SplineCurve(points).getPoints(points.length * 3);
    const geo = new THREE.LatheGeometry(smoothPts, seg).toNonIndexed();
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * VehicleKit.UV_SCALE, pos.getZ(i) * VehicleKit.UV_SCALE + pos.getY(i) * 0.02);
    geo.userData.customUV = true;
    return geo;
  }

  // Kính đèn vòm (chỏm cầu) hướng -z, bán kính miệng r, độ phồng h; UV phẳng theo mặt kính (0..1 trên miệng đèn)
  function domeLens(r, h) {
    const R = (r * r + h * h) / (2 * h), th = Math.asin(r / R);
    const g = new THREE.SphereGeometry(R, 20, 5, 0, Math.PI * 2, 0, th).toNonIndexed();
    g.translate(0, -(R - h), 0);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 - pos.getX(i) / (2 * r), 0.5 + pos.getY(i) / (2 * r));
    return g;
  }

  // Mặt vành thép lòng chảo (trục Y, mặt ngoài hướng +Y): mép vành cuộn, thành chảo lõm, mặt bắt bu-lông, moay-ơ
  function rimFaceGeo(bead, H) {
    return latheTopUV([
      [bead + 0.28, H * 0.74], [bead + 0.26, H * 0.9], [bead + 0.02, H * 0.95], [bead - 0.12, H * 0.8],
      [bead - 0.34, H * 0.42], [bead - 0.56, H * 0.3], [1.45, H * 0.3], [1.33, H * 0.38], [1.2, H * 0.56], [0.9, H * 0.6]
    ].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  }

  // Lốp từ VehicleKit.tireGeometry; không có vật liệu lốp riêng (không có document) thì trụ cao su đơn giản
  function tireGeos(opts, M) {
    if (M.tire !== M.rubber) return VehicleKit.tireGeometry(opts);
    return [new THREE.CylinderGeometry(opts.R + opts.lugH, opts.R + opts.lugH, opts.H * 2, 24)];
  }

  // Điểm cục bộ (lx, ly, lz) của vật đặt tại c, xoay rotY quanh trục đứng -> tọa độ cha
  function rotPt(c, rotY, lx, ly, lz) {
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    return [c[0] + lx * cs + lz * sn, c[1] + ly, c[2] - lx * sn + lz * cs];
  }

  // Thùng đạn thép: thân dập gân, nắp chụp có khe, quai xách hai đầu, khóa gài mặt bên
  function steelCrate(hb, M, c, rotY, w, h, d) {
    const at = (x, y, z) => rotPt(c, rotY, x, y, z), r = [0, rotY, 0];
    hb.box(w, h * 0.78, d, M.paint, at(0, h * 0.39, 0), r);
    hb.box(w + 0.1, h * 0.2, d + 0.1, M.paint, at(0, h * 0.89, 0), r);
    hb.box(w + 0.14, 0.06, d + 0.14, M.dark, at(0, h * 0.785, 0), r);
    for (const z of [-d * 0.28, d * 0.28]) hb.box(w + 0.08, h * 0.6, 0.16, M.paint, at(0, h * 0.4, z), r);
    for (const s of [-1, 1]) {
      hb.box(w * 0.45, 0.12, 0.12, M.steel, at(0, h * 0.62, s * (d / 2 + 0.22)), r);
      for (const x of [-w * 0.24, w * 0.24]) hb.box(0.14, 0.32, 0.26, M.dark, at(x, h * 0.62, s * (d / 2 + 0.1)), r);
      hb.box(0.12, 0.42, 0.32, M.steel, at(w / 2 + 0.07, h * 0.76, s * d * 0.3), r);
    }
    // nhãn lô đạn giấy đã bạc, rách
    hb.box(0.03, h * 0.3, d * 0.28, M.canvas, at(w / 2 + 0.02, h * 0.4, -d * 0.02), [0.04, rotY, 0]);
  }

  // Thùng gỗ: ván ghép (khe sẫm), nẹp đầu, quai dây thừng
  function woodCrate(hb, M, c, rotY, w, h, d) {
    const at = (x, y, z) => rotPt(c, rotY, x, y, z), r = [0, rotY, 0];
    hb.box(w, h, d, M.wood, at(0, h / 2, 0), r);
    for (const k of [-1, 0, 1]) {
      hb.box(w + 0.03, 0.05, d + 0.03, M.dark, at(0, h / 2 + k * h * 0.28, 0), r);
    }
    hb.box(w + 0.03, h + 0.03, 0.05, M.dark, at(0, h / 2, 0), r);
    for (const s of [-1, 1]) {
      hb.box(w + 0.16, h + 0.08, 0.3, M.wood, at(0, h / 2, s * (d / 2 - 0.15)), r);
      hb.add(new THREE.TorusGeometry(0.32, 0.07, 4, 10, Math.PI), M.canvas, at(0, h * 0.62, s * (d / 2 + 0.05)), r);
    }
  }

  // Đồ trên sàn trước tháp: thùng đạn chồng lệch, máy phát điện khung ống, xẻng kẹp sàn, cuộn bạt trên nóc khoang máy
  function buildDeckStowage(hb, M, rnd) {
    const P = M.paint, D = M.dark;

    hb.setTag('ammoBoxes');
    steelCrate(hb, M, [4.3, DECK_Y, -8.0], 0.04, 2.6, 1.6, 3.6);
    steelCrate(hb, M, [4.2, DECK_Y, -4.1], -0.05, 2.6, 1.6, 3.6);
    woodCrate(hb, M, [4.45, DECK_Y + 1.62, -6.3], 0.17 + rnd() * 0.06, 2.4, 1.25, 3.3);

    // Máy phát điện dã chiến: khung ống, động cơ, đầu phát, bình xăng trên nóc, ống xả muội, bảng điện
    hb.setTag('generator');
    const gc = [6.5, DECK_Y, 1.8], gr = -0.08;
    const G = (x, y, z) => rotPt(gc, gr, x, y, z), grot = [0, gr, 0];
    const fx = 1.6, fz = 1.45, fy = 2.45;
    for (const x of [-fx, fx]) {
      hb.box(0.35, 0.25, fz * 2 + 0.3, D, G(x, 0.13, 0), grot);
      for (const z of [-fz, fz]) hb.strut(G(x, 0.25, z), G(x, fy, z), 0.13, P, 6);
      hb.strut(G(x, fy, -fz), G(x, fy, fz), 0.13, P, 6);
    }
    for (const z of [-fz, fz]) hb.strut(G(-fx, fy, z), G(fx, fy, z), 0.13, P, 6);
    hb.box(1.8, 1.2, 1.6, D, G(-0.45, 0.85, 0.2), grot);
    for (let i = 0; i < 4; i++) hb.box(1.4, 0.08, 0.1, D, G(-0.45, 1.5, -0.4 + i * 0.38), grot);
    hb.cyl(0.62, 0.62, 1.2, 14, D, G(0.95, 0.85, 0.2), 'x', grot);
    hb.box(2.9, 0.62, 2.2, P, G(0, 2.02, 0), grot);
    hb.cyl(0.24, 0.26, 0.2, 10, M.steel, G(0.85, 2.42, -0.55));
    hb.cyl(0.3, 0.3, 1.4, 10, M.soot, G(-1.15, 1.45, -0.3), 'z', grot);
    hb.cyl(0.13, 0.13, 0.5, 6, M.soot, G(-1.15, 1.45, -1.15), 'z', grot);
    hb.box(0.14, 0.75, 1.0, D, G(fx + 0.05, 1.15, -0.75), grot);
    for (const z of [-1.0, -0.6]) hb.cyl(0.07, 0.07, 0.06, 8, M.tailLens, G(fx + 0.13, 1.35, z), 'x', grot);
    hb.cyl(0.13, 0.13, 0.2, 8, M.steel, G(fx + 0.15, 0.95, -0.5), 'x', grot);
    // Cáp điện võng xuống sàn rồi bò về phía tháp
    const cable = [G(fx + 0.2, 0.95, -0.5), G(fx + 1.1, 0.5, -0.1), G(fx + 1.1, 0.1, 0.9), G(fx + 0.4, 0.1, 2.4), G(fx - 0.6, 0.1, 3.4)];
    for (let i = 0; i < cable.length - 1; i++) hb.strut(cable[i], cable[i + 1], 0.09, M.rubber, 5);

    // Xẻng công binh kẹp nằm trên sàn
    hb.setTag('tool');
    const sc = [8.65, DECK_Y, -6.4], sr = 0.07;
    const Sh = (x, y, z) => rotPt(sc, sr, x, y, z);
    hb.strut(Sh(0, 0.3, -3.6), Sh(0, 0.3, 1.5), 0.16, M.wood, 6);
    hb.add(new THREE.TorusGeometry(0.42, 0.09, 4, 10), M.wood, Sh(0, 0.3, -4.0), [Math.PI / 2, sr, 0, 'YXZ']);
    hb.cyl(0.22, 0.26, 0.9, 8, M.paintDusty, Sh(0, 0.3, 1.85), 'z', [0, sr, 0]);
    hb.box(1.55, 0.1, 1.9, M.paintDusty, Sh(0, 0.2, 3.2), [0.06, sr, 0.04]);
    for (const z of [-2.6, 0.4]) hb.box(0.85, 0.5, 0.3, M.steel, Sh(0, 0.25, z), [0, sr, 0]);

    // Cuộn bạt chằng trên nóc khoang máy: cuộn phồng xẹp không đều, thắt lại ở chỗ dây, đầu cuộn lộ lớp vải
    // cuộn tròn, một mép bạt thõng xuống
    hb.setTag('tarpRoll');
    const ty = 17.1, tz = -12.9, x0 = -6.2, x1 = 6.2;
    const cuts = [x0, -4.6, -2.4, 0.3, 2.8, 4.7, x1];
    const straps = [-4.6, 0.3, 4.7];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], c = cuts[i + 1];
      const ra = straps.includes(a) ? 0.84 : 0.88 + rnd() * 0.12, rc = straps.includes(c) ? 0.84 : 0.88 + rnd() * 0.12;
      const rm = Math.max(ra, rc) + 0.02 + rnd() * 0.08;
      const mid = (a + c) / 2, dy = rnd() * 0.08, dz = (rnd() - 0.5) * 0.18;
      hb.cyl(rm, ra, mid - a, 12, M.canvasDark, [(a + mid) / 2, ty + 0.9 + dy, tz + dz], 'x');
      hb.cyl(rc, rm, c - mid, 12, M.canvasDark, [(mid + c) / 2, ty + 0.9 + dy, tz + dz], 'x');
    }
    for (const [x, sx] of [[x0, -1], [x1, 1]]) {
      for (const r of [0.66, 0.4]) hb.cyl(r, r, 0.12, 12, M.canvas, [x + sx * 0.02, ty + 0.9, tz], 'x');
    }
    hb.box(2.4, 0.06, 1.3, M.canvasDark, [1.6, ty + 0.6, tz + 1.15], [-1.25, 0.04, 0.05]);
    hb.box(2.3, 0.06, 0.9, M.canvasDark, [1.62, ty - 0.05, tz + 1.75], [-1.5, 0.06, 0.03]);
    for (const x of straps) {
      hb.add(new THREE.TorusGeometry(0.88, 0.08, 4, 14), M.dark, [x, ty + 0.9, tz], [0, Math.PI / 2, 0]);
      hb.box(0.28, 0.32, 0.36, M.steel, [x, ty + 1.6, tz - 0.55], [0.6, 0, 0]);
    }
    hb.setTag(null);
  }

  // ===========================================================================
  // BÁNH LỐP ĐỊA HÌNH 6x6
  // ===========================================================================
  function buildWheels(chassis, M) {
    const positions = [];
    for (const a of AXLES) for (const s of [-1, 1]) positions.push({ x: s * WHEEL_X, y: WHEEL_Y, z: a.z, steer: a.steer });
    return new VehicleKit.WheelSet(chassis, (b) => {
      const hw = TIRE_W / 2;
      // Lốp: thân lốp mặt cắt thật + gai chữ V đúc liền vắt qua vai + chữ nổi hông ngoài (trục Y xoay thành X)
      for (const geo of tireGeos({ R: WHEEL_R - 0.55, H: hw, bead: 2.6, lugH: 0.55, seed: 11 }, M)) {
        geo.rotateZ(-Math.PI / 2);
        b.add(geo, M.tire, [0, 0, 0]);
      }
      // Vành lòng chảo (ống vành + mặt vành lõm, cùng mặt cắt bánh dự phòng), moay-ơ, đai ốc trên đáy chảo,
      // nắp van bơm hơi trung tâm + ống dẫn hơi ra mép vành
      b.cyl(2.62, 2.62, TIRE_W * 0.82, 24, M.paintDusty, [0, 0, 0], 'x', null, true);
      const face = rimFaceGeo(2.6, hw);
      face.rotateZ(-Math.PI / 2);
      b.add(face, M.paintDusty, [0, 0, 0]);
      b.cyl(1.05, 1.15, 1.5, 14, M.steel, [hw - 0.05, 0, 0], 'x');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.cyl(0.17, 0.17, 0.3, 6, M.steel, [hw * 0.3 + 0.15, Math.cos(a) * 1.72, Math.sin(a) * 1.72], 'x');
      }
      b.cyl(0.45, 0.45, 0.8, 10, M.paintDusty, [hw + 0.8, 0, 0], 'x');
      b.beam([hw + 0.6, 0.3, 0], [hw * 0.92, 2.45, 0.45], 0.16, 0.16, M.dark);
    }, positions, WHEEL_R);
  }

  // ===========================================================================
  // CHÂN CHỐNG THỦY LỰC & LƯỠI CÀNG SAU (kiểu pháo xe tải thật)
  // ===========================================================================
  // - Lưỡi càng: 2 tay đòn thép hộp bản lề ở đuôi khung gầm, đầu dưới là xẻng cong có lưỡi cắt;
  //   hành quân dựng đứng gọn sau đuôi xe, triển khai thì 2 xi-lanh thủy lực ép xuống cắm đất.
  // - 4 chân chống ống lồng hộp vuông bắt vào khung gầm qua giá đỡ, đế tì tròn lớn có gân.
  function buildDeployGear(chassis, M) {
    const P = M.paint, D = M.dark;
    const gear = { jacks: [], spade: null, struts: [] };

    // Chân chống: giá đỡ + vỏ ống lồng cố định; cần trong + đế tì di chuyển
    const hb = new VehicleKit.PartBatch(0);
    for (const z of JACK_Z) {
      for (const s of [-1, 1]) {
        const x = s * JACK_X;
        hb.box(JACK_X - 5.4, 1.6, 2.4, D, [s * (5.4 + (JACK_X - 5.4) / 2), 9.6, z]);
        hb.box(2.4, 6.6, 2.4, P, [x, 8.2, z]);
        hb.box(2.8, 0.5, 2.8, P, [x, 11.75, z]);
        hb.box(2.6, 0.3, 2.6, D, [x, 4.95, z]);
        hb.strut([x - s * 1.25, 10.8, z], [s * 6.0, 10.2, z + 0.9], 0.16, D, 6);
        const leg = new THREE.Group();
        leg.position.set(x, 0, z);
        const lb = new VehicleKit.PartBatch(0);
        lb.box(1.7, 6.0, 1.7, M.steel, [0, 7.4, 0]);
        lb.cyl(0.9, 0.9, 0.8, 12, D, [0, 4.75, 0]);
        lb.cyl(2.2, 2.4, 0.6, 20, M.paintDusty, [0, 4.2, 0]);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          lb.box(0.35, 0.5, 1.6, M.paintDusty, [Math.cos(a) * 1.3, 4.7, Math.sin(a) * 1.3], [0, -a + Math.PI / 2, 0]);
        }
        lb.build(leg);
        chassis.add(leg);
        gear.jacks.push(leg);
      }
    }
    // Giá bản lề lưỡi càng bắt vào đuôi khung gầm
    for (const s of [-1, 1]) {
      hb.box(1.8, 2.6, 3.4, D, [s * 6.6, SPADE_PIVOT.y + 0.4, SPADE_PIVOT.z - 1.4]);
      hb.box(2.2, 1.2, 1.2, D, [s * 4.2, 8.0, 34.0]);
    }
    hb.build(chassis);

    // Cụm lưỡi càng (hệ cục bộ: tay đòn chạy theo -Y từ bản lề)
    const spade = new THREE.Group();
    spade.position.set(0, SPADE_PIVOT.y, SPADE_PIVOT.z);
    const sb = new VehicleKit.PartBatch(SPADE_PIVOT.y);
    const L = SPADE_LEN, BH = 3.8;
    sb.cyl(0.9, 0.9, 15.6, 14, D, [0, 0, 0], 'x');
    for (const s of [-1, 1]) {
      sb.box(1.5, L - BH + 0.6, 1.5, P, [s * 6.6, -(L - BH + 0.6) / 2, 0]);
      sb.box(1.9, 1.9, 1.9, D, [s * 6.6, 0, 0]);
    }
    sb.box(13.2, 1.1, 1.1, P, [0, -SPADE_CYL_LOCAL.y, SPADE_CYL_LOCAL.z]);
    sb.box(13.2, 0.9, 0.9, P, [0, -(L - BH) + 0.2, 0]);
    // Xẻng cong: mặt cắt hình cung, đùn theo bề ngang
    const front = [], back = [];
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      const y = -L + BH * k;
      const z = 0.65 * Math.sin(Math.PI * k);
      front.push([z, y]);
      back.unshift([z + 0.55, y]);
    }
    sb.add(VehicleKit.sideProfile(front.concat(back), 17.6, 0.06), M.paintDusty);
    // Lưỡi cắt thép + gân gia cường + 2 tấm má
    sb.box(17.8, 0.45, 0.8, M.steel, [0, -L + 0.15, 0.25]);
    for (const x of [-6.6, -2.2, 2.2, 6.6]) sb.box(0.45, BH - 0.4, 0.9, M.paintDusty, [x, -L + BH / 2, -0.35]);
    for (const s of [-1, 1]) {
      sb.add(VehicleKit.sideProfile([[0.0, -L + BH + 1.6], [0.0, -L + 0.3], [1.3, -L + 0.6], [1.0, -L + BH]], 0.45, 0.04), P, [s * 8.6, 0, 0]);
    }
    sb.build(spade);
    chassis.add(spade);
    gear.spade = spade;

    // 2 xi-lanh thủy lực: vỏ sơn + cần piston thép, đặt lại theo góc lưỡi càng mỗi khung hình
    for (const s of [-1, 1]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1, 14), P);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 12), M.steel);
      body.castShadow = rod.castShadow = true;
      chassis.add(body);
      chassis.add(rod);
      gear.struts.push({ x: s * 4.2, body, rod });
    }
    return gear;
  }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function placeCylinder(mesh, p0, p1) {
    _d.subVectors(p1, p0);
    const len = Math.max(0.01, _d.length());
    mesh.position.copy(p0).addScaledVector(_d, 0.5);
    mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
    mesh.scale.set(1, len, 1);
  }

  function smooth(x) {
    const k = Math.max(0, Math.min(1, x));
    return k * k * (3 - 2 * k);
  }

  function updateDeployGear(gear, d) {
    // Chân chống hạ trước (0 -> 0.55), lưỡi càng hạ sau (0.35 -> 1)
    const jackK = smooth(d / 0.55);
    for (const leg of gear.jacks) leg.position.y = -JACK_DROP * jackK;

    const spadeK = smooth((d - 0.35) / 0.65);
    const ang = SPADE_TRAVEL + (SPADE_DEPLOYED - SPADE_TRAVEL) * spadeK;
    gear.spade.rotation.x = ang;

    // Điểm bám xi-lanh trên dầm ngang của lưỡi càng -> hệ chassis
    const c = Math.cos(ang), s = Math.sin(ang);
    const ly = -SPADE_CYL_LOCAL.y, lz = SPADE_CYL_LOCAL.z;
    const wy = SPADE_PIVOT.y + ly * c - lz * s;
    const wz = SPADE_PIVOT.z + ly * s + lz * c;
    for (const st of gear.struts) {
      _a.set(st.x, 8.0, 34.0);
      _b.set(st.x, wy, wz);
      const total = _a.distanceTo(_b);
      const bodyLen = Math.min(total - 1.5, 4.2);
      _d.subVectors(_b, _a).normalize();
      const mid = _a.clone().addScaledVector(_d, bodyLen);
      placeCylinder(st.body, _a, mid);
      placeCylinder(st.rod, mid.clone().addScaledVector(_d, -0.5), _b);
    }
  }

  // ===========================================================================
  // THÁP PHÁO BỌC GIÁP PHÍA SAU
  // ===========================================================================
  function buildTurret(chassis, M, unit, rnd) {
    const turret = new THREE.Group();
    turret.position.set(0, DECK_Y, TURRET_Z);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(DECK_Y);
    const P = M.paint, D = M.dark;
    const TOP = 9.6;

    tb.cyl(8.6, 8.8, 0.5, 32, D, [0, 0.25, 0]);
    tb.add(VehicleKit.loft(
      [[-9.4, -11], [9.4, -11], [9.8, -6], [9.8, 12], [8.4, 14.5], [-8.4, 14.5], [-9.8, 12], [-9.8, -6]],
      [[-8.4, -8.6], [8.4, -8.6], [8.9, -5.4], [8.9, 11.4], [7.6, 13.8], [-7.6, 13.8], [-8.9, 11.4], [-8.9, -5.4]],
      0.4, TOP
    ), P);

    // Hộp giáp bao bệ nòng trên nóc tháp + nắp chụp trục quay (dừng ở z = BAY.z0: khóa nòng lộ ra trong khoang nạp đạn)
    const sPts = [[-4.2, -8.6], [4.2, -8.6], [4.6, -6.6], [4.6, BAY.z0], [-4.6, BAY.z0], [-4.6, -6.6]];
    tb.add(VehicleKit.loft(sPts, sPts, TOP - 0.2, [TOP + 2.8, TOP + 2.8, TOP + 3.4, TOP + 3.6, TOP + 3.6, TOP + 3.4]), P);
    for (const s of [-1, 1]) tb.cyl(1.7, 1.7, 0.8, 16, D, [s * 4.9, PIVOT.y, PIVOT.z], 'x');
    tb.box(1.4, 0.08, BAY.z0 + 8.4, D, [0, TOP + 3.65, (BAY.z0 - 8.5) / 2]);
    const loader = buildLoaderBay(tb, turret, M, TOP);

    // Cửa nạp đạn sau tháp, cửa nóc, thang leo
    tb.box(7.0, 6.0, 0.25, P, [0, 4.6, 14.5]);
    tb.box(7.2, 0.1, 0.3, D, [0, 7.65, 14.5]);
    for (const x of [-3.7, 3.7]) tb.box(0.6, 1.0, 0.5, D, [x, 5.4, 14.6]);
    tb.box(1.8, 0.3, 0.4, M.steel, [0, 3.0, 14.7]);
    tb.cyl(1.7, 1.8, 0.3, 16, P, [-6.2, TOP + 0.15, 7.6]);
    tb.box(0.9, 0.3, 0.5, D, [-6.2, TOP + 0.3, 9.4]);
    for (let i = 0; i < 5; i++) tb.box(0.25, 0.25, 2.2, M.steel, [9.95, 1.6 + i * 1.7, 9.4]);
    tb.box(0.25, 8.4, 0.25, M.steel, [9.95, 5.0, 8.3]);
    tb.box(0.25, 8.4, 0.25, M.steel, [9.95, 5.0, 10.5]);

    // Can nhiên liệu dự phòng treo hai góc sau tháp (đai giữ sẫm màu) + tay nắm đầu thang leo
    for (const s of [-1, 1]) {
      tb.setTag('can' + (s < 0 ? 'L' : 'R'));
      tb.jerrycan([s * 6.0, 2.5, 15.35], Math.PI / 2, 1.3, 3.7, 2.7, P, D);
      for (const y of [1.6, 3.3]) tb.box(2.9, 0.22, 0.08, D, [s * 6.0, y, 16.04]);
      tb.setTag(null);
    }
    tb.grabHandle([7.7, TOP, 9.4], 'z', 1.6, 0.55, P);
    tb.grabHandle([-8.1, TOP, 10.8], 'z', 1.6, 0.55, P);

    // Tấm vải nhận diện phe trên nóc sau tháp
    tb.box(3.0, 0.08, 4.4, M.idPanel, [6.2, TOP + 0.06, 8.6], [0, 0.03, 0]);

    // Kính toàn cảnh chỉ huy (đầu xoay quét), cột khí tượng có chén đo gió, vòm GPS, ăng-ten
    tb.cyl(0.8, 0.95, 2.0, 12, P, [-6.4, TOP + 1.0, -4.2]);
    const periHead = new THREE.Group();
    periHead.position.set(-6.4, TOP + 2.7, -4.2);
    const ph = new VehicleKit.PartBatch(DECK_Y + TOP + 2.7);
    ph.box(2.0, 1.4, 2.0, P, [0, 0, 0]);
    ph.box(1.4, 0.6, 0.1, M.glass, [0, 0.1, -1.03]);
    ph.box(2.2, 0.16, 2.2, D, [0, 0.72, 0]);
    ph.build(periHead);
    turret.add(periHead);
    VehicleKit.registerPartGroup(unit, 'opticCdr', periHead);

    tb.cyl(0.14, 0.18, 7.0, 6, D, [-7.4, TOP + 3.5, 12.4]);
    const anemometer = new THREE.Group();
    anemometer.position.set(-7.4, TOP + 7.1, 12.4);
    const an = new VehicleKit.PartBatch(DECK_Y + TOP + 7.1);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      an.box(1.2, 0.08, 0.08, D, [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [0, -a, 0]);
      an.add(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), D, [Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2], [0, 0, Math.PI / 2]);
    }
    an.build(anemometer);
    turret.add(anemometer);
    VehicleKit.registerPartGroup(unit, 'meteo', anemometer);
    tb.add(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), P, [6.0, TOP, 3.0]);
    const ant = new VehicleKit.AntennaSet(D, turret);
    for (const s of [-1, 1]) {
      tb.cyl(0.4, 0.45, 0.6, 8, D, [s * 7.0, TOP + 0.3, 12.6]);
      ant.add([s * 7.0, TOP + 0.6, 12.6], 13, { tilt: [0.12, 0], r0: 0.085, r1: 0.045 });
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // Ống phóng lựu đạn khói hai góc trước tháp
    for (const s of [-1, 1]) {
      tb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      tb.box(0.45, 1.2, 3.0, P, [s * 9.95, 7.6, -7.0], [0, s * 0.2, 0]);
      for (let i = 0; i < 3; i++) {
        tb.cyl(0.36, 0.36, 1.5, 10, D, [s * 10.5, 8.1, -8.0 + i * 0.95], 'y', [-0.45, 0, -s * 0.85]);
      }
      tb.setTag(null);
    }

    // Thùng đồ hai bên hông tháp
    for (const s of [-1, 1]) {
      tb.setTag('bin' + (s < 0 ? 'L' : 'R'));
      tb.box(1.6, 3.4, 8.0, P, [s * 10.5, 3.2, 2.0]);
      tb.box(1.7, 0.08, 8.1, D, [s * 10.52, 4.4, 2.0]);
      tb.setTag(null);
    }

    // --- Chi tiết bề mặt tháp: đường ghép tấm, mối hàn, cửa thăm bên hông, móc cẩu, nấm thông gió ---
    const SIDE_TILT = Math.atan2(0.9, 9.2);
    const sideX = (y) => 9.8 - (y - 0.4) * (0.9 / 9.2);
    for (const s of [-1, 1]) {
      const rot = [0, 0, s * SIDE_TILT];
      // Đường ghép ngang chia tấm giáp hông trên / dưới
      tb.seam([s * (sideX(6.0) + 0.02), 6.0, -5.4], [s * (sideX(6.0) + 0.02), 6.0, 6.4], [s, 0, 0], D);
      // Hàng bu-lông dọc mép trên tấm hông
      tb.boltRow([s * sideX(8.9), 8.9, -4.8], [s * sideX(8.9), 8.9, 11.0], 10, 'x', D, 0.15, s, rot);
      // Mối hàn mép nóc - hông
      tb.weld([s * (sideX(9.6) - 0.05), 9.62, -5.4], [s * (sideX(9.6) - 0.05), 9.62, 11.4], P);
      // Cửa thăm bên hông phía sau: tấm cửa nổi, bản lề trước, tay nắm, viền bu-lông
      const dx = sideX(6.4) + 0.12;
      if (s < 0) {   // hông phải đã có thang leo ở chỗ này
      tb.box(0.22, 3.6, 4.2, P, [s * dx, 6.4, 9.3], rot);
      tb.hinge([s * (dx + 0.12), 6.4, 7.05], 'y', 3.0, P, 0.2);
      tb.box(0.25, 0.3, 1.1, M.steel, [s * (dx + 0.22), 6.1, 10.7], rot);
      tb.boltRow([s * (dx + 0.08), 8.0, 7.6], [s * (dx + 0.08), 8.0, 11.0], 4, 'x', D, 0.12, s, rot);
      tb.boltRow([s * (dx + 0.08), 4.8, 7.6], [s * (dx + 0.08), 4.8, 11.0], 4, 'x', D, 0.12, s, rot);
      }
      // Hộp giáp bệ nòng: hàng bu-lông chân hộp
      tb.boltRow([s * 4.65, TOP + 0.35, -6.0], [s * 4.65, TOP + 0.35, BAY.z0 - 0.5], 6, 'x', D, 0.14, s);
      tb.weld([s * 4.62, TOP + 0.02, -6.4], [s * 4.62, TOP + 0.02, BAY.z0 - 0.2], P, 0.1);
      // Móc cẩu 4 góc nóc tháp
      for (const z of [-7.6, 12.6]) {
        tb.add(new THREE.TorusGeometry(0.48, 0.15, 5, 10), M.steel, [s * 7.8, TOP + 0.45, z], [0, Math.PI / 2, 0]);
        tb.box(0.9, 0.3, 0.5, P, [s * 7.8, TOP + 0.12, z]);
      }
    }
    // Nóc: đường ghép ngang sau hộp bệ nòng, nấm thông gió khoang chiến đấu
    for (const s of [-1, 1]) tb.seam([s * 8.2, TOP + 0.02, 6.6], [s * (BAY.hw + 0.3), TOP + 0.02, 6.6], [0, 1, 0], D);
    tb.cyl(0.55, 0.6, 0.7, 12, P, [-5.6, TOP + 0.35, 11.0]);
    tb.cyl(1.1, 0.9, 0.35, 14, P, [-5.6, TOP + 0.85, 11.0]);
    // Mặt trước: hàng bu-lông chân tấm giáp nghiêng
    tb.boltRow([-8.0, 1.2, -10.85], [8.0, 1.2, -10.85], 10, 'z', D, 0.15, -1, [Math.atan2(2.4, 9.2), 0, 0]);

    tb.build(turret);

    const tacNumber = `${7 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.2, 1.6, undefined, true);
      if (decal) {
        decal.position.set(s * 11.32, 3.0, 2.0);
        decal.rotation.y = s * Math.PI / 2;
        turret.add(decal);
      }
      // Tên xe sơn stencil dọc hông tháp (như ảnh giới thiệu)
      const name = VehicleKit.createStencilDecal('ARBALEST 155', 9.0, 1.3, undefined, true);
      if (name) {
        name.position.set(s * (sideX(6.7) + 0.06), 6.7, 1.0);
        name.rotation.set(0, s * Math.PI / 2, s * SIDE_TILT, 'ZYX');   // nằm áp theo tấm hông nghiêng
        turret.add(name);
      }
    }
    return { periHead, anemometer, loader };
  }

  // ===========================================================================
  // KHOANG NẠP ĐẠN TỰ ĐỘNG TRÊN NÓC SAU THÁP
  // ===========================================================================
  // Mẫu đạn & bó liều dựng 1 lần rồi clone (dùng chung geometry). Trục dọc theo Z, mũi đạn hướng -Z (vào buồng đạn).
  function buildRoundTemplates(M) {
    const shell = new THREE.Group();
    const sb = new VehicleKit.PartBatch(0);
    sb.cyl(0.6, 0.6, 4.0, 18, M.shellBody, [0, 0, 1.4], 'z');            // thân: z -0.6 .. 3.4
    sb.cyl(0.6, 0.55, 0.1, 18, M.shellBody, [0, 0, 3.45], 'z');          // vát đáy
    sb.cyl(0.64, 0.64, 0.35, 18, M.shellBand, [0, 0, 2.75], 'z');        // đai dẫn đồng
    for (const z of [-0.25, 0.3]) sb.cyl(0.606, 0.606, 0.2, 18, M.shellMark, [0, 0, z], 'z');
    const ogive = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      ogive.push(new THREE.Vector2(0.6 - 0.38 * Math.pow(k, 1.7), 2.4 * k));
    }
    const og = new THREE.LatheGeometry(ogive, 18);
    og.rotateX(-Math.PI / 2);                                            // +Y lathe -> -Z
    sb.add(og, M.shellBody, [0, 0, -0.6]);                               // mũi ogive: z -0.6 .. -3.0
    sb.cyl(0.12, 0.22, 0.55, 12, M.steel, [0, 0, -3.27], 'z');           // ngòi nổ
    sb.build(shell);

    const charge = new THREE.Group();
    const chb = new VehicleKit.PartBatch(0);
    for (let i = 0; i < 4; i++) {                                         // 4 module liều phóng, dài tổng 6.4
      const z = -2.4 + i * 1.6;
      chb.cyl(0.6, 0.6, 1.5, 16, M.charge, [0, 0, z], 'z');
      for (const e of [-0.72, 0.72]) chb.cyl(0.612, 0.612, 0.07, 16, M.dark, [0, 0, z + e], 'z');
    }
    chb.build(charge);
    return { shell, charge };
  }

  function buildLoaderBay(tb, turret, M, TOP) {
    const P = M.paint, D = M.dark;
    const len = BAY.z1 - BAY.z0, zc = (BAY.z0 + BAY.z1) / 2;
    const yTop = TOP + BAY.h;

    // Vách khoang (mặt trước là hộp giáp bệ nòng), sàn có khe máng nạp & 2 giếng thang nâng
    for (const s of [-1, 1]) {
      tb.box(BAY.t, BAY.h, len, P, [s * (BAY.hw - BAY.t / 2), TOP + BAY.h / 2, zc]);
      tb.boltRow([s * BAY.hw, yTop - 0.4, BAY.z0 + 0.6], [s * BAY.hw, yTop - 0.4, BAY.z1 - 0.6], 7, 'x', D, 0.13, s);
      tb.box(1.9, 0.04, 7.8, M.bore, [s * LOAD.rackX, TOP + 0.03, LOAD.z]);
      // Ray dẫn thang nâng: 2 cặp trụ thép ở hai đầu giếng
      for (const z of [LOAD.z - 3.95, LOAD.z + 3.95]) {
        for (const dx of [-0.85, 0.85]) tb.box(0.22, BAY.h - 0.6, 0.22, M.steel, [s * LOAD.rackX + dx, TOP + (BAY.h - 0.6) / 2, z]);
      }
    }
    tb.box(BAY.hw * 2, BAY.h, BAY.t, P, [0, TOP + BAY.h / 2, BAY.z1 - BAY.t / 2]);
    tb.box(3.4, 0.04, len - 0.6, M.bore, [0, TOP + 0.03, zc]);
    // Ray trượt nắp: 2 thanh ngang vươn ra hai bên, chân đỡ trên nóc tháp
    for (const z of [BAY.z0 + 0.25, BAY.z1 - 0.25]) {
      tb.box(16.6, 0.3, 0.45, D, [0, yTop - 0.15, z]);
      for (const s of [-1, 1]) tb.box(0.45, BAY.h - 0.3, 0.45, D, [s * 7.7, TOP + (BAY.h - 0.3) / 2, z]);
    }
    // Ray cầu trục kẹp gắp chạy ngang khoang
    tb.box(BAY.hw * 2 - BAY.t * 2, 0.3, 0.5, M.steel, [0, LOAD.railY, LOAD.z]);
    // Hộp bơm thủy lực & bó ống dầu trên vách sau
    tb.box(2.6, 1.5, 0.6, D, [-2.4, TOP + 2.4, BAY.z1 - BAY.t - 0.3]);
    for (const x of [-1.6, -1.2]) tb.strut([x, TOP + 1.7, BAY.z1 - BAY.t - 0.25], [x + 0.6, TOP + 0.4, BAY.z1 - BAY.t - 0.25], 0.1, M.rubber, 6);

    const L = { hatches: [], racks: [], idleT: 99 };
    const tpl = buildRoundTemplates(M);
    const mk = (g, parent, pos) => {
      const o = g.clone();
      o.position.set(pos[0], pos[1], pos[2]);
      parent.add(o);
      return o;
    };

    // 2 nắp trượt (mỗi nắp che nửa khoang), trượt ra hai bên khi nạp
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * BAY.hw / 2, yTop + 0.15, zc);
      const hb = new VehicleKit.PartBatch(DECK_Y + yTop);
      hb.box(BAY.hw, 0.3, len, P, [0, 0, 0]);
      for (const z of [-len / 3, 0, len / 3]) hb.box(BAY.hw - 0.5, 0.2, 0.35, P, [0, 0.25, z]);
      hb.box(0.25, 0.42, len, M.rubber, [-s * (BAY.hw / 2 - 0.12), 0.02, 0]);          // gioăng mép giữa
      hb.boltRow([-s * (BAY.hw / 2 - 0.45), 0.15, -len / 2 + 0.5], [-s * (BAY.hw / 2 - 0.45), 0.15, len / 2 - 0.5], 7, 'y', D, 0.12);
      hb.grabHandle([s * 0.6, 0.15, 0], 'z', 1.4, 0.4, P);
      for (const z of [-len / 2 + 0.25, len / 2 - 0.25]) hb.box(0.6, 0.25, 0.6, D, [s * (BAY.hw / 2 - 0.4), -0.25, z]);
      hb.build(g);
      turret.add(g);
      L.hatches.push({ g, s });
    }

    // Thang nâng: trái đạn, phải liều phóng. Bàn nâng có 2 yên đỡ + ty đẩy, đạn đặt lên yên
    for (const s of [-1, 1]) {
      const lift = new THREE.Group();
      lift.position.set(s * LOAD.rackX, LOAD.pickY, LOAD.z);
      const lb = new VehicleKit.PartBatch(DECK_Y + LOAD.pickY);
      for (const z of [-2.4, 2.4]) {
        lb.box(1.5, 0.22, 0.5, M.steel, [0, -0.78, z]);
        for (const dx of [-0.55, 0.55]) lb.box(0.3, 0.45, 0.5, M.steel, [dx, -0.5, z], [0, 0, dx > 0 ? 0.6 : -0.6]);
      }
      lb.box(0.5, 0.3, 5.3, D, [0, -0.95, 0]);
      lb.box(0.35, 3.2, 0.35, M.steel, [0, -2.6, 0]);
      lb.build(lift);
      turret.add(lift);
      const item = mk(s < 0 ? tpl.shell : tpl.charge, lift, [0, 0, 0]);
      L.racks.push({ lift, item });
    }

    // Cầu trục: xe con chạy trên ray, khung kẹp treo bằng 2 ty nâng, 2 ngàm cong ôm đạn
    const trolley = new THREE.Group();
    trolley.position.set(-LOAD.rackX, LOAD.railY, LOAD.z);
    const trb = new VehicleKit.PartBatch(DECK_Y + LOAD.railY);
    for (const dz of [-0.42, 0.42]) {
      trb.box(1.5, 0.4, 0.16, D, [0, 0, dz]);
      for (const dx of [-0.45, 0.45]) trb.cyl(0.14, 0.14, 0.1, 8, M.steel, [dx, 0.08, dz * 0.82], 'z');
    }
    trb.box(1.5, 0.12, 1.0, D, [0, -0.3, 0]);
    trb.box(0.6, 0.25, 0.6, M.steel, [0.9, -0.1, 0]);
    trb.build(trolley);
    turret.add(trolley);

    const grip = new THREE.Group();
    grip.position.set(-LOAD.rackX, LOAD.carryY, LOAD.z);
    const gpb = new VehicleKit.PartBatch(DECK_Y + LOAD.carryY);
    gpb.box(0.5, 0.2, 5.6, D, [0, 0.75, 0]);
    for (const z of [-2.2, 2.2]) {
      gpb.add(new THREE.TorusGeometry(0.7, 0.1, 5, 12, Math.PI), M.steel, [0, 0, z]);
      for (const sx of [-1, 1]) gpb.box(0.14, 0.4, 0.3, M.steel, [sx * 0.66, -0.18, z], [0, 0, sx * 0.3]);
      gpb.box(0.3, 0.12, 0.3, D, [0, 0.66, z]);
    }
    gpb.build(grip);
    turret.add(grip);
    const rods = [];
    for (const dz of [-1.6, 1.6]) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1, 0.22), M.steel);
      rod.castShadow = true;
      turret.add(rod);
      rods.push({ rod, dz });
    }
    const carry = { shell: mk(tpl.shell, grip, [0, 0, 0]), charge: mk(tpl.charge, grip, [0, 0, 0]) };

    // Máng nạp: quay quanh trục nòng (cùng góc nâng), nâng / hạ chìm theo trục máng; xích đẩy chạy dọc máng
    const arm = new THREE.Group();
    arm.position.set(0, PIVOT.y, PIVOT.z);
    turret.add(arm);
    const tray = new THREE.Group();
    arm.add(tray);
    const tz = LOAD.trayZ;
    const trb2 = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    trb2.box(1.5, 0.15, 8.6, M.steel, [0, -0.72, tz - 0.1]);
    for (const sx of [-1, 1]) {
      trb2.box(0.15, 0.6, 8.6, D, [sx * 0.8, -0.45, tz - 0.1], [0, 0, -sx * 0.25]);
      for (const z of [tz - 3.0, tz + 3.0]) trb2.box(0.35, 2.6, 0.45, D, [sx * 0.55, -2.05, z]);
    }
    trb2.box(1.9, 1.5, 0.4, D, [0, -0.15, tz + 4.3]);                    // hộp xích đẩy cuối máng
    trb2.box(0.7, 0.5, 0.3, M.steel, [0, -0.15, tz + 4.55]);
    trb2.build(tray);
    const head = new THREE.Group();
    head.position.set(0, 0, tz + 3.7);
    const hdb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    hdb.box(1.0, 1.0, 0.3, M.steel, [0, 0, 0]);
    hdb.cyl(0.35, 0.35, 0.3, 10, D, [0, 0, -0.25], 'z');
    hdb.build(head);
    tray.add(head);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 1), D);
    chain.castShadow = true;
    tray.add(chain);
    const onTray = { shell: mk(tpl.shell, tray, [0, 0, tz]), charge: mk(tpl.charge, tray, [0, 0, tz]) };

    Object.assign(L, { trolley, grip, rods, carry, arm, tray, head, chain, onTray });
    poseLoader(L, idlePose(99), 0);
    return L;
  }

  function seg(q, a, b) {
    return smooth((q - a) / (b - a));
  }

  const _pose = { hatch: 0, trayUp: 0, armK: 0, headK: 0, tx: 0, gy: 0, carry: null, onTray: null, rackS: 0, rackSHas: true, rackC: 0, rackCHas: true };
  function idlePose(t) {
    const p = _pose;
    p.hatch = 1 - seg(t, 0.6, 1.0);
    p.trayUp = 1 - seg(t, 0.3, 0.6);
    p.armK = 1 - seg(t, 0, 0.3);
    p.headK = 0;
    p.tx = -LOAD.rackX * seg(t, 0, 0.5);
    p.gy = LOAD.carryY;
    p.carry = p.onTray = null;
    p.rackS = p.rackC = LOAD.pickY;
    p.rackSHas = p.rackCHas = true;
    return p;
  }

  // Tư thế cơ cấu nạp theo thời gian từ lúc bắn e (giây) trên tổng thời gian nạp D:
  // mở nắp + nâng máng (sau khi nòng giật xong) -> chu trình đạn (q 0..0.58) -> chu trình liều phóng (q 0.42..1),
  // cú đẩy liều cuối kết thúc ngay trước khi đồng hồ nạp về 0 (khớp tiếng đóng khóa nòng của spg.js)
  function activePose(e, D) {
    const p = _pose, R = LOAD.rackX;
    const w0 = Math.min(1.2, D * 0.3), w1 = Math.max(w0 + 0.1, D - 0.12);
    const r = e / w0;
    const q = Math.max(0, Math.min(1, (e - w0) / (w1 - w0)));
    const drop = LOAD.carryY - LOAD.pickY, sink = LOAD.pickY - LOAD.sinkY;
    p.hatch = seg(r, 0.12, 0.5);
    p.trayUp = seg(r, 0.72, 1.0);
    p.tx = -R + R * seg(q, 0.10, 0.20) + R * seg(q, 0.30, 0.42) - R * seg(q, 0.58, 0.66);
    p.gy = LOAD.carryY
      - drop * (seg(q, 0.00, 0.05) - seg(q, 0.05, 0.10))
      - drop * (seg(q, 0.20, 0.25) - seg(q, 0.25, 0.30))
      - drop * (seg(q, 0.42, 0.47) - seg(q, 0.47, 0.52))
      - drop * (seg(q, 0.66, 0.71) - seg(q, 0.71, 0.76));
    p.carry = q >= 0.05 && q < 0.25 ? 'shell' : (q >= 0.47 && q < 0.71 ? 'charge' : null);
    p.onTray = q >= 0.25 && q < 0.46 ? 'shell' : (q >= 0.71 && q < 0.95 ? 'charge' : null);
    p.armK = seg(q, 0.27, 0.35) - seg(q, 0.50, 0.58) + seg(q, 0.73, 0.81);
    p.headK = seg(q, 0.35, 0.46) - seg(q, 0.46, 0.52) + seg(q, 0.81, 0.95) - seg(q, 0.95, 1.0);
    // Thang nâng: bàn rỗng hạ xuống hầm, đưa viên kế tiếp lên
    p.rackS = LOAD.pickY - sink * (seg(q, 0.10, 0.20) - seg(q, 0.24, 0.40));
    p.rackSHas = q < 0.05 || q >= 0.20;
    p.rackC = LOAD.pickY - sink * (seg(q, 0.52, 0.62) - seg(q, 0.66, 0.82));
    p.rackCHas = q < 0.47 || q >= 0.62;
    return p;
  }

  function poseLoader(L, p, el) {
    for (const h of L.hatches) h.g.position.x = h.s * (BAY.hw / 2 + LOAD.hatchSlide * p.hatch);
    L.trolley.position.x = p.tx;
    L.grip.position.set(p.tx, p.gy, LOAD.z);
    const top = LOAD.railY - 0.36, bot = p.gy + 0.85, rl = Math.max(0.05, top - bot);
    for (const r of L.rods) {
      r.rod.position.set(p.tx, bot + rl / 2, LOAD.z + r.dz);
      r.rod.scale.y = rl;
    }
    L.carry.shell.visible = p.carry === 'shell';
    L.carry.charge.visible = p.carry === 'charge';
    L.racks[0].lift.position.y = p.rackS;
    L.racks[0].item.visible = p.rackSHas;
    L.racks[1].lift.position.y = p.rackC;
    L.racks[1].item.visible = p.rackCHas;

    L.arm.rotation.x = el * p.armK;
    L.tray.position.y = LOAD.trayDrop * (1 - p.trayUp);
    const push = LOAD.ram * p.headK;
    const headZ = LOAD.trayZ + 3.7 - push;
    L.head.position.z = headZ;
    const chainRear = LOAD.trayZ + 4.1, chainLen = Math.max(0.05, chainRear - headZ - 0.15);
    L.chain.position.set(0, -0.15, chainRear - chainLen / 2);
    L.chain.scale.z = chainLen;
    L.onTray.shell.visible = p.onTray === 'shell';
    L.onTray.charge.visible = p.onTray === 'charge';
    L.onTray.shell.position.z = LOAD.trayZ - push;
    L.onTray.charge.position.z = LOAD.trayZ - push;
    // Tháp ẩn các phần khuất hẳn dưới nóc khi máng đã hạ chìm & nắp đóng (đỡ tốn draw call)
    const hidden = p.hatch <= 0 && p.trayUp <= 0;
    L.tray.visible = L.grip.visible = L.trolley.visible = !hidden;
    for (const r of L.rods) r.rod.visible = !hidden;
    for (const k of L.racks) k.lift.visible = !hidden;
  }

  function updateLoader(L, u, dt, el) {
    if (!L) return;
    const D = u.reloadDuration || 0, rt = u.reloadTimer || 0;
    let p;
    if (rt > 0 && D > 0 && u.tankType === 'ARTILLERY') {
      L.idleT = 0;
      p = activePose(Math.max(0, D - rt), D);
    } else {
      L.idleT += dt;
      if (L.idleT > 1.5 && L._settled) return;
      p = idlePose(L.idleT);
    }
    L._settled = L.idleT > 1.5;
    poseLoader(L, p, el);
  }

  // ===========================================================================
  // LỰU PHÁO 155MM L/52
  // ===========================================================================
  function buildHowitzer(unit, M) {
    // spg.js ghi góc nâng vào unit.barrelPivot -> dùng trục giả, model áp góc đã giới hạn vào trục thật
    const pivotProxy = new THREE.Object3D();
    unit.barrelPivot = pivotProxy;

    const pivot = new THREE.Group();
    pivot.position.set(0, PIVOT.y, PIVOT.z);
    unit.turretGroup.add(pivot);
    unit.turretGroup.add(pivotProxy);

    // Giá nòng (nâng theo nòng, không giật): ống dẫn trượt có má gân, 2 xi-lanh lùi / đẩy lên lớn nằm trên nòng,
    // lò xo cân bằng giữa hai xi-lanh, radar sơ tốc phía trước, ống bọc khóa nòng phía sau
    const cb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    cb.cyl(1.95, 2.05, 9.0, 18, M.paint, [0, 0, -5.5], 'z');
    cb.cyl(2.3, 2.3, 1.0, 18, M.dark, [0, 0, -10.2], 'z');
    for (const s of [-1, 1]) {
      // Má giá nòng: tấm hộp hai bên + gân chéo
      cb.box(0.35, 2.6, 8.4, M.paint, [s * 2.05, 0.2, -5.4]);
      for (const z of [-8.4, -5.4, -2.4]) cb.box(0.5, 2.2, 0.3, M.dark, [s * 2.25, 0.2, z]);
      // Xi-lanh lùi / đẩy lên: thân sơn, nắp đầu & cổ ép sẫm màu, ống dầu
      cb.cyl(0.8, 0.8, 11.1, 16, M.paint, [s * 1.15, 2.3, -7.05], 'z');
      cb.cyl(0.88, 0.88, 0.5, 16, M.dark, [s * 1.15, 2.3, -12.35], 'z');
      cb.cyl(0.88, 0.88, 0.5, 16, M.dark, [s * 1.15, 2.3, -1.75], 'z');
      cb.cyl(0.5, 0.62, 0.45, 12, M.steel, [s * 1.15, 2.3, -12.8], 'z');
      cb.box(1.3, 1.3, 1.1, M.dark, [s * 1.15, 2.1, -1.1]);
      cb.strut([s * 1.75, 2.0, -3.0], [s * 2.2, 1.2, -1.2], 0.12, M.rubber, 6);
    }
    // Lò xo cân bằng: ty dẫn + lò xo xoắn + 2 bát chặn
    const coil = [];
    for (let i = 0; i <= 13 * 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      coil.push(new THREE.Vector3(Math.cos(a) * 0.46, Math.sin(a) * 0.46, -(i / 130) * 6.4));
    }
    cb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 260, 0.11, 5, false), M.steel, [0, 3.25, -3.1]);
    cb.cyl(0.2, 0.2, 7.6, 8, M.steel, [0, 3.25, -6.3], 'z');
    for (const z of [-2.85, -9.75]) cb.box(1.2, 1.2, 0.35, M.dark, [0, 3.0, z]);
    // Radar đo sơ tốc đầu nòng
    cb.box(1.7, 1.2, 1.8, M.dark, [0, 3.3, -11.4]);
    cb.box(1.3, 0.85, 0.1, M.glass, [0, 3.3, -12.33]);
    cb.cyl(1.6, 1.6, 6.5, 14, M.dark, [0, 0, 3.0], 'z');
    cb.build(pivot);

    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);

    const gb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    const P = M.paint;
    const section = (rFront, rRear, zRear, zFront, mat = P) => {
      gb.cyl(rFront, rRear, zRear - zFront, 22, mat, [0, 0, (zRear + zFront) / 2], 'z');
    };
    section(1.5, 1.5, 6.0, -4.0, M.steel);    // khối khóa nòng (nằm trong giá, giật lùi theo nòng)
    section(1.42, 1.46, -4.0, -18.0);
    section(1.36, 1.42, -18.0, -30.0);
    section(1.36, 1.85, -30.0, -31.2);         // côn sau bầu hút khói
    section(1.85, 1.85, -31.2, -36.4);
    section(1.25, 1.85, -36.4, -37.6);         // côn trước bầu hút khói
    section(1.18, 1.25, -37.6, -52.0);
    section(1.08, 1.18, -52.0, -66.0);
    for (const z of [-18.2, -44.0, -60.0]) gb.cyl(1.5, 1.5, 0.6, 20, M.dark, [0, 0, z], 'z');
    // Ty piston 2 xi-lanh lùi bắt vào gông kẹp trên nòng -> trượt vào xi-lanh khi nòng giật
    gb.cyl(1.62, 1.62, 0.8, 20, M.dark, [0, 0, -14.6], 'z');
    for (const s of [-1, 1]) {
      gb.box(0.5, 1.0, 0.6, M.dark, [s * 1.0, 1.75, -14.6], [0, 0, s * 0.35]);
      gb.cyl(0.36, 0.36, 3.4, 10, M.steel, [s * 1.15, 2.3, -12.6], 'z');
      gb.cyl(0.55, 0.55, 0.9, 12, M.dark, [s * 1.15, 2.3, -14.6], 'z');
    }

    // Hãm lùi đầu nòng 2 tầng kiểu lựu pháo 155 hiện đại: ống ren bắt vào nòng + vòng hãm, thân sau, 2 vách chắn
    // dày (vách trước làm mặt đầu nòng) có lỗ cho đạn đi qua; giữa các vách chỉ có cầu nối trên / dưới, hai bên để
    // hở thành cửa xả -> nhìn ngang thấy xuyên qua, khí phụt ngang. Vách & mép cửa xả hun đen muội, thân sơn cháy bạc.
    const baffle = (w, h, r, hole, t, z, mat) => {
      const sh = new THREE.Shape(), x = w / 2 - 0.06, y = h / 2 - 0.06;
      sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.quadraticCurveTo(x, -y, x, -y + r);
      sh.lineTo(x, y - r); sh.quadraticCurveTo(x, y, x - r, y); sh.lineTo(-x + r, y);
      sh.quadraticCurveTo(-x, y, -x, y - r); sh.lineTo(-x, -y + r); sh.quadraticCurveTo(-x, -y, -x + r, -y);
      const hp = new THREE.Path();
      hp.absarc(0, 0, hole, 0, Math.PI * 2, true);
      sh.holes.push(hp);
      const g = new THREE.ExtrudeGeometry(sh, { depth: t - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 8 });
      g.translate(0, 0, -(t - 0.12) / 2);
      gb.add(g, mat, [0, 0, z]);
    };
    gb.cyl(1.32, 1.32, 1.3, 22, M.paintDusty, [0, 0, -66.55], 'z');
    gb.cyl(1.45, 1.45, 0.32, 22, M.dark, [0, 0, -66.1], 'z');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      gb.box(0.18, 0.3, 0.2, M.steel, [Math.cos(a) * 1.5, Math.sin(a) * 1.5, -66.1], [0, 0, a]);
    }
    baffle(3.3, 2.6, 0.6, 1.0, 1.0, -67.6, M.paintDusty);            // thân sau (nối ống ren)
    baffle(3.9, 2.6, 0.55, 0.74, 0.62, -69.55, M.soot);              // vách giữa
    baffle(3.9, 2.6, 0.55, 0.74, 0.9, -71.6, M.soot);                // vách trước = mặt đầu nòng
    for (const sy of [-1, 1]) {
      gb.box(2.1, 0.5, 4.2, M.paintDusty, [0, sy * 1.05, -69.7]);    // cầu nối trên / dưới
      gb.box(2.15, 0.06, 0.6, M.soot, [0, sy * 1.31, -68.4]);        // muội tràn qua mép cửa xả
    }
    gb.cyl(0.95, 0.95, 0.04, 18, M.bore, [0, 0, -67.23], 'z');       // lòng nòng nhìn qua lỗ vách
    gb.build(barrel);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -72.2);
    return { pivot, pivotProxy, barrel };
  }

  TankModelBuilder.registerModel('ARTILLERY', buildArbalest);
})();
