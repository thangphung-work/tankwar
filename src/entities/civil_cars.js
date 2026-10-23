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
      plan: [[-18.8, 5.0], [-18.6, 6.1], [-18.0, 6.75], [-16.5, 7.08], [-13, 7.18], [0, 7.22], [12, 7.2], [15.5, 7.0], [17.3, 6.55], [18.3, 5.8], [18.75, 4.6]],
      // đường nóc thân dưới nhìn ngang: cốp -> mép kính (vai) -> capô -> mũi
      top: [[-18.8, 6.6], [-18.6, 7.55], [-17.8, 8.0], [-15.5, 8.15], [-12.6, 8.12], [-8, 8.0], [0, 7.85], [6, 7.75], [7.8, 7.6], [10, 7.35], [13.5, 6.95], [16.5, 6.45], [18.2, 5.95], [18.75, 5.2]],
      // đường đáy (chưa tính hốc bánh): cản sau, ngưỡng cửa, cản trước có môi gió
      bottom: [[-18.8, 2.9], [-17.6, 2.2], [-13.5, 1.75], [0, 1.6], [13, 1.75], [17.2, 1.95], [18.75, 2.6]],
      // khoang kính nhìn ngang: chân kính hậu -> mui -> chân kính chắn gió (2 đầu = đường vai tại chỗ đó)
      cabin: [[-12.6, 8.12], [-11.0, 9.05], [-8.6, 10.5], [-6.2, 11.35], [-3, 11.62], [0.8, 11.6], [2.4, 11.3], [4.6, 10.05], [6.6, 8.6], [7.8, 7.6]],
      inset: 0.9, tumble: 1.6,     // chân kính lùi vào so với vai; mui hẹp hơn chân kính mỗi bên
      roofF: 2.1, roofR: -5.7,     // mép trên kính chắn gió / kính hậu
      pillarA: 0.45, pillarC: 0.75, zB: -0.9, zDiv: -8.7,
      rearDlo: [-10.0, 1.95, 8.3], // mép sau ô kính hông: z = a + b * (y - c) (song song kính hậu)
      doors: [7.4, -0.9, -8.7], sill: 2.3, bumperF: [14.9, 4.9], bumperR: [-13.9, 5.2],
      hood: [7.6, 17.0], trunk: [-12.6, 6.5], fuel: [-12.45, 6.55, 0.62, 0.55]
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
      const yb = top(z) - 0.2, yr = Math.max(yb + 0.06, roof(z)), hh = yr - yb, w0 = plan(z) - S.inset, w1 = w0 - S.tumble;
      const half = spline2([[0, yb], [w0, yb], [w0 - S.tumble * 0.42, yb + hh * 0.5], [w1 + 0.25, yr - Math.min(0.4, hh * 0.3)],
        [w1 - 0.6, yr - Math.min(0.04, hh * 0.03)], [w1 * 0.45, yr + 0.07], [0, yr + 0.1]], SM);
      const A = arcs(half), aCorner = A[3 * SM], aBase = A[SM];
      rings.push(mirrorRing(half, z));
      refs.push(mirrorRefs(half.map((p, k) => [aCorner - A[k], A[k] - aBase, 0])));
    }
    return loftMesh(rings, refs, false);
  }

  // ---------------------------------------------------------------------------
  // VẬT LIỆU: sơn 2 lớp (clearcoat), shader vẽ khe cửa / ô kính / viền cao su
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
varying vec3 vRest; varying vec3 vObjN; varying vec3 vRef;
uniform vec4 uA; uniform vec4 uB; uniform vec4 uC; uniform vec4 uD; uniform vec4 uE;
// vạch mảnh khử răng cưa, mờ dần khi nhỏ hơn 1 điểm ảnh (giữ độ tối trung bình, không nhấp nháy)
float aaLine(float d, float w) { float f = max(fwidth(d), 1e-4); return (1.0 - smoothstep(w * 0.5 - f, w * 0.5 + f, abs(d))) * clamp(w / (f * 2.0), 0.0, 1.0); }
// giao 2 nửa mặt phẳng (a < 0 và b < 0) có bo góc bán kính r -> khoảng cách có dấu (âm = bên trong)
float rmax(float a, float b, float r) { vec2 q = vec2(a, b) + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;
  // Thân dưới: khe cửa trước / giữa / sau, mép dưới cửa, khe cản trước / sau với tai xe, capô, cốp, nắp bình xăng
  const GLSL_BODY = `
  float seam = 0.0, gap = 0.07, ax = abs(vRest.x);
  vec3 Nn = normalize(vObjN);
  float hoodEdge = vRef.x - 0.95;
  if (abs(Nn.x) > 0.45) {
    float yIn = step(uB.x, vRest.y) * step(vRest.y, vRef.z - 0.3);
    seam = max(seam, yIn * max(aaLine(vRest.z - uA.x, gap), max(aaLine(vRest.z - uA.y, gap), aaLine(vRest.z - uA.z, gap))));
    seam = max(seam, step(uA.z, vRest.z) * step(vRest.z, uA.x) * aaLine(vRest.y - uB.x, gap));
    seam = max(seam, step(vRest.y, uB.y) * aaLine(vRest.z - uA.w, gap));
    seam = max(seam, step(vRest.y, uB.w) * aaLine(vRest.z - uB.z, gap));
    if (vRest.x > 0.0) { vec2 q = abs(vec2(vRest.z, vRest.y) - uD.xy) - uD.zw + 0.15; seam = max(seam, aaLine(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.15, gap)); }
  }
  if (Nn.y > 0.3) {
    float hf = uC.y - 0.025 * ax * ax;
    seam = max(seam, step(uC.x, vRest.z) * step(vRest.z, hf) * aaLine(ax - hoodEdge, gap));
    seam = max(seam, step(ax, hoodEdge) * aaLine(vRest.z - hf, gap));
    seam = max(seam, step(vRest.z, uC.z) * step(uC.w, vRest.y) * aaLine(ax - hoodEdge, gap));
  }
  if (Nn.z < -0.35) {
    seam = max(seam, step(ax, hoodEdge) * aaLine(vRest.y - uC.w, gap));
    seam = max(seam, step(uC.w, vRest.y) * aaLine(ax - hoodEdge, gap));
  }
  diffuseColor.rgb *= 1.0 - 0.94 * seam;
  float trimK = 0.0, glassK = 0.0;
`;
  // Khoang kính: kính chắn gió / kính hậu / kính hông (cửa trước, cửa sau + kính tam giác sau), viền cao su đen quanh
  // ô kính, cột B ốp đen bóng
  const GLSL_CABIN = `
  float u = vRef.x, v = vRef.y, z = vRest.z, y = vRest.y, seam = 0.0;
  float dW = rmax(rmax(u + uA.x, uA.y - z, 0.45), 0.25 - v, 0.2);
  float dR = rmax(rmax(u + uA.z, z - uA.w, 0.45), 0.25 - v, 0.2);
  float side = rmax(0.4 - u, 0.42 - v, 0.3);
  float zC = uB.x + uB.y * (y - uB.z);
  float dF = rmax(side, uC.x + 0.5 - z, 0.3);
  float dRr = rmax(rmax(side, z - (uC.x - 0.5), 0.3), zC - z, 0.35);
  float d = min(min(dW, dR), min(dF, dRr));
  float f = max(fwidth(d), 1e-4);
  float glassK = 1.0 - smoothstep(-f, f, d);
  float trimK = (1.0 - smoothstep(0.2 - f, 0.2 + f, d)) * (1.0 - glassK);
  trimK = max(trimK, (1.0 - smoothstep(-f, f, side)) * (1.0 - smoothstep(0.5 - f, 0.5 + f, abs(z - uC.x))));
  float dv = (1.0 - smoothstep(0.12 - f, 0.12 + f, abs(z - uC.y))) * glassK; trimK = max(trimK, dv); glassK -= dv;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), max(trimK, glassK));
  diffuseColor.a = mix(1.0, 0.68, glassK);
`;
  function carMaterial(color, env, mode, S) {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1 });
    if (mode === 'cabin') { m.transparent = true; }
    m.extensions = { derivatives: true };
    const U = mode === 'cabin' ? {
      uA: [S.pillarA, S.roofF, S.pillarC, S.roofR], uB: S.rearDlo.concat(0), uC: [S.zB, S.zDiv, 0, 0], uD: [0, 0, 0, 0], uE: [0, 0, 0, 0]
    } : {
      uA: [S.doors[0], S.doors[1], S.doors[2], S.bumperF[0]], uB: [S.sill, S.bumperF[1], S.bumperR[0], S.bumperR[1]],
      uC: [S.hood[0], S.hood[1], S.trunk[0], S.trunk[1]], uD: S.fuel, uE: [0, 0, 0, 0]
    };
    m.onBeforeCompile = sh => {
      for (const k in U) sh.uniforms[k] = { value: new THREE.Vector4(...U[k]) };
      sh.vertexShader = 'attribute vec3 aRef;\nvarying vec3 vRest; varying vec3 vObjN; varying vec3 vRef;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vObjN = normal; vRef = aRef;');
      sh.fragmentShader = GLSL_COMMON + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + (mode === 'cabin' ? GLSL_CABIN : GLSL_BODY))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.04, glassK); roughnessFactor = mix(roughnessFactor, 0.35, trimK); roughnessFactor = mix(roughnessFactor, 0.9, seam);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - max(max(glassK, trimK), seam);');
    };
    m.customProgramCacheKey = () => 'civcar_' + mode;
    return m;
  }
  function materials(color, S) {
    const env = envCube();
    return {
      body: carMaterial(color, env, 'body', S),
      cabin: carMaterial(color, env, 'cabin', S),
      tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.88, metalness: 0 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.3, metalness: 0.85, envMap: env, envMapIntensity: 1 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9, metalness: 0 })
    };
  }

  // ---------------------------------------------------------------------------
  // BÁNH (tạm cho bước dáng thân): lốp thành phồng + mâm phẳng
  // ---------------------------------------------------------------------------
  function wheelGroup(S, mats) {
    const g = new THREE.Group(), r = S.r, w = S.tireW;
    const pr = [[0.64, -0.5], [0.82, -0.53], [0.95, -0.46], [1, -0.3], [1, 0.3], [0.95, 0.46], [0.82, 0.53], [0.64, 0.5]].map(([a, b]) => new THREE.Vector2(a * r, b * w));
    const tire = new THREE.Mesh(new THREE.LatheGeometry(pr, 40), mats.tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, w * 0.9, 32), mats.rim);
    tire.castShadow = rim.castShadow = true;
    g.add(tire, rim);
    g.rotation.z = Math.PI / 2;
    return g;
  }
  // bóng tối tiếp đất mềm dưới gầm (ánh trời bị thân xe che)
  let SHADOW_TEX = null;
  function contactShadow(S) {
    if (!SHADOW_TEX) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const x = c.getContext('2d'), img = x.createImageData(64, 128);
      for (let j = 0; j < 128; j++) for (let i = 0; i < 64; i++) {
        const u = Math.abs(i / 63 * 2 - 1), v = Math.abs(j / 127 * 2 - 1), d = Math.max(Math.pow(u, 4) + Math.pow(v, 8), 0);
        const p = (j * 64 + i) * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = 0; img.data[p + 3] = 255 * Math.max(0, 1 - d) ** 1.5;
      }
      x.putImageData(img, 0, 0); SHADOW_TEX = new THREE.CanvasTexture(c);
    }
    const L = S.plan[S.plan.length - 1][0] - S.plan[0][0], W = 2 * Math.max(...S.plan.map(p => p[1]));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.5, L + 1.5), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.04, (S.plan[0][0] + S.plan[S.plan.length - 1][0]) / 2);
    m.renderOrder = -1;
    return m;
  }

  // ---------------------------------------------------------------------------
  // DỰNG XE
  // ---------------------------------------------------------------------------
  function build(kind = 'sedan', opts = {}) {
    const S = SPEC[kind], mats = materials(opts.color !== undefined ? opts.color : 0x7a1512, S), g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry(S), mats.body), cabin = new THREE.Mesh(cabinGeometry(S), mats.cabin);
    for (const m of [body, cabin]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    // nội thất tạm (bước sau dựng ghế / taplô): khối tối che khoảng rỗng nhìn qua kính
    const top = curve(S.top), plan = curve(S.plan);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2 * (plan(0) - S.inset - 1.0), 2.0, 13.5), mats.dark);
    inner.position.set(0, top(0) - 0.5, -2.6); g.add(inner);
    // lòng hốc bánh tối (không nhìn xuyên qua gầm)
    for (const az of [S.axleF, S.axleR]) {
      const well = new THREE.Mesh(new THREE.CylinderGeometry(S.r + S.archGap - 0.05, S.r + S.archGap - 0.05, S.trackHalf * 2 - 1.2, 24, 1, true, 0, Math.PI), mats.dark);
      well.material = well.material.clone(); well.material.side = THREE.DoubleSide;
      well.rotation.z = Math.PI / 2; well.position.set(0, S.r, az);
      g.add(well);
    }
    for (const az of [S.axleF, S.axleR]) for (const sx of [1, -1]) {
      const wg = wheelGroup(S, mats);
      wg.position.set(sx * S.trackHalf, S.r, az);
      g.add(wg);
    }
    g.add(contactShadow(S));
    g.userData.spec = S;
    return g;
  }
  return { build, SPEC, envCube };
})();
if (typeof window !== 'undefined') window.CivilCars = CivilCars;
