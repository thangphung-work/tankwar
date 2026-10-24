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
      plan: [[-18.8, 5.8], [-18.55, 6.55], [-17.8, 6.97], [-16, 7.12], [-13, 7.18], [0, 7.22], [12, 7.2], [15.5, 7.08], [17.4, 6.85], [18.35, 6.35], [18.75, 5.6]],
      // đường nóc thân dưới nhìn ngang: cốp -> mép kính (vai) -> capô -> mũi
      top: [[-18.8, 6.6], [-18.6, 7.55], [-17.8, 8.0], [-15.5, 8.15], [-12.6, 8.12], [-8, 8.0], [0, 7.85], [6, 7.75], [7.8, 7.6], [10, 7.35], [13.5, 6.95], [16.5, 6.45], [18.2, 5.95], [18.75, 5.2]],
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
        head: { kind: 'head', dir: [0.55, 1], pts: [[-6.1, 4.5], [-1.85, 5.0], [-1.7, 5.6], [-6.3, 5.25]], r: 0.2, zMin: 14, depth: 0.75, backMat: 'reflector',
          proj: [[-5.0, 4.98, 0.3, 'lens'], [-3.75, 5.12, 0.3, 'bowl']], drl: [[-6.0, 4.48], [-2.1, 4.95]], lensColor: (u, v) => u > -2.4 ? [1, 0.8, 0.5] : [1, 1, 1] },
        tail: { kind: 'tail', style: 'sedanBlade', dir: [0.46, -1], pts: [[-5.72, 6.18], [-2.05, 6.28], [-1.92, 7.1], [-5.68, 7.28]], r: 0.16, zMin: -14, depth: 0.4, backMat: 'tailBack',
          lensColor: (u, v) => v < 6.48 && u < -4.85 ? [0.92, 0.9, 0.82] : [0.76, 0.018, 0.014] },
        grille: { kind: 'grille', sym: true, dir: [0, 1], pts: [[-2.3, 4.25], [2.3, 4.25], [2.55, 5.08], [-2.55, 5.08]], r: 0.22, zMin: 15, depth: 0.7 },
        intake: { kind: 'intake', sym: true, dir: [0, 1], pts: [[-3.75, 2.62], [3.75, 2.62], [4.0, 2.98], [-4.0, 2.98]], r: 0.2, zMin: 15, depth: 0.5 },
        fog: { kind: 'fog', dir: [0, 1], pts: [[4.85, 2.92], [4.9, 2.92], [4.9, 2.97], [4.85, 2.97]], r: 0.33, zMin: 15, depth: 0.35, backMat: 'reflector' }
      }, bumperTop: [4.3, 5.55], rakeF: [13.5, 3.7, 0.2], rakeR: [-14.5, 4.6, 0.07]
    },
    // SUV thể thao đa dụng việt dã (~4,85 x 1,94 x 1,75 m, cơ sở 2,9 m, lốp 265/65R18)
    suv: {
      axleF: 12.2, axleR: -11.0, r: 3.0, trackHalf: 6.6, tireW: 2.1, archGap: 0.65, flare: 0.24,
      // bề rộng nửa thân nhìn từ trên: thân xe vuông vức, cơ bắp
      plan: [
        [-19.4, 5.85], [-19.12, 6.65], [-18.55, 7.28], [-17.7, 7.58], [-16.0, 7.68], [-12.0, 7.74],
        [0, 7.75], [12.0, 7.72], [16.2, 7.58], [18.2, 7.28], [19.0, 6.65], [19.4, 5.8]
      ],
      // đường nóc thân dưới nhìn ngang: đuôi đứng (không cốp thụt), đường vai cao thẳng tắp, capô ngang cơ bắp
      top: [
        [-19.4, 8.65], [-19.1, 9.12], [-18.0, 9.35], [-12.0, 9.38], [-6.0, 9.32],
        [0, 9.24], [6.0, 9.12], [8.2, 8.98], [11.0, 8.82], [14.5, 8.55], [17.5, 8.05], [19.0, 7.35], [19.4, 6.5]
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
      hood: [8.2, 17.2], trunk: [-18.0, 8.15], fuel: [-14.2, 7.9, 0.65, 0.58],
      lamps: {
        front: [16.8, 3.2, 1.25, 0.3],
        grille: [2.85, 0.45, 1.35, 3.6],
        rear: [-18.2, 3.4, 1.35, 0.35]
      },
      plates: [4.4, 6.72],
      features: {
        head: {
          kind: 'head', dir: [0.55, 1],
          pts: [[-6.45, 5.82], [-2.55, 6.12], [-2.38, 6.7], [-6.58, 6.5]],
          r: 0.15, zMin: 14.7, depth: 0.64, backMat: 'reflector',
          proj: [[-5.45, 6.25, 0.26, 'lens'], [-4.25, 6.32, 0.24, 'bowl']],
          drl: [[-6.35, 5.84], [-2.72, 6.12]],
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
          pts: [[-2.75, 5.25], [2.75, 5.25], [2.9, 6.5], [-2.9, 6.5]],
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
      bumperTop: [5.2, 6.5], rakeF: [14.0, 4.5, 0.16], rakeR: [-15.5, 5.6, 0.05],
      isSuv: true
    }
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
  function halfSection(w, y0, y1) {
    const h = y1 - y0;
    // Giữ cho vị trí theo chiều Y của sườn xe và đường vai luôn phẳng mịn, ổn định theo y1,
    // không bị y0 của hốc bánh xe đẩy trồi sụt làm méo / lún lõm thân xe
    const yMid = Math.max(y0 + Math.min(0.5, h * 0.32), y1 - 2.15);
    const yLow = y0 + (yMid - y0) * 0.46;
    const yShoulder = y1 - 0.78;
    return spline2([
      [0, y0],
      [w - 1.3, y0],
      [w - 0.62, y0 + Math.min(0.15, (yLow - y0) * 0.25)],
      [w - 0.35, yLow],
      [w - 0.10, yLow + (yMid - yLow) * 0.55],
      [w, yMid],
      [w - 0.02, yShoulder],
      [w - 0.18, y1 - 0.42],
      [w - 0.5, y1 - 0.06],
      [w - 1.3, y1 + 0.04],
      [w * 0.45, y1 + 0.16],
      [0, y1 + 0.19]
    ], 4);
  }
  function bodyGeometry(S) {
    const plan = curve(S.plan), top = curve(S.top), bot = curve(S.bottom);
    const RND = 0.38, z0 = S.plan[0][0] + RND, z1 = S.plan[S.plan.length - 1][0] - RND, Ra = S.r + S.archGap;
    const width = z => plan(z) + S.flare * (Math.exp(-(((z - S.axleF) / 3.4) ** 2)) + Math.exp(-(((z - S.axleR) / 3.4) ** 2)));
    // trạm dọc thân: đều 0.4, dày hơn quanh hốc bánh
    const Z = new Set();
    for (let z = z0; z < z1; z += 0.4) Z.add(+z.toFixed(3));
    Z.add(z1);
    for (const az of [S.axleF, S.axleR]) for (let z = az - Ra - 0.3; z <= az + Ra + 0.3; z += 0.15) Z.add(+z.toFixed(3));
    const zs = [...Z].filter(z => z >= z0 && z <= z1).sort((a, b) => a - b);
    const section = z => {
      const w = width(z), y1 = top(z);
      let y0 = bot(z);
      // hốc bánh: đáy nâng thành vòm tròn quanh lốp
      for (const az of [S.axleF, S.axleR]) { const d = z - az; if (Math.abs(d) < Ra) y0 = Math.max(y0, S.r + Math.sqrt(Ra * Ra - d * d)); }
      y0 = Math.min(y0, y1 - 1.4);
      return { w, y0, y1, half: halfSection(w, y0, y1) };
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
      const [z0r, zN, yM, k] = p[2] > 0 ? [S.rakeF[0], S.plan[S.plan.length - 1][0], S.rakeF[1], S.rakeF[2]] : [S.rakeR[0], S.plan[0][0], S.rakeR[1], S.rakeR[2]];
      const t = Math.max(0, Math.min(1, (p[2] - z0r) / (zN - z0r)));
      p[2] -= Math.sign(p[2]) * t * t * k * (p[1] - yM) * (p[1] - yM);
      // SUV: nắp cốp lồi nhẹ ở giữa và rút dần về hai góc, tránh mặt đuôi phẳng như một tấm vách.
      if (S.isSuv && p[2] < -15.4) {
        const rt = Math.max(0, Math.min(1, (-15.4 - p[2]) / 3.65));
        const side = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(p[0]) / 7.7), 1.55));
        const mid = Math.max(0.25, 1 - Math.abs(p[1] - 6.65) / 6.2);
        p[2] -= 0.72 * rt * rt * side * mid;
      }
      if (!S.isSuv && p[2] < -13.6) {
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
    // Độ dốc nghiêng của vách kính: duy trì tỷ lệ đều đặn để cột C không bị vặn xoắn lõm yên ngựa
    const tumSlope = S.tumble / (isSuv ? 4.8 : 3.6);

    for (let z = z0; z <= z1 + 1e-6; z += 0.2) {
      const tRear = Math.max(0.0, Math.min(1.0, isSuv ? 0 : (-z - 8.5) / 3.8));
      const tEnd = Math.max(0.0, Math.min(1.0, isSuv ? 0 : (-z - 10.8) / 1.8));

      // Ở đuôi sedan: chân cabin và mui hạ sâu vào trong khe rãnh nắp cốp, lặn hẳn vào trong thân xe
      const ybDrop = 0.25 + 0.35 * tRear + 0.55 * tEnd;
      const yb = top(z) - ybDrop;
      let yr = Math.max(yb + 0.12, roof(z) - (isSuv ? 0 : 0.75 * tEnd));
      if (tEnd > 0.0) {
        yr = yr * (1.0 - 0.9 * tEnd) + (yb + 0.15) * (0.9 * tEnd);
      }
      const hh = Math.max(0.08, yr - yb);
      // Bề rộng chân kính: ở đoạn đuôi sedan thuôn mượt vào rãnh nước nắp cốp, không chìa ra ngoài gờ vai
      const w0 = plan(z) - S.inset - (isSuv ? 0 : 0.45 * tRear + 0.55 * tEnd);
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
    float nB = fbm(wp * 0.22), nF = fbm(wp * 0.95 + 4.0), nS = fbm(vec3(wp.x * 0.7, wp.y * 0.07, wp.z * 0.7) + 2.0);
    float lum = dot(cO, vec3(0.3, 0.59, 0.11));
    ccO *= 1.0 - 0.6 * age * paintK; rO = mix(rO, 0.72, 0.4 * age * paintK); cO = mix(cO, vec3(lum), 0.18 * age * paintK);
    // sơn bạc màu, phấn hoá ở mặt hứng nắng (nóc, capô, nắp cốp)
    float fade = age * pow(up, 1.5) * (0.55 + 0.45 * nB);
    LAY(fade * paintK, mix(cO, vec3(lum * 1.05 + 0.06), 0.55), mO * 0.4, 0.7, 0.15)
    // lớp bóng bong tróc thành mảng, lộ sơn lót nhạt
    float peel = smoothstep(0.45, 0.9, age) * up * smoothstep(0.66, 0.675, fbm(wp * 0.55 + 2.0) + 0.12 * nF);
    LAY(peel * paintK, mix(cO, vec3(lum * 1.1 + 0.1), 0.5), 0.0, 0.9, 0.0)
    // gỉ sét: mép dưới thân, vòm bánh, rìa chỗ bong sơn, đốm rỉ loang lổ
    float rustM = smoothstep(2.8, 0.0, y - yBot) * 1.35 + smoothstep(0.70, 0.88, fbm(wp * 0.6 + 7.0)) + peel * 0.75;
    float rust = clamp(uW.z * smoothstep(0.24, 0.52, rustM * (0.42 + 0.78 * nF)), 0.0, 1.0);
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
    seam = max(seam, yIn * max(aaLine(z - uA.x, gap), max(aaLine(z - uA.y, gap), aaLine(z - uA.z, gap))));
    seam = max(seam, step(uA.z, z) * step(z, uA.x) * aaLine(y - uB.x, gap));
    seam = max(seam, step(y, uB.y) * aaLine(z - uA.w, gap));
    seam = max(seam, step(y, uB.w) * aaLine(z - uB.z, gap));
    if (x > 0.0) seam = max(seam, aaLine(sdBox2(vec2(z, y) - uD.xy, uD.zw, 0.15), gap));
  }
  if (Nn.y > 0.3) {
    float hf = uC.y - 0.025 * ax * ax;
    seam = max(seam, step(uC.x, z) * step(z, hf) * aaLine(ax - hoodEdge, gap));
    seam = max(seam, step(ax, hoodEdge) * step(uC.x, z) * aaLine(z - hf, gap));
    seam = max(seam, step(z, uC.z) * aaLine(ax - hoodEdge, gap));
    seam = max(seam, step(ax, hoodEdge) * aaLine(z - (uC.z - 0.08), gap));
  }
  if (Nn.z < -0.35) {
    if (uAx.w > 0.5) {
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
  if (uAx.w > 0.5) {
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
  // nhựa đen nhám: mép dưới ngưỡng cửa, môi cản trước, ốp khuếch tán sau
  float low = fillAA(y - (vRef.y + 0.3));
  low = max(low, step(uF.x + 1.2, z) * fillAA(y - (uG.w - 0.5)));
  low = max(low, step(z, uR.x - 0.6) * fillAA(y - 3.1));
  low *= 1.0 - inCab;
  LAY(low, vec3(0.035), 0.0, 0.75, 0.1)
  float featK = max(inCab, low);
  if (uAx.w > 0.5) {
    float dF = length(vec2(z - uAx.x, y - uAx.z));
    float dR = length(vec2(z - uAx.y, y - uAx.z));
    float rIn = uAx.z + 0.65, rOut = rIn + 0.54;
    float inArch = (fillAA(dF - rOut) * fillAA(rIn - dF) + fillAA(dR - rOut) * fillAA(rIn - dR)) * step(uAx.z * 0.45, y) * step(0.18, abs(Nn.x));
    float rocker = step(uAx.y + rOut - 0.15, z) * step(z, uAx.x - rOut + 0.15) * fillAA(y - (vRef.y + 0.95)) * step(0.22, abs(Nn.x));
    float cladK = max(inArch, rocker) * (1.0 - inCab);
    LAY(cladK, vec3(0.038, 0.04, 0.042), 0.0, 0.85, 0.05)
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
  if (z < uR.x && Nn.z < -0.3) {
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
  float dRr = rmax(rmax(side, z - (uC.x - 0.5), 0.3), zC - z, 0.32);
  float d = min(min(dW, dR), min(dF, dRr));
  float f = clamp(fwidth(d), 1e-4, 0.06);
  float glassK = 1.0 - smoothstep(-f, f, d);
  float rub = (1.0 - smoothstep(0.045 - f, 0.045 + f, d)) * (1.0 - glassK);
  float pil = (1.0 - smoothstep(-f, f, side)) * (1.0 - smoothstep(0.5 - f, 0.5 + f, abs(z - uC.x)));
  float dv = (1.0 - smoothstep(0.12 - f, 0.12 + f, abs(z - uC.y))) * glassK; glassK -= dv;
  // Tôn chân kính và cột sau thuộc thân sơn. Không gộp cả mảng rear-cowl vào trim đen;
  // chỉ gioăng mảnh, cột B và nẹp chia kính mới dùng vật liệu cao su tối.
  float trimK = max(max(rub, pil), dv);
  // viền gốm đen quanh kính chắn gió / kính hậu + dải chấm nhỏ dần vào trong
  float dWR = min(dW, dR), fw = clamp(fwidth(dWR), 1e-4, 0.06);
  float frit = smoothstep(-0.12 - fw, -0.12 + fw, dWR);
  vec2 cell = fract(vec2(x, (z + y) * 0.7071) / 0.16) - 0.5;
  // Chấm frit chỉ thuộc kính chắn gió/kính hậu. Bản cũ chỉ lọc theo z nên tràn thành họa tiết chéo kín kính cửa trước.
  float dotMask = step(uA.y - 1.0, z) * step(0.55, abs(Nn.z));
  float dots = fillAA(length(cell) - 0.4 * clamp((dWR + 0.26) / 0.14, 0.0, 1.0)) * step(-0.26, dWR) * dotMask;
  float fritK = glassK * max(frit, dots) * (1.0 - step(0.3, vCr.z));   // viền gốm chỉ mất khi kính bị nghiền   // xác bị cán: kính dẹt, bỏ viền gốm (vạch đạo hàm vỡ)
  LAY(trimK, vec3(0.012), 0.0, 0.5, 0.4)
  float suvPrivacy = uAx.w * step(z, uC.x) * 0.55;
  vec3 glassColor = mix(vec3(0.13, 0.145, 0.15), vec3(0.045, 0.048, 0.05), suvPrivacy);
  LAY(glassK, glassColor, 0.0, mix(0.14, 0.09, suvPrivacy), 1.0)
  LAY(fritK, vec3(0.008), 0.0, 0.3, 1.0)
  float glassOnly = glassK * (1.0 - fritK);
  float alphaO = mix(1.0, mix(0.66, 0.88, suvPrivacy), glassOnly);
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
  // xe bị cán bẹp / móp méo: kính hông / kính hậu cường lực vỡ vụn rơi hết (kính chắn gió dán keo rạn nứt)
  // ô kính đang tô: chắn gió / hậu / cửa trước / cửa sau (kèm kính tam giác) theo bên trái / phải
  float paneBk = dW <= min(min(dR, dF), dRr) ? uBk.x : dR <= min(dF, dRr) ? uBk.y : dF <= dRr ? (x > 0.0 ? uBk.w : uBk.z) : (x > 0.0 ? uBk2.y : uBk2.x);
  if (step(0.5, uE.w) + paneBk > 0.0 || vCr.z > 0.04 || uTk.w > 0.0) {
    float kc = max(smoothstep(0.04, 0.22, vCr.z), max(step(0.5, uE.w), max(paneBk, uTk.w)));
    if (z > uA.y) {
      // kính chắn gió dán nhiều lớp: không rơi, rạn nứt mạng đa giác, giảm bóng phản chiếu
      vec2 cp = vec2(x, z + y * 0.6);
      float e1 = crackEdge(cp * (1.2 + 2.0 * kc)), e2 = crackEdge(cp * (4.0 + 4.0 * kc) + 3.1);
      float fw1 = fwidth(e1) + 1e-4, fw2 = fwidth(e2) + 1e-4;
      float cr = max(1.0 - smoothstep(0.0, 0.012 + fw1, e1), 0.5 * (1.0 - smoothstep(0.0, 0.01 + fw2, e2)) * kc);
      cO = mix(cO, vec3(0.55, 0.6, 0.6), cr * glassOnly * kc * 0.75); rO = mix(rO, 0.65, cr * glassOnly * kc); mO = mix(mO, 0.05, cr * glassOnly * kc); ccO *= 1.0 - 0.9 * cr * kc;
      alphaO = mix(alphaO, 0.92, glassOnly * kc * 0.7);
      if (glassOnly > 0.5 && (vCr.z > 0.45 || uTk.w > 0.5) && vnoise(vec3(cp * 0.55, 7.0)) > 0.58) discard;   // kính dán thủng khi bị nghiền nặng
    } else {
      // kính hông / kính hậu cường lực: vỡ vụn biến mất ngay khi móp khung, chỉ còn rìa vỡ lởm chởm cực mỏng
      float rim = 0.04 + 0.12 * vnoise(vec3(vRest * 3.5));
      if (glassOnly > 0.5 && kc > 0.05 && -d > rim) discard;
      vec2 cp = vec2(z + x, y) * 8.0; float e = crackEdge(cp);
      cO = mix(cO, vec3(0.45, 0.5, 0.5), glassOnly * kc * (1.0 - smoothstep(0.0, 0.05, e)) * 0.8);
      rO = mix(rO, 0.8, kc); ccO = 0.0;
    }
  }
  // mặt trong khoang (nhìn xuyên kính sang cột / khung cửa / trần bên kia): ốp nhựa xám, trần nỉ
  if (!gl_FrontFacing) { float ins = 1.0 - glassOnly; cO = mix(cO, vec3(0.13, 0.125, 0.12), ins); rO = mix(rO, 0.92, ins); mO *= 1.0 - ins; ccO *= 1.0 - ins; }
  // mui / cột / gioăng luôn đặc (chỉ ô kính mới trong suốt)
  alphaO = mix(1.0, alphaO, smoothstep(0.02, 0.2, glassOnly));
  diffuseColor.rgb = cO; diffuseColor.a = alphaO;
`;
  function carMaterial(color, env, mode, S, W) {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1 });
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
    Object.assign(U, { uF: L.front, uG: L.grille, uR: L.rear, uI: [S.inset + 0.15, S.cabin[0][0] + 0.2, S.cabin[S.cabin.length - 1][0] - 0.2, 0], uW: [W.dust, W.age, W.rust, W.seed], uTk: W.track || [0, 0, 0, 0], uBk: [0, 0, 0, 0], uBk2: [0, 0, 0, 0], uAx: [S.axleF, S.axleR, S.r, S.isSuv ? 1.0 : 0.0] });
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
      // 2 bóng projector (thân đen, thấu kính cầu, vòng crôm) + dải LED ban ngày chạy dọc mép dưới
      // bóng chiếu thẳng ra trước (không theo hướng ôm góc của chụp đèn): projector = vỏ đen + thấu kính lớn + viền crôm mảnh;
      // pha = chóa phản xạ crôm lõm có bóng đèn ở tâm
      const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
      for (const [u, v, r, type] of F.proj) {
        const sp = at(u, v, 0); if (!sp) continue;
        const base = sp.clone(); base.z -= r * 0.9 + 0.16;
        if (type === 'lens') {
          const sh = add(new THREE.CylinderGeometry(r * 1.22, r * 1.3, depth, 24, 1, true), M.wall); sh.quaternion.setFromUnitVectors(up, fwd); sh.position.copy(base).z -= depth * 0.5;
          const lens = add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.projLens); lens.quaternion.setFromUnitVectors(up, fwd); lens.position.copy(base);
          add(new THREE.TorusGeometry(r * 1.06, 0.035, 6, 32), M.chromeIn).position.copy(base);
        } else {
          const bowl = add(new THREE.SphereGeometry(r * 1.3, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.chromeIn); bowl.quaternion.setFromUnitVectors(up, fwd.clone().negate()); bowl.position.copy(base).z += r * 0.5;
          add(new THREE.SphereGeometry(r * 0.22, 12, 8), M.bulb).position.copy(base);
        }
      }
      const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, u = F.drl[0][0] + (F.drl[1][0] - F.drl[0][0]) * t, v = F.drl[0][1] + (F.drl[1][1] - F.drl[0][1]) * t, p = at(u, v, depth * 0.3); if (p) pts.push(p); }
      if (pts.length > 3) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.045, 6, false), M.drl);
      add(capGeometry(rings.map(R => R.map(p => p.clone())), center.clone(), d, F.lensColor, uvs), M.headLens).geometry.translate(0, 0, 0);
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
    for (let i = 0; i < 2600; i++) {
      const a = rnd() * 6.28, r = Math.pow(rnd(), 0.7) * 120, px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r, s = 1.2 + rnd() * 3.6, v = 200 + rnd() * 55;
      x.fillStyle = 'rgba(' + (v * 0.92 | 0) + ',' + v + ',' + (v * 0.97 | 0) + ',' + (0.35 + rnd() * 0.6) * (1 - r / 130) + ')';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + s, py + rnd() * s); x.lineTo(px + rnd() * s, py + s); x.fill();
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

  // ---------------------------------------------------------------------------
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
      paint: new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(new THREE.Color(0x807d78), age * 0.28), roughness: opts.burnt ? 0.95 : (0.5 + 0.28 * age), metalness: opts.burnt ? 0.05 : 0.08, clearcoat: opts.burnt ? 0 : (0.62 - 0.35 * age), clearcoatRoughness: 0.16 + 0.18 * age, envMap: env, envMapIntensity: 0.72 }),
      tire: plain(opts.burnt ? new THREE.Color(0x1a1715) : new THREE.Color(0xffffff).lerp(new THREE.Color(0xb8a890), age * 0.5), 0.92, 0, { map: tireTexture(age), envMapIntensity: opts.burnt ? 0.05 : 0.2 }),   // cao su đen ngả bụi đất nâu xám theo tuổi / cháy tro
      rim: plain(rimCol.clone().multiplyScalar(0.78), opts.burnt ? 0.88 : (0.38 + 0.2 * age), opts.burnt ? 0.3 : 0.68, { envMapIntensity: opts.burnt ? 0.15 : 0.72 }),
      lip: plain(new THREE.Color(opts.burnt ? 0x1f1b18 : 0xb8bdc1).lerp(new THREE.Color(0x77736c), age * 0.4), opts.burnt ? 0.85 : 0.42, opts.burnt ? 0.2 : 0.7, { envMapIntensity: opts.burnt ? 0.15 : 0.68 }),
      barrel: plain(opts.burnt ? 0x121212 : 0x181a1d, 0.55, 0.75),
      cap: plain(opts.burnt ? 0x181513 : 0x15171a, 0.25, 0.8, { envMapIntensity: 1.2 }),
      disc: plain(opts.burnt ? new THREE.Color(0x4a362a) : new THREE.Color(0xffffff), opts.burnt ? 0.88 : 0.24, opts.burnt ? 0.3 : 0.88, { map: discTexture(age), envMapIntensity: opts.burnt ? 0.15 : 1.3 }),
      caliper: plain(opts.burnt ? 0x221a18 : 0x7d2420, opts.burnt ? 0.85 : 0.58, opts.burnt ? 0.2 : 0.24, { envMapIntensity: 0.45 }),
      black: plain(0x0d0d0d, 0.72, 0.05), wiper: plain(new THREE.Color(0x1a1a1a).lerp(new THREE.Color(0x3a2a20), age * 0.6), 0.62, 0.35), chrome: plain(opts.burnt ? 0x332a22 : 0xc8cdd0, opts.burnt ? 0.8 : 0.28, opts.burnt ? 0.2 : 0.78, { envMapIntensity: 0.85 }), mirror: plain(opts.burnt ? 0x221a15 : 0x9eabb0, opts.burnt ? 0.8 : 0.12, opts.burnt ? 0.2 : 0.65, { envMapIntensity: opts.burnt ? 0.2 : 1.25 }),
      mirrorDirt: plain(0x8a7b64, 1, 0, { alphaMap: mirrorGrime, transparent: true, opacity: 0.48 + age * 0.24, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0 }),
      defrost: plain(new THREE.Color(0x6d3928).lerp(new THREE.Color(0x3a3029), age * 0.55), 0.72, 0.18, { envMapIntensity: 0.18 }),
      seat: plain(new THREE.Color(0x2e2b27).lerp(new THREE.Color(0x4a4339), age * 0.5), 0.95, 0, { envMapIntensity: 0.15 }),
      dash: plain(0x1d1c1b, 0.8, 0, { envMapIntensity: 0.2 }), dark: plain(0x0b0c0d, 0.9, 0)
    };
    const g = new THREE.Group(), car = new THREE.Group(); g.add(car);
    const prep = geo => { geo.setAttribute('aRest', geo.attributes.position.clone()); geo.setAttribute('aCr', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3)); return geo; };
    const bodyGeo = prep(bodyGeometry(S)), cabGeo = prep(cabinGeometry(S));
    const body = new THREE.Mesh(bodyGeo, mats.body), cabin = new THREE.Mesh(cabGeo, mats.cabin);
    for (const m of [body, cabin]) { m.castShadow = true; m.receiveShadow = true; car.add(m); }
    // mặt trong khoang: cột, khung cửa, trần (đặc) — nhìn xuyên kính thấy thành xe bên kia
    const cabIn = new THREE.Mesh(cabGeo, mats.cabinIn); cabIn.receiveShadow = true; car.add(cabIn);
    const top = curve(S.top), plan = curve(S.plan), roof = curve(S.cabin);
    // dò mặt thân xe bằng tia (gắn chi tiết sát bề mặt) — trước khi móp
    const rc = new THREE.Raycaster();
    const hitAt = (o, d) => { rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); const h = rc.intersectObjects([body, cabin])[0]; return h ? { p: h.point, n: h.face.normal.clone() } : null; };
    const part = (geo, mat, pos, rot, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; (parent || car).add(m); return m; };

    // --- NỘI THẤT nhìn qua kính: 2 ghế trước có tựa đầu, băng ghế sau, taplô, vô-lăng, gương chiếu hậu trong
    const belt = top(0), nIn0 = car.children.length;
    for (const sx of [1, -1]) {
      part(roundBox(3.3, 4.2, 0.95, 0.4), mats.seat, [sx * 2.7, belt + 0.05, -1.4], [-0.2, 0, 0]);
      part(roundBox(1.9, 1.05, 0.6, 0.25), mats.seat, [sx * 2.7, belt + 2.45, -1.95], [-0.15, 0, 0]);
    }
    part(roundBox(2 * (plan(-8.5) - S.inset - 1.3), 3.2, 0.9, 0.4), mats.seat, [0, top(-8.5) - 0.3, -8.8], [-0.38, 0, 0]);
    if (S.isSuv) {
      part(roundBox(2 * (plan(-13.2) - S.inset - 1.4), 2.8, 0.8, 0.35), mats.seat, [0, top(-13.2) - 0.2, -13.5], [-0.3, 0, 0]);
    }
    part(roundBox(2 * (plan(5.5) - S.inset - 0.6), 1.3, 2.6, 0.45), mats.dash, [0, top(5.5) - 0.05, 5.5], [0.25, 0, 0]);
    const wheelS = part(new THREE.TorusGeometry(0.95, 0.12, 8, 28), mats.dash, [2.7, belt + 1.0, 3.7], [-0.45, 0, 0]);
    part(new THREE.BoxGeometry(1.8, 0.14, 0.1), mats.dash, [0, 0, 0], null, wheelS);
    part(roundBox(1.6, 0.48, 0.18, 0.07), mats.dash, [0, roof(2.7) - 0.75, 2.7], [0.2, 0, 0]);
    car.children.slice(nIn0).forEach(m => m.userData.inner = true);

    // --- GƯƠNG HẬU KHÍ ĐỘNG HỌC: chân đế tam giác, cần đỡ vát dẹp, củ gương 2 tông màu có đèn xi-nhan LED, mặt kính bo tròn lọt lòng trong hốc
    for (const sx of [1, -1]) {
      const zM = 6.2, yM = top(zM) + 0.75, h = hitAt([sx * 12, yM - 0.45, zM], [-sx, 0, 0]), xs = h ? Math.abs(h.p.x) : plan(zM);
      const grp = new THREE.Group(); grp.position.set(sx * (xs - 0.1), yM - 0.4, zM); car.add(grp); grp.userData.acc = 'mirror';
      // Xe cũ không tự nhiên mất mặt gương; chỉ xe cháy hoặc khung đã bị ép nặng mới có khả năng vỡ/gập gương.
      const broken = !!opts.burnt || ((opts.crush || 0) > 0.58 && rnd() < 0.65);

      // 1. Chân đế tam giác ôm sát góc chân cột A
      const baseShape = new THREE.Shape();
      baseShape.moveTo(0, -0.38); baseShape.lineTo(sx * 0.45, -0.32); baseShape.lineTo(sx * 0.12, 0.42); baseShape.lineTo(0, 0.38); baseShape.closePath();
      const baseGeo = new THREE.ExtrudeGeometry(baseShape, { curveSegments: 3, depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
      baseGeo.translate(0, 0, -0.06);
      part(baseGeo, mats.black, [0, 0, 0], null, grp);

      // 2. Cần đỡ khí động học vuốt chéo nâng củ gương
      const stalkGeo = roundBox(0.18, 0.16, 0.58, 0.045);
      stalkGeo.rotateY(sx * 0.85); stalkGeo.rotateZ(sx * 0.22);
      part(stalkGeo, mats.black, [sx * 0.38, 0.12, -0.08], null, grp);

      // 3. Vỏ củ gương khí động học (nửa trên sơn bóng cùng màu xe)
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

      // 4. Ốp nhựa đen phần chân củ gương (phong cách 2 tông màu thể thao)
      const lowerGeo = roundBox(w * 0.82, 0.12, 0.3, 0.045);
      lowerGeo.translate(cx, cy - hOut * 0.48, cz);
      lowerGeo.rotateY(sx * 0.18);
      part(lowerGeo, mats.black, [0, 0, 0], null, grp);

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
    // --- TAY NẮM CỬA (cùng màu sơn, lõm tối phía sau)
    for (const sx of [1, -1]) for (const zH of [0.7, -7.2]) {
      const yH = top(zH) - 1.2, h = hitAt([sx * 12, yH, zH], [-sx, 0, 0]);
      if (!h) continue;
      part(new THREE.SphereGeometry(1, 14, 8), mats.dark, [h.p.x - sx * 0.02, yH, zH], null).scale.set(0.08, 0.22, 0.8);
      part(new THREE.SphereGeometry(1, 14, 8), mats.paint, [h.p.x + sx * 0.06, yH, zH - 0.05], null).scale.set(0.12, 0.15, 0.7);
    }
    // --- GẠT MƯA nằm sát chân kính chắn gió ở vị trí nghỉ
    {
      const zBase = S.cabin[S.cabin.length - 1][0];
      const onGlass = (x, z, lift) => { const h = hitAt([x, 20, z], [0, -1, 0]); return h ? h.p.clone().addScaledVector(h.n, lift) : null; };
      const wiperConfigs = [
        { pivX: -1.2, x0: -3.5, len: 4.4, zOff: 0.22 },
        { pivX: 3.2, x0: 1.2, len: 4.2, zOff: 0.45 }
      ];
      for (const cfg of wiperConfigs) {
        const blade = [], frame = [];
        const zG = zBase - cfg.zOff;
        for (let i = 0; i <= 10; i++) {
          const x = cfg.x0 - cfg.len / 2 + cfg.len * i / 10;
          const z = zG - (x - cfg.x0) * 0.06;
          const a = onGlass(x, z, 0.04), b = onGlass(x, z, 0.10);
          if (a) blade.push(a); if (b) frame.push(b);
        }
        if (blade.length < 5) continue;
        const wpr = new THREE.Group(); car.add(wpr); wpr.userData.acc = 'wiper';
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(blade), 20, 0.045, 5, false), mats.black, [0, 0, 0], null, wpr);
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(frame), 20, 0.035, 5, false), mats.wiper, [0, 0, 0], null, wpr);
        const piv = onGlass(cfg.pivX, zBase + 0.12, 0.06);
        if (piv && frame.length > 3) {
          const mid = frame[Math.round(frame.length * 0.35)];
          const arm = new THREE.CatmullRomCurve3([piv, piv.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, 0.03, 0)), mid]);
          part(new THREE.TubeGeometry(arm, 10, 0.05, 5, false), mats.wiper, [0, 0, 0], null, wpr);
          part(new THREE.CylinderGeometry(0.18, 0.22, 0.16, 10), mats.black, [piv.x, piv.y - 0.01, piv.z]);
        }
      }
    }
    // --- BIỂN SỐ trước / sau (gom vào plateGrp để mặt và đế luôn đi liền nhau)
    const txt = String.fromCharCode(65 + (seed * 7) % 26) + ((seed * 37) % 90 + 10) + '-' + String(1000 + (seed * 7919) % 9000);
    const plateTex = plateTexture(txt, age, rnd), plateMat = plain(0xffffff, 0.5, 0.1, { map: plateTex, envMapIntensity: 0.4 });
    for (const [y0, dir] of [[S.plates[0], 1], [S.plates[1], -1]]) {
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
    {
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
      const taxiSign = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 1.2, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xffea00, roughness: 0.35, emissive: 0x332600 })
      );
      taxiSign.position.set(0, 11.6 + 0.6, -1.5);
      taxiSign.castShadow = true;
      taxiSign.userData.isRoof = true;
      car.add(taxiSign);
    }
    // --- PHỤ KIỆN RIÊNG CHO SUV (Giá nóc khí động học, cánh gió đuôi thể thao, ăng-ten vây cá mập, bậc bước chân việt dã, gạt mưa sau)
    if (S.isSuv) {
      const w0 = plan(0) - S.inset, w1 = w0 - S.tumble;
      // Chi tiết nắp cốp: tay mở chìm, camera lùi và đèn soi biển số.
      // Tất cả bám theo chính bề mặt đuôi xe để không có cảm giác phụ kiện bị treo.
      const rearSurface = (x, y, lift = 0.06) => {
        const h = hitAt([x, y, -40], [0, 0, 1]);
        return h ? [h.p.x, h.p.y, h.p.z - lift] : null;
      };
      const handleP = rearSurface(0, 7.72, 0.09);
      if (handleP) {
        const handle = part(roundBox(1.65, 0.2, 0.14, 0.05), mats.black, handleP);
        handle.userData.acc = 'tailgate';
        part(new THREE.SphereGeometry(0.085, 10, 6), mats.glass, [handleP[0], handleP[1] - 0.22, handleP[2] - 0.035]);
      }
      for (const sx of [1, -1]) {
        const lampP = rearSurface(sx * 1.45, 7.52, 0.075);
        if (lampP) part(roundBox(0.5, 0.11, 0.1, 0.025), mats.drl, lampP);
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
    if (!S.isSuv) {
      // Tay mở cốp chìm, nằm ngay trên biển số.
      const handleHit = hitAt([0, 6.12, -40], [0, 0, 1]);
      if (handleHit) part(roundBox(1.25, 0.12, 0.1, 0.035), mats.black, [handleHit.p.x, handleHit.p.y, handleHit.p.z - 0.07]);
    }
    // --- CỤM ĐÈN / LƯỚI lắp vào lỗ khoét
    const feat = new THREE.Group(); car.add(feat);
    const M = {
      wall: plain(0x111111, 0.7, 0.1, { side: THREE.DoubleSide }), reflector: plain(new THREE.Color(0x1d1e20).lerp(new THREE.Color(0x2a2824), age * 0.6), 0.4, 0.5, { side: THREE.DoubleSide }), bulb: plain(0xe8e6e0, 0.35, 0),
      tailBack: plain(0x3f0909, 0.48, 0.45, { side: THREE.DoubleSide }), chrome: mats.chrome, slat: plain(0x161616, 0.55, 0.25),
      projLens: new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMap: env }),
      drl: new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf0f0f0).lerp(new THREE.Color(0xb8a77a), age * 0.6), emissive: 0x1a1a1a, roughness: 0.4 }),
      headLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xffffff).lerp(new THREE.Color(0xe6dcc4), age * 0.6), vertexColors: true, transparent: true, opacity: 0.06 + 0.3 * age, roughness: 0.02 + 0.35 * age, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 + 0.3 * age, envMap: env, depthWrite: false }),
      fogLens: new THREE.MeshPhysicalMaterial({ color: 0xb8c0c2, roughness: 0.18 + age * 0.25, metalness: 0.05, clearcoat: 0.7, envMap: env, envMapIntensity: 0.65 }),
      chromeIn: plain(0xc0c4c8, 0.15 + 0.3 * age, 1, { side: THREE.DoubleSide }),
      tailGuide: new THREE.MeshStandardMaterial({ color: 0x681010, emissive: 0x090000, roughness: 0.56 }),
      tailBrake: plain(0x8b0808, 0.34, 0.18, { emissive: 0x120000 }),
      tailAmber: plain(0xa84c08, 0.3, 0.12, { emissive: 0x120600 }),
      tailReverse: plain(0xc7c4b9, 0.24, 0.08, { envMapIntensity: 0.55 }),
      tailLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xd8d2cc).lerp(new THREE.Color(0x8a8078), age * 0.4), vertexColors: true, transparent: true, opacity: 0.52, roughness: 0.16 + 0.28 * age, metalness: 0, clearcoat: 0.68, clearcoatRoughness: 0.14 + 0.25 * age, envMap: env, envMapIntensity: 0.7, depthWrite: false }),
      honey: plain(0x0c0c0c, 0.7, 0.1, { map: honeyTexture(), alphaTest: 0.5, side: THREE.DoubleSide })
    };
    for (const k in S.features) { const F = S.features[k]; if (F.sym) buildFeature(F, 1, body, M, age, feat); else for (const sx of [1, -1]) buildFeature(F, sx, body, M, age, feat); }
    // --- LÒNG HỐC BÁNH tối
    for (const az of [S.axleF, S.axleR]) {
      const well = part(new THREE.CylinderGeometry(S.r + S.archGap - 0.05, S.r + S.archGap - 0.05, S.trackHalf * 2 - 1.2, 24, 1, true, 0, Math.PI), plain(0x0b0c0d, 0.9, 0, { side: THREE.DoubleSide }), [0, S.r, az], [0, 0, Math.PI / 2]);
      well.castShadow = false; well.userData.well = true;
    }

    // Thân vỏ xe dân sự nguyên vẹn giữ bề mặt phẳng mịn, căng mọng, phản chiếu ánh sáng sắc nét;
    // các biến dạng móp méo chỉ xảy ra khi chịu va chạm vật lý thực tế (bị bắn hoặc bị xe tăng cán)


    // --- KHUNG GẦM nhìn thấy qua hốc bánh / dưới gầm: cầu trước / sau, giảm xóc, bình xăng, ống xả chạy dọc gầm
    {
      const metal = plain(new THREE.Color(0x2c2c2c).lerp(new THREE.Color(0x4a3222), age * 0.8), 0.75, 0.5);
      for (const az of [S.axleF, S.axleR]) {
        part(new THREE.CylinderGeometry(0.28, 0.28, S.trackHalf * 2 - 1.4, 10), metal, [0, S.r, az], [0, 0, Math.PI / 2]);
        for (const sx of [1, -1]) part(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 10), metal, [sx * (S.trackHalf - 1.5), S.r + 1.7, az - 0.3], [0.1, 0, sx * 0.12]).userData.well = true;   // giảm xóc
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
        if (r[0] < H) { const t0 = gT[k]; gT[k] = Math.min(1, gT[k] + dt / T_SAG); if (gT[k] > t0) { crushDirty = true; if (Math.abs(x) < 8 && Math.abs(z) < 20) { ax += x; az += z; aw++; } } }
        if (r[0] < gCap[k]) gCap[k] = r[0];
        if (r[1] > gUnd[k]) { gUnd[k] = r[1]; gPx[k] = r[2]; gPz[k] = r[3]; gAl[k] = r[4]; }
      }
      // tải mới dồn lệch về một bên -> bênh nghiêng: bên bị đè lún xuống, bên kia nhổm lên
      if (aw > 3) { const cx = ax / aw, cz = az / aw; tilt.tr += -Math.sign(cx) * Math.min(1, Math.abs(cx) / 5) * 0.045 * Math.min(1, aw / 40); tilt.tp += Math.sign(cz) * Math.min(1, Math.abs(cz) / 12) * 0.025 * Math.min(1, aw / 40); }
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
      const i = Math.round((x - GX0) / CS), j = Math.round((z - GZ0) / CS);
      return i < 0 || j < 0 || i >= NX || j >= NZ ? 1e3 : gCap[j * NX + i];
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
      const k = d[3], under = samp(gUnd, x, z, 0), along = samp(gAl, x, z, 0);
      let X = x + d[0], Y = y + d[1], Z = z + d[2];
      if (k > 0.02) {
        const rx = x * 0.8 + z * 0.6, rz = -x * 0.6 + z * 0.8;
        const n1 = vnoise3(rx * 0.5 + ph, y * 0.6, rz * 0.55), n2 = vnoise3(rz * 1.3, y * 1.4 + ph, rx * 1.1), n3 = vnoise3(rx * 3.1 + 5, y * 2.4, rz * 3.3);
        const rg = n => 0.5 - Math.abs(n - 0.5);
        const amp = 0.85 * k * Math.min(1, Math.max(0.3, y) / 2);
        Y += amp * (1.1 * (rg(n1) - 0.2) + 0.6 * (rg(n2) - 0.2) + 0.3 * (n3 - 0.5));
        X += amp * 0.7 * (n2 - 0.5); Z += amp * 0.6 * (n3 - 0.5);
        if (under > 0.5) Y -= under * 0.06 * sstep(0.35, 0.5, Math.abs(((along / 1.2) % 1 + 1) % 1 - 0.5) * 2) * sstep(0.4, 0.6, n2);
      }
      if (capOn) Y = Math.min(Y, capNear(X, Z));   // không cao hơn đáy xích / gầm đã từng đè chỗ này
      out[0] = X; out[1] = Math.max(0.24, Y); out[2] = Z;
      out[3] = k; out[4] = under; out[5] = along;
      return out;
    };
    // ghi trạng thái gốc mọi thứ trên thân để dựng lại mỗi lần khung đổi
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
      cabIn.visible = !heavy && !cabCap; mats.cabin.side = heavy ? THREE.DoubleSide : THREE.FrontSide;   // khoang sập: tôn gập chồng
      mats.body.userData.uni.uTk.value.w = mats.cabin.userData.uni.uTk.value.w = crushMax > 0.1 ? 1 : 0;
      for (const e of restObj) {
        { let p = e.o.parent; while (p && p !== car) p = p.parent; if (!p) continue; }   // phụ kiện đã văng khỏi xe
        const isRoof = e.o.userData.isRoof || e.o.parent?.userData?.isRoof || e.o.userData.acc === 'roofRail' || e.o.parent?.userData?.acc === 'roofRail';
        const isWell = e.o.userData.well || e.o.parent?.userData?.well;
        const isWiper = e.o.userData.acc === 'wiper' || e.o.parent?.userData?.acc === 'wiper';
        const isStep = e.o.userData.acc === 'step' || e.o.parent?.userData?.acc === 'step';
        if ((isRoof && crushMax > 0.28) || (isWell && crushMax > 0.2) || (isWiper && crushMax > 0.25) || (isStep && crushMax > 0.35)) { e.hidden = true; e.o.visible = false; continue; }
        if (e.geo) { crushGeo(e.geo, false); continue; }
        const o = e.o; o.position.copy(e.p); o.scale.copy(e.s); o.rotation.copy(e.r); o.visible = e.v;
        if (!e.b) e.b = SB.bind([e.p.x, e.p.y, e.p.z]);
        SB.dispOf(e.b, 0, dd);
        if (e.hidden || (o.userData.inner && (dd[3] > 0.4 || cabCap)) || (isWell && (dd[3] > 0.05 || crushMax > 0.2)) || (isRoof && (dd[3] > 0.15 || crushMax > 0.28)) || (isWiper && crushMax > 0.25) || (isStep && crushMax > 0.35)) { e.hidden = true; o.visible = false; continue; }   // nội thất / hốc bánh / phụ kiện nóc / gạt mưa / bậc bước nát kín
        o.position.set(e.p.x + dd[0], Math.max(0.24, e.p.y + dd[1]), e.p.z + dd[2]);
        const ratio = Math.max(0.28, 1 - dd[3] * 0.72);
        o.scale.y *= ratio;
        if (ratio < 0.7) { o.rotation.x += e.j[0] * 0.6; o.rotation.z += e.j[1] * 0.6; }
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
        const hit = Math.max(SB.tireFlat[wi], capW < 2 * S.r ? Math.min(1, (2 * S.r - capW) / (1.4 * S.r)) : 0), effHit = Math.max(hit, sstep(0.35, 0.75, crushMax));
        const lvl = effHit > 0.75 ? 3 : effHit > 0.45 ? 2 : effHit > 0.2 ? 1 : 0;
        if (lvl !== (w.lvl || 0)) {
          w.lvl = lvl;
          const flat = [0, 0.3, 0.5, 0.62][lvl] * S.r, tire = w.g.children[0];
          tire.geometry.dispose(); tire.geometry = tireGeometry(S, flat); w.flat = flat;
          // bánh bị xích nghiền: mâm bám bùn đất, xước mờ; lốp phủ bụi xám
          if (!w.dirty) { w.dirty = true; w.g.traverse(m => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.55).lerp(new THREE.Color(0x4a4032), 0.35); m.material.roughness = Math.min(1, m.material.roughness + 0.35); } }); }
        }
        const [px, py, pz] = SB.wheelPos(wi), flat = w.flat || 0;
        // Thân bị cán đè: bánh xe bị bẻ gãy gục phẳng lì 90 độ sát đất và đẩy lệch ra ngoài mép thân xe
        const lay = sstep(0.25, 0.75, effHit);
        const ang = w.sx * (Math.PI / 2 * lay);
        const flatScale = Math.max(0.55, 1 - 0.45 * effHit);
        const restingY = Math.max(0.32, S.tireW * 0.5 * flatScale * lay + 0.12);
        const yPos = (w.y - flat) * (1 - lay) + restingY;
        const pushOut = w.sx * (1.2 + S.r * 0.65 * lay);
        w.g.position.set(px + pushOut, yPos, pz);
        w.g.rotation.set(0, w.sx * 0.12 * effHit, ang);
        // Ép dẹp bề dày bánh xe (trục X) để bánh xe dẹp phẳng đầm chắc trên mặt đường
        w.g.scale.set((1 - lay) + flatScale * lay, 1, 1);
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
      const flat = rnd() < age * 0.35 ? S.r * 0.3 : 0;
      const wg = wheelGroup(S, mats, sx, flat);
      wg.position.set(sx * S.trackHalf, S.r - flat, az);
      g.add(wg); wheels.push({ g: wg, x: sx * S.trackHalf, y: S.r - flat, z: az, sx, base: 0 });
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
      // thảm kính cường lực vỡ vụn (hạt nhỏ lấp lánh) rải dưới và quanh xác xe, dày nhất 2 bên khoang kính
      for (let i = 0; i < 8; i++) {
        const gm = new THREE.Mesh(new THREE.PlaneGeometry(11 + rnd() * 8, 11 + rnd() * 8), new THREE.MeshStandardMaterial({ map: glassCrumbTexture(rnd), transparent: true, roughness: 0.05, metalness: 0.6, envMap: env, envMapIntensity: 1.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
        gm.rotation.set(-Math.PI / 2, 0, rnd() * 6.3); gm.position.set((i % 2 ? 1 : -1) * (9 + rnd() * 5), 0.07, (i >> 1) * 9 - 13 + (rnd() - 0.5) * 6); gm.renderOrder = -1; g.add(gm);
      }
      // gương, biển số, phụ kiện nằm trong vùng bị đè: rơi xuống nằm phẳng bẹp trên mặt đường
      car.children.slice().forEach(o => {
        if (!o.userData.acc) return;
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
    const PFX = (() => {
      const MAXN = 900, pos = new Float32Array(MAXN * 3), col = new Float32Array(MAXN * 3), siz = new Float32Array(MAXN), alp = new Float32Array(MAXN);
      const life = new Float32Array(MAXN), age0 = new Float32Array(MAXN), vel = new Float32Array(MAXN * 3), kind = new Uint8Array(MAXN), grow = new Float32Array(MAXN);
      const mk = additive => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(siz, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1));
        const mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          uniforms: { uK: { value: additive ? 1 : 0 } },
          vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uK;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * step(0.5, abs(uK - (color.r > 1.5 ? 0.0 : 1.0)) + 0.5) ; vC = color.r > 1.5 ? color - vec3(2.0, 0.0, 0.0) : color; gl_PointSize = clamp(size * 420.0 / -mv.z, 2.0, 140.0); gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying float vA; varying vec3 vC; uniform float uK;\nvoid main(){ vec2 d = gl_PointCoord - vec2(0.5); float r = length(d) * 2.0; if (r > 1.0) discard; float ang = atan(d.y, d.x); if (uK < 0.5) { float organic = 0.94 + 0.04 * sin(ang * 3.0 + 1.2) + 0.02 * cos(ang * 5.0 - 0.8); float dist = r / organic; if (dist > 1.0) discard; float softPuff = exp(-dist * dist * 2.6) * smoothstep(1.0, 0.1, dist); float a = softPuff * vA * 0.42; gl_FragColor = vec4(vC, a); } else { float fireShape = 0.90 + 0.07 * sin(ang * 3.0); float dist = r / fireShape; if (dist > 1.0) discard; float a = (1.0 - dist) * (1.0 - dist) * vA; gl_FragColor = vec4(vC * a, a); } }'
        });
        const p = new THREE.Points(geo, mat); p.frustumCulled = false; return p;
      };
      // 2 lớp: lửa (cộng sáng) và khói (che phủ) dùng chung mảng, lớp không thuộc thì alpha = 0 ở đúng lớp đó
      const fireP = mk(true), smokeP = mk(false);
      const fireA = new Float32Array(MAXN), smokeA = new Float32Array(MAXN);
      fireP.geometry.setAttribute('alpha', new THREE.BufferAttribute(fireA, 1)); smokeP.geometry.setAttribute('alpha', new THREE.BufferAttribute(smokeA, 1));
      fireP.material.vertexShader = smokeP.material.vertexShader = 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha; vC = color; gl_PointSize = size * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }';
      let n = 0;
      const add = (k, x, y, z, vx, vy, vz, s, lf, gr) => {
        const i = n++ % MAXN;
        pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z; vel[3 * i] = vx; vel[3 * i + 1] = vy; vel[3 * i + 2] = vz;
        siz[i] = s; life[i] = lf; age0[i] = 0; kind[i] = k; grow[i] = gr;
      };
      const update = dt => {
        for (let i = 0; i < MAXN; i++) {
          if (age0[i] >= life[i]) { fireA[i] = smokeA[i] = 0; continue; }
          age0[i] += dt; const t = age0[i] / life[i];
          pos[3 * i] += vel[3 * i] * dt; pos[3 * i + 1] += vel[3 * i + 1] * dt; pos[3 * i + 2] += vel[3 * i + 2] * dt;
          vel[3 * i] *= 1 - dt * 1.2; vel[3 * i + 2] *= 1 - dt * 1.2;
          siz[i] += grow[i] * dt;
          if (kind[i] === 0) {        // lửa: vàng trắng -> cam -> đỏ sẫm, tắt nhanh
            vel[3 * i + 1] += 14 * dt;
            col[3 * i] = 1; col[3 * i + 1] = 0.85 - 0.6 * t; col[3 * i + 2] = 0.45 - 0.42 * t;
            fireA[i] = (1 - t) * Math.min(1, t * 12) * 0.9; smokeA[i] = 0;
          } else if (kind[i] === 1) { // khói đen dầu / cao su cháy, nhạt dần thành xám
            vel[3 * i + 1] += 4 * dt;
            const c = 0.08 + 0.32 * t; col[3 * i] = c; col[3 * i + 1] = c * 0.97; col[3 * i + 2] = c * 0.94;
            smokeA[i] = (1 - t) * Math.min(1, t * 5) * 0.9; fireA[i] = 0;
          } else {                    // tia lửa / tàn: bay vọt, rơi theo trọng lực
            vel[3 * i + 1] -= 60 * dt;
            col[3 * i] = 1; col[3 * i + 1] = 0.6; col[3 * i + 2] = 0.2; fireA[i] = (1 - t); smokeA[i] = 0;
            if (pos[3 * i + 1] < 0.1) { pos[3 * i + 1] = 0.1; vel[3 * i + 1] *= -0.3; }
          }
        }
        for (const p of [fireP, smokeP]) for (const k of ['position', 'color', 'size', 'alpha']) p.geometry.attributes[k].needsUpdate = true;
      };
      return { fireP, smokeP, add, update };
    })();
    let pfxOn = false;
    const pfx = () => { if (!pfxOn) { pfxOn = true; g.add(PFX.smokeP, PFX.fireP); } return PFX; };
    const fire = { on: false, t: 0, fuel: W.fuel, boom: -1, char: 0, light: null, ign: [0, 0, 0] };
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
      return new THREE.MeshBasicMaterial({ map: HOLE_TEX[key][rnd() * 4 | 0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0xdddddd });
    };
    const scorchMat = new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      for (let i = 0; i < 30; i++) { const r = 20 + rnd() * 40, gr = x.createRadialGradient(64 + (rnd() - 0.5) * 30, 64 + (rnd() - 0.5) * 30, 0, 64, 64, r); gr.addColorStop(0, 'rgba(8,6,4,0.5)'); gr.addColorStop(1, 'rgba(8,6,4,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
      return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const rcH = new THREE.Raycaster();
    const surfaceHit = (o, d) => {
      // o, d trong hệ xe con (g) -> đổi sang hệ thế giới để raycast (xe đặt ở vị trí / hướng bất kỳ)
      g.updateMatrixWorld(true);
      rcH.set(new THREE.Vector3(...o).applyMatrix4(g.matrixWorld), new THREE.Vector3(...d).transformDirection(g.matrixWorld));
      const h = rcH.intersectObjects([body, cabin], false)[0];
      if (!h) return null;
      return { p: h.point.clone().applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), n: h.face.normal.clone(), obj: h.object };
    };
    const decal = (h, size, mat) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(size, 12), mat);
      m.position.copy(h.p).addScaledVector(h.n, 0.04); m.lookAt(m.position.clone().add(h.n)); m.rotateZ(rnd() * 6.3); m.renderOrder = 2;
      g.add(m); return m;
    };
    // vỡ kính: không truyền ô -> mọi ô (nổ lớn / cháy); có toạ độ trúng -> chỉ ô đó (kính hông cường lực vỡ vụn rơi, kính chắn gió rạn)
    const shatterGlass = (p) => {
      const u = mats.cabin.userData.uni;
      if (!p) { u.uE.value.set(0, 6, 40, 2); return; }
      if (p.z > S.roofF - 0.5 && p.y > top(p.z) - 0.3 && Math.abs(p.x) < plan(p.z) - 1.5) { u.uBk.value.x = 1; u.uE.value.set(p.x, p.z, 5, 1); }
      else if (p.z < S.roofR + 0.5 && Math.abs(p.x) < plan(p.z) - 1.5) u.uBk.value.y = 1;
      else if (p.z > S.zB) { if (p.x > 0) u.uBk.value.w = 1; else u.uBk.value.z = 1; }
      else { if (p.x > 0) u.uBk2.value.y = 1; else u.uBk2.value.x = 1; }
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
      fire.boom = fire.fuel > 0.4 ? 3.5 + 4 * rnd() : -1;
      // Ánh sáng lửa hắt nhẹ từ gầm / khoang máy ra mặt đường, không chiếu trực diện làm lóa kính
      fire.light = new THREE.PointLight(0xff6a18, 0, 32, 2);
      fire.light.position.set(0, 1.2, 4);
      g.add(fire.light);
      shatterGlass();
      events.push('ignite');
    };
    const fuelBlast = () => {
      events.push('fuelBlast');
      const P2 = pfx();
      for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, sp = 10 + rnd() * 30; P2.add(0, (rnd() - 0.5) * 6, 3, -12 + (rnd() - 0.5) * 6, Math.cos(a) * sp, 12 + rnd() * 30, Math.sin(a) * sp, 4 + rnd() * 5, 0.6 + rnd() * 0.6, 9); }
      for (let i = 0; i < 30; i++) P2.add(1, (rnd() - 0.5) * 8, 6, -10 + (rnd() - 0.5) * 8, (rnd() - 0.5) * 14, 14 + rnd() * 12, (rnd() - 0.5) * 14, 6 + rnd() * 5, 5 + rnd() * 4, 7);
      for (let i = 0; i < 40; i++) P2.add(2, 0, 3, -12, (rnd() - 0.5) * 80, 20 + rnd() * 60, (rnd() - 0.5) * 80, 0.5, 1.2 + rnd(), 0);
      SB.impulse(0, 1.5, -12, 16, 1600);
      shatterGlass();
      if (!debrisDone) { debrisDone = true; spawnDebris(); }
      g.add(decal({ p: new THREE.Vector3(0, 0.08, -8), n: new THREE.Vector3(0, 1, 0) }, 24, scorchMat));
    };
    // Loại đạn -> hiệu ứng: súng máy thủng lỗ / vỡ kính / xẹp lốp; xuyên giáp thủng xuyên 2 bên; HE / RPG / tên lửa xé toạc,
    // hất xác, cháy; đạn cháy châm lửa. (ox..oz điểm đầu tia bắn, dx..dz hướng bay — hệ toạ độ xe con)
    const AMMO = {
      SCOUT_BULLET: { pw: 0.02, hole: 0.18 }, GATLING_BULLET: { pw: 0.03, hole: 0.2 },
      INCENDIARY_HMG: { pw: 0.03, hole: 0.2, inc: 0.35 }, INCENDIARY: { pw: 0.04, hole: 0.22, inc: 0.5 },
      AP: { pw: 0.3, hole: 0.6, through: true },
      CLUSTER_SUBMUNITION: { pw: 0.45, hole: 1.0, inc: 0.3, he: true }, CLUSTER: { pw: 0.55, hole: 1.2, inc: 0.4, he: true },
      RPG: { pw: 0.75, hole: 1.3, inc: 0.8, he: true }, ANTI_TANK_MISSILE: { pw: 0.95, hole: 1.6, inc: 0.95, he: true },
      NORMAL: { pw: 0.9, hole: 1.5, inc: 0.6, he: true }, HE: { pw: 1, hole: 1.8, inc: 0.7, he: true }
    };
    const shoot = (ox, oy, oz, dx, dy, dz, ammo) => {
      const A = AMMO[ammo] || AMMO.HE, h = surfaceHit([ox, oy, oz], [dx, dy, dz]);
      if (!h) return false;
      const glassHit = h.obj === cabin && Math.abs(h.n.y) < 0.85 && h.p.y > top(h.p.z) + 0.4;
      events.push(A.he ? 'blast' : glassHit ? 'glass' : 'ping');
      if (glassHit) shatterGlass(h.p); else decal(h, A.hole * (0.8 + 0.4 * rnd()), holeMat());
      if (A.through) {   // xuyên giáp: lỗ ra phía bên kia (mép xé ra ngoài), kính vỡ
        const o2 = [h.p.x + dx * 30, h.p.y + dy * 30, h.p.z + dz * 30], h2 = surfaceHit(o2, [-dx, -dy, -dz]);
        if (h2) { decal(h2, A.hole * 1.4, holeMat(true)); shatterGlass(h2.p); }
      }
      flattenNear(h.p, A.he ? 8 : 3.2);
      if (A.he) {
        SB.impulse(h.p.x - dx * 1.5, h.p.y - dy * 1.5, h.p.z - dz * 1.5, 5 + 11 * A.pw, 300 + 1300 * A.pw);
        shatterGlass();
        decal(h, 3 + 4 * A.pw, scorchMat);
        const P2 = pfx();
        for (let i = 0; i < 30 * A.pw; i++) P2.add(0, h.p.x, h.p.y, h.p.z, (rnd() - 0.5) * 30, 5 + rnd() * 20, (rnd() - 0.5) * 30, 3 + rnd() * 3, 0.35 + rnd() * 0.3, 6);
        for (let i = 0; i < 25 * A.pw; i++) P2.add(2, h.p.x, h.p.y, h.p.z, (rnd() - 0.5) * 70, 10 + rnd() * 50, (rnd() - 0.5) * 70, 0.4, 1 + rnd(), 0);
        for (let i = 0; i < 12 * A.pw; i++) P2.add(1, h.p.x, h.p.y + 2, h.p.z, (rnd() - 0.5) * 10, 8 + rnd() * 8, (rnd() - 0.5) * 10, 5 + rnd() * 3, 3 + rnd() * 2, 5);
        if (A.pw > 0.5) { crushMax = Math.max(crushMax, 0.3); if (!debrisDone) { debrisDone = true; spawnDebris(); } }
      } else SB.impulse(h.p.x, h.p.y, h.p.z, 1.5, 30 * A.pw / 0.03);
      // bắt lửa: còn xăng mới cháy; trúng gần bình xăng (đuôi xe, thấp) dễ cháy hơn
      const nearTank = h.p.z < -8 && h.p.y < 5 ? 1.6 : 1;
      if (A.inc && fire.fuel > 0.05 && rnd() < A.inc * nearTank) ignite(h.p.x, h.p.y, h.p.z);
      return true;
    };
    // cháy theo thời gian: lửa bốc từ chỗ trúng lan khắp khoang (~6 s), khói đen cột cao, nổ bình xăng nếu còn nhiều xăng,
    // sơn cháy rộp thành khung đen gỉ, lốp cháy rụi, kính rơi hết; hết xăng / vật liệu cháy (~45-70 s) thì tắt, âm ỉ khói
    const burnColor = new THREE.Color(0x1c1612), bodyCol0 = mats.body.color.clone(), cabCol0 = mats.cabin.color.clone(), paintCol0 = mats.paint.color.clone();
    const fireUpdate = dt => {
      if (pfxOn) PFX.update(dt);
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
            P2.add(0, lx, ly, lz, (rnd() - 0.5) * 2, 5 + rnd() * 8, (rnd() - 0.5) * 2, 0.8 + rnd() * 1.0 * k, 0.3 + rnd() * 0.3, 0.8);
          } else if (!inGame) {
            // Khi chạy ngoài game: khói nhẹ nhàng mờ ảo, không che phủ thành cục đen
            P2.add(1, lx, ly + 2, lz, (rnd() - 0.5) * 2, 6 + rnd() * 5, (rnd() - 0.5) * 2, 1.4 + rnd() * 1.2, 2.5 + rnd() * 2, 1.8);
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
        // trần vệt xích đổi (capOn) cũng phải dựng lại dù khung không động đậy
        if ((SB.step(dt) && SB.consumeMoved()) || (capOn && crushDirty)) rebuild();
        fireUpdate(dt);
        for (const fl of flows) { fl.t += dt; const k = 0.15 + 0.85 * (1 - Math.exp(-fl.t / 6)); fl.m.scale.set(k, k, 1); }   // dầu / nước làm mát loang dần
      },
      // trúng đạn tại (x, y, z) hệ xe con: power 0..1 (đạn súng máy ~0.05, đạn pháo HE ~1), mảnh văng + móp tiếp
      // đạn bay từ (ox, oy, oz) theo hướng (dx, dy, dz) trong hệ xe con, loại đạn ammo (khoá AMMO). Trả về true nếu trúng
      shoot(ox, oy, oz, dx, dy, dz, ammo) { return shoot(ox, oy, oz, dx, dy, dz, ammo); },
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
