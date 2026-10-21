/**
 * CÔNG TRÌNH BỐI CẢNH GIỮA 3 CỨ ĐIỂM (vị trí, cốt san nền, ụ đất / kè đất do MapGen sinh tất định -> mọi máy giống hệt)
 *
 * - HẦM PHÓNG TÊN LỬA HẠT NHÂN (silo ngầm, theo bãi phóng Minuteman thật): nền sỏi 44 x 38 m rào lưới thép gai,
 *   miệng hầm bê tông sát mặt đất, nắp bê tông ~100 tấn mép thép vát nêm lăn trên 2 ray (mở hé -> lộ giếng phóng và
 *   chóp đầu đạn), cửa hầm người, cọc cảm biến chống đột nhập, cột đèn, nhà hỗ trợ kỹ thuật nhỏ.
 * - HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC: ụ đất phủ hầm cao 9.5 m, tường mặt tiền bê tông 26 m + cửa chống nổ sơn biển nguy
 *   hiểm sinh học, tường chắn đất 2 bên sân, ống thông gió có lọc, hộp lọc HEPA, ống khói xả cao 25 m trên nóc hầm;
 *   sân trước có khoang khử nhiễm, bồn khí hoá lỏng, cụm hoá hơi, thùng hoá chất, chốt gác + barie.
 * - TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG (kiểu SAM-2): xe radar điều khiển hoả lực có 2 ăng-ten máng ở giữa, 3 bệ phóng
 *   lệch nhau 120° trong kè đất móng ngựa, tên lửa 10.6 m nằm trên ray nghiêng 35°, xe chỉ huy, xe điện, xe vận tải -
 *   nạp đạn chở tên lửa.
 *
 * Công trình không bị phá: thân xe / nòng pháo va vào khối đặc (hộp xoay như nhà), đạn chạm thì nổ trên bề mặt
 * (như tường bê tông), khối đặc chắn sóng nổ. Ụ đất / kè đất là địa hình thật (MapGen đã đắp vào lưới độ cao).
 *
 * Hệ toạ độ cục bộ mỗi công trình: f theo hướng mặt trước (angle), r vuông góc (-sin, cos), y tính từ cốt san nền G.
 * Nhóm hình: trục X cục bộ = f, trục Z cục bộ = r (như cứ điểm). Tỉ lệ 8 đơn vị = 1 m.
 */
const Landmarks = (() => {
  const TAU = Math.PI * 2;
  const NAMES = { nuke: 'HẦM PHÓNG TÊN LỬA HẠT NHÂN', bio: 'HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC', sam: 'TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG' };
  const hash = (n) => { let h = (n | 0) * 374761393 + 668265263; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ===========================================================================
  // TEXTURE THỦ TỤC
  // ===========================================================================
  const TEX = {};
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texOf(key, w, h, draw, rep) {
    if (TEX[key]) return TEX[key];
    const c = canvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return (TEX[key] = t);
  }
  function speckle(g, w, h, n, cols, s0, s1, seed) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.15 + hash(seed + i * 5 + 2) * 0.4;
      const s = s0 + hash(seed + i * 5 + 3) * (s1 - s0);
      g.fillRect(hash(seed + i * 5) * w, hash(seed + i * 5 + 1) * h, s, s * (0.5 + hash(seed + i * 5 + 4)));
    }
    g.globalAlpha = 1;
  }
  function blotch(g, x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // Bê tông đổ khuôn: 1 ô texture = 64 đơn vị (8 m), mạch ván khuôn + lỗ ty + vệt loang
  function concreteFill(g, w, h, base, seed) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = hash(seed + i) * w, y = hash(seed + i + 99) * h, r = 20 + hash(seed + i + 7) * 70;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, x + ox, y + oy, r, hash(seed + i + 3) < 0.5 ? '90,88,82' : '200,198,190', 0.12);
    }
    speckle(g, w, h, 2600, ['#6f6c66', '#b9b6ae', '#87847c'], 1, 2.5, seed + 11);
  }
  const concTex = () => texOf('conc', 256, 256, (g, w, h) => {
    concreteFill(g, w, h, '#9c9990', 301);
    g.strokeStyle = 'rgba(60,58,54,0.35)'; g.lineWidth = 1.2;
    for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += w / 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = 'rgba(40,40,38,0.55)';
    for (let y = h / 8; y < h; y += h / 4) for (let x = w / 8; x < w; x += w / 4) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
    // vệt nước chảy dọc
    for (let i = 0; i < 14; i++) {
      const x = hash(i + 40) * w, l = 30 + hash(i + 41) * 120;
      const gr = g.createLinearGradient(0, 0, 0, l);
      gr.addColorStop(0, 'rgba(70,66,58,0.22)'); gr.addColorStop(1, 'rgba(70,66,58,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 2 + hash(i + 42) * 5, l);
    }
  }, true);
  // Sơn kẻ sọc vàng đen (1 ô = 16 đơn vị)
  const hazardTex = () => texOf('hazard', 64, 64, (g, w, h) => {
    g.fillStyle = '#d9a61c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b';
    for (let k = -2; k < 3; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 16 + 64, h); g.lineTo(k * 32 + 64, h); g.fill(); }
    speckle(g, w, h, 160, ['#5a4a20', '#efe0a0'], 1, 2, 77);
  }, true);
  // Sọc đỏ trắng cảnh báo hàng không (theo chiều dọc ống / cột: 8 khúc)
  const bandTex = () => texOf('bands', 16, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8e4dc' : '#c23a26'; g.fillRect(0, i * h / 8, w, h / 8); }
  });
  // Biểu tượng nguy hiểm sinh học (3 lưỡi liềm + vòng tròn)
  function biohazard(g, cx, cy, R, col) {
    const c = canvas(Math.ceil(R * 2.2), Math.ceil(R * 2.2)), q = c.getContext('2d'), o = R * 1.1;
    q.fillStyle = col; q.strokeStyle = col;
    const dir = k => -Math.PI / 2 + k * TAU / 3;
    for (let k = 0; k < 3; k++) { q.beginPath(); q.arc(o + Math.cos(dir(k)) * 0.42 * R, o + Math.sin(dir(k)) * 0.42 * R, 0.56 * R, 0, TAU); q.fill(); }
    q.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 3; k++) { q.beginPath(); q.arc(o + Math.cos(dir(k)) * 0.56 * R, o + Math.sin(dir(k)) * 0.56 * R, 0.4 * R, 0, TAU); q.fill(); }
    q.beginPath(); q.arc(o, o, 0.15 * R, 0, TAU); q.fill();
    for (let k = 0; k < 3; k++) {
      q.lineWidth = 0.07 * R; q.beginPath(); q.moveTo(o, o); q.lineTo(o + Math.cos(dir(k) + Math.PI) * R, o + Math.sin(dir(k) + Math.PI) * R); q.stroke();
    }
    q.globalCompositeOperation = 'source-over';
    q.lineWidth = 0.1 * R; q.beginPath(); q.arc(o, o, 0.5 * R, 0, TAU); q.stroke();
    q.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 3; k++) { q.beginPath(); q.arc(o + Math.cos(dir(k)) * 0.56 * R, o + Math.sin(dir(k)) * 0.56 * R, 0.33 * R, 0, TAU); q.fill(); }
    q.beginPath(); q.arc(o, o, 0.15 * R, 0, TAU); q.fill();
    g.drawImage(c, cx - o, cy - o);
  }
  // Biểu tượng phóng xạ (3 cánh quạt)
  function trefoil(g, cx, cy, R, col) {
    g.fillStyle = col;
    g.beginPath(); g.arc(cx, cy, 0.17 * R, 0, TAU); g.fill();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + k * TAU / 3;
      g.beginPath(); g.arc(cx, cy, R, a - Math.PI / 6, a + Math.PI / 6); g.arc(cx, cy, 0.28 * R, a + Math.PI / 6, a - Math.PI / 6, true); g.closePath(); g.fill();
    }
  }
  function warnSign(g, x, y, w, h, kind) {
    g.fillStyle = '#e2b51e'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#151515'; g.lineWidth = Math.max(2, w * 0.05); g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    if (kind === 'bio') biohazard(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.38, '#151515');
    else trefoil(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.38, '#151515');
  }
  // Bảng chữ: nền + 1..2 dòng chữ + biểu tượng 2 đầu
  function signTex(key, lines, opts) {
    const o = Object.assign({ w: 1024, h: 192, bg: '#e9e6dc', fg: '#9a1a14', icon: null, border: '#1d1d1d' }, opts || {});
    return texOf(key, o.w, o.h, (g, w, h) => {
      g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = o.border; g.lineWidth = h * 0.05; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
      let x0 = h * 0.12, x1 = w - h * 0.12;
      if (o.icon) { warnSign(g, h * 0.14, h * 0.14, h * 0.72, h * 0.72, o.icon); warnSign(g, w - h * 0.86, h * 0.14, h * 0.72, h * 0.72, o.icon); x0 = h; x1 = w - h; }
      g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length;
      lines.forEach((t, i) => {
        const sz = i === 0 ? h * (n > 1 ? 0.36 : 0.5) : h * 0.24;
        g.font = `bold ${sz | 0}px Arial, sans-serif`;
        const fit = Math.min(1, (x1 - x0) / g.measureText(t).width);
        g.save(); g.translate((x0 + x1) / 2, h * (n > 1 ? (i === 0 ? 0.36 : 0.72) : 0.52)); g.scale(fit, 1); g.fillText(t, 0, 0); g.restore();
        if (i === 0) g.fillStyle = '#1d1d1d';
      });
      speckle(g, w, h, 700, ['#6a6258', '#ffffff'], 1, 3, 5);
    });
  }
  // Thân tên lửa đạn đạo: trắng ngà, sọc lăn đen trắng, vành ngăn tầng, biểu tượng phóng xạ, số hiệu dọc thân
  const icbmTex = () => texOf('icbm', 512, 1024, (g, w, h) => {
    g.fillStyle = '#e6e3da'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#c9c5ba', '#f4f2ec'], 1, 3, 31);
    g.strokeStyle = 'rgba(80,80,76,0.35)'; g.lineWidth = 2;
    for (let y = 40; y < h; y += 78) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x < w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    // tầng 2 (trên) / vành ngăn tầng / tầng 1 (dưới): toạ độ v tính từ đỉnh thân
    const sep = h * 0.3;
    g.fillStyle = '#4a4c44'; g.fillRect(0, sep - 18, w, 36);
    g.fillStyle = '#26271f'; for (let x = 0; x < w; x += 16) g.fillRect(x, sep - 14, 6, 28);
    // sọc lăn đen trắng (đo góc lăn khi bay) ở đầu tầng 1 và đầu tầng 2
    g.fillStyle = '#151515';
    g.fillRect(0, sep + 40, w / 4, 110); g.fillRect(w / 2, sep + 40, w / 4, 110);
    g.fillRect(w / 4, 20, w / 4, 70); g.fillRect(w * 3 / 4, 20, w / 4, 70);
    // vạch đỏ đáy thân
    g.fillStyle = '#a3261b'; g.fillRect(0, h - 46, w, 18);
    // biểu tượng phóng xạ + số hiệu dọc thân (2 phía)
    for (const u of [w * 0.125, w * 0.625]) {
      warnSign(g, u - 44, sep - 120, 88, 88, 'nuke');
      g.save(); g.translate(u, sep + 500); g.rotate(-Math.PI / 2);
      g.fillStyle = '#1b1b1b'; g.font = 'bold 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('ICBM-07', 0, 0);
      g.restore();
      g.fillStyle = '#a3261b'; g.fillRect(u - 34, sep + 230, 68, 12);
    }
  });
  // Sân bê tông các công trình: texture riêng (vạch sơn, mạch co giãn, vết dầu, vết cháy xém)
  // (f0..f1, r0..r1: phạm vi sân theo toạ độ cục bộ công trình)
  function apronTex(kind, f0, f1, r0, r1) {
    const W = 1024, Hh = Math.round(W * (r1 - r0) / (f1 - f0));
    return texOf('apron_' + kind, W, Hh, (g, w, h) => {
      if (kind === 'nuke') {
        // nền sỏi đầm chặt (rải thuốc diệt cỏ), vệt bánh xe nhạt từ cổng tới miệng hầm
        g.fillStyle = '#a49c8c'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) blotch(g, hash(i + 900) * w, hash(i + 901) * h, 30 + hash(i + 902) * 90, hash(i + 903) < 0.5 ? '120,112,98' : '190,182,166', 0.25);
        speckle(g, w, h, 26000, ['#7c7568', '#c9c2b2', '#8f877a', '#5f594f', '#b3ab9a'], 1, 3.2, 911);
        const P = (f, r) => [(f - f0) / (f1 - f0) * w, (r - r0) / (r1 - r0) * h], S = w / (f1 - f0);
        g.strokeStyle = 'rgba(96,88,76,0.35)'; g.lineWidth = 5 * S;
        for (const o of [-9, 9]) { g.beginPath(); g.moveTo(...P(f1, o)); g.bezierCurveTo(...P(80, o), ...P(40, -18 + o), ...P(-10, -18 + o)); g.stroke(); }
        return;
      }
      concreteFill(g, w, h, kind === 'bio' ? '#a3a29b' : '#9e9a8f', kind === 'bio' ? 903 : 707);
      const P = (f, r) => [(f - f0) / (f1 - f0) * w, (r - r0) / (r1 - r0) * h], S = w / (f1 - f0);
      // mạch co giãn mỗi 6 m
      g.strokeStyle = 'rgba(52,50,46,0.55)'; g.lineWidth = 2;
      for (let f = f0 + 48; f < f1; f += 48) { const [x] = P(f, 0); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let r = r0 + 48; r < r1; r += 48) { const [, y] = P(0, r); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let i = 0; i < 26; i++) blotch(g, hash(i + 5) * w, hash(i + 6) * h, 10 + hash(i + 7) * 40, '40,36,30', 0.22);   // vết dầu
      g.lineWidth = 6 * S;
      {
        // sân hầm sinh học (vùng f >= 44): biểu tượng nguy hiểm sinh học lớn, vạch cấm dừng trước cửa hầm, lối đi
        biohazard(g, ...P(118, 0), 46 * S, 'rgba(196,40,30,0.85)');
        const [x0, y0] = P(46, -60);
        g.save(); g.beginPath(); g.rect(x0, y0, 22 * S, 120 * S); g.clip();
        g.fillStyle = '#d9a61c'; g.fillRect(x0, y0, 22 * S, 120 * S);
        g.fillStyle = '#1b1b1b'; for (let k = -10; k < 20; k++) { g.beginPath(); g.moveTo(x0, y0 + k * 12 * S); g.lineTo(x0 + 22 * S, y0 + (k * 12 + 10) * S); g.lineTo(x0 + 22 * S, y0 + (k * 12 + 16) * S); g.lineTo(x0, y0 + (k * 12 + 6) * S); g.fill(); }
        g.restore();
        g.strokeStyle = 'rgba(232,228,210,0.85)'; g.lineWidth = 3 * S;
        for (const r of [-60, 60]) { g.beginPath(); g.moveTo(...P(70, r)); g.lineTo(...P(f1, r)); g.stroke(); }
        g.save(); g.translate(...P(176, 0)); g.rotate(Math.PI / 2);
        g.fillStyle = 'rgba(200,40,28,0.85)'; g.font = `bold ${(15 * S) | 0}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('QUARANTINE ZONE', 0, 0);
        g.restore();
      }
    });
  }

  // ===========================================================================
  // VẬT LIỆU
  // ===========================================================================
  const MAT = {};
  function mat(key) {
    if (MAT[key]) return MAT[key];
    const S = (o) => new THREE.MeshStandardMaterial(o);
    const m = {
      conc: () => S({ map: concTex(), color: 0xffffff, roughness: 0.95 }),
      concDark: () => S({ map: concTex(), color: 0x9a968c, roughness: 0.97 }),
      steelRed: () => S({ color: 0xb04a2e, roughness: 0.62, metalness: 0.35 }),
      steelWhite: () => S({ color: 0xdcdad2, roughness: 0.5, metalness: 0.25 }),
      steelGray: () => S({ color: 0x7c8186, roughness: 0.55, metalness: 0.5 }),
      steelDark: () => S({ color: 0x34373a, roughness: 0.6, metalness: 0.55 }),
      olive: () => S({ color: 0x55603e, roughness: 0.8, metalness: 0.12 }),
      oliveDark: () => S({ color: 0x3c4430, roughness: 0.82, metalness: 0.1 }),
      ochre: () => S({ color: 0xc9a46a, roughness: 0.55, metalness: 0.2 }),
      yellow: () => S({ color: 0xd2a21f, roughness: 0.6, metalness: 0.15 }),
      rubber: () => S({ color: 0x1c1c1c, roughness: 0.95 }),
      void: () => new THREE.MeshBasicMaterial({ color: 0x050505 }),
      glass: () => S({ color: 0x23323c, roughness: 0.15, metalness: 0.6 }),
      hazard: () => S({ map: hazardTex(), roughness: 0.75 }),
      bands: () => S({ map: bandTex(), roughness: 0.55, metalness: 0.2 }),
      icbm: () => S({ map: icbmTex(), roughness: 0.42, metalness: 0.15 }),
      missile: () => S({ color: 0xc3c8b9, roughness: 0.5, metalness: 0.2 }),
      lampRed: () => S({ color: 0x801010, emissive: 0xff2a1a, emissiveIntensity: 1.4, roughness: 0.4 }),
      lampAmber: () => S({ color: 0x806010, emissive: 0xffa21a, emissiveIntensity: 1.2, roughness: 0.4 }),
      wood: () => S({ color: 0x7a5c38, roughness: 0.9 })
    }[key];
    return (MAT[key] = m());
  }
  // Vật liệu dán chữ / biểu tượng (mặt phẳng): polygonOffset để không nhấp nháy với mặt tường phía sau
  function decal(key, tex) {
    if (MAT['d_' + key]) return MAT['d_' + key];
    return (MAT['d_' + key] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }
  // Cửa chống nổ hầm sinh học: 2 cánh dùng chung 1 ảnh (mỗi cánh nửa ảnh)
  function doorMats() {
    if (MAT.doorA) return [MAT.doorA, MAT.doorB];
    const base = texOf('door', 512, 256, (g, w, h) => {
      g.fillStyle = '#7d8079'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1400, ['#5f625c', '#9a9d95', '#6b5a44'], 1, 3, 61);
      g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 3;
      for (let x = 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 32; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      // viền sọc vàng đen
      g.save(); g.beginPath(); g.rect(0, 0, w, h); g.rect(18, 18, w - 36, h - 36); g.clip('evenodd');
      g.fillStyle = '#d9a61c'; g.fillRect(0, 0, w, h); g.fillStyle = '#151515';
      for (let k = -20; k < 40; k++) { g.beginPath(); g.moveTo(k * 24, 0); g.lineTo(k * 24 + 12, 0); g.lineTo(k * 24 + 12 - h, h); g.lineTo(k * 24 - h, h); g.fill(); }
      g.restore();
      g.fillStyle = '#d9a61c'; g.beginPath(); g.arc(w / 2, h * 0.47, 86, 0, TAU); g.fill();
      biohazard(g, w / 2, h * 0.47, 76, '#141414');
      g.fillStyle = '#a3261b'; g.font = 'bold 26px Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('BIOHAZARD', w / 2, h - 30);
      // vệt gỉ chảy
      for (let i = 0; i < 20; i++) { const x = hash(i + 300) * w; g.fillStyle = 'rgba(110,70,40,0.25)'; g.fillRect(x, h * 0.2 + hash(i + 301) * h * 0.4, 3, 40 + hash(i + 302) * 60); }
    });
    const mk = (ox) => { const t = base.clone(); t.needsUpdate = true; t.repeat.set(0.5, 1); t.offset.set(ox, 0); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.45 }); };
    MAT.doorA = mk(0); MAT.doorB = mk(0.5);
    return [MAT.doorA, MAT.doorB];
  }

  // ===========================================================================
  // BỘ GHÉP HÌNH: gom khối theo vật liệu -> 1 lưới / vật liệu (ít lệnh vẽ), kèm danh sách hộp va chạm
  // ===========================================================================
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(v3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), v3(sx || 1, sy || 1, sz || 1));
  // Hộp có UV theo kích thước thật (1 ô texture = tile đơn vị); tile = 0: mỗi mặt trải trọn ảnh
  function boxGeo(sx, sy, sz, tile) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (tile) {
      const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    }
    return g;
  }
  function mergeGeos(list) {
    let total = 0;
    const geos = list.map(([g, m]) => { const n = g.index ? g.toNonIndexed() : g.clone(); if (m) n.applyMatrix4(m); total += n.attributes.position.count; return n; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }

  class Kit {
    constructor(L, groundAt) {
      this.L = L; this.groundAt = groundAt;
      this.parts = new Map();
      this.solids = [];
      this.top = 0;
    }
    // (f, r) cục bộ -> thế giới
    W(f, r) { const L = this.L; return [L.x + L.fx * f - L.fz * r, L.z + L.fz * f + L.fx * r]; }
    // cao độ mặt đất (ụ đất hầm, kè đất) tại (f, r) so với cốt san nền
    earth(f, r) { const [x, z] = this.W(f, r); return this.groundAt(x, z) - this.L.G; }
    add(m, geo, mtx) {
      const k = typeof m === 'string' ? mat(m) : m;
      if (!this.parts.has(k)) this.parts.set(k, []);
      this.parts.get(k).push([geo, mtx || null]);
    }
    // khối hộp tâm (x, y, z), cỡ (sx, sy, sz), xoay quanh trục đứng ry
    box(m, x, y, z, sx, sy, sz, ry, tile, rx, rz) {
      this.add(m, boxGeo(sx, sy, sz, tile === undefined ? (m === 'conc' || m === 'concDark' ? 64 : m === 'hazard' ? 16 : 0) : tile), M4(x, y, z, rx || 0, ry || 0, rz || 0));
    }
    // trụ đứng chân tại y0 (rTop, rBot, cao h)
    cyl(m, x, y0, z, rTop, rBot, h, seg, mtx) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, seg || 16);
      this.add(m, g, mtx ? new THREE.Matrix4().multiplyMatrices(mtx, M4(0, h / 2, 0)) : M4(x, y0 + h / 2, z));
    }
    // thanh dầm thẳng từ a tới b (tiết diện t x t)
    beam(m, a, b, t, base) {
      const A = v3(...a), B = v3(...b), d = B.clone().sub(A), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize());
      let mtx = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, v3(1, 1, 1));
      if (base) mtx = new THREE.Matrix4().multiplyMatrices(base, mtx);
      this.add(m, new THREE.BoxGeometry(t, len, t), mtx);
    }
    // mặt phẳng dán chữ quay về hướng +f (mặt trước) / theo ry
    plane(m, x, y, z, w, h, ry) { this.add(m, new THREE.PlaneGeometry(w, h), M4(x, y, z, 0, ry === undefined ? Math.PI / 2 : ry, 0)); }
    // hộp va chạm (cục bộ): tâm (f, r), nửa dài hf theo trục xoay rot, nửa rộng hr, khoảng cao y0..y1
    solid(f, r, hf, hr, y0, y1, rot) {
      const L = this.L, c = Math.cos(rot || 0), s = Math.sin(rot || 0), [cx, cz] = this.W(f, r);
      this.solids.push({ cx, cz, ux: L.fx * c - L.fz * s, uz: L.fz * c + L.fx * s, hu: hf, hv: hr, y0: L.G + y0, y1: L.G + y1 });
      this.top = Math.max(this.top, y1);
    }
    build(group) {
      for (const [m, list] of this.parts) {
        const mesh = new THREE.Mesh(mergeGeos(list), m);
        mesh.castShadow = !(m.isMeshBasicMaterial || m.polygonOffset || m.alphaTest > 0 || m.transparent);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      this.parts.clear();
    }
  }

  // Sân bê tông (mặt trên dán texture riêng, gờ bê tông bao quanh che chỗ nối với đất)
  function apron(group, L, f0, f1, r0, r1, kind) {
    const hu = (f1 - f0) / 2, hv = (r1 - r0) / 2;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(hu * 2, hv * 2), new THREE.MeshStandardMaterial({ map: apronTex(kind, f0, f1, r0, r1), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set((f0 + f1) / 2, 0.35, (r0 + r1) / 2);
    top.receiveShadow = true;
    group.add(top);
  }

  // ===========================================================================
  // 1. BÃI PHÓNG / HẦM PHÓNG (SILO) TÊN LỬA ĐẠN ĐẠO MANG ĐẦU ĐẠN HẠT NHÂN
  // Theo bãi phóng Minuteman thật: nền sỏi phẳng trong rào lưới cao 1.8 m có thép gai, cổng đôi; miệng hầm bê tông
  // gần sát mặt đất; nắp hầm bê tông ~100 tấn 6.2 x 6.2 x 1.1 m, mép bọc thép vát hình nêm, lăn ngang trên 2 ray thép
  // đặt trên dầm bê tông sâu chìa ra từ miệng hầm (ở đây nắp mở hé -> lộ giếng phóng Ø 3.7 m, chóp đầu đạn bên trong);
  // cửa hầm người (bệ bê tông lục giác), ăng-ten nhỏ, cọc cảm biến chống đột nhập cao 5.5 m đầu nhọn, 2 cột đèn
  // 2 bên miệng hầm, nhà hỗ trợ kỹ thuật nhỏ. Không sơn vẽ gì trên mặt bằng.
  // ===========================================================================
  // Lưới thép (trong suốt theo alpha) cho hàng rào
  const meshFenceMat = () => MAT.chain || (MAT.chain = new THREE.MeshStandardMaterial({
    map: texOf('chain', 32, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(120,124,122,1)'; g.lineWidth = 3;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * w, 0); g.lineTo(k * w + w, h); g.stroke(); g.beginPath(); g.moveTo(k * w + w, 0); g.lineTo(k * w, h); g.stroke(); }
    }, true), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }));
  // Hàng rào lưới cao 1.8 m từ (f0, r0) tới (f1, r1): cột thép mỗi ~3 m, tay chéo nghiêng ra ngoài mang 3 sợi thép gai
  function fence(K, f0, r0, f1, r1, out) {
    const len = Math.hypot(f1 - f0, r1 - r0), n = Math.max(1, Math.round(len / 24)), ang = Math.atan2(r1 - r0, f1 - f0), H = 15;
    const ox = -Math.sin(ang) * (out || 1), oz = Math.cos(ang) * (out || 1);   // pháp tuyến ra phía ngoài
    for (let i = 0; i <= n; i++) {
      const t = i / n, f = f0 + (f1 - f0) * t, r = r0 + (r1 - r0) * t;
      K.cyl('steelGray', f, 0, r, 0.45, 0.45, H, 6);
      K.beam('steelGray', [f, H, r], [f + ox * 3, H + 3, r + oz * 3], 0.4);
    }
    const g = new THREE.PlaneGeometry(len, H - 1), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 2, uv.getY(i) * (H - 1) / 2);
    K.add(meshFenceMat(), g, M4((f0 + f1) / 2, H / 2 + 0.5, (r0 + r1) / 2, 0, -ang, 0));
    K.beam('steelGray', [f0, H, r0], [f1, H, r1], 0.35);
    for (const k of [1, 2, 3]) K.beam('steelDark', [f0 + ox * k, H + k, r0 + oz * k], [f1 + ox * k, H + k, r1 + oz * k], 0.25);
    K.solid((f0 + f1) / 2, (r0 + r1) / 2, len / 2, 1.2, 0, H + 3, ang);
  }
  function buildNuke(K, group) {
    const L = K.L, sf = -10, sr = -18, RT = 15;   // tâm giếng phóng, bán kính lòng giếng (Ø 3.7 m)
    apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'nuke');
    // Miệng hầm (headworks) bê tông 9.5 x 9.5 m, mặt trên cao 0.6 m so với nền sỏi, vát cạnh
    const HW = 38, HT = 5;
    K.box('conc', sf, HT / 2 - 1, sr, HW * 2, HT + 2, HW * 2);
    K.box('concDark', sf, HT + 0.2, sr, HW * 2 - 4, 0.4, HW * 2 - 4);
    // lòng giếng: ống thép lót trong, đáy đen; chóp tên lửa (tầng đầu đạn sơn tối) trong giếng, vòng đệm
    K.add(MAT.shaft || (MAT.shaft = new THREE.MeshStandardMaterial({ color: 0x6d706f, roughness: 0.7, metalness: 0.4, side: THREE.BackSide })),
      new THREE.CylinderGeometry(RT, RT, HT + 1.4, 32, 1, true), M4(sf, HT / 2 + 0.1, sr));
    K.cyl('void', sf, -0.8, sr, RT, RT, 0.4, 32);
    K.cyl('steelGray', sf, HT - 0.2, sr, RT + 2.5, RT + 2.5, 0.8, 32);
    K.add('oliveDark', new THREE.ConeGeometry(6.7, 26, 24), M4(sf, -8.5, sr));
    K.cyl('steelDark', sf, -0.6, sr, 6.9, 6.9, 1.2, 24);
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; K.box('steelDark', sf + Math.cos(a) * (RT - 3.5), 0, sr + Math.sin(a) * (RT - 3.5), 5, 1.2, 2, -a); }
    // 2 dầm bê tông sâu chìa ra từ miệng hầm theo hướng +r, trên mặt là 2 ray thép rộng
    const RW = 21, R1 = sr + HW + 62;
    for (const s of [-1, 1]) {
      K.box('conc', sf + s * RW, HT / 2 - 1, (sr + HW + R1) / 2, 12, HT + 2, R1 - sr - HW);
      K.box('steelDark', sf + s * RW, HT + 0.9, (sr - HW + 4 + R1) / 2, 6, 1.8, R1 - sr + HW - 4);
      K.box('steelGray', sf + s * RW, HT + 2.6, R1 - 2, 8, 4, 3);   // chặn cuối ray
      K.solid(sf + s * RW, (sr + HW + R1) / 2, 6, (R1 - sr - HW) / 2, 0, HT + 2);
    }
    // Nắp hầm 6.2 x 6.2 x 1.1 m (mở hé 3.8 m): khối bê tông, 2 mép trước / sau bọc thép vát hình nêm, giá bánh xe
    const DW = 50, DT = 9, DY = HT + 1.8, dr = sr + 30;
    const sh = new THREE.Shape();
    sh.moveTo(-DW / 2 - 7, 0); sh.lineTo(DW / 2 + 7, 0); sh.lineTo(DW / 2, DT); sh.lineTo(-DW / 2, DT); sh.closePath();
    const wedge = new THREE.ExtrudeGeometry(sh, { depth: DW, bevelEnabled: false });
    wedge.translate(0, 0, -DW / 2);
    K.add('steelGray', wedge, M4(sf, DY, dr, 0, -Math.PI / 2, 0));
    K.box('conc', sf, DY + DT / 2 + 0.05, dr, DW + 0.2, DT + 0.1, DW, 0, 64);
    for (const s of [-1, 1]) for (const t of [-16, 16]) K.box('steelDark', sf + s * RW, DY - 0.2, dr + t, 7, 2.4, 10);
    K.solid(sf, dr, DW / 2, DW / 2 + 7, DY - 1, DY + DT);
    K.solid(sf, sr, HW, HW, -1, HT);
    // Cửa hầm người: bệ bê tông lục giác, nắp thép tròn có tay quay; bên cạnh là ăng-ten nhỏ hình chóp trên bệ tròn
    const pf = sf + 66, pr = sr - 30;
    K.add('conc', new THREE.CylinderGeometry(20, 21, 6, 6), M4(pf, 2, pr));
    K.cyl('steelGray', pf, 5, pr, 11, 11, 1.6, 24);
    K.cyl('steelDark', pf, 6.6, pr, 1.4, 1.4, 2.4, 8);
    K.box('steelDark', pf, 8.4, pr, 10, 0.8, 0.8);
    K.solid(pf, pr, 19, 19, -1, 7);
    K.cyl('conc', pf - 34, -0.5, pr - 26, 8, 8, 2.5, 20);
    K.add('steelWhite', new THREE.ConeGeometry(2.6, 8, 4), M4(pf - 34, 6, pr - 26));
    // Cọc cảm biến chống đột nhập (mảnh, đầu nhọn, cao 5.5 m) quanh miệng hầm
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.25, f = sf + Math.cos(a) * 82, r = sr + Math.sin(a) * 82;
      if (r > sr + HW && Math.abs(f - sf) < RW + 12) continue;   // chừa đường ray
      K.cyl('steelWhite', f, 0, r, 0.9, 0.9, 40, 8);
      K.add('steelWhite', new THREE.ConeGeometry(0.9, 4, 8), M4(f, 42, r));
      K.box('steelDark', f, 30, r, 2.4, 4, 2.4);
      K.solid(f, r, 2, 2, 0, 44);
    }
    // 2 cột điện gỗ có đèn chiếu sáng 2 bên miệng hầm
    for (const s of [-1, 1]) {
      const f = sf + s * 58, r = sr - 6;
      K.cyl('wood', f, 0, r, 1.1, 1.5, 44, 8);
      K.box('wood', f, 41, r, 1.2, 1.2, 14);
      K.box('steelDark', f - s * 3, 38, r, 5, 2.4, 3, 0, 0, 0, s * 0.5);
      K.box('lampAmber', f - s * 4.2, 37, r, 2.6, 0.4, 2.2);
      K.solid(f, r, 2, 2, 0, 46);
    }
    // Nhà hỗ trợ kỹ thuật nhỏ (vách tôn, cửa thép, cục điều hoà) + cột ăng-ten UHF
    const bf = -L.hu + 52, br = L.hv - 44;
    K.box('ochre', bf, 12, br, 64, 24, 32);
    K.box('steelGray', bf, 25, br, 68, 2, 36);
    for (let x = -30; x <= 30; x += 4) K.box('steelGray', bf + x, 12, br - 16.2, 0.6, 22, 0.4);
    K.box('steelDark', bf + 18, 10, br - 16.4, 10, 20, 0.6);
    K.box('steelWhite', bf - 20, 5, br - 20, 12, 10, 8);
    K.cyl('steelGray', bf - 26, 26, br + 8, 0.8, 1.2, 70, 8);
    K.solid(bf, br, 34, 18, 0, 27);
    K.solid(bf - 26, br + 8, 2, 2, 26, 96);
    // Rào lưới thép gai quanh bãi, cổng đôi ở giữa cạnh trước (đường sỏi vào), 2 cánh cổng mở vào trong + biển cấm
    const fH = L.hu - 6, rH = L.hv - 6, G = 40;
    fence(K, -fH, -rH, fH, -rH, -1); fence(K, -fH, rH, fH, rH, 1); fence(K, -fH, -rH, -fH, rH, -1);
    fence(K, fH, -rH, fH, -G, -1); fence(K, fH, G, fH, rH, -1);
    for (const s of [-1, 1]) {
      K.cyl('steelGray', fH, 0, s * G, 1, 1, 17, 8);
      const leaf = new THREE.Matrix4().multiplyMatrices(M4(fH, 0, s * G), M4(0, 0, 0, 0, s * 1.2, 0));
      const lg = new THREE.PlaneGeometry(38, 14), luv = lg.attributes.uv;
      for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 19, luv.getY(i) * 7);
      K.add(meshFenceMat(), lg, new THREE.Matrix4().multiplyMatrices(leaf, M4(0, 8, -s * 19, 0, Math.PI / 2, 0)));
      K.beam('steelGray', [0, 1, 0], [0, 1, -s * 38], 0.8, leaf); K.beam('steelGray', [0, 15, 0], [0, 15, -s * 38], 0.8, leaf);
      K.beam('steelGray', [0, 1, -s * 38], [0, 15, -s * 38], 0.8, leaf); K.beam('steelGray', [0, 1, 0], [0, 15, -s * 38], 0.6, leaf);
    }
    K.plane(decal('nuke_sign', signTex('nuke_sign', ['RESTRICTED AREA', 'USE OF DEADLY FORCE AUTHORIZED'], { w: 512, h: 256, bg: '#f2efe6', fg: '#a3221a' })), fH + 0.6, 10, G + 14, 12, 6);
  }

  // ===========================================================================
  // 2. HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC
  // ===========================================================================
  function buildBio(K, group) {
    const L = K.L, M = L.mound, F0 = M.face - 14, F1 = M.face + 22, CUT = M.cut;   // tường mặt tiền f: 8..44
    apron(group, L, F1, L.hu - 2, -L.hv + 8, L.hv - 8, 'bio');
    // Tường mặt tiền: 2 trụ + lanh tô trên cửa (cửa rộng 15 m, cao 7.5 m), gờ đỉnh tường
    const DW = 60, DH = 60, TOPY = 92, FW = CUT + 16;
    for (const s of [-1, 1]) K.box('conc', (F0 + F1) / 2, (TOPY - 6) / 2, s * (DW + FW) / 2, F1 - F0, TOPY + 6, FW - DW);
    K.box('conc', (F0 + F1) / 2, (DH + TOPY) / 2, 0, F1 - F0, TOPY - DH, DW * 2);
    K.box('concDark', (F0 + F1) / 2 + 2, TOPY + 2, 0, F1 - F0 + 6, 4, FW * 2 + 6);
    // khung cửa nhô ra + sọc cảnh báo
    for (const s of [-1, 1]) {
      K.box('concDark', F1 + 3, (DH + 6) / 2, s * (DW + 3), 6, DH + 6, 6);
      K.box('hazard', F1 + 6.2, DH / 2, s * (DW + 3), 0.4, DH, 6);
    }
    K.box('concDark', F1 + 3, DH + 3, 0, 6, 6, DW * 2 + 12);
    // 2 cánh cửa chống nổ (khe hở giữa 2 cánh tối om), lòng hầm phía sau
    const [dA, dB] = doorMats();
    K.box('void', F0 + 9, DH / 2, 0, 16, DH, DW * 2);
    K.add(dB, boxGeo(8, DH, DW - 4, 0), M4(F1 - 14, DH / 2, -(DW + 4) / 2));
    K.add(dA, boxGeo(8, DH, DW - 4, 0), M4(F1 - 14, DH / 2, (DW + 4) / 2));
    K.box('steelDark', F1 - 9, 2, 0, 3, 4, DW * 2);                     // ray trượt cửa
    // biển tên trên lanh tô + biểu tượng nguy hiểm 2 trụ + đèn cảnh báo
    K.plane(decal('bio_sign', signTex('bio_sign', ['MILITARY BIOLOGICAL RESEARCH FACILITY', 'BIOHAZARD — BSL-4 — AUTHORIZED PERSONNEL ONLY'], { icon: 'bio' })), F1 + 0.4, 78, 0, 116, 21);
    for (const s of [-1, 1]) {
      K.plane(decal('bio_icon', texOf('bio_icon', 128, 128, (g, w, h) => warnSign(g, 0, 0, w, h, 'bio'))), F1 + 0.4, 38, s * (DW + 30), 26, 26);
      K.box('lampAmber', F1 + 2, 70, s * (DW + 14), 4, 5, 6);
      K.cyl('lampRed', F1 - 6, TOPY + 4, s * (FW - 10), 2.4, 2.8, 5, 10);
      K.box('steelGray', F1 + 3, 84, s * (FW - 6), 5, 4, 4);   // camera giám sát
      K.box('glass', F1 + 6, 84, s * (FW - 6), 1, 2.5, 2.5);
    }
    K.solid((F0 + F1) / 2, 0, (F1 - F0) / 2 + 6, FW, -6, TOPY + 4);
    // Tường chắn đất 2 bên sân: đỉnh tường bám mặt ụ đất phía ngoài (lấy mẫu địa hình thật)
    const WF1 = M.fc + M.af + 12;
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape(), pts = [];
      for (let f = F0; f <= WF1; f += 4) pts.push([f, Math.max(5, Math.max(K.earth(f, s * (CUT + 14)), K.earth(f, s * (CUT + 22))) + 3)]);
      sh.moveTo(F0, -6); sh.lineTo(WF1, -6);
      for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 20, bevelEnabled: false });
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
      K.add('conc', g, M4(0, 0, s > 0 ? CUT - 8 : -CUT - 12));
      const top = pts.reduce((a, p) => Math.max(a, p[1]), 0);
      K.solid((F0 + WF1) / 2, s * (CUT + 2), (WF1 - F0) / 2, 10, -6, top);
    }
    // Trên nóc hầm: 3 ống thông gió có lọc, hộp lọc HEPA + ống gió, ống khói xả, ăng-ten chảo
    for (const [f, r] of [[-40, -58], [-40, 58], [-150, -40]]) {
      const y = K.earth(f, r) - 3;
      K.cyl('concDark', f, y, r, 11, 12, 8, 16);
      K.cyl('steelGray', f, y + 8, r, 7, 7, 30, 14);
      K.cyl('steelDark', f, y + 38, r, 7.6, 7.6, 6, 14);
      K.cyl('steelGray', f, y + 44, r, 9, 15, 8, 16);
      K.solid(f, r, 12, 12, y, y + 52);
    }
    {
      const f = -112, r = 24, y = K.earth(f, r) - 2;
      K.box('steelGray', f, y + 15, r, 56, 30, 36);
      for (let k = 0; k < 6; k++) K.box('steelDark', f + 28.5, y + 5 + k * 4, r, 1, 1.6, 30);
      K.box('hazard', f, y + 30.6, r, 56, 1.2, 36, 0, 16);
      K.add('steelGray', new THREE.CylinderGeometry(4, 4, 70, 10), M4(f + 30, y + 22, r - 26, Math.PI / 2, 0, 0.5));
      K.solid(f, r, 30, 20, y, y + 32);
      const sf = -186, sr = 74, sy = K.earth(sf, sr) - 3;
      K.box('concDark', sf, sy + 5, sr, 26, 10, 26);
      K.add('bands', new THREE.CylinderGeometry(6, 9.5, 200, 16, 1, true), M4(sf, sy + 110, sr));
      K.cyl('steelDark', sf, sy + 208, sr, 6.6, 6.6, 3, 16);
      K.cyl('steelGray', sf, sy + 150, sr, 11, 11, 1.5, 16);
      K.box('lampRed', sf, sy + 213, sr, 3, 3, 3);
      K.solid(sf, sr, 13, 13, sy, sy + 212);
      const af = -70, ar = -112, ay = K.earth(af, ar) - 2;
      K.cyl('steelGray', af, ay, ar, 1.2, 1.6, 44, 8);
      K.add('steelWhite', new THREE.SphereGeometry(16, 18, 8, 0, TAU, 0, Math.PI * 0.3), M4(af + 4, ay + 46, ar, 0, 0, -0.9));
      K.solid(af, ar, 4, 4, ay, ay + 50);
    }
    // Sân trước: khoang khử nhiễm (container) + buồng tắm khử độc, bồn khí hoá lỏng, cụm hoá hơi, thùng hoá chất,
    // chốt gác + barie, cột đèn pha
    {
      const r = -126, f0 = 92, f1 = 190;
      K.box('steelWhite', (f0 + f1) / 2, 11, r, f1 - f0, 21, 20);
      K.box('yellow', (f0 + f1) / 2, 21.8, r, f1 - f0, 1.6, 20.4);
      K.box('yellow', (f0 + f1) / 2, 1, r, f1 - f0 + 0.4, 2, 20.4);
      for (const s of [-1, 1]) K.plane(decal('decon', signTex('decon', ['DECONTAMINATION', 'MANDATORY DECON BEFORE EXIT'], { w: 1024, h: 160, icon: 'bio' })), (f0 + f1) / 2, 12, r + s * 10.2, 70, 11, s > 0 ? 0 : Math.PI);
      K.box('yellow', f0 - 14, 12, r, 28, 24, 24);
      K.box('steelGray', f0 - 14, 11, r + 12.2, 12, 20, 0.6);
      K.solid((f0 + f1) / 2 - 14, r, (f1 - f0) / 2 + 14, 12, 0, 24);
    }
    for (const f of [92, 128]) {
      const r = 128;
      for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.box('steelGray', f + a * 9, 6, r + b * 9, 2.4, 12, 2.4);
      K.cyl('steelWhite', f, 10, r, 13, 13, 56, 20);
      K.add('steelWhite', new THREE.SphereGeometry(13, 20, 8, 0, TAU, 0, Math.PI / 2), M4(f, 66, r));
      K.box('hazard', f, 40, r - 13.2, 12, 4, 0.6, 0, 16);
      K.solid(f, r, 14, 14, 0, 80);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const f = 150 + i * 10, r = 118 + j * 14;
      K.box('steelGray', f, 26, r, 3, 52, 3);
      for (const a of [0, Math.PI / 2]) K.box('steelGray', f, 26, r, 7, 50, 0.8, a + Math.PI / 4);
    }
    K.box('steelGray', 160, 53, 125, 26, 2.4, 2.4);
    K.solid(160, 125, 16, 14, 0, 54);
    for (let i = 0; i < 12; i++) {
      const f = 56 + (i % 4) * 6.4, r = -72 + Math.floor(i / 4) * 6.4 + (hash(i) - 0.5);
      K.cyl(i % 5 === 3 ? 'steelGray' : 'yellow', f, 1.6, r, 2.6, 2.6, 7.2, 10);
      K.cyl('steelDark', f, 4.6, r, 2.7, 2.7, 0.8, 10);
    }
    K.box('wood', 66, 0.8, -66, 30, 1.6, 22);
    {
      const f = 182, r = 92;
      K.box('steelWhite', f, 12, r, 24, 24, 24);
      K.box('steelGray', f, 25, r, 28, 2, 28);
      K.box('glass', f - 12.2, 15, r, 0.6, 8, 18); K.box('glass', f, 15, r - 12.2, 18, 8, 0.6);
      K.solid(f, r, 14, 14, 0, 26);
      K.box('hazard', 194, 6, 72, 4, 12, 4, 0, 16);
      K.add('bands', new THREE.BoxGeometry(2.4, 96, 2.4), M4(194, 12 + 46, 72 - 7, 0.18, 0, 0));   // barie đang nâng
      for (const r2 of [-148, 148]) {
        K.cyl('steelGray', 194, 0, r2, 1, 1.6, 96, 8);
        K.box('steelDark', 191, 96, r2, 6, 4, 8, 0, 0, 0, 0.4);
        K.box('lampAmber', 189, 94, r2, 0.6, 2, 6);
        K.solid(194, r2, 3, 3, 0, 98);
      }
    }
  }

  // ===========================================================================
  // 3. TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG (kiểu SAM-2)
  // ===========================================================================
  // Tên lửa nằm dọc +X, đuôi tại x = 0, mũi tại x = 85 (10.6 m), trục tại gốc
  function missileParts(K, base) {
    const at = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().multiplyMatrices(base, M4(x, y, z, rx, ry, rz, sx, sy, sz));
    const along = (m, r0, r1, x0, x1, seg) => K.add(m, new THREE.CylinderGeometry(r1, r0, x1 - x0, seg || 14), at((x0 + x1) / 2, 0, 0, 0, 0, -Math.PI / 2));
    along('steelDark', 2.4, 3.0, -3, 0);
    along('missile', 3.3, 3.3, 0, 26, 16);
    along('missile', 3.3, 2.5, 26, 31);
    along('missile', 2.5, 2.5, 31, 74);
    along('oliveDark', 2.5, 0.25, 74, 85);
    const fin = (x0, x1, t0, t1, span, rad, roll) => {
      const sh = new THREE.Shape();
      sh.moveTo(x0, rad); sh.lineTo(x1, rad); sh.lineTo(t1, rad + span); sh.lineTo(t0, rad + span); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false });
      g.translate(0, 0, -0.35);
      for (let k = 0; k < 4; k++) K.add('missile', g.clone(), at(0, 0, 0, roll + k * Math.PI / 2, 0, 0));
      g.dispose();
    };
    // bố trí chữ X (lệch 45°) -> cánh không vướng ray phóng / sàn xe
    fin(1, 19, 4, 13, 10, 3, Math.PI / 4);         // cánh tầng tăng tốc (lớn, hình thang)
    fin(40, 60, 50, 58, 7.5, 2.3, Math.PI / 4);    // cánh giữa tầng hành trình
    fin(31, 37, 33, 36.5, 3.6, 2.3, Math.PI / 4);  // cánh lái đuôi
    fin(64, 69, 66, 68.5, 2.8, 2.3, 0);            // cánh mũi
  }
  function buildSam(K, group) {
    const L = K.L, EL = 35 * Math.PI / 180;
    // 3 bệ phóng: chân chống chữ thập, mâm xoay, giá nâng, ray phóng nghiêng 35° chĩa ra ngoài
    for (const P of L.launchers) {
      const base = new THREE.Matrix4().multiplyMatrices(M4(P.f, 0, P.r), M4(0, 0, 0, 0, -P.az, 0));
      const at = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().multiplyMatrices(base, M4(x, y, z, rx, ry, rz, sx, sy, sz));
      K.add('concDark', new THREE.CylinderGeometry(34, 36, 3, 6), at(0, -0.6, 0));
      K.add('olive', new THREE.BoxGeometry(60, 3, 6), at(0, 3, 0)); K.add('olive', new THREE.BoxGeometry(6, 3, 60), at(0, 3, 0));
      for (const [a, b] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) K.add('steelDark', new THREE.BoxGeometry(8, 2, 8), at(a, 1, b));
      K.add('olive', new THREE.BoxGeometry(24, 6, 24), at(0, 6, 0));
      K.add('steelDark', new THREE.CylinderGeometry(13, 13, 5, 18), at(0, 11.5, 0));
      for (const s of [-1, 1]) K.add('olive', new THREE.BoxGeometry(26, 16, 3), at(-4, 22, s * 8));
      K.add('oliveDark', new THREE.BoxGeometry(10, 8, 13), at(8, 18, 0));
      const boom = new THREE.Matrix4().multiplyMatrices(at(-8, 26, 0), M4(0, 0, 0, 0, 0, EL));
      K.add('olive', new THREE.BoxGeometry(70, 4, 6), new THREE.Matrix4().multiplyMatrices(boom, M4(21, 0, 0)));
      K.add('steelGray', new THREE.BoxGeometry(60, 1.2, 2), new THREE.Matrix4().multiplyMatrices(boom, M4(24, 2.6, 0)));
      K.beam('steelGray', [8, 14, 0], [-8 + Math.cos(EL) * 20, 26 + Math.sin(EL) * 20, 0], 2.4, base);   // xi lanh nâng ray
      missileParts(K, new THREE.Matrix4().multiplyMatrices(boom, M4(-12, 6.5, 0)));
      // hộp va chạm: bệ + 3 đoạn tên lửa (mỗi đoạn một khoảng cao)
      K.solid(P.f, P.r, 30, 30, 0, 30, P.az);
      for (let k = 0; k < 3; k++) {
        const x0 = -12 + k * 28, x1 = x0 + 28, c = Math.cos(EL), s = Math.sin(EL), mid = (x0 + x1) / 2 * c - 8;
        K.solid(P.f + Math.cos(P.az) * mid, P.r + Math.sin(P.az) * mid, 14 * c + 4, 12, 26 + x0 * s - 4, 26 + x1 * s + 12, P.az);
      }
      // cáp điều khiển nối về xe radar
      const d = Math.hypot(P.f, P.r) - 40;
      K.beam('rubber', [P.f * 30 / (d + 40), 0.8, P.r * 30 / (d + 40)], [P.f * (d + 6) / (d + 40), 0.8, P.r * (d + 6) / (d + 40)], 1.4);
    }
    // Xe radar điều khiển hoả lực ở giữa: thùng xe trên rơ-moóc, cột xoay, 2 ăng-ten máng (ngang + dọc), 2 chảo nhỏ
    const truck = (f, r, len, wid, hgt, ry, m) => {
      const b = new THREE.Matrix4().multiplyMatrices(M4(f, 0, r), M4(0, 0, 0, 0, ry || 0, 0));
      const at = (x, y, z, rx, rry, rz) => new THREE.Matrix4().multiplyMatrices(b, M4(x, y, z, rx, rry, rz));
      K.add('steelDark', new THREE.BoxGeometry(len - 6, 4, wid - 6), at(0, 8, 0));
      K.add(m || 'olive', new THREE.BoxGeometry(len, hgt, wid), at(0, 10 + hgt / 2, 0));
      K.add('oliveDark', new THREE.BoxGeometry(len + 0.6, 1.4, wid + 0.6), at(0, 10 + hgt, 0));
      for (const x of [-len / 2 + 9, len / 2 - 9]) for (const s of [-1, 1]) K.add('rubber', new THREE.CylinderGeometry(5, 5, 4, 14), at(x, 5, s * (wid / 2 - 2), Math.PI / 2, 0, 0));
      K.add('steelDark', new THREE.BoxGeometry(1, 8, 6), at(len / 2 + 0.3, 18, 0));
    };
    truck(0, 0, 64, 22, 24, 0);
    K.cyl('steelDark', 0, 34, 0, 5, 6, 12, 12);
    K.box('olive', 0, 52, 0, 16, 12, 16);
    K.box('oliveDark', 10, 64, -6, 10, 12, 74);
    K.box('steelGray', 15.2, 64, -6, 0.8, 9, 70);
    K.box('oliveDark', 10, 58, 20, 10, 74, 12);
    K.box('steelGray', 15.2, 58, 20, 0.8, 70, 9);
    for (const r of [-6, 6]) K.add('steelWhite', new THREE.SphereGeometry(6, 14, 6, 0, TAU, 0, Math.PI * 0.4), M4(12, 50, r, 0, 0, -Math.PI / 2));
    K.solid(0, 0, 33, 12, 0, 58);
    K.solid(10, -6, 6, 38, 56, 72);
    K.solid(10, 20, 6, 7, 20, 96);
    // xe chỉ huy, xe điện (máy phát có ống xả), cáp nối
    truck(-58, 46, 56, 22, 22, 0.3);
    truck(-58, -46, 42, 18, 18, -0.3, 'oliveDark');
    K.cyl('steelDark', -50, 28, -52, 1, 1, 10, 6);
    K.solid(-58, 46, 30, 12, 0, 34, -0.3);
    K.solid(-58, -46, 23, 10, 0, 30, 0.3);
    for (const r of [46, -46]) K.beam('rubber', [-34, 0.8, r * 0.6], [-6, 0.8, r * 0.18], 1.4);
    // xe vận tải - nạp đạn chở 1 tên lửa (đầu kéo + sơ-mi rơ-moóc)
    {
      const r = -150, fc = -20;
      K.box('olive', fc - 8, 16, r, 18, 16, 22);
      K.box('olive', fc + 5, 13, r, 10, 10, 20);
      K.box('glass', fc + 0.6, 21, r, 0.6, 6, 18);
      K.box('steelDark', fc - 50, 10, r, 96, 4, 16);
      for (const x of [fc + 4, fc - 12, fc - 76, fc - 90]) for (const s of [-1, 1]) K.add('rubber', new THREE.CylinderGeometry(5, 5, 4, 14), M4(x, 5, r + s * 9, Math.PI / 2, 0, 0));
      for (const x of [fc - 30, fc - 70]) K.box('olive', x, 17, r, 4, 10, 12);
      missileParts(K, M4(fc - 108, 26, r));
      K.solid(fc - 50, r, 60, 12, 0, 36);
    }
  }

  // ===========================================================================
  // TẬP CÔNG TRÌNH TRÊN BẢN ĐỒ
  // ===========================================================================
  // Đoạn thẳng a -> b cắt hộp xoay (mặt bằng u/v + khoảng cao) -> tham số t hoặc -1
  function segBox(ax, ay, az, bx, by, bz, q) {
    const vx = -q.uz, vz = q.ux;
    const dx = ax - q.cx, dz = az - q.cz, ex = bx - ax, ey = by - ay, ez = bz - az;
    let t0 = 0, t1 = 1;
    const slab = (p, d, h) => {
      if (Math.abs(d) < 1e-9) return Math.abs(p) <= h;
      let a = (-h - p) / d, b = (h - p) / d;
      if (a > b) { const k = a; a = b; b = k; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      return t0 <= t1;
    };
    if (!slab(dx * q.ux + dz * q.uz, ex * q.ux + ez * q.uz, q.hu)) return -1;
    if (!slab(dx * vx + dz * vz, ex * vx + ez * vz, q.hv)) return -1;
    if (!slab(ay - (q.y0 + q.y1) / 2, ey, (q.y1 - q.y0) / 2)) return -1;
    return t0;
  }

  class LandmarkSet {
    constructor(parent, list, opts) {
      this.group = new THREE.Group();
      this.group.name = 'landmarks';
      parent.add(this.group);
      this.items = [];
      this.boxes = [];
      const groundAt = (opts && opts.groundAt) || (() => 0);
      for (const L of list || []) {
        const grp = new THREE.Group();
        grp.name = 'landmark_' + L.kind;
        grp.position.set(L.x, L.G, L.z);
        grp.rotation.y = -L.angle;   // trục X cục bộ = f, trục Z cục bộ = r
        this.group.add(grp);
        const K = new Kit(L, groundAt);
        if (L.kind === 'nuke') buildNuke(K, grp);
        else if (L.kind === 'bio') buildBio(K, grp);
        else if (L.kind === 'sam') buildSam(K, grp);
        K.build(grp);
        const it = { L, kind: L.kind, name: NAMES[L.kind] || L.kind, x: L.x, z: L.z, G: L.G, boxes: K.solids, top: L.G + K.top, reach: Math.hypot(L.hu, L.hv) + 30 };
        this.items.push(it);
        this.boxes.push(...K.solids);
      }
      this.group.updateMatrixWorld(true);
    }
    // điểm (x, z) nằm trong tầm công trình nào (bán kính bao + lề r)
    near(x, z, r) {
      for (const it of this.items) if (Math.hypot(x - it.x, z - it.z) < it.reach + (r || 0)) return it;
      return null;
    }
    // trong mặt bằng san nền (hoặc khối đặc) — không mọc cỏ, không đặt xe
    covers(x, z, pad) {
      for (const it of this.items) {
        const L = it.L, dx = x - L.x, dz = z - L.z;
        if (Math.abs(dx) > it.reach + 40 || Math.abs(dz) > it.reach + 40) continue;
        const f = dx * L.fx + dz * L.fz, r = -dx * L.fz + dz * L.fx, p = pad || 0;
        if (L.kind !== 'sam' && Math.abs(f) < L.hu + p && Math.abs(r) < L.hv + p) return true;
        for (const q of it.boxes) {
          const ex = x - q.cx, ez = z - q.cz;
          if (Math.abs(ex * q.ux + ez * q.uz) < q.hu + p && Math.abs(-ex * q.uz + ez * q.ux) < q.hv + p) return true;
        }
      }
      return false;
    }
    // hộp va chạm gần (x, z) cho VehicleCollision
    vehicleBoxes(x, z, reach, out) {
      for (const it of this.items) {
        if (Math.abs(x - it.x) > it.reach + reach || Math.abs(z - it.z) > it.reach + reach) continue;
        for (const q of it.boxes) if (Math.abs(x - q.cx) < q.hu + q.hv + reach && Math.abs(z - q.cz) < q.hu + q.hv + reach) out.push(q);
      }
      return out;
    }
    // đạn tại (x, y, z) nằm trong khối đặc -> điểm chạm kèm pháp tuyến mặt gần nhất
    hitTest(x, y, z) {
      for (const it of this.items) {
        const ex = x - it.x, ez = z - it.z, R = it.reach;
        if (ex > R || ex < -R || ez > R || ez < -R || y > it.top + 2 || y < it.G - 12) continue;
        for (const q of it.boxes) {
          if (y < q.y0 || y > q.y1) continue;
          const dx = x - q.cx, dz = z - q.cz, u = dx * q.ux + dz * q.uz, v = -dx * q.uz + dz * q.ux;
          if (u > q.hu || u < -q.hu || v > q.hv || v < -q.hv) continue;
          const du = q.hu - Math.abs(u), dv = q.hv - Math.abs(v), dy = q.y1 - y;
          let normal;
          if (dy < du && dy < dv) normal = { x: 0, y: 1, z: 0 };
          else if (du < dv) { const s = Math.sign(u) || 1; normal = { x: q.ux * s, y: 0, z: q.uz * s }; }
          else { const s = Math.sign(v) || 1; normal = { x: -q.uz * s, y: 0, z: q.ux * s }; }
          return { hit: true, type: 'WALL', landmark: it, normal, x, y, z };
        }
      }
      return null;
    }
    // đoạn a -> b có xuyên khối đặc nào (chắn sóng nổ / tầm nhìn)
    segmentHit(ax, ay, az, bx, by, bz) {
      for (const it of this.items) {
        if (Math.max(ax, bx) < it.x - it.reach || Math.min(ax, bx) > it.x + it.reach || Math.max(az, bz) < it.z - it.reach || Math.min(az, bz) > it.z + it.reach) continue;
        for (const q of it.boxes) if (segBox(ax, ay, az, bx, by, bz, q) >= 0) return it;
      }
      return null;
    }
    maxTop() { return this.items.reduce((a, it) => Math.max(a, it.top), -Infinity); }
    // Lưới tìm đường: mọi hộp va chạm (đã nới rộng) là ô chặn
    navBoxes() { return this.boxes; }
    // Vẽ lên bản đồ (bản đồ nhỏ / bản đồ chiến thuật): mặt bằng, khối đặc, tên công trình
    drawOnMap(g, P, sc, labels) {
      g.save();
      for (const it of this.items) {
        const L = it.L;
        g.save(); g.translate(P(L.x), P(L.z)); g.rotate(L.angle);
        g.fillStyle = L.kind === 'sam' ? 'rgba(120,112,84,0.35)' : 'rgba(150,148,140,0.55)';
        g.strokeStyle = 'rgba(230,200,90,0.55)'; g.lineWidth = 1;
        if (L.kind === 'sam') { g.beginPath(); g.arc(0, 0, L.hu * sc, 0, TAU); g.fill(); g.stroke(); }
        else { g.fillRect(-L.hu * sc, -L.hv * sc, L.hu * 2 * sc, L.hv * 2 * sc); g.strokeRect(-L.hu * sc, -L.hv * sc, L.hu * 2 * sc, L.hv * 2 * sc); }
        g.restore();
        g.fillStyle = '#2a2c2e';
        for (const q of it.boxes) {
          g.save(); g.translate(P(q.cx), P(q.cz)); g.rotate(Math.atan2(q.uz, q.ux));
          g.fillRect(-q.hu * sc, -q.hv * sc, Math.max(1, q.hu * 2 * sc), Math.max(1, q.hv * 2 * sc));
          g.restore();
        }
        if (labels) {
          const fs = Math.max(9, Math.min(13, 34 * sc * 8));
          g.font = `bold ${fs | 0}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.fillStyle = L.kind === 'nuke' ? '#ffd24a' : L.kind === 'bio' ? '#ff8a5c' : '#9fd3ff';
          const icon = L.kind === 'nuke' ? '☢' : L.kind === 'bio' ? '☣' : '✈';
          const y = P(L.z) + (L.hv + 30) * sc;
          g.strokeText(icon + ' ' + it.name, P(L.x), y); g.fillText(icon + ' ' + it.name, P(L.x), y);
        }
      }
      g.restore();
    }
  }

  // Vẽ mặt bằng xuống ảnh nền mặt đất (nhìn từ xa / bản đồ vệ tinh): sân bê tông, đường đất trong trận địa
  function paintGround(ctx, list, toPx, sc) {
    for (const L of list || []) {
      ctx.save(); ctx.translate(toPx(L.x), toPx(L.z)); ctx.rotate(L.angle); ctx.scale(sc, sc);
      if (L.kind === 'sam') {
        ctx.fillStyle = 'rgba(126,108,80,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(118,100,74,0.55)'; ctx.lineWidth = 22;
        ctx.beginPath(); ctx.arc(0, 0, 128, 0, TAU); ctx.stroke();
        for (const P of L.launchers) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(P.f, P.r); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L.hu + 40, 0); ctx.stroke();
      } else {
        const f0 = L.kind === 'bio' ? L.mound.face + 22 : -L.hu;
        ctx.fillStyle = L.kind === 'nuke' ? 'rgba(164,156,140,0.95)' : 'rgba(150,148,140,0.95)'; ctx.fillRect(f0, -L.hv, L.hu - f0, L.hv * 2);
      }
      ctx.restore();
    }
  }

  return { LandmarkSet, paintGround, NAMES, segBox };
})();
if (typeof window !== 'undefined') window.Landmarks = Landmarks;
