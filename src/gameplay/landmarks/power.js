/**
 * TRẠM BIẾN ÁP 500/220 kV NGOÀI TRỜI (AIS) + KHỐI PHÁT ĐIỆN TUA-BIN KHÍ — BỎ HOANG (bản đồ thành phố)
 *
 * Theo trạm biến áp truyền tải thật (thiết bị cách điện không khí, sân phân phối rải đá dăm):
 * - 2 sân phân phối hai bên đường trục giữa: 500 kV (3 ngăn lộ: 2 ngăn đường dây + 1 ngăn máy biến áp) và 220 kV
 *   (5 ngăn: 2 ngăn đường dây, 2 ngăn MBA đi cáp ngầm, 1 ngăn máy phát). Mỗi ngăn đường dây (từ sau ra trước): giàn
 *   cổng thép đón dây, chuỗi sứ néo, tụ phân áp CVT + bẫy sóng, chống sét van có vòng đẳng thế, dao cách ly cắt giữa
 *   có dao tiếp địa, biến dòng dầu đầu sứ nâu, máy cắt SF6 buồng ngắt chữ T trên trụ sứ, dao cách ly kiểu pantograph
 *   dưới thanh cái ống nhôm cứng 3 pha trên trụ sứ đỡ.
 * - Hàng máy biến áp giữa 2 tường ngăn cháy bê tông, đặt trên dầm có ray kéo máy trong hố thu dầu đổ đá dăm: 2 MBA tự
 *   ngẫu AT1/AT2 500/220/35 kV (thùng gân tăng cứng, 4 dàn tản nhiệt cánh tấm + quạt, bình dầu phụ + rơ-le hơi, bộ
 *   điều áp dưới tải, sứ xuyên 500 kV có vòng chống vầng quang, sứ 220 kV xuống hộp đầu cáp, hệ phun nước chữa cháy),
 *   kháng điện bù ngang 500 kV, MBA tăng áp của tổ máy (đã cháy: thùng ám khói, sứ vỡ, tường loang muội), giàn
 *   thép đỡ dây nối các MBA, giàn tụ bù có rào.
 * - Cột điện tháp thép mạ kẽm mạch kép 500 kV + 220 kV đứng trong rào sau: dây dẫn qua chuỗi sứ néo thủy tinh xuống
 *   giàn cổng; phía ngoài dây đứt rủ qua rào xuống ụ đất (trạm bị bỏ hoang). Cột thu sét, dây chống sét đỉnh giàn.
 * - Mương cáp bê tông nắp đan (vài tấm bị cạy mất), nhà điều khiển - rơ-le 2 tầng + cột ăng-ten viba, máy phát
 *   diesel dự phòng trong container, cuộn cáp gỗ, biển báo nguy hiểm điện cao thế (tiếng Việt / Anh), số hiệu ngăn lộ.
 * - Khối tua-bin khí chu trình đơn: máy phát + tua-bin trong vỏ cách âm, nhà lọc gió nâng trên khung thép, ống xả
 *   + ống khói thép, dàn quạt làm mát dầu bôi trơn, trạm khí nhiên liệu, giàn bình CO2 chữa cháy, thanh dẫn kín pha
 *   (IPB) vắt qua đường sang MBA tăng áp, bồn dầu nhiên liệu dự phòng trong đê đất (MapGen: L.bund).
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / bờ đê: MapGen (map_gen.js:
 * detailPower / moundPower). Tỉ lệ 8 đơn vị = 1 m (khoảng cách pha / ngăn lộ thu gọn cho vừa khu đất 80 x 130 m).
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  // ---- BỐ CỤC (f: trục trước-sau, cổng ở +f; r: ngang) ----
  // sân 500 kV (r < 0) / 220 kV (r > 0): tâm ngăn lộ, khoảng cách pha, cao giàn cổng, cao thanh cái, cột giàn cổng đón dây
  const Y5 = { kv: 500, s: 1, ph: 34, bays: [-338, -218, -98], line: [1, 1, 0], no: ['571', '572', '531'], gH: 170, busY: 84,
    hp: 26, col: 32, entry: [-398, -278, -158], bus: [-52, -34, -16], busR: [-404, -34] };
  const Y2 = { kv: 220, s: 0.74, ph: 24, bays: [80, 160, 240, 320, 400], line: [0, 0, 0, 1, 1], no: ['231', '232', '233', '273', '274'], gH: 128, busY: 62,
    hp: 20, col: 23, entry: [280, 360, 440], bus: [-50, -38, -26], busR: [34, 444] };
  // hàng thiết bị ngăn đường dây (f): giàn cổng, CVT + bẫy sóng, chống sét van, dao cách ly, biến dòng, máy cắt
  const ROW = { entry: -172, cvt: -156, arr: -142, ds: -120, ct: -99, cb: -78, tcb: 14 };
  const TG = 48, TGH = 150, TG_COLS = [-278, -158, -38, 40, 120, 200, 280];   // giàn cổng MBA
  const PIT0 = 58, PIT1 = 136, TF = 96;                                         // hố thu dầu, tâm thùng MBA
  const PY5 = { f: -226, r: -278 }, PY2 = { f: -226, r: 360 };                    // cột điện trong rào sau

  const GEO = {}, PM = {};
  // vật liệu riêng: thép mạ kẽm phong hoá, sứ nâu men bóng, sứ / composite xám, sứ thuỷ tinh xanh, nhôm, dây nhôm lõi thép,
  // sơn MBA xám, thép cháy ám khói, sơn vỏ tua-bin, ống khí vàng, sơn đỏ chữa cháy, đá dăm hố dầu, vết dầu loang
  function mats(api) {
    if (PM.galv) return PM;
    const S = o => new THREE.MeshStandardMaterial(o);
    const G = (rust, o) => { const [t, b] = api.grimePair('r' + rust, rust); return S(Object.assign({ map: t, bumpMap: b, bumpScale: 0.3 }, o)); };
    PM.galv = G(2.4, { color: 0x8f9492, roughness: 0.72, metalness: 0.45 });
    PM.galvD = G(3.2, { color: 0x6c706e, roughness: 0.8, metalness: 0.4 });
    PM.porc = G(0.8, { color: 0x6c3522, roughness: 0.3, metalness: 0.05 });
    PM.porcG = G(1, { color: 0x8d918b, roughness: 0.42, metalness: 0.05 });
    PM.glassI = S({ color: 0x527d74, roughness: 0.14, metalness: 0.15 });
    PM.alu = G(1, { color: 0xb2b6b3, roughness: 0.42, metalness: 0.62 });
    PM.cond = S({ color: 0x5e625f, roughness: 0.5, metalness: 0.55 });
    PM.trafo = G(2.2, { color: 0x76807f, roughness: 0.6, metalness: 0.3 });
    PM.soot = G(4, { color: 0x2c2926, roughness: 0.95, metalness: 0.1 });
    PM.cu = S({ color: 0x5c3f27, roughness: 0.6, metalness: 0.5 });
    PM.panel = G(1.4, { color: 0xc6c1b0, roughness: 0.6, metalness: 0.2 });
    PM.gas = G(1.6, { color: 0xc9a227, roughness: 0.6, metalness: 0.2 });
    PM.red = G(1.6, { color: 0xa3281e, roughness: 0.55, metalness: 0.25 });
    PM.cable = S({ color: 0x1d1e1d, roughness: 0.85 });
    PM.pit = S({ map: api.detailTex('gravel'), color: 0x6c665c, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return PM;
  }
  // Sứ cách điện: tròn xoay lõi rc, tán rs, bước tán p (dọc +y từ 0 tới len, tán dốc xuống phía ngoài như sứ thật)
  function insGeo(len, rc, rs, p, seg) {
    const key = ['ins', len, rc, rs, p, seg].map(v => typeof v === 'number' ? v.toFixed(2) : v).join('_');
    if (GEO[key]) return GEO[key];
    const V = (x, y) => new THREE.Vector2(x, y), pts = [V(0.01, 0), V(rc, 0)];
    p = Math.max(p, 2.8); const n = Math.max(1, Math.round(len / p)), q = len / n;
    for (let i = 0; i < n; i++) { const y = i * q; pts.push(V(rc, y + q * 0.1), V(rs, y + q * 0.34), V(rc, y + q * 0.72)); }
    pts.push(V(rc, len), V(0.01, len));
    const g = new THREE.LatheGeometry(pts, seg || (rs > 2.6 ? 8 : 7)); g.userData.len = len;
    return (GEO[key] = g);
  }
  // Chuỗi bát sứ thuỷ tinh (chụp - chân sứ), dọc +y
  function discGeo(len, r) {
    const key = 'disc_' + len.toFixed(1) + '_' + r.toFixed(2);
    if (GEO[key]) return GEO[key];
    const V = (x, y) => new THREE.Vector2(x, y), p = r * 0.9, n = Math.max(2, Math.round(len / p)), q = len / n, pts = [V(0.01, 0)];
    for (let i = 0; i < n; i++) { const y = i * q; pts.push(V(0.35, y + q * 0.1), V(r, y + q * 0.3), V(r * 0.85, y + q * 0.45), V(0.75, y + q * 0.7), V(0.75, y + q * 0.9)); }
    pts.push(V(0.01, len));
    const g = new THREE.LatheGeometry(pts, 7); g.userData.len = len;
    return (GEO[key] = g);
  }
  const torus = (R, t) => GEO['tor' + R + '_' + t] || (GEO['tor' + R + '_' + t] = new THREE.TorusGeometry(R, t, 6, 20));

  // ---- BIỂN BÁO: tam giác vàng tia sét (ISO 7010 W012) / đầu lâu xương chéo đỏ (biển "nguy hiểm chết người" kiểu VN)
  function bolt(g, cx, cy, s, col) {
    g.fillStyle = col; g.beginPath();
    [[0.12, -0.5], [-0.22, 0.06], [0.0, 0.06], [-0.14, 0.5], [0.24, -0.12], [0.02, -0.12], [0.2, -0.5]].forEach(([x, y], i) => i ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s));
    g.closePath(); g.fill();
  }
  function skull(g, cx, cy, s, col, bg) {
    g.save(); g.fillStyle = col;
    for (const a of [0.6, -0.6]) { g.save(); g.translate(cx, cy + s * 0.18); g.rotate(a); g.fillRect(-s * 0.48, -s * 0.05, s * 0.96, s * 0.1);
      for (const e of [-1, 1]) for (const o of [-1, 1]) { g.beginPath(); g.arc(e * s * 0.48, o * s * 0.06, s * 0.065, 0, Math.PI * 2); g.fill(); } g.restore(); }
    g.beginPath(); g.ellipse(cx, cy - s * 0.12, s * 0.27, s * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(cx - s * 0.15, cy + s * 0.04, s * 0.3, s * 0.14);
    g.fillStyle = bg;
    for (const e of [-1, 1]) { g.beginPath(); g.ellipse(cx + e * s * 0.1, cy - s * 0.12, s * 0.07, s * 0.08, 0, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.moveTo(cx, cy - s * 0.04); g.lineTo(cx - s * 0.04, cy + s * 0.03); g.lineTo(cx + s * 0.04, cy + s * 0.03); g.fill();
    for (const e of [-0.08, 0, 0.08]) g.fillRect(cx + e * s - s * 0.012, cy + s * 0.07, s * 0.024, s * 0.1);
    g.restore();
  }
  function hvTex(api, key, lines, o) {
    o = Object.assign({ w: 768, h: 384, bg: '#efece2', fg: '#a3221a', icon: 'bolt' }, o || {});
    return api.texOf('pw_' + key, o.w, o.h, (g, w, h) => {
      g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = o.fg; g.lineWidth = h * 0.05; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
      const S = h * 0.62, ix = h * 0.48, iy = h * 0.5;
      if (o.icon === 'skull') skull(g, ix, iy, S, '#b4231b', o.bg);
      else {
        g.fillStyle = '#e2b51e'; g.strokeStyle = '#151515'; g.lineWidth = S * 0.06; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(ix, iy - S * 0.48); g.lineTo(ix + S * 0.52, iy + S * 0.42); g.lineTo(ix - S * 0.52, iy + S * 0.42); g.closePath(); g.fill(); g.stroke();
        bolt(g, ix, iy + S * 0.08, S * 0.6, '#151515');
      }
      const x0 = h * 0.92, x1 = w - h * 0.08, n = lines.length;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((t, i) => {
        const sz = i === 0 ? h * (n > 2 ? 0.24 : 0.3) : h * (n > 2 ? 0.15 : 0.19);
        g.fillStyle = i === 0 ? o.fg : '#1d1d1d'; g.font = `bold ${sz | 0}px Arial, sans-serif`;
        const fit = Math.min(1, (x1 - x0) / g.measureText(t).width), y = n > 2 ? h * (0.27 + i * 0.25) : h * (n > 1 ? (i ? 0.68 : 0.36) : 0.5);
        g.save(); g.translate((x0 + x1) / 2, y); g.scale(fit, 1); g.fillText(t, 0, 0); g.restore();
      });
      api.speckle(g, w, h, 700, ['#6a6258', '#ffffff'], 1, 3, key.length * 7);
      if (api.ABANDONED) api.ageCanvas(g, w, h, key.length * 17 + 5, 1);
    });
  }
  // Biển số hiệu ngăn lộ / thiết bị (nền trắng chữ đỏ hoặc xanh)
  const plateTex = (api, txt, fg) => api.texOf('pw_no_' + txt, 192, 96, (g, w, h) => {
    g.fillStyle = '#ebe8de'; g.fillRect(0, 0, w, h); g.strokeStyle = fg || '#a3221a'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg || '#a3221a'; g.font = 'bold 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = Math.min(1, (w - 20) / g.measureText(txt).width); g.save(); g.translate(w / 2, h / 2 + 3); g.scale(fit, 1); g.fillText(txt, 0, 0); g.restore();
    if (api.ABANDONED) api.ageCanvas(g, w, h, txt.length * 11 + 3, 0.9);
  });

  KINDS.power = {
    name: 'TRẠM BIẾN ÁP 500 kV', icon: '⚡', color: '#ffe066',
    // đường cổng -> đường ngang trước hàng MBA -> đường trục giữa 2 sân phân phối; nền đá dăm phủ gần hết khu trong
    site: {
      roads: [[[[320, 0], [150, 0]], 30], [[[150, -440], [150, 440]], 26], [[[150, 0], [-214, 0]], 22]],
      junctions: [[150, 0, 26, 30]],
      gravel: (hu) => [[-252, -446, 44, 446], [44, -446, 138, 446], [hu - 150, -70, hu, 70], [162, -444, 254, -58], [162, 96, 254, 446]],
      slabs: [[PIT0, -156, PIT1, -40], [PIT0, 22, PIT1, 138], [PIT0, 192, PIT1, 288], [PIT0, -268, PIT1, -192], [166, 107, 246, 393]],
      noGrow: []
    },
    build(K, group, anim, api) {
      const { TAU, hash, texOf, blotch, signTex, decal, decalT, v3, M4, apron, roadNet, fence, sandbags, drum, secKit, perimeter, officeBlock, stack, vTank } = api;
      const L = K.L, SI = KINDS.power.site, M = mats(api), galv = M.galv;
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'power');
      roadNet(group, SI.roads, SI.junctions, { bars: [[L.hu - 150, 0, 2.4, 28]], words: [['STOP', L.hu - 144, 0, Math.PI / 2, 14]] });
      const kit = secKit(K, anim), { iF, iR, G, mul, acUnit, tower } = kit;
      perimeter(K, kit);
      const H = (n) => hash(n * 7.13 + 4410);
      const hvM = decal('pw_hv', hvTex(api, 'hv', ['NGUY HIỂM CHẾT NGƯỜI', 'ĐIỆN CAO THẾ — CẤM ĐẾN GẦN', 'DANGER — HIGH VOLTAGE'], { icon: 'skull' }));
      const hv5M = decal('pw_hv5', hvTex(api, 'hv5', ['ĐIỆN CAO THẾ 500 kV', 'CẤM TRÈO — NGUY HIỂM CHẾT NGƯỜI', 'HIGH VOLTAGE — DO NOT CLIMB']));
      const plate = (txt, f, y, r, ry, w, fg) => K.plane(decal('pw_no_' + txt, plateTex(api, txt, fg)), f, y, r, w || 7, (w || 7) / 2, ry);

      // ===================================================================================================
      // BỘ DỰNG CHUNG: giàn thép, dây dẫn, chuỗi sứ, trụ đỡ thiết bị
      // ===================================================================================================
      // Cột giàn thép tiết diện vuông thon dần (tâm f, r; nửa rộng w0 ở y0 -> w1 ở y1; n khoang). X: giằng chữ X,
      // không thì giằng zíc zắc
      const wAt = (y, y0, y1, w0, w1) => w0 + (w1 - w0) * (y - y0) / (y1 - y0);
      const CN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      function lattice(f, r, y0, y1, w0, w1, n, t, X, m) {
        m = m || galv;
        const c = (y, a, b) => { const w = wAt(y, y0, y1, w0, w1); return [f + a * w, y, r + b * w]; };
        for (const [a, b] of CN) K.beam(m, c(y0, a, b), c(y1, a, b), t * 1.6);
        for (let i = 0; i < n; i++) {
          const ya = y0 + (y1 - y0) * i / n, yb = y0 + (y1 - y0) * (i + 1) / n;
          for (let e = 0; e < 4; e++) {
            const [a, b] = CN[e], [a2, b2] = CN[(e + 1) % 4];
            K.beam(m, c(yb, a, b), c(yb, a2, b2), t);
            if (X || (i + e) % 2 === 0) K.beam(m, c(ya, a, b), c(yb, a2, b2), t * 0.75);
            if (X || (i + e) % 2 === 1) K.beam(m, c(ya, a2, b2), c(yb, a, b), t * 0.75);
          }
        }
      }
      // Dầm giàn mắt cáo ngang dọc trục r (tâm f, cao y; rộng w theo f, cao h)
      function girder(f, r0, r1, y, w, h, t) {
        const n = Math.max(2, Math.round(Math.abs(r1 - r0) / (h * 1.3))), P = (r, a, b) => [f + a * w / 2, y + b * h / 2, r];
        for (const [a, b] of CN) K.beam(galv, P(r0, a, b), P(r1, a, b), t * 1.4);
        for (let i = 0; i <= n; i++) {
          const r = r0 + (r1 - r0) * i / n;
          for (let e = 0; e < 4; e++) { const [a, b] = CN[e], [a2, b2] = CN[(e + 1) % 4]; K.beam(galv, P(r, a, b), P(r, a2, b2), t); }
          if (i === n) break;
          const rb = r0 + (r1 - r0) * (i + 1) / n, z = i % 2 ? 1 : -1;
          for (const b of [-1, 1]) K.beam(galv, P(r, z, b), P(rb, -z, b), t * 0.8);
          for (const a of [-1, 1]) K.beam(galv, P(r, a, z), P(rb, a, -z), t * 0.8);
        }
      }
      // Đặt hình dọc +y (dài geo.userData.len) từ A tới B
      function along(m, geo, A, B) {
        const a = v3(...A), d = v3(...B).sub(a), len = d.length();
        const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize());
        K.add(m, geo, new THREE.Matrix4().compose(a, q, v3(1, len / geo.userData.len, 1)));
      }
      // Chuỗi sứ néo / treo thủy tinh A -> B, phụ kiện 2 đầu, vòng đẳng thế đầu dây (500 kV)
      function string(A, B, r, ring) {
        along(M.glassI, discGeo(Math.max(4, Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) - 2), r || 1.6), A, B);
        for (const P of [A, B]) K.add(M.galvD, new THREE.SphereGeometry(0.7, 6, 4), M4(...P));
        if (ring) { const d = v3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).normalize(); K.add(M.alu, torus(3.2, 0.35), new THREE.Matrix4().compose(v3(...B).addScaledVector(d, -1.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), d), v3(1, 1, 1))); }
      }
      // Dây dẫn võng (parabol gần đúng dây xích) A -> B
      const sagPts = (A, B, sag, n) => { const p = []; for (let i = 0; i <= n; i++) { const t = i / n; p.push(v3(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t)); } return p; };
      function tube(pts, rad, m) {
        let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
        K.add(m || M.cond, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, Math.min(40, Math.round(len / 6))), rad, 4, false));
      }
      const wire = (A, B, sag, rad) => { const d = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]); if (d < 0.5) return; tube(sagPts(A, B, sag === undefined ? d * 0.03 : sag, Math.max(3, Math.min(14, Math.round(d / 10)))), rad || 0.34); };
      // Ống trụ thẳng A -> B (thanh dẫn kín pha, ống dẫn)
      function pipe(m, A, B, rad, seg) {
        const a = v3(...A), b = v3(...B), d = b.clone().sub(a), len = d.length();
        K.add(m, new THREE.CylinderGeometry(rad, rad, len, seg || 10), new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize()), v3(1, 1, 1)));
      }
      // Dây đứt từ điểm treo B rủ xuống đất tại (gf, gr), đoạn cuối nằm vắt trên đất
      function drape(B, gf, gr, rad, seed) {
        const gy = Math.max(0, K.earth(gf, gr)) + 0.6, pts = [];
        for (let j = 0; j <= 10; j++) { const u = j / 10, y = B[1] + (gy - B[1]) * Math.pow(u, 0.55) - 10 * Math.sin(u * Math.PI) * (1 - u); pts.push(v3(B[0] + (gf - B[0]) * u, Math.max(gy, y), B[2] + (gr - B[2]) * u * u)); }
        for (let j = 1; j <= 3; j++) { const f = gf - j * 5, r = gr + (H(j + seed) - 0.5) * 8 * j; pts.push(v3(f, Math.max(0, K.earth(f, r)) + 0.6, r)); }
        tube(pts, rad);
      }
      // Trụ đỡ thiết bị: móng bê tông + cột thép chữ H + mặt bích
      function ped(f, r, h, s) {
        const w = 3.4 * s + 0.6;
        K.cbox('concDark', f, 1.4, r, w * 2 + 2, 2.8, w * 2 + 2, 0.4);
        for (const d of [-1, 1]) K.box(galv, f, 2.8 + (h - 2.8) / 2, r + d * w / 2, w, h - 2.8, 0.35, 0, 24);
        K.box(galv, f, 2.8 + (h - 2.8) / 2, r, 0.35, h - 2.8, w, 0, 24);
        K.box(galv, f, h - 0.4, r, w * 1.5, 0.8, w * 1.5, 0, 24);
      }
      // Trụ sứ đứng (mặt bích chân + đỉnh); trả về cao độ đỉnh
      function post(f, r, y, len, rc, rs, m) {
        K.cyl(galv, f, y, r, rc + 0.7, rc + 0.9, 1.2, 10);
        K.add(m || M.porcG, insGeo(len, rc, rs, Math.max(1.5, rs * 0.55)), M4(f, y + 1.2, r));
        K.cyl(galv, f, y + 1.2 + len, r, rc + 0.6, rc + 0.6, 1.2, 10);
        return y + 2.4 + len;
      }
      const phases = (bay, V) => [bay - V.ph, bay, bay + V.ph];
      const gAt = (V, r) => [ROW.entry - 4 - 14 * V.s, V.gH - 9, r];   // đầu chuỗi néo trên giàn cổng

      // ===================================================================================================
      // THIẾT BỊ NGĂN LỘ (mỗi hàm dựng 3 pha, trả về cao độ đầu cực + nửa khoảng 2 đầu cực theo f)
      // ===================================================================================================
      // Máy cắt SF6 buồng ngắt kép chữ T trên trụ sứ, tủ truyền động lò xo ở chân trụ, ống khí SF6 + đồng hồ áp suất
      function breaker(f, rs, V) {
        const s = V.s; let ty = 0;
        for (const r of rs) {
          ped(f, r, V.hp, s);
          K.cbox('steelGray', f + 5.2 * s + 1.4, V.hp * 0.52, r, 3.4 * s + 1, 11 * s, 7 * s + 1, 0.3);
          K.box(galv, f + 3 * s + 1, V.hp * 0.52, r, 2, 1.2, 1.2, 0, 24);
          const top = post(f, r, V.hp, V.col, 2.2 * s + 0.5, 3.6 * s + 0.7, M.porcG);
          K.cbox(M.alu, f, top + 2.6 * s, r, 7 * s, 5.2 * s, 6 * s, 0.5);
          K.cyl('steelDark', f + 3.4 * s, top + 1, r + 3.2 * s, 0.8, 0.8, 2, 8);   // đồng hồ SF6
          ty = top + 2.6 * s;
          for (const d of [-1, 1]) {
            K.add(M.porcG, insGeo(13 * s, 1.9 * s + 0.4, 3.1 * s + 0.5, 1.7), M4(f + d * 3.5 * s, ty, r, 0, 0, d < 0 ? Math.PI / 2 : -Math.PI / 2));
            K.add(M.alu, new THREE.CylinderGeometry(2.4 * s, 2.4 * s, 2.6 * s, 10), M4(f + d * 17.6 * s, ty, r, 0, 0, Math.PI / 2));
            K.box(M.alu, f + d * 19.6 * s, ty + 1.6 * s, r, 1.4, 3.2 * s, 2.4, 0, 24);
            if (V.kv === 500) K.add(M.alu, torus(4.2, 0.5), M4(f + d * 15.6, ty, r, 0, Math.PI / 2, 0));
          }
        }
        K.solid(f, (rs[0] + rs[2]) / 2, 8 * s + 2, (rs[2] - rs[0]) / 2 + 6 * s, 0, V.hp + V.col);
        return { y: ty + 2.8 * s, df: 19.6 * s };
      }
      // Dao cách ly cắt giữa 2 trụ sứ quay (lưỡi dao ống nhôm, đóng: 2 nửa gặp nhau ở giữa; mở: quay 90°), dao tiếp địa
      // gập dọc khung đế, tủ cơ cấu thao tác + cần truyền động
      function discon(f, rs, V, open, earth) {
        const s = V.s, hp = V.hp - 2, Ld = 22 * s; let ty = 0;
        rs.forEach((r, k) => {
          for (const d of [-1, 1]) ped(f + d * Ld / 2, r, hp, s);
          K.box(galv, f, hp + 1.2, r, Ld + 6, 2.4, 2.4 * s + 0.6, 0, 24);
          for (const d of [-1, 1]) {
            K.cyl(M.galvD, f + d * Ld / 2, hp + 2.4, r, 2 * s + 0.4, 2 * s + 0.4, 2, 10);
            const top = post(f + d * Ld / 2, r, hp + 4.4, V.col - 4, 1.8 * s + 0.5, 3 * s + 0.6, M.porcG);
            K.cbox(M.alu, f + d * Ld / 2, top + 1, r, 3, 2.2, 3, 0.3);
            ty = top + 2.2;
            const op = open === true || (open === 'mixed' && k !== 1);
            if (!op) K.beam(M.alu, [f + d * Ld / 2, ty, r], [f - d * 0.6, ty, r], 1.1);
            else K.beam(M.alu, [f + d * Ld / 2, ty, r], [f + d * Ld / 2, ty, r + Ld / 2 - 1], 1.1);
          }
          if (!(open === true || (open === 'mixed' && k !== 1))) K.box(M.alu, f, ty, r, 2.4, 1.8, 2.2, 0, 24);
          if (earth) { K.cyl(M.galvD, f - Ld / 2 - 3, hp + 1, r, 1, 1, 2.4, 8); K.beam(M.alu, [f - Ld / 2 - 3, hp + 3, r + 2.4], [f + Ld / 2 - 2, hp + 3.4, r + 2.4], 0.7); }
          K.cbox('steelGray', f - Ld / 2, hp * 0.4, r + 3.4 * s + 2.6, 3.2, 7, 3.2, 0.3);
          K.beam(galv, [f - Ld / 2, hp * 0.4 + 3.5, r + 3.4 * s + 2.6], [f - Ld / 2, hp + 2, r + 2], 0.4);
        });
        K.solid(f, (rs[0] + rs[2]) / 2, Ld / 2 + 5, (rs[2] - rs[0]) / 2 + 6 * s, 0, hp + V.col);
        return { y: ty, df: Ld / 2 };
      }
      // Biến dòng điện cách điện dầu kiểu đầu sứ (head-type): bệ hộp, sứ nâu, thùng đầu nằm ngang 2 đầu cực, hộp giãn nở
      function ct(f, rs, V) {
        const s = V.s; let ty = 0;
        for (const r of rs) {
          ped(f, r, V.hp, s);
          K.cbox(M.trafo, f, V.hp + 2.6 * s, r, 6.4 * s, 5.2 * s, 6.4 * s, 0.4);
          const top = post(f, r, V.hp + 5.2 * s, V.col - 9 * s, 2.4 * s + 0.4, 3.8 * s + 0.6, M.porc);
          ty = top + 3.6 * s;
          K.add(M.trafo, new THREE.CylinderGeometry(3.8 * s, 3.8 * s, 9 * s, 14), M4(f, ty, r, 0, 0, Math.PI / 2));
          K.add(M.trafo, new THREE.SphereGeometry(3.8 * s, 12, 6, 0, TAU, 0, Math.PI / 2), M4(f, ty, r, 0, 0, 0, 1, 0.6, 1));
          K.cyl(M.alu, f, ty + 2.2 * s, r, 1.6 * s, 1.6 * s, 2.4 * s, 10);
          for (const d of [-1, 1]) K.box(M.alu, f + d * 5.6 * s, ty, r, 2.2 * s, 1.6, 2.2 * s, 0, 24);
        }
        K.solid(f, (rs[0] + rs[2]) / 2, 6 * s + 1, (rs[2] - rs[0]) / 2 + 5 * s, 0, ty + 4);
        return { y: ty, df: 5.6 * s };
      }
      // Tụ phân áp CVT (hộp điện từ dưới + 2 tầng tụ sứ xám) + bẫy sóng cao tần (cuộn dây trụ có nan chống) trên đỉnh
      function cvt(f, rs, V, trap) {
        const s = V.s; let ty = 0;
        rs.forEach((r, k) => {
          ped(f, r, V.hp, s);
          K.cbox(M.trafo, f, V.hp + 4 * s, r, 7.6 * s, 8 * s, 7.6 * s, 0.4);
          K.cbox('steelGray', f + 4.4 * s, V.hp + 3 * s, r, 1.2, 4 * s, 4 * s, 0.2);
          let y = post(f, r, V.hp + 8 * s, (V.col - 10 * s) / 2, 2 * s + 0.5, 3.4 * s + 0.6, M.porcG);
          y = post(f, r, y, (V.col - 10 * s) / 2, 2 * s + 0.5, 3.4 * s + 0.6, M.porcG);
          K.cyl(M.alu, f, y, r, 3 * s, 3 * s, 1.4, 12);
          ty = y + 1.4;
          if (trap && k !== 1) {
            K.cyl('steelDark', f, ty + 1.4, r, 5.6 * s, 5.6 * s, 11 * s, 14);
            for (const yy of [ty + 1.4, ty + 1.4 + 11 * s]) K.add(M.alu, torus(5.8 * s, 0.5), M4(f, yy, r, Math.PI / 2, 0, 0));
            for (let a = 0; a < 4; a++) K.box(M.alu, f, ty + 2 + 11 * s, r, 11 * s, 0.6, 0.8, a * Math.PI / 4, 24);
            K.add(M.porcG, insGeo(1.4, 1, 1.6, 1.4), M4(f, ty, r));
          }
        });
        K.solid(f, (rs[0] + rs[2]) / 2, 5 * s + 1, (rs[2] - rs[0]) / 2 + 5 * s, 0, ty + 10);
        return { y: (k) => ty + (trap && k !== 1 ? 12.4 * V.s : 0), df: 0 };
      }
      // Chống sét van oxit kẽm: chân cách điện + bộ đếm sét, các đoạn sứ xám chồng, vòng đẳng thế treo đỉnh (500 kV)
      function arrester(f, rs, V) {
        const s = V.s, nU = V.kv === 500 ? 3 : 2; let ty = 0;
        for (const r of rs) {
          ped(f, r, V.hp - 2, s);
          for (const a of [0, 2.1, 4.2]) K.add(M.porcG, insGeo(1.6, 0.6, 1, 1.6, 6), M4(f + Math.cos(a) * 2 * s, V.hp - 2, r + Math.sin(a) * 2 * s));
          K.cyl(galv, f, V.hp, r, 3 * s, 3 * s, 0.8, 12);
          K.cyl('steelWhite', f + 3.8 * s, V.hp - 9, r, 1.4, 1.4, 1, 10);   // bộ đếm sét
          let y = V.hp + 0.8;
          for (let i = 0; i < nU; i++) y = post(f, r, y, (V.col - 2) / nU - 2.4, 1.5 * s + 0.4, 2.8 * s + 0.4, M.porcG);
          ty = y;
          if (V.kv === 500) { for (let a = 0; a < 3; a++) K.beam(M.alu, [f, y - 1, r], [f + Math.cos(a * 2.1) * 6, y - 7, r + Math.sin(a * 2.1) * 6], 0.35); K.add(M.alu, torus(6.4, 0.45), M4(f, y - 7, r, Math.PI / 2, 0, 0)); }
        }
        K.solid(f, (rs[0] + rs[2]) / 2, 4 * s + 1, (rs[2] - rs[0]) / 2 + 4 * s, 0, ty);
        return { y: ty, df: 0 };
      }
      // Dao cách ly kiểu pantograph dưới thanh cái: trụ sứ đỡ + trụ sứ quay, cánh kéo hình thoi vươn lên kẹp ống thanh cái
      function panto(f, r, V, closed) {
        const s = V.s, top = post(f, r, V.hp - 2, V.col - 2, 1.9 * s + 0.5, 3.2 * s + 0.6, M.porcG);
        ped(f, r, V.hp - 2, s);
        K.add(M.porcG, insGeo(V.col - 6, 1.1, 1.8, 1.6, 6), M4(f + 4 * s, V.hp, r));
        K.cbox(M.alu, f, top + 1, r, 4, 2, 4, 0.3);
        const y0 = top + 2, y1 = closed ? V.busY - 1.6 : y0 + 5, ym = (y0 + y1) / 2, w = closed ? 3.4 * s : 7 * s;
        for (const [a, b] of [[[f, y0, r], [f - w, ym, r]], [[f, y0, r], [f + w, ym, r]], [[f - w, ym, r], [f, y1, r]], [[f + w, ym, r], [f, y1, r]]]) K.beam(M.alu, a, b, 0.8);
        K.box(M.alu, f, y1, r, 6, 0.7, 0.9, 0, 24);
        K.solid(f, r, 5, 5, 0, top);
        return top;
      }
      // Hộp đầu cáp 220 kV (đầu cáp ngoài trời trên khung thép 4 chân, cáp XLPE đen chui xuống mương có kẹp cáp)
      function sealEnd(f, r, h) {
        for (const [a, b] of CN) K.beam(galv, [f + a * 3, 0, r + b * 3], [f + a * 2, h, r + b * 2], 0.7);
        K.box(galv, f, h, r, 6, 0.8, 6, 0, 24);
        const top = post(f, r, h + 0.8, 22, 2, 3.4, M.porc);
        K.add(M.alu, new THREE.CylinderGeometry(1.8, 2.6, 3, 10), M4(f, top + 1.5, r));
        K.cyl(M.cable, f + 4, 0, r, 1, 1, h + 2, 8);
        K.beam(M.cable, [f + 4, h + 2, r], [f, h + 0.8, r], 1.6);
        for (let y = 6; y < h; y += 8) K.box(M.galvD, f + 4, y, r, 2.6, 0.8, 2.6, 0, 24);
        K.solid(f + 1, r, 4.5, 4, 0, top);
        return top + 3;
      }

      // ===================================================================================================
      // CỘT ĐIỆN THÁP THÉP MẠCH KÉP (đứng trong rào sau): thân 4 chân mắt cáo thon 2 đoạn, 3 tầng xà mỗi bên, đỉnh chống sét
      // ===================================================================================================
      function pylon(P, o) {
        const { f: pf, r: pr } = P, { Ht, bw, yW, ww, tw, arms, AL, hA } = o;
        const bodyW = (y) => y < yW ? wAt(y, 0, yW, bw, ww) : wAt(y, yW, Ht, ww, tw);
        for (const [a, b] of CN) {
          K.cbox('concDark', pf + a * bw, 1.8, pr + b * bw, 9, 3.6, 9, 0.6);
          K.solid(pf + a * bw, pr + b * bw, 4.5, 4.5, 0, 26);
        }
        lattice(pf, pr, 0, yW, bw, ww, Math.round(yW / 17), 1.15, true);
        lattice(pf, pr, yW, Ht, ww, tw, Math.round((Ht - yW) / 15), 1, true);
        // vách ngang giằng chéo ở cao độ xà
        for (const y of [yW].concat(arms)) { const w = bodyW(y); K.beam(galv, [pf - w, y, pr - w], [pf + w, y, pr + w], 0.8); K.beam(galv, [pf - w, y, pr + w], [pf + w, y, pr - w], 0.8); }
        // xà: dàn 4 thanh biên hội tụ ở đầu xà + thanh giằng
        const tips = [];
        arms.forEach((y, i) => {
          const L2 = AL[i];
          for (const sd of [-1, 1]) {
            const w0 = bodyW(y), w1 = bodyW(y + hA), tip = [pf, y, pr + sd * L2];
            const roots = [[pf - w0, y, pr + sd * w0], [pf + w0, y, pr + sd * w0], [pf - w1, y + hA, pr + sd * w1], [pf + w1, y + hA, pr + sd * w1]];
            for (const R of roots) K.beam(galv, R, tip, R[1] > y ? 0.9 : 1.1);
            const lerp = (A, t) => [A[0] + (tip[0] - A[0]) * t, A[1] + (tip[1] - A[1]) * t, A[2] + (tip[2] - A[2]) * t];
            for (let k = 1; k < 5; k++) {
              const t = k / 5, q = roots.map(R => lerp(R, t)), t2 = (k - 0.5) / 5, q2 = roots.map(R => lerp(R, t2));
              K.beam(galv, q[0], q[1], 0.6); K.beam(galv, q[2], q[3], 0.5);
              K.beam(galv, q2[0], q[2], 0.5); K.beam(galv, q2[1], q[3], 0.5); K.beam(galv, q2[0], q[1], 0.45);
            }
            K.box(M.galvD, tip[0], y + 0.6, tip[2], 3, 1.4, 3, 0, 24);
            tips.push({ sd, i, f: pf, y, r: pr + sd * L2 });
          }
        });
        // đỉnh chống sét: chóp + 2 tay mang dây chống sét
        lattice(pf, pr, Ht, Ht + 26, tw, 1, 2, 0.8, false);
        const ew = [];
        for (const sd of [-1, 1]) { K.beam(galv, [pf, Ht + 22, pr], [pf, Ht + 24, pr + sd * 22], 0.9); K.beam(galv, [pf, Ht + 12, pr + sd * tw], [pf, Ht + 23, pr + sd * 22], 0.6); ew.push([pf, Ht + 23, pr + sd * 22]); }
        K.add(anim.blink, new THREE.SphereGeometry(1.4, 8, 6), M4(pf, Ht + 28, pr));
        // chống trèo: vành thép gai quanh 4 chân ~3 m, biển cấm trèo, bậc leo trên 1 chân, biển số cột
        const ya = 24, wa = bodyW(ya) + 1.5;
        for (let e = 0; e < 4; e++) { const [a, b] = CN[e], [a2, b2] = CN[(e + 1) % 4]; for (const dy of [0, 2, 4]) K.beam('steelDark', [pf + a * wa, ya + dy, pr + b * wa], [pf + a2 * wa, ya + dy, pr + b2 * wa], 0.18); }
        for (let y = 30; y < yW; y += 3.2) { const w = bodyW(y); K.box(M.galvD, pf + w + 0.6, y, pr + w, 1.4, 0.3, 0.3, 0, 24); }
        K.plane(hv5M, pf + bodyW(16) + 0.6, 16, pr, 10, 5);
        plate(o.no, pf + bodyW(36) + 0.7, 36, pr, Math.PI / 2, 8, '#1d4f9a');
        return { tips, ew };
      }

      // ===================================================================================================
      // GIÀN CỔNG: cột mắt cáo vuông + dầm mắt cáo, cột kim chống sét trên đỉnh, dây chống sét căng giữa các đỉnh
      // ===================================================================================================
      function gantry(f, cols, Hg, spans, peak) {
        for (const r of cols) {
          K.cbox('concDark', f, 2, r, 14, 4, 14, 0.8);
          lattice(f, r, 3, Hg, 6, 4, Math.round(Hg / 13), 0.8, false);
          K.solid(f, r, 6.5, 6.5, 0, Hg);
          if (peak) { lattice(f, r, Hg, Hg + 26, 4, 0.8, 2, 0.6, false); K.cyl(galv, f, Hg + 26, r, 0.25, 0.5, 14, 6); }
        }
        for (const [a, b] of spans || cols.slice(1).map((c, i) => [i, i + 1])) girder(f, cols[a] + 4, cols[b] - 4, Hg - 4, 8, 8, 0.7);
        if (peak) for (let i = 1; i < cols.length; i++) wire([f, Hg + 25, cols[i - 1]], [f, Hg + 25, cols[i]], 3, 0.18);
      }
      // cột thu sét độc lập: tháp mắt cáo thon + kim thu sét
      function lMast(f, r, Hm) {
        K.cbox('concDark', f, 2, r, 22, 4, 22, 0.8);
        lattice(f, r, 3, Hm, 9, 2, Math.round(Hm / 16), 0.8, false);
        K.cyl(galv, f, Hm, r, 0.3, 0.9, 40, 6);
        K.solid(f, r, 10, 10, 0, Hm + 40);
      }

      // ===================================================================================================
      // 1. SÂN PHÂN PHỐI 500 kV + 220 kV
      // ===================================================================================================
      const tieRef = {};   // điểm nối dây lên giàn MBA theo ngăn
      function yard(V) {
        const s = V.s;
        // thanh cái ống nhôm 3 pha dọc r trên trụ sứ đỡ (mỗi ~40 đơn vị), quả cầu chống vầng quang ở 2 đầu
        const [ra, rb] = V.busR, n = Math.round((rb - ra) / 58), bpL = V.col + 2, bph = V.busY - bpL - 5.6;
        V.bus.forEach((bf) => {
          K.add(M.alu, new THREE.CylinderGeometry(1.1, 1.1, rb - ra, 10), M4(bf, V.busY, (ra + rb) / 2, Math.PI / 2, 0, 0));
          for (const r of [ra, rb]) K.add(M.alu, new THREE.SphereGeometry(2.2, 10, 8), M4(bf, V.busY, r));
          for (let i = 0; i <= n; i++) {
            const r = ra + (rb - ra) * i / n;
            if (V.bays.some(b => Math.abs(r - b) < 6 || Math.abs(r - b - V.ph) < 6 || Math.abs(r - b + V.ph) < 6 || Math.abs(r - b - V.ph - 14) < 12)) continue;
            ped(bf, r, bph, s);
            const top = post(bf, r, bph, bpL, 1.9 * s + 0.5, 3.2 * s + 0.6, M.porcG);
            K.box(M.alu, bf, top + 1.6, r, 2.6, 3.2, 3.2, 0, 24);
            K.solid(bf, r, 4, 4, 0, top);
          }
        });
        // giàn cổng đón dây đường dây
        gantry(ROW.entry, V.entry, V.gH, null, true);
        V.bays.forEach((bay, bi) => {
          const rs = phases(bay, V), isLine = V.line[bi];
          if (isLine) {
            const cv = cvt(ROW.cvt, rs, V, true), ar = arrester(ROW.arr, rs, V), ds = discon(ROW.ds, rs, V, bi % 2 ? 'mixed' : false, true);
            const c = ct(ROW.ct, rs, V), cb = breaker(ROW.cb, rs, V);
            rs.forEach((r, k) => {
              // dây: giàn -> bẫy sóng/CVT -> dao cách ly -> biến dòng -> máy cắt -> pantograph -> thanh cái
              const gA = gAt(V, r);
              string([ROW.entry - 4, V.gH - 6, r], gA, 1.4 * s + 0.4, V.kv === 500);
              wire(gA, [ROW.cvt, cv.y(k), r], 6 * s);
              wire([ROW.cvt, cv.y(k), r], [ROW.ds - ds.df, ds.y, r], 2);
              wire([ROW.arr, ar.y, r], [ROW.arr + 8, (cv.y(k) + ds.y) / 2 - 2, r], 1);
              wire([ROW.ds + ds.df, ds.y, r], [ROW.ct - c.df, c.y, r], 1.2);
              wire([ROW.ct + c.df, c.y, r], [ROW.cb - cb.df, cb.y, r], 1.2);
              const pt = panto(V.bus[k], r, V, !(bi === 1 && k === 2));
              wire([ROW.cb + cb.df, cb.y, r], [V.bus[k], pt + 1, r], 2);
            });
            plate(V.no[bi], ROW.entry + 6.6, 18, V.entry.filter(c => c < bay).pop(), Math.PI / 2, 8);
            K.plane(decal('pw_no_' + V.no[bi], plateTex(api, V.no[bi])), ROW.cb + 10 * s, 6, bay, 7, 3.5);
          } else {
            const cb = breaker(ROW.tcb, rs, V);
            rs.forEach((r, k) => {
              const pt = panto(V.bus[k], r, V, true);
              wire([V.bus[k], pt + 1, r], [ROW.tcb - cb.df, cb.y, r], 2);
              (tieRef[bay] = tieRef[bay] || [])[k] = [ROW.tcb + cb.df, cb.y, r];
            });
            K.plane(decal('pw_no_' + V.no[bi], plateTex(api, V.no[bi])), ROW.tcb + 10 * s, 6, bay, 7, 3.5);
          }
        });
        // mương cáp nhánh dọc mỗi ranh ngăn lộ
        for (const bay of V.bays) trench([[ROW.entry + 10, bay + V.ph + 14], [4, bay + V.ph + 14]], 9);
      }

      // ---- MƯƠNG CÁP: gờ bê tông 2 bên + tấm đan nắp 1 m (vài tấm bị cạy: lộ lòng mương tối, cáp; tấm đan vứt cạnh)
      let tn = 0;
      function trench(pts, w) {
        for (let i = 1; i < pts.length; i++) {
          const [f0, r0] = pts[i - 1], [f1, r1] = pts[i], len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0), nx = -Math.sin(ang), nz = Math.cos(ang);
          for (const sd of [-1, 1]) K.box('concDark', (f0 + f1) / 2 + nx * sd * (w / 2 + 0.6), 0.9, (r0 + r1) / 2 + nz * sd * (w / 2 + 0.6), len + 2.4, 1.8, 1.2, -ang, 64);
          const n = Math.max(1, Math.round(len / 8));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n, f = f0 + (f1 - f0) * t, r = r0 + (r1 - r0) * t, h = H(++tn);
            if (h < 0.07) {
              K.box('void', f, 0.75, r, len / n, 0.1, w, -ang, 0);
              for (const o of [-2, 0, 2]) K.box(M.cable, f, 0.9, r + o * Math.cos(ang), len / n, 0.6, 0.6, -ang, 0);
              if (h < 0.04) K.box('concDark', f + nx * (w + 2), 0.6, r + nz * (w + 2), len / n - 0.4, 0.7, w, -ang + 0.3, 64);
            } else K.box('concDark', f, 1.25 + (h > 0.93 ? 0.3 : 0), r, len / n - 0.35, 0.7, w, -ang + (h > 0.96 ? 0.05 : 0), 64);
          }
        }
      }

      yard(Y5); yard(Y2);
      // mương cáp chính: dọc sau hàng MBA, dọc 2 bên đường trục, trước sân nhà điều khiển
      trench([[44, -20], [-206, -20]], 10); trench([[44, 24], [-206, 24]], 10);
      trench([[44, -24], [134, -24]], 8); trench([[168, -24], [168, -222]], 8);

      // ---- cột điện + dây vào giàn cổng; phía ngoài: dây đứt rủ qua rào xuống ụ đất
      const P5 = pylon(PY5, { Ht: 320, bw: 22, yW: 196, ww: 8, tw: 5, arms: [196, 236, 276], AL: [60, 66, 58], hA: 14, no: 'VT 01' });
      const P2 = pylon(PY2, { Ht: 236, bw: 19, yW: 140, ww: 6.5, tw: 4, arms: [136, 166, 196], AL: [40, 44, 38], hA: 11, no: 'VT 04' });
      const lineUp = (P, V, py, bays) => {
        for (const t of P.tips) {
          const bay = t.sd < 0 ? bays[0] : bays[1], k = t.sd < 0 ? 2 - t.i : t.i, r = phases(bay, V)[k], s = V.s;
          const A = [t.f + 16 * s, t.y - 4, t.r], B = [t.f - 16 * s, t.y - 4, t.r];
          string([t.f + 1.5, t.y, t.r], A, 1.4 * s + 0.4, V.kv === 500); string([t.f - 1.5, t.y, t.r], B, 1.4 * s + 0.4, V.kv === 500);
          wire(A, B, 9 * s, 0.34);                                  // lèo nối qua cột
          wire(A, gAt(V, r), 4);
          // dây phía ngoài: đứt, rủ qua 2 lớp rào xuống ụ đất, đoạn cuối nằm trên đất
          const sd = H(t.i * 5 + t.sd + py);
          drape(B, -(L.hu - 16 - sd * 10), t.r + (H(t.i + 31 + py) - 0.5) * 40, 0.34, t.i * 3 + py);
        }
        // dây chống sét: vào đỉnh giàn, phía ngoài đứt rủ
        P.ew.forEach((E, j) => { wire(E, [ROW.entry, V.gH + 25, V.entry[j ? V.entry.length - 1 : 0]], 5, 0.18); drape(E, -(L.hu - 22), E[2] + 10, 0.18, j + py * 7); });
      };
      lineUp(P5, Y5, 1, [Y5.bays[0], Y5.bays[1]]);
      lineUp(P2, Y2, 2, [Y2.bays[3], Y2.bays[4]]);

      // ===================================================================================================
      // 2. HÀNG MÁY BIẾN ÁP + GIÀN CỔNG MBA
      // ===================================================================================================
      // Tường ngăn cháy bê tông 9 m: cột + tấm đúc sẵn, gờ đỉnh, dây leo, (MBA cháy: loang muội đen)
      const sootM = decalT('pw_soot', texOf('pw_soot', 256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) blotch(g, w * (0.3 + hash(i + 6100) * 0.4), h * (0.15 + hash(i + 6101) * 0.85), 20 + hash(i + 6102) * 60, '18,16,14', 0.32);
        for (let i = 0; i < 30; i++) { const x = w * (0.2 + hash(i + 6110) * 0.6), gr = g.createLinearGradient(0, 0, 0, h * 0.7); gr.addColorStop(0, 'rgba(20,18,16,0.55)'); gr.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = gr; g.fillRect(x, 0, 4 + hash(i + 6111) * 14, h * (0.3 + hash(i + 6112) * 0.5)); }
      }));
      function firewall(r, f0, f1, Hw, sooty) {
        const n = Math.max(2, Math.round((f1 - f0) / 26));
        for (let i = 0; i <= n; i++) K.cbox('conc', f0 + (f1 - f0) * i / n, Hw / 2, r, 5, Hw, 6, 0.6);
        for (let i = 0; i < n; i++) K.cbox('conc', f0 + (f1 - f0) * (i + 0.5) / n, Hw / 2, r, (f1 - f0) / n - 4.6, Hw - 2, 3.4, 0.3);
        K.cbox('concDark', (f0 + f1) / 2, Hw + 0.8, r, f1 - f0 + 6, 1.6, 7, 0.4);
        K.solid((f0 + f1) / 2, r, (f1 - f0) / 2 + 3, 3.4, 0, Hw + 2);
        if (sooty) for (const sd of [-1, 1]) K.add(sootM, new THREE.PlaneGeometry(f1 - f0 - 6, Hw), M4((f0 + f1) / 2, Hw / 2, r + sd * 1.85, 0, sd > 0 ? 0 : Math.PI, 0));
        if (api.ABANDONED) for (let k = 0; k < 4; k++) {
          const hh = 18 + H(r + k * 3) * 40, f = f0 + 6 + H(r * 0.3 + k) * (f1 - f0 - 12), sd = H(k + r) < 0.5 ? -1 : 1;
          K.add('vine', new THREE.PlaneGeometry(9 + H(k + 7 + r) * 8, hh), M4(f, Hw - hh / 2 + 1, r + sd * 1.95, 0, sd > 0 ? 0 : Math.PI, 0));
        }
      }
      const flatGeo = (w, d, tile) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); } return g; };
      const oilM = decalT('pw_oil', texOf('pw_oil', 256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) blotch(g, w * (0.25 + hash(i + 6200) * 0.5), h * (0.25 + hash(i + 6201) * 0.5), 14 + hash(i + 6202) * 46, '22,18,12', 0.36);
      }));
      // Máy biến áp (trục dài theo r, sứ cao áp hàng phía -f): o = { W, D, Ht, hv: [len, rc, rs, rel r[]], mv, cons, burnt, rad: 'f'|'r', name }
      function transformer(cf, cr, o) {
        const W = o.W, D = o.D, Ht = o.Ht, m = o.burnt ? M.soot : M.trafo, y0 = 4, yt = y0 + 3 + Ht, top = yt + 1.6, hw = o.hw;
        // hố thu dầu: gờ bê tông 2 đầu, đá dăm thấm dầu, vết dầu loang; dầm đỡ + ray kéo máy chạy ra đường
        for (const f of [PIT0, PIT1]) K.cbox('concDark', f, 1.6, cr, 3, 3.2, hw * 2 - 4, 0.4);
        K.add(M.pit, flatGeo(PIT1 - PIT0 - 3, hw * 2 - 8, 24), M4((PIT0 + PIT1) / 2, 0.9, cr));
        K.add(oilM, flatGeo(D + 30, W * 0.9, 0), M4(cf + 4, 1.0, cr + 4, 0, H(cr) * 3, 0));
        for (const d of [-1, 1]) {
          K.cbox('conc', (PIT0 + PIT1) / 2 + 2, 2, cr + d * W * 0.28, PIT1 - PIT0 + 2, 4, 6, 0.5);
          K.box('steelDark', (PIT0 + PIT1) / 2 + 2, 4.3, cr + d * W * 0.28, PIT1 - PIT0 + 2, 0.7, 0.9, 0, 24);
        }
        // thùng: đế trượt, thân gân tăng cứng, mặt bích nắp, nắp vồng, tai cẩu, bệ kích
        K.cbox('steelDark', cf, y0 + 1.5, cr, D + 4, 3, W + 4, 0.5);
        K.cbox(m, cf, y0 + 3 + Ht / 2, cr, D, Ht, W, 0.8);
        K.cbox(m, cf, yt + 0.8, cr, D + 2.4, 1.6, W + 2.4, 0.4);
        K.cbox(m, cf, top + 0.7, cr, D - 5, 1.4, W - 7, 0.5);
        for (let r = -W / 2 + 6; r <= W / 2 - 5; r += 9) for (const d of [-1, 1]) K.box(m, cf + d * (D / 2 + 0.6), y0 + 3 + Ht / 2, cr + r, 1.2, Ht - 2, 1.6, 0, 24);
        for (const d of [-1, 1]) for (let f2 = -D / 2 + 6; f2 <= D / 2 - 5; f2 += 10) K.box(m, cf + f2, y0 + 3 + Ht / 2, cr + d * (W / 2 + 0.6), 1.6, Ht - 2, 1.2, 0, 24);
        for (const [a, b] of CN) { K.box(m, cf + a * (D / 2 + 1), yt - 3, cr + b * (W / 2 - 4), 2.4, 4, 3, 0, 24); K.box('steelDark', cf + a * (D / 2 + 1.4), y0 + 6, cr + b * (W / 2 - 3), 3, 3, 4, 0, 24); }
        // sứ xuyên: tháp chân sứ (biến dòng chân sứ), mặt bích, thân sứ nâu, mũ nhôm + vòng chống vầng quang; vỡ: cụt + mảnh vỡ
        const bush = (f, r, len, rc, rs, tilt, ring, broken) => {
          K.cyl(m, f, top, r, rc + 1.6, rc + 2, 6, 14);
          K.cyl(m, f, top + 6, r, rc + 1, rc + 1, 2.4, 12);
          const L2 = broken ? len * (0.3 + H(f + r) * 0.25) : len;
          K.add(M.porc, insGeo(L2, rc, rs, Math.max(2, rs * 0.55)), M4(f, top + 8.4, r, tilt, 0, 0));
          const ty = top + 8.4 + L2 * Math.cos(tilt), tz = r + L2 * Math.sin(tilt);
          if (broken) { for (let k = 0; k < 6; k++) { const sz = 0.8 + H(k + f) * 1.8; K.add(M.porc, new THREE.IcosahedronGeometry(sz, 0), M4(f + (H(k + r) - 0.5) * 20, top + 1.8 + sz * 0.3, r + (H(k * 3 + r) - 0.5) * 16, H(k) * 3, H(k + 1) * 3, 0, 1, 0.5, 1)); } return [f, ty, tz]; }
          K.add(M.alu, new THREE.CylinderGeometry(rc + 0.4, rc + 1.2, 3, 12), M4(f, ty + 1.5 * Math.cos(tilt), tz + 1.5 * Math.sin(tilt), tilt, 0, 0));
          if (ring) K.add(M.alu, torus(rs + 2, 0.7), M4(f, ty + 1, tz, Math.PI / 2 + tilt, 0, 0));
          K.cyl(M.alu, f, ty + 3, tz, 0.8, 0.8, 3, 8);
          return [f, ty + 6, tz];
        };
        const out = { hv: [], mv: [] };
        if (o.hv) { const [len, rc, rs, rels, fo] = o.hv; rels.forEach((rl, k) => out.hv.push(bush(cf + fo, cr + rl, len, rc, rs, (k - 1) * 0.08, len > 50, o.burnt && k !== 1))); }
        if (o.mv) { const [len, rc, rs, pos] = o.mv; pos.forEach(([fo, rl], k) => out.mv.push(bush(cf + fo, cr + rl, len, rc, rs, 0, false, o.burnt && k === 0))); }
        if (o.small) for (const [fo, rl, len] of o.small) bush(cf + fo, cr + rl, len, 1.2, 2.1, 0, false, false);
        // bình dầu phụ (conservator) trên giá: rơ-le hơi, ống dầu, đồng hồ mức dầu, bình thở silicagel; ngăn riêng bộ điều áp
        if (o.cons) {
          const [cf2, r0, r1] = o.cons, cy = top + 16, cl = r1 - r0, cm = (r0 + r1) / 2;
          K.add(m, new THREE.CylinderGeometry(5.4, 5.4, cl, 18), M4(cf + cf2, cy, cr + cm, Math.PI / 2, 0, 0));
          for (const e of [r0, r1]) K.add(m, new THREE.SphereGeometry(5.4, 14, 8), M4(cf + cf2, cy, cr + e, 0, 0, 0, 1, 1, 0.35));
          K.box(m, cf + cf2, cy - 2, cr + r1 - 9.5, 11, 0.8, 0.8, 0, 24);
          for (const e of [r0 + 6, r1 - 6]) { K.beam(m, [cf + cf2 - 4, top, cr + e], [cf + cf2, cy - 4.4, cr + e], 1); K.beam(m, [cf + cf2 + 4, top, cr + e], [cf + cf2, cy - 4.4, cr + e], 1); }
          K.beam(m, [cf + cf2, cy - 5, cr + cm], [cf + cf2 - 6, top + 1, cr + cm - 4], 1.2);
          K.cbox('steelGray', cf + cf2 - 3, top + 6, cr + cm - 2, 2.6, 2.6, 2.6, 0.3);
          K.add('steelWhite', new THREE.CylinderGeometry(2.4, 2.4, 0.6, 14), M4(cf + cf2, cy, cr + r1 + 2.1, Math.PI / 2, 0, 0));
          K.cyl('glass', cf + cf2 + 5.6, y0 + Ht * 0.45, cr + r0 + 3, 1.3, 1.3, 5, 8); K.beam(m, [cf + cf2 + 5.6, y0 + Ht * 0.45 + 5, cr + r0 + 3], [cf + cf2 + 2, cy - 4, cr + r0 + 3], 0.5);
          if (o.oltc) { K.add(m, new THREE.CylinderGeometry(3.6, 3.6, 12, 14), M4(cf + cf2, cy - 1, cr + r0 - 8, Math.PI / 2, 0, 0)); K.cbox(m, cf, y0 + 3 + Ht * 0.55, cr - W / 2 - 4.4, 15, Ht * 0.62, 7, 0.5); K.cbox('steelGray', cf - D / 2 + 3, 12, cr - W / 2 - 3, 6, 11, 4, 0.4); }
        }
        // dàn tản nhiệt cánh tấm (ống góp trên / dưới, van nối thùng) + quạt làm mát
        const fin = o.burnt ? M.soot : m;
        const bankF = (rc0, bw) => {
          const fx = cf + D / 2 + 8, n = Math.round(bw / 1.15);
          for (const yy of [yt - 4, y0 + 7]) { K.add(fin, new THREE.CylinderGeometry(1.1, 1.1, bw + 2, 8), M4(fx, yy, cr + rc0, Math.PI / 2, 0, 0)); K.add(fin, new THREE.CylinderGeometry(1.4, 1.4, 6, 8), M4(fx - 4.2, yy, cr + rc0, 0, 0, Math.PI / 2)); }
          for (let k = 0; k < n; k++) { const bent = o.burnt && H(k + rc0) < 0.25; K.box(fin, fx + (bent ? 1.2 : 0), y0 + 3 + Ht / 2 - 1, cr + rc0 - bw / 2 + (k + 0.5) * bw / n, 12, Ht - 10, 0.35, 0, 24, 0, bent ? 0.12 : 0); }
          if (!o.burnt) { K.add('steelGray', new THREE.CylinderGeometry(4.2, 4.2, 2.4, 14), M4(fx + 7.4, y0 + 11, cr + rc0, 0, 0, Math.PI / 2)); K.add('void', new THREE.CircleGeometry(3.7, 14), M4(fx + 8.7, y0 + 11, cr + rc0, 0, Math.PI / 2, 0)); for (const a of [0, Math.PI / 2]) K.box('steelDark', fx + 8.8, y0 + 11, cr + rc0, 0.3, 7.6, 0.4, 0, 0, a); }
        };
        const bankR = (sd, bw) => {
          const rx = cr + sd * (W / 2 + 8), n = Math.round(bw / 1.15);
          for (const yy of [yt - 4, y0 + 7]) K.add(fin, new THREE.CylinderGeometry(1.1, 1.1, bw + 2, 8), M4(cf, yy, rx, 0, 0, Math.PI / 2));
          for (let k = 0; k < n; k++) K.box(fin, cf - bw / 2 + (k + 0.5) * bw / n, y0 + 3 + Ht / 2 - 1, rx, 0.35, Ht - 10, 12, 0, 24);
        };
        if (o.rad === 'r') { bankR(-1, D - 6); bankR(1, D - 6); } else for (const rc0 of o.banks) bankF(rc0, 15);
        // tủ điều khiển tại chỗ, dây tiếp địa đồng, hệ phun nước chữa cháy (ống đỏ vòng quanh thùng + vòi phun)
        K.cbox('steelGray', cf - D / 2 - 6, 12, cr + W / 2 - 6, 5, 14, 8, 0.4);
        K.box('steelGray', cf - D / 2 - 6, 4, cr + W / 2 - 6, 1, 8, 1, 0, 24);
        for (const [a, b] of [[-1, -1], [1, 1]]) K.box(M.cu, cf + a * (D / 2 + 0.9), y0 + 1, cr + b * (W / 2 - 2), 0.3, 6, 0.8, 0, 0);
        const dx = D / 2 + 5, dz = W / 2 + (o.rad === 'r' ? 16 : 5), dy = yt + 3;
        for (const [a0, b0, a1, b1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) K.beam(M.red, [cf + a0 * dx, dy, cr + b0 * dz], [cf + a1 * dx, dy, cr + b1 * dz], 0.7);
        for (const [a, b] of [[-1, -1], [1, 1]]) K.beam(M.red, [cf + a * dx, 0, cr + b * dz], [cf + a * dx, dy, cr + b * dz], 0.9);
        for (let k = 0; k < 8; k++) { const t = k / 8 - 0.44; K.cyl(M.red, cf - dx, dy - 1.4, cr + t * dz * 2, 0.4, 0.2, 1.4, 6); }
        // biển tên trên cột trước hố dầu + biển nguy hiểm
        for (const d of [-12, 12]) K.cyl('steelGray', PIT1 - 1.2, 3.2, cr + d, 0.6, 0.6, 12, 6);
        K.plane(decal('pw_name_' + o.name[0], signTex('pw_name_' + o.name[0], o.name, { w: 768, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), PIT1 - 0.5, 12.4, cr, 22, 5.5);
        K.plane(hvM, PIT1 - 0.5, 6.4, cr + 15, 8, 4);
        K.solid(cf + 6, cr, D / 2 + 16, W / 2 + (o.rad === 'r' ? 16 : 6), 0, yt + 4);
        return out;
      }
      // AT1 / AT2: 500/220/35 kV, sứ 500 kV hàng phía sân (-f), sứ 220 kV hàng dọc đầu +r xuống 3 hộp đầu cáp cạnh hố
      const AT = (cr, name) => {
        const o = transformer(TF, cr, { W: 76, D: 34, Ht: 36, hw: 60, hv: [66, 1.8, 3.2, [-28, -8, 12], -9], mv: [38, 1.5, 2.6, [[-11, 30], [0, 30], [11, 30]]],
          small: [[2, -30, 12], [3, -20, 9], [3, -12, 9], [3, -4, 9]], cons: [12, -32, 20], oltc: true, banks: [-27, -9, 9, 27], name });
        firewall(cr - 60, PIT0 - 2, PIT1, 72); firewall(cr + 60, PIT0 - 2, PIT1, 72);
        o.mv.forEach((B, k) => { const se = sealEnd(B[0] - 4, cr + 48, 22); wire(B, [B[0] - 4, se, cr + 48], 1.5); });
        return o;
      };
      const T1 = AT(-98, ['MÁY BIẾN ÁP AT1', '500/220/35 kV — 450 MVA']);
      const T2 = AT(80, ['MÁY BIẾN ÁP AT2', '500/220/35 kV — 450 MVA']);
      // kháng điện bù ngang 500 kV (thùng thấp, 3 sứ, tản nhiệt 2 đầu)
      const KH = transformer(TF - 2, -230, { W: 44, D: 30, Ht: 34, hw: 40, hv: [66, 1.8, 3.2, [-14, 0, 14], -6], cons: [9, -16, 14], rad: 'r', name: ['KHÁNG ĐIỆN KH501', '500 kV — 3 x 30 MVAr'] });
      firewall(-270, PIT0 - 2, PIT1, 66); firewall(-190, PIT0 - 2, PIT1, 66);
      // MBA tăng áp tổ máy T3 15.75/220 kV — ĐÃ CHÁY (thùng ám khói, sứ vỡ, tản nhiệt cong vênh, tường loang muội)
      const T3 = transformer(TF, 240, { W: 60, D: 30, Ht: 32, hw: 50, hv: [38, 1.5, 2.6, [-20, 0, 20], -8], cons: [9, -26, 10], rad: 'r', burnt: true, name: ['MBA TĂNG ÁP T3', '15,75/220 kV — 63 MVA'] });
      firewall(190, PIT0 - 2, PIT1, 64, true); firewall(290, PIT0 - 2, PIT1, 64, true);

      // giàn cổng MBA + dây nối: thanh cái dây mềm 3 pha treo dưới dầm (sứ treo) nối ngăn 531 -> AT1, AT2, kháng điện;
      // ngăn 233 (sân 220) -> T3
      gantry(TG, TG_COLS, TGH, [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6]], true);
      const tieY = TGH - 19, tf = (k) => TG - 8 + k * 8;
      for (let k = 0; k < 3; k++) {
        const susp = [-252, -150, -30, 48, 104];
        for (const r of susp) { if (!k) K.box(galv, TG, TGH - 9, r, 20, 1.2, 1.2, 0, 24); string([tf(k), TGH - 9.6, r], [tf(k), tieY, r], 1.2, false); }
        for (let i = 1; i < susp.length; i++) wire([tf(k), tieY, susp[i - 1]], [tf(k), tieY, susp[i]], 4, 0.4);
        const tp = (r) => [tf(k), tieY - 2, r];
        wire(tieRef[-98][k], tp(tieRef[-98][k][2]), 3);
        wire(tp(T1.hv[k][2]), T1.hv[k], 5); wire(tp(T2.hv[k][2]), T2.hv[k], 5); wire(tp(KH.hv[k][2]), KH.hv[k], 5);
        const g3 = [TG, TGH - 14, 240 + (k - 1) * 22];
        string([TG, TGH - 8, g3[2]], g3, 1, false);
        wire(tieRef[240][k], g3, 3); if (k === 1) wire(g3, T3.hv[k], 5);
        else wire(g3, [g3[0] + 8, 70 - k * 6, g3[2] + 3], 2);   // dây đã tháo khỏi sứ vỡ, buông thõng
      }
      // ngăn MBA 220 kV đi cáp: hộp đầu cáp trước máy cắt
      for (const bay of [80, 160]) phases(bay, Y2).forEach((r, k) => { const se = sealEnd(34, r, 18); wire(tieRef[bay][k], [34, se, r], 1.5); });
      // cột thu sét
      lMast(-200, -98, 210); lMast(-200, 160, 200); lMast(40, -432, 200);

      // ===================================================================================================
      // 3. GIÀN TỤ BÙ (rào riêng): 3 giá thép 3 tầng, mỗi tầng 2 hàng bình tụ có sứ đầu cực, sứ đỡ giữa các tầng
      // ===================================================================================================
      {
        const f0 = 66, f1 = 128;
        for (const rc of [-412, -374, -336]) {
          for (let t = 0; t < 3; t++) {
            const y = 8 + t * 13;
            for (const sd of [-1, 1]) K.box(galv, (f0 + f1) / 2, y, rc + sd * 7, f1 - f0 - 8, 1, 1.4, 0, 24);
            for (let k = 0; k < 9; k++) for (const sd of [-1, 1]) {
              const f = f0 + 8 + k * 5.6, r = rc + sd * 3.6;
              K.box('steelWhite', f, y + 4.6, r, 3.6, 8, 2.4, 0, 0);
              K.cyl(M.porcG, f, y + 8.6, r, 0.5, 0.7, 1.8, 6);
            }
            if (t < 2) for (const f of [f0 + 6, f1 - 6]) for (const sd of [-1, 1]) K.add(M.porcG, insGeo(3.6, 0.9, 1.5, 1.4, 6), M4(f, y + 9.4, rc + sd * 7));
          }
          for (const f of [f0 + 4, f1 - 4]) for (const sd of [-1, 1]) K.add(M.porcG, insGeo(6, 1.2, 2, 1.8, 6), M4(f, 1.2, rc + sd * 7));
        }
        fence(K, f0 - 4, -432, f1 + 2, -432, -1, 15); fence(K, f0 - 4, -312, f1 + 2, -312, 1, 15);
        fence(K, f0 - 4, -432, f0 - 4, -312, -1, 15); fence(K, f1 + 2, -432, f1 + 2, -390, 1, 15); fence(K, f1 + 2, -360, f1 + 2, -312, 1, 15);
        K.plane(hvM, f1 + 2.7, 8, -330, 12, 6);
        K.plane(decal('pw_cap', signTex('pw_cap', ['GIÀN TỤ BÙ C21', 'CAPACITOR BANK — DISCHARGE BEFORE TOUCHING'], { w: 768, h: 192, bg: '#e9e6dc', fg: '#a3221a' })), f1 + 2.7, 8, -410, 20, 5);
        K.solid((f0 + f1) / 2, -374, (f1 - f0) / 2, 50, 0, 48);
      }

      // ===================================================================================================
      // 4. NHÀ ĐIỀU KHIỂN - RƠ-LE 2 tầng (mặt tiền nhìn ra đường), cột ăng-ten viba, máy phát diesel dự phòng, cuộn cáp
      // ===================================================================================================
      officeBlock(K, kit, 210, -292, Math.PI, 56, 160, 2, ['TRẠM BIẾN ÁP 500 kV — NHÀ ĐIỀU KHIỂN', 'CONTROL & RELAY BUILDING']);
      {
        // phòng ắc quy: cửa chớp thông gió + quạt hút; lối cáp vào nhà
        const back = M4(238, 0, -292, 0, Math.PI / 2, 0);
        for (const x of [-60, -40]) { K.box('louver', 238.4, 8, -292 + x, 0.6, 6, 10); acUnit(back, x + 90, 7); }
        K.cbox('concDark', 176, 0.9, -232, 12, 1.8, 14, 0.3);
        // cột ăng-ten viba mắt cáo tam giác trên mái + 2 chảo viba, ăng-ten roi
        const af = 222, ar = -350, ay = 37;
        lattice(af, ar, ay, ay + 120, 4, 1.6, 9, 0.5, false);
        for (const [y, rot] of [[ay + 96, 0.4], [ay + 78, -1.9]]) { K.add('steelWhite', new THREE.CylinderGeometry(5, 5, 2.6, 16), M4(af + Math.cos(rot) * 5, y, ar + Math.sin(rot) * 5, 0, -rot, Math.PI / 2)); K.add('steelGray', new THREE.CircleGeometry(4.8, 16), M4(af + Math.cos(rot) * 6.4, y, ar + Math.sin(rot) * 6.4, 0, Math.PI / 2 - rot, 0)); }
        K.cyl('steelGray', af, ay + 120, ar, 0.2, 0.4, 24, 5); K.add(anim.blink, new THREE.SphereGeometry(1.2, 8, 6), M4(af, ay + 145, ar));
        K.solid(af, ar, 5, 5, ay, ay + 140);
      }
      {
        // máy phát diesel dự phòng trong container 12 m: vách tôn sóng, cửa chớp 2 đầu, ống xả + bầu giảm thanh trên nóc,
        // bồn dầu đáy, tủ chuyển nguồn ATS, cáp xuống mương
        const f = 186, r = -140, Lc = 96;
        K.cbox('concDark', f, 1, r, 24, 2, Lc + 6, 0.4);
        K.box('corrGray', f, 13, r, 20, 22, Lc);
        K.cbox('steelDark', f, 3.2, r, 21, 2.4, Lc + 1, 0.3);
        for (const e of [-1, 1]) K.box('louver', f, 13, r + e * (Lc / 2 + 0.3), 16, 16, 0.6);
        for (const x of [-30, 0, 30]) K.box('steelGray', f - 10.2, 11, r + x, 0.5, 16, 10);
        K.add('steelGray', new THREE.CylinderGeometry(3, 3, 22, 14), M4(f, 27, r + 22, Math.PI / 2, 0, 0));
        K.cyl('steelRust', f, 24, r + 34, 1.6, 1.6, 18, 10);
        K.cbox('steelGray', f - 13, 9, r - 56, 5, 14, 9, 0.3);
        K.plane(decal('pw_dg', signTex('pw_dg', ['MÁY PHÁT DIESEL DỰ PHÒNG', 'STANDBY GENERATOR — 1250 kVA'], { w: 768, h: 160, bg: '#e9e6dc', fg: '#1d2a3a' })), f - 10.6, 18, r - 20, 22, 4.6, -Math.PI / 2);
        K.solid(f, r, 12, Lc / 2 + 3, 0, 26);
        // cuộn cáp gỗ (1 cuộn đổ nghiêng), pallet sứ dự phòng, phuy dầu
        for (const [cf, crr, tip] of [[170, -400, 0], [182, -420, 0], [168, -430, 1]]) {
          const b = M4(cf, 7, crr, tip ? Math.PI / 2 : 0, 0.3 + tip, tip ? 0 : Math.PI / 2);
          K.add('wood', new THREE.CylinderGeometry(7, 7, 1, 16), mul(b, M4(0, 3.5, 0))); K.add('wood', new THREE.CylinderGeometry(7, 7, 1, 16), mul(b, M4(0, -3.5, 0)));
          K.add(M.cable, new THREE.CylinderGeometry(5, 5, 6, 16), b);
          K.solid(cf, crr, 8, 8, 0, 14);
        }
        for (let i = 0; i < 4; i++) drum(K, 180 + (i % 2) * 5.4, -380 + Math.floor(i / 2) * 5.6, i === 2 ? 'drumRust' : 'drumBlue', 0);
        K.box('wood', 196, 0.7, -388, 12, 1.4, 12);
        for (let k = 0; k < 3; k++) K.add(M.porcG, insGeo(18, 1.8, 3, 1.8, 8), M4(192 + k * 4, 2.6, -388, 0, 0, Math.PI / 2));
      }

      // ===================================================================================================
      // 5. KHỐI TUA-BIN KHÍ chu trình đơn + thanh dẫn kín pha sang MBA T3 + bồn dầu trong đê đất
      // ===================================================================================================
      {
        const gf = 206;
        K.cbox('conc', gf, 1.5, 250, 80, 3, 286, 0.6);
        // vỏ cách âm: tấm panel có gân ghép, gờ mái, cửa chớp, cửa người đi viền sọc, quạt thông gió mái
        const encl = (r0, r1, wf, Hh, name) => {
          const rc = (r0 + r1) / 2, lr = r1 - r0;
          K.cbox(M.panel, gf, 3 + Hh / 2, rc, wf, Hh, lr, 0.6);
          K.cbox(M.panel, gf, 3 + Hh + 0.8, rc, wf + 1.6, 1.6, lr + 1.6, 0.3);
          for (let r = r0 + 6; r < r1 - 3; r += 7) for (const d of [-1, 1]) K.box(M.panel, gf + d * (wf / 2 + 0.3), 3 + Hh / 2, r, 0.6, Hh - 1, 0.7, 0, 24);
          for (let r = r0 + 14; r < r1 - 10; r += 26) { K.box('louver', gf + wf / 2 + 0.4, 3 + Hh * 0.7, r, 0.6, Hh * 0.3, 10); K.box('louver', gf - wf / 2 - 0.4, 3 + Hh * 0.7, r + 10, 0.6, Hh * 0.3, 10); }
          for (const d of [-1, 1]) { K.box('steelGray', gf + d * (wf / 2 + 0.4), 10, r0 + 10, 0.6, 14, 6); K.box('hazard', gf + d * (wf / 2 + 0.5), 10, r0 + 10, 0.3, 15, 7.4, 0, 16); }
          for (let r = r0 + 14; r < r1 - 8; r += 22) { K.cyl('steelGray', gf + 6, 3 + Hh + 1.6, r, 4, 4, 4, 14); K.add('void', new THREE.CircleGeometry(3.4, 14), M4(gf + 6, 3 + Hh + 5.7, r, -Math.PI / 2, 0, 0)); }
          K.plane(decal('pw_' + name[0], signTex('pw_' + name[0], name, { w: 768, h: 160, bg: '#e9e6dc', fg: '#a3221a' })), gf - wf / 2 - 0.7, 3 + Hh * 0.36, rc, Math.min(26, lr * 0.4), 5.4, -Math.PI / 2);
          K.solid(gf, rc, wf / 2 + 1, lr / 2, 0, Hh + 8);
        };
        encl(112, 170, 36, 34, ['MÁY PHÁT GT1', 'GENERATOR — HEARING PROTECTION REQUIRED']);
        encl(176, 300, 40, 40, ['TUA-BIN KHÍ GT1', 'GAS TURBINE — CO2 FLOODING ZONE']);
        // nhà lọc gió nâng trên 4 cột: mặt lọc chụp mưa 3 phía, ống dẫn gió xuống miệng hút máy nén
        const fy = 54, fH = 40, fr0 = 146, fr1 = 202, fW = 52;
        for (const [a, b] of [[-1, fr0 + 2], [1, fr0 + 2], [-1, fr1 - 2], [1, fr1 - 2]]) { K.box(galv, gf + a * (fW / 2 - 2), fy / 2, b, 2.4, fy, 2.4, 0, 24); }
        K.beam(galv, [gf - fW / 2 + 2, 6, fr0 + 2], [gf - fW / 2 + 2, fy, fr1 - 2], 0.8); K.beam(galv, [gf + fW / 2 - 2, 6, fr0 + 2], [gf + fW / 2 - 2, fy, fr1 - 2], 0.8);
        K.cbox(M.panel, gf, fy + fH / 2, (fr0 + fr1) / 2, fW, fH, fr1 - fr0, 0.6);
        for (let k = 0; k < 4; k++) {
          const y = fy + 5 + k * 9;
          K.box('louver', gf + fW / 2 + 0.4, y + 2, (fr0 + fr1) / 2, 0.6, 6, fr1 - fr0 - 4);
          K.box(M.panel, gf + fW / 2 + 2.4, y + 5.6, (fr0 + fr1) / 2, 4.6, 0.5, fr1 - fr0 - 2, 0, 24, 0, -0.5);
          K.box('louver', gf, y + 2, fr0 - 0.4, fW - 4, 6, 0.6);
          K.box(M.panel, gf, y + 5.6, fr0 - 2.4, fW - 2, 0.5, 4.6, 0, 24, -0.5);
        }
        K.cbox(M.panel, gf, (fy + 43) / 2, 186, 22, fy - 43, 16, 0.5);
        for (let y = 6; y < fy + fH; y += 2.6) K.box(galv, gf + fW / 2 + 5, y, fr1 + 4, 0.3, 0.3, 3, 0, 24);
        K.solid(gf, (fr0 + fr1) / 2, fW / 2 + 4, (fr1 - fr0) / 2, fy - 4, fy + fH + 2);
        // ống xả loe -> ống khói thép có sàn công tác, thang lồng
        K.cbox(M.panel, gf, 22, 316, 30, 34, 32, 0.6);
        K.cbox('steelRust', gf, 30, 334, 26, 40, 8, 0.5);
        stack(K, gf, 354, 15, 13, 200, 'steelGray');
        // dàn quạt làm mát dầu bôi trơn (fin-fan) trên khung, trạm khí nhiên liệu (ống vàng), giàn bình CO2 đỏ
        K.cbox(galv, 240, 13, 238, 14, 2, 54, 0.3);
        for (const [a, b] of CN) K.box(galv, 240 + a * 6, 6, 238 + b * 25, 1.4, 12, 1.4, 0, 24);
        K.cbox('steelGray', 240, 17, 238, 14, 6, 54, 0.5);
        for (const r of [222, 238, 254]) { K.cyl('steelDark', 240, 20, r, 6, 6, 1.4, 16); K.add('void', new THREE.CircleGeometry(5.4, 16), M4(240, 21.5, r, -Math.PI / 2, 0, 0)); for (const a of [0, 1.05, 2.1]) K.box('steelGray', 240, 21.7, r, 11, 0.4, 0.8, a, 0); }
        K.solid(240, 238, 8, 28, 0, 22);
        K.cbox('steelGray', 174, 8, 330, 14, 16, 30, 0.5); K.box('louver', 167, 8, 330, 0.6, 10, 20);
        for (const z of [-4, 4]) { pipe(M.gas, [174 + z, 3, 344], [174 + z, 3, 400], 1.2); K.box(galv, 174, 1.2, 360 + z * 6, 14, 2.4, 1.4, 0, 24); }
        pipe(M.gas, [181, 6, 322], [186, 6, 300], 1.2); pipe(M.gas, [186, 6, 300], [186, 16, 296], 1.2);
        K.solid(174, 330, 8, 16, 0, 18);
        for (let i = 0; i < 10; i++) { const r = 116 + i * 4.2; K.cyl(M.red, 240, 3, r, 1.7, 1.7, 15, 10); K.add(M.red, new THREE.SphereGeometry(1.7, 10, 6, 0, TAU, 0, Math.PI / 2), M4(240, 18, r)); K.cyl('steelGray', 240, 18.6, r, 0.5, 0.5, 2, 6); }
        K.box('steelGray', 240, 18, 135, 2, 0.6, 44, 0, 24);
        K.solid(240, 135, 4, 23, 0, 21);
        K.plane(decal('pw_gt', signTex('pw_gt', ['TỔ MÁY TUA-BIN KHÍ GT1 — 50 MW', 'NHIÊN LIỆU KHÍ — CẤM LỬA / NO OPEN FLAME'], { w: 1024, h: 160, bg: '#d9a61c', fg: '#151515' })), gf - 20.7, 32, 266, 40, 6.2, -Math.PI / 2);
        // thanh dẫn kín pha (IPB): 3 ống Ø ~1 m từ hộp đầu cực máy phát, vắt qua đường trên khung cổng, sang T3
        const iy = 40, ip = [[gf - 18, 150], [176, 150], [176, 240], [TF + 17, 240]];
        for (let k = 0; k < 3; k++) {
          const o = (k - 1) * 7, pts = [[ip[0][0], ip[0][1] + o], [ip[1][0] - o, ip[1][1] + o], [ip[2][0] - o, ip[2][1] + o], [ip[3][0], ip[3][1] + o]];
          for (let i = 1; i < pts.length; i++) pipe('steelGray', [pts[i - 1][0], iy, pts[i - 1][1]], [pts[i][0], iy, pts[i][1]], 3, 14);
          for (const P of pts.slice(1, 3)) K.add('steelGray', new THREE.SphereGeometry(3, 12, 8), M4(P[0], iy, P[1]));
        }
        // khung cổng đỡ IPB (2 chân + xà) và hộp đầu cực máy phát / hộp đầu cực T3
        const portal = (f, r, alongR) => {
          for (const d of [-1, 1]) K.box(galv, f + (alongR ? 0 : d * 13), (iy - 4) / 2, r + (alongR ? d * 13 : 0), 2, iy - 4, 2, 0, 24);
          K.box(galv, f, iy - 4.6, r, alongR ? 3 : 30, 2, alongR ? 30 : 3, 0, 24);
          K.solid(f, r, alongR ? 2 : 14, alongR ? 14 : 2, 0, iy + 4);
        };
        portal(180, 150, true); portal(176, 196, false); portal(168, 240, true);
        K.cbox('steelGray', gf - 18, 26, 150, 6, 30, 26, 0.4);
        K.cbox(M.soot, TF + 18, 34, 240, 6, 14, 26, 0.4);
        // bồn dầu nhiên liệu dự phòng trong đê đất ngăn tràn: bồn + thang, cầu thang thép vắt qua đê, ống dẫn
        const B = L.bund;
        vTank(K, B.f, B.r, 17, 40, 0.4);
        K.plane(decal('pw_fuel', signTex('pw_fuel', ['DẦU DO — DIESEL FUEL', 'CHẤT DỄ CHÁY — CẤM LỬA'], { w: 768, h: 192, bg: '#d9a61c', fg: '#151515' })), B.f + 17.3, 22, B.r, 16, 4);
        const bf = B.f + B.R, by = K.earth(bf, B.r);
        for (const sd of [-1, 1]) K.beam(galv, [bf + sd * 12, 0, B.r - 10], [bf, by + 1, B.r - 10], 0.8);
        K.box(galv, bf, by + 1, B.r - 10, 6, 0.6, 5, 0, 24);
        pipe(M.gas, [B.f + 17, 3, B.r - 6], [bf + 2, by + 2.5, B.r - 6], 1); pipe(M.gas, [bf + 2, by + 2.5, B.r - 6], [bf + 12, 2, B.r - 6], 1);
      }

      // ===================================================================================================
      // 6. BIỂN BÁO + CANH PHÒNG + XE BỎ LẠI + DẤU VẾT BỎ HOANG
      // ===================================================================================================
      // bảng tên trạm cạnh đường vào, biển nguy hiểm điện cao thế trên rào trong
      K.plane(decal('pw_main', signTex('pw_main', ['TRẠM BIẾN ÁP 500/220 kV', 'TRUYỀN TẢI ĐIỆN — KHU VỰC CẤM / RESTRICTED AREA'], { w: 1024, h: 224, bg: '#1d3f6e', fg: '#ffffff', fg2: '#f0c419', border: '#e9e6dc' })), 222, 19, -(G + 8) + 1.5, 40, 8.8, 0);
      for (const f of [-180, -60, 60, 180]) for (const sd of [-1, 1]) K.plane(hvM, f, 8, sd * (iR + 0.6), 12, 6, sd > 0 ? 0 : Math.PI);
      for (const r of [-300, -100, 100, 300]) K.plane(hvM, -iF - 0.6, 8, r, 12, 6, -Math.PI / 2);
      for (const c of [-158, -38, 40, 120, 200, 280]) K.plane(hvM, TG + 6.6, 10, c, 8, 4);
      // tháp canh (4 góc + cổng), bao cát chốt gác
      for (const [f, r] of [[iF - 38, -(iR - 38)], [iF - 38, iR - 38], [-iF + 38, -(iR - 36)], [-iF + 38, iR - 36], [iF - 28, -(G + 40)], [iF - 28, G + 40]]) tower(f, r);
      sandbags(K, 176, 64, 176, 90, 3, 0); sandbags(K, 176, 90, 196, 96, 3, 0);
      // dấu vết bỏ hoang: chuỗi sứ đứt nằm trên nền sỏi, sứ đỡ gãy đổ, biến dòng đổ nghiêng, mảnh sứ vỡ, vết dầu
      string([-150, 1.6, 200], [-126, 1.2, 214], 1.4, false);
      wire([-126, 1.2, 214], [-96, 0.9, 236], 1);
      K.add(M.porc, insGeo(26, 2.2, 3.6, 2), M4(-140, 3.6, -120, 0, 0.8, Math.PI / 2 - 0.05));
      K.add(M.trafo, new THREE.CylinderGeometry(3.8, 3.8, 9, 14), M4(-112, 3.8, -130, Math.PI / 2, 0, 0));
      for (let k = 0; k < 24; k++) { const sz = 0.5 + H(k + 900) * 1.4, f = -130 + H(k + 901) * 70, r = (H(k + 902) < 0.5 ? -1 : 1) * (60 + H(k + 903) * 330); K.add(H(k + 904) < 0.6 ? M.porc : M.glassI, new THREE.IcosahedronGeometry(sz, 0), M4(f, sz * 0.3 + 0.4, r, H(k) * 3, H(k + 1) * 3, 0, 1, 0.5, 1)); }
      for (const [f, r, s] of [[20, -98, 60], [24, 160, 50], [-80, 240, 40], [-140, -338, 40]]) K.add(oilM, flatGeo(s, s * 0.7, 0), M4(f, 0.8, r, 0, H(f + r) * 3, 0));
      // xe bỏ lại: xe trinh sát trên đường ngang, xe bồn nhiên liệu cạnh đê dầu, xe bánh xích ở sân trước nhà điều khiển
      anim.vehicles.push({ type: 'SCOUT', f: 152, r: -250, a: Math.PI / 2 + 0.25, ty: 0.4, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: -150, r: 2, a: Math.PI + 0.06, ty: -0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'ARTILLERY', f: 152, r: 330, a: -Math.PI / 2, chassis: true, cargo: 'jp8', hf: 50, hr: 13 });
      anim.vehicles.push({ type: 'GATLING', f: -62, r: 0, a: 0.04, ty: 1.1, hf: 43, hr: 32 });
    }
  };
})();
