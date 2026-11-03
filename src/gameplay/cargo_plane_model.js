/**
 * HÌNH MÁY BAY VẬN TẢI thả hòm tiếp tế (supply_manager.js) — dáng C-130, 8 đơn vị = 1 m: dài ~30 m, sải cánh ~40 m, cánh
 * trên thân, 4 động cơ cánh quạt, đuôi vểnh, cửa dốc sau bụng mở được. Gốc nhóm = giữa thân, mũi máy bay hướng +x.
 * Thân / cánh gộp 1 lưới, cánh quạt quay riêng từng chiếc, đĩa mờ cánh quạt gộp 1 lưới -> vài lần vẽ. Hình dựng 1 lần, chỉ
 * có 1-2 chiếc trên trời nên không cần LOD. Không đổ bóng (bay cao, ngoài vùng bóng của khung nhìn).
 * Sơn: rằn ri chiến trường tối 3 màu tính theo vị trí từng đỉnh (lưới chia dày để mảng sơn đủ nét), muội khói sau động
 * cơ, vệt dầu dưới cánh, mép trước cánh sẫm; vết loang, vệt chảy, tróc sơn từng điểm ảnh do Weathering.
 */
const CargoPlaneModel = (() => {
  const C = { olive: [0.2, 0.215, 0.145], earth: [0.185, 0.15, 0.105], black: [0.085, 0.095, 0.075], spin: 0x1d1f1e, glass: 0x0b0d0f, blade: 0x0e0f10, hold: 0x070808, radome: 0x151612 };
  const WING_Y = 19, WING_Z = [-104, -52, 52, 104], PROP_R = 16.4;
  let CACHE = null;

  // nhiễu giá trị 3D tất định: mọi máy, mọi chiếc cùng một lớp sơn
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  function noise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), S = t => t * t * (3 - 2 * t), fx = S(x - ix), fy = S(y - iy), fz = S(z - iz);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), L(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
      L(L(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), L(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
  }
  const fbm = (x, y, z) => noise(x, y, z) * 0.65 + noise(x * 2.3 + 9, y * 2.3 + 4, z * 2.3 + 2) * 0.35;
  const step = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // rằn ri: nền ô liu, mảng nâu đất, mảng gần đen; bụng hơi sẫm hơn lưng
  function camo(x, y, z) {
    const k = 0.021;
    let c = mix3(C.olive, C.earth, step(0.47, 0.53, fbm(x * k, y * k, z * k)));
    c = mix3(c, C.black, step(0.57, 0.62, fbm(x * k * 1.2 + 31, y * k * 1.2 + 17, z * k * 1.2 + 5)));
    const m = 0.92 + 0.14 * step(-14, 14, y);
    return [c[0] * m, c[1] * m, c[2] * m];
  }
  const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  function wingPaint(x, y, z) {
    let c = camo(x, y, z);
    // mép trước sẫm (đệm chống băng cao su), muội khói trên cánh + vệt dầu dưới cánh sau mỗi động cơ
    c = scale3(c, 1 - 0.55 * step(wingLE(z) - 5, wingLE(z) - 1, x));
    for (const e of WING_Z) {
      const dz = (z - e) / 9, across = Math.exp(-dz * dz), along = step(wingLE(e) - 8, wingLE(e) - 24, x);
      c = scale3(c, 1 - across * along * (y > WING_Y ? 0.72 : 0.45));
    }
    return c;
  }
  // vỏ động cơ: sơn tối, nửa sau ám muội tới đen ở ống xả
  function nacellePaint(x, y, z) {
    const e = WING_Z.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a);
    return scale3(mix3(camo(x, y, z), C.black, 0.45), 1 - 0.68 * step(wingLE(e) - 6, wingLE(e) - 30, x));
  }
  function bodyPaint(x, y, z) {
    if (x > 112) return null;
    const c = camo(x, y, z);
    // ám bẩn sau gốc cánh và về phía đuôi
    return scale3(c, 1 - 0.22 * step(-40, -115, x));
  }
  // chia dày lưới theo chiều dài (mỗi đoạn dài tối đa `len`) và quanh vòng (nhân `kr`)
  function dense(rings, len, kr) {
    const out = [], lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const round = r => { const o = []; r.forEach((p, i) => { for (let k = 0; k < kr; k++) o.push(lerp(p, r[(i + 1) % r.length], k / kr)); }); return o; };
    for (let j = 0; j < rings.length - 1; j++) {
      const a = rings[j], b = rings[j + 1], n = Math.max(1, Math.ceil(Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1], a[0][2] - b[0][2]) / len));
      for (let s = 0; s < n; s++) out.push(round(a.map((p, i) => lerp(p, b[i], s / n))));
    }
    out.push(round(rings[rings.length - 1]));
    return out;
  }

  // lưới kín từ các vòng cùng số điểm; bịt 2 đầu bằng quạt tam giác, tự sửa chiều tam giác theo thể tích có dấu
  function loft(rings) {
    const n = rings[0].length, pos = [], idx = [];
    for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n;
      idx.push(a, b, d, a, d, c);
    }
    for (const [r, base] of [[rings[0], 0], [rings[rings.length - 1], (rings.length - 1) * n]]) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of r) { cx += p[0] / n; cy += p[1] / n; cz += p[2] / n; }
      const k = pos.length / 3;
      pos.push(cx, cy, cz);
      for (let i = 0; i < n; i++) idx.push(k, base + (i + 1) % n, base + i);
    }
    let vol = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // vòng tròn dẹt (siêu elip) trong mặt phẳng vuông góc trục x
  function hoop(x, cy, rz, ry, zc = 0, n = 18, p = 2.5) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      out.push([x, cy + ry * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), zc + rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)]);
    }
    return out;
  }
  // tiết diện cánh 8 điểm: LE / TE theo x, dày t ở 30% dây cung từ mép trước
  const foil = (le, te, t) => [[le, 0], [le - (le - te) * 0.08, t * 0.3], [le - (le - te) * 0.3, t * 0.5], [le - (le - te) * 0.65, t * 0.32], [te, 0], [le - (le - te) * 0.65, -t * 0.18], [le - (le - te) * 0.3, -t * 0.32], [le - (le - te) * 0.08, -t * 0.2]];

  // gộp [geo, màu hex | hàm sơn (x, y, z) -> [r, g, b], fb: màu khi hàm trả null] (bỏ chỉ số, giữ pháp tuyến đã làm mượt)
  function merge(list) {
    const parts = list.map(([g, c, fb]) => [g.index ? g.toNonIndexed() : g, typeof c === 'function' ? c : new THREE.Color(c), fb === undefined ? null : new THREE.Color(fb)]);
    let total = 0;
    for (const [g] of parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const [g, c, fb] of parts) {
      const n = g.attributes.position.count, P = g.attributes.position.array;
      pos.set(P, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < n; i++) {
        const v = typeof c === 'function' ? c(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) : null, f = v ? null : (fb || c);
        col[(o + i) * 3] = v ? v[0] : f.r; col[(o + i) * 3 + 1] = v ? v[1] : f.g; col[(o + i) * 3 + 2] = v ? v[2] : f.b;
      }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  const M4 = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1));
  const at = (g, m) => { g.applyMatrix4(m); return g; };
  const wingLE = z => 40 - Math.max(0, Math.abs(z) - 70) * 0.05;
  const wingTE = z => -14 + Math.max(0, Math.abs(z) - 70) * 0.2;

  // tấm hình thang gốc tại mép trước, xoè về -x, hẹp dần theo đuôi thân
  function rampPanel(width, thick) {
    const g = new THREE.BoxGeometry(44, thick, width), P = g.attributes.position;
    for (let v = 0; v < P.count; v++) if (P.getX(v) < 0) P.setZ(v, P.getZ(v) * 0.6);
    g.translate(-22, 0, 0);
    g.computeVertexNormals();
    return g;
  }

  function bodyGeometry() {
    const L = [];
    // thân: mũi radar tròn -> buồng lái nhô -> khoang hàng thẳng -> đuôi vểnh lên; bụng phẳng hơn lưng
    const F = [[122, -3, 0.8, 0.8], [119, -3, 4.6, 4.2], [113, -2.4, 8.6, 8], [105, -1, 12.6, 12.2], [96, 1, 15.2, 15.6], [84, 1, 16.8, 17.8], [60, 0, 17.4, 18.4],
      [-46, 0, 17.4, 18.4], [-62, 2.6, 16.4, 16], [-82, 7.6, 13.4, 11.2], [-100, 13, 8.8, 6.8], [-116, 18, 3.8, 3.4], [-124, 20, 1.2, 1.2]];
    L.push([loft(dense(F.map(s => hoop(s[0], s[1], s[2], s[3], 0, 24)), 9, 2)), bodyPaint, C.radome]);
    // bầu càng 2 bên bụng
    for (const sd of [-1, 1]) {
      const B = [[34, -11, 1, 1], [28, -11.6, 5, 5], [14, -12, 7, 7.4], [-14, -12, 7, 7.4], [-28, -11.6, 5, 5], [-36, -11, 1, 1]];
      L.push([loft(dense(B.map(s => hoop(s[0], s[1], s[2], s[3], sd * 16, 12, 2.2)), 9, 1)), (x, y, z) => scale3(camo(x, y, z), 0.8)]);
    }
    // cánh trên thân: đoạn giữa dây cung đều, ngoài thuôn; nhô cao ở gốc nối vào lưng
    const zs = [-161, -130, -100, -70, -30, 0, 30, 70, 100, 130, 161];
    L.push([loft(dense(zs.map(z => { const az = Math.abs(z), t = az > 70 ? 7 - (az - 70) * 0.05 : 7; return foil(wingLE(z), wingTE(z), t).map(p => [p[0], WING_Y + p[1], z]); }), 6, 3)), wingPaint]);
    // gờ nối cánh với lưng
    L.push([loft([[44, 13.5, 3], [30, 18, 9], [-6, 18, 10], [-24, 13.5, 3]].map(s => hoop(s[0], s[1], s[2], 6, 0, 10))), camo]);
    // bốn động cơ: vỏ dài chạy dọc dây cung, chân mảnh dưới cánh
    for (const z of WING_Z) {
      const le = wingLE(z), S = [[le + 25, -2.6, 2.4, 2.4], [le + 23, -2.6, 5, 5.2], [le + 15, -2.8, 6.6, 7], [le, -3.2, 6.8, 7.6], [le - 20, -2.2, 5.6, 6], [le - 38, 2, 2.4, 2.4]];
      L.push([loft(dense(S.map(s => hoop(s[0], WING_Y + s[1], s[2], s[3], z, 12, 2.1)), 5, 1)), nacellePaint]);
      // chóp cánh quạt
      const P = [[le + 33, 0, 0.3], [le + 31, 0, 2.2], [le + 27, 0, 3.8], [le + 25, 0, 3.4]];
      L.push([loft(P.map(s => hoop(s[0], WING_Y - 2.6, s[2], s[2], z, 10, 2))), C.spin]);
    }
    // đuôi đứng rất cao, vuốt xiên về sau; đuôi ngang đặt thấp trên đuôi thân
    const fin = [[8, -56, -104], [24, -74, -112], [50, -94, -118], [82, -108, -126]];
    L.push([loft(dense(fin.map(s => foil(s[1], s[2], 3.6 * (1 - (s[0] - 8) / 130)).map(p => [p[0], s[0], p[1]])), 6, 3)), camo]);
    const stab = [[-66, 3], [-34, 3], [0, 4], [34, 3], [66, 3]];
    L.push([loft(dense(stab.map(s => { const az = Math.abs(s[0]); return foil(-90 - az * 0.18, -124 - az * 0.04, s[1]).map(p => [p[0], 17 + p[1], s[0]]); }), 6, 3)), camo]);
    // kính buồng lái: tấm tối nằm áp vỏ, xếp quanh mũi trên
    for (const sd of [-1, 1]) {
      L.push([at(new THREE.BoxGeometry(5.6, 3.8, 5.6), M4(104.2, 9, sd * 4.2, sd * 0.55, 0, -0.75)), C.glass]);
      L.push([at(new THREE.BoxGeometry(9, 4, 1.2), M4(96, 11.6, sd * 12.2, sd * -0.5, 0, -0.1)), C.glass]);
      L.push([at(new THREE.BoxGeometry(7, 3.6, 1.2), M4(87.5, 13.2, sd * 13.4, sd * -0.45, 0, 0)), C.glass]);
    }
    // cửa sổ tròn nhỏ khoang hàng
    for (const sd of [-1, 1]) for (const x of [52, 28, -30]) L.push([at(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 10), M4(x, 3, sd * 17.4, Math.PI / 2, 0, 0)), C.glass]);
    // khoang hàng tối phía sau cửa dốc: thấy khi cửa mở
    L.push([at(rampPanel(24, 0.6), M4(-48, -18, 0, 0, 0, -0.41)), C.hold]);
    return merge(L);
  }

  function propGeometry() {
    const L = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, g = new THREE.BoxGeometry(0.9, PROP_R - 2, 3);
      const P = g.attributes.position;
      for (let v = 0; v < P.count; v++) if (P.getY(v) > 0) P.setZ(v, P.getZ(v) * 0.55);   // cánh thuôn dần ra chót
      g.computeVertexNormals();
      L.push([at(g, new THREE.Matrix4().makeRotationX(a).multiply(M4(0, (PROP_R + 2) / 2, 0, 0, 0.5, 0))), C.blade]);
    }
    return merge(L);
  }

  function discGeometry() {
    const L = [];
    for (const z of WING_Z) L.push(at(new THREE.CircleGeometry(PROP_R, 28), M4(wingLE(z) + 27.5, WING_Y - 2.6, z, 0, Math.PI / 2, 0)));
    const pos = [];
    for (const g of L) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.computeBoundingSphere();
    return out;
  }

  // sơn mờ đã cũ: loang bẩn, vệt chảy, tróc sơn; không bùn / rêu (không chạm đất), bụi và bạc nắng rất ít để giữ tông tối
  const bodyMat = () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.06 });
    if (typeof Weathering !== 'undefined') Weathering.apply(m, 'paint', { space: 'local', grime: 0, moss: 0, vary: 0, dust: 0.12, fade: 0.1, stain: 0.85, streak: 0.8, chip: 0.4, rust: 0.08, scale: 0.55 });
    return m;
  };
  // đĩa mờ cánh quạt: hoà nhân -> chỉ làm tối nền phía sau (hoà thường + đường cong màu của game làm đĩa sáng hơn trời)
  const discMat = () => new THREE.MeshBasicMaterial({ color: 0xd2d2d2, transparent: true, blending: THREE.MultiplyBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

  function cache() {
    if (!CACHE) CACHE = { body: bodyGeometry(), prop: propGeometry(), ramp: merge([[rampPanel(26, 1.2), (x, y, z) => scale3(camo(x, y, z), 0.75)]]), disc: discGeometry(), bodyMat: bodyMat(), discMat: discMat() };
    return CACHE;
  }

  // { group, props: [lưới cánh quạt, quay quanh x], ramp: nhóm cửa dốc } — openRamp(k) 0 = đóng ôm bụng, 1 = mở hạ ngang
  function build() {
    const K = cache(), group = new THREE.Group();
    group.add(new THREE.Mesh(K.body, K.bodyMat));
    const disc = new THREE.Mesh(K.disc, K.discMat);
    disc.renderOrder = 2;
    group.add(disc);
    const ramp = new THREE.Group();
    ramp.position.set(-48, -18.9, 0);
    ramp.add(new THREE.Mesh(K.ramp, K.bodyMat));
    group.add(ramp);
    const props = WING_Z.map(z => {
      const p = new THREE.Mesh(K.prop, K.bodyMat);
      p.position.set(wingLE(z) + 27, WING_Y - 2.6, z);
      p.rotation.x = z * 0.1;
      group.add(p);
      return p;
    });
    const openRamp = k => { ramp.rotation.z = -0.41 + k * 0.52; };
    openRamp(0);
    return { group, props, ramp, openRamp };
  }

  // bản sao vật liệu để làm nóng shader (prewarmEffects huỷ vật liệu mẫu sau khi biên dịch -> không đụng vật liệu thật)
  // dựng luôn hình ở đây (~28 ms): chiếc đầu tiên bay vào giữa trận không khựng khung
  const warmMaterials = () => { cache(); return [bodyMat(), discMat()]; };

  return { build, warmMaterials };
})();
if (typeof window !== 'undefined') window.CargoPlaneModel = CargoPlaneModel;
