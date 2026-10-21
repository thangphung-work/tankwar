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
  // Bê tông đổ khuôn ván (1 ô = 64 đơn vị = 8 m, 64 px / m): mạch ván 2 x 1 m, lỗ ty giằng, vệt nước chảy, muối hoa,
  // vết nứt chân chim, sứt mẻ; kèm ảnh độ sần (bump) cùng hình: mạch ván / lỗ ty / vết nứt lõm xuống
  function concPair() {
    if (TEX.conc) return TEX.conc;
    const N = 512, c = canvas(N, N), g = c.getContext('2d'), b = canvas(N, N), q = b.getContext('2d');
    concreteFill(g, N, N, '#9c9990', 301);
    q.fillStyle = '#808080'; q.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) { const v = 100 + hash(i + 7000) * 56 | 0; q.fillStyle = `rgb(${v},${v},${v})`; q.fillRect(hash(i + 7001) * N, hash(i + 7002) * N, 1 + hash(i + 7003) * 2, 1 + hash(i + 7004) * 2); }
    const both = (fn) => { fn(g, false); fn(q, true); };
    // mạch ván khuôn
    both((x, bm) => { x.strokeStyle = bm ? '#505050' : 'rgba(58,56,52,0.4)'; x.lineWidth = bm ? 2 : 1.4;
      for (let y = 0; y <= N; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(N, y); x.stroke(); }
      for (let row = 0; row < 8; row++) for (let k = 0; k <= 4; k++) { const xx = k * 128 + (row % 2) * 64; x.beginPath(); x.moveTo(xx, row * 64); x.lineTo(xx, row * 64 + 64); x.stroke(); } });
    // tông màu khác nhau từng tấm ván (mẻ đổ)
    for (let row = 0; row < 8; row++) for (let k = -1; k < 4; k++) { g.fillStyle = `rgba(${hash(row * 9 + k) < 0.5 ? '70,68,62' : '210,206,196'},${0.04 + hash(row * 7 + k + 3) * 0.06})`; g.fillRect(k * 128 + (row % 2) * 64, row * 64, 128, 64); }
    // lỗ ty giằng
    // (nhỏ + mờ: lỗ ty Ø ~3 cm cách nhau 1 m, ở xa gần như không thấy — tránh lưới chấm tròn trên mọi mặt)
    both((x, bm) => { x.fillStyle = bm ? '#5a5a5a' : 'rgba(46,44,40,0.32)';
      for (let y = 32; y < N; y += 64) for (let xx = 32; xx < N; xx += 64) { x.beginPath(); x.arc(xx, y, bm ? 1.6 : 1.4, 0, TAU); x.fill(); } });
    // vệt nước chảy + muối hoa trắng dưới lỗ ty
    for (let i = 0; i < 40; i++) {
      const x = hash(i + 40) * N, y = hash(i + 43) * N * 0.6, l = 40 + hash(i + 41) * 220, dark = hash(i + 44) < 0.7;
      const gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, dark ? 'rgba(62,58,50,0.28)' : 'rgba(232,230,222,0.25)'); gr.addColorStop(1, 'rgba(62,58,50,0)');
      g.fillStyle = gr; g.fillRect(x, y, 2 + hash(i + 42) * 7, l);
    }
    // vết nứt chân chim
    both((x, bm) => {
      x.strokeStyle = bm ? '#5a5a5a' : 'rgba(40,38,34,0.3)'; x.lineWidth = bm ? 1 : 0.8;
      for (let i = 0; i < 9; i++) {
        let px = hash(i + 500) * N, py = hash(i + 501) * N, a = hash(i + 502) * TAU;
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 7; k++) { a += (hash(i * 31 + k) - 0.5) * 1.4; px += Math.cos(a) * 6; py += Math.sin(a) * 6; x.lineTo(px, py); }
        x.stroke();
      }
    });
    // sứt mẻ (mảng lõm sáng)
    // (mảng loang mờ không đều thay cho chấm tròn — chấm tròn nhìn như lỗ thủng)
    for (let i = 0; i < 26; i++) {
      const x = hash(i + 600) * N, y = hash(i + 601) * N, r = 10 + hash(i + 602) * 30, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, hash(i + 603) < 0.5 ? 'rgba(80,76,68,0.12)' : 'rgba(214,210,200,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const t = new THREE.CanvasTexture(c), tb = new THREE.CanvasTexture(b);
    for (const k of [t, tb]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (TEX.conc = [t, tb]);
  }
  const concTex = () => concPair()[0];
  // Lớp bẩn / gỉ / trầy cho thép & bề mặt sơn (nhân với màu vật liệu): nền gần trắng, mảng bẩn, đốm gỉ, vệt gỉ chảy,
  // vết trầy; ảnh độ sần đi kèm (sơn rộp, đốm gỉ nổi). rust: mức gỉ
  function grimePair(key, rust) {
    if (TEX['g_' + key]) return TEX['g_' + key];
    const N = 256, c = canvas(N, N), g = c.getContext('2d'), b = canvas(N, N), q = b.getContext('2d'), sd = key.length * 97;
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, N, N); q.fillStyle = '#808080'; q.fillRect(0, 0, N, N);
    for (let i = 0; i < 30; i++) { const x = hash(sd + i) * N, y = hash(sd + i + 1) * N, r = 10 + hash(sd + i + 2) * 50; for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) blotch(g, x + ox, y + oy, r, hash(sd + i + 3) < 0.6 ? '96,90,78' : '255,255,250', 0.16); }
    speckle(g, N, N, 3000, ['#a9a59a', '#ffffff', '#c7c2b6'], 1, 2, sd + 5);
    for (let i = 0; i < 4000; i++) { const v = 112 + hash(sd + i * 3 + 9000) * 32 | 0; q.fillStyle = `rgb(${v},${v},${v})`; q.fillRect(hash(sd + i * 3 + 9001) * N, hash(sd + i * 3 + 9002) * N, 2, 2); }
    for (let i = 0; i < 26 * rust; i++) {
      const x = hash(sd + i + 300) * N, y = hash(sd + i + 301) * N, r = 1.5 + hash(sd + i + 302) * 5;
      g.fillStyle = `rgba(${120 + hash(i) * 40 | 0},${62 + hash(i + 1) * 20 | 0},30,0.55)`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      const gr = g.createLinearGradient(0, y, 0, y + 30 + r * 8); gr.addColorStop(0, 'rgba(130,70,34,0.35)'); gr.addColorStop(1, 'rgba(130,70,34,0)');
      g.fillStyle = gr; g.fillRect(x - r * 0.4, y, r * 0.8, 30 + r * 8);
      q.fillStyle = '#a8a8a8'; q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill();
    }
    g.strokeStyle = 'rgba(250,250,246,0.35)'; g.lineWidth = 0.8;
    for (let i = 0; i < 40; i++) { const x = hash(sd + i + 700) * N, y = hash(sd + i + 701) * N, a = hash(sd + i + 702) * TAU, l = 6 + hash(sd + i + 703) * 24; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const t = new THREE.CanvasTexture(c), tb = new THREE.CanvasTexture(b);
    for (const k of [t, tb]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (TEX['g_' + key] = [t, tb]);
  }
  // Tôn sóng vách / mái (sóng dọc theo trục v, 1 ô = 24 đơn vị = 3 m, bước sóng ~19 cm) + vệt gỉ chảy, kèm độ sần
  function ribPair(key, horiz, period, base) {
    if (TEX[key]) return TEX[key];
    const N = 128, c = canvas(N, N), g = c.getContext('2d'), b = canvas(N, N), q = b.getContext('2d');
    for (let i = 0; i < N; i++) {
      // sóng hình thang (tôn 5 sóng vuông): mặt phẳng sáng, sườn tối
      const sn = Math.sin(i / period * TAU), k = Math.max(0, Math.min(1, 0.5 + sn * 1.4)), lit = 0.5 + 0.5 * Math.cos(i / period * TAU);
      const v = Math.round(base * (0.74 + 0.22 * k + 0.08 * lit)), bv = Math.round(60 + 150 * k);
      g.fillStyle = `rgb(${v},${v},${v})`; q.fillStyle = `rgb(${bv},${bv},${bv})`;
      if (horiz) { g.fillRect(0, i, N, 1); q.fillRect(0, i, N, 1); } else { g.fillRect(i, 0, 1, N); q.fillRect(i, 0, 1, N); }
    }
    for (let i = 0; i < 6; i++) {
      const x = hash(i + 2100 + period) * N, l = 20 + hash(i + 2101) * 60, gr = g.createLinearGradient(0, 0, 0, l);
      gr.addColorStop(0, 'rgba(120,80,50,0.14)'); gr.addColorStop(1, 'rgba(120,70,36,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + hash(i + 2102) * 3, l);
    }
    speckle(g, N, N, 500, ['rgba(70,64,56,1)', 'rgba(255,255,255,1)'], 1, 2, 2110 + period);
    const t = new THREE.CanvasTexture(c), tb = new THREE.CanvasTexture(b);
    for (const k of [t, tb]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (TEX[key] = [t, tb]);
  }
  // Rọ đá Hesco: vải địa kỹ thuật màu cát căng trong khung lưới thép ô vuông (1 ô texture = 1 rọ)
  const hescoTex = () => texOf('hesco', 128, 128, (g, w, h) => {
    g.fillStyle = '#b4a27a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) blotch(g, hash(i + 1200) * w, hash(i + 1201) * h, 8 + hash(i + 1202) * 20, hash(i + 1203) < 0.6 ? '120,104,74' : '210,196,160', 0.25);
    speckle(g, w, h, 1200, ['#8f7e5a', '#cdbd95'], 1, 2, 1210);
    g.strokeStyle = 'rgba(60,62,60,0.9)'; g.lineWidth = 1.6;
    for (let x = 0; x <= w; x += w / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
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
        if (i === 0) g.fillStyle = o.fg2 || '#1d1d1d';
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
        const rect = (fa, ra, fb, rb, col) => { const [x0, y0] = P(Math.min(fa, fb), Math.min(ra, rb)); g.fillStyle = col; g.fillRect(x0, y0, Math.abs(fb - fa) * S, Math.abs(rb - ra) * S); };
        const hu = f1, hv = r1, iF = hu - 62, iR = hv - 62;
        // cỏ trong khu trong (lốm đốm, ngả vàng chỗ xe đi), viền đường tuần tra sỏi đầm
        rect(-iF + 24, -iR + 24, iF - 24, iR - 24, '#6f7a45');
        for (let i = 0; i < 260; i++) blotch(g, hash(i + 1500) * w, hash(i + 1501) * h, (8 + hash(i + 1502) * 40) * S, hash(i + 1503) < 0.5 ? '96,108,58' : '132,126,80', 0.35);
        speckle(g, w, h, 14000, ['#5c6a38', '#83894f', '#4f5a30'], 1, 2.4, 1510);
        g.strokeStyle = 'rgba(120,112,96,0.95)'; g.lineWidth = 20 * S; g.strokeRect(...P(-iF + 14, -iR + 14), (iF * 2 - 28) * S, (iR * 2 - 28) * S);
        // nền sỏi quanh công trình: khu cấm silo, cổng, gò điều khiển, nhà xe, trạm điện, bồn nhiên liệu, chân tháp canh
        const grav = 'rgba(166,158,142,0.97)';
        for (const [fa, ra, fb, rb] of [[-216, -170, 156, 210], [hu - 150, -70, hu, 70], [-250, -366, -80, -180], [-25, 252, 150, 348], [-200, 262, -90, 338],
          [-98, -448, 18, -332], [hu - 110, 120, hu - 60, 215], [180, -200, 230, -140], [-260, -50, -210, 50]]) rect(fa, ra, fb, rb, grav);
        for (let i = 0; i < 9000; i++) { const x = hash(i + 1600) * w, y = hash(i + 1601) * h; g.fillStyle = hash(i + 1602) < 0.5 ? 'rgba(110,104,92,0.35)' : 'rgba(200,192,176,0.35)'; g.fillRect(x, y, 2, 2); }
        // đường nhựa nội bộ: cổng -> khu cấm silo, trục ngang trước, trục nhà xe / trạm điện, nhánh tới cửa trung tâm điều khiển
        const road = (pts, wd) => {
          g.lineCap = 'round'; g.lineJoin = 'round';
          g.strokeStyle = '#3f4144'; g.lineWidth = wd * S; g.beginPath(); pts.forEach(([f, r], i) => i ? g.lineTo(...P(f, r)) : g.moveTo(...P(f, r))); g.stroke();
          g.strokeStyle = 'rgba(30,30,32,0.4)'; g.lineWidth = 1.2 * S; g.setLineDash([3 * S, 9 * S]); g.stroke();
          g.strokeStyle = 'rgba(222,190,60,0.9)'; g.lineWidth = 1.2 * S; g.setLineDash([10 * S, 10 * S]); g.stroke(); g.setLineDash([]);
          g.strokeStyle = 'rgba(232,230,220,0.75)'; g.lineWidth = 0.8 * S;
          for (const s2 of [-1, 1]) { g.beginPath(); pts.forEach(([f, r], i) => { const q = pts[Math.min(pts.length - 1, i + 1)], p0 = pts[Math.max(0, i - 1)], df = q[0] - p0[0], dr = q[1] - p0[1], l = Math.hypot(df, dr) || 1; const pp = P(f - dr / l * s2 * (wd / 2 - 1.5), r + df / l * s2 * (wd / 2 - 1.5)); i ? g.lineTo(...pp) : g.moveTo(...pp); }); g.stroke(); }
        };
        road([[hu, 0], [160, 0]], 36);
        road([[180, -300], [180, 280]], 28);
        road([[180, 240], [-210, 240]], 26);
        road([[180, -200], [-60, -200], [-60, -270], [-92, -270]], 24);
        // vạch dừng + chữ STOP trước cổng khu cấm, ô đỗ xe chống mìn
        g.fillStyle = 'rgba(240,238,228,0.9)'; g.fillRect(...P(166, -16), 2.4 * S, 32 * S);
        g.save(); g.translate(...P(172, 0)); g.rotate(Math.PI / 2); g.font = `bold ${(8 * S) | 0}px Arial`; g.textAlign = 'center'; g.fillText('STOP', 0, 0); g.restore();
        g.strokeStyle = 'rgba(240,238,228,0.85)'; g.lineWidth = 1 * S;
        for (let r = 128; r <= 212; r += 28) { g.beginPath(); g.moveTo(...P(hu - 140, r)); g.lineTo(...P(hu - 80, r)); g.stroke(); }
        // vệt dầu, vết bánh xích
        for (let i = 0; i < 40; i++) blotch(g, hash(i + 1700) * w, hash(i + 1701) * h, (4 + hash(i + 1702) * 12) * S, '34,30,26', 0.3);
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
    const C = (o) => { const [t, b] = concPair(); return S(Object.assign({ map: t, bumpMap: b, bumpScale: 0.5 }, o)); };
    // thép / sơn: lớp bẩn gỉ theo mức (rust), độ sần nhẹ
    const G = (rust, o) => { const [t, b] = grimePair('r' + rust, rust); return S(Object.assign({ map: t, bumpMap: b, bumpScale: 0.35 }, o)); };
    const m = {
      conc: () => C({ color: 0xd6d2c8, roughness: 0.95 }),
      concDark: () => C({ color: 0x9a968c, roughness: 0.97 }),
      steelRed: () => G(1, { color: 0xb04a2e, roughness: 0.62, metalness: 0.35 }),
      steelWhite: () => G(0.5, { color: 0xdcdad2, roughness: 0.5, metalness: 0.25 }),
      steelGray: () => G(1.5, { color: 0x80858a, roughness: 0.55, metalness: 0.35 }),
      steelDark: () => G(2, { color: 0x45494c, roughness: 0.62, metalness: 0.35 }),
      olive: () => G(0.6, { color: 0x58623f, roughness: 0.78, metalness: 0.12 }),
      oliveDark: () => G(0.8, { color: 0x3c4430, roughness: 0.82, metalness: 0.1 }),
      ochre: () => G(0.7, { color: 0xc9a46a, roughness: 0.55, metalness: 0.2 }),
      yellow: () => G(0.8, { color: 0xd2a21f, roughness: 0.6, metalness: 0.15 }),
      rubber: () => S({ color: 0x1c1c1c, roughness: 0.95 }),
      void: () => new THREE.MeshBasicMaterial({ color: 0x050505 }),
      // kính: không có envmap nên vẽ sẵn phản chiếu trời (trên sáng, dưới tối) + vệt loá chéo + bóng rèm bên trong
      glass: () => S({ color: 0xffffff, roughness: 0.2, metalness: 0.1, map: texOf('glass', 64, 64, (q, w, h) => {
        const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fa6b4'); gr.addColorStop(0.45, '#4d606b'); gr.addColorStop(1, '#1f2a31');
        q.fillStyle = gr; q.fillRect(0, 0, w, h);
        q.fillStyle = 'rgba(20,24,26,0.35)'; for (let y = 4; y < h * 0.4; y += 3) q.fillRect(0, y, w, 1);
        q.fillStyle = 'rgba(255,255,255,0.16)'; q.beginPath(); q.moveTo(w * 0.15, 0); q.lineTo(w * 0.42, 0); q.lineTo(w * 0.12, h); q.lineTo(-w * 0.15, h); q.fill();
      }) }),
      hazard: () => S({ map: hazardTex(), roughness: 0.75 }),
      bands: () => S({ map: bandTex(), roughness: 0.55, metalness: 0.2 }),
      icbm: () => S({ map: icbmTex(), roughness: 0.42, metalness: 0.15 }),
      missile: () => S({ color: 0xc3c8b9, roughness: 0.5, metalness: 0.2 }),
      lampRed: () => S({ color: 0x801010, emissive: 0xff2a1a, emissiveIntensity: 1.4, roughness: 0.4 }),
      lampAmber: () => S({ color: 0x806010, emissive: 0xffa21a, emissiveIntensity: 1.2, roughness: 0.4 }),
      wood: () => G(0, { color: 0x7a5c38, roughness: 0.9 }),
      sand: () => G(0, { color: 0xa48f68, roughness: 1, bumpScale: 0.8 }),
      bagGreen: () => G(0, { color: 0x6b6a4a, roughness: 1, bumpScale: 0.8 }),
      drumBlue: () => G(1.2, { color: 0x2f4f7a, roughness: 0.6, metalness: 0.3 }),
      tarp: () => G(0, { color: 0x4a5236, roughness: 0.95 }),
      hesco: () => S({ map: hescoTex(), color: 0xffffff, roughness: 1 }),
      // thân bồn thép sơn trắng ngà: 2 vành tôn (mỗi vành 2.4 m) có mối hàn ngang + mối hàn đứng so le, vệt bẩn mưa nhẹ
      tankShell: () => S({ color: 0xffffff, roughness: 0.55, metalness: 0.15, map: texOf('tankShell', 512, 256, (q, w, h) => {
        q.fillStyle = '#e1ded6'; q.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { const x = hash(i + 3300) * w, l = 30 + hash(i + 3301) * 150, gr = q.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(120,112,98,0.18)'); gr.addColorStop(1, 'rgba(120,112,98,0)'); q.fillStyle = gr; q.fillRect(x, 0, 2 + hash(i + 3302) * 5, l); }
        q.fillStyle = 'rgba(90,86,78,0.55)'; q.fillRect(0, h / 2 - 1, w, 2); q.fillRect(0, 0, w, 2); q.fillRect(0, h - 2, w, 2);
        for (let k = 0; k < 4; k++) { q.fillRect(k * w / 4 + 20, 0, 2, h / 2); q.fillRect(k * w / 4 + 84, h / 2, 2, h / 2); }
        const gb = q.createLinearGradient(0, h * 0.8, 0, h); gb.addColorStop(0, 'rgba(90,80,64,0)'); gb.addColorStop(1, 'rgba(90,80,64,0.35)'); q.fillStyle = gb; q.fillRect(0, h * 0.8, w, h * 0.2);
        speckle(q, w, h, 900, ['rgba(120,116,106,1)', 'rgba(250,250,246,1)'], 1, 2, 3310);
      }) }),
      corrTan: () => { const [t, b] = ribPair('rib_v', false, 16, 236); return S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0xb4b2a2, roughness: 0.7, metalness: 0.3 }); },
      corrGray: () => { const [t, b] = ribPair('rib_v', false, 16, 236); return S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0x8e9396, roughness: 0.6, metalness: 0.45 }); },
      shutter: () => { const [t, b] = ribPair('rib_h', true, 5, 230); return S({ map: t, bumpMap: b, bumpScale: 0.5, color: 0x9ba1a4, roughness: 0.55, metalness: 0.45 }); },
      louver: () => { const [t, b] = ribPair('rib_l', true, 3, 210); return S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0x8a8f92, roughness: 0.6, metalness: 0.4 }); }
    }[key];
    return (MAT[key] = m());
  }
  // Vật liệu dán chữ / biểu tượng (mặt phẳng): polygonOffset để không nhấp nháy với mặt tường phía sau
  function decal(key, tex) {
    if (MAT['d_' + key]) return MAT['d_' + key];
    return (MAT['d_' + key] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }
  // Chữ / vạch sơn trên nền trong suốt (ảnh có alpha)
  function decalT(key, tex) {
    if (MAT['t_' + key]) return MAT['t_' + key];
    return (MAT['t_' + key] = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
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
  // Gộp khối; màu đỉnh = che khuất tiếp đất (chân mỗi khối tối dần trong ~1.5 m dưới cùng) x sắc độ lệch nhẹ từng khối
  function mergeGeos(list) {
    let total = 0;
    const geos = list.map(([g, m]) => { const n = g.index ? g.toNonIndexed() : g.clone(); if (m) n.applyMatrix4(m); total += n.attributes.position.count; return n; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
    let o = 0, part = 0;
    for (const g of geos) {
      const n = g.attributes.position.count, P = g.attributes.position.array;
      pos.set(P, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < P.length; i += 3) { if (P[i] < y0) y0 = P[i]; if (P[i] > y1) y1 = P[i]; }
      const H = y1 - y0, span = Math.min(12, H * 0.6), tint = 0.93 + hash(part++ * 13 + n) * 0.12;
      for (let i = 0; i < n; i++) {
        let k = tint;
        if (H > 1.5) { const t = Math.min(1, (P[i * 3 + 1] - y0) / span); k *= 0.58 + 0.42 * t * t * (3 - 2 * t); }
        col[(o + i) * 3] = col[(o + i) * 3 + 1] = col[(o + i) * 3 + 2] = k;
      }
      o += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  // ô texture mặc định theo vật liệu (đơn vị): bê tông 8 m, sọc cảnh báo 2 m, thép / sơn 3 m; 0 = trải trọn ảnh
  const defTile = m => m === 'conc' || m === 'concDark' ? 64 : m === 'hazard' ? 16 : m === 'hesco' ? 9 : typeof m === 'string' && /^(steel|olive|ochre|yellow|wood|sand|bag|drum|tarp|corr|shutter)/.test(m) ? 24 : m === 'louver' ? 8 : 0;
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
      this.add(m, boxGeo(sx, sy, sz, tile === undefined ? defTile(m) : tile), M4(x, y, z, rx || 0, ry || 0, rz || 0));
    }
    // khối hộp vát cạnh c (bê tông đúc, thân xe...): mép không sắc lẹm như hộp thường -> bắt sáng ở cạnh
    cbox(m, x, y, z, sx, sy, sz, c, ry, mtx) {
      c = Math.min(c || 1.5, sx / 3, sy / 3, sz / 3);
      const sh = new THREE.Shape();
      sh.moveTo(-sx / 2 + c, -sy / 2 + c); sh.lineTo(sx / 2 - c, -sy / 2 + c); sh.lineTo(sx / 2 - c, sy / 2 - c); sh.lineTo(-sx / 2 + c, sy / 2 - c); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: sz - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1 });
      g.translate(0, 0, -(sz - 2 * c) / 2);
      const tile = defTile(m) || 24, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
      const local = M4(x, y, z, 0, ry || 0, 0);
      this.add(m, g, mtx ? new THREE.Matrix4().multiplyMatrices(mtx, local) : local);
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
        if (!(m.isMeshBasicMaterial || m.polygonOffset || m.transparent || m.emissiveIntensity > 0.5) && !m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; }
        const mesh = new THREE.Mesh(mergeGeos(list), m);
        mesh.castShadow = !(m.isMeshBasicMaterial || m.polygonOffset || m.alphaTest > 0 || m.transparent || m === MAT.wire);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      this.parts.clear();
    }
  }

  // Sân bê tông (mặt trên dán texture riêng, gờ bê tông bao quanh che chỗ nối với đất)
  function apron(group, L, f0, f1, r0, r1, kind) {
    const hu = (f1 - f0) / 2, hv = (r1 - r0) / 2;
    const at = apronTex(kind, f0, f1, r0, r1);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(hu * 2, hv * 2), new THREE.MeshStandardMaterial({ map: at, bumpMap: at, bumpScale: kind === 'nuke' ? 1.6 : 0.6, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
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
  // Hàng rào lưới cao H (mặc định 1.8 m) từ (f0, r0) tới (f1, r1): cột thép mỗi ~3 m, tay chéo nghiêng ra ngoài mang
  // 3 sợi thép gai; coil = thêm cuộn dây thép gai lưỡi dao (concertina) trên đỉnh
  function fence(K, f0, r0, f1, r1, out, H, coil) {
    H = H || 15;
    const len = Math.hypot(f1 - f0, r1 - r0), n = Math.max(1, Math.round(len / 24)), ang = Math.atan2(r1 - r0, f1 - f0);
    const ox = -Math.sin(ang) * (out || 1), oz = Math.cos(ang) * (out || 1);   // pháp tuyến ra phía ngoài
    for (let i = 0; i <= n; i++) {
      const t = i / n, f = f0 + (f1 - f0) * t, r = r0 + (r1 - r0) * t;
      K.cyl('steelGray', f, 0, r, 0.45, 0.45, H, 6);
      K.cyl('concDark', f, -0.6, r, 1.3, 1.5, 1.4, 8);
      K.beam('steelGray', [f, H, r], [f + ox * 3, H + 3, r + oz * 3], 0.4);
    }
    const g = new THREE.PlaneGeometry(len, H - 1), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 2, uv.getY(i) * (H - 1) / 2);
    K.add(meshFenceMat(), g, M4((f0 + f1) / 2, H / 2 + 0.5, (r0 + r1) / 2, 0, -ang, 0));
    K.beam('steelGray', [f0, H, r0], [f1, H, r1], 0.35);
    for (const k of [1, 2, 3]) K.beam('steelDark', [f0 + ox * k, H + k, r0 + oz * k], [f1 + ox * k, H + k, r1 + oz * k], 0.25);
    if (coil) {
      const ring = new THREE.TorusGeometry(3.4, 0.16, 3, 10), m = Math.round(len / 2.4);
      for (let i = 0; i <= m; i++) {
        const t = i / m;
        K.add('steelGray', ring.clone(), M4(f0 + (f1 - f0) * t + ox * 1.5, H + 4.5, r0 + (r1 - r0) * t + oz * 1.5, 0.35 * (i % 2 ? 1 : -1), Math.PI / 2 - ang, 0));
      }
      ring.dispose();
    }
    K.solid((f0 + f1) / 2, (r0 + r1) / 2, len / 2, 1.2, 0, H + 8, ang);
  }
  // Bờ bao cát xếp so le từng bao (bao 0.55 x 0.25 x 0.35 m, hơi lệch / phồng ngẫu nhiên) dọc đoạn (f0, r0) -> (f1, r1)
  function sandbags(K, f0, r0, f1, r1, rows, y0, base) {
    const len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0), n = Math.max(1, Math.round(len / 4.4));
    for (let row = 0; row < rows; row++) for (let i = 0; i < n + (row % 2 ? 0 : 1); i++) {
      const t = Math.min(1, Math.max(0, (i + (row % 2 ? 0.5 : 0)) / n)), sd = (f0 * 7 + r0 * 3 + row * 31 + i) | 0;
      K.cbox(hash(sd) < 0.3 ? 'bagGreen' : 'sand', f0 + (f1 - f0) * t, (y0 || 0) + 1 + row * 1.9, r0 + (r1 - r0) * t, 4.4, 2, 2.8 + hash(sd + 1) * 0.4, 0.8, -ang + (hash(sd + 2) - 0.5) * 0.25, base);
    }
  }
  function drum(K, f, r, m, y0) {
    K.cyl(m, f, y0 || 0, r, 2.4, 2.4, 7.2, 14);
    for (const y of [0.2, 2.4, 4.8, 7]) K.cyl('steelDark', f, (y0 || 0) + y, r, 2.55, 2.55, 0.4, 14);
    K.cyl('steelDark', f + 1.2, (y0 || 0) + 7.2, r + 0.6, 0.5, 0.5, 0.4, 8);
  }
  // Lưới nguỵ trang (mảng lá vải xanh nâu, thủng lỗ chỗ) võng xuống giữa các cọc
  const camoMat = () => MAT.camo || (MAT.camo = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, alphaTest: 0.45,
    map: texOf('camo', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cols = ['#4a5232', '#5d6440', '#3b3f2a', '#6b5d3e', '#2f3424'];
      for (let i = 0; i < 900; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.ellipse(hash(i + 50) * w, hash(i + 51) * h, 3 + hash(i + 52) * 6, 2 + hash(i + 53) * 4, hash(i + 54) * 3, 0, TAU); g.fill(); }
      g.strokeStyle = '#2a2d22'; g.lineWidth = 1; for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
    }, true) }));
  function camoNet(K, base, w, d, y, sag) {
    const g = new THREE.PlaneGeometry(w, d, 10, 8);
    g.rotateX(-Math.PI / 2);
    const P = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const u = P.getX(i) / (w / 2), v = P.getZ(i) / (d / 2);
      P.setY(i, y - sag * (1 - u * u) * (1 - v * v) + (hash(i * 7) - 0.5) * 1.2);
      uv.setXY(i, uv.getX(i) * w / 40, uv.getY(i) * d / 40);
    }
    g.computeVertexNormals();
    K.add(camoMat(), g, base);
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.add('steelDark', new THREE.CylinderGeometry(0.4, 0.5, y, 6), new THREE.Matrix4().multiplyMatrices(base, M4(a * (w / 2 - 1), y / 2, b * (d / 2 - 1))));
  }
  // Biển cảnh báo treo rào (tiếng Anh như bãi phóng thật)
  const warnPlate = () => decal('warn_plate', signTex('warn_plate', ['WARNING', 'RESTRICTED AREA — USE OF DEADLY FORCE AUTHORIZED'], { w: 768, h: 256, bg: '#efece2', fg: '#a3221a' }));

  // Thân dựng từ các mặt cắt siêu elip nối liền (mũi -> khoang -> cần đuôi): stations [x, nửa rộng, nửa cao, tâm y, độ vuông]
  function loftGeo(stations, seg) {
    seg = seg || 28;
    const pos = [], uv = [], idxs = [];
    const ring = (x, hw, hh, yc, p, hb) => {
      if (hb === undefined) hb = hh * 0.92;
      const out = [];
      for (let k = 0; k <= seg; k++) {
        const t = k / seg * TAU, c = Math.cos(t), s = Math.sin(t);
        const e = 2 / p, cy = Math.sign(s) * Math.pow(Math.abs(s), e), cz = Math.sign(c) * Math.pow(Math.abs(c), e);
        out.push([x, yc + cy * (s < 0 ? hb : hh), hw * cz]);
      }
      return out;
    };
    const rings = stations.map(([x, hw, hh, yc, p, hb]) => ring(x, hw, hh, yc, p || 2.6, hb));
    let acc = 0;
    rings.forEach((R, i) => {
      if (i) acc += Math.abs(stations[i][0] - stations[i - 1][0]);
      R.forEach((q, k) => { pos.push(...q); uv.push(acc / 24, k / seg); });
    });
    const W = seg + 1;
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) {
      const a0 = i * W + k, b0 = a0 + 1, c0 = a0 + W, d0 = c0 + 1;
      idxs.push(a0, c0, b0, b0, c0, d0);
    }
    // nắp 2 đầu
    for (const [i, flip] of [[0, true], [rings.length - 1, false]]) {
      const c = pos.length / 3, R = rings[i], cx = R.reduce((s2, q) => s2 + q[0], 0) / R.length, cy = R.reduce((s2, q) => s2 + q[1], 0) / R.length;
      pos.push(cx, cy, 0); uv.push(0, 0);
      for (let k = 0; k < seg; k++) flip ? idxs.push(c, i * W + k, i * W + k + 1) : idxs.push(c, i * W + k + 1, i * W + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idxs);
    g.computeVertexNormals();
    return g;
  }
  // Tấm phẳng hình đa giác (cánh đuôi, cánh ổn định) có bề dày, mép vát
  function plateGeo(pts, t) {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: t * 0.4, bevelSegments: 1 });
    g.translate(0, 0, -t / 2);
    return g;
  }
  // Trực thăng đa dụng kiểu UH-60 (thân 15.3 m, cánh quạt Ø 16.4 m, cao 5.1 m), mũi +X, gốc tại mặt đất giữa thân
  // Trực thăng vận tải kiểu UH-60 theo số đo thật (8 đơn vị = 1 m): thân dài 15.3 m, rộng 2.36 m, bụng cách đất ~0.5 m,
  // nóc khoang ~2.6 m, đầu rô-to ~3.75 m, rô-to chính Ø16.4 m 4 lá (lá võng khi đậu, đầu lá vuốt), rô-to đuôi Ø3.35 m
  // lắp nghiêng 20° bên phải đỉnh cánh đuôi, cánh ổn định ngang 4.4 m dưới chân cánh đuôi, bánh chính cố định dưới
  // buồng lái (vệt bánh 2.7 m), bánh đuôi dưới cần đuôi. Gốc toạ độ: mặt đất, mũi tại x = 62, +x hướng mũi, +z bên phải.
  // Da thân trực thăng vẽ theo toạ độ (mét tính từ mũi, góc quanh thân t: 0 = hông phải giữa, π/2 = nóc, π = hông trái):
  // kính chắn gió + kính cửa buồng lái + kính cằm + cửa sổ khoang nằm đúng trên mặt cong, đường viền cửa, mạch tấm,
  // tấm chống loá đen trước kính, vệt muội sau ống xả, chữ U.S. ARMY trên cần đuôi
  function heliSkin() {
    if (TEX.heliSkin) return TEX.heliSkin;
    const W = 2048, H = 512, c = canvas(W, H), g = c.getContext('2d');
    const px = (m) => m / 17 * W, py = (t) => ((t / TAU) % 1 + 1) % 1 * H;
    g.fillStyle = '#434a37'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) blotch(g, hash(i + 3100) * W, hash(i + 3101) * H, 6 + hash(i + 3102) * 40, hash(i + 3103) < 0.5 ? '52,57,42' : '84,90,68', 0.18);
    speckle(g, W, H, 4000, ['rgba(50,54,40,1)', 'rgba(120,126,100,1)'], 1, 2, 3110);
    // bụng bẩn hơn, muội ống xả trên nóc phía sau
    const gb = g.createLinearGradient(0, H * 0.55, 0, H); gb.addColorStop(0, 'rgba(40,38,30,0)'); gb.addColorStop(0.5, 'rgba(40,38,30,0.3)'); gb.addColorStop(1, 'rgba(40,38,30,0)'); g.fillStyle = gb; g.fillRect(0, H * 0.55, W, H * 0.45);
    for (const t0 of [0.16, 0.84]) { const gr = g.createRadialGradient(px(9.6), py(t0 * Math.PI), 4, px(9.6), py(t0 * Math.PI), 120); gr.addColorStop(0, 'rgba(24,22,20,0.55)'); gr.addColorStop(1, 'rgba(24,22,20,0)'); g.fillStyle = gr; g.fillRect(px(7.8), py(t0 * Math.PI) - 120, 300, 240); }
    // mạch tấm vỏ
    g.strokeStyle = 'rgba(30,32,24,0.45)'; g.lineWidth = 1.4;
    for (const m of [0.5, 1.6, 3.1, 5.4, 6.2, 7.3, 8.4, 9.3, 10.3, 11.6, 12.9, 14.1]) { g.beginPath(); g.moveTo(px(m), 0); g.lineTo(px(m), H); g.stroke(); }
    for (const t of [0.42, 0.58, -0.36, 1.36]) { g.beginPath(); g.moveTo(px(0.4), py(t * Math.PI)); g.lineTo(px(15), py(t * Math.PI)); g.stroke(); }
    const poly = (pts, mir) => { g.beginPath(); pts.forEach(([m, t], i) => { const tt = (mir ? 1 - t : t) * Math.PI; i ? g.lineTo(px(m), py(tt)) : g.moveTo(px(m), py(tt)); }); g.closePath(); };
    const glass = (pts) => {
      for (const mir of [false, true]) {
        poly(pts, mir);
        const ys = pts.map(([, t]) => py((mir ? 1 - t : t) * Math.PI)), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const gr = g.createLinearGradient(0, mir ? y0 : y1, 0, mir ? y1 : y0);
        gr.addColorStop(0, '#9fb2bd'); gr.addColorStop(0.5, '#4a5a63'); gr.addColorStop(1, '#1b2328');
        g.fillStyle = gr; g.fill(); g.strokeStyle = '#1d1f1a'; g.lineWidth = 5; g.stroke();
      }
    };
    // tấm chống loá + kính
    g.fillStyle = '#1e211b'; poly([[0.05, 0.36], [0.6, 0.36], [0.6, 0.5], [0.05, 0.5]], false); g.fill(); poly([[0.05, 0.36], [0.6, 0.36], [0.6, 0.5], [0.05, 0.5]], true); g.fill();
    glass([[0.55, 0.47], [0.62, 0.16], [1.35, 0.1], [1.72, 0.47]]);
    glass([[1.8, 0.4], [2.45, 0.4], [2.45, 0.47], [1.8, 0.47]]);
    glass([[1.8, 0.03], [2.95, 0.03], [2.95, 0.32], [1.95, 0.36]]);
    glass([[1.15, -0.2], [1.85, -0.2], [1.85, -0.04], [1.25, -0.04]]);
    glass([[3.6, 0.08], [4.15, 0.08], [4.15, 0.24], [3.6, 0.24]]);
    glass([[4.5, 0.08], [5.05, 0.08], [5.05, 0.24], [4.5, 0.24]]);
    glass([[6.2, 0.08], [6.7, 0.08], [6.7, 0.22], [6.2, 0.22]]);
    // viền cửa buồng lái + cửa trượt khoang, tay nắm
    g.strokeStyle = 'rgba(20,22,16,0.85)'; g.lineWidth = 3;
    for (const mir of [false, true]) { poly([[1.7, -0.27], [3.05, -0.27], [3.05, 0.38], [1.78, 0.4]], mir); g.stroke(); poly([[3.3, -0.33], [5.3, -0.33], [5.3, 0.3], [3.3, 0.3]], mir); g.stroke(); }
    g.fillStyle = '#1c1d18'; for (const mir of [false, true]) { poly([[3.4, -0.02], [3.55, -0.02], [3.55, 0.02], [3.4, 0.02]], mir); g.fill(); poly([[2.8, 0], [2.9, 0], [2.9, 0.04], [2.8, 0.04]], mir); g.fill(); }
    // chữ U.S. ARMY 2 bên cần đuôi (bên phải lật ngược vì trục u chạy mũi -> đuôi)
    g.fillStyle = '#16170f'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(px(11.4), py(Math.PI)); g.scale(1, 2.2); g.fillText('U.S. ARMY', 0, 0); g.restore();
    // hông phải: t tăng = đi lên, u tăng = sang trái khi nhìn từ bên phải -> xoay chữ 180°; t = 0 nằm ở mép ảnh nên vẽ 2 lần
    for (const y of [0, H]) { g.save(); g.translate(px(11.4), y); g.scale(-1, -2.2); g.fillText('U.S. ARMY', 0, 0); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.flipY = false;   // v = 0 ứng với đỉnh ảnh (t = 0)
    return (TEX.heliSkin = t);
  }
  function heli(K, base) {
    const at = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().multiplyMatrices(base, M4(x, y, z, rx, ry, rz, sx, sy, sz));
    const hm = MAT.heliPaint || (MAT.heliPaint = (() => { const [t, b] = grimePair('r0.4', 0.4); return new THREE.MeshStandardMaterial({ color: 0x3b4230, map: t, bumpMap: b, bumpScale: 0.25, roughness: 0.82, metalness: 0.1, side: THREE.DoubleSide }); })());
    const X = (m) => 62 - m * 8;   // X(mét tính từ mũi) -> toạ độ x
    // thân: mũi radar tròn -> kính chắn gió dốc -> khoang vuông thành gần phẳng -> bụng vuốt lên -> cần đuôi thon
    const skinM = MAT.heliSkin || (MAT.heliSkin = new THREE.MeshStandardMaterial({ map: heliSkin(), color: 0xffffff, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }));
    const body = loftGeo([
      [X(0), 1.2, 1.4, 9.4, 2], [X(0.3), 4.2, 3.6, 9.6, 2.2], [X(0.8), 6.6, 5.4, 10.2, 2.5, 5.6], [X(1.4), 8.2, 7, 11.4, 2.8, 6.6],
      [X(2.1), 9.1, 8.4, 12.4, 3.2, 7.6], [X(2.8), 9.4, 8.4, 12.6, 3.6, 8], [X(5.4), 9.5, 8.4, 12.6, 3.8, 8], [X(7.4), 9.3, 8.2, 12.8, 3.6, 7.8],
      [X(8.4), 8, 6.8, 14, 3, 6.2], [X(9.3), 5.8, 5, 15.4, 2.6, 4.4], [X(10.2), 4.2, 3.9, 16.2, 2.2, 3.6], [X(12.4), 3.2, 3.1, 16.8, 2],
      [X(14.2), 2.6, 2.7, 17.2, 2], [X(15.3), 1.8, 2, 17.6, 2]], 48);
    { const P = body.attributes.position, uv = body.attributes.uv, n = 49;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (62 - P.getX(i)) / 136, i < P.count - 2 ? (i % n) / 48 : 0); }
    K.add(skinM, body, base);
    // gờ nóc che hộp số + 2 động cơ T700 (cửa hút gió tròn phía trước có lưới, ống xả HIRSS chĩa ngang ra sau)
    K.add(hm, loftGeo([[X(2.6), 1.6, 0.6, 21, 2], [X(3.2), 5, 2.6, 21.6, 2.6], [X(4.6), 6, 3.6, 22.4, 3], [X(6.6), 5.6, 3.4, 22.2, 3], [X(8), 2.6, 1.4, 21, 2]], 20), base);
    for (const s2 of [-1, 1]) {
      K.add(hm, loftGeo([[X(3.4), 1.8, 1.8, 0, 2], [X(3.7), 2.6, 2.6, 0, 2.2], [X(6.6), 2.6, 2.6, 0, 2.2], [X(7.4), 2, 2, 0, 2]], 16), at(0, 23.2, s2 * 6.4));
      K.add('steelGray', new THREE.TorusGeometry(2.1, 0.35, 6, 16), at(X(3.42), 23.2, s2 * 6.4, 0, Math.PI / 2, 0));
      K.add('void', new THREE.CircleGeometry(2, 14), at(X(3.4) - 0.2, 23.2, s2 * 6.4, 0, Math.PI / 2, 0));
      K.add('steelDark', new THREE.BoxGeometry(5.6, 2.6, 3.6), at(X(7.9), 23.4, s2 * 8, 0, s2 * 0.45, 0));
      K.add('void', new THREE.PlaneGeometry(2.2, 2), at(X(8.2) - 0.6, 23.4, s2 * 9.9, 0, s2 > 0 ? 0.45 : Math.PI - 0.45, 0));
      // ống hút gió làm mát nhỏ + tay vịn trên nóc
      K.add('steelDark', new THREE.BoxGeometry(3, 0.4, 0.4), at(X(5), 21.6, s2 * 8.4));
    }
    // cột rô-to, đĩa nghiêng + cần đẩy, đầu rô-to đàn hồi 4 tay đòn, 4 lá chính (hơi võng, đầu vuốt, vệt sơn đầu lá)
    const HY = 30, HX = X(4.3);
    K.add('steelGray', new THREE.CylinderGeometry(1.2, 1.5, 5, 12), at(HX, 27, 0));
    K.add('steelGray', new THREE.CylinderGeometry(2.8, 2.8, 0.7, 16), at(HX, 26.2, 0));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.3; K.add('steelDark', new THREE.CylinderGeometry(0.2, 0.2, 3.6, 5), at(HX + Math.cos(a) * 2.2, 28.2, Math.sin(a) * 2.2)); }
    K.add('steelDark', new THREE.CylinderGeometry(2.4, 2.2, 1.8, 12), at(HX, HY, 0));
    K.add('steelDark', new THREE.ConeGeometry(1.6, 1.6, 10), at(HX, HY + 1.7, 0));
    const tipM = MAT.bladeTip || (MAT.bladeTip = new THREE.MeshStandardMaterial({ color: 0xd8c24a, roughness: 0.6 }));
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      K.add('steelDark', new THREE.BoxGeometry(4.6, 1.2, 1.6), at(HX + Math.cos(a) * 3.4, HY, Math.sin(a) * 3.4, 0, -a, 0));
      K.add('steelGray', new THREE.CylinderGeometry(0.5, 0.5, 2.2, 8), at(HX + Math.cos(a) * 3.2, HY - 0.6, Math.sin(a) * 3.2 + 0.6));
      // lá: mặt cắt thuôn dày 0.45, dây cung 4.2 (0.53 m), dài 60, võng dần, 2.4 đơn vị cuối vuốt về sau
      const L2 = 60, bl = new THREE.BoxGeometry(L2, 0.45, 4.2, 24, 1, 1); bl.translate(L2 / 2, 0, 0);
      const P = bl.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), f = x / L2, z = P.getZ(i);
        P.setY(i, P.getY(i) * (z > 0 ? 1.3 : 0.7) - 3.2 * f * f);
        if (x > L2 - 4) P.setZ(i, z - (x - L2 + 4) * 0.3);
      }
      bl.computeVertexNormals();
      const bm = at(HX + Math.cos(a) * 5.6, HY, Math.sin(a) * 5.6, 0, -a, 0);
      K.add(MAT.blade || (MAT.blade = new THREE.MeshStandardMaterial({ color: 0x2b2d2b, roughness: 0.7, metalness: 0.1 })), bl, bm);
      K.add(tipM, new THREE.BoxGeometry(1.2, 0.5, 4.3), new THREE.Matrix4().multiplyMatrices(bm, M4(L2 - 5, -2.75, 0)));
    }
    // cánh đuôi đứng (vuốt sau) + nắp hộp số đuôi, rô-to đuôi 4 lá Ø3.35 m nghiêng 20° bên phải, cánh ổn định ngang
    K.add(hm, plateGeo([[X(13.6), 18.6], [X(14.6), 21], [X(15.6), 30.6], [X(16.3), 31.4], [X(16.6), 29.6], [X(15.9), 17.6], [X(15.1), 15.4]], 1.8), base);
    const TX = X(15.95), TY = 27.4, TZ = 3.4, tr = at(TX, TY, TZ, Math.PI / 2, 0, -0.35);
    K.add('steelDark', new THREE.CylinderGeometry(0.9, 0.9, 2.6, 10), at(TX, TY, 1.8, Math.PI / 2, 0, 0));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4, g2 = new THREE.BoxGeometry(12.6, 0.28, 1.5); g2.translate(7.4, 0, 0);
      K.add('steelDark', g2, new THREE.Matrix4().multiplyMatrices(tr, M4(0, 0, 0, 0, a, 0)));
      K.add(tipM, new THREE.BoxGeometry(1, 0.32, 1.55), new THREE.Matrix4().multiplyMatrices(tr, M4(0, 0, 0, 0, a, 0)).multiply(M4(13, 0, 0)));
    }
    K.add('steelDark', new THREE.CylinderGeometry(1.1, 1.1, 1, 10), tr);
    K.add(hm, plateGeo([[X(14.9), -17.4], [X(14.2), -16.4], [X(14.2), 16.4], [X(14.9), 17.4], [X(15.7), 17.4], [X(15.7), -17.4]], 0.7), at(0, 16.4, 0, Math.PI / 2, 0, 0));
    // kính: 2 tấm chắn gió lớn dốc ~45°, cửa kính buồng lái 2 bên (cửa lái có ô kính nhỏ phía dưới), kính trần, cửa sổ khoang
    for (const s2 of [-1, 1]) {
      // ray trên cửa trượt khoang (kính + viền cửa vẽ trên da thân)
      K.add('steelDark', new THREE.BoxGeometry(26, 0.6, 0.7), at(X(5.1), 19.2, s2 * 9.2));
      // bậc lên buồng lái + khoang
      K.add('steelDark', new THREE.BoxGeometry(3.4, 0.4, 1.6), at(X(2.4), 5, s2 * 9.8));
      // bánh chính: thanh kéo chéo ra trước + giảm chấn đứng dài, càng nối thân, bánh lốp có mâm
      const wx = X(3.2), wz = s2 * 10.8, wy = 2.7;
      K.beam('steelDark', [X(2.2), 7, s2 * 8.2], [wx, wy, wz], 0.9, base);
      K.beam('steelGray', [X(3.5), 11, s2 * 9.6], [wx, wy + 1.2, wz], 1.2, base);
      K.beam('steelDark', [X(4.2), 6.6, s2 * 8.6], [wx, wy, wz], 0.7, base);
      K.add('rubber', new THREE.CylinderGeometry(2.7, 2.7, 1.9, 16), at(wx, wy, wz + s2 * 0.9, Math.PI / 2, 0, 0));
      K.add('steelGray', new THREE.CylinderGeometry(1.4, 1.4, 2, 10), at(wx, wy, wz + s2 * 0.9, Math.PI / 2, 0, 0));
      // đèn hàng hải đầu cánh ổn định / hông: đỏ trái, xanh phải
      K.add(s2 > 0 ? 'lampAmber' : 'lampRed', new THREE.SphereGeometry(0.55, 8, 6), at(X(4.9), 21.2, s2 * 8.6));
    }
    // bánh đuôi trên càng chéo, dao cắt dây trên nóc + dưới bụng, 2 ống pitot trước mũi, ăng-ten, chữ ARMY trên cần đuôi
    const twx = X(12.9);
    K.beam('steelDark', [twx + 3, 13.6, 0], [twx, 1.8, 0], 0.9, base); K.beam('steelDark', [twx - 3, 14.2, 0], [twx, 1.8, 0], 0.6, base);
    K.add('rubber', new THREE.CylinderGeometry(1.8, 1.8, 1.3, 12), at(twx, 1.8, 0, Math.PI / 2, 0, 0));
    K.beam('steelGray', [X(1.8), 20.6, 0], [X(2.7), 22.4, 0], 0.4, base); K.beam('steelGray', [X(0.6), 5.4, 0], [X(1.6), 4, 0], 0.4, base);
    for (const s2 of [-1, 1]) K.add('steelGray', new THREE.CylinderGeometry(0.18, 0.18, 5, 5), at(X(0.3), 12.6, s2 * 3.2, 0, 0, Math.PI / 2));
    K.add('steelDark', new THREE.CylinderGeometry(0.12, 0.25, 7, 4), at(X(8.6), 21.8, 0, 0, 0, -0.5));
    K.add('steelDark', new THREE.BoxGeometry(4, 0.3, 1.4), at(X(9.6), 3.4 + 7, 0));
  }


  function buildNuke(K, group, anim) {
    const L = K.L, S = L.silo, cf = S.f, cr = S.r, HB = S.h, RS = S.shaft, TOP = HB + 3;
    apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'nuke');
    // ---- Bệ bê tông miệng hầm trên gò silo: khoét lỗ giếng phóng + 2 ống xả
    {
      const sh = new THREE.Shape();
      sh.moveTo(cf - S.hf, -(cr - S.hr)); sh.lineTo(cf + S.hf, -(cr - S.hr)); sh.lineTo(cf + S.hf, -(cr + S.hr)); sh.lineTo(cf - S.hf, -(cr + S.hr)); sh.closePath();
      const hole = new THREE.Path(); hole.absarc(cf, -cr, RS, 0, TAU, true); sh.holes.push(hole);
      for (const [vf, vr, hf, hr] of S.vents) {
        const v = new THREE.Path();
        v.moveTo(cf + vf - hf, -(cr + vr - hr)); v.lineTo(cf + vf - hf, -(cr + vr + hr)); v.lineTo(cf + vf + hf, -(cr + vr + hr)); v.lineTo(cf + vf + hf, -(cr + vr - hr)); v.closePath();
        sh.holes.push(v);
      }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 10, bevelEnabled: false, curveSegments: 20 });
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
      K.add('conc', g, M4(0, TOP - 10, 0, -Math.PI / 2, 0, 0));
      // vạch sơn: viền đỏ NO LONE ZONE quanh nắp + vành vàng đen quanh miệng giếng / ống xả
      const W = 1024, Hh = Math.round(W * S.hr / S.hf);
      const tex = texOf('nlz', W, Hh, (q, w, h) => {
        q.clearRect(0, 0, w, h);
        const P = (f, r) => [(f + S.hf) / (2 * S.hf) * w, (r + S.hr) / (2 * S.hr) * h], k = w / (2 * S.hf);
        q.strokeStyle = 'rgba(176,30,22,0.9)'; q.lineWidth = 4 * k; q.strokeRect(...P(-92, -78), 184 * k, 156 * k);
        q.fillStyle = 'rgba(176,30,22,0.9)'; q.font = `bold ${(5 * k) | 0}px Arial, sans-serif`; q.textAlign = 'center'; q.textBaseline = 'middle';
        for (const [f, r, rot] of [[0, -74, 0], [0, 74, Math.PI], [-88, 0, -Math.PI / 2], [88, 0, Math.PI / 2]]) {
          q.save(); q.translate(...P(f, r)); q.rotate(rot); q.fillText('NO LONE ZONE — TWO-PERSON CONCEPT', 0, 0); q.restore();
        }
        q.lineWidth = 5 * k; q.setLineDash([6 * k, 6 * k]);
        q.strokeStyle = '#d6a51f'; q.beginPath(); q.arc(...P(0, 0), (RS + 4) * k, 0, TAU); q.stroke();
        q.strokeStyle = '#151515'; q.lineDashOffset = 6 * k; q.beginPath(); q.arc(...P(0, 0), (RS + 4) * k, 0, TAU); q.stroke();
        q.setLineDash([]);
        for (const [vf, vr, hf, hr] of S.vents) { q.strokeStyle = '#d6a51f'; q.lineWidth = 3 * k; q.strokeRect(...P(vf - hf - 3, vr - hr - 3), (hf * 2 + 6) * k, (hr * 2 + 6) * k); }
        speckle(q, w, h, 3000, ['rgba(60,56,50,0.5)'], 1, 3, 77);
      });
      K.add(MAT.nlz || (MAT.nlz = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })),
        new THREE.PlaneGeometry(S.hf * 2, S.hr * 2), M4(cf, TOP + 0.05, cr, -Math.PI / 2, 0, 0));
    }
    // ---- Gờ viền bệ (chừa chỗ 2 cặp ray), rãnh thoát nước 4 góc, nắp hố kỹ thuật thép có tay nắm, vòng neo cẩu
    for (const s of [-1, 1]) K.cbox('concDark', cf + s * (S.hf - 2), TOP + 1.2, cr, 4, 2.6, S.hr * 2, 0.8);
    K.cbox('concDark', cf, TOP + 1.2, cr - S.hr + 2, S.hf * 2 - 8, 2.6, 4, 0.8);
    for (const [a, b] of [[-S.hf + 4, -72], [-46, 46], [72, S.hf - 4]]) K.cbox('concDark', cf + (a + b) / 2, TOP + 1.2, cr + S.hr - 2, b - a, 2.6, 4, 0.8);
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const f = cf + a * (S.hf - 12), r = cr + b * (S.hr - 12);
      K.box('void', f, TOP + 0.05, r, 7, 0.2, 7);
      for (let k = -3; k <= 3; k += 1.5) K.box('steelDark', f + k, TOP + 0.3, r, 0.5, 0.5, 7);
    }
    for (const [f, r] of [[cf - 82, cr + 36], [cf + 82, cr + 36], [cf - 82, cr - 30]]) {
      K.box('steelGray', f, TOP + 0.3, r, 14, 0.6, 10);
      for (const s of [-1, 1]) K.box('steelDark', f + s * 4, TOP + 0.9, r, 0.6, 0.8, 4);
    }
    for (const [f, r] of [[cf - 40, cr - 72], [cf + 40, cr - 72], [cf - 92, cr - 72], [cf + 92, cr - 72]]) K.add('steelDark', new THREE.TorusGeometry(1.6, 0.45, 6, 12), M4(f, TOP + 0.5, r, Math.PI / 2, 0, 0));
    // ---- Lòng giếng phóng: thành thép có gân, đèn đỏ, sàn công tác thu gọn, tay cáp, đầu đạn tên lửa đen nhô lên
    const shaftMat = MAT.shaft2 || (MAT.shaft2 = new THREE.MeshStandardMaterial({ color: 0x5d615f, roughness: 0.75, metalness: 0.45, side: THREE.BackSide }));
    K.add(shaftMat, new THREE.CylinderGeometry(RS, RS, TOP + 0.6, 40, 1, true), M4(cf, TOP / 2 - 0.2, cr));
    for (const y of [6, 14, 22, 30]) K.add(shaftMat, new THREE.CylinderGeometry(RS - 0.8, RS - 0.8, 1.2, 40, 1, true), M4(cf, y, cr));
    K.cyl('void', cf, 0.2, cr, RS, RS, 0.4, 40);
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; K.box('steelGray', cf + Math.cos(a) * (RS - 1.6), TOP / 2, cr + Math.sin(a) * (RS - 1.6), 2.4, TOP, 3, -a); }
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; K.box('lampAmber', cf + Math.cos(a) * (RS - 0.7), 2.2, cr + Math.sin(a) * (RS - 0.7), 0.6, 0.8, 2, -a); }
    anim.steam.push([K.W(cf, cr - 14), L.G + TOP - 4]);
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10, c = Math.cos(a), sn = Math.sin(a);
      K.box(k % 2 ? 'lampRed' : 'lampAmber', cf + c * (RS - 0.8), k % 2 ? 9 : 25, cr + sn * (RS - 0.8), 1, 1.6, 3.2, -a);
      if (k % 2) { K.box('yellow', cf + c * (RS - 4), 18, cr + sn * (RS - 4), 7, 1, 16, -a); K.box('steelGray', cf + c * (RS - 4.2), 17.2, cr + sn * (RS - 4.2), 7.4, 0.6, 16.4, -a); }
    }
    const mr = 12.2;
    K.add('icbm', new THREE.CylinderGeometry(mr, mr, 30, 36, 1, true), M4(cf, -9, cr));
    K.cyl('steelDark', cf, 4.4, cr, mr + 0.4, mr + 0.4, 1.6, 36);
    // đầu đạn kiểu Mk-6: nón cụt thẳng, mũi bo tròn, lớp chống nhiệt xám than
    const rv = [[12.2, 0], [10.2, 6], [8.2, 12], [6.2, 18], [4.4, 23], [3.2, 25.4], [1.6, 26.6], [0, 27]].map(([x, y]) => new THREE.Vector2(x, y));
    K.add(MAT.rv || (MAT.rv = new THREE.MeshStandardMaterial({ color: 0x45484b, roughness: 0.55, metalness: 0.3 })), new THREE.LatheGeometry(rv, 36), M4(cf, 6, cr));
    for (const [a, y] of [[0.6, 10], [2.7, 16], [4.4, 12]]) K.beam('steelGray', [cf + Math.cos(a) * (RS - 1), y, cr + Math.sin(a) * (RS - 1)], [cf + Math.cos(a) * (mr + 1), y - 2, cr + Math.sin(a) * (mr + 1)], 1.4);
    K.solid(cf, cr, RS + 2, RS + 2, -2, TOP + 1);
    // ---- 2 ống xả khói từ đáy giếng lên mặt đất: lòng hộp tối, lưới thép chịu nhiệt
    for (const [vf, vr, hf, hr] of S.vents) {
      const f = cf + vf, r = cr + vr;
      K.add(shaftMat, new THREE.BoxGeometry(hf * 2, TOP + 0.6, hr * 2), M4(f, TOP / 2 - 0.2, r));
      K.box('void', f, 0.4, r, hf * 2, 0.4, hr * 2);
      for (let x = -hf + 2; x <= hf - 2; x += 4) K.box('steelDark', f + x, TOP - 0.6, r, 1.2, 2, hr * 2);
      K.box('steelDark', f, TOP - 1.6, r, hf * 2, 1.2, 1.6);
      for (const s of [-1, 1]) { K.box('steelGray', f + s * (hf + 1), TOP + 0.6, r, 2, 1.2, hr * 2 + 4); K.box('steelGray', f, TOP + 0.6, r + s * (hr + 1), hf * 2, 1.2, 2); }
      K.solid(f, r, hf, hr, -2, TOP + 2);
      anim.steam.push([K.W(f, r), L.G + TOP + 2]);
    }
    // ---- Nắp hầm 740 tấn (19.5 x 12.5 x 1.5 m) lăn trên 2 cặp ray, đang mở hé 7 m; dầm ray chìa ra khỏi gò
    const DF = 78, DR = 50, DT = 12, DOPEN = 76, dr = cr + DOPEN, RY = TOP + 3, RE = cr + S.hr + 92;
    // 2 cặp ray thép tiết diện chữ I (đế, bụng, nấm ray) + kẹp ray bắt bu lông mỗi 1.5 m
    const R0 = cr - S.hr + 6, RZ = (R0 + RE) / 2, RL = RE - R0;
    for (const t of [-64, -52, 52, 64]) {
      K.box('steelDark', cf + t, TOP + 0.4, RZ, 6, 0.8, RL); K.box('steelDark', cf + t, TOP + 1.7, RZ, 1.4, 1.8, RL); K.box('steelGray', cf + t, TOP + 3, RZ, 3.4, 1, RL);
      for (let r = R0 + 4; r < RE - 2; r += 12) for (const s of [-1, 1]) K.box('steelDark', cf + t + s * 3.4, TOP + 0.9, r, 2, 1.2, 3);
    }
    for (const s of [-1, 1]) {
      K.cbox('conc', cf + s * 58, TOP / 2, (cr + S.hr + RE) / 2, 28, TOP, RE - cr - S.hr, 2);
      K.box('hazard', cf + s * 58, TOP / 2, RE + 0.3, 28, TOP, 0.6, 0, 16);
      for (const t of [-6, 6]) K.box('steelGray', cf + s * 58 + t, TOP + 4, RE - 3, 5, 5, 6);   // chặn cuối ray
      K.solid(cf + s * 58, (cr + S.hr + RE) / 2, 14, (RE - cr - S.hr) / 2, 0, TOP + 3);
    }
    {
      const sh = new THREE.Shape();
      sh.moveTo(-DR - 8, 0); sh.lineTo(DR + 8, 0); sh.lineTo(DR, DT); sh.lineTo(-DR, DT); sh.closePath();
      const wedge = new THREE.ExtrudeGeometry(sh, { depth: DF * 2, bevelEnabled: false });
      wedge.translate(0, 0, -DF);
      K.add('steelGray', wedge, M4(cf, RY, dr, 0, -Math.PI / 2, 0));
      K.box('conc', cf, RY + DT / 2 + 0.05, dr, DF * 2 + 0.2, DT + 0.1, DR * 2, 0, 64);
      for (const s of [-1, 1]) { K.box('steelDark', cf + s * (DF + 0.8), RY + DT / 2, dr, 1.6, DT + 1, DR * 2 + 16); K.box('hazard', cf + s * (DF + 1.7), RY + DT / 2, dr, 0.4, DT - 2, DR * 2, 0, 16); }
      for (const t of [-64, -52, 52, 64]) for (const u of [-30, 0, 30]) K.box('steelDark', cf + t, RY - 0.4, dr + u, 6, 2.4, 12);   // giá bánh xe
      // gân thép tăng cứng + hàng bu lông 2 mép trên mặt nắp; 2 kích đẩy thuỷ lực từ dầm ray tới đuôi nắp
      for (const u of [-36, -12, 12, 36]) K.box('steelGray', cf, RY + DT + 0.7, dr + u, DF * 2 - 10, 1.4, 2.4);
      for (let x = -DF + 6; x <= DF - 6; x += 7) for (const u of [-DR + 3, DR - 3]) K.cyl('steelDark', cf + x, RY + DT, dr + u, 0.6, 0.6, 0.9, 6);
      for (const s of [-1, 1]) {
        const f = cf + s * 30, r1 = dr + DR + 8, r2 = RE - 22;
        K.add('steelGray', new THREE.CylinderGeometry(1.3, 1.3, r2 - r1, 10), M4(f, RY + 5, (r1 + r2) / 2, Math.PI / 2, 0, 0));
        K.add('yellow', new THREE.CylinderGeometry(3, 3, 20, 14), M4(f, RY + 5, r2 + 10, Math.PI / 2, 0, 0));
        K.cbox('steelDark', f, RY + 4, RE - 6, 10, 8, 6, 0.6);
        K.cbox('steelDark', f, RY + 4, r1 - 2, 8, 6, 4, 0.6);
      }
      for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.box('steelDark', cf + a * (DF - 10), RY + DT + 2, dr + b * (DR - 10), 6, 4, 6);   // tai cẩu
      K.add(decalT('lid_sten', texOf('lid_sten', 512, 256, (q, w, h) => {
        q.clearRect(0, 0, w, h); q.fillStyle = 'rgba(232,228,214,0.85)'; q.font = 'bold 40px Arial, sans-serif'; q.textAlign = 'center'; q.textBaseline = 'middle';
        q.fillText('LAUNCH COMPLEX 7', w / 2, h * 0.35); q.font = 'bold 24px Arial, sans-serif'; q.fillText('NO STEP — CLOSURE DOOR', w / 2, h * 0.7);
      })), new THREE.PlaneGeometry(120, 60), M4(cf, RY + DT + 0.15, dr, -Math.PI / 2, 0, 0));
      K.solid(cf, dr, DF + 2, DR + 8, RY - 2, RY + DT + 4);
    }
    // ---- Đèn hiệu xoay 4 góc bệ + ăng-ten chống nổ (ống thu vào được) + cột UHF đèn đỏ nháy
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const f = cf + a * (S.hf - 6), r = cr + b * (S.hr - 6);
      K.cyl('steelDark', f, TOP, r, 2.2, 2.6, 3, 10);
      K.add(anim.beacon, new THREE.CylinderGeometry(1.8, 1.8, 3.4, 12), M4(f, TOP + 4.7, r));
    }
    // ---- TRUNG TÂM ĐIỀU KHIỂN PHÓNG NGẦM: gò đất 5.5 m (MapGen: L.silo.lcc), mặt tiền bê tông thẳng đứng, cửa chống nổ
    //      lùi sâu trong hốc cửa có mái hắt, 2 tường cánh xiên giữ đất, trên nóc gò: ống thông gió có lọc, cửa thoát hiểm,
    //      ăng-ten HF chống nổ (ống thu vào được), cột UHF đèn đỏ nháy
    {
      const C = S.lcc, ff = C.f + C.hf, W = C.hr, Hh = C.h + 6, DW = 13, DH = 26;
      for (const s of [-1, 1]) K.cbox('conc', ff - 7, Hh / 2 - 2, C.r + s * (W + DW) / 2, 14, Hh + 4, W - DW, 1.2);
      K.cbox('conc', ff - 7, (DH + Hh) / 2 - 1, C.r, 14, Hh - DH + 2, DW * 2, 1.2);
      K.cbox('concDark', ff - 4, Hh + 1.5, C.r, 22, 3, W * 2 + 6, 1);
      K.cbox('concDark', ff + 6, DH + 4, C.r, 14, 3, DW * 2 + 10, 0.8);                    // mái hắt trên cửa
      for (const s of [-1, 1]) K.cbox('concDark', ff + 6, (DH + 4) / 2, C.r + s * (DW + 3.5), 14, DH + 4, 3, 0.6);
      K.box('void', ff - 4, DH / 2, C.r, 0.6, DH, DW * 2);
      K.box('concDark', ff + 5, 0.5, C.r, 18, 1, DW * 2);
      for (const s of [-1, 1]) {
        // cánh cửa chống nổ 2 lớp thép, mở hé, sọc cảnh báo mép
        // cánh mở ra ngoài (bản lề ở mép ô cửa), quay hé 1 rad
        const leaf = new THREE.Matrix4().multiplyMatrices(M4(ff - 3, 0, C.r + s * DW), M4(0, 0, 0, 0, -s * 1.0, 0));
        K.cbox('steelGray', 2.5, DH / 2, -s * DW / 2, 5, DH, DW, 0.4, 0, leaf);
        K.add('hazard', boxGeo(0.4, DH - 2, 1.6, 16), new THREE.Matrix4().multiplyMatrices(leaf, M4(5.2, DH / 2, -s * (DW - 1))));
        for (const y of [5, DH / 2, DH - 5]) K.add('steelDark', new THREE.BoxGeometry(1.2, 2, 3), new THREE.Matrix4().multiplyMatrices(leaf, M4(5.4, y, -s * 1.5)));
        K.box('lampRed', ff - 3.2, DH - 4, C.r + s * (DW - 2), 0.6, 1.6, 1.6);
        // tường cánh xiên giữ đất 2 bên mặt tiền, đỉnh dốc theo ta-luy
        const sh = new THREE.Shape();
        sh.moveTo(0, -2); sh.lineTo(C.run + 6, -2); sh.lineTo(C.run + 6, 3); sh.lineTo(0, Hh - 2); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 10, bevelEnabled: false });
        if (s > 0) g.translate(0, 0, -10);   // bề dày tường luôn về phía trước (che vách đất cắt thẳng của gò)
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
        K.add('conc', g, M4(ff - 10, 0, C.r + s * W, 0, s > 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35, 0));
        K.solid(ff - 10 + Math.sin(0.35) * C.run / 2, C.r + s * (W + C.run / 2), 6, C.run / 2 + 3, -2, Hh * 0.6, s * (Math.PI / 2 - 0.35));
      }
      K.plane(decal('lcc_sign', signTex('lcc_sign', ['LAUNCH CONTROL CENTER', 'AUTHORIZED ENTRY ONLY — TWO-PERSON RULE'], { w: 768, h: 192, bg: '#efece2', fg: '#a3221a' })), ff + 0.2, DH + 10, C.r, 40, 10);
      for (const s of [-1, 1]) { K.box('steelGray', ff + 13, DH + 1, C.r + s * (DW + 2), 3, 2.4, 2.4); K.box('glass', ff + 14.6, DH + 1, C.r + s * (DW + 2), 0.3, 1.6, 1.6); }
      K.add(anim.beacon, new THREE.CylinderGeometry(1.6, 1.6, 3, 10), M4(ff + 6, DH + 7, C.r));
      K.solid(ff - 7, C.r, 8, W, -2, Hh + 3);
      K.solid(ff + 6, C.r, 7, DW + 5, DH + 2, DH + 6);
      // nóc gò: ống thông gió có lọc, cửa thoát hiểm, ăng-ten HF chống nổ, cột UHF
      const top = C.h;
      for (const [f, r] of [[C.f - 20, C.r - 22], [C.f - 20, C.r + 22]]) {
        K.cyl('concDark', f, top - 2, r, 7, 8, 5, 14); K.cyl('steelGray', f, top + 3, r, 4.4, 4.4, 14, 12);
        K.cyl('steelDark', f, top + 17, r, 4.8, 4.8, 3, 12); K.cyl('steelGray', f, top + 20, r, 6.5, 4.4, 4, 14);
        K.solid(f, r, 8, 8, top - 2, top + 25);
      }
      K.cbox('concDark', C.f + 14, top + 1, C.r + 10, 16, 4, 16, 1); K.cyl('steelGray', C.f + 14, top + 3, C.r + 10, 5.5, 5.5, 1.4, 20);
      K.box('steelDark', C.f + 14, top + 4.8, C.r + 10, 8, 0.8, 0.8);
      K.cyl('conc', C.f - 30, top - 1, C.r, 9, 10, 3, 16); K.cyl('steelGray', C.f - 30, top + 2, C.r, 4.6, 4.6, 2, 16);
      K.cyl('steelGray', C.f - 30, top + 4, C.r, 2.2, 2.2, 60, 10); K.cyl('steelWhite', C.f - 30, top + 64, C.r, 0.5, 0.8, 22, 6);
      K.solid(C.f - 30, C.r, 6, 6, top, top + 88);
      const mf = C.f + 4, mr = C.r - 20, MH = 170;
      K.cbox('conc', mf, top + 1, mr, 12, 4, 12, 1);
      K.add('bands', new THREE.CylinderGeometry(1, 1.8, MH, 8, 1, true), M4(mf, top + 3 + MH / 2, mr));
      K.add(anim.blink, new THREE.SphereGeometry(2.2, 10, 6), M4(mf, top + MH + 5, mr));
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4, ax = mf + Math.cos(a) * 26, az = mr + Math.sin(a) * 26, ay = K.earth(ax, az); K.box('concDark', ax, ay + 1, az, 5, 3, 5); K.beam('steelDark', [ax, ay + 3, az], [mf, top + MH * 0.75, mr], 0.35); }
      K.solid(mf, mr, 6, 6, top, top + MH + 8);
    }

    // =====================================================================================================
    // CANH PHÒNG CẤP CĂN CỨ CHIẾN LƯỢC
    // ụ đất chống xe (địa hình) -> rào ngoài -> dải trống (cảm biến, răng rồng) -> rào trong -> đường tuần tra ->
    // khu trong (tháp canh bê tông, lô cốt, phòng không, công trình hỗ trợ) -> rào thứ 3 quanh khu cấm silo
    // =====================================================================================================
    const oF = L.hu - 36, oR = L.hv - 36, iF = L.hu - 62, iR = L.hv - 62, G = 44, CZ = L.hu - 49, CR = L.hv - 49;
    const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
    // cửa sổ trên mặt tường (base: gốc tại mặt tường, +z hướng ra ngoài): kính lùi vào, khung trên, bậu dưới nhô ra,
    // 2 khung cạnh, đố giữa khi cửa rộng
    const win = (base, x, y, w, h) => {
      K.add('glass', new THREE.PlaneGeometry(w, h), mul(base, M4(x, y, 0.12)));
      K.add('steelDark', new THREE.BoxGeometry(w + 1.2, 0.8, 0.7), mul(base, M4(x, y + h / 2 + 0.4, 0.3)));
      K.add('concDark', new THREE.BoxGeometry(w + 2, 0.7, 1.6), mul(base, M4(x, y - h / 2 - 0.35, 0.7)));
      for (const s2 of [-1, 1]) K.add('steelDark', new THREE.BoxGeometry(0.7, h, 0.6), mul(base, M4(x + s2 * (w / 2 + 0.35), y, 0.3)));
      if (w > 7) K.add('steelDark', new THREE.BoxGeometry(0.5, h, 0.4), mul(base, M4(x, y, 0.25)));
    };
    // cục điều hoà treo tường: vỏ, lưới quạt tròn, giá đỡ
    const acUnit = (base, x, y) => {
      K.cbox('steelWhite', x, y, 1.8, 6, 4.6, 3.4, 0.3, 0, base);
      K.add('void', new THREE.CircleGeometry(1.7, 14), mul(base, M4(x + 0.8, y, 3.52)));
      for (const s2 of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(0.4, 0.4, 3.6), mul(base, M4(x + s2 * 2.4, y - 2.6, 1.8)));
    };
    // buồng gác chống đạn (w x d, cao 3 m): chân bê tông, vách thép dưới, dải kính bao quanh có đố, mái đua có đèn, cửa,
    // điều hoà, ăng-ten
    const booth = (f, r, ry, w, d) => {
      const base = M4(f, 0, r, 0, ry, 0);
      K.cbox('concDark', 0, 0.8, 0, w + 4, 1.6, d + 4, 0.4, 0, base);
      K.cbox('steelWhite', 0, 6, 0, w, 9, d, 0.6, 0, base);
      for (const [x, z, ww, rot] of [[0, d / 2, w - 3, 0], [0, -d / 2, w - 3, Math.PI], [w / 2, 0, d - 3, Math.PI / 2], [-w / 2, 0, d - 3, -Math.PI / 2]]) {
        const wb = mul(base, M4(x, 0, z, 0, rot, 0)), n = Math.max(1, Math.round(ww / 6));
        for (let i = 0; i < n; i++) win(wb, -ww / 2 + (i + 0.5) * ww / n, 14.4, ww / n - 1.2, 7);
      }
      for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.add('steelDark', new THREE.BoxGeometry(1.2, 8, 1.2), mul(base, M4(x * w / 2, 14.4, z * d / 2)));
      K.cbox('steelWhite', 0, 19.4, 0, w + 1, 2, d + 1, 0.4, 0, base);
      K.cbox('steelGray', 0, 21.2, 0, w + 6, 1.4, d + 6, 0.4, 0, base);
      K.add('lampAmber', new THREE.BoxGeometry(3, 0.5, 1.4), mul(base, M4(w / 2 + 1.5, 20.3, 0)));
      K.add('steelGray', new THREE.BoxGeometry(5, 15, 0.4), mul(base, M4(-w / 4, 9, -d / 2 - 0.2)));
      acUnit(mul(base, M4(0, 0, -d / 2, 0, Math.PI, 0)), w / 4, 6);
      K.add('steelGray', new THREE.CylinderGeometry(0.15, 0.25, 16, 4), mul(base, M4(w / 2 - 1, 29, d / 2 - 1)));
      K.solid(f, r, Math.max(w, d) / 2 + 2, Math.max(w, d) / 2 + 2, 0, 23);
    };
    // cột đèn chiếu sáng: cột côn, cần vươn cong, chao đèn kiểu cổ ngỗng có kính đèn
    const lamp = (f, r, ang) => {
      const base = M4(f, 0, r, 0, -ang, 0);
      K.cbox('concDark', 0, 1, 0, 4, 2, 4, 0.4, 0, base);
      K.add('steelGray', new THREE.CylinderGeometry(0.6, 1.2, 66, 12), mul(base, M4(0, 35, 0)));
      K.add('steelGray', new THREE.CylinderGeometry(1.5, 1.5, 3, 12), mul(base, M4(0, 3.5, 0)));   // đế bích + hộp cửa kiểm tra
      K.add('steelGray', new THREE.SphereGeometry(0.62, 10, 6, 0, TAU, 0, Math.PI / 2), mul(base, M4(0, 68, 0)));
      // cần đèn ống thép uốn cong liền từ đỉnh cột, chao đèn hình mai rùa dẹt, kính khuếch tán phía dưới
      const arm = new THREE.QuadraticBezierCurve3(v3(0, 66, 0), v3(0.4, 71, 0), v3(10.5, 71.2, 0));
      K.add('steelGray', new THREE.TubeGeometry(arm, 12, 0.38, 8, false), base);
      K.add('steelDark', new THREE.SphereGeometry(1, 14, 8), mul(base, M4(13, 71.2, 0, 0, 0, 0, 3.2, 0.75, 1.5)));
      K.add('glass', new THREE.SphereGeometry(1, 12, 6, 0, TAU, Math.PI / 2, Math.PI / 2), mul(base, M4(13.2, 70.9, 0, 0, 0, 0, 2.4, 0.5, 1.1)));
      K.solid(f, r, 2, 2, 0, 72);
    };
    fence(K, -oF, -oR, oF, -oR, -1, 17, true); fence(K, -oF, oR, oF, oR, 1, 17, true); fence(K, -oF, -oR, -oF, oR, -1, 17, true);
    fence(K, oF, -oR, oF, -G, 1, 17, true); fence(K, oF, G, oF, oR, 1, 17, true);
    fence(K, -iF, -iR, iF, -iR, -1, 15, true); fence(K, -iF, iR, iF, iR, 1, 15, true); fence(K, -iF, -iR, -iF, iR, -1, 15, true);
    fence(K, iF, -iR, iF, -G, 1, 15, true); fence(K, iF, G, iF, iR, 1, 15, true);
    // cọc cảm biến vi sóng trong dải trống
    const sensor = (f, r) => { K.cyl('steelGray', f, 0, r, 0.6, 0.6, 9, 6); K.cbox('steelWhite', f, 10, r, 3, 3, 3, 0.4); };
    for (let r = -CR + 40; r < CR - 20; r += 90) { sensor(-CZ, r); if (Math.abs(r) > G + 20) sensor(CZ, r); }
    for (let f = -CZ + 40; f < CZ; f += 90) { sensor(f, -CR); sensor(f, CR); }
    // răng rồng 2 hàng giữa 2 lớp rào mặt trước
    const tooth = new THREE.ConeGeometry(4.2, 7, 4);
    for (const s of [-1, 1]) for (let r = G + 14; r < iR - 6; r += 13) for (const [k, f] of [[0, CZ - 6], [1, CZ + 6]]) {
      K.add('concDark', tooth.clone(), M4(f, 3.5, s * (r + k * 6), 0, Math.PI / 4, 0));
      K.cbox('concDark', f, 0.4, s * (r + k * 6), 8, 1.2, 8, 0.4);
    }
    for (const s of [-1, 1]) K.solid(CZ, s * (G + 14 + (iR - G - 20) / 2), 10, (iR - G - 20) / 2, 0, 7);
    // cột đèn chiếu sáng dọc rào trong
    for (let f = -iF + 20; f <= iF - 20; f += 120) for (const s of [-1, 1]) lamp(f, s * (iR - 6), -s * Math.PI / 2);
    for (let r = -iR + 60; r <= iR - 60; r += 120) lamp(-iF + 6, r, 0);
    for (const [f, r, ry] of [[0, -oR - 0.6, Math.PI], [0, oR + 0.6, 0], [-oF - 0.6, 0, -Math.PI / 2], [oF + 0.6, -G - 40, Math.PI / 2], [oF + 0.6, G + 40, Math.PI / 2],
      [-200, -oR - 0.6, Math.PI], [200, oR + 0.6, 0], [200, -oR - 0.6, Math.PI], [-200, oR + 0.6, 0]]) K.plane(warnPlate(), f, 10, r, 18, 6, ry);

    // ---- CỔNG KIỂM SOÁT (ECP): cổng ngoài -> khoang khoá (chông lốp, barie nêm bật lên) -> cổng trong ->
    //      nhà kiểm soát có mái che 2 làn xe, đảo giữa có chốt gác, tường chữ T 2 bên làn, biển STOP / 100% ID CHECK
    const gateLeaf = (f, s, H) => {
      K.cyl('steelGray', f, 0, s * G, 1.2, 1.2, H + 3, 8);
      const leaf = new THREE.Matrix4().multiplyMatrices(M4(f, 0, s * G), M4(0, 0, 0, 0, s * 1.3, 0));
      const lg = new THREE.PlaneGeometry(42, H), luv = lg.attributes.uv;
      for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 21, luv.getY(i) * H / 2);
      K.add(meshFenceMat(), lg, new THREE.Matrix4().multiplyMatrices(leaf, M4(0, H / 2 + 1, -s * 21, 0, Math.PI / 2, 0)));
      for (const [y0, y1, z0, z1] of [[1, 1, 0, 42], [H + 1, H + 1, 0, 42], [1, H + 1, 42, 42], [1, H + 1, 0, 42]]) K.beam('steelGray', [0, y0, -s * z0], [0, y1, -s * z1], 0.8, leaf);
    };
    for (const s of [-1, 1]) { gateLeaf(oF, s, 16); gateLeaf(iF, s, 14); }
    {
      // dải chông lốp + barie nêm trong khoang khoá giữa 2 cổng
      for (let r = -G + 4; r <= G - 4; r += 3) K.add('steelDark', new THREE.ConeGeometry(0.7, 2, 4), M4(CZ + 6, 1, r));
      K.box('steelDark', CZ + 6, 0.3, 0, 4, 0.6, G * 2 - 4);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(16, 0); sh.lineTo(16, 7); sh.lineTo(3, 7); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: G * 2 - 8, bevelEnabled: false }); g.translate(-8, 0, -(G - 4));
      K.add('yellow', g, M4(CZ - 6, 0, 0, 0, Math.PI, 0));
      for (let z = -G + 6; z <= G - 6; z += 4) K.box('hazard', CZ - 8.6, 4, z, 0.4, 6, 2, 0, 0, 0, 0.5);
      K.solid(CZ - 6, 0, 8, G - 4, 0, 7);
      K.plane(decal('stop_sign', signTex('stop_sign', ['STOP', 'SECURITY CHECKPOINT — HALT AND IDENTIFY'], { w: 768, h: 256, bg: '#b52a1e', fg: '#ffffff', border: '#ffffff' })), oF + 1, 13, -G - 6, 18, 6.5);
      // nhà kiểm soát: mái che thép trên cột, đèn dưới mái, đảo giữa có chốt gác kính chống đạn, 2 làn
      const cf0 = iF - 46;
      for (const f of [cf0 - 18, cf0 + 18]) for (const r of [-G + 2, 0, G - 2]) K.cyl('steelGray', f, 0, r, 1.4, 1.4, 34, 8);
      K.cbox('steelWhite', cf0, 36, 0, 52, 4, G * 2 + 12, 0.6);
      K.box('hazard', cf0 + 26.4, 36, 0, 0.6, 3, G * 2 + 10);
      for (const r of [-G + 14, G - 14]) for (const f of [cf0 - 12, cf0 + 12]) K.box('lampAmber', f, 33.8, r, 8, 0.4, 3);
      K.cbox('conc', cf0, 1.2, 0, 50, 2.4, 14, 0.6);
      booth(cf0, 0, 0, 16, 10);
      K.solid(cf0, 0, 25, 7, 0, 24);
      K.plane(decal('id_sign', signTex('id_sign', ['100% ID CHECK', 'ALL VEHICLES SUBJECT TO SEARCH'], { w: 768, h: 192, bg: '#1d2a3a', fg: '#ffffff', fg2: '#e8c34a', border: '#d6a51f' })), cf0 + 26.8, 31, 0, 44, 11);
      // tường chữ T 2 bên làn xe
      const twall = (f0, r0, f1, r1) => {
        const len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0), n = Math.max(1, Math.round(len / 12.4));
        const base = M4(f0, 0, r0, 0, -ang, 0);
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * len / n;
          K.cbox('conc', x, 2, 0, 11.8, 4, 10, 0.6, 0, base);
          K.cbox('conc', x, 16, 0, 11.8, 26, 2.4, 0.5, 0, base);
        }
        K.solid((f0 + f1) / 2, (r0 + r1) / 2, len / 2, 5, 0, 30, ang);
      };
      for (const s of [-1, 1]) twall(cf0 - 40, s * (G + 8), iF - 4, s * (G + 8));
    }

    // ---- KHU CẤM QUANH SILO: rào thứ 3 có cổng gác riêng
    {
      const f0 = S.f - S.hf - S.run - 10, f1 = S.f + S.hf + S.run + 10, r0 = S.r - S.hr - S.run - 10, r1 = S.r + S.hr + 126, g2 = 30;
      fence(K, f0, r0, f1, r0, -1, 15, true); fence(K, f0, r1, f1, r1, 1, 15, true); fence(K, f0, r0, f0, r1, -1, 15, true);
      fence(K, f1, r0, f1, S.r - g2, 1, 15, true); fence(K, f1, S.r + g2, f1, r1, 1, 15, true);
      booth(f1 - 14, S.r + g2 + 14, Math.PI / 2, 16, 14);
      K.box('hazard', f1 + 2, 6, S.r + g2 + 2, 4, 12, 4, 0, 16);
      K.add('bands', new THREE.BoxGeometry(2.4, 60, 2.4), M4(f1 + 2, 40, S.r + g2 - 2, 0.2, 0, 0));
      K.plane(decal('excl_sign', signTex('excl_sign', ['EXCLUSION AREA', 'NO LONE ZONE — TWO-PERSON CONCEPT ENFORCED'], { w: 768, h: 192, bg: '#efece2', fg: '#a3221a' })), f1 + 0.7, 9, S.r - g2 - 16, 22, 5.5);
    }

    // ---- THÁP CANH KHUNG THÉP: 4 cột thép hộp trên chân bê tông, giằng ngang + giằng chéo mỗi tầng, sàn có lan can bao quanh,
    //      cabin kín (tấm giáp dưới, kính chống đạn nghiêng ra ngoài có đố), mái đua, đèn pha, loa báo động, súng máy,
    //      cầu thang thép 4 đợt gấp khúc có chiếu nghỉ + tay vịn phía sau
    const tower = (tf, tr) => {
      const a = Math.atan2(-tr, -tf), H = 64, W = 22, h2 = W / 2, base = M4(tf, 0, tr, 0, -a, 0);
      for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        K.cbox('concDark', x * h2, 1.5, z * h2, 6, 3, 6, 0.4, 0, base);
        K.add('olive', new THREE.BoxGeometry(2.2, H, 2.2), mul(base, M4(x * h2, H / 2 + 3, z * h2)));
      }
      for (let y = 8; y < H; y += 14) for (const [p0, p1] of [[[-h2, -h2], [h2, -h2]], [[h2, -h2], [h2, h2]], [[h2, h2], [-h2, h2]], [[-h2, h2], [-h2, -h2]]]) {
        K.beam('olive', [p0[0], y, p0[1]], [p1[0], y, p1[1]], 1, base);
        K.beam('olive', [p0[0], y, p0[1]], [p1[0], y + 14, p1[1]], 0.7, base);
        K.beam('olive', [p1[0], y, p1[1]], [p0[0], y + 14, p0[1]], 0.7, base);
      }
      const D = h2 + 7, top = H + 3;
      K.cbox('olive', 0, top + 0.8, 0, D * 2, 1.6, D * 2, 0.3, 0, base);
      for (let k = -D; k <= D; k += 6) for (const [x, z] of [[k, -D], [k, D], [-D, k], [D, k]]) K.add('steelGray', new THREE.BoxGeometry(0.5, 8.4, 0.5), mul(base, M4(x, top + 5.8, z)));
      for (const y of [top + 5.4, top + 9.8]) for (const [x, z, w2, d2] of [[0, -D, D * 2, 0.5], [0, D, D * 2, 0.5], [-D, 0, 0.5, D * 2], [D, 0, 0.5, D * 2]]) K.add('steelGray', new THREE.BoxGeometry(w2, 0.5, d2), mul(base, M4(x, y, z)));
      // cabin
      const C = 10, cy0 = top + 1.6;
      K.cbox('oliveDark', 0, cy0 + 5, 0, C * 2, 10, C * 2, 0.5, 0, base);
      for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const wb = mul(base, mul(M4(0, 0, 0, 0, rot, 0), M4(0, cy0 + 14.5, C + 0.6, -0.16, 0, 0)));
        K.add('glass', new THREE.PlaneGeometry(C * 2 - 1, 9), wb);
        for (const x of [-C + 0.5, -C / 3, C / 3, C - 0.5]) K.add('steelDark', new THREE.BoxGeometry(0.8, 9.4, 0.6), mul(wb, M4(x, 0, 0.2)));
        K.add('steelDark', new THREE.BoxGeometry(C * 2, 0.8, 1), mul(wb, M4(0, -4.7, 0.3)));
      }
      K.cbox('olive', 0, cy0 + 20, 0, C * 2 + 1, 2, C * 2 + 1, 0.4, 0, base);
      K.cbox('olive', 0, cy0 + 21.6, 0, C * 2 + 10, 1.4, C * 2 + 10, 0.4, 0, base);
      K.add('steelDark', new THREE.CylinderGeometry(0.4, 0.4, 10, 6), mul(base, M4(C + 4, cy0 + 12, 0, 0, 0, Math.PI / 2)));
      K.add('steelGray', new THREE.ConeGeometry(1.6, 3.4, 10, 1, true), mul(base, M4(C - 2, cy0 + 24.6, C - 2, Math.PI / 2, 0, 0)));
      K.add('steelGray', new THREE.CylinderGeometry(0.2, 0.35, 24, 5), mul(base, M4(-C + 2, cy0 + 34, C - 2)));
      K.add('steelDark', new THREE.CylinderGeometry(2, 2.4, 3, 10), mul(base, M4(C - 3, cy0 + 23.8, -C + 3)));
      const sp = new THREE.Vector3(C - 3, cy0 + 28, -C + 3).applyMatrix4(base);
      anim.search.push({ x: sp.x, y: sp.y, z: sp.z, a0: -a });
      // cầu thang thép 4 đợt gấp khúc dựng ngoài khung tháp (phía -X cục bộ): 4 cột riêng, chiếu nghỉ ở 2 đầu, mỗi đợt
      // 2 dầm cốn chữ C + bậc lưới thép (cao ~18 cm, sâu ~28 cm), tay vịn 2 bên có cột, chiếu nghỉ nối vào chân tháp bằng dầm,
      // đợt cuối lên thẳng mép sàn, cabin có cửa thép mở ra phía cầu thang
      const deck = top + 1.6, rise = deck / 4, run = h2 - 1, xs = -D - 3.4, sw = 4.6, zl = run + 3.2, nst = Math.round(rise / 1.45);
      for (const z of [-zl - 2.8, zl + 2.8]) for (const dx of [-sw / 2 - 0.6, sw / 2 + 0.6]) K.add('olive', new THREE.BoxGeometry(1, deck + 4, 1), mul(base, M4(xs + dx, (deck + 4) / 2, z)));
      for (let k = 0; k < 4; k++) {
        const z0 = k % 2 ? run : -run, z1 = -z0, y0 = k * rise, y1 = y0 + rise, sg = Math.sign(z1);
        for (const dx of [-sw / 2, sw / 2]) {
          K.beam('olive', [xs + dx, y0 - 0.6, z0], [xs + dx, y1 - 0.6, z1], 0.9, base);
          K.beam('yellow', [xs + dx * 1.1, y0 + 6.6, z0], [xs + dx * 1.1, y1 + 6.6, z1], 0.35, base);
          for (let i = 0; i <= 3; i++) { const t = i / 3; K.add('steelGray', new THREE.BoxGeometry(0.3, 6.6, 0.3), mul(base, M4(xs + dx * 1.1, y0 + rise * t + 3.3, z0 + (z1 - z0) * t))); }
        }
        for (let i = 0; i < nst; i++) { const t = (i + 0.5) / nst; K.add('steelDark', new THREE.BoxGeometry(sw, 0.35, Math.abs(z1 - z0) / nst + 0.3), mul(base, M4(xs, y0 + rise * (i + 1) / nst - 0.2, z0 + (z1 - z0) * t))); }
        if (k < 3) {
          // chiếu nghỉ lưới thép + lan can 3 mặt + dầm nối vào cột tháp
          const lz = sg * zl;
          K.add('steelDark', new THREE.BoxGeometry(sw + 1.6, 0.5, 5.8), mul(base, M4(xs, y1 - 0.25, lz)));
          K.add('yellow', new THREE.BoxGeometry(0.35, 0.35, 5.8), mul(base, M4(xs - sw / 2 - 0.6, y1 + 6.6, lz)));
          K.add('yellow', new THREE.BoxGeometry(sw + 1.6, 0.35, 0.35), mul(base, M4(xs, y1 + 6.6, lz + sg * 2.9)));
          K.add('steelGray', new THREE.BoxGeometry(sw + 1.6, 0.3, 0.3), mul(base, M4(xs, y1 + 3.3, lz + sg * 2.9)));
          K.beam('steelDark', [xs + sw / 2 + 0.6, y1 - 0.6, lz], [-h2, y1 - 0.6, sg * h2], 0.8, base);
        }
      }
      { const w2 = 3.4 + sw / 2 + 0.8;
        K.add('steelDark', new THREE.BoxGeometry(w2, 0.5, 5.8), mul(base, M4(-D - w2 / 2, deck - 0.25, -zl)));
        K.add('yellow', new THREE.BoxGeometry(w2, 0.35, 0.35), mul(base, M4(-D - w2 / 2, deck + 6.6, -zl - 2.9)));
        K.add('yellow', new THREE.BoxGeometry(0.35, 0.35, 5.8), mul(base, M4(-D - w2, deck + 6.6, -zl))); }
      K.add('steelGray', new THREE.BoxGeometry(0.6, 15, 4.6), mul(base, M4(-C - 0.4, cy0 + 7.5, C - 5)));
      K.add('steelDark', new THREE.BoxGeometry(0.5, 0.5, 1.6), mul(base, M4(-C - 0.9, cy0 + 7, C - 7)));
      K.solid(tf, tr, D, D, 0, cy0 + 24);
    };
    for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -240], [-iF + 38, iR - 38], [-iF + 38, -iR + 38], [iF - 28, G + 40], [iF - 28, -G - 40], [-iF + 30, 0], [-62, iR - 32], [-150, -iR + 32]]) tower(f, r);

    // ---- LÔ CỐT BÊ TÔNG lục giác: lỗ châu mai quanh thân, bao cát trên nóc, hào giao thông dẫn vào
    // Mỗi mặt tường lục giác là 1 tấm bê tông dày 6 (0.75 m) khoét lỗ châu mai: miệng ngoài rộng 7.2 x 3.2, thu loe dần
    // vào khe bắn trong 3.6 x 1.4 (4 mặt loe nghiêng như lô cốt thật), cuối khe tối + tấm chắn thép trượt
    const pillbox = (f, r) => {
      const R = 20, T = 6, HH = 14, ap = R * Math.cos(Math.PI / 6), side = R, up = v3(0, 1, 0);
      for (let k = 0; k < 6; k++) {
        const ph = k * Math.PI / 3 + Math.PI / 6, n = v3(Math.cos(ph), 0, Math.sin(ph)), t = v3(-Math.sin(ph), 0, Math.cos(ph));
        const fm = new THREE.Matrix4().makeBasis(t, up, n.clone().negate()).setPosition(f + n.x * ap, 0, r + n.z * ap);
        const sh = new THREE.Shape(); sh.moveTo(-side / 2, 0); sh.lineTo(side / 2, 0); sh.lineTo(side / 2, HH); sh.lineTo(-side / 2, HH); sh.closePath();
        const ow = 3.6, oy0 = 7.4, oy1 = 10.6, iw = 1.8, iy0 = 8.4, iy1 = 9.8;
        const hole = new THREE.Path(); hole.moveTo(-ow, oy0); hole.lineTo(-ow, oy1); hole.lineTo(ow, oy1); hole.lineTo(ow, oy0); hole.closePath(); sh.holes.push(hole);
        const wg = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false });
        { const uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64); }
        K.add('conc', wg, fm);
        // 4 mặt loe (2 chiều quấn để luôn thấy), đáy loe có bậc thoát nước
        const O = [[-ow, oy0], [ow, oy0], [ow, oy1], [-ow, oy1]], I = [[-iw, iy0], [iw, iy0], [iw, iy1], [-iw, iy1]], pos = [], uvs = [];
        for (let q = 0; q < 4; q++) {
          const q2 = (q + 1) % 4, A = [...O[q], 0], B = [...O[q2], 0], C = [...I[q2], T - 0.4], D = [...I[q], T - 0.4];
          for (const tri of [[A, B, C], [A, C, D], [A, C, B], [A, D, C]]) for (const P of tri) { pos.push(...P); uvs.push((P[0] + P[1]) / 16, P[2] / 16); }
        }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); sg.computeVertexNormals();
        K.add('concDark', sg, fm);
        K.add('void', new THREE.PlaneGeometry(iw * 2 + 0.4, iy1 - iy0 + 0.4), new THREE.Matrix4().multiplyMatrices(fm, M4(0, (iy0 + iy1) / 2, T - 0.35, 0, Math.PI, 0)));
        K.add('steelDark', new THREE.BoxGeometry(iw * 2 + 1, 0.9, 0.3), new THREE.Matrix4().multiplyMatrices(fm, M4(0, iy1 - 0.1, T - 0.6)));
        if (k % 2 === 0) K.add('steelDark', new THREE.CylinderGeometry(0.26, 0.26, 3.2, 6), new THREE.Matrix4().multiplyMatrices(fm, M4(0, (iy0 + iy1) / 2 - 0.1, T - 1.8, Math.PI / 2, 0, 0)));
      }
      K.add('concDark', new THREE.CylinderGeometry(R + 2.4, R + 2.4, 3, 6), M4(f, 15.5, r, 0, -Math.PI / 6, 0));
      K.add('concDark', new THREE.CylinderGeometry(R + 1.6, R + 3.2, 2.2, 6), M4(f, 1.1, r, 0, -Math.PI / 6, 0));   // móng loe chân lô cốt
      // hào giao thông lót bao cát dẫn vào cửa sau, lưới nguỵ trang phủ nóc, ăng-ten
      const ia = Math.atan2(-r, -f) + Math.PI, ex = f + Math.cos(ia) * 21, ez = r + Math.sin(ia) * 21, px = -Math.sin(ia), pz = Math.cos(ia);
      for (const s2 of [-1, 1]) sandbags(K, ex + px * s2 * 6, ez + pz * s2 * 6, ex + Math.cos(ia) * 22 + px * s2 * 6, ez + Math.sin(ia) * 22 + pz * s2 * 6, 3, 0);
      camoNet(K, M4(f, 0, r, 0, 0.4, 0), 50, 50, 17.5, -8);
      K.cyl('steelGray', f + 8, 17, r + 8, 0.2, 0.3, 20, 5);
      for (let k = 0; k < 6; k++) { const a0 = k * Math.PI / 3, a1 = a0 + Math.PI / 3; sandbags(K, f + Math.cos(a0) * 19, r + Math.sin(a0) * 19, f + Math.cos(a1) * 19, r + Math.sin(a1) * 19, 2, 17); }
      K.solid(f, r, 21, 21, 0, 21);
    };
    for (const [f, r] of [[iF - 36, 330], [-iF + 22, 180], [-iF + 22, -120], [iF - 26, -300]]) pillbox(f, r);

    // ---- PHÒNG KHÔNG: 2 tháp pháo tầm gần + radar cảnh giới ăng-ten xoay trên cột giàn
    const ciws = (f, r) => {
      K.cbox('conc', f, 3, r, 30, 6, 30, 1.4);
      K.cyl('steelWhite', f, 6, r, 8, 9, 6, 20);
      K.cbox('steelWhite', f, 17, r, 14, 12, 12, 1.5);
      K.cyl('steelWhite', f - 1, 23, r, 6, 6, 10, 18); K.add('steelWhite', new THREE.SphereGeometry(6, 18, 8, 0, TAU, 0, Math.PI / 2), M4(f - 1, 33, r));
      const gun = M4(f + 7, 16, r, 0, 0, 0.35);
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; K.add('steelDark', new THREE.CylinderGeometry(0.45, 0.45, 24, 6), new THREE.Matrix4().multiplyMatrices(gun, M4(12, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0, 0, -Math.PI / 2))); }
      K.add('steelDark', new THREE.CylinderGeometry(2.2, 2.2, 5, 12), new THREE.Matrix4().multiplyMatrices(gun, M4(1, 0, 0, 0, 0, -Math.PI / 2)));
      K.solid(f, r, 16, 16, 0, 40);
    };
    ciws(S.f - S.hf - 60, 70); ciws(iF - 70, 130);
    {
      const f = -62, r = iR - 100, H = 110;
      K.cbox('conc', f, 2, r, 26, 4, 26, 1);
      for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.beam('steelGray', [f + x * 10, 4, r + z * 10], [f + x * 4, H, r + z * 4], 1.6);
      for (let y = 20; y < H; y += 22) { const w = 10 - (y - 4) / (H - 4) * 6; for (const s2 of [-1, 1]) { K.box('steelGray', f, y, r + s2 * w, w * 2, 1, 1); K.box('steelGray', f + s2 * w, y, r, 1, 1, w * 2); } }
      K.cbox('steelGray', f, H + 2, r, 12, 4, 12, 0.5);
      anim.radar.push({ x: f, y: H + 4, z: r });
      K.solid(f, r, 12, 12, 0, H + 24);
    }

    // ---- CÔNG TRÌNH HỖ TRỢ: nhà xe đặt tên lửa (cửa cuốn), trạm phát điện (ống khói), cụm bồn nhiên liệu (tường rọ đá),
    //      sân trực thăng, nhà lực lượng phản ứng nhanh (tường rọ đá chắn trước)
    const hesco = (f0, r0, f1, r1, layers) => {
      const len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0), n = Math.max(1, Math.round(len / 9));
      const base = M4(f0, 0, r0, 0, -ang, 0);
      for (let ly = 0; ly < (layers || 1); ly++) for (let i = 0; i < n - ly; i++) K.cbox('hesco', (i + 0.5 + ly * 0.5) * len / n, 4.5 + ly * 9, 0, len / n - 0.3, 8.8, 9, 0.5, 0, base);
      K.solid((f0 + f1) / 2, (r0 + r1) / 2, len / 2, 5, 0, 9 * (layers || 1), ang);
    };
    {
      // nhà xe: tường tôn sóng, mái 2 mái, 2 cửa cuốn hướng vào sân (1 cửa mở hé thấy xe đặt tên lửa bên trong)
      // vách tôn sóng trên chân bê tông, mái tôn 2 mái có ô thông gió dọc nóc, máng xối + ống thoát nước 4 góc,
      // dải cửa sổ trên cao mặt sau, 2 cửa cuốn có hộp cuốn + ray dẫn, cửa người đi có mái che + đèn, sân bê tông trước cửa
      const hf = 60, hr = 300, HL = 150, HW = 76, HH = 50, fr0 = hr - HW / 2;
      K.cbox('conc', hf, 4, hr, HL + 1, 8, HW + 1, 0.6);
      K.box('corrTan', hf, HH / 2 + 4, hr, HL, HH - 8, HW);
      const roof = new THREE.Shape(); roof.moveTo(-HW / 2 - 4, 0); roof.lineTo(HW / 2 + 4, 0); roof.lineTo(0, 15); roof.closePath();
      const rg = new THREE.ExtrudeGeometry(roof, { depth: HL + 8, bevelEnabled: false }); rg.translate(0, 0, -(HL + 8) / 2);
      { const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24); }
      K.add('corrGray', rg, M4(hf, HH, hr, 0, -Math.PI / 2, 0));
      K.cbox('steelGray', hf, HH + 15.8, hr, HL - 20, 3, 6, 0.4);
      for (let x = -HL / 2 + 16; x < HL / 2 - 10; x += 8) K.box('louver', hf + x, HH + 15.8, hr, 5, 2, 6.2);
      for (const s2 of [-1, 1]) {
        K.add('steelGray', new THREE.BoxGeometry(HL + 8, 1.4, 1.8), M4(hf, HH - 0.2, hr + s2 * (HW / 2 + 4.4)));
        // ống thoát nước ôm sát tường, đoạn cổ ngỗng nối lên máng xối, cút xả dưới chân + kẹp ống
        for (const x of [-HL / 2 + 1.5, HL / 2 - 1.5]) {
          K.cyl('steelGray', hf + x, 1.2, hr + s2 * (HW / 2 + 0.9), 0.7, 0.7, HH - 6, 8);
          K.beam('steelGray', [hf + x, HH - 4.8, hr + s2 * (HW / 2 + 0.9)], [hf + x, HH - 0.6, hr + s2 * (HW / 2 + 4.2)], 1.3);
          K.beam('steelGray', [hf + x, 1.6, hr + s2 * (HW / 2 + 0.9)], [hf + x, 0.4, hr + s2 * (HW / 2 + 3)], 1.3);
          for (let y = 10; y < HH - 6; y += 12) K.add('steelDark', new THREE.BoxGeometry(1.8, 0.5, 1.4), M4(hf + x, y, hr + s2 * (HW / 2 + 0.6)));
        }
      }
      const back = M4(hf, 0, hr + HW / 2, 0, 0, 0);
      for (let i = 0; i < 9; i++) win(back, -HL / 2 + 12 + i * 15.8, HH - 9, 11, 5);
      for (const [x, open] of [[-36, 0.82], [36, 0]]) {
        const dh = HH - 8, oh = dh * open;
        K.box('shutter', hf + x, oh + (dh - oh) / 2, fr0 - 0.6, 52, dh - oh, 0.6);
        K.box('void', hf + x, oh / 2, fr0 - 0.3, 52, oh, 0.4);
        K.cbox('steelGray', hf + x, dh + 2.4, fr0 - 2, 56, 4.4, 4, 0.5);
        for (const s2 of [-1, 1]) { K.box('steelDark', hf + x + s2 * 27, dh / 2, fr0 - 1.2, 2, dh, 2); K.box('yellow', hf + x + s2 * 30, 6, fr0 - 3, 2.4, 12, 2.4); K.box('hazard', hf + x + s2 * 30, 13, fr0 - 3, 2.6, 2, 2.6, 0, 16); }
        K.box('lampAmber', hf + x, dh + 6, fr0 - 1, 4, 1.2, 1.6);
      }
      for (const x of [-69, 69]) {
        K.box('steelGray', hf + x, 9.5, fr0 - 0.4, 7, 15, 0.6);
        K.cbox('steelGray', hf + x, 18.5, fr0 - 3, 10, 1, 6, 0.3);
        for (const dx of [-4.4, 4.4]) K.beam('steelDark', [hf + x + dx, 14, fr0 - 0.4], [hf + x + dx, 18, fr0 - 5.4], 0.5);
        K.box('lampAmber', hf + x, 17.4, fr0 - 1, 2, 1, 1);
      }
      acUnit(M4(hf + HL / 2, 0, hr, 0, Math.PI / 2, 0), 10, 10); acUnit(M4(hf + HL / 2, 0, hr, 0, Math.PI / 2, 0), -10, 10);
      K.cbox('conc', hf, 0.4, fr0 - 22, HL, 1.2, 44, 0.4);
      K.plane(decal('te_sign', signTex('te_sign', ['TRANSPORTER-ERECTOR BAY', 'NO OPEN FLAME — PROPELLANT AREA'], { w: 768, h: 192, bg: '#efece2', fg: '#a3221a' })), hf, HH - 2, hr - HW / 2 - 1.6, 40, 10, Math.PI);
      K.solid(hf, hr, HL / 2, HW / 2, 0, HH + 14);
      // đầu kéo xe đặt tên lửa (khung xe 6x6 quân sự) thò nửa thân ra khỏi cửa cuốn mở hé
      anim.vehicles.push({ type: 'ARTILLERY', f: hf - 36, r: hr - HW / 2 + 8, a: -Math.PI / 2, chassis: true, hf: 50, hr: 13 });
      // trạm phát điện: nhà bê tông, 2 ống khói, quạt tản nhiệt, trạm biến áp có rào
      const pf = -150, pr = 300;
      // nhà bê tông, lá chắn hút gió, cửa cuốn + cửa người đi, ống dẫn ốp tường, gờ mái, quạt tản nhiệt có lưới trên mái,
      // 2 ống khói có bầu giảm thanh + giá đỡ; bãi biến áp: 3 máy biến áp (lá tản nhiệt, sứ cách điện, bình dầu phụ), rào riêng
      K.cbox('conc', pf, 20, pr, 84, 40, 44, 1.4);
      for (const x of [-30, -6, 18]) { K.box('louver', pf + x, 28, pr - 22.3, 14, 9, 0.6); K.box('steelDark', pf + x, 28, pr - 22.1, 15, 10, 0.3); }
      K.box('shutter', pf + 34, 12, pr - 22.4, 12, 22, 0.6); K.cbox('steelGray', pf + 34, 24, pr - 23.6, 14, 2.4, 2.4, 0.3);
      K.box('steelGray', pf - 40, 9, pr - 22.4, 6, 16, 0.6);
      // 3 ống cáp đứng từ hố cáp dưới đất chui vào tường (có hộp đấu nối), kẹp ống
      for (const x of [-30, -27.6, -25.2]) { K.cyl('steelGray', pf + x, 0, pr - 22.8, 0.7, 0.7, 24, 8); for (const y of [6, 14, 22]) K.add('steelDark', new THREE.BoxGeometry(1.8, 0.5, 1.6), M4(pf + x, y, pr - 22.6)); }
      K.cbox('steelGray', pf - 27.6, 26, pr - 23.4, 9, 6, 2.4, 0.3);
      K.cbox('concDark', pf - 27.6, 0.3, pr - 25, 10, 0.8, 5, 0.2);
      for (const s2 of [-1, 1]) K.cbox('concDark', pf, 41.2, pr + s2 * 21.5, 86, 2.4, 2, 0.4);
      for (const x of [-20, 20]) {
        K.cyl('steelGray', pf + x, 40, pr + 10, 6, 6, 12, 16); K.cyl('steelDark', pf + x, 52, pr + 10, 6.3, 6.3, 1, 16);
        K.cyl('steelGray', pf + x, 53, pr + 10, 3, 4.2, 70, 12); K.cyl('steelDark', pf + x, 123, pr + 10, 3.3, 3.3, 2, 12);
        K.add('lampRed', new THREE.SphereGeometry(0.9, 8, 6), M4(pf + x + 3.4, 124, pr + 10));
        for (const y of [70, 100]) K.add('steelDark', new THREE.TorusGeometry(4, 0.5, 6, 16), M4(pf + x, y, pr + 10, Math.PI / 2, 0, 0));
        anim.steam.push([K.W(pf + x, pr + 10), L.G + 125]);
      }
      for (const x of [-30, -6]) {
        K.cbox('steelGray', pf + x, 43, pr - 8, 16, 4, 16, 0.5);
        K.add('void', new THREE.CircleGeometry(6.4, 18), M4(pf + x, 45.1, pr - 8, -Math.PI / 2, 0, 0));
        for (const rot of [0, Math.PI / 2]) K.box('steelGray', pf + x, 45.3, pr - 8, 13, 0.4, 0.6, rot);
      }
      K.solid(pf, pr, 42, 22, 0, 46);
      const tf2 = pf + 72, tr2 = pr - 28;
      K.cbox('conc', tf2, 0.6, tr2, 26, 1.2, 62, 0.4);
      for (const z of [-20, 0, 20]) {
        K.cbox('steelGray', tf2, 8, tr2 + z, 10, 14, 9, 0.6);
        for (let k = -3; k <= 3; k++) for (const s2 of [-1, 1]) K.box('steelGray', tf2 + s2 * 6, 7.6, tr2 + z + k * 1.3, 2.2, 11, 0.3);
        for (const x of [-3, 0, 3]) { K.cyl('steelGray', tf2 + x, 15, tr2 + z, 0.6, 0.6, 2, 6); for (let j = 0; j < 3; j++) K.cyl('steelWhite', tf2 + x, 17 + j * 1.6, tr2 + z, 1.1, 1.3, 1.2, 8); }
        K.add('steelGray', new THREE.CylinderGeometry(1.8, 1.8, 7, 10), M4(tf2 - 3, 17, tr2 + z, Math.PI / 2, 0, 0));
      }
      fence(K, tf2 - 15, tr2 - 33, tf2 + 15, tr2 - 33, -1, 13); fence(K, tf2 - 15, tr2 + 33, tf2 + 15, tr2 + 33, 1, 13);
      fence(K, tf2 + 15, tr2 - 33, tf2 + 15, tr2 + 33, 1, 13); fence(K, tf2 - 15, tr2 - 33, tf2 - 15, tr2 - 10, -1, 13); fence(K, tf2 - 15, tr2 + 10, tf2 - 15, tr2 + 33, -1, 13);
      K.plane(decal('hv_sign', signTex('hv_sign', ['DANGER', 'HIGH VOLTAGE — KEEP OUT'], { w: 512, h: 256, bg: '#efece2', fg: '#a3221a' })), tf2 - 15.6, 9, tr2 - 20, 9, 4.5, -Math.PI / 2);
      K.solid(tf2, tr2, 13, 30, 0, 22);
      // cụm 3 bồn nhiên liệu đứng, cầu thang, ống dẫn; tường rọ đá 2 lớp bao quanh
      const ff = -40, fr = -iR + 68;
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3, x = ff + Math.cos(a) * 26, z = fr + Math.sin(a) * 26;
        K.add('tankShell', new THREE.CylinderGeometry(15, 15, 40, 32, 1, true), M4(x, 20, z, 0, -a, 0));
        K.cyl('concDark', x, 0, z, 16.4, 16.8, 1.2, 32);
        // mái vòm thấp úp khít miệng bồn: chỏm cầu bán kính 15/sin(0.5) ≈ 31.3, chân chỏm đúng y = 40
        K.add('steelWhite', new THREE.SphereGeometry(15 / Math.sin(0.5), 24, 6, 0, TAU, 0, 0.5), M4(x, 40 - 15 / Math.tan(0.5), z));
        K.cyl('steelGray', x, 39.4, z, 15.4, 15.4, 1.2, 24);
        K.cyl('steelGray', x + 4, 41.5, z, 1, 1, 3, 8); K.cyl('steelDark', x + 4, 44.5, z, 1.8, 1.8, 0.8, 8);
        for (let i = 0; i <= 8; i++) {
          const b = a + i * 0.18, b2 = b + 0.18;
          K.add('steelGray', new THREE.BoxGeometry(0.4, 5, 0.4), M4(x + Math.cos(b) * 14.2, 42.6, z + Math.sin(b) * 14.2));
          if (i < 8) for (const y of [42.8, 45]) K.beam('yellow', [x + Math.cos(b) * 14.2, y, z + Math.sin(b) * 14.2], [x + Math.cos(b2) * 14.2, y, z + Math.sin(b2) * 14.2], 0.35);
        }
        // bảng nhận dạng nhiên liệu (JP-8 + hình thoi NFPA 704) quay ra ngoài
        { const ao = Math.atan2(z - fr, x - ff);
          K.add(decal('jp8', texOf('jp8', 256, 160, (q, w, h) => {
            q.fillStyle = '#f2f0ea'; q.fillRect(0, 0, w, h); q.fillStyle = '#1b1b1b'; q.font = 'bold 54px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle';
            q.fillText('JP-8', w * 0.34, h * 0.5);
            const cx = w * 0.8, cy = h * 0.5, d = 26;
            for (const [dx, dy, col, n] of [[0, -d, '#c8261c', '3'], [-d, 0, '#1f5fb0', '1'], [d, 0, '#e6c41c', '0'], [0, d, '#ffffff', '']]) {
              q.fillStyle = col; q.beginPath(); q.moveTo(cx + dx, cy + dy - d); q.lineTo(cx + dx + d, cy + dy); q.lineTo(cx + dx, cy + dy + d); q.lineTo(cx + dx - d, cy + dy); q.closePath(); q.fill();
              q.strokeStyle = '#111'; q.lineWidth = 2; q.stroke(); q.fillStyle = '#111'; q.font = 'bold 22px Arial'; q.fillText(n, cx + dx, cy + dy + 1);
            }
          })), new THREE.CylinderGeometry(15.08, 15.08, 7.5, 12, 1, true, Math.PI / 2 - ao - 0.4, 0.8), M4(x, 26, z)); }   // mảng cong ôm thân bồn (rộng 12 = 0.8 rad)
        // cầu thang xoắn ôm thân bồn (lên dốc ~45°, 1/3 vòng): bậc lưới thép hàn vào thân, cốn ngoài, tay vịn + cột,
        // chiếu nghỉ trên đỉnh nối vào lan can mái
        { const NS = 26, th0 = a - 2.2, P2 = (th, rr, y) => [x + Math.cos(th) * rr, y, z + Math.sin(th) * rr];
          for (let i = 0; i < NS; i++) {
            const t = (i + 0.5) / NS, th = th0 + 2.2 * t, y = 40 * (i + 1) / NS;
            const m = M4(...P2(th, 17.4, y - 0.2), 0, -th, 0);
            K.add('steelDark', new THREE.BoxGeometry(4.6, 0.35, 1.7), m);
          }
          for (let i = 0; i < 8; i++) {
            const t0 = i / 8, t1 = (i + 1) / 8, a0 = th0 + 2.2 * t0, a1 = th0 + 2.2 * t1;
            K.beam('steelDark', P2(a0, 19.8, 40 * t0 - 0.8), P2(a1, 19.8, 40 * t1 - 0.8), 0.6);
            K.beam('yellow', P2(a0, 19.9, 40 * t0 + 6.4), P2(a1, 19.9, 40 * t1 + 6.4), 0.35);
            K.beam('steelGray', P2(a0, 19.9, 40 * t0 + 3.2), P2(a1, 19.9, 40 * t1 + 3.2), 0.25);
            K.add('steelGray', new THREE.BoxGeometry(0.35, 7, 0.35), M4(...P2(a1, 19.9, 40 * t1 + 3)));
          }
          K.add('steelDark', new THREE.BoxGeometry(5, 0.5, 5), M4(...P2(a + 0.05, 17.4, 40), 0, -a, 0));
        }
        K.solid(x, z, 15, 15, 0, 42);
      }
      K.plane(decal('fuel_sign', signTex('fuel_sign', ['DANGER — FUEL STORAGE', 'FLAMMABLE — NO SMOKING WITHIN 50 FT'], { w: 768, h: 192, bg: '#d9a61c', fg: '#151515' })), ff + 48.6, 6, fr - 34, 24, 6);
      hesco(ff - 46, fr - 48, ff + 46, fr - 48, 2); hesco(ff - 46, fr + 48, ff + 46, fr + 48, 2); hesco(ff - 46, fr - 48, ff - 46, fr + 48, 2); hesco(ff + 46, fr - 48, ff + 46, fr - 14, 2); hesco(ff + 46, fr + 14, ff + 46, fr + 48, 2);
      // BÃI ĐỖ TRỰC THĂNG: 1 sân bê tông 20 x 16 m, vòng tròn chữ H + vạch tiếp đất, đèn viền, cọc neo, 1 trực thăng kiểu
      // UH-60 đậu chính giữa (cánh quạt chéo 45°), xe tiếp nhiên liệu đỗ cạnh, ống gió, xe đẩy bình chữa cháy
      {
        const a0 = 40, a1 = 200, r0 = -iR + 30, r1 = r0 + 130, cf2 = (a0 + a1) / 2, cr2 = (r0 + r1) / 2;
        K.cbox('conc', cf2, 0.4, cr2, a1 - a0, 1.4, r1 - r0, 0.5);
        K.add(decalT('heliport1', texOf('heliport1', 1024, Math.round(1024 * (r1 - r0) / (a1 - a0)), (q, w, h) => {
          q.clearRect(0, 0, w, h);
          const P = (f, r) => [(f - a0) / (a1 - a0) * w, (r - r0) / (r1 - r0) * h], k = w / (a1 - a0);
          q.strokeStyle = 'rgba(60,58,52,0.55)'; q.lineWidth = 1.5;
          for (let f = a0 + 40; f < a1; f += 40) { const [x] = P(f, 0); q.beginPath(); q.moveTo(x, 0); q.lineTo(x, h); q.stroke(); }
          for (let r = r0 + 32; r < r1; r += 32) { const [, y] = P(0, r); q.beginPath(); q.moveTo(0, y); q.lineTo(w, y); q.stroke(); }
          q.strokeStyle = 'rgba(232,190,40,0.92)'; q.lineWidth = 3 * k; q.strokeRect(...P(a0 + 4, r0 + 4), (a1 - a0 - 8) * k, (r1 - r0 - 8) * k);
          const [cx, cy] = P(cf2, cr2);
          q.strokeStyle = 'rgba(238,234,222,0.92)'; q.lineWidth = 3.4 * k; q.beginPath(); q.arc(cx, cy, 52 * k, 0, TAU); q.stroke();
          q.fillStyle = 'rgba(238,234,222,0.92)';
          q.fillRect(cx - 22 * k, cy - 4 * k, 44 * k, 8 * k); q.fillRect(cx - 22 * k, cy - 26 * k, 8 * k, 52 * k); q.fillRect(cx + 14 * k, cy - 26 * k, 8 * k, 52 * k);
          for (let i = 0; i < 10; i++) blotch(q, cx + (hash(i + 77) - 0.5) * 70 * k, cy + (hash(i + 78) - 0.5) * 50 * k, (6 + hash(i + 79) * 10) * k, '30,28,24', 0.4);
        })), new THREE.PlaneGeometry(a1 - a0, r1 - r0), M4(cf2, 1.15, cr2, -Math.PI / 2, 0, 0));
        for (let f = a0 + 6; f < a1; f += 20) for (const r of [r0 + 3, r1 - 3]) K.box(f % 40 < 20 ? 'lampAmber' : 'lampRed', f, 1.6, r, 1.4, 0.8, 1.4);
        heli(K, M4(cf2 - 14, 0.6, cr2, 0, 0.12, 0));
        K.solid(cf2 - 16, cr2, 62, 11, 0, 34, -0.12);
        for (const [x, z] of [[-30, -14], [-30, 14], [30, -14], [30, 14]]) K.cyl('steelDark', cf2 + x, 1, cr2 + z, 0.5, 0.5, 0.8, 6);
        anim.vehicles.push({ type: 'ARTILLERY', f: cf2, r: r1 + 26, a: 0, chassis: true, cargo: 'jp8', hf: 50, hr: 13 });
        K.cyl('steelGray', a1 + 14, 0, r0 + 12, 0.5, 0.7, 30, 6);
        K.add('ochre', new THREE.ConeGeometry(2.4, 12, 10, 1, true), M4(a1 + 20, 29, r0 + 12, 0, 0, Math.PI / 2 + 0.25));
        K.cyl('steelGray', a1 - 6, 0, r1 + 6, 1.6, 1.6, 2, 8); K.cyl('lampRed', a1 - 6, 2, r1 + 6, 2, 2, 9, 12);
      }

      // nhà lực lượng phản ứng nhanh: nhà bê tông 2 tầng, tường rọ đá chắn trước cửa, xe chống mìn đỗ sẵn
      const qf = iF - 66, qr = -170;
      // nhà bê tông 2 tầng: gờ sàn, cửa sổ có khung 2 mặt, mái che lối vào + bậc tam cấp, điều hoà treo tường,
      // lan can mái + thiết bị trên mái, cột cờ
      K.cbox('conc', qf, 18, qr, 60, 36, 40, 1.4);
      K.cbox('concDark', qf, 18, qr, 61, 1.6, 41, 0.4);
      for (const s2 of [-1, 1]) K.cbox('concDark', qf, 37.4, qr + s2 * 19.4, 60, 3, 1.4, 0.3);
      for (const s2 of [-1, 1]) K.cbox('concDark', qf + s2 * 29.4, 37.4, qr, 1.4, 3, 40, 0.3);
      const front = M4(qf, 0, qr + 20, 0, 0, 0), side = M4(qf + 30, 0, qr, 0, Math.PI / 2, 0);
      for (const x of [-12, 4, 20]) for (const y of [10, 27]) win(front, x, y, 9, 6);
      win(front, -24, 27, 9, 6);
      for (const x of [-12, 4, 12]) for (const y of [10, 27]) win(side, x, y, 6, 6);
      K.box('steelGray', qf - 24, 8.6, qr + 20.4, 8, 15, 0.6);
      K.cbox('concDark', qf - 24, 17.6, qr + 24, 14, 1.2, 9, 0.3);
      for (const s2 of [-1, 1]) K.cyl('steelGray', qf - 24 + s2 * 6, 0, qr + 27.6, 0.5, 0.5, 17, 6);
      for (let k = 0; k < 3; k++) K.cbox('concDark', qf - 24, 0.5 + k, qr + 21.5 + (2 - k) * 1.6, 12, 1, 3.4 + (2 - k) * 3.2, 0.2);
      for (const x of [-12, 4, 20]) acUnit(front, x + 6.4, 20.5);
      K.cbox('steelGray', qf + 10, 40.5, qr - 6, 14, 6, 10, 0.5); K.cbox('steelGray', qf - 14, 40, qr - 8, 8, 5, 8, 0.5);
      K.cyl('steelGray', qf + 34, 0, qr + 24, 0.5, 0.7, 70, 6);
      K.add(MAT.flag || (MAT.flag = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, map: texOf('flag', 128, 80, (q, w, h) => {
        q.fillStyle = '#3d4a2c'; q.fillRect(0, 0, w, h); q.fillStyle = '#d6a51f'; q.beginPath(); q.arc(w / 2, h / 2, 22, 0, TAU); q.fill();
        q.fillStyle = '#1b1b1b'; q.font = 'bold 22px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('SF', w / 2, h / 2 + 1);
      }) })), (() => { const fg = new THREE.PlaneGeometry(12, 7.5, 8, 1), ps = fg.attributes.position; for (let i = 0; i < ps.count; i++) { const x = ps.getX(i) + 6; ps.setZ(i, Math.sin(x * 0.7) * 0.5 * x / 12); } fg.computeVertexNormals(); return fg; })(), M4(qf + 40.2, 65, qr + 24, 0, 0.3, 0));
      K.plane(decal('qrf_sign', signTex('qrf_sign', ['SECURITY FORCES', 'QUICK REACTION FORCE'], { w: 768, h: 192, bg: '#1d2a3a', fg: '#ffffff', fg2: '#e8c34a', border: '#d6a51f' })), qf, 33, qr + 20.6, 30, 7.5, 0);
      K.solid(qf, qr, 30, 20, 0, 38);
      hesco(qf - 30, qr + 34, qf + 30, qr + 34, 2);
    }

    // ---- XE (mẫu xe chi tiết của game, dựng ở LandmarkSet): 4 xe bọc thép trinh sát 4x4 tuần tra (1 chiếc dưới lưới
    //      nguỵ trang), xe chi viện hoả lực bánh xích canh trung tâm điều khiển, xe tải 6x6 chở bồn chất oxy hoá
    anim.vehicles.push({ type: 'SCOUT', f: iF - 110, r: 150, a: 0.05, ty: 0.3, hf: 20, hr: 11 });
    anim.vehicles.push({ type: 'SCOUT', f: iF - 110, r: 186, a: -0.05, ty: -0.2, hf: 20, hr: 11 });
    anim.vehicles.push({ type: 'SCOUT', f: iF - 50, r: -G + 14, a: Math.PI, ty: 0.6, hf: 20, hr: 11 });
    anim.vehicles.push({ type: 'SCOUT', f: -60, r: 276, a: 1.4 + Math.PI, ty: 0, hf: 20, hr: 11 });
    camoNet(K, M4(-60, 0, 276, 0, -1.4, 0), 50, 40, 46, 5);
    anim.vehicles.push({ type: 'GATLING', f: -30, r: -238, a: 0, ty: -0.5, hf: 43, hr: 32 });
    anim.vehicles.push({ type: 'ARTILLERY', f: -150, r: 240, a: 0, chassis: true, cargo: 'n2o4', hf: 50, hr: 13 });

    // phuy nhiên liệu trên pallet + cuộn cáp cạnh nhà xe
    for (let i = 0; i < 3; i++) { const pr2 = 268 + i * 14; K.box('wood', 150, 0.7, pr2, 12, 1.4, 12); for (let j = 0; j < 4; j++) drum(K, 147 + (j % 2) * 6, pr2 - 3 + Math.floor(j / 2) * 6, j === 3 && i ? 'drumBlue' : 'olive', 1.4); }
    K.solid(164, 250, 22, 8, 0, 9);
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
        // phần chuyển động: đèn hiệu xoay / đèn đỏ nháy (vật liệu riêng), hơi nước ống xả, đèn pha quét
        const anim = { steam: [], search: [], beams: [], radar: [], radars: [], vehicles: [], t: hash(this.items.length) * 10,
          beacon: new THREE.MeshStandardMaterial({ color: 0x805010, emissive: 0xffa21a, emissiveIntensity: 1, roughness: 0.3 }),
          blink: new THREE.MeshStandardMaterial({ color: 0x801010, emissive: 0xff2a1a, emissiveIntensity: 1, roughness: 0.3 }) };
        if (L.kind === 'nuke') buildNuke(K, grp, anim);
        else if (L.kind === 'bio') buildBio(K, grp);
        else if (L.kind === 'sam') buildSam(K, grp);
        K.build(grp);
        for (const p of anim.search) {
          const yaw = new THREE.Group();
          yaw.position.set(p.x, p.y, p.z);
          yaw.userData.a0 = p.a0 === undefined ? 2.4 : -p.a0; yaw.userData.ph = anim.beams.length * 1.7;
          const head = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2, 4, 12), MAT.radarD || (MAT.radarD = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.5 })));
          head.rotation.z = Math.PI / 2 - 0.35; head.position.x = 1;
          // đèn pha chỉ bật lúc trời tối (mặt trời < ~7°): kính trắng sáng đều + quầng sáng mờ dần theo chiều dài tia;
          // ban ngày tắt hẳn (trước đây quầng vàng cộng sáng nhìn đúng hướng chĩa thành cục sáng vàng lơ lửng)
          const night = !!(opts && opts.sun && opts.sun.elevation < 0.12);
          const lensM = night ? (MAT.lensOn || (MAT.lensOn = new THREE.MeshStandardMaterial({ color: 0xeef3ff, emissive: 0xeef3ff, emissiveIntensity: 1.6, roughness: 0.2 })))
            : (MAT.lensOff || (MAT.lensOff = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.15, metalness: 0.4 })));
          const lens = new THREE.Mesh(new THREE.CircleGeometry(2.3, 12), lensM);
          lens.rotation.y = Math.PI / 2; lens.rotation.x = 0; lens.position.set(3.1, -0.7, 0);
          const cone = new THREE.ConeGeometry(30, 260, 20, 1, true);
          cone.translate(0, -130, 0); cone.rotateZ(Math.PI / 2 - 0.35);
          const fade = TEX.beamFade || (TEX.beamFade = texOf('beamFade', 8, 128, (q, w, h) => {
            const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#555555'); gr.addColorStop(1, '#000000'); q.fillStyle = gr; q.fillRect(0, 0, w, h);
          }));
          const beam = new THREE.Mesh(cone, MAT.beam || (MAT.beam = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, alphaMap: fade, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide })));
          beam.visible = night;
          yaw.add(head, lens, beam);
          grp.add(yaw);
          anim.beams.push(yaw);
        }
        for (const v of anim.vehicles) this.placeVehicle(grp, K, v);
        for (const p of anim.radar) {
          // ăng-ten radar cảnh giới: giàn mặt phản xạ cong + bộ thu, quay tròn liên tục
          const rot = new THREE.Group();
          rot.position.set(p.x, p.y, p.z);
          const rm = MAT.radarM || (MAT.radarM = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
          const rd = MAT.radarD || (MAT.radarD = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.5 }));
          const dish = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 9, 24, 1, true, -0.7, 1.4), rm); dish.position.set(-14, 6, 0);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 1.4), rd); arm.position.set(4, 6, 0);
          const feed = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), rm); feed.position.set(12, 6, 0);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 10), rd); hub.position.y = 3;
          rot.add(dish, arm, feed, hub);
          grp.add(rot);
          anim.radars.push(rot);
        }
        const it = { L, anim, kind: L.kind, name: NAMES[L.kind] || L.kind, x: L.x, z: L.z, G: L.G, boxes: K.solids, top: L.G + K.top, reach: Math.hypot(L.hu, L.hv) + 30 };
        this.items.push(it);
        this.boxes.push(...K.solids);
      }
      this.group.updateMatrixWorld(true);
    }
    // Xe đỗ: mẫu xe chi tiết của game (TankModelBuilder, như xe trong trận) dựng tĩnh, bỏ thanh máu / khiên / tấm vải
    // nhận diện phe; chassis: bỏ cụm tháp pháo -> khung xe tải quân sự 6x6 thùng phẳng, cargo: bồn chở trên thùng.
    // Hướng a (cục bộ f/r) là hướng mũi xe; mẫu xe có mũi hướng -Z
    placeVehicle(grp, K, v) {
      K.solid(v.f, v.r, v.hf, v.hr, 0, 34, v.a);
      if (typeof TankModelBuilder === 'undefined') return;
      const u = { tankType: v.type, team: 'BLUE', scene: grp, id: 'lm_' + v.type + '_' + Math.round(v.f) + '_' + Math.round(v.r) };
      try { TankModelBuilder.buildModel(u); } catch (e) { return; }
      const G = u.group;
      if (u.hpGroup && u.hpGroup.parent) u.hpGroup.parent.remove(u.hpGroup);
      if (u.reactiveArmorMesh) u.reactiveArmorMesh.visible = false;
      G.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material;
        // tấm vải nhận diện phe (xanh / đỏ) và tia lửa đầu nòng (vật liệu cơ bản trong suốt) không dùng cho xe đỗ
        if (m && m.color && (m.color.getHex() === 0x2f62a6 || m.color.getHex() === 0xb4422b)) o.visible = false;
        if (m && m.isMeshBasicMaterial && m.transparent) o.visible = false;
      });
      if (v.chassis && u.turretGroup) u.turretGroup.visible = false;
      if (u.turretGroup && v.ty) u.turretGroup.rotation.y = v.ty;
      if (v.cargo) {
        // bồn chở trên thùng xe 6x6 (dọc trục Z của mẫu xe, đuôi xe là +Z): thân bồn, chỏm 2 đầu, gờ chống lật, lối đi nóc,
        // thang leo, van xả sau, biển hàng nguy hiểm 2 bên
        const big = v.cargo === 'n2o4', R = big ? 10.5 : 8.5, Ln = big ? 52 : 40, zc = big ? 20 : 18, yc = 13 + R;
        const tm = new THREE.MeshStandardMaterial({ color: big ? 0xd9d6cc : 0x55603e, roughness: 0.5, metalness: 0.3, map: grimePair('r0.6', 0.6)[0], bumpMap: grimePair('r0.6', 0.6)[1], bumpScale: 0.3 });
        const add = (geo, x, y, z, rx, ry, rz, sx, sy, sz, m) => { const me = new THREE.Mesh(geo, m || tm); me.position.set(x, y, z); me.rotation.set(rx || 0, ry || 0, rz || 0); if (sx) me.scale.set(sx, sy, sz); me.castShadow = me.receiveShadow = true; G.add(me); };
        add(new THREE.CylinderGeometry(R, R, Ln, 24), 0, yc, zc, Math.PI / 2, 0, 0);
        for (const s of [-1, 1]) add(new THREE.SphereGeometry(R, 20, 10), 0, yc, zc + s * Ln / 2, 0, 0, 0, 1, 1, 0.32);
        for (const z of [zc - Ln / 2 + 4, zc, zc + Ln / 2 - 4]) add(new THREE.TorusGeometry(R + 0.3, 0.5, 6, 24), 0, yc, z, 0, 0, 0, 0, 0, 0, mat('steelDark'));
        add(new THREE.BoxGeometry(4, 0.5, Ln - 6), 0, yc + R + 0.3, zc, 0, 0, 0, 0, 0, 0, mat('steelGray'));
        for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.3, 2.4, Ln - 6), s * 2, yc + R + 1.6, zc, 0, 0, 0, 0, 0, 0, mat('steelGray'));
        add(new THREE.CylinderGeometry(1.2, 1.2, 4, 10), 0, yc - R + 1, zc + Ln / 2 + 2, Math.PI / 2, 0, 0, 0, 0, 0, mat('steelDark'));
        if (!big) add(new THREE.CylinderGeometry(3, 3, 8, 16), 0, yc - R - 1, zc + Ln / 2 - 2, 0, 0, Math.PI / 2, 0, 0, 0, mat('rubber'));
        const plate = decal(big ? 'ox_plate' : 'flam_plate', TEX[big ? 'ox_plate' : 'flam_plate'] || texOf(big ? 'ox_plate' : 'flam_plate', 128, 128, (q, w, h) => {
          q.fillStyle = '#efece2'; q.fillRect(0, 0, w, h); q.save(); q.translate(w / 2, h / 2); q.rotate(Math.PI / 4);
          q.fillStyle = big ? '#d8b51e' : '#c2271b'; q.fillRect(-40, -40, 80, 80); q.restore();
          q.fillStyle = big ? '#111' : '#fff'; q.font = 'bold 16px Arial'; q.textAlign = 'center';
          q.fillText(big ? 'OXIDIZER' : 'FLAMMABLE', w / 2, h / 2 - 2); q.fillText(big ? '5.1  N2O4' : 'JP-8', w / 2, h / 2 + 17);
        }));
        for (const s of [-1, 1]) add(new THREE.PlaneGeometry(9, 9), s * (R + 0.15), yc, zc, 0, s * Math.PI / 2, 0, 0, 0, 0, plate);
      }
      G.position.set(v.f, K.earth(v.f, v.r), v.r);
      G.rotation.y = -(v.a + Math.PI / 2);
      grp.add(G);
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
    // VÙNG CẤM BẮN: cả khu đất công trình (+ lề pad) — không ngắm bắn vào đó
    noFireAt(x, z, pad) {
      for (const it of this.items) {
        const L = it.L, dx = x - L.x, dz = z - L.z, p = pad || 0;
        if (Math.abs(dx * L.fx + dz * L.fz) < L.hu + p && Math.abs(-dx * L.fz + dz * L.fx) < L.hv + p) return it;
      }
      return null;
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
    // Đèn hiệu xoay / nháy, đèn pha chòi gác quét qua lại, hơi nước bốc lên từ ống xả giếng phóng
    update(dt, fx, cam) {
      for (const it of this.items) {
        const A = it.anim;
        if (!A) continue;
        A.t += dt;
        A.beacon.emissiveIntensity = 0.25 + 2.2 * Math.pow(Math.max(0, Math.sin(A.t * 7)), 6);
        A.blink.emissiveIntensity = (A.t % 1.4) < 0.25 ? 2.4 : 0.15;
        for (const r of A.radars) { r.rotation.y = A.t * 1.3; r.updateMatrix(); }
        for (const y of A.beams) { y.rotation.y = 0.9 * Math.sin(A.t * 0.35 + y.userData.ph) + y.userData.a0; y.updateMatrix(); }
        if (!A.steam.length || !fx || !fx.smoke) continue;
        A.acc = (A.acc || 0) + dt;
        if (A.acc < 0.3) continue;
        A.acc = 0;
        if (cam && Math.hypot(cam.x - it.x, cam.z - it.z) > 2200) continue;
        for (const [[x, z], y] of A.steam) {
          fx.smoke.add({ x: x + (Math.random() - 0.5) * 18, y, z: z + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 2, vy: 9 + Math.random() * 6, vz: (Math.random() - 0.5) * 2,
            size: 6 + Math.random() * 4, grow: 7, drag: 0.6, grav: -1.5, life: 4 + Math.random() * 2, alpha: 0.2, fadeIn: 0.4, c0: [0.82, 0.83, 0.84], c1: [0.94, 0.94, 0.94], cell: 0, floor: false });
        }
      }
    }
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

  // dựng riêng 1 trực thăng mẫu (dùng cho trang xem thử model)
  const previewHeli = (group) => { const K = new Kit({ x: 0, z: 0, fx: 1, fz: 0, G: 0 }, () => 0); heli(K, M4(0, 0, 0)); K.build(group); };
  return { LandmarkSet, paintGround, NAMES, segBox, previewHeli };
})();
if (typeof window !== 'undefined') window.Landmarks = Landmarks;
