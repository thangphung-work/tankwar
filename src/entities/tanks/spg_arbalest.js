/**
 * PHÁO TỰ HÀNH BÁNH LỐP ARBALEST 155  (tankType: ARTILLERY)
 *
 * Thiết kế hư cấu: lựu pháo 155mm đặt trên xe tải quân sự 6x6, tháp pháo bọc giáp phía sau.
 * - Cabin bọc giáp đầu bằng (cab-over) với kính chống đạn dày, khoang động cơ phía sau cabin
 * - 3 trục: trục trước bẻ lái, 2 trục sau tải nặng; lốp địa hình gai to có bơm hơi trung tâm
 * - Tháp pháo bọc giáp phía sau chứa nạp đạn tự động; pháo 155mm L/52 đặt trên nóc tháp,
 *   hãm lùi 2 tầng, radar đo sơ tốc đầu nòng; hành quân thì nòng gác lên giá khóa trên nóc cabin
 * - Dừng xe: 2 chân chống thủy lực hạ xuống đất, lưỡi càng sau hạ cắm đất (xi-lanh chuyển động thật)
 *
 * Hook gameplay: barrelPivot (spg.js ghi góc nâng -> model giới hạn khi nòng vắt qua cabin),
 * barrelGroup (giật nòng, hiển thị thu nhỏ cho thật), muzzleTipLocal, deployProgress (đọc để hạ càng).
 * Tỉ lệ ~8 đơn vị = 1 mét, đầu xe hướng -Z, mặt đất y = 0.
 */

(function () {
  if (typeof TankModelBuilder === 'undefined' || typeof VehicleKit === 'undefined') return;

  const WHEEL_R = 5.4;
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

  function buildArbalest(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team);
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildTruck(chassis, M, unit);
    const wheels = buildWheels(chassis, M);
    unit.wheelSet = wheels;
    const deploy = buildDeployGear(chassis, M);
    updateDeployGear(deploy, 0);
    const turretParts = buildTurret(chassis, M, unit, rnd);
    const gun = buildHowitzer(unit, M);

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
        let el = gun.pivotProxy.rotation.x;
        let rel = u.turretGroup.rotation.y % (Math.PI * 2);
        if (rel > Math.PI) rel -= Math.PI * 2;
        if (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) < 0.85) el = Math.max(el, 0);
        gun.pivot.rotation.x = el;
        // Giật nòng hiển thị thu nhỏ (độ giật gameplay vẫn giữ nguyên)
        gun.barrel.position.z = (u.barrelRecoil || 0) * RECOIL_VISUAL;

        if (!u.isDead) {
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
  function buildTruck(chassis, M, unit) {
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

    // Kính chắn gió 2 tấm nghiêng + gờ che nắng + gạt nước
    const wsAngle = Math.atan2(36.8 - 33.5, CAB_ROOF - 15.0);
    for (const s of [-1, 1]) {
      hb.box(8.9, 7.0, 0.16, M.glass, [s * 4.85, 18.65, -35.42], [wsAngle, 0, 0]);
      hb.box(0.12, 0.12, 4.2, D, [s * 4.6, 16.0, -36.4], [0, 0, s * 0.6]);
    }
    hb.box(0.6, 7.6, 0.3, P, [0, 18.65, -35.45], [wsAngle, 0, 0]);
    // Khung viền kính chắn gió
    hb.box(20.4, 0.35, 0.3, P, [0, 15.25, -36.82], [wsAngle, 0, 0]);
    hb.box(20.4, 0.35, 0.3, P, [0, 22.05, -33.75], [wsAngle, 0, 0]);
    hb.box(21.6, 0.35, 1.4, P, [0, CAB_ROOF + 0.1, -33.6]);

    // Cửa, kính cửa, tay nắm, bậc lên xuống, gương chiếu hậu
    for (const s of [-1, 1]) {
      const x = s * (HALF_W + 0.04);
      hb.box(0.1, 6.0, 7.5, M.glass, [x, 18.0, -28.6]);
      hb.box(0.1, 4.0, 3.0, M.glass, [x, 18.6, -22.4]);
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
      hb.box(0.1, 2.8, 1.5, M.glass, [s * (HALF_W + 2.48), 18.2, -35.6]);
      hb.setTag(null);
    }

    // Cản trước, lưới tản nhiệt, đèn pha có khung bảo vệ, móc kéo, tời
    hb.box(22.8, 3.6, 2.0, P, [0, 8.4, -37.6]);
    for (let i = 0; i < 6; i++) hb.box(9.0, 0.25, 0.3, D, [0, 11.5 + i * 0.55, -37.25], [-0.15, 0, 0]);
    for (const s of [-1, 1]) {
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(3.0, 1.8, 0.6, D, [s * 8.3, 8.8, -38.7]);
      hb.cyl(0.6, 0.6, 0.2, 14, M.lens, [s * 7.6, 8.9, -39.05], 'z');
      hb.box(0.6, 0.45, 0.2, M.tailLens, [s * 9.3, 8.9, -39.05]);
      hb.box(3.4, 0.18, 0.18, P, [s * 8.3, 10.0, -39.4]);
      hb.box(0.18, 2.2, 0.18, P, [s * 6.6, 8.9, -39.4]);
      hb.box(0.18, 2.2, 0.18, P, [s * 10.0, 8.9, -39.4]);
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
    hb.cyl(0.85, 0.75, 0.6, 12, D, [9.6, 23.2, -12.0]);
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
      hb.box(4.6, 0.3, 25.0, P, [s * 9.0, 11.4, 18.2]);
      hb.setTag('flap' + (s < 0 ? 'L' : 'R'));
      hb.box(3.8, 3.2, 0.15, M.rubber, [s * 9.0, 4.0, 30.3]);
      hb.setTag(null);
      hb.box(3.8, 3.2, 0.15, M.rubber, [s * 9.0, 4.0, -20.2]);
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

    // Trên sàn trước tháp: bánh dự phòng, thùng đạn, máy phát điện
    hb.setTag('spare');
    hb.cyl(WHEEL_R * 0.95, WHEEL_R * 0.95, TIRE_W * 0.9, 20, M.rubber, [-4.6, DECK_Y + TIRE_W * 0.45, -4.2], 'y');
    hb.cyl(2.8, 2.8, TIRE_W, 16, M.paintDusty, [-4.6, DECK_Y + TIRE_W * 0.5, -4.2], 'y');
    hb.setTag('ammoBoxes');
    for (let i = 0; i < 3; i++) hb.box(2.6, 1.6, 3.6, P, [4.2, DECK_Y + 0.8 + (i === 2 ? 1.6 : 0), -7.4 + (i % 2) * 3.8]);
    hb.setTag('generator');
    hb.box(3.6, 2.6, 3.2, D, [6.4, DECK_Y + 1.3, 1.8]);
    hb.setTag(null);

    // Đuôi xe: cản sau, đèn hậu, móc kéo, bậc lên tháp
    hb.box(21.4, 1.8, 1.2, P, [0, 9.6, 37.4]);
    for (const s of [-1, 1]) {
      hb.box(2.0, 1.0, 0.4, D, [s * 8.6, 10.6, 38.1]);
      hb.box(0.8, 0.6, 0.12, M.tailLens, [s * 9.1, 10.6, 38.32]);
      hb.box(0.6, 0.5, 0.12, M.lens, [s * 8.0, 10.6, 38.32]);
    }
    hb.box(2.2, 1.4, 1.4, D, [0, 6.4, 37.6]);

    const meshes = hb.build(chassis, [0, 12, 0]);
    unit.hullMainMesh = meshes.get(P);
  }

  // ===========================================================================
  // BÁNH LỐP ĐỊA HÌNH 6x6
  // ===========================================================================
  function buildWheels(chassis, M) {
    const positions = [];
    for (const a of AXLES) for (const s of [-1, 1]) positions.push({ x: s * WHEEL_X, y: WHEEL_Y, z: a.z, steer: a.steer });
    return new VehicleKit.WheelSet(chassis, (b) => {
      const hw = TIRE_W / 2;
      // Lốp: thân lốp + hông lốp bo tròn + gai chữ V
      b.cyl(WHEEL_R - 0.35, WHEEL_R - 0.35, TIRE_W, 28, M.rubber, [0, 0, 0], 'x');
      for (const sx of [-1, 1]) {
        b.add(new THREE.TorusGeometry(WHEEL_R - 0.85, 0.55, 8, 28), M.rubber, [sx * (hw - 0.55), 0, 0], [0, Math.PI / 2, 0]);
      }
      const lugs = 22;
      for (let i = 0; i < lugs; i++) {
        const a = (i / lugs) * Math.PI * 2;
        for (const sx of [-1, 1]) {
          b.box(1.5, 0.55, 0.9, M.rubber,
            [sx * 0.85, Math.cos(a) * (WHEEL_R - 0.25), Math.sin(a) * (WHEEL_R - 0.25)],
            [a, sx * 0.45, 0]);
        }
      }
      // Vành thép, moay-ơ, bu-lông, van bơm hơi trung tâm
      b.cyl(3.1, 3.1, TIRE_W + 0.06, 20, M.paintDusty, [0, 0, 0], 'x');
      b.cyl(2.5, 2.5, 0.3, 18, M.dark, [hw + 0.02, 0, 0], 'x');
      b.cyl(1.35, 1.5, 0.9, 14, M.steel, [hw + 0.3, 0, 0], 'x');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.cyl(0.14, 0.14, 0.4, 6, M.steel, [hw + 0.25, Math.cos(a) * 1.9, Math.sin(a) * 1.9], 'x');
      }
      b.cyl(0.45, 0.45, 0.8, 10, M.paintDusty, [hw + 0.8, 0, 0], 'x');
      b.beam([hw + 0.5, 0.3, 0], [hw + 0.1, 2.6, 0.4], 0.16, 0.16, M.dark);
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

    // Hộp giáp bao bệ nòng trên nóc tháp + nắp chụp trục quay
    const sPts = [[-4.2, -8.6], [4.2, -8.6], [4.6, -6.6], [4.6, 6.0], [-4.6, 6.0], [-4.6, -6.6]];
    tb.add(VehicleKit.loft(sPts, sPts, TOP - 0.2, [TOP + 2.8, TOP + 2.8, TOP + 3.4, TOP + 3.6, TOP + 3.6, TOP + 3.4]), P);
    for (const s of [-1, 1]) tb.cyl(1.7, 1.7, 0.8, 16, D, [s * 4.9, PIVOT.y, PIVOT.z], 'x');
    tb.box(1.4, 0.08, 14.4, D, [0, TOP + 3.65, -1.3]);

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

    // Tấm vải nhận diện phe trên nóc sau tháp
    tb.box(5.6, 0.08, 3.6, M.idPanel, [2.6, TOP + 0.06, 9.8], [0, 0.03, 0]);

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

    tb.build(turret);

    const tacNumber = `${7 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.2, 1.6);
      if (decal) {
        decal.position.set(s * 11.32, 3.0, 2.0);
        decal.rotation.y = s * Math.PI / 2;
        turret.add(decal);
      }
    }
    return { periHead, anemometer };
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

    // Giá nòng (nâng theo nòng, không giật): ống dẫn trượt, 2 xi-lanh hãm lùi, radar sơ tốc
    const cb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    cb.cyl(1.95, 2.05, 9.0, 18, M.paint, [0, 0, -5.5], 'z');
    cb.cyl(2.3, 2.3, 1.0, 18, M.dark, [0, 0, -10.2], 'z');
    for (const s of [-1, 1]) {
      cb.cyl(0.5, 0.5, 8.5, 10, M.steel, [s * 0.95, 1.9, -5.0], 'z');
      cb.box(1.0, 1.0, 1.0, M.dark, [s * 0.95, 1.9, -0.6]);
    }
    cb.box(1.8, 1.3, 2.2, M.dark, [0, 2.6, -9.0]);
    cb.box(1.4, 0.9, 0.1, M.glass, [0, 2.6, -10.12]);
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

    // Hãm lùi đầu nòng 2 tầng: khối thép với cửa xả khí hai bên
    gb.box(3.6, 2.7, 6.0, M.paintDusty, [0, 0, -69.0]);
    for (const z of [-67.4, -70.6]) {
      for (const s of [-1, 1]) gb.box(0.2, 1.9, 1.8, M.bore, [s * 1.82, 0, z]);
    }
    gb.cyl(1.0, 1.0, 0.1, 18, M.bore, [0, 0, -72.02], 'z');
    gb.build(barrel);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -72.2);
    return { pivot, pivotProxy, barrel };
  }

  TankModelBuilder.registerModel('ARTILLERY', buildArbalest);
})();
