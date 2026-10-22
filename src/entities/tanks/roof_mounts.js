/**
 * CHÂN ĐẾ MÔ-ĐUN DÙNG CHUNG (ô NÓC THÁP / VŨ KHÍ CHÍNH / UAV của mọi xe): một kiểu bệ xoay quân sự lắp lẫn được — vòng
 * xoay, mâm bu-lông, bệ mô-tơ, chạc chữ U mang trục ngóc, hộp điều khiển + bó cáp — trên đó gắn món nào cũng được: máy
 * phá sóng, súng máy, súng phóng lựu, giàn rocket, radar, máy phá khóa radar, ống phóng UAV cảm tử...
 *
 * Mỗi xe chỉ khai báo chỗ đặt bệ: ctx = { parent (group cha: tháp / thân), seat [x, y, z] trong group cha, yBase (độ cao
 * mặt bệ so với đất — lớp bẩn gầm), M (vật liệu có vết chiến trường của xe), P, D, unit, rnd } rồi gọi
 * RoofMounts.mount(ctx, mã món). Món nào cũng mang dấu thời gian riêng từng chiếc (bu-lông mất, đai vá, vệt gỉ / muội,
 * dây buộc) — không món nào giống món nào.
 *
 * Hàm dựng đặt "phần cứng" lên xe để gameplay nhận ra: u.jammer (máy phá sóng UAV — ew_jammer.js), u.rcwsTurret /
 * u.rcwsGun / u.roofWeapon (trạm vũ khí xoay — drone_air.js), u.lockJammer (máy phá khóa radar), u._eqRadarHead (radar
 * quay — equipment.js), u.kamiRack (ống phóng UAV cảm tử). Trả tag hư hại của cả cụm (bị bắn văng cả bệ).
 *
 * Tỉ lệ: số đo dựng ~1/2 cỡ thật rồi phóng cả cụm STATION_SCALE (8 đơn vị game = 1 m).
 */
(function () {
  if (typeof THREE === 'undefined' || typeof VehicleKit === 'undefined') return;

  const STATION_SCALE = 2.1;
  const rndOf = (ctx) => ctx.rnd || Math.random;

  // Dấu thời gian trên bệ: đai thép vá hàn vòng tay chạc, vệt gỉ chảy từ mâm xuống, dây buộc cáp, nắp hộp điều khiển vênh
  function stationWear(rb, ctx, arm) {
    const { P, D, M } = ctx, rnd = rndOf(ctx);
    const s = rnd() < 0.5 ? -1 : 1;
    rb.box(0.3, 0.12, 1.26, P, [s * arm, 1.25 + rnd() * 0.3, 0.05], [0, 0, (rnd() - 0.5) * 0.08]);   // đai vá
    rb.box(0.05, 0.42, 0.12, M.soot || D, [Math.cos(rnd() * 6) * 1.18, 0.12, Math.sin(rnd() * 6) * 1.18]);   // vệt gỉ / muội
    rb.box(0.05, 0.06, 0.5, M.canvasDark || D, [-s * arm, 1.7, 0.35], [0.2, 0, 0]);                      // dây buộc bó cáp
    rb.box(0.86, 0.04, 0.4, D, [0, 1.21, 0.95], [-0.05 - rnd() * 0.08, 0, (rnd() - 0.5) * 0.06]);      // nắp hộp vênh
  }

  // Gỡ món đang gắn (nếu có) rồi dựng món `id`. Mỗi hàm dựng tự đặt "phần cứng" của mình lên xe (u.jammer: máy phá sóng —
  // ew_jammer.js; u.rcwsTurret / u.rcwsGun / u.roofWeapon: trạm vũ khí xoay — drone_air.js) và trả tag hư hại của cụm
  function mountRoof(ctx, id) {
    // ctx.key: ô đang gắn ('roof' nóc tháp, 'weapon' vũ khí chính, 'uav'...) — mỗi ô giữ cụm của riêng nó
    // id 'none': gỡ trống bệ (xe không mang món nào ở ô này)
    const u = ctx.unit, build = ROOF_BUILDERS[id], key = ctx.key || 'roof';
    const slots = u._mounts || (u._mounts = {}), cur = slots[key] || {};
    if ((!build && id !== 'none') || cur.id === id) return;
    if (cur.group) {
      if (cur.group.parent) cur.group.parent.remove(cur.group);
      cur.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      if (u.partGroups && cur.tag) delete u.partGroups[cur.tag];
    }
    if (key === 'roof') {
      u.jammer = null; u.rcwsTurret = null; u.rcwsGun = null; u.rcwsMuzzleLocal = null;
      u.roofWeapon = null; u.roofMuzzles = null; u.roofRounds = null;
      u.lockJammer = null; u.roofRadarHead = null;
      u.mgActive = false; u.ewActive = false; u._rcws = null; u._aa = null;
    } else if (key === 'weapon') u.mainGun = null;
    else if (key === 'uav') u.kamiRack = null;
    let seat = null, tag = null;
    if (build) {
      seat = new THREE.Group();
      seat.position.set(ctx.seat[0], ctx.seat[1], ctx.seat[2]);
      if (ctx.seatRot) seat.rotation.y = ctx.seatRot;
      tag = build(seat, ctx);
      ctx.parent.add(seat);
      if (tag) VehicleKit.registerPartGroup(u, tag, seat);   // vũ khí chính (tag null) không bị bắn văng
    }
    slots[key] = { id, group: seat, tag };
    if (key === 'roof') { u._roofGroup = seat; u._roofTag = tag; u.roofId = id; }
  }

  // Máy phá sóng chống UAV PHÁT CHÙM ĐỊNH HƯỚNG trên CHÂN ĐẾ XOAY CHUNG của ô nóc tháp (như súng máy / phóng lựu / rocket):
  // chạc ngóc mang MẢNG ĂNG-TEN TẤM phẳng (radome 2 x 2 phần tử, viền gân) chĩa về một hướng, hộp khuếch đại + lá tản nhiệt
  // sau tấm, camera ngắm nhỏ bên phải; hộp nguồn / máy phát treo sau chạc, đèn trạng thái đỏ nhấp nháy khi đang phát.
  // Đầu phát quay / ngóc theo hướng chùm (ew_jammer.js: u.jammer.head xoay ngang, .tilt ngóc). Tấm thật ~0.45 x 0.4 m
  function buildRoofJammer(seat, ctx) {
    const { M, P, D, unit } = ctx;
    const st = stationBase(seat, ctx, 0.98, false);
    const head = st, tilt = st.userData.gun;
    const radome = new THREE.MeshStandardMaterial({ color: 0xbab8a7, roughness: 0.8, metalness: 0.0 });
    // số đo ~1/2 cỡ thật như mọi món trên chân đế (cả cụm phóng STATION_SCALE)
    const jt = new VehicleKit.PartBatch(ctx.yBase + 4.3);
    jt.box(1.62, 1.48, 0.24, radome, [0, 0.1, -0.17]);                   // tấm radome
    jt.box(1.69, 0.08, 0.29, D, [0, 0.86, -0.17]); jt.box(1.69, 0.08, 0.29, D, [0, -0.66, -0.17]);   // viền gân trên / dưới
    for (const sx of [-1, 1]) jt.box(0.08, 1.57, 0.29, D, [sx * 0.84, 0.1, -0.17]);
    jt.box(0.03, 1.38, 0.03, D, [0, 0.1, -0.3]); jt.box(1.52, 0.03, 0.03, D, [0, 0.1, -0.3]);       // vạch chia 2 x 2 phần tử
    jt.box(1.15, 0.95, 0.33, D, [0, 0.1, 0.12]);                         // hộp khuếch đại sau tấm
    for (let k = 0; k < 4; k++) jt.box(1.05, 0.04, 0.24, D, [0, -0.24 + k * 0.21, 0.31]);   // lá tản nhiệt
    jt.cyl(0.13, 0.13, 0.12, 12, D, [0.9, 0, 0], 'x'); jt.cyl(0.13, 0.13, 0.12, 12, D, [-0.9, 0, 0], 'x');   // ổ trục ngóc
    jt.box(0.34, 0.3, 0.48, P, [1.3, -0.42, 0.02]);                      // camera ngắm nhỏ bên phải
    jt.cyl(0.08, 0.08, 0.04, 12, M.lens, [1.3, -0.42, -0.23], 'z');
    jt.build(tilt);
    // hộp nguồn / máy phát treo sau chạc (quay theo chân đế), lá tản nhiệt hai bên, bó cáp xuống nóc
    const pb = new VehicleKit.PartBatch(ctx.yBase);
    pb.box(1.5, 0.62, 0.6, P, [0, 1.15, 1.0]);
    pb.box(1.58, 0.08, 0.66, P, [0, 1.5, 1.0]);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) pb.box(0.05, 0.46, 0.5, D, [sx * 0.78, 1.15, 0.85 + k * 0.1]);
    pb.strut([-0.5, 0.85, 1.3], [-0.85, 0.12, 1.25], 0.06, D);
    pb.build(st);
    // đèn trạng thái mặt sau hộp nguồn (vật liệu riêng mỗi xe: ew_jammer.js đổi màu / nhấp nháy)
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33ff55, emissiveIntensity: 0.7, roughness: 0.4 });
    for (const x of [-0.25, 0.25]) {
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), ledMat);
      led.rotation.x = Math.PI / 2;
      led.position.set(x, 1.25, 1.31);
      st.add(led);
    }
    // chùm sáng mờ (ew_jammer.js gắn vào khối ngóc) phải bù lại tỉ lệ phóng của chân đế
    unit.jammer = { group: seat, head, tilt, ledMat, beamScale: 1 / STATION_SCALE };
    return 'jammer';
  }

  // Bệ trạm vũ khí điều khiển từ xa dùng chung (kiểu Protector / CROWS): vòng xoay, mâm có vành bu-lông, bệ mô-tơ, chạc
  // chữ U mang trục ngóc, hộp điều khiển + bó cáp phía sau. Số đo dựng ~1/2 cỡ thật rồi phóng cả cụm 2.1 lần — nòng,
  // ngắm, bắn đều tính qua matrixWorld của khối ngóc nên tự đúng tỉ lệ. arm: nửa khoảng cách 2 tay chạc (vũ khí to: rộng)
  // weapon = false (máy phá sóng): không phải trạm vũ khí — không gắn cờ rcwsTurret / rcwsGun cho drone_air.js
  function stationBase(seat, ctx, arm = 1.45, weapon = true) {
    const { P, D, unit } = ctx, rnd = rndOf(ctx);
    const st = new THREE.Group();
    st.scale.setScalar(STATION_SCALE);
    const rb = new VehicleKit.PartBatch(ctx.yBase);
    rb.cyl(1.2, 1.3, 0.3, 20, D, [0, 0.15, 0]);
    rb.cyl(1.15, 1.15, 0.12, 20, P, [0, 0.36, 0]);
    const gone = Math.floor(rnd() * 10);   // một con bu-lông mâm đã mất, chưa kịp thay
    for (let i = 0; i < 10; i++) {
      if (i === gone) continue;
      const a = i * Math.PI / 5;
      rb.cyl(0.06, 0.06, 0.08, 6, D, [Math.cos(a) * 1.02, 0.45, Math.sin(a) * 1.02]);
    }
    rb.cyl(0.85, 1.0, 0.5, 16, P, [0, 0.67, 0.1]);
    rb.box(arm * 2 + 0.26, 0.26, 1.3, P, [0, 1.05, 0.05]);
    for (const s of [-1, 1]) {
      rb.box(0.26, 0.85, 1.2, P, [s * arm, 1.55, 0.05]);
      rb.box(0.26, 0.42, 0.75, P, [s * arm, 2.05, 0.0]);
      rb.cyl(0.3, 0.3, 0.12, 14, D, [s * (arm + 0.19), 2.05, 0.0], 'x');
      rb.cyl(0.12, 0.12, 0.14, 8, P, [s * (arm + 0.26), 2.05, 0.0], 'x');
    }
    rb.box(0.9, 0.5, 0.42, D, [0, 0.95, 0.95]);
    rb.cyl(0.07, 0.07, 0.6, 6, D, [0.3, 0.6, 1.05], 'y', [0.4, 0, 0]);
    stationWear(rb, ctx, arm);
    rb.build(st);
    const gun = new THREE.Group();
    gun.position.set(0, 2.05, 0.0);
    st.add(gun);
    seat.add(st);
    st.userData.gun = gun;
    if (weapon) {
      unit.rcwsTurret = st;
      unit.rcwsGun = gun;
      return gun;
    }
    return st;
  }

  // Đầu cảm biến của trạm (camera ngày / ảnh nhiệt / đo xa laser): thân vát mép trước, cửa kính lõm, mái che
  function stationSensor(gb, ctx, x) {
    const { M, P, D } = ctx;
    gb.box(0.78, 0.74, 1.1, P, [x, 0.16, -0.15]);
    gb.box(0.78, 0.3, 0.3, P, [x, 0.44, -0.72], [0.6, 0, 0]);
    gb.box(0.78, 0.3, 0.3, P, [x, -0.12, -0.72], [-0.6, 0, 0]);
    gb.box(0.7, 0.4, 0.05, D, [x, 0.16, -0.76]);
    gb.box(0.9, 0.06, 1.3, D, [x, 0.58, -0.25]);
    gb.cyl(0.14, 0.14, 0.06, 14, M.lens, [x - 0.14, 0.2, -0.79], 'z');    // camera ngày
    gb.cyl(0.12, 0.12, 0.06, 12, M.glass, [x + 0.15, 0.2, -0.79], 'z');   // ảnh nhiệt
    gb.cyl(0.05, 0.05, 0.06, 8, M.lens, [x, 0.02, -0.79], 'z');           // đo xa laser
  }

  // Trạm súng máy 7.62mm: vỏ súng giữa (nóc vát, mặt trước nghiêng, khe nhả vỏ đạn), nòng có ống áo + loa che lửa,
  // hộp dây đạn bên trái có máng vào súng, đầu cảm biến bên phải
  function buildRoofRCWS(seat, ctx) {
    const { P, D, unit } = ctx;
    const gun = stationBase(seat, ctx);
    const gb = new VehicleKit.PartBatch(ctx.yBase + 4.3);
    gb.box(2.1, 0.22, 1.3, D, [0, -0.2, 0.0]);                  // nôi súng ôm trục ngóc
    gb.box(0.66, 0.5, 2.1, P, [0, 0.14, -0.15]);
    for (const s of [-1, 1]) gb.box(0.2, 0.2, 2.1, P, [s * 0.24, 0.42, -0.15], [0, 0, s * -0.7]);
    gb.box(0.36, 0.14, 2.1, P, [0, 0.46, -0.15]);
    gb.box(0.6, 0.42, 0.3, P, [0, 0.1, -1.3], [0.4, 0, 0]);
    gb.box(0.05, 0.16, 0.6, D, [0.34, 0.08, 0.1]);
    gb.cyl(0.14, 0.14, 0.55, 12, D, [0, 0.12, -1.6], 'z');      // ống áo nòng
    gb.cyl(0.075, 0.075, 2.3, 10, D, [0, 0.12, -2.85], 'z');    // nòng
    gb.cyl(0.13, 0.11, 0.42, 10, D, [0, 0.12, -4.2], 'z');      // loa che lửa
    gb.box(0.55, 0.7, 1.15, P, [-0.75, 0.08, 0.1]);             // hộp đạn: thân, nắp gờ, quai, máng dây đạn
    gb.box(0.6, 0.06, 1.2, D, [-0.75, 0.45, 0.1]);
    gb.box(0.08, 0.1, 0.5, D, [-0.75, 0.52, 0.1]);
    gb.box(0.3, 0.12, 0.45, D, [-0.42, 0.33, -0.1]);
    stationSensor(gb, ctx, 0.8);
    gb.build(gun);
    unit.rcwsMuzzleLocal = new THREE.Vector3(0, 0.12, -4.42);
    unit.roofWeapon = 'rcws';
    return 'rcws';
  }

  // Súng phóng lựu tự động 40mm (kiểu Mk 19 trên trạm điều khiển từ xa): thân súng hộp to vuông vức, nắp trên có bản lề,
  // nòng ngắn mập trong ống áo tản nhiệt khoan lỗ, hộp đạn treo bên trái có máng cấp đạn, cảm biến bên phải.
  // opt.hv: bản sơ tốc cao của xe trinh sát (nòng dài hơn có loa giảm giật, hộp 48 quả to hơn, thêm hộp đạn dự phòng
  // chằng sau bệ). ctx.asMain: là vũ khí chính trên vòng tháp (xe trinh sát) — không gắn cờ trạm nóc tháp, xem mainGunOf
  function buildRoofAGL(seat, ctx, opt = {}) {
    const { M, P, D, unit } = ctx, rnd = rndOf(ctx), hv = !!opt.hv;
    const gun = stationBase(seat, ctx, 1.75, !ctx.asMain);
    const gb = new VehicleKit.PartBatch(ctx.yBase + 4.3);
    gb.box(2.7, 0.22, 1.5, D, [0, -0.28, 0.05]);                // nôi súng
    gb.box(0.95, 0.75, 1.9, P, [0, 0.15, 0.05]);                // thân súng
    gb.box(0.97, 0.06, 1.55, D, [0, 0.54, 0.15]);               // khe nắp trên
    gb.cyl(0.07, 0.07, 0.9, 8, D, [0, 0.58, 0.85], 'x');        // bản lề nắp
    gb.box(0.8, 0.5, 0.12, D, [0, 0.12, 1.05]);                 // tấm hậu (cụm lò xo đẩy)
    gb.box(0.1, 0.32, 0.5, D, [0.5, 0.0, -0.1]);                // cửa nhả vỏ / mắt xích bên phải
    const L = hv ? 1.35 : 1;                                     // bản HV: nòng dài hơn
    gb.cyl(0.24, 0.24, 0.95 * L, 14, P, [0, 0.12, -0.88 - 0.475 * L], 'z');   // ống áo tản nhiệt
    for (const k0 of [0, 1, 2]) {
      const z = -1.0 - k0 * 0.3 * L;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + (k0 === 1 ? Math.PI / 6 : 0);
        gb.cyl(0.07, 0.07, 0.05, 6, D, [Math.cos(a) * 0.235, 0.12 + Math.sin(a) * 0.235, z], 'y', [0, 0, a - Math.PI / 2]);
      }
    }
    const zB = -0.88 - 0.95 * L;                                  // đầu ống áo
    gb.cyl(0.14, 0.14, 0.5, 12, D, [0, 0.12, zB - 0.22], 'z');   // nòng 40mm
    if (hv) {
      // loa giảm giật 2 tầng (lỗ xả khí hai bên), ám muội
      gb.cyl(0.2, 0.2, 0.42, 12, M.soot || D, [0, 0.12, zB - 0.66], 'z');
      for (const s of [-1, 1]) gb.box(0.06, 0.16, 0.12, D, [s * 0.2, 0.12, zB - 0.6]);
    } else gb.cyl(0.17, 0.15, 0.16, 12, M.soot || D, [0, 0.12, zB - 0.52], 'z');
    const can = hv ? [1.0, 1.1, 1.5] : [0.8, 0.95, 1.3];          // hộp đạn 48 / 32 quả
    gb.box(can[0], can[1], can[2], P, [-0.75 - can[0] / 2, -0.05, 0.15], [0, 0, (rnd() - 0.5) * 0.04]);
    gb.box(can[0] + 0.06, 0.07, can[2] + 0.06, D, [-0.75 - can[0] / 2, can[1] / 2 - 0.05, 0.15]);
    gb.box(0.1, 0.12, 0.6, D, [-0.75 - can[0] / 2, can[1] / 2 + 0.02, 0.15]);
    gb.box(0.04, can[1] * 0.4, can[2] * 0.35, M.canvas || P, [-0.74 - can[0], 0.0, 0.25], [0, 0, 0.02]);   // nhãn lô đạn bạc màu
    gb.box(0.45, 0.2, 0.7, D, [-0.62, 0.3, 0.0], [0, 0, 0.35]); // máng cấp đạn
    stationSensor(gb, ctx, 1.05);
    gb.build(gun);
    const muzzle = new THREE.Vector3(0, 0.12, zB - (hv ? 0.9 : 0.6));
    if (ctx.asMain) { unit.mainGun = { pivot: gun, muzzle, kind: 'agl' }; return null; }
    unit.rcwsMuzzleLocal = muzzle;
    unit.roofWeapon = 'agl';
    return 'agl';
  }

  // Giàn rocket không điều khiển trên trạm xoay: hộp ống có gân tăng cứng, miệng ống ám muội, thấy đầu đạn trong ống (bắn
  // quả nào ống đó trống — u.roofRounds), nắp đuôi ống, khối ngắm nhỏ ngoài chạc bên phải. opt.cols x opt.rows ống
  // (xe tăng 2 x 2, xe trinh sát 4 x 2). Một nắp miệng ống bị mất (miệng trần ám muội), dây chằng cáp điện phóng
  function buildRoofRockets(seat, ctx, opt = {}) {
    const { M, P, D, unit } = ctx, rnd = rndOf(ctx);
    const cols = opt.cols || 2, rows = opt.rows || 2, pitch = 1.1, rowP = 0.96;
    const W = cols * pitch + 0.2, H = rows * rowP - 0.02;
    const gun = stationBase(seat, ctx, Math.max(1.45, W / 2 + 0.25), !ctx.asMain);
    const gb = new VehicleKit.PartBatch(ctx.yBase + 4.3);
    const cy = H / 2 - 0.3;                                       // bó ống nằm trên chạc ngóc, không lún vào bệ
    const tubes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tubes.push([(c - (cols - 1) / 2) * pitch, cy + ((rows - 1) / 2 - r) * rowP]);
    const capGone = Math.floor(rnd() * tubes.length);
    tubes.forEach(([tx, ty], i) => {
      gb.cyl(0.42, 0.42, 3.0, 14, P, [tx, ty, -0.3], 'z');          // ống phóng rời từng ống
      gb.cyl(0.47, 0.47, 0.12, 16, D, [tx, ty, -1.76], 'z');        // vành miệng ống
      gb.cyl(0.34, 0.34, 0.12, 14, M.soot || D, [tx, ty, -1.83], 'z');
      gb.cyl(0.45, 0.45, 0.1, 14, D, [tx, ty, 1.15], 'z');          // vành đuôi
      gb.cyl(0.36, 0.36, 0.08, 14, i === capGone ? (M.soot || D) : D, [tx, ty, 1.24], 'z');   // nắp đuôi ống
    });
    // 3 đai khung ôm bó ống (thanh trên / dưới / hai bên — thấy rõ từng ống giữa các đai)
    const fw = W + 0.06, fh = H + 0.06;
    for (const z of [-1.35, -0.2, 0.85]) {
      gb.box(fw, 0.1, 0.18, D, [0, cy + fh / 2, z]); gb.box(fw, 0.1, 0.18, D, [0, cy - fh / 2, z]);
      gb.box(0.1, fh, 0.18, D, [fw / 2, cy, z]); gb.box(0.1, fh, 0.18, D, [-fw / 2, cy, z]);
    }
    gb.box(Math.min(W * 0.55, 2.2), 0.16, 2.6, D, [0, cy - fh / 2 - 0.08, -0.25]);   // dầm đỡ nối xuống trục ngóc
    const sx = W / 2 + 0.75;
    gb.box(0.5, 0.55, 0.9, P, [sx, cy, -0.5]);                   // khối ngắm
    gb.box(0.4, 0.3, 0.05, D, [sx, cy, -0.96]);
    gb.cyl(0.11, 0.11, 0.06, 12, M.lens, [sx, cy, -0.99], 'z');
    gb.strut([-W / 2 - 0.05, cy - H / 2 + 0.1, 1.0], [-W / 2 - 0.3, -0.6, 0.6], 0.05, D, 5);   // cáp điện phóng
    gb.box(W * 0.3, 0.04, 0.5, M.soot || D, [W * 0.2, cy + fh / 2 + 0.06, -1.4]);            // vệt muội khói phóng
    gb.build(gun);
    // đầu đạn nổ lõm nhìn thấy trong miệng ống (ẩn khi ống đó đã phóng)
    const noseGeo = new THREE.ConeGeometry(0.27, 0.6, 12);
    noseGeo.rotateX(-Math.PI / 2);
    const noseMat = M.canvasDark || D;
    const rounds = tubes.map(([tx, ty]) => {
      const m = new THREE.Mesh(noseGeo, noseMat);
      m.position.set(tx, ty, -1.55);
      gun.add(m);
      return m;
    });
    const muzzles = tubes.map(([tx, ty]) => new THREE.Vector3(tx, ty, -2.0));
    if (ctx.asMain) { unit.mainGun = { pivot: gun, muzzle: new THREE.Vector3(0, cy, -2.0), muzzles, rounds, kind: 'rocket' }; return null; }
    unit.roofRounds = rounds;
    unit.roofMuzzles = muzzles;
    unit.rcwsMuzzleLocal = new THREE.Vector3(0, cy, -2.0);
    unit.roofWeapon = 'rocket';
    return 'rocketPod';
  }

  // Radar dò tìm trên chân đế (xe 6 nòng): chạc mang ăng-ten mảng phẳng ngả ra sau, hộp điện tử sau tấm, cả bệ quay tròn
  // liên tục (Equipment.update quay u.roofRadarHead). Tấm radome bạc màu, một góc bị vá băng dính
  function buildRoofRadar(seat, ctx) {
    const { M, P, D, unit } = ctx, rnd = rndOf(ctx);
    const st = stationBase(seat, ctx, 1.3, false), tilt = st.userData.gun;
    tilt.rotation.x = -0.22;
    const radome = new THREE.MeshStandardMaterial({ color: 0xa9a796, roughness: 0.85, metalness: 0.0 });
    const tb = new VehicleKit.PartBatch(ctx.yBase + 4.3);
    tb.box(2.3, 1.25, 0.22, radome, [0, 0.35, -0.2]);                     // mảng ăng-ten
    tb.box(2.38, 0.08, 0.28, D, [0, 1.0, -0.2]); tb.box(2.38, 0.08, 0.28, D, [0, -0.3, -0.2]);
    for (const s of [-1, 1]) tb.box(0.08, 1.38, 0.28, D, [s * 1.18, 0.35, -0.2]);
    for (let k = 1; k < 6; k++) tb.box(0.02, 1.15, 0.02, D, [-1.15 + k * 0.383, 0.35, -0.32]);   // vạch phần tử
    tb.box(1.3, 0.75, 0.42, D, [0, 0.3, 0.14]);                           // hộp thu phát
    for (let k = 0; k < 4; k++) tb.box(1.2, 0.04, 0.2, D, [0, 0.05 + k * 0.17, 0.42]);
    tb.box(0.5, 0.32, 0.03, M.canvas || P, [0.75 + rnd() * 0.2, 0.75, -0.33], [0, 0, 0.3]);   // miếng vá băng dính
    tb.cyl(0.13, 0.13, 0.12, 12, D, [1.24, 0, 0], 'x'); tb.cyl(0.13, 0.13, 0.12, 12, D, [-1.24, 0, 0], 'x');
    tb.build(tilt);
    unit.roofRadarHead = st;
    return 'sradar';
  }

  // Máy phá khóa radar tầm gần (xe 6 nòng, lock_jammer.js): hộp phát nhiễu có lá tản nhiệt trên chạc, 4 roi ăng-ten
  // xòe các hướng (dài ngắn khác nhau, một roi cong), 2 ăng-ten lưỡi dao, 1 ăng-ten xoắn ốc đứng; đèn trạng thái sau hộp.
  // Đang phát thì cả bệ quay chậm (quét nhiễu đa hướng)
  function buildRoofLockJammer(seat, ctx) {
    const { M, P, D, unit } = ctx, rnd = rndOf(ctx);
    const st = stationBase(seat, ctx, 1.1, false), tilt = st.userData.gun;
    const jb = new VehicleKit.PartBatch(ctx.yBase + 4.3);
    jb.box(1.75, 0.95, 1.25, P, [0, 0.1, 0]);                             // hộp phát nhiễu
    jb.box(1.83, 0.07, 1.33, D, [0, 0.6, 0]);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) jb.box(0.05, 0.75, 1.0, D, [s * 0.9, 0.1, -0.4 + k * 0.2]);   // lá tản nhiệt
    for (let k = 0; k < 3; k++) jb.cyl(0.08, 0.08, 0.14, 8, D, [-0.5 + k * 0.5, -0.1, 0.66], 'z');   // đầu nối cáp
    jb.cyl(0.13, 0.13, 0.12, 12, D, [0.95, 0, 0], 'x'); jb.cyl(0.13, 0.13, 0.12, 12, D, [-0.95, 0, 0], 'x');
    // roi ăng-ten xòe 4 hướng (một roi bị cong vì quệt cành cây)
    const whips = [[-0.6, -0.4, 2.4, -0.25, -0.2], [0.6, -0.4, 2.1, -0.25, 0.22], [-0.6, 0.4, 2.6, 0.3, -0.18], [0.6, 0.4, 1.9, 0.28, 0.2]];
    whips.forEach(([x, z, len, tx, tz], i) => {
      const p0 = [x, 0.65, z], p1 = [x + tz * len, 0.65 + len, z + tx * len * 0.5];
      if (i === 2) {
        const mid = [(p0[0] + p1[0]) / 2 - 0.15, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        jb.strut(p0, mid, 0.035, D, 5, 0.03); jb.strut(mid, [p1[0] - 0.45, p1[1] - 0.25, p1[2]], 0.03, D, 5, 0.022);
      } else jb.strut(p0, p1, 0.035, D, 5, 0.02);
      jb.cyl(0.08, 0.09, 0.12, 8, M.rubber || D, [x, 0.7, z]);
    });
    for (const s of [-1, 1]) jb.box(0.05, 0.55, 0.32, D, [s * 0.35, 0.95, 0.3], [0, 0, s * 0.12]);   // ăng-ten lưỡi dao
    jb.cyl(0.12, 0.12, 0.8, 10, M.canvasDark || D, [0, 1.05, -0.35]);                         // ăng-ten xoắn ốc (vỏ bọc)
    for (let k = 0; k < 6; k++) jb.cyl(0.14, 0.14, 0.03, 10, D, [0, 0.72 + k * 0.13, -0.35]);
    jb.box(0.6, 0.04, 0.4, M.soot || D, [0.3 + rnd() * 0.3, 0.64, 0.2]);                       // vệt cháy sém cạnh nắp
    jb.build(tilt);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33ff55, emissiveIntensity: 0.7, roughness: 0.4 });
    for (const x of [-0.25, 0.25]) {
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), ledMat);
      led.rotation.x = Math.PI / 2;
      led.position.set(x, 0.3, 0.64);
      tilt.add(led);
    }
    unit.lockJammer = { group: seat, head: st, ledMat };
    return 'rjam';
  }

  // Ống phóng UAV cảm tử (kiểu Switchblade) NẰM CỐ ĐỊNH trên nóc cabin, không bệ xoay: tấm đế mặt bích bắt bu-lông
  // (cùng kiểu mặt bích chân đế mô-đun), 2 yên thép ôm 2 ống composite ngóc ~7° về phía trước, bình khí nén cao áp + van
  // điện từ + ống dẫn khí vào đáy ống (khí nén đẩy UAV ra khỏi ống, UAV tự nổ máy bay tiếp), hộp điều khiển phóng, cáp.
  // Nắp nhựa đầu ống (rack.caps) bật văng khi phóng, có quả mới nạp thì lắp nắp mới. Vết dùng: muội quanh miệng ống đã
  // phóng, băng dính bạc quấn đai, sơn tróc chỗ yên đỡ, một con bu-lông đế thiếu
  function buildKamiLauncher(seat, ctx) {
    const { M, P, D, unit } = ctx, rnd = rndOf(ctx);
    const st = new THREE.Group();
    st.scale.setScalar(STATION_SCALE);
    seat.add(st);
    const bb = new VehicleKit.PartBatch(ctx.yBase);
    bb.box(2.7, 0.16, 4.6, D, [0, 0.08, -0.1]);                          // tấm đế mặt bích
    const gone = Math.floor(rnd() * 12);
    for (let i = 0; i < 12; i++) {
      if (i === gone) continue;
      const x = (i % 2 ? 1 : -1) * 1.2, z = -2.15 + Math.floor(i / 2) * 0.82;
      bb.cyl(0.07, 0.07, 0.1, 6, M.steel || D, [x, 0.21, z]);
    }
    for (const z of [-1.5, 1.1]) {                                        // 2 yên thép ôm ống
      bb.box(2.5, 0.42, 0.34, P, [0, 0.37, z]);
      for (const s of [-1, 1]) bb.box(0.16, 0.7, 0.34, P, [s * 1.18, 0.62, z]);
      bb.box(0.6, 0.05, 0.36, M.paintDusty || P, [(rnd() - 0.5) * 1.4, 0.6, z]);   // sơn tróc chỗ yên mài vào ống
    }
    // bình khí nén cao áp + van + ống dẫn khí vào đáy 2 ống
    bb.cyl(0.26, 0.26, 1.7, 12, M.steel || D, [1.62, 0.42, 0.4], 'z');
    bb.cyl(0.26, 0.2, 0.2, 12, M.steel || D, [1.62, 0.42, -0.55], 'z');
    bb.box(0.24, 0.24, 0.22, D, [1.62, 0.42, -0.75]);
    bb.strut([1.62, 0.42, 1.3], [1.0, 0.95, 2.2], 0.06, M.rubber || D, 6);
    bb.strut([1.0, 0.95, 2.2], [-0.55, 1.05, 2.25], 0.06, M.rubber || D, 6);
    bb.box(0.7, 0.45, 0.5, P, [-1.55, 0.38, 1.25]);                       // hộp điều khiển phóng + cáp
    bb.box(0.72, 0.05, 0.52, D, [-1.55, 0.62, 1.25], [0, 0, (rnd() - 0.5) * 0.1]);
    bb.strut([-1.55, 0.4, 0.98], [-1.2, 0.2, 0.2], 0.05, M.canvasDark || D, 6);
    bb.box(0.05, 0.4, 0.14, M.soot || D, [1.36, 0.25, -1.9]);             // vệt gỉ chảy
    bb.build(st);
    const tilt = new THREE.Group();
    tilt.position.set(0, 1.0, -0.1);
    tilt.rotation.x = 0.12;   // ngóc ~7°: khí nén đẩy UAV ra hơi chếch lên, rồi UAV tự nổ máy
    st.add(tilt);
    const kb = new VehicleKit.PartBatch(ctx.yBase + 2.1);
    const tubes = [], caps = [];
    for (const x of [-0.55, 0.55]) {
      kb.cyl(0.44, 0.44, 4.4, 16, P, [x, 0, -0.1], 'z');                  // ống composite
      for (const z of [-1.8, -0.2, 1.4]) kb.cyl(0.48, 0.48, 0.14, 16, D, [x, 0, z], 'z');   // đai ống
      kb.cyl(0.47, 0.47, 0.2, 16, D, [x, 0, 2.2], 'z');                   // đáy ống (cửa khí nén)
      kb.cyl(0.47, 0.44, 0.16, 16, D, [x, 0, -2.3], 'z');                 // vành miệng ống
      kb.box(0.5, 0.05, 0.16, M.steel || D, [x, 0.46, -0.2 + (rnd() - 0.5) * 0.4]);   // băng dính bạc quấn đai
      tubes.push([x, 0, -2.45]);
      // nắp nhựa đầu ống: nhóm riêng, bật văng khi phóng (kamikaze_uav.js)
      const cap = new THREE.Group();
      cap.position.set(x, 0, -2.42);
      const cb = new VehicleKit.PartBatch(ctx.yBase + 2.1);
      cb.cyl(0.42, 0.42, 0.06, 16, M.canvasDark || D, [0, 0, 0], 'z');
      cb.box(0.5, 0.05, 0.02, M.canvas || P, [0, 0.12, -0.04]);
      cb.build(cap);
      tilt.add(cap);
      caps.push(cap);
    }
    kb.cyl(0.3, 0.3, 0.04, 14, M.soot || D, [0.55, 0, -2.4], 'z');        // muội trong miệng ống bên phải (đã phóng nhiều lần)
    kb.box(0.04, 0.3, 1.0, M.canvas || P, [-1.0, 0.1, 0.4], [0, 0, (rnd() - 0.5) * 0.1]);   // nhãn cảnh báo bạc màu
    kb.build(tilt);
    unit.kamiRack = { group: seat, tilt, tubes: tubes.map(p => new THREE.Vector3(p[0], p[1], p[2])), caps };
    return 'kamiRack';
  }

  const ROOF_BUILDERS = {
    ewjam: buildRoofJammer, rcws: buildRoofRCWS, agl: buildRoofAGL, rocket: buildRoofRockets,
    sradar: buildRoofRadar, rjam: buildRoofLockJammer,
    // vũ khí chính xe trinh sát (ctx.asMain) & ống phóng UAV cảm tử lựu pháo — cùng chân đế
    sagl: (seat, ctx) => buildRoofAGL(seat, ctx, { hv: true }),
    srocket: (seat, ctx) => buildRoofRockets(seat, ctx, { cols: 4, rows: 2 }),
    kami: buildKamiLauncher
  };

  // ---------------------------------------------------------------------------
  // GẮN / GỠ MÓN, DỰNG RIÊNG CHO ẢNH KHO ĐỒ
  // ---------------------------------------------------------------------------
  window.RoofMounts = {
    STATION_SCALE,
    ids: () => Object.keys(ROOF_BUILDERS),
    has: (id) => !!ROOF_BUILDERS[id],
    mount: mountRoof,
    // Dựng riêng 1 món (ảnh trong kho trang bị — equipment_thumbs.html), không cần cả chiếc xe
    build(id, M) {
      const b = ROOF_BUILDERS[id];
      if (!b) return null;
      const seat = new THREE.Group();
      b(seat, { M, P: M.paint, D: M.dark, unit: {}, yBase: 20, rnd: VehicleKit.mulberry32(7) });
      return seat;
    }
  };
})();
