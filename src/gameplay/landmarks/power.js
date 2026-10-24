/**
 * TRUNG TÂM NĂNG LƯỢNG NGUYÊN TỬ — NHÀ MÁY ĐIỆN NHIỆT HẠCH KIỂU TOKAMAK, BỎ HOANG (bản đồ thành phố)
 *
 * Bố trí theo các tổ hợp lò nhiệt hạch thật (kiểu ITER / DEMO): mọi thiết bị hạt nhân nằm KÍN trong nhà bê tông
 * cốt thép dày, ngoài trời chỉ còn bồn khí lạnh, tháp giải nhiệt, máy biến áp và ống khói thải.
 * - NHÀ TOKAMAK (lõi lò): khối bê tông che chắn bức xạ không cửa sổ, trụ bổ tường, mạch ngừng đổ bê tông, dải ốp
 *   thép không gỉ phía trên, khoang khóa khí cho người, cửa thiết bị thép dày trượt ngang có ray, quạt lọc HEPA và
 *   đường ống thông gió trên mái nối sang ống khói thải.
 * - NHÀ LẮP RÁP cao nhất khu: vách tôn trên chân bê tông, cửa nâng cỡ lớn có khung, dải kính cửa mái, dầm cầu trục
 *   nhô ra trước cửa.
 * - NHÀ TRITI / BUỒNG NÓNG: bê tông kín, quạt hút, ống khói thải triti thép không gỉ cao có sàn công tác.
 * - NHÀ MÁY LẠNH SÂU (heli lỏng): nhà xưởng + hàng bồn heli khí, bồn nitơ lỏng đứng ngoài trời.
 * - NHÀ BIẾN ĐỔI ĐIỆN CẤP NAM CHÂM: khối dài thấp đầy cửa chớp, quạt mái; ống thanh dẫn kín vắt qua đường sang lò.
 * - NHÀ TUA-BIN: tua-bin hơi + máy phát trong nhà, cửa lớn ra đường; 2 MBA tăng áp giữa tường ngăn cháy.
 * - Tháp giải nhiệt cưỡng bức 2 x 4 ngăn quạt, giàn ống nước tuần hoàn vắt qua đường, bồn nước chữa cháy trong đê
 *   đất (MapGen: L.bund), nhà điều hành, rào canh phòng, biển cảnh báo phóng xạ.
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / bờ đê: MapGen (map_gen.js:
 * detailPower / moundPower). Tỉ lệ 8 đơn vị = 1 m.
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  // ---- BỐ CỤC (f: trục trước-sau, cổng ở +f; r: ngang) ----
  const RING = 0;                                                // đường nội bộ dọc r chạy trước mặt lò
  const TK = { f0: -240, f1: -28, r0: -160, r1: 120, H: 230 };   // nhà tokamak
  const AH = { f0: -240, f1: -40, r0: 130, r1: 292, H: 320 };    // nhà lắp ráp
  const HC = { f0: -240, f1: -104, r0: -332, r1: -172, H: 170 }; // nhà triti / buồng nóng
  const CP = { f0: -240, f1: -96, r0: -452, r1: -350 };          // nhà máy lạnh sâu
  const CT = { f0: -240, f1: -60, r0: 316, r1: 452, H: 58 };     // tháp giải nhiệt
  const TB = { f0: 22, f1: 128, r0: 36, r1: 296, H: 150 };       // nhà tua-bin
  const PC = { f0: 22, f1: 128, r0: -300, r1: -36, H: 84 };      // nhà biến đổi điện nam châm
  const STK = { f: -64, r: -256 };                               // ống khói thải triti

  const PM = {};
  function mats(api) {
    if (PM.ss) return PM;
    const S = o => new THREE.MeshStandardMaterial(o);
    const G = (rust, o) => { const [t, b] = api.grimePair('r' + rust, rust); return S(Object.assign({ map: t, bumpMap: b, bumpScale: 0.3 }, o)); };
    PM.ss = G(1.2, { color: 0xa9adae, roughness: 0.38, metalness: 0.7 });       // thép không gỉ ốp tường / ống khói
    PM.hatch = G(2.6, { color: 0x56606a, roughness: 0.55, metalness: 0.55 });   // cửa thiết bị thép dày
    PM.trafo = G(2.2, { color: 0x76807f, roughness: 0.6, metalness: 0.3 });
    PM.porc = G(0.8, { color: 0x6c3522, roughness: 0.3, metalness: 0.05 });
    PM.blue = G(1.8, { color: 0x2f5878, roughness: 0.6, metalness: 0.3 });     // ống nước tuần hoàn
    PM.alu = G(1, { color: 0xb2b6b3, roughness: 0.42, metalness: 0.62 });
    PM.soot = S({ color: 0x1c1a18, roughness: 0.95, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    PM.cu = G(3, { color: 0x5e4630, roughness: 0.7, metalness: 0.5 });
    PM.vv = G(3, { color: 0x7d8186, roughness: 0.6, metalness: 0.6 });                     // vỏ buồng chân không: thép không gỉ xỉn, ám bụi
    PM.coil = G(3.4, { color: 0x5d5f61, roughness: 0.58, metalness: 0.62 });              // vỏ cuộn siêu dẫn: thép đúc xám chì, gỉ loang
    PM.cable = S({ color: 0x1d1e1d, roughness: 0.85 });
    PM.rubble = S({ map: api.detailTex('gravel'), color: 0x8e887d, roughness: 1 });
    PM.mli = G(2.4, { color: 0xb8913f, roughness: 0.38, metalness: 0.8, bumpScale: 0.9 });   // giấy bạc cách nhiệt nhiều lớp (vàng kim, nhăn)
    PM.soot2 = G(4, { color: 0x2c2926, roughness: 0.95, metalness: 0.15 });
    PM.yel = G(1.6, { color: 0xc9a227, roughness: 0.6, metalness: 0.2 });
    return PM;
  }
  // Biển cảnh báo phóng xạ: nền vàng, hình 3 cánh quạt (ISO 361) đen, chữ đỏ / đen
  function trefoil(g, cx, cy, s, col) {
    g.fillStyle = col;
    g.beginPath(); g.arc(cx, cy, s * 0.15, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + k * Math.PI * 2 / 3, d = Math.PI / 6;
      g.beginPath(); g.arc(cx, cy, s * 0.5, a - d, a + d); g.arc(cx, cy, s * 0.22, a + d, a - d, true); g.closePath(); g.fill();
    }
  }
  function radTex(api, key, lines, o) {
    o = Object.assign({ w: 768, h: 384, bg: '#f2c318', fg: '#151515' }, o || {});
    return api.texOf('fu_' + key, o.w, o.h, (g, w, h) => {
      g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#151515'; g.lineWidth = h * 0.05; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
      trefoil(g, h * 0.5, h * 0.5, h * 0.7, '#151515');
      const x0 = h * 0.95, x1 = w - h * 0.08, n = lines.length;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((t, i) => {
        const sz = i === 0 ? h * (n > 2 ? 0.22 : 0.28) : h * (n > 2 ? 0.14 : 0.18);
        g.fillStyle = i === 0 ? '#a3221a' : o.fg; g.font = `bold ${sz | 0}px Arial, sans-serif`;
        const fit = Math.min(1, (x1 - x0) / g.measureText(t).width), y = n > 2 ? h * (0.27 + i * 0.25) : h * (n > 1 ? (i ? 0.68 : 0.36) : 0.5);
        g.save(); g.translate((x0 + x1) / 2, y); g.scale(fit, 1); g.fillText(t, 0, 0); g.restore();
      });
      api.speckle(g, w, h, 700, ['#6a6258', '#ffffff'], 1, 3, key.length * 7);
      if (api.ABANDONED) api.ageCanvas(g, w, h, key.length * 17 + 5, 1);
    });
  }
  // Biểu tượng 3 cánh quạt cỡ lớn sơn thẳng lên tường (không chữ)
  const bigTrefoilTex = (api) => api.texOf('fu_trefoil', 256, 256, (g, w, h) => {
    g.fillStyle = '#f2c318'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2); g.fill();
    trefoil(g, w / 2, h / 2, w * 0.82, '#151515');
    if (api.ABANDONED) api.ageCanvas(g, w, h, 41, 1);
  });

  KINDS.power = {
    name: 'TRUNG TÂM NĂNG LƯỢNG NGUYÊN TỬ', icon: '☢', color: '#ffd23c',
    // cổng -> đường trục ngang (f = 150) -> nhánh vào (r = 0) -> đường nội bộ trước mặt lò (f = 0)
    site: {
      roads: [[[[320, 0], [150, 0]], 30], [[[150, -440], [150, 440]], 26], [[[150, 0], [RING, 0]], 22], [[[RING, -440], [RING, 440]], 20]],
      junctions: [[150, 0, 26, 30], [RING, 0, 20, 22]],
      gravel: () => [[30, 318, 122, 412]],
      slabs: [],
      noGrow: []
    },
    build(K, group, anim, api) {
      const { TAU, hash, signTex, decal, M4, apron, roadNet, sandbags, drum, secKit, perimeter, officeBlock, stack, vTank } = api;
      const L = K.L, SI = KINDS.power.site, M = mats(api);
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'power');
      roadNet(group, SI.roads, SI.junctions, { bars: [[L.hu - 150, 0, 2.4, 28]], words: [['STOP', L.hu - 144, 0, Math.PI / 2, 14]] });
      const kit = secKit(K, anim), { iF, iR, G, mul, acUnit, tower, win } = kit;
      perimeter(K, kit);
      const H = (n) => hash(n * 7.13 + 4410);
      const radM = decal('fu_rad', radTex(api, 'rad', ['CAUTION — RADIATION', 'CONTROLLED AREA', 'AUTHORIZED PERSONNEL ONLY']));
      const triM = decal('fu_tri', radTex(api, 'tri', ['TRITIUM — RADIOACTIVE GAS', 'RESPIRATOR & DOSIMETER REQUIRED']));
      const tre = decal('fu_trefoil', bigTrefoilTex(api));
      const label = (key, lines, f, y, r, w, h, ry, o) => K.plane(decal('fu_' + key, signTex('fu_' + key, lines, Object.assign({ w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' }, o || {}))), f, y, r, w, h, ry);
      const pipe = (m, A, B, rad, seg) => {
        const a = new THREE.Vector3(...A), b = new THREE.Vector3(...B), d = b.clone().sub(a), len = d.length();
        K.add(m, new THREE.CylinderGeometry(rad, rad, len, seg || 12), new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
      };
      // mặt tường (gốc ở tâm mặt, +z hướng ra ngoài) theo 4 phía của khối f0..f1 x r0..r1
      const faces = (B) => {
        const fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2;
        return {
          front: { m: M4(B.f1, 0, rc, 0, Math.PI / 2, 0), len: B.r1 - B.r0 }, back: { m: M4(B.f0, 0, rc, 0, -Math.PI / 2, 0), len: B.r1 - B.r0 },
          sideP: { m: M4(fc, 0, B.r1, 0, 0, 0), len: B.f1 - B.f0 }, sideN: { m: M4(fc, 0, B.r0, 0, Math.PI, 0), len: B.f1 - B.f0 }
        };
      };
      // trụ bổ tường dọc mặt (bước p), dày t
      const pilasters = (F, y0, y1, p, t, m) => {
        for (const k of Object.keys(F)) { const { m: b, len } = F[k]; for (let x = -len / 2 + p / 2; x < len / 2; x += p) K.add(m || 'concDark', new THREE.BoxGeometry(5, y1 - y0, t), mul(b, M4(x, (y0 + y1) / 2, t / 2))); }
      };
      // dải ngang quanh khối (mạch ngừng bê tông / gờ)
      const band = (B, y, h, out, m) => K.cbox(m || 'concDark', (B.f0 + B.f1) / 2, y, (B.r0 + B.r1) / 2, B.f1 - B.f0 + out * 2, h, B.r1 - B.r0 + out * 2, 0.3);
      // quạt mái: vỏ trụ + miệng tối + 3 cánh
      const roofFan = (f, y, r, R) => {
        K.cyl('steelGray', f, y, r, R, R, 4, 16); K.add('void', new THREE.CircleGeometry(R - 0.6, 16), M4(f, y + 4.05, r, -Math.PI / 2, 0, 0));
        for (const a of [0, 1.05, 2.1]) K.box('steelDark', f, y + 3.4, r, R * 1.8, 0.4, 1, a, 0);
      };

      // ===================================================================================================
      // 1. NHÀ TOKAMAK — KỲ QUAN CỦA KHU: lò nhiệt hạch cỡ lớn chiếm gần hết lòng nhà. Lò đã dừng từ lâu, nhà trúng đạn:
      //    nửa trước-phải sập từ mái xuống, tường vỡ lởm chởm thò lưới thép, mái gãy treo chéo. Lộ ra: thùng lạnh (cryostat)
      //    thép cao ~25 m rách một mảng lớn -> bên trong là tấm chắn nhiệt bọc giấy bạc cách nhiệt vàng, 18 cuộn từ trường
      //    chữ D, 6 vòng cuộn cực ngang, cột cuộn đồng trung tâm, buồng chân không hình xuyến thủng (lòng tối, vách cháy sém),
      //    cổng ống ngang / ống khói đứng, bộ phun chùm hạt; vài cuộn D bật giá đổ ra nền, gạch đá đổ nát khắp nơi
      // ===================================================================================================
      {
        const B = TK, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, WT = 12;
        const FR = -70, SF = -170;                                            // tường trước vỡ khi r > FR; tường hông vỡ khi f > SF
        const cf = -132, cr = -20, y0 = 4;                                    // tâm lò
        K.cbox('concDark', fc, 4, rc, W + 10, 8, D + 10, 1);                  // móng bè nhô
        K.cbox('concDark', fc, 9, rc, W - 2 * WT, 2, D - 2 * WT, 0.3);        // sàn nhà lò
        // -------- VỎ NHÀ (rỗng): tường che chắn kiểu tấm đúc sẵn ghép lưới, chân vát 2 cấp, gân thép tối, dải ốp kim loại đỉnh
        const wallPiece = (f0, f1, r0, r1, out) => {
          const P = { f0, f1, r0, r1 }, pf = (f0 + f1) / 2, pr = (r0 + r1) / 2, pw = f1 - f0, pd = r1 - r0, F = faces(P);
          K.cbox('conc', pf, 8 + (B.H - 8) / 2, pr, pw, B.H - 8, pd, 1);
          K.cbox(M.hatch, pf, B.H - 22, pr, pw + 2.4, 44, pd + 2.4, 0.4);
          K.cbox('steelDark', pf, B.H - 43, pr, pw + 5, 1.6, pd + 5, 0.3);
          for (const k of out) {
            const { m: b, len } = F[k];
            K.add('concDark', new THREE.BoxGeometry(len + 8, 12, 4), mul(b, M4(0, 14, 2)));
            K.add('concDark', new THREE.BoxGeometry(len + 4, 12, 2), mul(b, M4(0, 26, 1)));
            for (let y = 52; y < B.H - 44; y += 30) K.add('void', new THREE.BoxGeometry(len - 2, 0.8, 0.4), mul(b, M4(0, y, 0.1)));
            for (let x = -len / 2 + 20; x < len / 2 - 2; x += 20) K.add('void', new THREE.BoxGeometry(0.8, B.H - 76, 0.4), mul(b, M4(x, 32 + (B.H - 76) / 2, 0.1)));
            for (let x = -len / 2 + 40; x < len / 2 - 2; x += 40) K.add('steelDark', new THREE.BoxGeometry(3, B.H - 54, 4), mul(b, M4(x, 32 + (B.H - 54) / 2, 2)));
            for (let x = -len / 2 + 6; x < len / 2; x += 12) K.add('steelDark', new THREE.BoxGeometry(1.2, 42, 1.2), mul(b, M4(x, B.H - 22, 1.8)));
          }
          K.solid(pf, pr, pw / 2 + 1, pd / 2 + 1, 0, B.H + 8);
        };
        wallPiece(B.f0, B.f0 + WT, B.r0, B.r1, ['back']);                       // tường sau
        wallPiece(B.f0 + WT, B.f1, B.r0, B.r0 + WT, ['sideN']);                 // tường hông trái
        wallPiece(B.f1 - WT, B.f1, B.r0 + WT, FR, ['front']);                   // đoạn tường trước còn nguyên
        wallPiece(B.f0 + WT, SF, B.r1 - WT, B.r1, ['sideP']);                   // đoạn tường hông phải còn nguyên
        // mái còn lại: dải sau (f < SF) + dải trái (r < FR), dầm mái thép lộ ở mép gãy; tấm mái gãy treo chéo vào lòng nhà
        // mái gần như bay hết: chỉ còn dải hẹp sát tường sau (f < RF) và tường trái (r < RR), mép gãy thò dầm thép cong
        const RF = -212, RR = -128;
        K.cbox('conc', (B.f0 + RF) / 2, B.H - 3, rc, RF - B.f0, 8, D, 0.6);
        K.cbox('conc', (RF + B.f1) / 2, B.H - 3, (B.r0 + RR) / 2, B.f1 - RF, 8, RR - B.r0, 0.6);
        for (let r = RR + 6; r < B.r1 - 8; r += 22) K.box('steelRust', RF + 8 + H(r) * 14, B.H - 10, r, 18 + H(r + 1) * 22, 3, 2, 0, 24, 0, -0.2 - H(r + 2) * 0.5);
        for (let f = RF + 12; f < B.f1 - 10; f += 22) K.box('steelRust', f, B.H - 10, RR + 8 + H(f) * 12, 2, 3, 16 + H(f + 1) * 20, 0, 24, 0.25 + H(f + 2) * 0.4, 0);
        K.box('conc', RF + 14, 196, 60, 40, 7, 60, 0.2, 0, 0, -1.05);           // tấm mái gãy treo chéo
        K.add(M.soot, new THREE.PlaneGeometry(150, 180), M4(B.f0 + WT + 0.6, 120, 0, 0, Math.PI / 2, 0));
        K.add(M.soot, new THREE.PlaneGeometry(160, 180), M4(-110, 120, B.r0 + WT + 0.6, 0, 0, 0));
        // -------- TƯỜNG VỠ quanh vùng thủng: còn trơ từng đoạn cao thấp, cao dần về chỗ giáp đoạn nguyên --------
        const jag = (t, seed) => Math.max(10, 80 * Math.pow(1 - t, 1.4) * (0.7 + H(seed) * 0.5) + 8 - H(seed + 3) * 12);
        // 1 đoạn tường vỡ: thân dưới nguyên, phía trên gãy thành 3 khối cao thấp, mép trên sứt vát; lưới cốt thép 2 lớp lộ ra
        // (thanh đứng thò lên, vài thanh bị sức ép bẻ cong gập), thanh ngang cụt; mặt ngoài bong tróc lớp bê tông bảo vệ,
        // vết nứt toả xuống từ mép vỡ
        const brokenWall = (A, Bp, n, seed, alongR) => {
          const seg = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) / n;
          // trục dọc tường u -> (f, r); trục ngang tường (pháp tuyến) v
          const at = (f, r, u, v) => alongR ? [f + v, r + u] : [f + u, r + v];
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n, f = A[0] + (Bp[0] - A[0]) * t, r = A[1] + (Bp[1] - A[1]) * t, h = jag(t, seed + i * 3), h0 = h * (0.55 + H(seed + i) * 0.2);
            const bx = (u, y0b, y1, w, m, tilt) => { const [pf, pr] = at(f, r, u, 0); K.box(m || 'conc', pf, (y0b + y1) / 2, pr, alongR ? WT : w, y1 - y0b, alongR ? w : WT, 0, undefined, alongR ? 0 : (tilt || 0), alongR ? (tilt || 0) : 0); };
            bx(0, 0, h0, seg + 0.4);
            for (let k = 0; k < 3; k++) {
              const w = seg / 3, u = -seg / 2 + w * (k + 0.5), hk = h0 + (h - h0) * H(seed + i * 5 + k), tl = (H(seed + i * 9 + k) - 0.5) * 0.12;
              if (hk - h0 > 2) bx(u, h0 - 0.5, hk, w + 0.3, 'conc', tl);
              const [pf, pr] = at(f, r, u + (H(k + i) - 0.5) * w * 0.5, (H(k + i + 3) - 0.5) * 3);
              K.add(H(k + i * 2) < 0.5 ? 'conc' : 'concDark', new THREE.DodecahedronGeometry(2 + H(seed + k + i) * 2.4, 0), M4(pf, hk + 0.6, pr, H(i + k) * 3, H(i + k + 1) * 3, 0, 1.5, 0.7, 1.2));
              const [sf, sr] = at(f, r, u, (WT / 2 + 0.25) * (H(k + i * 3) < 0.5 ? 1 : -1));
              K.box('concDark', sf, hk - 4 - H(k + i) * 6, sr, alongR ? 0.5 : w * 0.7, 6 + H(k + i + 7) * 6, alongR ? w * 0.7 : 0.5);
            }
            for (const v of [-3.6, 3.6]) for (let u = -seg / 2 + 1.2; u < seg / 2; u += 2.4) {
              const k = Math.round(u * 7 + v * 3 + i * 13 + seed), top = h0 + (h - h0) * H(k) + 1, L1 = 3 + H(k + 1) * 9;
              const [pf, pr] = at(f, r, u, v);
              if (H(k + 2) < 0.25) { const [qf, qr] = at(f, r, u + (H(k + 3) - 0.5) * 8, v + (v > 0 ? 1 : -1) * (4 + H(k + 4) * 5)); K.beam('steelRust', [pf, top - 1, pr], [pf, top + L1 * 0.5, pr], 0.35); K.beam('steelRust', [pf, top + L1 * 0.5, pr], [qf, top + L1 * 0.4 - H(k + 5) * 6, qr], 0.35); }
              else if (H(k + 2) < 0.8) K.beam('steelRust', [pf, top - 1, pr], [pf + (H(k + 6) - 0.5) * 1.5, top + L1, pr + (H(k + 7) - 0.5) * 1.5], 0.35);
            }
            for (let y = h0 + 2; y < h0 + 8; y += 3) for (const v of [-3.6, 3.6]) { const [p0f, p0r] = at(f, r, -seg / 2, v), [p1f, p1r] = at(f, r, -seg / 2 + seg * (0.3 + H(y + i) * 0.4), v); K.beam('steelRust', [p0f, y, p0r], [p1f, y, p1r], 0.3); }
            for (let k = 0; k < 2; k++) { const u = (H(seed + i * 4 + k) - 0.5) * seg * 0.8, [cf2, cr2] = at(f, r, u, (alongR ? 1 : 1) * (WT / 2 + 0.3)); K.box('void', cf2, h0 - 10, cr2, alongR ? 0.2 : 0.5, 18, alongR ? 0.5 : 0.2, 0, undefined, alongR ? 0 : 0.35 * (k ? 1 : -1), alongR ? 0.35 * (k ? 1 : -1) : 0); }
            K.solid(f, r, alongR ? WT / 2 : seg / 2, alongR ? seg / 2 : WT / 2, 0, h);
          }
        };
        brokenWall([B.f1 - WT / 2, B.r1], [B.f1 - WT / 2, FR], 12, 210, true);    // tường trước: thấp ở góc, cao dần về đoạn nguyên
        brokenWall([B.f1, B.r1 - WT / 2], [SF, B.r1 - WT / 2], 9, 330, false);     // tường hông phải
        // -------- LÒ: bệ, thùng lạnh --------
        const CR = 90, CH = 200, gap = 2.6, gc = Math.atan2(0.77, 0.64);       // CylinderGeometry: θ -> hướng (sin θ, cos θ) theo (f, r)
        const gdir = [Math.sin(gc), Math.cos(gc)], gA = Math.atan2(gdir[1], gdir[0]);   // hướng mảng rách (ra phía vùng vỡ)
        const daOf = (a) => Math.atan2(Math.sin(a - gA), Math.cos(a - gA));
        const P = (a, R, y) => [cf + Math.cos(a) * R, y, cr + Math.sin(a) * R];
        const cyArc = (R, y, h, m, cut, inner) => {                            // vỏ trụ thiếu 1 cung `cut` quanh hướng rách
          const st = gc + cut / 2, L = TAU - cut;
          K.add(m, new THREE.CylinderGeometry(R, R, h, 64, 1, true, st, L), M4(cf, y + h / 2, cr));
          if (inner) K.add(inner, new THREE.CylinderGeometry(R - 1, R - 1, h, 64, 1, true, -st - L, L).scale(-1, 1, 1), M4(cf, y + h / 2, cr));
        };
        const ring = (R, t, y, m, cut, seg) => K.add(m, new THREE.TorusGeometry(R, t, seg || 6, 64, TAU - cut), M4(cf, y, cr, Math.PI / 2, 0, gA + cut / 2));   // vòng nằm ngang thiếu cung `cut`
        K.cyl('concDark', cf, 9, cr, CR + 6, CR + 8, 6, 48);
        cyArc(CR, y0 + 11, CH, M.ss, gap, 'steelDark');
        // gân đứng + vành tăng cứng ngang của thùng lạnh, mặt bích nắp; mép rách: tấm vỏ bẻ quăn lật ra ngoài
        for (let k = 0; k < 48; k++) { const a = k * TAU / 48; if (Math.abs(daOf(a)) < gap / 2 + 0.02) continue; K.box(M.ss, ...P(a, CR + 1.2, y0 + 11 + CH / 2), 2.4, CH, 2, -a, 0); }
        for (const y of [40, 80, 120, 160, 200]) ring(CR + 1.5, 1.6, y0 + 11 + y, 'steelGray', gap + 0.05, 4);
        for (let k = 0; k < 12; k++) {
          const s2 = k % 2 ? 1 : -1, a = gA + s2 * (gap / 2 - 0.05), y = y0 + 20 + Math.floor(k / 2) * 30 + H(k) * 10;
          K.box(M.ss, ...P(a + s2 * 0.05, CR + 6, y), 2, 16 + H(k + 3) * 10, 22, -a - s2 * (0.9 + H(k + 4) * 0.6), 0, (H(k + 5) - 0.5) * 0.5, (H(k + 6) - 0.5) * 0.4);
        }
        // nắp vòm thùng lạnh: còn 1/3 nửa sau, mép gãy; phần còn lại rơi xuống (mảnh lớn nằm nghiêng trong lòng nhà)
        // (nắp vòm bị hất bay hết; chỉ còn vành mặt bích đỉnh)
        K.add(M.ss, new THREE.SphereGeometry(CR, 24, 6, 0, 1.4, 0, 0.5), M4(cf + gdir[0] * 30, -40, cr + gdir[1] * 30 + 10, 0.9, 0.4, 0.3));
        // -------- HỆ NAM CHÂM SIÊU DẪN (kiểu ITER) --------
        // 18 cuộn từ trường xuyến chữ D: vỏ thép không gỉ tiết diện chữ nhật rất dày; chân trong ép sát nhau thành một khối
        // vòm liền quanh cột trung tâm, lưng ngoài nối nhau bằng tấm giằng cắt; 6 cuộn cực ngang tiết diện chữ nhật dày kẹp
        // vào lưng cuộn D; cột cuộn trung tâm 6 mô-đun + khung ép dọc. Chỗ trúng đạn: lưng 3 cuộn D bị xé mất, chân trong còn
        // trơ lại -> lộ mặt cắt bó dây siêu dẫn (lõi đồng / sợi Nb3Sn, lớp cách điện tối) trong vỏ thép
        const vy = y0 + 110, VR = 48, VT = 20;
        const TRi = 14, TRo = 82, TH = 74, TT = 11;                            // cuộn D: bán kính chân trong / lưng ngoài, nửa cao, bề dày vỏ
        const dPath = (ri, ro, h, n) => {                                     // đường bao chữ D trong mặt phẳng (x bán kính, y cao)
          const pts = [new THREE.Vector2(ri, -h), new THREE.Vector2(ri, h)];
          for (let i = 1; i < n; i++) { const t = Math.PI / 2 - i * Math.PI / n, c = Math.cos(t); pts.push(new THREE.Vector2(ri + (ro - ri) * c * (0.55 + 0.45 * c), h * Math.sin(t) * (1 + 0.12 * c))); }
          return pts;
        };
        const TW = 2 * Math.PI * TRi / 18 - 0.3;                                // bề rộng xuyến của cuộn = đúng khít ở chân trong
        const dShape = new THREE.Shape(dPath(TRi, TRo, TH, 28));
        dShape.holes.push(new THREE.Path(dPath(TRi + TT, TRo - TT, TH - TT, 28).reverse()));
        const tfGeo = new THREE.ExtrudeGeometry(dShape, { depth: TW, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 1, curveSegments: 28 }); tfGeo.translate(0, 0, -TW / 2);
        const packM = M.cu, insM = 'steelDark';
        // khung giằng lưng ngoài giữa 2 cuộn kề nhau (tấm cắt) + kẹp đỡ cuộn cực ngang
        const ocs = [[0.62, 0.62], [0.62, -0.62], [0.92, 0.2], [0.92, -0.2]];
        let broken = 0;
        for (let k = 0; k < 18; k++) {
          const a = k * TAU / 18 + 0.17, da = daOf(a), base = M4(cf, vy, cr, 0, -a, 0);
          if (Math.abs(da) < 0.55) {
            // cuộn bị xé: còn chân trong + 2 mẩu vai gãy; mặt cắt lộ bó dây (đồng) bọc lớp cách điện tối trong vỏ thép
            const hTop = 20 + H(k + 31) * 40, hBot = -40 - H(k + 32) * 20;
            K.add(M.coil, new THREE.BoxGeometry(TT, hTop - hBot, TW), mul(base, M4(TRi + TT / 2, (hTop + hBot) / 2, 0)));
            for (const y of [hTop, hBot]) {
              const sgn = y > 0 ? 1 : -1;
              K.add(insM, new THREE.BoxGeometry(TT - 2.4, 0.6, TW - 2.4), mul(base, M4(TRi + TT / 2, y + sgn * 0.3, 0)));
              K.add(packM, new THREE.BoxGeometry(TT - 4.4, 0.8, TW - 4.4), mul(base, M4(TRi + TT / 2, y + sgn * 0.4, 0)));
              for (let j = 0; j < 4; j++) K.add('steelRust', new THREE.BoxGeometry(0.5, 3 + H(k + j) * 5, 0.5), mul(base, M4(TRi + 3 + j * 1.6, y + sgn * 2, (H(k + j + 9) - 0.5) * (TW - 3))));
            }
            if (broken++ === 1) {                                              // mảng lưng gãy đổ xuống nền
              K.add(M.coil, new THREE.BoxGeometry(TT, 60, TW), M4(cf + Math.cos(a) * (TRo + 6), 14, cr + Math.sin(a) * (TRo + 6), 1.35, -a, 0.3));
              K.add(packM, new THREE.BoxGeometry(TT - 4.4, 0.8, TW - 4.4), M4(cf + Math.cos(a) * (TRo + 6), 14, cr + Math.sin(a) * (TRo + 6) + 0.2, 1.35, -a, 0.3));
            }
            continue;
          }
          K.add(M.coil, tfGeo, base);
          // mối hàn nắp vỏ (gờ chạy dọc 2 mặt bên) + nhãn số cuộn dập nổi trên lưng
          for (const z of [-TW / 2 - 0.4, TW / 2 + 0.4]) K.add('steelDark', new THREE.BoxGeometry(1, TH * 1.6, 0.4), mul(base, M4(TRo - TT / 2, 0, z)));
          // giá đỡ trọng lực (chân đỡ dạng tấm uốn) dưới lưng cuộn
          K.add('steelDark', new THREE.BoxGeometry(10, vy - y0 - 14 - TH * 0.6, TW + 2), mul(base, M4(TRo - 26, -TH * 0.6 - (vy - y0 - 14 - TH * 0.6) / 2, 0)));
          // tấm giằng cắt sang cuộn kế bên (chỉ nối khi cuộn kế bên còn lưng)
          if (Math.abs(daOf(a + TAU / 18)) >= 0.55) for (const [u, v] of ocs) {
            const R = TRi + (TRo - TRi) * u * (0.55 + 0.45 * u) - TT / 2, y = TH * v * 1.05, aa = a + TAU / 36;
            K.add(M.hatch, new THREE.BoxGeometry(TT * 0.8, 9, 2 * Math.PI * R / 18 - TW + 1), M4(cf + Math.cos(aa) * R, vy + y, cr + Math.sin(aa) * R, 0, -aa, 0));
          }
        }
        // khối vòm chân trong liền (các chân cuộn ép sát): vành thép dày bao quanh cột trung tâm ở đỉnh / đáy chân thẳng
        for (const y of [vy + TH - 6, vy - TH + 6]) K.add(M.coil, new THREE.CylinderGeometry(TRi + TT, TRi + TT, 12, 36), M4(cf, y, cr));
        // cuộn cực ngang: vòng tiết diện chữ nhật dày (lathe), đứt ở mảng rách với 2 đầu cụt lộ bó dây đồng; kẹp vào lưng cuộn D
        const pf = (R, y, w, h, cut) => {
          const sh = [new THREE.Vector2(R - w / 2, -h / 2), new THREE.Vector2(R + w / 2, -h / 2), new THREE.Vector2(R + w / 2, h / 2), new THREE.Vector2(R - w / 2, h / 2), new THREE.Vector2(R - w / 2, -h / 2)];
          K.add(M.coil, new THREE.LatheGeometry(sh, 72, gc + cut / 2, TAU - cut), M4(cf, y, cr));
          if (cut > 0.01) for (const s2 of [-1, 1]) { const th = gc + s2 * cut / 2, df = Math.sin(th), dr = Math.cos(th);
            K.add(packM, new THREE.BoxGeometry(w - 1.6, h - 1.6, 0.6), M4(cf + df * R, y, cr + dr * R, 0, Math.atan2(df, dr) + Math.PI / 2, 0)); }
          for (let k = 0; k < 18; k++) { const a = k * TAU / 18 + 0.17; if (Math.abs(daOf(a)) < 0.55 || Math.abs(daOf(a)) < cut / 2 + 0.05) continue; K.box('steelDark', ...P(a, R, y - h / 2 - 1.6), w + 3, 3, TW + 2, -a, 0); }
        };
        pf(34, vy + TH + 8, 12, 9, 0); pf(34, vy - TH - 8, 12, 9, 0);
        pf(66, vy + TH * 0.86, 7, 8, gap * 0.7); pf(66, vy - TH * 0.86, 7, 8, gap * 0.7);
        pf(85, vy + 28, 5, 10, gap * 0.85); pf(85, vy - 28, 5, 10, gap * 0.85);
        // cột cuộn trung tâm: 6 mô-đun (bó dây quấn, vỏ thép mỏng), đệm cách điện tối, 9 khung ép dọc bản thép + đầu ép
        for (let k = 0; k < 6; k++) { K.cyl(M.cu, cf, vy - 72 + k * 24, cr, TRi - 1.5, TRi - 1.5, 21, 36); K.cyl(insM, cf, vy - 51 + k * 24, cr, TRi - 1.2, TRi - 1.2, 3, 36); }
        for (let k = 0; k < 9; k++) { const a = k * TAU / 9; K.box('steelGray', ...P(a, TRi - 1, vy), 1.2, 150, 3.4, -a, 0); }
        for (const y of [vy + 79, vy - 79]) { K.cyl('steelGray', cf, y, cr, TRi + 2, TRi + 2, 6, 36); for (let k = 0; k < 9; k++) { const a = k * TAU / 9 + 0.35; K.cyl('steelDark', ...P(a, TRi - 2, y + 6), 1.4, 1.4, 4, 8); } }
        // đường cấp (feeder): hộp chân không bọc giấy bạc vàng từ đỉnh vỏ xuống đầu cực từng cụm cuộn, thanh dẫn cụt
        for (let k = 0; k < 9; k++) { const a = gA + gap / 2 + 0.25 + k * (TAU - gap - 0.5) / 8;
          K.add(M.mli, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(...P(a, CR - 5, y0 + 11 + CH)), new THREE.Vector3(...P(a, CR - 8, vy + TH + 18)), new THREE.Vector3(...P(a, TRo - 4, vy + TH * 0.7))]), 12, 2.6, 8, false)); }
        // buồng chân không hình xuyến (tiết diện chữ D cao) thủng 1 mảng quay ra phía rách
        // (TorusGeometry nằm ngang sau khi xoay x 90°: góc φ -> hướng (cos φ, sin φ) theo (f, r))
        const vgap = 1.5;
        K.add(M.vv, new THREE.TorusGeometry(VR, VT, 24, 72, TAU - vgap), M4(cf, vy, cr, Math.PI / 2, 0, gA + vgap / 2, 1, 1, 1.7));
        K.add(M.soot, new THREE.TorusGeometry(VR, VT + 0.4, 12, 24, 1.6), M4(cf, vy, cr, Math.PI / 2, 0, gA - 0.8, 1, 1, 1.7));
        for (const s2 of [-1, 1]) {
          const ph = gA + s2 * vgap / 2, df = Math.cos(ph), dr = Math.sin(ph), ry = Math.atan2(df, dr) + Math.PI / 2;
          K.add('void', new THREE.CircleGeometry(VT - 1.5, 20), M4(cf + df * VR, vy, cr + dr * VR, 0, ry, 0, 1, 1.7, 1));
          K.add('steelDark', new THREE.RingGeometry(VT - 1.8, VT + 0.4, 20), M4(cf + df * VR, vy, cr + dr * VR, 0, ry, 0, 1, 1.7, 1));
          // tấm ốp vách trong (blanket) lộ ở mặt cắt: lưới ô vuông xám / đen cháy
          for (let j = 0; j < 7; j++) { const aa = j * TAU / 7; K.add(j % 2 ? 'steelGray' : M.soot, new THREE.BoxGeometry(1, 4.4, 4.4), M4(cf + df * VR + Math.cos(aa) * (VT - 4) * df * 0.2, vy + Math.sin(aa) * (VT - 4) * 1.7, cr + dr * VR + Math.cos(aa) * (VT - 4) * dr, 0, ry + Math.PI / 2, 0)); }
        }
        // hộp chuyển hướng (divertor) 54 hộp dưới đáy lòng xuyến + tấm ốp vành ngoài xuyến
        for (let k = 0; k < 54; k++) { const a = k * TAU / 54; if (Math.abs(daOf(a)) < 0.7) continue; K.box(k % 3 ? 'steelDark' : M.cu, ...P(a, VR, vy - VT * 1.7 + 1), 6, 5, 5, -a, 0); }
        for (let k = 0; k < 40; k++) { const a = k * TAU / 40; if (Math.abs(daOf(a)) < 0.8) continue; for (const dy of [-18, 0, 18]) K.box(k % 2 ? 'steelGray' : M.vv, ...P(a, VR + VT + 0.8, vy + dy), 1.4, 15, 7, -a, 0); }
        // 18 cổng ngang (gia nhiệt / chẩn đoán / ống bơm) xuyên qua thùng lạnh, mặt bích nhô ngoài vỏ; 9 ống khói đứng lên đỉnh
        for (let k = 0; k < 18; k++) {
          const a = k * TAU / 18 + 0.17 + TAU / 36, cut = Math.abs(daOf(a)) < gap / 2, R1 = cut ? VR + VT + 12 : CR;
          // ống cổng tròn (thép tối) từ vách xuyến ra vỏ, mặt bích + vòng bu-lông ở đầu; phía rách gãy cụt mép sứt
          for (const [y, rad] of [[vy, 6.5], [vy - 52, 4.5]]) {
            pipe('steelDark', P(a, VR + VT - 4, y), P(a, R1, y), rad, 14);
            K.add(M.hatch, new THREE.CylinderGeometry(rad + 1.6, rad + 1.6, 1.4, 16), M4(...P(a, R1 + 0.8, y), 0, -a, Math.PI / 2));
            if (!cut) K.add('steelDark', new THREE.CylinderGeometry(rad + 0.6, rad + 0.6, 1.2, 16), M4(...P(a, R1 + 2.4, y), 0, -a, Math.PI / 2));
          }
          if (!cut) K.box('steelDark', ...P(a, CR + 6, vy - 16), 4, 7, 7, -a, 0);
          // ống đứng lên đỉnh (cổng trên): mảnh, thấp hơn mép vỏ
          if (k % 2 === 0 && Math.abs(daOf(a)) > 0.5) { K.cyl('steelDark', ...P(a, VR + 6, vy + 30), 4, 4, CH - 140, 12); K.cyl('steelGray', ...P(a, VR + 6, vy + CH - 112), 6, 6, 2, 12); }
        }
        // vòng ống góp heli / nước làm mát dưới chân
        ring(CR - 8, 2.4, y0 + 18, M.mli, gap, 6); ring(CR - 14, 2, y0 + 24, 'steelGray', gap, 6);
        // bộ phun chùm hạt trung hoà (NBI) phía hông trái: thân hộp lớn, buồng ion, ống dẫn chùm nối cổng ngang
        { const a = -Math.PI / 2 + 0.25, A0 = P(a, CR, vy), A1 = P(a, CR + 24, vy);
          pipe(M.ss, A0, A1, 9, 16);
          K.cbox(M.ss, A1[0], vy, A1[2] - 8, 34, 54, 22, 1.2, -a - Math.PI / 2); K.cbox('steelDark', A1[0], vy + 30, A1[2] - 8, 26, 6, 18, 0.5, -a - Math.PI / 2);
          for (const d of [-10, 0, 10]) K.cyl('steelGray', A1[0] + d, vy + 33, A1[2] - 8, 3, 3, 10, 12);
          K.solid(A1[0], A1[2] - 8, 18, 12, 0, vy + 40); }
        // sàn thao tác thép quanh vỏ 3 tầng: mặt sàn lưới, lan can; gãy cụt ở mảng rách; thang đứng phía sau
        for (const y of [y0 + 60, y0 + 120, y0 + 180]) {
          const L2 = TAU - gap - 0.4, st = -(gA + gap / 2 + 0.2) - L2;
          K.add('steelGray', new THREE.RingGeometry(CR + 2, CR + 10, 64, 1, st, L2), M4(cf, y, cr, -Math.PI / 2, 0, 0));
          K.add('steelGray', new THREE.TorusGeometry(CR + 10, 0.4, 3, 64, L2), M4(cf, y + 5, cr, Math.PI / 2, 0, gA + gap / 2 + 0.2));
          for (let k = 0; k < 40; k++) { const a = gA + gap / 2 + 0.2 + k * L2 / 39; K.box('steelGray', ...P(a, CR + 10, y + 2.5), 0.5, 5, 0.5, 0, 0); }
        }
        { const a = gA + Math.PI; for (let y = 12; y < y0 + CH + 10; y += 2.4) K.box('steelGray', ...P(a, CR + 3, y), 0.3, 0.3, 3, -a, 0); }
        // dầm cầu trục nhà lò rơi xuống, nằm chéo trên nền cạnh thùng lạnh
        K.box('yellow', -130, 8, 94, 150, 9, 12, 0.08, 24, 0, 0.05);
        K.solid(cf, cr, CR + 4, CR + 4, 0, y0 + CH + 16);
        // -------- GẠCH ĐÁ ĐỔ NÁT --------
        // ụ đá dăm / bột bê tông làm nền đống đổ (mặt sườn thoải), trên đó: tấm sàn vỡ lớn có cốt thép, cục vừa, vụn nhỏ
        const mound = (f, r, R, hgt, rot) => K.add(M.rubble, new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, Math.PI / 2), M4(f, Math.max(0, K.earth(f, r)) - 0.5, r, 0, rot || 0, 0, R, hgt, R * 0.7));
        const chunk = (f, r, s, k, yb) => {
          const y = (yb === undefined ? Math.max(0, K.earth(f, r)) : yb) + s * 0.3, q = H(k + 11);
          if (q < 0.18 && s > 3) {                                    // tấm bê tông phẳng gãy, cạnh lộ cốt thép
            const w = s * 3, d = s * 2;
            K.box(H(k + 7) < 0.6 ? 'conc' : 'concDark', f, y + 1, r, w, 2.4, d, H(k) * 3, undefined, (H(k + 1) - 0.5) * 0.8, (H(k + 2) - 0.5) * 0.8);
            for (let j = 0; j < 4; j++) K.beam('steelRust', [f + (j - 1.5) * w / 4, y + 1.4, r + d / 2 - 1], [f + (j - 1.5) * w / 4 + (H(k + j) - 0.5) * 3, y + 2 + H(k + j + 4) * 3, r + d / 2 + 3 + H(k + j + 2) * 4], 0.3);
          } else {
            const G2 = q < 0.6 ? new THREE.DodecahedronGeometry(s, 0) : new THREE.IcosahedronGeometry(s, 0);
            K.add(H(k + 7) < 0.7 ? 'conc' : 'concDark', G2, M4(f, y, r, H(k) * 3, H(k + 1) * 6, H(k + 2) * 3, 1 + H(k + 3) * 0.7, 0.4 + H(k + 4) * 0.4, 0.8 + H(k + 5) * 0.6));
            if (s > 4 && H(k + 6) < 0.4) K.beam('steelRust', [f, y + s * 0.2, r], [f + (H(k + 8) - 0.5) * 14, y + 3 + H(k + 9) * 7, r + (H(k + 10) - 0.5) * 14], 0.35);
          }
        };
        let n = 0;
        const pile = (f0, f1, r0, r1, cnt, s0, s1, yb) => {
          for (let i = 0; i < cnt; i++, n++) chunk(f0 + H(n * 3 + 500) * (f1 - f0), r0 + H(n * 3 + 501) * (r1 - r0), s0 + H(n * 3 + 502) * (s1 - s0), n * 11 + 600, yb);
          for (let i = 0; i < cnt * 2; i++, n++) { const f = f0 + H(n * 3 + 500) * (f1 - f0), r = r0 + H(n * 3 + 501) * (r1 - r0), sz = 0.5 + H(n + 77) * 0.9; K.add(H(n) < 0.5 ? 'conc' : 'concDark', new THREE.TetrahedronGeometry(sz, 0), M4(f, Math.max(0, K.earth(f, r)) + sz * 0.3, r, H(n) * 3, H(n + 1) * 3, 0)); }
        };
        for (let k = 0; k < 8; k++) mound(B.f1 + 2 - H(k + 60) * 8, FR + 12 + k * 24, 15 + H(k + 61) * 6, 6 + H(k + 62) * 6, H(k) * 2);
        for (let k = 0; k < 5; k++) mound(SF + 20 + k * 30, B.r1 - 10, 16, 7 + H(k + 70) * 6, H(k + 1) * 2);
        mound(-36, 60, 24, 16, 0.4); mound(-60, 104, 18, 10, 1.2);
        pile(B.f1 - 4, B.f1 + 16, FR + 4, B.r1 - 2, 80, 1.5, 6);       // tràn qua tường trước ra mép đường
        pile(SF + 4, B.f1 - 14, B.r1 - 22, B.r1 - 12, 40, 2, 7);        // chân tường hông trong nhà
        pile(-110, -44, 74, 104, 40, 2, 9);                             // nền nhà giữa thùng lạnh và tường hông
        pile(SF + 4, B.f1 - 4, B.r1 + 1, AH.r0 - 1, 24, 1, 4);          // khe giữa nhà lò và nhà lắp ráp
        for (const [f, r, a] of [[-16, 30, 0.3], [-18, 96, -0.5], [-60, 110, 1.2], [-18, -46, 0.7]]) { K.cbox('conc', f, 8, r, 24, 14, 13, 0.8, a); K.solid(f, r, 12, 7, 0, 15, a); }
        for (const [f, r, a] of [[-22, 66, 0.8], [-40, 112, -0.3], [-150, 100, 1.9]]) K.box(M.ss, f, 6, r, 28, 1, 18, a, 0, 0.4, 0.2);
        // -------- PHẦN CÒN LẠI CỦA NHÀ LÒ: thiết bị mái, ống gió sang ống khói, khóa khí, cửa thiết bị, biển --------
        for (const [hf, hr] of [[-226, -60], [-226, 40], [-170, -145], [-80, -145]]) { K.cbox('steelWhite', hf, B.H + 12, hr, 22, 18, 26, 0.5); for (const s of [-1, 1]) K.box('louver', hf + s * 11.4, B.H + 12, hr, 0.6, 12, 20); roofFan(hf, B.H + 21, hr, 6); }
        const dy = B.H + 16;
        pipe(M.ss, [-100, dy, -136], [-100, dy, -168], 7, 16);
        K.add(M.ss, new THREE.SphereGeometry(7, 14, 10), M4(-100, dy, -136));
        pipe(M.ss, [-100, dy, -168], [STK.f, dy, STK.r + 12], 7, 16);
        pipe(M.ss, [-100, dy, -136], [-94, dy - 44, -112], 7, 16);                  // ống gió đứt, chúc xuống miệng thủng
        for (const [pf, pr] of [[-92, -190], [-74, -224]]) { K.box('steelGray', pf, dy / 2, pr, 3, dy, 3, 0, 24); K.solid(pf, pr, 2, 2, 0, dy); }
        K.cbox('conc', B.f1 + 7, 18, -142, 14, 36, 26, 0.8);
        K.cbox('concDark', B.f1 + 7, 37, -142, 16, 2, 28, 0.3);
        K.box(M.hatch, B.f1 + 14.2, 11, -142, 0.6, 20, 10); K.box('hazard', B.f1 + 14.4, 11, -142, 0.3, 21.6, 11.6, 0, 16);
        K.add('lampRed', new THREE.SphereGeometry(0.9, 8, 6), M4(B.f1 + 14.6, 24, -136));
        K.solid(B.f1 + 7, -142, 7, 13, 0, 38);
        K.box(M.hatch, B.f1 + 1.6, 40, -100, 3, 80, 40); K.box('void', B.f1 + 0.3, 40, -78, 0.4, 78, 6);   // cửa thiết bị bị sức ép đẩy lệch, hé khe
        for (let y = 8; y < 80; y += 12) K.box('steelDark', B.f1 + 3.4, y, -100, 1, 1.2, 40);
        for (const r of [-122, -78]) K.box('hazard', B.f1 + 0.8, 43, r, 1.4, 86, 4, 0, 16);
        K.plane(radM, B.f1 + 0.8, 18, -124, 12, 6);
        K.add(tre, new THREE.CircleGeometry(14, 28), M4(B.f1 + 0.5, 130, -115, 0, Math.PI / 2, 0));
        K.plane(decal('fu_tk', signTex('fu_tk', ['TOKAMAK BUILDING — TK-1', 'REACTOR CONTROLLED AREA'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#a3221a' })), B.f1 + 1.8, 178, -115, 72, 13.5);
        for (let y = 6; y < B.H; y += 2.4) K.box('steelGray', B.f1 - 6, y, B.r0 - 1.6, 3, 0.3, 0.3, 0, 24);
        for (let y = 10; y < B.H; y += 7) K.add('steelGray', new THREE.TorusGeometry(2.2, 0.15, 3, 10, Math.PI), M4(B.f1 - 6, y, B.r0 - 2.4, Math.PI / 2, 0, 0));
      }

      // ===================================================================================================
      // 2. NHÀ LẮP RÁP — vách tôn cao trên chân bê tông, cửa nâng cỡ lớn, dải kính cửa mái
      // ===================================================================================================
      {
        const B = AH, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('conc', fc, 14, rc, W + 2, 28, D + 2, 0.8);
        K.box('corrGray', fc, 28 + (B.H - 28) / 2, rc, W, B.H - 28, D);
        pilasters(F, 28, B.H, 32, 2.4, 'steelGray');
        for (const k of Object.keys(F)) K.add('glass', new THREE.PlaneGeometry(F[k].len - 16, 14), mul(F[k].m, M4(0, B.H - 22, 0.3)));
        for (const k of Object.keys(F)) K.add('steelDark', new THREE.BoxGeometry(F[k].len - 14, 1, 1), mul(F[k].m, M4(0, B.H - 30, 0.6)));
        band(B, B.H + 2, 4, 0.8, 'steelGray');
        // cửa nâng: khung thép + lá cửa tôn ngang, mép dưới nâng hé 1 đoạn
        const fr = F.front.m;
        K.add('steelDark', new THREE.BoxGeometry(98, 6, 4), mul(fr, M4(-6, 214, 2)));
        for (const s of [-1, 1]) K.add('steelDark', new THREE.BoxGeometry(5, 214, 4), mul(fr, M4(-6 + s * 49, 107, 2)));
        K.add('shutter', new THREE.BoxGeometry(92, 186, 1.2), mul(fr, M4(-6, 118, 1)));
        K.add('void', new THREE.PlaneGeometry(92, 24), mul(fr, M4(-6, 12, 0.2)));
        // dầm cầu trục nhô ra ngoài cửa trên 2 cột
        K.box('yellow', B.f1 + 26, 232, rc - 6, 56, 8, 6, 0, 24);
        for (const s of [-1, 1]) { K.box('steelGray', B.f1 + 50, 116, rc - 6 + s * 52, 4, 232, 4, 0, 24); K.solid(B.f1 + 50, rc - 6 + s * 52, 2.5, 2.5, 0, 232); }
        K.box('yellow', B.f1 + 50, 232, rc - 6, 6, 8, 108, 0, 24);
        K.plane(decal('fu_ah', signTex('fu_ah', ['ASSEMBLY HALL', 'OVERHEAD CRANE — 1500 t'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), B.f1 + 0.8, 250, rc - 6, 80, 15);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + 6);
      }

      // ===================================================================================================
      // 3. NHÀ TRITI / BUỒNG NÓNG + ỐNG KHÓI THẢI TRITI
      // ===================================================================================================
      {
        const B = HC, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('concDark', fc, 3, rc, W + 6, 6, D + 6, 0.8);
        K.cbox('conc', fc, 6 + (B.H - 6) / 2, rc, W, B.H - 6, D, 1);
        pilasters(F, 6, B.H, 30, 2.6);
        for (const y of [56, 112]) band(B, y, 1.2, 0.6);
        band(B, B.H + 2, 4, 1.2, 'conc');
        for (const [hf, hr] of [[-200, -290], [-200, -220], [-140, -250]]) { K.cbox('steelWhite', hf, B.H + 10, hr, 26, 14, 30, 0.4); roofFan(hf, B.H + 17, hr, 7); }
        const fr = F.front.m;
        K.add(M.hatch, new THREE.BoxGeometry(12, 22, 1), mul(fr, M4(-40, 11, 0.6))); K.add('hazard', new THREE.BoxGeometry(14, 1.4, 1.2), mul(fr, M4(-40, 23, 0.6)));
        K.add(M.hatch, new THREE.BoxGeometry(40, 50, 1.6), mul(fr, M4(30, 25, 0.8)));
        K.plane(triM, B.f1 + 0.8, 34, rc - 40, 16, 8);
        K.plane(decal('fu_hc', signTex('fu_hc', ['TRITIUM PLANT & HOT CELL', 'RADIOLOGICAL ZONE 3'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#a3221a' })), B.f1 + 0.8, 130, rc, 70, 13);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + 18);
        // ống khói thép không gỉ: bệ, chân loe, 2 sàn, đèn báo bay, giằng 3 chân dây néo
        stack(K, STK.f, STK.r, 10, 8, 430, M.ss);
        K.cbox('concDark', STK.f, 6, STK.r, 34, 12, 34, 0.8);
        for (const a of [0.4, 2.5, 4.6]) { const tf = STK.f + Math.cos(a) * 46, tr = STK.r + Math.sin(a) * 46; K.beam('steelGray', [STK.f, 300, STK.r], [tf, 2, tr], 0.35); K.cbox('concDark', tf, 1.5, tr, 5, 3, 5, 0.4); }
        K.plane(triM, STK.f + 17.2, 8, STK.r, 12, 6);
      }

      // ===================================================================================================
      // 4. NHÀ MÁY LẠNH SÂU — xưởng + bồn heli khí + bồn nitơ lỏng
      // ===================================================================================================
      {
        const B = CP, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B), Hh = 110;
        K.cbox('conc', fc, 8, rc, W + 2, 16, D + 2, 0.6);
        K.box('corrGray', fc, 16 + (Hh - 16) / 2, rc, W, Hh - 16, D);
        pilasters(F, 16, Hh, 24, 2, 'steelGray');
        band(B, Hh + 1.5, 3, 0.6, 'steelGray');
        for (const k of ['front', 'sideP']) for (let x = -F[k].len / 2 + 16; x < F[k].len / 2 - 10; x += 26) K.add('louver', new THREE.BoxGeometry(12, 10, 0.6), mul(F[k].m, M4(x, 70, 0.4)));
        for (let k = 0; k < 4; k++) roofFan(B.f0 + 24 + k * 32, Hh + 3, rc, 8);
        K.add('shutter', new THREE.BoxGeometry(30, 34, 1), mul(F.front.m, M4(-20, 17, 0.6)));
        K.plane(decal('fu_cp', signTex('fu_cp', ['CRYOPLANT — LIQUID HELIUM 4.5 K', 'DANGER — ASPHYXIATION HAZARD'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), B.f1 + 0.8, 88, rc + 10, 60, 11);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, Hh + 8);
        // bồn heli khí (nằm ngang trên yên đỡ) dọc đường nội bộ
        for (let k = 0; k < 3; k++) {
          const r = -444 + k * 30, f = -60;
          if (k === 1) {   // bồn trúng tên lửa: vỏ xé đôi, 2 nửa bật lệch, cháy sém
            for (const s of [-1, 1]) K.add(M.soot2, new THREE.CylinderGeometry(10, 10, 26, 18, 1, true, 0, TAU * 0.75), M4(f + s * 18, 12 + (s > 0 ? 4 : 0), r + s * 3, Math.PI / 2 + s * 0.2, 0, Math.PI / 2 + s * 0.35));
            K.add(M.soot, new THREE.CircleGeometry(26, 18), M4(f, 1.2, r, -Math.PI / 2, 0, 0));
            K.solid(f, r, 34, 10, 0, 24); continue;
          }
          K.add('steelWhite', new THREE.CylinderGeometry(10, 10, 60, 18), M4(f, 16, r, Math.PI / 2, 0, Math.PI / 2));
          for (const s of [-1, 1]) { K.add('steelWhite', new THREE.SphereGeometry(10, 16, 10), M4(f + s * 30, 16, r, 0, 0, 0, 0.35, 1, 1)); K.cbox('concDark', f + s * 20, 3, r, 4, 6, 16, 0.4); }
          K.solid(f, r, 34, 10, 0, 27);
        }
        // bồn nitơ lỏng đứng (vỏ chân không 2 lớp) + giàn hóa hơi bằng không khí
        vTank(K, -82, -326, 10, 96, 0);
        K.plane(decal('fu_ln2', signTex('fu_ln2', ['LIQUID NITROGEN', '-196 °C'], { w: 512, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), -71.6, 30, -326, 12, 4.5);
        K.solid(-82, -326, 12, 12, 0, 104);
        for (let k = 0; k < 6; k++) { K.box(M.alu, -50, 22, -330 + k * 4, 2.4, 40, 2.4, 0, 0); for (let y = 6; y < 40; y += 6) K.box(M.alu, -50, y, -330 + k * 4, 5, 0.4, 0.4, 0, 0); }
        K.solid(-50, -320, 4, 14, 0, 42);
        pipe('steelGray', [-60, 6, -430], [-60, 6, -340], 1.2); pipe('steelGray', [-60, 6, -340], [-82, 6, -326], 1.2);
      }

      // ===================================================================================================
      // 5. NHÀ BIẾN ĐỔI ĐIỆN CẤP NAM CHÂM + thanh dẫn kín vắt qua đường sang nhà lò
      // ===================================================================================================
      {
        const B = PC, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('conc', fc, B.H / 2, rc, W, B.H, D, 1);
        pilasters(F, 0, B.H, 26, 2.2);
        band(B, B.H + 2, 4, 1, 'conc');
        for (const k of ['front', 'back']) for (let x = -F[k].len / 2 + 14; x < F[k].len / 2 - 8; x += 26) K.add('louver', new THREE.BoxGeometry(14, 22, 0.6), mul(F[k].m, M4(x, 40, 0.4)));
        for (let k = 0; k < 8; k++) roofFan(fc + (k % 2 ? 22 : -22), B.H + 4, B.r0 + 22 + Math.floor(k / 2) * 60, 7);
        K.add('shutter', new THREE.BoxGeometry(24, 30, 1), mul(F.front.m, M4(60, 15, 0.6)));
        label('pc', ['MAGNET POWER CONVERSION', 'SUPERCONDUCTING COILS — 68 kA DC'], B.f1 + 0.8, 66, rc - 30, 80, 15, Math.PI / 2, { fg: '#a3221a' });
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + 10);
        // 2 tuyến thanh dẫn kín (ống nhôm bọc) trên giàn khung vắt qua đường nội bộ, chui vào tường nhà lò
        const by = 60;
        for (const r of [-100, -128]) {
          for (const o of [-3, 3]) pipe(M.alu, [B.f0, by + o, r], [TK.f1, by + o, r], 2.2, 10);
          K.box('steelGray', B.f0 + 0.5, by, r, 1, 14, 10, 0, 24); K.box('steelGray', TK.f1 + 0.5, by, r, 1, 14, 10, 0, 24);
        }
        for (const s of [-1, 1]) { K.box('steelGray', RING, (by - 6) / 2, -114 + s * 24, 3, by - 6, 3, 0, 24); K.solid(RING, -114 + s * 24, 2, 2, 0, by); }
        K.box('steelGray', RING, by - 7, -114, 4, 2, 52, 0, 24);
      }

      // ===================================================================================================
      // 6. NHÀ TUA-BIN + 2 MÁY BIẾN ÁP TĂNG ÁP
      // ===================================================================================================
      {
        const B = TB, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('conc', fc, 12, rc, W + 2, 24, D + 2, 0.6);
        K.box('corrGray', fc, 24 + (B.H - 24) / 2, rc, W, B.H - 24, D);
        pilasters(F, 24, B.H, 26, 2.2, 'steelGray');
        for (const k of ['front', 'back']) K.add('glass', new THREE.PlaneGeometry(F[k].len - 20, 10), mul(F[k].m, M4(0, B.H - 18, 0.3)));
        for (const k of ['sideP', 'sideN']) K.add('glass', new THREE.PlaneGeometry(F[k].len - 20, 10), mul(F[k].m, M4(0, B.H - 18, 0.3)));
        // mái dốc 2 phía (trục dọc r) + mái lấy sáng thông gió dọc nóc
        const rf = 14;
        for (const s of [-1, 1]) K.box('corrGray', fc + s * W / 4, B.H + rf / 2, rc, Math.hypot(W / 2, rf) + 1, 1, D + 4, 0, 24, 0, -s * Math.atan2(rf, W / 2));
        const gableSh = new THREE.Shape();
        gableSh.moveTo(-W / 2, 0); gableSh.lineTo(0, rf); gableSh.lineTo(W / 2, 0); gableSh.closePath();
        const gableGeo = new THREE.ShapeGeometry(gableSh);
        K.add('corrGray', gableGeo, M4(fc, B.H, B.r0, 0, Math.PI, 0));
        K.add('corrGray', gableGeo.clone(), M4(fc, B.H, B.r1, 0, 0, 0));
        K.box('louver', fc, B.H + rf + 3, rc, 10, 6, D - 30); K.box('steelGray', fc, B.H + rf + 6.5, rc, 14, 1, D - 28, 0, 24);
        const fr = F.front.m;
        K.add('shutter', new THREE.BoxGeometry(40, 60, 1.2), mul(fr, M4(40, 30, 0.8)));
        K.add('steelDark', new THREE.BoxGeometry(44, 3, 2), mul(fr, M4(40, 61, 1)));
        label('tb', ['TURBINE HALL — UNIT 1', '500 MWe'], B.f1 + 0.8, 110, rc - 50, 80, 15, Math.PI / 2);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + rf + 8);
        // MBA tăng áp: thùng gân, dàn tản nhiệt, sứ xuyên, bình dầu phụ; tường ngăn cháy; hố thu dầu sỏi
        const tr = (f, r) => {
          K.cbox('concDark', f, 1.5, r, 44, 3, 30, 0.4);
          K.cbox(M.trafo, f, 15, r, 30, 24, 20, 0.6);
          for (let x = -12; x <= 12; x += 4) K.box(M.trafo, f + x, 15, r + 10.6, 1, 20, 1.2, 0, 24);
          for (const s of [-1, 1]) for (let k = 0; k < 5; k++) K.box(M.trafo, f + s * 19, 15, r - 8 + k * 4, 6, 20, 0.6, 0, 24);
          for (let k = 0; k < 3; k++) { K.cyl(M.porc, f - 6 + k * 6, 27, r - 3, 1, 1.6, 14, 8); K.cyl('steelGray', f - 6 + k * 6, 41, r - 3, 1.4, 1.4, 1, 8); }
          K.add(M.trafo, new THREE.CylinderGeometry(4, 4, 22, 14), M4(f, 32, r + 6, 0, 0, Math.PI / 2));
          K.solid(f, r, 22, 14, 0, 42);
        };
        tr(76, 340); tr(76, 392);
        for (const r of [318, 366, 414]) { K.cbox('conc', 76, 26, r, 52, 52, 4, 0.5); K.solid(76, r, 26, 2, 0, 52); }
        pipe(M.alu, [B.f0 + 30, 44, B.r1], [76, 44, 340], 2.4); pipe(M.alu, [B.f0 + 50, 44, B.r1], [76, 44, 392], 2.4);
        K.plane(decal('fu_hv', signTex('fu_hv', ['DANGER — 500 kV', 'HIGH VOLTAGE — KEEP OUT'], { w: 1024, h: 160, bg: '#e9e6dc', fg: '#a3221a' })), 102.5, 10, 366, 20, 3.2);
      }

      // ===================================================================================================
      // 7. THÁP GIẢI NHIỆT CƯỠNG BỨC 2 x 4 NGĂN + giàn ống nước tuần hoàn vắt qua đường sang nhà tua-bin
      // ===================================================================================================
      {
        const B = CT, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('concDark', fc, 3, rc, W + 12, 6, D + 12, 0.6);                    // bể nước dưới tháp
        K.cbox('conc', fc, 6 + (B.H - 6) / 2, rc, W, B.H - 6, D, 0.8);
        for (const k of Object.keys(F)) for (let x = -F[k].len / 2 + 12; x < F[k].len / 2 - 6; x += 22) K.add('louver', new THREE.BoxGeometry(18, 22, 0.6), mul(F[k].m, M4(x, 20, 0.4)));
        band(B, B.H, 3, 1, 'conc');
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
          const f = B.f0 + W * (i + 0.5) / 4, r = B.r0 + D * (j + 0.5) / 2;
          if ((i === 3 && j === 1) || (i === 1 && j === 0)) {   // ngăn quạt trúng tên lửa: ống quạt vỡ còn chân, lòng cháy đen, mảnh văng trên mái
            K.cyl('conc', f, B.H, r, 15, 17, 5, 20); for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + H(i + k); K.box('conc', f + Math.cos(a) * 15, B.H + 5 + H(k + i) * 5, r + Math.sin(a) * 15, 6, 4 + H(k + j) * 8, 2, -a, 0, 0.3); }
            K.add(M.soot, new THREE.CircleGeometry(24, 20), M4(f, B.H + 0.4, r, -Math.PI / 2, 0, 0)); K.add('void', new THREE.CircleGeometry(13, 14), M4(f, B.H + 5.1, r, -Math.PI / 2, 0, 0));
            for (let k = 0; k < 10; k++) K.add('concDark', new THREE.DodecahedronGeometry(1 + H(k + i * 7) * 2.4, 0), M4(f + (H(k) - 0.5) * 50, B.H + 1.6, r + (H(k + 3) - 0.5) * 40, H(k) * 3, 0, 0, 1.3, 0.6, 1));
            continue;
          }
          K.cyl('conc', f, B.H, r, 15, 17, 22, 20);
          K.add('void', new THREE.CircleGeometry(14.2, 20), M4(f, B.H + 21, r, -Math.PI / 2, 0, 0));
          for (const a of [0.3, 1.35, 2.4]) K.box('steelDark', f, B.H + 12, r, 26, 0.6, 2, a + H(i * 2 + j), 0);
        }
        // vệt rêu / cặn trắng loang dưới miệng quạt (nước bắn) — mảng sơn nhòe mỏng trên tường
        K.solid(fc, rc, W / 2 + 6, D / 2 + 6, 0, B.H + 22);
        label('ct', ['COOLING TOWER CT-1'], B.f1 + 0.8, 46, rc, 60, 8, Math.PI / 2);
        const py = 38;
        for (const o of [-6, 6]) { pipe(M.blue, [B.f1, py, 306 + o], [TB.f0, py, 306 + o], 4, 14); pipe(M.blue, [B.f1 - 8, 4, 306 + o], [B.f1 - 8, py, 306 + o], 4, 14); }
        for (const f of [-40, RING - 14, RING + 14]) { K.box('steelGray', f, py / 2, 306, 2.4, py, 22, 0, 24); K.solid(f, 306, 2, 12, 0, py + 4); }
      }

      // ===================================================================================================
      // 8. NHÀ ĐIỀU HÀNH, BỒN NƯỚC CHỮA CHÁY, BIỂN BÁO, CANH PHÒNG, DẤU VẾT BỎ HOANG
      // ===================================================================================================
      officeBlock(K, kit, 210, -292, Math.PI, 56, 160, 3, ['ADMINISTRATION BUILDING', 'MAIN CONTROL ROOM']);
      officeBlock(K, kit, 210, 250, Math.PI, 48, 120, 2, ['HEALTH PHYSICS', 'DECONTAMINATION & MEDICAL']);
      {
        const Bd = L.bund;
        vTank(K, Bd.f, Bd.r, 13, 40, 0.4);
        K.plane(decal('fu_fw', signTex('fu_fw', ['FIRE WATER TANK', '3000 m³'], { w: 768, h: 192, bg: '#a3281e', fg: '#ffffff', fg2: '#ffffff' })), Bd.f + 13.3, 24, Bd.r, 14, 3.5);
        K.solid(Bd.f, Bd.r, 14, 14, 0, 48);
      }

      // ===================================================================================================
      // 9. HẠ TẦNG ĐIỆN QUANH LÒ: trạm biến áp 500 kV, kho pin lưu trữ điện năng, đài điều khiển, cụm máy phát diesel
      // ===================================================================================================
      // --- TRẠM BIẾN ÁP (góc trước-trái, rào riêng): 2 MBA tăng áp, 3 ngăn lộ giàn cổng + máy cắt + dao cách ly + trụ sứ ---
      {
        const f0 = 22, f1 = 128, r0 = -446, r1 = -314;
        K.add(M.rubble, new THREE.PlaneGeometry(f1 - f0, r1 - r0).rotateX(-Math.PI / 2), M4((f0 + f1) / 2, 0.7, (r0 + r1) / 2));
        api.fence(K, f0, r0, f1, r0, -1, 13); api.fence(K, f0, r1, f1, r1, 1, 13); api.fence(K, f0, r0, f0, r1, -1, 13);
        api.fence(K, f1, r0, f1, -400, 1, 13); api.fence(K, f1, -360, f1, r1, 1, 13);
        const post = (f, r, y, len) => { K.cyl('steelGray', f, y, r, 1.2, 1.4, 1, 8); K.cyl(M.porc, f, y + 1, r, 1, 1.6, len, 8); for (let k = 1; k < len / 2; k++) K.cyl(M.porc, f, y + 1 + k * 2, r, 2.2, 2.2, 0.6, 10); return y + 1 + len; };
        const ped = (f, r, h) => { K.cbox('concDark', f, 1.2, r, 6, 2.4, 6, 0.3); K.box('steelGray', f, 2.4 + (h - 2.4) / 2, r, 2, h - 2.4, 2, 0, 24); };
        // giàn cổng thép 3 ngăn (cột mắt cáo + dầm), dây đón từ cột điện ngoài rào
        const gf = 40, gH = 90, bays = [-430, -380, -330];
        for (const r of [-446 + 4, -405, -355, r1 - 4]) { for (const d of [-3, 3]) K.box('steelGray', gf + d, gH / 2, r, 1.2, gH, 1.2, 0, 24); for (let y = 8; y < gH; y += 10) K.beam('steelGray', [gf - 3, y, r], [gf + 3, y + 10, r], 0.5); K.solid(gf, r, 4, 2, 0, gH); }
        K.box('steelGray', gf, gH - 2, (r0 + r1) / 2, 6, 4, r1 - r0 - 6, 0, 24);
        for (const r of bays) for (let p = -1; p <= 1; p++) {
          const rp = r + p * 12;
          // dao cách ly -> máy cắt (buồng ngắt trên trụ sứ) -> biến dòng -> thanh cái ống
          ped(60, rp, 14); const t1 = post(60, rp, 14, 18); K.box(M.alu, 64, t1, rp, 8, 0.8, 0.8, 0, 0);
          ped(78, rp, 12); const t2 = post(78, rp, 12, 22); K.cyl('steelGray', 78, t2, rp, 2.4, 2.4, 6, 10);
          ped(94, rp, 12); const t3 = post(94, rp, 12, 16); K.cyl(M.porc, 94, t3, rp, 2.6, 2, 6, 10);
          for (const [A, Bp] of [[[gf, gH - 10, rp], [60, t1, rp]], [[64, t1, rp], [78, t2 + 6, rp]], [[78, t2 + 6, rp], [94, t3 + 6, rp]]]) K.beam(M.alu, A, Bp, 0.4);
          K.solid(78, rp, 3, 3, 0, t2 + 6);
        }
        // 2 MBA tăng áp 22/500 kV: thùng gân, dàn tản nhiệt, sứ xuyên cao, bình dầu phụ; tường ngăn cháy; MBA 2 trúng tên lửa: cháy rụi
        const xfmr = (f, r, burnt) => {
          const mt = burnt ? M.soot2 : M.trafo;
          K.cbox('concDark', f, 1.5, r, 40, 3, 34, 0.4);
          K.cbox(mt, f, 16, r, 26, 26, 22, 0.6);
          for (const s of [-1, 1]) for (let k = 0; k < 6; k++) K.box(mt, f + s * 17, 15 + (burnt && k % 2 ? -3 : 0), r - 10 + k * 4, 6, 20, 0.6, burnt ? (H(k + f) - 0.5) * 0.4 : 0, 24);
          for (let k = 0; k < 3; k++) { const top = 29; if (burnt && k !== 1) { K.cyl(M.porc, f - 7 + k * 7, top, r - 4, 1.2, 1.8, 4, 8); continue; } K.cyl(M.porc, f - 7 + k * 7, top, r - 4, 1.2, 1.8, 20, 8); for (let y = 2; y < 20; y += 2.4) K.cyl(M.porc, f - 7 + k * 7, top + y, r - 4, 2.4, 2.4, 0.6, 10); }
          K.add(mt, new THREE.CylinderGeometry(4, 4, 20, 14), M4(f, 34, r + 7, 0, 0, Math.PI / 2));
          K.solid(f, r, 20, 17, 0, 48);
        };
        xfmr(104, -432, false); xfmr(104, -390, true);
        for (const r of [-411, -369]) { K.cbox('conc', 104, 24, r, 46, 48, 3, 0.4); K.solid(104, r, 23, 2, 0, 48); }
        K.add(M.soot, new THREE.CircleGeometry(30, 20), M4(104, 1.2, -390, -Math.PI / 2, 0, 0));
        K.add(M.soot, new THREE.PlaneGeometry(40, 40), M4(104, 24, -367.4, 0, 0, 0));
        K.plane(decal('fu_sub', signTex('fu_sub', ['500 kV STEP-UP SUBSTATION', 'DANGER — HIGH VOLTAGE'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#a3221a' })), f1 + 0.7, 10, -380, 30, 5.6);
      }
      // --- KHO PIN LƯU TRỮ ĐIỆN NĂNG (BESS): 2 hàng container pin + tủ biến đổi PCS + MBA hợp bộ; 1 container trúng tên lửa ---
      {
        const rows = [184, 226], rs = [-196, -164, -132, -100, -68];
        K.add(M.rubble, new THREE.PlaneGeometry(84, 168).rotateX(-Math.PI / 2), M4(205, 0.7, -128));
        rows.forEach((f, i) => rs.forEach((r, j) => {
          const hit = i === 1 && j === 2;
          K.cbox('concDark', f, 1, r, 16, 2, 30, 0.3);
          if (hit) {
            // container nổ bung: vách tôn xé toạc, khung vênh, giá pin cháy đen đổ ra, mái hất lật
            K.box(M.soot2, f, 7, r, 12, 10, 26, 0.06, 24, 0.08, 0);
            for (const s of [-1, 1]) K.box(M.soot2, f + s * 7, 9, r + 6, 0.8, 14, 14, s * 0.5, 24, 0, s * 0.3);
            K.box(M.soot2, f + 10, 1.5, r - 4, 16, 1, 22, 0.4, 24, 0.2, 0.3);
            for (let k = 0; k < 8; k++) K.box('steelDark', f - 10 + H(k + 70) * 20, 1.5 + H(k + 71) * 2, r - 14 + H(k + 72) * 28, 3, 3, 4, H(k) * 3, 0);
            K.add(M.soot, new THREE.CircleGeometry(24, 20), M4(f, 1.3, r, -Math.PI / 2, 0, 0));
          } else {
            K.box('steelWhite', f, 7.5, r, 12, 11, 28);
            for (let x = -12; x <= 12; x += 6) K.box('steelGray', f + 6.2, 7, r + x, 0.4, 9, 4.6);
            K.box('louver', f - 6.2, 9, r, 0.4, 5, 20); K.cbox('steelGray', f, 14, r + 9, 8, 2, 8, 0.3);
            if ((i + j) % 2) K.add(M.soot, new THREE.PlaneGeometry(14, 10), M4(f + 6.3, 8, r, 0, Math.PI / 2, 0));
          }
          K.solid(f, r, 7, 15, 0, 15);
        }));
        for (const r of [-180, -116]) { K.cbox('steelGray', 205, 7, r, 10, 12, 14, 0.4); K.box('louver', 210.2, 7, r, 0.4, 8, 10); K.cbox(M.trafo, 205, 6, r + 12, 10, 10, 8, 0.4); K.solid(205, r + 6, 6, 14, 0, 14); }
        K.plane(decal('fu_bess', signTex('fu_bess', ['BATTERY ENERGY STORAGE — 200 MWh', 'LITHIUM-ION — DO NOT USE WATER ON FIRE'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#a3221a' })), 246.6, 9, -128, 32, 6);
      }
      // --- ĐÀI ĐIỀU KHIỂN: tháp bê tông cao, cabin kính 8 cạnh nhìn ra toàn khu, ăng-ten; cabin vỡ một mảng do mảnh tên lửa ---
      {
        const f = 212, r = 128, Hs = 210;
        K.cbox('conc', f, 12, r, 40, 24, 40, 0.8); K.cbox('concDark', f, 25, r, 42, 2, 42, 0.3);
        // nhà chân tháp: cửa thép 2 cánh + ô cửa sổ nhỏ có khung (kiểu nhà điều hành)
        { const fr = M4(f + 20, 0, r, 0, Math.PI / 2, 0);
          K.add('steelDark', new THREE.BoxGeometry(8, 11, 0.6), mul(fr, M4(0, 5.5, 0.3))); K.add('steelGray', new THREE.BoxGeometry(0.4, 10, 0.8), mul(fr, M4(0, 5.5, 0.5)));
          K.cbox('concDark', 0, 12.4, 3, 12, 1, 6, 0.3, 0, fr);
          for (const x of [-13, -8, 8, 13]) win(fr, x, 14, 3.4, 4); }
        K.cyl('conc', f, 24, r, 9, 11, Hs - 24, 20);
        for (let y = 40; y < Hs - 20; y += 22) K.add('glass', new THREE.PlaneGeometry(2.4, 6), M4(f + 9.6, y, r, 0, Math.PI / 2, 0));
        K.cyl('concDark', f, Hs, r, 20, 12, 8, 8);
        const cab = Hs + 8;
        K.add('glass', new THREE.CylinderGeometry(19, 17, 16, 8, 1, true, 0.4, TAU - 1.2), M4(f, cab + 8, r));
        K.add(M.soot2, new THREE.CylinderGeometry(18.6, 16.6, 16, 8, 1, true, -0.8, 1.2), M4(f, cab + 6, r));   // khung cháy đen chỗ kính vỡ
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + 0.4; K.beam('steelDark', [f + Math.sin(a) * 17, cab, r + Math.cos(a) * 17], [f + Math.sin(a) * 19, cab + 16, r + Math.cos(a) * 19], 0.8); }
        K.cyl('steelDark', f, cab + 16, r, 22, 20, 3, 8);
        K.cyl('steelGray', f, cab + 19, r, 0.6, 0.8, 30, 6); K.add('lampRed', new THREE.SphereGeometry(1, 8, 6), M4(f, cab + 50, r));
        for (const a of [0.8, 2.6]) K.add('steelWhite', new THREE.CylinderGeometry(4, 4, 2, 14), M4(f + Math.cos(a) * 12, cab + 23, r + Math.sin(a) * 12, 0, -a, Math.PI / 2));
        K.plane(decal('fu_ctl', signTex('fu_ctl', ['CENTRAL CONTROL TOWER', 'FUSION ENERGY CENTER'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), f + 20.4, 20, r, 30, 5.6);
        K.solid(f, r, 21, 21, 0, 26); K.solid(f, r, 12, 12, 0, cab + 20);
      }
      // --- CỤM MÁY PHÁT DIESEL DỰ PHÒNG: 3 tổ máy trong container cách âm, ống xả + bầu tiêu âm, bồn dầu ngày; 1 tổ trúng đạn ---
      {
        for (let k = 0; k < 3; k++) {
          const f = 178 + k * 30, r = 346, hit = k === 1, m = hit ? M.soot2 : 'corrGray';
          K.cbox('concDark', f, 1, r, 24, 2, 50, 0.3);
          K.box(m, f, 12, r, 18, 20, 44, hit ? 0.05 : 0, 24, hit ? 0.06 : 0, 0);
          K.box('louver', f, 13, r + 22.3, 14, 14, 0.6); K.box('louver', f, 13, r - 22.3, 14, 14, 0.6);
          if (!hit) { K.add('steelGray', new THREE.CylinderGeometry(3, 3, 18, 12), M4(f, 25, r + 8, Math.PI / 2, 0, 0)); K.cyl('steelRust', f, 22, r + 16, 1.4, 1.4, 22, 10); }
          else { K.cyl('steelRust', f + 3, 2, r + 16, 1.4, 1.4, 10, 10); K.add('void', new THREE.PlaneGeometry(10, 9), M4(f + 9.1, 14, r - 4, 0, Math.PI / 2, 0)); K.add(M.soot, new THREE.CircleGeometry(22, 18), M4(f, 1.3, r, -Math.PI / 2, 0, 0)); }
          K.plane(decal('fu_dg' + k, signTex('fu_dg' + k, ['STANDBY DIESEL DG-' + (k + 1), '6.3 kV — 4 MW'], { w: 768, h: 160, bg: '#e9e6dc', fg: '#1d2a3a' })), f + 9.3, 16, r + 10, 14, 3);
          K.solid(f, r, 10, 24, 0, 24);
        }
        vTank(K, 240, 300 + 80, 7, 16, 0.2); K.solid(240, 380, 8, 8, 0, 24);
      }

      // ===================================================================================================
      // 10. VẾT OANH TẠC TÊN LỬA TẦM XA trên các công trình khác: hố nổ trên sân, mái / tường thủng, quạt tháp giải nhiệt mất
      // ===================================================================================================
      {
        // hố nổ: lòng hố tối + ụ viền đất đá hất lên + đá văng + vệt muội toả tia
        const crater = (f, r, R) => {
          K.add(M.soot, new THREE.CircleGeometry(R * 1.9, 24), M4(f, 1.1, r, -Math.PI / 2, 0, 0));
          K.add('void', new THREE.CircleGeometry(R * 0.7, 16), M4(f, 1.25, r, -Math.PI / 2, 0, 0));
          K.add(M.rubble, new THREE.TorusGeometry(R, R * 0.28, 6, 20), M4(f, 0.6, r, Math.PI / 2, 0, 0, 1, 1, 0.45));
          for (let k = 0; k < 14; k++) { const a = H(f + k) * TAU, d = R * (1.1 + H(r + k) * 1.4), s = 0.8 + H(k + f + r) * 2.2; K.add(H(k) < 0.5 ? 'conc' : 'concDark', new THREE.DodecahedronGeometry(s, 0), M4(f + Math.cos(a) * d, s * 0.3 + 0.8, r + Math.sin(a) * d, H(k) * 3, H(k + 1) * 3, 0, 1.2, 0.6, 1)); }
        };
        for (const [f, r, R] of [[-40, -306, 13], [176, 166, 11], [200, -26, 9], [138, 440, 10], [-10, 440, 8]]) crater(f, r, R);
        // lỗ thủng xuyên mái / vách: lỗ tối viền lởm chởm, tấm tôn bị xé quặn ra ngoài, muội cháy loang phía trên
        const hole = (f, y, r, R, ry, m) => {
          const base = M4(f, y, r, 0, ry, 0);
          K.add(M.soot, new THREE.CircleGeometry(R * 2.4, 18), mul(base, M4(0, R * 0.6, 0.3)));
          K.add('void', new THREE.CircleGeometry(R, 9), mul(base, M4(0, 0, 0.5)));
          for (let k = 0; k < 7; k++) { const a = k * TAU / 7 + H(f + k), u = Math.cos(a) * R, v = Math.sin(a) * R; K.add(m || 'corrGray', new THREE.BoxGeometry(R * 0.7, R * 0.5, 0.5), mul(base, M4(u, v, 1.2, Math.sin(a) * 0.9, -Math.cos(a) * 0.9, a))); }
        };
        const roofHole = (f, y, r, R) => {
          K.add(M.soot, new THREE.CircleGeometry(R * 2.2, 18), M4(f, y + 0.3, r, -Math.PI / 2, 0, 0));
          K.add('void', new THREE.CircleGeometry(R, 9), M4(f, y + 0.5, r, -Math.PI / 2, 0, 0));
          for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + H(r + k); K.box('corrGray', f + Math.cos(a) * R, y + 2, r + Math.sin(a) * R, R * 0.8, 0.5, R * 0.5, -a, 24, 0, 0.8); }
        };
        // Đã gỡ bỏ các đĩa đen giả lỗ thủng đè lên tường và biển hiệu công trình
      }
      // bảng tên trung tâm cạnh cổng (2 trụ bê tông), biển phóng xạ trên rào trong
      K.cbox('concDark', 222, 10, -(G + 8) - 22, 3, 20, 3, 0.3); K.cbox('concDark', 222, 10, -(G + 8) + 22, 3, 20, 3, 0.3);
      K.plane(decal('fu_main', signTex('fu_main', ['FUSION ENERGY CENTER', 'NUCLEAR FACILITY — RESTRICTED AREA'], { w: 1024, h: 224, bg: '#1d3f6e', fg: '#ffffff', fg2: '#f0c419', border: '#e9e6dc' })), 223.6, 20, -(G + 8), 46, 10, Math.PI / 2);
      K.solid(222, -(G + 8), 2, 24, 0, 26);
      for (const f of [-180, -60, 60, 180]) for (const sd of [-1, 1]) K.plane(radM, f, 8, sd * (iR + 0.6), 12, 6, sd > 0 ? 0 : Math.PI);
      for (const r of [-300, -100, 100, 300]) K.plane(radM, -iF - 0.6, 8, r, 12, 6, -Math.PI / 2);
      for (const r of [-200, 200]) K.plane(radM, iF + 0.6, 8, r, 12, 6);
      for (const [f, r] of [[iF - 38, -(iR - 38)], [iF - 38, iR - 38], [-iF + 38, -(iR - 36)], [-iF + 38, iR - 36], [iF - 28, -(G + 40)], [iF - 28, G + 40]]) tower(f, r);
      sandbags(K, 176, 64, 176, 90, 3, 0); sandbags(K, 176, 90, 196, 96, 3, 0);
      sandbags(K, 12, -24, 12, 24, 2, 0);
      // thùng chất thải phóng xạ mức thấp (phuy vàng) xếp trước nhà triti, vài thùng đổ
      for (let i = 0; i < 9; i++) drum(K, -90 + (i % 3) * 5.4, -200 + Math.floor(i / 3) * 5.6, i === 4 ? 'drumRust' : 'yellow', 0);
      K.add('yellow', new THREE.CylinderGeometry(2.4, 2.4, 7.2, 14), M4(-80, 2.4, -178, Math.PI / 2, 0.6, 0));
      K.plane(triM, -82.5, 6, -194, 8, 4);
      // xe bỏ lại
      anim.vehicles.push({ type: 'SCOUT', f: 152, r: -250, a: Math.PI / 2 + 0.25, ty: 0.4, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: 60, r: 4, a: Math.PI + 0.06, ty: -0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'ARTILLERY', f: 152, r: 330, a: -Math.PI / 2, chassis: true, cargo: 'jp8', hf: 50, hr: 13 });
      anim.vehicles.push({ type: 'GATLING', f: RING + 2, r: 200, a: Math.PI / 2 + 0.04, ty: 1.1, hf: 43, hr: 32 });
    }
  };
})();
