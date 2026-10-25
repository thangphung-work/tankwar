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
 * - Xe đã qua nhiều trận (như Arbalest): bùn văng, muội, dầu loang, xước, gỉ; mỗi xe một bộ "vết đời" riêng —
 *   mất một tấm váy, tấm khác cong vểnh, đèn pha vỡ, cáp kéo tuột kẹp, nắp thùng hé, ống khói đã bắn, tấm vá hàn...
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
  const HULL_CH = 0.85;       // mép vát chéo 45° quanh thân trên (sàn / giáp mũi / đuôi giáp hông) ~10 cm
  const DECK_EDGE = HULL_HALF_W - HULL_CH;   // mép sàn phẳng, ngoài đó là dải vát
  const GLACIS_SLOPE = 0.34;  // dy/dz của giáp mũi trên
  const GLACIS_ANGLE = Math.atan(GLACIS_SLOPE);
  const RETURN_ROLLER_Z = [-17, -5.5, 6, 17.5];
  const RETURN_ROLLER_R = 0.95;

  const glacisY = (z) => 9.4 + (z + 31) * GLACIS_SLOPE;

  // Mặt cắt hông tháp (giáp nghiêng gãy khúc): chân -> gờ sống -> mép nóc
  const TUR_BASE = 0.6, TUR_RIDGE = 3.2, TUR_ROOF = 7.0, TUR_ROOF_CH = 1.0;
  const TUR_RIDGE_X = 11.6;   // nửa bề ngang tại gờ sống (rộng nhất)
  const TUR_UNDER = 1.9;      // tấm dưới hắt vào trong
  const TUR_LEAN = 1.1;       // tấm trên ngả vào trong
  const TUR_UP_TILT = Math.atan2(TUR_LEAN, TUR_ROOF - TUR_ROOF_CH - TUR_RIDGE);   // góc nghiêng tấm trên so với phương đứng
  const turUpX = (y) => TUR_RIDGE_X - (y - TUR_RIDGE) * Math.tan(TUR_UP_TILT);    // hông tấm trên (đoạn thẳng z -11.5..8.5)

  function buildHalberd(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    // Xe đã qua chiến trường: bùn văng, muội, dầu loang, xước, lỗ mảnh đạn, gỉ chảy, sơn bạc nắng
    const M = K.createMaterials(unit.team, { battle: 1, seed: K.lookSeed(unit) });
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    M.soot = M.soot || M.dark;
    M.wood = M.wood || M.canvasDark;
    const rnd = K.lookRng(unit);   // vẻ ngoài gieo theo xe: dựng lại (đổi trang bị) vẫn y chiếc cũ
    const wear = rollWear(rnd);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildHull(chassis, M, unit, rnd, wear);
    const running = buildRunningGear(chassis, M);
    unit.trackSystem = running.tracks;
    const turretParts = buildTurret(chassis, M, unit, rnd, wear);
    buildGun(unit, M, wear);

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.radarDish = null;

    // -------------------------------------------------------------------------
    // HOẠT ẢNH: XÍCH & BÁNH LĂN THEO VẬN TỐC TỪNG BÊN, KÍNH TOÀN CẢNH QUÉT
    // -------------------------------------------------------------------------
    let lastYaw = null;
    let scanTime = rnd() * 10;
    let lastRl = 0, ejT = -1, ejDone = true;
    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        VehicleKit.updateShutters(u, dt);
        // NẠP ĐẠN sau mỗi phát (reloadTimer vừa nhảy lên): ~0.3 s cửa hất đuôi tháp bật mở, đế liều phóng thép văng ra
        // sau lưng tháp kèm khói thuốc phóng, cửa sập lại ~1.1 s; kíp nạp đạn lấy viên mới từ hộc đuôi tháp (âm thanh)
        const rl = u.reloadTimer || 0;
        if (rl > lastRl + 0.05 && !u.isDead) { ejT = 0; ejDone = false; }
        lastRl = rl;
        const flap = turretParts.ejFlap;
        if (ejT >= 0 && flap) {
          ejT += dt;
          const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
          flap.rotation.x = -1.4 * sm((ejT - 0.22) / 0.1) * (1 - sm((ejT - 0.9) / 0.25));
          if (!ejDone && ejT >= 0.3) { ejDone = true; ejectStub(u, flap); }
          if (ejT > 1.2) { ejT = -1; flap.rotation.x = 0; }
        }
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
          // trạm vũ khí nóc tháp chưa từng nhận lệnh (phòng xem xe): quét qua lại; trong trận drone_air.updateRCWS điều khiển
          if (unit.rcwsTurret && !u._rcws) unit.rcwsTurret.rotation.y = Math.sin(scanTime * 0.22 + 1.3) * 0.9;
        }
      }
    };

    return { hullW: HULL_HALF_W * 2 };
  }

  // Đế liều phóng 120mm (thép, Ø ~13 cm, cao ~8 cm) văng ra khỏi cửa hất đuôi tháp
  let STUB_GEO = null;
  function ejectStub(u, flap) {
    if (typeof ReloadFX === 'undefined' || !u.scene || !flap) return;
    if (!STUB_GEO) {
      STUB_GEO = new THREE.CylinderGeometry(0.55, 0.55, 0.65, 12);
      STUB_GEO.userData.shared = true;
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, metalness: 0.75, roughness: 0.4 });
    mat.userData.own = true;
    const m = new THREE.Mesh(STUB_GEO, mat);
    m.castShadow = true;
    m.userData.half = 0.4;
    flap.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(0, 0.5, 0).applyMatrix4(flap.parent.matrixWorld);
    // tung lên rồi ra sau tháp (trục +Z của tháp trong thế giới), rơi xuống sàn động cơ / đất
    const q = new THREE.Quaternion();
    flap.parent.getWorldQuaternion(q);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const sp = 12 + Math.random() * 7;
    const vel = { x: back.x * sp + (Math.random() - 0.5) * 5, y: 24 + Math.random() * 7, z: back.z * sp + (Math.random() - 0.5) * 5 };
    ReloadFX.toss(u.scene, m, pos, vel, { x: 9 + Math.random() * 8, y: Math.random() * 4, z: (Math.random() - 0.5) * 10 }, 9);
    ReloadFX.puff(u, pos, { x: back.x * 0.4, y: 1, z: back.z * 0.4 }, 3);
  }

  // ---------------------------------------------------------------------------
  // "VẾT ĐỜI" CỦA TỪNG XE: bốc ngẫu nhiên một lần lúc dựng -> không xe nào giống xe nào
  // ---------------------------------------------------------------------------
  function rollWear(rnd) {
    const side = () => (rnd() < 0.5 ? -1 : 1);
    const lostS = side(), lostI = Math.floor(rnd() * 4);
    return {
      lostSkirt: { s: lostS, i: lostI },                                           // tấm váy mỏng bị giật mất hẳn
      tornRubber: { s: lostS, i: lostI >= 2 ? lostI - 2 : lostI + 2 },             // dải cao su mép váy rách
      bentSkirt: { s: -lostS, i: Math.floor(rnd() * 5), a: 0.17 + rnd() * 0.13 },  // tấm bên kia cong vểnh ra ngoài
      lampBroken: side(),       // cụm đèn pha vỡ bóng, khung bảo vệ cong
      cableLoose: side(),       // đầu cáp kéo tuột kẹp, thõng qua mép thân
      flapTorn: side(),         // chắn bùn sau bị rách
      binOpen: side(),          // nắp thùng đồ hông tháp đóng không kín
      patchSide: side(),        // tấm thép vá hàn ngoài thực địa trên hông tháp
      smokeFired: side(),       // cụm phóng khói đã bắn: vài ống mất nắp, miệng ám muội
      linkMissing: Math.floor(rnd() * 3),   // ô mắt xích dự phòng trống
      sleeve: 1 + Math.floor(rnd() * 3),    // đoạn ống bọc nhiệt nòng đã thay mới (lệch tông sơn)
      jitter: () => (rnd() - 0.5)
    };
  }

  // Khung cục bộ tại c, xoay rot (Euler, [x, y, z, order?]) -> hàm đổi điểm cục bộ sang tọa độ cha.
  // Dùng cho tấm bị cong / vật treo nghiêng mà các chi tiết gắn trên nó phải nghiêng theo.
  function frameAt(c, rot) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], rot[3] || 'XYZ'));
    m.setPosition(c[0], c[1], c[2]);
    const v = new THREE.Vector3();
    return (x, y, z) => { v.set(x, y, z).applyMatrix4(m); return [v.x, v.y, v.z]; };
  }

  // Dây / cáp mềm qua các điểm: chuỗi ống nối tiếp (khớp nối che bằng khối cầu nhỏ cùng bán kính)
  function rope(b, pts, r, mat, seg = 6) {
    for (let i = 0; i < pts.length - 1; i++) {
      b.strut(pts[i], pts[i + 1], r, mat, seg);
      if (i > 0) b.add(new THREE.SphereGeometry(r, seg, 4), mat, pts[i]);
    }
  }

  // ===========================================================================
  // THÂN XE
  // ===========================================================================
  function buildHull(chassis, M, unit, rnd, wear) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;
    const J = wear.jitter;

    // Khối thân trên phủ qua xích (giáp mũi vát + sàn động cơ + tấm đuôi vát)
    hb.add(VehicleKit.sideProfile([
      [-31.0, 9.4], [-21.0, DECK_Y], [20.5, DECK_Y], [28.4, 12.4],
      [29.4, 11.4], [29.4, 9.4]
    ], HULL_HALF_W * 2, HULL_CH), P);

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

    // Gờ chắn văng hình chữ V trước kính lái (hắt nước bùn / mảnh đạn khỏi kính tiềm vọng)
    for (const s of [-1, 1]) {
      const p0 = [5.6, glacisY(-23.6) + 0.95, -23.6], p1 = [5.6 + s * 4.0, glacisY(-22.4) + 0.95, -22.4];
      hb.beam(p0, p1, 0.45, 0.12, P);
    }

    // Đường ghép tấm giáp trên sàn trước + mối hàn nổi chạy dọc mép giáp mũi / sàn và hai mép hông giáp mũi
    hb.box(26, 0.06, 0.14, D, [0, DECK_Y + 0.02, -15.0]);
    hb.weld([-DECK_EDGE + 0.1, DECK_Y + 0.02, -21.0], [DECK_EDGE - 0.1, DECK_Y + 0.02, -21.0], P, 0.12);
    for (const s of [-1, 1]) {
      // mối hàn chạy theo đường gãy giữa giáp mũi và dải vát mép
      hb.weld([s * DECK_EDGE, glacisY(-30.2) + 0.02, -30.2], [s * DECK_EDGE, DECK_Y + 0.02, -21.1], P, 0.12);
      // Vòng cẩu hai góc mũi (hàn vào mép giáp mũi)
      hb.box(0.9, 0.5, 1.1, P, [s * 13.4, glacisY(-29.6) + 0.25, -29.6], [-GLACIS_ANGLE, 0, 0]);
      hb.add(new THREE.TorusGeometry(0.42, 0.14, 5, 10), M.steel, [s * 13.4, glacisY(-29.6) + 0.75, -29.6], [0, Math.PI / 2, 0]);
    }

    // Cụm đèn pha 2 bóng có khung bảo vệ ở 2 góc mũi. Một cụm đã bị va: bóng lớn vỡ còn hốc tối, khung bảo vệ
    // cong oằn vào trong
    for (const s of [-1, 1]) {
      const x = s * 12.4, z = -27.4, y = glacisY(z) + 0.85;
      const broken = wear.lampBroken === s;
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(2.6, 1.5, 1.4, D, [x, y, z], [0, broken ? s * 0.05 : 0, 0]);
      if (broken) {
        hb.cyl(0.5, 0.5, 0.12, 12, M.soot, [x - 0.6, y + 0.1, z - 0.66], 'z');
        hb.box(0.34, 0.2, 0.05, M.headLensL || M.lens, [x - 0.78, y - 0.22, z - 0.74], [0, 0, 0.7]);   // mảnh kính sót lại ở mép chóa
      } else {
        // kính đèn bụi bám, thấy chóa bạc phía sau (trước đây chóa đèn trơn: đĩa trắng như mắt nhựa)
        hb.cyl(0.5, 0.5, 0.2, 12, (s < 0 ? M.headLensL : M.headLensR) || M.lens, [x - 0.6, y + 0.1, z - 0.75], 'z');
      }
      hb.cyl(0.32, 0.32, 0.2, 10, M.headLensR || M.lens, [x + 0.7, y + 0.1, z - 0.75], 'z');
      if (broken) {
        hb.beam([x - 1.55, y - 0.25, z - 1.2], [x - 1.4, y + 0.95, z - 0.75], 0.16, 0.16, P);
        hb.beam([x - 1.4, y + 0.95, z - 0.75], [x + 1.5, y + 1.05, z - 1.15], 0.16, 0.16, P);
      } else {
        hb.box(3.2, 0.16, 0.16, P, [x, y + 1.0, z - 1.2]);
        hb.box(0.16, 1.3, 0.16, P, [x - 1.55, y + 0.4, z - 1.2]);
      }
      hb.box(0.16, 1.3, 0.16, P, [x + 1.55, y + 0.4, z - 1.2]);
      hb.cyl(0.18, 0.18, 0.9, 6, M.rubber, [x + s * 1.2, y - 0.3, z + 0.8], 'x');      // ống luồn dây điện đèn
      hb.setTag(null);
    }

    // Mắt xích dự phòng treo trên tấm mũi dưới (vừa để thay, vừa thêm một lớp giáp), giữ bằng 2 thanh dẹt bắt
    // bu-lông. Một ô trống — mắt đã tháo ra thay ngoài thực địa chưa bù lại; các mắt còn lại treo hơi lệch
    hb.setTag('spareTrack');
    const NOSE_A = Math.atan2(5.7, 3.8);
    const noseAt = (x, v, off) => [x, 9.6 - 0.832 * v - 0.555 * off, -31.0 + 0.555 * v - 0.832 * off];
    for (let r = 0; r < 3; r++) {
      if (r === wear.linkMissing) continue;
      const rot = [NOSE_A, 0, J() * 0.07];
      const L = frameAt(noseAt(J() * 0.3, 1.25 + r * 2.0, 0.34), rot);
      hb.box(5.0, 0.55, 1.25, M.track, L(0, 0, 0), rot);
      for (const x of [-1.38, 1.38]) hb.box(2.0, 0.3, 0.95, M.rubber, L(x, -0.4, 0), rot);
      for (const x of [-2.6, 2.6]) hb.box(0.45, 0.5, 0.6, M.steel, L(x, 0, 0.62), rot);
    }
    for (const x of [-1.38, 1.38]) {
      hb.beam(noseAt(x, 0.15, 0.95), noseAt(x, 6.2, 0.95), 0.5, 0.12, M.paintDusty);
      for (const v of [0.35, 6.0]) hb.cyl(0.2, 0.2, 0.3, 6, M.steel, noseAt(x, v, 1.05), 'y', [NOSE_A + Math.PI, 0, 0]);
    }
    hb.setTag(null);

    // Móc kéo cứu hộ trên tấm mũi dưới
    for (const s of [-1, 1]) {
      hb.box(1.8, 1.3, 1.2, M.paintDusty, [s * 6.5, 6.6, -29.0]);
      const shackle = new THREE.TorusGeometry(0.75, 0.22, 6, 12, Math.PI * 1.3);
      hb.add(shackle, M.steel, [s * 6.5, 5.7, -29.7], [0, Math.PI / 2, Math.PI * 0.85]);
    }

    // Cáp kéo thép chạy dọc mép sàn hai bên + kẹp giữ. Cáp thép không bao giờ nằm thẳng tắp: hơi lượn giữa
    // các kẹp; một bên đầu sau đã tuột kẹp, bò ra mép sàn rồi thõng xuống hông xe, khuyết cáp treo ngoài váy xích
    for (const s of [-1, 1]) {
      const x = s * 13.9, y = DECK_Y + 0.3;
      const loose = wear.cableLoose === s;
      const pts = [[x, y, -14.0]];
      for (const z of [-11.5, -9, -4, 1, 6, 11]) pts.push([x + (z === -9 || z === 1 || z === 11 ? 0 : J() * 0.35), y, z]);
      if (loose) pts.push([x + s * 0.45, y, 13.4], [s * 15.1, y - 0.8, 14.7], [s * 15.7, y - 1.35, 15.3], [s * 15.8, y - 2.6, 15.7]);
      else pts.push([x + J() * 0.3, y, 13.8], [x, y, 16.0]);
      // cáp thép bện sẫm dầu mỡ, đất bám, gỉ loang; khuyết cáp mòn (trước đây ống xám trơn như ống nhựa)
      VehicleKit.cable(hb, pts, 0.28, M.cable || M.steel);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.cable || M.steel, [x, y, -14.6], [Math.PI / 2, 0, 0]);
      if (loose) hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.cable || M.steel, [s * 15.8, y - 3.3, 15.75], [0.1, Math.PI / 2, 0]);
      else hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.cable || M.steel, [x, y, 16.6], [Math.PI / 2, 0, 0]);
      for (const z of [-9, 1, 11]) hb.box(0.9, 0.55, 0.5, D, [x, DECK_Y + 0.25, z]);
      // Nắp miệng rót nhiên liệu hai góc sau sàn (bản lề + quai vặn), vệt dầu loang do shader vết chiến trường vẽ
      hb.cyl(0.75, 0.82, 0.24, 14, P, [s * 13.2, DECK_Y + 0.12, 22.6]);
      hb.box(0.9, 0.16, 0.22, M.steel, [s * 13.2, DECK_Y + 0.3, 22.6], [0, 0.5, 0]);
      hb.box(0.5, 0.22, 0.5, D, [s * 13.2, DECK_Y + 0.11, 21.65]);
      // Xẻng công binh (cán gỗ, tay nắm chữ D, lưỡi thép vát) và xà beng dã chiến kèm khóa kẹp sàn
      hb.setTag('tool' + (s < 0 ? 'L' : 'R'));
      hb.cyl(0.13, 0.13, 6.2, 6, M.wood, [s * 11.6, DECK_Y + 0.22, 21.4], 'z');
      hb.box(0.55, 0.14, 0.14, D, [s * 11.6, DECK_Y + 0.22, 18.15]);
      hb.cyl(0.08, 0.08, 0.55, 5, M.wood, [s * 11.6, DECK_Y + 0.22, 17.85], 'x');
      hb.box(1.35, 0.10, 1.65, M.steel, [s * 11.6, DECK_Y + 0.20, 25.3], [-0.08, 0, 0]);
      hb.cyl(0.18, 0.14, 0.5, 6, D, [s * 11.6, DECK_Y + 0.22, 24.45], 'z');
      hb.cyl(0.12, 0.12, 7.4, 6, M.steel, [s * 10.6, DECK_Y + 0.20, 20.0], 'z');
      hb.box(0.28, 0.10, 0.65, M.steel, [s * 10.6, DECK_Y + 0.26, 23.9], [0.28, 0, 0]);
      for (const zc of [19.4, 22.8]) {
        hb.box(1.45, 0.28, 0.22, D, [s * 11.1, DECK_Y + 0.22, zc]);
        hb.box(0.18, 0.36, 0.26, M.steel, [s * 11.1, DECK_Y + 0.38, zc]);
      }
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
      hb.box(w, 0.12, 9.6, M.soot, [cx, DECK_Y + 0.05, 23.0]);
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
      hb.box(5.2, 2.3, 0.3, M.soot, [x, 10.4, 29.55]);
      for (let i = 0; i < 4; i++) hb.box(5.0, 0.12, 0.3, P, [x, 9.55 + i * 0.55, 29.72], [0.5, 0, 0]);
      hb.box(1.8, 1.0, 0.5, D, [s * 13.2, 11.3, 29.6]);
      hb.box(0.7, 0.55, 0.12, M.tailLens, [s * 13.6, 11.35, 29.88]);
      hb.box(0.5, 0.4, 0.12, M.lens, [s * 12.7, 11.35, 29.88]);
      hb.box(1.6, 1.2, 1.0, M.paintDusty, [s * 6.5, 6.4, 29.3]);
      hb.add(new THREE.TorusGeometry(0.7, 0.2, 6, 12, Math.PI * 1.3), M.steel, [s * 6.5, 5.6, 29.9], [0, Math.PI / 2, Math.PI * 0.85]);
      // Chắn bùn cao su sau bánh sao: một tấm rách mất nửa trong, mẩu ngoài thõng xoắn; tấm kia quăn mép do bùn đá
      hb.setTag('flap' + (s < 0 ? 'L' : 'R'));
      if (wear.flapTorn === s) {
        hb.box(TRACK_W + 0.6, 1.25, 0.16, M.rubber, [s * TRACK_X, 8.78, 30.12], [0.06, 0, 0]);
        hb.box(2.6, 1.55, 0.16, M.rubber, [s * (TRACK_X + 1.6), 7.5, 30.28], [0.24, s * 0.16, s * 0.07]);
      } else {
        hb.box(TRACK_W + 0.6, 2.4, 0.16, M.rubber, [s * TRACK_X, 8.2, 30.2], [0.13 + J() * 0.1, J() * 0.06, 0]);
      }
      // Chắn bùn trước: tấm cao su treo dưới mũi xe che đầu xích (cong vênh mỗi tấm một kiểu)
      hb.setTag('flap' + (s < 0 ? 'L' : 'R') + '1');
      hb.box(TRACK_W + 0.4, 1.7, 0.14, M.rubber, [s * TRACK_X, 8.55, -30.75], [-0.08 + J() * 0.24, J() * 0.1, J() * 0.05]);
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
        const a = z0 + i * seg + 0.1, b = a + seg - 0.2, zc = (a + b) / 2;
        const boltZ = (k) => a + 0.9 + k * (seg - 1.9) / 3;
        if (wear.lostSkirt.s === s && wear.lostSkirt.i === i) {
          // Tấm bị giật mất hẳn trong trận trước: lộ bánh chịu tải, trên thanh treo chỉ còn chân bu-lông gãy
          // và một mẩu tấm rách nham nhở ở mép trước
          for (let k = 0; k < 4; k++) if (k !== 1) hb.cyl(0.11, 0.11, 0.45, 6, M.steel, [s * 15.55, 9.2, boltZ(k)], 'x');
          hb.add(VehicleKit.sideProfile([[a, 9.75], [a, 8.3], [a + 0.6, 8.75], [a + 1.0, 8.5], [a + 1.6, 9.75]], 0.5, 0.05), P, [s * 15.3, 0, 0]);
          continue;
        }
        hb.setTag('skirt' + (s < 0 ? 'L' : 'R') + (i + 1));
        const pts = i === n - 1
          ? [[a, 9.75], [a, 4.9], [b - 1.6, 4.9], [b, 6.8], [b, 9.75]]
          : [[a, 9.75], [a, 4.9], [b, 4.9], [b, 9.75]];
        // Tấm bị va (đá, gốc cây, xác xe): vểnh mép dưới ra ngoài và hơi vặn — xoay quanh mép treo trên
        const bend = (wear.bentSkirt.s === s && wear.bentSkirt.i === i) ? wear.bentSkirt.a : 0;
        const rot = bend ? [J() * 0.08, s * 0.05, s * bend] : [0, 0, 0];
        const F = frameAt([s * 15.3, 9.75, zc], rot);
        const plate = VehicleKit.sideProfile(pts, 0.5, 0.08);
        plate.translate(0, -9.75, -zc);
        hb.add(plate, P, F(0, 0, 0), rot);
        // Dải cao su mép dưới; một tấm rách mất nửa sau, mẩu còn lại thõng xiên
        const rl = i === n - 1 ? seg - 1.9 : seg - 0.3, rz = (i === n - 1 ? (a + b - 1.6) / 2 : zc) - zc;
        if (wear.tornRubber.s === s && wear.tornRubber.i === i) {
          hb.box(0.4, 0.7, rl * 0.48, M.rubber, F(0, -5.2, rz - rl * 0.26), rot);
          hb.box(0.36, 0.95, rl * 0.18, M.rubber, F(s * 0.12, -5.55, rz + 0.1), [rot[0] + 0.45, rot[1] + s * 0.2, rot[2]]);
        } else {
          hb.box(0.4, 0.7, rl, M.rubber, F(0, -5.2, rz), rot);
        }
        for (let k = 0; k < 4; k++) hb.cyl(0.16, 0.16, 0.2, 6, D, F(s * 0.3, -0.55, boltZ(k) - zc), 'x', rot);
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
  // Đĩa có lỗ giảm trọng / vành răng bánh sao / mắt xích chốt kép: dựng chung ở VehicleKit (Hailstorm dùng cùng kiểu)
  const holedDisc = VehicleKit.holedDisc, toothedRing = VehicleKit.toothedRing;

  function buildRunningGear(chassis, M) {
    const halfSpan = TRACK_W / 2;
    // Bộ phận chạy bám đất theo bản đồ (bùn nhão khi mưa): thân xích & mặt trong vòng xích lèn đất nhiều nhất, lốp cao su
    // phủ bụi loang, vành / răng thép mòn sáng ít bám. Đĩa bánh sơn (paintDusty) đã nhận bụi bản đồ qua shader sơn
    const pad = VehicleKit.dirtyMaterial(M.rubber, 0.75);
    // Thép trần gỉ theo độ ẩm chiến địa; mặt cọ xát mài sáng: 2 mặt răng dẫn hướng, đường lăn bánh trên guốc, mép guốc phía đất
    // (xích) và mặt lăn vành bánh dẫn hướng / sườn răng bánh sao (cách trục > 2.3)
    M = Object.assign({}, M, {
      track: VehicleKit.dirtyMaterial(M.track, 0.85, { inner: true, rust: 1, polish: 'track' }),
      rubber: VehicleKit.dirtyMaterial(M.rubber, 0.6),
      steel: VehicleKit.dirtyMaterial(M.steel, 0.4, { rust: 0.8, polish: 2.3 }),
      dark: VehicleKit.dirtyMaterial(M.dark, 0.55, { rust: 0.7 })
    });

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

    // Bánh dẫn hướng trước: 2 nửa thép đúc, mỗi nửa vành rộng (mặt lăn mòn sáng) + đĩa nan dập lõm có 6 lỗ giảm trọng
    // thủng thật (nhìn xuyên thấy nửa bên kia / răng dẫn hướng xích), moay-ơ côn với nắp mỡ
    const idlerWheels = new VehicleKit.WheelSet(chassis, (b) => {
      const R = IDLER.r, rIn = R - 0.38;
      for (const off of [-1.55, 1.55]) {
        const o = Math.sign(off);
        b.lathe([[rIn, -0.8], [R - 0.06, -0.8], [R, -0.74], [R, 0.74], [R - 0.06, 0.8], [rIn, 0.8], [rIn, -0.8]], 28, M.paintDusty, [off, 0, 0], 'x', R);
        b.cyl(R + 0.01, R + 0.01, 1.2, 28, M.steel, [off, 0, 0], 'x', null, true);
        b.add(holedDisc(rIn + 0.1, 6, 0.5, 1.45, 0.3), M.paintDusty, [off + o * 0.35, 0, 0]);
      }
      b.lathe([[1.05, -1.4], [1.05, 1.4], [0, 1.4]], 14, M.paintDusty, [0, 0, 0], 'x');
      b.lathe([[0.95, 0], [0.95, 0.35], [0.7, 0.62], [0, 0.62]], 12, M.steel, [2.0, 0, 0], 'x');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.11, 0.11, 0.16, 6, M.dark, [2.12, Math.cos(a) * 1.13, Math.sin(a) * 1.13], 'x');
      }
    }, [{ x: -TRACK_X, y: IDLER.y, z: IDLER.z }, { x: TRACK_X, y: IDLER.y, z: IDLER.z }], IDLER.r + LINK_IN);

    // Bánh sao chủ động sau: 2 vành răng thép bắt bu-lông lên tang trống. Số răng = số mắt xích ôm hết một vòng ở bán
    // kính đường tâm xích (2πR / bước xích) -> mỗi răng rơi đúng một khe chốt; đỉnh răng chìm trong guốc xích
    const SPROCKET_TEETH = Math.round(2 * Math.PI * (SPROCKET.r + LINK_IN) / 1.5);
    const sprocketWheels = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.7, 1.7]) {
        b.add(toothedRing(SPROCKET_TEETH, SPROCKET.r - 0.32, SPROCKET.r + 0.24, 1.5, 0.55), M.steel, [off, 0, 0]);
        for (let i = 0; i < SPROCKET_TEETH; i++) {
          const a = ((i + 0.5) / SPROCKET_TEETH) * Math.PI * 2;
          b.cyl(0.12, 0.12, 0.14, 6, M.dark, [off + 0.32, Math.cos(a) * 1.85, Math.sin(a) * 1.85], 'x');
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

    // Dải xích chốt kép kiểu Diehl 570: mỗi mắt 2 nửa guốc thép hai bên răng dẫn hướng, mặt đất có đệm cao su thay được,
    // mắt nọ sát mắt kia (chỉ lộ rãnh vát giữa hai guốc), khớp nối đầu chốt hai mép ngoài + khớp giữa mang răng dẫn hướng
    const tracks = new VehicleKit.TrackSystem(chassis, {
      circles: [
        { u: IDLER.z, v: IDLER.y, r: IDLER.r + LINK_IN },
        { u: WHEEL_Z[0], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: WHEEL_Z[WHEEL_Z.length - 1], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: SPROCKET.z, v: SPROCKET.y, r: SPROCKET.r + LINK_IN }
      ],
      sidesX: [-TRACK_X, TRACK_X],
      pitch: 1.5,
      buildLink: (b, pitch) => VehicleKit.diehlLink(b, pitch, halfSpan, M.track, pad)
    });

    return { tracks, wheelSets: [roadWheels, idlerWheels, sprocketWheels, returnRollers] };
  }

  // ===========================================================================
  // THÁP PHÁO
  // ===========================================================================
  function buildTurret(chassis, M, unit, rnd, wear) {
    const J = wear.jitter;
    const turret = new THREE.Group();
    turret.position.set(0, DECK_Y, -1.5);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(DECK_Y);
    const P = M.paint, D = M.dark;
    const ROOF = 7.0;
    const ROOF_CH = 1.0;   // mép nóc tháp vát chéo 45° (~12 cm) như tháp hàn tấm thật

    // Vòng bi tháp pháo
    tb.cyl(9.4, 9.6, 0.7, 32, D, [0, 0.35, 0]);

    // Thân tháp giáp nghiêng gãy khúc (mặt cắt hình thoi dẹt): đạn bắn ngang gặp tấm nào cũng xiên góc -> dễ trượt.
    // Tấm dưới hắt mạnh vào trong (undercut ~36°) về vòng bi, gờ sống chạy ngang hông, tấm trên ngả vào trong ~21°
    // lên tới mép nóc vát. Mặt trước tháp đứng (khuất sau giáp nêm, chỉ lộ ở khe nòng).
    const RIDGE = [[-11.6, -11.5], [11.6, -11.5], [11.6, 8.5], [10.6, 16.8], [9.7, 18.0],
      [-9.7, 18.0], [-10.6, 16.8], [-11.6, 8.5]];
    // độ hắt vào của từng cạnh (cạnh i: đỉnh i -> i+1): trước, hông P, góc sau P, vát đuôi P, đuôi, vát đuôi T, góc sau T, hông T
    const UNDER = [0, TUR_UNDER, TUR_UNDER, 1.2, 1.2, 1.2, TUR_UNDER, TUR_UNDER];
    const LEAN = [0, TUR_LEAN, TUR_LEAN, 0.7, 0.7, 0.7, TUR_LEAN, TUR_LEAN];
    tb.add(VehicleKit.loftRings([
      { pts: VehicleKit.insetPolygon(RIDGE, UNDER), y: TUR_BASE },
      { pts: RIDGE, y: TUR_RIDGE },
      { pts: VehicleKit.insetPolygon(RIDGE, LEAN), y: ROOF }
    ], ROOF_CH), P);
    // Mối hàn chạy dọc gờ sống (đường ghép tấm trên - tấm dưới)
    for (const s of [-1, 1]) tb.weld([s * 11.62, TUR_RIDGE, -11.2], [s * 11.62, TUR_RIDGE, 8.3], P, 0.12);

    // Giáp nêm hình mũi tên hai bên nòng: cùng mặt cắt gờ sống với thân tháp, mặt mũi tên vát chéo cả trên lẫn dưới,
    // nóc dốc xuống phía trước. Thứ tự đỉnh: chân sau trong, chân sau ngoài, hông, mũi ngoài, mũi trong (khe nòng)
    for (const s of [-1, 1]) {
      // Khối giáp má kiểu Abrams: nhìn từ trên mặt trước xuôi mạnh ra sau về phía ngoài (mũi trong nhô sát khe nòng),
      // nhìn ngang mặt trước gần như một tấm phẳng ngả hẳn về sau (đáy hầu như không hắt vào), nóc dốc nhẹ xuống phía mũi
      const W = [[s * 3.1, -11.4], [s * 11.6, -11.4], [s * 11.6, -14.0], [s * 3.1, -19.8]];
      const SLOPE = 0.11;
      const yTop = (z) => ROOF + Math.min(0, z + 11.4) * SLOPE;
      const topPts = VehicleKit.insetPolygon(W, [0, TUR_LEAN, 2.4, 0]);
      tb.add(VehicleKit.loftRings([
        { pts: VehicleKit.insetPolygon(W, [0, TUR_UNDER, 0.25, 0]), y: TUR_BASE },
        { pts: W, y: TUR_RIDGE },
        { pts: topPts, y: topPts.map(([, z]) => yTop(z)) }
      ], 0.25), P);
      tb.weld([s * 11.62, TUR_RIDGE, -11.5], [s * 11.62, TUR_RIDGE, -13.9], P, 0.12);
      tb.weld([s * 11.5, TUR_RIDGE, -14.05], [s * 3.2, TUR_RIDGE, -19.75], P, 0.12);
      // Hàng bu-lông gắn khối giáp: trên nóc, song song mép trước
      const inner = VehicleKit.insetPolygon(W, [0, 1.9, 3.2, 0]);
      for (let i = 0; i < 5; i++) {
        const k = (i + 0.5) / 5;
        const x = inner[2][0] + (inner[3][0] - inner[2][0]) * k, z = inner[2][1] + (inner[3][1] - inner[2][1]) * k;
        tb.cyl(0.2, 0.2, 0.22, 6, D, [x, yTop(z) + 0.02, z], 'y', [-SLOPE, 0, 0]);
      }
      // Module giáp má tháp: tấm giáp bắt bu-lông ốp trên tấm hông trên, nghiêng theo mặt tháp
      tb.setTag('cheek' + (s < 0 ? 'L' : 'R'));
      const rot = [0, 0, s * TUR_UP_TILT];
      const nx = Math.cos(TUR_UP_TILT), ny = Math.sin(TUR_UP_TILT);   // pháp tuyến mặt trên (hướng ra ngoài)
      const ux = -Math.sin(TUR_UP_TILT), uy = Math.cos(TUR_UP_TILT);  // hướng lên dọc mặt
      const yc = 4.55, xc = turUpX(yc);
      const on = (out, up, z) => [s * (xc + nx * out + ux * up), yc + ny * out + uy * up, z];
      tb.box(0.55, 2.5, 10.4, P, on(0.27, 0, -6.4), rot);
      for (const z of [-10.6, -8.0, -4.8, -2.2]) {
        for (const up of [-0.95, 0.95]) tb.cyl(0.17, 0.17, 0.2, 6, D, on(0.6, up, z), 'x', rot);
      }
      tb.seam(on(0.56, -1.2, -6.4), on(0.56, 1.2, -6.4), [s * nx, ny, 0], D);
      tb.setTag(null);
    }

    // Kính ngắm pháo thủ có hộp giáp, mí che mưa, cần gạt nước và cửa chớp (nóc trước phải)
    tb.setTag('opticGunner');
    tb.box(3.4, 2.2, 3.8, P, [7.0, ROOF + 1.1, -7.9]);
    tb.box(3.6, 0.16, 4.1, D, [7.0, ROOF + 2.24, -7.95]);
    tb.box(2.8, 0.14, 0.55, P, [7.0, ROOF + 1.92, -10.0], [0.18, 0, 0]);
    tb.box(1.45, 1.0, 0.12, M.optic || M.glass, [6.45, ROOF + 1.3, -9.83]);       // ô kính ngày
    tb.box(0.85, 0.85, 0.12, M.thermalWin || M.glass, [7.75, ROOF + 1.3, -9.83]);  // cửa sổ ảnh nhiệt
    tb.cyl(0.13, 0.13, 0.1, 10, M.laserWin || M.glass, [7.75, ROOF + 0.72, -9.84], 'z');   // ô đo xa laser
    tb.box(0.1, 1.0, 0.1, D, [7.25, ROOF + 1.3, -9.9]);   // khung ngăn 2 ô kính
    tb.strut([6.3, ROOF + 1.82, -9.92], [5.85, ROOF + 1.05, -9.92], 0.045, D, 4);
    tb.boltRow([5.45, ROOF + 2.26, -9.6], [8.55, ROOF + 2.26, -9.6], 4, 'y', D, 0.11);
    tb.setTag(null);
    // cửa chớp bọc thép 2 cánh trước ô kính: mở khi làm việc, đóng sập khi bị pháo / mảnh dập gần (VehicleKit.sightShutter)
    for (const s of [1, -1]) {
      VehicleKit.sightShutter(unit, turret, P, D, { hinge: [s > 0 ? 5.55 : 8.45, ROOF + 1.3, -10.0], w: 1.45, h: 1.35, t: 0.14,
        along: 'x', dir: s, axis: 'y', open: s * 1.9, tag: 'opticGunner', yBase: DECK_Y + ROOF });
    }

    // Nắp chỉ huy với vòng kính tiềm vọng (trái) & nắp nạp đạn (phải)
    tb.cyl(2.3, 2.4, 0.55, 20, P, [-5.2, ROOF + 0.27, 3.0]);
    tb.setTag('hatchCdr');
    tb.cyl(1.95, 2.0, 0.32, 20, P, [-5.2, ROOF + 0.7, 3.0]);
    tb.box(1.0, 0.35, 0.6, D, [-5.2, ROOF + 0.75, 5.0]);
    tb.setTag(null);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.85 + i * (Math.PI * 1.7 / 6) - Math.PI / 2;
      const x = -5.2 + Math.cos(a) * 2.35, z = 3.0 + Math.sin(a) * 2.35;
      tb.box(0.75, 0.4, 0.3, M.optic || M.glass, [x, ROOF + 0.45, z], [0, -a + Math.PI / 2, 0]);
    }
    tb.setTag('hatchLdr');
    tb.cyl(1.85, 1.9, 0.3, 18, P, [5.4, ROOF + 0.15, 2.6]);
    tb.box(0.9, 0.35, 0.5, D, [5.4, ROOF + 0.3, 4.5]);
    tb.setTag(null);
    tb.box(0.8, 0.45, 0.4, M.optic || M.glass, [5.4, ROOF + 0.25, 0.4]);

    // Kính toàn cảnh trưởng xe trên trụ cao (đầu kính xoay quét có cửa sổ ảnh nhiệt + quang học ngày + gạt mưa)
    tb.cyl(0.9, 1.05, 2.4, 12, P, [-6.6, ROOF + 1.2, -6.2]);
    tb.cyl(1.18, 1.18, 0.22, 12, D, [-6.6, ROOF + 0.12, -6.2]);
    const periHead = new THREE.Group();
    periHead.position.set(-6.6, ROOF + 3.15, -6.2);
    const ph = new VehicleKit.PartBatch(DECK_Y + ROOF + 3.15);
    ph.box(2.3, 1.6, 2.3, P, [0, 0, 0]);
    ph.box(1.6, 0.75, 0.1, M.optic || M.glass, [0, 0.1, -1.18]);
    ph.box(0.08, 0.78, 0.12, D, [0.15, 0.1, -1.19]);
    ph.cyl(0.28, 0.28, 0.14, 10, M.thermalWin || M.lens, [-0.42, 0.1, -1.18], 'z');
    ph.box(1.85, 0.12, 0.38, D, [0, 0.56, -1.26], [0.2, 0, 0]);
    ph.strut([0.52, 0.48, -1.24], [0.32, -0.15, -1.24], 0.04, D, 4);
    ph.box(2.5, 0.18, 2.5, D, [0, 0.85, 0]);
    ph.build(periHead);
    VehicleKit.sightShutter(unit, periHead, P, D, { hinge: [0, 0.5, -1.34], w: 0.95, h: 1.75, t: 0.1, along: 'y', dir: -1, axis: 'x', open: 1.5, yBase: DECK_Y + ROOF + 3.15 });
    turret.add(periHead);
    VehicleKit.registerPartGroup(unit, 'opticCdr', periHead);

    // Tay nắm leo tháp hai bên mép nóc (bên phải chừa khoảng trống cho chân đế bệ vũ khí nóc)
    for (const s of [-1, 1]) tb.grabHandle([s * 8.9, ROOF, s > 0 ? 5.2 : 7.0], 'z', s > 0 ? 2.0 : 2.8, 0.6, P);

    // Tấm xả áp hộc đạn trên nóc đuôi tháp
    tb.box(16.2, 0.06, 0.16, D, [0, ROOF + 0.03, 8.6]);
    tb.box(16.2, 0.06, 0.16, D, [0, ROOF + 0.03, 15.6]);
    for (const x of [-8.1, -2.7, 2.7, 8.1]) tb.box(0.16, 0.06, 7.0, D, [x, ROOF + 0.03, 12.1]);

    // Tấm vải nhận diện phe (nhìn rõ từ trên không): buộc vội, lệch, một góc gió lật gập lên
    VehicleKit.idCloth(tb, M.idPanel, M.canvasDark, 5.0, 3.4, [-4.6, ROOF + 0.02, 12.4], 0.04 + J() * 0.1, rnd);

    // Mũ sắt kíp xe bỏ quên trên nóc cạnh nắp chỉ huy + 2 hộp đạn súng máy dự trữ chằng cạnh trạm vũ khí
    const helmet = new THREE.SphereGeometry(0.78, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    tb.add(helmet, M.canvasDark, [-8.0, ROOF + 0.05, 6.4], [0.18, 0, -0.12]);
    tb.add(new THREE.TorusGeometry(0.76, 0.05, 4, 16), M.canvasDark, [-8.0, ROOF + 0.06, 6.4], [Math.PI / 2 + 0.18, 0, -0.12]);
    tb.setTag('boxR');
    for (let i = 0; i < 2; i++) {
      const c = [5.4 + i * 0.05, ROOF, 12.65 + i * 1.25], r = 0.06 + J() * 0.2;
      tb.box(1.9, 1.15, 1.05, M.paintDusty, [c[0], c[1] + 0.575, c[2]], [0, r, 0]);
      tb.box(1.98, 0.12, 1.12, M.paintDusty, [c[0], c[1] + 1.2, c[2]], [0, r, 0]);
      tb.box(0.7, 0.1, 0.18, M.steel, [c[0], c[1] + 1.32, c[2]], [0, r, 0]);
    }
    tb.box(0.25, 0.06, 2.8, M.canvasDark, [5.4, ROOF + 1.28, 13.25], [0, 0.08, 0]);
    tb.setTag(null);

    // Cảm biến gió ngang + 2 cần ăng-ten
    tb.cyl(0.12, 0.14, 2.6, 6, D, [0, ROOF + 1.3, 16.0]);
    tb.box(1.4, 0.12, 0.12, D, [0, ROOF + 2.6, 16.0]);
    const ant = new VehicleKit.AntennaSet(D, turret);
    for (const s of [-1, 1]) {
      tb.cyl(0.45, 0.5, 0.7, 8, D, [s * 7.6, ROOF + 0.35, 15.4]);
      // Hai roi đứng gần thẳng, mỗi roi ngả một chút khác nhau (chân lò xo không bao giờ thẳng tuyệt đối)
      ant.add([s * 7.6, ROOF + 0.7, 15.4], s < 0 ? 14.5 : 15.5, { tilt: [0.1 + J() * 0.06, s * 0.03 + J() * 0.04], r0: 0.09, r1: 0.05 });
      tb.box(0.3, 0.5, 0.3, M.rubber, [s * 7.6, ROOF + 0.95, 15.4]);
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // Cụm phóng lựu đạn khói 4 ống mỗi bên, miệng ống có nắp cao su chống bụi, chân ống có hộp đấu điện & cáp điểm hỏa.
    // Bên đã bắn: nắp bị thổi bay, miệng ống ám muội, một nắp còn treo lủng lẳng trên dây giữ
    for (const s of [-1, 1]) {
      tb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      const sdx = turUpX(5.4) + 0.24 - 11.35;   // bệ ốp sát tấm hông trên đang ngả vào trong
      tb.box(0.45, 1.4, 4.4, P, [s * (11.35 + sdx), 5.4, 2.4], [0, 0, s * TUR_UP_TILT]);
      tb.box(0.32, 0.42, 0.65, D, [s * (11.55 + sdx), 4.95, 4.35], [0, 0, s * TUR_UP_TILT]); // hộp nối cáp điểm hỏa
      const rot = [-0.45, 0, -s * 0.85];
      const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      const fired = wear.smokeFired === s;
      for (let i = 0; i < 4; i++) {
        const c = [s * (11.95 + sdx), 5.95, 0.8 + i * 1.05];
        const at = (d) => [c[0] + ax.x * d, c[1] + ax.y * d, c[2] + ax.z * d];
        tb.cyl(0.4, 0.4, 1.7, 10, D, c, 'y', rot);
        tb.cyl(0.44, 0.44, 0.16, 10, P, at(-0.45), 'y', rot); // đai thép giữ ống
        tb.strut(at(-0.78), [s * (11.52 + sdx), 5.15, 0.9 + i * 1.0], 0.035, M.rubber, 4); // dây điểm hỏa
        if (fired && i !== 3) {
          tb.cyl(0.3, 0.3, 0.06, 10, M.soot, at(0.84), 'y', rot);
          if (i === 1) {
            const h = at(0.6);
            tb.strut(h, [h[0] + s * 0.15, h[1] - 0.9, h[2] - 0.1], 0.03, M.rubber, 4);
            tb.cyl(0.44, 0.44, 0.22, 10, M.rubber, [h[0] + s * 0.2, h[1] - 1.05, h[2] - 0.12], 'y', [1.3, 0, s * 0.3]);
          }
        } else {
          tb.cyl(0.44, 0.44, 0.22, 10, M.rubber, at(0.9), 'y', rot);
        }
      }
      tb.setTag(null);
    }

    // Thùng đồ hai bên hông hộc đạn: gân dập, bản lề nắp, khóa gài. Một thùng nắp đóng không kín (vênh hé lên,
    // lòi mép bạt ra ngoài); thùng kia móp một góc
    for (const s of [-1, 1]) {
      tb.setTag('bin' + (s < 0 ? 'L' : 'R'));
      tb.box(1.8, 3.8, 7.0, P, [s * 11.3, 3.6, 12.4], [0, s * 0.06, 0]);
      tb.box(1.9, 0.08, 7.1, D, [s * 11.32, 4.9, 12.4], [0, s * 0.06, 0]);
      for (const z of [11.5, 13.3]) tb.box(0.1, 2.9, 0.3, P, [s * 12.24, 3.3, z], [0, s * 0.06, 0]);
      tb.hinge([s * 10.45, 5.55, 12.4], 'z', 6.6, D, 0.14, 4);
      if (wear.binOpen === s) {
        const lr = [0, s * 0.06, s * 0.22];
        const F = frameAt([s * 10.45, 5.5, 12.4], lr);
        tb.box(1.9, 0.12, 7.1, P, F(s * 0.9, 0.06, 0), lr);
        tb.box(0.06, 0.9, 3.8, M.canvasDark, [s * 12.27, 5.15, 12.1], [0.05, s * 0.06, s * 0.1]);   // mép bạt lòi ra khe nắp
        tb.box(0.15, 0.7, 0.5, M.steel, [s * 12.4, 4.85, 14.6], [0, 0, s * 0.5]);                     // khóa gài bung, chỉa ra
      } else {
        tb.box(1.9, 0.12, 7.1, P, [s * 11.32, 5.56, 12.4], [0, s * 0.06, 0]);
      }
      for (const z of [10.2, 14.6]) {
        if (wear.binOpen === s && z > 12) continue;
        tb.box(0.15, 0.7, 0.5, M.steel, [s * 12.25, 4.5, z]);
      }
      tb.setTag(null);
    }

    // Tấm thép vá hàn ngoài thực địa che vết trúng đạn cũ trên hông tháp: cắt tay không vuông vức, đặt lệch,
    // đường hàn vòng quanh mép, sơn dặm khác tông
    {
      const s = wear.patchSide, y = 4.6, x = s * (turUpX(y) + 0.12);
      const rot = [0.04, 0, s * (TUR_UP_TILT + 0.05)];
      const F = frameAt([x, y, 4.6], rot);
      tb.box(0.22, 2.3, 3.3, M.paintDusty, F(0, 0, 0), rot);
      const corners = [[1.1, -1.6], [1.18, 1.55], [-1.12, 1.65], [-1.15, -1.5]];
      for (let k = 0; k < 4; k++) {
        const [y0, z0] = corners[k], [y1, z1] = corners[(k + 1) % 4];
        tb.weld(F(s * 0.08, y0, z0), F(s * 0.08, y1, z1), M.paintDusty, 0.12);
      }
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
    // Giỏ nhồi quá tải như xe thật sau vài tuần ngoài thực địa: đồ lòi lên khỏi lan can, bạt vắt qua mép sau,
    // can nước treo ngoài, dây chằng chéo
    tb.setTag('stowage');
    // cuộn bạt phồng xẹp không đều, thắt lại ở chỗ dây buộc
    const cuts = [-5.2, -3.2, -0.9, 1.6, 4.0, 6.2], straps = [-3.2, 1.6];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], c = cuts[i + 1], mid = (a + c) / 2;
      const ra = straps.includes(a) ? 0.98 : 1.08 + rnd() * 0.12, rc = straps.includes(c) ? 0.98 : 1.08 + rnd() * 0.12;
      const rm = Math.max(ra, rc) + 0.04 + rnd() * 0.1, dz = J() * 0.15;
      tb.cyl(rm, ra, mid - a, 12, M.canvas, [(a + mid) / 2, by0 + 1.3, 18.9 + dz], 'x');
      tb.cyl(rc, rm, c - mid, 12, M.canvas, [(mid + c) / 2, by0 + 1.3, 18.9 + dz], 'x');
    }
    for (const x of straps) tb.add(new THREE.TorusGeometry(1.0, 0.07, 4, 14), M.canvasDark, [x, by0 + 1.3, 18.9], [0, Math.PI / 2, 0]);
    tb.box(2.6, 2.1, 2.2, M.canvasDark, [-6.6, by0 + 1.15, 19.2], [0, 0.12, 0.05]);
    tb.box(2.2, 1.7, 2.0, M.canvas, [6.4, by0 + 0.95, 19.0], [0, -0.2, 0]);
    // ba lô nhét trên cùng, lòi khỏi lan can, túi ngoài + quai
    tb.box(2.3, 1.7, 1.6, M.canvasDark, [-5.9, by1 - 0.2, 18.9], [0.1, 0.35, -0.12]);
    tb.box(1.5, 0.9, 0.5, M.canvasDark, [-5.75, by1 - 0.45, 19.85], [0.1, 0.35, -0.12]);
    // tấm đệm ngủ cuộn tròn nằm vắt ngang trên đỉnh
    tb.cyl(0.62, 0.62, 5.6, 10, M.canvas, [-0.6, by1 - 0.35, 18.6], 'x', [0, 0.12, 0.05]);
    // thùng gỗ đạn chồng lệch bên phải
    tb.box(2.4, 1.3, 1.9, M.wood, [5.2, by1 - 0.25, 18.6], [0.04, -0.18, 0.06]);
    tb.box(2.45, 0.06, 1.95, M.dark, [5.2, by1 - 0.25, 18.6], [0.04, -0.18, 0.06]);
    // bạt vắt qua lan can sau, rủ xuống mặt ngoài giỏ (2 lớp gấp nếp)
    tb.box(3.6, 0.08, 1.0, M.canvasDark, [0.9, by1 + 0.16, 20.25], [0.12, 0.03, 0]);
    tb.box(3.4, 2.4, 0.08, M.canvasDark, [0.95, by1 - 1.15, 20.85], [-0.08, 0.04, 0.03]);
    tb.box(1.6, 1.4, 0.08, M.canvasDark, [-0.2, by1 - 2.6, 20.95], [-0.18, 0.1, -0.12]);
    // can nước thứ 2 treo ngoài lan can sau, quai móc vào thanh giỏ
    tb.jerrycan([-3.6, by0 + 1.4, 19.9], Math.PI / 2, 1.2, 2.8, 2.0, P, D);
    tb.jerrycan([6.2, by0 + 1.7, 21.35], Math.PI / 2 + 0.08, 1.2, 2.8, 2.0, M.paintDusty, D);
    // dây chằng chéo qua đống đồ, đầu buộc vào khung giỏ
    // (dây căng thẳng giữa các điểm -> đặt điểm ngay mép trên từng món: ba lô, tấm đệm, thùng gỗ để dây vắt qua chứ không xuyên)
    rope(tb, [[-bx, by1, bz0 + 0.3], [-7.3, by1 + 1.0, 18.2], [-4.5, by1 + 1.05, 18.4], [-3.4, by1 + 0.34, 18.4],
      [2.3, by1 + 0.38, 18.5], [3.9, by1 + 0.62, 18.6], [6.5, by1 + 0.62, 18.9], [bx, by1, bz1]], 0.07, M.canvasDark, 4);
    rope(tb, [[-bx, by1, bz1], [-7.1, by1 + 0.95, 19.6], [-4.6, by1 + 0.95, 19.5], [-3.5, by1 + 0.25, 19.5],
      [3.7, by1 + 0.6, 19.55], [6.5, by1 + 0.6, 19.4], [bx, by1, bz0 + 0.3]], 0.07, M.canvasDark, 4);
    tb.setTag(null);

    // --- Chi tiết bề mặt tháp: mối hàn, bu-lông, móc cẩu (module má đã dựng cùng giáp nêm) ---
    const ROOF_EDGE = TUR_RIDGE_X - TUR_LEAN - ROOF_CH;   // mép nóc phẳng, ngoài đó là dải vát
    for (const s of [-1, 1]) {
      const rot = [0, 0, s * TUR_UP_TILT];
      // Hông tháp sau module má: bu-lông viền trên tấm hông trên
      tb.boltRow([s * turUpX(5.3), 5.3, -0.2], [s * turUpX(5.3), 5.3, 7.6], 6, 'x', D, 0.15, s, rot);
      // mối hàn theo đường gãy nóc phẳng - dải vát mép
      tb.weld([s * ROOF_EDGE, ROOF + 0.02, -4.0], [s * ROOF_EDGE, ROOF + 0.02, 8.0], P);
      // Mối hàn mép trước nóc (sau dải vát nối xuống chân giáp nêm)
      tb.weld([s * 3.6, ROOF + 0.02, -11.5 + ROOF_CH], [s * (ROOF_EDGE - 0.2), ROOF + 0.02, -11.5 + ROOF_CH], P, 0.1);
      // Móc cẩu nóc tháp (trước & sau)
      for (const [x, z] of [[8.4, -9.4], [8.0, 15.0]]) {
        tb.box(1.0, 0.35, 0.6, P, [s * x, ROOF + 0.15, z]);
        tb.add(new THREE.TorusGeometry(0.5, 0.16, 5, 10), M.steel, [s * x, ROOF + 0.5, z], [0, Math.PI / 2, 0]);
      }
      // Bu-lông viền nóc dọc hai mép
      tb.boltRow([s * (ROOF_EDGE - 0.4), ROOF, -8.4], [s * (ROOF_EDGE - 0.4), ROOF, 14.2], 12, 'y', D, 0.14);
    }
    // Nấm thông gió quạt hút khí thuốc phóng trên nóc giữa
    tb.cyl(0.55, 0.6, 0.6, 12, P, [1.4, ROOF + 0.3, 5.6]);
    tb.cyl(1.15, 0.95, 0.35, 14, P, [1.4, ROOF + 0.75, 5.6]);

    tb.build(turret);

    // Số hiệu chiến thuật kẻ stencil trên thùng đồ hai bên
    const tacNumber = `${1 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.4, 1.7, undefined, true, (rnd() * 1e9) | 0);
      if (decal) {
        decal.position.set(s * 12.27, 3.4, 12.4);
        decal.rotation.y = s * Math.PI / 2 + s * 0.06;
        turret.add(decal);
      }
    }

    // Ô NÓC THÁP: bệ gắn phía nạp đạn, người chơi chọn món ở kho trang bị (Equipment, nhóm 'roof'). Mô hình dựng sẵn món
    // mặc định (máy phá sóng); Equipment.equip gọi unit.mountRoof(mã món) để gỡ món cũ, dựng món khác đúng chỗ đó
    const roofCtx = { parent: turret, seat: [ROOF_SEAT[0], TUR_ROOF, ROOF_SEAT[1]], yBase: DECK_Y + TUR_ROOF, M, P, D, unit, rnd };
    unit.mountRoof = (id) => { if (window.RoofMounts) RoofMounts.mount(roofCtx, id); };
    unit.mountRoof('ewjam');

    // Cửa hất đế liều phóng trên nóc đuôi tháp (bên nạp đạn, giữa 2 tấm xả áp hộc đạn): liều phóng cháy hết, còn lại đế
    // thép — kíp nạp đạn tống ra ngoài qua cửa nhỏ này sau mỗi phát như cửa hất đế trên nóc tháp T-72 (modelAnimator: cửa
    // bật ngửa, đế văng lên ra sau tháp, khói thuốc xì theo). Cửa sau tháp bị giỏ đồ che nên đặt trên nóc
    const ej = new THREE.Group();
    ej.position.set(0.3, ROOF + 0.02, 11.8);
    const eb = new VehicleKit.PartBatch(DECK_Y + ROOF);
    eb.box(2.8, 0.14, 2.4, D, [0, 0.07, 0]);           // khung cửa
    eb.build(ej);
    const ejFlap = new THREE.Group();                   // cánh cửa, bản lề ở mép trước
    ejFlap.position.set(0, 0.14, -1.1);
    const fb = new VehicleKit.PartBatch(DECK_Y + ROOF);
    fb.box(2.4, 0.22, 2.1, P, [0, 0.11, 1.05]);
    fb.box(0.6, 0.18, 0.22, D, [0, 0.3, 1.8]);          // tay kéo
    fb.cyl(0.13, 0.13, 2.3, 8, D, [0, 0.08, 0], 'x');    // trục bản lề
    fb.build(ejFlap);
    ej.add(ejFlap);
    turret.add(ej);

    return { periHead, ejFlap };
  }

  // ===========================================================================
  // Ô NÓC THÁP: CÁC MÓN GẮN ĐƯỢC TRÊN BỆ PHÍA NẠP ĐẠN (chọn ở kho trang bị — Equipment nhóm 'roof'). Chân đế mô-đun & các
  // món dùng chung mọi xe: roof_mounts.js
  // ===========================================================================
  const ROOF_SEAT = [6.2, 9.0];   // tâm bệ gắn trên nóc tháp (x, z hệ tháp)

  // ===========================================================================
  // PHÁO CHÍNH 120MM L/55
  // ===========================================================================
  function buildGun(unit, M, wear) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.9, -11.5);
    unit.barrelPivot = pivot;
    unit.turretGroup.add(pivot);

    // Tấm chắn pháo (mantlet) + súng máy đồng trục
    const mb = new VehicleKit.PartBatch(DECK_Y + 3.9);
    const mPts = [[-3.25, 1.5], [3.25, 1.5], [3.25, -2.8], [2.4, -4.3], [-2.4, -4.3], [-3.25, -2.8]];
    mb.add(VehicleKit.loft(mPts, mPts, -2.7, 2.5, 0.45), M.paint);
    mb.cyl(1.75, 1.75, 1.2, 18, M.paint, [0, 0, -4.9], 'z');
    // Bạt che khe nòng (chống bụi lọt vào khe tấm chắn), nếp gấp vải
    mb.cyl(1.42, 1.9, 1.3, 16, M.canvasDark, [0, 0, -6.1], 'z');
    for (const z of [-5.75, -6.3]) {
      const r = 1.95 - (-5.45 - z) * 0.37;
      mb.cyl(r, r, 0.16, 16, M.canvasDark, [0, 0, z], 'z');
    }
    // Dây đai siết bạt vào ống nòng + 2 đai buộc kéo về tấm chắn (vải chùng, lệch)
    mb.cyl(1.47, 1.47, 0.22, 16, M.dark, [0, 0, -6.68], 'z');
    for (const s of [-1, 1]) mb.strut([s * 1.25, 0.6, -6.6], [s * 2.4, 1.05, -4.35], 0.06, M.canvasDark, 4);
    mb.cyl(0.24, 0.24, 1.0, 8, M.dark, [-2.0, -1.0, -4.7], 'z');
    mb.cyl(0.19, 0.19, 0.12, 8, M.soot, [-2.0, -1.0, -5.22], 'z');                 // miệng súng đồng trục ám khói
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
    // Một đoạn ống bọc nhiệt đã thay mới ngoài xưởng dã chiến: tông sơn khác hẳn các đoạn cũ bạc nắng
    const sleeveMat = (k) => (k === wear.sleeve ? M.paintDusty : P);
    section(1.28, 1.32, -5.4, -15.4);
    section(1.22, 1.26, -15.85, -21.35, sleeveMat(1));
    section(1.24, 1.8, -21.35, -22.35);   // côn sau bầu hút khói
    section(1.8, 1.8, -22.35, -27.35);
    section(1.2, 1.8, -27.35, -28.35);    // côn trước bầu hút khói
    section(1.12, 1.18, -28.35, -33.3, sleeveMat(2));
    section(1.05, 1.1, -33.45, -44.5, sleeveMat(3));
    section(1.0, 1.04, -44.75, -52.6);
    section(0.98, 1.0, -52.6, -54.45, M.soot);     // khói thuốc phóng hun đen đoạn ống bọc cuối
    // Đai kẹp mối nối giữa các đoạn ống bọc: dải thép mỏng chỉ nhô hơn ống bọc vài mm, phủ kín khe nối
    for (const [z, r, len] of [[-15.62, 1.31, 0.55], [-33.37, 1.15, 0.3], [-44.62, 1.075, 0.35]]) {
      gb.cyl(r, r, len, 24, M.dark, [0, 0, z], 'z');
    }
    // Vành kẹp mép ống bọc cuối: từ đây ống nòng thép trần nhỏ hơn thò ra ~36 cm
    gb.cyl(1.05, 1.05, 0.3, 24, M.dark, [0, 0, -54.32], 'z');
    // Miệng nòng (mặt cắt dọc, y = quãng tiến về phía trước từ z = -54.2): ống thép thuôn nhẹ, vát mép ngoài,
    // mặt đầu phẳng ám khói, vát mép lòng rồi lòng nòng 120 mm (r 0.48) sâu tối -> nhìn thẳng thấy lỗ thật
    const MZ = -54.2;
    gb.lathe([[0.84, 0], [0.84, 2.4], [0.82, 3.04]], 24, M.steel, [0, 0, MZ], 'z');
    gb.lathe([[0.82, 3.04], [0.77, 3.15], [0.55, 3.15], [0.49, 3.09]], 24, M.soot, [0, 0, MZ], 'z');
    gb.lathe([[0.49, 3.08], [0.49, -0.6], [0, -0.6]], 16, M.bore, [0, 0, MZ], 'z');
    // Gương chuẩn nòng (MRS) trên ống bọc cuối: đai kẹp ôm nòng, đế yên ngựa, hộp gương có mái che;
    // mặt gương quay về sau nhìn bộ phát trên tấm chắn pháo
    gb.cyl(1.03, 1.03, 0.32, 24, M.dark, [0, 0, -53.6], 'z');
    gb.box(0.5, 0.18, 0.46, M.dark, [0, 1.06, -53.6]);
    gb.box(0.6, 0.4, 0.64, M.dark, [0, 1.34, -53.62]);
    gb.box(0.42, 0.24, 0.04, M.glass, [0, 1.33, -53.285]);
    gb.box(0.64, 0.05, 0.22, M.dark, [0, 1.565, -53.2]);
    for (const s of [-1, 1]) gb.box(0.04, 0.34, 0.22, M.dark, [s * 0.3, 1.38, -53.2]);
    gb.build(barrel);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -57.6);
  }

  TankModelBuilder.registerModel('ALL_ROUNDER', buildHalberd);
})();
