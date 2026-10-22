/**
 * UAV CẢM TỬ KIỂU TÊN LỬA (đạn bay lảng vảng) — món ô UAV của lựu pháo ('kami'), thay drone trinh sát.
 * Ống phóng nằm cố định trên nóc cabin (roof_mounts.js buildKamiLauncher, phần cứng u.kamiRack).
 *
 *  GĐ1 — Ctrl: PHÓNG BẰNG KHÍ NÉN: van mở, khí cao áp phụt đẩy UAV bung khỏi ống (nắp nhựa đầu ống bật văng, hơi khí trắng
 *        phụt ra miệng & cửa xả đáy ống). Chưa có lực đẩy: rơi chúc theo đà.
 *  GĐ2 — ~0,1 s sau 4 cánh gập dọc thân bật bung, đuôi đứng dựng lên; ~0,3 s động cơ tên lửa đẩy TỐC ĐỘ THẤP phía sau đánh
 *        lửa: lửa phụt đuôi + vệt khói xám kéo dài, UAV tăng tốc, ngóc lên lấy độ cao.
 *  GĐ3 — chuyển sang hình CAMERA MŨI: lái như máy bay lượn — luôn lao về trước (không treo được như drone trinh sát), tốc độ
 *        chỉ nhỉnh hơn drone trinh sát chút. A / D: nghiêng cánh rẽ · W / S: chúc / ngóc mũi · Shift: tăng lực đẩy (tốn
 *        nhiên liệu). Muốn đâm trúng phải tự lượn vòng, canh hướng rồi chúc mũi lao vào xe. Space: KHÓA xe gần tâm màn
 *        hình (khung vuông đơn giản + cự ly; lúc lao sát mục tiêu đầu dò kéo mũi nhẹ — vẫn phải tự lái là chính).
 *  GĐ4 — chạm xe / đất thì đầu nổ lõm (nổ lõm mạnh, đánh nóc) kích hoạt; màn hình nhiễu trắng báo TRÚNG MỤC TIÊU / ĐÃ KÍCH NỔ.
 *        Phát nổ = một viên đạn thật bắn từ ngay trên điểm chạm thẳng xuống (ballistics + handleShellImpact: giáp / sát
 *        thương / mạng / chống gian lận như mọi phát bắn).
 *  - Hết nhiên liệu: động cơ tắt, mất lực đẩy, lượn rơi xoắn ốc rồi tự nổ khi chạm đất.
 *  - Máy phá sóng (ew_jammer.js đặt D.emiT): lệnh điều khiển chập chờn, UAV giật / chao; nằm trong chùm ~1,6 s là mất điều
 *    khiển hẳn — bay rối loạn, lộn nhào rồi đâm xuống phát nổ.
 *  - Radar phòng không / radar trinh sát bắt được UAV cảm tử XA HƠN drone thường (vệt khói + động cơ nóng: DETECT_MUL,
 *    drone_air.js airDetectR).
 *  - Mỗi UAV dùng 1 lần: vật tư KAMIKAZE (Equipment AMMO_SHOP, u.kamikazeCount). Phóng xong ~6 s nạp quả mới vào ống nếu còn.
 *    Đóng màn hình khi đang bay: UAV lượn vòng tại chỗ chờ.
 *  - Máy khác thấy drone bay như drone trinh sát (gói DRONE), mô hình tên lửa cánh gập + lửa đuôi + vệt khói.
 */
const KamiUAV = (() => {
  const C = {
    fuel: 40,         // nhiên liệu động cơ đẩy ở lực đẩy thường (s); Shift tốn gấp BOOST_BURN
    boostBurn: 1.7,
    reload: 6,        // nạp quả mới vào ống sau khi phóng (s)
    launchT: 1.4,     // pha phóng: khí nén đẩy ra -> bung cánh -> đánh lửa, ngóc lên -> chuyển sang hình camera mũi (s)
    ejectV: 95,       // tốc độ khí nén đẩy UAV rời ống (đv/s, ~12 m/s)
    wingT: [0.08, 0.3],   // cánh bung từ .. tới (s sau khi rời ống)
    motorT: 0.32,     // động cơ tên lửa đánh lửa (s)
    cruise: 135,      // tốc độ bay lực đẩy thường (đv/s) — drone trinh sát 105
    boost: 170,       // giữ Shift
    minV: 95, maxV: 300,   // chậm hơn minV thì thất tốc chúc mũi; lao dốc tối đa
    turn: 0.85,       // tốc độ rẽ khi nghiêng cánh hết cỡ (rad/s)
    pitchRate: 0.85,  // tốc độ chúc / ngóc mũi (rad/s)
    pitchMin: -1.35, pitchMax: 0.55,
    ceiling: 650,     // trần bay trên mặt đất (đv)
    loiterR: 110,     // bán kính lượn vòng chờ lệnh khi đóng màn hình (đv)
    lockR: 1300, lockCone: 0.2,   // khóa mục tiêu: cự ly / lệch tâm màn hình tối đa (rad)
    assistR: 260, assistCone: 0.35, assist: 0.9,   // đầu dò kéo mũi lúc lao sát mục tiêu đã khóa
    jamLose: 1.6,     // nằm trong chùm phá sóng bấy nhiêu giây thì mất điều khiển hẳn
    gimbalCone: 1.35, gimbalSens: 0.0035,   // camera mũi xoay đa hướng theo chuột trong hình nón (nửa góc, rad) / độ nhạy
    span: 3.6,        // nửa sải cánh trước (đv, đã nhân tỉ lệ mô hình) — mút cánh quẹt nhà / đất là gãy cánh
    hitR: 10,         // khoảng cách tâm xe coi là chạm (đv)
    direct: 4.4, splash: 1.9, blast: { radius: 52, core: 16 },   // đầu nổ lõm mạnh
    DETECT_MUL: 1.4   // radar bắt UAV cảm tử xa hơn drone thường bấy nhiêu lần
  };
  const nowS = () => performance.now() / 1000;
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  // ---------- MÔ HÌNH (đạn bay lảng vảng cánh gập: thân trụ, 2 cặp cánh gập dọc thân bung ra, đuôi đứng gập ngang dựng
  // lên, động cơ tên lửa đẩy ở đuôi có loa phụt + lửa phụt, camera mũi, khoang đầu nổ lõm). Trong ống: cánh / đuôi gập
  // sát thân. Thứ tự xoay YXZ (hướng mũi -> chúc / ngóc -> nghiêng cánh) như máy bay ----------
  const MATS = {};
  function mats(team) {
    if (!MATS[team] && typeof VehicleKit !== 'undefined') {
      const M = VehicleKit.createMaterials(team, { battle: 0.6 });
      M.soot = M.soot || M.dark;
      MATS[team] = M;
    }
    return MATS[team];
  }
  function build(team) {
    const M = mats(team), g = new THREE.Group();
    g.name = 'kamiUav';
    g.rotation.order = 'YXZ';
    if (!M) return g;
    const PB = VehicleKit.PartBatch, P = M.paint, D = M.dark;
    // thân thon dài kiểu đạn bay lảng vảng (Switchblade 600 / Hero-120): trụ mảnh, mũi tròn có tháp camera, đuôi thu nhỏ
    // về loa phụt. Trục cyl 'z': rTop ở phía sau (+z), rBottom phía mũi (-z)
    const b = new PB(0);
    b.cyl(0.34, 0.34, 4.6, 16, P, [0, 0, 0.1], 'z');                  // thân
    b.cyl(0.34, 0.24, 0.7, 16, P, [0, 0, -2.5], 'z');                 // mũi thuôn
    b.add(new THREE.SphereGeometry(0.24, 14, 10), P, [0, 0, -2.85]);   // chóp mũi tròn
    b.add(new THREE.SphereGeometry(0.15, 12, 8), M.glass, [0, -0.04, -3.02]);   // ô kính camera / đầu dò
    b.cyl(0.36, 0.36, 0.06, 16, D, [0, 0, -1.9], 'z');                // mối ghép khoang đầu nổ lõm
    b.cyl(0.36, 0.36, 0.22, 16, M.canvas || P, [0, 0, -1.6], 'z');    // vạch vàng bạc màu (đầu nổ)
    b.cyl(0.36, 0.36, 0.06, 16, D, [0, 0, 1.2], 'z');                 // mối ghép khoang động cơ
    b.box(0.04, 0.04, 3.8, D, [0.24, 0.24, 0.1]);                      // đường ghép vỏ
    b.box(0.08, 0.16, 0.7, D, [0, -0.36, 0.3]);                        // ăng-ten liên lạc bụng
    b.box(0.03, 0.4, 0.03, D, [0, -0.6, 0.55]);
    for (const z of [-0.9, 1.9]) b.box(0.3, 0.1, 0.34, D, [0, z < 0 ? 0.36 : -0.36, z]);   // khớp bản lề cánh
    b.cyl(0.3, 0.34, 0.5, 16, P, [0, 0, 2.65], 'z');                  // đuôi thu nhỏ
    b.cyl(0.26, 0.2, 0.32, 14, M.soot || D, [0, 0, 3.05], 'z', null, true);   // loa phụt ám muội
    b.box(0.05, 0.42, 0.42, P, [0, -0.5, 2.55], [0.3, 0, 0]);          // vây bụng cố định
    b.build(g);
    // cánh: nhóm xoay quanh bản lề gốc; fold = góc xoay Y lúc gập dọc thân. Cánh mỏng, vuốt nhọn dần, hơi xuôi về sau
    const wings = [];
    const wing = (z, y, len, root, tip, s, fold) => {
      const w = new THREE.Group();
      w.position.set(0, y, z);
      // tấm cánh hình thang liền (đùn mỏng): gốc rộng, mút hẹp, mút xuôi về sau; mặt phẳng XZ của nhóm cánh
      const sw = len * 0.14, sh = new THREE.Shape();
      sh.moveTo(0, root / 2); sh.lineTo(s * len, sw + tip / 2); sh.lineTo(s * len, sw - tip / 2); sh.lineTo(0, -root / 2); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);   // (x, y) hình -> (x, z): y dương = phía đuôi (mút xuôi về sau)
      geo.translate(0, 0.025, 0);
      const wb = new PB(0);
      wb.add(geo, P, [0, 0, 0]);
      wb.box(0.06, 0.06, tip, D, [s * (len - 0.03), 0, sw]);   // bịt mút cánh
      wb.build(w);
      g.add(w);
      wings.push({ w, fold, s, front: z < 0 });
    };
    // cánh trước gập về sau (xoay -s·90°), cánh sau gập về trước (+s·90°); trái / phải lệch cao một chút để gập chồng nhau
    for (const s of [-1, 1]) {
      wing(-0.9, 0.4 + (s > 0 ? 0.05 : 0), 2.8, 0.42, 0.22, s, -s * Math.PI / 2 * 0.97);
      wing(1.9, -0.4 - (s > 0 ? 0.05 : 0), 2.1, 0.38, 0.2, s, s * Math.PI / 2 * 0.97);
    }
    // đuôi đứng: gập nằm ngang sát thân, dựng lên khi bung (hình thang xuôi về sau)
    const fin = new THREE.Group();
    fin.position.set(0, 0.32, 2.35);
    const fb = new PB(0);
    fb.box(0.04, 0.4, 0.55, P, [0, 0.2, 0.05]);
    fb.box(0.04, 0.4, 0.36, P, [0, 0.58, 0.2]);
    fb.build(fin);
    g.add(fin);
    // lửa phụt đuôi: hình nón cộng sáng, giãn / chập chờn theo lực đẩy (ẩn khi động cơ chưa cháy / đã tắt)
    const fl = new THREE.Group();
    fl.position.set(0, 0, 3.2);
    const fm = (r, len, col, op) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = Math.PI / 2;   // đỉnh nón chĩa về sau (+z)
      m.position.z = len / 2;
      fl.add(m);
      return m;
    };
    fm(0.22, 2.2, 0xff7a20, 0.7);
    fm(0.12, 1.2, 0xfff0b0, 0.9);
    fl.visible = false;
    g.add(fl);
    g.userData.kami = { wings, fin, flame: fl, thr: 0, trailT: 0 };
    g.scale.setScalar(1.3);
    animate(g, 0, 0, 0);   // dựng ra ở tư thế gập (trong ống)
    return g;
  }
  // open 0..1: cánh / đuôi bung (bật nhanh, hơi vượt rồi khóa chốt); thr 0..1: lực đẩy động cơ tên lửa (lửa đuôi)
  const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function animate(g, dt, open, thr) {
    const K = g && g.userData.kami;
    if (!K) return;
    const e = open >= 1 ? 1 : open <= 0 ? 0 : easeOutBack(open);
    for (const W of K.wings) W.w.rotation.y = W.fold * (1 - e);
    K.fin.rotation.z = Math.PI / 2 * (1 - e);
    K.thr = thr;
    K.flame.visible = thr > 0.02;
    if (K.flame.visible) {
      const f = 0.75 + Math.random() * 0.35;
      K.flame.scale.set(0.8 + 0.2 * f, 0.8 + 0.2 * f, (0.45 + 0.75 * thr) * f);
    }
  }

  const methods = {
    kamiOn(P) { return !!(P && P.tankType === 'ARTILLERY' && P.uavKind === 'kami'); },

    // tâm miệng ống phóng còn đạn (tọa độ thế giới) + hướng ống
    kamiTubeWorld(P) {
      const R = P.kamiRack;
      if (!R || !R.tilt) return { pos: new THREE.Vector3(P.x, (P.y || 0) + 30, P.z), dir: new THREE.Vector3(0, 0.5, -1).normalize() };
      R.tilt.updateWorldMatrix(true, false);
      const pos = R.tubes[0].clone().applyMatrix4(R.tilt.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(R.tilt.matrixWorld);
      return { pos, dir };
    },

    // Ctrl với UAV cảm tử: phóng khỏi ống (hoặc mở lại hình nếu UAV đang lượn ngoài kia)
    launchKami() {
      const P = this.player, D = this.droneState(), SE = window.soundEngine;
      if (D.state === 'launching') return;
      if (D.state === 'flying' || D.state === 'returning') { this.setSightMode(true); return; }
      if (P.dmg && P.dmg.lost && P.dmg.lost.has('kamiRack')) { this.addCombatLog('[[alert-triangle]] Ống phóng UAV cảm tử đã bị bắn văng — không phóng được', 'alert'); return; }
      if (D.state !== 'docked') {
        const left = Math.max(0, Math.ceil(D.reloadT || 0));
        this.addCombatLog((P.kamikazeCount || 0) > 0 ? `[[hourglass]] Đang nạp UAV cảm tử mới vào ống (~${left} s)` : '[[alert-triangle]] Hết UAV cảm tử — mua thêm ở mục ĐẠN (kho trang bị)' + (this.stockNote ? this.stockNote('KAMIKAZE') : ''), 'alert');
        return;
      }
      if ((P.kamikazeCount || 0) <= 0) { this.addCombatLog('[[alert-triangle]] Hết UAV cảm tử — mua thêm ở mục ĐẠN (kho trang bị)' + (this.stockNote ? this.stockNote('KAMIKAZE') : ''), 'alert'); return; }
      P.kamikazeCount--;
      const T = this.kamiTubeWorld(P);
      D.state = 'launching'; D.launchT = 0; D.fuel = 1; D.batt = 1; D.hp = 1; D.dive = null; D.fall = null; D.warned = 0;
      D.thr = 0; D.kjam = 0; D.lock = null; D.boost = false; D.ignited = false; D.loop = null; D.trailP = null; D.gy = 0; D.gp = 0;
      if (D.model && D.model.userData.kami) for (const W of D.model.userData.kami.wings) W.w.visible = true;   // quả mới: đủ cánh
      // UAV gập cánh nằm trong ống: trượt ra khỏi miệng ống trong vài phần trăm giây đầu
      D.x = T.pos.x - T.dir.x * 6; D.y = T.pos.y - T.dir.y * 6; D.z = T.pos.z - T.dir.z * 6;
      // khí nén đẩy ra theo hướng ống (cộng vận tốc xe đang chạy)
      const bs = P.speed || 0, ba = P.bodyAngle || 0;
      D.vx = T.dir.x * C.ejectV - Math.sin(ba) * bs; D.vy = T.dir.y * C.ejectV; D.vz = T.dir.z * C.ejectV - Math.cos(ba) * bs;
      D.yaw = Math.atan2(-T.dir.x, -T.dir.z);
      D.roll = 0;
      this.kamiEjectFx(P, T);
      if (SE && SE.playKamiLaunch) SE.playKamiLaunch(0, null);
      else if (SE && SE.playRocketLaunch) SE.playRocketLaunch(0, null);
      this.addCombatLog(`[[rocket]] UAV CẢM TỬ RỜI ỐNG — A/D nghiêng cánh rẽ, W/S chúc/ngóc mũi, Shift tăng lực đẩy, Space khóa xe; tự lượn rồi lao mũi vào mục tiêu (còn ${P.kamikazeCount} quả)`, 'tip');
      if (this.updateAmmoUI) this.updateAmmoUI();
    },

    // Space khi đang lái UAV cảm tử: khóa / bỏ khóa xe gần tâm màn hình (true = đã xử lý phím, không bắn pháo)
    kamiTryLock() {
      const P = this.player;
      if (!this.kamiOn(P)) return false;
      const D = this.droneState(), S = this._sight;
      if (D.state !== 'flying' || !S || !S.arty) return false;
      if (D.fall || S.dying) return true;
      const SE = window.soundEngine;
      if (D.lock) {
        D.lock = null;
        this.addCombatLog('[[target-off]] UAV cảm tử: đã bỏ khóa', 'tip');
        return true;
      }
      const cam = this.camera, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      let best = null, bestA = C.lockCone;
      for (const u of this.units || []) {
        if (u === P || u.isDead || u.team === P.team || u.isHiddenFromPlayer) continue;
        const dx = u.x - cam.position.x, dy = (u.y || 0) + 7 - cam.position.y, dz = u.z - cam.position.z, dl = Math.hypot(dx, dy, dz);
        if (dl > C.lockR || dl < 1) continue;
        const a = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dy * f.y + dz * f.z) / dl)));
        if (a < bestA) { bestA = a; best = u; }
      }
      if (!best) {
        this.addCombatLog('[[target-arrow]] Không có xe địch gần tâm màn hình để khóa — hướng mũi UAV về phía xe rồi bấm Space', 'alert');
        return true;
      }
      D.lock = best;
      if (SE && SE.playRadarContact) SE.playRadarContact(1);
      this.addCombatLog(`[[target-arrow]] UAV CẢM TỬ KHÓA ${best.name || 'XE ĐỊCH'} — tự lượn lại gần rồi chúc mũi lao vào, đầu dò chỉ kéo mũi nhẹ lúc sát mục tiêu`, 'tip');
      return true;
    },

    // xe UAV va vào (tâm thân xe trong tầm hitR theo phương ngang, độ cao trong khoảng thân xe)
    kamiHitUnit(D) {
      const P = this.player;
      for (const u of this.units || []) {
        if (u === P || u.isDead) continue;
        const uy = u.y || (this.terrain ? this.terrain.getElevationAt(u.x, u.z) : 0);
        if (Math.hypot(u.x - D.x, u.z - D.z) < C.hitR && D.y < uy + 15 && D.y > uy - 3) return u;
      }
      return null;
    },

    // đoạn bay a -> b đâm vào nhà / cứ điểm / công trình: điểm chạm hoặc null
    kamiObstacle(ax, ay, az, bx, by, bz) {
      const T = this.terrain;
      if (!T) return null;
      return (T.buildingSegmentHit && T.buildingSegmentHit(ax, ay, az, bx, by, bz))
        || (T.strongholdSegmentHit && T.strongholdSegmentHit(ax, ay, az, bx, by, bz))
        || (T.landmarkSet && T.landmarkSet.segmentHit && T.landmarkSet.segmentHit(ax, ay, az, bx, by, bz)) || null;
    },
    // đâm vật cản: kích nổ tại điểm chạm, đầu nổ lõm phóng theo hướng bay (vào tường / mái)
    kamiCrash(D, ax, ay, az) {
      const h = this.kamiObstacle(ax, ay, az, D.x, D.y, D.z);
      if (!h) return false;
      if (h.x !== undefined) { D.x = h.x; D.y = h.y; D.z = h.z; }   // cứ điểm / công trình chỉ báo có chạm: nổ tại chỗ
      this.kamiDetonate(D, null, true);
      return true;
    },

    // MÚT CÁNH quẹt nhà / công trình / mặt đất (thân chưa chạm): cánh gãy văng, UAV mất cân bằng — lộn nhào xoắn ốc về phía
    // cánh gãy rồi cắm xuống, chạm đất / nhà thì đầu nổ kích hoạt. Mũi tên mút cánh: vuông góc hướng bay, nghiêng theo cánh
    kamiWingStrike(D, ax, ay, az) {
      if (D.fall) return false;
      const gr = (x, z) => (this.terrain ? this.terrain.getElevationAt(x, z) : 0);
      const rx = Math.cos(D.yaw), rz = -Math.sin(D.yaw), cr = Math.cos(D.roll || 0), sr = Math.sin(D.roll || 0);
      for (const side of [1, -1]) {
        // roll dương = nghiêng trái: cánh phải (side 1) nâng lên
        const ox = rx * C.span * cr * side, oz = rz * C.span * cr * side, oy = C.span * sr * side;
        const bx = D.x + ox, by = D.y + oy, bz = D.z + oz;
        const hit = by <= gr(bx, bz) + 0.3 || this.kamiObstacle(ax + ox, ay + oy, az + oz, bx, by, bz);
        if (!hit) continue;
        D.fall = { t: 0, spin: side, jam: true, wing: true };
        D.lock = null;
        D.yaw += side * 0.35;   // cú va giật mũi về phía cánh gãy
        D.vy += 25;
        const M = D.model && D.model.userData.kami;
        if (M) for (const W of M.wings) if (W.s === side && W.front) W.w.visible = false;
        this.kamiWingDebris(bx, by, bz, D, side);
        const S = this._sight;
        if (S && S.arty) { S.jolt = 1; S.glitch = Math.max(S.glitch || 0, 0.35); }
        const SE = window.soundEngine;
        if (SE && SE.playDroneHit) try { SE.playDroneHit(); } catch (e) { /* không có tiếng va */ }
        this.addCombatLog(`[[alert-triangle]] UAV CẢM TỬ QUẸT CÁNH ${side > 0 ? 'PHẢI' : 'TRÁI'} — gãy cánh, mất cân bằng, đang lộn nhào rơi`, 'alert');
        return true;
      }
      return false;
    },
    // mảnh cánh gãy văng xoay lộn, rơi xuống đất nằm lại vài giây
    kamiWingDebris(x, y, z, D, side) {
      const M = mats(this.player.team);
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.45), (M && M.paint) || new THREE.MeshStandardMaterial({ color: 0x556644 }));
      m.position.set(x, y, z);
      this.scene.add(m);
      const L = this._kamiBits || (this._kamiBits = []);
      L.push({ m, vx: D.vx * 0.3 + Math.cos(D.yaw) * side * 20, vy: 10 + Math.random() * 10, vz: D.vz * 0.3 - Math.sin(D.yaw) * side * 20,
        sx: 10 + Math.random() * 8, sz: 6 + Math.random() * 6, life: 6 });
    },

    /**
     * Bay lượn bằng động cơ tên lửa: luôn lao về trước; inp.turn (-1 trái .. 1 phải) nghiêng cánh rẽ, inp.pitch (-1 chúc ..
     * 1 ngóc), inp.boost tăng lực đẩy. Chúc mũi thì nhanh dần (trọng lực), ngóc thì chậm dần, chậm quá thất tốc chúc mũi.
     */
    kamiFly(dt, D, inp) {
      const gr = (x, z) => (this.terrain ? this.terrain.getElevationAt(x, z) : 0);
      if (D.v === undefined) D.v = Math.hypot(D.vx, D.vy, D.vz) || C.cruise;
      if (D.pitch === undefined) D.pitch = Math.atan2(D.vy, Math.hypot(D.vx, D.vz) || 1);
      D.boost = !!inp.boost;
      D.thr = D.boost ? 1 : 0.7;
      const kr = 1 - Math.exp(-dt * 3);
      D.roll = (D.roll || 0) + (-inp.turn * 0.65 - (D.roll || 0)) * kr;
      D.yaw = wrap(D.yaw + (D.roll / 0.65) * C.turn * dt);
      D.pitch += inp.pitch * C.pitchRate * dt;
      if (!inp.pitch) D.pitch -= D.pitch * 0.2 * dt;   // tự cân mũi rất chậm
      if (D.v < C.minV) D.pitch -= (C.minV - D.v) / C.minV * 1.6 * dt;   // thất tốc: chúc mũi
      const gY = gr(D.x, D.z);
      if (D.y > gY + C.ceiling && D.pitch > 0) D.pitch -= dt * 1.2;
      D.pitch = Math.max(C.pitchMin, Math.min(C.pitchMax, D.pitch));
      const want = D.boost ? C.boost : C.cruise;
      D.v += (want - D.v) * 0.7 * dt - 120 * Math.sin(D.pitch) * dt;
      D.v = Math.max(50, Math.min(C.maxV, D.v));
      const cp = Math.cos(D.pitch);
      D.vx = -Math.sin(D.yaw) * cp * D.v; D.vz = -Math.cos(D.yaw) * cp * D.v; D.vy = Math.sin(D.pitch) * D.v;
      D.x += D.vx * dt; D.y += D.vy * dt; D.z += D.vz * dt;
    },

    // HẾT NHIÊN LIỆU: động cơ tắt, lượn rơi xoắn ốc. BỊ PHÁ SÓNG MẤT ĐIỀU KHIỂN (F.jam): động cơ vẫn cháy, bay rối loạn,
    // lộn nhào rồi cắm xuống. Chạm xe / đất thì đầu nổ kích hoạt. Trả về true nếu đã nổ
    kamiFallPhys(dt, D) {
      const F = D.fall;
      const gr = (x, z) => (this.terrain ? this.terrain.getElevationAt(x, z) : 0);
      F.t += dt;
      D.thr = F.jam && D.fuel > 0 ? 0.7 + Math.random() * 0.3 : 0;
      const hv = Math.hypot(D.vx, D.vz) || 1;
      if (F.jam) {
        // lệnh điều khiển loạn: mũi giật trái phải, chao lăn, cắm dần xuống
        F.k = (F.k || 0) - dt;
        if (F.k <= 0) { F.k = 0.15 + Math.random() * 0.3; F.yr = (Math.random() - 0.5) * 5; }
        D.yaw += (F.yr || 0) * dt;
        const nh = Math.max(60, hv * (1 - 0.25 * dt));
        D.vx = -Math.sin(D.yaw) * nh; D.vz = -Math.cos(D.yaw) * nh;
        D.vy = Math.max(-220, D.vy - (50 + F.t * 40) * dt);
        D.roll = F.wing ? -F.spin * F.t * 4.5 : Math.sin(F.t * 9) * 0.9 + F.spin * F.t * 1.5;   // gãy cánh: lăn tròn về phía cánh gãy
      } else {
        D.yaw += F.spin * Math.min(1.6, 0.4 + F.t * 0.35) * dt;
        const nh = Math.max(20, hv * (1 - 0.35 * dt));
        D.vx = -Math.sin(D.yaw) * nh; D.vz = -Math.cos(D.yaw) * nh;
        const lift = Math.min(1, nh / C.cruise) * Math.max(0, 1 - F.t * 0.4);
        D.vy = Math.max(-170, D.vy - (78 - 60 * lift) * dt);
        D.roll = F.spin * Math.min(1.3, F.t * 0.45);
      }
      const ax = D.x, ay = D.y, az = D.z;
      D.x += D.vx * dt; D.y += D.vy * dt; D.z += D.vz * dt;
      D.pitch = Math.atan2(D.vy, Math.hypot(D.vx, D.vz) || 1);
      if (this.kamiCrash(D, ax, ay, az)) return true;
      const U = this.kamiHitUnit(D);
      if (U) { this.kamiDetonate(D, U); return true; }
      if (D.y <= gr(D.x, D.z) + 1.2) { this.kamiDetonate(D, null); return true; }
      return false;
    },

    /**
     * Mỗi khung hình khi màn hình UAV cảm tử đang mở (game.js updateSightCamera nhánh drone): lái bằng phím, camera mũi,
     * khung khóa mục tiêu, số liệu. true = đã xử lý xong camera khung hình này
     */
    kamiFlyStep(dt, S, D) {
      const P = this.player, cam = this.camera, T = this.terrain, SE = window.soundEngine;
      const gr = (x, z) => (T ? T.getElevationAt(x, z) : 0);
      this.kamiUi(S);
      if (D.fall) {
        if (this.kamiFallPhys(dt, D)) return true;
      } else {
        const K = S.keys || {};
        const inp = { turn: (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), pitch: (K.KeyS ? 1 : 0) - (K.KeyW ? 1 : 0), boost: !!(K.ShiftLeft || K.ShiftRight) };
        // nhiễu điện từ của máy phá sóng (ew_jammer.js D.emiT): lệnh mất từng lúc, mũi giật, chao
        if (D.emiT > 0) {
          const E = D._emi || (D._emi = { t: 0 });
          E.t -= dt;
          if (E.t <= 0) { E.t = 0.2 + Math.random() * 0.35; E.turn = (Math.random() - 0.5) * 2.4; E.pitch = (Math.random() - 0.5) * 1.6; E.drop = Math.random() < 0.4; }
          if (E.drop) { inp.turn = 0; inp.pitch = 0; }
          inp.turn += E.turn; inp.pitch += E.pitch;
        }
        // ra ngoài tầm tín hiệu / sát mép bản đồ: bộ lái tự động quay đầu về phía xe mình
        const DC = ArtilleryGame3D.DRONE, R = this.artyRangeOf ? this.artyRangeOf(P) : { max: 2000 };
        const sig = R.max + DC.signalExtra, dd = Math.hypot(D.x - P.x, D.z - P.z);
        const edge = Math.max(0, (T && T.width ? T.width : this.worldWidth) / 2 - 80);
        S.sigEdge = dd > sig - 60;
        if (dd > sig || Math.abs(D.x) > edge || Math.abs(D.z) > edge) {
          const want = Math.atan2(-(P.x - D.x), -(P.z - D.z));
          inp.turn = Math.max(-1, Math.min(1, -wrap(want - D.yaw) * 2));
        }
        // đầu dò bám mục tiêu đã khóa: lúc lao sát, mục tiêu gần hướng mũi -> kéo mũi nhẹ về phía xe
        const L = D.lock && !D.lock.isDead ? D.lock : (D.lock = null);
        if (L) {
          const ly = (L.y || gr(L.x, L.z)) + 7, dx = L.x - D.x, dy = ly - D.y, dz = L.z - D.z, dl = Math.hypot(dx, dy, dz);
          if (dl > C.lockR * 1.3) { D.lock = null; this.addCombatLog('[[target-off]] UAV cảm tử mất khóa — mục tiêu ra ngoài tầm đầu dò', 'alert'); }
          else if (dl < C.assistR) {
            const sp = D.v || 1, a = Math.acos(Math.max(-1, Math.min(1, (dx * D.vx + dy * D.vy + dz * D.vz) / (dl * sp))));
            if (a < C.assistCone) {
              const k = Math.min(1, C.assist * dt * 3);
              D.yaw = wrap(D.yaw + wrap(Math.atan2(-dx, -dz) - D.yaw) * k);
              D.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - D.pitch) * k;
            }
          }
        }
        const ax = D.x, ay = D.y, az = D.z;
        this.kamiFly(dt, D, inp);
        if (this.kamiCrash(D, ax, ay, az)) return true;
        this.kamiWingStrike(D, ax, ay, az);
        const U = this.kamiHitUnit(D);
        if (U) { this.kamiDetonate(D, U); return true; }
        if (D.y <= gr(D.x, D.z) + 1.2) { this.kamiDetonate(D, null); return true; }
      }
      // ---- camera mũi: nhìn theo hướng bay, nghiêng theo cánh, rung theo tốc độ / nhiễu ----
      const sp = Math.hypot(D.vx, D.vy, D.vz) || 1;
      const fx = D.vx / sp, fy = D.vy / sp, fz = D.vz / sp;
      const shake = (Math.random() - 0.5) * (D.fall ? 1.4 : D.emiT > 0 ? 0.9 : 0.12 + sp / C.maxV * 0.35);
      const px = D.x + fx * 4.5 + shake, py = D.y + fy * 4.5 + shake * 0.6, pz = D.z + fz * 4.5;
      cam.position.set(px, py, pz);
      cam.up.set(0, 1, 0);
      cam.lookAt(px + fx * 100, py + fy * 100, pz + fz * 100);
      cam.rotateZ(D.roll || 0);
      // gimbal camera mũi: xoay theo chuột quanh trục mũi, giới hạn trong hình nón gimbalCone (gắn trên thân -> nghiêng theo cánh)
      if (D.gy || D.gp) { cam.rotateY(-(D.gy || 0)); cam.rotateX(D.gp || 0); }
      if (Math.abs(cam.fov - 58) > 0.01) { cam.fov = 58; cam.updateProjectionMatrix(); }
      if (S.jolt > 0) {
        S.jolt = Math.max(0, S.jolt - dt * 2.5);
        cam.rotateX((Math.random() - 0.5) * S.jolt * 0.14);
        cam.rotateY((Math.random() - 0.5) * S.jolt * 0.14);
      }
      if (S.glitch > 0) {
        S.glitch -= dt;
        this.renderer.domElement.style.transform = S.glitch > 0 && Math.random() < 0.7
          ? 'translate(' + Math.round((Math.random() - 0.5) * 30 * S.glitch) + 'px,' + Math.round((Math.random() - 0.5) * 16 * S.glitch) + 'px)' : '';
      }
      if (S.underFire > 0) S.underFire -= dt;
      // điểm mặt đất trước mũi (bóng nắng, LOD, tâm bản đồ)
      let cx = D.x + fx * 600, cz = D.z + fz * 600;
      for (let t = 20; t < 3000; t += 40) {
        const x = px + fx * t, y = py + fy * t, z = pz + fz * t;
        if (y <= gr(x, z)) { cx = x; cz = z; break; }
      }
      S.cx = cx; S.cz = cz;
      const gD = gr(D.x, D.z);
      S.y = gr(cx, cz); S.h = py - gD; S.alt = Math.round(py - gD); S.yaw = D.yaw;
      this._camYaw = D.yaw;
      this._lodMag = 1;
      this._viewFocus = { x: cx, z: cz };
      const half = 600, sd = this.sunDir || new THREE.Vector3(-0.42, 0.82, -0.36), sc = this.sunLight && this.sunLight.shadow.camera;
      if (sc) {
        if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
        const mx = (D.x + cx) / 2, mz = (D.z + cz) / 2, my = gr(mx, mz);
        this.sunLight.position.set(mx + sd.x * 1300, my + sd.y * 1300, mz + sd.z * 1300);
        this.sunLight.target.position.set(mx, my, mz);
      }
      if (SE && SE.updateDrone) SE.updateDrone(false, {});
      if (SE && SE.updateKamiRocket) SE.updateKamiRocket(D.thr || 0);
      if (SE && SE.updateKamiDive) SE.updateKamiDive(Math.max(0, (sp - C.cruise) / (C.maxV - C.cruise)) * 0.8);
      this.kamiHud(dt, S, D);
      return true;
    },

    // chuột xoay camera mũi (mx, my: movementX / Y). Giới hạn trong hình nón: độ lệch tổng khỏi trục mũi <= gimbalCone
    kamiGimbal(mx, my) {
      const D = this.droneState();
      D.gy = (D.gy || 0) + mx * C.gimbalSens;
      D.gp = (D.gp || 0) - my * C.gimbalSens;
      const r = Math.hypot(D.gy, D.gp);
      if (r > C.gimbalCone) { D.gy *= C.gimbalCone / r; D.gp *= C.gimbalCone / r; }
    },
    kamiViewing() {
      const S = this._sight, P = this.player;
      return !!(S && S.arty && !S.dying && this.kamiOn(P) && this.droneState().state === 'flying');
    },

    // màn hình UAV cảm tử: đổi chữ của màn hình drone trinh sát (một lần mỗi lần mở) + khung khóa mục tiêu
    kamiUi(S) {
      const U = this._uavEl;
      const root = U && U.alt ? U.alt.closest('#gun-sight') || U.alt.parentElement.parentElement : null;
      if (!root || root.querySelector('.kami-box')) return;   // màn hình dựng lại (innerHTML) thì đổi chữ lại
      const set = (sel, v, html) => { const e = root.querySelector(sel); if (e) { if (html) e.innerHTML = v; else e.textContent = v; } return e; };
      set('.gs-rec', '<i></i>REC · UAV CẢM TỬ · CAMERA MŨI', true);
      set('.gs-bat-l', 'NHIÊN LIỆU');
      set('.gs-hint', 'A / D: rẽ · W / S: chúc / ngóc · Shift: tăng tốc · Chuột: xoay camera (nhấp để khóa chuột, nhấp giữa: về thẳng mũi) · Space: khóa xe ở tâm · Ctrl: đóng');
      const tags = root.querySelector('.gs-tags');
      if (tags) tags.style.display = 'none';
      const box = document.createElement('div');
      box.className = 'kami-box';
      box.style.cssText = 'position:absolute;left:0;top:0;width:40px;height:40px;border:2px solid #ff3b30;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none;display:none;transform:translate(-50%,-50%)';
      const lb = document.createElement('span');
      lb.style.cssText = 'position:absolute;left:50%;top:100%;margin-top:4px;transform:translateX(-50%);white-space:nowrap;color:#ff3b30;font:700 12px "Chakra Petch",system-ui,sans-serif;letter-spacing:.1em;text-shadow:0 0 3px #000';
      box.appendChild(lb);
      root.appendChild(box);
      this._kamiBox = { box, lb, root };
    },

    // số liệu (~6 lần/giây) + khung khóa (mỗi khung hình)
    kamiHud(dt, S, D) {
      const U = this._uavEl, P = this.player, B = this._kamiBox, cam = this.camera;
      if (B && B.box.isConnected) {
        const L = D.lock && !D.lock.isDead ? D.lock : null;
        let show = false;
        if (L) {
          const ly = (L.y || 0) + 7, v = new THREE.Vector3(L.x, ly, L.z).project(cam);
          if (v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2) {
            const dl = Math.hypot(L.x - D.x, ly - D.y, L.z - D.z), sz = Math.max(26, Math.min(140, 9000 / Math.max(1, dl)));
            B.box.style.left = ((v.x + 1) / 2 * innerWidth) + 'px';
            B.box.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
            B.box.style.width = B.box.style.height = sz + 'px';
            const txt = 'KHÓA · ' + Math.round(dl) + ' M';
            if (B.lb.textContent !== txt) B.lb.textContent = txt;
            show = true;
          }
        }
        B.box.style.display = show ? 'block' : 'none';
      }
      if (!U || (U.t -= dt) > 0) return;
      U.t = 0.16;
      const set = (e, v) => { if (e && e.textContent !== v) e.textContent = v; };
      set(U.alt, (S.alt || 0) + ' M');
      set(U.dist, Math.round(Math.hypot(D.x - P.x, D.z - P.z)).toLocaleString() + ' M');
      const fs = Math.max(0, Math.round(D.fuel * C.fuel));
      const emi = D.emiT > 0, zap = emi && Math.random() < 0.2;
      set(U.batt, D.fall && !D.fall.jam ? 'HẾT' : zap ? '⚡ LỖI CẢM BIẾN' : Math.round(D.fuel * 100) + '% · ' + fs + ' S');
      if (U.bat) {
        const lv = zap || D.fuel < 0.25 ? 'low' : D.fuel < 0.5 ? 'mid' : 'ok';
        if (U.bat._lv !== lv) { U.bat._lv = lv; U.bat.dataset.lv = lv; }
        const on = zap ? 0 : Math.ceil(D.fuel * 10 - 1e-6);
        U.segs.forEach((e, i) => { const v = i < on; if (e._on !== v) { e._on = v; e.classList.toggle('on', v); } });
      }
      if (U.hull) set(U.hull, Math.round(Math.max(0, D.hp === undefined ? 1 : D.hp) * 100) + '%');
      if (this._sightHdgEl) set(this._sightHdgEl, String(Math.round(((Math.atan2(-Math.sin(D.yaw), Math.cos(D.yaw)) * 180 / Math.PI) + 360) % 360) % 360).padStart(3, '0') + '°');
      if (this._sightRangeEl) set(this._sightRangeEl, Math.round((D.v || 0) / 8 * 3.6) + ' KM/H');
      const L = D.lock && !D.lock.isDead ? D.lock : null;
      if (this._sightStateEl) set(this._sightStateEl, D.fall ? (D.fall.wing ? '⚠ GÃY CÁNH — MẤT CÂN BẰNG' : D.fall.jam ? '⚠ MẤT ĐIỀU KHIỂN — NHIỄU ĐIỆN TỪ' : '⚠ HẾT NHIÊN LIỆU — ĐANG RƠI') : L ? 'ĐANG KHÓA ' + (L.name || 'XE ĐỊCH') : 'CHƯA KHÓA · SPACE ĐỂ KHÓA');
      const deg = (a) => Math.round(Math.abs(a || 0) * 180 / Math.PI);
      const cTxt = (D.gy || D.gp) ? 'CAMERA ' + (D.gy > 0 ? 'PHẢI ' : 'TRÁI ') + deg(D.gy) + '° · ' + (D.gp > 0 ? 'NGÓC ' : 'CHÚC ') + deg(D.gp) + '°' : 'CAMERA THẲNG MŨI';
      if (this._sightBlastEl) set(this._sightBlastEl, cTxt + ' · ĐẦU NỔ LÕM ' + C.blast.radius + ' M');
      const T = this._droneTags;
      if (T && T.sig && !T._jamTxt) T.sig.hidden = !S.sigEdge;
    },

    // ĐẦU NỔ LÕM KÍCH HOẠT: một viên đạn thật bắn từ ngay trên điểm chạm thẳng xuống (trúng NÓC xe nếu chạm xe)
    // -> giáp / sát thương / hư hại bộ phận / gói mạng / máy chủ như mọi phát bắn. UAV mất, ống nạp quả mới nếu còn.
    // Màn hình camera mũi: nhiễu trắng + TRÚNG MỤC TIÊU / ĐÃ KÍCH NỔ
    kamiDetonate(D, unit, wall) {
      const P = this.player, B = this.ballistics;
      const gr = (x, z) => (this.terrain ? this.terrain.getElevationAt(x, z) : 0);
      const tgt = unit && !unit.isDead ? unit : null;
      const x = tgt ? tgt.x : D.x, z = tgt ? tgt.z : D.z;
      const top = tgt ? (tgt.y || gr(x, z)) + 30 : Math.max(D.y, gr(x, z) + 3);   // trên mái lồng chống UAV (nếu xe có) để nan lồng đón đầu nổ trước
      let pos = new THREE.Vector3(x, top, z), dir = new THREE.Vector3(0.02, -1, 0.02).normalize();
      if (wall && !tgt) {   // đâm tường / mái: phát nổ lõm theo hướng bay, ngay trước điểm chạm
        const sp = Math.hypot(D.vx, D.vy, D.vz) || 1;
        dir = new THREE.Vector3(D.vx / sp, D.vy / sp, D.vz / sp);
        pos = new THREE.Vector3(D.x, D.y, D.z).addScaledVector(dir, -8);
      }
      if (B && P && !P.isDead) {
        let shell = null;
        P._launchOverride = { position: pos, direction: dir };
        try { shell = B.fireShell3D(P, 0, -88, 1, 'RPG'); } finally { P._launchOverride = null; }
        if (shell) {
          shell.vx = dir.x * 360; shell.vy = dir.y * 360; shell.vz = dir.z * 360;   // lao theo hướng nổ ngay khung hình sau
          shell.roofDirect = C.direct; shell.roofSplash = C.splash; shell.roofBlast = C.blast; shell.kami = true;
        }
      }
      D.state = 'lost'; D.dive = null; D.fall = null; D.lock = null; D.reloadT = C.reload; D.vx = D.vy = D.vz = 0; D.thr = 0;
      D.v = undefined; D.pitch = undefined;
      if (D.model) D.model.visible = false;
      const SE = window.soundEngine;
      if (SE && SE.updateKamiDive) SE.updateKamiDive(0);
      if (SE && SE.updateKamiRocket) SE.updateKamiRocket(0);
      if (SE && SE.updateDrone) SE.updateDrone(false, {});
      if (this._kamiBox) this._kamiBox.box.style.display = 'none';
      const S = this._sight;
      if (S && S.arty && !S.dying) {
        // hình đứng khựng ở khung cuối, nhiễu trắng phủ, hiện chữ (DroneAir.updateDroneDeathCam, bỏ qua pha lộn nhào)
        S.dying = { t: 0.75, x: D.x, y: D.y, z: D.z, yaw: D.yaw || 0, kami: true };
        const dead = this._uavEl && this._uavEl.dead, tx = dead && dead.querySelector('.gs-txt');
        if (tx) {
          tx.textContent = '';
          const b = document.createElement('b'), sp = document.createElement('span');
          b.textContent = tgt ? 'TRÚNG MỤC TIÊU' : 'MẤT TÍN HIỆU';
          sp.textContent = tgt ? 'UAV CẢM TỬ ĐÃ ĐÂM TRÚNG ' + (tgt.name || 'XE ĐỊCH') : 'UAV CẢM TỬ ĐÃ KÍCH NỔ';
          tx.appendChild(b); tx.appendChild(sp);
        }
      }
      this.addCombatLog(tgt ? `[[bomb]] UAV CẢM TỬ ĐÃ ĐÂM TRÚNG ${tgt.name || 'XE ĐỊCH'}!` : '[[bomb]] UAV cảm tử đã kích nổ', 'tip');
      if (this.sendDroneState) { this._droneSendT = 0; }
    },

    // ---------- HIỆU ỨNG PHÓNG: hơi khí nén trắng phụt ra miệng & cửa xả đáy ống, nắp nhựa đầu ống bật văng ----------
    kamiEjectFx(P, T) {
      const R = P.kamiRack;
      // nắp nhựa đầu ống văng ra: đĩa xoay lộn, rơi xuống nóc xe / đất rồi nằm lại vài giây
      if (R && R.caps && R.caps[0] && R.caps[0].visible) {
        R.caps[0].visible = false;
        const M = mats(P.team);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 14), (M && (M.canvasDark || M.dark)) || new THREE.MeshStandardMaterial({ color: 0x333333 }));
        cap.position.copy(T.pos);
        this.scene.add(cap);
        const L = this._kamiBits || (this._kamiBits = []);
        L.push({ m: cap, vx: T.dir.x * 60 + (Math.random() - 0.5) * 14, vy: 26 + Math.random() * 10, vz: T.dir.z * 60 + (Math.random() - 0.5) * 14,
          sx: 8 + Math.random() * 6, sz: 5 + Math.random() * 5, life: 5 });
      }
      // hơi khí nén: luồng trắng đục phụt theo hướng ống ở miệng, phụt ngược ở cửa xả đáy ống
      const tubeLen = 9.2;
      const back = T.pos.clone().addScaledVector(T.dir, -tubeLen);
      for (let i = 0; i < 9; i++) this.kamiPuff(T.pos, T.dir, 18 + Math.random() * 30, 1.4 + Math.random() * 1.2, 0.9 + Math.random() * 0.5);
      for (let i = 0; i < 6; i++) this.kamiPuff(back, T.dir.clone().negate().add(new THREE.Vector3(0, 0.5, 0)).normalize(), 10 + Math.random() * 18, 1.2 + Math.random(), 0.8 + Math.random() * 0.4);
    },
    kamiPuff(pos, dir, speed, size, life, color, op) {
      const L = this._kamiFx || (this._kamiFx = []);
      if (L.length > 400 || !this.droneSmokeTex) return;
      const o = op || 0.55;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.droneSmokeTex(), color: color || 0xe8e6e0, transparent: true, opacity: o, depthWrite: false }));
      m.position.copy(pos);
      m.scale.setScalar(size);
      m.material.rotation = Math.random() * 6.28;
      this.scene.add(m);
      const j = () => (Math.random() - 0.5) * 0.5;
      L.push({ m, vx: (dir.x + j()) * speed, vy: (dir.y + j() * 0.6) * speed + 3, vz: (dir.z + j()) * speed, size, life, max: life, op: o });
    },
    // vệt khói động cơ tên lửa đẩy: cụm khói xám nhả đều sau loa phụt (vị trí pos, hướng phụt về sau back)
    kamiTrail(holder, pos, back, dt, thr) {
      // nhả theo quãng đường bay (không theo khung hình): máy chậm vẫn ra vệt liền, không đứt quãng
      const p = pos.clone().addScaledVector(back, 4.4);
      const L = holder.trailP;
      holder.trailP = p.clone();
      if (!L || L.distanceTo(p) > 80) return;
      const d = L.distanceTo(p), n = Math.min(14, Math.floor(d / 2.5));
      for (let i = 1; i <= n; i++) {
        const q = L.clone().lerp(p, i / n);
        this.kamiPuff(q, back, 3 + 5 * thr, 2.6 + Math.random() * 1.4, 2.6 + Math.random() * 1.4, 0xcac5bd, 0.75);
      }
      if (!n) holder.trailP = L;   // chưa đủ xa: giữ điểm cũ
    },
    // vệt khói của UAV cảm tử máy khác (drone_air.js updateOtherDrones): theo mô hình, khi lửa đuôi đang cháy
    kamiTrailModel(m, dt) {
      const K = m && m.userData.kami;
      if (!K || !K.flame.visible || !m.visible) return;
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
      this.kamiTrail(K, m.position, back, dt, K.thr || 0.7);
    },
    updateKamiFx(dt) {
      const L = this._kamiFx;
      if (L) for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.life -= dt;
        if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); L.splice(i, 1); continue; }
        const a = 1 - p.life / p.max, drag = Math.exp(-dt * 4);
        p.vx *= drag; p.vy = p.vy * drag + dt * 2; p.vz *= drag;
        p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
        p.m.scale.setScalar(p.size * (1 + a * 3.2));
        p.m.material.opacity = p.op * (1 - a) * (1 - a);
      }
      const B = this._kamiBits;
      if (B) for (let i = B.length - 1; i >= 0; i--) {
        const c = B[i];
        c.life -= dt;
        if (c.life <= 0) { this.scene.remove(c.m); c.m.geometry.dispose(); B.splice(i, 1); continue; }
        const g = this.terrain ? this.terrain.getElevationAt(c.m.position.x, c.m.position.z) : 0;
        c.vy -= 78 * dt;
        c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
        c.m.rotation.x += c.sx * dt; c.m.rotation.z += c.sz * dt;
        if (c.m.position.y < g + 0.1) {   // chạm đất: nảy nhẹ rồi nằm im
          c.m.position.y = g + 0.1; c.vy = Math.abs(c.vy) * 0.25; c.vx *= 0.4; c.vz *= 0.4; c.sx *= 0.3; c.sz *= 0.3;
          if (Math.abs(c.vy) < 3) { c.vy = 0; c.sx = c.sz = 0; c.m.rotation.x = Math.PI / 2; }
        }
        if (c.life < 1) c.m.scale.setScalar(Math.max(0.01, c.life));
      }
    },

    /**
     * Thay updateDroneBattery khi lựu pháo mang UAV cảm tử: pha phóng (khí nén -> bung cánh -> đánh lửa tên lửa, ngóc
     * lên), nhiên liệu, phá sóng mất điều khiển, lượn vòng chờ khi đóng màn hình, hết nhiên liệu lượn rơi tự hủy, vệt
     * khói, nạp quả mới vào ống, mô hình 3D.
     */
    updateKamiDrone(dt) {
      const P = this.player, D = this.droneState(), SE = window.soundEngine;
      const S = this._sight && this._sight.arty && !this._sight.dying ? this._sight : null;
      this.updateKamiFx(dt);
      if (!D.model || !D.model.userData.kami) {
        if (D.model && D.model.parent) D.model.parent.remove(D.model);
        D.model = build(P.team);
        this.scene.add(D.model);
      }
      const M = D.model, R = P.kamiRack;
      if (M.parent !== this.scene) this.scene.add(M);
      const pitchOf = () => Math.atan2(D.vy, Math.hypot(D.vx, D.vz) || 1);
      const show = (open) => {
        M.visible = true;
        M.position.set(D.x, D.y, D.z);
        M.rotation.set(pitchOf(), D.yaw, D.roll || 0);
        animate(M, dt, open, D.thr || 0);
      };
      const trail = () => {
        if (!(D.thr > 0.02)) return;
        const sp = Math.hypot(D.vx, D.vy, D.vz) || 1;
        this.kamiTrail(D, new THREE.Vector3(D.x, D.y, D.z), new THREE.Vector3(-D.vx / sp, -D.vy / sp, -D.vz / sp), dt, D.thr);
      };
      if (P.isDead) {
        if (D.state === 'flying' || D.state === 'launching') { D.state = 'lost'; D.reloadT = C.reload; D.fall = null; D.dive = null; D.thr = 0; }
        D.respawnNew = true;
        M.visible = false;
        if (SE && SE.updateKamiRocket) SE.updateKamiRocket(0);
        return;
      }
      if (D.respawnNew) {
        D.respawnNew = false;
        D.state = (P.kamikazeCount || 0) > 0 ? 'docked' : 'lost'; D.reloadT = 0; D.fuel = 1; D.batt = 1; D.dive = null; D.fall = null; D.thr = 0;
      }
      if (D.state === 'lost' || D.state === 'docked') {
        M.visible = false;
        if (D.state === 'lost' && (D.reloadT -= dt) <= 0 && (P.kamikazeCount || 0) > 0 && !(P.dmg && P.dmg.lost && P.dmg.lost.has('kamiRack'))) {
          D.state = 'docked'; D.batt = 1; D.fuel = 1;
          this.addCombatLog(`[[drone]] UAV cảm tử mới đã nạp vào ống (Ctrl để phóng, còn ${P.kamikazeCount})`, 'tip');
        }
        // ống có quả: nắp nhựa đầu ống lắp lại
        if (R && R.caps && R.caps[0]) R.caps[0].visible = D.state === 'docked';
        const T = this.kamiTubeWorld(P);
        D.x = T.pos.x; D.y = T.pos.y; D.z = T.pos.z;
        return;
      }
      if (D.state === 'launching') {
        const t = (D.launchT += dt);
        // GĐ1 khí nén đẩy ra: chưa có lực đẩy, chỉ trôi theo đà + trọng lực, hơi chúc; khí thừa phụt theo đuôi
        // GĐ2 cánh / đuôi bung (wingT); động cơ tên lửa đánh lửa (motorT): lửa đuôi + khói, tăng tốc, ngóc lên lấy độ cao
        const open = Math.max(0, Math.min(1, (t - C.wingT[0]) / (C.wingT[1] - C.wingT[0])));
        D.thr = t > C.motorT ? Math.min(1, (t - C.motorT) / 0.2) : 0;
        if (D.thr > 0 && !D.ignited) {
          D.ignited = true;
          const sp = Math.hypot(D.vx, D.vy, D.vz) || 1, back = new THREE.Vector3(-D.vx / sp, -D.vy / sp, -D.vz / sp), at = new THREE.Vector3(D.x, D.y, D.z).addScaledVector(back, 5);
          for (let i = 0; i < 8; i++) this.kamiPuff(at, back, 10 + Math.random() * 20, 1.4 + Math.random(), 1.6 + Math.random(), 0xc8c4bc, 0.6);   // khói mồi lửa
        }
        D.vy -= 40 * dt;
        if (D.thr > 0) {
          const hv = Math.hypot(D.vx, D.vz) || 1, nh = hv + (C.cruise - hv) * Math.min(1, dt * 1.6 * D.thr);
          D.vx = D.vx / hv * nh; D.vz = D.vz / hv * nh;
          D.vy += (85 - D.vy) * Math.min(1, dt * 2.5 * D.thr);   // ngóc lên leo dốc (qua mái nhà cao tầng)
        }
        D.x += D.vx * dt; D.y += D.vy * dt; D.z += D.vz * dt;
        D.roll = t < C.motorT ? Math.sin(t * 22) * 0.08 * (1 - t / C.motorT) : 0;   // chao nhẹ lúc chưa có động cơ giữ
        if (t < 0.18) this.kamiPuff(new THREE.Vector3(D.x, D.y, D.z), new THREE.Vector3(-D.vx, -D.vy, -D.vz).normalize(), 6, 0.9, 0.6);
        trail();
        show(open);
        if (SE && SE.updateKamiRocket) SE.updateKamiRocket(D.thr * 0.8);
        if (t >= C.launchT) {
          D.state = 'flying';
          D.v = Math.hypot(D.vx, D.vy, D.vz); D.pitch = Math.max(0.5, pitchOf()); D.thr = 0.7; D.gy = D.gp = 0;   // vẫn ngóc leo tiếp tới khi người chơi chỉnh
          if (!(this.isGameOver || this.isGameStarted === false || (this.tacticalMap && this.tacticalMap.isOpen))) this.setSightMode(true);
        }
        return;
      }
      // ---- GĐ3 đang bay ----
      if (!D.fall) {
        D.fuel = Math.max(0, (D.fuel === undefined ? 1 : D.fuel) - dt / C.fuel * (D.boost ? C.boostBurn : 1));
        D.batt = D.fuel;   // máy khác / HUD chung đọc batt
        // máy phá sóng: nằm trong chùm (ew_jammer.js giữ D.emiT ~0.6) đủ lâu thì mất điều khiển hẳn
        if (D.emiT > 0.3) D.kjam = (D.kjam || 0) + dt; else D.kjam = Math.max(0, (D.kjam || 0) - dt);
        if (D.kjam >= C.jamLose) {
          D.fall = { t: 0, spin: Math.random() < 0.5 ? -1 : 1, jam: true };
          D.lock = null;
          this.addCombatLog('[[antenna-bars-off]] UAV CẢM TỬ BỊ PHÁ SÓNG — mất điều khiển, bay loạn rồi đâm xuống tự nổ', 'alert');
        } else if (D.fuel <= 0) {
          D.fall = { t: 0, spin: Math.random() < 0.5 ? -1 : 1 };
          D.lock = null;
          this.addCombatLog('[[gas-station-off]] UAV cảm tử HẾT NHIÊN LIỆU — động cơ tắt, đang lượn rơi tự hủy', 'alert');
        }
      }
      trail();
      if (S) {   // camera mũi đang mở: game.js updateSightCamera -> kamiFlyStep di chuyển UAV
        M.visible = false;
        M.position.set(D.x, D.y, D.z);
        animate(M, dt, 1, D.thr || 0);
        return;
      }
      if (SE && SE.updateKamiRocket) SE.updateKamiRocket(0);
      if (D.fall) {
        if (this.kamiFallPhys(dt, D)) return;
        show(1);
        return;
      }
      // màn hình đóng: lượn vòng tròn quanh chỗ đang bay chờ lệnh, nghiêng cánh vào tâm, giữ độ cao (máy khác vẫn thấy)
      D.boost = false; D.thr = 0.7;
      if (!D.loop || Math.hypot(D.x - D.loop.cx, D.z - D.loop.cz) > C.loiterR * 1.5) {
        const a0 = Math.atan2(D.z, D.x);
        D.loop = { cx: D.x - Math.cos(a0) * C.loiterR, cz: D.z - Math.sin(a0) * C.loiterR, a: a0 };
      }
      const w = C.cruise / C.loiterR;
      D.loop.a += w * dt;
      const nx = D.loop.cx + Math.cos(D.loop.a) * C.loiterR, nz = D.loop.cz + Math.sin(D.loop.a) * C.loiterR;
      const gY = this.terrain ? this.terrain.getElevationAt(D.x, D.z) : 0;
      const vy = Math.max(-15, Math.min(22, (Math.max(D.y, gY + 120) - D.y) * 0.8));
      D.vx = (nx - D.x) / dt; D.vz = (nz - D.z) / dt; D.vy = vy;
      D.x = nx; D.z = nz; D.y += vy * dt;
      D.yaw = Math.atan2(-D.vx, -D.vz);
      D.roll = -0.42;   // nghiêng cánh vào tâm vòng lượn
      D.v = Math.hypot(D.vx, D.vz); D.pitch = 0;
      show(1);
    }
  };

  // ---------- gắn vào game ----------
  if (typeof ArtilleryGame3D !== 'undefined' && ArtilleryGame3D.prototype) {
    const G = ArtilleryGame3D.prototype;
    Object.assign(G, methods);
    // Ctrl: phóng UAV cảm tử thay vì cất drone trinh sát
    const origLaunch = G.launchDrone;
    if (typeof origLaunch === 'function' && !origLaunch.__kami) {
      G.launchDrone = function () { return this.kamiOn(this.player) ? this.launchKami() : origLaunch.call(this); };
      G.launchDrone.__kami = true;
    }
    const origBatt = G.updateDroneBattery;
    if (typeof origBatt === 'function' && !origBatt.__kami) {
      G.updateDroneBattery = function (dt) {
        const P = this.player;
        if (P && this.kamiOn(P) && dt > 0) return this.updateKamiDrone(dt);
        return origBatt.call(this, dt);
      };
      G.updateDroneBattery.__kami = true;
    }
    // chuột trên màn hình UAV cảm tử: rê = xoay camera mũi; nhấp trái = khóa chuột (rê thoải mái không chạm mép); nhấp giữa =
    // camera về thẳng mũi. Gắn một lần cho cả trang, tự tìm game đang chạy
    if (typeof document !== 'undefined' && !window.__kamiMouse) {
      window.__kamiMouse = true;
      const game = () => window.game || window.artilleryGame;
      document.addEventListener('mousemove', (e) => {
        const g = game();
        if (!g || !g.kamiViewing || !g.kamiViewing()) return;
        const canvas = g.renderer && g.renderer.domElement;
        if (document.pointerLockElement !== canvas && e.target !== canvas) return;
        g.kamiGimbal(e.movementX || 0, e.movementY || 0);
      });
      document.addEventListener('pointerdown', (e) => {
        const g = game();
        if (!g || !g.kamiViewing || !g.kamiViewing()) return;
        const canvas = g.renderer && g.renderer.domElement;
        if (e.target !== canvas) return;
        if (e.button === 1) { const D = g.droneState(); D.gy = D.gp = 0; e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (e.button === 0 && document.pointerLockElement !== canvas) {
          try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* trình duyệt từ chối: vẫn rê chuột được */ }
          e.stopImmediatePropagation();
        }
      }, true);
      // đóng màn hình UAV / UAV nổ: nhả khóa chuột
      setInterval(() => {
        const g = game(), canvas = g && g.renderer && g.renderer.domElement;
        if (canvas && document.pointerLockElement === canvas && g.kamiViewing && !g.kamiViewing() && !(g._sight && g._sight.free)) document.exitPointerLock();
      }, 250);
    }
    // Space trên màn hình UAV cảm tử: khóa / bỏ khóa mục tiêu
    const origFire = G.triggerPlayerFire;
    if (typeof origFire === 'function' && !origFire.__kami) {
      G.triggerPlayerFire = function () { if (this.kamiTryLock && this.kamiTryLock()) return; return origFire.call(this); };
      G.triggerPlayerFire.__kami = true;
    }
  }

  return { C, build, animate, methods };
})();

if (typeof window !== 'undefined') window.KamiUAV = KamiUAV;
