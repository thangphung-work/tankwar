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
      pillarA: 0.45, pillarC: 0.75, zB: -0.9, zDiv: -8.7,
      rearDlo: [-10.0, 1.95, 8.3], // mép sau ô kính hông: z = a + b * (y - c) (song song kính hậu)
      doors: [7.4, -0.9, -8.7], sill: 2.3, bumperF: [14.9, 4.9], bumperR: [-13.9, 5.2],
      hood: [7.6, 16.3], trunk: [-12.6, 6.5], fuel: [-12.45, 6.55, 0.62, 0.55],
      // đèn: trước (z mép sau phần ôm góc, x mép trong, cao, hạ so với mép capô), lưới (nửa rộng, hạ, cao, y hốc gió dưới),
      // hậu (z, x mép trong, cao, hạ); y biển số trước / sau
      lamps: { front: [15.9, 2.9, 1.0, 0.25], grille: [2.45, 0.35, 0.95, 3.0], rear: [-17.0, 3.1, 1.0, 0.3] }, plates: [3.6, 4.9],
      // cụm lắp vào lỗ khoét (mặt chiếu U-V, xem buildFeature)
      features: {
        head: { kind: 'head', dir: [0.55, 1], pts: [[-6.1, 4.5], [-1.85, 5.0], [-1.7, 5.6], [-6.3, 5.25]], r: 0.2, zMin: 14, depth: 0.75, backMat: 'reflector',
          proj: [[-5.0, 4.98, 0.3, 'lens'], [-3.75, 5.12, 0.3, 'bowl']], drl: [[-6.0, 4.48], [-2.1, 4.95]], lensColor: (u, v) => u > -2.4 ? [1, 0.8, 0.5] : [1, 1, 1] },
        tail: { kind: 'tail', dir: [0.45, -1], pts: [[-4.6, 6.4], [-0.9, 6.45], [-0.8, 7.12], [-4.6, 7.22]], r: 0.15, zMin: -14, depth: 0.5, backMat: 'tailBack',
          lensColor: (u, v) => v < 6.8 && u < -3.6 ? [0.95, 0.95, 0.95] : v < 6.8 && u < -2.9 ? [1, 0.55, 0.1] : [0.8, 0.04, 0.03] },
        grille: { kind: 'grille', sym: true, dir: [0, 1], pts: [[-2.3, 4.25], [2.3, 4.25], [2.55, 5.08], [-2.55, 5.08]], r: 0.22, zMin: 15, depth: 0.7 },
        intake: { kind: 'intake', sym: true, dir: [0, 1], pts: [[-3.75, 2.62], [3.75, 2.62], [4.0, 2.98], [-4.0, 2.98]], r: 0.2, zMin: 15, depth: 0.5 },
        fog: { kind: 'fog', dir: [0, 1], pts: [[4.85, 2.92], [4.9, 2.92], [4.9, 2.97], [4.85, 2.97]], r: 0.33, zMin: 15, depth: 0.35, backMat: 'reflector' }
      }, bumperTop: [4.3, 5.55], rakeF: [13.5, 3.7, 0.2], rakeR: [-14.5, 4.6, 0.07]
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
    return spline2([
      [0, y0], [w - 1.3, y0], [w - 0.62, y0 + Math.min(0.12, h * 0.05)], [w - 0.4, y0 + Math.min(0.55, h * 0.15)],
      [w - 0.12, y0 + h * 0.32], [w, y0 + h * 0.56], [w - 0.03, y1 - Math.min(0.85, h * 0.28)], [w - 0.2, y1 - Math.min(0.42, h * 0.16)],
      [w - 0.5, y1 - 0.06], [w - 1.3, y1 + 0.04], [w * 0.45, y1 + 0.16], [0, y1 + 0.19]
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
    for (let z = z0; z <= z1 + 1e-6; z += 0.2) {
      const yb = top(z) - 0.14, yr = Math.max(yb + 0.06, roof(z)), hh = yr - yb, w0 = plan(z) - S.inset, w1 = w0 - S.tumble;
      const half = spline2([[0, yb], [w0, yb], [w0 - S.tumble * 0.3, yb + hh * 0.5], [w1 + 0.25, yr - Math.min(0.4, hh * 0.3)],
        [w1 - 0.6, yr - Math.min(0.04, hh * 0.03)], [w1 * 0.45, yr + 0.07], [0, yr + 0.1]], SM);
      const A = arcs(half), aCorner = A[3 * SM], aBase = A[SM];
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
uniform vec4 uTk;
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
    // gỉ sét: mép dưới thân, vòm bánh, rìa chỗ bong sơn, vài đốm rải rác
    float rustM = smoothstep(2.0, 0.0, y - yBot) * 1.15 + smoothstep(0.84, 0.9, fbm(wp * 0.6 + 7.0)) + peel * 0.5;
    float rust = uW.z * smoothstep(0.5, 0.6, rustM * (0.35 + 0.8 * nF));
    vec3 rc = mix(vec3(0.15, 0.06, 0.028), vec3(0.4, 0.17, 0.06), fbm(wp * 2.5));
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
  }
  if (Nn.z < -0.35) {
    float lt = vRef.z - uR.w;
    seam = max(seam, step(ax, uR.y) * aaLine(y - uC.w, gap));
    seam = max(seam, step(uC.w, y) * step(y, lt) * aaLine(ax - uR.y, gap));
    seam = max(seam, step(uR.y, ax) * step(ax, hoodEdge) * aaLine(y - lt - 0.06, gap));
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
  // nẹp crôm giữa 2 đèn hậu trên nắp cốp; tấm phản quang đỏ trên cản sau
  if (z < uR.x && Nn.z < -0.3) {
    float yt = vRef.z - uR.w;
    float gk = step(ax, uR.y - 0.1) * fillAA(abs(y - (yt - 0.3)) - 0.12);
    LAY(gk, vec3(0.7), 1.0, 0.15, 1.0)
    float rf = fillAA(sdBox2(vec2(ax - uG.x * 2.0, y - 3.75), vec2(0.6, 0.11), 0.1));
    LAY(rf, vec3(0.3, 0.01, 0.01), 0.0, 0.2, 1.0)
    featK = max(featK, max(gk, rf));
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
  float dRr = rmax(rmax(side, z - (uC.x - 0.5), 0.3), zC - z, 0.35);
  float d = min(min(dW, dR), min(dF, dRr));
  float f = clamp(fwidth(d), 1e-4, 0.06);
  float glassK = 1.0 - smoothstep(-f, f, d);
  float rub = (1.0 - smoothstep(0.1 - f, 0.1 + f, d)) * (1.0 - glassK);
  float pil = (1.0 - smoothstep(-f, f, side)) * (1.0 - smoothstep(0.5 - f, 0.5 + f, abs(z - uC.x)));
  float dv = (1.0 - smoothstep(0.12 - f, 0.12 + f, abs(z - uC.y))) * glassK; glassK -= dv;
  float trimK = max(max(rub, pil), dv);
  // viền gốm đen quanh kính chắn gió / kính hậu + dải chấm nhỏ dần vào trong
  float dWR = min(dW, dR), fw = clamp(fwidth(dWR), 1e-4, 0.06);
  float frit = smoothstep(-0.3 - fw, -0.3 + fw, dWR);
  vec2 cell = fract(vec2(x, (z + y) * 0.7071) / 0.16) - 0.5;
  float dots = fillAA(length(cell) - 0.48 * clamp((dWR + 0.62) / 0.32, 0.0, 1.0)) * step(-0.62, dWR);
  float fritK = glassK * max(frit, dots) * step(uE.w, 1.5);   // xác bị cán: kính dẹt, bỏ viền gốm (vạch đạo hàm vỡ)
  LAY(trimK, vec3(0.012), 0.0, 0.5, 0.4)
  LAY(glassK, vec3(0.13, 0.145, 0.15), 0.0, 0.14, 1.0)
  LAY(fritK, vec3(0.008), 0.0, 0.3, 1.0)
  float glassOnly = glassK * (1.0 - fritK);
  float alphaO = mix(1.0, 0.66, glassOnly);
  float paintK = 1.0 - max(trimK, glassK), yBot = -100.0, yBelt = -100.0, dustK = paintK;
` + GLSL_WEATHER + GLSL_CRUSH + `
  // kính: màng bụi loang, đọng dày ở mép dưới
  float gd = glassK * (0.25 + uW.y) * clamp(0.45 + 0.6 * fbm(vRest * 0.35 + uW.w) + 0.4 * smoothstep(1.2, 0.2, v), 0.0, 1.0);
  cO = mix(cO, vec3(0.45, 0.43, 0.39), gd * 0.6); rO = mix(rO, 0.55, gd); alphaO = mix(alphaO, 0.97, gd); ccO *= 1.0 - 0.6 * gd;
  // rạn nứt kính chắn gió: tia nứt toả từ điểm va + vòng nứt đồng tâm
  if (uE.w > 0.0 && z > uA.y) {
    vec2 cp = vec2(x, z) - uE.xy; float rr = length(cp), an = atan(cp.y, cp.x);
    float fall = smoothstep(uE.z, 0.0, rr);
    float rays = aaLine(sin(an * 7.0 + fbm(vec3(an * 2.0, rr * 0.7, 3.0)) * 5.0) * rr * 0.5, 0.035) * fall;
    float rings = aaLine(sin(rr * 5.0 + fbm(vec3(cp * 1.3, 1.0)) * 3.0) * 0.25, 0.03) * smoothstep(uE.z * 0.55, 0.0, rr);
    float cr = clamp(max(rays, rings) + fillAA(rr - 0.18), 0.0, 1.0) * glassK;
    cO = mix(cO, vec3(0.78, 0.8, 0.8), cr * 0.85); alphaO = mix(alphaO, 1.0, cr); rO = mix(rO, 0.3, cr);
  }
  // xe bị cán bẹp: kính hông / kính hậu vỡ vụn rơi hết (kính chắn gió dán keo nên chỉ rạn)
  if (uE.w > 1.5 || vCr.z > 0.2) {
    float kc = max(smoothstep(0.2, 0.5, vCr.z), step(1.5, uE.w));
    if (z > uA.y) {
      // kính chắn gió dán nhiều lớp: không rơi, vẫn sẫm bóng phản chiếu, mạng nứt mảnh đa giác (mảnh nhỏ ở chỗ bị ép mạnh),
      // vết nứt bắt sáng trắng mảnh, vài mảng lớp phim bị rách lộ lỗ thủng
      vec2 cp = vec2(x, z + y * 0.6);
      float e1 = crackEdge(cp * (1.2 + 2.0 * kc)), e2 = crackEdge(cp * (4.0 + 4.0 * kc) + 3.1);
      float fw1 = fwidth(e1) + 1e-4, fw2 = fwidth(e2) + 1e-4;
      float cr = max(1.0 - smoothstep(0.0, 0.012 + fw1, e1), 0.5 * (1.0 - smoothstep(0.0, 0.01 + fw2, e2)) * kc);
      cO = mix(cO, vec3(0.2, 0.23, 0.23), cr * glassOnly * kc * 0.55); rO = mix(rO, 0.12, cr * glassOnly * kc); mO = mix(mO, 0.3, cr * glassOnly * kc);
      alphaO = mix(alphaO, 0.8, glassOnly * kc * 0.5);
      if (glassOnly > 0.5 && kc > 0.55 && vnoise(vec3(cp * 0.55, 7.0)) > 0.62) discard;
    } else {
      // kính hông / kính hậu cường lực: vỡ vụn rơi hết, chỉ còn rìa kính lởm chởm bám quanh gioăng khung
      float rim = 0.08 + 0.22 * vnoise(vec3(vRest * 2.5));
      if (glassOnly > 0.5 && kc > 0.15 && -d > rim) discard;
      vec2 cp = vec2(z + x, y) * 6.0; float e = crackEdge(cp);
      cO = mix(cO, vec3(0.25, 0.28, 0.28), glassOnly * kc * (1.0 - smoothstep(0.0, 0.05, e)) * 0.6);
    }
  }
  // mặt trong khoang (nhìn xuyên kính sang cột / khung cửa / trần bên kia): ốp nhựa xám, trần nỉ
  if (!gl_FrontFacing) { float ins = 1.0 - glassOnly; cO = mix(cO, vec3(0.13, 0.125, 0.12), ins); rO = mix(rO, 0.92, ins); mO *= 1.0 - ins; ccO *= 1.0 - ins; }
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
    Object.assign(U, { uF: L.front, uG: L.grille, uR: L.rear, uI: [S.inset + 0.15, S.cabin[0][0] + 0.2, S.cabin[S.cabin.length - 1][0] - 0.2, 0], uW: [W.dust, W.age, W.rust, W.seed], uTk: W.track || [0, 0, 0, 0] });
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
      add(capGeometry(rings, center, d, F.lensColor, uvs), M.tailLens);
      for (const sc of [0.62, 0.32]) {
        const pts = outline.map(p => { const u = P.cuv[0] + (p[0] - P.cuv[0]) * sc, v = P.cuv[1] + (p[1] - P.cuv[1]) * (sc + 0.25); return at(u, v, depth * 0.35); }).filter(Boolean);
        if (pts.length > 6) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.06, 6, true), M.tailGuide);
      }
    } else if (F.kind === 'grille') {
      // nan ngang lùi vào trong + viền crôm có độ dày quanh miệng lưới
      const [v0, v1] = [Math.min(...outline.map(p => p[1])), Math.max(...outline.map(p => p[1]))], hw = Math.max(...outline.map(p => p[0]));
      for (let v = v0 + 0.14; v < v1 - 0.08; v += 0.24) { const p = at(0, v, 0.32); if (p) { const sl = add(roundBox(2 * hw - 0.15, 0.08, 0.28, 0.03), M.slat); sl.position.copy(p); sl.rotation.x = -0.25; } }
    } else if (F.kind === 'intake') {
      const [v0, v1] = [Math.min(...outline.map(p => p[1])), Math.max(...outline.map(p => p[1]))], hw = Math.max(...outline.map(p => p[0]));
      const p = at(0, (v0 + v1) / 2, 0.22); if (p) { const m = add(new THREE.PlaneGeometry(2 * hw - 0.1, v1 - v0 - 0.05), M.honey); m.position.copy(p); }
    }
  }
  function honeyTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.globalCompositeOperation = 'destination-out';
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const cx = i * 16 + (j % 2) * 8, cy = j * 14; x.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; x.lineTo(cx + Math.cos(a) * 6.3, cy + Math.sin(a) * 6.3); } x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1.2);
    return t;
  }
  // lốp: hoa lốp khối + rãnh, chữ nổi trên thành lốp (u quanh bánh, v dọc biên dạng)
  function tireTexture(age) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d');
    const base = 46 + age * 30 | 0; x.fillStyle = `rgb(${base},${base},${base - 2})`; x.fillRect(0, 0, 1024, 64);
    // hoa lốp ở giữa biên dạng (v ~ 0.25..0.75)
    x.fillStyle = `rgb(${base * 0.35 | 0},${base * 0.35 | 0},${base * 0.35 | 0})`;
    for (let i = 0; i < 64; i++) { const u = i * 16; x.fillRect(u, 18, 3, 9); x.fillRect(u + 8, 37, 3, 9); x.save(); x.translate(u + 4, 27); x.rotate(0.5); x.fillRect(0, 0, 2, 10); x.restore(); }
    // chữ trên 2 thành lốp
    x.fillStyle = `rgb(${base + 9},${base + 9},${base + 8})`; x.font = 'bold 7px Arial'; x.textBaseline = 'middle';
    for (const v of [4.5, 59.5]) for (let k = 0; k < 2; k++) { x.fillText('ALL SEASON  205/55 R16 91V  RADIAL TUBELESS', 30 + k * 512, v); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
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
    const c = document.createElement('canvas'); c.width = 256; c.height = 56;
    const x = c.getContext('2d');
    x.fillStyle = '#e9e6dc'; x.fillRect(0, 0, 256, 56);
    x.strokeStyle = '#222'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 48);
    x.fillStyle = '#1b1b1b'; x.font = 'bold 38px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 30);
    for (let i = 0; i < 260 * age; i++) { x.fillStyle = `rgba(${90 + rnd() * 40 | 0},${70 + rnd() * 30 | 0},${40 + rnd() * 20 | 0},${0.05 + rnd() * 0.25 * age})`; const s = 2 + rnd() * 14; x.fillRect(rnd() * 256, rnd() * 56, s, s * (0.3 + rnd())); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return t;
  }

  // ---------------------------------------------------------------------------
  // BÁNH: lốp có rãnh dọc + thành lốp phồng, mâm hợp kim 5 chấu (đùn từ biên dạng, vát mép), lòng mâm, môi mâm, đĩa
  // phanh gỉ, cùm phanh, ốp tâm, ốc tắc kê. flat: lốp xẹp bẹp đáy (tâm bánh hạ xuống)
  // ---------------------------------------------------------------------------
  let RIM_GEO = null;
  function rimFace(R) {
    if (RIM_GEO) return RIM_GEO;
    const parts = [], ri = R * 0.27, ro = R * 0.97, dish = 0.42;
    for (let i = 0; i < 10; i++) {
      // chấu: tiết diện hình thang (mặt ngoài hẹp, vát 2 cạnh), to dần về phía moay-ơ
      const len = ro - ri, b = new THREE.BoxGeometry(len, 1, 0.16, 6, 1, 1), A = b.attributes.position;
      for (let k = 0; k < A.count; k++) {
        const t = (A.getX(k) + len / 2) / len, w = R * (0.085 - 0.03 * t) * (i % 2 ? 0.8 : 1), z = A.getZ(k);
        A.setY(k, A.getY(k) * w * (z > 0 ? 2.6 : 3.4));
        A.setZ(k, z - dish * Math.pow(1 - t, 1.3));
        A.setX(k, ri + t * len);
      }
      b.computeVertexNormals();
      b.rotateZ(i * Math.PI / 5 + (i % 2 ? 0.12 : 0));
      parts.push(b);
    }
    // moay-ơ + vành ngoài mặt mâm
    const hub = new THREE.CylinderGeometry(ri * 1.15, ri * 1.3, 0.3, 24); hub.rotateX(Math.PI / 2); hub.translate(0, 0, -dish + 0.02); parts.push(hub);
    const ring = new THREE.LatheGeometry([[R * 0.9, -0.12], [R * 0.93, 0.06], [R * 0.99, 0.08], [R * 1.0, -0.2]].map(([a, b]) => new THREE.Vector2(a, b)), 64); ring.rotateX(Math.PI / 2); parts.push(ring);
    RIM_GEO = mergeGeos(parts);
    return RIM_GEO;
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
    add(new THREE.CylinderGeometry(R * 0.99, R * 0.99, w * 0.8, 36, 1, true), mats.barrel, 0, [0, 0, Math.PI / 2]);
    add(new THREE.TorusGeometry(R * 0.995, 0.06, 8, 64), mats.lip, sx * 0.68, [0, Math.PI / 2, 0]);
    add(new THREE.CylinderGeometry(R * 0.78, R * 0.78, 0.22, 32), mats.disc, -sx * 0.05, [0, 0, Math.PI / 2]);
    add(new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.3, 20), mats.barrel, sx * 0.15, [0, 0, Math.PI / 2]);
    const cal = add(roundBox(0.5, R * 0.75, 0.62, 0.12), mats.caliper, sx * 0.14);
    cal.rotation.set(0, sx * Math.PI / 2, 0); cal.position.y = R * 0.5; cal.position.z = -R * 0.45; cal.rotation.x = 0.7;
    add(new THREE.CylinderGeometry(R * 0.15, R * 0.17, 0.12, 18), mats.cap, sx * 0.32, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + Math.PI / 5, nut = add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), mats.chrome, sx * 0.3, [0, 0, Math.PI / 2]);
      nut.position.y = Math.cos(a) * R * 0.27; nut.position.z = Math.sin(a) * R * 0.27;
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
    const S = SPEC[kind], age = opts.age !== undefined ? opts.age : 0.6, seed = opts.seed || 1, rnd = mulberry(seed * 9301 + 49297);
    const color = new THREE.Color(opts.color !== undefined ? opts.color : 0x7a1512);
    const W = {
      age, fuel: opts.fuel !== undefined ? opts.fuel : (rnd() < 0.6 ? 0.25 + 0.75 * rnd() : 0), dust: 0.25 + 0.65 * age * (0.6 + 0.4 * rnd()), rust: age * (0.5 + 0.5 * rnd()), seed: rnd() * 10,
      crack: opts.crush > 0.3 ? [(rnd() - 0.5) * 3, 4.5, 40, opts.crush > 0.6 ? 2 : 1] : rnd() < age * 0.7 ? [(rnd() - 0.5) * 6, 4.2 + rnd() * 2, 2.5 + rnd() * 3, 1] : [0, 0, 0, 0]
    };
    const trk = opts.track || { angle: (rnd() < 0.35 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.7, offset: (rnd() - 0.5) * 12 };
    if (opts.crush) W.track = [Math.cos(trk.angle), Math.sin(trk.angle), trk.offset, opts.crush];
    const env = envCube();
    const plain = (c, r, m, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m, envMap: env, envMapIntensity: 1 }, extra || {}));
    const rimCol = new THREE.Color(0xc4c7ca).lerp(new THREE.Color(0x6e665c), age * 0.7);
    const mats = {
      body: carMaterial(color, env, 'body', S, W), cabin: carMaterial(color, env, 'cabin', S, W), cabinIn: carMaterial(color, env, 'cabinIn', S, W),
      paint: new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(new THREE.Color(0x8a8580), age * 0.25), roughness: 0.42 + 0.3 * age, metalness: 0.15, clearcoat: 1 - 0.7 * age, clearcoatRoughness: 0.08, envMap: env }),
      tire: plain(0xffffff, 0.88, 0, { map: tireTexture(age), envMapIntensity: 0.25 }),
      rim: plain(rimCol, 0.16 + 0.25 * age, 1), lip: plain(new THREE.Color(0xe6e8ea).lerp(new THREE.Color(0x8a8378), age * 0.6), 0.08 + 0.3 * age, 1), barrel: plain(0x262626, 0.6, 0.6), cap: plain(0x1a1a1a, 0.4, 0.3),
      disc: plain(new THREE.Color(0x5c5c5c).lerp(new THREE.Color(0x6b3a1e), Math.min(1, age * 1.4)), 0.75, 0.5), caliper: plain(0x2d2d2d, 0.6, 0.3),
      black: plain(0x0d0d0d, 0.55, 0.1), wiper: plain(new THREE.Color(0x1a1a1a).lerp(new THREE.Color(0x3a2a20), age * 0.6), 0.45, 0.6), chrome: plain(0xd8d8d8, 0.12, 1), mirror: plain(0x8a9298, 0.05, 1),
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
    part(roundBox(2 * (plan(5.5) - S.inset - 0.6), 1.3, 2.6, 0.45), mats.dash, [0, top(5.5) - 0.05, 5.5], [0.25, 0, 0]);
    const wheelS = part(new THREE.TorusGeometry(0.95, 0.12, 8, 28), mats.dash, [2.7, belt + 1.0, 3.7], [-0.45, 0, 0]);
    part(new THREE.BoxGeometry(1.8, 0.14, 0.1), mats.dash, [0, 0, 0], null, wheelS);
    part(roundBox(1.6, 0.48, 0.18, 0.07), mats.dash, [0, roof(2.7) - 0.75, 2.7], [0.2, 0, 0]);
    car.children.slice(nIn0).forEach(m => m.userData.inner = true);

    // --- GƯƠNG HẬU: vỏ cùng màu sơn, chân đen, mặt gương; xe cũ có thể gương gập rũ / mất mặt gương
    for (const sx of [1, -1]) {
      const zM = 6.2, yM = top(zM) + 0.75, h = hitAt([sx * 12, yM - 0.45, zM], [-sx, 0, 0]), xs = h ? Math.abs(h.p.x) : plan(zM);
      const grp = new THREE.Group(); grp.position.set(sx * (xs - 0.1), yM - 0.4, zM); car.add(grp); grp.userData.acc = 'mirror';
      part(roundBox(0.7, 0.42, 0.9, 0.12), mats.black, [sx * 0.2, 0.1, 0], null, grp);
      part(roundBox(1.85, 1.0, 0.72, 0.3), mats.paint, [sx * 1.0, 0.42, -0.02], [0, sx * 0.12, 0], grp);
      const broken = age > 0.4 && rnd() < age * 0.45;
      part(new THREE.PlaneGeometry(1.55, 0.72), broken ? mats.black : mats.mirror, [sx * 1.0, 0.42, -0.4], [0, Math.PI + sx * 0.12, 0], grp);
      if (broken) grp.rotation.set(0, sx * 0.5, sx * -0.35);
    }
    // --- TAY NẮM CỬA (cùng màu sơn, lõm tối phía sau)
    for (const sx of [1, -1]) for (const zH of [0.7, -7.2]) {
      const yH = top(zH) - 1.2, h = hitAt([sx * 12, yH, zH], [-sx, 0, 0]);
      if (!h) continue;
      part(new THREE.SphereGeometry(1, 14, 8), mats.dark, [h.p.x - sx * 0.02, yH, zH], null).scale.set(0.08, 0.22, 0.8);
      part(new THREE.SphereGeometry(1, 14, 8), mats.paint, [h.p.x + sx * 0.06, yH, zH - 0.05], null).scale.set(0.12, 0.15, 0.7);
    }
    // --- GẠT MƯA nằm chân kính chắn gió
    // lưỡi cao su ôm theo độ cong kính + khung lưỡi; tay đòn mảnh từ trục quay ở chân kính lên giữa lưỡi; nắp trục
    {
      const zBase = S.cabin[S.cabin.length - 1][0];
      const onGlass = (x, z, lift) => { const h = hitAt([x, 20, z], [0, -1, 0]); return h ? h.p.clone().addScaledVector(h.n, lift) : null; };
      for (const [x0, len, px] of [[1.5, 4.8, -1.2], [-3.0, 4.2, -5.4]]) {
        const blade = [], frame = [];
        for (let i = 0; i <= 12; i++) {
          const x = x0 - len / 2 + len * i / 12, z = zBase - 1.25 - (x - x0) * 0.03;
          const a = onGlass(x, z, 0.05), b = onGlass(x, z, 0.14); if (a) blade.push(a); if (b) frame.push(b);
        }
        if (blade.length < 6) continue;
        const wpr = new THREE.Group(); car.add(wpr); wpr.userData.acc = 'wiper';
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(blade), 24, 0.05, 5, false), mats.black, [0, 0, 0], null, wpr);
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(frame), 24, 0.04, 5, false), mats.wiper, [0, 0, 0], null, wpr);
        const piv = onGlass(px, zBase - 0.35, 0.12), mid = frame[Math.round(frame.length * 0.55)].clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.06);
        if (!piv) continue;
        const arm = new THREE.CatmullRomCurve3([piv, piv.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, 0.1, 0)), mid]);
        part(new THREE.TubeGeometry(arm, 12, 0.06, 5, false), mats.wiper, [0, 0, 0], null, wpr);
        part(new THREE.CylinderGeometry(0.2, 0.24, 0.22, 12), mats.black, [piv.x, piv.y - 0.02, piv.z]);
      }
    }
    // --- BIỂN SỐ trước / sau
    const txt = String.fromCharCode(65 + (seed * 7) % 26) + ((seed * 37) % 90 + 10) + '-' + String(1000 + (seed * 7919) % 9000);
    const plateTex = plateTexture(txt, age, rnd), plateMat = plain(0xffffff, 0.5, 0.1, { map: plateTex, envMapIntensity: 0.4 });
    for (const [y0, dir] of [[S.plates[0], 1], [S.plates[1], -1]]) {
      const h = hitAt([0, y0, dir * 40], [0, 0, -dir]);
      if (!h) continue;
      const back = part(roundBox(4.3, 1.0, 0.12, 0.04), mats.black, [0, y0, h.p.z + dir * 0.07]); back.userData.acc = 'plate';
      const face = part(new THREE.PlaneGeometry(4.15, 0.9), plateMat, [0, y0, h.p.z + dir * 0.17], [0, dir > 0 ? 0 : Math.PI, 0]);
      const tilt = age > 0.5 && rnd() < 0.4 ? (rnd() - 0.5) * 0.25 : 0;   // biển lỏng ốc, xệ lệch
      back.rotation.z = face.rotation.z = tilt;
    }
    // --- ỐNG XẢ
    {
      const zE = S.plan[0][0] + 0.2;
      part(new THREE.CylinderGeometry(0.28, 0.3, 1.8, 16, 1, true), plain(new THREE.Color(0x777370).lerp(new THREE.Color(0x5a3a26), age), 0.6, 0.7, { side: THREE.DoubleSide }), [-4.2, 2.15, zE + 0.75], [Math.PI / 2, 0, 0]);
      part(new THREE.CircleGeometry(0.26, 16), mats.dark, [-4.2, 2.15, zE + 0.4], [0, Math.PI, 0]);
    }
    // --- CỤM ĐÈN / LƯỚI lắp vào lỗ khoét
    const feat = new THREE.Group(); car.add(feat);
    const M = {
      wall: plain(0x111111, 0.7, 0.1, { side: THREE.DoubleSide }), reflector: plain(new THREE.Color(0x1d1e20).lerp(new THREE.Color(0x2a2824), age * 0.6), 0.4, 0.5, { side: THREE.DoubleSide }), bulb: plain(0xe8e6e0, 0.35, 0),
      tailBack: plain(0x6e0d0d, 0.25, 0.85, { side: THREE.DoubleSide }), chrome: mats.chrome, slat: plain(0x161616, 0.35, 0.4),
      projLens: new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMap: env }),
      drl: new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf0f0f0).lerp(new THREE.Color(0xb8a77a), age * 0.6), emissive: 0x1a1a1a, roughness: 0.4 }),
      headLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xffffff).lerp(new THREE.Color(0xe6dcc4), age * 0.6), vertexColors: true, transparent: true, opacity: 0.06 + 0.3 * age, roughness: 0.02 + 0.35 * age, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 + 0.3 * age, envMap: env, depthWrite: false }),
      chromeIn: plain(0xc0c4c8, 0.15 + 0.3 * age, 1, { side: THREE.DoubleSide }),
      tailGuide: new THREE.MeshStandardMaterial({ color: 0x9a1010, emissive: 0x220000, roughness: 0.35 }),
      tailLens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xffffff).lerp(new THREE.Color(0x9a8a80), age * 0.4), vertexColors: true, transparent: true, opacity: 0.7, roughness: 0.05 + 0.25 * age, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 + 0.25 * age, envMap: env, depthWrite: false }),
      honey: plain(0x0c0c0c, 0.7, 0.1, { map: honeyTexture(), alphaTest: 0.5, side: THREE.DoubleSide })
    };
    for (const k in S.features) { const F = S.features[k]; if (F.sym) buildFeature(F, 1, body, M, age, feat); else for (const sx of [1, -1]) buildFeature(F, sx, body, M, age, feat); }
    // --- LÒNG HỐC BÁNH tối
    for (const az of [S.axleF, S.axleR]) {
      const well = part(new THREE.CylinderGeometry(S.r + S.archGap - 0.05, S.r + S.archGap - 0.05, S.trackHalf * 2 - 1.2, 24, 1, true, 0, Math.PI), plain(0x0b0c0d, 0.9, 0, { side: THREE.DoubleSide }), [0, S.r, az], [0, 0, Math.PI / 2]);
      well.castShadow = false; well.userData.well = true;
    }

    // --- MÓP MÉO THEO NĂM THÁNG: vài vết lõm ở sườn / cản, có xe bị đâm móp góc đầu / đuôi, có xe nóc lõm (vật rơi)
    const dents = [], P = bodyGeo.attributes.position, N = bodyGeo.attributes.normal;
    const nD = Math.round(age * (2 + rnd() * 4));
    for (let i = 0; i < nD * 6 && dents.length < nD; i++) {
      const k = Math.floor(rnd() * P.count), y = P.getY(k);
      if (y < 2.4 || y > 7.4 || Math.abs(N.getY(k)) > 0.6) continue;
      dents.push({ x: P.getX(k), y, z: P.getZ(k), nx: N.getX(k), ny: N.getY(k), nz: N.getZ(k), r: 0.8 + rnd() * 1.6, depth: 0.08 + rnd() * 0.22, ph: rnd() * 6 });
    }
    if (rnd() < age * 0.6) {
      const front = rnd() < 0.5, sx = rnd() < 0.5 ? 1 : -1, z0 = front ? S.plan[S.plan.length - 1][0] - 1.2 : S.plan[0][0] + 1.2;
      for (let j = 0; j < 3; j++) dents.push({ x: sx * (5.6 - j * 0.8), y: 4.2 + j * 0.3, z: z0, nx: sx * 0.6, ny: 0, nz: front ? 0.8 : -0.8, r: 2.0 + rnd(), depth: 0.35 + rnd() * 0.3, ph: rnd() * 6 });
    }
    dentGeometry(bodyGeo, dents);
    feat.children.forEach(m => { if (m.position.lengthSq() === 0 && m.quaternion.w === 1 && m.geometry.attributes.position.count > 8) dentGeometry(m.geometry, dents); });
    if (rnd() < age * 0.35) dentGeometry(cabGeo, [{ x: (rnd() - 0.5) * 4, y: 11.6, z: -2 + rnd() * 3, nx: 0, ny: 1, nz: 0, r: 2.2 + rnd() * 1.5, depth: 0.25 + rnd() * 0.25, ph: rnd() * 6 }]);

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
    const tankFoot = (tx, tz, hd, c0 = 0, slope = 0) => { const ch = Math.cos(hd), sh = Math.sin(hd); return (x, z) => {
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
        const amp = 0.6 * k * Math.min(1, Math.max(0, y - 0.8) / 2);
        Y += amp * (1.0 * (rg(n1) - 0.2) + 0.5 * (rg(n2) - 0.2) + 0.2 * (n3 - 0.5));
        X += amp * 0.6 * (n2 - 0.5); Z += amp * 0.5 * (n3 - 0.5);
        if (under > 0.5) Y -= under * 0.06 * sstep(0.35, 0.5, Math.abs(((along / 1.2) % 1 + 1) % 1 - 0.5) * 2) * sstep(0.4, 0.6, n2);
      }
      out[0] = X; out[1] = Math.max(0.45, Y); out[2] = Z;   // không lún xuống mặt đường out[3] = k; out[4] = under; out[5] = along;
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
      cabIn.visible = !heavy; mats.cabin.side = heavy ? THREE.DoubleSide : THREE.FrontSide;   // khoang sập: tôn gập chồng
      mats.body.userData.uni.uTk.value.w = mats.cabin.userData.uni.uTk.value.w = crushMax > 0.1 ? 1 : 0;
      for (const e of restObj) {
        { let p = e.o.parent; while (p && p !== car) p = p.parent; if (!p) continue; }   // phụ kiện đã văng khỏi xe
        if (e.geo) { crushGeo(e.geo, false); continue; }
        const o = e.o; o.position.copy(e.p); o.scale.copy(e.s); o.rotation.copy(e.r); o.visible = e.v;
        if (!e.b) e.b = SB.bind([e.p.x, e.p.y, e.p.z]);
        SB.dispOf(e.b, 0, dd);
        if ((o.userData.inner && dd[3] > 0.4) || (o.userData.well && (dd[3] > 0.08 || crushMax > 0.3))) { o.visible = false; continue; }   // nội thất / hốc bánh nát kín
        o.position.set(e.p.x + dd[0], Math.max(0.2, e.p.y + dd[1]), e.p.z + dd[2]);
        const ratio = Math.max(0.15, 1 - dd[3]);
        o.scale.y *= ratio;
        if (ratio < 0.7) { o.rotation.x += e.j[0] * 0.6; o.rotation.z += e.j[1] * 0.6; }
      }
      // bánh theo điểm bánh của khung; lốp bị đè thì nổ bẹp (đáy xẹp phẳng, thành phình), không bóp cả bánh
      wheels.forEach((w, wi) => {
        if (w.free) return;
        const hit = SB.tireFlat[wi], lvl = hit > 0.75 ? 3 : hit > 0.45 ? 2 : hit > 0.2 ? 1 : 0;
        if (lvl !== (w.lvl || 0)) {
          w.lvl = lvl;
          const flat = [0, 0.3, 0.5, 0.62][lvl] * S.r, tire = w.g.children[0];
          tire.geometry.dispose(); tire.geometry = tireGeometry(S, flat); w.flat = flat;
          // bánh bị xích nghiền: mâm bám bùn đất, xước mờ; lốp phủ bụi xám
          if (!w.dirty) { w.dirty = true; w.g.traverse(m => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.55).lerp(new THREE.Color(0x4a4032), 0.35); m.material.roughness = Math.min(1, m.material.roughness + 0.35); } }); }
        }
        // bánh chưa bị đè: vẫn đi theo thân xe khi xác bị xích miết kéo lê / xoay
        if (!hit && !w.lvl) { const [px, , pz] = SB.wheelPos(wi); w.g.position.set(px, w.y, pz); return; }
        const [px, py, pz] = SB.wheelPos(wi), flat = w.flat || 0;
        // thân bị ép xuống thấp hơn bánh: bánh bị bẻ choãi ra ngoài, ngả nằm nghiêng (không chổng lên trên xác xe)
        const lay = sstep(0.4, 1, hit), ang = w.sx * (0.12 + 1.05 * lay);
        w.g.position.set(px + w.sx * 2.2 * lay, Math.max(S.r - flat, Math.min(py, S.r)) * (1 - lay) + lay * (S.tireW * 0.5 + 0.1 + (S.r - flat) * Math.cos(ang) * 0.15), pz);
        w.g.rotation.set(0, w.sx * 0.15 * hit, -ang);
      });
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
      grp.add(top, bot); return grp;
    };
    const glassBits0 = plain(0x9fb8b2, 0.04, 0.5, { envMapIntensity: 2.0, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const spawnDebris = () => {
      events.push('burst');
      // thảm kính cường lực vỡ vụn (hạt nhỏ lấp lánh) rải dưới và quanh xác xe, dày nhất 2 bên khoang kính
      for (let i = 0; i < 8; i++) {
        const gm = new THREE.Mesh(new THREE.PlaneGeometry(11 + rnd() * 8, 11 + rnd() * 8), new THREE.MeshStandardMaterial({ map: glassCrumbTexture(rnd), transparent: true, roughness: 0.05, metalness: 0.6, envMap: env, envMapIntensity: 1.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
        gm.rotation.set(-Math.PI / 2, 0, rnd() * 6.3); gm.position.set((i % 2 ? 1 : -1) * (9 + rnd() * 5), 0.07, (i >> 1) * 9 - 13 + (rnd() - 0.5) * 6); gm.renderOrder = -1; g.add(gm);
      }
      // gương, biển số, gạt mưa nằm trong vùng bị đè: gãy rời, văng ra mặt đường
      car.children.slice().forEach(o => {
        if (!o.userData.acc) return;
        const p = o.position, [cE] = capAt(p.x, p.z);
        if (cE > 6.5 && rnd() < 0.6) return;
        g.add(o);
        const side = p.x === 0 ? (rnd() < 0.5 ? 1 : -1) : Math.sign(p.x);
        o.position.set(side * (9 + rnd() * 7), o.userData.acc === 'plate' ? 0.1 : 0.25, p.z + (rnd() - 0.5) * 10);
        o.rotation.set(o.userData.acc === 'plate' ? -Math.PI / 2 + (rnd() - 0.5) * 0.2 : (rnd() - 0.5) * 2.5, rnd() * 6.3, (rnd() - 0.5) * 2.5);
        o.scale.set(1, Math.max(0.6, o.scale.y), 1);
      });
      { const sc = new THREE.Mesh(new THREE.PlaneGeometry(30, 44), new THREE.MeshStandardMaterial({ map: scrapeTexture(rnd), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
        sc.rotation.x = -Math.PI / 2; sc.position.y = 0.06; sc.renderOrder = -1; g.add(sc); }
      const pool = fluidDecal(S, rnd, 1); pool.scale.set(0.15, 0.15, 1); g.add(pool); flows.push({ m: pool, t: 0 });
      const paintD = new THREE.MeshStandardMaterial({ color: mats.paint.color.clone().multiplyScalar(0.72).lerp(new THREE.Color(0x5a5046), 0.25), roughness: 0.78, metalness: 0.25, envMap: env, envMapIntensity: 0.5, side: THREE.DoubleSide });
      // nắp capô bung chốt: bản lề phía kính chắn gió còn giữ, mép trước vênh lên
      const [cF] = capAt(0, 14), [cR] = capAt(0, -15);
      if (cF > 5.5 && cF < top(13) - 1.2) { const zh = S.hood[0] + 0.3, h = sheet(12.2, 8.2, paintD, 0.4); h.position.set(0, capAt(0, zh)[0] - 0.15, zh); h.rotation.set(-(0.14 + rnd() * 0.12), (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.1); car.add(h); loose.push(h); }
      if (cR > 5.5 && cR < top(-15) - 1.2) { const zh = S.trunk[0] - 0.3, h = sheet(11.2, 5.4, paintD, 0.3); h.position.set(0, capAt(0, zh)[0] - 0.15, zh); h.rotation.set(0, Math.PI, 0); h.rotateX(-(0.12 + rnd() * 0.15)); car.add(h); loose.push(h); }
      // một cửa bung khỏi khung, nằm chỏng chơ cạnh xác xe
      {
        const sx = rnd() < 0.5 ? 1 : -1, d = new THREE.Group(), lower = sheet(8.2, 4.6, paintD, 1.2);
        lower.rotation.y = Math.PI / 2; lower.position.x = -4.1; d.add(lower);
        // khung kính cửa: 3 thanh cong vênh (trên, trước, sau), ô kính trống, sót vài mảnh kính rìa
        const fr = (pts) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 16, 0.1, 5, false), mats.black); m.castShadow = true; d.add(m); };
        const bend = () => (rnd() - 0.5) * 0.8;
        fr([[-4.1, 0.15, 0.2], [-3.8, 0.3 + bend(), 2.4], [-3.2, 0.25, 3.9]]);
        fr([[-3.2, 0.25, 3.9], [0, 0.4 + bend(), 4.1], [3.6, 0.25, 3.7]]);
        fr([[3.6, 0.25, 3.7], [3.9, 0.3 + bend(), 1.9], [4.1, 0.15, 0.2]]);
        for (let q = 0; q < 3; q++) { const m = new THREE.Mesh(shardGeometry(0.6 + rnd() * 0.6, rnd), glassBits0); m.position.set((rnd() - 0.5) * 6, 0.3, 0.6 + rnd() * 0.6); m.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.4, 0, rnd()); d.add(m); }
        d.rotation.set(0.06 + rnd() * 0.12, rnd() * 6.28, sx * 0.08); d.position.set(sx * (11 + rnd() * 3), 0.3, (rnd() - 0.5) * 10); g.add(d);
      }
      // bánh nằm dưới xích bị tróc khỏi trục, văng nằm nghiêng ngoài vệt
      const wi = [0, 1, 2, 3].sort((a, b) => SB.tireFlat[b] - SB.tireFlat[a])[0], w = wheels[wi];
      if (w && SB.tireFlat[wi] > 0.7) { w.free = true; w.g.position.set(w.sx * (13 + rnd() * 4), S.tireW * 0.55, w.z + (rnd() - 0.5) * 6); w.g.rotation.set(rnd() * 6, rnd() * 6, w.sx * 1.35); w.g.scale.set(1, 0.8, 1); }
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
          vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uK;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * step(0.5, abs(uK - (color.r > 1.5 ? 0.0 : 1.0)) + 0.5) ; vC = color.r > 1.5 ? color - vec3(2.0, 0.0, 0.0) : color; gl_PointSize = size * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying float vA; varying vec3 vC; uniform float uK;\nvoid main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = (1.0 - r) * (1.0 - r) * vA; gl_FragColor = vec4(vC * (uK > 0.5 ? a : 1.0), uK > 0.5 ? a : a * 0.85); }'
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
    const holeMat = new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(5,4,3,1)'); gr.addColorStop(0.32, 'rgba(10,8,6,1)'); gr.addColorStop(0.42, 'rgba(170,168,160,0.9)'); gr.addColorStop(0.55, 'rgba(60,50,40,0.6)'); gr.addColorStop(1, 'rgba(30,25,20,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const scorchMat = new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      for (let i = 0; i < 30; i++) { const r = 20 + rnd() * 40, gr = x.createRadialGradient(64 + (rnd() - 0.5) * 30, 64 + (rnd() - 0.5) * 30, 0, 64, 64, r); gr.addColorStop(0, 'rgba(8,6,4,0.5)'); gr.addColorStop(1, 'rgba(8,6,4,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
      return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const rcH = new THREE.Raycaster();
    const surfaceHit = (o, d) => {
      rcH.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
      car.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(car.matrixWorld).invert();
      const h = rcH.intersectObjects([body, cabin], false)[0];
      if (!h) return null;
      return { p: h.point.clone().applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()), n: h.face.normal.clone(), obj: h.object };
    };
    const decal = (h, size, mat) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(size, 12), mat);
      m.position.copy(h.p).addScaledVector(h.n, 0.04); m.lookAt(m.position.clone().add(h.n)); m.rotateZ(rnd() * 6.3); m.renderOrder = 2;
      g.add(m); return m;
    };
    const shatterGlass = () => { mats.cabin.userData.uni.uE.value.set(0, 6, 40, 2); };   // kính cường lực vỡ vụn rơi hết, kính chắn gió rạn
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
      fire.light = new THREE.PointLight(0xff7a2a, 0, 60, 2); fire.light.position.set(x, y + 4, z); g.add(fire.light);
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
      if (glassHit) shatterGlass(); else decal(h, A.hole * (0.8 + 0.4 * rnd()), holeMat);
      if (A.through) {   // xuyên giáp: lỗ ra phía bên kia (mép xé ra ngoài), kính vỡ
        const o2 = [h.p.x + dx * 30, h.p.y + dy * 30, h.p.z + dz * 30], h2 = surfaceHit(o2, [-dx, -dy, -dz]);
        if (h2) decal(h2, A.hole * 1.4, holeMat);
        shatterGlass();
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
      const emit = (rate, kind) => { let n = rate * dt; while (n > 0) { if (n < 1 && rnd() > n) break; n--;
        const lz = fire.ign[2] * (1 - spread) + (rnd() - 0.4) * 30 * spread, lx = fire.ign[0] * (1 - spread) + (rnd() - 0.5) * 10 * spread, ly = Math.max(1.5, SB.dispAt(lx, top(lz), lz)[1] + top(lz)) + rnd() * 1.5;
        if (kind === 0) P2.add(0, lx, ly, lz, (rnd() - 0.5) * 3, 8 + rnd() * 12, (rnd() - 0.5) * 3, 1.2 + rnd() * 2.2 * k, 0.35 + rnd() * 0.45, 1.5);
        else P2.add(1, lx, ly + 3, lz, (rnd() - 0.5) * 3, 10 + rnd() * 6, (rnd() - 0.5) * 3, 4 + rnd() * 3, 5 + rnd() * 4, 6);
      } };
      emit(320 * k, 0); emit(30 * k + 3, 1);
      if (fire.light) fire.light.intensity = 3.5 * k * (0.8 + 0.4 * Math.sin(fire.t * 23) * Math.sin(fire.t * 7.3));
      // cháy rụi dần: sơn -> đen nâu, gỉ phủ, lớp bóng mất; kính rơi; lốp cháy co lại còn vành
      fire.char = Math.min(1, fire.t / 25);
      const c = fire.char;
      mats.body.color.copy(bodyCol0).lerp(burnColor, c); mats.cabin.color.copy(cabCol0).lerp(burnColor, c); mats.paint.color.copy(paintCol0).lerp(burnColor, c);
      mats.body.clearcoat = mats.cabin.clearcoat = 1 - c; mats.body.roughness = 0.42 + 0.5 * c;
      // sơn cháy hết thành lớp muội đen đều (không còn loang bụi / phai / gỉ cũ), chỉ lốm đốm gỉ cam nhạt
      for (const m of [mats.body, mats.cabin]) { const u = m.userData.uni.uW.value; u.x = W.dust * (1 - c); u.y = W.age * (1 - 0.8 * c); u.z = W.rust * (1 - c) + 0.25 * c; }
      if (c > 0.3) mats.body.userData.uni.uTk.value.w = mats.cabin.userData.uni.uTk.value.w = 0;   // lớp sơn bong / trầy cháy cùng
      for (const m of [mats.rim, mats.lip, mats.chrome]) { if (!m.userData.c0) m.userData.c0 = m.color.clone(); m.color.copy(m.userData.c0).lerp(new THREE.Color(0x3a2a20), c); m.roughness = Math.max(m.roughness, 0.3 + 0.5 * c); }
      car.position.y = -S.r * 0.28 * Math.max(0, (c - 0.5) * 2);   // lốp cháy rụi, thân lún xuống vành
      if (c > 0.15) shatterGlass();
      if (c > 0.5) wheels.forEach(w => { const t = w.g.children[0]; t.scale.setScalar(Math.max(0.68, 1 - (c - 0.5) * 0.7)); t.material = mats.dark; });
      if (fire.t >= dur) { fire.on = false; if (fire.light) fire.light.intensity = 0; }
    };
    const crushApi = {
      // tx, tz, hd: vị trí / hướng xe tăng trong hệ toạ độ xe con (đv); dt: thời gian đè; c0, slope: đáy dải xích
      stamp(tx, tz, hd, dt, c0 = 0, slope = 0) {
        stamp(tankFoot(tx, tz, hd, c0, slope), dt);
        const vx = lastPose ? (tx - lastPose[0]) / Math.max(dt, 1e-3) : 0, vz = lastPose ? (tz - lastPose[1]) / Math.max(dt, 1e-3) : 0;
        lastPose = [tx, tz];
        SB.setTank(tx, tz, hd, c0, slope, vx, vz);
      },
      update(dt) {
        if (SB.step(dt) && SB.consumeMoved()) rebuild();
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
