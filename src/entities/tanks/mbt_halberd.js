/**
 * XE TĂNG CHIẾN ĐẤU CHỦ LỰC HALBERD MK.3  (tankType: ALL_ROUNDER)
 *
 * Thiết kế hư cấu theo phong cách xe tăng chủ lực phương Tây thế hệ 3+:
 * - Thân xe thấp, giáp mũi vát nghiêng kèm tấm giáp tăng cường bắt bu-lông
 * - Tháp pháo đa diện, giáp nêm hình mũi tên hai bên nòng, hộc đạn sau có tấm xả áp
 * - Pháo nòng trơn 120mm L/55 với ống bọc nhiệt chia đoạn, bầu hút khói, gương chuẩn nòng
 * - Kính ngắm pháo thủ trên nóc, kính toàn cảnh trưởng xe xoay quét, trạm vũ khí điều khiển từ xa
 * - Hệ xích 7 cặp bánh chịu tải kép, bánh sao chủ động phía sau, từng mắt xích chạy thật
 * - Váy xích phân đoạn: đoạn trước giáp dày, các đoạn sau mỏng có viền cao su
 *
 * Tỉ lệ: ~8 đơn vị game = 1 mét. Mũi xe hướng -Z, mặt đất y = 0 trong chassisGroup.
 */

(function () {
  if (typeof TankModelBuilder === 'undefined' || typeof VehicleKit === 'undefined') return;

  // ---------------------------------------------------------------------------
  // THÔNG SỐ HÌNH HỌC
  // ---------------------------------------------------------------------------
  const TRACK_X = 12.2;       // tâm dải xích
  const TRACK_W = 5.4;        // bề rộng xích
  const LINK_IN = 0.3;        // khoảng từ tâm mắt xích tới mặt trong (tiếp xúc bánh)
  const WHEEL_R = 2.85;
  const WHEEL_Y = 3.77;       // tâm bánh: mặt bám xích chạm đất y = 0
  const WHEEL_Z = [-19.8, -13.2, -6.6, 0, 6.6, 13.2, 19.8];
  const IDLER = { z: -26.6, y: 5.2, r: 2.6 };
  const SPROCKET = { z: 26.4, y: 5.3, r: 2.7 };
  const HULL_HALF_W = 15.0;
  const DECK_Y = 12.8;
  const GLACIS_SLOPE = 0.34;  // dy/dz của giáp mũi trên
  const GLACIS_ANGLE = Math.atan(GLACIS_SLOPE);
  const RETURN_ROLLER_Z = [-17, -5.5, 6, 17.5];
  const RETURN_ROLLER_R = 0.95;

  const glacisY = (z) => 9.4 + (z + 31) * GLACIS_SLOPE;

  function buildHalberd(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team);
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildHull(chassis, M, unit);
    const running = buildRunningGear(chassis, M);
    unit.trackSystem = running.tracks;
    const turretParts = buildTurret(chassis, M, unit, rnd);
    buildGun(unit, M);

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.radarDish = null;

    // -------------------------------------------------------------------------
    // HOẠT ẢNH: XÍCH & BÁNH LĂN THEO VẬN TỐC TỪNG BÊN, KÍNH TOÀN CẢNH QUÉT
    // -------------------------------------------------------------------------
    let lastYaw = null;
    let scanTime = rnd() * 10;
    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        const yaw = u.group.rotation.y;
        let dYaw = lastYaw === null ? 0 : yaw - lastYaw;
        lastYaw = yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;

        const v = u.isDead ? 0 : (u.speed || 0);
        // Xoay trái (yaw tăng) -> xích phải chạy nhanh hơn xích trái
        // Xích bị đứt (hệ thống hư hại đặt u.trackBroken[0|1]) -> dải xích bên đó đứng im
        const br = u.trackBroken;
        const dl = (br && br[0]) ? 0 : v * dt - dYaw * TRACK_X;
        const dr = (br && br[1]) ? 0 : v * dt + dYaw * TRACK_X;
        if (Math.abs(dl) > 1e-5 || Math.abs(dr) > 1e-5) {
          running.tracks.advance([dl, dr]);
          for (const ws of running.wheelSets) ws.roll(dl, dr);
        }

        // Giật nòng hiển thị thu nhỏ cho đúng hành trình lùi thật (~0.45 m); gameplay giữ nguyên
        if (u.barrelGroup) u.barrelGroup.position.z = (u.barrelRecoil || 0) * 0.2;

        if (!u.isDead) {
          scanTime += dt;
          turretParts.periHead.rotation.y = Math.sin(scanTime * 0.35) * 1.4;
          if (unit.rcwsTurret) unit.rcwsTurret.rotation.y = Math.sin(scanTime * 0.22 + 1.3) * 0.9;
        }
      }
    };

    return { hullW: HULL_HALF_W * 2 };
  }

  // ===========================================================================
  // THÂN XE
  // ===========================================================================
  function buildHull(chassis, M, unit) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;

    // Khối thân trên phủ qua xích (giáp mũi vát + sàn động cơ + tấm đuôi vát)
    hb.add(VehicleKit.sideProfile([
      [-31.0, 9.4], [-21.0, DECK_Y], [20.5, DECK_Y], [28.4, 12.4],
      [29.4, 11.4], [29.4, 9.4]
    ], HULL_HALF_W * 2, 0.22), P);

    // Bồn thân dưới nằm giữa hai dải xích, tấm mũi dưới vát chống mìn
    hb.add(VehicleKit.sideProfile([
      [-31.0, 9.6], [-27.2, 3.9], [27.6, 3.9], [29.0, 5.6], [29.0, 9.6]
    ], 18.3, 0.2), M.paintDusty);

    // Tấm giáp tăng cường bắt bu-lông trên giáp mũi
    hb.setTag('appliqueF');
    const appliqueZ = -26.0;
    hb.box(20, 0.7, 9.6, P, [0, glacisY(appliqueZ) + 0.38, appliqueZ], [-GLACIS_ANGLE, 0, 0]);
    for (let i = 0; i < 9; i++) {
      for (const dz of [-4.2, 4.2]) {
        const z = appliqueZ + dz * Math.cos(GLACIS_ANGLE);
        hb.cyl(0.22, 0.22, 0.25, 6, D, [-8.8 + i * 2.2, glacisY(z) + 0.8, z], 'y', [-GLACIS_ANGLE, 0, 0]);
      }
    }

    hb.setTag(null);
    // Nắp lái xe + 3 kính tiềm vọng ở mép giáp mũi (nắp: bị nổ kho đạn thổi bật — VehicleDamage.blowHatches)
    hb.setTag('hatchDrv');
    hb.cyl(1.9, 2.0, 0.35, 18, P, [5.6, DECK_Y + 0.17, -18.4]);
    hb.box(1.2, 0.35, 0.8, D, [5.6, DECK_Y + 0.2, -16.3]);
    hb.setTag(null);
    for (const x of [3.9, 5.6, 7.3]) {
      hb.box(1.1, 0.55, 0.7, D, [x, glacisY(-21.6) + 0.25, -21.6], [-GLACIS_ANGLE, 0, 0]);
      hb.box(0.9, 0.32, 0.08, M.glass, [x, glacisY(-22.0) + 0.38, -22.0], [-GLACIS_ANGLE - 0.9, 0, 0]);
    }

    // Đường ghép tấm giáp trên sàn trước
    hb.box(26, 0.06, 0.14, D, [0, DECK_Y + 0.02, -15.0]);

    // Cụm đèn pha 2 bóng có khung bảo vệ ở 2 góc mũi
    for (const s of [-1, 1]) {
      const x = s * 12.4, z = -27.4, y = glacisY(z) + 0.85;
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(2.6, 1.5, 1.4, D, [x, y, z]);
      hb.cyl(0.5, 0.5, 0.2, 12, M.lens, [x - 0.6, y + 0.1, z - 0.75], 'z');
      hb.cyl(0.32, 0.32, 0.2, 10, M.lens, [x + 0.7, y + 0.1, z - 0.75], 'z');
      hb.box(3.2, 0.16, 0.16, P, [x, y + 1.0, z - 1.2]);
      hb.box(0.16, 1.3, 0.16, P, [x - 1.55, y + 0.4, z - 1.2]);
      hb.box(0.16, 1.3, 0.16, P, [x + 1.55, y + 0.4, z - 1.2]);
      hb.setTag(null);
    }

    // Móc kéo cứu hộ trên tấm mũi dưới
    for (const s of [-1, 1]) {
      hb.box(1.8, 1.3, 1.2, M.paintDusty, [s * 6.5, 6.6, -29.0]);
      const shackle = new THREE.TorusGeometry(0.75, 0.22, 6, 12, Math.PI * 1.3);
      hb.add(shackle, M.steel, [s * 6.5, 5.7, -29.7], [0, Math.PI / 2, Math.PI * 0.85]);
    }

    // Cáp kéo thép chạy dọc mép sàn hai bên + kẹp giữ
    for (const s of [-1, 1]) {
      hb.cyl(0.28, 0.28, 30, 8, M.steel, [s * 13.9, DECK_Y + 0.3, 1], 'z');
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [s * 13.9, DECK_Y + 0.3, -14.6], [Math.PI / 2, 0, 0]);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [s * 13.9, DECK_Y + 0.3, 16.6], [Math.PI / 2, 0, 0]);
      for (const z of [-9, 1, 11]) hb.box(0.9, 0.55, 0.5, D, [s * 13.9, DECK_Y + 0.25, z]);
      // Xẻng và xà beng dã chiến
      hb.setTag('tool' + (s < 0 ? 'L' : 'R'));
      hb.cyl(0.13, 0.13, 6.5, 6, M.canvasDark, [s * 11.6, DECK_Y + 0.2, 21.5], 'z');
      hb.box(1.3, 0.12, 1.6, D, [s * 11.6, DECK_Y + 0.2, 25.4]);
      hb.cyl(0.12, 0.12, 7.5, 6, D, [s * 10.6, DECK_Y + 0.18, 20.0], 'z');
      hb.setTag(null);
    }

    // Sàn động cơ: tấm thăm máy với đường ghép + vòng móc cẩu
    for (const z of [7.5, 17.6]) hb.box(26.5, 0.06, 0.14, D, [0, DECK_Y + 0.02, z]);
    hb.box(0.14, 0.06, 10, D, [0, DECK_Y + 0.02, 12.5]);
    for (const x of [-12.2, 12.2]) {
      for (const z of [9.0, 16.2]) {
        hb.add(new THREE.TorusGeometry(0.45, 0.14, 5, 10), M.steel, [x, DECK_Y + 0.35, z], [0, Math.PI / 2, 0]);
      }
    }
    for (let i = 0; i < 12; i++) {
      hb.cyl(0.16, 0.16, 0.14, 6, D, [-11 + i * 2, DECK_Y + 0.06, 7.9]);
      hb.cyl(0.16, 0.16, 0.14, 6, D, [-11 + i * 2, DECK_Y + 0.06, 17.2]);
    }

    // Lưới tản nhiệt két nước với lá chớp nghiêng
    for (const s of [-1, 1]) {
      const cx = s * 6.9, w = 11.0;
      hb.box(w, 0.12, 9.6, D, [cx, DECK_Y + 0.05, 23.0]);
      hb.box(w + 0.6, 0.4, 0.35, P, [cx, DECK_Y + 0.2, 18.05]);
      hb.box(w + 0.6, 0.4, 0.35, P, [cx, DECK_Y + 0.2, 27.95]);
      hb.box(0.35, 0.4, 10.2, P, [cx - w / 2 - 0.12, DECK_Y + 0.2, 23.0]);
      hb.box(0.35, 0.4, 10.2, P, [cx + w / 2 + 0.12, DECK_Y + 0.2, 23.0]);
      for (let i = 0; i < 11; i++) {
        hb.box(w - 0.1, 0.06, 0.62, P, [cx, DECK_Y + 0.22, 18.75 + i * 0.85], [0.55, 0, 0]);
      }
    }

    // Tấm đuôi: lưới xả khí động cơ, đèn hậu, móc kéo, hộp điện thoại bộ binh
    for (const s of [-1, 1]) {
      const x = s * 8.6;
      hb.box(5.2, 2.3, 0.3, D, [x, 10.4, 29.55]);
      for (let i = 0; i < 4; i++) hb.box(5.0, 0.12, 0.3, P, [x, 9.55 + i * 0.55, 29.72], [0.5, 0, 0]);
      hb.box(1.8, 1.0, 0.5, D, [s * 13.2, 11.3, 29.6]);
      hb.box(0.7, 0.55, 0.12, M.tailLens, [s * 13.6, 11.35, 29.88]);
      hb.box(0.5, 0.4, 0.12, M.lens, [s * 12.7, 11.35, 29.88]);
      hb.box(1.6, 1.2, 1.0, M.paintDusty, [s * 6.5, 6.4, 29.3]);
      hb.add(new THREE.TorusGeometry(0.7, 0.2, 6, 12, Math.PI * 1.3), M.steel, [s * 6.5, 5.6, 29.9], [0, Math.PI / 2, Math.PI * 0.85]);
      // Chắn bùn cao su sau bánh sao
      hb.setTag('flap' + (s < 0 ? 'L' : 'R'));
      hb.box(TRACK_W + 0.6, 2.4, 0.16, M.rubber, [s * TRACK_X, 8.2, 30.1]);
      hb.setTag(null);
    }
    hb.box(1.4, 1.7, 0.6, P, [3.2, 10.5, 29.75]);
    hb.box(2.0, 1.0, 1.4, D, [0, 6.6, 29.4]);

    // Váy xích phân đoạn
    for (const s of [-1, 1]) {
      // Đoạn trước giáp dày, cắt vát góc dưới
      hb.setTag('skirt' + (s < 0 ? 'L' : 'R') + '0');
      hb.add(VehicleKit.sideProfile([
        [-30.4, 9.75], [-30.4, 7.6], [-28.2, 4.4], [-15.5, 4.4], [-15.5, 9.75]
      ], 1.3, 0.12), P, [s * 15.65, 0, 0]);
      for (let i = 0; i < 6; i++) {
        hb.cyl(0.2, 0.2, 0.2, 6, D, [s * 16.35, 8.9, -28.6 + i * 2.5], 'x');
      }
      hb.setTag(null);
      // Các đoạn mỏng phía sau có dải cao su dưới mép
      const z0 = -15.3, z1 = 27.2, n = 5;
      const seg = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        const a = z0 + i * seg + 0.1, b = a + seg - 0.2;
        hb.setTag('skirt' + (s < 0 ? 'L' : 'R') + (i + 1));
        const pts = i === n - 1
          ? [[a, 9.75], [a, 4.9], [b - 1.6, 4.9], [b, 6.8], [b, 9.75]]
          : [[a, 9.75], [a, 4.9], [b, 4.9], [b, 9.75]];
        hb.add(VehicleKit.sideProfile(pts, 0.5, 0.08), P, [s * 15.3, 0, 0]);
        hb.box(0.4, 0.7, (i === n - 1 ? seg - 1.9 : seg - 0.3), M.rubber,
          [s * 15.3, 4.55, (i === n - 1 ? (a + b - 1.6) / 2 : (a + b) / 2)]);
        for (let k = 0; k < 4; k++) {
          hb.cyl(0.16, 0.16, 0.2, 6, D, [s * 15.6, 9.2, a + 0.9 + k * (seg - 1.9) / 3], 'x');
        }
        hb.setTag(null);
      }
      // Thanh treo váy dọc mép sponson
      hb.box(0.5, 0.35, 57.6, P, [s * 15.25, 9.85, -1.6]);
    }

    // Tay đòn treo xoắn, giá bánh dẫn hướng, hộp truyền lực cuối (phần lớn khuất sau váy)
    for (const s of [-1, 1]) {
      for (const z of WHEEL_Z) {
        hb.box(1.1, 0.9, 3.4, D, [s * 9.9, WHEEL_Y + 0.7, z - 1.4], [-0.35, 0, 0]);
      }
      hb.box(1.2, 1.4, 4.2, D, [s * 9.9, IDLER.y + 0.6, IDLER.z + 2.0], [0.4, 0, 0]);
      hb.cyl(1.7, 1.9, 1.6, 14, M.paintDusty, [s * 9.6, SPROCKET.y, SPROCKET.z], 'x');
    }

    const meshes = hb.build(chassis, [0, 9, 0]);
    unit.hullMainMesh = meshes.get(P);
    builder_setExhaust(chassis, unit);
  }

  function builder_setExhaust(chassis, unit) {
    unit.exhaustLeft = new THREE.Object3D();
    unit.exhaustLeft.position.set(-8.6, 10.6, 30.2);
    unit.exhaustRight = new THREE.Object3D();
    unit.exhaustRight.position.set(8.6, 10.6, 30.2);
    chassis.add(unit.exhaustLeft);
    chassis.add(unit.exhaustRight);
  }

  // ===========================================================================
  // HỆ THỐNG DI CHUYỂN: BÁNH & XÍCH
  // ===========================================================================
  function buildRunningGear(chassis, M) {
    const halfSpan = TRACK_W / 2;

    // Bánh chịu tải kép: 2 đĩa lốp cao su, khe giữa cho răng dẫn hướng của xích
    const roadPositions = [];
    for (const s of [-1, 1]) for (const z of WHEEL_Z) roadPositions.push({ x: s * TRACK_X, y: WHEEL_Y, z });
    const roadWheels = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.55, 1.55]) {
        b.cyl(WHEEL_R, WHEEL_R, 1.9, 22, M.rubber, [off, 0, 0], 'x');
        b.cyl(2.35, 2.35, 2.0, 22, M.paintDusty, [off, 0, 0], 'x');
      }
      // Mặt đĩa dập lõm + moay-ơ + bu-lông
      b.add(new THREE.TorusGeometry(1.75, 0.2, 6, 22), M.paintDusty, [2.55, 0, 0], [0, Math.PI / 2, 0]);
      b.cyl(0.95, 1.05, 0.5, 12, M.steel, [2.75, 0, 0], 'x');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.13, 0.13, 0.3, 6, M.dark, [3.0, Math.cos(a) * 0.62, Math.sin(a) * 0.62], 'x');
      }
    }, roadPositions, WHEEL_R);

    // Bánh dẫn hướng trước (thép, có lỗ giảm trọng)
    const idlerWheels = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.55, 1.55]) {
        b.cyl(IDLER.r, IDLER.r, 1.8, 22, M.paintDusty, [off, 0, 0], 'x');
        b.cyl(IDLER.r + 0.02, IDLER.r + 0.02, 0.3, 22, M.steel, [off + 0.75, 0, 0], 'x');
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.cyl(0.45, 0.45, 0.1, 10, M.dark, [2.48, Math.cos(a) * 1.45, Math.sin(a) * 1.45], 'x');
      }
      b.cyl(0.8, 0.9, 0.6, 12, M.steel, [2.6, 0, 0], 'x');
    }, [{ x: -TRACK_X, y: IDLER.y, z: IDLER.z }, { x: TRACK_X, y: IDLER.y, z: IDLER.z }], IDLER.r + LINK_IN);

    // Bánh sao chủ động sau: 2 vành răng ăn khớp chốt xích
    const sprocketWheels = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.7, 1.7]) {
        b.cyl(2.35, 2.35, 0.8, 22, M.paintDusty, [off, 0, 0], 'x');
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 2;
          b.box(0.8, 0.85, 0.75, M.steel, [off, Math.cos(a) * 2.55, Math.sin(a) * 2.55], [a, 0, 0]);
        }
      }
      b.cyl(1.6, 1.6, 2.6, 16, M.paintDusty, [0, 0, 0], 'x');
      b.cyl(1.1, 1.3, 0.6, 12, M.steel, [2.3, 0, 0], 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cyl(0.14, 0.14, 0.3, 6, M.dark, [2.6, Math.cos(a) * 0.8, Math.sin(a) * 0.8], 'x');
      }
    }, [{ x: -TRACK_X, y: SPROCKET.y, z: SPROCKET.z }, { x: TRACK_X, y: SPROCKET.y, z: SPROCKET.z }], SPROCKET.r + LINK_IN);

    // Con lăn đỡ xích phía trên
    const topIn = (z) => {
      const k = (z - IDLER.z) / (SPROCKET.z - IDLER.z);
      return (IDLER.y + IDLER.r) + ((SPROCKET.y + SPROCKET.r) - (IDLER.y + IDLER.r)) * k;
    };
    const rollerPositions = [];
    for (const s of [-1, 1]) {
      for (const z of RETURN_ROLLER_Z) rollerPositions.push({ x: s * TRACK_X, y: topIn(z) - RETURN_ROLLER_R - 0.02, z });
    }
    const returnRollers = new VehicleKit.WheelSet(chassis, (b) => {
      b.cyl(RETURN_ROLLER_R, RETURN_ROLLER_R, 3.6, 14, M.rubber, [0, 0, 0], 'x');
      b.cyl(0.55, 0.55, 3.8, 10, M.steel, [0, 0, 0], 'x');
    }, rollerPositions, RETURN_ROLLER_R);

    // Dải xích: từng mắt xích có đệm cao su, khớp nối hai đầu, răng dẫn hướng giữa
    const tracks = new VehicleKit.TrackSystem(chassis, {
      circles: [
        { u: IDLER.z, v: IDLER.y, r: IDLER.r + LINK_IN },
        { u: WHEEL_Z[0], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: WHEEL_Z[WHEEL_Z.length - 1], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: SPROCKET.z, v: SPROCKET.y, r: SPROCKET.r + LINK_IN }
      ],
      sidesX: [-TRACK_X, TRACK_X],
      pitch: 1.5,
      buildLink: (b, pitch) => {
        b.box(TRACK_W - 0.2, 0.6, pitch * 0.8, M.track, [0, 0, 0]);
        for (const x of [-1.42, 1.42]) b.box(2.1, 0.3, pitch * 0.58, M.rubber, [x, 0.45, 0]);
        b.box(0.5, 0.56, 0.62, M.steel, [-halfSpan - 0.05, 0, pitch / 2]);
        b.box(0.5, 0.56, 0.62, M.steel, [halfSpan + 0.05, 0, pitch / 2]);
        b.box(0.5, 0.5, 0.6, M.track, [0, 0, pitch / 2]);
        b.box(0.55, 1.15, pitch * 0.42, M.track, [0, -0.85, 0]);
      }
    });

    return { tracks, wheelSets: [roadWheels, idlerWheels, sprocketWheels, returnRollers] };
  }

  // ===========================================================================
  // THÁP PHÁO
  // ===========================================================================
  function buildTurret(chassis, M, unit, rnd) {
    const turret = new THREE.Group();
    turret.position.set(0, DECK_Y, -1.5);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(DECK_Y);
    const P = M.paint, D = M.dark;
    const ROOF = 7.0;

    // Vòng bi tháp pháo
    tb.cyl(9.6, 9.8, 0.7, 32, D, [0, 0.35, 0]);

    // Thân tháp đa diện, sườn vát nghiêng vào trong
    tb.add(VehicleKit.loft(
      [[-10.6, -11.5], [10.6, -11.5], [11.2, -4], [11.2, 8], [10.2, 16.5], [9.4, 17.6],
       [-9.4, 17.6], [-10.2, 16.5], [-11.2, 8], [-11.2, -4]],
      [[-9.9, -11.0], [9.9, -11.0], [10.5, -4], [10.5, 8], [9.6, 16.2], [8.8, 17.2],
       [-8.8, 17.2], [-9.6, 16.2], [-10.5, 8], [-10.5, -4]],
      0.6, ROOF
    ), P);

    // Giáp nêm hình mũi tên hai bên nòng (nóc dốc xuống phía trước)
    for (const s of [-1, 1]) {
      const pts = [[s * 3.4, -11.4], [s * 10.9, -11.4], [s * 10.9, -12.7], [s * 4.2, -19.2]];
      tb.add(VehicleKit.loft(pts, pts, 0.9, [ROOF, ROOF, ROOF - 0.5, 4.6]), P);
      // Hàng bu-lông gắn module
      for (let i = 0; i < 4; i++) {
        const k = (i + 0.5) / 4;
        const x = s * (10.9 + (4.2 - 10.9) * k), z = -12.7 + (-19.2 + 12.7) * k;
        tb.cyl(0.2, 0.2, 0.2, 6, D, [x, (ROOF - 0.5) + (4.6 - ROOF + 0.5) * k - 0.25, z]);
      }
      // Module giáp má tháp
      tb.setTag('cheek' + (s < 0 ? 'L' : 'R'));
      const cheek = [[s * 10.9, -12.6], [s * 12.4, -11.0], [s * 12.4, -0.6], [s * 10.9, -0.6]];
      tb.add(VehicleKit.loft(cheek, cheek, 1.2, [6.6, 6.6, 6.4, 6.4]), P);
      for (let i = 0; i < 3; i++) tb.cyl(0.18, 0.18, 0.2, 6, D, [s * 12.5, 5.6, -9.5 + i * 4], 'x');
      tb.setTag(null);
    }

    // Kính ngắm pháo thủ có hộp giáp và cửa chớp (nóc trước phải)
    tb.setTag('opticGunner');
    tb.box(3.4, 2.2, 3.8, P, [7.0, ROOF + 1.1, -8.4]);
    tb.box(2.4, 1.0, 0.12, M.glass, [7.0, ROOF + 1.3, -10.33]);
    tb.box(1.3, 1.5, 0.14, P, [5.5, ROOF + 1.4, -10.6], [0, 0.7, 0]);
    tb.box(1.3, 1.5, 0.14, P, [8.5, ROOF + 1.4, -10.6], [0, -0.7, 0]);
    tb.setTag(null);

    // Nắp chỉ huy với vòng kính tiềm vọng (trái) & nắp nạp đạn (phải)
    tb.cyl(2.3, 2.4, 0.55, 20, P, [-5.2, ROOF + 0.27, 3.0]);
    tb.setTag('hatchCdr');
    tb.cyl(1.95, 2.0, 0.32, 20, P, [-5.2, ROOF + 0.7, 3.0]);
    tb.box(1.0, 0.35, 0.6, D, [-5.2, ROOF + 0.75, 5.0]);
    tb.setTag(null);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.85 + i * (Math.PI * 1.7 / 6) - Math.PI / 2;
      const x = -5.2 + Math.cos(a) * 2.35, z = 3.0 + Math.sin(a) * 2.35;
      tb.box(0.75, 0.4, 0.3, M.glass, [x, ROOF + 0.45, z], [0, -a + Math.PI / 2, 0]);
    }
    tb.setTag('hatchLdr');
    tb.cyl(1.85, 1.9, 0.3, 18, P, [5.4, ROOF + 0.15, 2.6]);
    tb.box(0.9, 0.35, 0.5, D, [5.4, ROOF + 0.3, 4.5]);
    tb.setTag(null);
    tb.box(0.8, 0.45, 0.4, M.glass, [5.4, ROOF + 0.25, 0.4]);

    // Kính toàn cảnh trưởng xe trên trụ cao (đầu kính xoay quét)
    tb.cyl(0.9, 1.05, 2.4, 12, P, [-6.6, ROOF + 1.2, -6.2]);
    const periHead = new THREE.Group();
    periHead.position.set(-6.6, ROOF + 3.15, -6.2);
    const ph = new VehicleKit.PartBatch(DECK_Y + ROOF + 3.15);
    ph.box(2.3, 1.6, 2.3, P, [0, 0, 0]);
    ph.box(1.6, 0.75, 0.1, M.glass, [0, 0.1, -1.18]);
    ph.box(2.5, 0.18, 2.5, D, [0, 0.85, 0]);
    ph.build(periHead);
    turret.add(periHead);
    VehicleKit.registerPartGroup(unit, 'opticCdr', periHead);

    // Tay nắm leo tháp hai bên mép nóc
    for (const s of [-1, 1]) tb.grabHandle([s * 9.4, ROOF, 7.0], 'z', 2.8, 0.6, P);

    // Tấm xả áp hộc đạn trên nóc đuôi tháp
    tb.box(16.2, 0.06, 0.16, D, [0, ROOF + 0.03, 8.6]);
    tb.box(16.2, 0.06, 0.16, D, [0, ROOF + 0.03, 16.2]);
    for (const x of [-8.1, -2.7, 2.7, 8.1]) tb.box(0.16, 0.06, 7.6, D, [x, ROOF + 0.03, 12.4]);

    // Tấm vải nhận diện phe (nhìn rõ từ trên không)
    tb.box(5.0, 0.08, 3.4, M.idPanel, [-4.6, ROOF + 0.08, 12.4], [0, 0.04, 0]);

    // Cảm biến gió ngang + 2 cần ăng-ten
    tb.cyl(0.12, 0.14, 2.6, 6, D, [0, ROOF + 1.3, 16.0]);
    tb.box(1.4, 0.12, 0.12, D, [0, ROOF + 2.6, 16.0]);
    const ant = new VehicleKit.AntennaSet(D, turret);
    for (const s of [-1, 1]) {
      tb.cyl(0.45, 0.5, 0.7, 8, D, [s * 7.6, ROOF + 0.35, 15.4]);
      ant.add([s * 7.6, ROOF + 0.7, 15.4], 15, { tilt: [0.12, 0], r0: 0.09, r1: 0.05 });
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // Cụm phóng lựu đạn khói 4 ống mỗi bên
    for (const s of [-1, 1]) {
      tb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      tb.box(0.45, 1.4, 4.4, P, [s * 11.35, 5.7, 2.4]);
      for (let i = 0; i < 4; i++) {
        tb.cyl(0.4, 0.4, 1.7, 10, D, [s * 11.95, 6.25, 0.8 + i * 1.05], 'y', [-0.45, 0, -s * 0.85]);
      }
      tb.setTag(null);
    }

    // Thùng đồ hai bên hông hộc đạn
    for (const s of [-1, 1]) {
      tb.setTag('bin' + (s < 0 ? 'L' : 'R'));
      tb.box(1.8, 3.8, 7.0, P, [s * 11.3, 3.6, 12.4], [0, s * 0.06, 0]);
      tb.box(1.9, 0.08, 7.1, D, [s * 11.32, 4.9, 12.4], [0, s * 0.06, 0]);
      for (const z of [10.2, 14.6]) tb.box(0.15, 0.7, 0.5, M.steel, [s * 12.25, 4.5, z]);
      tb.setTag(null);
    }

    // Giỏ thép sau đuôi tháp chứa bạt cuộn, ba lô, can nước
    const bz0 = 17.5, bz1 = 20.6, by0 = 1.8, by1 = 5.2, bx = 8.6;
    tb.box(bx * 2, 0.2, bz1 - bz0, D, [0, by0, (bz0 + bz1) / 2]);
    tb.box(bx * 2, 0.22, 0.22, P, [0, by1, bz1]);
    tb.box(bx * 2, 0.22, 0.22, P, [0, (by0 + by1) / 2, bz1]);
    for (const s of [-1, 1]) {
      tb.box(0.22, 0.22, bz1 - bz0, P, [s * bx, by1, (bz0 + bz1) / 2]);
      tb.box(0.22, by1 - by0, 0.22, P, [s * bx, (by0 + by1) / 2, bz1]);
    }
    for (let i = 1; i < 8; i++) tb.box(0.16, by1 - by0, 0.16, P, [-bx + i * (bx * 2 / 8), (by0 + by1) / 2, bz1]);
    tb.setTag('stowage');
    tb.cyl(1.15, 1.15, 11.5, 12, M.canvas, [0.6, by0 + 1.3, 18.9], 'x');
    tb.box(2.6, 2.1, 2.2, M.canvasDark, [-6.6, by0 + 1.15, 19.2], [0, 0.12, 0.05]);
    tb.box(2.2, 1.7, 2.0, M.canvas, [6.4, by0 + 0.95, 19.0], [0, -0.2, 0]);
    tb.jerrycan([-3.6, by0 + 1.4, 19.9], Math.PI / 2, 1.2, 2.8, 2.0, P, D);
    tb.setTag(null);

    // --- Chi tiết bề mặt tháp: ghép tấm module má, mối hàn, bu-lông, móc cẩu ---
    const SIDE_TILT = Math.atan2(0.7, 6.4);
    const sideX = (y) => 11.2 - (y - 0.6) * (0.7 / 6.4);
    for (const s of [-1, 1]) {
      const rot = [0, 0, s * SIDE_TILT];
      // Module giáp má: chia 2 tấm, viền bu-lông trên/dưới
      tb.seam([s * 12.42, 1.5, -6.2], [s * 12.42, 6.4, -6.2], [s, 0, 0], D);
      tb.boltRow([s * 12.4, 6.15, -11.0], [s * 12.4, 6.15, -1.2], 8, 'x', D, 0.16, s);
      tb.boltRow([s * 12.4, 1.65, -11.0], [s * 12.4, 1.65, -1.2], 8, 'x', D, 0.16, s);
      tb.weld([s * 12.2, 6.62, -11.0], [s * 12.2, 6.62, -0.7], P, 0.1);
      // Hông tháp sau module: đường ghép ngang, bu-lông mép nóc, mối hàn nóc - hông
      tb.seam([s * (sideX(2.4) + 0.02), 2.4, -0.4], [s * (sideX(2.4) + 0.02), 2.4, 8.4], [s, 0, 0], D);
      tb.boltRow([s * sideX(6.5), 6.5, -0.2], [s * sideX(6.5), 6.5, 7.6], 6, 'x', D, 0.15, s, rot);
      tb.weld([s * (sideX(ROOF) - 0.04), ROOF + 0.02, -4.0], [s * (sideX(ROOF) - 0.04), ROOF + 0.02, 8.0], P);
      // Mối hàn chân giáp nêm với mặt trước tháp
      tb.weld([s * 3.6, ROOF + 0.02, -11.2], [s * 10.6, ROOF + 0.02, -11.2], P, 0.1);
      // Móc cẩu nóc tháp (trước & sau)
      for (const z of [-9.8, 15.6]) {
        tb.box(1.0, 0.35, 0.6, P, [s * 8.4, ROOF + 0.15, z]);
        tb.add(new THREE.TorusGeometry(0.5, 0.16, 5, 10), M.steel, [s * 8.4, ROOF + 0.5, z], [0, Math.PI / 2, 0]);
      }
      // Bu-lông viền nóc dọc hai mép
      tb.boltRow([s * 9.6, ROOF, -8.4], [s * 9.6, ROOF, 15.2], 12, 'y', D, 0.14);
    }
    // Nấm thông gió quạt hút khí thuốc phóng trên nóc giữa
    tb.cyl(0.55, 0.6, 0.6, 12, P, [1.4, ROOF + 0.3, 5.6]);
    tb.cyl(1.15, 0.95, 0.35, 14, P, [1.4, ROOF + 0.75, 5.6]);

    tb.build(turret);

    // Số hiệu chiến thuật kẻ stencil trên thùng đồ hai bên
    const tacNumber = `${1 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.4, 1.7);
      if (decal) {
        decal.position.set(s * 12.27, 3.4, 12.4);
        decal.rotation.y = s * Math.PI / 2 + s * 0.06;
        turret.add(decal);
      }
    }

    // Trạm vũ khí điều khiển từ xa (súng máy 7.62mm phòng không) trên nóc phía nạp đạn — kiểu trạm hộp như Protector /
    // CROWS: chân đế xoay + 2 càng đỡ trục ngóc; khối ngóc gồm hộp súng ở giữa-trái (súng máy + loa che lửa), hộp camera
    // ngày / ảnh nhiệt + đo xa laser bên phải, hộp dây đạn treo bên trái; tất cả ngóc theo nòng
    const rcws = new THREE.Group();
    rcws.position.set(6.2, ROOF, 9.0);
    const rb = new VehicleKit.PartBatch(DECK_Y + ROOF);
    rb.cyl(1.15, 1.25, 0.35, 14, D, [0, 0.18, 0]);              // vòng xoay
    rb.box(1.9, 0.55, 1.9, P, [0, 0.62, 0.15]);                  // bệ (mô-tơ quay, điện)
    rb.box(1.5, 0.3, 1.5, D, [0, 0.98, 0.15]);
    for (const s of [-1, 1]) {                                    // 2 càng đỡ trục ngóc
      rb.box(0.22, 1.25, 0.8, P, [s * 0.98, 1.6, 0.0]);
      rb.cyl(0.24, 0.24, 0.12, 10, D, [s * 1.1, 2.05, 0.0], 'x');
    }
    rb.box(0.5, 0.35, 0.5, D, [0.6, 1.2, 0.95]);                 // hộp điều khiển phía sau
    rb.build(rcws);
    const rcwsGun = new THREE.Group();
    rcwsGun.position.set(0, 2.05, 0.0);
    const gb = new VehicleKit.PartBatch(DECK_Y + ROOF + 2.05);
    // hộp súng (vỏ che thân súng) + thân súng máy, nòng, loa che lửa
    gb.box(0.62, 0.6, 2.2, P, [-0.3, 0.05, -0.15]);
    gb.box(0.5, 0.08, 1.9, D, [-0.3, 0.39, -0.15]);              // nắp hộp súng
    gb.cyl(0.13, 0.13, 0.7, 8, D, [-0.3, 0.12, -1.55], 'z');     // ống áo nòng
    gb.cyl(0.075, 0.075, 2.3, 8, D, [-0.3, 0.12, -2.85], 'z');   // nòng
    gb.cyl(0.13, 0.11, 0.42, 8, D, [-0.3, 0.12, -4.2], 'z');     // loa che lửa
    // hộp dây đạn treo bên trái + máng dẫn dây đạn
    gb.box(0.48, 0.62, 0.95, P, [-0.95, -0.12, 0.1]);
    gb.box(0.2, 0.12, 0.5, D, [-0.7, 0.22, -0.2]);
    // hộp camera ngày / ảnh nhiệt + đo xa laser bên phải, có mái che
    gb.box(0.82, 0.78, 1.25, P, [0.55, 0.08, -0.25]);
    gb.box(0.95, 0.08, 1.45, D, [0.55, 0.52, -0.3]);
    gb.box(0.7, 0.62, 0.06, D, [0.55, 0.08, -0.89]);
    gb.cyl(0.17, 0.17, 0.06, 12, M.lens, [0.42, 0.18, -0.93], 'z');   // camera ngày
    gb.cyl(0.13, 0.13, 0.06, 10, M.glass, [0.72, 0.18, -0.93], 'z');  // ảnh nhiệt
    gb.cyl(0.06, 0.06, 0.06, 8, M.lens, [0.55, -0.12, -0.93], 'z');   // đo xa laser
    gb.build(rcwsGun);
    rcws.add(rcwsGun);
    turret.add(rcws);
    unit.rcwsTurret = rcws;
    unit.rcwsGun = rcwsGun;
    unit.rcwsMuzzleLocal = new THREE.Vector3(-0.3, 0.12, -4.42);
    VehicleKit.registerPartGroup(unit, 'rcws', rcws);

    return { periHead };
  }

  // ===========================================================================
  // PHÁO CHÍNH 120MM L/55
  // ===========================================================================
  function buildGun(unit, M) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.9, -11.5);
    unit.barrelPivot = pivot;
    unit.turretGroup.add(pivot);

    // Tấm chắn pháo (mantlet) + súng máy đồng trục
    const mb = new VehicleKit.PartBatch(DECK_Y + 3.9);
    const mPts = [[-3.25, 1.5], [3.25, 1.5], [3.25, -2.8], [2.4, -4.3], [-2.4, -4.3], [-3.25, -2.8]];
    mb.add(VehicleKit.loft(mPts, mPts, -2.7, 2.5), M.paint);
    mb.cyl(1.75, 1.75, 1.2, 18, M.paint, [0, 0, -4.9], 'z');
    // Bạt che khe nòng (chống bụi lọt vào khe tấm chắn), nếp gấp vải
    mb.cyl(1.42, 1.9, 1.3, 16, M.canvasDark, [0, 0, -6.1], 'z');
    for (const z of [-5.75, -6.3]) {
      const r = 1.95 - (-5.45 - z) * 0.37;
      mb.cyl(r, r, 0.16, 16, M.canvasDark, [0, 0, z], 'z');
    }
    mb.cyl(0.24, 0.24, 1.0, 8, M.dark, [-2.0, -1.0, -4.7], 'z');
    mb.box(1.2, 0.8, 0.5, M.dark, [2.0, 1.4, -4.2]);
    mb.build(pivot);

    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);

    // Các đoạn ống bọc nhiệt thuôn dần về miệng nòng (rTop = đầu phía trước)
    const gb = new VehicleKit.PartBatch(DECK_Y + 3.9);
    const P = M.paint;
    const section = (rFront, rRear, zRear, zFront, mat = P) => {
      gb.cyl(rFront, rRear, zRear - zFront, 20, mat, [0, 0, (zRear + zFront) / 2], 'z');
    };
    section(1.28, 1.32, -5.4, -15.4);
    section(1.22, 1.26, -15.85, -21.35);
    section(1.24, 1.8, -21.35, -22.35);   // côn sau bầu hút khói
    section(1.8, 1.8, -22.35, -27.35);
    section(1.2, 1.8, -27.35, -28.35);    // côn trước bầu hút khói
    section(1.12, 1.18, -28.35, -33.3);
    section(1.05, 1.1, -33.45, -44.5);
    section(1.0, 1.04, -44.75, -55.05);
    section(1.04, 1.04, -55.05, -57.35, M.steel); // miệng nòng thép trần muội đen
    for (const z of [-15.62, -33.37, -44.62]) {
      gb.cyl(1.42, 1.42, 0.5, 20, M.dark, [0, 0, z], 'z');
    }
    gb.cyl(0.62, 0.62, 0.1, 16, M.bore, [0, 0, -57.36], 'z');
    // Gương chuẩn nòng (MRS) gần miệng nòng
    gb.box(0.6, 0.5, 1.0, M.dark, [0, 1.25, -55.4]);
    gb.box(0.5, 0.35, 0.08, M.glass, [0, 1.3, -55.95]);
    gb.build(barrel);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -57.6);
  }

  TankModelBuilder.registerModel('ALL_ROUNDER', buildHalberd);
})();
