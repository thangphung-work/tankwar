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
  // khớp ngóc súng máy: trên trụ chìa ra trước vòng (tay đòn), cao ~0.43 m — khóa nòng + tay cầm nằm ngay NGOÀI mép trước
  // lỗ nóc: nắp (bản lề sau, mép trước quét cung ~0.9 m) lật mở / đóng không quét qua súng, ngóc 60° tay cầm không chạm nóc
  const GUN_Y = 3.4, GUN_Z = -6.6;
  const GUN_DY = GUN_Y - 1.8;  // trụ cao hơn bản đầu (1.8): tấm chắn nâng theo
  const STAND = new THREE.Vector3(0, -0.9, GUN_Z + 6.6);   // chỗ đứng xạ thủ (tâm lỗ): tay cầm súng cách thân ~0.4 m
  const AMMO_DROP = new THREE.Vector3(-1.0, -1.6, STAND.z - 1.7);   // chỗ thả / lấy hộp đạn: lòng xe trước bụng xạ thủ
  const _v = new THREE.Vector3();
  // tay kéo lên đạn theo tiến độ nạp (mốc trong vehicle_crew, khớp tay xạ thủ)
  const chargePull = (pr) => (typeof VehicleCrew !== 'undefined' && VehicleCrew.chargePull ? VehicleCrew.chargePull(pr) : 0);
  // ống tên lửa trên giá cố định bên phải trụ súng (hệ tháp: ngang khớp ngóc súng, ngoài tấm chắn; hạ thấp để xạ thủ với tới
  // đuôi ống). Giá bắt vào vòng xoay: quay ngang theo tháp nhưng KHÔNG ngóc theo súng — phóng theo ống rồi tự dẫn lên đường ngắm
  // (nằm thấp ngay dưới mép cánh chắn phải — không đâm xuyên cánh)
  const ATGM_AT = new THREE.Vector3(3.05, 2.2, GUN_Z - 0.4), ATGM_TILT = 0.04;
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
        const sm = x => x * x * (3 - 2 * x);
        const tilt = reloading ? sm(seg(0, 0.12)) * (1 - sm(seg(0.88, 1))) : 0;
        // súng đang lắp: 12.7 (mặc định) hoặc phóng lựu cầm tay trên cùng chốt (u._mgParts — nắp / hộp đạn riêng)
        const K = u._mgParts || mg;
        if (!u._mgParts) mg.barrel.rotation.x = 0.2 * tilt;
        // TRÌNH TỰ THAY ĐẠN (pr 0..1, khớp MG_KEYS bên vehicle_crew):
        //  0.08-0.20 lật nắp khóa nòng | 0.20-0.42 tháo hộp rỗng thả xuống khoang | 0.44-0.56 cúi xuống khoang móc hộp mới
        //  0.56-0.68 nhấc hộp lên qua lỗ nóc, đặt vào khay | 0.68-0.74 mở nắp hộp | 0.74-0.86 kéo dây đạn đặt vào khay nạp
        //  0.86-0.92 sập nắp khóa nòng | 0.93-1 kéo tay lên đạn
        // bóp cò khi mới lật nắp (hộp cũ chưa tháo): nắp sập lại trong MG_ABORT_T rồi bắn tiếp (spg scoutSmartReload)
        const abortK = !reloading && u._mgAbortT > 0 ? (u._mgAbortOpen || 0) * Math.min(1, u._mgAbortT / SPGUnit3D.MG_ABORT_T) : 0;
        K.cover.rotation.x = reloading ? -1.2 * sm(seg(0.08, 0.2)) * (1 - sm(seg(0.86, 0.92))) : -1.2 * abortK;
        let off = 0, rz = 0, vis = true;
        if (reloading) {
          if (pr < 0.44) { off = sm(seg(0.2, 0.42)); rz = off * 0.7; vis = pr < 0.42; }
          else { off = 1 - sm(seg(0.5, 0.68)); rz = -off * 0.4; vis = pr > 0.5; }
        }
        if (off > 0) {
          // hộp đi từ khay súng LÙI NGANG về trên lỗ nóc trước, rồi mới hạ xuống lòng xe trước bụng xạ thủ (không xuyên nóc)
          const T = u.turretGroup, par = K.ammo.parent;
          const a = T.worldToLocal(par.localToWorld(_v.copy(K.ammo0))).clone();
          const h = sm(Math.min(1, off / 0.55)), v = sm(Math.max(0, (off - 0.35) / 0.65));
          _v.set(a.x + (AMMO_DROP.x - a.x) * h, a.y + (AMMO_DROP.y - a.y) * v + 0.4 * Math.sin(Math.PI * h) * (1 - v), a.z + (AMMO_DROP.z - a.z) * h);
          K.ammo.position.copy(par.worldToLocal(T.localToWorld(_v)));
        } else K.ammo.position.copy(K.ammo0);
        K.ammo.rotation.z = rz;
        // (giàn rocket: súng 12.7 & hộp đạn đã ẩn — không bật hiện lại hộp đạn mỗi khung hình)
        if (!(u.mainGun && !u._mgParts)) K.ammo.visible = vis;
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
            const J = K._kj || (K._kj = { p: 0, vp: 0, y: 0, vy: 0 });
            J.vp -= 0.55 + Math.random() * 0.2;
            J.vy += (Math.random() - 0.5) * 0.5;
          }
          K._cp = cp;
        }
        // Chớp lửa đầu nòng (spg.js đặt gatlingShotFlash = 1 mỗi phát) — của súng đang lắp (12.7 / phóng lựu)
        let f = u.gatlingShotFlash || 0;
        if (u.isDead) f = 0;
        const FL = K.flash ? K : mg;
        if (f > 0.02) {
          if (f >= 0.999) {
            const k = 0.7 + Math.random() * 0.6;
            FL.flash.scale.set(k, k, 0.8 + Math.random() * 0.5);
            FL.flash.rotation.z = Math.random() * Math.PI;
            // mỗi phát: vỏ đạn + mắt xích văng ra; lựu 40mm phụt cụm khói xám ở đầu nòng
            const src = u.barrelGroup;
            if (K.eject && src) (casings || (casings = makeCasings(u))).eject(K.eject, src);
            // lẫy cấp đạn kéo dây tới một mắt xích (dây đạn ở trên)
            if (K._beltAnim) { K._beltAnim.q = Math.min(3, K._beltAnim.q + 1); K._beltAnim.shake = 1; }
            // 12.7 trên chốt giá xoay: mỗi phát cả súng nảy (nòng hất lên + lệch ngang ngẫu nhiên — lò xo tắt dần), nòng
            // giật ngắn trong hộp khóa nòng
            if (K.kick) {
              const J = K._kj || (K._kj = { p: 0, vp: 0, y: 0, vy: 0 });
              J.vp += 0.9 + Math.random() * 0.5;
              J.vy += (Math.random() - 0.5) * 0.9;
              if (K.tube) K.tube.position.z = 0.16;
            }
            if (K.smokeAt && src && typeof ReloadFX !== 'undefined') {
              const p = src.localToWorld(_v.copy(K.smokeAt)), dw = src.localToWorld(K.smokeAt.clone().add(V3(0, 0, -1))).sub(p);
              ReloadFX.puff(u, p, dw, 2);
            }
          }
          FL.flash.visible = true;
          FL.flashMat.opacity = Math.min(1, f) * (u.stealthAlpha !== undefined ? u.stealthAlpha : 1);
          FL.flashMat.depthWrite = false;
          u.gatlingShotFlash = f * Math.exp(-dt * 30);
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
          // đang thay hộp: hãm rung (tay đang thao tác) — trừ lúc kéo lên đạn, súng phải nảy khi khối khóa nòng đập về
          if (u.isDead || (reloading && pr < 0.92)) { J.p *= 0.8; J.y *= 0.8; J.vp *= 0.5; J.vy *= 0.5; }
          K.kick.rotation.set(Math.max(-0.02, J.p), J.y, 0);
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
      brass: new THREE.MeshStandardMaterial({ color: 0x8a6a34, roughness: 0.4, metalness: 0.7 }),
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
        sx: (Math.random() - 0.5) * 30, sz: (Math.random() - 0.5) * 30, t: 0, rest: false, life: 1.6 + Math.random() * 0.6 });
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
    ringArm(sb, M.dark);
    for (const s of [-1, 1]) sb.box(0.12, 0.9, 1.3, M.dark, [s * 0.32, 1.0, GUN_Z + 0.55], [-0.6, 0, 0]);   // gân tam giác chân trụ
    sb.setTag('shield');
    const SZ = GUN_Z - 1.5;
    // 2 tấm trước vát chéo RA SAU từ khe súng (mũi tên chĩa về trước, làm trượt đạn) — không gập vào trong
    // (to hơn bản đầu ~15%: rộng 1.9 -> 2.2, cao 2.3 -> 2.7; mép trong vẫn chừa khe súng 0.4 mỗi bên)
    for (const s of [-1, 1]) sb.box(2.2, 2.7, 0.22, M.paint, [s * 1.5, 2.95 + GUN_DY, SZ], [0.18, -s * 0.28, 0]);
    // CÁNH CHẮN HAI BÊN: tấm thép vát chéo ra sau mỗi bên (che sườn xạ thủ khỏi đạn bắn chéo), gân tăng cứng, lỗ quan sát
    for (const s of [-1, 1]) {
      // nối mép ngoài tấm trước to hơn; mép dưới giữ nguyên (ống tên lửa cố định nằm ngay dưới cánh phải), nới cao lên trên
      const th = s * 0.62, L = 2.7, x0 = s * 2.45, z0 = SZ + 0.26, cx = x0 + Math.sin(th) * L / 2, cz = z0 + Math.cos(th) * L / 2;
      sb.box(0.22, 2.9, L, M.paint, [cx, 2.9 + GUN_DY, cz], [0, th, s * -0.06]);
      sb.box(0.3, 0.16, L, M.dark, [cx + s * 0.05, 4.32 + GUN_DY, cz], [0, th, 0]);                                // mép trên gờ
      sb.box(0.26, 0.4, 0.5, M.dark, [cx - Math.sin(th) * 0.4, 3.5 + GUN_DY, cz - Math.cos(th) * 0.4], [0, th, 0]);   // khe quan sát
      sb.box(0.5, 0.22, 0.22, M.dark, [x0 + s * 0.05, 2.9 + GUN_DY, z0 + 0.05], [0, th, 0]);                         // bản lề nối tấm trước
    }
    sb.box(5.3, 0.8, 0.22, M.paint, [0, 4.45 + GUN_DY, SZ - 0.02], [0.18, 0, 0]);
    sb.box(4.8, 0.5, 0.22, M.paint, [0, 0.9 + GUN_DY, SZ + 0.1], [0.18, 0, 0]);
    for (const s of [-1, 1]) sb.box(0.16, 0.16, 1.5, M.dark, [s * 0.6, 1.0 + GUN_DY, GUN_Z - 0.75]);   // giằng tấm chắn về trụ
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
      // +Z nhóm quay về sau súng -> đầu đạn (-Z) chĩa về trước theo nòng như dây đạn thật (trước đây chĩa ngược về xạ thủ)
      g.position.copy(pt); g.lookAt(pt.clone().add(new THREE.Vector3(-tan.z, 0, tan.x)));
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
    turret.add(atgm);
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
    gb.cyl(0.27, 0.27, 2.0, 10, M.dark, [0, 0.05, -2.0], 'z');   // ống bọc nòng (gắn liền hộp khóa nòng)
    gb.build(barrel);
    // NÒNG RỜI (súng M2 giật ngắn: nòng + khóa nòng lùi ~2 cm trong hộp khóa nòng mỗi phát) — nhóm riêng để giật trong thân súng
    const tube = new THREE.Group();
    const tbb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    tbb.cyl(0.17, 0.17, 6.6, 10, M.dark, [0, 0.05, -5.6], 'z');
    tbb.cyl(0.26, 0.24, 1.0, 10, M.dark, [0, 0.05, -9.3], 'z');
    tbb.cyl(0.12, 0.12, 0.06, 8, M.bore, [0, 0.05, -9.82], 'z');
    tbb.box(0.18, 0.45, 0.18, M.dark, [0, 0.4, -8.4]);
    tbb.build(tube);
    barrel.add(tube);
    unit.muzzleTipLocal = new THREE.Vector3(0, 0.05, -10.0);
    // Nắp hộp khóa nòng (lật lên khi lắp dây đạn mới), bản lề phía trước
    const cover = new THREE.Group();
    cover.position.set(0, 0.48, -0.2);
    const cvb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    cvb.box(0.84, 0.12, 1.7, M.dark, [0, 0.06, 0.85]);
    cvb.box(0.2, 0.18, 0.3, M.dark, [0, 0.18, 1.55]);
    cvb.build(cover);
    barrel.add(cover);
    // tay kéo lên đạn bên phải hộp khóa nòng (xạ thủ kéo 2 lần khi lắp dây mới — modelAnimator). Kiểu tay kéo M2: tấm
    // rãnh trượt dọc thành phải hộp khóa nòng (cố định) + khối trượt mang cần chìa ra ngoài và thanh nắm đứng. Hành trình
    // CHARGE_LEN ~16 cm như súng thật (trước đây 1 mẩu hộp nhỏ đi ~12 cm, bị nắm tay che khuất, nhìn như tay đứng yên)
    // chỗ nghỉ giữa thành hộp khóa nòng (tầm với của xạ thủ đứng sau tay cầm) -> kéo lùi tới sát tấm đáy hộp (z ~2.5)
    const CHARGE_LEN = 1.3, CHARGE_Z0 = 1.2;
    const slot = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    slot.box(0.035, 0.07, CHARGE_LEN + 0.4, M.dark, [0.465, 0.21, CHARGE_Z0 + CHARGE_LEN / 2]);
    slot.box(0.035, 0.07, CHARGE_LEN + 0.4, M.dark, [0.465, 0.03, CHARGE_Z0 + CHARGE_LEN / 2]);
    slot.build(barrel);
    const charge = new THREE.Group();
    charge.position.set(0.48, 0.12, CHARGE_Z0);
    const chb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y);
    chb.box(0.06, 0.11, 0.34, M.dark, [0, 0, 0]);
    chb.box(0.22, 0.07, 0.08, M.dark, [0.13, 0, 0]);
    chb.cyl(0.05, 0.05, 0.34, 8, M.dark, [0.26, 0, 0]);
    chb.build(charge);
    barrel.add(charge);

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
    return { flash, flashMat, ammo, ammo0: ammo.position.clone(), ammoLid, belt, links, beltPts, cover, barrel, kick, tube, hmgMount, hmgParts, stand: STAND.clone(),
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
    ab.box(0.04, 0.5, 0.6, M.canvas || P, [-0.52, 0, 0.1]);
    ab.build(ammo);
    // nắp hộp (bản lề cạnh ngoài; mở suốt lúc bắn cho dây lựu chạy ra, hộp mới đóng tới lúc xạ thủ lật ra)
    const ammoLid = new THREE.Group();
    ammoLid.position.set(-0.53, 0.68, 0);
    const alb = new VehicleKit.PartBatch(ROOF_Y + GUN_Y + 0.7);
    alb.box(1.06, 0.1, 1.76, D, [0.53, 0, 0]);
    alb.box(0.16, 0.14, 0.4, D, [1.0, -0.02, 0]);              // lẫy khóa
    alb.box(0.12, 0.12, 0.6, D, [0.53, 0.1, 0]);                // quai xách trên nắp
    alb.build(ammoLid);
    ammo.add(ammoLid);
    ammo.traverse(o => { if (o.isMesh) o.renderOrder = 3; });
    pivot.add(ammo);
    // DÂY LỰU 40mm: quả lựu liên kết mắt xích từ miệng hộp lên khay cấp đạn trái (hiện dần khi xạ thủ kéo dây vào súng)
    const belt = new THREE.Group();
    pivot.add(belt);
    const beltPts = new THREE.CatmullRomCurve3([V3(-1.75, 0.55, 0.3), V3(-1.6, 0.95, 0.15), V3(-1.2, 0.8, -0.05), V3(-0.85, 0.3, -0.15)]);
    const brass = new THREE.MeshStandardMaterial({ color: 0x6a5530, roughness: 0.5, metalness: 0.6 });
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
    const flashMat = new THREE.MeshBasicMaterial({
      map: VehicleKit.getMuzzleFlashTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flash = new THREE.Group();
    flash.position.set(0, 0.05, -5.9);
    flash.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), flashMat));
    for (const rz of [0, Math.PI / 2]) {
      const petal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), flashMat);
      petal.rotation.set(Math.PI / 2, 0, rz);
      petal.position.z = -0.6;
      flash.add(petal);
    }
    flash.visible = false;
    pivot.add(flash);
    // vỏ lựu rỗng rơi qua cửa đáy phía trước thân súng, mắt xích nhả cửa phải
    const eject = { kind: 'agl', at: V3(0, -0.55, -0.2), dir: V3(0.1, -1, -0.3), link: V3(0.7, -0.1, -0.1), linkDir: V3(1, -0.2, 0) };
    u.mainGun = { pivot, muzzle: new THREE.Vector3(0, 0.05, -5.4), kind: 'agl' };
    // chỗ tay xạ thủ khi nạp (vehicle_crew): chốt nắp trên ở mép sau, mép nắp hộp, tay kéo lên đạn phải (lùi ~7 cm)
    u._mgParts = { cover, ammo, ammo0: ammo.position.clone(), ammoLid, belt, links, beltPts, barrel: pivot, flash, flashMat, eject, smokeAt: V3(0, 0.05, -5.5),
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
    const lipGeo = new THREE.RingGeometry(0.36, 0.44, 16);
    const lipMat = D.clone(); lipMat.side = THREE.DoubleSide;
    for (const [tx, ty] of tubes) for (const z of [Lf, Lr]) { const r = new THREE.Mesh(lipGeo, lipMat); r.position.set(tx, ty, z); pivot.add(r); }
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
    u.mainGun = { pivot, muzzle: new THREE.Vector3(0, 0, Lf - 0.05), muzzles, rounds, rear: Lr, kind: 'rocket', atgmAt: new THREE.Vector3(W / 2 + 1.25, -1.0, -0.5),
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
