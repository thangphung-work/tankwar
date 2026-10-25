/**
 * UAV CẢM TỬ KIỂU TÊN LỬA (đạn bay lảng vảng) — món ô UAV của lựu pháo ('kami'), thay drone trinh sát.
 * Ống phóng nằm cố định trên nóc cabin (roof_mounts.js buildKamiLauncher, phần cứng u.kamiRack).
 *
 *  GĐ1 — Ctrl: PHÓNG BẰNG KHÍ NÉN: van mở, khí cao áp phụt đẩy UAV bung khỏi ống (nắp nhựa đầu ống bật văng, hơi khí trắng
 *        phụt ra miệng & cửa xả đáy ống). Chưa có lực đẩy: rơi chúc theo đà.
 *  GĐ2 — ~0,1 s sau 4 cánh gập dọc thân bật bung, đuôi đứng dựng lên; ~0,3 s động cơ tên lửa đẩy TỐC ĐỘ THẤP phía sau đánh
 *        lửa: lửa phụt đuôi + vệt khói xám kéo dài, UAV tăng tốc, ngóc lên lấy độ cao.
 *  GĐ3 — chuyển sang hình CAMERA MŨI: lái như máy bay lượn — luôn lao về trước (không treo được như drone trinh sát), tốc độ
 *        chỉ nhỉnh hơn drone trinh sát chút. A / D: nghiêng cánh rẽ · W / S: ngóc / chúc mũi · Shift: tăng lực đẩy (tốn
 *        nhiên liệu). CLICK vào xe địch (đã khóa chuột: xe ở tâm màn hình) để KHÓA (khung vuông + cự ly), chuột phải bỏ
 *        khóa; đã khóa thì SPACE xác nhận: UAV TỰ CHÚC MŨI LAO VÀO mục tiêu (bám đón đầu xe đang chạy, đẩy hết lực đẩy),
 *        Space lần nữa hoặc bấm A / W / S / D thì hủy lao -> lái tay. Lái tay lúc lao sát mục tiêu đã khóa thì đầu dò chỉ kéo mũi nhẹ.
 *  GĐ4 — thân UAV chạm HỘP THÂN XE (đo trên mô hình: mũi / đuôi / tháp / lồng chống UAV), nhà, thân cây, tán cây, mặt đất
 *        hoặc mặt nước thì đầu nổ lõm (~3 kg, cỡ tên lửa chống tăng) kích hoạt ĐÚNG ĐIỂM CHẠM theo hướng bay; màn hình nhiễu
 *        trắng báo TRÚNG MỤC TIÊU / ĐÃ KÍCH NỔ. Phát nổ = một viên đạn thật bắn từ ngay trước điểm chạm dọc hướng bay
 *        (ballistics + handleShellImpact: giáp theo mặt bị chạm / sát thương / mạng / chống gian lận như mọi phát bắn);
 *        nổ trượt cạnh xe giáp dày (xe tăng, xe 6 nòng) chỉ hỏng thiết bị ngoài — sát thương lan nhân heavySplash.
 *  - Bị bắn hạ (phòng không / súng máy / sóng nổ): nhiên liệu tên lửa đẩy + một phần thuốc nổ bùng thành quả cầu lửa nhỏ
 *    trên trời, xác (thân gãy đôi, cánh) bốc khói rơi xuống — mọi máy cùng thấy (gói DRONE_DOWN).
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
    fuelWarn: 0.3,    // còn dưới bấy nhiêu nhiên liệu (~12 s bay thường) thì tít tít cảnh báo, càng cạn nhịp càng dồn
    reload: 6,        // nạp quả mới vào ống sau khi phóng (s)
    launchT: 1.4,     // pha phóng: khí nén đẩy ra -> bung cánh -> đánh lửa, ngóc lên -> chuyển sang hình camera mũi (s)
    ejectV: 95,       // tốc độ khí nén đẩy UAV rời ống (đv/s, ~12 m/s)
    wingT: [0.08, 0.3],   // cánh bung từ .. tới (s sau khi rời ống)
    motorDist: 24,    // động cơ tên lửa đánh lửa khi UAV đã rời miệng ống bấy nhiêu (đv, ~3 m)
    motorT: 0.6,      // ... hoặc chậm nhất sau bấy nhiêu giây kể từ lúc phóng
    safeAlt: 160,     // chưa lên tới độ cao này (đv trên mặt đất) thì mũi giữ góc leo, không tự cân về bằng
    cruise: 135,      // tốc độ bay lực đẩy thường (đv/s) — drone trinh sát 105
    boost: 170,       // giữ Shift
    minV: 95, maxV: 300,   // chậm hơn minV thì thất tốc chúc mũi; lao dốc tối đa
    turn: 1.05,       // tốc độ rẽ khi nghiêng cánh hết cỡ (rad/s)
    // rẽ phối hợp: góc nghiêng phải đủ để lực nâng bẻ hướng bay — tan(nghiêng) = tốc độ rẽ x tốc độ ngang / g
    // (bay thường 1,05 rad/s cần nghiêng ~61°). Khung chịu tối đa bankMax: bay nhanh hơn thì vòng rẽ rộng ra
    g: 78,            // gia tốc trọng trường (đv/s², 8 đv = 1 m)
    bankMax: 1.22,    // nghiêng tối đa khi lái tay / lượn (rad, ~70°, ~2,9 g)
    attackBank: 1.31, // tự lái lao vào mục tiêu được bẻ gắt hơn chút (rad, ~75°)
    pitchRate: 1.0,   // tốc độ chúc / ngóc mũi (rad/s)
    pitchMin: -1.35, pitchMax: 0.55,
    ceiling: 650,     // trần bay trên mặt đất (đv)
    loiterBank: 0.6,  // lượn vòng chờ lệnh khi đóng màn hình: nghiêng ~34° -> vòng bán kính ~340 đv (~43 m) ở tốc độ bay thường
    loiterAlt: 120,   // ... giữ tối thiểu bấy nhiêu đv trên mặt đất
    lockR: 1300, lockCone: 0.2,   // khóa mục tiêu: cự ly / lệch tâm màn hình tối đa (rad)
    assistR: 260, assistCone: 0.35, assist: 0.9,   // đầu dò kéo mũi lúc lao sát mục tiêu đã khóa
    clickPx: 60,      // click cách xe bấy nhiêu px (hoặc trong khung vuông của xe) là khóa được
    attackTurn: 1.6, attackPitch: 2.0,   // tự lao vào mục tiêu: tốc độ bẻ hướng / chúc mũi tối đa (rad/s)
    diveLos: 0.8,     // tự lao: bay bằng tới khi mục tiêu nằm dưới góc này (rad, ~46°) rồi chúc đầu bổ nhào xuống
    attackLead: 3,    // đón đầu xe đang chạy tối đa bấy nhiêu giây bay
    termR: 260,       // pha lao cuối: đã chúc đầu bổ nhào hoặc cách mục tiêu dưới bấy nhiêu đv -> đầu dò quang học trên UAV
                      // tự bám, mất liên lạc (phá sóng) cũng không bỏ khóa / không mất điều khiển
    jamLose: 1.6,     // nằm trong chùm phá sóng bấy nhiêu giây thì mất điều khiển hẳn
    omniLose: 0.7,    // ... trong vùng nhiễu vô hướng quanh xe lắp máy gây nhiễu (ew_jammer.js OMNI_R, sát xe — nhiễu mạnh hơn)
    gimbalCone: 1.35, // camera mũi xoay đa hướng theo con trỏ trong hình nón (nửa góc, rad)
    gimbalX: 1.0, gimbalY: 0.7,   // con trỏ ở mép trái / phải, trên / dưới màn hình: camera quay bấy nhiêu (rad); giữa = thẳng mũi
    span: 3.6,        // nửa sải cánh trước (đv, đã nhân tỉ lệ mô hình) — mút cánh quẹt nhà / đất là gãy cánh
    hitPad: 1.5,      // thân UAV (bán kính, đv) — chạm hộp thân xe nới thêm bấy nhiêu là kích nổ
    standoff: 8,      // viên đạn đầu nổ bắn ra từ trước điểm chạm bấy nhiêu (đv) dọc hướng bay
    heavySplash: 0.35,   // nổ trượt cạnh xe giáp dày (ALL_ROUNDER / GATLING): đầu nổ lõm không chạm giáp chỉ phá thiết bị ngoài
    // đầu nổ lõm ~3 kg: xuyên nóc / sườn xe tăng mất ~70-80% máu (tên lửa đột nóc ~8 kg của xe tăng: 90-95%), xe nhẹ vẫn chết
    direct: 2.3, splash: 1.5, blast: { radius: 52, core: 16 },
    DETECT_MUL: 1.4   // radar bắt UAV cảm tử xa hơn drone thường bấy nhiêu lần
  };
  const nowS = () => performance.now() / 1000;
  // ĐẦU NỔ LÕM KÍCH HOẠT tại điểm chạm at (THREE.Vector3) theo hướng bay dir (đơn vị): một viên đạn thật bắn từ ngay trước
  // điểm chạm (standoff) -> ballistics dò đúng hộp thân xe / nhà / cây / đất / nước rồi handleShellImpact tính giáp theo mặt bị
  // chạm. burst: điểm nổ trên tán cây đã định sẵn (viên đạn nổ đúng chỗ đó, không tung xác suất lại). Trả viên đạn / null
  function fireWarhead(B, shooter, at, dir, burst) {
    if (!B || !shooter) return null;
    shooter._launchOverride = { position: at.clone().addScaledVector(dir, -C.standoff), direction: dir };
    let shell = null;
    try { shell = B.fireShell3D(shooter, 0, -88, 1, 'RPG'); } finally { shooter._launchOverride = null; }
    if (!shell) return null;
    shell.vx = dir.x * 360; shell.vy = dir.y * 360; shell.vz = dir.z * 360;   // lao theo hướng bay ngay khung hình sau
    shell.roofDirect = C.direct; shell.roofSplash = C.splash; shell.roofBlast = C.blast; shell.kami = true;
    shell.heavyArmorSplash = C.heavySplash;
    if (burst) { shell._burstAt = burst; shell._burstSeen = new Set(); }
    if (shell.mesh) shell.mesh.visible = false;   // quả đạn chỉ là đầu nổ của chính UAV: không vẽ quả RPG
    return shell;
  }
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  // góc nghiêng cánh của vòng rẽ phối hợp: tốc độ rẽ w (rad/s, dương = yaw tăng) ở tốc độ ngang vh (đv/s), chặn ±max
  const bankFor = (w, vh, max) => { const m = max || C.bankMax, b = Math.atan(w * vh / C.g); return b > m ? m : b < -m ? -m : b; };
  // tốc độ rẽ do góc nghiêng roll sinh ra (ngược của bankFor)
  const turnOf = (roll, vh) => C.g * Math.tan(Math.max(-1.45, Math.min(1.45, roll))) / Math.max(40, vh);

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
  // màu búp khói (hex) -> [r,g,b] cho ExplosionFX.smoke: chia 0,66 bù độ sáng ô khói atlas, chặn 1 (lớp khói không nén
  // sáng như Sprite cũ); nhớ theo hex — mảng dùng chung, lớp hạt chỉ đọc
  const PUFF_C = new Map();
  function kamiPuffColor(hex) {
    let c = PUFF_C.get(hex);
    if (!c) {
      const k = 1 / (255 * 0.66);
      c = [Math.min(1, ((hex >> 16) & 255) * k), Math.min(1, ((hex >> 8) & 255) * k), Math.min(1, (hex & 255) * k)];
      PUFF_C.set(hex, c);
    }
    return c;
  }
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
      D.thr = 0; D.kjam = 0; D.lock = null; D.boost = false; D.ignited = false; D.trailP = null; D.gy = 0; D.gp = 0; D.gyT = D.gpT = undefined; D.attack = null;
      D._apsTried = null;   // quả mới: radar APS của xe địch xét lại từ đầu
      if (D.model && D.model.userData.kami) for (const W of D.model.userData.kami.wings) W.w.visible = true;   // quả mới: đủ cánh
      // UAV gập cánh nằm trong ống: trượt ra khỏi miệng ống trong vài phần trăm giây đầu
      D.x = T.pos.x - T.dir.x * 6; D.y = T.pos.y - T.dir.y * 6; D.z = T.pos.z - T.dir.z * 6;
      D.lx = T.pos.x; D.ly = T.pos.y; D.lz = T.pos.z;   // miệng ống: đo quãng rời ống để đánh lửa
      // khí nén đẩy ra theo hướng ống (cộng vận tốc xe đang chạy)
      const bs = P.speed || 0, ba = P.bodyAngle || 0;
      D.vx = T.dir.x * C.ejectV - Math.sin(ba) * bs; D.vy = T.dir.y * C.ejectV; D.vz = T.dir.z * C.ejectV - Math.cos(ba) * bs;
      D.yaw = Math.atan2(-T.dir.x, -T.dir.z);
      D.roll = 0;
      this.kamiEjectFx(P, T);
      if (SE && SE.playKamiLaunch) SE.playKamiLaunch(0, null);
      else if (SE && SE.playRocketLaunch) SE.playRocketLaunch(0, null);
      this.addCombatLog(`[[rocket]] UAV CẢM TỬ RỜI ỐNG — A/D nghiêng cánh rẽ, W/S ngóc lên/chúc xuống, Shift tăng lực đẩy · CLICK vào xe địch để khóa, SPACE để UAV tự lao vào (còn ${P.kamikazeCount} quả)`, 'tip');
      if (this.updateAmmoUI) this.updateAmmoUI();
    },

    // Space khi đang lái UAV cảm tử (true = đã xử lý phím, không bắn pháo): chưa khóa -> khóa xe ở tâm màn hình;
    // đã khóa -> XÁC NHẬN, UAV tự chúc mũi lao vào mục tiêu; đang lao -> hủy, lái tay lại (vẫn giữ khóa)
    kamiTryLock() {
      const P = this.player;
      if (!this.kamiOn(P)) return false;
      const D = this.droneState(), S = this._sight;
      if (D.state !== 'flying' || !S || !S.arty) return false;
      if (D.fall || S.dying) return true;
      const L = D.lock && !D.lock.isDead ? D.lock : null;
      if (L && D.attack) {
        D.attack = null;
        this.addCombatLog('[[target-arrow]] Hủy lao — lái tay lại (vẫn giữ khóa, Space để lao lại)', 'tip');
        return true;
      }
      if (L) {
        D.attack = { t: 0 };
        const SE = window.soundEngine;
        if (SE && SE.playRadarContact) SE.playRadarContact(1);
        this.addCombatLog(`[[rocket]] UAV CẢM TỬ LAO VÀO ${L.name || 'XE ĐỊCH'} — tự chúc mũi bám mục tiêu · A/W/S/D hoặc Space: hủy lao`, 'tip');
        return true;
      }
      if (!this.kamiPickLock(innerWidth / 2, innerHeight / 2)) {
        this.addCombatLog('[[target-arrow]] Chưa khóa mục tiêu — CLICK vào xe địch trên màn hình (hoặc đưa xe vào tâm rồi bấm Space)', 'alert');
      }
      return true;
    },

    // xe địch gần điểm màn hình (sx, sy) nhất: trong clickPx hoặc trong khung vuông của xe; null nếu không có
    kamiPickAt(sx, sy) {
      const P = this.player, cam = this.camera, v = new THREE.Vector3();
      let best = null, bestD = Infinity;
      for (const u of this.units || []) {
        if (u === P || u.isDead || u.team === P.team || u.isHiddenFromPlayer) continue;
        const uy = (u.y || 0) + 7, dl = Math.hypot(u.x - cam.position.x, uy - cam.position.y, u.z - cam.position.z);
        if (dl > C.lockR || dl < 1) continue;
        v.set(u.x, uy, u.z).project(cam);
        if (v.z >= 1) continue;   // sau lưng camera
        const px = Math.hypot((v.x + 1) / 2 * innerWidth - sx, (1 - v.y) / 2 * innerHeight - sy);
        const sz = Math.max(26, Math.min(140, 9000 / dl));   // = khung vuông khóa (kamiHud)
        if (px < Math.max(C.clickPx, sz * 0.7) && px < bestD) { bestD = px; best = u; }
      }
      return best;
    },
    // khóa xe địch tại điểm màn hình (sx, sy). Trả về xe đã khóa / null
    kamiPickLock(sx, sy) {
      const D = this.droneState(), best = this.kamiPickAt(sx, sy);
      if (!best) return null;
      if (best === D.lock) return best;
      D.lock = best; D.attack = null;
      const SE = window.soundEngine;
      if (SE && SE.playRadarContact) SE.playRadarContact(1);
      this.addCombatLog(`[[target-arrow]] UAV CẢM TỬ KHÓA ${best.name || 'XE ĐỊCH'} — bấm SPACE để UAV tự lao vào (chuột phải: bỏ khóa)`, 'tip');
      return best;
    },
    // chuột phải: bỏ khóa (đang lao thì hủy luôn)
    kamiUnlock() {
      const D = this.droneState();
      if (!D.lock) return;
      D.lock = null; D.attack = null;
      this.addCombatLog('[[target-off]] UAV cảm tử: đã bỏ khóa', 'tip');
    },

    // đoạn bay a -> D cắt HỘP THÂN XE (đo trên mô hình, xoay theo thân: mũi / đuôi / tháp / lồng nóc; cả xác xe còn nằm đó)
    // -> { u, x, y, z } điểm chạm sớm nhất, hoặc null
    kamiHitUnit(D, ax, ay, az) {
      const P = this.player, SB = typeof Strongholds !== 'undefined' && Strongholds.segUnitBox;
      if (ax === undefined) { ax = D.x; ay = D.y; az = D.z; }
      let best = null, bt = 2;
      for (const u of (this.shotUnits ? this.shotUnits() : this.units) || []) {
        if (u === P || (u.isDead && !(u.dmg && u.group && u.group.visible))) continue;
        if (Math.hypot(u.x - D.x, u.z - D.z) > 120) continue;
        let t = -1;
        if (SB) t = SB(u, ax, ay, az, D.x, D.y, D.z, C.hitPad);
        else {   // không có hộp mô hình: hộp mặc định ~4 x 7,5 x 3,5 m quanh tâm xe
          const uy = u.y || 0;
          if (Math.hypot(u.x - D.x, u.z - D.z) < 22 && D.y < uy + 28 && D.y > uy - 2) t = 1;
        }
        if (t >= 0 && t < bt) { bt = t; best = u; }
      }
      if (!best) return null;
      return { u: best, x: ax + (D.x - ax) * bt, y: ay + (D.y - ay) * bt, z: az + (D.z - az) * bt };
    },
    // HỆ THỐNG ĐÁNH CHẶN (APS) của xe địch bắn hạ UAV khi lao vào vùng chặn ~9 m quanh xe (game.js apsVsKami). true = UAV mất
    kamiApsCheck(D, dt) {
      const AP = this.apsVsKami ? this.apsVsKami(D, this.player, dt) : null;
      if (!AP) return false;
      this.kamiShotDown(AP.unit, 'aps');
      return true;
    },
    // mặt chạm bên dưới UAV: đất (kể cả ụ đất) hoặc mặt sông / hồ
    kamiSurface(x, z) {
      const T = this.terrain;
      if (!T) return 0;
      const g = T.getElevationAt(x, z), w = T.waterSurfaceAt ? T.waterSurfaceAt(x, z) : null;
      return w !== null && w !== undefined && w > g ? w : g;
    },
    // Đoạn bay a -> D (300 đv/s, khung dài ~30 đv) cắt mặt đất / nước (+1,2 ngòi chạm): dò từng ~4 đv rồi chia đôi tìm điểm
    // cắt ĐẦU TIÊN, đặt UAV tại đó. Trước đây chỉ xét cuối đoạn -> nổ dưới đất / bay xuyên đỉnh dốc mới nổ. true = chạm
    kamiGroundHit(D, ax, ay, az) {
      const f = (t) => ay + (D.y - ay) * t - this.kamiSurface(ax + (D.x - ax) * t, az + (D.z - az) * t) - 1.2;
      if (f(0) <= 0) return D.y <= this.kamiSurface(D.x, D.z) + 1.2;   // đã sát đất từ đầu đoạn: giữ luật cũ
      const n = Math.max(1, Math.min(16, Math.ceil(Math.hypot(D.x - ax, D.z - az) / 4)));
      let t0 = 0, t1 = -1;
      for (let i = 1; i <= n; i++) { const t = i / n; if (f(t) <= 0) { t1 = t; break; } t0 = t; }
      if (t1 < 0) return false;
      for (let k = 0; k < 6; k++) { const m = (t0 + t1) / 2; if (f(m) <= 0) t1 = m; else t0 = m; }
      D.x = ax + (D.x - ax) * t1; D.y = ay + (D.y - ay) * t1; D.z = az + (D.z - az) * t1;
      return true;
    },

    // đoạn bay a -> b đâm vào nhà / cứ điểm / công trình / THÂN CÂY: điểm chạm hoặc null. D (thân UAV, không truyền khi dò
    // mút cánh): thêm TÁN CÂY — lao qua cành lá thì ngòi chạm có thể kích nổ ngay trên tán (cùng luật đạn ngòi chạm của
    // ballistics: quãng xuyên tán càng dài càng dễ nổ), trả { x, y, z, canopy }
    kamiObstacle(ax, ay, az, bx, by, bz, D) {
      const T = this.terrain;
      if (!T) return null;
      const h = (T.buildingSegmentHit && T.buildingSegmentHit(ax, ay, az, bx, by, bz))
        || (T.strongholdSegmentHit && T.strongholdSegmentHit(ax, ay, az, bx, by, bz))
        || (T.landmarkSet && T.landmarkSet.segmentHit && T.landmarkSet.segmentHit(ax, ay, az, bx, by, bz));
      if (h) return h;
      const V = T.trees;
      const th = V && V.trunkHit ? V.trunkHit(ax, ay, az, bx, by, bz) : null;
      if (th) return { x: th.x, y: th.y, z: th.z, tree: th.it };
      if (D && V && V.crownBurst) {
        if (!D._burstSeen) { D._burstSeen = new Set(); D.burstSeed = (Math.random() * 4294967296) >>> 0; }
        const cb = V.crownBurst(ax, ay, az, bx, by, bz, 'RPG', false, D.burstSeed, D._burstSeen);
        if (cb && cb.t <= 1) return { x: cb.x, y: cb.y, z: cb.z, canopy: cb };
      }
      return null;
    },
    // đâm vật cản (nhà / cứ điểm / công trình / cây): kích nổ tại điểm chạm, đầu nổ lõm phóng theo hướng bay
    kamiCrash(D, ax, ay, az) {
      const h = this.kamiObstacle(ax, ay, az, D.x, D.y, D.z, D);
      if (!h) return false;
      if (h.x !== undefined) { D.x = h.x; D.y = h.y; D.z = h.z; }   // cứ điểm / công trình chỉ báo có chạm: nổ tại chỗ
      this.kamiDetonate(D, null, h);
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
        const hit = by <= this.kamiSurface(bx, bz) + 0.3 || this.kamiObstacle(ax + ox, ay + oy, az + oz, bx, by, bz);
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
     * inp.aim {yaw, pitch}: tự lao vào mục tiêu — bẻ hướng / chúc mũi về đó (giới hạn tốc độ), bỏ qua phím lái.
     */
    kamiFly(dt, D, inp) {
      const gr = (x, z) => (this.terrain ? this.terrain.getElevationAt(x, z) : 0);
      if (D.v === undefined) D.v = Math.hypot(D.vx, D.vy, D.vz) || C.cruise;
      if (D.pitch === undefined) D.pitch = Math.atan2(D.vy, Math.hypot(D.vx, D.vz) || 1);
      D.boost = !!inp.boost;
      D.thr = D.boost ? 1 : 0.7;
      const kr = 1 - Math.exp(-dt * 5);
      const gY = gr(D.x, D.z);
      const vh = Math.max(40, D.v * Math.cos(D.pitch));   // tốc độ ngang: bổ nhào dốc thì rẽ cần nghiêng ít hơn
      if (inp.aim) {
        const dyaw = wrap(inp.aim.yaw - D.yaw), my = C.attackTurn * dt, mp = C.attackPitch * dt;
        const dy = Math.max(-my, Math.min(my, dyaw));
        D.yaw = wrap(D.yaw + dy);
        // nghiêng cánh đúng bằng góc cú bẻ thực tế cần (cùng chiều lái tay)
        D.roll = (D.roll || 0) + (bankFor(dt > 0 ? dy / dt : 0, vh, C.attackBank) - (D.roll || 0)) * kr;
        D.pitch += Math.max(-mp, Math.min(mp, inp.aim.pitch - D.pitch));
      } else if (inp.loiter) {
        // lượn chờ: nghiêng cánh dần vào vòng, rẽ từ hướng đang bay (không giật mũi); ngóc / chúc dần về góc giữ độ cao
        const mp = C.attackPitch * dt;
        D.roll = (D.roll || 0) + (-C.loiterBank - (D.roll || 0)) * kr;
        D.yaw = wrap(D.yaw + turnOf(D.roll, vh) * dt);
        D.pitch += Math.max(-mp, Math.min(mp, inp.loiter.pitch - D.pitch));
      } else {
        // nghiêng hết cỡ = góc cần cho tốc độ rẽ C.turn ở tốc độ này (chặn bankMax); tốc độ rẽ sinh ra từ góc nghiêng —
        // ấn phím thì cánh nghiêng dần rồi mới vào cua
        const bm = bankFor(C.turn, vh);
        D.roll = (D.roll || 0) + (Math.max(-C.bankMax, Math.min(C.bankMax, -inp.turn * bm)) - (D.roll || 0)) * kr;
        D.yaw = wrap(D.yaw + turnOf(D.roll, vh) * dt);
        D.pitch += inp.pitch * C.pitchRate * dt;
        // thả phím: giữ nguyên góc chúc (canh mũi vào xe không bị trôi), chỉ góc ngóc tự cân về bằng rất chậm
        // (dưới độ cao an toàn thì giữ cả góc ngóc: vừa phóng / vừa kéo lên khỏi đất cứ leo tiếp)
        if (!inp.pitch && D.pitch > 0 && D.y - gY > C.safeAlt) D.pitch -= D.pitch * 0.2 * dt;
      }
      if (D.v < C.minV) D.pitch -= (C.minV - D.v) / C.minV * 1.6 * dt;   // thất tốc: chúc mũi
      if (D.y > gY + C.ceiling && D.pitch > 0) D.pitch -= dt * 1.2;
      D.pitch = Math.max(C.pitchMin, Math.min(C.pitchMax, D.pitch));
      const want = D.boost ? C.boost : C.cruise;
      // động cơ đủ khỏe để leo hết góc ngóc mà không thất tốc; chúc mũi thì trọng lực kéo nhanh dần
      D.v += (want - D.v) * 1.2 * dt - (D.pitch > 0 ? 50 : 120) * Math.sin(D.pitch) * dt;
      D.v = Math.max(50, Math.min(C.maxV, D.v));
      const cp = Math.cos(D.pitch);
      D.vx = -Math.sin(D.yaw) * cp * D.v; D.vz = -Math.cos(D.yaw) * cp * D.v; D.vy = Math.sin(D.pitch) * D.v;
      // gió giật (Weather.gust): cơn giật xô dạt ngang, nhiễu loạn làm cánh chao (lệch hướng dần) & thân nhấp nhô —
      // mưa giông mạnh hơn hẳn; tự lái lao vào mục tiêu vẫn tự bù vì bám lại theo vị trí mỗi khung hình
      const GU = typeof Weather !== 'undefined' && Weather.gust ? Weather.gust() : null;
      D.gustG = GU ? GU.g : 0;
      D.x += D.vx * dt; D.y += D.vy * dt; D.z += D.vz * dt;
      if (GU) {
        // dạt theo khối khí (không đổi hướng mũi / camera theo vận tốc, chỉ xô cả thân đi)
        const B = D._buf || (D._buf = { t: 0, r: 0, y: 0 });
        if ((B.t -= dt) <= 0) { B.t = 0.12 + Math.random() * 0.3; B.r = (Math.random() - 0.5) * GU.turb * 0.012; B.y = (Math.random() - 0.5) * GU.turb * 0.8; }
        D.roll += B.r * dt * 6;
        D.x += GU.x * 0.6 * dt; D.z += GU.z * 0.6 * dt; D.y += B.y * dt;
      }
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
      if (this.kamiApsCheck(D, dt)) return true;
      const U = this.kamiHitUnit(D, ax, ay, az);
      if (U) { this.kamiDetonate(D, U); return true; }
      if (this.kamiCrash(D, ax, ay, az)) return true;
      if (this.kamiGroundHit(D, ax, ay, az)) { this.kamiDetonate(D, null); return true; }
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
        const inp = { turn: (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), pitch: (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), boost: !!(K.ShiftLeft || K.ShiftRight) };
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
        if (!D.attack && (dd > sig || Math.abs(D.x) > edge || Math.abs(D.z) > edge)) {
          const want = Math.atan2(-(P.x - D.x), -(P.z - D.z));
          inp.turn = Math.max(-1, Math.min(1, -wrap(want - D.yaw) * 2));
        }
        // đầu dò bám mục tiêu đã khóa: ĐANG LAO (Space xác nhận) -> tự chúc mũi bay vào điểm đón đầu xe;
        // lái tay -> lúc lao sát, mục tiêu gần hướng mũi thì kéo mũi nhẹ về phía xe
        const L = D.lock && !D.lock.isDead ? D.lock : (D.lock = null);
        if (!L) D.attack = null;
        // đang lao mà bấm A / W / S / D: hủy lao, lái tay ngay (phím đang giữ sẵn lúc bấm Space không tính tới khi nhả ra)
        if (D.attack) {
          const steer = ['KeyA', 'KeyD', 'KeyW', 'KeyS'].filter(k => K[k]);
          const held = D.attack.held || steer;
          D.attack.held = held.filter(k => K[k]);
          if (steer.some(k => !held.includes(k))) {
            D.attack = null;
            this.addCombatLog('[[target-arrow]] Hủy lao — lái tay lại (vẫn giữ khóa, Space để lao lại)', 'tip');
          }
        }
        if (L) {
          const ly = (L.y || gr(L.x, L.z)) + 7, dx = L.x - D.x, dy = ly - D.y, dz = L.z - D.z, dl = Math.hypot(dx, dy, dz);
          if (dl > C.lockR * 1.3) { D.lock = null; D.attack = null; this.addCombatLog('[[target-off]] UAV cảm tử mất khóa — mục tiêu ra ngoài tầm đầu dò', 'alert'); }
          else if (D.attack) {
            D.attack.t += dt;
            // đón đầu: xe đang chạy -> nhắm chỗ xe sẽ tới sau thời gian bay còn lại; nhắm giữa thân xe
            const tgo = Math.min(C.attackLead, dl / Math.max(60, D.v || C.cruise)), us = L.speed || 0, ba = L.bodyAngle || 0;
            const tx = L.x - Math.sin(ba) * us * tgo, tz = L.z - Math.cos(ba) * us * tgo;
            const ax = tx - D.x, az = tz - D.z, ay = (L.y || gr(L.x, L.z)) + 5 - D.y;
            // còn xa (mục tiêu dưới góc nông): bay bằng tới gần, thấp quá thì ngóc nhẹ giữ độ cao; tới góc diveLos thì
            // chúc đầu bổ nhào thẳng vào xe (đánh nóc)
            const los = Math.atan2(ay, Math.hypot(ax, az)), low = D.y - gr(D.x, D.z) < 50;
            inp.aim = { yaw: Math.atan2(-ax, -az), pitch: los < -C.diveLos ? los : Math.max(los, low ? 0.2 : 0) };
            inp.boost = true;
            // pha lao cuối (đã bổ nhào / đã sát mục tiêu): đầu dò quang học trên UAV tự bám — giữ tới khi hủy lao
            if (!D.attack.term && (los < -C.diveLos || dl < C.termR)) D.attack.term = true;
            // bị phá sóng: lệnh dẫn đường mất từng lúc, mũi giật (pha lao cuối không cần liên lạc: không ảnh hưởng)
            const E = D.emiT > 0 && !D.attack.term && D._emi;
            if (E) { if (E.drop) inp.aim = null; else { inp.aim.yaw += E.turn * 0.15; inp.aim.pitch += E.pitch * 0.15; } }
          } else if (dl < C.assistR) {
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
        if (this.kamiApsCheck(D, dt)) return true;
        const U = this.kamiHitUnit(D, ax, ay, az);
        if (U) { this.kamiDetonate(D, U); return true; }
        if (this.kamiCrash(D, ax, ay, az)) return true;
        this.kamiWingStrike(D, ax, ay, az);
        if (this.kamiGroundHit(D, ax, ay, az)) { this.kamiDetonate(D, null); return true; }
      }
      // ---- camera mũi: nhìn theo hướng bay, nghiêng theo cánh, rung theo tốc độ / nhiễu ----
      const sp = Math.hypot(D.vx, D.vy, D.vz) || 1;
      const fx = D.vx / sp, fy = D.vy / sp, fz = D.vz / sp;
      const shake = (Math.random() - 0.5) * (D.fall ? 1.4 : D.emiT > 0 ? 0.9 : 0.12 + sp / C.maxV * 0.35 + (D.gustG || 0) * 0.6);
      const px = D.x + fx * 4.5 + shake, py = D.y + fy * 4.5 + shake * 0.6, pz = D.z + fz * 4.5;
      cam.position.set(px, py, pz);
      cam.up.set(0, 1, 0);
      cam.lookAt(px + fx * 100, py + fy * 100, pz + fz * 100);
      cam.rotateZ(D.roll || 0);
      // gimbal camera mũi: xoay theo chuột quanh trục mũi, giới hạn trong hình nón gimbalCone (gắn trên thân -> nghiêng theo cánh)
      if (D.gyT !== undefined) {   // bám êm theo góc con trỏ đang chỉ (kamiGimbalAt)
        const k = 1 - Math.exp(-dt * 10);
        D.gy = (D.gy || 0) + (D.gyT - (D.gy || 0)) * k; D.gp = (D.gp || 0) + (D.gpT - (D.gp || 0)) * k;
      }
      if (D.gy || D.gp) { cam.rotateY(-(D.gy || 0)); cam.rotateX(D.gp || 0); }
      if (Math.abs(cam.fov - 58) > 0.01) { cam.fov = 58; cam.updateProjectionMatrix(); }
      // giọt mưa đập lên kính camera mũi, luồng khí tốc độ cao thổi dạt ra mép thành vệt
      if (typeof LensRain !== 'undefined' && typeof Weather !== 'undefined' && Weather.rainK) {
        LensRain.update(dt, document.getElementById('gun-sight'), { rain: Weather.rainK(), flow: Math.min(1, 0.35 + sp / C.maxV * 0.65) });
      }
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

    // camera mũi nhìn theo con trỏ: (nx, ny) -1..1 tính từ tâm màn hình (ny dương = phía dưới) -> góc gimbal đích, camera bám
    // êm tới đó (kamiFlyStep). Giới hạn trong hình nón: độ lệch tổng khỏi trục mũi <= gimbalCone
    kamiGimbalAt(nx, ny) {
      const D = this.droneState();
      let gy = Math.max(-1, Math.min(1, nx)) * C.gimbalX, gp = -Math.max(-1, Math.min(1, ny)) * C.gimbalY;
      const r = Math.hypot(gy, gp);
      if (r > C.gimbalCone) { gy *= C.gimbalCone / r; gp *= C.gimbalCone / r; }
      D.gyT = gy; D.gpT = gp;
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
      const hint = root.querySelector('.gs-hint');
      const tags = root.querySelector('.gs-tags');
      if (tags) tags.style.display = 'none';
      const box = document.createElement('div');
      box.className = 'kami-box';
      box.style.cssText = 'position:absolute;left:0;top:0;width:40px;height:40px;border:2px solid #ff3b30;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none;display:none;transform:translate(-50%,-50%)';
      const lb = document.createElement('span');
      lb.style.cssText = 'position:absolute;left:50%;top:100%;margin-top:4px;transform:translateX(-50%);white-space:nowrap;color:#ff3b30;font:700 12px "Chakra Petch",system-ui,sans-serif;letter-spacing:.1em;text-shadow:0 0 3px #000';
      box.appendChild(lb);
      root.appendChild(box);
      // dòng nhắc bước tiếp theo (giữa dưới màn hình): CLICK khóa -> SPACE lao -> đang lao
      const cue = document.createElement('div');
      cue.className = 'kami-cue';
      cue.style.cssText = 'position:absolute;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 14px;border-radius:4px;background:rgba(0,0,0,.45);color:#fff;font:700 15px "Chakra Petch",system-ui,sans-serif;letter-spacing:.12em;text-shadow:0 0 3px #000;white-space:nowrap;pointer-events:none';
      root.appendChild(cue);
      this._kamiBox = { box, lb, root, hint, cue, mode: '' };
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
            const txt = (D.attack ? 'ĐANG LAO · ' : 'KHÓA · ') + Math.round(dl) + ' M';
            if (B.lb.textContent !== txt) B.lb.textContent = txt;
            show = true;
          }
        }
        B.box.style.display = show ? 'block' : 'none';
        // hướng dẫn điều khiển theo trạng thái: chưa khóa / đã khóa / đang lao / đang rơi
        const mode = D.fall ? 'fall' : D.attack && L ? 'attack' : L ? 'lock' : 'free';
        if (B.mode !== mode) {
          B.mode = mode;
          B.box.style.borderWidth = mode === 'attack' ? '3px' : '2px';
          B.box.style.background = mode === 'attack' ? 'rgba(255,59,48,.14)' : 'none';
          const H = {
            free: ['CLICK VÀO XE ĐỊCH ĐỂ KHÓA MỤC TIÊU', '#ffd60a',
              'A / D: rẽ · W / S: lên / xuống · Shift: tăng tốc · Chuột: camera nhìn theo con trỏ (giữa màn hình = thẳng mũi) · CLICK vào xe: khóa · Ctrl: đóng'],
            lock: ['[SPACE] LAO VÀO MỤC TIÊU  ·  [CHUỘT PHẢI] BỎ KHÓA', '#ff3b30',
              'SPACE: UAV tự lao vào xe đã khóa · Click xe khác: đổi mục tiêu · Chuột phải: bỏ khóa · A / D / W / S: lái tay · Ctrl: đóng'],
            attack: ['ĐANG LAO VÀO MỤC TIÊU  ·  [A W S D / SPACE] HỦY, LÁI TAY', '#ff3b30',
              'UAV tự chúc mũi bám mục tiêu · A / W / S / D hoặc Space: hủy lao, lái tay lại · Chuột phải: bỏ khóa · Ctrl: đóng'],
            fall: ['', '', 'Ctrl: đóng']
          }[mode];
          B.cue.textContent = H[0]; B.cue.style.color = H[1]; B.cue.style.display = H[0] ? 'block' : 'none';
          if (B.hint) B.hint.textContent = H[2];
        }
      }
      // sắp hết nhiên liệu: tít tít, nhịp dồn dần (~1,1 s -> 0,15 s), tiếng cao & to dần
      if (!D.fall && D.fuel < C.fuelWarn) {
        const urg = 1 - D.fuel / C.fuelWarn;
        if (!D.warned) { D.warned = 1; this.addCombatLog('[[gas-station]] UAV cảm tử SẮP HẾT NHIÊN LIỆU — lao vào mục tiêu ngay', 'alert'); }
        if ((D.fuelBeepT = (D.fuelBeepT || 0) - dt) <= 0) {
          D.fuelBeepT = 1.1 - 0.95 * urg;
          const SE = window.soundEngine;
          if (SE && SE.playKamiFuelBeep) SE.playKamiFuelBeep(urg);
        }
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
      if (this._sightStateEl) set(this._sightStateEl, D.fall ? (D.fall.wing ? '⚠ GÃY CÁNH — MẤT CÂN BẰNG' : D.fall.jam ? '⚠ MẤT ĐIỀU KHIỂN — NHIỄU ĐIỆN TỪ' : '⚠ HẾT NHIÊN LIỆU — ĐANG RƠI') : L ? (D.attack ? (D.attack.term && D.emiT > 0 ? 'MẤT LIÊN LẠC · ĐẦU DÒ TỰ BÁM ' : 'ĐANG LAO VÀO ') : 'ĐÃ KHÓA ') + (L.name || 'XE ĐỊCH') : 'CHƯA KHÓA · CLICK VÀO XE ĐỂ KHÓA');
      const deg = (a) => Math.round(Math.abs(a || 0) * 180 / Math.PI);
      const cTxt = (D.gy || D.gp) ? 'CAMERA ' + (D.gy > 0 ? 'PHẢI ' : 'TRÁI ') + deg(D.gy) + '° · ' + (D.gp > 0 ? 'NGÓC ' : 'CHÚC ') + deg(D.gp) + '°' : 'CAMERA THẲNG MŨI';
      if (this._sightBlastEl) set(this._sightBlastEl, cTxt + ' · ĐẦU NỔ LÕM ' + C.blast.radius + ' M');
      const T = this._droneTags;
      if (T && T.sig && !T._jamTxt) T.sig.hidden = !S.sigEdge;
    },

    // ĐẦU NỔ LÕM KÍCH HOẠT đúng điểm chạm (hit: { u, x, y, z } xe bị chạm; obst: vật cản kamiObstacle; không có: đất / nước
    // tại vị trí UAV) theo hướng bay -> fireWarhead: giáp theo mặt bị chạm / sát thương / hư hại bộ phận / gói mạng / máy chủ
    // như mọi phát bắn. UAV mất, ống nạp quả mới nếu còn. Màn hình camera mũi: nhiễu trắng + TRÚNG MỤC TIÊU / ĐÃ KÍCH NỔ
    kamiDetonate(D, hit, obst) {
      const P = this.player;
      const unit = hit && hit.u, tgt = unit && !unit.isDead ? unit : null;
      const sp = Math.hypot(D.vx, D.vy, D.vz);
      const dir = sp > 1 ? new THREE.Vector3(D.vx / sp, D.vy / sp, D.vz / sp) : new THREE.Vector3(0, -1, 0);
      const at = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : obst && obst.x !== undefined ? new THREE.Vector3(obst.x, obst.y, obst.z) : new THREE.Vector3(D.x, D.y, D.z);
      if (P && !P.isDead) fireWarhead(this.ballistics, P, at, dir, obst && obst.canopy);
      D.state = 'lost'; D.dive = null; D.fall = null; D.lock = null; D.reloadT = C.reload; D.vx = D.vy = D.vz = 0; D.thr = 0;
      D.v = undefined; D.pitch = undefined;
      if (D.model) D.model.visible = false;
      const SE = window.soundEngine;
      if (SE && SE.updateKamiDive) SE.updateKamiDive(0);
      if (SE && SE.updateKamiRocket) SE.updateKamiRocket(0);
      if (SE && SE.updateDrone) SE.updateDrone(false, {});
      if (this._kamiBox) this._kamiBox.box.style.display = 'none';
      this.kamiDeathScreen(tgt ? 'TRÚNG MỤC TIÊU' : 'MẤT TÍN HIỆU', tgt ? 'UAV CẢM TỬ ĐÃ ĐÂM TRÚNG ' + (tgt.name || 'XE ĐỊCH') : 'UAV CẢM TỬ ĐÃ KÍCH NỔ');
      this.addCombatLog(tgt ? `[[bomb]] UAV CẢM TỬ ĐÃ ĐÂM TRÚNG ${tgt.name || 'XE ĐỊCH'}!` : '[[bomb]] UAV cảm tử đã kích nổ', 'tip');
      if (this.sendDroneState) { this._droneSendT = 0; }
    },

    // màn hình camera mũi: hình đứng khựng ở khung cuối, nhiễu trắng phủ, hiện chữ (DroneAir.updateDroneDeathCam, bỏ qua
    // pha lộn nhào)
    kamiDeathScreen(title, sub) {
      const S = this._sight, D = this.droneState();
      if (!S || !S.arty || S.dying) return;
      S.dying = { t: 0.75, x: D.x, y: D.y, z: D.z, yaw: D.yaw || 0, kami: true };
      const dead = this._uavEl && this._uavEl.dead, tx = dead && dead.querySelector('.gs-txt');
      if (!tx) return;
      tx.textContent = '';
      const b = document.createElement('b'), sp = document.createElement('span');
      b.textContent = title; sp.textContent = sub;
      tx.appendChild(b); tx.appendChild(sp);
    },

    // UAV CẢM TỬ CỦA MÌNH BỊ BẮN HẠ (drone_air.js destroyOwnDrone; why = 'link': xe mình bị hạ). Nổ nhỏ trên trời, xác rơi,
    // ống nạp quả mới; báo máy khác (DRONE_DOWN) để mọi máy cùng thấy vụ nổ
    kamiShotDown(attacker, why) {
      const P = this.player, D = this.droneState(), SE = window.soundEngine;
      if (D.state !== 'flying' && D.state !== 'launching') return;
      const x = D.x, y = D.y, z = D.z, vx = D.vx || 0, vy = D.vy || 0, vz = D.vz || 0;
      D.state = 'lost'; D.hp = 0; D.reloadT = C.reload; D.fall = null; D.dive = null; D.lock = null; D.attack = null; D.thr = 0;
      D.v = undefined; D.pitch = undefined;
      if (D.model) D.model.visible = false;
      if (SE && SE.updateKamiRocket) SE.updateKamiRocket(0);
      if (SE && SE.updateKamiDive) SE.updateKamiDive(0);
      if (this._kamiBox) this._kamiBox.box.style.display = 'none';
      this.kamiAirBurst(P.team, x, y, z, vx, vy, vz, D.yaw || 0, true);
      if (why !== 'link') {
        const by = !attacker ? 'ĐỊCH' : attacker === P ? 'CHÍNH ĐẠN CỦA BẠN' : attacker.team === P.team ? `${attacker.name} (ĐỒNG ĐỘI BẮN NHẦM)` : attacker.name;
        this.addCombatLog(why === 'aps' ? `[[shield-bolt]] HỆ THỐNG ĐÁNH CHẶN CỦA ${by} ĐÃ BẮN HẠ UAV CẢM TỬ cách xe ~9 m`
          : `[[alert-triangle]] UAV CẢM TỬ ĐÃ BỊ ${by} BẮN HẠ trên không`, 'alert');
        this.kamiDeathScreen('MẤT TÍN HIỆU', why === 'aps' ? 'BỊ HỆ THỐNG ĐÁNH CHẶN BẮN HẠ' : 'UAV CẢM TỬ BỊ BẮN HẠ');
      }
      const NS = this.netSync;
      if (NS && !NS.detached && P.netId !== undefined) {
        NS.net.send('DRONE_DOWN', { o: P.netId, a: attacker && attacker.netId !== undefined ? attacker.netId : -1,
          p: [Math.round(x * 10), Math.round(y * 10), Math.round(z * 10)], v: [Math.round(vx * 10), Math.round(vz * 10)], up: 1 });
        this._droneSendAcc = 99;
      }
    },

    // NỔ NHỎ TRÊN TRỜI khi UAV cảm tử bị bắn hạ: nhiên liệu tên lửa đẩy + một phần thuốc nổ bùng thành quả cầu lửa nhỏ, khói
    // đen, tiếng nổ đanh; thân gãy đôi + cánh văng ra, mảnh cháy bốc khói rơi xuống. Chỉ hình / tiếng (không sát thương)
    kamiAirBurst(team, x, y, z, vx, vy, vz, yaw, own) {
      const fx = this.ballistics && this.ballistics.fx;
      try {
        if (fx && fx.spawn) {
          fx.spawn(x, y, z, 'RPG', 'AIR', {});           // quả cầu lửa nhỏ
          fx.spawn(x, y, z, 'INCENDIARY', 'AIR', {});    // nhiên liệu rắn cháy bùng
        }
      } catch (e) { /* hiệu ứng phụ */ }
      const up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(x, y, z);
      for (let i = 0; i < 7; i++) {
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
        this.kamiPuff(at, d, 6 + Math.random() * 10, 2.2 + Math.random() * 1.6, 2.4 + Math.random() * 1.5, 0x3a332d, 0.75);
      }
      // xác: nửa thân trước (đầu nổ), nửa thân sau (động cơ, còn cháy), 2-3 cánh, vài mảnh vỏ
      const M = mats(team), paint = (M && M.paint) || new THREE.MeshStandardMaterial({ color: 0x556644 }), dark = (M && M.dark) || paint;
      const L = this._kamiBits || (this._kamiBits = []);
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const piece = (geo, mat, side, fwd, kick, smoke) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x - sn * fwd + c * side, y, z - c * fwd - sn * side);
        m.rotation.set(Math.random() * 3, yaw, Math.random() * 3);
        this.scene.add(m);
        L.push({ m, vx: vx * 0.35 + (Math.random() - 0.5) * kick + c * side * 4, vy: vy * 0.2 + 8 + Math.random() * kick * 0.6, vz: vz * 0.35 + (Math.random() - 0.5) * kick - sn * side * 4,
          sx: 4 + Math.random() * 8, sz: 3 + Math.random() * 8, life: 7, smoke });
      };
      const s = 1.3;
      piece(new THREE.CylinderGeometry(0.34 * s, 0.24 * s, 2.6 * s, 10), paint, 0, 2, 14, false);
      piece(new THREE.CylinderGeometry(0.34 * s, 0.3 * s, 2.4 * s, 10), dark, 0, -1.5, 14, true);
      const wings = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < wings; i++) piece(new THREE.BoxGeometry(2.4 * s, 0.06, 0.42 * s), paint, (i % 2 ? 1 : -1) * 2.5, (Math.random() - 0.5) * 2, 26, false);
      for (let i = 0; i < 4; i++) piece(new THREE.BoxGeometry(0.4 + Math.random() * 0.5, 0.05, 0.3 + Math.random() * 0.4), i % 2 ? paint : dark, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 34, false);
      const P = this.player, SE = window.soundEngine;
      if (P && SE && SE.playExplosionAtDistance && !(own && this._sight && this._sight.arty)) {
        SE.playExplosionAtDistance(Math.hypot(P.x - x, (P.y || 0) - y, P.z - z), 'AIRBURST', 'RPG', { x, z });
      }
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
    // Búp khói / hơi khí nén: đưa vào lớp khói instanced của ExplosionFX (1 lần vẽ) thay vì mỗi búp một Sprite + vật liệu
    // riêng (vệt khói tên lửa ~200 búp sống / UAV). Giữ dáng cũ: cản exp(-4t), nổi 2 đv/s², cỡ x(1 + 3,2a), mờ (1-a)²
    kamiPuff(pos, dir, speed, size, life, color, op) {
      const S = this.ballistics && this.ballistics.fx && this.ballistics.fx.smoke;
      if (!S) return;
      const j = () => (Math.random() - 0.5) * 0.5;
      S.add({ x: pos.x, y: pos.y, z: pos.z, vx: (dir.x + j()) * speed, vy: (dir.y + j() * 0.6) * speed + 3, vz: (dir.z + j()) * speed,
        size, grow: size * 3.2 / life, drag: 4, grav: -2, life, alpha: op || 0.55, fadeIn: 0.005, fadePow: 2,
        c0: kamiPuffColor(color || 0xe8e6e0), cell: 0, rotV: 0, floor: false });
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
      // (búp khói kamiPuff nay do ExplosionFX.smoke cập nhật)
      const B = this._kamiBits;
      if (B) for (let i = B.length - 1; i >= 0; i--) {
        const c = B[i];
        c.life -= dt;
        if (c.life <= 0) { this.scene.remove(c.m); c.m.geometry.dispose(); B.splice(i, 1); continue; }
        const g = this.terrain ? this.terrain.getElevationAt(c.m.position.x, c.m.position.z) : 0;
        // mảnh còn cháy (nửa thân động cơ): kéo vệt khói đen khi rơi, nằm dưới đất vẫn bốc khói vài giây
        if (c.smoke && c.life > 1.5 && (c.sT = (c.sT || 0) - dt) <= 0) {
          c.sT = c.m.position.y > g + 1 ? 0.05 : 0.22;
          this.kamiPuff(c.m.position, new THREE.Vector3(0, 1, 0), 3, 1.3, 1.8, 0x2a2521, 0.7);
        }
        c.vy -= 78 * dt;
        c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
        c.m.rotation.x += c.sx * dt; c.m.rotation.z += c.sz * dt;
        if (c.m.position.y < g + 0.1) {   // chạm đất: nảy nhẹ rồi nằm im
          // hãm ma sát độc lập FPS: x0,4 / x0,3 mỗi khung 60 FPS -> mũ dt·60 (khung dài không trượt xa hơn)
          const fh = Math.pow(0.4, dt * 60), fs = Math.pow(0.3, dt * 60);
          c.m.position.y = g + 0.1; c.vy = Math.abs(c.vy) * 0.25; c.vx *= fh; c.vz *= fh; c.sx *= fs; c.sz *= fs;
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
        // GĐ2 cánh / đuôi bung (wingT); rời ống ~3 m thì động cơ tên lửa đánh lửa: lửa đuôi + khói, tăng tốc, ngóc lên lấy độ cao
        const open = Math.max(0, Math.min(1, (t - C.wingT[0]) / (C.wingT[1] - C.wingT[0])));
        // đánh lửa khi đã rời miệng ống một khoảng ngắn (hoặc quá motorT vẫn chưa đủ xa: xe lùi cùng chiều...)
        if (!D.ignited && (Math.hypot(D.x - D.lx, D.y - D.ly, D.z - D.lz) >= C.motorDist || t >= C.motorT)) {
          D.ignited = true; D.ignT = t;
          const sp = Math.hypot(D.vx, D.vy, D.vz) || 1, back = new THREE.Vector3(-D.vx / sp, -D.vy / sp, -D.vz / sp), at = new THREE.Vector3(D.x, D.y, D.z).addScaledVector(back, 5);
          for (let i = 0; i < 8; i++) this.kamiPuff(at, back, 10 + Math.random() * 20, 1.4 + Math.random(), 1.6 + Math.random(), 0xc8c4bc, 0.6);   // khói mồi lửa
        }
        D.thr = D.ignited ? Math.min(1, (t - D.ignT) / 0.2) : 0;
        D.vy -= 40 * dt;
        if (D.thr > 0) {
          const hv = Math.hypot(D.vx, D.vz) || 1, nh = hv + (C.cruise - hv) * Math.min(1, dt * 1.6 * D.thr);
          D.vx = D.vx / hv * nh; D.vz = D.vz / hv * nh;
          D.vy += (85 - D.vy) * Math.min(1, dt * 2.5 * D.thr);   // ngóc lên leo dốc (qua mái nhà cao tầng)
        }
        D.x += D.vx * dt; D.y += D.vy * dt; D.z += D.vz * dt;
        D.roll = D.ignited ? 0 : Math.sin(t * 22) * 0.08 * Math.max(0, 1 - t / C.motorT);   // chao nhẹ lúc chưa có động cơ giữ
        if (t < 0.18) this.kamiPuff(new THREE.Vector3(D.x, D.y, D.z), new THREE.Vector3(-D.vx, -D.vy, -D.vz).normalize(), 6, 0.9, 0.6);
        trail();
        show(open);
        if (SE && SE.updateKamiRocket) SE.updateKamiRocket(D.thr * 0.8);
        if (t >= C.launchT) {
          D.state = 'flying';
          D.v = Math.hypot(D.vx, D.vy, D.vz); D.pitch = Math.min(0.5, Math.max(0.3, pitchOf())); D.thr = 0.7; D.gy = D.gp = 0;   // leo tiếp tới độ cao an toàn (safeAlt)
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
        // pha lao cuối: đầu dò tự bám mục tiêu đã khóa, mất liên lạc không làm mất điều khiển (hủy lao thì nhiễu tác dụng lại)
        const term = !!(S && D.attack && D.attack.term && D.lock && !D.lock.isDead);
        if (!term && D.kjam >= (D.jamOmni ? C.omniLose : C.jamLose)) {
          D.fall = { t: 0, spin: Math.random() < 0.5 ? -1 : 1, jam: true };
          D.lock = null; D.attack = null;
          // mất liên lạc giữa lúc lao: cánh lái giật lệch hẳn khỏi hướng đang lao -> trượt khỏi xe, cắm xuống đất bên cạnh
          D.yaw = wrap((D.yaw || 0) + D.fall.spin * (0.8 + Math.random() * 0.4));
          this.addCombatLog(D.jamOmni ? '[[antenna-bars-off]] UAV CẢM TỬ LỌT VÀO VÙNG GÂY NHIỄU — mất điều khiển, chao lệch hướng rồi đâm xuống tự nổ'
            : '[[antenna-bars-off]] UAV CẢM TỬ BỊ PHÁ SÓNG — mất điều khiển, bay loạn rồi đâm xuống tự nổ', 'alert');
        } else if (D.fuel <= 0) {
          D.fall = { t: 0, spin: Math.random() < 0.5 ? -1 : 1 };
          D.lock = null;
          this.addCombatLog('[[gas-station-off]] UAV cảm tử HẾT NHIÊN LIỆU — động cơ tắt, đang lượn rơi tự hủy', 'alert');
        }
      }
      trail();
      if (!S) D.attack = null;   // đóng màn hình: hủy lao, UAV lượn vòng chờ
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
      // màn hình đóng: bộ lái tự động lượn vòng chờ lệnh — nghiêng cánh dần vào vòng từ hướng đang bay (không giật mũi sang
      // tiếp tuyến), tốc độ về bay thường, ngóc / chúc dần giữ độ cao; vẫn đâm xe / nhà / cây / đất như lúc lái (máy khác vẫn thấy)
      const gY = this.terrain ? this.terrain.getElevationAt(D.x, D.z) : 0;
      const vyT = Math.max(-15, Math.min(22, (Math.max(D.y, gY + C.loiterAlt) - D.y) * 0.8));
      const ax = D.x, ay = D.y, az = D.z;
      this.kamiFly(dt, D, { turn: 0, pitch: 0, boost: false, loiter: { pitch: Math.asin(Math.max(-1, Math.min(1, vyT / Math.max(60, D.v || C.cruise)))) } });
      if (this.kamiApsCheck(D, dt)) return;
      const U = this.kamiHitUnit(D, ax, ay, az);
      if (U) { this.kamiDetonate(D, U); return; }
      if (this.kamiCrash(D, ax, ay, az)) return;
      this.kamiWingStrike(D, ax, ay, az);
      if (this.kamiGroundHit(D, ax, ay, az)) { this.kamiDetonate(D, null); return; }
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
        // xe khác / không mang UAV cảm tử: vẫn cho khói vệt / xác UAV cảm tử của máy khác (bị bắn hạ) bay, rơi, tan
        if (dt > 0 && (this._kamiFx || this._kamiBits)) this.updateKamiFx(dt);
        return origBatt.call(this, dt);
      };
      G.updateDroneBattery.__kami = true;
    }
    // chuột trên màn hình UAV cảm tử: CON TRỎ LUÔN HIỆN (không khóa chuột). Rê = camera mũi nhìn theo con trỏ (giữa màn hình =
    // thẳng mũi, ra mép = quay hết góc); rê qua xe địch con trỏ thành bàn tay; click trái = khóa xe chỗ click; nhấp giữa =
    // camera về thẳng mũi (tới lần rê sau); chuột phải = bỏ khóa. Gắn một lần cho cả trang, tự tìm game đang chạy
    if (typeof document !== 'undefined' && !window.__kamiMouse) {
      window.__kamiMouse = true;
      const game = () => window.game || window.artilleryGame;
      const view = () => { const g = game(); return g && g.kamiViewing && g.kamiViewing() ? g : null; };
      document.addEventListener('mousemove', (e) => {
        const g = view();
        if (!g) return;
        const canvas = g.renderer && g.renderer.domElement;
        if (e.target !== canvas) return;   // đang rê trên bảng / nút HUD: camera giữ nguyên
        g.kamiGimbalAt(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
        const want = g.kamiPickAt(e.clientX, e.clientY) ? 'pointer' : 'crosshair';
        if (canvas.style.cursor !== want) canvas.style.cursor = want;
      });
      document.addEventListener('pointerdown', (e) => {
        const g = view();
        if (!g) return;
        const canvas = g.renderer && g.renderer.domElement;
        if (e.target !== canvas) return;
        if (e.button === 1) { const D = g.droneState(); D.gyT = D.gpT = 0; e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (e.button === 2) { g.kamiUnlock(); e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (e.button === 0) {
          e.stopImmediatePropagation();   // không rơi xuống ngắm pháo (game.js handleAimFromScreen)
          if (!g.kamiPickLock(e.clientX, e.clientY)) {
            const t = performance.now();
            if (!(g._kamiMissT > t - 1500)) { g._kamiMissT = t; g.addCombatLog('[[target-arrow]] Không có xe địch ở chỗ click — click trúng xe (con trỏ thành bàn tay) để khóa', 'alert'); }
          }
        }
      }, true);
      // chuột phải trên màn hình UAV: không bật menu / không đặt điểm lái tự động cho xe (game.js contextmenu)
      document.addEventListener('contextmenu', (e) => {
        const g = view();
        if (!g || e.target !== (g.renderer && g.renderer.domElement)) return;
        e.preventDefault(); e.stopImmediatePropagation();
      }, true);
      // màn hình UAV đang mở: nhả khóa chuột (còn sót từ kính ngắm) để con trỏ hiện; đóng màn hình: trả con trỏ mặc định
      setInterval(() => {
        const g = game(), canvas = g && g.renderer && g.renderer.domElement;
        if (!canvas) return;
        const on = !!(g.kamiViewing && g.kamiViewing());
        if (on && document.pointerLockElement === canvas) document.exitPointerLock();
        if (!on && (canvas.style.cursor === 'pointer' || canvas.style.cursor === 'crosshair')) canvas.style.cursor = '';
      }, 250);
    }
    // Space trên màn hình UAV cảm tử: khóa / bỏ khóa mục tiêu
    const origFire = G.triggerPlayerFire;
    if (typeof origFire === 'function' && !origFire.__kami) {
      G.triggerPlayerFire = function () { if (this.kamiTryLock && this.kamiTryLock()) return; return origFire.call(this); };
      G.triggerPlayerFire.__kami = true;
    }
  }

  return { C, build, animate, methods, fireWarhead, bankFor };
})();

if (typeof window !== 'undefined') window.KamiUAV = KamiUAV;
