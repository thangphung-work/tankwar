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
      tail: Object.assign({}, SPEC.suv.features.tail, { zMin: -18.5 })
    })
  });

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
  function halfSection(w, y0, y1, yBotBase) {
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
    ], 4);
  }
  function bodyGeometry(S) {
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
    for (let z = z0; z < z1; z += 0.4) Z.add(+z.toFixed(3));
    Z.add(z1);
    const axles = isTruck ? [S.axleF] : [S.axleF, S.axleR];
    for (const az of axles) for (let z = az - RaH - 0.4; z <= az + RaH + 0.4; z += 0.08) Z.add(+z.toFixed(3));
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
      let half = halfSection(w, y0, y1, yBotBase);
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
      for (const t of [0.25, 0.5, 0.75, 1]) {
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
      if (!S.isSuv && !S.isTruck && p[2] < -13.6) {
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
  function cabinGeometry(S) {
    const plan = curve(S.plan), top = curve(S.top), roof = curve(S.cabin);
    const z0 = S.cabin[0][0], z1 = S.cabin[S.cabin.length - 1][0], SM = 5;
    const rings = [], refs = [];
    const isSuv = !!S.isSuv;
    const isTruck = !!S.isTruck;
    // Độ dốc nghiêng của vách kính: duy trì tỷ lệ đều đặn để cột C không bị vặn xoắn lõm yên ngựa
    const tumSlope = S.tumble / (isSuv ? 4.8 : (isTruck ? 6.2 : 3.6));

    for (let z = z0; z <= z1 + 1e-6; z += 0.2) {
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
    const N = 128, sky0 = [196, 204, 210], sky1 = [118, 146, 178], ground = [52, 50, 47], bld = [74, 76, 78];
    const sky = az => { let h = 0; for (const [f, a, p] of [[3, 0.05, 0.3], [7, 0.035, 1.7], [17, 0.03, 4.1], [41, 0.02, 2.2]]) h += a * Math.max(0, Math.sin(az * f + p)); return 0.03 + h; };
    const face = dir => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, [dx, dy, dz] = dir(u, v), ny = dy / Math.hypot(dx, dy, dz);
        let col;
        if (ny < 0) { const t = Math.min(1, -ny * 4); col = sky0.map((c0, i) => c0 + (ground[i] - c0) * Math.pow(t, 0.35)); }
        else if (ny < sky(Math.atan2(dz, dx))) col = bld.map(c0 => c0 * (0.85 + 0.3 * ny));
        else { const t = Math.pow(Math.min(1, ny * 1.3), 0.6); col = sky0.map((c0, i) => c0 + (sky1[i] - c0) * t); }
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
// phủ một lớp vật liệu (màu, kim loại, nhám, lớp bóng) lên điểm đang tô theo tỉ lệ k
#define LAY(k, col, m, r, cc) { float k_ = (k); cO = mix(cO, (col), k_); mO = mix(mO, (m), k_); rO = mix(rO, (r), k_); ccO = mix(ccO, (cc), k_); }
`;
  // DẤU THỜI GIAN (dùng chung thân dưới / khoang kính): uW = (bụi, tuổi, gỉ, seed). Cần sẵn Nn, y, paintK, yBot (mép
  // dưới thân), yBelt (đường vai), dustK
  const GLSL_CRUSH = `
  if (vCr.z > 0.05 || uTk.w > 0.0) {
    float kc = max(smoothstep(0.05, 0.5, vCr.z), 0.5 * uTk.w);
    vec3 wpc = vRest * 1.7 + uW.w;
    float crease = clamp(length(fwidth(normalize(vObjN))) * 5.0, 0.0, 1.0) * kc;
    float scuff = crease * smoothstep(0.55, 0.75, vnoise(wpc * 2.3)) * paintK;
    float flake = kc * smoothstep(0.6, 0.64, vnoise(wpc * 0.9) + 0.25 * vnoise(wpc * 4.0)) * paintK;
    cO *= 1.0 - 0.55 * crease;                       // nếp gập khuất sáng, bụi kẹt trong nếp
    LAY(flake, mix(vec3(0.42, 0.42, 0.4), vec3(0.3, 0.14, 0.06), vnoise(wpc * 3.0)), 0.2, 0.8, 0.0)   // sơn bong: lớp lót / gỉ
    LAY(scuff, vec3(0.62, 0.62, 0.6), 0.95, 0.38, 0.0)   // gờ bị cào lộ tôn trần
    float grime = kc * (0.35 + 0.5 * vnoise(wpc * 0.6)) * step(-0.2, Nn.y);
    LAY(grime * 0.6, vec3(0.16, 0.14, 0.11), 0.0, 0.95, 0.0)   // bụi đất / muội từ xích
    ccO *= 1.0 - 0.8 * kc;
  }
`;
const GLSL_WEATHER = `
  {
    vec3 wp = vRest + uW.w * 13.7;
    float up = clamp(Nn.y, 0.0, 1.0), age = uW.y;
    // Tán sắc góc nhìn quang học mượt mà của sơn kim loại tôn thép (chỉ tác động lên vùng sơn tôn, không chạm vào kính)
    if (paintK > 0.05) {
      float viewIncidence = clamp(abs(dot(normalize(vViewPosition), Nn)), 0.0, 1.0);
      cO = mix(cO * 0.82, cO * 1.08, pow(viewIncidence, 1.4));
    }
    float nB = fbm(wp * 0.22), nF = fbm(wp * 0.95 + 4.0), nS = fbm(vec3(wp.x * 0.7, wp.y * 0.07, wp.z * 0.7) + 2.0);
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
    float rustM = rustEdge * 1.25 + smoothstep(0.66, 0.88, fbm(wp * 0.6 + 7.0)) + peel * 0.8;
    float rust = clamp(uW.z * smoothstep(0.24, 0.52, rustM * (0.38 + 0.82 * nF)), 0.0, 1.0);
    vec3 rc = mix(vec3(0.14, 0.055, 0.024), vec3(0.42, 0.17, 0.06), fbm(wp * 2.5));
    LAY(rust * paintK, rc, 0.0, 0.95, 0.0)
    // vệt nước mưa bẩn chảy dọc từ mép kính xuống cửa
    float grime = age * (1.0 - up) * smoothstep(0.5, 0.74, nS) * smoothstep(yBelt - 4.0, yBelt - 0.2, y) * 0.6;
    cO = mix(cO, vec3(0.11, 0.095, 0.075), grime * paintK); rO = mix(rO, 0.75, grime); ccO *= 1.0 - 0.5 * grime;
    // xước sơn mảnh
    float sc = age * (1.0 - up) * aaLine(fract(dot(vRest.zy, vec2(0.93, 0.31)) * 1.3 + nF * 0.8) - 0.5, 0.03) * smoothstep(0.66, 0.7, fbm(wp * 0.45 + 9.0));
    LAY(sc * paintK, vec3(0.5, 0.5, 0.48), 0.4, 0.5, 0.0)
    // bụi đất: dày ở thân dưới (bánh hắt), lớp bụi mỏng loang trên mặt nằm ngang
    float dust = uW.x * clamp(smoothstep(5.0, 1.2, y) * (0.45 + 0.75 * nB) + up * 0.85 * smoothstep(0.38, 0.72, nB) + 0.22 * age * nF, 0.0, 1.0);
    LAY(dust * dustK, vec3(0.42, 0.38, 0.31), 0.0, 0.92, 0.0)
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
  cO *= 1.0 - 0.85 * fillAA(holeD - 0.05);   // khe hở quanh cụm đèn / lưới
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
      float tgEdge = 5.2;
      seam = max(seam, step(y, vRef.z - 0.15) * step(uB.w, y) * aaLine(ax - tgEdge, gap));
      seam = max(seam, step(ax, tgEdge) * aaLine(y - uB.w, gap));
    } else {
      float lt = vRef.z - uR.w;
      seam = max(seam, step(ax, uR.y) * aaLine(y - uC.w, gap));
      seam = max(seam, step(uC.w, y) * step(y, lt) * aaLine(ax - uR.y, gap));
      seam = max(seam, step(uR.y, ax) * step(ax, hoodEdge) * aaLine(y - lt - 0.06, gap));
    }
  }
  if (uAx.w > 0.5 && uAx.w < 1.5) {
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
    float crumb = step(0.82, hash3(floor(vRest * 9.0))) * cov;
    LAY(inCab * uTk.w * crumb, vec3(0.6, 0.65, 0.65), 0.3, 0.1, 1.0)
    LAY(inCab * uTk.w * (1.0 - crumb), mix(vec3(0.12, 0.11, 0.1), vec3(0.25, 0.23, 0.2), vnoise(vec3(vRest.xz * 2.0, 3.0))), 0.0, 0.9, 0.0)
  }
  // Nhựa đen kỹ thuật cho mép dưới cản và ốp thân xe
  float low = fillAA(y - (vRef.y + 0.3));
  low = max(low, step(uF.x + 1.2, z) * fillAA(y - (uG.w - 0.5)));
  low = max(low, step(z, uR.x - 0.6) * fillAA(y - 3.1));
  low *= 1.0 - inCab;
  LAY(low, vec3(0.038, 0.040, 0.042), 0.02, 0.84, 0.04)
  float featK = max(inCab, low);
  if (uAx.w > 0.5 && uAx.w < 1.5) {
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
    float platePocket = uAx.w > 0.5 ? fillAA(sdBox2(vec2(x, y - 6.72), vec2(2.42, 0.6), 0.12)) : fillAA(sdBox2(vec2(x, y - 5.35), vec2(2.65, 0.72), 0.18));
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
  float pil = (uAx.w > 1.5 ? 0.0 : 1.0) * (1.0 - smoothstep(-f, f, side)) * (1.0 - smoothstep(0.5 - f, 0.5 + f, abs(z - uC.x)));
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
  float suvPrivacy = (uAx.w > 0.5 && uAx.w < 1.5 ? 1.0 : 0.0) * step(z, uC.x);
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
  float gd = glassK * (0.18 + 0.62 * uW.y) * clamp(edgeDust + 0.34 * fbm(vRest * 0.35 + uW.w), 0.0, 1.0);
  cO = mix(cO, vec3(0.43, 0.41, 0.37), gd * 0.42); rO = mix(rO, 0.48, gd); alphaO = mix(alphaO, 0.92, gd); ccO *= 1.0 - 0.42 * gd;
  // rạn nứt kính chắn gió: tia nứt toả từ điểm va + vòng nứt đồng tâm
  if (uE.w > 0.0 && z > uA.y) {
    vec2 cp = vec2(x, z) - uE.xy; float rr = length(cp), an = atan(cp.y, cp.x);
    float fall = smoothstep(uE.z, 0.0, rr);
    float rays = aaLine(sin(an * 7.0 + fbm(vec3(an * 2.0, rr * 0.7, 3.0)) * 5.0) * rr * 0.5, 0.035) * fall;
    float rings = aaLine(sin(rr * 5.0 + fbm(vec3(cp * 1.3, 1.0)) * 3.0) * 0.25, 0.03) * smoothstep(uE.z * 0.55, 0.0, rr);
    float cr = clamp(max(rays, rings) + fillAA(rr - 0.18), 0.0, 1.0) * glassK;
    cO = mix(cO, vec3(0.78, 0.8, 0.8), cr * 0.85); alphaO = mix(alphaO, 1.0, cr); rO = mix(rO, 0.3, cr);
  }
  // xe bị cán bẹp / móp méo: kính hông / kính hậu cường lực vỡ vụn (kính chắn gió dán keo chỉ rạn nứt thanh mảnh)
  // ô kính đang tô: chắn gió / hậu / cửa trước / cửa sau theo bên trái / phải
  float paneBk = dW <= min(min(dR, dF), dRr) ? uBk.x : dR <= min(dF, dRr) ? uBk.y : dF <= dRr ? (x > 0.0 ? uBk.w : uBk.z) : (x > 0.0 ? uBk2.y : uBk2.x);
  if (step(0.5, uE.w) + paneBk > 0.0 || vCr.z > 0.03) {
    if (z > uA.y) {
      // kính chắn gió dán keo nhiều lớp: chịu lực uốn nén, rạn nứt mạng nhện thanh mảnh sắc nét, giữ độ trong suốt
      float kGlass = clamp(vCr.z * 1.5 + (step(0.5, uE.w) * 0.6) + paneBk, 0.0, 1.0);
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
    Object.assign(U, { uF: L.front, uG: L.grille, uR: L.rear, uI: [S.isDump ? 1.25 : S.inset + 0.15, S.cabin[0][0] + 0.2, S.isDump ? 18.65 : S.cabin[S.cabin.length - 1][0] - 0.2, 0], uW: [W.dust, W.age, W.rust, W.seed], uTk: W.track || [0, 0, 0, 0], uBk: [0, 0, 0, 0], uBk2: [0, 0, 0, 0], uAx: [S.axleF, S.axleR, S.r, S.isDump ? 3.0 : S.isTruck ? 2.0 : (S.isSuv ? 1.0 : 0.0)] });
    const uni = {}; for (const k in U) uni[k] = { value: new THREE.Vector4(...U[k]) }; m.userData.uni = uni;
    m.onBeforeCompile = sh => {
      for (const k in uni) sh.uniforms[k] = uni[k];
      sh.vertexShader = 'attribute vec3 aRef; attribute vec3 aRest; attribute vec3 aCr;\nvarying vec3 vRest; varying vec3 vObjN; varying vec3 vRef; varying vec3 vCr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vObjN = normal; vRef = aRef; vCr = aCr;');
      sh.fragmentShader = GLSL_COMMON + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + (mode === 'body' ? GLSL_BODY : GLSL_CABIN + (mode === 'cabinIn' ? '  if (glassOnly > 0.5) discard;\n  diffuseColor.a = 1.0;\n' : '')))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rO;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mO;')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= clamp(ccO, 0.0, 1.0);\n#endif');
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
    g.setIndex(idx); g.computeVertexNormals();
    // quay mặt ra phía người nhìn
    const N = g.attributes.normal; let s = 0; for (let i = 0; i < N.count; i++) s += N.getX(i) * faceDir.x + N.getY(i) * faceDir.y + N.getZ(i) * faceDir.z;
    if (s < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  }
  // Dò biên + các vành trong lên thân xe. Trả về: biên (UV, điểm trúng), các vành (điểm trúng), tâm
  function projectFeature(F, sx, body, outlineUV) {
    const { d, U } = featureFrame(F, sx), rc = new THREE.Raycaster(), nd = d.clone().negate();
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
    add(stripGeometry(rings[0], back[0], true), M.wall);                         // thành lỗ
    add(capGeometry(back, backC, d, null), F.backMat ? M[F.backMat] : M.wall);   // đáy lõm
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
      add(capGeometry(rings.map(R => R.map(p => p.clone())), center.clone(), d, F.lensColor, uvs), M.headLens);
    } else if (F.kind === 'tail') {
      const u0 = Math.min(...outline.map(p => p[0])), u1 = Math.max(...outline.map(p => p[0]));
      const v0 = Math.min(...outline.map(p => p[1])), v1 = Math.max(...outline.map(p => p[1]));
      const rimPts = outline.map(p => at(p[0], p[1], depth * 0.06)).filter(Boolean);
      if (rimPts.length > 6) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 96, 0.045, 6, true), M.wall);
      const cell = (u, v, rx, ry, mat) => {
        const p = at(u, v, depth * 0.58); if (!p) return;
        const m = add(new THREE.SphereGeometry(1, 18, 12), mat); m.position.copy(p); m.scale.set(rx, ry, 0.1);
      };
      if (F.style === 'sedanBlade') {
        // Hai nét LED gãy nhẹ chạy ngang, dồn cụm sáng về góc ngoài như sedan hạng D hiện đại.
        for (const vr of [0.34, 0.7]) {
          const pts = [];
          for (let i = 0; i <= 20; i++) {
            const t = i / 20, u = u0 + (u1 - u0) * (0.07 + t * 0.86);
            const v = v0 + (v1 - v0) * (vr - 0.1 * Math.sin(t * Math.PI));
            const p = at(u, v, depth * 0.4); if (p) pts.push(p);
          }
          if (pts.length > 5) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, vr < 0.5 ? 0.055 : 0.07, 7, false), vr < 0.5 ? M.tailGuide : M.tailBrake);
        }
        cell(u0 * 0.18 + u1 * 0.82, v0 * 0.72 + v1 * 0.28, (u1 - u0) * 0.08, (v1 - v0) * 0.11, M.tailReverse);
      } else if (F.style === 'vertical') {
        // Đồ họa LED dựng đứng: hai nét ôm theo chiều cao cụm đèn, khoang đèn lùi ở đáy.
        for (const ur of [0.3, 0.67]) {
          const pts = [];
          for (let i = 0; i <= 18; i++) {
            const t = i / 18, u = u0 + (u1 - u0) * ur;
            const v = v0 + (v1 - v0) * (0.12 + t * 0.76);
            const p = at(u, v, depth * 0.4); if (p) pts.push(p);
          }
          if (pts.length > 5) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.06, 7, false), M.tailBrake);
        }
        cell((u0 + u1) * 0.5, v0 * 0.8 + v1 * 0.2, (u1 - u0) * 0.22, (v1 - v0) * 0.07, M.tailReverse);
      } else if (F.style === 'blade') {
        // Hai thanh LED mảnh thay cho các bóng tròn lớn, hợp với mảng ốp ngang của cốp SUV.
        for (const vr of [0.36, 0.68]) {
          const pts = [];
          for (let i = 0; i <= 18; i++) {
            const t = i / 18, u = u0 + (u1 - u0) * (0.07 + t * 0.86);
            const v = v0 + (v1 - v0) * (vr + 0.045 * Math.sin(t * Math.PI));
            const p = at(u, v, depth * 0.42); if (p) pts.push(p);
          }
          if (pts.length > 5) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.055, 7, false), M.tailBrake);
        }
        cell(u0 * 0.16 + u1 * 0.84, v0 * 0.68 + v1 * 0.32, (u1 - u0) * 0.075, (v1 - v0) * 0.12, M.tailReverse);
      } else {
        cell(u0 * 0.72 + u1 * 0.28, (v0 + v1) * 0.5, (u1 - u0) * 0.22, (v1 - v0) * 0.3, M.tailBrake);
        cell(u0 * 0.34 + u1 * 0.66, v0 * 0.62 + v1 * 0.38, (u1 - u0) * 0.12, (v1 - v0) * 0.2, M.tailAmber);
        cell(u0 * 0.18 + u1 * 0.82, v0 * 0.7 + v1 * 0.3, (u1 - u0) * 0.1, (v1 - v0) * 0.18, M.tailReverse);
      }
      add(capGeometry(rings, center, d, F.lensColor, uvs), M.tailLens);
      if (!F.style) {
        for (const sc of [0.62, 0.32]) {
          const pts = outline.map(p => { const u = P.cuv[0] + (p[0] - P.cuv[0]) * sc, v = P.cuv[1] + (p[1] - P.cuv[1]) * (sc + 0.25); return at(u, v, depth * 0.35); }).filter(Boolean);
          if (pts.length > 6) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.06, 6, true), M.tailGuide);
        }
      }
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
  function honeyTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.globalCompositeOperation = 'destination-out';
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const cx = i * 16 + (j % 2) * 8, cy = j * 14; x.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; x.lineTo(cx + Math.cos(a) * 6.3, cy + Math.sin(a) * 6.3); } x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1.2);
    return t;
  }
  // lốp: rãnh dẫn hướng thể thao + gân cao su bảo vệ vành mịn màng
  const TIRE_TEX_CACHE = {};
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

  // đĩa phanh thể thao: thép phay xước tiện tròn đồng tâm, lỗ khoan tản nhiệt xoắn ốc và rãnh xẻ thể thao
  const DISC_TEX_CACHE = {};
  function discTexture(age) {
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
    for (let i = 0; i < 420 * age; i++) { x.fillStyle = `rgba(${90 + rnd() * 40 | 0},${70 + rnd() * 30 | 0},${40 + rnd() * 20 | 0},${0.035 + rnd() * 0.18 * age})`; const s = 2 + rnd() * 18; x.fillRect(rnd() * 512, rnd() * 112, s, s * (0.25 + rnd())); }
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
  function wheelGroup(S, mats, sx, flat) {
    const g = new THREE.Group(), r = S.r, w = S.tireW, R = r * 0.62;
    const add = (geo, mat, x, rot) => { const m = new THREE.Mesh(geo, mat); m.position.x = x; if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    add(tireGeometry(S, flat), mats.tire, 0);

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
    add(new THREE.CylinderGeometry(R * 0.78, R * 0.78, 0.06, 48), mats.disc, sx * 0.08, [0, 0, Math.PI / 2]);
    add(new THREE.CylinderGeometry(R * 0.32, R * 0.34, 0.14, 24), mats.barrel, sx * 0.02, [0, 0, Math.PI / 2]);

    // Cùm phanh thể thao sơn đỏ nổi bật ở góc 10h30
    const cal = add(roundBox(0.48, R * 0.68, 0.52, 0.10), mats.caliper, sx * 0.12);
    cal.rotation.set(0, sx * Math.PI / 2, 0); cal.position.y = R * 0.52; cal.position.z = -R * 0.42; cal.rotation.x = 0.68;
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
      pts.push([pz, Math.max(0.3, py)]);
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
    const trk = opts.track || { angle: (rnd() < 0.35 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.7, offset: (rnd() - 0.5) * 12 };
    if (opts.crush) W.track = [Math.cos(trk.angle), Math.sin(trk.angle), trk.offset, opts.crush];
    const env = envCube();
    const plain = (c, r, m, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m, envMap: env, envMapIntensity: 1 }, extra || {}));
    const rimCol = new THREE.Color(0xdde2e8).lerp(new THREE.Color(opts.burnt ? 0x1f1b18 : 0x9aa0a6), opts.burnt ? 0.95 : age * 0.4);   // hợp kim nhôm sáng bóng phay kim cương, xe cũ ngả chút bụi xám
    const mirrorGrime = mirrorGrimeTexture(rnd, age);
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
      tire: plain(opts.burnt ? new THREE.Color(0x1a1715) : new THREE.Color(0xffffff).lerp(new THREE.Color(0xb8a890), age * 0.5), 0.88, 0.02, { map: tireTexture(age), envMapIntensity: opts.burnt ? 0.05 : 0.25 }),   // cao su đen đúc lì cơ học
      rim: plain(rimCol.clone().multiplyScalar(0.78), opts.burnt ? 0.88 : (0.24 + 0.2 * age), opts.burnt ? 0.4 : 0.82, { envMapIntensity: opts.burnt ? 0.15 : 1.15 }),
      lip: plain(new THREE.Color(opts.burnt ? 0x1f1b18 : 0xb8bdc1).lerp(new THREE.Color(0x77736c), age * 0.4), opts.burnt ? 0.85 : 0.32, opts.burnt ? 0.3 : 0.78, { envMapIntensity: opts.burnt ? 0.15 : 0.95 }),
      barrel: plain(opts.burnt ? 0x121212 : 0x181a1d, 0.42, 0.82),
      cap: plain(opts.burnt ? 0x181513 : 0x15171a, 0.18, 0.88, { envMapIntensity: 1.3 }),
      disc: plain(opts.burnt ? new THREE.Color(0x4a362a) : new THREE.Color(0xffffff), opts.burnt ? 0.88 : 0.2, opts.burnt ? 0.4 : 0.92, { map: discTexture(age), envMapIntensity: opts.burnt ? 0.15 : 1.4 }),
      caliper: plain(opts.burnt ? 0x221a18 : 0x7d2420, opts.burnt ? 0.85 : 0.42, opts.burnt ? 0.3 : 0.45, { envMapIntensity: 0.65 }),
      black: plain(0x131518, 0.82, 0.04), wiper: plain(new THREE.Color(0x1a1a1a).lerp(new THREE.Color(0x3a2a20), age * 0.6), 0.48, 0.65), chrome: plain(opts.burnt ? 0x332a22 : 0xd6dce0, opts.burnt ? 0.8 : 0.14, opts.burnt ? 0.3 : 0.92, { envMapIntensity: 1.25 }), mirror: plain(opts.burnt ? 0x221a15 : 0x9eabb0, opts.burnt ? 0.8 : 0.12, opts.burnt ? 0.2 : 0.65, { envMapIntensity: opts.burnt ? 0.2 : 1.25 }),
      mirrorDirt: plain(0x8a7b64, 1, 0, { alphaMap: mirrorGrime, transparent: true, opacity: 0.48 + age * 0.24, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0 }),
      defrost: plain(new THREE.Color(0x6d3928).lerp(new THREE.Color(0x3a3029), age * 0.55), 0.72, 0.18, { envMapIntensity: 0.18 }),
      seat: plain(new THREE.Color(0x2e2b27).lerp(new THREE.Color(0x4a4339), age * 0.5), 0.95, 0, { envMapIntensity: 0.15 }),
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
    const g = new THREE.Group(), car = new THREE.Group(); g.add(car);
    const prep = geo => { geo.setAttribute('aRest', geo.attributes.position.clone()); geo.setAttribute('aCr', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3)); return geo; };
    const bodyGeo = prep(bodyGeometry(S)), cabGeo = prep(cabinGeometry(S));
    const body = new THREE.Mesh(bodyGeo, mats.body), cabin = new THREE.Mesh(cabGeo, mats.cabin);
    for (const m of [body, cabin]) { m.castShadow = true; m.receiveShadow = true; car.add(m); }
    // mặt trong khoang: cột, khung cửa, trần (đặc) — nhìn xuyên kính thấy thành xe bên kia
    const cabIn = new THREE.Mesh(cabGeo, mats.cabinIn); cabIn.receiveShadow = true; car.add(cabIn);
    const top = curve(S.top), plan = curve(S.plan), roof = curve(S.cabin), bot = curve(S.bottom);
    // dò mặt thân xe bằng tia (gắn chi tiết sát bề mặt) — trước khi móp
    const rc = new THREE.Raycaster();
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
      for (const sx of [1, -1]) {
        part(roundBox(3.3, 4.2, 0.95, 0.4), mats.seat, [sx * 2.7, belt + 0.05, -1.4], [-0.2, 0, 0]);
        part(roundBox(1.9, 1.05, 0.6, 0.25), mats.seat, [sx * 2.7, belt + 2.45, -1.95], [-0.15, 0, 0]);
      }
      part(roundBox(2 * (plan(-8.5) - S.inset - 1.3), 3.2, 0.9, 0.4), mats.seat, [0, top(-8.5) - 0.3, S.isPickup ? -5.25 : -8.8], [-0.38, 0, 0]);
      if (S.isSuv && !S.isPickup) {
        part(roundBox(2 * (plan(-13.2) - S.inset - 1.4), 2.8, 0.8, 0.35), mats.seat, [0, top(-13.2) - 0.2, -13.5], [-0.3, 0, 0]);
      }
      part(roundBox(2 * (plan(5.5) - S.inset - 0.6), 1.3, 2.6, 0.45), mats.dash, [0, top(5.5) - 0.05, 5.5], [0.25, 0, 0]);
      const wheelS = part(new THREE.TorusGeometry(0.95, 0.12, 8, 28), mats.dash, [2.7, belt + 1.0, 3.7], [-0.45, 0, 0]);
      part(new THREE.BoxGeometry(1.8, 0.14, 0.1), mats.dash, [0, 0, 0], null, wheelS);
      part(roundBox(1.6, 0.48, 0.18, 0.07), mats.dash, [0, roof(2.7) - 0.75, 2.7], [0.2, 0, 0]);
    }
    car.children.slice(nIn0).forEach(m => m.userData.inner = true);

    // --- GƯƠNG HẬU KHÍ ĐỘNG HỌC (chỉ cho Sedan và SUV, xe tải có cụm gương đôi xe tải chuyên dụng)
    if (!S.isTruck) {
      for (const sx of [1, -1]) {
        const zM = 6.2, yM = top(zM) + 0.75, h = hitAt([sx * 12, yM - 0.45, zM], [-sx, 0, 0]), xs = h ? Math.abs(h.p.x) : plan(zM);
        const grp = new THREE.Group(); grp.position.set(sx * (xs - 0.1), yM - 0.4, zM); car.add(grp); grp.userData.acc = 'mirror';
        // Xe cũ không tự nhiên mất mặt gương; chỉ xe cháy hoặc khung đã bị ép nặng mới có khả năng vỡ/gập gương.
        const broken = !!opts.burnt || ((opts.crush || 0) > 0.58 && rnd() < 0.65);

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
        part(glassGeo, broken ? mats.black : mats.mirror, [0, 0, 0], null, grp);
        if (!broken) {
          const grimeGeo = glassGeo.clone(); grimeGeo.translate(0, 0, -0.008);
          const grime = part(grimeGeo, mats.mirrorDirt, [0, 0, 0], null, grp);
          grime.castShadow = false; grime.renderOrder = 8;
        }

        if (broken) grp.rotation.set(0, sx * 0.5, sx * -0.35);
      }
    }
    // --- TAY NẮM CỬA (cùng màu sơn, lõm tối phía sau)
    for (const sx of [1, -1]) {
      const zDoorHandles = S.isTruck ? [] : (S.isPickup ? [0.7,-5.3] : [0.7,-7.2]);
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
    const txt = String.fromCharCode(65 + (seed * 7) % 26) + ((seed * 37) % 90 + 10) + '-' + String(1000 + (seed * 7919) % 9000);
    const plateTex = plateTexture(txt, age, rnd), plateMat = plain(0xffffff, 0.5, 0.1, { map: plateTex, envMapIntensity: 0.4 });
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
      part(roundBox(3.4, 0.14, 0.12, 0.03), mats.tailGuide, [0, -0.06, -1.06], null, spoiler);
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
      const handleHit = hitAt([0, 6.12, -40], [0, 0, 1]);
      if (handleHit) part(roundBox(1.25, 0.12, 0.1, 0.035), mats.black, [handleHit.p.x, handleHit.p.y, handleHit.p.z - 0.07]);
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
    }
    // --- CỤM ĐÈN / LƯỚI lắp vào lỗ khoét
    if (S.isDump) {
      const cabPaint = new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color(0x9b9589), age * 0.12),
        roughness: 0.35 + age * 0.18,
        metalness: 0.52,
        clearcoat: 0.65,
        clearcoatRoughness: 0.18,
        envMap: env,
        envMapIntensity: 1.15
      });
      const steel = plain(new THREE.Color(0x727d78).lerp(new THREE.Color(0x675c4b), age * 0.3), 0.42, 0.72);
      // Fine paint wear and abrasion stay subordinate to the welded structure.
      const wearCanvas=document.createElement('canvas'); wearCanvas.width=512; wearCanvas.height=256;
      const wx=wearCanvas.getContext('2d'); wx.fillStyle='#e0e3dc';wx.fillRect(0,0,512,256);
      for(let k=0;k<4800;k++) {
        const v=175+Math.floor(rnd()*55);wx.fillStyle='rgba('+v+','+v+','+(v-6)+',0.12)';
        wx.fillRect(rnd()*512,rnd()*256,0.5+rnd()*2,0.5+rnd()*2);
      }
      const grime=wx.createLinearGradient(0,0,0,256);grime.addColorStop(0,'rgba(99,83,58,0.20)');grime.addColorStop(0.25,'rgba(99,83,58,0.02)');grime.addColorStop(1,'rgba(99,83,58,0.08)');
      wx.fillStyle=grime;wx.fillRect(0,0,512,256);
      for(let k=0;k<85;k++) {
        wx.strokeStyle=k%5===0?'rgba(95,68,42,0.17)':'rgba(76,81,73,0.09)';wx.lineWidth=0.35+rnd()*0.5;
        const x=rnd()*512,y=rnd()*256;wx.beginPath();wx.moveTo(x,y);wx.lineTo(x+3+rnd()*22,y+(rnd()-0.5)*3);wx.stroke();
      }
      steel.map=new THREE.CanvasTexture(wearCanvas);steel.map.anisotropy=4;
      const edge = plain(0x424b47, 0.42, 0.68), chassisMat = plain(0x242724, 0.55, 0.58);
      const steelInside = plain(0x65675c, 0.52, 0.65);
      const reflectorMat = plain(0xb0b8b8, 0.18, 0.85, { envMapIntensity: 0.85 });
      const assembly = new THREE.Group(); assembly.userData.acc='dumpBody'; car.add(assembly);
      const add = (geo,mat,pos,rot,parent) => part(geo,mat,pos,rot,parent||assembly);
      const box = (size,mat,pos,rad=0.04,rot,parent) => add(roundBox(...size,rad),mat,pos,rot,parent);
      const rod = (a,b,r,mat,parent) => {
        const av=new THREE.Vector3(...a), bv=new THREE.Vector3(...b), d=bv.clone().sub(av);
        const m=add(new THREE.CylinderGeometry(r,r,d.length(),10),mat,av.add(bv).multiplyScalar(0.5).toArray(),null,parent);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); return m;
      };
      // --- CỤM CẦN GẠT NƯỚC KÍNH CHẮN GIÓ XE BEN (vị trí nghỉ sát chân kính lái, không đổ bóng răng cưa)
      const onCabGlass = (gx, gy, lift = 0.025) => {
        const h = hitAt([gx, gy, 30], [0, 0, -1]);
        return h ? h.p.clone().addScaledVector(h.n, lift) : null;
      };
      const dumpWiperConfigs = [
        // Gạt bên lái: thanh gạt nằm nghỉ sát chân kính bên trái
        { pivX: -3.8, pivY: 11.0, p0: [-5.6, 11.3], p1: [-0.6, 11.45], clipX: -3.1, clipY: 11.37 },
        // Gạt bên phụ: thanh gạt nằm nghỉ sát chân kính bên phải
        { pivX:  1.6, pivY: 11.0, p0: [ 0.6, 11.3], p1: [ 5.6, 11.45], clipX:  3.1, clipY: 11.37 }
      ];
      for (const cfg of dumpWiperConfigs) {
        const wpr = new THREE.Group();
        wpr.userData.acc = 'wiper';
        assembly.add(wpr);

        const bladePts = [], spinePts = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const bx = cfg.p0[0] + (cfg.p1[0] - cfg.p0[0]) * t;
          const by = cfg.p0[1] + (cfg.p1[1] - cfg.p0[1]) * t;
          const pRubber = onCabGlass(bx, by, 0.02);
          const pSpine  = onCabGlass(bx, by, 0.05);
          if (pRubber) bladePts.push(pRubber);
          if (pSpine)  spinePts.push(pSpine);
        }
        if (bladePts.length >= 4) {
          // Lưỡi cao su gạt nước ép sát mép dưới kính chắn gió
          part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bladePts), 16, 0.024, 5, false), mats.black, [0,0,0], null, wpr);
          // Sống nẹp thép chống rỉ
          part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spinePts), 16, 0.032, 6, false), mats.wiper, [0,0,0], null, wpr);
          // Đầu chụp cao su ở hai mút thanh gạt
          part(new THREE.SphereGeometry(0.038, 8, 6), mats.black, bladePts[0].toArray(), null, wpr);
          part(new THREE.SphereGeometry(0.038, 8, 6), mats.black, bladePts[bladePts.length - 1].toArray(), null, wpr);

          // Trục xoay chân gạt nước ở máng xối chân kính
          const piv = onCabGlass(cfg.pivX, cfg.pivY, 0.045);
          const clip = onCabGlass(cfg.clipX, cfg.clipY, 0.055);

          if (piv && clip) {
            // Nắp chụp bảo vệ trục mô tơ
            part(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 12), mats.black, [piv.x, piv.y, piv.z], [Math.PI * 0.48, 0, 0], wpr);
            // Cùm kẹp nối thanh gạt với tay cần
            box([0.2, 0.16, 0.1], mats.black, [clip.x, clip.y, clip.z], 0.02, null, wpr);
            // Cần đòn nối từ trục xoay tới thanh gạt ôm sát chân kính
            const midArm = piv.clone().lerp(clip, 0.5).add(new THREE.Vector3(0, 0.02, 0.015));
            const armCurve = new THREE.CatmullRomCurve3([piv, midArm, clip]);
            part(new THREE.TubeGeometry(armCurve, 10, 0.034, 6, false), mats.wiper, [0,0,0], null, wpr);
          }
        }
        // Tắt đổ bóng cho cụm cần gạt để không tạo vệt bóng đen răng cưa trên mũi xe
        wpr.traverse(o => { if (o.isMesh) o.castShadow = false; });
      }

      // --- TAY VỊN KIM LOẠI LAU KÍNH & BẬC ĐỨNG DẪM CHÂN TRÊN CẢN TRƯỚC
      for (const sx of [-1, 1]) {
        const hx = sx * 4.65;
        // Bát gắn bắt vít cabin ở 2 đầu tay vịn
        box([0.2, 0.2, 0.08], mats.black, [hx, 9.75, 20.65], 0.02);
        box([0.2, 0.2, 0.08], mats.black, [hx, 10.55, 20.62], 0.02);
        // Tay vịn chữ U thép tròn chịu lực cho tài xế bám khi lau kính chắn gió
        rod([hx, 9.75, 20.65], [hx, 9.75, 20.78], 0.042, mats.dark);
        rod([hx, 10.55, 20.62], [hx, 10.55, 20.75], 0.042, mats.dark);
        rod([hx, 9.75, 20.78], [hx, 10.55, 20.75], 0.045, mats.dark);

        // Bậc đứng dẫm chân chống trượt dập gân trên cản trước
        box([1.4, 0.06, 0.65], mats.dark, [hx, 5.18, 20.65], 0.02);
        for (const dz of [-0.18, 0, 0.18]) {
          box([1.25, 0.025, 0.06], mats.lip, [hx, 5.22, 20.65 + dz], 0.01);
        }
      }

      // --- HAI CÁNH HƯỚNG GIÓ KHÍ ĐỘNG HỌC Ở GÓC CABIN (CORNER WIND DEFLECTORS)
      for (const sx of [-1, 1]) {
        const defl = new THREE.Group();
        assembly.add(defl);
        const deflX = sx * 6.55, deflY = 7.9, deflZ = 20.35;
        // Cánh hướng gió màu thân xe hơi vát góc ra phía ngoài
        box([0.72, 3.2, 0.14], cabPaint, [deflX, deflY, deflZ], 0.05, [0, -sx * 0.18, 0], defl);
        // Khe thoát gió sâu màu đen phía trong cabin
        box([0.28, 2.9, 0.22], mats.black, [deflX - sx * 0.35, deflY, deflZ - 0.08], 0.04, [0, -sx * 0.18, 0], defl);
        // Nẹp gân viền khí động học bên ngoài
        box([0.08, 3.15, 0.16], mats.dark, [deflX + sx * 0.38, deflY, deflZ + 0.02], 0.02, [0, -sx * 0.18, 0], defl);
      }

      // --- MẶT CA-LĂNG & LƯỚI TẢN NHIỆT XE BEN HẦM HỐ 2 TẦNG
      // Tầng trên: Nắp ca-pô dịch vụ cabin có gân dập cơ bắp và biểu tượng huy hiệu xe tải nặng
      box([12.6, 0.05, 0.04], mats.dark, [0, 8.6, 20.61], 0.01);
      // Hai đường gân dập nổi vát chữ V mở rộng lên trên nắp ca-pô
      for (const sx of [-1, 1]) {
        box([0.16, 1.85, 0.06], cabPaint, [sx * 3.75, 9.6, 20.64], 0.02, [0, 0, -sx * 0.08]);
        // Ổ khoá chốt lẫy cơ khí âm hai bên nắp ca-pô
        box([0.32, 0.22, 0.05], mats.dark, [sx * 5.65, 9.05, 20.64], 0.02);
        box([0.16, 0.08, 0.06], mats.chrome, [sx * 5.65, 9.05, 20.67], 0.01);
      }
      // Biểu tượng huy hiệu mạ crôm dập nổi ở chính giữa nắp ca-pô dịch vụ
      box([0.95, 0.75, 0.07], mats.chrome, [0, 9.5, 20.66], 0.04);
      box([0.65, 0.45, 0.08], mats.black, [0, 9.5, 20.68], 0.03);

      // Tầng dưới: Hốc lưới tản nhiệt chính to bản giữa hai cụm đèn pha
      // Hốc lòng sâu màu đen bảo vệ két làm mát động cơ
      box([8.3, 2.7, 0.28], mats.black, [0, 6.95, 20.45], 0.08);
      // Tấm lưới tổ ong / lưới thép đan dày bảo vệ két tản nhiệt
      box([8.1, 2.5, 0.06], mats.dark, [0, 6.95, 20.35], 0.02);
      // 4 nan tản nhiệt ngang lớn vát nghiêng hút gió mạnh mẽ
      const grilleYList = [5.95, 6.6, 7.25, 7.9];
      for (let gi = 0; gi < grilleYList.length; gi++) {
        const gy = grilleYList[gi];
        // Thân nan tản nhiệt to bản dày dặn
        box([8.15, 0.28, 0.24], mats.dark, [0, gy, 20.58], 0.04);
        // Gờ nẹp mặt ngoài của nan tản nhiệt
        box([8.1, 0.12, 0.26], gi === 2 ? mats.chrome : cabPaint, [0, gy, 20.66], 0.03);
      }

      // --- CỤM ĐÈN PHA XE CÔNG TRÌNH VỚI LƯỚI BẢO VỆ CHỐNG ĐÁ VĂNG
      for (const sx of [-1, 1]) {
        const x = sx * 5.35, y = 6.85, z = 20.55;
        const lamp = new THREE.Group(); lamp.userData.acc = 'headlight'; assembly.add(lamp);
        box([2.45, 1.83, 0.24], mats.black, [x, y, z], 0.1, null, lamp);
        box([2.2, 1.58, 0.1], mats.barrel, [x, y, z + 0.12], 0.065, null, lamp);
        for (const dx of [-0.5, 0.45]) {
          add(new THREE.CylinderGeometry(0.52, 0.4, 0.16, 24), reflectorMat, [x + dx, y, z + 0.15], [Math.PI/2, 0, 0], lamp);
          add(new THREE.SphereGeometry(0.1, 10, 8), mats.chrome, [x + dx, y, z + 0.25], null, lamp);
        }
        const lens = new THREE.MeshPhysicalMaterial({
          color: 0xc4d0cf, roughness: 0.19, metalness: 0,
          transparent: true, opacity: 0.23, clearcoat: 0.6, envMap: env, envMapIntensity: 0.45, depthWrite: false
        });
        box([2.18, 1.52, 0.04], lens, [x, y, z + 0.34], 0.07, null, lamp);
        for (let dx = -0.9; dx <= 0.9; dx += 0.18) box([0.018, 1.35, 0.025], lens, [x + dx, y, z + 0.37], 0.005, null, lamp);
        box([0.38, 1.55, 0.12], mats.tailAmber, [x + sx * 0.94, y, z + 0.27], 0.055, null, lamp);

        // Thanh nan kim loại bảo vệ đèn pha chống sỏi đá văng công trường
        for (const dy of [-0.48, 0.48]) {
          box([2.35, 0.05, 0.06], mats.black, [x, y + dy, z + 0.4], 0.015, null, lamp);
        }
      }

      
      // --- CỤM ĐỘNG CƠ DIESEL V8 & DẦM SẮT-XI CHỊU LỰC DÀY DẶN TRONG KHOANG MÁY
      const engGrp = new THREE.Group(); engGrp.userData.acc = 'engine'; engGrp.userData.structural = true; assembly.add(engGrp);
      const castIron = plain(0x222426, 0.75, 0.45);
      // Khối lốc máy gang đúc to bản chắc nịch
      box([5.4, 3.8, 8.2], castIron, [0, 5.2, 14.5], 0.25, null, engGrp);
      // Hai nắp quy-lát đỉnh máy V8 chữ V
      for (const sx of [-1, 1]) {
        box([2.2, 1.1, 7.6], mats.dark, [sx * 1.8, 7.3, 14.5], 0.15, [0, 0, sx * 0.2], engGrp);
        // Cổ góp xả kim loại dày
        box([0.7, 1.0, 6.8], plain(0x4a433d, 0.7, 0.6), [sx * 2.9, 5.8, 14.5], 0.1, null, engGrp);
      }
      // Két làm mát tản nhiệt dày phía trước máy
      box([6.8, 4.2, 0.8], plain(0x1c1e20, 0.9, 0.5), [0, 6.0, 19.4], 0.1, null, engGrp);
      // Quạt gió tản nhiệt
      add(new THREE.CylinderGeometry(1.6, 1.6, 0.35, 16), mats.black, [0, 6.0, 18.7], [Math.PI / 2, 0, 0], engGrp);
      // Dầm sắt-xi đôi bằng thép chữ U dày chạy xuyên suốt khoang máy
      for (const sx of [-1, 1]) {
        box([1.1, 2.2, 14.0], chassisMat, [sx * 3.8, 4.2, 14.0], 0.12, null, engGrp);
      }

      // --- CẢN TRƯỚC HẠNG NẶNG, MÓC KÉO CỨU HỘ & BIỂN SỐ
      (() => { const bmp = box([14.45, 1.0, 0.9], cabPaint, [0, 4.65, 20.4], 0.18); bmp.userData.acc = 'bumper'; return bmp; })();
      box([13.7, 0.27, 0.55], chassisMat, [0, 4.0, 20.25], 0.06);
      for (const sx of [-1, 1]) {
        box([1.8, 0.55, 0.12], mats.dark, [sx * 5.4, 4.7, 20.9], 0.07);
        box([1.1, 0.38, 0.06], mats.chrome, [sx * 5.4, 4.7, 20.99], 0.04);
        box([1.4, 0.52, 0.2], mats.dark, [sx * 2.65, 4.65, 20.91], 0.05);
      }
      // Khung biển số trước
      box([3.9, 1.0, 0.09], mats.black, [0, 4.8, 20.96], 0.04);
      add(new THREE.PlaneGeometry(3.6, 0.82), plateMat, [0, 4.8, 21.02]);
      // Cùm móc kéo cứu hộ hạng nặng ở giữa cản trước
      box([0.55, 0.42, 0.36], steel, [0, 4.12, 20.95], 0.06);
      rod([0, 4.12, 20.82], [0, 4.12, 21.15], 0.06, mats.dark);
      const curveBottom=curve(S.bottom);
      // Slim mirror arms, door hardware, access steps and wheel-arch trim.
      for (const sx of [-1,1]) {
        rod([sx*7.05,12.0,18.5],[sx*8.6,11.65,18.85],0.085,mats.black);
        rod([sx*8.6,11.65,18.85],[sx*8.6,14.2,18.7],0.085,mats.black);
        box([0.82,2.15,0.4],mats.black,[sx*8.7,13.5,18.7],0.16);
        box([0.66,1.9,0.04],mats.mirror,[sx*8.7,13.5,18.46],0.1);

        for(const y of [3.15,4.25]) {
          box([1.15,0.17,2.0],chassisMat,[sx*6.9,y,8.0],0.04);
          for(const z of [7.4,7.8,8.2,8.6]) box([0.9,0.045,0.07],mats.lip,[sx*6.95,y+0.1,z],0.01);
        }
        // Cụm vòm cua lốp bánh trước xe ben đúc dày dặn, tròn trịa đồng tâm 100% với bánh xe
        const rIn = S.r + S.archGap; // 3.75 bán kính trong ôm sát lốp
        const rOut = rIn + 0.38;     // 4.13 bán kính ngoài vòm cua lốp
        const fW = 0.52;             // độ dày nhô ra ngoài sườn xe
        const fProf = new THREE.Shape();
        fProf.absarc(0, 0, rOut, 0, Math.PI, false);
        fProf.lineTo(-rIn, 0);
        fProf.absarc(0, 0, rIn, Math.PI, 0, true);
        fProf.closePath();
        const fGeo = new THREE.ExtrudeGeometry(fProf, {
          depth: fW,
          bevelEnabled: true,
          bevelSegments: 4,
          steps: 1,
          bevelSize: 0.05,
          bevelThickness: 0.05,
          curveSegments: 56
        });
        const xPos = sx > 0 ? (sx * 7.46 - fW) : (sx * 7.46);
        const archMesh = add(fGeo, mats.black, [xPos, S.r, S.axleF], [0, Math.PI / 2, 0]);
        archMesh.userData.acc = 'fender';

        // Gờ viền bo tròn mép ngoài của vòm cua lốp
        const lipTorus = add(new THREE.TorusGeometry(rOut, 0.09, 8, 48, Math.PI), mats.black, [sx * 7.48, S.r, S.axleF], [0, Math.PI / 2, 0]);
        lipTorus.userData.acc = 'fender';
        // Gờ viền mép trong lòng vòm sát lốp xe
        const inTorus = add(new THREE.TorusGeometry(rIn, 0.08, 8, 48, Math.PI), mats.black, [sx * 7.18, S.r, S.axleF], [0, Math.PI / 2, 0]);
        inTorus.userData.acc = 'fender';

        // Vị trí bề mặt thân xe để đặt phụ kiện
        const surface = (z,y,lift=0.024) => {
          const h=hitAt([sx*12,y,z],[-sx,0,0]);
          return h ? h.p.addScaledVector(h.n,lift) : null;
        };
        // Cụm tay nắm cửa cơ khí xe ben chuyên dụng: hốc lõm móc tay, cần gạt ngang và ổ khóa
        const hp=surface(8.9,10.35,0.035);
        if(hp) {
          const grip=new THREE.Group();grip.userData.acc='doorHandle';grip.position.copy(hp);assembly.add(grip);
          // Hốc nhựa đen bảo vệ lõm vào cánh cửa
          box([0.09,0.72,1.8],mats.black,[0,0,0],0.08,null,grip);
          box([0.05,0.52,1.52],mats.dark,[-sx*0.025,0,0],0.05,null,grip);
          // Tay gạt cơ khí chắc chắn để người lái luồn tay móc mở
          box([0.14,0.26,1.2],mats.black,[sx*0.06,0.1,0.08],0.035,null,grip);
          // Ổ khóa cơ kim loại tròn sắc nét
          add(new THREE.CylinderGeometry(0.08,0.08,0.1,12),mats.chrome,[sx*0.04,-0.12,-0.55],[0,0,Math.PI/2],grip);
          box([0.02,0.07,0.025],mats.black,[sx*0.1,-0.12,-0.55],0.005,null,grip);
        }
        // A cab entry step is attached by brackets, not suspended beside the wheel.
        for(const z of [7.4,8.6])rod([sx*5.95,4.7,z],[sx*6.85,3.1,z],0.09,chassisMat);
        const sideLamp=surface(18.85,9.55,0.035);
        if(sideLamp) {
          box([0.085,0.34,0.68],mats.black,sideLamp.toArray(),0.035);
          box([0.095,0.22,0.52],mats.tailAmber,[sideLamp.x+sx*0.045,sideLamp.y,sideLamp.z],0.035);
        }
      }
      // Chassis and a slightly wider, open steel dump tub.
      // Frame rails sit inboard of the twin rear tyres; the leaf packs hang under the rails.
      const railX=3.05, tubZ0=-20.25, tubZ1=5.9, tubL=tubZ1-tubZ0, tubC=(tubZ0+tubZ1)/2;
      for (const sx of [-1,1]) {
        box([0.65,1.1,37],chassisMat,[sx*railX,4.8,-0.5]);
        box([0.45,0.6,tubL],edge,[sx*railX,6.3,tubC]);
        for(let k=0;k<4;k++)box([0.62,0.12,6.8-k*0.85],chassisMat,[sx*railX,4.1-k*0.14,S.axleR]);
        for(const dz of [-3.3,3.3])box([0.5,0.75,0.5],chassisMat,[sx*railX,3.9,S.axleR+dz],0.06);
      }
      const tub=new THREE.Group();tub.userData.acc='dumpBed';assembly.add(tub);

      // Vật liệu thép chịu mài mòn cho lòng thùng xe ben: cào xước kim loại, tróc sơn lộ thép và rỉ sét
      const bedSteelMat = new THREE.MeshStandardMaterial({
        map: dumpBedWearTexture(rnd, age),
        roughness: 0.38 + age * 0.18,
        metalness: 0.75 - age * 0.15,
        envMap: env,
        envMapIntensity: 1.15
      });

      // --- SÀN THÙNG XE BEN CONG LÕM 3D LIỀN KHỐI (DENTED & WARPED BED FLOOR) ---
      // Độ cao sàn ben đặt ở y = 7.36m, cách xa toàn bộ cụm gầm xe và bánh xe, triệt tiêu 100% xuyên thấu (clipping)
      const floorH = 7.36;
      const floorGeo = new THREE.PlaneGeometry(13.9, tubL, 28, 52);
      floorGeo.rotateX(-Math.PI / 2);
      const fPos = floorGeo.attributes.position;

      // Danh sách các hố lõm dập móp do tảng đá hộc lớn rơi từ máy xúc xuống sàn thép
      const dents = [];
      for (let i = 0; i < 18; i++) {
        dents.push({
          x: (rnd() - 0.5) * 11.2,
          z: tubC + (rnd() - 0.5) * (tubL - 3.2),
          r: 1.0 + rnd() * 2.2,
          depth: 0.10 + rnd() * 0.18
        });
      }
      for (let i = 0; i < fPos.count; i++) {
        const x = fPos.getX(i), z = fPos.getZ(i);
        // 1. Độ võng lòng máng tích tụ tải trọng hàng chục tấn đất đá sỏi
        const normX = x / 6.95, normZ = (z - tubC) / (tubL * 0.5);
        let dy = -0.09 * Math.max(0, 1.0 - normX * normX) * Math.max(0, 1.0 - normZ * normZ);
        // 2. Các vết móp lõm va đập đá hộc rải rác
        for (const d of dents) {
          const dist = Math.hypot(x - d.x, z - d.z);
          if (dist < d.r) {
            const t = dist / d.r;
            dy -= d.depth * Math.cos(t * Math.PI * 0.5) * Math.cos(t * Math.PI * 0.5);
          }
        }
        // 3. Gân dập sóng gia cường chịu lực chữ V chìm dọc sàn xe ben công trình
        const ribWave = Math.sin(x * 1.8) * 0.035;
        dy += ribWave * Math.max(0, 1.0 - normX * normX);

        fPos.setY(i, floorH + dy);
      }
      floorGeo.computeVertexNormals();
      add(floorGeo, bedSteelMat, [0, 0, 0], null, tub);

      // Tấm đỡ dầm dưới sàn ben (độ cao y = 7.18, hoàn toàn nằm dưới mặt sàn và trên gầm xe)
      box([13.9, 0.16, tubL], chassisMat, [0, 7.18, tubC], 0.035, null, tub);

      // Mặt trong vách thùng xe ben áp dụng chất liệu thép mài xước đồng bộ
      for (const sx of [-1, 1]) {
        box([0.08, 4.05, tubL - 0.1], bedSteelMat, [sx * 7.05, 9.42, tubC], 0.02, [0, 0, -sx * 0.045], tub);
      }
      box([13.85, 4.10, 0.08], bedSteelMat, [0, 9.42, tubZ1 - 0.08], 0.02, null, tub);
      box([13.75, 3.85, 0.08], bedSteelMat, [0, 9.42, -20.25 + 0.08], 0.02, null, tub);
      // Folded top rails and channel-section stiffeners have thickness, flanges and shadow gaps.
      for(const sx of [-1,1]) {
        box([0.21,4.25,tubL+0.05],steel,[sx*7.13,9.25,tubC],0.035,[0,0,-sx*0.045],tub);
        box([0.44,0.26,tubL+0.3],edge,[sx*7.23,11.47,tubC],0.04,null,tub);
        box([0.36,0.43,tubL+0.2],edge,[sx*7.03,7.2,tubC],0.03,null,tub);
        for(const z of [-19.5,-15.0,-10.5,-6.0,-1.5,3.0]) {
          box([0.3,3.92,0.17],edge,[sx*7.3,9.3,z],0.025,[0,0,-sx*0.045],tub);
          for(const dz of [-0.22,0.22])box([0.12,3.92,0.08],steel,[sx*7.43,9.3,z+dz],0.015,[0,0,-sx*0.045],tub);
        }
        for(const z of [-17,-8.5,0])box([0.045,0.2,0.8],mats.tailAmber,[sx*7.45,7.55,z],0.02,null,tub);
        // Top-hinged rear gate, lower locks and body pivot pins.
        rod([sx*6.8,11.1,-20.3],[sx*7.55,11.1,-20.3],0.18,mats.lip,tub);
        box([0.25,0.9,0.35],edge,[sx*6.8,7.6,-20.55],0.04,null,tub);
        rod([sx*(railX-0.35),6.7,-18.9],[sx*(railX+0.5),6.7,-18.9],0.24,mats.lip);
        // Mud flap and fender span the whole twin-tyre pair.
        const D=S.dualR, pairC=D.x-(D.tireW+D.gap)/2, pairW=2*D.tireW+D.gap+0.45;
        // Chắn bùn cao su dày sau cụm bánh đôi có nẹp thép chân mép dưới
        box([pairW, 3.2, 0.12], mats.black, [sx*pairC, 2.15, -13.6], 0.04);
        box([pairW, 0.28, 0.18], edge, [sx*pairC, 0.65, -13.6], 0.03);
        rod([sx*railX, 5.2, -13.25], [sx*(pairC+pairW/2-0.3), 5.2, -13.25], 0.08, chassisMat);
        for(const z of [S.axleR]) {
          // Vòm chắn bùn sau nằm gọn dưới gầm sắt-xi, không đâm xuyên lên mặt sàn thùng ben
          const r = S.r + 0.32, profile = new THREE.Shape();
          profile.absarc(0, 0, r, 0, Math.PI, false);
          profile.lineTo(-r + 0.12, 0);
          profile.absarc(0, 0, r - 0.12, Math.PI, 0, true); profile.closePath();
          const fg = new THREE.ExtrudeGeometry(profile, { depth: pairW, bevelEnabled: false, curveSegments: 32 });
          add(fg, chassisMat, [sx * pairC - pairW / 2, S.r - 0.15, z], [0, Math.PI / 2, 0]);
        }
      }
      // Headboard stands a hand's width behind the cab; the guard reaches forward over the roof.
      box([14.2,4.38,0.24],steel,[0,9.25,tubZ1],0.045,null,tub);
      box([14.2,5.5,0.18],steel,[0,14.2,tubZ1+0.02],0.035,null,tub);
      for(const x of [-4.5,0,4.5])box([0.22,5.45,0.26],edge,[x,14.2,tubZ1-0.13],0.025,null,tub);
      for(const x of [-4.4,0,4.4])box([0.25,4.25,0.35],edge,[x,9.3,tubZ1+0.15],0.025,null,tub);
      // Continuous cab guard with triangulated supports, rather than a floating shelf.
      const guardZ1=tubZ1+4.4;
      box([14.5,0.2,guardZ1-tubZ1],steel,[0,17.3,(tubZ1+guardZ1)/2],0.05,null,tub);
      box([14.5,0.45,0.17],edge,[0,17.45,guardZ1],0.035,null,tub);
      for(const x of [-4.5,0,4.5])box([0.18,0.3,guardZ1-tubZ1],edge,[x,17.15,(tubZ1+guardZ1)/2],0.025,null,tub);
      for(const sx of [-1,1]) {
        box([0.28,6.0,0.4],edge,[sx*6.9,14.3,tubZ1+0.03],0.03,null,tub);
        box([0.3,0.35,guardZ1-tubZ1],edge,[sx*7.1,17.2,(tubZ1+guardZ1)/2],0.03,null,tub);
        rod([sx*6.9,14.6,tubZ1+0.1],[sx*6.9,17.1,tubZ1+2.6],0.12,edge,tub);
      }
      box([13.95,4.05,0.22],steel,[0,9.25,-20.35],0.035,null,tub);
      for(const x of [-5.5,-2.75,0,2.75,5.5])box([0.25,3.9,0.26],edge,[x,9.25,-20.55],0.025,null,tub);
      for(const y of [7.27,11.35])box([14.3,0.25,0.35],edge,[0,y,-20.5],0.03,null,tub);
      for(const z of [-18,-12,-6,0])box([8.6,0.38,0.4],edge,[0,6.65,z]);

      // --- HỆ THỐNG GẦM XE TẢI NẶNG: Cầu sau vi sai, trục các-đăng, nhíp lá, bình khí nén, rào bảo vệ ---
      // 1. Quả cầu vi sai to bản ở giữa cầu sau (Rear Axle Differential Pumpkin)
      add(new THREE.SphereGeometry(1.05, 18, 14), chassisMat, [0, 3.35, S.axleR]);
      box([0.72, 0.72, 0.18], edge, [0, 3.35, S.axleR - 0.95], 0.05);
      // Vỏ dầm cầu sau đúc dày nối liền ra 2 cụm bánh sau
      rod([-5.6, 3.35, S.axleR], [5.6, 3.35, S.axleR], 0.28, chassisMat);
      // Bầu phanh hơi lốc-kê khí nén ở hai bên gần bánh sau
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.38, 0.38, 0.65, 14), mats.black, [sx * 4.4, 3.45, S.axleR + 0.8], [Math.PI / 2, 0, 0]);
        rod([sx * 4.4, 3.45, S.axleR + 0.5], [sx * 4.4, 3.45, S.axleR], 0.08, edge);
      }

      // 2. Bộ nhíp lá chịu tải nặng nhiều tầng hình cánh cung dưới dầm sắt-xi
      for (const sx of [-1, 1]) {
        const nx = sx * railX;
        box([0.65, 0.14, 7.6], chassisMat, [nx, 3.9, S.axleR], 0.03);
        box([0.65, 0.14, 6.2], chassisMat, [nx, 3.76, S.axleR], 0.03);
        box([0.65, 0.14, 4.8], chassisMat, [nx, 3.62, S.axleR], 0.03);
        box([0.65, 0.14, 3.4], chassisMat, [nx, 3.48, S.axleR], 0.03);
        // Cùm quang nhíp chữ U kẹp chặt nhíp vào cầu
        for (const dz of [-0.65, 0.65]) box([0.72, 0.85, 0.12], edge, [nx, 3.65, S.axleR + dz], 0.03);
        // Tai bắt nhíp đúc trên dầm sắt-xi
        box([0.45, 0.9, 0.6], edge, [nx, 4.3, S.axleR - 3.6], 0.06);
        box([0.45, 0.9, 0.6], edge, [nx, 4.3, S.axleR + 3.6], 0.06);
      }

      // 3. Trục các-đăng truyền lực từ động cơ tới cầu sau
      rod([0, 4.4, 4.0], [0, 3.8, -3.0], 0.18, chassisMat);
      rod([0, 3.8, -3.0], [0, 3.35, S.axleR + 0.8], 0.18, chassisMat);
      box([0.7, 0.9, 0.25], edge, [0, 4.1, -3.0], 0.05); // ổ đỡ treo trục trung gian

      // 4. Cụm bình khí nén đôi phanh hơi xe tải (sườn bên phụ x > 0)
      for (const y of [3.2, 4.0]) {
        add(new THREE.CylinderGeometry(0.32, 0.32, 3.2, 16), mats.black, [4.8, y, -2.6], [Math.PI / 2, 0, 0]);
        for (const z of [-3.8, -1.4]) box([0.65, 0.12, 0.15], edge, [4.8, y, z], 0.03);
      }

      // 5. Bình ắc quy và hộp dụng cụ đồ nghề sườn bên phụ
      box([2.8, 1.4, 3.2], chassisMat, [5.1, 4.8, 1.4], 0.08);
      box([2.9, 0.22, 3.3], mats.black, [5.1, 5.5, 1.4], 0.05);

      // 6. Bình dầu nhiên liệu diesel dày dặn sườn bên lái (x < 0)
      box([3.8, 2.0, 4.8], chassisMat, [-5.4, 4.5, 1.2], 0.28);
      for(const z of [-0.4, 2.8]) box([3.9, 2.05, 0.18], edge, [-5.4, 4.5, z], 0.06);
      add(new THREE.CylinderGeometry(0.24, 0.28, 0.16, 16), mats.barrel, [-5.8, 5.58, 1.7]);
      box([0.4, 0.07, 0.1], mats.lip, [-5.8, 5.67, 1.7], 0.025);

      // 7. Rào bảo vệ chống lọt an toàn hai bên sườn gầm xe (Side Underrun Guards)
      for (const sx of [-1, 1]) {
        box([0.1, 0.24, 10.2], edge, [sx * 6.85, 2.5, -0.6], 0.03);
        box([0.1, 0.24, 10.2], edge, [sx * 6.85, 3.25, -0.6], 0.03);
        for (const z of [3.6, -0.6, -4.8]) {
          rod([sx * railX, 4.6, z], [sx * 6.8, 3.2, z], 0.07, chassisMat);
          rod([sx * 6.8, 3.2, z], [sx * 6.8, 2.4, z], 0.07, chassisMat);
        }
      }

      // 8. Bầu giảm thanh và ống xả gầm cabin
      add(new THREE.CylinderGeometry(0.42, 0.42, 2.8, 16), chassisMat, [-railX + 0.4, 3.65, 3.0], [Math.PI / 2, 0, 0]);
      rod([-railX + 0.4, 3.65, 1.5], [-5.8, 3.3, 1.2], 0.12, chassisMat);

      // 9. Tháp ty ben nâng thủy lực và xà ngang chữ A (nằm gọn dưới đáy gầm sàn ben, không đâm xuyên sàn)
      const ramBase=new THREE.Vector3(0,4.6,-5), ramTop=new THREE.Vector3(0,6.45,1.8);
      const ramAt=t=>ramBase.clone().lerp(ramTop,t).toArray();
      rod(ramAt(0),ramAt(0.62),0.44,chassisMat);
      rod(ramAt(0.52),ramAt(1),0.22,mats.chrome);
      rod([-1,4.6,-5],[1,4.6,-5],0.20,edge);
      rod([-1,6.45,1.8],[1,6.45,1.8],0.20,edge);
      for(const [y,z] of [[4.6,-5],[6.45,1.8]])for(const sx of [-1,1])
        box([0.18,0.48,0.6],edge,[sx*0.9,y,z],0.05);
      const hose=new THREE.CatmullRomCurve3([new THREE.Vector3(0.5,4.5,-3),new THREE.Vector3(0.9,4.0,-1),new THREE.Vector3(0.7,5.4,0.2)]);
      add(new THREE.TubeGeometry(hose,14,0.065,6,false),mats.black,[0,0,0]);

      // --- CỤM ĐUÔI XE BEN: Cản sau chống va đập, dải phản quang, lồng đèn bảo vệ, bản lề lật ben, móc kéo ---
      // Khóa bản lề lật bửng sau
      for(const sx of [-1,1]) {
        for(const y of [10.82,11.35])box([0.32,0.22,0.5],edge,[sx*7.04,y,-20.28],0.035,null,tub);
        rod([sx*6.7,7.45,-20.7],[sx*6.7,8.15,-20.7],0.085,chassisMat,tub);
        box([0.45,0.18,0.16],mats.lip,[sx*6.7,7.55,-20.8],0.035,null,tub);
      }
      // Gối đỡ bản lề lật thùng ben hạng nặng (Heavy Dump Pivot Hinges) gắn đuôi sắt xi
      for(const sx of [-1,1]) {
        box([0.55, 1.25, 1.1], edge, [sx * railX, 5.65, -20.35], 0.08);
        box([0.35, 1.4, 0.8], edge, [sx * (railX + 0.45), 6.4, -20.35], 0.06, null, tub);
      }
      rod([-railX - 0.7, 6.2, -20.35], [railX + 0.7, 6.2, -20.35], 0.18, mats.chrome);

      // Dầm cản sau hạng nặng có thanh chống xiên tam giác chịu lực
      box([14.2, 0.9, 0.7], chassisMat, [0, 3.25, -20.65], 0.08);
      for(const sx of [-1,1]) rod([sx * railX, 4.8, -18.6], [sx * railX, 3.3, -20.5], 0.12, chassisMat);

      // Dải decal phản quang an toàn giao thông sọc vàng - đỏ đan xen trên cản sau
      for (let i = -7; i <= 7; i++) {
        const col = (Math.abs(i) % 2 === 0) ? mats.tailAmber : mats.tailBrake;
        box([0.84, 0.62, 0.03], col, [i * 0.94, 3.25, -21.02], 0.02);
      }

      // Cụm đèn hậu 3 khoang đặt trong lồng khung thép bảo vệ chống đá văng
      for(const sx of [-1,1]) {
        const lx = sx * 5.1, ly = 4.65, lz = -20.62;
        box([2.8, 1.1, 0.35], mats.black, [lx, ly, lz], 0.08);
        for(const [dx,mat] of [[-0.82, mats.tailReverse], [0, mats.tailAmber], [0.82, mats.tailBrake]])
          box([0.72, 0.85, 0.08], mat, [lx + dx, ly, lz - 0.18], 0.04);
        // Nan sắt bảo vệ mặt đèn chống nứt vỡ
        box([2.85, 0.06, 0.18], edge, [lx, ly + 0.28, lz - 0.24], 0.02);
        box([2.85, 0.06, 0.18], edge, [lx, ly - 0.28, lz - 0.24], 0.02);
        box([0.06, 1.15, 0.18], edge, [lx, ly, lz - 0.24], 0.02);
      }

      // Biển số xe và hộp đèn soi biển số ban đêm (đặt ngay ngắn trên dầm đuôi, hoàn toàn thông thoáng)
      box([3.8, 1.05, 0.08], mats.black, [0, 4.75, -20.62], 0.035);
      add(new THREE.PlaneGeometry(3.5, 0.85), plateMat, [0, 4.75, -20.67], [0, Math.PI, 0]);
      box([1.6, 0.16, 0.22], edge, [0, 5.35, -20.62], 0.03);

      // Cùm móc kéo cứu hộ / rơ-moóc hạng nặng gắn chắc chắn ở dầm cản dưới (hoàn toàn tách biệt, không chạm vào biển số)
      box([1.2, 0.75, 0.32], edge, [0, 2.7, -20.95], 0.05);
      add(new THREE.TorusGeometry(0.38, 0.12, 10, 20, Math.PI * 1.5), chassisMat, [0, 2.7, -21.22], [0, 0, -Math.PI / 4]);
      rod([0, 2.5, -20.8], [0, 2.9, -20.8], 0.08, mats.chrome);

      // Vết cào xước kim loại trong lòng thùng chở đá
      for(let k=0;k<32;k++) {
        const x=-6.6+rnd()*13.2, z=-19.6+rnd()*22.5;
        box([0.018+rnd()*0.025,0.012,0.4+rnd()*2.4],edge,[x,7.17,z],0.003,null,tub);
      }
    }
    const feat = new THREE.Group(); car.add(feat);
    const M = {
      wall: plain(0x0e1013, 0.35, 0.1, { side: THREE.DoubleSide }),
      reflector: plain(0x101216, 0.22, 0.35, { side: THREE.DoubleSide }),
      bulb: plain(0xf8fafc, 0.2, 0.1, { emissive: 0x444444 }),
      tailBack: plain(0x3f0909, 0.48, 0.45, { side: THREE.DoubleSide }),
      chrome: mats.chrome,
      slat: plain(0x161616, 0.55, 0.25),
      projLens: new THREE.MeshPhysicalMaterial({ color: 0xd6effc, roughness: 0.02, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, transmission: 0.52, opacity: 0.95, transparent: true, envMap: env, envMapIntensity: 2.4 }),
      drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x484848, roughness: 0.25, envMap: env, envMapIntensity: 0.8 }),
      headLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xffffff).lerp(new THREE.Color(0xe6dcc4), age * 0.6), vertexColors: true, transparent: true, opacity: 0.32 + 0.22 * age, roughness: 0.03 + 0.25 * age, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.03 + 0.2 * age, envMap: env, envMapIntensity: 2.0, depthWrite: false }),
      fogLens: new THREE.MeshPhysicalMaterial({ color: 0xb8c0c2, roughness: 0.18 + age * 0.25, metalness: 0.05, clearcoat: 0.7, envMap: env, envMapIntensity: 0.65 }),
      chromeIn: plain(0xd4d8dc, 0.10 + 0.2 * age, 0.92, { side: THREE.DoubleSide }),
      tailGuide: new THREE.MeshStandardMaterial({ color: 0x681010, emissive: 0x090000, roughness: 0.56 }),
      tailBrake: plain(0x8b0808, 0.34, 0.18, { emissive: 0x120000 }),
      tailAmber: plain(0xdd6808, 0.25, 0.15, { emissive: 0x241000 }),
      tailReverse: plain(0xc7c4b9, 0.24, 0.08, { envMapIntensity: 0.55 }),
      tailLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xd8d2cc).lerp(new THREE.Color(0x8a8078), age * 0.4), vertexColors: true, transparent: true, opacity: 0.52, roughness: 0.16 + 0.28 * age, metalness: 0, clearcoat: 0.68, clearcoatRoughness: 0.14 + 0.25 * age, envMap: env, envMapIntensity: 0.7, depthWrite: false }),
      honey: plain(0x0c0c0c, 0.7, 0.1, { map: honeyTexture(), alphaTest: 0.5, side: THREE.DoubleSide })
    };
    for (const k in S.features) { const F = S.features[k]; if (F.sym) buildFeature(F, 1, body, M, age, feat); else for (const sx of [1, -1]) buildFeature(F, sx, body, M, age, feat); }
    // --- LÒNG HỐC BÁNH KÍN & SÀN GẦM XE: vòm nhựa ôm sát mép vỏ ngoài, vách ngăn đứng bịt kín bên trong, sàn gầm che kín bụng xe
    const wInner = Math.max(3.6, S.trackHalf - 1.95);
    const wellMat = plain(0x0a0b0d, 0.96, 0.02, { side: THREE.DoubleSide });
    for (const az of [S.axleF, S.axleR]) {
      for (const sx of [1, -1]) {
        const well = part(wheelWellGeometry(S, az, sx), wellMat, [0, 0, 0]);
        well.castShadow = false;
        well.userData.well = true;
      }
    }
    const underbody = part(underbodyGeometry(S, wInner), wellMat, [0, 0, 0]);
    underbody.castShadow = false;
    underbody.userData.well = true;

    // Thân vỏ xe dân sự nguyên vẹn giữ bề mặt phẳng mịn, căng mọng, phản chiếu ánh sáng sắc nét;
    // các biến dạng móp méo chỉ xảy ra khi chịu va chạm vật lý thực tế (bị bắn hoặc bị xe tăng cán)


    // --- KHUNG GẦM nhìn thấy qua hốc bánh / dưới gầm: cầu trước / sau, giảm xóc, bình xăng, ống xả chạy dọc gầm
    {
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
        if (r[1] > gUnd[k]) { gUnd[k] = r[1]; gPx[k] = r[2]; gPz[k] = r[3]; gAl[k] = r[4]; }
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
      if (sumW < 1e-4) return 1e3;
      const avg = (w00 * v00 * c00 + w10 * v10 * c10 + w01 * v01 * c01 + w11 * v11 * c11) / sumW;
      const t = sumW * sumW * (3 - 2 * sumW);
      return avg + (1 - t) * 6.0;
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
        // Tôn xe uốn cong mượt mà, chỉ tạo sóng nhăn kim loại gợn nhẹ góc rộng, không tạo răng cưa nhọn
        const rx = X * 0.45 + Z * 0.35, rz = -X * 0.35 + Z * 0.45;
        const fold1 = 0.06 * Math.sin(rx * 0.8 + ph) * Math.cos(rz * 0.8);
        const crumple = fold1 * Math.min(1.0, Math.max(0.0, (cCenter - 0.3) / 2.5));

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
          for (let di = -3; di <= 3; di++) {
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
      const under = samp(gUnd, x, z, 0), along = samp(gAl, x, z, 0);
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
      if(!list.some(m=>m&&m.isMeshStandardMaterial&&!m.transparent&&m!==mats.tire))return;
      o.geometry=o.geometry.clone();
      const ref=o.geometry.attributes.position.clone();
      const matrix=new THREE.Matrix4().copy(car.matrixWorld).invert().multiply(o.matrixWorld);
      const point=new THREE.Vector3();
      for(let i=0;i<ref.count;i++){point.fromBufferAttribute(ref,i).applyMatrix4(matrix);ref.setXYZ(i,point.x,point.y,point.z);}
      o.geometry.setAttribute('aWeatherRest',ref);
      for(const m of list) {
        if(!m||!m.isMeshStandardMaterial||m.transparent||m===mats.tire||weathered.has(m))continue;
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
      const A = geo.attributes.position, R = restGeo.get(geo), C = track ? geo.attributes.aCr : null, B = bindOf(geo);
      for (let i = 0; i < A.count; i++) {
        SB.dispOf(B, i, dd); wrinkle(R[3 * i], R[3 * i + 1], R[3 * i + 2], dd, qq);
        A.setXYZ(i, qq[0], qq[1], qq[2]);
        if (C) C.setXYZ(i, qq[4], qq[5], qq[3]);
      }
      A.needsUpdate = true; if (C) C.needsUpdate = true; geo.computeVertexNormals();
      geo.computeBoundingSphere();
    };
    const wheels = [];
    const rebuild = () => {
      crushDirty = false;
      crushGeo(bodyGeo, true); crushGeo(cabGeo, true);
      const mx = SB.maxK;
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
        if ((isRoof && crushMax > 0.28) || (isWell && crushMax > 0.2) || (isWiper && crushMax > 0.25) || (isStep && crushMax > 0.35) || (isBumper && crushMax > 0.22)) { e.hidden = true; e.o.visible = false; continue; }
        if (e.geo) { crushGeo(e.geo, false); continue; }
        const o = e.o; o.position.copy(e.p); o.scale.copy(e.s); o.rotation.copy(e.r); o.visible = e.v;
        if (!e.b) e.b = SB.bind([e.p.x, e.p.y, e.p.z]);
        SB.dispOf(e.b, 0, dd);
        if (e.hidden || (o.userData.inner && (dd[3] > 0.4 || cabCap)) || (isWell && (dd[3] > 0.05 || crushMax > 0.2)) || (isRoof && (dd[3] > 0.15 || crushMax > 0.28)) || (isWiper && crushMax > 0.25) || (isStep && crushMax > 0.35) || (isBumper && (dd[3] > 0.12 || crushMax > 0.22))) { e.hidden = true; o.visible = false; continue; }   // nội thất / hốc bánh / phụ kiện nóc / gạt mưa / bậc bước nát kín
        o.position.set(e.p.x + dd[0], Math.max(0.24, e.p.y + dd[1]), e.p.z + dd[2]);
        const ratio = Math.max(0.28, 1 - dd[3] * 0.72);
        o.scale.y *= ratio;
        if (ratio < 0.7 && !isBumper) { o.rotation.x += e.j[0] * 0.6; o.rotation.z += e.j[1] * 0.6; }
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
          w.g.position.set(px, py, pz);
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
    let roll = 0, pitch = 0, sink = 0;
    for (const az of [S.axleF, S.axleR]) for (const sx of [1, -1]) {
      const flat = (age > 0.28 && rnd() < (age - 0.28) * 0.45) ? S.r * 0.3 : 0;
      const D = az === S.axleR && S.dualR, SW = D ? Object.assign({}, S, { tireW: D.tireW }) : S, wx = D ? D.x : S.trackHalf;
      const wg = wheelGroup(SW, mats, sx, flat);
      wg.position.set(sx * wx, S.r - flat, az);
      car.add(wg); wheels.push({ g: wg, x: sx * wx, y: S.r - flat, z: az, sx, base: 0 });
      if (D) {   // inner twin: same hub, never deflated (the outer tyre carries the sag)
        const xi = wx - D.tireW - D.gap, wi = wheelGroup(SW, mats, sx, 0);
        wi.position.set(sx * xi, S.r - flat, az);
        car.add(wi); wheels.push({ g: wi, x: sx * xi, y: S.r - flat, z: az, sx, base: 0 });
      }
      if (flat) { roll += -sx * flat / (4 * S.trackHalf); pitch += flat / (4 * (az - (S.axleF + S.axleR) / 2)); sink += flat / 4; }
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
      for (const [mat, n, s0, s1] of [[mats.paint, 12, 0.5, 1.7], [mats.black, 9, 0.4, 1.3], [M.tailLens, 3, 0.25, 0.6], [M.headLens, 3, 0.25, 0.6], [glassBits, 160, 0.08, 0.38]]) {
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
      if (!p) { u.uE.value.set(0, 6, 40, 2); u.uBk.value.set(1, 1, 1, 1); u.uBk2.value.set(1, 1, 1, 1); events.push('glass'); return; }
      if (p.z > S.roofF - 1.2 && p.y > top(p.z) - 0.5) {
        u.uBk.value.x = 1; u.uE.value.set(p.x, p.z, 6, 1);
        if (Math.abs(p.x) > plan(p.z) - 2.2) { if (p.x > 0) u.uBk.value.w = 1; else u.uBk.value.z = 1; }
      }
      else if (p.z < S.roofR + 1.2 && Math.abs(p.x) < plan(p.z) - 0.8) { u.uBk.value.y = 1; u.uE.value.set(p.x, p.z, 6, 1); }
      else if (p.z > S.zB) { if (p.x > 0) u.uBk.value.w = 1; else u.uBk.value.z = 1; u.uE.value.set(p.x, p.z, 5, 1); }
      else { if (p.x > 0) u.uBk2.value.y = 1; else u.uBk2.value.x = 1; u.uE.value.set(p.x, p.z, 5, 1); }
      events.push('glass');
    };
    const flattenNear = (p, rad) => {
      wheels.forEach((w, wi) => {
        if (w.free || Math.hypot(w.g.position.x - p.x, w.g.position.y - p.y, w.g.position.z - p.z) > rad) return;
        const tire = w.g.children[0], flat = 0.42 * S.r; tire.geometry.dispose(); tire.geometry = tireGeometry(S, flat);
        w.lvl = 2; w.flat = flat; w.g.position.y = S.r - flat; events.push('tire');
      });
    };
    const ignite = (x, y, z) => {
      if (fire.on || fire.char >= 1) return;
      fire.on = true; fire.t = 0; fire.ign = [x, y, z];
      fire.boom = !S.isTruck && fire.fuel > 0.4 ? 3.5 + 4 * rnd() : -1;
      // Ánh sáng lửa hắt nhẹ từ gầm / khoang máy ra mặt đường, không chiếu trực diện làm lóa kính
      fire.light = new THREE.PointLight(0xff6a18, 0, 32, 2);
      fire.light.position.set(0, 1.2, 4);
      g.add(fire.light);
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
      if (fire.light) fire.light.intensity = 0.85 * k * (0.8 + 0.3 * Math.sin(fire.t * 19) * Math.sin(fire.t * 6.3));
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
      if (fire.t >= dur) { fire.on = false; if (fire.light) fire.light.intensity = 0; }
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
        car.updateMatrixWorld(true);
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

        const now = performance.now();
        if (this._lastSweepHit && (now - this._lastSweepHit < 90)) return true;
        this._lastSweepHit = now;

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

        const impForce = crushed ? Math.min(600, effSpeed * 15 + 100) : Math.min(2200, effSpeed * 35 + 450);
        SB.impulse(hitPoint.x, hitPoint.y, hitPoint.z, radius * 3.2, impForce);

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
    g.userData.spec = S;
    return g;
  }
  return { build, SPEC, envCube, _geo: { bodyGeometry, cabinGeometry } };
})();
if (typeof window !== 'undefined') window.CivilCars = CivilCars;
