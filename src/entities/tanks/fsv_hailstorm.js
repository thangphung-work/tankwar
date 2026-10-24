/**
 * XE CHI VIỆN HỎA LỰC HẠNG NẶNG HAILSTORM R6  (tankType: GATLING)
 *
 * Thiết kế hư cấu: xe chi viện hỏa lực cận chiến trên khung gầm xích hạng nặng, động cơ đặt trước.
 * - Giáp mũi dài thoải, lưới hút gió động cơ trên nóc trước, cửa xả khí bên sườn phải
 * - Bánh sao chủ động phía trước, 6 cặp bánh chịu tải lớn, bánh dẫn hướng phía sau
 * - Lưỡi ủi thủy lực dọn chướng ngại phía trước
 * - Váy xích module dày gắn gạch giáp phản ứng nổ (ERA), lồng thép chống RPG bao đuôi xe
 * - Tháp thấp, pháo 6 nòng xoay 30mm trong hộp giáp, 2 hòm đạn hai bên tháp + máng tiếp đạn
 *
 * Hook gameplay giữ nguyên: gatlingCluster (xoay quanh trục Z), gatlingHeatMat (nòng nóng đỏ),
 * barrelGroup (giật nòng), muzzleTipLocal. Tỉ lệ ~8 đơn vị = 1 mét, mũi xe hướng -Z.
 */

(function () {
  if (typeof VehicleKit === 'undefined') return;

  const TRACK_X = 12.6;
  const TRACK_W = 5.6;
  const LINK_IN = 0.3;
  const WHEEL_R = 3.1;
  const WHEEL_Y = 0.62 + LINK_IN + WHEEL_R;
  const WHEEL_Z = [-17.5, -10.1, -2.7, 4.7, 12.1, 19.5];
  const SPROCKET = { z: -25.6, y: 5.7, r: 2.8 };   // bánh sao chủ động phía trước
  const IDLER = { z: 27.6, y: 5.1, r: 2.7 };       // bánh dẫn hướng phía sau
  const RETURN_ROLLER_Z = [-13.8, 1.0, 15.8];
  const RETURN_ROLLER_R = 1.0;
  const HULL_HALF_W = 15.2;
  const ROOF_Y = 14.2;
  const SPONSON_Y = 9.6;
  // Mũi thân xe: khối giáp đúc dày dựng cao (mặt trước gần đứng cao ~0.35 m trên đường sườn), giáp mũi trên thoải lên nóc
  const NOSE_Z = -31.6, NOSE_Y = 12.2;
  const GLACIS_SLOPE = (ROOF_Y - NOSE_Y) / (-14.5 - NOSE_Z);
  const GLACIS_ANGLE = Math.atan(GLACIS_SLOPE);
  const glacisY = (z) => NOSE_Y + (z - NOSE_Z) * GLACIS_SLOPE;
  const RADAR_RPS = 1.0;   // radar cảnh giới phòng không quay 60 vòng/phút

  function buildHailstorm(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    // Xe đã qua chiến trường: bùn văng, muội, dầu loang, xước, lỗ mảnh đạn, gỉ chảy, sơn bạc nắng
    const M = K.createMaterials(unit.team, { battle: 1 });
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    M.soot = M.soot || M.dark;
    M.wood = M.wood || M.canvasDark;
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);
    const wear = rollWear(rnd);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildHull(chassis, M, unit, wear);
    const running = buildRunningGear(chassis, M);
    unit.trackSystem = running.tracks;
    const turretParts = buildTurret(chassis, M, unit, rnd, wear);
    // Ô HỘP ĐẠN: hòm 300 viên mặc định; Equipment.equip thay hòm 450 / 650 theo bộ đồ
    const magCtx = { unit, M, wear };
    unit.mountMag = (id) => mountMag(magCtx, id);
    unit.mountMag('mag300');
    const gun = buildRotaryCannon(unit, M);
    unit.gatlingSpinByModel = true; // spg.js không tự xoay cụm nòng, animator bên dưới đảm nhiệm

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.radarDish = null;
    unit.rcwsTurret = null;

    // Ô MŨI XE (lưỡi ủi mặc định / khiên chữ V) & ô NÓC THÁP (chân đế mô-đun sau nắp tháp bên phải: súng phóng lựu,
    // radar, máy phá khóa radar — roof_mounts.js; để trống = không gắn gì). Equipment.equip thay theo bộ đồ
    const frontCtx = { chassis, M, unit, wear };
    unit.mountFront = (id) => mountFront(frontCtx, id);
    unit.mountFront('dozer');
    const roofCtx = { parent: unit.turretGroup, seat: [6.6, 5.6, 5.8], yBase: ROOF_Y + 5.6, M, P: M.paint, D: M.dark, unit, rnd };
    unit.mountRoof = (id) => { if (window.RoofMounts) RoofMounts.mount(roofCtx, id); };

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
        // Xích bị đứt (hệ thống hư hại đặt u.trackBroken[0|1]) -> dải xích bên đó đứng im
        const br = u.trackBroken;
        const dl = (br && br[0]) ? 0 : v * dt - dYaw * TRACK_X;
        const dr = (br && br[1]) ? 0 : v * dt + dYaw * TRACK_X;
        if (Math.abs(dl) > 1e-5 || Math.abs(dr) > 1e-5) {
          running.tracks.advance([dl, dr]);
          for (const ws of running.wheelSets) ws.roll(dl, dr);
        }
        if (!u.isDead) {
          scanTime += dt;
          turretParts.periHead.rotation.y = Math.sin(scanTime * 0.3) * 1.6;
          turretParts.radarHead.rotation.y += dt * RADAR_RPS * Math.PI * 2;
        }
        updateGunFx(gun, u, dt);
      }
    };

    return { hullW: HULL_HALF_W * 2 };
  }

  // ===========================================================================
  // Ô MŨI XE: LƯỠI ỦI (mặc định) HOẶC KHIÊN GIÁP CHỮ V — cụm riêng trước mũi xe, Equipment.equip gọi unit.mountFront(id).
  // Dựng với PartBatch.registry để tag hư hại (dozer / appliqueVSL / appliqueVSR) chạy như bộ phận dựng cùng thân xe
  // ===========================================================================
  function mountFront(ctx, id) {
    const u = ctx.unit;
    if (u.frontId === id) return;
    if (u._frontGroup) {
      if (u._frontGroup.parent) u._frontGroup.parent.remove(u._frontGroup);
      u._frontGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const t of u._frontTags || []) { if (u.partRegistry) delete u.partRegistry[t]; if (u.partGroups) delete u.partGroups[t]; }
    }
    u._frontGroup = null; u._frontTags = []; u.frontId = id;
    const build = id === 'dozer' ? buildDozer : id === 'vshield' ? buildVShield : null;
    if (!build) return;
    const g = new THREE.Group();
    ctx.chassis.add(g);
    const hb = new VehicleKit.PartBatch();
    const PB = VehicleKit.PartBatch, prev = PB.registry;
    PB.registry = u.partRegistry || (u.partRegistry = {});
    try {
      build(hb, ctx); hb.build(g, [0, 5, -34]);
      // khiên chữ V đi kèm bao cát đối trọng sau đuôi (lưới riêng, gốc đặt ở đuôi để getWorldPosition đúng chỗ)
      if (id === 'vshield') { const sb = new PB(); buildSandbags(sb, ctx); sb.build(g, [0, 9.5, 31]); }
    } finally { PB.registry = prev; }
    u._frontGroup = g;
    u._frontTags = id === 'dozer' ? ['dozer'] : ['appliqueVSL', 'appliqueVSR', 'sandbagL', 'sandbagR'];
    if (id === 'dozer') VehicleKit.registerPartGroup(u, 'dozer', g);
  }

  // Lưỡi ủi thủy lực phía trước (mặt lõm, lưỡi cắt thép, gân gia cường)
  function buildDozer(hb, ctx) {
    const { M, wear } = ctx, D = M.dark, J = wear.jitter;
    hb.setTag('dozer');
    const front = [], back = [];
    for (let i = 0; i <= 8; i++) {
      const y = 1.0 + i * (7.6 / 8);
      const k = (y - 4.8) / 3.8;
      const z = -36.8 + 1.5 * (1 - k * k);
      front.push([z, y]);
      back.unshift([z + 0.6, y]);
    }
    hb.add(VehicleKit.sideProfile(front.concat(back), 31.6, 0.08), M.paintDusty);
    // Lưỡi cắt thép thay rời từng đoạn bắt bu-lông: mòn không đều, một đoạn mẻ cụt; mặt lưỡi bị đá cào trơ thép
    for (let k = 0; k < 4; k++) {
      const chip = k === wear.edgeChip;
      const h = chip ? 0.28 : 0.5 - Math.abs(J()) * 0.12;
      hb.box(7.8, h, 0.8, M.steel, [-11.85 + k * 7.9, 0.9 + h / 2 + (chip ? 0.22 : 0), -36.55 + J() * 0.08], [J() * 0.04, 0, J() * 0.015]);
      for (const dx of [-2.6, 0, 2.6]) hb.cyl(0.15, 0.15, 0.16, 6, D, [-11.85 + k * 7.9 + dx, 1.22, -37.0], 'z');
    }
    for (let k = 0; k < 7; k++) {
      const y = 2.0 + Math.abs(J()) * 2.4, x = J() * 26;
      const kk = (y - 4.8) / 3.8;
      hb.box(0.12 + Math.abs(J()) * 0.2, 0.8 + Math.abs(J()) * 1.4, 0.05, M.steel, [x, y, -36.85 + 1.5 * (1 - kk * kk)], [Math.atan(-0.79 * kk), 0, J() * 0.5]);
    }
    // Tấm thép vá hàn ngoài thực địa trên mặt lưỡi (cắt tay, đặt lệch)
    {
      const y = 6.0, kk = (y - 4.8) / 3.8, zf = -36.8 + 1.5 * (1 - kk * kk) - 0.12;
      const rot = [Math.atan(-0.79 * kk), 0, 0.06 + J() * 0.06];
      const F = frameAt([J() * 18, y, zf], rot);
      hb.box(3.4, 1.8, 0.16, M.paint, F(0, 0, 0), rot);
      const c = [[-1.75, -0.95], [1.72, -0.9], [1.78, 0.92], [-1.7, 0.98]];
      for (let q = 0; q < 4; q++) hb.weld(F(c[q][0], c[q][1], -0.08), F(c[(q + 1) % 4][0], c[(q + 1) % 4][1], -0.08), M.paintDusty, 0.1);
    }
    hb.box(31.8, 0.35, 0.9, M.paintDusty, [0, 8.7, -36.5]);
    for (const x of [-13, -6.5, 0, 6.5, 13]) hb.box(0.45, 6.4, 0.9, M.paintDusty, [x, 4.8, -35.0]);
    for (const s of [-1, 1]) {
      // Tay đẩy lưỡi ủi + giá bản lề
      hb.beam([s * 8.4, 3.8, -34.5], [s * 8.4, 5.6, -28.2], 1.2, 1.2, M.paintDusty);
      hb.box(2.0, 1.6, 1.4, D, [s * 8.4, 5.6, -28.4]);
      // Xi-lanh thủy lực: vỏ sơn + cần piston thép bóng
      const p0 = [s * 5.0, 9.0, -30.2], p1 = [s * 5.0, 7.4, -34.9];
      const mid = [s * 5.0, 8.2, -32.6];
      hb.strut(p0, mid, 0.62, M.paintDusty, 10);
      hb.strut(mid, p1, 0.3, M.steel, 8);
      hb.box(1.2, 1.0, 1.0, D, [s * 5.0, 9.0, -30.0]);
    }
    hb.setTag(null);
  }

  // Khiên giáp chữ V: 2 tấm thép cán dày (~28 cm quy đổi) ghép mũi nhọn trước mũi xe, ngả ra sau, cao nhỉnh hơn nóc
  // giáp mũi — khối thép vuông vức: mép trên ốp thanh thép vuông dày, mép đuôi dập thẳng, mũi là khối thép đúc cạnh vuông
  // cắt bằng; gân & tay đỡ giấu mặt trong. Mặt trước chi chít dấu đạn: rãnh đạn nảy cày trần thép, lỗ lõm đạn ghim, mép
  // tấm mẻ sơn, mảng muội cháy loang, bùn bám chân, một tấm vá hàn đè lên lỗ thủng cũ. Tag appliqueVSL / appliqueVSR: tấm
  // giáp phân đoạn — bị bắn mòn dần rồi bung (vehicle_damage.js), còn tấm nào thì mặt trước còn được che (Equipment.vshieldUp)
  function buildVShield(hb, ctx) {
    const { M, wear } = ctx, P = M.paint, D = M.dark, J = wear.jitter, S = M.soot || D;
    const NOSE = [0, -40.2], BACK_X = 15.6, BACK_Z = -33.4, Y0 = 1.2, Y1 = 13.6, H = Y1 - Y0, LEAN = 0.24, T = 2.2;
    const len = Math.hypot(BACK_X, BACK_Z - NOSE[1]), yaw = Math.atan2(BACK_Z - NOSE[1], BACK_X);
    const FACE = -T / 2;   // mặt ngoài tấm (z cục bộ âm)
    for (const s of [-1, 1]) {
      hb.setTag(s < 0 ? 'appliqueVSL' : 'appliqueVSR');
      const rot = [LEAN, -s * yaw, 0, 'YXZ'];   // xoay Y dương đưa đầu +x ra trước -> tấm phải phải xoay âm để đuôi lùi về sau
      const F = frameAt([s * BACK_X / 2, Y0 + H / 2, (NOSE[1] + BACK_Z) / 2], rot);
      const tilt = (a) => [rot[0], rot[1], a, 'YXZ'];
      const BX = s * len / 2;   // đầu đuôi tấm (x cục bộ)
      hb.box(len, H, T, P, F(0, 0, 0), rot);          // tấm thép chính
      hb.box(len - 0.2, 1.2, T + 0.6, P, F(0, H / 2 - 0.6, -0.15), rot);     // mép trên: thanh thép vuông dày ốp đè
      hb.box(0.9, H - 1.2, T + 0.4, P, F(BX - s * 0.45, -0.6, -0.1), rot);   // mép đuôi dập thẳng
      hb.box(len - 0.6, 0.9, T + 0.3, P, F(0, -H / 2 + 0.45, 0.05), rot);   // chân tấm dày
      for (let k = 0; k < 6; k++) hb.cyl(0.2, 0.22, 0.16, 6, D, F(-len / 2 + 1.6 + k * (len - 3.2) / 5, H / 2 - 0.6, -T / 2 - 0.5), 'z', rot);   // bu-lông thanh mép trên
      // gân đứng & tay đỡ hàn vào thân — mặt trong, nhìn trước không thấy
      for (let k = 0; k < 3; k++) hb.box(0.6, H * 0.8, 0.5, D, F(-len / 2 + 3 + k * (len - 6) / 2, -0.4, T / 2 + 0.25), rot);
      for (const k of [0.3, 0.75]) {
        const p0 = F(-len / 2 + k * len, -H * 0.1, T / 2 + 0.4);
        hb.beam(p0, [p0[0] * 0.88, 7.0, -31.0], 1.0, 1.0, D);
      }
      hb.box(len * 0.94, 0.9, 0.08, M.paintDusty, F(0, -H / 2 + 0.6, FACE - 0.02), rot);   // bùn bám chân tấm
      // Rãnh đạn nảy cày trần thép: đạn tới từ trước xiên vào tấm vát nên rãnh dài, nằm gần ngang, đầu rãnh đậm
      const ys = (m) => J() * (H - 3.4) * m - 0.3;   // vùng mặt tấm giữa thanh mép trên & chân
      for (let k = 0; k < 9; k++) {
        const x = J() * (len - 2.5), y = ys(1), a = J() * 0.6 + s * 0.12, l = 0.7 + Math.abs(J()) * 2.6;
        hb.box(l, 0.12 + Math.abs(J()) * 0.1, 0.06, M.steel, F(x, y, FACE - 0.02), tilt(a));
        hb.box(0.28, 0.2, 0.05, S, F(x - Math.cos(a) * l * 0.5, y - Math.sin(a) * l * 0.5, FACE - 0.04), tilt(a));
      }
      // Xước mảnh đan chéo (mảnh nổ, đạn nhỏ quẹt) — sáng mờ
      for (let k = 0; k < 10; k++) hb.box(0.4 + Math.abs(J()) * 1.0, 0.05, 0.04, M.steel, F(J() * (len - 2), ys(1), FACE - 0.015), tilt(J() * 2.4));
      // Lỗ lõm đạn ghim: lòng tối + vành thép trần bị đập loe ra
      for (let k = 0; k < 7; k++) {
        const x = J() * (len - 3), y = ys(0.9), r = 0.16 + Math.abs(J()) * 0.18;
        hb.cyl(r * 2.1, r * 2.1, 0.05, 8, M.steel, F(x, y, FACE - 0.02), 'z', rot);
        hb.cyl(r, r, 0.07, 8, S, F(x, y, FACE - 0.05), 'z', rot);
      }
      // Mép tấm mẻ sơn trơ thép: thanh mép trên & mép đuôi hứng đạn nhiều nhất
      for (let k = 0; k < 6; k++) hb.box(0.5 + Math.abs(J()) * 1.2, 0.18, 0.05, M.steel, F(J() * (len - 1.5), H / 2 - 0.08 - Math.abs(J()) * 0.3, -T / 2 - 0.48), tilt(J() * 0.3));
      for (let k = 0; k < 3; k++) hb.box(0.16, 0.5 + Math.abs(J()) * 0.9, 0.05, M.steel, F(BX - s * 0.45 + J() * 0.5, J() * (H - 3), -T / 2 - 0.32), rot);
      // Muội cháy loang (vài mảng chồng lệch, không thành ô vuông)
      const sx = J() * len * 0.5, sy = ys(0.6);
      for (let k = 0; k < 3; k++) hb.box(1.0 + Math.abs(J()) * 1.4, 0.6 + Math.abs(J()) * 0.9, 0.04, S, F(sx + J() * 1.6, sy + J() * 1.0, FACE - 0.03 - k * 0.005), tilt(J() * 1.2));
    }
    // tấm vá hàn đè lỗ thủng cũ trên một tấm (ngẫu nhiên)
    {
      const s = J() > 0 ? 1 : -1, rot = [LEAN, -s * yaw, 0.06, 'YXZ'];
      const F = frameAt([s * BACK_X * 0.5, Y0 + H * 0.5, NOSE[1] + (BACK_Z - NOSE[1]) * 0.5], rot);
      hb.setTag(s < 0 ? 'appliqueVSL' : 'appliqueVSR');
      hb.box(2.8, 2.2, 0.3, P, F(0, 0, -T / 2 - 0.12), rot);
      const c = [[-1.4, -1.1], [1.4, -1.05], [1.42, 1.1], [-1.38, 1.12]];
      for (let q = 0; q < 4; q++) hb.weld(F(c[q][0], c[q][1], -T / 2 - 0.28), F(c[(q + 1) % 4][0], c[(q + 1) % 4][1], -T / 2 - 0.28), M.paintDusty, 0.1);
    }
    // mũi: khối thép đúc cạnh vuông (hộp xoay 45° ôm khớp hai tấm) cắt bằng mặt trước, khe nhìn của lái xe
    hb.setTag('appliqueVSL');
    const nRot = [LEAN, 0, 0];
    const N = frameAt([NOSE[0], Y0 + H / 2, NOSE[1] + 1.2], nRot);
    hb.box(2.8, H, 2.8, P, N(0, 0, 0), [LEAN, Math.PI / 4, 0]);
    hb.box(1.8, H, 1.0, P, N(0, 0, -1.55), nRot);              // mặt trước cắt bằng
    hb.box(2.4, 1.2, 1.8, P, N(0, H / 2 - 0.6, -1.25), nRot);  // nắp đỉnh mũi nối thanh mép trên hai tấm
    hb.box(1.5, 0.24, 0.3, D, N(0, H / 2 - 2.2, -2.1), nRot);   // khe nhìn
    for (let k = 0; k < 4; k++) hb.box(0.3 + Math.abs(J()) * 0.9, 0.1, 0.05, M.steel, N(J() * 1.2, J() * (H - 3), -2.08), [LEAN, 0, J() * 2.4]);
    const px = J() * 0.6, py = J() * 3;
    hb.cyl(0.42, 0.42, 0.05, 8, M.steel, N(px, py, -2.07), 'z', nRot);
    hb.cyl(0.2, 0.2, 0.07, 8, S, N(px, py, -2.1), 'z', nRot);
    hb.setTag(null);
  }

  // Bao cát đối trọng sau đuôi (đi kèm khiên chữ V): khiên thép dày dồn nặng lên mũi, nhíp trước lún -> kíp xe chất bao
  // cát LẤP KÍN khoang giữa tấm đuôi & lồng chống RPG (lồng giữ bao khỏi tuột), chặn luôn cửa sau (kíp lái ra vào bằng
  // nắp nóc). Giá thép hàn ngang cả đuôi; 3 lớp bao kín bề ngang xếp tay so le, lớp thứ 4 chèn giữa các thanh lồng trên
  // (y 12.6) và chừa đèn hậu. Bao phồng xẹp không đều, bao mới / bao cũ bạc màu lẫn nhau. Tag sandbagL / sandbagR (theo
  // nửa trái / phải): mỗi bao một khối — bị bắn rách xẹp rồi bung (vehicle_damage.js); còn bao nào thì đuôi xe còn được
  // che theo tỉ lệ bao còn lại (Equipment.sandbagLeft)
  function buildSandbags(hb, ctx) {
    const { M, wear } = ctx, D = M.dark, J = wear.jitter;
    // vải bố màu cát (cả hai phe — bao dã chiến không sơn theo phe), lẫn vài bao ô-liu cũ (M.canvasDark)
    if (!M.sandbag) {
      M.sandbag = new THREE.MeshStandardMaterial({ color: 0xa48e66, map: M.canvas.map, roughness: 1, metalness: 0 });
      M.sandbag.userData.surface = 'cloth';
    }
    const BAG = M.sandbag;
    // giá cao hơn vòng xích quanh bánh dẫn hướng (đỉnh ~y 8.4 ở z 27.6, mép sau ~z 29.6 ở y 7.8); bao lùi sau tay nắm
    // cửa / bản lề / đèn hậu (z <= 29.95), trong cánh lồng hai bên (|x| <= 14.5); 3 lớp đầu thấp hơn đèn hậu (y 11.8)
    const Y0 = 8.0, Z0 = 29.95, Z1 = 32.5, ZC = (Z0 + Z1) / 2, XW = 14.4;
    const BH = 1.75, BW = Z1 - Z0, STEP = 1.2, BOT = 0.35 * BH;   // BOT: tâm bao cao hơn đáy
    hb.box(XW * 2 + 0.8, 0.25, BW + 0.15, D, [0, Y0 - 0.13, ZC + 0.07]);
    hb.box(XW * 2 + 0.8, 0.6, 0.16, D, [0, Y0 + 0.05, Z1 + 0.08]);   // gờ chặn mép sau giá
    // thanh chống xiên hàn chân vào tấm đuôi thân dưới (|x| <= 9.4, tránh móc kéo x ±7)
    for (const s of [-1, 1]) for (const x of [5.6, 9.0]) hb.beam([s * x, Y0 - 1.5, 29.35], [s * x, Y0 - 0.25, 31.4], 0.28, 0.28, D);
    let seed = 0;
    const bag = (x, ly, L) => {
      hb.setTag(x < 0 ? 'sandbagL' : 'sandbagR');
      const flip = J() > 0 ? 0 : Math.PI;   // đầu túm buộc quay trái / phải tùy bao
      hb.add(sandbagGeo(L, BH, BW - Math.abs(J()) * 0.25, (seed++) * 1.37), J() > 0.45 ? M.canvasDark : BAG,
        [x, Y0 + ly * STEP + BOT + Math.abs(J()) * 0.08, ZC + J() * 0.1], [J() * 0.03, flip + J() * 0.06, J() * 0.04]);
    };
    // 3 lớp kín bề ngang: 8 bao / lớp, chồng mép nhau chút; lớp lẻ xô lệch cả hàng
    const BL = 3.8, N = 8, SP = (XW * 2 - BL) / (N - 1);
    for (let ly = 0; ly < 3; ly++) {
      const shift = ly % 2 ? J() * 0.3 : 0;
      for (let k = 0; k < N; k++) bag(-XW + BL / 2 + k * SP + shift + J() * 0.08, ly, BL);
    }
    // lớp 4: chèn giữa các thanh lồng trên (x ±5.2, ±13.6), chừa đèn hậu (|x| >= 12.5)
    for (const x of [-3.2, 0.05, 3.2]) bag(x, 3, 3.1);
    for (const s of [-1, 1]) for (const x of [7.15, 10.6]) bag(s * x, 3, 3.35);
    hb.setTag(null);
  }

  // Bao cát: gối căng (siêu-elip — mặt phẳng, mép bo tròn), đáy bẹp đè xuống, đầu buộc (+x) túm thót lại, mặt lùm xùm.
  // Nhiễu tính theo vị trí đỉnh -> đỉnh trùng ở đường nối cầu dịch giống nhau, không hở; pháp tuyến gộp theo vị trí cho
  // khỏi lằn đường nối
  function sandbagGeo(L, H, W, seed) {
    const g = new THREE.SphereGeometry(0.5, 16, 10);
    const p = g.attributes.position, v = new THREE.Vector3();
    const sp = (a, e) => Math.sign(a) * Math.pow(Math.abs(a) * 2, e) * 0.5;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      let x = sp(v.x, 0.4), y = sp(v.y, 0.65), z = sp(v.z, 0.45);
      if (y < 0) y *= 0.7;
      const tie = Math.max(0, (x - 0.28) / 0.22);
      y *= 1 - 0.4 * tie * tie; z *= 1 - 0.35 * tie * tie;
      const n = Math.sin(v.x * 23.1 + seed) * Math.sin(v.z * 17.3 + seed * 1.7) * 0.03 + Math.sin(v.y * 19.7 + v.x * 11.3 + seed * 2.3) * 0.02;
      p.setXYZ(i, x * L * (1 + n), y * H * (1 + n), z * W * (1 + n));
    }
    g.computeVertexNormals();
    const nr = g.attributes.normal, acc = new Map();
    const key = (i) => Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
    for (let i = 0; i < p.count; i++) {
      const k = key(i), a = acc.get(k) || [0, 0, 0];
      a[0] += nr.getX(i); a[1] += nr.getY(i); a[2] += nr.getZ(i);
      acc.set(k, a);
    }
    for (let i = 0; i < p.count; i++) {
      const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
      nr.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
    }
    return g;
  }

  // ---------------------------------------------------------------------------
  // "VẾT ĐỜI" CỦA TỪNG XE: bốc ngẫu nhiên một lần lúc dựng -> không xe nào giống xe nào.
  // Xe chi viện hỏa lực luôn đi đầu đội hình, húc chướng ngại, ăn RPG -> lồng thép móp, gạch ERA nổ dở dang.
  // ---------------------------------------------------------------------------
  function rollWear(rnd) {
    const side = () => (rnd() < 0.5 ? -1 : 1);
    const lostS = side(), lostI = 1 + Math.floor(rnd() * 3);
    // Gạch ERA đã kích nổ ở các trận trước, chưa kịp thay: còn đế cháy sém. Khóa "s:module:hàng:viên"
    const eraBlown = new Set();
    const nBlown = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < nBlown; k++) {
      eraBlown.add(`${side()}:${Math.floor(rnd() * 4)}:${Math.floor(rnd() * 2)}:${Math.floor(rnd() * 6)}`);
    }
    return {
      lostSkirt: { s: lostS, i: lostI },                                           // module váy bị giật mất hẳn
      tornRubber: { s: lostS, i: (lostI + 2) % 4 },                                // dải cao su mép váy rách
      bentSkirt: { s: -lostS, i: Math.floor(rnd() * 4), a: 0.1 + rnd() * 0.1 },    // module bên kia vểnh ra ngoài
      eraBlown,
      lampBroken: side(),       // cụm đèn pha vỡ bóng, khung bảo vệ cong
      cableLoose: side(),       // đầu cáp kéo tuột kẹp, thõng qua mép thân
      flapTorn: side(),         // chắn bùn sau bị rách
      binOpen: side(),          // nắp thùng đồ nóc sau đóng không kín
      patchSide: side(),        // tấm thép vá hàn trên hòm đạn
      smokeFired: side(),       // cụm phóng khói đã bắn
      cageWing: side(),         // cánh lồng chống RPG bên sườn bị va móp vào trong
      cageDent: { i: 1 + Math.floor(rnd() * 5), bay: Math.floor(rnd() * 4), d: 0.5 + rnd() * 0.4 },  // ô lồng đuôi bị ép võng
      cageGap: { i: Math.floor(rnd() * 7), x: Math.floor(rnd() * 4) },  // một đoạn thanh lồng bị xé mất
      turretSlat: Math.floor(rnd() * 4),                  // thanh lồng đuôi tháp bị cong
      linkMissing: Math.floor(rnd() * 6),                 // ô mắt xích dự phòng trống
      canMissing: Math.floor(rnd() * 3),                  // một can nhiên liệu đã dùng, chỉ còn dây giữ
      edgeChip: Math.floor(rnd() * 4),                    // đoạn lưỡi cắt lưỡi ủi bị mẻ / mòn
      jitter: () => (rnd() - 0.5)
    };
  }

  // Khung cục bộ tại c, xoay rot (Euler) -> hàm đổi điểm cục bộ sang tọa độ cha.
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
  // THÂN XE (ĐỘNG CƠ TRƯỚC)
  // ===========================================================================
  function buildHull(chassis, M, unit, wear) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;
    const J = wear.jitter;

    // Thân trên: mặt mũi đúc dày gần đứng -> giáp mũi trên thoải -> nóc phẳng -> đuôi vát. Mép vát lớn (thép đúc mài bo)
    hb.add(VehicleKit.sideProfile([
      [NOSE_Z + 0.3, SPONSON_Y - 0.4], [NOSE_Z - 0.5, NOSE_Y - 1.4], [NOSE_Z, NOSE_Y], [-14.5, ROOF_Y],
      [27.8, ROOF_Y], [29.4, 13.2], [29.4, SPONSON_Y]
    ], HULL_HALF_W * 2, 0.55), P);
    // Gờ mũi: dải thép đúc bo tròn chạy ngang mép trên khối mũi (đường gãy giữa mặt mũi & giáp mũi trên)
    hb.cyl(0.75, 0.75, HULL_HALF_W * 2 - 0.6, 14, P, [0, NOSE_Y - 0.35, NOSE_Z + 0.15], 'x');
    // Bồn thân dưới giữa hai dải xích: tấm mũi dưới dốc lên gặp khối mũi
    hb.add(VehicleKit.sideProfile([
      [NOSE_Z + 0.3, SPONSON_Y - 0.2], [-27.4, 4.3], [27.8, 4.3], [29.2, 6.2], [29.2, 9.8]
    ], 18.8, 0.3), M.paintDusty);
    // Vết đời trên khối mũi: 2 vết đạn nảy cày rãnh, muội loang, bùn bám chân mũi
    for (let k = 0; k < 2; k++) hb.box(1.2 + Math.abs(J()) * 1.4, 0.14, 0.06, M.steel, [J() * 20, NOSE_Y - 1.2 + J() * 1.2, NOSE_Z - 0.62], [0.06, 0, J() * 0.5]);
    hb.box(3.2, 1.2, 0.05, M.soot || D, [J() * 16, NOSE_Y - 1.0, NOSE_Z - 0.6], [0.06, 0, 0]);
    hb.box(18.4, 0.7, 0.08, M.paintDusty, [0, SPONSON_Y - 0.1, NOSE_Z + 0.05], [0.25, 0, 0]);

    // Mắt xích dự phòng treo trên giáp mũi (vừa là giáp bổ sung). Một ô trống — mắt đã tháo ra thay ngoài thực địa
    // chưa bù lại; các mắt còn lại treo lệch, xô nghiêng theo thanh giữ
    hb.setTag('spareTrack');
    for (let i = 0; i < 6; i++) {
      if (i === wear.linkMissing) continue;
      const z = -27.4 + J() * 0.35;
      const rot = [-GLACIS_ANGLE, J() * 0.06, J() * 0.05];
      const L = frameAt([-11.0 + i * 4.4 + J() * 0.4, glacisY(z) + 0.32, z], rot);
      hb.box(3.9, 0.55, 1.6, M.track, L(0, 0, 0), rot);
      hb.box(1.4, 0.3, 1.0, M.rubber, L(-0.9, 0.36, 0), rot);
      hb.box(1.4, 0.3, 1.0, M.rubber, L(0.9, 0.36, 0), rot);
    }
    hb.box(27, 0.25, 0.3, D, [0, glacisY(-26.3) + 0.4, -26.3], [-GLACIS_ANGLE, 0, 0]);
    hb.setTag(null);

    // Đèn pha hai góc mũi có khung bảo vệ. Một cụm đã bị va (cành cây, tường): bóng lớn vỡ còn hốc tối,
    // khung bảo vệ cong oằn vào trong
    for (const s of [-1, 1]) {
      const x = s * 12.6, z = -28.9, y = glacisY(z) + 0.8;
      const broken = wear.lampBroken === s;
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(2.4, 1.4, 1.3, D, [x, y, z], [0, broken ? s * 0.06 : 0, 0]);
      if (broken) {
        hb.cyl(0.48, 0.48, 0.12, 12, M.soot, [x - s * 0.5, y + 0.1, z - 0.62], 'z');
        hb.box(0.32, 0.18, 0.05, M.lens, [x - s * 0.72, y - 0.2, z - 0.68], [0, 0, 0.7]);   // mảnh kính sót ở mép chóa
        hb.beam([x - s * 1.45, y - 0.25, z - 1.1], [x - s * 1.3, y + 0.9, z - 0.7], 0.16, 0.16, P);
        hb.beam([x - s * 1.3, y + 0.9, z - 0.7], [x + s * 1.45, y + 1.0, z - 1.05], 0.16, 0.16, P);
      } else {
        hb.cyl(0.48, 0.48, 0.2, 12, M.lens, [x - s * 0.5, y + 0.1, z - 0.7], 'z');
        hb.box(3.0, 0.16, 0.16, P, [x, y + 0.95, z - 1.1]);
        hb.box(0.16, 1.2, 0.16, P, [x - s * 1.45, y + 0.35, z - 1.1]);
      }
      hb.cyl(0.3, 0.3, 0.2, 10, M.lens, [x + s * 0.7, y + 0.1, z - 0.7], 'z');
      hb.box(0.16, 1.2, 0.16, P, [x + s * 1.45, y + 0.35, z - 1.1]);
      hb.cyl(0.18, 0.18, 0.9, 6, M.rubber, [x + s * 1.1, y - 0.35, z + 0.75], 'x');      // ống luồn dây điện đèn
      hb.setTag(null);
    }

    // Nắp lái xe phía trước trái + kính tiềm vọng
    hb.setTag('hatchDrv');
    hb.cyl(1.8, 1.9, 0.35, 18, P, [-7.6, ROOF_Y + 0.17, -11.6]);
    hb.box(1.1, 0.35, 0.7, D, [-7.6, ROOF_Y + 0.25, -9.7]);
    hb.setTag(null);
    for (const x of [-9.3, -7.6, -5.9]) {
      hb.box(1.1, 0.55, 0.7, D, [x, ROOF_Y + 0.15, -14.3]);
      hb.box(0.9, 0.32, 0.08, M.glass, [x, ROOF_Y + 0.25, -14.68], [-0.5, 0, 0]);
    }

    // Lưới hút gió động cơ trên nóc trước (phải lớn, trái nhỏ)
    const grille = (x0, x1, z0, z1) => {
      const cx = (x0 + x1) / 2, w = x1 - x0, cz = (z0 + z1) / 2, l = z1 - z0;
      hb.box(w, 0.12, l, D, [cx, ROOF_Y + 0.05, cz]);
      hb.box(w + 0.6, 0.4, 0.35, P, [cx, ROOF_Y + 0.2, z0 - 0.15]);
      hb.box(w + 0.6, 0.4, 0.35, P, [cx, ROOF_Y + 0.2, z1 + 0.15]);
      hb.box(0.35, 0.4, l + 0.6, P, [x0 - 0.15, ROOF_Y + 0.2, cz]);
      hb.box(0.35, 0.4, l + 0.6, P, [x1 + 0.15, ROOF_Y + 0.2, cz]);
      const n = Math.floor(l / 0.85);
      for (let i = 0; i < n; i++) {
        hb.box(w - 0.1, 0.06, 0.62, P, [cx, ROOF_Y + 0.22, z0 + 0.45 + i * 0.85], [0.55, 0, 0]);
      }
    };
    grille(1.2, 13.0, -13.4, -3.6);
    grille(-13.0, -3.4, -7.6, -3.6);
    for (const z of [-2.6]) hb.box(27, 0.06, 0.14, D, [0, ROOF_Y + 0.02, z]);

    // Cửa xả khí động cơ trên sườn phải phía trước; muội khói ám loang ra sau và lên mép nóc
    hb.box(0.4, 2.4, 6.4, M.soot, [HULL_HALF_W + 0.1, 12.2, -17.4]);
    for (let i = 0; i < 4; i++) hb.box(0.3, 0.12, 6.2, P, [HULL_HALF_W + 0.3, 11.3 + i * 0.6, -17.4], [0, 0, 0.5]);
    hb.box(0.06, 1.3, 4.2, M.soot, [HULL_HALF_W + 0.02, 12.9, -12.7], [0.12, 0, 0]);
    hb.box(1.6, 0.05, 5.0, M.soot, [HULL_HALF_W - 0.75, ROOF_Y + 0.01, -16.8], [0, 0.05, 0]);
    unit.exhaustLeft = new THREE.Object3D();
    unit.exhaustLeft.position.set(HULL_HALF_W + 1.0, 12.2, -19.0);
    unit.exhaustRight = new THREE.Object3D();
    unit.exhaustRight.position.set(HULL_HALF_W + 1.0, 12.2, -15.8);
    chassis.add(unit.exhaustLeft);
    chassis.add(unit.exhaustRight);

    // Nắp tổ lái phía sau, thùng đồ dọc nóc, can nhiên liệu, cáp kéo
    for (const s of [-1, 1]) {
      hb.setTag('hatchCrew' + (s < 0 ? 'L' : 'R'));
      hb.cyl(1.7, 1.8, 0.32, 16, P, [s * 5.4, ROOF_Y + 0.16, 21.6]);
      hb.box(0.9, 0.35, 0.5, D, [s * 5.4, ROOF_Y + 0.3, 23.4]);
      // Thùng đồ: thân hơi xô lệch trên giá; một thùng nắp đóng không kín (vênh hé, lòi mép bạt, khóa bung)
      hb.setTag('bin' + (s < 0 ? 'L' : 'R'));
      const binRot = [0, J() * 0.03, 0];
      hb.box(2.6, 2.2, 10.5, P, [s * 13.0, ROOF_Y + 1.1, 20.6], binRot);
      const open = wear.binOpen === s;
      if (open) {
        const lr = [0, binRot[1], s * 0.2];
        const F = frameAt([s * 11.7, ROOF_Y + 2.2, 20.6], lr);
        hb.box(2.7, 0.12, 10.6, P, F(s * 1.35, 0.06, 0), lr);
        hb.box(0.06, 0.7, 4.0, M.canvasDark, [s * 14.32, ROOF_Y + 2.05, 21.4], [0.04, 0, -s * 0.12]);
        hb.box(0.15, 0.6, 0.5, M.steel, [s * 14.45, ROOF_Y + 1.85, 23.6], [0, 0, -s * 0.55]);
      } else {
        hb.box(2.7, 0.08, 10.6, D, [s * 13.0, ROOF_Y + 1.65, 20.6], binRot);
      }
      hb.hinge([s * 11.7, ROOF_Y + 2.22, 20.6], 'z', 9.8, D, 0.13, 4);
      for (const z of [17.5, 23.6]) {
        if (open && z > 20) continue;
        hb.box(0.15, 0.6, 0.5, M.steel, [s * 14.36, ROOF_Y + 1.3, z]);
      }
      hb.setTag(null);
      // Cáp kéo thép dọc mép nóc: không bao giờ nằm thẳng tắp, hơi lượn giữa các kẹp; một bên đầu sau đã tuột kẹp,
      // bò ra mép nóc rồi thõng xuống hông xe, khuyết cáp treo lủng lẳng trên váy xích
      const x = s * 14.2, y = ROOF_Y + 0.3;
      const loose = wear.cableLoose === s;
      const pts = [[x, y, -14.0]];
      for (const z of [-11.0, -8, -2.5, 3]) pts.push([x + (z === -8 || z === 3 ? 0 : J() * 0.4), y, z]);
      if (loose) pts.push([x + J() * 0.3, y, 6.8], [s * 15.25, y - 0.05, 8.6], [s * 15.85, y - 1.0, 9.3], [s * 15.95, y - 2.5, 9.8]);
      else pts.push([x + J() * 0.35, y, 7.0], [x, y, 10.0]);
      rope(hb, pts, 0.28, M.steel, 8);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [x, y, -14.6], [Math.PI / 2, 0, 0]);
      if (loose) hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [s * 15.95, y - 3.25, 9.85], [0.1, Math.PI / 2, 0]);
      else hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [x, y, 10.6], [Math.PI / 2, 0, 0]);
      for (const z of [-8, 3]) hb.box(0.9, 0.55, 0.5, D, [x, ROOF_Y + 0.25, z]);
    }
    // Tay nắm leo lên nóc sau
    for (const s of [-1, 1]) hb.grabHandle([s * 9.5, ROOF_Y, 23.6], 'z', 2.6, 0.6, P);
    // Giá can nhiên liệu 3 ngăn bằng thép hàn: một can đã đổ vào xe, chỗ trống còn dây đai buông thõng; các can còn lại xô lệch
    hb.setTag('cans');
    hb.box(4.7, 0.14, 2.45, D, [-2.55, ROOF_Y + 0.08, 26.85]); // khay đáy đỡ 3 can
    hb.box(4.7, 0.45, 0.12, D, [-2.55, ROOF_Y + 0.30, 28.02]); // thành chắn sau khay
    hb.box(4.7, 0.45, 0.12, D, [-2.55, ROOF_Y + 0.30, 25.68]); // thành chắn trước khay
    for (const rx of [-4.82, -3.30, -1.82, -0.28]) {
      hb.box(0.10, 1.95, 0.22, D, [rx, ROOF_Y + 1.05, 25.74]); // trụ đứng ngăn can
      hb.box(0.10, 0.55, 2.45, D, [rx, ROOF_Y + 0.32, 26.85]); // vách ngăn đáy
    }
    for (let i = 0; i < 3; i++) {
      const cx = -4.0 + i * 1.45;
      if (i === wear.canMissing) {
        hb.box(0.12, 1.6, 0.06, M.canvasDark, [cx + 0.1, ROOF_Y + 1.25, 25.85], [0.15, 0, J() * 0.3]);
        hb.box(0.18, 0.22, 0.10, M.steel, [cx + 0.1, ROOF_Y + 0.48, 25.95], [0.2, 0, J() * 0.3]); // khóa cài đai treo lủng lẳng
        continue;
      }
      const jx = cx + J() * 0.1, jz = 26.9 + J() * 0.16;
      hb.jerrycan([jx, ROOF_Y + 1.54, jz], J() * 0.12, 1.3, 3.0, 2.2, i === 1 ? M.paintDusty : P, D);
      // Dây đai vải bạt + khóa gài thép buộc vòng qua thân can
      hb.box(0.22, 0.06, 2.32, M.canvasDark, [jx, ROOF_Y + 3.06, jz]);
      hb.box(0.22, 2.65, 0.06, M.canvasDark, [jx, ROOF_Y + 1.72, jz + 1.15]);
      hb.box(0.26, 0.32, 0.12, M.steel, [jx, ROOF_Y + 1.65, jz + 1.19]);
    }
    hb.box(4.65, 0.26, 0.26, D, [-2.55, ROOF_Y + 2.1, 25.74]);
    hb.setTag(null);

    // Lưới ngụy trang cuộn tròn buộc trên nóc sau bên phải: phồng xẹp không đều, thắt lại ở chỗ dây chằng
    hb.setTag('tarpRoll');
    const netCuts = [1.4, 3.3, 5.6, 7.7, 9.9], netStraps = [3.3, 7.7];
    for (let i = 0; i < netCuts.length - 1; i++) {
      const a = netCuts[i], c = netCuts[i + 1], mid = (a + c) / 2;
      const ra = netStraps.includes(a) ? 0.8 : 0.92 + J() * 0.16, rc = netStraps.includes(c) ? 0.8 : 0.92 + J() * 0.16;
      const rm = Math.max(ra, rc) + 0.06 + Math.abs(J()) * 0.16;
      hb.cyl(rm, ra, mid - a, 10, M.canvasDark, [(a + mid) / 2, ROOF_Y + 0.9, 26.6 + J() * 0.12], 'x');
      hb.cyl(rc, rm, c - mid, 10, M.canvasDark, [(mid + c) / 2, ROOF_Y + 0.9, 26.6 + J() * 0.12], 'x');
    }
    for (const x of netStraps) {
      hb.add(new THREE.TorusGeometry(0.82, 0.07, 4, 14), M.canvas, [x, ROOF_Y + 0.9, 26.6], [0, Math.PI / 2, 0]);
    }
    // mép lưới bung ra khỏi cuộn, rủ xuống mặt nóc
    hb.box(2.4, 0.06, 1.2, M.canvasDark, [9.2, ROOF_Y + 0.08, 27.25], [0.03, 0.3, 0.04]);
    hb.setTag(null);

    // Tấm đuôi: cửa sau tổ lái, bản lề, đèn hậu, móc kéo
    hb.box(8.4, 7.6, 0.3, P, [0, 9.4, 29.55]);
    hb.box(8.6, 0.08, 0.36, D, [0, 13.2, 29.56]);
    for (const y of [7.0, 11.8]) hb.box(0.6, 1.0, 0.5, D, [-4.4, y, 29.6]);
    hb.box(0.3, 1.4, 0.3, M.steel, [3.2, 9.6, 29.8]);
    for (const s of [-1, 1]) {
      hb.box(1.8, 1.0, 0.5, D, [s * 13.4, 12.3, 29.6]);
      hb.box(0.7, 0.55, 0.12, M.tailLens, [s * 13.8, 12.35, 29.88]);
      hb.box(0.5, 0.4, 0.12, M.lens, [s * 12.9, 12.35, 29.88]);
      hb.box(1.6, 1.2, 1.0, M.paintDusty, [s * 7.0, 6.2, 29.3]);
      hb.add(new THREE.TorusGeometry(0.7, 0.2, 6, 12, Math.PI * 1.3), M.steel, [s * 7.0, 5.4, 29.9], [0, Math.PI / 2, Math.PI * 0.85]);
      hb.box(1.8, 1.3, 1.2, M.paintDusty, [s * 6.5, 6.7, -29.3]);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12, Math.PI * 1.3), M.steel, [s * 6.5, 5.8, -30.0], [0, Math.PI / 2, Math.PI * 0.85]);
    }

    // Lồng thép chống đạn RPG bao đuôi xe. Lồng thật không bao giờ thẳng thớm: một ô bị đạn / va đập ép võng vào
    // trong (kéo theo hai thanh kề), một đoạn thanh bị xé mất còn hai mẩu gãy vểnh ra, một cánh sườn bị đâm móp
    const slatZ = 33.0, sy0 = 5.8, sy1 = 13.8;
    const bayX = [-14.8, -7.4, 0, 7.4, 14.8];
    const dent = wear.cageDent, gap = wear.cageGap;
    hb.setTag('cageRear');
    for (const x of bayX) {
      hb.box(0.35, sy1 - sy0 + 0.4, 0.35, D, [x, (sy0 + sy1) / 2, slatZ]);
    }
    for (const x of [-13.6, -5.2, 5.2, 13.6]) {
      for (const y of [7.0, 12.6]) hb.beam([x, y, 29.4], [x, y, slatZ], 0.3, 0.3, D);
    }
    for (let i = 0; i < 7; i++) {
      const y = sy0 + 0.4 + i * 1.25, z = slatZ - 0.1;
      for (let k = 0; k < 4; k++) {
        const x0 = bayX[k], x1 = bayX[k + 1];
        if (gap.i === i && gap.x === k) {
          hb.beam([x0, y, z], [x0 + 1.1, y + J() * 0.4, z + 0.45], 0.7, 0.2, D);
          hb.beam([x1, y, z], [x1 - 0.8, y + J() * 0.4, z + 0.35], 0.7, 0.2, D);
          continue;
        }
        const depth = dent.bay !== k ? 0 : dent.i === i ? dent.d : Math.abs(dent.i - i) === 1 ? dent.d * 0.45 : 0;
        if (depth > 0) {
          const kink = [(x0 + x1) / 2 + J() * 1.6, y - depth * 0.3, z - depth];
          hb.beam([x0, y, z], kink, 0.7, 0.2, D);
          hb.beam(kink, [x1, y, z], 0.7, 0.2, D);
        } else {
          // nan chia khúc ngắn: bị bắn thì móp / xé tại chỗ (vehicle_damage.js dentCage)
          for (let q = 0; q < 5; q++) hb.box((x1 - x0) / 5 + 0.02, 0.7, 0.2, D, [x0 + (x1 - x0) * (q + 0.5) / 5, y, z]);
        }
      }
    }
    for (const s of [-1, 1]) {
      // Hai cánh lồng bên sườn sau; cánh bị móp: cột ngoài bị ép xiên vào trong, thanh dưới móp nặng hơn thanh trên
      const pushed = wear.cageWing === s;
      const outX = (y) => s * (16.4 - (pushed ? 0.9 * (sy1 + 0.2 - y) / (sy1 - sy0 + 0.4) : 0));
      if (pushed) hb.beam([outX(sy1 + 0.2), sy1 + 0.2, 26.8], [outX(sy0 - 0.2), sy0 - 0.2, 27.2], 0.35, 0.35, D);
      else hb.box(0.35, sy1 - sy0 + 0.4, 0.35, D, [s * 16.4, (sy0 + sy1) / 2, 26.8]);
      hb.beam([s * 14.8, 13.2, slatZ], [outX(13.2), 13.2, 26.8], 0.3, 0.3, D);
      hb.beam([s * 14.8, 7.2, slatZ], [outX(7.2), 7.2, pushed ? 27.1 : 26.8], 0.3, 0.3, D);
      for (let i = 0; i < 7; i++) {
        const y = sy0 + 0.4 + i * 1.25;
        const p0 = [outX(y), y, pushed ? 26.8 + (1 - i / 6) * 0.35 : 26.8], p1 = [s * 14.9, y, slatZ - 0.2];
        const at = (k) => [p0[0] + (p1[0] - p0[0]) * k, y, p0[2] + (p1[2] - p0[2]) * k];
        for (let q = 0; q < 4; q++) hb.beam(at(q / 4), at((q + 1) / 4), 0.2, 0.7, D);
      }
    }
    hb.setTag(null);

    // Váy xích module dày gắn gạch giáp phản ứng nổ
    for (const s of [-1, 1]) {
      const z0 = -29.0, z1 = 26.4, n = 4;
      const seg = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        const a = z0 + i * seg + 0.1, b = a + seg - 0.2, zc = (a + b) / 2;
        const sideL = s < 0 ? 'L' : 'R';
        if (wear.lostSkirt.s === s && wear.lostSkirt.i === i) {
          // Module bị giật mất hẳn trong trận trước (cả gạch ERA trên nó): lộ bánh chịu tải, trên thanh treo chỉ
          // còn chân bu-lông gãy và một mẩu tấm rách nham nhở ở mép trước
          for (let k = 0; k < 5; k++) if (k !== 2) hb.cyl(0.12, 0.12, 0.5, 6, M.steel, [s * 15.6, 9.9, a + 1.0 + k * (seg - 2.2) / 4], 'x');
          hb.add(VehicleKit.sideProfile([[a, 10.3], [a, 8.4], [a + 0.7, 8.9], [a + 1.2, 8.5], [a + 1.9, 10.3]], 0.9, 0.05), P, [s * 15.85, 0, 0]);
          continue;
        }
        const pts = i === 0
          ? [[a, 10.3], [a, 7.8], [a + 2.2, 4.7], [b, 4.7], [b, 10.3]]
          : [[a, 10.3], [a, 4.7], [b, 4.7], [b, 10.3]];
        // Module bị va (đá, gốc cây, xác xe): vểnh mép dưới ra ngoài và hơi vặn — xoay quanh mép treo trên;
        // gạch ERA trên đó nghiêng theo
        const bend = (wear.bentSkirt.s === s && wear.bentSkirt.i === i) ? wear.bentSkirt.a : 0;
        const rot = bend ? [J() * 0.06, s * 0.04, s * bend] : [0, 0, 0];
        const F = frameAt([s * 15.95, 10.3, zc], rot);
        hb.setTag('skirt' + sideL + i);
        const plate = VehicleKit.sideProfile(pts, 1.2, 0.1);
        plate.translate(0, -10.3, -zc);
        hb.add(plate, P, F(0, 0, 0), rot);
        // Dải cao su mép dưới; một module rách mất nửa sau, mẩu còn lại thõng xiên
        if (wear.tornRubber.s === s && wear.tornRubber.i === i) {
          hb.box(0.5, 0.7, (seg - 0.4) * 0.45, M.rubber, F(0, -5.95, -(seg - 0.4) * 0.27), rot);
          hb.box(0.45, 1.0, (seg - 0.4) * 0.16, M.rubber, F(s * 0.15, -6.3, 0.2), [rot[0] + 0.5, rot[1] + s * 0.2, rot[2]]);
        } else {
          hb.box(0.5, 0.7, seg - 0.4, M.rubber, F(0, -5.95, 0), rot);
        }
        // 2 hàng gạch ERA trên nửa trên module. Viên đã kích nổ ở trận trước: chỉ còn đế thép cháy sém,
        // mép nắp rách cong (đế gắn vào váy, không còn là gạch nổ được)
        const tiles = Math.floor((b - a - 0.4) / 2.15);
        const live = [];
        for (let r = 0; r < 2; r++) {
          for (let k = 0; k < tiles; k++) {
            const z = a + 0.3 + 1.05 + k * 2.15;
            if (i === 0 && r === 0 && z < a + 2.4) continue;
            const y = 7.4 + r * 1.75;
            if (wear.eraBlown.has(`${s}:${i}:${r}:${k}`)) {
              hb.box(0.16, 1.55, 1.95, M.soot, F(s * 0.68, y - 10.3, z - zc), rot);
              hb.box(0.1, 0.5, 1.2, P, F(s * 0.95, y - 10.3 + 0.7, z - zc + J() * 0.4), [rot[0] + J() * 0.4, rot[1], rot[2] + s * 0.6]);
            } else {
              live.push([y, z]);
            }
          }
        }
        hb.setTag('era' + sideL + i);
        for (const [y, z] of live) {
          // gạch thay mới ngoài thực địa lắp không phẳng hàng, mỗi viên lệch một chút
          const tr = [rot[0] + J() * 0.04, rot[1] + J() * 0.03, rot[2]];
          hb.box(0.5, 1.6, 2.0, P, F(s * 0.85, y - 10.3 + J() * 0.08, z - zc), tr);
          hb.cyl(0.14, 0.14, 0.2, 6, D, F(s * 1.13, y - 10.3, z - zc), 'x', rot);
        }
        hb.setTag(null);
      }
      hb.box(0.6, 0.4, 55.8, P, [s * 15.75, 10.45, -1.3]);
    }

    // (lưỡi ủi / khiên chữ V trước mũi: ô MŨI XE — mountFront, dựng thành cụm riêng)

    // Tay đòn treo, giá bánh dẫn hướng, hộp truyền lực cuối phía trước
    for (const s of [-1, 1]) {
      for (const z of WHEEL_Z) hb.box(1.1, 0.95, 3.6, D, [s * 10.1, WHEEL_Y + 0.75, z + 1.5], [0.35, 0, 0]);
      hb.cyl(1.8, 2.0, 1.6, 14, M.paintDusty, [s * 9.9, SPROCKET.y, SPROCKET.z], 'x');
      hb.box(1.2, 1.4, 4.2, D, [s * 10.1, IDLER.y + 0.6, IDLER.z - 2.0], [-0.4, 0, 0]);
    }

    const meshes = hb.build(chassis, [0, 10, 0]);
    unit.hullMainMesh = meshes.get(P);
  }

  // ===========================================================================
  // HỆ THỐNG DI CHUYỂN
  // ===========================================================================
  function buildRunningGear(chassis, M) {
    const halfSpan = TRACK_W / 2;

    // Bánh chịu tải kép đường kính lớn, đĩa thép đúc có lỗ giảm trọng
    const roadPositions = [];
    for (const s of [-1, 1]) for (const z of WHEEL_Z) roadPositions.push({ x: s * TRACK_X, y: WHEEL_Y, z });
    const roadWheels = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.6, 1.6]) {
        b.cyl(WHEEL_R, WHEEL_R, 2.0, 24, M.rubber, [off, 0, 0], 'x');
        b.cyl(2.6, 2.6, 2.1, 24, M.paintDusty, [off, 0, 0], 'x');
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        b.cyl(0.42, 0.42, 0.12, 10, M.dark, [2.67, Math.cos(a) * 1.65, Math.sin(a) * 1.65], 'x');
      }
      b.cyl(1.0, 1.15, 0.5, 12, M.steel, [2.85, 0, 0], 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cyl(0.12, 0.12, 0.3, 6, M.dark, [3.1, Math.cos(a) * 0.68, Math.sin(a) * 0.68], 'x');
      }
    }, roadPositions, WHEEL_R);

    // Bánh sao chủ động phía trước
    const sprockets = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.75, 1.75]) {
        b.cyl(2.45, 2.45, 0.85, 22, M.paintDusty, [off, 0, 0], 'x');
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          b.box(0.8, 0.85, 0.72, M.steel, [off, Math.cos(a) * 2.65, Math.sin(a) * 2.65], [a, 0, 0]);
        }
      }
      b.cyl(1.7, 1.7, 2.7, 16, M.paintDusty, [0, 0, 0], 'x');
      b.cyl(1.15, 1.35, 0.6, 12, M.steel, [2.4, 0, 0], 'x');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.cyl(0.14, 0.14, 0.3, 6, M.dark, [2.7, Math.cos(a) * 0.85, Math.sin(a) * 0.85], 'x');
      }
    }, [{ x: -TRACK_X, y: SPROCKET.y, z: SPROCKET.z }, { x: TRACK_X, y: SPROCKET.y, z: SPROCKET.z }], SPROCKET.r + LINK_IN);

    // Bánh dẫn hướng phía sau
    const idlers = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.6, 1.6]) {
        b.cyl(IDLER.r, IDLER.r, 1.9, 22, M.paintDusty, [off, 0, 0], 'x');
        b.cyl(IDLER.r + 0.02, IDLER.r + 0.02, 0.3, 22, M.steel, [off + 0.8, 0, 0], 'x');
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.4, 0.4, 0.1, 10, M.dark, [2.6, Math.cos(a) * 1.5, Math.sin(a) * 1.5], 'x');
      }
      b.cyl(0.8, 0.9, 0.6, 12, M.steel, [2.7, 0, 0], 'x');
    }, [{ x: -TRACK_X, y: IDLER.y, z: IDLER.z }, { x: TRACK_X, y: IDLER.y, z: IDLER.z }], IDLER.r + LINK_IN);

    const topIn = (z) => {
      const k = (z - SPROCKET.z) / (IDLER.z - SPROCKET.z);
      return (SPROCKET.y + SPROCKET.r) + ((IDLER.y + IDLER.r) - (SPROCKET.y + SPROCKET.r)) * k;
    };
    const rollerPositions = [];
    for (const s of [-1, 1]) {
      for (const z of RETURN_ROLLER_Z) rollerPositions.push({ x: s * TRACK_X, y: topIn(z) - RETURN_ROLLER_R - 0.02, z });
    }
    const returnRollers = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.3, 1.3]) b.cyl(RETURN_ROLLER_R, RETURN_ROLLER_R, 1.4, 14, M.rubber, [off, 0, 0], 'x');
      b.cyl(0.55, 0.55, 4.0, 10, M.steel, [0, 0, 0], 'x');
    }, rollerPositions, RETURN_ROLLER_R);

    // Xích hạng nặng: mắt xích thép đúc có gân bám, 2 răng dẫn hướng
    const tracks = new VehicleKit.TrackSystem(chassis, {
      circles: [
        { u: SPROCKET.z, v: SPROCKET.y, r: SPROCKET.r + LINK_IN },
        { u: WHEEL_Z[0], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: WHEEL_Z[WHEEL_Z.length - 1], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: IDLER.z, v: IDLER.y, r: IDLER.r + LINK_IN }
      ],
      sidesX: [-TRACK_X, TRACK_X],
      pitch: 1.6,
      buildLink: (b, pitch) => {
        b.box(TRACK_W - 0.2, 0.6, pitch * 0.82, M.track, [0, 0, 0]);
        b.box(TRACK_W - 0.6, 0.32, pitch * 0.3, M.track, [0, 0.45, -pitch * 0.12]);
        b.box(0.5, 0.56, 0.62, M.steel, [-halfSpan - 0.05, 0, pitch / 2]);
        b.box(0.5, 0.56, 0.62, M.steel, [halfSpan + 0.05, 0, pitch / 2]);
        b.box(0.5, 0.5, 0.6, M.track, [0, 0, pitch / 2]);
        b.box(0.55, 1.2, pitch * 0.42, M.track, [0, -0.88, 0]);
      }
    });

    return { tracks, wheelSets: [roadWheels, sprockets, idlers, returnRollers] };
  }

  // ===========================================================================
  // THÁP PHÁO THẤP + 2 HÒM ĐẠN + MÁNG TIẾP ĐẠN
  // ===========================================================================
  function buildTurret(chassis, M, unit, rnd, wear) {
    const J = wear.jitter;
    const turret = new THREE.Group();
    turret.position.set(0, ROOF_Y, 5.0);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(ROOF_Y);
    const P = M.paint, D = M.dark;
    const TROOF = 5.6;

    tb.cyl(9.0, 9.2, 0.6, 32, D, [0, 0.3, 0]);

    // Thân tháp vát đa diện
    tb.add(VehicleKit.loft(
      [[-8.6, -10], [8.6, -10], [10.4, -7], [10.4, 8.5], [8.8, 12], [-8.8, 12], [-10.4, 8.5], [-10.4, -7]],
      [[-7.8, -8.6], [7.8, -8.6], [9.6, -6.2], [9.6, 8.0], [8.2, 11.4], [-8.2, 11.4], [-9.6, 8.0], [-9.6, -6.2]],
      0.5, TROOF
    ), P);

    // Khối giáp bổ sung mặt trước hai bên hộp pháo
    for (const s of [-1, 1]) {
      const pts = [[s * 3.9, -10.1], [s * 9.0, -10.1], [s * 9.0, -11.3], [s * 4.6, -12.6]];
      tb.setTag('cheek' + (s < 0 ? 'L' : 'R'));
      tb.add(VehicleKit.loft(pts, pts, 0.8, [5.0, 5.0, 4.6, 3.9]), P);
      for (let i = 0; i < 3; i++) {
        const k = (i + 0.5) / 3;
        tb.cyl(0.18, 0.18, 0.2, 6, D, [s * (9.0 + (4.6 - 9.0) * k), 4.6 + (3.9 - 4.6) * k - 0.2, -11.3 + (-12.6 + 11.3) * k]);
      }
      tb.setTag(null);
    }

    // (2 hòm đạn hai bên tháp + máng tiếp đạn: ô HỘP ĐẠN — mountMag, dựng thành cụm riêng theo cỡ băng)

    // Kính ngắm pháo thủ (trước trái) có cửa chớp giáp, mí che mưa và cần gạt nước
    tb.setTag('opticGunner');
    tb.box(3.0, 2.0, 3.2, P, [-5.6, TROOF + 1.0, -6.0]);
    tb.box(3.2, 0.14, 3.4, D, [-5.6, TROOF + 2.05, -6.05]);
    tb.box(2.5, 0.12, 0.45, P, [-5.6, TROOF + 1.72, -7.78], [0.18, 0, 0]);
    tb.box(2.2, 0.9, 0.12, M.glass, [-5.6, TROOF + 1.2, -7.65]);
    tb.box(0.08, 0.82, 0.08, D, [-5.6, TROOF + 1.2, -7.72]);
    tb.strut([-6.2, TROOF + 1.65, -7.73], [-6.55, TROOF + 0.95, -7.73], 0.04, D, 4);
    tb.box(1.2, 1.4, 0.14, P, [-7.0, TROOF + 1.3, -7.9], [0, 0.7, 0]);
    tb.box(1.2, 1.4, 0.14, P, [-4.2, TROOF + 1.3, -7.9], [0, -0.7, 0]);
    tb.setTag('searchlight');

    // Đèn chiếu hồng ngoại / ánh sáng trắng có cửa chớp, gân tản nhiệt và cáp nguồn (trước phải)
    tb.box(1.4, 1.0, 1.6, D, [6.4, TROOF + 0.5, -6.8]);
    tb.cyl(1.15, 1.15, 2.2, 16, P, [6.4, TROOF + 1.9, -7.0], 'z');
    for (const zf of [-6.4, -7.0, -7.6]) tb.cyl(1.21, 1.21, 0.10, 16, D, [6.4, TROOF + 1.9, zf], 'z'); // đai tản nhiệt thân đèn
    tb.cyl(0.95, 0.95, 0.1, 16, M.lens, [6.4, TROOF + 1.9, -8.12], 'z');
    tb.box(2.6, 0.2, 0.2, D, [6.4, TROOF + 3.1, -8.1]);
    tb.strut([5.5, TROOF + 1.7, -6.6], [5.8, TROOF + 0.3, -6.2], 0.06, M.rubber, 5); // cáp điện đèn pha
    tb.setTag(null);

    // Kính toàn cảnh trưởng xe trên trụ (đầu xoay quét 2 kênh ngày/nhiệt)
    tb.cyl(0.85, 1.0, 2.2, 12, P, [5.8, TROOF + 1.1, 1.6]);
    tb.cyl(1.12, 1.12, 0.20, 12, D, [5.8, TROOF + 0.10, 1.6]);
    const periHead = new THREE.Group();
    periHead.position.set(5.8, TROOF + 2.95, 1.6);
    const ph = new VehicleKit.PartBatch(ROOF_Y + TROOF + 2.95);
    ph.box(2.2, 1.5, 2.2, P, [0, 0, 0]);
    ph.box(1.5, 0.7, 0.1, M.glass, [0, 0.1, -1.13]);
    ph.box(0.07, 0.72, 0.11, D, [0.12, 0.1, -1.14]);
    ph.cyl(0.26, 0.26, 0.12, 10, M.lens, [-0.38, 0.1, -1.13], 'z');
    ph.box(1.75, 0.11, 0.35, D, [0, 0.52, -1.20], [0.2, 0, 0]);
    ph.box(2.4, 0.18, 2.4, D, [0, 0.8, 0]);
    ph.build(periHead);
    turret.add(periHead);
    VehicleKit.registerPartGroup(unit, 'opticCdr', periHead);

    for (const s of [-1, 1]) tb.grabHandle([s * 8.6, TROOF, 4.0], 'z', 2.6, 0.55, P);

    // Nắp tháp, tấm nhận diện phe, cảm biến gió, ăng-ten
    tb.setTag('hatchCdr');
    tb.cyl(1.85, 1.95, 0.32, 18, P, [-4.8, TROOF + 0.16, 5.2]);
    tb.box(0.9, 0.35, 0.5, D, [-4.8, TROOF + 0.3, 7.1]);
    tb.setTag(null);
    // Tấm vải nhận diện phe: buộc vội, lệch, một góc gió lật gập lên
    tb.box(4.6, 0.08, 3.2, M.idPanel, [1.6, TROOF + 0.06, 7.6], [0, -0.05 + J() * 0.12, 0]);
    tb.box(1.2, 0.06, 0.9, M.idPanel, [3.55, TROOF + 0.28, 9.0], [0.35, -0.8, -0.5]);
    for (const [x, z] of [[-0.6, 6.1], [3.8, 6.2], [-0.5, 9.1]]) tb.box(0.3, 0.14, 0.3, M.canvasDark, [x, TROOF + 0.14, z]);
    // Mũ sắt kíp xe bỏ quên trên nóc cạnh nắp chỉ huy (phía sau nắp: chỗ nóc trái giữa dành cho bệ phóng APS / radar mua thêm)
    const helmet = new THREE.SphereGeometry(0.78, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    tb.add(helmet, M.canvasDark, [-7.6, TROOF + 0.05, 7.6], [0.18, 0, -0.12]);
    tb.add(new THREE.TorusGeometry(0.76, 0.05, 4, 16), M.canvasDark, [-7.6, TROOF + 0.06, 7.6], [Math.PI / 2 + 0.18, 0, -0.12]);
    tb.cyl(0.12, 0.14, 2.4, 6, D, [-1.8, TROOF + 1.2, 9.8]);
    tb.box(1.3, 0.12, 0.12, D, [-1.8, TROOF + 2.4, 9.8]);
    const ant = new VehicleKit.AntennaSet(D, turret);
    for (const s of [-1, 1]) {
      tb.cyl(0.45, 0.5, 0.7, 8, D, [s * 7.0, TROOF + 0.35, 10.2]);
      // Hai roi ăng-ten mỗi roi ngả một kiểu, dài ngắn khác nhau (một roi đã gãy ngọn, nối lại ngắn hơn)
      ant.add([s * 7.0, TROOF + 0.7, 10.2], s < 0 ? 14 : 11.5, { tilt: [0.12 + J() * 0.06, s * 0.03 + J() * 0.05], r0: 0.09, r1: 0.05 });
      tb.box(0.3, 0.5, 0.3, M.rubber, [s * 7.0, TROOF + 0.95, 10.2]);
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // Ống phóng lựu đạn khói 3 ống mỗi bên ở góc sau tháp, miệng ống có nắp cao su chống bụi, chân ống có hộp đấu dây điểm hỏa.
    // Bên đã bắn: nắp bị thổi bay, miệng ống ám muội, một nắp còn treo lủng lẳng trên dây giữ
    for (const s of [-1, 1]) {
      tb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      tb.box(0.45, 1.3, 3.4, P, [s * 9.95, 4.5, 8.8], [0, s * -0.25, 0]);
      tb.box(0.32, 0.38, 0.55, D, [s * 10.1, 4.05, 10.2], [0, s * -0.25, 0]); // hộp điện điểm hỏa
      const rot = [-0.35, 0, -s * 0.85];
      const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      const fired = wear.smokeFired === s;
      for (let i = 0; i < 3; i++) {
        const c = [s * 10.5, 5.0, 7.7 + i * 1.05];
        const at = (d) => [c[0] + ax.x * d, c[1] + ax.y * d, c[2] + ax.z * d];
        tb.cyl(0.4, 0.4, 1.6, 10, D, c, 'y', rot);
        tb.cyl(0.44, 0.44, 0.15, 10, P, at(-0.42), 'y', rot); // đai kẹp ống
        tb.strut(at(-0.72), [s * 10.05, 4.25, 7.75 + i * 1.0], 0.035, M.rubber, 4); // dây điện điểm hỏa
        if (fired && i !== 2) {
          tb.cyl(0.3, 0.3, 0.06, 10, M.soot, at(0.79), 'y', rot);
          if (i === 0) {
            const h = at(0.55);
            tb.strut(h, [h[0] + s * 0.15, h[1] - 0.85, h[2] - 0.1], 0.03, M.rubber, 4);
            tb.cyl(0.44, 0.44, 0.2, 10, M.rubber, [h[0] + s * 0.2, h[1] - 1.0, h[2] - 0.12], 'y', [1.3, 0, s * 0.3]);
          }
        } else {
          tb.cyl(0.44, 0.44, 0.2, 10, M.rubber, at(0.85), 'y', rot);
        }
      }
      tb.setTag(null);
    }

    // Lồng thép chống RPG sau đuôi tháp (một thanh bị va võng vào trong)
    const cz = 14.6;
    tb.setTag('cageTurret');
    for (const x of [-8.4, 0, 8.4]) tb.box(0.3, 4.4, 0.3, D, [x, 3.2, cz]);
    for (const x of [-6.0, 6.0]) for (const y of [1.6, 4.8]) tb.beam([x, y, 11.6], [x, y, cz], 0.26, 0.26, D);
    for (let i = 0; i < 4; i++) {
      const y = 1.6 + i * 1.1;
      if (i === wear.turretSlat) {
        const kink = [J() * 6, y - 0.15, cz - 0.55 - Math.abs(J()) * 0.4];
        tb.beam([-8.5, y, cz - 0.08], kink, 0.6, 0.18, D);
        tb.beam(kink, [8.5, y, cz - 0.08], 0.6, 0.18, D);
      } else {
        for (let q = 0; q < 10; q++) tb.box(1.72, 0.6, 0.18, D, [-8.5 + 1.7 * (q + 0.5), y, cz - 0.08]);
      }
    }
    tb.setTag(null);

    // Lồng đuôi tháp nhồi đồ như xe thật sau vài tuần ngoài thực địa: cuộn bạt, ba lô, thùng gỗ đạn,
    // đồ lòi lên khỏi lồng, dây chằng chéo
    tb.setTag('stowage');
    tb.box(16.6, 0.2, 2.6, D, [0, 1.1, 13.3]);
    const cuts = [-7.6, -5.4, -2.6, 0.2, 2.8], straps = [-5.4, 0.2];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], c = cuts[i + 1], mid = (a + c) / 2;
      const ra = straps.includes(a) ? 0.9 : 1.0 + rnd() * 0.12, rc = straps.includes(c) ? 0.9 : 1.0 + rnd() * 0.12;
      const rm = Math.max(ra, rc) + 0.04 + rnd() * 0.1, dz = J() * 0.15;
      tb.cyl(rm, ra, mid - a, 12, M.canvas, [(a + mid) / 2, 2.25, 13.15 + dz], 'x');
      tb.cyl(rc, rm, c - mid, 12, M.canvas, [(mid + c) / 2, 2.25, 13.15 + dz], 'x');
    }
    for (const x of straps) tb.add(new THREE.TorusGeometry(0.92, 0.07, 4, 14), M.canvasDark, [x, 2.25, 13.15], [0, Math.PI / 2, 0]);
    // ba lô nhét trên cuộn bạt, lòi khỏi mép lồng
    tb.box(2.2, 1.6, 1.5, M.canvasDark, [-4.4, 3.95, 13.2], [0.1, 0.3, -0.14]);
    tb.box(1.4, 0.85, 0.45, M.canvasDark, [-4.3, 3.75, 14.0], [0.1, 0.3, -0.14]);
    // thùng gỗ đạn chồng lệch bên phải
    tb.box(2.6, 1.4, 2.0, M.wood, [5.2, 1.95, 13.3], [0, -0.12, 0.03]);
    tb.box(2.3, 1.2, 1.8, M.wood, [5.0, 3.25, 13.2], [0.05, 0.2, -0.05]);
    tb.box(2.35, 0.06, 1.85, M.dark, [5.0, 3.25, 13.2], [0.05, 0.2, -0.05]);
    // túi đồ dã chiến nhét khe giữa
    tb.box(2.0, 1.3, 1.7, M.canvasDark, [1.9, 1.85, 13.4], [0, 0.15, 0.04]);
    // dây chằng chéo qua đống đồ, đầu buộc vào khung lồng
    rope(tb, [[-8.4, 4.9, cz - 0.2], [-4.0, 4.85, 13.6], [0.5, 3.4, 13.3], [5.0, 3.95, 13.4], [8.4, 4.9, cz - 0.2]], 0.07, M.canvasDark, 4);
    tb.setTag(null);

    // --- Chi tiết bề mặt: bu-lông, mối hàn, móc cẩu, đường ghép nóc (gân / bu-lông hòm đạn: mountMag) ---
    for (const s of [-1, 1]) {
      // Mép nóc - hông tháp: mối hàn + hàng bu-lông nóc
      tb.weld([s * 9.55, TROOF + 0.02, -6.0], [s * 9.55, TROOF + 0.02, 7.8], P);
      tb.boltRow([s * 8.8, TROOF, -5.6], [s * 8.8, TROOF, 9.6], 10, 'y', D, 0.14);
      // Móc cẩu nóc trước / sau
      for (const z of [-7.6, 10.6]) {
        tb.box(0.9, 0.3, 0.55, P, [s * 7.4, TROOF + 0.13, z]);
        tb.add(new THREE.TorusGeometry(0.46, 0.15, 5, 10), M.steel, [s * 7.4, TROOF + 0.45, z], [0, Math.PI / 2, 0]);
      }
      // Mối hàn chân khối giáp bổ sung mặt trước
      tb.weld([s * 4.0, 5.02, -10.0], [s * 8.9, 5.02, -10.0], P, 0.1);
    }
    // Nóc: đường ghép ngang, nấm thông gió
    tb.seam([-7.6, TROOF + 0.02, -2.2], [7.6, TROOF + 0.02, -2.2], [0, 1, 0], D);
    tb.seam([-8.0, TROOF + 0.02, 9.4], [8.0, TROOF + 0.02, 9.4], [0, 1, 0], D);
    tb.cyl(0.5, 0.55, 0.55, 12, P, [-1.4, TROOF + 0.27, 1.0]);
    tb.cyl(1.05, 0.85, 0.32, 14, P, [-1.4, TROOF + 0.68, 1.0]);
    // Mặt sau tháp: hàng bu-lông tấm đuôi
    tb.boltRow([-7.6, 3.0, 11.75], [7.6, 3.0, 11.75], 10, 'z', D, 0.15, 1);

    tb.build(turret);

    // Radar cảnh giới phòng không (kiểu Gepard / Tunguska) trên nóc sau tháp: cột thép có xi-lanh gập, khớp quay,
    // ăng-ten phản xạ parabol cắt dải (ghép từ các tấm cong) quay 60 vòng/phút, loa thu phát trên 2 thanh chống phía trước,
    // thanh ăng-ten nhận dạng địch-ta (IFF) gắn trên mép. Cả cụm là bộ phận 'aaRadar' — bị bắn bay thì mất radar.
    const radarMount = new THREE.Group();
    radarMount.position.set(0.6, TROOF, 10.5);
    const rm = new VehicleKit.PartBatch(ROOF_Y + TROOF);
    rm.box(2.6, 0.8, 2.0, P, [0, 0.4, 0]);
    rm.boltRow([-1.05, 0.8, -0.85], [1.05, 0.8, -0.85], 4, 'y', D, 0.12);
    rm.boltRow([-1.05, 0.8, 0.85], [1.05, 0.8, 0.85], 4, 'y', D, 0.12);
    rm.cyl(0.42, 0.55, 3.8, 10, P, [0, 2.7, 0]);
    rm.strut([0, 0.8, 0.85], [0, 3.6, 0.32], 0.17, D, 6);           // xi-lanh gập cột khi hành quân
    rm.cyl(0.16, 0.16, 0.3, 6, M.steel, [0, 3.6, 0.42], 'x');
    rm.cyl(0.8, 0.85, 0.9, 14, D, [0, 4.95, 0]);                    // hộp khớp quay + vành trượt điện
    rm.cyl(0.28, 0.28, 0.5, 8, M.rubber, [0.75, 4.2, 0.2], 'x');    // ống luồn cáp tín hiệu xuống tháp
    rm.build(radarMount);
    const radarHead = new THREE.Group();
    radarHead.position.set(0, 6.3, 0);
    radarHead.rotation.y = rnd() * Math.PI * 2;
    const rh = new VehicleKit.PartBatch(ROOF_Y + TROOF + 6.3);
    rh.cyl(0.3, 0.3, 1.0, 8, D, [0, -0.85, 0]);                     // trục quay
    rh.box(1.4, 0.3, 1.2, D, [0, -0.95, 0.4]);                      // giá chữ U đỡ chảo
    const RR = 4.2, NF = 9, DA = 0.12, ZB = 0.6;
    for (let k = 0; k < NF; k++) {
      const a = (k - (NF - 1) / 2) * DA;
      rh.box(RR * DA + 0.04, 1.7, 0.12, P, [Math.sin(a) * RR, 0, ZB - RR + Math.cos(a) * RR], [0, a, 0]);
    }
    // Khung gân sau lưng chảo + viền trên / dưới
    for (const y of [-0.86, 0.86]) {
      for (const side of [-1, 1]) {
        const a0 = side * DA * 0.5, a1 = side * DA * (NF / 2);
        rh.beam([Math.sin(a0) * RR, y, ZB - RR + Math.cos(a0) * RR + 0.08], [Math.sin(a1) * RR, y, ZB - RR + Math.cos(a1) * RR + 0.08], 0.12, 0.14, D);
      }
    }
    rh.box(0.22, 1.6, 0.22, D, [0, 0, ZB + 0.16]);
    for (const side of [-1, 1]) rh.strut([0, -0.8, 0.5], [side * 1.6, 0, ZB - 0.1], 0.08, D, 5);
    // Loa thu phát tại tiêu điểm + 2 thanh chống
    rh.box(0.55, 0.45, 0.7, D, [0, 0, -1.5]);
    rh.box(0.4, 0.3, 0.06, M.soot, [0, 0, -1.86]);
    rh.strut([0, 0.82, ZB - 0.05], [0, 0.18, -1.35], 0.06, D, 5);
    rh.strut([0, -0.82, ZB - 0.05], [0, -0.18, -1.35], 0.06, D, 5);
    // Thanh ăng-ten IFF trên mép chảo với các chấn tử nhỏ
    rh.box(3.8, 0.28, 0.22, P, [0, 1.06, ZB - 0.05]);
    for (let k = 0; k < 6; k++) rh.cyl(0.05, 0.05, 0.35, 5, M.steel, [-1.6 + k * 0.64, 1.06, ZB - 0.3], 'z');
    rh.build(radarHead);
    radarMount.add(radarHead);
    turret.add(radarMount);
    VehicleKit.registerPartGroup(unit, 'aaRadar', radarMount);

    // Số hiệu chiến thuật trên mặt ngoài hòm đạn
    const tacNumber = `${4 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.0, 1.5, undefined, true);
      if (decal) {
        decal.position.set(s * 13.43, 2.9, -0.8);
        decal.rotation.y = s * Math.PI / 2;
        turret.add(decal);
      }
    }

    return { periHead, radarHead };
  }

  // ===========================================================================
  // PHÁO 6 NÒNG XOAY 30MM
  // ===========================================================================
  function buildRotaryCannon(unit, M) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.2, -10.5);
    unit.barrelPivot = pivot;
    unit.turretGroup.add(pivot);

    // Hộp giáp bao khối pháo + súng máy đồng trục
    const mb = new VehicleKit.PartBatch(ROOF_Y + 3.2);
    const mPts = [[-3.6, 2], [3.6, 2], [3.6, -4.6], [2.6, -6.2], [-2.6, -6.2], [-3.6, -4.6]];
    mb.add(VehicleKit.loft(mPts, mPts, -2.4, 2.6), M.paint);
    mb.box(7.0, 0.08, 0.14, M.dark, [0, 2.62, -3.0]);
    mb.cyl(0.22, 0.22, 1.2, 8, M.dark, [-2.6, -1.4, -6.6], 'z');
    // Radar bám mục tiêu trên nóc hộp pháo: chảo nhỏ ngóc cùng nòng (máy tính hỏa lực đón đầu drone theo nó),
    // hộp thu phát phía sau, nắp chụp chống bụi trên đầu thu
    mb.box(2.0, 0.9, 1.8, M.paint, [0, 3.05, -2.4]);
    mb.box(0.5, 0.5, 0.6, M.dark, [0, 3.4, -3.35]);
    mb.cyl(1.15, 1.25, 0.45, 18, M.paint, [0, 3.85, -3.75], 'z');
    mb.cyl(1.02, 1.02, 0.05, 18, M.dark, [0, 3.85, -3.99], 'z');
    mb.cyl(0.16, 0.2, 0.75, 8, M.dark, [0, 3.85, -4.35], 'z');
    mb.cyl(0.24, 0.24, 0.12, 8, M.rubber, [0, 3.85, -4.75], 'z');
    for (const a of [0, 2.1, 4.2]) mb.strut([Math.cos(a) * 0.95, 3.85 + Math.sin(a) * 0.95, -4.0], [0, 3.85, -4.6], 0.04, M.dark, 4);
    mb.build(pivot);

    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);

    // Cụm vỏ rotor cố định
    const hb = new VehicleKit.PartBatch(ROOF_Y + 3.2);
    hb.cyl(2.2, 2.3, 1.0, 20, M.dark, [0, 0, -6.6], 'z');
    hb.cyl(2.0, 2.15, 2.6, 20, M.steel, [0, 0, -8.4], 'z');
    hb.build(barrel);

    // Cụm 6 nòng xoay quanh trục Z (gameplay xoay gatlingCluster.rotation.z)
    const cluster = new THREE.Group();
    unit.gatlingCluster = cluster;
    barrel.add(cluster);

    const heatMat = new THREE.MeshStandardMaterial({
      color: 0x3b3a36, roughness: 0.45, metalness: 0.7, emissive: 0x000000, emissiveIntensity: 0
    });
    unit.gatlingHeatMat = heatMat;

    const cb = new VehicleKit.PartBatch(ROOF_Y + 3.2);
    const ringR = 1.35, z0 = -9.6, z1 = -36.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * ringR, y = Math.sin(a) * ringR;
      cb.cyl(0.3, 0.35, z0 - z1, 12, heatMat, [x, y, (z0 + z1) / 2], 'z');
      cb.cyl(0.38, 0.38, 0.8, 12, heatMat, [x, y, z1 + 0.4], 'z');
      cb.cyl(0.2, 0.2, 0.06, 8, M.bore, [x, y, z1 - 0.02], 'z');
    }
    cb.cyl(0.55, 0.55, z0 - (z1 + 1.6), 10, M.dark, [0, 0, (z0 + z1 + 1.6) / 2], 'z');
    cb.cyl(1.95, 1.95, 0.8, 18, M.dark, [0, 0, -10.2], 'z');
    cb.cyl(1.85, 1.85, 0.6, 18, M.dark, [0, 0, -23.0], 'z');
    cb.cyl(1.85, 1.85, 0.9, 18, M.soot, [0, 0, -35.0], 'z');   // kẹp đầu nòng ám muội thuốc phóng
    cb.build(cluster);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -37.0);

    // Vòng mờ chuyển động khi cụm nòng quay nhanh (hiện dần theo tốc độ quay)
    const blurMat = new THREE.MeshBasicMaterial({
      color: 0x2b2a27, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    const blur = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 25.6, 24, 1, true), blurMat);
    blur.geometry.rotateX(-Math.PI / 2);
    blur.position.z = (z0 + z1) / 2 - 0.3;
    blur.visible = false;
    barrel.add(blur);

    // Chớp lửa đầu nòng: pháo xoay chỉ khai hỏa ở MỘT vị trí cố định của vòng nòng (nòng nào quay tới đó thì nổ) ->
    // gắn vào barrel (không quay theo cluster), lệch khỏi trục đúng bằng bán kính vòng nòng.
    // 1 đĩa nhìn dọc nòng + 3 lưỡi lửa dọc nòng xếp 60° quanh trục (nhìn góc nào cũng ra hình ngọn lửa); mỗi phát
    // đổi biến thể texture / cỡ / góc xoay
    const atlas = VehicleKit.getAutocannonFlashAtlas();
    const mkMat = (map) => new THREE.MeshBasicMaterial({
      map, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flashMat = mkMat(atlas.front), sideMat = mkMat(atlas.side);
    const quadGeos = (w, h, tipAtOrigin) => [0, 1, 2, 3].map(q => {
      const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
      const u0 = (q % 2) * 0.5, v0 = (q >> 1) ? 0 : 0.5;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
      // lưỡi lửa: dựng dọc trục -Z, đỉnh ảnh (miệng nòng) ở gốc tọa độ
      if (tipAtOrigin) { g.rotateX(Math.PI / 2); g.translate(0, 0, -h / 2); }
      return g;
    });
    const discGeos = quadGeos(5.2, 5.2, false), sideGeos = quadGeos(4.2, 11, true);
    const flash = new THREE.Group();
    const FIRE_STATION = Math.PI * 0.5;   // vị trí khai hỏa trên vòng nòng (12 giờ)
    flash.position.set(Math.cos(FIRE_STATION) * ringR, Math.sin(FIRE_STATION) * ringR, z1 - 0.15);
    const disc = new THREE.Mesh(discGeos[0], flashMat);
    disc.position.z = -0.5;
    flash.add(disc);
    const petals = [];
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = k * Math.PI / 3;
      const petal = new THREE.Mesh(sideGeos[k], sideMat);
      arm.add(petal);
      flash.add(arm);
      petals.push(petal);
    }
    flash.visible = false;
    barrel.add(flash);

    return { cluster, heatMat, blur, blurMat, flash, flashMat, sideMat, disc, petals, discGeos, sideGeos, omega: 0 };
  }

  // ===========================================================================
  // HIỆU ỨNG KHI XẢ ĐẠN: QUAY NÒNG, VÒNG MỜ, CHỚP LỬA ĐẦU NÒNG
  // ===========================================================================
  const MAX_SPIN = 52.0;          // rad/s (khớp spg.js tốc độ xả đạn mới)
  const MAX_VISUAL_STEP = 0.48;   // khống chế bước quay mỗi khung hình để tránh hiệu ứng quay ngược
  const SPIN_DOWN_RATE = 1.6;     // hệ số giảm tốc khi nhả cò (~1.5-2s dừng hẳn)
  function updateGunFx(gun, u, dt) {
    // Quán tính cụm nòng: mô-tơ kéo lên nhanh theo gameplay, nhả cò thì quay chậm dần đều
    // (spinUpTime của gameplay tụt về 0 trong ~0.3s -> nếu bám theo sẽ khựng giật cục)
    const target = u.isDead ? 0 : Math.max(0, Math.min(1, (u.spinUpTime || 0) / (u.spinRequired || 1))) * MAX_SPIN;
    if (target > gun.omega) {
      gun.omega += (target - gun.omega) * Math.min(1, dt * 10);
    } else {
      gun.omega = Math.max(target, gun.omega * Math.exp(-dt * SPIN_DOWN_RATE) - dt * 1.5);
    }
    if (gun.omega < 0.05) gun.omega = 0;
    gun.cluster.rotation.z += Math.min(gun.omega * dt, MAX_VISUAL_STEP);
    // THAY BĂNG ĐẠN (hết 450 viên): cụm nòng dừng hẳn, khói thuốc phóng còn đọng trong nòng nóng bốc ra đầu nòng; cuối lúc nạp
    // (băng mới kéo vào bộ tiếp đạn) mô-tơ quay chậm từng nấc cho viên đầu băng vào ổ — khớp tiếng magOut / magIn (cockpit_cues)
    const reloading = !u.isDead && (u.gatlingMag || 0) <= 0 && u.reloadTimer > 0 && u.reloadDuration > 0;
    if (reloading) {
      const pr = 1 - u.reloadTimer / u.reloadDuration;
      if (pr > 0.82) gun.cluster.rotation.z += dt * (Math.sin(pr * 60) > 0 ? 2.2 : 0.3);   // quay từng nấc khi nạp viên đầu
      gun.reSmokeT = (gun.reSmokeT || 0) - dt;
      const G = typeof window !== 'undefined' && window.game, fx = G && G.effectsManager && G.effectsManager.fx;
      if (pr < 0.35 && gun.reSmokeT <= 0 && fx && fx.smoke && u.getMuzzleWorldTransform) {
        gun.reSmokeT = 0.12;
        const M = u.getMuzzleWorldTransform(), p = M.position, d = M.direction;
        const k = 1 - pr / 0.35;
        fx.smoke.add({ x: p.x + d.x * 1.5, y: p.y + d.y * 1.5, z: p.z + d.z * 1.5, vx: d.x * 3 + (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 3, vz: d.z * 3 + (Math.random() - 0.5) * 2,
          size: 1 + Math.random(), grow: 3, drag: 1, grav: -2, life: 1.2 + Math.random(), alpha: 0.3 * k, fadeIn: 0.05, c0: [0.62, 0.6, 0.57], cell: 0, floor: false });
      }
    }
    const spin = gun.omega / MAX_SPIN;
    u.gatlingVisualSpin = spin; // âm thanh mô-tơ dùng chung tốc độ đã làm mượt

    const stealth = u.stealthAlpha !== undefined ? u.stealthAlpha : 1;
    // Hiệu ứng tàng hình (spg.js) có thể bật depthWrite cho mọi vật liệu -> giữ tắt cho lớp trong suốt
    gun.blurMat.depthWrite = false;
    gun.flashMat.depthWrite = false;
    gun.sideMat.depthWrite = false;

    // Vòng mờ đậm dần khi quay > 45% công suất, ngả màu nóng theo nhiệt độ nòng
    const blurK = Math.max(0, (spin - 0.45) / 0.55);
    gun.blur.visible = blurK > 0.01;
    if (gun.blur.visible) {
      gun.blurMat.opacity = blurK * 0.5 * stealth;
      const hot = Math.min(1, (gun.heatMat.emissiveIntensity || 0) * 0.2);
      const e = gun.heatMat.emissive;
      gun.blurMat.color.setRGB(0.17 + e.r * hot * 0.8, 0.165 + e.g * hot * 0.5, 0.155 + e.b * hot * 0.3);
    }

    // Chớp lửa: bùng lên mỗi viên đạn (spg.js đặt gatlingShotFlash = 1) rồi tắt gần như ngay (chớp thật ~1-2 ms: ở 30
    // phát/s khung hình có khung không, nhấp nháy như phim quay thật). Mỗi phát khác hẳn nhau: biến thể texture, cỡ, độ dài
    // lưỡi lửa, góc xoay; thỉnh thoảng một phát khí thuốc phóng bén lửa lần hai (lưỡi lửa dài vọt ra)
    let f = u.gatlingShotFlash || 0;
    if (u.isDead) f = 0;
    if (f > 0.02) {
      if (f >= 0.999) {
        const R = Math.random;
        const big = R() < 0.15, k = (0.6 + R() * 0.55) * (big ? 1.2 : 1);
        gun.flash.scale.set(k, k, (0.65 + R() * 0.6) * (big ? 1.5 : 1));
        gun.flash.rotation.z = R() * Math.PI * 2;
        gun.disc.geometry = gun.discGeos[(R() * 4) | 0];
        for (const p of gun.petals) p.geometry = gun.sideGeos[(R() * 4) | 0];
        gun.flashPeak = 0.75 + R() * 0.25;
        muzzleSmoke(gun, u);
      }
      gun.flash.visible = true;
      const o = Math.min(1, f) * (gun.flashPeak || 1) * stealth;
      gun.flashMat.opacity = o;
      gun.sideMat.opacity = o * 0.9;
      u.gatlingShotFlash = f * Math.exp(-dt * 60);
    } else {
      gun.flash.visible = false;
      u.gatlingShotFlash = 0;
    }
  }

  // Khói thuốc phóng: mỗi phát một túm xám nhạt phụt ra trước miệng nòng, hãm nhanh rồi bốc lên -> xả liên tục thành làn
  // khói mỏng đọng trước cụm nòng. Chỉ khi xe trong tầm nhìn gần
  const _sp = new THREE.Vector3(), _sd = new THREE.Vector3();
  function muzzleSmoke(gun, u) {
    gun.smokeT = (gun.smokeT || 0) + 1;
    if (gun.smokeT < 2) return;                 // 30 phát/s -> ~15 túm/s là đủ dày
    gun.smokeT = 0;
    const G = typeof window !== 'undefined' && window.game, fx = G && G.effectsManager && G.effectsManager.fx;
    if (!fx || !fx.smoke) return;
    if (!u.alwaysFX && typeof SpgFXPool !== 'undefined' && !SpgFXPool.isNearView(u.x, u.z, 700)) return;
    const m = gun.flash.matrixWorld;
    _sp.setFromMatrixPosition(m);
    _sd.setFromMatrixColumn(m, 2).normalize().negate();
    const R = Math.random, sp = 14 + R() * 12, g = 0.66 + R() * 0.08;
    fx.smoke.add({
      x: _sp.x + _sd.x * 2, y: _sp.y + _sd.y * 2, z: _sp.z + _sd.z * 2,
      vx: _sd.x * sp + (R() - 0.5) * 3, vy: _sd.y * sp + 1 + R() * 2, vz: _sd.z * sp + (R() - 0.5) * 3,
      size: 0.7 + R() * 0.5, grow: 3.5, drag: 4, grav: -1.5, life: 0.9 + R() * 0.6, alpha: 0.16 + R() * 0.08,
      fadeIn: 0.03, c0: [g, g * 0.98, g * 0.95], cell: 0, floor: false
    });
  }

  // ===========================================================================
  // Ô HỘP ĐẠN: 2 hòm đạn bọc giáp hai bên tháp (nắp nghiêng, chốt khóa, tay xách, gân dập, bu-lông) + máng tiếp đạn khớp
  // đốt vào hộp pháo. Cỡ hòm theo băng: mép trước cố định ở cửa máng tiếp đạn, hòm dài ra phía sau theo số viên; hòm 650
  // vừa dài vừa cao nhô quá nóc tháp. Equipment.equip gọi unit.mountMag(id) TRƯỚC khi dựng giáp lắp thêm (tấm ốp / lồng
  // tháp bám theo hòm mới). Gắn vào tháp; tag máng tiếp đạn feedL / feedR như bộ phận dựng cùng tháp
  // ===========================================================================
  // n: số viên / băng, reload: giây thay hòm (gốc, trước GameTiming) — hòm to nặng, thay lâu hơn
  const MAG_BOX = {
    mag300: { zR: 1.2, k: 1.0, n: 300, reload: 6.0 },
    mag450: { zR: 5.5, k: 1.0, n: 450, reload: 8.0 },
    mag650: { zR: 7.0, k: 1.3, n: 650, reload: 10.5 }
  };
  const MAG_Z0 = -7.5;
  function mountMag(ctx, id) {
    const u = ctx.unit;
    if (!MAG_BOX[id]) id = 'mag300';
    if (u.magId === id || !u.turretGroup) return;
    if (u._magGroup) {
      if (u._magGroup.parent) u._magGroup.parent.remove(u._magGroup);
      u._magGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const t of ['feedL', 'feedR']) { if (u.partRegistry) delete u.partRegistry[t]; if (u.partGroups) delete u.partGroups[t]; }
    }
    u.magId = id;
    const g = new THREE.Group();
    u.turretGroup.add(g);
    const hb = new VehicleKit.PartBatch(ROOF_Y);
    const PB = VehicleKit.PartBatch, prev = PB.registry;
    PB.registry = u.partRegistry || (u.partRegistry = {});
    try { buildMagBoxes(hb, ctx, MAG_BOX[id], [-1, 1]); hb.build(g); } finally { PB.registry = prev; }
    u._magGroup = g;
    // mặt ngoài hòm (hệ tọa độ tháp) cho giáp lắp thêm bám theo (equipment.js gatlingApplique)
    const B = MAG_BOX[id];
    u.magBox = { zR: B.zR, top: 0.9 + 4.0 * B.k };
    // băng đạn & thời gian thay hòm theo cỡ hòm (cả chỉ số gốc hệ thống hư hại đã chụp, nếu có)
    const gt = (x) => (typeof GameTiming !== 'undefined' && GameTiming.t ? GameTiming.t(x) : x * 0.5);
    u.gatlingMagMax = B.n;
    u.gatlingMag = B.n;
    u.reloadDuration = gt(B.reload);
    if (u.dmg && u.dmg.base && u.dmg.base.reloadDuration !== undefined) u.dmg.base.reloadDuration = u.reloadDuration;
  }
  function buildMagBoxes(hb, ctx, B, sides, noFeed) {
    const { M, wear } = ctx, P = M.paint, D = M.dark, J = wear.jitter;
    const z0 = MAG_Z0, zR = B.zR, len = zR - z0, mid = (z0 + zR) / 2;
    const yI = 0.9 + 4.6 * B.k, yO = 0.9 + 4.0 * B.k;   // nắp nghiêng: mép trong cao hơn mép ngoài
    for (const s of sides) {
      const pts = [[s * 10.1, z0], [s * 13.4, z0 + 0.7], [s * 13.4, zR], [s * 10.1, zR]];
      hb.add(VehicleKit.loft(pts, pts, 0.9, [yI, yO, yO, yI]), P);
      hb.box(0.08, 0.1, len - 1.0, D, [s * 11.75, (yI + yO) / 2 + 0.05, mid + 0.1], [0, 0, s * Math.atan((yI - yO) / 3.3)]);   // khe nắp
      for (const z of [z0 + 3.0, zR - 3.0]) hb.box(0.18, 0.8, 0.6, M.steel, [s * 13.46, 0.9 + 3.0 * B.k, z]);   // chốt khóa nắp
      hb.beam([s * 13.5, 2.0, mid - 2.0], [s * 13.5, 2.0, mid + 2.0], 0.2, 0.2, M.steel);                       // tay xách
      // gân dập đứng + viền bu-lông trên / dưới + mối hàn mép nắp
      for (const f of [1 / 3, 2 / 3]) hb.box(0.22, yO - 1.3, 0.4, P, [s * 13.5, (yO + 0.9) / 2, z0 + len * f]);
      const nb = Math.max(4, Math.round((zR - 0.5 - (z0 + 1.3)) / 1.4) + 1);
      hb.boltRow([s * 13.4, yO - 0.35, z0 + 1.3], [s * 13.4, yO - 0.35, zR - 0.5], nb, 'x', D, 0.14, s);
      hb.boltRow([s * 13.4, 1.25, z0 + 1.3], [s * 13.4, 1.25, zR - 0.5], nb, 'x', D, 0.14, s);
      hb.weld([s * 10.2, yI, z0 + 0.1], [s * 10.2, yI, zR - 0.1], P, 0.1);
      // Máng tiếp đạn khớp đốt từ hòm đạn vào hộp pháo (máng mềm: mỗi bên võng một kiểu)
      if (noFeed) continue;
      hb.setTag('feed' + (s < 0 ? 'L' : 'R'));
      const p0 = [s * 10.6, yI + 0.2, -6.6], p1 = [s * (8.6 + J() * 0.5), yI + 1.1 - Math.abs(J()) * 0.6, -13.4], p2 = [s * 3.8, 3.7, -13.6];
      const N = 11;
      for (let i = 0; i < N; i++) {
        const a = VehicleKit.bezier3(p0, p1, p2, i / N);
        const c = VehicleKit.bezier3(p0, p1, p2, (i + 1) / N);
        const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
        const shrink = (p) => [m[0] + (p[0] - m[0]) * 0.86, m[1] + (p[1] - m[1]) * 0.86, m[2] + (p[2] - m[2]) * 0.86];
        hb.beam(shrink(a), shrink(c), 1.5, 0.7, i % 2 ? D : M.steel);
      }
      hb.box(1.8, 1.2, 1.4, D, [s * 10.7, yI + 0.1, -6.5]);
      hb.setTag(null);
    }
    // Tấm thép vá hàn ngoài thực địa trên mặt ngoài một hòm đạn, che vết trúng đạn cũ: cắt tay không vuông vức,
    // đặt lệch, đường hàn vòng quanh mép, sơn dặm khác tông
    const s = wear.patchSide;
    if (!sides.includes(s)) return;
    const rot = [0.06 + J() * 0.05, 0, 0];
    const F = frameAt([s * 13.55, 2.7, zR - 2.0], rot);
    hb.box(0.18, 2.1, 2.6, M.paintDusty, F(0, 0, 0), rot);
    const corners = [[1.0, -1.25], [1.08, 1.22], [-1.02, 1.3], [-1.05, -1.18]];
    for (let k = 0; k < 4; k++) {
      const [y0, c0] = corners[k], [y1, c1] = corners[(k + 1) % 4];
      hb.weld(F(s * 0.08, y0, c0), F(s * 0.08, y1, c1), M.paintDusty, 0.1);
    }
  }

  // Ảnh kho đồ (equipment_thumbs.html): hòm đạn bên phải theo cỡ băng (không máng tiếp đạn)
  window.HailstormMag = {
    build(id, M) {
      const g = new THREE.Group(), hb = new VehicleKit.PartBatch();
      const wear = rollWear(VehicleKit.mulberry32(7));
      wear.patchSide = 1;
      buildMagBoxes(hb, { M, wear }, MAG_BOX[id] || MAG_BOX.mag300, [1], true);
      hb.build(g);
      return g;
    }
  };

  // Ảnh kho đồ (equipment_thumbs.html): dựng riêng món ô MŨI XE với vật liệu cho sẵn
  window.HailstormFront = {
    build(id, M) {
      const g = new THREE.Group(), hb = new VehicleKit.PartBatch();
      const ctx = { M, wear: rollWear(VehicleKit.mulberry32((Math.random() * 1e9) | 0)) };
      (id === 'vshield' ? buildVShield : buildDozer)(hb, ctx);
      hb.build(g, [0, 5, -34]);
      return g;
    }
  };

  if (typeof TankModelBuilder !== 'undefined') TankModelBuilder.registerModel('GATLING', buildHailstorm);
})();
