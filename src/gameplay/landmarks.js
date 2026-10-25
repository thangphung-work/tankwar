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
 * Thân xe / nòng pháo va vào khối đặc (hộp xoay như nhà), đạn chạm thì nổ trên bề mặt (như tường bê tông), khối đặc chắn
 * sóng nổ. Ụ đất / kè đất là địa hình thật (MapGen đã đắp vào lưới độ cao).
 * PHÁ HỦY ĐƯỢC BẰNG ĐẠN PHÁO (LandmarkSet.damageAt): mỗi công trình có máu chung; đạn nổ trúng / nổ sát khối đặc trừ máu
 * (lựu pháo ~7 phát, đạn nổ mạnh xe tăng ~15 phát, đạn súng gần như không xi nhê). Hư nặng: bốc khói, rồi cháy; hết máu:
 * chuỗi nổ thứ cấp, cả công trình sụp xuống còn đống đổ nát cháy đen (khối va chạm thấp còn ~1/3), máy móc / đèn ngừng.
 *
 * Hệ toạ độ cục bộ mỗi công trình: f theo hướng mặt trước (angle), r vuông góc (-sin, cos), y tính từ cốt san nền G.
 * Nhóm hình: trục X cục bộ = f, trục Z cục bộ = r (như cứ điểm). Tỉ lệ 8 đơn vị = 1 m.
 */
const Landmarks = (() => {
  const TAU = Math.PI * 2;
  const NAMES = { nuke: 'HẦM PHÓNG TÊN LỬA HẠT NHÂN' };   // các loại khác: KINDS[loại].name
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
  // Làm cũ một ảnh sơn / biển / cửa thép (căn cứ bỏ hoang): phai màu, bụi đất đóng dày dần xuống chân, vệt gỉ chảy từ
  // đầu bulông + mép trên, mảng sơn bong lộ thép gỉ (viền tối), vết xước, đốm bẩn. k: mức độ (0..1.5)
  function ageCanvas(g, w, h, seed, k) {
    k = k === undefined ? 1 : k;
    const H = (i) => hash(seed * 31 + i);
    g.fillStyle = `rgba(176,168,150,${0.16 * k})`; g.fillRect(0, 0, w, h);
    const gd = g.createLinearGradient(0, h * 0.55, 0, h); gd.addColorStop(0, 'rgba(92,80,60,0)'); gd.addColorStop(1, `rgba(92,80,60,${0.55 * k})`); g.fillStyle = gd; g.fillRect(0, h * 0.55, w, h * 0.45);
    for (let i = 0; i < 14 * k; i++) { const x = H(i) * w, y = H(i + 50) * h, r = (0.02 + H(i + 90) * 0.06) * Math.max(w, h); blotch(g, x, y, r, H(i + 130) < 0.5 ? '70,62,48' : '150,140,118', 0.25 * k); }
    // mảng sơn bong
    // (mảng nhỏ, mép răng cưa nhiều đỉnh, ưu tiên mép / góc ảnh — mảng tròn to giữa biển trông như miếng dán cam)
    for (let i = 0; i < 9 * k; i++) {
      const edge = H(i + 280) < 0.6, cx = edge ? (H(i + 200) < 0.5 ? H(i + 290) * 0.12 : 1 - H(i + 290) * 0.12) * w : H(i + 200) * w, cy = H(i + 230) * h;
      const R = (0.006 + H(i + 260) * 0.022) * Math.max(w, h), n = 14;
      g.beginPath();
      for (let j = 0; j < n; j++) { const a = j / n * TAU, rr = R * (0.35 + H(i * 17 + j + 300) * 0.9); j ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75); }
      g.closePath(); g.fillStyle = 'rgba(98,64,40,0.72)'; g.fill(); g.strokeStyle = 'rgba(40,30,22,0.3)'; g.lineWidth = 1; g.stroke();
    }
    // vệt gỉ chảy (từ bulông / mép trên)
    for (let i = 0; i < 22 * k; i++) {
      const x = H(i + 400) * w, y = H(i + 430) < 0.35 ? 0 : H(i + 460) * h * 0.7, l = (0.15 + H(i + 490) * 0.5) * h, wd = 1 + H(i + 520) * Math.max(2, w / 120);
      const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(138,72,30,0.6)'); gr.addColorStop(0.35, 'rgba(150,92,44,0.35)'); gr.addColorStop(1, 'rgba(150,92,44,0)');
      g.fillStyle = gr; g.fillRect(x, y, wd, l);
    }
    // vết xước sáng
    g.strokeStyle = 'rgba(220,214,200,0.35)'; g.lineWidth = 0.7;
    for (let i = 0; i < 18 * k; i++) { const x = H(i + 600) * w, y = H(i + 630) * h, a = H(i + 660) * TAU, l = (0.02 + H(i + 690) * 0.08) * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    speckle(g, w, h, Math.round(w * h / 90 * k), ['rgba(60,52,40,0.8)', 'rgba(120,96,60,0.7)'], 1, 2, seed + 7);
  }
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
    // lỗ rỗ bọt khí: chấm tròn nhỏ hơi lõm, biên độ vừa (ô vuông 2-3 px lồi lõm mạnh nhìn như gạch vỡ pixel)
    for (let i = 0; i < 9000; i++) { const v = 112 + hash(i + 7000) * 30 | 0; q.fillStyle = `rgb(${v},${v},${v})`; q.beginPath(); q.arc(hash(i + 7001) * N, hash(i + 7002) * N, 0.6 + hash(i + 7003) * 1.1, 0, TAU); q.fill(); }
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
    // căn cứ bỏ hoang: vệt mưa đen dài, mảng rêu / địa y xanh xám, loang ẩm
    if (ABANDONED) {
      for (let i = 0; i < 70; i++) {
        // (vài sợi mảnh uốn lượn chồng nhau thay cho 1 khối chữ nhật mép sắc — nhìn gần như thanh sọc đen)
        const y = hash(i + 7701) * N * 0.4, l = 120 + hash(i + 7702) * 360, wd = 3 + hash(i + 7703) * 12;
        for (let s = 0; s < 3; s++) {
          let x = hash(i + 7700) * N + (hash(i * 3 + s + 7704) - 0.5) * wd;
          const ls = l * (0.5 + hash(i * 3 + s + 7705) * 0.5), gr = g.createLinearGradient(0, y, 0, y + ls);
          gr.addColorStop(0, `rgba(48,46,40,${0.1 + hash(i * 3 + s + 7706) * 0.14})`); gr.addColorStop(1, 'rgba(48,46,40,0)');
          g.strokeStyle = gr; g.lineWidth = 1.5 + hash(i * 3 + s + 7707) * wd * 0.45; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
          for (let k = 1; k <= 10; k++) { x += (hash(i * 31 + s * 11 + k + 7708) - 0.5) * 2.4; g.lineTo(x, y + ls * k / 10); }
          g.stroke();
        }
      }
      for (let i = 0; i < 60; i++) blotch(g, hash(i + 7800) * N, hash(i + 7801) * N, 6 + hash(i + 7802) * 30, hash(i + 7803) < 0.6 ? '88,98,62' : '70,66,58', 0.22);
      // vệt gỉ chảy từ bulông / chi tiết sắt (cam nâu) + loang nước ố vàng hình giọt kéo dài
      // (sợi mảnh uốn lượn, đầu vệt là vết ố nhỏ loang mờ — không chấm tròn đậm đầu dải thẳng như kẹo mút)
      for (let i = 0; i < 46; i++) {
        const y = hash(i + 7901) * N * 0.7, l = 40 + hash(i + 7902) * 200, wd = 1 + hash(i + 7903) * 2.6;
        let x = hash(i + 7900) * N;
        blotch(g, x, y, wd * 2.4, '120,66,30', 0.3);
        const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(140,76,32,0.45)'); gr.addColorStop(0.3, 'rgba(150,96,44,0.22)'); gr.addColorStop(1, 'rgba(150,96,44,0)');
        g.strokeStyle = gr; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
        for (let s = 1; s <= 10; s++) { x += (hash(i * 11 + s + 7910) - 0.5) * 2.2; g.lineTo(x, y + l * s / 10); }
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const x = hash(i + 7950) * N, y = hash(i + 7951) * N, rw = 14 + hash(i + 7952) * 40, rh = rw * (1.6 + hash(i + 7953) * 1.6);
        const gr = g.createRadialGradient(x, y, 0, x, y + rh * 0.3, rh);
        gr.addColorStop(0, 'rgba(176,150,84,0.0)'); gr.addColorStop(0.6, 'rgba(176,146,80,0.16)'); gr.addColorStop(0.85, 'rgba(150,118,62,0.32)'); gr.addColorStop(1, 'rgba(150,118,62,0)');
        g.save(); g.translate(x, y); g.scale(rw / rh, 1); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - rh, y - rh, rh * 2, rh * 2); g.restore();
      }
    }
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
    // làm mềm ảnh độ sần (bump tính theo đạo hàm màn hình: chấm 1-2 px sắc cạnh -> ô vuông lồi lõm to khi nhìn gần)
    { const b2 = canvas(N, N), q2 = b2.getContext('2d'); q2.filter = 'blur(1.3px)'; for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) q2.drawImage(b, ox, oy); q.clearRect(0, 0, N, N); q.drawImage(b2, 0, 0); }
    const t = new THREE.CanvasTexture(c), tb = new THREE.CanvasTexture(b);
    for (const k of [t, tb]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (TEX.conc = [t, tb]);
  }
  const concTex = () => concPair()[0];
  // Mặt bê tông NẰM NGANG (sàn, bệ, mái, nóc tường): khác hẳn mặt đứng đổ ván khuôn — không mạch ván / lỗ ty / vệt nước
  // chảy dọc. 1 ô = 64 đv (8 m) như concPair: mạch cắt co giãn 4 m có đất bụi + rêu đọng, vân chổi quét ngang mờ, cốt
  // liệu lộ, vết nứt chân chim, ố nước đọng loang, vết dầu / gỉ, vệt bánh xe sẫm, địa y (bỏ hoang); kèm ảnh độ sần
  function slabPair() {
    if (TEX.slab) return TEX.slab;
    const N = 512, c = canvas(N, N), g = c.getContext('2d'), b = canvas(N, N), q = b.getContext('2d');
    concreteFill(g, N, N, '#9a978f', 811);
    q.fillStyle = '#808080'; q.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += 2) { g.fillStyle = `rgba(${hash(y + 820) < 0.5 ? '70,68,62' : '205,200,190'},${0.03 + hash(y + 821) * 0.04})`; g.fillRect(0, y, N, 1); }   // vân chổi
    for (let i = 0; i < 7000; i++) { const v = 110 + hash(i + 830) * 40 | 0, x = hash(i + 831) * N, y = hash(i + 832) * N; q.fillStyle = `rgb(${v},${v},${v})`; q.fillRect(x, y, 1.5, 1.5); }
    speckle(g, N, N, 3200, ['#77746c', '#b4b0a6', '#8c887f', '#5f5c56'], 0.8, 2.2, 840);
    // ố nước đọng / loang ẩm (mảng sẫm mép mờ), mảng sáng phong hoá
    for (let i = 0; i < 26; i++) for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) blotch(g, hash(i + 850) * N + ox, hash(i + 851) * N + oy, 30 + hash(i + 852) * 90, hash(i + 853) < 0.6 ? '62,62,56' : '196,192,180', 0.13);
    // vết dầu / gỉ, vệt bánh xe sẫm chạy dọc
    for (let i = 0; i < 9; i++) blotch(g, hash(i + 860) * N, hash(i + 861) * N, 8 + hash(i + 862) * 22, hash(i + 863) < 0.5 ? '40,36,30' : '120,74,40', 0.35);
    for (let i = 0; i < 4; i++) { const x = hash(i + 870) * N; for (const dx of [0, 46]) { const gr = g.createLinearGradient(x + dx - 9, 0, x + dx + 9, 0); gr.addColorStop(0, 'rgba(40,38,34,0)'); gr.addColorStop(0.5, 'rgba(40,38,34,0.13)'); gr.addColorStop(1, 'rgba(40,38,34,0)'); g.fillStyle = gr; g.fillRect(x + dx - 9, 0, 18, N); } }
    const both = (fn) => { fn(g, false); fn(q, true); };
    // mạch cắt 4 m (2 x 2 tấm / ô), đất bụi + rêu tràn ra 2 bên mạch
    both((x, bm) => { x.strokeStyle = bm ? '#3c3c3c' : 'rgba(44,42,36,0.7)'; x.lineWidth = bm ? 3 : 2; for (const p of [0, 256, 512]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, N); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(N, p); x.stroke(); } });
    for (let i = 0; i < 260; i++) {
      const along = hash(i + 880) * N, p = [0, 256, 512][(hash(i + 881) * 3) | 0], vert = hash(i + 882) < 0.5, off = (hash(i + 883) - 0.5) * 10, r = 2 + hash(i + 884) * 7;
      blotch(g, vert ? p + off : along, vert ? along : p + off, r, ABANDONED && hash(i + 885) < 0.55 ? '74,86,48' : '84,72,54', 0.4);
    }
    // nứt chân chim + vài vết nứt dài chéo tấm
    both((x, bm) => {
      x.strokeStyle = bm ? '#5a5a5a' : 'rgba(46,44,40,0.2)'; x.lineWidth = bm ? 1 : 0.7;
      for (let i = 0; i < 10; i++) {
        let px = hash(i + 890) * N, py = hash(i + 891) * N, a = hash(i + 892) * TAU; const L2 = i < 3 ? 28 : 7;
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < L2; k++) { a += (hash(i * 37 + k + 893) - 0.5) * 0.9; px += Math.cos(a) * 6; py += Math.sin(a) * 6; x.lineTo(px, py); }
        x.stroke();
      }
    });
    // địa y / rêu đốm (bỏ hoang)
    if (ABANDONED) for (let i = 0; i < 70; i++) blotch(g, hash(i + 900) * N, hash(i + 901) * N, 3 + hash(i + 902) * 10, hash(i + 903) < 0.5 ? '150,150,120' : '86,96,58', 0.3);
    const t = new THREE.CanvasTexture(c), tb = new THREE.CanvasTexture(b);
    for (const k of [t, tb]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (TEX.slab = [t, tb]);
  }
  // Bê tông: mặt hướng lên (pháp tuyến thế giới y > ~0.8) lấy ảnh sàn slabPair, mặt đứng giữ ảnh ván khuôn (cả ảnh độ sần)
  function concFloorPatch(m) {
    const [ft, fb] = slabPair();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tFloor = { value: ft }; sh.uniforms.tFloorB = { value: fb };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUpK;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUpK = smoothstep(0.72, 0.9, normalize(mat3(modelMatrix) * objectNormal).y);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vUpK;\nuniform sampler2D tFloor;\nuniform sampler2D tFloorB;')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n\tvec4 texelColor = mix(texture2D(map, vUv), texture2D(tFloor, vUv), vUpK);\n\ttexelColor = mapTexelToLinear(texelColor);\n\tdiffuseColor *= texelColor;\n#endif')
        .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment
          .replace('uniform float bumpScale;', 'uniform float bumpScale;\n\tvec4 vkBump(vec2 uv) { return mix(texture2D(bumpMap, uv), texture2D(tFloorB, uv), vUpK); }')
          .replace(/texture2D\( bumpMap, /g, 'vkBump( '));
    };
    m.customProgramCacheKey = () => 'concFloor';
    return m;
  }
  // Lớp bẩn / gỉ / trầy cho thép & bề mặt sơn (nhân với màu vật liệu): nền gần trắng, mảng bẩn, đốm gỉ, vệt gỉ chảy,
  // vết trầy; ảnh độ sần đi kèm (sơn rộp, đốm gỉ nổi). rust: mức gỉ
  function grimePair(key, rust) {
    if (TEX['g_' + key]) return TEX['g_' + key];
    const N = 256, c = canvas(N, N), g = c.getContext('2d'), b = canvas(N, N), q = b.getContext('2d'), sd = key.length * 97;
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, N, N); q.fillStyle = '#808080'; q.fillRect(0, 0, N, N);
    for (let i = 0; i < 30; i++) { const x = hash(sd + i) * N, y = hash(sd + i + 1) * N, r = 10 + hash(sd + i + 2) * 50; for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) blotch(g, x + ox, y + oy, r, hash(sd + i + 3) < 0.6 ? '96,90,78' : '255,255,250', 0.16); }
    speckle(g, N, N, 3000, ['#a9a59a', '#ffffff', '#c7c2b6'], 1, 2, sd + 5);
    for (let i = 0; i < 4000; i++) { const v = 112 + hash(sd + i * 3 + 9000) * 32 | 0; q.fillStyle = `rgb(${v},${v},${v})`; q.fillRect(hash(sd + i * 3 + 9001) * N, hash(sd + i * 3 + 9002) * N, 2, 2); }
    // gỉ: cụm loang không đều (nhiều vảy nhỏ chồng lệch, quầng ố nhòe), RỖ lõm trong ảnh độ sần (không nổi mụn); chỉ
    // một số cụm có vệt chảy — sợi mảnh uốn lượn nhạt dần (không phải dải thẳng đều kiểu kẹo mút)
    const HS = (i) => hash(sd + i);
    // (cụm gỉ gom thành vài vùng loang — chỗ gỉ nặng, chỗ còn sạch — thay vì rải đều khắp ảnh như da báo)
    const ng = 2 + Math.ceil(rust), gx = [], gy = [];
    for (let k = 0; k < ng; k++) { gx.push(HS(k + 280) * N); gy.push(HS(k + 290) * N); blotch(g, gx[k], gy[k], N * (0.12 + HS(k + 295) * 0.1), '120,84,52', 0.08); }
    for (let i = 0; i < 16 * rust; i++) {
      const gk = i % ng, sp = N * (0.08 + HS(i + 309) * 0.2), r = 1 + Math.pow(HS(i + 302), 1.8) * 6;
      const x = ((gx[gk] + (HS(i + 300) - 0.5) * 2 * sp) % N + N) % N, y = ((gy[gk] + (HS(i + 301) - 0.5) * 2 * sp) % N + N) % N;
      blotch(g, x, y, r * 2.6, '124,82,46', 0.1 + HS(i + 303) * 0.08);
      const n = 3 + (HS(i + 304) * 5 | 0);
      for (let j = 0; j < n; j++) {
        const k = i * 13 + j * 7, ox = x + (HS(k + 320) - 0.5) * r * 2.2, oy = y + (HS(k + 321) - 0.5) * r * 1.6, rr = r * (0.3 + HS(k + 322) * 0.6), ry = rr * (0.5 + HS(k + 323) * 0.6), a = HS(k + 324) * 3;
        for (const [ex, ey] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
          g.fillStyle = `rgba(${96 + HS(k + 325) * 52 | 0},${50 + HS(k + 326) * 26 | 0},${22 + HS(k + 327) * 14 | 0},${0.22 + HS(k + 328) * 0.38})`;
          g.beginPath(); g.ellipse(ox + ex, oy + ey, rr, ry, a, 0, TAU); g.fill();
          q.fillStyle = 'rgba(92,92,92,0.55)'; q.beginPath(); q.ellipse(ox + ex, oy + ey, rr * 0.8, ry * 0.8, a, 0, TAU); q.fill();
        }
      }
      if (HS(i + 305) < 0.45) {
        const L = 12 + HS(i + 306) * 46 + r * 4;
        for (const ey of [0, -N]) {
          let px = x; const py = y + r * 0.4 + ey, gr = g.createLinearGradient(0, py, 0, py + L);
          gr.addColorStop(0, 'rgba(118,64,30,0.42)'); gr.addColorStop(0.4, 'rgba(126,78,40,0.2)'); gr.addColorStop(1, 'rgba(126,78,40,0)');
          g.strokeStyle = gr; g.lineWidth = 0.6 + HS(i + 307) * 1.3; g.lineCap = 'round';
          g.beginPath(); g.moveTo(px, py); for (let s = 1; s <= 8; s++) { px += (HS(i * 9 + s + 330) - 0.5) * 1.6; g.lineTo(px, py + L * s / 8); } g.stroke();
        }
      }
    }
    g.strokeStyle = 'rgba(250,250,246,0.35)'; g.lineWidth = 0.8;
    for (let i = 0; i < 40; i++) { const x = hash(sd + i + 700) * N, y = hash(sd + i + 701) * N, a = hash(sd + i + 702) * TAU, l = 6 + hash(sd + i + 703) * 24; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    // làm mềm ảnh độ sần (ô 2 px sắc cạnh -> mặt thép nổi hạt như vỏ cam / bê tông sỏi khi nhìn gần)
    { const b2 = canvas(N, N), q2 = b2.getContext('2d'); q2.filter = 'blur(1.2px)'; for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) q2.drawImage(b, ox, oy); q.clearRect(0, 0, N, N); q.drawImage(b2, 0, 0); }
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
    if (ABANDONED) ageCanvas(g, N, N, 2200 + period + (horiz ? 7 : 0), 1.2);   // tôn gỉ loang, phai, bẩn
    const t = new THREE.CanvasTexture(c), tb = new THREE.CanvasTexture(b);
    for (const k of [t, tb]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (TEX[key] = [t, tb]);
  }
  // Rọ đá Hesco: vải địa kỹ thuật màu cát căng trong khung lưới thép ô vuông (1 ô texture = 1 rọ)
  const hescoTex = () => texOf('hesco', 128, 128, (g, w, h) => {
    g.fillStyle = '#b4a27a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) blotch(g, hash(i + 1200) * w, hash(i + 1201) * h, 8 + hash(i + 1202) * 20, hash(i + 1203) < 0.6 ? '120,104,74' : '210,196,160', 0.25);
    speckle(g, w, h, 1200, ['#8f7e5a', '#cdbd95'], 1, 2, 1210);
    // lưới thép hàn ô ~9 cm (12 x 12 ô / rọ), sợi mảnh có bóng; 2 mép rọ là cột lò xo nối rọ (sợi to, sẫm)
    for (let k = 0; k <= 12; k++) {
      const p = k * w / 12, edge = k === 0 || k === 12;
      g.strokeStyle = edge ? 'rgba(46,48,46,0.95)' : 'rgba(70,72,68,0.7)'; g.lineWidth = edge ? 3 : 0.9;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.strokeStyle = 'rgba(70,72,68,0.7)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
    // vải căng nhăn theo ô lưới (sáng giữa ô, sẫm sát sợi)
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) blotch(g, (i + 0.5) * w / 12, (j + 0.5) * h / 12, w / 26, '226,214,182', 0.12);
    if (ABANDONED) {
      // vải địa kỹ thuật bạc màu nắng mưa, rách lộ đất cát, rêu mốc xanh đen, lưới thép gỉ
      g.fillStyle = 'rgba(96,88,70,0.35)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) blotch(g, hash(i + 1300) * w, hash(i + 1301) * h, 6 + hash(i + 1302) * 18, hash(i + 1303) < 0.5 ? '64,72,46' : '58,52,40', 0.45);
      for (let i = 0; i < 6; i++) { const x = hash(i + 1310) * w, y = hash(i + 1311) * h; g.fillStyle = 'rgba(112,94,66,0.9)'; g.beginPath(); g.ellipse(x, y, 4 + hash(i + 1312) * 8, 2 + hash(i + 1313) * 5, hash(i) * 3, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(120,70,36,0.45)'; g.lineWidth = 0.9;
      for (let x = 0; x <= w; x += w / 12) if (hash(x + 1330) < 0.5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let i = 0; i < 12; i++) { const x = Math.round(hash(i + 1320) * 6) * w / 6, y = hash(i + 1321) * h; const gr = g.createLinearGradient(0, y, 0, y + 30); gr.addColorStop(0, 'rgba(130,72,32,0.5)'); gr.addColorStop(1, 'rgba(130,72,32,0)'); g.fillStyle = gr; g.fillRect(x - 1, y, 3, 30); }
    }
  }, true);
  // Nhựa đúc bạc màu (nhân với màu vật liệu, 1 ô = 24 đv): nền gần trắng, loang phấn / ố mờ cỡ lớn, hạt mịn; không gỉ
  const plasticTex = () => texOf('plastic', 128, 128, (g, w, h) => {
    g.fillStyle = '#e6e4dc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = hash(i + 4100) * w, y = hash(i + 4101) * h, r = 14 + hash(i + 4102) * 34, k = hash(i + 4103);
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, x + ox, y + oy, r, k < 0.45 ? '255,255,250' : k < 0.8 ? '150,140,116' : '120,126,96', 0.16);
    }
    speckle(g, w, h, 900, ['#c9c5b8', '#f6f5f0', '#b3ad9c'], 1, 1.6, 4110);
  }, true);
  // Sơn kẻ sọc vàng đen (1 ô = 16 đơn vị)
  const hazardTex = () => texOf('hazard', 128, 128, (g, w, h) => {
    g.fillStyle = '#d9a61c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b';
    for (let k = -2; k < 3; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 32, 0); g.lineTo(k * 64 + 32 + 128, h); g.lineTo(k * 64 + 128, h); g.fill(); }
    speckle(g, w, h, 640, ['#5a4a20', '#efe0a0'], 1, 2, 77);
    if (ABANDONED) ageCanvas(g, w, h, 11, 1.1);
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
      if (ABANDONED) ageCanvas(g, w, h, key.length * 13 + 3, 0.8);
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
    // nằm trong giếng ẩm nhiều năm: bụi bám, ố nước, vệt gỉ từ mối ghép tầng (nhẹ hơn đồ ngoài trời)
    if (ABANDONED) ageCanvas(g, w, h, 707, 0.55);
  });
  // Lớp chống nhiệt đầu đạn (u quanh thân, v từ chân lên mũi): than chì xám nâu loang, hạt sần, vệt cháy dọc theo dòng
  // khí, 3 mối ghép vòng, mũi ngả sẫm hơn
  const rvTex = () => texOf('rv', 256, 256, (g, w, h) => {
    g.fillStyle = '#3d3b37'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) for (const ox of [-w, 0, w]) blotch(g, hash(i + 5100) * w + ox, hash(i + 5101) * h, 10 + hash(i + 5102) * 30, hash(i + 5103) < 0.5 ? '92,86,76' : '24,23,21', 0.22);
    for (let i = 0; i < 70; i++) {
      const x = hash(i + 5200) * w, l = 30 + hash(i + 5201) * 160, gr = g.createLinearGradient(0, h, 0, h - l);
      gr.addColorStop(0, 'rgba(20,19,17,0.3)'); gr.addColorStop(1, 'rgba(20,19,17,0)'); g.fillStyle = gr; g.fillRect(x, h - l, 1 + hash(i + 5202) * 2, l);
    }
    speckle(g, w, h, 2600, ['rgba(110,104,94,1)', 'rgba(18,17,16,1)'], 1, 2, 5300);
    g.fillStyle = 'rgba(14,14,13,0.75)'; for (const v of [0.08, 0.38, 0.7]) g.fillRect(0, h * (1 - v), w, 2);
    const gt = g.createLinearGradient(0, 0, 0, h * 0.35); gt.addColorStop(0, 'rgba(12,12,11,0.55)'); gt.addColorStop(1, 'rgba(12,12,11,0)'); g.fillStyle = gt; g.fillRect(0, 0, w, h * 0.35);
  });
  // Sân bê tông các công trình: texture riêng (vạch sơn, mạch co giãn, vết dầu, vết cháy xém)
  // (f0..f1, r0..r1: phạm vi sân theo toạ độ cục bộ công trình)
  // Ảnh chi tiết lát lặp 256 px / 3 m (trung bình ~xám 50% để nhân vào màu nền):
  //  grass: hàng nghìn ngọn cỏ ngắn nhiều sắc độ (xanh đậm gốc, ngọn sáng, ít ngọn úa), kẽ đất tối giữa các khóm
  //  gravel: hạt sỏi tròn nhiều cỡ có bóng đổ nhẹ phía dưới
  function detailTex(kind) {
    const key = 'detail_' + kind;
    if (TEX[key]) return TEX[key];
    const N = 256, c = canvas(N, N), g = c.getContext('2d');
    const wrap = (fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
    if (kind === 'grass') {
      g.fillStyle = '#6a6d5c'; g.fillRect(0, 0, N, N);
      for (let i = 0; i < 160; i++) { const x = hash(i + 4100) * N, y = hash(i + 4101) * N, r = 4 + hash(i + 4102) * 12; wrap(() => { g.fillStyle = 'rgba(40,40,30,0.25)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }); }
      for (let i = 0; i < 9000; i++) {
        const x = hash(i + 4200) * N, y = hash(i + 4201) * N, l = 3 + hash(i + 4202) * 6, a = -Math.PI / 2 + (hash(i + 4203) - 0.5) * 1.3;
        const t = hash(i + 4204), dry = hash(i + 4205) < 0.08;
        const v = 70 + t * 110, col = dry ? `rgb(${v + 30},${v + 22},${v - 8})` : `rgb(${v - 4},${v + 4},${v - 10})`;
        wrap(() => { g.strokeStyle = col; g.lineWidth = 0.8 + hash(i + 4206) * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); });
      }
    } else {
      g.fillStyle = '#7b7873'; g.fillRect(0, 0, N, N);
      for (let i = 0; i < 2600; i++) {
        const x = hash(i + 4400) * N, y = hash(i + 4401) * N, r = 0.8 + Math.pow(hash(i + 4402), 2) * 3.2, v = 90 + hash(i + 4403) * 110;
        wrap(() => {
          g.fillStyle = 'rgba(30,28,26,0.35)'; g.beginPath(); g.ellipse(x + r * 0.3, y + r * 0.4, r, r * 0.8, 0, 0, TAU); g.fill();
          g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.beginPath(); g.ellipse(x, y, r, r * 0.8, hash(i + 4404) * 3, 0, TAU); g.fill();
        });
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return (TEX[key] = t);
  }
  // Đường nội bộ bãi phóng (f, r cục bộ; bề rộng): cổng -> khu cấm silo, trục dọc trước, trục nhà xe / trạm điện,
  // nhánh tới cửa trung tâm điều khiển. Nút giao: [f, r, rộng theo f, rộng theo r]
  const NUKE_ROADS = [[[[320, 0], [160, 0]], 36], [[[180, -300], [180, 280]], 28], [[[180, 240], [-210, 240]], 26], [[[180, -200], [-60, -200], [-60, -270], [-92, -270]], 24]];
  // nền sỏi quanh công trình: khu cấm silo, cổng, gò điều khiển, nhà xe, trạm điện, bồn nhiên liệu, chân tháp canh...
  const nukeGravel = (hu) => [[-216, -170, 156, 210], [hu - 150, -70, hu, 70], [-250, -366, -80, -180], [-25, 252, 150, 348], [-200, 262, -90, 338],
    [-98, -448, 18, -332], [hu - 110, 120, hu - 60, 215], [180, -200, 230, -140], [-260, -50, -210, 50]];
  // mặt bê tông phẳng không có hộp va chạm (sân trực thăng, sân trước nhà xe, bệ biến áp): chỉ cỏ mọc khe nứt
  // Kịch bản: căn cứ bị bỏ hoang (người chơi phải chiếm lại) — cỏ dại um tùm, mất điện
  const ABANDONED = true;
  const NUKE_SLABS = [[40, -428, 200, -298], [-15, 218, 135, 262], [-91, 241, -65, 303]];
  const NUKE_JUNCTIONS = [[180, 0, 28, 36], [180, 240, 28, 26], [180, -200, 28, 24], [-60, -200, 24, 24], [-60, -270, 24, 24]];
  // Mặt bằng từng căn cứ: đường nội bộ, nút giao, nền sỏi, mặt bê tông phẳng, vùng không mọc cỏ (bệ trên gò)
  // Công trình đăng ký từ file riêng (src/gameplay/landmarks/<loại>.js): window.LandmarkKinds[loại] =
  // { name, icon, color, site: { roads, junctions, gravel, slabs, noGrow }, build(K, group, anim, api) }
  const KINDS = (typeof window !== 'undefined' && (window.LandmarkKinds = window.LandmarkKinds || {})) || {};
  const siteOf = (k) => SITES[k] || (KINDS[k] && KINDS[k].site) || null;
  // Bãi phóng (dựng ở buildNuke): mặt đất thật quanh mặt tiền trung tâm điều khiển — lưới thô ở đó bị MapGen (nukeCoarse)
  // hạ thấp cho khỏi thành dốc cỏ lấp cửa hầm; xe / đạn / đồ vật đặt theo gò thật (vách cắt đứng trong thân tường mặt tiền)
  KINDS.nuke = Object.assign(KINDS.nuke || {}, {
    surface(L, f, r) {
      const C = L.silo && L.silo.lcc, CE = typeof MapGen !== 'undefined' ? MapGen.CELL : 0;
      if (!C || !CE || f < C.f + C.hf - 40 - 2 * CE || f > C.f + C.hf + 30 + 2 * CE || Math.abs(r - C.r) > C.hr + C.run + 2 * CE) return null;
      const S = L.silo;
      if (Math.abs(f - S.f) < S.hf + S.run && Math.abs(r - S.r) < S.hr + S.run) return null;   // gò silo: lưới thô giữ nguyên
      return MapGen.landmarkMound(L, f, r, 'cap');
    }
  });
  const SITES = {
    nuke: { roads: NUKE_ROADS, junctions: NUKE_JUNCTIONS, gravel: nukeGravel, slabs: NUKE_SLABS, noGrow: [[-132, -86, 72, 86]] }
  };
  // Mặt đường nhựa (u dọc đường: 1 ô = 12 m, v ngang: 0..1 = cả bề rộng): cốt liệu đá lấm tấm, vệt bánh xe mòn sáng,
  // vệt dầu giữa làn, vết nứt + đường trám nhựa đen, mép sứt; vạch biên trắng + vạch tim vàng đứt (3 m vạch / 9 m trống).
  // plain = nhựa trơn không vạch (vá nút giao)
  function asphaltTex(plain) {
    const key = plain ? 'asph_plain' : 'asph';
    if (TEX[key]) return TEX[key];
    const W = 1024, H = plain ? 1024 : 256, c = canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    for (let i = 0; i < W * H; i++) {
      let v = 60 + (hash(i * 0.37 + 11) - 0.5) * 22;
      const q = hash(i * 1.13 + 5);
      if (q < 0.035) v += 40 + hash(i + 3) * 40; else if (q < 0.06) v -= 20;
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v + 2; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 70; i++) blotch(g, hash(i + 5100) * W, hash(i + 5101) * H, 20 + hash(i + 5102) * 90, hash(i + 5103) < 0.5 ? '40,40,42' : '96,96,94', 0.18);
    if (!plain) {
      // vệt bánh xe 2 làn (mòn bóng, sáng hơn) + vệt dầu giữa làn
      for (const [v0, v1, col] of [[0.12, 0.2, 'rgba(110,110,108,0.18)'], [0.32, 0.4, 'rgba(110,110,108,0.18)'], [0.6, 0.68, 'rgba(110,110,108,0.18)'], [0.8, 0.88, 'rgba(110,110,108,0.18)'],
        [0.22, 0.3, 'rgba(18,18,20,0.22)'], [0.7, 0.78, 'rgba(18,18,20,0.22)']]) {
        const gr = g.createLinearGradient(0, v0 * H, 0, v1 * H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, v0 * H, W, (v1 - v0) * H);
      }
    }
    // vết nứt lớn (đường bỏ hoang lâu năm) + cỏ dại / rêu mọc dọc khe nứt
    for (let i = 0; i < (plain ? 14 : 10); i++) {
      let x = hash(i + 5200) * W, y = hash(i + 5201) * H, a = hash(i + 5202) * TAU;
      const pts = [[x, y]];
      for (let k = 0; k < 16; k++) { a += (hash(i * 17 + k) - 0.5) * 0.9; x += Math.cos(a) * 14; y += Math.sin(a) * 6; pts.push([x, y]); }
      g.strokeStyle = 'rgba(14,14,16,0.8)'; g.lineWidth = 2.4; g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      if (ABANDONED) for (const [px, py] of pts) for (let k = 0; k < 6; k++) {
        const ox = px + (hash(px + k * 3.1) - 0.5) * 8, oy = py + (hash(py + k * 5.3) - 0.5) * 5;
        g.fillStyle = hash(ox + oy) < 0.6 ? 'rgba(78,88,46,0.85)' : 'rgba(120,112,64,0.8)'; g.fillRect(ox, oy, 2 + hash(ox) * 3, 1.5 + hash(oy) * 2);
      }
    }
    g.strokeStyle = 'rgba(20,20,22,0.6)'; g.lineWidth = 0.8;
    for (let i = 0; i < 40; i++) { let x = hash(i + 5300) * W, y = hash(i + 5301) * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (hash(i * 7 + k + 9) - 0.5) * 18; y += (hash(i * 5 + k + 3) - 0.5) * 10; g.lineTo(x, y); } g.stroke(); }
    if (!plain) {
      // mép đường sứt (tối, lởm chởm)
      for (let x = 0; x < W; x += 3) for (const e of [0, 1]) { const dd = 2 + hash(x * 0.7 + e * 31) * 6; g.fillStyle = 'rgba(30,28,26,0.6)'; g.fillRect(x, e ? H - dd : 0, 3, dd); }
      // vạch sơn (sơn mòn: lấm tấm hở nhựa)
      const paint = (x, y, w, h, col) => {
        g.fillStyle = col; g.fillRect(x, y, w, h);
        for (let i = 0; i < w * h / 14; i++) { g.fillStyle = 'rgba(60,60,62,0.55)'; g.fillRect(x + hash(i + x + y * 3) * w, y + hash(i * 3 + x + 7) * h, 1.5, 1.5); }
      };
      const fa = ABANDONED ? 0.55 : 0.9;   // sơn phai
      paint(0, H * 0.045, W, H * 0.03, `rgba(226,224,214,${fa})`); paint(0, H * 0.925, W, H * 0.03, `rgba(226,224,214,${fa})`);
      paint(0, H * 0.485, W * 0.25, H * 0.03, `rgba(214,170,40,${fa})`);
      if (ABANDONED) {
        // đất cát + lá mục dạt mép đường, cỏ lấn từ lề vào
        for (const e of [0, 1]) for (let i = 0; i < 160; i++) {
          const x = hash(i + e * 400 + 5600) * W, y = (e ? H - 1 : 0) + (e ? -1 : 1) * hash(i + e * 400 + 5601) * H * 0.16;
          blotch(g, x, y, 6 + hash(i + 5602) * 16, hash(i + 5603) < 0.5 ? '96,84,62' : '88,94,52', 0.4);
        }
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = plain ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    return (TEX[key] = t);
  }
  // Dải mặt đường theo đường gấp khúc (nối góc kiểu vát), u = quãng dọc / 96, v = 0..1 ngang
  function roadStripGeo(pts, wd, y) {
    const pos = [], uv = [], idx = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tf = b[0] - a[0], tr = b[1] - a[1]; const l = Math.hypot(tf, tr) || 1; tf /= l; tr /= l;
      let nf = -tr, nr = tf, k = 1;
      if (i > 0 && i < pts.length - 1) {
        const d0 = [p[0] - a[0], p[1] - a[1]], l0 = Math.hypot(...d0), n0 = [-d0[1] / l0, d0[0] / l0];
        k = 1 / Math.max(0.5, n0[0] * nf + n0[1] * nr);
      }
      if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (const sd of [-1, 1]) { pos.push(p[0] + nf * sd * wd / 2 * k, y, p[1] + nr * sd * wd / 2 * k); uv.push(acc / 96, sd < 0 ? 0 : 1); }
      if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i]; I[i] = I[i + 1]; I[i + 1] = t; } g.computeVertexNormals(); }
    return g;
  }
  // Lưới đường nội bộ: dải nhựa + mảng vá nút giao (che vạch tim) + vạch dừng, chữ STOP, ô đỗ xe
  function roadNet(group, roads, junctions, extra) {
    const mk = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const rm = MAT.road || (MAT.road = mk(asphaltTex(false))), pm = MAT.roadPlain || (MAT.roadPlain = mk(asphaltTex(true)));
    roads.forEach(([pts, wd], i) => { const m = new THREE.Mesh(roadStripGeo(pts, wd, 0.5 + i * 0.03), rm); m.receiveShadow = true; group.add(m); });
    for (const [f, r, wf, wr] of junctions) {
      const g = new THREE.PlaneGeometry(wf + 1, wr + 1); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv, P = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (P.getX(i) + f) / 96, (P.getZ(i) + r) / 96);
      const m = new THREE.Mesh(g, pm); m.position.set(f, 0.65, r); m.receiveShadow = true; group.add(m);
    }
    const paintM = MAT.paintW || (MAT.paintW = new THREE.MeshStandardMaterial({ color: 0xe2e0d6, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    for (const [f, r, wf, wr] of extra.bars) { const g = new THREE.PlaneGeometry(wf, wr); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, paintM); m.position.set(f, 0.75, r); group.add(m); }
    for (const [txt, f, r, rot, sz] of extra.words) {
      const t = texOf('word_' + txt, 256, 96, (q, w, h) => { q.fillStyle = 'rgba(226,224,214,0.92)'; q.font = 'bold 84px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.save(); q.scale(1, 1); q.fillText(txt, w / 2, h / 2 + 4); q.restore(); });
      const g = new THREE.PlaneGeometry(sz, sz * 96 / 256); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, decalT('word_' + txt, t)); m.position.set(f, 0.78, r); m.rotation.y = rot; group.add(m);
    }
  }
  function apronTex(kind, f0, f1, r0, r1) {
    const SI0 = siteOf(kind), W = SI0 && SI0.yard ? 1536 : 1024, Hh = Math.round(W * (r1 - r0) / (f1 - f0));
    return texOf('apron_' + kind, W, Hh, (g, w, h) => {
      const SI = siteOf(kind);
      if (SI) {
        // nền sỏi đầm chặt (rải thuốc diệt cỏ), vệt bánh xe nhạt từ cổng vào
        // (tông sỏi trầm hơn + loang đất / cỏ dại: dải sỏi giữa 2 lớp rào trước đây sáng trắng đều như dải nhựa)
        g.fillStyle = '#958d7c'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) blotch(g, hash(i + 900) * w, hash(i + 901) * h, 30 + hash(i + 902) * 90, hash(i + 903) < 0.5 ? '112,104,90' : '176,168,152', 0.25);
        for (let i = 0; i < 700; i++) blotch(g, hash(i + 960) * w, hash(i + 961) * h, 3 + hash(i + 962) * 16, hash(i + 963) < 0.5 ? '96,90,62' : hash(i + 963) < 0.8 ? '104,92,72' : '70,76,46', 0.3);
        speckle(g, w, h, 26000, ['#7c7568', '#c9c2b2', '#8f877a', '#5f594f', '#b3ab9a'], 1, 3.2, 911);
        const P = (f, r) => [(f - f0) / (f1 - f0) * w, (r - r0) / (r1 - r0) * h], S = w / (f1 - f0);
        const rect = (fa, ra, fb, rb, col) => { const [x0, y0] = P(Math.min(fa, fb), Math.min(ra, rb)); g.fillStyle = col; g.fillRect(x0, y0, Math.abs(fb - fa) * S, Math.abs(rb - ra) * S); };
        const hu = f1, hv = r1, iF = hu - 62, iR = hv - 62;
        // cỏ trong khu trong (lốm đốm, ngả vàng chỗ xe đi), viền đường tuần tra sỏi đầm
        // sân lát (site.yard: bê tông / nhựa, khe nứt mọc cỏ, vệt dầu) thay cho bãi cỏ trong khu
        if (SI.yard) SI.yard({ g, P, S, w, h, mask: false, inner: [-iF + 24, -iR + 24, iF - 24, iR - 24], hash, blotch, speckle });
        else rect(-iF + 24, -iR + 24, iF - 24, iR - 24, '#586040');   // cùng tông cỏ địa hình HIGHLAND, không xanh gắt
        // căn cứ bỏ hoang: bãi cỏ lâu không cắt — mảng cỏ khô vàng, mảng xanh đậm um tùm, chỗ đất trống
        if (!SI.yard) { const [x0, y0] = P(-iF + 24, -iR + 24), [x1, y1] = P(iF - 24, iR - 24);
          g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
          for (let i = 0; i < 320; i++) blotch(g, hash(i + 1500) * w, hash(i + 1501) * h, (10 + hash(i + 1502) * 60) * S, hash(i + 1503) < 0.45 ? '62,70,40' : hash(i + 1503) < 0.85 ? '138,124,78' : '104,90,70', 0.32);
          g.restore(); }
        g.strokeStyle = 'rgba(120,112,96,0.95)'; g.lineWidth = 20 * S; g.strokeRect(...P(-iF + 14, -iR + 14), (iF * 2 - 28) * S, (iR * 2 - 28) * S);
        // nền sỏi quanh công trình: khu cấm silo, cổng, gò điều khiển, nhà xe, trạm điện, bồn nhiên liệu, chân tháp canh
        const grav = 'rgba(152,144,128,0.97)';
        for (const [fa, ra, fb, rb] of SI.gravel(hu)) rect(fa, ra, fb, rb, grav);
        // cỏ dại mọc lan trên nền sỏi
        if (!SI.yard) for (let i = 0; i < 900; i++) blotch(g, hash(i + 1800) * w, hash(i + 1801) * h, (2 + hash(i + 1802) * 9) * S, hash(i + 1803) < 0.6 ? '84,90,52' : '126,116,76', 0.4);
        // lề đường đất sỏi mòn (mặt đường nhựa + vạch sơn dựng thành lưới riêng, xem SITES / roadNet)
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (const [pts, wd] of SI.roads) {
          for (const [ex, col] of [[10, 'rgba(118,108,92,0.55)'], [5, 'rgba(92,84,72,0.7)']]) {
            g.strokeStyle = col; g.lineWidth = (wd + ex) * S; g.beginPath(); pts.forEach(([f, r], i) => i ? g.lineTo(...P(f, r)) : g.moveTo(...P(f, r))); g.stroke();
          }
        }
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
  // Bầu trời phản chiếu cho kim loại: không có envMap thì Three.js chỉ còn (1 - metalness) phần màu + chấm loá nắng ->
  // thép không gỉ / nhôm / cửa thép đen kịt bóng như nhựa. Trời xám xanh nhạt, chân trời sáng, dải nhà / cây sẫm, nền đất
  let ENV = null;
  function envCube() {
    if (ENV || typeof document === 'undefined') return ENV;
    const N = 64, sky0 = [188, 194, 196], sky1 = [124, 146, 170], ground = [66, 62, 54], bld = [86, 86, 82];
    const face = dir => {
      const c = canvas(N, N), ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, [dx, dy, dz] = dir(u, v), ny = dy / Math.hypot(dx, dy, dz);
        const az = Math.atan2(dz, dx), sk = 0.03 + 0.05 * Math.max(0, Math.sin(az * 3 + 0.3)) + 0.03 * Math.max(0, Math.sin(az * 11 + 2));
        let col;
        if (ny < 0) { const t = Math.min(1, -ny * 4); col = sky0.map((c0, i) => c0 + (ground[i] - c0) * Math.pow(t, 0.4)); }
        else if (ny < sk) col = bld;
        else { const t = Math.pow(Math.min(1, ny * 1.3), 0.6); col = sky0.map((c0, i) => c0 + (sky1[i] - c0) * t); }
        const p = (y * N + x) * 4; img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); return c;
    };
    ENV = new THREE.CubeTexture([face((u, v) => [1, -v, -u]), face((u, v) => [-1, -v, u]), face((u, v) => [u, 1, v]), face((u, v) => [u, -1, -v]), face((u, v) => [u, -v, 1]), face((u, v) => [-u, -v, -1])]);
    ENV.needsUpdate = true;
    return ENV;
  }
  // gắn phản chiếu trời cho vật liệu kim loại (metalness >= 0.3); phi kim giữ nguyên (ánh trời bán cầu đã đủ)
  function metalize(m) {
    if (m && m.isMeshStandardMaterial && m.metalness >= 0.3 && !m.envMap && envCube()) { m.envMap = ENV; m.envMapIntensity = 0.45 + 0.55 * m.metalness; }
    return m;
  }
  // Thép / sơn bỏ hoang dùng chung cho các công trình riêng (landmarks/*.js): cùng lớp bẩn gỉ, ngả màu, nhám thêm và
  // phản chiếu trời như vật liệu chuẩn; tile: ô texture (đơn vị) khi tự chia UV hộp / trụ
  function metalMat(rust, o, tile) {
    const rr = ABANDONED ? Math.round(Math.min(5, rust * 1.8 + 1.2) * 10) / 10 : rust, [t, b] = grimePair('r' + rr, rr);
    if (ABANDONED && o.color !== undefined) o = Object.assign({}, o, { color: new THREE.Color(o.color).lerp(new THREE.Color(0x7d7262), 0.16).getHex(), roughness: Math.min(1, (o.roughness || 0.6) + 0.12) });
    const m = metalize(new THREE.MeshStandardMaterial(Object.assign({ map: t, bumpMap: b, bumpScale: 0.35 }, o)));
    m.userData.tile = tile === undefined ? 24 : tile;
    return m;
  }
  // Lốp xe tải cũ nằm (tiện tròn quanh trục đứng, ngoài Ø 6.8, trong Ø 2.8, bề rộng 2 đv): mặt cắt vai lốp bo tròn, hông
  // phồng nhẹ, mép tanh mỏng; u quanh lốp, v dọc mặt cắt (giữa = mặt gai) — xem ảnh vật liệu 'tire'
  function tireGeo() {
    if (TEX.tireGeo) return TEX.tireGeo;
    const pr = [[1.45, -0.7], [1.8, -0.95], [2.7, -1.0], [3.15, -0.88], [3.38, -0.55], [3.42, 0], [3.38, 0.55], [3.15, 0.88], [2.7, 1.0], [1.8, 0.95], [1.45, 0.7], [1.4, 0], [1.45, -0.7]];
    return (TEX.tireGeo = new THREE.LatheGeometry(pr.map(([x, y]) => new THREE.Vector2(x, y)), 20));
  }
  // Kính cửa sổ (ảnh 256 px trải trọn ô kính) — v: 'ok' nguyên, 0 lỗ đạn + rạn mạng nhện, 1 rạn từ góc chạy dài tới
  // khung, 2 thủng lỗ lớn lởm chởm, 3 vỡ gần hết còn mảnh nhọn bám khung.
  // Ảnh màu = những gì thấy XUYÊN qua kính (lòng nhà tối, màng bụi dày dần xuống dưới, vệt mưa khô); phản chiếu trời
  // đến từ envMap thật (đổi theo góc nhìn) thay cho vệt loá vẽ sẵn y hệt mọi ô. Ảnh phụ (roughness = G, metalness = B):
  // kính nhẵn bóng, bụi / vết nứt nhám hơn, chỗ thủng nhám hẳn + không kim loại -> không phản chiếu, lộ lòng nhà tối.
  // Vết nứt: sợi mảnh tỏa từ điểm va (lệch hướng, rẽ nhánh), vòng nứt là các đoạn cung lõm nối 2 tia kề nhau ở bán
  // kính lệch nhau (không phải vòng tròn trắng đều), mép thủng ánh xanh lục của cạnh kính
  function glassMat(v) {
    if (MAT['gl_' + v]) return MAT['gl_' + v];
    const N = 256, c = canvas(N, N), g = c.getContext('2d'), sc = canvas(N, N), q = sc.getContext('2d');
    const H = (i) => hash((v === 'ok' ? 4 : v) * 977 + i + 13);
    // lòng nhà nhìn qua kính: trên sẫm xanh xám (trần), giữa tối, đáy hơi sáng (sàn hắt sáng), vài mảng tối (đồ đạc / cột)
    const interior = (x) => {
      const gr = x.createLinearGradient(0, 0, 0, N); gr.addColorStop(0, '#2c3236'); gr.addColorStop(0.55, '#16191a'); gr.addColorStop(1, '#2a2723');
      x.fillStyle = gr; x.fillRect(0, 0, N, N);
      for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(8,8,8,${0.25 + H(i + 900) * 0.3})`; x.fillRect(H(i + 901) * N, N * (0.3 + H(i + 902) * 0.3), 12 + H(i + 903) * 50, N); }
    };
    interior(g);
    // màng bụi bám mặt kính + vệt mưa khô + mảng ố
    const gd = g.createLinearGradient(0, 0, 0, N); gd.addColorStop(0, 'rgba(128,118,98,0.16)'); gd.addColorStop(0.7, 'rgba(128,116,94,0.34)'); gd.addColorStop(1, 'rgba(120,106,82,0.62)');
    g.fillStyle = gd; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 18; i++) blotch(g, H(i + 10) * N, H(i + 11) * N, 14 + H(i + 12) * 40, '132,120,98', 0.12);
    for (let i = 0; i < 26; i++) { const x0 = H(i + 30) * N, y0 = H(i + 31) * N * 0.6, l = 30 + H(i + 32) * 140, gr = g.createLinearGradient(0, y0, 0, y0 + l); gr.addColorStop(0, 'rgba(140,128,104,0.16)'); gr.addColorStop(1, 'rgba(140,128,104,0)'); g.fillStyle = gr; g.fillRect(x0, y0, 1 + H(i + 33) * 2, l); }
    const gs = q.createLinearGradient(0, 0, 0, N); gs.addColorStop(0, 'rgb(0,22,40)'); gs.addColorStop(0.7, 'rgb(0,60,34)'); gs.addColorStop(1, 'rgb(0,125,24)');
    q.fillStyle = gs; q.fillRect(0, 0, N, N);
    for (let i = 0; i < 18; i++) blotch(q, H(i + 10) * N, H(i + 11) * N, 14 + H(i + 12) * 40, '0,150,10', 0.25);
    // lỗ thủng (đa giác): lòng nhà không phủ bụi, không phản chiếu; mép cạnh kính xanh lục mảnh
    const hole = (pts) => {
      const path = (x) => { x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); };
      g.save(); path(g); g.clip(); interior(g); g.restore();
      path(q); q.fillStyle = 'rgb(0,255,0)'; q.fill();
      path(g); g.strokeStyle = 'rgba(150,182,170,0.55)'; g.lineWidth = 1.1; g.stroke();
    };
    // vết nứt: tập đoạn thẳng -> vẽ lên cả 2 ảnh (bóng tối lệch 1 px + sợi sáng mảnh; ảnh phụ: nhám hơn)
    const segs = [];
    const crackNet = (cx, cy, R, n, sd) => {
      const rays = [];
      for (let k = 0; k < n; k++) {
        let a = k / n * TAU + (hash(sd + k) - 0.5) * 0.9, x = cx, y = cy, d = 0;
        const L = R * (0.45 + hash(sd + k + 40) * 0.85), pts = [[x, y, 0]];
        while (d < L) {
          const st = 4 + hash(sd + k * 31 + d) * 7; a += (hash(sd + k * 17 + d * 3) - 0.5) * 0.42;
          const nx = x + Math.cos(a) * st, ny = y + Math.sin(a) * st; segs.push([x, y, nx, ny, 1 - d / L * 0.6]); x = nx; y = ny; d += st; pts.push([x, y, d]);
          if (hash(sd + k * 7 + d) < 0.08) { let bx = x, by = y, ba = a + (hash(sd + d + k) < 0.5 ? -1 : 1) * (0.4 + hash(sd + d) * 0.5); for (let j = 0; j < 3 + hash(sd + d + 9) * 4; j++) { ba += (hash(sd + d + j) - 0.5) * 0.4; const ex = bx + Math.cos(ba) * 5, ey = by + Math.sin(ba) * 5; segs.push([bx, by, ex, ey, 0.6]); bx = ex; by = ey; } }
        }
        rays.push(pts);
      }
      const at = (pts, r) => pts.find(p => p[2] >= r) || pts[pts.length - 1];
      for (let j = 1; j <= 3; j++) for (let k = 0; k < n; k++) {
        if (hash(sd + j * 50 + k) > 0.68) continue;
        const r0 = R * (0.08 + 0.13 * j) * (0.75 + hash(sd + j + k * 3) * 0.5), r1 = r0 * (0.8 + hash(sd + j * 7 + k) * 0.4);
        const A = at(rays[k], r0), B = at(rays[(k + 1) % n], r1);
        if (A[2] < r0 * 0.9 || B[2] < r1 * 0.9) continue;
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, px = mx + (cx - mx) * 0.12, py = my + (cy - my) * 0.12;
        segs.push([A[0], A[1], px, py, 0.8], [px, py, B[0], B[1], 0.8]);
      }
    };
    // điểm va: vùng kính nát vụn trắng đục quanh lỗ đạn nhỏ méo
    const impact = (cx, cy, r, sd) => {
      const cr = r * 2.6, gr = g.createRadialGradient(cx, cy, 0, cx, cy, cr); gr.addColorStop(0, 'rgba(205,212,214,0.75)'); gr.addColorStop(0.6, 'rgba(190,198,200,0.35)'); gr.addColorStop(1, 'rgba(190,198,200,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
      for (let i = 0; i < 70; i++) { const a = hash(sd + i) * TAU, d = Math.pow(hash(sd + i + 99), 0.7) * cr; g.fillStyle = `rgba(232,236,238,${0.3 + hash(sd + i + 7) * 0.5})`; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1); }
      q.fillStyle = 'rgba(0,200,0,0.8)'; q.beginPath(); q.arc(cx, cy, cr, 0, TAU); q.fill();
      const pts = []; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr = r * (0.55 + hash(sd + i + 50) * 0.7); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      hole(pts);
    };
    // lỗ lớn mép lởm chởm: bán kính đổi gắt từng đỉnh (mũi nhọn thò vào lòng lỗ)
    const jagged = (cx, cy, R, n, sd) => { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * TAU + (hash(sd + i) - 0.5) * 0.25, rr = R * (i % 2 ? 0.45 + hash(sd + i + 20) * 0.35 : 0.85 + hash(sd + i + 40) * 0.35); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.1]); } return pts; };
    if (v === 0) { const cx = N * (0.3 + H(1) * 0.4), cy = N * (0.25 + H(2) * 0.45); crackNet(cx, cy, 120, 11, 101); impact(cx, cy, 4, 102); }
    else if (v === 1) {
      const cx = H(3) < 0.5 ? N * 0.1 : N * 0.9, cy = N * (0.08 + H(4) * 0.2);
      crackNet(cx, cy, 70, 7, 201);
      for (let k = 0; k < 4; k++) { let x = cx, y = cy, a = Math.atan2(N * 0.7 - cy, N * 0.5 - cx) + (H(10 + k) - 0.5) * 1.5; for (let s = 0; s < 40; s++) { a += (H(20 + k * 40 + s) - 0.5) * 0.3; const nx = x + Math.cos(a) * 8, ny = y + Math.sin(a) * 8; segs.push([x, y, nx, ny, 0.9]); x = nx; y = ny; if (x < 0 || y < 0 || x > N || y > N) break; } }
      impact(cx, cy, 3, 202);
      const x2 = N * (0.55 + H(5) * 0.3), y2 = N * (0.55 + H(6) * 0.3); crackNet(x2, y2, 40, 8, 203); impact(x2, y2, 2.5, 204);
    } else if (v === 2) {
      const cx = N * (0.35 + H(7) * 0.3), cy = N * (0.35 + H(8) * 0.3), R = 50 + H(9) * 30;
      crackNet(cx, cy, R * 2.4, 14, 301);
      hole(jagged(cx, cy, R, 22, 302));
    } else if (v === 3) {
      // vỡ gần hết: mảnh nhọn dài bám 4 cạnh khung (dạng dao găm, mũi chĩa vào giữa), giữa lộ lòng nhà
      const pts = [], e = [[0, 0, 1, 0], [N, 0, 0, 1], [N, N, -1, 0], [0, N, 0, -1]];
      e.forEach(([x0, y0, dx, dy], s) => {
        const nx = -dy, ny = dx;   // pháp tuyến hướng vào trong ô
        for (let t = 0; t < 1; t += 0.05 + H(s * 40 + t * 97) * 0.07) {
          const deep = H(s * 50 + t * 131) < 0.3 ? 30 + H(s * 60 + t * 71) * 70 : 3 + H(s * 70 + t * 53) * 14;
          pts.push([x0 + dx * N * t + nx * deep, y0 + dy * N * t + ny * deep]);
        }
      });
      hole(pts);
    }
    for (const [x0, y0, x1, y1, a] of segs) {
      g.strokeStyle = `rgba(10,12,12,${0.28 * a})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 0.8, y0 + 0.8); g.lineTo(x1 + 0.8, y1 + 0.8); g.stroke();
      g.strokeStyle = `rgba(222,230,232,${0.55 * a})`; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      q.strokeStyle = 'rgba(0,150,0,0.9)'; q.lineWidth = 1.2; q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.stroke();
    }
    const t = new THREE.CanvasTexture(c), ts = new THREE.CanvasTexture(sc);
    for (const k of [t, ts]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.anisotropy = 4; }
    return (MAT['gl_' + v] = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughnessMap: ts, metalnessMap: ts, roughness: 1, metalness: 1, envMap: envCube(), envMapIntensity: 1.35 }));
  }
  function mat(key) {
    if (MAT[key]) return MAT[key];
    const S = (o) => new THREE.MeshStandardMaterial(o);
    const C = (o) => { const [t, b] = concPair(); return concFloorPatch(S(Object.assign({ map: t, bumpMap: b, bumpScale: 0.32 }, o))); };
    // thép / sơn: lớp bẩn gỉ theo mức (rust), độ sần nhẹ
    // bỏ hoang: gỉ sét / bẩn nhiều hơn hẳn, sơn phai (màu ngả xám-nâu)
    const G = (rust, o) => {
      const rr = ABANDONED ? Math.round(Math.min(5, rust * 1.8 + 1.2) * 10) / 10 : rust, [t, b] = grimePair('r' + rr, rr);
      if (ABANDONED && o.color !== undefined) o = Object.assign({}, o, { color: new THREE.Color(o.color).lerp(new THREE.Color(0x7d7262), 0.16).getHex(), roughness: Math.min(1, (o.roughness || 0.6) + 0.12) });
      return S(Object.assign({ map: t, bumpMap: b, bumpScale: 0.35 }, o));
    };
    // nhựa đúc: ảnh loang mờ không gỉ (ô 24 đv) + lớp phong hoá shader (bạc nắng mặt trên, vệt mưa mặt đứng, bùn chân, rêu)
    const P = (color) => {
      const m = S({ color: ABANDONED ? new THREE.Color(color).lerp(new THREE.Color(0xc9c3b0), 0.22).getHex() : color, roughness: 0.84, metalness: 0, map: plasticTex() });
      return typeof Weathering !== 'undefined' ? Weathering.apply(m, 'plastic', { space: 'world', grime: 0.9, grimeH: 3, moss: 0.5 }) : m;
    };
    const m = {
      conc: () => C({ color: ABANDONED ? 0xb9b5aa : 0xd6d2c8, roughness: 0.95 }),
      concDark: () => C({ color: 0x9a968c, roughness: 0.97 }),
      // mạch ghép tấm bê tông / khe nứt: rãnh sẫm vẫn nhận nắng (không đen tuyền như 'void' -> nét kẻ mực)
      seam: () => C({ color: 0x5e5a52, roughness: 1, bumpScale: 0.2 }),
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
      // kính rạn nứt chân chim (bỏ hoang): kính an toàn nhiều lớp bị đạn bắn rạn mạng nhện, vết nứt trắng bạc phản quang
      // kính vỡ (bỏ hoang) 4 kiểu, Kit.add chọn theo thứ tự dựng -> các ô cạnh nhau không giống nhau:
      // 0 vết đạn rạn mạng nhện lệch tâm · 1 vết va đập ở góc + vài vết nứt dài chạy ra khung · 2 hai vết đạn
      // 3 vỡ gần hết: lòng nhà tối, còn mảnh kính lởm chởm bám khung
      glassBroken: () => glassMat(0), glassBroken1: () => glassMat(1), glassBroken2: () => glassMat(2), glassBroken3: () => glassMat(3),
      // kính xe: trong suốt (nhìn thấy nội thất), ám bụi cát dày dần xuống dưới, 2 mặt
      carGlass: () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15, metalness: 0.2, map: texOf('carGlass', 64, 64, (q, w, h) => {
        const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(150,170,182,0.32)'); gr.addColorStop(0.6, 'rgba(96,104,104,0.28)'); gr.addColorStop(1, 'rgba(176,154,118,0.62)');
        q.fillStyle = gr; q.fillRect(0, 0, w, h);
        q.fillStyle = 'rgba(255,255,255,0.22)'; q.beginPath(); q.moveTo(w * 0.2, 0); q.lineTo(w * 0.38, 0); q.lineTo(w * 0.1, h); q.lineTo(-w * 0.08, h); q.fill();
        for (let i = 0; i < 9; i++) { q.fillStyle = 'rgba(150,130,100,0.3)'; q.fillRect(hash(i + 8600) * w, h * (0.35 + hash(i + 8601) * 0.3), 1, h); }
      }) }),
      // kính nguyên: phản chiếu trời thật qua envMap + lòng nhà tối, bụi bám (xem glassMat)
      glass: () => glassMat('ok'),
      hazard: () => S({ map: hazardTex(), roughness: 0.75 }),
      bands: () => S({ map: bandTex(), roughness: 0.55, metalness: 0.2 }),
      icbm: () => S({ map: icbmTex(), roughness: 0.42, metalness: 0.15 }),
      missile: () => S({ color: 0xc3c8b9, roughness: 0.5, metalness: 0.2 }),
      // căn cứ bỏ hoang, mất điện: đèn tắt (chỉ còn màu kính đèn)
      lampRed: () => S({ color: 0x6a1a14, emissive: 0xff2a1a, emissiveIntensity: ABANDONED ? 0 : 1.4, roughness: 0.35 }),
      lampAmber: () => S({ color: 0x7a5a1a, emissive: 0xffa21a, emissiveIntensity: ABANDONED ? 0 : 1.2, roughness: 0.35 }),
      wood: () => G(0, { color: 0x7a5c38, roughness: 0.9 }),
      sand: () => G(0, { color: 0xa48f68, roughness: 1, bumpScale: 0.8 }),
      // đất nén nóc rọ Hesco: đất nâu sẫm lổn nhổn, sỏi, cỏ dại lún phún
      soil: () => S({ roughness: 1, map: texOf('soilTop', 128, 128, (q, w, h) => {
        q.fillStyle = '#5f523f'; q.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) blotch(q, hash(i + 9400) * w, hash(i + 9401) * h, 6 + hash(i + 9402) * 18, hash(i + 9403) < 0.5 ? '78,66,48' : '120,104,78', 0.35);
        speckle(q, w, h, 900, ['#4a3f30', '#8c7b60', '#a09482'], 1, 2.4, 9410);
        for (let i = 0; i < 260; i++) {
          const x = hash(i + 9420) * w, y = hash(i + 9421) * h, l = 2 + hash(i + 9422) * 5, a = hash(i + 9423) * TAU, v = 60 + hash(i + 9424) * 60 | 0;
          q.strokeStyle = `rgba(${v},${v + 22},${v - 20},0.85)`; q.lineWidth = 0.8; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); q.stroke();
        }
      }, true) }),
      // sứ cách điện tráng men nâu (sứ máy biến áp / cầu dao): bóng men, không gỉ
      porcelain: () => S({ color: 0x4a3426, roughness: 0.3, metalness: 0 }),
      // lòng nhà / hầm nhìn qua cửa mở: tối, sàn sáng dần ra phía cửa (ánh ngoài trời hắt vào), bóng đồ vật mờ —
      // vật liệu cơ bản (không nhận nắng: bên trong luôn tối) thay cho mặt phẳng đen tuyền như tấm bìa
      interior: () => new THREE.MeshBasicMaterial({ map: texOf('interior', 128, 128, (q, w, h) => {
        // phối cảnh 1 điểm tụ: trần tối, 2 vách, tường hậu, sàn sáng dần ra phía cửa
        const quad = (pts, col) => { q.beginPath(); pts.forEach(([x, y], i) => i ? q.lineTo(x * w, y * h) : q.moveTo(x * w, y * h)); q.closePath(); q.fillStyle = col; q.fill(); };
        q.fillStyle = '#050505'; q.fillRect(0, 0, w, h);
        quad([[0, 0], [0.3, 0.22], [0.3, 0.6], [0, 1]], '#121110');
        quad([[1, 0], [0.7, 0.22], [0.7, 0.6], [1, 1]], '#0e0e0d');
        quad([[0.3, 0.22], [0.7, 0.22], [0.7, 0.6], [0.3, 0.6]], '#090909');
        const gf = q.createLinearGradient(0, h * 0.6, 0, h); gf.addColorStop(0, '#0d0c0b'); gf.addColorStop(1, '#35312a');
        q.beginPath(); q.moveTo(0, h); q.lineTo(w, h); q.lineTo(w * 0.7, h * 0.6); q.lineTo(w * 0.3, h * 0.6); q.closePath(); q.fillStyle = gf; q.fill();
        const gs = q.createRadialGradient(w / 2, h * 1.1, 4, w / 2, h * 1.1, w * 0.75); gs.addColorStop(0, 'rgba(80,74,64,0.45)'); gs.addColorStop(1, 'rgba(80,74,64,0)'); q.fillStyle = gs; q.fillRect(0, 0, w, h);
        // bóng đồ vật: chồng hòm sát vách trái, thùng phuy, khung giá phía sau
        quad([[0.08, 0.66], [0.22, 0.62], [0.22, 0.8], [0.08, 0.86]], 'rgba(0,0,0,0.75)');
        quad([[0.62, 0.52], [0.68, 0.52], [0.68, 0.64], [0.62, 0.64]], 'rgba(0,0,0,0.7)');
        q.fillStyle = 'rgba(0,0,0,0.6)'; q.fillRect(w * 0.36, h * 0.34, w * 0.14, h * 0.26);
      }) }),
      bagGreen: () => G(0, { color: 0x6b6a4a, roughness: 1, bumpScale: 0.8 }),
      drumBlue: () => G(1.2, { color: 0x2f4f7a, roughness: 0.6, metalness: 0.3 }),
      // nhựa HDPE (phuy cứu hộ, bình IBC, thùng rác y tế): KHÔNG gỉ — bạc phấn nắng mưa, ố vàng, bẩn bùn chân, rêu tảo
      plasticYellow: () => P(0xd6ad3a),
      plasticWhite: () => P(0xd3cfbd),
      plasticRed: () => P(0xa63a2c),
      // băng dây thép gai lưỡi dao (ribbonGeo): lõi băng giữa + cụm 4 lưỡi dao nhọn 2 mép mỗi ô; mạ kẽm xỉn, gỉ lốm đốm;
      // 2 mặt, alpha cắt hình lưỡi (ngưỡng thấp: ảnh mip xa trung bình alpha ~0.4, băng không biến mất khi nhìn xa)
      razor: () => metalize(S({ color: 0x9a9d9c, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide, alphaTest: 0.3, map: texOf('razor', 64, 16, (q, w, h) => {
        q.clearRect(0, 0, w, h);
        q.fillStyle = '#c4c6c4'; q.fillRect(0, h * 0.36, w, h * 0.28);
        for (const x0 of [w * 0.12, w * 0.62]) {
          q.beginPath(); q.moveTo(x0, h * 0.4); q.lineTo(x0 + w * 0.05, 0); q.lineTo(x0 + w * 0.13, h * 0.4); q.closePath();
          q.moveTo(x0 + w * 0.13, h * 0.6); q.lineTo(x0 + w * 0.2, h); q.lineTo(x0 + w * 0.26, h * 0.6); q.closePath(); q.fill();
        }
        q.fillStyle = 'rgba(120,70,36,0.7)'; for (let i = 0; i < 10; i++) q.fillRect(hash(i + 4400) * w, h * 0.38, 1 + hash(i + 4401) * 3, h * 0.24);
      }, true) })),
      // cao su lốp cũ phơi nắng mưa (ngả xám tro, không đen tuyền bóng): gai lốp giữa mặt cắt, chữ nổi hông lốp mờ, bụi bùn
      tire: () => {
        const m = S({ color: 0xffffff, roughness: 0.96, metalness: 0, map: texOf('tire', 256, 64, (q, w, h) => {
          q.fillStyle = '#3a3936'; q.fillRect(0, 0, w, h);
          const t0 = h * 0.34, t1 = h * 0.66;   // mặt gai (v 0.33..0.67 của mặt cắt tiện)
          q.fillStyle = '#2a2927'; q.fillRect(0, t0, w, t1 - t0);
          q.fillStyle = '#161514';
          for (let k = 0; k < 30; k++) { const x = k * w / 30; q.fillRect(x, t0, 2, t1 - t0); q.save(); q.translate(x + w / 60, (t0 + t1) / 2); q.rotate(0.5); q.fillRect(-1, -(t1 - t0) * 0.3, 2, (t1 - t0) * 0.6); q.restore(); }
          q.fillRect(0, (t0 + t1) / 2 - 1, w, 2);
          for (const y of [h * 0.17, h * 0.83]) for (let k = 0; k < 9; k++) { q.fillStyle = 'rgba(92,90,84,0.6)'; q.fillRect(k * w / 9 + 6, y - 2, 14, 4); }   // chữ nổi hông lốp
          speckle(q, w, h, 1400, ['rgba(120,108,86,1)', 'rgba(70,66,58,1)', 'rgba(140,132,116,1)'], 1, 2, 4310);
          for (let i = 0; i < 14; i++) blotch(q, hash(i + 4320) * w, hash(i + 4321) * h, 6 + hash(i + 4322) * 14, '110,96,70', 0.35);   // bùn khô
        }, true) });
        return typeof Weathering !== 'undefined' ? Weathering.apply(m, 'plastic', { space: 'world', grime: 0.8, fade: 0.4, streak: 0.1, moss: 0.25 }) : m;
      },
      drumRust: () => G(4, { color: 0x6a4a30, roughness: 0.85, metalness: 0.3 }),
      cardboard: () => G(0, { color: 0xa88a60, roughness: 1 }),
      // dây leo rủ từ đỉnh tường: nhiều sợi lá nhỏ dài ngắn khác nhau, nền trong suốt
      vine: () => S({ side: THREE.DoubleSide, alphaTest: 0.45, roughness: 0.95, map: texOf('vine', 128, 256, (q, w, h) => {
        q.clearRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
          let x = hash(i + 8500) * w, y = 0; const l = (0.25 + hash(i + 8501) * 0.75) * h;
          while (y < l) {
            x += (hash(x + y) - 0.5) * 3; y += 3;
            const k = 0.6 + hash(y + i) * 0.5, sz = 2 + hash(x * 0.3 + i) * 3.5 * (1 - y / h * 0.5);
            q.fillStyle = `rgb(${50 * k | 0},${70 * k | 0},${30 * k | 0})`; q.beginPath(); q.ellipse(x + (hash(y * 0.7) - 0.5) * 6, y, sz, sz * 0.7, hash(y) * 3, 0, TAU); q.fill();
          }
        }
      }) }),
      paper: () => S({ color: 0x9c9482, roughness: 1, side: THREE.DoubleSide }),   // giấy rác bẩn, ngả màu
      // đất cát / lá mục dạt quanh chân công trình (dải mờ dần ra ngoài; đáy ảnh = v 0 = chân tường, đậm nhất)
      // (dải liền mảng, mép ngoài lượn sóng không đều, đậm nhạt loang theo nhiễu + vụn lá thuôn thưa; trước đây 260 chấm
      // tròn bị kéo dài dọc cạnh -> vệt "da báo" quanh mọi chân công trình). u lặp theo cạnh (tần số nguyên), v = 0 chân tường
      dirtRing: () => S({ map: texOf('dirtRing2', 256, 64, (q, w, h) => {
        const img = q.createImageData(w, h), D = img.data, T2 = Math.PI * 2;
        const n1 = (u) => 0.5 + 0.22 * Math.sin(T2 * 2 * u + 0.7) + 0.16 * Math.sin(T2 * 5 * u + 2.1) + 0.1 * Math.sin(T2 * 11 * u + 4.4);
        const n2 = (u, v) => 0.5 + 0.24 * Math.sin(T2 * 3 * u + 3.1 * Math.sin(T2 * v * 0.8) + 0.4) + 0.16 * Math.sin(T2 * 7 * u - 4 * v + 1.9) + 0.1 * Math.sin(T2 * 13 * u + 9 * v);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const u = x / w, d = 1 - y / h, e = 0.4 + 0.45 * n1(u), t = Math.max(0, Math.min(1, (d - (e - 0.38)) / 0.38)), m = n2(u, d);
          const a = (1 - t * t * (3 - 2 * t)) * (0.5 + 0.5 * m) * 0.82 * (0.75 + 0.25 * hash(x * 7.1 + y * 131.3));
          const k = Math.max(0, Math.min(1, m * 1.4 - 0.2)), p = (y * w + x) * 4;   // k: đất mùn sẫm -> đất cát / lá mục ngả ô-liu
          D[p] = 66 + k * 38; D[p + 1] = 58 + k * 34; D[p + 2] = 42 + k * 20; D[p + 3] = Math.round(a * 255);
        }
        q.putImageData(img, 0, 0);
        for (let i = 0; i < 70; i++) {
          const x = hash(i + 8100) * w, y = (0.35 + 0.65 * hash(i + 8101)) * h, l = 2 + hash(i + 8102) * 3.5;
          q.fillStyle = hash(i + 8103) < 0.5 ? 'rgba(92,72,44,0.35)' : 'rgba(96,98,56,0.3)';
          q.beginPath(); q.ellipse(x, y, l, l * 0.35, hash(i + 8104) * 3, 0, TAU); q.fill();
        }
      }, true), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      tarp: () => G(0, { color: 0x4a5236, roughness: 0.95 }),
      hesco: () => S({ map: hescoTex(), color: 0xffffff, roughness: 1 }),
      steelRust: () => G(3, { color: 0x5a463a, roughness: 0.72, metalness: 0.45 }),
      steelRust2: () => G(4, { color: 0x6a4632, roughness: 0.8, metalness: 0.35 }),
      // thân bồn thép sơn trắng ngà: 2 vành tôn (mỗi vành 2.4 m) có mối hàn ngang + mối hàn đứng so le, vệt bẩn mưa nhẹ
      tankShell: () => S({ color: 0xffffff, roughness: 0.55, metalness: 0.15, map: texOf('tankShell', 512, 256, (q, w, h) => {
        q.fillStyle = '#e1ded6'; q.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { const x = hash(i + 3300) * w, l = 30 + hash(i + 3301) * 150, gr = q.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(120,112,98,0.18)'); gr.addColorStop(1, 'rgba(120,112,98,0)'); q.fillStyle = gr; q.fillRect(x, 0, 2 + hash(i + 3302) * 5, l); }
        q.fillStyle = 'rgba(90,86,78,0.55)'; q.fillRect(0, h / 2 - 1, w, 2); q.fillRect(0, 0, w, 2); q.fillRect(0, h - 2, w, 2);
        for (let k = 0; k < 4; k++) { q.fillRect(k * w / 4 + 20, 0, 2, h / 2); q.fillRect(k * w / 4 + 84, h / 2, 2, h / 2); }
        const gb = q.createLinearGradient(0, h * 0.8, 0, h); gb.addColorStop(0, 'rgba(90,80,64,0)'); gb.addColorStop(1, 'rgba(90,80,64,0.35)'); q.fillStyle = gb; q.fillRect(0, h * 0.8, w, h * 0.2);
        speckle(q, w, h, 900, ['rgba(120,116,106,1)', 'rgba(250,250,246,1)'], 1, 2, 3310);
        // bỏ hoang: sơn phai phấn, vệt gỉ chảy từ mối hàn vành / mép mái, bụi bùn bắn chân bồn (trước: trắng sạch bóng)
        if (ABANDONED) ageCanvas(q, w, h, 3390, 0.95);
      }) }),
      corrTan: () => { const [t, b] = ribPair('rib_v', false, 16, 236); return S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0xb4b2a2, roughness: 0.7, metalness: 0.3 }); },
      corrGray: () => { const [t, b] = ribPair('rib_v', false, 16, 236); return S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0x8e9396, roughness: 0.6, metalness: 0.45 }); },
      shutter: () => { const [t, b] = ribPair('rib_h', true, 5, 230); return S({ map: t, bumpMap: b, bumpScale: 0.5, color: 0x9ba1a4, roughness: 0.55, metalness: 0.45 }); },
      louver: () => { const [t, b] = ribPair('rib_l', true, 3, 210); return S({ map: t, bumpMap: b, bumpScale: 0.8, color: 0x8a8f92, roughness: 0.6, metalness: 0.4 }); }
    }[key];
    return (MAT[key] = metalize(m()));
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
      if (ABANDONED) {
        ageCanvas(g, w, h, 41, 1.4);
        // vết móp + vệt bùn bắn chân cửa, chữ X sơn xịt đánh dấu đã lục soát
        for (let i = 0; i < 6; i++) { const x = hash(i + 700) * w, y = hash(i + 701) * h * 0.8; const gr = g.createRadialGradient(x - 3, y - 3, 1, x, y, 14); gr.addColorStop(0, 'rgba(230,226,214,0.35)'); gr.addColorStop(0.6, 'rgba(30,28,24,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 16, y - 16, 32, 32); }
        for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(78,64,44,0.55)'; g.fillRect(hash(i + 800) * w, h - 4 - Math.pow(hash(i + 801), 2) * 60, 2 + hash(i + 802) * 5, 1 + hash(i + 803) * 3); }
        g.strokeStyle = 'rgba(196,40,30,0.8)'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(w * 0.7, h * 0.18); g.lineTo(w * 0.86, h * 0.42); g.moveTo(w * 0.86, h * 0.18); g.lineTo(w * 0.7, h * 0.42); g.stroke();
      }
    });
    const mk = (ox) => { const t = base.clone(); t.needsUpdate = true; t.repeat.set(0.5, 1); t.offset.set(ox, 0); return new THREE.MeshStandardMaterial({ map: t, roughness: ABANDONED ? 0.8 : 0.55, metalness: ABANDONED ? 0.25 : 0.45 }); };
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
    if (tile) tileBoxUV(g, tile);
    g.userData.uvTiled = true;
    return g;
  }
  // UV hộp / trụ theo kích thước thật (1 ô ảnh = tile đơn vị): hộp / trụ dài mà trải trọn 1 ảnh lên mặt thì vết bẩn gỉ
  // bị kéo thành sọc như vân gỗ (trụ bổ tường, ống dài)
  function tileBoxUV(g, tile) {
    const p = g.parameters, uv = g.attributes.uv, dims = [[p.depth, p.height], [p.depth, p.height], [p.width, p.depth], [p.width, p.depth], [p.width, p.height], [p.width, p.height]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    g.userData.uvTiled = true;
  }
  function tileCylUV(g, tile) {
    // thân trụ: u theo chu vi, v theo chiều cao; 2 mặt đáy (đỉnh sau thân trụ): co đều theo đường kính (không méo thành sọc)
    const p = g.parameters, uv = g.attributes.uv, ku = p.thetaLength * (p.radiusTop + p.radiusBottom) / 2 / tile, kv = p.height / tile;
    const nSide = (p.radialSegments + 1) * (p.heightSegments + 1), kc = 2 * Math.max(p.radiusTop, p.radiusBottom) / tile;
    for (let i = 0; i < uv.count; i++) {
      if (i < nSide) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
      else uv.setXY(i, (uv.getX(i) - 0.5) * kc, (uv.getY(i) - 0.5) * kc);
    }
    g.userData.uvTiled = true;
  }
  // chia UV theo kích thước thật: (u, v) gốc 0..1 nhân (ku, kv)
  function tileUVk(g, ku, kv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv); g.userData.uvTiled = true; }
  const TILE_UV = {
    BoxGeometry: tileBoxUV,
    CylinderGeometry: tileCylUV,
    // nón: thân như trụ đỉnh nhọn (bán kính trung bình R / 2), đáy co theo đường kính như trụ
    ConeGeometry: (g, tile) => { const p = g.parameters; g.parameters = { radiusTop: 0, radiusBottom: p.radius, height: p.height, radialSegments: p.radialSegments, heightSegments: p.heightSegments, thetaLength: p.thetaLength }; tileCylUV(g, tile); g.parameters = p; },
    // cầu: u theo vĩ tuyến (chu vi), v theo kinh tuyến (nửa chu vi)
    SphereGeometry: (g, tile) => { const p = g.parameters; tileUVk(g, p.phiLength * p.radius / tile, p.thetaLength * p.radius / tile); },
    // xuyến: u dọc thân xuyến, v quanh tiết diện ống
    TorusGeometry: (g, tile) => { const p = g.parameters; tileUVk(g, p.arc * p.radius / tile, 2 * Math.PI * p.tube / tile); }
  };
  // Gộp khối; màu đỉnh = che khuất tiếp đất (chân mỗi khối tối dần trong ~1.5 m dưới cùng) x sắc độ lệch nhẹ từng khối
  // flat: vật liệu sơn đã có lớp mòn riêng (sam.js) -> tông từng chi tiết chỉ lệch nhẹ, bỏ dải tối chân của chi tiết nhỏ
  // (mỗi thanh / trụ lệch tông + tối dần xuống chân => khung thép sơn nhìn như giàn ván gỗ ghép)
  function mergeGeos(list, flat) {
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
      const H = y1 - y0, span = Math.min(12, H * 0.6), tint = flat ? 0.95 + hash(part++ * 13 + n) * 0.07 : ABANDONED ? 0.84 + hash(part++ * 13 + n) * 0.18 : 0.93 + hash(part++ * 13 + n) * 0.12;
      for (let i = 0; i < n; i++) {
        let k = tint;
        if (H > (flat ? 10 : 1.5)) { const t = Math.min(1, (P[i * 3 + 1] - y0) / span); k *= (flat ? 0.78 : 0.58) + (flat ? 0.22 : 0.42) * t * t * (3 - 2 * t); }
        // bỏ hoang: chân công trình ám đất cát (ngả nâu, cao ~1.5 m tính từ mặt sân)
        let dr = 1, dg = 1, db = 1;
        if (ABANDONED) { const y = P[i * 3 + 1], t = Math.max(0, Math.min(1, y / 12)), d = 1 - t * t * (3 - 2 * t); dr = 1 - 0.18 * d; dg = 1 - 0.26 * d; db = 1 - 0.38 * d; }
        col[(o + i) * 3] = k * dr; col[(o + i) * 3 + 1] = k * dg; col[(o + i) * 3 + 2] = k * db;
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
  const defTile = m => m === 'conc' || m === 'concDark' ? 64 : m === 'hazard' ? 16 : m === 'hesco' ? 9 : typeof m === 'string' && /^(steel|olive|ochre|yellow|wood|sand|bag|drum|tarp|corr|shutter|plastic)/.test(m) ? 24 : m === 'louver' ? 8 : 0;
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
      // bỏ hoang: ~1/3 ô kính bị vỡ (chọn theo thứ tự dựng -> cố định giữa các máy)
      if (ABANDONED && m === 'glass') { const n = this.nGlass = (this.nGlass || 0) + 1, hb = hash(n * 7.31 + 91); if (hb < 0.34) m = 'glassBroken' + ['', '1', '2', '3'][Math.floor(hash(n * 3.17 + 5) * 4)]; }
      const k = typeof m === 'string' ? mat(m) : m;
      // hộp / trụ tạo thẳng bằng THREE (UV 0..1 trọn mặt): chia ô theo kích thước thật cho vật liệu có texture lặp
      // (+ nón / cầu / xuyến: phuy, chỏm bồn, vành thép — trước đây trọn 1 ô ảnh trên cả vật -> đốm gỉ to bằng bàn tay)
      if (geo && !geo.userData.uvTiled && TILE_UV[geo.type]) {
        const tile = typeof m === 'string' ? defTile(m) : (k.userData && k.userData.tile) || 0;
        if (tile >= 16) TILE_UV[geo.type](geo, tile);
      }
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
      // UV chiếu hộp theo pháp tuyến từng mặt (mặt đứng: v = độ cao) — UV mặc định của ExtrudeGeometry xoay 90° trên 2
      // mặt hông -> vệt gỉ / nước chảy NGANG
      const tile = defTile(m) || (m.userData && m.userData.tile) || 24, uv = g.attributes.uv, p = g.attributes.position, nr = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
        if (ay > ax && ay > az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
        else if (ax > az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
        else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
      }
      const local = M4(x, y, z, 0, ry || 0, 0);
      this.add(m, g, mtx ? new THREE.Matrix4().multiplyMatrices(mtx, local) : local);
    }
    // trụ đứng chân tại y0 (rTop, rBot, cao h)
    cyl(m, x, y0, z, rTop, rBot, h, seg, mtx) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, seg || 16);
      // UV theo kích thước thật (1 ô ảnh = 24 đơn vị) để vết gỉ / bẩn không bị phóng to trên trụ lớn
      tileCylUV(g, 24);
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
      (this.lsolids || (this.lsolids = [])).push({ f, r, hf, hr, rot: rot || 0, y0, y1 });
      this.top = Math.max(this.top, y1);
    }
    build(group) {
      for (const [m, list] of this.parts) {
        if (!(m.isMeshBasicMaterial || m.polygonOffset || m.transparent || m.emissiveIntensity > 0.5) && !m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; }
        const mesh = new THREE.Mesh(mergeGeos(list, m.userData && m.userData.flatTint), m);
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
    // mặt nạ bãi cỏ (trắng = cỏ) cùng toạ độ ảnh nền: lớp chi tiết ngọn cỏ chỉ phủ đúng bãi cỏ (kể cả mảng úa vàng)
    const mask = TEX['apronMask_' + kind] || (TEX['apronMask_' + kind] = texOf('apronMask_' + kind, siteOf(kind) && siteOf(kind).yard ? 1024 : 512, Math.round((siteOf(kind) && siteOf(kind).yard ? 1024 : 512) * (r1 - r0) / (f1 - f0)), (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const SI = siteOf(kind); if (!SI) return;
      const P = (f, r) => [(f - f0) / (f1 - f0) * w, (r - r0) / (r1 - r0) * h], S = w / (f1 - f0), iF = f1 - 62, iR = r1 - 62;
      const rect = (fa, ra, fb, rb, col) => { const [x0, y0] = P(Math.min(fa, fb), Math.min(ra, rb)); g.fillStyle = col; g.fillRect(x0, y0, Math.abs(fb - fa) * S, Math.abs(rb - ra) * S); };
      if (SI.yard) SI.yard({ g, P, S, w, h, mask: true, inner: [-iF + 26, -iR + 26, iF - 26, iR - 26], hash, blotch, speckle });
      else rect(-iF + 26, -iR + 26, iF - 26, iR - 26, '#fff');
      for (const [fa, ra, fb, rb] of SI.gravel(f1)) rect(fa, ra, fb, rb, '#000');
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000';
      for (const [pts, wd] of SI.roads) { g.lineWidth = (wd + 8) * S; g.beginPath(); pts.forEach(([f, r], i) => i ? g.lineTo(...P(f, r)) : g.moveTo(...P(f, r))); g.stroke(); }
      g.filter = SI.yard ? 'blur(0.6px)' : 'blur(2px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
    }));
    const am = new THREE.MeshStandardMaterial({ map: at, roughness: 0.94, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    // lớp chi tiết lát lặp độ phân giải cao (ảnh nền chỉ ~13 px/m): chỗ nền màu cỏ -> ngọn cỏ, còn lại -> hạt sỏi / bê tông;
    // nhân vào màu nền (giá trị trung bình ~0.5 x 2)
    const rep = [hu * 2 / 24, hv * 2 / 24];
    am.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: detailTex('grass') }; sh.uniforms.tGrav = { value: detailTex('gravel') }; sh.uniforms.tMask = { value: mask }; sh.uniforms.uRep = { value: new THREE.Vector2(rep[0], rep[1]) };
      sh.fragmentShader = 'uniform sampler2D tGrass;\nuniform sampler2D tGrav;\nuniform sampler2D tMask;\nuniform vec2 uRep;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float gm = texture2D(tMask, vUv).r;
          vec2 duv = vUv * uRep;
          vec3 dg = texture2D(tGrass, duv).rgb, dv = texture2D(tGrav, duv * 1.7).rgb;
          // kênh G của mặt nạ = sân lát (bê tông / nhựa): hạt sỏi chỉ phủ nhẹ làm vân mặt, không biến sân thành bãi sỏi
          float pv = clamp(texture2D(tMask, vUv).g - gm, 0.0, 1.0);
          diffuseColor.rgb *= mix(mix(vec3(1.0), dv * 2.0, 0.7 - 0.55 * pv), dg * 2.0, gm); }`);
    };
    const top = new THREE.Mesh(new THREE.PlaneGeometry(hu * 2, hv * 2), am);
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
  // mắt cáo ~6 cm (4 x 4 mắt / ô ảnh 2 đv), sợi mảnh, vài sợi gỉ; trong suốt pha trộn (không cắt alpha cứng) -> nhìn xa
  // mipmap nhoè thành lớp lưới xám mờ như thật (trước: mắt 25 cm sợi to -> trông như giàn mắt cáo, xa thì chớp nháy)
  const meshFenceMat = () => MAT.chain || (MAT.chain = new THREE.MeshStandardMaterial({
    map: texOf('chain2', 64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.lineWidth = 1.5;
      const n = 4, s = w / n;
      for (let k = -n; k <= n; k++) {
        g.strokeStyle = hash(k + 911) < 0.25 ? 'rgba(128,96,70,0.95)' : 'rgba(136,138,132,0.95)';
        g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s + w, h); g.stroke();
        g.strokeStyle = hash(k + 917) < 0.25 ? 'rgba(128,96,70,0.95)' : 'rgba(136,138,132,0.95)';
        g.beginPath(); g.moveTo(k * s + w, 0); g.lineTo(k * s, h); g.stroke();
      }
    }, true), transparent: true, depthWrite: false, alphaTest: 0.03, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }));
  // Dải băng dẹt dọc dãy điểm (dây thép gai lưỡi dao thật là băng thép dẹt ~2.5 cm có lưỡi dập 2 mép, quấn lò xo; gốc
  // bề rộng dọc trục cuộn A, xoắn dần quanh tiếp tuyến). 2 tam giác / đoạn (ống tam giác cũ: 6), vật liệu
  // 'razor' 2 mặt + alpha vẽ lõi băng và lưỡi dao; u = độ dài cung / 1.2 đv (1 ô ảnh = 1 cụm lưỡi)
  function ribbonGeo(pts, wd, A) {
    const n = pts.length, pos = new Float32Array(n * 6), nrm = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    let s = 0;
    for (let i = 0; i < n; i++) {
      T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      N.crossVectors(T, A); if (N.lengthSq() < 1e-6) N.set(0, 1, 0); N.normalize(); B.crossVectors(T, N);
      if (i) s += pts[i].distanceTo(pts[i - 1]);
      // băng xoắn dần quanh tiếp tuyến (~1.4 rad / cụm lưỡi): không đoạn dài nào nằm cạnh-đối-mắt mà biến mất (đỉnh / đáy vòng
      // khi nhìn ngang), lưỡi dao chĩa đủ hướng như cuộn thật
      const th = s / 1.2 * 1.4, c = Math.cos(th), sn = Math.sin(th), p = pts[i];
      const wx = (B.x * c + N.x * sn) * wd / 2, wy = (B.y * c + N.y * sn) * wd / 2, wz = (B.z * c + N.z * sn) * wd / 2;
      pos.set([p.x - wx, p.y - wy, p.z - wz, p.x + wx, p.y + wy, p.z + wz], i * 6);
      const nx = N.x * c - B.x * sn, ny = N.y * c - B.y * sn, nz = N.z * c - B.z * sn;
      nrm.set([nx, ny, nz, nx, ny, nz], i * 6);
      uv.set([s / 1.2, 0, s / 1.2, 1], i * 4);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.userData.uvTiled = true;
    return g;
  }
  // Hàng rào lưới cao H (mặc định 1.8 m) từ (f0, r0) tới (f1, r1): cột thép mỗi ~3 m, tay chéo nghiêng ra ngoài mang
  // 3 sợi thép gai; coil = thêm cuộn dây thép gai lưỡi dao (concertina) trên đỉnh
  function fence(K, f0, r0, f1, r1, out, H, coil) {
    H = H || 15;
    const len = Math.hypot(f1 - f0, r1 - r0), n = Math.max(1, Math.round(len / 24)), ang = Math.atan2(r1 - r0, f1 - f0);
    const ox = -Math.sin(ang) * (out || 1), oz = Math.cos(ang) * (out || 1);   // pháp tuyến ra phía ngoài
    // chân cột bám mặt đất (rào chạy qua chân gò / ụ đất không bị vùi nửa thân)
    const P = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, f = f0 + (f1 - f0) * t, r = r0 + (r1 - r0) * t, e = Math.max(0, K.earth(f, r));
      P.push([f, e, r]);
      K.cyl('steelGray', f, e, r, 0.45, 0.45, H, 6);
      K.cyl('concDark', f, e - 0.6, r, 1.3, 1.5, 1.4, 8);
      K.beam('steelGray', [f, e + H, r], [f + ox * 3, e + H + 3, r + oz * 3], 0.4);
    }
    // lưới: 1 dải liền theo chân cột (đáy cách đất 0.5 đv, đỉnh tại ống ngang), UV 1 ô = 2 đv
    {
      const pos = [], uvs = [], idx = []; let s = 0;
      P.forEach(([f, e, r], i) => {
        if (i) { s += Math.hypot(f - P[i - 1][0], r - P[i - 1][2]); const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        pos.push(f, e + 0.5, r, f, e + H, r); uvs.push(s / 2, 0, s / 2, (H - 0.5) / 2);
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals(); g.userData.uvTiled = true;
      K.add(meshFenceMat(), g, null);
    }
    for (let i = 1; i < P.length; i++) {
      const [fa, ea, ra] = P[i - 1], [fb, eb, rb] = P[i];
      K.beam('steelGray', [fa, ea + H, ra], [fb, eb + H, rb], 0.35);
      // 3 sợi thép gai võng nhẹ giữa 2 tay chéo
      for (const k of [1, 2, 3]) {
        const A = [fa + ox * k, ea + H + k, ra + oz * k], Bp = [fb + ox * k, eb + H + k, rb + oz * k], M = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2 - 0.35, (A[2] + Bp[2]) / 2];
        K.beam('steelDark', A, M, 0.2); K.beam('steelDark', M, Bp, 0.2);
      }
    }
    if (coil) {
      // dây thép gai lưỡi dao cuộn (concertina) Ø ~0.85 m: 1 dây xoắn ốc liên tục (bước ~0.3 m) dọc đỉnh rào, mỗi vòng to nhỏ /
      // lệch / võng khác nhau, đoạn giữa 2 cột chùng xuống — nhìn nghiêng thành chuỗi elip chồng chéo như cuộn thật
      // 2 lớp xoắn ngược pha, nghiêng ngược chiều (cuộn thật kẹp các vòng chéo nhau thành mắt thoi khi kéo giãn)
      // 10 điểm / vòng (Ø 6.8 đv): nhìn xa không khác 16, nhìn gần vòng hơi gãy góc nhưng lưỡi dao trên băng che bớt
      const m = Math.max(2, Math.round(len / 2.4)), SEG = 10, A = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).normalize();
      for (const [ph, tl, k0] of [[0, 0.3, 0], [Math.PI, -0.3, 0.37]]) {
        const pts = [];
        for (let i = 0; i <= m * SEG; i++) {
          const t = i / (m * SEG), lp = Math.floor(t * m), j = hash(lp * 7 + f0 * 0.13 + r0 * 0.29 + k0), th = t * m * TAU + ph;
          const u = t * n, pi = Math.min(n - 1, Math.floor(u)), w = u - pi, e = P[pi][1] + (P[pi + 1][1] - P[pi][1]) * w, sag = Math.sin(w * Math.PI) * 0.9;
          const R = 3.4 * (0.88 + j * 0.22), f = f0 + (f1 - f0) * t + ox * 1.5, r = r0 + (r1 - r0) * t + oz * 1.5, y = e + H + 4.4 - sag + (j - 0.5) * 0.6;
          const c = Math.cos(th) * R, sn = Math.sin(th) * R;
          pts.push(new THREE.Vector3(f + A.x * sn * tl + ox * c * 0.85, y + sn, r + A.z * sn * tl + oz * c * 0.85));
        }
        K.add('razor', ribbonGeo(pts, 0.42, A), null);
      }
    }
    K.solid((f0 + f1) / 2, (r0 + r1) / 2, len / 2, 1.2, 0, H + 8 + Math.max(...P.map(p => p[1])), ang);
  }
  // Bờ bao cát xếp so le từng bao (bao 0.55 x 0.25 x 0.35 m, hơi lệch / phồng ngẫu nhiên) dọc đoạn (f0, r0) -> (f1, r1)
  // Bao cát dáng gối (siêu elip-xoit): đáy phẳng bị đè, bụng phình, 2 đầu túm thót lại, mặt lổn nhổn — thay khối hộp vát
  // cạnh xếp so le đều tăm tắp (nhìn như tường gạch / Lego). 4 biến thể méo khác nhau, cỡ ~4.6 x 2 x 3 đơn vị, gốc tâm
  // cách đáy 1 đơn vị (như cbox cũ), UV chiếu hộp 1 ô = 12 đơn vị (thớ vải bao mịn hơn vữa / bê tông)
  const BAG_GEO = [];
  function bagGeo(v) {
    if (BAG_GEO[v]) return BAG_GEO[v];
    const g = new THREE.SphereGeometry(0.5, 8, 5), P = g.attributes.position, sp = (t, e) => Math.sign(t) * Math.pow(Math.abs(t), e);
    let minY = Infinity;
    for (let i = 0; i < P.count; i++) {
      const x0 = P.getX(i) * 2, y0 = P.getY(i) * 2, z0 = P.getZ(i) * 2;
      // nhiễu theo vị trí (đỉnh trùng ở đường nối cầu cùng giá trị -> không nứt mặt)
      const n = 1 + (hash(Math.round(x0 * 40) * 7.1 + Math.round(y0 * 40) * 13.3 + Math.round(z0 * 40) * 29.7 + v * 101) - 0.5) * 0.14;
      let x = sp(x0, 0.45), y = sp(y0, 0.62), z = sp(z0, 0.5);
      const end = Math.max(0, Math.abs(x) - 0.55) / 0.45; y *= 1 - 0.4 * end * end; z *= 1 - 0.32 * end * end;
      if (y < -0.5) y = -0.5 + (y + 0.5) * 0.15;
      z *= 1 + 0.12 * (1 - y * y);
      x *= 1 + (hash(v * 7 + 3) - 0.5) * 0.08;
      P.setXYZ(i, x * 2.3 * n, y * 1.2 * n + (hash(v + 11) - 0.5) * 0.1 * x, z * 1.5 * n);
      minY = Math.min(minY, P.getY(i));
    }
    g.translate(0, -1 - minY, 0);
    g.computeVertexNormals();
    const uv = g.attributes.uv, N = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
      if (ay > ax && ay > az) uv.setXY(i, P.getX(i) / 12 + v * 0.37, P.getZ(i) / 12); else if (ax > az) uv.setXY(i, P.getZ(i) / 12 + v * 0.37, P.getY(i) / 12); else uv.setXY(i, P.getX(i) / 12 + v * 0.37, P.getY(i) / 12);
    }
    g.userData.uvTiled = true;
    return (BAG_GEO[v] = g);
  }
  function sandbags(K, f0, r0, f1, r1, rows, y0, base) {
    const len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0), n = Math.max(1, Math.round(len / 4.4));
    for (let row = 0; row < rows; row++) for (let i = 0; i < n + (row % 2 ? 0 : 1); i++) {
      const t = Math.min(1, Math.max(0, (i + (row % 2 ? 0.5 : 0)) / n)), sd = (f0 * 7 + r0 * 3 + row * 31 + i) | 0;
      // mỗi bao lệch, nghiêng, phình xẹp khác nhau; hàng trên đè lún xuống hàng dưới
      const local = M4(f0 + (f1 - f0) * t + (hash(sd + 3) - 0.5) * 0.5, (y0 || 0) + 1 + row * 1.75, r0 + (r1 - r0) * t + (hash(sd + 4) - 0.5) * 0.5,
        (hash(sd + 5) - 0.5) * 0.08, -ang + (hash(sd + 2) - 0.5) * 0.3, (hash(sd + 6) - 0.5) * 0.08, 0.9 + hash(sd + 7) * 0.14, 0.85 + hash(sd + 8) * 0.2, 0.92 + hash(sd + 1) * 0.16);
      K.add(hash(sd) < 0.3 ? 'bagGreen' : 'sand', bagGeo((hash(sd + 9) * 4) | 0), base ? new THREE.Matrix4().multiplyMatrices(base, local) : local);
    }
  }
  function drum(K, f, r, m, y0) {
    const yb = y0 || 0;
    K.cyl(m, f, yb, r, 2.4, 2.4, 7.2, 16);
    // 2 đường gân vành lăn nổi quanh thân thùng
    K.cyl('steelDark', f, yb + 2.3, r, 2.52, 2.52, 0.35, 16);
    K.cyl('steelDark', f, yb + 4.9, r, 2.52, 2.52, 0.35, 16);
    // 2 gờ mép dập nổi ở đỉnh và đáy
    K.cyl('steelDark', f, yb + 0.2, r, 2.54, 2.54, 0.4, 16);
    K.cyl('steelDark', f, yb + 7.0, r, 2.54, 2.54, 0.4, 16);
    // nắp rót nhiên liệu ren xoay
    K.cyl('steelGray', f + 1.1, yb + 7.2, r + 0.6, 0.45, 0.45, 0.35, 8);
    K.cyl('steelGray', f - 1.0, yb + 7.2, r - 0.5, 0.25, 0.25, 0.35, 8);
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
  // trực thăng bỏ lại nhiều năm: lớp phong hoá shader theo hướng mặt (bụi + lá mục phủ mặt nằm, vệt mưa đen dọc thân,
  // sơn bạc phấn, rêu tảo chân càng / bụng, tróc sơn lộ lót) — không vẽ sẵn vào ảnh vỏ vì UV thân không biết đâu là nóc
  const heliWx = (m) => ABANDONED && typeof Weathering !== 'undefined' ? Weathering.apply(m, 'paint', { space: 'world', rust: 0.08, chip: 0.3, dust: 0.9, streak: 0.85, fade: 0.55, stain: 0.6, moss: 0.7, grimeH: 5 }) : m;
  function heli(K, base) {
    const at = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().multiplyMatrices(base, M4(x, y, z, rx, ry, rz, sx, sy, sz));
    const hm = MAT.heliPaint || (MAT.heliPaint = heliWx((() => { const [t, b] = grimePair('r0.4', 0.4); return new THREE.MeshStandardMaterial({ color: 0x3b4230, map: t, bumpMap: b, bumpScale: 0.25, roughness: 0.82, metalness: 0.1, side: THREE.DoubleSide }); })()));
    const X = (m) => 62 - m * 8;   // X(mét tính từ mũi) -> toạ độ x
    // thân: mũi radar tròn -> kính chắn gió dốc -> khoang vuông thành gần phẳng -> bụng vuốt lên -> cần đuôi thon
    const skinM = MAT.heliSkin || (MAT.heliSkin = heliWx(new THREE.MeshStandardMaterial({ map: heliSkin(), color: 0xffffff, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide })));
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
        P.setY(i, P.getY(i) * (z > 0 ? 1.3 : 0.7) - (ABANDONED ? 6.5 : 3.2) * f * f);   // đậu lâu: đầu lá võng ~0.8 m
        if (x > L2 - 4) P.setZ(i, z - (x - L2 + 4) * 0.3);
      }
      bl.computeVertexNormals();
      const bm = at(HX + Math.cos(a) * 5.6, HY, Math.sin(a) * 5.6, 0, -a, 0);
      K.add(MAT.blade || (MAT.blade = heliWx(new THREE.MeshStandardMaterial({ color: 0x2b2d2b, roughness: 0.7, metalness: 0.1 }))), bl, bm);
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
      K.add('rubber', new THREE.CylinderGeometry(2.7, 2.7, 1.9, 16), at(wx, ABANDONED ? wy - 0.45 : wy, wz + s2 * 0.9, Math.PI / 2, 0, 0, 1, 1, ABANDONED ? 0.8 : 1));   // bỏ hoang: lốp xẹp
      K.add('steelGray', new THREE.CylinderGeometry(1.4, 1.4, 2, 10), at(wx, wy, wz + s2 * 0.9, Math.PI / 2, 0, 0));
      // đèn hàng hải đầu cánh ổn định / hông: đỏ trái, xanh phải
      K.add(s2 > 0 ? 'lampAmber' : 'lampRed', new THREE.SphereGeometry(0.55, 8, 6), at(X(4.9), 21.2, s2 * 8.6));
    }
    // bánh đuôi trên càng chéo, dao cắt dây trên nóc + dưới bụng, 2 ống pitot trước mũi, ăng-ten, chữ ARMY trên cần đuôi
    const twx = X(12.9);
    K.beam('steelDark', [twx + 3, 13.6, 0], [twx, 1.8, 0], 0.9, base); K.beam('steelDark', [twx - 3, 14.2, 0], [twx, 1.8, 0], 0.6, base);
    K.add('rubber', new THREE.CylinderGeometry(1.8, 1.8, 1.3, 12), at(twx, ABANDONED ? 1.45 : 1.8, 0, Math.PI / 2, 0, 0, 1, 1, ABANDONED ? 0.8 : 1));
    K.beam('steelGray', [X(1.8), 20.6, 0], [X(2.7), 22.4, 0], 0.4, base); K.beam('steelGray', [X(0.6), 5.4, 0], [X(1.6), 4, 0], 0.4, base);
    for (const s2 of [-1, 1]) K.add('steelGray', new THREE.CylinderGeometry(0.18, 0.18, 5, 5), at(X(0.3), 12.6, s2 * 3.2, 0, 0, Math.PI / 2));
    K.add('steelDark', new THREE.CylinderGeometry(0.12, 0.25, 7, 4), at(X(8.6), 21.8, 0, 0, 0, -0.5));
    K.add('steelDark', new THREE.BoxGeometry(4, 0.3, 1.4), at(X(9.6), 3.4 + 7, 0));
  }


  // =====================================================================================================
  // BỘ CANH PHÒNG DÙNG CHUNG cho mọi căn cứ (bãi phóng hạt nhân, hầm sinh học, trận địa phòng không):
  // hằng số chu vi + cửa sổ, điều hoà, chốt gác, cột đèn, tháp canh thép, lô cốt, tường rọ đá
  // =====================================================================================================
  function secKit(K, anim) {
    const L = K.L;
    // CANH PHÒNG CẤP CĂN CỨ CHIẾN LƯỢC
    // ụ đất chống xe (địa hình) -> rào ngoài -> dải trống (cảm biến, răng rồng) -> rào trong -> đường tuần tra ->
    // khu trong (tháp canh bê tông, lô cốt, phòng không, công trình hỗ trợ) -> rào thứ 3 quanh khu cấm silo
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
      // quạt dàn nóng: lòng tối + cánh + lưới bảo vệ (không còn đĩa đen tuyền như lỗ thủng)
      K.add('steelDark', new THREE.CircleGeometry(1.7, 14), mul(base, M4(x + 0.8, y, 3.48)));
      for (const a of [0, 2.1, 4.2]) K.add('steelGray', new THREE.BoxGeometry(2.6, 0.5, 0.1), mul(base, M4(x + 0.8, y, 3.5, 0, 0, a)));
      for (let d = -1.4; d <= 1.41; d += 0.7) { K.add('steelGray', new THREE.BoxGeometry(0.08, 2 * Math.sqrt(Math.max(0.1, 2.9 - d * d)), 0.08), mul(base, M4(x + 0.8 + d, y, 3.6))); K.add('steelGray', new THREE.BoxGeometry(2 * Math.sqrt(Math.max(0.1, 2.9 - d * d)), 0.08, 0.08), mul(base, M4(x + 0.8, y + d, 3.62))); }
      for (const s2 of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(0.4, 0.4, 3.6), mul(base, M4(x + s2 * 2.4, y - 2.6, 1.8)));
    };
    // buồng gác chống đạn (w x d, cao 3 m): chân bê tông, vách thép dưới, dải kính bao quanh có đố, mái đua có đèn, cửa,
    // điều hoà, ăng-ten
    // (đặt theo mặt đất: chân dốc / gò thì nền bê tông cao thêm xuống tới chỗ thấp nhất, không vùi buồng vào đất)
    const booth = (f, r, ry, w, d) => {
      const e = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => Math.max(0, K.earth(f + a * (w / 2 + 2), r + b * (d / 2 + 2)))), y0 = Math.max(...e), yl = Math.min(...e);
      const base = M4(f, y0, r, 0, ry, 0);
      K.cbox('concDark', 0, 0.8 - (y0 - yl) / 2, 0, w + 4, 1.6 + y0 - yl, d + 4, 0.4, 0, base);
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
      K.solid(f, r, Math.max(w, d) / 2 + 2, Math.max(w, d) / 2 + 2, 0, y0 + 23);
    };
    // cột đèn chiếu sáng: cột côn, cần vươn cong, chao đèn kiểu cổ ngỗng có kính đèn
    const lamp = (f, r, ang) => {
      const e = [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]].map(([a, b]) => Math.max(0, K.earth(f + a, r + b))), y0 = Math.max(...e), yl = Math.min(...e);
      const base = M4(f, y0, r, 0, -ang, 0);
      K.cbox('concDark', 0, 1 - (y0 - yl) / 2, 0, 4, 2 + y0 - yl, 4, 0.4, 0, base);
      K.add('steelGray', new THREE.CylinderGeometry(0.6, 1.2, 66, 12), mul(base, M4(0, 35, 0)));
      K.add('steelGray', new THREE.CylinderGeometry(1.5, 1.5, 3, 12), mul(base, M4(0, 3.5, 0)));   // đế bích + hộp cửa kiểm tra
      K.add('steelGray', new THREE.SphereGeometry(0.62, 10, 6, 0, TAU, 0, Math.PI / 2), mul(base, M4(0, 68, 0)));
      // cần đèn ống thép uốn cong liền từ đỉnh cột, chao đèn hình mai rùa dẹt, kính khuếch tán phía dưới
      const arm = new THREE.QuadraticBezierCurve3(v3(0, 66, 0), v3(0.4, 71, 0), v3(10.5, 71.2, 0));
      K.add('steelGray', new THREE.TubeGeometry(arm, 12, 0.38, 8, false), base);
      K.add('steelDark', new THREE.SphereGeometry(1, 14, 8), mul(base, M4(13, 71.2, 0, 0, 0, 0, 3.2, 0.75, 1.5)));
      K.add('glass', new THREE.SphereGeometry(1, 12, 6, 0, TAU, Math.PI / 2, Math.PI / 2), mul(base, M4(13.2, 70.9, 0, 0, 0, 0, 2.4, 0.5, 1.1)));
      K.solid(f, r, 2, 2, 0, y0 + 72);
    };
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
      // Cụm còi báo động phòng không đôi (Dual Siren) có cột đỡ cắm chắc chắn vào sàn mái
      K.add('steelDark', new THREE.CylinderGeometry(0.35, 0.35, 3.2, 8), mul(base, M4(C - 2.5, cy0 + 23.8, C - 2.5)));
      K.add('steelDark', new THREE.CylinderGeometry(0.9, 0.9, 1.4, 10), mul(base, M4(C - 2.5, cy0 + 25.8, C - 2.5)));
      for (const sDir of [-1, 1]) {
        K.add('steelGray', new THREE.ConeGeometry(1.4, 2.2, 10, 1, false), mul(base, M4(C - 2.5 + sDir * 1.5, cy0 + 25.8, C - 2.5, 0, 0, -sDir * Math.PI / 2)));
      }
      // Cột ăng-ten vô tuyến có đế bích gia cố
      K.add('steelDark', new THREE.CylinderGeometry(0.8, 1.0, 1.2, 8), mul(base, M4(-C + 2, cy0 + 22.8, C - 2)));
      K.add('steelGray', new THREE.CylinderGeometry(0.18, 0.35, 24, 6), mul(base, M4(-C + 2, cy0 + 34, C - 2)));
      // Bệ đèn pha (trụ tròn vững chãi trên mái)
      K.add('steelDark', new THREE.CylinderGeometry(2.2, 2.4, 2.6, 12), mul(base, M4(C - 3, cy0 + 23.5, -C + 3)));
      const sp = new THREE.Vector3(C - 3, cy0 + 24.8, -C + 3).applyMatrix4(base);
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
      // mái đua + móng loe: chỉnh UV theo kích thước thật (tránh vân bê tông bị kéo dài thành sọc)
      const hexSlab = (r0, r1, h) => { const g = new THREE.CylinderGeometry(r0, r1, h, 6), uv = g.attributes.uv, P = g.attributes.position;
        for (let i = 0; i < uv.count; i++) {
          if (Math.abs(g.attributes.normal.getY(i)) > 0.9) uv.setXY(i, P.getX(i) / 64, P.getZ(i) / 64);   // mặt trên / dưới
          else uv.setXY(i, uv.getX(i) * 6 * r1 / 64, (P.getY(i) + h / 2) / 64);                          // mặt hông
        }
        return g; };
      K.add('concDark', hexSlab(R + 2.4, R + 2.4, 3), M4(f, 15.5, r, 0, -Math.PI / 6, 0));
      K.add('concDark', hexSlab(R + 1.6, R + 3.2, 2.2), M4(f, 1.1, r, 0, -Math.PI / 6, 0));   // móng loe chân lô cốt
      // hào giao thông lót bao cát dẫn vào cửa sau, lưới nguỵ trang phủ nóc, ăng-ten
      const ia = Math.atan2(-r, -f) + Math.PI, ex = f + Math.cos(ia) * 21, ez = r + Math.sin(ia) * 21, px = -Math.sin(ia), pz = Math.cos(ia);
      for (const s2 of [-1, 1]) sandbags(K, ex + px * s2 * 6, ez + pz * s2 * 6, ex + Math.cos(ia) * 22 + px * s2 * 6, ez + Math.sin(ia) * 22 + pz * s2 * 6, 3, 0);
      camoNet(K, M4(f, 0, r, 0, 0.4, 0), 50, 50, 17.5, -8);
      K.cyl('steelGray', f + 8, 17, r + 8, 0.2, 0.3, 20, 5);
      for (let k = 0; k < 6; k++) { const a0 = k * Math.PI / 3, a1 = a0 + Math.PI / 3; sandbags(K, f + Math.cos(a0) * 19, r + Math.sin(a0) * 19, f + Math.cos(a1) * 19, r + Math.sin(a1) * 19, 2, 17); }
      K.solid(f, r, 21, 21, 0, 21);
    };
    // rọ Hesco: túi vải địa kỹ thuật trong khung lưới thép, đất nén đẩy vải phình bụng giữa các cạnh khung, nóc là đất lún
    // võng; mỗi rọ phình / lún khác nhau (trước: khối hộp thành phẳng sắc cạnh -> như thùng các-tông)
    const hescoBay = (w, h, d, sd) => {
      const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6), P = g.attributes.position, B = 0.8 + hash(sd) * 0.6, SG = 1.1 + hash(sd + 1) * 0.8;
      for (let i = 0; i < P.count; i++) {
        let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const X = x / (w / 2), Y = y / (h / 2), Z = z / (d / 2);
        if (Math.abs(X) > 0.999) x += Math.sign(X) * B * (1 - Y * Y) * (1 - Z * Z) * (1 - 0.35 * (Y + 1) / 2);
        if (Math.abs(Z) > 0.999) z += Math.sign(Z) * B * (1 - Y * Y) * (1 - X * X) * (1 - 0.35 * (Y + 1) / 2);
        if (Y > 0.999) y -= SG * (1 - X * X) * (1 - Z * Z);
        P.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals();
      const N = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i)), x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        if (ay > ax && ay > az) uv.setXY(i, x / 9, z / 9); else if (ax > az) uv.setXY(i, z / 9 + 0.5, y / 9 + 0.5); else uv.setXY(i, x / 9 + 0.5, y / 9 + 0.5);
      }
      g.userData.uvTiled = true;
      return g;
    };
    const hesco = (f0, r0, f1, r1, layers) => {
      const len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0), n = Math.max(1, Math.round(len / 9));
      const base = M4(f0, 0, r0, 0, -ang, 0);
      for (let ly = 0; ly < (layers || 1); ly++) for (let i = 0; i < n - ly; i++) {
        const x = (i + 0.5 + ly * 0.5) * len / n, y = 4.5 + ly * 9, sd = Math.round(f0 * 3 + r0 * 7) + i * 13 + ly * 101;
        K.add('hesco', hescoBay(len / n - 0.3, 8.8, 9, sd), mul(base, M4(x, y, 0)));
        // đất nén trên nóc (thấp hơn mép vải), lớp trên đè thì khuất
        K.add('soil', new THREE.PlaneGeometry(len / n - 1.4, 7.8), mul(base, M4(x, y + 4.4 - 0.55, 0, -Math.PI / 2, 0, 0)));
      }
      K.solid((f0 + f1) / 2, (r0 + r1) / 2, len / 2, 5, 0, 9 * (layers || 1), ang);
    };
    return { oF, oR, iF, iR, G, CZ, CR, mul, win, acUnit, booth, lamp, tower, pillbox, hesco };
  }
  // Chu vi an ninh chung: cảm biến, răng rồng, hàng nhím thép, cột đèn, biển cảnh báo, rào 2 lớp + cổng, cổng kiểm soát (ECP)
  function perimeter(K, kit) {
    const L = K.L, { oF, oR, iF, iR, G, CZ, CR, booth, lamp, mul } = kit;
    // rào ngoài + rào trong (chừa cổng |r| < G ở cạnh trước)
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
    // ---- HÀNG NHÍM THÉP CHỐNG XE CƠ GIỚI (Czech hedgehog) giữa ụ đất và rào ngoài: mỗi con 3 thanh thép góc L dài ~1.5 m
    //      bắt chéo vuông góc tại tâm (bản mã), đứng trên 3 chấu. Xếp so le 2 hàng như ngoài thực địa: khoảng cách, lệch hàng,
    //      cỡ, hướng xoay, độ nghiêng mỗi con một khác; thỉnh thoảng 1 con đổ nghiêng hoặc 1 quãng trống; 2 sắc gỉ; dây thép
    //      gai võng nối chấu trên các con kề nhau. Chừa lối xe vào cổng chính.
    {
      const LB = 12, qUp = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(1, 1, 1).normalize(), v3(0, 1, 0)));
      const yC = LB / 2 / Math.sqrt(3) + 0.2;
      const arms = [M4(0, 0, 0), M4(0, 0, 0, 0, 0, Math.PI / 2), M4(0, 0, 0, 0, -Math.PI / 2, 0)];   // thanh theo X, Y, Z
      const tips = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]].map(([x, y, z]) => v3(x * LB / 2, y * LB / 2, z * LB / 2));
      let n = 0, prev = null;
      const R = () => hash(n * 13 + 9001 + (R.k = (R.k || 0) + 1));
      const hog = (f, r) => {
        n++;
        const sc = 0.86 + R() * 0.3, topple = R() < 0.05, yaw = R() * TAU;
        const tx = topple ? 0.62 * (R() < 0.5 ? -1 : 1) : (R() - 0.5) * 0.16, tz = topple ? (R() - 0.5) * 0.3 : (R() - 0.5) * 0.16;
        const base = mul(M4(f, K.earth(f, r) + yC * sc - (topple ? 1.6 * sc : 0), r, tx, yaw, tz, sc, sc, sc), qUp);
        const m0 = R() < 0.45 ? 'steelRust2' : 'steelRust';
        for (const A of arms) {
          const m = mul(base, A);
          // thép góc L ~125 x 125 mm: 2 cánh vuông góc chung sống lưng
          K.add(m0, new THREE.BoxGeometry(LB, 1, 0.16), mul(m, M4(0, 0.5, 0)));
          K.add(m0, new THREE.BoxGeometry(LB, 0.16, 1), mul(m, M4(0, 0, 0.5)));
        }
        for (const A of arms) K.add(m0, new THREE.BoxGeometry(2.2, 2.2, 0.14), mul(base, mul(A, M4(0.6, 0.6, 0))));
        // dây thép gai võng nối chấu cao nhất với con trước
        let top = null; for (const t of tips) { const w = t.clone().applyMatrix4(base); if (!top || w.y > top.y) top = w; }
        if (prev && prev.distanceTo(top) < 24) {
          const mid = prev.clone().add(top).multiplyScalar(0.5); mid.y -= 1.4 + R() * 1.2;
          K.beam('steelDark', prev.toArray(), mid.toArray(), 0.14); K.beam('steelDark', mid.toArray(), top.toArray(), 0.14);
        }
        prev = top;
      };
      // đi dọc 1 cạnh: bước ngẫu nhiên 7..11, xen kẽ 2 hàng (cách mép 26.5 / 31.5) + lệch ngang, ~5% bỏ trống
      const line = (len, at) => {
        prev = null;
        for (let t = -len + R() * 4, k = 0; t < len; t += 7 + R() * 4, k++) {
          if (R() < 0.05) { prev = null; continue; }
          const d = (k % 2 ? 31.5 : 26.5) + (R() - 0.5) * 2.4;
          at(t + (R() - 0.5) * 2, d);
        }
      };
      for (const s of [-1, 1]) {
        line(L.hu - 26, (t, d) => hog(t, s * (L.hv - d)));
        line(L.hv - 36, (t, d) => { if (s < 0 || Math.abs(t) > 60) hog(s * (L.hu - d), t); else prev = null; });
        K.solid(0, s * (L.hv - 29), L.hu - 22, 7, 0, 10);
        K.solid(L.hu - 29, s * (60 + L.hv - 29) / 2, 7, (L.hv - 29 - 60) / 2, 0, 10);   // cạnh trước: 2 đoạn 2 bên lối vào
      }
      K.solid(-(L.hu - 29), 0, 7, L.hv - 29, 0, 10);
    }
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

  }

  // Vật liệu lòng hầm sâu vẽ qua cửa sổ stencil (deepPortal): bản sao vật liệu chuẩn chỉ vẽ nơi stencil = 1 (trong miệng
  // hầm), tối dần theo độ sâu — ánh trời chỉ lọt qua miệng. topY: cao độ thế giới của miệng; fade: quãng sâu tối hẳn.
  // back: mặt trong (thành ống). src: tên vật liệu Kit hoặc vật liệu sẵn
  function deepMats(topY, fade) {
    const cache = new Map();
    return (src, back) => {
      let row = cache.get(src);
      if (!row) cache.set(src, row = []);
      if (row[back ? 1 : 0]) return row[back ? 1 : 0];
      const m = (typeof src === 'string' ? mat(src) : src).clone();
      if (back) m.side = THREE.BackSide;
      m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc;
      m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uDeepTop = { value: topY }; sh.uniforms.uDeepFade = { value: fade };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDeepY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeepY = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDeepTop, uDeepFade;\nvarying float vDeepY;')
          .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'float dk = smoothstep(uDeepTop - uDeepFade, uDeepTop - 4.0, vDeepY);\n\toutgoingLight *= 0.05 + 0.95 * dk * dk;\n\tgl_FragColor = vec4( outgoingLight, diffuseColor.a );');
      };
      m.customProgramCacheKey = () => 'deepPortal';
      return (row[back ? 1 : 0] = m);
    };
  }
  // Cửa sổ stencil nhìn xuống lòng hầm sâu hơn lưới địa hình thô: (1) miệng hầm ghi stencil = 1 ở chỗ nhìn thấy được (vật
  // che phía trước vẫn che), (2) xoá chiều sâu trong miệng về xa nhất, (3) vẽ lòng hầm (Kit KP, vật liệu deepMats) chỉ trong
  // miệng. Vẽ sau mọi vật đặc (renderOrder 1..3) -> mặt đất thô nằm trong lòng hầm bị đè hết. mouths: [[hình, ma trận]]
  function deepPortal(group, KP, mouths) {
    const maskM = MAT.portalMask || (MAT.portalMask = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
    const clearM = MAT.portalClear || (MAT.portalClear = new THREE.ShaderMaterial({
      vertexShader: 'void main() { vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false, depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc }));
    for (const [geo, mtx] of mouths) for (const [m, ro] of [[maskM, 1], [clearM, 2]]) {
      const me = new THREE.Mesh(geo, m);
      me.applyMatrix4(mtx); me.renderOrder = ro; me.castShadow = me.receiveShadow = false; me.userData.portal = true;
      group.add(me);
    }
    const n0 = group.children.length;
    KP.build(group);
    for (let i = n0; i < group.children.length; i++) { const o = group.children[i]; o.renderOrder = 3; o.castShadow = false; }
  }

  function buildNuke(K, group, anim) {
    const L = K.L, S = L.silo, cf = S.f, cr = S.r, HB = S.h, RS = S.shaft, TOP = HB + 3;
    apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'nuke');
    roadNet(group, NUKE_ROADS, NUKE_JUNCTIONS, {
      bars: [[167.2, 0, 2.4, 32]].concat([128, 156, 184, 212].map(r => [L.hu - 110, r, 60, 1])),
      words: [['STOP', 173, 0, Math.PI / 2, 16]]
    });
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
        // sơn phai nắng (đỏ ngả gạch, vàng ngả đất) — căn cứ bỏ hoang
        q.strokeStyle = 'rgba(150,54,40,0.72)'; q.lineWidth = 4 * k; q.strokeRect(...P(-92, -78), 184 * k, 156 * k);
        q.fillStyle = 'rgba(150,54,40,0.72)'; q.font = `bold ${(5 * k) | 0}px Arial, sans-serif`; q.textAlign = 'center'; q.textBaseline = 'middle';
        for (const [f, r, rot] of [[0, -74, 0], [0, 74, Math.PI], [-88, 0, -Math.PI / 2], [88, 0, Math.PI / 2]]) {
          q.save(); q.translate(...P(f, r)); q.rotate(rot); q.fillText('NO LONE ZONE — TWO-PERSON CONCEPT', 0, 0); q.restore();
        }
        q.lineWidth = 5 * k; q.setLineDash([6 * k, 6 * k]);
        q.strokeStyle = 'rgba(184,150,62,0.8)'; q.beginPath(); q.arc(...P(0, 0), (RS + 4) * k, 0, TAU); q.stroke();
        q.strokeStyle = 'rgba(38,36,33,0.8)'; q.lineDashOffset = 6 * k; q.beginPath(); q.arc(...P(0, 0), (RS + 4) * k, 0, TAU); q.stroke();
        q.setLineDash([]);
        for (const [vf, vr, hf, hr] of S.vents) { q.strokeStyle = 'rgba(184,150,62,0.8)'; q.lineWidth = 3 * k; q.strokeRect(...P(vf - hf - 3, vr - hr - 3), (hf * 2 + 6) * k, (hr * 2 + 6) * k); }
        // sơn bong tróc: vảy nhỏ rải khắp + 3 dải mòn theo lối người / xe qua lại
        q.save(); q.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 1400; i++) {
          const rr = (0.3 + Math.pow(hash(i + 7303), 2) * 2.6) * k;
          q.fillStyle = `rgba(0,0,0,${0.3 + hash(i + 7304) * 0.65})`; q.beginPath(); q.ellipse(hash(i + 7301) * w, hash(i + 7302) * h, rr * 1.6, rr, hash(i + 7305) * 3, 0, TAU); q.fill();
        }
        for (const [f0, r0, f1, r1] of [[-100, -46, 100, -30], [-100, 28, 100, 46], [-28, -84, -8, 84]]) {
          for (let i = 0; i < 160; i++) {
            const t = hash(i * 3 + f0 + r0 + 7400), u = hash(i * 3 + f1 + 7401), [x, y] = P(f0 + (f1 - f0) * (f1 - f0 > r1 - r0 ? t : u), r0 + (r1 - r0) * (f1 - f0 > r1 - r0 ? u : t));
            q.fillStyle = `rgba(0,0,0,${0.15 + hash(i + 7402) * 0.3})`; q.beginPath(); q.arc(x, y, (2 + hash(i + 7403) * 5) * k, 0, TAU); q.fill();
          }
        }
        q.restore();
        speckle(q, w, h, 3000, ['rgba(60,56,50,0.5)'], 1, 3, 77);
        // miệng giếng / ống xả: không có sơn / bụi lơ lửng trên lỗ
        q.save(); q.globalCompositeOperation = 'destination-out'; q.fillStyle = '#000';
        q.beginPath(); q.arc(...P(0, 0), RS * k, 0, TAU); q.fill();
        for (const [vf, vr, hf, hr] of S.vents) q.fillRect(...P(vf - hf, vr - hr), hf * 2 * k, hr * 2 * k);
        q.restore();
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
    // ---- LÒNG GIẾNG PHÓNG SÂU ~27 m (kiểu Titan II: ống bê tông lót thép, ray dẫn, sàn công tác 9 tầng thu gọn sát
    //      thành, tên lửa 2 tầng đứng trên bệ đỡ, đáy ngập nước đọng vì bỏ hoang). Lưới địa hình (84 đv/ô) không khoét được
    //      lỗ Ø 8 m -> vẽ lòng giếng qua "cửa sổ stencil" (deepPortal): miệng giếng ghi stencil, xoá chiều sâu trong miệng,
    //      rồi mới vẽ lòng giếng chỉ trong miệng -> cỏ của lưới thô nằm trong giếng bị che, thấy được tận đáy
    const FL = -220, WL = -168, mr = 12.2, KP = new Kit(L, () => 0);
    const deep = deepMats(L.G + TOP, 150);
    {
      const H = TOP - FL, liner = new THREE.CylinderGeometry(RS, RS, H, 48, 1, true);
      { const uv = liner.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * RS / 64, uv.getY(i) * H / 64); }
      liner.userData.uvTiled = true;
      KP.add(deep('concDark', true), liner, M4(cf, (TOP + FL) / 2, cr));
      // vành thép lót ống mỗi 3 m, ray dẫn 4 phía + 2 máng cáp suốt chiều sâu
      for (let y = TOP - 14; y > FL; y -= 24) { const g = new THREE.CylinderGeometry(RS - 0.3, RS - 0.3, 1.4, 48, 1, true); g.userData.uvTiled = true; KP.add(deep('steelDark', true), g, M4(cf, y, cr)); }
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; KP.box(deep('steelGray'), cf + Math.cos(a) * (RS - 1.6), (TOP + FL) / 2, cr + Math.sin(a) * (RS - 1.6), 2.4, H, 3, -a, 24); }
      for (const a of [0.3, 3.5]) { KP.box(deep('steelDark'), cf + Math.cos(a) * (RS - 1.2), (TOP + FL) / 2, cr + Math.sin(a) * (RS - 1.2), 1.2, H, 5, -a, 24); for (const o of [-1.4, 0, 1.4]) KP.add(deep('rubber'), new THREE.CylinderGeometry(0.45, 0.45, H, 5), M4(cf + Math.cos(a) * (RS - 2.2) - Math.sin(a) * o, (TOP + FL) / 2, cr + Math.sin(a) * (RS - 2.2) + Math.cos(a) * o)); }
      // đáy: bệ bê tông + mặt nước đọng đen sẫm (phản chiếu mờ miệng giếng)
      KP.add(deep('concDark'), new THREE.CircleGeometry(RS, 40), M4(cf, FL, cr, -Math.PI / 2, 0, 0));
      KP.add(deep(new THREE.MeshStandardMaterial({ color: 0x1a201b, roughness: 0.06, metalness: 0.35 })), new THREE.CircleGeometry(RS - 0.3, 40), M4(cf, WL, cr, -Math.PI / 2, 0, 0));
      // sàn công tác các tầng: 10 tấm lưới thép gập dựng sát thành (vàng bạc màu), 1-2 tấm còn bắc ngang sang thân tên lửa,
      // đèn tầng (tắt), tay cáp rốn nối vào thân
      [18, -16, -50, -84, -118, -152].forEach((y, lv) => {
        for (let k = 0; k < 10; k++) {
          const a = k * TAU / 10 + lv * 0.31, c = Math.cos(a), sn = Math.sin(a), out = (lv + k) % 7 === 3;
          if (out) {
            const rm = (RS - 2 + mr + 1) / 2, ln = RS - 2 - mr - 1;
            KP.box(deep('steelDark'), cf + c * rm, y, cr + sn * rm, ln, 0.5, 9, -a, 24); KP.box(deep('steelGray'), cf + c * rm, y - 0.7, cr + sn * rm, ln, 0.8, 9.4, -a, 24);
            for (const s of [-1, 1]) KP.box(deep('yellow'), cf + c * rm - sn * s * 4.4, y + 3.6, cr + sn * rm + c * s * 4.4, ln, 0.35, 0.35, -a, 24);
          } else {
            // tấm sàn lưới thép gập dựng sát thành, chỉ mép trên sơn vàng; bản lề + giá đỡ bắt vào thành
            KP.box(deep('steelDark'), cf + c * (RS - 2.4), y + 5, cr + sn * (RS - 2.4), 0.5, 10, 8, -a, 24);
            KP.box(deep('yellow'), cf + c * (RS - 2.4), y + 9.8, cr + sn * (RS - 2.4), 0.6, 0.6, 8, -a, 24);
            KP.box(deep('steelGray'), cf + c * (RS - 1.4), y, cr + sn * (RS - 1.4), 1.6, 1.2, 9, -a, 24);
          }
          if (k % 3 === 0) KP.box(deep('lampAmber'), cf + c * (RS - 0.7), y + 7, cr + sn * (RS - 0.7), 0.6, 0.9, 2.2, -a, 0);
        }
        if (lv % 2) { const a = 0.6 + lv; KP.beam(deep('steelDark'), [cf + Math.cos(a) * (RS - 1), y + 4, cr + Math.sin(a) * (RS - 1)], [cf + Math.cos(a) * (mr + 0.8), y + 1, cr + Math.sin(a) * (mr + 0.8)], 1.2); }
      });
      // tên lửa 2 tầng Ø 3 m: thân (ảnh ICBM, bụi ố), vành nối tầng, bệ đỡ dưới chân ngập nước, đầu đạn Mk-6 chống nhiệt
      const y0 = FL + 14, body = new THREE.CylinderGeometry(mr, mr, 6 - y0, 40, 1, true);
      body.userData.uvTiled = true;
      KP.add(deep('icbm'), body, M4(cf, (6 + y0) / 2, cr));
      KP.cyl(deep('steelDark'), cf, 4.4, cr, mr + 0.4, mr + 0.4, 1.6, 36);
      KP.cyl(deep('steelDark'), cf, -46, cr, mr + 0.3, mr + 0.3, 2.4, 36);
      KP.cyl(deep('steelGray'), cf, y0 - 6, cr, mr + 4, mr + 5, 8, 24);
      const rv = [[12.2, 0], [10.2, 6], [8.2, 12], [6.2, 18], [4.4, 23], [3.2, 25.4], [1.6, 26.6], [0, 27]].map(([x, y]) => new THREE.Vector2(x, y));
      const rg = new THREE.LatheGeometry(rv, 40); rg.userData.uvTiled = true;
      KP.add(deep(MAT.rv || (MAT.rv = new THREE.MeshStandardMaterial({ map: rvTex(), color: 0xffffff, roughness: 0.88, metalness: 0.05 }))), rg, M4(cf, 6, cr));
    }
    const mouths = [[new THREE.CircleGeometry(RS + 0.6, 40), M4(cf, TOP - 0.3, cr, -Math.PI / 2, 0, 0)]];
    anim.steam.push([K.W(cf, cr - 14), L.G + TOP - 4]);
    K.solid(cf, cr, RS + 2, RS + 2, -2, TOP + 1);
    // ---- 2 ống xả khói từ đáy giếng lên mặt đất: ống bê tông sâu (qua cửa sổ stencil như giếng), lưới thép chịu nhiệt
    for (const [vf, vr, hf, hr] of S.vents) {
      const f = cf + vf, r = cr + vr, VB = -90, VH = TOP - 1 - VB;
      const vg = new THREE.BoxGeometry(hf * 2, VH, hr * 2); vg.userData.uvTiled = true;
      { const p = vg.attributes.position, uv = vg.attributes.uv, n = vg.attributes.normal; for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)); uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / 64, p.getY(i) / 64); } }
      KP.add(deep('concDark', true), vg, M4(f, (TOP - 1 + VB) / 2, r));
      for (let y = TOP - 16; y > VB + 10; y -= 26) KP.box(deep('steelDark'), f, y, r, hf * 2 - 0.4, 1.6, 1.6, 0, 24);
      KP.add(deep(new THREE.MeshStandardMaterial({ color: 0x1a201b, roughness: 0.06, metalness: 0.35 })), new THREE.PlaneGeometry(hf * 2, hr * 2), M4(f, VB + 6, r, -Math.PI / 2, 0, 0));
      mouths.push([new THREE.PlaneGeometry(hf * 2 + 0.4, hr * 2 + 0.4), M4(f, TOP - 1.8, r, -Math.PI / 2, 0, 0)]);
      for (let x = -hf + 2; x <= hf - 2; x += 4) K.box('steelDark', f + x, TOP - 0.6, r, 1.2, 2, hr * 2);
      K.box('steelDark', f, TOP - 1.6, r, hf * 2, 1.2, 1.6);
      for (const s of [-1, 1]) { K.box('steelGray', f + s * (hf + 1), TOP + 0.6, r, 2, 1.2, hr * 2 + 4); K.box('steelGray', f, TOP + 0.6, r + s * (hr + 1), hf * 2, 1.2, 2); }
      K.solid(f, r, hf, hr, -2, TOP + 2);
      anim.steam.push([K.W(f, r), L.G + TOP + 2]);
    }
    deepPortal(group, KP, mouths);
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
      K.box('hazard', cf + s * 58, TOP - 1.6, RE + 0.3, 28, 2.6, 0.6, 0, 16);   // chỉ 1 dải sọc ở mép trên đầu dầm
      for (const t of [-6, 6]) K.box('steelGray', cf + s * 58 + t, TOP + 4, RE - 3, 5, 5, 6);   // chặn cuối ray
      K.solid(cf + s * 58, (cr + S.hr + RE) / 2, 14, (RE - cr - S.hr) / 2, 0, TOP + 3);
    }
    {
      const sh = new THREE.Shape();
      sh.moveTo(-DR - 8, 0); sh.lineTo(DR + 8, 0); sh.lineTo(DR, DT); sh.lineTo(-DR, DT); sh.closePath();
      const wedge = new THREE.ExtrudeGeometry(sh, { depth: DF * 2, bevelEnabled: false });
      wedge.translate(0, 0, -DF);
      { const uv = wedge.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24); wedge.userData.uvTiled = true; }
      K.add('steelGray', wedge, M4(cf, RY, dr, 0, -Math.PI / 2, 0));
      K.box('conc', cf, RY + DT / 2 + 0.05, dr, DF * 2 + 0.2, DT + 0.1, DR * 2, 0, 64);
      // mép nêm thép: gân tăng cứng theo mặt vát mỗi ~1.6 m + hàng bu lông chân nêm (trước: mặt xám phẳng lì như nhựa)
      for (const s of [-1, 1]) {
        for (let x = -DF + 7; x <= DF - 7; x += 13) K.box('steelDark', cf + x, RY + DT / 2, dr + s * (DR + 4.4), 0.8, 14.2, 1.2, 0, 24, -s * 0.588);
        for (let x = -DF + 3; x <= DF - 3; x += 4.4) K.cyl('steelDark', cf + x, RY + 0.6, dr + s * (DR + 7.6), 0.45, 0.45, 0.9, 6);
        K.box('steelDark', cf, RY + 0.5, dr + s * (DR + 8.2), DF * 2, 1, 0.8);
      }
      for (const s of [-1, 1]) { K.box('steelDark', cf + s * (DF + 0.8), RY + DT / 2, dr, 1.6, DT + 1, DR * 2 + 16); K.box('hazard', cf + s * (DF + 1.7), RY + DT - 1.8, dr, 0.4, 2.4, DR * 2, 0, 16); }
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
      // NẮP ĐẤT GÒ (lưới mịn 4 đv, cùng vật liệu / ảnh nền mặt đất): lưới thô quanh mặt tiền đã bị hạ (MapGen nukeCoarse)
      // -> dựng lại đúng gò, vách cắt đứng nằm trong thân tường mặt tiền. Chỉ dựng ô cao hơn lưới thô (chỗ bị hạ)
      {
        const T = K.terrain, gmat = T && T.groundLikeMaterial && T.groundLikeMaterial();
        if (gmat && K.rawAt) {
          gmat.polygonOffset = true; gmat.polygonOffsetFactor = -1; gmat.polygonOffsetUnits = -2;
          const ST = 4, fa = C.f - C.hf - C.run - 8, fb = ff - 4, ra = C.r - C.hr - C.run - 6, rb = C.r + C.hr + C.run + 6;
          const nf = Math.ceil((fb - fa) / ST), nr = Math.ceil((rb - ra) / ST), N1 = nr + 1;
          const pos = new Float32Array((nf + 1) * N1 * 3), uvs = new Float32Array((nf + 1) * N1 * 2), hgt = new Float32Array((nf + 1) * N1), raw = new Float32Array((nf + 1) * N1);
          for (let i = 0; i <= nf; i++) for (let j = 0; j <= nr; j++) {
            const f = fa + i * ST, r = ra + j * ST, k = i * N1 + j, [x, z] = K.W(f, r);
            raw[k] = K.rawAt(x, z) - L.G; hgt[k] = K.earth(f, r);
            pos.set([f, hgt[k] + 0.15, r], k * 3); uvs.set([0.5 + x / T.width, 0.5 - z / T.depth], k * 2);
          }
          const idx = [];
          for (let i = 0; i < nf; i++) for (let j = 0; j < nr; j++) {
            const a = i * N1 + j, b = a + N1, q = [a, b, b + 1, a + 1];
            if (q.every(v => hgt[v] < 0.6) || q.every(v => Math.abs(hgt[v] - raw[v]) < 0.05)) continue;
            idx.push(a, a + 1, b, b, a + 1, b + 1);
          }
          if (idx.length) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
            // pháp tuyến từ cao độ làm mờ (~16 đv) như lưới địa hình thô: shader mặt đất chọn cỏ / đất theo độ dốc -> cùng màu cỏ gò
            const hb = Float32Array.from(hgt), tmp = new Float32Array(hb.length), R = 4;
            for (let pass = 0; pass < 2; pass++) for (const [di, dj] of [[1, 0], [0, 1]]) {
              for (let i = 0; i <= nf; i++) for (let j = 0; j <= nr; j++) {
                let s = 0, n = 0;
                for (let q = -R; q <= R; q++) { const ii = i + q * di, jj = j + q * dj; if (ii < 0 || ii > nf || jj < 0 || jj > nr) continue; s += hb[ii * N1 + jj]; n++; }
                tmp[i * N1 + j] = s / n;
              }
              hb.set(tmp);
            }
            const nrm = new Float32Array(pos.length), D = 2;
            for (let i = 0; i <= nf; i++) for (let j = 0; j <= nr; j++) {
              const i0 = Math.max(0, i - D), i1 = Math.min(nf, i + D), j0 = Math.max(0, j - D), j1 = Math.min(nr, j + D);
              const gf = (hb[i1 * N1 + j] - hb[i0 * N1 + j]) / ((i1 - i0) * ST), gr = (hb[i * N1 + j1] - hb[i * N1 + j0]) / ((j1 - j0) * ST), l = Math.hypot(gf, 1, gr);
              nrm.set([-gf / l, 1 / l, -gr / l], (i * N1 + j) * 3);
            }
            g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
            const cap = new THREE.Mesh(g, gmat); cap.name = 'nuke_lcc_cap'; cap.receiveShadow = true; cap.castShadow = true;
            cap.userData.ground = true;   // tia chuột ngắm mặt đất trúng nắp đất, không xuyên xuống lưới hạ
            group.add(cap);
          }
        }
      }
      for (const s of [-1, 1]) K.cbox('conc', ff - 7, Hh / 2 - 2, C.r + s * (W + DW) / 2, 14, Hh + 4, W - DW, 1.2);
      K.cbox('conc', ff - 7, (DH + Hh) / 2 - 1, C.r, 14, Hh - DH + 2, DW * 2, 1.2);
      K.cbox('concDark', ff - 4, Hh + 1.5, C.r, 22, 3, W * 2 + 6, 1);
      K.cbox('concDark', ff + 6, DH + 4, C.r, 14, 3, DW * 2 + 10, 0.8);                    // mái hắt trên cửa
      for (const s of [-1, 1]) K.cbox('concDark', ff + 6, (DH + 4) / 2, C.r + s * (DW + 3.5), 14, DH + 4, 3, 0.6);
      K.box('interior', ff - 4, DH / 2, C.r, 0.6, DH, DW * 2);
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

    const kit = secKit(K, anim), { oF, oR, iF, iR, G, CZ, CR, mul, win, acUnit, booth, lamp, tower, pillbox, hesco } = kit;
    perimeter(K, kit);

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

    for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -240], [-iF + 38, iR - 38], [-iF + 38, -iR + 38], [iF - 28, G + 40], [iF - 28, -G - 40], [-iF + 30, 0], [-62, iR - 32], [-150, -iR + 32]]) tower(f, r);

    for (const [f, r] of [[iF - 36, 330], [-iF + 22, 180], [-iF + 22, -120], [iF - 26, -300]]) pillbox(f, r);

    // ---- PHÒNG KHÔNG: 2 tháp pháo tầm gần + radar cảnh giới ăng-ten xoay trên cột giàn
    // tháp pháo tầm gần kiểu Phalanx: bệ bê tông (đặt theo mặt đất, chân dốc thì bệ cao thêm), đế xoay, càng chữ U,
    // khối nâng hạ: thùng đạn trống nằm ngang, hộp khoá nòng, chùm 6 nòng có 2 vành kẹp + vành giữ đầu nòng, vòm radar
    // "R2-D2" (thân trụ + chỏm cầu) có cửa sổ ăng-ten bám dõi phía trước, ăng-ten sục sạo trên đỉnh
    const ciws = (f, r, az, el) => {
      const hs = [[0, 0], [-14, -14], [14, -14], [-14, 14], [14, 14]].map(([a, b]) => Math.max(0, K.earth(f + a, r + b)));
      const y0 = Math.max(...hs), ym = Math.min(...hs) - 1.5, ph = y0 + 6 - ym;
      K.cbox('conc', f, ym + ph / 2, r, 30, ph, 30, 1.4);
      const b = M4(f, y0 + 6, r, 0, az, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
      K.add('steelWhite', new THREE.CylinderGeometry(7.4, 8.4, 8, 22), at(0, 4, 0));
      K.add('steelDark', new THREE.CylinderGeometry(8.8, 8.8, 1.2, 22), at(0, 8.6, 0));
      for (const s of [-1, 1]) K.add('steelWhite', boxGeo(9, 9, 1.8, 24), at(0, 13.5, s * 6.6));
      const g = mul(b, M4(0, 16, 0, 0, 0, el)), ag = (x, y, z, rx, ry, rz) => mul(g, M4(x, y, z, rx, ry, rz));
      K.add('steelWhite', new THREE.CylinderGeometry(4.2, 4.2, 15, 18), ag(-3, -0.5, 0, 0, 0, Math.PI / 2));
      K.add('steelDark', new THREE.CylinderGeometry(4.4, 4.4, 0.8, 18), ag(4.6, -0.5, 0, 0, 0, Math.PI / 2));
      K.add('steelGray', boxGeo(6, 3.4, 4.6, 24), ag(7, 0.4, 0));
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; K.add('steelDark', new THREE.CylinderGeometry(0.42, 0.42, 19, 6), ag(19.5, 0.4 + Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0, 0, -Math.PI / 2)); }
      for (const x of [13, 21, 28.6]) K.add('steelDark', new THREE.CylinderGeometry(x > 28 ? 2.1 : 1.8, x > 28 ? 2.1 : 1.8, x > 28 ? 1.4 : 0.8, 12), ag(x, 0.4, 0, 0, 0, -Math.PI / 2));
      K.add('steelWhite', new THREE.CylinderGeometry(5.4, 5.6, 10, 20), ag(-1, 9, 0));
      K.add('steelWhite', new THREE.SphereGeometry(5.4, 20, 8, 0, TAU, 0, Math.PI / 2), ag(-1, 14, 0));
      K.add('steelGray', new THREE.CylinderGeometry(3, 3, 0.5, 16), ag(4.3, 9.4, 0, 0, 0, -Math.PI / 2));
      K.add('steelDark', boxGeo(2.4, 1.6, 2.4, 24), ag(-1, 19.6, 0));
      K.solid(f, r, 16, 16, 0, y0 + 40);
    };
    ciws(S.f - S.hf - 60, 70, 0.4, 0.3); ciws(iF - 70, 130, -0.7, 0.12);
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
        K.box('interior', hf + x, oh / 2, fr0 - 0.3, 52, oh, 0.4);
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
        // sứ xuyên cao áp tráng men nâu: thân trụ + 8 tán (to nhỏ xen kẽ), mũ đồng nối dây trên đỉnh
        for (const x of [-3, 0, 3]) {
          K.cyl('steelGray', tf2 + x, 15, tr2 + z, 0.9, 0.9, 1.2, 10);
          const pr = [[0.62, 0]]; for (let j = 0; j < 8; j++) { const y = 0.4 + j * 0.72, R = j % 2 ? 1.0 : 1.32; pr.push([0.6, y], [R, y + 0.12], [R, y + 0.22], [0.6, y + 0.42]); }
          pr.push([0.5, 6.2], [0, 6.2]);
          const lg = new THREE.LatheGeometry(pr.map(([a, b]) => new THREE.Vector2(a, b)), 12); lg.userData.uvTiled = true;
          K.add('porcelain', lg, M4(tf2 + x, 16.2, tr2 + z));
          K.cyl('steelDark', tf2 + x, 22.3, tr2 + z, 0.55, 0.7, 0.9, 8);
        }
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
      {
        const W = 13, H = 8;
        const fg = new THREE.PlaneGeometry(W, H, 26, 12);
        fg.translate(W / 2, 0, 0);
        fg.computeVertexNormals();
        const sfMat = MAT.flag || (MAT.flag = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, map: texOf('flag_v2', 256, 160, (q, w, h) => {
          q.fillStyle = '#3d4a2c'; q.fillRect(0, 0, w, h);
          for (let x = 0; x < w; x += 2) { q.fillStyle = (x % 4 === 0) ? 'rgba(25, 32, 18, 0.15)' : 'rgba(240, 235, 210, 0.08)'; q.fillRect(x, 0, 1, h); }
          for (let y = 0; y < h; y += 2) { q.fillStyle = (y % 4 === 0) ? 'rgba(25, 32, 18, 0.12)' : 'rgba(240, 235, 210, 0.06)'; q.fillRect(0, y, w, 1); }
          q.fillStyle = '#d6a51f'; q.beginPath(); q.arc(w / 2, h / 2, 44, 0, TAU); q.fill();
          q.fillStyle = '#1b1b1b'; q.font = 'bold 44px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('SF', w / 2, h / 2 + 2);
          q.strokeStyle = 'rgba(30, 35, 22, 0.5)'; q.lineWidth = 3; q.strokeRect(3, 3, w - 6, h - 6);
        }) }));
        const flagMesh = new THREE.Mesh(fg, sfMat);
        flagMesh.position.set(qf + 34, 65, qr + 24);
        flagMesh.rotation.y = 0.3;
        flagMesh.castShadow = true;
        group.add(flagMesh);
        if (anim && anim.flags) anim.flags.push({ mesh: flagMesh, base0: fg.attributes.position.array.slice(), w: W, h: H, t: hash(qf + qr) * 10 });
      }
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
  // CÔNG TRÌNH PHỤ DÙNG CHUNG cho hầm sinh học / trận địa phòng không
  // ===========================================================================
  // Nhà bê tông nhiều tầng (base: gốc giữa mặt bằng, mặt tiền +x): gờ sàn, cửa sổ có khung 4 mặt, sảnh có mái che + bậc,
  // điều hoà treo tường, lan can mái, thiết bị trên mái, biển tên trên mặt tiền
  function officeBlock(K, kit, f, r, ry, L2, W2, floors, sign) {
    const { mul, win, acUnit } = kit, FH = 18, H = floors * FH, base = M4(f, 0, r, 0, ry, 0);
    K.cbox('conc', 0, H / 2, 0, L2, H, W2, 1.2, 0, base);
    for (let k = 1; k < floors; k++) K.cbox('concDark', 0, k * FH, 0, L2 + 1, 1.4, W2 + 1, 0.4, 0, base);
    for (const s2 of [-1, 1]) { K.cbox('concDark', 0, H + 1.5, s2 * (W2 / 2 - 0.7), L2, 3, 1.4, 0.3, 0, base); K.cbox('concDark', s2 * (L2 / 2 - 0.7), H + 1.5, 0, 1.4, 3, W2, 0.3, 0, base); }
    const front = mul(base, M4(L2 / 2, 0, 0, 0, Math.PI / 2, 0)), back = mul(base, M4(-L2 / 2, 0, 0, 0, -Math.PI / 2, 0));
    const sideA = mul(base, M4(0, 0, W2 / 2, 0, 0, 0)), sideB = mul(base, M4(0, 0, -W2 / 2, 0, Math.PI, 0));
    for (let k = 0; k < floors; k++) {
      const y = k * FH + 10;
      for (let x = -W2 / 2 + 10; x <= W2 / 2 - 10; x += 14) if (k || Math.abs(x) > 10) win(front, x, y, 8, 6);
      for (let x = -W2 / 2 + 10; x <= W2 / 2 - 10; x += 18) win(back, x, y, 6, 5);
      for (let x = -L2 / 2 + 10; x <= L2 / 2 - 10; x += 14) { win(sideA, x, y, 7, 6); win(sideB, x, y, 7, 6); }
    }
    // sảnh: cửa kính đôi, mái đua, 2 cột, bậc tam cấp
    K.add('glass', new THREE.PlaneGeometry(10, 12), mul(front, M4(0, 6.5, 0.15)));
    K.add('steelDark', new THREE.BoxGeometry(11, 0.8, 0.8), mul(front, M4(0, 12.8, 0.4)));
    K.cbox('concDark', 0, 15.4, 6, 18, 1.4, 12, 0.3, 0, front);
    for (const s2 of [-1, 1]) K.add('steelGray', new THREE.CylinderGeometry(0.5, 0.5, 15, 8), mul(front, M4(s2 * 8, 7.5, 11.4)));
    for (let k = 0; k < 3; k++) K.cbox('concDark', 0, 0.5 + k, 2 + (2 - k) * 1.6, 16, 1, 3.4 + (2 - k) * 3.2, 0.2, 0, front);
    for (let x = -W2 / 2 + 17; x <= W2 / 2 - 17; x += 14) if (Math.abs(x) > 12) acUnit(front, x, 6);
    K.cbox('steelGray', -L2 / 5, H + 3.5, W2 / 5, 14, 5, 10, 0.5, 0, base); K.cbox('steelGray', L2 / 6, H + 3, -W2 / 4, 8, 4, 8, 0.5, 0, base);
    if (sign) K.add(decal('sign_' + sign[0], signTex('sign_' + sign[0], sign, { w: 1024, h: 192, bg: '#e9e6dc', fg: '#1d2a3a' })), new THREE.PlaneGeometry(Math.min(W2 - 8, 60), 9), mul(front, M4(0, H - 5, 0.2)));
    const c = Math.cos(ry), sn = Math.sin(ry);
    K.solid(f, r, Math.abs(c) * L2 / 2 + Math.abs(sn) * W2 / 2 + 1, Math.abs(sn) * L2 / 2 + Math.abs(c) * W2 / 2 + 1, 0, H + 6);
  }
  // Ống khói cao bê tông / thép có thang leo lồng bảo vệ + 2 sàn công tác, đèn báo bay (tắt khi bỏ hoang)
  function stack(K, f, r, R0, R1, H, m) {
    K.cyl('concDark', f, 0, r, R0 + 3, R0 + 4, 4, 18);
    K.cyl(m || 'conc', f, 4, r, R1, R0, H, 18);
    K.cyl('steelDark', f, H + 4, r, R1 + 0.4, R1 + 0.4, 3, 18);
    for (const y of [H * 0.45, H * 0.85]) { K.cyl('steelGray', f, y, r, R1 + (R0 - R1) * (1 - y / H) + 3.4, R1 + (R0 - R1) * (1 - y / H) + 3.4, 0.8, 18); K.add('lampRed', new THREE.SphereGeometry(0.8, 8, 6), M4(f + R1 + 3, y + 2, r)); }
    for (let y = 6; y < H; y += 2.2) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 3), M4(f - R0 - 1.6 + (R0 - R1) * y / H, y, r));
    // 2 thanh dọc thang (theo độ thuôn thân ống) + giằng bắt vào thân ống mỗi ~14 đv (không còn bậc trôi lơ lửng)
    for (const s of [-1, 1]) K.beam('steelGray', [f - R0 - 1.6 + (R0 - R1) * 4 / H, 4, r + s * 1.5], [f - R0 - 1.6 + (R0 - R1), H, r + s * 1.5], 0.35);
    for (let y = 12; y < H; y += 14) { const xr = f - R0 - 1.6 + (R0 - R1) * y / H, xs = f - (R0 - (R0 - R1) * Math.max(0, y - 4) / H); K.beam('steelGray', [xs + 0.3, y, r], [xr, y, r], 0.3); }
    for (let y = 10; y < H; y += 7) K.add('steelGray', new THREE.TorusGeometry(2.2, 0.15, 3, 10, Math.PI), M4(f - R0 - 2.4 + (R0 - R1) * y / H, y, r, Math.PI / 2, 0, -Math.PI / 2));
    K.solid(f, r, R0 + 3, R0 + 3, 0, H + 6);
  }
  // Bồn đứng (thép không gỉ / sơn trắng) trên bệ: vỏ có mối hàn, mái côn, thang + lan can mái, ống nối
  function vTank(K, f, r, R, H, ry, m) {   // m: vật liệu vỏ + mái (mặc định sơn trắng ngà 'tankShell')
    K.cyl('concDark', f, 0, r, R + 2, R + 2.4, 1.6, 24);
    K.add(m || 'tankShell', new THREE.CylinderGeometry(R, R, H, 28, 1, true), M4(f, 1.6 + H / 2, r, 0, ry || 0, 0));
    K.add(m || 'steelWhite', new THREE.ConeGeometry(R + 0.3, R * 0.35, 28), M4(f, 1.6 + H + R * 0.175, r));
    for (let y = 4; y < H; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 2.6), M4(f + R + 1.2, y, r));
    for (const s2 of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(0.3, H, 0.3), M4(f + R + 1.2, 1.6 + H / 2, r + s2 * 1.3));
    for (let i = 0; i < 10; i++) { const a = i * 0.3 - 1.4; K.add('steelGray', new THREE.BoxGeometry(0.3, 4, 0.3), M4(f + Math.cos(a) * (R - 0.8), 1.6 + H + 2, r + Math.sin(a) * (R - 0.8))); }
    K.solid(f, r, R + 2, R + 2, 0, H + R * 0.35 + 2);
  }

  // ===========================================================================
  // 3. TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG S-125 PECHORA (SA-3) — BỎ HOANG
  // ===========================================================================
  // Tên lửa 5V27 (dài ~6 m = 48 đơn vị), nằm dọc +X, đuôi tại x = 0: tầng đẩy Ø 0.55 m có 4 cánh lớn xếp chéo, tầng hành
  // trình Ø 0.38 m có 4 cánh giữa, 4 cánh lái nhỏ gần mũi, mũi nhọn
  function missile125(K, base) {
    const at = (x, y, z, rx, ry, rz) => new THREE.Matrix4().multiplyMatrices(base, M4(x, y, z, rx, ry, rz));
    const along = (m, r0, r1, x0, x1, seg) => K.add(m, new THREE.CylinderGeometry(r1, r0, x1 - x0, seg || 14), at((x0 + x1) / 2, 0, 0, 0, 0, -Math.PI / 2));
    along('steelDark', 1.6, 2.1, -1.6, 0);
    along('oliveDark', 2.2, 2.2, 0, 15, 16);
    along('steelDark', 2.25, 2.25, 14.6, 15.4, 16);
    along('missile', 2.2, 1.5, 15, 17.5);
    along('missile', 1.5, 1.5, 17.5, 41, 14);
    along('missile', 1.5, 0.15, 41, 49.5, 14);
    const fin = (m, x0, x1, t0, t1, span, rad, roll, th) => {
      const sh = new THREE.Shape(); sh.moveTo(x0, rad); sh.lineTo(x1, rad); sh.lineTo(t1, rad + span); sh.lineTo(t0, rad + span); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }); g.translate(0, 0, -th / 2);
      for (let k = 0; k < 4; k++) K.add(m, g.clone(), at(0, 0, 0, roll + k * Math.PI / 2, 0, 0));
      g.dispose();
    };
    fin('oliveDark', 0.6, 10, 5, 10.5, 6.2, 2.1, Math.PI / 4, 0.5);   // cánh tầng đẩy
    fin('missile', 23, 33, 28, 33.5, 3.4, 1.4, Math.PI / 4, 0.35);    // cánh giữa tầng hành trình
    fin('missile', 37.5, 40, 38.6, 40.2, 1.6, 1.4, 0, 0.3);           // cánh lái mũi
  }
  // Xe quân sự 6x6 kiểu ZIL-131 (8 đơn vị = 1 m, dài ~7 m). +x = đầu xe, gốc tại mặt đất giữa xe.
  // - cabin thép: vách sau thẳng, kính chắn gió 2 tấm nghiêng có trụ giữa + gạt mưa, cửa có đường viền / tay nắm / kính,
  //   gương chiếu hậu trên tay đỡ, bậc lên xuống 2 nấc, mái có gờ
  // - ca-pô vát mũi, lưới tản nhiệt khe đứng, 2 chắn bùn trước phẳng nóc rộng kiểu ZIL (đèn pha tròn có vành ở đầu chắn bùn,
  //   đèn xi-nhan), cản trước + 2 móc kéo + tời dưới cản
  // - khung gầm 2 dầm dọc + dầm ngang, bình xăng, hộp ắc-quy, bình hơi, cầu chủ động có vỏ vi sai, bánh lốp gai chữ V
  //   (lốp bo tròn, mâm thép lõm có lỗ + bu-lông, moay-ơ có ống bơm hơi tập trung), bánh dự phòng sau cabin, chắn bùn sau
  // thùng: 'kung' (thùng chuyên dụng K-131: gân, gờ mái, cửa sau có khung + bản lề + thang, cửa sổ có khung, bộ lọc thông
  // gió, hộp đồ dưới thùng, tang cáp, ăng-ten), 'loader' (khung ray chở 2 tên lửa), 'mast' (thùng + cột ăng-ten có dây néo),
  // 'cargo' (thùng lửng thành gỗ chở đạn: mui bạt cuộn nửa trước, thành sau hạ, hòm đạn / ống đạn pháo xếp dở — điểm tiếp
  // tế supply_depot.js). opts.intact: xe đang dùng (không vỡ kính như xe bỏ hoang ở căn cứ)
  const TRUCK_GEO = {};
  function truckGeo() {
    if (TRUCK_GEO.tire) return TRUCK_GEO;
    // lốp: mặt cắt bo tròn dày dặn của lốp việt dã xe tải quân sự (Ural/ZIL)
    const pr = [
      [2.65, -1.55], [3.3, -1.7], [4.0, -1.55], [4.45, -1.05],
      [4.62, 0],
      [4.45, 1.05], [4.0, 1.55], [3.3, 1.7], [2.65, 1.55]
    ];
    TRUCK_GEO.tire = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 24);
    // mâm thép dập sâu lòng (deep-dish steel rim)
    const prRim = [
      [2.7, 1.35], [2.55, 1.45], [2.35, 1.15], [1.7, 0.5], [1.1, 0.55], [0.2, 0.55]
    ];
    TRUCK_GEO.rim = new THREE.LatheGeometry(prRim.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    // gai lốp việt dã: x: dày hướng kính, y: dọc trục lốp, z: theo chu vi
    TRUCK_GEO.lug = new THREE.BoxGeometry(0.3, 0.95, 0.5);
    return TRUCK_GEO;
  }
  // tấm ép theo biên dạng pts (mặt XY) dày t theo Z, vát cạnh cố định nhỏ (plateGeo vát theo tỉ lệ độ dày -> khối dày bị bo mất hình)
  function slabGeo(pts, t, bev) {
    const b = bev === undefined ? 0.35 : bev, sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
    g.translate(0, 0, -(t - 2 * b) / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
    return g;
  }
  // tâm cầu trước xe tải (cục bộ x): dưới nửa sau ca-pô kiểu ZIL-131 (trước đây 20 = dưới cabin, dáng xe đầu bằng)
  const TRUCK_FX = 25;
  function milTruck(K, base, body, opts) {
    const at = (x, y, z, rx, ry, rz) => new THREE.Matrix4().multiplyMatrices(base, M4(x, y, z, rx, ry, rz));
    const G = truckGeo();
    // ---- khung gầm
    for (const z of [-4.2, 4.2]) { K.add('steelDark', new THREE.BoxGeometry(67, 2.4, 1), at(4.5, 7, z)); K.add('steelDark', new THREE.BoxGeometry(67, 0.3, 1.8), at(4.5, 8.1, z + (z > 0 ? -0.4 : 0.4))); }
    for (const x of [37, 30, 12, -4, -18, -28]) K.add('steelDark', new THREE.BoxGeometry(1.2, 1.6, 8.4), at(x, 7, 0));
    // ---- cầu + bánh: 3 cầu xe tải 6x6, vỏ vi sai, bánh xe quân sự chuẩn gai chữ V bám chặt
    for (const x of [TRUCK_FX, -11, -21]) {
      K.add('steelDark', new THREE.CylinderGeometry(0.8, 0.8, 13, 10), at(x, 4.4, 0, Math.PI / 2, 0, 0));
      K.add('steelDark', new THREE.SphereGeometry(2, 12, 8), at(x, 4.4, 0.6).multiply(new THREE.Matrix4().makeScale(1, 0.85, 0.75)));
      for (const s of [-1, 1]) {
        const wz = s * 7.6, W = at(x, 4.4, wz, s * Math.PI / 2, 0, 0);   // trục Y lathe -> hướng ra ngoài xe
        K.add('rubber', G.tire.clone(), W);
        // Gai lốp rãnh chữ V so le ôm khít vào mặt lốp
        for (let k = 0; k < 18; k++) {
          const a = k / 18 * Math.PI * 2;
          for (const h of [-1, 1]) {
            const shiftA = a + h * 0.08;
            const ca = Math.cos(shiftA), sa = Math.sin(shiftA);
            const lugM = new THREE.Matrix4().multiplyMatrices(
              W,
              M4(ca * 4.54, h * 0.65, sa * 4.54, 0, -shiftA, h * 0.4)
            );
            K.add('rubber', G.lug.clone(), lugM);
          }
        }
        // Mâm thép sâu lòng
        K.add('olive', G.rim.clone(), W);
        // Vành 8 bulông đúc nổi trên đĩa mâm
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2;
          K.add('steelDark', new THREE.CylinderGeometry(0.18, 0.18, 0.4, 6), new THREE.Matrix4().multiplyMatrices(W, M4(Math.cos(a) * 1.3, 0.8, Math.sin(a) * 1.3)));
        }
        // Moay-ơ trục xe tải có gờ đai ốc trung tâm và nắp vòi bơm hơi
        K.add('steelDark', new THREE.CylinderGeometry(0.8, 0.95, 1.2, 10), new THREE.Matrix4().multiplyMatrices(W, M4(0, 1.1, 0)));
        K.add('steelGray', new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), new THREE.Matrix4().multiplyMatrices(W, M4(0, 1.75, 0)));
      }
    }
    // ---- cabin: vỏ rỗng (2 tấm hông có lỗ kính cửa, mái bo tròn 2 mép, vách sau có kính hậu, khung kính chắn gió nghiêng
    // 2 tấm + trụ giữa) để nhìn qua kính thấy nội thất: sàn, tấp-lô có đồng hồ, vô-lăng + trụ lái (lái bên trái), 2 ghế
    // đệm + tựa, ụ máy giữa 2 ghế, 2 cần số. Xe bỏ hoang: ~1/3 ô kính vỡ mất (chỉ còn mảnh sót ở mép khung)
    const rshape = (pts, rad, holes) => {   // đa giác bo tròn góc (rad: số hoặc mảng theo đỉnh)
      const sh = new THREE.Shape(), n = pts.length, R = (i) => Array.isArray(rad) ? rad[i] : rad;
      const P = (i) => pts[(i + n) % n], lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let i = 0; i < n; i++) {
        const a = P(i - 1), c = P(i), b = P(i + 1), la = Math.hypot(c[0] - a[0], c[1] - a[1]), lb = Math.hypot(b[0] - c[0], b[1] - c[1]);
        const r = Math.min(R(i), la / 2, lb / 2), p0 = lerp2(c, a, r / la), p1 = lerp2(c, b, r / lb);
        i ? sh.lineTo(p0[0], p0[1]) : sh.moveTo(p0[0], p0[1]);
        sh.quadraticCurveTo(c[0], c[1], p1[0], p1[1]);
      }
      sh.closePath();
      (holes || []).forEach(hp => { const h = new THREE.Path(); hp.forEach(([x, y], i) => i ? h.lineTo(x, y) : h.moveTo(x, y)); h.closePath(); sh.holes.push(h); });
      return sh;
    };
    const extr = (sh, t, bev) => {
      const b = bev || 0.12, g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.05, t - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -(t - 2 * b) / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
      return g;
    };
    const lost = (k) => !(opts && opts.intact) && typeof ABANDONED !== 'undefined' && ABANDONED && hash(k * 3.17 + (base.elements[12] || 0) * 0.13 + (base.elements[14] || 0) * 0.07) < 0.34;
    const pane = (w, h, mtx, k) => {   // ô kính mỏng trong suốt; vỡ mất: 2 mảnh tam giác sót ở góc khung
      if (!lost(k)) { K.add('carGlass', new THREE.PlaneGeometry(w, h), mtx); return; }
      for (const [sx, sy] of [[-1, 1], [1, -1]]) {
        const g = new THREE.BufferGeometry(), x0 = sx * w / 2, y0 = sy * h / 2;
        g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x0 - sx * w * 0.35, y0, 0, x0, y0 - sy * h * 0.45, 0], 3)); g.computeVertexNormals();
        K.add('carGlass', g, mtx);
      }
    };
    const WIN = [[13.2, 18.4], [21.3, 18.4], [20.5, 23], [13.2, 23]];
    for (const s of [-1, 1]) {
      // tấm hông: cả thân cửa + khung trên, khoét lỗ kính cửa
      K.add('olive', extr(rshape([[11.4, 9.6], [23.6, 9.6], [23.6, 17], [22.5, 23.8], [11.4, 23.8]], [0.4, 0.4, 0.6, 1, 1.2], [WIN]), 0.6), at(0, 0, s * 9.0));
      pane(7.6, 4.6, at(17.1, 20.7, s * 8.95, 0, 0, 0).multiply(M4(0, 0, 0, 0, 0, 0)), s > 0 ? 1 : 2);
      // viền cửa (khe tối), tay nắm, bản lề, gương chiếu hậu, 2 bậc
      for (const [x, y, w, h] of [[12.6, 16.6, 0.18, 13.6], [16.9, 9.9, 8.6, 0.18]]) K.add('void', new THREE.BoxGeometry(w, h, 0.06), at(x, y, s * 9.33));
      K.add('void', new THREE.BoxGeometry(0.18, 13.2, 0.06), at(21.55, 16.5, s * 9.33, 0, 0, 0.08));
      K.add('steelGray', new THREE.BoxGeometry(1.6, 0.35, 0.45), at(14, 17.2, s * 9.5));
      for (const y of [12.4, 21]) K.add('steelDark', new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), at(21.5, y, s * 9.4));
      K.beam('steelDark', [22.8, 21.5, s * 9.2], [24.2, 22.6, s * 12], 0.3, base);
      K.cbox('steelDark', 24.4, 21.6, s * 12.1, 0.6, 3.2, 2, 0.15, 0, base);
      K.add('carGlass', new THREE.PlaneGeometry(1.6, 2.8), at(24.05, 21.6, s * 12.1, 0, Math.PI / 2, 0));
      for (const y of [7.4, 4.6]) K.add('steelDark', new THREE.BoxGeometry(3.2, 0.35, 1.6), at(13.2, y, s * 9.2));
      for (const x of [11.6, 14.8]) K.add('steelDark', new THREE.BoxGeometry(0.4, 5, 0.4), at(x, 7, s * 9.9));
    }
    // mái bo tròn 2 mép (mặt cắt ngang z-y đùn dọc x), gờ máng nước 2 bên
    {
      const R = extr(rshape([[-9.35, 23.4], [9.35, 23.4], [9.35, 24], [8.3, 25.5], [4.5, 26.1], [-4.5, 26.1], [-8.3, 25.5], [-9.35, 24]], [0, 0, 0.8, 2, 3, 3, 2, 0.8]), 11.6, 0.55);
      K.add('olive', R, at(17.1, 0, 0, 0, Math.PI / 2, 0));
      for (const s of [-1, 1]) K.add('olive', new THREE.BoxGeometry(11.6, 0.25, 0.3), at(17.1, 24.1, s * 9.5));
    }
    // vách sau (kính hậu nhỏ), vách trước dưới kính chắn gió, sàn
    K.add('olive', extr(rshape([[-9.0, 9.6], [9.0, 9.6], [9.0, 23.6], [-9.0, 23.6]], 0.3, [[[-4, 19], [4, 19], [4, 22], [-4, 22]]]), 0.5), at(11.65, 0, 0, 0, Math.PI / 2, 0));
    pane(8, 3, at(11.62, 20.5, 0, 0, Math.PI / 2, 0), 5);
    K.add('olive', new THREE.BoxGeometry(0.5, 7.4, 18), at(23.35, 13.3, 0));
    K.add('steelDark', new THREE.BoxGeometry(11.6, 0.4, 17.6), at(17.4, 10.1, 0));
    // khung kính chắn gió nghiêng: đầu, chân (bệ có gạt mưa), 2 trụ A + trụ giữa; 2 ô kính
    {
      const WS = at(23.05, 20.4, 0, 0, 0, 0.165), ws = (x, y, z, rx, ry, rz) => new THREE.Matrix4().multiplyMatrices(WS, M4(x, y, z, rx, ry, rz));
      K.add('olive', new THREE.BoxGeometry(0.6, 0.9, 18.4), ws(0, 3.4, 0));
      K.add('olive', new THREE.BoxGeometry(0.9, 0.8, 18.4), ws(0.1, -3.4, 0));
      for (const z of [-8.75, 8.75]) K.add('olive', new THREE.BoxGeometry(0.6, 7.6, 0.9), ws(0, 0, z));
      K.add('olive', new THREE.BoxGeometry(0.6, 7.6, 0.6), ws(0, 0, 0));
      for (const s of [-1, 1]) {
        pane(8.1, 6.6, ws(0, 0, s * 4.4, 0, Math.PI / 2, 0), 3 + (s > 0 ? 1 : 0));
        K.add('steelDark', new THREE.BoxGeometry(0.12, 4, 0.12), ws(0.4, -1.4, s * 4.4 - 1.2, 0.5, 0, 0));
        K.add('steelDark', new THREE.CylinderGeometry(0.2, 0.2, 0.4, 6), ws(0.45, -3.3, s * 4.4 - 2.2, 0, 0, Math.PI / 2));
      }
    }
    // nội thất
    {
      K.cbox('oliveDark', 21.4, 15.6, 0, 2.6, 2.6, 17.4, 0.4, 0, base);
      for (const z of [-6.2, -4.6, -3, 3]) K.add('void', new THREE.CircleGeometry(0.55, 12), at(20.08, 16.1, z, 0, -Math.PI / 2, 0));
      for (const z of [-6.2, -4.6, -3]) K.add('steelGray', new THREE.TorusGeometry(0.58, 0.08, 3, 12), at(20.07, 16.1, z, 0, -Math.PI / 2, 0));
      // vô-lăng 2 nan nghiêng về người lái + trụ lái
      const dir = v3(-0.62, 0.78, 0).normalize(), q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), dir);
      const SW = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().compose(v3(19.2, 17.4, -4.6), q, v3(1, 1, 1)));
      K.add('rubber', new THREE.TorusGeometry(2, 0.22, 6, 20), SW);
      for (const a of [0.3, Math.PI - 0.3]) K.add('steelDark', new THREE.BoxGeometry(2, 0.2, 0.15), new THREE.Matrix4().multiplyMatrices(SW, M4(Math.cos(a), Math.sin(a), 0, 0, 0, a)));
      K.beam('steelDark', [19.2, 17.4, -4.6], [21.6, 14.2, -4.6], 0.35, base);
      // 2 ghế (lái + phụ): đệm, tựa nghiêng, khung
      for (const z of [-4.6, 4.4]) {
        K.cbox('rubber', 15.6, 13, z, 4.6, 1.4, 5.2, 0.4, 0, base);
        K.add('rubber', new THREE.BoxGeometry(1.2, 6, 5.2), at(13.2, 16.6, z, 0, 0, 0.14));
        K.add('steelDark', new THREE.BoxGeometry(4, 1.8, 4.4), at(15.6, 11.2, z));
      }
      K.cbox('olive', 18.6, 11.6, 0, 7, 2.6, 3.6, 0.6, 0, base);
      K.beam('steelDark', [18.6, 12.8, -0.6], [17.4, 15.6, -0.9], 0.18, base); K.beam('steelDark', [19.4, 12.8, 0.6], [19, 15, 0.8], 0.15, base);
      K.add('steelDark', new THREE.SphereGeometry(0.35, 8, 6), at(17.4, 15.7, -0.9));
    }
    // ---- ca-pô kiểu ZIL-131: dài, hẹp hơn cabin, nóc vồng bo tròn 2 mép, dốc nhẹ xuống mũi, đường gân giữa; 2 hàng khe
    // thông gió hông phía sau; mặt nạ trước phẳng có khung, lưới khe đứng, 2 then khoá ca-pô
    {
      const X0 = 23.3, X1 = 37.6, L = X1 - X0;
      const hg = extr(rshape([[-6.3, 9.6], [6.3, 9.6], [6.3, 15.6], [5.2, 17.2], [-5.2, 17.2], [-6.3, 15.6]], [0, 0, 0.6, 1.4, 1.4, 0.6]), L, 0.3);
      hg.rotateY(-Math.PI / 2);
      const P = hg.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i) + (X0 + X1) / 2, y = P.getY(i), k = Math.max(0, (y - 12) / 5.2); P.setXYZ(i, x, y - k * (x - X0) * 0.075, P.getZ(i)); }
      hg.computeVertexNormals();
      K.add('olive', hg, base);
      K.add('olive', new THREE.BoxGeometry(L - 1, 0.18, 0.5), at(X0 + L / 2, 17.25 - L * 0.0375, 0, 0, 0, -0.075));
      for (const s of [-1, 1]) {
        for (let r = 0; r < 2; r++) for (let k = 0; k < 7; k++) K.add('void', new THREE.BoxGeometry(0.9, 0.22, 0.06), at(X0 + 1.6 + k * 1.15, 13.8 + r * 1.1, s * 6.34));
        K.add('steelDark', new THREE.BoxGeometry(0.6, 1, 0.3), at(X1 - 1.4, 14.6, s * 6.45));
        K.add('void', new THREE.BoxGeometry(L - 0.6, 0.08, 0.06), at(X0 + L / 2, 16.05 - L * 0.03, s * 6.34, 0, 0, -0.06));
      }
      // mặt nạ trước: khung, lưới khe đứng trong lòng tối
      K.add('olive', slabGeo([[-6.4, 9.4], [6.4, 9.4], [6.4, 15.4], [5.4, 16.3], [-5.4, 16.3], [-6.4, 15.4]], 0.8, 0.15), at(X1 + 0.1, 0, 0, 0, Math.PI / 2, 0));
      K.add('void', new THREE.BoxGeometry(0.2, 4.6, 9.6), at(X1 + 0.45, 12.7, 0));
      for (let k = -5; k <= 5; k++) K.add('olive', new THREE.BoxGeometry(0.5, 4.6, 0.32), at(X1 + 0.6, 12.7, k * 0.86));
      for (const y of [10.2, 15.1]) K.add('olive', new THREE.BoxGeometry(0.7, 0.55, 10.4), at(X1 + 0.6, y, 0));
    }
    // ---- chắn bùn trước kiểu ZIL-131: "cánh" phẳng rộng trùm bánh, mép trước bo tròn xuống, mép ngoài gập xuống thành gờ,
    // đuôi vuốt dốc xuống bậc lên cabin; vách lòng chắn bùn; đèn pha tròn lõm trong mặt trước cánh, đèn kích thước trên nóc
    // cánh, đèn xi-nhan; bậc cửa 2 nấc
    {
      const top = [[39.1, 6.8], [39.3, 11.6], [38.8, 12.7], [37.6, 13.1], [21.8, 13.1], [20.4, 12], [19.2, 9.4], [18.8, 7.6]];
      const band = (pts, th) => {   // dải tấm theo đường pts (mặt XY), dày th về phía trong (tâm cong ~ trục bánh)
        const inner = pts.map(([x, y]) => { const dx = 29 - x, dy = 5 - y, l = Math.hypot(dx, dy); return [x + dx / l * th, y + dy / l * th]; });
        return pts.concat(inner.reverse());
      };
      for (const s of [-1, 1]) {
        K.add('olive', slabGeo(band(top, 0.5), 4.4, 0.18), at(0, 0, s * 8.4));
        K.add('olive', slabGeo(band(top.map(([x, y]) => [x, y]), 1.6), 0.4, 0.1), at(0, -0.2, s * 10.55));
        K.add('oliveDark', slabGeo([[20.6, 8.2], [38.6, 8.2], [38.6, 12.6], [21.6, 12.6]], 0.4, 0.08), at(0, 0, s * 6.35));
        // đèn pha tròn lõm vào mặt trước cánh: hốc tối, vành, kính
        K.add('void', new THREE.CylinderGeometry(1.45, 1.45, 0.6, 16), at(38.9, 10.3, s * 8.4, 0, 0, Math.PI / 2));
        K.add('steelGray', new THREE.TorusGeometry(1.42, 0.2, 5, 18), at(39.5, 10.3, s * 8.4, 0, Math.PI / 2, 0));
        K.add('glass', new THREE.CircleGeometry(1.2, 16), at(39.42, 10.3, s * 8.4, 0, Math.PI / 2, 0));
        K.add('steelDark', new THREE.BoxGeometry(1, 0.8, 1), at(37.4, 13.5, s * 9.4));
        K.add('yellow', new THREE.BoxGeometry(0.2, 0.55, 0.8), at(37.95, 13.5, s * 9.4));
        K.add('steelDark', new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), at(39.3, 7.8, s * 8.4, 0, 0, Math.PI / 2));
        // bậc lên cabin 2 nấc dưới đuôi cánh
        for (const [y, x] of [[7.6, 16.6], [4.8, 16.2]]) K.add('steelDark', new THREE.BoxGeometry(3.2, 0.35, 1.8), at(x, y, s * 9.3));
        for (const x of [14.9, 18.1]) K.add('steelDark', new THREE.BoxGeometry(0.4, 4.4, 0.4), at(x, 6.6, s * 9.9));
      }
    }
    // ---- cản trước thép chữ U dày, 2 móc kéo, tời sau cản (ZIL-131 có tời), biển số trống
    K.add('steelDark', new THREE.BoxGeometry(1.8, 2.4, 22.4), at(40.4, 7.6, 0));
    K.add('steelDark', new THREE.BoxGeometry(0.6, 1.6, 22.4), at(41.4, 7.6, 0));
    for (const s of [-1, 1]) { K.add('steelGray', new THREE.TorusGeometry(0.8, 0.28, 6, 10), at(41.9, 7.2, s * 5.2, 0, 0, Math.PI / 2)); K.add('steelDark', new THREE.BoxGeometry(1.2, 2, 1.2), at(41.4, 7.4, s * 5.2)); }
    K.add('steelDark', new THREE.CylinderGeometry(1.3, 1.3, 7, 12), at(38.6, 5.2, 0, Math.PI / 2, 0, 0));
    K.add('rubber', new THREE.CylinderGeometry(1.15, 1.15, 6.4, 12), at(38.6, 5.2, 0, Math.PI / 2, 0, 0));
    for (const z of [3.6, -3.6]) K.add('steelGray', new THREE.CylinderGeometry(1.6, 1.6, 0.3, 12), at(38.6, 5.2, z, Math.PI / 2, 0, 0));
    K.add('void', new THREE.BoxGeometry(0.1, 1.6, 4.6), at(41.75, 7.6, 3.6));
    // ---- bình xăng, hộp ắc-quy, bình hơi, bánh dự phòng sau cabin
    K.add('olive', new THREE.CylinderGeometry(1.9, 1.9, 9, 14), at(5, 8.6, -7.2, 0, 0, Math.PI / 2));
    for (const x of [1.6, 8.4]) K.add('steelDark', new THREE.TorusGeometry(1.95, 0.15, 3, 14), at(x, 8.6, -7.2, 0, Math.PI / 2, 0));
    K.add('steelGray', new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8), at(7.5, 10.6, -7.2));
    K.cbox('oliveDark', 5, 8.2, 7.4, 6, 3.4, 3, 0.25, 0, base);
    K.add('steelGray', new THREE.BoxGeometry(5, 0.2, 0.2), at(5, 9.4, 8.95));
    K.add('steelGray', new THREE.CylinderGeometry(0.9, 0.9, 5, 10), at(-1, 6.6, 6.4, 0, 0, Math.PI / 2));
    {
      const S = at(9, 13.4, 0, 0, 0, Math.PI / 2);   // trục lốp dự phòng dọc theo x
      K.add('rubber', G.tire.clone(), S); K.add('olive', G.rim.clone(), S);
      K.add('steelDark', new THREE.BoxGeometry(1.6, 9, 1.2), at(9.8, 13.4, 0));
    }
    // chắn bùn sau + tấm chắn bùn cao su sau bánh cuối, đèn hậu
    for (const s of [-1, 1]) {
      K.add('steelDark', new THREE.BoxGeometry(22, 0.4, 3.6), at(-16, 9.4, s * 7.6));
      K.add('rubber', new THREE.BoxGeometry(0.25, 4.4, 3), at(-26.6, 6.8, s * 7.6));
      K.add('steelDark', new THREE.BoxGeometry(0.6, 1.2, 2.2), at(-29.6, 8.6, s * 7.4)); K.add('glass', new THREE.PlaneGeometry(1.6, 0.8), at(-29.95, 8.7, s * 7.4, 0, -Math.PI / 2, 0));
    }
    if (body === 'kung' || body === 'mast') {
      K.cbox('olive', -12, 19.4, 0, 36, 19.6, 19, 0.8, 0, base);
      for (let x = -28; x <= 4; x += 4) for (const s of [-1, 1]) K.add('oliveDark', new THREE.BoxGeometry(0.6, 18.6, 0.45), at(x, 19.4, s * 9.62));
      for (const s of [-1, 1]) { K.add('oliveDark', new THREE.BoxGeometry(36.4, 0.7, 0.7), at(-12, 29.3, s * 9.6)); K.add('oliveDark', new THREE.BoxGeometry(36.4, 0.6, 0.6), at(-12, 9.8, s * 9.6)); }
      // cửa sau: khung, bản lề, tay nắm, kính nhỏ; thang gấp
      K.add('oliveDark', new THREE.BoxGeometry(0.5, 15.6, 7.6), at(-30.25, 18, -3));
      K.add('olive', new THREE.BoxGeometry(0.5, 14.8, 6.8), at(-30.45, 18, -3));
      for (const y of [12, 24]) K.add('steelDark', new THREE.BoxGeometry(0.6, 1.2, 0.8), at(-30.6, y, -6.6));
      K.add('steelGray', new THREE.BoxGeometry(0.5, 0.4, 2), at(-30.8, 18, 0));
      K.add('glass', new THREE.PlaneGeometry(3, 2.4), at(-30.72, 22.6, -3, 0, -Math.PI / 2, 0));
      for (const z of [2.4, 5.6]) K.add('steelGray', new THREE.BoxGeometry(0.4, 9, 0.4), at(-31.4, 5.2, z, 0, 0, -0.12));
      for (let k = 0; k < 4; k++) K.add('steelGray', new THREE.BoxGeometry(0.4, 0.4, 3.2), at(-31.2 - k * 0.27, 1.6 + k * 2.2, 4));
      // cửa sổ có khung + tấm che nắng
      for (const s of [-1, 1]) for (const x of [-4, -20]) {
        K.add('void', new THREE.BoxGeometry(4.6, 3.6, 0.1), at(x, 22, s * 9.6));
        K.add('glass', new THREE.PlaneGeometry(4, 3), at(x, 22, s * 9.68, 0, s > 0 ? 0 : Math.PI, 0));
        K.add('oliveDark', new THREE.BoxGeometry(5, 0.3, 1.2), at(x, 24.1, s * 10.1, s * 0.3, 0, 0));
      }
      // bộ lọc thông gió FVU (vách trước), 2 cửa nóc, tang cáp sau, hộp đồ dưới thùng
      K.cbox('steelGray', 6.6, 22, -4.4, 1.6, 6, 6, 0.3, 0, base);
      for (let k = 0; k < 5; k++) K.add('steelDark', new THREE.BoxGeometry(0.2, 0.3, 5), at(7.45, 20 + k, -4.4));
      K.cbox('steelGray', -20, 29.8, 3, 6, 1.4, 6, 0.3, 0, base); K.cbox('steelGray', -6, 29.7, -4, 8, 1.2, 4, 0.3, 0, base);
      K.add('steelDark', new THREE.CylinderGeometry(2, 2, 3.4, 12), at(-30.8, 12.4, 5.4, 0, 0, Math.PI / 2));
      K.add('rubber', new THREE.CylinderGeometry(1.6, 1.6, 3.5, 12), at(-30.8, 12.4, 5.4, 0, 0, Math.PI / 2));
      for (const s of [-1, 1]) K.cbox('oliveDark', -3.4, 7.6, s * 7.4, 7, 3.2, 2.6, 0.25, 0, base);
      K.add('steelDark', new THREE.CylinderGeometry(0.15, 0.3, 14, 5), at(-27, 36.4, -8));
      K.add('steelDark', new THREE.CylinderGeometry(0.6, 0.7, 0.8, 8), at(-27, 29.6, -8));
    } else if (body === 'cargo') {
      // sàn gỗ trên khung phụ thép, 2 thành bên gỗ có nẹp thép + cọc, thành trước cao, thành sau hạ thõng xuống (đang dỡ hàng)
      K.add('steelDark', new THREE.BoxGeometry(36.4, 1, 19.4), at(-12.4, 9.3, 0));
      K.add('wood', new THREE.BoxGeometry(36, 0.8, 19), at(-12.4, 10.2, 0));
      for (const s of [-1, 1]) {
        K.add('wood', new THREE.BoxGeometry(36, 4.2, 0.5), at(-12.4, 12.7, s * 9.45));
        K.add('steelDark', new THREE.BoxGeometry(36.2, 0.4, 0.65), at(-12.4, 14.8, s * 9.6));
        K.add('steelDark', new THREE.BoxGeometry(36.2, 0.4, 0.65), at(-12.4, 10.8, s * 9.6));
        for (const x of [-30, -18.5, -6.5, 5.2]) K.add('steelDark', new THREE.BoxGeometry(0.75, 4.8, 0.75), at(x, 12.7, s * 9.8));
        // khung mui: 3 vòm thép cắm vào ổ cọc
        for (const x of [-28, -16.8, -5.6]) K.add('steelGray', new THREE.BoxGeometry(0.4, 9.4, 0.4), at(x, 19.6, s * 9.35));
      }
      for (const x of [-28, -16.8, -5.6]) K.add('steelGray', new THREE.BoxGeometry(0.4, 0.4, 18.8), at(x, 24.2, 0));
      K.add('wood', new THREE.BoxGeometry(0.5, 6.4, 19.4), at(5.9, 13.6, 0));
      K.add('wood', new THREE.BoxGeometry(0.5, 4.2, 18.6), at(-30.9, 8.3, 0, 0, 0, 0.08));
      for (const z of [-7, 7]) K.add('steelDark', new THREE.BoxGeometry(0.8, 0.8, 1.6), at(-30.6, 10.1, z));
      // bạt mui phủ nửa trước (võng giữa, 2 mép rủ xuống thành bên), cuộn bạt buộc dây ở mép sau
      {
        const g = new THREE.PlaneGeometry(22.6, 26, 8, 10), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const u = P.getX(i), v = P.getY(i) / 13, a = Math.abs(v);
          // ngang trên nóc (|v| < 0.72) rồi bẻ xuống làm vách bên tới gần mép thành
          const y = a < 0.72 ? 24.6 - 0.5 * Math.cos(u / 22.6 * Math.PI * 4) * (1 - a) : 24.6 - (a - 0.72) / 0.28 * 9.6;
          const z = -(a < 0.72 ? v / 0.72 * 9.4 : Math.sign(v) * (9.4 + 0.25));   // đảo dấu: mặt bạt quay ra ngoài / lên trên
          P.setXYZ(i, u + (hash(i * 3.1) - 0.5) * 0.25, y + (hash(i * 7.7) - 0.5) * 0.3, z);
        }
        g.computeVertexNormals();
        const tile = 24, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i) / tile, (P.getY(i) + P.getZ(i)) / tile);
        K.add('tarp', g, at(-5.2, 0, 0));
        K.add('tarp', new THREE.BoxGeometry(0.4, 9.6, 19), at(6.3, 19.6, 0));
        K.add('tarp', new THREE.CylinderGeometry(1.25, 1.25, 19.6, 10), at(-17.4, 24.4, 0, Math.PI / 2, 0, 0));
        for (const z of [-6, 0, 6]) K.add('steelDark', new THREE.TorusGeometry(1.32, 0.12, 4, 10), at(-17.4, 24.4, z));
      }
      // hàng nửa sau: hòm đạn xếp 2 lớp (đã dỡ bớt mấy hòm ngoài cùng), bó ống đạn pháo nằm ngang, 1 hòm mở nắp
      for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 4; iz++) for (let ly = 0; ly < 2; ly++) {
        if (ly === 1 && ix === 0 && iz % 3 === 0) continue;
        if (ix === 0 && iz === 1 && ly === 0) continue;
        const k = ix * 8 + iz * 2 + ly, x = -27.2 + ix * 3.9 + (hash(k + 11) - 0.5) * 0.4, z = -6.6 + iz * 4.4 + (hash(k + 12) - 0.5) * 0.4;
        const y = 10.6 + ly * 2.6 + 1.25, ry = (hash(k + 13) - 0.5) * 0.08;
        K.add(hash(k) < 0.5 ? 'olive' : 'oliveDark', new THREE.BoxGeometry(3.6, 2.5, 4.1), at(x, y, z, 0, ry, 0));
        K.add('steelDark', new THREE.BoxGeometry(3.7, 0.3, 0.5), at(x, y + 0.6, z - 1.6, 0, ry, 0));
        K.add('steelDark', new THREE.BoxGeometry(3.7, 0.3, 0.5), at(x, y + 0.6, z + 1.6, 0, ry, 0));
      }
      for (let i = 0; i < 6; i++) K.add('oliveDark', new THREE.CylinderGeometry(0.95, 0.95, 9.4, 10), at(-14.6 + (i % 3) * 0.1, 11.6 + Math.floor(i / 3) * 1.85, -6.4 + (i % 3) * 1.95 + Math.floor(i / 3) * 0.95, Math.PI / 2, 0, Math.PI / 2));
      K.add('olive', new THREE.BoxGeometry(3.6, 2.5, 4.1), at(-28.6, 16.4, 4.6, 0, 0.12, 0));
      K.add('olive', new THREE.BoxGeometry(3.7, 0.35, 4.2), at(-30.6, 16.9, 4.4, 0, 0.1, -1.1));
    } else if (body === 'loader') {
      // khung vận tải - nạp đạn (kiểu PR-14 trên ZIL-131), sơn cùng màu xe (không còn tấm sàn đen liền khối): khung phụ
      // dạng thang hở nhìn xuyên xuống gầm, 3 cặp giá chữ A có giằng chéo + thanh ngang, 2 dầm ray chữ I (cánh trên / bụng /
      // cánh dưới, bản mã nối ở chân giá), chặn đầu ray, 2 xi-lanh thuỷ lực nghiêng của cơ cấu đẩy, tời + cáp sau cabin,
      // 2 hòm đồ hông, 2 chân chống thuỷ lực sau hạ xuống đất, thang leo, đèn phía sau, ống thuỷ lực dọc khung
      for (const z of [-4.2, 4.2]) K.add('olive', new THREE.BoxGeometry(40, 1.2, 1.4), at(-10, 9.1, z));
      for (const x of [-28, -18, -8, 2, 8]) K.add('olive', new THREE.BoxGeometry(1, 1, 12), at(x, 9.1, 0));
      for (const z of [-5.8, 5.8]) K.add('oliveDark', new THREE.BoxGeometry(38, 0.5, 0.5), at(-10, 9.7, z));
      for (const x of [-26, -10, 6]) for (const s of [-1, 1]) {
        K.add('olive', new THREE.BoxGeometry(0.7, 9.6, 0.7), at(x, 14.6, s * 5));
        K.beam('oliveDark', [x - 3.6, 9.8, s * 5], [x - 0.4, 18.4, s * 5], 0.38, base);
        K.beam('oliveDark', [x + 0.5, 10, s * 5.6], [x + 0.5, 18.2, s * 4.4], 0.22, base);
        K.add('steelDark', new THREE.BoxGeometry(2.4, 0.3, 2.4), at(x, 9.9, s * 5));
        K.add('steelDark', new THREE.BoxGeometry(2.2, 1.6, 0.25), at(x, 18.8, s * 5 + s * 0.7));
      }
      for (const x of [-26, -10, 6]) K.add('olive', new THREE.BoxGeometry(0.6, 0.6, 10.8), at(x, 17.6, 0));
      for (const s of [-1, 1]) {
        const z = s * 5;
        K.add('olive', new THREE.BoxGeometry(48, 0.35, 2), at(-12, 19.85, z));
        K.add('olive', new THREE.BoxGeometry(48, 1.3, 0.35), at(-12, 19.1, z));
        K.add('olive', new THREE.BoxGeometry(48, 0.35, 1.6), at(-12, 18.4, z));
        K.add('steelGray', new THREE.BoxGeometry(46, 0.18, 0.5), at(-12, 20.1, z));
        for (let x = -34; x <= 10; x += 4) K.add('oliveDark', new THREE.BoxGeometry(0.25, 1.1, 0.25), at(x, 19.1, z + s * 0.25));
        K.add('steelDark', new THREE.BoxGeometry(0.8, 2, 2.2), at(11.8, 20.6, z));
        // xi-lanh đẩy (vỏ sơn + cần thép bóng)
        K.beam('oliveDark', [-2, 10.2, s * 2.2], [-12, 17.6, s * 3.6], 1, base);
        K.beam('steelGray', [-12, 17.6, s * 3.6], [-15.5, 18.6, s * 4.2], 0.55, base);
        // hòm đồ hông có bản lề + khoá
        K.cbox('olive', -20, 7.4, s * 7.2, 9, 3.4, 2.6, 0.2, 0, base);
        K.add('steelDark', new THREE.BoxGeometry(9.2, 0.25, 0.25), at(-20, 9.05, s * 8.5));
        for (const x of [-23, -17]) K.add('steelDark', new THREE.BoxGeometry(0.6, 0.8, 0.2), at(x, 8.2, s * 8.55));
        // chân chống thuỷ lực sau: vỏ, cần, đế tròn chạm đất
        K.add('oliveDark', new THREE.BoxGeometry(1.6, 4, 1.6), at(-30.2, 7.4, s * 5.4));
        K.add('steelGray', new THREE.CylinderGeometry(0.42, 0.42, 4.6, 8), at(-30.2, 3.2, s * 5.4));
        K.add('steelDark', new THREE.CylinderGeometry(1.4, 1.6, 0.5, 12), at(-30.2, 0.4, s * 5.4));
        // ống thuỷ lực dọc khung
        K.beam('rubber', [6, 10.4, s * 3.2], [-28, 10.4, s * 3.2], 0.28, base);
      }
      // tời + tang cáp sau cabin, cáp kéo dọc giữa 2 ray
      K.cbox('oliveDark', 8.6, 12.4, 0, 3, 4, 6, 0.3, 0, base);
      K.add('steelDark', new THREE.CylinderGeometry(1.5, 1.5, 4.2, 12), at(8.6, 15.4, 0, Math.PI / 2, 0, 0));
      K.add('rubber', new THREE.CylinderGeometry(1.25, 1.25, 4.3, 12), at(8.6, 15.4, 0, Math.PI / 2, 0, 0));
      K.beam('steelDark', [8.6, 16.6, 0], [-34, 19.6, 0], 0.16, base);
      // thang leo sau + đèn hậu trên khung ray
      for (const z of [-1.6, 1.6]) K.add('steelGray', new THREE.BoxGeometry(0.3, 10, 0.3), at(-31.6, 14, z, 0, 0, -0.18));
      for (let k = 0; k < 4; k++) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 3.2), at(-30.5 - k * 0.45, 10.6 + k * 2.4, 0));
      for (const s of [-1, 1]) { K.add('steelDark', new THREE.BoxGeometry(0.5, 1, 1.6), at(-36.2, 19, s * 5)); K.add('lampRed', new THREE.BoxGeometry(0.2, 0.6, 1.2), at(-36.5, 19, s * 5)); }
    }
    if (body === 'mast') {
      K.add('steelDark', new THREE.CylinderGeometry(1.2, 1.6, 40, 10), at(-14, 49, 0));
      for (const y of [36, 50, 62]) K.add('steelGray', new THREE.CylinderGeometry(1.7, 1.7, 0.8, 10), at(-14, y, 0));
      for (const a of [0.8, 2.4, 3.9, 5.5]) K.beam('steelGray', [-14, 60, 0], [-14 + Math.cos(a) * 16, 9, Math.sin(a) * 16], 0.12, base);
    }
  }
  // Pháo phòng không tầm trung S-60 57 mm ở thế bắn (gốc giữa bệ, nòng hướng +x): bệ chữ thập 4 chân kích hạ xuống,
  // 4 bánh nâng khỏi đất, mâm xoay, khung pháo + tấm chắn, nòng L/76 (~4.4 m) có hãm giật đục lỗ, lò xo đẩy lên nòng,
  // khay kẹp đạn 4 viên phía trên khoá nòng, 2 ghế pháo thủ + tay quay, kính ngắm; ụ bao cát tròn + thùng đạn
  function aaGun(K, f, r, az, el) {
    const b = M4(f, 0, r, 0, -az, 0), at = (x, y, z, rx, ry, rz) => new THREE.Matrix4().multiplyMatrices(b, M4(x, y, z, rx, ry, rz));
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      K.add('olive', new THREE.BoxGeometry(22, 2.4, 3), at(Math.cos(a) * 12, 3, Math.sin(a) * 12, 0, -a, 0));
      K.add('steelGray', new THREE.CylinderGeometry(0.7, 0.7, 4, 8), at(Math.cos(a) * 22, 2.4, Math.sin(a) * 22));
      K.add('steelDark', new THREE.CylinderGeometry(2, 2.4, 0.7, 10), at(Math.cos(a) * 22, 0.35, Math.sin(a) * 22));
    }
    K.cbox('oliveDark', 0, 4.6, 0, 16, 3.2, 10, 0.5, 0, b);
    for (const [x, s2] of [[-6, -1], [-6, 1], [6, -1], [6, 1]]) {
      K.add('rubber', new THREE.TorusGeometry(2.7, 0.95, 8, 16), at(x, 7.2, s2 * 8.4, 0, 0, 0));
      K.add('steelDark', new THREE.CylinderGeometry(1.9, 1.9, 0.8, 12), at(x, 7.2, s2 * 8.4, Math.PI / 2, 0, 0));
      K.add('steelGray', new THREE.CylinderGeometry(0.7, 0.7, 1.1, 8), at(x, 7.2, s2 * 8.4, Math.PI / 2, 0, 0));
      for (let ib = 0; ib < 6; ib++) {
        const ba = ib * 1.047;
        K.add('steelGray', new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5), at(x + Math.cos(ba) * 1.2, 7.2 + Math.sin(ba) * 1.2, s2 * 8.4, Math.PI / 2, 0, 0));
      }
    }
    K.add('steelDark', new THREE.CylinderGeometry(5.6, 5.6, 1.6, 18), at(0, 7.8, 0));
    for (const s2 of [-1, 1]) K.add('olive', plateGeo([[-6, 0], [5, 0], [3, 8], [-3, 8]], 1), at(0, 8.6, s2 * 4));
    const cr = new THREE.Matrix4().multiplyMatrices(at(1, 15, 0), M4(0, 0, 0, 0, 0, el));
    K.add('olive', new THREE.BoxGeometry(16, 4, 5), new THREE.Matrix4().multiplyMatrices(cr, M4(2, 0, 0)));
    K.add('steelDark', new THREE.CylinderGeometry(0.75, 0.9, 35, 10), new THREE.Matrix4().multiplyMatrices(cr, M4(26, 0.6, 0, 0, 0, -Math.PI / 2)));
    K.add('steelDark', new THREE.CylinderGeometry(1.3, 1.3, 3.4, 10), new THREE.Matrix4().multiplyMatrices(cr, M4(44.5, 0.6, 0, 0, 0, -Math.PI / 2)));
    for (let k = 0; k < 4; k++) K.add('void', new THREE.BoxGeometry(0.5, 2.7, 0.5), new THREE.Matrix4().multiplyMatrices(cr, M4(43.4 + k * 0.7, 0.6, 1.2)));
    K.add('steelGray', new THREE.CylinderGeometry(0.6, 0.6, 14, 8), new THREE.Matrix4().multiplyMatrices(cr, M4(12, -1.6, 0, 0, 0, -Math.PI / 2)));
    K.add('olive', new THREE.BoxGeometry(10, 3.4, 3), new THREE.Matrix4().multiplyMatrices(cr, M4(-1, 3.6, 0)));
    for (let k = 0; k < 4; k++) K.add('yellow', new THREE.CylinderGeometry(0.35, 0.35, 5, 6), new THREE.Matrix4().multiplyMatrices(cr, M4(-1 + (k - 1.5) * 1.8, 6, 0, Math.PI / 2, 0, 0)));
    for (const s2 of [-1, 1]) {
      K.add('olive', plateGeo([[-2, 0], [8, 0], [6, 9], [-1, 7]], 0.4), at(2, 10, s2 * 6.2));
      K.add('steelDark', new THREE.BoxGeometry(3, 0.6, 3), at(-4, 13, s2 * 8));
      K.add('steelDark', new THREE.BoxGeometry(0.4, 4, 2.6), at(-5.4, 15, s2 * 8));
      K.add('steelGray', new THREE.TorusGeometry(1.2, 0.18, 4, 12), at(-1, 14, s2 * 7.6));
    }
    K.add('steelDark', new THREE.BoxGeometry(2, 2, 1.4), at(-2, 18, -5.6));
    K.solid(f, r, 22, 22, 0, 18, az);
    for (let k = 0; k < 9; k++) { const a0 = k / 9 * TAU + az + 0.35, a1 = a0 + TAU / 9 - 0.1; if (k === 4) continue; sandbags(K, f + Math.cos(a0) * 28, r + Math.sin(a0) * 28, f + Math.cos(a1) * 28, r + Math.sin(a1) * 28, 3, 0); }
    for (let k = 0; k < 4; k++) { const a = az + Math.PI + 0.5 + k * 0.18; K.cbox('olive', f + Math.cos(a) * 22, 1.6 + (k % 2) * 3, r + Math.sin(a) * 22, 6, 3, 3.6, 0.3, -a); }
  }
  // Theo trận địa S-125 thật: 4 bệ phóng 5P73 (mỗi bệ 4 ray / 4 tên lửa) trong kè đất móng ngựa quanh trạm radar dẫn bắn
  // SNR-125 ở giữa; đường vòng nối miệng các kè + nan hoa vào giữa; cáp điều khiển trong mương có nắp; xe chỉ huy, xe
  // phân phối điện + 2 máy phát diesel, 2 xe vận tải - nạp đạn PR-14 (mỗi xe 2 tên lửa), kho tên lửa vòm bê tông, radar
  // cảnh giới P-12 (giàn Yagi trên cột), sở chỉ huy, bồn dầu. Bỏ hoang: bệ thiếu đạn, 1 quả tên lửa nằm đổ cạnh bệ.

  // ===========================================================================
  // DẤU VẾT THỜI GIAN (căn cứ bỏ hoang): đất cát + lá mục dạt quanh chân mọi khối công trình, rác và đồ bỏ lại rải khắp
  // sân (phuy gỉ lăn đổ, lốp xe, pallet gỗ vỡ, gạch đá vụn, tấm tôn gỉ, thùng các-tông bẹp, giấy rác, bao cát rách).
  // Vị trí theo hàm băm cố định (mọi máy giống nhau), tránh lọt vào trong khối công trình.
  // ===========================================================================
  function weather(K, L) {
    const sol = (K.lsolids || []).slice();
    const inside = (f, r, pad) => sol.some(q => { const c = Math.cos(q.rot), s2 = Math.sin(q.rot), df = f - q.f, dr = r - q.r; return Math.abs(df * c + dr * s2) < q.hf + pad && Math.abs(-df * s2 + dr * c) < q.hr + pad && q.y0 < 4; });
    // dải đất dạt quanh chân khối (4 hình thang ôm 4 cạnh, u dọc cạnh / 24, v từ chân tường ra ngoài)
    const pos = [], uv = [];
    for (const q of sol) {
      // (nhà xưởng lớn tới ~140 đv vẫn có dải đất dạt; chỉ bỏ tường rào / khối rất dài)
      if (q.y0 > 2 || q.hf < 1.5 || q.hr < 1.5 || Math.max(q.hf, q.hr) > 150) continue;
      const m = 4 + Math.min(6, (q.hf + q.hr) * 0.08), c = Math.cos(q.rot), s2 = Math.sin(q.rot);
      const P = (a, b) => [q.f + a * c - b * s2, 0.62, q.r + a * s2 + b * c];
      const cs = [[-q.hf, -q.hr], [q.hf, -q.hr], [q.hf, q.hr], [-q.hf, q.hr]], k2 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let e = 0; e < 4; e++) {
        const i0 = cs[e], i1 = cs[(e + 1) % 4], o0 = [i0[0] + k2[e][0] * m, i0[1] + k2[e][1] * m], o1 = [i1[0] + k2[(e + 1) % 4][0] * m, i1[1] + k2[(e + 1) % 4][1] * m];
        const len = Math.hypot(i1[0] - i0[0], i1[1] - i0[1]) / 24, A = P(...i0), B = P(...i1), Cc = P(...o1), D = P(...o0);
        pos.push(...A, ...Cc, ...B, ...A, ...D, ...Cc); uv.push(0, 0, len, 1, len, 0, 0, 0, 0, 1, len, 1);
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
      K.add('dirtRing', g, null);
    }
    // rác + đồ bỏ lại
    const n = Math.round(L.hu * L.hv / 900);
    for (let i = 0; i < n; i++) {
      const f = (hash(i * 3.7 + 9001) * 2 - 1) * (L.hu - 70), r = (hash(i * 5.3 + 9002) * 2 - 1) * (L.hv - 70);
      if (inside(f, r, 4)) continue;
      const kind = hash(i + 9003), yaw = hash(i + 9004) * TAU, y = Math.max(0, K.earth(f, r)) + 0.4, b = M4(f, y, r, 0, yaw, 0);
      const at = (x, yy, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().multiplyMatrices(b, M4(x, yy, z, rx, ry, rz, sx, sy, sz));
      if (kind < 0.16) {           // phuy gỉ: 1 nằm lăn + 1-2 đứng có gờ vành lăn nổi
        const m1 = hash(i + 1) < 0.7 ? 'drumRust' : 'drumBlue';
        K.add(m1, new THREE.CylinderGeometry(1.9, 1.9, 5.6, 16), at(0, 1.9, 0, Math.PI / 2, 0, 0));
        K.add('steelDark', new THREE.TorusGeometry(1.96, 0.08, 4, 14), at(0, 1.9, 0.9, 0, 0, 0));
        K.add('steelDark', new THREE.TorusGeometry(1.96, 0.08, 4, 14), at(0, 1.9, -0.9, 0, 0, 0));
        K.add('steelDark', new THREE.TorusGeometry(1.98, 0.09, 4, 14), at(0, 1.9, 2.75, 0, 0, 0));
        K.add('steelDark', new THREE.TorusGeometry(1.98, 0.09, 4, 14), at(0, 1.9, -2.75, 0, 0, 0));
        for (let k = 0; k < 1 + (hash(i + 2) < 0.5 ? 1 : 0); k++) {
          const dx = 4 + k * 4, dz = 3 - k * 2, tilt = (hash(i + k) - 0.5) * 0.15;
          K.add('drumRust', new THREE.CylinderGeometry(1.9, 1.9, 5.6, 16), at(dx, 2.8, dz, tilt, 0, 0));
          K.add('steelDark', new THREE.TorusGeometry(1.96, 0.08, 4, 14), at(dx, 1.9, dz, Math.PI / 2 + tilt, 0, 0));
          K.add('steelDark', new THREE.TorusGeometry(1.96, 0.08, 4, 14), at(dx, 3.7, dz, Math.PI / 2 + tilt, 0, 0));
          K.add('steelDark', new THREE.TorusGeometry(1.98, 0.09, 4, 14), at(dx, 5.5, dz, Math.PI / 2 + tilt, 0, 0));
          K.add('steelDark', new THREE.TorusGeometry(1.98, 0.09, 4, 14), at(dx, 0.1, dz, Math.PI / 2 + tilt, 0, 0));
        }
      } else if (kind < 0.27) {    // lốp xe chồng / nằm rải
        for (let k = 0; k < 1 + Math.floor(hash(i + 3) * 3); k++) K.add('tire', tireGeo(), at(k ? hash(i + k) * 6 : 0, 1 + (k && hash(i + k + 5) < 0.5 ? k * 2 : 0), k ? hash(i + k + 7) * 6 : 0, (hash(i + k + 9) - 0.5) * 0.4, hash(i + k + 11) * 3, 0));
      } else if (kind < 0.38) {    // pallet gỗ vỡ: ván mặt (có tấm gãy lệch) trên 3 thanh đỡ
        for (const z of [-4, 0, 4]) K.add('wood', new THREE.BoxGeometry(10, 0.9, 1.2), at(0, 0.45, z));
        for (let k = 0; k < 5; k++) if (hash(i * 7 + k) > 0.2) K.add('wood', new THREE.BoxGeometry(1.5, 0.3, 10), at(-4 + k * 2, 1.05 + (hash(i * 9 + k) < 0.2 ? 0.8 : 0), 0, 0, (hash(i * 11 + k) - 0.5) * 0.5, (hash(i * 13 + k) < 0.2 ? 0.3 : 0)));
      } else if (kind < 0.55) {    // gạch đá / bê tông vụn
        for (let k = 0; k < 4 + Math.floor(hash(i + 4) * 6); k++) { const sz = 0.7 + hash(i * 3 + k) * 2.2; K.add('concDark', new THREE.IcosahedronGeometry(sz, 0), at((hash(i * 5 + k) - 0.5) * 9, sz * 0.35, (hash(i * 7 + k) - 0.5) * 9, hash(k) * 3, hash(k + 1) * 3, 0, 1, 0.6, 1)); }
      } else if (kind < 0.66) {    // tấm tôn gỉ rơi / dựng nghiêng
        K.add(hash(i + 5) < 0.5 ? 'steelRust2' : 'corrGray', new THREE.BoxGeometry(12, 0.2, 6), at(0, 1.2, 0, (hash(i + 6) - 0.5) * 0.5, 0, hash(i + 7) * 0.4));
      } else if (kind < 0.76) {    // thùng các-tông bẹp, rách
        for (let k = 0; k < 2 + Math.floor(hash(i + 8) * 3); k++) K.add('cardboard', new THREE.BoxGeometry(3.2, 2.6, 3.2), at((hash(i + k * 3) - 0.5) * 6, 0.8, (hash(i + k * 5) - 0.5) * 6, (hash(i + k) - 0.5) * 0.4, hash(i + k + 2) * 3, 0, 1, 0.55, 1));
      } else if (kind < 0.9) {     // giấy rác, túi nilon (lá mỏng nằm rải)
        for (let k = 0; k < 3; k++) K.add('paper', new THREE.PlaneGeometry(1.4, 1), at((hash(i * 3 + k) - 0.5) * 14, 0.15 + k * 0.01, (hash(i * 5 + k) - 0.5) * 14, -Math.PI / 2 + (hash(k) - 0.5) * 0.4, hash(k + 3) * 3, 0));
      } else {                     // hòm đạn dã chiến quân sự bị bỏ lại
        for (let k = 0; k < 2 + Math.floor(hash(i + 9) * 2); k++) {
          const cx = (hash(i * 3 + k) - 0.5) * 8, cz = (hash(i * 5 + k) - 0.5) * 6, rotY = hash(k + 1) * 3;
          K.cbox('wood', cx, 1.2 + k * 0.8, cz, 5.2, 2.2, 3.2, 0.25, rotY, b);
          // quai 2 đầu + khoá nắp: xoay quanh tâm hòm theo hòm (trước xoay tại chỗ -> quai lơ lửng cạnh hòm)
          const hc = Math.cos(rotY), hs = Math.sin(rotY);
          for (const s of [-1, 1]) K.add('steelDark', new THREE.BoxGeometry(0.35, 1.2, 0.5), at(cx + s * 2.65 * hc, 1.2 + k * 0.8, cz - s * 2.65 * hs, 0, rotY, 0));
          K.add('steelDark', new THREE.BoxGeometry(0.8, 0.6, 0.3), at(cx + 1.65 * hs, 1.8 + k * 0.8, cz + 1.65 * hc, 0, rotY, 0));
        }
      }
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

  // Máu công trình & sức phá theo loại đạn: p = sát thương tại điểm nổ, r = bán kính tác động (đv). Lựu pháo x2 sức phá
  const LM_HP = 24;
  // Máu theo loại công trình (nhân LM_HP): hầm phóng hạt nhân / hầm sinh học bê tông chìm dưới đất bền nhất; trung tâm năng
  // lượng nhà xưởng lớn; đài radar & căn cứ phòng không chủ yếu là khí tài lộ thiên (chảo radar, bệ phóng, xe) — yếu hơn hẳn.
  // soft: khí tài lộ thiên — đạn súng 30 mm / 12.7 băm được (x3 sức phá); loại còn lại đạn súng chỉ rỗ mặt (tối đa 15% máu)
  const LM_KIND = { nuke: { hp: 1.6 }, bio: { hp: 1.3 }, power: { hp: 1.2 }, radar: { hp: 0.65, soft: true }, sam: { hp: 0.6, soft: true } };
  const LM_POW = {
    HE: { p: 1.7, r: 30 }, NORMAL: { p: 1.1, r: 22 }, CLUSTER: { p: 0.6, r: 20 }, CLUSTER_SUBMUNITION: { p: 0.45, r: 10 },
    AP: { p: 0.35, r: 6 }, RPG: { p: 0.6, r: 12 }, ANTI_TANK_MISSILE: { p: 1.2, r: 16 },
    GATLING_BULLET: { p: 0.012, r: 3 }, INCENDIARY: { p: 0.011, r: 3 }, INCENDIARY_HMG: { p: 0.003, r: 2 }, SCOUT_BULLET: { p: 0.003, r: 2 }, MG762: { p: 0.001, r: 1.5 }
  };

  class LandmarkSet {
    constructor(parent, list, opts) {
      this.group = new THREE.Group();
      this.group.name = 'landmarks';
      parent.add(this.group);
      this.items = [];
      this.boxes = [];
      const groundAt = (opts && opts.groundAt) || (() => 0);
      this.groundAt = groundAt;
      this.terrain = (opts && opts.terrain) || null;
      // mặt đất riêng của công trình (KINDS[kind].surface: nắp đất lưới mịn / sàn sân khoét, cao độ cục bộ hoặc null) —
      // lưới địa hình thô bên dưới bị hạ thấp hơn, xe / đạn / đồ vật đặt theo mặt này (xem surfaceAt)
      this.surf = (list || []).filter(L => KINDS[L.kind] && KINDS[L.kind].surface).map(L => ({ L, fn: KINDS[L.kind].surface, r2: Math.pow(Math.hypot(L.hu, L.hv) + 30, 2) }));
      for (const L of list || []) {
        const grp = new THREE.Group();
        grp.name = 'landmark_' + L.kind;
        grp.position.set(L.x, L.G, L.z);
        grp.rotation.y = -L.angle;   // trục X cục bộ = f, trục Z cục bộ = r
        this.group.add(grp);
        const sf = KINDS[L.kind] && KINDS[L.kind].surface;
        const K = new Kit(L, sf ? (x, z) => { const g = groundAt(x, z), dx = x - L.x, dz = z - L.z, s = sf(L, dx * L.fx + dz * L.fz, -dx * L.fz + dz * L.fx, g - L.G, x, z); return s === null ? g : Math.max(g, L.G + s); } : groundAt);
        K.terrain = this.terrain;
        // phần chuyển động: đèn hiệu xoay / đèn đỏ nháy (vật liệu riêng), hơi nước ống xả, đèn pha quét, cờ bay theo gió
        const anim = { steam: [], search: [], beams: [], radar: [], radars: [], vehicles: [], flags: [], t: hash(this.items.length) * 10,
          beacon: new THREE.MeshStandardMaterial({ color: 0x805010, emissive: 0xffa21a, emissiveIntensity: 1, roughness: 0.3 }),
          blink: new THREE.MeshStandardMaterial({ color: 0x801010, emissive: 0xff2a1a, emissiveIntensity: 1, roughness: 0.3 }) };
        if (L.kind === 'nuke') buildNuke(K, grp, anim);
        else if (KINDS[L.kind] && KINDS[L.kind].build) KINDS[L.kind].build(K, grp, anim, API);
        if (ABANDONED) weather(K, L);
        K.build(grp);
        grp.traverse(o => { if (o.userData.ground) (this.groundMeshes || (this.groundMeshes = [])).push(o); });
        for (const p of anim.search) {
          const yaw = new THREE.Group();
          yaw.position.set(p.x, p.y, p.z);
          yaw.userData.a0 = p.a0 === undefined ? 2.4 : -p.a0; yaw.userData.ph = anim.beams.length * 1.7;

          const rdMat = MAT.radarD || (MAT.radarD = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.5 }));
          // Mâm xoay ở đáy ngàm (tiếp xúc khít với bệ trên mái)
          const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.5, 12), rdMat);
          baseRing.position.y = 0.25;
          // Giá càng chữ U ôm 2 bên đèn
          const forkL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), rdMat);
          forkL.position.set(0, 1.5, -1.8);
          const forkR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), rdMat);
          forkR.position.set(0, 1.5, 1.8);
          yaw.add(baseRing, forkL, forkR);

          // Cụm đầu đèn pha (đặt tại tâm ngàm U y = 2.4)
          const lampHead = new THREE.Group();
          lampHead.position.set(0, 2.4, 0);

          const head = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.8, 3.8, 14), rdMat);
          head.rotation.z = Math.PI / 2 - 0.35; head.position.x = 0.6;
          // Trục xoay 2 bên nối vào ngàm U
          const trunnion = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.2, 8), rdMat);
          trunnion.rotation.x = Math.PI / 2;

          const night = !ABANDONED && !!(opts && opts.sun && opts.sun.elevation < 0.12);
          const lensM = night ? (MAT.lensOn || (MAT.lensOn = new THREE.MeshStandardMaterial({ color: 0xeef3ff, emissive: 0xeef3ff, emissiveIntensity: 1.6, roughness: 0.2 })))
            : (MAT.lensOff || (MAT.lensOff = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.15, metalness: 0.4 })));
          const lens = new THREE.Mesh(new THREE.CircleGeometry(2.2, 14), lensM);
          lens.rotation.y = Math.PI / 2; lens.position.set(2.5, -0.65, 0);

          const cone = new THREE.ConeGeometry(30, 260, 20, 1, true);
          cone.translate(0, -130, 0); cone.rotateZ(Math.PI / 2 - 0.35);
          const fade = TEX.beamFade || (TEX.beamFade = texOf('beamFade', 8, 128, (q, w, h) => {
            const gr = q.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#555555'); gr.addColorStop(1, '#000000'); q.fillStyle = gr; q.fillRect(0, 0, w, h);
          }));
          const beam = new THREE.Mesh(cone, MAT.beam || (MAT.beam = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, alphaMap: fade, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide })));
          beam.visible = night;
          beam.position.set(0, -2.4, 0);

          lampHead.add(head, trunnion, lens);
          yaw.add(lampHead, beam);
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
        const hp0 = LM_HP * ((LM_KIND[L.kind] || {}).hp || 1);
        const it = { L, anim, grp, kind: L.kind, name: NAMES[L.kind] || (KINDS[L.kind] && KINDS[L.kind].name) || L.kind, x: L.x, z: L.z, G: L.G, boxes: K.solids, top: L.G + K.top, reach: Math.hypot(L.hu, L.hv) + 30,
          hp: hp0, hp0, dead: false };
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
      K.solids[K.solids.length - 1].veh = true;   // xe đỗ: lúc căn cứ sập chỉ cháy đen, không sụp như nhà (collapsePlan)
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
        // xe đỗ: tắt đèn (quầng đèn pha/đèn rọi dạng đĩa sáng không bóng, vật liệu tự phát sáng) — dùng bản sao vật liệu
        // để không ảnh hưởng xe của người chơi dùng chung vật liệu
        if (m && m.isMeshBasicMaterial && m.color && (m.color.r + m.color.g + m.color.b) > 1.2) o.visible = false;
        if (m && m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.3) { o.material = m.clone(); o.material.emissiveIntensity = 0; if (m.onBeforeCompile) { o.material.onBeforeCompile = m.onBeforeCompile; o.material.customProgramCacheKey = m.customProgramCacheKey; } }
        // xe bỏ lại nhiều năm: phủ bụi đất, sơn xỉn (bản sao vật liệu, không ảnh hưởng xe người chơi)
        if (ABANDONED && o.visible && o.material && o.material.color && !o.material.isMeshBasicMaterial) {
          const mm = o.material === m ? m.clone() : o.material;
          // clone() (r128) không chép onBeforeCompile: mất shader sơn của xe -> màu đỉnh (dữ liệu AO / độ cao / hướng lên)
          // hiện thẳng ra thành màu xanh chuối / đỏ tím
          if (m.onBeforeCompile) { mm.onBeforeCompile = m.onBeforeCompile; mm.customProgramCacheKey = m.customProgramCacheKey; }
          mm.color.lerp(new THREE.Color(0x8a7a5e), 0.32); mm.roughness = 1; if (mm.metalness !== undefined) mm.metalness *= 0.5;
          o.material = mm;
        }
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
    // CĂN CỨ BỎ HOANG: cỏ dại mọc ở đâu, dày / cao cỡ nào tại (x, z). null = ngoài căn cứ hoặc dưới công trình.
    //  bãi cỏ cũ: cỏ um tùm ngang gối; nền sỏi / lề đường: đám cỏ dại; mặt đường, sân bê tông: cỏ thấp mọc khe nứt
    overgrowth(x, z) {
      for (const it of this.items) {
        const L = it.L; if (!siteOf(L.kind)) continue;
        const dx = x - L.x, dz = z - L.z, f = dx * L.fx + dz * L.fz, r = -dx * L.fz + dz * L.fx;
        if (Math.abs(f) > L.hu - 2 || Math.abs(r) > L.hv - 2) continue;
        // tra lưới 4 đơn vị dựng dần (mỗi ô tính 1 lần): rải cỏ dày gọi hàm này hàng trăm nghìn lần
        const GS = 4, nf = Math.ceil(L.hu * 2 / GS), nr = Math.ceil(L.hv * 2 / GS);
        if (!it.ogK) { it.ogK = new Float32Array(nf * nr).fill(-1); it.ogH = new Float32Array(nf * nr); }
        const gi = Math.min(nf - 1, Math.floor((f + L.hu) / GS)), gj = Math.min(nr - 1, Math.floor((r + L.hv) / GS)), k = gj * nf + gi;
        if (it.ogK[k] < 0) { const v = this.overgrowthRaw(it, x, z, f, r); it.ogK[k] = v ? v.k : 0; it.ogH[k] = v ? v.h : 0; }
        return it.ogK[k] > 0 ? { k: it.ogK[k], h: it.ogH[k] } : null;
      }
      return null;
    }
    overgrowthRaw(it, x, z, f, r) {
      const L = it.L, SI = siteOf(L.kind);
      {
        for (const q of it.boxes) { const ex = x - q.cx, ez = z - q.cz; if (Math.abs(ex * q.ux + ez * q.uz) < q.hu + 3 && Math.abs(-ex * q.uz + ez * q.ux) < q.hv + 3) return null; }
        for (const [fa, ra, fb, rb] of SI.noGrow) if (f > fa && f < fb && r > ra && r < rb) return null;   // bệ bê tông trên gò (miệng hầm silo...)
        for (const [fa, ra, fb, rb] of SI.slabs) if (f > fa && f < fb && r > ra && r < rb) return { k: 0.3, h: 0.5 };
        let road = Infinity;
        for (const [pts, wd] of SI.roads) for (let i = 1; i < pts.length; i++) {
          const [af, ar] = pts[i - 1], [bf, br] = pts[i], ef = bf - af, er = br - ar, t = Math.max(0, Math.min(1, ((f - af) * ef + (r - ar) * er) / (ef * ef + er * er)));
          road = Math.min(road, Math.hypot(f - af - ef * t, r - ar - er * t) - wd / 2);
        }
        if (road < -2) return { k: 0.3, h: 0.5 };
        if (road < 9) return { k: 1.9, h: 0.9 };
        // gò đất đắp (gò silo, gò trung tâm điều khiển, ụ đất mép): đất cỏ -> um tùm như bãi cỏ
        if (this.groundAt(x, z) - it.G > 2.5) return { k: 2.4, h: 1.15 };
        for (const [fa, ra, fb, rb] of SI.gravel(L.hu)) if (f > fa - 4 && f < fb + 4 && r > ra - 4 && r < rb + 4) return { k: 1.1, h: 0.8 };
        if (Math.abs(f) < L.hu - 92 && Math.abs(r) < L.hv - 92) return { k: 2.6, h: 1.2 };
        return { k: 1.3, h: 0.85 };   // dải sỏi giữa các lớp rào, đường tuần tra
      }
      return null;
    }
    covers(x, z, pad) {
      for (const it of this.items) {
        const L = it.L, dx = x - L.x, dz = z - L.z;
        if (Math.abs(dx) > it.reach + 40 || Math.abs(dz) > it.reach + 40) continue;
        const f = dx * L.fx + dz * L.fz, r = -dx * L.fz + dz * L.fx, p = pad || 0;
        if (Math.abs(f) < L.hu + p && Math.abs(r) < L.hv + p) return true;
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
    // Đẩy điểm (x, z) ra ngoài khu căn cứ (cách mép pad) theo cạnh gần nhất — dùng cho hòm tiếp tế / thả dù
    outside(x, z, pad) {
      const it = this.noFireAt(x, z, pad);
      if (!it) return [x, z];
      const L = it.L, p = pad || 0, dx = x - L.x, dz = z - L.z;
      let f = dx * L.fx + dz * L.fz, r = -dx * L.fz + dz * L.fx;
      if (L.hu - Math.abs(f) < L.hv - Math.abs(r)) f = (f < 0 ? -1 : 1) * (L.hu + p + 1); else r = (r < 0 ? -1 : 1) * (L.hv + p + 1);
      return [L.x + L.fx * f - L.fz * r, L.z + L.fz * f + L.fx * r];
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
    // Mặt đất thật tại (x, z) khi công trình thay lưới địa hình thô bằng mặt riêng (sân khoét / nắp đất), null nếu không
    // có. g: cao độ lưới địa hình tại đó (terrain.groundAtRaw). Gọi rất dày (xe, đạn) -> thoát sớm theo bán kính
    surfaceAt(x, z, g) {
      for (const { L, fn, r2 } of this.surf) {
        const dx = x - L.x, dz = z - L.z;
        if (dx * dx + dz * dz > r2) continue;
        const s = fn(L, dx * L.fx + dz * L.fz, -dx * L.fz + dz * L.fx, g - L.G, x, z);
        if (s !== null) return Math.max(g, L.G + s);
      }
      return null;
    }

    // ĐẠN NỔ TRÚNG / SÁT CÔNG TRÌNH: trừ máu theo sức nổ & khoảng cách tới khối đặc gần nhất
    damageAt(x, y, z, ammo, heavy, fx) {
      // lựu pháo 155: sức phá x2,1, tầm x1,45 (luật tỉ lệ nổ, cùng hệ số với Destructibles HEAVY_K)
      const P = LM_POW[ammo] || LM_POW.NORMAL, pw = P.p * (heavy ? 2.1 : 1), R = P.r * (heavy ? 1.45 : 1);
      if (pw <= 0) return [];
      const ev = [];
      const small = P.p < 0.05;
      for (const it of this.items) {
        if (it.dead || Math.abs(x - it.x) > it.reach + R || Math.abs(z - it.z) > it.reach + R) continue;
        // sức phá lấy theo khối gần nhất có "giá trị": tường rào / lan can mỏng thấp chỉ tính 20% (trước đây bắn sập hàng rào
        // bao quanh cũng trừ máu cả căn cứ như trúng nhà chính)
        let f = 0;
        for (const q of it.boxes) {
          const dx = x - q.cx, dz = z - q.cz, u = Math.abs(dx * q.ux + dz * q.uz) - q.hu, v = Math.abs(-dx * q.uz + dz * q.ux) - q.hv;
          const dy = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0;
          const d = Math.hypot(Math.max(0, u), Math.max(0, v), dy);
          if (d > R) continue;
          const w = Math.min(q.hu, q.hv) <= 3 || q.y1 - q.y0 <= 6 ? 0.2 : 1;
          f = Math.max(f, w * Math.pow(1 - d / R, 1.2));
        }
        if (f <= 0) continue;
        const KD = LM_KIND[it.kind] || {};
        const prev = it.hp / it.hp0;
        it.hp -= pw * f * (small && KD.soft ? 3 : 1);
        if (small && !KD.soft) it.hp = Math.max(it.hp, Math.min(prev * it.hp0, it.hp0 * 0.85));
        const k = Math.max(0, it.hp / it.hp0);
        const G = typeof window !== 'undefined' && window.game;
        if (k <= 0) { this.destroy(it, fx); ev.push({ type: 'landmark', name: it.name }); }
        else if (prev > 0.5 && k <= 0.5 && G && G.addCombatLog) G.addCombatLog('[[building]] ' + it.name + ' hư hại nặng — bốc khói', 'tip');
      }
      return ev;
    }

    // Sập: chuỗi nổ thứ cấp (bồn nhiên liệu, đạn dược, máy biến áp), công trình đổ sụp xuống còn ~1/3 chiều cao, cháy đen.
    // quiet: áp trạng thái từ mạng (vào trận giữa chừng) -> sập ngay, không nổ / không báo
    destroy(it, fx, quiet) {
      if (it.dead) return;
      it.dead = true; it.hp = 0;
      it.collapse = 0;
      for (const q of it.boxes) { if (q.y1o === undefined) q.y1o = q.y1; q.y1 = q.y0 + (q.y1o - q.y0) * 0.35; }   // khối va chạm còn đống đổ nát thấp
      this.collapsePlan(it);
      // ngoài tầm nhìn / quá xa: sập thẳng tới hình cuối (bỏ hoạt cảnh nội suy đỉnh lưới mỗi khung ~2,8 s)
      if (!quiet && fx && fx.lodAt && fx.lodAt(it.x, it.G + 30, it.z, it.reach) <= 0) { it.collapse = 1; this.collapseStep(it, 1); }
      it.top = it.G + (it.top - it.G) * 0.35;
      // cháy đen: bản sao vật liệu (không ảnh hưởng công trình khác dùng chung vật liệu)
      const done = new Map();
      it.grp.traverse(o => {
        if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
        if (o.material.isMeshBasicMaterial && o.material.transparent) { o.visible = false; return; }   // tia đèn pha
        let m = done.get(o.material);
        if (!m) {
          m = o.material.clone();
          // giữ shader vá (sơn xe, bụi cát, sỏi sân): clone() không chép onBeforeCompile
          if (o.material.onBeforeCompile) { m.onBeforeCompile = o.material.onBeforeCompile; m.customProgramCacheKey = o.material.customProgramCacheKey; }
          if (m.color) m.color.multiplyScalar(0.28);
          if (m.emissive) m.emissiveIntensity = 0;
          done.set(o.material, m);
        }
        o.material = m;
      });
      if (quiet) { it.collapse = 1; this.collapseStep(it, 1); return; }
      if (fx && fx.spawn) {
        it.boxes.slice(0, 7).forEach((q, n) => {
          setTimeout(() => { try { fx.spawn(q.cx, q.y1 + 4, q.cz, 'HE', 'DIRECT_HIT', { heavy: n % 2 === 0 }); } catch (e) { /* hiệu ứng phụ */ } }, n * 180);
        });
      }
      const G = typeof window !== 'undefined' && window.game, SE = typeof window !== 'undefined' && window.soundEngine;
      if (SE && SE.playExplosionAtDistance && G && G.player) SE.playExplosionAtDistance(Math.hypot(G.player.x - it.x, G.player.z - it.z), 'BUILDING', 'HE', { x: it.x, z: it.z }, { heavy: true });
      if (G && G.addCombatLog) G.addCombatLog('[[building]] ' + it.name + ' ĐÃ BỊ PHÁ HỦY — sụp đổ, bốc cháy', 'alert');
    }

    /**
     * Kế hoạch sập theo từng khối đặc (it.boxes) — lưới công trình đã gộp theo vật liệu cho cả khu nên không xoay được từng
     * nhà; thay vào đó dời từng đỉnh theo khối chứa nó (tính một lần lúc sập, nội suy trong collapseStep):
     *  - khối thấp & rộng (nhà xưởng, nhà điều hành, hầm, bồn): các tầng sụp chồng xuống còn ~30-40% chiều cao, phần trên
     *    xô lệch toả ra ngoài, gợn lồi lõm như đống bê tông gãy, cả khối nghiêng nhẹ về một phía
     *  - khối mảnh cao (tháp, ống khói, cột ăng-ten, giàn radar): gãy ngang thân ở ~30-50% chiều cao, phần trên gục đổ
     *    nghiêng 30-60° về một phía, chân còn đứng hơi xiêu
     * Trước đây cả khu bị ép dẹt theo chiều đứng (scale.y 0.35) — trông như bọt biển bị nén. Đỉnh ngoài mọi khối (sân bê tông,
     * chi tiết mặt đất) giữ nguyên. Chỉ là hình (không ảnh hưởng va chạm / đồng bộ)
     */
    collapsePlan(it) {
      const B = it.boxes.map((q, n) => {
        const H = Math.max(1, q.y1o - q.y0), W = Math.max(q.hu, q.hv) * 2;
        const h = hash(n * 31 + Math.round(it.x)), a = hash(n * 17 + Math.round(it.z) + 5) * TAU;
        return { q, H, vol: q.hu * q.hv * H, slender: H > W * 1.6 && H > 30, brk: q.y0 + H * (0.3 + 0.2 * h), ang: 0.55 + 0.5 * hash(n * 7 + 3),
          dx: Math.cos(a), dz: Math.sin(a), lean: 0.03 + 0.07 * h, keep: 0.3 + 0.1 * hash(n + 11) };
      });
      const V = new THREE.Vector3(), inv = new THREE.Matrix4(), plan = [];
      it.grp.updateMatrixWorld(true);
      it.grp.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position) return;
        const pa = o.geometry.attributes.position, n = pa.count, orig = new Float32Array(pa.array.length), tgt = new Float32Array(pa.array.length);
        orig.set(pa.array); tgt.set(pa.array);
        inv.copy(o.matrixWorld).invert();
        let moved = false;
        for (let i = 0; i < n; i++) {
          V.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
          // khối đặc nhỏ nhất chứa đỉnh (khối lồng nhau: lấy khối sát nhất)
          let b = null;
          for (const c of B) {
            const q = c.q, dx = V.x - q.cx, dz = V.z - q.cz;
            if (V.y < q.y0 - 0.5 || V.y > q.y1o + 0.8) continue;
            if (Math.abs(dx * q.ux + dz * q.uz) > q.hu + 0.8 || Math.abs(-dx * q.uz + dz * q.ux) > q.hv + 0.8) continue;
            if (!b || c.vol < b.vol) b = c;
          }
          if (!b || b.q.veh) continue;
          const q = b.q;
          let x = V.x, y = V.y, z = V.z;
          if (b.slender) {
            if (y > b.brk) {
              // phần trên gục quanh chỗ gãy: quay quanh trục nằm ngang vuông góc hướng đổ
              const al = (x - q.cx) * b.dx + (z - q.cz) * b.dz, up = y - b.brk, c = Math.cos(b.ang), sn = Math.sin(b.ang);
              const al2 = al * c + up * sn, up2 = -al * sn + up * c;
              x += b.dx * (al2 - al); z += b.dz * (al2 - al); y = b.brk + up2 - b.H * 0.04;
            } else {
              const t = (y - q.y0) * b.lean * 0.5;
              x += b.dx * t; z += b.dz * t;
            }
          } else {
            const t = (y - q.y0) / b.H;
            const ny = q.y0 + (y - q.y0) * b.keep + Math.sin(x * 0.21 + z * 0.17) * Math.cos(x * 0.13 - z * 0.19) * b.H * 0.05 * t;
            const spread = 0.1 * t;
            x += (x - q.cx) * spread + b.dx * (ny - q.y0) * b.lean;
            z += (z - q.cz) * spread + b.dz * (ny - q.y0) * b.lean;
            y = ny;
          }
          V.set(x, y, z).applyMatrix4(inv);
          tgt[i * 3] = V.x; tgt[i * 3 + 1] = V.y; tgt[i * 3 + 2] = V.z;
          moved = true;
        }
        // hình có thể dùng chung với nơi khác (xe đỗ dựng từ TankModelBuilder dùng chung lưới với xe trong trận): tách bản riêng
        if (moved) { o.geometry = o.geometry.clone(); plan.push({ o, orig, tgt }); }
      });
      it.plan = plan;
    }
    collapseStep(it, e) {
      if (!it.plan) return;
      for (const P of it.plan) {
        const pa = P.o.geometry.attributes.position, a = pa.array;
        for (let i = 0; i < a.length; i++) a[i] = P.orig[i] + (P.tgt[i] - P.orig[i]) * e;
        pa.needsUpdate = true;
        if (e >= 1) { P.o.geometry.computeVertexNormals(); P.o.geometry.computeBoundingSphere(); }
      }
      if (e >= 1) it.plan = null;   // xong: bỏ bản sao toạ độ
    }

    // đồng bộ mạng (terrain.envStateString): máu từng công trình (phần trăm, 0 = đã sập)
    stateString() { return this.items.map(it => Math.max(0, Math.round(it.hp / it.hp0 * 100))).join(','); }
    applyState(str, fx) {
      String(str).split(',').forEach((v, i) => {
        const it = this.items[i];
        if (!it || v === '') return;
        const k = +v / 100;
        if (k <= 0) { if (!it.dead) this.destroy(it, fx, true); }
        else if (k * it.hp0 < it.hp) it.hp = k * it.hp0;
      });
    }
    // Đèn hiệu xoay / nháy, đèn pha chòi gác quét qua lại, hơi nước bốc lên từ ống xả giếng phóng
    update(dt, fx, cam) {
      for (const it of this.items) {
        const A = it.anim;
        if (!A) continue;
        // hư nặng / đã sập: khói đen bốc từ đỉnh, đã sập thì cháy âm ỉ; công trình đổ sụp dần trong ~2,5 s
        const hk = it.hp / it.hp0;
        if (it.dead && it.collapse < 1) {
          it.collapse = Math.min(1, it.collapse + dt / 2.8);
          this.collapseStep(it, it.collapse * it.collapse);   // tăng tốc dần như vật rơi
        }
        if ((it.dead || hk < 0.5) && fx && fx.smoke && !(cam && Math.hypot(cam.x - it.x, cam.z - it.z) > 2600)) {
          it.smokeAcc = (it.smokeAcc || 0) + dt;
          if (it.smokeAcc > (it.dead ? 0.15 : 0.4)) {
            it.smokeAcc = 0;
            const q = it.boxes[Math.floor(Math.random() * it.boxes.length)];
            if (q) {
              const g = 0.12 + Math.random() * 0.1;
              fx.smoke.add({ x: q.cx + (Math.random() - 0.5) * q.hu, y: q.y1 + 2, z: q.cz + (Math.random() - 0.5) * q.hv, vx: (Math.random() - 0.5) * 3, vy: 10 + Math.random() * 8, vz: (Math.random() - 0.5) * 3,
                size: 8 + Math.random() * 6, grow: 9, drag: 0.5, grav: -2, life: 6 + Math.random() * 3, alpha: 0.4, fadeIn: 0.3, c0: [g, g, g], cell: 0, floor: false });
              if ((it.dead || hk < 0.25) && fx.fire && Math.random() < 0.5) fx.fire.add({ x: q.cx + (Math.random() - 0.5) * q.hu, y: q.y1 + 1, z: q.cz + (Math.random() - 0.5) * q.hv,
                vx: 0, vy: 6 + Math.random() * 6, vz: 0, size: 5 + Math.random() * 4, grow: -1, drag: 1, grav: -4, life: 0.6 + Math.random() * 0.5, alpha: 0.9, fadeIn: 0.05, c0: [1, 0.55, 0.15], c1: [0.6, 0.12, 0.02], cell: 1, floor: false });
            }
          }
        }
        A.t += dt;
        // Cờ bay phần phật theo gió (chạy cả khi bỏ hoang, gió sa mạc vẫn thổi)
        const bw = (typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind);
        const gst = (typeof Weather !== 'undefined' && Weather.gust ? Weather.gust() : null);
        const wx = (bw ? bw.vx || 0 : 3.5) + (gst ? gst.x || 0 : 0);
        const wz = (bw ? bw.vz || 0 : 2.0) + (gst ? gst.z || 0 : 0);
        const windSpd = Math.hypot(wx, wz) || 4.0;
        const windAng = Math.atan2(wz, wx);
        const windNorm = Math.min(2.5, windSpd / 6.5);
        const freq = 3.6 + 4.8 * windNorm;
        const waveAmp = 0.9 + 1.4 * Math.min(1.4, windNorm);
        const droop = Math.max(0.18, 1.8 * (1.1 - Math.min(1.0, windNorm * 1.1)));

        for (const F of (A.flags || [])) {
          F.t += dt;

          // Xoay lá cờ theo chiều gió thổi
          let dAng = (windAng - F.mesh.rotation.y) % (Math.PI * 2);
          if (dAng > Math.PI) dAng -= Math.PI * 2;
          if (dAng < -Math.PI) dAng += Math.PI * 2;
          F.mesh.rotation.y += dAng * Math.min(1.0, dt * 4.0);

          const pos = F.mesh.geometry.attributes.position, a = pos.array, b = F.base0;
          const W = F.w;
          for (let i = 0; i < a.length; i += 3) {
            const bx = b[i], by = b[i + 1], k = Math.min(1.0, Math.max(0.0, bx / W));
            const kWave = Math.pow(k, 1.22);
            const w1 = Math.sin(bx * 0.28 - F.t * freq + by * 0.08) * (2.0 * waveAmp) * kWave;
            const w2 = Math.sin(bx * 0.65 - F.t * (freq * 1.9) + by * 0.22) * (0.6 * waveAmp) * kWave;
            const w3 = Math.cos(bx * 0.85 - F.t * (freq * 2.5) - by * 0.16) * (0.35 * windNorm) * kWave;
            const waveZ = w1 + w2 + w3;
            a[i + 2] = waveZ;
            a[i + 1] = by - kWave * kWave * droop + Math.sin(bx * 0.3 - F.t * 4.5) * (0.32 * windNorm) * kWave;
            a[i] = bx - Math.abs(waveZ) * 0.12 * kWave;
          }
          pos.needsUpdate = true;
          F.mesh.geometry.computeVertexNormals();
        }
        // căn cứ bỏ hoang: mất điện -> đèn hiệu tắt, radar đứng yên, đèn pha không quét, máy phát không xả hơi
        if (ABANDONED) { A.beacon.emissiveIntensity = 0; A.blink.emissiveIntensity = 0; continue; }
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
        g.fillStyle = 'rgba(150,148,140,0.55)';
        g.strokeStyle = 'rgba(230,200,90,0.55)'; g.lineWidth = 1;
        { g.fillRect(-L.hu * sc, -L.hv * sc, L.hu * 2 * sc, L.hv * 2 * sc); g.strokeRect(-L.hu * sc, -L.hv * sc, L.hu * 2 * sc, L.hv * 2 * sc); }
        g.restore();
        g.fillStyle = '#2a2c2e';
        for (const q of it.boxes) {
          g.save(); g.translate(P(q.cx), P(q.cz)); g.rotate(Math.atan2(q.uz, q.ux));
          g.fillRect(-q.hu * sc, -q.hv * sc, Math.max(1, q.hu * 2 * sc), Math.max(1, q.hv * 2 * sc));
          g.restore();
        }
      }
      if (labels) this.drawLabels(g, P, sc);
      g.restore();
    }

    // Tên công trình dưới mặt bằng. fs: cỡ chữ (điểm ảnh) — bản đồ tác chiến vẽ trực tiếp theo điểm ảnh màn hình mỗi khung
    // (chữ luôn nét ở mọi mức phóng), mặc định theo tỉ lệ ảnh nền
    drawLabels(g, P, sc, fs) {
      for (const it of this.items) {
        const L = it.L, X = KINDS[L.kind] || {};
        const f = fs || Math.max(9, Math.min(13, 34 * sc * 8));
        g.font = `bold ${f | 0}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.fillStyle = L.kind === 'nuke' ? '#ffd24a' : X.color || '#9fd3ff';
        const icon = L.kind === 'nuke' ? '☢' : X.icon || '✈';
        const y = P(L.z) + (L.hv + 30) * sc;
        g.strokeText(icon + ' ' + it.name, P(L.x), y); g.fillText(icon + ' ' + it.name, P(L.x), y);
      }
    }
  }

  // Vẽ mặt bằng xuống ảnh nền mặt đất (nhìn từ xa / bản đồ vệ tinh): sân bê tông, đường đất trong trận địa
  function paintGround(ctx, list, toPx, sc) {
    for (const L of list || []) {
      ctx.save(); ctx.translate(toPx(L.x), toPx(L.z)); ctx.rotate(L.angle); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(164,156,140,0.95)'; ctx.fillRect(-L.hu, -L.hv, L.hu * 2, L.hv * 2);
      ctx.restore();
    }
  }

  // dựng riêng 1 trực thăng mẫu (dùng cho trang xem thử model)
  const previewHeli = (group) => { const K = new Kit({ x: 0, z: 0, fx: 1, fz: 0, G: 0 }, () => 0); heli(K, M4(0, 0, 0)); K.build(group); };
  // Bộ dựng hình / vật liệu / texture dùng chung cho file công trình riêng (KINDS[loại].build nhận qua tham số api)
  const API = { TAU, hash, TEX, canvas, texOf, speckle, blotch, ageCanvas, concreteFill, concPair, concTex, grimePair, ribPair, hescoTex, hazardTex, bandTex, biohazard, trefoil, warnSign, signTex, icbmTex, detailTex, ABANDONED, SITES, siteOf, asphaltTex, roadStripGeo, roadNet, apronTex, MAT, mat, metalMat, metalize, envCube, decal, decalT, doorMats, v3, M4, boxGeo, mergeGeos, defTile, Kit, apron, meshFenceMat, fence, sandbags, drum, camoMat, camoNet, warnPlate, loftGeo, plateGeo, heliSkin, heli, secKit, perimeter, officeBlock, stack, vTank, missile125, milTruck, aaGun };
  return { LandmarkSet, paintGround, NAMES, KINDS, segBox, previewHeli, api: API };
})();
if (typeof window !== 'undefined') window.Landmarks = Landmarks;
