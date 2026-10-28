/**
 * PHÁO TỰ HÀNH BÁNH LỐP ARBALEST 155  (tankType: ARTILLERY)
 *
 * Thiết kế hư cấu: lựu pháo 155mm đặt trên xe tải quân sự 6x6, tháp pháo bọc giáp phía sau.
 * - Cabin bọc giáp đầu bằng (cab-over) với kính chống đạn dày, khoang động cơ phía sau cabin
 * - 3 trục: trục trước bẻ lái, 2 trục sau tải nặng; lốp địa hình gai to có bơm hơi trung tâm
 * - Tháp pháo bọc giáp phía sau; pháo 155mm L/52 đặt trên nóc tháp, 2 xi-lanh lùi / đẩy lên nằm trên nòng,
 *   lò xo cân bằng, hãm lùi 2 tầng, radar đo sơ tốc đầu nòng; hành quân thì nòng gác lên giá khóa trên nóc cabin
 * - Nạp đạn tự động (chạy theo đồng hồ nạp gameplay): nắp khoang trượt mở -> cầu trục kẹp gắp đạn từ thang nâng
 *   trái đặt lên máng nằm ngang -> máng quay đồng trục nhĩ pháo lên đúng góc nòng, xích tống đạn vào buồng -> lặp lại
 *   với bó liều phóng bên phải -> máng thu về, nắp đóng. Nạp ở mọi góc nâng tới ~40° (LOAD_EL_MAX), cao hơn thì nòng hạ
 *   về 40° để nạp. Thang nâng đẩy viên kế tiếp lên từ hầm đạn trong tháp.
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
  const RECOIL_FULL = 32;                   // barrelRecoil spg.js đặt lúc bắn lựu pháo
  const SPADE_PIVOT = { y: 8.4, z: 38.2 };  // bản lề lưỡi càng ở đuôi khung gầm
  const SPADE_LEN = 10.6;                   // từ bản lề tới lưỡi cắt
  const SPADE_TRAVEL = -2.99;               // hành quân: dựng đứng gọn sau đuôi xe
  const SPADE_DEPLOYED = -0.62;             // triển khai: lưỡi cắt cắm sâu xuống đất
  const SPADE_CYL_LOCAL = { y: 4.0, z: -0.9 }; // điểm bám xi-lanh trên dầm ngang (cục bộ)
  const JACK_Z = [-17.2, 33.6];             // 2 cặp chân chống: sau bánh trước & sau cụm bánh sau
  const JACK_X = 11.0;
  const JACK_DROP = 3.85;                   // hành trình hạ để đế tì chạm đất
  const DEPLOY_LIFT = 0.55;                 // chân chống ép tiếp nhấc thân ~7 cm, lốp nhả tải (vẫn chạm đất)
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
  // Nạp ở mọi góc nâng tới LOAD_EL_MAX: máng nạp quay đồng trục với trục nhĩ pháo nên luôn thẳng hàng buồng đạn,
  // không cần hạ nòng. Cao hơn thì đuôi máng (cách trục ~1.9 m) chúi chạm sàn xe vì trục nhĩ pháo đặt thấp sát nóc
  // tháp -> nòng hạ về đúng góc này để nạp rồi nâng lại (kiểu Archer có trần góc nạp)
  const LOAD_EL_MAX = 0.7;   // ~40° (rad)
  const CHARGE_MAX = 5;   // số module liều phóng tối đa (tầm xa nhất); tầm gần chỉ 2

  function buildArbalest(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    // Xe đã qua chiến trường: bùn văng, muội, dầu loang, xước, lỗ mảnh đạn, gỉ chảy, lốp bám bùn, kính bụi
    const M = K.createMaterials(unit.team, { battle: 1, seed: K.lookSeed(unit) });
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
    // Thép trần riêng xe này: dầu mỡ bám bụi, xỉn — phản chiếu trời nhẹ thôi (bản chung soi trời quá sáng làm cần piston,
    // tay nắm, ray nạp đạn trắng bệch như nhựa)
    M.steel = M.steel.clone();
    M.steel.roughness = 0.7;
    if (M.steel.envMap) M.steel.envMapIntensity = 0.45;
    // Đồng thau / đồng đỏ: vòng bít khí khóa nòng, hạt nổ (đạn & liều phóng vẽ riêng: getRoundLook)
    M.shellBand = new THREE.MeshStandardMaterial({ color: 0xb2693a, roughness: 0.35, metalness: 0.85 });
    const rnd = K.lookRng(unit);   // vẻ ngoài gieo theo xe: dựng lại (đổi trang bị) vẫn y chiếc cũ

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
    // Ô UAV: UAV trinh sát (đế sạc + drone trên nóc cabin — drone_air.js gắn trong trận) hoặc UAV cảm tử phóng từ ống trên
    // chân đế mô-đun dùng chung (roof_mounts.js) đặt đúng chỗ đế sạc. Equipment.equip gọi unit.mountUav(id)
    const uavCtx = { key: 'uav', parent: chassis, seat: [6.1, CAB_ROOF, -25.6], yBase: CAB_ROOF, M, P: M.paint, D: M.dark, unit, rnd };
    unit.uavKind = 'recon';
    unit.mountUav = (id) => {
      if (!window.RoofMounts) return;
      RoofMounts.mount(uavCtx, id === 'kami' ? 'kami' : 'none');
      unit.uavKind = id === 'kami' ? 'kami' : 'recon';
    };
    const gun = buildHowitzer(unit, M);
    if (turretParts && turretParts.loader) Object.assign(turretParts.loader, { breechWedge: gun.breechWedge, primer: gun.primer });
    // Nòng thật theo trục giả ngay lập tức (giới hạn khi vắt qua cabin): spg.js gọi khi thử góc nòng (chạm trần hầm / tường)
    // trong cùng khung hình — không thì phép thử đo nòng ở góc khung trước
    const syncGun = () => {
      let el = gun.pivotProxy.rotation.x;
      // Đang nạp: nòng cao quá LOAD_EL_MAX thì hạ về trần góc nạp; thấp hơn thì giữ nguyên, máng nạp nâng theo
      const lk = unit._loadGunK || 0;
      if (lk > 0 && el > LOAD_EL_MAX) el += (LOAD_EL_MAX - el) * lk;
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
    let lastRc = 0;
    const whip = { a: 0, v: 0 };

    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        VehicleKit.updateShutters(u, dt);
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
        // Thân nhấc khi chân chống ép đất: spg.js cộng _deployLift vào độ cao khung thân; bánh thõng xuống đúng chừng ấy
        // (giảm xóc duỗi ra) nên lốp vẫn chạm đất, chỉ nhả tải
        const lift = deployLift(deployVis);
        if (Math.abs(lift - (u._deployLift || 0)) > 1e-4) {
          u._deployLift = lift;
          for (const p of wheels.positions) p.y = WHEEL_Y - lift;
          wheels.update();
        }

        // Nòng: lấy góc nâng spg.js ghi vào trục giả, giới hạn khi nòng vắt qua cabin
        // (vắt qua nóc cabin / khoang máy thì tự nâng vượt giá khóa nòng, drone, ống xả... — ballistics.js artyMinElevation)
        const el = syncGun();
        // Giật nòng hiển thị thu nhỏ (độ giật gameplay vẫn giữ nguyên). spg.js trả barrelRecoil về đều tuyến tính; nòng
        // thật lùi tức thì, khựng ở cuối hành trình, bộ đẩy về tăng tốc kéo nòng ra rồi bộ hãm cuối hành trình phanh êm
        const rc = Math.min(1, (u.barrelRecoil || 0) / RECOIL_FULL);
        const back = rc <= 0 ? 0 : 1 - smooth(Math.max(0, (1 - rc - 0.1) / 0.9));
        gun.barrel.position.z = RECOIL_FULL * RECOIL_VISUAL * back;
        // Rung đầu nòng (muzzle whip): ống nòng dài 9 m vẫy lên xuống tắt dần ~0.6 s sau mỗi phát
        const fired = rc > lastRc + 0.5;
        if (fired) whip.v -= 0.2;
        lastRc = rc;
        for (let h = Math.min(dt, 0.1); h > 0; h -= 0.016) {
          const s = Math.min(h, 0.016);
          whip.v += (-1500 * whip.a - 14 * whip.v) * s;
          whip.a += whip.v * s;
        }
        gun.barrel.rotation.x = whip.a;
        groundEvents(u, deploy, fired);

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
      // Đường cắt cửa: khe hở quanh cánh cửa (đáy cửa nằm trên vòm hốc bánh — trước 2 khe dọc chạy xuống tận trong
      // hốc bánh, lơ lửng giữa không), gioăng cao su lộ ở khe đáy, khóa cửa có ổ chìa
      for (const z of [-32.5, -23.9]) hb.box(0.08, 9.4, 0.12, D, [x, 17.05, z]);
      for (const y of [21.7, 12.4]) hb.box(0.08, 0.12, 8.72, D, [x, y, -28.2]);
      hb.box(0.06, 0.1, 8.4, M.rubber, [x + s * 0.02, 12.32, -28.2]);
      hb.box(0.25, 0.35, 1.4, M.steel, [s * (HALF_W + 0.2), 14.2, -25.0]);
      hb.cyl(0.13, 0.13, 0.1, 8, D, [s * (HALF_W + 0.1), 14.75, -24.6], 'x');
      hb.box(0.2, 5.0, 0.2, M.steel, [s * (HALF_W + 0.25), 15.5, -23.3]);
      // Bậc lên cabin sau bánh trước: 2 má thép đỡ, 2 bậc tôn có lỗ chống trượt (lỗ là khe tối), bậc dưới treo thấp
      for (const ex of [8.45, 10.75]) hb.box(0.22, 4.6, 1.3, D, [s * ex, 6.5, -19.3]);
      for (const y of [4.45, 6.85]) {
        hb.box(2.5, 0.22, 1.3, M.paintDusty, [s * 9.6, y, -19.3]);
        for (const dx of [-0.7, 0, 0.7]) hb.box(0.4, 0.04, 0.7, M.bore, [s * 9.6 + dx, y + 0.12, -19.3]);
      }
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

    // Nóc cabin: cửa nóc, đèn quay, giá khóa nòng hành quân (ăng-ten liên lạc chỉ còn 2 cần trên tháp pháo)
    hb.cyl(1.9, 2.0, 0.4, 18, P, [-4.6, CAB_ROOF + 0.2, -27.0]);
    hb.box(1.0, 0.35, 0.6, D, [-4.6, CAB_ROOF + 0.35, -25.0]);
    hb.setTag('travelLock');
    for (const s of [-1, 1]) hb.beam([s * 3.4, CAB_ROOF, -21.6], [s * 1.6, CAB_ROOF + 2.3, -21.6], 0.5, 0.5, P);
    hb.box(4.2, 0.5, 1.2, P, [0, CAB_ROOF + 2.4, -21.6]);
    hb.add(new THREE.TorusGeometry(1.55, 0.28, 6, 14, Math.PI), D, [0, CAB_ROOF + 2.6, -21.6], [0, 0, Math.PI]);
    hb.setTag(null);

    // Khoang động cơ sau cabin + lá chớp tản nhiệt + ống xả dựng đứng + ống hút gió
    // Nắp khoang máy: tôn dập vát mép trên (không phải hộp vuông thành sắc), lưới tản nhiệt lõm vào trong khung, cửa
    // thăm máy có bản lề trên + khóa gài, gân dập tăng cứng nắp nóc
    const ePts = [[-9.5, -18.5], [9.5, -18.5], [9.5, -11.1], [-9.5, -11.1]];
    hb.add(VehicleKit.loft(ePts, ePts, 8.1, 17.1, 0.9), P);
    for (const s of [-1, 1]) {
      const x = s * 9.5;
      // (lưới lùi về trước, chừa chỗ ống xả / ống hút gió dựng sát vách sau)
      hb.box(0.12, 5.0, 4.5, D, [x - s * 0.02, 12.65, -15.45]);                                 // lòng lưới tối
      for (const y of [10.05, 15.25]) hb.box(0.3, 0.3, 4.9, P, [x + s * 0.05, y, -15.45]);
      for (const z of [-17.85, -13.05]) hb.box(0.3, 5.5, 0.3, P, [x + s * 0.05, 12.65, z]);
      for (let i = 0; i < 6; i++) hb.box(0.2, 0.3, 4.3, D, [s * 9.55, 10.4 + i * 0.9, -15.45], [0, 0, s * 0.5]);
      hb.hinge([x + s * 0.12, 15.55, -15.45], 'z', 4.4, P, 0.16, 3);
      hb.box(0.16, 0.42, 0.3, M.steel, [x + s * 0.2, 10.4, -17.2]);
      hb.box(0.16, 0.42, 0.3, M.steel, [x + s * 0.2, 10.4, -13.6]);
    }
    for (const x of [-5.2, 5.2]) hb.box(0.5, 0.14, 6.0, P, [x, 17.13, -14.8]);
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
    // Mép sàn: dầm viền chữ C sẫm ốp hông sàn, thép góc chặn mép trên, khoen chằng hàng dọc hai bên (sàn không còn là
    // tấm phẳng cắt vuông)
    for (const s of [-1, 1]) {
      hb.box(0.3, 1.0, 48.4, D, [s * (HALF_W - 0.08), DECK_Y - 0.78, 13.0]);
      hb.box(0.4, 0.2, 48.4, P, [s * (HALF_W - 0.3), DECK_Y + 0.08, 13.0]);
      for (let z = -8; z <= 34; z += 7) hb.add(new THREE.TorusGeometry(0.34, 0.09, 5, 10), M.steel, [s * (HALF_W + 0.12), DECK_Y - 1.05, z], [0, Math.PI / 2, 0]);
    }

    // Hệ truyền động dưới gầm (nhìn ngang thấy giữa các cầu, không còn khoảng trống): hộp số sau máy -> trục ngắn -> hộp số
    // phụ chia cầu giữa khung -> trục các đăng lên cầu trước & cầu giữa, cầu giữa truyền thẳng (through-drive) ra cầu sau.
    // Mỗi trục có 2 khớp các đăng (chạc chữ thập) + then trượt ở đầu, ống thép sẫm
    hb.box(3.4, 2.8, 5.4, D, [0, 8.0, -8.4]);                          // hộp số
    hb.cyl(1.5, 1.7, 0.6, 14, D, [0, 8.1, -11.0], 'z');                 // vỏ ly hợp ốp vào máy
    hb.box(3.8, 2.8, 3.2, D, [0, 6.6, 0.4]);                            // hộp số phụ chia cầu
    for (const s of [-1, 1]) hb.box(0.8, 0.4, 1.6, D, [s * 2.6, 7.6, 0.4]);   // tai treo vào dầm dọc
    const shaft = (a, b) => {
      hb.strut(a, b, 0.32, M.dark, 10);
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      for (const [p, k] of [[a, 1], [b, -1]]) {
        const j = [p[0] + d.x * 0.45 * k, p[1] + d.y * 0.45 * k, p[2] + d.z * 0.45 * k];
        hb.cyl(0.5, 0.5, 0.5, 10, M.steel, j, 'z');                    // chạc khớp các đăng
        hb.box(0.95, 0.2, 0.2, M.steel, j);                              // chữ thập
      }
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      hb.cyl(0.42, 0.42, 1.4, 10, M.dark, [m[0] + d.x * 2, m[1] + d.y * 2, m[2] + d.z * 2], 'z');   // ống then trượt
    };
    shaft([0, 7.6, -5.6], [0, 7.2, -1.3]);
    shaft([0, 5.9, -1.3], [0, WHEEL_Y + 0.35, AXLES[0].z + 1.7]);   // luồn dưới đáy hộp số
    shaft([0, 5.9, 2.1], [0, WHEEL_Y + 0.35, AXLES[1].z - 1.3]);
    shaft([0, WHEEL_Y + 0.35, AXLES[1].z + 1.7], [0, WHEEL_Y + 0.35, AXLES[2].z - 1.3]);

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
      // Chắn bùn cụm bánh sau: tôn gấp mép (mép ngoài bẻ xuống thành gờ cứng, không phải tấm phẳng lửng), đuôi uốn
      // xuống thành tấm hắt bùn sau bánh — tấm cao su treo vào mép dưới tấm hắt (trước là tấm cao su lơ lửng giữa không)
      const gx = s * (9.0 + 2.3 - 0.09);
      if (s > 0) {
        hb.box(4.6, 0.3, 25.0, P, [s * 9.0, 11.4, 18.2]);
        hb.box(0.18, 0.95, 25.0, P, [gx, 10.95, 18.2]);
      } else {
        // Bên trái: đuôi chắn bùn bị va quệt, gập xuống & vặn méo
        hb.box(4.6, 0.3, 18.4, P, [s * 9.0, 11.4, 14.9]);
        hb.box(0.18, 0.95, 18.4, P, [gx, 10.95, 14.9]);
        hb.box(4.6, 0.3, 6.7, P, [s * 9.0 - 0.08, 11.4 - 3.35 * Math.sin(0.14), 24.1 + 3.35 * Math.cos(0.14)], [0.14, 0, 0.06]);
      }
      // Tấm hắt bùn sau cụm bánh (thép mỏng, nẹp gân giữa) + bu-lông kẹp tấm cao su
      const az = s < 0 ? 30.8 : 30.15;
      hb.box(4.4, 5.7, 0.18, P, [s * 9.0, s < 0 ? 8.05 : 8.35, az], [s < 0 ? 0.1 : 0.03, 0, 0]);
      hb.box(0.3, 5.2, 0.12, D, [s * 9.0, s < 0 ? 8.05 : 8.35, az - 0.12]);
      hb.boltRow([s * 7.6, 5.7, az + 0.16], [s * 10.4, 5.7, az + 0.16], 4, 'z', D, 0.11);
      // Chắn bùn trước: giá thép ốp sau hốc bánh cabin giữ tấm cao su
      hb.box(3.9, 2.7, 0.16, D, [s * 9.0, 6.85, -20.08]);
      hb.boltRow([s * 7.6, 5.75, -20.2], [s * 10.4, 5.75, -20.2], 4, 'z', D, 0.1, -1);
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

    // Thùng nhiên liệu có cổ rót + nắp khóa + bậc bước, hộp ắc quy/dụng cụ, tủ đồ giữa hai cụm bánh
    hb.setTag('fuelTank');
    hb.cyl(1.75, 1.75, 9.0, 16, P, [-9.0, 9.0, -5.5], 'z');
    for (const z of [-8.0, -3.0]) {
      hb.cyl(1.83, 1.83, 0.32, 16, D, [-9.0, 9.0, z], 'z');
      hb.box(0.5, 3.8, 0.36, D, [-7.35, 9.0, z]); // giá đỡ bắt vào dầm dọc khung gầm
    }
    hb.cyl(0.32, 0.36, 0.55, 10, D, [-9.8, 10.65, -7.1], 'y', [0, 0, 0.38]); // cổ rót nhiên liệu nghiêng
    hb.cyl(0.40, 0.40, 0.16, 10, M.steel, [-10.0, 10.92, -7.1], 'y', [0, 0, 0.38]); // nắp vặn bình xăng
    hb.box(0.45, 0.12, 2.2, M.steel, [-10.65, 8.2, -5.5]); // bậc bước chân gắn ngoài đai bình xăng
    hb.strut([-8.1, 10.5, -3.4], [-6.8, 10.8, -9.8], 0.08, M.rubber, 5); // ống dẫn dầu cao su bọc lưới
    hb.setTag(null);
    hb.box(3.2, 3.4, 8.0, P, [8.8, 9.2, -5.8]);
    hb.box(0.1, 0.1, 7.6, D, [10.42, 10.6, -5.8]);
    for (const s of [-1, 1]) {
      hb.setTag('box' + (s < 0 ? 'L' : 'R'));
      hb.box(3.2, 3.4, 4.6, P, [s * 8.8, 9.2, 3.0]);
      hb.box(0.1, 3.0, 0.1, D, [s * 10.42, 9.2, 3.0]);
      for (const dz of [-1.15, 1.15]) {
        hb.box(0.08, 2.2, 1.5, P, [s * 10.43, 9.2, 3.0 + dz]); // ô dập nổi cánh tủ
        hb.box(0.16, 0.45, 0.26, M.steel, [s * 10.46, 9.3, 3.0 + dz * 0.45]); // tay khóa chữ T
      }
      hb.hinge([s * 10.42, 7.55, 3.0], 'z', 4.1, D, 0.12, 4);
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
      hb.boltRow([s * 8.3, 17.1, -17.4], [s * 8.3, 17.1, -12.2], 5, 'y', D, 0.15);
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
    b.cyl(0.82, 0.92, 0.42, 14, M.paintDusty, [0, yc + H * 0.6 + 0.2, 0]);
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
      // moay-ơ sơn cùng vành (bánh xe quân sự không để thép trần), mép bích bắt bu-lông sẫm dầu mỡ
      b.cyl(1.05, 1.15, 1.5, 14, M.paintDusty, [hw - 0.05, 0, 0], 'x');
      b.cyl(1.2, 1.2, 0.18, 14, M.dark, [hw * 0.3 + 0.1, 0, 0], 'x');
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
        // Xi-lanh thủy lực đẩy chân dựng trên nắp hộp (thân sơn, nắp đầu sẫm, cổ nối ống dầu) + ống dầu cao su võng
        // về van trên khung; 2 tấm gân chéo đỡ giá ôm cột vào dầm khung (trước là cột hộp trơn như cọc rào)
        hb.cyl(0.78, 0.78, 1.9, 14, P, [x, 12.95, z]);
        hb.cyl(0.9, 0.9, 0.32, 14, D, [x, 13.95, z]);
        hb.cyl(0.25, 0.25, 0.45, 8, M.steel, [x - s * 0.5, 14.2, z + 0.35]);
        hb.strut([x - s * 0.5, 14.35, z + 0.35], [x - s * 1.6, 13.4, z + 0.9], 0.11, M.rubber, 6);
        hb.strut([x - s * 1.6, 13.4, z + 0.9], [s * 7.2, 10.6, z + 1.05], 0.11, M.rubber, 6);
        for (const dz of [-0.95, 0.95]) hb.beam([x - s * 1.15, 6.3, z + dz], [s * 6.2, 8.85, z + dz], 0.3, 0.3, D);
        hb.boltRow([x - s * 1.24, 7.2, z - 0.8], [x - s * 1.24, 10.8, z - 0.8], 4, 'x', D, 0.12, -s);
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

  // Đế chân chống / lưỡi càng chạm đất: bụi tung thấp + vết lún, rãnh lưỡi càng khoét thật xuống đất (ExplosionFX);
  // mỗi phát bắn khi đã hạ càng: lực giật đẩy lưỡi càng cắm sâu thêm (rãnh cũ khoét rộng & sâu ra), bụi rung ở chân chống
  const _ge = new THREE.Vector3(), _gr = new THREE.Vector3();
  function groundEvents(u, gear, fired) {
    // lưỡi càng: chờ cắm hẳn mới khoét (khoét khi còn đang xoay thì rãnh lệch chỗ, các phát sau khoét thành rãnh kép)
    const jackOn = gear.jackK > 0.97, spadeOn = gear.spadeK > 0.99;
    const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene && u.scene ? ExplosionFX.forScene(u.scene) : null;
    const ev = (jackOn && !gear.jackDown) || (spadeOn && !gear.spadeDown) || (fired && spadeOn);
    if (ev && fx && fx.digGround && !u.isDead && (u.alwaysFX || typeof SpgFXPool === 'undefined' || SpgFXPool.isNearView(u.x, u.z))) {
      u.group.updateMatrixWorld(true);
      const right = _gr.set(1, 0, 0).transformDirection(u.chassisGroup.matrixWorld);
      if (jackOn && !gear.jackDown) {
        for (const leg of gear.jacks) {
          leg.localToWorld(_ge.set(0, 3.9, 0));
          fx.kickDust(_ge.x, _ge.z, 0.35);
          fx.digGround(_ge.x, _ge.z, right.x, right.z, 4.6, 4.6, 0.22);
        }
      }
      if (spadeOn && (!gear.spadeDown || fired)) {
        gear.spade.localToWorld(_ge.set(0, -SPADE_LEN + 1.6, 0.3));
        fx.kickDust(_ge.x, _ge.z, fired ? 0.55 : 0.8);
        // Chỉ khoét rãnh một lần khi lưỡi càng vừa chạm đất. Khoét lại ngay frame
        // khai hỏa buộc lớp hố 3D cập nhật instance/stencil cùng lúc với chớp lửa,
        // khói, âm thanh và viên đạn, gây khựng rõ trên GPU yếu.
        if (!gear.spadeDown) fx.digGround(_ge.x, _ge.z, right.x, right.z, 17.0, 3.6, 1.1);
        if (fired) for (const leg of gear.jacks) { leg.localToWorld(_ge.set(0, 3.9, 0)); fx.kickDust(_ge.x, _ge.z, 0.2); }
      }
    }
    gear.jackDown = jackOn;
    gear.spadeDown = spadeOn;
  }

  // Thân xe nhấc lên khi chân chống tì đất & ép tiếp (lốp nhả tải): pha 0.5 -> 0.7 của tiến độ hạ càng
  function deployLift(d) {
    return DEPLOY_LIFT * smooth((d - 0.5) / 0.2);
  }

  function updateDeployGear(gear, d) {
    // Chân chống hạ trước (0 -> 0.55), lưỡi càng hạ sau (0.35 -> 1); thân nhấc lên thì chân duỗi thêm đúng chừng ấy
    const jackK = smooth(d / 0.55);
    gear.jackK = jackK;
    gear.spadeK = smooth((d - 0.35) / 0.65);
    for (const leg of gear.jacks) leg.position.y = -JACK_DROP * jackK - deployLift(d);

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

    // Hai má giáp bao bệ nòng trên nóc tháp + nắp chụp trục quay (dừng ở z = BAY.z0: khóa nòng lộ ra trong khoang nạp
    // đạn). Giữa hai má là khe hở nóc cho nòng nâng / hạ: nâng cao thì nòng vươn lên khỏi khe, khóa nòng chúi xuống lỗ
    // nóc tháp; hạ về góc nạp thì nóc khóa nòng & giá nòng nằm lọt trong khe (trước là hộp kín: khóa nòng, xi-lanh lùi
    // đâm xuyên nắp hộp)
    const SW = 2.75;
    for (const s of [-1, 1]) {
      const cPts = [[s * SW, -8.6], [s * 4.2, -8.6], [s * 4.6, -6.6], [s * 4.6, BAY.z0], [s * SW, BAY.z0]];
      tb.add(VehicleKit.loft(cPts, cPts, TOP - 0.2, [TOP + 2.8, TOP + 2.8, TOP + 3.4, TOP + 3.6, TOP + 3.6]), P);
      // Gioăng cao su chắn bụi dọc mép trong khe, nẹp thép bắt bu-lông giữ gioăng
      tb.box(0.3, 0.32, 10.4, M.rubber, [s * (SW - 0.1), TOP + 3.2, (BAY.z0 - 8.6) / 2 + 0.05], [-Math.atan2(0.8, 10.6), 0, 0]);
      tb.boltRow([s * (SW + 0.35), TOP + 3.55, BAY.z0 - 0.6], [s * (SW + 0.35), TOP + 2.85, -8.0], 6, 'y', D, 0.11);
    }
    // Lòng khe tối: lỗ nóc tháp cho đuôi khóa nòng chúi xuống khi nâng nòng cao
    tb.box(SW * 2 - 0.1, 0.04, BAY.z0 + 8.4, M.bore, [0, TOP + 0.04, (BAY.z0 - 8.6) / 2]);
    for (const s of [-1, 1]) tb.cyl(1.7, 1.7, 0.8, 16, D, [s * 4.9, PIVOT.y, PIVOT.z], 'x');
    const loader = buildLoaderBay(tb, turret, M, TOP);

    // Cửa nạp đạn sau tháp, cửa nóc, thang leo
    tb.box(7.0, 6.0, 0.25, P, [0, 4.6, 14.5]);
    tb.box(7.2, 0.1, 0.3, D, [0, 7.65, 14.5]);
    for (const x of [-3.7, 3.7]) tb.box(0.6, 1.0, 0.5, D, [x, 5.4, 14.6]);
    tb.box(1.8, 0.3, 0.4, M.steel, [0, 3.0, 14.7]);
    tb.setTag('hatchCdr');   // nắp chỉ huy: nổ trong buồng pháo thổi bật (VehicleDamage.blowHatches)
    tb.cyl(1.7, 1.8, 0.3, 16, P, [-6.2, TOP + 0.15, 7.6]);
    tb.box(0.9, 0.3, 0.5, D, [-6.2, TOP + 0.3, 9.4]);
    tb.setTag(null);
    for (let i = 0; i < 5; i++) tb.box(0.25, 0.25, 2.2, M.steel, [9.95, 1.6 + i * 1.7, 9.4]);
    tb.box(0.25, 8.4, 0.25, M.steel, [9.95, 5.0, 8.3]);
    tb.box(0.25, 8.4, 0.25, M.steel, [9.95, 5.0, 10.5]);

    // Can nhiên liệu dự phòng treo hai góc sau tháp (khay chữ L + đai giữ có khóa gài) + tay nắm đầu thang leo
    for (const s of [-1, 1]) {
      tb.setTag('can' + (s < 0 ? 'L' : 'R'));
      tb.jerrycan([s * 6.0, 2.5, 15.35], Math.PI / 2, 1.3, 3.7, 2.7, P, D);
      tb.box(2.85, 0.14, 1.45, D, [s * 6.0, 0.62, 15.35]); // khay đáy đỡ can
      tb.box(2.85, 0.42, 0.10, D, [s * 6.0, 0.82, 16.05]); // gờ chặn đáy
      for (const y of [1.6, 3.3]) {
        tb.box(2.92, 0.22, 0.08, D, [s * 6.0, y, 16.04]);
        tb.box(0.10, 0.22, 1.42, D, [s * 4.58, y, 15.35]);
        tb.box(0.10, 0.22, 1.42, D, [s * 7.42, y, 15.35]);
      }
      tb.box(0.32, 0.36, 0.14, M.steel, [s * 6.0, 2.45, 16.08]); // khóa gài đai can
      tb.setTag(null);
    }
    tb.grabHandle([7.7, TOP, 9.4], 'z', 1.6, 0.55, P);
    tb.grabHandle([-8.1, TOP, 10.8], 'z', 1.6, 0.55, P);

    // Tấm vải nhận diện phe trên nóc sau tháp
    VehicleKit.idCloth(tb, M.idPanel, M.canvasDark, 3.0, 4.4, [6.2, TOP + 0.02, 8.6], 0.03, rnd);

    // Kính toàn cảnh chỉ huy (đầu xoay quét 2 cửa sổ quang học), cột khí tượng có chén đo gió, vòm GPS, ăng-ten
    tb.cyl(0.8, 0.95, 2.0, 12, P, [-6.4, TOP + 1.0, -4.2]);
    tb.cyl(1.08, 1.08, 0.18, 12, D, [-6.4, TOP + 0.09, -4.2]);
    const periHead = new THREE.Group();
    periHead.position.set(-6.4, TOP + 2.7, -4.2);
    const ph = new VehicleKit.PartBatch(DECK_Y + TOP + 2.7);
    ph.box(2.0, 1.4, 2.0, P, [0, 0, 0]);
    ph.box(1.4, 0.6, 0.1, M.optic || M.glass, [0, 0.1, -1.03]);
    ph.box(0.06, 0.62, 0.11, D, [0.10, 0.1, -1.04]);
    ph.cyl(0.22, 0.22, 0.12, 10, M.thermalWin || M.lens, [-0.34, 0.1, -1.03], 'z');
    ph.box(1.6, 0.10, 0.32, D, [0, 0.46, -1.10], [0.2, 0, 0]);
    ph.box(2.2, 0.16, 2.2, D, [0, 0.72, 0]);
    ph.build(periHead);
    VehicleKit.sightShutter(unit, periHead, P, D, { hinge: [0, 0.42, -1.16], w: 0.8, h: 1.5, t: 0.1, along: 'y', dir: -1, axis: 'x', open: 1.5, yBase: DECK_Y + TOP + 2.7 });
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

    // Ống phóng lựu đạn khói hai góc trước tháp (có nắp cao su chống bụi, đai kẹp và cáp điểm hỏa)
    for (const s of [-1, 1]) {
      tb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      tb.box(0.45, 1.2, 3.0, P, [s * 9.95, 7.6, -7.0], [0, s * 0.2, 0]);
      tb.box(0.30, 0.36, 0.50, D, [s * 10.1, 7.15, -5.7], [0, s * 0.2, 0]);
      const rot = [-0.45, 0, -s * 0.85];
      const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      for (let i = 0; i < 3; i++) {
        const c = [s * 10.5, 8.1, -8.0 + i * 0.95];
        const at = (d) => [c[0] + ax.x * d, c[1] + ax.y * d, c[2] + ax.z * d];
        tb.cyl(0.36, 0.36, 1.5, 10, D, c, 'y', rot);
        tb.cyl(0.40, 0.40, 0.14, 10, P, at(-0.38), 'y', rot);
        tb.cyl(0.40, 0.40, 0.18, 10, M.rubber, at(0.78), 'y', rot);
        tb.strut(at(-0.68), [s * 10.05, 7.35, -7.9 + i * 0.9], 0.032, M.rubber, 4);
      }
      tb.setTag(null);
    }

    // Thùng đồ hai bên hông tháp (kèm gân tăng cứng, bản lề nắp và khóa gài thép)
    for (const s of [-1, 1]) {
      tb.setTag('bin' + (s < 0 ? 'L' : 'R'));
      tb.box(1.6, 3.4, 8.0, P, [s * 10.5, 3.2, 2.0]);
      tb.box(1.7, 0.12, 8.1, P, [s * 10.52, 4.92, 2.0]);
      tb.box(1.7, 0.08, 8.1, D, [s * 10.52, 4.4, 2.0]);
      tb.hinge([s * 9.75, 4.92, 2.0], 'z', 7.4, D, 0.12, 4);
      for (const z of [-0.4, 2.0, 4.4]) tb.box(0.09, 2.5, 0.26, P, [s * 11.33, 2.95, z]);
      for (const z of [-0.8, 4.8]) tb.box(0.14, 0.58, 0.42, M.steel, [s * 11.35, 4.15, z]);
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
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.2, 1.6, undefined, true, (rnd() * 1e9) | 0);
      if (decal) {
        decal.position.set(s * 11.32, 3.0, 2.0);
        decal.rotation.y = s * Math.PI / 2;
        turret.add(decal);
      }
      // Tên xe sơn stencil dọc hông tháp (như ảnh giới thiệu)
      const name = VehicleKit.createStencilDecal('ARBALEST 155', 9.0, 1.3, undefined, true, (rnd() * 1e9) | 0);
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
  // Đạn 155 HE kiểu M795 tiện liền 1 khối theo mặt cắt thật [r, y] (y dọc trục từ tâm đáy lên đầu ngòi, thân r 0.6 =
  // 155 mm): đáy có nút đáy & vát đuôi (boat-tail), đai dẫn đồng nhô, thân, gờ định tâm (bourrelet), ogive tiếp tuyến
  // bán kính ~8.7 cỡ nòng, ngòi nổ (vai ngòi, vòng chỉnh, thân côn, chụp mũi nhựa đen). Góc gãy nhân đôi điểm để pháp
  // tuyến không bị làm tròn qua mép
  const SHELL_LEN = 7.05;
  function shellProfile() {
    const P = [[0, 0.03], [0.2, 0.03], [0.21, 0], [0.21, 0], [0.5, 0], [0.5, 0], [0.55, 0.12], [0.585, 0.4], [0.6, 0.62],
      [0.6, 0.72], [0.6, 0.72], [0.627, 0.74], [0.627, 0.74], [0.627, 1.13], [0.627, 1.13], [0.6, 1.15], [0.6, 1.15],
      [0.6, 3.5], [0.606, 3.53], [0.606, 3.82], [0.6, 3.85]];
    const rho = 5.2;
    for (let i = 1; i <= 14; i++) {
      const u = 1.975 * i / 14;
      P.push([Math.sqrt(rho * rho - u * u) - (rho - 0.6), 3.85 + u]);
    }
    P.push([0.21, 5.825], [0.245, 5.84], [0.245, 5.84], [0.245, 6.02], [0.245, 6.02], [0.228, 6.05], [0.14, 6.78],
      [0.118, 6.84], [0.118, 6.84], [0.11, 6.95], [0.07, 7.02], [0, SHELL_LEN]);
    return P;
  }
  // Bó liều module (kiểu MACS / DM72): vỏ cháy cứng, mặt đáy có lỗ ống dẫn lửa giữa, mép vát, 2 rãnh gân gần hai đầu,
  // đầu kia có gờ lồng (spigot) cắm vào module kế tiếp
  const MOD_LEN = 1.5;
  function moduleProfile() {
    return [[0, 0.04], [0.11, 0.04], [0.11, 0], [0.11, 0], [0.52, 0], [0.52, 0], [0.58, 0.03], [0.6, 0.09], [0.6, 0.18],
      [0.594, 0.2], [0.594, 0.24], [0.6, 0.26], [0.6, 1.26], [0.594, 1.28], [0.594, 1.32], [0.6, 1.34], [0.6, 1.4],
      [0.585, 1.44], [0.585, 1.44], [0.56, 1.44], [0.56, 1.44], [0.56, MOD_LEN], [0.56, MOD_LEN], [0.11, MOD_LEN],
      [0.11, MOD_LEN], [0.11, 1.46], [0, 1.46]];
  }
  // Lathe trục dọc -> trục Z (+y mặt cắt hướng -Z), UV: u quanh chu vi, v = vị trí dọc trục / tổng dài (khớp canvas vẽ)
  function roundLathe(prof, len, seg) {
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / len);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // Vân vẽ tay trên canvas (dựng 1 lần, mọi xe dùng chung): màu + bản đồ độ nhám (kênh G) / kim loại (kênh B)
  let roundLook = null;
  function getRoundLook(M) {
    if (roundLook) return roundLook;
    const rng = (() => { let s = 0x9e3779b9; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s + 0x6d2b79f5)) >>> 0) / 4294967296; })();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

    // --- ĐẠN: 512 quanh chu vi x 1024 dọc trục (~136 / 145 px mỗi đơn vị: chữ không méo) ---
    const W = 512, H = 1024, row = (y) => (1 - y / SHELL_LEN) * H;
    const [sc, s] = mk(W, H), [rc, r] = mk(W, H);
    const band = (y0, y1, col, rough, metal) => {
      s.fillStyle = col; s.fillRect(0, row(y1), W, row(y0) - row(y1));
      r.fillStyle = `rgb(0,${rough},${metal})`; r.fillRect(0, row(y1), W, row(y0) - row(y1));
    };
    band(0, SHELL_LEN, '#414329', 155, 40);                 // sơn ô-liu (OD) bán bóng, ngả nâu
    band(0, 0.62, '#36382a', 165, 40);                      // đáy & vát đuôi: sơn sẫm, bám muội kho
    band(0.72, 1.15, '#a8643a', 95, 225);                   // đai dẫn đồng (gilding metal)
    band(3.5, 3.85, '#55554b', 140, 120);                   // gờ định tâm: sơn mòn loang lộ thép tiện
    band(4.05, 4.3, '#c29a2a', 150, 30);                    // vạch vàng đạn nổ mạnh (HE) trên ogive
    band(5.825, SHELL_LEN, '#6c6d61', 120, 170);            // thân ngòi: hợp kim nhôm / thép xám
    band(5.84, 6.02, '#8a8a80', 85, 230);                   // vòng chỉnh ngòi gia công
    band(6.84, SHELL_LEN, '#1d1d1b', 200, 0);               // chụp mũi nhựa đen
    // Lốm đốm sơn: vệt đậm / nhạt li ti (không phải mặt nhựa đồng màu)
    for (let i = 0; i < 2600; i++) {
      const y = 0.62 + rng() * 5.2;
      if (y > 3.5 && y < 3.85) continue;
      const lighter = rng() < 0.45;
      s.fillStyle = lighter ? `rgba(120,124,92,${0.05 + rng() * 0.08})` : `rgba(20,22,10,${0.05 + rng() * 0.1})`;
      s.fillRect(rng() * W, row(y), 2 + rng() * 9, 2 + rng() * 6);
    }
    // Đai đồng: 2 rãnh tiện + xỉn ô-xy hóa loang, vết xước sáng do va vào ray / yên đỡ
    for (const y of [0.86, 1.0]) { s.fillStyle = 'rgba(40,20,10,0.75)'; s.fillRect(0, row(y) - 2, W, 4); }
    for (let i = 0; i < 160; i++) {
      s.fillStyle = rng() < 0.6 ? `rgba(70,60,40,${0.1 + rng() * 0.2})` : `rgba(230,170,120,${0.15 + rng() * 0.25})`;
      s.fillRect(rng() * W, row(0.74 + rng() * 0.39), 2 + rng() * 14, 1 + rng() * 3);
    }
    // Xước sơn lộ lớp lót / thép: dọc theo thân (chạm ray máng nạp, giá kho)
    for (let i = 0; i < 70; i++) {
      const x = rng() * W, y = 1.2 + rng() * 4.3, len = 6 + rng() * 40;
      s.strokeStyle = `rgba(150,146,128,${0.25 + rng() * 0.35})`; s.lineWidth = 0.8 + rng() * 1.4;
      s.beginPath(); s.moveTo(x, row(y)); s.lineTo(x + (rng() - 0.5) * 6, row(y) - len); s.stroke();
      r.strokeStyle = 'rgb(0,95,190)'; r.lineWidth = s.lineWidth;
      r.beginPath(); r.moveTo(x, row(y)); r.lineTo(x + (rng() - 0.5) * 6, row(y) - len); r.stroke();
    }
    // Chữ stencil vàng quanh thân (in 2 phía đối nhau): cỡ đạn, loại, thuốc nổ, số lô
    const stencil = (txt, y, px, x0, alpha) => {
      s.font = `bold ${px}px "Arial Narrow", Arial, sans-serif`;
      s.textBaseline = 'middle';
      s.fillStyle = `rgba(200,160,44,${alpha})`;
      s.fillText(txt, x0, row(y));
      // sơn stencil mòn loang: khoét lỗ nhỏ bằng màu thân
      for (let i = 0; i < txt.length * 5; i++) {
        s.fillStyle = 'rgba(65,67,41,0.55)';
        s.fillRect(x0 + rng() * s.measureText(txt).width, row(y) - px / 2 + rng() * px, 1 + rng() * 3, 1 + rng() * 3);
      }
    };
    for (const x0 of [24, W / 2 + 24]) {
      stencil('155MM', 3.15, 40, x0, 0.92);
      stencil('HE  M795', 2.78, 40, x0, 0.92);
      stencil('TNT', 2.42, 34, x0, 0.85);
      stencil('LOT  PB-21E 0417', 1.72, 22, x0, 0.8);
    }
    // Ngòi: chữ dập nhỏ + vạch khắc vòng chỉnh
    s.font = 'bold 15px Arial, sans-serif'; s.fillStyle = 'rgba(30,30,26,0.85)';
    for (const x0 of [40, W / 2 + 40]) s.fillText('M739A1', x0, row(6.45));
    for (let i = 0; i < 24; i++) { s.fillStyle = 'rgba(25,25,22,0.8)'; s.fillRect(i * W / 24, row(6.02), 2, row(5.9) - row(6.02)); }
    // Muội thuốc phóng ám nhẹ đáy đạn
    const grd = s.createLinearGradient(0, row(0), 0, row(0.9));
    grd.addColorStop(0, 'rgba(15,14,10,0.55)'); grd.addColorStop(1, 'rgba(15,14,10,0)');
    s.fillStyle = grd; s.fillRect(0, row(0.9), W, row(0) - row(0.9));

    // --- LIỀU PHÓNG: vỏ cháy sợi nén màu cát, chữ in nâu, mép đầu ngả bẩn do tay cầm ---
    const CW = 512, CH = 256, crow = (y) => (1 - y / MOD_LEN) * CH;
    const [cc, c] = mk(CW, CH);
    c.fillStyle = '#9c8a60'; c.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 5000; i++) {   // thớ sợi nén
      c.fillStyle = rng() < 0.5 ? `rgba(60,48,26,${0.02 + rng() * 0.05})` : `rgba(200,184,140,${0.02 + rng() * 0.05})`;
      c.fillRect(rng() * CW, rng() * CH, 1 + rng() * 6, 1 + rng() * 1.5);
    }
    for (const [y0, y1] of [[0, 0.26], [1.26, MOD_LEN]]) {   // hai đầu sẫm hơn (gờ, mặt đầu, vết tay)
      c.fillStyle = 'rgba(55,44,24,0.35)'; c.fillRect(0, crow(y1), CW, crow(y0) - crow(y1));
    }
    // Chữ in chỉ 1 phía (module xoay lệch nhau khi xếp nên mỗi khúc lộ chữ một chỗ), mực in hơi nhòe
    c.textBaseline = 'middle'; c.fillStyle = 'rgba(48,34,18,0.78)';
    c.font = 'bold 22px "Arial Narrow", Arial, sans-serif'; c.fillText('M232A1', 26, crow(0.98));
    c.font = 'bold 11px Arial, sans-serif';
    c.fillText('PROP CHG 155MM', 26, crow(0.74));
    c.fillText('LOT IOP-19B 2208', 26, crow(0.58));
    c.fillStyle = 'rgba(120,40,24,0.55)'; c.fillRect(26, crow(0.44), 150, 5);   // vạch nhận dạng liều

    const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t; };
    const env = M.steel && M.steel.envMap;
    const shellMat = new THREE.MeshStandardMaterial({ map: tex(sc), roughnessMap: tex(rc), metalnessMap: tex(rc), roughness: 1, metalness: 1 });
    const chargeMat = new THREE.MeshStandardMaterial({ map: tex(cc), roughness: 0.93, metalness: 0 });
    if (env) { shellMat.envMap = env; shellMat.envMapIntensity = 0.55; }
    roundLook = { shellMat, chargeMat, shellGeo: roundLathe(shellProfile(), SHELL_LEN, 28), modGeo: roundLathe(moduleProfile(), MOD_LEN, 24) };
    return roundLook;
  }

  function buildRoundTemplates(M) {
    const look = getRoundLook(M);
    const shell = new THREE.Group();
    const sb = new VehicleKit.PartBatch(0);
    sb.add(look.shellGeo, look.shellMat, [0, 0, 3.5]);                  // đáy z 3.5 .. đầu ngòi z -3.55
    sb.build(shell);

    // Tối đa 5 module liều phóng, xếp từ đuôi (z 3.4) ra trước; số module hiện theo tầm bắn (setChargeCount)
    const charge = new THREE.Group();
    for (let i = 0; i < CHARGE_MAX; i++) {
      const m = new THREE.Group();
      const chb = new VehicleKit.PartBatch(0);
      chb.add(look.modGeo, look.chargeMat, [0, 0, 2.6 - i * 1.6 + MOD_LEN / 2], [0, 0, (i * 1.7) % (Math.PI * 2)]);
      chb.build(m);
      charge.add(m);
    }
    return { shell, charge };
  }

  function setChargeCount(charge, n) {
    charge.children.forEach((m, i) => { m.visible = i < n; });
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
      // giá chống chéo từ đầu ray xuống chân vách khoang (thay hàng cột đứng trông như rào chắn) + tấm đế bắt bu-lông
      for (const s of [-1, 1]) {
        tb.beam([s * 7.6, yTop - 0.3, z], [s * (BAY.hw + 0.25), TOP + 0.5, z], 0.4, 0.4, D);
        tb.box(1.1, 0.14, 0.9, D, [s * (BAY.hw + 0.55), TOP + 0.07, z]);
      }
    }
    // Ray cầu trục kẹp gắp chạy ngang khoang
    // (dầm sơn sẫm, chỉ mặt lăn bánh xe con là thép mòn sáng)
    tb.box(BAY.hw * 2 - BAY.t * 2, 0.3, 0.5, D, [0, LOAD.railY, LOAD.z]);
    tb.box(BAY.hw * 2 - BAY.t * 2, 0.05, 0.3, M.steel, [0, LOAD.railY + 0.17, LOAD.z]);
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
      // nhãn 'hatch…': nổ trong khoang (đạn / liều phóng kích nổ) quật tung hoặc thổi bay nắp, lửa phụt qua lỗ nắp
      // (VehicleDamage.blowHatches / hatchHoles)
      hb.setTag('hatchBay' + (s < 0 ? 'L' : 'R'));
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

  const _pose = { hatch: 0, trayUp: 0, armK: 0, gunK: 0, wedge: 0, primer: -1, flicked: false, headK: 0, tx: 0, gy: 0, carry: null, onTray: null, rackS: 0, rackSHas: true, rackC: 0, rackCHas: true };
  function idlePose(t) {
    const p = _pose;
    p.hatch = 1 - seg(t, 0.6, 1.0);
    p.trayUp = 0;   // máng đã thu ở cuối chu trình nạp (activePose)
    p.armK = 0;
    p.gunK = 0;
    p.wedge = 0;
    p.primer = -1;
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
    // ret: cuối chu trình hạ máng nạp rồi nâng nòng về góc bắn (xong đúng lúc đồng hồ nạp về 0)
    const ret = Math.min(1.0, D * 0.18);
    const w0 = Math.min(1.2, D * 0.3), w1 = Math.max(w0 + 0.1, D - ret - 0.05);
    const r = e / w0, z = (e - w1) / ret;
    const q = Math.max(0, Math.min(1, (e - w0) / (w1 - w0)));
    const drop = LOAD.carryY - LOAD.pickY, sink = LOAD.pickY - LOAD.sinkY;
    p.hatch = seg(r, 0.12, 0.5);
    p.gunK = seg(r, 0.15, 0.7) - seg(z, 0.45, 1.0);
    p.trayUp = seg(r, 0.72, 1.0) - seg(z, 0.05, 0.45);
    p.tx = -R + R * seg(q, 0.10, 0.20) + R * seg(q, 0.30, 0.42) - R * seg(q, 0.58, 0.66);
    p.gy = LOAD.carryY
      - drop * (seg(q, 0.00, 0.05) - seg(q, 0.05, 0.10))
      - drop * (seg(q, 0.20, 0.25) - seg(q, 0.25, 0.30))
      - drop * (seg(q, 0.42, 0.47) - seg(q, 0.47, 0.52))
      - drop * (seg(q, 0.66, 0.71) - seg(q, 0.71, 0.76));
    p.carry = q >= 0.05 && q < 0.25 ? 'shell' : (q >= 0.47 && q < 0.71 ? 'charge' : null);
    p.onTray = q >= 0.25 && q < 0.46 ? 'shell' : (q >= 0.71 && q < 0.95 ? 'charge' : null);
    p.armK = seg(q, 0.27, 0.35) - seg(q, 0.50, 0.58) + seg(q, 0.73, 0.81) - seg(z, 0.0, 0.3);
    // Đạn bị thúc mạnh 1 phát (đai dẫn ăn vào rãnh xoắn) -> tăng tốc dần, không hãm cuối; liều phóng đẩy nhẹ & chậm
    const flick = Math.max(0, Math.min(1, (q - 0.38) / 0.04));
    p.headK = flick * flick - seg(q, 0.46, 0.52) + seg(q, 0.81, 0.95) - seg(q, 0.95, 1.0);
    // Khóa nòng bán tự động mở ngay khi nòng trượt về sau giật, đóng sau khi đẩy liều; rồi lắp hạt nổ
    p.wedge = seg(r, 0.06, 0.22) - seg(z, 0.0, 0.15);
    p.primer = e >= w1 ? z : -1;
    p.flicked = q >= 0.42;
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
    // Khung kẹp lắc nhẹ quanh chốt treo trên đầu 2 ty nâng (giữ chốt đứng yên, đáy kẹp văng)
    const sw = L.swayA || 0;
    L.grip.position.set(p.tx + 0.85 * Math.sin(sw), p.gy, LOAD.z);
    L.grip.rotation.z = sw;
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
    // Khối nêm khóa nòng hạ xuống mở toang buồng đạn khi máng nâng lên đút đạn vào
    if (L.breechWedge) L.breechWedge.position.y = -1.65 * p.wedge;
    // Hạt nổ: con trượt đưa ngang từ hộp bên phải tới tâm khóa nòng rồi ấn vào ổ kim hỏa
    if (L.primer) {
      const k = p.primer;
      L.primer.visible = k >= 0 && k < 1;
      if (L.primer.visible) {
        L.primer.position.x = 1.7 * (1 - seg(k, 0.15, 0.55));
        L.primer.position.z = 6.35 - 0.3 * seg(k, 0.6, 0.8);
      }
    }
    // Tháp ẩn các phần khuất hẳn dưới nóc khi máng đã hạ chìm & nắp đóng (đỡ tốn draw call)
    const hidden = p.hatch <= 0 && p.trayUp <= 0;
    L.tray.visible = L.grip.visible = L.trolley.visible = !hidden;
    for (const r of L.rods) r.rod.visible = !hidden;
    for (const k of L.racks) k.lift.visible = !hidden;
  }

  // Khói thuốc phóng còn sót phụt ra buồng đạn khi khóa nòng mở (dùng pool khói của spg.js)
  function breechPuff(u, L) {
    if (typeof SpgFXPool === 'undefined' || !L.breechWedge || !u.fxParticles || !u.scene) return;
    if (!u.alwaysFX && !SpgFXPool.isNearView(u.x, u.z)) return;
    const at = L.breechWedge.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 3; i++) {
      const m = SpgFXPool.acquire(u.scene, 'smoke', 0xb9bcb4, 0.3);
      m.position.copy(at);
      m.position.y += 1.2 + i * 0.6;
      u.fxParticles.push({
        mesh: m,
        base: 1.2 + i * 0.4,
        vx: (Math.random() - 0.5) * 2,
        vy: 5 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 2,
        scale: 1.0,
        alpha: 0.3,
        growSpeed: 2.4,
        rotSpeed: (Math.random() - 0.5) * 0.9,
        drag: 1.4,
        life: 1.6
      });
    }
  }

  function updateLoader(L, u, dt, el) {
    if (!L) return;
    const D = u.reloadDuration || 0, rt = u.reloadTimer || 0;
    let p;
    if (rt > 0 && D > 0 && u.tankType === 'ARTILLERY') {
      const e = Math.max(0, D - rt);
      if (L.idleT > 0 || e < L.lastE) {
        // Phát mới: chọn số module liều theo tầm (tầm phẳng ~ sin 2θ với sơ tốc cố định), xả khói khi khóa nòng mở
        const elP = u.barrelPivot ? u.barrelPivot.rotation.x : 0.5;
        const n = Math.max(2, Math.min(CHARGE_MAX, Math.ceil(CHARGE_MAX * Math.sin(2 * Math.max(0.05, elP)))));
        setChargeCount(L.carry.charge, n);
        setChargeCount(L.onTray.charge, n);
        setChargeCount(L.racks[1].item, n);
        L.puffed = false;
      }
      L.idleT = 0;
      L.lastE = e;
      p = activePose(e, D);
      if (!L.puffed && p.wedge > 0.5) {
        L.puffed = true;
        breechPuff(u, L);
      }
    } else {
      L.idleT += dt;
      if (L.idleT > 1.5 && L._settled) return;
      p = idlePose(L.idleT);
    }
    u._loadGunK = p.gunK;
    L._settled = L.idleT > 1.5;
    // Quán tính: xe con cầu trục chạy rồi phanh gấp -> khung kẹp (nặng thêm 45 kg đạn) đung đưa ngược chiều gia tốc, tắt
    // dần trên khe hở chốt treo & độ đàn hồi ty nâng. Không phải chuyển động trơn tuột hoàn hảo của máy vẽ
    if (dt > 0) {
      const v = (p.tx - (L.lastTx === undefined ? p.tx : L.lastTx)) / dt;
      const acc = (v - (L.lastVx || 0)) / dt;
      L.lastTx = p.tx;
      L.lastVx = v;
      const load = p.carry ? 1.4 : 1;
      L.swayV = L.swayV || 0;
      L.swayA = L.swayA || 0;
      for (let h = Math.min(dt, 0.1); h > 0; h -= 0.016) {
        const s = Math.min(h, 0.016);
        L.swayV += (-acc * 0.009 * load - 130 * L.swayA - 7 * L.swayV) * s;
        L.swayA += L.swayV * s;
      }
      L.swayA = Math.max(-0.07, Math.min(0.07, L.swayA));
    }
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
    // (lò xo sơn sẫm như ngoài thực tế, không phải thép trần)
    cb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 260, 0.11, 5, false), M.dark, [0, 3.25, -3.1]);
    cb.cyl(0.2, 0.2, 7.6, 8, M.steel, [0, 3.25, -6.3], 'z');
    for (const z of [-2.85, -9.75]) cb.box(1.2, 1.2, 0.35, M.dark, [0, 3.0, z]);
    // Radar đo sơ tốc đầu nòng
    cb.box(1.7, 1.2, 1.8, M.dark, [0, 3.3, -11.4]);
    cb.box(1.3, 0.85, 0.1, M.glass, [0, 3.3, -12.33]);
    // Ống bọc giá nòng trên pivot (mở 2 đầu không bịt đáy) + má kẹp giá nòng
    cb.cyl(1.88, 1.88, 6.0, 18, M.dark, [0, 0, 2.7], 'z', null, true);
    for (const s of [-1, 1]) cb.box(0.35, 2.4, 6.0, M.paint, [s * 1.92, 0, 2.7]);
    cb.build(pivot);

    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);

    const gb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    const P = M.paint;
    const section = (rFront, rRear, zRear, zFront, mat = P) => {
      gb.cyl(rFront, rRear, zRear - zFront, 22, mat, [0, 0, (zRear + zFront) / 2], 'z');
    };

    // =========================================================================
    // CỤM KHÓA NÒNG HỢP KIM THÉP ĐỒ SỘ (z = 0.5 .. 5.9, chuẩn lựu pháo 155mm L/52 hiện đại)
    // =========================================================================
    // 1. Thân khối vỏ khóa nòng (Breech Ring Box) thép tôi hợp kim bo góc vát mép — sơn sẫm, chỉ mặt gia công
    // (mặt đuôi, nêm, miệng buồng đạn) để thép trần
    gb.box(3.5, 3.6, 5.35, M.dark, [0, 0, 3.175]);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        gb.box(0.7, 0.7, 5.35, M.dark, [sx * 1.52, sy * 1.56, 3.175], [0, 0, Math.PI / 4]);
      }
    }
    // Tai móc cẩu (lifting eyes) bằng thép tròn uốn trên đỉnh khối khóa nòng
    gb.add(new THREE.TorusGeometry(0.42, 0.12, 6, 14, Math.PI), M.steel, [0, 1.82, 3.2], [Math.PI / 2, 0, 0]);

    // Cụm xi-lanh thủy lực mở nêm tự động ở sườn trái
    gb.cyl(0.28, 0.28, 2.6, 12, M.dark, [-1.88, 0.45, 3.2], 'z');
    gb.cyl(0.14, 0.14, 1.9, 10, M.steel, [-1.88, 0.45, 4.6], 'z');
    gb.strut([-1.88, 0.7, 2.0], [-1.88, 1.35, 0.7], 0.08, M.rubber, 6);

    // Cần gạt mở nòng cơ khí khẩn cấp ở sườn phải
    gb.cyl(0.18, 0.18, 0.5, 8, M.dark, [1.88, 0.45, 4.2], 'x');
    gb.box(0.12, 1.5, 0.22, M.steel, [1.98, 1.15, 4.2], [0, 0, -0.2]);
    gb.cyl(0.12, 0.12, 0.65, 8, M.steel, [2.18, 1.9, 4.2], 'z');

    // 2. Mặt đuôi khối khóa nòng (Breech Face Plate) khoét lỗ rỗng chuẩn đạn 155mm
    const bsh = new THREE.Shape();
    const bx = 3.5 / 2 - 0.08, by = 3.6 / 2 - 0.08, br = 0.45;
    bsh.moveTo(-bx + br, -by); bsh.lineTo(bx - br, -by); bsh.quadraticCurveTo(bx, -by, bx, -by + br);
    bsh.lineTo(bx, by - br); bsh.quadraticCurveTo(bx, by, bx - br, by); bsh.lineTo(-bx + br, by);
    bsh.quadraticCurveTo(-bx, by, -bx, by - br); bsh.lineTo(-bx, -by + br); bsh.quadraticCurveTo(-bx, -by, -bx + br, -by);
    const bHole = new THREE.Path();
    bHole.absarc(0, 0, 0.82, 0, Math.PI * 2, true);
    bsh.holes.push(bHole);
    const bFaceGeo = new THREE.ExtrudeGeometry(bsh, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 16 });
    bFaceGeo.translate(0, 0, -0.175);
    gb.add(bFaceGeo, M.steel, [0, 0, 5.85]);

    // Vành vát côn miệng buồng đạn (Chamber Mouth Forcing Cone) mạ crom đón đạn
    gb.add(new THREE.TorusGeometry(0.82, 0.07, 6, 22), M.steel, [0, 0, 5.92]);
    // Vòng đệm bít khí áp suất cao (Obturator ring) bằng đồng thau
    gb.add(new THREE.TorusGeometry(0.86, 0.04, 6, 22), M.shellBand, [0, 0, 5.88]);

    // 8 bu-lông lục giác cường lực viền mặt sau khối khóa nòng
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      gb.cyl(0.1, 0.1, 0.18, 6, M.dark, [Math.cos(a) * 1.32, Math.sin(a) * 1.32, 6.0], 'z');
    }

    // Lòng buồng nạp đạn 155mm rỗng sâu vào trong lòng pháo (đen hun khói, sâu 4.6 đơn vị = hơn nửa mét)
    gb.cyl(0.8, 0.8, 4.6, 22, M.bore, [0, 0, 3.4], 'z', null, true);
    // Máng đón đạn (feed ramp lip) ở đáy miệng buồng đạn vươn ra đón đạn từ máng nạp
    gb.box(1.5, 0.12, 0.75, M.steel, [0, -0.84, 6.25], [-0.15, 0, 0]);

    // 3. Khối nêm khóa nòng trượt thẳng đứng (Vertical Sliding Wedge Block)
    const breechWedge = new THREE.Group();
    breechWedge.position.set(0, 0, 5.35);
    barrel.add(breechWedge);
    const wb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    wb.box(2.2, 2.2, 0.68, M.steel, [0, 0, 0]);
    wb.box(2.18, 0.4, 0.65, M.dark, [0, -1.2, 0]);
    // Rãnh cong lòng máng đón đạn trên đỉnh nêm (ăn khớp đáy buồng đạn khi nêm hạ xuống)
    wb.cyl(0.85, 0.85, 0.7, 18, M.steel, [0, 1.25, 0], 'z');
    // Cụm kim hỏa / kích nổ điện tử ở tâm mặt nêm
    wb.cyl(0.28, 0.28, 0.12, 12, M.dark, [0, 0, 0.36], 'z');
    wb.cyl(0.12, 0.12, 0.18, 8, M.steel, [0, 0, 0.42], 'z');
    wb.build(breechWedge);

    // Bộ nạp hạt nổ ở sườn phải mặt khóa nòng: hộp băng hạt nổ + ray con trượt; hạt nổ đồng nhỏ chạy trên ray
    gb.box(0.9, 1.0, 0.7, M.dark, [2.15, 0.1, 6.35]);
    gb.box(1.3, 0.14, 0.16, M.steel, [1.25, 0.32, 6.35]);
    const primer = new THREE.Group();
    primer.visible = false;
    const pb = new VehicleKit.PartBatch(DECK_Y + PIVOT.y);
    pb.cyl(0.11, 0.11, 0.3, 8, M.shellBand, [0, 0, 0], 'z');
    pb.box(0.3, 0.32, 0.12, M.steel, [0, 0.18, 0.2]);
    pb.build(primer);
    barrel.add(primer);

    // 4. Thân nòng phía trước và bầu hút khói
    section(1.48, 1.5, 0.5, -4.0, M.steel);
    section(1.42, 1.46, -4.0, -18.0);
    section(1.36, 1.42, -18.0, -30.0);
    section(1.36, 1.85, -30.0, -31.2);         // côn sau bầu hút khói
    section(1.85, 1.85, -31.2, -36.4);
    section(1.25, 1.85, -36.4, -37.6);         // côn trước bầu hút khói
    section(1.18, 1.25, -37.6, -52.0);
    section(1.105, 1.18, -52.0, -63.2);
    section(1.08, 1.105, -63.2, -66.0, M.soot);   // đoạn sát hãm lùi: sơn cháy sém, muội thuốc phóng bám đen
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
    // Lòng nòng rỗng sâu từ mặt trước loa che lửa vào trong thân nòng (sâu 7.6 đơn vị)
    gb.cyl(0.78, 0.78, 7.6, 22, M.bore, [0, 0, -67.8], 'z', null, true);
    gb.add(new THREE.TorusGeometry(0.78, 0.06, 6, 22), M.steel, [0, 0, -72.05]);
    gb.build(barrel);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -72.2);
    return { pivot, pivotProxy, barrel, breechWedge, primer };
  }

  TankModelBuilder.registerModel('ARTILLERY', buildArbalest);
})();
