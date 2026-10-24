/**
 * ĐỘ TẢN MÁT ĐẠN (độ chụm) — áp dụng như nhau cho người chơi và bot, cho mọi phát bắn.
 *
 * Mỗi phát: hướng đạn lệch ngẫu nhiên quanh hướng nòng một góc (phân bố chuẩn, σ tính bằng mrad = 1/1000 rad,
 * ~1 mil) -> sai lệch tại mục tiêu tăng tuyến tính theo cự ly; sơ tốc cũng dao động nhẹ (lựu pháo: lệch dọc tầm lớn).
 *
 * Số liệu gốc là σ THẬT (khẩu + đạn + kíp ngắm, mrad) nhân SCALE: thân xe trong game dựng theo 8 đv/m nhưng cự ly bị
 * nén 0.5 đv/m (game_timing.js) -> một chiếc xe ở cự ly game X trông to như ở cự ly thật 16·X. Nhân σ với 16 thì tỉ lệ
 * trúng theo cự ly giống ngoài đời. Lựu pháo dùng tỉ lệ riêng (σ theo % cự ly), xem ARTY_LOB.
 *
 * Độ tản mát tức thời tăng khi xe đang chạy (đường càng xấu càng xóc), hẫng / đập xuống sau cú nhảy, tháp đang quay, ngay sau khi bắn (súng liên thanh nở dần theo loạt);
 * giảm khi đứng yên ngắm lâu; lựu pháo phải hạ chân chống; vỡ kính ngắm pháo thủ / hỏng pháo thì kém chụm hơn.
 *
 * ĐỒNG BỘ NHIỀU NGƯỜI CHƠI: phát pháo / tên lửa gửi kèm vận tốc thật sau tản mát (REMOTE_FIRE_EVENT `v`) nên mọi máy
 * thấy cùng một đường bay. Đạn liên thanh không gửi từng viên (chỉ cờ bắn) -> lấy số ngẫu nhiên theo hạt giống
 * (mã xe, số loạt, số thứ tự viên trong loạt): các máy rải cùng một chùm. Sát thương đạn liên thanh vẫn do máy chủ quyền tính.
 */
const Dispersion = (() => {
  const SCALE = (typeof GameTiming !== 'undefined') ? GameTiming.UNITS_PER_M / GameTiming.rangeScale : 16;

  // σ thật (mrad) theo khóa đạn GameTiming.roundKey; mv = σ sơ tốc (tỉ lệ); bloom = độ nở sau mỗi phát
  // (cộng vào hệ số nhân, hết dần theo bloomDecay mỗi giây), bloomMax = trần độ nở
  const PROFILE = {
    TANK_AP:          { mil: 0.18, mv: 0.0008, bloom: 0.20, bloomMax: 0.35, bloomDecay: 1.2 },   // Đạn xuyên giáp nòng trơn 120mm: đường đạn rất căng và cực kỳ chụm
    TANK_NORMAL:      { mil: 0.25, mv: 0.0010, bloom: 0.22, bloomMax: 0.40, bloomDecay: 1.2 },   // Đạn nổ phá tiêu chuẩn
    TANK_HE:          { mil: 0.30, mv: 0.0012, bloom: 0.25, bloomMax: 0.40, bloomDecay: 1.2 },
    GATLING_BULLET:   { mil: 1.2, mv: 0.004, bloom: 0.02, bloomMax: 0.6, bloomDecay: 0.4 },  // 30 mm 6 nòng: tản rộng, nở theo loạt
    INCENDIARY:       { mil: 1.2, mv: 0.004, bloom: 0.02, bloomMax: 0.6, bloomDecay: 0.4 },
    // súng máy 12.7 mm trên giá xoay tay: xạ thủ tì vai ghì súng -> vài viên đầu loạt khá chụm; xả dài súng nảy dần (nở
    // +0.6/s, tự co 0.35/s -> loạt ngắn 5-10 viên gần như không nở, xả >3 s mới tới trần). Trước đây 1.9 + nở 1.0/s: ngay
    // loạt 10 viên đã tản x2, trúng xe ở 400 đv chỉ ~20%
    SCOUT_BULLET:     { mil: 1.4, mv: 0.005, bloom: 0.06, bloomMax: 0.8, bloomDecay: 0.35 },
    SCOUT_INCENDIARY: { mil: 1.4, mv: 0.005, bloom: 0.06, bloomMax: 0.8, bloomDecay: 0.35 },
    // lựu 40mm súng phóng lựu cầm tay trên giá (xe trinh sát): mỗi phát giật nặng, nhịp chậm (~4 phát/s) -> nở nhanh theo
    // loạt; sơ tốc dao động lớn hơn đạn súng -> lệch tầm. (+ độ lệch riêng của súng MAIN_WEAPONS.agl.spread.) Trước đây
    // dùng chung bảng súng máy 12.7
    GL40:             { mil: 0.8, mv: 0.012, bloom: 0.1, bloomMax: 0.7, bloomDecay: 0.5 },
    RPG:              { mil: 3.0, mv: 0.010, bloom: 0, bloomMax: 0, bloomDecay: 1 },
    ANTI_TANK_MISSILE:{ mil: 0.06, mv: 0, bloom: 0, bloomMax: 0, bloomDecay: 1 },               // dẫn đường: gần như không tản
    // lựu pháo hạ nòng bắn thẳng: ngắm bằng kính bắn thẳng đơn giản, không máy tính hỏa lực / ổn định như pháo tăng, nòng
    // giật dài -> kém chụm rõ (tỉ lệ SCALE như mục tiêu mặt đất, không phải GUN_SCALE): hạ chân chống ngắm đủ lâu trúng xe
    // tăng ~95% ở 300 đv, ~65% ở 600, ~35% ở 800 (vừa dừng / đang quay thấp hơn nhiều) — trúng là hạ (đạn 155 to; phải trúng
    // thật vào thân xe, không có ngòi cận đích: ballistics), bắn trượt thì lộ vị trí & chờ nạp
    ARTY_DIRECT:      { mil: 1.25, mv: 0.0020, bloom: 0.4, bloomMax: 0.4, bloomDecay: 0.5 },
    CLUSTER_SUBMUNITION: { mil: 0, mv: 0, bloom: 0, bloomMax: 0, bloomDecay: 1 }
  };
  // Lựu pháo bắn cầu vồng: σ hướng (mrad, đã theo tỉ lệ game) và σ sơ tốc — tầm ~ v² nên lệch dọc ≈ 2·mv·cự ly,
  // lệch ngang ≈ defl·cự ly -> vùng rơi là hình bầu dục dài theo hướng bắn.
  // Theo số liệu bắn thật lựu pháo 155 mm đạn không điều khiển (có khí tượng & đo đạc tốt): ~15 km lệch tầm 1σ ~60 m, lệch
  // hướng ~20 m. Quy đổi tỉ lệ game (tầm nén artyRangeScale, thân xe 8 đv/m) -> defl 29, mv 0.045 (đứng chắc chân ~x0.7).
  // Trúng thẳng một chiếc xe chỉ còn vài % mỗi quả ở tầm xa — lựu pháo diệt xe vỏ mỏng bằng mảnh văng (BallisticsSystem3D
  // .blastProfile: lõi ~6 m, tầm mảnh ~25 m), xe tăng chủ lực thì chỉ hỏng xích / kính / bộ phận ngoài trừ khi trúng thẳng.
  // Trước đây defl 5, mv 0.012: chụm gấp ~4-6 lần thực tế (~20% trúng thẳng xe tăng ở 10 km)
  const ARTY_LOB = { defl: 29, el: 1.0, mv: 0.045, bloom: 0.3, bloomMax: 0.3, bloomDecay: 0.4 };

  // BẮN CÀNG XA CÀNG KÉM CHỤM HƠN TỈ LỆ THUẬN: ngoài độ lệch góc (sai lệch tại đích tăng đều theo cự ly), đạn bay càng lâu
  // càng chịu thêm sai số khí tượng (gió giật, mật độ / nhiệt độ không khí dọc đường bay), nhiệt độ thuốc phóng, sai số đo
  // cự ly... -> σ nhân thêm (1 + grow·(cự ly / ref)²). Ở tầm bắn hiệu quả tối đa (ref): σ x (1 + grow).
  // Đạn liên thanh không áp dụng (độ tản mát theo loạt đã lớn, không biết trước cự ly từng viên).
  const RANGE_GROW = { ARTY_LOB: 1.0, ARTY_DIRECT: 0.6, GUN: 0.25 };
  // Pháo tăng: có hệ thống ổn định hai trục và máy tính hỏa lực điện toán đo xa laser nên đường đạn rất căng và chụm;
  // GUN_SCALE và TANK_SCALE hạ về mức hợp lý để vòng tản mát vừa khít thân xe ở tầm xa, không che khuất mục tiêu.
  const GUN_SCALE = 4.5, VERT_K = 0.55;
  const TANK_SCALE = 4.5;
  // SÚNG MÁY (12.7 xe trinh sát, 7.62 trạm nóc tháp) BẮN MẶT ĐẤT: σ thật x MG_SCALE (thay cho SCALE 16). x16 làm chùm đạn
  // ~±9 đv (1σ) ở 400 đv -> trúng xe được nhưng gần như không trúng nổi phụ kiện ngoài cỡ 0.3-0.6 m (kính, radar, ống khói,
  // đèn, thùng...) — mà phá phụ kiện ngoài là việc chính của súng 12.7. x10: ~±5.6 đv ở 400 (~800 m thật): loạt ngắn ngắm
  // kỹ vẫn trúng thân xe phần lớn, phụ kiện ngoài khi ở gần; xả xa / chạy / quay tháp tản rõ — súng máy trên giá xoay tay
  // không chụm như pháo có ổn định (trước đây x6: trúng ~100% ở 800 m). Bắn drone (nòng > 8°) giữ bảng riêng AIR_K_MG
  const MG_SCALE = 10;
  // PHÁO 30MM 6 NÒNG (xe Hailstorm) BẮN MẶT ĐẤT: tháp có ổn định + máy tính hỏa lực nhưng cụm 6 nòng rung theo loạt ->
  // σ thật x GATLING_SCALE. Trước đây x16 (như mục tiêu chung): ở 600 đv đứng yên chỉ ~46%/viên trúng xe, kém cả súng
  // máy 12.7 cầm tay trên giá (~94%). x10: ~77% đứng yên, ~33% chạy hết tốc ở 600 đv — vẫn tản rộng hơn 12.7 mỗi mrad
  // (bù lại bằng nhịp bắn). Trạm phóng lựu nóc tháp (bắn theo hệ đạn 30mm) giữ x16 + độ lệch riêng của bệ
  const GATLING_SCALE = 10;
  // súng liên thanh bắn lên trời vào drone (xem sigma). MG trước đây 0.7 -> σ trời (15.7 mrad) còn tản hơn bắn đất (14):
  // ~15%/viên ở 500 đv đứng yên, bám drone quay tháp liên tục thêm x2 -> gần như không trúng
  const AIR_K = 0.4, AIR_K_MG = 0.45;
  // bám bắn drone: tháp lia đều theo mục tiêu, không phải giật tháp đổi mục tiêu -> chỉ tính 35% phạt quay tháp
  const AIR_TURN_K = 0.35;

  // ẢNH HƯỞNG CỦA CHUYỂN ĐỘNG theo dòng xe (pháo tăng có ổn định pháo 2 trục -> ít bị ảnh hưởng nhất):
  //  move   : hệ số theo tốc độ (tỉ lệ so với tốc độ tối đa của xe) — chạy hết tốc: σ x (1 + move)
  //  turnK  : phạt theo tốc độ quay tháp / nâng nòng (mỗi độ/giây), turnMax: trần phạt
  //  hull   : phần chuyển động xoay thân xe lọt qua tới nòng (ổn định pháo bù phần còn lại)
  //  settleT / settleGain: đứng yên, nòng không đổi hướng settleT giây -> chụm hơn settleGain
  //  rough  : nhạy với độ gồ ghề mặt đường khi chạy (xe bánh lốp giảm xóc lò xo nảy nhiều, xe xích đè phẳng ổ gà)
  //  jolt   : xe đang hẫng / vừa đập xuống sau cú nhảy -> σ x (1 + jolt)
  //  sway / swayHz: độ rung hình trong kính ngắm (rad ứng với mỗi đơn vị phạt chuyển động) và tần số rung chính —
  //           xe có ổn định pháo rung nhỏ, nhanh (rì rì); giá súng / xe tải không ổn định lắc lớn, chậm (chòng chành)
  const VEH = {
    // HALBERD: ổn định pháo 2 trục, kính ngắm pháo thủ ổn định độc lập — ngắm nhanh, chụm tốt, ít nở tâm khi lia tháp
    ALL_ROUNDER: { move: 0.7, turnK: 0.008, turnMax: 0.35, hull: 0.12, settleT: 0.8, settleGain: 0.35, rough: 0.25, jolt: 0.5, sway: 0.0008, swayHz: 7 },
    // HAILSTORM: khung gầm xích như tăng chủ lực, tháp có ổn định nhưng cụm 6 nòng nặng, quay nhanh hơn
    GATLING:     { move: 1.0, turnK: 0.018, turnMax: 0.7, hull: 0.25, settleT: 1.5, settleGain: 0.15, rough: 0.4, jolt: 0.7, sway: 0.002, swayHz: 5.5 },
    // MARTEN: súng máy / ống phóng trên giá xoay, không ổn định; xe 4x4 nhẹ nảy mạnh trên đường xấu
    SCOUT:       { move: 1.5, turnK: 0.03, turnMax: 1.2, hull: 0.6, settleT: 1.5, settleGain: 0.2, rough: 1.0, jolt: 1.2, sway: 0.0045, swayHz: 2.6 },
    // ARBALEST: xe tải 6x6 chở lựu pháo, không ổn định; cần đứng yên lâu để khung xe hết rung
    ARTILLERY:   { move: 2.5, turnK: 0.035, turnMax: 1.2, hull: 0.8, settleT: 3.0, settleGain: 0.3, rough: 1.0, jolt: 1.5, sway: 0.006, swayHz: 1.8 }
  };
  const VEH_DEFAULT = { move: 1.2, turnK: 0.025, turnMax: 1.0, hull: 0.25, settleT: 2.0, settleGain: 0.22, rough: 0.5, jolt: 0.8, sway: 0.003, swayHz: 3 };
  const vehOf = u => VEH[u && u.tankType] || VEH_DEFAULT;
  // độ gồ ghề mặt đất (terrainInfo.bumpiness): bãi cỏ 0.4 là mốc (hệ số move ở trên tính theo mốc này),
  // đường nhựa ~0.1 êm hơn, sườn núi đá 1.4 / đống đổ nát 1.2 xóc hơn nhiều
  const ROUGH_REF = 0.4, ROUGH_MIN = 0.05, ROUGH_MAX = 1.4;

  // ---------- số ngẫu nhiên theo hạt giống ----------
  function hashStr(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function stateOf(u) {
    if (!u._disp) u._disp = { bloom: 0, rate: 0, still: 0, az: u.azimuth || 0, el: u.elevation || 0, body: u.bodyAngle || 0, burst: 0, shots: 0 };
    return u._disp;
  }
  // Trạm vũ khí nóc tháp (súng máy / phóng lựu, drone_air: u._roofShot): độ nở theo loạt & số loạt riêng — trước đây cộng
  // chung vào pháo chính, xả súng máy nóc làm phát pháo kế tiếp kém chụm tới x1.8
  function roofStateOf(u) {
    if (!u._dispRoof) u._dispRoof = { bloom: 0, burst: 0, decay: 1 };
    return u._dispRoof;
  }
  const wrap180 = d => ((d % 360) + 540) % 360 - 180;

  /** Gọi mỗi khung hình cho mỗi xe (spg.update): đo tốc độ quay tháp / thân, thời gian đứng ngắm, độ nở giảm dần */
  function track(u, dt) {
    if (!u || !(dt > 0)) return;
    const S = stateOf(u);
    const dAz = Math.abs(wrap180((u.azimuth || 0) - S.az));
    const dEl = Math.abs((u.elevation || 0) - S.el);
    const dBody = Math.abs(wrap180(((u.bodyAngle || 0) - S.body) * 180 / Math.PI));
    S.az = u.azimuth || 0; S.el = u.elevation || 0; S.body = u.bodyAngle || 0;
    // tháp quay (độ/giây) + nòng nâng hạ + thân xe xoay (phần ổn định pháo không bù được, theo dòng xe); lọc mượt ~0.25 s
    const inst = Math.min(200, (dAz + dEl * 0.6 + dBody * vehOf(u).hull) / dt);
    const k = Math.min(1, dt / 0.25);
    S.rate += (inst - S.rate) * k;
    const sp = Math.abs(u.speed || 0) / Math.max(1, u.baseMaxSpeed || 100);
    if (sp < 0.04 && S.rate < 3) S.still += dt; else S.still = 0;
    const P = profileFor(u, u.selectedAmmo, u.elevation);
    S.bloom = Math.max(0, S.bloom - dt * (P.bloomDecay || 1));
    if (u._dispRoof) u._dispRoof.bloom = Math.max(0, u._dispRoof.bloom - dt * u._dispRoof.decay);
  }

  /** Bảng σ cho loại đạn của xe; elevation để phân biệt lựu pháo bắn cầu vồng / hạ nòng bắn thẳng */
  function profileFor(u, ammo, elevation) {
    const type = u && u.tankType;
    let a = ammo || 'NORMAL';
    if (type === 'SCOUT' && u.mainGun && u.mainGun.kind === 'agl' && a !== 'ANTI_TANK_MISSILE') return PROFILE.GL40;
    if (type === 'GATLING' && a !== 'INCENDIARY') a = 'GATLING_BULLET';
    if (type === 'SCOUT' && a !== 'INCENDIARY' && a !== 'ANTI_TANK_MISSILE' && a !== 'RPG') a = 'SCOUT_BULLET';
    const key = typeof GameTiming !== 'undefined' ? GameTiming.roundKey(a, type) : 'TANK_NORMAL';
    if (key === 'ARTY') {
      const AD = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT : null;
      return (elevation !== undefined && elevation <= ((AD && AD.elMax) || 15) + 3) ? PROFILE.ARTY_DIRECT : ARTY_LOB;
    }
    return PROFILE[key] || PROFILE.TANK_NORMAL;
  }

  /** Các thành phần phạt do chuyển động (cộng vào hệ số nhân): chạy (theo mặt đường), quay tháp / thân, hẫng / đập xuống */
  function motionTerms(u, V, S) {
    const sp = Math.min(1.3, Math.abs(u.speed || 0) / Math.max(1, u.baseMaxSpeed || 100));
    // chạy trên đường xấu xóc hơn, đường nhựa êm hơn (spg.js lưu độ gồ ghề mặt đất dưới xe vào _bumpiness)
    const bump = u._bumpiness !== undefined ? Math.max(ROUGH_MIN, Math.min(ROUGH_MAX, u._bumpiness)) : ROUGH_REF;
    // đang hẫng sau cú nhảy / vừa đập xuống đất: cả xe giật nảy
    const jolt = u.airborne ? 1 : Math.min(1, u._landK || 0);
    return {
      move: V.move * sp * Math.max(0.3, 1 + V.rough * (bump - ROUGH_REF)),
      turn: Math.min(V.turnMax, S.rate * V.turnK),
      jolt: V.jolt * jolt
    };
  }

  /**
   * Độ rung hình trong kính ngắm lúc này — cùng nguồn với độ tản mát (chạy / mặt đường / quay tháp / hẫng), để người
   * chơi nhìn kính là biết đang bắn chụm hay tản: { amp (rad, biên độ ~1σ), hz (tần số rung chính) }.
   * Chỉ là hình ảnh: phát bắn đã lệch ngẫu nhiên theo sigma(), không cộng thêm độ rung này vào đường đạn.
   */
  function sway(u) {
    if (!u) return { amp: 0, hz: 3 };
    const V = vehOf(u), M = motionTerms(u, V, stateOf(u));
    return { amp: V.sway * (M.move + 0.6 * M.turn + M.jolt), hz: V.swayHz };
  }

  /** Hệ số nhân độ tản mát hiện tại của xe (1 = đứng yên vừa dừng tay); bs: trạng thái độ nở riêng (trạm nóc tháp) */
  function multiplier(u, bs, air) {
    if (!u) return 1;
    const S = stateOf(u);
    const V = vehOf(u);
    const M = motionTerms(u, V, S);
    let m = (1 + M.move) * (1 + M.turn * (air ? AIR_TURN_K : 1)) * (1 + M.jolt);
    m *= 1 + (bs || S).bloom;
    m *= 1 - V.settleGain * Math.min(1, S.still / V.settleT);
    if (u.tankType === 'ARTILLERY' && !u.isDeployed) m *= 1.8;   // chưa hạ chân chống: cả xe giật nảy theo phát bắn
    const d = u.dmg;
    if (d && d.lost && d.lost.has && d.lost.has('opticGunner')) m *= 1.7;   // vỡ kính ngắm pháo thủ: ngắm qua kính dự phòng
    if (d && d.gun) m *= 1.15;                                               // cơ cấu pháo hư (bộ hãm lùi, ổn định)
    // nòng cong: ngoài độ lệch cố định theo hướng cong (spg.getMuzzleWorldTransform boreDir), đạn ra khỏi ống méo kém chụm
    // — chỗ cong càng sát miệng nòng đạn càng chao đầu (vehicle_damage applyBend: boreSpread 1,3 ở gốc .. 2,0 ở miệng nòng)
    if (d && d.boreSpread && !u._roofShot) m *= d.boreSpread;
    // cột khí tượng xe pháo bị bắn hỏng: máy tính hỏa lực mất số liệu gió / nhiệt độ / áp suất -> lựu pháo kém chụm
    if (d && d.lost && d.lost.has && d.lost.has('meteo') && u.tankType === 'ARTILLERY') m *= 1.3;
    return m;
  }

  /**
   * σ hiện tại cho phát bắn tiếp theo: { lat, vert } (rad) và mv (tỉ lệ sơ tốc), lob = lựu pháo cầu vồng
   */
  function sigma(u, ammo, elevation, range, bs) {
    const a = ammo !== undefined ? ammo : (u && u.selectedAmmo), el = elevation !== undefined ? elevation : (u && u.elevation);
    const P = profileFor(u, a, el);
    const stream = P === PROFILE.SCOUT_BULLET || P === PROFILE.SCOUT_INCENDIARY || P === PROFILE.GATLING_BULLET || P === PROFILE.INCENDIARY;
    const m = multiplier(u, bs, stream && el > 8);
    const r = rangeMul(u, a, P, range);
    if (P === ARTY_LOB) return { lat: P.defl * 1e-3 * m * r, vert: P.el * 1e-3 * m * r, mv: P.mv * m * r, lob: true, mul: m, rmul: r };
    // pháo tăng nòng dài có ổn định + máy tính hỏa lực: tỉ lệ game riêng nhỏ hơn (GUN_SCALE) và lệch dọc nhỏ hơn lệch
    // ngang (VERT_K) — đường đạn rất căng (rơi xiên ~1° ở 900 đv) nên mỗi mrad lệch dọc thành hàng chục-trăm đv lệch
    // tầm trên mặt đất; trước đây σ x16 cả hai chiều -> bắn điểm mặt đất ở 600-1000 đv rơi lệch tầm cả trăm đv
    // Lựu pháo hạ nòng bắn thẳng cũng đường đạn căng như pháo tăng: σ x16 cả chiều dọc làm điểm rơi lệch tầm ~110 đv
    // ở 800 đv -> lệch dọc theo VERT_K như pháo tăng; lệch ngang theo SCALE (kém chụm hẳn pháo tăng — xem PROFILE.ARTY_DIRECT)
    // Súng liên thanh bắn lên trời (chống drone, nòng > 8°): σ x16 theo tỉ lệ "xe nhìn to như ở cự ly x16" làm chùm đạn
    // ~±24 đv ở 1000 đv quanh drone bán kính trúng 4,5 đv -> mỗi viên ~2%, xả hết băng không rơi nổi một chiếc.
    // Drone không bị nén theo tỉ lệ thân xe như mục tiêu mặt đất -> giảm còn 40% (~10%/viên ở 1000 đv, ~35% ở 500 đv)
    if (stream && el > 8) {
      // xe 6 nòng có radar & máy tính hỏa lực phòng không (radar hỏng: như súng thường); súng máy 12.7mm trên giá: kém hơn rõ
      const ak = (P === PROFILE.GATLING_BULLET || P === PROFILE.INCENDIARY) && !(u && u.dmg && u.dmg.lost && u.dmg.lost.has && u.dmg.lost.has('aaRadar')) ? AIR_K : AIR_K_MG;
      const s = P.mil * SCALE * ak * 1e-3 * m * r;
      return { lat: s, vert: s, mv: P.mv * m * r, lob: false, mul: m, rmul: r };
    }
    const gun = P === PROFILE.TANK_AP || P === PROFILE.TANK_NORMAL || P === PROFILE.TANK_HE || P === PROFILE.ARTY_DIRECT;
    const tank = P === PROFILE.TANK_AP || P === PROFILE.TANK_NORMAL || P === PROFILE.TANK_HE;
    const mg = P === PROFILE.SCOUT_BULLET || P === PROFILE.SCOUT_INCENDIARY;
    const gat = (P === PROFILE.GATLING_BULLET || P === PROFILE.INCENDIARY) && u && u.tankType === 'GATLING';
    const s = P.mil * (tank ? TANK_SCALE : P === PROFILE.ARTY_DIRECT ? SCALE : gun ? GUN_SCALE : mg ? MG_SCALE : gat ? GATLING_SCALE : SCALE) * 1e-3 * m * r;
    return { lat: s, vert: gun ? s * VERT_K : s, mv: P.mv * m * r, lob: false, mul: m, rmul: r };
  }

  /** Hệ số kém chụm thêm theo cự ly bắn (1 ở sát nòng, 1 + grow ở tầm hiệu quả tối đa của loại đạn) */
  function rangeMul(u, ammo, P, range) {
    if (!(range > 0)) return 1;
    let grow = 0, ref = 0;
    if (P === ARTY_LOB) { grow = RANGE_GROW.ARTY_LOB; ref = typeof GameTiming !== 'undefined' ? GameTiming.round('HE', 'ARTILLERY').eff : 2700; }
    else if (P === PROFILE.ARTY_DIRECT) { grow = RANGE_GROW.ARTY_DIRECT; ref = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT.max : 800; }
    else if (P === PROFILE.TANK_AP || P === PROFILE.TANK_NORMAL || P === PROFILE.TANK_HE) { grow = RANGE_GROW.GUN; ref = typeof GameTiming !== 'undefined' ? GameTiming.round(ammo || 'NORMAL', u && u.tankType).eff : 1500; }
    if (!grow || !(ref > 0)) return 1;
    const k = Math.min(1.5, range / ref);
    return 1 + grow * k * k;
  }

  /**
   * Bán kính vùng trúng dự kiến (đơn vị game, ~2σ: 9/10 phát rơi trong vùng) ở cự ly dist — cho vòng ngắm trên HUD.
   * along: theo hướng bắn, cross: ngang.
   */
  function ring(u, dist, ammo, elevation) {
    const s = sigma(u, ammo, elevation, dist);
    const cross = 2 * s.lat * dist;
    // lựu pháo cầu vồng: tầm ~ v² -> lệch dọc ≈ 2·σv·cự ly
    let along = s.lob ? 2 * Math.hypot(2 * s.mv * dist, s.vert * dist) : cross;
    // lựu pháo nâng nòng góc thấp (cầu vồng thấp > 8°): đạn rơi xiên, lệch góc nòng thành lệch tầm R·2/tan2θ
    const el = elevation !== undefined ? elevation : (u && u.elevation);
    if (!s.lob && u && u.tankType === 'ARTILLERY' && el > 8) along = Math.max(along, 2 * dist * Math.hypot(s.vert * 2 / Math.tan(2 * el * Math.PI / 180), 2 * s.mv));
    return { along, cross, mul: s.mul, rmul: s.rmul, lob: s.lob };
  }

  /**
   * Làm lệch vector vận tốc đầu nòng của một phát bắn (gọi trong fireShell3D, trước khi tạo viên đạn).
   * range: cự ly tới điểm rơi dự kiến (bắn càng xa càng kém chụm). Trả về { vx, vy, vz }. Cập nhật độ nở sau phát bắn.
   */
  function perturb(u, ammo, elevation, vx, vy, vz, stream, range) {
    if (!u) return { vx, vy, vz };
    const S = stateOf(u);
    // súng liên thanh: lấy góc ngóc THẬT của viên đạn (xe 6 nòng do máy tính hỏa lực nâng cụm nòng trực tiếp, góc lệnh
    // u.elevation vẫn ~0 khi bắn trời -> trước đây không được giảm độ tản bắn drone, sấy cả băng không trúng)
    if (stream) {
      const sp0 = Math.hypot(vx, vy, vz);
      if (sp0 > 1e-6) elevation = Math.max(elevation || 0, Math.asin(Math.max(-1, Math.min(1, vy / sp0))) * 180 / Math.PI);
    }
    const P = profileFor(u, ammo, elevation);
    const B = u._roofShot ? roofStateOf(u) : S;   // trạm nóc tháp: độ nở / số loạt riêng
    const s = sigma(u, ammo, elevation, stream ? 0 : range, B);
    // hạt giống: đạn liên thanh = (mã xe, số loạt, viên thứ mấy) để mọi máy rải cùng chùm; pháo: đếm phát của xe
    // (vận tốc thật được gửi kèm phát bắn nên máy khác không cần tự tính lại)
    let seed;
    if (stream) {
      if ((u._beltIdx || 0) <= 1) B.burst++;
      // mã xe chung giữa các máy = số thứ tự trong đội hình trận (netId); chơi đơn dùng id
      const key = (u._roofShot ? 'r' : '') + (u.netId !== undefined ? 'n' + u.netId : u.id);
      seed = hashStr(key) ^ Math.imul(B.burst, 0x9E3779B1) ^ Math.imul(u._beltIdx || 0, 0x85EBCA77);
    } else {
      seed = hashStr(u.id) ^ Math.imul(++S.shots, 0xC2B2AE3D) ^ ((Math.random() * 4294967296) >>> 0);
    }
    const r = rng(seed >>> 0);
    const sp = Math.hypot(vx, vy, vz);
    if (sp < 1e-6) return { vx, vy, vz };
    let dx = vx / sp, dy = vy / sp, dz = vz / sp;
    // hệ trục quanh hướng bắn: phải (nằm ngang) và lên (vuông góc)
    let rx = -dz, rz = dx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;
    const a = gauss(r) * s.lat, b = gauss(r) * s.vert;
    dx += rx * a + ux * b; dy += uy * b; dz += rz * a + uz * b;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const nsp = sp * (1 + gauss(r) * s.mv);
    B.bloom = Math.min(P.bloomMax || 0, B.bloom + (P.bloom || 0));
    if (B !== S) B.decay = P.bloomDecay || 1;
    return { vx: dx / dl * nsp, vy: dy / dl * nsp, vz: dz / dl * nsp };
  }

  return { SCALE, GUN_SCALE, VERT_K, PROFILE, ARTY_LOB, RANGE_GROW, VEH, track, sigma, ring, multiplier, sway, perturb, profileFor, rangeMul };
})();

if (typeof window !== 'undefined') window.Dispersion = Dispersion;
if (typeof module !== 'undefined') module.exports = Dispersion;
