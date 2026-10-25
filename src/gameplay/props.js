/**
 * CÔNG TRÌNH PHỤ & VẬT CẢN TRÊN BẢN ĐỒ (dữ liệu sinh tất định trong MapGen -> mọi máy giống hệt nhau)
 * - Hàng rào gỗ / tre, tường đá, tường đất, bờ rào cây quanh vườn & ruộng: xe húc đổ, đạn nổ phá đổ.
 * - Ruộng (lúa, lúa mì, rơm, rau, sắn, đất khô): mặt ruộng kẻ luống bám theo địa hình.
 * - Xác xe cháy rụi (xe tăng / xe bọc thép / xe tải): chắn xe & chắn đạn như đá tảng, vài chiếc còn âm ỉ khói.
 * - Bao cát (mép hào ẩn xe, chốt đầu làng): chắn đạn thẳng & giảm sóng nổ; xe cán qua thì bẹp xuống.
 * - Hào ẩn xe: đã đào thẳng vào lưới độ cao trong MapGen; ở đây chỉ dựng bao cát trên ụ phía trước.
 * - Đô thị: đèn đường, đèn giao thông, cột điện + dây, xe con đỗ, nhà chờ xe buýt (xe húc đổ / cán bẹp), mái che cây
 *   xăng, cầu vượt bộ hành (cột / chân cầu chặn xe).
 */
const Props = (() => {
  const TAU = Math.PI * 2;
  // băm tất định theo số nguyên -> [0, 1)
  const hash = (n) => { let h = (n | 0) * 374761393 + 668265263; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sfx = (kind, x, y, z, k, o) => { if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(kind, { x, y, z }, k || 1, o || null); };

  // ---------------------------------------------------------------------------
  // TEXTURE THỦ TỤC
  // ---------------------------------------------------------------------------
  const TEX = {};
  function tex(key, w, h, draw, rep) {
    if (TEX[key]) return TEX[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return (TEX[key] = t);
  }
  function speckle(g, w, h, n, cols, smin, smax, seed) {
    for (let i = 0; i < n; i++) {
      const r1 = hash(seed + i * 3), r2 = hash(seed + i * 3 + 1), r3 = hash(seed + i * 3 + 2);
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.25 + r3 * 0.5;
      const s = smin + r3 * (smax - smin);
      g.fillRect(r1 * w, r2 * h, s, s * (0.6 + r1));
    }
    g.globalAlpha = 1;
  }
  const woodTex = () => tex('wood', 128, 32, (g, w, h) => {
    g.fillStyle = '#6b5236'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${40 + hash(y) * 40 | 0},${28 + hash(y + 9) * 25 | 0},16,0.35)`; g.fillRect(0, y, w, 1); }
    speckle(g, w, h, 90, ['#3b2b1c', '#8a7050', '#55432e'], 1, 4, 11);
  }, true);
  const stoneTex = (mud) => tex(mud ? 'mudwall' : 'stonewall', 128, 64, (g, w, h) => {
    g.fillStyle = mud ? '#9a8262' : '#7c7a74'; g.fillRect(0, 0, w, h);
    if (mud) { speckle(g, w, h, 260, ['#7e6748', '#b09a76', '#8d7353'], 1, 5, 21); return; }
    // đá xếp khan: viên đá to nhỏ không đều, mạch tối
    let y = 0, row = 0;
    while (y < h) {
      const rh = 9 + hash(row * 7) * 9;
      let x = -hash(row) * 20;
      while (x < w) {
        const rw = 12 + hash(row * 31 + x | 0) * 22, k = 0.75 + hash(x * 13 + row | 0) * 0.45;
        g.fillStyle = `rgb(${120 * k | 0},${118 * k | 0},${110 * k | 0})`;
        g.beginPath(); g.ellipse(x + rw / 2, y + rh / 2, rw / 2 - 1, rh / 2 - 1, 0, 0, TAU); g.fill();
        x += rw;
      }
      y += rh; row++;
    }
    speckle(g, w, h, 160, ['#4d4b46', '#9c9a92', '#5f6a4a'], 1, 3, 23);
  }, true);
  const hedgeTex = () => tex('hedge', 128, 64, (g, w, h) => {
    g.fillStyle = '#2f4220'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = hash(i * 5) * w, y = hash(i * 5 + 1) * h, s = 2 + hash(i * 5 + 2) * 5, k = 0.6 + hash(i * 5 + 3) * 0.8;
      g.fillStyle = `rgb(${52 * k | 0},${78 * k | 0},${34 * k | 0})`;
      g.beginPath(); g.ellipse(x, y, s, s * 0.6, hash(i) * 3, 0, TAU); g.fill();
    }
  }, true);
  // vải bố bao cát: sợi đan thô (ô nổi rõ), đường may mép, vết bùn khô loang, cát rỉ qua mắt vải, sợi xổ
  const burlapTex = () => tex('burlap2', 128, 64, (g, w, h) => {
    g.fillStyle = '#7a7058'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const k = hash(x * 131 + y * 7);
      g.fillStyle = (x + y) % 4 === 0 ? `rgba(170,150,105,${0.25 + k * 0.2})` : `rgba(55,44,28,${0.18 + k * 0.2})`;
      g.fillRect(x, y, 2, 1); g.fillRect(x + ((x + y) % 4 === 0 ? 0 : 1), y + 1, 1, 1);
    }
    for (let i = 0; i < 6; i++) { const x = hash(i * 13) * w, y = hash(i * 13 + 1) * h, r = 6 + hash(i * 13 + 2) * 14, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(70,56,36,0.45)'); gr.addColorStop(1, 'rgba(70,56,36,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }   // bùn khô loang
    g.strokeStyle = 'rgba(50,40,26,0.5)'; g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(0, 4); g.lineTo(w, 4); g.stroke(); g.setLineDash([]);   // đường may
    for (let i = 0; i < 20; i++) { const x = hash(i * 7 + 3) * w, y = hash(i * 7 + 4) * h; g.strokeStyle = 'rgba(185,165,120,0.6)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i) - 0.5) * 8, y + hash(i + 1) * 6); g.stroke(); }   // sợi xổ
    speckle(g, w, h, 120, ['#5d4f35', '#b8a274', '#6d5f40', '#c2ae84'], 1, 2, 31);
  }, true);
  const charTex = () => tex('charred', 128, 128, (g, w, h) => {
    // xác xe cháy: thép xám than + mảng gỉ nâu cam + tro xám nhạt (không đen kịt)
    g.fillStyle = '#4a443d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 7) * w, y = hash(i * 7 + 1) * h, r = 4 + hash(i * 7 + 2) * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const rust = hash(i * 7 + 3) < 0.55;
      gr.addColorStop(0, rust ? 'rgba(128,72,38,0.6)' : 'rgba(24,21,18,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, 400, ['#2a2520', '#7a5232', '#6e6962', '#8a5a33', '#8c867c'], 1, 3, 41);
  }, true);
  // gỗ rào phơi nắng mưa nhiều năm: bạc xám (nâu còn sót trong thớ), thớ dọc nứt chân chim, mắt gỗ, vệt đinh gỉ
  const fenceWoodTex = () => tex('fenceWood', 256, 64, (g, w, h) => {
    g.fillStyle = '#7d7466'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const k = hash(y * 7) * 0.5 + hash((y >> 2) * 13) * 0.5;
      g.fillStyle = `rgba(${70 + k * 60 | 0},${60 + k * 48 | 0},${46 + k * 30 | 0},0.5)`; g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 26; i++) {   // vết nứt thớ: đường mảnh tối chạy dọc, đứt quãng
      const y = hash(i * 31) * h, x = hash(i * 31 + 1) * w, l = 30 + hash(i * 31 + 2) * 120;
      g.strokeStyle = 'rgba(30,24,18,0.55)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < l; s += 8) g.lineTo(x + s, y + (hash(i * 31 + s) - 0.5) * 1.6);
      g.stroke();
    }
    for (let i = 0; i < 5; i++) {   // mắt gỗ: vòng xoáy sẫm
      const x = hash(i * 17 + 5) * w, y = hash(i * 17 + 6) * h, r = 2 + hash(i * 17 + 7) * 3;
      g.fillStyle = 'rgba(48,34,22,0.7)'; g.beginPath(); g.ellipse(x, y, r * 1.8, r, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(40,30,20,0.4)'; g.beginPath(); g.ellipse(x, y, r * 3.4, r * 1.8, 0, 0, TAU); g.stroke();
    }
    for (let i = 0; i < 4; i++) { const x = hash(i * 23 + 9) * w, y = h * (0.3 + hash(i * 23) * 0.4); const gr = g.createLinearGradient(0, y, 0, y + 22); gr.addColorStop(0, 'rgba(110,52,22,0.55)'); gr.addColorStop(1, 'rgba(110,52,22,0)'); g.fillStyle = gr; g.fillRect(x - 1, y, 3, 22); g.fillStyle = '#3a2416'; g.fillRect(x - 1, y - 1, 3, 3); }   // đinh gỉ chảy vệt
    speckle(g, w, h, 160, ['#4a3f33', '#a59a88', '#5d5244'], 1, 3, 61);
  }, true);
  // tre già phơi nắng: vỏ ngà vàng bạc màu, xơ dọc, đốt tre (gờ sẫm + vệt trắng phấn) mỗi 1/2 ảnh theo chiều dài
  const bambooTex = () => tex('bamboo', 64, 128, (g, w, h) => {
    g.fillStyle = '#c9b98a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) { const k = hash(x * 11); g.fillStyle = `rgba(${120 + k * 70 | 0},${105 + k * 60 | 0},${60 + k * 40 | 0},0.35)`; g.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 40; i++) { const x = hash(i * 7) * w, y = hash(i * 7 + 1) * h; g.fillStyle = 'rgba(80,70,50,0.25)'; g.fillRect(x, y, 1, 6 + hash(i) * 20); }   // vệt mốc / bẩn dọc thớ
    for (const ny of [0, h / 2]) {
      const gr = g.createLinearGradient(0, ny - 6, 0, ny + 6); gr.addColorStop(0, 'rgba(70,58,34,0)'); gr.addColorStop(0.45, 'rgba(70,58,34,0.75)'); gr.addColorStop(0.55, 'rgba(225,220,200,0.6)'); gr.addColorStop(1, 'rgba(70,58,34,0)');
      g.fillStyle = gr; g.fillRect(0, ny - 6, w, 12); if (ny === 0) g.fillRect(0, h - 6, w, 6);
    }
    speckle(g, w, h, 90, ['#7a6c4a', '#e0d6b8', '#6b6a4a'], 1, 2, 71);
  }, true);
  // hạt đá (đá xếp khan): sạn li ti, vân khoáng, đốm địa y — màu từng viên do màu đỉnh quyết định
  const rockGrainTex = () => tex('rockGrain', 128, 128, (g, w, h) => {
    g.fillStyle = '#9a978f'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['#6d6a63', '#b6b3aa', '#57544e', '#8b8679'], 1, 3, 81);
    for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(60,58,54,0.35)'; g.lineWidth = 0.7; g.beginPath(); let x = hash(i * 5) * w, y = hash(i * 5 + 1) * h; g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (hash(i * 9 + s) - 0.5) * 30; y += (hash(i * 9 + s + 3) - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 14; i++) { const x = hash(i * 13 + 4) * w, y = hash(i * 13 + 5) * h, r = 2 + hash(i * 13 + 6) * 5; g.fillStyle = hash(i) < 0.5 ? 'rgba(196,192,150,0.45)' : 'rgba(120,130,84,0.4)'; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill(); }   // địa y
  }, true);
  // tường đất trộn rơm: đất nện sần, sợi rơm vàng lẫn, sỏi nhỏ, vết nứt khô chân chim, mảng vữa quét vôi bong còn sót
  const adobeTex = () => tex('adobe', 256, 128, (g, w, h) => {
    g.fillStyle = '#9b8261'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#7e6748', '#b49c78', '#86704f', '#6c583e'], 1, 4, 91);
    for (let i = 0; i < 260; i++) { const x = hash(i * 3 + 1) * w, y = hash(i * 3 + 2) * h, a = hash(i * 3 + 3) * 3.14, l = 3 + hash(i) * 7; g.strokeStyle = hash(i * 5) < 0.6 ? 'rgba(205,180,110,0.6)' : 'rgba(150,125,70,0.5)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }   // rơm
    for (let i = 0; i < 90; i++) { const x = hash(i * 7 + 2) * w, y = hash(i * 7 + 3) * h, r = 0.5 + hash(i * 7 + 4) * 0.9; g.fillStyle = hash(i * 7 + 5) < 0.5 ? 'rgba(92,80,64,0.55)' : 'rgba(176,160,132,0.5)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }   // sỏi nhỏ lẫn trong đất
    for (let i = 0; i < 16; i++) {   // nứt khô: chân chim mảnh, nhạt dần, rẽ nhánh ngắn
      let x = hash(i * 11) * w, y = hash(i * 11 + 1) * h, a = hash(i * 11 + 2) * TAU;
      for (let s = 0; s < 7; s++) {
        a += (hash(i * 19 + s) - 0.5) * 1.2;
        const nx = x + Math.cos(a) * 5, ny = y + Math.sin(a) * 5;
        g.strokeStyle = `rgba(52,40,28,${0.45 - s * 0.05})`; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        x = nx; y = ny;
      }
    }
  }, true);
  // mặt ruộng: 1 ô = 64 đơn vị, luống chạy theo trục u
  // strip: cây trồng 3D theo luống (h: cao ngọn đv, gap: khoảng cách luống đv, len: đv / 1 lần lặp ảnh thân lá)
  const CROP = {
    rice: { soil: '#434a32', row: '#5f7238', tip: '#7f9052', rows: 10, rough: 0.78, water: true, strip: { h: 4.2, gap: 2.6, len: 7 } },
    veg: { soil: '#5a4630', row: '#506a32', tip: '#6e8a48', rows: 7, rough: 0.95, strip: { h: 3.2, gap: 4, len: 8 } },
    wheat: { soil: '#8a7444', row: '#c4a65a', tip: '#e2c97c', rows: 14, rough: 0.95, strip: { h: 6.5, gap: 1.9, len: 6 } },
    hay: { soil: '#857049', row: '#b59d62', tip: '#d1bb80', rows: 16, rough: 1.0, bales: true, strip: { h: 1.1, gap: 2.2, len: 6 } },
    cassava: { soil: '#5b4128', row: '#425e30', tip: '#5e7a44', rows: 6, rough: 0.95, strip: { h: 9, gap: 5, len: 10 } },
    dry: { soil: '#a08460', row: '#8a7050', tip: '#b49a72', rows: 8, rough: 1.0, strip: { h: 1.8, gap: 3, len: 7 } }
  };
  // áp phích quảng cáo nhà chờ bỏ hoang: in màu phai nắng (ngả xanh lơ / hồng nhạt), mảng chữ, góc rách bong lộ lớp
  // giấy cũ dán chồng, vệt nước chảy, hình vẽ bậy xịt sơn
  const adTex = () => tex('busAd', 128, 160, (g, w, h) => {
    g.fillStyle = '#d9d4c4'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#7fa3b0'); gr.addColorStop(1, '#c79a8e'); g.fillStyle = gr; g.fillRect(8, 8, w - 16, h * 0.62);
    g.fillStyle = 'rgba(240,236,220,0.85)'; g.beginPath(); g.arc(w * 0.62, h * 0.3, 26, 0, TAU); g.fill();               // hình sản phẩm phai
    g.fillStyle = 'rgba(60,58,64,0.75)'; for (let i = 0; i < 3; i++) g.fillRect(14, h * 0.7 + i * 11, 60 + hash(i) * 40, 6);   // dòng chữ
    g.fillStyle = 'rgba(176,60,48,0.7)'; g.fillRect(14, h * 0.7 + 36, 40, 10);
    g.fillStyle = '#ece7d6'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w - 34, 0); g.lineTo(w - 18, 20); g.lineTo(w - 26, 34); g.lineTo(w, 46); g.fill();   // góc rách lộ giấy nền
    g.fillStyle = 'rgba(120,150,60,0.5)'; g.fillRect(w - 30, 2, 22, 14);                                                     // lớp áp phích cũ bên dưới
    for (let i = 0; i < 8; i++) { const x = hash(i * 9) * w, l = 30 + hash(i * 9 + 1) * 90, gd = g.createLinearGradient(0, 0, 0, l); gd.addColorStop(0, 'rgba(70,64,52,0.35)'); gd.addColorStop(1, 'rgba(70,64,52,0)'); g.fillStyle = gd; g.fillRect(x, 0, 2 + hash(i) * 3, l); }   // vệt nước
    g.strokeStyle = 'rgba(30,30,34,0.8)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(20, h * 0.5); g.bezierCurveTo(40, h * 0.38, 55, h * 0.62, 75, h * 0.48); g.bezierCurveTo(85, h * 0.4, 95, h * 0.56, 108, h * 0.46); g.stroke();   // vẽ bậy
    speckle(g, w, h, 200, ['#8a8478', '#f2eee2', '#6e685c'], 1, 2, 101);
  });
  // mặt đầu cuộn rơm: vòng xoắn ốc sợi rơm từ tâm ra, sợi rối, mép ngoài sẫm
  const baleCapTex = () => tex('baleCap', 128, 128, (g, w, h) => {
    g.fillStyle = '#b39a62'; g.fillRect(0, 0, w, h);
    for (let a = 0; a < 70; a += 0.05) {
      const r = a * 0.9, x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
      if (r > 62) break;
      g.fillStyle = `rgba(${90 + hash(a * 100 | 0) * 60 | 0},${72 + hash(a * 77 | 0) * 50 | 0},40,0.5)`; g.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 300; i++) { const x = hash(i * 3) * w, y = hash(i * 3 + 1) * h, a = hash(i * 3 + 2) * 3.14, l = 3 + hash(i) * 6; g.strokeStyle = hash(i * 7) < 0.5 ? 'rgba(220,196,130,0.5)' : 'rgba(120,98,58,0.45)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const gr = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 66); gr.addColorStop(0, 'rgba(60,48,30,0)'); gr.addColorStop(1, 'rgba(60,48,30,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // thân lá cây trồng nhìn ngang (cắt alpha): lúa bụi lá mảnh ngả vàng đầu lá, lúa mì thân thẳng bông nặng hạt có râu,
  // rau lá bản rộng, sắn thân mảnh lá chân vịt, rạ / cỏ khô gốc cắt — ngọn lổn nhổn, vài cây đổ ngả
  const cropBladeTex = (k) => tex('blade_' + k, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    let q = k.length * 97;
    const R = () => hash(q++);
    const blade = (x, len, ang, wd, c0, c1) => {
      const ex = x + Math.sin(ang) * len, ey = h - Math.cos(ang) * len, mx = x + Math.sin(ang) * len * 0.45, my = h - len * 0.55;
      const gr = g.createLinearGradient(0, h, 0, ey); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      g.strokeStyle = gr; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      return [ex, ey];
    };
    if (k === 'rice') {
      for (let c = 0; c < 7; c++) { const cx = (c + 0.5) * w / 7 + (R() - 0.5) * 8; for (let i = 0; i < 16; i++) blade(cx + (R() - 0.5) * 6, h * (0.55 + R() * 0.42), (R() - 0.5) * 0.9, 1.4 + R(), '#2c4419', R() < 0.12 ? '#a4a250' : R() < 0.5 ? '#5f8030' : '#4b6e26'); }
    } else if (k === 'wheat') {
      for (let i = 0; i < 46; i++) {
        const [ex, ey] = blade((i + R()) * w / 46, h * (0.62 + R() * 0.34), (R() - 0.5) * 0.25, 1.2, '#8f7a3e', '#d8bf6c');
        g.fillStyle = R() < 0.5 ? '#c9a24e' : '#e0c370'; g.beginPath(); g.ellipse(ex, ey + 5, 2.2, 7, 0, 0, TAU); g.fill();   // bông
        g.strokeStyle = 'rgba(230,210,150,0.7)'; g.lineWidth = 0.5; for (let a = -1; a <= 1; a++) { g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + a * 3, ey - 9); g.stroke(); }   // râu
      }
    } else if (k === 'veg') {
      for (let c = 0; c < 5; c++) { const cx = (c + 0.5) * w / 5; for (let i = 0; i < 9; i++) { const a = (R() - 0.5) * 1.8, l = h * (0.3 + R() * 0.35); g.fillStyle = R() < 0.3 ? '#6f8a3a' : '#4f6f30'; g.save(); g.translate(cx, h); g.rotate(a); g.beginPath(); g.ellipse(0, -l / 2, l * 0.22, l / 2, 0, 0, TAU); g.fill(); g.restore(); } }
    } else if (k === 'cassava') {
      for (let c = 0; c < 4; c++) {
        const cx = (c + 0.5) * w / 4 + (R() - 0.5) * 10, [ex, ey] = blade(cx, h * (0.7 + R() * 0.28), (R() - 0.5) * 0.3, 1.8, '#7a5a3a', '#6b6a3a');
        for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6 + (R() - 0.5) * 0.3; g.fillStyle = '#4c6a2e'; g.save(); g.translate(ex, ey + 4); g.rotate(a); g.beginPath(); g.ellipse(0, -9, 2.4, 9, 0, 0, TAU); g.fill(); g.restore(); }
      }
    } else {
      // rạ gốc cắt / cỏ khô: thân ngắn vàng xám, lổn nhổn
      const n = k === 'hay' ? 70 : 40;
      for (let i = 0; i < n; i++) blade(R() * w, h * (k === 'hay' ? 0.35 + R() * 0.5 : 0.3 + R() * 0.65), (R() - 0.5) * 0.7, 1.3, '#7d6a42', R() < 0.4 ? '#c8b07a' : '#a39062');
    }
  }, true);
  const cropTex = (k) => tex('crop_' + k, 256, 256, (g, w, h) => {
    const C = CROP[k] || CROP.veg;
    g.fillStyle = C.soil; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['rgba(0,0,0,0.5)', 'rgba(255,255,255,0.3)'], 1, 3, 51);
    const p = h / C.rows;
    for (let r = 0; r < C.rows; r++) {
      const y0 = r * p;
      // luống: dải cây trồng có mép lởm chởm
      for (let x = 0; x < w; x += 2) {
        const j = (hash(r * 977 + x) - 0.5) * p * 0.18, th = p * (0.42 + hash(r * 131 + x * 7) * 0.2);
        g.fillStyle = C.row; g.fillRect(x, y0 + p * 0.3 + j, 2, th);
        if (hash(x * 3 + r) < 0.5) { g.fillStyle = C.tip; g.fillRect(x, y0 + p * 0.32 + j, 1, th * 0.45); }
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y0 + p * 0.9, w, p * 0.1);   // rãnh giữa luống
    }
    if (C.water) { g.fillStyle = 'rgba(96,112,108,0.2)'; for (let r = 0; r < C.rows; r++) g.fillRect(0, r * p + p * 0.82, w, p * 0.18); }
  }, true);

  // ---------------------------------------------------------------------------
  // HÌNH HỌC
  // ---------------------------------------------------------------------------
  // gộp [hình, ma trận, màu đỉnh [r,g,b] (tuỳ chọn, mặc định trắng)] thành 1 hình không chỉ số
  function merge(list) {
    const geos = list.map(([g, m]) => { const n = g.index ? g.toNonIndexed() : g.clone(); if (m) n.applyMatrix4(m); return n; });
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3).fill(1);
    let o = 0;
    geos.forEach((g, gi) => {
      const n = g.attributes.position.count, c = list[gi][2];
      pos.set(g.attributes.position.array, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (c) for (let i = 0; i < n; i++) col.set(c, (o + i) * 3);
      o += n;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  // hộp méo: 8 góc xê dịch theo băm (viên đá / thanh gỗ xẻ tay), mặt phẳng (pháp tuyến từng mặt)
  function roughBox(w, h, d, jit, seed) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = seed * 131 + (Math.sign(p.getX(i)) + 1) * 9 + (Math.sign(p.getY(i)) + 1) * 3 + (Math.sign(p.getZ(i)) + 1);
      p.setXYZ(i, p.getX(i) + (hash(k) - 0.5) * jit * w, p.getY(i) + (hash(k + 50) - 0.5) * jit * h, p.getZ(i) + (hash(k + 99) - 0.5) * jit * d);
    }
    g.computeVertexNormals();
    return g;
  }
  // UV chiếu hộp theo pháp tuyến (mật độ texel đều mọi mặt, s = lặp / đơn vị), lệch gốc (ou, ov) cho mỗi mảnh khác nhau
  function boxUV(g, s, ou = 0, ov = 0) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i) * s, y = p.getY(i) * s, z = p.getZ(i) * s;
      if (ay >= ax && ay >= az) uv.setXY(i, x + ou, z + ov); else if (ax >= az) uv.setXY(i, z + ou, y + ov); else uv.setXY(i, x + ou, y + ov);
    }
    return g;
  }
  // trụ tròn (tre / cột) dọc trục y, UV v lặp theo chiều dài (vl = đơn vị / 1 lần lặp ảnh)
  function rod(r, len, seg, vl) {
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / vl);
    return g;
  }
  // ma trận đặt trụ dọc từ điểm a tới b (trục y của trụ = a -> b)
  function rodM(a, b) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / L)), new THREE.Vector3(1, 1, 1));
  }
  const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
  // gồ ghề nhẹ đỉnh khối (bờ rào cây / tường đá xếp)
  function lumpy(g, amp, seed) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = hash(seed + Math.round(x * 3) * 31 + Math.round(y * 3) * 17 + Math.round(z * 3) * 7);
      if (y > 0.01) p.setY(i, y + (k - 0.5) * amp * 2);
      p.setZ(i, z * (1 + (hash(seed + Math.round(x * 3) * 13) - 0.5) * 0.5));
    }
    g.computeVertexNormals();
    return g;
  }

  // Mẫu 1 nhịp hàng rào theo loại: chiều dài nhịp L dọc trục x (tâm tại gốc), chân ở y = 0
  // wx: phong hoá (weathering.js) theo vật liệu
  const FENCE = {
    wood: { L: 14, h: 6.5, t: 1, mat: () => fenceWoodTex(), color: 0xffffff, rough: 0.95, wx: ['wood', { grimeH: 2.2 }] },
    bamboo: { L: 12, h: 7.5, t: 1, mat: () => bambooTex(), color: 0xffffff, rough: 0.8, wx: ['wood', { fade: 0.4, stain: 0.45, grimeH: 2 }] },
    stone: { L: 10, h: 5, t: 3.4, mat: () => rockGrainTex(), color: 0xffffff, rough: 0.97, solid: true, wx: ['stone', {}] },
    mud: { L: 10, h: 6, t: 3, mat: () => adobeTex(), color: 0xffffff, rough: 1, solid: true, wx: ['soil', { grime: 0.55, grimeH: 3, streak: 0.5, moss: 0.5 }] },
    hedge: { L: 10, h: 8.5, t: 5.5, mat: () => hedgeTex(), color: 0xffffff, rough: 0.9, solid: true, leafy: true }
  };
  const FENCE_VARIANTS = 3;
  // Sức chịu một nhịp khi xe húc: [lực đổ F (N), năng lượng phá E (J)]. Rào gỗ / tre gãy dưới mọi xe; bờ rào cây có gốc
  // rễ đan; tường đất / tường đá xếp khan (~0,6 m, ~0,5 tấn / nhịp): xe xích tì là đổ, xe 4x4 10 tấn phải lao ~13 km/h
  // (tường đất) / ~28 km/h (tường đá) mới phá được (xem VehicleCollision.ramForce) và khựng hẳn, chậm hơn thì bị chặn
  const FENCE_RAM = { wood: [18e3, 5e3], bamboo: [12e3, 3.5e3], hedge: [45e3, 25e3], mud: [110e3, 80e3], stone: [170e3, 140e3] };
  // CHẮN ĐẠN / MẢNH VĂNG theo loại rào (bờ rào cây chỉ che mắt: đạn & mảnh lọt qua lá cành). ht: nửa bề dày khối chắn quanh
  // trục rào (đv); type / mat: loại va chạm báo cho ballistics -> hiệu ứng & tiếng trúng (tường đá xếp: như tường; tường đất
  // nện: "phập" nghẹt tơi đất như bao cát; rào gỗ / tre: dăm gỗ). blast: phần mảnh văng / sức ép còn lại khi vật che trọn
  // đường từ điểm nổ tới xe — đá xếp khan ~42 cm / đất nện ~37 cm chặn gần hết mảnh (như bờ bao cát); rào gỗ / tre thưa chỉ
  // đỡ được ít (thanh 3-4 cm, khe hở giữa thanh). Rào thưa (không solid) chỉ chắn ở cột đầu nhịp (post: nửa bề ngang), các
  // thanh ngang (rails: độ cao theo F.h từng mẫu như fenceGeo, hb: nửa bề cao thanh) và nan tre đan chéo (lattice)
  const WALL_HIT = {
    stone: { ht: 1.9, type: 'WALL', mat: 'stone', blast: 0.4, solid: true },
    mud: { ht: 1.7, type: 'SANDBAG', mat: 'adobe', blast: 0.4, solid: true },
    wood: { ht: 0.9, type: 'BOULDER', mat: 'wood', blast: 0.85, post: 0.6, hb: 0.45, rails: [[0.4, 0.83], [0.4, 0.83], [0.3, 0.58, 0.86]] },
    bamboo: { ht: 0.9, type: 'BOULDER', mat: 'wood', blast: 0.9, post: 0.5, hb: 0.3, rails: [[0.15, 0.5, 0.86], [0.15, 0.5, 0.86], [0.16, 0.86]], lattice: true }
  };
  // Đạn động năng xuyên thủng thanh gỗ / cây tre 3-4 cm gần như nguyên sức (12.7 / 7.62, đạn cháy 12.7, mũi tên xuyên giáp):
  // bay lọt qua rào gỗ / tre. Đạn có ngòi nổ chạm (pháo, 30mm nổ mảnh, tên lửa, bom con) chạm thanh rào thì nổ
  const WOOD_PIERCE = { SCOUT_BULLET: 1, INCENDIARY_HMG: 1, AP: 1 };
  // Che MỘT PHẦN bởi vật thấp (tường rào, đá tảng, xác xe) nằm giữa điểm nổ (cao ey) và xe: đường từ điểm nổ sượt qua đỉnh
  // vật (cao top, tại tham số t0..t1 trên đoạn nổ -> xe) chiếu tới chỗ xe ở cao hs = ey + (top - ey) / t; thân xe coi như cao
  // 2 m quanh điểm ngắm uy (uy ± 8 đv) -> phần thân khuất bóng vật c = (hs - (uy - 8)) / 16. Hệ số mảnh / sức ép còn lại
  // 1 - c·(1 - k) (k: khi vật che trọn đường bay). Xe nấp sát tường 0,6 m, quả nổ sát mặt bên kia: khuất gần hết; nổ xa phía
  // bên kia: chỉ khuất gầm / xích
  function lowCover(ey, uy, t0, t1, top, k) {
    const hsAt = t => (t > 1e-3 ? ey + (top - ey) / t : top >= ey ? Infinity : -Infinity);
    const hs = Math.max(hsAt(t0), hsAt(t1));
    const c = Math.max(0, Math.min(1, (hs - uy + 8) / 16));
    return 1 - c * (1 - k);
  }
  // Xác xe: khối lượng còn lại (tấn) & hệ số ma sát trượt (xích / bánh cháy kẹt, gầm cày đất) -> sức cản F = μ·m·g.
  // Xe 60 tấn (lực kéo ~410 kN) ủi được xác xe tăng (~265 kN) bò chậm; xác xe tải nhẹ thì xe 4x4 cũng đẩy được
  const WRECK_MASS = { tank: 45, apc: 22, truck: 9, dump: 11 }, WRECK_MU = 0.6;
  // Mẫu 1 nhịp rào, biến thể v (FENCE_VARIANTS mẫu / loại, nhịp chọn mẫu theo băm): cột nghiêng, thanh võng / gãy, viên
  // đá to nhỏ, đỉnh tường mòn khác nhau -> hàng rào lâu năm không đều tăm tắp. Màu đỉnh: từng thanh / viên lệch màu
  function fenceGeo(kind, v = 0) {
    const F = FENCE[kind], parts = [];
    let sd = (v + 1) * 7919 + kind.length * 131;
    const R = () => hash(sd++), V = (x, y, z) => new THREE.Vector3(x, y, z);
    // trụ tròn bán kính r nối a -> b (UV dọc theo chiều dài, lặp mỗi vl đv)
    const rodAB = (r, a, b, seg, vl, col) => parts.push([rod(r, a.distanceTo(b), seg, vl), rodM(a, b), col]);
    if (kind === 'wood') {
      // gỗ bạc xám, vài thanh thay sau còn nâu; cột đẽo 6 cạnh đầu vát chéo hơi nghiêng; thanh xẻ tay võng giữa
      const woodCol = () => { const k = 0.8 + R() * 0.3; return R() < 0.2 ? [k * 1.1, k * 0.93, k * 0.74] : [k, k * 0.97, k * 0.92]; };
      const ph = F.h + 0.3 + R() * 0.9, lean = (R() - 0.5) * 0.09;
      const post = new THREE.CylinderGeometry(0.42, 0.52, ph + 0.6, 6, 1).toNonIndexed(), pp = post.attributes.position, pu = post.attributes.uv;
      for (let i = 0; i < pp.count; i++) {
        if (pp.getY(i) > 0) pp.setY(i, pp.getY(i) + pp.getX(i) * 0.45);
        pu.setXY(i, pp.getY(i) / 8 + 0.3 * v, (pp.getX(i) + pp.getZ(i)) / 3);   // thớ gỗ chạy dọc cột
      }
      post.computeVertexNormals();
      parts.push([post, M4(-F.L / 2, (ph + 0.6) / 2 - 0.6, 0, lean, 0, lean * 0.7), woodCol()]);
      const rails = v === 2 ? [0.3, 0.58, 0.86] : [0.4, 0.83];
      rails.forEach((r, i) => {
        const y = F.h * r + (R() - 0.5) * 0.3, sag = 0.1 + R() * 0.22, len = F.L + 0.7, col = woodCol();
        const yOf = x => y - sag * (1 - Math.pow(2 * x / len, 2));
        const broken = v === 1 && i === 0, seg = broken ? 1 : 3, segL = broken ? len * 0.5 : len / 3;
        for (let k = 0; k < seg; k++) {
          const x0 = -len / 2 + segL * k, x1 = x0 + segL, y0 = yOf(x0), y1 = yOf(x1);
          parts.push([boxUV(roughBox(segL + 0.06, 0.6 + R() * 0.1, 0.3, 0.12, sd++), 1 / 8, R(), R()), M4((x0 + x1) / 2, (y0 + y1) / 2, 0.42, (R() - 0.5) * 0.12, 0, Math.atan2(y1 - y0, x1 - x0)), col]);
        }
        if (broken) {   // biến thể 1: thanh dưới gãy giữa nhịp, nửa kia chúc chéo xuống đất
          const a = V(0.2, y - 0.25, 0.5), b = V(len / 2 - 0.3, 0.35, 0.95), d = b.clone().sub(a);
          parts.push([boxUV(roughBox(d.length(), 0.6, 0.3, 0.14, sd++), 1 / 8, R(), R()), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d.normalize()), V(1, 1, 1)), col]);
        }
      });
      return merge(parts);
    }
    if (kind === 'bamboo') {
      // cọc tre to cắm đất, 2-3 cây tre ngang, nan tre đan chéo ô trám, mối buộc dây mây; tre già ngà bạc, cây thay sau
      // còn vàng xanh; biến thể 1: rụng mất vài nan
      const col = () => { const k = 0.8 + R() * 0.28; return R() < 0.15 ? [k * 0.95, k * 1.03, k * 0.72] : [k, k * 0.97, k * 0.9]; };
      const ph = F.h + 0.4 + R() * 0.6, lean = (R() - 0.5) * 0.07;
      parts.push([rod(0.42, ph + 0.5, 7, 4.5), M4(-F.L / 2, (ph + 0.5) / 2 - 0.5, 0, lean, 0, lean * 0.6), col()]);
      const rails = v === 2 ? [0.16, 0.86] : [0.15, 0.5, 0.86], len = F.L + 0.8;
      for (const r of rails) {
        const y = F.h * r + (R() - 0.5) * 0.25;
        rodAB(0.2, V(-len / 2, y, 0.42), V(len / 2, y - R() * 0.15, 0.42), 6, 3.2, col());
        parts.push([new THREE.BoxGeometry(0.3, 0.45, 1.0), M4(-F.L / 2 + 0.05, y, 0.25, 0, 0, 0.3), [0.34, 0.28, 0.2]]);   // dây mây buộc
      }
      const y0 = F.h * rails[0], y1 = F.h * rails[rails.length - 1], run = (y1 - y0) / Math.tan(0.96);
      for (const dir of [1, -1]) for (let x = -F.L / 2 + 0.6; x + run <= F.L / 2 + 0.7; x += 2.2 + R() * 0.5) {
        if (v === 1 && R() < 0.25) continue;
        const z = dir > 0 ? 0.64 : 0.8;
        rodAB(0.13, V(dir > 0 ? x : x + run, y0 - 0.3, z), V(dir > 0 ? x + run : x, y1 + 0.3, z), 5, 3, col());
      }
      return merge(parts);
    }
    if (kind === 'stone') {
      // tường đá xếp khan: 3 lớp đá méo to nhỏ không đều (lớp trên thu hẹp), hàng đá dựng chặn đỉnh cao thấp lởm chởm;
      // từng viên lệch màu (xám xanh / xám ấm / ố nâu); biến thể 1: rơi mất vài viên đỉnh
      const stoneCol = () => { const k = 0.7 + R() * 0.4, t = R() * 2 - 1; return [k * (1 + t * 0.08), k, k * (1 - t * 0.09)]; };
      let y = 0;
      [1.5, 1.35, 1.2].forEach((c0, c) => {
        const ch = c0 * (0.9 + R() * 0.2), tw = F.t * (1 - c * 0.08);
        for (let x = -F.L / 2 - 0.3 - R() * 0.9; x < F.L / 2 + 0.2;) {
          const xe = Math.min(x + 1.5 + R() * 1.7, F.L / 2 + 0.3), ww = xe - x;
          if (ww < 0.6) break;
          const hh = ch * (0.82 + R() * 0.22);
          parts.push([boxUV(roughBox(ww - 0.1, hh, tw * (0.9 + R() * 0.14), 0.24, sd++), 1 / 9, R() * 4, R() * 4), M4(x + ww / 2, y + hh / 2, (R() - 0.5) * 0.3, (R() - 0.5) * 0.1, (R() - 0.5) * 0.12, (R() - 0.5) * 0.1), stoneCol()]);
          x = xe;
        }
        y += ch * 0.94;
      });
      for (let x = -F.L / 2; x < F.L / 2 - 0.3;) {
        const w = 0.7 + R() * 0.6, hh = 0.9 + R() * 0.7;
        if (!(v === 1 && R() < 0.3)) parts.push([boxUV(roughBox(w, hh, F.t * (0.7 + R() * 0.1), 0.3, sd++), 1 / 9, R() * 4, R() * 4), M4(x + w / 2, y + hh / 2 - 0.15, 0, 0, 0, (R() - 0.5) * 0.4), stoneCol()]);
        x += w;
      }
      return merge(parts);
    }
    if (kind === 'mud') {
      // tường đất nện: chân bè đỉnh thu, mép đỉnh bị mưa bào tròn, đỉnh mòn lượn sóng, mặt tường lồi lõm, chân xói lõm;
      // biến thể 1: sạt một mảng đỉnh
      const g = new THREE.BoxGeometry(F.L + 0.4, F.h, F.t, 8, 4, 2); g.translate(0, F.h / 2, 0);
      const p = g.attributes.position;
      const nz = (x, q) => { const i = Math.floor(x), f = x - i, a = hash(sd + i * 7 + q), b = hash(sd + i * 7 + 7 + q); return a + (b - a) * f * f * (3 - 2 * f); };
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const yN = y / F.h, zN = z / (F.t / 2);
        z *= 1.08 - 0.16 * yN;
        if (yN > 0.99) y -= nz(x * 0.35 + 3, 1) * 1.1 + (v === 1 && Math.abs(x - 1.5) < 2.5 ? 1.6 * (1 - Math.abs(x - 1.5) / 2.5) : 0);
        if (yN > 0.7 && Math.abs(zN) > 0.9) { y -= 0.35 * (yN - 0.7) / 0.3; z *= 0.88; }
        z += Math.sign(z) * (nz(x * 0.5 + y * 0.3, 5) - 0.5) * 0.35;
        if (yN > 0.01 && yN < 0.3) z *= 0.97;
        p.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals();
      return merge([[boxUV(g, 1 / 12, v * 0.37, 0), null]]);
    }
    // bờ rào cây: thẻ lá (Destructibles.Foliage) — thiếu module thì khối hộp gồ ghề
    const Fo = typeof Destructibles !== 'undefined' && Destructibles.Foliage;
    if (F.leafy && Fo && Fo.hedgeGeometry) return Fo.hedgeGeometry(F.L + 0.6, F.h, F.t, 101 + v * 37);
    const g = new THREE.BoxGeometry(F.L + 0.4, F.h, F.t, 4, 2, 2);
    g.translate(0, F.h / 2, 0);
    return merge([[lumpy(g, F.leafy ? 1.1 : 0.45, kind.length * 101), null]]);
  }

  const WRECK_HP = { dump: 2, truck: 2, apc: 3, tank: 4 };
  // Xác xe ben / xe tải hậu cần cháy (dài ~8 m dọc z, đầu xe +z, chân y = 0): khung gầm võng, cabin móp trơ khung cửa
  // sổ đen hốc, thùng ben bị nhiệt làm cong vênh vách, cửa hậu bung lệch, lốp cháy trụi còn mâm sắt (xe lún thấp xuống),
  // bình dầu, ống xả. Màu đỉnh: hốc cửa sổ / gầm tối, mâm thép sáng hơn, cao su cháy còn sót đen. ~450 tam giác
  let TRUCK_WRECK = null;
  function truckWreckGeo() {
    if (TRUCK_WRECK) return TRUCK_WRECK;
    const P = [], dark = [0.16, 0.15, 0.14], rim = [0.75, 0.72, 0.68], rub = [0.22, 0.2, 0.19];
    const B = (w, h, d, x, y, z, rx, ry, rz, col, jit, seed) => P.push([jit ? roughBox(w, h, d, jit, seed) : new THREE.BoxGeometry(w, h, d), M4(x, y, z, rx, ry, rz), col]);
    for (const sx of [-1, 1]) B(1.4, 2.2, 56, sx * 6, 5.6, -2, 0, 0, 0.02 * sx, null, 0.04, 3 + sx);   // khung gầm
    B(19.5, 15, 13, 0, 13.6, 21.5, 0.02, 0.03, -0.04, null, 0.07, 11);                                     // cabin móp
    B(18.6, 5.2, 0.4, 0, 16.2, 28.1, 0.1, 0, 0, dark);                                                     // hốc kính chắn gió
    for (const sx of [-1, 1]) B(0.4, 4.6, 7.5, sx * 9.85, 16.4, 22.5, 0, 0, 0, dark);                        // hốc cửa sổ hai bên
    B(18, 6, 6, 0, 8.6, 30.5, 0.06, 0, 0.03, null, 0.08, 17);                                                // đầu xe / két nước
    B(21, 2.4, 1.6, 0, 4.6, 33.8, 0, 0.08, 0.1, null, 0.12, 19);                                              // cản trước lệch
    B(20.5, 1.2, 36, 0, 10.2, -6, -0.03, 0, 0, null, 0.03, 23);                                              // sàn thùng ben
    for (const sx of [-1, 1]) B(0.9, 7, 36, sx * 10.3, 14, -6, 0, 0, sx * 0.09, null, 0.06, 29 + sx);        // vách thùng cong vênh
    B(20.5, 9, 0.9, 0, 15, 12.2, 0, 0, 0, null, 0.04, 31);                                                   // vách đầu thùng
    B(20.5, 7, 0.9, 0, 8.5, -24.8, -0.9, 0, 0.12, null, 0.05, 37);                                            // cửa hậu bung xệ
    B(3.6, 4, 7, 9.6, 7, 6, 0, 0, 0, dark);                                                                  // bình dầu
    P.push([new THREE.CylinderGeometry(0.55, 0.55, 14, 6), M4(-8.4, 20, 14.6, 0.08, 0, 0.05), dark]);        // ống xả cong
    // bánh: trước 2, sau 2 cặp; lốp cháy trụi: mâm thép + vành cao su sót lại một phần
    for (const z of [24, -10, -18.5]) for (const sx of [-1, 1]) {
      P.push([new THREE.CylinderGeometry(2.4, 2.4, 1.8, 10), M4(sx * 8.6, 2.5, z, 0, 0, Math.PI / 2), rim]);
      P.push([new THREE.CylinderGeometry(3.1, 3.1, 1.2, 10, 1, true), M4(sx * 8.3, 2.9, z, 0, 0, Math.PI / 2), rub]);
    }
    TRUCK_WRECK = merge(P);
    return TRUCK_WRECK;
  }
  // nền đất cháy xém dưới xác xe: loang tro đen mép lởm chởm, đốm tro trắng, vệt dầu cháy
  const scorchTex = () => tex('wreckScorch', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const a = hash(i * 7) * TAU, d = hash(i * 7 + 1) * 34, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 1.3, r = 16 + hash(i * 7 + 2) * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(18,15,12,0.5)'); gr.addColorStop(1, 'rgba(18,15,12,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 60; i++) { const x = 64 + (hash(i * 3) - 0.5) * 80, y = 64 + (hash(i * 3 + 1) - 0.5) * 100, r = 0.6 + hash(i * 3 + 2) * 2; g.fillStyle = hash(i) < 0.3 ? 'rgba(120,116,108,0.28)' : 'rgba(30,26,22,0.55)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  });
  // Bộ phận xác xe: [hình, ma trận cục bộ] theo loại; trục x = hướng xe, chân ở y = 0
  function wreckParts(kind) {
    const P = [];
    if (kind === 'tank') {
      P.push(['hull', M4(0, 6, 0, 0, 0, 0, 34, 7.5, 16)]);
      P.push(['hull', M4(15, 6.5, 0, 0, 0, -0.55, 8, 5, 15.6)]);              // tấm giáp trước vát
      P.push(['track', M4(0, 3.4, 7.4, 0, 0, 0, 36, 6.8, 3.6)]);
      P.push(['track', M4(0, 3.4, -7.4, 0, 0, 0, 36, 6.8, 3.6)]);
      P.push(['turret', M4(-2, 11.5, 0, 0, 0, 0, 7.5, 4.5, 6.4)]);
      P.push(['barrel', M4(16, 12.2, 0, 0, 0, Math.PI / 2 - 0.06, 0.75, 24, 0.75)]);
    } else if (kind === 'apc') {
      P.push(['hull', M4(0, 7, 0, 0, 0, 0, 30, 8.5, 14)]);
      P.push(['hull', M4(13.5, 6.4, 0, 0, 0, -0.7, 6, 5, 13.6)]);
      P.push(['track', M4(0, 2.8, 6.4, 0, 0, 0, 30, 5.6, 3.2)]);
      P.push(['track', M4(0, 2.8, -6.4, 0, 0, 0, 30, 5.6, 3.2)]);
      P.push(['turret', M4(2, 12.4, 0, 0, 0, 0, 3.4, 2.6, 3.4)]);
      P.push(['barrel', M4(8, 13, 0, 0, 0, Math.PI / 2, 0.35, 10, 0.35)]);
    } else {
      P.push(['hull', M4(-1, 3.6, 0, 0, 0, 0, 30, 1.8, 9)]);                 // khung gầm
      P.push(['hull', M4(10.5, 8.5, 0, 0, 0, 0, 8, 8.5, 11.5)]);              // ca-bin
      P.push(['hull', M4(-5, 6.4, 0, 0, 0, 0, 20, 2.6, 12)]);                 // thùng xe
      P.push(['hull', M4(-5, 9.4, 5.8, 0, 0, 0, 20, 4, 0.5)]);
      P.push(['hull', M4(-5, 9.4, -5.8, 0, 0, 0, 20, 4, 0.5)]);
      for (const f of [10, -6, -12]) for (const sd of [1, -1]) P.push(['wheel', M4(f, 2.6, sd * 5.3, Math.PI / 2, 0, 0, 2.6, 2, 2.6)]);
    }
    return P;
  }

  // ---------------------------------------------------------------------------
  // ĐỒ VẬT ĐƯỜNG PHỐ (đô thị, MapGen 5e): đèn đường, đèn giao thông, cột điện + dây, xe con đỗ, nhà chờ xe buýt, mái
  // che cây xăng, cầu vượt bộ hành. Mỗi vật = vài khối hộp / trụ đơn vị (phóng theo ma trận) gom theo (hình, vật liệu)
  // thành InstancedMesh dùng chung -> ~15 draw call cho hàng nghìn vật. Hệ cục bộ: gốc tại chân vật, trục +z = hướng
  // "trước" của vật (cần đèn vươn ra phố / đầu xe / dọc tuyến dây điện / lưng nhà chờ / vào trong lô cây xăng),
  // quay theo góc angle của MapGen (+z -> (sin a, cos a)). Đổ / bẹp tính theo băm toạ độ (không RNG) -> mọi máy như nhau
  // ---------------------------------------------------------------------------
  // màu sơn theo mẫu (danh mục MapGen.CAR_CATALOG tag fixedColor -> map gửi color = -1)
  const CAR_FIXED_COL = { taxi: 0xe8b820 };
  const CAR_COL = [0xe8e8e6, 0xb8bcc0, 0x26282c, 0x9e2a26, 0x2c4c7c, 0x6c7074, 0x2e4a36, 0xc8b894, 0x1e2a44, 0x5e2228, 0x8aa8c0, 0x7a6a58];
  const SMAT = {
    paint: { color: 0xffffff, roughness: 0.4, metalness: 0.4 },
    cabin: { color: 0x121314, roughness: 0.92, metalness: 0 },
    cargo: { color: 0xffffff, roughness: 0.85, metalness: 0.1 },   // thùng / bạt xe tải bản xa (màu từng xe: o.cargoColor)
    lampLens: { color: 0x8c9498, roughness: 0.14, metalness: 0.65 },   // cụm đèn pha bản xa: kính + chóa phản xạ (tắt)
    glass: { color: 0x46575f, roughness: 0.08, metalness: 0.45, transparent: true, opacity: 0.6 },
    rim: { color: 0xc6cacd, roughness: 0.28, metalness: 0.85 },
    trim: { color: 0x1e2022, roughness: 0.72, metalness: 0.05 },
    plate: { color: 0xeeeee6, emissive: 0x1a1a18, roughness: 0.5, metalness: 0 },
    tire: { color: 0x161616, roughness: 0.92, metalness: 0 },
    // thép mạ kẽm xỉn: ánh kim yếu (không có ảnh môi trường thì metalness cao làm cột / cần đèn đen như than chì)
    metal: { color: 0xa2a7a9, roughness: 0.55, metalness: 0.25 },
    dark: { color: 0x2a2d30, roughness: 0.6, metalness: 0.35 },
    concrete: { color: 0xb4b0a6, roughness: 0.92, metalness: 0 },
    glow: { color: 0xd8d2c0, emissive: 0x0c0b08, roughness: 0.3, metalness: 0 },   // đèn pha xe bỏ hoang: tắt (hết ắc quy)
    red: { color: 0x9a2018, emissive: 0x100202, roughness: 0.3, metalness: 0 },
    amber: { color: 0xc08a20, emissive: 0x2a1800, roughness: 0.4, metalness: 0 },
    green: { color: 0x1f8a40, emissive: 0x0a2a12, roughness: 0.4, metalness: 0 },
    roofBlue: { color: 0x3e5f80, roughness: 0.6, metalness: 0.3 },
    panel: { color: 0x9fc0cc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false },
    ad: { color: 0xe8e4d4, emissive: 0x26241c, roughness: 0.5, metalness: 0, map: adTex() },
    white: { color: 0xeeeeea, roughness: 0.55, metalness: 0.1 },
    brand: { color: 0xc8241c, roughness: 0.5, metalness: 0.1 },
    // thành phố ma mất điện: kính đèn giao thông tắt, chỉ còn màu kính bám bụi; bóng đèn đường tắt
    lensR: { color: 0x5a1a14, roughness: 0.25, metalness: 0.1 },
    lensA: { color: 0x5a4216, roughness: 0.25, metalness: 0.1 },
    lensG: { color: 0x1a4428, roughness: 0.25, metalness: 0.1 },
    sigBody: { color: 0x2b2c2a, roughness: 0.7, metalness: 0.3 },
    sigPole: { color: 0x575b58, roughness: 0.55, metalness: 0.3 },
    deadLamp: { color: 0x8c8a82, roughness: 0.35, metalness: 0.1 }
  };
  // phần: [hình 'box' | 'cyl', vật liệu, x, y, z, sx, sy, sz, rx, ry, rz] (hộp / trụ đơn vị tâm tại gốc)
  const P = (g, m, x, y, z, sx, sy, sz, rx, ry, rz) => [g, m, x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0];
  // ---------------------------------------------------------------------------
  // MẪU Ô TÔ (tỉ lệ thật, 8 đv = 1 m; mũi xe theo +z cục bộ, mặt đất y = 0):
  //  - thân dưới: biên dạng cạnh xe (cản / capô dốc / mép kính / cốp) có khoét hốc bánh, đùn theo bề ngang + bo mép
  //  - khoang: kính bao quanh (biên dạng kính chắn gió nghiêng, mui, kính hậu), mui + cột A / B / C sơn màu xe
  //  - chi tiết: cản nhựa đen, lưới tản nhiệt, đèn pha / đèn hậu, gương, biển số, nẹp sườn; lốp + mâm kim loại
  // Phần có vai trò (role) để biến dạng khi bị cán / húc: 'body' thân dưới, 'cabin' khoang (sập xuống), 'wheel' bánh
  // ---------------------------------------------------------------------------
  // L dài, W rộng, belt mép dưới kính, clear gầm, r bán kính lốp, wb nửa chiều dài cơ sở, track nửa vệt bánh
  // body: biên dạng thân (z, y) từ mũi-dưới đi lên, dọc nóc ra đuôi, xuống đuôi-dưới (đáy + hốc bánh tự thêm)
  // gh: biên dạng kính (z, y so với mép kính): [chân kính chắn gió, đỉnh kính chắn gió, cuối mui, chân kính hậu]
  // bp: z cột B (null = không có), van: khoang là thùng tôn kín (kính chỉ ở cabin)
  // ---------------------------------------------------------------------------
  // MẪU Ô TÔ BỎ HOANG (8 đv = 1 m; mũi theo +z cục bộ, mặt đất y = 0)
  //  - thân dưới LOFT: ~40-70 mặt cắt siêu elip dọc thân (mũi / đuôi tròn khi nhìn từ trên, vai xe thu vào, nóc capô
  //    vồng nhẹ), hốc bánh khoét tròn 2 bên; khoang kính loft thu hẹp lên trên (tumblehome), mỗi mặt tự xếp loại:
  //    mui / cột A-B-C sơn, kính chắn gió / kính hậu / kính cửa; nội thất tối sau kính
  //  - lốp thành phồng (lathe), mâm 5 chấu, trống phanh tối; bóng tối dưới gầm
  //  - DẤU THỜI GIAN theo từng xe (thuộc tính aWear = bụi, gỉ, phai): texture mặt nạ theo thân (khe cửa, tay nắm, nắp
  //    capô / cốp, nắp xăng, bụi tích mặt ngang, bùn bắn chân sườn, vệt mưa chảy dọc, gỉ mép dưới / quanh hốc bánh /
  //    dọc khe cửa) trộn trong shader: sơn phai bạc, bụi đất phủ, gỉ nâu sần (nhám, mất bóng)
  // Phần có vai trò (role) để biến dạng khi bị cán / húc: 'body' thân dưới, 'cabin' khoang (sập), 'wheel' bánh
  // ---------------------------------------------------------------------------
  // top: đường nóc thân dưới (z tăng từ đuôi tới mũi, [z, y, bán kính bo]); gh: đường kính [chân kính hậu, đỉnh kính
  // hậu, đỉnh kính chắn gió, chân kính chắn gió] (y tính từ mép kính belt); doors: các cánh cửa [z trước, z sau]
  const CAR_SPEC = {
    sedan: { L: 37.4, W: 14.2, belt: 7.3, clear: 1.5, r: 2.6, wb: 11.2, m: 1.4,
      top: [[-18.7, 5.0], [-18.3, 6.3, 0.8], [-16.2, 7.2, 1.6], [-9.8, 7.3, 0.6], [6.8, 7.3, 0.6], [16.6, 6.7, 1.8], [18.7, 5.0]],
      gh: [[-9.8, 0], [-5.6, 4.6, 2.4], [1.2, 4.6, 2.0], [6.8, 0]], bp: -2.0, doors: [[6.4, -2.0], [-2.0, -9.2]] },
    hatch: { L: 32.4, W: 13.8, belt: 7.3, clear: 1.5, r: 2.5, wb: 9.8, m: 1.2,
      top: [[-16.2, 5.2], [-15.9, 6.4, 0.6], [-14.8, 7.3, 1.0], [6.0, 7.3, 0.6], [14.2, 6.6, 1.8], [16.2, 5.0]],
      gh: [[-14.8, 0], [-12.2, 4.7, 1.8], [0.8, 4.8, 2.2], [6.0, 0]], bp: -3.6, doors: [[5.8, -3.6], [-3.6, -11.0]] },
    suv: { L: 38.4, W: 15, belt: 8.8, clear: 2.1, r: 3.0, wb: 12.0, m: 2.1,
      top: [[-19.2, 6.0], [-18.9, 7.6, 0.6], [-17.8, 8.8, 0.8], [7.2, 8.8, 0.6], [16.6, 8.2, 1.4], [19.2, 6.2]],
      gh: [[-17.8, 0], [-16.6, 5.6, 1.4], [2.6, 5.6, 1.6], [7.2, 0]], bp: -4.0, rails: true, doors: [[7.0, -4.0], [-4.0, -12.4]] },
    van: { L: 40.4, W: 15.2, belt: 8.0, clear: 1.8, r: 2.8, wb: 13.0, m: 2.4, van: true,
      top: [[-20.2, 6.4], [-20.0, 7.6, 0.5], [-19.4, 8.0, 0.5], [17.4, 8.0, 0.6], [19.0, 7.4, 1.0], [20.2, 5.6]],
      gh: [[-19.4, 0], [-19.0, 7.6, 0.8], [12.4, 7.6, 1.8], [17.4, 0]], bp: null, doors: [[16.8, 10.8], [8.0, -4.0]] },
    pickup: { L: 42.4, W: 15, belt: 7.8, clear: 2.1, r: 3.0, wb: 13.4, m: 2.0, bed: true,
      top: [[-21.2, 6.2], [-21.0, 7.8, 0.5], [9.2, 7.8, 0.6], [18.8, 7.4, 1.4], [21.2, 6.0]],
      gh: [[-3.6, 0], [-2.8, 5.4, 1.2], [5.0, 5.4, 1.6], [9.2, 0]], bp: null, doors: [[9.0, -3.4]] },
    dump: { L: 41.0, W: 15.2, belt: 10.8, clear: 2.5, r: 3.35, wb: 13.5, m: 3.2, bed: true,
      top: [[-20.5, 6.45], [-20.0, 6.45], [3.2, 6.45], [3.6, 8.8], [15.5, 8.6], [18.5, 7.5], [20.5, 5.8]],
      gh: [[3.8, 0], [4.4, 6.0, 0.8], [13.5, 6.0, 1.2], [16.2, 0]], bp: null, doors: [[15.2, 4.8]] }
  };
  CAR_SPEC.truck = CAR_SPEC.dump;
  CAR_SPEC.taxi = Object.assign({}, CAR_SPEC.sedan, { taxi: true });
  // bo tròn các góc đường gấp khúc: điểm [x, y, r] có r > 0 thay bằng cung tiếp xúc 2 cạnh kề
  function fillet(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const B = pts[i], r = B[2] || 0;
      if (!r || i === 0 || i === pts.length - 1) { out.push([B[0], B[1]]); continue; }
      const A = pts[i - 1], C = pts[i + 1];
      let ux = A[0] - B[0], uy = A[1] - B[1], vx = C[0] - B[0], vy = C[1] - B[1];
      const la = Math.hypot(ux, uy), lc = Math.hypot(vx, vy);
      ux /= la; uy /= la; vx /= lc; vy /= lc;
      const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
      if (th < 0.05 || th > Math.PI - 0.05) { out.push([B[0], B[1]]); continue; }
      const t = Math.min(r / Math.tan(th / 2), la * 0.45, lc * 0.45), rr = t * Math.tan(th / 2);
      const bx = ux + vx, by = uy + vy, bl = Math.hypot(bx, by), d = rr / Math.sin(th / 2);
      const cx = B[0] + bx / bl * d, cy = B[1] + by / bl * d;
      const p1 = [B[0] + ux * t, B[1] + uy * t], p2 = [B[0] + vx * t, B[1] + vy * t];
      let a0 = Math.atan2(p1[1] - cy, p1[0] - cx), a1 = Math.atan2(p2[1] - cy, p2[0] - cx), da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      for (let k = 0; k <= 6; k++) { const a = a0 + da * k / 6; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    }
    return out;
  }
  // y của đường gấp khúc (z tăng dần) tại z (lấy cao nhất nếu nhiều đoạn chứa z)
  function lineAt(P, z) {
    let y = -Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (z < lo - 1e-6 || z > hi + 1e-6) continue;
      y = Math.max(y, hi - lo < 1e-6 ? Math.max(a[1], b[1]) : a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]));
    }
    return y === -Infinity ? P[z < P[0][0] ? 0 : P.length - 1][1] : y;
  }
  const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  // lưới loft từ các vành (mỗi vành M+1 điểm, điểm cuối trùng điểm đầu cho uv liền); quay mặt ra ngoài theo tâm vành
  function ringMesh(rings, M) {
    const pos = [], uv = [], idx = [];
    for (const R of rings) for (const p of R) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
    const S = M + 1;
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < M; k++) {
      const a = i * S + k, b = a + 1, c = a + S, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // kiểm tra 1 điểm sườn phải (k = 0): pháp tuyến phải hướng +x; ngược thì lật chiều tam giác
    const mid = Math.floor(rings.length / 2) * S, n = g.attributes.normal;
    if (n.getX(mid) < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  }
  const CAR_GEO = {};
  function carGeo(key) {
    if (CAR_GEO[key]) return CAR_GEO[key];
    let g;
    if (key === 'c:tire') {
      // lốp: mặt gai phẳng, vai bo, thành lốp phồng (bán kính 1 = mép ngoài, trục quay Y, bề ngang 1)
      const pr = [[0.6, -0.5], [0.8, -0.53], [0.93, -0.48], [0.99, -0.36], [1.0, -0.2], [1.0, 0.2], [0.99, 0.36], [0.93, 0.48], [0.8, 0.53], [0.6, 0.5]];
      g = new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), 26);
    } else if (key === 'c:rim') {
      // mâm hợp kim 5 chấu (mặt ngoài +Y): vành môi, lòng vành, 5 chấu, moay-ơ
      const parts = [];
      const lip = new THREE.LatheGeometry([[0.5, 0.36], [0.6, 0.42], [0.62, 0.47], [0.55, 0.49]].map(p => new THREE.Vector2(p[0], p[1])), 26);
      parts.push([lip, null], [new THREE.CylinderGeometry(0.58, 0.58, 0.82, 22, 1, true), null]);
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        parts.push([new THREE.BoxGeometry(0.1, 0.09, 0.44), M4(Math.sin(a) * 0.3, 0.44, Math.cos(a) * 0.3, 0, a, 0)]);
      }
      parts.push([new THREE.CylinderGeometry(0.15, 0.17, 0.12, 12), M4(0, 0.45, 0)]);
      g = merge(parts);
    } else if (key === 'c:drum') g = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
    else if (key === 'c:shadow') { g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); }
    else {
      const [kind, part] = key.slice(2).split('_'), S = CAR_SPEC[kind];
      if (part === 'body') g = loftBody(S);
      else if (part === 'ghg' || part === 'ghp' || part === 'gha') { const G = loftCabin(S); CAR_GEO['c:' + kind + '_ghg'] = G.glass; CAR_GEO['c:' + kind + '_ghp'] = G.paint; CAR_GEO['c:' + kind + '_gha'] = G.all; g = part === 'ghg' ? G.glass : part === 'ghp' ? G.paint : G.all; }
    }
    return (CAR_GEO[key] = g);
  }
  // THÂN DƯỚI: vành siêu elip theo z; mặt bằng bo tròn mũi / đuôi (siêu elip bậc 6); đáy nâng thành vòm hốc bánh
  function loftBody(S) {
    const top = fillet(S.top), L2 = S.L / 2, W2 = S.W / 2, Ra = S.r + 0.5, sill = S.clear + 0.25, M = 36;
    const zs = new Set();
    for (let z = -L2; z <= L2 + 1e-6; z += 0.8) zs.add(+z.toFixed(3));
    for (const wz of [-S.wb, S.wb]) for (let z = wz - Ra - 0.3; z <= wz + Ra + 0.3; z += 0.22) zs.add(+z.toFixed(3));
    for (let z = L2 - 2.6; z <= L2; z += 0.22) { zs.add(+z.toFixed(3)); zs.add(+(-z).toFixed(3)); }
    zs.add(L2); zs.add(-L2);
    const Z = [...zs].filter(z => Math.abs(z) <= L2).sort((a, b) => a - b);
    const rings = Z.map(z => {
      const w = W2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z) / L2, 6)), 1 / 6);
      let y0 = sill + 0.8 * Math.max(0, Math.min(1, (Math.abs(z) - (L2 - 4)) / 4));   // cản trước / sau cao hơn sườn
      for (const wz of [-S.wb, S.wb]) { const d = z - wz; if (Math.abs(d) < Ra) y0 = Math.max(y0, S.r + Math.sqrt(Ra * Ra - d * d)); }
      const y1 = Math.max(y0 + 0.08, lineAt(top, z)), ym = (y0 + y1) / 2, hh = (y1 - y0) / 2;
      const R = [];
      for (let k = 0; k <= M; k++) {
        const th = k / M * Math.PI * 2, ex = spow(Math.cos(th), 0.2), ey = spow(Math.sin(th), 0.27);
        R.push([w * ex * (1 - 0.05 * Math.max(0, ey)), ym + hh * ey, z, (z + L2) / S.L, k / M]);
      }
      return R;
    });
    return ringMesh(rings, M);
  }
  // KHOANG: vành từ đáy (chìm vào thân) lên đường mui, hẹp dần lên trên; tam giác xếp loại kính / sơn theo hướng mặt
  function loftCabin(S) {
    const gh = fillet(S.gh), z0 = gh[0][0], z1 = gh[gh.length - 1][0], Wb = (S.W - 2.0) / 2, M = 40;
    const roofZ0 = S.gh[1][0], roofZ1 = S.gh[2][0];
    const rings = [];
    for (let z = z0; z <= z1 + 1e-6; z += 0.3) {
      const h = Math.max(0.05, lineAt(gh, z)), R = [];
      for (let k = 0; k <= M; k++) {
        const th = k / M * Math.PI * 2, ex = spow(Math.cos(th), 0.3), ey = spow(Math.sin(th), 0.42), t = (ey + 1) / 2;
        R.push([(Wb - 1.5 * t) * ex, -0.6 + (h + 0.6) * t, z, (z - z0) / (z1 - z0), k / M]);
      }
      rings.push(R);
    }
    const all = ringMesh(rings, M), g = all.toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const gl = { p: [], n: [], u: [] }, pa = { p: [], n: [], u: [] };
    for (let t = 0; t < P.count; t += 3) {
      let nx = 0, ny = 0, nz = 0, cz = 0, cy = 0, ax = 0;
      for (let j = 0; j < 3; j++) { nx += N.getX(t + j); ny += N.getY(t + j); nz += N.getZ(t + j); cz += P.getZ(t + j) / 3; cy += P.getY(t + j) / 3; ax = Math.max(ax, Math.abs(P.getX(t + j))); }
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const h = lineAt(gh, cz), edge = ax > Wb - 1.5 * Math.min(1, Math.max(0, (cy + 0.6) / (h + 0.6))) - 0.55;
      let glass;
      if (ny > 0.72 || ny < -0.5) glass = false;                       // mui / đáy
      else if (nz > 0.42) glass = !edge && cy > 0.3 && ny < 0.85;                    // kính chắn gió (cột A ở 2 mép)
      else if (nz < -0.42) glass = !S.van && !edge && cy > 0.4;         // kính hậu (cột C ở 2 mép)
      else {
        // kính cửa 2 bên: giữa cột A và cột C, trừ cột B; xe van chỉ có kính cửa cabin
        const zA = roofZ1 - 0.6, zC = roofZ0 + 0.7;
        glass = Math.abs(nx) > 0.55 && cy > 0.3 && cy < h - 0.45 && (S.van ? (cz > roofZ1 - 6.8 && cz < zA) : (cz > zC && cz < zA && (S.bp === null || Math.abs(cz - S.bp) > 0.55)));
      }
      const o = glass ? gl : pa;
      for (let j = 0; j < 3; j++) { o.p.push(P.getX(t + j), P.getY(t + j), P.getZ(t + j)); o.n.push(N.getX(t + j), N.getY(t + j), N.getZ(t + j)); o.u.push(U.getX(t + j), U.getY(t + j)); }
    }
    const mk = o => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2)); return q; };
    return { glass: mk(gl), paint: mk(pa), all };
  }
  // Danh sách phần của 1 mẫu xe: [hình, vật liệu, x, y, z, sx, sy, sz, rx, ry, rz, vai trò]
  const CP = (g, m, x, y, z, sx, sy, sz, rx, ry, rz, role) => [g, m, x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0, role || 'body'];
  function carParts(kind) {
    const S = CAR_SPEC[kind], base = kind === 'taxi' ? 'sedan' : kind, L2 = S.L / 2, W2 = S.W / 2, B = S.belt;
    const H = S.gh[1][1], Wg = S.W - 2.0, zRoof = (S.gh[1][0] + S.gh[2][0]) / 2, zWs = S.gh[3][0];
    const P2 = [];
    P2.push(CP('c:' + base + '_body', 'paint', 0, 0, 0, 1, 1, 1));
    P2.push(CP('c:' + base + '_ghp', 'paint', 0, B, 0, 1, 1, 1, 0, 0, 0, 'cabin'));
    P2.push(CP('c:' + base + '_ghg', 'glass', 0, B, 0, 1, 1, 1, 0, 0, 0, 'cabin'));
    // nội thất tối sau kính (ghế, taplo): kính bán trong không nhìn xuyên ra sau xe
    P2.push(CP('c:' + base + '_gha', 'cabin', 0, B - 0.15, (S.gh[0][0] + zWs) * 0.04, 0.9, 0.86, 0.92, 0, 0, 0, 'cabin'));   // khối nội thất = khoang thu nhỏ
    if (S.van) P2.push(CP('box', 'trim', 0, B - 0.1, -2, S.W + 0.12, 0.35, S.L * 0.6));   // gân thùng tôn
    if (S.rails) for (const sx of [1, -1]) P2.push(CP('box', 'trim', sx * (Wg / 2 - 1.2), B + H + 0.5, zRoof, 0.4, 0.45, Math.abs(S.gh[2][0] - S.gh[1][0]) + 1, 0, 0, 0, 'cabin'));
    if (S.bed) {
      // thùng hàng bán tải: 2 thành + bửng sau, sàn thùng, gờ mép thùng
      const bz0 = S.gh[0][0] - 0.8, bz1 = -L2 + 0.5, bl = bz0 - bz1;
      for (const sx of [1, -1]) P2.push(CP('box', 'paint', sx * (W2 - 0.55), B + 1.3, (bz0 + bz1) / 2, 0.8, 2.6, bl), CP('box', 'trim', sx * (W2 - 0.55), B + 2.7, (bz0 + bz1) / 2, 1.0, 0.25, bl));
      P2.push(CP('box', 'paint', 0, B + 1.3, bz1 + 0.35, S.W - 1.2, 2.6, 0.7), CP('box', 'trim', 0, B + 0.1, (bz0 + bz1) / 2, S.W - 2, 0.25, bl - 1));
    }
    if (S.taxi) P2.push(CP('box', 'glow', 0, B + H + 0.85, zRoof, 4.0, 1.4, 2.0, 0, 0, 0, 'cabin'));
    // cản (nhựa đen), lưới tản nhiệt, đèn pha / hậu, gương, tay gạt mưa, biển số, ống xả
    const bumpY = S.clear + 1.3;
    P2.push(CP('box', 'trim', 0, bumpY, L2 - 0.4, S.W * 0.74, 1.6, 1.0), CP('box', 'trim', 0, bumpY, -L2 + 0.4, S.W * 0.74, 1.6, 1.0));
    P2.push(CP('box', 'trim', 0, bumpY + 1.7, L2 - 0.35, S.W * (S.rails ? 0.5 : 0.38), S.rails ? 1.9 : 1.1, 0.5));
    const lightY = bumpY + 2.1;
    for (const sx of [1, -1]) {
      P2.push(CP('box', 'glow', sx * W2 * 0.6, lightY, L2 - 0.55, 2.6, 0.9, 0.7));
      P2.push(CP('box', 'red', sx * W2 * 0.62, lightY + 0.7, -L2 + 0.55, 2.2, 1.1, 0.7));
      P2.push(CP('box', 'paint', sx * (W2 - 0.1), B + 0.85, zWs - 1.9, 1.3, 0.9, 1.0));
      P2.push(CP('box', 'trim', sx * (W2 - 0.9), B + 0.65, zWs - 1.6, 0.6, 0.3, 0.3));
    }
    P2.push(CP('box', 'trim', 1.6, B + 0.25, zWs + 0.5, 4.5, 0.18, 0.3, 0, 0.12, 0), CP('box', 'trim', -2.6, B + 0.25, zWs + 0.6, 4.5, 0.18, 0.3, 0, 0.12, 0));
    P2.push(CP('box', 'plate', 0, bumpY + 0.05, L2 + 0.1, 3.6, 1.0, 0.15), CP('box', 'plate', 0, bumpY + 0.05, -L2 - 0.1, 3.6, 1.0, 0.15));
    P2.push(CP('c:drum', 'trim', W2 * 0.45, S.clear + 0.6, -L2 + 0.6, 0.55, 2.0, 0.55, Math.PI / 2, 0, 0));   // ống xả
    // bánh: lòng hốc bánh tối, lốp, trống phanh, mâm (mặt ngoài quay ra ngoài xe)
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const wx = sx * (W2 - 1.45), rz = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      P2.push(CP('box', 'cabin', sx * (W2 - 3.2), S.r + 0.7, sz * S.wb, 3.0, (S.r + 0.5) * 1.5, (S.r + 0.5) * 2));
      P2.push(CP('c:tire', 'tire', wx, S.r, sz * S.wb, S.r, 2.0, S.r, 0, 0, rz, 'wheel'));
      P2.push(CP('c:drum', 'trim', wx - sx * 0.1, S.r, sz * S.wb, S.r * 0.95, 1.4, S.r * 0.95, 0, 0, rz, 'wheel'));
      P2.push(CP('c:rim', 'rim', wx, S.r, sz * S.wb, S.r, 2.0, S.r, 0, 0, rz, 'wheel'));
    }
    // bóng tối dưới gầm (xe "đứng" trên mặt đường)
    P2.push(CP('c:shadow', 'shadow', 0, 0.35, 0, S.W * 1.25, 1, S.L * 1.08));
    return P2;
  }
  const CAR = {};
  for (const k in CAR_SPEC) CAR[k] = carParts(k);
  // xe tải bản xa theo kiểu thùng của bản chi tiết (CivilCars.truckBodyOf): mui bạt / thùng kín = khối cao phủ thùng
  for (const k of ['dump', 'truck']) {
    CAR[k + '_tarp'] = CAR[k].concat([CP('box', 'cargo', 0, 14.3, -7.3, 15.0, 14.2, 26.4)]);
    CAR[k + '_box'] = CAR[k].concat([CP('box', 'cargo', 0, 14.8, -7.3, 14.9, 15.2, 26.2)]);
  }
  // BẢN XA THEO DÁNG BẢN CHI TIẾT: có CivilCars thì xe tạm (trước khi nạp chi tiết / ngoài tầm nạp) dùng lưới low-poly sinh
  // từ cùng đường cong thân / khoang kính (CivilCars.lodGeometry): đúng dáng, đúng vị trí bánh, kính trong, đèn / lưới đúng
  // chỗ, ốp nhựa đen — lúc đổi sang chi tiết không nhảy hình. civil_cars.js nạp sau props.js nên dựng khi tạo StreetSet
  let carLodReady = false;
  function useCivilLod() {
    if (carLodReady || typeof CivilCars === 'undefined' || !CivilCars.lodGeometry) return;
    carLodReady = true;
    if (CivilCars.envCube) CivilCars.envCube();   // ảnh phản chiếu phố dùng chung (~0,2 s): dựng lúc nạp bản đồ, không giật giữa trận
    for (const kind of ['sedan', 'hatch', 'suv', 'van', 'pickup', 'taxi']) {
      let Lg = null;
      try { Lg = CivilCars.lodGeometry(kind); } catch (e) { console.warn('[props] lỗi dựng bản xa xe', kind, e); }
      if (Lg) CAR[kind] = carPartsLod(kind, Lg);
    }
  }
  function carPartsLod(kind, Lg) {
    const D = CAR_DIM[kind] || CAR_DIM.sedan, base = kind === 'taxi' ? 'sedan' : kind, P2 = [];
    // lưới khoang kính đặt gốc tại D.belt (deformCar ép khoang theo mốc này khi bị cán)
    const reg = (part, g, dy) => { const key = 'c:' + base + '_' + part; if (!CAR_GEO[key]) { const q = g.clone(); if (dy) q.translate(0, -dy, 0); CAR_GEO[key] = q; } return key; };
    // thân / khoang: vật liệu sơn (màu từng xe), vùng nhựa đen / kính tính trong shader (CivilCars.patchLodMaterial khi
    // StreetSet tạo InstancedMesh); đèn pha / hậu / lưới: mảng riêng
    const G = Lg.geo;
    P2.push(CP(reg('lodbody', G.body), 'paint', 0, 0, 0, 1, 1, 1));
    P2.push(CP(reg('lodcab', G.cab, D.belt), 'paint', 0, D.belt, 0, 1, 1, 1, 0, 0, 0, 'cabin'));
    for (const [k, m] of [['glow', 'lampLens'], ['red', 'red'], ['trim', 'trim']]) if (G[k]) P2.push(CP(reg('lod' + k, G[k]), m, 0, 0, 0, 1, 1, 1));
    // nội thất tối sau kính: khoang thu nhỏ (ghế, taplô, trần — nhìn qua kính thấy tối, không thấy xuyên sang bên kia)
    P2.push(CP(reg('lodcab', G.cab, D.belt), 'cabin', 0, D.belt - 0.2, 0, 0.86, 0.88, 0.95, 0, 0, 0, 'cabin'));
    // gương hậu, biển số, hộp đèn taxi, giá nóc SUV, sàn thùng bán tải
    for (const sx of [1, -1]) {
      P2.push(CP('box', 'paint', sx * (Lg.mirror[0] - 0.15), Lg.mirror[1], Lg.mirror[2], 1.15, 0.56, 0.34, 0, -sx * 0.18, 0));
      P2.push(CP('box', 'trim', sx * (Lg.mirror[0] - 0.8), Lg.mirror[1] - 0.22, Lg.mirror[2] + 0.05, 0.4, 0.16, 0.26));
      if (Lg.suv) P2.push(CP('box', 'trim', sx * (Lg.plan(0) + 0.28), 2.45, 0.2, 0.74, 0.16, 15));   // bậc bước chân
    }
    for (const [y, z] of Lg.plates) P2.push(CP('box', 'plate', 0, y, z, 4.4, 1.05, 0.12));
    if (kind === 'taxi') P2.push(CP('box', 'amber', 0, Lg.roof(-1.5) + 0.65, -1.5, 3.4, 1.1, 1.3, 0, 0, 0, 'cabin'));
    if (Lg.suv) for (const sx of [1, -1]) {
      const z0 = 2.4, z1 = -13, x = Lg.plan(-5) - Lg.inset - Lg.tumble - 0.3;
      P2.push(CP('box', 'trim', sx * x, Lg.roof(-5) + 0.2, (z0 + z1) / 2, 0.22, 0.22, z0 - z1, 0, 0, 0, 'cabin'));
    }
    if (Lg.pickup) P2.push(CP('box', 'trim', 0, 5.4, -13.8, 12.8, 0.25, 12.4));
    // bánh: lốp, trống phanh, mâm (mặt ngoài quay ra ngoài xe) ở đúng vết bánh / cầu của bản chi tiết
    for (const sx of [1, -1]) for (const az of [Lg.axleF, Lg.axleR]) {
      const wx = sx * Lg.trackHalf, rz = sx > 0 ? -Math.PI / 2 : Math.PI / 2, r = Lg.r;
      P2.push(CP('c:tire', 'tire', wx, r, az, r, Lg.tireW * 1.05, r, 0, 0, rz, 'wheel'));
      P2.push(CP('c:drum', 'trim', wx - sx * 0.1, r, az, r * 0.95, Lg.tireW * 0.8, r * 0.95, 0, 0, rz, 'wheel'));
      P2.push(CP('c:rim', 'rim', wx, r, az, r, Lg.tireW * 1.15, r, 0, 0, rz, 'wheel'));
    }
    P2.push(CP('c:shadow', 'shadow', 0, 0.35, (Lg.zMin + Lg.zMax) / 2, Lg.W * 1.25, 1, (Lg.zMax - Lg.zMin) * 1.08));
    return P2;
  }

  // ---------------------------------------------------------------------------
  // DẤU THỜI GIAN: texture mặt nạ (R chi tiết tối: khe / tay nắm / vệt bẩn · G bụi · B gỉ · A biến thiên) theo uv của
  // thân loft (u dọc thân đuôi -> mũi, v quanh mặt cắt: 0 sườn phải, 0.25 nóc, 0.5 sườn trái, 0.75 gầm)
  // ---------------------------------------------------------------------------
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, f = t => t * t * (3 - 2 * t);
    const h = (a, b) => hash(a * 73856093 ^ b * 19349663 ^ s);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * f(xf) + (c - a) * f(yf) + (a - b - c + d) * f(xf) * f(yf);
  };
  const fbm2 = (x, y, s) => (vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.17);
  const WEAR_TEX = {};
  function wearTex(key) {
    if (WEAR_TEX[key]) return WEAR_TEX[key];
    const Wd = 256, Hd = 128, n = Wd * Hd, R = new Float32Array(n), G = new Float32Array(n), Bc = new Float32Array(n), A = new Float32Array(n);
    const kind = key.split(':')[1], S = CAR_SPEC[kind], seed = key.length * 131;
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
      const p = j * Wd + i, u = i / Wd, v = j / Hd, nz = fbm2(u * 18, v * 9, seed), nz2 = fbm2(u * 46, v * 23, seed + 5);
      A[p] = nz2; R[p] = 0.93 + 0.07 * nz2;
      if (key.startsWith('glass')) { G[p] = 0.25 + 0.75 * nz; Bc[p] = 0; continue; }
      if (key === 'box') { G[p] = 0.3 + 0.6 * nz; Bc[p] = Math.max(0, nz2 - 0.5) * 2; continue; }
      // bụi: tích dày trên mặt ngang (nóc / capô / cốp), mỏng dần xuống sườn, bùn bắn dải chân sườn; gỉ: mép dưới, quanh
      // hốc bánh, mảng lốm đốm
      const top = Math.max(0, 1 - Math.abs(v - 0.25) / 0.14), sideLow = Math.max(0, 1 - Math.abs(v - 0.69) / 0.06) + Math.max(0, 1 - Math.abs(v - 0.81) / 0.06);
      G[p] = Math.min(1, (0.25 + 0.75 * top) * (0.55 + 0.6 * nz) + sideLow * 0.7 * nz2);
      let rust = Math.max(0, (sideLow * 1.2 - 0.3)) * (0.5 + nz) + Math.max(0, nz2 - 0.78) * 2.5;
      if (S) for (const wz of [-S.wb, S.wb]) {
        const uw = (wz + S.L / 2) / S.L, du = Math.abs(u - uw) * S.L;
        if (du < S.r + 1.6 && (v > 0.6 || v < 0.05 || (v > 0.45 && v < 0.62))) rust += Math.max(0, 1 - du / (S.r + 1.6)) * 0.8 * (0.4 + nz);
      }
      Bc[p] = Math.min(1, rust);
    }
    const line = (u0, v0, v1, val, wpx) => { const i = Math.round(u0 * Wd); for (let j = Math.floor(v0 * Hd); j <= Math.ceil(v1 * Hd); j++) for (let d = 0; d < wpx; d++) { const jj = (j + Hd) % Hd, ii = Math.min(Wd - 1, Math.max(0, i + d)); R[jj * Wd + ii] = Math.min(R[jj * Wd + ii], val); Bc[jj * Wd + ii] = Math.min(1, Bc[jj * Wd + ii] + 0.25); } };
    const rect = (u0, v0, du, dv, val) => { for (let j = Math.floor(v0 * Hd); j < Math.ceil((v0 + dv) * Hd); j++) for (let i = Math.floor(u0 * Wd); i < Math.ceil((u0 + du) * Wd); i++) { const jj = (j + Hd) % Hd; if (i >= 0 && i < Wd) R[jj * Wd + i] = Math.min(R[jj * Wd + i], val); } };
    if (S && key.startsWith('body')) {
      const U = z => (z + S.L / 2) / S.L;
      // khe cửa 2 bên + tay nắm; khe nắp capô / cốp; nắp bình xăng; vệt mưa chảy dọc sườn
      for (const [zf, zr] of S.doors) for (const zz of [zf, zr]) { line(U(zz), -0.13, 0.12, 0.35, 1); line(U(zz), 0.38, 0.63, 0.35, 1); }
      for (const [, zr] of S.doors) { rect(U(zr + 0.6), 0.075, 0.03, 0.025, 0.3); rect(U(zr + 0.6), 0.4, 0.03, 0.025, 0.3); }
      const zw = S.gh[3][0];
      line(U(zw + 0.8), 0.13, 0.37, 0.4, 1);
      if (!S.van && !S.bed && kind !== 'hatch') line(U(S.gh[0][0] - 0.7), 0.13, 0.37, 0.4, 1);
      rect(U(-S.L / 2 + 6.5), 0.04, 0.035, 0.05, 0.55);
      // vệt mưa: từ vai xe chảy xuống dọc sườn (sườn phải: v giảm qua 0 về 0.86; sườn trái: v tăng 0.39 -> 0.64), cuốn
      // bụi đi, để lại vệt cáu bẩn
      for (let k = 0; k < 14; k++) {
        const ii = Math.floor(hash(seed + k * 7) * Wd), right = hash(seed + k * 7 + 1) < 0.5, steps = Math.floor((0.1 + hash(seed + k * 7 + 2) * 0.14) * Hd);
        for (let st = 0; st < steps; st++) {
          const jj = ((Math.floor((right ? 0.11 : 0.39) * Hd) + (right ? -st : st)) % Hd + Hd) % Hd, p = jj * Wd + ii;
          G[p] *= 0.55; R[p] = Math.min(R[p], 0.9);
        }
      }
    }
    const c = document.createElement('canvas'); c.width = Wd; c.height = Hd;
    const g2 = c.getContext('2d'), img = g2.createImageData(Wd, Hd);
    for (let p = 0; p < n; p++) { img.data[p * 4] = R[p] * 255; img.data[p * 4 + 1] = G[p] * 255; img.data[p * 4 + 2] = Bc[p] * 255; img.data[p * 4 + 3] = 255; }   // alpha giữ 255: canvas nhân sẵn alpha sẽ làm sai các kênh mặt nạ
    g2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    t.premultiplyAlpha = false;
    return (WEAR_TEX[key] = t);
  }
  // vật liệu có dấu thời gian: màu (theo xe) -> phai bạc theo aWear.z, tối theo khe / vết bẩn (R), gỉ (B x aWear.y),
  // bụi (G x aWear.x); bụi / gỉ làm mất bóng (nhám, hết kim loại)
  function wearMaterial(params, tex, glass) {
    const m = new THREE.MeshStandardMaterial(params);
    m.onBeforeCompile = sh => {
      sh.uniforms.wearMap = { value: tex };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aWear;\nvarying vec3 vWear;\nvarying vec2 vWUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWear = aWear; vWUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D wearMap;\nvarying vec3 vWear;\nvarying vec2 vWUv;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec4 wm = texture2D(wearMap, vWUv);
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * 0.8 + 0.1, vWear.z * 0.75);
          diffuseColor.rgb *= wm.r;
          float rustK = clamp(wm.b * vWear.y * 1.7 - 0.12, 0.0, 1.0);
          float var1 = wm.r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.19, 0.09) * (0.6 + 0.6 * var1), rustK);
          float dustK = clamp(wm.g * vWear.x * ${glass ? '1.1' : '1.25'}, 0.0, 0.93);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.46, 0.39) * (0.85 + 0.25 * var1), dustK);
          ${glass ? 'diffuseColor.a = mix(diffuseColor.a, 1.0, dustK * 0.8);' : ''}
          float wearRough = max(rustK, dustK);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, wearRough);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - wearRough;');
    };
    return m;
  }
  // bóng dưới gầm: gradient tối tâm, mờ dần ra mép
  const shadowTex = () => tex('carShadow', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // nửa rộng hw, nửa dài hl, cao capô hood (mặt xích leo lên trước khi nóc sập), mép dưới kính belt (trên đó là khoang sập
  // khi bị cán), khối lượng m (tấn)
  const CAR_DIM = {
    sedan: { hw: 7.1, hl: 18.7, hood: 6.8, belt: 7.3, m: 1.4 }, hatch: { hw: 6.9, hl: 16.2, hood: 6.8, belt: 7.3, m: 1.2 },
    suv: { hw: 7.5, hl: 19.2, hood: 8.3, belt: 8.8, m: 2.1 }, van: { hw: 7.6, hl: 20.2, hood: 8.0, belt: 8.0, m: 2.4 },
    pickup: { hw: 7.5, hl: 21.2, hood: 7.8, belt: 7.8, m: 2.0 },
    dump: { hw: 7.6, hl: 20.5, hood: 10.5, belt: 10.8, m: 3.2 }
  };
  CAR_DIM.truck = CAR_DIM.dump;
  CAR_DIM.taxi = CAR_DIM.sedan;
  // động lượng (tấn x đv/s) cần để húc gãy / đổ: cột đèn thép, đèn giao thông, nhà chờ, cột điện bê tông cốt thép
  const BREAK_P = { lamp: 140, signal: 190, busStop: 230, pole: 420, canopy: 450, footbridge: 720 };
  // năng lượng (kJ) để ép bẹp hẳn 1 ô tô dưới xích (~ năng lượng biến dạng của cú đâm trực diện 50 km/h): xe con khung liền
  // thân ~150 kJ, SUV / van / bán tải khung cứng hơn, xe tải sắt-xi dầm thép chữ U gấp nhiều lần
  const CRUSH_KJ = { sedan: 150, taxi: 150, hatch: 120, suv: 220, van: 230, pickup: 260, dump: 650, truck: 650 };
  // Đoạn nòng s ({x0..z1}, bán kính ~1,3 đv, bỏ 1/4 sát chốt nằm trên nóc xe) ngập vào hộp ô tô o (mặt bằng xoay + từ mặt
  // đường tới nóc top) chỗ nào sâu nhất: { d: độ ngập, t: vị trí trên nòng, side: ngập qua sườn / đầu xe (không phải qua
  // nóc) } | null
  function barrelInCar(s, o, top) {
    const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle), r = 1.3, bot = o.y - 1;
    let best = null;
    for (let i = 0; i <= 12; i++) {
      const t = 0.25 + 0.75 * i / 12, x = s.x0 + (s.x1 - s.x0) * t - o.x, y = s.y0 + (s.y1 - s.y0) * t, z = s.z0 + (s.z1 - s.z0) * t - o.z;
      const lx = x * ca - z * sa, lz = x * sa + z * ca;
      const pS = Math.min(D.hw + r - Math.abs(lx), D.hl + r - Math.abs(lz)), d = Math.min(pS, top + r - y, y - bot + r);
      if (d <= 0 || (best && d <= best.d)) continue;
      best = best || {};
      best.d = d; best.t = t; best.side = d === pS;
    }
    return best;
  }
  // tháp / nòng về tư thế (yaw, el); hướng / góc lệnh ghi theo tháp thật (như spg.applyWallBarrelBlock)
  function turretTo(u, yaw, el) {
    u.turretGroup.rotation.y = yaw; if (u._turretYaw !== undefined) u._turretYaw = yaw;
    u.barrelPivot.rotation.x = el; if (u.elevation !== undefined) u.elevation = el * 180 / Math.PI;
    if (u.azimuth !== undefined) { const wa = -(yaw + (u.bodyAngle || 0)) * 180 / Math.PI; u.azimuth = ((wa % 360) + 360) % 360; }
  }
  // cụm 3 đèn tại (x, y, z) quay mặt +x (fx = 1) hoặc -x; tilt: cụm treo lệch (khớp treo gỉ gãy 1 bên)
  function signalHead(x, y, z, fx, tilt) {
    const out = [], H = 9.6, rz = tilt || 0;
    const at = (dy) => [x - Math.sin(rz) * dy, y + Math.cos(rz) * dy];
    out.push(P('box', 'sigBody', x, y, z, 2.4, H, 2.8, 0, 0, rz));
    out.push(P('box', 'white', x - fx * 1.35, y, z, 0.12, H + 2.4, 5.6, 0, 0, rz));       // viền phản quang tấm hắt
    out.push(P('box', 'sigBody', x - fx * 1.28, y, z, 0.16, H + 2.0, 5.2, 0, 0, rz));     // tấm hắt đen
    [[3.1, 'lensR'], [0, 'lensA'], [-3.1, 'lensG']].forEach(([dy, m]) => {
      const [px, py] = at(dy);
      out.push(P('cyl', m, px + fx * 1.25, py, z, 1.05, 0.3, 1.05, 0, 0, Math.PI / 2 + rz));
      out.push(P('box', 'sigBody', px + fx * 2.1, py + 1.2, z, 1.8, 0.14, 2.5, 0, 0, rz - fx * 0.18));   // mái chụp
      for (const sz of [-1, 1]) out.push(P('box', 'sigBody', px + fx * 2.0, py + 0.3, z + sz * 1.2, 1.6, 1.8, 0.1, 0, 0, rz));
    });
    return out;
  }
  function signalParts(variant) {
    const p = [
      P('cyl', 'concrete', 0, 0.8, 0, 2.2, 1.6, 2.2),                 // bệ móng
      P('cyl', 'sigPole', 0, 2.2, 0, 1.5, 1.4, 1.5),                  // chân đế bắt bu lông
      P('cyl', 'sigPole', 0, 25, 0, 1.0, 48, 1.0), P('cyl', 'sigPole', 0, 49.2, 0, 1.15, 0.6, 1.15),
      P('box', 'sigPole', 0, 45.5, 11, 1.0, 1.1, 22), P('box', 'sigPole', 0, 45.6, 29, 0.7, 0.8, 16),   // cần vươn thon dần
      P('box', 'sigPole', 0, 41.5, 6.5, 0.45, 0.45, 15.5, -0.52, 0, 0),                                   // thanh chống xiên
      P('box', 'sigBody', 0, 44.6, 33.6, 0.4, 1.6, 0.4),                                                  // khớp treo
      P('box', 'sigBody', 0.9, 13, 0, 1.4, 6, 3.2),                                                        // hộp điều khiển
      P('box', 'sigBody', 0, 19, 1.6, 2.2, 4.8, 2.2), P('box', 'lensR', 0, 20.1, 2.75, 1.4, 1.4, 0.1), P('box', 'lensG', 0, 17.9, 2.75, 1.4, 1.4, 0.1)   // đèn đi bộ
    ];
    p.push(...signalHead(0, 39.2, 34, 1, variant ? 0.32 : 0));
    p.push(...signalHead(-1.2, 30, 0, -1, 0));      // cụm phụ trên cột (hướng xe phía bên kia)
    return p;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const impact = (...a) => { if (typeof spgImpact === 'function') spgImpact(...a); };
  const gameFx = () => { const g = typeof window !== 'undefined' && window.game; return g && g.effectsManager && g.effectsManager.fx || null; };
  const STREET = {
    // đèn đường cao 9 m: mặt bích chân cột bắt 4 bu lông neo xuống vỉa hè, thân ống thép mạ kẽm thuôn dần (Ø 24 -> 13 cm),
    // cửa hộp điện ở chân, nắp đỉnh; cần đèn uốn cong vươn ~2,2 m ra lòng đường; chao đèn kiểu "đầu rắn" thuôn về phía cần,
    // mặt kính phẳng nhìn xuống, chếch lên ~7°; tế bào quang điện trên lưng chao. Mất điện: kính tắt
    lamp: { rad: 1.6, h: 72, walk: true, parts: [
      P('box', 'metal', 0, 0.25, 0, 3.4, 0.5, 3.4),
      // đai ốc + đầu ren bu lông neo (chi tiết nhỏ: hộp, đỡ tam giác — cả bản đồ có hàng trăm cột đèn)
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([a, b]) => [P('box', 'dark', a * 1.25, 0.66, b * 1.25, 0.44, 0.32, 0.44, 0, 0.4, 0),
        P('box', 'dark', a * 1.25, 0.92, b * 1.25, 0.2, 0.3, 0.2)]),
      P('cyl', 'metal', 0, 1.05, 0, 1.14, 1.1, 1.14),                                                                          // cổ hàn chân cột
      P('lampPole', 'metal', 0, 34.5, 0, 1, 69, 1),
      P('box', 'dark', 0, 8, 0.86, 1.1, 2.8, 0.14), P('box', 'metal', 0, 8, 0.93, 0.9, 2.5, 0.12),
      P('cyl', 'metal', 0, 69.2, 0, 0.6, 0.5, 0.6),
      P('lampArm', 'metal', 0, 0, 0, 1, 1, 1),
      P('lampHead', 'sigPole', 0, 71.1, 17.4, 1, 1, 1, -0.12, 0, 0),
      P('lampLens', 'deadLamp', 0, 71.1, 17.4, 1, 1, 1, -0.12, 0, 0),
      P('cyl', 'dark', 0, 72.0, 16.3, 0.35, 0.5, 0.35)] },
    // đèn giao thông kiểu cần vươn: bệ bê tông, cột thép mạ kẽm 6 m, cần vươn thon dần 4,8 m + thanh chống xiên; cụm đèn
    // chính treo trên lòng đường quay về dòng xe tới (+x): vỏ đèn, tấm hắt sau viền trắng phản quang, 3 kính tròn có chụp
    // che nắng (mái + 2 má); cụm phụ trên thân cột cho làn sát lề, đèn đi bộ, hộp điều khiển. Mất điện: kính tắt.
    signal: { rad: 2, h: 48, walk: true, parts: signalParts(false) },
    signalB: { rad: 2, h: 48, walk: true, parts: signalParts(true) },
    // cột điện bê tông ly tâm 10 m: chân móng bệ, thân cột tròn thon dần, xà thép mang 3 bát sứ cách điện, tủ công tơ
    pole: { rad: 2.2, h: 82, walk: true, parts: [
      P('cyl', 'concrete', 0, 2.5, 0, 1.8, 5, 1.8),
      P('cyl', 'concrete', 0, 42, 0, 1.25, 78, 1.25),
      P('box', 'dark', 0, 77.5, 0, 18, 0.9, 0.9),
      P('cyl', 'metal', -7, 79.2, 0, 0.45, 2.4, 0.45),
      P('cyl', 'metal', 0, 79.2, 0, 0.45, 2.4, 0.45),
      P('cyl', 'metal', 7, 79.2, 0, 0.45, 2.4, 0.45),
      P('box', 'sigBody', 0, 22, 1.25, 1.8, 4.2, 1.2)
    ] },
    // nhà chờ xe buýt: mái, vách kính sau lưng, ghế, bảng quảng cáo bên hông
    busStop: { rad: 14, h: 21, walk: true, flat: true, parts: [
      P('cyl', 'metal', 13, 10, -5, 0.5, 20, 0.5), P('cyl', 'metal', -13, 10, -5, 0.5, 20, 0.5), P('cyl', 'metal', 13, 10, 5, 0.5, 20, 0.5), P('cyl', 'metal', -13, 10, 5, 0.5, 20, 0.5),
      P('box', 'roofBlue', 0, 20.6, 0, 30, 1, 13), P('box', 'panel', 0, 10.5, 5.6, 26, 15, 0.4), P('box', 'metal', 0, 4, 3.4, 20, 1, 3), P('box', 'ad', 14.2, 9.5, 0, 0.6, 14, 10)] }
  };
  // Hình riêng của đèn đường (kích thước thật, đặt tỉ lệ 1 — trừ thân cột: cao đơn vị, bán kính thật)
  // cần đèn: ống cong từ trong thân cột (thẳng đứng) uốn ra nằm ngang, đầu cần chui vào đuôi chao; thuôn dần về đầu
  function lampArmGeo() {
    const c = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 66, 0), new THREE.Vector3(0, 71.4, 0), new THREE.Vector3(0, 72.1, 6), new THREE.Vector3(0, 71.2, 14.9));
    const seg = 14, rad = 6, g = new THREE.TubeGeometry(c, seg, 0.38, rad, false), p = g.attributes.position;
    for (let i = 0; i <= seg; i++) {
      const q = c.getPointAt(i / seg), k = 1 - 0.28 * (i / seg);
      for (let j = 0; j <= rad; j++) {
        const v = i * (rad + 1) + j;
        p.setXYZ(v, q.x + (p.getX(v) - q.x) * k, q.y + (p.getY(v) - q.y) * k, q.z + (p.getZ(v) - q.z) * k);
      }
    }
    return g;
  }
  // chao đèn kiểu đầu rắn: vỏ bán elip dài 6 đv (trục z, mũi ở +z), đuôi phía cần hẹp & gù cao, mũi rộng dẹt; đáy hở để kính
  function lampHeadGeo() {
    const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (z + 1) / 2;
      p.setXYZ(i, x * 1.25 * (0.62 + 0.38 * Math.sqrt(t)), y * 0.85 * (1.15 - 0.4 * t), z * 3);
    }
    g.computeVertexNormals();
    return g;
  }
  // mặt kính chao đèn: elip phẳng ngay dưới mép vỏ, quay mặt xuống đất
  function lampLensGeo() {
    const g = new THREE.CircleGeometry(1, 16);
    g.scale(1.02, 2.75, 1); g.rotateX(Math.PI / 2); g.translate(0, -0.03, 0.15);
    return g;
  }
  const UNIT = {
    box: () => new THREE.BoxGeometry(1, 1, 1), cyl: () => new THREE.CylinderGeometry(1, 1, 1, 10),
    lampPole: () => new THREE.CylinderGeometry(0.52, 0.95, 1, 14), lampArm: lampArmGeo, lampHead: lampHeadGeo, lampLens: lampLensGeo
  };
  // phong hoá đồ vật đường phố theo vật liệu (weathering.js): thép mạ kẽm xỉn + gỉ chân cột, sơn bạc màu tróc lộ lót,
  // bê tông ố vệt mưa + rêu chân, kính nhà chờ bám bụi vệt nước, bảng quảng cáo phai nắng
  const STREET_WX = {
    metal: ['galv', { grimeH: 3 }], sigPole: ['galv', { grimeH: 3 }],
    dark: ['paint', { rust: 0.3, space: 'world' }], sigBody: ['paint', { rust: 0.3, space: 'world' }],
    concrete: ['concrete', { grimeH: 4 }],
    white: ['paint', { rust: 0.3, chip: 0.35, space: 'world' }], brand: ['paint', { rust: 0.2, fade: 0.7, space: 'world' }],
    roofBlue: ['paint', { rust: 0.35, space: 'world' }], ad: ['paint', { rust: 0, chip: 0.2, fade: 0.8, stain: 0.7, space: 'world' }],
    panel: ['plastic', { fade: 0, stain: 0.7, streak: 0.8, grime: 0.6, space: 'world' }],
    deadLamp: ['plastic', { fade: 0.2, stain: 0.5, space: 'world' }]
  };

  class StreetSet {
    constructor(T, data, group) {
      this.T = T; this.group = group;
      this.grid = new Map(); this.items = [];
      this.ims = {};          // 'hình|vật liệu' -> { im, list: [Matrix4], cols: [Color] }
      this.wires = [];
      this.moving = new Set();   // ô tô đang trượt sau cú húc
      this.burningSet = new Set(); this.smolderSet = new Set();   // ô tô đang cháy / cháy xong còn âm ỉ khói
      const D = data, S = (x, z) => T.groundAtRaw(x, z);
      const add = (o, parts) => { o.parts = parts; o.seed = ((o.x * 7) ^ (o.z * 13)) | 0; this.items.push(o); this.addGrid(o); };
      for (const l of D.lamps || []) add({ type: 'lamp', x: l.x, z: l.z, angle: l.angle }, STREET.lamp.parts);
      for (const l of D.signals || []) {
        // bỏ hoang lâu năm: cột hơi nghiêng, ~1/3 cụm đèn treo lệch
        const o = { type: 'signal', x: l.x, z: l.z, angle: l.angle }, hs = hash((l.x * 13) ^ (l.z * 7));
        o.roll = (hs - 0.5) * 0.05; o.pitch = (hash(hs * 9999 | 0) - 0.5) * 0.04;
        add(o, (hs * 7 % 1) < 0.33 ? STREET.signalB.parts : STREET.signal.parts);
      }
      const poles = (D.poles || []).map(l => { const o = { type: 'pole', x: l.x, z: l.z, angle: l.angle, link: l.link }; add(o, STREET.pole.parts); return o; });
      for (const l of D.busStops || []) add({ type: 'busStop', x: l.x, z: l.z, angle: l.angle }, STREET.busStop.parts);
      // Dàn xe ô tô dân sự: ban đầu gom nhẹ CAR (InstancedMesh) để tải map tức thì.
      // Trong trận, các xe quanh người chơi sẽ được tải dần (lazy load) thành mô hình chi tiết CivilCars.
      const canUseCivilCars = typeof CivilCars !== 'undefined';
      useCivilLod();
      for (const c of D.cars || []) {
        const o = { type: 'car', x: c.x, z: c.z, angle: c.angle, kind: c.kind, rad: 9, c: 0, d: 0, roll: 0, pitch: 0, skew: 0, squeeze: 0 };
        o.color = new THREE.Color(CAR_FIXED_COL[c.kind] !== undefined && (c.color < 0 || c.kind === 'taxi') ? CAR_FIXED_COL[c.kind] : CAR_COL[Math.max(0, c.color) % CAR_COL.length]);
        if (c.seed !== undefined) o.seed = c.seed | 0;   // seed biến thể từ map (bụi / gỉ / hư hại), không phụ thuộc vị trí
        this.abandon(o);
        add(o, CAR[c.kind] || CAR.sedan);
        // xe tải: kiểu thùng theo seed (cùng hàm với bản chi tiết) -> bản xa đúng dáng, hộp trúng đạn đúng chiều cao thùng
        if ((c.kind === 'dump' || c.kind === 'truck') && canUseCivilCars && CivilCars.truckBodyOf) {
          const tb = CivilCars.truckBodyOf(o.seed, c.kind);
          o.hTop = tb.top; o.cargoColor = tb.color >= 0 ? new THREE.Color(tb.color) : o.color;
          if (CAR[c.kind + '_' + tb.type]) o.parts = CAR[c.kind + '_' + tb.type];
        }
        if (canUseCivilCars) {
          o.civilPending = true;
        }
      }
      // mái che cây xăng + cột bơm; cầu vượt bộ hành — vật cố định (cột / chân cầu chặn xe như đá tảng)
      for (const c of D.canopies || []) this.addCanopy(c);
      for (const f of D.footbridges || []) this.addFootbridge(f);
      for (const o of this.items) {
        o.y = S(o.x, o.z) + (STREET[o.type] && STREET[o.type].walk ? 1.2 : 0);   // trên vỉa hè (cao 15 cm)
        if (o.group) {
          o.group.position.set(o.x, o.y, o.z);
          o.group.rotation.y = o.angle;
          if (o.roll || o.pitch) {
            o.group.rotation.x = o.pitch || 0;
            o.group.rotation.z = o.roll || 0;
          }
          o.slots = [];
        } else {
          o.slots = o.parts.map(p => this.slot(p, o));
        }
      }
      // dây điện: mỗi nhịp giữa 2 cột liên tiếp = 3 dây x 2 đoạn võng
      for (const p of poles) {
        if (p.link < 0 || !poles[p.link]) continue;
        const q = poles[p.link], span = { a: p, b: q, slots: [] };
        for (const off of [-7, 0, 7]) {
          const A = this.armPoint(p, off), B = this.armPoint(q, off), M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - Math.hypot(B[0] - A[0], B[2] - A[2]) * 0.035, (A[2] + B[2]) / 2];
          for (const [u, v] of [[A, M], [M, B]]) span.slots.push(this.wireSlot(u, v));
        }
        (p.spans || (p.spans = [])).push(span); (q.spans || (q.spans = [])).push(span);
        this.wires.push(span);
      }
      for (const k in this.ims) {
        const e = this.ims[k], [g, m] = k.split('|');
        const geo = g.startsWith('c:') ? carGeo(g).clone() : UNIT[g]();
        let mat;
        if (m === 'shadow') mat = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        else if (m === 'paint' || m === 'glass' || m === 'rim') {
          const kind = g.startsWith('c:') ? g.slice(2).split('_')[0] : '', part = g.startsWith('c:') ? g.slice(2).split('_')[1] : '';
          const key = m === 'glass' ? 'glass:' + kind : part === 'body' ? 'body:' + kind : part === 'ghp' ? 'cab:' + kind : 'box';
          mat = wearMaterial(SMAT[m], wearTex(key), m === 'glass');
          // bản xa dáng bản chi tiết: vùng nhựa đen / kính trên thân, khoang (CivilCars)
          if ((part === 'lodbody' || part === 'lodcab') && typeof CivilCars !== 'undefined' && CivilCars.patchLodMaterial)
            CivilCars.patchLodMaterial(mat, kind, part === 'lodcab' ? 'cab' : 'body', part === 'lodcab' ? (CAR_DIM[kind] || CAR_DIM.sedan).belt : 0);
          // thuộc tính dấu thời gian từng xe (bụi, gỉ, phai)
          geo.setAttribute('aWear', new THREE.InstancedBufferAttribute(new Float32Array(e.wear.length ? e.wear : new Array(e.list.length * 3).fill(0)), 3));
        } else {
          mat = new THREE.MeshStandardMaterial(SMAT[m]);
          // cột đèn / cột điện / nhà chờ / mái che bỏ hoang: phong hoá theo vật liệu, độ cao tính từ chân vật (wxBase)
          const wx = STREET_WX[m];
          if (wx && typeof Weathering !== 'undefined' && e.base && e.base.length === e.list.length) {
            Weathering.apply(mat, wx[0], Object.assign({ baseAttr: true }, wx[1]));
            geo.setAttribute('wxBase', new THREE.InstancedBufferAttribute(new Float32Array(e.base), 1));
          }
        }
        const env = typeof VehicleKit !== 'undefined' && VehicleKit.getEnvCube ? VehicleKit.getEnvCube() : null;
        if (env && (m === 'paint' || m === 'glass' || m === 'rim' || m === 'glow' || m === 'red' || m === 'lampLens' || m === 'metal' || m === 'sigPole')) { mat.envMap = env; mat.envMapIntensity = m === 'paint' ? 0.75 : m === 'glass' ? 1.2 : m === 'metal' || m === 'sigPole' ? 0.6 : 0.9; }
        const im = new THREE.InstancedMesh(geo, mat, e.list.length);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(e.list.length * 3).fill(1), 3);
        e.list.forEach((mx, i) => { im.setMatrixAt(i, mx); im.setColorAt(i, e.cols[i]); });
        im.castShadow = m !== 'panel' && m !== 'glow' && m !== 'shadow' && m !== 'glass'; im.receiveShadow = m !== 'shadow'; im.frustumCulled = false;
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.name = 'street_' + k;
        this.group.add(im); e.im = im;
      }
      // tình trạng ban đầu cần InstancedMesh đã dựng: kính vỡ sẵn, xác cháy
      for (const o of this.items) if (o.type === 'car') { if (o.burnt) this.charCar(o, true); else if (o.preBroken) this.shatter(o, true); }
      this.flush();
    }
    key(x, z) { return Math.floor(x / 60) * 1000 + Math.floor(z / 60); }
    addGrid(o) { const k = this.key(o.x, o.z); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); }
    near(x, z, r) {
      const out = [];
      for (let i = Math.floor((x - r) / 60); i <= Math.floor((x + r) / 60); i++)
        for (let j = Math.floor((z - r) / 60); j <= Math.floor((z + r) / 60); j++) { const l = this.grid.get(i * 1000 + j); if (l) for (const o of l) out.push(o); }
      return out;
    }
    upgradeToCivilCar(o) {
      if (!o || !o.civilPending || typeof CivilCars === 'undefined') return;
      o.civilPending = false;
      try {
        let age = 0.35, rust = 0.15, dust = 0.25;
        if (o.burnt) {
          age = 1.0; rust = 0.95; dust = 0.85;
        } else if (o.rusted) {
          age = 0.92; rust = 0.9; dust = 0.65;
        } else if (o.preBroken) {
          age = 0.72; rust = 0.45; dust = 0.6;
        } else if (o.dusty) {
          age = 0.55; rust = 0.25; dust = 0.88;
        } else {
          // xe "còn tốt" trong thành phố bỏ hoang vẫn đỗ ngoài trời nhiều tuần: bụi phủ, kính mờ, lớp bóng xỉn
          age = 0.22 + hash(o.seed + 1) * 0.2; rust = 0.08; dust = 0.34;
        }
        // Tình trạng bỏ hoang (abandon) -> bản chi tiết dựng đúng hư hỏng đó: lốp xẹp / mất bánh đúng bánh, mui võng theo
        // độ lún sẵn c0, kính / đèn / gương / vết móp theo mức hư. Chỉ khi xe đã bị cán / ép thật trong trận (c vượt c0)
        // mới dựng lại vệt xích cán — trước đây xe "hỏng sẵn" / xác cháy nạp vào thành xác bị xe tăng cán bẹp dí
        const cond = o.burnt ? 'burnt' : o.rusted ? 'rusted' : o.preBroken ? 'broken' : o.dusty ? 'dusty' : 'clean';
        const crushed = (o.c || 0) > (o.c0 || 0) + 0.05;
        const carGrp = CivilCars.build(o.kind, {
          color: o.color,
          age,
          rust,
          dust,
          seed: o.seed,
          fuel: o.fuel,
          burnt: o.burnt,
          cond,
          flats: o.flats,
          noWheel: o.noWheel,
          glass: !!o.glassBroken,
          sag: o.burnt ? 0.12 : (o.preBroken ? (o.c0 || 0) : 0),
          crush: crushed ? o.c : 0
        });
        o.group = carGrp;
        carGrp.position.set(o.x, o.y, o.z);
        carGrp.rotation.y = o.angle;
        // bản chi tiết tự nghiêng theo lốp xẹp / mất bánh của nó -> nhóm ngoài chỉ nghiêng phần phát sinh sau (húc, cán)
        carGrp.rotation.x = (o.pitch || 0) - (o.pitch0 || 0);
        carGrp.rotation.z = (o.roll || 0) - (o.roll0 || 0);
        this.group.add(carGrp);

        // Ẩn instance trong InstancedMesh cũ bằng ma trận tỉ lệ = 0
        if (o.slots && o.slots.length) {
          const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
          for (const [k, i] of o.slots) {
            const entry = this.ims[k];
            if (entry && entry.im) {
              entry.im.setMatrixAt(i, zeroMat);
              entry.dirty = true;
            }
          }
          o.slots = [];
        }
        this.flush();
      } catch (e) {
        console.warn('[props] Lỗi nâng cấp xe CivilCars:', e);
      }
    }
    // ma trận thế giới của 1 phần: chân vật (x, y, z) · đổ (quay quanh chân về hướng fall) · bẹp (sy) · hướng vật · phần
    partMatrix(o, p) {
      if (o.type === 'car') { p = this.deformCar(o, p); if (!p) return new THREE.Matrix4().makeScale(0, 0, 0); }
      const local = M4(p[2], p[3], p[4], p[8], p[9], p[10], p[5], p[6], p[7]);
      const base = new THREE.Matrix4().makeRotationY(o.angle);
      // ô tô bị cán lệch một bên / bị húc: thân nghiêng ngang (roll) / chúc (pitch) quanh chân
      if (o.roll || o.pitch) base.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.pitch || 0, 0, o.roll || 0)));
      if (o.squash) base.premultiply(new THREE.Matrix4().makeScale(1, o.squash, 1));
      if (o.fall) {
        const ax = new THREE.Vector3(o.fall[1], 0, -o.fall[0]).normalize();
        base.premultiply(new THREE.Matrix4().makeRotationAxis(ax, o.fallA || 1.35));
      }
      base.premultiply(new THREE.Matrix4().makeTranslation(o.x, o.y - (o.sink || 0), o.z));
      return base.multiply(local);
    }
    // Ô tô biến dạng theo mức bẹp c (bị cán) và hư hại d (bị húc): khoang kính / nóc sập xuống nóc thân, thân dưới ép dẹt
    // và bè ra, lốp lún + choãi ra ngoài, khoang lệch khi bị húc ngang (skew), bị lưỡi ủi dồn thì co ngắn (squeeze)
    deformCar(o, p) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, c = o.c || 0, wide = 1 + 0.12 * c, sq = 1 - (o.squeeze || 0);
      let [g, m, x, y, z, sx, sy, sz, rx, ry, rz, role] = p;
      if (m === 'glass' && o.noGlass) return null;
      if (role === 'wheel') {
        const w = (x > 0 ? 1 : 0) + (z < 0 ? 2 : 0);
        if (o.burnt && m === 'tire') return null;                     // lốp cháy rụi, còn vành sắt
        if (o.noWheel === w) return null;                             // bánh bị tháo / văng mất
        if (o.flats && o.flats[w] && m === 'tire') sx *= 0.62;   // lốp xẹp bẹp dưới vành
        if (o.flats && o.flats[w]) y -= p[5] * 0.32;
        y *= 1 - 0.35 * c; x *= 1 + 0.18 * c; rz += Math.sign(x) * 0.55 * c;
      }
      else if (role === 'cabin') {
        const k = 1 - 0.85 * c, base = D.belt * (1 - 0.5 * c);
        y = base + (y - D.belt) * k; sy *= Math.max(0.12, k); x *= wide; sx *= wide;
        ry += (o.skew || 0) * Math.min(1, (o.d || 0) * 1.5 + c);
      } else { const k = 1 - 0.5 * c; y *= k; sy *= k; x *= wide; sx *= wide; }
      return [g, m, x, y, z * sq, sx, sy, sz * sq, rx, ry, rz, role];
    }
    slot(p, o) {
      const k = p[0] + '|' + p[1], e = this.ims[k] || (this.ims[k] = { list: [], cols: [], wear: [], base: [] });
      e.list.push(this.partMatrix(o, p));
      e.base.push(o.y || 0);   // cao độ chân vật (phong hoá: bùn bám chân, gỉ chân cột)
      const w = o.wear || [0, 0, 0];
      e.wear.push(w[0], w[1], w[2]);
      e.cols.push(p[1] === 'paint' && o.color ? o.color : p[1] === 'cargo' && o.cargoColor ? o.cargoColor : new THREE.Color(1, 1, 1));
      return [k, e.list.length - 1, p];
    }
    armPoint(p, off) {
      const c = Math.cos(p.angle), s = Math.sin(p.angle), y = this.T.groundAtRaw(p.x, p.z) + 1.2 + 77.5;
      return [p.x + c * off, y, p.z - s * off];   // trục x cục bộ quay theo angle: (cos a, 0, -sin a)
    }
    wireSlot(a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0));
      m.multiply(new THREE.Matrix4().makeScale(0.22, 0.22, L));
      m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      const k = 'box|dark', e = this.ims[k] || (this.ims[k] = { list: [], cols: [], wear: [], base: [] });
      e.wear.push(0, 0, 0);
      e.base.push(Math.min(a[1], b[1]) - 78.7);
      e.list.push(m); e.cols.push(new THREE.Color(0.6, 0.6, 0.6));
      return [k, e.list.length - 1];
    }
    addCanopy(c) {
      const w = c.w, d = c.d, parts = [];
      // 4 cột thép tròn có bệ móng bê tông bảo vệ chống va quẹt xe
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const cx = sx * (w / 2 - 14), cz = sz * (d / 2 - 16);
        parts.push(
          P('cyl', 'concrete', cx, 2.0, cz, 3.0, 4.0, 3.0),
          P('cyl', 'white', cx, 24, cz, 1.8, 44, 1.8)
        );
      }
      // Dầm mái phẳng dày dặn, viền thương hiệu phẳng liền mạch mép thành mái
      parts.push(
        P('box', 'white', 0, 46, 0, w, 3.8, d),
        P('box', 'brand', 0, 46, d / 2, w + 0.8, 3.8, 0.8),
        P('box', 'brand', 0, 46, -d / 2, w + 0.8, 3.8, 0.8),
        P('box', 'brand', w / 2, 46, 0, 0.8, 3.8, d),
        P('box', 'brand', -w / 2, 46, 0, 0.8, 3.8, d)
      );
      // Đèn trần chiếu sáng mặt dưới mái cây xăng
      for (const lx of [-w / 4, 0, w / 4]) for (const lz of [-d / 4, d / 4]) {
        parts.push(P('box', 'deadLamp', lx, 43.9, lz, 8, 0.2, 3.6));
      }
      // 2 cụm đảo bơm xăng (bệ bê tông bo mép, cây bơm xăng 2 vòi, màn hình điện tử)
      for (const px of [-w / 4, w / 4]) {
        parts.push(
          P('box', 'concrete', px, 0.8, 0, 16, 1.6, 6.5),
          P('box', 'white', px, 7.5, 0, 5.2, 12, 3.4),
          P('box', 'dark', px, 9.8, 0, 5.4, 3.6, 3.6),
          P('box', 'brand', px, 12.8, 0, 5.4, 2.4, 3.6)
        );
      }
      const o = { type: 'canopy', x: c.x, z: c.z, angle: c.angle, w, d, hp: 180, hpMax: 180, fuel: 1, boulders: [], seed: ((c.x * 7) ^ (c.z * 13)) | 0 };
      this.items.push(o); o.parts = parts; this.addGrid(o);
      const ca = Math.cos(c.angle), sa = Math.sin(c.angle), W = (lx, lz) => [c.x + ca * lx + sa * lz, c.z - sa * lx + ca * lz];
      for (const sx of [1, -1]) for (const sz of [1, -1]) { const [x, z] = W(sx * (w / 2 - 14), sz * (d / 2 - 16)); const b = { x, z, radius: 2.6, height: 46, mat: 'metal' }; this.T.boulders.push(b); o.boulders.push(b); }
      for (const px of [-w / 4, w / 4]) { const [x, z] = W(px, 0); const b = { x, z, radius: 4, height: 12, mat: 'metal' }; this.T.boulders.push(b); o.boulders.push(b); }
    }
    addFootbridge(f) {
      // nhịp ngang qua đại lộ (trục x cục bộ) cao 5,75 m, 2 trụ trên vỉa hè, cầu thang dốc xuống dọc vỉa hè ở 2 đầu
      const S = f.span, y = 46, parts = [P('box', 'concrete', 0, y, 0, S + 8, 2, 20), P('box', 'metal', 0, y + 4, 9.6, S + 8, 4, 0.5), P('box', 'metal', 0, y + 4, -9.6, S + 8, 4, 0.5)];
      const run = 60, tilt = Math.atan2(y, run), L = Math.hypot(y, run);
      for (const sx of [1, -1]) {
        parts.push(P('box', 'concrete', sx * (S / 2), y / 2, 0, 3, y, 3));
        const sz = sx;   // 2 đầu cầu thang ngược chiều nhau
        parts.push(P('box', 'concrete', sx * (S / 2), y / 2, sz * (10 + run / 2), 14, 2, L, sz * tilt, 0, 0));
      }
      const o = { type: 'footbridge', x: f.x, z: f.z, angle: f.angle, span: S, hp: 320, hpMax: 320, boulders: [], seed: ((f.x * 7) ^ (f.z * 13)) | 0 };
      this.items.push(o); o.parts = parts; this.addGrid(o);
      const ca = Math.cos(f.angle), sa = Math.sin(f.angle), W = (lx, lz) => [f.x + ca * lx + sa * lz, f.z - sa * lx + ca * lz];
      for (const sx of [1, -1]) {
        const [x, z] = W(sx * S / 2, 0); const b = { x, z, radius: 2.6, height: y + 2, mat: 'concrete' }; this.T.boulders.push(b); o.boulders.push(b);
        for (const t of [0.35, 0.75]) { const [sx2, sz2] = W(sx * S / 2, sx * (10 + run * t)); const b2 = { x: sx2, z: sz2, radius: 7.5, height: y * (1 - t), mat: 'concrete' }; this.T.boulders.push(b2); o.boulders.push(b2); }
      }
    }
    // CÂY XĂNG BỐC CHÁY VÀ PHÁT NỔ DÂY CHUYỀN
    igniteCanopy(o) {
      if (o.burning || o.burnt) return;
      o.burning = { t: 0, dur: 45, boom: 2.5 };
      this.burningSet.add(o);
      sfx('fuel', o.x, o.y + 6, o.z, 0.7, { h: 6 });
    }
    fuelBlastCanopy(o, fx) {
      if (o.broken) return;
      o.broken = true; o.burnt = true; o.fuel = 0;
      sfx('fuel', o.x, o.y + 6, o.z, 1.4, { h: 12 });
      sfx('sheetMetal', o.x, o.y + 8, o.z, 1.1, { h: 14 });
      if (fx && fx.fire) for (let k = 0; k < 60; k++) {
        const a = Math.random() * 6.283, sp = 15 + Math.random() * 45;
        fx.fire.add({ x: o.x + Math.cos(a) * (o.w * 0.4), y: o.y + 6, z: o.z + Math.sin(a) * (o.d * 0.4), vx: Math.cos(a) * sp, vy: 18 + Math.random() * 40, vz: Math.sin(a) * sp,
          size: 7 + Math.random() * 9, grow: 5, drag: 2.0, grav: -8, life: 0.8 + Math.random() * 0.8, alpha: 1, fadeIn: 0.01, c0: [1, 0.85, 0.4], c1: [0.9, 0.25, 0.04], cell: 1, floor: false });
      }
      if (fx && fx.smoke) for (let k = 0; k < 28; k++) fx.smoke.add({ x: o.x + (Math.random() - 0.5) * o.w, y: o.y + 12, z: o.z + (Math.random() - 0.5) * o.d,
        vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 22, vz: (Math.random() - 0.5) * 20, size: 10 + Math.random() * 8, grow: 12, drag: 0.9, grav: -3.5, life: 5 + Math.random() * 4, alpha: 0.8, fadeIn: 0.05, c0: [0.08, 0.07, 0.06], c1: [0.22, 0.21, 0.2], cell: 0, floor: false });
      o.squash = 0.22; o.fall = [Math.cos(o.angle), Math.sin(o.angle)]; o.fallA = 0.28;
      if (o.boulders) {
        for (const b of o.boulders) { const idx = this.T.boulders.indexOf(b); if (idx >= 0) this.T.boulders.splice(idx, 1); }
        o.boulders.length = 0;
      }
      o.slots.forEach(([k, i]) => {
        if (this.ims[k] && this.ims[k].im) {
          this.ims[k].im.setColorAt(i, new THREE.Color(0.12, 0.1, 0.09));
          this.ims[k].cdirty = this.ims[k].dirty = true;
        }
      });
      this.refresh(o);
      for (const q of this.near(o.x, o.z, 90)) {
        if (q === o || q.type !== 'car' || q.burnt || q.burning) continue;
        const d = Math.hypot(q.x - o.x, q.z - o.z);
        if (d < 85) this.carDamage(q, 80 * (1 - d / 85) + 10, q.x - o.x, q.z - o.z, true, fx);
      }
    }
    // CẦU VƯỢT BỘ HÀNH SẬP ĐỔ
    collapseFootbridge(o, fx) {
      if (o.broken) return;
      o.broken = true;
      sfx('masonry', o.x, o.y + 10, o.z, 1.2, { h: 15 });
      sfx('sheetMetal', o.x, o.y + 12, o.z, 0.9, { h: 10 });
      if (fx && fx.smoke) for (let k = 0; k < 20; k++) fx.smoke.add({ x: o.x + (Math.random() - 0.5) * o.span, y: o.y + 14, z: o.z + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 14, vy: 8 + Math.random() * 12, vz: (Math.random() - 0.5) * 14, size: 7 + Math.random() * 6, grow: 8, drag: 1.5, grav: 2, life: 3.5, alpha: 0.6, fadeIn: 0.04, c0: [0.6, 0.58, 0.54], cell: 2 });
      o.squash = 0.12; o.fall = [0, 1]; o.fallA = 0.18;
      if (o.boulders) {
        for (const b of o.boulders) { const idx = this.T.boulders.indexOf(b); if (idx >= 0) this.T.boulders.splice(idx, 1); }
        o.boulders.length = 0;
      }
      o.slots.forEach(([k, i]) => {
        if (this.ims[k] && this.ims[k].im) {
          this.ims[k].im.setColorAt(i, new THREE.Color(0.55, 0.52, 0.48));
          this.ims[k].cdirty = this.ims[k].dirty = true;
        }
      });
      this.refresh(o);
    }
    refresh(o) {
      if (o.group) {
        o.group.position.set(o.x, o.y, o.z);
        o.group.rotation.y = o.angle;
        o.group.rotation.x = (o.pitch || 0) - (o.pitch0 || 0);   // nghiêng sẵn do bánh: bản chi tiết tự dựng (xem upgradeToCivilCar)
        o.group.rotation.z = (o.roll || 0) - (o.roll0 || 0);
        return;
      }
      o.slots.forEach(([k, i, p]) => { this.ims[k].im.setMatrixAt(i, this.partMatrix(o, p)); this.ims[k].dirty = true; });
    }
    flush() { for (const k in this.ims) { const e = this.ims[k]; if (e.dirty && e.im) { e.im.instanceMatrix.needsUpdate = true; if (e.cdirty) e.im.instanceColor.needsUpdate = true; e.dirty = e.cdirty = false; } } }
    // cột đổ về hướng (dx, dz); dây điện nối vào cột đó đứt (ẩn)
    // NÒNG PHÁO QUÉT / ĐẬP (barrel_sweep.js): nòng nện vào cột đèn / đèn giao thông / cột điện / nhà chờ. Động lượng cú
    // đập (cùng thang với xe húc, BREAK_P) đủ thì cột gãy đổ / nhà chờ sụp theo chiều quét; chưa đủ chỉ nghe tiếng nện
    barrelSweep(S) {
      let hit = null;
      for (const o of this.near(S.cx, S.cz, S.R + 16)) {
        if (o.broken || o.fixed || !STREET[o.type] || o.y === undefined) continue;
        const R = STREET[o.type].rad, H = STREET[o.type].h;
        for (const p of S.pts) {
          if (p.y < o.y - 1 || p.y > o.y + H + S.rb || Math.hypot(p.x - o.x, p.z - o.z) > R + S.rb) continue;
          if (p.P >= (BREAK_P[o.type] || 200)) this.topple(o, p.vx, p.vz, S.fx || gameFx());
          hit = hit || { x: p.x, y: p.y, z: p.z, mat: o.type === 'pole' ? 'stone' : 'pole', mB: o.type === 'pole' ? 3 : 1 };
          break;
        }
      }
      return hit;
    }
    topple(o, dx, dz, fx) {
      if (o.broken || o.fixed) return;
      o.broken = true;
      const l = Math.hypot(dx, dz) || 1, jit = (hash(o.seed) - 0.5) * 0.6;
      const fxd = dx / l * Math.cos(jit) - dz / l * Math.sin(jit), fzd = dx / l * Math.sin(jit) + dz / l * Math.cos(jit);
      if (STREET[o.type] && STREET[o.type].flat) o.squash = 0.35 + hash(o.seed + 3) * 0.1;
      else { o.fall = [fxd, fzd]; o.fallA = 1.3 + hash(o.seed + 5) * 0.22; }
      this.refresh(o);
      for (const sp of o.spans || []) for (const [k, i] of sp.slots) { this.ims[k].im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.ims[k].dirty = true; }
      sfx(o.type === 'pole' ? 'masonry' : o.type === 'busStop' ? 'glass' : 'sheetMetal', o.x, o.y + 4, o.z, 0.45, { h: 4 });
      if (fx && fx.smoke) for (let k = 0; k < 4; k++) fx.smoke.add({ x: o.x + fxd * k * 6, y: o.y + 2, z: o.z + fzd * k * 6, vx: (hash(o.seed + k) - 0.5) * 6, vy: 3, vz: (hash(o.seed + k + 7) - 0.5) * 6,
        size: 1.6, grow: 2, drag: 2, grav: 4, life: 1.1, alpha: 0.4, fadeIn: 0.02, c0: [0.55, 0.53, 0.5], cell: 2 });
    }
    // xe con bị cán: bẹp nóc; bị nổ: cháy đen
    // TÌNH TRẠNG BỎ HOANG (băm theo vị trí -> mọi máy như nhau): bụi / gỉ / phai, còn xăng hay không, độ bền, lốp xẹp,
    // mất bánh, kính vỡ sẵn, xác đã cháy từ trước
    abandon(o) {
      const h = k => hash(o.seed * 7 + k * 101);
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, S = CAR_SPEC[o.kind] || CAR_SPEC.sedan;
      o.hp = o.hpMax = 60 + D.m * 40;                                       // tôn mỏng: đạn pháo nổ gần là nát
      o.fuel = h(4) < 0.6 ? 0.25 + 0.75 * h(5) : 0;                         // 60% còn xăng trong bình (cháy được)
      const st = h(6);
      if (st < 0.08) {
        // 1. Xác xe cháy rụi từ trước: đen than, rỉ sét trơ khung, không kính, sập mui
        o.burnt = true; o.fuel = 0; o.noGlass = true; o.wear = [0.4, 1, 1]; o.sink = S.r * 0.55; o.c = 0.35; o.d = 0.6; o.hp = 0;
      } else if (st < 0.28) {
        // 2. Xe rỉ sét nặng, bỏ hoang lâu năm: sơn bong tróc, đốm nâu đỏ loang lổ, lốp xẹp
        o.rusted = true; o.wear = [0.85, 0.95, 0.85];
        o.flats = [h(7) < 0.7, h(8) < 0.7, h(9) < 0.5, h(10) < 0.5]; if (!o.flats.some(Boolean)) o.flats[0] = true;
        if (h(11) < 0.35) o.noWheel = Math.floor(h(11) * 4);
      } else if (st < 0.48) {
        // 3. Xe hỏng hóc chiến sự, vỡ nát: vết đạn, kính rạn vỡ đục, capô / mui móp méo
        o.preBroken = true; o.c = 0.12 + 0.18 * h(13); o.wear = [0.65, 0.5, 0.7];
        if (h(14) < 0.5) o.flats = [h(7) < 0.5, h(8) < 0.5, false, false];
      } else if (st < 0.72) {
        // 4. Xe cũ bám bụi bẩn, cát đất, sơn bạc màu
        o.dusty = true; o.wear = [0.9, 0.25, 0.4];
      } else {
        // 5. Xe tương đối mới / sạch sẽ, đỗ thông thường (vẫn phủ bụi vài tuần bỏ hoang)
        o.wear = [0.38, 0.1, 0.15];
      }
      if (h(12) < 0.25) o.preBroken = true;
      // thân nghiêng về phía bánh xẹp / mất bánh (bánh: 0 trái trước, 1 phải trước, 2 trái sau, 3 phải sau)
      const low = [0, 1, 2, 3].map(w => (o.flats && o.flats[w] ? 1 : 0) + (o.noWheel === w ? 2.4 : 0));
      o.roll = ((low[0] + low[2]) - (low[1] + low[3])) * 0.035;
      o.pitch = ((low[0] + low[1]) - (low[2] + low[3])) * 0.025;
      o.roll0 = o.roll; o.pitch0 = o.pitch; o.c0 = o.c || 0;   // nghiêng / lún sẵn lúc đỗ (bản chi tiết CivilCars tự dựng)
    }
    // kính vỡ: ô kính rạn trắng đục (vỡ nặng thì rơi hết, xem noGlass)
    shatter(o, silent) {
      if (o.glassBroken) return;
      // lúc dựng bản đồ (silent): chưa nạp bản chi tiết — tình trạng kính vỡ sẵn đi theo cond 'broken' khi nạp
      if (o.civilPending && !silent) this.upgradeToCivilCar(o);
      o.glassBroken = true;
      const api = o.group && o.group.userData && o.group.userData.crush;
      if (api && api.breakGlass) api.breakGlass();
      o.slots.forEach(([k, i, p]) => { if (p[1] === 'glass' && this.ims[k].im) { this.ims[k].im.setColorAt(i, new THREE.Color(1.9, 1.9, 1.95)); this.ims[k].cdirty = this.ims[k].dirty = true; } });
      if (!silent) sfx('glass', o.x, o.y + 8, o.z, 0.5, { h: 8 });
    }
    setWear(o, w) {
      o.wear = w;
      o.slots.forEach(([k, i]) => { const e = this.ims[k], a = e.im && e.im.geometry.attributes.aWear; if (a) { a.setXYZ(i, w[0], w[1], w[2]); a.needsUpdate = true; } });
    }
    // xác cháy: sơn cháy rộp đen nâu, mâm gỉ, kính / lốp cháy rụi, thân lún xuống vành sắt
    charCar(o, init) {
      if (o.civilPending && !init) this.upgradeToCivilCar(o);   // xác cháy sẵn lúc dựng bản đồ: nạp chi tiết dần như xe khác
      o.burnt = true; o.noGlass = true; o.fuel = 0;
      o.sink = Math.max(o.sink || 0, (CAR_SPEC[o.kind] || CAR_SPEC.sedan).r * 0.55);
      if (o.group && o.group.userData && o.group.userData.crush) {
        o.group.userData.crush.ignite(0, 4, 0);
      }
      this.setWear(o, [0.3, 1, 1]);
      o.slots.forEach(([k, i, p]) => {
        const e = this.ims[k], m = p[1];
        if (!e.im) return;
        const col = m === 'paint' ? [0.2, 0.15, 0.11] : m === 'rim' ? [0.45, 0.3, 0.2] : (m === 'trim' || m === 'cabin') ? [0.12, 0.1, 0.09] : (m === 'glow' || m === 'red' || m === 'plate') ? [0.16, 0.14, 0.12] : null;
        if (col) { e.im.setColorAt(i, new THREE.Color(col[0], col[1], col[2])); e.cdirty = e.dirty = true; }
      });
      this.refresh(o);
    }
    // Ô tô nhận sát thương dmg (thang máu ô tô): móp / vỡ kính / khung oằn theo mức; còn xăng thì bắt lửa khi nát, trúng
    // đạn cháy hoặc nổ mạnh gần bình xăng. (dx, dz): hướng từ nguồn nổ tới xe -> bên bị móp
    carDamage(o, dmg, dx, dz, inc, fx, ammo, impact) {
      if (dmg <= 0) return;
      if (o.civilPending) this.upgradeToCivilCar(o);
      const visualHit=()=>{
        const api=o.group&&o.group.userData&&o.group.userData.crush;if(!api)return;
        const ca=Math.cos(o.angle),sa=Math.sin(o.angle);
        const px=impact?impact.x-o.x:-dx,pz=impact?impact.z-o.z:-dz;
        const lx=px*ca-pz*sa,lz=px*sa+pz*ca,dist=Math.hypot(lx,lz);
        const nx=dist>0.01?lx/dist:0,nz=dist>0.01?lz/dist:1;
        const height=impact?Math.max(2.0,impact.y-(o.y||0)):4;
        const reach=Math.max(28,dist+2);
        api.shoot(nx*reach,height,nz*reach,-nx,0,-nz,ammo||(inc?'INCENDIARY':(dmg>50?'HE':'SCOUT_BULLET')));
      };
      if(o.burning||o.burnt){visualHit();return;}
      o.hp -= dmg;
      const ca = Math.cos(o.angle), sa = Math.sin(o.angle), lx = dx * ca - dz * sa;
      this.dent(o, dmg * 60, lx >= 0 ? -1 : 1);
      if (dmg > 12) this.shatter(o);
      if (dmg > 45) o.noGlass = true;                                                // kính vỡ vụn rơi hết
      if (o.hp < o.hpMax * 0.35) o.c = Math.max(o.c, 0.12 + 0.25 * (1 - Math.max(0, o.hp) / o.hpMax));   // khung oằn, nóc lõm
      visualHit();
      const ign = o.fuel > 0 && (o.hp <= 0 || (inc && hash(o.seed + Math.round(o.hp * 3)) < 0.55) || (dmg > 35 && hash(o.seed + 17 + Math.round(dmg)) < o.fuel * 0.6));
      if (ign) this.ignite(o);
      else if (o.hp <= 0 && !o.wrecked) { o.wrecked = true; o.noGlass = true; this.setWear(o, [Math.min(1, o.wear[0] + 0.2), Math.min(1, o.wear[1] + 0.3), o.wear[2]]); }
      this.refresh(o);
    }
    // bắt lửa: cháy ~30-70 s theo lượng xăng; bình còn nhiều xăng thì vài giây sau nổ
    ignite(o) {
      if (o.burning || o.burnt) return;
      const h = hash(o.seed + 31);
      o.burning = { t: 0, dur: 30 + 40 * o.fuel + 15 * h, boom: !['truck','dump'].includes(o.kind) && o.fuel > 0.45 ? 2.5 + 4 * h : -1, acc: 0, snd: 0 };
      o.fuel = 0;
      this.burningSet.add(o);
      if (o.group && o.group.userData && o.group.userData.crush) {
        o.group.userData.crush.ignite(0, 4, -8);
      }
      sfx('fuel', o.x, o.y + 6, o.z, 0.55, { h: 6 });
    }
    // bình xăng nổ: quả cầu lửa, mảnh tôn bay, sóng nóng đốt / làm móp ô tô sát bên (cháy lan)
    fuelBlast(o, fx) {
      sfx('fuel', o.x, o.y + 6, o.z, 1, { h: 8 });
      sfx('sheetMetal', o.x, o.y + 6, o.z, 0.9, { h: 10 });
      if (fx && fx.fire) for (let k = 0; k < 36; k++) {
        const a = Math.random() * 6.283, sp = 10 + Math.random() * 30;
        fx.fire.add({ x: o.x + Math.cos(a) * 3, y: o.y + 6, z: o.z + Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: 14 + Math.random() * 30, vz: Math.sin(a) * sp,
          size: 5 + Math.random() * 7, grow: 4, drag: 2.2, grav: -6, life: 0.6 + Math.random() * 0.6, alpha: 1, fadeIn: 0.01, c0: [1, 0.78, 0.36], c1: [0.8, 0.22, 0.03], cell: 1, floor: false });
      }
      if (fx && fx.smoke) for (let k = 0; k < 16; k++) fx.smoke.add({ x: o.x + (Math.random() - 0.5) * 10, y: o.y + 10, z: o.z + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 16, vy: 16 + Math.random() * 16, vz: (Math.random() - 0.5) * 16, size: 8 + Math.random() * 6, grow: 9, drag: 1, grav: -3, life: 4 + Math.random() * 3, alpha: 0.7, fadeIn: 0.05, c0: [0.08, 0.07, 0.06], c1: [0.25, 0.24, 0.23], cell: 0, floor: false });
      this.carDamage(o, 999, 0, 0, false, fx);
      o.c = Math.max(o.c, 0.3); o.d = 1;
      for (const q of this.near(o.x, o.z, 60)) {
        if (q === o || q.type !== 'car' || q.burnt || q.burning) continue;
        const d = Math.hypot(q.x - o.x, q.z - o.z);
        if (d < 55) this.carDamage(q, 55 * (1 - d / 55) + 5, q.x - o.x, q.z - o.z, true, fx);
      }
      this.refresh(o);
    }
    // Đạn bay tới (x, y, z) trúng thân ô tô (chưa bẹp dí) -> nổ / dừng trên thân xe như trúng xác xe (tôn mỏng)
        // Đoạn đạn bay từ a tới b cắt qua thân xe ô tô (hộp AABB trong toạ độ xe)
    segmentHit(ax, ay, az, bx, by, bz) {
    if (ax && typeof ax === 'object' && ay && typeof ay === 'object') {
      const a = ax, b = ay; ax = a.x; ay = a.y; az = a.z; bx = b.x; by = b.y; bz = b.z;
    }
      let bestT = 1.0, hitObj = null, hitNorm = null;
      for (const o of this.items) {
        if (o.type !== 'car' || o.c >= 0.85) continue;
        const D = CAR_DIM[o.kind] || CAR_DIM.sedan;
        const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
        const topH = Math.max(D.belt + 6, o.hTop || 0) * (1 - 0.5 * (o.c || 0));   // hTop: thùng xe tải cao (mui bạt / thùng kín)
        const hw = D.hw + 0.5, hl = D.hl + 0.5, yMin = o.y - 1, yMax = o.y + topH;
        
        // Chuyển hai đầu đoạn thẳng về toạ độ địa phương của xe
        const dx0 = ax - o.x, dz0 = az - o.z;
        const lx0 = dx0 * ca + dz0 * sa, lz0 = -dx0 * sa + dz0 * ca, ly0 = ay;
        const dx1 = bx - o.x, dz1 = bz - o.z;
        const lx1 = dx1 * ca + dz1 * sa, lz1 = -dx1 * sa + dz1 * ca, ly1 = by;
        
        const rdx = lx1 - lx0, rdy = ly1 - ly0, rdz = lz1 - lz0;
        let tmin = 0, tmax = 1;
        let nSignX = 0, nSignY = 0, nSignZ = 0;
        
        // Trục X
        if (Math.abs(rdx) < 1e-6) {
          if (lx0 < -hw || lx0 > hw) continue;
        } else {
          let t1 = (-hw - lx0) / rdx, t2 = (hw - lx0) / rdx;
          let s = -1; if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
          if (t1 > tmin) { tmin = t1; nSignX = s; nSignY = 0; nSignZ = 0; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        // Trục Y
        if (Math.abs(rdy) < 1e-6) {
          if (ly0 < yMin || ly0 > yMax) continue;
        } else {
          let t1 = (yMin - ly0) / rdy, t2 = (yMax - ly0) / rdy;
          let s = -1; if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
          if (t1 > tmin) { tmin = t1; nSignX = 0; nSignY = s; nSignZ = 0; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        // Trục Z
        if (Math.abs(rdz) < 1e-6) {
          if (lz0 < -hl || lz0 > hl) continue;
        } else {
          let t1 = (-hl - lz0) / rdz, t2 = (hl - lz0) / rdz;
          let s = -1; if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
          if (t1 > tmin) { tmin = t1; nSignX = 0; nSignY = 0; nSignZ = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        
        if (tmin >= 0 && tmin < bestT) {
          bestT = tmin;
          hitObj = o;
          // Pháp tuyến quay về toạ độ thế giới
          const nx = nSignX * ca - nSignZ * sa;
          const nz = nSignX * sa + nSignZ * ca;
          hitNorm = new THREE.Vector3(nx, nSignY, nz);
        }
      }
      if (hitObj) {
        return {
          t: bestT,
          point: new THREE.Vector3(ax + (bx - ax) * bestT, ay + (by - ay) * bestT, az + (bz - az) * bestT),
          normal: hitNorm,
          car: hitObj
        };
      }
      return null;
    }
    hitTest(x, y, z) {
      for (let i = Math.floor((x - 24) / 60); i <= Math.floor((x + 24) / 60); i++) for (let j = Math.floor((z - 24) / 60); j <= Math.floor((z + 24) / 60); j++) {
        const l = this.grid.get(i * 1000 + j);
        if (l) for (const o of l) {
          if (o.type !== 'car' || o.c >= 0.85 || Math.abs(o.x - x) > 22 || Math.abs(o.z - z) > 22) continue;
          const S = CAR_SPEC[o.kind] || CAR_SPEC.sedan, top = o.y - (o.sink || 0) + Math.max(S.belt + S.gh[1][1], o.hTop || 0) * (1 - 0.6 * o.c);
          if (y < o.y - 1 || y > top) continue;
          const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle), tx = x - o.x, tz = z - o.z;
          if (Math.abs(tx * ca - tz * sa) <= D.hw && Math.abs(tx * sa + tz * ca) <= D.hl) return { hit: true, type: 'BOULDER', x, y, z, car: true };
        }
      }
      return null;
    }
    damageAt(x, y, z, A, fx, ammo) {
      const small = A.power < 0.3, inc = ['INCENDIARY','INCENDIARY_HMG','SCOUT_INCENDIARY'].includes(ammo);
      const R = small ? 6 : A.radius;
      for (const o of this.near(x, z, R + 36)) {
        if (o.fixed && o.type !== 'canopy' && o.type !== 'footbridge') continue;
        if (o.type === 'car') {
          // khoảng cách từ tâm nổ tới thân xe (hộp mặt bằng + chiều cao), không phải tới tâm xe
          const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle), tx = x - o.x, tz = z - o.z;
          const ex = Math.max(0, Math.abs(tx * ca - tz * sa) - D.hw), ez = Math.max(0, Math.abs(tx * sa + tz * ca) - D.hl), ey = Math.max(0, y - (o.y + Math.max(D.belt + 5, (o.hTop || 0) - 1)));
          const d = Math.hypot(ex, ez, ey);
          if (d >= R) continue;
          if (small) { this.carDamage(o, 3 + 8 * A.power, o.x - x, o.z - z, inc, fx, ammo, {x,y,z}); continue; }
          const k = 1 - d / R;
          this.carDamage(o, A.power * 140 * k * k + 6, o.x - x, o.z - z, inc, fx, ammo, {x,y,z});
          // sóng nổ hất ô tô trượt đi
          if (A.power * k > 0.3 && !o.burnt) {
            const l = Math.hypot(o.x - x, o.z - z) || 1, v = 70 * A.power * k;
            o.vx = (o.x - x) / l * v; o.vz = (o.z - z) / l * v; o.w = (hash(o.seed + Math.round(x)) - 0.5) * 2 * A.power * k;
            this.moving.add(o);
          }
        } else if (o.type === 'canopy') {
          const d = Math.hypot(o.x - x, o.z - z);
          const reach = R + (o.w || 40) * 0.5;
          if (d < reach) {
            const k = 1 - d / reach;
            o.hp -= A.power * 130 * k * k + (inc ? 35 : 5);
            if (inc || o.hp < 110) this.igniteCanopy(o);
            if (o.hp <= 0 && !o.broken) this.fuelBlastCanopy(o, fx);
          }
        } else if (o.type === 'footbridge') {
          const d = Math.hypot(o.x - x, o.z - z);
          const reach = R + (o.span || 60) * 0.5;
          if (d < reach) {
            const k = 1 - d / reach;
            o.hp -= A.power * 150 * k * k;
            if (o.hp <= 0 && !o.broken) this.collapseFootbridge(o, fx);
          }
        } else if (!small) {
          const d = Math.hypot(o.x - x, o.z - z, Math.max(0, o.y - y));
          if (d < A.radius * 0.6) this.topple(o, o.x - x, o.z - z, fx);
        }
      }
      this.flush();
    }
    // Va chạm xe (đi qua / húc) với ô tô / cột tính trong vehicleContact theo khối lượng & tốc độ cho mọi xe; game.js vẫn
    // gọi crush mỗi khung cho cây / rào -> ở đây không làm gì
    crush() {}

    // ---------------------------------------------------------------------------
    // VA CHẠM XE <-> Ô TÔ / CỘT
    // ---------------------------------------------------------------------------
    // Hộp thân xe khi tâm ở (x, z) (như spgVehObb ở spg.js)
    unitObb(u, x, z, out) {
      const B = VehicleCollision.hullBox(u), a = u.bodyAngle || 0, ca = Math.cos(a), sa = Math.sin(a), o = out || this._ub || (this._ub = {});
      const lcx = (B.minX + B.maxX) / 2, lcz = (B.minZ + B.maxZ) / 2;
      o.cx = x + lcx * ca + lcz * sa; o.cz = z - lcx * sa + lcz * ca; o.ux = ca; o.uz = -sa; o.hu = (B.maxX - B.minX) / 2; o.hv = (B.maxZ - B.minZ) / 2;
      return o;
    }
    carObb(o, x, z, ang, out) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, a = ang === undefined ? o.angle : ang, b = out || this._cb || (this._cb = {});
      b.cx = x === undefined ? o.x : x; b.cz = z === undefined ? o.z : z; b.ux = Math.cos(a); b.uz = -Math.sin(a);
      b.hu = D.hw * (1 + 0.12 * o.c); b.hv = D.hl * (1 - (o.squeeze || 0));
      return b;
    }
    /**
     * Xe đi từ (x0, z0) tới (x1, z1) trong khung: va chạm với ô tô / cột trên phố. Trả về vị trí đã chỉnh để thân xe không
     * lồng vào ô tô / cột còn đứng. proxy = xe bản sao mạng (vị trí do máy chủ của nó quyết): chỉ tác động lên đồ vật
     */
    vehicleContact(unit, x0, z0, x1, z1, dt, proxy) {
      const out = this._vcOut || (this._vcOut = { x: 0, z: 0 });
      out.x = x1; out.z = z1;
      if (typeof VehicleCollision === 'undefined' || !dt || unit.isDead) return out;
      const reach = VehicleCollision.reach(unit), near = this.near(x1, z1, reach + 26);
      if (!near.length) return out;
      const sp = unit.speed || 0, fa = unit.bodyAngle || 0;
      const ctx = this._ctx || (this._ctx = {});
      ctx.unit = unit; ctx.dt = dt; ctx.proxy = proxy; this._dt = dt;
      ctx.mvx = proxy ? -Math.sin(fa) * sp * dt : x1 - x0; ctx.mvz = proxy ? -Math.cos(fa) * sp * dt : z1 - z0;
      ctx.tracked = !unit.isWheeled;
      // xe 6 nòng lắp lưỡi ủi (mặc định, chưa bị bắn văng): lưỡi ủi dồn ô tô bẹp về trước thay vì leo lên
      ctx.dozer = unit.tankType === 'GATLING' && (!unit.frontId || unit.frontId === 'dozer') && (typeof VehicleDamage === 'undefined' || !VehicleDamage.hasPart || VehicleDamage.hasPart(unit, 'dozer'));
      for (const o of near) {
        if (o.type === 'car') this.carContact(o, ctx, out);   // (nòng / tháp vào ô tô: barrelCars, sau khi đặt tư thế tháp)
        else if (!o.broken && !o.fixed && STREET[o.type]) this.poleContact(o, ctx, out);
      }
      this.flush();
      return out;
    }
    firstTouch(o, u) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now(), first = !(o._hu === u.id && now - o._ht < 400);
      o._hu = u.id; o._ht = now;
      return first;
    }
    // Cột đèn / đèn giao thông / nhà chờ / cột điện: đủ động lượng thì gãy đổ theo hướng húc, không đủ thì chặn xe như cột
    poleContact(o, ctx, out) {
      const u = ctx.unit, ub = this.unitObb(u, out.x, out.z), R = STREET[o.type].rad;
      const tx = o.x - ub.cx, tz = o.z - ub.cz, lu = tx * ub.ux + tz * ub.uz, lv = -tx * ub.uz + tz * ub.ux;
      const cu = clamp(lu, -ub.hu, ub.hu), cv = clamp(lv, -ub.hv, ub.hv);
      const inside = Math.abs(lu) < ub.hu && Math.abs(lv) < ub.hv;
      const px = ub.cx + cu * ub.ux - cv * ub.uz, pz = ub.cz + cu * ub.uz + cv * ub.ux;
      const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz);
      if (!inside && d >= R) return;
      const v = Math.hypot(ctx.mvx, ctx.mvz) / ctx.dt, Pm = (u.mass || 40) * v, thr = BREAK_P[o.type] || 200;
      const first = this.firstTouch(o, u), pos = { x: o.x, y: o.y + 6, z: o.z };
      if (Pm >= thr || (ctx.tracked && v > 2.5)) {
        if (o.type === 'canopy') this.fuelBlastCanopy(o, gameFx());
        else if (o.type === 'footbridge') this.collapseFootbridge(o, gameFx());
        else this.topple(o, ctx.mvx, ctx.mvz, gameFx());
        if (!ctx.proxy) u.speed *= 1 - Math.min(0.2, thr / Math.max(Pm, 1) * 0.12);
        impact(u, o.type === 'pole' ? 'concrete' : 'pole', pos, v, 0, u.mass || 40, 1.2, true, null);
        return;
      }
      if (ctx.proxy) return;
      // không đủ đà húc gãy: cột chặn lại, thân xe tì vào cột (không xuyên)
      if (inside) {
        const eu = ub.hu - Math.abs(lu), ev = ub.hv - Math.abs(lv);
        if (eu < ev) { const k = -(eu + R) * Math.sign(lu || 1); out.x += ub.ux * k; out.z += ub.uz * k; }
        else { const k = -(ev + R) * Math.sign(lv || 1); out.x += -ub.uz * k; out.z += ub.ux * k; }
      } else { const k = (R - d) / (d || 1); out.x -= dx * k; out.z -= dz * k; }
      u.speed *= Math.pow(0.6, ctx.dt * 60);
      impact(u, o.type === 'pole' ? 'concrete' : 'pole', pos, v, 0, u.mass || 40, Infinity, first, null);
    }
    // tỉ lệ diện tích ô tô nằm dưới thân xe (lưới 3 x 5 điểm trên mặt bằng ô tô)
    coverage(o, ub) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle);
      let n = 0;
      for (const fx of [-0.7, 0, 0.7]) for (const fz of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const lx = fx * D.hw, lz = fz * D.hl, x = o.x + lx * ca + lz * sa, z = o.z - lx * sa + lz * ca;
        const tx = x - ub.cx, tz = z - ub.cz;
        if (Math.abs(tx * ub.ux + tz * ub.uz) <= ub.hu && Math.abs(-tx * ub.uz + tz * ub.ux) <= ub.hv) n++;
      }
      return n / 15;
    }
    // Xích / gầm xe đang đè lên ô tô: ép bản chi tiết (CivilCars) theo đúng vị trí xe tăng MỖI KHUNG khi còn chồng lên ô tô —
    // trước đây chỉ ép lúc độ phủ dưới xích tăng và thôi hẳn khi c >= 0,7, nên xe tăng chạy dọc qua cả xe mà chỉ đuôi bị bẹp
    // Năng lượng E (kJ) bị tôn / khung ô tô hấp thụ trừ vào động năng xe đang cán: v² -= 2E / m. Động cơ vẫn kéo nên xe
    // không bao giờ dừng hẳn trên xác (giữ tối thiểu ~1,2 m/s bò qua)
    absorbCrush(u, E) {
      if (!(E > 0) || !u.speed) return;
      const UPM = 8, m = (u.mass || 40) * 1000, v = Math.abs(u.speed) / UPM, vMin = Math.min(v, 1.2);
      const v2 = Math.max(vMin * vMin, v * v - 2 * E * 1000 / m);
      u.speed = Math.sign(u.speed) * Math.sqrt(v2) * UPM;
    }
    // Hướng xe tăng: bodyAngle (unit không có trường heading -> trước đây dấu xích luôn quay theo trục thế giới). Truyền kích
    // thước gầm thật (dải xích, gầm giữa) + độ cao đáy xích so với mặt đường dưới ô tô -> bản chi tiết ép MỌI phần nằm dưới
    // xích / gầm xuống tới đó (vách thùng, bạt, phụ kiện cao), không chỉ khung mềm
    crushStamp(o, ctx, ub) {
      const api = o.group && o.group.userData && o.group.userData.crush;
      if (!api) return;
      const u = ctx.unit, ca = Math.cos(o.angle), sa = Math.sin(o.angle), dx = ub.cx - o.x, dz = ub.cz - o.z;
      const c0 = clamp((u.y !== undefined ? u.y : u.group ? u.group.position.y : o.y) - o.y, 0, 12);
      api.stamp(dx * ca - dz * sa, dx * sa + dz * ca, (u.bodyAngle !== undefined ? u.bodyAngle : u.heading || 0) - o.angle, ctx.dt || 0.016, c0, 0, this.tankDim(u));
    }
    // kích thước gầm xe xích theo hộp thân (đv): tc tâm dải xích, tw nửa bề rộng xích, hl nửa dài dải xích, flat đoạn chạm
    // đất, rise độ cong 2 đầu, belly khoảng sáng gầm, bw nửa rộng gầm giữa 2 xích
    tankDim(u) {
      if (u._crushDim && u._crushDimG === u.group) return u._crushDim;
      const B = VehicleCollision.hullBox(u), hw = (B.maxX - B.minX) / 2, hl = (B.maxZ - B.minZ) / 2;
      const tw = clamp(hw * 0.17, 2.0, 3.0), tc = clamp(hw - tw - 0.3, 7, 14), thl = clamp(hl * 0.8, 12, 26);
      u._crushDim = { tc, tw, hl: thl, flat: thl - 4.5, rise: 1.6, belly: 3.4, bw: Math.max(3, tc - tw - 0.3) };
      u._crushDimG = u.group;
      return u._crushDim;
    }
    carContact(o, ctx, out) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, u = ctx.unit, VC = VehicleCollision;
      const ub = this.unitObb(u, out.x, out.z);
      const p = VC.obbPush(ub.cx, ub.cz, ub.ux, ub.uz, ub.hu, ub.hv, this.carObb(o), this._pp || (this._pp = {}));
      if (o.c >= 0.7) {
        if (this.moving.has(o)) { this.moving.delete(o); o.vx = o.vz = o.w = 0; }
        // đã bẹp dí sát đất: không sinh va chạm hộp cứng nữa, xe khác lăn qua nhẹ nhàng — nhưng xích vẫn nghiền tiếp phần xác dưới nó
        if (ctx.tracked && p && p.d > 1e-4) this.crushStamp(o, ctx, ub);
        return;
      }
      if (!p || p.d < 1e-4) return;
      if (o.civilPending) this.upgradeToCivilCar(o);
      const first = this.firstTouch(o, u), nx = p.x / p.d, nz = p.z / p.d;   // n: từ ô tô hướng ra phía xe
      const vn = Math.max(0, -(ctx.mvx * nx + ctx.mvz * nz)) / ctx.dt;     // tốc độ áp vào ô tô
      const mU = u.mass || 40, mC = D.m, pos = { x: o.x + nx * D.hw, y: o.y + 6, z: o.z + nz * D.hw };
      // điểm chạm (gần tâm xe nhất trên mặt bằng ô tô) trong hệ ô tô -> bên bị húc, cánh tay đòn mô-men
      const ca = Math.cos(o.angle), sa = Math.sin(o.angle), tx = ub.cx - o.x, tz = ub.cz - o.z;
      const lx = clamp(tx * ca - tz * sa, -D.hw, D.hw), lz = clamp(tx * sa + tz * ca, -D.hl, D.hl);
      const rx = lx * ca + lz * sa, rz = -lx * sa + lz * ca;
      const isTruck = o.kind === 'dump' || o.kind === 'truck';
      const stepMax = (typeof VehicleCollision !== 'undefined' && VehicleCollision.stepOf) ? VehicleCollision.stepOf(u) : 8.5;
      let canClimb = true;
      if (ctx.dozer && o.c < 0.6) {
        canClimb = false;
      } else if (isTruck) {
        const hittingFront = lz > D.hl * 0.35;
        const alreadyCrushed = (o.c || 0) >= 0.35;
        const tiltedLow = Math.abs(o.roll || 0) > 0.22;
        // xe tăng chủ lực (~60 tấn, leo bậc ~1 m) leo được lên sàn thùng / sắt-xi xe tải nhẹ (~1 m) từ mọi phía rồi nghiền;
        // xe nhẹ hơn chỉ leo được từ đầu cabin thấp hoặc khi xe tải đã bẹp / nghiêng
        const heavy = (u.mass || 40) >= 45 && stepMax >= 8;
        canClimb = heavy || hittingFront || alreadyCrushed || tiltedLow;
      }
      if (ctx.tracked && canClimb) {
        // CÁN: xích leo lên ô tô (mặt đỡ trong vehicleDebris thấp dần), ô tô bẹp theo phần thân nằm dưới xích
        const target = Math.min(1, this.coverage(o, ub) * 1.7);
        if (target > o.c + 0.01) {
          const dc = target - o.c;
          if (!o.c) { o.roll = clamp(-lx / D.hw, -1, 1) * 0.09; o.skew = (hash(o.seed + 3) - 0.5) * 0.3; }   // bên bị đè trước lún hơn
          o.c = target;
          if (o.c > 0.12) this.shatter(o);
          // SỨC CẢN: tôn / khung ô tô hấp thụ năng lượng khi bị ép bẹp -> xe xích mất đà theo phần vừa ép (xe nhẹ / chạy chậm
          // khựng rõ, xe tăng 60 t lao nhanh gần như không chậm); rung khoang lái theo từng nhịp nghiền
          if (!ctx.proxy) this.absorbCrush(u, dc * (CRUSH_KJ[o.kind] || 150));
          if (dc > 0.03) {
            // tiếng tôn mỏng nhăn nheo + khung oằn (lốp nổ / kính vỡ do bản chi tiết báo đúng lúc, xem update)
            sfx('carCrush', o.x, o.y + 4, o.z, clamp(0.4 + dc * 3, 0.4, 1.1), { h: 4 });
            const g = typeof window !== 'undefined' && window.game;
            if (u.isPlayer && g) g.cameraShake = Math.max(g.cameraShake || 0, Math.min(3.5, 0.8 + dc * 9));
            const fxObj = gameFx(); if (fxObj && fxObj.fire && Math.random() < 0.6) { for (let q = 0; q < 6; q++) { fxObj.fire.add({ x: o.x + (Math.random() - 0.5) * 8, y: o.y + 2 + Math.random() * 3, z: o.z + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 45, vy: 8 + Math.random() * 35, vz: (Math.random() - 0.5) * 45, size: 0.8 + Math.random() * 1.2, grow: -0.4, drag: 0.8, grav: 100, life: 0.3 + Math.random() * 0.4, alpha: 1, fadeIn: 0.005, c0: [1, 0.9, 0.5], c1: [1, 0.35, 0.1], cell: 3 }); } }
          }
          this.refresh(o);
          // (nòng pháo quét / tì vào ô tô: barrelCars, gọi từ barrel_sweep.js sau khi đặt tư thế tháp)
        }
        this.crushStamp(o, ctx, ub);
        // vừa chạm, xích chưa kịp leo lên: mũi xe húc ô tô lùi (chậm thì ủi được một đoạn, nhanh thì leo luôn)
        if (!ctx.proxy && o.c < 0.25) { const k = 0.5 / (1 + vn / 20); this.moveCar(o, ctx.mvx * k, ctx.mvz * k, 0, u); }
        if (first) {
          if (!ctx.proxy) u.speed *= 0.9; impact(u, 'car', pos, vn, 0, mU, mC, true, null);
          // mũi xe xích lao vào sườn / đầu ô tô trước khi leo lên: tôn chỗ tì móp lõm, đèn / gương vỡ
          if (vn > 5 && o.c < 0.35) this.ramVisual(o, lx, lz, ctx.mvx, ctx.mvz, 0.5 * (mU * mC / (mU + mC)) * vn * vn);
        }
        return;
      }
      // Xe đã bẹp nhiều (o.c >= 0.45) thì dính cố định xuống đường, không bị đẩy trượt hay xoay tròn nữa
      if (o.c >= 0.45) {
        if (this.moving.has(o)) { this.moving.delete(o); o.vx = o.vz = o.w = 0; }
        return;
      }
      // ĐẨY: xe bánh lốp / lưỡi ủi không cán được — ô tô trượt, xoay sang bên; kẹt tường / xe khác thì xe đẩy phải khựng
      const mEff = mC * (this.moving.has(o) ? 1 : 1.6);   // đang đỗ kéo phanh tay: lốp miết đường, khó đẩy hơn
      const sc = mU / (mU + mEff), want = p.d * sc;
      const Fx = -nx * want, Fz = -nz * want, I = (D.hl * D.hl + D.hw * D.hw) / 3;
      const dTh = clamp((rz * Fx - rx * Fz) / I * 0.9, -0.12, 0.12);
      const moved = this.moveCar(o, Fx, Fz, dTh, u);
      if (!ctx.proxy) {
        const rest = Math.max(0, p.d - moved);   // phần chồng ô tô không nhường được -> xe tự lùi (không xuyên)
        out.x += nx * rest; out.z += nz * rest;
        u.speed *= Math.pow(Math.max(0.3, 1 - 0.35 * (rest / p.d) - 0.1 * (1 - sc)), ctx.dt * 60);
        if (ctx.tracked && isTruck && !canClimb && rest > 0.15) {
          const crushAdd = (rest / D.hw) * ctx.dt * 0.7;
          if (crushAdd > 0.001) {
            o.c = Math.min(0.5, (o.c || 0) + crushAdd);
            this.refresh(o);
            if (Math.random() < ctx.dt * 5) sfx('metalCrush', o.x, o.y + 4, o.z, 0.4, { h: 4 });
          }
        }
      }
      if (first && vn > 6 && o.c < 0.35) {
        // ô tô văng trượt tiếp sau cú húc (ma sát lốp hãm lại) + móp theo năng lượng va chạm
        const vk = Math.min(vn * sc * 0.8, 110);
        o.vx = -nx * vk; o.vz = -nz * vk; o.w = clamp(dTh / ctx.dt * 0.35, -2.5, 2.5);
        this.moving.add(o);
        const mu = mU * mC / (mU + mC);
        this.dent(o, 0.5 * mu * vn * vn, lx >= 0 ? 1 : -1, [lx, lz, ctx.mvx, ctx.mvz]);
      }
      if (ctx.dozer && moved > 0.05) {
        // lưỡi ủi dồn ô tô: bẹp dần + co ngắn theo quãng bị ủi
        o.c = Math.min(0.9, o.c + moved / 70); o.squeeze = Math.min(0.28, o.squeeze + moved / 260);
        if (o.c > 0.15) this.shatter(o);
        this.refresh(o);
        if (Math.random() < ctx.dt * 4) sfx('metalCrush', o.x, o.y + 4, o.z, 0.45, { h: 4 });
      }
      if (first) impact(u, 'car', pos, vn, 0, mU, mC, true, null);
      else if (moved / ctx.dt > 12) impact(u, 'car', pos, 0, moved / ctx.dt, mU, mC, false, null);   // đang ủi ô tô trượt: tiếng cạ / lốp miết đường
      if (moved / ctx.dt > 4) sfx('carSlide', o.x, o.y + 1, o.z, clamp(moved / ctx.dt / 50, 0.3, 0.9));   // lốp ô tô bị ủi miết đường
    }
    // móp méo do bị húc: năng lượng E (tấn x (đv/s)^2 / 2) -> hư hại d; side: bên bị húc (+1 phải / -1 trái theo trục x ô tô)
    // hit = [lx, lz, mvx, mvz]: điểm tì trên mặt bằng ô tô (hệ ô tô) + hướng vật húc lao tới (hệ thế giới) -> bản chi
    // tiết móp đúng chỗ (CivilCars ram); bản gộp InstancedMesh chỉ tối màu sơn / lệch khoang
    dent(o, E, side, hit) {
      const dd = E / 3500;
      if (dd < 0.02) return;
      o.d = Math.min(1, (o.d || 0) + dd);
      o.skew = clamp((o.skew || 0) - side * 0.12 * Math.min(1, dd * 2), -0.2, 0.2);
      o.roll = clamp((o.roll || 0) + side * 0.03 * Math.min(1, dd * 2), -0.1, 0.1);
      if (o.group && hit) this.ramVisual(o, hit[0], hit[1], hit[2], hit[3], E);
      else if (o.d > 0.3) this.shatter(o);
      const k = 1 - 0.22 * o.d;
      o.slots.forEach(([key, i, p]) => { if (p[1] === 'paint' && !o.burnt) { this.ims[key].im.setColorAt(i, o.color.clone().multiplyScalar(k)); this.ims[key].cdirty = this.ims[key].dirty = true; } });
      this.refresh(o);
    }
    // Bản chi tiết (CivilCars) bị húc: (lx, lz) điểm tì hệ ô tô, (mvx, mvz) hướng vật húc lao tới hệ thế giới, E năng lượng
    ramVisual(o, lx, lz, mvx, mvz, E) {
      if (o.civilPending) this.upgradeToCivilCar(o);
      const api = o.group && o.group.userData && o.group.userData.crush;
      if (!api || !api.ram) return;
      const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
      api.ram(lx, lz, mvx * ca - mvz * sa, mvx * sa + mvz * ca, E);
    }
    // NÒNG PHÁO / THÁP PHÁO XOAY VÀO Ô TÔ — barrel_sweep.js gọi mỗi khung cho mọi xe có tháp, SAU khi đặt tư thế tháp / nòng
    // khung này (yaw0 / el0: tư thế khung trước; pa / pb: chốt nòng / đầu nòng theo hình đang hiện -> bù độ nghiêng thân xe
    // trên dốc mà đoạn nòng tính phẳng VehicleCollision.barrelSegment bỏ qua).
    // Điểm nòng tì vào ô tô (hộp thân + nóc / thùng; hình chi tiết CivilCars xác nhận chỗ chạm thật, đục lõm theo thân nòng,
    // vỡ kính, gãy gương) đẩy ô tô theo pháp tuyến mặt bị tì:
    //  · ô tô trượt được: bị gạt trượt / xoay (lốp miết đường), tháp ì hẳn lại — mô-tơ quay tháp phải thắng ma sát lốp của
    //    1,2-3 tấn (xe đỗ kéo phanh tay, bẹp lốp nặng hơn xe đang trôi); thân xe lao tới thì mất đà theo công ma sát
    //  · ô tô kẹt (vướng tường / xe khác) hoặc nòng ép từ trên xuống nóc / capô: tháp / nòng dừng ở tư thế khung trước như chạm
    //    tường (tôn đã lõm theo chỗ nòng nện), xe đang lao tới mà nòng cắm vào ô tô kẹt thì khựng lại
    // Tiếng: lần chạm đầu "rầm" tôn ô tô + ống nòng thép ngân; đang gạt / cà: thép miết tôn rít + lốp ô tô miết đường
    barrelCars(unit, yaw0, el0, dt, pa, pb) {
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      if (!VC || !dt || dt > 0.25 || unit.isDead || !unit.turretGroup || !unit.barrelPivot || yaw0 === undefined) return;
      const ux = unit.x, uy = unit.y || 0, uz = unit.z, ang = unit.bodyAngle || 0;
      const off = this._bcOff || (this._bcOff = [0, 0, 0, 0, 0, 0]);
      const seg = (yw, e, o) => {
        const s = VC.barrelSegment(unit, ux, uy, uz, ang, yw, e, o);
        if (s) { s.x0 += off[0]; s.y0 += off[1]; s.z0 += off[2]; s.x1 += off[3]; s.y1 += off[4]; s.z1 += off[5]; }
        return s;
      };
      off.fill(0);
      const S0 = seg(yaw0, el0, this._bc0 || (this._bc0 = {}));
      if (!S0) return;
      // hình nòng đang hiện (ma trận khung trước, có nghiêng dốc / nhún) lệch so với đoạn nòng tính phẳng ở tư thế khung trước
      if (pa && pb && Math.abs(pa.x - S0.x0) + Math.abs(pa.y - S0.y0) + Math.abs(pa.z - S0.z0) < 10 && Math.abs(pb.x - S0.x1) + Math.abs(pb.y - S0.y1) + Math.abs(pb.z - S0.z1) < 20) {
        off[0] = pa.x - S0.x0; off[1] = pa.y - S0.y0; off[2] = pa.z - S0.z0; off[3] = pb.x - S0.x1; off[4] = pb.y - S0.y1; off[5] = pb.z - S0.z1;
        S0.x0 = pa.x; S0.y0 = pa.y; S0.z0 = pa.z; S0.x1 = pb.x; S0.y1 = pb.y; S0.z1 = pb.z;
      }
      let yaw = unit.turretGroup.rotation.y, el = unit.barrelPivot.rotation.x;
      const S1 = seg(yaw, el, this._bc1 || (this._bc1 = {})), tmp = this._bc2 || (this._bc2 = {});
      // đoạn nòng khung trước (cả thân xe dịch tới) -> vận tốc điểm chạm
      const st = unit._bcar || (unit._bcar = { p: [0, 0, 0, 0, 0, 0], n: 0 }), P = st.p;
      const fresh = st.n++ === 0 || Math.abs(P[0] - S1.x0) + Math.abs(P[2] - S1.z0) > 40;
      const keep = () => { P[0] = S1.x0; P[1] = S1.y0; P[2] = S1.z0; P[3] = S1.x1; P[4] = S1.y1; P[5] = S1.z1; };
      const R = Math.hypot(S1.x1 - S1.x0, S1.z1 - S1.z0) / 2;
      const near = this.near((S1.x0 + S1.x1) / 2, (S1.z0 + S1.z1) / 2, R + 26);
      if (!near.length) { keep(); return; }
      const at = (s, t, k) => k === 0 ? s.x0 + (s.x1 - s.x0) * t : k === 1 ? s.y0 + (s.y1 - s.y0) * t : s.z0 + (s.z1 - s.z0) * t;
      const proxy = !!unit._netProxy, m = unit.mass || 40;
      const V = this._bcV || (this._bcV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const SE = typeof window !== 'undefined' && window.soundEngine;
      let held = false;
      for (const o of near) {
        if (o.type !== 'car' || (o.c || 0) >= 0.7) continue;
        const top = this.carTop(o);
        if (Math.min(S1.y0, S1.y1) > top + 3) continue;
        const hb = barrelInCar(S1, o, top);
        // vừa tì ở khung trước: giữ tiếp xúc tới sát mặt (không nhả / chạm xen kẽ từng khung -> tháp ì đều tay)
        if (!hb || hb.d < (o._bcU === unit.id && now - o._bcT < 120 ? 0.02 : 0.3)) continue;
        if (o.civilPending) this.upgradeToCivilCar(o);
        const api = o.group && o.group.userData && o.group.userData.crush;
        // điểm chạm trên thân nòng (t) và quãng nó đi trong khung: so với cả xe khung trước (dv) / chỉ do tháp xoay, nòng nâng
        // hạ (dT, cùng vị trí thân xe)
        let t = hb.t;
        const pt = k => fresh ? at(S0, t, k) : P[k] + (P[k + 3] - P[k]) * t;
        const step = () => [at(S1, t, 0) - pt(0), at(S1, t, 1) - pt(1), at(S1, t, 2) - pt(2)];
        let dv = step();
        if (api && api.sweepBarrel) {
          V[0].set(S1.x0, S1.y0, S1.z0); V[1].set(S1.x1, S1.y1, S1.z1); V[2].set(dv[0] / dt, dv[1] / dt, dv[2] / dt);
          // hộp chạm nhưng hình thật chưa (nòng lướt trên capô / cốp / thùng thấp hơn nóc cabin): bỏ qua
          if (!api.sweepBarrel(V[0], V[1], 1.25, V[2])) continue;
          const q = api.lastHit;   // chỗ nòng ngập sâu nhất vào hình thật
          if (q) {
            const ex = S1.x1 - S1.x0, ey = S1.y1 - S1.y0, ez = S1.z1 - S1.z0;
            t = clamp(((q.x - S1.x0) * ex + (q.y - S1.y0) * ey + (q.z - S1.z0) * ez) / (ex * ex + ey * ey + ez * ez || 1), 0.25, 1);
            dv = step();
          }
        }
        const D = CAR_DIM[o.kind] || CAR_DIM.sedan;
        const dT = Math.hypot(at(S1, t, 0) - at(S0, t, 0), at(S1, t, 1) - at(S0, t, 1), at(S1, t, 2) - at(S0, t, 2));
        const sp = Math.hypot(dv[0], dv[1], dv[2]) / dt, byHull = Math.hypot(dv[0], dv[1], dv[2]) > dT * 1.5;
        // ô tô bị đẩy theo chiều điểm chạm đang quét ngang (tháp xoay: vuông góc thân nòng; thân xe lao tới: đầu nòng húc dọc
        // trục) khi điểm đó đi VÀO ô tô (về phía tâm xe) — lùi ra / cà dọc thì chỉ cạ. Ép từ trên xuống (hạ nòng xuống nóc /
        // capô): ô tô không nhường xuống đất được
        let hl = Math.hypot(dv[0], dv[2]);
        const inward = dv[0] * (o.x - at(S1, t, 0)) + dv[2] * (o.z - at(S1, t, 2)) > 0, down = dv[1] < -0.005 && -dv[1] > hl * 1.5;
        let moved = 0, stuck = false;
        if (!proxy && (down || (inward && hl > 0.005))) {
          if (down) stuck = true;
          else {
            const mC = D.m * (this.moving.has(o) ? 1 : 1.6) * (1 + (o.c || 0));
            // tháp ì lại khi gạt: chỉ đi được fT phần cú xoay lệnh (mô-tơ quay tháp gạt nổi ~0,6 tấn ma sát lốp mỗi nhịp:
            // xe con đỗ ~1/4 tốc độ quay, xe tải ben ~1/8)
            if (dT > 0.01 && !held) {
              const fT = clamp(0.6 / mC, 0.08, 0.6), dy = Math.atan2(Math.sin(yaw - yaw0), Math.cos(yaw - yaw0));
              yaw = yaw0 + dy * fT; el = el0 + (el - el0) * fT;
              turretTo(unit, yaw, el); seg(yaw, el, S1);
              dv = step(); hl = Math.hypot(dv[0], dv[2]);
            }
            // dời ô tô theo chiều quét: quãng điểm chạm đi được + một phần đang lấn qua sườn / đầu xe; lệch tâm thì ô tô xoay
            const want = hl + (hb.side ? Math.min(0.6, Math.max(0, hb.d - 0.2) * 0.35) : 0);
            const nx = dv[0] / (hl || 1), nz = dv[2] / (hl || 1), Fx = nx * want, Fz = nz * want;
            const rx = at(S1, t, 0) - o.x, rz = at(S1, t, 2) - o.z, I = (D.hl * D.hl + D.hw * D.hw) / 3;
            moved = this.moveCar(o, Fx, Fz, clamp((rz * Fx - rx * Fz) / I * 0.9, -0.08, 0.08), unit);
            if (want > 0.05 && moved < want * 0.4) stuck = true;
            // công ma sát lốp ô tô (~0,6 trọng lượng x quãng trượt): thân xe lao tới mất đà tương ứng
            if (moved > 0 && byHull) this.absorbCrush(unit, 0.6 * mC * 9.81 * moved / 8);
          }
          if (stuck) {
            // giữ tư thế khung trước như chạm tường; chỉ ép xuống nóc thì tháp vẫn xoay, nòng không hạ thêm
            if (dT > 0.01) {
              if (down) el = Math.max(el, el0); else { yaw = yaw0; el = el0; }
              turretTo(unit, yaw, el); seg(yaw, el, S1);
              unit.barrelWallBlocked = held = true;
            }
            // thân xe lao tới: nòng cắm vào ô tô kẹt -> xe khựng lại (tôn tiếp tục lõm theo nòng)
            if (byHull && unit.speed) unit.speed *= 0.3;
          }
        }
        // tiếng: lần chạm đầu (xe này chưa tì ô tô này trong ~0,35 s) / đang tì cà, gạt
        const first = !(o._bcU === unit.id && now - o._bcT < 350);
        o._bcU = unit.id; o._bcT = now;
        const pos = { x: at(S1, t, 0), y: at(S1, t, 1), z: at(S1, t, 2) }, self = !!unit.isPlayer, key = unit.id + '|bcar|' + o.seed;
        // cú nện: tốc độ lao vào; tiếng cà: quãng nòng THỰC đi trong khung (tháp đứng khựng tì vào ô tô kẹt thì im)
        const vNow = held ? Math.hypot(...step()) / dt : sp;
        if (first && sp > 3) {
          if (SE && SE.collideAt) SE.collideAt(pos, { vn: sp, mA: m * (byHull ? 0.6 : 0.1), mB: D.m, mat: 'car', self, yield: !stuck, key, barrel: true });
          const g = typeof window !== 'undefined' && window.game;
          if (self && g) g.cameraShake = Math.max(g.cameraShake || 0, Math.min(2.5, sp / 30));
        } else if (!first && vNow > 6 && SE && SE.scrapeAt) SE.scrapeAt(pos, { vt: vNow, mA: m * 0.1, mat: 'car', self, key });
        if (moved / dt > 4) sfx('carSlide', o.x, o.y + 1, o.z, clamp(moved / dt / 50, 0.3, 0.9));
      }
      keep();
      this.flush();
    }
    // độ cao nóc / nóc thùng ô tô (bẹp thì thấp xuống)
    carTop(o) {
      const S = CAR_SPEC[o.kind] || CAR_SPEC.sedan;
      return o.y - (o.sink || 0) + Math.max(S.belt + S.gh[1][1], o.hTop || 0) * (1 - 0.6 * (o.c || 0));
    }
    // Dời ô tô (dx, dz) + xoay dθ, không lồng vào nhà / đá / ô tô khác / xe khác; vướng thì dời bớt (1/2, 1/4).
    // Trả về quãng đã dời được
    // depth: ô tô bị dồn vào ô tô khác thì đẩy dây chuyền ô tô đó (tối đa 2 xe nối tiếp) — xe nặng ủi được cả hàng xe đỗ
    moveCar(o, dx, dz, dTh, pusher, depth = 0) {
      if (o.civilPending) this.upgradeToCivilCar(o);
      const L = Math.hypot(dx, dz);
      if (L < 1e-4 && Math.abs(dTh) < 1e-5) return 0;
      for (const f of [1, 0.5, 0.25]) {
        const x = o.x + dx * f, z = o.z + dz * f, a = o.angle + dTh * f;
        if (this.carBlocked(o, x, z, a, pusher)) {
          // vướng ô tô khác: dồn nó đi cùng hướng (mất bớt đà do thêm khối lượng), rồi thử lại
          const q = this._whyObj;
          // ô tô bị dồn vào cột đèn / cột điện / nhà chờ: xe đẩy đủ động lượng thì cột gãy theo, ô tô đi tiếp
          if (pusher && q && BREAK_P[this._why] && (pusher.mass || 40) * Math.abs(pusher.speed || 0) * 0.8 >= BREAK_P[this._why] && !q.broken) {
            this.topple(q, dx, dz, gameFx());
            if (!this.carBlocked(o, x, z, a, pusher)) { const ox = o.x, oz = o.z; o.x = x; o.z = z; o.angle = a; o.y = this.T.groundAtRaw(x, z); this.regrid(o, ox, oz); this.refresh(o); return L * f; }
            continue;
          }
          if (!(this._why === 'car' && q && depth < 2 && f === 1 && this.moveCar(q, dx * 0.85, dz * 0.85, 0, pusher, depth + 1) > 0.05 && !this.carBlocked(o, x, z, a, pusher))) continue;
          if (!this.moving.has(q) && L / Math.max(1e-3, this._dt || 0.016) > 20) { q.vx = dx / (this._dt || 0.016) * 0.4; q.vz = dz / (this._dt || 0.016) * 0.4; q.w = 0; this.moving.add(q); }
        }
        const ox = o.x, oz = o.z;
        o.x = x; o.z = z; o.angle = a;
        o.y = this.T.groundAtRaw(x, z);
        this.regrid(o, ox, oz);
        this.refresh(o);
        return L * f;
      }
      return 0;
    }
    carBlocked(o, x, z, a, pusher) {
      const VC = VehicleCollision, cb = this.carObb(o, x, z, a, this._cb2 || (this._cb2 = {})), T = this.T;
      const r = Math.hypot(cb.hu, cb.hv);
      // nhà / công trình
      const obs = (T && typeof T.vehicleObstacles === 'function') ? T.vehicleObstacles(x, z, null) : null;
    if (obs) for (const b of obs) {
        if (b.y1 <= o.y + 2) continue;
        const q = VC.obbPush(cb.cx, cb.cz, cb.ux, cb.uz, cb.hu, cb.hv, b, this._pq || (this._pq = {}));
        if (q && q.d > 0.3) { this._why = 'building'; return true; }
      }
      // đá tảng / xác xe / chân cột mái che (vòng tròn)
      const circ = (cx, cz, rad) => {
        const tx = cx - x, tz = cz - z, lu = clamp(tx * cb.ux + tz * cb.uz, -cb.hu, cb.hu), lv = clamp(-tx * cb.uz + tz * cb.ux, -cb.hv, cb.hv);
        return Math.hypot(tx - lu * cb.ux + lv * cb.uz, tz - lu * cb.uz - lv * cb.ux) < rad;
      };
      if (T && T.boulders) for (const rk of T.boulders) {
        const rad = rk.radius || 18;
        if (Math.abs(rk.x - x) > r + rad || Math.abs(rk.z - z) > r + rad) continue;
        if (circ(rk.x, rk.z, rad * 0.8)) { this._why = 'boulder'; return true; }
      }
      // ô tô khác chưa bẹp, cột còn đứng
      for (const q of this.near(x, z, r + 24)) {
        if (q === o || q.fixed) continue;
        if (q.type === 'car') {
          if (q.c >= 0.85) continue;
          const pq = VC.obbPush(cb.cx, cb.cz, cb.ux, cb.uz, cb.hu, cb.hv, this.carObb(q, undefined, undefined, undefined, this._cb3 || (this._cb3 = {})), this._pq2 || (this._pq2 = {}));
          if (pq && pq.d > 0.3) { this._why = 'car'; this._whyObj = q; return true; }
        } else if (!q.broken && STREET[q.type] && circ(q.x, q.z, STREET[q.type].rad)) { this._why = q.type; this._whyObj = q; return true; }
      }
      // xe khác (trừ xe đang đẩy)
      const units = typeof window !== 'undefined' && window.game && window.game.units;
      if (units) for (const v of units) {
        if (v === pusher || !v.group || !v.group.visible || Math.abs(v.x - x) > r + 60 || Math.abs(v.z - z) > r + 60) continue;
        const ub = this.unitObb(v, v.x, v.z, this._ub2 || (this._ub2 = {})), pv = VC.obbPush(cb.cx, cb.cz, cb.ux, cb.uz, cb.hu, cb.hv, ub, this._pq3 || (this._pq3 = {}));
        if (pv && pv.d > 0.3) { this._why = 'unit'; return true; }
      }
      // mép kè kênh / bậc dốc gắt: ô tô không lăn xuống lòng kênh
      const gy = (T && typeof T.groundAtRaw === 'function') ? T.groundAtRaw(x, z) : o.y;
    if (gy < o.y - 4) { this._why = 'drop'; return true; }
      return false;
    }
    regrid(o, ox, oz) {
      const k0 = this.key(ox, oz), k1 = this.key(o.x, o.z);
      if (k0 === k1) return;
      const l = this.grid.get(k0);
      if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); }
      this.addGrid(o);
    }
    // ô tô đang trượt sau cú húc: ma sát lốp hãm (~0,7 g), quay chậm dần; đâm vào vật khác thì dừng + móp thêm
    update(dt, fx, cam) {
      if (!dt) return;
      // Tải dần xe mới CivilCars trong trận đấu: quét các xe ở gần camera / player và nâng cấp dần
      if (typeof CivilCars !== 'undefined') {
        const camPos = cam || (typeof window !== 'undefined' && window.game && window.game.camera ? window.game.camera.position : null) || (typeof window !== 'undefined' && window.game && window.game.player ? window.game.player : null);
        if (camPos) {
          const nearby = this.near(camPos.x, camPos.z, 600);
          let cand = null, candD2 = Infinity;
          for (let i = 0; i < nearby.length; i++) {
            const item = nearby[i];
            if (item.type === 'car' && item.civilPending) {
              const dx = item.x - camPos.x, dz = item.z - camPos.z, d2 = dx * dx + dz * dz;
              if (d2 < candD2) {
                candD2 = d2;
                cand = item;
              }
            }
          }
          // dựng 1 xe chi tiết mất ~30-60 ms: giãn nhịp ~0,1 s / xe để vào khu nhiều xe không tụt khung liên tục
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (cand && now - (this._lastUpgrade || 0) > 100) {
            this._lastUpgrade = now;
            this.upgradeToCivilCar(cand);
          }
        }
      }
      for (const o of this.items) {
        if (o.type === 'car' && o.group && o.group.userData && o.group.userData.crush) {
          const api = o.group.userData.crush;
          api.update(dt);
          // sự kiện của bản chi tiết (kính vỡ khi húc / nòng quét, lốp nổ): phát tiếng, rút hết để mảng không phình
          const ev = api.drain();
          if (ev.length) {
            if (ev.includes('glass')) sfx('glass', o.x, o.y + 8, o.z, 0.45, { h: 8 });
            if (ev.includes('tire')) sfx('tire', o.x, o.y + 2, o.z, 0.55);
            // mui / cột sập hẳn dưới xích: tiếng tôn ép bẹp lớn + khung thép oằn; phụ kiện / tấm tôn bung văng ra: mảnh rơi
            if (ev.includes('collapse')) { sfx('carCrush', o.x, o.y + 4, o.z, 1.1, { h: 4 }); sfx('sheetMetal', o.x, o.y + 4, o.z, 0.5, { h: 4 }); }
            if (ev.includes('burst')) sfx('debris', o.x, o.y + 3, o.z, 0.5, { h: 3 });
          }
        }
      }
      // Ô TÔ CHÁY: lửa bốc từ khoang / khoang máy, khói đen cuộn cột cao; vài giây sau nổ bình xăng; sau ~6 s sơn cháy
      // rộp thành khung đen, lốp cháy rụi; hết xăng tắt dần, còn âm ỉ khói mỏng ~40 s
      for (const o of this.burningSet) {
        const B = o.burning;
        B.t += dt;
        if (B.boom > 0 && B.t >= B.boom) { B.boom = -1; if (o.type === 'canopy') this.fuelBlastCanopy(o, fx); else this.fuelBlast(o, fx); }
        if (B.t > 6 && !o.charred) { o.charred = true; this.charCar(o); }
        if (B.t >= B.dur) { this.burningSet.delete(o); o.burning = null; o.burnt = true; o.smolder = 40; this.smolderSet.add(o); continue; }
        if ((B.snd -= dt) <= 0) { B.snd = 1.6 + Math.random(); sfx('fire', o.x, o.y + 6, o.z, 0.5, { h: 6 }); }
        if (!fx || (cam && Math.hypot(cam.x - o.x, cam.z - o.z) > 1800)) continue;
        const k = Math.min(1, B.t / 2.5) * Math.min(1, (B.dur - B.t) / 10), S = CAR_SPEC[o.kind] || CAR_SPEC.sedan;
        B.acc += dt * (14 * k);
        const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
        while (B.acc >= 1) {
          B.acc -= 1;
          const lz = (Math.random() - 0.35) * S.L * 0.6, lx = (Math.random() - 0.5) * S.W * 0.6;
          const x = o.x + lx * ca + lz * sa, z = o.z - lx * sa + lz * ca, y = o.y - (o.sink || 0) + S.belt * 0.7 + Math.random() * 3;
          if (fx.fire) fx.fire.add({ x, y, z, vx: (Math.random() - 0.5) * 4, vy: 12 + Math.random() * 16, vz: (Math.random() - 0.5) * 4,
            size: 3.5 + Math.random() * 4, grow: -4, drag: 1.2, grav: -14, life: 0.45 + Math.random() * 0.4, alpha: 0.95, fadeIn: 0.03, c0: [1, 0.78, 0.38], c1: [0.85, 0.24, 0.04], cell: 1, floor: false });
          if (fx.smoke && Math.random() < 0.45) fx.smoke.add({ x, y: y + 6, z, vx: (Math.random() - 0.5) * 3, vy: 14 + Math.random() * 8, vz: (Math.random() - 0.5) * 3,
            size: 5 + Math.random() * 4, grow: 7, drag: 0.5, grav: -2.5, life: 5 + Math.random() * 3, alpha: 0.6 * k + 0.1, fadeIn: 0.1, c0: [0.06, 0.055, 0.05], c1: [0.28, 0.27, 0.26], cell: 0, floor: false });
        }
      }
      for (const o of this.smolderSet) {
        o.smolder -= dt;
        if (o.smolder <= 0) { this.smolderSet.delete(o); continue; }
        if (fx && fx.smoke && Math.random() < dt * 3 && !(cam && Math.hypot(cam.x - o.x, cam.z - o.z) > 1500))
          fx.smoke.add({ x: o.x + (Math.random() - 0.5) * 8, y: o.y + 6, z: o.z + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 2, vy: 6 + Math.random() * 4, vz: (Math.random() - 0.5) * 2,
            size: 3 + Math.random() * 2, grow: 4, drag: 0.6, grav: -1.5, life: 4, alpha: 0.25 * Math.min(1, o.smolder / 10), fadeIn: 0.3, c0: [0.2, 0.19, 0.18], c1: [0.4, 0.39, 0.38], cell: 0, floor: false });
      }
      if (!this.moving.size) { this.flush(); return; }
      for (const o of this.moving) {
        const v = Math.hypot(o.vx || 0, o.vz || 0);
        if ((v < 3 && Math.abs(o.w || 0) < 0.12) || o.c >= 0.5) { this.moving.delete(o); o.vx = o.vz = o.w = 0; continue; }
        const nv = Math.max(0, v - 70 * dt), k = v > 0 ? nv / v : 0;
        o.vx *= k; o.vz *= k; o.w = (o.w || 0) * Math.exp(-8 * dt);   // ma sát xoay mạnh, dừng xoay nhanh chóng
        if (v > 8) sfx('carSlide', o.x, o.y + 1, o.z, clamp(v / 60, 0.35, 1));   // lốp miết nhựa đường khi trượt
        const want = Math.hypot(o.vx * dt, o.vz * dt), got = this.moveCar(o, o.vx * dt, o.vz * dt, o.w * dt, null);
        if (want > 1e-3 && got < want * 0.9) {
          {
            // ô tô đang trượt đâm vào vật cản: móp mặt đi đầu theo hướng trượt
            const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle), vlx = o.vx * ca - o.vz * sa, vlz = o.vx * sa + o.vz * ca;
            const sideHit = Math.abs(vlx) / D.hw > Math.abs(vlz) / D.hl, hl = sideHit ? [Math.sign(vlx) * D.hw, 0] : [0, Math.sign(vlz) * D.hl];
            this.dent(o, 0.25 * D.m * v * v, 1, [hl[0], hl[1], -o.vx, -o.vz]);
          }
          sfx('sheetMetal', o.x, o.y + 4, o.z, clamp(v / 80, 0.3, 0.8), { h: 4 });
          o.vx = o.vz = o.w = 0; this.moving.delete(o);
        }
      }
      this.flush();
    }
    // Mặt đỡ cho xích / bánh (VehicleCollision.debrisHeight, kiểu ụ vòm): xe xích leo lên ô tô (cao capô, thấp dần khi
    // ô tô bẹp); ô tô đã bẹp dí thì mọi xe bò qua. Xe bánh lốp gặp ô tô còn nguyên: không có mặt đỡ (bị chặn / đẩy)
    vehicleDebris(x, z, r, unit, out) {
      const tracked = unit && !unit.isWheeled;
      const dozer = unit && unit.tankType === 'GATLING' && (!unit.frontId || unit.frontId === 'dozer');
      for (const o of this.near(x, z, r + 24)) {
        if (o.type !== 'car') continue;
        if (o.c >= 0.75) continue;   // xe đã bị cán phẳng lì sát đất: không nhấp nhô nữa, xe lăn qua êm ái
        if (!tracked && o.c < 0.6) continue;
        const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle);
        const rem = Math.max(0, 1 - o.c);
        const top = o.y + Math.max(0.18, D.hood * rem * rem);   // độ cao xẹp mượt mà theo lũy thừa, không tạo ụ nhô cao
        const rad = (D.hw + 2.5) * (0.45 + 0.55 * rem);
        const isTruck = o.kind === 'dump' || o.kind === 'truck';
        for (const fz of [-0.55, 0, 0.55]) {
          if (isTruck && (o.c || 0) < 0.35 && fz < 0.3) continue;
          const lz = fz * D.hl * (1 - (o.squeeze || 0));
          out.push({ bump: true, mat: 'car', x: o.x + lz * sa, z: o.z + lz * ca, r: rad, base: o.y, top, crushLevel: o.c || 0 });
        }
      }
      return out;
    }
    reground(x0, z0, x1, z1) {
      const S = this.T.surfaceAt ? (x, z) => this.T.surfaceAt(x, z, true) : (x, z) => this.T.groundAtRaw(x, z);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + 20;
      for (const o of this.near(cx, cz, R)) {
        if (o.fixed || o.x < x0 - 4 || o.x > x1 + 4 || o.z < z0 - 4 || o.z > z1 + 4) continue;
        const y = Math.min(o.y, S(o.x, o.z) + (STREET[o.type] && STREET[o.type].walk ? 1.2 : 0));   // hố dưới chân -> lún theo (không nâng lên)
        if (Math.abs(y - o.y) < 0.05) continue;
        o.y = y; this.refresh(o);
      }
      this.flush();
    }
  }

  // ---------------------------------------------------------------------------
  // BỘ CÔNG TRÌNH PHỤ
  // ---------------------------------------------------------------------------
  class PropSet {
    constructor(T, data) {
      this.T = T;
      this.data = data;
      if (typeof Weathering !== 'undefined') Weathering.setBiome(T.mapType);   // màu bùn / bụi / độ rêu phong hoá theo bản đồ
      this.group = new THREE.Group(); this.group.name = 'props';
      T.group.add(this.group);
      this.grid = new Map();             // ô 60 -> [nhịp rào | bao cát]
      this.spans = [];
      this.bags = [];
      this.bagSegs = [];                 // đoạn bao cát (chắn đạn)
      this.wallRuns = [];                // mỗi đường tường rào đá / đất / rào gỗ / tre (chắn đạn & mảnh văng theo từng nhịp)
      this.wrecks = [];
      this.smokers = [];
      this.smokeAcc = 0;
      const G = (x, z) => T.groundAtRaw(x, z);
      this.buildFences(data.fences || [], G);
      this.buildFields(data.fields || [], G);
      this.buildSandbags(data.sandbags || [], G);
      this.buildWrecks(data.wrecks || [], G);
      // đồ vật đường phố (đô thị): sau xác xe (đẩy thêm cột mái che / chân cầu vượt vào T.boulders)
      if (['lamps', 'signals', 'poles', 'busStops', 'cars', 'canopies', 'footbridges'].some(k => data[k] && data[k].length)) this.street = new StreetSet(T, data, this.group);
    }
    key(x, z) { return Math.floor(x / 60) * 1000 + Math.floor(z / 60); }
    addGrid(o) { const k = this.key(o.x, o.z); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); }
    near(x, z, r) {
      const out = [];
      for (let i = Math.floor((x - r) / 60); i <= Math.floor((x + r) / 60); i++)
        for (let j = Math.floor((z - r) / 60); j <= Math.floor((z + r) / 60); j++) {
          const l = this.grid.get(i * 1000 + j);
          if (l) for (const o of l) out.push(o);
        }
      return out;
    }

    // ---- HÀNG RÀO / TƯỜNG / BỜ RÀO CÂY
    buildFences(list, G) {
      const byKind = {};
      list.forEach((f, idx) => {
        const F = FENCE[f.kind] || FENCE.wood;
        const L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
        if (L < 1) return;
        const n = Math.max(1, Math.round(L / F.L));
        // đường tường chắn đạn / mảnh văng: các nhịp theo thứ tự dọc trục (x0, z0) -> (x1, z1)
        const run = WALL_HIT[f.kind] ? { kind: f.kind, F, H: WALL_HIT[f.kind], x0: f.x0, z0: f.z0, L, ux: (f.x1 - f.x0) / L, uz: (f.z1 - f.z0) / L, spans: [] } : null;
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const ax = f.x0 + (f.x1 - f.x0) * t0, az = f.z0 + (f.z1 - f.z0) * t0, bx = f.x0 + (f.x1 - f.x0) * t1, bz = f.z0 + (f.z1 - f.z0) * t1;
          // mỗi nhịp lấy 1 trong FENCE_VARIANTS mẫu (băm theo vị trí) -> 1 InstancedMesh / (loại, mẫu)
          const seed = idx * 131 + k, v = Math.floor(hash(seed * 7 + 77) * FENCE_VARIANTS);
          const s = { ax, az, bx, bz, kind: f.kind, v, seed, x: (ax + bx) / 2, z: (az + bz) / 2 };
          (byKind[f.kind + '|' + v] || (byKind[f.kind + '|' + v] = [])).push(s);
          if (run) run.spans.push(s);
        }
        if (run) this.wallRuns.push(run);
      });
      // vật liệu dùng chung theo loại: gỗ / tre / đá / đất có phong hoá (gốc nhịp thấp hơn mặt đất 0,4 -> lift -0,4);
      // bờ rào cây dùng thẻ lá như bụi cây (màu lá theo bản đồ)
      const mats = {}, Fo = typeof Destructibles !== 'undefined' && Destructibles.Foliage;
      const fenceMat = kind => mats[kind] || (mats[kind] = (() => {
        const F = FENCE[kind] || FENCE.wood;
        if (F.leafy && Fo && Fo.hedgeGeometry) {
          const m = Fo.foliageMat(Fo.leafTex('neutral'));
          m.color.set(this.T.leafColors ? this.T.leafColors()[0] : 0x3d5a2a).multiplyScalar(0.95);
          return m;
        }
        const m = new THREE.MeshStandardMaterial({ map: F.mat(), color: F.color, roughness: F.rough, metalness: 0, vertexColors: true });
        return F.wx && typeof Weathering !== 'undefined' ? Weathering.apply(m, F.wx[0], Object.assign({ lift: -0.4 }, F.wx[1])) : m;
      })());
      for (const key in byKind) {
        const arr = byKind[key], kind = arr[0].kind, F = FENCE[kind] || FENCE.wood;
        const im = new THREE.InstancedMesh(fenceGeo(kind, arr[0].v), fenceMat(kind), arr.length);
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(arr.length * 3).fill(1), 3);
        arr.forEach((s, i) => {
          s.im = im; s.i = i; s.F = F; s.broken = false;
          s.L = Math.hypot(s.bx - s.ax, s.bz - s.az);
          s.yaw = -Math.atan2(s.bz - s.az, s.bx - s.ax);
          s.ga = G(s.ax, s.az); s.gb = G(s.bx, s.bz);
          s.pitch = Math.atan2(s.gb - s.ga, s.L);
          im.setMatrixAt(i, this.spanMatrix(s, 0));
          const k = 0.82 + hash(s.seed) * 0.3;
          im.setColorAt(i, new THREE.Color(k, k, k));
          this.spans.push(s); this.addGrid(s);
        });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
        this.group.add(im);
      }
      // hộp bao từng đường tường (mặt bằng: tâm, trục dọc, nửa dài + nửa bề dày; độ cao: gốc thấp nhất -> đỉnh cao nhất) để
      // ballistics chỉ dò dày đúng khúc đường đạn cắt qua tường, hitTest / blastCover loại nhanh
      for (const w of this.wallRuns) {
        w.cx = w.x0 + w.ux * w.L / 2; w.cz = w.z0 + w.uz * w.L / 2;
        w.hl = w.L / 2 + 0.6; w.ht = w.H.ht;
        const ex = Math.abs(w.ux) * w.hl + Math.abs(w.uz) * w.ht, ez = Math.abs(w.uz) * w.hl + Math.abs(w.ux) * w.ht;
        w.minX = w.cx - ex; w.maxX = w.cx + ex; w.minZ = w.cz - ez; w.maxZ = w.cz + ez;
        let lo = Infinity, hi = -Infinity;
        for (const s of w.spans) { lo = Math.min(lo, s.ga, s.gb); hi = Math.max(hi, s.ga, s.gb); }
        w.y0 = lo - 1.5; w.y1 = hi + w.F.h + 1.2;
      }
    }
    spanMatrix(s, fall) {
      // rào gỗ / tre đổ rạp: nâng gốc lên mặt đất (gốc nhịp chôn sâu 0,4 -> nằm rạp thì chìm gần hết xuống đất)
      const y = (s.ga + s.gb) / 2 - 0.4 + (fall && !s.F.solid ? 0.7 : 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, s.pitch, 'YZX'));
      let sy = 1;
      if (fall) {
        // đổ rạp: rào gỗ ngã nghiêng sang 1 bên; tường / bờ rào sụp còn đống thấp
        if (s.F.solid) sy = 0.32 + hash(s.seed + 5) * 0.15;
        else q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fall * (1.2 + hash(s.seed + 3) * 0.3)));
      }
      return new THREE.Matrix4().compose(new THREE.Vector3(s.x, y, s.z), q, new THREE.Vector3(s.L / s.F.L, sy, 1));
    }
    // kv: hệ số độ to theo tốc độ xe húc (crush); không truyền = sóng nổ / đạn (mức cũ)
    breakSpan(s, dx, dz, fx, kv = 1) {
      if (s.broken) return;
      s.broken = true;
      // ngã về phía bị đẩy: dấu của tích có hướng giữa pháp tuyến nhịp rào và hướng đẩy
      // trục Z cục bộ của nhịp rào = n; quay +góc quanh trục X làm đỉnh rào ngả về +Z -> bị đẩy theo +n thì side = +1
      const nx = -(s.bz - s.az), nz = (s.bx - s.ax);
      const side = (nx * dx + nz * dz) >= 0 ? 1 : -1;
      s.side = side;
      s.im.setMatrixAt(s.i, this.spanMatrix(s, side));
      s.im.instanceMatrix.needsUpdate = true;
      if (s.F.solid && !s.F.leafy) s.im.setColorAt(s.i, new THREE.Color(0.7, 0.68, 0.64)), s.im.instanceColor.needsUpdate = true;
      if (fx && fx.smoke) {
        const c = s.F.leafy ? [0.3, 0.4, 0.18] : s.F.solid ? [0.55, 0.52, 0.46] : [0.45, 0.36, 0.24];
        for (let k = 0; k < 6; k++) fx.smoke.add({ x: s.x + (hash(s.seed + k) - 0.5) * s.L, y: (s.ga + s.gb) / 2 + 2, z: s.z + (hash(s.seed + k + 9) - 0.5) * s.L,
          vx: (hash(k) - 0.5) * 8, vy: 3 + hash(k + 2) * 5, vz: (hash(k + 4) - 0.5) * 8, size: 1.4 + hash(k + 6) * 1.6, grow: 2, drag: 2, grav: 6, life: 1.2, alpha: 0.5, fadeIn: 0.02, c0: c, cell: 2 });
      }
      // tiếng theo vật liệu rào: gỗ / tre gãy rắc, tường đá đổ, tường đất bở sụp, bờ rào cây xào xạc gãy cành
      const snd = s.F.leafy ? 'leafStrip' : s.F === FENCE.stone ? 'masonry' : s.F.solid ? 'adobe' : 'woodBreak';
      sfx(snd, s.x, (s.ga + s.gb) / 2 + 2, s.z, (s.F.leafy ? 0.8 : s.F.solid ? 0.45 : 0.4) * kv, { h: s.F.h });
    }

    // ---- RUỘNG: lưới bám địa hình, kẻ luống theo cạnh dài
    buildFields(list, G) {
      const byCrop = {};
      for (const f of list) (byCrop[f.crop] || (byCrop[f.crop] = [])).push(f);
      for (const crop in byCrop) {
        const pos = [], uv = [], idx = [];
        for (const f of byCrop[crop]) {
          const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
          const nu = Math.max(2, Math.ceil(f.w / 12)), nv = Math.max(2, Math.ceil(f.d / 12)), base = pos.length / 3;
          for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
            const u = -f.w / 2 + f.w * i / nu, v = -f.d / 2 + f.d * j / nv;
            const x = f.x + ca * u - sa * v, z = f.z + sa * u + ca * v;
            pos.push(x, G(x, z) + 0.35, z);
            uv.push(u / 64, v / 64);   // luống chạy dọc cạnh dài (u)
          }
          for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
            const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const C = CROP[crop] || CROP.veg;
        // ruộng lúa: mặt bùn ngập nước giữa các khóm -> bóng loáng phản chiếu trời; ruộng khác: đất khô / ẩm (phong hoá đất)
        const mat = new THREE.MeshStandardMaterial({ map: cropTex(crop), roughness: C.water ? 0.28 : C.rough, metalness: C.water ? 0.08 : 0, color: C.water ? 0xb8c0b4 : 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        if (!C.water && typeof Weathering !== 'undefined') Weathering.apply(mat, 'soil', { grime: 0, streak: 0, dust: 0.3, stain: 0.7, moss: 0.3, scale: 0.6 });
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        this.group.add(m);
        (this.fieldGeos || (this.fieldGeos = [])).push(g);
        if (C.strip) this.buildCropStrips(byCrop[crop], C, crop, G);
        // ruộng rơm: vài cuộn rơm tròn
        if (C.bales) {
          const bales = [];
          for (const f of byCrop[crop]) {
            const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
            const targetCount = Math.min(5, Math.max(2, Math.floor((f.w * f.d) / 95)));
            const fieldBales = [];
            for (let k = 0; k < 24 && fieldBales.length < targetCount; k++) {
              const u = (hash((f.x | 0) + k * 17 + 1) - 0.5) * f.w * 0.72;
              const v = (hash((f.z | 0) + k * 23 + 5) - 0.5) * f.d * 0.72;
              const x = f.x + ca * u - sa * v, z = f.z + sa * u + ca * v;
              const tooClose = fieldBales.some(b => Math.hypot(b.x - x, b.z - z) < 8.5);
              if (!tooClose) {
                fieldBales.push({ x, z, rot: hash(k + (f.x | 0) * 11) * TAU });
              }
            }
            for (const b of fieldBales) {
              bales.push(M4(b.x, G(b.x, b.z) + 3.6, b.z, Math.PI / 2, b.rot, 0, 1, 1, 1));
            }
          }
          // cuộn rơm: thân hơi phình giữa, mặt đầu cuộn xoắn ốc; phơi lâu ngoài đồng thì ngả xám, chân ngấm ẩm thâm
          const bg = new THREE.CylinderGeometry(3.8, 3.8, 6, 14, 2), bp = bg.attributes.position;
          for (let i = 0; i < bp.count; i++) if (Math.abs(bp.getY(i)) < 0.1) { bp.setX(i, bp.getX(i) * 1.05); bp.setZ(i, bp.getZ(i) * 1.05); }
          bg.computeVertexNormals();
          const WXb = (m) => typeof Weathering !== 'undefined' ? Weathering.apply(m, 'soil', { grime: 0.5, grimeH: 2.5, fade: 0.7, stain: 0.6, streak: 0.3, moss: 0.25, lift: 3.6 }) : m;
          const bm = [WXb(new THREE.MeshStandardMaterial({ map: cropTex('hay'), color: 0xd8c690, roughness: 1 })), WXb(new THREE.MeshStandardMaterial({ map: baleCapTex(), color: 0xd8c690, roughness: 1 })), WXb(new THREE.MeshStandardMaterial({ map: baleCapTex(), color: 0xd8c690, roughness: 1 }))];
          const im = new THREE.InstancedMesh(bg, bm, Math.max(1, bales.length));
          im.count = bales.length;
          bales.forEach((m4, i) => im.setMatrixAt(i, m4));
          im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
          this.group.add(im);
        }
      }
    }

    // ---- CÂY TRỒNG 3D: mỗi luống 1 dải thẻ hình chữ V (2 mặt nghiêng hai bên dọc luống, cắt alpha), chia đoạn 6 đv cao thấp
    // lổn nhổn, màu từng khóm lệch nhau; rẻ (~4 tam giác / 6 đv luống). Ngọn ghi lại để xe cán đè rạp / sóng nổ quật đổ
    buildCropStrips(list, C, crop, G) {
      const S = C.strip, pos = [], nrm = [], uv = [], col = [], tops = this.cropTops || (this.cropTops = new Map());
      const segL = 6, cell = 16;
      for (const f of list) {
        const ca = Math.cos(f.angle), sa = Math.sin(f.angle), rows = Math.max(1, Math.floor(f.d / S.gap));
        const W = (u, v) => [f.x + ca * u - sa * v, f.z + sa * u + ca * v];
        const seed = Math.round(f.x * 3 + f.z * 7);
        for (let r = 0; r < rows; r++) {
          const v = -f.d / 2 + (r + 0.5) * f.d / rows, nSeg = Math.max(1, Math.round((f.w - 2) / segL));
          // độ cao / màu theo nút (dùng chung giữa 2 đoạn kề nhau -> luống liền mạch); vài chỗ khuyết (cây chết, chuột cắn)
          const nodeH = s => S.h * (hash(seed + r * 977 + s * 31) < 0.06 ? 0.35 : 0.8 + 0.4 * hash(seed + r * 977 + s * 31 + 5));
          const nodeC = s => { const k = 0.8 + 0.32 * hash(seed + r * 613 + s * 17), t = hash(seed + r * 613 + s * 17 + 3) - 0.5; return [k * (1 + t * 0.12), k, k * (1 - t * 0.2)]; };
          for (let s = 0; s < nSeg; s++) {
            const u0 = -f.w / 2 + 1 + (f.w - 2) * s / nSeg, u1 = -f.w / 2 + 1 + (f.w - 2) * (s + 1) / nSeg;
            const h0 = nodeH(s), h1 = nodeH(s + 1), c0 = nodeC(s), c1 = nodeC(s + 1);
            for (const tilt of [-1, 1]) {
              const [x0, z0] = W(u0, v), [x1, z1] = W(u1, v), [tx0, tz0] = W(u0, v + tilt * h0 * 0.42), [tx1, tz1] = W(u1, v + tilt * h1 * 0.42);
              const g0 = G(x0, z0) + 0.3, g1 = G(x1, z1) + 0.3;
              const quad = [[x0, g0, z0, u0, 0.02, c0], [x1, g1, z1, u1, 0.02, c1], [tx1, g1 + h1, tz1, u1, 0.98, c1], [tx0, g0 + h0, tz0, u0, 0.98, c0]];
              for (const k of [0, 1, 2, 0, 2, 3]) {
                const p = quad[k], vi = pos.length / 3;
                pos.push(p[0], p[1], p[2]); nrm.push(0, 1, 0); uv.push(p[3] / S.len + (tilt > 0 ? 0.5 : 0), p[4]); col.push(...p[5]);
                if (k >= 2) {   // đỉnh ngọn: gốc (bx, bz, by) + cao h + hướng nghiêng
                  const bx = k === 2 ? x1 : x0, bz = k === 2 ? z1 : z0, by = k === 2 ? g1 : g0, hh = k === 2 ? h1 : h0;
                  const key = Math.floor(bx / cell) * 65536 + Math.floor(bz / cell);
                  (tops.get(key) || tops.set(key, []).get(key)).push({ crop, vi, bx, bz, by, h: hh, down: false });
                }
              }
            }
          }
        }
      }
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeBoundingSphere();
      const Fo = typeof Destructibles !== 'undefined' && Destructibles.Foliage;
      const mat = Fo && Fo.foliageMat ? Fo.foliageMat(cropBladeTex(crop)) : new THREE.MeshStandardMaterial({ map: cropBladeTex(crop), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 });
      const m = new THREE.Mesh(g, mat);
      m.name = 'crop_' + crop; m.castShadow = S.h > 2; m.receiveShadow = true;
      this.group.add(m);
      (this.cropMeshes || (this.cropMeshes = {}))[crop] = m;
      (this.fieldGeos || (this.fieldGeos = [])).push(g);
    }
    // Xe cán qua ruộng (x, z, bán kính r, hướng chạy dx, dz): cây trong vết bị đè rạp nằm theo chiều xe chạy, dập sẫm màu
    trampleCrops(x, z, r, dx, dz) {
      if (!this.cropTops) return;
      const dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
      this.bendCrops(x, z, r, (t) => [ux, uz], 0.72, false);
    }
    // sóng nổ: cây quanh tâm nổ rạp toả ra ngoài, gần tâm cháy sém đen (đạn nổ mạnh / đạn cháy)
    blastCrops(x, z, R, scorch) {
      if (!this.cropTops) return;
      this.bendCrops(x, z, R, (t) => { const ex = t.bx - x, ez = t.bz - z, l = Math.hypot(ex, ez) || 1; return [ex / l, ez / l]; }, 0.78, scorch ? R * 0.42 : 0);
    }
    bendCrops(x, z, r, dirOf, dark, scorchR) {
      const cell = 16, dirty = new Set();
      for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++) for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++) {
        for (const t of this.cropTops.get(i * 65536 + j) || []) {
          const d = Math.hypot(t.bx - x, t.bz - z);
          if (d > r) continue;
          const m = this.cropMeshes && this.cropMeshes[t.crop];
          if (!m) continue;
          const P = m.geometry.attributes.position, Cc = m.geometry.attributes.color;
          if (!t.down) {
            const [ux, uz] = dirOf(t), L = t.h * (0.75 + 0.2 * hash(t.vi));
            P.setXYZ(t.vi, t.bx + ux * L, t.by + 0.25 + 0.3 * hash(t.vi + 3), t.bz + uz * L);
            t.down = true;
            const k = dark; Cc.setXYZ(t.vi, Cc.getX(t.vi) * k, Cc.getY(t.vi) * k, Cc.getZ(t.vi) * k);
            dirty.add(m);
          }
          if (scorchR && d < scorchR && !t.burnt) { t.burnt = true; Cc.setXYZ(t.vi, 0.12, 0.1, 0.08); dirty.add(m); }
        }
      }
      for (const m of dirty) { m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.color.needsUpdate = true; m.geometry.computeBoundingSphere(); }
    }

    // ---- BAO CÁT
    buildSandbags(list, G) {
      const mats = [];
      for (const sg of list) {
        const L = Math.hypot(sg.x1 - sg.x0, sg.z1 - sg.z0);
        if (L < 2) continue;
        const tx = (sg.x1 - sg.x0) / L, tz = (sg.z1 - sg.z0) / L, yaw = -Math.atan2(tz, tx), layers = sg.layers || 2;
        const n = Math.max(1, Math.round(L / 5.4));
        let top = 0;
        for (let ly = 0; ly < layers; ly++) {
          const nn = n - (ly % 2 ? 1 : 0);
          for (let k = 0; k < nn; k++) {
            const t = (k + 0.5 + (ly % 2 ? 0.5 : 0)) / n;
            const x = sg.x0 + (sg.x1 - sg.x0) * t, z = sg.z0 + (sg.z1 - sg.z0) * t, seed = mats.length * 7 + 3;
            const y = G(x, z) + 0.8 + ly * 1.6;   // bao trên tì sát mặt dẹt bao dưới (không hở khe)
            top = Math.max(top, ly * 1.6 + 2.4);
            const b = { x, z, y, yaw: yaw + (hash(seed) - 0.5) * 0.25, seed, flat: false, i: mats.length, layer: ly };
            mats.push(b); this.bags.push(b); this.addGrid(b);
          }
        }
        this.bagSegs.push({ x0: sg.x0, z0: sg.z0, x1: sg.x1, z1: sg.z1, tx, tz, L, top, g0: G(sg.x0, sg.z0), g1: G(sg.x1, sg.z1) });
      }
      if (!mats.length) return;
      // bao cát: gối vải đổ đầy cát — mặt trên / đáy phẳng, góc vuông, dày nhất ở giữa và mỏng dần về mép may (4 góc
      // thành "tai" dẹt), bị bao trên đè nên bè ngang; một đầu túm buộc nhăn nhúm. (Siêu elip cũ tròn đều -> trông như
      // dãy đá cuội.) Cỡ thật ~70 x 40 x 18 cm
      const geo = new THREE.SphereGeometry(1, 20, 12), gp = geo.attributes.position;
      const wn = (x, z, k) => Math.sin(x * 4.1 + z * 2.3 + k) * Math.sin(x * 1.7 - z * 5.2 + k * 1.9);
      for (let i = 0; i < gp.count; i++) {
        let x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
        const r = 1 / Math.pow(Math.pow(Math.abs(x), 10) + Math.pow(Math.abs(y), 2.4) + Math.pow(Math.abs(z), 6), 1 / 6);
        x *= Math.min(r, 1.6); y *= Math.min(r, 1.6); z *= Math.min(r, 1.6);
        // dày ở giữa, mỏng về mép may & 4 góc
        // (mỏng về mép vừa phải: mỏng quá thì 2 đầu bao nhọn như quả chanh — đầu bao thật tù, vuông)
        y *= (1 - 0.22 * Math.pow(Math.min(1, Math.abs(x)), 10)) * (1 - 0.3 * Math.pow(Math.min(1, Math.abs(z)), 8));
        const tie = Math.max(0, x - 0.8) / 0.2;                          // đầu túm buộc (+x): thắt nhỏ, nhăn
        const sq = 1 - tie * 0.35 + wn(y * 3, z * 3, 7) * 0.06 * tie;
        y *= sq; z *= sq;
        if (y > 0) y *= 0.62;                                            // bao trên đè: mặt trên dẹt
        if (y < -0.72) y = -0.72;                                        // đáy phẳng tì lên bao dưới / mặt đất
        y += wn(x, z, 1.3) * 0.045 * (y > 0 ? 1 : 0.3);                  // vải chùng nhăn lệch, không gợn đều
        x *= 1 + wn(z * 2, y * 2, 3.1) * 0.03;
        gp.setXYZ(i, x * 2.9, y * 1.2, z * 1.7);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ map: burlapTex(), roughness: 1, metalness: 0 });
      if (typeof Weathering !== 'undefined') Weathering.apply(mat, 'soil', { grime: 0.7, grimeH: 2.2, streak: 0.3, fade: 0.45, stain: 0.75, moss: 0.45, space: 'local', lift: 0.9 });
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mats.length * 3).fill(1), 3);
      this.bagIM = im;
      for (const b of mats) {
        im.setMatrixAt(b.i, this.bagMatrix(b));
        // bao cũ mới lẫn lộn: bao mới vàng nhạt, bao lâu ngày ngả xám / sẫm bùn
        // (+ ~30% bao quân dụng màu ô liu xỉn)
        const k = 0.62 + hash(b.seed + 1) * 0.36, old = hash(b.seed + 9), olive = hash(b.seed + 13) < 0.3;
        im.setColorAt(b.i, olive ? new THREE.Color(k * 0.82, k * 0.86, k * 0.62) : new THREE.Color(k, k * (0.95 + old * 0.03), k * (0.84 + old * 0.12)));
      }
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      this.group.add(im);
    }
    bagMatrix(b) {
      // bị sóng nổ hất văng: nằm bẹp dí trên đất chỗ rơi (rách toác sát tâm nổ: cát vãi hết, không còn hình bao)
      if (b.gone) return b.shred ? M4(b.x, b.y - 30, b.z, 0, 0, 0, 0.01, 0.01, 0.01) : M4(b.tx, b.ty, b.tz, b.troll, b.tyaw, 0, 0.95, 0.42, 1.2);
      const y = b.flat ? b.y - b.layer * 1.6 - 0.4 : b.y;
      // mỗi bao đầy / vơi, dài ngắn khác nhau một chút (cùng 1 hình mẫu)
      const vx = 0.92 + 0.16 * hash(b.seed + 21), vy = 0.88 + 0.22 * hash(b.seed + 22), vz = 0.92 + 0.16 * hash(b.seed + 23);
      return M4(b.x, y, b.z, (hash(b.seed + 24) - 0.5) * 0.08, b.yaw, (hash(b.seed + 2) - 0.5) * 0.12, vx, (b.flat ? 0.45 : 1) * vy, (b.flat ? 1.25 : 1) * vz);
    }

    // Mẫu hình học gộp cho xác xe (1 lần cho mỗi loại xe, tái sử dụng cho toàn bộ xác xe trên bản đồ)
    // Giảm từ 150 mesh / xe xuống 2 mesh / xe (giảm ~7500 mesh, cứu 90% lượt vẽ và giải phóng GPU submit)
    getWreckTemplate(tankType) {
      this._wreckTpl = this._wreckTpl || {};
      if (this._wreckTpl[tankType]) return this._wreckTpl[tankType];
      if (typeof TankModelBuilder === 'undefined') return null;

      const dummy = {
        id: 'wreck_tpl_' + tankType,
        team: 'RED',
        tankType: tankType,
        group: new THREE.Group(),
        scene: new THREE.Scene()
      };
      TankModelBuilder.buildModel(dummy);
      if (dummy.hpGroup && dummy.hpGroup.parent) dummy.hpGroup.parent.remove(dummy.hpGroup);
      if (dummy.reactiveArmorMesh) dummy.reactiveArmorMesh.visible = false;
      if (dummy.barrelPivot) dummy.barrelPivot.rotation.x = -0.28;

      dummy.group.updateMatrixWorld(true);
      const turretRoot = dummy.turretGroup;
      if (turretRoot) turretRoot.updateMatrixWorld(true);

      const bodyMeshes = [];
      const turretMeshes = [];

      // chỉ gộp phần vỏ thật: bỏ khối ẩn (khối chọn 63x12x63, chùm tia...), vật liệu trong suốt / phát sáng / shader hiệu ứng
      // (nhiệt khói xả) — gộp nhầm với vật liệu đặc thì thành mấy bức tường xoè quanh xác xe
      const shown = (c) => { for (let p = c; p; p = p.parent) if (!p.visible) return false; return true; };
      dummy.group.traverse(c => {
        if (c.isMesh && c.geometry && !c.isInstancedMesh && shown(c) && c.material && !c.material.transparent && (c.material.isMeshStandardMaterial || c.material.isMeshLambertMaterial || c.material.isMeshPhongMaterial)) {
          let p = c.parent, inTurret = false;
          while (p && p !== dummy.group) {
            if (p === turretRoot) { inTurret = true; break; }
            p = p.parent;
          }
          if (inTurret) turretMeshes.push(c);
          else bodyMeshes.push(c);
        }
      });

      const mergeList = (meshList, baseObject) => {
        baseObject.updateMatrixWorld(true);
        const inv = baseObject.matrixWorld.clone().invert();
        const parts = [];
        let totalCount = 0;
        for (const m of meshList) {
          if (!m.geometry) continue;
          m.updateMatrixWorld(true);
          const relMat = m.matrixWorld.clone().premultiply(inv);
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          g.applyMatrix4(relMat);
          parts.push(g);
          totalCount += g.attributes.position.count;
        }
        if (!totalCount) return null;
        const pos = new Float32Array(totalCount * 3);
        const nrm = new Float32Array(totalCount * 3);
        let offset = 0;
        for (const g of parts) {
          const cnt = g.attributes.position.count;
          pos.set(g.attributes.position.array, offset * 3);
          if (g.attributes.normal) nrm.set(g.attributes.normal.array, offset * 3);
          offset += cnt;
        }
        const res = new THREE.BufferGeometry();
        res.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        res.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        res.computeVertexNormals();
        res.computeBoundingSphere();
        return res;
      };

      const bodyGeo = mergeList(bodyMeshes, dummy.group);
      const turretGeo = turretRoot && turretMeshes.length ? mergeList(turretMeshes, turretRoot) : null;
      const turretPos = turretRoot ? turretRoot.position.clone() : new THREE.Vector3(0, 0, 0);

      return (this._wreckTpl[tankType] = { bodyGeo, turretGeo, turretPos });
    }

    // ---- XÁC XE CHIẾN TRƯỜNG THỰC TẾ (mô hình gộp tối ưu hiệu năng cao, giảm 90% draw calls)
    buildWrecks(list, G) {
      if (!list.length) return;
      this.wreckIM = this.wreckIM || {};

      for (const w of list) {
        const gy = G(w.x, w.z);
        w._slots = [];
        w._dy = 0;
        w._g0 = this.wreckFoot(w).map(([x, z]) => G(x, z));
        w.gy = gy;
        w.hp = w.hp0 = WRECK_HP[w.kind] || 3;

        const isDump = w.kind === 'dump' || w.kind === 'truck';
        const tankType = w.kind === 'apc' ? 'GATLING' : 'ALL_ROUNDER';
        // xe ben / xe tải: xác xe tải cháy dựng riêng (trước đây mượn mô hình pháo tự hành)
        const tpl = isDump ? { bodyGeo: truckWreckGeo(), turretGeo: null } : this.getWreckTemplate(tankType);

        if (tpl && tpl.bodyGeo) {
          // thép cháy: sơn cháy trụi còn lớp lót xám than, gỉ nâu cam loang (lửa đốt mất sơn, thép gỉ rất nhanh), tro
          // trắng xám phủ mặt trên, vệt muội; mỗi xác một tông khác (phong hoá 'burnt', weathering.js)
          const k = 0.8 + hash(w.z | 0) * 0.35;
          const col = new THREE.Color(0x24211d).lerp(new THREE.Color(0x33251c), hash(w.x | 0) * 0.5).multiplyScalar(k);
          const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, metalness: 0.2, vertexColors: isDump });
          if (typeof Weathering !== 'undefined') Weathering.apply(mat, 'burnt', { lift: 0.4, grimeH: 4, scale: 0.9, dust: 0.35 });
          // nền đất cháy xém dưới xác
          const scorch = new THREE.Mesh(new THREE.PlaneGeometry(isDump ? 44 : 50, isDump ? 80 : 90), new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
          scorch.rotation.set(-Math.PI / 2, 0, -w.angle + (hash(w.x * 3 | 0) - 0.5) * 0.6);
          scorch.position.set(w.x, gy + 0.25, w.z); scorch.renderOrder = 1;
          this.group.add(scorch); w.scorch = scorch;

          // mô hình dài theo trục z cục bộ; vòng va chạm / chân bám đất / ủi trượt tính dọc trục x của nhóm xác xe ->
          // xoay mô hình 90° cho thân xác nằm khớp vùng chặn (trước đây thân xe nằm vuông góc với vòng va chạm)
          const wreckGrp = new THREE.Group(), inner = new THREE.Group();
          inner.rotation.y = Math.PI / 2;
          wreckGrp.add(inner);
          const bodyMesh = new THREE.Mesh(tpl.bodyGeo, mat);
          bodyMesh.castShadow = true;
          bodyMesh.receiveShadow = true;
          inner.add(bodyMesh);

          if (tpl.turretGeo) {
            const turretGrp = new THREE.Group();
            turretGrp.position.copy(tpl.turretPos);
            const turretMesh = new THREE.Mesh(tpl.turretGeo, mat);
            turretMesh.castShadow = true;
            turretMesh.receiveShadow = true;
            turretGrp.add(turretMesh);

            const blown = (w.kind === 'tank' || w.kind === 'apc') && hash((w.x * 7) | 0) < 0.35;
            if (blown) {
              turretGrp.position.set(-18 - hash(w.x | 0) * 8, -6.5, 12 * (hash(w.z | 0) < 0.5 ? 1 : -1));
              turretGrp.rotation.set(0.35, 1.2, 2.4);
            } else {
              turretGrp.rotation.y = w.turretRot || (hash(w.x | 0) - 0.5) * 2;
              turretGrp.rotation.z = (hash(w.z | 0) - 0.5) * 0.32;
            }
            inner.add(turretGrp);
            w.turretGroup = turretGrp;
          }

          wreckGrp.position.set(w.x, gy - 0.4, w.z);
          wreckGrp.rotation.set(w.roll || 0, -w.angle, w.tilt || 0);
          this.group.add(wreckGrp);
          w.group = wreckGrp;
        }

        // Đăng ký vùng va chạm collider kiên cố (chắn xe & chắn đạn)
        const ca = Math.cos(w.angle), sa = Math.sin(w.angle), half = (w.kind === 'dump' || w.kind === 'truck') ? 33 : 14;
        w._b = [];
        for (const f of [-half * 0.6, 0, half * 0.6]) {
          const isD = w.kind === 'dump' || w.kind === 'truck';
          // wreckOf: xe đủ lực kéo thì ủi trượt xác xe (wreckContact) thay vì bị vòng này chặn cứng
          // (xác xe ben dài ~64 đv dọc thân: 3 vòng bán kính 10 cách nhau 20)
          const b = { x: w.x + ca * f, z: w.z + sa * f, radius: isD ? 10 : 8.5, height: isD ? 20 : 13, wreck: true, wreckOf: w };
          this.T.boulders.push(b); w._b.push(b);
        }

        this.wrecks.push(w);
        if (w.smoke) this.smokers.push(w._smoker = { x: w.x, y: gy + 8, z: w.z, phase: hash(w.x | 0) * 3 });
      }
    }
    wreckFoot(w) {
      const ca = Math.cos(w.angle), sa = Math.sin(w.angle), h = (w.kind === 'dump' || w.kind === 'truck') ? 11 : 12, s = 6;
      return [[w.x, w.z], [w.x + ca * h, w.z + sa * h], [w.x - ca * h, w.z - sa * h], [w.x - sa * s, w.z + ca * s], [w.x + sa * s, w.z - ca * s]];
    }

    // ---------------------------------------------------------------------------
    // MẶT ĐẤT ĐỔI (hố bom mới / hố bị xoá): rào, bao cát, xác xe, mặt ruộng đặt lại theo mặt đất mới
    // ---------------------------------------------------------------------------
    reground(x0, z0, x1, z1) {
      const T = this.T, raw = (x, z) => T.groundAtRaw(x, z);
      const S = T.surfaceAt ? (x, z) => T.surfaceAt(x, z, true) : raw;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + 20;
      const inBox = (x, z, p) => x >= x0 - p && x <= x1 + p && z >= z0 - p && z <= z1 + p;
      const dirtyIM = new Set();
      let bags = false;
      for (const o of this.near(cx, cz, R)) {
        if (o.im) {
          // nhịp rào: 2 đầu theo mặt đất mới; hố dưới giữa nhịp thì cả nhịp lún theo (không vắt ngang trên miệng hố)
          if (!inBox(o.x, o.z, o.L / 2 + 2)) continue;
          let ga = S(o.ax, o.az), gb = S(o.bx, o.bz);
          const dm = Math.min(0, S(o.x, o.z) - (ga + gb) / 2);
          ga += dm; gb += dm;
          if (Math.abs(ga - o.ga) + Math.abs(gb - o.gb) < 0.02) continue;
          o.ga = ga; o.gb = gb; o.pitch = Math.atan2(gb - ga, o.L);
          o.im.setMatrixAt(o.i, this.spanMatrix(o, o.broken ? (o.side || 1) : 0));
          dirtyIM.add(o.im);
        } else if (o.gone) {
          // bao bị hất văng: nằm theo mặt đất mới chỗ rơi
          if (o.shred || !inBox(o.tx, o.tz, 3)) continue;
          const ty = S(o.tx, o.tz) + 0.35;
          if (Math.abs(ty - o.ty) < 0.02) continue;
          o.ty = ty;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bags = true;
        } else if (inBox(o.x, o.z, 3)) {
          const y = S(o.x, o.z) + 0.8 + o.layer * 1.6;
          if (Math.abs(y - o.y) < 0.02) continue;
          o.y = y;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bags = true;
        }
      }
      if (bags) {
        this.bagIM.instanceMatrix.needsUpdate = true;
        for (const sg of this.bagSegs) if (inBox(sg.x0, sg.z0, 3) || inBox(sg.x1, sg.z1, 3)) { sg.g0 = S(sg.x0, sg.z0); sg.g1 = S(sg.x1, sg.z1); }
      }
      // xác xe: tựa trên 2 điểm đỡ cao nhất dưới thân (hố một bên -> nằm vắt mép hố; hố dưới cả thân -> lún xuống)
      const tmp = new THREE.Matrix4();
      for (const w of this.wrecks) {
        if (!w._slots || w.shattered || !inBox(w.x, w.z, 14)) continue;
        const ds = this.wreckFoot(w).map(([x, z], k) => S(x, z) - w._g0[k]).sort((a, b) => b - a);
        const dy = Math.min(0.5, ds[1]);
        if (Math.abs(dy - w._dy) < 0.02) continue;
        const step = dy - w._dy;
        w._dy = dy;
        for (const [g, i] of w._slots) {
          const im = this.wreckIM[g];
          im.getMatrixAt(i, tmp);
          tmp.elements[13] += step;
          im.setMatrixAt(i, tmp);
          dirtyIM.add(im);
        }
        if (w._smoker) w._smoker.y += step;
      }
      dirtyIM.forEach(im => { im.instanceMatrix.needsUpdate = true; });
      if (this.street) this.street.reground(x0, z0, x1, z1);
      // mặt ruộng: bám mặt đất mới; trong lòng hố thì chìm dưới lưới hố (lòng hố lộ ra, không bị mặt ruộng phẳng che)
      for (const g of this.fieldGeos || []) {
        const P = g.attributes.position;
        let any = false;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i);
          if (!inBox(x, z, 0)) continue;
          const sf = S(x, z), y = sf < raw(x, z) - 0.3 ? sf - 1.0 : sf + 0.35;
          if (Math.abs(y - P.getY(i)) < 0.01) continue;
          P.setY(i, y); any = true;
        }
        if (any) { P.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
      }
    }

    // ---------------------------------------------------------------------------
    // TƯƠNG TÁC
    // ---------------------------------------------------------------------------
    /**
     * Xe chạy qua: húc đổ rào phía trước, cán bẹp bao cát. (dx, dz) = vận tốc xe (đv/s): rào gãy to / gắt theo tốc độ húc
     * (bò qua ~5 km/h: gãy "rắc" khẽ; lao 60 km/h: vỡ toác). Trả về các nhịp rào vừa đổ (null nếu không có) để terrain
     * phát tiếng thân xe đập vào rào đá / tường đất ({ x, z, mat: 'stone' | 'adobe' | 'wood' }; bờ rào cây không tính)
     */
    crush(x, z, r, dx, dz, fx) {
      this.trampleCrops(x, z, r, dx, dz);
      let bagDirty = false, broken = null, bagAt = null;
      const kv = clamp(0.5 + Math.hypot(dx, dz) / 90, 0.55, 1.6);
      for (const o of this.near(x, z, r + 10)) {
        if (o.im) {
          if (o.broken) continue;
          if (segDist(x, z, o.ax, o.az, o.bx, o.bz) > r) continue;
          this.breakSpan(o, dx, dz, fx, kv);
          if (!o.F.leafy) (broken || (broken = [])).push({ x: o.x, z: o.z, mat: o.F === FENCE.stone ? 'stone' : o.F.solid ? 'adobe' : 'wood' });
        } else if (!o.flat && !o.gone && Math.hypot(o.x - x, o.z - z) < r) {
          o.flat = true;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bagDirty = true;
          bagAt = o;
        }
      }
      if (bagDirty) { this.bagIM.instanceMatrix.needsUpdate = true; this.updateBagTops(); }
      // bao cát bị xích đè bẹp: "huỵch" nghẹt, cát xì rào rào (trước đây im lặng)
      if (bagAt) sfx('debrisHit', bagAt.x, bagAt.y + 1, bagAt.z, 0.7 * kv, { mat: 'bag', m: 3 });
      if (this.street) this.street.crush(x, z, r, dx, dz, fx);
      return broken;
    }
    // Khoảng hở nhỏ nhất giữa nhịp rào (đoạn có bề dày t) và hộp thân xe ob -> cg { gap, nx, nz } (n: từ rào ra phía xe)
    spanGap(s, ob, cg) {
      const VC = VehicleCollision, n = Math.max(2, Math.ceil(s.L / 2.5)), r = s.F.t / 2, q = this._sgq || (this._sgq = {});
      cg.gap = Infinity;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        VC.circleGap(ob, s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t, r, q);
        if (q.gap < cg.gap) { cg.gap = q.gap; cg.nx = q.nx; cg.nz = q.nz; }
      }
      return cg;
    }
    // Xe đủ lực húc đổ nhịp rào ở tốc độ áp vn? (mũi xe xích = 1, đầu xe bánh lốp móp trước = 0,7 phần động lượng)
    spanBreaks(s, unit, vn) {
      const R = FENCE_RAM[s.kind] || FENCE_RAM.wood;
      return VehicleCollision.ramForce(unit, vn, unit.isWheeled ? 0.7 : 1) >= R[0];
    }
    /**
     * Mỗi khung, mọi xe (terrain.ramObjects): nhịp rào chạm hộp thân xe, xe đang áp vào — đủ lực thì đổ theo hướng xe chạy,
     * xe mất đà theo năng lượng phá (tường đá làm xe 4x4 khựng hẳn, xe tăng gần như không chậm); không đủ thì tường chặn
     * (vehicleBoxes). Bao cát: xích trèo lên ụ bao (vehicleDebris), bao nằm dưới giữa thân xe (dồn trọng lượng) thì bẹp.
     * Trả về nhịp rào vừa đổ cho terrain.crushHullSound (như crush)
     */
    ram(unit, ob, dt, fx) {
      if (typeof VehicleCollision === 'undefined') return null;
      const VC = VehicleCollision, remote = !!(unit.isRemote || unit._netProxy), cg = this._rcg || (this._rcg = {});
      const a = unit.bodyAngle || 0, sp = unit.speed || 0, vx = -Math.sin(a) * sp, vz = -Math.cos(a) * sp;
      const kv = clamp(0.5 + Math.abs(sp) / 90, 0.55, 1.6);
      let broken = null, bagAt = null;
      for (const o of this.near(ob.cx, ob.cz, Math.hypot(ob.hu, ob.hv) + 14)) {
        if (o.im) {
          if (o.broken) continue;
          this.spanGap(o, ob, cg);
          if (cg.gap > 0.8) continue;
          const vn = VC.approach(unit, cg.nx, cg.nz);
          // vehicleBoxes đã không chặn nhịp này trong khung (đủ lực lúc đó) -> giữ quyết định, không để tường nằm trong hộp xe
          const promised = o._goU === unit && (performance.now() / 1000) - o._goT < 0.1;
          if (vn <= 0.3) {
            // xe quay tại chỗ / trượt ngang đè sườn lên rào: đủ lực kéo thì rào đổ ra xa sườn xe
            if (cg.gap < 0 && (promised || this.spanBreaks(o, unit, 0))) {
              this.breakSpan(o, -cg.nx, -cg.nz, fx, kv);
              if (!o.F.leafy) (broken || (broken = [])).push({ x: o.x, z: o.z, mat: o.F === FENCE.stone ? 'stone' : o.F.solid ? 'adobe' : 'wood' });
            }
            continue;
          }
          if (!promised && !this.spanBreaks(o, unit, vn)) continue;
          this.breakSpan(o, vx, vz, fx, kv);
          const FR = FENCE_RAM[o.kind] || FENCE_RAM.wood;
          if (!remote) unit.speed = VC.speedAfter(unit, unit.speed, FR[1], FR[0]);
          if (!o.F.leafy) (broken || (broken = [])).push({ x: o.x, z: o.z, mat: o.F === FENCE.stone ? 'stone' : o.F.solid ? 'adobe' : 'wood' });
        } else if (!o.flat && !o.gone && this.bagIM) {
          const tx = o.x - ob.cx, tz = o.z - ob.cz, lu = tx * ob.ux + tz * ob.uz, lv = -tx * ob.uz + tz * ob.ux;
          if (Math.abs(lu) > ob.hu + 1 || Math.abs(lv) > ob.hv * 0.45) continue;
          o.flat = true;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bagAt = o;
        }
      }
      if (bagAt) {
        this.bagIM.instanceMatrix.needsUpdate = true; this.updateBagTops();
        // bao cát bị xích đè bẹp: "huỵch" nghẹt, cát xì rào rào
        sfx('debrisHit', bagAt.x, bagAt.y + 1, bagAt.z, 0.7 * kv, { mat: 'bag', m: 3 });
      }
      return broken;
    }
    // Hộp vật cản (terrain.vehicleObstacles) cho tường đá / tường đất / bờ rào cây còn đứng mà xe `unit` không đủ lực húc đổ
    // ở tốc độ áp hiện tại (unit = null: ô tô bị đẩy trượt — mọi tường đều chặn). Tường thấp hơn bậc leo của xe thì hullPush
    // tự bỏ qua (xe tì lên rồi đè đổ)
    vehicleBoxes(x, z, r, unit, out) {
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      for (const s of this.near(x, z, r + 10)) {
        if (!s.im || s.broken || !s.F.solid) continue;
        if (Math.abs(s.x - x) > r + s.L || Math.abs(s.z - z) > r + s.L) continue;
        const ux = (s.bx - s.ax) / s.L, uz = (s.bz - s.az) / s.L;
        if (unit && VC) {
          // pháp tuyến nhịp rào hướng về phía xe -> tốc độ áp
          let nx = -uz, nz = ux;
          if ((unit.x - s.x) * nx + (unit.z - s.z) * nz < 0) { nx = -nx; nz = -nz; }
          if (this.spanBreaks(s, unit, Math.max(0, VC.approach(unit, nx, nz)))) {
            s._goU = unit; s._goT = performance.now() / 1000;   // PropSet.ram cuối khung đánh đổ nhịp này nếu xe chạm
            continue;
          }
        }
        const box = s._vcBox || (s._vcBox = { cx: s.x, cz: s.z, ux, uz, hu: s.L / 2, hv: s.F.t / 2, y0: 0, y1: 0,
          mat: s.F.leafy ? 'tree' : s.F === FENCE.stone ? 'stone' : 'adobe' });
        box.y0 = Math.min(s.ga, s.gb) - 1; box.y1 = Math.max(s.ga, s.gb) + s.F.h - 0.4;
        out.push(box);
      }
      return out;
    }
    // Mặt đỡ cho xích / bánh (VehicleCollision.debrisHeight): đống đá / đất tường sập (bậc thấp ~0,2-0,35 m) và ụ bao cát
    // (2 lớp ~0,55 m; bị xích đè bẹp còn ~0,1 m) -> xe bò qua thì ngóc mũi, chúc xuống như trèo qua gờ thật
    vehicleDebris(x, z, r, out) {
      for (const o of this.near(x, z, r + 10)) {
        if (o.im) {
          if (!o.broken || !o.F.solid || o.F.leafy) continue;
          if (Math.abs(o.x - x) > r + o.L || Math.abs(o.z - z) > r + o.L) continue;
          const sy = 0.32 + hash(o.seed + 5) * 0.15, g = Math.min(o.ga, o.gb);
          const rb = o._rubble || (o._rubble = { cx: o.x, cz: o.z, ux: (o.bx - o.ax) / o.L, uz: (o.bz - o.az) / o.L, hu: o.L / 2, hv: o.F.t / 2 + 1, y0: 0, y1: 0 });
          rb.y0 = g - 1; rb.y1 = (o.ga + o.gb) / 2 - 0.4 + o.F.h * sy;   // mặt đất có thể đổi (hố bom)
          out.push(rb);
        } else if (!o.gone) {
          if (Math.abs(o.x - x) > r + 4 || Math.abs(o.z - z) > r + 4) continue;
          const base = o.y - 0.8 - o.layer * 1.6, bp = o._bump || (o._bump = { bump: true, x: o.x, z: o.z, r: 3.4, base: 0, top: 0 });
          bp.base = base; bp.top = o.flat ? base + 1.1 : o.y + 0.8;
          out.push(bp);
        }
      }
      return out;
    }
    // ---- ĐẨY XÁC XE: hộp thân xác xe theo 3 vòng va chạm (_b: đuôi, giữa, mũi) — đúng cả sau khi bị sức nổ xô lệch
    wreckObb(w, out) {
      const b0 = w._b[0], b1 = w._b[1], b2 = w._b[2], o = out || {};
      let ux = b2.x - b0.x, uz = b2.z - b0.z;
      const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
      o.cx = b1.x; o.cz = b1.z; o.ux = ux; o.uz = uz; o.hu = l / 2 + b1.radius; o.hv = b1.radius;
      return o;
    }
    // Xe đủ lực kéo ủi trượt xác xe (sức cản ma sát μ·m·g)?
    pushesWreck(w, unit) {
      if (!w || w.shattered || !unit || typeof VehicleCollision === 'undefined') return false;
      return VehicleCollision.tractive(unit) > WRECK_MU * (WRECK_MASS[w.kind] || 20) * 1000 * 9.81;
    }
    /**
     * Xe đi từ (x0, z0) tới (x1, z1): ủi xác xe trên bản đồ. Xe đủ lực kéo thì xác xe trượt theo, xoay quanh điểm bị
     * húc lệch tâm; xe chậm hẳn theo tỉ lệ sức cản / lực kéo (xe tăng ủi xác xe tăng chỉ bò ~10 km/h, ủi xác xe tải gần
     * như không chậm). Cú húc mạnh: xác xe văng trượt thêm một đoạn (va chạm mềm, chia động lượng). Xe không đủ lực thì
     * xác xe chặn như tảng đá (resolveVehicleCollision). proxy = xe bản sao mạng: chỉ dời xác xe
     */
    wreckContact(unit, x0, z0, x1, z1, dt, proxy) {
      const out = this._wcOut || (this._wcOut = { x: 0, z: 0 });
      out.x = x1; out.z = z1;
      // xe không đủ lực ủi cả xác xe nhẹ nhất (xe tải): bỏ qua cả vòng
      if (!this.wrecks.length || typeof VehicleCollision === 'undefined' || !dt || unit.isDead
        || VehicleCollision.tractive(unit) <= WRECK_MU * WRECK_MASS.truck * 1000 * 9.81) return out;
      const VC = VehicleCollision, reach = VC.reach(unit) + 30;
      const ub = VC.vehObb(unit, x1, z1, unit.bodyAngle || 0, this._wub || (this._wub = {})), wb = this._wob || (this._wob = {});
      for (const w of this.wrecks) {
        if (w.shattered || !w._b || w._b.length < 3 || Math.abs(w._b[1].x - x1) > reach || Math.abs(w._b[1].z - z1) > reach) continue;
        if (!this.pushesWreck(w, unit)) continue;
        this.wreckObb(w, wb);
        const p = VC.obbPush(ub.cx, ub.cz, ub.ux, ub.uz, ub.hu, ub.hv, wb, this._wpp || (this._wpp = {}));
        if (!p || p.d < 1e-4) continue;
        const nx = p.x / p.d, nz = p.z / p.d;   // từ xác xe ra phía xe
        const vn = Math.max(0, VC.approach(unit, nx, nz));
        // cánh tay đòn: điểm chạm (tâm xe chiếu lên hộp xác xe) so với tâm xác xe -> xoay khi bị húc lệch về mũi / đuôi
        const tx = ub.cx - wb.cx, tz = ub.cz - wb.cz, lu = clamp(tx * wb.ux + tz * wb.uz, -wb.hu, wb.hu), lv = clamp(-tx * wb.uz + tz * wb.ux, -wb.hv, wb.hv);
        const rx = lu * wb.ux - lv * wb.uz, rz = lu * wb.uz + lv * wb.ux;
        const Fx = -nx * p.d, Fz = -nz * p.d, I = (wb.hu * wb.hu + wb.hv * wb.hv) / 3;
        const dTh = clamp((rx * Fz - rz * Fx) / I * 0.8, -0.08, 0.08);
        const moved = this.moveWreck(w, Fx, Fz, dTh, unit);
        const rest = Math.max(0, p.d - moved);
        const mU = unit.mass || 40, mW = WRECK_MASS[w.kind] || 20, Fw = WRECK_MU * mW * 1000 * 9.81, Ft = VC.tractive(unit);
        const first = !(w._pushU === unit.id && w._pushT > 0);
        const pos = { x: wb.cx + nx * wb.hv, y: (w.gy || 0) + 6, z: wb.cz + nz * wb.hv };
        // húc mạnh: chia động lượng (va chạm mềm) — xác xe văng trượt tiếp (ma sát hãm lại), xe khựng. Cả xe bản sao mạng
        // (cú văng chỉ theo tốc độ & khối lượng của xe húc -> máy nào cũng trượt như nhau; chủ phòng đồng bộ lại tư thế)
        const v1 = vn * mU / (mU + mW);
        if (first && vn > 2) {
          w.vx = -nx * v1; w.vz = -nz * v1; w.w = clamp(dTh / dt * 0.25, -1.2, 1.2);
          if (!this.wMoving) this.wMoving = new Set();
          this.wMoving.add(w);
        }
        if (!proxy) {
          out.x += nx * rest; out.z += nz * rest;
          ub.cx += nx * rest; ub.cz += nz * rest;
          if (first && vn > 2) {
            unit.speed *= clamp(1 - (vn - v1) / Math.max(1, Math.abs(unit.speed || 1)), 0.2, 1);
            impact(unit, 'wreck', pos, vn, 0, mU, mW, true, null);
          } else if (moved / dt > 6) impact(unit, 'wreck', pos, 0, moved / dt, mU, mW, false, null);   // đang ủi: thép nghiến, gầm cày đất
          // ủi liên tục: tốc độ bị giới hạn theo phần lực kéo còn dư sau sức cản (công suất máy ăn vào ma sát xác xe)
          const cap = (unit.baseMaxSpeed || 100) * clamp(1 - Fw / Ft, 0.1, 1) * 0.6;
          if (Math.abs(unit.speed || 0) > cap && vn > 0.5) unit.speed = Math.sign(unit.speed) * Math.max(cap, Math.abs(unit.speed) * Math.pow(0.9, dt * 60));
        }
        w._pushU = unit.id; w._pushT = 0.4;
      }
      return out;
    }
    // Dời xác xe (dx, dz) + xoay dθ quanh vòng giữa; vướng nhà / đá / xác xe khác thì dời bớt (1/2, 1/4). Trả về quãng đã dời
    // pusher: xe đang ủi (không tính là vật vướng)
    moveWreck(w, dx, dz, dTh, pusher) {
      const L = Math.hypot(dx, dz);
      if (L < 1e-4 && Math.abs(dTh) < 1e-5) return 0;
      const c = w._b[1], ob = this._wmb || (this._wmb = {});
      for (const f of [1, 0.5, 0.25]) {
        const ddx = dx * f, ddz = dz * f, th = dTh * f, cs = Math.cos(th), sn = Math.sin(th);
        // vị trí thử các vòng va chạm
        const pts = w._b.map(b => {
          const ex = b.x - c.x, ez = b.z - c.z;
          return [c.x + ddx + ex * cs - ez * sn, c.z + ddz + ex * sn + ez * cs];
        });
        if (this.wreckBlocked(w, pts, ob, pusher)) continue;
        this.applyWreckMove(w, ddx, ddz, th);
        const gy = w.gy || 0;
        // cày đất: thỉnh thoảng bụi đất tung dưới gầm xác xe bị ủi
        const fx = typeof window !== 'undefined' && window.game && window.game.effectsManager && window.game.effectsManager.fx;
        if (fx && fx.smoke && L * f > 0.3 && Math.random() < 0.35) {
          fx.smoke.add({ x: c.x + (Math.random() - 0.5) * 10, y: gy + 1, z: c.z + (Math.random() - 0.5) * 10, vx: ddx * 6, vy: 3 + Math.random() * 4, vz: ddz * 6,
            size: 2 + Math.random() * 2, grow: 3, drag: 1.5, grav: 4, life: 1.4, alpha: 0.4, fadeIn: 0.05, c0: [0.55, 0.5, 0.42], cell: 0 });
        }
        return L * f;
      }
      return 0;
    }
    // Dời thẳng (không xét vướng): vòng va chạm + mô hình xoay dθ quanh vòng giữa rồi tịnh tiến (dx, dz), bám mặt đất mới
    applyWreckMove(w, dx, dz, th) {
      const c = w._b[1], cs = Math.cos(th), sn = Math.sin(th), ox = c.x, oz = c.z;
      for (const b of w._b) {
        const ex = b.x - ox, ez = b.z - oz;
        b.x = ox + dx + ex * cs - ez * sn; b.z = oz + dz + ex * sn + ez * cs;
      }
      w.x += dx; w.z += dz;
      w.angle = Math.atan2(w._b[2].z - w._b[0].z, w._b[2].x - w._b[0].x);
      const gy = this.T.groundAtRaw(c.x, c.z);
      if (w.group) {
        // quay quanh vòng giữa (trục Y thế giới)
        const gp = w.group.position, ex = gp.x - ox, ez = gp.z - oz;
        gp.x = c.x + ex * cs - ez * sn; gp.z = c.z + ex * sn + ez * cs;
        gp.y += gy - (w.gy || 0);
        w.group.rotation.y -= th;
      }
      if (w._smoker) { w._smoker.x += dx; w._smoker.z += dz; w._smoker.y += gy - (w.gy || 0); }
      w.gy = gy;
      w._g0 = this.wreckFoot(w).map(([x, z]) => this.T.groundAtRaw(x, z)); w._dy = 0;
      w._moved = true;   // wreckState gửi kèm tư thế
    }
    wreckBlocked(w, pts, ob, pusher) {
      const T = this.T, VC = VehicleCollision, b1 = w._b[1];
      let ux = pts[2][0] - pts[0][0], uz = pts[2][1] - pts[0][1];
      const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
      ob.cx = pts[1][0]; ob.cz = pts[1][1]; ob.ux = ux; ob.uz = uz; ob.hu = l / 2 + b1.radius; ob.hv = b1.radius;
      const obs = typeof T.vehicleObstacles === 'function' ? T.vehicleObstacles(ob.cx, ob.cz, null) : null;
      if (obs) for (const b of obs) {
        if (b.y1 <= (w.gy || 0) + 3) continue;
        const q = VC.obbPush(ob.cx, ob.cz, ob.ux, ob.uz, ob.hu, ob.hv, b, this._wq || (this._wq = {}));
        if (q && q.d > 0.3) return true;
      }
      const cq = this._wcq || (this._wcq = {}), R = Math.hypot(ob.hu, ob.hv);
      for (const rk of T.boulders) {
        if (w._b.includes(rk)) continue;
        const rad = rk.radius || 18;
        if (Math.abs(rk.x - ob.cx) > R + rad || Math.abs(rk.z - ob.cz) > R + rad) continue;
        if (VC.circleGap(ob, rk.x, rk.z, rad * 0.8, cq).gap < 0) return true;
      }
      // xe khác (trừ xe đang ủi): xác xe không bị dồn lồng vào xe đứng cạnh
      const units = typeof window !== 'undefined' && window.game && window.game.units;
      if (units) for (const v of units) {
        if (v === pusher || v.isDead || !v.group || Math.abs(v.x - ob.cx) > R + 60 || Math.abs(v.z - ob.cz) > R + 60) continue;
        const vb = VC.vehObb(v, v.x, v.z, v.bodyAngle || 0, this._wvb || (this._wvb = {}));
        const q = VC.obbPush(ob.cx, ob.cz, ob.ux, ob.uz, ob.hu, ob.hv, vb, this._wq2 || (this._wq2 = {}));
        if (q && q.d > 0.3) return true;
      }
      // mép kè / vách dốc: xác xe không bị ủi rơi xuống lòng kênh
      if (T.groundAtRaw(ob.cx, ob.cz) < (w.gy || 0) - 5) return true;
      return false;
    }
    // Xác xe văng trượt sau cú húc mạnh: ma sát trượt hãm lại (μ·g), vướng vật thì dừng
    updateWrecks(dt) {
      for (const w of this.wrecks) if (w._pushT > 0) w._pushT -= dt;
      if (!this.wMoving || !this.wMoving.size) return;
      const dec = WRECK_MU * 78;   // 9,8 m/s² x 8 đv/m
      for (const w of this.wMoving) {
        if (w.shattered) { this.wMoving.delete(w); continue; }
        const v = Math.hypot(w.vx, w.vz);
        const nv = Math.max(0, v - dec * dt);
        if (nv <= 0.5) { this.wMoving.delete(w); w.vx = w.vz = w.w = 0; continue; }
        w.vx *= nv / v; w.vz *= nv / v; w.w *= Math.max(0, 1 - dt * 3);
        const want = nv * dt, got = this.moveWreck(w, w.vx * dt, w.vz * dt, w.w * dt);
        if (got < want * 0.9) { this.wMoving.delete(w); w.vx = w.vz = w.w = 0; }
      }
    }
    updateBagTops() {
      // đoạn bao cát bị cán bẹp quá nửa -> không còn chắn đạn
      for (const sg of this.bagSegs) {
        let n = 0, f = 0;
        for (const b of this.near((sg.x0 + sg.x1) / 2, (sg.z0 + sg.z1) / 2, sg.L / 2 + 4)) {
          if (b.im || segDist(b.x, b.z, sg.x0, sg.z0, sg.x1, sg.z1) > 1) continue;
          n++; if (b.flat || b.gone) f++;
        }
        sg.dead = n > 0 && f / n > 0.5;
        sg.gaps = f > 0;   // có bao đã bẹp / văng: chắn đạn theo từng chỗ (standTop) thay vì cả đoạn cao đều
      }
    }
    /** Sóng nổ / đạn tại (x, y, z): đổ rào trong bán kính */
    damageAt(x, y, z, ammo, heavy, fx) {
      const A = (typeof Destructibles !== 'undefined' && Destructibles.ammoInfo) ? Destructibles.ammoInfo(ammo, heavy) : { power: 1, radius: 20 };
      const R = A.power >= 0.3 ? A.radius * 1.3 + 4 : A.radius;
      let bagHit = false;
      // ruộng: sóng nổ quật rạp cây trồng toả ra, nổ mạnh / đạn cháy làm cháy sém quanh tâm
      if (this.cropTops && A.power >= 0.25 && Number.isFinite(y) && y - this.T.groundAtRaw(x, z) < R) this.blastCrops(x, z, R * 0.5, A.power >= 0.6 || /INCENDIARY/.test(ammo));
      for (const o of this.near(x, z, R + 10)) {
        if (!o.im) { if (this.blastBag(o, x, y, z, A, ammo)) bagHit = true; continue; }
        if (o.broken) continue;
        // khoảng cách 3 chiều: nổ trên tán cây / nóc nhà cao không quật đổ rào dưới đất (trước đây chỉ xét mặt bằng)
        const hasG = Number.isFinite(o.ga) && Number.isFinite(o.gb) && Number.isFinite(y);
        const top = hasG ? (o.ga + o.gb) / 2 + o.F.h : 0, bot = hasG ? Math.min(o.ga, o.gb) - 1 : 0;
        const dy = !hasG ? 0 : y > top ? y - top : y < bot ? bot - y : 0;
        const d = Math.hypot(segDist(x, z, o.ax, o.az, o.bx, o.bz), dy);
        if (d > R) continue;
        // tường đá / đất bền hơn rào gỗ: cần nổ mạnh hoặc gần. Đạn xuyên động năng không có sức nổ: chỉ đổ đoạn bị trúng thẳng
        if (o.F.solid && !o.F.leafy && (A.power < 0.9 || ammo === 'AP') && d > A.radius * 0.5) continue;
        if (A.power < 0.3 && o.F.solid) continue;
        // nhịp đổ vì chính vụ nổ này: mảnh văng & sức ép tới trước khi đá / đất kịp sụp -> blastCover vẫn tính nhịp còn đứng
        // (game phá cảnh vật trước rồi mới tính sát thương nổ lan)
        if (!o.broken) { o.bkx = x; o.bkz = z; }
        this.breakSpan(o, o.x - x, o.z - z, fx);
      }
      if (bagHit) this.bagsBlasted(x, y, z, A, fx);
      if (this.street) this.street.damageAt(x, y, z, A, fx, ammo);
      for (const w of this.wrecks) if (!w.shattered && Math.abs(w.x - x) < 40 + A.radius && Math.abs(w.z - z) < 40 + A.radius) this.blastWreck(w, x, y, z, A, ammo, fx);
    }
    /**
     * Xác xe trúng đạn / nổ gần: sức phá = sức nổ giảm theo khoảng cách tới thân xác xe (+ động năng nếu trúng thẳng). Đạn
     * súng chỉ băm dần (xe tải cháy rỗng: ~35 viên 30 mm). Quá nửa sức chịu: xác xe bị thổi xô lệch, méo, đen sạm hơn; hết
     * sức chịu: nát bét — thân, tháp, xích, bánh văng tung toé nằm bẹp quanh chỗ cũ, không còn che chắn / cản xe (gỡ khỏi
     * danh sách vật cản như đá tảng vỡ). Sức chịu chỉ đổi theo chuỗi ENV_HIT (băm theo toạ độ, không RNG) -> mọi máy như nhau
     */
    blastWreck(w, x, y, z, A, ammo, fx) {
      let d = Infinity;
      for (const b of w._b) d = Math.min(d, Math.max(0, Math.hypot(x - b.x, z - b.z) - b.radius));
      const top = (w.gy || 0) + ((w.kind === 'dump' || w.kind === 'truck') ? 12 : 13), dy = y > top ? y - top : 0;
      d = Math.hypot(d, dy);
      const R = A.power >= 0.3 ? A.radius * 0.6 + 4 : A.radius;
      if (d > R) return;
      const direct = d < 3.5;
      let dmg = A.power * Math.pow(1 - d / R, 1.5) + (direct ? A.power * 1.5 : 0);
      if (A.power < 0.3) dmg *= direct ? ((w.kind === 'dump' || w.kind === 'truck') ? 1 : w.kind === 'apc' ? 0.4 : 0.12) : 0;
      if (ammo === 'AP') dmg *= (w.kind === 'dump' || w.kind === 'truck') ? 1.0 : 0.85;
      if (dmg <= 0.001) return;
      const was = w.hp / w.hp0;
      w.hp -= dmg;
      const k = w.hp / w.hp0;
      if (k <= 0) this.shatterWreck(w, x, z, fx);
      else if (was > 0.5 && k <= 0.5) this.mangleWreck(w, x, z, fx);
    }
    // ĐỒNG BỘ (terrain.envStateString): sức chịu còn lại từng xác xe theo bậc 1/20 ('X' = đã nát) — máy vào trận giữa chừng
    // / máy lệch trạng thái gộp theo mức hư nặng hơn
    // Xác xe đã bị xe ủi dời chỗ: kèm tư thế '@x:z:góc' (tâm vòng giữa, 0,1 đv / 0,001 rad) -> máy khác / máy vào giữa trận
    // đặt xác xe đúng chỗ như chủ phòng
    wreckState() {
      return this.wrecks.map(w => {
        if (w.shattered) return 'X';
        const hp = Math.max(0, Math.round((w.hp !== undefined ? w.hp / w.hp0 : 1) * 20));
        if (!w._moved || !w._b || w._b.length < 3) return String(hp);
        return hp + '@' + Math.round(w._b[1].x * 10) / 10 + ':' + Math.round(w._b[1].z * 10) / 10 + ':' + Math.round(w.angle * 1000) / 1000;
      }).join(',');
    }
    applyWreckState(str, fx) {
      String(str).split(',').forEach((s, i) => {
        const w = this.wrecks[i];
        if (!w || w.shattered || s === '' || w.hp === undefined) return;
        if (s === 'X') { this.shatterWreck(w, w.x + 1, w.z, null); return; }
        const [v, pose] = s.split('@');
        // tư thế: chỉ đặt lại khi lệch rõ và máy này không đang có xe ủi / xác xe đang trượt (khỏi giành giật mỗi gói)
        if (pose && w._b && w._b.length >= 3 && !(w._pushT > 0) && !(this.wMoving && this.wMoving.has(w))) {
          const [px, pz, pa] = pose.split(':').map(Number);
          if (isFinite(px) && isFinite(pz) && isFinite(pa)) {
            let dth = pa - w.angle;
            while (dth > Math.PI) dth -= 2 * Math.PI;
            while (dth < -Math.PI) dth += 2 * Math.PI;
            const dx = px - w._b[1].x, dz = pz - w._b[1].z;
            if (Math.hypot(dx, dz) > 2 || Math.abs(dth) > 0.04) this.applyWreckMove(w, dx, dz, dth);
          }
        }
        const k = +v / 20;
        if (!(k < w.hp / w.hp0)) return;
        const was = w.hp / w.hp0;
        w.hp = k * w.hp0;
        if (was > 0.5 && k <= 0.5) this.mangleWreck(w, w.x + 1, w.z, null);
      });
    }
    // nửa sức chịu: cả xác xe bị sức ép xô lệch ra xa điểm nổ ~0,5-1 m, nghiêng / lật nghiêng, cháy đen thêm
    mangleWreck(w, x, z, fx) {
      let dx = w.x - x, dz = w.z - z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const h = hash(Math.round(w.x * 3) ^ Math.round(w.z * 5));
      const push = 4 + h * 5, roll = (h - 0.5) * 0.5;

      // Xô lệch và làm nghiêng mô hình xe chi tiết
      if (w.group) {
        w.group.position.x += dx * push;
        w.group.position.z += dz * push;
        w.group.rotation.z += roll;
      }

      const T0 = new THREE.Matrix4().makeTranslation(-w.x, -(w.gy || 0), -w.z);
      const Rm = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-dz, 0, dx), roll);
      const T1 = new THREE.Matrix4().makeTranslation(w.x + dx * push, (w.gy || 0), w.z + dz * push);
      const X = T1.multiply(Rm).multiply(T0), m = new THREE.Matrix4();
      for (const [g, i] of (w._slots || [])) {
        const im = this.wreckIM[g];
        if (!im) continue;
        im.getMatrixAt(i, m); m.premultiply(X); im.setMatrixAt(i, m);
        im.setColorAt(i, new THREE.Color(0.42, 0.4, 0.38)); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      for (const b of w._b) { b.x += dx * push; b.z += dz * push; b.height *= 0.8; }
      this.wreckFx(w, fx, 0.6);
    }
    // nát bét: từng bộ phận văng ra 1-5 m quanh chỗ cũ theo hướng xa điểm nổ, nằm bẹp nghiêng ngả trên đất; gỡ va chạm
    shatterWreck(w, x, z, fx) {
      w.shattered = true;
      let dx = w.x - x, dz = w.z - z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;

      // Mô hình xe chi tiết: khung gầm bẹp dúm dó sát đất, cháy đen sì than rỉ sét, tháp pháo văng lăn lóc
      if (w.group) {
        // vỏ thép bẹp dúm sụm gầm (còn ~1/2 chiều cao, bè ra), lún xuống đất, nghiêng lệch hẳn — không dẹt như tờ giấy
        w.group.scale.set(1.1, 0.55, 1.08);
        w.group.position.y -= 1.4;
        w.group.rotation.x += (hash(Math.round(w.x * 5)) - 0.5) * 0.45;
        w.group.rotation.z += (hash(Math.round(w.z * 7)) - 0.5) * 0.45;
        // cháy lần nữa: muội phủ sẫm hẳn (vật liệu riêng từng xác -> sửa tại chỗ, giữ phong hoá gỉ / tro)
        const seen = new Set();
        w.group.traverse(c => {
          if (c.isMesh && c.material && !seen.has(c.material)) {
            seen.add(c.material);
            c.material.color.multiplyScalar(0.42);
            c.material.roughness = 0.98;
            c.material.metalness = 0.1;
          }
        });
        if (w.turretGroup) {
          w.turretGroup.position.x += dx * 32;
          w.turretGroup.position.z += dz * 32;
          w.turretGroup.position.y -= 1.5;
          w.turretGroup.rotation.x += 2.6;
          w.turretGroup.rotation.z += 1.2;
        }
      }

      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
      let n = 0;
      for (const [g, i] of (w._slots || [])) {
        const im = this.wreckIM[g];
        if (!im) continue;
        im.getMatrixAt(i, m); m.decompose(p, q, sc);
        const h1 = hash(i * 31 + n * 7 + Math.round(w.x)), h2 = hash(i * 17 + n * 13 + Math.round(w.z)), h3 = hash(i * 11 + n * 3 + 5);
        n++;
        let dx = p.x - x, dz = p.z - z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const a = (h1 - 0.5) * 1.6, ca = Math.cos(a), sa = Math.sin(a);
        const fly = 8 + h2 * (g === 'turret' || g === 'barrel' || g === 'wheel' ? 34 : 18);
        p.x += (dx * ca - dz * sa) * fly; p.z += (dx * sa + dz * ca) * fly;
        // thân / khung bẹp dí, xé làm mảng nằm nghiêng; bánh, xích, nòng nằm vương vãi
        if (g === 'hull') sc.set(sc.x * (0.55 + 0.3 * h3), sc.y * 0.4, sc.z * (0.55 + 0.3 * h2));
        q.premultiply(new THREE.Quaternion().setFromEuler(e.set((h2 - 0.5) * 1.4, h1 * 6.28, (h3 - 0.5) * 1.4)));
        const gy = this.T.surfaceAt ? this.T.surfaceAt(p.x, p.z, true) : this.T.groundAtRaw(p.x, p.z);
        p.y = gy + Math.min(sc.x, sc.y, sc.z) * 0.3;
        m.compose(p, q, sc);
        im.setMatrixAt(i, m);
        im.setColorAt(i, new THREE.Color(0.26, 0.25, 0.24));
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      // không còn che chắn / cản đường: gỡ khỏi danh sách vật cản (như đá tảng vỡ) + báo bot tìm đường lại
      for (const b of w._b) { const bi = this.T.boulders.indexOf(b); if (bi >= 0) this.T.boulders.splice(bi, 1); }
      if (this.T.envDamage && this.T.envDamage.markNav) this.T.envDamage.markNav(w.x, w.z, 120);
      if (w._smoker) w._smoker.y = (w.gy || 0) + 3;
      this.wreckFx(w, fx, 1.2);
    }
    wreckFx(w, fx, k) {
      if (fx) {
        if (fx.fire && k >= 1) for (let i = 0; i < 24; i++) {
          const a = Math.random() * 6.28, sp = 12 + Math.random() * 24;
          fx.fire.add({
            x: w.x + Math.cos(a) * 4, y: (w.gy || 0) + 3, z: w.z + Math.sin(a) * 4,
            vx: Math.cos(a) * sp, vy: 14 + Math.random() * 20, vz: Math.sin(a) * sp,
            size: 5 + Math.random() * 6, grow: 4, drag: 2.2, grav: -5, life: 0.8 + Math.random() * 0.5,
            alpha: 1, fadeIn: 0.01, c0: [1, 0.75, 0.3], c1: [0.8, 0.2, 0.03], cell: 1, floor: false
          });
        }
        if (fx.smoke) for (let i = 0; i < Math.round(16 * k); i++) {
          const a = hash(i * 13 + Math.round(w.x)) * TAU, r = hash(i * 7 + Math.round(w.z)) * 12;
          fx.smoke.add({
            x: w.x + Math.cos(a) * r, y: (w.gy || 0) + 4, z: w.z + Math.sin(a) * r,
            vx: Math.cos(a) * 14, vy: 8 + hash(i + 3) * 14, vz: Math.sin(a) * 14,
            size: 5 + hash(i + 5) * 6, grow: 6, drag: 1.6, grav: -2, life: 2.5 + Math.random() * 2,
            alpha: 0.75, fadeIn: 0.03, c0: [0.14, 0.13, 0.12], c1: [0.28, 0.27, 0.25], cell: 0, floor: false
          });
        }
        if (fx.hardRocks && k >= 1) for (let i = 0; i < 16; i++) {
          const a = Math.random() * 6.28, sp = 16 + Math.random() * 28;
          fx.hardRocks.add({
            x: w.x + (Math.random() - 0.5) * 5, y: (w.gy || 0) + 4, z: w.z + (Math.random() - 0.5) * 5,
            vx: Math.cos(a) * sp, vy: 10 + Math.random() * 22, vz: Math.sin(a) * sp,
            size: 0.8 + Math.random() * 1.4, life: 3.5, c: [0.16, 0.15, 0.14]
          });
        }
      }
      sfx('sheetMetal', w.x, (w.gy || 0) + 6, w.z, 0.9 * k, { h: 10 });
      if (k >= 1) sfx('fuel', w.x, (w.gy || 0) + 6, w.z, 0.8, { h: 10 });
    }
    /**
     * Bao cát trúng nổ: bao cát chặn đạn súng & mảnh văng rất tốt (đạn súng không làm gì được), nhưng sức nổ áp sát xé rách,
     * hất văng bao -> bờ bao thủng một khe đúng chỗ nổ: nổ mạnh 120 mm khe ~2 m, đa năng / tên lửa ~1,5 m, bom con ~1 m,
     * lựu pháo 155 ~3 m; đạn xuyên động năng chỉ xé rách bao bị trúng thẳng.
     * Sát tâm nổ: bao rách toác (cát vãi hết) hoặc bị hất văng xa vài mét; xa hơn: bao rách, xẹp lún tại chỗ.
     * Không dùng RNG (băm theo toạ độ) -> mọi máy nhận ENV_HIT ra cùng kết quả.
     */
    // NÒNG PHÁO QUÉT / ĐẬP (BarrelSweep, barrel_sweep.js): điểm mẫu dọc nòng S.pts lọt vào nhịp rào / bao cát.
    // Năng lượng cú đập ≥ sức chịu nhịp (FENCE_RAM, như xe húc) thì rào đổ ra xa theo chiều quét; chưa đủ thì rào rung
    // (tiếng nòng nện vào). Bao cát: cú đập ≥ ~2,5 kJ gạt bao văng xuống đất 0,4-0,9 m theo chiều quét, bao trên mất
    // chỗ tựa thì sụp theo. Trả { x, y, z, mat, mB } để phát tiếng nòng nện vào vật
    barrelSweep(S) {
      let hit = null, bags = null;
      for (const o of this.near(S.cx, S.cz, S.R + 10)) {
        if (o.im) {
          if (o.broken) continue;
          const top = (o.ga + o.gb) / 2 + o.F.h - 0.4, bot = Math.min(o.ga, o.gb) - 0.5;
          for (const p of S.pts) {
            if (p.y < bot || p.y > top + S.rb || segDist(p.x, p.z, o.ax, o.az, o.bx, o.bz) > o.F.t / 2 + S.rb) continue;
            const FR = FENCE_RAM[o.kind] || FENCE_RAM.wood, mat = o.F.leafy ? 'tree' : o.F === FENCE.stone ? 'stone' : o.F.solid ? 'adobe' : 'wood';
            if (p.E >= FR[1]) this.breakSpan(o, p.vx, p.vz, S.fx, clamp(0.5 + p.s / 90, 0.55, 1.6));
            hit = hit || { x: p.x, y: p.y, z: p.z, mat, mB: o.F.solid ? 4 : 0.4 };
            break;
          }
        } else if (!o.flat && !o.gone && this.bagIM) {
          // bao nằm theo hướng yaw: nửa dài 2,9, nửa rộng 1,6, nửa cao ~0,9 quanh tâm
          const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
          for (const p of S.pts) {
            if (Math.abs(p.y - o.y) > 0.9 + S.rb) continue;
            const tx = p.x - o.x, tz = p.z - o.z;
            if (Math.abs(tx * c - tz * s) > 2.9 + S.rb || Math.abs(tx * s + tz * c) > 1.6 + S.rb) continue;
            if (p.E >= 2500) {
              const l = p.s || 1, h = hash(o.seed + 41), d = 3 + h * 4;
              o.gone = true;
              o.tx = o.x + p.vx / l * d; o.tz = o.z + p.vz / l * d;
              const g = this.T.surfaceAt ? this.T.surfaceAt(o.tx, o.tz, true) : this.T.groundAtRaw(o.tx, o.tz);
              o.ty = g + 0.35; o.tyaw = o.yaw + (h - 0.5) * 1.6; o.troll = (hash(o.seed + 43) - 0.5) * 0.5;
              (bags || (bags = [])).push(o);
            }
            hit = hit || { x: p.x, y: p.y, z: p.z, mat: 'adobe', mB: 2 };
            break;
          }
        }
      }
      // bao bị gạt: bao trên mất chỗ tựa sụp xuống, cập nhật hình / khả năng chắn đạn, bụi cát + tiếng
      if (bags) this.bagsBlasted(bags[0].x, bags[0].y, bags[0].z, { radius: 10 }, S.fx);
      if (this.street) hit = this.street.barrelSweep(S) || hit;
      return hit;
    }
    blastBag(b, x, y, z, A, ammo) {
      if (b.gone || A.power < 0.3) return false;
      const kinetic = ammo === 'AP';
      // (điểm chạm nằm ở mặt bờ bao, cách đường tâm bao ~2,6 đv -> bán kính tính từ tâm bao cộng thêm khoảng đó)
      const Rb = kinetic ? 3.6 : A.radius * 0.24 + 3;
      const d = Math.hypot(b.x - x, b.y - y, b.z - z);
      if (d > Rb) return false;
      if (kinetic || d > Rb * 0.55) {
        if (b.flat) return false;
        b.flat = true;
        return true;
      }
      b.gone = true;
      const h = hash(b.seed + Math.round(x * 3) * 131 + Math.round(z * 3) * 71);
      if (d < Rb * 0.22) { b.shred = true; return true; }
      // hất văng theo hướng từ tâm nổ ra, càng gần càng xa
      let dx = b.x - x, dz = b.z - z;
      const l = Math.hypot(dx, dz);
      if (l < 0.3) { const a = h * TAU; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= l; dz /= l; }
      const fly = 3 + (1 - d / Rb) * 14 * (0.6 + 0.8 * h);
      const sw = (hash(b.seed + 17) - 0.5) * 0.9;   // lệch ngang một chút
      b.tx = b.x + (dx - dz * sw) * fly; b.tz = b.z + (dz + dx * sw) * fly;
      const T = this.T, g = T.surfaceAt ? T.surfaceAt(b.tx, b.tz, true) : T.groundAtRaw(b.tx, b.tz);
      b.ty = g + 0.35; b.tyaw = h * TAU; b.troll = (hash(b.seed + 29) - 0.5) * 0.5;
      return true;
    }
    // Sau loạt bao bị nổ: bao lớp trên mất chỗ tựa thì đổ sụp xuống, cập nhật hình & khả năng chắn đạn, bụi cát + tiếng
    bagsBlasted(x, y, z, A, fx) {
      const near = this.near(x, z, A.radius * 0.32 + 12).filter(o => !o.im);
      for (let pass = 0; pass < 3; pass++) {
        for (const b of near) {
          if (b.gone || b.flat || !b.layer) continue;
          const held = near.some(q => q.layer === b.layer - 1 && !q.gone && !q.flat && Math.hypot(q.x - b.x, q.z - b.z) < 3.6);
          if (!held) b.flat = true;
        }
      }
      for (const b of near) this.bagIM.setMatrixAt(b.i, this.bagMatrix(b));
      this.bagIM.instanceMatrix.needsUpdate = true;
      this.updateBagTops();
      if (fx && fx.smoke) {
        for (let k = 0; k < 10; k++) {
          const a = hash(k * 13 + Math.round(x)) * TAU, r = hash(k * 7 + Math.round(z)) * 4;
          fx.smoke.add({ x: x + Math.cos(a) * r, y: y + 1, z: z + Math.sin(a) * r, vx: Math.cos(a) * 9, vy: 4 + hash(k + 3) * 7, vz: Math.sin(a) * 9,
            size: 1.6 + hash(k + 5) * 1.8, grow: 2.4, drag: 2.2, grav: 5, life: 1.6, alpha: 0.55, fadeIn: 0.02, c0: [0.62, 0.55, 0.42], cell: 2 });
        }
      }
      sfx('adobe', x, y, z, 0.5, { h: 3 });
    }
    // Đỉnh bờ bao (so với chân bờ) tại (x, z) theo các bao còn đứng gần đó: -1 = khe hở (bao quanh đó đã rách / văng / đổ)
    standTop(x, z) {
      let top = -1;
      for (const b of this.near(x, z, 4)) {
        if (b.im || b.gone || b.flat || Math.abs(b.x - x) > 3.4 || Math.abs(b.z - z) > 3.4) continue;
        top = Math.max(top, b.layer * 1.6 + 2.4);
      }
      return top;
    }
    /** Điểm (x, y, z) nằm trong khối bao cát còn nguyên -> chắn đạn */
    // Gọi ở mỗi bước mô phỏng đường đạn (hàng nghìn lần / khung): loại nhanh bằng hộp bao của đoạn bao cát
    // (nới 2.6 = bề dày bờ bao) và dải độ cao, rồi mới tính khoảng cách điểm - đoạn — kết quả y hệt cách cũ
    segmentHit(a, b) {
      return (this.street && typeof this.street.segmentHit === 'function') ? this.street.segmentHit(a, b) : null;
    }
    // ammo: loại đạn đang bay (rào gỗ / tre: đạn động năng lọt qua, xem wallHit); không truyền = coi như đạn có ngòi nổ
    hitTest(x, y, z, ammo) {
      if (this.street) { const h = this.street.hitTest(x, y, z); if (h) return h; }
      if (this.wallRuns.length) { const w = this.wallHit(x, y, z, ammo); if (w) return w; }
      for (const sg of this.bagSegs) {
        if (sg.dead) continue;
        if (x < (sg.x0 < sg.x1 ? sg.x0 : sg.x1) - 2.6 || x > (sg.x0 > sg.x1 ? sg.x0 : sg.x1) + 2.6 ||
            z < (sg.z0 < sg.z1 ? sg.z0 : sg.z1) - 2.6 || z > (sg.z0 > sg.z1 ? sg.z0 : sg.z1) + 2.6) continue;
        if (y < (sg.g0 < sg.g1 ? sg.g0 : sg.g1) - 2 || y > (sg.g0 > sg.g1 ? sg.g0 : sg.g1) + sg.top) continue;
        const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, L2 = dx * dx + dz * dz;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - sg.x0) * dx + (z - sg.z0) * dz) / L2)) : 0;
        const ex = x - (sg.x0 + dx * t), ez = z - (sg.z0 + dz * t);
        if (ex * ex + ez * ez > 2.6 * 2.6) continue;
        const gy = sg.g0 + (sg.g1 - sg.g0) * t;
        if (y < gy - 2 || y > gy + sg.top) continue;
        // khe hở do nổ / lớp trên đã đổ: đạn bay lọt qua chỗ bờ bao thấp hơn
        const top = sg.gaps ? this.standTop(x, z) : sg.top;
        if (y <= gy + top) return { hit: true, type: 'SANDBAG', x, y, z };
      }
      return null;
    }
    /**
     * Điểm (x, y, z) nằm trong khối chắn của một nhịp tường rào còn đứng (nhịp tường đá / đất đã đổ: đống đá / đất thấp như
     * spanMatrix) -> chắn đạn. Tường đá xếp / đất nện chắn cả mặt; rào gỗ / tre chỉ chắn ở cột, thanh ngang, nan đan — đạn
     * động năng (WOOD_PIERCE) xuyên thủng thanh gỗ bay tiếp như không -> bỏ qua. Gọi ở mỗi mẫu dò dày của đường đạn: loại
     * nhanh bằng hộp bao từng đường tường rồi mới đổi sang toạ độ dọc / ngang trục tường
     */
    wallHit(x, y, z, ammo) {
      const pierceWood = !!WOOD_PIERCE[ammo];
      for (const w of this.wallRuns) {
        if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ || y < w.y0 || y > w.y1) continue;
        const H = w.H;
        if (!H.solid && pierceWood) continue;
        const rx = x - w.x0, rz = z - w.z0, a = rx * w.ux + rz * w.uz, b = rz * w.ux - rx * w.uz;   // dọc / ngang trục tường
        if (b > H.ht || b < -H.ht || a < -0.6 || a > w.L + 0.6) continue;
        const n = w.spans.length, f = Math.max(0, Math.min(n - 1e-4, a / w.L * n)), s = w.spans[f | 0], u = f - (f | 0);
        const yl = y - (s.ga + (s.gb - s.ga) * u - 0.4);   // cao so với gốc nhịp (gốc chôn 0,4 dưới mặt đất)
        if (yl < -0.5) continue;
        let top = s.F.h;
        if (s.broken) { if (!H.solid) continue; top *= 0.32 + hash(s.seed + 5) * 0.15; }   // rào gỗ đổ rạp: không còn chắn
        if (yl > top) continue;
        if (!H.solid) {
          const along = u * s.L;
          let on = along < H.post;   // cột đầu nhịp
          if (!on) for (const r of H.rails[s.v] || H.rails[0]) if (Math.abs(yl - (s.F.h * r - 0.1)) < H.hb) { on = true; break; }   // thanh ngang (võng nhẹ)
          if (!on && H.lattice) {
            // nan tre đan chéo 2 chiều (~55°, cách ~2,45 đv) giữa thanh dưới & thanh trên
            const R0 = H.rails[s.v] || H.rails[0], y0 = s.F.h * R0[0], y1 = s.F.h * R0[R0.length - 1];
            if (yl > y0 && yl < y1) {
              const P = 2.45, d1 = along - yl * 0.7, d2 = along + yl * 0.7;
              on = ((d1 % P) + P) % P < 0.32 || ((d2 % P) + P) % P < 0.32;
            }
          }
          if (!on) continue;
        }
        // obstacle: chân trục tường dưới điểm trúng -> ExplosionFX.findWallNormal lấy đúng pháp tuyến mặt tường (vết đạn, nảy)
        return { hit: true, type: H.type, mat: H.mat, fence: s, obstacle: { x: w.x0 + w.ux * a, z: w.z0 + w.uz * a, mat: H.mat }, x, y, z };
      }
      return null;
    }
    /**
     * Hệ số mảnh văng / sức ép còn lại do tường rào chắn giữa điểm nổ (ex, ey, ez) và điểm ngắm thân xe (ux, uy, uz)
     * (1 = không che). Tường chỉ cao ~0,6-0,9 m: che theo phần thân xe khuất bóng tường (lowCover); nhiều đường tường: lấy
     * đường che tốt nhất (bóng các tường song song chồng lên nhau, không cộng dồn)
     */
    blastCover(ex, ey, ez, ux, uy, uz) {
      let k = 1;
      const mnX = Math.min(ex, ux), mxX = Math.max(ex, ux), mnZ = Math.min(ez, uz), mxZ = Math.max(ez, uz);
      for (const w of this.wallRuns) {
        if (w.maxX < mnX || w.minX > mxX || w.maxZ < mnZ || w.minZ > mxZ) continue;
        const t = segSegT(ex, ez, ux, uz, w.x0, w.z0, w.x0 + w.ux * w.L, w.z0 + w.uz * w.L);
        if (t < 0) continue;
        const a = (ex + (ux - ex) * t - w.x0) * w.ux + (ez + (uz - ez) * t - w.z0) * w.uz;
        const n = w.spans.length, f = Math.max(0, Math.min(n - 1e-4, a / w.L * n)), s = w.spans[f | 0], u = f - (f | 0);
        let top = s.F.h;
        // (nhịp vừa bị chính vụ nổ này quật đổ: còn đứng lúc mảnh tới — tâm nổ làm tròn 0,1 như gói ENV_HIT)
        const fresh = s.broken && Math.abs(s.bkx - ex) < 0.15 && Math.abs(s.bkz - ez) < 0.15;
        if (s.broken && !fresh) { if (!w.H.solid) continue; top *= 0.32 + hash(s.seed + 5) * 0.15; }
        k = Math.min(k, lowCover(ey, uy, t, t, s.ga + (s.gb - s.ga) * u - 0.4 + top, w.H.blast));
      }
      return k;
    }
    /** Đường từ điểm nổ tới xe đi qua bờ bao cát (thấp) -> che bớt sóng nổ */
    blocks(ex, ey, ez, ux, uy, uz) {
      for (const sg of this.bagSegs) {
        if (sg.dead) continue;
        const t = segSegT(ex, ez, ux, uz, sg.x0, sg.z0, sg.x1, sg.z1);
        if (t < 0) continue;
        const y = ey + (uy - ey) * t, gy = (sg.g0 + sg.g1) / 2;
        const top = sg.gaps ? this.standTop(ex + (ux - ex) * t, ez + (uz - ez) * t) : sg.top;
        if (y <= gy + top) return true;
      }
      return false;
    }
    update(dt, fx, cam) {
      if (this.street) this.street.update(dt, fx, cam);   // ô tô trượt sau cú húc / đang cháy
      if (dt) this.updateWrecks(dt);                       // xác xe văng trượt sau cú húc
      if (!fx || !fx.smoke || !this.smokers.length) return;
      this.smokeAcc += dt;
      if (this.smokeAcc < 0.22) return;
      const step = this.smokeAcc; this.smokeAcc = 0;
      for (const s of this.smokers) {
        if (cam && Math.hypot(cam.x - s.x, cam.z - s.z) > 1700) continue;
        s.phase += step;
        const k = 0.6 + 0.4 * Math.sin(s.phase * 0.7);
        fx.smoke.add({ x: s.x + (Math.random() - 0.5) * 6, y: s.y, z: s.z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 3, vy: 7 + Math.random() * 5, vz: (Math.random() - 0.5) * 3,
          size: 4 + Math.random() * 3, grow: 6, drag: 0.5, grav: -2, life: 5 + Math.random() * 3, alpha: 0.32 * k, fadeIn: 0.3, c0: [0.12, 0.11, 0.1], c1: [0.36, 0.35, 0.34], cell: 0, floor: false });
      }
    }
    /** Vẽ lên bản đồ chiến thuật: ruộng, hào ẩn xe, xác xe */
    // px: hệ số điểm ảnh cho nét / cỡ tối thiểu (ảnh nền độ phân giải cao truyền > 1 để dấu không nhỏ xíu)
    drawOnMap(ctx, P, sc, px) {
      const D = this.data, q = px || 1;
      ctx.save();
      for (const f of D.fields || []) {
        const c = { x: P(f.x), y: P(f.z) };
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(f.angle);
        ctx.fillStyle = 'rgba(190,200,120,0.18)'; ctx.strokeStyle = 'rgba(210,220,150,0.35)'; ctx.lineWidth = 1;
        ctx.fillRect(-f.w / 2 * sc, -f.d / 2 * sc, f.w * sc, f.d * sc); ctx.strokeRect(-f.w / 2 * sc, -f.d / 2 * sc, f.w * sc, f.d * sc);
        ctx.restore();
      }
      for (const p of D.pits || []) {
        const c = { x: P(p.x), y: P(p.z) }, r = Math.max(3 * q, 26 * sc);
        ctx.strokeStyle = 'rgba(230,200,120,0.85)'; ctx.lineWidth = 2 * q;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, p.angle - 1.1, p.angle + 1.1); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(40,30,25,0.9)'; ctx.lineWidth = 2 * q;
      for (const w of D.wrecks || []) {
        const c = { x: P(w.x), y: P(w.z) }, r = Math.max((px ? 4 : 2.5) * q, 9 * sc);
        ctx.beginPath(); ctx.moveTo(c.x - r, c.y - r); ctx.lineTo(c.x + r, c.y + r); ctx.moveTo(c.x + r, c.y - r); ctx.lineTo(c.x - r, c.y + r); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // khoảng cách điểm - đoạn thẳng (2D); full = true trả { d, t }
  function segDist(px, pz, ax, az, bx, bz, full) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    return full ? { d, t } : d;
  }
  // tham số t trên đoạn (a->b) nơi cắt đoạn (c->d), -1 nếu không cắt
  function segSegT(ax, az, bx, bz, cx, cz, dx, dz) {
    const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return -1;
    const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
  }

  return { PropSet, segDist, lowCover };
})();
if (typeof window !== 'undefined') window.Props = Props;
