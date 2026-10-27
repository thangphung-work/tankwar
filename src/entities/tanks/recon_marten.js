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
  const HINGE_Z = HATCH_R + 0.45, LID_OPEN = 2.6, LID_GRIP = 0.7;   // LID_GRIP: quai kéo trong nắp, tỉ lệ bản lề -> tâm nắp   // bản lề ngay mép sau vòng; nắp mở ngả hẳn ra sau (~150°) tựa trên nóc, chừa chỗ xoay người bắn   // bản lề lùi xa về đuôi xe: nắp mở không chắn chỗ xoay người bắn   // trục bản lề nắp (lùi sau vòng), góc nắp khi mở
  // khớp ngóc súng máy: trên trụ chìa ra trước vòng (tay đòn), cao ~0.43 m — khóa nòng + tay cầm nằm ngay NGOÀI mép trước
  // lỗ nóc: nắp (bản lề sau, mép trước quét cung ~0.9 m) lật mở / đóng không quét qua súng, ngóc 60° tay cầm không chạm nóc
  // trụ súng cao ~57 cm trên vòng: ngóc +70° (bắn drone) thì tay cầm / tấm hậu sau súng (cách chốt ~0.4 m) vẫn cao hơn tay
  // đòn giá & vành lỗ. Trụ cũ 3.4: từ ~45° trở lên tay cầm cắm vào giá, xạ thủ phải với xuyên qua vành mới tới
  const GUN_Y = 4.6, GUN_Z = -6.6;
  const GUN_LIFT = GUN_Y - 3.4;   // trụ cao hơn bản trước: xạ thủ đứng cao lên đúng chừng đó (vehicle_crew mg.lift)
  const GUN_DY = GUN_Y - 1.8;  // trụ cao hơn bản đầu (1.8): tấm chắn nâng theo (mép dưới tấm chắn giữ nguyên — dài xuống thêm GUN_LIFT)
  const STAND = new THREE.Vector3(0, -0.9, GUN_Z + 6.6);   // chỗ đứng xạ thủ (tâm lỗ): tay cầm súng cách thân ~0.4 m
  // hộp đạn khi thay (hệ vòng tháp): ôm trước ngực trái / điểm lấy đà quăng qua mạn trái / giá hộp mới trong khoang (trước
  // bụng xạ thủ, trong lòng lỗ) / ôm hộp mới ngang ngực (giữa lòng lỗ: nhấc thẳng đứng không quệt vành)
  const AMMO_CHEST = new THREE.Vector3(-1.7, 3.9, STAND.z - 2.9), AMMO_THROW = new THREE.Vector3(-2.5, 4.5, STAND.z - 2.3);
  const AMMO_PICK = new THREE.Vector3(-0.8, -1.7, STAND.z - 2.0), AMMO_HOLD = new THREE.Vector3(-0.9, 3.0, STAND.z - 2.1);
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  // tay kéo lên đạn theo tiến độ nạp (mốc trong vehicle_crew, khớp tay xạ thủ)
  const chargePull = (pr) => (typeof VehicleCrew !== 'undefined' && VehicleCrew.chargePull ? VehicleCrew.chargePull(pr) : 0);
  // ống tên lửa trên giá cố định bên phải trụ súng (hệ tháp: ngang khớp ngóc súng, ngoài tấm chắn; hạ thấp để xạ thủ với tới
  // đuôi ống). Giá bắt vào vòng xoay: quay ngang theo tháp nhưng KHÔNG ngóc theo súng — phóng theo ống rồi tự dẫn lên đường ngắm
  // (nằm thấp ngay dưới mép cánh chắn phải — không đâm xuyên cánh)
  const ATGM_AT = new THREE.Vector3(3.05, 2.2, GUN_Z - 0.4), ATGM_TILT = 0.04;
  const TIRE_LUG = 0.5;        // chiều cao gai lốp
  const TIRE_BEAD = 2.3;       // bán kính mép vành
  // Sơn / thép sẫm của xe đọc màu đỉnh (che khuất, độ cao, mặt ngửa — shader thời tiết). Mesh rời không qua PartBatch thiếu
  // thuộc tính này thì WebGL đọc (0,0,0) -> nắp ống, vành ống, lẫy... đen kịt như nhựa đen: bù màu đỉnh theo pháp tuyến
  function wx(geo) {
    if (geo.attributes.color) return geo;
    const n = geo.attributes.normal, c = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) {
      const ny = n.getY(i);
      c[i * 3] = ny < -0.5 ? 0.8 : 1; c[i * 3 + 1] = 1; c[i * 3 + 2] = ny > 0.55 ? Math.min(1, (ny - 0.55) / 0.35) : 0;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  }

  function buildMarten(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team, { battle: 1, seed: K.lookSeed(unit) });
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    // vành thép sơn sẫm ăn bụi bùn như phần gầm (dùng chung thép sẫm đã có lớp thời tiết + mòn mép) — vành trơn một màu
    // không bụi trông như bánh xe đồ chơi bằng nhựa
    // + màng bùn đất bám như bộ phận chạy, gỉ loang mép vành (trước đây vành sẫm phản trời xanh, sạch như nhựa)
    // (vật liệu riêng: thép sẫm "dark" dùng màu đỉnh làm kênh mòn / bóng đổ — bọc lớp bùn lên sẽ hiểu nhầm thành màu đỏ tím)
    M.rim = K.dirtyMaterial(new THREE.MeshStandardMaterial({ color: 0x2c2d28, roughness: 0.78, metalness: 0.35, envMap: M.dark.envMap || null, envMapIntensity: 0.3 }), 0.65, { rust: 0.3 });
    // biển số tôn sơn trắng đã ngả màu, bám bụi / bùn bắn, vệt nước chảy, mép gỉ (trắng tinh trông như nhãn dán)
    M.plate = new THREE.MeshStandardMaterial({ color: 0xc9c5b2, map: M.rubber.map || null, roughness: 0.8, metalness: 0.1 });
    if (typeof Weathering !== 'undefined') Weathering.apply(M.plate, 'paint', { grime: 0.9, grimeH: 6, dust: 0.7, streak: 0.7, stain: 0.7, rust: 0.4, chip: 0.35, fade: 0.2, moss: 0, vary: 0, scale: 3 });
    const rnd = K.lookRng(unit);   // vẻ ngoài gieo theo xe: dựng lại (đổi trang bị) vẫn y chiếc cũ

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
    let casings = null;
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
        const sm = x => x * x * (3 - 2 * x);
        // vũ khí chính trên chân đế mô-đun: khối ngóc giật lùi rồi về, đầu đạn rocket trong ống theo số quả còn lại
        if (u.mainGun) {
          const G = u.mainGun;
          if (G.recoil) G.recoil.position.z *= Math.exp(-dt * 14);
          if (G.rounds) {
            // đang nạp lại giàn: đầu đạn hiện dần từng ống theo tiến độ nạp
            // (mỗi quả hiện ở ống đúng lúc xạ thủ tống vào tới chốt — pha 0.92 của lượt nạp quả đó, khớp vehicle_crew)
            const n = G.rounds.length;
            // (nạp bù: tiến độ bắt đầu từ số quả còn trong giàn — spg startScoutReload)
            const left = u.reloadTimer > 0 ? Math.min(n, Math.max(u.gatlingMag || 0, Math.floor((1 - u.reloadTimer / Math.max(0.1, u.reloadDuration || 1)) * n + 0.08))) : u.gatlingMag;
            G.rounds.forEach((m, i) => { m.visible = i >= n - left; });
            if (G.rearCaps) {
              const rp = u.reloadTimer > 0 ? Math.max(0, Math.min(0.999999, 1 - u.reloadTimer / Math.max(0.1, u.reloadDuration || 1))) : 1;
              const loadI = u.reloadTimer > 0 ? n - 1 - Math.min(n - 1, Math.floor(rp * n)) : -1;
              const ph = u.reloadTimer > 0 ? rp * n - Math.floor(rp * n) : 1;
              G.rearCaps.forEach((cap, i) => {
                const loaded = i >= n - left;
                let open = loaded ? 0 : 1;
                if (i === loadI) open = ph < 0.90 ? 1 : 1 - sm(Math.max(0, Math.min(1, (ph - 0.90) / 0.08)));
                cap.rotation.x = -1.72 * open;
              });
            }
            // quả vừa vào chốt: cả giàn giật khựng về trước một chút
            if (G._left !== undefined && left > G._left && u.reloadTimer > 0 && G.recoil) G.recoil.position.z = -0.12;
            G._left = left;
          }
        }
        // Nạp đạn súng máy: nòng ngóc lên, lật nắp khóa nòng, tháo hộp đạn rỗng, lắp hộp mới, đóng nắp
        // (nạp thông minh: hộp cũ còn đạn vẫn thay — tới mốc tháo hộp spg mới xóa số đạn còn lại)
        const reloading = !u.isDead && u.reloadTimer > 0 && u.reloadDuration > 0;
        // mốc hoạt cảnh theo nhịp thật của từng bước (VehicleCrew.mgReloadPr — bảng MG_WARP), không chia đều theo thời gian
        const pr = !reloading ? 1 : typeof VehicleCrew !== 'undefined' && VehicleCrew.mgReloadPr ? VehicleCrew.mgReloadPr(u) : 1 - u.reloadTimer / u.reloadDuration;
        const seg = (a, b) => Math.max(0, Math.min(1, (pr - a) / (b - a)));
        const tilt = reloading ? sm(seg(0, 0.12)) * (1 - sm(seg(0.88, 1))) : 0;
        // súng đang lắp: 12.7 (mặc định) hoặc phóng lựu cầm tay trên cùng chốt (u._mgParts — nắp / hộp đạn riêng)
        const K = u._mgParts || mg;
        if (!u._mgParts) mg.barrel.rotation.x = 0.2 * tilt;
        // TRÌNH TỰ THAY ĐẠN (pr 0..1, khớp MG_KEYS bên vehicle_crew):
        //  0.08-0.14 lật nắp khóa nòng | 0.14-0.24 nhấc và rút dây cũ khỏi khay | 0.28-0.47 hạ hộp rỗng bằng hai tay
        //  0.49-0.55 cúi xuống tìm quai | 0.55-0.70 nhấc hộp mới qua lỗ, ghì vào khay | 0.70-0.75 mở nắp hộp
        //  0.79-0.88 luồn dây mới vào khay nạp | 0.88-0.92 sập nắp khóa nòng | 0.92-1 kéo tay lên đạn
        // bóp cò khi mới lật nắp (hộp cũ chưa tháo): nắp sập lại trong MG_ABORT_T rồi bắn tiếp (spg scoutSmartReload)
        const abortK = !reloading && u._mgAbortT > 0 ? (u._mgAbortOpen || 0) * Math.min(1, u._mgAbortT / SPGUnit3D.MG_ABORT_T) : 0;
        K.cover.rotation.x = reloading ? -1.2 * sm(seg(0.08, 0.14)) * (1 - sm(seg(0.88, 0.92))) : -1.2 * abortK;
        // ĐƯỜNG ĐI HỘP ĐẠN (hệ vòng tháp; a = chỗ hộp nằm trên khay). Hộp 100 viên ~13 kg: luôn có hai tay đỡ, kéo sát người rồi
        // mới đổi hướng, không bay chéo xuyên vành / nóc:
        //  hộp rỗng 0.28-0.33 nhấc khỏi chốt khay | 0.33-0.40 kéo về trước ngực bên trái | 0.40-0.43 lấy đà -> quăng qua mạn trái
        //  (rơi xuống đất — toss bên dưới) | hộp mới 0.49-0.55 nằm trên giá trong khoang | 0.55-0.62 nhấc thẳng đứng giữa lòng lỗ
        //  lên ngang ngực | 0.62-0.70 nâng qua mép lỗ, đặt xuống khay
        const T = u.turretGroup, par = K.ammo.parent;
        const a = T.worldToLocal(par.localToWorld(_v.copy(K.ammo0))).clone();
        let rx = 0, ry = 0, rz = 0, vis = true, at = null;
        if (reloading && pr >= 0.28 && pr < 0.70) {
          const lift = _v2.set(a.x, a.y + 0.45, a.z + 0.25);
          if (pr < 0.33) { const k = sm(seg(0.28, 0.33)); at = a.clone().lerp(lift, k); rz = 0.06 * k; }
          else if (pr < 0.40) {
            const k = sm(seg(0.33, 0.40));
            at = lift.clone().lerp(AMMO_CHEST, k); at.y += 0.35 * Math.sin(Math.PI * k);
            ry = 0.5 * k; rz = 0.06 + 0.1 * k; rx = -0.08 * k;
          } else if (pr < 0.43) {
            const k = sm(seg(0.40, 0.43));
            at = AMMO_CHEST.clone().lerp(AMMO_THROW, k); ry = 0.5 + 0.3 * k; rz = 0.16 + 0.25 * k; rx = -0.08 - 0.2 * k;
          } else if (pr < 0.49) vis = false;
          else if (pr < 0.55) at = AMMO_PICK.clone();
          else if (pr < 0.62) { const k = sm(seg(0.55, 0.62)); at = AMMO_PICK.clone().lerp(AMMO_HOLD, k); ry = -0.25 * k; rx = 0.05 * Math.sin(Math.PI * k); }
          else {
            const k = sm(seg(0.62, 0.70)), k1 = Math.min(1, k / 0.75), k2 = Math.max(0, (k - 0.75) / 0.25);
            at = AMMO_HOLD.clone().lerp(lift, k1); at.y += 0.6 * Math.sin(Math.PI * k1) * (1 - k2);
            at.lerp(a, k2); ry = -0.25 * (1 - k1); rx = 0.06 * Math.sin(Math.PI * k);
          }
        }
        if (at) K.ammo.position.copy(par.worldToLocal(T.localToWorld(at)));
        else K.ammo.position.copy(K.ammo0);
        K.ammo.rotation.set(rx, ry, rz);
        // mức đạn trong hộp: hộp đang lắp theo số đạn còn; hộp mới (từ lúc cúi lấy) đầy
        if (K.fill) K.fill.set(reloading && pr >= 0.45 ? 1 : (u.gatlingMag || 0) / Math.max(1, u.gatlingMagMax || 100));
        // (giàn rocket: súng 12.7 & hộp đạn đã ẩn — không bật hiện lại hộp đạn mỗi khung hình)
        if (!(u.mainGun && !u._mgParts)) K.ammo.visible = vis;
        // QUĂNG HỘP RỖNG: bản sao hộp bay theo quỹ đạo thật trong hệ thế giới (xe chạy / tháp quay không kéo theo), nảy một
        // lần trên mặt đất cạnh xe rồi nằm im, biến mất sau ~2.5 s. Tiếng "boxDrop" (spg SCOUT_RELOAD_STEPS 0.46) ~ lúc chạm đất
        if (reloading && pr >= 0.43 && pr < 0.49 && !K._tossed && K.ammo.parent) {
          K._tossed = true;
          const box = K.ammo.clone(true), host = u.group.parent;
          if (host) {
            // hộp rời tay ở điểm quăng (cuối nhịp lấy đà, đúng tư thế tay xạ thủ) — khung này K.ammo đã ẩn và về lại khay,
            // nhân bản ở đó thì hộp vụt từ khay súng bay đi trong khi tay xạ thủ ở chỗ khác
            K.ammo.position.copy(par.worldToLocal(T.localToWorld(_v.copy(AMMO_THROW))));
            K.ammo.rotation.set(-0.28, 0.8, 0.41);
            K.ammo.updateMatrixWorld(true);
            K.ammo.matrixWorld.decompose(box.position, box.quaternion, box.scale);
            K.ammo.position.copy(K.ammo0); K.ammo.rotation.set(0, 0, 0);
            box.visible = true;
            host.add(box);
            const o = T.localToWorld(_v.set(0, 0, 0)).clone();
            const vel = T.localToWorld(_v.set(-17, 10, 2.5)).clone().sub(o);   // vượt mép nóc (nửa bề ngang thân 8) trước khi rơi thấp
            // hộp mang theo vận tốc xe lúc rời tay (xe đang chạy: hộp bay xuôi theo rồi mới nảy, trượt chậm lại trên đất)
            vel.add(u.group.getWorldDirection(_v).multiplyScalar(-(u.isDead ? 0 : (u.speed || 0))));
            (K._tosses || (K._tosses = [])).push({ box, vel, spin: new THREE.Vector3(5 + Math.random() * 3, Math.random() * 2, 4), t: 0, bounced: false, y0: u.group.position.y + 0.45 });
          }
        }
        if (!reloading || pr < 0.3) K._tossed = false;
        if (K._tosses && K._tosses.length) {
          for (let i = K._tosses.length - 1; i >= 0; i--) {
            const q = K._tosses[i];
            q.t += dt;
            if (!q.rest) {
              q.vel.y -= 78 * dt;
              q.box.position.addScaledVector(q.vel, dt);
              q.box.rotation.x += q.spin.x * dt; q.box.rotation.y += q.spin.y * dt; q.box.rotation.z += q.spin.z * dt;
              if (q.box.position.y < q.y0 && q.vel.y < 0) {
                q.box.position.y = q.y0;
                if (!q.bounced) { q.bounced = true; q.vel.multiplyScalar(0.35); q.vel.y = Math.abs(q.vel.y) + 4; q.spin.multiplyScalar(0.4); }
                else { q.rest = true; q.box.rotation.set(0, q.box.rotation.y, 0); }
              }
            }
            if (q.t > 2.5 || u.isDead) { q.box.parent && q.box.parent.remove(q.box); K._tosses.splice(i, 1); }
          }
        }
        if (K.ammoLid) {
          // nắp hộp: hộp cũ đang mở (dây đạn đã kéo hết); hộp mới đóng tới lúc xạ thủ lật ra
          const lidOpen = !reloading ? 1 : pr < 0.49 ? 1 : sm(seg(0.70, 0.75));
          K.ammoLid.rotation.z = 1.9 * lidOpen;
          // dây đạn: số mắt xích hiện theo đoạn đã kéo vào súng; đầu dây (cho tay xạ thủ bám)
          // dây cũ được nhấc khỏi khay rồi rút dần về hộp; dây mới chỉ xuất hiện khi tay kéo ra khỏi miệng hộp
          const feed = !reloading ? 1 : pr < 0.14 ? 1 : pr < 0.24 ? 1 - sm(seg(0.14, 0.24)) : pr < 0.79 ? 0 : sm(seg(0.79, 0.88));
          const n = K.links.length, shown = Math.round(feed * n);
          K.links.forEach((l, i) => { l.visible = i < shown; });
          K.beltTip = K.beltPts.getPointAt(Math.max(0, Math.min(1, feed)));
        }
        // DÂY ĐẠN CHẠY VÀO SÚNG KHI BẮN: mỗi phát lẫy kéo dây giật tới đúng một bước mắt xích (~0.04 s rồi đứng chờ phát sau)
        // — viên đầu chui vào khay nạp, cả dây trườn lên, viên mới nhô khỏi miệng hộp; đoạn dây võng rung lắc theo nhịp bắn
        if (K.links && K.links.length > 1) {
          const B = K._beltAnim || (K._beltAnim = { s: 0, q: 0, shake: 0, T: 0, base: null });
          const Ls = K.links, n = Ls.length;
          if (!B.base) B.base = Ls.map(l => ({ p: l.position.clone(), q: l.quaternion.clone() }));
          if (reloading || u.isDead) { B.s = 0; B.q = 0; B.shake = 0; }
          if (B.q > 0) {
            B.s += dt / 0.04;
            while (B.s >= 1 && B.q > 0) { B.s -= 1; B.q--; }
            if (B.q <= 0) B.s = 0;
          }
          B.shake *= Math.exp(-dt * 7);
          B.T += dt;
          if (B.s > 0 || B.shake > 0.01 || B._moved) {
            B._moved = B.s > 0 || B.shake > 0.01;
            const s = B.s;
            for (let i = 0; i < n; i++) {
              const a = B.base[i], last = i === n - 1;
              const b = last ? null : B.base[i + 1];
              if (b) { Ls[i].position.lerpVectors(a.p, b.p, s); Ls[i].quaternion.slerpQuaternions(a.q, b.q, s); }
              else { Ls[i].position.copy(a.p).addScaledVector(_v.subVectors(a.p, B.base[i - 1].p), s); Ls[i].quaternion.copy(a.q); }
              // đoạn giữa dây (võng xuống) rung mạnh nhất, hai đầu (miệng hộp / khay nạp) bị giữ
              const w = Math.sin(Math.PI * (i + s) / (n - 1));
              Ls[i].position.y += Math.sin(B.T * 52 + i * 1.3) * 0.03 * B.shake * w;
              if (last && !reloading) Ls[i].visible = s <= 0.5;   // viên đầu đã vào trong khóa nòng (dây mới trườn lên thế chỗ)
            }
          }
        }
        // tay kéo lên đạn 12.7 (khớp MG_KEYS bên vehicle_crew): kéo lùi hết cỡ -> buông, lò xo bật về -> kéo lần 2 -> buông
        if (K.charge) {
          const cp = reloading ? chargePull(pr) : 0;
          K.charge.position.z = K.charge0 + K.chargeLen * cp;
          // buông tay kéo: lò xo đẩy khối khóa nòng ~10 kg phóng về đập "CHÁT" -> cả súng nảy trên chốt giá (như một phát bắn nhẹ)
          if (K.kick && (K._cp || 0) > 0.85 && cp < 0.5) {
            const J = K._kj || (K._kj = { p: 0, vp: 0, y: 0, vy: 0, z: 0, vz: 0 });
            J.vp -= 0.55 + Math.random() * 0.2;
            J.vy += (Math.random() - 0.5) * 0.5;
            J.vz = (J.vz || 0) - 3.0;
          }
          K._cp = cp;
        }
        // Chớp lửa đầu nòng (spg.js đặt gatlingShotFlash = 1 mỗi phát) — của súng đang lắp (12.7 / phóng lựu)
        let f = u.gatlingShotFlash || 0;
        if (u.isDead) f = 0;
        const FL = K.flash ? K : mg;
        if (f > 0.1) {
          if (f >= 0.999) {
            // Xung riêng cho IK xạ thủ: VehicleCrew chạy trước phần giật súng trong frame này nên dùng bộ đếm,
            // frame kế tiếp vẫn nhận đủ từng phát thay vì phụ thuộc gatlingShotFlash đã bị suy giảm.
            u._crewRecoilSeq = (u._crewRecoilSeq || 0) + 1;
            // mỗi phát khác nhau: biến thể atlas, cỡ, độ dài lưỡi lửa, góc xoay; thỉnh thoảng khí thuốc phóng bén lửa lần hai
            const R = Math.random, big = R() < 0.12, k = (0.7 + R() * 0.5) * (big ? 1.2 : 1);
            FL.flash.scale.set(k, k, (0.7 + R() * 0.55) * (big ? 1.45 : 1));
            FL.flash.rotation.z = R() * Math.PI * 2;
            if (FL.discGeos) {
              FL.disc.geometry = FL.discGeos[(R() * 4) | 0];
              for (const p of FL.petals) p.geometry = FL.sideGeos[(R() * 4) | 0];
            }
            FL.flashPeak = 0.75 + R() * 0.25;
            // mỗi phát: vỏ đạn + mắt xích văng ra; lựu 40mm phụt cụm khói xám ở đầu nòng
            const src = u.barrelGroup;
            if (K.eject && src) (casings || (casings = makeCasings(u))).eject(K.eject, src);
            // lẫy cấp đạn kéo dây tới một mắt xích (dây đạn ở trên)
            if (K._beltAnim) { K._beltAnim.q = Math.min(3, K._beltAnim.q + 1); K._beltAnim.shake = 1; }
            // 12.7 trên chốt giá xoay: mỗi phát cả súng nảy (nòng hất lên + lệch ngang ngẫu nhiên — lò xo tắt dần), nòng
            // giật ngắn trong hộp khóa nòng
            if (K.kick) {
              const J = K._kj || (K._kj = { p: 0, vp: 0, y: 0, vy: 0, z: 0, vz: 0 });
              J.vp += 0.9 + Math.random() * 0.5;
              J.vy += (Math.random() - 0.5) * 0.9;
              J.vz = (J.vz || 0) + 14 + Math.random() * 4;
              if (K.tube) K.tube.position.z = 0.16;
            }
            if (K.smokeAt && src && typeof ReloadFX !== 'undefined' && (K._sm = (K._sm || 0) + 1) % (K.smokeEvery || 1) === 0) {
              const p = src.localToWorld(_v.copy(K.smokeAt)), dw = src.localToWorld(K.smokeAt.clone().add(V3(0, 0, -1))).sub(p);
              ReloadFX.puff(u, p, dw, K.smokeN || 2);
            }
          }
          FL.flash.visible = true;
          const o = Math.min(1, f) * (FL.flashPeak || 1) * (u.stealthAlpha !== undefined ? u.stealthAlpha : 1);
          FL.flashMat.opacity = o; FL.flashMat.depthWrite = false;
          if (FL.sideMat) { FL.sideMat.opacity = o * 0.9; FL.sideMat.depthWrite = false; }
          // chớp thật ~1-2 ms: tắt sau 1-2 khung (bản cũ còn mờ mờ 3-4 khung như đốm sáng treo trước nòng)
          u.gatlingShotFlash = f * Math.exp(-dt * 60);
        } else {
          FL.flash.visible = false;
          u.gatlingShotFlash = 0;
        }
        if (casings) casings.update(dt);
        // lò xo giật của cả súng trên chốt giá (tần số ~5 Hz, tắt trong ~0.3 s) + nòng về trước (lò xo đẩy về rất nhanh)
        if (K.kick && K._kj) {
          const J = K._kj, h = Math.min(dt, 0.033), w2 = 900, c = 26;
          J.vp += (-w2 * J.p - c * J.vp) * h; J.p += J.vp * h;
          J.vy += (-w2 * J.y - c * J.vy) * h; J.y += J.vy * h;
          J.vz = (J.vz || 0) + (-w2 * (J.z || 0) - c * (J.vz || 0)) * h; J.z = (J.z || 0) + J.vz * h;
          // đang thay hộp: hãm rung (tay đang thao tác) — trừ lúc kéo lên đạn, súng phải nảy khi khối khóa nòng đập về
          if (u.isDead || (reloading && pr < 0.92)) { J.p *= 0.8; J.y *= 0.8; J.z *= 0.8; J.vp *= 0.5; J.vy *= 0.5; J.vz *= 0.5; }
          K.kick.rotation.set(Math.max(-0.02, J.p), J.y, 0);
          K.kick.position.set(0, 0, Math.max(-0.02, J.z));
          if (K.tube) K.tube.position.z *= Math.exp(-dt * 40);
        }
      }
    };
    return { hullW: HALF_W * 2 };
  }

  // VỎ ĐẠN VĂNG khi bắn (12.7: vỏ đồng + mắt xích; 40mm: vỏ lựu to + mắt xích): mô phỏng trong hệ thân xe (đi theo xe), rơi
  // xuống nóc nảy lách cách rồi nằm chốc lát; rơi vào lỗ nóc / ra ngoài mép nóc thì rơi tiếp tới lúc hết đời. Chỉ gần camera
  let CASE_RES = null;
  function casingRes() {
    if (CASE_RES) return CASE_RES;
    return (CASE_RES = {
      hmg: new THREE.CylinderGeometry(0.07, 0.075, 0.42, 6), agl: new THREE.CylinderGeometry(0.17, 0.17, 0.42, 8),
      link: new THREE.BoxGeometry(0.32, 0.05, 0.1),
      brass: new THREE.MeshStandardMaterial({ color: 0x4a360f, roughness: 0.38, metalness: 0.85 }),   // vỏ đồng mới bắn: sáng hơn dây đạn chút
      linkM: new THREE.MeshStandardMaterial({ color: 0x232321, roughness: 0.6, metalness: 0.5 })
    });
  }
  function makeCasings(unit) {
    const R = casingRes(), items = [], MAX = 30;
    const _a = new THREE.Vector3(), _b = new THREE.Vector3();
    function spawn(body, src, at, dir, geo, mat, speed) {
      let it = items.length >= MAX ? items.shift() : null;
      if (!it) { it = { m: new THREE.Mesh(geo, mat) }; it.m.castShadow = false; }
      it.m.geometry = geo; it.m.material = mat;
      // điểm & hướng nhả từ hệ súng (đang giật / ngóc) sang hệ thân xe
      body.worldToLocal(src.localToWorld(_a.copy(at)));
      body.worldToLocal(src.localToWorld(_b.copy(at).add(dir))).sub(_a).normalize();
      const sp = speed * (0.8 + Math.random() * 0.4);
      Object.assign(it, { x: _a.x, y: _a.y, z: _a.z, vx: _b.x * sp + (Math.random() - 0.5) * 3, vy: _b.y * sp + Math.random() * 2, vz: _b.z * sp + (Math.random() - 0.5) * 3,
        sx: (Math.random() - 0.5) * 30, sz: (Math.random() - 0.5) * 30, t: 0, rest: false, hits: 0,
        sndKind: geo === R.link ? 'link127' : 'case127', life: 1.6 + Math.random() * 0.6 });
      it.m.position.set(it.x, it.y, it.z);
      it.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      it.m.visible = true;
      body.add(it.m);
      items.push(it);
    }
    return {
      eject(E, src) {
        const body = unit.chassisGroup;
        if (!body || !src || !unit.scene) return;
        if (typeof SpgFXPool !== 'undefined' && SpgFXPool.isNearView && !unit.isPlayer && !SpgFXPool.isNearView(unit.x, unit.z)) return;
        const big = E.kind === 'agl';
        spawn(body, src, E.at, E.dir, big ? R.agl : R.hmg, R.brass, big ? 10 : 16);
        spawn(body, src, E.link, E.linkDir, R.link, R.linkM, big ? 9 : 13);
      },
      update(dt) {
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i], m = it.m;
          it.t += dt;
          if (it.t >= it.life) { m.parent && m.parent.remove(m); items.splice(i, 1); continue; }
          if (it.rest) continue;
          it.vy -= 78 * dt;
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          m.rotation.x += it.sx * dt; m.rotation.z += it.sz * dt;
          // mặt nóc (trừ lỗ nóc vòng súng): nảy, mất đà, rồi nằm nghiêng
          const onRoof = Math.abs(it.x) < 7.0 && it.z > -6.6 && it.z < 16.8 && Math.hypot(it.x, it.z - RING_Z) > HATCH_R + 0.2;
          if (onRoof && it.y < ROOF_Y + 0.06 && it.vy < 0 && it.y > ROOF_Y - 1) {
            it.y = ROOF_Y + 0.06;
            const impact = -it.vy;
            if (unit.isPlayer && impact > 2.2 && it.hits < 3 && window.soundEngine && window.soundEngine.playEjectedCasingHit) {
              window.soundEngine.playEjectedCasingHit(it.sndKind, Math.min(1.2, impact / 15) * Math.pow(0.62, it.hits), it.x / 8, true);
              it.hits++;
            }
            if (it.vy < -6) { it.vy *= -0.3; it.vx *= 0.5; it.vz *= 0.5; it.sx *= 0.5; it.sz *= 0.5; }
            else { it.rest = true; m.rotation.x = Math.PI / 2; m.rotation.z = 0; }
          }
          if (it.y < ROOF_Y - 6) it.t = it.life;   // rơi khuất vào lòng xe / xuống đất
          m.position.set(it.x, it.y, it.z);
        }
      }
    };
  }

  // Cắt vát góc đa giác [x, z]: mỗi đỉnh thay bằng 2 đỉnh lùi k đơn vị theo hai cạnh kề (góc đứng thân xe vát chéo)
  // KHỐI BO CẠNH CHO SÚNG: PartBatch.box chỉ vát khối lớn (> ~11 cm) -> chi tiết súng toàn hộp góc sắc như đồ lắp ghép
  // nhựa. Hộp bo tròn mọi cạnh (bán kính r), khối tiện tròn quanh trục Z, khối đùn theo mặt cắt cạnh có bo mép
  function roundBox(w, h, d, r) {
    r = Math.max(0.004, Math.min(r, w * 0.45, h * 0.45, d * 0.45));
    const iw = w / 2 - r, ih = h / 2 - r, c = Math.min(iw, ih, r) * 0.9;
    const sh = new THREE.Shape();
    sh.moveTo(-iw + c, -ih); sh.lineTo(iw - c, -ih); sh.quadraticCurveTo(iw, -ih, iw, -ih + c);
    sh.lineTo(iw, ih - c); sh.quadraticCurveTo(iw, ih, iw - c, ih); sh.lineTo(-iw + c, ih);
    sh.quadraticCurveTo(-iw, ih, -iw, ih - c); sh.lineTo(-iw, -ih + c); sh.quadraticCurveTo(-iw, -ih, -iw + c, -ih);
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.002, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 3 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return g;
  }
  // tròn xoay theo mặt cắt [[r, t], ...]: t chạy dọc +Z (dir 1) hoặc -Z (dir -1) từ gốc
  function latheZ(prof, seg, dir = 1) {
    const g = new THREE.LatheGeometry(prof.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)), seg);
    g.rotateX(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    return g;
  }
  // khối đùn theo mặt cắt cạnh [[z, y], ...], bề ngang `width` theo X (tâm x = 0), bo mép bán kính r
  function roundProfile(pts, width, r) {
    const sh = new THREE.Shape();
    pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
    sh.closePath();
    const depth = Math.max(0.01, width - 2 * r);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 2, curveSegments: 2 });
    g.rotateY(-Math.PI / 2);
    g.translate(depth / 2, 0, 0);
    return g;
  }
  // đinh tán đầu tròn trên mặt phẳng pháp tuyến ±X
  const rivet = (b, mat, x, y, z, s, r = 0.034) => b.add(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat, [x, y, z], [0, 0, -s * Math.PI / 2]);

  // CHỚP LỬA ĐẦU NÒNG (atlas lửa có thớ như pháo 6 nòng — fsv_hailstorm): 1 đĩa nhìn dọc nòng + 3 lưỡi lửa dọc nòng xếp 60°
  // quanh trục, gốc lưỡi lửa ngay miệng loa (nhìn góc nào cũng ra hình ngọn lửa); mỗi phát đổi biến thể / cỡ / góc xoay.
  // Bản cũ: quả cầu sáng tròn có tia sao vẽ sẵn + 2 tấm chéo (nhìn ngang thành vạch sáng dựng đứng), cách miệng ~12 cm
  function makeMuzzleFlash(z, discS, sideW, sideL) {
    const atlas = VehicleKit.getAutocannonFlashAtlas();
    const mk = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const flashMat = mk(atlas.front), sideMat = mk(atlas.side);
    const quads = (w, h, tip) => [0, 1, 2, 3].map(q => {
      const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
      const u0 = (q % 2) * 0.5, v0 = (q >> 1) ? 0 : 0.5;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
      if (tip) { g.rotateX(Math.PI / 2); g.translate(0, 0, -h / 2); }   // lưỡi lửa dọc -Z, đỉnh ảnh (miệng nòng) ở gốc
      return g;
    });
    const discGeos = quads(discS, discS, false), sideGeos = quads(sideW, sideL, true);
    const flash = new THREE.Group();
    flash.position.set(0, 0.05, z);
    const disc = new THREE.Mesh(discGeos[0], flashMat);
    disc.position.z = -0.25;
    flash.add(disc);
    const petals = [];
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 3;
      const p = new THREE.Mesh(sideGeos[k], sideMat); arm.add(p); flash.add(arm); petals.push(p);
    }
    flash.traverse(o => { if (o.isMesh) { o.renderOrder = 14; o.userData.isFxDecal = true; } });
    flash.visible = false;
    return { flash, flashMat, sideMat, disc, petals, discGeos, sideGeos };
  }

  // Thép súng phốt phát hóa ngoài thực địa (12.7 / phóng lựu 40mm): xám đen xỉn ám bụi đất / dầu theo vân grime của xe,
  // cạnh cầm nắm mòn trơ thép, ốp nhựa sờn; muội đen đầu nòng. Thân súng không sơn rằn ri như thân xe (trông như đồ chơi)
  function gunMats(M) {
    if (M._gun) return M._gun;
    const grime = M.rubber && M.rubber.map;
    // mã màu là giá trị TUYẾN TÍNH (0x36 hiện ra xám vừa ~105/255 -> súng trông như nhựa xám): thép phốt phát hóa thật gần
    // đen xám. Kim loại phải có bầu trời để phản chiếu (envMap như thân xe) — không có thì metalness chỉ làm mặt xỉn phẳng
    // như nhựa; dầu bôi trơn cho ánh bóng mờ chạy dọc cạnh, mép cọ xát trơ thép sáng
    const env = (M.steel && M.steel.envMap) || (M.paint && M.paint.envMap) || null;
    const mat = (o, ei) => { const m = new THREE.MeshStandardMaterial(o); if (env) { m.envMap = env; m.envMapIntensity = ei; } return m; };
    return (M._gun = {
      m: mat({ color: 0x141412, map: grime, roughness: 0.6, metalness: 0.6 }, 0.3),
      dk: mat({ color: 0x0b0b0a, map: grime, roughness: 0.6, metalness: 0.5 }, 0.5),
      worn: mat({ color: 0x33322d, roughness: 0.42, metalness: 0.85 }, 0.55),   // mép mòn: sáng hơn thân chút, không thành vạch trắng
      grip: mat({ color: 0x0f0e0d, map: grime, roughness: 0.72, metalness: 0.0 }, 0.25),   // ốp tay cầm nhựa đen sờn
      soot: mat({ color: 0x090807, map: grime, roughness: 0.95, metalness: 0.1 }, 0.1)
    });
  }
  // Hộp đạn tôn sơn ô-liu xỉn (khác màu sơn xe), gờ tối, cạnh mòn trơ kim loại
  function canMats(M) {
    if (M._can) return M._can;
    return (M._can = {
      // (giá trị tuyến tính: ô-liu sẫm OD thật, không phải xanh lá tươi như hộp đồ chơi; chữ lô vàng xỉn)
      m: new THREE.MeshStandardMaterial({ color: 0x1c1e0f, map: M.rubber && M.rubber.map, roughness: 0.72, metalness: 0.25 }),
      dk: new THREE.MeshStandardMaterial({ color: 0x0f1008, roughness: 0.7, metalness: 0.35 }),
      worn: new THREE.MeshStandardMaterial({ color: 0x3a392f, roughness: 0.4, metalness: 0.75 }),
      stencil: new THREE.MeshStandardMaterial({ color: 0x2c220a, roughness: 0.85, metalness: 0.0 })
    });
  }

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
      hb.box(TIRE_W + 0.2, 2.6, 0.12, M.mudFlap || M.rubber, [s * WHEEL_X, 3.6, AXLES[1].z + WHEEL_R + 1.4], [0.08, 0, 0]);
      // Tấm chắn bùn cao su sau bánh trước: treo dưới thân ngay sau đuôi vè, lùi xa hơn bánh sau để bánh đánh lái không quệt;
      // thanh kẹp thép ở mép trên
      hb.setTag('flapF' + (s < 0 ? 'L' : 'R'));
      const ffz = AXLES[0].z + WHEEL_R + 1.6;
      hb.box(TIRE_W + 0.2, 2.6, 0.12, M.mudFlap || M.rubber, [s * WHEEL_X, 3.8, ffz], [0.08, 0, 0]);
      hb.box(TIRE_W + 0.3, 0.32, 0.22, M.dark, [s * WHEEL_X, 4.95, ffz - 0.06]);
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
    // GẠT MƯA (đỗ dọc mép dưới kính): trục gạt ở góc dưới bên trái mỗi tấm, khớp tâm cung quét vẽ trên kính
    // (getDirtyGlassTextures: gốc u 0.15, ngay dưới mép kính). Tay gạt thép dập (đoạn lòng máng gần gốc, đoạn thanh dẹt
    // về đầu) chúi dần xuống kính, kẹp vào giữa lưỡi; lưỡi gạt kiểu khung chạc: cầu chính + 2 chạc phụ, móng kẹp ôm
    // ray thép mỏng giữ dải cao su áp sát kính. Hệ tấm kính: gx ngang, gv dọc mặt kính lên trên, o nhô ra khỏi mặt cabin
    const cA = Math.cos(wsA), sA = Math.sin(wsA), [Yc, Zc] = onFace(13.15, 0);
    const gp = (gx, gv, o) => [gx, Yc + gv * cA + o * nY, Zc + gv * sA + o * nZ];
    // hộp dài theo phương ang (trong mặt kính), tilt > 0: đầu +len nhô xa kính hơn
    const gbox = (len, w, th, mat, gx, gv, o, ang, tilt = 0) => hb.box(len, w, th, mat, gp(gx, gv, o), [wsA, tilt, ang, 'XZY']);
    const wiper = (cx) => {
      const PX = cx - 2.13, PV = -1.70;                     // trục gạt (trên thanh khung dưới)
      const BX = cx + 0.2, BV = -1.24, bA = 0.03, BL = 3.3;  // giữa lưỡi gạt, góc đỗ, dài lưỡi (~41 cm)
      const dx = BX - PX, dv = BV - PV, aL = Math.hypot(dx, dv), aA = Math.atan2(dv, dx);
      const o0 = 0.47, o1 = 0.37, tilt = -Math.atan2(o0 - o1, aL);
      const onArm = (t, len, w, th) => gbox(len, w, th, D, PX + dx * t, PV + dv * t, o0 + (o1 - o0) * t, aA, tilt);
      hb.cyl(0.18, 0.2, 0.14, 12, D, gp(PX, PV, 0.31), 'z', [wsA, 0, 0]);   // bệ trục bắt trên khung
      gbox(0.72, 0.27, 0.15, D, PX + Math.cos(aA) * 0.2, PV + Math.sin(aA) * 0.2, 0.47, aA);   // đầu tay gạt đúc ôm trục
      hb.cyl(0.08, 0.09, 0.08, 8, D, gp(PX, PV, 0.58), 'z', [wsA, 0, 0]);   // nắp chụp đai ốc trục
      onArm(0.27, aL * 0.42, 0.13, 0.1);                    // đoạn lòng máng (che lò xo)
      onArm(0.72, aL * 0.5, 0.075, 0.055);                  // đoạn thanh dẹt về đầu
      // lưỡi gạt: điểm dọc lưỡi theo t (-BL/2..BL/2)
      const bx = (t) => BX + Math.cos(bA) * t, bv = (t) => BV + Math.sin(bA) * t;
      const blade = (t, len, w, th, mat, o) => gbox(len, w, th, mat, bx(t), bv(t), o, bA);
      blade(0, 0.26, 0.15, 0.12, D, 0.33);                  // kẹp nối tay gạt ở giữa cầu
      blade(0, BL, 0.05, 0.07, M.rubber || D, 0.165);        // dải cao su áp kính
      blade(0, BL, 0.085, 0.025, D, 0.21);                  // ray thép mỏng giữ cao su
      blade(0, 2.1, 0.07, 0.06, D, 0.31);                   // cầu chính
      for (const k of [-1, 1]) {
        blade(k * 1.05, 0.06, 0.06, 0.08, D, 0.28);         // khớp cầu chính - chạc phụ
        blade(k * 1.05, 0.95, 0.06, 0.05, D, 0.25);         // chạc phụ
        for (const t of [0.6, 1.5]) blade(k * t, 0.07, 0.1, 0.06, D, 0.225);   // móng kẹp ôm ray
        blade(k * (BL / 2 - 0.02), 0.06, 0.09, 0.07, D, 0.19);   // nắp chặn đầu ray
      }
    };
    for (const s of [-1, 1]) {
      const [gy, gz] = onFace(13.15, 0.08);
      hb.box(6.1, 3.1, 0.1, (s < 0 ? M.glassWindL : M.glassWindR) || M.glass, [s * 3.55, gy, gz], [wsA, 0, 0]);
      const [ty, tz] = onFace(14.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, ty, tz], [wsA, 0, 0]);
      const [by, bz] = onFace(11.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, by, bz], [wsA, 0, 0]);
      wiper(s * 3.55);
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
      // Nắp bình nhiên liệu tròn + hộp phụ kiện sau cửa (kèm nắp đậy, bản lề và khóa gài)
      hb.cyl(0.6, 0.6, 0.3, 12, D, [x + s * 0.12, 12.0, 11.8], 'x');
      hb.setTag('box' + (s < 0 ? 'L' : 'R'));
      hb.box(0.6, 2.2, 3.2, P, [x + s * 0.3, 11.2, 14.8]);
      hb.box(0.68, 0.12, 3.3, P, [x + s * 0.32, 12.32, 14.8]);
      hb.box(0.68, 0.08, 3.3, D, [x + s * 0.32, 11.95, 14.8]);
      hb.hinge([x + s * 0.04, 12.32, 14.8], 'z', 2.8, D, 0.10, 3);
      for (const dz of [-0.9, 0.9]) {
        hb.box(0.08, 1.4, 0.22, P, [x + s * 0.62, 11.0, 14.8 + dz]);
        hb.box(0.14, 0.42, 0.28, M.steel, [x + s * 0.64, 11.65, 14.8 + dz]);
      }
      hb.setTag(null);
    }

    // Đuôi xe: cửa sau, đèn hậu, can nhiên liệu trên giá chữ L, móc kéo
    hb.box(7.0, 4.6, 0.25, P, [0, 12.2, 17.7]);
    hb.box(7.2, 0.1, 0.3, D, [0, 14.6, 17.72]);
    hb.box(0.3, 1.2, 0.3, M.steel, [2.6, 12.0, 17.9]);
    for (const s of [-1, 1]) {
      hb.box(1.4, 0.9, 0.35, D, [s * 6.6, 8.6, 18.1]);
      hb.box(0.55, 0.45, 0.1, M.tailLens, [s * 6.9, 8.65, 18.3]);
      hb.setTag('can' + (s < 0 ? 'L' : 'R'));
      hb.jerrycan([s * 5.4, 12.0, 18.33], Math.PI / 2, 0.95, 2.9, 2.1, P, D);
      hb.box(2.22, 0.12, 1.08, D, [s * 5.4, 10.52, 18.33]); // khay đáy đỡ can
      hb.box(2.22, 0.34, 0.08, D, [s * 5.4, 10.68, 18.85]); // gờ chặn đáy
      hb.box(2.3, 0.2, 0.08, D, [s * 5.4, 11.3, 18.84]);
      hb.box(2.3, 0.2, 0.08, D, [s * 5.4, 12.6, 18.84]);
      hb.box(0.26, 0.30, 0.12, M.steel, [s * 5.4, 11.95, 18.87]); // khóa cài đai
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
    // Nóc: đường ghép, ống phóng lựu đạn khói (bệ thép, nắp cao su, cáp điểm hỏa), bệ ăng-ten
    hb.box(13.4, 0.06, 0.12, D, [0, ROOF_Y + 0.03, -2.0]);
    for (const s of [-1, 1]) {
      hb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      hb.box(0.45, 0.22, 2.3, P, [s * 6.35, ROOF_Y + 0.11, -4.8]);
      hb.box(0.28, 0.26, 0.42, D, [s * 6.18, ROOF_Y + 0.18, -3.55]);
      const rot = [0.45, 0, -s * 0.7];
      const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      for (let i = 0; i < 3; i++) {
        const c = [s * 6.5, ROOF_Y + 0.45, -5.6 + i * 0.8];
        const at = (d) => [c[0] + ax.x * d, c[1] + ax.y * d, c[2] + ax.z * d];
        hb.cyl(0.32, 0.32, 1.3, 10, D, c, 'y', rot);
        hb.cyl(0.35, 0.35, 0.12, 10, P, at(-0.32), 'y', rot);
        hb.cyl(0.36, 0.36, 0.16, 10, M.rubber, at(0.68), 'y', rot);
        hb.strut(at(-0.58), [s * 6.22, ROOF_Y + 0.18, -5.5 + i * 0.78], 0.03, M.rubber, 4);
      }
      hb.setTag(null);
    }
    // ăng-ten trước trái đứng ngay sau cụm ống phóng khói trái (z -5.95..-3.35) — trước đây đặt trùng chỗ, chân ăng-ten xuyên ống
    const antennas = [[-6.2, -2.7], [-6.2, 15.9], [6.2, 15.9]];
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
    for (const z of [7.0, 9.5]) {
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
    hb.cyl(0.32, 0.32, 0.2, 12, M.optic || M.glass, [-0.35, 0.05, -0.7], 'z');
    hb.cyl(0.22, 0.22, 0.2, 12, M.thermalWin || M.glass, [0.38, 0.05, -0.7], 'z');
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
  // Tay đòn bắt bu-lông lên vòng xoay ở mép trước lỗ nóc, chìa ra đỡ chân trụ vũ khí (GUN_Z, ngoài vòng) — quay theo vòng
  function ringArm(b, D) {
    const z0 = -(HATCH_R + 0.1), L = z0 - GUN_Z + 0.7;
    b.box(1.0, 0.4, L, D, [0, 0.45, z0 - L / 2]);
    b.box(1.3, 0.12, 1.0, D, [0, 0.62, z0 - 0.3]);   // tấm bắt vào vòng
  }

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
    const STENCIL = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp, transparent: true, opacity: 1, depthWrite: true };
    // LÒNG KHOANG TỐI: nóc che hết nắng, chỉ chút sáng lọt qua miệng lỗ -> nhìn từ trên xuống gần như đen, đồ đạc chỉ lờ mờ.
    // Trước đây vật liệu chuẩn nhận đủ nắng (lòng khoang sáng xám như ngoài trời, sơn ngụy trang sáng màu, vật liệu mất
    // texture hiện tím). Vật liệu không chịu sáng (Basic): thành khoang tối dần theo độ sâu (màu đỉnh), đáy gần đen, đồ
    // đạc ~15% màu gốc; riêng vành lót miệng lỗ (ló ra ánh sáng) vẫn chịu sáng, sẫm hơn chút
    const DIM = 0.15;
    const darkMat = (m, o) => {
      if (o === liner) { const c = m.clone(); c.color.multiplyScalar(0.7); return Object.assign(c, STENCIL); }
      if (o === wall) return new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, STENCIL));
      const col = (m.color ? m.color.clone() : new THREE.Color(0x2c2e27)).multiplyScalar(o === floor ? 0.25 : DIM);
      return new THREE.MeshBasicMaterial(Object.assign({ color: col, side: m.side }, STENCIL));
    };
    for (let i = 0; i < wc.length; i++) wc[i] *= 0.3;   // thành khoang: đỉnh ~0,1 -> đáy gần đen
    wallGeo.attributes.color.array.set(wc);
    // thứ tự vẽ (không xét độ sâu): thành khoang -> đáy -> đồ đạc trong khoang -> vành lót miệng lỗ
    pit.traverse(o => {
      if (!o.isMesh) return;
      o.material = darkMat(o.material, o);
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
    // quai kéo chữ U mặt trong (xạ thủ nắm kéo sập nắp từ trong lỗ) — gần tâm nắp: quai sát bản lề thì lúc nắp sập tay
    // bám quai bị kéo ra mép sau vòng, khuỷu lòi ra ngoài nóc (vehicle_crew nắm theo cùng hệ số LID_GRIP)
    lb.box(0.9, 0.1, 0.12, M.dark, [0, -0.5, LC * LID_GRIP]);
    for (const x of [-0.42, 0.42]) lb.box(0.12, 0.32, 0.12, M.dark, [x, -0.36, LC * LID_GRIP]);
    // 2 tai bản lề liền nắp
    for (const s of [-1, 1]) lb.box(0.45, 0.4, 0.7, M.dark, [s * 0.9, 0.0, -0.25]);
    lb.build(lid);
    turret.add(lid);
    unit.hatchLid = lid;
    lid.userData.open = LID_OPEN;
    lid.userData.grip = LID_GRIP;
    lid.rotation.x = LID_OPEN;   // mặc định mở (xạ thủ đứng súng); 0 = đóng nằm phẳng trên vòng
    // Trụ súng (chốt trên mép trước vòng) + tấm chắn đạn (2 cánh nghiêng hai bên khe súng + tấm trên / dưới): cụm riêng —
    // lắp vũ khí chính khác lên chân đế mô-đun thì tháo cả cụm (mountWeapon)
    const hmgMount = new THREE.Group();
    turret.add(hmgMount);
    const sb = new VehicleKit.PartBatch(ROOF_Y);
    sb.cyl(0.35, 0.5, GUN_Y, 10, M.dark, [0, GUN_Y / 2, GUN_Z]);
    sb.cyl(0.46, 0.46, 0.3, 12, M.dark, [0, GUN_Y - 1.25, GUN_Z]);              // vành kẹp chốt xoay trên trụ
    sb.cyl(0.12, 0.12, 0.5, 8, M.dark, [0.5, GUN_Y - 1.25, GUN_Z], 'x');        // tay vặn hãm hướng
    ringArm(sb, M.dark);
    for (const s of [-1, 1]) sb.box(0.12, 0.9, 1.3, M.dark, [s * 0.32, 1.0, GUN_Z + 0.55], [-0.6, 0, 0]);   // gân tam giác chân trụ
    sb.setTag('shield');
    const SZ = GUN_Z - 1.5;
    // 2 tấm trước vát chéo RA SAU từ khe súng (mũi tên chĩa về trước, làm trượt đạn) — không gập vào trong
    // (to hơn bản đầu ~15%: rộng 1.9 -> 2.2, cao 2.3 -> 2.7; mép trong vẫn chừa khe súng 0.4 mỗi bên)
    // Ô KÍNH CHỐNG ĐẠN (kiểu bộ chắn xạ thủ OGPK): khối kính nhiều lớp dày ~5 cm trong khung thép bắt bu-lông hai mặt, trên
    // mỗi cánh bên và phần trên 2 tấm trước — thay khe quan sát cũ (mẩu hộp đen bé dán lên tấm phẳng trơn)
    // kính chống đạn nhiều lớp: sẫm ánh xanh lục (lớp polycarbonate + mép kính dày), phản chiếu trời, vệt bụi / quệt lau
    // loang theo mặt nạ nhám của kính cửa xe (kính bụi sáng đục trông như tấm bảng trắng)
    const glassM = M._armorGlass || (M._armorGlass = new THREE.MeshStandardMaterial({
      color: 0x1d2724, roughness: 0.55, metalness: 0.35, roughnessMap: (M.glassDusty || M.glass).roughnessMap || null,
      envMap: M.glass.envMap || null, envMapIntensity: 1.0
    }));
    glassM.userData.surface = 'glass';
    const _e = new THREE.Euler(), _o = new THREE.Vector3();
    const onPlate = (c, rot, x, y, z) => { _o.set(x, y, z).applyEuler(_e.set(rot[0], rot[1], rot[2])); return [c[0] + _o.x, c[1] + _o.y, c[2] + _o.z]; };
    // tA: trục bề dày tấm ('x' cánh bên / 'z' tấm trước); (u0, v0): tâm ô kính trên mặt tấm (u ngang, v đứng); w x h: cỡ kính
    function armorWindow(c, rot, tA, u0, v0, w, h) {
      const P3 = (u, v, t) => onPlate(c, rot, tA === 'x' ? t : u, v, tA === 'x' ? u : t);
      const S3 = (su, sv, st) => (tA === 'x' ? [st, sv, su] : [su, sv, st]);
      const fw = 0.16;
      sb.box(...S3(w, h, 0.36), glassM, P3(u0, v0, 0), rot);
      for (const sv of [-1, 1]) sb.box(...S3(w + fw * 2, fw, 0.42), M.dark, P3(u0, v0 + sv * (h / 2 + fw / 2), 0), rot);
      for (const su of [-1, 1]) sb.box(...S3(fw, h, 0.42), M.dark, P3(u0 + su * (w / 2 + fw / 2), v0, 0), rot);
      for (const t of [-0.22, 0.22]) {
        for (const [bu, bv] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) {
          sb.cyl(0.06, 0.06, 0.05, 6, M.steel, P3(u0 + bu * (w / 2 + fw / 2), v0 + bv * (h / 2 + fw / 2), t), tA, rot);
        }
      }
    }
    for (const s of [-1, 1]) {
      const c = [s * 1.5, 2.95 + GUN_DY - GUN_LIFT / 2, SZ], rot = [0.18, -s * 0.28, 0];
      sb.box(2.2, 2.7 + GUN_LIFT, 0.22, M.paint, c, rot);
      armorWindow(c, rot, 'z', s * 0.15, 0.95, 1.15, 0.8);
      // hàng bu-lông mép ngoài (bắt bản lề cánh bên) + gờ thép dày ở mép khe súng (mép cắt lộ thép, ám muội đầu nòng)
      for (let i = 0; i < 5; i++) sb.cyl(0.07, 0.07, 0.06, 6, M.steel, onPlate(c, rot, s * 0.98, -1.5 + i * 0.7, -0.13), 'z', rot);
      sb.box(0.12, 2.7 + GUN_LIFT, 0.3, M.soot || M.dark, onPlate(c, rot, -s * 1.08, 0, 0), rot);
    }
    // CÁNH CHẮN HAI BÊN: tấm thép vát chéo ra sau mỗi bên (che sườn xạ thủ khỏi đạn bắn chéo), gân tăng cứng, lỗ quan sát
    for (const s of [-1, 1]) {
      // nối mép ngoài tấm trước to hơn; mép dưới giữ nguyên (ống tên lửa cố định nằm ngay dưới cánh phải), nới cao lên trên
      const th = s * 0.62, L = 2.7, x0 = s * 2.45, z0 = SZ + 0.26, cx = x0 + Math.sin(th) * L / 2, cz = z0 + Math.cos(th) * L / 2;
      sb.box(0.22, 2.9 + GUN_LIFT, L, M.paint, [cx, 2.9 + GUN_DY - GUN_LIFT / 2, cz], [0, th, s * -0.06]);
      sb.box(0.3, 0.16, L, M.dark, [cx + s * 0.05, 4.32 + GUN_DY, cz], [0, th, 0]);                                // mép trên gờ
      armorWindow([cx, 2.9 + GUN_DY - GUN_LIFT / 2, cz], [0, th, s * -0.06], 'x', 0.05, 0.75, 1.55, 1.15);   // ô kính chống đạn
      for (const hy of [2.1, 3.7]) sb.box(0.5, 0.22, 0.22, M.dark, [x0 + s * 0.05, hy + GUN_DY - GUN_LIFT / 2, z0 + 0.05], [0, th, 0]);   // 2 bản lề nối tấm trước
    }
    sb.box(5.3, 0.8, 0.22, M.paint, [0, 4.45 + GUN_DY, SZ - 0.02], [0.18, 0, 0]);
    sb.box(4.8, 0.5, 0.22, M.paint, [0, 0.9 + GUN_DY - GUN_LIFT, SZ + 0.1], [0.18, 0, 0]);
    for (const s of [-1, 1]) sb.box(0.16, 0.16, 1.5, M.dark, [s * 0.6, 1.0 + GUN_DY - GUN_LIFT, GUN_Z - 0.75]);   // giằng tấm chắn về trụ
    sb.setTag(null);
    sb.build(hmgMount);

    const pivot = new THREE.Group();
    pivot.position.set(0, GUN_Y, GUN_Z);
    unit.barrelPivot = pivot;
    turret.add(pivot);
    const cb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    // nôi súng & khay hộp đạn: thép phốt phát hóa cùng bộ với súng (sơn xe lốm đốm bụi trông như khối nhựa rằn ri dưới hộp)
    const GD = gunMats(M).dk;
    // NÔI SÚNG (kiểu nôi giá xoay MK93): thân nôi dập ôm dưới hộp khóa nòng, 2 má ôm hai bên có chốt ngóc xuyên qua (đầu
    // chốt + chốt hãm), cổ nôi tròn xuống trụ giá; khay chữ L ôm đáy hộp đạn bên trái
    cb.add(roundBox(0.62, 0.24, 1.75, 0.07), GD, [0, -0.6, 0.38]);
    cb.add(roundBox(0.5, 0.06, 1.6, 0.025), GD, [0, -0.47, 0.38]);                          // mặt tì đáy hộp khóa nòng
    for (const s of [-1, 1]) {
      cb.add(roundProfile([[-0.42, -0.62], [0.42, -0.62], [0.3, 0.12], [0.12, 0.22], [-0.12, 0.22], [-0.3, 0.12]], 0.07, 0.025), GD, [s * 0.47, 0, 0]);
      cb.cyl(0.14, 0.14, 0.05, 14, GD, [s * 0.53, 0, 0], 'x');                                // đầu chốt ngóc
      cb.cyl(0.05, 0.05, 0.05, 8, gunMats(M).worn, [s * 0.56, 0, 0], 'x');
    }
    cb.cyl(0.09, 0.09, 1.08, 10, GD, [0, 0, 0], 'x');                                         // chốt ngóc
    cb.add(latheZ([[0, 0], [0.2, 0], [0.22, 0.05], [0.22, 0.32], [0.18, 0.38], [0, 0.38]], 14, 1), GD, [0, -0.72, -0.2], [Math.PI / 2, 0, 0]);   // cổ nôi
    // khay chữ L ôm đúng đáy hộp: bản đáy dài theo thân hộp + gờ chặn ngoài, tay đỡ nối thân nôi, lẫy khóa sau
    cb.add(roundBox(0.95, 0.1, 1.5, 0.03), GD, [-0.82, -0.78, 0.32]);
    cb.add(roundBox(0.09, 0.34, 1.5, 0.03), GD, [-1.26, -0.62, 0.32]);
    for (const z of [-0.2, 0.85]) cb.add(roundBox(0.5, 0.08, 0.16, 0.03), GD, [-0.45, -0.7, z]);
    cb.add(roundBox(0.2, 0.18, 0.2, 0.05), GD, [-1.2, -0.4, 1.0]);        // lẫy khóa hộp phía sau
    cb.build(pivot);
    // Hộp đạn 100 viên rời (thay khi nạp đạn)
    const ammo = new THREE.Group();
    ammo.position.set(-0.82, -0.29, 0.32);   // tâm hộp nằm sát receiver, đáy tựa đúng khay chữ L
    const amb = new VehicleKit.PartBatch(ROOF_Y + 2.0);
    // Hộp M2A1 thật ~30,5 x 15,5 x 19 cm; receiver 0.8 đv ~ 19 cm -> hộp ~1.32 x 0.72 x 0.86 đv (bản cũ to gần gấp đôi).
    // Vật liệu riêng: tôn sơn xanh ô liu xỉn khác màu sơn xe, gờ / mép tối hơn, cạnh mòn trơ kim loại -> đọc được khối
    const CM = canMats(M), canM = CM.m, canDk = CM.dk, canWorn = CM.worn, stencil = CM.stencil;
    const W = 0.72, H = 0.86, L = 1.32;
    // vỏ hộp RỖNG (đáy + 4 thành tôn ~3 mm): mở nắp nhìn xuống thấy lòng hộp & dây đạn bên trong. Bản cũ là khối đặc ->
    // nhìn từ trên chỉ thấy mặt phẳng ô-liu, dây đạn nằm hẫng trên nắp như dán
    const T = 0.03;
    amb.box(W, T, L, canM, [0, -H / 2 + T / 2, 0]);
    for (const sx of [-1, 1]) amb.box(T, H, L, canM, [sx * (W / 2 - T / 2), 0, 0]);
    for (const sz of [-1, 1]) amb.box(W - 2 * T, H, T, canM, [0, 0, sz * (L / 2 - T / 2)]);
    amb.box(W + 0.05, 0.07, L + 0.05, canDk, [0, -H / 2 + 0.02, 0]);     // mép cuốn đáy
    // mép cuốn miệng hộp: 4 dải viền quanh miệng (bản cũ là tấm đặc 0.06 phủ kín cả miệng hộp)
    for (const sx of [-1, 1]) amb.box(0.055, 0.06, L + 0.05, canDk, [sx * (W / 2 - 0.0025), H / 2 - 0.03, 0]);
    for (const sz of [-1, 1]) amb.box(W + 0.05, 0.06, 0.055, canDk, [0, H / 2 - 0.03, sz * (L / 2 - 0.0025)]);
    // 4 cạnh đứng mòn sơn trơ kim loại
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) amb.box(0.035, H - 0.1, 0.035, canWorn, [sx * W / 2, 0, sz * L / 2]);
    // gân dập lõm hai sườn: rãnh tối + gờ nổi cùng màu -> tạo bóng đổ, mặt hộp không còn phẳng lì
    for (const sx of [-1, 1]) {
      for (const y of [-0.2, 0.2]) {
        amb.box(0.02, 0.05, L - 0.2, canDk, [sx * (W / 2 + 0.005), y, 0]);
        amb.box(0.03, 0.035, L - 0.2, canM, [sx * (W / 2 + 0.012), y + 0.05, 0]);
      }
    }
    // gân chữ X hai đầu hộp
    for (const z of [-L / 2, L / 2]) {
      amb.box(0.05, H - 0.16, 0.025, canDk, [-0.14, 0, z], [0, 0, 0.5]);
      amb.box(0.05, H - 0.16, 0.025, canDk, [0.14, 0, z], [0, 0, -0.5]);
    }
    amb.box(0.02, 0.18, 0.62, stencil, [-W / 2 - 0.012, 0.0, 0.12]);    // chữ lô đạn sơn vàng ở mặt ngoài
    amb.build(ammo);
    // nắp hộp đạn (bản lề cạnh ngoài, lật mở để kéo dây đạn) + quai xách
    const ammoLid = new THREE.Group();
    ammoLid.position.set(-W / 2, H / 2 + 0.02, 0);
    const alb = new VehicleKit.PartBatch(ROOF_Y + 2.5);
    alb.box(W + 0.06, 0.07, L + 0.06, canM, [W / 2, 0.03, 0]);
    alb.box(W - 0.16, 0.025, L - 0.2, canDk, [W / 2, 0.075, 0]);       // vùng lõm giữa nắp (gioăng ép)
    alb.box(0.1, 0.12, 0.2, canDk, [W + 0.03, -0.02, 0]);              // lẫy khóa nắp
    // quai xách gập sát nắp; đi theo nắp khi mở
    alb.box(0.07, 0.07, 0.5, canDk, [W / 2, 0.12, 0]);
    for (const z of [-0.25, 0.25]) alb.box(0.07, 0.08, 0.07, canDk, [W / 2, 0.09, z]);
    for (const z of [-0.45, 0.45]) alb.cyl(0.05, 0.05, 0.3, 8, canDk, [0.02, 0, z], 'z');   // bản lề
    alb.build(ammoLid);
    ammo.add(ammoLid);
    pivot.add(ammo);
    // DÂY ĐẠN 12.7: mắt xích + đầu đạn từ miệng hộp vào khay nạp bên trái khóa nòng (hiện dần khi xạ thủ kéo dây vào súng)
    const belt = new THREE.Group();
    pivot.add(belt);
    const beltPts = new THREE.CatmullRomCurve3([V3(-0.82, 0.2, 0.15), V3(-0.78, 0.42, 0.28), V3(-0.6, 0.48, 0.46), V3(-0.42, 0.3, 0.55)]);
    // vỏ đạn đồng xỉn ám dầu / muội (không bóng vàng như mới), đầu đạn đen (xuyên giáp), mắt xích thép sẫm
    // (giá trị tuyến tính: 0x5e4a26 hiện ra nâu vàng nhạt như khúc gỗ) — đồng thau xỉn có ánh kim phản chiếu trời
    const brass = new THREE.MeshStandardMaterial({ color: 0x3a2a0e, roughness: 0.42, metalness: 0.85, envMap: (M.steel && M.steel.envMap) || null, envMapIntensity: 0.8 });
    const tipM = new THREE.MeshStandardMaterial({ color: 0x060605, roughness: 0.45, metalness: 0.4 });   // (giá trị tuyến tính: đầu đạn xuyên giáp sơn đen)
    const linkM = new THREE.MeshStandardMaterial({ color: 0x1e1e1c, roughness: 0.6, metalness: 0.5 });
    const rnd = new THREE.CylinderGeometry(0.065, 0.07, 0.42, 8), tipG = new THREE.ConeGeometry(0.055, 0.18, 8), lnk = new THREE.BoxGeometry(0.5, 0.06, 0.1);
    const links = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group(), t = i / 8, pt = beltPts.getPointAt(t), tan = beltPts.getTangentAt(t);
      const r = new THREE.Mesh(rnd, brass); r.rotation.x = Math.PI / 2; r.position.z = 0.04; g.add(r);
      const tp = new THREE.Mesh(tipG, tipM); tp.rotation.x = -Math.PI / 2; tp.position.z = -0.26; g.add(tp);
      const l = new THREE.Mesh(lnk, linkM); l.rotation.y = Math.PI / 2; g.add(l);
      // +Z nhóm quay về sau súng -> đầu đạn (-Z) chĩa về trước theo nòng như dây đạn thật (trước đây chĩa ngược về xạ thủ)
      g.position.copy(pt); g.lookAt(pt.clone().add(new THREE.Vector3(-tan.z, 0, tan.x)));
      belt.add(g); links.push(g);
    }
    // hộp đạn & dây đạn đi qua lỗ nóc khi thay: vẽ ở lượt trong suốt sau lòng hố (vật liệu riêng)
    const overPit = (root) => root.traverse(o => { if (o.isMesh) { const m0 = o.material, m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.customProgramCacheKey = m0.customProgramCacheKey; m.userData = Object.assign({}, m0.userData); m.transparent = true; m.opacity = 1; o.material = m; o.renderOrder = 12; } });
    // LÒNG HỘP: dây đạn gấp lớp như hộp M2A1 thật — lớp trên cùng thấy qua miệng hộp: các viên nằm ngang bề rộng hộp, sát
    // nhau, đầu đạn cùng một phía, mắt xích thép kẹp quanh vỏ; dưới là các lớp gấp khuất (khối đồng sẫm), mặt trong hộp sơn
    // tối. Mức đạn hạ dần theo số đạn còn (modelAnimator: fill.set(phần còn)) — bắn gần hết thấy đáy hộp
    const fill = (() => {
      const g = new THREE.Group(), pitch = 0.112, n = Math.floor((L - 2 * T - 0.02) / pitch);
      const caseG = new THREE.CylinderGeometry(0.05, 0.053, 0.44, 8), tipGeo = new THREE.ConeGeometry(0.043, 0.19, 8);
      const bandG = new THREE.CylinderGeometry(0.057, 0.057, 0.05, 8, 1, true);
      const deep = new THREE.MeshStandardMaterial({ color: 0x120c04, roughness: 0.6, metalness: 0.5 });   // lớp dưới khuất bóng
      const inner = new THREE.MeshStandardMaterial({ color: 0x0c0d07, roughness: 0.85, metalness: 0.2 }); // mặt trong hộp
      const layer = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const z = -((n - 1) / 2) * pitch + i * pitch;
        const c = new THREE.Mesh(caseG, brass); c.rotation.z = Math.PI / 2; c.position.set(-0.08, 0, z); layer.add(c);
        const t = new THREE.Mesh(tipGeo, tipM); t.rotation.z = -Math.PI / 2; t.position.set(0.235, 0, z); layer.add(t);
        for (const x of [-0.2, 0.05]) { const b = new THREE.Mesh(bandG, linkM); b.rotation.z = Math.PI / 2; b.position.set(x, 0, z); layer.add(b); }
      }
      g.add(layer);
      const mass = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T - 0.01, 1, L - 2 * T - 0.01), deep);
      g.add(mass);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T - 0.005, 0.01, L - 2 * T - 0.005), inner);
      floor.position.y = -H / 2 + T + 0.006;
      g.add(floor);
      ammo.add(g);
      const y0 = -H / 2 + T + 0.055, y1 = H / 2 - 0.09;
      let last = -1;
      return {
        group: g,
        set(k) {
          k = Math.max(0, Math.min(1, k));
          if (Math.abs(k - last) < 0.004) return;
          last = k;
          const y = y0 + (y1 - y0) * k;
          layer.position.y = y; layer.visible = k > 0.01;
          const hMass = Math.max(0.001, y - 0.05 - (-H / 2 + T));
          mass.scale.y = hMass; mass.position.y = -H / 2 + T + hMass / 2; mass.visible = k > 0.06;
        }
      };
    })();
    fill.set(1);
    overPit(ammo); overPit(belt);
    const hmgParts = [...pivot.children, belt];   // giá súng + hộp đạn + dây đạn (ẩn khi lắp vũ khí khác)

    // Ống phóng tên lửa chống tăng gắn bên phải giá súng (cố định, dùng lại): phóng xong nắp trước bung (lòng ống đen), luồng
    // phụt ngược sau ống (ExplosionFX.missileLaunch); xạ thủ mở nắp sau nạp quả mới từ phía sau vào (modelAnimator)
    const atgm = new THREE.Group();
    atgm.position.copy(ATGM_AT);   // ngoài cánh tấm chắn (trước đây ống đâm xuyên tấm chắn)
    atgm.rotation.x = ATGM_TILT;   // miệng ống hếch nhẹ: quả rời ống không chúi xuống nóc / tấm chắn
    const ab = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    ab.box(0.7, 0.7, 1.2, M.dark, [0, -0.75, -0.6]);
    ab.box(1.1, 0.16, 3.2, M.dark, [0, -0.62, -0.8]);           // máng đỡ ống
    // giá cố định: chân đứng dưới máng + tay đòn ngang ôm vào trụ súng (đai kẹp) — ống không ngóc theo súng
    const postZ = GUN_Z - ATGM_AT.z;   // trụ súng trong hệ ống
    const ay = 0.42 - ATGM_AT.y, ax = -ATGM_AT.x;   // tay đòn sát nóc, ngang tay đòn đỡ chân trụ súng (ringArm)
    ab.box(0.32, -1.1 - ay, 0.32, M.dark, [0, (ay - 1.1) / 2, -0.15]);
    ab.box(-ax, 0.26, 0.3, M.dark, [ax / 2, ay, (postZ - 0.15) / 2], [0, Math.atan2(postZ + 0.15, -ax), 0]);
    ab.cyl(0.58, 0.58, 0.45, 12, M.dark, [ax, ay, postZ]);   // đai kẹp quanh trụ súng
    ab.box(0.5, 0.3, 0.2, M.dark, [0, ay, -0.15]);
    ab.build(atgm);
    const can = new THREE.Group();
    const cnb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    cnb.cyl(0.6, 0.6, 5.6, 14, M.paint, [0, 0, -0.8], 'z');
    cnb.cyl(0.62, 0.62, 0.22, 14, M.dark, [0, 0, -3.65], 'z');
    cnb.cyl(0.64, 0.64, 0.3, 14, M.dark, [0, 0, 2.0], 'z');
    cnb.box(0.22, 0.3, 0.9, M.dark, [0, 0.66, -0.6]);           // quai xách
    cnb.build(can);
    // nắp trước (còn đạn) / lòng ống đen ám khói (đã phóng)
    const capCover = new THREE.Mesh(wx(new THREE.CircleGeometry(0.56, 14)), M.dark);
    capCover.position.set(0, 0, -3.77); capCover.rotation.y = Math.PI;
    const capOpen = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), new THREE.MeshBasicMaterial({ color: 0x070605 }));
    capOpen.position.set(0, 0, -3.78); capOpen.rotation.y = Math.PI; capOpen.visible = false;
    // nắp khóa sau (bản lề mép trên) + quả tên lửa mới (chỉ hiện khi đang được đẩy vào từ phía sau)
    const rearCap = new THREE.Group();
    rearCap.position.set(0, 0.64, 2.16);
    const rc = new THREE.Mesh(wx(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14)), M.dark);
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
    turret.add(atgm);
    unit.antiTankLauncherMesh = atgm;
    VehicleKit.registerPartGroup(unit, 'atgm', atgm);
    unit.atgmTipLocal = new THREE.Vector3(0, 0, -3.9);
    unit.atgmRearLocal = new THREE.Vector3(0, 0, 2.3);

    // SÚNG MÁY HẠNG NẶNG 12.7 kiểu M2HB (đv súng: hộp khóa nòng rộng 0.8, dài 3.2). Thép phốt phát hóa xám đen, cạnh mòn
    // sáng, ốp tay cầm nhựa đen: hộp khóa nòng 2 tấm thành tán đinh + gân dọc, khối chốt trước, ống đỡ nòng khoét lỗ,
    // đầu ruồi trên ống đỡ, thước ngắm lá gập sau nắp, nắp khay nạp có lẫy, tấm hậu có ống giảm chấn, 2 tay cầm chữ D
    // khía rãnh + lẫy cò bướm. Nòng nặng có quai xách thay nòng nhanh + loa che lửa xẻ rãnh
    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);
    // màu dã chiến: thép phốt phát hóa xám xỉn ám bụi đất / dầu (lớp bẩn loang theo vân grime của xe), không đen bóng như
    // súng mới trong kho; cạnh hay cầm nắm / cọ xát mòn trơ thép, ốp nhựa sờn bạc
    const GM = gunMats(M), gunM = GM.m, gunDk = GM.dk, gunWorn = GM.worn, gripM = GM.grip;
    const gb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    // HỘP KHÓA NÒNG: đùn theo mặt cắt cạnh (đuôi trên vát), mép bo; tấm đáy & tấm nóc thò viền khỏi 2 tấm thành (đường ghép
    // thật của hộp khóa nòng tán đinh); hàng đinh tán đáy thành + cụm đinh khối chốt + 2 đinh sau, chốt giữ tấm hậu
    gb.add(roundProfile([[-0.74, -0.46], [2.18, -0.46], [2.18, 0.38], [2.08, 0.46], [-0.74, 0.46]], 0.8, 0.035), gunM, [0, 0, 0]);
    gb.add(roundBox(0.84, 0.05, 2.92, 0.02), gunM, [0, -0.47, 0.72]);                            // tấm đáy
    gb.add(roundBox(0.84, 0.05, 0.62, 0.02), gunM, [0, 0.465, 1.82]);                            // tấm nóc sau nắp
    for (const s of [-1, 1]) {
      const x = s * 0.4;
      for (let i = 0; i < 7; i++) rivet(gb, gunDk, x, -0.35, -0.5 + i * 0.41, s);
      for (const y of [-0.18, 0.22]) rivet(gb, gunDk, x, y, 2.04, s);
      gb.cyl(0.075, 0.075, 0.05, 10, gunDk, [s * 0.42, 0.0, 1.92], 'x');                        // chốt giữ tấm hậu
      gb.add(roundBox(0.014, 0.012, 2.86, 0.005), gunWorn, [s * 0.405, 0.455, 0.7]);            // mép trên mòn sáng
      // khối chốt: cụm đinh tán 2 x 3
      for (const z of [-1.04, -0.86]) for (const y of [-0.3, 0, 0.3]) rivet(gb, gunDk, s * 0.45, y, z, s, 0.038);
    }
    gb.add(roundBox(0.9, 1.0, 0.44, 0.06), gunM, [0, -0.01, -0.95]);                           // khối chốt trước
    gb.add(roundBox(0.88, 0.035, 0.035, 0.012), gunWorn, [0, 0.49, -1.13]);
    // ỐNG ĐỠ NÒNG (tiện tròn liền khối chốt): cổ loe, thân ống khoét lỗ ô van, vành đầu, ổ đỡ nòng tối bên trong
    gb.add(latheZ([[0.37, 0], [0.37, 0.24], [0.33, 0.34], [0.275, 0.44], [0.27, 0.52], [0.27, 1.98], [0.3, 2.03], [0.3, 2.12], [0.265, 2.16], [0.2, 2.16]], 18, -1), gunM, [0, 0.05, -1.16]);
    gb.cyl(0.2, 0.2, 0.02, 12, gunDk, [0, 0.05, -3.31], 'z');
    for (let i = 0; i < 4; i++) for (const a of [0.75, 2.4, 3.9, 5.5]) {          // lỗ thoát nhiệt hình ô van
      const z = -1.85 - i * 0.4, x = Math.sin(a) * 0.262, y = 0.05 + Math.cos(a) * 0.262;
      gb.add(new THREE.SphereGeometry(1, 10, 6), GM.soot, [x, y, z], [0, 0, -a], [0.06, 0.02, 0.13]);
    }
    // đầu ruồi: chân đúc + 2 tai che trên cổ ống đỡ nòng
    gb.add(roundBox(0.28, 0.1, 0.22, 0.03), gunM, [0, 0.4, -1.38]);
    gb.add(roundBox(0.05, 0.26, 0.05, 0.015), gunDk, [0, 0.55, -1.38]);
    for (const s of [-1, 1]) gb.add(roundBox(0.03, 0.22, 0.14, 0.012), gunM, [s * 0.11, 0.5, -1.38]);
    // thước ngắm lá gập (sau nắp khay nạp): đế đúc + lá dựng có khe ngắm, núm chỉnh tầm
    gb.add(roundBox(0.32, 0.07, 0.34, 0.025), gunM, [0, 0.52, 1.82]);
    gb.add(roundBox(0.22, 0.4, 0.035, 0.015), gunDk, [0, 0.74, 1.8], [-0.12, 0, 0]);
    gb.add(roundBox(0.06, 0.08, 0.04, 0.01), gunWorn, [0, 0.88, 1.787], [-0.12, 0, 0]);
    gb.cyl(0.05, 0.05, 0.1, 10, gunDk, [0.2, 0.54, 1.82], 'x');
    // cửa khay nạp trái (dây đạn chui vào) + máng đỡ dây; cửa nhả mắt xích phải; khe nhả vỏ đạn dưới đáy
    gb.add(roundBox(0.04, 0.24, 0.62, 0.012), GM.soot, [-0.405, 0.3, 0.5]);
    gb.add(roundBox(0.2, 0.04, 0.62, 0.015), gunM, [-0.5, 0.17, 0.5]);
    gb.add(roundBox(0.04, 0.2, 0.45, 0.012), GM.soot, [0.405, 0.28, 0.5]);
    gb.add(roundBox(0.3, 0.03, 0.5, 0.01), GM.soot, [0, -0.485, 1.2]);
    // TẤM HẬU đúc bo góc + ống giảm chấn nhô sau (tiện tròn, đầu vòm), nút nhả khóa nòng
    gb.add(roundBox(0.88, 0.98, 0.16, 0.08), gunM, [0, 0, 2.26]);
    gb.add(roundBox(0.8, 0.03, 0.04, 0.012), gunWorn, [0, 0.48, 2.3]);
    gb.add(latheZ([[0.19, 0], [0.19, 0.22], [0.175, 0.28], [0.13, 0.315], [0.05, 0.33], [0, 0.33]], 16, 1), gunM, [0, 0, 2.34]);
    gb.add(roundBox(0.1, 0.07, 0.12, 0.025), gunWorn, [0, 0.3, 2.98]);
    // TAY CẦM CHỮ D: tay đòn đúc cong vòng từ tấm hậu ra sau (ống cong mặt cắt tròn, không phải 2 thanh hộp gãy khúc), tay
    // cầm hình con suốt ốp nhựa, 2 đầu bịt thép; lẫy cò bướm cong giữa 2 tay cầm + khối trục lẫy
    for (const s of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const arm = new THREE.CatmullRomCurve3([V3(s * 0.28, sy * 0.36, 2.3), V3(s * 0.4, sy * 0.39, 2.62), V3(s * 0.46, sy * 0.385, 3.0), V3(s * 0.45, sy * 0.36, 3.3)]);
        gb.add(new THREE.TubeGeometry(arm, 10, 0.048, 8, false), gunM, [0, 0, 0]);
      }
      gb.add(latheZ([[0, -0.3], [0.1, -0.3], [0.118, -0.22], [0.122, 0], [0.118, 0.22], [0.1, 0.3], [0, 0.3]], 14, 1), gripM, [s * 0.45, 0, 3.3], [-Math.PI / 2, 0, 0]);
      for (const sy of [-1, 1]) gb.add(latheZ([[0.09, 0], [0.125, 0.02], [0.125, 0.05], [0.09, 0.07]], 14, 1), gunM, [s * 0.45, sy * 0.3, 3.3], [sy > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]);
    }
    {
      // lẫy cò bướm: tấm cong mặt cắt cung (ngón cái ấn), khối trục lẫy trên tấm hậu
      const trig = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 14, 1, true, Math.PI - 0.55, 1.1);
      gb.add(trig, gunDk, [0, 0.08, 3.5], [0.25, 0, 0]);
      gb.add(roundBox(0.14, 0.14, 0.22, 0.04), gunM, [0, 0.05, 2.96]);
    }
    gb.build(barrel);
    // NÒNG RỜI (súng M2 giật ngắn: nòng + khóa nòng lùi ~2 cm trong hộp khóa nòng mỗi phát) — nhóm riêng để giật trong thân súng
    const tube = new THREE.Group();
    const tbb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    tbb.cyl(0.165, 0.185, 6.6, 12, gunM, [0, 0.05, -5.6], 'z');                  // nòng nặng thuôn nhẹ về đầu
    tbb.cyl(0.2, 0.2, 0.18, 12, gunM, [0, 0.05, -3.45], 'z');                    // vành ren nòng
    // quai xách thay nòng nhanh: đai kẹp + tay đòn + thanh nắm nhựa lệch trái trên
    tbb.cyl(0.22, 0.22, 0.3, 12, gunM, [0, 0.05, -4.1], 'z');
    tbb.beam([-0.12, 0.22, -4.0], [-0.42, 0.6, -3.95], 0.08, 0.1, gunM);
    tbb.beam([-0.12, 0.22, -4.2], [-0.42, 0.6, -4.95], 0.08, 0.1, gunM);
    tbb.cyl(0.07, 0.07, 1.05, 8, gripM, [-0.42, 0.62, -4.45], 'z');
    // loa che lửa xẻ 4 rãnh
    tbb.cyl(0.25, 0.22, 0.95, 12, GM.soot, [0, 0.05, -9.35], 'z');
    tbb.cyl(0.19, 0.19, 0.9, 12, GM.soot, [0, 0.05, -8.45], 'z');               // đoạn nòng sát loa sạm khói thuốc
    for (const a of [0.4, 1.97, 3.54, 5.11]) tbb.box(0.06, 0.03, 0.62, gunDk, [Math.sin(a) * 0.245, 0.05 + Math.cos(a) * 0.245, -9.45], [0, 0, -a]);
    tbb.cyl(0.13, 0.13, 0.06, 10, M.bore, [0, 0.05, -9.83], 'z');
    tbb.build(tube);
    barrel.add(tube);
    unit.muzzleTipLocal = new THREE.Vector3(0, 0.05, -10.0);
    // Nắp khay nạp (lật lên khi lắp dây đạn mới), bản lề phía trước: gân giữa, hộp trượt cấp đạn, lẫy khóa sau (tay xạ thủ
    // nắm đúng chỗ lẫy — vehicle_crew coverH ở (0, 0.3, 1.55) hệ nắp)
    const cover = new THREE.Group();
    cover.position.set(0, 0.48, -0.2);
    const cvb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    // nắp dập bo mép; vỏ trượt cấp đạn gồ ngang nắp phía trước; cần cấp đạn gồ dọc giữa nắp từ vỏ trượt ra chốt xoay sau;
    // lẫy khóa nắp sau có tai gạt mòn sáng; bản lề trước
    cvb.add(roundBox(0.84, 0.09, 1.72, 0.03), gunM, [0, 0.045, 0.86]);
    for (const s of [-1, 1]) cvb.add(roundBox(0.014, 0.012, 1.66, 0.005), gunWorn, [s * 0.415, 0.085, 0.86]);   // mép nắp mòn sáng
    cvb.add(roundBox(0.86, 0.1, 0.44, 0.04), gunM, [0, 0.13, 0.42]);                         // vỏ trượt cấp đạn
    cvb.add(roundBox(0.18, 0.07, 0.95, 0.03), gunM, [0, 0.12, 1.02]);                        // gờ cần cấp đạn
    cvb.cyl(0.06, 0.06, 0.05, 10, gunDk, [0, 0.16, 1.4]);                                      // chốt xoay cần
    cvb.cyl(0.065, 0.065, 0.86, 10, gunM, [0, 0.03, 0.04], 'x');                               // bản lề trước
    cvb.add(roundBox(0.28, 0.13, 0.2, 0.04), gunDk, [0, 0.13, 1.6]);                         // lẫy khóa nắp
    cvb.add(roundBox(0.24, 0.035, 0.08, 0.012), gunWorn, [0, 0.21, 1.68]);
    cvb.build(cover);
    barrel.add(cover);
    // tay kéo lên đạn bên phải hộp khóa nòng (xạ thủ kéo 2 lần khi lắp dây mới — modelAnimator). Kiểu tay kéo M2: tấm
    // rãnh trượt dọc thành phải hộp khóa nòng (cố định) + khối trượt mang cần chìa ra ngoài và thanh nắm đứng. Hành trình
    // CHARGE_LEN ~16 cm như súng thật (trước đây 1 mẩu hộp nhỏ đi ~12 cm, bị nắm tay che khuất, nhìn như tay đứng yên)
    // chỗ nghỉ giữa thành hộp khóa nòng (tầm với của xạ thủ đứng sau tay cầm) -> kéo lùi tới sát tấm đáy hộp (z ~2.5)
    const CHARGE_LEN = 1.3, CHARGE_Z0 = 1.2;
    const slot = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    slot.box(0.05, 0.07, CHARGE_LEN + 0.4, gunM, [0.44, 0.21, CHARGE_Z0 + CHARGE_LEN / 2]);
    slot.box(0.05, 0.07, CHARGE_LEN + 0.4, gunM, [0.44, 0.03, CHARGE_Z0 + CHARGE_LEN / 2]);
    slot.box(0.02, 0.11, CHARGE_LEN + 0.3, gunDk, [0.43, 0.12, CHARGE_Z0 + CHARGE_LEN / 2]);
    slot.build(barrel);
    const charge = new THREE.Group();
    charge.position.set(0.48, 0.12, CHARGE_Z0);
    const chb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    chb.add(roundBox(0.06, 0.13, 0.36, 0.02), gunM, [0, 0, 0]);
    chb.add(roundBox(0.24, 0.08, 0.09, 0.025), gunM, [0.14, 0, 0]);
    chb.cyl(0.055, 0.055, 0.36, 8, gripM, [0.27, 0, 0]);
    chb.cyl(0.07, 0.07, 0.04, 8, gunM, [0.27, 0.19, 0]);
    chb.build(charge);
    barrel.add(charge);

    // 12.7 qua loa che lửa hình nón: lưỡi lửa ngắn ~50 cm loe ra trước, ban ngày cam vàng
    const FX = makeMuzzleFlash(-9.88, 2.0, 1.6, 4.2), flash = FX.flash;
    barrel.add(flash);
    // NHÓM GIẬT CẢ SÚNG (chỉ là hình): cả khẩu súng nảy trên chốt giá mỗi phát — nòng hất lên, lệch ngang, rung rồi về.
    // Bọc mọi thứ trên thân súng (hộp khóa nòng, tay cầm, nắp, tay kéo lên đạn, nòng, chớp lửa) vào nhóm này; barrelGroup
    // (spg tính hướng đầu nòng / đường đạn) không quay theo -> rung hình không cộng thêm vào độ tản mát thật.
    // Tay xạ thủ nắm tay cầm trên nhóm này (vehicle_crew) nên tay đi đúng theo súng
    const kick = new THREE.Group();
    while (barrel.children.length) kick.add(barrel.children[0]);
    barrel.add(kick);
    hmgParts.push(barrel);
    // vỏ đạn văng: rơi qua khe đáy hộp khóa nòng, mắt xích nhả bên phải (cấp đạn bên trái)
    const eject = { kind: 'hmg', at: V3(0, -0.5, 1.2), dir: V3(0.25, -1, 0.1), link: V3(0.45, -0.1, 0.6), linkDir: V3(1, 0.2, 0.2) };
    // khói thuốc phóng 12.7: ít — một làn mỏng mỗi 3 phát (bắn loạt dài khói đọng thành làn trước nòng)
    return { ...FX, smokeAt: V3(0, 0.05, -10.1), smokeEvery: 3, smokeN: 1, ammo, fill, ammo0: ammo.position.clone(), ammoLid, belt, links, beltPts, cover, barrel, kick, tube, hmgMount, hmgParts, stand: STAND.clone(), lift: GUN_LIFT,
      // tâm lòng bàn tay trên hai tay cầm chữ D, trong hệ nhóm giật — nguồn chuẩn duy nhất cho IK xạ thủ
      gripL: V3(-0.45, 0, 3.3), gripR: V3(0.45, 0, 3.3),
      charge, charge0: charge.position.z, chargeLen: CHARGE_LEN, eject,
      // chỗ bàn tay nắm thanh đứng của tay kéo (hệ súng; z cộng thêm hành trình đang kéo — vehicle_crew)
      chargeAt: { x: 0.84, y: 0.1, z: charge.position.z, len: CHARGE_LEN } };
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
      // giàn rocket thay luôn ống tên lửa chống tăng (không bắn tên lửa nữa); vũ khí khác giữ ống trên giá cố định của tháp
    } else {
      u.barrelPivot = H.pivot; u.barrelGroup = H.barrel; u.muzzleTipLocal = H.muzzle.clone();
    }
    // nhịp bắn / dây đạn / thời gian nạp theo vũ khí đang lắp (spg.js SPGUnit3D.MAIN_WEAPONS)
    const cfg = on && typeof SPGUnit3D !== 'undefined' ? SPGUnit3D.MAIN_WEAPONS[G.kind] : null;
    const gt = (x) => (typeof GameTiming !== 'undefined' && GameTiming.t ? GameTiming.t(x) : x * 0.5);
    u.gatlingMagMax = cfg ? cfg.mag : 100;
    u.gatlingMag = u.gatlingMagMax;
    u.reloadDuration = gt(cfg ? cfg.reload : 12);   // 12.7 mặc định: khớp spg.js SCOUT
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
    const u = ctx.unit, M = ctx.M, D = M.dark;
    const root = new THREE.Group();
    ctx.parent.add(root);
    u._manned = root;
    const pivot = new THREE.Group();
    pivot.position.set(0, GUN_Y, GUN_Z);
    root.add(pivot);
    const b = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    // thân súng / nòng / nắp: thép phốt phát hóa (gunMats), không sơn rằn ri; nôi & giá vẫn là thép sơn sẫm của xe
    const G = gunMats(M), CM = canMats(M);
    // nôi: khay đỡ dưới thân súng, hai má ôm trục ngóc trên đầu trụ
    b.box(1.5, 0.28, 2.8, D, [0, -0.68, 0.5]);
    for (const s of [-1, 1]) {
      b.box(0.16, 0.85, 1.1, D, [s * 0.8, -0.4, 0]);
      b.cyl(0.22, 0.22, 0.2, 10, D, [s * 0.92, -0.4, 0], 'x');
      b.cyl(0.09, 0.09, 0.24, 6, G.worn, [s * 0.92, -0.4, 0], 'x');   // đầu chốt trục mòn sáng
    }
    // thân súng: hộp dài vuông vức, gờ mép nắp, đường ghép, hàng đinh tán thành hộp, cạnh trên mòn trơ thép
    b.box(1.25, 1.0, 3.7, G.m, [0, 0, 0.55]);
    b.box(1.29, 0.08, 3.74, G.dk, [0, -0.3, 0.55]);
    for (const s of [-1, 1]) {
      b.box(0.04, 0.1, 3.5, G.m, [s * 0.645, 0.22, 0.55]);                          // gân dọc thành hộp
      b.box(0.012, 0.012, 3.6, G.worn, [s * 0.625, 0.5, 0.55]);                       // cạnh trên mòn sáng
      for (let i = 0; i < 9; i++) b.cyl(0.035, 0.035, 0.03, 6, G.dk, [s * 0.635, -0.12, -1.0 + i * 0.4], 'x');
    }
    b.box(0.08, 0.5, 1.0, G.dk, [0.66, -0.08, -0.1]);              // cửa nhả mắt xích (phải)
    b.box(0.35, 0.4, 1.1, G.dk, [-0.8, 0.18, -0.15]);              // khay cấp đạn (trái)
    b.box(1.12, 0.9, 0.16, G.m, [0, 0, 2.45]);                     // tấm hậu
    b.box(1.14, 0.05, 0.05, G.worn, [0, 0.45, 2.5]);
    for (const s of [-1, 1]) {
      // tay cầm chữ D: lõi thép + ốp nhựa sờn có khía, 2 tay đòn về tấm hậu
      b.cyl(0.075, 0.075, 0.82, 8, G.m, [s * 0.45, 0.0, 3.3]);
      b.cyl(0.115, 0.115, 0.6, 12, G.grip, [s * 0.45, 0.0, 3.3]);
      for (const y of [-0.15, 0.0, 0.15]) b.cyl(0.119, 0.119, 0.02, 12, G.dk, [s * 0.45, y, 3.3]);
      b.box(0.12, 0.12, 0.95, G.m, [s * 0.45, 0.36, 2.87]);
      b.box(0.12, 0.12, 0.95, G.m, [s * 0.45, -0.36, 2.87]);
      // tay kéo lên đạn hai bên
      b.box(0.1, 0.1, 0.7, G.m, [s * 0.7, 0.15, 1.55]);
      b.box(0.1, 0.32, 0.12, G.grip, [s * 0.76, 0.15, 1.95]);
    }
    b.box(0.55, 0.16, 0.12, G.dk, [0, 0.0, 2.72]);                 // lẫy cò bướm
    // nòng: ống áo tản nhiệt khoan lỗ — lỗ là ô tối lõm gần sát mặt ống (trước đây là cục nổi sáng màu, như gắn nút)
    b.cyl(0.34, 0.34, 3.0, 14, G.m, [0, 0.05, -2.75], 'z');
    for (let k0 = 0; k0 < 4; k0++) {
      const z = -1.6 - k0 * 0.7;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + (k0 % 2 ? Math.PI / 6 : 0);
        b.box(0.13, 0.022, 0.26, G.soot, [Math.cos(a) * 0.336, 0.05 + Math.sin(a) * 0.336, z], [0, 0, a + Math.PI / 2]);
      }
    }
    b.box(0.03, 0.012, 2.9, G.worn, [0, 0.39, -2.75]);              // sống ống áo mòn sáng (chỗ tay xách / cọ tấm chắn)
    b.cyl(0.36, 0.36, 0.14, 14, G.dk, [0, 0.05, -4.25], 'z');      // vành đầu ống áo
    b.cyl(0.2, 0.2, 0.6, 12, G.soot, [0, 0.05, -4.6], 'z');
    b.cyl(0.27, 0.25, 0.5, 12, G.soot, [0, 0.05, -5.1], 'z');
    for (const s of [-1, 1]) b.box(0.05, 0.12, 0.3, G.dk, [s * 0.255, 0.05, -5.1]);
    // thước ngắm lá (khung + lá dựng) trên nóc bên trái, đầu ruồi trước
    b.box(0.12, 0.08, 0.5, G.dk, [-0.42, 0.56, 1.5]);
    b.box(0.08, 0.55, 0.06, G.dk, [-0.42, 0.85, 1.5]);
    b.box(0.32, 0.06, 0.06, G.dk, [-0.42, 1.1, 1.5]);
    b.box(0.08, 0.3, 0.08, G.dk, [-0.42, 0.62, -1.0]);
    // máng cấp đạn từ hộp lên khay (thép dập)
    b.box(0.5, 0.16, 0.8, G.dk, [-1.15, 0.12, -0.15], [0, 0, 0.6]);
    b.build(pivot);
    // nắp trên (bản lề mép trước, lật lên khi nạp dây đạn mới — modelAnimator): gân giữa, mép mòn sáng
    const cover = new THREE.Group();
    cover.position.set(0, 0.52, -0.55);
    const cb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y + 0.5);
    cb.box(1.2, 0.1, 2.6, G.m, [0, 0.05, 1.3]);
    cb.box(0.18, 0.06, 2.3, G.m, [0, 0.13, 1.35]);
    for (const s of [-1, 1]) cb.box(0.015, 0.015, 2.58, G.worn, [s * 0.6, 0.1, 1.3]);
    cb.box(0.3, 0.14, 0.2, G.dk, [0, 0.14, 2.5]);                 // chốt khóa nắp
    cb.cyl(0.07, 0.07, 1.1, 8, G.dk, [0, 0.02, 0], 'x');          // bản lề
    cb.build(cover);
    pivot.add(cover);
    // hộp đạn 48 quả treo trái (tôn sơn ô-liu xỉn): mép cuốn, gân dập hai sườn, cạnh mòn trơ kim loại, chữ lô sơn vàng
    const ammo = new THREE.Group();
    ammo.position.set(-1.75, -0.35, 0.3);
    const ab = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    const AW = 1.0, AH = 1.25, AL = 1.7;
    ab.box(AW, AH, AL, CM.m, [0, 0, 0]);
    ab.box(AW + 0.06, 0.08, AL + 0.06, CM.dk, [0, 0.6, 0]);
    ab.box(AW + 0.06, 0.08, AL + 0.06, CM.dk, [0, -AH / 2 + 0.03, 0]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) ab.box(0.04, AH - 0.12, 0.04, CM.worn, [sx * AW / 2, 0, sz * AL / 2]);
      for (const y of [-0.3, 0.25]) ab.box(0.03, 0.06, AL - 0.3, CM.dk, [sx * (AW / 2 + 0.008), y, 0]);
    }
    ab.box(0.02, 0.22, 0.8, CM.stencil, [-AW / 2 - 0.015, 0.0, 0.15]);
    ab.build(ammo);
    // nắp hộp (bản lề cạnh ngoài; mở suốt lúc bắn cho dây lựu chạy ra, hộp mới đóng tới lúc xạ thủ lật ra)
    const ammoLid = new THREE.Group();
    ammoLid.position.set(-0.53, 0.68, 0);
    const alb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y + 0.7);
    alb.box(1.06, 0.1, 1.76, CM.m, [0.53, 0, 0]);
    alb.box(0.86, 0.03, 1.5, CM.dk, [0.53, 0.06, 0]);            // vùng lõm giữa nắp
    alb.box(0.16, 0.14, 0.4, CM.dk, [1.0, -0.02, 0]);            // lẫy khóa
    alb.box(0.08, 0.08, 0.6, CM.dk, [0.53, 0.13, 0]);              // quai xách gập trên nắp
    for (const z of [-0.3, 0.3]) alb.box(0.08, 0.09, 0.08, CM.dk, [0.53, 0.09, z]);
    alb.build(ammoLid);
    ammo.add(ammoLid);
    ammo.traverse(o => { if (o.isMesh) o.renderOrder = 3; });
    pivot.add(ammo);
    // DÂY LỰU 40mm: quả lựu liên kết mắt xích từ miệng hộp lên khay cấp đạn trái (hiện dần khi xạ thủ kéo dây vào súng)
    const belt = new THREE.Group();
    pivot.add(belt);
    const beltPts = new THREE.CatmullRomCurve3([V3(-1.75, 0.55, 0.3), V3(-1.6, 0.95, 0.15), V3(-1.2, 0.8, -0.05), V3(-0.85, 0.3, -0.15)]);
    const brass = new THREE.MeshStandardMaterial({ color: 0x3a2a0e, roughness: 0.42, metalness: 0.85, envMap: (M.steel && M.steel.envMap) || null, envMapIntensity: 0.8 });
    const ogive = new THREE.MeshStandardMaterial({ color: 0x3f4632, roughness: 0.7, metalness: 0.2 });   // đầu lựu sơn ô-liu
    const linkM = new THREE.MeshStandardMaterial({ color: 0x1e1e1c, roughness: 0.6, metalness: 0.5 });
    const caseG = new THREE.CylinderGeometry(0.17, 0.17, 0.42, 10), noseG = new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lnkG = new THREE.BoxGeometry(0.42, 0.07, 0.12);
    const links = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(), t = i / 5, pt = beltPts.getPointAt(t), tan = beltPts.getTangentAt(t);
      const c = new THREE.Mesh(caseG, brass); c.rotation.x = Math.PI / 2; c.position.z = 0.1; g.add(c);
      const n = new THREE.Mesh(noseG, ogive); n.rotation.x = -Math.PI / 2; n.scale.set(1, 1.6, 1); n.position.z = -0.11; g.add(n);
      const l = new THREE.Mesh(lnkG, linkM); l.rotation.y = Math.PI / 2; g.add(l);
      g.position.copy(pt); g.lookAt(pt.clone().add(new THREE.Vector3(-tan.z, 0, tan.x)));   // đầu lựu chĩa về trước
      belt.add(g); links.push(g);
    }
    belt.traverse(o => { if (o.isMesh) o.renderOrder = 3; });
    // chớp lửa đầu nòng: lựu 40mm sơ tốc thấp (~240 m/s) -> chớp nhỏ, phụt khói nhiều hơn lửa
    const FX = makeMuzzleFlash(-5.36, 1.2, 0.95, 1.7), flash = FX.flash;
    pivot.add(flash);
    // vỏ lựu rỗng rơi qua cửa đáy phía trước thân súng, mắt xích nhả cửa phải
    const eject = { kind: 'agl', at: V3(0, -0.55, -0.2), dir: V3(0.1, -1, -0.3), link: V3(0.7, -0.1, -0.1), linkDir: V3(1, -0.2, 0) };
    u.mainGun = { pivot, muzzle: new THREE.Vector3(0, 0.05, -5.4), kind: 'agl' };
    // chỗ tay xạ thủ khi nạp (vehicle_crew): chốt nắp trên ở mép sau, mép nắp hộp, tay kéo lên đạn phải (lùi ~7 cm)
    u._mgParts = { lift: GUN_LIFT, cover, ammo, ammo0: ammo.position.clone(), ammoLid, belt, links, beltPts, barrel: pivot, ...FX, eject, smokeAt: V3(0, 0.05, -5.5),
      coverAt: V3(0, 0.3, 2.4), lidEdge: 1.0, chargeAt: { x: 0.8, y: 0.15, z: 1.95, len: 0.6 } };
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
    ringArm(pb, D);
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
    // ỐNG HỞ HAI ĐẦU (như ống phóng thật): vỏ ống + lòng ống tối nhìn từ trong ra. Trước đây là khối trụ đặc bịt đĩa muội hai
    // đầu -> ống đầy hay rỗng trông y hệt nhau, phóng xong ống vẫn "đầy"
    const boreIn = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.95, metalness: 0.1, side: THREE.BackSide });
    for (const [tx, ty] of tubes) {
      b.cyl(0.42, 0.42, L, 14, D, [tx, ty, Lc], 'z', null, true);
      b.cyl(0.36, 0.36, L - 0.02, 14, boreIn, [tx, ty, Lc], 'z', null, true);   // lòng ống ám muội
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
    // vành mép hai đầu ống (vòng thép giữa vỏ & lòng ống)
    const lipGeo = wx(new THREE.RingGeometry(0.36, 0.44, 16));
    const lipMat = D.clone(); lipMat.side = THREE.DoubleSide; lipMat.vertexColors = false;   // bản sao không có shader thời tiết: màu đỉnh làm ánh vàng
    for (const [tx, ty] of tubes) for (const z of [Lf, Lr]) { const r = new THREE.Mesh(lipGeo, lipMat); r.position.set(tx, ty, z); pivot.add(r); }
    // Nắp đuôi riêng từng ống, bản lề trên: ống đã bắn mở để thoát phụt; lúc nạp xạ thủ đóng và gài lại từng nắp.
    const rearCaps = tubes.map(([tx, ty]) => {
      const g = new THREE.Group(); g.position.set(tx, ty + 0.43, Lr + 0.03); g.rotation.x = -1.72;
      const plate = new THREE.Mesh(wx(new THREE.CircleGeometry(0.405, 16)), D); plate.position.y = -0.43; g.add(plate);
      const rib = new THREE.Mesh(wx(new THREE.RingGeometry(0.25, 0.38, 14)), P); rib.position.set(0, -0.43, 0.012); g.add(rib);
      const latch = new THREE.Mesh(wx(new THREE.BoxGeometry(0.16, 0.12, 0.1)), D); latch.position.set(0, -0.82, 0.04); g.add(latch);
      const hinge = new THREE.Mesh(wx(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 8)), D); hinge.rotation.z = Math.PI / 2; g.add(hinge);
      pivot.add(g); return g;
    });
    // QUẢ ROCKET (mẫu dùng chung cho quả nằm trong ống & quả xạ thủ bê đi nạp — vehicle_crew): mũi nhọn, thân ô-liu, đuôi
    // loa phụt + 4 cánh gập. Gốc ở tâm quả, mũi về -Z. Nằm trong ống: mũi sát miệng trước, đuôi lùi trong miệng sau ~0.25
    const RK = { nose: 0.6, body: 4.8, tail: 0.25 }, RL = RK.nose + RK.body + RK.tail;
    const rkBody = new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 0.7, metalness: 0.2 });
    const rkDark = M.canvasDark || D;
    const rkGeo = {
      nose: new THREE.ConeGeometry(0.27, RK.nose, 12).rotateX(-Math.PI / 2).translate(0, 0, -RL / 2 + RK.nose / 2),
      body: new THREE.CylinderGeometry(0.27, 0.27, RK.body, 12).rotateX(Math.PI / 2).translate(0, 0, -RL / 2 + RK.nose + RK.body / 2),
      nozzle: new THREE.CylinderGeometry(0.2, 0.25, RK.tail, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, RL / 2 - RK.tail / 2),
      fin: new THREE.BoxGeometry(0.04, 0.16, 0.7)
    };
    const nozMat = rkDark.clone(); nozMat.side = THREE.DoubleSide;
    const makeRound = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(rkGeo.nose, rkDark), new THREE.Mesh(rkGeo.body, rkBody), new THREE.Mesh(rkGeo.nozzle, nozMat));
      for (let k = 0; k < 4; k++) {   // cánh đuôi gập ôm thân
        const a = k * Math.PI / 2 + Math.PI / 4, f = new THREE.Mesh(rkGeo.fin, rkDark);
        f.position.set(Math.cos(a) * 0.29, Math.sin(a) * 0.29, RL / 2 - 0.65); f.rotation.z = a; g.add(f);
      }
      return g;
    };
    const seatZ = Lf + 0.1 + RL / 2;   // tâm quả khi đã nằm hẳn trong ống
    // quả rocket trong từng ống (ẩn khi ống đó đã phóng / chưa nạp)
    const rounds = tubes.map(([tx, ty]) => {
      const m = makeRound();
      m.position.set(tx, ty, seatZ);
      pivot.add(m);
      return m;
    });
    const muzzles = tubes.map(([tx, ty]) => new THREE.Vector3(tx, ty, Lf - 0.05));
    // ống tên lửa chống tăng bắt ra ngoài tay chạc phải
    u.mainGun = { pivot, muzzle: new THREE.Vector3(0, 0, Lf - 0.05), muzzles, rounds, rearCaps, rear: Lr, kind: 'rocket', atgmAt: new THREE.Vector3(W / 2 + 1.25, -1.0, -0.5),
      makeRound, roundLen: RL, seatZ };
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
    b.cyl(0.24, 0.24, 0.1, 14, M.thermalWin || M.glass, [-0.95, 0.15, -0.17], 'z');
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
