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
    // thép / sơn qua lớp làm cũ chung (ngả màu, nhám thêm, phản chiếu trời) — vật liệu riêng trước đây sạch & bóng hơn hẳn
    const G = (rust, o) => api.metalMat(rust, o);
    PM.ss = G(0.2, { color: 0xb4b7b6, roughness: 0.42, metalness: 0.55, bumpScale: 0.1 });      // thép không gỉ ốp tường / ống khói (ít gỉ: chỉ ố)
    PM.hatch = G(1.0, { color: 0x5e676e, roughness: 0.55, metalness: 0.5 });    // cửa thiết bị thép dày
    PM.trafo = G(2.2, { color: 0x76807f, roughness: 0.6, metalness: 0.3 });
    // sứ cách điện men nâu sẫm: men bóng nhưng phản chiếu trời (không phải nhựa cam), bụi bám mờ
    // (điện môi: metalness ~0, bóng men nhờ phản chiếu trời; không qua metalize vì ngưỡng metalness)
    const glaze = (c, r, ei) => S({ map: api.grimePair('r0', 0)[0], color: c, roughness: r, metalness: 0.02, envMap: api.envCube(), envMapIntensity: ei });
    PM.porc = glaze(0x3e2419, 0.3, 0.55);
    PM.porcGray = glaze(0x6a6c68, 0.55, 0.3);   // sứ polymer xám
    PM.blue = G(0.8, { color: 0x4d6577, roughness: 0.72, metalness: 0.3 });    // ống nước tuần hoàn: sơn xanh phai phấn
    PM.alu = G(0.1, { color: 0xa9adab, roughness: 0.5, metalness: 0.5 });
    { const [t, b] = api.ribPair('rib_v', false, 16, 236);   // vách container tôn sóng sơn trắng ngà
      PM.cont = api.metalize(S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0xc9c6bc, roughness: 0.7, metalness: 0.3 })); PM.cont.userData.tile = 24; }
    PM.paintW = G(0.5, { color: 0xd6d2c6, roughness: 0.68, metalness: 0.3 });  // bồn khí sơn trắng phai, phấn hóa
    PM.cond = G(1, { color: 0x8a8e8e, roughness: 0.62, metalness: 0.5 });     // dây nhôm lõi thép xỉn
    // ống quạt sợi thủy tinh xanh xám phai: không gỉ, chỉ bẩn / bạc màu
    PM.frp = S({ map: api.grimePair('r0', 0)[0], color: 0x646b64, roughness: 0.85, metalness: 0 }); PM.frp.userData.tile = 24;
    // muội cháy: mảng loang đục ở lõi, mép tơi nhòe không đều (không phải tấm kính khói phẳng mép vuông)
    PM.soot = S({ map: sootTex(api), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    PM.streak = S({ map: streakTex(api), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    PM.scale = S({ map: scaleTex(api), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    PM.cu = G(1, { color: 0x5e4630, roughness: 0.7, metalness: 0.5 });
    PM.vv = G(1, { color: 0x858a8d, roughness: 0.6, metalness: 0.5, bumpScale: 0.18 });                     // vỏ buồng chân không: thép không gỉ xỉn, ám bụi
    PM.coil = G(1.2, { color: 0x666869, roughness: 0.58, metalness: 0.5 });               // vỏ cuộn siêu dẫn: thép đúc xám chì, gỉ loang
    PM.cable = S({ color: 0x1d1e1d, roughness: 0.85 });
    // mép vỏ thùng lạnh bị xé: tấm thép mỏng nhìn được cả 2 mặt
    PM.ssLip = PM.vv.clone(); PM.ssLip.side = THREE.DoubleSide;
    // lòng buồng chân không: ô tấm ốp (blanket) xám tối, khe đen, ô cháy sém / bong mất lộ thép sáng hơn
    PM.vvIn = S({ map: blanketTex(api), color: 0xffffff, roughness: 0.8, metalness: 0.25 }); api.metalize(PM.vvIn);
    // tấm chắn nhiệt mạ bạc: rất bóng, sáng, ám bụi nhẹ (điểm sáng duy nhất trong lòng lò toàn thép xám)
    PM.tsh = G(0.1, { color: 0xd4d8da, roughness: 0.22, metalness: 0.9 }); PM.tsh.side = THREE.DoubleSide;
    PM.roof = S({ map: roofTex(api), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    PM.rbar = G(3, { color: 0x45403b, roughness: 0.72, metalness: 0.5 });   // dầm thép mái gãy: thép sẫm gỉ loang (không nâu phẳng như ván gỗ)
    PM.pgreen = G(1, { color: 0x56694f, roughness: 0.7, metalness: 0.3 });   // ống nước làm mát sơn xanh lá phai
    PM.rubble = S({ map: api.detailTex('gravel'), color: 0x8e887d, roughness: 1 });
    PM.mli = G(1.2, { color: 0xa88f5c, roughness: 0.5, metalness: 0.55, bumpScale: 0.9 });   // giấy bạc cách nhiệt nhiều lớp (vàng kim, nhăn)
    PM.soot2 = G(4, { color: 0x2c2926, roughness: 0.95, metalness: 0.15 });
    PM.yel = G(0.8, { color: 0xc9a227, roughness: 0.6, metalness: 0.2 });
    return PM;
  }
  // Tấm ốp vách trong buồng chân không (blanket): ô vuông xám tối mép vát, khe đen, ô cháy sém đậm nhạt khác nhau,
  // vài ô bong mất lộ khung thép sáng hơn có lỗ bắt bu-lông; lặp theo repeat của vật liệu
  function blanketTex(api) {
    const t = api.texOf('pw_blanket', 256, 256, (g, w, h) => {
      const n = 8, c = w / n, H = (i) => api.hash(i * 2.71 + 6700);
      g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const k = i * n + j, x = i * c + 1.5, y = j * c + 1.5, s = c - 3;
        if (H(k) < 0.06) { g.fillStyle = '#5b5c5a'; g.fillRect(x, y, s, s); g.fillStyle = '#1a1a1a'; for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { g.beginPath(); g.arc(x + s * u, y + s * v, 2, 0, Math.PI * 2); g.fill(); } continue; }
        const v = 52 + H(k + 100) * 40 | 0, gr = g.createLinearGradient(x, y, x + s, y + s);
        gr.addColorStop(0, `rgb(${v + 16},${v + 16},${v + 14})`); gr.addColorStop(1, `rgb(${v - 10},${v - 11},${v - 12})`);
        g.fillStyle = gr; g.fillRect(x, y, s, s);
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + s / 2, y + 2); g.lineTo(x + s / 2, y + s - 2); g.stroke();
      }
      for (let i = 0; i < 26; i++) { const x = H(i + 300) * w, y = H(i + 301) * h, r = 10 + H(i + 302) * 40, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,8,6,0.6)'); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    }, true);
    t.repeat.set(36, 4);
    return t;
  }
  // Mặt mái bằng bỏ hoang (lặp 120 đv): vũng đọng nước khô để lại vệt ố viền sẫm, rêu / địa y xanh xám mọc theo vệt ẩm,
  // mảng vá bitum đen, đốm bụi đất, vết lá mục; nền trong suốt (chỉ là lớp bẩn phủ lên bê tông / tôn)
  function roofTex(api) {
    return api.texOf('pw_roof', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const H = (i) => api.hash(i * 3.91 + 7100);
      const wrap = (fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
      // vệt đọng nước khô: nhiều mảng mờ chồng nhau lệch tâm -> loang không đều, không thành vòng tròn
      for (let i = 0; i < 26; i++) {
        const x = H(i) * w, y = H(i + 1) * h, r = 8 + H(i + 2) * 30, al = 0.06 + H(i + 3) * 0.1;
        wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(38,36,30,${al})`); gr.addColorStop(1, 'rgba(38,36,30,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
      }
      for (let i = 0; i < 90; i++) { const x = H(i + 100) * w, y = H(i + 101) * h, r = 3 + H(i + 102) * 12; wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); const c = H(i + 103) < 0.6 ? '74,88,52' : '108,112,84'; gr.addColorStop(0, `rgba(${c},0.45)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); }); }
      for (let i = 0; i < 4; i++) { const x = H(i + 200) * w, y = H(i + 201) * h, pw = 14 + H(i + 202) * 30, ph = 8 + H(i + 203) * 20; wrap((ox, oy) => { g.fillStyle = 'rgba(22,22,22,0.55)'; g.fillRect(x + ox, y + oy, pw, ph); }); }
      for (let i = 0; i < 400; i++) { g.fillStyle = H(i + 300) < 0.5 ? 'rgba(70,60,44,0.35)' : 'rgba(96,84,58,0.3)'; g.fillRect(H(i + 301) * w, H(i + 302) * h, 1 + H(i + 303) * 2, 1 + H(i + 303) * 2); }
    }, true);
  }
  // Muội cháy: lõi đục nâu đen, nhiều mảng loang chồng nhau, mép tơi; alpha về 0 ở mép ảnh (dán lên mặt phẳng / đĩa /
  // cung xuyến đều không lộ mép hình học)
  function sootTex(api) {
    return api.texOf('pw_soot', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const H = (i) => api.hash(i * 3.17 + 6100);
      for (let i = 0; i < 70; i++) {
        const a = H(i) * Math.PI * 2, d = Math.pow(H(i + 100), 0.8) * w * 0.34, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.9;
        const r = w * (0.05 + H(i + 200) * 0.12) * (1 - d / w), gr = g.createRadialGradient(x, y, 0, x, y, r), al = 0.22 + H(i + 300) * 0.3;
        const c = H(i + 400) < 0.7 ? '22,20,18' : '58,46,36';
        gr.addColorStop(0, `rgba(${c},${al})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const core = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.3); core.addColorStop(0, 'rgba(16,14,12,0.75)'); core.addColorStop(1, 'rgba(16,14,12,0)');
      g.fillStyle = core; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) { const a = H(i + 900) * Math.PI * 2, d = H(i + 901) * w * 0.45; g.fillStyle = `rgba(20,18,16,${0.15 + H(i + 902) * 0.3})`; g.fillRect(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1 + H(i + 903) * 2, 1 + H(i + 903) * 2); }
    });
  }
  // Vệt mưa chảy từ mép mái / gờ xuống mặt tường (lặp theo chiều ngang): sợi sẫm dài ngắn, đậm ở đỉnh nhạt dần
  function streakTex(api) {
    const t = api.texOf('pw_streak', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const H = (i) => api.hash(i * 5.31 + 6300);
      const top = g.createLinearGradient(0, 0, 0, h * 0.18); top.addColorStop(0, 'rgba(46,42,36,0.38)'); top.addColorStop(1, 'rgba(46,42,36,0)'); g.fillStyle = top; g.fillRect(0, 0, w, h * 0.18);
      for (let i = 0; i < 90; i++) {
        let x = H(i) * w; const l = h * (0.15 + Math.pow(H(i + 100), 1.6) * 0.85), wd = 1 + H(i + 200) * 4, al = 0.07 + H(i + 300) * 0.2;
        const c = H(i + 400) < 0.9 ? '40,38,34' : '110,74,42';
        const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(${c},${al})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.strokeStyle = gr; g.lineWidth = wd; g.lineCap = 'round';
        for (const ox of [0, -w, w]) { let px = x + ox; g.beginPath(); g.moveTo(px, 0); for (let s = 1; s <= 8; s++) { px += (H(i * 9 + s + 500) - 0.5) * 2; g.lineTo(px, l * s / 8); } g.stroke(); }
      }
    }, true);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  // Cặn khoáng trắng + rêu xanh dưới cửa gió tháp giải nhiệt bỏ hoang (nước bắn / tràn nhiều năm): vệt trắng loang chảy
  // xuống, rêu đậm ở chân (đáy ảnh)
  function scaleTex(api) {
    const t = api.texOf('pw_scale', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const H = (i) => api.hash(i * 4.77 + 6500);
      for (let i = 0; i < 46; i++) {
        let x = H(i) * w; const y0 = h * (0.15 + H(i + 50) * 0.45), l = h * (0.1 + Math.pow(H(i + 100), 1.5) * 0.45), wd = 1 + H(i + 200) * 6;
        const gr = g.createLinearGradient(0, y0, 0, y0 + l); gr.addColorStop(0, `rgba(214,212,200,${0.1 + H(i + 300) * 0.22})`); gr.addColorStop(1, 'rgba(214,212,200,0)');
        g.strokeStyle = gr; g.lineWidth = wd; g.lineCap = 'round';
        for (const ox of [0, -w, w]) { let px = x + ox; g.beginPath(); g.moveTo(px, y0); for (let s = 1; s <= 8; s++) { px += (H(i * 9 + s + 600) - 0.5) * 3; g.lineTo(px, y0 + l * s / 8); } g.stroke(); }
      }
      const moss = g.createLinearGradient(0, h * 0.55, 0, h); moss.addColorStop(0, 'rgba(70,88,46,0)'); moss.addColorStop(1, 'rgba(62,80,40,0.7)'); g.fillStyle = moss; g.fillRect(0, h * 0.55, w, h * 0.45);
      for (let i = 0; i < 160; i++) {
        const x = H(i + 700) * w, y = h * (0.5 + Math.pow(H(i + 701), 0.6) * 0.5), r = 3 + H(i + 702) * 14, gr = g.createRadialGradient(x, y, 0, x, y, r);
        const c = H(i + 703) < 0.6 ? '64,84,40' : '96,104,62'; gr.addColorStop(0, `rgba(${c},0.45)`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, true);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
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

  // SÂN NHÀ MÁY (bỏ hoang nhiều năm) vẽ lên ảnh nền: bê tông đổ tấm 6 x 6 m (mạch co giãn sẫm, mỗi tấm 1 tông, vài tấm
  // thay mới sáng hơn), vết nứt chân chim + nứt dài xuyên tấm (một số đã trám nhựa đường đen bóng), mẻ góc tấm, cỏ dại mọc
  // theo mạch / khe nứt (mặt nạ cỏ = nét mảnh), bãi nhựa đường (bãi xe trước nhà hành chính, sân thiết bị) nứt da cá sấu +
  // mảng vá; vệt dầu / gỉ quanh máy biến áp, máy phát, bồn, chỗ xe đỗ; vệt bánh xe mòn sáng theo lối đi
  const YARD_ASPH = [[150, -440, 250, -320], [150, 196, 250, 300], [138, -60, 162, 60]];          // bãi nhựa (f0, r0, f1, r1)
  const YARD_OIL = [[104, -432, 16], [104, -390, 26], [76, 340, 14], [76, 392, 14], [178, 346, 12], [208, 346, 18], [238, 346, 12], [240, 380, 10],
    [205, -180, 9], [205, -116, 9], [190, -260, 8], [200, 250, 8], [-60, -444, 10], [-60, -384, 10], [-82, -326, 9], [60, 4, 12], [152, -250, 9], [152, 330, 14]];
  function yardPaint(o) {
    const { g, P, S, mask, inner, hash: hs, blotch, speckle } = o, H = (i) => hs(i * 1.37 + 8800);
    const [fa, ra, fb, rb] = inner, [x0, y0] = P(fa, ra), [x1, y1] = P(fb, rb), SL = 48;
    const line = (pts, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
    const walk = (f, r, a, len, st, wig, sd) => { const pts = [P(f, r)]; for (let d = 0; d < len; d += st) { a += (H(sd + d) - 0.5) * wig; f += Math.cos(a) * st; r += Math.sin(a) * st; pts.push(P(f, r)); } return pts; };
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    if (mask) { g.fillStyle = '#0f0'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }   // kênh G = sân lát
    if (!mask) {
      // nền bê tông + tông từng tấm
      g.fillStyle = '#8c887e'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let f = fa, i = 0; f < fb; f += SL, i++) for (let r = ra, j = 0; r < rb; r += SL, j++) {
        const k = i * 97 + j, q = H(k), [px, py] = P(f, r);
        g.fillStyle = q < 0.07 ? 'rgba(196,192,180,0.35)' : `rgba(${q < 0.5 ? '70,66,58' : '168,162,148'},${0.05 + H(k + 3) * 0.1})`;
        g.fillRect(px, py, SL * S, SL * S);
      }
      for (let i = 0; i < 220; i++) blotch(g, x0 + H(i + 10) * (x1 - x0), y0 + H(i + 11) * (y1 - y0), (8 + H(i + 12) * 40) * S, H(i + 13) < 0.55 ? '74,70,60' : '150,144,128', 0.14);
      speckle(g, x1, y1, Math.round((x1 - x0) * (y1 - y0) / 30), ['#6e6a62', '#a8a396', '#7d786d'], 1, 2, 8810);
      // bãi nhựa đường
      for (const [af, ar, bf, br] of YARD_ASPH) {
        const [ax, ay] = P(af, ar), [bx, by] = P(bf, br);
        g.fillStyle = '#4a4946'; g.fillRect(ax, ay, bx - ax, by - ay);
        g.save(); g.beginPath(); g.rect(ax, ay, bx - ax, by - ay); g.clip();
        for (let i = 0; i < 60; i++) blotch(g, ax + H(i + 300 + af) * (bx - ax), ay + H(i + 301 + ar) * (by - ay), (6 + H(i + 302) * 20) * S, H(i + 303) < 0.5 ? '96,94,88' : '40,40,38', 0.25);
        speckle(g, bx, by, Math.round((bx - ax) * (by - ay) / 8), ['#5c5b57', '#2f2f2d', '#77746c'], 1, 1.6, 8830 + af);
        // mảng vá nhựa mới hơn (đen, mép thẳng)
        for (let i = 0; i < 3; i++) { const [px, py] = P(af + H(i + 320 + af) * (bf - af - 20), ar + H(i + 321 + ar) * (br - ar - 20)); g.fillStyle = 'rgba(30,30,29,0.85)'; g.fillRect(px, py, (8 + H(i + 322) * 14) * S, (6 + H(i + 323) * 10) * S); }
        g.restore();
      }
    }
    // mạch co giãn (cỏ mọc: nét mảnh trắng trên mặt nạ, đứt quãng)
    for (let f = fa + SL; f < fb; f += SL) for (let r = ra; r < rb; r += SL) {
      const k = Math.round(f * 3 + r), seg = [P(f, r), P(f, Math.min(rb, r + SL))];
      if (!mask) line(seg, 1.8, 'rgba(40,38,34,0.8)'); else if (H(k) < 0.55) line(seg, (0.6 + H(k + 1) * 1.6) * S, '#fff');
    }
    for (let r = ra + SL; r < rb; r += SL) for (let f = fa; f < fb; f += SL) {
      const k = Math.round(r * 3 + f) + 5000, seg = [P(f, r), P(Math.min(fb, f + SL), r)];
      if (!mask) line(seg, 1.8, 'rgba(40,38,34,0.8)'); else if (H(k) < 0.55) line(seg, (0.6 + H(k + 1) * 1.6) * S, '#fff');
    }
    // vết nứt: nứt dài xuyên tấm (khe hở có cỏ), nứt chân chim; ~1/3 đã trám nhựa đường
    for (let i = 0; i < 150; i++) {
      const f = fa + H(i + 500) * (fb - fa), r = ra + H(i + 501) * (rb - ra), long = H(i + 502) < 0.4, a = H(i + 503) * Math.PI * 2;
      const pts = walk(f, r, a, long ? 30 + H(i + 504) * 60 : 6 + H(i + 505) * 14, long ? 2.4 : 1.4, long ? 0.7 : 1.1, 520 + i * 31);
      const sealed = H(i + 506) < 0.3;
      if (!mask) { if (sealed) line(pts, 2.2 * S, 'rgba(26,26,24,0.8)'); line(pts, 1.4, 'rgba(36,34,30,0.85)'); }
      else if (long && !sealed) line(pts, (0.8 + H(i + 507) * 1.4) * S, '#fff');
      if (!mask && !long) for (let j = 0; j < 3; j++) { const p = pts[Math.floor(H(i + j + 508) * pts.length)]; g.strokeStyle = 'rgba(40,38,34,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + (H(i + j + 509) - 0.5) * 6 * S, p[1] + (H(i + j + 510) - 0.5) * 6 * S); g.stroke(); }
    }
    // nứt da cá sấu trên bãi nhựa (ô đa giác nhỏ) — có cỏ mọc ở khe rộng
    for (const [af, ar, bf, br] of YARD_ASPH) for (let i = 0; i < 26; i++) {
      const cf = af + H(i + 700 + af) * (bf - af), crr = ar + H(i + 701 + ar) * (br - ar), R = 4 + H(i + 702) * 8;
      for (let j = 0; j < 9; j++) { const a = j / 9 * Math.PI * 2, pts = walk(cf + Math.cos(a) * R * 0.3, crr + Math.sin(a) * R * 0.3, a, R, 1.6, 1.4, 720 + i * 13 + j); if (!mask) line(pts, 0.9, 'rgba(22,22,20,0.8)'); else if (H(i * 9 + j + 740) < 0.25) line(pts, 0.8 * S, '#fff'); }
    }
    if (!mask) {
      // mẻ góc tấm
      for (let i = 0; i < 90; i++) { const f = fa + Math.round(H(i + 800) * (fb - fa) / SL) * SL, r = ra + Math.round(H(i + 801) * (rb - ra) / SL) * SL, [px, py] = P(f, r), s2 = (1 + H(i + 802) * 3) * S; g.fillStyle = 'rgba(58,54,48,0.55)'; g.beginPath(); g.moveTo(px - s2, py); g.lineTo(px, py - s2 * 0.8); g.lineTo(px + s2 * 0.9, py + s2 * 0.3); g.lineTo(px - s2 * 0.2, py + s2); g.closePath(); g.fill(); }
      // cỏ dại / rêu dọc mạch + chỗ ẩm (màu; ngọn cỏ chi tiết do mặt nạ)
      for (let i = 0; i < 500; i++) { const onF = H(i + 900) < 0.5, f = onF ? fa + Math.ceil(H(i + 901) * (fb - fa) / SL) * SL : fa + H(i + 901) * (fb - fa), r = onF ? ra + H(i + 902) * (rb - ra) : ra + Math.ceil(H(i + 902) * (rb - ra) / SL) * SL, [px, py] = P(f, r); blotch(g, px, py, (1.2 + H(i + 903) * 3.5) * S, H(i + 904) < 0.6 ? '78,90,48' : '120,114,70', 0.5); }
      // vệt dầu / gỉ quanh thiết bị và chỗ xe đỗ: lõi đen bóng, quầng nâu loang, vệt kéo theo hướng xe
      for (const [f, r, R] of YARD_OIL) {
        const [px, py] = P(f, r);
        for (let j = 0; j < 7; j++) { const a = H(f + j) * Math.PI * 2, d = H(r + j) * R * 0.7; blotch(g, px + Math.cos(a) * d * S, py + Math.sin(a) * d * S, (R * (0.25 + H(f + r + j) * 0.4)) * S, j < 4 ? '22,20,18' : '74,58,40', j < 4 ? 0.42 : 0.25); }
        for (let j = 0; j < 3; j++) { const a = H(f * 3 + j) * Math.PI * 2, l = R * (1 + H(r * 3 + j)), [qx, qy] = P(f + Math.cos(a) * l, r + Math.sin(a) * l); g.strokeStyle = 'rgba(28,26,22,0.25)'; g.lineWidth = 2.4 * S; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke(); }
      }
      for (let i = 0; i < 60; i++) blotch(g, x0 + H(i + 1000) * (x1 - x0), y0 + H(i + 1001) * (y1 - y0), (1.5 + H(i + 1002) * 5) * S, '30,28,24', 0.35);
      // vệt bánh xe mòn sáng dọc 2 đường nội bộ (nhựa chạy qua vẽ riêng — ở đây chỉ phần sân bê tông 2 bên)
      for (const rr of [-10, 10]) line([P(fa, rr * 0.6), P(fb, rr * 0.6)], 3 * S, 'rgba(178,172,158,0.12)');
    }
    g.restore();
  }

  KINDS.power = {
    name: 'TRUNG TÂM NĂNG LƯỢNG NGUYÊN TỬ', icon: '☢', color: '#ffd23c',
    // cổng -> đường trục ngang (f = 150) -> nhánh vào (r = 0) -> đường nội bộ trước mặt lò (f = 0)
    site: {
      roads: [[[[320, 0], [150, 0]], 30], [[[150, -440], [150, 440]], 26], [[[150, 0], [RING, 0]], 22], [[[RING, -440], [RING, 440]], 20]],
      junctions: [[150, 0, 26, 30], [RING, 0, 20, 22]],
      gravel: () => [[30, 318, 122, 412]],
      slabs: [],
      noGrow: [],
      yard: (o) => yardPaint(o)
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
      // mặt trong vỏ trụ hở: lật hình (đảo chiều tam giác) VÀ đảo pháp tuyến — chỉ scale(-1) thì pháp tuyến vẫn hướng ra
      // ngoài -> mặt trong được chiếu sáng / phản chiếu trời như mặt ngoài (sáng bệch)
      const flipIn = (g, sx, sz) => { g.scale(sx, 1, sz); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; };
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
        K.cyl('steelGray', f, y, r, R, R, 4, 16); K.add('steelDark', new THREE.CircleGeometry(R - 0.6, 16), M4(f, y + 1.2, r, -Math.PI / 2, 0, 0));
        K.cyl('steelDark', f, y + 1.2, r, 1.2, 1.4, 2, 10);
        for (const a of [0, 1.05, 2.1]) K.box('steelDark', f, y + 3.1, r, R * 1.8, 0.4, 1, a, 0, 0.25);
        K.add('steelGray', new THREE.TorusGeometry(R - 0.3, 0.3, 4, 18), M4(f, y + 4, r, Math.PI / 2, 0, 0));
        // lưới bảo vệ: thanh song song 2 chiều trên miệng ống
        for (let d = -R + 1.2; d < R - 0.8; d += 1.2) { const l = 2 * Math.sqrt(Math.max(0, (R - 0.5) * (R - 0.5) - d * d)); K.box('steelGray', f + d, y + 4.15, r, 0.15, 0.15, l, 0, 0); K.box('steelGray', f, y + 4.3, r + d, l, 0.15, 0.15, 0, 0); }
      };
      // mặt mái bằng bỏ hoang: dán lớp ố / đọng nước / rêu / vá bitum lên mặt trên (tâm f, r, cao y, cỡ w x d)
      const roofGrime = (f, y, r, w, d) => {
        const g = new THREE.PlaneGeometry(w, d), uv = g.attributes.uv, o = H(f * 0.13 + r * 0.07);
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 210 + o, uv.getY(i) * d / 170 + o * 1.7);
        K.add(M.roof, g, M4(f, y + 0.12, r, -Math.PI / 2, 0, 0));
      };
      // vệt mưa chảy từ mép mái / gờ xuống mặt tường: dải dán sát mặt (top: mép trên, h: độ dài vệt), lệch pha từng mặt
      const streaks = (F, top, h, keys) => {
        for (const k of keys || Object.keys(F)) {
          const { m: b, len } = F[k], g = new THREE.PlaneGeometry(len - 1, h), uv = g.attributes.uv, o = H(len * 0.37 + top + k.length);
          for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 90 + o);
          K.add(M.streak, g, mul(b, M4(0, top - h / 2, 0.35)));
        }
      };
      // Sứ cách điện cao áp (đứng tại y, dài len, lõi bán kính rc): mặt bích đế thép, thân sứ thuôn dần lên trên với các
      // tán che mưa mỏng xen lớn / nhỏ (mặt dưới phẳng, mặt trên dốc ra mép), mũ nhôm + cọc đấu dây trên đỉnh. Trả về y đỉnh
      const bushing = (f, y, r, len, rc, m) => {
        K.cyl('steelGray', f, y, r, rc + 0.9, rc + 1.1, 1, 10);
        const pts = [new THREE.Vector2(0.01, 0), new THREE.Vector2(rc, 0)], p = 1.05;
        for (let s = 0, yy = 1; yy < len - 1.2; s++, yy += p) {
          const core = rc * (1 - 0.25 * yy / len), R = core + (s % 2 ? 0.55 : 1.0);
          pts.push(new THREE.Vector2(core, yy), new THREE.Vector2(R, yy + 0.05), new THREE.Vector2(R, yy + 0.17), new THREE.Vector2(core, yy + 0.5));
        }
        pts.push(new THREE.Vector2(rc * 0.75, len), new THREE.Vector2(0.01, len));
        K.add(m || M.porc, new THREE.LatheGeometry(pts, 10), M4(f, y + 1, r));
        const top = y + 1 + len;
        K.cyl('steelGray', f, top, r, rc * 0.75 + 0.3, rc * 0.75 + 0.5, 1.4, 10);
        K.cyl('steelDark', f, top + 1.4, r, 0.35, 0.35, 1.6, 6);
        return top + 3;
      };
      // Dây dẫn mềm võng giữa 2 điểm (đường parabol, độ võng sag), nhôm lõi thép xỉn
      const wire = (A, B2, sag, rad) => {
        const pts = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(A[0] + (B2[0] - A[0]) * t, A[1] + (B2[1] - A[1]) * t - 4 * sag * t * (1 - t), A[2] + (B2[2] - A[2]) * t)); }
        K.add(M.cond, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, rad || 0.35, 5, false));
      };
      // Dải cửa kính có khung (theo các mặt keys, tâm cao y, cao h, bước đố p): bậu + đầu khung nhô, đố đứng, đố ngang
      // giữa, từng ô kính riêng lùi sau khung (Kit tự cho ~1/3 ô rạn vỡ), vài ô mất hẳn lộ lòng nhà tối
      const windowBand = (F, keys, y, h, p, inset) => {
        for (const k of keys) {
          const { m: b, len } = F[k], L = len - (inset === undefined ? 16 : inset), n = Math.max(1, Math.round(L / p)), w = L / n;
          K.add('steelDark', new THREE.BoxGeometry(L + 1.6, 1.2, 1.6), mul(b, M4(0, y - h / 2 - 0.6, 0.6)));
          K.add('steelDark', new THREE.BoxGeometry(L + 1.6, 1, 1.3), mul(b, M4(0, y + h / 2 + 0.5, 0.5)));
          K.add('steelDark', new THREE.BoxGeometry(L, 0.5, 0.8), mul(b, M4(0, y, 0.4)));
          for (let i = 0; i <= n; i++) K.add('steelDark', new THREE.BoxGeometry(0.7, h, 1), mul(b, M4(-L / 2 + i * w, y, 0.5)));
          for (let i = 0; i < n; i++) for (const v of [-1, 1]) {
            const x = -L / 2 + (i + 0.5) * w, yy = y + v * h / 4, g = new THREE.PlaneGeometry(w - 0.7, h / 2 - 0.25), uv = g.attributes.uv;
            // mỗi ô lấy 1 khung con khác nhau của ảnh kính (vết rạn / vệt loá không lặp y hệt ô nào cũng giữa tâm)
            const ou = H(len + i * 3.3 + v) * 0.35, ov = H(len + i * 5.7 + v + 1) * 0.2; for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 0.65 + ou, uv.getY(j) * 0.8 + ov);
            if (H(len * 3.1 + i * 7 + v * 2 + y) < 0.1) K.add('void', g, mul(b, M4(x, yy, 0.08))); else K.add('glass', g, mul(b, M4(x, yy, 0.12)));
          }
        }
      };
      // Dầm thép chữ I (cánh trên / dưới + bụng) dài len theo trục f (alongR: theo r), tâm (f, y, r), cao h, rộng cánh bw
      const ibeam = (m, f, y, r, len, h, bw, alongR) => {
        const bx = (cy, sy, sw) => K.box(m, f, cy, r, alongR ? sw : len, sy, alongR ? len : sw, 0, 24);
        bx(y + h / 2 - 0.5, 1, bw); bx(y - h / 2 + 0.5, 1, bw); bx(y, h - 2, 0.8);
      };
      // Dàn tản nhiệt MBA (1 phía s): lá tản nhiệt mỏng sát nhau treo giữa ống góp trên / dưới, ống nối vào thùng; f0: mặt
      // thùng, (r0..r1) dọc thùng, y0..y1 cao
      const radiator = (m, f0, s, r0, r1, y0, y1, burnt) => {
        const fc = f0 + s * 5, n = Math.round((r1 - r0) / 1.6);
        for (let k = 0; k <= n; k++) { const rr = r0 + (r1 - r0) * k / n, sag = burnt && H(k + f0) < 0.3 ? -2 - H(k + r0) * 3 : 0; K.box(m, fc, (y0 + y1) / 2 + sag, rr, 6, y1 - y0 - 2, 0.25, burnt ? (H(k + f0 + 3) - 0.5) * 0.3 : 0, 24); }
        for (const y of [y0 + 0.6, y1 - 0.6]) {
          K.add(m, new THREE.CylinderGeometry(0.7, 0.7, r1 - r0 + 1.4, 8), M4(fc, y, (r0 + r1) / 2, Math.PI / 2, 0, 0));
          for (const rr of [r0 + (r1 - r0) * 0.25, r0 + (r1 - r0) * 0.75]) K.add(m, new THREE.CylinderGeometry(0.8, 0.8, 4.4, 8), M4(f0 + s * 2.2, y, rr, 0, 0, Math.PI / 2));
        }
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
            for (let y = 52; y < B.H - 44; y += 30) K.add('seam', new THREE.BoxGeometry(len - 2, 0.8, 0.4), mul(b, M4(0, y, 0.1)));
            for (let x = -len / 2 + 20; x < len / 2 - 2; x += 20) K.add('seam', new THREE.BoxGeometry(0.8, B.H - 76, 0.4), mul(b, M4(x, 32 + (B.H - 76) / 2, 0.1)));
            { const g = new THREE.PlaneGeometry(len - 1, 130), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 90 + H(len + pf)); K.add(M.streak, g, mul(b, M4(0, B.H - 44 - 65, 0.3))); }
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
        // (bước dầm lệch, vài dầm gãy mất, dầm còn lại cong gập 2 đoạn — không xếp đều như hàng rào)
        // dầm thép chữ I từ A tới B: bụng mỏng + 2 cánh, trục cao theo phương đứng (xoay quanh trục dầm cho cánh nằm ngang)
        const iBeamAB = (A, B2, h, bw) => {
          const a = new THREE.Vector3(...A), b = new THREE.Vector3(...B2), d = b.clone().sub(a), len = d.length(); d.normalize();
          const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
          const up = new THREE.Vector3().crossVectors(side, d).normalize(), basis = new THREE.Matrix4().makeBasis(side, d, up).setPosition(a.add(b).multiplyScalar(0.5));
          K.add(M.rbar, new THREE.BoxGeometry(0.35, len, h - 0.6), basis);
          for (const s2 of [-1, 1]) K.add(M.rbar, new THREE.BoxGeometry(bw, len, 0.3), mul(basis, M4(0, 0, s2 * (h / 2 - 0.15))));
        };
        const rafter = (f, r, alongF, k) => {
          if (H(k + 9) < 0.22) return;
          const l1 = 8 + H(k + 1) * 12, l2 = 6 + H(k + 3) * 16, d1 = 0.15 + H(k + 2) * 0.35, d2 = d1 + 0.3 + H(k + 4) * 0.6;
          const e1 = alongF ? [f + Math.cos(d1) * l1, B.H - 6 - Math.sin(d1) * l1, r] : [f, B.H - 6 - Math.sin(d1) * l1, r + Math.cos(d1) * l1];
          const e2 = alongF ? [e1[0] + Math.cos(d2) * l2, e1[1] - Math.sin(d2) * l2, r + (H(k + 5) - 0.5) * 4] : [f + (H(k + 5) - 0.5) * 4, e1[1] - Math.sin(d2) * l2, e1[2] + Math.cos(d2) * l2];
          iBeamAB([f, B.H - 6, r], e1, 2.6, 2); iBeamAB(e1, e2, 2.2, 1.7);
        };
        for (let r = RR + 6, k = 0; r < B.r1 - 8; r += 14 + H(r) * 16, k++) rafter(RF, r, true, k * 7 + 1);
        for (let f = RF + 12, k = 0; f < B.f1 - 10; f += 14 + H(f + 3) * 16, k++) rafter(f, RR, false, k * 7 + 200);
        K.box('conc', RF + 14, 196, 60, 40, 7, 60, 0.2, 0, 0, -1.05);           // tấm mái gãy treo chéo
        // cốt thép thò ra 2 mép gãy của tấm mái treo
        for (let j = 0; j < 9; j++) { const z = 34 + j * 6.4, lo = H(j + 40) * 8; K.beam('steelRust', [RF + 14 + Math.cos(-1.05) * 18, 196 + Math.sin(-1.05) * 18 + 1, z], [RF + 14 + Math.cos(-1.05) * (22 + lo), 196 + Math.sin(-1.05) * (22 + lo) - H(j + 41) * 3, z + (H(j + 42) - 0.5) * 3], 0.35); }
        K.add(M.soot, new THREE.PlaneGeometry(150, 180), M4(B.f0 + WT + 0.6, 120, 0, 0, Math.PI / 2, 0));
        K.add(M.soot, new THREE.PlaneGeometry(160, 180), M4(-110, 120, B.r0 + WT + 0.6, 0, 0, 0));
        // -------- TƯỜNG VỠ quanh vùng thủng: còn trơ từng đoạn cao thấp, cao dần về chỗ giáp đoạn nguyên --------
        // Tường bê tông cốt thép che chắn bị nổ phá: mép gãy là 1 đường lởm chởm liền (mảng lớn sập sâu, răng cưa vừa, mẻ
        // nhỏ), không phải các khối hộp bậc thang; mặt gãy 2 phía lệch nhau + vát vào trong (bê tông vỡ theo mặt nghiêng),
        // lớp bê tông bảo vệ bong mảng quanh mép, 2 lưới cốt thép thò lên đúng theo mép gãy (thanh cong gập, thanh ngang
        // cụt), cục vỡ còn vắt trên mép, vết nứt toả xuống
        const brokenWall = (A, Bp, n, seed, alongR) => {
          const Ltot = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), dF = (Bp[0] - A[0]) / Ltot, dR = (Bp[1] - A[1]) / Ltot;
          const vn = (x, sd) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return H(sd + i) * (1 - s) + H(sd + i + 1) * s; };
          // cao độ mép gãy theo u: đường bao (thấp ở góc vỡ) + 3 tầng nhiễu + khấc chữ V
          const topAt = (u) => {
            const t = u / Ltot, env = Math.max(10, 80 * Math.pow(1 - t, 1.4) * (0.8 + vn(u / 40, seed + 900) * 0.4) + 6);
            let h = env * (0.62 + vn(u / 22, seed + 100) * 0.5) + (vn(u / 7, seed + 200) - 0.5) * 9 + (vn(u / 2.2, seed + 300) - 0.5) * 3.2;
            for (let k = 0; k < Math.ceil(Ltot / 30); k++) { const c = (k + H(seed + k * 7 + 400)) * 30, w = 3 + H(seed + k + 410) * 6, d = Math.max(0, 1 - Math.abs(u - c) / w); h -= d * d * (6 + H(seed + k + 420) * 12); }
            return Math.max(6, h);
          };
          const N = Math.ceil(Ltot / 1.4), sh = new THREE.Shape();
          sh.moveTo(0, 0); sh.lineTo(Ltot, 0);
          for (let i = N; i >= 0; i--) { const u = Ltot * i / N; sh.lineTo(u, topAt(u)); }
          sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: WT, bevelEnabled: false, curveSegments: 1 }), P2 = g.attributes.position, uv = g.attributes.uv;
          for (let i = 0; i < P2.count; i++) {
            const x = P2.getX(i), y = P2.getY(i), z = P2.getZ(i), tp = topAt(x);
            if (y > tp - 0.05 && y > 0.5) {
              const side = z > WT / 2 ? 1 : 0, kx = Math.round(x * 3);
              const dy = (vn(x / 1.8, seed + 500 + side * 50) - 0.5) * 4 - (side ? 0 : 1.2), inset = 0.3 + H(seed + kx + side * 999) * 1.6;
              P2.setXYZ(i, x, Math.max(1, y + dy), side ? z - inset : z + inset);
            }
            uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
          }
          g.translate(0, 0, -WT / 2); g.computeVertexNormals(); g.userData.uvTiled = true;
          K.add('conc', g, M4(A[0], 0, A[1], 0, Math.atan2(-dR, dF), 0));
          const at = (u, v) => [A[0] + dF * u - dR * v, A[1] + dR * u + dF * v];   // u dọc tường, v pháp tuyến
          const ry = Math.atan2(-dR, dF);
          // lớp bê tông bảo vệ bong mảng quanh mép gãy (2 mặt): mảng sẫm hơi lõm lộ đá dăm
          for (let u = 3; u < Ltot - 3; u += 7 + H(seed + u) * 9) for (const v of [-1, 1]) {
            if (H(seed + u * 3 + v) < 0.4) continue;
            const tp = topAt(u), hh = 3 + H(seed + u + v + 7) * 7, [pf, pr] = at(u, v * (WT / 2 + 0.05));
            K.box('concDark', pf, tp - hh / 2 - 0.6, pr, 3 + H(seed + u + 9) * 5, hh, 0.3, ry, 64, 0, (H(seed + u + 11) - 0.5) * 0.4);
          }
          // 2 lưới cốt thép (cách mặt 1.6 đv) thò lên theo mép gãy
          for (const v of [-3.6, 3.6]) for (let u = 1.2; u < Ltot - 0.5; u += 2.4) {
            const k = Math.round(u * 7 + v * 3 + seed), top = topAt(u) - 0.5, L1 = 2 + H(k + 1) * 9, [pf, pr] = at(u, v);
            if (H(k + 2) < 0.22) { const [qf, qr] = at(u + (H(k + 3) - 0.5) * 8, v + (v > 0 ? 1 : -1) * (4 + H(k + 4) * 5)); K.beam('steelRust', [pf, top - 1, pr], [pf, top + L1 * 0.5, pr], 0.35); K.beam('steelRust', [pf, top + L1 * 0.5, pr], [qf, top + L1 * 0.4 - H(k + 5) * 6, qr], 0.35); }
            else if (H(k + 2) < 0.75) K.beam('steelRust', [pf, top - 1, pr], [pf + (H(k + 6) - 0.5) * 1.6, top + L1, pr + (H(k + 7) - 0.5) * 1.6], 0.35);
            if (H(k + 8) < 0.3) { const [ef, er] = at(u + 1.2 + H(k + 9) * 2.4, v); K.beam('steelRust', [pf, top - 0.4, pr], [ef, top - 0.4 + (H(k + 10) - 0.5) * 2, er], 0.3); }
          }
          // cục vỡ còn vắt trên mép + vết nứt toả xuống từ khấc sâu
          for (let j = 0; j < Math.round(Ltot / 9); j++) {
            const u = H(seed + j + 700) * Ltot, tp = topAt(u), s = 1.4 + H(seed + j + 701) * 2.6, [pf, pr] = at(u, (H(seed + j + 702) - 0.5) * 4);
            K.add(H(seed + j + 703) < 0.6 ? 'conc' : 'concDark', new THREE.DodecahedronGeometry(s, 0), M4(pf, tp + s * 0.3, pr, H(j) * 3, H(j + 1) * 3, 0, 1.4, 0.7, 1.1));
          }
          for (let j = 0; j < Math.round(Ltot / 14); j++) {
            const u = H(seed + j + 800) * Ltot, tp = topAt(u), side = H(seed + j + 801) < 0.5 ? 1 : -1, [cf2, cr2] = at(u, side * (WT / 2 + 0.06));
            K.box('seam', cf2, tp - 9, cr2, 0.4, 16 + H(seed + j + 802) * 8, 0.12, ry, 0, 0, (H(seed + j + 803) - 0.5) * 0.7);
          }
          // va chạm: chia n đoạn, mỗi đoạn lấy đỉnh cao nhất
          for (let i = 0; i < n; i++) {
            const u0 = Ltot * i / n, u1 = Ltot * (i + 1) / n; let hm = 0; for (let u = u0; u <= u1; u += 1) hm = Math.max(hm, topAt(u));
            const [pf, pr] = at((u0 + u1) / 2, 0); K.solid(pf, pr, alongR ? WT / 2 : (u1 - u0) / 2, alongR ? (u1 - u0) / 2 : WT / 2, 0, hm);
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
          if (inner) K.add(inner, flipIn(new THREE.CylinderGeometry(R - 1, R - 1, h, 64, 1, true, -st - L, L), -1, 1), M4(cf, y + h / 2, cr));
        };
        const ring = (R, t, y, m, cut, seg) => K.add(m, new THREE.TorusGeometry(R, t, seg || 6, 64, TAU - cut), M4(cf, y, cr, Math.PI / 2, 0, gA + cut / 2));   // vòng nằm ngang thiếu cung `cut`
        K.cyl('concDark', cf, 9, cr, CR + 6, CR + 8, 6, 48);
        cyArc(CR, y0 + 11, CH, M.ss, gap, 'steelDark');
        // gân đứng + vành tăng cứng ngang của thùng lạnh, mặt bích nắp; mép rách: tấm vỏ bẻ quăn lật ra ngoài
        for (let k = 0; k < 48; k++) { const a = k * TAU / 48; if (Math.abs(daOf(a)) < gap / 2 + 0.02) continue; K.box(M.ss, ...P(a, CR + 1.2, y0 + 11 + CH / 2), 2.4, CH, 2, -a, 0); }
        for (const y of [40, 80, 120, 160, 200]) ring(CR + 1.5, 1.6, y0 + 11 + y, 'steelGray', gap + 0.05, 4);
        // mép rách: phần vỏ sát khe bị xé — tấm thép LIỀN với vỏ (cùng mặt trụ ở chân), càng ra mép tự do càng bị
        // sức ép lật cong ra ngoài; bề rộng tấm còn lại đổi theo độ cao (chỗ rách sâu, chỗ còn mảng rộng) -> mép tự do
        // lởm chởm, gợn sóng; 2 mặt thấy được (thép mỏng)
        {
          const LW = 0.34, ytop = y0 + 11 + CH;
          const nz = (y, sd) => { let v = 0; for (let k = 0; k < 4; k++) v += Math.sin(y * (0.021 + k * 0.037) + H(sd + k) * 6.28) * (0.5 / (k + 1)); return 0.5 + v * 0.55; };
          for (const s2 of [-1, 1]) {
            const te = gc + s2 * gap / 2, g = new THREE.CylinderGeometry(CR, CR, CH, 14, 60, true, s2 > 0 ? te - LW : te, LW), p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(x, z), yy = y + CH / 2 + y0 + 11;
              const t = Math.min(1, Math.abs(Math.atan2(Math.sin(th - te), Math.cos(th - te))) / LW);
              wy = Math.max(0.1, Math.min(1, nz(yy, 40 + s2 * 7) * 1.3 - 0.15 + (nz(yy * 4.3, 80 + s2) - 0.5) * 0.22));
              const u = t * wy, curl = (0.5 + nz(yy, 60 + s2) * 0.9) * 18 * u * u, tw = Math.min(1, yy / 40) * Math.min(1, (ytop - yy) / 30);
              const th2 = te - s2 * u * LW + s2 * curl / CR * 0.35 * tw, R2 = CR + curl * tw;
              p.setXYZ(i, Math.sin(th2) * R2, y + Math.sin(yy * 0.09 + s2) * 2.2 * u * u, Math.cos(th2) * R2);
            }
            g.computeVertexNormals(); g.userData.uvTiled = true;
            K.add(M.ssLip, g, M4(cf, y0 + 11 + CH / 2, cr));
          }
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
            const hTop = 20 + H(k + 31) * 40, hBot = -40 - H(k + 32) * 20, xc = TRi + TT / 2;
            const L = (x, y, z) => mul(base, M4(x, y, z));
            // vỏ thép: 4 tấm (trong / ngoài / 2 hông) gãy ở độ cao lệch nhau, mép trên răng cưa 3 mẩu
            const plate = (x, z, sx, sz, sd) => {
              const t1 = hTop + (H(sd) - 0.5) * 12, b1 = hBot + (H(sd + 1) - 0.5) * 10;
              K.add(M.coil, new THREE.BoxGeometry(sx, t1 - b1, sz), L(x, (t1 + b1) / 2, z));
              for (const [yy, sg] of [[t1, 1], [b1, -1]]) for (let j = 0; j < 3; j++) {
                const e = H(sd + j * 3 + (sg > 0 ? 5 : 9)) * 5, along = sx > sz, w = (along ? sx : sz) / 3, o = -(along ? sx : sz) / 2 + w * (j + 0.5);
                if (e > 0.6) K.add(M.coil, new THREE.BoxGeometry(along ? w * 0.9 : sx, e, along ? sz : w * 0.9), mul(L(along ? x + o : x, yy + sg * e / 2, along ? z : z + o), M4(0, 0, 0, along ? 0 : (H(sd + j + 20) - 0.5) * 0.3, 0, along ? (H(sd + j + 21) - 0.5) * 0.3 : 0)));
              }
            };
            plate(TRi + 0.8, 0, 1.6, TW, k * 40 + 1); plate(TRi + TT - 0.8, 0, 1.6, TW, k * 40 + 2);
            plate(xc, TW / 2 - 0.8, TT - 3.2, 1.6, k * 40 + 3); plate(xc, -TW / 2 + 0.8, TT - 3.2, 1.6, k * 40 + 4);
            // lõi: 5 bánh dây (đồng) xếp theo phương xuyến, khe cách điện tối giữa; mỗi bánh đứt ở độ cao khác nhau, tơi sợi
            const cw = TW - 3.4, sw = cw / 5;
            K.add(insM, new THREE.BoxGeometry(TT - 3.4, hTop - hBot - 4, cw), L(xc, (hTop + hBot) / 2, 0));
            for (let j = 0; j < 5; j++) {
              const z = -cw / 2 + sw * (j + 0.5), tj = hTop + (H(k * 9 + j + 50) - 0.3) * 8, bj = hBot - (H(k * 9 + j + 60) - 0.3) * 6;
              K.add(packM, new THREE.BoxGeometry(TT - 3.6, tj - bj, sw - 0.5), L(xc, (tj + bj) / 2, z));
              for (const [yy, sg] of [[tj, 1], [bj, -1]]) for (let q = 0; q < 3; q++) {
                const x0 = TRi + 2.6 + q * 2.6, l = 2 + H(k * 31 + j * 7 + q + (sg > 0 ? 0 : 3)) * 6, bend = (H(k * 17 + j + q) - 0.5) * 4;
                const A0 = new THREE.Vector3(x0, yy, z).applyMatrix4(base), B0 = new THREE.Vector3(x0 + bend, yy + sg * l, z + (H(k + j * 5 + q) - 0.5) * 3).applyMatrix4(base);
                K.beam(packM, [A0.x, A0.y, A0.z], [B0.x, B0.y, B0.z], 0.35);
              }
            }
            if (broken++ === 1) {                                              // mảng lưng gãy đổ xuống nền
              K.add(M.coil, new THREE.BoxGeometry(TT, 60, TW), M4(cf + Math.cos(a) * (TRo + 6), 14, cr + Math.sin(a) * (TRo + 6), 1.35, -a, 0.3));
              K.add(packM, new THREE.BoxGeometry(TT - 4.4, 0.8, TW - 4.4), M4(cf + Math.cos(a) * (TRo + 6), 14, cr + Math.sin(a) * (TRo + 6) + 0.2, 1.35, -a, 0.3));
            }
            continue;
          }
          K.add(M.coil, tfGeo, base);
          { const lab = 'TF-' + String(k + 1).padStart(2, '0'), tm = api.decalT('pw_tf' + k, api.texOf('pw_tf' + k, 256, 96, (g, w, h) => {
              g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(214,178,48,0.9)'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
              g.fillStyle = 'rgba(232,226,210,0.92)'; g.font = 'bold 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lab, w / 2, h / 2 + 2);
              if (api.ABANDONED) api.ageCanvas(g, w, h, k * 7 + 3, 0.7);
            }));
            for (const sd of [1, -1]) K.add(tm, new THREE.PlaneGeometry(14, 5.2), mul(base, M4(TRo - TT / 2 - 1, 8, sd * (TW / 2 + 0.55), 0, sd > 0 ? 0 : Math.PI, Math.PI / 2))); }
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
          // (4 mặt phẳng riêng: Lathe dùng chung đỉnh ở góc -> pháp tuyến bị làm mượt, vành trông phồng như phao nhựa)
          const t0 = gc + cut / 2, tl = TAU - cut;
          K.add(M.coil, new THREE.CylinderGeometry(R + w / 2, R + w / 2, h, 72, 1, true, t0, tl), M4(cf, y, cr));
          K.add(M.coil, flipIn(new THREE.CylinderGeometry(R - w / 2, R - w / 2, h, 72, 1, true, -t0 - tl, tl), -1, 1), M4(cf, y, cr));
          K.add(M.coil, new THREE.RingGeometry(R - w / 2, R + w / 2, 72, 1, t0 - Math.PI / 2, tl), M4(cf, y + h / 2, cr, -Math.PI / 2, 0, 0));
          K.add(M.coil, new THREE.RingGeometry(R - w / 2, R + w / 2, 72, 1, Math.PI / 2 - t0 - tl, tl), M4(cf, y - h / 2, cr, Math.PI / 2, 0, 0));
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
        for (const y of [vy + 79, vy - 79]) { K.cyl('steelGray', cf, y, cr, TRi + 2, TRi + 2, 6, 36); for (let k = 0; k < 18; k++) { const a = k * TAU / 18 + 0.35; K.cyl('steelDark', ...P(a, TRi - 0.4, y + 6), 0.7, 0.7, 2.2, 6); K.cyl('steelDark', ...P(a, TRi - 0.4, y + 6), 1.1, 1.1, 0.8, 6); }
          for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.1; K.box('steelGray', ...P(a, TRi * 0.5 + 0.6, y + 6.6), TRi + 1, 1.2, 2.4, -a, 0); } }
        // đường cấp (feeder): hộp chân không bọc giấy bạc vàng từ đỉnh vỏ xuống đầu cực từng cụm cuộn, thanh dẫn cụt
        for (let k = 0; k < 9; k++) { const a = gA + gap / 2 + 0.25 + k * (TAU - gap - 0.5) / 8;
          const c3 = new THREE.CatmullRomCurve3([P(a, CR - 6, y0 + 11 + CH + 2), P(a, CR - 6, vy + TH + 40), P(a, CR - 7, vy + TH + 28), P(a, CR - 13, vy + TH + 20), P(a, TRo - 4, vy + TH * 0.72)].map(v => new THREE.Vector3(...v)), false, 'centripetal');
          K.add(M.vv, new THREE.TubeGeometry(c3, 24, 2.4, 10, false));
          { const p0 = c3.getPoint(0), t0 = c3.getTangent(0); K.add(M.mli, new THREE.CylinderGeometry(2.6, 2.5, 3, 10, 1, true), new THREE.Matrix4().compose(p0.clone().addScaledVector(t0, -0.6), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t0), new THREE.Vector3(1, 1, 1)));
            for (let j = 0; j < 5; j++) { const aa = j * TAU / 5 + H(k + j), q = p0.clone().add(new THREE.Vector3(Math.cos(aa) * 2.4, 0, Math.sin(aa) * 2.4)); K.beam(M.mli, [q.x, q.y - 1.6, q.z], [q.x + Math.cos(aa) * (1 + H(k * 3 + j)), q.y + 1 + H(k + j * 7) * 2, q.z + Math.sin(aa) * (1 + H(k * 5 + j))], 0.5); } }
          for (const t of [0.12, 0.3, 0.5]) { const pt = c3.getPoint(t), tg = c3.getTangent(t); K.add('steelDark', new THREE.TorusGeometry(2.6, 0.35, 4, 12), new THREE.Matrix4().compose(pt, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg), new THREE.Vector3(1, 1, 1))); } }
        // buồng chân không hình xuyến (tiết diện chữ D cao) thủng 1 mảng quay ra phía rách
        // (TorusGeometry nằm ngang sau khi xoay x 90°: góc φ -> hướng (cos φ, sin φ) theo (f, r))
        const vgap = 1.5;
        K.add(M.vv, new THREE.TorusGeometry(VR, VT, 24, 72, TAU - vgap), M4(cf, vy, cr, Math.PI / 2, 0, gA + vgap / 2, 1, 1, 1.7));
        K.add(M.soot, new THREE.TorusGeometry(VR, VT + 0.8, 24, 36, 1.6), M4(cf, vy, cr, Math.PI / 2, 0, gA - 0.8, 1, 1, 1.7));
        // mặt trong ống xuyến (lộ ra qua 2 mặt cắt): ô tấm ốp xám tối ám muội — không còn đĩa đen tuyền phẳng
        K.add(M.vvIn, flipIn(new THREE.TorusGeometry(VR, VT - 1.2, 20, 72, TAU - vgap), 1, -1), M4(cf, vy, cr, Math.PI / 2, 0, gA + vgap / 2, 1, 1, 1.7));
        for (const s2 of [-1, 1]) {
          const ph = gA + s2 * vgap / 2, df = Math.cos(ph), dr = Math.sin(ph), ry = Math.atan2(df, dr) + Math.PI / 2;
          // mép cắt 2 lớp vỏ: vành thép dày, sứt mép
          K.add('steelDark', new THREE.RingGeometry(VT - 1.4, VT + 0.3, 24), M4(cf + df * VR, vy, cr + dr * VR, 0, ry, 0, 1, 1.7, 1));
        }
        // tấm chắn nhiệt buồng chân không: vỏ bạc mỏng bọc ngoài xuyến, hở rộng hơn mảng thủng (bị xé lật mép), đường ghép
        // tấm theo vòng; tấm chắn nhiệt thùng lạnh: lớp bạc lót mặt trong vỏ, ghép tấm đứng, rách theo mảng vỡ
        { const tg = vgap + 0.5;
          K.add(PM.tsh, new THREE.TorusGeometry(VR, VT + 2.4, 20, 72, TAU - tg), M4(cf, vy, cr, Math.PI / 2, 0, gA + tg / 2, 1, 1, 1.7));
          for (let k = 0; k < 24; k++) { const ph = gA + tg / 2 + (k + 0.5) * (TAU - tg) / 24; K.add('steelDark', new THREE.TorusGeometry(VT + 2.5, 0.25, 4, 24), M4(cf + Math.cos(ph) * VR, vy, cr + Math.sin(ph) * VR, 0, -ph, 0, 1, 1.7, 1)); }
          const st = gc + (gap + 0.3) / 2, Lc = TAU - gap - 0.3;
          K.add(PM.tsh, flipIn(new THREE.CylinderGeometry(CR - 4, CR - 4, CH - 24, 72, 1, true, -st - Lc, Lc), -1, 1), M4(cf, y0 + 11 + 12 + (CH - 24) / 2, cr));
          for (let k = 0; k <= 30; k++) { const th = st + k * Lc / 30; K.box('steelDark', cf + Math.sin(th) * (CR - 4.3), y0 + 23 + (CH - 24) / 2, cr + Math.cos(th) * (CR - 4.3), 0.5, CH - 24, 0.3, th, 0); } }
        // hộp chuyển hướng (divertor) 54 hộp dưới đáy lòng xuyến + tấm ốp vành ngoài xuyến
        for (let k = 0; k < 54; k++) { const a = k * TAU / 54; if (Math.abs(daOf(a)) < 0.7) continue; K.box(k % 3 ? 'steelDark' : M.cu, ...P(a, VR, vy - VT * 1.7 + 1), 6, 5, 5, -a, 0); }
        for (let k = 0; k < 40; k++) { const a = k * TAU / 40; if (Math.abs(daOf(a)) < 0.8) continue; for (const dy of [-18, 0, 18]) K.box(k % 2 ? 'steelGray' : M.vv, ...P(a, VR + VT + 0.8, vy + dy), 1.4, 15, 7, -a, 0); }
        // 18 cổng ngang (gia nhiệt / chẩn đoán / ống bơm) + 18 cổng dưới: ống hộp chữ nhật thép không gỉ từ vách xuyến xuyên
        // vỏ thùng lạnh, đầu ngoài là mặt bích dày + tấm đậy bắt hàng bu-lông nhỏ dày đặc, tai cẩu; vài cổng gắn hộp thiết bị
        // chẩn đoán / ống chân không + bó cáp; cổng phía rách đứt cụt, mép tôn quăn. 9 cổng trên: ống hộp đứng
        const port = (a, y, w, h, r0, r1, cut, sd) => {
          const len = r1 - r0;
          K.box(cut ? M.soot2 : M.ss, ...P(a, (r0 + r1) / 2, y), len, h, w, -a, 24);
          for (const d of [-1, 1]) K.box('steelGray', ...P(a, (r0 + r1) / 2, y + d * (h / 2 + 0.3)), len - 2, 0.6, 1.2, -a, 0);
          if (cut) {
            // đầu ống đứt cụt: lòng ống tối, mép vát sứt (vành tối mỏng)
            K.box('steelDark', ...P(a, r1 + 0.2, y), 0.6, h + 0.6, w + 0.6, -a, 0);
            K.add('steelDark', new THREE.PlaneGeometry(w - 1, h - 1), M4(...P(a, r1 - 1.5, y), 0, -a + Math.PI / 2, 0));
            return;
          }
          K.box(M.hatch, ...P(a, r1 + 0.9, y), 1.8, h + 4, w + 4, -a, 0);
          K.box('steelGray', ...P(a, r1 + 2.1, y), 0.8, h + 1, w + 1, -a, 0);
          const tf = -Math.sin(a), tr = Math.cos(a), [cf0, , cr0] = P(a, r1 + 1.9, y), bh = h / 2 + 1.1, bw = w / 2 + 1.1;
          for (let u = -bw; u <= bw + 0.01; u += 1.5) for (const v of [-bh, bh]) K.box('steelDark', cf0 + tf * u, y + v, cr0 + tr * u, 0.6, 0.5, 0.5, -a, 0);
          for (let v = -bh + 1.5; v < bh - 0.5; v += 1.5) for (const u of [-bw, bw]) K.box('steelDark', cf0 + tf * u, y + v, cr0 + tr * u, 0.6, 0.5, 0.5, -a, 0);
          for (const u of [-w / 4, w / 4]) K.box('steelDark', cf0 + tf * u, y + h / 2 + 2.6, cr0 + tr * u, 1, 1.6, 0.6, -a, 0);
          const q = H(sd + 20);
          if (q < 0.4) { K.box('steelGray', ...P(a, r1 + 5, y - h * 0.15), 5, h * 0.5, w * 0.6, -a, 24); K.box('louver', ...P(a, r1 + 7.6, y - h * 0.15), 0.3, h * 0.3, w * 0.4, -a, 8); }
          else if (q < 0.7) { K.add(M.ss, new THREE.CylinderGeometry(2.2, 2.2, 7, 12), M4(...P(a, r1 + 5.5, y + h * 0.1), 0, -a, Math.PI / 2)); K.add(M.hatch, new THREE.CylinderGeometry(3.2, 3.2, 0.8, 12), M4(...P(a, r1 + 9, y + h * 0.1), 0, -a, Math.PI / 2)); }
          if (q < 0.7) { const A = P(a, r1 + 4, y - h / 2), B2 = [A[0] + tf * (w / 2 + 3), 2, A[2] + tr * (w / 2 + 3)]; K.add(PM.cable, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(...A), new THREE.Vector3(A[0] + tf * 2, A[1] - 6, A[2] + tr * 2), new THREE.Vector3(...B2)]), 10, 0.7, 5, false)); }
        };
        for (let k = 0; k < 18; k++) {
          const a = k * TAU / 18 + 0.17 + TAU / 36, cut = Math.abs(daOf(a)) < gap / 2, R1 = cut ? VR + VT + 1.5 + H(k + 600) * 3 : CR;
          port(a, vy, 13, 18, VR + VT - 0.6, R1, cut, k * 31 + 500);
          K.add('steelDark', new THREE.PlaneGeometry(11, 15), M4(...P(a, VR + VT - 1.3, vy), 0, -a - Math.PI / 2, 0));
          if (!cut) port(a, vy - 52, 9, 11, VR + VT - 4, CR, false, k * 31 + 520);
          // ống cổng bị thổi đứt rơi xuống nền ngoài mảng vỡ
          if (cut && H(k + 640) < 0.6) { const [df2, , dr2] = P(a + (H(k + 641) - 0.5) * 0.4, VR + VT + 26 + H(k + 642) * 26, 0); K.box(M.vv, df2, 6.5 + H(k + 643) * 3, dr2, 26, 13, 15, -a + (H(k + 644) - 0.5) * 1.6, 24, (H(k + 645) - 0.5) * 0.5, 0.25 + H(k + 646) * 0.4); K.solid(df2, dr2, 12, 9, 0, 14); }
          // cổng trên: ống hộp đứng từ lưng xuyến lên, mặt bích + tấm đậy trên đỉnh
          if (k % 2 === 0 && Math.abs(daOf(a)) > 0.5) {
            const [uf, , ur] = P(a, VR + 6, 0), yb = vy + 33, yt = vy + CH - 110;
            K.box(M.ss, uf, (yb + yt) / 2, ur, 8, yt - yb, 10, -a, 24);
            K.box(M.hatch, uf, yt + 0.8, ur, 11, 1.6, 13, -a, 0); K.box('steelGray', uf, yt + 1.9, ur, 8.6, 0.6, 10.6, -a, 0);
            for (let b = 0; b < 16; b++) { const t = b / 16 * TAU, u = Math.cos(t) * 4.8, v = Math.sin(t) * 5.8; K.box('steelDark', uf + Math.cos(a) * u - Math.sin(a) * v, yt + 1.8, ur + Math.sin(a) * u + Math.cos(a) * v, 0.5, 0.6, 0.5, -a, 0); }
          }
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
        // thang leo vỏ thùng lạnh: bậc + 2 thanh dọc, tai giằng bắt vào vỏ mỗi ~4 m
        { const a = gA + Math.PI, y1 = y0 + CH + 10, tf = -Math.sin(a), tr = Math.cos(a);
          for (let y = 12; y < y1; y += 2.4) K.box('steelGray', ...P(a, CR + 3, y), 0.3, 0.3, 3, -a, 0);
          for (const d of [-1.5, 1.5]) { const [sf, , sr] = P(a, CR + 3, 0); K.box('steelGray', sf + tf * d, (12 + y1) / 2 - 1, sr + tr * d, 0.4, y1 - 10, 0.4, -a, 0);
            for (let y = 20; y < y1; y += 32) { const [bf, , br] = P(a, CR + 1.6, y); K.box('steelDark', bf + tf * d, y, br + tr * d, 2.8, 0.4, 0.4, -a, 0); } } }
        // ống công nghệ trên vách trong nhà lò (tường sau + tường trái): bó ống ngang bọc nhôm / sơn xanh / vàng trên giá
        // công-xôn, ống đứng; máng cáp hở chất bó cáp đen; 3 cầu ống vắt từ tường sau sang mép đỉnh thùng lạnh
        {
          const wf = B.f0 + WT, wr = B.r0 + WT;
          const run = (alongR, fixed, a0, a1, y, list) => {
            list.forEach(([m, rad], i) => { const off = 3 + i * 4.6; pipe(m, alongR ? [fixed + off, y, a0] : [a0, y, fixed + off], alongR ? [fixed + off, y, a1] : [a1, y, fixed + off], rad, 10); });
            const dep = 3 + list.length * 4.6;
            for (let a = a0 + 6; a < a1; a += 18) { K.box('steelGray', alongR ? fixed + dep / 2 : a, y - 2.6, alongR ? a : fixed + dep / 2, alongR ? dep : 0.8, 0.8, alongR ? 0.8 : dep, 0, 0); K.beam('steelGray', alongR ? [fixed + 0.4, y - 9, a] : [a, y - 9, fixed + 0.4], alongR ? [fixed + dep - 1, y - 2.8, a] : [a, y - 2.8, fixed + dep - 1], 0.5); }
          };
          run(true, wf, B.r0 + WT + 4, B.r1 - WT - 4, 46, [[M.alu, 1.8], [PM.pgreen, 1.4], [M.alu, 1.2], [M.yel, 0.8]]);
          run(true, wf, B.r0 + WT + 4, B.r1 - WT - 4, 132, [[M.alu, 2.4], [M.alu, 2.4]]);
          run(false, wr, B.f0 + WT + 4, SF, 58, [[PM.pgreen, 1.6], [M.alu, 1.6], [M.alu, 1]]);
          for (const r of [-104, -62, 30]) for (const [i, m] of [[0, M.alu], [1, PM.pgreen]]) pipe(m, [wf + 3 + i * 4.6, 10, r + i * 3], [wf + 3 + i * 4.6, 150, r + i * 3], 1.4, 10);
          // máng cáp (đáy + 2 thành) + bó cáp
          { const tf = wf + 5, r0 = B.r0 + WT + 6, r1 = B.r1 - WT - 6, L = r1 - r0, rc2 = (r0 + r1) / 2, ty = 76;
            K.box('steelGray', tf, ty, rc2, 6, 0.4, L, 0, 0); for (const d of [-3, 3]) K.box('steelGray', tf + d, ty + 1.2, rc2, 0.3, 2.4, L, 0, 0);
            for (let j = 0; j < 4; j++) pipe(PM.cable, [tf - 1.8 + j * 1.2, ty + 0.8, r0], [tf - 1.8 + j * 1.2, ty + 0.8 + (j % 2) * 0.5, r1], 0.55, 6);
            for (let r = r0 + 8; r < r1; r += 22) K.beam('steelGray', [wf + 0.4, ty - 8, r], [tf + 2.6, ty - 0.3, r], 0.5); }
          // cầu ống sang đỉnh thùng lạnh (dầm giàn + 3 ống), chỗ gối lên vành đỉnh vỏ
          for (const a of [gA + Math.PI - 0.5, gA + Math.PI, gA + Math.PI + 0.5]) {
            const E = P(a, CR + 2, y0 + CH + 6), W2 = [wf, y0 + CH + 6, E[2]];
            if (E[0] - wf < 8) continue;
            for (const [o, m, rad] of [[-2.6, M.alu, 1.4], [0, PM.pgreen, 1.2], [2.6, M.alu, 1.4]]) pipe(m, [W2[0], W2[1] + 2, W2[2] + o], [E[0], E[1] + 2, E[2] + o], rad, 10);
            for (const d of [-4.4, 4.4]) K.beam('steelGray', [W2[0], W2[1], W2[2] + d], [E[0], E[1], E[2] + d], 0.8);
            for (let t = 0.1; t < 1; t += 0.2) { const pf2 = W2[0] + (E[0] - W2[0]) * t, pr2 = W2[2] + (E[2] - W2[2]) * t; K.box('steelGray', pf2, W2[1], pr2, 0.6, 0.6, 9.4, 0, 0); }
          }
        }
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
        for (const d of [-1.5, 1.5]) { K.box('steelGray', B.f1 - 6 + d, B.H / 2 + 2, B.r0 - 1.6, 0.4, B.H - 4, 0.4, 0, 0); for (let y = 16; y < B.H; y += 32) K.box('steelDark', B.f1 - 6 + d, y, B.r0 - 0.8, 0.4, 0.4, 1.8, 0, 0); }
        for (const d of [-2.3, 0, 2.3]) K.box('steelGray', B.f1 - 6 + d, (10 + B.H) / 2, B.r0 - 4.5, 0.25, B.H - 12, 0.25, 0, 0);
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
        // vách tôn cao 37 m: mạch chồng mí giữa các lớp tôn (thanh xà gồ ốp ngoài), nẹp góc bao 4 cạnh đứng
        for (const k of Object.keys(F)) for (let y = 70; y < B.H - 40; y += 56) K.add('steelGray', new THREE.BoxGeometry(F[k].len, 0.6, 0.4), mul(F[k].m, M4(0, y, 0.2)));
        for (const [cf2, cr2] of [[B.f0, B.r0], [B.f0, B.r1], [B.f1, B.r0], [B.f1, B.r1]]) K.box('steelGray', cf2, 28 + (B.H - 28) / 2, cr2, 3.4, B.H - 28, 3.4, 0, 24);
        // dải kính cửa mái có khung đố, từng ô riêng (vỡ / mất vài ô)
        windowBand(F, Object.keys(F), B.H - 22, 14, 8, 16);
        band(B, B.H + 2, 4, 0.8, 'steelGray');
        // máng nước mép mái + ống xối đứng 2 hồi dọc (bát ống ôm vách, chân ống loe), 1 ống tuột bát chúc nghiêng
        for (const k of ['sideP', 'sideN']) {
          const { m: b, len } = F[k];
          K.add('steelGray', new THREE.BoxGeometry(len + 2, 2.6, 2.6), mul(b, M4(0, B.H - 1.4, 2)));
          for (const [x, j] of [[-68, 0], [28, 1]]) {
            const loose = k === 'sideP' && j === 1;
            K.add('steelGray', new THREE.CylinderGeometry(1.1, 1.1, B.H - 30, 8), mul(b, loose ? M4(x + 6, 28 + (B.H - 30) / 2 - 6, 4, 0, 0, 0.06) : M4(x, 28 + (B.H - 30) / 2, 3.4)));
            K.add('steelGray', new THREE.CylinderGeometry(1.1, 1.8, 3, 8), mul(b, M4(x, 29.5, 3.4)));
            for (let y = 60; y < B.H - 10; y += 48) K.add('steelDark', new THREE.BoxGeometry(3, 0.6, 2.4), mul(b, M4(x, y, 1.6)));
          }
        }
        streaks(F, B.H - 2, 150);
        roofGrime(fc, B.H + 4, rc, W + 1, D + 1);
        // mảng tôn bị sức ép thổi bung: lỗ tối lộ xà gồ vách, mép tôn rách, 1 tấm bong treo lật ra ngoài, 1 tấm rơi xuống nền
        const blown = (k, x, y, w, h, s0) => {
          const b = F[k].m;
          K.add('void', new THREE.PlaneGeometry(w, h), mul(b, M4(x, y, 0.06)));
          for (let yy = y - h / 2 + 5; yy < y + h / 2; yy += 12) K.add('steelDark', new THREE.BoxGeometry(w + 2, 1.2, 0.8), mul(b, M4(x, yy, 0.3)));
          for (let j = 0; j < 6; j++) { const u = (H(s0 + j) - 0.5) * w, top = j % 2; K.add('corrGray', new THREE.BoxGeometry(2 + H(s0 + j + 9) * 4, 2 + H(s0 + j + 5) * 3, 0.3), mul(b, M4(x + u, y + (top ? h / 2 : -h / 2), 0.9, (top ? -1 : 1) * (0.4 + H(s0 + j + 3) * 0.6), 0, (H(s0 + j + 7) - 0.5) * 0.8))); }
          K.add('corrGray', new THREE.BoxGeometry(w * 0.85, h * 0.55, 0.4), mul(b, mul(M4(x - w * 0.05, y + h / 2 - 1, 0.8), mul(M4(0, 0, 0, -0.5, 0, 0.12), M4(0, -h * 0.28, 0)))));
          K.add('corrGray', new THREE.BoxGeometry(w * 0.8, 0.4, h * 0.45), mul(b, M4(x + w * 0.3, 0.6, 10 + H(s0 + 20) * 8, 0.05, 0.3, 0)));
        };
        blown('sideP', -40, 140, 16, 44, 700); blown('front', 52, 190, 14, 36, 720);
        // cửa nâng: khung thép + ray dẫn 2 bên + hộp cuốn trên, lá cửa tôn ngang, mép dưới nâng hé 1 đoạn
        const fr = F.front.m;
        K.add('steelDark', new THREE.BoxGeometry(98, 6, 4), mul(fr, M4(-6, 214, 2)));
        for (const s of [-1, 1]) K.add('steelDark', new THREE.BoxGeometry(5, 214, 4), mul(fr, M4(-6 + s * 49, 107, 2)));
        K.add('shutter', new THREE.BoxGeometry(92, 186, 1.2), mul(fr, M4(-6, 118, 1)));
        for (const s of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(3, 190, 2.4), mul(fr, M4(-6 + s * 45.5, 118, 2.2)));
        K.add('steelGray', new THREE.BoxGeometry(96, 10, 6), mul(fr, M4(-6, 206, 4)));
        K.add('steelDark', new THREE.BoxGeometry(92, 1.6, 2.2), mul(fr, M4(-6, 25.6, 1.4)));
        K.add('void', new THREE.PlaneGeometry(92, 24), mul(fr, M4(-6, 12, 0.2)));
        // giàn cầu trục ngoài cửa (sơn vàng bạc màu, gỉ): dầm công-xôn + dầm ngang chữ I trên 2 cột thép H có giằng góc;
        // xe con treo dưới cánh dầm ngang, tang cáp, 2 sợi cáp thả móc cẩu
        const cy = 232, crR = rc - 6, cf3 = B.f1 + 50;
        ibeam(M.yel, B.f1 + 26, cy, crR, 52, 8, 5);
        ibeam(M.yel, cf3, cy, crR, 112, 9, 6, true);
        for (const s of [-1, 1]) {
          const r2 = crR + s * 52;
          for (const d of [-1.8, 1.8]) K.box('steelGray', cf3, cy / 2 - 2, r2 + d, 4, cy - 4, 0.6, 0, 24);
          K.box('steelGray', cf3, cy / 2 - 2, r2, 0.6, cy - 4, 3, 0, 24);
          K.cbox('concDark', cf3, 1.5, r2, 9, 3, 9, 0.4);
          K.beam('steelGray', [cf3, cy - 30, r2 - s * 1.5], [cf3, cy - 5, r2 - s * 22], 1.2);
          K.solid(cf3, r2, 2.5, 2.5, 0, cy);
          K.box('hazard', cf3, cy, crR + s * 55.5, 6.2, 9.2, 1, 0, 16);
        }
        { const tr2 = crR + 18, ty = cy - 4.5 - 3.5;
          K.box(M.yel, cf3, ty, tr2, 12, 6, 10, 0, 24);
          K.add('steelDark', new THREE.CylinderGeometry(2.2, 2.2, 8, 12), M4(cf3, ty - 4, tr2, Math.PI / 2, 0, 0));
          const hy = 158;
          for (const d of [-1.2, 1.2]) K.beam('steelDark', [cf3 + d, ty - 6, tr2], [cf3 + d * 0.8, hy + 3, tr2], 0.25);
          K.box(M.yel, cf3, hy, tr2, 3.4, 6, 2.6, 0.3, 24);
          K.add('steelDark', new THREE.TorusGeometry(1.4, 0.4, 6, 12, Math.PI * 1.4), M4(cf3, hy - 4.6, tr2, 0, 0.3, Math.PI * 0.8)); }
        K.plane(decal('fu_ah', signTex('fu_ah', ['ASSEMBLY HALL', 'OVERHEAD CRANE — 1500 t'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), B.f1 + 3.2, 250, rc - 6, 80, 15);
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
        streaks(F, B.H, 90);
        roofGrime(fc, B.H + 4, rc, W + 2, D + 2);
        for (const [hf, hr] of [[-200, -290], [-200, -220], [-140, -250]]) { K.cbox('steelWhite', hf, B.H + 10, hr, 26, 14, 30, 0.4); roofFan(hf, B.H + 17, hr, 7); }
        const fr = F.front.m;
        K.add(M.hatch, new THREE.BoxGeometry(12, 22, 1), mul(fr, M4(-40, 11, 0.6))); K.add('hazard', new THREE.BoxGeometry(14, 1.4, 1.2), mul(fr, M4(-40, 23, 0.6)));
        K.add(M.hatch, new THREE.BoxGeometry(40, 50, 1.6), mul(fr, M4(30, 25, 0.8)));
        K.plane(triM, B.f1 + 3.2, 34, rc - 40, 16, 8);
        K.plane(decal('fu_hc', signTex('fu_hc', ['TRITIUM PLANT & HOT CELL', 'RADIOLOGICAL ZONE 3'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#a3221a' })), B.f1 + 3.2, 130, rc, 70, 13);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + 18);
        // ống khói thép không gỉ: bệ, chân loe, 2 sàn, đèn báo bay, giằng 3 chân dây néo
        stack(K, STK.f, STK.r, 10, 8, 430, M.ss);
        K.cbox('concDark', STK.f, 6, STK.r, 34, 12, 34, 0.8);
        // ống khói thép mảnh (Ø 2 m, cao 54 m) không tự đứng: tháp giàn thép 3 chân bao quanh tới 84% chiều cao — chân
        // thuôn dần, giằng ngang + giằng chéo chữ X từng khoang, thanh chống ngang níu thân ống; móng bê tông dưới mỗi chân
        {
          const TH = 360, lv = [], NL = 10, legA = [0.55, 0.55 + TAU / 3, 0.55 + 2 * TAU / 3];
          for (let i = 0; i <= NL; i++) { const y = 2 + (TH - 2) * i / NL, R = 30 - 16 * i / NL; lv.push(legA.map(a => [STK.f + Math.cos(a) * R, y, STK.r + Math.sin(a) * R])); }
          for (let i = 0; i < NL; i++) for (let k = 0; k < 3; k++) {
            const A = lv[i][k], B2 = lv[i + 1][k], C = lv[i][(k + 1) % 3], D2 = lv[i + 1][(k + 1) % 3];
            K.beam('steelGray', A, B2, 2.2);
            K.beam('steelGray', A, D2, 0.9); K.beam('steelGray', C, B2, 0.9);
            K.beam('steelGray', B2, D2, 1.2);
            const rs = 9 - (i + 1) / NL * 1.6, a = legA[k];
            K.beam('steelDark', B2, [STK.f + Math.cos(a) * rs, B2[1], STK.r + Math.sin(a) * rs], 0.8);
          }
          for (const a of legA) { const p = [STK.f + Math.cos(a) * 30, 0, STK.r + Math.sin(a) * 30]; K.cbox('concDark', p[0], 2, p[2], 7, 4, 7, 0.5); K.solid(p[0], p[2], 2, 2, 0, TH); }
          // lan can 2 sàn công tác (sàn vòng của stack())
          for (const yy of [430 * 0.45, 430 * 0.85]) {
            const R = 8 + 2 * (1 - yy / 430) + 3.4;
            for (let k = 0; k < 16; k++) { const a = k * TAU / 16; K.box('steelGray', STK.f + Math.cos(a) * R, yy + 2.6, STK.r + Math.sin(a) * R, 0.35, 4.4, 0.35, 0, 0); }
            K.add('steelGray', new THREE.TorusGeometry(R, 0.22, 4, 32), M4(STK.f, yy + 4.8, STK.r, Math.PI / 2, 0, 0));
            K.add('steelGray', new THREE.TorusGeometry(R, 0.16, 4, 32), M4(STK.f, yy + 2.6, STK.r, Math.PI / 2, 0, 0));
          }
          // muội thải ám đầu ống: đậm sát miệng, chảy loang xuống
          { const g = new THREE.CylinderGeometry(8.35, 8.55, 70, 18, 1, true), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2); K.add(M.streak, g, M4(STK.f, 434 - 35, STK.r)); }
        }
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
        streaks(F, Hh, 60);
        roofGrime(fc, Hh + 3, rc, W + 1, D + 1);
        for (const k of ['front', 'sideP']) for (let x = -F[k].len / 2 + 16; x < F[k].len / 2 - 10; x += 26) K.add('louver', new THREE.BoxGeometry(12, 10, 0.6), mul(F[k].m, M4(x, 70, 0.4)));
        for (let k = 0; k < 4; k++) roofFan(B.f0 + 24 + k * 32, Hh + 3, rc, 8);
        K.add('shutter', new THREE.BoxGeometry(30, 34, 1), mul(F.front.m, M4(-20, 17, 0.6)));
        K.plane(decal('fu_cp', signTex('fu_cp', ['CRYOPLANT — LIQUID HELIUM 4.5 K', 'DANGER — ASPHYXIATION HAZARD'], { w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), B.f1 + 3.2, 88, rc + 10, 60, 11);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, Hh + 8);
        // bồn heli khí (nằm ngang trên yên đỡ) dọc đường nội bộ
        // bồn chứa heli khí áp lực (nằm ngang): vỏ thép sơn trắng phai, đáy elip 2 đầu, mối hàn vòng, yên đỡ thép ôm đáy bồn
        // trên trụ bê tông, cửa người chui ở đầu bồn, cụm ống + van an toàn trên lưng, ống xả đáy nối ống góp chạy sát đất
        const saddle = (f, r, burnt) => {
          K.cbox('concDark', f, 2.5, r, 5, 5, 17, 0.4);
          K.add(burnt ? M.soot2 : 'steelDark', new THREE.CylinderGeometry(10.25, 10.25, 2.6, 16, 1, true, Math.PI * 7 / 6, Math.PI * 2 / 3), M4(f, 16, r, 0, 0, Math.PI / 2));
          K.box(burnt ? M.soot2 : 'steelDark', f, 6.4, r, 2.4, 2.8, 15, 0, 24);
          for (const s of [-1, 1]) K.box('steelDark', f, 5.2, r + s * 6, 3.2, 0.8, 1.2, 0, 0);
        };
        for (let k = 0; k < 3; k++) {
          const r = -444 + k * 30, f = -60;
          for (const s of [-1, 1]) saddle(f + s * 20, r, k === 1);
          if (k === 1) {
            // bồn trúng tên lửa: vỏ xé đôi giữa thân, 2 nửa bật lệch (1 nửa trượt khỏi yên đỡ, chúc xuống nền), miệng rách
            // tua tủa tấm vỏ lật ngược ra ngoài; vỏ ngoài cháy sém, mặt trong thép tối (2 lớp -> không nhìn xuyên); mảnh vỏ văng
            for (const s of [-1, 1]) {
              const base = M4(f + s * 17, s > 0 ? 10.5 : 16, r + s * 2.5, s > 0 ? 0.14 : 0, s * 0.22, Math.PI / 2 + (s > 0 ? -0.2 : 0.04));
              K.add(M.soot2, new THREE.CylinderGeometry(10, 10, 26, 20, 1, true, Math.PI * 0.75, Math.PI * 1.5), base);
              K.add('steelDark', flipIn(new THREE.CylinderGeometry(9.7, 9.7, 26, 20, 1, true, Math.PI * 0.75, Math.PI * 1.5), 1, -1), base);
              K.add(M.soot2, new THREE.SphereGeometry(10, 16, 10), mul(base, M4(0, -s * 13, 0, 0, 0, 0, 1, 0.35, 1)));
              for (let j = 0; j < 7; j++) {
                const th = Math.PI * 0.85 + j * Math.PI * 1.3 / 6, ln = 4 + H(j * 3 + s + 80) * 6;
                K.add(M.soot2, new THREE.BoxGeometry(4 + H(j + s + 81) * 2, ln, 0.5), mul(base, mul(M4(Math.sin(th) * 10, s * 13, Math.cos(th) * 10, 0, th, 0), mul(M4(0, 0, 0, s * (0.5 + H(j + s + 82) * 0.7), 0, (H(j + 83) - 0.5) * 0.4), M4(0, s * ln / 2, 0)))));
              }
            }
            for (let j = 0; j < 9; j++) { const a = H(j + 90) * TAU, d = 22 + H(j + 91) * 26; K.box(M.soot2, f + Math.cos(a) * d, 0.8, r + Math.sin(a) * d, 3 + H(j + 92) * 5, 0.5, 2 + H(j + 93) * 4, H(j + 94) * 3, 24, (H(j + 95) - 0.5) * 0.5, (H(j + 96) - 0.5) * 0.5); }
            K.add(M.soot, new THREE.CircleGeometry(30, 18), M4(f, 1.2, r, -Math.PI / 2, 0, 0));
            K.solid(f, r, 34, 10, 0, 24); continue;
          }
          K.add(M.paintW, new THREE.CylinderGeometry(10, 10, 60, 24), M4(f, 16, r, 0, 0, Math.PI / 2));
          for (const s of [-1, 1]) K.add(M.paintW, new THREE.SphereGeometry(10, 20, 12), M4(f + s * 30, 16, r, 0, 0, 0, 0.35, 1, 1));
          for (const x of [-30, -15, 0, 15, 30]) K.add('steelGray', new THREE.TorusGeometry(10.05, 0.18, 4, 40), M4(f + x, 16, r, 0, Math.PI / 2, 0));
          // vệt bẩn mưa chảy từ lưng bồn xuống 2 bên sườn
          // (UV: u dọc trục bồn, v theo góc tính từ đỉnh lưng — đỉnh v = 1 -> vệt chảy vòng xuống 2 sườn)
          { const g = new THREE.CylinderGeometry(10.12, 10.12, 58, 24, 1, true), uv = g.attributes.uv, p = g.attributes.position;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getY(i) / 58 + 0.5) * 4 + k * 0.37, 1 - Math.acos(Math.max(-1, Math.min(1, p.getX(i) / 10.12))) / Math.PI);
            K.add(M.streak, g, M4(f, 16, r, 0, 0, Math.PI / 2)); }
          K.add(M.hatch, new THREE.CylinderGeometry(2.6, 2.6, 0.8, 16), M4(f - 33.6, 16, r, 0, 0, Math.PI / 2));
          for (let b = 0; b < 8; b++) { const t = b * TAU / 8; K.box('steelDark', f - 34.1, 16 + Math.sin(t) * 2.2, r + Math.cos(t) * 2.2, 0.6, 0.5, 0.5, 0, 0); }
          for (const x of [-12, 8]) { K.cyl('steelGray', f + x, 25.6, r, 0.9, 0.9, 3, 10); K.cyl('steelDark', f + x, 28.6, r, 1.6, 1.6, 0.6, 12); }
          K.cyl('steelGray', f + 8, 29.2, r, 0.6, 0.9, 2.6, 8); K.cyl('steelDark', f + 8, 31.8, r, 1, 0.6, 1, 8);
          K.cyl('steelGray', f, 2.4, r, 0.7, 0.7, 4, 8); K.box('steelDark', f, 4.2, r, 2, 1.6, 2, 0, 0);
          K.solid(f, r, 34, 10, 0, 27);
        }
        // bồn nitơ lỏng đứng (vỏ chân không 2 lớp) + giàn hóa hơi bằng không khí
        vTank(K, -82, -326, 10, 96, 0);
        K.plane(decal('fu_ln2', signTex('fu_ln2', ['LIQUID NITROGEN', '-196 °C'], { w: 512, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), -71.6, 30, -326, 12, 4.5);
        K.solid(-82, -326, 12, 12, 0, 104);
        // giàn hóa hơi bằng không khí: 2 hàng ống nhôm cánh sao (lõi + 8 cánh mỏng), ống góp trên / dưới, khung thép đế;
        // bỏ hoang: nhôm xỉn, ố nước chảy ở chân
        for (const fx of [-52.5, -47.5]) {
          for (let k = 0; k < 5; k++) {
            const z = -331 + k * 3.6;
            K.cyl(M.alu, fx, 4, z, 0.4, 0.4, 36, 8);
            for (let j = 0; j < 8; j++) { const a = j * TAU / 8; K.box(M.alu, fx + Math.cos(a) * 0.95, 22, z + Math.sin(a) * 0.95, 1.1, 36, 0.12, -a, 0); }
          }
          for (const y of [4.6, 40.6]) pipe(M.alu, [fx, y, -333.5], [fx, y, -314.5], 0.7, 10);
          for (const z of [-334, -314]) K.box('steelGray', fx, 2, z, 1, 4, 1, 0, 0);
        }
        K.cbox('concDark', -50, 0.6, -324, 12, 1.2, 24, 0.3);
        pipe(M.alu, [-52.5, 40.6, -314.5], [-52.5, 40.6, -312], 0.7); pipe(M.alu, [-47.5, 4.6, -333.5], [-47.5, 4.6, -336], 0.7);
        K.add(M.streak, new THREE.PlaneGeometry(22, 14), M4(-55.6, 7, -324, 0, -Math.PI / 2, 0));
        K.solid(-50, -324, 5, 12, 0, 42);
        // vệt bẩn mưa chảy trên vỏ bồn nitơ lỏng (nửa trên)
        { const g = new THREE.CylinderGeometry(10.15, 10.15, 60, 24, 1, true), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3); K.add(M.streak, g, M4(-82, 97.6 - 30, -326)); }
        // ống góp heli chạy sát đất dưới bụng bồn (gối ống thấp) sang bồn nitơ / nhà máy lạnh
        pipe('steelGray', [-60, 2.4, -450], [-60, 2.4, -340], 1.2); pipe('steelGray', [-60, 2.4, -340], [-82, 2.4, -326], 1.2);
        for (let r = -446; r < -340; r += 18) K.box('steelDark', -60, 0.9, r, 3, 1.8, 1, 0, 0);
      }

      // ===================================================================================================
      // 5. NHÀ BIẾN ĐỔI ĐIỆN CẤP NAM CHÂM + thanh dẫn kín vắt qua đường sang nhà lò
      // ===================================================================================================
      {
        const B = PC, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('conc', fc, B.H / 2, rc, W, B.H, D, 1);
        pilasters(F, 0, B.H, 26, 2.2);
        band(B, B.H + 2, 4, 1, 'conc');
        streaks(F, B.H, 54);
        roofGrime(fc, B.H + 4, rc, W + 2, D + 2);
        for (const k of ['front', 'back']) for (let x = -F[k].len / 2 + 14; x < F[k].len / 2 - 8; x += 26) K.add('louver', new THREE.BoxGeometry(14, 22, 0.6), mul(F[k].m, M4(x, 40, 0.4)));
        for (let k = 0; k < 8; k++) roofFan(fc + (k % 2 ? 22 : -22), B.H + 4, B.r0 + 22 + Math.floor(k / 2) * 60, 7);
        K.add('shutter', new THREE.BoxGeometry(24, 30, 1), mul(F.front.m, M4(60, 15, 0.6)));
        label('pc', ['MAGNET POWER CONVERSION', 'SUPERCONDUCTING COILS — 68 kA DC'], B.f1 + 3.2, 66, rc - 30, 80, 15, Math.PI / 2, { fg: '#a3221a' });
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + 10);
        // 2 tuyến thanh dẫn kín (ống nhôm bọc) trên giàn khung vắt qua đường nội bộ, chui vào tường nhà lò
        const by = 60;
        for (const r of [-100, -128]) {
          for (const o of [-3, 3]) pipe(M.alu, [B.f0, by + o, r], [TK.f1, by + o, r], 2.2, 10);
          K.box('steelGray', B.f0 + 0.5, by, r, 1, 14, 10, 0, 24); K.box('steelGray', TK.f1 + 0.5, by, r, 1, 14, 10, 0, 24);
        }
        // 2 khung cổng đỡ đặt 2 bên lề đường (không chân cột giữa lòng đường): cột thép H trên móng, dầm ngang, giằng góc,
        // đai kẹp ôm thanh dẫn tại dầm
        for (const pf of [RING - 15, RING + 15]) {
          for (const s of [-1, 1]) {
            const pr = -114 + s * 24;
            for (const d of [-1.4, 1.4]) K.box('steelGray', pf, (by - 6) / 2, pr + d, 3, by - 6, 0.5, 0, 24);
            K.box('steelGray', pf, (by - 6) / 2, pr, 0.5, by - 6, 2.4, 0, 24);
            K.cbox('concDark', pf, 1.2, pr, 6, 2.4, 6, 0.3);
            K.beam('steelGray', [pf, by - 18, pr - s * 1.4], [pf, by - 8, pr - s * 10], 0.8);
            K.solid(pf, pr, 2, 2, 0, by);
          }
          ibeam('steelGray', pf, by - 7.2, -114, 54, 2.6, 3, true);
          for (const r of [-100, -128]) for (const o of [-3, 3]) K.add('steelDark', new THREE.TorusGeometry(2.5, 0.35, 4, 12), M4(pf, by + o, r, 0, Math.PI / 2, 0));
        }
      }

      // ===================================================================================================
      // 6. NHÀ TUA-BIN + 2 MÁY BIẾN ÁP TĂNG ÁP
      // ===================================================================================================
      {
        const B = TB, fc = (B.f0 + B.f1) / 2, rc = (B.r0 + B.r1) / 2, W = B.f1 - B.f0, D = B.r1 - B.r0, F = faces(B);
        K.cbox('conc', fc, 12, rc, W + 2, 24, D + 2, 0.6);
        K.box('corrGray', fc, 24 + (B.H - 24) / 2, rc, W, B.H - 24, D);
        pilasters(F, 24, B.H, 26, 2.2, 'steelGray');
        streaks(F, B.H, 96);
        // dải kính cao dưới mái: khung đố, từng ô kính (rạn / vỡ / mất), bậu kính hứng bẩn
        windowBand(F, Object.keys(F), B.H - 18, 10, 6.5, 20);
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
        // (biển treo ra trước mặt trụ bổ tường dày 2.2 — trước đây dán sát vách nên bị trụ che mất chữ)
        label('tb', ['TURBINE HALL — UNIT 1', '500 MWe'], B.f1 + 2.8, 110, rc - 50, 80, 15, Math.PI / 2);
        for (const x of [-34, 34]) K.box('steelDark', B.f1 + 1.6, 110, rc - 50 + x, 1.4, 12, 1.4, 0, 0);
        K.solid(fc, rc, W / 2 + 1, D / 2 + 1, 0, B.H + rf + 8);
        // MBA tăng áp: thùng gân, dàn tản nhiệt, sứ xuyên, bình dầu phụ; tường ngăn cháy; hố thu dầu sỏi
        const tr = (f, r) => {
          K.cbox('concDark', f, 1.5, r, 44, 3, 30, 0.4);
          K.cbox(M.trafo, f, 15, r, 30, 24, 20, 0.6);
          for (let x = -12; x <= 12; x += 4) K.box(M.trafo, f + x, 15, r + 10.6, 1, 20, 1.2, 0, 24);
          for (const s of [-1, 1]) radiator(M.trafo, f + s * 15, s, r - 9, r + 7, 4, 25);
          for (let k = 0; k < 3; k++) bushing(f - 6 + k * 6, 27, r - 3, 13, 1.1, M.porcGray);
          // bình dầu phụ trên giá + ống thở / ống nối xuống thùng
          K.add(M.trafo, new THREE.CylinderGeometry(4, 4, 22, 14), M4(f, 33, r + 6, 0, 0, Math.PI / 2));
          for (const s of [-1, 1]) K.box('steelDark', f + s * 8, 29.5, r + 6, 1, 3, 6, 0, 0);
          K.cyl('steelDark', f + 6, 27, r + 6, 0.5, 0.5, 2.5, 6);
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
            K.cyl('steelDark', f, B.H, r, 16.6, 17.2, 1.4, 24); K.cyl(M.frp, f, B.H + 1.4, r, 15.6, 15.4, 3, 24);
            for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + H(i + k); K.box(M.frp, f + Math.cos(a) * 15.2, B.H + 5 + H(k + i) * 5, r + Math.sin(a) * 15.2, 6, 4 + H(k + j) * 8, 0.8, -a + Math.PI / 2, 0, 0.3); }
            for (let k = 0; k < 5; k++) K.box(M.frp, f + (H(k + 40 + i) - 0.5) * 60, B.H + 0.8, r + (H(k + 41 + j) - 0.5) * 44, 5 + H(k) * 6, 0.6, 3 + H(k + 1) * 4, H(k + 2) * 3, 0, (H(k + 3) - 0.5) * 0.3);
            K.add(M.soot, new THREE.CircleGeometry(24, 20), M4(f, B.H + 0.4, r, -Math.PI / 2, 0, 0)); K.add(M.soot2, new THREE.CircleGeometry(14.8, 18), M4(f, B.H + 1.6, r, -Math.PI / 2, 0, 0)); K.cyl(M.soot2, f, B.H + 1.6, r, 1.6, 1.8, 3, 10); for (const aa of [0.4, 2.5]) K.box(M.soot2, f + Math.cos(aa) * 5, B.H + 2.2, r + Math.sin(aa) * 5, 10, 0.4, 2, -aa, 0, 0.3)
            for (let k = 0; k < 10; k++) K.add('concDark', new THREE.DodecahedronGeometry(1 + H(k + i * 7) * 2.4, 0), M4(f + (H(k) - 0.5) * 50, B.H + 1.6, r + (H(k + 3) - 0.5) * 40, H(k) * 3, 0, 0, 1.3, 0.6, 1));
            continue;
          }
          // ống quạt sợi thủy tinh (FRP): loe nhẹ, ghép từ các tấm có gân đứng, vành mép trên, bệ thép dưới chân;
          // cánh quạt + trục motor bên trong lòng ống
          K.cyl('steelDark', f, B.H, r, 16.6, 17.2, 1.4, 24);
          K.cyl(M.frp, f, B.H + 1.4, r, 15.6, 14.4, 20, 24);
          { const g2 = new THREE.CylinderGeometry(15.65, 14.45, 20, 24, 1, true), uv = g2.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) * 3 + H(i * 7 + j)); K.add(M.streak, g2, M4(f, B.H + 11.4, r)); }
          K.add(M.frp, flipIn(new THREE.CylinderGeometry(14.0, 13.0, 20, 24, 1, true), -1, 1), M4(f, B.H + 11.4, r));
          for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + 0.13; K.box(M.frp, f + Math.cos(a) * 15.1, B.H + 11.4, r + Math.sin(a) * 15.1, 0.9, 20, 1.2, -a, 0, 0, 0.03); }
          K.add('steelGray', new THREE.TorusGeometry(14.9, 0.5, 5, 32), M4(f, B.H + 21.4, r, Math.PI / 2, 0, 0));
          K.add('void', new THREE.CircleGeometry(13.2, 20), M4(f, B.H + 4, r, -Math.PI / 2, 0, 0));
          K.cyl('steelDark', f, B.H + 4, r, 1.6, 1.6, 4, 10);
          for (const a of [0.3, 1.35, 2.4]) K.box('steelDark', f, B.H + 7.5, r, 25, 0.5, 2.4, a + H(i * 2 + j), 0, 0.12);
        }
        // sàn mái quạt: lan can quanh mép, thang lồng lên mái ở đầu hồi
        for (const k of Object.keys(F)) {
          const { m: b, len } = F[k];
          for (let x = -len / 2 + 2; x <= len / 2 - 2; x += 8) K.add('steelGray', new THREE.BoxGeometry(0.4, 7, 0.4), mul(b, M4(x, B.H + 5, -1.2)));
          for (const yy of [B.H + 5, B.H + 8.4]) K.add('steelGray', new THREE.BoxGeometry(len - 3, 0.4, 0.4), mul(b, M4(0, yy, -1.2)));
        }
        { const lf = B.f0 + 30, lr = B.r1 + 1.6;
          for (const s of [-1, 1]) K.box('steelGray', lf + s * 1.6, B.H / 2 + 4, lr, 0.4, B.H + 8, 0.4, 0, 0);
          for (let y = 4; y < B.H + 6; y += 2.4) K.box('steelGray', lf, y, lr, 3.2, 0.3, 0.3, 0, 0);
          for (let y = 16; y < B.H + 8; y += 6) K.add('steelGray', new THREE.TorusGeometry(2.4, 0.15, 3, 10, Math.PI), M4(lf, y, lr + 0.4, Math.PI / 2, 0, 0)); }
        // cặn khoáng trắng + rêu dưới cửa gió, vệt mưa từ mép mái
        for (const k of Object.keys(F)) {
          const { m: b, len } = F[k], g = new THREE.PlaneGeometry(len - 1, 34), uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 70 + H(len + 31));
          K.add(M.scale, g, mul(b, M4(0, 17, 0.75)));
        }
        streaks(F, B.H - 1, 26);
        roofGrime(fc, B.H + 1.5, rc, W + 2, D + 2);
        K.solid(fc, rc, W / 2 + 6, D / 2 + 6, 0, B.H + 22);
        label('ct', ['COOLING TOWER CT-1'], B.f1 + 0.8, 46, rc, 60, 8, Math.PI / 2);
        const py = 38;
        // 2 ống nước tuần hoàn Ø 1 m: ống đứng từ bể lên, cút cong 90°, chạy ngang trên giá khung cổng thép chữ H vắt qua
        // đường, chui vào tường nhà tua-bin qua mặt bích ống lồng; mặt bích nối ống mỗi ~7 m, đế ống trên dầm giá
        const ER = 7, pf0 = B.f1 - 8, pf1Pit = TB.f0 + 14;
        for (const o of [-6, 6]) {
          const rr = 306 + o;
          pipe(M.blue, [pf0, 4, rr], [pf0, py - ER, rr], 4, 16);
          K.add(M.blue, new THREE.TorusGeometry(ER, 4, 10, 12, Math.PI / 2), M4(pf0 + ER, py - ER, rr, 0, 0, Math.PI / 2));
          // tới cạnh nhà tua-bin: cút 90° chúc xuống, ống đứng cắm vào hố van bê tông (đường ống ngầm vào bình ngưng)
          const pf1 = TB.f0 + 14;
          pipe(M.blue, [pf0 + ER, py, rr], [pf1 - ER, py, rr], 4, 16);
          K.add(M.blue, new THREE.TorusGeometry(ER, 4, 10, 12, Math.PI / 2), M4(pf1 - ER, py - ER, rr));
          pipe(M.blue, [pf1, py - ER, rr], [pf1, 4, rr], 4, 16);
          for (let f = pf0 + ER + 6; f < pf1 - ER - 2; f += 56) K.add(M.blue, new THREE.CylinderGeometry(5, 5, 1.4, 16), M4(f, py, rr, 0, 0, Math.PI / 2));
          for (const f of [pf0, pf1]) K.add(M.blue, new THREE.CylinderGeometry(5.2, 5.2, 1.6, 16), M4(f, 6, rr));
        }
        K.cbox('concDark', pf1Pit, 2.5, 309, 18, 5, 26, 0.6); K.solid(pf1Pit, 309, 9, 13, 0, 5);
        K.cbox('steelDark', pf1Pit - 5, 5.2, 316, 5, 0.6, 6, 0.2);
        for (const f of [-40, RING - 14, RING + 14]) {
          for (const s of [-1, 1]) { K.box('steelGray', f, py / 2 - 2.5, 306 + s * 14, 1.6, py - 5, 1.6, 0, 24); K.box('steelGray', f, py / 2 - 2.5, 306 + s * 14, 0.3, py - 5, 2.4, 0, 24); K.cbox('concDark', f, 0.8, 306 + s * 14, 4, 1.6, 4, 0.3); }
          K.box('steelGray', f, py - 4.6, 306, 2.4, 1.2, 31, 0, 24); K.box('steelGray', f, py - 6.6, 306, 0.3, 3, 31, 0, 24);
          for (const s of [-1, 1]) K.beam('steelGray', [f, py - 13, 306 + s * 14], [f, py - 6.6, 306 + s * 7], 0.6);
          for (const o of [-6, 6]) K.box('steelDark', f, py - 3.6, 306 + o, 3, 1, 6, 0, 0);
          K.solid(f, 306, 2, 15, 0, py + 4);
        }
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
        const post = (f, r, y, len) => bushing(f, y, r, len, 1.1) - 3;
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
          // chuỗi cách điện treo dưới dầm giàn (đĩa sứ + thanh nối), dây mềm võng xuống dao cách ly; dây nối ngắn giữa thiết bị
          for (let d = 0; d < 7; d++) K.cyl(M.porc, gf, gH - 5 - d * 0.8, rp, 1.3, 0.5, 0.45, 10);
          K.cyl('steelDark', gf, gH - 10.5, rp, 0.25, 0.25, 6.5, 6);
          wire([gf, gH - 10.5, rp], [60, t1 + 1.6, rp], 4.5);
          wire([64, t1, rp], [78, t2 + 6, rp], 1.2); wire([78, t2 + 6, rp], [94, t3 + 6, rp], 1);
          K.solid(78, rp, 3, 3, 0, t2 + 6);
        }
        // 2 MBA tăng áp 22/500 kV: thùng gân, dàn tản nhiệt, sứ xuyên cao, bình dầu phụ; tường ngăn cháy; MBA 2 trúng tên lửa: cháy rụi
        const xfmr = (f, r, burnt) => {
          const mt = burnt ? M.soot2 : M.trafo;
          K.cbox('concDark', f, 1.5, r, 40, 3, 34, 0.4);
          K.cbox(mt, f, 16, r, 26, 26, 22, 0.6);
          for (const s of [-1, 1]) radiator(mt, f + s * 13, s, r - 10, r + 10, 4, 27, burnt);
          const tops = [];
          for (let k = 0; k < 3; k++) {
            const bf = f - 7 + k * 7;
            if (burnt && k !== 1) {
              // sứ vỡ: còn mặt bích + chân sứ gãy lởm chởm, mảnh sứ vương trên nắp thùng / nền
              K.cyl('steelGray', bf, 29, r - 4, 2.1, 2.3, 1, 10); K.cyl(M.porc, bf, 30, r - 4, 1.2, 1.5, 2.4 + H(k + f) * 2, 8);
              for (let j = 0; j < 6; j++) K.add(M.porc, new THREE.TetrahedronGeometry(0.6 + H(j + k * 7) * 0.9, 0), M4(bf + (H(j + k) - 0.5) * 14, H(j + 3) < 0.5 ? 29.4 : 3.6, r - 4 + (H(j + k + 5) - 0.5) * 16, H(j) * 3, H(j + 1) * 3, 0));
              continue;
            }
            tops.push([bf, bushing(bf, 29, r - 4, 19, 1.3), r - 4]);
          }
          K.add(mt, new THREE.CylinderGeometry(4, 4, 20, 14), M4(f, 35, r + 7, 0, 0, Math.PI / 2));
          for (const s of [-1, 1]) K.box('steelDark', f + s * 7, 30.5, r + 7, 1, 3, 6, 0, 0);
          if (burnt) {
            // dầu cháy tràn: vệt đen loang chảy từ nắp xuống vách thùng + bãi dầu cháy trên nền sỏi
            K.add(M.soot, new THREE.PlaneGeometry(30, 30), M4(f, 16, r + 11.4, 0, 0, 0)); K.add(M.soot, new THREE.PlaneGeometry(30, 30), M4(f, 16, r - 11.4, 0, Math.PI, 0));
          }
          return tops;
          K.solid(f, r, 20, 17, 0, 48);
        };
        // dây nối thanh cái ngăn lộ 1 xuống sứ MBA 1; MBA 2 cháy: dây đứt rũ xuống nền
        xfmr(104, -432, false).forEach(([bf, top, br], k) => wire([94, 35, bays[0] + (k - 1) * 12], [bf, top, br], 1.6));
        xfmr(104, -390, true);
        for (let p = -1; p <= 1; p++) { const rp = bays[1] + p * 12; wire([94, 35, rp], [99 + p * 4, 2.4, rp - 3 + H(p + 9) * 6], 2.5); }
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
            // container pin 20 ft: vách tôn sóng sơn trắng phai, 8 góc đúc thép, đầu hồi 2 cánh cửa có 4 thanh khóa đứng +
            // tay gạt + bản lề; đầu kia máy lạnh treo vách; cửa gió hông, máy lạnh mái; vệt bẩn chảy từ mép mái
            K.box(M.cont, f, 7.5, r, 12, 11, 28, 0, 24);
            for (const cx of [-5.6, 5.6]) for (const cy of [2.4, 12.6]) for (const cz of [-13.6, 13.6]) K.box('steelDark', f + cx, cy, r + cz, 1.2, 1.2, 1.2, 0, 0);
            K.box('steelDark', f, 7.5, r + 14.12, 0.3, 10.2, 0.2, 0, 0);
            for (const x of [-4.2, -1.6, 1.6, 4.2]) { K.box('steelGray', f + x, 7.5, r + 14.35, 0.3, 10.2, 0.3, 0, 0); K.box('steelDark', f + x + (x > 0 ? 0.6 : -0.6), 6 + (Math.abs(x) > 2 ? 0 : 0.6), r + 14.45, 1.4, 0.35, 0.3, 0, 0); }
            for (const x of [-5.6, 5.6]) for (const y of [4, 7.5, 11]) K.box('steelDark', f + x, y, r + 14.2, 0.5, 0.9, 0.4, 0, 0);
            K.box('steelGray', f, 8, r - 14.6, 8, 6, 1.2, 0, 0); K.box('louver', f, 8, r - 15.25, 6.4, 4.4, 0.1);
            K.box('louver', f - 6.2, 9, r, 0.4, 5, 20); K.cbox('steelGray', f, 14, r + 9, 8, 2, 8, 0.3);
            for (const s of [-1, 1]) K.add(M.streak, new THREE.PlaneGeometry(27, 9), M4(f + s * 6.12, 8.3, r, 0, s * Math.PI / 2, 0));
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
        // cabin kính 8 mặt nghiêng ra ngoài: mỗi mặt 2 tấm kính riêng (rạn / vỡ ngẫu nhiên) + đố ngang; phía trúng mảnh tên
        // lửa (2 mặt) mất kính, còn mảnh kính lởm chởm ở chân khung, muội ám trần; trong cabin: dãy bàn điều khiển, ghế
        for (let k = 0; k < 8; k++) {
          const th = 0.4 + (k + 0.5) * TAU / 8, w = 2 * 18 * Math.sin(Math.PI / 8) - 1, base = mul(M4(f + Math.sin(th) * 16.6, cab + 8, r + Math.cos(th) * 16.6, 0, th, 0), M4(0, 0, 0, 0.124, 0, 0));
          const gone = k === 7 ? 2 : k === 6 ? 1 : 0;
          if (gone < 1) K.add('glass', new THREE.PlaneGeometry(w, 7.6), mul(base, M4(0, -4, 0)));
          if (gone < 2 && !(k === 6)) K.add('glass', new THREE.PlaneGeometry(w, 7.6), mul(base, M4(0, 4, 0)));
          if (k === 6) K.add('glass', new THREE.PlaneGeometry(w, 7.6), mul(base, M4(0, -4, 0)));
          K.add('steelDark', new THREE.BoxGeometry(w, 0.6, 0.8), mul(base, M4(0, 0, 0)));
          if (gone) for (let j = 0; j < 4; j++) { const sh = new THREE.Shape(); const x0 = -w / 2 + j * w / 4 + 0.3, x1 = x0 + w / 4 - 0.6, hh = 1.2 + H(k * 9 + j) * 2.6; sh.moveTo(x0, 0); sh.lineTo(x1, 0); sh.lineTo(x0 + (x1 - x0) * H(k + j + 4), hh); sh.closePath(); K.add(api.mat('glass'), new THREE.ShapeGeometry(sh).scale(1, 1, 1), mul(base, M4(0, gone === 2 ? -7.8 : 0.3, 0.05))); }
        }
        K.add(M.soot, new THREE.CircleGeometry(16, 16), M4(f + Math.sin(-0.2) * 8, cab + 15.8, r + Math.cos(-0.2) * 8, Math.PI / 2, 0, 0));
        K.cyl('steelDark', f, cab - 0.2, r, 17.2, 17.2, 0.4, 8);
        for (let k = 0; k < 5; k++) { const a = 1.6 + k * 0.62; K.box('steelDark', f + Math.sin(a) * 13.2, cab + 2, r + Math.cos(a) * 13.2, 6.4, 4, 2.6, a + Math.PI / 2, 0); K.box('steelGray', f + Math.sin(a) * 13.6, cab + 4.4, r + Math.cos(a) * 13.6, 6, 0.6, 1.6, a + Math.PI / 2, 0, 0.5); }
        for (let k = 0; k < 2; k++) { const a = 2.2 + k * 1.3; K.box('steelDark', f + Math.sin(a) * 9, cab + 1.6, r + Math.cos(a) * 9, 1.8, 3.2, 1.8, a + H(k + 60), 0); }
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
          // cửa ra vào thiết bị 2 bên hông (2 cánh, tay nắm, bản lề), đường gân khung container
          for (const s of [-1, 1]) { K.box('steelDark', f + s * 9.05, 9.5, r - 10, 0.2, 15, 0.4, 0, 0); for (const z of [-14, -6]) { K.box('steelDark', f + s * 9.1, 9, r + z + 2.6, 0.3, 0.5, 1.2, 0, 0); for (const y of [4, 14]) K.box('steelDark', f + s * 9.1, y, r + z - 3.4, 0.4, 1.2, 0.6, 0, 0); } }
          if (!hit) {
            // bầu tiêu âm nằm trên 2 yên thép, ống mềm nối từ mái, ống xả đứng có mũ chắn mưa, muội ám đầu ống
            K.add('steelGray', new THREE.CylinderGeometry(3, 3, 18, 12), M4(f, 26, r + 8, Math.PI / 2, 0, 0));
            for (const z of [2, 14]) K.box('steelDark', f, 23, r + z, 6, 2, 1.2, 0, 0);
            K.cyl('steelDark', f, 22, r + 1, 1.2, 1.2, 2, 8); K.cyl('steelGray', f, 21.6, r + 1, 1.6, 1.6, 0.6, 8);
            K.cyl('steelRust', f, 26, r + 16.6, 1.4, 1.4, 18, 10);
            K.box('steelDark', f, 44.4, r + 17.4, 3, 0.3, 3.2, 0, 0, 0.5, 0);
            { const g = new THREE.CylinderGeometry(1.5, 1.5, 10, 10, 1, true); K.add(M.streak, g, M4(f, 39, r + 16.6)); }
          }
          else { K.cyl('steelRust', f + 3, 2, r + 16, 1.4, 1.4, 10, 10); K.add('void', new THREE.PlaneGeometry(10, 9), M4(f + 9.1, 14, r - 4, 0, Math.PI / 2, 0)); K.add(M.soot, new THREE.CircleGeometry(22, 18), M4(f, 1.3, r, -Math.PI / 2, 0, 0)); }
          K.plane(decal('fu_dg' + k, signTex('fu_dg' + k, ['STANDBY DIESEL DG-' + (k + 1), '6.3 kV — 4 MW'], { w: 768, h: 160, bg: '#e9e6dc', fg: '#1d2a3a' })), f + 9.3, 16, r + 10, 14, 3);
          K.solid(f, r, 10, 24, 0, 24);
        }
        vTank(K, 240, 300 + 80, 7, 16, 0.2); K.solid(240, 380, 8, 8, 0, 24);
        // ống dầu từ bồn dầu ngày chạy sát đất sang 3 tổ máy (gối ống thấp)
        pipe('steelDark', [233, 1.6, 380], [233, 1.6, 372], 0.5); pipe('steelDark', [233, 1.6, 372], [166, 1.6, 372], 0.5);
        for (let f = 172; f < 232; f += 15) K.box('steelDark', f, 0.7, 372, 0.8, 1.4, 1.6, 0, 0);
        for (let k = 0; k < 3; k++) pipe('steelDark', [178 + k * 30, 1.6, 372], [178 + k * 30, 1.6, 368], 0.5);
      }

      // ===================================================================================================
      // 10. VẾT OANH TẠC TÊN LỬA TẦM XA trên các công trình khác: hố nổ trên sân, mái / tường thủng, quạt tháp giải nhiệt mất
      // ===================================================================================================
      {
        // hố nổ: lòng hố tối + ụ viền đất đá hất lên + đá văng + vệt muội toả tia
        const crater = (f, r, R) => {
          K.add(M.soot, new THREE.CircleGeometry(R * 1.9, 24), M4(f, 1.1, r, -Math.PI / 2, 0, 0));
          K.add(M.soot2, new THREE.CircleGeometry(R * 0.75, 16), M4(f, 1.25, r, -Math.PI / 2, 0, 0));
          K.add(M.rubble, new THREE.CircleGeometry(R * 0.45, 12), M4(f, 1.3, r, -Math.PI / 2, 0, 0));
          for (let k = 0; k < 7; k++) { const a = k * TAU / 7 + H(f + r + k), d = R * (0.85 + H(k + r) * 0.2), w = R * (0.5 + H(k + f) * 0.4); K.box(H(k + 3) < 0.6 ? 'conc' : 'concDark', f + Math.cos(a) * d, 1.6, r + Math.sin(a) * d, w, 1.6, w * (0.6 + H(k + 9) * 0.4), -a, 64, (H(k + 4) - 0.5) * 0.3, -0.35 - H(k + 5) * 0.5); }
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
      // (sơn vàng bạc màu, gỉ loang theo lớp bỏ hoang — trước đây vàng mới tinh)
      for (let i = 0; i < 9; i++) drum(K, -90 + (i % 3) * 5.4, -200 + Math.floor(i / 3) * 5.6, i === 4 ? 'drumRust' : M.yel, 0);
      K.add(M.yel, new THREE.CylinderGeometry(2.4, 2.4, 7.2, 14), M4(-80, 2.4, -178, Math.PI / 2, 0.6, 0));
      K.add('drumRust', new THREE.CylinderGeometry(2.4, 2.4, 7.2, 14), M4(-74, 2.4, -186, Math.PI / 2, 1.9, 0));
      K.add(M.soot, new THREE.CircleGeometry(7, 14), M4(-76, 0.9, -183, -Math.PI / 2, 0, 0));
      K.plane(triM, -82.5, 6, -194, 8, 4);
      // xe bỏ lại
      anim.vehicles.push({ type: 'SCOUT', f: 152, r: -250, a: Math.PI / 2 + 0.25, ty: 0.4, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: 60, r: 4, a: Math.PI + 0.06, ty: -0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'ARTILLERY', f: 152, r: 330, a: -Math.PI / 2, chassis: true, cargo: 'jp8', hf: 50, hr: 13 });
      anim.vehicles.push({ type: 'GATLING', f: RING + 2, r: 200, a: Math.PI / 2 + 0.04, ty: 1.1, hf: 43, hr: 32 });
    }
  };
})();
