/**
 * Ô TÔ DÂN SỰ dựng thủ tục — 8 đơn vị = 1 m, mũi xe theo +Z, mặt đất y = 0.
 *
 * Thân dưới dựng theo MẶT CẮT NGANG dọc thân (như dựng mô hình xe thật): mỗi mặt cắt có ngưỡng cửa bo vào, sườn phồng
 * nhẹ, gân vai, mép nóc bo tròn và mặt capô / cốp vồng; bề rộng (nhìn từ trên), đường nóc & đường đáy (nhìn ngang, có
 * khoét hốc bánh) biến thiên trơn theo đường cong Catmull-Rom qua các điểm thiết kế; 2 đầu bo tròn mép.
 * Khoang kính dựng riêng, thu hẹp lên trên (tumblehome); kính chắn gió / kính hậu là 2 đầu dốc của khoang.
 * Ô kính, viền cao su, cột B, khe cửa / capô / cốp, nắp bình xăng vẽ trên shader theo toạ độ gốc của xe (aRef: thông
 * số mặt cắt tại đỉnh) -> mép sắc, không phụ thuộc độ mịn lưới, còn bám đúng chỗ khi thân xe bị bóp méo.
 */
const CivilCars = (() => {
  // ---------------------------------------------------------------------------
  // THÔNG SỐ THIẾT KẾ (đơn vị game). Mọi đường cong cho theo z tăng dần (đuôi -> mũi)
  // ---------------------------------------------------------------------------
  const SPEC = {
    // sedan cỡ trung (~4,7 x 1,8 x 1,45 m, cơ sở 2,75 m, lốp 205/55R16)
    sedan: {
      axleF: 11.6, axleR: -10.4, r: 2.55, trackHalf: 6.15, tireW: 1.65, archGap: 0.5, flare: 0.14,
      // bề rộng nửa thân nhìn từ trên (z, nửa rộng): đầu / đuôi bo tròn góc
      plan: [[-18.8, 5.8], [-18.55, 6.55], [-17.8, 6.97], [-16, 7.12], [-13, 7.18], [0, 7.22], [12, 7.2], [14.5, 7.12], [16.5, 6.94], [17.8, 6.6], [18.45, 6.08], [18.75, 5.35]],
      // đường nóc thân dưới nhìn ngang: cốp -> mép kính (vai) -> capô -> mũi
      top: [[-18.8, 6.6], [-18.6, 7.55], [-17.8, 8.0], [-15.5, 8.15], [-12.6, 8.12], [-8, 8.0], [0, 7.85], [6, 7.75], [7.8, 7.6], [10, 7.38], [13.5, 7.0], [16.5, 6.5], [17.9, 6.18], [18.45, 5.88], [18.75, 5.4]],
      // đường đáy (chưa tính hốc bánh): cản sau, ngưỡng cửa, cản trước có môi gió
      bottom: [[-18.8, 2.9], [-17.6, 2.2], [-13.5, 1.75], [0, 1.6], [13, 1.75], [17.2, 1.95], [18.75, 2.6]],
      // khoang kính nhìn ngang: chân kính hậu -> mui -> chân kính chắn gió (2 đầu = đường vai tại chỗ đó)
      cabin: [[-12.6, 8.12], [-11.0, 9.05], [-8.6, 10.5], [-6.2, 11.35], [-3, 11.62], [0.8, 11.6], [2.4, 11.3], [4.6, 10.05], [6.6, 8.6], [7.8, 7.6]],
      inset: 0.28, tumble: 1.2,     // chân kính lùi vào so với vai; mui hẹp hơn chân kính mỗi bên
      roofF: 2.1, roofR: -5.7,     // mép trên kính chắn gió / kính hậu
      pillarA: 0.45, pillarC: 0.78, zB: -0.9, zDiv: -8.2,
      rearDlo: [-9.8, 1.25, 8.0], // mép sau ô kính hông: đường xiên thẳng song song cột C, không bị uốn vẹo
      doors: [7.4, -0.9, -8.2], sill: 2.3, bumperF: [14.9, 4.9], bumperR: [-13.9, 5.2],
      hood: [7.6, 16.3], trunk: [-12.6, 6.5], fuel: [-12.45, 6.55, 0.62, 0.55],
      // đèn: trước (z mép sau phần ôm góc, x mép trong, cao, hạ so với mép capô), lưới (nửa rộng, hạ, cao, y hốc gió dưới),
      // hậu (z, x mép trong, cao, hạ); y biển số trước / sau
      lamps: { front: [15.9, 2.9, 1.0, 0.25], grille: [2.45, 0.35, 0.95, 3.0], rear: [-17.0, 3.1, 1.0, 0.3] }, plates: [3.6, 5.35],
      // cụm lắp vào lỗ khoét (mặt chiếu U-V, xem buildFeature)
      features: {
        // đèn pha vuốt ngược: mép ngoài ôm qua góc, mép trong thon nhọn hạ xuống chạm lưới tản nhiệt
        // (u càng âm càng vào trong, sát lưới) mắt "nhíu": đầu trong thon nhọn thấp, mép trên hếch lên dần ra góc ngoài cao;
        // 1 chóa phản xạ giữa + 1 bi projector phía ngoài, không vòng halo; DRL "lông mày" chạy sát mép trên rồi gập móc xuống ở
        // góc ngoài; xi nhan là 1 thanh hổ phách mảnh dưới đáy đầu trong
        head: { kind: 'head', dir: [0.55, 1], pts: [[-5.75, 4.9], [-2.7, 4.98], [-2.62, 5.66], [-5.85, 5.24]], r: 0.14, zMin: 14.5, depth: 0.58, backMat: 'reflector',
          halo: false,
          proj: [[-3.4, 5.28, 0.24, 'lens'], [-4.4, 5.17, 0.17, 'bowl']],
          drl: [[-5.72, 5.14], [-4.8, 5.3], [-3.8, 5.47], [-2.95, 5.58], [-2.74, 5.4], [-2.76, 5.1]],
          amberStrip: [[-5.45, 4.99], [-4.8, 5.0]],
          lensColor: (u, v) => u < -4.75 && v < 5.08 ? [1, 0.88, 0.7] : [1, 1, 1] },
        tail: { kind: 'tail', style: 'sedanBlade', dir: [0.46, -1], pts: [[-5.72, 6.18], [-2.05, 6.28], [-1.92, 7.1], [-5.68, 7.28]], r: 0.16, zMin: -14, depth: 0.4, backMat: 'tailBack',
          lensColor: (u, v) => v < 6.48 && u < -4.85 ? [0.92, 0.9, 0.82] : [0.76, 0.018, 0.014] },
        grille: { kind: 'grille', sym: true, dir: [0, 1], pts: [[-2.2, 4.42], [2.2, 4.42], [2.58, 5.0], [-2.58, 5.0]], r: 0.2, zMin: 15, depth: 0.7 },
        intake: { kind: 'intake', sym: true, dir: [0, 1], pts: [[-3.75, 2.62], [3.75, 2.62], [4.0, 2.98], [-4.0, 2.98]], r: 0.2, zMin: 15, depth: 0.5 },
        fog: { kind: 'fog', dir: [0, 1], pts: [[4.85, 2.92], [4.9, 2.92], [4.9, 2.97], [4.85, 2.97]], r: 0.33, zMin: 15, depth: 0.35, backMat: 'reflector' }
      }, bumperTop: [4.3, 5.55], rakeF: [14.5, 3.4, 0.11], rakeR: [-14.5, 4.6, 0.07]
    },
    // SUV thể thao đa dụng việt dã (~4,85 x 1,94 x 1,75 m, cơ sở 2,9 m, lốp 265/65R18)
    suv: {
      axleF: 12.2, axleR: -11.0, r: 3.0, trackHalf: 6.6, tireW: 2.1, archGap: 0.65, flare: 0.24,
      // bề rộng nửa thân nhìn từ trên: thân xe vuông vức, cơ bắp
      plan: [
        [-19.4, 5.85], [-19.12, 6.65], [-18.55, 7.28], [-17.7, 7.58], [-16.0, 7.68], [-12.0, 7.74],
        [0, 7.75], [12.0, 7.72], [16.4, 7.64], [18.3, 7.5], [18.95, 7.22], [19.28, 6.7], [19.4, 6.05]
      ],
      // đường nóc thân dưới nhìn ngang: đuôi đứng (không cốp thụt), đường vai cao thẳng tắp, capô cao gần phẳng
      // chỉ hơi dốc về trước, mép capô bo gọn rồi gập xuống mặt đầu đứng (không rủ tròn như sedan)
      top: [
        [-19.4, 8.65], [-19.1, 9.12], [-18.0, 9.35], [-12.0, 9.38], [-6.0, 9.32],
        [0, 9.24], [6.0, 9.12], [8.2, 8.98], [11.0, 8.9], [14.5, 8.76], [17.2, 8.6], [18.5, 8.44], [19.05, 8.18], [19.4, 7.6]
      ],
      // đường đáy gầm xe (khoảng sáng gầm cao 30 cm)
      bottom: [
        [-19.4, 3.8], [-18.2, 3.0], [-13.0, 2.45], [0, 2.3], [13.0, 2.45], [18.0, 2.85], [19.4, 3.6]
      ],
      // khoang kính nhìn ngang: kính hậu dốc đứng, nóc xe phẳng dài kéo dài ra tận đuôi xe
      cabin: [
        [-18.0, 9.35], [-17.1, 10.45], [-15.7, 12.05], [-13.8, 13.15], [-11.4, 13.48],
        [-5.5, 13.58], [0, 13.56], [3.5, 13.38], [5.5, 11.95], [7.2, 10.15], [8.2, 8.98]
      ],
      inset: 0.42, tumble: 1.28,    // kính thu vào rõ, thân dưới có vai khỏe thay vì một hộp kính dựng đứng
      roofF: 3.35, roofR: -13.45,
      pillarA: 0.58, pillarC: 1.05, zB: 0.35, zDiv: -7.15,
      rearDlo: [-14.75, 0.58, 9.65],
      doors: [8.0, 0.2, -7.5], sill: 2.9, bumperF: [15.8, 5.6], bumperR: [-15.5, 5.8],
      hood: [8.2, 18.75], trunk: [-18.0, 8.15], fuel: [-14.2, 7.9, 0.65, 0.58],
      lamps: {
        front: [16.8, 3.2, 1.25, 0.3],
        grille: [2.85, 0.45, 1.35, 3.6],
        rear: [-18.2, 3.4, 1.35, 0.35]
      },
      plates: [4.4, 6.72],
      features: {
        head: {
          kind: 'head', dir: [0.55, 1],
          pts: [[-6.6, 6.78], [-2.55, 6.9], [-2.45, 7.7], [-6.7, 7.62]],
          r: 0.15, zMin: 14.7, depth: 0.64, backMat: 'reflector',
          proj: [
            [-5.25, 7.22, 0.26, 'lens'],
            [-3.9, 7.26, 0.24, 'lens'],
            [-2.9, 7.3, 0.2, 'bowl']
          ],
          drl: [
            [-6.55, 7.5],
            [-6.6, 6.9],
            [-6.3, 6.84],
            [-4.5, 6.9],
            [-2.65, 6.96]
          ],
          amber: [
            [-6.42, 7.42, 0.28],
            [-6.28, 7.36, 0.24],
            [-6.14, 7.30, 0.20]
          ],
          lensColor: (u, v) => u > -2.6 ? [1, 0.8, 0.5] : [1, 1, 1]
        },
        tail: {
          kind: 'tail', style: 'vertical', dir: [0.34, -1],
          pts: [[-0.3, 6.48], [0.78, 6.25], [0.66, 8.88], [-0.34, 8.62]],
          r: 0.15, zMin: -15, depth: 0.42, backMat: 'tailBack',
          lensColor: (u, v) => v < 6.72 ? [0.84, 0.84, 0.8] : [0.72, 0.018, 0.014]
        },
        grille: {
          kind: 'grille', sym: true, dir: [0, 1],
          pts: [[-2.75, 6.1], [2.75, 6.1], [2.9, 7.62], [-2.9, 7.62]],
          r: 0.2, zMin: 15.5, depth: 0.72
        },
        intake: {
          kind: 'intake', sym: true, dir: [0, 1],
          pts: [[-4.0, 3.48], [4.0, 3.48], [4.18, 4.08], [-4.18, 4.08]],
          r: 0.18, zMin: 15.5, depth: 0.48
        },
        fog: {
          kind: 'fog', dir: [0, 1],
          pts: [[5.05, 3.55], [5.12, 3.55], [5.12, 3.62], [5.05, 3.62]],
          r: 0.28, zMin: 15.5, depth: 0.34, backMat: 'reflector'
        }
      },
      bumperTop: [5.6, 6.5], rakeF: [16.5, 5.0, 0.035], rakeR: [-15.5, 5.6, 0.05],
      isSuv: true
    },
    // Xe tải thùng lửng chở hàng thương mại (~5,2 x 1,88 x 2,15 m, cầu sau bánh đôi chịu tải, lốp 195/75R16)
    dump: {
      isDump: true, isTruck: true,
      axleF: 13.5, axleR: -10.0, r: 3.35, tireW: 2.2, trackHalf: 6.15, archGap: 0.4, flare: 0.18,
      // Cầu sau bánh đôi chịu tải nặng (twin rear tyres)
      dualR: { tireW: 1.75, x: 6.35, gap: 0.2 },
      plan: [[-20.8,7.3],[3.6,7.3],[7.0,7.3],[12,7.3],[17,7.3],[19.6,7.25],[20.4,6.95]],
      top: [[-20.8,6.8],[3.6,10.8],[7.0,10.8],[12,10.8],[18,10.8],[20.4,10.65]],
      bottom: [[-20.8,4.2],[7.0,3.7],[17,3.7],[20.4,4.0]],
      cabin: [[7.0,10.8],[7.12,14.8],[7.5,16.4],[8.3,16.65],[13,16.72],[17.2,16.65],[17.9,16.1],[19.9,11.5],[20.0,10.8]],
      inset: 0.55, tumble: 0.45, roofR: 7.5, roofF: 17.4,
      pillarA: 0.5, pillarC: 0.8, zB: 8.0, zDiv: 7.5, rearDlo: [7.8,0,11.6],
      doors: [19.2,7.7,7.7], sill: 3.65, bumperF: [20.0,5.0], bumperR: [-20.0, 5.0],
      hood: [20.0,20.4], trunk: [-20.0, 6.85], fuel: [3,4.3,0.8,0.5],
      lamps: {
        front: [19.2, 3.2, 1.4, 0.35],
        grille: [3.4, 0.5, 1.8, 4.2],
        rear: [-20.4, 4.0, 1.2, 0.4]
      },
      plates: [4.5, 4.6],
      features: {},
      bumperTop: [5.6, 6.2], rakeF: [19.8,7.0,0.003], rakeR: [-20.0, 5.0, 0.0]
    }
  };
  SPEC.truck = SPEC.dump;
  // Dedicated double-cab pickup; shares the detailed front fascia with the SUV.
  SPEC.pickup = Object.assign({}, SPEC.suv, {
    isPickup: true, axleF: 13.4, axleR: -12, r: 3.05, trackHalf: 6.35, tireW: 2.05,
    plan: [[-21.2,6.5],[-20.8,7.15],[-19.8,7.5],[-12,7.5],[-7,7.48],[0,7.5],[12,7.5],[17.5,7.32],[20.5,6.8],[21.2,6.1]],
    top: [[-21.2,8.4],[-20.7,8.8],[-8,8.8],[-6.8,8.75],[0,8.75],[7.8,8.65],[11,8.65],[16.8,8.6],[20.4,8.3],[21.2,7.85]],
    bottom: [[-21.2,3.6],[-19,2.8],[-12,2.5],[0,2.35],[13,2.5],[19.5,2.9],[21.2,3.7]],
    cabin: [[-7,8.8],[-6.8,10.8],[-6.4,12.7],[-5.6,12.95],[0,13.0],[3.6,12.85],[5.1,11.7],[6.8,10.1],[7.8,8.65]],
    roofR: -6.3, roofF: 3.5, inset: 0.38, tumble: 1.15,
    pillarC: 0.72, pillarA: 0.5, zB: -0.6, zDiv: -6.1,
    rearDlo: [-6.3,0.08,9.1], doors: [7.5,-0.6,-6.4],
    hood: [7.8,19.2], trunk: [-21,8.7], fuel: [-9,7.4,0.65,0.55],
    plates: [4.4,4.7], bumperF: [17.8,5.5], bumperR: [-19,5.4],
    rakeF: [17.8,4.5,0.12], rakeR: [-20,5.2,0],
    lamps: { front: [18.3,3.0,1.3,0.3], grille: [3.0,0.4,1.8,3.9], rear: [-20.2,3.4,1.35,0.35] },
    features: Object.assign({}, SPEC.suv.features, {
      head: Object.assign({}, SPEC.suv.features.head, {
        pts: SPEC.suv.features.head.pts.map(([u,v]) => [u,v+0.65]),
        proj: SPEC.suv.features.head.proj.map(([u,v,r,m]) => [u,v+0.65,r,m]),
        drl: SPEC.suv.features.head.drl.map(([u,v]) => [u,v+0.65]),
        amber: SPEC.suv.features.head.amber.map(([u,v,r]) => [u,v+0.65,r])
      }),
      grille: Object.assign({}, SPEC.suv.features.grille, {
        zMin: 18.0, pts: [[-2.8,5.65],[2.8,5.65],[3.05,7.75],[-3.05,7.75]], r: 0.16
      }),
      // đèn hậu dựng đứng ở 2 trụ góc thùng, ngoài khe bửng sau (bản cũ mượn đèn SUV, chiếu lệch ra sườn thành vệt xám)
      tail: { kind: 'tail', style: 'vertical', dir: [0.12, -1], pts: [[3.22, 5.75], [3.95, 5.75], [3.9, 8.25], [3.27, 8.25]], r: 0.14, zMin: -19.6, depth: 0.42, backMat: 'tailBack',
        lensColor: (u, v) => v < 6.35 ? [0.86, 0.85, 0.8] : v < 6.9 ? [0.9, 0.5, 0.1] : [0.72, 0.018, 0.014] }
    }),
    style: 1, tgEdge: 5.65
  });

  // cụm đèn / lưới dời sang thân khác: (du, dv) trên mặt chiếu, dz ngưỡng z; màu kính theo toạ độ gốc
  const shiftF = (F, du, dv, dz, extra) => Object.assign({}, F, {
    pts: F.pts.map(([u, v]) => [u + du, v + dv]), zMin: F.zMin + dz,
    proj: F.proj && F.proj.map(([u, v, r, m]) => [u + du, v + dv, r, m]),
    drl: F.drl && F.drl.map(([u, v]) => [u + du, v + dv]),
    amber: F.amber && F.amber.map(([u, v, r]) => [u + du, v + dv, r]),
    amberStrip: F.amberStrip && F.amberStrip.map(([u, v]) => [u + du, v + dv]),
    lensColor: F.lensColor && ((u, v) => F.lensColor(u - du, v - dv))
  }, extra || {});
  // Hatchback 5 cửa cỡ nhỏ (~4,05 x 1,75 x 1,48 m, cơ sở 2,55 m, lốp 195/55R16): mũi ngắn capô dốc, đường vai vát lên
  // về sau, mui dài tới cửa hậu gần đứng; cột C dày sơn màu thân + ô kính tam giác nhỏ sau cửa sau
  SPEC.hatch = {
    hatchback: true, style: 2, tgEdge: 4.75, tailBulge: [0.42, 6.6], handles: [-0.8, -9.7],
    axleF: 9.4, axleR: -11.0, r: 2.56, trackHalf: 5.95, tireW: 1.6, archGap: 0.4, flare: 0.16,
    plan: [[-16.2, 5.5], [-16.0, 6.25], [-15.4, 6.68], [-14, 6.82], [-10, 6.88], [0, 6.9], [9, 6.88], [11.5, 6.82], [13.6, 6.6], [15.0, 6.2], [15.9, 5.6], [16.2, 4.9]],
    top: [[-16.2, 6.6], [-16.05, 7.35], [-15.7, 7.75], [-14, 7.85], [-8, 7.7], [0, 7.5], [5.4, 7.35], [6.8, 7.15], [8.5, 6.95], [11.5, 6.55], [13.8, 6.1], [15.2, 5.65], [15.9, 5.25], [16.2, 4.8]],
    bottom: [[-16.2, 2.6], [-15, 2.0], [-12, 1.6], [0, 1.5], [11, 1.6], [14.8, 1.9], [16.2, 2.45]],
    cabin: [[-15.7, 7.75], [-15.4, 8.55], [-14.9, 9.75], [-14.1, 10.85], [-12.8, 11.45], [-9, 11.7], [-3, 11.7], [0.6, 11.55], [2.4, 10.9], [4.5, 9.35], [6.8, 7.15]],
    inset: 0.3, tumble: 1.1, roofF: 1.2, roofR: -13.4,
    pillarA: 0.45, pillarC: 0.95, zB: -2.4, zDiv: -11.0, rearDlo: [-14.0, 0.53, 8.2],
    doors: [6.6, -2.4, -10.6], sill: 2.25, bumperF: [13.4, 4.6], bumperR: [-13.6, 5.0],
    hood: [7.0, 15.3], trunk: [-15.75, 7.6], fuel: [-12.6, 6.6, 0.6, 0.55],
    lamps: { front: [13.8, 2.8, 1.0, 0.25], grille: [2.3, 0.35, 0.9, 2.9], rear: [-14.6, 3.0, 1.1, 0.3] }, plates: [3.5, 6.0],
    features: {
      head: shiftF(SPEC.sedan.features.head, 1.23, -0.35, -2.55),
      grille: shiftF(SPEC.sedan.features.grille, 0, -0.35, -2.55),
      intake: shiftF(SPEC.sedan.features.intake, 0, -0.3, -2.55),
      fog: shiftF(SPEC.sedan.features.fog, 0, -0.3, -2.55),
      tail: { kind: 'tail', style: 'blade', dir: [0.46, -1], pts: [[-2.7, 6.45], [-0.75, 6.4], [-0.7, 7.6], [-2.75, 7.68]], r: 0.16, zMin: -12.5, depth: 0.4, backMat: 'tailBack',
        lensColor: (u, v) => v < 6.66 && u < -2.0 ? [0.92, 0.9, 0.82] : [0.76, 0.018, 0.014] }
    },
    bumperTop: [4.2, 5.4], rakeF: [12.6, 3.4, 0.1], rakeR: [-13.5, 5.0, 0.04]
  };
  // Van thùng kín chở hàng một khối (~5,05 x 1,9 x 1,98 m, cơ sở 2,95 m, lốp 215/65R16): mũi ngắn capô dốc, kính chắn
  // gió đứng, kính chỉ ở cửa cabin, cửa lùa hông có ray trượt, cửa hậu 2 cánh có ô kính, đèn hậu dựng đứng ở 2 trụ sau
  SPEC.van = {
    hatchback: true, style: 3, tgEdge: 6.35, tailBulge: [0.15, 9.0], handles: [5.6, 3.4],
    axleF: 13.4, axleR: -10.2, r: 2.75, trackHalf: 6.5, tireW: 1.75, archGap: 0.45, flare: 0.12,
    plan: [[-20.2, 6.7], [-20.05, 7.3], [-19.5, 7.55], [-17, 7.6], [0, 7.6], [12, 7.6], [15.5, 7.52], [17.8, 7.25], [19.3, 6.75], [20.0, 6.0], [20.2, 5.2]],
    top: [[-20.2, 7.8], [-20.08, 8.5], [-19.75, 8.8], [-17, 8.88], [0, 8.88], [10, 8.82], [12.2, 8.72], [13.6, 8.45], [15.6, 7.8], [17.6, 7.05], [19.0, 6.45], [19.8, 5.85], [20.2, 5.1]],
    bottom: [[-20.2, 3.3], [-19.2, 2.6], [-14, 2.1], [0, 2.0], [13, 2.1], [18.6, 2.5], [20.2, 3.1]],
    cabin: [[-19.75, 8.8], [-19.7, 10.6], [-19.6, 13.3], [-19.3, 15.2], [-18.2, 15.8], [-10, 15.92], [0, 15.92], [6.5, 15.85], [8.8, 15.5], [10.3, 13.7], [11.4, 11.4], [12.2, 8.72]],
    inset: 0.12, tumble: 0.45, roofF: 8.9, roofR: -18.9,
    pillarA: 0.5, pillarC: 1.3, zB: 4.6, zDiv: -5.25, rearDlo: [-12, 0, 9],
    doors: [12.4, 4.6, -5.6], sill: 2.5, bumperF: [17.6, 4.7], bumperR: [-18.8, 4.6],
    hood: [12.9, 19.6], trunk: [-19.8, 8.6], fuel: [-7.5, 7.4, 0.6, 0.55],
    lamps: { front: [18.3, 3.2, 1.2, 0.3], grille: [3.0, 0.4, 1.5, 3.3], rear: [-19.4, 3.3, 1.3, 0.35] }, plates: [3.9, 5.5],
    features: {
      head: shiftF(SPEC.suv.features.head, 0.3, -1.5, 0.8),
      grille: { kind: 'grille', sym: true, dir: [0, 1], pts: [[-3.0, 4.95], [3.0, 4.95], [3.2, 6.0], [-3.2, 6.0]], r: 0.18, zMin: 16.5, depth: 0.6 },
      intake: { kind: 'intake', sym: true, dir: [0, 1], pts: [[-3.6, 3.1], [3.6, 3.1], [3.8, 3.6], [-3.8, 3.6]], r: 0.18, zMin: 16.5, depth: 0.45 },
      tail: { kind: 'tail', style: 'vertical', dir: [0.2, -1], pts: [[2.3, 5.2], [3.2, 5.2], [3.15, 8.6], [2.35, 8.6]], r: 0.15, zMin: -17, depth: 0.4, backMat: 'tailBack',
        lensColor: (u, v) => v < 5.85 ? [0.9, 0.55, 0.12] : [0.72, 0.018, 0.014] }
    },
    bumperTop: [4.6, 4.4], rakeF: [17.0, 4.0, 0.06], rakeR: [-19.0, 6.0, 0.0]
  };
  // ---------------------------------------------------------------------------
  // ĐƯỜNG CONG
  // ---------------------------------------------------------------------------
  const crSeg = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  // Catmull-Rom qua các điểm 2D (đa giác mở) -> mảng điểm dày (điểm điều khiển i nằm ở chỉ số i * samples)
  function spline2(pts, samples) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < samples; s++) out.push([crSeg(p0[0], p1[0], p2[0], p3[0], s / samples), crSeg(p0[1], p1[1], p2[1], p3[1], s / samples)]);
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  // hàm v(z) qua các điểm [z, v]: lấy mẫu dày rồi nội suy tuyến tính
  function curve(pts) {
    const out = spline2(pts, 24);
    return z => {
      if (z <= out[0][0]) return out[0][1];
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i], b = out[i + 1];
        if (z <= b[0]) return b[0] - a[0] < 1e-9 ? b[1] : a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]);
      }
      return out[out.length - 1][1];
    };
  }
  // độ dài cung tích luỹ dọc nửa mặt cắt
  function arcs(half) {
    const a = [0];
    for (let k = 1; k < half.length; k++) a.push(a[k - 1] + Math.hypot(half[k][0] - half[k - 1][0], half[k][1] - half[k - 1][1]));
    return a;
  }

  // ---------------------------------------------------------------------------
  // LƯỚI LOFT: các vành kín (cùng số điểm, đi ngược chiều kim đồng hồ nhìn từ +z, z tăng dần) nối thành dải.
  // refs[i][k]: thông số aRef của từng đỉnh. caps: bịt 2 đầu (đỉnh riêng -> cạnh nắp sắc, không làm nhoè pháp tuyến)
  // ---------------------------------------------------------------------------
  function loftMesh(rings, refs, caps) {
    const n = rings[0].length, pos = [], ref = [], idx = [];
    rings.forEach((R, i) => R.forEach((p, k) => { pos.push(p[0], p[1], p[2]); ref.push(...refs[i][k]); }));
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n - 1; k++) {
      const a = i * n + k, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    if (caps) for (const ri of [0, rings.length - 1]) {
      const R = rings[ri], base = pos.length / 3;
      let cx = 0, cy = 0;
      for (const p of R) { cx += p[0] / n; cy += p[1] / n; }
      for (const p of R) { pos.push(p[0], p[1], p[2]); ref.push(...refs[ri][0]); }
      pos.push(cx, cy, R[0][2]); ref.push(...refs[ri][0]);
      const c = base + n;
      for (let k = 0; k < n - 1; k++) { if (ri === 0) idx.push(c, base + k + 1, base + k); else idx.push(c, base + k, base + k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aRef', new THREE.Float32BufferAttribute(ref, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // nửa mặt cắt -> vành kín (nửa phải gầm -> nóc, nửa trái đối xứng nóc -> gầm)
  const mirrorRing = (half, z) => {
    const ring = half.map(([x, y]) => [x, y, z]);
    for (let k = half.length - 2; k >= 0; k--) ring.push([-half[k][0], half[k][1], z]);
    return ring;
  };
  const mirrorRefs = (refs) => refs.concat(refs.slice(0, -1).reverse());

  // ---------------------------------------------------------------------------
  // THÂN DƯỚI
  // ---------------------------------------------------------------------------
  // Nửa mặt cắt (x >= 0) từ tim gầm lên tim nóc theo bề rộng w, đáy y0, nóc y1: sàn phẳng, ngưỡng cửa bo vào, sườn
  // dưới phồng ra tới chỗ rộng nhất (~ngang tâm bánh), gân vai sắc, mép nóc bo tròn, mặt capô / cốp vồng
  // samples: số điểm nội suy mỗi đoạn (4 bản chi tiết, 1 bản xa low-poly)
  function halfSection(w, y0, y1, yBotBase, samples = 4) {
    const h = y1 - y0;
    const archLift = Math.max(0, y0 - (yBotBase != null ? yBotBase : y0));
    // archT: 0 ở thân xe bình thường, 1 ở đỉnh hốc bánh xe
    const archT = Math.min(1.0, archLift / 1.5);
    const smoothArch = archT * archT * (3 - 2 * archT); // chuyển tiếp trơn tru

    const yMid = Math.max(y0 + Math.min(0.5, h * 0.32), y1 - 2.15);
    const yLow = y0 + (yMid - y0) * 0.46;
    const yShoulder = y1 - 0.78;

    // Điểm 1 & 2: đáy gầm / mép gập vòm cua lốp
    const x1 = w - (1.3 * (1 - smoothArch) + 0.65 * smoothArch);
    const x2 = w - (0.62 * (1 - smoothArch) + 0.22 * smoothArch);
    const y2 = y0 + (1 - smoothArch) * Math.min(0.15, (yLow - y0) * 0.25);

    // Điểm 3 & 4: sườn dưới / mép ngoài vòm cua lốp
    // Khi ở hốc bánh xe, vòm cua lốp giữ nguyên bề rộng ngoài w ôm sát mép bánh, không bị bóp thắt lõm vào
    const x3 = w - (0.35 * (1 - smoothArch) + 0.05 * smoothArch);
    const y3 = (1 - smoothArch) * yLow + smoothArch * (y0 + (yMid - y0) * 0.28);

    const x4 = w - (0.10 * (1 - smoothArch) + 0.015 * smoothArch);
    const y4 = (1 - smoothArch) * (yLow + (yMid - yLow) * 0.55) + smoothArch * (y0 + (yMid - y0) * 0.65);

    return spline2([
      [0, y0],
      [x1, y0],
      [x2, y2],
      [x3, y3],
      [x4, y4],
      [w, Math.max(y0 + 0.2 * smoothArch, yMid)],
      [w - 0.02, yShoulder],
      [w - 0.18, y1 - 0.42],
      [w - 0.5, y1 - 0.06],
      [w - 1.3, y1 + 0.04],
      [w * 0.45, y1 + 0.16],
      [0, y1 + 0.19]
    ], samples);
  }
  // lo: bản xa low-poly (trạm dọc thân thưa, mặt cắt ít điểm) cho xe tạm trước khi nạp bản chi tiết
  function bodyGeometry(S, lo) {
    const isTruck = !!S.isTruck;
    const plan = curve(S.plan), top = curve(S.top), bot = curve(S.bottom);
    const RND = 0.38;
    // Xe tải: thân vỏ cabin chỉ bắt đầu từ sau lưng cabin (z = 3.6), phần đuôi là thùng hàng và sắt-xi
    const zStart = isTruck ? (S.cabin[0][0] - 0.2) : S.plan[0][0];
    const z0 = zStart + RND, z1 = S.plan[S.plan.length - 1][0] - RND, Ra = S.r + S.archGap;
    const RaH = isTruck ? Ra : (Ra + 0.38); // Xe tải/xe ben: vòm bánh xe tròn bán nguyệt đồng tâm hoàn hảo
    const width = z => plan(z) + S.flare * (Math.exp(-(((z - S.axleF) / 3.4) ** 2)) + (isTruck ? 0 : Math.exp(-(((z - S.axleR) / 3.4) ** 2))));
    // trạm dọc thân: đều 0.4, dày hơn quanh hốc bánh
    const Z = new Set();
    for (let z = z0; z < z1; z += lo ? 1.2 : 0.4) Z.add(+z.toFixed(3));
    Z.add(z1);
    const axles = isTruck ? [S.axleF] : [S.axleF, S.axleR];
    for (const az of axles) for (let z = az - RaH - 0.4; z <= az + RaH + 0.4; z += lo ? 0.55 : 0.08) Z.add(+z.toFixed(3));
    const zs = [...Z].filter(z => z >= z0 && z <= z1).sort((a, b) => a - b);
    const section = z => {
      const w = width(z), y1 = top(z);
      let y0 = bot(z);
      const yBotBase = bot(z);
      // hốc bánh xe: vòm cong mượt mà tròn đều quanh tâm bánh xe, không bị gập vuông hay bẹt đỉnh
      for (const az of axles) {
        const d = Math.abs(z - az);
        if (d < RaH) {
          const t = d / RaH;
          const yPeak = S.r + Ra;
          const archShape = Math.sqrt(Math.max(0, 1 - t * t));
          const archH = (yPeak - y0) * archShape;
          y0 = Math.max(y0, y0 + archH);
        }
      }
      y0 = Math.min(y0, y1 - 1.4);
      let half = halfSection(w, y0, y1, yBotBase, lo ? 1 : 4);
      if (S.isPickup && z < -7.25 && z > -20.55) {
        half = half.map(([x,y]) => {
          if (y < y1 - 0.44) return [x,y];
          const inner = Math.max(0,Math.min(1,(w-0.65-x)/0.38));
          const end = Math.max(0,Math.min(1,(-7.25-z)/0.5,(z+20.55)/0.5));
          return [x,y-inner*end*(y1-5.25)];
        });
      }
      return { w, y0, y1, half };
    };
    const rings = [], refs = [];
    const push = (z, sec, half) => { rings.push(mirrorRing(half, z)); refs.push(mirrorRefs(half.map(() => [sec.w, sec.y0, sec.y1]))); };
    // 2 đầu bo tròn mép: vài vành co dần vào tâm mặt cắt theo cung tròn bán kính RND
    const endRings = (z, dir) => {
      const sec = section(z), H = sec.half, out = [];
      let cx = 0, cy = 0;
      for (const p of H) { cx += p[0] / H.length; cy += p[1] / H.length; }
      cx = 0;
      for (const t of lo ? [0.5, 1] : [0.25, 0.5, 0.75, 1]) {
        const a = t * Math.PI / 2, d = RND * (1 - Math.cos(a)), dz = RND * Math.sin(a);
        out.push([z + dir * dz, sec, H.map(([x, y]) => { const ex = x - cx, ey = y - cy, l = Math.hypot(ex * 0.6, ey) || 1; return [Math.max(0, x - d * ex * 0.6 / l * (x > 0.01 ? 1 : 0)), y - d * ey / l]; })]);
      }
      return out;
    };
    for (const [z, sec, h] of endRings(zs[0], -1).reverse()) push(z, sec, h);
    for (const z of zs) { const sec = section(z); push(z, sec, sec.half); }
    for (const [z, sec, h] of endRings(zs[zs.length - 1], 1)) push(z, sec, h);
    // mặt trước vát cong như xe thật: mép capô lùi vào, cản nhô ra ở giữa, môi dưới lùi; đuôi vát nhẹ
    for (const R of rings) for (const p of R) {
      const [z0r, zN, yM, k] = p[2] > 0 ? [S.rakeF[0], S.plan[S.plan.length - 1][0], S.rakeF[1], S.rakeF[2]] : [S.rakeR[0], zStart, S.rakeR[1], S.rakeR[2]];
      const t = Math.max(0, Math.min(1, (p[2] - z0r) / (zN - z0r)));
      p[2] -= Math.sign(p[2]) * t * t * k * (p[1] - yM) * (p[1] - yM);
      // SUV: nắp cốp lồi nhẹ ở giữa và rút dần về hai góc, tránh mặt đuôi phẳng như một tấm vách.
      if (S.isSuv && !S.isPickup && p[2] < -15.4) {
        const rt = Math.max(0, Math.min(1, (-15.4 - p[2]) / 3.65));
        const side = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(p[0]) / 7.7), 1.55));
        const mid = Math.max(0.25, 1 - Math.abs(p[1] - 6.65) / 6.2);
        p[2] -= 0.72 * rt * rt * side * mid;
      }
      // hatchback / van: cửa hậu lồi nhẹ giữa, rút về 2 góc (S.tailBulge = [độ lồi, y giữa])
      if (S.hatchback && p[2] < S.plan[0][0] + 3.4) {
        const rt = Math.max(0, Math.min(1, (S.plan[0][0] + 3.4 - p[2]) / 3.4)), wMax = S.plan.reduce((m, q) => Math.max(m, q[1]), 0);
        const side = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(p[0]) / wMax), 1.6));
        const mid = Math.max(0.25, 1 - Math.abs(p[1] - S.tailBulge[1]) / 5.5);
        p[2] -= S.tailBulge[0] * rt * rt * side * mid;
      }
      if (!S.isSuv && !S.isTruck && !S.hatchback && p[2] < -13.6) {
        const rt = Math.max(0, Math.min(1, (-13.6 - p[2]) / 5.0));
        const side = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(p[0]) / 7.15), 1.7));
        const deck = Math.max(0.35, 1 - Math.abs(p[1] - 6.15) / 5.0);
        p[2] -= 0.48 * rt * rt * side * deck;
      }
    }
    return loftMesh(rings, refs, true);
  }

  // ---------------------------------------------------------------------------
  // KHOANG KÍNH: từ đường vai lên mui, thu hẹp lên trên. aRef = (u, v, 0): u = cung từ "góc mui" (gờ mui / cột A, C)
  // ra phía sườn (+) hay vào mặt mui / kính chắn gió (-); v = cung từ chân kính lên
  // ---------------------------------------------------------------------------
  function cabinGeometry(S, lo) {
    const plan = curve(S.plan), top = curve(S.top), roof = curve(S.cabin);
    const z0 = S.cabin[0][0], z1 = S.cabin[S.cabin.length - 1][0], SM = lo ? 3 : 5;
    const rings = [], refs = [];
    const isSuv = !!S.isSuv || !!S.hatchback;   // khoang kính chạy tới đuôi (không lặn vào rãnh cốp như sedan)
    const isTruck = !!S.isTruck;
    // Độ dốc nghiêng của vách kính: duy trì tỷ lệ đều đặn để cột C không bị vặn xoắn lõm yên ngựa
    const tumSlope = S.tumble / (isSuv ? 4.8 : (isTruck ? 6.2 : 3.6));

    for (let z = z0; z <= z1 + 1e-6; z += lo ? 0.5 : 0.2) {
      const tRear = Math.max(0.0, Math.min(1.0, (isSuv || isTruck) ? 0 : (-z - 8.5) / 3.8));
      const tEnd = Math.max(0.0, Math.min(1.0, (isSuv || isTruck) ? 0 : (-z - 10.8) / 1.8));

      // Ở đuôi sedan: chân cabin và mui hạ sâu vào trong khe rãnh nắp cốp, lặn hẳn vào trong thân xe
      const ybDrop = 0.25 + 0.35 * tRear + 0.55 * tEnd;
      const yb = top(z) - ybDrop;
      let yr = Math.max(yb + 0.12, roof(z) - ((isSuv || isTruck) ? 0 : 0.75 * tEnd));
      if (tEnd > 0.0) {
        yr = yr * (1.0 - 0.9 * tEnd) + (yb + 0.15) * (0.9 * tEnd);
      }
      const hh = Math.max(0.08, yr - yb);
      // Bề rộng chân kính: ở đoạn đuôi sedan thuôn mượt vào rãnh nước nắp cốp, không chìa ra ngoài gờ vai
      const w0 = plan(z) - S.inset - ((isSuv || isTruck) ? 0 : 0.45 * tRear + 0.55 * tEnd);
      // Độ nghiêng vách kính tỷ lệ trực tiếp với chiều cao hh: giữ vách kính và cột C luôn phẳng mịn tự nhiên
      const tum = Math.min(S.tumble, hh * tumSlope);
      const w1 = Math.max(0.5, w0 - tum);

      // Cung bo góc mui mềm mại (Roof fillet blend): xóa bỏ hoàn toàn gờ gập nhọn sắc lẹm trên cột C
      const rC = Math.min(0.48, hh * 0.24);
      const yShoulder = yr - rC;
      const xShoulder = w0 - tum * Math.max(0.0, (yShoulder - yb) / hh);
      const xRoofStart = Math.max(0.2, w1 - rC * 0.82);

      const half = [];
      // 1. Sàn đáy trong khoang kính: từ tâm xe ra chân kính (SM điểm: 0 .. SM-1)
      for (let i = 0; i < SM; i++) half.push([w0 * (i / SM), yb]);

      // 2. Kính hông và cột: từ chân kính lên chân cung bo mui (2*SM điểm: SM .. 3*SM-1)
      const N_SIDE = 2 * SM;
      for (let i = 0; i < N_SIDE; i++) {
        const t = i / N_SIDE;
        const y = yb + (yShoulder - yb) * t;
        const bulge = 0.02 * 4 * t * (1 - t) * Math.min(1.0, hh / 2.0);
        const x = w0 - (w0 - xShoulder) * t + bulge;
        half.push([x, y]);
      }

      // 3. Cung bo góc mui mềm mại (SM điểm: 3*SM .. 4*SM-1): chuyển tiếp trơn tru từ vách nghiêng sang nóc ngang
      const N_CORNER = SM;
      for (let i = 0; i < N_CORNER; i++) {
        const t = i / N_CORNER;
        const angle = t * Math.PI * 0.5;
        const cx = xShoulder - (xShoulder - xRoofStart) * (1 - Math.cos(angle));
        const cy = yShoulder + (yr - yShoulder) * Math.sin(angle);
        half.push([cx, cy]);
      }

      // 4. Nóc xe: từ cung bo mui vào đỉnh nóc giữa xe (2*SM + 1 điểm: 4*SM .. 6*SM)
      const N_ROOF = 2 * SM;
      for (let i = 0; i <= N_ROOF; i++) {
        const t = i / N_ROOF;
        const x = xRoofStart * (1 - t);
        const roofArch = Math.sin((1 - t) * Math.PI * 0.5) * 0.07 * Math.min(1.0, hh / 2.0);
        half.push([x, yr + roofArch]);
      }

      // aCorner đặt tại đỉnh cung bo mui giúp vách hông và nóc xe có tọa độ tham chiếu đối xứng hoàn hảo
      const A = arcs(half), aCorner = A[3 * SM + 2], aBase = A[SM];
      rings.push(mirrorRing(half, z));
      refs.push(mirrorRefs(half.map((p, k) => [aCorner - A[k], A[k] - aBase, 0])));
    }
    return loftMesh(rings, refs, false);
  }

  // ---------------------------------------------------------------------------
  // VẬT LIỆU: sơn 2 lớp (clearcoat); shader vẽ khe cửa / đèn / lưới tản nhiệt / ô kính / dấu thời gian
  // ---------------------------------------------------------------------------
  // Bầu trời phản chiếu lên sơn / kính: trời sáng dần lên đỉnh, đường chân trời là dải nhà / cây sẫm nhấp nhô (đường
  // phản chiếu tối chạy dọc thân xe như xe thật đỗ ngoài phố), mặt đường sẫm bên dưới
  let ENV = null;
  function envCube() {
    if (ENV || typeof document === 'undefined') return ENV;
    // Phố đổ nát quanh xe: 2 lớp nhà khối (gần sẫm cao, xa nhạt thấp vì hơi bụi) có mái bằng gãy khúc, ô cửa sổ (kính phản
    // trời sáng / ô tối vỡ kính), cột điện, tán cây; trời mây trôi loang; mặt đường nhựa có vạch sơn mờ + vỉa hè sáng
    // -> sơn / kính / crôm phản chiếu ra đường nét thật (tôn hơi gợn làm vệt phản chiếu uốn lượn), không loang trơn như nhựa
    const N = 256, sky0 = [200, 206, 210], sky1 = [112, 140, 172], ground = [46, 45, 43], road = [70, 69, 66], walk = [128, 124, 116];
    const R = mulberry(9157), BINS = 2048, nearH = new Float32Array(BINS), farH = new Float32Array(BINS), nearId = new Float32Array(BINS), farId = new Float32Array(BINS);
    const fill = (H, I, h0, h1, w0, w1) => { let b = 0, id = 0; while (b < BINS) { const w = (w0 + R() * (w1 - w0)) | 0, h = R() < 0.18 ? 0.004 : h0 + R() * (h1 - h0); id++; for (let k = 0; k < w && b < BINS; k++, b++) { H[b] = h; I[b] = id + k / w; } } };
    fill(farH, farId, 0.05, 0.13, 30, 90); fill(nearH, nearId, 0.08, 0.3, 50, 160);
    // tán cây / cột điện: tính sẵn chiều cao theo từng góc phương vị (khỏi lặp từng cây cho mỗi điểm ảnh)
    const treeH = new Float32Array(BINS), poleB = new Uint8Array(BINS);
    for (let i = 0; i < 26; i++) {
      const ta = R() * Math.PI * 2, tr0 = 0.03 + R() * 0.05, th = 0.05 + R() * 0.06;
      for (let b = 0; b < BINS; b++) { const da = Math.abs(((b / BINS * Math.PI * 2 - ta + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < tr0) treeH[b] = Math.max(treeH[b], th * Math.sqrt(1 - (da / tr0) ** 2)); }
    }
    for (let i = 0; i < 14; i++) { const b = (R() * BINS) | 0; poleB[b] = poleB[(b + 1) % BINS] = 1; }
    const face = dir => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, [dx, dy, dz] = dir(u, v), L = Math.hypot(dx, dy, dz), ny = dy / L;
        const az = Math.atan2(dz, dx), af = (az / (Math.PI * 2) + 1) % 1, bin = Math.min(BINS - 1, af * BINS | 0);
        let col;
        if (ny < 0) {
          // mặt đường: nhựa sẫm, xa dần ngả sáng theo hơi bụi; dải vỉa hè sáng + vạch sơn làn đứt quãng
          const d = -ny, t = Math.min(1, d * 4), far = Math.pow(1 - t, 3);
          const gx = dx / Math.max(d, 1e-3) * 0.12, gz = dz / Math.max(d, 1e-3) * 0.12;
          col = ground.map((g, i) => g + (road[i] - g) * 0.4 * vnoise3(gx * 0.6, gz * 0.6, 1));
          const curb = Math.abs(((gx * 0.25 + 1000) % 2) - 1) < 0.18, lane = Math.abs(((gz * 0.08 + 1000) % 2) - 1) < 0.04 && ((gx * 0.5 + 1000) % 1) < 0.5;
          if (curb) col = walk.slice(); else if (lane) col = col.map(c0 => c0 + 70);
          col = col.map((c0, i) => c0 + (sky0[i] * 0.78 - c0) * far);
        } else {
          const hf = farH[bin], hn = nearH[bin];
          const tr = treeH[bin] > 0 && ny < treeH[bin] * 1.15 && ny < treeH[bin] * (0.85 + 0.3 * vnoise3(az * 60, ny * 60, 3)) ? 1 : 0;
          const pole = poleB[bin] && ny < 0.24;
          if (pole) col = [40, 40, 42];
          else if (tr) col = [52 + 20 * vnoise3(az * 90, ny * 90, 5), 62 + 18 * vnoise3(az * 70, ny * 70, 6), 44];
          else if (ny < hn) {
            // nhà gần: tường bê tông sẫm, cửa sổ lưới ô: kính phản trời (sáng) / ô vỡ (tối) / mảng tường cháy
            const id = nearId[bin], wall = 74 + 26 * ((Math.floor(id) * 37 % 11) / 11), wx = (af * BINS / 9) % 1, wy = (ny / 0.022) % 1;
            col = [wall, wall * 0.98, wall * 0.95];
            if (wx > 0.25 && wx < 0.75 && wy > 0.3 && wy < 0.8 && ny > 0.015) { const k = (Math.floor(af * BINS / 9) * 13 + Math.floor(ny / 0.022) * 7) % 5; col = k < 2 ? [150, 162, 172] : k < 4 ? [34, 35, 37] : [96, 100, 104]; }
            if (ny > hn - 0.006) col = col.map(c0 => c0 * 0.8);   // gờ mái
          } else if (ny < hf) {
            const wall = 132 + 16 * ((Math.floor(farId[bin]) * 29 % 7) / 7), wx = (af * BINS / 6) % 1, wy = (ny / 0.016) % 1;
            col = [wall, wall + 2, wall + 6];
            if (wx > 0.3 && wx < 0.7 && wy > 0.35 && wy < 0.75) col = col.map(c0 => c0 * 0.78);
          } else {
            // trời: xanh nhạt dần về chân trời, mây loang mềm
            const t = Math.pow(Math.min(1, ny * 1.3), 0.6), cl = Math.max(0, vnoise3(az * 3.2, ny * 7, 2) * 0.65 + vnoise3(az * 9, ny * 19, 4) * 0.35 - 0.48) * 2.2 * Math.min(1, ny * 6);
            col = sky0.map((c0, i) => c0 + (sky1[i] - c0) * t).map(c0 => c0 + (236 - c0) * Math.min(1, cl));
          }
        }
        const p = (y * N + x) * 4; img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); return c;
    };
    // thứ tự mặt cube: +x -x +y -y +z -z (hàng trên ảnh = +y ở các mặt bên)
    ENV = new THREE.CubeTexture([face((u, v) => [1, -v, -u]), face((u, v) => [-1, -v, u]), face((u, v) => [u, 1, v]), face((u, v) => [u, -1, -v]), face((u, v) => [u, -v, 1]), face((u, v) => [-u, -v, -1])]);
    ENV.needsUpdate = true;
    return ENV;
  }

  const GLSL_COMMON = `
varying vec3 vRest; varying vec3 vObjN; varying vec3 vRef; varying vec3 vCr;
uniform vec4 uA, uB, uC, uD, uE, uF, uG, uR, uI, uW;
uniform vec4 uTk; uniform vec4 uBk; uniform vec4 uBk2;
uniform vec4 uAx;
uniform vec4 uPn, uPy, uPc;
// kiểu dáng: x = 0 thường, 1 bán tải, 2 hatchback, 3 van thùng kín; y = nửa rộng cửa hậu; z = y biển số sau
uniform vec4 uSt;
// trục 2 cần gạt mưa: x trái, x phải, y, z (w = 0: không có — xe tải)
uniform vec4 uWp;
uniform vec4 uH0, uH1, uH2, uT0, uT1, uT2, uK0, uK1, uK2, uN0, uN1, uN2, uO0, uO1, uO2;
// vạch mảnh khử răng cưa, mờ dần khi nhỏ hơn 1 điểm ảnh (giữ độ tối trung bình, không nhấp nháy)
float aaLine(float d, float w) { float f = clamp(fwidth(d), 1e-4, 0.06); return (1.0 - smoothstep(w * 0.5 - f, w * 0.5 + f, abs(d))) * clamp(w / (f * 2.0), 0.0, 1.0); }
// vùng d < 0, mép khử răng cưa
float fillAA(float d) { float f = clamp(fwidth(d), 1e-4, 0.06); return 1.0 - smoothstep(-f, f, d); }
// giao 2 nửa mặt phẳng (a < 0 và b < 0) có bo góc bán kính r -> khoảng cách có dấu (âm = bên trong)
float rmax(float a, float b, float r) { vec2 q = vec2(a, b) + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdBox2(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// khoảng cách có dấu tới tứ giác (IQ)
#define PEDGE(vi, vj) { vec2 e = vj - vi, w = p - vi; vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0); d = min(d, dot(q, q)); bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x); if (all(c) || all(not(c))) s = -s; }
float sdPoly4(vec2 p, vec4 a, vec4 b) {
  vec2 v0 = a.xy, v1 = a.zw, v2 = b.xy, v3 = b.zw; float d = dot(p - v0, p - v0), s = 1.0;
  PEDGE(v0, v3) PEDGE(v1, v0) PEDGE(v2, v1) PEDGE(v3, v2)
  return s * sqrt(d);
}
// lỗ khoét cho cụm chi tiết: (a, b) tứ giác lõi trên mặt chiếu, c = (dx, bo góc, zMin, dz)
float featD(vec4 a, vec4 b, vec4 c) {
  if (c.y <= 0.0 || (vRest.z - c.z) * c.w < 0.0) return 1e3;
  vec2 uv = vec2((abs(vRest.x) - c.x * c.w * vRest.z) / sqrt(1.0 + c.x * c.x), vRest.y);
  return sdPoly4(uv, a, b) - c.y;
}
// mạng vết nứt kính: khoảng cách tới cạnh ô voronoi (mảnh vỡ đa giác), mảnh nhỏ dần về tâm va
vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float crackEdge(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), o = h22(n + g), r = g + o - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; } }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 g = mg + vec2(float(i), float(j)), o = h22(n + g), r = g + o - f; if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
  return md;
}
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 1.7) + 0.125 * vnoise(p * 4.07 + 3.1) + 0.0625 * vnoise(p * 8.13 + 5.3); }
// dập nổi theo trường cao độ h (đạo hàm màn hình, không cần UV / tiếp tuyến): tôn gợn, vỏ cam, mép sứt
vec3 civBump(vec3 sp, vec3 n, float h) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1); vec2 dh = vec2(dFdx(h), dFdy(h));
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}
// đốm ngẫu nhiên trong lưới ô 3D cỡ cell: khoảng cách tới tâm đốm gần nhất (chia bán kính đốm), ngẫu nhiên 0..1 của đốm
// (đốm bán kính < nửa ô, tâm trong ô -> chỉ cần xét 2 x 2 x 2 ô quanh điểm)
vec2 civSpot(vec3 p, float cell, float dens) {
  vec3 b = floor(p / cell - 0.5); float best = 9.0, rr = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 q = b + vec3(mod(float(k), 2.0), mod(floor(float(k) / 2.0), 2.0), floor(float(k) / 4.0));
    float h = hash3(q * 1.37 + 0.11);
    if (h > dens) continue;
    vec3 ctr = (q + vec3(hash3(q + 3.1), hash3(q + 7.7), hash3(q + 11.3))) * cell;
    float rad = cell * (0.18 + 0.3 * hash3(q + 19.1));
    float d = length(p - ctr) / rad;
    if (d < best) { best = d; rr = hash3(q + 23.9); }
  }
  return vec2(best, rr);
}
// phủ một lớp vật liệu (màu, kim loại, nhám, lớp bóng) lên điểm đang tô theo tỉ lệ k
#define LAY(k, col, m, r, cc) { float k_ = (k); cO = mix(cO, (col), k_); mO = mix(mO, (m), k_); rO = mix(rO, (r), k_); ccO = mix(ccO, (cc), k_); }
`;
  // DẤU THỜI GIAN (dùng chung thân dưới / khoang kính): uW = (bụi, tuổi, gỉ, seed). Cần sẵn Nn, y, paintK, yBot (mép
  // dưới thân), yBelt (đường vai), dustK
  const GLSL_CRUSH = `
  if (vCr.z > 0.05 || uTk.w > 0.0) {
    // xác bị cán (uTk.w): chỉ vùng thân thực sự bị ép mới bụi bẩn / tróc sơn, phần còn nguyên giữ sơn (không loang khắp xe)
    float kc = max(smoothstep(0.05, 0.5, vCr.z), 0.5 * uTk.w * smoothstep(0.0, 0.15, vCr.z));
    vec3 wpc = vRest * 1.7 + uW.w;
    float crease = clamp(length(fwidth(normalize(vObjN))) * 5.0, 0.0, 1.0) * kc;
    // vảy sơn tróc nhỏ (vài cm) tập trung dọc nếp gấp — không loang mảng lớn như rằn ri
    float scuff = crease * smoothstep(0.6, 0.78, vnoise(wpc * 2.3)) * paintK;
    float flake = kc * smoothstep(0.35, 0.75, crease / max(kc, 0.01)) * smoothstep(0.52, 0.64, vnoise(wpc * 3.1) + 0.2 * vnoise(wpc * 9.0)) * paintK;
    cO *= 1.0 - 0.5 * crease;                       // nếp gập khuất sáng, bụi kẹt trong nếp
    LAY(flake, mix(vec3(0.46, 0.46, 0.44), vec3(0.2, 0.1, 0.05), vnoise(wpc * 3.0) * (0.2 + 0.8 * uW.y)), 0.2, 0.8, 0.0)   // sơn bong: lớp lót xám (xe cũ: gỉ)
    LAY(scuff, vec3(0.62, 0.62, 0.6), 0.95, 0.38, 0.0)   // gờ bị cào lộ tôn trần
    // bụi đất / muội xích: lớp mỏng phủ đều mặt trên, đậm hơn trong nếp, không thành đốm to
    float grime = kc * (0.3 + 0.25 * vnoise(wpc * 1.7) + 0.4 * crease) * step(-0.2, Nn.y);
    LAY(grime * 0.5, vec3(0.2, 0.18, 0.15), 0.0, 0.95, 0.0)
    ccO *= 1.0 - 0.8 * kc;
  }
`;
const GLSL_WEATHER = `
  float bumpH = 0.0, ccR = 0.0;   // cao độ dập nổi (đv) / độ nhám cộng thêm cho lớp bóng — dùng ở bước pháp tuyến / ánh sáng
  {
    vec3 wp = vRest + uW.w * 13.7;
    float up = clamp(Nn.y, 0.0, 1.0), age = uW.y;
    // Tán sắc góc nhìn quang học mượt mà của sơn kim loại tôn thép (chỉ tác động lên vùng sơn tôn, không chạm vào kính)
    if (paintK > 0.05) {
      float viewIncidence = clamp(abs(dot(normalize(vViewPosition), Nn)), 0.0, 1.0);
      cO = mix(cO * 0.82, cO * 1.08, pow(viewIncidence, 1.4));
    }
    float nB = fbm(wp * 0.22), nF = fbm(wp * 0.95 + 4.0), nS = fbm(vec3(wp.x * 0.7, wp.y * 0.07, wp.z * 0.7) + 2.0);
    // tấm tôn thay thế (cửa / vè / capô lấy từ xe khác, hoặc mới gò xong chỉ có sơn lót): khác màu, sơn lót lì không bóng.
    // uPn = (z đầu, z cuối, bên x, kiểu: 1 tấm sườn, 2 capô), uPy = (y thấp, y cao), uPc = (màu, độ lì)
    if (uPn.w > 0.5) {
      float inPn = uPn.w < 1.5
        ? step(uPn.x, z) * step(z, uPn.y) * step(0.0, x * uPn.z) * smoothstep(0.3, 0.5, abs(Nn.x)) * step(uPy.x, y) * step(y, uPy.y)
        : step(uPn.x, z) * smoothstep(0.2, 0.45, Nn.y) * step(uPy.x, y);
      inPn *= paintK;
      cO = mix(cO, uPc.rgb * (0.92 + 0.16 * nF), inPn); rO = mix(rO, mix(rO, 0.74, uPc.w), inPn); mO = mix(mO, mO * (1.0 - 0.8 * uPc.w), inPn); ccO *= 1.0 - inPn * uPc.w;
    }
    float lum = dot(cO, vec3(0.3, 0.59, 0.11));
    ccO *= 1.0 - 0.6 * age * paintK; rO = mix(rO, 0.72, 0.4 * age * paintK); cO = mix(cO, vec3(lum), 0.18 * age * paintK);
    // sơn bạc màu, phấn hoá ở mặt hứng nắng (nóc, capô, nắp cốp)
    float fade = age * pow(up, 1.5) * (0.55 + 0.45 * nB);
    LAY(fade * paintK, mix(cO, vec3(lum * 1.05 + 0.06), 0.55), mO * 0.4, 0.7, 0.15)
    // lớp bóng bong tróc thành mảng, lộ sơn lót nhạt
    float peel = smoothstep(0.45, 0.9, age) * up * smoothstep(0.66, 0.675, fbm(wp * 0.55 + 2.0) + 0.12 * nF);
    LAY(peel * paintK, mix(cO, vec3(lum * 1.1 + 0.1), 0.5), 0.0, 0.9, 0.0)
    // gỉ sét: mép dưới thân và vòm bánh xe lởm chởm tự nhiên, không bị quầng loang mờ nhân tạo
    float botRustDist = y - yBot;
    float rustEdge = smoothstep(1.1, 0.0, botRustDist) * (0.35 + 0.85 * nF) * (0.5 + 0.5 * vnoise(wp * 2.0));
    // mặt hứng nắng ít gỉ thành đảo hơn mép dưới (nước đọng, bùn bám); gỉ nâu sẫm loang, chỉ lõi mới ngả cam
    float rustM = rustEdge * 1.25 + smoothstep(0.66, 0.88, fbm(wp * 0.6 + 7.0)) * (0.55 + 0.45 * (1.0 - up)) + peel * 0.8;
    float rust = clamp(uW.z * smoothstep(0.24, 0.52, rustM * (0.38 + 0.82 * nF)), 0.0, 1.0);
    float rcN = fbm(wp * 2.5);
    vec3 rc = mix(vec3(0.055, 0.024, 0.011), vec3(0.18, 0.072, 0.03), rcN * rcN * 1.3);
    LAY(rust * paintK, rc, 0.0, 0.95, 0.0)
    // gỉ mục thủng: xe bỏ hoang lâu năm, mép dưới sườn / vòm bánh / chân cửa ăn thủng thành lỗ tối viền tôn mục nâu cam
    if (uW.z > 0.6) {
      float rot = (uW.z - 0.6) * 2.5 * smoothstep(0.85, 0.25, botRustDist) * paintK;
      float hN = vnoise(wp * 3.1) * 0.7 + vnoise(wp * 7.3) * 0.3;
      float hole = rot * smoothstep(0.6, 0.64, hN);
      float rim = rot * smoothstep(0.5, 0.6, hN) * (1.0 - hole);
      LAY(rim, vec3(0.2, 0.08, 0.032), 0.0, 1.0, 0.0)
      LAY(hole, vec3(0.012, 0.01, 0.008), 0.0, 1.0, 0.0)
    }
    // vệt nước mưa bẩn chảy dọc từ mép kính xuống cửa
    float grime = age * (1.0 - up) * smoothstep(0.5, 0.74, nS) * smoothstep(yBelt - 4.0, yBelt - 0.2, y) * 0.6;
    cO = mix(cO, vec3(0.11, 0.095, 0.075), grime * paintK); rO = mix(rO, 0.75, grime); ccO *= 1.0 - 0.5 * grime;
    // xước sơn mảnh
    float sc = age * (1.0 - up) * aaLine(fract(dot(vRest.zy, vec2(0.93, 0.31)) * 1.3 + nF * 0.8) - 0.5, 0.03) * smoothstep(0.66, 0.7, fbm(wp * 0.45 + 9.0));
    LAY(sc * paintK, vec3(0.5, 0.5, 0.48), 0.4, 0.5, 0.0)
    // bụi đất: dày ở thân dưới (bánh hắt), lớp bụi mỏng loang trên mặt nằm ngang
    float dust = uW.x * clamp(smoothstep(5.0, 1.2, y) * (0.45 + 0.75 * nB) + up * 0.85 * smoothstep(0.38, 0.72, nB) + 0.22 * age * nF, 0.0, 1.0);
    LAY(dust * dustK, vec3(0.42, 0.38, 0.31), 0.0, 0.92, 0.0)
    // ---- VI CHI TIẾT KHI NHÌN GẦN: chi tiết nhỏ hơn 1 điểm ảnh tắt dần (ở xa không nhấp nháy, không tốn phép tính)
    float pxw = length(fwidth(vRest)), near1 = smoothstep(0.1, 0.03, pxw), near2 = smoothstep(0.035, 0.012, pxw);
    // tôn dập / gò / lắp ráp không phẳng tuyệt đối: gợn sóng dài làm vệt phản chiếu lượn nhẹ (xe nhựa đúc thì thẳng tắp)
    bumpH += 0.02 * (vnoise(vRest * vec3(0.5, 0.8, 0.5) + uW.w) - 0.5);
    // lớp bóng: độ nhám loang (chỗ được lau / chỗ bụi bám / chỗ phơi nắng), xe cũ lì hơn
    ccR += paintK * (0.04 + 0.22 * age) * vnoise(wp * 1.3);
    if (near1 > 0.0) {
      // vỏ cam lớp bóng (chỉ thấy khi zoom sát, trong vùng loá sáng)
      bumpH += paintK * near2 * 0.0022 * (vnoise(vRest * 11.0) - 0.5);
      // vệt xoáy rửa xe / lau bằng giẻ bẩn: vòng tròn mảnh chỉ hiện trong vùng phản chiếu
      vec2 sw = civSpot(vRest, 1.6, 0.85);
      float swirl = near2 * paintK * (1.0 - smoothstep(0.75, 1.0, sw.x)) * aaLine(fract(sw.x * 9.0 + sw.y * 3.0) - 0.5, 0.08) * (0.35 + age);
      ccR += 0.3 * swirl; ccO *= 1.0 - 0.2 * swirl;
      // cặn giọt mưa khô trên mặt nằm ngang: vành khoáng mờ méo, lòng đốm hơi đục — chỉ thấy rõ trong vùng phản chiếu
      vec2 ws = civSpot(vRest + 0.06 * vec3(vnoise(vRest * 9.0), 0.0, vnoise(vRest * 9.0 + 5.0)), 0.34, 0.3);
      float wring = near1 * up * (smoothstep(0.55, 0.85, ws.x) * (1.0 - smoothstep(0.85, 1.0, ws.x)) + 0.25 * (1.0 - smoothstep(0.6, 1.0, ws.x))) * (0.15 + 0.35 * uW.x + 0.2 * age);
      LAY(wring * dustK * 0.5, vec3(0.55, 0.53, 0.49), 0.0, 0.7, 0.4)
      ccR += 0.25 * wring;
      // sứt đá: mặt trước đứng của đầu xe (cản, mặt nạ, dưới đèn), mép trước capô, chân cửa sau bánh trước — vết 2-6 mm lộ
      // lót xám sẫm, xe cũ gỉ nâu
      float frontK = smoothstep(0.45, 0.75, Nn.z) * step(uAx.x - 1.0, z) * step(y, uAx.z * 2.6);
      float rockK = smoothstep(0.6, 0.85, abs(Nn.x)) * step(uAx.x - uAx.z - 4.5, z) * step(z, uAx.x - uAx.z) * step(y, 3.6);
      vec2 ch = civSpot(vRest, 0.11, (0.1 + 0.3 * age) * max(frontK, rockK) + 0.004);
      float chip = near1 * paintK * (1.0 - smoothstep(0.55, 1.0, ch.x));
      LAY(chip, mix(vec3(0.3, 0.3, 0.29), vec3(0.16, 0.075, 0.035), step(0.7 - 0.45 * age, ch.y)), 0.1, 0.85, 0.0)
      ccO *= 1.0 - chip;
      bumpH -= 0.0008 * chip;
      // phân chim (xe đỗ lâu dưới cây / dây điện): vệt trắng xám đục loang trên nóc / capô / cốp
      vec2 bd = civSpot(vRest * vec3(1.0, 1.0, 0.7), 2.4, 0.2 * age);
      // vệt bắn loang lở: mép răng cưa nhiều tia nhỏ, trắng ngà ngả xám, lõi sẫm, đã khô nứt
      float bn = vnoise(vRest * 5.0) * 0.6 + vnoise(vRest * 17.0) * 0.4;
      float bird = up * paintK * (1.0 - smoothstep(0.35, 0.75, bd.x + 0.55 * bn));
      LAY(bird * 0.75, mix(vec3(0.66, 0.65, 0.6), vec3(0.28, 0.26, 0.21), smoothstep(0.25, 0.0, bd.x) * 0.8 + 0.2 * step(0.7, bn)), 0.0, 0.9, 0.0)
    }
    if (uTk.w > 0.0) {
      float along = vCr.y;
      float tr = smoothstep(0.3, 0.7, vCr.x) * uTk.w * step(0.0, Nn.y + 0.3);
      float cleat = smoothstep(0.3, 0.5, abs(fract(along / 1.2) - 0.5) * 2.0);
      float mud = tr * clamp(0.55 + 0.6 * nB - 0.3 * cleat, 0.0, 1.0);
      LAY(mud, mix(vec3(0.2, 0.16, 0.11), vec3(0.09, 0.075, 0.06), cleat), 0.0, 0.95, 0.0)
      // tróc sơn lộ tôn trần sáng ở gờ bị mắt xích miết
      float scr = tr * (1.0 - cleat) * smoothstep(0.62, 0.7, nF);
      LAY(scr, vec3(0.55, 0.55, 0.54), 0.9, 0.35, 0.0)
      float oil = uTk.w * smoothstep(9.0, 14.0, vRest.z) * smoothstep(5.0, 1.5, y) * smoothstep(0.45, 0.7, nS);
      LAY(oil, vec3(0.025, 0.02, 0.015), 0.2, 0.15, 0.8)
    }
  }
`;
  // Thân dưới: khe cửa / capô / cốp / cản, nắp bình xăng, đèn pha & đèn hậu nhiều lớp, lưới tản nhiệt, hốc gió, đèn
  // sương mù, nhựa đen mép dưới, sàn khoang nội thất, rồi phủ dấu thời gian
  const GLSL_BODY = `
  float holeD = min(min(featD(uH0, uH1, uH2), featD(uT0, uT1, uT2)), min(min(featD(uK0, uK1, uK2), featD(uN0, uN1, uN2)), featD(uO0, uO1, uO2)));
  if (holeD < 0.0) discard;
  vec3 Nn = normalize(vObjN);
  float x = vRest.x, y = vRest.y, z = vRest.z, ax = abs(x);
  vec3 cO = diffuseColor.rgb; float mO = metalness, rO = roughness, ccO = 1.0;
  cO *= 1.0 - 0.85 * fillAA(holeD - 0.035);   // khe hở quanh cụm đèn / lưới (~4 mm)
  float seam = 0.0, gap = 0.07, hoodEdge = vRef.x - 0.95;
  if (abs(Nn.x) > 0.45) {
    float yIn = step(uB.x, y) * step(y, vRef.z - 0.3);
    if (uAx.w > 2.5) {
      // Khe cửa cabin xe ben đầu bằng: khe chìm sắc nét, ăn khớp từ thân dưới lên cabin
      float doorRear = aaLine(z - 7.85, gap) * step(4.9, y) * step(y, vRef.z - 0.1);
      float doorFront = aaLine(z - 19.1, gap) * step(4.9, y) * step(y, vRef.z - 0.1);
      float dAxle = abs(z - uAx.x);
      float rArch = uAx.z + 0.4;
      float rArchCurve = rArch + 0.35;
      float inArch = step(dAxle, rArchCurve + 0.05);
      float archDist = length(vec2(z - uAx.x, y - 0.6));
      float doorBotArch = aaLine(archDist - rArchCurve, gap) * inArch * step(4.9, y);
      float doorBotFlat = aaLine(y - 5.05, gap) * (1.0 - inArch) * step(7.85, z) * step(z, 19.1);
      seam = max(seam, max(max(doorRear, doorFront), max(doorBotArch, doorBotFlat)));
    } else if (uAx.w > 1.5) {
      // Khe cửa cabin xe tải và nắp ca-pô
      float doorRear = aaLine(z - 5.8, gap) * step(3.65, y) * step(y, vRef.z - 0.15);
      float doorFront = aaLine(z - 18.2, gap) * step(3.65, y) * step(y, vRef.z - 0.15);
      float doorBot = aaLine(y - 3.85, gap) * step(5.8, z) * step(z, 18.2);
      seam = max(seam, max(max(doorRear, doorFront), doorBot));
    } else {
      seam = max(seam, yIn * max(aaLine(z - uA.x, gap), max(aaLine(z - uA.y, gap), aaLine(z - uA.z, gap))));
      seam = max(seam, step(uA.z, z) * step(z, uA.x) * aaLine(y - uB.x, gap));
      seam = max(seam, step(y, uB.y) * aaLine(z - uA.w, gap));
      seam = max(seam, step(y, uB.w) * aaLine(z - uB.z, gap));
      if (x > 0.0) seam = max(seam, aaLine(sdBox2(vec2(z, y) - uD.xy, uD.zw, 0.15), gap));
    }
  }
  if (Nn.y > 0.3) {
    float hf = uC.y - (uAx.w > 0.5 && uAx.w < 1.5 ? 0.008 : 0.025) * ax * ax;   // SUV: khe capô gần thẳng ngang
    seam = max(seam, step(uC.x, z) * step(z, hf) * aaLine(ax - hoodEdge, gap));
    seam = max(seam, step(ax, hoodEdge) * step(uC.x, z) * aaLine(z - hf, gap));
    seam = max(seam, step(z, uC.z) * aaLine(ax - hoodEdge, gap));
    seam = max(seam, step(ax, hoodEdge) * aaLine(z - (uC.z - 0.08), gap));
  }
  if (Nn.z < -0.35) {
    if (uAx.w > 1.5) {
      // Xe tải: đuôi bửng thùng phẳng, không vẽ khe nắp cốp sedan/suv
    } else if (uAx.w > 0.5) {
      float tgEdge = uSt.y;
      seam = max(seam, step(y, vRef.z - 0.15) * step(uB.w, y) * aaLine(ax - tgEdge, gap));
      seam = max(seam, step(ax, tgEdge) * aaLine(y - uB.w, gap));
      // van: 2 cánh cửa hậu mở kiểu cánh én -> khe giữa
      if (uSt.x > 2.5) seam = max(seam, step(uB.w, y) * aaLine(x, gap));
    } else {
      float lt = vRef.z - uR.w;
      seam = max(seam, step(ax, uR.y) * aaLine(y - uC.w, gap));
      seam = max(seam, step(uC.w, y) * step(y, lt) * aaLine(ax - uR.y, gap));
      seam = max(seam, step(uR.y, ax) * step(ax, hoodEdge) * aaLine(y - lt - 0.06, gap));
    }
  }
  if (uAx.w > 0.5 && uAx.w < 1.5 && uSt.x < 1.5) {
    float dF = length(vec2(z - uAx.x, y - uAx.z));
    float dR = length(vec2(z - uAx.y, y - uAx.z));
    float rIn = uAx.z + 0.65, rOut = rIn + 0.54;
    seam = max(seam, (aaLine(dF - rOut, gap) + aaLine(dR - rOut, gap)) * step(uAx.z * 0.45, y) * step(0.18, abs(Nn.x)));
    seam = max(seam, step(uAx.y + rOut - 0.1, z) * step(z, uAx.x - rOut + 0.1) * aaLine(y - (vRef.y + 0.95), gap) * step(0.22, abs(Nn.x)));
  }
  float bump = step(uA.w, z) * step(y, uE.x) + step(z, uB.z) * step(y, uE.y);
  seam = max(seam, step(uA.w, z) * aaLine(y - uE.x, gap) + step(z, uB.z) * aaLine(y - uE.y, gap));
  cO *= 1.0 - 0.06 * bump; rO = mix(rO, rO + 0.08, bump);
  cO *= 1.0 - 0.94 * seam; rO = mix(rO, 0.9, seam); ccO *= 1.0 - seam;
  // mặt nóc thân dưới nằm trong khoang kính = taplô / tapi cửa / chắn nắng sau: nhựa tối
  float inCab = step(ax, vRef.x - uI.x) * step(uI.y, z) * step(z, uI.z) * step(0.3, Nn.y);
  LAY(inCab, vec3(0.03, 0.028, 0.026), 0.0, 0.9, 0.0)
  if (uTk.w > 0.0 && inCab > 0.0) {
    // xác bị cán: kính vụn rạn trắng phủ lên nội thất nát
    vec2 gp = vec2(x + z * 0.3, z * 1.1) * 2.2;
    float cr = 1.0 - smoothstep(0.03, 0.09, abs(vnoise(vec3(gp, 1.0)) - 0.5)) * (1.0 - smoothstep(0.03, 0.09, abs(vnoise(vec3(gp * 2.3, 4.0)) - 0.5)));
    float cov = smoothstep(0.25, 0.45, vnoise(vec3(vRest.xz * 0.5, 9.0)));
    // vụn kính cường lực: hạt nhỏ lấm tấm, ánh xanh xám (không trắng loá như tuyết)
    float crumb = step(0.88, hash3(floor(vRest * 11.0))) * cov;
    LAY(inCab * uTk.w * crumb, vec3(0.42, 0.48, 0.48), 0.3, 0.12, 1.0)
    LAY(inCab * uTk.w * (1.0 - crumb), mix(vec3(0.12, 0.11, 0.1), vec3(0.25, 0.23, 0.2), vnoise(vec3(vRest.xz * 2.0, 3.0))), 0.0, 0.9, 0.0)
  }
  // Nhựa đen kỹ thuật cho mép dưới cản và ốp thân xe
  float low = fillAA(y - (vRef.y + 0.3));
  low = max(low, step(uF.x + 1.2, z) * fillAA(y - (uG.w - 0.5)));
  low = max(low, step(z, uR.x - 0.6) * fillAA(y - 3.1));
  low *= 1.0 - inCab;
  LAY(low, vec3(0.038, 0.040, 0.042), 0.02, 0.84, 0.04)
  float featK = max(inCab, low);
  // ốp nhựa vòm bánh / bậc / crôm sườn / ốp gầm: chỉ SUV & bán tải (hatchback, van thân sơn trơn)
  if (uAx.w > 0.5 && uAx.w < 1.5 && uSt.x < 1.5) {
    float dF = length(vec2(z - uAx.x, y - uAx.z));
    float dR = length(vec2(z - uAx.y, y - uAx.z));
    float rIn = uAx.z + 0.65, rOut = rIn + 0.54;
    float inArch = (fillAA(dF - rOut) * fillAA(rIn - dF) + fillAA(dR - rOut) * fillAA(rIn - dR)) * step(uAx.z * 0.45, y) * step(0.18, abs(Nn.x));
    float rocker = step(uAx.y + rOut - 0.15, z) * step(z, uAx.x - rOut + 0.15) * fillAA(y - (vRef.y + 0.95)) * step(0.22, abs(Nn.x));
    float cladK = max(inArch, rocker) * (1.0 - inCab);
    LAY(cladK, vec3(0.040, 0.042, 0.045), 0.02, 0.86, 0.04)
    featK = max(featK, cladK);

    float sideChrome = step(uAx.y + rOut + 0.2, z) * step(z, uAx.x - rOut - 0.2) * fillAA(abs(y - (vRef.y + 0.82)) - 0.04) * step(0.3, abs(Nn.x));
    LAY(sideChrome, vec3(0.85, 0.87, 0.90), 1.0, 0.15, 1.0)
    featK = max(featK, sideChrome);

    float fSkid = step(uA.w, z) * fillAA(ax - 3.2) * fillAA(y - 4.65) * (1.0 - fillAA(y - (vRef.y + 0.15)));
    float fRibs = fSkid * fillAA(abs(fract(ax * 1.5 + 0.5) - 0.5) - 0.18);
    LAY(fSkid, vec3(0.76, 0.78, 0.82), 0.85, 0.28, 0.8)
    cO = mix(cO, cO * 0.75, fRibs);
    featK = max(featK, fSkid);

    float rearValance = step(z, uB.z) * fillAA(y - 4.45) * (1.0 - fillAA(y - (vRef.y + 0.08)));
    float rearRib = rearValance * fillAA(abs(fract(ax * 0.72 + 0.5) - 0.5) - 0.34);
    LAY(rearValance, vec3(0.045, 0.05, 0.052), 0.06, 0.82, 0.08)
    cO = mix(cO, cO * 0.82, rearRib * 0.16);
    featK = max(featK, rearValance);
    float rearSkid = step(z, uB.z) * fillAA(ax - 4.85) * fillAA(abs(y - 3.48) - 0.34);
    LAY(rearSkid, vec3(0.48, 0.5, 0.51), 0.72, 0.4, 0.62)
    featK = max(featK, rearSkid);
  }
  // nẹp crôm giữa 2 đèn hậu trên nắp cốp; tấm phản quang đỏ trên cản sau
  if (z < uR.x && Nn.z < -0.3 && uAx.w < 1.5) {
    float yt = vRef.z - uR.w;
    float suvGarnish = 0.0;
    float sedanGarnish = 0.0;
    LAY(suvGarnish, vec3(0.025, 0.03, 0.034), 0.15, 0.42, 0.28)
    LAY(sedanGarnish, vec3(0.8), 1.0, 0.12, 1.0)
    float platePocket = uAx.w > 0.5 ? fillAA(sdBox2(vec2(x, y - uSt.z), vec2(2.42, 0.6), 0.12)) : fillAA(sdBox2(vec2(x, y - uSt.z), vec2(2.65, 0.72), 0.18));
    LAY(platePocket, vec3(0.035, 0.04, 0.043), 0.08, 0.72, 0.12)
    // sedan: ốp khuếch tán đen dưới cản sau, vạt giữa có gân dọc
    float sedanDiff = (1.0 - uAx.w) * fillAA(y - (4.15 - 0.35 * smoothstep(2.2, 4.6, ax)));
    float diffRib = sedanDiff * step(ax, 3.0) * fillAA(abs(fract(ax * 0.9 + 0.5) - 0.5) - 0.42);
    LAY(sedanDiff, vec3(0.04, 0.043, 0.046), 0.05, 0.78, 0.1)
    cO = mix(cO, cO * 0.6, diffRib);
    featK = max(featK, sedanDiff);
    float rf = fillAA(sdBox2(vec2(ax - uG.x * 2.0, y - (uAx.w > 0.5 ? 4.1 : 4.55)), vec2(0.65, 0.1), 0.08));
    LAY(rf, vec3(0.4, 0.01, 0.01), 0.0, 0.2, 1.0)
    featK = max(featK, max(max(suvGarnish, sedanGarnish), max(platePocket, rf)));
  }
  // xi nhan bên trên tai xe trước
  if (abs(Nn.x) > 0.6) {
    float kt = fillAA(sdBox2(vec2(z - (uA.w - 1.0), y - (vRef.z - 1.3)), vec2(0.36, 0.11), 0.1));
    LAY(kt, vec3(0.55, 0.26, 0.03), 0.0, 0.15, 1.0)
    featK = max(featK, kt);
  }
  float paintK = 1.0 - featK, yBot = vRef.y, yBelt = vRef.z, dustK = 1.0;
` + GLSL_WEATHER + GLSL_CRUSH + `
  diffuseColor.rgb = cO;
`;
  // Khoang kính: kính chắn gió / kính hậu / kính hông (cửa trước, cửa sau + kính tam giác sau), viền cao su đen quanh
  // ô kính, cột B ốp đen bóng; kính bám bụi mờ, kính chắn gió có thể rạn nứt (uE: tâm x, z, bán kính, bật)
  const GLSL_CABIN = `
  vec3 Nn = normalize(vObjN);
  float x = vRest.x, y = vRest.y, z = vRest.z;
  vec3 cO = diffuseColor.rgb; float mO = metalness, rO = roughness, ccO = 1.0;
  float u = vRef.x, v = vRef.y, seam = 0.0;
  float dW = rmax(rmax(u + uA.x, uA.y - z, 0.45), 0.25 - v, 0.2);
  float dR = rmax(rmax(u + uA.z, z - uA.w, 0.45), 0.25 - v, 0.2);
  float side = rmax(0.22 - u, 0.3 - v, 0.3);
  float zC = uB.x + uB.y * (y - uB.z);
  float dF = rmax(side, uC.x + 0.5 - z, 0.3);
  float dRr;
  if (uAx.w > 1.5) {
    // Xe tải cabin đơn: chỉ có cửa trước, không có ô kính cửa sau
    dRr = 1e3;
  } else if (uSt.x > 2.5) {
    // van thùng kín: kính chỉ ở cửa cabin; cửa hậu 2 cánh mỗi cánh một ô kính nửa trên, khung tôn dày quanh
    dRr = 1e3;
    dR = max(max(dR, max(11.3 - y, y - 14.9)), max(0.4 - abs(x), abs(x) - (uSt.y - 0.75)));
  } else if (uAx.w > 0.5) {
    // SUV: Ô kính cửa sau và ô kính đuôi xe tách biệt rõ ràng bởi cột C sơn màu thân xe khỏe khoắn
    float zCPillF = uC.y + 0.55; // mép trước cột C (-6.6)
    float zCPillR = uC.y - 0.55; // mép sau cột C (-7.7)
    float dDoorR = rmax(rmax(side, z - (uC.x - 0.5), 0.28), zCPillF - z, 0.28);
    float dQtr = rmax(rmax(side, z - zCPillR, 0.28), zC - z, 0.28);
    dRr = min(dDoorR, dQtr);
  } else {
    dRr = rmax(rmax(side, z - (uC.x - 0.5), 0.3), zC - z, 0.32);
  }
  if (uAx.w > 1.5) {
    // Xe tải: Kính chắn gió trước rộng rãi vuốt lướt gió, kính hậu buồng lái và ô cửa kính hông hai bên sắc nét
    dW = max(dW, max(10.8 - y, y - 16.7));
    dW = max(dW, abs(x) - 6.35);
    dR = max(dR, max(12.2 - y, y - 15.6));
    dR = max(dR, abs(x) - 4.4);
    // Cửa sổ hông buồng lái: chân kính phẳng cao hơn đường vai cửa, mép trước nghiêng theo cột A
    if (uAx.w > 2.5) {
      // Xe ben cabin đầu bằng: kính hông chạy tới sát cột A nghiêng, chân kính trên đường vai cửa
      dF = max(dF, max(12.1 - y, y - 15.95));
      dF = max(dF, max(8.35 - z, z - (19.0 - 0.435 * (y - 11.5))));
    } else {
      // Xe tải thùng: cột sau cabin sơn màu xe dày dặn, cột A nghiêng khí động học
      float frontSlope = 18.2 - 0.65 * (y - 11.0);
      dF = max(dF, max(11.0 - y, y - 16.3));
      dF = max(dF, max(6.6 - z, z - frontSlope));
    }
  }
  float d = min(min(dW, dR), min(dF, dRr));
  float f = clamp(fwidth(d), 1e-4, 0.06);
  float glassK = 1.0 - smoothstep(-f, f, d);
  float rub = (1.0 - smoothstep(0.045 - f, 0.045 + f, d)) * (1.0 - glassK);
  float pil = (uAx.w > 1.5 || uSt.x > 2.5 ? 0.0 : 1.0) * (1.0 - smoothstep(-f, f, side)) * (1.0 - smoothstep(0.5 - f, 0.5 + f, abs(z - uC.x)));
  float dv = (uAx.w < 0.5 ? 1.0 : 0.0) * (1.0 - smoothstep(0.12 - f, 0.12 + f, abs(z - uC.y))) * glassK; glassK -= dv;
  // Thanh nẹp chia ô kính tam giác phụ (quarter vent window divider) đặc trưng của xe tải và xe ben
  float ventBar = ((uAx.w > 1.5 && uAx.w < 2.5) ? aaLine(z - 15.8, 0.08) : (uAx.w > 2.5 ? aaLine(z - 16.6, 0.08) : 0.0)) * glassK;
  glassK -= ventBar;
  // Tôn chân kính, cột C (trên SUV) và cột sau thuộc thân sơn. Không gộp cả mảng vào trim đen;
  // chỉ gioăng mảnh quanh mép kính và cột B mới dùng vật liệu nẹp tối màu.
  float trimK = max(max(max(rub, pil), dv), ventBar);
  // viền gốm đen quanh kính chắn gió / kính hậu + dải chấm nhỏ dần vào trong
  float dWR = min(dW, dR), fw = clamp(fwidth(dWR), 1e-4, 0.06);
  float frit = smoothstep(-0.12 - fw, -0.12 + fw, dWR);
  vec2 cell = fract(vec2(x, (z + y) * 0.7071) / 0.16) - 0.5;
  // Chấm frit chỉ thuộc kính chắn gió/kính hậu. Bản cũ chỉ lọc theo z nên tràn thành họa tiết chéo kín kính cửa trước.
  float dotMask = step(uA.y - 1.0, z) * step(0.55, abs(Nn.z));
  float dots = fillAA(length(cell) - 0.4 * clamp((dWR + 0.26) / 0.14, 0.0, 1.0)) * step(-0.26, dWR) * dotMask;
  float fritK = glassK * max(frit, dots) * (1.0 - step(0.3, vCr.z));   // viền gốm chỉ mất khi kính bị nghiền   // xác bị cán: kính dẹt, bỏ viền gốm (vạch đạo hàm vỡ)
  LAY(trimK, vec3(0.015, 0.016, 0.018), 0.0, 0.6, 0.3)
  float suvPrivacy = (uAx.w > 0.5 && uAx.w < 1.5 && uSt.x < 1.5 ? 1.0 : 0.0) * step(z, uC.x);
  vec3 glassColor = mix(vec3(0.14, 0.16, 0.165), vec3(0.088, 0.102, 0.115), suvPrivacy * 0.75);
  if (uAx.w > 1.5) glassColor = vec3(0.16, 0.19, 0.22);
  LAY(glassK, glassColor, 0.0, mix(0.10, 0.06, suvPrivacy), 1.0)
  LAY(fritK, vec3(0.008), 0.0, 0.3, 1.0)
  // Khe hở mép cánh cửa sau trên cột C (khớp với khe cửa thân xe ở z = -7.5) và khe cửa cabin xe tải/xe ben
  float doorSeam = (uAx.w > 0.5 && uAx.w < 1.5 ? 1.0 : 0.0) * aaLine(z - (uC.y - 0.35), 0.024) * fillAA(0.18 - u) * (1.0 - max(trimK, glassK));
  float truckDoorSeam = (uAx.w > 1.5 && uAx.w < 2.5 ? 1.0 : 0.0) * aaLine(z - 5.8, 0.026) * fillAA(0.18 - u) * (1.0 - max(trimK, glassK));
  float dumpDoorSeam = 0.0;
  if (uAx.w > 2.5) {
    float rearS = aaLine(z - 7.85, 0.028) * step(10.6, y) * step(y, 16.12);
    float topS = aaLine(y - 16.12, 0.028) * step(7.85, z) * step(z, 17.6);
    float aZ = 19.15 - 0.36 * (y - 11.75);
    float frontS = (y >= 11.75 ? aaLine(z - aZ, 0.028) * step(y, 16.12) : aaLine(z - 19.15, 0.028) * step(10.6, y));
    dumpDoorSeam = max(max(rearS, topS), frontS) * (1.0 - max(trimK, glassK)) * step(0.35, abs(Nn.x));
  }
  cO = mix(cO, cO * 0.15, max(max(doorSeam, truckDoorSeam), dumpDoorSeam));
  rO = mix(rO, 0.92, dumpDoorSeam);
  ccO *= 1.0 - dumpDoorSeam;
  float glassOnly = glassK * (1.0 - fritK);
  float alphaO = mix(1.0, uAx.w > 1.5 ? 0.58 : mix(0.55, 0.68, suvPrivacy), glassOnly);
  float paintK = 1.0 - max(trimK, glassK), yBot = -100.0, yBelt = -100.0, dustK = paintK;
` + GLSL_WEATHER + GLSL_CRUSH + `
  // kính: màng bụi loang, đọng dày ở mép dưới
  float edgeDust = 0.12 + 0.58 * smoothstep(1.0, 0.08, v);
  float gd = glassK * (0.22 + 0.62 * uW.y + 0.25 * uW.x) * clamp(edgeDust + 0.34 * fbm(vRest * 0.35 + uW.w), 0.0, 1.0);
  // kính chắn gió: 2 cung gạt mưa quét sạch hơn (lần gạt cuối), bụi bùn dồn thành viền cong ở mép ngoài cung; góc dưới
  // 2 bên và giữa phía trên ngoài tầm gạt bụi dày
  if (uWp.w != 0.0 && z > uA.y) {
    float d1 = length(vRest - vec3(uWp.x, uWp.z, uWp.w)), d2 = length(vRest - vec3(uWp.y, uWp.z, uWp.w));
    float sw1 = smoothstep(0.6, 1.0, d1) * (1.0 - smoothstep(4.95, 5.25, d1)), sw2 = smoothstep(0.6, 1.0, d2) * (1.0 - smoothstep(4.55, 4.85, d2));
    // viền bùn mép cung: dải mềm lởm chởm (cát bị lưỡi gạt đẩy dồn), không phải nét tròn đều
    float rn = vnoise(vRest * 2.3) * 0.6 + vnoise(vRest * 7.0) * 0.4;
    float swept = max(sw1, sw2), rim = max(1.0 - smoothstep(0.0, 0.55, abs(d1 - 5.25 - 0.25 * rn)), 1.0 - smoothstep(0.0, 0.55, abs(d2 - 4.85 - 0.25 * rn))) * (1.0 - swept * 0.6) * (0.5 + 0.6 * rn);
    gd = gd * (1.0 - 0.72 * swept) + glassK * rim * (0.12 + 0.25 * uW.y + 0.12 * uW.x);
  }
  float gpx = length(fwidth(vRest));
  if (gpx < 0.1) {
    float gn = smoothstep(0.1, 0.03, gpx);
    // cặn giọt nước khô li ti (vành tròn trắng đục) + vệt mưa chảy dọc kính hông
    vec2 gs = civSpot(vRest + 0.05 * vec3(vnoise(vRest * 8.0), vnoise(vRest * 8.0 + 3.0), 0.0), 0.26, 0.2);
    float gring = gn * (smoothstep(0.55, 0.85, gs.x) * (1.0 - smoothstep(0.85, 1.0, gs.x)) * 0.6 + 0.15 * (1.0 - smoothstep(0.5, 1.0, gs.x)));
    float streak = gn * smoothstep(0.55, 0.9, abs(Nn.x)) * smoothstep(0.62, 0.8, vnoise(vec3(z * 7.0, y * 0.35, x)));
    gd += glassK * (gring * (0.35 + 0.4 * uW.y) + streak * (0.15 + 0.35 * uW.y));
  }
  gd = clamp(gd, 0.0, 1.0);
  cO = mix(cO, vec3(0.43, 0.41, 0.37), gd * 0.42); rO = mix(rO, 0.48, gd); alphaO = mix(alphaO, 0.92, gd); ccO *= 1.0 - 0.42 * gd;
  // rạn nứt kính chắn gió: tia nứt toả từ điểm va + vòng nứt đồng tâm
  if (uE.w > 0.0 && z > uA.y) {
    vec2 cp = vec2(x, z) - uE.xy; float rr = length(cp), an = atan(cp.y, cp.x);
    float fall = smoothstep(uE.z, 0.0, rr);
    float rays = aaLine(sin(an * 7.0 + fbm(vec3(an * 2.0, rr * 0.7, 3.0)) * 5.0) * rr * 0.5, 0.035) * fall;
    float rings = aaLine(sin(rr * 5.0 + fbm(vec3(cp * 1.3, 1.0)) * 3.0) * 0.25, 0.03) * smoothstep(uE.z * 0.55, 0.0, rr);
    // tâm va: lõm vụn kính nhỏ (~1 cm) xám đục, vành "mắt bò" nứt tách lớp sáng mờ quanh, rồi tia nứt mảnh
    float core = fillAA(rr - 0.07), bull = fillAA(rr - 0.2 - 0.05 * sin(an * 9.0)) * (1.0 - core);
    float cr = clamp(max(rays, rings) * 0.8 + bull * 0.45 + core * 0.7, 0.0, 1.0) * glassK;
    cO = mix(cO, mix(vec3(0.72, 0.75, 0.75), vec3(0.45, 0.47, 0.47), core), cr * 0.75); alphaO = mix(alphaO, 1.0, cr * 0.8); rO = mix(rO, 0.3, cr);
  }
  // xe bị cán bẹp / móp méo: kính hông / kính hậu cường lực vỡ vụn (kính chắn gió dán keo chỉ rạn nứt thanh mảnh)
  // ô kính đang tô: chắn gió / hậu / cửa trước / cửa sau theo bên trái / phải
  float paneBk = dW <= min(min(dR, dF), dRr) ? uBk.x : dR <= min(dF, dRr) ? uBk.y : dF <= dRr ? (x > 0.0 ? uBk.w : uBk.z) : (x > 0.0 ? uBk2.y : uBk2.x);
  if (step(0.5, uE.w) + paneBk > 0.0 || vCr.z > 0.03) {
    if (z > uA.y) {
      // xác cháy (paneBk = 2): kính chắn gió chảy rụng, còn viền gioăng cháy quanh khung
      if (paneBk > 1.5 && glassOnly > 0.5 && -d > 0.08) discard;
      // kính chắn gió dán keo nhiều lớp: chịu lực uốn nén, rạn nứt mạng nhện thanh mảnh sắc nét, giữ độ trong suốt
      // một điểm va: rạn loang quanh tâm va (kính dán không vỡ cả tấm); uE.w >= 2 (nổ lớn / cháy): rạn kín cả tấm
      float kImp = step(0.5, uE.w) * (uE.w > 1.5 ? 1.0 : smoothstep(uE.z * 1.7, uE.z * 0.25, length(vec2(x, z) - uE.xy)));
      float kGlass = clamp(vCr.z * 1.5 + kImp * 0.6 + paneBk, 0.0, 1.0);
      if (kGlass > 0.04) {
        vec2 cp = vec2(x * 1.15, (z + y * 0.5) * 1.35);
        float e1 = crackEdge(cp * (0.85 + 0.65 * kGlass));
        float fw1 = fwidth(e1) * 0.35 + 1e-4;
        float cr = 1.0 - smoothstep(0.0, 0.003 + fw1, e1);
        cO = mix(cO, vec3(0.85, 0.90, 0.94), cr * glassOnly * kGlass * 0.32);
        rO = mix(rO, 0.28, cr * glassOnly * kGlass * 0.4);
        mO = mix(mO, 0.02, cr * glassOnly * kGlass);
        ccO *= 1.0 - 0.35 * cr * kGlass;
        alphaO = mix(alphaO, 0.72, cr * glassOnly * kGlass * 0.3);
      }
    } else {
      // kính hông / kính hậu cường lực: chỉ vỡ khi khung thực sự bị nén dập mạnh
      float kSide = max(smoothstep(0.22, 0.48, vCr.z), paneBk);
      if (kSide > 0.08) {
        float rim = 0.03 + 0.08 * vnoise(vec3(vRest * 3.5));
        if (glassOnly > 0.5 && kSide > 0.25 && -d > rim) discard;
        vec2 cp = vec2(z + x, y) * 7.0; float e = crackEdge(cp);
        cO = mix(cO, vec3(0.48, 0.52, 0.54), glassOnly * kSide * (1.0 - smoothstep(0.0, 0.04, e)) * 0.6);
        rO = mix(rO, 0.7, kSide); ccO = 0.0;
      }
    }
  }
  // mặt trong khoang (nhìn xuyên kính sang cột / khung cửa / trần bên kia): ốp nhựa xám, trần nỉ
  if (!gl_FrontFacing) { float ins = 1.0 - glassOnly; cO = mix(cO, vec3(0.13, 0.125, 0.12), ins); rO = mix(rO, 0.92, ins); mO *= 1.0 - ins; ccO *= 1.0 - ins; }
  // mui / cột / gioăng luôn đặc (chỉ ô kính mới trong suốt)
  alphaO = mix(1.0, alphaO, smoothstep(0.02, 0.2, glassOnly));
  diffuseColor.rgb = cO; diffuseColor.a = alphaO;
`;
  function carMaterial(color, env, mode, S, W) {
    const isDumpOrTruck = S.isDump || S.isTruck;
    const baseMetal = isDumpOrTruck ? 0.45 : 0.52;
    const baseRough = isDumpOrTruck ? 0.28 : 0.22;
    const baseClearcoat = isDumpOrTruck ? 0.82 : 1.0;
    const baseClearcoatRough = isDumpOrTruck ? 0.08 : 0.04;
    const m = new THREE.MeshPhysicalMaterial({
      color,
      roughness: baseRough,
      metalness: baseMetal,
      clearcoat: baseClearcoat,
      clearcoatRoughness: baseClearcoatRough,
      envMap: env,
      envMapIntensity: isDumpOrTruck ? 1.15 : 1.35
    });
    if (mode === 'cabin') m.transparent = true;
    if (mode === 'cabinIn') m.side = THREE.BackSide;
    m.extensions = { derivatives: true };
    const Z = [0, 0, 0, 0], L = S.lamps;
    const U = mode !== 'body' ? {
      uA: [S.pillarA, S.roofF, S.pillarC, S.roofR], uB: S.rearDlo.concat(0), uC: [S.zB, S.zDiv, 0, 0], uD: Z, uE: W.crack
    } : {
      uA: [S.doors[0], S.doors[1], S.doors[2], S.bumperF[0]], uB: [S.sill, S.bumperF[1], S.bumperR[0], S.bumperR[1]],
      uC: [S.hood[0], S.hood[1], S.trunk[0], S.trunk[1]], uD: S.fuel, uE: [S.bumperTop[0], S.bumperTop[1], 0, 0]
    };
    const FU = (n, F) => { const u = F ? featureUniforms(F) : [Z, Z, Z]; U[n + '0'] = u[0]; U[n + '1'] = u[1]; U[n + '2'] = u[2]; };
    const FT = S.features; FU('uH', FT.head); FU('uT', FT.tail); FU('uK', FT.grille); FU('uN', FT.intake); FU('uO', FT.fog);
    Object.assign(U, { uF: L.front, uG: L.grille, uR: L.rear, uI: [S.isDump ? 1.25 : S.inset + 0.15, S.cabin[0][0] + 0.2, S.isDump ? 18.65 : S.cabin[S.cabin.length - 1][0] - 0.2, 0], uW: [W.dust, W.age, W.rust, W.seed], uTk: W.track || [0, 0, 0, 0], uBk: [0, 0, 0, 0], uBk2: [0, 0, 0, 0], uPn: W.panel ? W.panel.n : Z, uPy: W.panel ? W.panel.y : Z, uPc: W.panel ? W.panel.c : Z, uSt: [S.style || 0, S.tgEdge || 5.2, S.plates[1], 0], uAx: [S.axleF, S.axleR, S.r, S.isDump ? 3.0 : S.isTruck ? 2.0 : (S.isSuv || S.hatchback ? 1.0 : 0.0)],
      // trục gạt mưa nằm trong máng chân kính chắn gió (như cụm gạt dựng ở build)
      uWp: S.isTruck ? Z : [-0.95, 3.55, curve(S.top)(S.cabin[S.cabin.length - 1][0]) + 0.1, S.cabin[S.cabin.length - 1][0] - 0.15] });
    const uni = {}; for (const k in U) uni[k] = { value: new THREE.Vector4(...U[k]) }; m.userData.uni = uni;
    m.onBeforeCompile = sh => {
      for (const k in uni) sh.uniforms[k] = uni[k];
      sh.vertexShader = 'attribute vec3 aRef; attribute vec3 aRest; attribute vec3 aCr;\nvarying vec3 vRest; varying vec3 vObjN; varying vec3 vRef; varying vec3 vCr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vObjN = normal; vRef = aRef; vCr = aCr;');
      sh.fragmentShader = GLSL_COMMON + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + (mode === 'body' ? GLSL_BODY : GLSL_CABIN + (mode === 'cabinIn' ? '  if (glassOnly > 0.5) discard;\n  diffuseColor.a = 1.0;\n' : '')))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rO;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mO;')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= clamp(ccO, 0.0, 1.0);\nmaterial.clearcoatRoughness = min(1.0, material.clearcoatRoughness + ccR);\n#endif')
        // tôn gợn / vỏ cam / mép sứt: dập nổi pháp tuyến cả lớp sơn lẫn lớp bóng
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = civBump(-vViewPosition, normal, bumpH);')
        .replace('#include <clearcoat_normal_fragment_begin>', '#ifdef CLEARCOAT\nvec3 clearcoatNormal = civBump(-vViewPosition, geometryNormal, bumpH);\n#endif');
      // kính thật: nhìn xiên phản chiếu gần như gương, nhìn thẳng thấy rõ trong xe
      if (mode === 'cabin') sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nfloat fres = 0.85 * pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 4.0);\ndiffuseColor.a = mix(diffuseColor.a, 1.0, fres * glassOnly);');
    };
    m.customProgramCacheKey = () => 'civcar_' + mode;
    return m;
  }

  // ---------------------------------------------------------------------------
  // CỤM CHI TIẾT LẮP VÀO LỖ KHOÉT (đèn pha, đèn hậu, lưới tản nhiệt, hốc gió, đèn sương mù): thân xe khoét lỗ trên
  // shader theo đúng biên dạng; ở đây dựng mặt kính ôm theo bề mặt thân, thành lỗ, đáy lõm sâu và các chi tiết bên
  // trong. Biên dạng cho trên mặt chiếu (U, V): V = y, U vuông góc hướng nhìn d = (dx, 0, dz) trong mặt phẳng ngang
  // ---------------------------------------------------------------------------
  // đa giác lồi (lõi) nới ra bán kính r -> đường biên bo góc (ngược chiều kim đồng hồ)
  function roundedOutline(pts, r, perCorner = 6) {
    let P = pts.map(p => p.slice());
    let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
    if (A < 0) P.reverse();
    const out = [], n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
      const n0 = Math.atan2(-(b[0] - a[0]), b[1] - a[1]), n1 = Math.atan2(-(c[0] - b[0]), c[1] - b[1]);
      let d = n1 - n0; while (d < 0) d += Math.PI * 2; while (d > Math.PI * 2) d -= Math.PI * 2;
      for (let k = 0; k <= perCorner; k++) { const t = n0 + d * k / perCorner; out.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]); }
    }
    return out;
  }
  // nửa phải của đa giác đối xứng (đáy trái, đáy phải, đỉnh phải, đỉnh trái) cho shader (dùng |x|)
  const halfPoly = p => [[-0.1, p[0][1]], p[1], p[2], [-0.1, p[3][1]]];
  function featureFrame(F, sx) {
    const dx = F.dir[0] * sx, dz = F.dir[1], n = Math.hypot(F.dir[0], 1);
    return { d: new THREE.Vector3(dx / n, 0, dz / n), U: new THREE.Vector3(sx / n, 0, -F.dir[0] * dz / n) };
  }
  // shader: (điểm a, b) đa giác lõi + (dx, r, zMin, dz)
  function featureUniforms(F) {
    const p = F.sym ? halfPoly(F.pts) : F.pts;
    return [[p[0][0], p[0][1], p[1][0], p[1][1]], [p[2][0], p[2][1], p[3][0], p[3][1]], [F.dir[0], F.r, F.zMin, F.dir[1]]];
  }
  function stripGeometry(A, B, closed) {
    const pos = [], idx = [], n = A.length;
    for (let i = 0; i < n; i++) pos.push(A[i].x, A[i].y, A[i].z, B[i].x, B[i].y, B[i].z);
    for (let i = 0; i < (closed ? n : n - 1); i++) { const j = (i + 1) % n; idx.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // mặt phủ trong biên: các vành co dần về tâm (đa giác lồi), điểm tâm; colorFn(u, v) -> màu đỉnh (tuỳ chọn)
  function capGeometry(rings, center, faceDir, colorFn, uvs) {
    const pos = [], idx = [], col = [], n = rings[0].length;
    rings.forEach((R, k) => R.forEach((p, i) => { pos.push(p.x, p.y, p.z); if (colorFn) col.push(...colorFn(...uvs[k][i])); }));
    const c = pos.length / 3; pos.push(center.x, center.y, center.z); if (colorFn) col.push(...colorFn(...uvs[uvs.length - 1].c));
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = k * n + i, b = k * n + j, a2 = a + n, b2 = b + n; idx.push(a, b, a2, b, b2, a2); }
    const L = (rings.length - 1) * n; for (let i = 0; i < n; i++) idx.push(L + i, L + (i + 1) % n, c);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // toạ độ mặt chiếu (u, v) của cụm làm uv: vùng màu kính, vân quang học, mặt khía chóa đèn hậu
    if (uvs) { const uv = []; rings.forEach((R, k) => R.forEach((p, i) => uv.push(uvs[k][i][0], uvs[k][i][1]))); uv.push(...uvs[uvs.length - 1].c); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    g.setIndex(idx); g.computeVertexNormals();
    // quay mặt ra phía người nhìn
    const N = g.attributes.normal; let s = 0; for (let i = 0; i < N.count; i++) s += N.getX(i) * faceDir.x + N.getY(i) * faceDir.y + N.getZ(i) * faceDir.z;
    if (s < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  }
  // Dò biên + các vành trong lên thân xe. Trả về: biên (UV, điểm trúng), các vành (điểm trúng), tâm
  function projectFeature(F, sx, body, outlineUV) {
    const { d, U } = featureFrame(F, sx), rc = new THREE.Raycaster(), nd = d.clone().negate();
    rc.firstHitOnly = true;
    const hit = (u, v) => { rc.set(U.clone().multiplyScalar(u).add(new THREE.Vector3(0, v, 0)).addScaledVector(d, 60), nd); const h = rc.intersectObject(body)[0]; return h ? h.point : null; };
    let cu = 0, cv = 0; for (const p of outlineUV) { cu += p[0] / outlineUV.length; cv += p[1] / outlineUV.length; }
    const S = [1, 0.84, 0.66, 0.48, 0.3, 0.14], ringsUV = S.map(s => outlineUV.map(p => [cu + (p[0] - cu) * s, cv + (p[1] - cv) * s]));
    const rings = ringsUV.map(R => R.map(p => hit(p[0], p[1])));
    const center = hit(cu, cv);
    if (!center || rings.some(R => R.some(p => !p))) return null;
    ringsUV.c = [cu, cv];
    return { d, U, hit, rings, ringsUV, center, cuv: [cu, cv] };
  }
  // đáy lõm: các vành đẩy sâu vào trong theo hướng nhìn
  const sinkRings = (rings, d, depth) => rings.map((R, k) => R.map(p => p.clone().addScaledVector(d, -depth * (0.85 + 0.15 * k / rings.length))));
  function buildFeature(F, sx, body, M, age, parent) {
    const outline = roundedOutline(F.pts.map(p => [p[0], p[1]]), F.r);
    const P = projectFeature(F, sx, body, outline);
    if (!P) return;
    const { d, rings, ringsUV, center } = P, depth = F.depth;
    const uvs = ringsUV.map(R => R); uvs.push({ c: P.cuv }); uvs[uvs.length - 1].c = P.cuv;
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = true; parent.add(m); return m; };
    const back = sinkRings(rings, d, depth), backC = center.clone().addScaledVector(d, -depth);
    const tl = F.kind === 'tail';
    add(stripGeometry(rings[0], back[0], true), tl && M.tailWall ? M.tailWall : M.wall);                    // thành lỗ
    add(capGeometry(back, backC, d, null, tl ? uvs : null), F.backMat ? M[F.backMat] : M.wall);   // đáy lõm (đèn hậu: chóa khía cần uv)
    const at = (u, v, inset) => { const p = P.hit(u, v); return p ? p.addScaledVector(d, -inset) : null; };
    const orient = (m, dir) => { m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); return m; };
    if (F.kind === 'head') {
      // Cụm đèn pha Bi-LED kép, thấu kính pha lê, vòng LED Halo, dải DRL chữ L sắc sảo và xi-nhan hổ phách góc ngoài
      const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
      for (const [u, v, r, type] of F.proj) {
        const sp = at(u, v, 0); if (!sp) continue;
        const base = sp.clone(); base.z -= r * 0.9 + 0.16;
        if (type === 'lens') {
          // Vỏ bọc projector màu tối
          const sh = add(new THREE.CylinderGeometry(r * 1.25, r * 1.34, depth * 0.8, 28, 1, true), M.wall);
          sh.quaternion.setFromUnitVectors(up, fwd);
          sh.position.copy(base).z -= depth * 0.4;
          // Thấu kính pha lê cầu lồi quang học
          const lens = add(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.projLens);
          lens.quaternion.setFromUnitVectors(up, fwd);
          lens.position.copy(base);
          // Tim đèn LED sáng bên trong thấu kính
          const core = add(new THREE.SphereGeometry(r * 0.35, 12, 8), M.bulb);
          core.position.copy(base); core.position.z -= r * 0.35;
          // Vòng LED Halo định vị trắng ngọc quanh thấu kính (đèn kiểu sedan hiện đại bỏ halo: F.halo === false)
          if (F.halo !== false) add(new THREE.TorusGeometry(r * 1.10, 0.042, 8, 36), M.drl).position.copy(base);
          // Vành bezel crôm mạ bóng sang trọng
          const bezel = add(new THREE.TorusGeometry(r * 1.24, 0.032, 6, 36), M.chromeIn);
          bezel.position.copy(base);
        } else {
          // Chóa đèn góc mạ crôm bóng loáng
          const bowl = add(new THREE.SphereGeometry(r * 1.35, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.chromeIn);
          bowl.quaternion.setFromUnitVectors(up, fwd.clone().negate());
          bowl.position.copy(base).z += r * 0.5;
          // Bóng đèn ở tâm
          add(new THREE.SphereGeometry(r * 0.26, 12, 8), M.bulb).position.copy(base);
          add(new THREE.TorusGeometry(r * 1.28, 0.03, 6, 32), M.chromeIn).position.copy(base);
        }
      }
      // Dải đèn xi-nhan LED hổ phách góc ngoài
      if (F.amber) {
        for (const [au, av, aLen] of F.amber) {
          const p0 = at(au, av - aLen * 0.5, depth * 0.32);
          const p1 = at(au, av + aLen * 0.5, depth * 0.32);
          if (p0 && p1) {
            const aCurve = new THREE.CatmullRomCurve3([p0, p1]);
            add(new THREE.TubeGeometry(aCurve, 8, 0.035, 5, false), M.tailAmber);
          }
        }
      }
      // xi nhan dạng thanh hổ phách liền, nằm sau mặt kính
      if (F.amberStrip) {
        const [[u0, v0], [u1, v1]] = F.amberStrip, aPts = [];
        for (let i = 0; i <= 8; i++) { const p = at(u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * i / 8, depth * 0.3); if (p) aPts.push(p); }
        if (aPts.length >= 3) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aPts), 16, 0.06, 6, false), M.tailAmber);
      }
      // Dải LED ban ngày DRL chữ L sắc nét
      if (F.drl && F.drl.length >= 2) {
        let drlPts = [];
        if (F.drl.length === 2) {
          for (let i = 0; i <= 14; i++) {
            const t = i / 14, u = F.drl[0][0] + (F.drl[1][0] - F.drl[0][0]) * t, v = F.drl[0][1] + (F.drl[1][1] - F.drl[0][1]) * t;
            const p = at(u, v, depth * 0.28); if (p) drlPts.push(p);
          }
        } else {
          for (const [du, dv] of F.drl) {
            const p = at(du, dv, depth * 0.28); if (p) drlPts.push(p);
          }
        }
        if (drlPts.length >= 3) {
          add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(drlPts), 48, 0.048, 7, false), M.drl);
        }
      }
      // Nẹp viền mép hốc đèn mỏng sắc sảo
      const rimPts = outline.map(p => at(p[0], p[1], depth * 0.04)).filter(Boolean);
      if (rimPts.length > 6) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 72, 0.028, 5, true), M.wall);
      // Chụp kính đèn pha ngoài Polycarbonate trong suốt phản chiếu môi trường cao
      add(capGeometry(rings.map(R => R.map(p => p.clone())), center.clone(), d, F.lensColor, uvs), M.headLens).userData.lens = true;
    } else if (F.kind === 'tail') {
      const u0 = Math.min(...outline.map(p => p[0])), u1 = Math.max(...outline.map(p => p[0]));
      const v0 = Math.min(...outline.map(p => p[1])), v1 = Math.max(...outline.map(p => p[1]));
      const rimPts = outline.map(p => at(p[0], p[1], depth * 0.06)).filter(Boolean);
      // khe tôn quanh cụm đèn: gioăng tối mảnh ~3 mm (trước đây viền đen dày như nét vẽ hoạt hình)
      if (rimPts.length > 6) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 96, 0.022, 5, true), M.wall);
      const isRed = (u, v) => lensKind(F.lensColor ? F.lensColor(u, v) : [0.76, 0.02, 0.014]) === 'red';
      // dải dẫn sáng LED (acrylic mờ, đèn tắt) theo đường fn(t) -> [u, v]: chỉ chạy trong vùng kính đỏ — đoạn liền dài nhất,
      // không xuyên qua ô đèn lùi / xi nhan
      const guide = (fn, n, rad, mat) => {
        let run = [], best = [];
        for (let i = 0; i <= n; i++) {
          const [u, v] = fn(i / n), p = isRed(u, v) ? at(u, v, depth * 0.42) : null;
          if (p) run.push(p); else { if (run.length > best.length) best = run; run = []; }
        }
        if (run.length > best.length) best = run;
        if (best.length > 5) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(best), best.length * 2, rad, 7, false), mat);
      };
      // chóa crôm lõm hình bầu dục + bóng đèn + đui sau từng ô kính không đỏ (đèn lùi: kính trong, xi nhan: kính hổ
      // phách); đèn kiểu cũ (không dải LED) thì vùng đỏ cũng là chóa + bóng. Trục chóa: X ngang theo cụm, Y lún vào trong
      const X = P.U.clone(), Y = d.clone().negate(), Zv = new THREE.Vector3().crossVectors(X, Y).normalize();
      const rot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Zv)), up = new THREE.Vector3(0, 1, 0);
      const bowl = z => {
        const p = at(z.cu, z.cv, depth * 0.22); if (!p) return;
        const rx = Math.max(0.1, z.hu * 0.76), ry = Math.max(0.1, z.hv * 0.76), rd = Math.min(depth * 0.72, Math.min(rx, ry) * 0.95), r = Math.min(rx, ry) * 0.3;
        const b = add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.chromeIn);
        b.quaternion.copy(rot); b.position.copy(p); b.scale.set(rx, rd, ry);
        add(new THREE.SphereGeometry(r, 14, 10), M.bulb).position.copy(p).addScaledVector(d, -rd * 0.5);
        const sock = add(new THREE.CylinderGeometry(r * 0.5, r * 0.6, rd * 0.45, 10), M.wall);
        sock.quaternion.setFromUnitVectors(up, d); sock.position.copy(p).addScaledVector(d, -rd * 0.85);
      };
      for (const z of lampZones(F, outline, u0, u1, v0, v1)) if (z.kind !== 'red' || !F.style) bowl(z);
      if (F.style === 'sedanBlade') {
        // Hai nét LED gãy nhẹ chạy ngang, dồn cụm sáng về góc ngoài như sedan hạng D hiện đại.
        for (const vr of [0.34, 0.7]) guide(t => [u0 + (u1 - u0) * (0.07 + t * 0.86), v0 + (v1 - v0) * (vr - 0.1 * Math.sin(t * Math.PI))], 24, vr < 0.5 ? 0.055 : 0.07, vr < 0.5 ? M.tailGuide : M.tailBrake);
      } else if (F.style === 'vertical') {
        // Đồ họa LED dựng đứng: hai nét ôm theo chiều cao cụm đèn (ô đèn lùi / xi nhan ở đáy có chóa riêng).
        for (const ur of [0.3, 0.67]) guide(t => [u0 + (u1 - u0) * ur, v0 + (v1 - v0) * (0.08 + t * 0.84)], 22, 0.06, M.tailBrake);
      } else if (F.style === 'blade') {
        // Hai thanh LED mảnh thay cho các bóng tròn lớn, hợp với mảng ốp ngang của cốp SUV.
        for (const vr of [0.36, 0.68]) guide(t => [u0 + (u1 - u0) * (0.07 + t * 0.86), v0 + (v1 - v0) * (vr + 0.045 * Math.sin(t * Math.PI))], 22, 0.055, M.tailBrake);
      }
      // KÍNH 2 lớp chung một lưới (vỡ kính / bẹp theo xe khoét, uốn cả hai): lọc màu (nhân màu chóa bạc + dải dẫn sáng phía
      // sau thành đỏ rực) rồi lớp bóng mặt ngoài (cộng phản chiếu trời, vệt nắng; màu đỉnh = bụi phủ, dày ở mép dưới)
      const dustFn = (u, v) => {
        const k = (M.tailDust || 0) * 0.2 * (0.5 + 0.5 * Math.sin(u * 7.3 + v * 3.1 + (M.tailSeed || 0)) ** 2) * (1 + 0.9 * Math.max(0, Math.min(1, (v0 + (v1 - v0) * 0.4 - v) / ((v1 - v0) * 0.4))));
        return [0.42 * k, 0.39 * k, 0.33 * k];
      };
      const lg = capGeometry(rings, center, d, dustFn, uvs), nR = rings[0].length, ea = new Float32Array(lg.attributes.position.count);
      for (let i = 0; i < nR; i++) { ea[i] = 1; ea[i + nR] = 0.3; }
      lg.setAttribute('aEdge', new THREE.BufferAttribute(ea, 1));
      if (!M.tailLens || M.tailLens.userData.F !== F) {
        M.tailLens = tailFilterMaterial(F._zone || (F._zone = lensZoneTexture(F, u0, u1, v0, v1)), u0, u1, v0, v1, age, M.tailDust || 0, M.tailSeed || 0);
        M.tailLens.userData.F = F;
      }
      const lens = add(lg, M.tailLens); lens.userData.lens = true;
      if (M.tailGloss) { const gl = new THREE.Mesh(lg, M.tailGloss); gl.castShadow = false; gl.raycast = () => {}; lens.add(gl); }
    } else if (F.kind === 'grille') {
      // nan ngang lùi vào trong + viền crôm có độ dày quanh miệng lưới (SUV: nan kép mạ crom to bản uy lực)
      const [v0, v1] = [Math.min(...outline.map(p => p[1])), Math.max(...outline.map(p => p[1]))], hw = Math.max(...outline.map(p => p[0]));
      const isSuvGrille = v0 > 5.0 && (v1 - v0) < 1.6;
      for (let v = v0 + 0.16; v < v1 - 0.08; v += (isSuvGrille ? 0.34 : 0.24)) {
        const p = at(0, v, 0.32);
        if (p) {
          const sl = add(roundBox(2 * hw - 0.15, isSuvGrille ? 0.11 : 0.08, 0.28, 0.03), isSuvGrille ? M.chrome : M.slat);
          sl.position.copy(p);
          sl.rotation.x = -0.25;
          if (isSuvGrille) {
            const slIn = add(roundBox(2 * hw - 0.24, 0.06, 0.22, 0.02), M.slat);
            slIn.position.copy(p).add(new THREE.Vector3(0, -0.06, -0.05));
            slIn.rotation.x = -0.25;
          }
        }
      }
      if (isSuvGrille) {
        const p = at(0, (v0 + v1) * 0.5, 0.12);
        if (p) {
          const badge = add(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 24), M.chrome);
          badge.position.copy(p); badge.rotation.x = Math.PI / 2;
          const core = add(new THREE.CylinderGeometry(0.2, 0.2, 0.075, 24), M.slat);
          core.position.copy(p).add(new THREE.Vector3(0, 0, 0.035)); core.rotation.x = Math.PI / 2;
        }
      }
    } else if (F.kind === 'intake') {
      const [v0, v1] = [Math.min(...outline.map(p => p[1])), Math.max(...outline.map(p => p[1]))], hw = Math.max(...outline.map(p => p[0]));
      const p = at(0, (v0 + v1) / 2, 0.22); if (p) { const m = add(new THREE.PlaneGeometry(2 * hw - 0.1, v1 - v0 - 0.05), M.honey); m.position.copy(p); }
    } else if (F.kind === 'fog') {
      const p = at(P.cuv[0], P.cuv[1], depth * 0.22);
      if (p) {
        const lamp = add(new THREE.SphereGeometry(F.r * 0.72, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.fogLens);
        lamp.position.copy(p); lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        const ring = add(new THREE.TorusGeometry(F.r * 0.76, 0.035, 6, 28), M.chromeIn); ring.position.copy(p);
      }
    }
  }
  // ---------------------------------------------------------------------------
  // ĐÈN HẬU THẬT: kính acrylic nhuộm màu là bộ LỌC (nhân màu mọi thứ phía sau nó) chứ không phải tấm nhựa đục phủ lên —
  // chóa mạ bạc bên trong hắt trời / nắng qua kính đỏ thành đỏ hồng ngọc rực, lấm tấm lấp lánh theo các ô khía; mặt ngoài
  // nhẵn bóng phản chiếu như kính (lớp cộng riêng). Đèn xe bỏ hoang tắt vẫn đỏ rực dưới nắng như ngoài đời
  // ---------------------------------------------------------------------------
  // mặt khía "gối" (pillow optics) của chóa phản xạ: ô ~1 cm, mỗi ô vồng lên hắt một hướng
  let PILLOW_TEX = null;
  function pillowNormalTexture() {
    if (PILLOW_TEX) return PILLOW_TEX;
    const N = 128, C = 16, d = new Uint8Array(N * N * 4), R = mulberry(4417), tilt = [];
    for (let k = 0; k < 64; k++) tilt.push([(R() - 0.5) * 0.3, (R() - 0.5) * 0.3]);   // mỗi ô nghiêng lệch chút (khuôn ép không đều)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = ((x % C) + 0.5) / C * 2 - 1, cy = ((y % C) + 0.5) / C * 2 - 1, tl = tilt[((y / C) | 0) * 8 + ((x / C) | 0)];
      const nx = 1.1 * cx * cx * cx * (1 - cy ** 4) + tl[0], ny = 1.1 * cy * cy * cy * (1 - cx ** 4) + tl[1], l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    const t = PILLOW_TEX = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.repeat.set(2.6, 3.3);   // uv = toạ độ mặt chiếu (đv): 8 ô / ô ảnh -> ô ~0,048 x 0,038 đv (6 x 5 mm)
    t.needsUpdate = true;
    return t;
  }
  // điểm (u, v) trong đường biên (chẵn - lẻ)
  function inOutline(P, u, v) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > v) !== (P[j][1] > v) && u < (P[j][0] - P[i][0]) * (v - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    return c;
  }
  // vùng kính theo màu (F.lensColor): 'red' đèn hậu / phanh, 'amber' xi nhan, 'clear' đèn lùi -> hộp bao (u, v) của từng vùng
  const lensKind = c => c[1] > 0.62 && c[2] > 0.55 ? 'clear' : c[0] > 0.6 && c[1] > 0.28 && c[2] < 0.4 ? 'amber' : 'red';
  function lampZones(F, outline, u0, u1, v0, v1) {
    const NU = 48, NV = 18, Z = {};
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const u = u0 + (u1 - u0) * (i + 0.5) / NU, v = v0 + (v1 - v0) * (j + 0.5) / NV;
      if (!inOutline(outline, u, v)) continue;
      const k = lensKind(F.lensColor ? F.lensColor(u, v) : [0.76, 0.02, 0.014]), b = Z[k] || (Z[k] = { kind: k, n: 0, a: [1e9, 1e9, -1e9, -1e9] });
      b.n++; b.a[0] = Math.min(b.a[0], u); b.a[1] = Math.min(b.a[1], v); b.a[2] = Math.max(b.a[2], u); b.a[3] = Math.max(b.a[3], v);
    }
    const hu = (u1 - u0) / NU / 2, hv = (v1 - v0) / NV / 2;
    return Object.values(Z).filter(b => b.n >= 4).map(b => ({ kind: b.kind, cu: (b.a[0] + b.a[2]) / 2, cv: (b.a[1] + b.a[3]) / 2, hu: (b.a[2] - b.a[0]) / 2 + hu, hv: (b.a[3] - b.a[1]) / 2 + hv }));
  }
  // bảng độ truyền qua của kính theo vùng (ảnh 128 x 64 phủ hộp bao cụm đèn): ranh giới vùng sắc nét theo điểm ảnh
  // thay vì nội suy màu đỉnh thưa (trước đây vùng kính trong loang mờ vào vùng đỏ thành mảng trắng đục)
  function lensZoneTexture(F, u0, u1, v0, v1) {
    const W = 128, H = 64, d = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = F.lensColor ? F.lensColor(u0 + (u1 - u0) * (i + 0.5) / W, v0 + (v1 - v0) * (j + 0.5) / H) : [0.76, 0.02, 0.014], k = (j * W + i) * 4;
      d[k] = Math.min(255, c[0] * 255); d[k + 1] = Math.min(255, c[1] * 255); d[k + 2] = Math.min(255, c[2] * 255); d[k + 3] = 255;
    }
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    return t;
  }
  // lớp LỌC MÀU của kính: nhân màu khung hình (blend DstColor x 0) với độ truyền qua của vùng kính; vân gối mặt trong kính,
  // mép kính dày sẫm hơn, phai màu theo tuổi (đỏ ngả hồng cam), bụi bám mép dưới cản bớt sáng. Sương mù kéo về 1 (không lọc)
  function tailFilterMaterial(zoneTex, u0, u1, v0, v1, age, dust, seed) {
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uZone: { value: null }, uBox: { value: new THREE.Vector4(u0, v0, 1 / (u1 - u0), 1 / (v1 - v0)) }, uAge: { value: new THREE.Vector3(age, dust, seed) } }]),
      vertexShader: `
        attribute float aEdge;
        varying vec2 vUv; varying float vEdge; varying vec3 vP;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv; vEdge = aEdge; vP = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D uZone; uniform vec4 uBox; uniform vec3 uAge;
        varying vec2 vUv; varying float vEdge; varying vec3 vP;
        #include <fog_pars_fragment>
        float lfH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lfN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lfH(i), lfH(i + vec2(1.0, 0.0)), f.x), mix(lfH(i + vec2(0.0, 1.0)), lfH(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() {
          vec2 zt = (vUv - uBox.xy) * uBox.zw;
          vec3 T = texture2D(uZone, zt).rgb;
          float red = clamp((T.r - T.g) * 1.5, 0.0, 1.0), clr = clamp((T.g - 0.45) * 3.0, 0.0, 1.0);
          // gân ngang mảnh mặt trong kính ô đèn lùi (vùng màu: vân nằm ở chóa khía phía sau); xa thì tắt (không rằn ri)
          float rib = smoothstep(0.3, 0.5, abs(fract(vUv.y * 30.0) - 0.5)) * clamp(1.0 - fwidth(vUv.y) * 70.0, 0.0, 1.0);
          T *= 1.0 - 0.12 * rib * clr;
          T *= 1.0 - 0.22 * vEdge;                       // kính dày ở mép (gờ ép gioăng)
          // phai màu nắng: đỏ ngả hồng cam, lọt thêm xanh lục / lam
          float fade = uAge.x * (0.55 + 0.45 * lfN(vP.xy * 1.3 + uAge.z));
          T = mix(T, T * 0.8 + vec3(0.12, 0.06, 0.055), fade * 0.55 * red);
          // bụi bám (dày ở mép dưới / quanh gioăng): cản bớt ánh sáng qua kính
          float dn = lfN(vP.xy * 3.1 + vP.z * 2.3 + uAge.z * 3.0);
          float du = clamp(uAge.y * (0.3 + 0.9 * dn) * (0.55 + 0.7 * smoothstep(0.65, 0.0, zt.y) + 0.4 * vEdge), 0.0, 0.85);
          T *= 1.0 - 0.42 * du;
          gl_FragColor = vec4(T, 1.0);
          ${THREE.ShaderChunk.fog_fragment.replace('fogColor', 'vec3(1.0)')}
        }`,
      fog: true, transparent: true, depthWrite: false, toneMapped: false, extensions: { derivatives: true },
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor
    });
    m.uniforms.uZone.value = zoneTex;
    return m;
  }
  // lớp BÓNG mặt ngoài kính đèn: chỉ cộng phần phản xạ (acrylic nhẵn F0 ~4%: nhìn thẳng thấy rõ bên trong, nhìn xiên / dưới
  // nắng loáng trời và vệt nắng), cũ thì xước mờ dần. dusty: màu đỉnh = lớp bụi phủ (cộng sáng mờ). Sương mù kéo về 0
  function tailGlossMaterial(env, age, dusty) {
    const m = new THREE.MeshPhysicalMaterial({ color: dusty ? 0xffffff : 0x000000, vertexColors: !!dusty, roughness: 0.05 + 0.2 * age, metalness: 0, clearcoat: 0, envMap: env, envMapIntensity: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('fogColor', 'vec3(0.0)')); };
    m.customProgramCacheKey = () => 'civTailGloss';
    return m;
  }
  // bảng màu kính 1 ô (kính phẳng một màu: đèn hộp xe tải)
  function tintTexture(c) {
    const t = new THREE.DataTexture(new Uint8Array([c[0] * 255, c[1] * 255, c[2] * 255, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  let honeyTex = null;   // không tham số -> mọi xe vẽ ra giống hệt: dựng 1 lần (bị dispose thì three tự nạp lại lên GPU)
  function honeyTexture() {
    if (honeyTex) return honeyTex;
    return (honeyTex = honeyTextureNew());
  }
  function honeyTextureNew() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.globalCompositeOperation = 'destination-out';
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const cx = i * 16 + (j % 2) * 8, cy = j * 14; x.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; x.lineTo(cx + Math.cos(a) * 6.3, cy + Math.sin(a) * 6.3); } x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1.2);
    return t;
  }
  // lốp: rãnh dẫn hướng thể thao + gân cao su bảo vệ vành mịn màng
  const TIRE_TEX_CACHE = {};
  // Lốp xe thật (map + bumpMap, uv của LatheGeometry: u quanh chu vi, v dọc biên dạng — v 0..0,24 / 0,76..1 là 2 thành
  // lốp, giữa là mặt gai): mặt gai khối + rãnh dọc + rãnh ngang mảnh, mòn nhẵn ở giữa; thành lốp trơn có chữ nổi (hãng,
  // cỡ lốp, chỉ số tải, mã DOT) cùng màu cao su — chỉ thấy nhờ dập nổi; gờ bảo vệ vành; nứt chân chim khi lốp già
  // (ảnh 2048 x 256, canvas: hàng y = (1 - v) * 256)
  function tireTextures(age, brand) {
    const key = (age || 0).toFixed(1) + '|' + brand;
    if (TIRE_TEX_CACHE[key]) return TIRE_TEX_CACHE[key];
    const W = 2048, H = 256, R = mulberry(733 + brand * 17 + Math.round(age * 10));
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
    const [cm, m] = mk(), [cb, b] = mk();
    const base = 30 + age * 10 | 0;
    m.fillStyle = `rgb(${base},${base},${base + 1})`; m.fillRect(0, 0, W, H);
    b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
    const Y = v => (1 - v) * H;
    // mặt gai: 4 rãnh dọc (khớp rãnh trên lưới lốp), khối gai so le, rãnh ngang mảnh; giữa mặt gai mòn bóng nhẹ
    const t0 = Y(0.76), t1 = Y(0.24);
    for (const [v0, v1] of [[0.32, 0.36], [0.48, 0.52], [0.64, 0.68]]) { m.fillStyle = 'rgba(0,0,0,0.55)'; m.fillRect(0, Y(v1), W, Y(v0) - Y(v1)); b.fillStyle = '#404040'; b.fillRect(0, Y(v1), W, Y(v0) - Y(v1)); }
    for (let i = 0; i < 96; i++) {
      const u = i * W / 96;
      for (const [va, vb, off] of [[0.24, 0.32, 0], [0.36, 0.48, 0.5], [0.52, 0.64, 0], [0.68, 0.76, 0.5]]) {
        const uu = u + off * W / 96, y0 = Y(vb), y1 = Y(va);
        b.fillStyle = '#4a4a4a'; b.save(); b.translate(uu, y0); b.rotate(0.12); b.fillRect(0, 0, 3, y1 - y0); b.restore();
        m.fillStyle = 'rgba(0,0,0,0.4)'; m.save(); m.translate(uu, y0); m.rotate(0.12); m.fillRect(0, 0, 3, y1 - y0); m.restore();
        b.fillStyle = '#6a6a6a'; b.fillRect(uu + 10, y0 + (y1 - y0) * 0.5, 9, 1);   // rãnh mảnh (sipe)
      }
    }
    const wear = m.createLinearGradient(0, t0, 0, t1);
    wear.addColorStop(0, 'rgba(255,255,255,0)'); wear.addColorStop(0.5, `rgba(120,118,112,${0.08 + 0.1 * age})`); wear.addColorStop(1, 'rgba(255,255,255,0)');
    m.fillStyle = wear; m.fillRect(0, t0, W, t1 - t0);
    // thành lốp: gờ bảo vệ vành gần mép mâm, vòng gờ giữa thành; chữ nổi
    const BR = ['ROADMAX', 'DURAGRIP', 'TERRAVIA', 'CITYLINE'][brand % 4];
    const SZ = ['205/55 R16 91V', '215/60 R16 95H', '265/65 R18 114T', '195/65 R15 91H'][brand % 4];
    for (const [vRing, vText, vSmall] of [[0.035, 0.12, 0.19], [0.965, 0.88, 0.81]]) {
      b.fillStyle = '#b0b0b0'; b.fillRect(0, Y(vRing) - 3, W, 6);
      m.fillStyle = `rgba(255,255,255,0.05)`; m.fillRect(0, Y(vRing) - 3, W, 6);
      for (const [txt, vv, px] of [[BR, vText, 17], [SZ, vText, 12], ['TUBELESS  M+S', vSmall, 8], ['DOT 4T7R ' + (1000 + (R() * 8999 | 0)), vSmall, 8]]) {
        for (let k = 0; k < 2; k++) {
          const ux = (k * W / 2 + (txt === BR ? 0 : txt === SZ ? W * 0.22 : txt[0] === 'T' ? W * 0.08 : W * 0.32) + R() * 20) % W;
          for (const [ctx, col] of [[b, '#d8d8d8'], [m, 'rgba(255,255,255,0.07)']]) {
            ctx.save(); ctx.translate(ux, Y(vv)); ctx.scale(1.5, vv > 0.5 ? -1 : 1);
            ctx.font = `700 ${px}px Arial, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(txt, 0, 0); ctx.restore();
          }
        }
      }
    }
    // lốp già: nứt chân chim mảnh trên thành lốp, cao su bạc xám
    // (vết nứt cao su chỉ ở lốp già, mảnh và nông — tránh lấm tấm như hạt)
    for (let i = 0; i < 160 * Math.max(0, age - 0.4); i++) {
      const side = R() < 0.5, v = side ? 0.05 + R() * 0.16 : 0.79 + R() * 0.16, u = R() * W, l = 2 + R() * 4;
      b.strokeStyle = '#787878'; b.lineWidth = 0.5; b.beginPath(); b.moveTo(u, Y(v)); b.lineTo(u + l, Y(v) + (R() - 0.5) * 1.5); b.stroke();
    }
    const map = new THREE.CanvasTexture(cm), bump = new THREE.CanvasTexture(cb);
    map.anisotropy = bump.anisotropy = 4;
    return (TIRE_TEX_CACHE[key] = { map, bump });
  }
  function tireTexture(age) {
    const key = (age || 0).toFixed(1);
    if (TIRE_TEX_CACHE[key]) return TIRE_TEX_CACHE[key];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x = c.getContext('2d');
    const base = 26 + age * 12 | 0; x.fillStyle = `rgb(${base},${base},${base})`; x.fillRect(0, 0, 1024, 128);

    // Mặt gai lốp thể thao ở giữa (v ~ 32..96): rãnh dọc kép và khối gai xiên thể thao
    x.fillStyle = `rgb(${base * 0.3 | 0},${base * 0.3 | 0},${base * 0.3 | 0})`;
    x.fillRect(0, 52, 1024, 5);
    x.fillRect(0, 71, 1024, 5);
    for (let i = 0; i < 64; i++) {
      const u = i * 16;
      x.fillRect(u, 36, 4, 14);
      x.fillRect(u + 8, 78, 4, 14);
      x.save(); x.translate(u + 4, 56); x.rotate(0.42); x.fillRect(0, 0, 3, 16); x.restore();
    }

    // Thành lốp mịn màng: vẽ các đường gân chỉ tròn bảo vệ vành (concentric ribbing)
    for (const v of [12, 18, 110, 116]) {
      x.strokeStyle = `rgb(${base + 12},${base + 12},${base + 12})`;
      x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(0, v); x.lineTo(1024, v); x.stroke();
    }
    // Các vạch khía vi cơ học cao su sắc nét trên thành lốp
    x.strokeStyle = `rgb(${base * 0.7 | 0},${base * 0.7 | 0},${base * 0.7 | 0})`;
    x.lineWidth = 1.0;
    for (let i = 0; i < 128; i++) {
      const u = i * 8;
      x.beginPath(); x.moveTo(u, 6); x.lineTo(u, 14); x.stroke();
      x.beginPath(); x.moveTo(u, 114); x.lineTo(u, 122); x.stroke();
    }

    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    TIRE_TEX_CACHE[key] = t;
    return t;
  }

  const PLAIN_DISC_CACHE = {};
  function plainDiscTexture(age) {
    const key = (age || 0).toFixed(1);
    if (PLAIN_DISC_CACHE[key]) return PLAIN_DISC_CACHE[key];
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'), cx = 256, cy = 256, R = mulberry(4111 + key.charCodeAt(2));
    x.fillStyle = '#3a3633'; x.beginPath(); x.arc(cx, cy, 252, 0, 7); x.fill();
    // mặt ma sát: thép xám sáng có vân tiện tròn, vệt má phanh mài bóng
    for (let r = 104; r < 246; r += 0.7) { const s = 150 + 30 * Math.sin(r * 0.9) + 20 * Math.sin(r * 7.3); x.strokeStyle = `rgba(${s},${s},${s + 4},0.9)`; x.lineWidth = 0.9; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
    // gỉ: xe đỗ lâu mặt đĩa gỉ cam nâu loang khắp, mép trong / ngoài gỉ sẫm hơn; xe mới chỉ gỉ mép
    const rust = Math.min(1, 0.25 + age * 1.1);
    for (let i = 0; i < 260 * rust; i++) {
      const a = R() * 6.28, r = 104 + R() * 142, s = 6 + R() * 26, gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r;
      const gr = x.createRadialGradient(gx, gy, 0, gx, gy, s); const col = R() < 0.5 ? '138,62,24' : '96,44,20';
      gr.addColorStop(0, `rgba(${col},${0.35 + 0.4 * rust})`); gr.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gr; x.fillRect(gx - s, gy - s, 2 * s, 2 * s);
    }
    for (const [r0, w] of [[104, 10], [238, 10]]) { x.strokeStyle = `rgba(82,40,18,${0.5 + 0.4 * rust})`; x.lineWidth = w; x.beginPath(); x.arc(cx, cy, r0 + w / 2, 0, 7); x.stroke(); }
    // moay-ơ đĩa: sơn đen xám mờ, gỉ chấm, 5 lỗ bu-lông + lỗ tâm
    x.fillStyle = '#26262a'; x.beginPath(); x.arc(cx, cy, 102, 0, 7); x.fill();
    for (let i = 0; i < 90 * rust; i++) { x.fillStyle = `rgba(110,50,20,${0.2 + R() * 0.3})`; x.beginPath(); x.arc(cx + (R() - 0.5) * 190, cy + (R() - 0.5) * 190, 1 + R() * 4, 0, 7); x.fill(); }
    x.fillStyle = '#0c0c0e'; x.beginPath(); x.arc(cx, cy, 34, 0, 7); x.fill();
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; x.beginPath(); x.arc(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64, 9, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; PLAIN_DISC_CACHE[key] = t; return t;
  }
  // đĩa phanh thể thao: thép phay xước tiện tròn đồng tâm, lỗ khoan tản nhiệt xoắn ốc và rãnh xẻ thể thao
  const DISC_TEX_CACHE = {};
  // đĩa phanh xe phổ thông: đĩa trơn tản nhiệt trong, mặt ma sát tiện tròn sáng, gờ mép gỉ; xe đỗ lâu mặt đĩa gỉ cam loang
  // (vài ngày không chạy đã gỉ), moay-ơ đĩa xám đen 4-5 lỗ bu-lông. sport: đĩa khoan lỗ xẻ rãnh (bản cũ)
  function discTexture(age, sport) {
    if (!sport) return plainDiscTexture(age);
    const key = (age || 0).toFixed(1);
    if (DISC_TEX_CACHE[key]) return DISC_TEX_CACHE[key];
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d');
    const cx = 256, cy = 256;

    // Nền moay-ơ đĩa ở giữa (rotor hat) xám nòng súng đậm
    x.fillStyle = '#1c1f24';
    x.beginPath(); x.arc(cx, cy, 250, 0, Math.PI * 2); x.fill();

    // Vành ma sát phanh (rotor friction ring): kim loại thép phay sáng
    const grad = x.createRadialGradient(cx, cy, 100, cx, cy, 246);
    grad.addColorStop(0, '#c2c8d0');
    grad.addColorStop(0.5, '#dfe5ec');
    grad.addColorStop(1, '#b4bcc5');
    x.fillStyle = grad;
    x.beginPath(); x.arc(cx, cy, 246, 0, Math.PI * 2); x.arc(cx, cy, 102, 0, Math.PI * 2, true); x.fill();

    // Vân phay tiện xước kim loại tròn đồng tâm (machined grooves)
    for (let r = 104; r < 244; r += 0.8) {
      const alpha = 0.06 + Math.sin(r * 12.3) * 0.05;
      const shade = 200 + Math.sin(r * 34.5) * 55 | 0;
      x.strokeStyle = `rgba(${shade},${shade},${shade},${alpha})`;
      x.lineWidth = 0.7;
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    }

    // Các lỗ khoan tản nhiệt thể thao (cross-drilled holes): 16 hàng xoắn ốc
    for (let i = 0; i < 16; i++) {
      const baseAng = i * Math.PI * 2 / 16;
      for (let j = 0; j < 4; j++) {
        const rad = 122 + j * 30;
        const ang = baseAng + j * 0.09;
        const hx = cx + Math.cos(ang) * rad, hy = cy + Math.sin(ang) * rad;

        // Vát mép kim loại bắt sáng quanh lỗ
        x.fillStyle = 'rgba(245,250,255,0.7)';
        x.beginPath(); x.arc(hx, hy, 4.5, 0, Math.PI * 2); x.fill();

        // Lỗ khoan sâu màu đen
        x.fillStyle = '#0a0c0e';
        x.beginPath(); x.arc(hx, hy, 3.2, 0, Math.PI * 2); x.fill();
      }
    }

    // Rãnh phay xẻ thể thao (slotted grooves): 8 rãnh cong thoát nhiệt
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI * 2 / 8 + 0.15;
      x.strokeStyle = 'rgba(25,28,32,0.85)'; x.lineWidth = 2.4;
      x.beginPath();
      for (let s = 0; s <= 20; s++) {
        const t = s / 20, r = 114 + t * 118, a = ang + t * 0.28;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (s === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();

      // Viền sáng bắt sáng ở mép rãnh
      x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1.0;
      x.beginPath();
      for (let s = 0; s <= 20; s++) {
        const t = s / 20, r = 115 + t * 118, a = ang + t * 0.28 + 0.01;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (s === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
    }

    // Moay-ơ tâm đĩa (rotor hat) với gờ nổi và 5 lỗ ốc
    x.fillStyle = '#1c1f24';
    x.beginPath(); x.arc(cx, cy, 102, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#4a535e'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(cx, cy, 96, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#323740'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(cx, cy, 55, 0, Math.PI * 2); x.stroke();
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5, ox = cx + Math.cos(a) * 62, oy = cy + Math.sin(a) * 62;
      x.fillStyle = '#0e1012'; x.beginPath(); x.arc(ox, oy, 8, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#5a626d'; x.lineWidth = 1.2; x.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    DISC_TEX_CACHE[key] = t;
    return t;
  }

  // ---------------------------------------------------------------------------
  // TIỆN ÍCH HÌNH KHỐI
  // ---------------------------------------------------------------------------
  // hộp bo tròn mọi cạnh (ghế, taplô, biển số...)
  function roundBox(w, h, d, r) {
    r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
    const W = w - 2 * r, H = h - 2 * r, c = Math.min(W, H) * 0.25, s = new THREE.Shape();
    s.moveTo(-W / 2 + c, -H / 2); s.lineTo(W / 2 - c, -H / 2); s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + c);
    s.lineTo(W / 2, H / 2 - c); s.quadraticCurveTo(W / 2, H / 2, W / 2 - c, H / 2); s.lineTo(-W / 2 + c, H / 2);
    s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - c); s.lineTo(-W / 2, -H / 2 + c); s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + c, -H / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -Math.max(0.01, d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  }
  // biên dạng hình thang bo tròn 4 góc khí động học cho gương chiếu hậu
  function mirrorProfileShape(w, hIn, hOut, r, sx) {
    const s = new THREE.Shape();
    const xIn = sx > 0 ? -w / 2 : w / 2, xOut = sx > 0 ? w / 2 : -w / 2, dir = sx > 0 ? 1 : -1;
    s.moveTo(xIn + dir * r, -hIn / 2);
    s.lineTo(xOut - dir * r * 1.2, -hOut / 2);
    s.quadraticCurveTo(xOut, -hOut / 2, xOut, -hOut / 2 + r * 1.2);
    s.lineTo(xOut, hOut / 2 - r * 1.2);
    s.quadraticCurveTo(xOut, hOut / 2, xOut - dir * r * 1.2, hOut / 2);
    s.lineTo(xIn + dir * r, hIn / 2);
    s.quadraticCurveTo(xIn, hIn / 2, xIn, hIn / 2 - r);
    s.lineTo(xIn, -hIn / 2 + r);
    s.quadraticCurveTo(xIn, -hIn / 2, xIn + dir * r, -hIn / 2);
    return s;
  }
  function vnoise3(x, y, z) {
    const h = (i, j, k) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = x - xi, v = y - yi, w = z - zi, f = t => t * t * (3 - 2 * t), a = f(u), b = f(v), c = f(w), L = (p, q, t) => p + (q - p) * t;
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), a), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), a), b), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), a), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), a), b), c);
  }
  // Texture lòng thùng xe ben: tôn thép dày bị đất đá và gầu máy xúc cào xước xát mài mòn, rỉ sét và đất cát đọng
  function dumpBedWearTexture(rnd, age) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
    const x = c.getContext('2d');
    // Nền tôn thép chịu lực công nghiệp màu xám thép mờ
    x.fillStyle = '#4c5257';
    x.fillRect(0, 0, 512, 1024);

    // 1. Dải mài mòn tôn thép sáng ánh kim theo chiều trượt đổ đất đá (dọc trục Z từ cabin về đuôi ben)
    for (let i = 0; i < 48; i++) {
      const cx = rnd() * 512, w = 6 + rnd() * 26, l = 250 + rnd() * 680, y0 = rnd() * (1024 - l);
      const bright = 145 + Math.floor(rnd() * 70);
      const gr = x.createLinearGradient(cx - w * 0.5, 0, cx + w * 0.5, 0);
      gr.addColorStop(0, 'rgba(' + bright + ',' + (bright + 4) + ',' + (bright + 8) + ',0)');
      gr.addColorStop(0.5, 'rgba(' + bright + ',' + (bright + 6) + ',' + (bright + 12) + ',' + (0.45 + rnd() * 0.4) + ')');
      gr.addColorStop(1, 'rgba(' + bright + ',' + (bright + 4) + ',' + (bright + 8) + ',0)');
      x.fillStyle = gr;
      x.fillRect(cx - w * 0.5, y0, w, l);
    }

    // 2. Hàng trăm vệt cào xước mảnh sắc lẹm của đá dăm và sỏi cọ xát
    x.lineCap = 'round';
    for (let i = 0; i < 450; i++) {
      const cx = rnd() * 512, y0 = rnd() * 1024, len = 40 + rnd() * 260;
      const isMetal = rnd() < 0.75;
      const col = isMetal ? (170 + Math.floor(rnd() * 75)) : (35 + Math.floor(rnd() * 30));
      const alpha = isMetal ? (0.25 + rnd() * 0.5) : (0.15 + rnd() * 0.3);
      x.strokeStyle = 'rgba(' + col + ',' + (col + 4) + ',' + (col + 8) + ',' + alpha + ')';
      x.lineWidth = 0.8 + rnd() * 2.4;
      x.beginPath();
      x.moveTo(cx, y0);
      x.lineTo(cx + (rnd() - 0.5) * 12, y0 + len);
      x.stroke();
    }

    // 3. Vết cào sâu của răng gầu máy xúc múc đá (Excavator bucket gouges)
    for (let i = 0; i < 16; i++) {
      const gx = 40 + rnd() * 432, gy = 80 + rnd() * 760, glen = 120 + rnd() * 240;
      x.strokeStyle = 'rgba(28,24,20,0.65)';
      x.lineWidth = 4 + rnd() * 4;
      x.beginPath();
      x.moveTo(gx, gy);
      x.lineTo(gx + (rnd() - 0.5) * 16, gy + glen);
      x.stroke();
      x.strokeStyle = 'rgba(215,228,235,0.75)';
      x.lineWidth = 1.5 + rnd() * 1.5;
      x.beginPath();
      x.moveTo(gx + 2.5, gy);
      x.lineTo(gx + 2.5 + (rnd() - 0.5) * 16, gy + glen);
      x.stroke();
    }

    // 4. Mảng rỉ sét nâu cam loang lổ ở đuôi và mép chân vách thùng
    for (let i = 0; i < 60; i++) {
      const rx = rnd() * 512, ry = rnd() * 1024, rad = 15 + rnd() * 45;
      const rGr = x.createRadialGradient(rx, ry, 0, rx, ry, rad);
      const rCol = rnd() < 0.6 ? '110,48,22,' : '75,32,14,';
      rGr.addColorStop(0, 'rgba(' + rCol + (0.35 + age * 0.4) + ')');
      rGr.addColorStop(0.7, 'rgba(' + rCol + (0.15 + age * 0.2) + ')');
      rGr.addColorStop(1, 'rgba(' + rCol + '0)');
      x.fillStyle = rGr;
      x.beginPath();
      x.arc(rx, ry, rad, 0, Math.PI * 2);
      x.fill();
    }

    // 5. Bụi đất sỏi đọng ở mép trước và mép bên
    const dirtGrad = x.createLinearGradient(0, 0, 512, 0);
    dirtGrad.addColorStop(0, 'rgba(82,72,56,0.55)');
    dirtGrad.addColorStop(0.12, 'rgba(82,72,56,0.02)');
    dirtGrad.addColorStop(0.88, 'rgba(82,72,56,0.02)');
    dirtGrad.addColorStop(1, 'rgba(82,72,56,0.55)');
    x.fillStyle = dirtGrad;
    x.fillRect(0, 0, 512, 1024);

    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  // vũng chất lỏng rò từ xác xe: dầu máy đen bóng (lan rộng nhất, từ khoang máy), nước làm mát xanh, xăng loang ánh cầu vồng
  function fluidDecal(S, rnd, k) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const blob = (cx, cy, r, col, a) => { for (let i = 0; i < 14; i++) { const ox = cx + (rnd() - 0.5) * r, oy = cy + (rnd() - 0.5) * r, rr = r * (0.25 + rnd() * 0.45), gr = x.createRadialGradient(ox, oy, 0, ox, oy, rr); gr.addColorStop(0, col + a + ')'); gr.addColorStop(0.7, col + a * 0.8 + ')'); gr.addColorStop(1, col + '0)'); x.fillStyle = gr; x.beginPath(); x.arc(ox, oy, rr, 0, 7); x.fill(); } };
    blob(128, 90, 70, 'rgba(14,11,8,', 0.85);
    blob(95 + rnd() * 60, 150, 40, 'rgba(40,95,70,', 0.55);
    blob(150, 175, 45, 'rgba(70,60,80,', 0.35);
    blob(128, 120, 85, 'rgba(20,16,12,', 0.22);
    const t = new THREE.CanvasTexture(c);
    const L = S.plan[S.plan.length - 1][0] - S.plan[0][0];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.9 * (0.7 + 0.5 * k), L * (0.7 + 0.5 * k)), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.08, metalness: 0.3, envMap: envCube(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rnd() * 0.6 - 0.3; m.position.set((rnd() - 0.5) * 4, 0.06, 4 + rnd() * 4); m.renderOrder = -1;
    return m;
  }
  // vết cháy sém đạn nổ trên tôn: muội loang không đều đậm ở tâm, vành sơn rộp ngả nâu vàng vì nhiệt, tia muội toả ra,
  // vài mảng sơn cháy trơ tôn xám; mép mờ dần theo nhiễu (không phải đĩa tròn đều)
  const SCORCH_TEX = [];
  function scorchTexture() {
    if (SCORCH_TEX.length < 4) {
      const R = Math.random, c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      let gr = x.createRadialGradient(128, 128, 30, 128, 128, 126);
      gr.addColorStop(0, 'rgba(60,40,22,0)'); gr.addColorStop(0.55, 'rgba(62,52,42,0.28)'); gr.addColorStop(0.75, 'rgba(88,74,58,0.16)'); gr.addColorStop(1, 'rgba(88,74,58,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 46; i++) { const a = R() * 6.28, d = R() * R() * 60, r = 14 + R() * 46, cx = 128 + Math.cos(a) * d, cy = 128 + Math.sin(a) * d; gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(14,11,9,' + (0.16 + R() * 0.2) + ')'); gr.addColorStop(1, 'rgba(14,11,9,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); }
      x.lineCap = 'round'; x.filter = 'blur(1.5px)';
      for (let i = 0; i < 40; i++) { const a = R() * 6.28, r0 = 18 + R() * 25, r1 = 45 + R() * 60; x.strokeStyle = 'rgba(16,12,10,' + (0.06 + R() * 0.14) + ')'; x.lineWidth = 1 + R() * 4; x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.lineTo(128 + Math.cos(a + (R() - 0.5) * 0.1) * r1, 128 + Math.sin(a + (R() - 0.5) * 0.1) * r1); x.stroke(); }
      x.filter = 'none';
      for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = 8 + R() * 30; x.fillStyle = 'rgba(92,88,82,' + (0.35 + R() * 0.3) + ')'; x.beginPath(); x.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + R() * 9, 2 + R() * 6, R() * 3, 0, 7); x.fill(); }
      for (let i = 0; i < 380; i++) { const a = R() * 6.28, d = 20 + Math.pow(R(), 0.7) * 100; x.fillStyle = 'rgba(12,10,8,' + (0.3 + R() * 0.5) + ')'; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0.4 + R() * 1.6, 0, 7); x.fill(); }
      // mép: mặt nạ hình sao méo để vết không tròn xoe
      x.globalCompositeOperation = 'destination-in';
      const n = 20, rr = []; for (let i = 0; i < n; i++) rr.push(0.7 + R() * 0.3);
      x.beginPath(); for (let i = 0; i <= n * 4; i++) { const a = i / (n * 4) * 6.28, f = i / 4, i0 = Math.floor(f) % n, t = f - Math.floor(f), r = 124 * (rr[i0] + (rr[(i0 + 1) % n] - rr[i0]) * t * t * (3 - 2 * t)); x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
      x.filter = 'blur(10px)'; x.fillStyle = '#000'; x.fill(); x.filter = 'none';
      SCORCH_TEX.push(new THREE.CanvasTexture(c));
    }
    return SCORCH_TEX[Math.random() * SCORCH_TEX.length | 0];
  }
  // vũng nhỏ rò từ chỗ trúng đạn: 'coolant' nước làm mát xanh, 'fuel' xăng loang ánh cầu vồng, 'oil' dầu máy đen bóng
  function leakPuddle(type) {
    const R = Math.random, c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const cols = type === 'coolant' ? ['rgba(38,82,66,', 'rgba(52,96,80,', 'rgba(20,24,22,'] : type === 'fuel' ? ['rgba(90,70,110,', 'rgba(60,110,90,', 'rgba(120,100,50,'] : ['rgba(14,11,8,', 'rgba(24,18,12,'];
    for (let i = 0; i < 18; i++) { const cx = 64 + (R() - 0.5) * 50, cy = 64 + (R() - 0.5) * 50, r = 10 + R() * 26, gr = x.createRadialGradient(cx, cy, 0, cx, cy, r), cc = cols[i % cols.length], a = type === 'oil' ? 0.7 : 0.4; gr.addColorStop(0, cc + a + ')'); gr.addColorStop(0.7, cc + a * 0.8 + ')'); gr.addColorStop(1, cc + '0)'); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: 0.05, metalness: 0.3, envMap: envCube(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = R() * 6.28; m.renderOrder = -1;
    return m;
  }
  let TRACK_TEX = null;
  function trackTexture() {
    if (TRACK_TEX) return TRACK_TEX;
    const c = document.createElement('canvas'); c.width = 64; c.height = 512; const x = c.getContext('2d');
    for (let j = 0; j < 512; j++) {
      const cleat = (j % 24) < 9, a = (cleat ? 0.62 : 0.38) * (0.75 + 0.25 * Math.sin(j * 0.37) * Math.sin(j * 0.11));
      const gr = x.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(40,32,24,0)'); gr.addColorStop(0.12, 'rgba(40,32,24,' + a + ')'); gr.addColorStop(0.88, 'rgba(40,32,24,' + a + ')'); gr.addColorStop(1, 'rgba(40,32,24,0)');
      x.fillStyle = gr; x.fillRect(0, j, 64, 1);
    }
    const fade = x.createLinearGradient(0, 0, 0, 512); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.15, 'rgba(0,0,0,0)'); fade.addColorStop(0.85, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = fade; x.fillRect(0, 0, 64, 512);
    TRACK_TEX = new THREE.CanvasTexture(c); TRACK_TEX.wrapT = THREE.RepeatWrapping;
    return TRACK_TEX;
  }
  // mảnh vỡ: đa giác méo 5-8 cạnh, uốn cong / gập nếp ngẫu nhiên
  function shardGeometry(sz, rnd) {
    const n = 5 + Math.floor(rnd() * 4), sh = new THREE.Shape();
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + (rnd() - 0.5) * 0.6, r = sz * (0.3 + 0.4 * rnd()); if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r * (0.5 + rnd())); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(-Math.PI / 2);
    const A = g.attributes.position, bend = (rnd() - 0.5) * 1.6 / sz, fold = rnd() < 0.4 ? (rnd() - 0.5) * 1.5 : 0;
    for (let i = 0; i < A.count; i++) { const x = A.getX(i), z = A.getZ(i); A.setY(i, bend * x * x + (fold ? Math.max(0, z) * fold : 0)); }
    g.computeVertexNormals();
    return g;
  }
  // mặt đường bị tôn / vành sắt cào: vệt xước sáng mảnh + vệt đất bùn xích quệt
  function scrapeTexture(rnd) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 384; const x = c.getContext('2d');
    for (let i = 0; i < 90; i++) {
      const x0 = 40 + rnd() * 176, y0 = 60 + rnd() * 264, a = (rnd() - 0.5) * 0.6 + (rnd() < 0.5 ? 0 : Math.PI / 2), L = 10 + rnd() * 60;
      x.strokeStyle = 'rgba(' + (190 + rnd() * 50 | 0) + ',' + (190 + rnd() * 50 | 0) + ',' + (185 + rnd() * 50 | 0) + ',' + (0.15 + rnd() * 0.35) + ')';
      x.lineWidth = 0.6 + rnd() * 1.4; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); x.stroke();
    }
    for (let i = 0; i < 40; i++) { const r = 8 + rnd() * 26; const gx = x.createRadialGradient(0, 0, 0, 0, 0, r); gx.addColorStop(0, 'rgba(45,36,26,0.45)'); gx.addColorStop(1, 'rgba(45,36,26,0)'); x.save(); x.translate(30 + rnd() * 196, 30 + rnd() * 324); x.scale(1, 0.4 + rnd()); x.fillStyle = gx; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }
    return new THREE.CanvasTexture(c);
  }
  function glassCrumbTexture(rnd) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 6.28, r = Math.pow(rnd(), 0.6) * 110, px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
      const s = 0.8 + rnd() * 2.2;
      const alpha = (0.12 + rnd() * 0.35) * (1 - r / 120);
      x.fillStyle = `rgba(165, 210, 205, ${alpha})`;
      x.fillRect(px, py, s, s);
      if (rnd() < 0.25) {
        x.fillStyle = `rgba(255, 255, 255, ${alpha * 1.5})`;
        x.fillRect(px, py, 0.8, 0.8);
      }
    }
    return new THREE.CanvasTexture(c);
  }
  function mirrorGrimeTexture(rnd, age) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    // Bụi tích ở mép dưới/góc, giữa gương vẫn đủ sạch để đọc phản xạ.
    for (let i = 0; i < 22; i++) {
      const px = rnd() * 160, py = 58 + rnd() * 38, r = 5 + rnd() * 18;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.16 + 0.35 * age})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    // Vệt nước mảnh kéo xuống và một vài dấu lau gương không đều.
    x.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const px = 8 + rnd() * 144, py = rnd() * 65;
      x.strokeStyle = `rgba(255,255,255,${0.08 + age * 0.16})`; x.lineWidth = 0.7 + rnd() * 1.2;
      x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + 2, py + 9, px - 2, py + 18, px + 1, py + 26 + rnd() * 18); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  // mặt gương rạn: tâm va lệch góc, tia nứt toả gãy khúc + vài cung nứt vòng, mép mảnh vỡ bắt sáng
  function mirrorCrackTexture(rnd) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 160, 96);
    const cx = 30 + rnd() * 100, cy = 20 + rnd() * 56; x.lineCap = 'round';
    for (let i = 0, n = 7 + (rnd() * 6 | 0); i < n; i++) {
      let a = i / n * 6.28 + (rnd() - 0.5) * 0.5, px = cx, py = cy;
      x.strokeStyle = `rgba(255,255,255,${0.55 + rnd() * 0.4})`; x.lineWidth = 0.7 + rnd() * 0.9; x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < 6; s++) { a += (rnd() - 0.5) * 0.5; const l = 8 + rnd() * 22; px += Math.cos(a) * l; py += Math.sin(a) * l; x.lineTo(px, py); }
      x.stroke();
    }
    for (let k = 0; k < 2; k++) { const r = 8 + k * 14 + rnd() * 8; x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 0.6; x.beginPath(); x.arc(cx, cy, r, rnd() * 6, rnd() * 6 + 2 + rnd() * 3); x.stroke(); }
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 7); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(cx - 8, cy - 8, 16, 16);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  // vỡ kính đèn: khoét lỗ lởm chởm trên mặt kính (bỏ các tam giác trong một đốm méo quanh tâm va c), mép còn sót
  // giữ trên hốc đèn; trả về tỉ lệ diện tích đã vỡ. c = null -> tâm ngẫu nhiên trên mặt kính
  function holeLens(lens, c, frac, rnd) {
    // kính đèn đang dùng chung với xe khác (shareGeometries): tách bản riêng trước khi khoét — không vỡ lây sang xe khác
    if (lens.geometry.userData.shareKey !== undefined) {
      const own = lens.geometry.clone();
      own.userData = {};
      lens.geometry = own;
    }
    const g = lens.geometry, P = g.attributes.position, I = g.index;
    if (!I) return 0;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere, R = bs.radius * frac;
    if (!c) { const k = (rnd() * P.count) | 0; c = new THREE.Vector3().fromBufferAttribute(P, k).lerp(bs.center, 0.35 + 0.3 * rnd()); }
    const ph = rnd() * 6.28, keep = [], a = I.array, v = new THREE.Vector3();
    let cut = 0;
    for (let i = 0; i < a.length; i += 3) {
      v.set(0, 0, 0);
      for (let q = 0; q < 3; q++) v.x += P.getX(a[i + q]) / 3, v.y += P.getY(a[i + q]) / 3, v.z += P.getZ(a[i + q]) / 3;
      const d = v.distanceTo(c), an = Math.atan2(v.y - c.y, v.x - c.x + v.z - c.z);
      const lim = R * (0.65 + 0.35 * Math.sin(an * 3 + ph) * Math.sin(an * 5.3 - ph) + 0.25 * vnoise3(v.x * 4, v.y * 4, v.z * 4));
      if (d < lim) cut++; else keep.push(a[i], a[i + 1], a[i + 2]);
    }
    g.setIndex(keep);
    return cut / (a.length / 3);
  }
  // atlas 4 kiểu lá rụng (khô nâu cong mép, vàng úa, xanh xỉn, mục đen thủng lỗ) — 2 x 2 ô, nền trong suốt
  let LEAF_TEX = null;
  function leafTexture() {
    if (LEAF_TEX) return LEAF_TEX;
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), R = mulberry(551);
    const cols = [['#6b4a2a', '#4a2f18'], ['#a8842e', '#7a5a1e'], ['#58613a', '#3c4428'], ['#3a2c22', '#241a14']];
    cols.forEach(([c0, c1], i) => {
      const ox = (i % 2) * 128 + 64, oy = (i >> 1) * 128 + 64, L = 50, Wd = 20 + R() * 10;
      x.save(); x.translate(ox, oy); x.rotate(-0.3);
      const gr = x.createLinearGradient(-L, 0, L, 0); gr.addColorStop(0, c1); gr.addColorStop(0.5, c0); gr.addColorStop(1, c1);
      x.fillStyle = gr; x.beginPath(); x.moveTo(-L, 0);
      for (let k = 0; k <= 16; k++) { const t = k / 16, a = -L + 2 * L * t, w = Wd * Math.sin(Math.PI * t) * (0.85 + 0.3 * R()); x.lineTo(a, -w); }
      for (let k = 16; k >= 0; k--) { const t = k / 16, a = -L + 2 * L * t, w = Wd * Math.sin(Math.PI * t) * (0.85 + 0.3 * R()); x.lineTo(a, w); }
      x.fill();
      x.strokeStyle = 'rgba(20,14,8,0.6)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-L - 6, 0); x.lineTo(L, 0); x.stroke();   // cuống + gân giữa
      x.lineWidth = 0.7; for (let k = 1; k < 7; k++) { const a = -L + k * 2 * L / 7; x.beginPath(); x.moveTo(a, 0); x.lineTo(a + 10, -Wd * 0.7); x.moveTo(a, 0); x.lineTo(a + 10, Wd * 0.7); x.stroke(); }
      for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(30,20,10,${0.1 + R() * 0.25})`; x.beginPath(); x.arc((R() - 0.5) * L * 1.6, (R() - 0.5) * Wd, 1 + R() * 3, 0, 7); x.fill(); }
      if (i === 3) { x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc((R() - 0.5) * L * 1.4, (R() - 0.5) * Wd * 0.9, 2 + R() * 5, 0, 7); x.fill(); } x.globalCompositeOperation = 'source-over'; }
      x.restore();
    });
    LEAF_TEX = new THREE.CanvasTexture(c); LEAF_TEX.anisotropy = 4;
    return LEAF_TEX;
  }
  // Chia nhỏ tam giác có cạnh dài hơn maxE (tách cạnh dài nhất tại trung điểm, lặp lại): dầm sắt-xi / thanh chắn / ống dài
  // chỉ có đỉnh ở 2 đầu thì khi bị xích đè không uốn được, thành que thẳng chọc ra khỏi xác. Nội suy position / normal / uv
  function tessellate(geo, maxE) {
    // lưới có chỉ số: trung điểm cạnh dùng chung giữa 2 tam giác kề (ít đỉnh, không hở mép khi uốn)
    const att = ['position', 'normal', 'uv'].filter(n => geo.attributes[n]).map(n => ({ n, s: geo.attributes[n].itemSize, d: Array.from(geo.attributes[n].array) }));
    const pos = att[0].d;
    let cnt = geo.attributes.position.count;
    const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: cnt }, (_, i) => i);
    const cache = new Map(), m2 = maxE * maxE;
    const midOf = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let m = cache.get(key);
      if (m === undefined) { m = cnt++; for (const A of att) for (let k = 0; k < A.s; k++) A.d.push((A.d[a * A.s + k] + A.d[b * A.s + k]) / 2); cache.set(key, m); }
      return m;
    };
    const d2 = (a, b) => (pos[3 * a] - pos[3 * b]) ** 2 + (pos[3 * a + 1] - pos[3 * b + 1]) ** 2 + (pos[3 * a + 2] - pos[3 * b + 2]) ** 2;
    const stack = idx, out = [];
    let guard = 0;
    while (stack.length && guard++ < 300000) {
      const c = stack.pop(), b = stack.pop(), a = stack.pop();
      const e0 = d2(a, b), e1 = d2(b, c), e2 = d2(c, a);
      if (e0 <= m2 && e1 <= m2 && e2 <= m2) { out.push(a, b, c); continue; }
      if (e0 >= e1 && e0 >= e2) { const m = midOf(a, b); stack.push(a, m, c, m, b, c); }
      else if (e1 >= e2) { const m = midOf(b, c); stack.push(b, m, a, m, c, a); }
      else { const m = midOf(c, a); stack.push(c, m, b, m, a, b); }
    }
    for (const v of stack) out.push(v);
    const g = new THREE.BufferGeometry();
    for (const A of att) g.setAttribute(A.n, new THREE.Float32BufferAttribute(A.d, A.s));
    g.setIndex(out);
    return g;
  }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // móp: đẩy đỉnh vào trong theo pháp tuyến tại tâm vết, mép vết gợn nếp nhăn tôn
  function dentGeometry(g, dents) {
    if (!dents.length) return;
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i), dx = 0, dy = 0, dz = 0;
      for (const d of dents) {
        const ex = x - d.x, ey = y - d.y, ez = z - d.z, l2 = ex * ex + ey * ey + ez * ez;
        if (l2 >= d.r * d.r) continue;
        const t = 1 - l2 / (d.r * d.r), k = d.depth * t * t * (0.75 + 0.25 * Math.sin(ex * 5.1 + ey * 3.7 + ez * 4.3 + d.ph));
        dx -= d.nx * k; dy -= d.ny * k; dz -= d.nz * k;
      }
      if (dx || dy || dz) P.setXYZ(i, x + dx, y + dy, z + dz);
    }
    P.needsUpdate = true;
    g.computeVertexNormals();
  }
  // biển số: nền trắng ngà, viền, chữ số; bẩn ố theo tuổi
  function plateTexture(text, age, rnd) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 112;
    const x = c.getContext('2d');
    x.fillStyle = '#dddcd4'; x.fillRect(0, 0, 512, 112);
    const gr = x.createLinearGradient(0, 0, 0, 112); gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(55,50,43,.18)'); x.fillStyle = gr; x.fillRect(0, 0, 512, 112);
    x.strokeStyle = '#252525'; x.lineWidth = 7; x.strokeRect(7, 7, 498, 98);
    x.fillStyle = '#181818'; x.font = '700 68px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 59);
    // chữ dập nổi: gờ sáng mép trên, bóng mép dưới
    x.globalCompositeOperation = 'source-atop';
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1.5; x.strokeText(text, 255, 57.5);
    x.globalCompositeOperation = 'source-over';
    // 2 ốc bắt biển: mũ ốc thép, rỉ chảy xuống
    for (const sx of [96, 416]) {
      const gr2 = x.createLinearGradient(0, 22, 0, 22 + 40 * age + 6); gr2.addColorStop(0, `rgba(120,60,25,${0.25 + 0.5 * age})`); gr2.addColorStop(1, 'rgba(120,60,25,0)');
      x.fillStyle = gr2; x.fillRect(sx - 3, 22, 6, 40 * age + 6);
      x.fillStyle = '#7a7d80'; x.beginPath(); x.arc(sx, 20, 7, 0, 7); x.fill();
      x.fillStyle = '#3a3c3e'; x.fillRect(sx - 5, 19, 10, 2);
    }
    // bùn đường bắn lên từ mép dưới, bụi loang, vết lau tay
    const mud = x.createLinearGradient(0, 112, 0, 40); mud.addColorStop(0, `rgba(88,74,54,${0.15 + 0.45 * age})`); mud.addColorStop(1, 'rgba(88,74,54,0)');
    x.fillStyle = mud; x.fillRect(0, 0, 512, 112);
    for (let i = 0; i < 420 * age + 60; i++) { x.fillStyle = `rgba(${90 + rnd() * 40 | 0},${70 + rnd() * 30 | 0},${40 + rnd() * 20 | 0},${0.035 + rnd() * 0.18 * Math.max(age, 0.25)})`; const s = 2 + rnd() * 18; x.fillRect(rnd() * 512, rnd() * 112, s, s * (0.25 + rnd())); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return t;
  }
  // Biển hộp đèn taxi: nền đen, chữ TAXI vàng phát quang rực rỡ
  const TAXI_SIGN_TEX_CACHE = {};
  function taxiSignTexture(age = 0, burnt = false, rnd = Math.random) {
    const key = `${burnt ? 'b' : (age || 0).toFixed(1)}`;
    if (TAXI_SIGN_TEX_CACHE[key]) return TAXI_SIGN_TEX_CACHE[key];
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const x = c.getContext('2d');

    if (burnt) {
      x.fillStyle = '#141210';
      x.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 300; i++) {
        x.fillStyle = `rgba(10,8,6,${0.3 + rnd() * 0.4})`;
        x.fillRect(rnd() * 512, rnd() * 256, 4 + rnd() * 20, 2 + rnd() * 10);
      }
    } else {
      // Nền đen sâu của màn hiển thị
      x.fillStyle = '#060606';
      x.fillRect(0, 0, 512, 256);

      // Viền bo màn hình
      x.strokeStyle = '#1a1a1a';
      x.lineWidth = 10;
      x.strokeRect(8, 8, 496, 240);

      // Lớp tỏa sáng nhẹ màu vàng cam xung quanh chữ
      x.shadowColor = '#ffb300';
      x.shadowBlur = 18;
      x.fillStyle = '#ffea00';
      x.font = '900 126px "Impact", "Arial Black", "Segoe UI Black", sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.letterSpacing = '6px';
      x.fillText('TAXI', 256, 128);

      // Lớp chữ chính màu vàng sáng rực
      x.shadowBlur = 0;
      x.fillStyle = '#fff033';
      x.fillText('TAXI', 256, 128);

      // Vết bám bụi mờ theo độ cũ của xe
      if (age > 0) {
        for (let i = 0; i < 180 * age; i++) {
          x.fillStyle = `rgba(${75 + rnd() * 35 | 0},${60 + rnd() * 25 | 0},${35 + rnd() * 20 | 0},${0.03 + rnd() * 0.12 * age})`;
          const s = 2 + rnd() * 14;
          x.fillRect(rnd() * 512, rnd() * 256, s, s * (0.3 + rnd()));
        }
      }
    }

    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    TAXI_SIGN_TEX_CACHE[key] = t;
    return t;
  }

  // ---------------------------------------------------------------------------
  // BÁNH: lốp có rãnh dọc + thành lốp phồng, mâm hợp kim 5 chấu (đùn từ biên dạng, vát mép), lòng mâm, môi mâm, đĩa
  // phanh gỉ, cùm phanh, ốp tâm, ốc tắc kê. flat: lốp xẹp bẹp đáy (tâm bánh hạ xuống)
  // ---------------------------------------------------------------------------
  const RIM_CACHE = {};
  function rimFace(R) {
    const key = R.toFixed(2);
    if (RIM_CACHE[key]) return RIM_CACHE[key];
    const parts = [], ri = R * 0.28, ro = R * 0.96, dish = 0.44, len = ro - ri;

    // 5 cặp chấu kép hình chữ V thể thao phay kim cương (tổng cộng 10 nan hoa ghép đôi)
    for (let i = 0; i < 5; i++) {
      const mainAngle = i * (Math.PI * 2 / 5);
      for (const delta of [-0.082, 0.082]) {
        const b = new THREE.BoxGeometry(len, 1, 0.28, 8, 2, 1);
        const A = b.attributes.position;
        for (let k = 0; k < A.count; k++) {
          const x = A.getX(k), t = Math.min(1, Math.max(0, (x + len / 2) / len)), w = R * (0.055 + 0.015 * t);
          const y = A.getY(k), z = A.getZ(k);
          // Vát cạnh mặt trước tạo góc vát kim cương bắt sáng
          const chamfer = z > 0 ? (1 - 0.22 * Math.abs(y)) : 1.0;
          A.setY(k, y * w * 2.2);
          A.setZ(k, (z * chamfer) - dish * Math.pow(1 - t, 1.3));
          A.setX(k, ri + t * len);
        }
        b.computeVertexNormals();
        b.rotateZ(mainAngle + delta);
        parts.push(b);
      }
    }

    // Moay-ơ tâm: vành tròn kết nối chân chấu ở độ sâu -dish
    const hubOuter = new THREE.CylinderGeometry(ri * 1.08, ri * 1.25, 0.24, 30);
    hubOuter.rotateX(Math.PI / 2); hubOuter.translate(0, 0, -dish + 0.02); parts.push(hubOuter);

    // Hốc lõm tâm moay-ơ
    const hubRecess = new THREE.CylinderGeometry(ri * 0.85, ri * 1.05, 0.16, 24);
    hubRecess.rotateX(Math.PI / 2); hubRecess.translate(0, 0, -dish - 0.04); parts.push(hubRecess);

    // Nắp chụp logo trung tâm (Center Cap)
    const cap = new THREE.CylinderGeometry(R * 0.13, R * 0.14, 0.12, 20);
    cap.rotateX(Math.PI / 2); cap.translate(0, 0, -dish + 0.07); parts.push(cap);

    // Vành gờ kim loại sáng quanh nắp chụp
    const capRing = new THREE.TorusGeometry(R * 0.142, 0.025, 8, 24);
    capRing.translate(0, 0, -dish + 0.08); parts.push(capRing);

    // Vành mâm ngoài 2 tầng phay bóng (Double-Stepped Lip)
    const lipPts = [
      [R * 0.87, -0.22],
      [R * 0.90, -0.14],
      [R * 0.91, 0.01],
      [R * 0.95, 0.06],
      [R * 0.985, 0.08],
      [R * 1.0, -0.06]
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const ring = new THREE.LatheGeometry(lipPts, 54);
    ring.rotateX(Math.PI / 2); parts.push(ring);

    RIM_CACHE[key] = mergeGeos(parts);
    return RIM_CACHE[key];
  }
  function mergeGeos(list) {
    const pos = [], nrm = [], idx = []; let off = 0;
    for (let g of list) {
      g = g.index ? g : g;
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); }
      if (g.index) for (const i of g.index.array) idx.push(i + off); else for (let i = 0; i < P.count; i++) idx.push(i + off);
      off += P.count;
    }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); m.setIndex(idx);
    return m;
  }
  function tireGeometry(S, flat) {
    const r = S.r, w = S.tireW, R = r * 0.62, gd = 0.07;
    const P = [[R, -0.47], [R * 1.08, -0.5], [r * 0.8, -0.545], [r * 0.9, -0.54], [r * 0.96, -0.5], [r * 0.99, -0.44], [r, -0.38],
      [r, -0.26], [r - gd, -0.25], [r - gd, -0.19], [r, -0.18], [r, -0.05], [r - gd, -0.04], [r - gd, 0.04], [r, 0.05],
      [r, 0.18], [r - gd, 0.19], [r - gd, 0.25], [r, 0.26], [r, 0.38], [r * 0.99, 0.44], [r * 0.96, 0.5], [r * 0.9, 0.54], [r * 0.8, 0.545], [R * 1.08, 0.5], [R, 0.47]];
    const g = new THREE.LatheGeometry(P.map(([a, b]) => new THREE.Vector2(a, b * w)), 72);
    g.rotateZ(Math.PI / 2);
    // sức nặng xe: lốp bẹp nhẹ chỗ chạm đất, thành lốp phình ra
    if (!flat) { const A = g.attributes.position, lim = -r * 0.955; for (let i = 0; i < A.count; i++) { const y = A.getY(i); if (y < lim + 0.4) { const t = Math.min(1, (lim + 0.4 - y) / 0.4); A.setY(i, Math.max(y, lim)); A.setX(i, A.getX(i) * (1 + 0.05 * t * t)); } } g.computeVertexNormals(); }
    if (flat) {
      // lốp xẹp: phần chạm đất bẹp phẳng, thành lốp phình ra hai bên
      const A = g.attributes.position, lim = -(r - flat);
      for (let i = 0; i < A.count; i++) {
        const y = A.getY(i);
        if (y < lim + 0.6) { const t = Math.min(1, (lim + 0.6 - y) / 0.6); A.setY(i, Math.max(y, lim - 0.02) + (y < lim ? (y - lim) * 0.08 : 0)); A.setX(i, A.getX(i) * (1 + 0.28 * t * t)); }
      }
      g.computeVertexNormals();
    }
    return g;
  }
  // rs: kiểu mâm — 'alloy' mâm đúc nan kép (mặc định), 'steel' mâm thép dập sơn đen / bạc lỗ thoát nhiệt (xe thợ, xe cũ,
  // bánh mất ốp), 'cap' mâm thép có ốp nhựa bạc khe tản nhiệt (taxi, xe phổ thông)
  function wheelGroup(S, mats, sx, flat, rs) {
    const g = new THREE.Group(), r = S.r, w = S.tireW, R = r * 0.62;
    const add = (geo, mat, x, rot) => { const m = new THREE.Mesh(geo, mat); m.position.x = x; if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    add(tireGeometry(S, flat), mats.tire, 0);
    if (!S.isTruck && (rs === 'steel' || rs === 'cap')) {
      add(new THREE.CylinderGeometry(R * 0.98, R * 0.98, w * 0.85, 36, 1, true), mats.barrel, -sx * 0.05, [0, 0, Math.PI / 2]);
      add(new THREE.TorusGeometry(R * 0.985, 0.05, 8, 48), mats.steelRim, sx * 0.6, [0, Math.PI / 2, 0]);
      add(new THREE.TorusGeometry(R * 1.06, 0.075, 7, 48), mats.barrel, sx * 0.55, [0, Math.PI / 2, 0]);
      // lòng mâm côn dập sâu + mặt bích bắt bu-lông, 8 lỗ thoát nhiệt bầu dục
      add(new THREE.CylinderGeometry(R * 0.95, R * 0.46, 0.34, 32, 1, true), mats.steelRim, sx * 0.4, [0, 0, sx * Math.PI / 2]).material.side = THREE.DoubleSide;
      add(new THREE.CylinderGeometry(R * 0.47, R * 0.47, 0.06, 24), mats.steelRim, sx * 0.24, [0, 0, Math.PI / 2]);
      if (rs === 'steel') for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + 0.2, hole = add(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 10), mats.black, sx * 0.4, [0, 0, Math.PI / 2]);
        hole.position.y = Math.cos(a) * R * 0.7; hole.position.z = Math.sin(a) * R * 0.7; hole.scale.set(1, 1, 1.6); hole.rotation.x = a;
      }
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4, nut = add(new THREE.CylinderGeometry(0.06 * R, 0.06 * R, 0.12, 6), mats.chrome, sx * 0.28, [0, 0, Math.PI / 2]);
        nut.position.y = Math.cos(a) * R * 0.25; nut.position.z = Math.sin(a) * R * 0.25;
      }
      add(new THREE.CylinderGeometry(R * 0.13, R * 0.15, 0.2, 14), mats.steelRim, sx * 0.3, [0, 0, Math.PI / 2]);
      const valve = add(new THREE.CylinderGeometry(0.035, 0.045, 0.19, 7), mats.black, sx * 0.66, [0, 0, Math.PI / 2]);
      valve.position.y = -R * 0.84; valve.position.z = R * 0.2;
      if (rs === 'cap') {
        // ốp nhựa: vòm mỏng phủ gần hết mặt mâm, 10 khe tản nhiệt chéo, logo tròn giữa
        const capGeo = new THREE.LatheGeometry([[0, 0.13], [R * 0.3, 0.12], [R * 0.72, 0.07], [R * 0.9, 0.0], [R * 0.95, -0.1]].map(([a, b]) => new THREE.Vector2(a, b)), 40);
        capGeo.rotateZ(-sx * Math.PI / 2);
        add(capGeo, mats.hubcap, sx * 0.52);
        for (let i = 0; i < 10; i++) {
          const a = i * Math.PI / 5, sl = add(roundBox(0.035, R * 0.24, 0.1, 0.015), mats.black, sx * 0.588, [a + 0.3, 0, 0]);   // khe thoát gió sát mặt ốp
          sl.position.y = Math.cos(a) * R * 0.62; sl.position.z = Math.sin(a) * R * 0.62;
        }
        add(new THREE.CylinderGeometry(R * 0.12, R * 0.12, 0.05, 18), mats.cap, sx * 0.66, [0, 0, Math.PI / 2]);
      }
      // đĩa phanh / moay-ơ / cùm phanh sau lòng mâm (nhìn qua lỗ thoát nhiệt)
      const disc = add(new THREE.CylinderGeometry(R * 0.78, R * 0.78, 0.06, 40), mats.disc, sx * 0.02, [0, 0, Math.PI / 2]); disc.userData.brake = true;
      const hub = add(new THREE.CylinderGeometry(R * 0.32, R * 0.34, 0.14, 20), mats.barrel, -sx * 0.04, [0, 0, Math.PI / 2]); hub.userData.brake = true;
      const cal = add(roundBox(0.46, R * 0.66, 0.5, 0.1), mats.caliper, sx * 0.06); cal.userData.brake = true;
      cal.rotation.set(0.68, sx * Math.PI / 2, 0); cal.position.y = R * 0.52; cal.position.z = -R * 0.42;
      return g;
    }

    if (S.isTruck) {
      // Mâm thép dập sâu lòng chịu tải xe tải (Heavy-Duty Truck Steel Wheel)
      // Vành mép ngoài và gờ gá lốp
      add(new THREE.CylinderGeometry(R * 0.98, R * 0.98, w * 0.86, 36, 1, true), mats.barrel, -sx * 0.05, [0, 0, Math.PI / 2]);
      add(new THREE.TorusGeometry(R * 0.985, 0.055, 8, 48), mats.lip, sx * 0.66, [0, Math.PI / 2, 0]);
      // Mặt đĩa mâm thép dập sâu lòng vào trong
      const dishGeo = new THREE.CylinderGeometry(R * 0.94, R * 0.45, 0.35, 32, 1, true);
      add(dishGeo, mats.rim, sx * 0.44, [0, 0, sx * Math.PI / 2]);
      // 8 lỗ dập thoát nhiệt và giảm trọng lượng quanh đĩa mâm
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 2 / 8;
        const hole = add(new THREE.CylinderGeometry(0.18, 0.18, 0.38, 14), mats.black, sx * 0.42, [0, 0, Math.PI / 2]);
        hole.position.y = Math.cos(a) * R * 0.64;
        hole.position.z = Math.sin(a) * R * 0.64;
      }
      // Nắp chụp moay-ơ trục xe tải to bản nhô lồi ở giữa tâm
      const hubGeo = new THREE.CylinderGeometry(R * 0.35, R * 0.38, 0.46, 20);
      add(hubGeo, mats.barrel, sx * 0.65, [0, 0, Math.PI / 2]);
      add(new THREE.SphereGeometry(R * 0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.barrel, sx * 0.88, [0, sx > 0 ? 0 : Math.PI, Math.PI / 2]);
      // 6 bu-lông đai ốc to bản bắt bánh xe tải
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI * 2 / 6;
        const nut = add(new THREE.CylinderGeometry(0.065 * R, 0.065 * R, 0.14, 6), mats.chrome, sx * 0.66, [0, 0, Math.PI / 2]);
        nut.position.y = Math.cos(a) * R * 0.25;
        nut.position.z = Math.sin(a) * R * 0.25;
      }
      // Phanh tang trống công nghiệp to bản màu thép sẫm bên trong
      add(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.38, 32), mats.barrel, -sx * 0.12, [0, 0, Math.PI / 2]);
      return g;
    }

    add(rimFace(R), mats.rim, sx * 0.62, [0, sx * Math.PI / 2, 0]).material.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(R * 0.98, R * 0.98, w * 0.85, 36, 1, true), mats.barrel, -sx * 0.05, [0, 0, Math.PI / 2]);
    add(new THREE.TorusGeometry(R * 0.985, 0.05, 8, 64), mats.lip, sx * 0.66, [0, Math.PI / 2, 0]);
    // Hạt lốp tối che khe mâm và van cao su phá vẻ đối xứng tuyệt đối của bánh xe procedural.
    add(new THREE.TorusGeometry(R * 1.06, 0.075, 7, 48), mats.barrel, sx * 0.57, [0, Math.PI / 2, 0]);
    const valve = add(new THREE.CylinderGeometry(0.035, 0.045, 0.19, 7), mats.black, sx * 0.72, [0, 0, Math.PI / 2]);
    valve.position.y = -R * 0.7; valve.position.z = R * 0.22; valve.rotation.z += 0.18;

    // Đĩa phanh thể thao xước phay kim loại & lỗ tản nhiệt
    add(new THREE.CylinderGeometry(R * 0.78, R * 0.78, 0.06, 48), mats.disc, sx * 0.08, [0, 0, Math.PI / 2]).userData.brake = true;
    add(new THREE.CylinderGeometry(R * 0.32, R * 0.34, 0.14, 24), mats.barrel, sx * 0.02, [0, 0, Math.PI / 2]).userData.brake = true;

    // Cùm phanh thể thao sơn đỏ nổi bật ở góc 10h30
    const cal = add(roundBox(0.48, R * 0.68, 0.52, 0.10), mats.caliper, sx * 0.12);
    cal.rotation.set(0, sx * Math.PI / 2, 0); cal.position.y = R * 0.52; cal.position.z = -R * 0.42; cal.rotation.x = 0.68; cal.userData.brake = true;
    for (let p = -1; p <= 1; p += 2) {
      const pist = add(new THREE.CylinderGeometry(0.08 * R, 0.08 * R, 0.06, 16), mats.chrome, sx * 0.36, [0, 0, Math.PI / 2]);
      pist.position.y = R * 0.52 + p * 0.18 * R; pist.position.z = -R * 0.42;
    }

    // 5 ốc bu-lông mạ crom nằm khít trong hốc moay-ơ giữa các cặp chấu kép
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + Math.PI / 5, nut = add(new THREE.CylinderGeometry(0.045 * R, 0.045 * R, 0.08, 6), mats.chrome, sx * 0.20, [0, 0, Math.PI / 2]);
      nut.position.y = Math.cos(a) * R * 0.22; nut.position.z = Math.sin(a) * R * 0.22;
    }
    return g;
  }
  // bóng tối tiếp đất mềm dưới gầm (ánh trời bị thân xe che)
  let SHADOW_TEX = null;
  function contactShadow(S) {
    if (!SHADOW_TEX) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const x = c.getContext('2d'), img = x.createImageData(64, 128);
      for (let j = 0; j < 128; j++) for (let i = 0; i < 64; i++) {
        const u = Math.abs(i / 63 * 2 - 1), v = Math.abs(j / 127 * 2 - 1), d = Math.pow(u, 4) + Math.pow(v, 8);
        const p = (j * 64 + i) * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = 0; img.data[p + 3] = 255 * Math.max(0, 1 - d) ** 1.5;
      }
      x.putImageData(img, 0, 0); SHADOW_TEX = new THREE.CanvasTexture(c);
    }
    const L = S.plan[S.plan.length - 1][0] - S.plan[0][0], W = 2 * Math.max(...S.plan.map(p => p[1]));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.5, L + 1.5), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.04, (S.plan[0][0] + S.plan[S.plan.length - 1][0]) / 2);
    m.renderOrder = 1;   // vẽ sau vũng dầu / kính vụn / vết cào -> gầm xe che tối cả lớp vết trên đường
    return m;
  }

  // Lòng hốc bánh xe kín: vòm cong ôm sát mép vỏ xe ngoài, vách ngăn đứng bịt kín bên trong ngăn nhìn xuyên qua thân xe
  function wheelWellGeometry(S, az, sx) {
    const Ra = S.r + S.archGap;
    const RaH = Ra + 0.38;
    const botCurve = curve(S.bottom);
    const planCurve = curve(S.plan);
    const flare = S.flare || 0.15;
    const widthAt = z => planCurve(z) + flare * (Math.exp(-(((z - S.axleF) / 3.4) ** 2)) + Math.exp(-(((z - S.axleR) / 3.4) ** 2)));

    const pts = [];
    const SEGS = S.isTruck ? 36 : 24;
    const archR = S.isTruck ? Ra : RaH;
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * Math.PI;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const pz = az + archR * cosA;
      const yBase = botCurve(pz);
      const yPeak = S.r + Ra + 0.04;
      const py = S.isTruck ? (S.r + Ra * sinA) : (yBase + (yPeak - yBase) * Math.pow(Math.max(0, sinA), 0.72));
      // bán tải: vòm hốc bánh sau nằm dưới sàn thùng (hộp che bánh trong thùng thay chỗ), không trồi xuyên sàn
      pts.push([pz, Math.max(0.3, S.isPickup && az === S.axleR ? Math.min(py, 5.3) : py)]);
    }

    const wInner = Math.max(3.6, S.trackHalf - 1.95);
    const xIn = sx * wInner;

    const pos = [], nrm = [], idx = [];
    const N = pts.length;

    // Vành ngoài: luôn nằm lùi vào trong vỏ xe 0.16 đơn vị để tạo gờ mép cua lốp sắc nét, không bao giờ thò ra ngoài
    for (let i = 0; i < N; i++) {
      const curZ = pts[i][0];
      const xOut = sx * (widthAt(curZ) - 0.16);
      pos.push(xOut, pts[i][1], curZ);
      nrm.push(-sx, 0, 0);
    }
    // Vành trong (xIn)
    for (let i = 0; i < N; i++) {
      pos.push(xIn, pts[i][1], pts[i][0]);
      nrm.push(-sx, 0, 0);
    }

    // Dải mặt vòm nối vành ngoài và vành trong
    for (let i = 0; i < N - 1; i++) {
      const a = i, b = i + 1;
      const c = i + N, d = i + 1 + N;
      if (sx > 0) {
        idx.push(a, b, c);
        idx.push(b, d, c);
      } else {
        idx.push(a, c, b);
        idx.push(b, c, d);
      }
    }

    // Vách ngăn đứng bên trong tại xIn bịt kín hốc bánh không cho nhìn xuyên sang bên kia
    const cIdx = pos.length / 3;
    const cY = S.r + 0.25;
    pos.push(xIn, cY, az);
    nrm.push(sx, 0, 0);

    for (let i = 0; i < N - 1; i++) {
      const v1 = N + i;
      const v2 = N + i + 1;
      if (sx > 0) {
        idx.push(cIdx, v2, v1);
      } else {
        idx.push(cIdx, v1, v2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // Tấm sàn gầm xe kín: che kín toàn bộ khoang máy, sàn cabin và cốp dưới gầm
  function underbodyGeometry(S, wInner) {
    const botCurve = curve(S.bottom);
    const zRear = S.plan[0][0] + 0.5;
    const zFront = S.plan[S.plan.length - 1][0] - 0.5;
    const halfW = wInner + 0.15;
    const SEGS = 20;
    const pos = [], nrm = [], idx = [];

    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const z = zRear + (zFront - zRear) * t;
      const y = botCurve(z) + 0.12;
      pos.push(-halfW, y, z);
      nrm.push(0, -1, 0);
      pos.push(halfW, y, z);
      nrm.push(0, -1, 0);
    }
    for (let i = 0; i < SEGS; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c);
      idx.push(b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  // ---------------------------------------------------------------------------
  // XE TẢI NHẸ CABIN LẬT (mẫu dump / truck): cabin dài ~1,7 m, cơ sở 2,95 m, cầu sau bánh đôi, sàn thùng cao ~1 m.
  // Phụ kiện cabin, sắt-xi + gầm, và 1 trong 4 kiểu thùng theo seed: ben (thùng thép tự đổ), lửng (bửng thấp mở được),
  // mui bạt (khung vòm phủ bạt chằng dây), kín (hộp tôn, cửa hậu 2 cánh). Thùng / gầm gom vào nhóm 'dumpBody' (bị cán,
  // móp cùng thân); gương để ngoài nhóm để còn gãy văng được
  // ---------------------------------------------------------------------------
  // top: nóc thùng (đv) — props.js dùng làm hộp va chạm đạn; cols: bảng màu thùng (-1 = cùng màu cabin)
  const TRUCK_BODIES = {
    tipper: { top: 14.8, cols: [0x3f4a3f, 0x5b6066, 0x9a5a22, 0x2e4766, 0x7a2a22, 0x2b2d2f] },
    drop: { top: 16.4, cols: [0xb9bdbf, 0x2f4f7a, 0x5b6066, -1, 0x3f5a3a] },
    tarp: { top: 21.4, cols: [0x2e5f8a, 0x4f6b45, 0x6d6f63, 0x2f3a46, 0x9a5c2a] },
    box: { top: 22.6, cols: [0xd9dbd8, 0xb7bcc0, 0x3b5f8c, 0x8a8d8f, 0xc9b996] }
  };
  // kiểu thùng theo seed (props.js gọi cùng hàm -> bản xa / hộp va chạm khớp bản chi tiết); force: ép kiểu (phòng thử)
  function truckBodyOf(seed, kind, force) {
    const r = mulberry(Math.floor(seed || 1) * 7907 + 31), h = r();
    const W = kind === 'truck' ? [['drop', 0.3], ['tarp', 0.4], ['box', 0.3]] : [['tipper', 0.4], ['drop', 0.2], ['tarp', 0.25], ['box', 0.15]];
    let type = W[W.length - 1][0], a = 0;
    for (const [k, w] of W) { a += w; if (h < a) { type = k; break; } }
    if (force && TRUCK_BODIES[force]) type = force;
    const B = TRUCK_BODIES[type];
    return { type, color: B.cols[r() * B.cols.length | 0], top: B.top };
  }
  // dải phản quang chéo đỏ - trắng (cản sau chống chui gầm): 1 ô lặp ~1,6 đv, phủ đúng chiều cao thanh 0,9 đv
  let STRIPE_TEX = null;
  function stripeTexture() {
    if (STRIPE_TEX) return STRIPE_TEX;
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#e4e2da'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#b01e18';
    for (let i = -2; i < 4; i++) { x.beginPath(); x.moveTo(i * 64, 64); x.lineTo(i * 64 + 32, 64); x.lineTo(i * 64 + 96, 0); x.lineTo(i * 64 + 64, 0); x.fill(); }
    STRIPE_TEX = new THREE.CanvasTexture(c); STRIPE_TEX.wrapS = STRIPE_TEX.wrapT = THREE.RepeatWrapping; STRIPE_TEX.anisotropy = 4;
    STRIPE_TEX.repeat.set(0.31, 1.1); STRIPE_TEX.offset.set(0, 0.5);
    return STRIPE_TEX;
  }
  // sàn gỗ thùng xe: ván dọc thùng, khe ván, mối nối, vệt dầu / đất (uv của hộp bo: u = x, v = z theo đv)
  function woodFloorTexture(rnd, age) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const b = 96 + rnd() * 40 - age * 34;
      x.fillStyle = `rgb(${b * 1.04 | 0},${b * 0.84 | 0},${b * 0.62 | 0})`; x.fillRect(i * 32, 0, 32, 512);
      for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(40,28,18,${0.08 + rnd() * 0.12})`; x.lineWidth = 0.6; const px = i * 32 + rnd() * 32; x.beginPath(); x.moveTo(px, rnd() * 512); x.lineTo(px + (rnd() - 0.5) * 3, rnd() * 512); x.stroke(); }
      x.fillStyle = 'rgba(18,12,8,0.85)'; x.fillRect(i * 32, 0, 2, 512); x.fillRect(i * 32, rnd() * 512, 32, 2);
    }
    for (let k = 0; k < 14; k++) { const px = rnd() * 256, py = rnd() * 512, r = 10 + rnd() * 40, gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(30,24,16,${0.25 + age * 0.3})`); gr.addColorStop(1, 'rgba(30,24,16,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.078, 0.031); t.anisotropy = 4; return t;
  }
  // vải bạt: sợi dệt, đường may nối khổ, phai nắng loang, vệt bẩn mưa chảy, miếng vá (u dọc thân, v quanh mặt cắt; 8 đv / ô)
  function canvasTexture(rnd, age, col) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    const base = new THREE.Color(col).lerp(new THREE.Color(0x8d8a7c), age * 0.35);
    x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1); }
    // đường may nối khổ bạt mỗi ~1,5 m dọc thân: gờ may mờ + chỉ khâu
    for (const u of [0]) { x.fillStyle = 'rgba(0,0,0,0.13)'; x.fillRect(u, 0, 4, 256); x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(u + 4, 0, 2, 256); for (let v = 0; v < 256; v += 6) { x.fillStyle = 'rgba(230,225,210,0.22)'; x.fillRect(u + 1.5, v, 1, 3); } }
    for (let i = 0; i < 18; i++) { const px = rnd() * 256, py = rnd() * 256, r = 20 + rnd() * 60, gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(235,230,215,${0.06 + 0.12 * age})`); gr.addColorStop(1, 'rgba(235,230,215,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
    for (let i = 0; i < 26; i++) { const px = rnd() * 256, py = rnd() * 256; x.strokeStyle = `rgba(40,34,24,${0.08 + 0.15 * age})`; x.lineWidth = 2 + rnd() * 5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 6, py + 20 + rnd() * 60); x.stroke(); }
    for (let i = 0; i < age * 3; i++) {
      const px = rnd() * 230, py = rnd() * 230, w = 10 + rnd() * 18, h = 8 + rnd() * 14, pc = base.clone().offsetHSL((rnd() - 0.5) * 0.03, -0.05, (rnd() - 0.5) * 0.06);
      x.fillStyle = '#' + pc.getHexString(); x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(20,20,20,0.35)'; x.lineWidth = 1; x.setLineDash([2, 2]); x.strokeRect(px + 1, py + 1, w - 2, h - 2); x.setLineDash([]);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  // tấm tôn sóng dựng đứng mặt quay +x (sóng hình thang lặp theo z, bước p, biên độ a): dài L (z), cao H
  function corrugatedPanel(L, H, a, p) {
    const g = new THREE.PlaneGeometry(L, H, Math.max(8, Math.round(L / p) * 6), 1);
    g.rotateY(Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const s = Math.sin(P.getZ(i) / p * Math.PI * 2); P.setX(i, a * Math.sign(s) * Math.min(1, Math.abs(s) * 1.6)); }
    g.computeVertexNormals();
    return g;
  }
  // bạt phủ thùng: mặt cắt (nửa rộng hw, mép dưới yb, vai ys, đỉnh vòm yr) quét dọc z từ zA (đuôi) tới zB (đầu). Bạt võng
  // giữa các vòm khung (bows), sườn bạt hóp vào giữa 2 điểm chằng dây (ties), mép dưới bị dây kéo xuống, nhăn nhẹ
  function tarpGeometry(zA, zB, hw, yb, ys, yr, bows, ties, ph, closedRear) {
    const prof = [], R = 0.6, N1 = 10, N2 = 6, N3 = 16;
    for (let i = 0; i <= N1; i++) prof.push([-hw, yb + (ys - R - yb) * i / N1, 1]);
    for (let i = 1; i <= N2; i++) { const a = Math.PI - i / N2 * Math.PI / 2; prof.push([-hw + R + R * Math.cos(a), ys - R + R * Math.sin(a), 2]); }
    for (let i = 1; i < N3; i++) { const t = i / N3; prof.push([-hw + R + (2 * hw - 2 * R) * t, ys + (yr - ys) * Math.sin(Math.PI * t), 3]); }
    for (let i = 0; i < N2; i++) { const a = Math.PI / 2 - i / N2 * Math.PI / 2; prof.push([hw - R + R * Math.cos(a), ys - R + R * Math.sin(a), 2]); }
    for (let i = 0; i <= N1; i++) prof.push([hw, ys - R - (ys - R - yb) * i / N1, 1]);
    const arc = [0]; for (let i = 1; i < prof.length; i++) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    // 0 tại vòm / điểm chằng, 1 giữa 2 điểm kề
    const gapAt = (z, list) => {
      let a = -1e9, b = 1e9; for (const q of list) { if (q <= z && q > a) a = q; if (q >= z && q < b) b = q; }
      return a < -1e8 || b > 1e8 || b - a < 1e-3 ? 0 : Math.sin(Math.PI * (z - a) / (b - a));
    };
    const NZ = Math.max(24, Math.round((zB - zA) / 0.45)), n = prof.length, pos = [], uv = [], idx = [];
    const ring = [];
    for (let j = 0; j <= NZ; j++) {
      const z = zA + (zB - zA) * j / NZ, gTop = gapAt(z, bows), gSide = gapAt(z, ties), R0 = [];
      for (let i = 0; i < n; i++) {
        let [x, y, part] = prof[i];
        const nn = vnoise3(x * 0.7 + ph, y * 0.7, z * 0.6) - 0.5, n2 = vnoise3(x * 2.1, y * 2.1 + ph, z * 1.9) - 0.5;
        if (part > 1) y -= 0.32 * gTop * (part === 3 ? 1 : 0.5) + 0.08 * nn;
        else {
          // sườn bạt hơi hóp giữa 2 dây chằng, rõ nhất ở mép dưới (dây kéo), nhạt dần lên vai
          const s = Math.sign(x), low = Math.max(0, 1 - (y - yb) / 3.5);
          x -= s * (0.07 * gSide * (0.3 + 0.7 * low) + 0.05 * nn);
          if (y < yb + 0.6) y -= 0.2 * (1 - gSide) * (1 - (y - yb) / 0.6);
        }
        x += 0.03 * n2; y += 0.03 * n2;
        pos.push(x, y, z); uv.push(z / 8, arc[i] / 8); R0.push([x, y]);
      }
      ring.push(R0);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    // vách bạt đầu thùng (phủ khung chắn đầu) và (tuỳ chọn) bạt hậu buông kín: quạt tam giác từ tâm mặt cắt
    const cap = (R0, z, outward) => {
      const base = pos.length / 3, cy = (yb + ys) / 2;
      pos.push(0, cy, z); uv.push(0, cy / 8);
      for (const [x, y] of R0) { pos.push(x, y, z); uv.push(x / 8, y / 8); }
      for (let i = 0; i < n - 1; i++) { if (outward > 0) idx.push(base, base + 2 + i, base + 1 + i); else idx.push(base, base + 1 + i, base + 2 + i); }
    };
    cap(ring[NZ], zB, 1);
    if (closedRear) cap(ring[0], zA, -1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function buildTruck(K) {
    const { S, opts, seed, age, sev, color, env, mats, plain, part, hitAt, wr, car, plateMat, TB } = K;
    const burnt = !!opts.burnt;
    const cabPaint = new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(new THREE.Color(0x9b9589), age * 0.12), roughness: 0.35 + age * 0.18, metalness: 0.5, clearcoat: burnt ? 0 : 0.6, clearcoatRoughness: 0.2, envMap: env, envMapIntensity: 1.1 });
    const chassisMat = plain(new THREE.Color(0x1c1e1e).lerp(new THREE.Color(0x3a2a20), age * 0.5), 0.62, 0.45);
    const edge = plain(0x3e4442, 0.5, 0.6);
    const galv = plain(new THREE.Color(0x868b8e).lerp(new THREE.Color(0x6e665a), age * 0.5), 0.6, 0.5);   // thép mạ kẽm / nhôm xỉn
    const assembly = new THREE.Group(); assembly.userData.acc = 'dumpBody'; car.add(assembly);
    const add = (geo, mat, pos, rot, parent) => part(geo, mat, pos, rot, parent || assembly);
    const box = (size, mat, pos, rad = 0.04, rot, parent) => add(roundBox(...size, rad), mat, pos, rot, parent);
    const blk = (size, mat, pos, rot, parent) => add(new THREE.BoxGeometry(...size), mat, pos, rot, parent);
    const rod = (a, b, r, mat, parent, seg = 8) => {
      const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av);
      const m = add(new THREE.CylinderGeometry(r, r, d.length(), seg), mat, av.clone().add(bv).multiplyScalar(0.5).toArray(), null, parent);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
    };
    const tube = (pts, r, mat, parent, seg = 6) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), Math.max(4, pts.length * 4), r, seg, false), mat, [0, 0, 0], null, parent);
    // mâm thép sơn của xe tải: trắng ngà / bạc / đen (thay mâm hợp kim sáng bóng)
    if (!burnt) { const rc = [0xd2d2cb, 0xa3a8ab, 0x2a2c2e, 0x8f9396][wr() * 4 | 0]; mats.rim = plain(new THREE.Color(rc).lerp(new THREE.Color(0x6a5a48), age * 0.35), 0.45 + 0.25 * age, 0.35, { envMapIntensity: 0.7 }); }
    const railX = 3.05, railY = 4.85;

    // ===== CABIN =====
    // gạt mưa kính chắn gió (vị trí nghỉ sát chân kính)
    const onCabGlass = (gx, gy, lift = 0.025) => { const h = hitAt([gx, gy, 30], [0, 0, -1]); return h ? h.p.clone().addScaledVector(h.n, lift) : null; };
    for (const cfg of [{ pivX: -3.8, pivY: 11.0, p0: [-5.6, 11.3], p1: [-0.6, 11.45], clipX: -3.1, clipY: 11.37 }, { pivX: 1.6, pivY: 11.0, p0: [0.6, 11.3], p1: [5.6, 11.45], clipX: 3.1, clipY: 11.37 }]) {
      const wpr = new THREE.Group(); wpr.userData.acc = 'wiper'; assembly.add(wpr);
      const blade = [], spine = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8, bx = cfg.p0[0] + (cfg.p1[0] - cfg.p0[0]) * t, by = cfg.p0[1] + (cfg.p1[1] - cfg.p0[1]) * t, a = onCabGlass(bx, by, 0.02), b = onCabGlass(bx, by, 0.05); if (a) blade.push(a); if (b) spine.push(b); }
      if (blade.length < 4) continue;
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(blade), 16, 0.024, 5, false), mats.black, [0, 0, 0], null, wpr);
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), 16, 0.032, 6, false), mats.wiper, [0, 0, 0], null, wpr);
      const piv = onCabGlass(cfg.pivX, cfg.pivY, 0.045), clip = onCabGlass(cfg.clipX, cfg.clipY, 0.055);
      if (piv && clip) {
        add(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 12), mats.black, piv.toArray(), [Math.PI * 0.48, 0, 0], wpr);
        blk([0.2, 0.16, 0.1], mats.black, clip.toArray(), null, wpr);
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([piv, piv.clone().lerp(clip, 0.5).add(new THREE.Vector3(0, 0.02, 0.015)), clip]), 10, 0.034, 6, false), mats.wiper, [0, 0, 0], null, wpr);
      }
      wpr.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }
    // tay vịn chữ U lau kính + bậc dẫm chân trên cản
    for (const sx of [-1, 1]) {
      const hx = sx * 4.65;
      blk([0.2, 0.2, 0.08], mats.black, [hx, 9.75, 20.65]); blk([0.2, 0.2, 0.08], mats.black, [hx, 10.55, 20.62]);
      rod([hx, 9.75, 20.65], [hx, 9.75, 20.78], 0.042, mats.dark); rod([hx, 10.55, 20.62], [hx, 10.55, 20.75], 0.042, mats.dark); rod([hx, 9.75, 20.78], [hx, 10.55, 20.75], 0.045, mats.dark);
      box([1.4, 0.06, 0.65], mats.dark, [sx * 5.3, 5.2, 20.65], 0.02);
      for (const dz of [-0.18, 0, 0.18]) blk([1.25, 0.025, 0.06], galv, [sx * 5.3, 5.24, 20.65 + dz]);
    }
    // mặt ca-lăng: khe nắp bảo dưỡng, gân dập chữ V, khoá nắp, huy hiệu; lưới tản nhiệt 4 nan
    blk([12.6, 0.05, 0.04], mats.dark, [0, 8.6, 20.61]);
    for (const sx of [-1, 1]) {
      box([0.16, 1.85, 0.06], cabPaint, [sx * 3.75, 9.6, 20.64], 0.02, [0, 0, -sx * 0.08]);
      blk([0.32, 0.22, 0.05], mats.dark, [sx * 5.65, 9.05, 20.64]); blk([0.16, 0.08, 0.06], mats.chrome, [sx * 5.65, 9.05, 20.67]);
    }
    box([0.95, 0.75, 0.07], mats.chrome, [0, 9.5, 20.66], 0.04); box([0.65, 0.45, 0.08], mats.black, [0, 9.5, 20.68], 0.03);
    box([8.3, 2.7, 0.28], mats.black, [0, 6.95, 20.45], 0.08); blk([8.1, 2.5, 0.06], mats.dark, [0, 6.95, 20.35]);
    [5.95, 6.6, 7.25, 7.9].forEach((gy, gi) => { box([8.15, 0.28, 0.24], mats.dark, [0, gy, 20.58], 0.04); box([8.1, 0.12, 0.26], gi === 2 ? mats.chrome : cabPaint, [0, gy, 20.66], 0.03); });
    // đèn pha vuông: hốc đen, chóa phản xạ đôi, kính khía rãnh mờ, xi nhan hổ phách ngoài
    const reflectorMat = plain(burnt ? 0x2a2622 : 0xb0b8b8, 0.18, 0.85, { envMapIntensity: 0.85 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: burnt ? 0x2a2622 : 0xc4d0cf, roughness: 0.15 + 0.3 * age, metalness: 0, transparent: true, opacity: 0.28 + 0.2 * age, clearcoat: 0.6, envMap: env, envMapIntensity: 0.5, depthWrite: false });
    for (const sx of [-1, 1]) {
      const x = sx * 5.35, y = 6.85, z = 20.55;
      box([2.45, 1.83, 0.24], mats.black, [x, y, z], 0.1);
      box([2.2, 1.58, 0.1], mats.barrel, [x, y, z + 0.12], 0.065);
      for (const dx of [-0.5, 0.45]) { add(new THREE.CylinderGeometry(0.52, 0.4, 0.16, 20), reflectorMat, [x + dx, y, z + 0.15], [Math.PI / 2, 0, 0]); add(new THREE.SphereGeometry(0.1, 8, 6), mats.chrome, [x + dx, y, z + 0.25]); }
      box([2.18, 1.52, 0.04], lensMat, [x, y, z + 0.34], 0.07);
      for (const dx of [-0.6, 0, 0.6]) blk([0.02, 1.35, 0.025], lensMat, [x + dx, y, z + 0.37]);
      box([0.38, 1.55, 0.12], mats.tailAmber, [x + sx * 0.94, y, z + 0.27], 0.055);
    }
    // cản trước thép (xám / đen hoặc cùng màu cabin), tấm chắn dưới, đèn sương mù tròn (một số xe), biển số, móc kéo
    const bumperMat = burnt ? chassisMat : wr() < 0.55 ? plain(new THREE.Color(0x505458).lerp(new THREE.Color(0x3c3a36), age * 0.5), 0.55, 0.35) : cabPaint;
    const bmp = box([14.7, 1.15, 0.95], bumperMat, [0, 4.6, 20.4], 0.2); bmp.userData.acc = 'bumper';
    box([13.2, 0.32, 0.6], chassisMat, [0, 3.85, 20.15], 0.06);
    if (wr() < 0.45) for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 18), mats.black, [sx * 3.9, 4.55, 20.82], [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 18), plain(burnt ? 0x2a2622 : 0xd8dcd2, 0.15, 0.1), [sx * 3.9, 4.55, 20.93], [Math.PI / 2, 0, 0]);
    }
    box([3.9, 1.0, 0.09], mats.black, [0, 4.62, 20.9], 0.04);
    add(new THREE.PlaneGeometry(3.6, 0.82), plateMat, [0, 4.62, 20.96]);
    for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.3, 0.09, 6, 12, Math.PI * 1.3), chassisMat, [sx * 2.4, 3.6, 20.5], [0, Math.PI / 2, Math.PI * 1.15]);
    // bậc lên cabin sau bánh trước (2 nấc thép dập lỗ có pát bắt), vòm cua lốp nhựa đen, tay nắm cửa, đèn xi nhan hông
    for (const sx of [-1, 1]) {
      for (const y of [3.15, 4.25]) { box([1.15, 0.17, 2.0], chassisMat, [sx * 6.9, y, 8.0], 0.04); for (const z of [7.4, 7.8, 8.2, 8.6]) blk([0.9, 0.045, 0.07], galv, [sx * 6.95, y + 0.1, z]); }
      for (const z of [7.2, 8.8]) rod([sx * 5.95, 4.7, z], [sx * 6.85, 3.0, z], 0.09, chassisMat);
      const rIn = S.r + S.archGap, rOut = rIn + 0.38, fW = 0.52, fp = new THREE.Shape();
      fp.absarc(0, 0, rOut, 0, Math.PI, false); fp.lineTo(-rIn, 0); fp.absarc(0, 0, rIn, Math.PI, 0, true); fp.closePath();
      add(new THREE.ExtrudeGeometry(fp, { depth: fW, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.05, bevelThickness: 0.05, curveSegments: 40 }), mats.black, [sx > 0 ? sx * 7.46 - fW : sx * 7.46, S.r, S.axleF], [0, Math.PI / 2, 0]);
      add(new THREE.TorusGeometry(rOut, 0.09, 6, 40, Math.PI), mats.black, [sx * 7.48, S.r, S.axleF], [0, Math.PI / 2, 0]);
      // chắn bùn cao su sau bánh trước, treo dưới sàn cabin
      box([2.0, 3.0, 0.1], mats.black, [sx * 6.3, 2.35, S.axleF - rIn - 0.15], 0.03);
      const surface = (z, y, lift = 0.024) => { const h = hitAt([sx * 12, y, z], [-sx, 0, 0]); return h ? h.p.addScaledVector(h.n, lift) : null; };
      const hp = surface(8.9, 10.35, 0.035);
      if (hp) {
        const grip = new THREE.Group(); grip.position.copy(hp); assembly.add(grip);
        box([0.09, 0.72, 1.8], mats.black, [0, 0, 0], 0.08, null, grip); box([0.05, 0.52, 1.52], mats.dark, [-sx * 0.025, 0, 0], 0.05, null, grip);
        box([0.14, 0.26, 1.2], mats.black, [sx * 0.06, 0.1, 0.08], 0.035, null, grip);
        add(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10), mats.chrome, [sx * 0.04, -0.12, -0.55], [0, 0, Math.PI / 2], grip);
      }
      const sl = surface(18.85, 9.55, 0.035);
      if (sl) { box([0.085, 0.34, 0.68], mats.black, sl.toArray(), 0.035); box([0.095, 0.22, 0.52], mats.tailAmber, [sl.x + sx * 0.045, sl.y, sl.z], 0.035); }
      // ốp chắn mưa khói mờ trên khung kính cửa (nhiều xe tải lắp thêm)
      if (wr() < 0.4) { const h = hitAt([sx * 12, 15.6, 12.5], [-sx, 0, 0]); if (h) box([0.08, 0.42, 8.6], plain(0x0e1216, 0.12, 0.1, { transparent: true, opacity: 0.78 }), [h.p.x + sx * 0.18, 16.0, 12.9], 0.03, [0, 0, -sx * 0.4]); }
    }
    // mái cabin: máng xối 2 mép mui, lưỡi trai che nắng trên kính (một số xe, có đèn hổ phách báo kích thước), cần ăng-ten
    const roofAt = z => { const h = hitAt([0, 40, z], [0, -1, 0]); return h ? h.p.y : 16.7; };
    for (const sx of [-1, 1]) { const hh = hitAt([sx * 6.2, 40, 12], [0, -1, 0]); if (hh) blk([0.14, 0.14, 9.6], chassisMat, [sx * 6.25, hh.p.y + 0.02, 12.6]); }
    const visor = wr() < 0.45 && !burnt, yR = roofAt(17.0);
    if (visor) {
      box([13.2, 0.1, 1.9], wr() < 0.5 ? cabPaint : mats.black, [0, yR - 0.05, 18.35], 0.04, [0.13, 0, 0]);
      for (const x of [-5.5, 0, 5.5]) blk([0.12, 0.35, 0.8], chassisMat, [x, yR - 0.12, 17.6]);
    }
    if (wr() < 0.55) for (const x of [-3, -1.5, 0, 1.5, 3]) box([0.5, 0.24, 0.3], mats.tailAmber, [x, yR + (visor ? 0.12 : 0.1), visor ? 18.6 : 17.1], 0.06);
    if (wr() < 0.4) { rod([-5.9, yR - 0.2, 9.0], [-5.9, yR + 5.5, 8.6], 0.035, mats.black); blk([0.3, 0.25, 0.4], mats.black, [-5.9, yR - 0.1, 9.0]); }
    // ống hút gió cao (snorkel) sau góc cabin phải: lọc gió đặt cao tránh bụi đường
    if (wr() < 0.35) {
      const sx = 1;
      rod([sx * 6.05, 7.6, 6.42], [sx * 6.05, 17.4, 6.42], 0.34, chassisMat, null, 12);
      add(new THREE.CylinderGeometry(0.55, 0.42, 0.7, 12), mats.black, [sx * 6.05, 17.75, 6.42]);
      rod([sx * 6.05, 9.2, 6.42], [sx * 6.05, 9.2, 7.05], 0.3, chassisMat, null, 10);
      for (const y of [10.5, 15.5]) blk([0.9, 0.18, 0.18], galv, [sx * 6.05, y, 6.6]);
    }
    // động cơ / hộp số / két nước dưới sàn cabin (thấy qua gầm, hốc bánh)
    const castIron = plain(0x242628, 0.7, 0.4);
    box([4.6, 2.6, 6.4], castIron, [0, 4.6, 14.2], 0.25); box([3.4, 0.9, 4.0], castIron, [0, 3.1, 14.6], 0.2);
    box([2.6, 2.0, 5.2], castIron, [0, 4.5, 8.6], 0.3);
    box([6.4, 3.4, 0.5], plain(0x1c1e20, 0.85, 0.4), [0, 6.2, 19.0], 0.1);

    // gương chiếu hậu xe tải: 2 cần ống thép từ cánh cửa đỡ gương chính chữ nhật + gương cầu lồi nhỏ bên dưới; gương soi
    // gầm trên góc trước bên phụ. Gắn thẳng vào xe (không gộp khối) để còn gãy văng khi bị húc / quét nòng
    for (const sx of [-1, 1]) {
      const mg = new THREE.Group(); mg.position.set(sx * 7.25, 11.6, 18.3); mg.userData.acc = 'mirror'; car.add(mg);
      const P = (geo, mat, pos, rot) => part(geo, mat, pos, rot, mg);
      const bar = (a, b) => { const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av), m = P(new THREE.CylinderGeometry(0.07, 0.07, d.length(), 6), mats.black, av.clone().add(bv).multiplyScalar(0.5).toArray()); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); };
      // 2 cần ống gập khuỷu: chân bắt bản lề trên cánh cửa / cột A -> vươn ra ngoài -> kẹp vào khung gương
      bar([0, 0, 0], [sx * 1.25, 0.15, 0.5]); bar([sx * 1.25, 0.15, 0.5], [sx * 2.15, 0.25, 0.8]);
      bar([0, 3.4, -0.3], [sx * 1.25, 3.55, 0.45]); bar([sx * 1.25, 3.55, 0.45], [sx * 2.15, 3.5, 0.8]);
      for (const y of [0, 3.4]) P(new THREE.BoxGeometry(0.22, 0.36, 0.36), mats.black, [0, y, y ? -0.3 : 0]);
      P(roundBox(1.7, 2.6, 0.45, 0.14), mats.black, [sx * 2.15, 2.15, 0.85]);
      const gl = P(new THREE.PlaneGeometry(1.5, 2.35), mats.mirror, [sx * 2.15, 2.15, 0.6], [0, Math.PI, 0]); gl.userData.mirrorGlass = true;
      // gương cầu lồi góc rộng bên dưới: vỏ đen + mặt gương cong
      P(roundBox(1.3, 1.05, 0.4, 0.12), mats.black, [sx * 2.15, 0.25, 0.85]);
      const cv = P(new THREE.SphereGeometry(1.0, 10, 4, 0, Math.PI * 2, 0, 0.5), mats.mirror, [sx * 2.15, 0.25, 1.48], [-Math.PI / 2, 0, 0]); cv.userData.mirrorGlass = true; cv.scale.set(1.15, 1, 0.95);
      // hư hỏng theo tình trạng: rạn / rơi mặt kính / bị quệt gập ra sau / gãy mất đầu gương
      if (!burnt && wr() < sev * 0.45) {
        const p = wr();
        if (p < 0.4) gl.material = plain(0x9aa3a6, 0.45, 0.4, { envMapIntensity: 0.6 });
        else if (p < 0.65) gl.material = mats.black;
        else if (p < 0.85) mg.rotation.y = -sx * (0.7 + 0.5 * wr());
        else mg.children.slice(6).forEach(m => mg.remove(m));   // gãy mất đầu gương, còn cần
      }
      if (burnt) { gl.material = mats.black; cv.material = mats.black; }
      mg.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }
    {
      const km = new THREE.Group(); km.position.set(6.2, 15.4, 19.7); km.userData.acc = 'mirror'; car.add(km);
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.7, 0.5, 0.6), new THREE.Vector3(1.0, 0.45, 1.4)]), 10, 0.06, 5, false), mats.black, [0, 0, 0], null, km);
      // gương soi gầm: chén nhựa đen úp xuống, mặt gương cầu lồi nhìn xuống đầu xe
      part(new THREE.CylinderGeometry(0.6, 0.48, 0.32, 14), mats.black, [1.0, 0.42, 1.5], [0.6, 0, 0], km);
      const km2 = part(new THREE.SphereGeometry(0.85, 10, 4, 0, Math.PI * 2, 0, 0.6), mats.mirror, [1.0, 0.99, 1.89], [0.6 + Math.PI, 0, 0], km); km2.userData.mirrorGlass = true;
      km.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }

    // ===== SẮT-XI & GẦM =====
    for (const sx of [-1, 1]) box([0.62, 1.1, 39.5], chassisMat, [sx * railX, railY, -0.5], 0.05);
    for (const z of [17.5, 9.5, 2, -6, -13.5, -19.8]) blk([2 * railX - 0.6, 0.8, 0.5], chassisMat, [0, railY, z]);
    // cầu trước dầm chữ I hạ thấp giữa, cam quay 2 đầu, nhíp lá, giảm chấn, đòn kéo lái
    {
      const fa = S.axleF;
      blk([7.4, 0.55, 0.5], chassisMat, [0, S.r - 0.35, fa]);
      for (const sx of [-1, 1]) {
        rod([sx * 3.65, S.r - 0.35, fa], [sx * 4.95, S.r, fa], 0.24, chassisMat);
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), chassisMat, [sx * 5.05, S.r, fa]);
        for (let k = 0; k < 4; k++) blk([0.6, 0.13, 6.4 - k * 1.25], chassisMat, [sx * railX, railY - 0.68 - k * 0.13, fa]);
        for (const dz of [-0.4, 0.4]) blk([0.7, 0.9, 0.1], edge, [sx * railX, S.r + 0.15, fa + dz]);
        rod([sx * (railX + 0.55), railY - 0.2, fa + 1.0], [sx * (railX + 0.6), S.r + 0.1, fa + 0.55], 0.13, mats.black);
      }
      rod([-railX - 0.4, railY - 0.8, fa + 3.4], [-4.9, S.r + 0.3, fa + 0.9], 0.1, chassisMat);
    }
    // cầu sau: vỏ cầu, quả vi sai, nhíp chính + nhíp phụ, quang nhíp, tai nhíp; trục các-đăng
    {
      const ra = S.axleR;
      add(new THREE.SphereGeometry(1.05, 14, 10), chassisMat, [0, 3.35, ra]); blk([0.72, 0.72, 0.18], edge, [0, 3.35, ra - 0.95]);
      rod([-5.6, 3.35, ra], [5.6, 3.35, ra], 0.28, chassisMat);
      for (const sx of [-1, 1]) {
        const nx = sx * railX;
        [7.6, 6.2, 4.8, 3.4].forEach((l, k) => blk([0.65, 0.14, l], chassisMat, [nx, 3.9 - k * 0.14, ra]));
        blk([0.6, 0.18, 4.2], chassisMat, [nx, 4.15, ra]);
        for (const dz of [-0.65, 0.65]) blk([0.72, 0.85, 0.12], edge, [nx, 3.65, ra + dz]);
        for (const dz of [-3.6, 3.6]) blk([0.45, 0.9, 0.6], edge, [nx, 4.3, ra + dz]);
        rod([sx * (railX + 0.5), railY - 0.3, ra + 1.2], [sx * (railX + 0.55), 3.5, ra + 0.6], 0.13, mats.black);
      }
      rod([0, 4.3, 6.0], [0, 3.8, -3.0], 0.18, chassisMat); rod([0, 3.8, -3.0], [0, 3.35, ra + 0.8], 0.18, chassisMat);
      blk([0.7, 0.9, 0.25], edge, [0, 4.1, -3.0]);
    }
    // bình dầu (trái): thùng chữ D có đai siết, cổ đổ dầu; hộp ắc quy (phải); ống giảm thanh + ống xả chĩa xuống
    {
      const alu = wr() < 0.45;
      const tankMat = alu ? plain(new THREE.Color(0xc4c8ca).lerp(new THREE.Color(0x7a7266), age * 0.5), 0.4, 0.7, { envMapIntensity: 0.9 }) : chassisMat;
      box([2.6, 2.2, 6.2], tankMat, [-4.75, railY - 0.35, -1.2], 0.75);
      for (const z of [-3.4, 1.0]) blk([2.72, 2.3, 0.16], edge, [-4.75, railY - 0.35, z]);
      for (const z of [-3.4, 1.0]) blk([0.9, 0.3, 0.3], edge, [-railX - 0.5, railY, z]);
      add(new THREE.CylinderGeometry(0.24, 0.26, 0.5, 10), tankMat, [-5.5, railY + 0.95, 0.4]); add(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10), mats.black, [-5.5, railY + 1.22, 0.4]);
      box([2.3, 1.55, 3.0], chassisMat, [4.55, railY - 0.25, -1.0], 0.08); box([2.4, 0.2, 3.1], mats.black, [4.55, railY + 0.6, -1.0], 0.05);
      if (wr() < 0.4) { box([2.2, 1.7, 3.4], galv, [4.5, railY - 0.3, -4.4], 0.06); blk([0.08, 0.3, 0.6], mats.black, [5.65, railY, -4.4]); }
      add(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 14), chassisMat, [4.6, 4.15, 4.4], [Math.PI / 2, 0, 0]);
      tube([[4.6, 4.15, 2.8], [5.2, 3.8, 2.2], [5.8, 3.0, 1.9], [5.9, 2.4, 1.85]], 0.17, chassisMat);
      rod([4.0, 4.15, 6.0], [4.6, 4.15, 6.4], 0.18, chassisMat);
    }
    // lốp dự phòng nằm ngang trên giá treo dưới đuôi xe, xích / móc treo lên xà ngang
    {
      const sp = new THREE.Mesh(tireGeometry(Object.assign({}, S, { r: 3.1, tireW: 1.9 }), 0), mats.tire);
      sp.rotation.z = Math.PI / 2; sp.position.set(0, 3.15, -16.7); sp.castShadow = true; assembly.add(sp);
      add(new THREE.CylinderGeometry(1.95, 1.95, 1.3, 18), mats.rim, [0, 3.15, -16.7]);
      for (const z of [-15.2, -18.2]) rod([-2.9, 2.1, z], [2.9, 2.1, z], 0.1, chassisMat);
      for (const x of [-2.6, 2.6]) rod([x, 2.1, -16.7], [x, railY - 0.4, -16.7], 0.08, chassisMat);
    }
    // thanh chắn hông chống chui gầm: 2 thanh ngang mạ kẽm giữa 2 cầu, pát bắt vào sắt-xi
    for (const sx of [-1, 1]) {
      for (const y of [3.9, 5.95]) box([0.16, 0.44, 12.2], galv, [sx * 7.02, y, 0.1], 0.05);
      for (const z of [-5.3, 0.2, 5.5]) { blk([0.14, 2.6, 0.3], galv, [sx * 6.96, 4.9, z]); rod([sx * (railX + 0.31), railY + 0.2, z], [sx * 6.9, 5.6, z], 0.1, chassisMat); }
    }
    // vè chắn bùn bánh đôi sau (nửa vòng tôn) + chắn bùn cao su treo sau bánh
    {
      const D = S.dualR, pairC = D.x - (D.tireW + D.gap) / 2, pairW = 2 * D.tireW + D.gap + 0.45, r = S.r + 0.3;
      for (const sx of [-1, 1]) {
        const pf = new THREE.Shape(); pf.absarc(0, 0, r, 0, Math.PI, false); pf.lineTo(-r + 0.12, 0); pf.absarc(0, 0, r - 0.12, Math.PI, 0, true); pf.closePath();
        add(new THREE.ExtrudeGeometry(pf, { depth: pairW, bevelEnabled: false, curveSegments: 28 }), burnt ? chassisMat : mats.black, [sx * pairC - pairW / 2, S.r, S.axleR], [0, Math.PI / 2, 0]);
        box([pairW - 0.2, 3.6, 0.1], mats.black, [sx * pairC, 2.3, S.axleR - r - 0.2], 0.03);
        blk([pairW, 0.25, 0.18], edge, [sx * pairC, 0.6, S.axleR - r - 0.2]);
      }
    }

    // ===== THÙNG =====
    const type = TB.type, bodyCol = TB.color < 0 ? color.clone() : new THREE.Color(TB.color);
    if (burnt) bodyCol.lerp(new THREE.Color(0x181412), 0.85);
    const zF = 5.75, zR = -20.3, L = zF - zR, zc = (zF + zR) / 2, hw = 7.2, fY = 7.9, pH = 4.3;
    const panelMat = plain(bodyCol.clone().lerp(new THREE.Color(0x77736a), age * 0.25), burnt ? 0.9 : 0.42 + 0.22 * age, TB.color === 0xb9bdbf ? 0.6 : 0.4, { envMapIntensity: 0.9 });
    const railMat = plain(bodyCol.clone().multiplyScalar(0.75), 0.5, 0.45);
    if (type === 'tipper') {
      // --- BEN: thùng thép tự đổ đặt trên sắt-xi phụ, ty ben thuỷ lực dưới sàn, bản lề lật ở đuôi
      const DY = 0.5, tub = new THREE.Group(); tub.position.y = DY; tub.userData.acc = 'dumpBed'; assembly.add(tub);
      const z0 = -20.25, z1 = zF, tl = z1 - z0, tc = (z0 + z1) / 2, floorH = 7.36;
      const outer = panelMat, rib = railMat;
      const inner = new THREE.MeshStandardMaterial({ map: dumpBedWearTexture(wr, age), color: burnt ? 0x3a3028 : 0xffffff, roughness: 0.5 + age * 0.2, metalness: 0.5, envMap: env, envMapIntensity: 0.9 });
      // sàn thép võng giữa, móp lõm do đá rơi, gân dập sóng
      const floorGeo = new THREE.PlaneGeometry(13.9, tl, 24, 44); floorGeo.rotateX(-Math.PI / 2);
      const fP = floorGeo.attributes.position, fd = [];
      for (let i = 0; i < 14; i++) fd.push({ x: (wr() - 0.5) * 11.2, z: tc + (wr() - 0.5) * (tl - 3.2), r: 1 + wr() * 2.2, d: 0.08 + wr() * 0.16 });
      for (let i = 0; i < fP.count; i++) {
        const x = fP.getX(i), z = fP.getZ(i) + tc, nx = x / 6.95, nz = (z - tc) / (tl / 2);
        let dy = -0.09 * Math.max(0, 1 - nx * nx) * Math.max(0, 1 - nz * nz) + 0.035 * Math.sin(x * 1.8) * Math.max(0, 1 - nx * nx);
        for (const d of fd) { const q = Math.hypot(x - d.x, z - d.z); if (q < d.r) dy -= d.d * Math.cos(q / d.r * Math.PI / 2) ** 2; }
        fP.setY(i, floorH + dy); fP.setZ(i, z);
      }
      floorGeo.computeVertexNormals();
      add(floorGeo, inner, [0, 0, 0], null, tub);
      blk([13.9, 0.16, tl], chassisMat, [0, 7.18, tc], null, tub);
      for (const sx of [-1, 1]) {
        box([0.08, 4.05, tl - 0.1], inner, [sx * 7.05, 9.42, tc], 0.02, [0, 0, -sx * 0.045], tub);
        box([0.21, 4.25, tl + 0.05], outer, [sx * 7.13, 9.25, tc], 0.035, [0, 0, -sx * 0.045], tub);
        box([0.44, 0.26, tl + 0.3], rib, [sx * 7.23, 11.47, tc], 0.04, null, tub);
        box([0.36, 0.43, tl + 0.2], rib, [sx * 7.03, 7.2, tc], 0.03, null, tub);
        for (const z of [-19.5, -15, -10.5, -6, -1.5, 3]) box([0.3, 3.92, 0.17], rib, [sx * 7.3, 9.3, z], 0.025, [0, 0, -sx * 0.045], tub);
        for (const z of [-17, -8.5, 0]) blk([0.05, 0.2, 0.8], mats.tailAmber, [sx * 7.47, 7.55, z], null, tub);
        rod([sx * 6.8, 11.1, -20.3], [sx * 7.55, 11.1, -20.3], 0.18, rib, tub);
        box([0.25, 0.9, 0.35], rib, [sx * 6.8, 7.6, -20.55], 0.04, null, tub);
        for (const y of [10.82, 11.35]) blk([0.32, 0.22, 0.5], rib, [sx * 7.04, y, -20.28], null, tub);
        rod([sx * 6.7, 7.45, -20.7], [sx * 6.7, 8.15, -20.7], 0.085, chassisMat, tub);
        blk([0.35, 1.4, 0.8], rib, [sx * (railX + 0.45), 6.4, -20.35], null, tub);
        box([0.45, 0.6, tl], rib, [sx * railX, 6.3, tc], 0.04, null, tub);
        box([0.55, 1.1, tl - 1], chassisMat, [sx * railX, 5.95, tc], 0.04);
        box([0.55, 1.25, 1.1], chassisMat, [sx * railX, 5.65, -20.35], 0.08);
      }
      blk([13.85, 4.1, 0.08], inner, [0, 9.42, z1 - 0.08], null, tub);
      blk([13.75, 3.85, 0.08], inner, [0, 9.42, z0 + 0.08], null, tub);
      for (const z of [-18, -12, -6, 0]) box([13.6, 0.38, 0.4], rib, [0, 6.65, z], 0.03, null, tub);
      // vách đầu cao hơn thành một chút, gân dọc, không mái che cabin (ben nhẹ)
      blk([14.2, 4.38, 0.24], outer, [0, 9.25, z1], null, tub);
      blk([14.2, 2.6, 0.18], outer, [0, 12.75, z1 + 0.02], null, tub);
      box([14.4, 0.3, 0.32], rib, [0, 14.05, z1], 0.03, null, tub);
      for (const x of [-4.5, 0, 4.5]) box([0.25, 6.7, 0.3], rib, [x, 10.75, z1 - 0.14], 0.025, null, tub);
      for (const sx of [-1, 1]) box([0.28, 6.9, 0.4], rib, [sx * 6.95, 10.75, z1 + 0.03], 0.03, null, tub);
      // bửng sau treo bản lề trên
      blk([13.95, 4.05, 0.22], outer, [0, 9.25, z0 - 0.1], null, tub);
      for (const x of [-5.5, -2.75, 0, 2.75, 5.5]) box([0.25, 3.9, 0.26], rib, [x, 9.25, z0 - 0.3], 0.025, null, tub);
      for (const y of [7.27, 11.35]) box([14.3, 0.25, 0.35], rib, [0, y, z0 - 0.25], 0.03, null, tub);
      // đất đá còn sót lại: lớp đất mỏng loang dồn về đuôi thùng, sỏi lẫn
      if (wr() < 0.45) {
        const heap = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), HP = heap.attributes.position;
        for (let i = 0; i < HP.count; i++) { const x = HP.getX(i), y = HP.getY(i), z = HP.getZ(i), q = 0.7 + 0.6 * vnoise3(x * 2.3 + seed, y * 2.1, z * 2.3); HP.setXYZ(i, x * q, y * q, z * q); }
        heap.computeVertexNormals();
        const dirt = plain(new THREE.Color(0x4f4234).lerp(new THREE.Color(0x6b6052), wr()), 0.98, 0);
        const hm = add(heap, dirt, [(wr() - 0.5) * 3, floorH - 0.12, -13 - wr() * 5], [0, wr() * 6.3, 0], tub); hm.scale.set(4.5 + 1.5 * wr(), 0.55 + 0.6 * wr(), 4.5 + 2 * wr());
        for (let i = 0; i < 10; i++) { const m = add(new THREE.DodecahedronGeometry(0.22 + 0.3 * wr(), 0), plain(new THREE.Color(0x6d6a63).lerp(new THREE.Color(0x4a4036), wr()), 0.95, 0), [(wr() - 0.5) * 11, floorH + 0.1, -19 + wr() * 22], [wr() * 3, wr() * 3, wr() * 3], tub); m.castShadow = false; }
      }
      // ty ben thuỷ lực (ống lồng) + giá chữ A, bản lề lật thùng ở đuôi sắt-xi
      const rb = new THREE.Vector3(0, 4.6, -5), rt = new THREE.Vector3(0, 6.45 + DY, 1.8), ra = t => rb.clone().lerp(rt, t).toArray();
      rod(ra(0), ra(0.62), 0.44, chassisMat); rod(ra(0.52), ra(1), 0.22, mats.chrome);
      rod([-1, 4.6, -5], [1, 4.6, -5], 0.2, edge); rod([-1, 6.45 + DY, 1.8], [1, 6.45 + DY, 1.8], 0.2, edge);
      tube([[0.5, 4.5, -3], [0.9, 4.0, -1], [0.7, 5.4, 0.2]], 0.065, mats.black);
      rod([-railX - 0.7, 6.2, -20.35], [railX + 0.7, 6.2, -20.35], 0.18, chassisMat);
    } else {
      // --- SÀN THÙNG CHUNG (lửng / mui bạt / kín): dầm phụ trên sắt-xi, xà ngang đỡ sàn thò ra mép, dầm biên chữ C, sàn
      const sillMat = type === 'box' ? railMat : chassisMat;
      for (const sx of [-1, 1]) box([0.55, 1.5, L - 0.6], chassisMat, [sx * railX, 6.15, zc], 0.04);
      for (let z = zR + 0.8; z <= zF - 0.6; z += 2.55) blk([2 * hw - 0.5, 0.48, 0.36], chassisMat, [0, 7.2, z]);
      for (const sx of [-1, 1]) box([0.24, 0.78, L], sillMat, [sx * (hw - 0.1), 7.55, zc], 0.03);
      box([2 * hw - 0.45, 0.46, L - 0.25], type === 'box' ? chassisMat : plain(0xffffff, 0.85, 0, { map: woodFloorTexture(wr, age), color: burnt ? 0x2a221c : 0xffffff }), [0, 7.67, zc], 0.03);
      for (const sx of [-1, 1]) for (const z of [-16, -8, 0]) blk([0.05, 0.22, 0.7], mats.tailAmber, [sx * (hw + 0.03), 7.55, z]);
      // móc chằng dây dưới dầm biên
      for (const sx of [-1, 1]) for (let z = zR + 1.3; z < zF - 0.5; z += 2.55) add(new THREE.TorusGeometry(0.2, 0.05, 4, 8, Math.PI), galv, [sx * (hw + 0.06), 7.12, z], [0, Math.PI / 2, Math.PI]);
    }
    if (type === 'drop' || type === 'tarp') {
      // --- BỬNG LỬNG: mỗi bên 2 cánh bửng tôn dập 3 gân ngang, mép trên / dưới, 3 bản lề dưới, khoá cài + tay gạt ở 2
      // đầu cánh, cột chống 3 vị trí; bửng sau; vách đầu thấp + giá chắn ống thép (thùng lửng) hoặc vách đầu (mui bạt)
      const posts = [zF - 0.2, zc, zR + 0.2];
      const leaf = (sx, za, zb) => {
        const zl = (za + zb) / 2, ln = zb - za - 0.3;
        blk([0.12, pH - 0.25, ln], panelMat, [sx * hw, fY + pH / 2, zl]);
        for (const y of [fY + 1.05, fY + 2.15, fY + 3.25]) box([0.2, 0.5, ln - 0.2], panelMat, [sx * (hw + 0.05), y, zl], 0.08);
        box([0.24, 0.26, ln + 0.05], railMat, [sx * hw, fY + pH - 0.1, zl], 0.06);
        box([0.22, 0.24, ln], railMat, [sx * hw, fY + 0.14, zl], 0.04);
        for (const k of [-0.33, 0, 0.33]) add(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), galv, [sx * (hw + 0.13), fY + 0.02, zl + k * ln], [Math.PI / 2, 0, 0]);
        for (const [zz, d] of [[za + 0.65, 1], [zb - 0.65, -1]]) { blk([0.16, 0.55, 0.42], galv, [sx * (hw + 0.16), fY + pH - 0.6, zz]); blk([0.1, 0.14, 0.7], mats.black, [sx * (hw + 0.26), fY + pH - 0.85, zz + d * 0.15]); }
      };
      for (const sx of [-1, 1]) {
        leaf(sx, posts[1], posts[0]); leaf(sx, posts[2], posts[1]);
        for (const z of posts) box([0.34, pH + 1.2, 0.34], railMat, [sx * (hw + 0.02), fY + pH / 2 - 0.45, z], 0.05);
      }
      blk([2 * hw - 0.5, pH - 0.25, 0.12], panelMat, [0, fY + pH / 2, zR]);
      for (const y of [fY + 1.05, fY + 2.15, fY + 3.25]) box([2 * hw - 0.9, 0.5, 0.2], panelMat, [0, y, zR - 0.05], 0.08);
      box([2 * hw - 0.3, 0.26, 0.24], railMat, [0, fY + pH - 0.1, zR], 0.06);
      for (const x of [-4.2, 0, 4.2]) add(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), galv, [x, fY + 0.02, zR - 0.13], [0, 0, Math.PI / 2]);
      for (const sx of [-1, 1]) { blk([0.42, 0.55, 0.16], galv, [sx * (hw - 0.75), fY + pH - 0.6, zR - 0.16]); blk([0.7, 0.14, 0.1], mats.black, [sx * (hw - 0.9), fY + pH - 0.85, zR - 0.26]); }
      blk([2 * hw + 0.1, pH, 0.18], panelMat, [0, fY + pH / 2, zF]);
      for (const y of [fY + 1.05, fY + 2.15, fY + 3.25]) box([2 * hw - 0.3, 0.5, 0.2], panelMat, [0, y, zF + 0.05], 0.08);
    }
    if (type === 'drop') {
      // giá chắn đầu bằng ống thép (che kính hậu cabin khỏi hàng xô)
      const yT = 16.2;
      for (const x of [-(hw - 0.15), hw - 0.15]) box([0.3, yT - fY - pH + 0.2, 0.3], railMat, [x, (fY + pH + yT) / 2, zF], 0.05);
      rod([-(hw - 0.15), yT, zF], [hw - 0.15, yT, zF], 0.15, railMat); rod([-(hw - 0.15), 14.1, zF], [hw - 0.15, 14.1, zF], 0.1, railMat);
      for (let x = -hw + 1.4; x < hw - 1.2; x += 1.4) rod([x, fY + pH, zF], [x, yT, zF], 0.065, railMat);
      // hàng trên thùng (một số xe): bao tải xếp chồng, két nhựa, thùng phuy, cuộn bạt buộc dây
      if (wr() < 0.6) {
        const sack = plain(new THREE.Color(0xc9bda0).lerp(new THREE.Color(0x8c7f63), wr()), 0.97, 0);
        const crate = plain([0x2f5f9a, 0xa12a22, 0x3a7d44, 0xd0a020][wr() * 4 | 0], 0.6, 0.05);
        const drum = plain([0x2b4f8f, 0x2f6a3a, 0x8a2a20][wr() * 3 | 0], 0.5, 0.35);
        for (let z = zF - 2.2; z > zR + 2; z -= 2.6 + wr() * 1.5) {
          const k = wr(), x0 = (wr() - 0.5) * 6;
          if (k < 0.4) for (let i = 0; i < 2 + (wr() * 4 | 0); i++) { const s = box([3.0, 0.95, 1.9], sack, [x0 + (i % 2 ? 1.6 : -1.6), fY + 0.5 + Math.floor(i / 2) * 0.88, z], 0.42, [(wr() - 0.5) * 0.1, (wr() - 0.5) * 0.3, (wr() - 0.5) * 0.1]); s.scale.y = 0.85 + 0.3 * wr(); }
          else if (k < 0.65) for (let i = 0; i < 2 + (wr() * 3 | 0); i++) box([2.6, 1.6, 1.9], crate, [x0 + (i % 2) * 2.8 - 1.4, fY + 0.8 + Math.floor(i / 2) * 1.6, z], 0.12, [0, (wr() - 0.5) * 0.15, 0]);
          else if (k < 0.85) for (const dx of [-2.4, 0, 2.4]) { if (wr() < 0.8) add(new THREE.CylinderGeometry(1.15, 1.15, 3.4, 16), drum, [x0 * 0.4 + dx, fY + 1.7, z]); }
          else add(new THREE.CylinderGeometry(0.9, 0.9, 2 * hw - 1.4, 12), plain(0x4f6b45, 0.95, 0), [0, fY + 0.9, z], [0, 0, Math.PI / 2]);
        }
      }
    }
    if (type === 'tarp') {
      // --- MUI BẠT: vòm khung ống thép, bạt phủ chằng dây xuống móc dưới dầm biên; bạt hậu cuộn lên hoặc buông kín
      const ys = 19.55, yr = 21.0, hwT = hw + 0.17, yb = fY + pH - 1.1, rear = wr() < 0.55;
      const bows = []; for (let i = 0, n = 6; i <= n; i++) bows.push(zR + 0.25 + (L - 0.5) * i / n);
      const ties = []; for (let z = zR + 1.3; z < zF - 0.5; z += 2.55) ties.push(z);
      for (const z of bows) tube([[-hw, ys - 0.2, z], [-hw + 0.7, ys + 0.45, z], [0, yr - 0.12, z], [hw - 0.7, ys + 0.45, z], [hw, ys - 0.2, z]], 0.09, railMat);
      for (const sx of [-1, 1]) for (const z of [zR + 0.2, zF - 0.2]) rod([sx * hw, fY + pH, z], [sx * hw, ys - 0.2, z], 0.14, railMat);
      const tarpMat = new THREE.MeshStandardMaterial({ map: canvasTexture(wr, age, bodyCol.getHex()), color: burnt ? 0x2a2420 : 0xffffff, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.25 });
      tarpMat.userData.noWear = true;
      const tGeo = tarpGeometry(zR - 0.12, zF + 0.12, hwT, yb, ys, yr, bows, ties, seed * 0.37, !rear);
      tarpMat.side = THREE.FrontSide;
      add(tGeo, tarpMat, [0, 0, 0]).receiveShadow = true;
      // mặt trong bạt: tối, ánh sáng lọt qua đuôi mở yếu (không sáng như mặt ngoài)
      add(tGeo.clone(), plain(bodyCol.clone().multiplyScalar(0.35), 0.98, 0, { side: THREE.BackSide, envMapIntensity: 0 }), [0, 0, 0]).castShadow = false;
      // dây chằng zic-zắc: lỗ khoen mép bạt -> móc dưới dầm biên -> lỗ khoen kế tiếp
      const rope = plain(new THREE.Color(0xc9b98e).lerp(new THREE.Color(0x6e6450), age), 0.95, 0);
      for (const sx of [-1, 1]) {
        const path = new THREE.CurvePath();
        let prev = new THREE.Vector3(sx * (hwT + 0.03), yb + 0.2, ties[0] - 1.25);
        for (const z of ties) {
          const hook = new THREE.Vector3(sx * (hw + 0.1), 7.1, z), eye = new THREE.Vector3(sx * (hwT + 0.03), yb + 0.2, z + 1.25);
          path.add(new THREE.LineCurve3(prev, hook)); path.add(new THREE.LineCurve3(hook, eye)); prev = eye;
        }
        add(new THREE.TubeGeometry(path, ties.length * 8, 0.045, 4, false), rope, [0, 0, 0]).castShadow = false;
      }
      if (rear) {
        // bạt hậu cuộn tròn buộc trên nóc đuôi, 3 dây buộc
        add(new THREE.CylinderGeometry(0.6, 0.6, 2 * hwT - 0.3, 14), tarpMat, [0, ys - 0.35, zR - 0.35], [0, 0, Math.PI / 2]);
        for (const x of [-4.5, 0, 4.5]) blk([0.12, 1.4, 0.06], rope, [x, ys - 0.6, zR - 0.95]);
      } else {
        blk([0.08, ys - yb - 0.6, 0.03], mats.black, [0, (ys + yb) / 2 - 0.2, zR - 0.16]);   // khe bạt hậu buông kín
        for (const y of [yb + 1.5, yb + 4, yb + 6.5]) blk([0.7, 0.08, 0.05], rope, [0, y, zR - 0.18]);
      }
    }
    if (type === 'box') {
      // --- THÙNG KÍN: vách tôn sóng hoặc tấm phẳng có gân đứng, trụ góc nhôm định hình, viền nóc / chân, nóc tôn; cửa hậu
      // 2 cánh với 4 thanh khoá chốt đứng + tay khoá, bản lề; đèn báo kích thước góc nóc; một số xe có cửa hông, sọc sơn
      const bTop = TB.top - 0.4, yb = 7.15, H = bTop - yb, ym = (yb + bTop) / 2, corr = wr() < 0.5;
      const wallMat = panelMat, postMat = plain(new THREE.Color(0xb5b9bb).lerp(new THREE.Color(0x77706a), age * 0.5), 0.38, 0.65, { envMapIntensity: 0.9 });
      for (const sx of [-1, 1]) {
        if (corr) { const cg = corrugatedPanel(L - 0.4, H - 1.1, 0.09, 0.62); if (sx < 0) cg.rotateY(Math.PI); add(cg, wallMat, [sx * hw, ym + 0.05, zc]); }
        else {
          blk([0.1, H - 1.0, L - 0.3], wallMat, [sx * hw, ym, zc]);
          for (let z = zR + 3.2; z < zF - 1; z += 3.2) blk([0.14, H - 1.1, 0.22], wallMat, [sx * (hw + 0.07), ym, z]);
        }
        box([0.32, 0.45, L + 0.1], postMat, [sx * hw, bTop - 0.22, zc], 0.05);
        box([0.34, 0.75, L + 0.1], postMat, [sx * hw, yb + 0.35, zc], 0.05);
        for (const z of [zF, zR]) box([0.46, H + 0.4, 0.46], postMat, [sx * hw, ym, z], 0.08);
        blk([0.12, 0.3, 0.45], mats.tailAmber, [sx * (hw + 0.2), bTop - 0.65, zF - 0.6]);
        blk([0.12, 0.3, 0.45], mats.tailBrake, [sx * (hw + 0.2), bTop - 0.65, zR + 0.6]);
      }
      blk([2 * hw, H, 0.14], wallMat, [0, ym, zF]);
      if (corr) for (let x = -hw + 0.8; x < hw - 0.6; x += 1.6) blk([0.25, H - 1.0, 0.1], wallMat, [x, ym, zF + 0.1]);
      blk([2 * hw + 0.16, 0.2, L + 0.16], plain(new THREE.Color(0xc8cacb).lerp(new THREE.Color(0x6e6a62), age * 0.6), 0.5, 0.45), [0, bTop + 0.02, zc]);
      // khung cửa hậu: dầm đầu, ngưỡng dưới; 2 cánh cửa có gân, khe giữa, 4 thanh khoá chốt + tay khoá, bản lề
      box([2 * hw, 0.7, 0.4], postMat, [0, bTop - 0.35, zR], 0.05); box([2 * hw, 0.6, 0.4], postMat, [0, yb + 0.3, zR], 0.05);
      blk([0.1, H - 1.3, 0.06], mats.black, [0, ym, zR - 0.05]);
      for (const sx of [-1, 1]) {
        const lw = hw - 0.45, lx = sx * (lw / 2 + 0.06);
        blk([lw, H - 1.3, 0.14], wallMat, [lx, ym, zR - 0.1]);
        for (const dx of [-lw * 0.25, lw * 0.25]) blk([0.2, H - 1.6, 0.08], wallMat, [lx + dx, ym, zR - 0.2]);
        for (const bx of [sx * 1.4, sx * (hw - 1.6)]) {
          rod([bx, yb + 1.1, zR - 0.32], [bx, bTop - 0.95, zR - 0.32], 0.07, galv, null, 6);
          for (const y of [yb + 0.95, bTop - 0.8]) blk([0.3, 0.3, 0.22], galv, [bx, y, zR - 0.26]);
          blk([0.16, 0.16, 0.22], galv, [bx, ym - 1.5, zR - 0.3]);
          box([0.14, 0.14, 1.0], galv, [bx + (bx > 0 ? -0.45 : 0.45), ym - 1.5, zR - 0.42], 0.04, [0, (bx > 0 ? 1 : -1) * 1.2, 0]);
        }
        for (const y of [yb + 1.8, ym - 2.5, ym + 2.5, bTop - 1.6]) blk([0.55, 0.38, 0.2], galv, [sx * (hw - 0.22), y, zR - 0.22]);
      }
      if (wr() < 0.35) {
        // cửa hông bên phụ: khung viền, 2 bản lề, thanh khoá chốt
        const z0 = -6.8, z1 = -1.6, yy = ym - 0.3, hh = H - 2.2;
        for (const [zz, ln] of [[z0, hh], [z1, hh]]) blk([0.08, ln, 0.16], postMat, [hw + 0.12, yy, zz]);
        for (const y of [yy - hh / 2, yy + hh / 2]) blk([0.08, 0.16, z1 - z0], postMat, [hw + 0.12, y, (z0 + z1) / 2]);
        for (const y of [yy - hh / 3, yy + hh / 3]) blk([0.2, 0.4, 0.5], galv, [hw + 0.17, y, z1 + 0.05]);
        rod([hw + 0.25, yy - hh / 2 + 0.4, z0 + 0.8], [hw + 0.25, yy + hh / 2 - 0.4, z0 + 0.8], 0.06, galv, null, 6);
      }
      if (wr() < 0.35) {
        const st = plain([0xa32a22, 0x2a5f9e, 0x2f7a46, 0xd28a1e][wr() * 4 | 0], 0.55, 0.15);
        for (const sx of [-1, 1]) { blk([0.04, 0.55, L - 1.2], st, [sx * (hw + (corr ? 0.13 : 0.16)), ym + 2.2, zc]); blk([0.04, 0.18, L - 1.2], st, [sx * (hw + (corr ? 0.13 : 0.16)), ym + 1.6, zc]); }
      }
    }
    // gió chắn trên nóc cabin hướng luồng gió lên thùng cao (một số xe mui bạt / thùng kín)
    if ((type === 'tarp' || type === 'box') && wr() < 0.4) {
      // khối chắn gió hình nêm (mặt cắt cong lồi, 2 má hông kín) đặt trên nóc cabin
      const yr0 = roofAt(12) - 0.05, y1 = TB.top - 1.0, z0 = 16.2, z1 = 8.2, sh = new THREE.Shape();
      sh.moveTo(z0, yr0); sh.quadraticCurveTo(z0 - 4.2, yr0 + 0.4, z1 + 0.3, y1); sh.lineTo(z1, y1 - 0.15); sh.lineTo(z1, yr0); sh.closePath();
      const wg = new THREE.ExtrudeGeometry(sh, { depth: 12.6, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 10 });
      wg.rotateY(-Math.PI / 2); wg.translate(6.3, 0, 0);
      add(wg, cabPaint, [0, 0, 0]);
    }

    // ===== ĐUÔI XE: cản chống chui gầm sơn phản quang đỏ - trắng, cụm đèn hậu 3 ngăn trong lồng thép, biển số + đèn soi,
    // chốt kéo rơ-moóc (một số xe)
    const stripe = plain(0xffffff, 0.45, 0.1, { map: stripeTexture(), color: burnt ? 0x3a3028 : 0xffffff });
    box([14.0, 0.9, 0.55], stripe, [0, 3.35, -20.75], 0.06);
    for (const sx of [-1, 1]) { blk([0.5, 2.0, 0.5], chassisMat, [sx * railX, 4.1, -20.5]); rod([sx * railX, 4.9, -18.8], [sx * railX, 3.6, -20.5], 0.12, chassisMat); }
    // mỗi ngăn đèn: chóa mạ bạc khía gối + chóa crôm lõm nông + bóng đèn, che bằng kính phẳng lọc màu (trong / hổ phách /
    // đỏ) + lớp bóng mặt ngoài như đèn hậu xe con (trước đây là 3 khối nhựa màu đặc)
    const tRefl = burnt ? mats.black : plain(new THREE.Color(0xc4c6c8).lerp(new THREE.Color(0x857f75), age * 0.6), 0.3 + 0.25 * age, 0.9, { normalMap: pillowNormalTexture(), normalScale: new THREE.Vector2(0.5, 0.5) });
    tRefl.userData.noWear = true;   // nằm sau kính: không gỉ loang như tôn
    const tBulb = plain(burnt ? 0x2a2622 : 0xd8dcdc, 0.3, 0.1), tGloss = tailGlossMaterial(env, age, false), tLens = {};
    const tLensMat = k => tLens[k] || (tLens[k] = tailFilterMaterial(tintTexture({ clear: [0.9, 0.9, 0.86], amber: [0.95, 0.5, 0.08], red: [0.78, 0.025, 0.018] }[k]), 0, 1, 0, 1, age, 0.3 + 0.6 * age, seed % 10));
    for (const sx of [-1, 1]) {
      const lx = sx * 5.1, ly = 5.35, lz = -20.62;
      blk([0.3, 1.6, 0.3], chassisMat, [sx * 5.1, 6.5, -20.3]);
      box([2.8, 1.1, 0.35], mats.black, [lx, ly, lz], 0.08);
      for (const [dx, k] of [[-0.82, 'clear'], [0, 'amber'], [0.82, 'red']]) {
        const x = lx + sx * dx;
        const rf = new THREE.PlaneGeometry(0.68, 0.82), ruv = rf.attributes.uv;
        for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 0.68, ruv.getY(i) * 0.82);   // uv theo đv: ô khía ~6 mm
        add(rf, tRefl, [x, ly, lz - 0.185], [0, Math.PI, 0]);
        const bw = add(new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.chrome, [x, ly, lz - 0.275], [Math.PI / 2, 0, 0]);
        bw.scale.set(1, 0.28, 1);
        add(new THREE.SphereGeometry(0.075, 10, 8), tBulb, [x, ly, lz - 0.235]);
        if (burnt) continue;   // xác cháy: kính nhựa chảy rụng hết
        const lens = add(new THREE.PlaneGeometry(0.72, 0.86), tLensMat(k), [x, ly, lz - 0.285], [0, Math.PI, 0]);
        lens.castShadow = false;
        const gl = new THREE.Mesh(lens.geometry, tGloss); gl.raycast = () => {}; lens.add(gl);
      }
      for (const dy of [-0.28, 0.28]) blk([2.85, 0.06, 0.18], edge, [lx, ly + dy, lz - 0.24]);
      blk([0.06, 1.15, 0.18], edge, [lx, ly, lz - 0.24]);
    }
    box([3.8, 1.05, 0.08], mats.black, [0, 5.25, -20.62], 0.035);
    add(new THREE.PlaneGeometry(3.5, 0.85), plateMat, [0, 5.25, -20.67], [0, Math.PI, 0]);
    blk([1.6, 0.16, 0.22], edge, [0, 5.85, -20.62]);
    if (wr() < 0.35) { box([1.2, 0.75, 0.32], edge, [0, 4.35, -20.6], 0.05); add(new THREE.TorusGeometry(0.34, 0.11, 8, 14, Math.PI * 1.5), chassisMat, [0, 4.35, -20.9], [0, 0, -Math.PI / 4]); }
    return assembly;
  }
  // Lưới thân / khoang kính gốc của từng mẫu xe (chỉ phụ thuộc SPEC) dựng 1 lần, mỗi xe nhân bản. Kèm cây bao BVH
  // (three-mesh-bvh, có trong game): lúc dựng xe phải dò ~1500 tia lên thân ~50 nghìn tam giác để gắn đèn / gương / gạt mưa
  // / biển số sát mặt tôn — dò thường mất ~3 s mỗi xe (khựng khung khi xe chi tiết nạp dần quanh người chơi), có cây
  // bao còn vài chục ms. Cây bao dựng trên lưới gốc (sắp lại chỉ số tam giác) -> bản nhân dùng chung cây lúc còn nguyên
  // DÙNG CHUNG HÌNH HỌC GIỮA CÁC XE: ~60% hình học một xe chi tiết (ốc, nẹp, đèn, gương, mâm... cùng kích thước) trùng
  // y hệt nội dung với xe khác -> xe dựng sau dùng lại bản đã có (ít bộ nhớ, ít nạp GPU, cây dò tia BVH dựng 1 lần).
  // So khớp theo nội dung (băm 64 bit toàn bộ mảng) nên hình vẽ ra không đổi. Không gộp: thân / khoang và hình học
  // bị biến dạng tại chỗ khi cán / bắn (keep = restGeo), hạt lửa khói (Points, ghi lại mỗi khung).
  const GEO_SHARE = new Map();
  function hashBytes(arr, h) {
    const n4 = arr.byteLength >> 2, v = new Uint32Array(arr.buffer, arr.byteOffset, n4);
    let a = h[0], b = h[1];
    for (let i = 0; i < n4; i++) { const x = v[i]; a = Math.imul(a ^ x, 16777619); b = Math.imul(b ^ x, 2246822519) ^ (b >>> 15); }
    const tail = new Uint8Array(arr.buffer, arr.byteOffset + n4 * 4, arr.byteLength - n4 * 4);
    for (let i = 0; i < tail.length; i++) { a = Math.imul(a ^ tail[i], 16777619); b = Math.imul(b ^ tail[i], 2246822519) ^ (b >>> 15); }
    h[0] = a; h[1] = b;
  }
  function geoShareKey(geo) {
    if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return null;
    const h = [2166136261 | 0, 3266489917 | 0], parts = [];
    for (const k of Object.keys(geo.attributes).sort()) {
      const A = geo.attributes[k];
      if (A.isInterleavedBufferAttribute || !A.array) return null;
      hashBytes(A.array, h);
      parts.push(k, A.itemSize, A.normalized ? 1 : 0, A.array.constructor.name, A.array.length);
    }
    if (geo.index) { hashBytes(geo.index.array, h); parts.push('i', geo.index.array.constructor.name, geo.index.array.length); }
    parts.push(JSON.stringify(geo.groups), geo.drawRange.start, geo.drawRange.count);
    return (h[0] >>> 0).toString(36) + (h[1] >>> 0).toString(36) + '|' + parts.join(',');
  }
  function shareGeometries(root, keep) {
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || keep.has(o.geometry)) return;
      const geo = o.geometry;
      if (geo.userData.shareKey !== undefined) return;   // đã là bản dùng chung
      const key = geoShareKey(geo);
      if (!key) return;
      const have = GEO_SHARE.get(key);
      if (have) { o.geometry = have; if (have !== geo) geo.dispose(); return; }
      geo.userData.shareKey = key;
      GEO_SHARE.set(key, geo);
      // hết xe nào dùng (props.js trả tài nguyên -> dispose) hoặc bị thay (lốp xẹp): bỏ khỏi bảng
      geo.addEventListener('dispose', function drop() { geo.removeEventListener('dispose', drop); if (GEO_SHARE.get(key) === geo) GEO_SHARE.delete(key); delete geo.userData.shareKey; });
    });
  }

  // GỘP CHI TIẾT TĨNH KHI XE CÒN NGUYÊN: ~230-580 lưới / xe -> mỗi (vật liệu, đổ bóng) 1 lưới gộp (toạ độ nướng sẵn trong hệ
  // khung xe, nên shader lão hoá / phong hoá tính theo vị trí ra y hệt). Lưới gốc giữ nguyên, chỉ chuyển sang lớp 1 (camera,
  // bóng đổ, dò tia hiệu ứng chỉ thấy lớp 0 — như cách game ẩn vật theo LOD). Lần đầu xe bị tác động (bắn, cán, húc, quét
  // nòng, vỡ kính, cháy) hoặc khung mềm tự dựng lại: bỏ bản gộp, trả lưới gốc về lớp 0 -> biến dạng / văng / ẩn từng
  // chi tiết như cũ. Không gộp: lưới trong suốt (thứ tự vẽ), nhiều vật liệu, có onBeforeRender (thân xe cập nhật uniform
  // cho shader lão hoá), renderOrder riêng, không cắt theo khung nhìn. (geo.groups của Box / Cylinder bỏ qua được: 1 vật
  // liệu thì three vẽ cả lưới, không đọc groups.)
  const _mm = new THREE.Matrix4(), _mn = new THREE.Matrix3(), _mv = new THREE.Vector3();
  const OBR0 = THREE.Object3D.prototype.onBeforeRender;
  function dropArray() { this.array = null; }
  function mergeStatic(car) {
    car.updateMatrixWorld(true);
    const inv = _mm.copy(car.matrixWorld).invert().clone();
    const groups = new Map(), shown = [];
    const visit = (o, vis) => {
      vis = vis && o.visible;
      if (o !== car && o.isMesh) {
        const m = o.material, geo = o.geometry;
        const ok = vis && !o.isInstancedMesh && !o.isSkinnedMesh && m && !Array.isArray(m) && !m.transparent && geo && geo.attributes.position &&
          geo.attributes.normal && !(geo.morphAttributes && Object.keys(geo.morphAttributes).length) &&
          o.onBeforeRender === OBR0 && !o.renderOrder && o.frustumCulled && o.layers.mask === 1 && !o.children.length &&
          geo.drawRange.start === 0 && geo.drawRange.count === Infinity && !Object.values(geo.attributes).some(a => a.isInterleavedBufferAttribute);
        if (ok) {
          const sig = Object.keys(geo.attributes).sort().map(k => k + geo.attributes[k].itemSize).join(',') + (geo.index ? '|i' : '|n');
          const key = m.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + sig;
          let G = groups.get(key);
          if (!G) groups.set(key, G = { m, cast: o.castShadow, recv: o.receiveShadow, list: [] });
          G.list.push(o);
        }
      }
      for (const c of o.children) visit(c, vis);
    };
    visit(car, true);
    const merged = [];
    for (const G of groups.values()) {
      if (G.list.length < 2) continue;
      let nv = 0, ni = 0;
      const first = G.list[0].geometry, names = Object.keys(first.attributes);
      for (const o of G.list) { nv += o.geometry.attributes.position.count; if (o.geometry.index) ni += o.geometry.index.count; }
      const out = new THREE.BufferGeometry();
      const arrs = {};
      for (const k of names) arrs[k] = new Float32Array(nv * first.attributes[k].itemSize);
      const idx = first.index ? (nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)) : null;
      let vo = 0, io = 0;
      for (const o of G.list) {
        const geo = o.geometry, n = geo.attributes.position.count;
        const M = _mm.multiplyMatrices(inv, o.matrixWorld);
        _mn.getNormalMatrix(M);
        for (const k of names) {
          const A = geo.attributes[k], s = A.itemSize, D = arrs[k];
          for (let i = 0; i < n; i++) {
            if (k === 'position') { _mv.fromBufferAttribute(A, i).applyMatrix4(M); D[3 * (vo + i)] = _mv.x; D[3 * (vo + i) + 1] = _mv.y; D[3 * (vo + i) + 2] = _mv.z; }
            else if (k === 'normal') { _mv.fromBufferAttribute(A, i).applyMatrix3(_mn).normalize(); D[3 * (vo + i)] = _mv.x; D[3 * (vo + i) + 1] = _mv.y; D[3 * (vo + i) + 2] = _mv.z; }
            else for (let c = 0; c < s; c++) D[s * (vo + i) + c] = A.getComponent ? A.getComponent(i, c) : A.array[i * s + c];
          }
        }
        if (idx) { const I = geo.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
        vo += n;
      }
      for (const k of names) out.setAttribute(k, new THREE.BufferAttribute(arrs[k], first.attributes[k].itemSize, first.attributes[k].normalized));
      if (idx) out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere(); out.computeBoundingBox();
      // bản gộp chỉ để vẽ (không dò tia, không sửa đỉnh, bị bỏ khi tách): nạp GPU xong thì bỏ mảng phía CPU (~4 MB / xe)
      for (const k of names) out.attributes[k].onUpload(dropArray);
      if (idx) out.index.onUpload(dropArray);
      const mesh = new THREE.Mesh(out, G.m);
      mesh.castShadow = G.cast; mesh.receiveShadow = G.recv;
      mesh.raycast = () => {};           // dò tia (đạn, hiệu ứng) vẫn đi vào lưới gốc qua crushApi sau khi tách
      mesh.userData.civMerged = true;
      car.add(mesh);
      merged.push(mesh);
      for (const o of G.list) { o.layers.set(1); shown.push(o); }
    }
    if (!merged.length) return null;
    return function unmerge() {
      for (const m of merged) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); }
      for (const o of shown) o.layers.set(0);
      merged.length = shown.length = 0;
    };
  }

  // ĐÈN LỬA Ô TÔ CHÁY DÙNG CHUNG: trước đây mỗi xe bắt lửa thêm 1 PointLight (không bao giờ gỡ) -> số đèn điểm trong cảnh
  // đổi -> MỌI vật liệu có chiếu sáng đang hiện phải biên dịch lại shader (khoá shader chứa số đèn): khựng hàng giây mỗi
  // xe cháy. Nay cảnh có sẵn FIRE_LIGHTS đèn cố định (StreetSet tạo lúc vào trận); mỗi khung các xe đang cháy gửi yêu cầu
  // (vị trí, độ sáng như cũ), đèn gán cho các đám cháy rọi sáng nhất quanh camera (đèn tầm 32 đv ~ 4 m: đám xa không rọi
  // tới thứ gì thấy được). Cảnh không có nhóm đèn (trang thử xe, phòng xem xe) -> xe tự tạo đèn riêng như cũ.
  const FIRE_LIGHTS = 2;
  const FL = { scene: null, lights: [], req: [], pool: [] };
  function fireLightPool(scene) {
    if (!scene || FL.scene === scene) return FL.lights;
    for (const l of FL.lights) if (l.parent) l.parent.remove(l);
    FL.scene = scene; FL.lights = [];
    for (let i = 0; i < FIRE_LIGHTS; i++) { const l = new THREE.PointLight(0xff6a18, 0, 32, 2); scene.add(l); FL.lights.push(l); }
    return FL.lights;
  }
  const rootOf = o => { while (o.parent) o = o.parent; return o; };
  const _flv = new THREE.Vector3();
  function requestFireLight(obj, x, y, z, k) {
    if (!(k > 0.001)) return;
    const r = FL.pool[FL.req.length] || (FL.pool[FL.req.length] = { obj: null, x: 0, y: 0, z: 0, k: 0, s: 0 });
    obj.localToWorld(_flv.set(x, y, z));
    r.obj = obj; r.x = _flv.x; r.y = _flv.y; r.z = _flv.z; r.k = k;
    FL.req.push(r);
  }
  // gọi 1 lần / khung sau khi các xe cập nhật (props.js StreetSet.update); cam: vị trí camera
  function assignFireLights(cam) {
    const L = FL.lights, Q = FL.req, now = performance.now();
    if (L.length) {
      for (const r of Q) r.s = cam ? r.k / (1 + ((r.x - cam.x) ** 2 + (r.y - (cam.y || 0)) ** 2 + (r.z - cam.z) ** 2) / 1024) : r.k;
      if (Q.length > L.length) Q.sort((a, b) => b.s - a.s);
      let qi = 0;
      for (let i = 0; i < L.length; i++) {
        const l = L[i], U = l.userData;
        // xe ở xa cập nhật cách khung (props.js) -> khung không có yêu cầu: giữ đèn của nó tới 0,3 s, không chớp tắt
        if (U.obj && now - U.t < 300 && U.obj.parent && !Q.some(r => r.obj === U.obj) && Q.length - qi <= L.length - i - 1) continue;
        const r = Q[qi++];
        if (r) { l.position.set(r.x, r.y, r.z); l.intensity = r.k; U.obj = r.obj; U.t = now; }
        else { l.intensity = 0; U.obj = null; }
      }
    }
    for (const r of Q) r.obj = null;
    Q.length = 0;
  }

  // computeVertexNormals của three r128 viết lại trên mảng thô (dựng lại vỏ xe chạy hàng chục lần / s mỗi xe bị bắn, bản
  // của three qua Vector3 + fromBufferAttribute chiếm ~1/5 thời gian mô phỏng). Cùng thứ tự phép toán: mỗi mặt đọc 3 pháp
  // tuyến (Float32) rồi mới ghi (mặt suy biến cộng 1 lần), cộng dồn làm tròn Float32 sau mỗi mặt, chuẩn hoá x * (1 / len)
  // -> kết quả trùng từng bit
  function vertexNormals(geo) {
    const Pa = geo.attributes.position;
    let Na = geo.attributes.normal;
    if (!Na || Pa.isInterleavedBufferAttribute || Na.isInterleavedBufferAttribute || Pa.itemSize !== 3 || Na.itemSize !== 3 || !(Na.array instanceof Float32Array) || (geo.index && geo.index.isInterleavedBufferAttribute)) { geo.computeVertexNormals(); return; }
    const P = Pa.array, N = Na.array, n = Pa.count;
    N.fill(0, 0, 3 * Na.count);
    if (geo.index) {
      const I = geo.index.array, cnt = geo.index.count;
      for (let u = 0; u < cnt; u += 3) {
        const a = 3 * I[u], b = 3 * I[u + 1], c = 3 * I[u + 2];
        const cx = P[c] - P[b], cy = P[c + 1] - P[b + 1], cz = P[c + 2] - P[b + 2];
        const hx = P[a] - P[b], hy = P[a + 1] - P[b + 1], hz = P[a + 2] - P[b + 2];
        const x = cy * hz - cz * hy, y = cz * hx - cx * hz, z = cx * hy - cy * hx;
        const ax = N[a] + x, ay = N[a + 1] + y, az = N[a + 2] + z;
        const bx = N[b] + x, by = N[b + 1] + y, bz = N[b + 2] + z;
        const qx = N[c] + x, qy = N[c + 1] + y, qz = N[c + 2] + z;
        N[a] = ax; N[a + 1] = ay; N[a + 2] = az;
        N[b] = bx; N[b + 1] = by; N[b + 2] = bz;
        N[c] = qx; N[c + 1] = qy; N[c + 2] = qz;
      }
    } else {
      for (let t = 0; t + 2 < n; t += 3) {
        const a = 3 * t, b = a + 3, c = a + 6;
        const cx = P[c] - P[b], cy = P[c + 1] - P[b + 1], cz = P[c + 2] - P[b + 2];
        const hx = P[a] - P[b], hy = P[a + 1] - P[b + 1], hz = P[a + 2] - P[b + 2];
        const x = cy * hz - cz * hy, y = cz * hx - cx * hz, z = cx * hy - cy * hx;
        N[a] = x; N[a + 1] = y; N[a + 2] = z; N[b] = x; N[b + 1] = y; N[b + 2] = z; N[c] = x; N[c + 1] = y; N[c + 2] = z;
      }
    }
    for (let i = 0, m = 3 * Na.count; i < m; i += 3) {
      const x = N[i], y = N[i + 1], z = N[i + 2], inv = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
      N[i] = x * inv; N[i + 1] = y * inv; N[i + 2] = z * inv;
    }
    Na.needsUpdate = true;
  }

  const TEMPLATES = new Map();
  function templateOf(S) {
    let t = TEMPLATES.get(S);
    if (!t) {
      t = { body: bodyGeometry(S), cab: cabinGeometry(S) };
      if (typeof MeshBVHLib !== 'undefined' && MeshBVHLib.MeshBVH) {
        try { t.bodyTree = new MeshBVHLib.MeshBVH(t.body); t.cabTree = new MeshBVHLib.MeshBVH(t.cab); } catch (e) { t.bodyTree = t.cabTree = null; }
      }
      TEMPLATES.set(S, t);
    }
    return t;
  }
  // ---------------------------------------------------------------------------
  // BẢN XA LOW-POLY (props.js vẽ bằng InstancedMesh trước khi xe được nạp bản chi tiết): cùng đường cong thân / khoang
  // kính, cùng vị trí bánh, lấy mẫu thưa. Tam giác chia theo vật liệu bằng đúng luật shader của bản chi tiết: sơn thân,
  // nhựa đen (mép dưới, ốp vòm bánh SUV, cột B, taplô, lòng hốc bánh), kính; đèn pha / hậu / lưới là các mảng chiếu lên
  // mặt thân như cụm đèn bản chi tiết. Toạ độ xe con (mũi +z, mặt đất y = 0). Trả về null với xe tải (props tự vẽ)
  // ---------------------------------------------------------------------------
  const LOD = {};
  const rmaxJ = (a, b, r) => { const qx = a + r, qy = b + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
  function lodGeometry(kind) {
    const k0 = kind === 'taxi' ? 'sedan' : kind;
    if (LOD[k0] !== undefined) return LOD[k0];
    const S = SPEC[k0];
    if (!S || S.isTruck) return (LOD[k0] = null);
    const plan = curve(S.plan), top = curve(S.top), roof = curve(S.cabin);
    const zMin = S.plan[0][0], zMax = S.plan[S.plan.length - 1][0], L = zMax - zMin;
    const out = {};   // lớp -> { p: [], n: [], u: [] } (không chỉ số)
    const put = (key, P, N, i, uv) => { const o = out[key] || (out[key] = { p: [], n: [], u: [] }); o.p.push(P.getX(i), P.getY(i), P.getZ(i)); o.n.push(N.getX(i), N.getY(i), N.getZ(i)); o.u.push(uv[0], uv[1]); };
    // uv cho texture phong hoá của props: u dọc thân, v quanh mặt cắt (0 sườn phải, 0.25 nóc, 0.5 sườn trái)
    const uvOf = (x, y, z, ym) => [(z - zMin) / L, ((Math.atan2(y - ym, x) / (Math.PI * 2)) % 1 + 1) % 1];
    // --- thân dưới + khoang kính: mỗi phần 1 lưới (giữ aRef); vùng sơn / nhựa đen / kính tính từng điểm ảnh trong shader
    // (patchLodMaterial) -> mép kính, ốp nhựa sắc như bản chi tiết dù lưới thưa
    const keepRef = g => { const n = g.toNonIndexed(); const P = n.attributes.position, uv = []; for (let i = 0; i < P.count; i++) uv.push(...uvOf(P.getX(i), P.getY(i), P.getZ(i), (top(P.getZ(i)) + 2) / 2)); n.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); n.deleteAttribute('aRest'); n.deleteAttribute('aCr'); return n; };
    const whole = { body: keepRef(bodyGeometry(S, true)), cab: keepRef(cabinGeometry(S, true)) };
    // --- đèn pha / hậu / lưới / hốc gió: mảng phủ chiếu lên mặt thân (như cụm đèn bản chi tiết), nổi nhẹ khỏi tôn
    const T = templateOf(S), tm = new THREE.Mesh(T.body);
    if (T.bodyTree && MeshBVHLib.acceleratedRaycast) { T.body.boundsTree = T.bodyTree; tm.raycast = MeshBVHLib.acceleratedRaycast; }
    for (const k in S.features) {
      const F = S.features[k], key = F.kind === 'head' || F.kind === 'fog' ? 'glow' : F.kind === 'tail' ? 'red' : 'trim';
      for (const sx of F.sym ? [1] : [1, -1]) {
        const ol = roundedOutline(F.pts.map(p => [p[0], p[1]]), F.r, 3), P = projectFeature(F, sx, tm, ol);
        if (!P) continue;
        const g = capGeometry(P.rings.map(R => R.map(p => p.clone().addScaledVector(P.d, 0.1))), P.center.clone().addScaledVector(P.d, 0.1), P.d, null);
        const gn = g.toNonIndexed(), GP = gn.attributes.position, GN = gn.attributes.normal;
        for (let i = 0; i < GP.count; i++) put(key, GP, GN, i, [0.5, 0.5]);
      }
    }
    // biển số trước / sau: vị trí z trên mặt cản
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const plates = [[S.plates[0], 1], [S.plates[1], -1]].map(([y, dir]) => { rc.set(new THREE.Vector3(0, y, dir * 40), new THREE.Vector3(0, 0, -dir)); const h = rc.intersectObject(tm)[0]; return h ? [y, h.point.z + dir * 0.12] : [y, dir > 0 ? zMax : zMin]; });
    delete T.body.boundsTree;
    const geo = whole;
    for (const k in out) {
      const o = out[k], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
      geo[k] = g;
    }
    const zM = S.cabin[S.cabin.length - 1][0] - 1.6;
    return (LOD[k0] = {
      geo,
      // khung số cho phần lắp ghép bên props: bánh, gương, biển số, hộp đèn taxi, giá nóc, sàn thùng bán tải
      axleF: S.axleF, axleR: S.axleR, r: S.r, trackHalf: S.trackHalf, tireW: S.tireW, zMin, zMax, W: 2 * Math.max(...S.plan.map(p => p[1])),
      belt: top(0), mirror: [plan(zM) + 0.85, top(zM) + 0.75, zM - 0.1], plates,
      roof: z => roof(z), plan: z => plan(z), roofR: S.roofR, roofF: S.roofF, inset: S.inset, tumble: S.tumble,
      suv: !!(S.isSuv && !S.isPickup), pickup: !!S.isPickup
    });
  }
  // ---------------------------------------------------------------------------
  // LÃO HOÁ PHỤ KIỆN (lốp, mâm, nhựa đen, crôm, kính đèn, nội thất, chi tiết sơn rời): xe thật không có món nào sạch bóng
  // như mới đúc. Vá shader vật liệu theo loại, nhiễu lấy theo toạ độ trong hệ xe (uCarInv) -> vết bẩn đứng yên trên chi
  // tiết; chi tiết nhỏ hơn 1 điểm ảnh tắt dần. U = { uCarInv, uAgeW: (bụi, tuổi, gỉ, seed), uWheel: (trục trước, trục
  // sau, bán kính lốp, nửa vết bánh) }
  // ---------------------------------------------------------------------------
  const AGE_COMMON = `
uniform mat4 uCarInv; uniform vec4 uAgeW; uniform vec4 uWheel;
varying vec3 vCarP; varying vec3 vCarN;
float agH(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float agN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(agH(i), agH(i + vec3(1, 0, 0)), f.x), mix(agH(i + vec3(0, 1, 0)), agH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(agH(i + vec3(0, 0, 1)), agH(i + vec3(1, 0, 1)), f.x), mix(agH(i + vec3(0, 1, 1)), agH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float agF(vec3 p) { return 0.5 * agN(p) + 0.25 * agN(p * 2.03 + 1.7) + 0.125 * agN(p * 4.1 + 3.3) + 0.125 * agN(p * 8.3 + 5.1); }
`;
  // Đoạn GLSL theo loại: đổi diffuseColor.rgb, gán agR (độ nhám đích) / agK (tỉ lệ ép độ nhám), agM (giảm kim loại)
  const AGE_GLSL = {
    // lốp: cao su lão hoá ngả xám nâu, bụi đường bám dày nửa dưới / mặt gai, cát kẹt rãnh
    rubber: `
      float low = smoothstep(uWheel.z * 1.4, 0.3, P.y);
      float d = clamp(uAgeW.x * (0.15 + 0.85 * low) * (0.35 + 0.9 * n) + 0.1 * uAgeW.y, 0.0, 0.85);
      c = mix(c, vec3(0.16, 0.155, 0.15), 0.3 * uAgeW.y);
      c = mix(c, vec3(0.3, 0.27, 0.22), d * 0.55);
      agR = 0.95; agK = 0.4 + 0.5 * d;`,
    // mâm / vành / chụp mâm / cùm phanh: bụi phanh nâu đen bám dày quanh moay-ơ và lòng mâm (bánh trước nhiều hơn), bụi
    // đường nửa dưới, mép vành sứt cạ lề (lộ nhôm sáng xước), đốm gỉ trên vành thép
    rim: `
      float az = abs(P.z - uWheel.x) < abs(P.z - uWheel.y) ? uWheel.x : uWheel.y;
      float fr = az == uWheel.x ? 1.35 : 0.8;
      float rad = length(vec2(P.z - az, P.y - uWheel.z)) / (uWheel.z * 0.62);
      float inner = smoothstep(0.75, 0.2, abs(abs(P.x) - uWheel.w));
      // bụi phanh: lớp mịn đều (nhiễu nhỏ ~1 cm), đậm dần vào moay-ơ / lòng mâm, vệt toả theo chiều quay quanh lỗ thoát gió
      float ang0 = atan(P.y - uWheel.z, P.z - az);
      float bd = clamp(fr * (0.3 + 0.55 * uAgeW.y) * (0.6 + 0.5 * agN(P * 11.0 + 1.3) + 0.25 * agN(vec3(ang0 * 7.0, rad * 3.0, az))) * (0.45 + 0.6 * smoothstep(1.05, 0.3, rad) + 0.45 * inner), 0.0, 0.92);
      c = mix(c, vec3(0.095, 0.075, 0.058), bd * 0.75);
      float low = smoothstep(uWheel.z * 1.2, 0.4, P.y) * uAgeW.x;
      c = mix(c, vec3(0.36, 0.32, 0.26), low * 0.45 * (0.5 + n));
      float ang = atan(P.y - uWheel.z, P.z - az);
      float rash = near * step(0.86, rad) * step(rad, 1.06) * smoothstep(0.62, 0.8, agN(vec3(ang * 4.0, az, uAgeW.w))) * (0.25 + 0.75 * uAgeW.y);
      c = mix(c, vec3(0.6, 0.6, 0.58), rash * 0.85);
      float rs = uAgeW.z * smoothstep(0.62, 0.8, agF(P * 3.0 + 7.0));
      c = mix(c, vec3(0.2, 0.085, 0.035), rs * 0.8);
      agR = 0.85; agK = max(max(bd, rash), max(low * 0.5, rs)) * 0.85; agM = max(bd, rs) * 0.7;`,
    // nhựa đen (ốp, gioăng, gạt mưa, lưới, hốc đèn): phơi nắng bạc thành xám phấn ở mặt hứng nắng, bụi bám mặt nằm ngang /
    // thân dưới, vết cào trắng mảnh
    plastic: `
      float upv = clamp(N.y, 0.0, 1.0);
      float chalk = clamp(uAgeW.y * (0.25 + 0.6 * upv) * (0.5 + 0.7 * n), 0.0, 0.85);
      c = mix(c, vec3(0.27, 0.27, 0.26), chalk * 0.55);
      float d = clamp(uAgeW.x * (smoothstep(5.0, 1.0, P.y) * 0.8 + upv * 0.7) * (0.4 + 0.8 * n), 0.0, 0.8);
      c = mix(c, vec3(0.38, 0.35, 0.29), d * 0.55);
      float scr = near * smoothstep(0.985, 1.0, agN(vec3(P.x * 2.0 + P.z * 30.0, P.y * 1.5, P.z * 2.0))) * (0.3 + uAgeW.y);
      c = mix(c, vec3(0.42, 0.42, 0.4), scr);
      agR = 0.88; agK = clamp(chalk * 0.6 + d, 0.0, 1.0);`,
    // crôm / kim loại sáng: mờ xỉn, đốm cặn nước, rỗ gỉ chấm nâu khi cũ
    chrome: `
      float d = clamp(uAgeW.x * 0.5 * (0.4 + n) + 0.2 * uAgeW.y, 0.0, 0.7);
      c = mix(c, vec3(0.45, 0.43, 0.39), d * 0.5);
      float pit = uAgeW.y * smoothstep(0.86, 0.95, agN(P * 14.0 + uAgeW.w)) * near;
      c = mix(c, vec3(0.22, 0.12, 0.06), pit);
      agR = 0.55; agK = clamp(0.25 * uAgeW.y + d * 0.6 + pit, 0.0, 1.0); agM = pit;`,
    // chi tiết sơn rời (vỏ gương, tay nắm, cánh gió, viền cửa): bụi, phai, sứt
    paint: `
      float upv = clamp(N.y, 0.0, 1.0);
      float d = clamp(uAgeW.x * (upv * 0.8 + smoothstep(5.0, 1.0, P.y) * 0.6) * (0.4 + 0.9 * n), 0.0, 0.8);
      float lum = dot(c, vec3(0.3, 0.59, 0.11));
      c = mix(c, vec3(lum * 1.05 + 0.05), 0.25 * uAgeW.y * upv);
      c = mix(c, vec3(0.42, 0.38, 0.31), d * 0.6);
      float chip = near * smoothstep(0.93, 0.97, agN(P * 9.0 + 2.0)) * (0.3 + uAgeW.y);
      c = mix(c, vec3(0.3, 0.3, 0.29), chip);
      agR = 0.8; agK = clamp(d + 0.3 * uAgeW.y, 0.0, 1.0);`,
    // nội thất (ghế nỉ, taplô): sợi vải lấm tấm, bụi phủ mặt trên taplô / nệm
    interior: `
      float upv = clamp(N.y, 0.0, 1.0);
      c *= 0.88 + 0.24 * agN(P * 22.0);
      c = mix(c, vec3(0.36, 0.33, 0.28), clamp((0.15 + 0.5 * uAgeW.y) * upv * (0.4 + n), 0.0, 0.6));
      agR = 0.95; agK = 0.6;`,
    // kính đèn pha nhựa polycarbonate: ố vàng đục loang (nặng ở nửa trên hứng nắng), bụi bám mép dưới
    lens: `
      float haze = clamp(uAgeW.y * (0.35 + 0.65 * smoothstep(-0.2, 0.6, N.y)) * (0.4 + 0.9 * n), 0.0, 0.9);
      c = mix(c, vec3(0.78, 0.7, 0.5), haze * 0.55);
      diffuseColor.a = mix(diffuseColor.a, 0.92, haze * 0.7);
      float d = clamp(uAgeW.x * 0.6 * (0.3 + n) * smoothstep(0.2, -0.6, N.y + 0.2 * n), 0.0, 0.7);
      c = mix(c, vec3(0.4, 0.37, 0.31), d); diffuseColor.a = mix(diffuseColor.a, 1.0, d);
      agR = 0.6; agK = clamp(haze * 0.7 + d, 0.0, 1.0);`,
    // kim loại sẫm (ống xả, gầm, khung): gỉ loang
    metal: `
      float rs = clamp(uAgeW.z * 1.3 * smoothstep(0.45, 0.75, agF(P * 1.6 + 3.0)) + 0.3 * uAgeW.y * n, 0.0, 1.0);
      c = mix(c, mix(vec3(0.12, 0.05, 0.02), vec3(0.3, 0.13, 0.05), agN(P * 6.0)), rs * 0.8);
      agR = 0.92; agK = rs; agM = rs;`
  };
  function ageMaterial(mat, type, U) {
    if (!mat || mat.userData.civAge || !AGE_GLSL[type]) return;
    mat.userData.civAge = type;
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.call(mat) : '';
    mat.extensions = Object.assign(mat.extensions || {}, { derivatives: true });
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      sh.uniforms.uCarInv = U.uCarInv; sh.uniforms.uAgeW = U.uAgeW; sh.uniforms.uWheel = U.uWheel;
      sh.vertexShader = AGE_COMMON + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vCarP = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz; vCarN = normalize(mat3(uCarInv) * mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = AGE_COMMON + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float agR = 0.0, agK = 0.0, agM = 0.0;
          {
            vec3 P = vCarP, N = normalize(vCarN), c = diffuseColor.rgb;
            float near = smoothstep(0.08, 0.025, length(fwidth(vCarP)));
            float n = agF(P * 0.9 + uAgeW.w);
            ${AGE_GLSL[type]}
            diffuseColor.rgb = c;
          }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, agR, clamp(agK, 0.0, 1.0));')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - clamp(agM, 0.0, 1.0);');
    };
    mat.customProgramCacheKey = () => 'civAge_' + type + '|' + prevKey;
    mat.needsUpdate = true;
  }
  // Vá vật liệu (props: MeshStandardMaterial màu theo từng xe qua instanceColor) cho lưới bản xa: tính vùng nhựa đen / kính
  // từng điểm ảnh từ aRef (giống GLSL_BODY / GLSL_CABIN rút gọn). part 'body' | 'cab'; dy: lưới khoang đặt gốc ở y = dy
  function patchLodMaterial(mat, kind, part, dy = 0) {
    const k0 = kind === 'taxi' ? 'sedan' : kind, S = SPEC[k0];
    if (!S || S.isTruck) return mat;
    const f = v => (+v).toFixed(4);
    const van = (S.style || 0) > 2.5, suvMode = !!(S.isSuv || S.hatchback), suvClad = suvMode && !((S.style || 0) > 1.5);
    const common = `
float lodIn(float d) { float f = clamp(fwidth(d), 1e-4, 0.08); return 1.0 - smoothstep(-f, f, d); }
float lodLine(float d, float w) { float f = clamp(fwidth(d), 1e-4, 0.06); return (1.0 - smoothstep(w * 0.5 - f, w * 0.5 + f, abs(d))) * clamp(w / (f * 2.0), 0.0, 1.0); }
float lodRmax(float a, float b, float r) { vec2 q = vec2(a, b) + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;
    const body = `
  float lodTrim = 0.0, lodGlass = 0.0;
  {
    vec3 P = vLodPos, N = normalize(vLodN); float x = P.x, y = P.y, z = P.z, ax = abs(x), y0 = vLodRef.y, w = vLodRef.x;
    float t = lodIn(y - (y0 + 0.3));
    t = max(t, step(${f(S.lamps.front[0] + 1.2)}, z) * lodIn(y - ${f(S.lamps.grille[3] - 0.5)}));
    t = max(t, step(z, ${f(S.lamps.rear[0] - 0.6)}) * lodIn(y - 3.1));
    t = max(t, step(N.y, -0.45));
    t = max(t, step(${f(S.cabin[0][0] + 0.2)}, z) * step(z, ${f(S.cabin[S.cabin.length - 1][0] - 0.2)}) * step(ax, w - ${f(S.inset + 0.15)}) * step(0.3, N.y));
    ${suvClad ? `
    float dF = length(vec2(z - ${f(S.axleF)}, y - ${f(S.r)})), dR = length(vec2(z - ${f(S.axleR)}, y - ${f(S.r)})), rIn = ${f(S.r + 0.65)}, rOut = rIn + 0.54;
    float arch = max(lodIn(dF - rOut) * lodIn(rIn - dF), lodIn(dR - rOut) * lodIn(rIn - dR)) * step(${f(S.r * 0.45)}, y) * step(0.18, abs(N.x));
    float rock = step(${f(S.axleR)} + rOut - 0.15, z) * step(z, ${f(S.axleF)} - rOut + 0.15) * lodIn(y - (y0 + 0.95)) * step(0.22, abs(N.x));
    t = max(t, max(arch, rock));` : ''}
    // khe cửa / nắp capô: vạch tối mảnh (xa vẫn thấy nhịp cửa)
    float seam = 0.0;
    if (abs(N.x) > 0.45) seam = step(${f(S.sill)}, y) * step(y, vLodRef.z - 0.3) * max(lodLine(z - ${f(S.doors[0])}, 0.08), max(lodLine(z - ${f(S.doors[1])}, 0.08), lodLine(z - ${f(S.doors[2])}, 0.08)));
    if (N.y > 0.3) seam = max(seam, step(${f(S.hood[0])}, z) * lodLine(ax - (w - 0.95), 0.08));
    lodTrim = t;
    diffuseColor.rgb *= 1.0 - 0.8 * seam * (1.0 - t);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.037, 0.04), t);
  }
`;
    const zC = `${f(S.rearDlo[0])} + ${f(S.rearDlo[1])} * (y - ${f(S.rearDlo[2])})`;
    const cab = `
  float lodTrim = 0.0, lodGlass = 0.0;
  {
    vec3 P = vLodPos; float x = P.x, y = P.y, z = P.z, u = vLodRef.x, v = vLodRef.y;
    float dW = lodRmax(lodRmax(u + ${f(S.pillarA)}, ${f(S.roofF)} - z, 0.45), 0.25 - v, 0.2);
    float dR = lodRmax(lodRmax(u + ${f(S.pillarC)}, z - ${f(S.roofR)}, 0.45), 0.25 - v, 0.2);
    float side = lodRmax(0.22 - u, 0.3 - v, 0.3), zC = ${zC};
    float dF = lodRmax(side, ${f(S.zB + 0.5)} - z, 0.3);
    ${van ? `float dRr = 1e3; dR = max(max(dR, max(11.3 - y, y - 14.9)), max(0.4 - abs(x), abs(x) - ${f((S.tgEdge || 6) - 0.75)}));`
      : suvMode ? `float dRr = min(lodRmax(lodRmax(side, z - ${f(S.zB - 0.5)}, 0.28), ${f(S.zDiv + 0.55)} - z, 0.28), lodRmax(lodRmax(side, z - ${f(S.zDiv - 0.55)}, 0.28), zC - z, 0.28));`
      : `float dRr = lodRmax(lodRmax(side, z - ${f(S.zB - 0.5)}, 0.3), zC - z, 0.32);`}
    float d = min(min(dW, dR), min(dF, dRr));
    float g = lodIn(d);
    float rub = lodIn(d - 0.06) * (1.0 - g);
    float pil = ${van ? '0.0' : `lodIn(side) * lodIn(abs(z - ${f(S.zB)}) - 0.5)`};
    float dv = ${suvMode ? '0.0' : `lodIn(abs(z - ${f(S.zDiv)}) - 0.12) * g`};
    g = max(0.0, g - dv - pil);
    lodTrim = max(max(rub, pil), dv); lodGlass = g;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.021, 0.023), lodTrim);
    // kính: xám xanh sẫm (phản chiếu trời ở mặt dốc), không ăn màu sơn từng xe; mặt trong (nhìn xuyên kính) tối
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.14, 0.15), g);
    diffuseColor.a = mix(1.0, ${suvMode ? '0.66' : '0.58'}, g);
  }
`;
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.call(mat) : '';
    mat.extensions = Object.assign(mat.extensions || {}, { derivatives: true });
    // khoang: mặt ngoài (nội thất tối nhìn qua kính là lớp khoang thu nhỏ riêng bên props); hai mặt làm tối sườn van trên ANGLE
    if (part === 'cab') mat.transparent = true;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      sh.vertexShader = 'attribute vec3 aRef;\nvarying vec3 vLodRef; varying vec3 vLodPos; varying vec3 vLodN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvLodRef = aRef; vLodPos = position + vec3(0.0, ${f(dy)}, 0.0); vLodN = normal;`);
      sh.fragmentShader = 'varying vec3 vLodRef; varying vec3 vLodPos; varying vec3 vLodN;\n' + common + sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', (part === 'cab' ? cab : body) + '#include <roughnessmap_fragment>')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.82, lodTrim), 0.06, lodGlass);\nmetalnessFactor = mix(mix(metalnessFactor, 0.05, lodTrim), 0.35, lodGlass);');
    };
    mat.customProgramCacheKey = () => 'civlod_' + k0 + '_' + part + '|' + prevKey;
    return mat;
  }
  // DỰNG XE. opts: color, age (0 mới .. 1 bỏ hoang lâu năm), seed (mỗi xe một kiểu hư hỏng)
  // ---------------------------------------------------------------------------
  function build(kind = 'sedan', opts = {}) {
    const S = SPEC[kind] || SPEC.sedan, age = opts.burnt ? 1.0 : (opts.age !== undefined ? opts.age : 0.6), seed = opts.seed || 1, rnd = mulberry(seed * 9301 + 49297);
    let color = new THREE.Color(opts.color !== undefined ? opts.color : (kind === 'taxi' ? 0xe8b820 : 0x7a1512));
    if (opts.burnt) {
      color = color.lerp(new THREE.Color(0x181412), 0.88);
    }
    const W = {
      age,
      fuel: opts.burnt ? 0 : (opts.fuel !== undefined ? opts.fuel : (rnd() < 0.6 ? 0.25 + 0.75 * rnd() : 0)),
      dust: opts.dust !== undefined ? opts.dust : (opts.burnt ? 0.85 : (0.25 + 0.65 * age * (0.6 + 0.4 * rnd()))),
      rust: opts.rust !== undefined ? opts.rust : (opts.burnt ? 0.95 : (age * (0.5 + 0.5 * rnd()))),
      seed: rnd() * 10,
      crack: (opts.burnt || opts.crush > 0.3) ? [(rnd() - 0.5) * 3, 4.5, 40, (opts.burnt || opts.crush > 0.6) ? 2 : 1] : rnd() < age * 0.7 ? [(rnd() - 0.5) * 6, 4.2 + rnd() * 2, 2.5 + rnd() * 3, 1] : [0, 0, 0, 0]
    };
    // xác cháy sẵn: sơn cháy thành muội than, gỉ nâu loang trên nền đen (không phủ lớp bụi vàng như xe bỏ hoang)
    if (opts.burnt) { W.dust = 0.12; W.rust = 0.85; W.age = 0.35; }
    // DẤU THỜI GIAN NGẪU NHIÊN: tình trạng cond (props.js abandon: clean / dusty / rusted / broken / burnt; thiếu thì suy
    // từ tuổi) quyết định mức hư sev, seed quyết định kiểu hư (chuỗi ngẫu nhiên riêng wr, không xô lệch các chi tiết khác)
    const cond = opts.cond || (opts.burnt ? 'burnt' : age < 0.3 ? 'clean' : age < 0.62 ? 'dusty' : 'rusted');
    const sev = { clean: 0.06, dusty: 0.32, rusted: 0.62, broken: 0.92, burnt: 0.55 }[cond] ?? 0.3;
    const TB = S.isTruck ? truckBodyOf(seed, kind, opts.body) : null;   // kiểu thùng xe tải (ben / lửng / mui bạt / kín)
    const wr = mulberry(seed * 7919 + 1301);
    // tấm tôn thay thế khác màu / sơn lót (cửa trước, cửa sau, vè trước, capô) — chỉ xe đã qua sửa chữa chắp vá
    if (!S.isTruck && !opts.burnt && wr() < { dusty: 0.12, rusted: 0.26, broken: 0.18 }[cond]) {
      const PRIMER = [[0.36, 0.36, 0.34, 1], [0.55, 0.55, 0.52, 1], [0.22, 0.07, 0.04, 1], [0.6, 0.57, 0.5, 0.35], [0.11, 0.19, 0.31, 0.35], [0.45, 0.07, 0.05, 0.35], [0.7, 0.7, 0.68, 0.35]];
      let c = PRIMER[wr() * PRIMER.length | 0];
      if (Math.abs(c[0] - color.r) + Math.abs(c[1] - color.g) + Math.abs(c[2] - color.b) < 0.25) c = PRIMER[0];
      const side = wr() < 0.5 ? 1 : -1, pk = wr(), D = S.doors, zF0 = S.plan[S.plan.length - 1][0];
      W.panel = pk < 0.35 ? { n: [D[1] + 0.05, D[0] - 0.05, side, 1], y: [S.sill - 0.2, 40, 0, 0] }
        : pk < 0.6 ? { n: [D[2] + 0.05, D[1] - 0.05, side, 1], y: [S.sill - 0.2, 40, 0, 0] }
          : pk < 0.85 ? { n: [D[0] + 0.07, zF0, side, 1], y: [S.bumperTop[0] + 0.1, 40, 0, 0] }
            : { n: [S.hood[0] + 0.05, 0, 0, 2], y: [S.bumperTop[1] + 0.2, 0, 0, 0] };
      W.panel.c = c;
    }
    const trk = opts.track || { angle: (rnd() < 0.35 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.7, offset: (rnd() - 0.5) * 12 };
    if (opts.crush) W.track = [Math.cos(trk.angle), Math.sin(trk.angle), trk.offset, opts.crush];
    const env = envCube();
    const plain = (c, r, m, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m, envMap: env, envMapIntensity: 1 }, extra || {}));
    const rimCol = new THREE.Color(0xdde2e8).lerp(new THREE.Color(opts.burnt ? 0x1f1b18 : 0x9aa0a6), opts.burnt ? 0.95 : age * 0.4);   // hợp kim nhôm sáng bóng phay kim cương, xe cũ ngả chút bụi xám
    const mirrorGrime = mirrorGrimeTexture(rnd, age);
    const SPORT_DISC = (kind === 'sedan' || kind === 'suv') && wr() < 0.15;   // bản thể thao: đĩa khoan lỗ, cùm đỏ
    const mats = {
      body: carMaterial(color, env, 'body', S, W), cabin: carMaterial(color, env, 'cabin', S, W), cabinIn: carMaterial(color, env, 'cabinIn', S, W),
      paint: new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color(0x807d78), age * 0.25),
        roughness: opts.burnt ? 0.95 : (0.32 + 0.25 * age),
        metalness: opts.burnt ? 0.1 : 0.55,
        clearcoat: opts.burnt ? 0 : (0.75 - 0.4 * age),
        clearcoatRoughness: 0.12 + 0.18 * age,
        envMap: env,
        envMapIntensity: 1.15
      }),
      // cao su đen lì, chữ nổi thành lốp (bumpMap); hãng lốp theo seed
      tire: plain(opts.burnt ? new THREE.Color(0x1a1715) : new THREE.Color(0xffffff).lerp(new THREE.Color(0xb8a890), age * 0.4), 0.86, 0.02, Object.assign({ envMapIntensity: opts.burnt ? 0.05 : 0.3 }, (() => { const T = tireTextures(age, Math.floor(seed) % 4 + (S.isSuv ? 2 : 0)); return { map: T.map, bumpMap: T.bump, bumpScale: 0.45 }; })())),
      rim: plain(rimCol.clone().multiplyScalar(0.78), opts.burnt ? 0.88 : (0.24 + 0.2 * age), opts.burnt ? 0.4 : 0.82, { envMapIntensity: opts.burnt ? 0.15 : 1.15 }),
      lip: plain(new THREE.Color(opts.burnt ? 0x1f1b18 : 0xb8bdc1).lerp(new THREE.Color(0x77736c), age * 0.4), opts.burnt ? 0.85 : 0.32, opts.burnt ? 0.3 : 0.78, { envMapIntensity: opts.burnt ? 0.15 : 0.95 }),
      barrel: plain(opts.burnt ? 0x121212 : 0x181a1d, 0.42, 0.82),
      cap: plain(opts.burnt ? 0x181513 : 0x15171a, 0.18, 0.88, { envMapIntensity: 1.3 }),
      disc: plain(opts.burnt ? new THREE.Color(0x4a362a) : new THREE.Color(0xffffff), opts.burnt ? 0.88 : 0.45, opts.burnt ? 0.4 : 0.6, { map: discTexture(age, SPORT_DISC), envMapIntensity: opts.burnt ? 0.15 : 0.8 }),
      // cùm phanh: phần lớn gang đúc xám đen gỉ, ít xe sơn đỏ (bản thể thao)
      caliper: plain(opts.burnt ? 0x221a18 : SPORT_DISC ? 0x7d2420 : 0x34322f, opts.burnt ? 0.85 : 0.6, opts.burnt ? 0.3 : 0.45, { envMapIntensity: 0.5 }),
      // mâm thép sơn đen hoặc bạc (ngả gỉ theo tuổi), ốp mâm nhựa mạ bạc (ố vàng, xước theo tuổi)
      steelRim: plain(opts.burnt ? new THREE.Color(0x2a1f18) : (wr() < 0.55 ? new THREE.Color(0x1d1e20) : new THREE.Color(0x9a9d9f)).lerp(new THREE.Color(0x4f3a2b), age * 0.35), opts.burnt ? 0.9 : 0.5 + 0.2 * age, 0.55, { envMapIntensity: 0.7 }),
      hubcap: plain(new THREE.Color(0xc6cacd).lerp(new THREE.Color(0x8d8a80), age * 0.5), 0.42 + 0.3 * age, 0.35, { envMapIntensity: 0.9, side: THREE.DoubleSide }),
      black: plain(0x131518, 0.82, 0.04), wiper: plain(new THREE.Color(0x1a1a1a).lerp(new THREE.Color(0x3a2a20), age * 0.6), 0.48, 0.65), chrome: plain(opts.burnt ? 0x332a22 : 0xd6dce0, opts.burnt ? 0.8 : 0.14, opts.burnt ? 0.3 : 0.92, { envMapIntensity: 1.25 }), mirror: plain(opts.burnt ? 0x221a15 : 0x9eabb0, opts.burnt ? 0.8 : 0.12, opts.burnt ? 0.2 : 0.65, { envMapIntensity: opts.burnt ? 0.2 : 1.25 }),
      mirrorDirt: plain(0x8a7b64, 1, 0, { alphaMap: mirrorGrime, transparent: true, opacity: 0.48 + age * 0.24, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0 }),
      defrost: plain(new THREE.Color(0x6d3928).lerp(new THREE.Color(0x3a3029), age * 0.55), 0.72, 0.18, { envMapIntensity: 0.18 }),
      seat: plain(opts.burnt ? new THREE.Color(0x15120f) : new THREE.Color(0x2e2b27).lerp(new THREE.Color(0x4a4339), age * 0.5), 0.95, 0, { envMapIntensity: 0.15 }),
      dash: plain(0x1d1c1b, 0.8, 0, { envMapIntensity: 0.2 }), dark: plain(0x0b0c0d, 0.9, 0),
      tailAmber: plain(opts.burnt ? 0x342316 : 0xcb650b,0.34,0.05,{envMapIntensity:0.35}),
      tailBrake: plain(opts.burnt ? 0x321715 : 0x8f1612,0.3,0.05,{envMapIntensity:0.4}),
      tailReverse: plain(opts.burnt ? 0x403b32 : 0xb8c2bd,0.25,0.05,{envMapIntensity:0.4}),
      truckBed: plain(new THREE.Color(0xb2b9c0).lerp(new THREE.Color(0x726c62), age * 0.45), opts.burnt ? 0.92 : 0.42, opts.burnt ? 0.1 : 0.65),
      truckBedFloor: plain(new THREE.Color(0x383c42).lerp(new THREE.Color(0x28231d), age * 0.5), opts.burnt ? 0.95 : 0.65, opts.burnt ? 0.1 : 0.45),
      truckBumper: plain(new THREE.Color(0x181a1d).lerp(new THREE.Color(0x302a24), age * 0.5), opts.burnt ? 0.92 : 0.55, 0.2),
      truckTarp: plain(new THREE.Color(0x3c4a3b).lerp(new THREE.Color(0x403c34), age * 0.5), 0.88, 0.05),
      truckBarrel: plain(new THREE.Color(0x1b4468).lerp(new THREE.Color(0x383430), age * 0.5), 0.45, 0.4),
      truckLens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, roughness: 0.02, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, envMapIntensity: 2.5, depthWrite: false }),
      truckLed: plain(0xf8fbff, 0.08, 0.0, { emissive: new THREE.Color(0xdbe9f6), emissiveIntensity: 0.85 }),
      truckAmberLed: plain(0xff9e1b, 0.15, 0.0, { emissive: new THREE.Color(0xff8800), emissiveIntensity: 0.9 }),
      truckPlate: plain(0xf0f4f8, 0.28, 0.08)
    };
    // xác cháy: lớp bóng / sơn kim loại cháy rụi -> tôn lì muội than, phản chiếu yếu
    if (opts.burnt) for (const m of [mats.body, mats.cabin, mats.cabinIn]) { m.clearcoat = 0; m.roughness = 0.9; m.metalness = 0.3; m.envMapIntensity = 0.35; }
    const g = new THREE.Group(), car = new THREE.Group(); g.add(car);
    const prep = geo => { geo.setAttribute('aRest', geo.attributes.position.clone()); geo.setAttribute('aCr', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3)); return geo; };
    const TPL = templateOf(S);
    const bodyGeo = prep(TPL.body.clone()), cabGeo = prep(TPL.cab.clone());
    const body = new THREE.Mesh(bodyGeo, mats.body), cabin = new THREE.Mesh(cabGeo, mats.cabin);
    for (const m of [body, cabin]) { m.castShadow = true; m.receiveShadow = true; car.add(m); }
    // dò tia nhanh bằng cây bao của lưới gốc trong lúc dựng (thân chưa móp); gỡ ra trước khi thân biến dạng
    const fastCast = !!(TPL.bodyTree && TPL.cabTree && MeshBVHLib.acceleratedRaycast);
    if (fastCast) { bodyGeo.boundsTree = TPL.bodyTree; cabGeo.boundsTree = TPL.cabTree; body.raycast = cabin.raycast = MeshBVHLib.acceleratedRaycast; }
    const endFastCast = () => { if (!fastCast) return; delete bodyGeo.boundsTree; delete cabGeo.boundsTree; delete body.raycast; delete cabin.raycast; };
    // mặt trong khoang: cột, khung cửa, trần (đặc) — nhìn xuyên kính thấy thành xe bên kia
    const cabIn = new THREE.Mesh(cabGeo, mats.cabinIn); cabIn.receiveShadow = true; car.add(cabIn);
    const top = curve(S.top), plan = curve(S.plan), roof = curve(S.cabin), bot = curve(S.bottom);
    // dò mặt thân xe bằng tia (gắn chi tiết sát bề mặt) — trước khi móp
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const hitAt = (o, d) => { rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); const h = rc.intersectObjects([body, cabin])[0]; return h ? { p: h.point, n: h.face.normal.clone() } : null; };
    const part = (geo, mat, pos, rot, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; (parent || car).add(m); return m; };

    // --- NỘI THẤT nhìn qua kính: 2 ghế trước có tựa đầu, băng ghế sau, taplô, vô-lăng, gương chiếu hậu trong
    const belt = top(0), nIn0 = car.children.length;
    if (S.isTruck) {
      // Nội thất buồng lái xe tải: 2 ghế ngồi bản lớn, taplô to cao, vô lăng dốc 45 độ bên lái (x < 0)
      const cabBelt = top(10.0);
      for (const sx of [1, -1]) {
        // Tựa lưng và đệm ngồi
        part(roundBox(3.2, 4.2, 1.2, 0.35), mats.seat, [sx * 3.2, cabBelt + 0.3, S.isDump ? 9.3 : 8.6], [-0.14, 0, 0]);
        part(roundBox(2.2, 1.1, 0.7, 0.22), mats.seat, [sx * 3.2, cabBelt + 2.65, S.isDump ? 8.7 : 8.1], [-0.1, 0, 0]);
      }
      // Taplô buồng lái to cao
      part(roundBox(13.2, 1.8, 3.2, 0.35), mats.dash, [0, cabBelt + 0.45, S.isDump ? 18.1 : 16.5], [0.22, 0, 0]);
      // Vô-lăng xe tải to bản nghiêng 45 độ bên lái (ghế lái x < 0)
      const wheelS = part(new THREE.TorusGeometry(1.2, 0.13, 8, 28), mats.dash, [-3.2, cabBelt + 1.45, S.isDump ? 16.6 : 15.2], [-0.75, 0, 0]);
      part(new THREE.BoxGeometry(2.2, 0.16, 0.1), mats.dash, [0, 0, 0], null, wheelS);
      part(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 8), mats.dark, [-3.2, cabBelt + 0.8, S.isDump ? 17.2 : 15.8], [-0.75, 0, 0]);
      // Cần số sàn và phanh tay giữa 2 ghế
      part(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 8), mats.chrome, [0, cabBelt + 0.5, 11.2], [-0.25, 0, 0]);
      part(new THREE.SphereGeometry(0.18, 10, 8), mats.black, [0, cabBelt + 1.35, 10.95]);
      // Gương chiếu hậu trong cabin
      part(roundBox(1.5, 0.48, 0.15, 0.05), mats.dash, [0, 16.2, S.isDump ? 17.8 : 17.2], [0.2, 0, 0]);
      part(new THREE.PlaneGeometry(1.4, 0.4), mats.mirror, [0, 16.2, (S.isDump ? 17.8 : 17.2) - 0.09], [0.2, Math.PI, 0]);
    } else {
      // iz: ghế, taplô, vô-lăng dời theo chân kính chắn gió (mốc sedan 7.8) — hatchback lùi, van dồn lên trước
      const iz = S.hatchback ? S.cabin[S.cabin.length - 1][0] - 7.8 : 0, beltI = top(iz);
      for (const sx of [1, -1]) {
        part(roundBox(3.3, 4.2, 0.95, 0.4), mats.seat, [sx * 2.7, beltI + 0.05, -1.4 + iz], [-0.2, 0, 0]);
        part(roundBox(1.9, 1.05, 0.6, 0.25), mats.seat, [sx * 2.7, beltI + 2.45, -1.95 + iz], [-0.15, 0, 0]);
      }
      if (S.style === 3) {
        // van thùng kín: vách ngăn tôn sau lưng ghế, nhìn qua kính chắn gió thấy khoang hàng tối
        part(roundBox(2 * (plan(iz - 3.4) - S.inset - 0.5), roof(iz - 3.4) - beltI + 1.2, 0.14, 0.05), mats.dash, [0, (roof(iz - 3.4) + beltI) / 2 - 0.5, iz - 3.4]);
      } else part(roundBox(2 * (plan(-8.5) - S.inset - 1.3), 3.2, 0.9, 0.4), mats.seat, [0, top(-8.5) - 0.3, S.isPickup ? -5.25 : -8.8], [-0.38, 0, 0]);
      if (S.isSuv && !S.isPickup) {
        part(roundBox(2 * (plan(-13.2) - S.inset - 1.4), 2.8, 0.8, 0.35), mats.seat, [0, top(-13.2) - 0.2, -13.5], [-0.3, 0, 0]);
      }
      part(roundBox(2 * (plan(5.5 + iz) - S.inset - 0.6), 1.3, 2.6, 0.45), mats.dash, [0, top(5.5 + iz) - 0.05, 5.5 + iz], [0.25, 0, 0]);
      const wheelS = part(new THREE.TorusGeometry(0.95, 0.12, 8, 28), mats.dash, [2.7, beltI + 1.0, 3.7 + iz], [-0.45 - (S.style === 3 ? 0.35 : 0), 0, 0]);
      part(new THREE.BoxGeometry(1.8, 0.14, 0.1), mats.dash, [0, 0, 0], null, wheelS);
      part(roundBox(1.6, 0.48, 0.18, 0.07), mats.dash, [0, roof(2.7 + iz) - 0.75, 2.7 + iz], [0.2, 0, 0]);
    }
    car.children.slice(nIn0).forEach(m => m.userData.inner = true);

    // --- GƯƠNG HẬU KHÍ ĐỘNG HỌC (chỉ cho Sedan và SUV, xe tải có cụm gương đôi xe tải chuyên dụng)
    if (!S.isTruck) {
      for (const sx of [1, -1]) {
        // gương đặt ngay sau chân cột A (theo chân kính chắn gió); van: gương to
        const zM = S.cabin[S.cabin.length - 1][0] - 1.6, yM = top(zM) + 0.75, h = hitAt([sx * 12, yM - 0.45, zM], [-sx, 0, 0]), xs = h ? Math.abs(h.p.x) : plan(zM);
        const grp = new THREE.Group(); grp.position.set(sx * (xs - 0.1), yM - 0.4, zM); car.add(grp); grp.userData.acc = 'mirror';
        if (S.style === 3) grp.scale.setScalar(1.3);
        // Xe cháy / khung bị ép nặng: gương gập, mất mặt kính. Xe cũ / hỏng: theo mức hư — kính rạn, rơi mất kính, củ gương
        // gãy chân treo lủng lẳng bằng dây điện, gãy mất cả củ, hoặc bị quệt gập ngược
        const broken = !!opts.burnt || ((opts.crush || 0) > 0.58 && rnd() < 0.65);
        let mMode = null;
        if (!broken && wr() < sev * 0.5) { const p = wr(); mMode = p < 0.34 ? 'cracked' : p < 0.54 ? 'noGlass' : p < 0.78 ? 'hanging' : p < 0.9 ? 'missing' : 'folded'; }

        // 1. Chân đế gắn gương & cần đỡ khí động học
        let baseGeo, stalkGeo, stalkPos;
        if (!S.isSuv) {
          // Sedan: thanh nẹp chân gương dẹt, bám sát độ nghiêng vách kính và nối liền từ khung dưới lên khung trên
          const yB = -0.40, yT = 0.78;
          const baseShape = new THREE.Shape();
          baseShape.moveTo(sx * 0.19, yB);
          baseShape.lineTo(sx * 0.28, yB);
          baseShape.lineTo(sx * -0.25, yT);
          baseShape.lineTo(sx * -0.35, yT);
          baseShape.closePath();
          baseGeo = new THREE.ExtrudeGeometry(baseShape, { curveSegments: 3, depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 });
          baseGeo.translate(0, 0, -0.08);

          stalkGeo = roundBox(0.16, 0.14, 0.65, 0.04);
          stalkGeo.rotateY(sx * 0.85); stalkGeo.rotateZ(sx * 0.22);
          stalkPos = [sx * 0.24, 0.18, -0.08];
        } else {
          const baseShape = new THREE.Shape();
          baseShape.moveTo(0, -0.38); baseShape.lineTo(sx * 0.45, -0.32); baseShape.lineTo(sx * 0.12, 0.42); baseShape.lineTo(0, 0.38); baseShape.closePath();
          baseGeo = new THREE.ExtrudeGeometry(baseShape, { curveSegments: 3, depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
          baseGeo.translate(0, 0, -0.06);

          stalkGeo = roundBox(0.18, 0.16, 0.58, 0.045);
          stalkGeo.rotateY(sx * 0.85); stalkGeo.rotateZ(sx * 0.22);
          stalkPos = [sx * 0.38, 0.12, -0.08];
        }
        part(baseGeo, mats.paint, [0, 0, 0], null, grp);
        part(stalkGeo, mats.paint, stalkPos, null, grp);
        const nHead0 = grp.children.length;

        // 3. Vỏ củ gương khí động học (sơn bóng cùng màu xe)
        const cx = sx * 1.02, cy = 0.4, cz = -0.08, w = 1.52, hIn = 0.7, hOut = 0.56, r = 0.2;
        const shellShape = mirrorProfileShape(w, hIn, hOut, r, sx);
        const shellGeo = new THREE.ExtrudeGeometry(shellShape, { curveSegments: 8, depth: 0.3, bevelEnabled: true, bevelThickness: 0.085, bevelSize: 0.065, bevelSegments: 4 });
        const P = shellGeo.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const z = P.getZ(i);
          if (z > 0.05) {
            const tz = Math.min(1, (z - 0.05) / 0.3);
            P.setX(i, P.getX(i) * (1 - 0.2 * tz) + sx * 0.04 * tz);
            P.setY(i, P.getY(i) * (1 - 0.14 * tz));
          }
        }
        shellGeo.computeVertexNormals();
        shellGeo.translate(cx, cy, cz - 0.15);
        shellGeo.rotateY(sx * 0.18);
        part(shellGeo, mats.paint, [0, 0, 0], null, grp);

        // 4. Gờ dưới củ gương (cùng màu sơn thân)
        const lowerGeo = roundBox(w * 0.82, 0.12, 0.3, 0.045);
        lowerGeo.translate(cx, cy - hOut * 0.48, cz);
        lowerGeo.rotateY(sx * 0.18);
        part(lowerGeo, mats.paint, [0, 0, 0], null, grp);

        // 5. Dải đèn xi-nhan LED gương thanh mảnh
        const ledGeo = new THREE.BoxGeometry(w * 0.72, 0.045, 0.08, 4, 1, 1);
        ledGeo.translate(cx + sx * 0.05, cy - 0.02, cz + 0.165);
        ledGeo.rotateY(sx * 0.18);
        part(ledGeo, mats.chrome, [0, 0, 0], null, grp);

        // 6. Viền hốc gương nhựa đen bo tròn ôm trọn mặt kính
        const bezelShape = mirrorProfileShape(w - 0.04, hIn - 0.04, hOut - 0.04, r - 0.02, sx);
        const holeShape = mirrorProfileShape(w - 0.18, hIn - 0.16, hOut - 0.16, r - 0.04, sx);
        bezelShape.holes.push(holeShape);
        const bezelGeo = new THREE.ExtrudeGeometry(bezelShape, { curveSegments: 5, depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
        bezelGeo.translate(cx, cy, cz - 0.19);
        bezelGeo.rotateY(sx * 0.18);
        part(bezelGeo, mats.black, [0, 0, 0], null, grp);

        // 7. Mặt kính gương hình thang bo tròn khí động học (lọt sâu vào trong hốc viền)
        const glassShape = mirrorProfileShape(w - 0.16, hIn - 0.14, hOut - 0.14, r - 0.03, sx);
        const glassGeo = new THREE.ShapeGeometry(glassShape, 12);
        for (let i = 0; i < glassGeo.attributes.normal.count; i++) glassGeo.attributes.normal.setZ(i, -1);
        const idx = glassGeo.index.array;
        for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = tmp; }
        glassGeo.computeVertexNormals();
        glassGeo.translate(cx, cy, cz - 0.205);
        glassGeo.rotateY(sx * 0.18);
        const glassM = part(glassGeo, broken || mMode === 'noGlass' ? mats.black : mats.mirror, [0, 0, 0], null, grp);
        glassM.userData.mirrorGlass = true;
        if (!broken && mMode !== 'noGlass') {
          const grimeGeo = glassGeo.clone(); grimeGeo.translate(0, 0, -0.008);
          const grime = part(grimeGeo, mats.mirrorDirt, [0, 0, 0], null, grp);
          grime.castShadow = false; grime.renderOrder = 8;
          if (mMode === 'cracked') {
            const crGeo = glassGeo.clone(); crGeo.translate(0, 0, -0.012);
            const cr = part(crGeo, plain(0xe8eef0, 0.3, 0, { alphaMap: mirrorCrackTexture(wr), transparent: true, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.4 }), [0, 0, 0], null, grp);
            cr.castShadow = false; cr.renderOrder = 9;
          }
        }
        if (broken || mMode === 'folded') grp.rotation.set(0, sx * (0.5 + 0.5 * wr()), sx * -0.35);
        const head = grp.children.slice(nHead0);
        if (mMode === 'missing') {
          // gãy mất củ gương: chỉ còn chân đế + cần cụt
          for (const m of head) grp.remove(m);
          grp.children[1].scale.set(1, 1, 0.55);
        } else if (mMode === 'hanging') {
          // củ gương gãy chân, treo lủng lẳng sát cửa bằng bó dây điện chỉnh gương
          const piv = new THREE.Vector3(sx * 0.42, 0.28, -0.1), pv = new THREE.Group();
          pv.position.copy(piv).add(new THREE.Vector3(sx * 0.05, -0.22 - 0.1 * wr(), 0)); grp.add(pv);
          for (const m of head) { pv.add(m); m.position.sub(piv); }
          pv.rotation.set((wr() - 0.5) * 0.5, sx * (0.2 + 0.3 * wr()), -sx * (1.15 + 0.35 * wr()));
          part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([piv.clone(), piv.clone().add(new THREE.Vector3(sx * 0.12, -0.12, 0.02)), pv.position.clone()]), 8, 0.025, 4, false), mats.black, [0, 0, 0], null, grp).castShadow = false;
        }
      }
    }
    // --- TAY NẮM CỬA (cùng màu sơn, lõm tối phía sau)
    for (const sx of [1, -1]) {
      const zDoorHandles = S.isTruck ? [] : S.handles || (S.isPickup ? [0.7,-5.3] : [0.7,-7.2]);
      for (const zH of zDoorHandles) {
        const yH = top(zH) - 1.2, h = hitAt([sx * 12, yH, zH], [-sx, 0, 0]);
        if (!h) continue;
        part(new THREE.SphereGeometry(1, 14, 8), mats.dark, [h.p.x - sx * 0.02, yH, zH], null).scale.set(0.08, 0.22, 0.8);
        part(new THREE.SphereGeometry(1, 14, 8), mats.paint, [h.p.x + sx * 0.06, yH, zH - 0.05], null).scale.set(0.12, 0.15, 0.7);
      }
    }
    // --- MÁNG CHÂN KÍNH VÀ KHUNG CỘT A DÀY DẶN (Cowl Panel & A-Pillar Weatherstrip)
    if (!S.isTruck) {
      const zBase = S.cabin[S.cabin.length - 1][0];
      const zRoof = S.cabin[S.cabin.length - 2][0];
      const onGlass = (x, z, lift) => { const h = hitAt([x, 20, z], [0, -1, 0]); return h ? h.p.clone().addScaledVector(h.n, lift) : null; };

      // 1. Máng nhựa đen chân kính chắn gió (Cowl Panel / Plenum Trim)
      const cowlGrp = new THREE.Group(); cowlGrp.userData.acc = 'cowl'; car.add(cowlGrp);
      const cowlW = (plan(zBase) - S.inset) * 1.88;
      const cowlHit = hitAt([0, 20, zBase - 0.15], [0, -1, 0]);
      if (cowlHit) {
        // Tấm máng nhựa đen nằm chìm nhẹ giữa chân kính và mép nắp ca-pô
        part(roundBox(cowlW, 0.12, 0.65, 0.03), mats.black, [0, cowlHit.p.y - 0.02, zBase - 0.15], [-0.18, 0, 0], cowlGrp);
        // Mép cao su tì chân kính chắn gió
        part(roundBox(cowlW * 0.98, 0.08, 0.14, 0.02), mats.dark, [0, cowlHit.p.y + 0.03, zBase - 0.38], [-0.35, 0, 0], cowlGrp);
        // Mép gập mí ca-pô trước máng nhựa
        part(roundBox(cowlW * 0.96, 0.06, 0.12, 0.02), mats.paint, [0, cowlHit.p.y + 0.06, zBase + 0.18], [-0.05, 0, 0], cowlGrp);
        // Các khe rãnh hút gió lấy gió ngoài điều hòa
        for (let gx = -cowlW * 0.38; gx <= cowlW * 0.38; gx += 0.48) {
          part(new THREE.BoxGeometry(0.22, 0.03, 0.28), mats.dark, [gx, cowlHit.p.y + 0.02, zBase - 0.14], [-0.18, 0, 0], cowlGrp);
        }
      }

      // 2. Nẹp dập nổi gờ cột A 3D (A-Pillar Mouldings) tạo thành xe dày dặn, hốc kính thụt âm
      const aPillarGrp = new THREE.Group(); aPillarGrp.userData.acc = 'aPillar'; car.add(aPillarGrp);
      for (const sx of [1, -1]) {
        const pBot = onGlass(sx * (plan(zBase) - S.inset - 0.05), zBase - 0.12, 0.06);
        const pMid = onGlass(sx * (plan((zBase + zRoof) * 0.5) - S.inset - 0.12), (zBase + zRoof) * 0.5, 0.07);
        const pTop = onGlass(sx * (plan(zRoof) - S.inset - 0.18), zRoof, 0.06);
        if (pBot && pMid && pTop) {
          const pillarCurve = new THREE.CatmullRomCurve3([pBot, pMid, pTop]);
          // Gờ nẹp kim loại cùng màu sơn xe nổi gồ lên tạo độ dày thành xe
          part(new THREE.TubeGeometry(pillarCurve, 16, 0.075, 6, false), mats.paint, [0, 0, 0], null, aPillarGrp);
          // Gioăng cao su đen viền rãnh thoát nước sát mép kính
          const innerOffset = new THREE.Vector3(-sx * 0.05, 0.01, 0.02);
          const pBotIn = pBot.clone().add(innerOffset);
          const pMidIn = pMid.clone().add(innerOffset);
          const pTopIn = pTop.clone().add(innerOffset);
          const rubberCurve = new THREE.CatmullRomCurve3([pBotIn, pMidIn, pTopIn]);
          part(new THREE.TubeGeometry(rubberCurve, 16, 0.035, 5, false), mats.dark, [0, 0, 0], null, aPillarGrp);
        }
      }

      // --- CỤM CẦN GẠT NƯỚC CHÂN THẬT (Gạt không xương khí động học, tay cần dẹt bản hộp, không đổ bóng nắp ca-pô)
      const wiperConfigs = [
        // Gạt bên lái (chính): vươn từ giữa sang góc trái kính chắn gió
        { pivX: -0.95, pivZOff: 0.15, xStart: -1.25, xEnd: -5.35, clipX: -3.30, zOff: 0.42 },
        // Gạt bên phụ: vươn từ góc phải sang giữa kính chắn gió
        { pivX: 3.55, pivZOff: 0.12, xStart: 3.25, xEnd: -0.85, clipX: 1.20, zOff: 0.26 }
      ];
      for (const cfg of wiperConfigs) {
        const blade = [], frame = [];
        const xSpan = cfg.xEnd - cfg.xStart;
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, x = cfg.xStart + xSpan * t;
          const z = zBase - cfg.zOff - (x - cfg.clipX) * 0.045;
          const a = onGlass(x, z, 0.028), b = onGlass(x, z, 0.075);
          if (a) blade.push(a); if (b) frame.push(b);
        }
        if (blade.length < 5) continue;
        const wpr = new THREE.Group(); car.add(wpr); wpr.userData.acc = 'wiper';

        // Lưỡi cao su đen ép sát mặt kính
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(blade), 24, 0.036, 6, false), mats.black, [0, 0, 0], null, wpr);
        // Sống nẹp cánh gió khí động học dày dặn (gạt không xương cao cấp)
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(frame), 24, 0.055, 6, false), mats.wiper, [0, 0, 0], null, wpr);
        // Nắp chụp bảo vệ 2 đầu thanh gạt
        part(roundBox(0.12, 0.1, 0.15, 0.03), mats.black, blade[0].toArray(), null, wpr);
        part(roundBox(0.12, 0.1, 0.15, 0.03), mats.black, blade[blade.length - 1].toArray(), null, wpr);

        // Trục xoay chân gạt nước nằm âm trong máng nhựa chân kính (không cắm xuyên nắp ca-pô)
        const piv = onGlass(cfg.pivX, zBase - cfg.pivZOff, 0.05);
        const clipZ = zBase - cfg.zOff;
        const clip = onGlass(cfg.clipX, clipZ, 0.078);
        if (piv && clip) {
          // Khớp ngàm khóa kẹp giữa tay cần và thanh gạt
          part(roundBox(0.38, 0.12, 0.22, 0.03), mats.black, [clip.x, clip.y, clip.z], null, wpr);

          // Tay cần gạt nước chính: thanh dẹt bản hộp cứng cáp
          const armDir = clip.clone().sub(piv);
          const armLen = armDir.length();
          const armMid = piv.clone().lerp(clip, 0.52).add(new THREE.Vector3(0, 0.03, 0.02));
          const armCurve = new THREE.CatmullRomCurve3([piv, armMid, clip]);
          part(new THREE.TubeGeometry(armCurve, 14, 0.065, 6, false), mats.wiper, [0, 0, 0], null, wpr);

          // Cụm khớp gập bản lề lò xo ở chân tay cần
          const hingeP = piv.clone().lerp(clip, 0.22).add(new THREE.Vector3(0, 0.02, 0.01));
          part(roundBox(0.24, 0.14, 0.32, 0.04), mats.wiper, hingeP.toArray(), null, wpr);

          // Nắp chụp chân trục motor đặt gọn gàng trong máng chân kính
          part(new THREE.CylinderGeometry(0.18, 0.24, 0.18, 14), mats.black, [piv.x, piv.y - 0.02, piv.z], null, wpr);
        }

        // Tắt đổ bóng cho cụm cần gạt để triệt tiêu hoàn toàn bóng đen nham nhở đè lên nắp ca-pô
        wpr.traverse(o => { if (o.isMesh) o.castShadow = false; });
      }
    }
    // --- BIỂN SỐ trước / sau (gom vào plateGrp để mặt và đế luôn đi liền nhau)
    const ps = Math.abs(Math.floor(seed)) % 1000003 || 1;   // seed âm (props băm từ toạ độ) -> biển số ra ký tự rác
    const txt = String.fromCharCode(65 + (ps * 7) % 26) + ((ps * 37) % 90 + 10) + '-' + String(1000 + (ps * 7919) % 9000);
    const plateTex = plateTexture(txt, age, rnd), plateMat = plain(opts.burnt ? 0x3a322c : 0xffffff, opts.burnt ? 0.95 : 0.5, 0.1, { map: plateTex, envMapIntensity: 0.4 });
    for (const [y0, dir] of [[S.plates[0], 1], [S.plates[1], -1]]) {
      if (S.isDump || S.isTruck) continue; // Xe ben và xe tải có cụm biển số chuyên dụng trên cản
      const h = hitAt([0, y0, dir * 40], [0, 0, -dir]);
      if (!h) continue;
      const plateGrp = new THREE.Group();
      plateGrp.position.set(0, y0, h.p.z + dir * 0.1);
      plateGrp.userData.acc = 'plate';
      const rearPlate = dir < 0;
      const plateW = rearPlate ? (S.isSuv ? 4.55 : 4.7) : 5.15;
      const plateH = rearPlate ? (S.isSuv ? 1.08 : 1.12) : 1.25;
      part(roundBox(plateW, plateH, 0.14, 0.06), mats.black, [0, 0, -dir * 0.025], null, plateGrp);
      part(new THREE.PlaneGeometry(plateW - 0.22, plateH - 0.17), plateMat, [0, 0, dir * 0.06], [0, dir > 0 ? 0 : Math.PI, 0], plateGrp);
      const tilt = age > 0.5 && rnd() < 0.4 ? (rnd() - 0.5) * 0.25 : 0;   // biển lỏng ốc, xệ lệch
      plateGrp.rotation.z = tilt;
      car.add(plateGrp);
    }
    // --- ỐNG XẢ: Sedan ống xả đơn bên trái, SUV trang bị cụm ống xả kép thể thao đối xứng 2 bên cản sau
    if (!S.isTruck) {
      const zE = S.plan[0][0] + 0.2;
      const exhY = S.isSuv ? 2.62 : 2.15;
      const sides = S.isSuv ? [] : [-1];
      for (const sx of sides) {
        const exX = sx * (S.isSuv ? 4.45 : 4.2);
        if (S.isSuv) {
          // Đầu xả nhỏ, tối màu và chỉ nhô nhẹ dưới cản sau.
          const tip = part(roundBox(0.82, 0.34, 0.8, 0.1), mats.lip, [exX, exhY, zE + 0.35]);
          tip.userData.acc = 'exhaust';
          part(new THREE.CylinderGeometry(0.18, 0.2, 0.72, 16, 1, true), plain(new THREE.Color(0x686461).lerp(new THREE.Color(0x513421), age), 0.68, 0.55, { side: THREE.DoubleSide }), [exX, exhY, zE + 0.35], [Math.PI / 2, 0, 0]);
          part(new THREE.CircleGeometry(0.17, 16), mats.dark, [exX, exhY, zE - 0.02], [0, Math.PI, 0]);
        } else {
          part(new THREE.CylinderGeometry(0.28, 0.3, 1.8, 16, 1, true), plain(new THREE.Color(0x777370).lerp(new THREE.Color(0x5a3a26), age), 0.6, 0.7, { side: THREE.DoubleSide }), [exX, exhY, zE + 0.75], [Math.PI / 2, 0, 0]);
          part(new THREE.CircleGeometry(0.26, 16), mats.dark, [exX, exhY, zE + 0.4], [0, Math.PI, 0]);
        }
      }
      if (S.isSuv) {
        // Cặp đầu xả thật đặt lệch phải như mẫu, nhỏ và nằm dưới ốp gầm.
        for (const exX of [3.75, 4.48]) {
          part(new THREE.CylinderGeometry(0.19, 0.22, 0.7, 16, 1, true), mats.lip, [exX, 2.72, zE + 0.25], [Math.PI / 2, 0, 0]);
          part(new THREE.CircleGeometry(0.18, 16), mats.dark, [exX, 2.72, zE - 0.11], [0, Math.PI, 0]);
        }
      }
    }
    if (kind === 'taxi') {
      const taxiGrp = new THREE.Group();
      taxiGrp.userData.isRoof = true;
      taxiGrp.userData.acc = 'taxiSign';
      const z0 = -1.5, y0 = roof(z0);

      // 1. Chân đế mỏng màu đen ôm sát mui xe
      const basePad = part(roundBox(3.72, 0.08, 1.48, 0.03), mats.black, [0, y0 + 0.04, z0], null, taxiGrp);
      basePad.userData.isRoof = true;

      // 2. Vỏ hộp đèn màu vàng xe taxi, vát chóp cụt khí động học bo tròn
      const shellH = 1.15;
      const shellY = y0 + 0.08 + shellH / 2;
      const shellGeo = roundBox(3.65, shellH, 1.44, 0.16);
      const P = shellGeo.attributes.position;
      const hHalf = shellH / 2;
      for (let i = 0; i < P.count; i++) {
        const py = P.getY(i);
        const t = Math.max(0, Math.min(1, (py + hHalf) / shellH));
        P.setX(i, P.getX(i) * (1.0 - 0.15 * t));
        P.setZ(i, P.getZ(i) * (1.0 - 0.26 * t));
      }
      P.needsUpdate = true;
      shellGeo.computeVertexNormals();

      const shell = part(shellGeo, mats.paint, [0, shellY, z0], null, taxiGrp);
      shell.userData.isRoof = true;

      // 3. Khung viền đen và mặt hiển thị chữ TAXI vàng phát sáng
      const tilt = Math.atan2((1.44 * 0.26) / 2, shellH);
      const frontZ = 0.61;
      const signTex = taxiSignTexture(age, opts.burnt, rnd);
      const signFaceMat = new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: opts.burnt ? 0.95 : 0.18,
        metalness: 0.02,
        emissive: opts.burnt ? 0x000000 : 0xffea00,
        emissiveMap: signTex,
        emissiveIntensity: opts.burnt ? 0 : 0.95,
        envMap: env,
        envMapIntensity: 0.6
      });

      // Mặt trước: khung đen và biển chữ TAXI vàng phát quang
      const frontBezel = part(roundBox(2.92, 0.76, 0.06, 0.04), mats.black, [0, shellY, z0 + frontZ], [-tilt, 0, 0], taxiGrp);
      frontBezel.userData.isRoof = true;
      const frontPlate = part(new THREE.PlaneGeometry(2.82, 0.68), signFaceMat, [0, shellY, z0 + frontZ + 0.035], [-tilt, 0, 0], taxiGrp);
      frontPlate.userData.isRoof = true;

      // Mặt sau: khung đen và biển chữ TAXI vàng phát quang
      const rearBezel = part(roundBox(2.92, 0.76, 0.06, 0.04), mats.black, [0, shellY, z0 - frontZ], [-tilt, Math.PI, 0], taxiGrp);
      rearBezel.userData.isRoof = true;
      const rearPlate = part(new THREE.PlaneGeometry(2.82, 0.68), signFaceMat, [0, shellY, z0 - frontZ - 0.035], [-tilt, Math.PI, 0], taxiGrp);
      rearPlate.userData.isRoof = true;

      car.add(taxiGrp);
    }
    // --- PHỤ KIỆN RIÊNG CHO SUV (Giá nóc khí động học, cánh gió đuôi thể thao, ăng-ten vây cá mập, bậc bước chân việt dã, gạt mưa sau)
    if (S.isSuv && !S.isPickup) {
      const w0 = plan(0) - S.inset, w1 = w0 - S.tumble;
      // Chi tiết nắp cốp: thanh nẹp nắp cốp đen mờ tinh tế tích hợp tay mở cốp và camera lùi kín đáo
      const rearSurface = (x, y, lift = 0.06) => {
        const h = hitAt([x, y, -40], [0, 0, 1]);
        return h ? [h.p.x, h.p.y, h.p.z - lift] : null;
      };
      const garnishP = rearSurface(0, 7.50, 0.08);
      if (garnishP) {
        // Thanh nẹp nắp cốp đen mờ che trên biển số
        const garnish = part(roundBox(3.5, 0.24, 0.16, 0.05), mats.black, garnishP);
        garnish.userData.acc = 'tailgate';
        // Mắt camera lùi nhỏ màu đen mờ nằm chìm tinh tế ở gờ nẹp
        part(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 12), mats.wall, [garnishP[0], garnishP[1] - 0.02, garnishP[2] - 0.04], [Math.PI / 2, 0, 0]);
        part(new THREE.SphereGeometry(0.04, 10, 6), mats.black, [garnishP[0], garnishP[1] - 0.02, garnishP[2] - 0.065]);
      }
      // 1. Giá nóc khí động học (Aerodynamic Roof Rails)
      for (const sx of [1, -1]) {
        const railGrp = new THREE.Group();
        railGrp.userData.acc = 'roofRail';
        railGrp.userData.isRoof = true;
        const rx = sx * (w1 - 0.3);
        const rPts = [];
        rPts.push(new THREE.Vector3(rx, roof(2.5) + 0.08, 2.5));
        for (let rz = 2.2; rz >= -12.8; rz -= 0.5) {
          rPts.push(new THREE.Vector3(rx, roof(rz) + 0.18, rz));
        }
        rPts.push(new THREE.Vector3(rx, roof(-13.1) + 0.08, -13.1));
        const rTube = part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rPts), 36, 0.105, 8, false), mats.black, [0, 0, 0], null, railGrp);
        rTube.scale.set(0.92, 1.0, 1.0);
        rTube.userData.acc = 'roofRail'; rTube.userData.isRoof = true;
        // Dải cao su đen nẹp bảo vệ trên lưng giá nóc
        const stripPts = [];
        for (let rz = 2.0; rz >= -12.7; rz -= 0.6) {
          stripPts.push(new THREE.Vector3(rx, roof(rz) + 0.245, rz));
        }
        const rStrip = part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stripPts), 24, 0.025, 4, false), mats.chrome, [0, 0, 0], null, railGrp);
        rStrip.userData.acc = 'roofRail'; rStrip.userData.isRoof = true;
        // 3 chân đế đỡ vát góc ôm khít gờ mui xe
        for (const pz of [1.8, -5.2, -12.5]) {
          const cy0 = roof(pz) + 0.035, cy1 = roof(pz) + 0.17;
          const rLeg = part(roundBox(0.3, cy1 - cy0 + 0.04, 0.72, 0.06), mats.black, [rx, (cy0 + cy1) / 2, pz], null, railGrp);
          rLeg.userData.acc = 'roofRail'; rLeg.userData.isRoof = true;
        }
        car.add(railGrp);
      }

      // 2. Cánh gió nóc đuôi mui thể thao (Sporty Roof Spoiler) với vây gió hông & dải đèn phanh LED thứ 3
      const spY = roof(S.roofR) + 0.06, spZ = S.roofR - 0.82;
      const spW = 2 * (plan(spZ) - S.inset - S.tumble + 0.12);
      const spoiler = part(roundBox(spW, 0.26, 1.55, 0.1), mats.paint, [0, spY, spZ]);
      spoiler.userData.acc = 'spoiler';
      spoiler.userData.isRoof = true;
      // Dải đèn phanh LED trên cao thanh mảnh kéo dài
      part(roundBox(3.4, 0.14, 0.12, 0.03), mats.tailBrake, [0, -0.06, -1.06], null, spoiler);   // (mats không có tailGuide -> trước đây ra vật liệu trắng mặc định)
      part(roundBox(3.6, 0.18, 0.08, 0.02), mats.black, [0, -0.06, -1.03], null, spoiler);
      // Hai vây cánh gió bên hông (Side aerodynamic fins) ôm mép trên kính hậu
      for (const sx of [1, -1]) {
        const fin = part(roundBox(0.2, 0.55, 1.05, 0.07), mats.paint, [sx * (spW / 2 - 0.12), spY - 0.22, spZ - 0.05], [-0.3, 0, 0]);
        fin.userData.acc = 'spoiler'; fin.userData.isRoof = true;
      }

      // 3. Ăng-ten vây cá mập khí động học trên nóc
      const antZ = -11.8, antY = roof(antZ) + 0.16;
      const antShape = new THREE.Shape();
      antShape.moveTo(0, 0);
      antShape.quadraticCurveTo(0.18, 0.38, 0.55, 0.42);
      antShape.lineTo(0.68, 0.0);
      antShape.closePath();
      const antGeo = new THREE.ExtrudeGeometry(antShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
      antGeo.translate(-0.35, 0, -0.11);
      antGeo.rotateY(Math.PI / 2);
      const antMesh = part(antGeo, mats.paint, [0, antY, antZ]);
      antMesh.userData.acc = 'antenna';
      antMesh.userData.isRoof = true;

      // 4. Bậc bước chân hông xe việt dã (Side steps / running boards)
      for (const sx of [1, -1]) {
        const stepGrp = new THREE.Group();
        stepGrp.userData.acc = 'step';
        const stX = sx * (plan(0) + 0.28), stY = S.bottom[3][1] + 0.15;
        stepGrp.position.set(stX, stY, 0.2);
        // Khung nhôm hợp kim sáng bóng viền ngoài, bo vát 2 đầu
        part(roundBox(0.72, 0.14, 15.0, 0.06), mats.chrome, [0, 0, 0], null, stepGrp);
        // Tấm cao su đen nhám chống trượt
        part(new THREE.BoxGeometry(0.52, 0.04, 14.4), mats.black, [0, 0.07, 0], null, stepGrp);
        // Các gờ cao su ma sát nổi ngang
        for (let ri = -6.4; ri <= 6.4; ri += 1.28) {
          part(roundBox(0.42, 0.03, 0.38, 0.015), mats.chrome, [0, 0.09, ri], null, stepGrp);
          part(new THREE.BoxGeometry(0.36, 0.02, 0.28), mats.black, [0, 0.10, ri], null, stepGrp);
        }
        // Các tay đòn thép đỡ bên dưới từ khung gầm
        for (const bz of [-5.5, 0.2, 5.8]) {
          part(roundBox(0.85, 0.18, 0.28, 0.04), mats.black, [-sx * 0.32, -0.09, bz - 0.2], null, stepGrp);
        }
        car.add(stepGrp);
      }
      // Ốp rocker tối chạy liền dưới cửa: nối trực quan hai hốc bánh và làm thân xe gọn, chắc hơn.
      for (const sx of [1, -1]) {
        const cl = part(roundBox(0.22, 0.58, 14.6, 0.08), mats.black, [sx * (plan(0) + 0.03), 3.05, 0.1]);
        cl.userData.acc = 'step';
      }

      // 5. Gạt mưa kính sau SUV: nằm ngang ép sát chân kính hậu
      const rkW = new THREE.Group();
      rkW.userData.acc = 'wiper';
      const rwZ = S.cabin[0][0] - 0.15, rwY = top(rwZ) + 0.35;
      part(new THREE.CylinderGeometry(0.14, 0.18, 0.22, 12), mats.black, [0.2, rwY + 0.12, rwZ], [-0.58, 0, 0], rkW);
      part(roundBox(1.35, 0.07, 0.12, 0.02), mats.wiper, [0.85, rwY + 0.16, rwZ + 0.05], [-0.58, 0, 0.05], rkW);
      part(roundBox(2.4, 0.05, 0.08, 0.02), mats.black, [1.4, rwY + 0.18, rwZ + 0.07], [-0.58, 0, 0.04], rkW);
      car.add(rkW);
    }
    if (!S.isSuv && !S.isTruck) {
      // Tay mở cốp chìm, nằm ngay trên biển số.
      const handleHit = hitAt([0, S.plates[1] + 0.77, -40], [0, 0, 1]);
      if (handleHit) part(roundBox(1.25, 0.12, 0.1, 0.035), mats.black, [handleHit.p.x, handleHit.p.y, handleHit.p.z - 0.07]);
    }
    if (S.hatchback && S.style === 2) {
      // hatchback: cánh gió nhỏ đuôi mui đỡ đèn phanh trên cao, gạt mưa kính hậu nằm chéo chân kính
      const spZ = S.roofR - 0.55, spY = roof(spZ) + 0.02, spW = 2 * (plan(spZ) - S.inset - S.tumble + 0.05);
      const sp = part(roundBox(spW, 0.2, 1.25, 0.09), mats.paint, [0, spY, spZ], [0.08, 0, 0]);
      sp.userData.acc = 'spoiler'; sp.userData.isRoof = true;
      part(roundBox(2.4, 0.1, 0.08, 0.02), mats.tailBrake, [0, -0.07, -0.66], null, sp);
      const rkW = new THREE.Group(); rkW.userData.acc = 'wiper';
      const rwZ = S.cabin[0][0] + 0.25, rwY = top(rwZ) + 0.45;
      part(new THREE.CylinderGeometry(0.13, 0.17, 0.2, 12), mats.black, [0, rwY + 0.1, rwZ], [-0.45, 0, 0], rkW);
      part(roundBox(1.2, 0.07, 0.12, 0.02), mats.wiper, [0.55, rwY + 0.16, rwZ + 0.03], [-0.45, 0, 0.18], rkW);
      part(roundBox(2.6, 0.05, 0.08, 0.02), mats.black, [1.25, rwY + 0.3, rwZ + 0.08], [-0.45, 0, 0.18], rkW);
      car.add(rkW);
    }
    if (S.style === 3) {
      // van: ray trượt cửa lùa (rãnh đen ngang hông sau cửa lùa tầm chân kính), bậc lên xuống cản sau,
      // giá nóc chở thang / ống của xe thợ (ngẫu nhiên)
      for (const sx of [1, -1]) {
        const yR = top(-12) + 1.3, h = hitAt([sx * 20, yR, -12], [-sx, 0, 0]);
        if (h) { const rl = part(roundBox(0.16, 0.24, 13.0, 0.05), mats.black, [h.p.x + sx * 0.04, yR, -12.4]); rl.userData.acc = 'rail'; }
      }
      const st = part(roundBox(6.5, 0.22, 1.4, 0.06), mats.black, [0, 3.0, S.plan[0][0] - 0.2]);
      st.userData.acc = 'bumper';
      if (wr() < 0.55) {
        const rack = new THREE.Group(); rack.userData.acc = 'roofRail'; rack.userData.isRoof = true; car.add(rack);
        const yr = roof(-6) + 0.55, xr = plan(-6) - S.inset - S.tumble - 0.6;
        for (const sx of [1, -1]) part(roundBox(0.22, 0.22, 24, 0.05), mats.lip, [sx * xr, yr, -6.5], null, rack);
        for (const z of [-17, -12, -7, -2, 3]) {
          part(roundBox(2 * xr + 0.3, 0.16, 0.24, 0.04), mats.lip, [0, yr + 0.02, z], null, rack);
          for (const sx of [1, -1]) part(roundBox(0.3, 0.55, 0.3, 0.05), mats.black, [sx * xr, yr - 0.32, z], null, rack);
        }
        rack.traverse(m => { if (m.isMesh) m.userData.isRoof = true; });
      }
    }
    // --- PHỤ KIỆN RIÊNG CHO XE TẢI THÙNG LỬNG (Dropside Bed, Heavy Bumper, Cab Guard, Cab Steps, Tow Mirrors, Cargo)
    if (S.isPickup) {
      const bed = new THREE.Group(); bed.userData.acc = 'pickupBed'; car.add(bed);
      part(roundBox(12.9,0.22,12.5,0.06), mats.truckBedFloor, [0,5.35,-13.8], null, bed);
      for (let x=-5.7; x<=5.7; x+=0.95)
        part(roundBox(0.12,0.08,12,0.025), mats.truckBedFloor, [x,5.5,-13.8], null, bed);
      for (const sx of [-1,1]) {
        part(roundBox(0.38,0.18,13,0.06), mats.black, [sx*7,8.88,-13.85], null, bed);
        part(roundBox(1.65,1.65,6.8,0.38), mats.truckBedFloor, [sx*5.65,6.15,S.axleR], null, bed);
        part(roundBox(0.9,0.28,12.4,0.09), mats.black, [sx*7.7,2.8,0.15]);
        for (const z of [-4.5,4.5]) part(roundBox(0.7,0.18,0.5,0.04), mats.black, [sx*7.2,2.65,z]);
      }
      // Thin molded arch lips follow the actual wheel openings.
      for (const sx of [-1,1]) for (const az of [S.axleF,S.axleR]) {
        const lip = part(new THREE.TorusGeometry(S.r+S.archGap,0.11,6,40,Math.PI), mats.black,
          [sx*7.56,S.r,az], [0,Math.PI/2,0]);
        lip.userData.acc = 'fender';
      }
      // Front valance, skid plate and inset foglamp pods.
      part(roundBox(12.5,0.72,0.8,0.16), mats.black, [0,3.55,20.6]);
      part(roundBox(5.6,0.45,0.85,0.1), mats.lip, [0,3.1,20.5], [0.14,0,0]);
      for (const sx of [-1,1]) {
        part(roundBox(1.35,1.05,0.34,0.18), mats.black, [sx*5.3,4.65,20.7]);
        part(new THREE.CylinderGeometry(0.3,0.3,0.16,20), mats.chrome,
          [sx*5.3,4.65,20.91], [Math.PI/2,0,0]);
      }
      // Tailgate stamping and panel shut lines, attached to the rear skin.
      for (const sx of [-1,1]) {
        const h = hitAt([sx*5.65,7,-40],[0,0,1]);
        if (h) part(roundBox(0.045,2.65,0.055,0.012), mats.black, [sx*5.65,7,h.p.z-0.04]);
      }
      const rear = hitAt([0,7,-40],[0,0,1]);
      if (rear) {
        part(roundBox(9.5,0.055,0.06,0.015), mats.black, [0,5.85,rear.p.z-0.045]);
        part(roundBox(9.8,0.18,0.1,0.04), mats.paint, [0,6.35,rear.p.z-0.08]);
      }
      part(roundBox(12.9,2.95,0.35,0.08), mats.paint, [0,7.1,-7.35], null, bed);
      part(roundBox(12.6,0.18,0.55,0.06), mats.black, [0,8.87,-20.75], null, bed);
      part(roundBox(2.1,0.36,0.16,0.07), mats.black, [0,8,-21.22], null, bed);
      part(roundBox(13.6,0.65,1.15,0.14), mats.chrome, [0,3.5,-21]);
      part(roundBox(6,0.12,1,0.04), mats.black, [0,3.88,-21.05]);
      // đồ còn vương trong thùng (ngẫu nhiên): lốp sơ cua nằm ngửa, bao tải xếp chồng, thùng gỗ, can xăng
      const yF = 5.47, rub = plain(0x1b1b1c, 0.92, 0.02), sack = plain(new THREE.Color(0x8b7a58).lerp(new THREE.Color(0x5f5440), wr()), 0.97, 0);
      if (wr() < 0.45) { const t = part(new THREE.TorusGeometry(1.75, 0.72, 10, 28), rub, [(wr() - 0.5) * 4, yF + 0.72, -16.5 + wr() * 3], [Math.PI / 2 + (wr() - 0.5) * 0.15, 0, 0], bed); t.userData.cargo = true; }
      if (wr() < 0.5) for (let i = 0, n = 2 + (wr() * 3 | 0); i < n; i++) {
        const s = part(roundBox(2.5, 0.95, 1.7, 0.42), sack, [-3.4 + (wr() - 0.5) * 2, yF + 0.47 + (i > 2 ? 0.9 : 0), -11 - i % 3 * 1.8 + (wr() - 0.5) * 0.5], [(wr() - 0.5) * 0.12, (wr() - 0.5) * 0.5, (wr() - 0.5) * 0.12], bed);
        s.scale.set(1, 0.85 + 0.3 * wr(), 1);
      }
      if (wr() < 0.3) part(roundBox(2.6, 1.9, 2.3, 0.07), plain(new THREE.Color(0x7a6046).lerp(new THREE.Color(0x4f4436), wr()), 0.9, 0), [3.2, yF + 0.95, -9.5 - wr() * 3], [0, (wr() - 0.5) * 0.4, 0], bed);
      if (wr() < 0.35) part(roundBox(0.72, 1.55, 1.2, 0.12), plain(wr() < 0.5 ? 0x2f4a2b : 0x7c1a12, 0.55, 0.3), [5.5 - wr(), yF + 0.78, -19.4 + wr() * 1.5], [0, (wr() - 0.5) * 0.6, 0], bed);
    }
    // --- CỤM ĐÈN / LƯỚI lắp vào lỗ khoét
    if (S.isTruck) buildTruck({ S, opts, seed, age, cond, sev, color, env, mats, plain, part, hitAt, wr, car, g, plateMat, TB });
    const feat = new THREE.Group(); car.add(feat);
    const M = {
      wall: plain(0x0e1013, 0.35, 0.1, { side: THREE.DoubleSide }),
      reflector: plain(0x101216, 0.22, 0.35, { side: THREE.DoubleSide }),
      // xe bỏ hoang: đèn tắt (hết ắc quy) -> bóng / dải LED là nhựa trắng đục mờ sau kính, không tự sáng
      bulb: plain(0xd8dcdc, 0.3, 0.1, { emissive: 0x0a0a0a }),
      // chóa đèn hậu mạ bạc khía gối (nhìn qua kính đỏ thành đỏ rực lấp lánh), cũ thì xỉn mờ; xác cháy: muội đen
      tailBack: opts.burnt ? plain(0x1c1412, 0.85, 0.2, { side: THREE.DoubleSide }) : plain(new THREE.Color(0xc9cbcd).lerp(new THREE.Color(0x8c877e), age * 0.6), 0.28 + 0.25 * age, 0.92, { side: THREE.DoubleSide, normalMap: pillowNormalTexture(), normalScale: new THREE.Vector2(0.75, 0.75), envMapIntensity: 1.15 }),
      tailWall: plain(opts.burnt ? 0x15110f : new THREE.Color(0x9d9fa1).lerp(new THREE.Color(0x77736b), age * 0.6), 0.38, 0.85, { side: THREE.DoubleSide }),   // vách vỏ đèn mạ bạc mờ: mép cụm vẫn đỏ, không viền đen
      chrome: mats.chrome,
      slat: plain(0x161616, 0.55, 0.25),
      projLens: new THREE.MeshPhysicalMaterial({ color: 0xd6effc, roughness: 0.02, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, transmission: 0.52, opacity: 0.95, transparent: true, envMap: env, envMapIntensity: 2.4 }),
      drl: new THREE.MeshStandardMaterial({ color: new THREE.Color(0xb9bdbd).lerp(new THREE.Color(0x9a9282), age * 0.5), emissive: 0x060606, roughness: 0.42, envMap: env, envMapIntensity: 0.6 }),
      headLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xffffff).lerp(new THREE.Color(0xe6dcc4), age * 0.6), vertexColors: true, transparent: true, opacity: 0.32 + 0.22 * age, roughness: 0.03 + 0.25 * age, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.03 + 0.2 * age, envMap: env, envMapIntensity: 2.0, depthWrite: false }),
      // đèn sương mù: kính khía rãnh trước chóa crôm — xám bạc ánh kim, không phải quả cầu trắng
      fogLens: new THREE.MeshPhysicalMaterial({ color: opts.burnt ? 0x1e1a17 : new THREE.Color(0x8e979b).lerp(new THREE.Color(0x8c8676), age * 0.5), roughness: opts.burnt ? 0.9 : 0.12 + age * 0.3, metalness: opts.burnt ? 0.05 : 0.45, clearcoat: opts.burnt ? 0 : 0.8, clearcoatRoughness: 0.05 + 0.3 * age, envMap: env, envMapIntensity: opts.burnt ? 0.1 : 1.0 }),
      chromeIn: plain(opts.burnt ? 0x2a2420 : 0xd4d8dc, opts.burnt ? 0.85 : 0.10 + 0.2 * age, opts.burnt ? 0.3 : 0.92, { side: THREE.DoubleSide }),
      // dải dẫn sáng LED (acrylic mờ, đèn tắt): sau kính đỏ thành vạch đỏ hồng sáng hơn nền chóa
      tailGuide: plain(0xb4aaa6, 0.5, 0, { envMapIntensity: 0.5 }),
      tailBrake: plain(0xc4bab5, 0.42, 0, { envMapIntensity: 0.6 }),
      tailAmber: plain(new THREE.Color(0xc0620e).lerp(new THREE.Color(0x8a5a2a), age * 0.5), 0.3, 0.15, { emissive: 0x0c0600 }),
      tailReverse: plain(new THREE.Color(0xa9aeb0).lerp(new THREE.Color(0x8c8678), age * 0.5), 0.22, 0.55, { envMapIntensity: 0.9 }),   // chóa đèn lùi mạ bạc
      // kính đèn hậu: lớp lọc màu dựng theo vùng kính của cụm (buildFeature -> tailFilterMaterial); lớp bóng mặt ngoài cộng
      // phản chiếu (acrylic nhẵn, F0 ~4%, cũ thì xước mờ dần); màu đỉnh = bụi phủ (sáng thêm, mờ đi)
      tailLens: null, tailDust: W.dust, tailSeed: W.seed,
      tailGloss: tailGlossMaterial(env, age, true),
      tailShard: plain(0x8a1410, 0.12, 0.1, { transparent: true, opacity: 0.85, envMapIntensity: 0.8 }),
      honey: plain(0x0c0c0c, 0.7, 0.1, { map: honeyTexture(), alphaTest: 0.5, side: THREE.DoubleSide })
    };
    // mỗi cụm đèn một nhóm riêng (nhận diện khi đèn bị vỡ: va chạm, trúng đạn, hư sẵn)
    const lamps = [];
    for (const k in S.features) {
      const F = S.features[k];
      for (const sx of F.sym ? [1] : [1, -1]) {
        const fg = new THREE.Group(); fg.userData.lamp = F.kind; fg.userData.side = sx; feat.add(fg);
        buildFeature(F, sx, body, M, age, fg);
        if (F.kind === 'head' || F.kind === 'tail') lamps.push(fg);
      }
    }
    // --- LÒNG HỐC BÁNH KÍN & SÀN GẦM XE: vòm nhựa ôm sát mép vỏ ngoài, vách ngăn đứng bịt kín bên trong, sàn gầm che kín bụng xe
    const wInner = Math.max(3.6, S.trackHalf - 1.95);
    const wellMat = plain(0x0a0b0d, 0.96, 0.02, { side: THREE.DoubleSide });
    // xe tải: sắt-xi hở (không sàn gầm kín), cầu sau bánh đôi nằm ngoài thân cabin (không lòng hốc bánh sau)
    for (const az of S.isTruck ? [S.axleF] : [S.axleF, S.axleR]) {
      for (const sx of [1, -1]) {
        const well = part(wheelWellGeometry(S, az, sx), wellMat, [0, 0, 0]);
        well.castShadow = false;
        well.userData.well = true;
      }
    }
    if (!S.isTruck) {
      const underbody = part(underbodyGeometry(S, wInner), wellMat, [0, 0, 0]);
      underbody.castShadow = false;
      underbody.userData.well = true;
    }

    // Thân vỏ xe dân sự nguyên vẹn giữ bề mặt phẳng mịn, căng mọng, phản chiếu ánh sáng sắc nét;
    // các biến dạng móp méo chỉ xảy ra khi chịu va chạm vật lý thực tế (bị bắn hoặc bị xe tăng cán)


    // --- KHUNG GẦM nhìn thấy qua hốc bánh / dưới gầm: cầu trước / sau, giảm xóc, bình xăng, ống xả chạy dọc gầm
    // (xe tải có gầm riêng trong buildTruck)
    if (!S.isTruck) {
      const metal = plain(new THREE.Color(0x2c2c2c).lerp(new THREE.Color(0x4a3222), age * 0.8), 0.75, 0.5);
      for (const az of [S.axleF, S.axleR]) {
        part(new THREE.CylinderGeometry(0.28, 0.28, S.trackHalf * 2 - 1.4, 10), metal, [0, S.r, az], [0, 0, Math.PI / 2]);
        // giảm xóc: nằm sau vách lót hốc bánh (xIn = wInner) — trước đây thò ra ngoài vách thành mảng kim loại sáng vuông ngay trên lốp
        for (const sx of [1, -1]) part(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 10), metal, [sx * (wInner - 0.5), S.r + 1.7, az - 0.3], [0.1, 0, sx * 0.12]).userData.well = true;
      }
      part(roundBox(6.5, 1.0, 3.6, 0.3), metal, [0, 2.05, -7.0]);
      const ex = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.8, 1.9, 9), new THREE.Vector3(-1.2, 1.75, 0), new THREE.Vector3(-2.6, 1.8, -12), new THREE.Vector3(-4.2, 2.15, S.plan[0][0] + 1.2)]);
      part(new THREE.TubeGeometry(ex, 30, 0.2, 8, false), metal, [0, 0, 0]);
    }

    // --- HƯ HỎNG SẴN THEO THỜI GIAN: xe đỗ lâu / dính chiến sự không lành lặn như xe mới ra lò. Lập danh sách lúc thân
    // còn nguyên (dò mặt tôn nhanh bằng cây bao), móp thật ở bước sau (khi các khối gắn thân đã quy về toạ độ xe):
    // vết móp lẻ tẻ (vết quệt dọc cửa, vè, góc cản, capô / nóc bị vật rơi), cản xệ một góc, mui võng, đèn vỡ, kính hông vỡ
    const dents = [], sags = [];
    const zFront = S.plan[S.plan.length - 1][0], zRear = S.isTruck ? S.cabin[0][0] : S.plan[0][0], dK = 0.55 + 0.6 * sev;
    const dentAt = (o, d, r, depth, sz) => {
      const h = hitAt(o, d); if (!h) return;
      const n = h.n.clone(); if (n.x * d[0] + n.y * d[1] + n.z * d[2] > 0) n.negate();
      dents.push({ x: h.p.x, y: h.p.y, z: h.p.z, nx: n.x, ny: n.y, nz: n.z, r, depth: depth * dK, sz: sz || 1, ph: wr() * 6.28 });
    };
    const DENT = {
      // vết quệt dài dọc cửa (cột, xe khác cạ qua), lõm nông
      door: sx => { const D = S.doors, z = D[2] + (D[0] - D[2]) * wr(), y = S.sill + 0.8 + Math.max(0.3, top(z) - S.sill - 1.8) * wr(); dentAt([sx * 20, y, z], [-sx, 0, 0], 0.8 + 1.1 * wr(), 0.14 + 0.28 * wr(), 1.6 + 1.8 * wr()); },
      // vè trước / hông sau ngay trên vòm bánh
      arch: sx => { const az = wr() < 0.55 ? S.axleF : S.axleR, z = az + (wr() - 0.5) * 2 * (S.r + 1), y = 2 * S.r + 0.7 + wr() * 1.2; dentAt([sx * 20, y, z], [-sx, 0, 0], 1.1 + 1.0 * wr(), 0.2 + 0.35 * wr(), 1.2); },
      // hông sau / thành thùng bán tải
      quarter: sx => { const z = zRear + 2.5 + (S.doors[2] - zRear - 3.5) * wr(), y = S.sill + 1 + Math.max(0.3, top(z) - S.sill - 2) * wr(); dentAt([sx * 20, y, z], [-sx, 0, 0], 1.0 + 1.3 * wr(), 0.18 + 0.4 * wr(), 1.3); },
      // góc cản trước / sau: quệt khi lùi đỗ, móp sâu
      corner: sx => { const f = wr() < 0.55 ? 1 : -1, y = (f > 0 ? S.bumperF[1] : S.bumperR[1]) - 0.9 * wr(), x = sx * Math.max(1, plan(f > 0 ? zFront - 1.5 : zRear + 1.5) - 1.0 - 1.6 * wr()); dentAt([x, y, f * 40], [0, 0, -f], 1.0 + 1.3 * wr(), 0.28 + 0.5 * wr(), 1); },
      // capô / nóc: đá, mảnh vỡ, cành cây rơi
      hood: () => { const z = S.hood[0] + (S.hood[1] - S.hood[0]) * (0.2 + 0.6 * wr()); dentAt([(wr() - 0.5) * 8, 30, z], [0, -1, 0], 1.2 + 1.6 * wr(), 0.14 + 0.32 * wr(), 1); },
      roof: () => { const z = S.roofR + (S.roofF - S.roofR) * wr(); dentAt([(wr() - 0.5) * 6, 40, z], [0, -1, 0], 1.6 + 1.8 * wr(), 0.16 + 0.35 * wr(), 1); }
    };
    let nDent = Math.floor(sev * 6 * (0.5 + wr()));
    if (cond === 'clean' && wr() < 0.22) nDent = 1;
    for (let i = 0; i < nDent; i++) {
      const sx = wr() < 0.5 ? 1 : -1, k = wr();
      if (S.isTruck) {
        // xe ben: cabin quệt góc, thành thùng thép bị gầu xúc / đá tảng va móp lõm
        if (k < 0.35) dentAt([sx * 20, 6 + 4 * wr(), 9 + 9 * wr()], [-sx, 0, 0], 1 + wr(), 0.2 + 0.35 * wr(), 1.2);
        else if (k < 0.5) dentAt([sx * (3 + 3 * wr()), 5 + 3 * wr(), 40], [0, 0, -1], 1 + wr(), 0.25 + 0.4 * wr(), 1);
        else dents.push({ x: sx * 7.4, y: 8.5 + (TB.top - 10) * wr(), z: -19 + 24 * wr(), nx: sx, ny: 0, nz: 0, r: 1.2 + 1.6 * wr(), depth: (0.22 + 0.5 * wr()) * dK, sz: 1 + wr(), ph: wr() * 6.28 });   // thành / vách thùng
        continue;
      }
      (k < 0.3 ? DENT.door : k < 0.46 ? DENT.arch : k < 0.6 ? DENT.quarter : k < 0.78 ? DENT.corner : k < 0.9 ? DENT.hood : DENT.roof)(sx);
    }
    // mui võng: xe từng bị vật nặng đè (props c), tâm võng lệch về một bên
    if (opts.sag > 0.04 && !S.isTruck) {
      const h = hitAt([(wr() - 0.5) * 3, 40, (S.roofF + S.roofR) / 2 + (wr() - 0.5) * 3], [0, -1, 0]);
      if (h) dents.push({ x: h.p.x, y: h.p.y, z: h.p.z, nx: 0, ny: 1, nz: 0, r: 6.5 + 2 * wr(), depth: Math.min(1.8, opts.sag * 5.5), sz: 1.3, ph: wr() * 6.28 });
    }
    // cản xệ một góc (bung pát nhựa): góc cản trước / sau tụt xuống, chìa ra ngoài
    if (!S.isTruck && !S.isPickup && wr() < sev * 0.42) sags.push({ f: wr() < 0.55 ? 1 : -1, sx: wr() < 0.5 ? 1 : -1, amt: (0.3 + 0.7 * wr()) * (0.5 + sev) });
    // đèn pha / hậu vỡ (khoét ở bước sau), kính hông vỡ rơi (xe cháy: rụng hết)
    const brokenLamps = lamps.filter(fg => cond === 'burnt' || wr() < sev * (fg.userData.lamp === 'head' ? 0.32 : 0.26));
    // lá rụng đọng trên xe đỗ lâu ngoài trời: dồn nhiều ở máng chân kính chắn gió / quanh gạt mưa, rải trên nóc, capô,
    // cốp; xe càng bỏ lâu càng nhiều (xe cháy: không còn). 1 lưới gộp, gốc toạ độ xe -> bị cán / móp cùng thân
    if (!S.isTruck && cond !== 'burnt') {
      const nL = Math.round({ clean: 3, dusty: 10, rusted: 28, broken: 12 }[cond] * (0.5 + wr()));
      const P = [], UVs = [], I = [], zW = S.cabin[S.cabin.length - 1][0], up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < nL; i++) {
        const cl = wr() < 0.45;   // cụm chân kính
        const z = cl ? zW + 0.2 + wr() * 1.6 : zRear + 2 + wr() * (zFront - zRear - 4), x = (wr() - 0.5) * 2 * (plan(z) - 1.2);
        const h = hitAt([x, 40, z], [0, -1, 0]);
        if (!h || h.n.y < 0.45) continue;
        const n = h.n.clone().normalize(), t = new THREE.Vector3(1, 0, 0).cross(n).normalize(), bt = n.clone().cross(t), a = wr() * 6.28;
        const tu = t.clone().multiplyScalar(Math.cos(a)).addScaledVector(bt, Math.sin(a)), tv = n.clone().cross(tu);
        const s = 0.3 + 0.35 * wr(), cell = wr() * 4 | 0, u0 = (cell % 2) * 0.5, v0 = 1 - ((cell >> 1) + 1) * 0.5;
        const o = h.p.clone().addScaledVector(n, 0.025), curl = 0.05 + 0.08 * wr(), base = P.length / 3;
        // 3 x 2 đỉnh: lá cong lòng máng dọc gân, 2 mép vểnh lên
        for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) {
          const fu = j / 2 - 0.5, fv = k - 0.5, q = o.clone().addScaledVector(tu, fu * s * 1.2).addScaledVector(tv, fv * s * 0.55).addScaledVector(n, curl * Math.abs(fv) * 2 + 0.02 * Math.abs(fu));
          P.push(q.x, q.y, q.z); UVs.push(u0 + (fu + 0.5) * 0.5, v0 + (fv + 0.5) * 0.5);
        }
        for (const [a0, a1, a2] of [[0, 1, 2], [1, 3, 2], [2, 3, 4], [3, 5, 4]]) I.push(base + a0, base + a1, base + a2);
      }
      if (P.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(UVs, 2)); lg.setIndex(I); lg.computeVertexNormals();
        const lm = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMap: env, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2 }));
        lm.castShadow = false; lm.receiveShadow = true; lm.userData.acc = 'leaves'; car.add(lm);
      }
    }
    {
      const u = mats.cabin.userData.uni;
      if (cond === 'burnt') { u.uBk.value.set(2, 1, 1, 1); u.uBk2.value.set(1, 1, 0, 0); }
      else {
        let nPane = wr() < ({ dusty: 0.06, rusted: 0.3, broken: 0.78 }[cond] || 0) ? (cond === 'broken' && wr() < 0.4 ? 2 : 1) : 0;
        if (opts.glass && !nPane) nPane = 1;   // props: kính đã vỡ sẵn
        for (let i = 0; i < nPane; i++) {
          const k = S.isTruck ? (wr() * 2 | 0) : (wr() * 4 | 0);
          if (k === 0) u.uBk.value.z = 1; else if (k === 1) u.uBk.value.w = 1; else if (k === 2) u.uBk2.value.x = 1; else u.uBk2.value.y = 1;
          if (cond === 'broken') {   // vụn kính cường lực còn vương dưới đất cạnh cửa
            const sx = k % 2 ? 1 : -1, zp = k < 2 ? (S.doors[0] + S.doors[1]) / 2 : (S.doors[1] + S.doors[2]) / 2;
            const gm = new THREE.Mesh(new THREE.PlaneGeometry(3.5 + wr() * 2, 4 + wr() * 2), new THREE.MeshStandardMaterial({ map: glassCrumbTexture(wr), transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0.35, envMap: env, envMapIntensity: 1.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
            gm.rotation.set(-Math.PI / 2, 0, wr() * 6.3); gm.position.set(sx * (plan(zp) + 1.5 + wr()), 0.07, zp + (wr() - 0.5) * 3); gm.renderOrder = -1; g.add(gm);
          }
        }
        if (cond === 'broken' && wr() < 0.22 && !S.isTruck) u.uBk.value.y = 1;   // kính hậu
        if ((cond === 'broken' && wr() < 0.55) || (opts.sag > 0.04)) u.uE.value.set((wr() - 0.5) * 5, S.roofF + (S.cabin[S.cabin.length - 1][0] - S.roofF) * (0.3 + 0.5 * wr()), 3 + wr() * 4, 1);   // kính chắn gió rạn
      }
    }
    endFastCast();
    // --- BỊ XE TĂNG CÁN — ĐỘNG. Lưới "bản đồ lún" dưới thân xe (ô 0,8 đv): mỗi lần xích đè (stamp) ghi trần chiều cao
    // tôn bị ép tới, độ phủ dưới xích, hướng đẩy bè ngang, toạ độ dọc vệt (in mắt xích), và thời gian đã chịu tải.
    // Tôn chỉ sập khi chịu trọng lượng đủ lâu (~0,35 s) -> có độ trễ "sập" tự nhiên; xe tăng rẽ / lùi thì vệt mới chồng
    // lên vệt cũ (giữ chỗ đã bẹp). Lúc xích mới đè một bên: xe bị bênh nghiêng (bên bị đè lún, bên kia nhổm lên) rồi sập.
    // Xe tăng chủ lực: 2 dải xích rộng ~65 cm, tâm cách nhau ~2,8 m, gầm cao ~45 cm, dải xích chạm đất dài ~4,6 m.
    const TW = 2.6, TC = 11.2, FLAT = 3.0, BELLY = 4.6, TL = 37, yF = 0.6, ph = rnd() * 6, T_SAG = 0.35;
    const sstep = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
    const zC0 = S.cabin[0][0], zC1 = S.cabin[S.cabin.length - 1][0];
    const colTop = (x, z) => (z > zC0 && z < zC1 && Math.abs(x) < plan(z) ? Math.max(top(z), roof(z)) : top(z)) + 0.2;
    const GX0 = -11, GZ0 = -23, CS = 0.8, NX = 28, NZ = 58, NC = NX * NZ;
    let gridOn = false;   // lưới vệt xích còn toàn 0 (chưa bị xích đè) -> samp luôn ra 0, wrinkle khỏi đọc
    const gCap = new Float32Array(NC).fill(1e3), gUnd = new Float32Array(NC), gPx = new Float32Array(NC), gPz = new Float32Array(NC), gAl = new Float32Array(NC), gT = new Float32Array(NC);
    // dấu chân xe tăng đặt tại (tx, tz) hướng hd (toạ độ xe con): -> [trần, dưới xích, đẩy x, đẩy z, dọc vệt] hoặc null
    // có kích thước gầm thật (dim): trần = đúng mặt đáy xích / gầm xe tăng (c0 + dốc dọc / ngang, 2 đầu xích cong lên)
    // -> rebuild ép mọi đỉnh tôn / lốp / phụ kiện không cao hơn trần đó (khung thô thưa, sườn bị đè một phần vẫn bẹp đúng mép xích)
    const tankFootDim = (tx, tz, hd, c0, slope, D, roll) => { const ch = Math.cos(hd), sh = Math.sin(hd); return (x, z) => {
      const dx = x - tx, dz = z - tz, al = dx * sh + dz * ch, lat = dx * ch - dz * sh;
      if (Math.abs(al) > D.hl) return null;
      const jag = 0.6 * (vnoise3(x * 0.35 + ph, 1.7, z * 0.35) - 0.5);
      const dT = Math.abs(Math.abs(lat) - D.tc) - D.tw + jag, base = c0 + slope * al + roll * lat;
      let cap;
      if (dT < 0) cap = base + Math.max(0, Math.abs(al) - D.flat) * D.rise;
      else if (Math.abs(lat) < D.bw) cap = base + (Math.abs(al) > D.bEnd ? D.bEndH : D.belly);
      else return null;
      const under = dT < 0 ? 1 - sstep(D.flat - 2, D.hl, Math.abs(al)) : 0, side = Math.sign(lat) || 1;
      return [cap, under, side * ch, -side * sh, x * sh + z * ch];
    }; };
    let capOn = false;
    const tankFoot = (tx, tz, hd, c0 = 0, slope = 0, dim, roll = 0) => { if (dim) { capOn = true; return tankFootDim(tx, tz, hd, c0, slope, dim, roll); } const ch = Math.cos(hd), sh = Math.sin(hd); return (x, z) => {
      const dx = x - tx, dz = z - tz, al = dx * sh + dz * ch, lat = dx * ch - dz * sh;
      if (Math.abs(al) > TL / 2 + 1.5) return null;
      const jag = 2.2 * (vnoise3(x * 0.35 + ph, 1.7, z * 0.35) - 0.5) + 0.9 * (vnoise3(x * 1.1, 4.2, z * 1.1 + ph) - 0.5);
      const dA = Math.abs(lat - TC), dB = Math.abs(lat + TC), dT = Math.min(dA, dB) - TW + jag;
      const under = 1 - sstep(-0.3, 1.2, dT), inB = 1 - sstep(TC - TW - 0.6, TC - TW + 0.8, Math.abs(lat));
      if (under < 0.01 && inB < 0.01) return null;
      const endK = 1 - sstep(TL / 2 - 3, TL / 2 + 1.5, Math.abs(al));   // 2 đầu dải xích cong lên (bánh dẫn / bánh căng)
      let cap = under > 0.01 ? FLAT + (BELLY - FLAT) * (1 - under) * inB + 30 * (1 - under) * (1 - inB) : BELLY + 30 * (1 - inB);
      cap += (14 - cap) * (1 - endK);
      // đáy xích là đường dốc (xe tăng đang chúc / ngóc trên xác xe): tôn chỉ bị ép tới mặt dưới dải xích -> vệt nghiền chéo
      if (under > 0.01) cap = Math.max(cap, c0 + slope * al);
      const side = Math.sign(dA < dB ? lat - TC : lat + TC) || 1;
      return [cap, under * endK, side * ch, -side * sh, x * sh + z * ch];
    }; };
    const events = [];
    let lastPose = null;
    let cShadow = null;
    let crushDirty = false, crushMax = 0, tilt = { r: 0, p: 0, tr: 0, tp: 0 }, debrisDone = false;
    // in một dấu chân: dt = thời gian chịu tải thêm. Trả về true nếu bản đồ lún đổi
    const stamp = (foot, dt) => {
      let ax = 0, az = 0, aw = 0;
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const x = GX0 + i * CS, z = GZ0 + j * CS, r = foot(x, z); if (!r) continue;
        const k = j * NX + i, H = colTop(x, z);
        if (r[0] < H) {
          const t0 = gT[k];
          gT[k] = Math.min(1, gT[k] + dt / T_SAG);
          if (gT[k] > t0) {
            if (Math.abs(x) < 8 && Math.abs(z) < 20) { ax += x; az += z; aw++; }
          }
        }
        if (r[0] < gCap[k] - 0.04) {
          gCap[k] = r[0];
          crushDirty = true;
        }
        if (r[1] > gUnd[k]) { gUnd[k] = r[1]; gPx[k] = r[2]; gPz[k] = r[3]; gAl[k] = r[4]; gridOn = true; }
      }
      // tải mới dồn lệch về một bên -> bênh nghiêng: bên bị đè lún xuống, bên kia nhổm lên
      if (aw > 3) {
        const cx = ax / aw, cz = az / aw;
        // Mũi xe ở +z, đuôi xe ở -z: đè nửa trước (cz > 0) -> mũi cắm xuống đất (pitch > 0), đuôi nhổng lên
        // Đè nửa sau (cz < 0) -> đuôi cắm xuống, mũi ngóc lên (pitch < 0)
        // Đè bên phải (+x) -> bên phải lún (roll < 0), bên trái kênh lên
        const maxTiltP = 0.22, maxTiltR = 0.16;
        tilt.tp = Math.sign(cz) * Math.min(maxTiltP, Math.abs(cz) / 14 * maxTiltP) * Math.min(1, aw / 25);
        tilt.tr = -Math.sign(cx) * Math.min(maxTiltR, Math.abs(cx) / 7 * maxTiltR) * Math.min(1, aw / 25);
      }
      return crushDirty;
    };
    const samp1 = (A, v, v0, n) => { const f = (v - v0) / CS, i = Math.floor(f); if (i < 0) return A[0]; if (i >= n - 1) return A[n - 1]; const u = f - i; return A[i] * (1 - u) + A[i + 1] * u; };
    // trần thấp nhất từng bị đè trong ô (lân cận gần nhất: mép vệt xích sắc, không nội suy với ô chưa bị đè 1e3)
    // vệt xích đè thấp xuống trong vùng khoang lái (dưới nóc thân) -> nội thất (ghế, taplô) đã bị nghiền, ẩn đi
    const cabinCapped = () => {
      for (let j = 0; j < NZ; j++) { const z = GZ0 + j * CS; if (z < zC0 || z > zC1) continue;
        for (let i = 0; i < NX; i++) { const x = GX0 + i * CS; if (Math.abs(x) < plan(z) - 0.5 && gCap[j * NX + i] < top(z)) return true; } }
      return false;
    };
    const capNear = (x, z) => {
      const fx = (x - GX0) / CS, fz = (z - GZ0) / CS;
      const i0 = Math.floor(fx), j0 = Math.floor(fz);
      if (i0 < 0 || j0 < 0 || i0 >= NX - 1 || j0 >= NZ - 1) {
        const ci = Math.max(0, Math.min(NX - 1, Math.round(fx)));
        const cj = Math.max(0, Math.min(NZ - 1, Math.round(fz)));
        return gCap[cj * NX + ci];
      }
      const u = fx - i0, v = fz - j0;
      const k00 = j0 * NX + i0;
      const c00 = gCap[k00], c10 = gCap[k00 + 1], c01 = gCap[k00 + NX], c11 = gCap[k00 + NX + 1];
      const v00 = c00 < 900 ? 1 : 0, v10 = c10 < 900 ? 1 : 0, v01 = c01 < 900 ? 1 : 0, v11 = c11 < 900 ? 1 : 0;
      const count = v00 + v10 + v01 + v11;
      if (count === 0) return 1e3;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      if (count === 4) {
        return w00 * c00 + w10 * c10 + w01 * c01 + w11 * c11;
      }
      const sumW = w00 * v00 + w10 * v10 + w01 * v01 + w11 * v11;
      // mép vệt: điểm chỉ chạm một phần ô bị đè -> coi như ngoài vệt (nhánh uốn cong dẻo hạ dần thành dốc mượt). Trước đây
      // cộng thêm tới 6 đv -> đỉnh mép giữ nguyên độ cao cạnh đỉnh bị ép sát đất: mũi / đuôi xe dựng thành vách răng cưa
      if (sumW < 0.5) return 1e3;
      const avg = (w00 * v00 * c00 + w10 * v10 * c10 + w01 * v01 * c01 + w11 * v11 * c11) / sumW;
      return avg + (1 - sumW) * 1.2;
    };
    // Mô phỏng vùng uốn cong dẻo liên tục của kết cấu kim loại trước khi bị nghiền nát hoàn toàn:
    // Dầm khung truyền lực dọc trục Z làm nắp ca-pô, vè và sườn xe trước điểm đè bị uốn cong võng xuống,
    // đồng thời kim loại tấm bị dồn nén phồng nở sang hai bên (buckling) tạo các gờ nếp nhăn dập thực tế.
    const BEND_RADIUS = 9.0;
    const plasticDeform = (x, y, z, X, Y, Z, k) => {
      if (!capOn) return [X, Y, Z, k];
      const cCenter = capNear(X, Z);

      if (cCenter < 900) {
        // Điểm nằm trực tiếp trong vùng bị đè dưới đáy xích / gầm xe tăng:
        // Tôn bị ép không phẳng như tấm sắt cán: đỉnh cao nhất chạm đáy xích / gầm, bên dưới là các gờ / rãnh nếp gấp nhiều
        // hướng (tôn nóc, cột, cửa gập chồng lên nhau), sâu ~10-20 cm; gợn nhẹ giữa các nếp, không răng cưa nhọn
        const rx = X * 0.45 + Z * 0.35, rz = -X * 0.35 + Z * 0.45;
        const n1 = 0.5 + 0.5 * Math.sin(X * 0.37 + ph) * Math.cos(Z * 0.29 - ph), n2 = 0.5 + 0.5 * Math.sin(X * 0.83 - Z * 0.61 + ph * 2);
        const ridge = 0.6 * Math.abs(Math.sin(rx * 1.1 + n2 * 3)) + 0.4 * Math.abs(Math.sin(rz * 1.6 + n1 * 4));
        const crumple = -(0.25 + 0.75 * n1) * ridge * 1.35 * Math.min(1.0, Math.max(0.0, (cCenter - 0.6) / 2.0)) + 0.06 * Math.sin(rx * 0.8 + ph) * Math.cos(rz * 0.8);

        Y = Math.min(Y, cCenter + crumple);

        // Phồng nở sang hai bên (Lateral Bulging) mượt mà của sườn và tai xe khi bị nén dồn
        const sx = Math.sign(x) || 1;
        const latT = Math.min(1.0, Math.max(0.0, (Z - 4.0) / 14.0));
        const bulge = 0.28 * Math.sin(Math.PI * latT);
        X += sx * bulge;

        // Chùn ngắn lại theo trục dọc do nén
        Z -= 0.12 * (1.0 - Math.min(1.0, cCenter / 4.0));

        k = Math.max(k, 0.82);
        return [X, Y, Z, k];
      }

      // Quét nhanh tìm vùng biên uốn dẻo (bán kính quét gọn 4 ô x 6 ô)
      const i0 = Math.round((X - GX0) / CS), j0 = Math.round((Z - GZ0) / CS);
      if (i0 >= 0 && j0 >= 0 && i0 < NX && j0 < NZ) {
        let minCap = 1e3, minDistSq = 1e6;
        for (let dj = -6; dj <= 6; dj++) {
          const nj = j0 + dj;
          if (nj < 0 || nj >= NZ) continue;
          for (let di = -5; di <= 5; di++) {
            const ni = i0 + di;
            if (ni < 0 || ni >= NX) continue;
            const ca = gCap[nj * NX + ni];
            if (ca < 900) {
              const dx = di * CS, dz = dj * CS;
              const d2 = dx * dx + dz * dz;
              if (d2 < minDistSq) {
                minDistSq = d2;
                minCap = ca;
              }
            }
          }
        }

        if (minCap < 900) {
          const dist = Math.sqrt(minDistSq);
          if (dist < 6.5) {
            const t = 1.0 - dist / 6.5;
            // Đường cong uốn dẻo bậc 3 trơn mượt
            const bendCurve = t * t * (3.0 - 2.0 * t);
            const targetY = Y * (1.0 - bendCurve) + minCap * bendCurve;
            Y = Math.min(Y, targetY);

            // Phồng nở nhẹ sang hai bên theo lực nén
            const sx = Math.sign(x) || 1;
            X += sx * 0.18 * Math.sin(Math.PI * t);

            k = Math.max(k, 0.5 * bendCurve);
          }
        }
      }
      return [X, Y, Z, k];
    };
    const samp = (A, x, z, def) => {
      const fx = (x - GX0) / CS, fz = (z - GZ0) / CS, i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= NX - 1 || j >= NZ - 1) return def;
      const u = fx - i, v = fz - j, k = j * NX + i;
      return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + NX] * (1 - u) + A[k + NX + 1] * u) * v;
    };
    // trần hiệu dụng: tôn hạ dần theo thời gian chịu tải (sập), cap thấp nhất đã từng bị đè
    // khối máy / cầu xe / sàn khung cứng không ép dẹt hết: đống tôn nhăn chồng lên còn cao ~40-60 cm
    // ---- THÂN MỀM XPBD (car_softbody.js): khung thô bị xích đè, tôn tự gập / cột tự gãy theo lực ----
    const SB = CarSoftBody.create(S, top, roof, plan, [S.cabin[0][0], S.cabin[S.cabin.length - 1][0]]);
    const tmp4 = [0, 0, 0, 0];
    // trần hiệu dụng tại (x, z): mặt nóc nghỉ H dời theo khung
    const capAt = (x, z) => { const H = colTop(x, z); SB.dispAt(x, H, z, tmp4); return [H + tmp4[1], H]; };
    // đỉnh hiển thị: dời theo khung + nếp nhăn tôn chi tiết theo mức ép k (nhiễu xoay chéo, nhiều hướng)
    const wrinkle = (x, y, z, d, out) => {
      let k = d[3];
      const under = gridOn ? samp(gUnd, x, z, 0) : 0, along = gridOn ? samp(gAl, x, z, 0) : 0;
      const maxShift = 2.4;
      const dX = Math.max(-maxShift, Math.min(maxShift, d[0]));
      const dZ = Math.max(-maxShift, Math.min(maxShift, d[2]));
      let X = x + dX, Y = y + d[1], Z = z + dZ;
      if (k > 0.02) {
        // Gợn sóng nhăn kim loại mềm mại tự nhiên, biên độ vừa phải, triệt tiêu gai nhọn
        const rx = x * 0.5 + z * 0.4, rz = -x * 0.4 + z * 0.5;
        const wave = Math.sin(rx * 0.9 + ph) * Math.cos(rz * 0.85);
        const amp = 0.18 * k * Math.min(1, Math.max(0.3, y) / 2);
        Y += amp * wave;
        X += amp * 0.4 * Math.cos(rx * 0.7);
        Z += amp * 0.4 * Math.sin(rz * 0.7);
        if (under > 0.5) Y -= under * 0.04 * sstep(0.35, 0.5, Math.abs(((along / 1.2) % 1 + 1) % 1 - 0.5) * 2);
      }
      if (capOn) {
        const [pX, pY, pZ, pK] = plasticDeform(x, y, z, X, Y, Z, k);
        X = pX; Y = pY; Z = pZ; k = pK;
      }
      out[0] = X; out[1] = Math.max(0.24, Y); out[2] = Z;
      out[3] = k; out[4] = under; out[5] = along;
      return out;
    };
    // ghi trạng thái gốc mọi thứ trên thân để dựng lại mỗi lần khung đổi
    // The new cargo assemblies must deform vertex-by-vertex in car coordinates.
    if (S.isPickup || S.isDump) {
      car.updateMatrixWorld(true);
      for (const root of car.children.slice()) {
        if (!['dumpBody','pickupBed'].includes(root.userData.acc)) continue;
        root.userData.structural = true;
        const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
        for(const m of meshes) {
          m.geometry=m.geometry.clone();m.geometry.applyMatrix4(m.matrixWorld);
          m.position.set(0,0,0);m.quaternion.identity();m.scale.set(1,1,1);
          // chi tiết dài (dầm, thanh, ống, vách) chia nhỏ để uốn gập theo vệt xích
          const bb=(m.geometry.computeBoundingBox(),m.geometry.boundingBox), ext=Math.max(bb.max.x-bb.min.x,bb.max.z-bb.min.z);
          // (chỉ lưới thưa đỉnh dọc chiều dài: hộp / dầm / trụ / ống; lưới dày như bạt, sàn ben đã đủ mức đỉnh để uốn)
          if(ext>3) {
            const P=m.geometry.attributes.position, ax=bb.max.x-bb.min.x>=bb.max.z-bb.min.z?0:2, lv=new Set();
            for(let i=0;i<P.count&&lv.size<64;i++) lv.add(Math.round((ax?P.getZ(i):P.getX(i))*2));
            if(lv.size<ext/2.2) { const t=tessellate(m.geometry,2.0); m.geometry.dispose(); m.geometry=t; }
          }
        }
        root.traverse(o=>{if(o.isGroup){o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);}});
      }
      car.updateMatrixWorld(true);
    }
    // One weather/burn state for every opaque accessory, including the new bed and cab parts.
    const addonWear = { value: new THREE.Vector4(W.dust,W.age,W.rust,opts.burnt ? 1 : 0) };
    const weathered = new Set();
    if (S.isPickup || S.isDump || S.isTruck) car.traverse(o=>{
      if(!o.isMesh || o===body || o===cabin || o===cabIn)return;
      const list=Array.isArray(o.material)?o.material:[o.material];
      if(!list.some(m=>m&&m.isMeshStandardMaterial&&!m.transparent&&m!==mats.tire&&!m.userData.noWear))return;   // noWear: vải bạt (không gỉ)
      o.geometry=o.geometry.clone();
      const ref=o.geometry.attributes.position.clone();
      const matrix=new THREE.Matrix4().copy(car.matrixWorld).invert().multiply(o.matrixWorld);
      const point=new THREE.Vector3();
      for(let i=0;i<ref.count;i++){point.fromBufferAttribute(ref,i).applyMatrix4(matrix);ref.setXYZ(i,point.x,point.y,point.z);}
      o.geometry.setAttribute('aWeatherRest',ref);
      for(const m of list) {
        if(!m||!m.isMeshStandardMaterial||m.transparent||m===mats.tire||m.userData.noWear||weathered.has(m))continue;
        weathered.add(m);const before=m.onBeforeCompile,beforeKey=m.customProgramCacheKey.call(m);
        m.onBeforeCompile=sh=>{
          before.call(m,sh);sh.uniforms.uAddonWear=addonWear;
          sh.vertexShader='attribute vec3 aWeatherRest; varying vec3 vAddonRest; varying vec3 vAddonN;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAddonRest=aWeatherRest; vAddonN=normal;');
          sh.fragmentShader=`varying vec3 vAddonRest; varying vec3 vAddonN; uniform vec4 uAddonWear;
float awHash3(vec3 p){p=fract(p*0.3183099+vec3(0.71,0.113,0.419));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float awNoise(vec3 x){
  vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(awHash3(i),awHash3(i+vec3(1.0,0.0,0.0)),f.x),mix(awHash3(i+vec3(0.0,1.0,0.0)),awHash3(i+vec3(1.0,1.0,0.0)),f.x),f.y),
             mix(mix(awHash3(i+vec3(0.0,0.0,1.0)),awHash3(i+vec3(1.0,0.0,1.0)),f.x),mix(awHash3(i+vec3(0.0,1.0,1.0)),awHash3(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
}
float awFbm(vec3 p){return 0.5*awNoise(p)+0.25*awNoise(p*2.03+1.7)+0.125*awNoise(p*4.07+3.1)+0.0625*awNoise(p*8.13+5.3);}
`+sh.fragmentShader;
          sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            vec3 ap=vAddonRest;
            vec3 an=normalize(vAddonN);
            float up=clamp(an.y,0.0,1.0);
            float age=uAddonWear.y;
            float rustParam=uAddonWear.z;
            float dustParam=uAddonWear.x;
            float burnt=uAddonWear.w;

            float nB=awFbm(ap*0.25);
            float nF=awFbm(ap*0.9+4.0);
            float nFine=awNoise(ap*3.5);

            float lum=dot(diffuseColor.rgb,vec3(0.3,0.59,0.11));
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(lum*1.05+0.04),age*0.28);

            // Mảng bong tróc sơn mượt mà tự nhiên theo thời gian
            float peel=smoothstep(0.42,0.88,age)*(0.35+0.65*up)*smoothstep(0.64,0.68,awFbm(ap*0.55+2.0)+0.15*nF);
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(lum*1.1+0.12),peel*0.65);

            // Gỉ sét tự nhiên loang lổ nhiều tầng màu
            float lowDirt=1.0-smoothstep(2.0,8.5,ap.y);
            float rustMask=smoothstep(0.68,0.90,awFbm(ap*0.5+7.0))+peel*0.8+lowDirt*0.45;
            float rust=clamp(rustParam*smoothstep(0.28,0.62,rustMask*(0.4+0.8*nF)),0.0,1.0);
            vec3 rustCol=mix(vec3(0.14,0.055,0.024),vec3(0.42,0.17,0.06),nFine);
            diffuseColor.rgb=mix(diffuseColor.rgb,rustCol,rust);

            // Vết xước trầy kim loại
            float chips=step(0.965,awNoise(ap*6.0))*age*0.4;
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.48,0.46,0.42),chips);

            // Bụi đất bám ở đáy và mặt phẳng ngang
            float dust=dustParam*clamp(smoothstep(6.0,1.5,ap.y)*(0.4+0.6*nB)+up*0.65*smoothstep(0.35,0.75,nB),0.0,0.85);
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.34,0.30,0.23),dust*0.75);

            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.018,0.014,0.011)*(0.8+0.4*nB),burnt);
            float addonRough=max(max(dust,rust),burnt);`)
            .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.95,addonRough);')
            .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=1.0-0.9*addonRough;')
            .replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat*=1.0-addonRough;\n#endif');
        };
        m.customProgramCacheKey=()=> 'civil_accessory_weather_v2|'+beforeKey;
      }
    });
    // --- MÓP THẬT các vết đã lập: thân / khoang kính dời đỉnh + đánh dấu nếp gấp (shader vẽ tróc sơn, bụi kẹt trong
    // nếp); chi tiết gắn thân dựng sẵn toạ độ xe (khối thùng, đèn, hốc bánh) móp theo, chi tiết đặt theo vị trí dời cả khối.
    // Làm trước khi chụp trạng thái nghỉ -> vết móp cũ còn nguyên khi xe bị cán / húc tiếp
    if (dents.length || sags.length) {
      const o4 = [0, 0, 0, 0];
      const wearDisp = (x, y, z, out) => {
        let dx = 0, dy = 0, dz = 0, cr = 0;
        for (const d of dents) {
          const ex = x - d.x, ey = y - d.y, ez = (z - d.z) / d.sz, l2 = ex * ex + ey * ey + ez * ez;
          if (l2 >= d.r * d.r) continue;
          // gợn tôn theo cỡ vết (vết to gợn thưa, không thành răng cưa); vết rộng như mui võng không tróc sơn nhiều
          const fq = 2.4 / Math.max(1, d.r * 0.6), t = 1 - l2 / (d.r * d.r), k = d.depth * t * t * (0.82 + 0.18 * Math.sin((ex * 2.1 + ey * 1.5 + ez * 1.8) * fq + d.ph));
          dx -= d.nx * k; dy -= d.ny * k; dz -= d.nz * k;
          cr = Math.max(cr, Math.min(0.3, d.depth * 0.8) * Math.min(1, 2.5 / d.r) * Math.sin(Math.PI * Math.min(1, t * 1.5)));
        }
        for (const s of sags) {
          const zb = s.f > 0 ? S.bumperF[0] - 0.8 : S.bumperR[0] + 0.8, zE = s.f > 0 ? zFront : zRear;
          const wz = sstep(0, 1, (z - zb) / (zE - zb)), wx = sstep(1.0, Math.max(1.5, plan(z)), x * s.sx);
          const yT = (s.f > 0 ? S.bumperTop[0] : S.bumperTop[1]) + 0.4, wy = 1 - sstep(yT - 0.6, yT + 0.9, y);
          const k = s.amt * wz * wx * wy;
          if (k <= 0) continue;
          dy -= k; dz += s.f * k * 0.3; dx += s.sx * k * 0.15; cr = Math.max(cr, Math.min(0.3, k * 0.35));
        }
        out[0] = dx; out[1] = dy; out[2] = dz; out[3] = cr; return out;
      };
      const deformGeo = (geo, crAttr) => {
        const A = geo.attributes.position, cr0 = crAttr ? new Float32Array(A.count) : null;
        let any = false;
        for (let i = 0; i < A.count; i++) {
          const x = A.getX(i), y = A.getY(i), z = A.getZ(i);
          wearDisp(x, y, z, o4);
          if (o4[0] || o4[1] || o4[2]) { A.setXYZ(i, x + o4[0], y + o4[1], z + o4[2]); any = true; }
          if (cr0 && o4[3] > 0.02) { cr0[i] = o4[3]; crAttr.setZ(i, o4[3]); }
        }
        if (any) { A.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); }
        if (cr0) { geo.userData.cr0 = cr0; crAttr.needsUpdate = true; }
      };
      deformGeo(bodyGeo, bodyGeo.attributes.aCr); deformGeo(cabGeo, cabGeo.attributes.aCr);
      // lưới gắn thân nằm ngoài mọi vết móp / góc cản xệ: bỏ qua (xe ben có hàng trăm khối thép)
      const touched = geo => {
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const bs = geo.boundingSphere, c = bs.center;
        if (dents.some(d => Math.hypot(c.x - d.x, c.y - d.y, c.z - d.z) < bs.radius + d.r * Math.max(1, d.sz))) return true;
        return sags.some(s => (s.f > 0 ? c.z + bs.radius > S.bumperF[0] - 0.8 : c.z - bs.radius < S.bumperR[0] + 0.8));
      };
      const moveAttached = o => {
        if (o === body || o === cabin || o === cabIn) return;
        if (o.isMesh && o.position.lengthSq() === 0 && o.quaternion.w === 1 && o.geometry && o.geometry.attributes.position) { if (touched(o.geometry)) deformGeo(o.geometry, null); return; }
        if (o.isGroup && o.position.lengthSq() === 0 && o.quaternion.w === 1) { o.children.forEach(moveAttached); return; }
        wearDisp(o.position.x, o.position.y, o.position.z, o4); o.position.x += o4[0]; o.position.y += o4[1]; o.position.z += o4[2];
      };
      car.children.slice().forEach(moveAttached);
    }
    // đèn vỡ: kính khoét thủng lởm chởm (đôi khi rụng gần hết), bóng / dải LED bên trong vỡ theo
    const lensShardMat = {
      head: plain(0xdfe4e0, 0.05, 0.25, { transparent: true, opacity: 0.75, envMapIntensity: 1.6, side: THREE.DoubleSide }),
      tail: plain(0x8a1410, 0.12, 0.1, { transparent: true, opacity: 0.85, envMapIntensity: 0.8, side: THREE.DoubleSide })
    };
    for (const fg of brokenLamps) {
      const lens = fg.children.find(m => m.userData.lens);
      if (!lens) continue;
      // xác cháy: kính nhựa đèn chảy rụng hết, chỉ còn hốc đèn đen
      const f = cond === 'burnt' ? 1 : holeLens(lens, null, 0.45 + 0.6 * wr(), wr);
      if (f > 0.85) lens.visible = false;
      for (const m of fg.children) if (m !== lens && m.geometry && m.geometry.type !== 'BufferGeometry' && (cond === 'burnt' || wr() < 0.4)) m.visible = false;
      if (cond === 'broken') for (let i = 0; i < 3; i++) {   // mảnh kính đèn vương dưới đất
        if (!lens.geometry.boundingSphere) lens.geometry.computeBoundingSphere();
        const c = lens.geometry.boundingSphere.center, m = new THREE.Mesh(shardGeometry(0.25 + 0.25 * wr(), wr), fg.userData.lamp === 'head' ? lensShardMat.head : lensShardMat.tail);
        m.position.set(c.x + (wr() - 0.5) * 3, 0.06, c.z + Math.sign(c.z) * (1 + 2 * wr())); m.rotation.y = wr() * 6.3; g.add(m);
      }
    }
    const restGeo = new Map(), restObj = [], binds = new Map();
    const keepGeo = geo => { if (!restGeo.has(geo)) restGeo.set(geo, geo.attributes.position.array.slice()); };
    keepGeo(bodyGeo); keepGeo(cabGeo);
    const collect = o => {
      if (o === body || o === cabin || o === cabIn) return;
      if (o.isMesh && o.position.lengthSq() === 0 && o.quaternion.w === 1) { keepGeo(o.geometry); restObj.push({ o, geo: o.geometry }); return; }
      if (o.isGroup && o.position.lengthSq() === 0) { o.children.forEach(collect); return; }
      restObj.push({ o, p: o.position.clone(), s: o.scale.clone(), r: o.rotation.clone(), v: o.visible, j: [rnd() - 0.5, rnd() - 0.5] });
    };
    car.children.slice().forEach(collect);
    const bindOf = geo => { let b = binds.get(geo); if (!b) { b = SB.bind(restGeo.get(geo)); binds.set(geo, b); } return b; };
    const dd = [0, 0, 0, 0], qq = [0, 0, 0, 0, 0, 0];
    const crushGeo = (geo, track) => {
      const A = geo.attributes.position, R = restGeo.get(geo), C = track ? geo.attributes.aCr : null, B = bindOf(geo), cr0 = geo.userData.cr0;
      SB.prepDisp();   // nodeK + (P - R) mỗi điểm khung tính 1 lần cho cả lưới
      for (let i = 0; i < A.count; i++) {
        SB.dispOfP(B, i, dd);
        wrinkle(R[3 * i], R[3 * i + 1], R[3 * i + 2], dd, qq);
        A.setXYZ(i, qq[0], qq[1], qq[2]);
        if (C) C.setXYZ(i, qq[4], qq[5], cr0 ? Math.max(qq[3], cr0[i]) : qq[3]);   // giữ nếp gấp của vết móp cũ
      }
      A.needsUpdate = true; if (C) C.needsUpdate = true;
      vertexNormals(geo);
      geo.computeBoundingSphere();
    };
    const wheels = [];
    const rebuild = () => {
      crushDirty = false;
      crushGeo(bodyGeo, true); crushGeo(cabGeo, true);
      // chỉ xe tăng cán (đã có dấu xích) mới tính là "bẹp" toàn xe; húc / nòng quét / đạn nhỏ chỉ móp cục bộ — trước đây
      // một cú húc đẩy khung lún -> xe bị coi như đã bị cán: mất hộp đèn taxi, giá nóc, gạt mưa, ruột đèn pha
      const mx = lastPose ? SB.maxK : Math.min(SB.maxK, 0.18);
      if (crushMax < 0.15 && mx >= 0.15) events.push('crunch', 'glass');
      if (crushMax < 0.45 && mx >= 0.45) events.push('collapse', 'tire');
      crushMax = Math.max(crushMax, mx);
      const heavy = crushMax > 0.45;
      const cabCap = capOn && cabinCapped();
      cabIn.visible = !heavy && !cabCap; mats.cabin.side = (heavy && cabCap) ? THREE.DoubleSide : THREE.FrontSide;   // khoang sập: tôn gập chồng
      mats.body.userData.uni.uTk.value.w = mats.cabin.userData.uni.uTk.value.w = (cabCap || crushMax > 0.65) ? 1 : 0;
      for (const e of restObj) {
        { let p = e.o.parent; while (p && p !== car) p = p.parent; if (!p) continue; }   // phụ kiện đã văng khỏi xe
        const isRoof = e.o.userData.isRoof || e.o.parent?.userData?.isRoof || e.o.userData.acc === 'roofRail' || e.o.parent?.userData?.acc === 'roofRail';
        const isWell = e.o.userData.well || e.o.parent?.userData?.well;
        const isWiper = e.o.userData.acc === 'wiper' || e.o.parent?.userData?.acc === 'wiper';
        const isStep = e.o.userData.acc === 'step' || e.o.parent?.userData?.acc === 'step';
        const isBumper = e.o.userData.acc === 'bumper' || e.o.parent?.userData?.acc === 'bumper';
        // nẹp mảnh / máng kính / gioăng cột A / ray cửa lùa: bị nghiền lẫn vào xác (để riêng thì nổi lơ lửng trên đống tôn)
        const acc = e.o.userData.acc || e.o.parent?.userData?.acc;
        if ((acc === 'cowl' || acc === 'aPillar' || acc === 'rail' || acc === 'antenna' || acc === 'spoiler' || acc === 'taxiSign') && crushMax > 0.45 && lastPose) { e.hidden = true; e.o.visible = false; continue; }
        if ((isRoof && crushMax > 0.28) || (isWell && crushMax > 0.2) || (isWiper && crushMax > 0.25) || (isStep && crushMax > 0.35) || (isBumper && crushMax > 0.22)) { e.hidden = true; e.o.visible = false; continue; }
        if (e.geo) { crushGeo(e.geo, false); continue; }
        const o = e.o; o.position.copy(e.p); o.scale.copy(e.s); o.rotation.copy(e.r); o.visible = e.v;
        if (!e.b) e.b = SB.bind([e.p.x, e.p.y, e.p.z]);
        SB.dispOf(e.b, 0, dd);
        if (e.hidden || (o.userData.inner && (dd[3] > 0.4 || cabCap)) || (isWell && (dd[3] > 0.05 || crushMax > 0.2)) || (isRoof && (dd[3] > 0.15 || crushMax > 0.28)) || (isWiper && crushMax > 0.25) || (isStep && crushMax > 0.35) || (isBumper && (dd[3] > 0.12 || crushMax > 0.22))) { e.hidden = true; o.visible = false; continue; }   // nội thất / hốc bánh / phụ kiện nóc / gạt mưa / bậc bước nát kín
        o.position.set(e.p.x + dd[0], Math.max(0.24, e.p.y + dd[1]), e.p.z + dd[2]);
        const ratio = Math.max(0.28, 1 - dd[3] * 0.72);
        o.scale.y *= ratio;
        if (ratio < 0.7 && !isBumper && lastPose) { o.rotation.x += e.j[0] * 0.6; o.rotation.z += e.j[1] * 0.6; }
        if (capOn) {
          // phụ kiện (đèn, cản, gương...) nằm dưới vệt xích: hạ xuống / ép dẹt cho đỉnh không cao hơn đáy xích
          if (e.top === undefined) {
            const b = new THREE.Box3(), q = new THREE.Vector3();
            o.position.copy(e.p); o.scale.copy(e.s); o.rotation.copy(e.r); o.updateMatrixWorld(true);
            b.setFromObject(o); o.getWorldPosition(q);
            e.top = b.isEmpty() ? 0 : b.max.y - q.y; e.bot = b.isEmpty() ? 0 : b.min.y - q.y;
            o.position.set(e.p.x + dd[0], Math.max(0.24, e.p.y + dd[1]), e.p.z + dd[2]); o.scale.y *= ratio;
          }
          const cap = capNear(o.position.x, o.position.z), k = o.scale.y / e.s.y;
          if (o.position.y + e.top * k > cap) {
            const h = Math.max(0.01, (e.top - e.bot) * k), room = Math.max(0.1, cap - 0.24);
            if (h > room) { o.scale.y *= room / h; }
            const k2 = o.scale.y / e.s.y;
            o.position.y = Math.max(0.24 - e.bot * k2, cap - e.top * k2);
          }
        }
      }
      if (crushMax > 0.3) {
        feat.traverse(m => {
          if (m.isMesh && (m.geometry?.type === 'SphereGeometry' || m.geometry?.type === 'TorusGeometry' || m.geometry?.type === 'CylinderGeometry')) {
            m.visible = false;
          }
        });
      }
      // bánh theo điểm bánh của khung; lốp bị đè thì nổ bẹp (đáy xẹp phẳng, thành phình), không bóp cả bánh
      wheels.forEach((w, wi) => {
        if (w.free) return;
        // capOn: bánh nằm dưới đáy xích thấp hơn đỉnh lốp -> lốp bị nghiền theo độ sâu xích ép xuống
        const wp = SB.wheelPos(wi);
        let capW = 1e3;
        if (capOn) for (const [ox, oz] of [[0, 0], [0, S.r * 0.8], [0, -S.r * 0.8], [w.sx * S.tireW * 0.5, 0], [-w.sx * S.tireW * 0.5, 0]]) capW = Math.min(capW, capNear(wp[0] + ox, wp[2] + oz));
        // Kiểm tra độ lún của hốc bánh / vè xe: khi tai xe phía trên bánh bị đè sập, cụm treo và bánh xe cũng bị ép theo
        const archCap = capOn ? capNear(w.sx * (S.trackHalf - 0.6), w.z) : 1e3;
        const archSag = archCap < 900 ? Math.max(0, (2 * S.r + 0.6 - archCap) / (1.5 * S.r)) : 0;
        const hit = Math.max(SB.tireFlat[wi], capW < 2 * S.r ? Math.min(1, (2 * S.r - capW) / (1.4 * S.r)) : 0, archSag * 0.82);
        // Chỉ bánh bị xích đè trúng hoặc sập vòm bánh mới gãy gục / xẹp lốp
        const effHit = hit;
        const lvl = effHit > 0.75 ? 3 : effHit > 0.45 ? 2 : effHit > 0.2 ? 1 : 0;
        if (lvl !== (w.lvl || 0)) {
          w.lvl = lvl;
          const flat = [0, 0.3, 0.5, 0.62][lvl] * S.r, tire = w.g.children[0];
          tire.geometry.dispose(); tire.geometry = tireGeometry(S, flat); w.flat = flat;
          // bánh bị xích nghiền: mâm bám bùn đất, xước mờ; lốp phủ bụi xám
          if (!w.dirty) { w.dirty = true; w.g.traverse(m => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.55).lerp(new THREE.Color(0x4a4032), 0.35); m.material.roughness = Math.min(1, m.material.roughness + 0.35); } }); }
        }
        const [px, py, pz] = SB.wheelPos(wi), flat = w.flat || 0;
        if (effHit > 0.18) {
          // Thân bị cán đè: bánh xe bị bẻ gãy gục phẳng lì 90 độ sát đất và đẩy lệch ra ngoài mép thân xe
          const lay = sstep(0.18, 0.75, effHit);
          const ang = w.sx * (Math.PI / 2 * lay);
          const flatScale = Math.max(0.55, 1 - 0.45 * effHit);
          const restingY = Math.max(0.32, S.tireW * 0.5 * flatScale * lay + 0.12);
          const yPos = (w.y - flat) * (1 - lay) + restingY;
          const pushOut = w.sx * (1.2 + S.r * 0.65 * lay);
          w.g.position.set(px + pushOut, yPos, pz);
          w.g.rotation.set(0, w.sx * 0.12 * effHit, ang);
          // Ép dẹp bề dày bánh xe (trục X) để bánh xe dẹp phẳng đầm chắc trên mặt đường
          w.g.scale.set((1 - lay) + flatScale * lay, 1, 1);
        } else {
          // Bánh xe không bị đè: đứng thẳng, bám theo khung gầm
          w.g.position.set(px, py + w.y - S.r, pz);   // giữ độ hạ lốp xẹp sẵn + độ bù nghiêng thân
          w.g.rotation.set(0, 0, 0);
          w.g.scale.set(1, 1, 1);
        }
      });
      if (capOn) for (const h of loose) {
        // nắp capô / cốp bung nằm trên xác: vệt xích đè qua sau đó -> ép nằm bẹp dưới đáy xích
        if (!h.parent || !h.userData.wl) continue;
        const [w, l] = h.userData.wl; h.updateMatrix();
        let c = 1e3;
        for (const [u, v] of [[-w / 2, 0], [w / 2, 0], [-w / 2, l], [w / 2, l], [0, l / 2]]) { const q = new THREE.Vector3(u, 0, v).applyMatrix4(h.matrix); c = Math.min(c, capNear(q.x, q.z)); }
        if (c < h.position.y + 1.2) { h.rotation.x *= 0.2; h.rotation.z *= 0.2; h.position.y = Math.max(0.3, Math.min(h.position.y, c - 0.6)); }
      }
      if (cShadow) { const k = Math.min(1, crushMax); cShadow.material.opacity = 0.8 + 0.18 * k; cShadow.scale.set(1 + 0.25 * k, 1 + 0.05 * k, 1); }
      if (crushMax > 0.5 && lastPose && !debrisDone) { debrisDone = true; spawnDebris(); }   // chỉ khi bị xe tăng nghiền (đạn lẻ tự xử lý mảnh vỡ)
    };

    // --- BÁNH; xe bỏ lâu có lốp xẹp -> thân nghiêng về góc đó
    // opts.flats [4]: lốp xẹp theo thứ tự bánh của props.js (0 trái trước, 1 phải trước, 2 trái sau, 3 phải sau; trái = -x);
    // opts.noWheel: bánh bị tháo mất — trục kê gạch, hoặc rơi hẳn xuống đĩa phanh (bánh nằm lăn lóc bên cạnh);
    // xe cháy: lốp cháy rụi, thân hạ xuống vành sắt
    let roll = 0, pitch = 0, sink = 0;
    const burntDrop = opts.burnt ? S.r * 0.36 : 0;
    // kiểu mâm theo dòng xe: van / taxi / xe phổ thông hay mâm thép (có hoặc không ốp), SUV / bán tải mâm đúc
    const rimP = { van: [0.55, 0.4], taxi: [0.1, 0.75], hatch: [0.12, 0.45], sedan: [0.06, 0.28], pickup: [0.18, 0], suv: [0.06, 0] }[kind] || [0, 0];
    let rimStyle = 'alloy';
    { const p = wr(); if (p < rimP[0] + (cond === 'rusted' ? 0.15 : 0)) rimStyle = 'steel'; else if (p < rimP[0] + rimP[1]) rimStyle = opts.burnt ? 'steel' : 'cap'; }
    for (const az of [S.axleF, S.axleR]) for (const sx of [1, -1]) {
      const w4 = (az === S.axleR ? 2 : 0) + (sx > 0 ? 1 : 0), rFlat = age > 0.28 && rnd() < (age - 0.28) * 0.45;
      const gone = opts.noWheel === w4 && !S.isTruck, onBlocks = gone && wr() < 0.5;
      let flat = (opts.flats ? !!opts.flats[w4] : rFlat) ? S.r * (0.26 + 0.08 * wr()) : 0;
      const D = az === S.axleR && S.dualR, SW = D ? Object.assign({}, S, { tireW: D.tireW }) : S, wx = D ? D.x : S.trackHalf;
      const rs = rimStyle === 'cap' && cond !== 'clean' && wr() < 0.2 ? 'steel' : rimStyle;   // xe cũ rơi mất ốp mâm
      const wg = wheelGroup(SW, mats, sx, burntDrop || gone ? 0 : flat, rs);
      if (burntDrop) { wg.children[0].visible = false; flat = burntDrop; }
      if (gone) {
        // còn trơ đĩa phanh, moay-ơ, cùm phanh
        wg.children.forEach(m => { if (!m.userData.brake) m.visible = false; });
        if (onBlocks) {
          flat = 0;
          const blk = plain(new THREE.Color(0x8d8a82).lerp(new THREE.Color(0x5e5a52), wr()), 0.95, 0);
          part(roundBox(1.5, 1.5, 3.0, 0.08), blk, [sx * (wx - 1.45), 0.75, az + (wr() - 0.5) * 0.6], [0, (wr() - 0.5) * 0.3, 0], g);   // gạch block kê trục
          part(roundBox(1.6, 0.32, 2.6, 0.04), plain(0x5c4a36, 0.95, 0), [sx * (wx - 1.45), 1.66, az], [0, (wr() - 0.5) * 0.3, 0], g);   // tấm ván kê
        } else {
          flat = S.r - S.r * 0.62 * 0.78 - 0.05;
          const lw = wheelGroup(SW, mats, sx, 0, rs); lw.rotation.set(0, wr() * 6.3, Math.PI / 2 * (wr() < 0.5 ? 1 : -1));
          lw.position.set(sx * (wx + 5 + 2 * wr()), SW.tireW * 0.55, az + (wr() - 0.5) * 8); g.add(lw);
        }
      }
      wg.position.set(sx * wx, S.r - flat, az);
      car.add(wg); wheels.push({ g: wg, x: sx * wx, y: S.r - flat, z: az, sx, base: 0 });
      if (D) {   // inner twin: same hub, never deflated (the outer tyre carries the sag)
        const xi = wx - D.tireW - D.gap, wi = wheelGroup(SW, mats, sx, 0);
        wi.position.set(sx * xi, S.r - flat, az);
        car.add(wi); wheels.push({ g: wi, x: sx * xi, y: S.r - flat, z: az, sx, base: 0 });
      }
      if (flat) { roll += -sx * flat / (4 * S.trackHalf); pitch += flat / (4 * (az - (S.axleF + S.axleR) / 2)); sink += flat / 4; }
    }
    // bánh là con của thân: thân nghiêng / hạ kéo bánh xuống lần nữa -> bù ngược để đáy lốp vẫn chạm mặt đất (lift: độ bù)
    if (roll || pitch || sink) {
      const M = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, 0, roll)), q = new THREE.Vector3();
      for (const w of wheels) { w.lift = -(q.set(w.x, 0, w.z).applyMatrix4(M).y - sink); w.y += w.lift; w.g.position.y = w.y; }
    }
    // --- XÁC XE BỊ PHÁ: vũng dầu máy / nước làm mát / xăng loang dưới đất, mảnh tôn / nhựa / kính / đèn văng quanh
    const flows = [], loose = [];
    // tấm tôn rời: mặt sơn + mặt trong tôn lót sẫm (có độ dày), vồng nhẹ, mép gập xuống, gốc toạ độ ở mép bản lề (z = 0)
    const innerMat = plain(0x2a2826, 0.8, 0.4, { side: THREE.DoubleSide });
    const sheet = (w, l, col, sag) => {
      const grp = new THREE.Group();
      const shape = (off) => {
        const geo = new THREE.PlaneGeometry(w, l, 12, 10); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, l / 2);
        const A = geo.attributes.position;
        for (let i = 0; i < A.count; i++) {
          const x = A.getX(i), z = A.getZ(i), ex = Math.abs(x) / (w / 2), ez = z / l;
          // vồng như mặt capô, mép quanh gập xuống ~4 cm, nếp nhăn do bị ép, mép xa bản lề oằn võng
          let y = 0.25 * (1 - ex * ex) - 0.45 * Math.pow(Math.max(0, ex - 0.85) / 0.15, 2) + 0.9 * (vnoise3(x * 0.45, 2, z * 0.45 + ph) - 0.5) + 0.35 * (0.5 - Math.abs(vnoise3(x * 1.3 + 4, 3, z * 1.2) - 0.5)) - sag * ez * ez;   // tôn rời cũng bị xích miết nhàu
          A.setY(i, y + off);
        }
        geo.computeVertexNormals(); return geo;
      };
      const top = new THREE.Mesh(shape(0), col), bot = new THREE.Mesh(shape(-0.12), innerMat);
      top.castShadow = true; top.receiveShadow = bot.receiveShadow = true;
      grp.add(top, bot); grp.userData.wl = [w, l]; return grp;
    };
    const glassBits0 = plain(0x9fb8b2, 0.04, 0.5, { envMapIntensity: 2.0, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const spawnDebris = () => {
      events.push('burst');
      // Thảm kính vụn: chỉ rải vừa phải ở mặt đất khi khoang kính thực sự bị chèn vỡ
      if (cabinCapped()) {
        for (let i = 0; i < 4; i++) {
          const gm = new THREE.Mesh(new THREE.PlaneGeometry(5 + rnd() * 3, 5 + rnd() * 3), new THREE.MeshStandardMaterial({ map: glassCrumbTexture(rnd), transparent: true, opacity: 0.65, roughness: 0.08, metalness: 0.35, envMap: env, envMapIntensity: 1.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          gm.rotation.set(-Math.PI / 2, 0, rnd() * 6.3); gm.position.set((i % 2 ? 1 : -1) * (8.5 + rnd() * 2), 0.07, (i >> 1) * 8 - 4 + (rnd() - 0.5) * 4); gm.renderOrder = -1; g.add(gm);
        }
      }
      // gương, biển số, phụ kiện nằm trong vùng bị đè: rơi xuống nằm phẳng bẹp trên mặt đường
      car.children.slice().forEach(o => {
        if (!o.userData.acc || o.userData.structural) return;
        // Giá nóc, gạt mưa và bậc bước chân: khi xe bị đè nặng, ẩn hoàn toàn tránh trôi nổi
        if ((o.userData.acc === 'roofRail' || o.userData.acc === 'wiper') && crushMax > 0.25) { o.visible = false; return; }
        if (o.userData.acc === 'step' && crushMax > 0.3) { o.visible = false; return; }
        const p = o.position, [cE] = capAt(p.x, p.z);
        if (cE > 6.5 && rnd() < 0.6) return;
        g.add(o);
        const side = p.x === 0 ? (rnd() < 0.5 ? 1 : -1) : Math.sign(p.x);
        const groundY = o.userData.acc === 'plate' ? 0.05 : 0.08;
        o.position.set(side * (8.5 + rnd() * 4), groundY, p.z + (rnd() - 0.5) * 6);
        const tiltX = (rnd() - 0.5) * 0.14, tiltZ = (rnd() - 0.5) * 0.14, rotY = rnd() * Math.PI * 2;
        if (o.userData.acc === 'plate') {
          // Biển số nằm phẳng bẹp sát mặt đường, không cắm xiên
          o.rotation.set(-Math.PI / 2 + tiltX, 0, rotY);
        } else if (o.userData.acc === 'spoiler') {
          // Cánh gió nằm phẳng dẹp trên mặt đất
          o.rotation.set(-Math.PI / 2 + tiltX, 0, rotY);
          o.children.forEach(ch => { ch.position.set(0, 0, 0); });
        } else {
          o.rotation.set(tiltX, rotY, tiltZ);
        }
        o.scale.set(1, Math.min(0.6, o.scale.y), 1);
      });
      { const sc = new THREE.Mesh(new THREE.PlaneGeometry(30, 44), new THREE.MeshStandardMaterial({ map: scrapeTexture(rnd), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
        sc.rotation.x = -Math.PI / 2; sc.position.y = 0.06; sc.renderOrder = -1; g.add(sc); }
      const pool = fluidDecal(S, rnd, 1); pool.scale.set(0.15, 0.15, 1); g.add(pool); flows.push({ m: pool, t: 0 });
      const paintD = new THREE.MeshStandardMaterial({ color: mats.paint.color.clone().multiplyScalar(0.72).lerp(new THREE.Color(0x5a5046), 0.25), roughness: 0.78, metalness: 0.25, envMap: env, envMapIntensity: 0.5, side: THREE.DoubleSide });
      // nắp capô bung chốt: bản lề phía kính chắn gió còn giữ, mép trước vênh lên
      const [cF] = capAt(0, 14), [cR] = capAt(0, -15);
      if (cF > 5.5 && cF < top(13) - 1.2) { const zh = S.hood[0] + 0.3, h = sheet(12.2, 8.2, paintD, 0.4); h.position.set(0, capAt(0, zh)[0] - 0.15, zh); h.rotation.set(-(0.14 + rnd() * 0.12), (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.1); car.add(h); loose.push(h); }
      if (cR > 5.5 && cR < top(-15) - 1.2) { const zh = S.trunk[0] - 0.3, h = sheet(11.2, 5.4, paintD, 0.3); h.position.set(0, capAt(0, zh)[0] - 0.15, zh); h.rotation.set(0, Math.PI, 0); h.rotateX(-(0.12 + rnd() * 0.15)); car.add(h); loose.push(h); }
      // một cửa bung khỏi khung, nằm bẹp phẳng cạnh xác xe
      {
        const sx = rnd() < 0.5 ? 1 : -1, d = new THREE.Group(), lower = sheet(8.2, 4.6, paintD, 0.4);
        lower.position.set(0, 0.02, 0); d.add(lower);
        // khung kính cửa: 3 thanh cong vênh (trên, trước, sau), nằm bẹp theo cánh cửa
        const fr = (pts) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 16, 0.08, 5, false), mats.black); m.castShadow = true; d.add(m); };
        fr([[-4.1, 0.08, 0.2], [-3.8, 0.12, 2.2], [-3.2, 0.10, 3.8]]);
        fr([[-3.2, 0.10, 3.8], [0, 0.14, 4.0], [3.6, 0.10, 3.6]]);
        fr([[3.6, 0.10, 3.6], [3.9, 0.12, 1.8], [4.1, 0.08, 0.2]]);
        for (let q = 0; q < 3; q++) { const m = new THREE.Mesh(shardGeometry(0.5 + rnd() * 0.4, rnd), glassBits0); m.position.set((rnd() - 0.5) * 5, 0.08, 0.5 + rnd() * 0.5); m.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.1, 0, rnd() * 6.3); d.add(m); }
        d.rotation.set((rnd() - 0.5) * 0.08, rnd() * 6.28, (rnd() - 0.5) * 0.08); d.position.set(sx * (11 + rnd() * 3), 0.06, (rnd() - 0.5) * 8); g.add(d);
      }
      // bánh nằm dưới xích bị tróc khỏi trục, văng nằm bẹp phẳng ngoài vệt xích
      const wi = [0, 1, 2, 3].sort((a, b) => SB.tireFlat[b] - SB.tireFlat[a])[0], w = wheels[wi];
      if (w && SB.tireFlat[wi] > 0.65) {
        w.free = true;
        g.add(w.g);
        const faceUp = rnd() < 0.5;
        const rotZ = faceUp ? Math.PI / 2 : -Math.PI / 2;
        const tilt = (rnd() - 0.5) * 0.12;
        w.g.rotation.set(tilt, rnd() * Math.PI * 2, rotZ + (rnd() - 0.5) * 0.08);
        const restY = Math.max(0.06, S.tireW * 0.28);
        w.g.position.set(w.sx * (11.5 + rnd() * 3.5), restY, w.z + (rnd() - 0.5) * 5);
        w.g.scale.set(0.35, 0.95, 0.95);
        w.g.traverse(m => {
          if (m.isMesh && m.material) {
            m.material = m.material.clone();
            m.material.color.multiplyScalar(0.5).lerp(new THREE.Color(0x3a3024), 0.45);
            m.material.roughness = Math.min(1, m.material.roughness + 0.4);
          }
        });
      }
      const glassBits = plain(0x9fb8b2, 0.04, 0.5, { envMapIntensity: 2.0, transparent: true, opacity: 0.85 });
      const L = S.plan[S.plan.length - 1][0] - S.plan[0][0];
      for (const [mat, n, s0, s1] of [[mats.paint, 12, 0.5, 1.7], [mats.black, 9, 0.4, 1.3], [M.tailShard, 3, 0.25, 0.6], [M.headLens, 3, 0.25, 0.6], [glassBits, 160, 0.08, 0.38]]) {
        for (let i = 0; i < n; i++) {
          // văng ra quanh thân, nhiều nhất về phía bị đẩy bè (hướng ngang của vệt xích)
          let x = (rnd() - 0.5) * 24, z = (rnd() - 0.5) * (L + 8);
          const px = samp(gPx, x * 0.5, z, 0), pz = samp(gPz, x * 0.5, z, 0); x += px * (4 + rnd() * 8); z += pz * (4 + rnd() * 8);
          const sz = s0 + rnd() * (s1 - s0), m = part(shardGeometry(sz, rnd), mat, [x, 0.04 + rnd() * 0.06, z], [(rnd() - 0.5) * 0.4, rnd() * 6.3, (rnd() - 0.5) * 0.4], g);
          m.material = m.material.clone(); m.material.side = THREE.DoubleSide; m.userData.debris = true;
          m.castShadow = sz > 0.4;
        }
      }
      part(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 18), mats.rim, [(rnd() - 0.5) * 30, 0.06, (rnd() - 0.5) * 40], [0, 0, 0], g);   // ốp tâm mâm văng ra
    };
    // bênh nghiêng tắt dần khi tôn đã sập (xe nằm bẹp); dao động lò xo nhẹ
    const baseRot = { r: roll, p: pitch, y: -sink };
    // ---- TRÚNG ĐẠN / CHÁY / NỔ BÌNH XĂNG ----
    // Hạt lửa / khói tự quản (trang thử không có hệ hạt của game; trong game thay bằng fx.fire / fx.smoke)
    // loại hạt: 0 lửa, 1 khói đen dầu / cao su, 2 tia lửa, 3 hơi nước két làm mát, 4 khói thuốc nổ, 7 bụi (màu theo tham số),
    // 5 mảnh vụn rắn (sơn, kính, cao su — màu theo tham số), 6 chớp nổ
    const PFX = (() => {
      const MAXN = 1600, pos = new Float32Array(MAXN * 3), col = new Float32Array(MAXN * 3), base = new Float32Array(MAXN * 3), siz = new Float32Array(MAXN), rot = new Float32Array(MAXN);
      const life = new Float32Array(MAXN), age0 = new Float32Array(MAXN), vel = new Float32Array(MAXN * 3), kind = new Uint8Array(MAXN), grow = new Float32Array(MAXN), spin = new Float32Array(MAXN);
      const fireA = new Float32Array(MAXN), smokeA = new Float32Array(MAXN);
      const VS = 'attribute float size; attribute float alpha; attribute float rot; attribute vec3 color; varying float vA; varying float vR; varying vec3 vC;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha; vR = rot; vC = color; gl_PointSize = alpha > 0.0 ? size * 900.0 / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }';
      // búi khói: viền nhiễu (fbm xoay theo hạt) mép mềm, mặt trên sáng hơn mặt dưới; lửa: lõi trắng vàng, cộng sáng nhưng vẫn che một phần
      // để còn thấy trên nền trời sáng; mảnh vụn (alpha > 1.5): mảnh đặc mép răng cưa
      const FS = 'uniform float uFire; varying float vA; varying float vR; varying vec3 vC;\n' +
        'float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }\n' +
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;\n' +
        '  float c = cos(vR), s = sin(vR); vec2 q = vec2(c * d.x - s * d.y, s * d.x + c * d.y), o = vec2(vR * 1.7, vR * 2.3);\n' +
        '  float fb = vn(q * 3.0 + o) * 0.5 + vn(q * 7.0 - o) * 0.3 + vn(q * 15.0 + o.yx) * 0.2;\n' +
        '  if (uFire < 0.5) {\n' +
        '    if (vA > 1.5) { if (r > 0.85 || fb < 0.4) discard; gl_FragColor = vec4(vC * (0.6 + 0.8 * fb), 1.0); return; }\n' +
        '    float m = smoothstep(0.95, 0.4, r + (fb - 0.5) * 1.2) * smoothstep(1.0, 0.7, r);\n' +
        '    gl_FragColor = vec4(vC * (0.78 - 0.6 * d.y) * (0.7 + 0.6 * fb), m * vA);\n' +
        '  } else {\n' +
        '    float m = smoothstep(1.0, 0.0, r + (fb - 0.5) * 0.7) * smoothstep(1.0, 0.6, r), a = m * m * vA;\n' +
        '    gl_FragColor = vec4(mix(vC, vec3(1.0, 0.96, 0.85), m * m * 0.7) * a * 1.4, a * 0.6);\n' +
        '  } }';
      const mk = (fireLayer, A) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(siz, 1)); geo.setAttribute('rot', new THREE.BufferAttribute(rot, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(A, 1));
        const mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, uniforms: { uFire: { value: fireLayer ? 1 : 0 } }, vertexShader: VS, fragmentShader: FS,
          blending: fireLayer ? THREE.CustomBlending : THREE.NormalBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
        });
        const p = new THREE.Points(geo, mat); p.frustumCulled = false; p.renderOrder = fireLayer ? 3 : 2; return p;
      };
      // 2 lớp: lửa (cộng sáng) và khói (che phủ) dùng chung mảng, lớp không thuộc thì alpha = 0 ở đúng lớp đó
      const fireP = mk(true, fireA), smokeP = mk(false, smokeA);
      let n = 0;
      const add = (k, x, y, z, vx, vy, vz, s, lf, gr, c) => {
        const i = n++ % MAXN, j = 3 * i;
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
        siz[i] = s; life[i] = lf; age0[i] = 0; kind[i] = k; grow[i] = gr;
        rot[i] = Math.random() * 6.28; spin[i] = (Math.random() - 0.5) * 0.8;
        const b = c || (k === 3 ? [0.88, 0.9, 0.92] : [0.4, 0.38, 0.35]);
        base[j] = col[j] = b[0]; base[j + 1] = col[j + 1] = b[1]; base[j + 2] = col[j + 2] = b[2];
      };
      const update = dt => {
        for (let i = 0; i < MAXN; i++) {
          if (age0[i] >= life[i]) { fireA[i] = smokeA[i] = 0; continue; }
          age0[i] += dt;
          const t = Math.min(1, age0[i] / life[i]), k = kind[i], j = 3 * i;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          siz[i] += grow[i] * dt * (1 - 0.6 * t);   // nở nhanh lúc đầu rồi chậm dần
          rot[i] += spin[i] * dt;
          fireA[i] = smokeA[i] = 0;
          if (k === 0) {              // lửa: vàng trắng -> cam -> đỏ sẫm, tắt nhanh
            vel[j] *= 1 - dt * 1.5; vel[j + 2] *= 1 - dt * 1.5; vel[j + 1] += 14 * dt;
            col[j] = 1; col[j + 1] = 0.85 - 0.6 * t; col[j + 2] = 0.45 - 0.42 * t;
            fireA[i] = (1 - t) * Math.min(1, t * 12) * 0.9;
          } else if (k === 2) {       // tia lửa / tàn: bay vọt, nguội dần, rơi theo trọng lực, nảy trên mặt đường
            vel[j + 1] -= 60 * dt;
            col[j] = 1; col[j + 1] = 0.8 - 0.35 * t; col[j + 2] = 0.4 - 0.35 * t; fireA[i] = 1 - t;
            if (pos[j + 1] < 0.1) { pos[j + 1] = 0.1; vel[j + 1] *= -0.3; vel[j] *= 0.6; vel[j + 2] *= 0.6; }
          } else if (k === 6) {       // chớp nổ: loé rồi tắt trong vài phần trăm giây
            col[j] = 1; col[j + 1] = 0.8; col[j + 2] = 0.5; fireA[i] = (1 - t) * (1 - t);
          } else if (k === 5) {       // mảnh vụn: văng theo quỹ đạo, chạm đất nảy nhẹ rồi trượt dừng
            vel[j + 1] -= 60 * dt; vel[j] *= 1 - dt * 0.6; vel[j + 2] *= 1 - dt * 0.6;
            if (pos[j + 1] < 0.12) { pos[j + 1] = 0.12; vel[j + 1] *= -0.25; vel[j] *= 0.5; vel[j + 2] *= 0.5; }
            smokeA[i] = 2;
          } else {                    // khói: bốc lên, gió nhẹ đẩy dạt, loãng dần
            // khói nổ / dầu nóng bốc mạnh thành cột; bụi đường nặng, sà thấp, bị hãm nhanh
            const drag = k === 7 ? 3 : k === 4 ? 1.8 : 1.2;
            vel[j] *= 1 - dt * drag; vel[j + 2] *= 1 - dt * drag;
            if (k === 7) vel[j + 1] *= 1 - dt * 2.5;
            vel[j + 1] += (k === 1 ? 4 : k === 3 ? 7 : k === 4 ? 3.5 : 0.5) * dt; vel[j] += 1.6 * dt;
            if (pos[j + 1] < siz[i] * 0.25) { pos[j + 1] = siz[i] * 0.25; vel[j + 1] = Math.max(0, vel[j + 1]); }
            if (k === 1) {            // khói đen dầu / cao su cháy, nhạt dần thành xám
              const c = 0.07 + 0.28 * t; col[j] = c; col[j + 1] = c * 0.97; col[j + 2] = c * 0.94;
              smokeA[i] = Math.pow(1 - t, 1.3) * Math.min(1, t * 5) * 0.75;
            } else if (k === 3) {     // hơi nước: trắng, tan nhanh
              smokeA[i] = (1 - t) * (1 - t) * Math.min(1, t * 8) * 0.5;
            } else if (k === 4) {     // khói thuốc nổ: xám than đặc lúc đầu, bốc lên loãng dần thành xám nhạt
              for (let q = 0; q < 3; q++) col[j + q] = base[j + q] + (0.5 - base[j + q]) * t;
              smokeA[i] = Math.pow(1 - t, 1.4) * Math.min(1, t * 12) * 0.9;
            } else {                  // bụi đường / bụi sơn: loé lên rồi lắng nhanh, không đọng thành màng
              for (let q = 0; q < 3; q++) col[j + q] = base[j + q];
              smokeA[i] = Math.pow(1 - t, 2.2) * Math.min(1, t * 14) * 0.55;
            }
          }
        }
        for (const p of [fireP, smokeP]) for (const k of ['position', 'color', 'size', 'rot', 'alpha']) p.geometry.attributes[k].needsUpdate = true;
      };
      return { fireP, smokeP, add, update };
    })();
    let pfxOn = false;
    const pfx = () => { if (!pfxOn) { pfxOn = true; g.add(PFX.smokeP, PFX.fireP); } return PFX; };
    const fire = { on: false, t: 0, fuel: W.fuel, boom: -1, char: opts.burnt ? 1 : 0, light: null, ign: [0, 0, 0] };
    // vết đạn trên thân: lỗ tối viền tôn trần sáng (đạn nhỏ), lỗ xé toạc mép cháy sém (đạn lớn)
    const HOLE_TEX = [];
    const holeMat = (exit) => {
      const key = exit ? 1 : 0;
      if (!HOLE_TEX[key]) HOLE_TEX[key] = [0, 1, 2, 3].map(() => {
        const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'), cx = 48 + (rnd() - 0.5) * 6, cy = 48 + (rnd() - 0.5) * 6;
        // quầng sơn tróc / xước quanh lỗ (lệch về hướng đạn đến)
        for (let i = 0; i < 22; i++) { const a = rnd() * 6.28, r = 8 + rnd() * 20; x.fillStyle = 'rgba(' + (120 + rnd() * 60 | 0) + ',' + (110 + rnd() * 50 | 0) + ',' + (95 + rnd() * 40 | 0) + ',' + (0.12 + rnd() * 0.25) + ')'; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, 2 + rnd() * 5, 1 + rnd() * 3, a, 0, 7); x.fill(); }
        // mép tôn xé: đa giác lởm chởm, lỗ ra phía sau xé loe tua rua to hơn
        const n = 16 + (rnd() * 8 | 0), R0 = (exit ? 15 : 10) * (0.8 + rnd() * 0.4);
        x.fillStyle = 'rgba(105,102,96,0.9)'; x.beginPath();
        for (let i = 0; i <= n; i++) { const a = i / n * 6.28, r = R0 * (exit ? 0.6 + rnd() * 0.9 : 0.85 + rnd() * 0.35) + 2.5; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill();
        x.fillStyle = 'rgba(6,5,4,1)'; x.beginPath();
        for (let i = 0; i <= n; i++) { const a = i / n * 6.28, r = R0 * (exit ? 0.5 + rnd() * 0.8 : 0.75 + rnd() * 0.3); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill();
        // muội / gỉ chảy xuống dưới lỗ
        const gr = x.createLinearGradient(cx, cy, cx, cy + 34); gr.addColorStop(0, 'rgba(70,40,20,0.35)'); gr.addColorStop(1, 'rgba(70,40,20,0)'); x.fillStyle = gr; x.fillRect(cx - 4, cy + 6, 8, 30);
        return new THREE.CanvasTexture(c);
      });
      return new THREE.MeshBasicMaterial({ map: HOLE_TEX[key][rnd() * 4 | 0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0xdddddd, side: THREE.DoubleSide });
    };
    // vết cháy sém đạn nổ: chịu sáng như thân xe (không phải đĩa đen tô phẳng)
    const scorchMat = () => new THREE.MeshStandardMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide });
    const rcH = new THREE.Raycaster();
    const surfaceHit = (o, d) => {
      // o, d trong hệ xe con (g) -> đổi sang hệ thế giới để raycast (xe đặt ở vị trí / hướng bất kỳ)
      g.updateMatrixWorld(true);
      rcH.set(new THREE.Vector3(...o).applyMatrix4(g.matrixWorld), new THREE.Vector3(...d).transformDirection(g.matrixWorld));
      const targets=[];
      car.traverse(o=>{
        if(!o.isMesh||!o.visible||o.userData.inner||o.userData.well||o===cabIn)return;
        let p=o;while(p&&p!==car){if(!p.visible)return;p=p.parent;}
        targets.push(o);
      });
      const h = rcH.intersectObjects(targets, false)[0];
      if (!h) return null;
      const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().copy(g.matrixWorld).invert().multiply(h.object.matrixWorld))).normalize();
      // no: pháp tuyến quay về phía đạn đến (mặt DoubleSide có thể ngược chiều tam giác)
      return { p: h.point.clone().applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), n, no: n.dot(new THREE.Vector3(...d)) > 0 ? n.clone().negate() : n.clone(), obj: h.object };
    };
    // dán vết lên bề mặt cong: cắt các tam giác của mesh trúng bằng hộp chiếu quanh điểm trúng (như DecalGeometry), UV theo mặt tiếp tuyến;
    // không có mesh (mặt đất) thì dán đĩa phẳng
    const _dm = new THREE.Matrix4(), _dn = new THREE.Matrix3(), _dv = new THREE.Vector3(), _dw = new THREE.Vector3();
    const clipAx = (poly, ax, sg) => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], da = sg * a[ax] - 1, db = sg * b[ax] - 1;
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push(a.map((v, q) => v + (b[q] - v) * t)); }
      }
      return out;
    };
    // các mesh thân xe nằm trong bán kính r quanh điểm p (hệ g): vết cháy sém đạn nổ loang sang cả tấm tôn / lốp / cản kề bên
    const _bs = new THREE.Sphere();
    const meshesNear = (p, r) => {
      const out = [], pw = p.clone().applyMatrix4(g.matrixWorld);
      car.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible || o.userData.inner || o.userData.well || o === cabIn || !o.geometry.attributes.position) return;
        for (let q = o; q && q !== car; q = q.parent) if (!q.visible || wheels.some(w => w.g === q)) return;   // bánh xẹp / văng đổi hình -> vết sẽ lơ lửng
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        _bs.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_bs.distanceToPoint(pw) < r) out.push(o);
      });
      return out;
    };
    
    // Vết thủng 3D xé toạc thân xe: khoét sâu vào trong kim loại với các cánh tôn rách lởm chởm
    const makeHoleMesh = (h, size, dir, isExit = false) => {
      const cavityGrp = new THREE.Group();
      const depth = Math.max(0.45, size * 0.75);
      const coneGeo = new THREE.ConeGeometry(size * 0.68, depth, 14, 1, true);
      coneGeo.rotateX(-Math.PI / 2);
      coneGeo.translate(0, 0, depth * 0.5);
      const innerWallMat = new THREE.MeshStandardMaterial({
        color: 0x080808, roughness: 0.96, metalness: 0.2, side: THREE.DoubleSide
      });
      const cone = new THREE.Mesh(coneGeo, innerWallMat);
      cavityGrp.add(cone);

      // Cánh tôn rách lởm chởm quanh miệng lỗ
      const petalMat = new THREE.MeshStandardMaterial({
        color: 0x55585c, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide
      });
      const numPetals = 8 + (rnd() * 4 | 0);
      const petalGeo = new THREE.BufferGeometry();
      const pPos = [], pNorm = [];
      const inward = isExit ? -1 : 1;
      for (let i = 0; i < numPetals; i++) {
        const a1 = (i / numPetals) * Math.PI * 2;
        const a2 = ((i + 1) / numPetals) * Math.PI * 2;
        const r1 = size * (0.8 + rnd() * 0.35);
        const r2 = size * (0.8 + rnd() * 0.35);
        const tipA = (a1 + a2) * 0.5;
        const tipR = size * (0.35 + rnd() * 0.3);
        const tipZ = inward * (depth * (0.35 + rnd() * 0.45));
        
        const x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1, z1 = 0.02;
        const x2 = Math.cos(a2) * r2, y2 = Math.sin(a2) * r2, z2 = 0.02;
        const xt = Math.cos(tipA) * tipR, yt = Math.sin(tipA) * tipR, zt = tipZ;

        pPos.push(x1, y1, z1,  x2, y2, z2,  xt, yt, zt);
        for (let k = 0; k < 3; k++) pNorm.push(0, 0, -inward);
      }
      petalGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
      petalGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pNorm, 3));
      cavityGrp.add(new THREE.Mesh(petalGeo, petalMat));

      cavityGrp.position.copy(h.p);
      const fwd = dir.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
      cavityGrp.quaternion.copy(q);
      cavityGrp.renderOrder = 3;
      g.add(cavityGrp);

      // Thụt các đỉnh của mesh vỏ xe lân cận điểm trúng vào sâu bên trong thân xe
      dentGeometryNear(h.p, dir, size * 2.2, depth * 0.9);
      return cavityGrp;
    };

    const dentGeometryNear = (p, dir, radius, maxDent) => {
      const dentNorm = dir.clone().normalize();
      const checkGeo = (geo) => {
        if (!geo || !geo.attributes || !geo.attributes.position) return;
        const pos = geo.attributes.position;
        let changed = false;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
          const dist = Math.hypot(vx - p.x, vy - p.y, vz - p.z);
          if (dist < radius) {
            const falloff = Math.cos((dist / radius) * Math.PI * 0.5);
            const amt = maxDent * falloff * falloff;
            pos.setXYZ(i, vx + dentNorm.x * amt, vy + dentNorm.y * amt, vz + dentNorm.z * amt);
            changed = true;
          }
        }
        if (changed) {
          pos.needsUpdate = true;
          geo.computeVertexNormals();
        }
      };
      checkGeo(bodyGeo);
      checkGeo(cabGeo);
    };

    const decal = (h, size, mat, objs) => {
      const no = h.no || h.n, ang = rnd() * 6.3;
      const t0 = new THREE.Vector3().crossVectors(Math.abs(no.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), no).normalize(), b0 = new THREE.Vector3().crossVectors(no, t0);
      const t = t0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b0, Math.sin(ang)), b = new THREE.Vector3().crossVectors(no, t);
      const depth = Math.max(0.8, size * 0.5);
      const vp = [], vn = [], vu = [];
      g.updateMatrixWorld(true);
      for (const obj of objs || (h.obj ? [h.obj] : [])) {
        const P = obj.geometry && obj.geometry.attributes.position;
        if (!P) continue;
        // mesh trúng: chỉ lấy mặt cùng chiều tam giác với mặt trúng; mesh kề bên (chiều tam giác không biết trước): mọi mặt quay về phía nổ
        const sg = obj === h.obj ? Math.sign(h.n.dot(no)) || 1 : 0;
        _dm.copy(g.matrixWorld).invert().multiply(obj.matrixWorld); _dn.getNormalMatrix(_dm);
        const geo = obj.geometry, N = geo.attributes.normal, I = geo.index, cnt = I ? I.count : P.count;
        const vtx = k => {
          const i = I ? I.getX(k) : k;
          _dv.fromBufferAttribute(P, i).applyMatrix4(_dm).sub(h.p);
          if (N) _dw.fromBufferAttribute(N, i).applyMatrix3(_dn).normalize(); else _dw.copy(h.n);
          return [_dv.dot(t) / size, _dv.dot(b) / size, _dv.dot(no) / depth, _dw.x, _dw.y, _dw.z];
        };
        for (let k = 0; k + 2 < cnt; k += 3) {
          let poly = [vtx(k), vtx(k + 1), vtx(k + 2)];
          if ([0, 1, 2].some(ax => poly.every(v => v[ax] > 1) || poly.every(v => v[ax] < -1))) continue;
          // chỉ lấy mặt cùng hướng mặt trúng (bỏ tôn phía bên kia, mặt trong)
          const [p0, p1, p2] = poly, ex = [(p1[0] - p0[0]) * size, (p1[1] - p0[1]) * size, (p1[2] - p0[2]) * depth], ey = [(p2[0] - p0[0]) * size, (p2[1] - p0[1]) * size, (p2[2] - p0[2]) * depth];
          const cx = ex[1] * ey[2] - ex[2] * ey[1], cy = ex[2] * ey[0] - ex[0] * ey[2], cz = ex[0] * ey[1] - ex[1] * ey[0];
          if ((sg ? sg * cz : Math.abs(cz)) < 0.3 * Math.hypot(cx, cy, cz)) continue;
          for (let ax = 0; ax < 3 && poly.length; ax++) { poly = clipAx(poly, ax, 1); poly = clipAx(poly, ax, -1); }
          for (let q = 1; q + 1 < poly.length; q++) for (const v of [poly[0], poly[q], poly[q + 1]]) {
            const u = v[0] * size, w = v[1] * size, z = v[2] * depth + 0.03;
            vp.push(h.p.x + t.x * u + b.x * w + no.x * z, h.p.y + t.y * u + b.y * w + no.y * z, h.p.z + t.z * u + b.z * w + no.z * z);
            vn.push(v[3], v[4], v[5]); vu.push(v[0] * 0.5 + 0.5, v[1] * 0.5 + 0.5);
          }
        }
      }
      let m;
      if (vp.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
        m = new THREE.Mesh(geo, mat);
      } else {
        m = new THREE.Mesh(new THREE.CircleGeometry(size, 16), mat);
        m.position.copy(h.p).addScaledVector(no, 0.04); m.lookAt(m.position.clone().add(no)); m.rotateZ(ang);
      }
      m.renderOrder = 2; g.add(m); return m;
    };
    // vỡ kính: không truyền ô -> mọi ô (nổ lớn / cháy); có toạ độ trúng -> chỉ ô đó (kính hông cường lực vỡ vụn rơi, kính chắn gió rạn)
    const shatterGlass = (p) => {
      const u = mats.cabin.userData.uni;
      if (!p) { u.uE.value.set(0, 6, 40, 2); u.uBk.value.set(Math.max(1, u.uBk.value.x), 1, 1, 1); u.uBk2.value.set(1, 1, 1, 1); events.push('glass'); return; }   // giữ kính đã rụng (2) của xác cháy
      if (p.z > S.roofF - 1.2 && p.y > top(p.z) - 0.5) {
        // kính chắn gió dán keo: trúng một điểm thì rạn loang quanh điểm đó; trúng tiếp chỗ khác -> rạn khắp tấm
        const e = u.uE.value;
        if (e.w >= 1 && Math.hypot(p.x - e.x, p.z - e.y) > 3) u.uBk.value.x = Math.max(1, u.uBk.value.x);
        e.set(p.x, p.z, e.w >= 1 ? Math.min(9, e.z + 1.5) : 4.5, Math.max(1, e.w));
        if (Math.abs(p.x) > plan(p.z) - 2.2) { if (p.x > 0) u.uBk.value.w = 1; else u.uBk.value.z = 1; }
      }
      else if (p.z < S.roofR + 1.2 && Math.abs(p.x) < plan(p.z) - 0.8) u.uBk.value.y = 1;
      else if (p.z > S.zB) { if (p.x > 0) u.uBk.value.w = 1; else u.uBk.value.z = 1; }
      else { if (p.x > 0) u.uBk2.value.y = 1; else u.uBk2.value.x = 1; }
      events.push('glass');
    };
    const flattenNear = (p, rad) => {
      wheels.forEach((w, wi) => {
        if (w.free || Math.hypot(w.g.position.x - p.x, w.g.position.y - p.y, w.g.position.z - p.z) > rad) return;
        const tire = w.g.children[0], flat = 0.42 * S.r; tire.geometry.dispose(); tire.geometry = tireGeometry(S, flat);
        w.lvl = 2; w.flat = flat; w.g.position.y = S.r - flat + (w.lift || 0); events.push('tire');
      });
    };
    const ignite = (x, y, z) => {
      if (fire.on || fire.char >= 1) return;
      fire.on = true; fire.t = 0; fire.ign = [x, y, z];
      fire.boom = !S.isTruck && fire.fuel > 0.4 ? 3.5 + 4 * rnd() : -1;
      // Ánh sáng lửa hắt nhẹ từ gầm / khoang máy ra mặt đường, không chiếu trực diện làm lóa kính
      if (FL.scene && rootOf(g) === FL.scene) fire.light = 'pool';   // đèn dùng chung của cảnh (assignFireLights)
      else {
        fire.light = new THREE.PointLight(0xff6a18, 0, 32, 2);
        fire.light.position.set(0, 1.2, 4);
        g.add(fire.light);
      }
      shatterGlass();
      events.push('ignite');
    };
    const fuelBlast = () => {
      events.push('fuelBlast');
      const P2 = pfx(), fz = S.fuel ? S.fuel[0] : -12;
      P2.add(6, 0, 4, fz, 0, 0, 0, 22, 0.16, 60);
      for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, sp = 10 + rnd() * 30; P2.add(0, (rnd() - 0.5) * 6, 3, fz + (rnd() - 0.5) * 6, Math.cos(a) * sp, 12 + rnd() * 30, Math.sin(a) * sp, 4 + rnd() * 5, 0.6 + rnd() * 0.6, 9); }
      for (let i = 0; i < 30; i++) P2.add(1, (rnd() - 0.5) * 8, 6, fz + 2 + (rnd() - 0.5) * 8, (rnd() - 0.5) * 14, 14 + rnd() * 12, (rnd() - 0.5) * 14, 6 + rnd() * 5, 5 + rnd() * 4, 7);
      for (let i = 0; i < 40; i++) P2.add(2, 0, 3, fz, (rnd() - 0.5) * 80, 20 + rnd() * 60, (rnd() - 0.5) * 80, 0.25, 1.2 + rnd(), 0);
      SB.impulse(0, 1.5, fz, 16, 1600);
      shatterGlass();
      if (!debrisDone) { debrisDone = true; spawnDebris(); }
      decal({ p: new THREE.Vector3(0, 0.08, fz + 4), n: new THREE.Vector3(0, 1, 0) }, 16, scorchMat());
    };
    // ---- hiệu ứng theo chỗ trúng ----
    // vùng: kính, bánh, bình xăng (quanh nắp xăng, thấp), khoang máy (trước kính chắn gió), còn lại tôn thân
    const zoneOf = (h, glassHit) => {
      if (glassHit) return 'glass';
      for (const w of wheels) for (let o = h.obj; o && o !== car; o = o.parent) if (o === w.g) return 'wheel';
      const p = h.p;
      if (S.fuel && Math.abs(p.z - S.fuel[0]) < 4.5 && p.y < S.fuel[1] + 0.8) return 'fuel';
      if (p.z > S.hood[0] - 0.5 && p.y < top(p.z) + 0.6) return 'engine';
      return 'body';
    };
    const paintRGB = () => { const c = mats.paint.color; return [c.r, c.g, c.b]; };
    // phun n hạt quanh hướng dir (độ toả spread), tốc độ sp0..sp1, cỡ s0..s1, đời l0..l1
    const spray = (k, n, p, dir, spread, sp0, sp1, s0, s1, l0, l1, gr, c) => {
      const P2 = pfx();
      for (n = Math.floor(n + rnd()); n > 0; n--) {
        const sp = sp0 + rnd() * (sp1 - sp0);
        P2.add(k, p.x, p.y, p.z, (dir.x + (rnd() - 0.5) * spread * 2) * sp, (dir.y + (rnd() - 0.5) * spread * 2) * sp, (dir.z + (rnd() - 0.5) * spread * 2) * sp, s0 + rnd() * (s1 - s0), l0 + rnd() * (l1 - l0), gr, c);
      }
    };
    // rò rỉ kéo dài sau khi trúng: hơi nước két làm mát / khói dầu phụt ra từ lỗ, nhỏ dần
    const leaks = [];
    const leak = (k, h, dur, rate, s, c) => {
      pfx(); if (leaks.length >= 8) leaks.shift();
      const no = h.no || h.n;
      leaks.push({ k, x: h.p.x + no.x * 0.3, y: h.p.y + no.y * 0.3, z: h.p.z + no.z * 0.3, n: no.clone(), dur, rate, s, c, t: 0, acc: 0 });
    };
    let puddles = 0;
    const puddle = (type, x, z, size) => {
      if (puddles >= 5) return;
      puddles++;
      const m = leakPuddle(type); m.position.set(x, 0.055 + puddles * 0.002, z); m.scale.set(0.01, 0.01, 1); g.add(m); flows.push({ m, t: 0, max: size });
    };
    const impactFx = (h, dv, zone, A) => {
      const p = h.p, no = h.no || h.n, rf = dv.clone().addScaledVector(no, -2 * dv.dot(no)), k = Math.min(1, A.pw / 0.3 + 0.15);
      // điểm mặt đất ngay dưới chỗ trúng (vũng rò rỉ)
      const gx = p.x + no.x * 0.6, gz = p.z + no.z * 0.6;
      if (!A.he) {
        if (zone === 'glass') {
          // kính cường lực vỡ hạt: lấp lánh văng ra + rơi vào trong, một chút bụi trắng
          spray(5, 10 + 14 * k, p, rf, 0.7, 4, 14, 0.1, 0.24, 1, 1.8, 0, [0.78, 0.88, 0.9]);
          spray(5, 6 + 8 * k, p, dv, 0.5, 3, 9, 0.1, 0.2, 1, 1.6, 0, [0.7, 0.82, 0.85]);
          spray(7, 1, p, no, 0.3, 1, 2, 0.5, 0.8, 0.5, 0.9, 1.4, [0.8, 0.82, 0.82]);
        } else if (zone === 'wheel') {
          // cao su: vụn đen + bụi đường, nảy chút tia lửa nếu dính mâm
          spray(5, 4 + 6 * k, p, rf, 0.6, 5, 14, 0.18, 0.32, 1, 1.8, 0, [0.06, 0.06, 0.06]);
          spray(7, 2 + 2 * k, p, no, 0.5, 2, 5, 0.7, 1.1, 0.8, 1.4, 1.8, [0.48, 0.45, 0.4]);
          spray(2, 2, p, rf, 0.4, 25, 50, 0.1, 0.16, 0.1, 0.25, 0);
        } else {
          // tôn: tia lửa nảy theo hướng phản xạ, vảy sơn văng, bụi sơn mịn
          spray(2, 5 + 9 * k, p, rf, 0.45, 25, 60, 0.1, 0.18, 0.12, 0.3, 0);
          spray(5, 3 + 6 * k, p, rf, 0.6, 6, 18, 0.16, 0.34, 1.2, 2, 0, paintRGB());
          spray(7, 1 + 2 * k, p, no, 0.3, 1, 3, 0.4, 0.7, 0.5, 0.9, 1.6, [0.62, 0.6, 0.57]);
          if (zone === 'engine' && rnd() < 0.25 + 2 * A.pw) {
            // thủng két nước / ống dẫn: hơi nước xì trắng, nước làm mát rò xuống đường
            leak(3, h, 4 + 6 * rnd() + 20 * A.pw, 7 + 10 * k, 0.6 + 0.4 * k);
            puddle('coolant', gx, gz, 3 + 5 * k);
          } else if (zone === 'fuel' && rnd() < 0.4 + 2 * A.pw) {
            puddle('fuel', gx, gz, 3 + 5 * k);
          }
        }
        return;
      }
      const pw = A.pw, q = p.clone().addScaledVector(no, 0.6);
      // chớp nổ + quả cầu lửa ngắn hướng theo mặt trúng
      pfx().add(6, q.x, q.y, q.z, 0, 0, 0, 5 + 9 * pw, 0.12, 40);
      spray(0, 10 + 26 * pw, q, no, 0.9, 6, 20, 1.5 + 2 * pw, 2.5 + 3 * pw, 0.18, 0.4, 7);
      spray(2, 8 + 25 * pw, q, no, 1, 30, 80, 0.12, 0.22, 0.4, 1, 0);
      // mảnh tôn sơn + nhựa đen văng
      spray(5, 8 + 18 * pw, q, no, 0.9, 10, 35, 0.25, 0.6, 1.5, 2.5, 0, paintRGB());
      spray(5, 4 + 10 * pw, q, no, 0.9, 8, 28, 0.2, 0.45, 1.5, 2.5, 0, [0.07, 0.07, 0.07]);
      // khói thuốc nổ nâu xám cuộn ra theo hướng mặt trúng rồi bốc lên
      spray(4, 5 + 8 * pw, q, no.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 1, 0)).normalize(), 0.45, 2, 6, 1.4 + 1.4 * pw, 2 + 2 * pw, 2.5, 4.5, 2.2 + pw, [0.2, 0.19, 0.18]);
      leak(4, h, 3 + 4 * pw, 5 + 6 * pw, 0.9 + 0.6 * pw, [0.24, 0.23, 0.21]);   // lỗ thủng còn âm ỉ khói vài giây
      // nổ thấp: bụi đường tung thành vòng
      if (p.y < 4) for (let i = 0, n = 5 + 7 * pw; i < n; i++) {
        const a = i / n * 6.28 + rnd() * 0.5, sp = 10 + rnd() * 15;
        pfx().add(7, p.x + Math.cos(a), 0.8, p.z + Math.sin(a), Math.cos(a) * sp, 1 + rnd() * 3, Math.sin(a) * sp, 1.6 + rnd() * 1.2, 1.5 + rnd(), 2, [0.56, 0.51, 0.44]);
      }
      if (zone === 'engine') {
        // vỡ két nước + rách đường dầu: hơi nước trắng xì dai, khói dầu xám đen mỏng, vũng nước làm mát + dầu
        leak(3, h, 15 + 10 * rnd(), 10 + 8 * pw, 1 + pw);
        leak(1, h, 8 + 6 * rnd(), 2 + 3 * pw, 1 + 0.6 * pw);
        puddle('coolant', gx, gz, 5 + 6 * pw); puddle('oil', gx + (rnd() - 0.5) * 3, gz + (rnd() - 0.5) * 3, 4 + 5 * pw);
      } else if (zone === 'fuel') {
        puddle('fuel', gx, gz, 6 + 8 * pw);
      } else if (zone === 'glass') {
        spray(5, 20 + 30 * pw, q, no, 1, 6, 20, 0.1, 0.26, 1, 2, 0, [0.78, 0.88, 0.9]);
      } else if (zone === 'wheel') {
        spray(5, 8 + 12 * pw, q, no, 0.9, 8, 25, 0.25, 0.6, 1.5, 2.5, 0, [0.05, 0.05, 0.05]);
        leak(1, h, 4 + 4 * rnd(), 2, 0.8);   // cao su cháy xém bốc khói đen
      }
    };
    // Loại đạn -> hiệu ứng: súng máy thủng lỗ / vỡ kính / xẹp lốp; xuyên giáp thủng xuyên 2 bên; HE / RPG / tên lửa xé toạc,
    // hất xác, cháy; đạn cháy châm lửa. (ox..oz điểm đầu tia bắn, dx..dz hướng bay — hệ toạ độ xe con)
    const AMMO = {
      SCOUT_BULLET: { pw: 0.02, hole: 0.18 }, GATLING_BULLET: { pw: 0.03, hole: 0.2 },
      INCENDIARY_HMG: { pw: 0.03, hole: 0.2, inc: 0.35 }, INCENDIARY: { pw: 0.04, hole: 0.22, inc: 0.5 },
      AP: { pw: 0.3, hole: 0.6, through: true },
      GL40: { pw: 0.2, hole: 0.45, he: true, inc: 0.12 },
      HEAT120: { pw: 0.8, hole: 0.8, through: true, he: true, inc: 0.65 },
      SCOUT_INCENDIARY: { pw: 0.025, hole: 0.18, inc: 0.35 },
      CLUSTER_SUBMUNITION: { pw: 0.45, hole: 1.0, inc: 0.3, he: true }, CLUSTER: { pw: 0.55, hole: 1.2, inc: 0.4, he: true },
      RPG: { pw: 0.75, hole: 1.3, inc: 0.8, he: true }, ANTI_TANK_MISSILE: { pw: 0.95, hole: 1.6, inc: 0.95, he: true },
      NORMAL: { pw: 0.9, hole: 1.5, inc: 0.6, he: true }, AP: { pw: 0.95, hole: 0.9, inc: 0.4, through: true }, APFSDS: { pw: 1.0, hole: 0.85, inc: 0.35, through: true }, HEAT120: { pw: 1.0, hole: 1.2, inc: 0.85, he: true, through: true }, HE: { pw: 1, hole: 1.8, inc: 0.7, he: true }
    };
    const shoot = (ox, oy, oz, dx, dy, dz, ammo) => {
      const len=Math.hypot(dx,dy,dz);if(len<1e-8)return false;
      dx/=len;dy/=len;dz/=len;
      const A = AMMO[ammo] || AMMO.SCOUT_BULLET, h = surfaceHit([ox, oy, oz], [dx, dy, dz]);
      if (!h) return false;
      // đạn nhỏ trúng đèn / gương: vỡ đúng chi tiết đó (không khoét lỗ tôn)
      if (!A.he && A.pw < 0.3) {
        let mirror = null; for (let q = h.obj; q && q !== car; q = q.parent) if (q.userData && q.userData.acc === 'mirror') mirror = q;
        if (h.obj.userData.lens || mirror) {
          const dv = new THREE.Vector3(dx, dy, dz), rf = dv.clone().addScaledVector(h.no, -2 * dv.dot(h.no));
          if (mirror) hitMirror(mirror, rnd() < 0.25 + A.pw * 2, dv);
          else { if (holeLens(h.obj, toCar(h.p), 0.35 + 0.3 * rnd(), rnd) > 0.85) h.obj.visible = false; events.push('glass'); }
          spray(5, 8 + 6 * rnd(), h.p, rf, 0.6, 3, 10, 0.08, 0.2, 0.8, 1.4, 0, h.obj.material === M.tailLens ? [0.6, 0.06, 0.05] : [0.82, 0.86, 0.86]);
          return true;
        }
      }
      let glassHit = h.obj === cabin && Math.abs(h.n.y) < 0.85 && h.p.y > top(h.p.z) + 0.4;
      if(glassHit&&S.isDump) {
        const {x,y,z}=h.p;
        glassHit=(z>S.roofF&&y>=11.75&&y<=15.9&&Math.abs(x)<=6.15)||
          (z<8&&y>=12.3&&y<=15.1&&Math.abs(x)<=3.5)||
          (Math.abs(h.n.x)>0.6&&y>=12.05&&y<=15.55&&z>=9.1&&z<=18.2-0.34*(y-12.05));
      }
      events.push(A.he ? 'blast' : glassHit ? 'glass' : 'ping');
      const zone = zoneOf(h, glassHit), dv = new THREE.Vector3(dx, dy, dz);
      if (glassHit) {
        shatterGlass(h.p);
      } else if (zone !== 'wheel') {
        const holeR = A.hole * (0.8 + 0.4 * rnd());
        decal(h, holeR, holeMat());
        makeHoleMesh(h, holeR, dv, false);
      }
      impactFx(h, dv, zone, A);
      if (A.through) {   // xuyên giáp: lỗ ra phía bên kia (mép xé ra ngoài), kính vỡ, mảnh vụn phụt ra theo hướng đạn
        const o2 = [h.p.x + dx * 30, h.p.y + dy * 30, h.p.z + dz * 30], h2 = surfaceHit(o2, [-dx, -dy, -dz]);
        if (h2) {
          const exitR = A.hole * 1.5;
          decal(h2, exitR, holeMat(true));
          makeHoleMesh(h2, exitR, dv, true);
          shatterGlass(h2.p);
          spray(5, 6 + 10 * A.pw, h2.p, dv, 0.35, 10, 30, 0.2, 0.45, 1.2, 2, 0, paintRGB());
          spray(2, 4 + 8 * A.pw, h2.p, dv, 0.3, 30, 70, 0.12, 0.2, 0.2, 0.4, 0);
          spray(7, 2 + 4 * A.pw, h2.p, dv, 0.4, 2, 6, 0.6, 1.1, 0.8, 1.4, 2, [0.5, 0.48, 0.45]);
        }
      }
      if (A.he || A.pw >= 0.75) {
        // Đạn pháo xe tăng / tên lửa bắn vào xe dân sự: sức công phá cực mạnh thổi tung xe
        shatterGlass(); // Vỡ nát toàn bộ kính xe
        crushMax = Math.max(crushMax, 0.55 + 0.35 * A.pw);
        SB.impulse(h.p.x - dx * 2.0, h.p.y - dy * 2.0, h.p.z - dz * 2.0, 12 + 18 * A.pw, 2000 + 4000 * A.pw);
        flattenNear(h.p, 16); // Thổi nổ các bánh xe
        if (!debrisDone) { debrisDone = true; spawnDebris(); }
        ignite(h.p.x, h.p.y, h.p.z); // Bốc cháy dữ dội tức thì
        const sr = 2.5 + 4.5 * A.pw;
        decal(h, sr, scorchMat(), meshesNear(h.p, sr));
        makeHoleMesh(h, A.hole * 1.6, dv, false);
      } else {
        flattenNear(h.p, 3.2);
        SB.impulse(h.p.x, h.p.y, h.p.z, 1.5, 30 * A.pw / 0.03);
      }
      // bắt lửa: còn xăng mới cháy; trúng bình xăng / khoang máy dễ cháy hơn, trúng kính / lốp khó hơn
      const incK = zone === 'fuel' ? 1.8 : zone === 'engine' ? 1.2 : zone === 'glass' || zone === 'wheel' ? 0.5 : 1;
      if (A.inc && fire.fuel > 0.05 && rnd() < A.inc * incK) ignite(h.p.x, h.p.y, h.p.z);
      return true;
    };
    // cháy theo thời gian: lửa bốc từ chỗ trúng lan khắp khoang (~6 s), khói đen cột cao, nổ bình xăng nếu còn nhiều xăng,
    // sơn cháy rộp thành khung đen gỉ, lốp cháy rụi, kính rơi hết; hết xăng / vật liệu cháy (~45-70 s) thì tắt, âm ỉ khói
    const burnColor = new THREE.Color(0x1c1612), bodyCol0 = mats.body.color.clone(), cabCol0 = mats.cabin.color.clone(), paintCol0 = mats.paint.color.clone();
    const fireUpdate = dt => {
      if (pfxOn) PFX.update(dt);
      for (let i = leaks.length - 1; i >= 0; i--) {
        const L = leaks[i]; L.t += dt;
        if (L.t >= L.dur) { leaks.splice(i, 1); continue; }
        // phụt theo từng nhịp (áp suất trong két / ống dao động), yếu dần về cuối
        L.acc += L.rate * (1 - L.t / L.dur) * (0.6 + 0.4 * Math.sin(L.t * 7 + i)) * dt;
        for (; L.acc >= 1; L.acc--) PFX.add(L.k, L.x + (rnd() - 0.5) * 0.4, L.y + (rnd() - 0.5) * 0.4, L.z + (rnd() - 0.5) * 0.4,
          L.n.x * 4 + (rnd() - 0.5) * 1.5, L.n.y * 4 + 2 + rnd() * 2, L.n.z * 4 + (rnd() - 0.5) * 1.5, L.s * (0.7 + 0.6 * rnd()), 1.4 + rnd() * 1.4, L.s * 2.2, L.c);
      }
      if (!fire.on) return;
      fire.t += dt;
      const dur = 45 + 25 * fire.fuel, k = Math.min(1, fire.t / 6) * Math.min(1, (dur - fire.t) / 12);
      if (fire.boom > 0 && fire.t >= fire.boom) { fire.boom = -1; fuelBlast(); }
      const P2 = pfx(), spread = Math.min(1, fire.t / 6);
      const inGame = typeof window !== 'undefined' && window.game;
      const emit = (rate, kind) => {
        let n = rate * dt;
        while (n > 0) {
          if (n < 1 && rnd() > n) break;
          n--;
          const lz = fire.ign[2] * (1 - spread) + (rnd() - 0.4) * 20 * spread;
          const lx = fire.ign[0] * (1 - spread) + (rnd() - 0.5) * 8 * spread;
          const ly = Math.max(1.0, SB.dispAt(lx, top(lz), lz)[1] + top(lz)) + rnd() * 1.0;
          if (kind === 0) {
            // Ngọn lửa nhỏ liếm từ khoang máy
            P2.add(0, lx, ly, lz, (rnd() - 0.5) * 2, 4 + rnd() * 6, (rnd() - 0.5) * 2, 1.2 + rnd() * 1.6 * k, 0.35 + rnd() * 0.35, 1.2);
          } else if (!inGame) {
            // Khi chạy ngoài game: khói nhẹ nhàng mờ ảo, không che phủ thành cục đen
            P2.add(1, lx, ly + 2, lz, (rnd() - 0.5) * 2, 6 + rnd() * 5, (rnd() - 0.5) * 2, 2 + rnd() * 1.5, 4 + rnd() * 2.5, 3);
          } else {
            // Trong game: để fx.smoke của game phụ trách cột khói cuộn lớn, ở đây chỉ thêm tia lửa li ti
            P2.add(2, lx, ly + 0.8, lz, (rnd() - 0.5) * 25, 8 + rnd() * 20, (rnd() - 0.5) * 25, 0.22, 0.8 + rnd() * 0.5, 0);
          }
        }
      };
      emit(160 * k, 0);
      emit(inGame ? 30 * k : 12 * k + 2, inGame ? 2 : 1);
      // Ánh sáng lửa dịu nhẹ hắt từ gầm / khoang máy, không chói gắt làm lóa kính
      const fireLux = 0.85 * k * (0.8 + 0.3 * Math.sin(fire.t * 19) * Math.sin(fire.t * 6.3));
      if (fire.light === 'pool') requestFireLight(g, 0, 1.2, 4, fireLux);
      else if (fire.light) fire.light.intensity = fireLux;
      // Ngay khi lửa bùng lên: nhiệt độ thiêu rụi lớp bóng gương, muội than làm nhám bề mặt -> triệt tiêu vân vi mạch phản chiếu
      const burnProg = Math.min(1, fire.t / 3);
      mats.body.clearcoat = mats.cabin.clearcoat = Math.max(0, 1 - burnProg * 3) * 0.05;
      mats.body.roughness = Math.min(0.95, 0.42 + 0.53 * burnProg);
      mats.cabin.roughness = Math.min(0.95, 0.2 + 0.75 * burnProg);
      // Cháy rụi dần: sơn chuyển sang màu muội than đen xám, kính ám khói muội đen đục
      fire.char = Math.min(1, fire.t / 20);
      const c = fire.char;
      addonWear.value.w = c;
      mats.body.color.copy(bodyCol0).lerp(burnColor, c);
      mats.cabin.color.copy(cabCol0).lerp(burnColor, Math.min(1, burnProg * 1.5));
      mats.paint.color.copy(paintCol0).lerp(burnColor, c);
      for (const m of [mats.body, mats.cabin]) { const u = m.userData.uni.uW.value; u.x = W.dust * (1 - c); u.y = W.age * (1 - 0.8 * c); u.z = W.rust * (1 - c) + 0.25 * c; }
      if (c > 0.3) mats.body.userData.uni.uTk.value.w = mats.cabin.userData.uni.uTk.value.w = 0;   // lớp sơn bong / trầy cháy cùng
      for (const m of [mats.rim, mats.lip, mats.chrome]) { if (!m.userData.c0) m.userData.c0 = m.color.clone(); m.color.copy(m.userData.c0).lerp(new THREE.Color(0x3a2a20), c); m.roughness = Math.max(m.roughness, 0.3 + 0.5 * c); }
      car.position.y = -S.r * 0.28 * Math.max(0, (c - 0.5) * 2);   // lốp cháy rụi, thân lún xuống vành
      if (fire.t >= dur) { fire.on = false; if (fire.light && fire.light !== 'pool') fire.light.intensity = 0; }
    };
    // ---- VA HÚC / NÒNG PHÁO QUÉT: móp cục bộ vĩnh viễn ----
    // điểm / hướng trong hệ g (xe con) -> hệ car (thân nghiêng / lún theo bánh xẹp)
    const _ci = new THREE.Matrix4();
    const toCar = (p, dir) => { car.updateMatrix(); _ci.copy(car.matrix).invert(); return dir ? p.clone().transformDirection(_ci) : p.clone().applyMatrix4(_ci); };
    // móp tại pc (hệ car), n: pháp tuyến hướng ra ngoài; dời cả trạng thái nghỉ -> các lần dựng lại sau (cán, nảy khung,
    // húc tiếp) vẫn giữ vết; chi tiết rời (gương, biển số, tay nắm) trong vùng móp dời theo
    const permDent = (pc, n, r, depth) => {
      const fq = 2.4 / Math.max(1, r * 0.6);
      for (const [geo, R] of restGeo) {
        const body_ = geo === bodyGeo || geo === cabGeo;
        let cr0 = geo.userData.cr0;
        for (let i = 0, N = R.length / 3; i < N; i++) {
          const ex = R[3 * i] - pc.x, ey = R[3 * i + 1] - pc.y, ez = R[3 * i + 2] - pc.z, l2 = ex * ex + ey * ey + ez * ez;
          if (l2 >= r * r) continue;
          const t = 1 - l2 / (r * r), k = depth * t * t * (0.85 + 0.15 * Math.sin((ex * 2.1 + ey * 1.5 + ez * 1.8) * fq));
          R[3 * i] -= n.x * k; R[3 * i + 1] -= n.y * k; R[3 * i + 2] -= n.z * k;
          if (body_) { if (!cr0) cr0 = geo.userData.cr0 = new Float32Array(N); cr0[i] = Math.max(cr0[i], Math.min(0.34, 0.1 + depth * 0.15) * Math.sin(Math.PI * Math.min(1, t * 1.5))); }
        }
      }
      for (const e of restObj) {
        if (!e.p) continue;
        const ex = e.p.x - pc.x, ey = e.p.y - pc.y, ez = e.p.z - pc.z, l2 = ex * ex + ey * ey + ez * ez;
        if (l2 >= r * r) continue;
        const t = 1 - l2 / (r * r), k = depth * t * t;
        e.p.x -= n.x * k; e.p.y -= n.y * k; e.p.z -= n.z * k;
      }
    };
    // vỡ kính đèn trong bán kính rad quanh pc (hệ car); trả về số đèn vỡ
    const breakLampsNear = (pc, rad, frac) => {
      let n = 0;
      for (const fg of lamps) {
        const lens = fg.children.find(m => m.userData.lens);
        if (!lens || !lens.visible) continue;
        if (!lens.geometry.boundingSphere) lens.geometry.computeBoundingSphere();
        if (lens.geometry.boundingSphere.center.distanceTo(pc) > rad + lens.geometry.boundingSphere.radius) continue;
        if (holeLens(lens, pc, frac, rnd) > 0.85) lens.visible = false;
        for (const m of fg.children) if (m !== lens && m.geometry && m.geometry.type !== 'BufferGeometry' && rnd() < 0.5) m.visible = false;
        n++;
      }
      return n;
    };
    // gương hậu: vỡ kính (rạn / rơi mặt kính) hoặc gãy văng khỏi xe nằm dưới đất
    const hitMirror = (grp, knock, pushDir) => {
      if (!grp.parent) return;
      if (knock) {
        const w = new THREE.Vector3(); grp.getWorldPosition(w); g.worldToLocal(w);
        g.add(grp);
        const sx = Math.sign(w.x) || 1, d = pushDir || new THREE.Vector3(sx, 0, 0);
        grp.position.set(w.x + d.x * (2 + 3 * rnd()) + sx * 1.5, 0.35, w.z + d.z * (2 + 3 * rnd()));
        grp.rotation.set((rnd() - 0.5) * 0.6, rnd() * 6.3, sx * (1.2 + rnd() * 0.5));
        const e = restObj.find(q => q.o === grp); if (e) e.hidden = true;
      } else grp.traverse(m => { if (m.userData && m.userData.mirrorGlass) m.material = mats.black; });
      events.push('glass');
    };
    const crushApi = {
      // tx, tz, hd: vị trí / hướng xe tăng trong hệ toạ độ xe con (đv); dt: thời gian đè; c0, slope, roll: đáy dải xích;
      // dim: kích thước gầm xe tăng (xem CarSoftBody setTank), bỏ trống -> hộp chung
      stamp(tx, tz, hd, dt, c0 = 0, slope = 0, dim, roll = 0) {
        stamp(tankFoot(tx, tz, hd, c0, slope, dim, roll), dt);
        const vx = lastPose ? (tx - lastPose[0]) / Math.max(dt, 1e-3) : 0, vz = lastPose ? (tz - lastPose[1]) / Math.max(dt, 1e-3) : 0;
        lastPose = [tx, tz];
        SB.setTank(tx, tz, hd, c0, slope, vx, vz, dim, roll);
      },
      // độ cao đống xác đỡ dưới 4 góc gầm xe tăng [trái-trước, trái-sau, phải-trước, phải-sau] (hệ xe con)
      support(tx, tz, hd, dim, out) { return SB.support(tx, tz, hd, dim, out); },
      update(dt) {
        // Cập nhật góc bập bênh mượt mà theo vị trí đè, tự hồi phục đàn hồi theo thời gian
        const flattenK = Math.max(0, 1 - crushMax * 1.5);
        // Lực cản đàn hồi hồi vị trí cân bằng nếu không bị đè liên tục
        tilt.tp *= Math.max(0, 1 - dt * 2.5);
        tilt.tr *= Math.max(0, 1 - dt * 2.5);
        tilt.p += (tilt.tp * flattenK - tilt.p) * Math.min(1, dt * 7);
        tilt.r += (tilt.tr * flattenK - tilt.r) * Math.min(1, dt * 7);
        car.rotation.x = pitch + tilt.p;
        car.rotation.z = roll + tilt.r;

        // Giới hạn độ hạ tâm xe, tuyệt đối không cho xe chui xuyên qua mặt đất y = 0
        const zFront = S.plan[S.plan.length - 1][0];
        const noseDrop = Math.sin(Math.max(0, tilt.p)) * (zFront * 0.2);
        const yBurn = (fire.on ? S.r * 0.28 * Math.max(0, (fire.char - 0.5) * 2) : 0);
        const rawY = -sink - (crushMax * 0.35) - noseDrop - yBurn;
        // Chống lún xuyên lòng đất (bảo đảm sàn gầm và mũi xe luôn nằm trên mặt đất)
        const minYFloor = -Math.min(1.2, Math.max(0.2, (bot(0) || 1.6) * 0.75));
        car.position.y = Math.max(minYFloor, rawY);

        // trần vệt xích đổi (capOn) cũng phải dựng lại dù khung không động đậy
        if ((SB.step(dt) && SB.consumeMoved()) || (capOn && crushDirty)) {
          const now = performance.now();
          if (!this._lastRebuildTime || now - this._lastRebuildTime > 25) {
            this._lastRebuildTime = now;
            rebuild();
          }
        }
        fireUpdate(dt);
        for (const fl of flows) { fl.t += dt; const k = (fl.max || 1) * (0.15 + 0.85 * (1 - Math.exp(-fl.t / 6))); fl.m.scale.set(k, k, 1); }   // dầu / nước làm mát loang dần
      },
      // trúng đạn tại (x, y, z) hệ xe con: power 0..1 (đạn súng máy ~0.05, đạn pháo HE ~1), mảnh văng + móp tiếp
      // đạn bay từ (ox, oy, oz) theo hướng (dx, dy, dz) trong hệ xe con, loại đạn ammo (khoá AMMO). Trả về true nếu trúng
      shoot(ox, oy, oz, dx, dy, dz, ammo) { return shoot(ox, oy, oz, dx, dy, dz, ammo); },
      // nòng pháo / tháp pháo xe tăng vụt quét qua xe con (w0, w1: toạ độ thế giới 2 đầu nòng; radius: bán kính nòng; wVel: vận tốc quét)
      sweepBarrel(w0, w1, radius = 1.0, wVel = null) {
        if (!w0 || !w1) return false;
        car.updateWorldMatrix(true, true);   // cả nhánh cha: ô tô vừa bị đẩy / xoay trong khung này
        const inv = new THREE.Matrix4().copy(car.matrixWorld).invert();
        const p0 = w0.clone().applyMatrix4(inv);
        const p1 = w1.clone().applyMatrix4(inv);
        const vL = wVel ? wVel.clone().transformDirection(inv) : new THREE.Vector3(0, 0, 0);
        const speed = vL.length();

        const seg = p1.clone().sub(p0);
        const segLen = seg.length();
        if (segLen < 0.5) return false;

        const carZ0 = S.isTruck ? (S.cabin[0][0] - 0.2) : S.plan[0][0];
        const carZ1 = S.plan[S.plan.length - 1][0];
        const N_SAMPLES = Math.max(12, Math.ceil(segLen / 1.2));
        let hitPoint = null, hitKind = null, maxPen = 0;

        for (let i = 0; i <= N_SAMPLES; i++) {
          const t = i / N_SAMPLES;
          const p = p0.clone().lerp(p1, t);
          const z = p.z, x = p.x, y = p.y;
          if (z < carZ0 - 0.5 || z > carZ1 + 0.5) continue;
          const w = plan(z);
          if (Math.abs(x) > w + radius) continue;

          const inCab = z > zC0 - 0.3 && z < zC1 + 0.3;
          const yTop = top(z), yRoof = inCab ? roof(z) : yTop, yBot = bot(z);

          // Độ cao thực tế sau khi bị xích cán bẹp (dựa vào biến dạng XPBD):
          // Nếu xe đã bị đè bẹp sát đất, nòng pháo quét ở trên cao sẽ không bị chạm ảo
          const dispTop = SB.dispAt(x, yTop, z);
          const curTop = Math.max(0.4, yTop + dispTop[1]);
          const dispRoof = inCab ? SB.dispAt(x, yRoof, z) : dispTop;
          const curRoof = inCab ? Math.max(0.4, yRoof + dispRoof[1]) : curTop;
          const dispBot = SB.dispAt(x, yBot, z);
          const curBot = Math.max(0.2, yBot + dispBot[1]);
          const curUpper = inCab ? curRoof : curTop;

          if (y >= curBot - radius && y <= curUpper + radius) {
            const pen = inCab ? Math.min(curRoof + radius - y, y - (curTop - radius)) : Math.min(curTop + radius - y, y - curBot);
            if (pen > maxPen) {
              maxPen = pen;
              hitPoint = p;
              // Nếu xe đã bị cán nát hoặc kính đã vỡ từ trước thì không còn kính để vỡ tiếp
              const glassBroken = crushMax > 0.35 || debrisDone;
              if (inCab && y > curTop - 0.35 && !glassBroken) {
                const isPillar = Math.abs(Math.abs(x) - w) < 0.85 || Math.abs(y - curRoof) < 0.65;
                hitKind = isPillar ? 'pillar' : 'glass';
              } else {
                hitKind = 'body';
              }
            }
          }
        }

        if (!hitPoint) return false;
        // chỗ nòng ngập sâu nhất vào thân xe (toạ độ thế giới) — props.barrelCars lấy làm điểm đẩy ô tô / giữ tháp
        this.lastHit = (this.lastHit || new THREE.Vector3()).copy(hitPoint).applyMatrix4(car.matrixWorld);

        const now = performance.now();
        if (this._lastSweepHit && (now - this._lastSweepHit < 90)) return true;
        this._lastSweepHit = now;
        // nòng đứng yên tì vào xe: chỉ tác động lần đầu, không đục lõm mãi tại chỗ
        const resting = speed < 2.5;
        if (resting && this._restHit) return true;
        this._restHit = resting;

        const pushDir = speed > 0.5 ? vL.clone().normalize() : new THREE.Vector3(Math.sign(hitPoint.x) || 1, -0.2, Math.sign(hitPoint.z) || 1).normalize();
        const effSpeed = Math.max(speed, 12);
        const crushed = crushMax >= 0.6;

        if (crushed) {
          // Xe đã bị cán bẹp sát đất: chỉ phát tia lửa ma sát kim loại nếu nòng quét nhanh, không văng vụn kính/sơn lả tả
          if (effSpeed > 15) {
            const sparkCount = Math.min(8, Math.max(2, Math.floor(effSpeed * 0.2)));
            spray(2, sparkCount, hitPoint, pushDir, 0.4, 20, 48, 0.08, 0.18, 0.1, 0.25, 0);
          }
        } else if (hitKind === 'glass') {
          shatterGlass(hitPoint);
          spray(5, 26, hitPoint, pushDir, 0.75, 10, 28, 0.12, 0.34, 1.2, 2.4, 0, [0.78, 0.88, 0.92]);
          spray(7, 3, hitPoint, new THREE.Vector3(0, 1, 0), 0.5, 2, 6, 0.5, 1.0, 0.5, 1.2, 1.4, [0.82, 0.84, 0.84]);
          spray(2, 12, hitPoint, pushDir, 0.45, 22, 55, 0.1, 0.22, 0.1, 0.35, 0);
        } else if (hitKind === 'pillar') {
          shatterGlass(hitPoint);
          spray(2, 18, hitPoint, pushDir, 0.5, 26, 65, 0.12, 0.25, 0.1, 0.4, 0);
          spray(5, 14, hitPoint, pushDir, 0.65, 8, 22, 0.14, 0.32, 1.0, 2.0, 0, paintRGB());
        } else {
          spray(2, 16, hitPoint, pushDir, 0.5, 25, 60, 0.12, 0.25, 0.1, 0.35, 0);
          spray(5, 10, hitPoint, pushDir, 0.6, 6, 20, 0.15, 0.35, 1.0, 2.0, 0, paintRGB());
        }

        const impForce = crushed ? Math.min(600, effSpeed * 15 + 100) : Math.min(900, effSpeed * 15 + 200);
        SB.impulse(hitPoint.x, hitPoint.y, hitPoint.z, radius * 3.2, impForce);
        if (!crushed) {
          // ống nòng thép quật vào: điểm nòng chạm mặt tôn = dò ngược theo hướng quét từ chỗ lấn sâu nhất ra ngoài;
          // rãnh lõm theo thân nòng, đèn / gương trên đường quét vỡ, gãy
          car.updateMatrix();
          const dG = pushDir.clone().transformDirection(car.matrix), pG = hitPoint.clone().applyMatrix4(car.matrix);
          const hs = surfaceHit(pG.clone().addScaledVector(dG, -25).toArray(), dG.toArray());
          const pc = hs ? toCar(hs.p) : hitPoint, nc = hs ? toCar(hs.no, true).normalize() : pushDir.clone().negate();
          permDent(pc, nc, radius * 1.5 + 0.6, Math.min(0.9, 0.1 + speed * 0.006));
          breakLampsNear(pc, radius + 0.8, 0.7);
          for (const e of restObj) if (e.p && !e.hidden && e.o.parent !== g && e.o.userData && e.o.userData.acc === 'mirror' && e.p.distanceTo(pc) < radius + 1.8) hitMirror(e.o, true, pushDir);
          if (hs && hs.obj === cabin && hs.p.y > top(pc.z) + 0.3) shatterGlass(pc);
        }

        // Độ rung nảy khi bị nòng pháo va quẹt (giới hạn góc rung nhẹ, không làm lật hay cắm đầu xe)
        tilt.tr = Math.max(-0.08, Math.min(0.08, tilt.tr - Math.sign(hitPoint.x || 1) * Math.min(0.04, effSpeed * 0.0015)));
        tilt.tp = Math.max(-0.06, Math.min(0.06, tilt.tp + Math.sign(hitPoint.z || 1) * Math.min(0.04, effSpeed * 0.0015)));

        if (!crushed) {
          events.push(hitKind === 'glass' ? 'glass' : 'crunch');
          if (effSpeed > 10) events.push('crunch');
        }

        rebuild();
        return true;
      },
      // Xe khác húc / đâm / ủi vào: (lx, lz) điểm tì trên mặt bằng thân (hệ xe con, như props.js tính), (dx, dz) hướng
      // xe húc lao tới, E năng lượng va chạm (tấn x (đv/s)^2 / 2 như props dent), ly độ cao điểm tì (bỏ trống: ngang cản).
      // Móp lõm đúng chỗ (sâu / rộng theo E, vĩnh viễn), khung oằn (thân mềm), đèn / gương / biển số gần đó vỡ, gãy, kính hông
      // vỡ khi đâm mạnh, lốp sát chỗ đâm nổ xẹp, tia lửa + vảy sơn văng
      ram(lx, lz, dx, dz, E, ly) {
        const k = Math.min(1.5, E / 3500);
        if (k < 0.03) return false;
        const hw = plan(Math.max(S.plan[0][0], Math.min(zFront, lz))), hl = (zFront - S.plan[0][0]) / 2;
        const side = Math.abs(lx) / Math.max(1, hw) > Math.abs(lz) / Math.max(1, hl);
        const y = ly !== undefined ? ly : Math.min(top(lz) - 0.8, S.bumperF[1] - 0.5 + 1.5 * Math.min(1, k));
        const o = side ? [Math.sign(lx) * (hw + 12), y, lz] : [lx, y, Math.sign(lz) * (hl + 14)], d = side ? [-Math.sign(lx), 0, 0] : [0, 0, -Math.sign(lz)];
        const h = surfaceHit(o, d);
        if (!h) return false;
        const kk = Math.min(1, k), r = 1.6 + 2.8 * kk, depth = Math.min(3.2, 0.35 + 2.2 * k);
        const pc = toCar(h.p), nc = toCar(h.no, true).normalize();
        permDent(pc, nc, r, depth);
        SB.impulse(pc.x, pc.y, pc.z, r * 1.6, 250 + 900 * kk);
        const push = new THREE.Vector3(dx, 0, dz).normalize();
        let glass = breakLampsNear(pc, r + 1.2, 0.5 + 0.6 * kk) > 0;
        for (const e of restObj) {
          if (!e.p || e.hidden || e.o.parent === g || !e.o.userData) continue;
          const dist = e.p.distanceTo(pc);
          if (e.o.userData.acc === 'mirror' && dist < r + 2.5) { hitMirror(e.o, k > 0.22 || rnd() < 0.3, push); glass = true; }
          else if (e.o.userData.acc === 'plate' && dist < r + 2) { e.r.z += (rnd() - 0.5) * 0.6 * kk; e.r.x += (rnd() - 0.5) * 0.4 * kk; }
        }
        if (k > 0.3) { shatterGlass(new THREE.Vector3(pc.x, top(pc.z) + 1.5, pc.z)); glass = true; }
        if (k > 0.75) shatterGlass(new THREE.Vector3(0, top(S.roofF + 1) + 1, S.roofF + 1));
        if (k > 0.45) flattenNear(pc, 3.5 + 2 * kk);
        // tia lửa tôn cạ tôn, vảy sơn + mảnh nhựa cản văng theo hướng húc, bụi
        spray(2, 6 + 14 * kk, h.p, push, 0.6, 20, 55, 0.1, 0.2, 0.12, 0.35, 0);
        spray(5, 4 + 10 * kk, h.p, push.clone().add(h.no).normalize(), 0.7, 5, 16, 0.14, 0.34, 1, 1.8, 0, paintRGB());
        spray(5, 2 + 5 * kk, h.p, h.no, 0.8, 4, 12, 0.12, 0.3, 1, 1.6, 0, [0.06, 0.06, 0.065]);
        spray(7, 1 + 2 * kk, h.p, h.no, 0.4, 1, 3, 0.6, 1.0, 0.6, 1.1, 1.6, [0.55, 0.52, 0.47]);
        events.push('crunch'); if (glass) events.push('glass');
        rebuild();
        return true;
      },
      // vỡ kính khi khung bị ép / đè mạnh: kính chắn gió rạn khắp, kính hông cường lực vỡ rụng phần lớn
      breakGlass() {
        const u = mats.cabin.userData.uni;
        u.uBk.value.x = Math.max(1, u.uBk.value.x); u.uE.value.w = Math.max(1, u.uE.value.w);
        for (const [v, c] of [[u.uBk.value, 'y'], [u.uBk.value, 'z'], [u.uBk.value, 'w'], [u.uBk2.value, 'x'], [u.uBk2.value, 'y']]) if (rnd() < 0.65) v[c] = 1;
        events.push('glass');
      },
      ignite(x = 0, y = 4, z = 4) { ignite(x, y, z); },
      get burning() { return fire.on; },
      get amount() { return crushMax; },
      // sự kiện mới phát sinh (crunch, glass, collapse, tire, burst) -> game phát âm thanh / hạt
      drain() { return events.splice(0); }
    };
    g.userData.crush = crushApi;
    // cán tĩnh (opts.crush): xe tăng đã chạy thẳng qua theo opts.track
    if (opts.crush) {
      const ca = Math.cos(trk.angle), sa = Math.sin(trk.angle);
      for (let s = -50; s <= 50; s += 14 / 30) { crushApi.stamp(trk.offset * ca + s * sa, -trk.offset * sa + s * ca, trk.angle, 1 / 30); SB.step(1 / 30); }
      for (let i = 0; i < 30; i++) SB.step(1 / 30);
      rebuild();
      // 2 vệt xích hằn bùn trên mặt đất trước / sau xác xe
      const tt = trackTexture();
      for (const sd of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(TW * 2.1, 110), new THREE.MeshStandardMaterial({ map: tt, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.rotation.set(-Math.PI / 2, 0, trk.angle); m.position.set((trk.offset + sd * TC) * ca, 0.05, -(trk.offset + sd * TC) * sa); m.renderOrder = -1;
        g.add(m);
      }
    }
    car.rotation.set(pitch, 0, roll); car.position.y = -sink;
    cShadow = contactShadow(S); g.add(cShadow);
    // lão hoá phụ kiện theo loại vật liệu (vật liệu xe tải đã có lớp phong hoá riêng: weathered)
    {
      const ageU = { uCarInv: { value: new THREE.Matrix4() }, uAgeW: { value: new THREE.Vector4(W.dust, W.age, W.rust, W.seed) }, uWheel: { value: new THREE.Vector4(S.axleF, S.axleR, S.r, S.trackHalf) } };
      body.onBeforeRender = () => { ageU.uCarInv.value.copy(car.matrixWorld).invert(); };
      const AG = new Map(), put = (list, t) => { for (const m of list) if (m) AG.set(m, t); };
      put([mats.tire], 'rubber');
      put([mats.rim, mats.lip, mats.steelRim, mats.hubcap, mats.caliper, mats.cap, mats.barrel], 'rim');
      put([mats.chrome, M.chromeIn], 'chrome');
      put([mats.black, mats.dark, mats.wiper, mats.dash, M.wall, M.slat, M.reflector, wellMat], 'plastic');
      put([mats.paint], 'paint');
      put([mats.seat], 'interior');
      put([M.headLens, M.fogLens], 'lens');   // (kính đèn hậu tự phai / bám bụi trong tailFilterMaterial)
      put([M.tailWall], 'chrome');
      g.traverse(o => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m || weathered.has(m)) continue;
          let t = AG.get(m);
          // vật liệu dựng tại chỗ (ống xả, khung gầm): kim loại sẫm -> gỉ
          if (!t && m.isMeshStandardMaterial && !m.transparent && !m.map && m.metalness >= 0.45 && m.color.getHSL({}).l < 0.4) t = 'metal';
          if (t) ageMaterial(m, t, ageU);
        }
      });
    }
    shareGeometries(g, restGeo);
    // xe nguyên (không cán sẵn: khung mềm còn đang lún dần) -> vẽ bằng bản gộp tới lần đầu bị tác động
    const unmerge = opts.crush || opts.noMerge ? null : mergeStatic(car);
    if (unmerge) {
      let on = true;
      const split = () => { if (on) { on = false; unmerge(); } };
      for (const k of ['stamp', 'shoot', 'sweepBarrel', 'ram', 'breakGlass', 'ignite']) {
        const f = crushApi[k];
        crushApi[k] = function () { split(); return f.apply(this, arguments); };
      }
      const upd = crushApi.update;
      crushApi.update = function (dt) {
        const t0 = this._lastRebuildTime;
        const r = upd.call(this, dt);
        if (on && this._lastRebuildTime !== t0) split();   // khung mềm tự dựng lại (vẫn đang lún): lưới gốc đã đổi
        return r;
      };
      g.userData.unmerge = split;
    }
    g.userData.spec = S;
    return g;
  }
  // BIÊN DỊCH TRƯỚC SHADER XE CHI TIẾT (gọi lúc tải bản đồ có ô tô, game.prewarmShaders): bản chi tiết dựng muộn trong trận
  // nên ~50 biến thể vật liệu (mỗi loại xe x tình trạng: mới / bụi / gỉ / hỏng / cháy rụi / bị cán / đang cháy, thùng xe
  // tải) trước đây biên dịch giữa trận — mỗi shader vật lý ~0,5-1 s trên ANGLE D3D11, đo được giao tranh trong phố đứng
  // hình hàng chục giây. Dựng mỗi biến thể 1 xe trong CHÍNH cảnh trận (khớp số đèn, sương mù, bóng đổ), dưới lòng đất,
  // biên dịch rồi gỡ. Hình học dùng chung (shareGeometries) giữ lại cho xe thật dùng tiếp.
  let warmedFor = null;
  // Các bước dựng xe mẫu (mỗi bước một loại xe, dưới lòng đất) để biên dịch shader: game.scheduleMatchPrewarm chạy từng bước
  // lúc chờ ghép trận rồi biên dịch song song (compileShadersAsync, không chặn); prewarm() chạy liền rồi biên dịch đồng bộ.
  // null nếu cảnh đã làm nóng với cùng bộ đèn. finish(): gỡ xe mẫu; abort(): gỡ và coi như chưa làm nóng
  function warmJobs(scene, renderer) {
    if (!scene || !renderer) return null;
    fireLightPool(scene);
    // đã làm nóng cho cảnh này với cùng bộ đèn (lượt lúc chờ ghép trận, rồi lượt lúc vào trận): bỏ qua
    let lights = 0;
    scene.traverse(o => { if (o.isLight) lights++; });
    const sig = lights + '|' + renderer.shadowMap.enabled + '|' + !!scene.fog;
    if (warmedFor && warmedFor.scene === scene && warmedFor.sig === sig) return null;
    const mark = warmedFor = { scene, sig };
    const holder = new THREE.Group();
    holder.position.set(0, -5000, 0);
    scene.add(holder);
    const add = (kind, o) => { try { const c = build(kind, o); holder.add(c); return c; } catch (e) { return null; } };
    const steps = ['sedan', 'taxi', 'suv', 'pickup', 'hatch', 'van', 'truck', 'dump'].map(kind => () => {
      for (const cond of ['clean', 'dusty', 'rusted', 'broken', 'burnt']) add(kind, { seed: 11, cond, burnt: cond === 'burnt' });
      add(kind, { seed: 3, cond: 'dusty', crush: 0.7 });           // bị cán bẹp: khoang 2 mặt, vệt xích
      add(kind, { seed: 9, cond: 'dusty', glass: true, flats: [1, 0, 0, 1] });
      const c = add(kind, { seed: 7, cond: 'clean' });              // bị bắn, vỡ kính, cháy: lỗ đạn, hạt lửa / khói, kính ám
      const api = c && c.userData.crush;
      if (api) {
        try {
          api.shoot(30, 5, 0, -1, -0.05, 0, 'HE'); api.shoot(0, 4, 30, 0, -0.05, -1, 'SCOUT_BULLET');
          api.breakGlass(); api.ignite(0, 4, 0);
          for (let i = 0; i < 8; i++) api.update(1 / 30);
        } catch (e) { /* chỉ làm nóng shader */ }
      }
    });
    steps.push(() => { for (const kind of ['truck', 'dump']) for (const body of Object.keys(TRUCK_BODIES)) add(kind, { seed: 5, cond: 'dusty', body }); });
    let gone = false;
    const finish = () => {
      if (gone) return;
      gone = true;
      scene.remove(holder);
      assignFireLights(null);
      holder.traverse(o => { if (o.geometry && o.geometry.userData.shareKey === undefined) o.geometry.dispose(); });
    };
    const abort = () => { finish(); if (warmedFor === mark) warmedFor = null; };
    return { holder, steps, finish, abort };
  }
  function prewarm(scene, renderer, camera) {
    if (!scene || !renderer || !camera) return 0;
    const J = warmJobs(scene, renderer);
    if (!J) return 0;
    for (const st of J.steps) st();
    const n0 = (renderer.info.programs || []).length;
    try { renderer.compile(scene, camera); } catch (e) { /* bỏ qua */ }
    J.finish();
    return (renderer.info.programs || []).length - n0;
  }
  return { build, SPEC, envCube, truckBodyOf, lodGeometry, patchLodMaterial, fireLightPool, assignFireLights, prewarm, warmJobs, _geo: { bodyGeometry, cabinGeometry } };
})();
if (typeof window !== 'undefined') window.CivilCars = CivilCars;
