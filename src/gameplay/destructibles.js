/**
 * VẬT THỂ PHÁ HỦY ĐƯỢC TRÊN CHIẾN TRƯỜNG
 * - Cây: cháy sém lá -> bốc cháy -> trơ thân cháy đen; sóng nổ mạnh quật đổ; xe tăng húc đổ
 * - Nhà: ghép từ các mô-đun (mảng tường từng tầng, sàn, cột, mái) -> trúng đạn thủng lỗ, vỡ mảng,
 *        mất trụ đỡ thì sập dây chuyền thành đống đổ nát, bụi mù
 * - Boong-ke bê tông cốt thép: tường dày + mái đổ bê tông phủ bao cát, khối tường sứt mẻ / nứt / vỡ,
 *        chặn sóng nổ & mảnh văng cho xe nấp bên trong
 * Tất cả dùng InstancedMesh dùng chung -> vài chục draw call cho cả bản đồ.
 */
const Destructibles = (() => {
  // Bộ sinh số ngẫu nhiên dùng chung của mọi vật thể phá hủy được. Mặc định Math.random; trong withSeed() là chuỗi
  // có hạt giống -> cùng một sự kiện (dựng bản đồ / một phát đạn trúng) cho kết quả giống hệt nhau trên mọi máy chơi.
  let RNG = Math.random;
  function seededRng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function withSeed(seed, fn) {
    const prev = RNG;
    RNG = seededRng(seed);
    try { return fn(); } finally { RNG = prev; }
  }
  const rand = (a, b) => a + RNG() * (b - a);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const sfx = (kind, x, y, z, k, o) => { if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(kind, { x, y, z }, k || 1, o || null); };
  // Tiếng vỡ theo vật liệu tường nhà: bê tông / đá xây / đất mộc / gỗ / tôn thép
  const MAT_SND = { concrete: 'concrete', stone: 'masonry', adobe: 'adobe', wood: 'woodBreak', metal: 'sheetMetal' };
  const matSnd = B => MAT_SND[B.st.mat] || 'concrete';

  // Sức phá & bán kính tác động lên công trình / cây theo loại đạn
  const AMMO = {
    NORMAL: { power: 1.0, radius: 20, heat: 0.85, pierce: true },
    HE: { power: 1.7, radius: 32, heat: 0.8 },
    AP: { power: 1.0, radius: 4.2, heat: 0.6, pierce: true },   // xuyên động năng: phá tập trung, vùng ảnh hưởng nhỏ
    // đạn mẹ chạm đất khi chưa tách (bắn thẳng / tầm quá gần): chỉ có liều phóng đạn con nhỏ, không phải đầu nổ phá.
    // Chạm công trình thì tách bung đạn con tại chỗ (ballistics.clusterImpactBurst) — không tới đây
    CLUSTER: { power: 0.6, radius: 18, heat: 0.6 },
    // bom con DPICM: vỏ thép mảnh + vòng zirconi gây cháy -> tia lửa nóng bắn vào tán cây khô là bén lửa ngay
    CLUSTER_SUBMUNITION: { power: 0.55, radius: 13, heat: 0.6, fire: true },
    // RPG-7 ~0,7 kg thuốc nổ: sức nổ kém đạn 120 mm (~1,5-2 kg) — trước đây 1,3 (mạnh hơn đạn tăng)
    RPG: { power: 0.8, radius: 15, heat: 0.7, pierce: true },
    ANTI_TANK_MISSILE: { power: 1.5, radius: 18, heat: 0.75, pierce: true },
    HEAT: { power: 1.1, radius: 18, heat: 0.9, pierce: true },
    HEAT120: { power: 1.25, radius: 20, heat: 0.95, pierce: true },
    GATLING_BULLET: { power: 0.07, radius: 3.5, heat: 0.1 },
    INCENDIARY: { power: 0.08, radius: 5, heat: 1.0, fire: true },
    // đạn cháy 12.7mm của xe trinh sát (game.applyEnvDamage đổi INCENDIARY -> INCENDIARY_HMG theo cỡ nòng): sức phá như
    // đạn 12.7 thường, chỉ thêm lửa — bảng INCENDIARY ở trên là đạn cháy 30mm
    INCENDIARY_HMG: { power: 0.035, radius: 2.5, heat: 0.8, fire: true },
    SCOUT_BULLET: { power: 0.035, radius: 2.5, heat: 0.03 },
    // đạn 7.62mm súng máy nóc tháp (game.applyEnvDamage đổi SCOUT_BULLET -> MG762 theo cờ trên viên đạn): ~1/5 động năng
    // đạn 12.7 (~3,5 so với ~17 kJ), lõi chì / thép mềm -> sức phá cảnh vật ~0,3 lần 12.7
    MG762: { power: 0.0105, radius: 2, heat: 0.01 }
  };
  // LỰU PHÁO 152/155 mm so với đạn 120 mm (dùng chung mọi bảng phá cảnh vật): ~3 lần thuốc nổ -> theo luật tỉ lệ nổ
  // (Hopkinson-Cranz, cùng sức ép ở khoảng cách ~ W^(1/3)) tầm tác động x1,45; sức phá sát điểm nổ (xung lực ~ W^(2/3)) x2,1
  const HEAVY_K = { power: 2.1, radius: 1.45, charge: 3 };
  // Khối thuốc nổ (kg TNT) của đạn nổ nhỏ dùng để cắt thân cây (TreeField.damageAt): bom con / lựu 40 mm, RPG-7, liều tách
  // đạn mẹ chùm
  const TREE_CUT_KG = { CLUSTER_SUBMUNITION: 0.03, RPG: 0.7, CLUSTER: 0.3 };
  function ammoInfo(ammo, heavy) {
    const a = AMMO[ammo] || AMMO.NORMAL;
    if (!heavy) return a;
    return { power: a.power * HEAVY_K.power, radius: a.radius * HEAVY_K.radius, heat: a.heat, pierce: a.pierce, fire: a.fire };
  }

  // ---------------------------------------------------------------------------
  // TEXTURE THỦ TỤC
  // ---------------------------------------------------------------------------
  const TEX = {};
  function canvasTex(key, w, h, draw, repeat) {
    if (TEX[key]) return TEX[key];
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // Texture chỉ tạo 1 lần rồi dùng lại -> vẽ bằng bộ sinh số RIÊNG theo tên texture, không lấy số của bộ sinh
    // dùng chung (nếu lấy, máy nào đã tạo texture từ trước sẽ lệch dãy số -> nhà / cây dựng khác nhau giữa các máy)
    let kh = 2166136261;
    for (let i = 0; i < key.length; i++) kh = Math.imul(kh ^ key.charCodeAt(i), 16777619);
    withSeed(kh >>> 0, () => draw(g, w, h));
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    TEX[key] = t;
    return t;
  }
  function speckle(g, w, h, n, cols, smin, smax) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[i % cols.length];
      const s = smin + RNG() * (smax - smin);
      g.fillRect(RNG() * w, RNG() * h, s, s);
    }
  }
  // Bê tông đúc: vệt ván khuôn, lỗ ty, vệt nước chảy, rêu ố chân tường
  function concreteTex() {
    return canvasTex('concrete', 256, 256, (g, w, h) => {
      g.fillStyle = '#9d9a90'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2600, ['rgba(70,68,62,0.18)', 'rgba(200,196,186,0.16)', 'rgba(110,104,92,0.2)'], 1, 3);
      g.strokeStyle = 'rgba(60,58,52,0.35)'; g.lineWidth = 1.5;
      for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.fillStyle = 'rgba(40,38,34,0.5)';
      for (let y = 32; y < h; y += 64) for (let x = 32; x < w; x += 64) { g.beginPath(); g.arc(x, y, 2, 0, 6.3); g.fill(); }
      // Loang màu mềm cỡ lớn (mẻ vữa đậm nhạt, ẩm không đều) thay cho mặt phẳng một màu
      // (nhỏ & nhạt: texture lặp trên từng khối nên vết nào nổi bật cũng thành hoa văn lặp)
      for (let i = 0; i < 70; i++) {
        const x = RNG() * w, y = RNG() * h, r = 10 + RNG() * 22, dark = RNG() < 0.55;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, dark ? 'rgba(78,74,66,0.07)' : 'rgba(214,210,198,0.06)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        // vẽ lặp sang 4 phía để texture lặp không lộ đường nối giữa các khối
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
          g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
        }
      }
      // Vài vệt nước chảy từ mép trên: rộng, mờ, dài ngắn khác nhau, nhòe mép. (Trước đây 18 vệt hẹp chạy suốt
      // chiều cao, texture lặp trên từng khối tường nên thành sọc dọc như mã vạch.)
      if ('filter' in g) g.filter = 'blur(3px)';
      for (let i = 0; i < 4; i++) {
        const x = RNG() * w, sw = 10 + RNG() * 16, len = h * (0.3 + RNG() * 0.5);
        const gr = g.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, 'rgba(58,54,46,0.14)'); gr.addColorStop(1, 'rgba(58,54,46,0)');
        g.fillStyle = gr; g.fillRect(x, 0, sw, len);
        if (x + sw > w) g.fillRect(x - w, 0, sw, len);   // texture lặp: vệt sát mép phải nối sang mép trái
      }
      if ('filter' in g) g.filter = 'none';
    }, true);
  }
  // Bê tông nứt toác: vài đường nứt dài giữ hướng (gãy khúc nhẹ, mảnh dần, rẽ nhánh ít) + mảng tróc lộ cốt liệu xám sáng.
  // Không vẽ chấm tròn / thép gỉ: texture lặp trên mọi khối nên chi tiết đặc trưng nào cũng thành hoa văn lộ liễu.
  function crackedTex() {
    return canvasTex('concreteCracked', 256, 256, (g, w, h) => {
      g.drawImage(concreteTex().image, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const crack = (x, y, a, len, lw, depth) => {
        const steps = Math.max(3, Math.round(len / 9));
        for (let s = 0; s < steps; s++) {
          a += rand(-0.45, 0.45);
          const nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
          const cw = Math.max(0.6, lw * (1 - s / steps * 0.7));
          g.strokeStyle = 'rgba(205,200,190,0.35)'; g.lineWidth = cw + 0.8;
          g.beginPath(); g.moveTo(x + 0.7, y + 0.7); g.lineTo(nx + 0.7, ny + 0.7); g.stroke();
          g.strokeStyle = 'rgba(28,25,22,0.8)'; g.lineWidth = cw;
          g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
          x = nx; y = ny;
          if (depth > 0 && RNG() < 0.22) crack(x, y, a + (RNG() < 0.5 ? 1 : -1) * rand(0.5, 1.1), len * rand(0.25, 0.45), cw * 0.7, depth - 1);
        }
      };
      // Nứt chạy xiên chéo dài xuyên khối (tường bị ép / rung) - đi qua mép để nối liền giữa các khối lặp
      for (let k = 0; k < 4; k++) crack(RNG() * w, RNG() * h, rand(0, 6.28), rand(110, 200), rand(1.4, 2.2), 2);
      // Mảng tróc nham nhở: bê tông tươi sáng hơn, lấm tấm đá dăm, mép dưới đổ bóng
      for (let k = 0; k < 3; k++) {
        const cx = RNG() * w, cy = RNG() * h, R = rand(9, 18), n = 11;
        const pts = [];
        for (let i = 0; i < n; i++) { const a = i / n * 6.283; const r = R * rand(0.55, 1.2); pts.push([cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r]); }
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        g.fillStyle = 'rgba(176,171,160,0.85)'; g.fill();
        g.strokeStyle = 'rgba(45,42,38,0.55)'; g.lineWidth = 1.2; g.stroke();
        for (let i = 0; i < 24; i++) {
          const v = 95 + Math.floor(RNG() * 70);
          g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.8)`;
          g.fillRect(cx + rand(-R, R), cy + rand(-R * 0.7, R * 0.7), rand(1, 3), rand(1, 2.5));
        }
      }
    }, true);
  }
  // Phong hóa tường tô: loang ẩm mờ, nước mưa từ gờ sàn tầng trên làm mép trên sẫm, vệt ố chảy xuống từ hai đầu bệ cửa,
  // chân tường hắt bẩn. Texture lặp ở mọi khoang / tầng nên chỉ dùng chi tiết mềm, mờ (không vệt sắc dễ lộ lặp).
  // drips: [[x, yBắtĐầu, dài, độĐậm]] · foot: tỉ lệ chiều cao vùng bẩn chân tường · footA: độ đậm
  function weatherWall(g, w, h, drips, foot, footA) {
    for (let i = 0; i < 9; i++) {
      const x = RNG() * w, y = RNG() * h, r = 14 + RNG() * 30, dark = RNG() < 0.65;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? 'rgba(74,66,54,0.09)' : 'rgba(236,230,216,0.07)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const top = g.createLinearGradient(0, 0, 0, h * 0.18);
    top.addColorStop(0, 'rgba(50,45,38,0.3)'); top.addColorStop(1, 'rgba(50,45,38,0)');
    g.fillStyle = top; g.fillRect(0, 0, w, h * 0.18);
    if ('filter' in g) g.filter = 'blur(1.2px)';
    const streak = (x, y0, len, a, sw) => {
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, `rgba(46,41,34,${a})`); gr.addColorStop(1, 'rgba(46,41,34,0)');
      g.fillStyle = gr; g.fillRect(x - sw / 2, y0, sw, len);
    };
    for (const [x, y0, len, a] of drips) streak(x + rand(-1.5, 1.5), y0, len * rand(0.8, 1.15), a, rand(3, 6));
    for (let i = 0; i < 5; i++) streak(RNG() * w, 0, h * rand(0.12, 0.4), rand(0.06, 0.13), rand(2, 5));
    if ('filter' in g) g.filter = 'none';
    if (foot) {
      const gf = g.createLinearGradient(0, h * (1 - foot), 0, h);
      gf.addColorStop(0, 'rgba(62,52,40,0)'); gf.addColorStop(1, `rgba(62,52,40,${footA})`);
      g.fillStyle = gf; g.fillRect(0, h * (1 - foot), w, h * foot);
    }
  }
  // Tường đá xây cũ: hàng đá cao thấp khác nhau, viên dài ngắn không đều, mỗi viên một tông (đá ấm / đá xám lạnh), mép viên
  // mòn tròn (sáng mép trên-trái, sẫm mép dưới-phải -> normal map nổi viên), mạch vữa lõm sẫm; vài viên rỗ mặt, ố gỉ sắt,
  // mẻ góc lộ vữa. Lặp liền mép 2 chiều (viên chạm mép phải vẽ tràn sang mép trái) — thay lưới gạch block đều tăm tắp
  function stoneMasonry(g, w, h) {
    g.fillStyle = '#6f685d'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['rgba(40,36,30,0.35)', 'rgba(150,142,128,0.3)'], 1, 2);
    const rows = [];
    for (let y = 0; y < h;) { let ch = [11, 13, 15, 17, 19][Math.floor(RNG() * 5)]; if (h - y - ch < 11) ch = h - y; rows.push([y, ch]); y += ch; }
    for (const [y, ch] of rows) {
      let x = RNG() * w;
      const x0 = x;
      while (x < x0 + w - 6) {
        let sw = 14 + RNG() * 26;
        if (x + sw > x0 + w - 8) sw = x0 + w - x;
        const warm = RNG(), v = 0.82 + RNG() * 0.3;
        const r = (warm < 0.55 ? 186 : 168) * v, gg = (warm < 0.55 ? 176 : 167) * v, b = (warm < 0.55 ? 156 : 160) * v;
        for (const ox of [0, -w]) {
          const sx = x + ox + 1, sy = y + 1, ww = sw - 2, hh = ch - 2, rr = 2 + RNG() * 2;
          if (sx > w || sx + ww < 0) continue;
          g.beginPath();
          if (g.roundRect) g.roundRect(sx, sy, ww, hh, rr); else g.rect(sx, sy, ww, hh);
          g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`; g.fill();
          const bv = g.createLinearGradient(sx, sy, sx + ww * 0.35, sy + hh);
          bv.addColorStop(0, 'rgba(255,250,236,0.22)'); bv.addColorStop(0.35, 'rgba(255,250,236,0)');
          bv.addColorStop(0.8, 'rgba(30,26,20,0)'); bv.addColorStop(1, 'rgba(30,26,20,0.3)');
          g.fillStyle = bv; g.fill();
          const k = RNG();
          if (k < 0.18) {
            // mặt đá rỗ / bào mòn
            for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(60,54,46,0.35)'; g.fillRect(sx + RNG() * ww, sy + RNG() * hh, 1 + RNG(), 1 + RNG()); }
          } else if (k < 0.26) {
            // ố gỉ sắt / nước chảy từ mạch vữa
            const st = g.createLinearGradient(0, sy, 0, sy + hh);
            st.addColorStop(0, 'rgba(120,80,40,0.28)'); st.addColorStop(1, 'rgba(120,80,40,0.04)');
            g.fillStyle = st; g.fill();
          } else if (k < 0.32) {
            // mẻ góc: lộ vữa sẫm
            const cx = RNG() < 0.5 ? sx : sx + ww, cy = RNG() < 0.5 ? sy : sy + hh, cr = 3 + RNG() * 3;
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (cx === sx ? cr : -cr), cy); g.lineTo(cx, cy + (cy === sy ? cr * 0.8 : -cr * 0.8)); g.closePath();
            g.fillStyle = 'rgba(92,86,76,0.95)'; g.fill();
          }
        }
        x += sw;
      }
    }
  }
  // Ván gỗ phai nắng mưa: gỗ đã ngả xám bạc, mỗi tấm một tông (vài tấm thay mới còn nâu vàng), thớ dọc, khe ván tối,
  // đinh gỉ ở thanh nẹp ngang, vài tấm nứt dọc / mục chân
  function woodBoards(g, w, h) {
    g.fillStyle = '#4a3f33'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) {
      const fresh = RNG() < 0.12, v = 0.85 + RNG() * 0.25;
      const c = fresh ? [176, 140, 96] : [150, 138, 120];
      g.fillStyle = `rgb(${(c[0] * v) | 0},${(c[1] * v) | 0},${(c[2] * v) | 0})`; g.fillRect(x + 1, 0, 8.5, h);
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(60,48,36,${0.12 + RNG() * 0.14})`; g.fillRect(x + 1.5 + RNG() * 7, 0, 0.7, h); }
      if (RNG() < 0.2) { const y = RNG() * h * 0.6; g.fillStyle = 'rgba(30,24,18,0.6)'; g.fillRect(x + 3 + RNG() * 4, y, 0.8, 20 + RNG() * 30); }
      if (!fresh) { const gf = g.createLinearGradient(0, h * 0.75, 0, h); gf.addColorStop(0, 'rgba(50,44,34,0)'); gf.addColorStop(1, 'rgba(50,44,34,0.35)'); g.fillStyle = gf; g.fillRect(x + 1, h * 0.75, 8.5, h * 0.25); }
      for (const ny of [6, h - 8]) { g.fillStyle = 'rgba(90,50,26,0.8)'; g.fillRect(x + 4, ny, 1.4, 1.4); }
    }
  }
  // Mảng tường có cửa sổ (1 khoang tầng): tường tô màu trắng (nhuộm bằng instanceColor), khung cửa, kính tối
  function windowPanelTex(style) {
    return canvasTex('win_' + style, 128, 128, (g, w, h) => {
      // Vữa tô sơn ngả xám (albedo ~0.6 sau khi nhuộm), không trắng tinh như giấy
      g.fillStyle = '#d6d1c6'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 900, ['rgba(120,110,95,0.15)', 'rgba(255,255,255,0.12)'], 1, 3);
      if (style === 'office') {
        // Mặt dựng kính: khung nhôm, kính phản chiếu
        g.fillStyle = '#9aa3a8'; g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#2c3d4c'); gr.addColorStop(0.5, '#4f6a7d'); gr.addColorStop(1, '#22313d');
        g.fillStyle = gr; g.fillRect(6, 14, w - 12, h - 30);
        g.fillStyle = '#9aa3a8'; g.fillRect(w / 2 - 2, 14, 4, h - 30);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(12, h - 20); g.lineTo(40, 18); g.lineTo(54, 18); g.lineTo(26, h - 20); g.fill();
      } else if (style === 'adobe') {
        g.fillStyle = '#d9c9a8'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, 1400, ['rgba(140,110,70,0.2)', 'rgba(255,240,210,0.2)'], 1, 4);
        g.fillStyle = '#2a211a'; g.fillRect(48, 40, 32, 34);
        g.fillStyle = '#6b4a2a'; g.fillRect(44, 36, 40, 5); g.fillRect(44, 74, 40, 4);
      } else if (style === 'stone') {
        stoneMasonry(g, w, h);
        // đá lanh tô nguyên khối trên cửa + 2 má cửa đá lớn
        g.fillStyle = '#6f685d'; g.fillRect(40, 28, 48, 11);
        g.fillStyle = '#b3aa98'; g.fillRect(41, 29, 46, 9);
        g.fillStyle = 'rgba(30,26,20,0.25)'; g.fillRect(41, 36, 46, 2);
        g.fillStyle = '#6f685d'; g.fillRect(41, 38, 6, 41); g.fillRect(81, 38, 6, 41);
        g.fillStyle = '#ada591'; g.fillRect(42, 39, 4, 39); g.fillRect(82, 39, 4, 39);
        g.fillStyle = '#1e1a16'; g.fillRect(46, 38, 36, 40);
        g.fillStyle = '#5a3e26'; g.fillRect(46, 56, 36, 3); g.fillRect(63, 38, 3, 40);
      } else if (style === 'wood') {
        woodBoards(g, w, h);
        g.fillStyle = '#231a12'; g.fillRect(40, 40, 48, 38);
        g.fillStyle = '#7b5a36'; g.fillRect(38, 38, 52, 4); g.fillRect(62, 40, 4, 38);
      } else if (style === 'metal') {
        g.fillStyle = '#cfd2cf'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(60,64,62,0.35)'; g.fillRect(x, 0, 3, h); }
        speckle(g, w, h, 300, ['rgba(140,80,40,0.25)'], 2, 6);
      } else if (style === 'hangarDoor') {
        // Đầu hồi nhà kho: tôn sóng + cửa trượt lớn bằng thép (ray treo phía trên, các cánh ghép dọc, gân ngang, chân cửa gỉ)
        g.fillStyle = '#cfd2cf'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(60,64,62,0.35)'; g.fillRect(x, 0, 3, h); }
        g.fillStyle = '#9da29c'; g.fillRect(6, 30, 116, 98);
        for (let x = 6; x < 122; x += 29) { g.fillStyle = 'rgba(30,32,30,0.55)'; g.fillRect(x, 30, 2, 98); }
        for (let y = 44; y < 128; y += 20) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(6, y, 116, 2); g.fillStyle = 'rgba(20,22,20,0.3)'; g.fillRect(6, y + 2, 116, 1.5); }
        g.fillStyle = '#3d403e'; g.fillRect(0, 24, w, 6);
        const rs = g.createLinearGradient(0, 108, 0, 128);
        rs.addColorStop(0, 'rgba(110,60,30,0)'); rs.addColorStop(1, 'rgba(110,60,30,0.35)');
        g.fillStyle = rs; g.fillRect(6, 108, 116, 20);
        speckle(g, w, h, 200, ['rgba(140,80,40,0.22)'], 2, 5);
      } else if (style === 'side') {
        // Vách hông nhà ống: tường gạch tô kín, không cửa; mạch vữa lộ mờ chỗ lớp tô bong, ố nước loang
        g.strokeStyle = 'rgba(120,96,78,0.1)'; g.lineWidth = 1;
        for (let y = 6; y < h; y += 8) for (let x = (y / 8) % 2 ? 0 : 10; x < w; x += 20) if (RNG() < 0.18) g.strokeRect(x, y, 20, 8);
        weatherWall(g, w, h, [], 0.12, 0.16);
      } else if (style === 'officeB') {
        // Văn phòng khung bê tông: dải cửa kính chạy suốt mặt nhà, tường lửng bê tông giữa các tầng
        g.fillStyle = '#c9c5bc'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, 700, ['rgba(90,86,78,0.18)', 'rgba(240,236,228,0.12)'], 1, 3);
        g.fillStyle = '#5d6264'; g.fillRect(0, 30, w, 58);
        const gr = g.createLinearGradient(0, 32, 0, 86);
        gr.addColorStop(0, '#41505a'); gr.addColorStop(0.5, '#2c3840'); gr.addColorStop(1, '#222b31');
        g.fillStyle = gr; g.fillRect(0, 33, w, 52);
        g.fillStyle = '#6e7376'; for (const x of [0, 42, 84]) g.fillRect(x, 33, 3, 52);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(8, 36, 20, 46);
        g.fillStyle = '#a9a59c'; g.fillRect(0, 86, w, 4);
        weatherWall(g, w, h, [[20, 90, 26, 0.16], [64, 90, 22, 0.12], [106, 90, 26, 0.16]], 0.12, 0.14);
      } else if (style === 'aptB') {
        // Chung cư có lô gia: hốc ban công lõm tối, cửa đi + cửa sổ, lan can song sắt, mép sàn ban công
        g.fillStyle = '#7d7a72'; g.fillRect(18, 20, 92, 84);
        const rc = g.createLinearGradient(0, 20, 0, 104);
        rc.addColorStop(0, 'rgba(0,0,0,0.35)'); rc.addColorStop(1, 'rgba(0,0,0,0.05)');
        g.fillStyle = rc; g.fillRect(18, 20, 92, 84);
        g.fillStyle = '#343c41'; g.fillRect(28, 28, 30, 74); g.fillRect(64, 32, 38, 46);
        g.fillStyle = '#4d5960'; g.fillRect(31, 31, 24, 40); g.fillRect(67, 35, 15, 40); g.fillRect(85, 35, 15, 40);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(33, 33, 6, 36);
        g.fillStyle = '#3b3d3d'; g.fillRect(18, 74, 92, 3);
        for (let x = 20; x < 110; x += 6) g.fillRect(x, 77, 1.6, 24);
        g.fillStyle = '#a7a296'; g.fillRect(14, 101, 100, 6);
        weatherWall(g, w, h, [[16, 107, 20, 0.24], [112, 107, 20, 0.24], [64, 107, 14, 0.12]], 0.08, 0.1);
      } else if (style === 'aptC') {
        // Nhà tập thể cũ: 3 ô cửa hẹp, cánh chớp gỗ sơn xanh đã bạc, ô thông gió trên cửa
        for (const x of [16, 52, 88]) {
          g.fillStyle = '#2f3438'; g.fillRect(x, 30, 24, 56);
          g.fillStyle = '#56685a'; g.fillRect(x + 1, 32, 11, 52); g.fillRect(x + 12, 32, 11, 52);
          g.fillStyle = 'rgba(28,34,28,0.45)'; for (let y = 34; y < 84; y += 4) { g.fillRect(x + 2, y, 9, 1.4); g.fillRect(x + 13, y, 9, 1.4); }
          g.fillStyle = '#bdb6a8'; g.fillRect(x - 2, 86, 28, 4);
          g.fillStyle = '#4a4c4a'; for (let k = 0; k < 4; k++) g.fillRect(x + 2 + k * 6, 22, 4, 4);
        }
        weatherWall(g, w, h, [[15, 90, 30, 0.2], [41, 90, 30, 0.2], [51, 90, 26, 0.16], [113, 90, 30, 0.2]], 0.1, 0.14);
      } else if (style === 'tube') {
        // Nhà ống tầng trên: cửa đi kính 4 cánh ra ban công, lan can sắt hoa văn, mép sàn ban công đổ bóng
        g.fillStyle = '#353b3f'; g.fillRect(30, 16, 68, 90);
        g.fillStyle = '#4f5c63'; for (const x of [33, 49, 65, 81]) g.fillRect(x, 26, 14, 76);
        g.fillStyle = '#5d6a70'; g.fillRect(33, 18, 62, 6);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(35, 28, 4, 70);
        g.fillStyle = '#c2bcae'; g.fillRect(26, 12, 76, 4);
        g.fillStyle = '#2d2f2f'; g.fillRect(6, 76, 116, 3); g.fillRect(6, 100, 116, 2);
        for (let x = 8; x < 122; x += 8) g.fillRect(x, 79, 1.6, 21);
        g.strokeStyle = '#2d2f2f'; g.lineWidth = 1.2;
        for (let x = 12; x < 120; x += 16) { g.beginPath(); g.arc(x, 89, 4, 0, 6.283); g.stroke(); }
        g.fillStyle = '#9d988d'; g.fillRect(2, 102, 124, 7);
        const bs = g.createLinearGradient(0, 109, 0, 122);
        bs.addColorStop(0, 'rgba(0,0,0,0.35)'); bs.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bs; g.fillRect(0, 109, w, 13);
        weatherWall(g, w, h, [[4, 109, 18, 0.24], [124, 109, 18, 0.24]], 0, 0);
      } else if (style === 'tubeB') {
        // Nhà ống tầng trên: cửa sổ lớn có khung sắt bảo vệ, cục nóng điều hòa, ô văng bê tông
        g.fillStyle = '#353b3f'; g.fillRect(26, 30, 76, 54);
        g.fillStyle = '#56636c'; g.fillRect(29, 33, 34, 48); g.fillRect(65, 33, 34, 48);
        g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(31, 35, 7, 44);
        g.fillStyle = '#2c2e2e';
        for (let x = 26; x <= 102; x += 8) g.fillRect(x, 28, 1.5, 58);
        for (let y = 28; y <= 86; y += 14) g.fillRect(24, y, 80, 1.5);
        g.fillStyle = '#aea89b'; g.fillRect(20, 22, 88, 6);
        const vs = g.createLinearGradient(0, 28, 0, 38);
        vs.addColorStop(0, 'rgba(0,0,0,0.3)'); vs.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = vs; g.fillRect(20, 28, 88, 10);
        g.fillStyle = '#b9b6ae'; g.fillRect(86, 92, 30, 18);
        g.fillStyle = '#5b5d5c'; g.beginPath(); g.arc(97, 101, 6, 0, 6.283); g.fill();
        g.fillStyle = '#bdb6a8'; g.fillRect(24, 86, 80, 4);
        weatherWall(g, w, h, [[26, 90, 30, 0.2], [101, 110, 18, 0.28], [62, 90, 20, 0.1]], 0.08, 0.1);
      } else if (style === 'shopB') {
        // Cửa hàng đóng cửa cuốn: biển hiệu, cửa cuốn tôn sóng xỉn kéo xuống 2/3, lộ lòng nhà tối phía dưới
        g.fillStyle = '#504a42'; g.fillRect(4, 16, 120, 18);
        g.fillStyle = 'rgba(214,206,186,0.3)';
        for (let x = 18; x < 106; x += rand(6, 10)) g.fillRect(x, 21, rand(3, 5), 8);
        g.fillStyle = '#6d6e6a'; g.fillRect(6, 38, 116, 4);
        g.fillStyle = '#85857f'; g.fillRect(8, 42, 112, 52);
        for (let y = 42; y < 94; y += 4) { g.fillStyle = 'rgba(40,40,38,0.35)'; g.fillRect(8, y + 2.6, 112, 1.2); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(8, y, 112, 1); }
        g.fillStyle = 'rgba(110,70,40,0.18)'; g.fillRect(8, 80, 112, 14);
        g.fillStyle = '#4f504d'; g.fillRect(8, 93, 112, 3);
        g.fillStyle = '#1c1e1f'; g.fillRect(8, 96, 112, 24);
        g.fillStyle = '#6f6a62'; g.fillRect(0, 120, w, 8);
        weatherWall(g, w, h, [[6, 34, 30, 0.16], [122, 34, 30, 0.16]], 0.16, 0.3);
      } else if (style.startsWith('lobby')) {
        // Tầng trệt cao ốc (sảnh): trụ ốp đá sáng 2 bên có mạch đá, dải ốp đá sẫm chạy ngang trên cùng (chỗ gắn biển tên), vách
        // kính sảnh khung nhôm gần suốt chiều cao tầng (ô kính trên + 2 ô lớn), bậc đá chân. Biến thể: ...D = khoang lối vào
        // (2 cánh cửa kính khung inox, tay đẩy ngang); sảnh cao 2 tầng: lobbyL = tầng dưới (không dải ốp — vách kính chạy liền
        // lên tầng trên), lobbyU = tầng trên (dải ốp trên cùng, kính chạy suốt xuống mép dưới, không bậc đá)
        const band = style !== 'lobbyL' && style !== 'lobbyLD', kerb = style !== 'lobbyU', door = style.endsWith('D');
        const gy0 = band ? 22 : 0;
        g.fillStyle = '#c4bdb0'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, 1400, ['rgba(90,84,74,0.22)', 'rgba(250,246,236,0.2)'], 1, 2);
        g.strokeStyle = 'rgba(70,64,56,0.45)'; g.lineWidth = 1;
        for (let y = gy0 + 24; y < 118; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(8, y); g.moveTo(120, y); g.lineTo(128, y); g.stroke(); }
        if (band) {
          g.fillStyle = '#4b4946'; g.fillRect(0, 0, w, 22);
          speckle(g, w, 22, 300, ['rgba(20,20,20,0.3)', 'rgba(200,196,190,0.15)'], 1, 2);
          g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 20, w, 2);
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, w, 2);
        }
        const yb = kerb ? 118 : 128;
        g.fillStyle = '#9aa0a4'; g.fillRect(8, gy0, 112, yb - gy0);
        const gl = g.createLinearGradient(0, gy0 + 4, 0, yb - 2);
        gl.addColorStop(0, '#33414b'); gl.addColorStop(1, '#25303a');
        g.fillStyle = gl;
        g.fillRect(11, gy0 + 4, 106, 39 - gy0 - 4);
        if (!door) { g.fillRect(11, 42, 51, yb - 44); g.fillRect(66, 42, 51, yb - 44); }
        else {
          // cửa 2 cánh thông thủy ~1,9 x 2,2 m (mỗi cánh ~0,85 m), ô kính cố định hẹp hai bên
          g.fillRect(11, 42, 18, 74); g.fillRect(99, 42, 18, 74);
          g.fillStyle = '#a9adaf'; g.fillRect(31, 40, 66, 78);
          g.fillStyle = gl; g.fillRect(35, 44, 27, 72); g.fillRect(66, 44, 27, 72);
          g.fillStyle = '#d2d5d6'; g.fillRect(37, 80, 23, 2.5); g.fillRect(68, 80, 23, 2.5);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(62, 44, 4, 72);
          g.fillStyle = '#b8b4ac'; g.fillRect(31, 115, 66, 3);
        }
        if (kerb) {
          g.fillStyle = '#8a857c'; g.fillRect(0, 118, w, 10);
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 118, w, 1.5);
        }
        weatherWall(g, w, h, band ? [[4, 22, 30, 0.12], [124, 22, 30, 0.12]] : [], kerb ? 0.1 : 0, 0.22);
      } else if (style === 'shop') {
        // Mặt tiền cửa hàng — CHỈ dùng cho tầng trệt (tầng trên của nhà phố dùng mảng 'apt'):
        // biển hiệu sẫm, mái hiên bạt sọc đã phai, tủ kính khung nhôm xỉn, bệ chân tường bê tông
        g.fillStyle = '#4b4843'; g.fillRect(4, 14, 120, 16);
        g.fillStyle = 'rgba(205,198,182,0.28)';
        for (let x = 22; x < 104; x += rand(7, 11)) g.fillRect(x, 19, rand(3, 6), 6);
        g.fillStyle = '#58322b'; g.fillRect(2, 30, 124, 15);
        g.fillStyle = 'rgba(176,150,128,0.22)';
        for (let x = 2; x < 126; x += 16) g.fillRect(x, 30, 8, 15);
        const aw = g.createLinearGradient(0, 30, 0, 45);
        aw.addColorStop(0, 'rgba(255,240,220,0.1)'); aw.addColorStop(1, 'rgba(0,0,0,0.28)');
        g.fillStyle = aw; g.fillRect(2, 30, 124, 15);
        g.fillStyle = 'rgba(30,20,16,0.45)';
        for (let x = 2; x < 126; x += 8) { g.beginPath(); g.arc(x + 4, 45, 4, 0, Math.PI); g.fill(); }
        g.fillStyle = '#6c6d69'; g.fillRect(8, 47, 112, 73);
        const gl = g.createLinearGradient(0, 49, w, 118);
        gl.addColorStop(0, '#2c3439'); gl.addColorStop(0.55, '#3b464c'); gl.addColorStop(1, '#262d31');
        g.fillStyle = gl; g.fillRect(11, 50, 106, 68);
        g.fillStyle = '#6c6d69'; g.fillRect(45, 50, 3, 68); g.fillRect(83, 50, 3, 68); g.fillRect(11, 64, 106, 2);
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(16, 116); g.lineTo(30, 66); g.lineTo(38, 66); g.lineTo(24, 116); g.fill();
        const sh = g.createLinearGradient(0, 47, 0, 60);
        sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sh; g.fillRect(8, 47, 112, 13);
        g.fillStyle = '#6f6a62'; g.fillRect(0, 120, w, 8);
        weatherWall(g, w, h, [[4, 45, 40, 0.18], [124, 45, 40, 0.18]], 0.16, 0.3);
      } else {
        // Chung cư: tường tô, cửa sổ 2 cánh có ô văng, bệ cửa
        g.fillStyle = '#3a4248'; g.fillRect(34, 30, 60, 54);
        g.fillStyle = '#56636c'; g.fillRect(38, 34, 25, 46); g.fillRect(65, 34, 25, 46);
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(40, 36, 8, 42);
        g.fillStyle = '#b3ad9f'; g.fillRect(30, 26, 68, 5); g.fillRect(28, 84, 72, 6);
        // Bệ cửa đọng nước -> 2 vệt ố chảy từ hai đầu bệ, một vệt nhạt giữa
        weatherWall(g, w, h, [[31, 90, 34, 0.22], [97, 90, 34, 0.22], [64, 90, 22, 0.1]], 0.1, 0.12);
      }
      if (style === 'adobe') weatherWall(g, w, h, [[47, 78, 40, 0.18], [81, 78, 40, 0.18]], 0.22, 0.3);
      else if (style === 'stone') weatherWall(g, w, h, [[46, 78, 34, 0.16], [82, 78, 34, 0.16]], 0.18, 0.26);
      else if (style === 'wood') weatherWall(g, w, h, [[40, 78, 30, 0.14], [88, 78, 30, 0.14]], 0.2, 0.32);
      else if (style === 'metal' || style === 'hangarDoor') weatherWall(g, w, h, [], 0.2, 0.26);
      else if (style === 'office') {
        // Khung nhôm mặt dựng: bụi đọng mép trên mỗi tầng, chân kính hơi bẩn
        const go = g.createLinearGradient(0, 0, 0, 16);
        go.addColorStop(0, 'rgba(40,40,38,0.32)'); go.addColorStop(1, 'rgba(40,40,38,0)');
        g.fillStyle = go; g.fillRect(0, 0, w, 16);
        const gb = g.createLinearGradient(0, h - 18, 0, h);
        gb.addColorStop(0, 'rgba(50,46,40,0)'); gb.addColorStop(1, 'rgba(50,46,40,0.25)');
        g.fillStyle = gb; g.fillRect(0, h - 18, w, 18);
      }
    });
  }
  // Ô vỡ của nhà có tầng trệt khác tầng trên: nửa trên = mẫu tầng trên, nửa dưới = mẫu tầng trệt. Lưới mảng tường bị
  // phá của cả nhà gộp chung 1 vật liệu nên dùng atlas này, UV chọn nửa theo tầng (panelGeo)
  // Nhiều kiểu mặt tường trong một nhà (cao ốc: sảnh 2 tầng + khoang cửa, dãy ki-ốt trộn cửa mở / cửa cuốn): atlas N ô xếp
  // dọc, ô thứ i chiếm v ∈ [i/N, (i+1)/N] (ô 0 = mẫu tầng trệt ở đáy ảnh, ô 1 = mẫu tầng trên như atlas 2 nửa cũ)
  function atlasTex(...keys) {
    const n = keys.length;
    return canvasTex('winBrokenAtlas_' + keys.join('_'), 128, 128 * n, (g) => {
      keys.forEach((k, i) => g.drawImage(brokenWindowTex(k).image, 0, 128 * (n - 1 - i)));
    });
  }
  // ===========================================================================
  // MẢNG TƯỜNG NỔI KHỐI: cửa sổ / cửa đi lõm vào trong tường (má cửa đổ bóng), bậu cửa, ô văng, mép sàn ban công, mái hiên,
  // gờ tầng nhô ra — dựng đúng theo vị trí đã vẽ trên ảnh mặt tiền 128x128 (toạ độ điểm ảnh, y tính từ trên xuống).
  // o: ô lõm [x0, y0, x1, y1, độ sâu theo bề dày tường] · p: phần nhô [x0, y0, x1, y1, độ nhô theo bề dày tường]
  // Mỗi kiểu mặt tường 1 hình mẫu dùng chung cho mọi khoang (instanced) -> không thêm lệnh vẽ
  // ===========================================================================
  const RELIEF = {
    apt: { o: [[34, 30, 94, 84, 0.6]], p: [[30, 26, 98, 31, 1.0], [28, 84, 100, 90, 0.6], [0, 0, 128, 3, 0.3]] },
    aptB: { o: [[18, 20, 110, 101, 0.85]], p: [[14, 101, 114, 107, 1.4], [0, 0, 128, 3, 0.3]] },
    aptC: { o: [[16, 30, 40, 86, 0.55], [52, 30, 76, 86, 0.55], [88, 30, 112, 86, 0.55]], p: [[14, 86, 42, 90, 0.5], [50, 86, 78, 90, 0.5], [86, 86, 114, 90, 0.5], [0, 0, 128, 3, 0.3]] },
    tube: { o: [[30, 16, 98, 102, 0.75]], p: [[26, 12, 102, 16, 0.6], [2, 102, 126, 109, 1.8]] },
    tubeB: { o: [[26, 30, 102, 84, 0.6]], p: [[20, 22, 108, 28, 1.4], [24, 86, 104, 90, 0.55], [86, 92, 116, 110, 1.6], [0, 0, 128, 3, 0.3]] },
    office: { o: [[6, 14, 122, 112, 0.35]], p: [[0, 0, 128, 4, 0.25]] },
    officeB: { o: [[0, 30, 128, 86, 0.5]], p: [[0, 86, 128, 90, 0.4]] },
    shop: { o: [[8, 47, 120, 120, 0.65]], p: [[2, 30, 126, 45, 2.8], [4, 14, 124, 30, 0.4]] },
    shopB: { o: [[8, 42, 120, 120, 0.6]], p: [[4, 16, 124, 34, 0.4]] },
    adobe: { o: [[48, 40, 80, 74, 0.65]], p: [[44, 36, 84, 41, 0.7], [44, 74, 84, 78, 0.55]] },
    stone: { o: [[46, 38, 82, 78, 0.6]], p: [[44, 78, 84, 82, 0.4]] },
    wood: { o: [[40, 40, 88, 78, 0.55]], p: [[38, 38, 90, 42, 0.7], [38, 78, 90, 81, 0.45]] },
    hangarDoor: { o: [[6, 30, 122, 128, 0.6]], p: [[0, 23, 128, 30, 1.8]] },
    // sảnh cao ốc: vách kính lùi vào sau mặt trụ đá, dải ốp sẫm & bậc đá nhô ra
    lobby: { o: [[8, 22, 120, 118, 0.7]], p: [[0, 0, 128, 22, 0.9], [0, 118, 128, 128, 0.5]] },
    lobbyD: { o: [[8, 22, 120, 118, 0.9]], p: [[0, 0, 128, 22, 0.9], [0, 118, 128, 128, 0.5]] },
    lobbyU: { o: [[8, 22, 120, 128, 0.7]], p: [[0, 0, 128, 22, 0.9]] },
    lobbyL: { o: [[8, 0, 120, 118, 0.7]], p: [[0, 118, 128, 128, 0.5]] },
    lobbyLD: { o: [[8, 0, 120, 118, 0.9]], p: [[0, 118, 128, 128, 0.5]] }
  };
  function reliefPanelGeo(style) {
    const R = RELIEF[style];
    if (!R) return null;
    const key = '__relief_' + style;
    if (TEX[key]) return TEX[key];
    const P = [], N = [], U = [];
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    // 4 đỉnh + uv; tự lật thứ tự nếu pháp tuyến ngược hướng mong muốn n
    const quad = (a, b, c, d, n, ua, ub, uc, ud) => {
      const cr = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      let q = [[a, ua], [b, ub], [c, uc], [d, ud]];
      if (cr.dot(n) < 0) q = [q[0], q[3], q[2], q[1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { const [p, uv] = q[k]; P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); U.push(uv[0], uv[1]); }
    };
    const px = x => x / 128 - 0.5, py = y => 0.5 - y / 128;          // điểm ảnh -> toạ độ khối đơn vị
    const uvx = x => x / 128, uvy = y => 1 - y / 128;
    const at = (x, y) => [uvx(Math.max(1, Math.min(127, x))), uvy(Math.max(1, Math.min(127, y)))];
    const zF = 0.5;
    // 1) Mặt ngoài: chia lưới theo mép các ô lõm, bỏ ô nằm trong ô lõm
    const xs = new Set([0, 128]), ys = new Set([0, 128]);
    for (const o of R.o) { xs.add(o[0]); xs.add(o[2]); ys.add(o[1]); ys.add(o[3]); }
    const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
    const nF = V3(0, 0, 1);
    for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cy = (Y[j] + Y[j + 1]) / 2;
      if (R.o.some(o => cx > o[0] && cx < o[2] && cy > o[1] && cy < o[3])) continue;
      const x0 = X[i], x1 = X[i + 1], y0 = Y[j], y1 = Y[j + 1];
      quad(V3(px(x0), py(y1), zF), V3(px(x1), py(y1), zF), V3(px(x1), py(y0), zF), V3(px(x0), py(y0), zF), nF,
        [uvx(x0), uvy(y1)], [uvx(x1), uvy(y1)], [uvx(x1), uvy(y0)], [uvx(x0), uvy(y0)]);
    }
    // 2) Ô lõm: mặt kính / cửa lùi vào trong + 4 má cửa (màu tường sát mép ô)
    for (const [x0, y0, x1, y1, d] of R.o) {
      const zb = zF - d;
      quad(V3(px(x0), py(y1), zb), V3(px(x1), py(y1), zb), V3(px(x1), py(y0), zb), V3(px(x0), py(y0), zb), nF,
        [uvx(x0), uvy(y1)], [uvx(x1), uvy(y1)], [uvx(x1), uvy(y0)], [uvx(x0), uvy(y0)]);
      const sl = at(x0 - 2, (y0 + y1) / 2), sr = at(x1 + 2, (y0 + y1) / 2), st = at((x0 + x1) / 2, y0 - 2), sb = at((x0 + x1) / 2, y1 + 2);
      quad(V3(px(x0), py(y0), zF), V3(px(x0), py(y1), zF), V3(px(x0), py(y1), zb), V3(px(x0), py(y0), zb), V3(1, 0, 0), sl, sl, sl, sl);
      quad(V3(px(x1), py(y0), zF), V3(px(x1), py(y1), zF), V3(px(x1), py(y1), zb), V3(px(x1), py(y0), zb), V3(-1, 0, 0), sr, sr, sr, sr);
      quad(V3(px(x0), py(y0), zF), V3(px(x1), py(y0), zF), V3(px(x1), py(y0), zb), V3(px(x0), py(y0), zb), V3(0, -1, 0), st, st, st, st);
      quad(V3(px(x0), py(y1), zF), V3(px(x1), py(y1), zF), V3(px(x1), py(y1), zb), V3(px(x0), py(y1), zb), V3(0, 1, 0), sb, sb, sb, sb);
    }
    // 3) Phần nhô: bậu cửa, ô văng, gờ tầng, mép sàn ban công, mái hiên, biển hiệu, cục nóng điều hoà
    for (const [x0, y0, x1, y1, d] of R.p) {
      const zo = zF + d, c = at((x0 + x1) / 2, (y0 + y1) / 2);
      quad(V3(px(x0), py(y1), zo), V3(px(x1), py(y1), zo), V3(px(x1), py(y0), zo), V3(px(x0), py(y0), zo), nF,
        [uvx(x0), uvy(y1)], [uvx(x1), uvy(y1)], [uvx(x1), uvy(y0)], [uvx(x0), uvy(y0)]);
      quad(V3(px(x0), py(y0), zF), V3(px(x1), py(y0), zF), V3(px(x1), py(y0), zo), V3(px(x0), py(y0), zo), V3(0, 1, 0), c, c, c, c);
      quad(V3(px(x0), py(y1), zF), V3(px(x1), py(y1), zF), V3(px(x1), py(y1), zo), V3(px(x0), py(y1), zo), V3(0, -1, 0), c, c, c, c);
      quad(V3(px(x0), py(y0), zF), V3(px(x0), py(y1), zF), V3(px(x0), py(y1), zo), V3(px(x0), py(y0), zo), V3(-1, 0, 0), c, c, c, c);
      quad(V3(px(x1), py(y0), zF), V3(px(x1), py(y1), zF), V3(px(x1), py(y1), zo), V3(px(x1), py(y0), zo), V3(1, 0, 0), c, c, c, c);
    }
    // 4) Mặt trong nhà, 2 cạnh bên, đỉnh, đáy: như khối hộp cũ
    const nB = V3(0, 0, -1);
    quad(V3(0.5, -0.5, -0.5), V3(-0.5, -0.5, -0.5), V3(-0.5, 0.5, -0.5), V3(0.5, 0.5, -0.5), nB, [0, 0], [1, 0], [1, 1], [0, 1]);
    const se = at(2, 64);
    quad(V3(-0.5, -0.5, -0.5), V3(-0.5, -0.5, 0.5), V3(-0.5, 0.5, 0.5), V3(-0.5, 0.5, -0.5), V3(-1, 0, 0), se, se, se, se);
    quad(V3(0.5, -0.5, 0.5), V3(0.5, -0.5, -0.5), V3(0.5, 0.5, -0.5), V3(0.5, 0.5, 0.5), V3(1, 0, 0), se, se, se, se);
    quad(V3(-0.5, 0.5, 0.5), V3(0.5, 0.5, 0.5), V3(0.5, 0.5, -0.5), V3(-0.5, 0.5, -0.5), V3(0, 1, 0), se, se, se, se);
    quad(V3(-0.5, -0.5, -0.5), V3(0.5, -0.5, -0.5), V3(0.5, -0.5, 0.5), V3(-0.5, -0.5, 0.5), V3(0, -1, 0), se, se, se, se);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    TEX[key] = g;
    return g;
  }
  // Phong hoá theo toạ độ thế giới phủ lên mặt tường: mọi khoang dùng chung 1 ảnh nên mặt nhà lặp đều như giấy dán tường ->
  // tính thêm trong shader (nhiễu giá trị 2D, không tốn texture), mỗi chỗ trên mặt nhà một kiểu:
  //  · loang ẩm / phai nắng cỡ lớn, ngả vàng ố hoặc bạc màu
  //  · vệt nước mưa chảy dọc liền qua nhiều tầng, dày & đậm hơn ngay dưới mép mái; dải bẩn sát mép mái
  //  · chân tường ngấm ẩm (mép trên lượn sóng, vệt muối trắng ở mép), bùn hắt sát đất, rêu xanh bám chỗ ẩm
  //  · vữa tô bong từng mảng lộ gạch / bê tông bên dưới, mép mảng sẫm (chỉ trên nền tường sáng, không ăn vào kính)
  //  · gỉ sét loang & chảy vệt trên tôn
  // Độ cao so với chân / đỉnh nhà lấy từ ảnh lưới thông tin nhà (BuildingSet.grimeInfo); ngoài nhà (mảnh văng) bỏ qua phần đó.
  // opt: peel (bong vữa) · moss (rêu) · rust (gỉ) · peelA / peelB (màu lớp lộ ra) · U (uniform dùng chung: ảnh lưới nhà)
  // (băm không dùng sin: rẻ hơn trên GPU yếu, không mất chính xác ở toạ độ lớn)
  // Ảnh lưới thông tin nhà dùng chung (một bộ cho cả bản đồ): chân / đỉnh tường (uBld) cho phong hoá, độ che khuất
  // quanh chân nhà đã làm mờ (uBldOcc) cho mặt đất tối dần sát tường (GroundShader). Đổi bản đồ -> BuildingSet mới ghi đè
  const BLD_INFO = { uBld: { value: null }, uBldGrid: { value: new THREE.Vector4(0, 0, 0, 0) }, uBldOcc: { value: null }, uBldEdge: { value: null } };
  const GRIME_GLSL = `
    float gHash(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }
    float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.03 + 5.1) * 0.3 + gNoise(p * 4.1 + 9.7) * 0.15; }
    float gDec(vec2 v) { return (v.x * 65280.0 + v.y * 255.0) * 0.25 - 1024.0; }`;
  function facadeGrime(mat, amt = 1, opt = {}) {
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    const U = opt.U || { uBld: { value: null }, uBldGrid: { value: new THREE.Vector4(0, 0, 0, 0) } };
    const NL = String.fromCharCode(10);
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, {
        uGrime: { value: amt }, uPeel: { value: opt.peel || 0 }, uMoss: { value: opt.moss === undefined ? 0.6 : opt.moss }, uRust: { value: opt.rust || 0 },
        uPeelA: { value: new THREE.Color(...(opt.peelA || [0.3, 0.17, 0.12])) }, uPeelB: { value: new THREE.Color(...(opt.peelB || [0.36, 0.35, 0.32])) },
        uBld: U.uBld, uBldGrid: U.uBldGrid, uBldEdge: U.uBldEdge || { value: null }
      });
      sh.vertexShader = 'varying vec3 vGrimeW;' + NL + 'varying vec3 vGrimeN;' + NL + sh.vertexShader.replace('#include <project_vertex>',
        `#include <project_vertex>
        vec4 gw = vec4(transformed, 1.0);
        vec3 gn = objectNormal;
        #ifdef USE_INSTANCING
          gw = instanceMatrix * gw;
          gn = mat3(instanceMatrix) * gn;
        #endif
        vGrimeW = (modelMatrix * gw).xyz;
        vGrimeN = normalize(mat3(modelMatrix) * gn);`);
      sh.fragmentShader = ['varying vec3 vGrimeW;', 'varying vec3 vGrimeN;', 'float gAOk = 1.0;', 'uniform float uGrime, uPeel, uMoss, uRust;', 'uniform vec3 uPeelA, uPeelB;',
        'uniform sampler2D uBld, uBldEdge;', 'uniform vec4 uBldGrid;', GRIME_GLSL, ''].join(NL) +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 gN = normalize(vGrimeN);
          // toạ độ ngang dọc theo mặt tường (theo pháp tuyến -> vệt dọc đúng mọi hướng nhà); mặt nằm ngang dùng x + z
          vec2 gT = normalize(vec2(-gN.z, gN.x) + vec2(1e-4, 0.0));
          float wall = 1.0 - smoothstep(0.5, 0.85, abs(gN.y));
          float hx = mix(vGrimeW.x + vGrimeW.z, dot(vGrimeW.xz, gT), wall), y = vGrimeW.y;
          // chân / đỉnh nhà tại chỗ này (đơn vị thế giới, 8 = 1 m); ngoài nhà -> không tính phần theo độ cao
          float hb = 1e4, ht = 1e4, inB = 0.0;
          if (uBldGrid.z > 0.0) {
            vec2 bu = (vGrimeW.xz - uBldGrid.xy) * uBldGrid.zw;
            if (bu.x > 0.0 && bu.y > 0.0 && bu.x < 1.0 && bu.y < 1.0) {
              vec4 bi = texture2D(uBld, bu);
              float by = gDec(bi.rg), ty = gDec(bi.ba);
              if (by > -1000.0) { inB = 1.0; hb = y - by; ht = ty - y; }
            }
          }
          vec3 gc = diffuseColor.rgb;
          float lum = dot(gc, vec3(0.3, 0.59, 0.11));
          float base = 1.0;
          #ifdef USE_MAP
            base = dot(texelColor.rgb, vec3(0.3, 0.59, 0.11));
          #endif
          // cao ốc (~8 tầng trở lên): được bảo trì, sơn lại -> ít bong vữa lộ gạch, vệt mưa nhạt hơn nhà phố cũ
          float gTall = inB * smoothstep(170.0, 340.0, hb + ht);
          // 1) loang lớn: chỗ ẩm sẫm ngả nâu, chỗ phơi nắng bạc màu
          float gPatch = gFbm(vec2(hx * 0.016, y * 0.02));
          float dark = smoothstep(0.45, 0.8, gPatch), bleach = smoothstep(0.5, 0.2, gPatch);
          gc *= mix(vec3(1.0), vec3(0.8, 0.76, 0.69), dark * 0.85);
          gc = mix(gc, vec3(lum) * 1.06, bleach * 0.28);
          // 2) vệt mưa chảy dọc: vệt to mờ + vệt mảnh sắc, đậm hơn dưới mép mái, đứt quãng theo chiều cao
          float topW = mix(0.75, 0.45 + 0.75 * exp(-ht / 70.0), inB);
          float sBig = smoothstep(0.6, 0.86, gNoise(vec2(hx * 0.13, y * 0.006 + 3.0)));
          float sFine = smoothstep(0.7, 0.9, gNoise(vec2(hx * 0.55 + 11.0, y * 0.018)));
          float sBreak = smoothstep(0.25, 0.6, gNoise(vec2(hx * 0.13 + 2.0, y * 0.03)));
          float streak = clamp((sBig * 0.85 + sFine * (0.55 - 0.3 * gTall)) * sBreak, 0.0, 1.0) * topW * wall * (1.0 - 0.4 * gTall);
          gc = mix(gc, gc * vec3(0.5, 0.48, 0.44), streak * 0.75);
          // 3) dải bẩn ngay dưới mép mái (bụi mái dồn xuống theo nước mưa)
          float topBand = (1.0 - smoothstep(0.0, 26.0, ht)) * inB * wall * (0.6 + 0.4 * gNoise(vec2(hx * 0.08, 1.7)));
          gc *= 1.0 - 0.28 * topBand;
          // 4) chân tường: chỉ tác động trên mặt đất (hb >= 0), vệt bụi cát nhẹ sát đất, không đen lem nhem
          float inGround = inB * step(0.0, hb);
          float edge = 1.6 + 2.2 * gFbm(vec2(hx * 0.06, 2.3));
          float damp = (1.0 - smoothstep(max(0.0, edge - 1.2), edge + 0.6, hb)) * inGround;
          float salt = exp(-pow((hb - edge) / 0.8, 2.0)) * inGround * wall;
          float splash = (1.0 - smoothstep(0.0, 1.6 + 1.2 * gNoise(vec2(hx * 0.35, 0.0)), hb)) * inGround;
          gc = mix(gc, gc * vec3(0.8, 0.77, 0.72), damp * 0.6);
          gc = mix(gc, vec3(0.86, 0.84, 0.8) * max(lum, 0.45), salt * 0.18);
          vec3 sandDust = mix(vec3(0.72, 0.65, 0.54), gc * 0.85, 0.4);
          gc = mix(gc, sandDust, splash * 0.35);
          // 5) rêu / tảo xanh sẫm bám chỗ ẩm: chân tường, theo vệt nước, mặt nằm ngang
          float mossN = gFbm(vec2(hx * 0.09 + 4.0, y * 0.09));
          float moss = smoothstep(0.48, 0.76, mossN) * (damp * 0.5 + streak * 0.25 + (1.0 - wall) * 0.25 * smoothstep(0.6, 0.85, gPatch)) * uMoss;
          gc = mix(gc, vec3(0.3, 0.33, 0.22) * (0.65 + 0.5 * lum), clamp(moss, 0.0, 1.0) * 0.4);
          // 6) MÁI BẰNG / sân thượng (mặt ngửa phía trên tầng cao nhất): không còn sạch bong như mới đổ — bụi loang, vũng nước đọng
          //    chỗ trũng (lòng vũng sẫm ẩm, vành cặn bùn khô), tảo đen lấm tấm, dải đất bụi + rêu dồn chân tường chắn mái (gió
          //    cuốn bụi, nước mưa đọng mép), cỏ dại mọc trong dải đất
          float roofK = inB * smoothstep(0.7, 0.9, gN.y) * (1.0 - step(1.0, ht));
          if (roofK > 0.0) {
            vec2 rw = vGrimeW.xz;
            float ed = 64.0;
            if (uBldGrid.z > 0.0) ed = texture2D(uBldEdge, (rw - uBldGrid.xy) * uBldGrid.zw).r * 64.0;
            float rn = gFbm(rw * 0.03);
            gc *= mix(1.0, 0.76, smoothstep(0.35, 0.78, rn) * roofK);
            float pn = gFbm(rw * 0.034 + 7.3) + 0.06 * gNoise(rw * 0.35);
            float pond = smoothstep(0.655, 0.67, pn) * roofK, ring = smoothstep(0.6, 0.65, pn) * roofK - pond;
            gc = mix(gc, gc * vec3(0.62, 0.64, 0.58) * (1.0 - 0.25 * smoothstep(0.68, 0.74, pn)), pond * 0.85);
            gc = mix(gc, vec3(0.55, 0.5, 0.41) * max(lum, 0.32) * 1.7, max(ring, 0.0) * 0.5);
            float alg = smoothstep(0.62, 0.82, gFbm(rw * 0.08 + 3.1)) * roofK;
            gc = mix(gc, vec3(0.11, 0.12, 0.08), alg * 0.4 * uMoss);
            // dải đất sát tường chắn (bỏ mặt nóc tường chắn: thấp hơn đỉnh nhà > 6 đv), rộng hẹp theo nhiễu, góc nhà dày hơn
            float bw = 7.0 + 15.0 * gFbm(rw * 0.05 + 11.0);
            float band = (1.0 - smoothstep(bw * 0.45, bw, ed - 1.4)) * step(-6.0, ht) * roofK;
            vec3 soil = mix(vec3(0.26, 0.21, 0.15), vec3(0.19, 0.25, 0.12), smoothstep(0.4, 0.7, gNoise(rw * 0.12 + 5.0)) * uMoss);
            gc = mix(gc, soil * (0.75 + 0.45 * gNoise(rw * 0.6)), band * 0.9);
            float weed = smoothstep(0.8, 0.86, gNoise(rw * 0.9 + 2.0)) * smoothstep(0.45, 0.7, gNoise(rw * 0.15)) * band;
            gc = mix(gc, vec3(0.2, 0.29, 0.1), weed * 0.85 * max(uMoss, 0.3));
          }
          // 7) bong vữa: mảng mép sắc, nhiều hơn ở chỗ ẩm (chân tường, dưới mái); chỉ trên nền tường sáng
          if (uPeel > 0.0) {
            float pn = gFbm(vec2(hx * 0.06 + 13.0, y * 0.075)) + gNoise(vec2(hx * 0.4, y * 0.4)) * 0.08;
            float thr = 0.8 - 0.07 * damp - 0.04 * topBand + 0.04 * (1.0 - uPeel) + 0.07 * gTall;
            float plaster = smoothstep(0.42, 0.55, base) * wall;
            float hole = smoothstep(thr, thr + 0.012, pn) * plaster;
            float rim = (smoothstep(thr - 0.035, thr, pn) - hole) * plaster;
            // lớp lộ ra: gạch (có mạch vữa) hoặc vữa lót xám, nhuộm theo màu tường cũ cho đỡ chói
            float brick = smoothstep(0.55, 0.7, gNoise(vec2(hx * 0.02 + 7.0, y * 0.02)));
            vec2 bc = vec2(hx / 1.9 + step(0.5, fract(y / 1.3)) * 0.5, y / 0.65);
            float joint = max(step(0.86, fract(bc.x)), step(0.8, fract(bc.y)));
            vec3 under = mix(uPeelB, uPeelA * (1.0 - 0.45 * joint), brick);
            under *= (0.8 + 0.35 * gNoise(vec2(hx * 0.9, y * 0.9))) * mix(vec3(1.0), gc / max(lum, 0.2), 0.25);
            gc *= 1.0 - 0.3 * rim * uPeel;
            gc = mix(gc, under, hole * min(1.0, uPeel * 1.3));
          }
          // 8) gỉ sét trên tôn: loang thành mảng + chảy vệt xuống
          if (uRust > 0.0) {
            float rp = smoothstep(0.6, 0.82, gFbm(vec2(hx * 0.05 + 21.0, y * 0.05)));
            float rs = smoothstep(0.62, 0.88, gNoise(vec2(hx * 0.35 + 5.0, y * 0.01))) * sBreak;
            float rust = clamp(rp * 0.8 + rs * 0.6 + damp * 0.4, 0.0, 1.0) * uRust;
            gc = mix(gc, vec3(0.34, 0.17, 0.07) * (0.7 + 0.5 * gNoise(vec2(hx * 0.7, y * 0.7))), rust * 0.55);
          }
          // 9) cao ốc: chân đế ốp đá granite xám sẫm cao ~0,9 m, tấm đá 1,2 x 0,45 m (không phủ lên kính cửa)
          diffuseColor.rgb = mix(diffuseColor.rgb, gc, uGrime);
          if (gTall > 0.0 && inGround > 0.0 && hb < 8.0) {
            float pl = (1.0 - smoothstep(7.0, 7.5, hb)) * wall * smoothstep(0.28, 0.42, base) * gTall;
            vec2 sj = vec2(hx / 9.6, hb / 3.6);
            float jt = max(step(0.97, fract(sj.x)), step(0.94, fract(sj.y)));
            vec3 gran = vec3(0.3, 0.29, 0.28) * (0.82 + 0.3 * gNoise(vec2(hx * 0.8, y * 0.8)) + 0.12 * gHash(floor(sj))) * (1.0 - 0.4 * jt);
            diffuseColor.rgb = mix(diffuseColor.rgb, gran, pl);
          }
          // che khuất ánh trời sát chân tường (tiếp giáp chân tường - đất, chỉ giảm nhẹ góc hẹp sát đất)
          gAOk = mix(1.0, mix(0.55, 1.0, smoothstep(0.0, 12.0, max(0.0, hb))), inGround * wall);   // (~1,2 m sát đất khuất trời)
        }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= gAOk;`);
    };
    mat.customProgramCacheKey = () => (key ? key() : '') + '|grime4';
    return mat;
  }
  // Mái ngói / tôn / mái bằng: rêu & địa y loang thành đám, vệt nước sẫm chảy theo dốc mái (trục v của uv), tôn gỉ vệt
  function roofGrime(mat, opt = {}) {
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    const NL = String.fromCharCode(10);
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.uRust = { value: opt.rust || 0 };
      sh.vertexShader = 'varying vec3 vGrimeW;' + NL + sh.vertexShader.replace('#include <project_vertex>',
        `#include <project_vertex>
        vec4 gw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gw = instanceMatrix * gw;
        #endif
        vGrimeW = (modelMatrix * gw).xyz;`);
      sh.fragmentShader = ['varying vec3 vGrimeW;', 'uniform float uRust;', GRIME_GLSL, ''].join(NL) +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 w = vGrimeW.xz;
          vec3 gc = diffuseColor.rgb;
          float lum = dot(gc, vec3(0.3, 0.59, 0.11));
          float patchN = gFbm(w * 0.02);
          gc *= mix(1.0, 0.72, smoothstep(0.45, 0.8, patchN));
          #ifdef USE_UV
            // vệt chảy theo dốc: tần số cao dọc sống mái (u), thấp theo dốc (v)
            float st = smoothstep(0.6, 0.88, gNoise(vec2(vUv.x * 9.0, vUv.y * 0.6 + 3.0)));
            gc *= 1.0 - 0.35 * st;
            // mái đã qua nhiều lần dặm vá: ô viên ngói theo đúng lưới roofTileTex (8 viên ngang / ảnh, hàng 10 px so le), mỗi
            // nhà một dãy số (băm theo ô 50 m) — cụm ngói thay mới đỏ cam chưa rêu, viên lệch tông, viên trượt / vỡ hở lớp
            // lati tối bên dưới. Mái tôn: vài tấm tôn thay mới sáng hơn, ít gỉ
            vec2 rB = floor(vGrimeW.xz / 400.0) * 7.31;
            float rFresh = 0.0;
            if (uRust < 0.5) {
              float fv = fract(vUv.y), rowT = (1.0 - fv) * 12.8, row = floor(rowT) + floor(vUv.y) * 13.0;
              float even = 1.0 - mod(floor(rowT), 2.0);
              vec2 cell = vec2(floor(vUv.x * 8.0 - 0.5 * even), row) + rB;
              float th = gHash(cell + 0.37), tp = gHash(floor(cell / vec2(3.0, 2.0)) + 19.1);
              rFresh = step(tp, 0.028) * step(0.15, th);
              // cùng loại ngói với mái (theo màu gốc chưa phủ bẩn), chỉ sạch & ấm hơn — không đỏ cam chói như miếng dán
              gc = mix(gc, diffuseColor.rgb * vec3(1.18, 1.02, 0.92) * (0.9 + 0.2 * th), rFresh * 0.7);
              gc *= mix(1.0, 0.72 + 0.5 * gHash(cell + 3.3), step(0.9, th) * (1.0 - rFresh));
              // viên trượt: hở nửa dưới viên (bóng sẫm + lati gỗ)
              float slip = step(0.992, gHash(cell + 8.8)) * step(fract(rowT), 0.55);
              gc = mix(gc, vec3(0.07, 0.055, 0.045), slip);
            } else {
              float sh = gHash(vec2(floor(vUv.x * 4.0), 1.0) + rB);
              rFresh = step(sh, 0.09);
              gc = mix(gc, gc * 1.25 + vec3(0.03), rFresh * 0.7);
            }
          #else
            float rFresh = 0.0;
            float st = 0.0;
          #endif
          float mossN = gFbm(w * 0.05 + 3.0);
          float moss = smoothstep(0.5, 0.75, mossN) * (1.0 - uRust) * (1.0 - 0.8 * rFresh);
          float lichen = smoothstep(0.8, 0.84, gNoise(w * 0.45 + 8.0)) * (1.0 - uRust) * (1.0 - rFresh);
          gc = mix(gc, vec3(0.15, 0.18, 0.09) * (0.6 + 0.6 * lum), moss * 0.6);
          gc = mix(gc, gc * vec3(0.95, 1.0, 0.7) + vec3(0.04, 0.05, 0.0), lichen * 0.5);
          if (uRust > 0.0) {
            float rust = clamp(smoothstep(0.6, 0.82, gFbm(w * 0.04 + 17.0)) + st * 0.6, 0.0, 1.0) * uRust * (1.0 - 0.75 * rFresh);
            gc = mix(gc, vec3(0.34, 0.17, 0.07) * (0.7 + 0.5 * gNoise(w * 0.6)), rust * 0.5);
          }
          diffuseColor.rgb = gc;
        }`);
    };
    mat.customProgramCacheKey = () => (key ? key() : '') + '|rgrime';
    return mat;
  }
  // Normal map + roughness map dựng từ chính ảnh mặt tiền: mạch gạch / đá / ván gỗ / sóng tôn / hạt vữa nổi gồ dưới nắng;
  // kính cửa bóng (nhám thấp), tường tô nhám
  function panelSurfaceMaps(style) {
    const key = '__surf_' + style;
    if (TEX[key] !== undefined) return TEX[key];
    const src = windowPanelTex(style);
    if (!src || !src.image || typeof document === 'undefined') return (TEX[key] = null);
    const S = 128, img = src.image.getContext('2d').getImageData(0, 0, S, S).data;
    const L = new Float32Array(S * S), glass = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
      L[i] = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      // kính: tối và ngả xanh xám
      glass[i] = (L[i] < 0.38 && b >= r - 4) ? 1 : 0;
    }
    const k = { stone: 2.6, wood: 2.2, metal: 2.4, side: 1.8, adobe: 1.6, office: 0.6, officeB: 1.0 }[style] || 1.3;
    const nC = document.createElement('canvas'); nC.width = nC.height = S;
    const rC = document.createElement('canvas'); rC.width = rC.height = S;
    const nI = nC.getContext('2d').createImageData(S, S), rI = rC.getContext('2d').createImageData(S, S);
    const h = (x, y) => L[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1), q = (y * S + x) * 4;
      // tối = lõm (mạch vữa, khe ván): pháp tuyến nghiêng ra khỏi chỗ tối; y ảnh hướng xuống -> đảo dấu thành phần g
      nI.data[q] = (-dx / l * 0.5 + 0.5) * 255; nI.data[q + 1] = (dy / l * 0.5 + 0.5) * 255; nI.data[q + 2] = (1 / l * 0.5 + 0.5) * 255; nI.data[q + 3] = 255;
      const gl = glass[y * S + x];
      const rough = gl ? 0.28 : 0.82 + 0.18 * (1 - L[y * S + x]);
      rI.data[q] = 0; rI.data[q + 1] = rough * 255; rI.data[q + 2] = 0; rI.data[q + 3] = 255;
    }
    nC.getContext('2d').putImageData(nI, 0, 0); rC.getContext('2d').putImageData(rI, 0, 0);
    const nT = new THREE.CanvasTexture(nC), rT = new THREE.CanvasTexture(rC);
    nT.anisotropy = rT.anisotropy = 4;
    return (TEX[key] = { normal: nT, rough: rT });
  }
  // ===========================================================================
  // KÍNH CỬA SỔ: trước đây mọi ô kính cả thành phố cùng một màu xanh đen phẳng (không có envMap -> kính không soi gì),
  // cao ốc trông như khối hộp dán giấy. Giờ trong shader của mảng tường nguyên:
  //  · kính soi bầu trời theo góc nhìn (Fresnel: nhìn xiên thấy trời sáng, nhìn thẳng thấy vào trong phòng), tầng thấp soi
  //    lại đường chân trời các khối nhà xa; mỗi ô kính cong vênh một chút nên ảnh phản chiếu lệch nhau từng ô
  //  · sau kính mỗi cửa một kiểu: rèm vải nhiều màu kéo kín / kéo hé / rèm voan / phòng tối (nhà ở), rèm sáo kéo xuống các
  //    mức khác nhau + đèn trần văn phòng, cửa hàng sáng đèn
  // Ô cửa theo ảnh mặt tiền 128x128 [x, y, rộng, cao] (px), panes: số ô kính ngang mỗi cửa, kind: 0 nhà ở / 1 văn phòng /
  // 2 cửa hàng, f0: độ phản xạ nhìn thẳng (kính phản quang văn phòng cao hơn kính trong nhà ở), wob: độ vênh ô kính
  // ===========================================================================
  const GLASS = {
    office: { win: [[6, 14, 116, 98]], panes: 2, kind: 1, f0: 0.2, wob: 0.07 },
    officeB: { win: [[0, 33, 128, 52]], panes: 3, kind: 1, f0: 0.12, wob: 0.05 },
    apt: { win: [[38, 34, 52, 46]], panes: 2, kind: 0, f0: 0.06, wob: 0.04 },
    aptB: { win: [[28, 28, 30, 74], [64, 32, 38, 46]], panes: 1, kind: 0, f0: 0.06, wob: 0.04 },
    tube: { win: [[33, 26, 62, 76]], panes: 4, kind: 0, f0: 0.06, wob: 0.04 },
    tubeB: { win: [[29, 33, 70, 48]], panes: 2, kind: 0, f0: 0.06, wob: 0.04 },
    shop: { win: [[11, 50, 106, 68]], panes: 3, kind: 2, f0: 0.08, wob: 0.03 },
    lobby: { win: [[11, 26, 106, 90]], panes: 2, kind: 3, f0: 0.1, wob: 0.03 },
    lobbyD: { win: [[11, 26, 106, 90]], panes: 4, kind: 3, f0: 0.1, wob: 0.03 },
    lobbyU: { win: [[11, 26, 106, 102]], panes: 2, kind: 3, f0: 0.1, wob: 0.03 },
    lobbyL: { win: [[11, 4, 106, 112]], panes: 2, kind: 3, f0: 0.1, wob: 0.03 },
    lobbyLD: { win: [[11, 4, 106, 112]], panes: 4, kind: 3, f0: 0.1, wob: 0.03 }
  };
  // Ảnh thông tin ô kính (cùng uv với ảnh mặt tiền): r = số thứ tự cửa x 50, g / b = toạ độ ngang / dọc trong cửa, a = có kính.
  // Dùng DataTexture (không qua canvas: canvas nhân alpha làm hỏng số) có mipmap -> ở xa chia r / g / b cho a vẫn ra đúng số
  function winInfoTex(style) {
    const key = '__wininfo_' + style;
    if (TEX[key] !== undefined) return TEX[key];
    const G = GLASS[style], src = windowPanelTex(style);
    if (!G || !src || !src.image || typeof document === 'undefined') return (TEX[key] = null);
    const S = 128, img = src.image.getContext('2d').getImageData(0, 0, S, S).data, d = new Uint8Array(S * S * 4);
    G.win.forEach(([x0, y0, w, h], k) => {
      for (let y = y0; y < Math.min(S, y0 + h); y++) for (let x = x0; x < Math.min(S, x0 + w); x++) {
        const i = (y * S + x) * 4, r = img[i], g = img[i + 1], b = img[i + 2];
        // chỉ phần kính tối ngả xanh xám (bỏ đố nhôm, khung sáng, bậu cửa)
        if ((0.3 * r + 0.59 * g + 0.11 * b) / 255 > 0.55 || b < r - 6) continue;
        // ảnh canvas gốc trên-trái, DataTexture gốc dưới-trái (flipY = false) -> lật hàng cho khớp uv
        const q = ((S - 1 - y) * S + x) * 4;
        d[q] = (k + 1) * 50; d[q + 1] = Math.round((x - x0 + 0.5) / w * 255); d[q + 2] = Math.round((y - y0 + 0.5) / h * 255); d[q + 3] = 255;
      }
    });
    const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return (TEX[key] = t);
  }
  // BIỂN HIỆU CỬA HÀNG (phố bỏ hoang): atlas 2 x 8 mẫu biển chữ (bảng hiệu nền màu đã phai nắng, chữ tróc mất từng nét,
  // vệt gỉ chảy từ mép trên, ố bụi, góc bong). Mỗi biển chọn 1 mẫu theo vị trí (shader signVariant), nhuộm lệch màu nhẹ
  const SIGN_TEXT = [['PHARMACY', 'OPEN 24H'], ['MINI MART', 'FOOD · DRINKS'], ['HOTEL', 'ROOMS AVAILABLE'], ['CAFE', 'COFFEE & TEA'],
    ['NOODLE HOUSE', 'TEL 0283 551 207'], ['PHONE REPAIR', 'SIM · CARDS'], ['BAKERY', 'FRESH BREAD'], ['HARDWARE', 'TOOLS · PAINT'],
    ['TAILOR', 'SUITS · DRESSES'], ['DENTAL CLINIC', 'TEL 0283 908 114'], ['GOLD & JEWELRY', ''], ['MOTOR PARTS', 'REPAIR · TYRES'],
    ['RESTAURANT', 'SEAFOOD'], ['BOOKSTORE', 'STATIONERY'], ['KARAOKE', 'VIP ROOMS'], ['ELECTRONICS', 'TV · AUDIO · PHONE']];
  const SIGN_BG = [['#b8322a', '#f2e6c8'], ['#2c5d9e', '#f4f1e6'], ['#e8c23a', '#3a2a18'], ['#f0ece2', '#b0261e'], ['#2f7a4a', '#f4f0e0'],
    ['#d86a24', '#fff6e0'], ['#5a2a6e', '#f6d860'], ['#1e1e22', '#e8c84a']];
  function signTex() {
    return canvasTex('shopSigns', 1024, 1024, (g, w, h) => {
      const cw = w / 2, ch = h / 8;
      for (let k = 0; k < 16; k++) {
        const x0 = (k % 2) * cw, y0 = Math.floor(k / 2) * ch, [bg, fg] = SIGN_BG[(k * 5 + 3) % SIGN_BG.length], [t1, t2] = SIGN_TEXT[k];
        g.save(); g.beginPath(); g.rect(x0, y0, cw, ch); g.clip();
        g.fillStyle = bg; g.fillRect(x0, y0, cw, ch);
        // phai nắng: nửa trên bạc hơn
        const fade = g.createLinearGradient(0, y0, 0, y0 + ch);
        fade.addColorStop(0, 'rgba(235,230,215,0.35)'); fade.addColorStop(1, 'rgba(235,230,215,0.08)');
        g.fillStyle = fade; g.fillRect(x0, y0, cw, ch);
        g.strokeStyle = 'rgba(30,28,24,0.6)'; g.lineWidth = 6; g.strokeRect(x0 + 3, y0 + 3, cw - 6, ch - 6);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        let fs = 64; g.font = `bold ${fs}px Arial, sans-serif`;
        while (g.measureText(t1).width > cw - 50 && fs > 30) { fs -= 4; g.font = `bold ${fs}px Arial, sans-serif`; }
        g.fillText(t1, x0 + cw / 2, y0 + ch * (t2 ? 0.4 : 0.52));
        if (t2) { g.font = 'bold 24px Arial, sans-serif'; g.fillText(t2, x0 + cw / 2, y0 + ch * 0.8); }
        // chữ tróc: mảng nền đè lên vài nét chữ
        for (let i = 0; i < 7; i++) { g.fillStyle = bg; g.globalAlpha = 0.85; g.fillRect(x0 + 30 + RNG() * (cw - 60), y0 + 20 + RNG() * (ch - 40), 6 + RNG() * 22, 4 + RNG() * 16); }
        g.globalAlpha = 1;
        // vệt gỉ chảy từ mép trên, ố bụi, mảng sơn bong lộ tôn xám
        for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${90 + RNG() * 40 | 0},${48 + RNG() * 20 | 0},24,${0.25 + RNG() * 0.3})`; g.fillRect(x0 + RNG() * cw, y0, 2 + RNG() * 4, 10 + RNG() * ch * 0.8); }
        for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(140,140,136,0.75)'; g.beginPath(); g.ellipse(x0 + RNG() * cw, y0 + RNG() * ch, 6 + RNG() * 26, 4 + RNG() * 14, RNG() * 3, 0, 6.283); g.fill(); }
        const dirt = g.createLinearGradient(0, y0 + ch * 0.6, 0, y0 + ch);
        dirt.addColorStop(0, 'rgba(60,52,40,0)'); dirt.addColorStop(1, 'rgba(60,52,40,0.35)');
        g.fillStyle = dirt; g.fillRect(x0, y0, cw, ch);
        g.restore();
      }
    });
  }
  function signMaterial() {
    const m = new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.72, metalness: 0.1 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #if defined( USE_UV ) && defined( USE_INSTANCING )
        {
          vec3 sp = floor(instanceMatrix[3].xyz * 0.5 + 0.5);
          float id = floor(fract(sin(dot(sp.xz, vec2(12.9898, 78.233)) + sp.y * 0.37) * 43758.5453) * 16.0);
          vUv = (vUv + vec2(mod(id, 2.0), 7.0 - floor(id / 2.0))) / vec2(2.0, 8.0);
        }
        #endif`);
    };
    m.customProgramCacheKey = () => 'shopSign1';
    return m;
  }
  function facadeGlass(mat, style) {
    const G = GLASS[style], info = G && winInfoTex(style);
    if (!info) return mat;
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    const NL = String.fromCharCode(10);
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, { uWinInfo: { value: info }, uGlassP: { value: new THREE.Vector4(G.panes, G.kind, 0, 0) }, uGlassF: { value: new THREE.Vector4(G.f0, G.wob, 0, 0) } });
      sh.vertexShader = 'varying vec3 vWinSeed;' + NL + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWinSeed = instanceMatrix[3].xyz;
        #else
          vWinSeed = vec3(0.0);
        #endif`);
      sh.fragmentShader = ['varying vec3 vWinSeed;', 'uniform sampler2D uWinInfo;', 'uniform vec4 uGlassP, uGlassF;',
        'float wHash(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }', ''].join(NL) +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float wGlass = 0.0, wPaneH = 0.5, wPaneV = 0.5;
        #ifdef USE_UV
        {
          vec4 wi = texture2D(uWinInfo, vUv);
          if (wi.a > 0.02) {
            float cov = wi.a, wk = floor(wi.r / cov * 5.1 + 0.5);
            float wu = clamp(wi.g / cov, 0.0, 1.0), wv = clamp(wi.b / cov, 0.0, 1.0);
            float pane = min(floor(wu * uGlassP.x), uGlassP.x - 1.0);
            // chi tiết mảnh (nếp rèm, nan rèm sáo, đèn trần) nhạt dần khi ô cửa nhỏ trên màn hình -> không nhiễu hạt ở xa
            float aaU = 1.0 - smoothstep(0.02, 0.05, fwidth(wu)), aaV = 1.0 - smoothstep(0.01, 0.02, fwidth(wv));
            // làm tròn tâm mảng tường trước khi băm: sai số nội suy varying (~1e-5) bị hàm băm khuếch đại thành nhiễu hạt
            vec3 sd = floor(vWinSeed * 4.0 + 0.5) * vec3(0.0371, 0.0173, 0.0291);
            float hW = wHash(sd.xz + sd.y + wk * 7.31), hW2 = wHash(sd.zx * 1.7 + sd.y * 3.1 + wk * 2.17);
            float hP = wHash(sd.xz * 2.3 + sd.y * 0.7 + wk * 3.1 + pane * 11.7);
            // lòng phòng tối, sàn phòng hắt sáng nhẹ phía dưới ô cửa
            vec3 room = vec3(0.03, 0.033, 0.036) * (0.75 + 0.6 * hP) * (1.0 + 0.6 * wv);
            vec3 inn = room;
            // PHÒNG CÓ CHIỀU SÂU (interior mapping): tia nhìn đi qua ô kính vào một hộp phòng (rộng hơn ô cửa, trần ngay trên
            // khung cửa, sàn dưới bậu cửa) -> thấy tường sau / tường bên / sàn / trần đổi theo góc nhìn như phòng thật, không phải
            // mảng xám dán phẳng. Hệ trục ô cửa (wu, wv) dựng từ đạo hàm màn hình; nhỏ hơn vài điểm ảnh thì về màu phòng phẳng
            if (uGlassP.y < 1.5) {
              vec3 pV = -vViewPosition, q1 = dFdx(pV), q2 = dFdy(pV);
              vec2 s1 = vec2(dFdx(wu), dFdx(wv)), s2 = vec2(dFdy(wu), dFdy(wv));
              float det = s1.x * s2.y - s2.x * s1.y;
              vec3 Nf = normalize(cross(q1, q2));
              if (dot(Nf, pV) > 0.0) Nf = -Nf;
              vec3 dU = (q1 * s2.y - q2 * s1.y) / det, dVv = (q2 * s1.x - q1 * s2.x) / det;
              float Wl = length(dU), Hl = length(dVv);
              float par = aaU * step(1e-7, abs(det)) * step(Wl, 400.0) * step(Hl, 400.0);
              if (par > 0.0) {
                vec3 V = normalize(pV);
                vec3 d = vec3(dot(V, dU / Wl) / Wl, dot(V, dVv / Hl) / Hl, max(dot(V, -Nf), 0.05) / (Hl * 1.5));
                // hộp phòng theo toạ độ ô cửa: ngang -0.3..1.3, trần -0.12, sàn 1.55, sâu 1
                vec3 bmin = vec3(-0.3, -0.12, 0.0), bmax = vec3(1.3, 1.55, 1.0), p0 = vec3(wu, wv, 0.0);
                vec3 tA = (bmin - p0) / d, tB = (bmax - p0) / d, tF = max(tA, tB);
                float t = min(min(tF.x, tF.y), tF.z);
                vec3 h = p0 + d * t;
                float hR = wHash(sd.xz * 5.1 + sd.y * 1.3 + wk * 4.7);
                // tường: sơn trắng ngà / be / xám / xanh nhạt; sàn: gỗ / gạch / thảm xám
                vec3 wallC = hR < 0.35 ? vec3(0.6, 0.57, 0.5) : hR < 0.6 ? vec3(0.55, 0.5, 0.42) : hR < 0.8 ? vec3(0.48, 0.49, 0.48) : vec3(0.44, 0.5, 0.48);
                vec3 floorC = uGlassP.y > 0.5 ? vec3(0.22, 0.22, 0.23) : (hW < 0.5 ? vec3(0.3, 0.2, 0.12) : vec3(0.38, 0.36, 0.32));
                vec3 c;
                if (t == tF.z) {
                  c = wallC;
                  // đồ đạc sát tường sau (tủ / sofa / bàn) & khung tranh / cửa đi
                  float fx = fract(hR * 7.3), fw = 0.25 + 0.35 * fract(hR * 3.1);
                  c = mix(c, vec3(0.16, 0.12, 0.09) * (0.8 + 0.4 * hP), step(abs(h.x - fx), fw * 0.5) * step(1.05 - 0.25 * fract(hR * 5.7), h.y));
                  c = mix(c, c * 0.55, step(abs(h.x - 1.0 + fx), 0.12) * step(0.15, h.y) * step(h.y, 0.45) * step(0.5, hW2));
                } else if (t == tF.y) {
                  c = d.y > 0.0 ? floorC : wallC * 1.1;
                  // trần văn phòng: dãy đèn tấm (bật / tắt theo phòng)
                  if (d.y < 0.0 && uGlassP.y > 0.5) c += vec3(0.9, 0.92, 0.88) * step(0.5, hW2) * step(0.6, fract(h.x * 1.6)) * step(0.55, fract(h.z * 2.2));
                } else c = wallC * 0.78;
                // ánh sáng trong phòng: sáng ở sát cửa sổ, tối dần vào sâu; tổng thể tối hơn ngoài trời nhiều
                c *= (1.0 - 0.55 * clamp(h.z, 0.0, 1.0)) * 0.42 * (0.75 + 0.5 * hP);
                inn = mix(room, c, par);
              }
            }
            if (uGlassP.y < 0.5) {
              // nhà ở: rèm vải (kem, trắng, hồng đất, xanh nhạt, xanh rêu, đỏ sẫm, vàng) kéo kín / hé 2 bên / rèm voan / không rèm
              vec3 cc = hW2 < 0.25 ? vec3(0.62, 0.57, 0.47) : hW2 < 0.45 ? vec3(0.66, 0.66, 0.63) : hW2 < 0.58 ? vec3(0.6, 0.47, 0.43)
                : hW2 < 0.7 ? vec3(0.43, 0.5, 0.57) : hW2 < 0.82 ? vec3(0.45, 0.5, 0.38) : hW2 < 0.92 ? vec3(0.42, 0.24, 0.2) : vec3(0.58, 0.52, 0.32);
              float fold = 0.8 + 0.2 * aaU * sin(wu * 70.0 + hW * 30.0) * (0.7 + 0.3 * sin(wu * 23.0 + hP * 9.0));
              float cover = 0.0, sheer = 0.0;
              if (hW < 0.3) cover = 1.0 - step(abs(wu - 0.5 - (hP - 0.5) * 0.12), 0.015);
              else if (hW < 0.62) cover = step(wu, 0.1 + 0.32 * hP) + step(0.9 - 0.32 * fract(hP * 7.3), wu);
              else if (hW < 0.78) sheer = 1.0;
              inn = mix(inn, cc * fold * 0.5, clamp(cover, 0.0, 1.0));
              inn = mix(inn, vec3(0.42, 0.42, 0.4) * (0.88 + 0.12 * aaU * sin(wu * 90.0 + hW * 20.0)), sheer * 0.6);
            } else if (uGlassP.y < 1.5) {
              // văn phòng: rèm sáo kéo xuống tới mức lv (mỗi ô kính một mức), đèn tấm trên trần khi không bị rèm che
              // (đa số cửa kéo rèm lên hết; rèm kéo xuống cả cửa cùng một mức, không mỗi ô một mức -> mặt kính thành ô xếp gạch)
              float lv = hW < 0.65 ? 0.0 : hW < 0.85 ? 0.15 + 0.5 * fract(hW * 13.7) : 1.0;
              float slat = smoothstep(0.35, 0.5, fract(wv * 24.0)) * (1.0 - smoothstep(0.85, 1.0, fract(wv * 24.0)));
              vec3 bl = vec3(0.33, 0.33, 0.32) * (0.85 + 0.25 * hW) * (0.92 + 0.12 * aaV * (slat - 0.5));
              float dash = mix(0.6, step(0.4, fract(wu * uGlassP.x * 2.0 + hW)), aaU);
              float lit = step(0.5, hW2) * smoothstep(0.02, 0.05, wv) * (1.0 - smoothstep(0.1, 0.14, wv)) * dash;
              inn += vec3(0.32, 0.34, 0.33) * lit;
              inn = mix(inn, bl, step(wv, lv));
            } else if (uGlassP.y < 2.5) {
              // cửa hàng: lòng nhà sáng đèn ấm, kệ hàng
              float shelf = 0.5 + 0.5 * step(0.5, fract(wv * 4.0 + hW));
              inn = mix(room * 1.8, vec3(0.26, 0.22, 0.17) * shelf, step(0.4, hW) * smoothstep(0.25, 0.5, wv));
            } else {
              // sảnh cao ốc: lòng sảnh ấm sáng hơn phòng ở (đèn bật cả ngày), ô kính trên (sát trần) sáng đèn hắt;
              // không vẽ giả cột / quầy lên kính (2D không theo phối cảnh)
              inn = vec3(0.15, 0.148, 0.14) * (0.85 + 0.3 * hP) * (0.85 + 0.5 * wv);
              inn = mix(inn, vec3(0.42, 0.41, 0.38) * (0.85 + 0.15 * hW), (1.0 - smoothstep(0.12, 0.16, wv)) * 0.75);
            }
            wGlass = smoothstep(0.35, 0.9, cov);
            wPaneH = hP; wPaneV = 0.5 + (wv - 0.5) * (hW * 2.0 - 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, inn, wGlass);
          }
        }
        #endif`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, wGlass);`).replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.0, wGlass);`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, geometryNormal, wGlass));   // mặt kính phẳng: bỏ hạt vữa của normal map`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        if (wGlass > 0.0) {
          vec3 gV = geometry.viewDir, gNn = geometry.normal;
          float F = uGlassF.x + (1.0 - uGlassF.x) * pow(1.0 - clamp(dot(gNn, gV), 0.0, 1.0), 5.0);
          vec3 R = reflect(-gV, gNn);
          vec3 Rw = vec3(dot(viewMatrix[0].xyz, R), dot(viewMatrix[1].xyz, R), dot(viewMatrix[2].xyz, R));
          float ry = Rw.y + (wPaneH - 0.5) * uGlassF.y + (wPaneV - 0.5) * uGlassF.y * 0.6;
          vec3 skyC = vec3(0.5, 0.56, 0.64), gndC = vec3(0.3, 0.28, 0.25);
          #if NUM_HEMI_LIGHTS > 0
            skyC = hemisphereLights[0].skyColor; gndC = hemisphereLights[0].groundColor;
          #endif
          skyC += ambientLightColor * 0.5;
          gndC = mix(gndC, vec3(dot(gndC, vec3(0.3, 0.59, 0.11))), 0.6);   // mặt đường / vỉa hè soi lại: xám, không nâu đất
          // chân trời sáng hơn đỉnh trời; dưới chân trời là các khối nhà xa cao thấp theo hướng soi
          float az = atan(Rw.z, Rw.x) * 9.0;
          // đường viền nhà xa phản chiếu: nối mềm giữa các khối (khối bậc thang hash cứng -> mặt kính thành ô xám đen ghép)
          float azf = fract(az), azs = azf * azf * (3.0 - 2.0 * azf);
          float bh = mix(0.03 + 0.14 * wHash(vec2(floor(az), 3.0)), 0.03 + 0.14 * wHash(vec2(floor(az) + 1.0, 3.0)), azs);
          // (màu ánh trời bán cầu đã nhân cường độ ~0,5 -> nhân lại cho ngang độ sáng vòm trời thật)
          vec3 sky = skyC * 1.8 * mix(1.25, 0.85, clamp(ry * 1.4, 0.0, 1.0));
          vec3 env = ry < 0.0 ? gndC * mix(1.3, 0.8, clamp(-ry * 2.0, 0.0, 1.0))
            : mix(mix(gndC, skyC, 0.55), sky, smoothstep(bh - 0.03, bh + 0.03, ry));
          reflectedLight.indirectSpecular += env * F * wGlass;
          reflectedLight.directDiffuse *= 1.0 - F * wGlass;
          reflectedLight.indirectDiffuse *= 1.0 - F * wGlass;
          reflectedLight.directSpecular *= 1.0 + wGlass * (uGlassF.x / 0.04 - 1.0);
        }`);
    };
    mat.customProgramCacheKey = () => (key ? key() : '') + '|glass3';
    mat.extensions = Object.assign({}, mat.extensions, { derivatives: true });   // fwidth (WebGL1)
    return mat;
  }
  // ===========================================================================
  // MÁI DỐC & VÒM NHÀ KHO (dùng chung cho mọi nhà, instanced)
  // ===========================================================================
  // Ghép tứ giác / tam giác vào mảng đỉnh; tự lật thứ tự đỉnh theo pháp tuyến mong muốn n
  // es (tuỳ chọn): 4 số riêng mỗi đỉnh -> thuộc tính aEdge (viền mái ngói, xem edgeVert)
  function geoBuilder() {
    const P = [], N = [], U = [], E = [], groups = [], E0 = [0, 0, 0, 0];
    let cur = null, hasE = false;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const push = (pts, n, uvs, es) => {
      const cr = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
      let o = pts.map((p, i) => [p, uvs[i], es ? es[i] : E0]);
      if (cr.dot(n) < 0) o = [o[0], ...o.slice(1).reverse()];
      const tri = o.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
      for (const k of tri) { const [p, uv, e] = o[k]; P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); U.push(uv[0], uv[1]); E.push(e[0], e[1], e[2], e[3]); }
      if (es) hasE = true;
      cur.count += tri.length;
    };
    return {
      V,
      group(mi) { cur = { start: P.length / 3, count: 0, materialIndex: mi }; groups.push(cur); },
      quad(a, b, c, d, n, ua, ub, uc, ud, es) { push([a, b, c, d], n, [ua, ub, uc, ud], es); },
      tri(a, b, c, n, ua, ub, uc, es) { push([a, b, c], n, [ua, ub, uc], es); },
      count() { return P.length / 3; },
      build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        if (hasE) g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 4));
        for (const gr of groups) if (gr.count) g.addGroup(gr.start, gr.count, gr.materialIndex);
        g.computeBoundingSphere();
        return g;
      }
    };
  }
  // Mái hai dốc thật trong khối đơn vị (khớp cách đặt cũ: sống mái dọc trục X, chân mái y = 0 ở z = ±0,433, đỉnh y = 0,75):
  // tấm mái có bề dày (thấy mép tấm mái / diềm mái), mái chìa khỏi tường, bờ nóc úp, 2 đầu hồi là TƯỜNG (nhóm vật liệu 1).
  // Mái chia thành từng ô theo khoang nhà (đạn đục thủng từng ô): g0 / g1 = có tường hồi ở đầu -X / +X, xG = vị trí tường hồi
  function gableRoofGeo(g0 = true, g1 = true, xG = 0.455) {
    const b = geoBuilder(), V = b.V;
    const zE = 0.433, yR = 0.75, th = 0.035, slopeN = (s) => new THREE.Vector3(0, zE, s * yR).normalize();
    // tấm mái chia lưới (NU dọc sống mái x NV từ chân lên nóc) để shader làm võng / gợn (roofSag) — mép, diềm, bờ nóc chia
    // cùng nhịp nên không hở khe
    const NU = 8, NV = 8;
    const L = (p, q, t) => p.clone().lerp(q, t), Lu = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const grid = (a, bb, c, d, n, ua, ub, uc, ud, nu, nv) => {
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const P = (s, t) => L(L(a, bb, s), L(d, c, s), t), U = (s, t) => Lu(Lu(ua, ub, s), Lu(ud, uc, s), t);
        const s0 = i / nu, s1 = (i + 1) / nu, t0 = j / nv, t1 = (j + 1) / nv;
        b.quad(P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1), n, U(s0, t0), U(s1, t0), U(s1, t1), U(s0, t1));
      }
    };
    b.group(0);
    for (const s of [-1, 1]) {
      const n = slopeN(s), nd = n.clone().negate();
      // mặt ngói: u dọc sống mái, v từ chân mái lên đỉnh
      grid(V(-0.5, 0, s * zE), V(0.5, 0, s * zE), V(0.5, yR, 0), V(-0.5, yR, 0), n, [0, 0], [1, 0], [1, 1], [0, 1], NU, NV);
      // mặt dưới tấm mái (thấy được ở phần mái chìa)
      grid(V(-0.5, -th, s * zE), V(0.5, -th, s * zE), V(0.5, yR - th, 0), V(-0.5, yR - th, 0), nd, [0, 0], [1, 0], [1, 1], [0, 1], NU, NV);
      // diềm mái (mép dưới tấm mái chạy dọc nhà)
      grid(V(-0.5, 0, s * zE), V(0.5, 0, s * zE), V(0.5, -th, s * zE), V(-0.5, -th, s * zE), V(0, -0.3, s), [0, 0], [1, 0], [1, 0.03], [0, 0.03], NU, 1);
      // mép tấm mái ở 2 đầu hồi
      for (const e of [-0.5, 0.5]) grid(V(e, 0, s * zE), V(e, yR, 0), V(e, yR - th, 0), V(e, -th, s * zE), V(Math.sign(e), 0, 0), [0, 0], [0, 1], [0.03, 1], [0.03, 0], NV, 1);
    }
    // Viền mái ngói không kẻ thước: hàng ngói diềm (nhô khỏi mép tấm mái), hàng ngói mép đầu hồi, bờ nóc úp từng viên.
    // Vị trí đỉnh ở đây chỉ là dáng danh nghĩa (để lật mặt / bao cầu); vị trí thật do edgeVert (vertex shader) tính theo mét
    // thật + toạ độ thế giới: viên lệch cao thấp, sứt góc, cụm viên rơi mất lộ mép tấm mái. aEdge = (loại, t, lớp, v)
    const NE = 32, NVG = 20;
    for (const s of [-1, 1]) {
      const n = slopeN(s), lip = new THREE.Vector3(0, -0.4, s).normalize();
      for (let i = 0; i < NE; i++) {
        const xa = -0.5 + i / NE, xb = -0.5 + (i + 1) / NE;
        const F = x => V(x, 0.004, s * (zE + 0.004)), B = x => V(x, yR * 0.03, s * zE * 0.97), D = x => V(x, -0.006, s * zE);
        b.quad(F(xa), F(xb), B(xb), B(xa), n, [xa + 0.5, 0], [xb + 0.5, 0], [xb + 0.5, 0.03], [xa + 0.5, 0.03], [[1, 0, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [1, 1, 0, 0]]);
        b.quad(D(xa), D(xb), F(xb), F(xa), lip, [xa + 0.5, 0], [xb + 0.5, 0], [xb + 0.5, 0.01], [xa + 0.5, 0.01], [[1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 0, 0], [1, 0, 0, 0]]);
      }
      for (const e of [-1, 1]) if (e < 0 ? g0 : g1) {
        const O = v => V(e * 0.502, yR * v + 0.004, s * Math.max(zE * (1 - v), 0.002)), I = v => V(e * 0.47, yR * v + 0.004, s * Math.max(zE * (1 - v), 0.002));
        const D = v => V(e * 0.499, yR * v - 0.006, s * Math.max(zE * (1 - v), 0.002)), u0 = e < 0 ? 0 : 1;
        for (let j = 0; j < NVG; j++) {
          const va = j / NVG, vb = (j + 1) / NVG;
          b.quad(O(va), O(vb), I(vb), I(va), n, [u0, va], [u0, vb], [u0 - e * 0.03, vb], [u0 - e * 0.03, va], [[3, 0, 0, va], [3, 0, 0, vb], [3, 1, 0, vb], [3, 1, 0, va]]);
          b.quad(D(va), D(vb), O(vb), O(va), V(e, -0.3, 0).normalize(), [u0, va], [u0, vb], [u0, vb], [u0, va], [[3, 0, 1, va], [3, 0, 1, vb], [3, 0, 0, vb], [3, 0, 0, va]]);
        }
      }
    }
    // bờ nóc úp ngói dọc sống mái: mặt cắt nửa tròn 5 điểm (t = -1 .. 1 vắt qua sống mái)
    const nCap = b.count(), CS = [-1, -0.5, 0, 0.5, 1];
    for (let i = 0; i < NE; i++) {
      const xa = -0.5 + i / NE, xb = -0.5 + (i + 1) / NE;
      for (let k = 0; k < 4; k++) {
        const ta = CS[k], tb = CS[k + 1], P = (x, t) => V(x, yR + 0.02 * (1 - t * t) - 0.01 * Math.abs(t), t * 0.03);
        const tm = (ta + tb) / 2, nn = V(0, 1 - Math.abs(tm) * 0.5, tm * 0.9).normalize();
        b.quad(P(xa, ta), P(xb, ta), P(xb, tb), P(xa, tb), nn, [xa + 0.5, 0.98], [xb + 0.5, 0.98], [xb + 0.5, 1], [xa + 0.5, 1], [[2, ta, 0, 0], [2, ta, 0, 0], [2, tb, 0, 0], [2, tb, 0, 0]]);
      }
    }
    const nRoof = b.count();
    // đầu hồi: tường tam giác thụt vào trong đúng mặt tường hồi, nằm dưới tấm mái
    b.group(1);
    const zG = 0.4, yG = yR * (1 - 0.04 / zE) - th;
    for (const e of [-1, 1]) if (e < 0 ? g0 : g1) b.tri(V(e * xG, 0, -zG), V(e * xG, 0, zG), V(e * xG, yG, 0), V(e, 0, 0), [0, 0], [1, 0], [0.5, 1]);
    const g = b.build();
    // aSag: (0 không võng / 1 tấm mái / 2 bờ nóc: võng nhưng giữ pháp tuyến, x tường hồi -X, x tường hồi +X) — sát tường hồi mái tựa lên tường, không võng
    const nAll = g.attributes.position.count, A = new Float32Array(nAll * 3);
    for (let i = 0; i < nAll; i++) A.set(i < nRoof ? [i < nCap ? 1 : 2, g0 ? -xG : -99, g1 ? xG : 99] : [0, 0, 0], i * 3);
    g.setAttribute('aSag', new THREE.BufferAttribute(A, 3));
    return g;
  }
  // Mái cũ không phẳng như mặt kính: sống mái võng giữa các tường hồi, mặt mái võng giữa chân mái và nóc theo nhịp kèo /
  // xà gồ, ngói gợn sóng nhẹ. Dịch đỉnh theo chiều đứng (theo vị trí thế giới -> các ô mái kề nối liền), pháp tuyến tính lại
  // bằng sai phân để ánh nắng bắt được chỗ lồi lõm. Cùng hàm với roofSagY (JS) để mảnh vỡ ở mép mái bám đúng mặt mái
  const SAG_A = 2.0;
  const SAG_GLSL = `
    attribute vec3 aSag;
    float sagHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float sagNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(sagHash(i), sagHash(i + vec2(1.0, 0.0)), f.x), mix(sagHash(i + vec2(0.0, 1.0)), sagHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float sagH(vec3 p) {
      float v = clamp(p.y / 0.75, 0.0, 1.0);
      float w = min(1.0, v * 4.0) * (0.5 + 0.5 * sin(3.14159 * v)) * smoothstep(aSag.y, aSag.y + 0.3, p.x) * (1.0 - smoothstep(aSag.z - 0.3, aSag.z, p.x));
      vec4 q = vec4(p, 1.0);
      #ifdef USE_INSTANCING
        q = instanceMatrix * q;
      #endif
      vec2 wp = (modelMatrix * q).xz;
      return -w * (${SAG_A.toFixed(2)} * (0.3 + 0.7 * sagNoise(wp / 90.0)) + 1.1 * (sagNoise(wp / 22.0 + 7.3) - 0.5));
    }
    // Viền mái ngói (aEdge.x: 1 hàng ngói diềm, 2 bờ nóc, 3 mép đầu hồi). Tính bằng đơn vị thế giới trong hệ trục ô mái
    // (T lên dốc, N vuông góc mặt mái) rồi chia tỉ lệ instance -> viên ngói cùng cỡ dù ô mái to nhỏ. Viên 2 m ngang (đúng
    // lưới roofTileTex), hàng 1,25 dọc dốc, viên úp nóc 3,2. Mỗi nhà / mỗi mái một dãy số (băm theo trục vuông góc sống mái).
    // edgeSP: điểm tương ứng trên mặt mái để võng (sagH) theo đúng chỗ ngói nằm
    attribute vec4 aEdge;
    #ifdef USE_INSTANCING
    vec3 edgeSP;
    vec3 edgeVert(vec3 p) {
      vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      float s = p.z >= 0.0 ? 1.0 : -1.0, L = length(vec2(0.75 * sc.y, 0.433 * sc.z));
      vec3 T = vec3(0.0, 0.75 * sc.y, -s * 0.433 * sc.z) / L, N = vec3(0.0, 0.433 * sc.z, s * 0.75 * sc.y) / L;
      float ax = dot(instanceMatrix[3].xyz, normalize(instanceMatrix[0].xyz)) + p.x * sc.x;
      float bld = floor(dot(instanceMatrix[3].xyz, normalize(instanceMatrix[2].xyz)) / 4.0 + 0.5);
      float t = aEdge.y, ly = aEdge.z;
      edgeSP = p;
      vec3 r;
      if (aEdge.x < 1.5) {
        // hàng ngói diềm: mép trước nhô 0,55 khỏi tấm mái, cao 0,3; viên lệch tông cao thấp, mép lượn theo nhịp dài,
        // viên sứt góc (thụt + thấp), cụm 1-3 viên rơi mất -> hàng ngói thụt hẳn vào, lộ mép tấm mái / lati bên dưới
        float sd = sagHash(vec2(bld, s)) * 97.0, u = ax / 2.0 + sd, ti = floor(u);
        float h1 = sagHash(vec2(ti, sd)), h2 = sagHash(vec2(ti, sd + 5.3));
        float miss = step(sagHash(vec2(floor(u / 3.0), sd + 9.1)), 0.09) * step(0.25, h2);
        float chip = step(h1, 0.2) * (1.0 - miss);
        float fw = mix(0.55 + 0.4 * (h2 - 0.5) - 0.5 * chip, -1.6, miss);
        float hf = mix(0.3 + 0.18 * (h1 - 0.5) + 0.4 * (sagNoise(vec2(ax / 28.0, sd)) - 0.5) - 0.12 * chip, 0.03, miss);
        float al = ly > 0.5 ? 0.05 : mix(-fw, 1.8, t), hh = ly > 0.5 ? -0.3 : mix(max(hf, 0.03), 0.05, t);
        vec3 base = vec3(p.x, 0.0, s * 0.433);
        edgeSP = base + T * al / sc;
        r = base + (T * al + N * hh) / sc;
      }
      else if (aEdge.x < 2.5) {
        // bờ nóc: viên úp nửa tròn rộng 3, đuôi viên gối lên đầu viên sau (bậc răng cưa), lệch ngang / vênh, vài viên mất
        float sd = sagHash(vec2(bld, 0.0)) * 97.0, u = ax / 3.2 + sd, ci = floor(u), f = u - ci;
        float h1 = sagHash(vec2(ci, sd + 1.7)), h2 = sagHash(vec2(ci, sd + 4.1)), keep = step(0.05, sagHash(vec2(ci, sd + 8.3)));
        float rr = 0.75 * sc.y / (0.433 * sc.z);
        float y = keep * (0.9 * (1.0 - t * t) + 0.28 * f + 0.22 * (h1 - 0.5)) - abs(t) * 1.5 * rr + 0.1;
        float z = t * 1.5 + keep * (0.4 * (h2 - 0.5) + 0.35 * (h1 - 0.5) * (f - 0.5));
        edgeSP = vec3(p.x, 0.75, 0.0);
        r = edgeSP + vec3(0.0, y, z) / sc;
      }
      else {
        // mép đầu hồi: hàng viên chìa 0,35 ra ngoài tường hồi, từng hàng lệch ra / vào, sứt, vài cụm rơi lộ mép tấm mái
        float e = p.x >= 0.0 ? 1.0 : -1.0, v = aEdge.w;
        float sd = sagHash(vec2(bld, s + e * 3.0)) * 97.0, u = v * L / 1.25 + sd, ri = floor(u);
        float h1 = sagHash(vec2(ri, sd + 2.9)), h2 = sagHash(vec2(ri, sd + 6.7));
        float miss = step(sagHash(vec2(floor(u / 2.0), sd + 2.2)), 0.08) * step(0.3, h2);
        float chip = step(h1, 0.18) * (1.0 - miss);
        float ou = mix(0.35 + 0.35 * (h2 - 0.5) - 0.4 * chip, -1.2, miss);
        float hf = mix(0.28 + 0.12 * (h1 - 0.5) - 0.1 * chip, 0.03, miss);
        float xo = ly > 0.5 ? -0.05 : mix(ou, -1.4, t), hh = ly > 0.5 ? -0.3 : mix(max(hf, 0.03), 0.05, t);
        vec3 base = vec3(e * 0.5, 0.75 * v, s * 0.433 * (1.0 - v));
        edgeSP = base + vec3(e * xo / sc.x, 0.0, 0.0);
        r = edgeSP + N * hh / sc;
      }
      return r;
    }
    #endif`;
  function roofSag(mat, depth) {
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      let vs = SAG_GLSL + '\n' + sh.vertexShader;
      if (!depth) vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
        if (aSag.x > 0.5 && aSag.x < 1.5 && objectNormal.y > 0.2) {
          float sy0 = length(instanceMatrix[1].xyz), e = 0.03;
          float h0 = sagH(position) / sy0;
          vec3 tx = vec3(e, 0.0, 0.0), ts = normalize(vec3(0.0, 0.75, position.z >= 0.0 ? -0.433 : 0.433)) * e;
          vec3 ta = tx + vec3(0.0, sagH(position + tx) / sy0 - h0, 0.0), tb = ts + vec3(0.0, sagH(position + ts) / sy0 - h0, 0.0);
          vec3 nn = normalize(cross(ta, tb));
          objectNormal = dot(nn, objectNormal) < 0.0 ? -nn : nn;
        }
        #endif`);
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 sagP = position;
        if (aEdge.x > 0.5) { transformed = edgeVert(position); sagP = edgeSP; }
        if (aSag.x > 0.5) transformed.y += sagH(sagP) / length(instanceMatrix[1].xyz);
        #endif`);
      sh.vertexShader = vs;
    };
    mat.customProgramCacheKey = () => (key ? key() : '') + '_sag' + (depth ? 'D' : '');
    return mat;
  }
  // Bản JS của sagH cho điểm trên mặt mái (dải mái giữa, xa tường hồi): u = 0 chân mái .. 1 nóc, wx / wz toạ độ thế giới
  const sagFr = x => x - Math.floor(x);
  function sagHashJS(x, y) {
    let a = sagFr(x * 0.1031), b = sagFr(y * 0.1031), c = sagFr(x * 0.1031);
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += d; b += d; c += d;
    return sagFr((a + b) * c);
  }
  function sagNoiseJS(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const m = (p, q, t) => p + (q - p) * t;
    return m(m(sagHashJS(ix, iy), sagHashJS(ix + 1, iy), fx), m(sagHashJS(ix, iy + 1), sagHashJS(ix + 1, iy + 1), fx), fy);
  }
  function roofSagY(u, wx, wz) {
    const v = Math.max(0, Math.min(1, u)), w = Math.min(1, v * 4) * (0.5 + 0.5 * Math.sin(3.14159 * v));
    return -w * (SAG_A * (0.3 + 0.7 * sagNoiseJS(wx / 90, wz / 90)) + 1.1 * (sagNoiseJS(wx / 22 + 7.3, wz / 22 + 7.3) - 0.5));
  }
  // Vòm nhà kho tôn (nửa trụ, trục dọc X) + 2 vách đầu hồi bán nguyệt (nhóm 1) — trước đây 2 đầu vòm hở, nhìn xuyên vào trong.
  // Chia ô theo khoang như mái dốc: e0 / e1 = có vách đầu hồi ở đầu -X / +X
  function archRoofGeo(e0 = true, e1 = true) {
    const b = geoBuilder(), V = b.V, seg = 20;
    b.group(0);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI;
      const p = a => [0.5 * Math.cos(a), 0.5 * Math.sin(a)];   // [z, y]
      const [z0, y0] = p(a0), [z1, y1] = p(a1);
      const n = new THREE.Vector3(0, (y0 + y1) / 2, (z0 + z1) / 2).normalize();
      // u: quanh vòm (0..1), v: dọc nhà (0..1)
      b.quad(V(-0.5, y0, z0), V(0.5, y0, z0), V(0.5, y1, z1), V(-0.5, y1, z1), n, [i / seg, 0], [i / seg, 1], [(i + 1) / seg, 1], [(i + 1) / seg, 0]);
    }
    b.group(1);
    for (const e of [-1, 1]) if (e < 0 ? e0 : e1) for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI;
      b.tri(V(e * 0.5, 0, 0), V(e * 0.5, 0.5 * Math.sin(a0), 0.5 * Math.cos(a0)), V(e * 0.5, 0.5 * Math.sin(a1), 0.5 * Math.cos(a1)), V(e, 0, 0),
        [0.5, 0], [0.5 + 0.5 * Math.cos(a0), Math.sin(a0)], [0.5 + 0.5 * Math.cos(a1), Math.sin(a1)]);
    }
    return b.build();
  }
  // Trải ngói / tôn theo MÉT THẬT thay vì kéo giãn 1 ảnh theo cỡ nhà (mỗi viên ngói to cả mét): nhân uv với kích thước
  // thật của từng instance (lấy từ instanceMatrix) chia cỡ 1 lần lặp ảnh. mode: 'slope' mái dốc, 'arch' vòm (gân tôn vắt
  // qua vòm), 'endYZ' mặt đầu hồi (rộng theo z, cao theo y)
  function worldUV(mat, mode, tile) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      const sx = 'length(instanceMatrix[0].xyz)', sy = 'length(instanceMatrix[1].xyz)', sz = 'length(instanceMatrix[2].xyz)';
      // dọc sống mái: tính theo vị trí thật trên trục nhà -> các ô mái kề nhau nối liền vân ngói / sóng tôn, không lệch mạch
      const ax = `(dot(instanceMatrix[3].xyz, normalize(instanceMatrix[0].xyz)) - 0.5 * ${sx})`;
      const expr = mode === 'slope' ? `vec2(vUv.x * ${sx} + ${ax}, vUv.y * length(vec2(0.75 * ${sy}, 0.433 * ${sz})))`
        : mode === 'arch' ? `vec2(vUv.y * ${sx} + ${ax}, vUv.x * 1.5708 * 0.5 * (${sy} + ${sz}))`
        : `vec2(vUv.x * ${sz}, vUv.y * ${sy})`;
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #if defined( USE_UV ) && defined( USE_INSTANCING )
          vUv = ${expr} / ${tile.toFixed(2)};
        #endif`);
    };
    mat.customProgramCacheKey = () => 'wuv_' + mode + tile;
    return mat;
  }
  // Tường đầu hồi / vách bán nguyệt: không nhuộm theo màu mái (instanceColor) mà dùng màu riêng của vật liệu.
  // Chỉ đặt vColor = 1 ở vertex, GIỮ #include <color_fragment> — facadeGrime móc phong hoá vào đúng chỗ đó (trước đây
  // xoá luôn chunk fragment -> tường hồi mọi nhà mái dốc sạch bong, không vệt mưa / rêu / bong vữa)
  function noInstanceColor(mat) {
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#if defined( USE_COLOR_ALPHA )
        vColor = vec4( 1.0 );
        #elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
        vColor = vec3( 1.0 );
        #endif`);
    };
    mat.customProgramCacheKey = () => (key ? key() : '') + '|noic';
    return mat;
  }
  // Sân trước lát đá của khuôn viên cao ốc: tấm đá granite 1 x 0,5 m xếp so le (2 tông xám xen kẽ, mạch vữa sẫm), vài tấm
  // ố bẩn / nứt. Một ô ảnh = 8 x 8 m (plazaMat trải theo toạ độ thế giới -> các tấm sân kề nhau liền mạch)
  function plazaTex() {
    return canvasTex('plaza', 256, 256, (g, w, h) => {
      g.fillStyle = '#7a7873'; g.fillRect(0, 0, w, h);
      const sw = 32, sh = 16;
      for (let r = 0; r < h / sh; r++) for (let c = -1; c < w / sw; c++) {
        const x = c * sw + (r % 2 ? sw / 2 : 0), y = r * sh, v = 150 + Math.floor(RNG() * 26) - (((r + c) % 5 === 0) ? 22 : 0);
        g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(x + 0.8, y + 0.8, sw - 1.6, sh - 1.6);
        if (RNG() < 0.08) { g.fillStyle = 'rgba(60,54,44,0.18)'; g.fillRect(x + 1, y + 1, sw - 2, sh - 2); }
      }
      speckle(g, w, h, 2600, ['rgba(40,38,34,0.22)', 'rgba(230,228,220,0.18)'], 1, 2);
      g.strokeStyle = 'rgba(40,36,32,0.5)'; g.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) { let x = RNG() * w, y = RNG() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rand(-10, 10); y += rand(-6, 6); g.lineTo(x, y); } g.stroke(); }
    }, true);
  }
  function slabTex() {
    // Bê tông sàn / mái bằng xám trung tính (màu mái thật: bê tông, hắc ín, sỏi do instanceColor từng nhà quyết định):
    // hạt sỏi lấm tấm, vết nước đọng loang tối, rêu bám mép, mạch nối tấm sàn
    return canvasTex('slab', 128, 128, (g, w, h) => {
      g.fillStyle = '#8d8c87'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1600, ['rgba(46,45,42,0.26)', 'rgba(200,198,190,0.16)', 'rgba(110,104,94,0.22)'], 1, 2.5);
      for (let i = 0; i < 7; i++) {
        const x = RNG() * w, y = RNG() * h, r = 12 + RNG() * 26;
        const gr = g.createRadialGradient(x, y, r * 0.3, x, y, r);
        gr.addColorStop(0, 'rgba(48,46,42,0.09)'); gr.addColorStop(0.8, 'rgba(48,46,42,0.05)'); gr.addColorStop(1, 'rgba(48,46,42,0)');
        g.fillStyle = gr;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
          g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
        }
      }
      // mạch nối tấm mảnh, mờ (đậm quá thì mái bằng nhìn như sàn gạch lát)
      g.fillStyle = 'rgba(36,35,32,0.16)'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    }, true);
  }
  function roofTileTex() {
    // Ngói đất nung đã cũ: đỏ gạch trầm, viên đậm nhạt khác nhau, rêu / bụi đọng dưới mép viên, vệt nước chảy dọc mái
    return canvasTex('roofTile', 128, 128, (g, w, h) => {
      g.fillStyle = '#7a4634'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) {
        for (let x = (y / 10) % 2 ? 0 : 8; x < w; x += 16) {
          const v = RNG();
          g.fillStyle = v < 0.5 ? `rgba(255,205,170,${0.05 + v * 0.12})` : `rgba(30,18,12,${(v - 0.5) * 0.3})`;
          g.fillRect(x, y, 16, 8);
          g.fillStyle = 'rgba(255,210,180,0.1)'; g.fillRect(x + 2, y, 5, 8);
        }
        g.fillStyle = 'rgba(36,22,14,0.45)'; g.fillRect(0, y + 8, w, 2);
        g.fillStyle = 'rgba(70,74,46,0.14)'; g.fillRect(0, y + 6, w, 2);
      }
      speckle(g, w, h, 260, ['rgba(80,84,56,0.22)', 'rgba(40,30,24,0.2)'], 1, 3);
      if ('filter' in g) g.filter = 'blur(1.5px)';
      for (let i = 0; i < 6; i++) {
        const x = RNG() * w, sw = 4 + RNG() * 8;
        g.fillStyle = 'rgba(36,30,26,0.12)'; g.fillRect(x, 0, sw, h);
        if (x + sw > w) g.fillRect(x - w, 0, sw, h);
      }
      if ('filter' in g) g.filter = 'none';
    }, true);
  }
  function sandbagTex() {
    return canvasTex('sandbag', 64, 64, (g, w, h) => {
      g.fillStyle = '#a99b74'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,60,40,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < w; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 2, h); g.stroke(); }
      speckle(g, w, h, 200, ['rgba(60,50,30,0.3)'], 1, 3);
    }, true);
  }
  // Vỏ cây 256x512, lặp liền mạch cả 2 chiều (rãnh nứt và phiến vỏ chạy tuần hoàn theo chiều dọc và chu vi)
  // Vỏ cây theo ô Voronoi lặp liền mép (vẽ thẳng từng điểm ảnh): mỗi ô 1 mảng vỏ màu riêng, mép mảng vát tối dần vào rãnh
  // nứt, khe rãnh rộng hẹp không đều — thay cho các sọc lượn sóng song song đều tăm tắp trông như bó dây cáp.
  // o: { cols, rows: số ô theo bề ngang / dọc; ay: hệ số co khoảng cách dọc (< 1: mảng thuôn dài theo thân);
  //      furrow: bề rộng rãnh (px); bevel: bề rộng vát mép (px); pal: bảng màu mảng; dark: màu lòng rãnh; flake: vân lớp vảy;
  //      fiber: độ đậm thớ dọc; sub: { cols, rows, ay, furrow } lớp nứt nhỏ chia mảng to thành vảy con }
  function cellBark(g, w, h, o) {
    const hs = (a, b, c) => hash01(a, b, c + 101);
    // 1 lớp ô Voronoi lặp liền mép: hạt giống mỗi ô (lệch ngẫu nhiên trong ô), tìm hạt gần nhất / nhì quanh điểm
    const layer = (C, R, salt) => {
      const sx = [], sy = [];
      for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) { sx.push(0.12 + 0.76 * hs(i, j, salt)); sy.push(0.12 + 0.76 * hs(i, j, salt + 1)); }
      return { C, R, cw: w / C, ch: h / R, sx, sy };
    };
    const edge = (L, wx, wy, ay, out) => {
      const ci = Math.floor(wx / L.cw), cj = Math.floor(wy / L.ch);
      let f1 = 1e9, f2 = 1e9, id = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj, wi = ((ii % L.C) + L.C) % L.C, wj = ((jj % L.R) + L.R) % L.R, k = wj * L.C + wi;
        const dx = (ii + L.sx[k]) * L.cw - wx, dy = ((jj + L.sy[k]) * L.ch - wy) * ay, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
      }
      out.e = (f2 - f1) * 0.5; out.id = id;              // e ~ khoảng cách tới mép ô
    };
    // nhiễu giá trị lặp liền mép (chu kỳ px, py ô lưới — phải chia hết kích thước ảnh)
    const vn = (x, y, px, py, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const q = (a, b) => hs(((a % px) + px) % px, ((b % py) + py) % py, s);
      return (q(xi, yi) * (1 - ux) + q(xi + 1, yi) * ux) * (1 - uy) + (q(xi, yi + 1) * (1 - ux) + q(xi + 1, yi + 1) * ux) * uy;
    };
    const big = layer(o.cols, o.rows, 1), sub = o.sub ? layer(o.sub.cols, o.sub.rows, 11) : null;
    const A = { e: 0, id: 0 }, B = { e: 0, id: 0 };
    const img = g.createImageData(w, h), D = img.data, pal = o.pal, dk = o.dark;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // nhiễu toạ độ 2 tầng: mép mảng ngoằn ngoèo + răng cưa nhỏ (không thẳng như mạch vữa)
        const wx = x + (vn(x / 16, y / 16, w / 16, h / 16, 3) - 0.5) * 10 + (vn(x / 4, y / 4, w / 4, h / 4, 13) - 0.5) * 3.5;
        const wy = y + (vn(x / 16, y / 16, w / 16, h / 16, 4) - 0.5) * 10 + (vn(x / 4, y / 4, w / 4, h / 4, 14) - 0.5) * 3.5;
        edge(big, wx, wy, o.ay, A);
        const fw = o.furrow * (0.5 + vn(x / 32, y / 32, w / 32, h / 32, 5));
        const c = pal[Math.floor(hs(A.id, 7, 9) * pal.length)];
        let tone = 0.9 + 0.2 * hs(A.id, 8, 9), crack = 1;
        if (sub) {
          // nứt nhỏ chia mảng to thành vảy con: rãnh mảnh, nông, mỗi vảy con lệch sáng tối riêng
          edge(sub, wx + 37, wy + 59, o.sub.ay || o.ay, B);
          tone *= 0.9 + 0.2 * hs(B.id, 5, 19);
          const sw = o.sub.furrow * (0.4 + vn(x / 16, y / 16, w / 16, h / 16, 15));
          if (B.e < sw) crack = 0.55 + 0.45 * (B.e / sw);
        }
        // vân lớp vảy / thớ trong mảng + loang lớn (ẩm, phong hoá)
        const fl = o.flake ? 0.9 + 0.1 * Math.sin((wy + hs(A.id, 3, 9) * 40) * o.flake) : 1;
        const lo = 0.82 + 0.36 * vn(x / 64, y / 64, w / 64, h / 64, 6), fine = 0.9 + 0.2 * vn(x / 4, y / 4, w / 4, h / 4, 7);
        let r, gg, b;
        if (A.e < fw) {
          const k = 0.55 + 0.45 * (A.e / fw);              // lòng rãnh: tối nhất ở giữa khe
          r = dk[0] * k; gg = dk[1] * k; b = dk[2] * k;
        } else {
          // thớ dọc (fiber): vệt sáng tối mảnh chạy dọc thân trên mặt mảng / gờ
          const fb = o.fiber ? 1 - o.fiber * 0.5 + o.fiber * vn(x / 2, y / 32, w / 2, h / 32, 8) : 1;
          const bv = Math.min(1, (A.e - fw) / o.bevel), sh = (0.7 + 0.3 * bv * bv * (3 - 2 * bv)) * tone * fl * lo * fine * fb * crack;
          r = c[0] * sh; gg = c[1] * sh; b = c[2] * sh;
        }
        const p = (y * w + x) * 4;
        D[p] = r; D[p + 1] = gg; D[p + 2] = b; D[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  // VỎ CÂY GỖ RỪNG NHIỆT ĐỚI (dầu, chò, sao...): vỏ mỏng tương đối trơn màu xám nâu loang, KHÔNG phải mảng vảy dày như
  // sồi / thông. Nét chính: nứt dọc nông đứt đoạn, lỗ vỏ (bì khổng) ngang li ti, mảng địa y trắng xám loang lổ (đặc trưng
  // thân cây rừng ẩm), rêu xanh, vệt nước chảy sẫm. Tương phản thấp, ảnh lớn & lặp thưa (limb uRepeat) để mắt không bắt
  // được họa tiết lặp. Liền mép (vẽ lặp ±w, ±h)
  function tropicBarkTex() {
    return canvasTex('bark5_tropic', 512, 1024, (g, w, h) => {
      const W9 = fn => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
      const blob = (x, y, rx, ry, col0, col1) => W9((ox, oy) => {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, col0); gr.addColorStop(1, col1);
        g.save(); g.translate(x + ox, y + oy); g.scale(rx, ry); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.2832); g.fill(); g.restore();
      });
      g.fillStyle = '#6a6052'; g.fillRect(0, 0, w, h);
      // loang màu lớn: xám nâu / nâu ấm / xám lạnh, kéo dài theo thân
      for (let i = 0; i < 70; i++) {
        const c = [[92, 84, 72], [74, 64, 52], [104, 100, 92], [66, 60, 54], [88, 76, 60]][i % 5];
        blob(RNG() * w, RNG() * h, rand(30, 90), rand(80, 260), `rgba(${c[0]},${c[1]},${c[2]},${rand(0.25, 0.5)})`, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      }
      // thớ dọc mịn (vỏ già hơi sần theo thớ gỗ)
      for (let x = 0; x < w; x += 1.5) {
        g.fillStyle = RNG() < 0.5 ? `rgba(30,24,18,${rand(0.02, 0.07)})` : `rgba(160,150,135,${rand(0.02, 0.05)})`;
        g.fillRect(x, 0, rand(0.6, 1.6), h);
      }
      // gờ dọc: dải sáng giữa / sẫm hai mép lượn nhẹ theo thân -> vỏ có khối nổi chạy dọc (cũng là bản đồ nổi bumpMap)
      for (let x = 0; x < w;) {
        const bw = rand(9, 22), ph = rand(0, 6.28), k = 1 + Math.floor(RNG() * 3), amp = rand(2, 6);
        for (let y = 0; y < h; y += 4) {
          const xx = x + amp * Math.sin(y / h * 6.2832 * k + ph);
          for (const ox of [-w, 0, w]) {
            const gr = g.createLinearGradient(xx + ox, 0, xx + ox + bw, 0);
            gr.addColorStop(0, 'rgba(20,15,10,0.22)'); gr.addColorStop(0.45, 'rgba(175,165,148,0.13)'); gr.addColorStop(1, 'rgba(20,15,10,0.16)');
            g.fillStyle = gr; g.fillRect(xx + ox, y, bw, 4);
          }
        }
        x += bw;
      }
      // nứt dọc nông, đứt đoạn, đôi khi rẽ nhánh: nét sẫm mảnh + mép sáng bên cạnh (gờ nứt đón sáng)
      const crack = (x0, y0, len, lw, a) => {
        let x = x0, y = y0;
        const pts = [[x, y]];
        while (y < y0 + len) { y += rand(5, 10); x += rand(-1.6, 1.6); pts.push([x, y]); }
        W9((ox, oy) => {
          for (const [dx, col, k] of [[1.2, `rgba(170,160,145,${a * 0.35})`, 0.7], [0, `rgba(22,17,12,${a})`, 1]]) {
            g.strokeStyle = col; g.lineCap = 'round';
            // nứt mảnh hai đầu, rộng giữa
            for (let i = 1; i < pts.length; i++) {
              const t = i / (pts.length - 1);
              g.lineWidth = Math.max(0.4, lw * k * (0.35 + Math.sin(Math.PI * t)));
              g.beginPath(); g.moveTo(pts[i - 1][0] + dx + ox, pts[i - 1][1] + oy); g.lineTo(pts[i][0] + dx + ox, pts[i][1] + oy); g.stroke();
            }
          }
        });
        return pts;
      };
      for (let i = 0; i < 80; i++) {
        const pts = crack(RNG() * w, RNG() * h, rand(80, 420), rand(1.6, 3.6), rand(0.5, 0.8));
        if (RNG() < 0.35) { const p = pts[Math.floor(pts.length * rand(0.2, 0.7))]; crack(p[0], p[1], rand(30, 90), rand(0.8, 1.6), rand(0.3, 0.5)); }
      }
      // bì khổng: vạch ngang ngắn li ti, sẫm có mép dưới sáng
      for (let i = 0; i < 900; i++) {
        const x = RNG() * w, y = RNG() * h, l = rand(2, 7), a = rand(0.15, 0.4);
        g.fillStyle = `rgba(28,22,16,${a})`; g.fillRect(x, y, l, rand(0.8, 1.6));
        g.fillStyle = `rgba(175,165,150,${a * 0.5})`; g.fillRect(x, y + 1.4, l, 0.8);
      }
      // địa y vảy (crustose): mảng xám xanh nhạt loang méo (chuỗi đám nhỏ đi lang thang, không tròn xoe), mép lởm chởm,
      // phủ lên cả vết nứt; vài mảng ngả vàng lục. Tương phản vừa phải (nhìn xa không thành đốm tuyết)
      for (let i = 0; i < 20; i++) {
        let x = RNG() * w, y = RNG() * h;
        const tone = RNG() < 0.65 ? [150, 156, 140] : RNG() < 0.5 ? [140, 150, 112] : [168, 166, 150], n = 4 + Math.floor(RNG() * 6);
        for (let s = 0; s < n; s++) {
          const R = rand(8, 26);
          blob(x, y, R, R * rand(1, 1.6), `rgba(${tone[0]},${tone[1]},${tone[2]},${rand(0.18, 0.32)})`, `rgba(${tone[0]},${tone[1]},${tone[2]},0)`);
          for (let k = 0; k < R * 2.5; k++) {
            const a = rand(0, 6.2832), d = Math.pow(RNG(), 0.5) * R * 1.2, sz = rand(0.8, 2.4);
            g.fillStyle = `rgba(${tone[0] + rand(-15, 15) | 0},${tone[1] + rand(-15, 15) | 0},${tone[2] + rand(-15, 15) | 0},${rand(0.15, 0.4)})`;
            g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 1.3, sz, sz);
          }
          x += rand(-18, 18); y += rand(-30, 30);
        }
      }
      // rêu xanh: đám nhỏ ở chỗ ẩm (rêu phủ chân thân do weathering.js lo)
      // mốc ẩm: mảng đen xanh loang lổ (nấm mốc, tảo đen bám chỗ nước đọng), viền nhoè
      for (let i = 0; i < 22; i++) {
        let x = RNG() * w, y = RNG() * h;
        for (let s = 0, n = 3 + Math.floor(RNG() * 5); s < n; s++) {
          const R = rand(10, 34);
          blob(x, y, R * rand(0.7, 1.1), R * rand(1.2, 2), `rgba(${rand(22, 34) | 0},${rand(30, 40) | 0},${rand(22, 30) | 0},${rand(0.38, 0.6)})`, 'rgba(26,34,26,0)');
          x += rand(-20, 20); y += rand(-10, 40);
        }
      }
      for (let i = 0; i < 30; i++) {
        const cx = RNG() * w, cy = RNG() * h, R = rand(10, 36);
        blob(cx, cy, R, R * 1.4, `rgba(64,90,34,${rand(0.45, 0.7)})`, 'rgba(64,90,34,0)');
        for (let k = 0; k < R * 4; k++) { const a = rand(0, 6.2832), d = Math.pow(RNG(), 0.7) * R; g.fillStyle = `rgba(${rand(60, 100) | 0},${rand(90, 125) | 0},${rand(36, 56) | 0},${rand(0.2, 0.5)})`; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 1.4, rand(1, 2.5), rand(1, 2.5)); }
      }
      // vệt nước chảy sẫm dọc thân (mưa rừng)
      for (let i = 0; i < 10; i++) {
        const x = RNG() * w, y = RNG() * h, L = rand(150, 420), wd = rand(4, 14);
        W9((ox, oy) => { const gr = g.createLinearGradient(0, y + oy, 0, y + oy + L); gr.addColorStop(0, 'rgba(30,26,20,0)'); gr.addColorStop(0.3, `rgba(30,26,20,${rand(0.12, 0.25)})`); gr.addColorStop(1, 'rgba(30,26,20,0)'); g.fillStyle = gr; g.fillRect(x + ox - wd / 2, y + oy, wd, L); });
      }
      speckle(g, w, h, 1400, ['rgba(220,210,195,0.05)', 'rgba(0,0,0,0.08)'], 0.8, 2);
    }, true);
  }
  function barkTex(kind) {
    if (kind === 'tropic') return tropicBarkTex();
    const isCactus = kind === 'cactus';
    const key = isCactus ? 'bark4_cactus_v6' : 'bark4_' + kind;
    const tw = 256, th = 512;
    return canvasTex(key, tw, th, (g, w, h) => {
      const base = { palm: '#635544', pine: '#1e1610', dead: '#6e675d', cactus: '#3c523e' }[kind] || '#46392c';
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // vết loang sáng tối lớn (vỏ không đều màu)
      for (let i = 0; i < 36; i++) {
        const x = RNG() * w, y = RNG() * h, r = rand(20, 60), dark = RNG() < 0.55;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, dark ? 'rgba(14,8,4,0.45)' : 'rgba(110,88,68,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
      }
      const wavy = (x0, amp, k, ph, lw, col) => {
        g.strokeStyle = col; g.lineWidth = lw;
        for (const ox of [-w, 0, w]) {
          g.beginPath();
          for (let y = 0; y <= h; y += 4) {
            const x = x0 + ox + amp * Math.sin((y / h) * 6.2832 * k + ph) + amp * 0.35 * Math.sin((y / h) * 6.2832 * (k + 2) + ph * 1.7);
            if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
      };
      if (kind === 'palm') {
        // Thân cọ / dừa: thớ sợi xơ dừa nhuyễn mịn + vòng đốt sẹo cuống lá nổi khối 3D uốn lượn quanh thân
        for (let x = 0; x < w; x += 2.5) {
          g.fillStyle = `rgba(28, 20, 12, ${rand(0.06, 0.2)})`;
          g.fillRect(x, 0, 1.2, h);
        }
        const ringStep = 24;
        for (let y = 0; y < h; y += ringStep) {
          const kRing = 1 + (y % 2), phRing = (y / h) * 6.283, ampRing = rand(1.5, 3.5);
          for (const oy of [-h, 0, h]) {
            const yy = y + oy;
            g.beginPath();
            for (let x = 0; x <= w; x += 4) {
              const ry = yy + ampRing * Math.sin((x / w) * 6.2832 * kRing + phRing);
              if (x === 0) g.moveTo(x, ry); else g.lineTo(x, ry);
            }
            g.strokeStyle = 'rgba(26, 18, 10, 0.72)';
            g.lineWidth = 3.6;
            g.stroke();

            g.beginPath();
            for (let x = 0; x <= w; x += 4) {
              const ry = yy - 2.2 + ampRing * Math.sin((x / w) * 6.2832 * kRing + phRing);
              if (x === 0) g.moveTo(x, ry); else g.lineTo(x, ry);
            }
            g.strokeStyle = 'rgba(230, 212, 175, 0.32)';
            g.lineWidth = 2.2;
            g.stroke();
          }
          for (let x = 0; x < w; x += 12) {
            const sx = x + rand(-3, 3);
            const sy = y + ampRing * Math.sin((sx / w) * 6.2832 * kRing + phRing) + rand(-2, 2);
            for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
              g.fillStyle = 'rgba(24, 16, 8, 0.42)';
              g.fillRect(sx + ox, sy + oy, rand(2, 4), rand(4, 7));
            }
          }
        }
      } else if (kind === 'cactus') {
        // Xương rồng Saguaro (16 múi = 16 múi hình học): da xanh xám ô liu phủ sáp phấn (glaucous), sống múi bè sáng,
        // rãnh hẹp sâu chữ V sẫm; ổ gai nhỏ xám nâu cách đều dọc sống múi (lệch nhẹ, chỗ già rụng mất), chùm gai xám
        // mảnh chĩa xuống / ra hai bên — nhìn xa chỉ làm sống múi hơi bạc, không thành "khoá kéo" trắng; vòng thắt
        // tăng trưởng mờ theo mùa. (Sẹo bần, cháy nắng, đất cát bám chân: weathering.js, không lặp theo ảnh)
        g.fillStyle = '#4f6849'; g.fillRect(0, 0, w, h);
        // sáp phấn loang dọc thân (chỗ dày chỗ mỏng)
        for (let i = 0; i < 26; i++) {
          const x = RNG() * w, y = RNG() * h, rw = rand(6, 18), rh = rand(40, 140);
          const gr = g.createRadialGradient(x, y, 0, x, y, rh);
          gr.addColorStop(0, RNG() < 0.6 ? 'rgba(150,170,140,0.16)' : 'rgba(30,45,28,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(x + ox, y + oy); g.scale(rw / rh, 1); g.fillRect(-rh, -rh, rh * 2, rh * 2); g.restore(); }
        }
        const numRibs = 16, ribW = w / numRibs;
        for (let i = 0; i < numRibs; i++) {
          const rx = i * ribW, cx = rx + ribW * 0.5;
          // sống múi bè: dải sáng rộng giữa múi
          const grR = g.createLinearGradient(rx, 0, rx + ribW, 0);
          grR.addColorStop(0, 'rgba(20,32,18,0.55)'); grR.addColorStop(0.18, 'rgba(60,84,56,0)');
          grR.addColorStop(0.5, 'rgba(132,158,118,0.32)'); grR.addColorStop(0.82, 'rgba(60,84,56,0)'); grR.addColorStop(1, 'rgba(20,32,18,0.55)');
          g.fillStyle = grR; g.fillRect(rx, 0, ribW, h);
          // ổ gai dọc sống múi: cách ~16 px, lệch nhẹ, ~15% rụng mất (chỗ già)
          for (let y = rand(0, 16); y < h; y += rand(14, 18)) {
            if (RNG() < 0.15) continue;
            const ax = cx + rand(-0.8, 0.8), ay = y;
            g.fillStyle = 'rgba(118,108,88,0.75)'; g.beginPath(); g.ellipse(ax, ay, 1.3, 1.6, 0, 0, 6.283); g.fill();   // đệm nỉ
            g.lineWidth = 0.6;
            const n = 3 + Math.floor(RNG() * 4);
            for (let s = 0; s < n; s++) {
              const a = Math.PI / 2 + rand(-1.4, 1.4), l = rand(2.2, 4.2);
              g.strokeStyle = RNG() < 0.25 ? 'rgba(88,70,46,0.55)' : 'rgba(168,160,138,0.5)';
              g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + Math.cos(a) * l, ay + Math.sin(a) * l); g.stroke();
            }
          }
        }
        // vòng thắt tăng trưởng mờ (năm khô hạn thân thắt lại)
        for (let y = rand(30, 70); y < h; y += rand(80, 130)) {
          const gr = g.createLinearGradient(0, y - 5, 0, y + 5); gr.addColorStop(0, 'rgba(25,36,22,0)'); gr.addColorStop(0.5, 'rgba(25,36,22,0.16)'); gr.addColorStop(1, 'rgba(25,36,22,0)');
          g.fillStyle = gr; g.fillRect(0, y - 5, w, 10);
        }
        // bụi cát li ti
        speckle(g, w, h, 360, ['rgba(220,210,180,0.1)', 'rgba(25,38,20,0.12)'], 1, 2);
      } else if (kind === 'pine') {
        // Vỏ thông già: mảng vảy to không đều màu nâu đỏ / nâu xám, có vân lớp vảy ngang, ngăn bởi rãnh nứt sẫm rộng hẹp
        // không đều (thay các sọc lượn sóng song song)
        cellBark(g, w, h, { cols: 4, rows: 2, ay: 0.3, furrow: 4.6, bevel: 5, flake: 0.85, fiber: 0.14, sub: { cols: 8, rows: 8, ay: 0.55, furrow: 1.6 },
          pal: [[104, 70, 50], [118, 80, 58], [96, 78, 64], [88, 66, 52], [124, 90, 66], [102, 87, 75]], dark: [38, 26, 18] });
        // địa y xám bạc lác đác
        for (let i = 0; i < 10; i++) {
          const x = RNG() * w, y = RNG() * h;
          for (let k = 0; k < 20; k++) {
            g.fillStyle = `rgba(${rand(120, 150) | 0},${rand(130, 155) | 0},${rand(115, 135) | 0},${rand(0.12, 0.28)})`;
            g.fillRect(x + rand(-8, 8), y + rand(-10, 10), rand(1.5, 3), rand(1.5, 3));
          }
        }
      } else {
        // sồi / bàng / keo / liễu / cây khô: rãnh nứt dọc sâu, phiến vỏ gồ ghề dày dặn, địa y phong sương
        const dead = kind === 'dead';
        if (!dead) {
          // vỏ sồi / bàng: gờ vỏ dài đan chéo nhau (ô Voronoi kéo dài theo thân), rãnh sâu rộng, màu nâu xám
          cellBark(g, w, h, { cols: 7, rows: 2, ay: 0.16, furrow: 2.0, bevel: 6, fiber: 0.22,
            pal: [[94, 82, 68], [102, 90, 74], [88, 77, 64], [108, 96, 80], [98, 86, 74]], dark: [50, 40, 32] });
        } else {
          for (let x = 0; x < w; x += 2.5) {
            g.fillStyle = dead ? `rgba(32, 28, 24, ${rand(0.06, 0.18)})` : `rgba(20, 14, 8, ${rand(0.06, 0.22)})`;
            g.fillRect(x, 0, 1.2, h);
          }
          const numR = dead ? 12 : 14;
          for (let i = 0; i < numR; i++) {
            const x0 = (i / numR) * w + rand(-4, 4);
            const k = 1 + Math.floor(RNG() * 3), ph = RNG() * 6.283;
            const amp = rand(3, 7);
            wavy(x0, amp, k, ph, rand(2.2, 4.2), dead ? 'rgba(28, 24, 20, 0.88)' : 'rgba(15, 10, 5, 0.92)');
            wavy(x0 + rand(2.5, 4.0), amp, k, ph, rand(1.4, 2.4), dead ? 'rgba(215, 210, 195, 0.28)' : 'rgba(195, 165, 130, 0.28)');
          }
          for (let i = 0; i < 90; i++) {
            const x = RNG() * w, y = RNG() * h, rw = rand(5, 14), rh = rand(-2, 2);
            for (const ox of [-w, 0, w]) {
              for (const oy of [-h, 0, h]) {
                g.strokeStyle = dead ? 'rgba(30, 26, 22, 0.55)' : 'rgba(18, 12, 6, 0.55)';
                g.lineWidth = 1.2;
                g.beginPath();
                g.moveTo(x + ox, y + oy);
                g.lineTo(x + ox + rw, y + oy + rh);
                g.stroke();
              }
            }
          }
        }
        if (!dead) {
          // địa y / rêu xanh xám phong sương bám tự nhiên
          for (let i = 0; i < 14; i++) {
            const x = RNG() * w, y = RNG() * h;
            for (let k = 0; k < 35; k++) {
              const rx = x + rand(-12, 12), ry = y + rand(-15, 15);
              for (const ox of [-w, 0, w]) {
                for (const oy of [-h, 0, h]) {
                  g.fillStyle = `rgba(${rand(105, 135) | 0},${rand(125, 155) | 0},${rand(90, 115) | 0},${rand(0.18, 0.38)})`;
                  g.fillRect(rx + ox, ry + oy, rand(1.5, 3.5), rand(1.5, 3.5));
                }
              }
            }
          }
        }
      }
      // chấm sần li ti: vỏ vảy / gờ (Voronoi) đã có vân riêng -> chỉ rắc nhẹ, không thì mặt vỏ lấm tấm như giấy nhám
      const soft = kind === 'pine' || kind === 'oak';
      speckle(g, w, h, soft ? 260 : 900, soft ? ['rgba(255,240,220,0.05)', 'rgba(0,0,0,0.1)'] : ['rgba(255,240,220,0.08)', 'rgba(0,0,0,0.18)'], 1, 2.5);
    }, true);
  }
  // Tàu lá cọ (kênh alpha để cắt viền lá): sống lá giữa + lá chét dài thon, rủ, đầu lá ngả vàng
  function leafTex(kind) {
    return canvasTex('leaf2_' + kind, 128, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let y = 4; y < h - 4; y += 3.4) {
        const L = 58 * Math.pow(Math.sin((y / h) * Math.PI), 0.6) + 6;
        for (const s of [-1, 1]) {
          const v = rand(0.85, 1.15), c = [74 * v, 102 * v, 42 * v];
          const tip = RNG() < 0.25;
          const gr = g.createLinearGradient(w / 2, y, w / 2 + s * L, y + 16);
          gr.addColorStop(0, `rgb(${c[0] * 0.7 | 0},${c[1] * 0.72 | 0},${c[2] * 0.7 | 0})`);
          gr.addColorStop(0.7, `rgb(${c[0] * 1.15 | 0},${c[1] * 1.15 | 0},${c[2] * 1.05 | 0})`);
          gr.addColorStop(1, tip ? 'rgb(150,140,70)' : `rgb(${c[0] * 1.05 | 0},${c[1] * 1.1 | 0},${c[2] | 0})`);
          g.fillStyle = gr;
          const dx = s * L, dy = 16 + rand(-2, 3);
          g.beginPath(); g.moveTo(w / 2, y - 1.4);
          g.quadraticCurveTo(w / 2 + dx * 0.55, y + dy * 0.15, w / 2 + dx, y + dy);
          g.quadraticCurveTo(w / 2 + dx * 0.5, y + dy * 0.35 + 2.4, w / 2, y + 2);
          g.fill();
          g.strokeStyle = 'rgba(40,52,20,0.35)'; g.lineWidth = 0.6;
          g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + dx * 0.55, y + dy * 0.22, w / 2 + dx * 0.95, y + dy * 0.95); g.stroke();
        }
      }
      const rg = g.createLinearGradient(w / 2 - 3, 0, w / 2 + 3, 0);
      rg.addColorStop(0, '#4f4a26'); rg.addColorStop(0.5, '#8a8248'); rg.addColorStop(1, '#4f4a26');
      g.fillStyle = rg; g.fillRect(w / 2 - 2.5, 0, 5, h);
    });
  }

  // Tán lá kiểu game hiện đại: atlas 512x256
  //  - nửa trái  (u 0..0.5): 1 "chùm lá" có viền lá cắt alpha, dán lên các tấm thẻ nhỏ rải quanh khối tán
  //  - nửa phải (u 0.5..1): lá dày kín, tối hơn (lõi tán trong bóng râm), phủ khối lõi để tán không bị thủng lỗ
  const FOLIAGE_PAL = {
    // (lá thật ngoài nắng ngả ô liu / vàng lục, không xanh lá cây thuần bão hoà; vài lá xanh lam sẫm, vài lá vàng úa)
    broad: [[72, 90, 42], [88, 104, 50], [58, 76, 38], [100, 112, 56], [66, 86, 48], [96, 96, 50]],
    jungle: [[56, 80, 38], [70, 94, 44], [44, 66, 34], [82, 100, 48], [52, 78, 46], [88, 92, 46]],
    // keo / cây bụi khô: xanh ô liu xám (không vàng chói như lá úa)
    dry: [[92, 102, 58], [112, 118, 68], [78, 88, 48], [126, 126, 78], [100, 108, 62]],
    needle: [[34, 58, 38], [44, 70, 44], [28, 48, 34], [54, 80, 48], [38, 62, 40]],
    // thông: xanh lục sẫm ngả lam
    conifer: [[34, 62, 42], [44, 74, 48], [28, 50, 36], [56, 86, 54], [40, 66, 46]]
  };
  function drawLeaf(g, x, y, len, wid, ang, c) {
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(0, -wid, 0, wid);
    gr.addColorStop(0, `rgb(${Math.min(255, c[0] * 1.3) | 0},${Math.min(255, c[1] * 1.28) | 0},${Math.min(255, c[2] * 1.2) | 0})`);
    gr.addColorStop(0.55, `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
    gr.addColorStop(1, `rgb(${c[0] * 0.66 | 0},${c[1] * 0.68 | 0},${c[2] * 0.66 | 0})`);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.25, -wid * 1.15, len * 0.7, -wid * 0.8, len, 0);
    g.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.25, wid * 1.15, 0, 0); g.fill();
    if (len > 9) {
      g.strokeStyle = 'rgba(205,215,150,0.28)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.88, 0); g.stroke();
      g.strokeStyle = 'rgba(25,35,12,0.22)'; g.lineWidth = 0.5;
      for (let t = 0.25; t < 0.8; t += 0.18) { g.beginPath(); g.moveTo(len * t, 0); g.lineTo(len * (t + 0.12), -wid * 0.6); g.moveTo(len * t, 0); g.lineTo(len * (t + 0.12), wid * 0.6); g.stroke(); }
    }
    g.restore();
  }
  function drawNeedles(g, x, y, len, ang, c) {
    // cành kim: trục cành + kim mảnh dày đặc xòe hai bên về phía ngọn, đầu cành kim non sáng hơn
    g.save(); g.translate(x, y); g.rotate(ang);
    g.strokeStyle = 'rgb(74,54,36)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
    g.lineWidth = 1.0;
    for (let t = 1.5; t < len + 3; t += 1.25) {
      const k = 1 - Math.min(1, t / len) * 0.35, s = (0.7 + RNG() * 0.5) * (t > len * 0.8 ? 1.2 : 1);
      g.strokeStyle = `rgb(${Math.min(255, c[0] * s) | 0},${Math.min(255, c[1] * s) | 0},${Math.min(255, c[2] * s) | 0})`;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(Math.min(t, len), 0); g.lineTo(Math.min(t, len) + 5 * k, sd * rand(8, 11) * k); g.stroke(); }
    }
    g.restore();
  }
  // lá kép lông chim nhỏ (keo): cuống mảnh + lá chét li ti hai bên
  function drawPinnate(g, x, y, len, ang, c) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.strokeStyle = 'rgba(70,64,40,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
    for (let t = 2; t < len; t += 2.4) for (const sd of [-1, 1]) drawLeaf(g, t, 0, rand(5, 7), rand(1.6, 2.2), sd * rand(1.0, 1.4), c);
    g.restore();
  }
  // LÁ RỘNG KIỂU ẢNH CHỤP (cây lá rộng / cây rừng): lá thuôn mũi nhọn (mũi giọt nước của lá rừng mưa), gấp nhẹ theo gân giữa
  // -> nửa đón sáng / nửa khuất tối hơn; mép lá sẫm mảnh; gân giữa SẪM (không phải vạch sáng như tranh vẽ); mỗi lá lệch sắc
  // nhẹ (xanh vàng / xanh lam / úa). shade: độ sáng theo lớp (lá nằm sau trong chùm tối hơn)
  function drawLeafReal(g, x, y, len, wid, ang, c, shade) {
    const hj = rand(-0.07, 0.07), k = shade;
    const col = (m) => `rgb(${Math.min(255, c[0] * k * m * (1 + hj)) | 0},${Math.min(255, c[1] * k * m) | 0},${Math.min(255, c[2] * k * m * (1 - hj)) | 0})`;
    g.save(); g.translate(x, y); g.rotate(ang);
    // nửa trên (đón sáng) & nửa dưới (khuất) của phiến lá
    const half = (sd, m) => {
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, col(m * 0.82)); gr.addColorStop(0.5, col(m)); gr.addColorStop(1, col(m * 1.04));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.18, sd * wid * 1.05, len * 0.62, sd * wid * 0.95, len * 0.86, sd * wid * 0.22);
      g.quadraticCurveTo(len * 0.95, sd * wid * 0.05, len, 0);
      g.lineTo(0, 0); g.fill();
    };
    half(-1, 1.0); half(1, 0.8);
    // mép lá sẫm
    g.strokeStyle = `rgba(16,24,8,${0.18 + 0.12 * (1 - k)})`; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.18, -wid * 1.05, len * 0.62, -wid * 0.95, len * 0.86, -wid * 0.22); g.quadraticCurveTo(len * 0.95, -wid * 0.05, len, 0);
    g.quadraticCurveTo(len * 0.95, wid * 0.05, len * 0.86, wid * 0.22); g.bezierCurveTo(len * 0.62, wid * 0.95, len * 0.18, wid * 1.05, 0, 0); g.stroke();
    // gân giữa & vài gân bên mờ
    g.strokeStyle = `rgba(20,28,10,${0.3 * k})`; g.lineWidth = Math.max(0.5, wid * 0.08);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.92, 0); g.stroke();
    if (len > 14) {
      g.strokeStyle = `rgba(20,28,10,${0.12 * k})`; g.lineWidth = 0.45;
      for (let t = 0.2; t < 0.8; t += 0.13) for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(len * t, 0); g.quadraticCurveTo(len * (t + 0.06), sd * wid * 0.35, len * (t + 0.14), sd * wid * 0.7); g.stroke(); }
    }
    g.restore();
  }
  // Chùm lá: các nhánh con (cành mảnh) toả từ gần tâm, lá mọc so le hai bên hướng về ngọn, nhỏ dần về ngọn nhánh. Vẽ từ
  // lớp sau ra lớp trước (lớp sau tối hơn: lá trong chùm che nắng nhau) -> chùm có chiều sâu, viền lởm chởm theo nhánh
  // (không thành viền tròn). Lõi giữa kín bằng lá tối (mipmap xa vẫn đủ alpha)
  function foliageTexReal(kind) {
    return canvasTex('foliage3_' + kind, 1024, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.scale(2, 2);
      const pal = FOLIAGE_PAL[kind] || FOLIAGE_PAL.broad, big = kind === 'jungle';
      const pick = () => pal[(RNG() * pal.length) | 0];
      const L0 = big ? [24, 36] : [17, 25], W0 = big ? [0.3, 0.38] : [0.33, 0.42];
      g.save(); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
      // lõi: lá tối dày quanh tâm
      for (let i = 0; i < (big ? 70 : 110); i++) {
        const a = RNG() * 6.283, r = Math.pow(RNG(), 0.8) * 46, L = rand(L0[0], L0[1]) * 0.8;
        drawLeafReal(g, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, L, L * rand(W0[0], W0[1]), RNG() * 6.283, pick(), rand(0.55, 0.72));
      }
      // nhánh con: 3 lớp sau -> trước
      const layers = [[0.74, 0.88, big ? 5 : 6], [0.9, 1.04, big ? 5 : 6], [1.04, 1.2, big ? 4 : 5]];
      for (const [s0, s1, nB] of layers) {
        for (let b = 0; b < nB; b++) {
          const a = RNG() * 6.283, r0 = rand(4, 22), len = rand(70, 112), bend = rand(-0.5, 0.5), c = pick(), sh = rand(s0, s1);
          let x = 128 + Math.cos(a) * r0, y = 128 + Math.sin(a) * r0;
          const pts = [[x, y]];
          for (let t = 1; t <= 10; t++) { const aa = a + bend * t / 10; x += Math.cos(aa) * len / 10; y += Math.sin(aa) * len / 10; pts.push([x, y]); }
          g.strokeStyle = 'rgba(62,48,30,0.9)'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.stroke();
          // lá so le hai bên, chĩa về ngọn nhánh; lá ngọn
          for (let t = 2, sd = 1; t < pts.length; t++, sd = -sd) {
            const p = pts[t], q = pts[t - 1], da = Math.atan2(p[1] - q[1], p[0] - q[0]), f = 1 - 0.35 * t / pts.length;
            const L = rand(L0[0], L0[1]) * f;
            drawLeafReal(g, p[0], p[1], L, L * rand(W0[0], W0[1]), da + sd * rand(0.55, 1.05), c, sh * rand(0.92, 1.06));
          }
          const e = pts[pts.length - 1], e1 = pts[pts.length - 2];
          drawLeafReal(g, e[0], e[1], rand(L0[0], L0[1]) * 0.75, rand(L0[0], L0[1]) * 0.25, Math.atan2(e[1] - e1[1], e[0] - e1[0]), c, sh);
        }
      }
      g.restore();
      // nửa phải: lá kín, tối (lõi tán) — vân mịn đều, không sọc
      g.save(); g.beginPath(); g.rect(256, 0, 256, 256); g.clip();
      const d = pal[2];
      g.fillStyle = `rgb(${d[0] * 0.62 | 0},${d[1] * 0.62 | 0},${d[2] * 0.62 | 0})`; g.fillRect(256, 0, 256, 256);
      for (let i = 0; i < 1400; i++) {
        const L = rand(L0[0], L0[1]) * 0.55;
        drawLeafReal(g, 256 + RNG() * 256, RNG() * 256, L, L * rand(W0[0], W0[1]), RNG() * 6.283, pick(), rand(0.6, 0.95));
      }
      g.restore();
    });
  }
  function foliageTex(kind) {
    if (kind === 'broad' || kind === 'jungle') return foliageTexReal(kind);
    return canvasTex('foliage2_' + kind, 512, 256, (g, w, h) => {
      const pal = FOLIAGE_PAL[kind] || FOLIAGE_PAL.broad;
      const pick = () => pal[(RNG() * pal.length) | 0];
      const needle = kind === 'needle', dry = kind === 'dry', big = kind === 'jungle';
      g.clearRect(0, 0, w, h);
      // --- nửa trái: chùm lá. Lõi giữa đặc (mipmap ở xa vẫn đủ alpha, tán không bị "mòn" dần), viền lá lởm chởm
      g.save(); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
      const d = pal[2];
      g.fillStyle = `rgb(${d[0] * 0.72 | 0},${d[1] * 0.72 | 0},${d[2] * 0.72 | 0})`;
      for (let i = 0; i < 10; i++) {
        const a = RNG() * 6.283, r = rand(0, 30);
        g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rand(26, 42), 0, 6.3); g.fill();
      }
      // cành nhỏ lộ ra giữa chùm
      g.strokeStyle = 'rgba(66,50,34,0.95)';
      for (let b = 0; b < 5; b++) {
        const a = RNG() * 6.283; g.lineWidth = rand(1.5, 2.5);
        g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); g.stroke();
      }
      // lá rải ngẫu nhiên (dày ở giữa, thưa ra mép), lá ngoài chĩa ra ngoài -> viền chùm lá lởm chởm tự nhiên
      const nLeaf = needle ? 120 : dry ? 70 : big ? 150 : 260;
      for (let i = 0; i < nLeaf; i++) {
        const a = RNG() * 6.283, r = Math.pow(RNG(), 0.7) * (needle ? 72 : dry ? 74 : 88);
        const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r, la = a + rand(-1.0, 1.0);
        if (needle) drawNeedles(g, x, y, rand(26, 44), la, pick());
        else if (dry) drawPinnate(g, x, y, rand(18, 28), la, pick());
        else if (big) drawLeaf(g, x, y, rand(26, 38), rand(8, 12), la, pick());
        else drawLeaf(g, x, y, rand(18, 26), rand(6, 9), la, pick());
      }
      g.restore();
      // --- nửa phải: lá dày kín, tối (bên trong tán)
      g.save(); g.beginPath(); g.rect(256, 0, 256, 256); g.clip();
      g.fillStyle = `rgb(${d[0] * 0.65 | 0},${d[1] * 0.65 | 0},${d[2] * 0.65 | 0})`; g.fillRect(256, 0, 256, 256);
      for (let i = 0; i < (needle ? 420 : dry ? 900 : 1100); i++) {
        const c = pick(), s = rand(0.68, 0.95), cc = [c[0] * s, c[1] * s, c[2] * s];
        const x = 256 + RNG() * 256, y = RNG() * 256, a = RNG() * 6.283;
        if (needle) drawNeedles(g, x, y, rand(18, 30), a, cc);
        else if (dry) drawLeaf(g, x, y, rand(7, 10), rand(2.4, 3.2), a, cc);
        else drawLeaf(g, x, y, rand(11, 16), rand(3.6, 5), a, cc);
      }
      g.restore();
    });
  }
  // Đường bao bề ngang 1 cành thông theo t dọc cành (0 gốc -> 1 ngọn): gốc hẹp, rộng nhất ~45%, nhọn ở ngọn.
  // Dùng chung cho ảnh cành (coniferTex) và hình học cành (pineBranch) -> bề ngang mỗi đốt ôm sát ảnh
  const sprayEnv = t => Math.pow(Math.max(0, Math.sin(Math.PI * (0.1 + 0.9 * t))), 0.65);
  // Thảm rụng dưới tán (atlas 2:1): nửa trái kim thông khô (nâu gỉ) + nón thông, nửa phải lá khô (nâu / vàng / ô liu);
  // nền đất mùn sẫm. Mỗi nửa: đậm ở tâm (gốc cây, đất ẩm khuất nắng) mờ dần ra mép tán, mép loang lổ không tròn đều
  function litterTex() {
    // vẽ ở 1024x512 (toạ độ vẽ giữ hệ 512x256, phóng 2x): thảm ~6 m chỉ 256 điểm ảnh thì nhìn sát gốc bị nhoè
    return canvasTex('litter1', 1024, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.scale(2, 2);
      for (const side of [0, 1]) {
        const ox = side * 256, cx = ox + 128, cy = 128;
        g.save(); g.beginPath(); g.rect(ox, 0, 256, 256); g.clip();
        // nền mùn liền (kín ở tâm) — không có lớp này thì đất cỏ lộ qua kẽ kim / lá, thảm nhạt như không có
        const bg = g.createRadialGradient(cx, cy, 0, cx, cy, 128);
        bg.addColorStop(0, side ? 'rgb(66,50,32)' : 'rgb(60,44,30)'); bg.addColorStop(1, side ? 'rgb(84,68,44)' : 'rgb(80,62,42)');
        g.fillStyle = bg; g.fillRect(ox, 0, 256, 256);
        // đất mùn: các mảng sẫm chồng nhau dày ở tâm
        for (let i = 0; i < 260; i++) {
          const a = RNG() * 6.283, r = Math.pow(RNG(), 0.8) * 120, s = rand(8, 26);
          const c = RNG() < 0.5 ? [52, 40, 28] : [70, 56, 38];
          g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${rand(0.12, 0.3)})`;
          g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, 0, 6.3); g.fill();
        }
        if (!side) {
          // kim thông khô rơi ngổn ngang
          const NC = [[98, 70, 46], [112, 82, 56], [84, 62, 44], [78, 68, 54], [120, 94, 66]];
          g.lineCap = 'round';
          for (let i = 0; i < 2600; i++) {
            const a = RNG() * 6.283, r = Math.pow(RNG(), 0.65) * 122, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            const c = NC[(RNG() * NC.length) | 0], k = rand(0.7, 1.15), la = RNG() * 6.283, L = rand(5, 11);
            g.strokeStyle = `rgba(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0},${rand(0.45, 0.85)})`; g.lineWidth = rand(0.7, 1.2);
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(la) * L, y + Math.sin(la) * L); g.stroke();
          }
          // nón thông & cành khô nhỏ
          for (let i = 0; i < 14; i++) {
            const a = RNG() * 6.283, r = rand(10, 90), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            g.save(); g.translate(x, y); g.rotate(RNG() * 6.283);
            g.fillStyle = 'rgb(92,62,36)'; g.beginPath(); g.ellipse(0, 0, 5.5, 3, 0, 0, 6.3); g.fill();
            g.strokeStyle = 'rgba(50,34,20,0.8)'; g.lineWidth = 0.7;
            for (let s = -4; s <= 4; s += 2) { g.beginPath(); g.moveTo(s, -3); g.lineTo(s + 1, 3); g.stroke(); }
            g.restore();
          }
        } else {
          // lá khô: elip nhỏ có gân, nằm chồng lên nhau
          const LC = [[118, 82, 44], [146, 108, 52], [96, 86, 46], [160, 128, 70], [80, 58, 36]];
          for (let i = 0; i < 900; i++) {
            const a = RNG() * 6.283, r = Math.pow(RNG(), 0.65) * 120, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            const c = LC[(RNG() * LC.length) | 0], k = rand(0.7, 1.12), L = rand(4, 8);
            g.save(); g.translate(x, y); g.rotate(RNG() * 6.283);
            g.fillStyle = `rgba(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0},${rand(0.7, 0.95)})`;
            g.beginPath(); g.ellipse(0, 0, L, L * 0.48, 0, 0, 6.3); g.fill();
            g.strokeStyle = 'rgba(60,40,22,0.45)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
            g.restore();
          }
        }
        // mặt nạ mờ dần ra mép: tâm đặc, mép loang (nhiều vệt tròn mờ chồng nhau quanh vành)
        g.globalCompositeOperation = 'destination-in';
        const m = g.createRadialGradient(cx, cy, 10, cx, cy, 126);
        m.addColorStop(0, 'rgba(0,0,0,0.97)'); m.addColorStop(0.5, 'rgba(0,0,0,0.88)'); m.addColorStop(0.8, 'rgba(0,0,0,0.45)'); m.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = m; g.fillRect(ox, 0, 256, 256);
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 60; i++) {
          const a = RNG() * 6.283, r = rand(70, 128);
          g.fillStyle = `rgba(0,0,0,${rand(0.2, 0.6)})`;
          g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rand(8, 22), 0, 6.3); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        g.restore();
      }
    });
  }
  // loại cây -> nửa atlas thảm rụng (0 kim, 1 lá) & bán kính thảm so với tán
  const LITTER = { pine: [0, 0.95], cypress: [0, 1.2], broadleaf: [1, 0.85], jungle: [1, 0.85], willow: [1, 0.8], acacia: [1, 0.75], deadTree: [1, 0.6] };
  // Ảnh cành thông 256x512: 1 cành kim nhìn từ trên xuống, gốc ở đáy ảnh (v = 0), ngọn ở đỉnh (v = 1): trục cành + cành con
  // so le chĩa về ngọn, kim mảnh dày đặc (chồi non đầu cành sáng hơn). Lớp lót đậm dưới kim -> ảnh thu nhỏ (mipmap) vẫn đủ alpha
  function coniferTex() {
    return canvasTex('conifer1', 256, 512, (g, w, h) => {
      const pal = FOLIAGE_PAL.conifer, pick = () => pal[(RNG() * pal.length) | 0], d = pal[2];
      const rgb = (c, s) => `rgb(${Math.min(255, c[0] * s) | 0},${Math.min(255, c[1] * s) | 0},${Math.min(255, c[2] * s) | 0})`;
      g.clearRect(0, 0, w, h);
      const cx = 128, HW = 118, Y0 = 506, Y1 = 8, LEN = Y0 - Y1;
      const at = t => [cx + Math.sin(t * 5.1) * 3, Y0 - t * LEN];
      // lớp lót: lõi kim tối dọc nửa trong của cành (che nhìn xuyên) — nửa ngoài là các "ngón" cành con tách nhau bởi khe hở
      // -> mép cành lởm chởm như cành thông thật, không thành tấm lá liền mép trơn
      g.fillStyle = rgb(d, 0.5);
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40, [x, y] = at(t); g.lineTo(x + HW * sprayEnv(t) * 0.42, y); }
      for (let i = 40; i >= 0; i--) { const t = i / 40, [x, y] = at(t); g.lineTo(x - HW * sprayEnv(t) * 0.42, y); }
      g.fill();
      // cành con so le hai bên trục, chĩa về ngọn, dài ngắn không đều: [x0, y0, x1, y1, t] (gốc trên trục cành tại t)
      const twigs = [];
      for (let t = 0.04; t < 0.95; t += rand(0.05, 0.062)) for (const sd of [-1, 1]) {
        const tt = t + (sd > 0 ? 0.027 : 0), th = rand(0.65, 0.95), te = Math.min(1, tt + 0.07);
        const lat = Math.max(6, HW * sprayEnv(te) - 13) * rand(0.7, 1), L = lat / Math.sin(th), [x0, y0] = at(tt);
        twigs.push([x0, y0, x0 + sd * Math.sin(th) * L, y0 - Math.cos(th) * L, tt]);
      }
      const [tx, ty] = at(1);
      twigs.push([cx, Y0, tx, ty, 0]);
      g.lineCap = 'round';
      g.strokeStyle = rgb(d, 0.5);
      for (const [x0, y0, x1, y1, t] of twigs) if (t) { g.lineWidth = 12; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8); g.stroke(); }
      g.strokeStyle = 'rgb(70,52,36)';
      for (const [x0, y0, x1, y1, t] of twigs) { g.lineWidth = t ? 1.3 : 2.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      // kim 3 lớp xòe hai bên mỗi cành con, chĩa về đầu cành: tối (sâu) -> vừa -> sáng (chỉ nửa ngoài, đầu cành ngả màu chồi non)
      const LAYERS = [[3, 12, 17, 0.5, 0.7, 0], [2.4, 10, 15, 0.8, 1.05, 0], [3.6, 7, 11, 1.1, 1.35, 0.45]];
      g.lineWidth = 1.5;
      for (const [step, l0, l1, s0, s1, k0] of LAYERS) for (const [x0, y0, x1, y1, t] of twigs) {
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        for (let s = t ? 2 : 16; s < L + 3; s += step) {
          const k = Math.min(1, s / L);
          if (k < k0) continue;
          const px = x0 + dx * k, py = y0 + dy * k;
          for (const sg of [-1, 1]) {
            const a = ang + sg * rand(0.45, 1.0), nl = rand(l0, l1) * (1 - 0.25 * k);
            g.strokeStyle = rgb(k0 && k > 0.8 ? [88, 118, 62] : pick(), rand(s0, s1));
            g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); g.stroke();
          }
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC: gộp các BufferGeometry không chỉ số (position/normal/uv)
  // ---------------------------------------------------------------------------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function place(geo, pos, rot, scale) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e);
    _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (typeof scale === 'number') _s.set(scale, scale, scale); else if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
    g.applyMatrix4(_m.compose(_v, _q, _s));
    return g;
  }
  function merge(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    // thuộc tính riêng của cây (tint: nhân màu, mặc định 1; corner: góc thẻ lá billboard, mặc định 0):
    // chỉ tạo khi có mảnh mang thuộc tính đó
    const extra = [['tint', 3, 1], ['corner', 2, 0]].filter(([k]) => list.some(g => g.attributes[k])).map(([k, d, v]) => [k, d, new Float32Array(n * d).fill(v)]);
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
      for (const [k, d, arr] of extra) if (g.attributes[k]) arr.set(g.attributes[k].array.subarray(0, c * d), o * d);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    for (const [k, d, arr] of extra) out.setAttribute(k, new THREE.BufferAttribute(arr, d));
    out.computeBoundingSphere();
    return out;
  }
  // Nhiễu đỉnh cho khối tán lá / đá (bề mặt sần, không tròn trịa)
  function jitter(geo, amt, seed) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
      const f = 1 + (k - Math.floor(k) - 0.5) * amt;
      p.setXYZ(i, x * f, y * f, z * f);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Bể chứa instance dùng chung
  class Pool {
    constructor(parent, geo, mat, cap, opts = {}) {
      this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
      this.mesh.count = 0;
      this.mesh.castShadow = opts.castShadow !== false;
      this.mesh.receiveShadow = opts.receiveShadow !== false;
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (opts.color) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3).fill(1), 3);
      }
      parent.add(this.mesh);
      this.cap = cap;
    }
    add(matrix, color) {
      const F = this.fz, i = this.mesh.count;
      if ((F ? F.n : 0) + i >= this.cap) return -1;
      this.mesh.count++;
      this.mesh.setMatrixAt(i, matrix);
      if (color && this.mesh.instanceColor) this.mesh.setColorAt(i, color);
      if (!F) return i;
      this.mesh.visible = true;
      return F.n + i;
    }
    // chỉ số -> [mesh, chỉ số trong mesh] (đã đóng băng: instance dựng sẵn nằm ở mảnh theo ô, instance thêm sau ở mesh gốc)
    slot(i) {
      const F = this.fz;
      if (!F) return [this.mesh, i];
      return i < F.n ? [F.c[F.ci[i]], F.l[i]] : [this.mesh, i - F.n];
    }
    set(i, matrix) {
      if (i < 0) return;
      const [m, j] = this.slot(i);
      m.setMatrixAt(j, matrix); m.instanceMatrix.needsUpdate = true;
      if (m !== this.mesh) growChunk(m, matrix);
    }
    hide(i) { if (i >= 0) { const [m, j] = this.slot(i); m.setMatrixAt(j, ZERO); m.instanceMatrix.needsUpdate = true; } }
    color(i, c) { if (i >= 0 && this.mesh.instanceColor) { const [m, j] = this.slot(i); m.setColorAt(j, c); m.instanceColor.needsUpdate = true; } }
    commit() { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    // ĐÓNG BĂNG THEO Ô (sau khi dựng xong): chia các instance đã có thành nhiều InstancedMesh theo ô ngang cell x cell, mỗi
    // mảnh một khối bao riêng -> lượt vẽ chính và lượt bóng đổ chỉ vẽ ô trong tầm. Trước đây mỗi bể là 1 mesh tắt kiểm tra
    // khuất trải cả thành phố: đo 2026-10-28 URBAN nhìn ra biển vẫn vẽ 6,5 triệu tam giác nhà mỗi khung. Chỉ số instance
    // giữ nguyên (set / hide / color tự chuyển tới mảnh), instance thêm sau vào mesh gốc (ẩn tới khi có). Bể có thuộc tính
    // instance riêng trên hình học (dùng chung bộ đệm với mesh khác) thì không đóng băng
    freeze(cell) {
      const M = this.mesh, n = M.count, geo = M.geometry;
      if (this.fz || n < 2 || !M.visible) return false;
      for (const k in geo.attributes) if (geo.attributes[k].isInstancedBufferAttribute) return false;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const e = M.instanceMatrix.array, col = M.instanceColor ? M.instanceColor.array : null;
      const keyOf = new Map(), ci = new Uint16Array(n), l = new Uint32Array(n), lists = [];
      for (let i = 0; i < n; i++) {
        const o = i * 16, k = Math.floor(e[o + 12] / cell) * 65536 + Math.floor(e[o + 14] / cell);
        let c = keyOf.get(k);
        if (c === undefined) { c = lists.length; keyOf.set(k, c); lists.push([]); }
        ci[i] = c; l[i] = lists[c].length; lists[c].push(i);
      }
      if (lists.length < 2 || lists.length > 65535) return false;
      const local = geo.boundingSphere, chunks = [];
      for (const list of lists) {
        const g = new THREE.BufferGeometry();
        for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
        if (geo.index) g.setIndex(geo.index);
        for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
        g.drawRange = geo.drawRange; g.userData = geo.userData;
        const m = new THREE.InstancedMesh(g, M.material, list.length);
        if (M.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        const A = m.instanceMatrix.array, C = m.instanceColor ? m.instanceColor.array : null;
        list.forEach((i, j) => {
          for (let q = 0; q < 16; q++) A[j * 16 + q] = e[i * 16 + q];
          if (C && col) { C[j * 3] = col[i * 3]; C[j * 3 + 1] = col[i * 3 + 1]; C[j * 3 + 2] = col[i * 3 + 2]; }
        });
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (const k of ['castShadow', 'receiveShadow', 'customDepthMaterial', 'customDistanceMaterial', 'onBeforeRender', 'renderOrder', 'name']) m[k] = M[k];
        m.layers.mask = M.layers.mask;
        m.userData.localSphere = local;
        g.boundingSphere = chunkSphere(A, list.length, local);
        m.frustumCulled = true;
        // tia dò trúng từng instance: thử khối bao hình học gốc theo ma trận từng instance (như cullBySphere của cây)
        m.raycast = function (rc, out) {
          const s = g.boundingSphere;
          g.boundingSphere = local;
          try { THREE.InstancedMesh.prototype.raycast.call(this, rc, out); } finally { g.boundingSphere = s; }
        };
        M.parent.add(m);
        chunks.push(m);
      }
      this.fz = { n, c: chunks, ci, l };
      M.count = 0;
      M.visible = false;
      return true;
    }
  }
  // khối bao mảnh theo ô: tâm hộp bao các gốc instance, bán kính tới gốc xa nhất + bán kính hình học x tỉ lệ lớn nhất
  // (instance đã ẩn — ma trận 0 — không tính)
  function chunkSphere(A, n, local) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let j = 0; j < n; j++) {
      const o = j * 16;
      if (!A[o] && !A[o + 5] && !A[o + 10] && !A[o + 1] && !A[o + 4]) continue;
      x0 = Math.min(x0, A[o + 12]); x1 = Math.max(x1, A[o + 12]); y0 = Math.min(y0, A[o + 13]); y1 = Math.max(y1, A[o + 13]); z0 = Math.min(z0, A[o + 14]); z1 = Math.max(z1, A[o + 14]);
    }
    if (x0 > x1) return new THREE.Sphere(new THREE.Vector3(), 0);
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), lr = local.radius + local.center.length();
    let r = 0;
    for (let j = 0; j < n; j++) {
      const o = j * 16;
      const s = Math.sqrt(Math.max(A[o] * A[o] + A[o + 1] * A[o + 1] + A[o + 2] * A[o + 2], A[o + 4] * A[o + 4] + A[o + 5] * A[o + 5] + A[o + 6] * A[o + 6], A[o + 8] * A[o + 8] + A[o + 9] * A[o + 9] + A[o + 10] * A[o + 10]));
      if (!s) continue;
      r = Math.max(r, Math.hypot(A[o + 12] - c.x, A[o + 13] - c.y, A[o + 14] - c.z) + lr * s);
    }
    return new THREE.Sphere(c, r);
  }
  // instance của mảnh bị dời (sập nhà, nghiêng, văng): nới khối bao mảnh cho khỏi bị cắt khung nhìn nhầm
  const _gs = new THREE.Vector3();
  function growChunk(m, matrix) {
    const s = m.geometry.boundingSphere, L = m.userData.localSphere, a = matrix.elements;
    if (!s || !L) return;
    const sc = Math.sqrt(Math.max(a[0] * a[0] + a[1] * a[1] + a[2] * a[2], a[4] * a[4] + a[5] * a[5] + a[6] * a[6], a[8] * a[8] + a[9] * a[9] + a[10] * a[10]));
    if (!sc) return;
    const d = _gs.set(a[12], a[13], a[14]).distanceTo(s.center) + (L.radius + L.center.length()) * sc;
    if (d > s.radius) s.radius = d;
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------------------------------------------------------------------------
  // HÌNH HỌC VỠ NỨT (khối đơn vị -0.5..0.5): viền gãy lởm chởm ngẫu nhiên, lỗ thủng méo mó, cốt thép lòi ra
  // ---------------------------------------------------------------------------
  function extrudeUnit(shape) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -0.5);
    // UV phẳng theo mặt chính (giữ texture bê tông không méo)
    const p = g.attributes.position, uv = g.attributes.uv;
    const n = g.attributes.normal || (g.computeVertexNormals(), g.attributes.normal);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      if (ax > 0.7) uv.setXY(i, p.getZ(i) + 0.5, p.getY(i) + 0.5);
      else if (ay > 0.7) uv.setXY(i, p.getX(i) + 0.5, p.getZ(i) + 0.5);
      else uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
    }
    return g;
  }
  // Đường gãy răng cưa giữa 2 điểm (các điểm lệch ngẫu nhiên vuông góc)
  function jagged(pts, x0, y0, x1, y1, n, amp, clampFn) {
    for (let i = 1; i < n; i++) {
      const t = i / n + rand(-0.3, 0.3) / n;
      let x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
      const k = rand(-amp, amp);
      x += nx / l * k; y += ny / l * k;
      if (clampFn) [x, y] = clampFn(x, y);
      pts.push(new THREE.Vector2(x, y));
    }
  }
  const cl = (x, y) => [Math.max(-0.5, Math.min(0.5, x)), Math.max(-0.5, Math.min(0.5, y))];
  // Lỗ xuyên khối (hệ đơn vị -0.5..0.5, z = bề dày): miệng lỗ mặt trước loe rộng (bê tông bong vảy quanh điểm chạm),
  // lòng lỗ hẹp ở giữa bề dày, mặt sau bong mảng rộng hơn (sóng ứng suất phản xạ làm bê tông vỡ toác phía sau).
  // kF / kB: bán kính miệng trước / sau so với lòng lỗ (rx, ry). Mép lỗ lởm chởm, ba lớp cùng dáng nhưng lệch nhau.
  // zMid: vị trí eo lỗ theo bề dày (-0,5 mặt sau .. 0,5 mặt trước); lệch về mặt vào -> phễu bong mảng mặt sau sâu hơn
  function boreGeo(cx, cy, rx, ry, kF, kB, zMid) {
    const n = 18, base = [];
    for (let i = 0; i < n; i++) base.push(rand(0.62, 1.32) * (RNG() < 0.2 ? rand(1.15, 1.45) : 1));
    const lim = 0.46;
    const ring = (k, jit) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.12, 0.12);
        const r = base[i] * k * (jit ? rand(0.8, 1.2) : 1);
        let dx = Math.cos(a) * rx * r, dy = Math.sin(a) * ry * r;
        // co điểm vào trong khối theo phương bán kính (không kẹp từng trục -> không tạo mép thẳng)
        const f = Math.min(1, dx ? (Math.sign(dx) * lim - cx) / dx : 1, dy ? (Math.sign(dy) * lim - cy) / dy : 1);
        out.push(new THREE.Vector2(cx + dx * f, cy + dy * f));
      }
      return out;
    };
    const F = ring(kF, true), M = ring(1, false), Bk = ring(kB, true);
    const sq = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(-0.5, 0.5)];
    const face = (hole, z) => {
      const sh = new THREE.Shape(z > 0 ? sq : sq.map(v => new THREE.Vector2(-v.x, v.y)));
      sh.holes.push(new THREE.Path(z > 0 ? hole : hole.map(v => new THREE.Vector2(-v.x, v.y))));
      const g = new THREE.ShapeGeometry(sh);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
      return place(g, [0, 0, z > 0 ? 0.5 : -0.5], [0, z > 0 ? 0 : Math.PI, 0]);
    };
    const parts = [face(F, 1), face(Bk, -1)];
    parts.push(place(new THREE.PlaneGeometry(1, 1), [0.5, 0, 0], [0, Math.PI / 2, 0]), place(new THREE.PlaneGeometry(1, 1), [-0.5, 0, 0], [0, -Math.PI / 2, 0]),
      place(new THREE.PlaneGeometry(1, 1), [0, 0.5, 0], [-Math.PI / 2, 0, 0]), place(new THREE.PlaneGeometry(1, 1), [0, -0.5, 0], [Math.PI / 2, 0, 0]));
    // Vách lòng lỗ: nối miệng trước -> eo giữa -> miệng sau, tam giác quay mặt vào trục lỗ
    const pos = [], uvs = [];
    const zs = [[F, 0.5], [M, zMid !== undefined ? zMid : rand(-0.12, 0.12)], [Bk, -0.5]];
    const tri = (A, B, C) => {
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
      const mx = (A[0] + B[0] + C[0]) / 3 - cx, my = (A[1] + B[1] + C[1]) / 3 - cy;
      const list = nx * mx + ny * my > 0 ? [A, C, B] : [A, B, C];   // pháp tuyến phải hướng vào tâm lỗ
      for (const q of list) { pos.push(q[0], q[1], q[2]); uvs.push(q[3], q[2] + 0.5); }
    };
    for (let l = 0; l < 2; l++) {
      const [P, za] = zs[l], [Q, zb] = zs[l + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = [P[i].x, P[i].y, za, i / n], b = [P[j].x, P[j].y, za, (i + 1) / n], c = [Q[j].x, Q[j].y, zb, (i + 1) / n], d = [Q[i].x, Q[i].y, zb, i / n];
        tri(a, b, c); tri(a, c, d);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tg.computeVertexNormals();
    parts.push(tg);
    return merge(parts);
  }
  // Đường gãy tự nhiên: dao động tần số thấp (mảng vỡ lớn) + sứt nhỏ, thỉnh thoảng gãy bậc -> không thành răng cưa đều
  function crackProfile(n, amp) {
    const out = [];
    let v = 0, slope = rand(-1, 1) * amp;
    for (let i = 0; i <= n; i++) {
      slope = (slope + rand(-1, 1) * amp * 0.9) * 0.75;
      v += slope;
      if (RNG() < 0.12) v += rand(-1, 1) * amp * 1.6;
      out.push(v + rand(-0.5, 0.5) * amp * 0.35);
    }
    const m = out.reduce((a, b) => a + b, 0) / out.length;
    return out.map(x => x - m);
  }
  // Viền khối bị khuyết vỡ: chu vi chia nhỏ, từng điểm co về tâm theo "vết ăn" của các cạnh bị vỡ lan sang
  // (khối hình sao quanh tâm nên co theo bán kính không bao giờ tự cắt). sides: chuỗi 'L' 'R' 'T' 'B'.
  function bittenShape(sides) {
    const E = [['B', -0.5, -0.5, 0.5, -0.5], ['R', 0.5, -0.5, 0.5, 0.5], ['T', 0.5, 0.5, -0.5, 0.5], ['L', -0.5, 0.5, -0.5, -0.5]];
    const has = c => sides.includes(c);
    const pts = [];
    const M = 16;
    for (let e = 0; e < 4; e++) {
      const [key, x0, y0, x1, y1] = E[e];
      const on = has(key), prev = has(E[(e + 3) % 4][0]), next = has(E[(e + 1) % 4][0]);
      // tâm vết ăn dồn về góc có cạnh kề cũng vỡ -> góc khối mất hẳn một mảng
      const tc = prev && next ? rand(0.4, 0.6) : prev ? rand(0.1, 0.4) : next ? rand(0.6, 0.9) : rand(0.25, 0.75);
      const hw = prev && next ? rand(0.65, 0.95) : prev || next ? rand(0.45, 0.8) : rand(0.25, 0.55);
      const D = rand(0.2, 0.62);
      const prof = crackProfile(M, 0.06);
      const skew = rand(0.5, 1.6);   // vết ăn lệch một phía
      for (let i = 0; i < M; i++) {
        const t = i / M;
        let k = 0;
        if (on) {
          const u = (t - tc) / (t < tc ? hw : hw * skew);
          k = Math.abs(u) < 1 ? D * Math.pow(1 - u * u, 0.55) : 0;
          if (k > 0.02) k = Math.max(0.02, Math.min(0.78, k + prof[i] * 1.4));
        }
        const sc = 1 - k;
        pts.push(new THREE.Vector2((x0 + (x1 - x0) * t) * sc, (y0 + (y1 - y0) * t) * sc));
      }
    }
    return extrudeUnit(new THREE.Shape(pts));
  }
  // Cốt thép lòi khỏi mép gãy: chân thanh ngập trong bê tông bên dưới mép, phần lòi ra cong queo cùng một hướng chung;
  // thép nằm ở 2 lớp sát 2 mặt tường (lớp bê tông bảo vệ), khoảng cách không đều
  function rebarAlong(tops) {
    const topAt = x => {
      for (let i = 1; i < tops.length; i++) {
        const [xa, ya] = tops[i - 1], [xb, yb] = tops[i];
        if ((x <= xa && x >= xb) || (x >= xa && x <= xb)) return ya + (yb - ya) * ((x - xa) / ((xb - xa) || 1));
      }
      return tops[0][1];
    };
    const parts = [];
    const n = 2 + Math.floor(RNG() * 4);
    const bendDir = rand(-1, 1);
    for (let i = 0; i < n; i++) {
      const x = -0.4 + (i + rand(0.15, 0.85)) * (0.8 / n);
      const z = (RNG() < 0.5 ? -1 : 1) * rand(0.22, 0.34);
      const y0 = topAt(x) - 0.14;
      const L = rand(0.1, 0.42), h1 = 0.14 + L * rand(0.35, 0.7), h2 = L * rand(0.5, 0.9);
      parts.push(place(new THREE.CylinderGeometry(0.015, 0.017, h1, 4), [x, y0 + h1 / 2, z]));
      const bg = place(new THREE.CylinderGeometry(0.013, 0.015, h2, 4), [0, h2 / 2, 0]);
      bg.applyMatrix4(new THREE.Matrix4().makeRotationZ((bendDir + rand(-0.6, 0.6)) * 1.1));
      bg.applyMatrix4(new THREE.Matrix4().makeRotationY(rand(-0.6, 0.6)));
      bg.translate(x, y0 + h1, z);
      parts.push(bg);
    }
    return merge(parts);
  }
  const FRACTURE = {
    // Khối thủng lỗ méo (đạn xuyên / nổ sát): biến thể dùng chung cho mảng tường nhà
    holed() {
      const R = rand(0.16, 0.22);
      return boreGeo(rand(-0.1, 0.1), rand(-0.08, 0.1), R, R, rand(1.3, 1.6), rand(1.4, 1.9));
    },
    // Gốc khối còn lại sau khi vỡ: mép trên gãy thành mảng lớn nghiêng lệch, có bậc gãy, cao thấp thất thường
    remnant() {
      const n = 18, prof = crackProfile(n, 0.075);
      const base = rand(-0.3, 0.1), tilt = rand(-0.35, 0.35);
      const tops = [];
      for (let i = 0; i <= n; i++) {
        const x = 0.5 - i / n;
        tops.push([x, Math.max(-0.44, Math.min(0.4, base + tilt * x + prof[i]))]);
      }
      const pts = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5)];
      for (const [x, y] of tops) pts.push(new THREE.Vector2(x, y));
      const geo = extrudeUnit(new THREE.Shape(pts));
      geo.userData.rebar = rebarAlong(tops);
      return geo;
    },
    bite(sides) { return bittenShape(sides); }
  };
  // Cốt thép lòi ra: bó thanh thép cong queo (đặt trên mép gãy / chạy ngang qua lỗ thủng)
  function rebarGeo(kind) {
    const parts = [];
    if (kind === 'stub') {
      for (let i = 0; i < 4; i++) {
        const x = -0.36 + i * 0.24 + rand(-0.04, 0.04);
        const h = rand(0.25, 0.6);
        const bend = rand(-0.9, 0.9);
        const a = place(new THREE.CylinderGeometry(0.018, 0.018, h, 4), [x, h / 2, 0]);
        const b = place(new THREE.CylinderGeometry(0.016, 0.016, h * 0.6, 4), [0, h * 0.3, 0]);
        b.applyMatrix4(new THREE.Matrix4().makeRotationZ(bend)); b.translate(x, h, 0);
        parts.push(a, b);
      }
    } else {
      for (let i = -1; i <= 1; i++) {
        parts.push(place(new THREE.CylinderGeometry(0.016, 0.016, 1, 4), [i * 0.22 + rand(-0.03, 0.03), 0, rand(-0.1, 0.1)], [0, 0, rand(-0.25, 0.25)]));
        parts.push(place(new THREE.CylinderGeometry(0.016, 0.016, 1, 4), [0, i * 0.22 + rand(-0.03, 0.03), rand(-0.1, 0.1)], [0, 0, Math.PI / 2 + rand(-0.2, 0.2)]));
      }
    }
    return merge(parts);
  }
  const REBAR_MAT = () => (TEX.__rebarMat || (TEX.__rebarMat = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.8, metalness: 0.5 })));

  /**
   * Bộ khối có thể vỡ theo nhiều trạng thái: nguyên / sứt mép / thủng lỗ / gốc gãy.
   * Mỗi trạng thái + biến thể = 1 InstancedMesh -> không tăng draw call theo số khối.
   */
  class FractureKit {
    constructor(parent, intactMat, brokenMat, cap, opts = {}) {
      this.pools = {};
      // mảng tường nhà: hình nổi khối riêng theo kiểu mặt tường (cửa lõm, bậu, ô văng...), còn lại khối hộp
      const box = opts.panelGeo || new THREE.BoxGeometry(1, 1, 1);
      this.pools.box = new Pool(parent, box, intactMat, cap, { color: true });
      // Mặt tường nguyên nhưng kính cửa đã vỡ do sóng nổ (nhà cửa)
      // kính vỡ: vài kiểu (mỗi kiểu 1 bể, cùng chương trình shader); bể phụ ẩn tới khi có mảng đầu tiên (không tốn lượt vẽ rỗng)
      if (opts.shatterMat) {
        const sm = Array.isArray(opts.shatterMat) ? opts.shatterMat : [opts.shatterMat];
        this.pools.shatterV = sm.map((mt, i) => { const p = new Pool(parent, box, mt, cap, { color: true }); if (i) p.mesh.visible = false; return p; });
        this.pools.shatter = this.pools.shatterV[0];
      }
      this.variants = {};
      this.parent = parent; this.intactMat = intactMat; this.brokenMat = brokenMat; this.cap = cap;
      this.vN = opts.variants || 3;
      this.nCustom = 0;
      this.maxCustom = opts.maxCustom !== undefined ? opts.maxCustom : 40;
      for (const t of ['holed', 'remnant']) this.makeVariants(t);
      this.rebarStub = new Pool(parent, rebarGeo('stub'), REBAR_MAT(), Math.ceil(cap * 0.6) + 4, { castShadow: false });
      this.rebarGrid = new Pool(parent, rebarGeo('grid'), REBAR_MAT(), Math.ceil(cap * 0.6) + 4, { castShadow: false });
    }
    makeVariants(type) {
      const list = this.variants[type] = [];
      const broken = type === 'holed' || type === 'remnant';
      // Sứt mép 1 cạnh hay gặp nhất -> nhiều instance; ghép nhiều cạnh ít hơn
      const cap = Math.ceil(this.cap / this.vN * (type.length > 5 ? 0.5 : 1)) + 4;
      for (let v = 0; v < this.vN; v++) {
        const geo = FRACTURE[type] ? FRACTURE[type]() : FRACTURE.bite(type.slice(4));
        const pool = new Pool(this.parent, geo, broken ? this.brokenMat : this.intactMat, cap, { color: true });
        if (geo.userData.rebar) pool.rebar = new Pool(this.parent, geo.userData.rebar, REBAR_MAT(), cap, { castShadow: false });
        list.push(pool);
      }
      return list;
    }
    poolFor(type) {
      if (type === 'box') return this.pools.box;
      if (type.startsWith('shatter') && this.pools.shatter) { const p = this.pools.shatterV[+type.slice(7) || 0] || this.pools.shatter; p.mesh.visible = true; return p; }
      const list = this.variants[type] || this.makeVariants(type);
      return list[Math.floor(RNG() * list.length)];
    }
    add(type, matrix, color) {
      // Gốc gãy & mép khuyết là phần nhìn thấy rõ của lỗ vỡ -> mỗi khối một hình riêng (sinh lúc vỡ), không lặp mẫu.
      // Quá nhiều khối vỡ thì quay về vài mẫu dùng chung để giữ số lần vẽ thấp.
      if ((type === 'remnant' || type.startsWith('bite')) && this.nCustom < this.maxCustom) {
        const geo = FRACTURE[type] ? FRACTURE[type]() : FRACTURE.bite(type.slice(4));
        const h = this.addCustom(geo, matrix, color || new THREE.Color(1, 1, 1), false, type === 'remnant' ? this.brokenMat : this.intactMat);
        h.type = type;
        return h;
      }
      const pool = this.poolFor(type);
      const idx = pool.add(matrix, color);
      if (idx < 0) return null;
      const h = { type, pool, idx, m: matrix.clone(), c: color ? color.clone() : new THREE.Color(1, 1, 1), extra: [] };
      if (type === 'remnant') { const rp = pool.rebar || this.rebarStub; const r = rp.add(matrix); if (r >= 0) h.extra.push([rp, r]); }
      if (type === 'holed') { const r = this.rebarGrid.add(matrix); if (r >= 0) h.extra.push([this.rebarGrid, r]); }
      return h;
    }
    // Khối mang hình vỡ riêng (lỗ xuyên đúng chỗ đạn chạm, gốc gãy / mép khuyết riêng từng khối): 1 instance riêng,
    // cùng kiểu handle với các khối khác
    addCustom(geo, matrix, color, grid, mat) {
      const pool = new Pool(this.parent, geo, mat || this.brokenMat, 1, { color: true });
      const idx = pool.add(matrix, color);
      pool.commit();
      this.nCustom++;
      const h = { type: 'custom', custom: true, owner: this, pool, idx, m: matrix.clone(), c: color.clone(), extra: [] };
      if (grid) { const r = this.rebarGrid.add(matrix); if (r >= 0) h.extra.push([this.rebarGrid, r]); this.rebarGrid.commit(); }
      if (geo.userData.rebar) {
        const rp = new Pool(this.parent, geo.userData.rebar, REBAR_MAT(), 1, { castShadow: false });
        rp.add(matrix); rp.commit();
        h.rebarMesh = rp.mesh;
      }
      return h;
    }
    hide(h) {
      if (!h) return;
      if (h.custom) {
        this.parent.remove(h.pool.mesh); h.pool.mesh.geometry.dispose();
        if (h.rebarMesh) { this.parent.remove(h.rebarMesh); h.rebarMesh.geometry.dispose(); h.rebarMesh = null; }
        if (!h.freed) { h.freed = true; h.owner.nCustom--; }
      }
      h.pool.hide(h.idx);
      for (const [p, i] of h.extra) p.hide(i);
      h.extra.length = 0;
    }
    // Đổi trạng thái hiển thị của khối (giữ nguyên vị trí / kích thước)
    swap(h, type, color) {
      if (!h) return null;
      this.hide(h);
      const n = this.add(type, h.m, color || h.c);
      this.commit();
      return n || h;
    }
    color(h, c) { if (h) h.pool.color(h.idx, c); }
    commit() {
      this.pools.box.commit();
      if (this.pools.shatterV) for (const p of this.pools.shatterV) p.commit();
      for (const t in this.variants) for (const p of this.variants[t]) { p.commit(); if (p.rebar) p.rebar.commit(); }
      this.rebarStub.commit(); this.rebarGrid.commit();
    }
  }

  // ---------------------------------------------------------------------------
  // ĐỐNG ĐỔ NÁT CHI TIẾT: texture vụn gạch đá lặp theo mét + khối vụn / tấm sàn gãy / thép / đồ của nhà (instanced)
  // Mọi số ngẫu nhiên ở đây chạy trong withSeed (bộ sinh riêng): chỉ để trang trí, không lệch dãy RNG đồng bộ mạng
  // ---------------------------------------------------------------------------
  const RUBBLE_TILE = 32;   // 1 ô texture mặt đống = 4 m (32 đơn vị) -> 128 px/m
  // Mặt đống vụn: hàng nghìn mảnh bê tông / gạch / vữa góc cạnh chồng lên nhau, khe tối giữa các mảnh, sỏi vụn, bụi phủ.
  // Vẽ kèm bản đồ độ cao (mảnh to nổi cao, khe sâu) -> normal map cho mảnh nổi khối dưới nắng. kind: 'stone' | 'wood'
  function rubbleMaps(kind) {
    const key = 'rubble_' + kind;
    if (TEX[key]) return TEX[key];
    let hc = null;
    const map = canvasTex(key + '_c', 512, 512, (g, w, h) => {
      hc = document.createElement('canvas'); hc.width = w; hc.height = h;
      const hg = hc.getContext('2d');
      const wood = kind === 'wood';
      g.fillStyle = wood ? '#211b15' : '#2a2724'; g.fillRect(0, 0, w, h);
      hg.fillStyle = '#000'; hg.fillRect(0, 0, w, h);
      // vẽ lặp sang 4 phía khi mảnh chạm mép (texture lặp liền không lộ đường nối)
      const wrap = (x, y, r, fn) => {
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
          fn(x + ox, y + oy);
        }
      };
      const poly = (c, pts, ox, oy, k) => { c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(ox + px * k, oy + py * k) : c.moveTo(ox + px * k, oy + py * k)); c.closePath(); c.fill(); };
      const tone = () => {
        const L = rand(0.58, 1.06), u = RNG();
        if (wood) {
          if (u < 0.72) return [150 * L, 104 * L, 66 * L];          // ván gỗ cũ
          if (u < 0.86) return [96 * L, 70 * L, 50 * L];            // gỗ cháy sém / ẩm
          return [196 * L, 190 * L, 178 * L];                        // vữa trát, gạch vụn lẫn vào
        }
        if (u < 0.6) return [200 * L, 196 * L, 188 * L];             // bê tông vỡ
        if (u < 0.74) return [180 * L, 108 * L, 82 * L];             // gạch nung tường xây chèn
        if (u < 0.84) return [226 * L, 222 * L, 212 * L];            // vữa trát / sơn tường bong
        if (u < 0.93) return [112 * L, 108 * L, 102 * L];            // mặt gãy mới, ẩm, bẩn
        return [168 * L, 160 * L, 140 * L];                          // cát sỏi
      };
      const piece = (r, shade) => {
        const x = RNG() * w, y = RNG() * h, n = 5 + Math.floor(RNG() * 4), e = rand(0.55, 1), a0 = RNG() * 6.283;
        const pts = [];
        for (let i = 0; i < n; i++) {
          const a = a0 + (i + rand(-0.3, 0.3)) / n * 6.283, rr = r * rand(0.62, 1.1);
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr * e;
          pts.push([px * Math.cos(a0) - py * Math.sin(a0), px * Math.sin(a0) + py * Math.cos(a0)]);
        }
        const [cr, cg, cb] = tone(), hv = Math.min(255, 70 + r * 4.2 + RNG() * 50);
        wrap(x, y, r * 1.3, (X, Y) => {
          if (shade) { g.fillStyle = 'rgba(8,7,6,0.6)'; poly(g, pts, X + r * 0.16, Y + r * 0.2, 1.05); }
          g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`; poly(g, pts, X, Y, 1);
          if (shade) { g.fillStyle = 'rgba(255,250,240,0.13)'; poly(g, pts, X - r * 0.08, Y - r * 0.1, 0.78); }
          const hgr = hg.createRadialGradient(X - r * 0.15, Y - r * 0.15, 0, X, Y, r * 1.05);
          hgr.addColorStop(0, `rgb(${hv | 0},${hv | 0},${hv | 0})`); hgr.addColorStop(1, `rgb(${hv * 0.55 | 0},${hv * 0.55 | 0},${hv * 0.55 | 0})`);
          hg.fillStyle = hgr; poly(hg, pts, X, Y, 1);
        });
        // mảng bê tông to: vết nứt, đá dăm lộ ra
        if (r > 16 && !wood) wrap(x, y, r, (X, Y) => {
          g.strokeStyle = 'rgba(30,27,24,0.55)'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(X - r * 0.5, Y + rand(-0.4, 0.4) * r); g.lineTo(X + rand(-0.2, 0.2) * r, Y + rand(-0.3, 0.3) * r); g.lineTo(X + r * 0.6, Y + rand(-0.4, 0.4) * r); g.stroke();
          for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(${RNG() < 0.5 ? '90,86,80' : '228,224,214'},0.5)`; g.fillRect(X + rand(-0.6, 0.6) * r, Y + rand(-0.5, 0.5) * r, 2, 2); }
        });
      };
      // ván gỗ gãy: thanh dài mép gãy răng cưa, thớ gỗ chạy dọc
      const plank = () => {
        const x = RNG() * w, y = RNG() * h, L = rand(40, 170), T = rand(7, 20), a = RNG() * 6.283, ca = Math.cos(a), sa = Math.sin(a);
        const pts = [[-L / 2, -T / 2], [L / 2 - rand(0, 10), -T / 2], [L / 2 + rand(-4, 8), rand(-0.3, 0.3) * T], [L / 2 - rand(0, 10), T / 2], [-L / 2 + rand(0, 8), T / 2], [-L / 2 - rand(0, 6), rand(-0.3, 0.3) * T]]
          .map(([px, py]) => [px * ca - py * sa, px * sa + py * ca]);
        const [cr, cg, cb] = tone(), hv = 110 + RNG() * 110;
        wrap(x, y, L * 0.6, (X, Y) => {
          g.fillStyle = 'rgba(6,5,4,0.6)'; poly(g, pts, X + 3, Y + 4, 1.02);
          g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`; poly(g, pts, X, Y, 1);
          g.strokeStyle = 'rgba(40,26,16,0.35)'; g.lineWidth = 1;
          for (let k = -2; k <= 2; k++) { const o = k * T * 0.18; g.beginPath(); g.moveTo(X - L * 0.45 * ca - o * sa, Y - L * 0.45 * sa + o * ca); g.lineTo(X + L * 0.45 * ca - o * sa, Y + L * 0.45 * sa + o * ca); g.stroke(); }
          hg.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`; poly(hg, pts, X, Y, 1);
        });
      };
      if (wood) { for (let i = 0; i < 230; i++) plank(); for (let i = 0; i < 420; i++) piece(rand(4, 11), true); }
      else {
        for (let i = 0; i < 70; i++) piece(rand(18, 40), true);
        for (let i = 0; i < 560; i++) piece(rand(7, 18), true);
      }
      // sỏi, gạch vụn nhỏ lấp khe
      for (let i = 0; i < 2600; i++) {
        const x = RNG() * w, y = RNG() * h, r = rand(1.5, 5.5), [cr, cg, cb] = tone();
        g.fillStyle = 'rgba(10,9,8,0.45)'; g.fillRect(x + 0.6, y + 0.8, r, r * 0.8);
        g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`; g.fillRect(x, y, r, r * 0.8);
        hg.fillStyle = `rgb(${90 + r * 12 | 0},0,0)`; hg.fillRect(x, y, r, r * 0.8);
      }
      // bụi trắng đọng loang lổ, mảng to mờ (nhiều lớp mỏng thay vì mảng đặc)
      for (let i = 0; i < 46; i++) {
        const x = RNG() * w, y = RNG() * h, r = rand(30, 95);
        wrap(x, y, r, (X, Y) => {
          const gr = g.createRadialGradient(X, Y, 0, X, Y, r);
          gr.addColorStop(0, `rgba(222,216,204,${rand(0.06, 0.16)})`); gr.addColorStop(1, 'rgba(222,216,204,0)');
          g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2);
        });
      }
      speckle(g, w, h, 3000, ['rgba(20,18,16,0.35)', 'rgba(235,230,220,0.25)'], 1, 2);
    }, true);
    if (!map) return null;
    // normal map từ bản đồ độ cao (kênh đỏ), lặp liền 2 chiều
    const S = 512, src = hc.getContext('2d').getImageData(0, 0, S, S).data;
    const nc = document.createElement('canvas'); nc.width = nc.height = S;
    const ng = nc.getContext('2d'), img = ng.createImageData(S, S), d = img.data, K = 3.2 / 255;
    const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * K, dy = (H(x, y + 1) - H(x, y - 1)) * K;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), o = (y * S + x) * 4;
      d[o] = (-dx * l * 0.5 + 0.5) * 255; d[o + 1] = (dy * l * 0.5 + 0.5) * 255; d[o + 2] = (l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    ng.putImageData(img, 0, 0);
    const normal = new THREE.CanvasTexture(nc);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.anisotropy = 4;
    return (TEX[key] = { map, normal });
  }
  // Lớp chi tiết nhỏ + loang lớn trên mặt đống: lấy lại chính texture ở tỉ lệ ×3.4 (sỏi vụn) và ×0.23 (mảng sáng tối
  // cỡ chục mét) nhân vào màu -> nhìn gần không nhoè, nhìn xa không lộ ô lặp
  function rubbleDetail(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec4 rdA = texture2D(map, vUv * 3.37 + vec2(0.31, 0.67));
          vec4 rdB = texture2D(map, vUv.yx * 0.23 + vec2(0.53, 0.19));
          diffuseColor.rgb *= (0.66 + 0.5 * rdA.g) * (0.78 + 0.42 * rdB.g);
        }`);
    };
    mat.customProgramCacheKey = () => 'rubbleDetail';
    return mat;
  }
  // UV mặt đống theo toạ độ (cục bộ nhà) chia cho cỡ ô texture: lặp đều theo mét dù đống dài 300 đơn vị
  function rubbleUV(geo) {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / RUBBLE_TILE, p.getZ(i) / RUBBLE_TILE);
    uv.needsUpdate = true;
  }
  // AO theo đỉnh: đỉnh trũng hơn các đỉnh quanh nó (bán kính 1-2 ô lưới) là khe rỗng giữa các tảng -> tối;
  // gờ nhô sáng hơn chút; thêm đốm khe tối tần số cao (hash theo đỉnh) như lỗ hổng giữa các cục bê tông
  function rubbleAO(col, top, nx, nz, hsh) {
    const W1 = nx + 1, N = top.length;
    for (let i = 0; i < N; i++) {
      const ix = i % W1, iz = (i - ix) / W1;
      let s = 0, n = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dz) continue;
        const x = ix + dx, z = iz + dz;
        if (x < 0 || z < 0 || x > nx || z > nz) continue;
        s += top[z * W1 + x]; n++;
      }
      if (!n || top[i] <= 0) continue;
      const lap = top[i] - s / n;
      let k = lap < 0 ? Math.max(0.5, 1 + lap * 0.13) : Math.min(1.08, 1 + lap * 0.03);
      const v = hsh(ix * 1.7 + 0.3, iz * 2.3 + 0.7);
      if (v > 0.8) k *= 0.62 + (1 - v) * 1.2;
      col[i * 3] *= k; col[i * 3 + 1] *= k; col[i * 3 + 2] *= k;
    }
  }
  // Hình khối vụn dùng chung (đơn vị -0.5..0.5, tạo 1 lần lúc dựng bản đồ)
  const RUBBLE_GEO = {
    // cục bê tông vỡ góc cạnh
    block() { const g = jitter(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).toNonIndexed(), 0.42, 17); g.computeVertexNormals(); return g; },
    // đá / gạch vụn tròn cạnh
    stone() { const g = jitter(new THREE.IcosahedronGeometry(0.5, 0), 0.5, 23); g.computeVertexNormals(); return g; },
    // mảnh dẹt (vữa trát, mảnh sàn nhỏ, gạch lát)
    shard() {
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = (i + rand(-0.3, 0.3)) / 6 * 6.283, r = rand(0.32, 0.5); pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
      const g = extrudeUnit(new THREE.Shape(pts));
      g.rotateX(-Math.PI / 2);
      return g;
    },
    // tấm sàn gãy: viền răng cưa, 1 góc gãy mất; lưu điểm trên mép gãy + pháp tuyến ra ngoài (chỗ thép lòi ra)
    plate() {
      const pts = [], edges = [];
      const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], cut = Math.floor(RNG() * 4);
      for (let e = 0; e < 4; e++) {
        const [x0, y0] = C[e], [x1, y1] = C[(e + 1) % 4], ox = y1 - y0, oy = -(x1 - x0);   // pháp tuyến ra ngoài
        const M = 9;
        for (let i = 0; i < M; i++) {
          const t = i / M;
          let k = i ? rand(0.01, 0.08) + (RNG() < 0.16 ? rand(0.08, 0.2) : 0) : 0.02;
          if (e === cut && t < 0.45) k += (0.45 - t) * rand(0.7, 1.1);            // góc gãy vát
          if (e === (cut + 3) % 4 && t > 0.6) k += (t - 0.6) * rand(0.7, 1.1);
          const px = x0 + (x1 - x0) * t - ox * k, py = y0 + (y1 - y0) * t - oy * k;
          pts.push(new THREE.Vector2(px, py));
          if (i === 3 || i === 6) edges.push({ x: px, z: -py, nx: ox, nz: -oy });
        }
      }
      const g = extrudeUnit(new THREE.Shape(pts));
      g.rotateX(-Math.PI / 2);   // mặt tấm nằm ngang, bề dày theo Y
      g.userData.edges = edges;
      return g;
    },
    // bó thép lòi khỏi mép gãy: chân ngập trong bê tông, đoạn ngoài cong gập (đơn vị thế giới, dọc +X)
    rebar() {
      const parts = [], n = 3 + Math.floor(RNG() * 3);
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * rand(1.3, 1.9), y = rand(-0.3, 0.3), L1 = rand(2.5, 6), L2 = rand(1.5, 5);
        const a = place(new THREE.CylinderGeometry(0.21, 0.21, L1 + 1.5, 5), [0, 0, 0], [0, 0, -Math.PI / 2]);
        a.translate((L1 - 1.5) / 2, y, z);
        const b = place(new THREE.CylinderGeometry(0.2, 0.2, L2, 5), [0, L2 / 2, 0]);
        b.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand(-0.5, 0.5), 0, -Math.PI / 2 + (RNG() < 0.5 ? -1 : 1) * rand(0.4, 1.3))));
        b.translate(L1, y, z);
        parts.push(a, b);
      }
      return merge(parts);
    },
    // ván / xà gỗ gãy
    plank() { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); return g; },
    // khung cửa đi (rộng 1 m cao 2.1 m, tiết diện 10x12 cm): 2 thanh đứng + thanh ngang trên
    frame() {
      return merge([place(new THREE.BoxGeometry(0.85, 17, 1), [-4.2, 8.5, 0]), place(new THREE.BoxGeometry(0.85, 17, 1), [4.2, 8.5, 0]),
        place(new THREE.BoxGeometry(9.25, 0.85, 1), [0, 17, 0]), place(new THREE.BoxGeometry(0.5, 15, 0.3), [-3.6, 8, 0.4])]);
    },
    pipe() { return new THREE.CylinderGeometry(0.5, 0.5, 1, 7, 1); },
    // mảng ngói còn dính nhau: tấm gợn sóng theo hàng ngói
    tile() {
      const g = new THREE.PlaneGeometry(1, 1, 8, 2);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, Math.abs(Math.sin(p.getX(i) * Math.PI * 4)) * 0.6);
      g.computeVertexNormals();
      return g;
    },
    // tấm tôn sóng bị gập cong
    sheet() {
      const g = new THREE.PlaneGeometry(1, 1, 24, 4);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, Math.sin(x * Math.PI * 22) * 0.5 + (z + 0.5) * (z + 0.5) * 6 + x * x * 3); }
      g.computeVertexNormals();
      return g;
    },
    dust() { const g = new THREE.CircleGeometry(1, 18); g.rotateX(-Math.PI / 2); return g; }
  };
  function rubbleDustTex() {
    return canvasTex('rubbleDust', 128, 128, (g, w, h) => {
      const img = g.createImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // viền loang méo (không tròn đều), giữa đặc vừa phải, hạt lấm tấm
        const dx = x / w * 2 - 1, dy = y / h * 2 - 1, an = Math.atan2(dy, dx), o = (y * w + x) * 4;
        const r = Math.sqrt(dx * dx + dy * dy) / (0.82 + 0.12 * Math.sin(an * 3 + 1.3) + 0.06 * Math.sin(an * 7 + 0.4));
        const a = Math.max(0, 1 - r) ** 1.8 * (0.7 + 0.6 * RNG());
        d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.min(255, a * 120);
      }
      g.putImageData(img, 0, 0);
    });
  }
  function rubblePlankTex() {
    return canvasTex('rubblePlank', 64, 256, (g, w, h) => {
      g.fillStyle = '#9b7a58'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${RNG() < 0.5 ? '60,40,24' : '200,170,130'},${rand(0.08, 0.25)})`; g.fillRect(RNG() * w, 0, rand(1, 3), h); }
      speckle(g, w, h, 300, ['rgba(40,28,18,0.3)', 'rgba(220,200,170,0.2)'], 1, 2);
    }, true);
  }

  // Số ngẫu nhiên CHỈ cho hình ảnh (mảnh văng, bụi, hoạt cảnh rơi): không lấy từ bộ sinh số có hạt giống (RNG) ->
  // kết quả phá hủy đồng bộ mạng không phụ thuộc máy nào có / không có hệ hiệu ứng
  const vr = (a, b) => a + Math.random() * (b - a);
  // Gió thổi bụi trôi (gia tốc ngang, đv/s²): theo gió đường đạn của trận nếu có, không thì gió nhẹ ngẫu nhiên
  function dustDrift() {
    const W = typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind;
    if (W) return [Math.max(-4, Math.min(4, (W.vx || 0) * 0.3)), Math.max(-4, Math.min(4, (W.vz || 0) * 0.3))];
    return [vr(-0.9, 0.9), vr(-0.9, 0.9)];
  }

  // Bụi / đá vụn dùng hệ hạt của ExplosionFX nếu có. Bụi vữa / xi măng không tan ngay: phụt ra, lững lờ 4-9 s, trôi theo gió
  function dustBurst(fx, x, y, z, n, size, col) {
    if (!fx || !fx.smoke) return;
    const [wx, wz] = dustDrift();
    for (let i = 0; i < n; i++) {
      fx.smoke.add({
        x: x + rand(-size, size) * 0.4, y: y + rand(0, size * 0.3), z: z + rand(-size, size) * 0.4,
        vx: rand(-14, 14), vy: rand(4, 22), vz: rand(-14, 14), size: size * rand(0.5, 0.9), grow: size * 0.35,
        drag: 1.6, grav: -0.5, life: rand(3, 6) * 1.5, alpha: 0.55, fadeIn: 0.08, fadePow: 1.6, ax: wx, az: wz, c0: col || [0.7, 0.68, 0.64], cell: 2
      });
    }
  }
  // Mảnh bê tông văng theo vận tốc THẬT (đv/s; 8 đv = 1 m), rơi đúng trọng lực 78,5 đv/s² (9,81 m/s²) của RockLayer.
  // Toả hình nón quanh hướng (dx, dy, dz), spread = tan nửa góc nón. Phân bố cỡ như bê tông vỡ thật: nhiều sạn nhỏ
  // (bể fx.bits, bán kính 0,05-0,18 đv ~ 0,6-2 cm) bay nhanh nhất nhưng bị không khí hãm mạnh; ít mảnh to (fx.hardRocks,
  // bán kính s0-s1) nhận ít động năng / kg hơn -> chậm hơn 40-65%. Phần lớn mảnh chậm, số ít rất nhanh (phân bố u²).
  // o: { bits, chunks, v0, v1 (đv/s), spread, up, s0, s1, col }
  function spray(fx, x, y, z, dx, dy, dz, o) {
    if (!fx || !fx.hardRocks) return;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    let ux = -dz, uz = dx;
    const ul = Math.hypot(ux, uz);
    if (ul < 1e-3) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
    const wx = dy * uz, wy = dz * ux - dx * uz, wz = -dy * ux;   // w = d × u (u nằm ngang)
    const spread = o.spread !== undefined ? o.spread : 0.6, col = o.col || [0.72, 0.71, 0.68];
    const dir = () => {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * spread, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      const ex = dx + ux * ca + wx * sa, ey = dy + wy * sa + (o.up || 0), ez = dz + uz * ca + wz * sa, l = Math.hypot(ex, ey, ez) || 1;
      return [ex / l, ey / l, ez / l];
    };
    const speed = () => { const u = Math.random(); return o.v0 + (o.v1 - o.v0) * u * u; };
    const shade = k => [Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k)];
    const bitsL = fx.bits || fx.hardRocks;
    for (let i = 0; i < (o.bits || 0); i++) {
      const d = dir(), sp = speed(), size = vr(0.05, 0.18);
      // cản khí động bậc 2 của mảnh dẹt góc cạnh (Cd ~1,1): sạn 1 cm bay 40 m/s chịu hãm ~50 m/s²
      bitsL.add({ raw: true, x: x + vr(-0.4, 0.4), y: y + vr(-0.4, 0.4), z: z + vr(-0.4, 0.4), vx: d[0] * sp, vy: d[1] * sp, vz: d[2] * sp,
        size, cd: 0.0002 / size, e: 0.35, life: vr(3, 5), restLife: vr(40, 90), c: shade(vr(0.85, 1.12)) });
    }
    for (let i = 0; i < (o.chunks || 0); i++) {
      const d = dir(), sp = speed() * vr(0.35, 0.6), size = vr(o.s0 || 0.2, o.s1 || 0.5);
      fx.hardRocks.add({ raw: true, x: x + vr(-0.6, 0.6), y: y + vr(-0.6, 0.6), z: z + vr(-0.6, 0.6), vx: d[0] * sp, vy: d[1] * sp, vz: d[2] * sp,
        size, cd: 0.0002 / size, e: 0.22, life: vr(4, 7), restLife: vr(150, 300), c: shade(vr(0.8, 1.05)) });
    }
  }
  // Bụi xi măng xám trắng: phụt theo hướng (nx, nz) rồi lững lờ 6-11 s, nở rộng dần, trôi theo gió, lắng rất chậm
  // (nx = nz = 0: toả đều quanh điểm)
  function cementDust(fx, x, y, z, nx, nz, n, size, sp, col) {
    if (!fx || !fx.smoke) return;
    const [ax, az] = dustDrift(), c = col || [0.74, 0.72, 0.68], radial = !nx && !nz;
    for (let i = 0; i < n; i++) {
      const v = sp * vr(0.3, 1), k = vr(0.9, 1.06), a = Math.random() * 6.283;
      const dx = radial ? Math.cos(a) : nx, dz = radial ? Math.sin(a) : nz;
      fx.smoke.add({ x: x + vr(-1, 1) * size * 0.25, y: y + vr(-0.4, 0.6) * size * 0.25, z: z + vr(-1, 1) * size * 0.25,
        vx: dx * v + vr(-4, 4), vy: vr(1, 7), vz: dz * v + vr(-4, 4), ax, az,
        size: size * vr(0.45, 0.8), grow: size * vr(0.18, 0.3), drag: 1.5, grav: vr(-0.3, 0.5), life: vr(6, 11), alpha: vr(0.4, 0.55),
        fadeIn: 0.06, fadePow: 1.7, c0: [c[0] * k, c[1] * k, c[2] * k], c1: [Math.min(1, c[0] * k * 1.05), Math.min(1, c[1] * k * 1.05), Math.min(1, c[2] * k * 1.05)], cell: 2 });
    }
  }
  function chunks(fx, x, y, z, n, sz, col, up) {
    if (!fx || !fx.hardRocks) return;
    for (let i = 0; i < n; i++) {
      const a = RNG() * 6.283, sp = rand(15, 60);
      fx.hardRocks.add({ x: x + rand(-2, 2), y: y + rand(-1, 2), z: z + rand(-2, 2), vx: Math.cos(a) * sp, vy: rand(10, up || 45), vz: Math.sin(a) * sp, size: rand(sz * 0.25, sz * 0.6), life: rand(3, 6), c: col || [0.47, 0.46, 0.43] });
    }
  }

  // ===========================================================================
  // CÂY
  // ===========================================================================
  const TREE_COLORS = {
    ok: new THREE.Color(1, 1, 1),
    scorched: new THREE.Color(0.55, 0.42, 0.25),
    charred: new THREE.Color(0.12, 0.1, 0.09)
  };

  // ---- Gió: lay cả cây (cong dần theo chiều cao, gió giật không đều) + lá rung lăn tăn. Tính trong shader theo
  // hướng gió THẾ GIỚI (đổi ngược qua ma trận instance) -> cả rừng ngả cùng một hướng, bóng đổ lay theo
  const WIND = { value: 0 };
  // hướng gió + độ mạnh lay + cơn giật dùng chung với thời tiết (weather.js WINDV): mưa giông cây ngả rạp, lá rung mạnh
  const WINDV_CALM = { value: new THREE.Vector4(0.8, 0.6, 1, 0) };
  const windV = () => (typeof Weather !== 'undefined' && Weather.WINDV) || WINDV_CALM;
  let _lastWindNow = 0;
  const windTick = () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    const dt = _lastWindNow > 0 ? Math.min(0.1, Math.max(0, now - _lastWindNow)) : 0;
    if (dt > 0) {
      _lastWindNow = now;
      const k = windV().value.z;
      WIND.value = (WIND.value + dt * (0.75 + 0.25 * Math.min(k, 2.5))) % 36000;
    } else if (_lastWindNow === 0) {
      _lastWindNow = now;
    }
  };
  const TREE_SWAY = `
    #ifdef USE_INSTANCING
      vec3 twP = instanceMatrix[3].xyz;
      float twS2 = max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 1e-6);
      float twPh = twP.x * 0.011 + twP.z * 0.013;
      float twH = max(position.y, 0.0);
      float twK = uWindV.z;
      // Nhịp uốn chính của thân cây theo gió (không nhân uWind với twK trong sin để tránh nhảy pha khi gió giật thay đổi)
      float twG = 0.5 + sin(uWind * 0.9 + twPh) * 0.38 + sin(uWind * 1.7 + twPh * 2.1) * 0.16;
      // cây nghiêng / đã đổ nằm trên đất thì không lay theo gió (chỉ cây đứng mới cong ngọn)
      float twUp = clamp(instanceMatrix[1].y / sqrt(twS2), 0.0, 1.0);
      twUp *= twUp * twUp;
      // Gió mạnh / giật gió: ngả xuôi gió, biên độ tăng mượt theo twK và uWindV.w
      twG = twG * (0.7 + 0.25 * min(twK, 2.2)) + max(twK - 1.0, 0.0) * 0.28 + sin(uWind * 2.8 + twPh * 3.2) * uWindV.w * 0.22;
      vec3 twW = vec3(uWindV.x, 0.0, uWindV.y) * (twG * pow(twH, 1.8) * 0.0012 * twUp * (0.6 + 0.35 * min(twK, 2.2)));

      // 1) CÀNH NHÁNH & CÁNH XƯƠNG RỒNG:
      // Các phần cành nhánh vươn ngang ra khỏi trục thân đung đưa nhẹ nhàng, đồng pha theo nhánh
      float twBranchR = length(position.xz);
      // (rễ nổi sát đất toả xa thân: không đung đưa như cành)
      float twBranchFlex = smoothstep(1.0, 6.0, twBranchR) * smoothstep(1.5, 4.0, position.y);
      if (twBranchFlex > 0.01) {
        float bPh = position.x * 0.15 + position.z * 0.15 + twPh * 3.0;
        float bWave = sin(uWind * 1.4 + bPh);
        float bBounce = sin(uWind * 1.8 + bPh * 1.3) * 0.12;
        vec3 branchMotion = vec3(
          uWindV.x * 0.14 * bWave,
          bBounce,
          uWindV.y * 0.14 * bWave
        ) * twBranchFlex * (0.55 + 0.35 * min(twK, 2.0) + 0.45 * uWindV.w) * twUp;
        twW += branchMotion;
      }

      // 2) TÁN LÁ & TÀU LÁ CỌ: rung rinh xào xạc nhẹ theo gió
      #ifdef TREE_LEAFY
        float twF = smoothstep(3.0, 20.0, twH) * (0.07 + 0.11 * twUp) * (0.6 + 0.3 * min(twK, 2.0) + 0.5 * uWindV.w);
        twW += vec3(
          sin(uWind * 2.6 + position.x * 0.25 + twPh * 5.0),
          0.45 * sin(uWind * 3.1 + position.z * 0.25 + position.y * 0.2),
          cos(uWind * 2.4 + position.z * 0.25 + twPh * 3.2)
        ) * twF;
      #endif

      transformed += vec3(dot(instanceMatrix[0].xyz, twW), dot(instanceMatrix[1].xyz, twW), dot(instanceMatrix[2].xyz, twW)) / twS2;
    #endif`;
  // Thẻ lá billboard: mọi đỉnh của thẻ nằm ở tâm thẻ, nới ra theo 'corner' trong không gian camera -> thẻ luôn quay mặt
  // về phía người nhìn (và về phía mặt trời khi vẽ bóng), không bao giờ bị nhìn nghiêng thành mảnh mỏng lơ lửng
  const TREE_PROJECT = `
    vec4 mvPosition = vec4(transformed, 1.0);
    float bbS = 1.0;
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      bbS = length(instanceMatrix[0].xyz);
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    mvPosition.xy += corner * bbS;
    gl_Position = projectionMatrix * mvPosition;`;
  // Vật liệu cây: gió + nhân màu từng đỉnh (attribute tint: độ tối trong tán / gốc thân, lệch màu từng chùm lá)
  // mode: 'leaf' tán lá | 'trunk' thân (cây gãy: bỏ phần dưới chỗ gãy -> chỉ còn ngọn đổ) | 'stump' gốc cụt (bỏ phần trên chỗ gãy)
  // Chỗ gãy lấy từ attribute instance 'brk' (độ cao gãy theo đơn vị cục bộ của cây, 0 = chưa gãy / bật cả gốc)
  // Tán lá cũng cắt theo chỗ gãy (thẻ lá cắt theo tâm thẻ): 'leaf' tán khúc ngọn | 'leafStump' phần tán dưới chỗ gãy ở lại trên gốc cụt
  const isLeaf = mode => mode === 'leaf' || mode === 'leafStump';
  function brkCut(fs, mode) {
    return 'varying float vBrk;\nvarying float vLY;\n' + fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' +
      (mode === 'stump' || mode === 'leafStump' ? '  if (vLY > vBrk) discard;' : '  if (vBrk > 0.0 && vLY < vBrk) discard;'));
  }
  // Cháy: attribute instance 'burn' — tán lá: tiến độ cháy 0..1 (lá cháy loang dần theo nhiễu, mép cháy đỏ rực rồi đen);
  // thân / gốc cụt: độ rực than hồng 0..1 trong các vết nứt vỏ (đang cháy / âm ỉ sau khi cháy)
  const BURN_GLSL = `
    float tHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float tNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(tHash(i), tHash(i + vec3(1, 0, 0)), f.x), mix(tHash(i + vec3(0, 1, 0)), tHash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(tHash(i + vec3(0, 0, 1)), tHash(i + vec3(1, 0, 1)), f.x), mix(tHash(i + vec3(0, 1, 1)), tHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    // > 0: lá còn, giá trị = khoảng cách tới mép cháy; < 0: đã cháy hết
    float leafBurnD(vec3 lp, vec2 uv, float b) {
      float n = tNoise(lp * 0.16) * 0.72 + tNoise(vec3(uv * 5.0, lp.y * 0.1)) * 0.28;
      return n - (b * 1.2 - 0.1);
    }
  `;
  const BURN_DECL = 'varying float vBurn;\nvarying vec3 vLP;\nuniform float uWind;\n' + BURN_GLSL;
  // Mảng màu trong tán, khác nhau giữa từng cây (pha nhiễu lấy theo vị trí cây): vùng lá úa vàng / khô, vùng lá non xanh
  // hơn. Tính theo đỉnh (thẻ lá: tâm thẻ, cành thông: từng đốt) -> loang theo từng chùm, không tốn thêm lệnh vẽ
  const LEAF_PATCH = `
  #ifdef USE_INSTANCING
    float tvH = fract(sin(dot(instanceMatrix[3].xz, vec2(0.1271, 0.3117))) * 43758.5453);
    float tvN = sin(position.x * 0.23 + tvH * 41.0) * sin(position.z * 0.21 + tvH * 17.0) * sin(position.y * 0.17 + tvH * 29.0);
    vTint *= mix(vec3(1.0), vec3(1.04, 0.98, 0.78), smoothstep(0.25, 0.85, tvN) * (0.1 + 0.25 * tvH));
    vTint *= mix(vec3(1.0), vec3(0.86, 1.03, 0.92), smoothstep(0.3, 0.9, -tvN) * 0.55);
  #endif`;
  function treeVS(vs, mode, tint) {
    const leafy = isLeaf(mode);
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + TREE_SWAY + (tint ? '\n  vTint = tint;' + (leafy ? LEAF_PATCH : '') : '') +
      '\n  vBrk = brk; vLY = position.y;\n  vBurn = burn; vLP = position;');
    if (leafy) vs = 'attribute vec2 corner;\n' + vs.replace('#include <project_vertex>', TREE_PROJECT);
    vs = 'attribute float brk;\nvarying float vBrk;\nvarying float vLY;\n' + vs;
    return (leafy ? '#define TREE_LEAFY\n' : '') + (tint ? 'attribute vec3 tint;\nvarying vec3 vTint;\n' : '') +
      'attribute float burn;\nvarying float vBurn;\nvarying vec3 vLP;\nuniform float uWind;\nuniform vec4 uWindV;\n' + vs;
  }
  // Nhìn qua kính ngắm khi xe núp trong bụi / dưới tán cây: lá ngay sát ống kính che kín cả kính (thật ra kính nhô lên khỏi
  // bụi / pháo thủ vạch lá ra). Bỏ vẽ phần tán lá & bụi nằm trong bán kính quanh camera kính ngắm.
  // xyz = vị trí camera, w = bán kính (0 = tắt). game.js đặt mỗi khung hình khi đang ngắm.
  const SIGHT_CULL = { value: new THREE.Vector4(0, 0, 0, 0) };
  function sightCull(mat) {
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      sh.uniforms.uSightCull = SIGHT_CULL;
      sh.vertexShader = 'varying vec3 vSCW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    vSCW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vSCW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`);
      sh.fragmentShader = 'uniform vec4 uSightCull;\nvarying vec3 vSCW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  if (uSightCull.w > 0.0 && distance(vSCW, uSightCull.xyz) < uSightCull.w) discard;`);
    };
    mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '_sc';
    return mat;
  }

  function treeMat(mat, mode) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uWind = WIND;
      sh.uniforms.uWindV = windV();
      sh.vertexShader = treeVS(sh.vertexShader, mode, true);
      // lá: nén độ tối trong tán (pow 0.7) — lòng tán / mặt dưới tán tối nguyên mức thì cả tán sẫm gần đen, chỉ vài thẻ lá ngoài
      // cùng sáng nổi lên như hình dán
      let fs = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= ' + (isLeaf(mode) ? 'pow(vTint, vec3(0.7))' : 'vTint') + ';' + (isLeaf(mode) ? `
  if (vBurn > 0.0) {
    float bd = leafBurnD(vLP, vUv, vBurn);
    if (bd < 0.0) discard;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.035), (1.0 - smoothstep(0.0, 0.2, bd)) * 0.92);
  }` : ''));
      fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (isLeaf(mode) ? `
  if (vBurn > 0.0 && vBurn < 1.0) {
    float bd2 = leafBurnD(vLP, vUv, vBurn);
    float fl = 0.65 + 0.35 * sin(uWind * 19.0 + vLP.x * 0.8 + vLP.z * 0.6);
    totalEmissiveRadiance += vec3(1.0, 0.38, 0.06) * (1.0 - smoothstep(0.0, 0.06, bd2)) * 2.6 * fl;
  }` : `
  if (vBurn > 0.0) {
    float cr = smoothstep(0.7, 0.84, tNoise(vLP * vec3(2.4, 0.45, 2.4)));
    float fl = 0.7 + 0.3 * sin(uWind * 11.0 + vLP.y * 0.7);
    totalEmissiveRadiance += vec3(1.0, 0.33, 0.05) * cr * vBurn * 2.2 * fl;
  }`));
      if (isLeaf(mode)) fs = fs.replace('#include <alphatest_fragment>', LEAF_ALPHA(texW, texH) + '\n#include <alphatest_fragment>')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LEAF_SKY + LEAF_TRANSLUCENT);
      // Lá 2 mặt (tàu dừa, cành thông): mặt sau giữ pháp tuyến "khối tán" chứ không lật như three mặc định (lật -> nửa cành quay lưng
      // tối sập hẳn so với nửa kia, lộ rõ từng mảnh phẳng), chỉ tối bớt (mặt dưới khuất nắng). Thẻ billboard luôn quay mặt trước: không đổi
      if (isLeaf(mode)) fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal); geometryNormal = normal;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.72;');
      if (isLeaf(mode)) sh.uniforms.uLeafTr = LEAF_TR;
      sh.fragmentShader = brkCut('varying vec3 vTint;\n' + (isLeaf(mode) ? 'uniform float uLeafTr;\n' : '') + BURN_DECL + fs, mode);
    };
    const img = mat.map && mat.map.image, texW = (img && img.width) || 256, texH = (img && img.height) || 256;
    if (isLeaf(mode)) mat.extensions = { derivatives: true };
    mat.customProgramCacheKey = () => 'tree_' + mode + (isLeaf(mode) ? '_' + texW + 'x' + texH : '');
    return mat;
  }
  // Độ trong của thẻ lá (alphaTest 0.4 + alphaToCoverage):
  //  - bù alpha theo mức mipmap: ảnh lá thu nhỏ (ở xa) có alpha bị pha loãng -> lá mỏng dần, lốm đốm
  //  - làm sắc alpha quanh ngưỡng cắt: trong lá đặc hẳn, chỉ dải ~1 điểm ảnh ở mép lá mới dùng độ phủ MSAA (khử răng cưa).
  //    Không làm vậy thì alpha lửng khắp tán lá thành mẫu chấm phủ nửa trong suốt, đổi liên tục khi lá / camera dịch đi
  //    -> tán lá "nhiễu" lấm tấm không ngừng
  const LEAF_ALPHA = (w, h) => `
  {
    vec2 tq = vUv * vec2(${w.toFixed(1)}, ${h.toFixed(1)}); vec2 da = dFdx(tq), db = dFdy(tq);
    float lod = max(0.0, 0.5 * log2(max(dot(da, da), dot(db, db))));
    diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + lod * 0.3));
    diffuseColor.a = clamp((diffuseColor.a - 0.4) / max(fwidth(diffuseColor.a), 1e-4) + 0.5, 0.0, 1.0);
  }`;
  // ÁNH TRỜI TRONG TÁN: lá mỏng tán xạ ánh trời qua nhiều lớp lá -> mặt khuất nắng của tán vẫn xanh lục vừa, không thành khối
  // đen sẫm hơn hẳn bãi cỏ cạnh bên (bật cả khi tắt lá xuyên sáng ở máy yếu)
  const LEAF_SKY = `
  reflectedLight.indirectDiffuse *= 1.5;`;
  // LÁ XUYÊN SÁNG (lá mỏng): nhìn ngược nắng -> nắng lọt qua phiến lá thành xanh vàng rực (tán ngược sáng); mặt tán khuất
  // nắng vẫn nhận ánh lọt qua các lớp lá (không đen sập như khối đặc). Lá nằm trong bóng (bóng đổ của nắng) lọt sáng yếu
  const LEAF_TRANSLUCENT = `
  #if NUM_DIR_LIGHTS > 0
  if (uLeafTr > 0.0) {
    vec3 tL = directionalLights[0].direction;
    // không đọc lại bản đồ bóng (bóng mềm nhiều mẫu x lá chồng hàng chục lớp -> khung chậm gấp mấy lần): lấy độ sâu trong
    // tán (vTint đã tối dần vào trong tán / phía dưới tán) làm độ "khuất nắng"
    float tSh = smoothstep(0.55, 0.95, dot(vTint, vec3(0.3333)));
    float tBack = pow(clamp(dot(geometry.viewDir, -tL), 0.0, 1.0), 4.0) * 0.6;
    float tWrap = 0.14 * (1.0 - clamp(dot(geometry.normal, tL), 0.0, 1.0));
    reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 1.06, 0.55) * directionalLights[0].color * (tBack * tSh + tWrap * mix(0.4, 1.0, tSh));
  }
  #endif`;
  // Bóng đổ khớp với cây đang lay / gãy / cháy loang + cắt theo viền lá
  function treeDepthMat(map, mode) {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: map ? 0.4 : 0 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uWind = WIND;
      sh.uniforms.uWindV = windV();
      sh.vertexShader = treeVS(sh.vertexShader, mode, false);
      let fs = sh.fragmentShader;
      if (isLeaf(mode)) fs = fs.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  if (vBurn > 0.0 && leafBurnD(vLP, vUv, vBurn) < 0.0) discard;');
      sh.fragmentShader = brkCut(BURN_DECL + fs, mode);
    };
    m.customProgramCacheKey = () => 'treeD_' + mode;
    return m;
  }
  // Hồ sơ thân chính theo độ cao (bước 2 đv cục bộ): tâm thân (x,z) & bán kính -> đặt đúng gốc cụt / vết gãy trên thân cong
  function stemProfile(list) {
    const B = [];
    let top = 0;
    for (const g of list) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), b = Math.max(0, Math.round(y / 2));
        (B[b] || (B[b] = [])).push(p.getX(i), p.getZ(i));
        if (y > top) top = y;
      }
    }
    const prof = [];
    let last = { x: 0, z: 0, r: 1 };
    for (let b = 0; b < B.length; b++) {
      const a = B[b];
      if (a && a.length) {
        let cx = 0, cz = 0;
        for (let i = 0; i < a.length; i += 2) { cx += a[i]; cz += a[i + 1]; }
        cx /= a.length / 2; cz /= a.length / 2;
        let r = 0;
        for (let i = 0; i < a.length; i += 2) r += Math.hypot(a[i] - cx, a[i + 1] - cz);
        last = { x: cx, z: cz, r: Math.max(0.2, r / (a.length / 2)) };
      }
      prof.push(last);
    }
    return { top, prof };
  }
  const stemAt = (info, y) => { const P = info.stem.prof; return P[Math.max(0, Math.min(P.length - 1, Math.round(y / 2)))]; };
  // Khối tán khi cây nằm: tâm (độ cao cục bộ dọc thân) & bán kính ngang -> tán chống thân lên, không lún nửa xuống đất
  function canopyOf(geo, yMin) {
    const p = geo.attributes.position;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < yMin) continue;
      const x = p.getX(i), z = p.getZ(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (y0 === Infinity) return null;
    return { dc: (y0 + y1) / 2, rc: Math.max(x1 - x0, z1 - z0) / 2, ry: (y1 - y0) / 2 };
  }
  // Thớ gỗ tươi lộ ra ở vết gãy: vàng nhạt, sợi dọc, vân tối lấm tấm
  function woodTex() {
    return canvasTex('woodBreak', 64, 64, (g, w, h) => {
      g.fillStyle = '#9c7a52'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 1.5) { g.fillStyle = `rgba(${RNG() < 0.6 ? '70,48,28' : '215,185,140'},${rand(0.12, 0.4)})`; g.fillRect(x, 0, 1, h); }
      speckle(g, w, h, 120, ['rgba(90,60,30,0.35)', 'rgba(255,240,210,0.2)'], 1, 2);
    }, true);
  }
  // Vết gãy tua tủa: ống thân với mép trên lởm chởm dăm gỗ + mặt gỗ gãy bên trong (đơn vị: bán kính 1, chỗ gãy ở y = 0)
  function splinterGeo() {
    const N = 12, g = new THREE.CylinderGeometry(1, 1, 1, N, 1, true);
    const p = g.attributes.position;
    const sp = [];
    for (let i = 0; i < N; i++) sp.push(RNG() < 0.3 ? [rand(0.7, 1.2), rand(0.3, 0.6)] : [rand(0.1, 0.45), rand(0.7, 1.0)]);
    sp.push(sp[0]);
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) { const c = sp[i % (N + 1)]; p.setXYZ(i, p.getX(i) * c[1], c[0], p.getZ(i) * c[1]); }
      else p.setY(i, -0.45);
    }
    g.computeVertexNormals();
    const face = new THREE.CircleGeometry(0.97, N).toNonIndexed();
    face.rotateX(-Math.PI / 2); face.translate(0, 0.1, 0);
    return merge([g.toNonIndexed(), face]);
  }

  // ---- Tán lá: lõi kín + nhiều thẻ "chùm lá" cắt alpha. Pháp tuyến hướng ra ngoài khối tán (không theo mặt từng tấm)
  // -> cả khối sáng tối mềm như một vòm lá, thay vì từng mảnh phẳng loang lổ sáng tối
  function setNormals(g, nx, ny, nz) {
    const L = Math.hypot(nx, ny, nz) || 1, n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, nx / L, ny / L, nz / L);
  }
  function tintAll(g, c) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    g.setAttribute('tint', new THREE.BufferAttribute(a, 3));
    return g;
  }
  // lệch màu từng chùm lá: chùm hứng nắng ngả vàng ấm, chùm khuất ngả lạnh; depth: chùm nằm sâu trong tán tối hơn
  // + vài chùm úa vàng / khô nâu (lá già, cành chết) — tán thật không bao giờ xanh đều tăm tắp
  function leafVar(depth) {
    const r = RNG(), k = depth * rand(0.9, 1.08);
    // (chùm úa / khô hiếm & ngả ô liu sẫm — nhiều chùm vàng cam làm tán sáng chói như cây nhựa)
    return r < 0.22 ? [1.04 * k, 1.03 * k, 0.88 * k] : r < 0.4 ? [0.86 * k, 0.94 * k, 0.95 * k]
      : r < 0.44 ? [1.08 * k, 1.0 * k, 0.74 * k] : r < 0.46 ? [1.18 * k, 0.94 * k, 0.66 * k] : [0.95 * k, k, 0.97 * k];
  }
  // cành thông chết khô (tầng dưới / trong tán khuất nắng): kim nâu gỉ
  const DEAD_NEEDLE = [1.9, 1.08, 0.6];
  // 1 thẻ chùm lá billboard w x h tâm (x,y,z), xoay ngẫu nhiên quanh trục nhìn. band: chỉ lấy dải v giữa (không xoay)
  function leafCard(out, x, y, z, w, h, nrm, tint, band) {
    const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
    const uv = g.attributes.uv, p = g.attributes.position, cr = new Float32Array(p.count * 2);
    const sp = band ? rand(-0.12, 0.12) : rand(0, 6.283), cs = Math.cos(sp), sn = Math.sin(sp);
    for (let i = 0; i < p.count; i++) {
      uv.setX(i, 0.004 + uv.getX(i) * 0.492);
      if (band) uv.setY(i, band[0] + uv.getY(i) * (band[1] - band[0]));
      const px = p.getX(i), py = p.getY(i);
      cr[i * 2] = px * cs - py * sn; cr[i * 2 + 1] = px * sn + py * cs;
      p.setXYZ(i, x, y, z);
    }
    g.setAttribute('corner', new THREE.BufferAttribute(cr, 2));
    setNormals(g, nrm[0], nrm[1], nrm[2]);
    tintAll(g, tint || [1, 1, 1]);
    out.push(g);
  }
  // Cành thông: dải gấp chữ V ngược dọc theo cành (sống cành cao hơn hai mép -> nhìn ngang vẫn có bề dày, không mỏng như tờ giấy),
  // mọc từ (x0,y0,z0) theo hướng a, chúc dần xuống (pitch: góc dưới phương ngang ở gốc, droop: chúc thêm mỗi đốt).
  // Ảnh: coniferTex, v dọc cành gốc -> ngọn; bề ngang mỗi đốt ôm theo sprayEnv và u tỉ lệ bề ngang -> ảnh không
  // bị kéo giãn, bớt phần trong suốt phải tô. wMul (bản xa): nới bề ngang, giữ nguyên u (ảnh giãn ra, phủ bù số cành bị bỏ).
  // Pháp tuyến chếch ra ngoài thân + lên trời: cả tầng cành sáng tối mềm như một khối, gốc cành (trong tán) tối hơn ngọn
  const _pbA = new THREE.Vector3(), _pbB = new THREE.Vector3();
  function pineBranch(out, x0, y0, z0, a, len, wMax, pitch, droop, segs, tint, wMul = 1) {
    const ca = Math.cos(a), sa = Math.sin(a), sl = len / segs, fold = 0.45, cf = Math.cos(fold), sf = Math.sin(fold);
    // bề ngang tương đối mỗi đốt: mép thẳng nối 2 đốt phải trùm hết đường bao ảnh ở giữa (đường bao lồi -> nới cả 2 đầu đốt
    // theo chỗ thiếu nhiều nhất), không thì ảnh cành bị xén thành mép thẳng
    const req = t => Math.min(1, sprayEnv(t) * 1.08 + 0.04), E = [];
    for (let s = 0; s <= segs; s++) E.push(Math.min(1, req(s / segs) + 0.02));
    for (let it = 0; it < 3; it++) for (let s = 0; s < segs; s++) {
      let d = 0;
      for (let k = 1; k < 8; k++) { const q = k / 8; d = Math.max(d, req((s + q) / segs) - (E[s] * (1 - q) + E[s + 1] * q)); }
      if (d > 0) { E[s] = Math.min(1, E[s] + d); E[s + 1] = Math.min(1, E[s + 1] + d); }
    }
    const node = [];
    let px = x0, py = y0, pz = z0;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, e = E[s], hw = 0.5 * wMax * e * wMul, du = 0.492 * e;
      const f = 0.62 + 0.38 * t;
      node.push({ S: [px, py, pz], L: [px - sa * hw * cf, py - hw * sf, pz + ca * hw * cf], R: [px + sa * hw * cf, py - hw * sf, pz - ca * hw * cf], t, du, f });
      const pt = pitch + droop * (s + 0.5);
      px += ca * Math.cos(pt) * sl; pz += sa * Math.cos(pt) * sl; py -= Math.sin(pt) * sl;
    }
    const P = [], N = [], U = [], C = [];
    const vert = (p, u, v, sd, f) => {
      P.push(p[0], p[1], p[2]);
      const nx = ca * 0.75 - sa * sd * 0.3, nz = sa * 0.75 + ca * sd * 0.3, nl = Math.hypot(nx, 1, nz);
      N.push(nx / nl, 1 / nl, nz / nl);
      U.push(u, 0.01 + 0.98 * v);
      C.push(tint[0] * f, tint[1] * f, tint[2] * f);
    };
    // tam giác quay mặt trước lên trời: chỉ mặt dưới cành bị tối bớt (lá 2 mặt, gl_FrontFacing — xem treeMat)
    const tri = (A, B, D) => {
      _pbA.set(B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]);
      _pbB.set(D.p[0] - A.p[0], D.p[1] - A.p[1], D.p[2] - A.p[2]);
      if (_pbA.cross(_pbB).y < 0) { const T = B; B = D; D = T; }
      for (const q of [A, B, D]) vert(q.p, q.u, q.v, q.sd, q.f);
    };
    for (let s = 0; s < segs; s++) {
      const a0 = node[s], a1 = node[s + 1];
      const v = (n, k) => k === 'S' ? { p: n.S, u: 0.5, v: n.t, sd: 0, f: n.f } :
        { p: n[k], u: 0.5 + (k === 'L' ? -n.du : n.du), v: n.t, sd: k === 'L' ? 1 : -1, f: n.f * 0.88 };
      for (const k of ['L', 'R']) {
        tri(v(a0, k), v(a0, 'S'), v(a1, 'S'));
        tri(v(a0, k), v(a1, 'S'), v(a1, k));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(C, 3));
    out.push(g);
    return g;
  }
  // UV lõi tán vào nửa phải atlas (lá dày kín): chiếu bát diện theo hướng từ tâm (nửa dưới lật đối xứng lên nửa trên).
  // UV chỉ phụ thuộc vị trí đỉnh -> liền mạch qua mọi cạnh (trước đây chiếu phẳng theo trục trội của TỪNG tam giác:
  // ảnh lá đứt gãy ở mọi cạnh -> lõi tán lộ rõ từng mặt tam giác phẳng)
  function coreUV(g, cx, cy, cz) {
    const p = g.attributes.position, uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
    g.setAttribute('uv', uv);
    // chiếu theo trục trội của pháp tuyến từng tam giác (cũ: luôn chiếu x/z -> mặt đứng kéo dãn ảnh thành vân sọc dọc)
    let R = 1e-3;
    for (let i = 0; i < p.count; i++) R = Math.max(R, Math.hypot(p.getX(i) - cx, p.getY(i) - cy, p.getZ(i) - cz));
    for (let t = 0; t + 2 < p.count; t += 3) {
      const ax = p.getX(t + 1) - p.getX(t), ay = p.getY(t + 1) - p.getY(t), az = p.getZ(t + 1) - p.getZ(t);
      const bx = p.getX(t + 2) - p.getX(t), by = p.getY(t + 2) - p.getY(t), bz = p.getZ(t + 2) - p.getZ(t);
      const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
      for (let i = t; i < t + 3; i++) {
        const x = p.getX(i) - cx, y = p.getY(i) - cy, z = p.getZ(i) - cz;
        const [a, b] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
        uv.setXY(i, 0.75 + 0.24 * Math.max(-1, Math.min(1, a / R)), 0.5 + 0.49 * Math.max(-1, Math.min(1, b / R)));
      }
    }
  }
  // Khối tán hình elip tâm (cx,cy,cz) bán trục rx,ry,rz
  function foliageClump(C, cx, cy, cz, rx, ry, rz, o = {}) {
    // lõi gần như bị thẻ lá che hết -> chỉ cần khối 20 mặt
    const core = new THREE.IcosahedronGeometry(1, 0);
    const unit = core.attributes.position.array.slice();
    jitter(core, 0.22, cx * 3.1 + cz * 1.7);
    const p = core.attributes.position, n = core.attributes.normal, k = o.core || 0.64;
    for (let i = 0; i < p.count; i++) {
      const ux = unit[i * 3], uy = unit[i * 3 + 1], uz = unit[i * 3 + 2];
      p.setXYZ(i, cx + p.getX(i) * rx * k, cy + p.getY(i) * ry * k, cz + p.getZ(i) * rz * k);
      const nx = ux / rx, ny = uy / ry + 0.25 / ry, nz = uz / rz, L = Math.hypot(nx, ny, nz);
      n.setXYZ(i, nx / L, ny / L, nz / L);
    }
    coreUV(core, cx, cy, cz);
    tintAll(core, [o.coreTint || 0.68, o.coreTint || 0.68, o.coreTint || 0.68]);
    C.push(core);
    const ravg = (rx + ry + rz) / 3;
    const size = o.size || Math.max(4, Math.min(8.5, ravg * 0.95));
    const area = 4 * Math.PI * ((rx * ry + ry * rz + rx * rz) / 3);
    const cnt = Math.round((o.density || 1) * 1.7 * area / (size * size));
    for (let i = 0; i < cnt; i++) {
      // hướng ngẫu nhiên đều trên mặt cầu, bớt thẻ ở mặt dưới tán (ít ai nhìn, đỡ đỉnh)
      // (giữ đủ thẻ mặt dưới: xe / người nhìn ngược lên tán trong rừng rậm, mặt dưới thưa thì lộ khối lõi)
      const dy = rand(-1, 1);
      const a = rand(0, 6.283), rr = Math.sqrt(1 - dy * dy), dx = Math.cos(a) * rr, dz = Math.sin(a) * rr;
      // tâm thẻ nằm trong khối tán (không vượt mặt ngoài) -> chùm lá mép tán vẫn dính vào tán, không lơ lửng
      const t = rand(0.45, 0.88);
      const nx = dx / rx, ny = dy / ry + 0.3 / ry, nz = dz / rz;
      leafCard(C, cx + dx * rx * t, cy + dy * ry * t, cz + dz * rz * t, size, size, [nx, ny, nz],
        leafVar(0.7 + 0.3 * Math.min(1, (t - 0.45) / 0.43)));
    }
  }
  // Cành / thân: ống thuôn từ p0 (bán kính r0) tới p1 (r1), cong nhẹ, gốc loe múi rễ (flare), UV vỏ cây không bị kéo giãn
  const _ld = new THREE.Vector3(), _lq = new THREE.Quaternion(), _ly = new THREE.Vector3(0, 1, 0);
  // nháp cho tư thế cây đổ / đung đưa (chạy mỗi khung): ma trận chỉ dùng ngay rồi chép vào Pool, không ai giữ lại
  const _tP = new THREE.Vector3(), _tA = new THREE.Vector3(), _tS = new THREE.Vector3(), _tX = new THREE.Vector3(1, 0, 0);
  const _tQ = new THREE.Quaternion(), _tE = new THREE.Euler();
  const _tR = new THREE.Matrix4(), _tM = new THREE.Matrix4(), _tT = new THREE.Matrix4(), _tD = new THREE.Matrix4(), _tC = new THREE.Matrix4(), _tL = new THREE.Matrix4();
  function limb(out, p0, p1, r0, r1, o = {}) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dy, dz) || 1;
    const sides = o.sides || 7, segs = o.segs || Math.max(1, Math.min(6, Math.round(L / 7)));
    // Đóng kín hai đầu hình trụ để khi cành gập khúc không bao giờ bị rỗng ruột nhìn xuyên thấu
    const g = new THREE.CylinderGeometry(1, 1, L, sides, segs, o.open !== undefined ? o.open : false);
    const p = g.attributes.position, uv = g.attributes.uv;
    const bend = o.bend || 0, ph = o.ph !== undefined ? o.ph : rand(0, 6.283), wob = o.wobble !== undefined ? o.wobble : 0.12, circ = 2 * Math.PI * r0;
    // thân sần (o.knob = biên độ tương đối): gờ lồi lõm chạy xoắn nhẹ theo thớ + 2-4 u bướu (mắt gỗ, chỗ cành cũ gãy liền sẹo).
    // Hàm tuần hoàn theo góc (số nguyên lần) -> không hở đường nối quanh thân
    let knobF = null;
    if (o.knob) {
      const P = [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)], burls = [];
      for (let i = 0, n = 2 + Math.floor(RNG() * 3); i < n; i++) burls.push([rand(0, 6.283), rand(0.12, 0.85) * L, rand(0.22, 0.45), rand(1.4, 3.2)]);
      knobF = (a, y) => {
        let k = Math.sin(a * 3 + y * 0.09 + P[0]) * 0.45 + Math.sin(a * 7 + y * 0.23 + P[1]) * 0.3 + Math.sin(a * 11 - y * 0.41 + P[2]) * 0.15 + Math.sin(y * 0.7 + a * 2 + P[3]) * 0.2;
        for (const [ba, by, amp, br] of burls) {
          let da = Math.abs(a - ba); if (da > Math.PI) da = 2 * Math.PI - da;
          k += amp / o.knob * Math.exp(-(da * da) / 0.18 - ((y - by) * (y - by)) / (br * br * 2));
        }
        return 1 + o.knob * k;
      };
    }
    const uRep = o.uRepeat !== undefined ? o.uRepeat : Math.max(1, Math.round(circ / 2.2));
    const vScale = o.vScale || (r0 >= 0.7 ? 3.5 : Math.max(2.0, circ * 0.9));
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + L / 2, t = y / L, ux = p.getX(i), uz = p.getZ(i);
      let r = r0 + (r1 - r0) * t;
      if (o.flare) r *= 1 + o.flare * Math.exp(-y / (r0 * 1.4)) * (0.6 + 0.4 * Math.cos(Math.atan2(uz, ux) * (o.lobes || 5) + ph));
      if (knobF && y > 0.01 && y < L - 0.01) r *= knobF(Math.atan2(uz, ux), y);
      const off = bend * Math.sin(Math.PI * t) + wob * r0 * Math.sin(t * 9 + ph);
      p.setXYZ(i, ux * r + off * Math.cos(ph), y, uz * r + off * Math.sin(ph));
      uv.setX(i, uv.getX(i) * uRep);
      uv.setY(i, y / vScale);
    }
    g.computeVertexNormals();
    const ng = g.toNonIndexed();
    _ld.set(dx / L, dy / L, dz / L); _lq.setFromUnitVectors(_ly, _ld);
    ng.applyMatrix4(_m.compose(_v.set(p0[0], p0[1], p0[2]), _lq, _s.set(1, 1, 1)));
    out.push(ng);
    return ng;
  }
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // tối dần về phía dưới tán (lá dưới bị lá trên che nắng)
  function shadeByHeight(g, lo, hi) {
    const p = g.attributes.position, t = g.attributes.tint;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < p.count; i++) {
      const f = lo + (hi - lo) * Math.pow((p.getY(i) - y0) / Math.max(1e-3, y1 - y0), 0.75);
      t.setXYZ(i, t.getX(i) * f, t.getY(i) * f, t.getZ(i) * f);
    }
  }
  // Che sáng thân theo loài (ánh trời / ánh hắt không bị tán che trong shader -> tự tối bớt sẵn): tán kim dày rủ thấp che
  // gần hết trời, tán lá rộng che vừa, cây khô / dừa / xương rồng đứng trơ giữa nắng không che
  const TRUNK_AO = { pine: 0.86, cypress: 0.9, jungle: 0.88, broadleaf: 0.92, willow: 0.9, acacia: 0.95, plane: 0.94, deadTree: 0.96 };
  // thân: gốc sẫm (đất bắn, ẩm), tối dần mượt khi vào trong tán (bị lá che), cả thân tối theo độ dày tán của loài (ao)
  function trunkShade(g, crownY, ao = 1) {
    const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = p.getY(i);
      let f = (0.58 + 0.42 * Math.min(1, Math.max(0, y / 7))) * ao;
      const k = Math.min(1, Math.max(0, (y - crownY + 6) / 12));
      f *= 1 - 0.28 * k * k * (3 - 2 * k);
      a[i * 3] = f; a[i * 3 + 1] = f * 0.98; a[i * 3 + 2] = f * 0.95;
    }
    g.setAttribute('tint', new THREE.BufferAttribute(a, 3));
  }

  // form: dáng biến thể — { h: hệ số chiều cao, w: hệ số bề ngang (tán + thân), young: cây non }
  function buildTreeVariant(kind, form = {}) {
    // trả { trunk: geometry, crown: geometry|null, crownKind, barkKind, height }
    const T = [], C = [];
    const young = !!form.young;
    let crownKind = 'broad', height = 40, barkKind = 'oak', crownY = 1e9, stemN = 1;   // stemN: số mảnh đầu của T là thân chính
    let stemLo = null;   // thân chính bản xa riêng (thân gần sần sùi nhiều đỉnh -> bản xa dùng ống trơn ít mặt)
    let frondPieces = 0;   // dừa: số mảnh của mỗi tàu lá trong C (bản xa giữ một nửa số tàu)
    let CL = null;         // các mảnh tán bản xa dựng sẵn (thông); null: suy ra từ C
    let crownTex = null;   // ảnh tán riêng (mặc định theo crownKind)
    // cành từ thân vươn tới từng khối tán (lộ ra qua kẽ lá như cây thật)
    const branchesTo = (clumps, from, r0) => {
      for (const c of clumps) {
        const a = from(c), b = [c[0] * 0.8, c[1] - c[4] * 0.3, c[2] * 0.8];
        const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const dL = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        // Cắm sâu gốc cành con vào thân mẹ để mép nối không bị hở
        const start = [a[0] - (dir[0] / dL) * 0.45, a[1] - (dir[1] / dL) * 0.45, a[2] - (dir[2] / dL) * 0.45];
        limb(T, start, b, r0, r0 * 0.35, { sides: 5, segs: 2, bend: rand(0.3, 1.2), wobble: 0.2 });
      }
    };
    const clumpsOut = (clumps, o) => { for (const c of clumps) foliageClump(C, c[0], c[1], c[2], c[3], c[4], c[5], o); };
    if (kind === 'palm') {
      barkKind = 'palm'; crownKind = 'frond'; height = 52;
      // thân cong vồng nhẹ (nghiêng dần về ngọn), gốc phình
      const lean = rand(4, 10), H = 47, N = 6;
      const P = t => [lean * t * t, H * t, 0];
      for (let i = 0; i < N; i++) {
        const rSeg = 1.5 - i * 0.07;
        limb(T, P(i / N), P((i + 1) / N), rSeg, 1.5 - (i + 1) * 0.07, { sides: 14, segs: 1, wobble: 0, flare: i === 0 ? 0.55 : 0, lobes: 6, uRepeat: 1, vScale: 2 * Math.PI * rSeg * 2 });
      }
      stemN = N;
      const top = P(1);
      limb(T, top, [top[0] + 0.4, top[1] + 3, top[2]], 1.15, 0.8, { sides: 12, segs: 1, wobble: 0, uRepeat: 1, vScale: 2 * Math.PI * 1.15 * 2 });
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + rand(-0.3, 0.3); T.push(place(new THREE.SphereGeometry(0.85, 6, 4), [top[0] + Math.cos(a) * 1.3, top[1] - 0.6 + rand(-0.5, 0.5), top[2] + Math.sin(a) * 1.3])); }
      // tàu lá: 5 đốt cong rủ, mặt cắt gấp chữ V ngược (lá chét rủ hai bên sống lá); lá dưới già, ngả vàng, rủ hơn
      const NF = 14, segs = 5, len = 4.4, fold = -0.38;
      frondPieces = segs * 2;
      for (let f = 0; f < NF; f++) {
        const a = (f / NF) * 6.283 + rand(-0.15, 0.15), p0 = rand(-0.85, -0.05), droop = rand(0.3, 0.48);
        const old = p0 > -0.3, tf = old ? [1.12, 1.04, 0.78] : leafVar(1);
        let px = top[0], py = top[1] + 2.2, pz = top[2];
        for (let s = 0; s < segs; s++) {
          const pitch = p0 + s * droop, wseg = (4.8 - s * 0.55) * (s === 0 ? 0.75 : 1);
          for (const side of [-1, 1]) {
            const g = new THREE.PlaneGeometry(wseg / 2, len);
            g.translate(side * wseg / 4, len / 2, 0);
            g.rotateY(side * fold);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) { uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5); uv.setY(i, (uv.getY(i) + s) / segs); }
            const gg = place(g, [0, 0, 0], [Math.PI / 2 + pitch, 0, 0], 1);
            gg.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
            gg.translate(px, py, pz);
            setNormals(gg, Math.sin(a) * 0.45, 1, Math.cos(a) * 0.45);
            const sh = 0.82 + 0.18 * (s / (segs - 1));
            tintAll(gg, [tf[0] * sh, tf[1] * sh, tf[2] * sh]);
            C.push(gg);
          }
          px += Math.sin(a) * Math.cos(pitch) * len; pz += Math.cos(a) * Math.cos(pitch) * len; py -= Math.sin(pitch) * len;
        }
      }
    } else if (kind === 'pine') {
      // cây non: tầng cành phủ gần sát gốc (chưa rụng cành dưới như thông già), thân mảnh, gốc ít loe
      const y0 = young ? 5 : 14, ySpan = young ? 49 : 40;
      barkKind = 'pine'; crownKind = 'needle'; crownTex = 'conifer'; height = 58; crownY = young ? 4 : 12;
      limb(T, [0, 0, 0], [rand(-0.6, 0.6), 57, rand(-0.6, 0.6)], young ? 1.3 : 1.8, 0.2, { sides: 16, segs: 8, flare: young ? 0.3 : 0.65, lobes: 6, wobble: 0.06 });
      // Tầng cành mọc vòng quanh thân (whorl), toàn bộ bằng cành kim 3D (pineBranch): vòng chính toả ra (tầng dưới dài, rủ; tầng
      // trên ngắn, chếch lên) + vòng phụ rủ hơn xen kẽ bên dưới + vài cành trong cắm dốc xuống, tối (thay lõi kín: che nhìn xuyên
      // qua tán mà mép vẫn lởm chởm) -> dáng tháp nhiều tầng của thông thật. (Trước đây: "váy" nón 9 mặt to bằng cả tầng + thẻ
      // billboard -> lộ rõ mặt tam giác phẳng, cạnh nón thẳng). Bản xa (CL): cành trong + 1/2 vòng chính, nới rộng
      CL = [];
      const W = 10;
      for (let wi = 0; wi < W; wi++) {
        // tầng trên xít nhau hơn (ngọn thông dày, không trơ thân)
        const t = wi / (W - 1), y = y0 + Math.pow(t, 0.85) * ySpan + rand(-0.8, 0.8);
        const R = 12.5 * Math.pow(1 - t, 0.9) + 2.6;
        // (đốt mỗi cành: 3 cho tầng dưới cùng dài, còn lại 2; cành trong 1 đốt — giữ số tam giác ~1,3 nghìn / tán)
        const nB = Math.round(5 + R * 0.42), ph = rand(0, 6.283), segs = R > 10 ? 3 : 2;
        const br = (out, a, by, len, wB, pitch, droop, sg, tf, wMul) => pineBranch(out, Math.cos(a) * 0.3, by, Math.sin(a) * 0.3, a, len, wB, pitch, droop, sg, tf, wMul);
        for (let b = 0; b < 4; b++) {
          // cành trong tán khuất nắng: gần một nửa đã chết khô (thông già rụng dần cành dưới / trong)
          const a = ph + (b / 4) * 6.283 + rand(-0.3, 0.3), len = R * 0.5 + 2.5;
          const tf = !young && t < 0.55 && RNG() < 0.45 ? DEAD_NEEDLE.map(c => c * 0.55 * rand(0.85, 1.1)) : leafVar(0.62);
          const p = [a, y - 0.5, len, Math.max(2.4, len * 0.8), 0.9 + rand(-0.1, 0.15), 0, 1, tf];
          br(C, ...p); br(CL, ...p, 1.3);
        }
        for (let b = 0; b < nB; b++) {
          const a = ph + (b / nB) * 6.283 + rand(-0.18, 0.18), len = R * rand(0.88, 1.12);
          const p = [a, y + rand(-0.7, 0.7), len, Math.max(2.6, Math.min(8, len * 0.6)), 0.12 - 0.45 * t + rand(-0.1, 0.1),
            (0.25 + 0.35 * (1 - t)) * rand(0.8, 1.2) / segs, segs,
            // 2 tầng dưới cùng của thông già: thỉnh thoảng 1 cành chết khô nâu gỉ
            !young && wi < 2 && RNG() < 0.18 ? DEAD_NEEDLE.map(c => c * 0.8 * rand(0.85, 1.1)) : leafVar(0.9 + 0.1 * t)];
          br(C, ...p);
          if (b % 2 === 0) br(CL, ...p, 1.5);
        }
        if (R > 4) for (let b = 0, n2 = Math.round(nB * 0.5); b < n2; b++) {
          const a = ph + ((b + 0.5) / n2) * 6.283 + rand(-0.2, 0.2), len = R * rand(0.72, 0.9);
          br(C, a, y - 1.8 + rand(-0.5, 0.5), len, Math.max(2.6, Math.min(7, len * 0.6)), 0.4 - 0.3 * t + rand(-0.1, 0.1),
            (0.3 + 0.3 * (1 - t)) * rand(0.8, 1.2) / 2, 2, leafVar(0.8));
        }
        // mấu cành trong mỗi tầng (lộ ra khi tán cháy trụi / bị xé lá)
        if (wi >= 1 && wi <= 5) for (let b = 0; b < 3; b++) {
          const a = (b / 3) * 6.283 + wi * 1.1 + rand(-0.3, 0.3), rr = R * rand(0.35, 0.5);
          limb(T, [0, y - 1, 0], [Math.cos(a) * rr, y - 1 - rr * 0.35, Math.sin(a) * rr], 0.28, 0.06, { sides: 3, segs: 1, wobble: 0 });
        }
        // cành gốc lộ ra dưới tầng lá thấp nhất
        if (wi === 0) for (let b = 0; b < 6; b++) {
          const a = (b / 6) * 6.283 + rand(-0.25, 0.25), rr = R * rand(0.6, 0.8);
          limb(T, [0, y - 2, 0], [Math.cos(a) * rr, y - 2 - rr * 0.45, Math.sin(a) * rr], 0.35, 0.1, { sides: 4, segs: 1, wobble: 0 });
        }
      }
      // ngọn: 3 cành kim dựng gần thẳng đứng toả quanh đỉnh thân
      for (let k = 0; k < 3; k++) {
        const tf = leafVar(1);
        pineBranch(C, 0, 52, 0, k * 2.094 + 0.4, 6.5, 2.6, -1.3, 0.08, 2, tf);
        pineBranch(CL, 0, 52, 0, k * 2.094 + 0.4, 6.5, 2.6, -1.3, 0.08, 2, tf, 1.3);
      }
    } else if (kind === 'cypress') {
      barkKind = 'oak'; crownKind = 'needle'; height = 46; crownY = 8;
      limb(T, [0, 0, 0], [0, 40, 0], 1.2, 0.25, { sides: 12, segs: 6, flare: 0.45, lobes: 5 });
      // dáng ngọn lửa: 3 khối chồng lệch nhẹ, thon dần lên ngọn
      foliageClump(C, 0, 17, 0, 5.6, 9, 5.6, { size: 4.4, core: 0.7 });
      foliageClump(C, rand(-0.6, 0.6), 28, rand(-0.6, 0.6), 5.0, 8.5, 5.0, { size: 4.2, core: 0.7 });
      foliageClump(C, rand(-0.4, 0.4), 38.5, rand(-0.4, 0.4), 3.2, 7, 3.2, { size: 3.6, core: 0.7 });
    } else if (kind === 'cactus') {
      barkKind = 'cactus'; crownKind = null;
      const numRibs = 16;
      const ribDepth = 0.12;
      const mainH = rand(20, 24);
      height = mainH + 2.0;
      // Mặt cắt múi như saguaro thật: sống múi tròn bè rộng, rãnh hẹp sâu chữ V (không đều sin như ống nhựa); múi lượn
      // nhẹ theo chiều cao, mỗi múi sâu nông khác nhau. Trả { p: độ lồi (nhân bán kính), c: cos múi cho bóng rãnh }
      // (mọi cành dùng 16 múi = số múi vẽ trong ảnh vỏ: sọc ảnh trùng sống múi thật)
      const ribSeed = rand(0, 100);
      const ribPleat = (theta, y, D) => {
        const th = theta + 0.035 * Math.sin(y * 0.35 + ribSeed) + 0.02 * Math.sin(y * 0.9 + ribSeed * 2.3);
        const c = Math.cos(numRibs * th);
        const k = ((Math.floor(th * numRibs / 6.2832 + 0.5) % numRibs) + numRibs) % numRibs;
        const dk = 0.78 + 0.44 * (((Math.sin(k * 12.9898 + ribSeed) * 43758.5453) % 1 + 1) % 1);
        return { p: (1 - 2 * Math.pow((1 - c) / 2, 2.2)) * D * dk, c };
      };

      // Hàm tạo thân chính xương rồng Saguaro liền khối (không chắp vá nắp hộp, không lộ ngấn cắt)
      const makeSaguaroTrunk = (H, rBot, rMid, rTop, ribs, radSegs, hSegs, depth) => {
        const positions = [];
        const uvs = [];
        const tints = [];
        const indices = [];

        const domeH = rTop * 0.95;
        const colH = H - domeH;
        const totalRings = hSegs + 10; // hSegs cho thân, 10 vòng cho vòm ngọn

        // Tạo các vòng lát cắt (rings)
        for (let j = 0; j <= totalRings; j++) {
          let y, R, D, swayX, swayZ;
          if (j <= hSegs) {
            // Phần thân trụ
            const t = j / hSegs;
            y = t * colH;
            if (j === 0) y = -1.0;   // chân chôn xuống cát: mặt đất cắt ngang thân (không lộ viền răng cưa đáy như cắm trên đế)
            // Gốc hơi loe nhẹ cắm cát, giữa thân phình nhẹ tự nhiên
            if (y < 2.0) {
              R = rBot - (rBot - rMid) * (y / 2.0);
            } else {
              R = rMid - (rMid - rTop) * Math.pow(t, 1.35);
            }
            D = depth;
            // Độ lượn hữu cơ nhẹ của thân
            swayX = Math.sin(t * Math.PI) * 0.22;
            swayZ = Math.cos(t * 1.5) * 0.12;
          } else {
            // Phần vòm đỉnh ngọn liền mạch
            const u = (j - hSegs) / 10;
            y = colH + u * domeH;
            R = rTop * Math.sqrt(Math.max(0, 1 - u * u));
            D = depth * Math.max(0, 1 - Math.pow(u, 1.3));
            swayX = Math.sin(Math.PI) * 0.22 * (1 - u);
            swayZ = Math.cos(1.5) * 0.12 * (1 - u);
          }

          // Độ lõm nhẹ tự nhiên ở tâm rốn ngọn Saguaro (apical meristem depression)
          if (j === totalRings) {
            y -= 0.18;
            R = 0.05;
            D = 0;
          }

          for (let i = 0; i <= radSegs; i++) {
            const frac = i / radSegs;
            const theta = frac * Math.PI * 2;
            const rp = ribPleat(theta, y, D), cosV = rp.c;
            const effR = Math.max(0.01, R * (1 + rp.p));

            const vx = swayX + effR * Math.cos(theta);
            const vz = swayZ + effR * Math.sin(theta);
            positions.push(vx, y, vz);

            // UV: u chạy quanh chu vi, v chạy dọc thân theo tỷ lệ gai
            uvs.push(frac, y / 8.0);

            // Tint: Chân gốc già cỗi hóa gỗ (cork collar) ngả nâu sa mạc; rãnh múi có bóng râm tự nhiên
            let tr = 1.0, tg = 1.0, tb = 1.0;
            if (y < 2.6) {
              const baseK = Math.max(0, 1 - y / 2.6);
              tr = 1.0 - baseK * 0.35;
              tg = 1.0 - baseK * 0.44;
              tb = 1.0 - baseK * 0.58;
            }
            // Ambient occlusion trong lòng rãnh chữ V sâu
            const ao = 0.8 + 0.2 * Math.pow((1 + cosV) / 2, 0.5);
            tints.push(tr * ao, tg * ao, tb * ao);
          }
        }

        // Tạo mặt lưới tam giác (indices)
        for (let j = 0; j < totalRings; j++) {
          for (let i = 0; i < radSegs; i++) {
            const a = j * (radSegs + 1) + i;
            const b = (j + 1) * (radSegs + 1) + i;
            const c = (j + 1) * (radSegs + 1) + (i + 1);
            const d = j * (radSegs + 1) + (i + 1);
            indices.push(a, b, d);
            indices.push(b, c, d);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(tints), 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
      };

      // 1. Dựng thân chính Saguaro
      const rBot = 1.88, rMid = 1.82, rTop = 1.62;
      const trunkGeo = makeSaguaroTrunk(mainH, rBot, rMid, rTop, numRibs, 32, 28, ribDepth);
      T.push(place(trunkGeo, [0, 0, 0]));
      stemN = 1;

      // (đỉnh ngọn: vòm tròn có rốn lõm — bỏ khối "nụ bông tơ" dùng chung ảnh vỏ xanh sẫm, trông như nắp chai)

      // 2. Hàm tạo cành tay có MÚI DỌC 3D VÀ UV CHUẨN XÁC DỌC CÀNH (triệt tiêu 100% sọc ngang Michelin)
      // droop: cành già nặng nước oằn xệ xuống dưới vai rồi mới ngóc lên (chữ J), 0 = chữ U thường
      const makeSaguaroArm = (side, h0, reach, armLen, rArm, zTilt, droop = 0) => {
        // Đường spline tim cành: vai chìa ngang ra khỏi thân, khuỷu cong, rồi vươn thẳng lên
        const p0 = new THREE.Vector3(side * 1.1, h0 - 0.25, 0);
        const p1 = new THREE.Vector3(side * 2.2, h0 + 0.15 - droop * 1.6, zTilt * 0.3);
        const p2 = new THREE.Vector3(side * (reach - 0.45), h0 + 1.65 - droop * 2.8, zTilt * 0.7);
        const p3 = new THREE.Vector3(side * reach, h0 + 3.5 - droop * 2.2, zTilt);
        const p4 = new THREE.Vector3(side * (reach + (RNG() - 0.5) * 0.6), h0 + 3.5 - droop * 2.2 + armLen, zTilt + (RNG() - 0.5) * 0.6);
        const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4]);

        const nSteps = 30;
        const radSegs = 32;
        const ribD = 0.12;
        const totalLen = curve.getLength();

        const positions = [];
        const uvs = [];
        const tints = [];
        const indices = [];

        // Tính các mặt cắt vuông góc dọc spline
        // Hệ trục chuyển song song thật (parallel transport): pháp tuyến vòng trước chiếu lên mặt phẳng vuông góc tiếp
        // tuyến mới -> các vòng cắt không xoay lệch nhau, múi chạy liền dọc cành. (Bản cũ lấy tangent x pháp tuyến cũ rồi
        // gán binormal làm pháp tuyến: mỗi vòng xoay 90° -> múi xoắn chéo thành chuỗi khối kim cương / lởm chởm lông nhím)
        let prevN = new THREE.Vector3(0, 0, 1);
        for (let j = 0; j <= nSteps; j++) {
          const t = 1 - Math.pow(1 - j / nSteps, 1.5);   // vòng cắt dày dần về đầu cành (vòm tròn đủ vòng, không gãy khúc)
          const pt = curve.getPoint(t);
          const tangent = curve.getTangent(t).normalize();

          const normal = prevN.clone().addScaledVector(tangent, -prevN.dot(tangent));
          if (normal.lengthSq() < 1e-6) normal.crossVectors(tangent, new THREE.Vector3(0, 1, 0));
          normal.normalize();
          const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
          prevN = normal;

          // Bán kính lát cắt: Khớp vai (t < 0.2) phình to ăn sâu vào thân; thân giữa đều; đỉnh vuốt tròn liền khối
          let R, D;
          const t1 = 1 - Math.min(0.2, rArm * 0.95 / totalLen);   // vòm đầu cành cao ~ bán kính cành (tròn, không nhọn mũi đạn)
          if (t < 0.2) {
            R = rArm * (1.32 - 0.32 * (t / 0.2));
            D = ribD;
          } else if (t <= t1) {
            R = rArm;
            D = ribD;
          } else {
            // Vuốt tròn mái vòm đỉnh cành mượt mà
            const u = (t - t1) / (1 - t1);
            R = rArm * Math.sqrt(Math.max(0, 1 - u * u));
            D = ribD * Math.max(0, 1 - Math.pow(u, 1.3));
          }

          if (j === nSteps) {
            R = 0.04;
            D = 0;
          }

          for (let i = 0; i <= radSegs; i++) {
            const frac = i / radSegs;
            const phi = frac * Math.PI * 2;
            const rp = ribPleat(phi, t * totalLen + side * 7, D), cosV = rp.c;
            const effR = Math.max(0.01, R * (1 + rp.p));

            // Vị trí đỉnh trong không gian 3D
            const vx = pt.x + effR * (Math.cos(phi) * normal.x + Math.sin(phi) * binormal.x);
            const vy = pt.y + effR * (Math.cos(phi) * normal.y + Math.sin(phi) * binormal.y);
            const vz = pt.z + effR * (Math.cos(phi) * normal.z + Math.sin(phi) * binormal.z);
            positions.push(vx, vy, vz);

            // UV: u chạy quanh chu vi cành (16 múi dọc = 16 múi ảnh vỏ), v chạy dọc cành từ gốc lên ngọn
            uvs.push(frac, (t * totalLen) / 8.0);

            // Tint: bóng rãnh chữ V; vai cành sát thân hơi hoá bần nâu (chỗ chịu lực, nứt nẻ)
            const ao = 0.8 + 0.2 * Math.pow((1 + cosV) / 2, 0.5), cork = t < 0.12 ? (1 - t / 0.12) * 0.35 : 0;
            tints.push(ao * (1 - cork * 0.3), ao * (1 - cork * 0.42), ao * (1 - cork * 0.55));
          }
        }

        // Tạo mặt lưới tam giác
        for (let j = 0; j < nSteps; j++) {
          for (let i = 0; i < radSegs; i++) {
            const a = j * (radSegs + 1) + i;
            const b = (j + 1) * (radSegs + 1) + i;
            const c = (j + 1) * (radSegs + 1) + (i + 1);
            const d = j * (radSegs + 1) + (i + 1);
            indices.push(a, b, d);
            indices.push(b, c, d);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(tints), 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        return {
          geo,
          topPos: [p4.x, p4.y, p4.z]
        };
      };

      // 3. Phân bổ cành nhánh Saguaro phong phú và bất đối xứng tự nhiên
      const armSides = [];
      if (RNG() < 0.88) armSides.push(-1);
      if (RNG() < 0.85) armSides.push(1);
      if (armSides.length === 0) armSides.push(RNG() < 0.5 ? -1 : 1);

      let armIdx = 0;
      for (const s of armSides) {
        // Cành so le cao thấp không đối xứng cứng nhắc
        const h0 = armIdx === 0 ? rand(7.2, 9.8) : rand(10.2, 12.5);
        const reach = rand(3.9, 4.9);
        const armLen = rand(6.8, 10.5);
        const rArm = rand(1.02, 1.14);
        const zTilt = rand(-0.35, 0.35);
        // ~1/4 số cành: cành già oằn xệ chữ J
        const droop = RNG() < 0.25 ? rand(0.5, 1) : 0;

        const arm = makeSaguaroArm(s, h0, reach, armLen, rArm, zTilt, droop);
        T.push(place(arm.geo, [0, 0, 0]));

        armIdx++;
      }
    } else if (kind === 'deadTree') {
      barkKind = 'dead'; crownKind = null; height = 34;
      // thân cong, cành chính chĩa lên rồi tẽ cành con, đầu cành nhọn
      const top = [rand(-1.5, 1.5), 27, rand(-1.5, 1.5)];
      limb(T, [0, 0, 0], top, 1.8, 0.45, { sides: 14, segs: 6, flare: 0.6, lobes: 6, bend: rand(0.5, 1.5) });
      for (let b = 0; b < 6; b++) {
        const t = rand(0.4, 0.95), a = rand(0, 6.283), L = rand(7, 13) * (1.2 - t * 0.5), el = rand(0.4, 1.0);
        const p0 = lerp3([0, 0, 0], top, t);
        const p1 = [p0[0] + Math.cos(a) * Math.cos(el) * L, p0[1] + Math.sin(el) * L, p0[2] + Math.sin(a) * Math.cos(el) * L];
        const r0 = 0.55 * (1.1 - t * 0.5);
        const dir = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const dL = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        const start0 = [p0[0] - (dir[0] / dL) * 0.55, p0[1] - (dir[1] / dL) * 0.55, p0[2] - (dir[2] / dL) * 0.55];
        limb(T, start0, p1, r0, 0.12, { sides: 6, segs: 2, bend: rand(0.3, 1), wobble: 0.3 });
        for (let k = 0; k < 2; k++) {
          const q = lerp3(p0, p1, rand(0.5, 0.85)), a2 = a + rand(-1, 1), L2 = L * rand(0.3, 0.5), e2 = el + rand(-0.2, 0.5);
          const p2 = [q[0] + Math.cos(a2) * Math.cos(e2) * L2, q[1] + Math.sin(e2) * L2, q[2] + Math.sin(a2) * Math.cos(e2) * L2];
          const dir2 = [p2[0] - q[0], p2[1] - q[1], p2[2] - q[2]];
          const dL2 = Math.hypot(dir2[0], dir2[1], dir2[2]) || 1;
          const start1 = [q[0] - (dir2[0] / dL2) * 0.35, q[1] - (dir2[1] / dL2) * 0.35, q[2] - (dir2[2] / dL2) * 0.35];
          limb(T, start1, p2, r0 * 0.45, 0.06, { sides: 5, segs: 1, wobble: 0 });
        }
      }
    } else if (kind === 'acacia') {
      barkKind = 'oak'; crownKind = 'dry'; height = 30; crownY = 17;
      // thân ngắn, chạc 3 cành xòe chữ V, tán phẳng như cái ô nhiều tầng mỏng
      const fork = [rand(-1, 1), 11, rand(-1, 1)];
      // Thân chính vươn lên tới chạc cây và đâm sâu vào tâm fork
      const fDir = [fork[0], fork[1], fork[2]];
      const fL = Math.hypot(fDir[0], fDir[1], fDir[2]) || 1;
      const forkExt = [fork[0] + (fDir[0] / fL) * 0.6, fork[1] + (fDir[1] / fL) * 0.6, fork[2] + (fDir[2] / fL) * 0.6];
      limb(T, [0, 0, 0], forkExt, 1.45, 0.95, { sides: 14, segs: 6, flare: 0.55, lobes: 5, bend: rand(0.3, 0.9) });

      // Khối bướu chạc cây (branch fork burl) bao bọc hoàn toàn giao điểm giữa thân mẹ và 3 cành con
      const forkNode = new THREE.SphereGeometry(1.35, 8, 7);
      forkNode.scale(1.15, 1.35, 1.15);
      tintAll(forkNode, [0.92, 0.92, 0.92]);
      T.push(place(forkNode, fork));

      const mains = [];
      for (let m = 0; m < 3; m++) {
        const a = m * 2.094 + rand(-0.3, 0.3), e = [fork[0] + Math.cos(a) * 6.5, 18.5, fork[2] + Math.sin(a) * 6.5];
        const dir = [e[0] - fork[0], e[1] - fork[1], e[2] - fork[2]];
        const dL = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        // Cắm sâu gốc cành con vào sâu trong lòng thân mẹ 0.85 đơn vị để triệt tiêu hoàn toàn góc hở
        const start = [fork[0] - (dir[0] / dL) * 0.85, fork[1] - (dir[1] / dL) * 0.85, fork[2] - (dir[2] / dL) * 0.85];
        limb(T, start, e, 0.92, 0.45, { sides: 8, segs: 3, bend: rand(0.25, 0.7) });
        mains.push(e);
      }
      const clumps = [];
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + rand(-0.3, 0.3), d = k === 0 ? 0 : rand(6, 10.5); clumps.push([Math.cos(a) * d, 22.5 + rand(-1, 1.2), Math.sin(a) * d, rand(6, 8), 2.1, rand(6, 8)]); }
      branchesTo(clumps, c => mains.reduce((b, m) => (Math.hypot(m[0] - c[0], m[2] - c[2]) < Math.hypot(b[0] - c[0], b[2] - c[2]) ? m : b)), 0.42);
      clumpsOut(clumps, { size: 4.6, core: 0.6 });
    } else if (kind === 'willow') {
      barkKind = 'oak'; crownKind = 'broad'; height = 34; crownY = 16;
      const top = [rand(-1, 1), 15, rand(-1, 1)];
      limb(T, [0, 0, 0], top, 2.1, 1.3, { sides: 14, segs: 6, flare: 0.7, lobes: 6, bend: rand(0.5, 1.5) });
      const clumps = [];
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + rand(-0.3, 0.3), d = k === 0 ? 0 : rand(4, 7); clumps.push([Math.cos(a) * d, rand(21, 26), Math.sin(a) * d, 6.5, 7.5, 6.5]); }
      branchesTo(clumps, () => lerp3([0, 0, 0], top, rand(0.8, 1)), 0.7);
      clumpsOut(clumps);
      // cành liễu rủ: chuỗi chùm lá nhỏ chồng mép lên nhau, mọc ra từ đáy các khối tán ngoài, nhỏ dần về ngọn
      for (let k = 0; k < 26; k++) {
        const c = clumps[1 + (k % (clumps.length - 1))], a = Math.atan2(c[2], c[0]) + rand(-1.1, 1.1);
        let x = c[0] + Math.cos(a) * c[3] * 0.7, y = c[1] - c[4] * 0.35, z = c[2] + Math.sin(a) * c[5] * 0.7;
        const n = 4 + (RNG() < 0.5 ? 1 : 0);
        for (let j = 0; j < n; j++) {
          const sz = 3.6 - j * 0.4;
          leafCard(C, x, y, z, sz * 0.8, sz * 1.2, [Math.cos(a), 0.6, Math.sin(a)], leafVar(0.95 - j * 0.06));
          y -= sz * 0.6; x += Math.cos(a) * 0.25; z += Math.sin(a) * 0.25;
        }
      }
    } else if (kind === 'jungle') {
      barkKind = 'tropic'; crownKind = 'jungle'; height = 64; crownY = 40;
      // cây đại thụ rừng nhiệt đới: thân thẳng cao, gốc bạnh rễ múi, tán dù rộng trên cao. Vỏ nhiệt đới (ảnh lớn): 2 lần
      // quanh thân, mỗi ô cao gấp đôi bề ngang -> không lộ họa tiết lặp
      const top = [rand(-1.5, 1.5), 46, rand(-1.5, 1.5)];
      // thân sần: mặt lồi lõm theo thớ + vài u bướu (knob). Bản xa: ống trơn ít mặt cùng dáng (cùng bend / flare)
      const bendJ = rand(0.5, 1.5), phJ = rand(0, 6.283);
      limb(T, [0, 0, 0], top, 2.2, 1.0, { sides: 20, segs: 16, flare: 1.6, lobes: 6, bend: bendJ, ph: phJ, uRepeat: 2, vScale: 13.8, knob: 0.16 });
      stemLo = [];
      limb(stemLo, [0, 0, 0], top, 2.2, 1.0, { sides: 10, segs: 5, flare: 1.6, lobes: 6, bend: bendJ, ph: phJ, uRepeat: 2, vScale: 13.8 });
      const clumps = [];
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283 + rand(-0.3, 0.3), d = k === 0 ? 0 : rand(7, 12.5); clumps.push([Math.cos(a) * d, 48 + rand(-2, 5), Math.sin(a) * d, rand(9, 11.5), rand(5, 6.5), rand(9, 11.5)]); }
      // tầng lá dưới tán chính: tán dày theo chiều đứng (rừng nhiệt đới), không phải đĩa lá mỏng như cái ô
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + rand(-0.4, 0.4), d = rand(4, 9); clumps.push([Math.cos(a) * d, 40 + rand(-2, 2), Math.sin(a) * d, rand(6.5, 8.5), rand(4.5, 5.5), rand(6.5, 8.5)]); }
      branchesTo(clumps, () => lerp3([0, 0, 0], top, rand(0.82, 1)), 0.75);
      clumpsOut(clumps);
    } else {
      // Cây lá rộng (bàng / sồi): thân cong nhẹ, gốc loe, các cành chính tỏa lên đỡ tán vòm
      barkKind = 'oak'; crownKind = 'broad'; height = 40; crownY = 18;
      const top = [rand(-1, 1), 17, rand(-1, 1)];
      limb(T, [0, 0, 0], top, 1.9, 1.1, { sides: 14, segs: 6, flare: 0.7, lobes: 6, bend: rand(0.4, 1.2) });
      // tán không đối xứng: lệch hẳn về một phía (vươn ra chỗ sáng), số chùm & cỡ chùm lệch nhau nhiều, có khoảng hở giữa
      // các chùm, chùm thấp xoè ngang -> không thành cục bông tròn đều
      const lx = rand(-2.6, 2.6), lz = rand(-2.6, 2.6), nC = 5 + Math.floor(RNG() * 4), ph0 = rand(0, 6.283);
      const clumps = [[lx + rand(-1, 1), rand(29, 34), lz + rand(-1, 1), rand(5.5, 7.5), rand(4.5, 6.5), rand(5.5, 7.5)]];
      for (let k = 0; k < nC; k++) {
        const a = ph0 + k / nC * 6.283 + rand(-0.45, 0.45), d = rand(5.5, 11.5), r = 7 * rand(0.5, 1.12), lo = RNG() < 0.35;
        clumps.push([Math.cos(a) * d + lx * 0.6, lo ? rand(19.5, 23) : rand(23, 30), Math.sin(a) * d + lz * 0.6, r * (lo ? 1.15 : 1), r * rand(0.55, 0.9), r * rand(0.75, 1.1)]);
      }
      branchesTo(clumps, () => lerp3([0, 0, 0], top, rand(0.62, 1)), 0.7);
      clumpsOut(clumps);
    }
    // Rễ nổi: vài rễ to toả từ gốc, nhô lên khỏi mặt đất một đoạn rồi chui xuống đất (gốc đặt thấp hơn mặt đất ~0,6 đv
    // -> mặt đất ở y cục bộ ~0,35). Không còn cảnh thân tròn cắm thẳng xuống nền phẳng. Nằm trong thân: gãy giữa thân thì
    // rễ ở lại với gốc cụt, bật gốc thì cả bầu rễ nhổ lên theo cây
    const rootR = { pine: young ? 1.3 : 1.8, cypress: 1.2, deadTree: 1.8, acacia: 1.45, willow: 2.1, jungle: 2.2, broadleaf: 1.9 }[kind];
    if (rootR) {
      const nR = young ? 4 : kind === 'jungle' ? 7 : 5 + (RNG() < 0.5 ? 1 : 0), ph = rand(0, 6.283);
      for (let k = 0; k < nR; k++) {
        const a = ph + (k / nR) * 6.283 + rand(-0.3, 0.3), ca = Math.cos(a), sa = Math.sin(a);
        // rễ thấp, tròn, nửa chìm trong đất: chỉ gờ lưng rễ nhô lên (không dựng đứng như tấm ván)
        const L = rootR * rand(2.0, 3.2) * (kind === 'jungle' ? 1.3 : 1), r0 = rootR * rand(0.24, 0.32);
        const p0 = [ca * rootR * 0.5, rootR * 0.5, sa * rootR * 0.5];
        const p1 = [ca * (rootR * 1.05 + L * 0.35), 0.3 + r0 * 0.1, sa * (rootR * 1.05 + L * 0.35)];
        // đầu rễ cắm dốc xuống sâu: cây đứng trên sườn dốc (hình học rễ dùng chung, không bám theo dốc) không lòi rễ lơ lửng
        const p2 = [ca * (rootR + L), -0.3 - L * 0.22, sa * (rootR + L)];
        // 2 đầu ống rễ chôn trong thân / dưới đất -> không cần nắp (bớt tam giác)
        limb(T, p0, p1, r0, r0 * 0.7, { sides: 6, segs: 2, bend: rand(0.1, 0.25), wobble: 0.15, open: true });
        limb(T, p1, p2, r0 * 0.7, r0 * 0.2, { sides: 5, segs: 1, bend: rand(0.1, 0.25), wobble: 0.2, open: true });
      }
    }
    // Dáng: kéo giãn cả cây trước khi gộp -> chiều cao / hồ sơ thân / khối tán (va chạm, chỗ gãy, đổ, cháy) khớp đúng dáng.
    // Thẻ lá billboard (corner) co giãn theo trung bình 2 hệ số
    const fw = form.w || 1, fh = form.h || 1;
    if (fw !== 1 || fh !== 1) {
      const S = new THREE.Matrix4().makeScale(fw, fh, fw), cs = (fw + fh) / 2, done = new Set();
      for (const g of [...T, ...C, ...(CL || [])]) {
        if (done.has(g)) continue;
        done.add(g);
        g.applyMatrix4(S);
        const a = g.attributes.corner;
        if (a) for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * cs, a.getY(i) * cs);
      }
      height *= fh; crownY *= fh;
    }
    const stem = stemProfile(T.slice(0, stemN));
    const trunk = merge(T);
    trunkShade(trunk, crownY, TRUNK_AO[kind] || 1);
    let crown = null;
    if (C.length) {
      crown = merge(C);
      shadeByHeight(crown, crownKind === 'frond' ? 0.85 : 0.62, 1.05);
      if (!crown.attributes.corner) crown.setAttribute('corner', new THREE.BufferAttribute(new Float32Array(crown.attributes.position.count * 2), 2));
    }
    // BẢN XA (LOD — TreeField.updateLOD): thân chỉ còn thân chính (cành khuất sau tán), tán giữ khối lõi / váy nón / tàu lá
    // + 1/4 số thẻ lá phóng to (phủ kín gần như cũ khi nhìn xa); dừa giữ một nửa số tàu lá. Chỉ lấy tập con các mảnh đã dựng, KHÔNG gọi thêm số ngẫu
    // nhiên (thứ tự RNG dựng cây / màu từng cây giữ nguyên giữa các máy). Cây không tán (xương rồng, cây khô): không có bản xa
    let trunkLo = null, crownLo = null, crownVlo = null;
    if (crown) {
      trunkLo = merge(stemLo || T.slice(0, stemN));
      trunkShade(trunkLo, crownY, TRUNK_AO[kind] || 1);
      const keep = CL || [];
      let ci = 0;
      if (!CL) for (let gi = 0; gi < C.length; gi++) {
        const g = C[gi];
        if (!g.attributes.corner) { if (!(frondPieces && Math.floor(gi / frondPieces) % 2)) keep.push(g); continue; }
        if (ci++ % TREE_LOD_CARDS) continue;
        const cg = g.clone(), a = cg.attributes.corner;
        for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * TREE_LOD_GROW, a.getY(i) * TREE_LOD_GROW);
        keep.push(cg);
      }
      crownLo = merge(keep);
      shadeByHeight(crownLo, crownKind === 'frond' ? 0.85 : 0.62, 1.05);
      if (!crownLo.attributes.corner) crownLo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array(crownLo.attributes.position.count * 2), 2));
      // BẢN RẤT XA (TREE_CROWN_VFAR): chỉ khối lõi / váy nón / tàu lá, bỏ thẻ lá — quá ~600 m trong sương
      // thẻ lá chỉ còn lấm tấm dưới 1 điểm ảnh mà vẫn chiếm ~37% tam giác tán xa (JUNGLE ~13 triệu tg tán xa mỗi khung, đo
      // 2026-10-29). Tán toàn thẻ hoặc toàn khối (thông): không có bản này
      const core = keep.filter(g => !g.attributes.corner);
      if (core.length && core.length < keep.length) {
        crownVlo = merge(core);
        shadeByHeight(crownVlo, crownKind === 'frond' ? 0.85 : 0.62, 1.05);
        crownVlo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array(crownVlo.attributes.position.count * 2), 2));
      }
    }
    // khối tán khi nằm: tán lá (thẻ billboard tính từ tâm -> cộng thêm nửa thẻ) / cây không lá: cành phía trên
    const cn = crown ? canopyOf(crown, -1e9) : canopyOf(trunk, height * 0.45);
    if (cn && crown) cn.rc += 2;
    return { trunk, crown, crownKind, crownTex, barkKind, height, stem, canopy: cn, trunkLo, crownLo, crownVlo, fw, young };
  }
  // Dáng cây trưởng thành (chiều cao & bề ngang tách riêng: cao-mảnh / thường / thấp-xoè) — mỗi cây chọn 1 theo vị trí,
  // nhân thêm hệ số kích thước ngẫu nhiên của bản đồ -> chiều cao & độ rộng tán không còn luôn tỉ lệ thuận với nhau
  const TREE_FORMS = [{ h: 1.15, w: 0.88 }, { h: 1, w: 1 }, { h: 0.86, w: 1.14 }];
  // Cây non mọc xen trong rừng: tỉ lệ theo loại (chọn theo vị trí, không đổi bản đồ / máy chủ) & dáng (~40% cao, thân mảnh)
  const TREE_YOUNG = { pine: 0.3, broadleaf: 0.2, jungle: 0.15, acacia: 0.15 };
  const YOUNG_FORM = { h: 0.42, w: 0.52, young: true };
  // Sắc tán riêng từng cây (theo vị trí — mọi máy như nhau, không tốn số ngẫu nhiên): cây cùng loài ngoài thực tế lệch
  // màu rõ (giống, tuổi, đất, nắng): xanh ngả vàng, xanh ngả lam, ô liu bám bụi, vài cây úa vàng; còn lại lệch nhẹ liên tục
  function crownTint(t, base) {
    const hx = Math.round(t.x * 4) | 0, hz = Math.round(t.z * 4) | 0, h = hash01(hx, hz, 31);
    const u = hash01(hx, hz, 32) - 0.5, v = hash01(hx, hz, 33) - 0.5;
    const c = h < 0.16 ? [1.0, 1.0, 0.82] : h < 0.32 ? [0.86, 0.95, 1.02] : h < 0.42 ? [0.88, 0.86, 0.74] : h < 0.44 ? [1.08, 0.98, 0.64]
      : [1 + u * 0.12, 1 + v * 0.05, 1 - u * 0.1];
    return base.clone().multiply(new THREE.Color(c[0], c[1], c[2]));
  }

  // Cây to cao như thật (so với xe): hệ số phóng theo loại; thân cây (bán kính gốc, phần thân / chiều cao) chặn đạn
  const TREE_SCALE = { cactus: 1.0, deadTree: 1.3, plane: 1.25 };   // plane: cây vỉa hè đô thị (dáng cây lá rộng, nhỏ hơn)
  const TREE_CHUNK = 1350;   // cạnh ô vùng chia rừng cây (bản đồ 5400 -> 4 x 4 ô)
  // LOD cây: ô cây có mép gần nhất cách camera quá TREE_LOD_DIST (đã quy đổi theo độ phóng đại kính ngắm) vẽ bản xa;
  // trễ ±TREE_LOD_HYST tránh nhấp nháy khi camera đứng sát ngưỡng
  // Bản đầy đủ chỉ cần trong vùng người chơi còn đọc được cành/lá riêng lẻ. Ở xa hơn,
  // silhouette vẫn giữ nguyên nhờ tán LOD phóng lớn nhưng số thẻ lá giảm còn 1/4.
  // Ngưỡng cũ 3600 khiến gần như cả bản đồ rừng luôn dùng cây đầy đủ khi nhìn từ drone.
  const TREE_LOD_DIST = 1150, TREE_LOD_HYST = 180, TREE_TRUNK_CULL = 2600;
  // tán bỏ thẻ lá (bản crownVlo) quá cự ly này: ở 2600 tán rừng tầm trung nhìn từ drone mỏng & phẳng hẳn, lộ đất (chụp
  // so 2026-10-29); ~600 m sương đã phủ ~3/4 màu
  const TREE_CROWN_VFAR = 4800;
  // theo mức đồ họa: lod = cự ly đổi sang bản xa, under = tầm vẽ cây tầng dưới tán, trans = lá xuyên sáng
  const TREE_Q = {
    low: { lod: 720, under: 300, trans: false, uShadow: false },
    medium: { lod: 960, under: 700, trans: true, uShadow: false },
    high: { lod: TREE_LOD_DIST, under: TREE_LOD_DIST, trans: true, uShadow: true },
    ultra: { lod: TREE_LOD_DIST, under: TREE_LOD_DIST, trans: true, uShadow: true }
  };
  const LEAF_TR = { value: 1 };   // uniform dùng chung mọi vật liệu lá: 0 = tắt lá xuyên sáng (máy yếu)
  // bản xa giữ 1 trong TREE_LOD_CARDS thẻ lá, phóng to TREE_LOD_GROW lần (4 -> 1/4 thẻ, ~1,8² ≈ 3,2 lần diện tích mỗi thẻ)
  const TREE_LOD_CARDS = 4, TREE_LOD_GROW = 1.8;
  // Cắt khung nhìn theo khối bao cả ô cây (toạ độ cục bộ của nhóm cây); tia dò trúng từng cây vẫn dùng khối bao gốc
  // của hình học một cây (InstancedMesh.raycast thử khối bao hình học theo ma trận từng cây)
  function cullBySphere(pool, sphere) {
    const geo = pool.mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const local = geo.boundingSphere;
    geo.boundingSphere = sphere;
    pool.mesh.frustumCulled = true;
    pool.mesh.raycast = function (rc, out) {
      geo.boundingSphere = local;
      try { THREE.InstancedMesh.prototype.raycast.call(this, rc, out); } finally { geo.boundingSphere = sphere; }
    };
  }
  const TRUNK = {
    palm: [1.3, 0.9], pine: [1.4, 0.85], cypress: [1.0, 0.3], cactus: [1.7, 0.9], deadTree: [1.4, 0.75],
    acacia: [1.2, 0.5], willow: [1.6, 0.5], jungle: [1.7, 0.72], broadleaf: [1.5, 0.45], plane: [1.25, 0.45]
  };
  // Độ bén lửa theo loại: cây khô / keo / thông nhựa / tàu dừa khô bén nhanh; cây lá rộng tươi, liễu ven nước, đại thụ
  // rừng ẩm khó cháy (cần đạn cháy hoặc trúng nhiều lần); xương rồng mọng nước gần như không cháy
  // Nổ trên tán (tree burst): ngòi nổ chạm của đạn kích nổ khi va cành trong tán. Quãng bay trung bình trong tán trước
  // khi chạm cành đủ cứng để kích nổ (đv; 8 đv = 1 m): tên lửa / đạn 30mm ngòi nhạy nổ sớm, đạn pháo tăng nổ muộn hơn.
  // Đạn xuyên động năng, đạn súng 12.7, đạn cháy, đạn chùm mẹ (nổ hẹn giờ) không nổ trên tán
  const BURST_LAMBDA = { HE: 45, NORMAL: 50, RPG: 30, ANTI_TANK_MISSILE: 32, CLUSTER_SUBMUNITION: 35, GATLING_BULLET: 30 };
  // số ngẫu nhiên 0..1 cố định theo (hạt giống phát bắn, cây, kênh) -> mọi máy cùng quyết định nổ / không nổ
  function hash01(a, b, c) {
    let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const FLAM = { deadTree: 1.6, acacia: 1.3, pine: 1.25, palm: 1.2, cypress: 1.0, broadleaf: 0.8, willow: 0.65, jungle: 0.55, cactus: 0.15, plane: 0.8 };
  // Trọng số che khuất của 1 cây (tán dày = 1; cây khô / mất tán chỉ còn thân = ít)
  const SCREEN = { cactus: 0, deadTree: 0.35, plane: 0.5 };   // cây vỉa hè đứng thưa thành hàng: che ít
  const DC = 24;                 // ô lưới mật độ tán (đơn vị thế giới)
  const TREE_COOL = 40;          // s: nhiệt dồn trên cây chưa bén lửa giảm còn ~37% sau mỗi 40 s
  // Độ che từ trên xuống của tán theo loại (tán dày = 1): tàu dừa thưa, trắc bá hẹp, cây vỉa hè cắt tỉa
  const CANOPY_COVER = { palm: 0.5, cypress: 0.7, plane: 0.8, acacia: 0.9 };

  class TreeField {
    constructor(parent, trees, groundAt) {
      this.group = new THREE.Group();
      this.group.name = 'trees';
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.burning = [];
      this.falling = [];
      this.grid = new Map();
      this.swaying = [];
      this.smouldering = [];
      this.lodCells = [];   // ô có bản xa: { full: [mesh], lo: [mesh], x0, x1, z0, z1, y, far }
      this.logs = [];       // cây đã đổ (khúc thân nằm trên đất, chưa vỡ vụn): chặn đạn như thân đứng
      // Gom theo loại -> tối đa 4 biến thể hình học / loại (3 dáng TREE_FORMS + cây non); mỗi biến thể chia tiếp theo ô vùng TREE_CHUNK:
      // mỗi ô một bộ InstancedMesh có khối bao riêng -> khung nhìn camera và khung chiếu bóng đổ (chỉ phủ quanh
      // camera) tự bỏ qua các ô không thấy (bản đồ lớn hàng nghìn cây; trước đây cả rừng vẽ ở mọi lượt)
      const byKind = {};
      for (const t of trees) (byKind[t.kind] || (byKind[t.kind] = [])).push(t);
      const chunkOf = t => Math.floor(t.x / TREE_CHUNK) * 1000 + Math.floor(t.z / TREE_CHUNK);
      this.kinds = {};
      for (const kind in byKind) {
        const list = byKind[kind];
        // dáng từng cây: cây non (tỉ lệ TREE_YOUNG) / 1 trong TREE_FORMS — chọn theo vị trí trên bản đồ (mọi máy như nhau,
        // không gọi thêm số ngẫu nhiên, danh sách cây của bản đồ & máy chủ không đổi)
        const yF = TREE_YOUNG[kind] || 0;
        const formOf = list.map(t => {
          const hx = Math.round(t.x * 4) | 0, hz = Math.round(t.z * 4) | 0;
          if (yF && hash01(hx, hz, 11) < yF) return TREE_FORMS.length;
          return Math.min(TREE_FORMS.length - 1, Math.floor(hash01(hx, hz, 12) * TREE_FORMS.length));
        });
        // chỉ dựng các dáng có cây dùng (thứ tự dựng cố định -> chuỗi số ngẫu nhiên giống nhau giữa các máy)
        const used = new Set(formOf);
        const forms = [...TREE_FORMS, YOUNG_FORM].map((f, i) => used.has(i) ? buildTreeVariant(kind, f) : null);
        // vật liệu dùng chung cho mọi dáng của 1 loại (cùng vỏ cây / ảnh tán)
        const v0 = forms.find(Boolean);
        const bTex = barkTex(v0.barkKind);
        // độ nổi vỏ: vỏ vảy / gờ Voronoi có rãnh sẫm rõ -> nổi vừa phải (0.08 cũ làm thân sần sùi như giấy nhám)
        const bS = v0.barkKind === 'tropic' ? 0.075 : v0.barkKind === 'pine' || v0.barkKind === 'oak' ? 0.045 : 0.08;
        // phong hoá vỏ thân (weathering.js, sau treeMat vì treeMat gán đè onBeforeCompile): rêu / địa y loang theo khí
        // hậu bản đồ, bùn bắn bám gốc, vệt nước chảy dọc thân
        // xương rồng: không rêu; sẹo bần nâu loang (vết thương / sương giá liền da), cháy nắng bạc màu mặt trên, cát bám chân
        const barkWx = m => typeof Weathering !== 'undefined' ? Weathering.apply(m, 'bark', v0.barkKind === 'cactus'
          ? { moss: 0, stain: 0.75, fade: 0.45, streak: 0.3, grime: 0.65, grimeH: 2.5, scale: 1.3 }
          // vỏ cây rừng mưa: rêu leo cao ~2 m từ gốc, mảng ố mốc ẩm sẫm, vệt nước mưa chảy dọc thân
          : v0.barkKind === 'tropic' ? { moss: 2.4, grimeH: 9, stain: 0.85, streak: 0.65 }
          : { moss: v0.barkKind === 'palm' ? 0.4 : 0.9 }) : m;
        const trunkMat = barkWx(treeMat(new THREE.MeshStandardMaterial({ map: bTex, bumpMap: bTex, bumpScale: bS, roughness: 0.95, metalness: 0 }), 'trunk'));
        const stumpMat = barkWx(treeMat(new THREE.MeshStandardMaterial({ map: bTex, bumpMap: bTex, bumpScale: bS, roughness: 0.95, metalness: 0 }), 'stump'));
        let crownMat = null, crownStumpMat = null, crownMap = null;
        if (v0.crown) {
          crownMap = v0.crownTex === 'conifer' ? coniferTex() : v0.crownKind === 'frond' ? leafTex('frond') : foliageTex(v0.crownKind);
          const leafMat = mode => sightCull(treeMat(new THREE.MeshStandardMaterial({
            map: crownMap, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0
          }), mode));
          crownMat = leafMat('leaf');
          crownStumpMat = leafMat('leafStump');
        }
        const variants = forms.map(v => v && { v, trunkMat, stumpMat, crownMat, crownStumpMat, crownMap });
        // số cây + phạm vi từng (biến thể, ô)
        const cells = new Map();
        list.forEach((t, k) => {
          const key = (t.u ? 5e8 : 0) + formOf[k] * 1e7 + chunkOf(t);
          let c = cells.get(key);
          if (!c) cells.set(key, c = { vi: formOf[k], under: !!t.u, n: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, V: null });
          c.n++; c.x0 = Math.min(c.x0, t.x); c.x1 = Math.max(c.x1, t.x); c.z0 = Math.min(c.z0, t.z); c.z1 = Math.max(c.z1, t.z);
        });
        const vs = [];
        for (const c of cells.values()) {
          const M = variants[c.vi], v = M.v, n = c.n;
          // thân & gốc cụt dùng chung hình học nhưng mỗi bên 1 bộ 'brk' riêng (độ cao gãy từng cây)
          const trunkGeo = v.trunk.clone(), stumpGeo = v.trunk.clone(), crownGeo = v.crown ? v.crown.clone() : null;
          const inst = () => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1);
          trunkGeo.setAttribute('brk', inst()); trunkGeo.setAttribute('burn', inst());
          stumpGeo.setAttribute('brk', inst()); stumpGeo.setAttribute('burn', inst());
          if (crownGeo) { crownGeo.setAttribute('brk', inst()); crownGeo.setAttribute('burn', inst()); }
          const trunk = new Pool(this.group, trunkGeo, M.trunkMat, n, { color: true });
          trunk.mesh.customDepthMaterial = treeDepthMat(null, 'trunk');
          trunk.mesh.onBeforeRender = windTick;
          const stump = new Pool(this.group, stumpGeo, M.stumpMat, n, { color: true });
          stump.mesh.customDepthMaterial = treeDepthMat(null, 'stump');
          stump.mesh.onBeforeRender = windTick;
          stump.mesh.visible = false;   // chưa có gốc cụt nào (bật khi cây đầu tiên trong ô gãy)
          let crown = null, cstump = null;
          if (crownGeo) {
            crown = new Pool(this.group, crownGeo, M.crownMat, n, { color: true });
            crown.mesh.customDepthMaterial = treeDepthMat(M.crownMap, 'leaf');
            crown.mesh.onBeforeRender = windTick;
            // phần tán dưới chỗ gãy đứng lại cùng gốc cụt (gãy ngọn trong tán): dùng chung bộ đệm hình học với tán,
            // riêng 'brk' / 'burn' từng cây
            const csGeo = new THREE.BufferGeometry();
            csGeo.setIndex(crownGeo.index);
            for (const k in crownGeo.attributes) if (k !== 'brk' && k !== 'burn') csGeo.setAttribute(k, crownGeo.attributes[k]);
            csGeo.setAttribute('brk', inst()); csGeo.setAttribute('burn', inst());
            cstump = new Pool(this.group, csGeo, M.crownStumpMat, n, { color: true });
            cstump.mesh.customDepthMaterial = treeDepthMat(M.crownMap, 'leafStump');
            cstump.mesh.onBeforeRender = windTick;
            cstump.mesh.visible = false;
          }
          // khối bao cả ô (thêm cao / tầm đổ của cây lớn nhất)
          const sphere = new THREE.Sphere(new THREE.Vector3((c.x0 + c.x1) / 2, groundAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2), (c.z0 + c.z1) / 2),
            Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2 + 160);
          for (const P of [trunk, stump, crown, cstump]) if (P) cullBySphere(P, sphere);
          c.V = { info: v, trunk, crown, stump, cstump };
          vs.push(c.V);
          // BẢN XA của ô: InstancedMesh hình học đơn giản dùng CHUNG bộ đệm ma trận / màu từng cây và thuộc tính gãy / cháy
          // với mesh đầy đủ -> cây đổ, cháy, bị xé lá hiện y hệt ở cả hai bản. Không nhận tia dò (mesh đầy đủ vẫn nhận kể cả
          // khi đang ẩn); gốc cụt không có bản xa
          if (v.trunkLo && crown) {
            const lodOf = (P, geoLo) => {
              const g = geoLo.clone();
              for (const k of ['brk', 'burn']) if (P.mesh.geometry.attributes[k]) g.setAttribute(k, P.mesh.geometry.attributes[k]);
              g.boundingSphere = sphere;
              const m = new THREE.InstancedMesh(g, P.mesh.material, Math.max(1, P.cap));
              m.instanceMatrix = P.mesh.instanceMatrix;
              if (P.mesh.instanceColor) m.instanceColor = P.mesh.instanceColor;
              m.count = 0;
              // Cây xa vẫn nhận bóng môi trường nhưng không tham gia shadow pass động. Bóng từng
              // cành/lá ở cự ly này không còn đọc được, trong khi chi phí tam giác gần gấp đôi.
              m.castShadow = false; m.receiveShadow = P.mesh.receiveShadow;
              m.customDepthMaterial = P.mesh.customDepthMaterial;
              m.onBeforeRender = P.mesh.onBeforeRender;
              m.frustumCulled = true;
              m.raycast = () => {};
              m.visible = false;
              this.group.add(m);
              return m;
            };
            this.lodCells.push({ full: [trunk.mesh, crown.mesh], lo: [lodOf(trunk, v.trunkLo), lodOf(crown, v.crownLo)],
              vlo: v.crownVlo ? lodOf(crown, v.crownVlo) : null,
              x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y: sphere.center.y, far: false, under: c.under });
          }
        }
        this.kinds[kind] = vs;
        // thứ tự cây giữ nguyên như danh sách bản đồ (đồng bộ trạng thái cây theo chỉ số giữa các máy)
        list.forEach((t, k) => {
          const V = cells.get((t.u ? 5e8 : 0) + formOf[k] * 1e7 + chunkOf(t)).V;
          const gy = groundAt(t.x, t.z);
          const s = t.s * (TREE_SCALE[kind] !== undefined ? TREE_SCALE[kind] : 1.6);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, gy - 0.6, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot), new THREE.Vector3(s, s, s));
          const tint = new THREE.Color(1, 1, 1).multiplyScalar(rand(0.85, 1.08));
          // tán lá rộng: thẻ lá ngoài nắng gắt ra xanh chanh sáng hơn cả đồng cỏ -> hạ tông cho tán sẫm, đặc như cây thật
          const ctint = crownTint(t, tint).multiplyScalar(kind === 'broadleaf' || kind === 'willow' || kind === 'plane' ? 0.8 : 1);
          const item = {
            idx: this.items.length, x: t.x, z: t.z, y: gy, kind, s, V, rot: t.rot, height: V.info.height * s,
            ti: V.trunk.add(m, tint), ci: V.crown ? V.crown.add(m, ctint) : -1,
            base: m.clone(), tint, ctint, heat: 0, state: 'ok', burnT: 0, brk: 0, si: -1, sci: -1, capS: -1, capT: -1, tcol: tint,
            under: !!t.u
          };
          const tk = TRUNK[kind] || [1.4, 0.6];
          // thân theo dáng: cây mảnh / cây non thân nhỏ hơn
          item.trunkR = tk[0] * s * (V.info.fw || 1); item.trunkH = item.height * tk[1];
          item._dw = 0;
          this.items.push(item);
          this.reweigh(item);
          const key = this.key(t.x, t.z);
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(item);
        });
        vs.forEach(V => { V.trunk.commit(); if (V.crown) V.crown.commit(); });
      }
      // dăm gỗ tua tủa ở vết gãy: 1 ở đầu gốc cụt + 1 ở đầu khúc ngọn đổ cho mỗi cây gãy
      this.caps = new Pool(this.group, splinterGeo(), new THREE.MeshStandardMaterial({ map: woodTex(), side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }),
        Math.max(2, trees.length * 2), { color: true });
      this.buildLitter();
      this.setQuality((typeof window !== 'undefined' && window.game && window.game.gfxTier) || 'high');
    }
    key(x, z) { return Math.floor(x / 60) * 1000 + Math.floor(z / 60); }

    // Thảm kim / lá rụng dưới tán từng cây: đĩa lưới (tâm + 3 vành x 12 đỉnh, bán kính lệch ngẫu nhiên -> mép không tròn)
    // bám đúng mặt đất, gộp theo ô vùng TREE_CHUNK thành 1 mesh / ô (ít lệnh vẽ). Nối gốc cây với nền: đất mùn sẫm ở
    // gốc nhạt dần ra mép tán. Cây đổ vẫn để lại thảm; cây cháy rụi: thảm cháy đen thành tro (litterTint)
    buildLitter() {
      this.litter = [];
      const SEG = 12, RINGS = [0.3, 0.62, 1], NV = 1 + SEG * RINGS.length;
      const byCell = new Map();
      for (const it of this.items) {
        // cây tầng dưới tán (rừng rậm): đứng sát gốc đại thụ, thảm của đại thụ đã phủ -> bỏ (hàng chục nghìn đĩa trong suốt chồng nhau)
        if (!LITTER[it.kind] || !it.V.info.canopy || it.under) continue;
        const k = Math.floor(it.x / TREE_CHUNK) * 1000 + Math.floor(it.z / TREE_CHUNK);
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push(it);
      }
      if (!byCell.size) return;
      const mat = new THREE.MeshStandardMaterial({ map: litterTex(), vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      for (const list of byCell.values()) {
        const n = list.length, pos = new Float32Array(n * NV * 3), uv = new Float32Array(n * NV * 2), col = new Float32Array(n * NV * 3), idx = [];
        const geo = new THREE.BufferGeometry();
        list.forEach((it, j) => {
          const L = LITTER[it.kind], cn = it.V.info.canopy, base = j * NV;
          const hx = Math.round(it.x * 4) | 0, hz = Math.round(it.z * 4) | 0;
          const R = Math.max(6, cn.rc * it.s * L[1]), rot = hash01(hx, hz, 21) * 6.283, br = 0.85 + 0.25 * hash01(hx, hz, 22);
          const u0 = L[0] * 0.5 + 0.25;
          const put = (v, x, z, u, w, c) => {
            pos[v * 3] = x; pos[v * 3 + 2] = z; uv[v * 2] = u; uv[v * 2 + 1] = w;
            col[v * 3] = c * br; col[v * 3 + 1] = c * br; col[v * 3 + 2] = c * br;
          };
          put(base, it.x, it.z, u0, 0.5, 0.8);   // gốc cây: đất ẩm tối hơn
          for (let r = 0; r < RINGS.length; r++) for (let s = 0; s < SEG; s++) {
            const a = (s / SEG) * 6.283, f = RINGS[r], jr = f * (r ? 0.8 + 0.4 * hash01(hx + r, hz + s, 23) : 1);
            put(base + 1 + r * SEG + s, it.x + Math.cos(a) * R * jr, it.z + Math.sin(a) * R * jr,
              u0 + 0.245 * Math.cos(a + rot) * f, 0.5 + 0.49 * Math.sin(a + rot) * f, 1);
          }
          // tam giác quay mặt lên trời (nhìn từ trên: ngược chiều kim đồng hồ theo x, -z)
          for (let s = 0; s < SEG; s++) {
            const s1 = (s + 1) % SEG;
            idx.push(base, base + 1 + s1, base + 1 + s);
            for (let r = 0; r + 1 < RINGS.length; r++) {
              const a0 = base + 1 + r * SEG + s, a1 = base + 1 + r * SEG + s1, b0 = a0 + SEG, b1 = a1 + SEG;
              idx.push(a0, a1, b1, a0, b1, b0);
            }
          }
          it._lit = { geo, base, n: NV };
        });
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * NV * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setIndex(idx);
        for (const it of list) this.litterLift(it, false);
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat);
        m.name = 'treeLitter';
        m.receiveShadow = true; m.castShadow = false;
        m.renderOrder = -1;          // vẽ ngay sau mặt đất, trước vật trong suốt khác (khói, lửa)
        m.raycast = () => {};
        this.group.add(m);
        this.litter.push(m);
      }
    }
    // đặt lại độ cao các đỉnh thảm của 1 cây theo mặt đất hiện tại (hố bom mới dưới tán)
    litterLift(it, upd = true) {
      const L = it._lit;
      if (!L) return;
      const p = L.geo.attributes.position ? L.geo.attributes.position.array : null;
      if (!p) return;
      for (let v = L.base; v < L.base + L.n; v++) p[v * 3 + 1] = this.groundAt(p[v * 3], p[v * 3 + 2]) + 0.12;
      if (upd) L.geo.attributes.position.needsUpdate = true;
    }
    // nhân màu thảm 1 cây (cháy rụi: tro đen)
    litterTint(it, k) {
      const L = it._lit;
      if (!L) return;
      const c = L.geo.attributes.color;
      for (let v = L.base; v < L.base + L.n; v++) c.setXYZ(v, c.getX(v) * k, c.getY(v) * k, c.getZ(v) * k);
      c.needsUpdate = true;
      L.k = (L.k || 1) * k;
    }

    // ---- ĐỒNG BỘ: mỗi cây 1 ký tự (0 nguyên, B trụi lá / cháy rụi, F đã đổ) + áp hợp nhất
    stateString() {
      let s = '';
      // cây đổ: 'a'..'p' = hướng đổ (16 hướng) + 1 ký tự độ cao gãy 'A'..'Z' (A: bật cả gốc, còn lại: phần 25 chiều cao)
      // để máy khác đổ cùng chiều & gãy cùng chỗ với chủ phòng ('F' cũ: không rõ hướng)
      for (const it of this.items) s += it.fallen ? String.fromCharCode(97 + (it.fallSec || 0), 65 + this.brkQ(it)) : (it.crownGone || it.state === 'burnt') ? 'B' : '0';
      return s;
    }
    brkQ(it) { return it.brk > 0 ? Math.max(1, Math.min(25, Math.round(it.brk / it.V.info.height * 25))) : 0; }
    applyState(str, fx) {
      const s = String(str || '');
      let k = 0;
      this.items.forEach((it, i) => {
        const c = s[k++];
        const sec = c ? c.charCodeAt(0) - 97 : -1;
        if (sec >= 0 && sec < 16) {
          const a = sec * Math.PI / 8, q = s[k] ? Math.max(0, Math.min(25, s.charCodeAt(k++) - 65)) : 0;
          const brk = q / 25 * it.V.info.height;
          if (!it.fallen) this.fell(it, Math.cos(a), Math.sin(a), fx, { brk });
          // đã đổ nhưng khác hướng / chỗ gãy của chủ phòng: đặt lại cho khớp (không bụi / tiếng)
          else if ((it.fallSec !== sec || this.brkQ(it) !== q) && it.fall) this.fell(it, Math.cos(a), Math.sin(a), fx, { reorient: true, brk });
        } else if (c === 'F' && !it.fallen) this.fell(it, Math.cos(i), Math.sin(i), fx);
        else if (c === 'B' && !it.fallen && !it.crownGone) {
          it.crownGone = true;
          this.crownHide(it);
          this.reweigh(it);
        }
      });
    }

    // ---- MẬT ĐỘ TÁN CÂY (rừng rậm che tầm nhìn): lưới ô DC, cập nhật khi cây đổ / trụi lá / cháy rụi
    reweigh(it) {
      if (!this.dens) this.dens = new Map();
      const w = it.fallen ? 0 : (it.crownGone || it.state === 'burnt') ? 0.2 : (SCREEN[it.kind] !== undefined ? SCREEN[it.kind] : 1);
      if (w === it._dw) return;
      const k = Math.floor(it.x / DC) * 100000 + Math.floor(it.z / DC);
      this.dens.set(k, (this.dens.get(k) || 0) + w - it._dw);
      it._dw = w;
    }
    /** Số cây có tán (quy đổi) trong ô 3x3 (~72x72) quanh điểm. >= ~10: rừng rậm */
    densityAt(x, z) {
      if (!this.dens) return 0;
      const i = Math.floor(x / DC), j = Math.floor(z / DC);
      let n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += this.dens.get((i + a) * 100000 + j + b) || 0;
      return n;
    }
    /** Quãng đường đi xuyên rừng rậm giữa 2 điểm (dừng sớm khi vượt `limit`) */
    denseLength(ax, az, bx, bz, limit, thr) {
      const L = Math.hypot(bx - ax, bz - az), step = 12, n = Math.ceil(L / step);
      if (!n) return 0;
      let acc = 0;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        if (this.densityAt(ax + (bx - ax) * t, az + (bz - az) * t) >= thr) { acc += L / n; if (acc > limit) return acc; }
      }
      return acc;
    }
    /** Đoạn bay đạn cắt thân cây đang đứng / gốc cụt / khúc thân cây đổ nằm -> điểm chạm gần nhất { x, y, z, t, it }
     *  (+ nx, ny, nz khi trúng khúc thân nằm). Tán lá thì đạn xuyên qua */
    trunkHit(ax, ay, az, bx, by, bz) {
      const minX = Math.min(ax, bx) - 4, maxX = Math.max(ax, bx) + 4, minZ = Math.min(az, bz) - 4, maxZ = Math.max(az, bz) + 4;
      if ((maxX - minX) > 600 || (maxZ - minZ) > 600) return null;
      let best = null;
      for (let gx = Math.floor(minX / 60); gx <= Math.floor(maxX / 60); gx++) {
        for (let gz = Math.floor(minZ / 60); gz <= Math.floor(maxZ / 60); gz++) {
          const l = this.grid.get(gx * 1000 + gz);
          if (!l) continue;
          for (const it of l) {
            if ((it.fallen && !it.brk) || it.x < minX - it.trunkR || it.x > maxX + it.trunkR || it.z < minZ - it.trunkR || it.z > maxZ + it.trunkR) continue;
            // giao đoạn bay (2D) với vòng thân; đầu đoạn đã nằm trong thân thì bỏ qua (nòng sát gốc cây)
            const dx = bx - ax, dz = bz - az, fx = ax - it.x, fz = az - it.z;
            const qa = dx * dx + dz * dz, qb = 2 * (fx * dx + fz * dz), qc = fx * fx + fz * fz - it.trunkR * it.trunkR;
            if (qa < 1e-9 || qc <= 0) continue;
            const disc = qb * qb - 4 * qa * qc;
            if (disc < 0) continue;
            const t = (-qb - Math.sqrt(disc)) / (2 * qa);
            if (t < 0 || t > 1 || (best && t >= best.t)) continue;
            const y = ay + (by - ay) * t;
            // cây gãy: gốc cụt còn đứng vẫn chặn đạn
            if (y < it.y - 1 || y > it.y + (it.fallen ? it.brk * it.s - 0.6 : it.trunkH)) continue;
            best = { t, x: ax + (bx - ax) * t, y, z: az + (bz - az) * t, it };
          }
        }
      }
      // khúc thân cây đổ nằm trên đất (ống quanh trục thân nằm, từ chỗ gãy tới hết phần thân chặn đạn)
      for (const it of this.logs) {
        const F = it.fall;
        if (!F || (F.tab && !F.landed)) continue;   // đang đổ: chưa nằm yên
        const reach = it.height + 4;
        if (it.x < minX - reach || it.x > maxX + reach || it.z < minZ - reach || it.z > maxZ + reach) continue;
        const h = this.logHit(it, ax, ay, az, bx, by, bz);
        if (h && (!best || h.t < best.t)) best = h;
      }
      return best;
    }
    // Đoạn bay a->b cắt khúc thân nằm của cây đổ -> { t, x, y, z, it, nx, ny, nz } | null
    logHit(it, ax, ay, az, bx, by, bz) {
      const hb = it.brk * it.s, u0 = Math.min(0.9, (hb + 0.5) / it.height), u1 = Math.max(u0 + 0.05, it.trunkH / it.height);
      const A = this.trunkPoint(it, u0), B = this.trunkPoint(it, u1);
      // thân thuôn: gãy càng cao khúc nằm càng mảnh
      const r = it.trunkR * 0.8 * (1 - 0.5 * Math.min(1, hb / Math.max(1, it.trunkH)));
      const d1x = bx - ax, d1y = by - ay, d1z = bz - az, d2x = B.x - A.x, d2y = B.y - A.y, d2z = B.z - A.z;
      const rx = ax - A.x, ry = ay - A.y, rz = az - A.z;
      const aa = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
      if (aa < 1e-9 || e < 1e-9) return null;
      const f = d2x * rx + d2y * ry + d2z * rz, c = d1x * rx + d1y * ry + d1z * rz, bb = d1x * d2x + d1y * d2y + d1z * d2z;
      // điểm gần nhau nhất giữa 2 đoạn (s: dọc đường đạn, u: dọc khúc thân)
      const den = aa * e - bb * bb;
      let s = den > 1e-9 ? clamp01((bb * f - c * e) / den) : 0, u = (bb * s + f) / e;
      if (u < 0) { u = 0; s = clamp01(-c / aa); } else if (u > 1) { u = 1; s = clamp01((bb - c) / aa); }
      const px = ax + d1x * s, py = ay + d1y * s, pz = az + d1z * s, qx = A.x + d2x * u, qy = A.y + d2y * u, qz = A.z + d2z * u;
      const dist = Math.hypot(px - qx, py - qy, pz - qz);
      if (dist >= r) return null;
      // đầu đoạn đã nằm trong khúc thân (bắn sát / từ trên thân) thì bỏ qua
      const u0a = clamp01(f / e), dA = Math.hypot(ax - (A.x + d2x * u0a), ay - (A.y + d2y * u0a), az - (A.z + d2z * u0a));
      if (dA < r) return null;
      // lùi từ điểm gần nhất về mặt ống theo góc giữa đường đạn và thân
      const sin = Math.sqrt(Math.max(0, 1 - bb * bb / (aa * e)));
      const t = Math.max(0, s - Math.sqrt(r * r - dist * dist) / (Math.sqrt(aa) * Math.max(0.2, sin)));
      const x = ax + d1x * t, y = ay + d1y * t, z = az + d1z * t;
      // pháp tuyến: từ trục thân tới điểm chạm
      const ut = clamp01(((x - A.x) * d2x + (y - A.y) * d2y + (z - A.z) * d2z) / e);
      const nx = x - (A.x + d2x * ut), ny = y - (A.y + d2y * ut), nz = z - (A.z + d2z * ut), nl = Math.hypot(nx, ny, nz) || 1;
      return { t, x, y, z, it, nx: nx / nl, ny: ny / nl, nz: nz / nl };
    }
    // Độ che từ trên xuống (drone soi) của tán cây đứng cho 1 xe tâm (x, z), bán kính thân xe rv: lấy 5 điểm (tâm + 4 điểm
    // cách tâm rv), mỗi điểm che theo tán dày nhất phủ lên nó, trả trung bình 0 (trống) .. 1 (cả xe nằm dưới tán dày).
    // Nhiều cây đứng sát nhau cùng che được 1 xe. Tán đã trụi / đang cháy / cháy rụi / cây đổ không che; tán bị xé bớt lá che ít đi
    canopyCover(x, z, rv = 16) {
      const P = [[0, 0], [rv, 0], [-rv, 0], [0, rv], [0, -rv]], cov = [0, 0, 0, 0, 0];
      for (const it of this.near(x, z, 40 + rv)) {
        if (it.fallen || it.ci < 0 || it.crownGone || it.state === 'burning' || it.state === 'burnt') continue;
        const cn = it.V.info.canopy;
        if (!cn) continue;
        const R = cn.rc * it.s, k = (CANOPY_COVER[it.kind] !== undefined ? CANOPY_COVER[it.kind] : 1) * clamp01(it.leaves === undefined ? 1 : it.leaves);
        for (let i = 0; i < 5; i++) if (k > cov[i] && Math.hypot(it.x - x - P[i][0], it.z - z - P[i][1]) < R) cov[i] = k;
      }
      return (cov[0] + cov[1] + cov[2] + cov[3] + cov[4]) / 5;
    }
    near(x, z, r) {
      const out = [];
      const x0 = Math.floor((x - r) / 60), x1 = Math.floor((x + r) / 60), z0 = Math.floor((z - r) / 60), z1 = Math.floor((z + r) / 60);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const l = this.grid.get(i * 1000 + j);
        if (l) for (const it of l) if (Math.hypot(it.x - x, it.z - z) <= r) out.push(it);
      }
      return out;
    }
    setColor(it, c) {
      this.trunkColor(it, c);
      this.crownColor(it, c);
    }
    // màu / ẩn tán áp cả cho phần tán còn trên gốc cụt
    crownColor(it, c) {
      if (it.ci >= 0) it.V.crown.color(it.ci, c);
      if (it.sci >= 0) it.V.cstump.color(it.sci, c);
    }
    crownHide(it) {
      if (it.ci >= 0) it.V.crown.hide(it.ci);
      if (it.sci >= 0) it.V.cstump.hide(it.sci);
    }
    // màu thân áp cả cho gốc cụt & dăm gỗ ở vết gãy (cháy sém / cháy đen cùng lúc)
    trunkColor(it, c) {
      it.tcol = c;
      it.V.trunk.color(it.ti, c);
      if (it.si >= 0) it.V.stump.color(it.si, c);
      if (it.capS >= 0) { this.caps.color(it.capS, c); this.caps.color(it.capT, c); }
    }
    // Đạn ngòi chạm bay xuyên tán: mỗi cây quyết định 1 lần / viên đạn (seen: tập cây đã xét) theo quãng xuyên tán dọc
    // hướng bay: P(nổ) = 1 - e^(-quãng/λ), điểm nổ lấy theo phân bố mũ trong tán. Trả điểm nổ sớm nhất { x, y, z, it, t }
    // (t: tham số dọc đoạn a->b, có thể > 1 = nổ ở đoạn sau) hoặc null. Cây trụi lá chỉ còn cành: khó kích nổ hơn
    crownBurst(ax, ay, az, bx, by, bz, ammo, heavy, seed, seen) {
      const lam0 = BURST_LAMBDA[ammo];
      if (!lam0) return null;
      const dx = bx - ax, dy = by - ay, dz = bz - az, segL = Math.hypot(dx, dy, dz);
      if (segL < 1e-6) return null;
      const pad = 34, minX = Math.min(ax, bx) - pad, maxX = Math.max(ax, bx) + pad, minZ = Math.min(az, bz) - pad, maxZ = Math.max(az, bz) + pad;
      if ((maxX - minX) > 900 || (maxZ - minZ) > 900) return null;
      let best = null;
      for (let gx = Math.floor(minX / 60); gx <= Math.floor(maxX / 60); gx++) {
        for (let gz = Math.floor(minZ / 60); gz <= Math.floor(maxZ / 60); gz++) {
          const l = this.grid.get(gx * 1000 + gz);
          if (!l) continue;
          for (const it of l) {
            if (it.fallen || seen.has(it.idx)) continue;
            const cn = it.V.info.canopy;
            if (!cn || it.kind === 'cactus') continue;
            const rx = cn.rc * it.s * 0.85, ry = Math.max(6, cn.ry * it.s * 0.9);
            const cx = it.x, cy = it.y - 0.6 + cn.dc * it.s, cz = it.z;
            if (it.x < minX - rx || it.x > maxX + rx || it.z < minZ - rx || it.z > maxZ + rx) continue;
            // giao đoạn bay với elip khối tán (đưa về hình cầu đơn vị)
            const px = (ax - cx) / rx, py = (ay - cy) / ry, pz = (az - cz) / rx, qx = dx / rx, qy = dy / ry, qz = dz / rx;
            const A = qx * qx + qy * qy + qz * qz, B = 2 * (px * qx + py * qy + pz * qz), C = px * px + py * py + pz * pz - 1;
            const disc = B * B - 4 * A * C;
            if (disc <= 0) continue;
            const sq = Math.sqrt(disc), t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
            if (t1 < 0 || t0 > 1) continue;                     // chưa tới / đã qua khỏi tán
            seen.add(it.idx);
            if (t0 < 0) continue;                               // bắn ra từ trong tán (nòng nằm trong tán): bỏ qua cây này
            const chord = (t1 - t0) * segL;
            const lam = lam0 * (heavy ? 0.9 : 1) * ((it.ci < 0 || it.crownGone) ? 2.5 : 1);
            const pDet = 1 - Math.exp(-chord / lam), u = hash01(seed >>> 0, it.idx, 7);
            if (u >= pDet) continue;
            const depth = -lam * Math.log(1 - u), t = t0 + depth / segL;
            if (!best || t < best.t) best = { x: ax + dx * t, y: ay + dy * t, z: az + dz * t, it, t };
          }
        }
      }
      return best;
    }
    // Cây che mảnh văng cho xe phía sau: thân cây (cả gốc cụt) nằm trên đường bay của mảnh hứng phần lớn mảnh, sức ép
    // vẫn vòng qua được; tán rừng rậm nuốt bớt mảnh nhỏ theo quãng xuyên rừng. Trả hệ số sát thương còn lại (1 = không che)
    blastShield(ex, ey, ez, ux, uy, uz) {
      let f = 1;
      const h = this.trunkHit(ex, ey, ez, ux, uy, uz);
      // thân che: thân to che nhiều hơn (bán kính thân so với ~1,5 đv của thân nhỏ)
      if (h && Math.hypot(h.x - ux, h.z - uz) > 4) f *= Math.max(0.5, 0.8 - (h.it.trunkR - 1.5) * 0.08);
      const dense = this.denseLength(ex, ez, ux, uz, 1e9, 10);
      if (dense > 0) f *= Math.max(0.7, 1 - dense / 600);
      return Math.max(0.45, f);
    }
    // Khoảng cách 3D từ điểm nổ tới trục thân cây (cây đứng: đoạn gốc -> ngọn; cây đổ: dọc thân nằm). Nổ trên cao / nổ
    // trong tán / nổ sát gốc đều tính đúng, không chỉ khoảng cách ngang
    axisDist(it, x, y, z) {
      const a = this.trunkPoint(it, 0), b = this.trunkPoint(it, 1);
      const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, L2 = ex * ex + ey * ey + ez * ez || 1;
      const t = clamp01(((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / L2);
      return Math.hypot(a.x + ex * t - x, a.y + ey * t - y, a.z + ez * t - z);
    }
    // Hẹn giờ hiệu ứng theo lúc sóng xung kích lan tới (chỉ phần nhìn: lắc cây, dăm vỏ, lửa bị thổi bạt)
    later(t, fn) { if (t < 0.008) fn(); else (this.delayed || (this.delayed = [])).push({ t, fn }); }

    // Thân cây vỡ vụn nát khi bị bắn cháy rồi tiếp tục bị pháo / đạn liên thanh băm nát
    shatter(it, fx, dx, dz, ammo, heavy) {
      if (it.shattered) return;
      it.shattered = true;
      it.fallen = true;
      const li = this.logs.indexOf(it); if (li >= 0) this.logs.splice(li, 1);
      this.reweigh(it);

      // Gỡ khỏi các hàng đợi động
      const bi = this.burning.indexOf(it); if (bi >= 0) this.burning.splice(bi, 1);
      const fi = this.falling.indexOf(it); if (fi >= 0) this.falling.splice(fi, 1);
      const si = this.swaying.indexOf(it); if (si >= 0) this.swaying.splice(si, 1);
      const mi = this.smouldering.indexOf(it); if (mi >= 0) this.smouldering.splice(mi, 1);

      // Ẩn khúc thân trên & tán lá
      it.V.trunk.hide(it.ti);
      it.V.trunk.commit();
      if (it.ci >= 0) { it.V.crown.hide(it.ci); it.V.crown.commit(); it.crownGone = true; }

      // Giữ lại một gốc cây cụt thấp lởm chởm ở chân
      const st = it.V.info.stem;
      const lo = Math.min(3, st.top * 0.25);
      const stumpH = it.brk > 0 ? it.brk : rand(lo, lo + 2.5);
      this.applyBreak(it, stumpH);
      this.placeStump(it);
      if (it.state === 'burnt' || it.state === 'burning') {
        this.trunkColor(it, TREE_COLORS.charred);
        this.setBurn(it, 1.0, 0.8);
      }
      it.V.stump.commit();
      this.caps.commit();

      // Hiệu ứng nổ tung vỡ vụn gỗ / than
      const charred = it.state === 'burnt' || it.state === 'burning';
      const py = it.y + Math.min(it.trunkH * 0.45, 12);
      const colChunk = charred ? [0.12, 0.1, 0.09] : [0.42, 0.33, 0.24];
      chunks(fx, it.x, py, it.z, charred ? 26 : 18, 1.3, colChunk, 38);
      chunks(fx, it.x, py + 3, it.z, 14, 0.8, charred ? [0.18, 0.16, 0.15] : [0.65, 0.52, 0.36], 26);
      dustBurst(fx, it.x, it.y + 2, it.z, 4, 7, charred ? [0.28, 0.27, 0.25] : [0.62, 0.55, 0.44]);

      if (charred && fx && fx.fire) {
        for (let k = 0; k < 16; k++) {
          fx.fire.add({
            x: it.x + rand(-3, 3), y: it.y + rand(1, 6), z: it.z + rand(-3, 3),
            vx: rand(-12, 12), vy: rand(8, 28), vz: rand(-12, 12),
            size: rand(0.9, 2.2), grow: -0.4, drag: 0.9, grav: 24, life: rand(0.8, 1.8),
            alpha: 1, fadeIn: 0.01, c0: [1, 0.65, 0.2], c1: [0.8, 0.18, 0.02], cell: 3, floor: false
          });
        }
      }
      sfx('woodBreak', it.x, it.y + 3, it.z, 1.3, { crush: true });
    }

    // Sóng nổ + mảnh văng + nhiệt tác động lên cây quanh điểm nổ
    damageAt(x, y, z, ammo, heavy, fx, info) {
      const A = ammoInfo(ammo, heavy);
      const blasty = A.power >= 0.5;
      // Sóng nổ lan xa hơn vùng sát thương: cây rung lắc theo khoảng cách
      const Rw = blasty ? A.radius * 2.8 + 12 : A.radius * 1.8 + 6;
      const R = A.radius * 2.2 + 6;
      const SW = 2700;   // sóng xung kích ~340 m/s (8 đv = 1 m): cây xa lắc / đổ muộn hơn cây gần một chút
      // có ExplosionFX: hẹn theo phần NHÌN THẤY của mặt sóng (đã làm chậm cho mắt kịp thấy) -> cây lắc, lá bay, cây đổ
      // đúng lúc vỏ sóng trên màn hình quét qua, cùng nhịp khói bạt / cỏ rạp / bụi bốc
      const W = fx && fx.chargeOf ? fx.chargeOf(ammo, heavy) : 0;
      const arrive = (d) => (W > 0 && fx.shockArrival ? fx.shockArrival(d, W) : d / SW);
      for (const it of this.near(x, z, Rw)) {
        if (it.shattered) continue;
        const d = this.axisDist(it, x, y, z);
        if (d > Rw) continue;
        const dx = it.x - x, dz = it.z - z, delay = arrive(d);
        // nhà chắn giữa điểm nổ và cây: sóng nổ & mảnh văng bị chặn phần lớn
        const sh = (this.solidHit && d > 14 && this.solidHit(x, y + 2, z, it.x, it.y + Math.min(it.trunkH, 24), it.z)) ? 0.3 : 1;
        const kw = (1 - d / Rw) * sh;
        if (!it.fallen) {
          const mag = Math.min(0.24, (blasty ? 0.3 : 0.06) * kw * kw * A.power);
          this.later(delay, () => { if (!it.fallen && !it.shattered) this.push(it, dx, dz, mag); });
        }
        if (d > R) continue;
        const k = (1 - d / R) * sh, fl = FLAM[it.kind] !== undefined ? FLAM[it.kind] : 1;
        const charred = it.state === 'burnt' || it.state === 'burning';
        const directHit = (info && info.tree === it) || d < (it.trunkR || 1.8) + 3;

        // Cây đã bị bắn cháy (đang cháy hoặc cháy rụi): gỗ than rất giòn -> bị pháo nổ hoặc trúng nhiều đạn 30mm sẽ vỡ vụn nát
        if (charred) {
          const wearGain = (blasty ? k * A.power * 0.8 : (ammo === 'GATLING_BULLET' ? 0.22 : ammo === 'MG762' ? 0.04 : 0.12)) * (directHit ? 2.0 : 1.0);
          it.wear = (it.wear || 0) + wearGain;
          if ((blasty && (k > 0.15 || directHit)) || it.wear >= 0.8) {
            this.shatter(it, fx, dx, dz, ammo, heavy);
            continue;
          }
        }

        // Cây đổ đang cháy / đã cháy: không tính nhiệt & gãy nữa, nhưng sóng nổ vẫn hất tàn lửa của nó đi
        if (it.fallen && it.heat > 2) {
          if (blasty && directHit) {
            this.shatter(it, fx, dx, dz, ammo, heavy);
            continue;
          }
          if (blasty && it.state === 'burning' && k > 0.12) this.blastFire(it, x, z, k, delay, fx);
          continue;
        }

        it.heat += k * A.heat * (A.fire ? 2.2 : 1) * (heavy ? 1.5 : 1) * fl;
        // Quả cầu lửa nổ sát cây: sém mạnh; cây khô / dễ bén bắt lửa luôn, cây tươi thường chỉ sém (trúng lần nữa mới cháy)
        if (blasty && d < A.radius * 1.3) it.heat += 0.6 * k * fl;
        // Cây đang cháy hứng sóng nổ: lửa bị thổi bạt, lá & cành đang cháy văng ra, tàn lửa bắn sang cây bên cạnh
        if (blasty && it.state === 'burning' && k > 0.12) this.blastFire(it, x, z, k, delay, fx);
        if (!it.fallen && (blasty || ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY') && k > 0.15) {
          // mảnh văng ghim vào thân: vỏ cây & dăm gỗ bắn ra phía hứng nổ, thân bị băm dần (pháo kích nhiều lần -> gãy).
          // 30 mm (cả đạn cháy): số phát để băm gãy theo tiết diện thân (~7 phát thân 0,45 m, ~20 phát thân 0,78 m)
          const wg = (blasty ? k * A.power * 0.22 : 0.08 * Math.min(2, Math.pow(2.4 / Math.max(1, it.trunkR || 2.4), 2)));
          it.wear = (it.wear || 0) + wg;
          this.later(delay, () => this.barkChips(it, x, z, k, fx));
        }
        // Cây cháy than giòn, dễ gãy hơn cây tươi
        const weak = it.state === 'burnt' ? 0.45 : it.state === 'burning' ? 0.7 : 1;
        const shred = (it.wear || 0) >= 1;
        // nổ ngay trong tán của cây này (tree burst): sức nổ dồn vào cành ngọn -> trụi tán, mạnh thì gãy phăng phần ngọn
        const cn = it.V.info.canopy, inCrown = !it.fallen && cn && y > it.y + it.trunkH * 0.85 && d < cn.rc * it.s;
        if (inCrown && blasty) this.stripLeaves(it, 0.15 + 0.35 * k, x, y, z, fx, delay);
        // Đạn nổ mạnh HE 120mm hoặc đạn pháo hạng nặng sát cây: bẻ gãy đổ cây ngay lập tức
        const heKill = blasty && A.power >= 1.5 && d < A.radius * 1.15 * (2 - weak);
        // Khối nổ nhỏ (bom con / lựu 40 mm, RPG, đạn mẹ chùm): chỉ cắt đổ được cây khi nổ sát thân và thân không quá to — công
        // thức cắt gỗ của công binh P(lb) = D(in)^2 / 250: 30 g cắt thân ~10 cm, RPG-7 ~0,7 kg ~0,5 m (cây cháy giòn: to hơn).
        // Trước đây bom con quật đổ cây thân 0,5-0,8 m chỉ cần nổ trong vòng 1,5 m
        const cutKg = heavy ? undefined : TREE_CUT_KG[ammo];
        const fellSmall = cutKg !== undefined && ((d < it.trunkR + 3 && it.trunkR * 2 / 8 <= 0.0254 * Math.sqrt(250 * cutKg * 2.2046) / weak) || shred);
        if (!it.fallen && (cutKg !== undefined ? fellSmall : (heKill || (inCrown ? k * A.power > 0.9 * weak : (k * A.power > 0.75 * weak || (d < A.radius * 0.9 * (2 - weak) && A.power > 0.5) || shred))))) {
          const st = it.V.info.stem, direct = d < it.trunkR + 3;
          const brk = inCrown ? Math.max(st.top * 0.5, Math.min(st.top * 0.92, (y - (it.y - 0.6)) / it.s - rand(2, 6)))
            : shred && !direct ? rand(Math.min(3, st.top * 0.3), st.top * 0.6) : this.breakAt(it, y, d);
          this.fell(it, dx, dz, fx, { p: Math.min(1.5, Math.max(0.6, k * A.power * (heavy ? 1.4 : 1))), brk, delay });
        }
        if (blasty && k > 0.3) this.stripLeaves(it, 0.35 * k, x, y, z, fx, delay);
        this.refreshLook(it, fx);
      }
    }
    // Sóng nổ quét qua cây đang cháy
    blastFire(it, x, z, k, delay, fx) {
      it.blowT = Math.max(it.blowT || 0, 0.5 + 1.4 * k);   // ngọn lửa bị thổi tắt bạt đi một lúc rồi bùng lại
      const dx = it.x - x, dz = it.z - z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      // tàn lửa & cành lá đang cháy bị hất theo hướng sóng nổ: cây đứng xuôi chiều trong tầm bắt lửa thêm
      const reach = ((it.V.info.canopy ? it.V.info.canopy.rc : 6) * it.s) * 1.6 + 30 * k;
      for (const nb of this.near(it.x, it.z, reach)) {
        if (nb === it || nb.state === 'burning' || nb.state === 'burnt') continue;
        const vx = nb.x - it.x, vz = nb.z - it.z, dd = Math.hypot(vx, vz) || 1;
        const along = (vx * ux + vz * uz) / dd;          // 1: đúng xuôi gió nổ, < 0: phía ngược lại
        if (along < -0.2) continue;
        const fl = FLAM[nb.kind] !== undefined ? FLAM[nb.kind] : 1;
        nb.heat += 1.2 * k * fl * (0.4 + 0.6 * along) * (1 - 0.6 * dd / reach);
        this.refreshLook(nb, fx);
      }
      if (it.ci >= 0 && !it.crownGone) this.stripLeaves(it, 0.2 * k, it.x, it.y, it.z, null);
      if (!fx || !fx.fire) return;
      this.later(delay, () => {
        const n = Math.round(10 + 26 * k), sp = 25 + 50 * k;
        for (let i = 0; i < n; i++) {
          const p = (it.ci >= 0 && !it.crownGone) ? this.crownPoint(it, 0.8) : this.trunkPoint(it, rand(0.3, 1));
          fx.fire.add({ x: p.x, y: p.y, z: p.z, vx: ux * sp * rand(0.5, 1.2) + rand(-8, 8), vy: rand(6, 26), vz: uz * sp * rand(0.5, 1.2) + rand(-8, 8),
            size: rand(0.7, 2.2), grow: -0.3, drag: 0.9, grav: 22, life: rand(1.2, 2.6), alpha: 1, fadeIn: 0.01, c0: [1, 0.72, 0.3], c1: [0.8, 0.2, 0.02], cell: 3, floor: false });
        }
      });
    }
    // Nổ trên tán: cành gãy, dăm gỗ & lá vụn mưa xuống quanh gốc (phần nhìn; mảnh thép do hệ nổ vẽ)
    canopyBurstFx(x, y, z, k, fx) {
      if (!fx) return;
      for (let i = 0; i < 3; i++) chunks(fx, x, y, z, 4, 0.9, i === 0 ? [0.36, 0.27, 0.18] : [0.7, 0.56, 0.38], 6);
      if (fx.smoke) {
        for (let i = 0; i < Math.round(18 * k + 10); i++) {
          const a = rand(0, 6.283), sp = rand(8, 30);
          fx.smoke.add({ x: x + rand(-4, 4), y: y + rand(-3, 3), z: z + rand(-4, 4), vx: Math.cos(a) * sp, vy: rand(-14, 6), vz: Math.sin(a) * sp,
            size: rand(0.6, 1.4), grow: 0, drag: 2, grav: 14, life: rand(2, 4), alpha: 0.95, fadeIn: 0.01, c0: RNG() < 0.7 ? [0.3, 0.4, 0.17] : [0.42, 0.33, 0.2], cell: 2 });
        }
      }
    }
    // Mảnh văng ghim vào thân phía hứng nổ: vỏ cây & dăm gỗ bắn ra
    barkChips(it, x, z, k, fx) {
      if (!fx || it.fallen) return;
      const dx = it.x - x, dz = it.z - z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      const n = Math.round(1 + 3 * k), charred = it.state === 'burnt' || it.state === 'burning';
      for (let i = 0; i < n; i++) {
        const h = rand(1, Math.min(it.trunkH, 30));
        chunks(fx, it.x - ux * it.trunkR, it.y + h, it.z - uz * it.trunkR, 1, 0.6, charred ? [0.13, 0.11, 0.1] : RNG() < 0.5 ? [0.42, 0.33, 0.24] : [0.72, 0.58, 0.4], 12);
      }
    }

    // Chỗ gãy (độ cao cục bộ, 0 = bật cả gốc rễ): đạn nổ ngay vào thân -> gãy đúng chỗ trúng; nổ dưới đất gần gốc ->
    // bật gốc hoặc gãy sát đất. Gốc cụt tối thiểu ~0,6 m, chỗ gãy không quá 85% thân chính
    breakAt(it, y, d) {
      const st = it.V.info.stem, lo = Math.min(3, st.top * 0.3), hi = st.top * 0.85;
      const hy = (y - (it.y - 0.6)) / it.s;
      if (d < it.trunkR + 3 && hy > lo) return Math.max(lo, Math.min(hi, hy + rand(-0.8, 0.8)));
      if (RNG() < 0.35) return 0;
      return Math.min(hi, rand(lo, lo + 5));
    }

    // Lực đẩy làm cây nghiêng rồi đung đưa tắt dần (lò xo + giảm chấn), cây to dao động chậm hơn
    push(it, dx, dz, mag) {
      if (mag < 0.003) return;
      const l = Math.hypot(dx, dz) || 1;
      if (!it.sw) it.sw = { ax: 0, az: 0, vx: 0, vz: 0 };
      // nghiêng ra xa tâm nổ: quay quanh trục vuông góc hướng đẩy, giới hạn xung lực vừa phải
      const pMag = Math.min(0.25, mag);
      it.sw.vx = Math.max(-2.0, Math.min(2.0, it.sw.vx + (dz / l) * pMag * 2.8));
      it.sw.vz = Math.max(-2.0, Math.min(2.0, it.sw.vz + (-dx / l) * pMag * 2.8));
      if (!it.swaying) { it.swaying = true; this.swaying.push(it); }
    }

    // Lá & cành bị xé rụng (mảnh đạn / sóng nổ / đạn bay xuyên tán)
    // delay: lá bắt đầu bay khi mặt sóng xung kích tới tán (s); lá bị thổi ra xa điểm nổ / đường đạn, mạnh theo amount
    stripLeaves(it, amount, x, y, z, fx, delay = 0) {
      if (it.ci < 0 || it.crownGone) return;
      it.leaves = (it.leaves === undefined ? 1 : it.leaves) - amount;
      if (fx && fx.smoke) {
        const leafC = it.state === 'ok' ? [0.32, 0.42, 0.18] : [0.45, 0.36, 0.2];
        for (let i = 0; i < Math.round(4 + amount * 20); i++) {
          const tp = this.trunkPoint(it, rand(0.55, 0.95));
          const lx = tp.x + rand(-6, 6) * it.s, lz = tp.z + rand(-6, 6) * it.s;
          const ox = lx - x, oz = lz - z, ol = Math.hypot(ox, oz) || 1, sp = rand(10, 45) * Math.min(1, amount * 2);
          fx.smoke.add({ x: lx, y: tp.y, z: lz,
            vx: ox / ol * sp + rand(-8, 8), vy: rand(-2, 6) + sp * 0.25, vz: oz / ol * sp + rand(-8, 8), size: rand(0.6, 1.3), grow: 0, drag: 2.2, grav: 18, life: rand(2, 3.5), alpha: 0.95, fadeIn: 0.01, c0: leafC, cell: 2,
            delay: delay + rand(0, 0.04) });
        }
      }
      if (it.leaves < 0.25) {
        // Trơ cành: tán lá bị xé sạch
        it.crownGone = true;
        this.reweigh(it);
        // tán trụi trên hình cùng lúc lá bắt đầu bay (trạng thái cây đổi ngay)
        this.later(delay, () => { this.crownHide(it); sfx('leafStrip', it.x, it.y + it.height * 0.7, it.z, 0.7); });
      } else {
        const c = (it.state === 'ok' ? it.ctint || it.tint : TREE_COLORS.scorched).clone().multiplyScalar(0.75 + 0.25 * it.leaves);
        this.later(delay, () => { if (!it.crownGone) this.crownColor(it, c); });
      }
    }

    // Đạn bay sượt / xuyên qua tán cây: lá rơi, cây rung, cành gãy; đạn cháy / vạch đường làm bén lửa
    // Vùng tán = đúng khối elip tán từng cây (như crownBurst): đạn bay dưới tán giữa các thân không làm rụng lá / bén lửa,
    // đạn sượt mép tán rộng (thông tầng dưới) vẫn tính. Mức rụng lá & nhiệt theo quãng xuyên tán của cả đường đạn
    // (passSegment được gọi theo từng bước nhỏ, mỗi cây chỉ tính 1 lần / ~40 ms -> lấy dây cung của cả đường thẳng)
    passSegment(ax, ay, az, bx, by, bz, ammo, fx) {
      const pad = 34, minX = Math.min(ax, bx) - pad, maxX = Math.max(ax, bx) + pad, minZ = Math.min(az, bz) - pad, maxZ = Math.max(az, bz) + pad;
      if ((maxX - minX) > 800 || (maxZ - minZ) > 800) return;
      const A = ammoInfo(ammo, false);
      const dx = bx - ax, dy = by - ay, dz = bz - az, segL = Math.hypot(dx, dy, dz);
      if (segL < 1e-6) return;
      for (let gx = Math.floor(minX / 60); gx <= Math.floor(maxX / 60); gx++) {
        for (let gz = Math.floor(minZ / 60); gz <= Math.floor(maxZ / 60); gz++) {
          const l = this.grid.get(gx * 1000 + gz);
          if (!l) continue;
          for (const it of l) {
            if (it.fallen) continue;
            const cn = it.V.info.canopy;
            if (!cn) continue;
            const rx = cn.rc * it.s * 0.85, ry = Math.max(6, cn.ry * it.s * 0.9);
            if (it.x < minX - rx + pad || it.x > maxX + rx - pad || it.z < minZ - rx + pad || it.z > maxZ + rx - pad) continue;
            const cx = it.x, cy = it.y - 0.6 + cn.dc * it.s, cz = it.z;
            const px0 = (ax - cx) / rx, py0 = (ay - cy) / ry, pz0 = (az - cz) / rx, qx = dx / rx, qy = dy / ry, qz = dz / rx;
            const QA = qx * qx + qy * qy + qz * qz, QB = 2 * (px0 * qx + py0 * qy + pz0 * qz), QC = px0 * px0 + py0 * py0 + pz0 * pz0 - 1;
            const disc = QB * QB - 4 * QA * QC;
            if (disc <= 0) continue;
            const sq = Math.sqrt(disc), t0 = (-QB - sq) / (2 * QA), t1 = (-QB + sq) / (2 * QA);
            if (t1 < 0 || t0 > 1) continue;
            if (it._lastHitT && performance.now() - it._lastHitT < 40) continue;
            it._lastHitT = performance.now();
            // quãng xuyên tán so với bán kính tán: sượt mép ~0,3, xuyên giữa tán 1
            const kc = Math.max(0.3, Math.min(1, (t1 - t0) * segL / (rx * 1.4)));
            const tm = Math.max(0, Math.min(1, (t0 + t1) / 2)), px = ax + dx * tm, py = ay + dy * tm, pz = az + dz * tm;
            const big = A.power >= 0.5;
            this.push(it, dx, dz, (big ? 0.12 : 0.025) * kc);
            this.stripLeaves(it, (big ? 0.28 : 0.04) * kc, px, py, pz, fx);
            const fl = FLAM[it.kind] !== undefined ? FLAM[it.kind] : 1;
            // đạn cháy 30mm cháy lâu, nóng; 12.7 (INCENDIARY_HMG, game đổi theo cỡ nòng) nhỏ -> cần nhiều viên liền nhau mới bén
            if (ammo === 'INCENDIARY') it.heat += 0.9 * fl * kc;
            else if (ammo === 'INCENDIARY_HMG') it.heat += 0.3 * fl * kc;
            else if (ammo === 'GATLING_BULLET') it.heat += 0.12 * fl * kc;   // đầu đạn nổ-cháy 30mm
            else if (ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE') it.heat += 0.5 * fl * kc; // lửa đuôi tên lửa
            this.refreshLook(it, fx);
          }
        }
      }
    }

    refreshLook(it, fx) {
      // cây còn tươi / mới sém đang nóng: nguội dần (update) — phát trúng lẻ tẻ cách xa nhau không cộng dồn thành cháy
      if (it.heat > 0 && (it.state === 'ok' || it.state === 'scorched') && it.heat <= 1.6) (this.warm || (this.warm = new Set())).add(it);
      if (it.heat > 1.6 && it.state !== 'burnt') {
        // Cháy rụi: lá cháy hết, trơ thân đen
        if (it.state !== 'burning') {
          // tán bùng cháy Dc giây (cây không lá: chỉ cành & thân) rồi lửa liếm thân Dt giây
          it.state = 'burning'; it.burnAge = 0; it.lightT = 0;
          it.burnDc = (it.ci >= 0 && !it.crownGone) ? rand(10, 15) : 0;
          it.burnDt = rand(8, 12) * (it.kind === 'deadTree' ? 1.4 : 1);
          this.burning.push(it); sfx('fire', it.x, it.y, it.z, 0.8);
        }
      } else if (it.heat > 0.55 && it.state === 'ok') {
        it.state = 'scorched';
        const c = TREE_COLORS.scorched.clone().multiplyScalar(rand(0.85, 1.1));
        this.crownColor(it, c);
        this.trunkColor(it, new THREE.Color(0.5, 0.45, 0.4));
      }
      void fx;
    }
    // Cây đổ như một thân cứng quay quanh gốc: θ'' = (3g / 2L)·sin θ (g thật 9,8 m/s² = 78 đơn vị/s²). Nghiêng chậm lúc đầu
    // rồi nhanh dần, cây cao đổ lâu hơn cây thấp (cây 12 m ~2,5-3 s, bị húc / sóng nổ mạnh thì nhanh hơn); chạm đất nảy nhẹ
    // một lần. Góc theo thời gian tính sẵn thành bảng để tiếng "rầm" chạm đất khớp đúng khung hình
    // Góc nằm của cây đổ theo hướng (ux, uz): thân tựa lên điểm đất cao nhất dọc đường đổ (dốc lên: nằm sớm, dốc xuống:
    // quá 90°), và dừng lại tựa vào tường / mái nhà nếu đổ vào nhà
    restAngle(it, ux, uz, pivotY) {
      const P = this.pivot(it);
      if (pivotY !== undefined) P.y = pivotY;
      const L = Math.max(12, it.height - it.brk * it.s), clear = it.trunkR * 0.6;
      // thân: mỗi điểm cách chỗ gãy r phải nằm trên mặt đất tại đó (dốc lên: nằm sớm; gãy cao: khúc ngọn chúi
      // quá 90°, đầu gãy tựa trên gốc cụt, ngọn cắm đất)
      let th1 = Math.PI / 2 + 0.9;
      for (const f of [0.2, 0.35, 0.5, 0.65, 0.8, 1]) {
        const r = L * f, g = this.groundAt(P.x + ux * r, P.z + uz * r) - 0.6 + clear;
        th1 = Math.min(th1, Math.acos(Math.max(-1, Math.min(1, (g - P.y) / r))));
      }
      // tán: cành lá chống đỡ khúc ngọn (tán bẹp ~45%), thân nằm chếch lên chứ không đè tán lún nửa xuống đất
      const cn = it.V.info.canopy;
      if (cn) {
        const D = (cn.dc - it.brk) * it.s, Rc = cn.rc * it.s;
        if (D > 4) {
          const g = this.groundAt(P.x + ux * D, P.z + uz * D) - 0.6;
          th1 = Math.min(th1, Math.acos(Math.max(-1, Math.min(1, (g + Rc * 0.55 - P.y) / D))));
        }
      }
      th1 = Math.max(0.35, th1);
      if (this.solidHit) {
        const r0 = L * 0.15, r1 = L * 0.92;
        for (let th = 0.12; th < th1; th += 0.05) {
          const sn = Math.sin(th), cs = Math.cos(th);
          if (this.solidHit(P.x + ux * r0 * sn, P.y + r0 * cs, P.z + uz * r0 * sn, P.x + ux * r1 * sn, P.y + r1 * cs, P.z + uz * r1 * sn)) { th1 = Math.max(0.1, th - 0.05); break; }
        }
      }
      return th1;
    }
    // Tư thế nằm: góc + độ rơi. Khúc ngọn ngắn so với gốc cụt (không với tới đất khi còn dính bản lề thớ gỗ) thì
    // lật ngang rồi tuột khỏi đầu gốc cụt, rơi thẳng xuống nằm trên đất cạnh gốc
    restPose(it, ux, uz) {
      let th1 = this.restAngle(it, ux, uz), drop = 0;
      if (it.brk) {
        const P = this.pivot(it), L = Math.max(12, it.height - it.brk * it.s);
        const clear = it.trunkR * 0.6, h = P.y - (this.groundAt(P.x, P.z) - 0.6) - clear;
        if (h > 2 && (L < h * 1.3 || th1 > Math.PI / 2 + 0.8)) { drop = h; th1 = this.restAngle(it, ux, uz, P.y - h); }
      }
      return { th1, drop };
    }
    // Điểm xoay khi đổ: chỗ gãy trên thân (đúng tâm thân cong tại độ cao đó) / gốc nếu bật cả rễ
    // out: Vector3 nhận kết quả (không truyền = tạo mới — nơi gọi giữ / sửa P)
    pivot(it, out) {
      const o = out || new THREE.Vector3();
      if (!it.brk) return o.set(it.x, it.y - 0.6, it.z);
      const c = stemAt(it.V.info, it.brk);
      return o.set(c.x, it.brk, c.z).applyMatrix4(it.base);
    }
    // Ma trận cây (khúc ngọn nếu gãy) nghiêng góc ang theo trục nằm ngang (ax, az) quanh điểm xoay.
    // Trả ma trận NHÁP dùng chung (_tM, chạy mỗi khung khi cây đang đổ): dùng ngay (setPose), không giữ lại
    fallMatrix(it, ax, az, ang) {
      const P = this.pivot(it, _tP);
      _tR.makeRotationFromQuaternion(_tQ.setFromAxisAngle(_tA.set(ax, 0, az), ang));
      return _tM.makeTranslation(P.x, P.y, P.z).multiply(_tR).multiply(_tT.makeTranslation(-P.x, -P.y, -P.z)).multiply(it.base);
    }
    // Dăm gỗ ở vết gãy, toạ độ cục bộ của cây: đầu gốc cụt (dăm chĩa lên) / đầu khúc ngọn (lật ngược, dăm chĩa xuống)
    // (ma trận nháp _tL: nhân ngay rồi bỏ)
    capLocal(it, top) {
      const c = stemAt(it.V.info, it.brk);
      return _tL.compose(_tA.set(c.x, it.brk, c.z), _tQ.setFromAxisAngle(_tX, top ? Math.PI : 0), _tS.set(c.r * 1.06, c.r * 1.1, c.r * 1.06));
    }
    // Đặt tư thế khúc ngọn / cả cây (thân + tán + dăm gỗ đầu gãy). Pool.set chép ma trận -> dùng ma trận nháp được
    setPose(it, m, dy) {
      if (dy) m = _tD.makeTranslation(0, -dy, 0).multiply(m);
      it.V.trunk.set(it.ti, m);
      if (it.ci >= 0) { if (it.crownGone) it.V.crown.hide(it.ci); else it.V.crown.set(it.ci, m); }
      if (it.brk && it.capT >= 0) this.caps.set(it.capT, _tC.copy(m).multiply(this.capLocal(it, true)));
    }
    // Gốc cụt đứng lại tại chỗ (theo mặt đất hiện tại)
    placeStump(it) {
      if (!it.brk) return;
      it.V.stump.set(it.si, it.base);
      this.caps.set(it.capS, _tC.copy(it.base).multiply(this.capLocal(it, false)));
      if (it.sci >= 0) { if (it.crownGone) it.V.cstump.hide(it.sci); else it.V.cstump.set(it.sci, it.base); }
    }
    // Áp chỗ gãy: thân bỏ phần dưới chỗ gãy, gốc cụt hiện phần dưới, dăm gỗ ở 2 đầu gãy. brk = 0: bật cả gốc (ẩn gốc cụt)
    applyBreak(it, brk) {
      it.brk = brk > 0 ? brk : 0;
      const tb = it.V.trunk.mesh.geometry.attributes.brk;
      tb.setX(it.ti, it.brk); tb.needsUpdate = true;
      // tán: khúc ngọn chỉ mang phần lá trên chỗ gãy, phần dưới đứng lại cùng gốc cụt
      const crownBrk = v => { if (it.ci >= 0) { const cb = it.V.crown.mesh.geometry.attributes.brk; cb.setX(it.ci, v); cb.needsUpdate = true; } };
      if (!it.brk) {
        crownBrk(0);
        if (it.sci >= 0) it.V.cstump.hide(it.sci);
        if (it.si >= 0) it.V.stump.hide(it.si);
        if (it.capS >= 0) { this.caps.hide(it.capS); this.caps.hide(it.capT); }
        return;
      }
      if (it.si < 0) { it.si = it.V.stump.add(it.base, it.tcol); it.V.stump.mesh.visible = true; }
      if (it.capS < 0) { it.capS = this.caps.add(it.base, it.tcol); it.capT = this.caps.add(it.base, it.tcol); }
      if (it.si < 0 || it.capT < 0) { it.brk = 0; tb.setX(it.ti, 0); crownBrk(0); return; }   // hết chỗ trong bể (không xảy ra): đổ cả cây
      const sb = it.V.stump.mesh.geometry.attributes.brk;
      sb.setX(it.si, it.brk); sb.needsUpdate = true;
      crownBrk(it.brk);
      if (it.ci >= 0 && it.V.cstump) {
        const CS = it.V.cstump;
        if (it.sci < 0) {
          // màu & tiến độ cháy hiện tại của tán chép sang phần tán trên gốc cụt
          const cc = new THREE.Color();
          it.V.crown.mesh.getColorAt(it.ci, cc);
          it.sci = CS.add(it.base, cc);
          CS.mesh.visible = true;
          const cb = CS.mesh.geometry.attributes.burn;
          cb.setX(it.sci, it.V.crown.mesh.geometry.attributes.burn.getX(it.ci)); cb.needsUpdate = true;
          CS.commit();
        }
        if (it.sci >= 0) { const ab = CS.mesh.geometry.attributes.brk; ab.setX(it.sci, it.brk); ab.needsUpdate = true; }
      }
      this.trunkColor(it, it.tcol);
      this.placeStump(it);
      it.V.stump.commit();
      this.caps.commit();
    }
    // Điểm trên thân cây ở phần u (0 gốc .. 1 ngọn) — cây đã đổ thì khúc trên chỗ gãy nằm dọc theo hướng đổ
    trunkPoint(it, u) {
      const d = it.height * u, F = it.fall, hb = it.brk * it.s;
      if (!it.fallen || !F || d < hb) return { x: it.x, y: it.y + d, z: it.z };
      const P = this.pivot(it);
      P.y -= F.drop || 0;
      const sn = Math.sin(F.th1), cs = Math.cos(F.th1), dd = d - hb;
      return { x: P.x + F.ux * dd * sn, y: P.y + dd * cs + 1.5, z: P.z + F.uz * dd * sn };
    }
    fell(it, dx, dz, fx, o) {
      const reorient = !!(o && o.reorient);
      if (it.fallen && !reorient) return;
      it.fallen = true;
      if (!it.shattered && !this.logs.includes(it)) this.logs.push(it);   // khúc thân nằm chặn đạn (trunkHit)
      this.reweigh(it);
      // chỗ gãy làm tròn theo bước đồng bộ (1/25 chiều cao) -> máy chủ phòng & máy khác gãy đúng cùng một chỗ
      const H = it.V.info.height, q = o && o.brk > 0 ? Math.max(1, Math.min(25, Math.round(o.brk / H * 25))) : 0;
      this.applyBreak(it, q / 25 * H);
      // không có hướng đẩy (nổ ngay gốc): đổ theo hướng cố định của cây (trục quay 0 -> cây đứng nguyên)
      if (Math.hypot(dx, dz) < 1e-6) { const a0 = it.rot + 1.3; dx = Math.cos(a0); dz = Math.sin(a0); }
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      it.fallSec = ((Math.round(Math.atan2(uz, ux) / (Math.PI / 8)) % 16) + 16) % 16;
      const L = Math.max(12, it.height - it.brk * it.s), a = 1.5 * 78 / L, rp = this.restPose(it, ux, uz);
      // rơi khỏi gốc cụt: bản lề lật tới nằm ngang (theo góc nằm cuối) rồi rơi tự do
      const th1 = rp.drop ? Math.min(rp.th1, Math.PI / 2) : rp.th1, drop = rp.drop, dropDur = drop ? Math.sqrt(2 * drop / 78) : 0;
      if (reorient) {
        // xoay lại hướng nằm cho khớp chủ phòng: đặt thẳng tư thế cuối
        const fi = this.falling.indexOf(it);
        if (fi >= 0) this.falling.splice(fi, 1);
        it.fall = { ax: uz, az: -ux, ux, uz, t: 1, dur: 0, tab: null, th1: rp.th1, drop, dropDur: 0, landed: true };
        this.setPose(it, this.fallMatrix(it, uz, -ux, rp.th1), drop);
        return;
      }
      const crush = !!(o && o.crush);
      if (crush && o.brk > 0) {
        // xe xích húc gãy: đẩy phần ngọn trượt về phía trước một khoảng để lộ rõ gốc cụt dăm gỗ
        const pushDist = rand(2.2, 4.2);
        it.base.setPosition(it.x + ux * pushDist, it.y - 0.6, it.z + uz * pushDist);
      }
      // vận tốc góc ban đầu: sóng nổ đẩy (o.p 0..1.5) / xích xe húc (tốc độ xe ÷ tầm điểm chạm ~ thân) / tự gãy đổ
      let w = crush ? Math.min(1.1, 0.2 + (o.v || 0) / (L * 1.6)) : 0.1 + 0.45 * Math.max(0, Math.min(1.5, (o && o.p) || 0.7) - 0.6);
      let th = Math.min(th1, 0.04 + RNG() * 0.05);
      const dt = 1 / 60, tab = [th];
      while (th < th1 && tab.length < 600) {
        for (let q = 0; q < 4; q++) { w += a * Math.sin(th) * dt / 4; th += w * dt / 4; }
        tab.push(Math.min(th, th1));
      }
      const dur = (tab.length - 1) * dt;
      // sóng xung kích chưa tới: chờ (o.delay) rồi mới bắt đầu đổ
      it.fall = { ax: uz, az: -ux, ux, uz, t: -((o && o.delay) || 0), dur, tab, th1, drop, dropDur, th2: rp.th1 };
      this.falling.push(it);
      this.setPose(it, this.fallMatrix(it, uz, -ux, th));
      const P = this.pivot(it);
      const charred = it.state === 'burnt' || it.state === 'burning';
      if (it.brk) {
        // gãy ngang thân: dăm gỗ & vỏ cây văng ra từ vết gãy, bụi vụn gỗ (thân cháy than: than vụn & tro xám)
        chunks(fx, P.x, P.y, P.z, crush ? 6 : 9, 1.1, charred ? [0.12, 0.1, 0.09] : [0.74, 0.6, 0.42], 30);
        chunks(fx, P.x, P.y, P.z, 4, 1.4, charred ? [0.2, 0.18, 0.16] : [0.36, 0.28, 0.2], 22);
        dustBurst(fx, P.x, P.y, P.z, charred ? 3 : 2, 5, charred ? [0.36, 0.35, 0.34] : [0.7, 0.62, 0.5]);
      } else {
        // bật cả gốc: đất cát tung lên quanh gốc rễ
        dustBurst(fx, it.x, it.y, it.z, 3, 9, [0.6, 0.55, 0.45]);
        if (it.kind !== 'cactus') chunks(fx, it.x, it.y + 2, it.z, crush ? 4 : 6, 1.6, [0.42, 0.36, 0.28], 20);
      }
      sfx('treeFall', it.x, it.y + 4, it.z, Math.min(1.2, it.height / 40), { dur: dur + dropDur, h: it.height, crush });
    }
    // Camera bám đuôi góc thấp: cây đứng chắn giữa camera và xe mình (hoặc sát ống kính) tạm ẩn, ra khỏi đường nhìn thì hiện lại
    setCameraView(cam, foc) {
      const want = new Set();
      if (cam && foc) {
        const ax = cam.x, az = cam.z, bx = foc.x, bz = foc.z, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const pad = 40;
        const x0 = Math.floor((Math.min(ax, bx) - pad) / 60), x1 = Math.floor((Math.max(ax, bx) + pad) / 60);
        const z0 = Math.floor((Math.min(az, bz) - pad) / 60), z1 = Math.floor((Math.max(az, bz) + pad) / 60);
        if ((x1 - x0) * (z1 - z0) < 400) {
          for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
            const l = this.grid.get(i * 1000 + j);
            if (!l) continue;
            for (const it of l) {
              if (it.fallen) continue;
              const V = it.V;
              if (V._rC === undefined) {
                const g = V.info.crown || V.info.trunk;
                if (!g.boundingBox) g.computeBoundingBox();
                const bb = g.boundingBox;
                V._rC = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
              }
              const r = V._rC * it.s + 4;
              const t = Math.max(0, Math.min(1, ((it.x - ax) * dx + (it.z - az) * dz) / L2));
              const ex = ax + dx * t - it.x, ez = az + dz * t - it.z;
              const d2 = ex * ex + ez * ez;
              const nearCam = (it.x - ax) * (it.x - ax) + (it.z - az) * (it.z - az) < (r + 14) * (r + 14) && cam.y < it.y + it.height + 6;
              if (nearCam || (d2 < r * r && cam.y + (foc.y - cam.y) * t < it.y + it.height + 4)) want.add(it);
            }
          }
        }
      }
      this.applyCamHide(want, false);
    }
    // Kính ngắm: cây chắn phía trước là chắn thật, nhưng ống kính nằm lọt trong tán cây (xe đỗ dưới gốc cây) thì tán
    // cây đó tạm ẩn (thân vẫn hiện) — không thì cả màn hình kính chỉ toàn lá, không ngắm được gì
    setSightView(cam) {
      const want = new Set();
      if (cam) for (const it of this.near(cam.x, cam.z, 80)) {
        if (it.fallen || it.ci < 0 || it.crownGone) continue;
        const cn = it.V.info.canopy;
        if (!cn) continue;
        const rx = cn.rc * it.s + 4, ry = Math.max(6, cn.ry * it.s) + 4;
        const ex = (cam.x - it.x) / rx, ey = (cam.y - (it.y - 0.6 + cn.dc * it.s)) / ry, ez = (cam.z - it.z) / rx;
        if (ex * ex + ey * ey + ez * ez < 1) want.add(it);
      }
      this.applyCamHide(want, true);
    }
    // Ẩn các cây trong want (crownOnly: chỉ ẩn tán), hiện lại cây đã ẩn mà nay không còn cần ẩn
    applyCamHide(want, crownOnly) {
      const hidden = this._camHid || (this._camHid = new Map());
      for (const [it, co] of hidden) {
        if (want.has(it) && co === crownOnly) continue;
        hidden.delete(it);
        if (it.fallen || it.swaying) continue;   // cây đang đổ / đung đưa tự đặt lại ma trận
        it.V.trunk.set(it.ti, it.base);
        if (it.ci >= 0 && !it.crownGone) it.V.crown.set(it.ci, it.base);
      }
      for (const it of want) {
        if (hidden.has(it)) continue;
        hidden.set(it, crownOnly);
        if (!crownOnly) it.V.trunk.hide(it.ti);
        if (it.ci >= 0) it.V.crown.hide(it.ci);
      }
    }
    // Mặt đất trong vùng vừa đổi (hố bom mới / hố bị xoá): gốc cây hạ theo mặt đất mới, cây đổ nằm lại theo dốc mới
    reground(x0, z0, x1, z1) {
      const pad = 110;   // ngọn cây đổ nằm xa gốc tới ~ chiều cao cây
      const hid = this._camHid;
      // thảm rụng dưới tán (bán kính tới ~40 đv) bám lại mặt đất mới
      if (this.litter && this.litter.length) {
        const touched = new Set();
        for (const it of this.near((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 40)) if (it._lit) { this.litterLift(it, false); touched.add(it._lit.geo); }
        for (const g of touched) g.attributes.position.needsUpdate = true;
      }
      for (let gx = Math.floor((x0 - pad) / 60); gx <= Math.floor((x1 + pad) / 60); gx++) {
        for (let gz = Math.floor((z0 - pad) / 60); gz <= Math.floor((z1 + pad) / 60); gz++) {
          const l = this.grid.get(gx * 1000 + gz);
          if (!l) continue;
          for (const it of l) {
            const F = it.fall, reach = it.fallen ? it.height : 0;
            if (it.x < x0 - reach || it.x > x1 + reach || it.z < z0 - reach || it.z > z1 + reach) continue;
            const ny = this.groundAt(it.x, it.z);
            if (!it.fallen) {
              if (Math.abs(ny - it.y) < 0.01) continue;
              it.y = ny;
              it.base.setPosition(it.x, ny - 0.6, it.z);
              if (it.swaying || (hid && hid.has(it))) continue;   // đang đung đưa / ẩn: tự đặt lại ma trận từ it.y / base
              it.V.trunk.set(it.ti, it.base);
              if (it.ci >= 0 && !it.crownGone) it.V.crown.set(it.ci, it.base);
              continue;
            }
            it.y = ny;
            it.base.setPosition(it.x, ny - 0.6, it.z);
            this.placeStump(it);
            if (!F || this.falling.includes(it)) continue;      // đang đổ: bảng góc giữ nguyên, gốc đã hạ theo it.y
            const rp = this.restPose(it, F.ux !== undefined ? F.ux : -F.az, F.uz !== undefined ? F.uz : F.ax);
            F.th1 = F.th2 = rp.th1; F.drop = rp.drop;
            this.setPose(it, this.fallMatrix(it, F.ax, F.az, F.th1), F.drop);
            if (it.crushC || it.crushT) this.crushPose(it);   // cây đổ đã bị xích đè: giữ dáng dập bẹp (crushLogs)
          }
        }
      }
    }
    // Xe húc đổ cây khi chạy qua. Trả về các cây vừa bị húc đổ (null nếu không có) — terrain phát tiếng thân xe đập thân cây
    crush(x, z, r, vx, vz, fx) {
      this.crushLogs({ cx: x, cz: z, r }, true, fx);   // cây đã đổ nằm dưới xe: tán dập bẹp, thân nát
      if (Math.hypot(vx, vz) < 6) return null;
      let felled = null;
      for (const it of this.near(x, z, r)) {
        if (it.fallen || it.shattered || (it.kind === 'cactus' && RNG() < 0.5)) continue;
        // xe húc: thân gãy sát đất hoặc bật gốc (pushBreak — như TreeField.ram trong trận)
        this.fell(it, vx, vz, fx, { crush: true, v: Math.hypot(vx, vz), brk: this.pushBreak(it, it.y + 9) });
        (felled || (felled = [])).push(it);
      }
      return felled;
    }
    // Xe trinh sát 4x4 nhẹ (~10 tấn) húc cây: không đủ sức bật gốc như xe xích 40-60 tấn — bị thân cây chặn lại
    // (terrain.resolveVehicleCollision), cây rung mạnh, lá & cành nhỏ rụng xuống, một phần rơi đọng trên xe.
    // Trả về danh sách cây vừa bị húc (mỗi cây nghỉ 0,7 s để xe tì vào cây không rụng lá liên tục mỗi khung hình)
    // ob (tuỳ chọn): hộp thân xe (VehicleCollision.vehObb) — chỉ cây chạm sát mặt hộp, không phải cả vòng tròn quanh tâm xe
    brush(x, z, r, vx, vz, fx, now, ob) {
      const out = [];
      const sp = Math.hypot(vx, vz), cg = ob ? (this._brCg || (this._brCg = {})) : null;
      for (const it of this.near(x, z, r + 6)) {
        if (it.fallen || it.kind === 'cactus') continue;
        if (ob ? VehicleCollision.circleGap(ob, it.x, it.z, it.trunkR || 1.5, cg).gap > 1.5 : Math.hypot(it.x - x, it.z - z) > r + (it.trunkR || 1.5)) continue;
        if (it._brushT !== undefined && now - it._brushT < 0.7) continue;
        it._brushT = now;
        const k = Math.min(1, 0.3 + sp / 60);
        this.push(it, vx || (it.x - x), vz || (it.z - z), 0.02 + 0.05 * k);
        if (it.ci >= 0 && !it.crownGone) this.stripLeaves(it, 0.02 + 0.03 * k, it.x, it.y + it.height * 0.7, it.z, fx);
        out.push(it);
      }
      return out;
    }

    // ---- XE HÚC CÂY THEO LỰC (thay crush cũ: mọi cây gãy như nhau khi xe chạy > 6 đv/s, xe chạy chậm thì xuyên qua thân)
    // Sức chịu thân cây: mô-men gãy M = σ·π·d³/32 (gỗ tươi σ ~40 MPa), mũi xe tì cao ~1,1 m -> lực gãy F = M / 1,1;
    // năng lượng phá E = F x độ oằn ~0,3 m. Thân 0,3 m: ~100 kN (xe 60 tấn tì là đổ, xe 4x4 ủi ~4 s mới bật gốc);
    // 0,6 m: ~0,8 MN (xe tăng lao >= ~11 km/h mới húc gãy, bò chậm hơn thì bị chặn, tì ủi ~4-5 s thì bật gốc);
    // 0,85 m trở lên: ~2,4 MN — xe tăng không húc gãy nổi, phải vòng qua
    ramSpec(it) {
      if (it._ram && it._ramS === it.state) return it._ram;
      const d = 2 * (it.trunkR || 1.5) / 8;
      let k = it.kind === 'cactus' ? 0.03 : it.kind === 'deadTree' ? 0.55 : it.kind === 'palm' ? 0.8 : 1;
      if (it.state === 'burnt') k *= 0.45;   // thân cháy rỗng ruột: giòn, dễ gãy
      const F = 40e6 * Math.PI * d * d * d / 32 / 1.1 * k;
      it._ram = { F, E: F * 0.3, d }; it._ramS = it.state;
      return it._ram;
    }
    // Phần động lượng của xe thành lực phá cây: mũi xe xích bọc thép = 1; xe tải 6x6 đầu cabin móp trước = 0,45;
    // xe 4x4 trinh sát ~10 tấn không húc gãy nổi cây bằng đà (cản trước bẹp trước) — chỉ ủi được cây nhỏ / xương rồng
    ramImpact(unit) { return unit.tankType === 'SCOUT' ? 0 : unit.isWheeled ? 0.45 : 1; }
    // Cây còn đứng có chặn xe không (xe không đủ lực đánh gãy ngay ở tốc độ áp vn)
    holds(it, unit, vn) {
      if (it.fallen || it.shattered || typeof VehicleCollision === 'undefined') return false;
      return VehicleCollision.ramForce(unit, vn, this.ramImpact(unit)) < this.ramSpec(it).F;
    }
    // Mỗi khung, mọi xe: cây chạm hộp thân xe (ob) — đủ lực thì gãy / bật gốc đổ theo hướng xe chạy, xe mất đà theo năng
    // lượng phá; không đủ lực thì bị chặn (terrain.resolveVehicleCollision) và xe ủi liên tục với lực kéo >= ~45% lực gãy
    // thì sau vài giây cây bật gốc (rễ chịu kém thân). Xe bản sao mạng: chỉ đánh đổ cây, không đổi tốc độ xe
    // ---- CÂY ĐÃ ĐỔ BỊ XE ĐÈ QUA (xích / bánh cán lên khúc thân & tán nằm trên đất)
    // Tán dập bẹp sát đất (ép theo phương đứng quanh mặt đất), lá rách rụng tung, sắc lá sẫm úa; thân nằm bị đè nứt dập,
    // dăm gỗ & vỏ văng; thân mảnh (≤ ~0,35 m) nát bẹp hẳn — không còn chặn đạn (gỡ khỏi this.logs), gờ khúc thân thấp
    // xuống (logOf). Cây đang đổ chưa tiếp đất thì đợi. Mỗi cây dập theo nấc (lần đầu / xe nặng lần hai) — không lặp mỗi khung.
    // reg: hộp thân xe { cx, cz, ux, uz, hu, hv } | vòng { cx, cz, r }; heavy: xe xích nặng (nát thân), xe bánh nhẹ chỉ dập tán
    crushLogs(reg, heavy, fx) {
      if (!this.logs.length) return;
      const R = reg.r !== undefined ? reg.r : Math.hypot(reg.hu, reg.hv);
      const inside = (x, z, pad) => {
        const tx = x - reg.cx, tz = z - reg.cz;
        if (reg.r !== undefined) return tx * tx + tz * tz < (reg.r + pad) * (reg.r + pad);
        const lu = tx * reg.ux + tz * reg.uz, lv = -tx * reg.uz + tz * reg.ux;
        return Math.abs(lu) < reg.hu + pad && Math.abs(lv) < reg.hv + pad;
      };
      for (let i = this.logs.length - 1; i >= 0; i--) {
        const it = this.logs[i], F = it.fall;
        if (!it || it.shattered || !F || (F.tab && !F.landed) || this.falling.includes(it)) continue;
        const reach = R + it.height + 10;
        if (Math.abs(it.x - reg.cx) > reach || Math.abs(it.z - reg.cz) > reach) continue;
        // điểm dọc khúc thân nằm (chỗ gãy -> ngọn): đoạn dưới 0,5 chiều cao là thân, trên là tán
        const cn = it.V.info.canopy, padC = cn ? cn.rc * it.s * 0.6 : 4, u0 = Math.min(0.9, (it.brk * it.s) / Math.max(1, it.height) + 0.02);
        let crown = false, trunk = false, hx = 0, hz = 0;
        for (let k = 0; k <= 8; k++) {
          const u = u0 + (1 - u0) * k / 8, p = this.trunkPoint(it, u), isC = it.ci >= 0 && u > 0.5;
          if (!inside(p.x, p.z, isC ? padC : (it.trunkR || 1.5) + 1)) continue;
          if (isC) crown = true; else trunk = true;
          hx = p.x; hz = p.z;
        }
        if (!crown && !trunk) continue;
        const c0 = it.crushC || 0, t0 = it.crushT || 0;
        const c1 = crown ? Math.min(1, c0 + (heavy ? 1 : 0.5)) : c0, t1 = trunk && heavy ? 1 : t0;
        if (c1 <= c0 && t1 <= t0) continue;
        it.crushC = c1; it.crushT = t1;
        const gy = this.groundAt(hx, hz);
        if (t1 > t0) {
          // thân bị xích đè: nứt dập, dăm gỗ trắng + vỏ sẫm văng thấp, bụi vụn; thân mảnh nát bẹp hẳn
          it.mashed = this.ramSpec(it).d <= 0.35;
          chunks(fx, hx, gy + 1.5, hz, it.mashed ? 12 : 7, 1.1, [0.74, 0.6, 0.42], 16);
          chunks(fx, hx, gy + 1.5, hz, it.mashed ? 8 : 4, 1.3, [0.36, 0.28, 0.2], 12);
          dustBurst(fx, hx, gy + 1, hz, 2, 5, [0.62, 0.55, 0.44]);
          if (it.mashed) { this.logs.splice(i, 1); it._log = null; }
          sfx('woodBreak', hx, gy + 2, hz, it.mashed ? 0.9 : 0.6, { crush: true });
        }
        if (c1 > c0 && it.ci >= 0 && !it.crownGone) {
          // tán bị cán: cành gãy rắc, lá rách rụng tung (stripLeaves: lá bay + tán thưa sẫm), cành con văng
          this.stripLeaves(it, heavy ? 0.3 : 0.18, hx, gy + 2, hz, fx);
          chunks(fx, hx, gy + 2, hz, 5, 0.7, it.state === 'ok' ? [0.3, 0.38, 0.17] : [0.4, 0.32, 0.18], 14);
          sfx('leafStrip', hx, gy + 2, hz, 0.7);
          // lá dập úa nâu (sau màu stripLeaves đặt)
          this.later(0.03, () => { if (!it.crownGone) this.crownColor(it, (it.state === 'ok' ? it.ctint || it.tint : TREE_COLORS.scorched).clone().lerp(TREE_COLORS.scorched, 0.3 * it.crushC).multiplyScalar(0.62 + 0.22 * Math.max(0, it.leaves))); });
        }
        this.crushPose(it);
      }
    }
    // Tư thế nằm cuối của cây đổ + ép bẹp theo phương đứng quanh mặt đất: thân (dập 0,72 / nát 0,3), tán (dập 0,45 / bẹp 0,22)
    crushPose(it) {
      const F = it.fall, m0 = (this._cpM || (this._cpM = new THREE.Matrix4())).copy(this.fallMatrix(it, F.ax, F.az, F.th1));
      if (F.drop) m0.premultiply(_tD.makeTranslation(0, -F.drop, 0));
      const S = this._cpS || (this._cpS = new THREE.Matrix4()), out = this._cpO || (this._cpO = new THREE.Matrix4());
      const squash = (k, gy) => out.makeTranslation(0, gy, 0).multiply(S.makeScale(1, k, 1)).multiply(_tT.makeTranslation(0, -gy, 0)).multiply(m0);
      const pT = this.trunkPoint(it, 0.4), pC = this.trunkPoint(it, 0.75);
      const kT = it.crushT ? (it.mashed ? 0.3 : 0.72) : 1, kC = it.crushC ? (it.crushC >= 1 ? 0.22 : 0.45) : 1;
      squash(kT, this.groundAt(pT.x, pT.z) - 0.5);
      it.V.trunk.set(it.ti, out);
      if (it.brk && it.capT >= 0) this.caps.set(it.capT, _tC.copy(out).multiply(this.capLocal(it, true)));
      if (it.ci >= 0 && !it.crownGone) { squash(kC, this.groundAt(pC.x, pC.z) - 0.5); it.V.crown.set(it.ci, out); }
    }

    // Chỗ gãy khi cây bị ĐẨY đổ (thân xe húc / nòng tì / nòng vụt): lực ngang đặt ở độ cao nào cũng gây mô-men uốn lớn nhất
    // ở gốc -> thân gãy sát đất (~0,2-0,5 m) hoặc bật cả rễ (thân càng to càng dễ bật gốc), không gãy ngang chỗ nòng chạm
    // (nòng cao ~2 m -> gốc cụt 2 m trông vô lý). Riêng xương rồng thân mọng nước mềm: gãy ngang chỗ bị nện.
    // hitY: độ cao thế giới chỗ chạm. Trả độ cao gãy cục bộ (0 = bật gốc)
    pushBreak(it, hitY) {
      if (it.kind === 'cactus') return Math.max(1.6, Math.min(it.trunkH * 0.8, (hitY - it.y) * 0.85)) / (it.s || 1);
      if (RNG() < Math.min(0.6, Math.max(0, (this.ramSpec(it).d - 0.25) / 0.4))) return 0;
      return rand(1.6, 4) / (it.s || 1);
    }

    // ---- NÒNG PHÁO VỤT VÀO THÂN CÂY ĐỨNG (barrel_sweep.js)
    // Hộp chặn nòng (VehicleCollision.barrelDepth) cho thân cây mà cú vụt (năng lượng Eat(x, z) tại chỗ nòng gần thân) không
    // bẻ gãy nổi, quanh (cx, cz) bán kính R. Cây non / thân mảnh bẻ gãy được thì không chặn (barrelSweep cho gãy đổ)
    barrelBoxes(cx, cz, R, Eat, out) {
      for (const it of this.near(cx, cz, R + 10)) {
        if (it.fallen || it.shattered || this.ramSpec(it).E <= Eat(it.x, it.z)) continue;
        const r = (it.trunkR || 1.5) * 0.85;
        out.push({ cx: it.x, cz: it.z, ux: 1, uz: 0, hu: r, hv: r, y0: it.y - 1, y1: it.y + it.trunkH, mat: 'tree', tree: it });
      }
      return out;
    }
    // Nòng nện vào thân cây chặn nòng: cây rung, vỏ tróc văng ở chỗ nện, cành gãy rụng lá; cây vừa (cú vụt ≥ ~30% sức
    // thân) tích hư hại qua từng cú, đủ sức thân thì gãy đổ theo chiều vụt. Mỗi cây ~3 lần / giây. Trả true nếu đổ
    barrelWhack(it, E, x, y, z, dx, dz, fx) {
      const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      if (it.fallen || (it._bwT !== undefined && now - it._bwT < 0.35)) return false;
      it._bwT = now;
      const S = this.ramSpec(it), k = Math.min(1, E / S.E);
      this.push(it, dx, dz, 0.04 + 0.18 * k);
      const charred = it.state === 'burnt' || it.state === 'burning';
      chunks(fx, x, y, z, 2 + Math.round(5 * k), 0.6, charred ? [0.13, 0.11, 0.1] : [0.42, 0.33, 0.24], 12);   // vỏ tróc
      if (k > 0.15) chunks(fx, x, y, z, Math.round(4 * k), 0.5, charred ? [0.2, 0.18, 0.16] : [0.76, 0.62, 0.44], 10);   // gỗ trắng lộ
      if (it.ci >= 0 && !it.crownGone) this.stripLeaves(it, 0.015 + 0.06 * k, x, y + 8, z, fx);   // cành rung gãy, lá rụng
      if (k >= 0.3) {
        it._bdmg = (it._bdmg || 0) + E;
        if (it._bdmg >= S.E) {
          this.fell(it, dx, dz, fx, { crush: true, v: 8, brk: this.pushBreak(it, y) });
          return true;
        }
      }
      return false;
    }
    // NÒNG PHÁO QUÉT / ĐẬP (barrel_sweep.js): điểm mẫu dọc nòng S.pts chạm thân cây. Năng lượng cú đập ≥ sức thân (ramSpec,
    // như xe húc) thì cây non / thân mảnh gãy ngang chỗ nòng nện, đổ theo chiều quét; cây to chặn nòng — rung mạnh, rụng
    // lá. Nòng quét qua tán lá: cành lá rách rụng, cây lắc (mỗi cây tối đa ~3 lần / giây)
    barrelSweep(S) {
      const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      let hit = null;
      for (const it of this.near(S.cx, S.cz, S.R + 40)) {
        if (it.fallen || it.shattered) continue;
        for (const p of S.pts) {
          const d = Math.hypot(p.x - it.x, p.z - it.z), tr = it.trunkR || 1.5;
          if (d < tr + S.rb && p.y > it.y - 1 && p.y < it.y + it.trunkH) {
            const R = this.ramSpec(it);
            if (p.E >= R.E) {
              this.fell(it, p.vx, p.vz, S.fx, { crush: true, v: p.s, brk: this.pushBreak(it, p.y) });
            } else this.barrelWhack(it, p.E, p.x, p.y, p.z, p.vx, p.vz, S.fx);   // tróc vỏ, gãy cành; nòng bị chặn (BarrelSweep.update)
            hit = hit || { x: p.x, y: p.y, z: p.z, mat: 'tree', mB: Math.min(12, Math.max(0.8, R.d * R.d * 30)) };
            break;
          }
          if (it.ci >= 0 && !it.crownGone && p.y > it.y + it.trunkH * 0.6 && p.y < it.y + it.height && d < it.height * 0.3 && (!it._bsC || now - it._bsC > 0.35)) {
            it._bsC = now;
            this.push(it, p.vx, p.vz, 0.05);
            this.stripLeaves(it, 0.025, p.x, p.y, p.z, S.fx);
            break;
          }
        }
      }
      return hit;
    }
    ram(unit, ob, dt, fx) {
      const VC = VehicleCollision, now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      const remote = !!(unit.isRemote || unit._netProxy);
      const cg = this._ramCg || (this._ramCg = {});
      const a = unit.bodyAngle || 0, sg = (unit.speed || 0) >= 0 ? 1 : -1, mx = -Math.sin(a) * sg, mz = -Math.cos(a) * sg;
      // cây đã đổ nằm dưới thân xe: tán dập bẹp, thân bị đè nát (xe xích / xe nặng); xe bánh nhẹ chỉ dập tán
      this.crushLogs(ob, !unit.isWheeled || (unit.mass || 40) >= 25, fx);
      let felled = null;   // cây vừa đổ (terrain.crushHullSound: tiếng thân xe nện vào cây)
      for (const it of this.near(ob.cx, ob.cz, Math.hypot(ob.hu, ob.hv) + 8)) {
        if (it.fallen || it.shattered) continue;
        VC.circleGap(ob, it.x, it.z, it.trunkR || 1.5, cg);
        if (cg.gap > 1.2) { if (it._push && now - it._pushT > 0.6) it._push = 0; continue; }
        const vn = VC.approach(unit, cg.nx, cg.nz);
        const S = this.ramSpec(it), Ft = VC.tractive(unit);
        // terrain.resolveVehicleCollision đã quyết không chặn cây này trong khung (xe đủ lực ở tốc độ lúc đó) -> giữ đúng
        // quyết định ấy (tốc độ xe có thể vừa tụt vì cọ tường): không để thân cây nằm lọt trong hộp xe rồi khung sau bị bật ra
        const promised = it._goU === unit && now - it._goT < 0.1;
        if (vn <= 0.3) {
          // xe quay tại chỗ / trượt ngang đè sườn lên cây: thân cây nhỏ (lực kéo đủ) bị ép đổ ra xa sườn xe; cây to chặn
          if (cg.gap < 0 && (promised || Ft >= S.F)) {
            this.fell(it, -cg.nx, -cg.nz, fx, { crush: true, v: 3, brk: rand(1.6, 4) / (it.s || 1) });
            (felled || (felled = [])).push(it);
          }
          continue;
        }
        const Fc = VC.ramForce(unit, vn, this.ramImpact(unit));
        if (Fc >= S.F || promised) {
          // gãy sát gốc (0,2-0,5 m, xích cán qua gốc cụt) hoặc bật cả gốc: cây to xe tì chậm (lực kéo gần bằng sức thân)
          // thì rễ bung trước khi thân gãy; xe lao nhanh húc cây giòn thì thân gãy giập
          const uproot = it.kind !== 'cactus' && S.F > Ft * 0.5 && Fc < S.F * 1.6 && RNG() < Math.min(0.8, (S.d - 0.25) / 0.4);
          const brk = uproot ? 0 : rand(1.6, 4) / (it.s || 1);
          this.fell(it, mx, mz, fx, { crush: true, v: vn, brk });
          if (!remote) unit.speed = VC.speedAfter(unit, unit.speed, S.E, S.F);
          it._push = 0;
          (felled || (felled = [])).push(it);
          continue;
        }
        // bị thân cây chặn: rung cây, lá rụng (xe trinh sát rụng lá đọng lên xe qua brushVegetation); tì đủ lực thì bật gốc dần
        const r = Ft / S.F;
        if (it._push && now - it._pushT > 0.6) it._push = 0;
        it._pushT = now;
        if (r < 0.45) continue;
        it._push = (it._push || 0) + dt * r;
        if (unit.tankType !== 'SCOUT' && RNG() < dt * 3) this.push(it, mx, mz, 0.03 + 0.04 * r);
        if (it._push >= 2.4) { this.fell(it, mx, mz, fx, { crush: true, v: 4, brk: 0 }); it._push = 0; (felled || (felled = [])).push(it); }
      }
      return felled;
    }
    // Mặt đỡ cho xích / bánh (VehicleCollision.debrisHeight): thân cây đổ nằm trên đất (khúc gốc to — gờ tròn cao bằng
    // đường kính thân) và gốc cụt còn lại -> xe cán qua thì xóc, ngóc mũi rồi chúc xuống như xe thật trèo qua thân cây
    vehicleDebris(x, z, r, out) {
      for (const it of this.near(x, z, r + 60)) {
        const D = this.logOf(it);
        if (!D) continue;
        if (D.bump && Math.abs(D.bump.x - x) < r + D.bump.r && Math.abs(D.bump.z - z) < r + D.bump.r) out.push(D.bump);
        if (D.x1 > x - r && D.x0 < x + r && D.z1 > z - r && D.z0 < z + r) out.push(D.ridge);
      }
      return out;
    }
    // Khúc gốc thân cây đổ cao hơn bậc leo của xe (xe 4x4 gặp thân cây to ~0,7 m): chặn thân xe như vật cản
    // (terrain.vehicleObstacles; hullPush tự bỏ qua với xe leo được — xe tăng trèo qua theo vehicleDebris)
    vehicleBoxes(x, z, r, out) {
      for (const it of this.near(x, z, r + 60)) {
        const D = this.logOf(it);
        if (!D || !(D.x1 > x - r && D.x0 < x + r && D.z1 > z - r && D.z0 < z + r)) continue;
        out.push(D.box);
      }
      return out;
    }
    // Hình khúc gốc thân cây đã đổ nằm yên (gờ tròn cho xích, hộp chặn xe, ụ gốc cụt) — tính 1 lần, chỉ tính lại khi tư
    // thế nằm đổi (mặt đất lún vì hố bom, đồng bộ lại hướng đổ). null: cây đứng / đang đổ / xương rồng
    logOf(it) {
      if (!it.fallen || it.shattered || it.kind === 'cactus' || !it.fall || !it.fall.th1 || this.falling.includes(it)) return null;
      const F = it.fall, e = it.base.elements, key = e[12] * 7 + e[14] * 13 + it.y * 17 + F.th1 * 31 + (F.drop || 0) * 37 + it.brk + (it.crushT || 0) * 41;
      if (it._log && it._logK === key) return it._log;
      // khúc thân bị xích đè dập (crushLogs): gờ thấp xuống, thân mảnh nát bẹp gần sát đất
      const R0 = (it.trunkR || 1.5) * 0.9 * (it.crushT ? (it.mashed ? 0.35 : 0.72) : 1), hb = it.brk * it.s;
      const A = this.trunkPoint(it, Math.min(0.9, (hb + R0) / Math.max(1, it.height))), B = this.trunkPoint(it, 0.55);
      const ga = this.groundAt(A.x, A.z), gb = this.groundAt(B.x, B.z), ta = ga + 2 * R0, tb = gb + 1.1 * R0;
      const L = Math.hypot(B.x - A.x, B.z - A.z) || 1, ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
      const D = {
        ridge: { ridge: true, ax: A.x, az: A.z, bx: B.x, bz: B.z, ra: R0, rb: R0 * 0.55, ta, tb },
        // nửa gốc (khúc to nhất) chặn xe không trèo nổi
        box: { cx: A.x + ux * L / 4, cz: A.z + uz * L / 4, ux, uz, hu: L / 4, hv: R0, y0: Math.min(ga, gb) - 1, y1: ta, mat: 'tree' },
        bump: null,
        x0: Math.min(A.x, B.x) - R0, x1: Math.max(A.x, B.x) + R0, z0: Math.min(A.z, B.z) - R0, z1: Math.max(A.z, B.z) + R0
      };
      if (hb > 0.5) {
        // gốc cụt đứng đúng chỗ vẽ (fell của xe húc dời gốc ma trận cây lên trước ~3 đv cho khúc ngọn; gốc cụt vẽ ở chỗ cũ)
        const P = this.pivot(it, this._dbP || (this._dbP = new THREE.Vector3()));
        D.bump = { bump: true, x: P.x - (e[12] - it.x), z: P.z - (e[14] - it.z), r: R0 * 1.15, base: it.y - 0.6, top: P.y - (e[13] - (it.y - 0.6)), mat: 'wood' };
      }
      it._log = D; it._logK = key;
      return D;
    }
    // Chọn bản gần / bản xa cho từng ô theo camera sắp vẽ (game.render gọi trước mỗi lượt vẽ). Cự ly = từ camera tới mép
    // gần nhất của ô (tính cả chênh cao — camera drone trên cao), quy đổi theo độ phóng đại: kính ngắm x8 nhìn cây cách 2000
    // to như cây cách 250 -> vẫn bản gần. Không gọi hàm này (phòng xem xe, sân thử...) thì mọi ô giữ bản đầy đủ
    updateLOD(camera) {
      if (!camera || !this.lodCells.length) return;
      const p = camera.position, zk = camera.fov ? Math.tan(camera.fov * Math.PI / 360) / Math.tan(22.5 * Math.PI / 180) : 1;
      for (const L of this.lodCells) {
        const dx = p.x < L.x0 ? L.x0 - p.x : p.x > L.x1 ? p.x - L.x1 : 0;
        const dz = p.z < L.z0 ? L.z0 - p.z : p.z > L.z1 ? p.z - L.z1 : 0;
        const d = Math.sqrt(dx * dx + dz * dz + (p.y - L.y) * (p.y - L.y)) * zk;
        const Q = this.q || TREE_Q.high, H = TREE_LOD_HYST;
        const far = L.far ? d > Q.lod - H : d > Q.lod + H;
        L.far = far;
        // số cây trong ô cố định sau khi dựng, vẫn chép lại cho chắc (bản xa dùng chung bộ đệm instance)
        for (let i = 0; i < L.lo.length; i++) L.lo[i].count = L.full[i].count;
        if (L.vlo) L.vlo.count = L.full[1].count;
        // RẤT XA: thân khuất dưới tán & nhỏ hơn 1 điểm ảnh -> chỉ vẽ tán (rừng rậm hàng chục nghìn cây: thân bản xa ~1/3 số tam giác)
        const vfar = far && (L.vfar ? d > TREE_TRUNK_CULL - H : d > TREE_TRUNK_CULL + H);
        L.vfar = vfar;
        // cây tầng dưới tán (map_gen t.u): chỉ vẽ trong tầm gần theo mức đồ họa, xa hơn khuất dưới tán đại thụ -> không vẽ
        // (vẫn chặn đạn / xe ở mọi mức: va chạm phải như nhau trên mọi máy — nên chỉ ẩn ở xa, gần vẫn hiện)
        const hideU = L.under && (L.uHid ? d > Q.under - H * 0.5 : d > Q.under + H * 0.5);
        L.uHid = hideU;
        const fullOn = !far && !hideU, loOn = far && !L.under;
        for (const m of L.full) if (m.visible !== fullOn) m.visible = fullOn;
        // rất rất xa: tán chỉ còn khối lõi (bản crownVlo)
        const cv = vfar && !!L.vlo && (L.cvFar ? d > TREE_CROWN_VFAR - H : d > TREE_CROWN_VFAR + H);
        L.cvFar = cv;
        const vOn = loOn && cv, cOn = loOn && !vOn;
        if (L.lo[1].visible !== cOn) L.lo[1].visible = cOn;
        if (L.vlo && L.vlo.visible !== vOn) L.vlo.visible = vOn;
        const tOn = loOn && !vfar;
        if (L.lo[0].visible !== tOn) L.lo[0].visible = tOn;
      }
    }
    // Mức đồ họa (GameMenu low / medium / high / ultra): cự ly đổi sang bản xa, tầm vẽ cây tầng dưới tán, lá xuyên sáng
    setQuality(tier) {
      this.q = TREE_Q[tier] || TREE_Q.high;
      LEAF_TR.value = this.q.trans ? 1 : 0;
      // cây tầng dưới tán đứng trong bóng đại thụ: mức thấp / vừa bỏ lượt vẽ bóng đổ của chúng (bóng riêng gần như không thấy)
      for (const L of this.lodCells) if (L.under) for (const m of L.full) m.castShadow = this.q.uShadow;
    }

    update(dt, fx) {
      if (this.delayed && this.delayed.length) {
        for (let i = this.delayed.length - 1; i >= 0; i--) {
          const e = this.delayed[i];
          e.t -= dt;
          if (e.t <= 0) { this.delayed.splice(i, 1); e.fn(); }
        }
      }
      // Nhiệt dồn trên cây chưa bén lửa tản dần (gỗ & lá tươi đầy nước): hằng số thời gian TREE_COOL giây
      if (this.warm && this.warm.size) {
        const kc = Math.exp(-dt / TREE_COOL);
        for (const it of this.warm) {
          if (it.state === 'burning' || it.state === 'burnt') { this.warm.delete(it); continue; }
          it.heat *= kc;
          if (it.heat < 0.02) { it.heat = 0; this.warm.delete(it); }
        }
      }
      for (let i = this.smouldering.length - 1; i >= 0; i--) {
        const it = this.smouldering[i];
        it.smoulder -= dt;
        // than hồng trong vết nứt thân tàn dần
        const sk = Math.max(0, it.smoulder / (it.smoulder0 || 1));
        this.setBurn(it, null, 0.4 * sk * sk);
        if (it.smoulder <= 0) { this.smouldering.splice(i, 1); continue; }
        if (fx && fx.smoke && RNG() < dt * 3) {
          const g = rand(0.2, 0.32), tp = this.trunkPoint(it, rand(0.2, 0.6));   // cây đổ: khói bốc dọc thân nằm trên đất
          fx.smoke.add({ x: tp.x + rand(-1, 1), y: tp.y, z: tp.z + rand(-1, 1), vx: rand(-1.5, 1.5), vy: rand(5, 9), vz: rand(-1.5, 1.5),
            size: rand(2, 3.5), grow: 4, drag: 0.6, grav: -2, life: rand(3, 5), alpha: 0.35, fadeIn: 0.3, c0: [g, g, g], cell: 0, floor: false });
        }
      }
      // Cây đung đưa sau sóng nổ / đạn bay qua
      for (let i = this.swaying.length - 1; i >= 0; i--) {
        const it = this.swaying[i];
        if (it.fallen) { it.swaying = false; this.swaying.splice(i, 1); continue; }
        const W = it.sw, k = 32 / Math.max(0.6, it.s * it.height / 40), c = 6.8;
        const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
        for (let q = 0; q < n; q++) {
          W.vx += (-k * W.ax - c * W.vx) * h; W.vz += (-k * W.az - c * W.vz) * h;
          W.ax += W.vx * h; W.az += W.vz * h;
        }
        W.ax = Math.max(-0.2, Math.min(0.2, W.ax)); W.az = Math.max(-0.2, Math.min(0.2, W.az));
        // ma trận nháp dùng chung (Pool.set chép vào bộ đệm instance, không giữ tham chiếu) — không cấp phát mỗi khung
        const m = _tM.makeRotationFromEuler(_tE.set(W.ax, 0, W.az)).multiply(_tT.makeRotationY(it.rot));
        m.scale(_tS.set(it.s, it.s, it.s)).setPosition(it.x, it.y - 0.6, it.z);
        it.V.trunk.set(it.ti, m);
        if (it.ci >= 0 && !it.crownGone) it.V.crown.set(it.ci, m);
        if (Math.abs(W.ax) + Math.abs(W.az) + Math.abs(W.vx) * 0.05 + Math.abs(W.vz) * 0.05 < 0.008) {
          it.swaying = false; this.swaying.splice(i, 1);
          W.ax = W.az = W.vx = W.vz = 0;
          it.V.trunk.set(it.ti, it.base); if (it.ci >= 0 && !it.crownGone) it.V.crown.set(it.ci, it.base);
        }
      }
      for (let i = this.falling.length - 1; i >= 0; i--) {
        const it = this.falling[i];
        const F = it.fall;
        F.t += dt;
        if (F.t < 0) continue;
        // góc đổ theo bảng tính sẵn; sau khi chạm đất: tán & thân nảy lên một chút rồi nằm yên
        const dd = F.dropDur || 0;
        const p = F.tab ? Math.min(1, F.t / (F.dur + dd + 0.4)) : Math.min(1, F.t / F.dur);
        let ang, dy = 0;
        if (!F.tab) ang = (Math.PI / 2 - 0.06) * p * p;
        else if (F.t < F.dur) { const u = F.t * 60, j = Math.floor(u); ang = F.tab[j] + (F.tab[Math.min(F.tab.length - 1, j + 1)] - F.tab[j]) * (u - j); }
        else if (F.t < F.dur + dd) {
          // tuột khỏi gốc cụt: rơi tự do, vừa rơi vừa ngả nốt về góc nằm cuối
          const tb = F.t - F.dur, k = tb / dd;
          dy = Math.min(F.drop, 0.5 * 78 * tb * tb); ang = F.th1 + (F.th2 - F.th1) * k * k;
        } else {
          const tb = F.t - F.dur - dd;
          dy = F.drop || 0; ang = (F.th2 !== undefined ? F.th2 : F.th1) - (tb < 0.4 ? 0.05 * Math.sin(Math.PI * tb / 0.4) : 0);
        }
        if (F.tab && !F.landed && F.t >= F.dur + dd) {
          if (F.th2 !== undefined) F.th1 = F.th2;
          F.landed = true;
          // tán đập xuống đất: bụi cuộn lên chỗ tán + lá & cành nhỏ văng tung toé, tán xơ xác bớt
          const cp = this.trunkPoint(it, 0.7);
          dustBurst(fx, cp.x, Math.min(cp.y, this.groundAt(cp.x, cp.z) + 4), cp.z, 3, 10, [0.62, 0.56, 0.46]);
          if (it.ci >= 0 && !it.crownGone) {
            this.stripLeaves(it, 0.12, cp.x, cp.y, cp.z, fx);
            if (fx && fx.smoke) {
              const leafC = it.state === 'ok' ? [0.3, 0.4, 0.17] : [0.45, 0.36, 0.2];
              for (let k = 0; k < 22; k++) {
                const tp = this.trunkPoint(it, rand(0.5, 1));
                fx.smoke.add({ x: tp.x + rand(-7, 7) * it.s, y: tp.y + rand(0, 4), z: tp.z + rand(-7, 7) * it.s, vx: rand(-10, 10), vy: rand(4, 14), vz: rand(-10, 10),
                  size: rand(0.6, 1.4), grow: 0, drag: 2.4, grav: 16, life: rand(1.8, 3.2), alpha: 0.95, fadeIn: 0.01, c0: leafC, cell: 2 });
              }
            }
          }
        }
        this.setPose(it, this.fallMatrix(it, F.ax, F.az, ang), dy);
        if (p >= 1) {
          this.falling.splice(i, 1);
          if (!F.tab) { const cp = this.trunkPoint(it, 0.7); dustBurst(fx, cp.x, this.groundAt(cp.x, cp.z), cp.z, 3, 10, [0.62, 0.56, 0.46]); }
        }
      }
      for (let i = this.burning.length - 1; i >= 0; i--) {
        const it = this.burning[i];
        it.burnAge += dt;
        const a = it.burnAge, Dc = it.burnDc, Dt = it.burnDt;
        const crownOn = it.ci >= 0 && !it.crownGone && Dc > 0;
        // cường độ lửa: bùng lên trong ~1,5 s, cháy to suốt lúc tán cháy, rồi chỉ còn lửa liếm thân yếu dần
        let I = Math.min(1, a / 1.5) * (a < Dc ? 1 : Math.max(0, 0.5 * (1 - (a - Dc) / Dt)));
        // vừa bị sóng nổ thổi bạt: lửa xẹp hẳn rồi bùng trở lại
        if (it.blowT > 0) { it.blowT -= dt; I *= 1 - 0.8 * clamp01(it.blowT / 1.2); }
        // Tiếng cây cháy: nguồn âm liên tục khi tán lá còn cháy (lá khô nổ lách tách nhiều), báo 2 lần/giây
        it.sndT = (it.sndT || 0) - dt;
        if (it.sndT <= 0 && typeof window !== 'undefined' && window.soundEngine && window.soundEngine.fireSource) {
          it.sndT = 0.5;
          window.soundEngine.fireSource(it, { x: it.x, y: it.y, z: it.z }, crownOn ? 0.8 : 0.45);
        }
        if (crownOn) {
          // lá cháy loang dần trong tán (shader), tán sẫm dần
          const pc = clamp01(a / Dc);
          // nhiễu tập trung quanh 0.15..0.85 -> quét ngưỡng đều trong khoảng đó để lá cháy dần đều suốt thời gian tán cháy
          this.setBurn(it, (0.2 + 0.78 * pc) / 1.2, null);
          this.crownColor(it, (it.ctint || it.tint).clone().lerp(TREE_COLORS.scorched, Math.min(1, pc * 2)).multiplyScalar(1 - 0.4 * pc));
          if (pc >= 1) {
            it.crownGone = true;
            this.reweigh(it);
            this.crownHide(it);
            const cp = this.crownPoint(it, 0);
            if (fx && fx.fire) for (let k = 0; k < 14; k++) fx.fire.add({ x: cp.x + rand(-6, 6), y: cp.y, z: cp.z + rand(-6, 6), vx: rand(-6, 6), vy: rand(-4, 10), vz: rand(-6, 6), size: rand(0.8, 1.6), grow: -0.5, drag: 0.6, grav: 30, life: rand(1, 2), alpha: 1, fadeIn: 0.01, c0: [1, 0.6, 0.2], c1: [0.6, 0.15, 0.02], cell: 3 });
          }
        }
        // thân cháy sém đen dần từ lúc bén lửa, than hồng rực trong vết nứt
        this.trunkColor(it, it.tint.clone().lerp(TREE_COLORS.charred, clamp01(a / (Dc + Dt * 0.6))));
        this.setBurn(it, null, 0.3 + 0.7 * I);
        if (fx) { if (fx.withLod) fx.withLod(it.x, it.y + (it.height || 40) * 0.6, it.z, 30, () => this.emitFire(it, I, crownOn, dt, fx)); else this.emitFire(it, I, crownOn, dt, fx); }
        if (a >= Dc + Dt) {
          this.burning.splice(i, 1);
          // Cháy rụi: lá cháy sạch, trơ khung thân + cành than đen
          if (it.ci >= 0 && !it.crownGone) { it.crownGone = true; this.crownHide(it); }
          it.state = 'burnt';
          this.litterTint(it, 0.35);   // thảm kim / lá dưới gốc cháy thành tro
          this.reweigh(it);
          this.trunkColor(it, TREE_COLORS.charred);
          if (!it.fallen) this.push(it, rand(-1, 1), rand(-1, 1), 0.02);
          // Thân cây cháy rụi còn âm ỉ bốc khói, than hồng tàn dần một lúc lâu
          it.smoulder = it.smoulder0 = rand(25, 40);
          this.smouldering.push(it);
        }
      }
    }
    // Tâm khối tán (cây đứng / đã đổ) + điểm ngẫu nhiên trong khối tán (spread 0..1)
    crownPoint(it, spread) {
      const cn = it.V.info.canopy, s = it.s;
      const u = cn ? clamp01(cn.dc * s / it.height) : 0.75, c = this.trunkPoint(it, u);
      if (!spread) return c;
      const R = (cn ? cn.rc : 6) * s * spread, a = rand(0, 6.283), y = rand(-1, 1), r = Math.sqrt(1 - y * y) * Math.cbrt(rand(0.15, 1));
      return { x: c.x + Math.cos(a) * r * R, y: c.y + y * R * (it.fallen ? 0.8 : 0.55), z: c.z + Math.sin(a) * r * R };
    }
    // Lửa, tàn lửa, khói & ánh lửa của 1 cây đang cháy. Nhiều cây cháy cùng lúc: chia bớt hạt để không tràn bể hạt
    emitFire(it, I, crownOn, dt, fx) {
      if (I <= 0.01) return;
      const budget = Math.min(1, 5 / Math.max(1, this.burning.length)), cn = it.V.info.canopy, s = it.s;
      const R = (cn ? cn.rc : 6) * s;
      const n = (rate) => { const e = rate * dt; return Math.floor(e) + (RNG() < e - Math.floor(e) ? 1 : 0); };
      if (fx.fire) {
        // ngọn lửa: khắp khối tán khi tán cháy / dọc thân & cành khi chỉ còn thân
        const nF = n(I * budget * (crownOn ? 40 + R * 1.6 : 16));
        for (let k = 0; k < nF; k++) {
          const p = crownOn ? this.crownPoint(it, 0.9) : this.trunkPoint(it, rand(0.05, it.V.info.canopy ? 0.75 : 0.95));
          const big = crownOn ? Math.max(5, Math.min(20, R * rand(0.32, 0.58))) : rand(3, 6.5) * Math.min(1.4, s);
          const w = rand(0.7, 1);
          fx.fire.add({ x: p.x + (crownOn ? 0 : rand(-1.5, 1.5)), y: p.y, z: p.z + (crownOn ? 0 : rand(-1.5, 1.5)), vx: rand(-2, 2) + 2.4, vy: rand(8, 18), vz: rand(-2, 2) + 1.8,
            size: big, grow: crownOn ? 4 : 1.5, drag: 0.8, life: rand(0.55, 1.15), alpha: 0.95, fadeIn: 0.05, c0: [1, 0.8 * w + 0.12, 0.45 * w], c1: [0.9, 0.26, 0.03], cell: 1, floor: false });
        }
        // tàn lửa bay lên theo khói
        const nE = n(I * budget * (crownOn ? 10 : 4));
        for (let k = 0; k < nE; k++) {
          const p = crownOn ? this.crownPoint(it, 0.7) : this.trunkPoint(it, rand(0.2, 0.8));
          fx.fire.add({ x: p.x, y: p.y, z: p.z, vx: rand(-4, 4) + 3, vy: rand(10, 26), vz: rand(-4, 4) + 2.2, size: rand(0.4, 0.8), grow: -0.2, drag: 0.7, grav: -3,
            life: rand(1.4, 3), alpha: 1, fadeIn: 0.01, c0: [1, 0.75, 0.35], c1: [0.9, 0.25, 0.02], cell: 3, floor: false });
        }
      }
      if (fx.smoke) {
        // cột khói dày bốc lên từ đỉnh tán, cuộn to dần và ngả theo gió
        const nS = n(I * budget * (crownOn ? 4 + R * 0.12 : 2.2));
        for (let k = 0; k < nS; k++) {
          const p = crownOn ? this.crownPoint(it, 0.5) : this.trunkPoint(it, rand(0.3, 0.9));
          const g = rand(0.08, 0.16), sz = crownOn ? Math.max(6, Math.min(20, R * rand(0.45, 0.7))) : rand(4, 7);
          fx.smoke.add({ x: p.x, y: p.y + (crownOn ? R * 0.3 : 2), z: p.z, vx: rand(-2, 2) + rand(3, 7) * 0.8, vy: rand(9, 16), vz: rand(-2, 2) + rand(3, 7) * 0.6,
            size: sz, grow: crownOn ? 11 : 6, drag: 0.5, grav: -2.2, life: rand(5, 8), alpha: crownOn ? 0.55 : 0.4, fadeIn: 0.2,
            c0: [g, g * 0.95, g * 0.9], c1: [g * 2.6 + 0.12, g * 2.5 + 0.12, g * 2.4 + 0.12], cell: 0, floor: false });
        }
      }
      // ánh lửa hắt lên xung quanh (nhấp nháy)
      it.lightT -= dt;
      if (it.lightT <= 0 && fx.addLight && this.burning.length <= 6) {
        it.lightT = 0.22;
        const c = crownOn ? this.crownPoint(it, 0) : this.trunkPoint(it, 0.3);
        fx.addLight(c.x, c.y, c.z, (crownOn ? 0.55 : 0.3) * I * rand(0.75, 1.1), 0.32);
      }
    }
    // Ghi tiến độ cháy tán (cb, null: giữ nguyên) & độ rực than hồng của thân / gốc cụt (glow, null: giữ nguyên)
    setBurn(it, cb, glow) {
      if (cb !== null && it.ci >= 0) { const at = it.V.crown.mesh.geometry.attributes.burn; at.setX(it.ci, cb); at.needsUpdate = true; }
      if (cb !== null && it.sci >= 0) { const at = it.V.cstump.mesh.geometry.attributes.burn; at.setX(it.sci, cb); at.needsUpdate = true; }
      if (glow !== null) {
        const at = it.V.trunk.mesh.geometry.attributes.burn; at.setX(it.ti, glow); at.needsUpdate = true;
        if (it.si >= 0) { const bt = it.V.stump.mesh.geometry.attributes.burn; bt.setX(it.si, glow); bt.needsUpdate = true; }
      }
    }
    reset() {
      for (const it of this.items) {
        it.heat = 0; it.wear = 0; it.blowT = 0; it.state = 'ok'; it.fallen = false; it.crownGone = false; it.fall = null; it.leaves = 1; it.sw = null; it.swaying = false;
        if (it._lit && it._lit.k && it._lit.k !== 1) this.litterTint(it, 1 / it._lit.k);
        this.applyBreak(it, 0);
        this.setBurn(it, 0, 0);
        it.V.trunk.set(it.ti, it.base); if (it.ci >= 0) it.V.crown.set(it.ci, it.base);
        this.trunkColor(it, it.tint); this.crownColor(it, it.ctint || it.tint);
      }
      if (this.delayed) this.delayed.length = 0;
      this.burning.length = 0; this.falling.length = 0; this.swaying.length = 0; this.smouldering.length = 0;
      if (this._camHid) this._camHid.clear();
      if (this.warm) this.warm.clear();
      this.logs.length = 0;
    }
  }

  // ===========================================================================
  // NHÀ CỬA — kích thước thật (8 đơn vị = 1 m): tầng cao ~3 m, khoang cửa sổ ~3 m, tường bao dày ~0,27 m.
  // Mỗi mảng tường (1 khoang x 1 tầng) còn nguyên là 1 instance dùng chung; trúng đạn thì chuyển sang lưới ô ~0,2 m
  // riêng: đạn khoét ĐÚNG điểm chạm, theo loại đạn & góc bắn (lỗ xuyên, vành bê tông bóc lở, muội khói, cốt thép
  // cong lòi ra), lỗ liền mạch qua mép các mảng kề nhau, mảnh tường treo không còn chỗ bám thì rơi xuống.
  // Sàn / mái chia ô theo khoang (thủng / sập từng ô), đạn bay lọt qua lỗ đã có và nổ bên trong nhà.
  // ===========================================================================
  // Tỉ lệ theo nhà thật (8 đơn vị = 1 m): tầng nhà phố ~3,4-3,6 m (tầng cửa hàng / văn phòng cao hơn), nhà ống mặt tiền 4 m,
  // nhà cấp 4 / nhà làng tường cao ~3,1-3,4 m — xe tăng (cao ~2,4 m, rộng ~3,7-4 m) đứng cạnh chỉ ngang 2/3 tầng trệt
  const STYLE = {
    // tex: mặt tường mọi tầng · ground: các mẫu tầng trệt (chọn 1 theo vị trí nhà) · upper: các mẫu tầng trên
    office: { tex: 'office', ground: ['office', 'officeB'], colors: [0xb9c2c8, 0xa8b0b5, 0xc8c2b4, 0xbdb6a8], floorH: 29, bay: 30, roof: 'flat', rc: true, mat: 'concrete' },
    apartment: { tex: 'apt', ground: ['apt', 'aptB', 'aptC'], colors: [0xd9cdb6, 0xcfbb9e, 0xc0c6c8, 0xddd1be, 0xbfac93, 0xc9c0a4], floorH: 27, bay: 28, roof: 'flat', rc: true, mat: 'concrete' },
    // Khối nhà phố: tầng trệt cửa hàng (tủ kính + mái hiên / cửa cuốn), các tầng trên cửa sổ ở
    shop: { tex: 'shop', ground: ['shop', 'shopB'], upper: ['apt', 'aptB', 'aptC'], colors: [0xddd5c5, 0xd0bfa3, 0xc6c0b6], floorH: 29, bay: 30, roof: 'flat', rc: true, mat: 'concrete' },
    // Nhà ống liền vách: ngang 1-2 khoang, sơn màu (vàng, xanh, hồng đất... đã phai), tầng trên cửa ban công / khung sắt
    tube: { tex: 'shop', ground: ['shop', 'shopB'], upper: ['tube', 'tubeB'], sideTex: 'side', colors: [0xd8c486, 0xb3bf98, 0xcfa595, 0xa8bac2, 0xddd3c0, 0xcdb08a, 0xbfc7b4], floorH: 28, bay: 32, roof: 'flat', rc: true, mat: 'concrete' },
    ruin: { tex: 'apt', colors: [0x9c968c, 0x8e8a82], floorH: 27, bay: 28, roof: 'flat', ruined: true, rc: true, mat: 'concrete' },
    mudbrick: { tex: 'adobe', colors: [0xffffff, 0xf0e6d6], floorH: 25, bay: 26, roof: 'flat', mat: 'adobe', top: [0xc8ae8a, 0xb9a080], slab: 0xc8b090 },
    stone: { tex: 'stone', colors: [0xffffff, 0xe8e4dc], floorH: 26, bay: 26, roof: 'pitched', mat: 'stone' },
    stilt: { tex: 'wood', colors: [0xffffff, 0xeadcc4], floorH: 24, bay: 26, roof: 'pitched', mat: 'wood' },
    farm: { tex: 'apt', colors: [0xe8e2d6, 0xdccfb7, 0xcdc8bd], floorH: 27, bay: 28, roof: 'pitched', rc: true, mat: 'concrete' },
    hangar: { tex: 'hangarDoor', sideTex: 'metal', colors: [0x9aa08e, 0xa7a99c, 0x8f9583, 0xb3ae9e], floorH: 52, bay: 36, roof: 'arched', mat: 'metal' },
    // ĐÔ THỊ (map_gen 5b): biệt thự / nhà vườn 2-3 tầng tường sơn màu nhạt, mái ngói đỏ dốc
    villa: { tex: 'apt', ground: ['aptB', 'apt'], colors: [0xf0e6d2, 0xe8dcc8, 0xdfe6e0, 0xf2e2c8, 0xe6d2c0, 0xd8e0d0], floorH: 27, bay: 26, roof: 'pitched', rc: true, mat: 'concrete', top: [0xc0603e, 0xa24c34, 0x8e4430, 0x6a6a70] },
    // nhà kho / nhà xưởng tôn: tầng trệt cửa cuốn lớn, vách tôn, mái tôn dốc, cao 7,5 m
    warehouse: { tex: 'metal', ground: ['hangarDoor'], sideTex: 'metal', colors: [0xa9afb2, 0x9aa3a8, 0xb8b4a8, 0x8f989c, 0xa8b0a0], floorH: 60, bay: 36, roof: 'pitched', mat: 'metal', top: [0x8f969a, 0x7a8288, 0x9a8f80, 0x6f787c] },
    // nhà thờ (gian chính cao 5,5 m mỗi tầng, tường đá trát, mái dốc) + tháp chuông vuông
    church: { tex: 'stone', colors: [0xf2ece0, 0xe6dfd2, 0xeae2d0], floorH: 44, bay: 30, roof: 'pitched', mat: 'stone', top: [0x7a5a4a, 0x5c5c62, 0x8a4a3a] },
    tower: { tex: 'stone', colors: [0xf2ece0, 0xe6dfd2, 0xeae2d0], floorH: 40, bay: 32, roof: 'pitched', mat: 'stone', top: [0x5c5c62, 0x7a5a4a] },
    // trường học sơn vàng, bệnh viện sơn trắng, chợ nhà lồng mái vòm cao 7 m
    school: { tex: 'apt', ground: ['apt', 'aptB'], colors: [0xe8c860, 0xe2c25a, 0xead27a, 0xe4cc70], floorH: 29, bay: 28, roof: 'flat', rc: true, mat: 'concrete' },
    hospital: { tex: 'apt', ground: ['aptC', 'apt'], colors: [0xf2f2ee, 0xe8ecec, 0xeef0f0], floorH: 29, bay: 30, roof: 'flat', rc: true, mat: 'concrete' },
    market: { tex: 'shop', ground: ['shop', 'shopB'], colors: [0xd8d0c0, 0xc8bca8, 0xd0c8b4], floorH: 56, bay: 36, roof: 'arched', rc: true, mat: 'concrete', top: [0x8f969a, 0x7a8288, 0x9a9488] }
  };
  // Màu nhuộm mái / sàn (nhân với slabTex xám ~0.55 hoặc ngói roofTileTex), chọn theo vị trí nhà (không lấy số RNG chung):
  // mái bằng = bê tông xám, hắc ín xám đậm, sỏi xám ấm, tấm chống thấm cũ; mái dốc = ngói mới / phai / rêu xám
  // Kiểu đầu hồi + mái dốc theo vật liệu tường: kho tôn = hồi tôn + mái tôn, nhà gỗ = hồi ván, nhà đá / nhà thờ = hồi đá,
  // còn lại tường trát vữa (BuildingSet.roofPoolsBy)
  // Màu mảnh ngói / tôn vỡ (hộp màu trơn, không texture): màu nền texture mái x hệ số nhuộm của dải mái
  const roofShardCol = (B, c) => (gableKind(B.st) === 'metal' || (B.roofShape && B.roofShape.kind === 'arched') ? new THREE.Color(0.42, 0.44, 0.45) : new THREE.Color(0.36, 0.16, 0.1)).multiply(c || new THREE.Color(1, 1, 1));
  const gableKind = st => st.mat === 'metal' ? 'metal' : st.mat === 'wood' ? 'wood' : st.mat === 'stone' ? 'stone' : 'plaster';
  const FLAT_TOP = [0xb4b2ac, 0x5f5e5b, 0x9e988d, 0x74726c, 0xa8a7a2];
  const PITCH_TOP = [0xffffff, 0xdacfc4, 0xbdb5ab, 0xa29a90];
  const SLAB_COL = 0xc4c2bc;
  // Vật liệu tường: độ dày, màu mặt gãy, độ giòn (hệ số lỗ thủng), màu bụi
  const WALLMAT = {
    // chip: hệ số đạn nhỏ đục dần mỗi phát theo vật liệu (bê tông / đá chịu đục tốt, đất / gỗ / tôn thủng nhanh)
    // kpa: áp lực nổ (kPa, tải tương đương) làm mảng tường nguyên bật tung — vách tôn kho ~10-15, gỗ ~20, gạch đất ~40,
    //      đá ~55, tường bê tông cốt thép ~120 (xem confinedBlast)
    // sk: hệ số yếu kết cấu khi trúng đạn / nổ gần (nứt mảng tường, cột, ô sàn / mái): khung gỗ, vách tôn, gạch đất gãy
    //     sớm hơn bê tông cốt thép cùng một phát (trước đây mọi vật liệu cùng số phát, chỉ khác cỡ lỗ)
    concrete: { T: 2.2, edge: [0.6, 0.58, 0.54], k: 1.0, chip: 0.22, dust: [0.72, 0.7, 0.66], kpa: 120, sk: 1 },
    adobe: { T: 3.2, edge: [0.68, 0.56, 0.4], k: 1.25, chip: 0.55, dust: [0.78, 0.68, 0.52], kpa: 40, sk: 1.25 },
    // đá xây dày 45 cm: đạn súng đục chậm hơn hẳn bê tông 27,5 cm (trước 0,2 ~ ngang bê tông)
    stone: { T: 3.6, edge: [0.58, 0.56, 0.52], k: 0.8, chip: 0.09, dust: [0.7, 0.68, 0.64], kpa: 55, sk: 1 },
    // vách gỗ / tôn: 1 phát 30 mm nổ mảnh toác được cả ô ~20 cm; 12,7 mm cần 2 viên
    // kin: hệ số cỡ lỗ & sức phá kết cấu của ĐẠN ĐỘNG NĂNG (APFSDS xuyên): ván gỗ / tôn mỏng dẻo bị chọc lỗ gọn cỡ thân đạn
    //      rồi đạn bay xuyên, gần như không truyền lực vào khung nhà; tường gạch đá giòn mới bong mảng (thay cho k / sk của nổ)
    wood: { T: 1.4, edge: [0.48, 0.34, 0.2], k: 1.5, chip: 2.0, dust: [0.55, 0.45, 0.32], kpa: 18, sk: 1.6, kin: 0.3 },
    metal: { T: 0.7, edge: [0.4, 0.42, 0.4], k: 1.35, chip: 2.0, dust: [0.6, 0.6, 0.58], kpa: 12, sk: 1.6, kin: 0.25 }
  };
  // XE HÚC TƯỜNG / CỘT TẦNG TRỆT: [lực đổ F (N), năng lượng phá E (J)] cho một mảng ~3,3 x 3,4 m nguyên vẹn (xem
  // VehicleCollision.ramForce = lực kéo bám đất + động lượng tiêu trong ~0,5 s). Vách tôn / ván gỗ: xe tăng tì là rách, xe 4x4
  // 10 tấn phải lao ~6-16 km/h; tường gạch đất 40 cm: xe xích tì ép đổ, xe bánh lốp không phá nổi; tường xây / bê tông ~22 cm:
  // xe tăng 60 tấn cần lao ~15 km/h, pháo tự hành 32 tấn ~38 km/h; tường đá 45 cm ~21 km/h với xe tăng. Cột bê tông ~30 cm nhà
  // thấp tầng: xe tăng ~18-20 km/h húc gãy; cột cao ốc (hp0 lớn, tiết diện tới 0,75 m) gần như không húc nổi. Nhân với độ bền còn lại (modEff) và phần chịu lực của mảng
  // (vách kính sảnh cao ốc vỡ dễ)
  const RAM_WALL = { concrete: [9e5, 6e5], stone: [1.1e6, 8e5], adobe: [4.5e5, 2.5e5], wood: [1.2e5, 6e4], metal: [8e4, 3e4] };
  const RAM_COL = { concrete: [9e5, 7e5], stone: [9e5, 7e5], adobe: [6e5, 3e5], wood: [1.5e5, 8e4], metal: [4e5, 2e5] };
  // ĐÈ XE khi nhà / mảng tường / ô sàn sập: phần máu tối đa mất khi trọn thân xe nằm dưới (nhân phần thân xe trong vùng đổ)
  const CRUSH_PANEL = { concrete: 0.12, stone: 0.14, adobe: 0.08, wood: 0.04, metal: 0.03 };
  // Tác động lên nhà theo loại đạn (đơn vị thế giới, 8 = 1 m):
  //  hole: bán kính lỗ xuyên tường · crater: vành bê tông bóc lở quanh lỗ · soot: muội khói · glass: sóng nổ làm vỡ kính
  //  sp/sr: sức & bán kính phá kết cấu (cột, ô sàn, mái) · chip: đạn nhỏ đục dần từng phát · ric: ngưỡng cos góc chạm thì nảy
  //  exit: đạn động năng xuyên qua nhà, khoét lỗ ra ở vách đối diện · heat: luồng nổ lõm phụt vào trong
  // sd: sức phá KẾT CẤU mỗi phát trúng thẳng (mảng tường bền 1.0 -> nứt toác dần, cột gần điểm trúng nứt theo; xem strain / checkStructure)
  // kg: khối lượng thuốc nổ quy TNT — nổ BÊN TRONG nhà: sóng xung kích + áp suất tích tụ trong phòng kín thổi bật vách (confinedBlast)
  const BLD = {
    // đạn súng: sp đủ để xả tập trung vào nóc / sàn thì băm thủng dần (12.7mm ~180 viên một ô mái bằng, 30mm nổ-mảnh
    // ~20 viên — trước đây 12.7mm không làm hư gì, 30mm ~200 viên do sức nổ dưới ngưỡng tính của blastNear)
    SCOUT_BULLET: { hole: 0, crater: 0.9, chip: 0.34, soot: 0, glass: 1.5, sp: 0.025, sr: 2, kin: true, ric: 0.4, sd: 0.002 },
    GATLING_BULLET: { hole: 0, crater: 1.5, chip: 0.55, soot: 1.8, glass: 4, sp: 0.08, sr: 3, kin: true, ric: 0.36, sd: 0.004 },
    // đạn cháy 30mm: cùng cỡ với đạn 30mm thường (đục kém hơn chút, ám khói nhiều hơn); 12.7mm cháy = 12.7 thường + muội
    INCENDIARY: { hole: 0, crater: 1.4, chip: 0.5, soot: 3.5, glass: 3.5, sp: 0.07, sr: 3, kin: true, ric: 0.36, sd: 0.0035 },
    INCENDIARY_HMG: { hole: 0, crater: 0.9, chip: 0.34, soot: 2, glass: 1.5, sp: 0.025, sr: 2, kin: true, ric: 0.4, sd: 0.002 },
    // 7.62mm súng máy nóc tháp: sức đục / phá kết cấu ~0,3 lần 12.7, vết mẻ nhỏ hơn (~động năng^(1/3)), dễ nảy hơn
    MG762: { hole: 0, crater: 0.6, chip: 0.1, soot: 0, glass: 1, sp: 0.0075, sr: 1.5, kin: true, ric: 0.45, sd: 0.0006 },
    // Cỡ lỗ theo thực tế trên tường bê tông ~27 cm (gạch đất / gỗ / tôn: x WM.k lớn hơn):
    //  APFSDS: lỗ vào ~30 cm, vành bóc lở ~70 cm, mặt sau toác rộng hơn · RPG-7: lỗ ~20 cm, vành ~60 cm
    //  tên lửa chống tăng (đầu nổ kép): lỗ ~35 cm · đạn con DPICM: lỗ ~15 cm
    //  đạn pháo 120 mm đa năng (~1,5 kg thuốc nổ) nổ chạm: lỗ ~0,8 m · nổ mạnh 120 mm (~2,2 kg): lỗ ~1 m, vành ~1,9 m
    AP: { hole: 1.2, crater: 2.8, soot: 0, glass: 10, sp: 0.25, sr: 5, kin: true, ric: 0.24, exit: 1.7, sd: 0.12 },
    RPG: { hole: 0.85, crater: 2.6, soot: 9, glass: 34, sp: 0.5, sr: 10, heat: true, sd: 0.14, kg: 0.4 },
    ANTI_TANK_MISSILE: { hole: 1.4, crater: 3.8, soot: 14, glass: 55, sp: 1.0, sr: 15, heat: true, sd: 0.22, kg: 1.0 },
    // bom con / lựu 40mm: sp 0,32 — ~3 quả rơi trúng mới sập một ô mái bê tông (trước 0,5: 2 quả, một loạt đạn chùm băm
    // nát cả mái nhà; đầu nổ lõm nhỏ chỉ khoét lỗ / bóc lở bản sàn bê tông chứ không phá sập cả ô)
    CLUSTER_SUBMUNITION: { hole: 0.6, crater: 2.2, soot: 8, glass: 28, sp: 0.32, sr: 9, heat: true, sd: 0.08, kg: 0.1 },
    NORMAL: { hole: 3.2, crater: 6, soot: 15, glass: 60, sp: 1.1, sr: 20, sd: 0.28, kg: 1.5 },
    // đạn mẹ chưa tách chạm đất sát nhà: liều phóng nhỏ (xem AMMO.CLUSTER)
    CLUSTER: { hole: 1.4, crater: 3.4, soot: 9, glass: 32, sp: 0.55, sr: 12, sd: 0.12, kg: 0.4 },
    HE: { hole: 4, crater: 7.5, soot: 21, glass: 90, sp: 1.7, sr: 28, sd: 0.34, kg: 2.2 }
  };
  // MẢNH VĂNG BAY XA của vỏ đạn nổ (đơn vị game, 8 = 1 m): fr = tầm còn đủ sức găm rỗ mặt tường, rays = số tia dò
  // (mỗi tia đại diện một chùm mảnh). Ngoài đời đạn 120mm nổ phá rỗ dày tường trong ~10-15 m, lác đác tới ~30 m;
  // lựu pháo 155mm xa hơn nữa. Đầu nổ lõm / bom con ít mảnh, tầm ngắn. Đạn chùm tách vỏ trên không: không có mảnh
  const FRAG = {
    NORMAL: { fr: 240, rays: 220 }, HE: { fr: 280, rays: 280 },
    RPG: { fr: 110, rays: 60 }, ANTI_TANK_MISSILE: { fr: 140, rays: 80 },
    CLUSTER_SUBMUNITION: { fr: 90, rays: 60 }
  };
  function fragInfo(ammo, heavy) {
    const f = FRAG[ammo];
    if (!f) return null;
    return heavy ? { fr: f.fr * 1.6, rays: Math.round(f.rays * 1.8) } : f;
  }
  // Cháy nhà (BuildingSet.heatUp): lượng chất cháy theo kiểu nhà (nhà gỗ cháy cả khung; kho tôn chứa hàng hoá, khung thép;
  // nhà gạch đất / đá: mái gỗ + đồ đạc; nhà bê tông: chỉ đồ đạc) & sức gây cháy của từng loại đạn mỗi phát (1 = bén lửa ngay
  // với nhà gỗ). Đạn cháy 30 mm ~4 phát vào nhà gỗ, 12.7 ~8 phát; một quả nổ trong phòng nhà gỗ gần như bén lửa ngay;
  // nhà bê tông cần vài quả nổ trong phòng. Bom con DPICM có vòng zirconi gây cháy
  const FIRE_LOAD = { wood: 1, metal: 0.55, adobe: 0.45, stone: 0.4, concrete: 0.3 };
  const IGNITE = { INCENDIARY: 0.3, INCENDIARY_HMG: 0.14, CLUSTER_SUBMUNITION: 0.2, HE: 0.4, NORMAL: 0.3, RPG: 0.3, ANTI_TANK_MISSILE: 0.4, CLUSTER: 0.15, AP: 0.04, GATLING_BULLET: 0.04 };
  // Hố nổ trên đống đổ nát nhà đã sập [bán kính, sâu] (đv): gạch đá tơi bị hất như đất (cỡ ~ hố trên đất, rộng hơn chút)
  // Hệ số chịu lực của mảng tường cao ốc khung cột theo kiểu mặt tường (1 = tường chịu lực đầy đủ): mặt dựng kính / vách kính
  // sảnh ~0,2 (chỉ treo vào mép sàn), khung bê tông dải kính 0,45, tủ kính / cửa cuốn ki-ốt 0,35; chung cư tường gạch xây chèn
  // khung bê tông vẫn gánh một phần (mặc định 0,7)
  const TOWER_LB = { office: 0.2, lobby: 0.2, lobbyD: 0.15, lobbyL: 0.2, lobbyLD: 0.15, lobbyU: 0.2, officeB: 0.45, shop: 0.35, shopB: 0.35 };
  const RUBBLE_CRATER = { NORMAL: [8, 3.0], HE: [9, 3.4], CLUSTER: [5, 1.2], CLUSTER_SUBMUNITION: [2.6, 0.9], RPG: [3.6, 1.2],
    ANTI_TANK_MISSILE: [4.6, 1.6], AP: [2.4, 0.8], GATLING_BULLET: [1.3, 0.25], INCENDIARY: [1.2, 0.2] };
  function bldInfo(ammo, heavy) {
    const a = BLD[ammo] || BLD.NORMAL;
    if (!heavy) return a;
    // Pháo 152/155 mm (~6,6-10 kg thuốc nổ): lỗ thủng ~1,8 m, vành bóc lở ~3 m, phá cả cột / ô sàn quanh điểm nổ
    // (thống nhất theo HEAVY_K: cỡ lỗ / vành / tầm vỡ kính / tầm phá kết cấu ~ W^(1/3), sức phá ~ W^(2/3), thuốc nổ x3)
    const r = HEAVY_K.radius, p = HEAVY_K.power;
    return Object.assign({}, a, { hole: a.hole * r * 1.2, crater: a.crater * r, soot: a.soot * r, glass: a.glass * r, sp: a.sp * p, sr: a.sr * r, sd: a.sd * p, kg: (a.kg || 0) * HEAVY_K.charge });
  }
  // Vết lỗ đạn pháo trên mái ngói (vẽ thủ tục, xám -> nhuộm theo màu mái): lòng lỗ đen lởm chởm lộ vài thanh mè, vành ngói
  // vỡ lệch, quầng muội nổ loang quanh lỗ
  let ROOF_HOLE_TEX = null;
  // Ống / máng tôn kẽm cũ (nhuộm instanceColor: kẽm xám, sơn nâu / trắng đã phai): loang gỉ, mối nối từng đoạn ~1 m sẫm gỉ
  // chảy xuống, mặt ống bạc màu không đều. Ảnh dọc theo trục Y của khối đơn vị (ống đứng: dọc ống)
  function pipeTex() {
    return canvasTex('pipeRust', 32, 128, (g, w, h) => {
      g.fillStyle = '#d4d6d2'; g.fillRect(0, 0, w, h);
      const sh = g.createLinearGradient(0, 0, w, 0);
      sh.addColorStop(0, 'rgba(40,40,38,0.25)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(40,40,38,0.3)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        g.fillStyle = 'rgba(70,46,26,0.55)'; g.fillRect(0, y, w, 3);
        const r = g.createLinearGradient(0, y + 3, 0, y + 3 + 10 + RNG() * 14);
        r.addColorStop(0, 'rgba(120,66,30,0.5)'); r.addColorStop(1, 'rgba(120,66,30,0)');
        g.fillStyle = r; g.fillRect(RNG() * 8, y + 3, 10 + RNG() * 14, 24);
      }
      speckle(g, w, h, 160, ['rgba(130,72,32,0.35)', 'rgba(80,50,28,0.3)', 'rgba(240,240,232,0.15)'], 1, 4);
    }, true);
  }
  // Vệt ố nước mưa trên tường sau ống thoát nước (trong suốt): dải nâu sẫm rộng hẹp không đều, đậm ở mối nối rò, lặp liền theo
  // chiều dọc (mỗi tầng 1 tấm). foot: tấm tầng trệt — vệt loe rộng & đậm dần xuống chân tường, bùn đất hắt lên
  function pipeStainTex(foot) {
    return canvasTex(foot ? 'pipeStainFoot' : 'pipeStain', 64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      if ('filter' in g) g.filter = 'blur(1.2px)';
      for (let i = 0; i < 7; i++) {
        const cx = w / 2 + (RNG() - 0.5) * 34, sw = 5 + RNG() * 12, a = 0.16 + RNG() * 0.22;
        const y0 = foot ? RNG() * h * 0.3 : 0;
        const gr = g.createLinearGradient(0, y0, 0, h);
        gr.addColorStop(0, `rgba(52,40,28,${a})`); gr.addColorStop(1, `rgba(52,40,28,${foot ? Math.min(0.9, a * 1.8) : a})`);
        g.fillStyle = gr; g.fillRect(cx - sw / 2, y0, sw, h - y0);
      }
      // mối nối rò: loang gỉ quanh 1 điểm rồi chảy xuống
      for (let k = 0; k < 2; k++) {
        const y = 30 + RNG() * (h - 90), cx = w / 2 + (RNG() - 0.5) * 24;
        const r = g.createRadialGradient(cx, y, 0, cx, y, 14);
        r.addColorStop(0, 'rgba(110,62,28,0.6)'); r.addColorStop(1, 'rgba(110,62,28,0)');
        g.fillStyle = r; g.fillRect(cx - 14, y - 14, 28, 28);
        const d = g.createLinearGradient(0, y, 0, y + 70);
        d.addColorStop(0, 'rgba(100,60,30,0.5)'); d.addColorStop(1, 'rgba(100,60,30,0)');
        g.fillStyle = d; g.fillRect(cx - 4, y, 8, 70);
      }
      if (foot) {
        // chân tường: nước xối từ miệng ống hắt bùn, rêu xanh đen loe hình quạt
        const f = g.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.55);
        f.addColorStop(0, 'rgba(32,36,22,0.9)'); f.addColorStop(0.6, 'rgba(44,44,28,0.55)'); f.addColorStop(1, 'rgba(48,46,30,0)');
        g.fillStyle = f; g.fillRect(0, h - w * 0.6, w, w * 0.6);
      }
      if ('filter' in g) g.filter = 'none';
    }, false);
  }
  // Mảng đất ẩm sẫm + rêu dưới miệng ống thoát nước (trong suốt, mép loang)
  function wetPatchTex() {
    return canvasTex('pipeWet', 64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        const x = w / 2 + (RNG() - 0.5) * 20, y = h / 2 + (RNG() - 0.5) * 20, r = 10 + RNG() * 14;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, i % 3 ? 'rgba(30,28,20,0.6)' : 'rgba(34,48,22,0.6)'); gr.addColorStop(1, 'rgba(30,28,20,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, false);
  }
  function roofHoleTex() {
    if (ROOF_HOLE_TEX || typeof document === 'undefined') return ROOF_HOLE_TEX;
    const S = 256, c = S / 2, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    let sd = 7919;
    const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const gr = g.createRadialGradient(c, c, 30, c, c, c);
    gr.addColorStop(0, 'rgba(10,9,8,0.85)'); gr.addColorStop(0.55, 'rgba(18,16,14,0.45)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // vành ngói vỡ: mảnh ngói xô lệch, sáng tối khác nhau
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.283, d = 46 + r() * 34, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d, w = 6 + r() * 12, h = 4 + r() * 8;
      const v = Math.floor(70 + r() * 90);
      g.save(); g.translate(x, y); g.rotate(a + (r() - 0.5) * 0.8);
      g.fillStyle = `rgba(${v},${v},${v},${0.55 + r() * 0.45})`; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-w / 2, h / 2 - 1.5, w, 1.5);
      g.restore();
    }
    // lòng lỗ đen lởm chởm
    g.fillStyle = 'rgba(8,7,6,1)'; g.beginPath();
    for (let i = 0; i <= 28; i++) { const a = i / 28 * 6.283, d = 34 + r() * 22; const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fill();
    // thanh mè gỗ còn vắt ngang lỗ (một thanh gãy)
    g.strokeStyle = 'rgba(70,58,46,1)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(c - 52, c - 14); g.lineTo(c + 50, c - 18); g.stroke();
    g.beginPath(); g.moveTo(c - 50, c + 20); g.lineTo(c - 6, c + 26); g.stroke();
    g.beginPath(); g.moveTo(c + 10, c + 34); g.lineTo(c + 48, c + 22); g.stroke();
    ROOF_HOLE_TEX = new THREE.CanvasTexture(cv);
    if ('colorSpace' in ROOF_HOLE_TEX && THREE.SRGBColorSpace) ROOF_HOLE_TEX.colorSpace = THREE.SRGBColorSpace;
    return ROOF_HOLE_TEX;
  }
  const hash3 = (x, y, s) => { const k = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return k - Math.floor(k); };
  // Nhiễu méo viền lỗ theo góc, dùng chung cho mọi mảng của cùng một phát -> lỗ liền mạch qua mép 2 mảng kề nhau
  function holeNoise() {
    const h = [2, 3, 5, 7].map(k => ({ k, a: rand(0.04, 0.15) * (k > 4 ? 0.6 : 1), p: rand(0, 6.283) }));
    return a => { let s = 0; for (const q of h) s += q.a * Math.sin(q.k * a + q.p); return s; };
  }
  const NO_NOISE = () => 0;
  // Ô kính vỡ: lòng phòng tối, mảnh kính lởm chởm còn bám khung, vệt muội phía trên ô cửa
  // Ô cửa (lỗ mở kính) trên texture mảng tường 128x128 theo kiểu mặt tường: [x, y, rộng, cao] (px, gốc trên-trái).
  // Dùng chung cho texture kính vỡ và lưới mảng tường bị khoét (vùng ô cửa là lỗ mở, không có bê tông để bóc lở)
  const WIN_RECTS = { office: [[6, 14, 116, 98]], adobe: [[48, 40, 32, 34]], stone: [[46, 38, 36, 40]], wood: [[40, 40, 48, 38]], metal: [], hangarDoor: [],
    shop: [[11, 50, 106, 68]], shopB: [[8, 96, 112, 24]], officeB: [[3, 33, 39, 52], [45, 33, 39, 52], [87, 33, 41, 52]],
    aptB: [[28, 28, 30, 74], [64, 32, 38, 46]], aptC: [[16, 30, 24, 56], [52, 30, 24, 56], [88, 30, 24, 56]],
    tube: [[33, 26, 62, 76]], side: [], tubeB: [[29, 33, 34, 48], [65, 33, 34, 48]], apt: [[38, 34, 25, 46], [65, 34, 25, 46]],
    lobby: [[11, 26, 106, 90]], lobbyD: [[11, 26, 106, 90]], lobbyU: [[11, 26, 106, 102]], lobbyL: [[11, 4, 106, 112]], lobbyLD: [[11, 4, 106, 112]] };
  const winRects = style => WIN_RECTS[style] || WIN_RECTS.apt;
  // Cửa kính vỡ: ô cửa toang lộ phòng tối, kính còn sót ở khung là các mảnh nhọn sắc chĩa vào giữa (to nhất ở góc khung,
  // nơi kính bị kẹp chặt), mặt kính trong ngả xanh, mép sáng loé; khung sẫm muội bụi phía trên. Kèm bản đồ độ nhám riêng
  // (brokenWindowRough): mảnh kính bóng như kính, phòng tối & mặt tường vẫn nhám -> không còn trông như mảnh vữa xám đục
  // v: kiểu vỡ — 0 vỡ toang còn mảnh nhọn kẹp khung, 1 thủng sạch (rèm lá sách / rèm vải treo lủng lẳng, muội đậm),
  // 2 kính rạn mạng nhện còn bám khung, thủng một lỗ. Mỗi mảng tường chọn kiểu theo vị trí (shatter) -> mặt tiền không vỡ đồng loạt
  function brokenWindowTex(style, v = 0) {
    const vk = v ? '_' + v : '';
    return canvasTex('winBroken_' + style + vk, 128, 128, (g, w, h) => {
      g.drawImage(windowPanelTex(style).image, 0, 0);
      const rc = document.createElement('canvas'); rc.width = w; rc.height = h;
      const r = rc.getContext('2d');
      r.fillStyle = 'rgb(230,230,230)'; r.fillRect(0, 0, w, h);
      const rects = winRects(style);
      // một mảnh nhọn: chân rộng bám mép khung tại (px, py), mũi chĩa theo (dx, dy) dài L
      const shard = (px, py, dx, dy, L, bw) => {
        const tx = -dy, ty = dx, sk = rand(-0.35, 0.35);
        const pts = [[px - tx * bw, py - ty * bw], [px + tx * bw, py + ty * bw], [px + (dx + tx * sk) * L, py + (dy + ty * sk) * L]];
        const gr = g.createLinearGradient(px, py, px + dx * L, py + dy * L);
        gr.addColorStop(0, 'rgba(150,178,186,0.92)'); gr.addColorStop(1, 'rgba(96,122,132,0.75)');
        g.fillStyle = gr;
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
        // mép gãy loé sáng một cạnh, cạnh kia tối (bề dày kính bắt sáng)
        g.lineWidth = 0.8;
        g.strokeStyle = 'rgba(235,248,252,0.95)'; g.beginPath(); g.moveTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.stroke();
        g.strokeStyle = 'rgba(40,52,58,0.7)'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[2][0], pts[2][1]); g.stroke();
        r.fillStyle = 'rgb(18,18,18)';
        r.beginPath(); pts.forEach(([x, y], i) => i ? r.lineTo(x, y) : r.moveTo(x, y)); r.closePath(); r.fill();
      };
      for (const [x, y, rw, rh] of rects) {
        // phòng tối phía sau, sáng dần về phía cửa (ánh trời hắt vào)
        const gi = g.createLinearGradient(0, y, 0, y + rh);
        gi.addColorStop(0, '#0f0e0c'); gi.addColorStop(1, '#262320');
        g.fillStyle = gi; g.fillRect(x, y, rw, rh);
        r.fillStyle = 'rgb(255,255,255)'; r.fillRect(x, y, rw, rh);
        if (v === 1) {
          // rèm lá sách bung khỏi ray: các lá xệ chéo một đầu; hoặc mảnh rèm vải rách treo một bên
          if (RNG() < 0.6) {
            const tilt = rand(-0.5, 0.5), nS = Math.floor(rh * rand(0.3, 0.75) / 2.4);
            for (let k = 0; k < nS; k++) {
              const yy = y + 2 + k * 2.4 + k * k * 0.04, x0 = x + rand(0, 0.15) * rw, x1 = x + rw * (1 - rand(0, 0.35)), c = 185 + rand(-20, 20) | 0;
              g.strokeStyle = 'rgba(' + (c + 12) + ',' + (c + 8) + ',' + c + ',0.85)'; g.lineWidth = 1.1;
              g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy + (x1 - x0) * tilt * (0.3 + k / nS)); g.stroke();
            }
          } else {
            const sd = RNG() < 0.5, cw = rw * rand(0.2, 0.45), cx0 = sd ? x : x + rw - cw;
            g.fillStyle = ['rgba(150,120,90,0.9)', 'rgba(120,130,140,0.9)', 'rgba(170,160,140,0.9)'][Math.floor(RNG() * 3)];
            g.beginPath(); g.moveTo(cx0, y); g.lineTo(cx0 + cw, y);
            for (let q = 0; q <= 6; q++) g.lineTo(cx0 + cw * (1 - q / 6) + rand(-2, 2), y + rh * rand(0.55, 0.95));
            g.closePath(); g.fill();
          }
          for (let k = 0; k < 2; k++) {
            const side = Math.floor(RNG() * 4), horiz = side < 2, len = horiz ? rh : rw;
            const px = horiz ? x + rand(0.05, 0.95) * rw : (side === 2 ? x : x + rw), py = horiz ? (side === 0 ? y : y + rh) : y + rand(0.05, 0.95) * rh;
            const dx = horiz ? 0 : (side === 2 ? 1 : -1), dy = horiz ? (side === 0 ? 1 : -1) : 0;
            shard(px, py, dx, dy, rand(0.08, 0.2) * len, rand(1, 2.5));
          }
          // muội đen loang lên trên đầu cửa (lửa / khí nổ phụt ra)
          const gs = g.createLinearGradient(0, y - 34, 0, y + rh * 0.3);
          gs.addColorStop(0, 'rgba(14,12,10,0)'); gs.addColorStop(1, 'rgba(14,12,10,0.8)');
          g.fillStyle = gs; g.fillRect(x - 6, y - 34, rw + 12, 34 + rh * 0.3);
          continue;
        }
        if (v === 2) {
          // kính còn nguyên tấm nhưng rạn mạng nhện quanh điểm vỡ, thủng một lỗ lởm chởm
          g.fillStyle = 'rgba(112,138,148,0.88)'; g.fillRect(x, y, rw, rh);
          r.fillStyle = 'rgb(30,30,30)'; r.fillRect(x, y, rw, rh);
          const ix = x + rw * rand(0.25, 0.75), iy = y + rh * rand(0.25, 0.75), hr = Math.min(rw, rh) * rand(0.12, 0.3);
          const hole = [];
          for (let q = 0; q < 9; q++) { const a = q / 9 * 6.283 + rand(-0.2, 0.2), rr = hr * rand(0.5, 1.2); hole.push([ix + Math.cos(a) * rr, iy + Math.sin(a) * rr]); }
          const gi2 = g.createLinearGradient(0, y, 0, y + rh); gi2.addColorStop(0, '#0f0e0c'); gi2.addColorStop(1, '#262320');
          g.fillStyle = gi2; g.beginPath(); hole.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill();
          r.fillStyle = 'rgb(255,255,255)'; r.beginPath(); hole.forEach(([px, py], i) => i ? r.lineTo(px, py) : r.moveTo(px, py)); r.closePath(); r.fill();
          g.save(); g.beginPath(); g.rect(x, y, rw, rh); g.clip();
          g.strokeStyle = 'rgba(230,244,248,0.75)'; g.lineWidth = 0.6;
          const nr = 9 + Math.floor(RNG() * 5), ang = [];
          for (let q = 0; q < nr; q++) {
            const a = q / nr * 6.283 + rand(-0.25, 0.25); ang.push(a);
            g.beginPath(); g.moveTo(ix + Math.cos(a) * hr * 0.8, iy + Math.sin(a) * hr * 0.8);
            for (let t = 1; t <= 4; t++) { const d = hr + Math.max(rw, rh) * t / 4, b = a + rand(-0.06, 0.06); g.lineTo(ix + Math.cos(b) * d, iy + Math.sin(b) * d); }
            g.stroke();
          }
          g.strokeStyle = 'rgba(220,236,242,0.45)';
          for (let ring = 1; ring <= 3; ring++) {
            const d = hr * (1 + ring * 0.9);
            g.beginPath(); ang.forEach((a, i) => { const px = ix + Math.cos(a) * d * rand(0.85, 1.15), py = iy + Math.sin(a) * d * rand(0.85, 1.15); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.stroke();
          }
          g.restore();
          continue;
        }
        // mảnh lớn kẹp ở góc khung (tam giác vuông bám 2 cạnh), mỗi ô 1-2 góc
        const corners = [[x, y, 1, 1], [x + rw, y, -1, 1], [x + rw, y + rh, -1, -1], [x, y + rh, 1, -1]];
        for (let k = 0, nc = 1 + Math.floor(RNG() * 2); k < nc; k++) {
          const [cx, cy, sx, sy] = corners[Math.floor(RNG() * 4)];
          const a = rand(0.25, 0.6) * rw, bb = rand(0.2, 0.5) * rh;
          const pts = [[cx, cy], [cx + sx * a, cy], [cx + sx * a * rand(0.1, 0.4), cy + sy * bb * rand(0.3, 0.6)], [cx, cy + sy * bb]];
          const gr = g.createLinearGradient(cx, cy, cx + sx * a, cy + sy * bb);
          gr.addColorStop(0, 'rgba(160,186,194,0.92)'); gr.addColorStop(1, 'rgba(104,130,140,0.78)');
          g.fillStyle = gr; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(235,248,252,0.9)'; g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.lineTo(pts[3][0], pts[3][1]); g.stroke();
          // vết rạn trên mảnh còn kẹp
          g.strokeStyle = 'rgba(225,240,245,0.55)'; g.lineWidth = 0.5;
          for (let q = 0; q < 2; q++) { g.beginPath(); g.moveTo(cx + sx * a * rand(0.1, 0.5), cy); g.lineTo(cx + sx * a * rand(0, 0.3), cy + sy * bb * rand(0.3, 0.7)); g.stroke(); }
          r.fillStyle = 'rgb(18,18,18)'; r.beginPath(); pts.forEach(([px, py], i) => i ? r.lineTo(px, py) : r.moveTo(px, py)); r.closePath(); r.fill();
        }
        // mảnh nhọn dọc 4 cạnh khung, dồn về gần góc
        for (let k = 0; k < 7; k++) {
          const side = Math.floor(RNG() * 4), t = RNG() < 0.6 ? (RNG() < 0.5 ? rand(0.05, 0.3) : rand(0.7, 0.95)) : rand(0.3, 0.7);
          const horiz = side < 2, len = horiz ? rh : rw;
          const px = horiz ? x + t * rw : (side === 2 ? x : x + rw), py = horiz ? (side === 0 ? y : y + rh) : y + t * rh;
          const dx = horiz ? rand(-0.25, 0.25) : (side === 2 ? 1 : -1), dy = horiz ? (side === 0 ? 1 : -1) : rand(-0.25, 0.25);
          const dl = Math.hypot(dx, dy);
          shard(px, py, dx / dl, dy / dl, rand(0.12, 0.42) * len, rand(1.5, 4));
        }
        // muội bụi trên đầu khung (khí nổ phụt qua cửa)
        const gr = g.createLinearGradient(0, y - 22, 0, y + 4);
        gr.addColorStop(0, 'rgba(20,18,16,0)'); gr.addColorStop(1, 'rgba(20,18,16,0.55)');
        g.fillStyle = gr; g.fillRect(x - 4, y - 22, rw + 8, 26);
      }
      if (style === 'metal') speckle(g, w, h, 60, ['rgba(20,20,20,0.6)'], 2, 4);
      const rt = new THREE.CanvasTexture(rc);
      rt.anisotropy = 4;
      TEX['winBrokenR_' + style + vk] = rt;
    });
  }
  function brokenWindowRough(style, v = 0) { brokenWindowTex(style, v); return TEX['winBrokenR_' + style + (v ? '_' + v : '')] || null; }
  // Đá vụn văng theo hướng (pháp tuyến mặt tường): n mảnh, cỡ sz, tốc độ sp
  function jet(fx, x, y, z, nx, ny, nz, n, sz, sp, col, spread) {
    if (!fx || !fx.hardRocks) return;
    const s = spread === undefined ? 0.7 : spread;
    for (let i = 0; i < n; i++) {
      const v = sp * rand(0.35, 1);
      fx.hardRocks.add({ x: x + rand(-1.5, 1.5), y: y + rand(-1.5, 1.5), z: z + rand(-1.5, 1.5),
        vx: (nx + rand(-s, s)) * v, vy: (ny + rand(-s * 0.4, s)) * v + rand(4, 20), vz: (nz + rand(-s, s)) * v,
        size: rand(sz * 0.25, sz * 0.7), life: rand(3, 6), c: col || [0.47, 0.46, 0.43] });
    }
  }
  function dustJet(fx, x, y, z, nx, nz, n, size, col, sp) {
    if (!fx || !fx.smoke) return;
    const [wx, wz] = dustDrift();
    for (let i = 0; i < n; i++) {
      const v = (sp || 20) * rand(0.4, 1);
      fx.smoke.add({ x: x + rand(-1, 1) * size * 0.3, y: y + rand(-0.3, 0.5) * size * 0.3, z: z + rand(-1, 1) * size * 0.3,
        vx: nx * v + rand(-5, 5), vy: rand(2, 12), vz: nz * v + rand(-5, 5), size: size * rand(0.5, 0.9), grow: size * 0.32,
        drag: 1.6, grav: -0.5, life: rand(3, 6) * 1.5, alpha: 0.55, fadeIn: 0.06, fadePow: 1.6, ax: wx, az: wz, c0: col || [0.7, 0.68, 0.64], cell: 2 });
    }
  }

  // ---- CHI TIẾT MÁI BẰNG: kiểu nhà có chi tiết, màu, hình học dùng chung ----
  const DECO_KINDS = { tube: 1, shop: 1, apartment: 1, office: 1, mudbrick: 1 };
  const DECO_STEEL = 0x4c4f52, DECO_DOOR = 0x55606a, DECO_ROD = 0x9a9ea2, DECO_DISH = 0xd6d6d2, DECO_AC = 0xe4e4df;
  // Chảo vệ tinh cả bản đồ quay cùng một hướng trời (cùng một vệ tinh)
  const DISH_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();
  // Mặt trước cục nóng điều hòa: lưới quạt tròn + dàn tản nhiệt; góc trên phải trơn cho các mặt bên / nóc
  function acUnitTex() {
    return canvasTex('acUnit', 64, 64, (g, w, h) => {
      g.fillStyle = '#d4d5d0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3e403f'; g.beginPath(); g.arc(24, 30, 19, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(200,200,195,0.55)'; g.lineWidth = 1;
      for (let r = 4; r < 19; r += 3.5) { g.beginPath(); g.arc(24, 30, r, 0, 6.3); g.stroke(); }
      g.beginPath(); g.moveTo(5, 30); g.lineTo(43, 30); g.moveTo(24, 11); g.lineTo(24, 49); g.stroke();
      g.fillStyle = 'rgba(60,62,60,0.5)';
      for (let x = 48; x < 61; x += 2) g.fillRect(x, 12, 1, 38);
      const gr = g.createLinearGradient(0, 46, 0, 64);
      gr.addColorStop(0, 'rgba(70,64,54,0)'); gr.addColorStop(1, 'rgba(70,64,54,0.45)');
      g.fillStyle = gr; g.fillRect(0, 46, w, 18);
      g.fillStyle = '#cfd0cb'; g.fillRect(54, 0, 10, 9);
    });
  }
  function acUnitGeo() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const uv = g.attributes.uv;
    // mặt +z (thứ 5) giữ cả texture, các mặt còn lại lấy vùng trơn
    for (let i = 0; i < uv.count; i++) if (i < 16 || i >= 20) uv.setXY(i, 0.92, 0.94);
    return g;
  }
  // Bồn nước inox: thân trụ có 2 đai gân, đáy bo, nắp vòm (trục Y, cao 1, đường kính 1)
  function tankGeo() {
    const p = [[0, -0.5], [0.4, -0.5], [0.48, -0.47], [0.5, -0.42], [0.5, -0.2], [0.516, -0.18], [0.5, -0.16], [0.5, 0.16], [0.516, 0.18],
      [0.5, 0.2], [0.5, 0.38], [0.45, 0.45], [0.32, 0.49], [0.12, 0.51], [0, 0.51]];
    return new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  }
  // Chảo vệ tinh: chỏm cầu nông, lòng chảo quay lên +Y, đường kính ~1
  function dishGeo() {
    const g = new THREE.SphereGeometry(1, 14, 3, 0, Math.PI * 2, 0, 0.55);
    g.scale(0.96, -0.96, 0.96); g.translate(0, 0.96, 0);
    g.computeVertexNormals();
    return g;
  }

  const SEG_CELL = 120;   // ô lưới dò đoạn bay ↔ nhà (đv)
  // đóng băng bể nhà theo ô (BuildingSet.freezeStatic): cạnh ô (đv) và tổng tam giác tối thiểu của bể để đáng chia
  // (mỗi ô thêm 1 lượt vẽ khi ở trong tầm: ô quá nhỏ / bể quá nhỏ thì tốn CPU gửi lệnh hơn phần GPU tiết kiệm được)
  const BLD_FREEZE_CELL = 1400, BLD_FREEZE_TRIS = 60000;
  class BuildingSet {
    constructor(parent, list, groundAt, opts = {}) {
      this.group = new THREE.Group();
      this.group.name = 'buildings';
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.anim = [];
      this.vents = [];
      let slabs = 0, cols = 0, roofs = 0, roofMid = 0, decos = 0;
      const gableN = {};   // số ô mái dốc theo kiểu đầu hồi / mái (gableKind): [ô đầu, ô giữa]
      let pipeN = 0, stainN = 0, footN = 0, pitchedN = 0;   // máng xối / ống thoát nước / vệt ố nhà mái dốc (eaveDeco)
      const plans = list.map(b => {
        const st = STYLE[b.kind] || STYLE.apartment;
        const bx = Math.max(1, Math.round(b.w / st.bay)), bz = Math.max(1, Math.round(b.d / st.bay));
        const floors = b.kind === 'hangar' ? 1 : Math.max(1, b.floors | 0);
        slabs += (floors + 1) * bx * bz + 2;
        cols += 4 * floors + (bx > 2 && bz > 2 ? floors * 4 : 0);
        // cao ốc khung cột (buildOne): cột biên mỗi 2 khoang + 4 vách lõi thang mỗi tầng
        if ((b.kind === 'office' || b.kind === 'apartment') && floors >= 8 && !st.ruined) cols += floors * (2 * Math.floor((bx - 1) / 2) + 2 * Math.floor((bz - 1) / 2) + 4);
        roofs += 1;
        roofMid += Math.max(0, bx - 2);   // ô mái giữa (mái dốc / vòm chia ô theo khoang, xem buildOne)
        if (st.roof === 'pitched') { pitchedN++; const gk = gableKind(st); gableN[gk] = gableN[gk] || [0, 0]; gableN[gk][0]++; gableN[gk][1] += Math.max(0, bx - 2); }
        if (st.roof === 'pitched' && !st.ruined) { pipeN += 2 * bx + 8 + 4 * (floors + 2); stainN += 4 * floors; footN += 4; cols += 6; }
        // chi tiết mái bằng: tường chắn mái / tum / chân bồn dùng chung bể cột (không thêm draw call)
        if (DECO_KINDS[b.kind] && st.roof === 'flat' && !st.ruined) { decos++; cols += 2 * (bx + bz) + 32 + (b.kind === 'apartment' || b.kind === 'office' ? 4 * (bx + bz) : 0); }
        // Mẫu mặt tường tầng trệt / tầng trên: chọn theo vị trí nhà (không lấy số RNG chung -> mọi máy dựng giống nhau)
        const pickT = (arr, s) => arr ? arr[Math.floor(hash3(b.x * 0.013, b.z * 0.017, s) * arr.length) % arr.length] : null;
        let gT = pickT(st.ground, 3) || st.tex, uT = pickT(st.upper, 5) || gT, door = null;
        // CAO ỐC (từ 8 tầng): tầng trệt riêng — văn phòng là sảnh kính ốp đá, chung cư là dãy ki-ốt / cửa cuốn hoặc sảnh — thay
        // vì lặp mẫu cửa sổ tầng trên xuống sát mặt đường. Lối vào sảnh: 1-2 khoang giữa một mặt dài (mẫu khoang cửa 'lobbyD')
        if ((b.kind === 'office' || b.kind === 'apartment') && floors >= 8) {
          uT = gT;
          // chung cư: dãy shophouse / ki-ốt (cửa mở có mái hiên xen cửa cuốn kéo xuống, chọn từng khoang) + 1 khoang sảnh vào nhà
          gT = b.kind === 'office' ? 'lobby' : 'shop';
          cols += 2 * (bx + bz) + 16;   // gờ chân đế, mái che sảnh, bồn cây (baseDeco)
          {
            // nhà có khuôn viên (b.yard): sảnh quay ra sân trước (mặt -z cục bộ, phía mép lô)
            const along = b.yard ? true : bx >= bz, L = along ? bx : bz, n = b.kind === 'office' && L >= 4 ? 2 : 1;
            door = { along, s: b.yard ? -1 : hash3(b.x * 0.021, b.z * 0.019, 11) < 0.5 ? -1 : 1, i0: Math.floor((L - n) / 2), n };
          }
        }
        // văn phòng cao ốc: sảnh cao 2 tầng (tầng trệt 'lobbyL' + tầng 2 'lobbyU' liền một vách kính, gờ chân đế ngang sàn tầng 3)
        const pod = b.kind === 'office' && gT === 'lobby' ? 2 : 1, shopMix = b.kind === 'apartment' && gT === 'shop';
        if (pod > 1) gT = 'lobbyL';
        if (door) door.key = pod > 1 ? 'lobbyLD' : 'lobbyD';
        return { b, st, bx, bz, floors, gT, uT: floors > 1 ? uT : gT, door, pod, shopMix };
      });
      const unit = new THREE.BoxGeometry(1, 1, 1);
      const cracked = new THREE.MeshStandardMaterial({ map: crackedTex(), roughness: 0.95 });
      // Mỗi kiểu mặt tường: khối nguyên / kính vỡ (instanced) + vật liệu lưới ô của mảng đã trúng đạn (màu theo đỉnh)
      this.panelKits = {};
      this.dmgMats = {};
      const counts = {};
      const dmgKeys = new Set();
      for (const p of plans) {
        // Nhà ống: 2 mặt hẹp là mặt tiền / mặt hậu, 2 vách hông dài là tường kín ('side')
        const per = p.st.sideTex ? 2 * Math.min(p.bx, p.bz) : 2 * (p.bx + p.bz), up = p.uT !== p.gT ? p.floors - 1 : 0;
        if (p.st.sideTex) counts[p.st.sideTex] = (counts[p.st.sideTex] || 0) + 2 * Math.max(p.bx, p.bz) * p.floors;
        counts[p.gT] = (counts[p.gT] || 0) + per * (p.floors - up);
        if (up) counts[p.uT] = (counts[p.uT] || 0) + per * up;
        if (p.door) counts[p.door.key] = (counts[p.door.key] || 0) + p.door.n;
        if (p.pod > 1) counts.lobbyU = (counts.lobbyU || 0) + per;
        if (p.shopMix) counts.shopB = (counts.shopB || 0) + per;
        // mọi kiểu mặt tường của nhà này (trừ vách hông kín) -> các ô atlas của lưới mảng vỡ
        p.styles = [p.gT];
        for (const k of [up ? p.uT : null, p.door && p.door.key, p.pod > 1 ? 'lobbyU' : null, p.shopMix ? 'shopB' : null]) if (k && !p.styles.includes(k)) p.styles.push(k);
        p.dmgKey = p.styles.join('|');
        dmgKeys.add(p.dmgKey);
      }
      const glassy = k => k === 'office' || k === 'officeB';
      // Phong hoá: ảnh lưới chân / đỉnh nhà (điền sau khi dựng nhà, xem buildGrimeInfo) dùng chung cho mọi vật liệu nhà
      this.grimeU = BLD_INFO;
      for (const k of ['uBld', 'uBldOcc', 'uBldEdge']) { if (BLD_INFO[k].value) BLD_INFO[k].value.dispose(); BLD_INFO[k].value = null; }
      BLD_INFO.uBldGrid.value.set(0, 0, 0, 0);
      const wk = k => this.weatherOpt(k);
      for (const key in counts) {
        // normal map (mạch gạch / vân gỗ / sóng tôn / hạt vữa nổi dưới nắng) + roughness map (kính bóng, tường nhám)
        const sm = panelSurfaceMaps(key);
        const mat = new THREE.MeshStandardMaterial({ map: windowPanelTex(key), roughness: sm ? 1 : key === 'office' ? 0.35 : key === 'officeB' ? 0.6 : 0.9, metalness: key === 'office' ? 0.4 : key === 'officeB' ? 0.15 : key === 'metal' || key === 'hangarDoor' ? 0.2 : 0.02,
          normalMap: sm ? sm.normal : null, roughnessMap: sm ? sm.rough : null });
        if (sm) mat.normalScale.set(0.9, 0.9);
        const shatterMat = [0, 1, 2].map(v => {
          const sMat = new THREE.MeshStandardMaterial({ map: brokenWindowTex(key, v), roughness: 0.9, roughnessMap: brokenWindowRough(key, v), metalness: key === 'metal' || key === 'hangarDoor' ? 0.2 : 0.04, normalMap: sm ? sm.normal : null });
          if (sm) sMat.normalScale.set(0.9, 0.9);
          return facadeGrime(sMat, wk(key).amt, wk(key));
        });
        facadeGlass(facadeGrime(mat, wk(key).amt, wk(key)), key);
        this.panelKits[key] = new FractureKit(this.group, mat, cracked, counts[key], { variants: 1, shatterMat, panelGeo: reliefPanelGeo(key) });
        this.panelKits[key].styleKey = key;   // kiểu mặt tiền -> vị trí ô cửa (RELIEF) cho vết mảnh văng
      }
      // Lưới mảng vỡ gộp cả nhà chung 1 vật liệu: nhà có tầng trệt khác tầng trên dùng atlas 2 nửa (xem atlasTex / panelGeo)
      for (const key of dmgKeys) {
        const ks = key.split('|'), gk = ks[0];
        this.dmgMats[key] = new THREE.MeshStandardMaterial({ map: ks.length > 1 ? atlasTex(...ks) : brokenWindowTex(gk), vertexColors: true, roughness: glassy(gk) ? 0.6 : 0.92, metalness: gk === 'metal' || gk === 'hangarDoor' ? 0.2 : 0.02 });
        facadeGrime(this.dmgMats[key], wk(gk).amt, wk(gk));
      }
      const concW = { U: this.grimeU, moss: 0.7 };
      this.slabPool = new Pool(this.group, unit, facadeGrime(new THREE.MeshStandardMaterial({ map: slabTex(), roughness: 0.92 }), 0.9, concW), slabs, { color: true });
      this.basePool = new Pool(this.group, unit, new THREE.MeshStandardMaterial({ map: slabTex(), roughness: 0.92 }), plans.length, { color: true });
      this.colPool = new Pool(this.group, unit, facadeGrime(new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }), 0.9, concW), cols, { color: true });
      // Mái dốc thật (chìa mái, dày mái, bờ nóc, đầu hồi là tường) + vòm nhà kho có vách đầu hồi; ngói / tôn trải theo mét thật
      const rep = t => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; };
      const roofMat = roofSag(roofGrime(worldUV(new THREE.MeshStandardMaterial({ map: roofTileTex(), roughness: 0.8 }), 'slope', 16)));
      const metalMap = rep(windowPanelTex('metal')), sm = panelSurfaceMaps('metal');
      const metalN = sm ? rep(sm.normal) : null;
      // Đầu hồi cùng vật liệu với tường nhà (trước đây mọi nhà mái dốc chung 1 tường hồi trát vữa be — kho tôn, nhà gỗ, nhà
      // đá cũng vậy) + nhà kho tôn lợp mái tôn thay vì ngói nhuộm xám. Đầu hồi nằm cao trên mái chìa, không dùng ảnh lưới
      // độ cao nhà (inB = 0: bỏ ẩm chân tường / dải bẩn dưới mép mái, giữ loang, vệt mưa, rêu, bong vữa, gỉ)
      const gableMats = {
        plaster: () => facadeGrime(noInstanceColor(worldUV(new THREE.MeshStandardMaterial({ map: concreteTex(), color: 0xd8cdb6, roughness: 0.92, side: THREE.DoubleSide }), 'endYZ', 26)), 1, { peel: 0.8 }),
        stone: () => facadeGrime(noInstanceColor(worldUV(new THREE.MeshStandardMaterial({ map: canvasTex('gableStone', 128, 128, stoneMasonry, true), color: 0xe6e0d4, roughness: 0.9, side: THREE.DoubleSide }), 'endYZ', 26)), 1, { moss: 1 }),
        wood: () => facadeGrime(noInstanceColor(worldUV(new THREE.MeshStandardMaterial({ map: canvasTex('gableWood', 128, 128, woodBoards, true), color: 0xeadcc4, roughness: 0.92, side: THREE.DoubleSide }), 'endYZ', 26)), 1, { moss: 0.7 }),
        metal: () => facadeGrime(noInstanceColor(worldUV(new THREE.MeshStandardMaterial({ map: metalMap, normalMap: metalN, color: 0xb4b8b6, roughness: 0.65, metalness: 0.2, side: THREE.DoubleSide }), 'endYZ', 36)), 1, { rust: 1, moss: 0.2 })
      };
      const tinRoof = () => roofSag(roofGrime(worldUV(new THREE.MeshStandardMaterial({ map: metalMap, normalMap: metalN, roughness: 0.6, metalness: 0.2 }), 'slope', 36), { rust: 1 }));
      // mái chia ô theo khoang: nhà 1 khoang dùng khối đủ 2 đầu hồi, nhà nhiều khoang = ô đầu -X / ô giữa / ô đầu +X
      // (tường hồi ô đầu ở ~0,365 bề rộng ô: ô đầu = 1 khoang + 3,5 chìa mái -> tường hồi nằm ngay mặt tường đầu nhà)
      // bóng đổ của mái cũng võng theo (không thì mặt mái lún xuống dưới bóng của chính nó -> tự đổ bóng lên mình)
      const sagDepth = roofSag(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), true);
      const roofSet = (mats, nE, nM) => {
        const S = { full: new Pool(this.group, gableRoofGeo(), mats, nE, { color: true }), n: new Pool(this.group, gableRoofGeo(true, false, 0.365), mats, nE, { color: true }),
          mid: new Pool(this.group, gableRoofGeo(false, false), mats, nM, { color: true }), p: new Pool(this.group, gableRoofGeo(false, true, 0.365), mats, nE, { color: true }) };
        for (const k in S) S[k].mesh.customDepthMaterial = sagDepth;
        return S;
      };
      this.roofPools = roofSet([roofMat, gableMats.plaster()], roofs, roofMid);
      this.roofPool = this.roofPools.full;
      this.roofPoolsBy = { plaster: this.roofPools };
      for (const gk in gableN) if (gk !== 'plaster') this.roofPoolsBy[gk] = roofSet([gk === 'metal' ? tinRoof() : roofMat, gableMats[gk]()], gableN[gk][0], gableN[gk][1]);
      const archMat = roofGrime(worldUV(new THREE.MeshStandardMaterial({ map: metalMap, normalMap: metalN, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }), 'arch', 36), { rust: 1 });
      const archEnd = facadeGrime(worldUV(new THREE.MeshStandardMaterial({ map: metalMap, normalMap: metalN, roughness: 0.65, metalness: 0.2, side: THREE.DoubleSide }), 'endYZ', 36), 1, { U: this.grimeU, rust: 1, moss: 0.2 });
      this.archPool = new Pool(this.group, archRoofGeo(), [archMat, archEnd], roofs, { color: true });
      this.archPools = { full: this.archPool, n: new Pool(this.group, archRoofGeo(true, false), [archMat, archEnd], roofs, { color: true }),
        mid: new Pool(this.group, archRoofGeo(false, false), [archMat, archEnd], roofMid, { color: true }),
        p: new Pool(this.group, archRoofGeo(false, true), [archMat, archEnd], roofs, { color: true }) };
      for (const k in this.archPools) this.archPools[k].arch = true;
      // Tảng bê tông lớn vương vãi trên đống đổ nát
      this.slabChunkPool = new Pool(this.group, jitter(new THREE.BoxGeometry(1, 1, 1, 2, 1, 2), 0.25, 9), cracked, Math.min(36, list.length) * 60 + 120, { color: true });
      // Gạch đá vỡ rơi xuống chân tường chỗ bị khoét thủng
      this.bitPool = new Pool(this.group, jitter(new THREE.DodecahedronGeometry(0.5, 0), 0.35, 5), cracked, Math.min(36, list.length) * 90 + 200 + Math.min(60, list.filter(b => (b.floors | 0) >= 5).length) * 120, { color: true, castShadow: false });   // + mảnh vỡ tản mát khi nhà cao sập (scatterDebris)
      // Lỗ đạn pháo trên mái ngói (gắn vào ô mái: ô sập thì lỗ ẩn theo)
      this.roofHolePool = new Pool(this.group, new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: roofHoleTex(), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), Math.min(48, list.length) * 6 + 60, { color: true, castShadow: false });
      // Kèo / xà gồ gỗ trơ ra khi dải mái bị đánh sập (gãy lởm chởm, cháy sém)
      this.timberPool = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), Math.min(36, list.length) * 45 + 100, { color: true });
      // Ngói vỡ / mè gãy ở mép dải mái sập, mảng mái võng sụp vào lòng nhà (roofEdges, roofSkeleton)
      this.shardPool = new Pool(this.group, jitter(new THREE.BoxGeometry(1, 1, 1, 3, 1, 2), 0.12, 13), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), Math.min(24, pitchedN) * 160 + 40, { color: true });
      this.initRubbleDetail(list, cracked);
      // Nhà mái dốc: máng xối, ống thoát nước tôn kẽm gỉ; vệt ố nước chảy trên tường sau ống, chân ống loang ẩm (eaveDeco)
      const stainMat = (map, f) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
      this.pipePool = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: pipeTex(), roughness: 0.62, metalness: 0.25 }), Math.max(1, pipeN), { color: true });
      this.stainPool = new Pool(this.group, new THREE.PlaneGeometry(1, 1), stainMat(pipeStainTex(false), -2), Math.max(1, stainN), { color: true, castShadow: false });
      this.footPool = new Pool(this.group, new THREE.PlaneGeometry(1, 1), stainMat(pipeStainTex(true), -2), Math.max(1, footN), { color: true, castShadow: false });
      this.wetPool = new Pool(this.group, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), stainMat(wetPatchTex(), -3), Math.max(1, footN), { color: true, castShadow: false });
      // Chi tiết mái bằng: bồn nước, cục nóng điều hòa, cột / cần ăng-ten, chảo vệ tinh (4 bể cho cả bản đồ)
      const nd = Math.max(1, Math.min(180, decos));
      this.tankPool = new Pool(this.group, tankGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.3 }), nd * 5, { color: true });
      this.acPool = new Pool(this.group, acUnitGeo(), new THREE.MeshStandardMaterial({ map: acUnitTex(), roughness: 0.6, metalness: 0.1 }), nd * 16, { color: true });
      this.rodPool = new Pool(this.group, new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.5 }), nd * 22, { color: true, castShadow: false });
      this.dishPool = new Pool(this.group, dishGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }), nd * 3, { color: true });
      // Rác / đồ bỏ đi trên sân thượng (3 bể cho cả bản đồ, vật nhỏ không đổ bóng): lốp xe cũ; túi rác, tấm bạt, gạch vỡ, rau
      // trong thùng xốp (khối méo); ván gỗ, pallet, thùng xốp (khối hộp)
      this.tirePool = new Pool(this.group, new THREE.TorusGeometry(0.5, 0.2, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), nd * 3, { color: true, castShadow: false });
      this.litterPool = new Pool(this.group, jitter(new THREE.IcosahedronGeometry(0.5, 1), 0.28, 13), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), nd * 16, { color: true, castShadow: false });
      this.boxPool = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), nd * 8, { color: true, castShadow: false });
      // biển hiệu cửa hàng (signDeco): mỗi khoang cửa hàng tầng trệt tối đa 2 tấm (biển ngang + khung / biển dọc)
      const nSign = plans.reduce((a, p) => a + (p.gT.startsWith('shop') || p.shopMix ? 2 * (p.bx + p.bz) * 2 : 0), 0);
      if (nSign) this.signPool = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1), signMaterial(), nSign, { color: true });
      // Sân trước lát đá của nhà có khuôn viên (map_gen b.yard): tấm sân ~4 m theo địa hình, ảnh lát trải theo toạ độ thế giới
      const nY = list.filter(b => b.yard).length;
      if (nY) {
        const pm = new THREE.MeshStandardMaterial({ map: plazaTex(), roughness: 0.82 });
        pm.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
            #if defined( USE_UV ) && defined( USE_INSTANCING )
              { vec4 pw = modelMatrix * instanceMatrix * vec4(position, 1.0); vUv = pw.xz / 64.0; }
            #endif`);
        };
        pm.customProgramCacheKey = () => 'plazaUV';
        this.plazaPool = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1), pm, nY * 90, { color: true, castShadow: false });
      }
      this.yard = [];   // vật chân đế / khuôn viên phá được (baseDeco, yardBreak)
      // Giữ chính generator đang dùng: chia lượt không được reset seed hoặc để
      // các tác vụ xen giữa tiêu thụ chuỗi RNG của bản đồ.
      this._buildRng = RNG;
      this._buildPlans = plans;
      this._buildIndex = 0;
      this._buildStage = 0;
      this.buildReady = false;
      if (!opts.defer) while (!this.stepBuild(Infinity)) { /* đường đồng bộ của lab */ }
    }

    stepBuild(budgetMs = 5) {
      if (this.buildReady) return true;
      const prev = RNG;
      RNG = this._buildRng;
      const end = performance.now() + budgetMs;
      try {
        if (this._buildStage === 0) {
          // Một nhà là đơn vị nhỏ nhất; giữ pool dùng chung cho toàn bản đồ.
          do {
            if (this._buildIndex >= this._buildPlans.length) { this._buildStage = 1; break; }
            const p = this._buildPlans[this._buildIndex++];
            const B = this.buildOne(p);
            this.roofDeco(B, p); this.baseDeco(B, p); this.eaveDeco(B, p); this.signDeco(B, p); this.items.push(B);
          } while (performance.now() < end);
          return false;
        }
        if (this._buildStage === 1) {
          this.buildGrimeInfo();
          this._buildIndex = 0; this._buildStage = 2;
          return false;
        }
        if (this._buildStage === 2) {
          do {
            if (this._buildIndex >= this.items.length) { this._buildStage = 3; break; }
            const B = this.items[this._buildIndex++];
            if (B.dmgPanels.size) this.rebuildDamage(B);
          } while (performance.now() < end);
          return false;
        }
        this.commitAll();
        this.freezeStatic();
        this._buildPlans = this._buildRng = null;
        this.buildReady = true;
        return true;
      } finally { RNG = prev; }
    }

    // Chia các bể tĩnh lớn (mảng tường, sàn, cột, mái, đồ trên mái...) theo ô để camera / bóng đổ chỉ vẽ ô trong tầm (Pool.freeze).
    // Bể nhỏ giữ 1 mesh (thêm mảnh = thêm lượt vẽ); bể mảnh vỡ sinh liên tục lúc sập nhà không đóng băng
    freezeStatic() {
      const tri = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
      const pools = [this.slabPool, this.basePool, this.colPool, this.tankPool, this.acPool, this.pipePool, this.stainPool, this.footPool,
        this.wetPool, this.rodPool, this.dishPool, this.tirePool, this.litterPool, this.boxPool, this.plazaPool, this.signPool];
      for (const k in this.archPools) pools.push(this.archPools[k]);
      for (const gk in this.roofPoolsBy) for (const k in this.roofPoolsBy[gk]) pools.push(this.roofPoolsBy[gk][k]);
      for (const k in this.panelKits) {
        const K = this.panelKits[k];
        pools.push(K.pools.box, K.rebarStub, K.rebarGrid);
        for (const t in K.variants) for (const p of K.variants[t]) pools.push(p, p.rebar);
      }
      let n = 0;
      for (const p of new Set(pools)) if (p && p.mesh.count * tri(p.mesh.geometry) >= BLD_FREEZE_TRIS && p.freeze(BLD_FREEZE_CELL)) n++;
      return n;
    }

    // Mức phong hoá theo kiểu mặt tường: tường tô bong vữa lộ gạch / bê tông, đất mộc tróc lớp trát, đá & gỗ chỉ rêu ố,
    // tôn gỉ sét, mặt dựng kính chỉ ố bụi vệt mưa
    weatherOpt(key) {
      const k = key.replace(/B$|C$/, '');
      const o = k === 'office' ? (key === 'office' ? { amt: 0.55, peel: 0, moss: 0.2 } : { amt: 0.85, peel: 0.45, moss: 0.4 })
        : k === 'adobe' ? { amt: 1, peel: 0.75, moss: 0.25, peelA: [0.5, 0.37, 0.25], peelB: [0.43, 0.32, 0.22] }
        : k === 'stone' ? { amt: 1, peel: 0, moss: 1 }
        : k.startsWith('lobby') ? { amt: 0.55, peel: 0, moss: 0.25 }
        : k === 'wood' ? { amt: 1, peel: 0, moss: 0.7 }
        : k === 'metal' || k === 'hangarDoor' ? { amt: 1, peel: 0, moss: 0.2, rust: 1 }
        : { amt: 1, peel: 1, moss: 0.6 };
      o.U = this.grimeU;
      return o;
    }
    // Ảnh lưới (mỗi ô ~0,5 m) ghi độ cao chân & đỉnh tường của nhà phủ lên ô đó (16 bit mỗi số, 1/4 đơn vị) -> shader phong hoá
    // biết chỗ đang tô cách đất / cách mép mái bao xa (ẩm chân tường, vệt bẩn dưới mái). Ô trống = 0 -> ngoài nhà
    buildGrimeInfo() {
      if (!this.items.length || typeof document === 'undefined') return;
      const M = 10;   // lề quanh nhà (mái chìa, gờ tường, mảnh đổ nát)
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const B of this.items) {
        const r = Math.hypot(B.w, B.d) / 2 + M;
        x0 = Math.min(x0, B.x - r); x1 = Math.max(x1, B.x + r); z0 = Math.min(z0, B.z - r); z1 = Math.max(z1, B.z + r);
      }
      const cell = Math.max(4, (x1 - x0) / 1024, (z1 - z0) / 1024);
      const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
      const data = new Uint8Array(nx * nz * 4);
      const enc = v => Math.max(1, Math.min(65535, Math.round((v + 1024) * 4)));
      for (const B of this.items) {
        const yb = enc(B.y), yt = enc(B.y + B.floors * B.FH);
        const ca = Math.cos(B.angle), sa = Math.sin(B.angle), hw = B.w / 2 + M, hd = B.d / 2 + M, r = Math.hypot(hw, hd);
        const i0 = Math.max(0, Math.floor((B.x - r - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((B.x + r - x0) / cell));
        const j0 = Math.max(0, Math.floor((B.z - r - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((B.z + r - z0) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = x0 + (i + 0.5) * cell - B.x, dz = z0 + (j + 0.5) * cell - B.z;
          // về hệ trục nhà (base xoay quanh Y một góc angle)
          const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
          if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
          const q = (j * nx + i) * 4;
          data[q] = yb >> 8; data[q + 1] = yb & 255; data[q + 2] = yt >> 8; data[q + 3] = yt & 255;
        }
      }
      const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      this.grimeU.uBld.value = t;
      this.grimeU.uBldGrid.value.set(x0, z0, 1 / (nx * cell), 1 / (nz * cell));
      // Độ che khuất mặt đất quanh chân nhà: đúng chân tường = 1, làm mờ 2 lượt (~gauss) -> tối dần trong ~2 m ra ngoài
      let occ = new Float32Array(nx * nz);
      for (const B of this.items) {
        const ca = Math.cos(B.angle), sa = Math.sin(B.angle), hw = B.w / 2, hd = B.d / 2, r = Math.hypot(hw, hd);
        const i0 = Math.max(0, Math.floor((B.x - r - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((B.x + r - x0) / cell));
        const j0 = Math.max(0, Math.floor((B.z - r - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((B.z + r - z0) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = x0 + (i + 0.5) * cell - B.x, dz = z0 + (j + 0.5) * cell - B.z;
          if (Math.abs(dx * ca - dz * sa) <= hw && Math.abs(dx * sa + dz * ca) <= hd) occ[j * nx + i] = 1;
        }
      }
      const R = Math.max(1, Math.round(9 / cell)), tmp = new Float32Array(nx * nz);
      const blur = (src, dst, horiz) => {
        const n = horiz ? nx : nz, m = horiz ? nz : nx;
        for (let a = 0; a < m; a++) {
          let sum = 0;
          const at = b => (horiz ? a * nx + b : b * nx + a);
          for (let b = -R; b <= R; b++) sum += b >= 0 && b < n ? src[at(b)] : 0;
          for (let b = 0; b < n; b++) {
            dst[at(b)] = sum / (2 * R + 1);
            const o = b - R, q = b + R + 1;
            if (o >= 0) sum -= src[at(o)];
            if (q < n) sum += src[at(q)];
          }
        }
      };
      // Khoảng cách từ mỗi ô trong nhà tới mép nhà gần nhất (biến đổi khoảng cách 2 lượt, 1 / √2 theo ô kề / ô chéo) ->
      // shader mái bằng biết chỗ nào sát tường chắn mái (đất bụi, rêu dồn chân tường). Lưu 0..64 đơn vị (8 m) vào 1 byte
      const dist = new Float32Array(nx * nz);
      for (let i = 0; i < dist.length; i++) dist[i] = occ[i] > 0 ? 1e6 : 0;
      const relax = (i, j, di, dj, w) => {
        const a = i + di, b = j + dj, v = a < 0 || b < 0 || a >= nx || b >= nz ? 0 : dist[b * nx + a];
        if (v + w < dist[j * nx + i]) dist[j * nx + i] = v + w;
      };
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (dist[j * nx + i] > 0) { relax(i, j, -1, 0, 1); relax(i, j, 0, -1, 1); relax(i, j, -1, -1, 1.414); relax(i, j, 1, -1, 1.414); }
      for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) if (dist[j * nx + i] > 0) { relax(i, j, 1, 0, 1); relax(i, j, 0, 1, 1); relax(i, j, 1, 1, 1.414); relax(i, j, -1, 1, 1.414); }
      const eb = new Uint8Array(nx * nz);
      for (let i = 0; i < eb.length; i++) eb[i] = dist[i] > 0 ? Math.max(1, Math.min(255, Math.round((dist[i] - 0.5) * cell / 64 * 255))) : 0;
      const et = new THREE.DataTexture(eb, nx, nz, THREE.LuminanceFormat);
      et.magFilter = et.minFilter = THREE.LinearFilter;
      et.unpackAlignment = 1;
      et.generateMipmaps = false;
      et.needsUpdate = true;
      this.grimeU.uBldEdge.value = et;
      for (let k = 0; k < 2; k++) { blur(occ, tmp, true); blur(tmp, occ, false); }
      const ob = new Uint8Array(nx * nz);
      for (let i = 0; i < ob.length; i++) ob[i] = Math.min(255, Math.round(Math.min(1, occ[i] * 2) * 255));
      const ot = new THREE.DataTexture(ob, nx, nz, THREE.LuminanceFormat);
      ot.magFilter = ot.minFilter = THREE.LinearFilter;
      ot.unpackAlignment = 1;   // hàng 1 byte / điểm ảnh, bề ngang không chia hết cho 4
      ot.generateMipmaps = false;
      ot.needsUpdate = true;
      this.grimeU.uBldOcc.value = ot;
    }

    commitAll() {
      for (const k in this.panelKits) this.panelKits[k].commit();
      [this.slabPool, this.basePool, this.colPool, this.slabChunkPool, this.bitPool, this.tankPool, this.acPool, this.pipePool, this.stainPool, this.footPool, this.wetPool, this.rodPool, this.dishPool, this.tirePool, this.litterPool, this.boxPool, this.plazaPool, this.signPool].forEach(pl => pl && pl.commit());
      for (const k in this.archPools) this.archPools[k].commit();
      for (const gk in this.roofPoolsBy) for (const k in this.roofPoolsBy[gk]) this.roofPoolsBy[gk][k].commit();
      if (this.rd) for (const k in this.rd) for (const pl of [].concat(this.rd[k])) pl.commit();
    }

    buildOne(P) {
      const { b, st, bx, bz, floors } = P;
      const WM = WALLMAT[st.mat || 'concrete'];
      const W = bx * st.bay, D = bz * st.bay, FH = st.floorH, T = WM.T;
      const ang = b.angle || 0, cosA = Math.cos(ang), sinA = Math.sin(ang);
      const hw = W / 2, hd = D / 2;
      const gCenter = this.groundAt(b.x, b.z);
      // Khảo sát độ cao mặt đất tại 9 điểm quanh móng và tâm nhà
      const samplePts = [
        [0, 0],
        [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd],
        [0, -hd], [0, hd], [-hw, 0], [hw, 0]
      ];
      let gMin = gCenter, gMax = gCenter;
      for (const [lx, lz] of samplePts) {
        const wx = b.x + lx * cosA - lz * sinA;
        const wz = b.z + lx * sinA + lz * cosA;
        const gh = this.groundAt(wx, wz);
        if (gh < gMin) gMin = gh;
        if (gh > gMax) gMax = gh;
      }
      // Nâng nhẹ cốt nền nếu đất dốc ở một phía để sàn trệt không bị đất cao tràn vào
      const slopeRise = Math.max(0, gMax - gCenter);
      const gy = gCenter + Math.min(slopeRise * 0.45, 6.0);
      const base = new THREE.Matrix4().makeRotationY(ang).setPosition(b.x, gy - 1.5, b.z);
      const color = new THREE.Color(st.colors[Math.floor(RNG() * st.colors.length)]);
      const B = { x: b.x, z: b.z, y: gy, w: W, d: D, bx, bz, floors, FH, T, st, WM, base, color, mods: [], collapsed: false, angle: ang, kind: b.kind, gMin,
        hpTotal: 0, walls: [], levels: [], wgrid: { x1: [], 'x-1': [], z1: [], 'z-1': [] }, roofMods: null, dmgPanels: new Set(), cut: false, cutHold: 0, seedG: Math.floor(RNG() * 1e6) };
      // CAO ỐC KHUNG CỘT (từ 8 tầng): tải đi qua lưới cột + lõi thang bê tông; vách kính mặt dựng / tủ kính ki-ốt chỉ treo vào
      // mép sàn, gần như không chịu lực (TOWER_LB) -> bắn gãy cột chân nhà mới làm sập, không phải "đứng trên vách kính"
      B.tower = (b.kind === 'office' || b.kind === 'apartment') && floors >= 8 && !st.ruined;
      const kit = this.panelKits[P.gT], kitUp = this.panelKits[P.uT] || kit, sideKit = st.sideTex && this.panelKits[st.sideTex];
      // vách hông kín của nhà ống: cạnh dài (bx > bz -> 2 mặt z là vách hông, ngược lại 2 mặt x)
      let sideNow = false, doorNow = false;
      const dr = P.door;
      B.dmgKey = P.dmgKey; B.atlas = P.styles.length > 1 ? P.styles : null;
      // Mái / sàn có màu riêng (không nhuộm theo màu tường); chọn theo vị trí nhà để không đổi dãy RNG dựng nhà
      const hs = hash3(b.x * 0.01, b.z * 0.01, 7);
      const topList = st.top || (st.roof === 'pitched' ? PITCH_TOP : FLAT_TOP);
      const roofCol = new THREE.Color(topList[Math.floor(hs * topList.length) % topList.length]);
      const slabCol = new THREE.Color(st.slab || SLAB_COL);
      const mk = (pool, lx, ly, lz, sx, sy, sz, ry, role, floor, hx, hy, hz) => {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), q, new THREE.Vector3(sx, sy, sz));
        const world = base.clone().multiply(m);
        const src = pool === 'panel' || (pool && pool.arch) ? color : role === 'roof' ? roofCol : slabCol;
        // mảng tường: lệch màu từng khoang rất nhẹ (trước 0,9-1,04 mỗi khoang -> mặt nhà loang ô bàn cờ, cao ốc càng lộ);
        // loang màu thật (ẩm, phai nắng, vệt mưa) đã do shader phong hoá vẽ liền mảng theo toạ độ thế giới
        const jt = rand(0, 1), c = src.clone().multiplyScalar((pool === 'panel' ? (floors >= 6 ? 0.985 + 0.025 * jt : 0.96 + 0.06 * jt) : 0.9 + 0.14 * jt) * (pool === 'panel' && floor === 0 ? 0.9 : 1));
        // cột / tường tầng dưới nhà cao gánh nhiều tầng hơn -> tiết diện to, dày, bền hơn (mỗi tầng phía trên: cột +10%, tường +7%)
        const up = Math.max(0, floors - 1 - floor);
        // mái bằng bê tông cốt thép dày ~0,35 m bền hơn bản sàn ~0,2 m (trước 2,2 < sàn 2,6)
        const hp = role === 'col' ? 2.2 * (1 + 0.1 * up) : role === 'slab' ? 2.6 : role === 'roof' ? (pool === this.slabPool ? 3.0 : 1.6) : role === 'wall' ? 1 + 0.07 * up : 1.0;
        const mod = { local: m, world, role, floor, ry: ry || 0, hp, hp0: hp, state: 'ok', c, lx, ly, lz, sx, hx: hx || sx / 2, hy: hy || sy / 2, hz: hz || sz / 2, id: B.mods.length };
        if (pool === 'panel') {
          const dk = (doorNow && this.panelKits[P.door.key]) || (!sideNow && floor === 1 && P.pod > 1 && this.panelKits.lobbyU) ||
            (!sideNow && floor === 0 && P.shopMix && hash3(b.x * 0.01 + lx * 0.071, b.z * 0.01 + lz * 0.067, 21) < 0.4 && this.panelKits.shopB);
          mod.side = sideNow; mod.kit = sideNow ? sideKit : dk ? dk : floor > 0 ? kitUp : kit; mod.h = mod.kit.add('box', world, c);
          mod.style = sideNow ? 'side' : dk ? dk.styleKey : floor > 0 && this.panelKits[P.uT] ? P.uT : P.gT;   // kiểu mặt tường (vị trí ô cửa)
        }
        else { mod.pool = pool; mod.idx = pool.add(world, c); }
        if (role === 'wall') {
          mod.ax = Math.cos(mod.ry); mod.az = -Math.sin(mod.ry);   // trục dọc tường của mảng
          mod.ox = Math.sin(mod.ry); mod.oz = Math.cos(mod.ry);    // pháp tuyến hướng ra ngoài nhà
          mod.frame = base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), q, new THREE.Vector3(1, 1, 1)));
          B.walls.push(mod);
        }
        B.mods.push(mod);
        B.hpTotal += hp;
        return mod;
      };
      const ruined = !!st.ruined;
      const flatRoof = st.roof === 'flat';
      let topGone = false;   // nhà đổ nát mất hẳn tầng trên cùng -> không còn mái bằng lơ lửng phía trên
      for (let f = 0; f < floors; f++) {
        const y = 1.5 + f * FH + FH / 2;
        if (ruined && f === floors - 1 && f > 0 && RNG() < 0.6) { topGone = true; continue; }
        sideNow = !!sideKit && bx > bz;
        for (let i = 0; i < bx; i++) {
          const lx = -W / 2 + st.bay * (i + 0.5);
          for (const s of [-1, 1]) {
            if (ruined && RNG() < 0.25) continue;
            doorNow = !!dr && f === 0 && dr.along && s === dr.s && i >= dr.i0 && i < dr.i0 + dr.n;
            const m = mk('panel', lx, y, s * (D / 2 - T / 2), st.bay, FH, T, s > 0 ? 0 : Math.PI, 'wall', f);
            doorNow = false;
            B.wgrid['z' + s][f * bx + i] = m;
          }
        }
        sideNow = !!sideKit && bx <= bz;
        for (let j = 0; j < bz; j++) {
          const lz = -D / 2 + st.bay * (j + 0.5);
          for (const s of [-1, 1]) {
            if (ruined && RNG() < 0.25) continue;
            doorNow = !!dr && f === 0 && !dr.along && s === dr.s && j >= dr.i0 && j < dr.i0 + dr.n;
            const m = mk('panel', s * (W / 2 - T / 2), y, lz, st.bay, FH, T, s > 0 ? Math.PI / 2 : -Math.PI / 2, 'wall', f);
            doorNow = false;
            B.wgrid['x' + s][f * bz + j] = m;
          }
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(this.colPool, sx * (W / 2 - 0.8), y, sz * (D / 2 - 0.8), 3.0, FH, 3.0, 0, 'col', f);
        // cột trong cao ốc: tiết diện lớn dần xuống tầng dưới (gánh nhiều tầng hơn) ~0,35 m tầng trên cùng -> ~0,75 m chân nhà 16 tầng
        const cs = B.tower ? Math.min(6, 2.8 + 0.2 * (floors - 1 - f)) : 2.6;
        if (bx > 2 && bz > 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(this.colPool, sx * W / 6, y, sz * D / 6, cs, FH, cs, 0, 'col', f);
        if (B.tower) {
          // cột biên mỗi 2 khoang (~7-7,5 m) ngay sau vách mặt nhà (khuất sau mảng tường, lộ ra khi kính / tường vỡ)
          const ci = T + 0.3 + cs / 2;
          for (let i = 2; i < bx; i += 2) for (const s of [-1, 1]) mk(this.colPool, -W / 2 + i * st.bay, y, s * (D / 2 - ci), cs, FH, cs, 0, 'col', f);
          for (let j = 2; j < bz; j += 2) for (const s of [-1, 1]) mk(this.colPool, s * (W / 2 - ci), y, -D / 2 + j * st.bay, cs, FH, cs, 0, 'col', f);
          // lõi thang máy - thang bộ: 4 vách bê tông dày ~0,2 m bao ô ~0,9 x 0,9 khoang giữa nhà, bền gấp đôi cột
          const cw = st.bay * 0.45;
          for (const s of [-1, 1]) {
            for (const m of [mk(this.colPool, s * cw, y, 0, 1.6, FH, cw * 2, 0, 'col', f), mk(this.colPool, 0, y, s * cw, cw * 2 - 1.6, FH, 1.6, 0, 'col', f)]) {
              B.hpTotal += m.hp; m.hp *= 2; m.hp0 = m.hp; m.core = true;
            }
          }
        }
        // Sàn trần tầng f chia ô theo khoang (thủng / sập từng ô). Tầng trên cùng nhà mái bằng: ô mái thay cho sàn trần
        if (f === floors - 1 && flatRoof) continue;
        B.levels.push(this.tileLevel(B, mk, 1.5 + (f + 1) * FH, 1.6, 'slab', f, 0.6));
      }
      // MÓNG NHÀ KIÊN CỐ: cắm sâu xuống dưới điểm đất thấp nhất quanh nhà, không bao giờ bị hở đáy trên sườn dốc
      const worldTop = gy + 0.6;
      const drop = Math.max(0, worldTop - gMin);
      const foundThick = Math.max(16.0, drop + 10.0);
      const foundY = 2.1 - foundThick / 2;
      mk(this.basePool, 0, foundY, 0, W + 1.2, foundThick, D + 1.2, 0, 'base', -1);
      const topY = 1.5 + floors * FH;
      // Mái dốc / vòm: một ô mái mỗi khoang dọc sống mái (trục X) -> đạn đục thủng đúng chỗ trúng, ô mất chỗ tựa thì sụp
      // riêng (xem checkStructure); ô đầu nhà gồm cả phần mái chìa. Cả mái chung một màu (không loang sọc theo ô)
      const roofSlices = (pools, ov, y, sy, sz, hy, hz, ly) => {
        B.roofMods = [];
        let c0 = null;
        for (let i = 0; i < bx; i++) {
          const xa = -W / 2 + i * st.bay - (i === 0 ? ov : 0), xb = -W / 2 + (i + 1) * st.bay + (i === bx - 1 ? ov : 0);
          const pool = bx === 1 ? pools.full : i === 0 ? pools.n : i === bx - 1 ? pools.p : pools.mid;
          const m = mk(pool, (xa + xb) / 2, y, 0, xb - xa, sy, sz, 0, 'roof', floors, (xb - xa) / 2, hy, hz);
          m.ly = ly; m.ti = i; m.slice = true;
          // một ô mái = cả dải ~3,3 m x hai mái dốc: bền hơn ô mái bằng một chút (x1,6). Trước đây x2,6: không phát 120 mm
          // nào (kể cả nổ mạnh) phá nổi một dải -> trông như nóc nhà bất tử. Giờ: nổ mạnh / đạn thường bắn dốc 1 phát sụp dải,
          // đạn sượt / bắn là là 2 phát, lựu pháo 1 phát sụp cả dải & lan sang dải bên
          m.hp *= 1.6; m.hp0 = m.hp;
          if (c0) { m.c = c0.clone(); pool.color(m.idx, m.c); } else c0 = m.c;
          B.roofMods.push(m);
        }
      };
      if (st.roof === 'pitched') {
        const rh = Math.min(W, D) * 0.42;
        // mái chìa ~0,45 m khỏi tường mỗi phía (W + 7)
        roofSlices(this.roofPoolsBy[gableKind(st)] || this.roofPools, 3.5, topY + 0.6, rh / 0.75, (D + 7) / 0.866, rh / 2, D / 2 + 1.5, topY + 0.6 + rh / 2);
        B.roofShape = { kind: 'pitched', y0: topY + 0.6, h: rh, hx: W / 2 + 1.5, hz: D / 2 + 1.5 };
      } else if (st.roof === 'arched') {
        roofSlices(this.archPools, 0, topY - 0.5, FH * 1.3, D, FH * 0.33, D / 2, topY - 0.5 + FH * 0.33);
        B.roofShape = { kind: 'arched', y0: topY - 0.5, h: FH * 0.65, hx: W / 2, hz: D / 2 };
      } else {
        if (!topGone) B.levels.push(this.tileLevel(B, mk, topY + 1.4, 2.8, 'roof', floors, -0.25));
      }
      B.topY = topY;
      // đỉnh cao nhất của nhà (mái dốc / vòm có thể cao hơn 1 tầng): lọc nhanh đoạn bay trong segmentHit
      B.hitTop = Math.max(topY + FH, B.roofShape ? B.roofShape.y0 + B.roofShape.h + 2 : 0);
      B.entry = { x: b.x, z: b.z, radius: Math.hypot(W, D) * 0.5 * 0.92, height: topY + 4, type: 'BUILDING', id: 'bldg-' + Math.round(b.x) + '-' + Math.round(b.z), ref: B };
      B.halfW = W / 2; B.halfD = D / 2;
      // Nhà đổ nát sẵn: vài lỗ đạn pháo cũ ám khói trên tường
      if (ruined) {
        for (const m of B.walls) {
          if (RNG() > 0.22) continue;
          const P2 = { hole: rand(3, 8), crater: rand(6, 11), soot: rand(6, 14), chip: 0, stretch: 1, tx: 1, ty: 0, noise: holeNoise(), seed: rand(0, 1000), inner: false };
          this.carve(B, m, rand(-0.3, 0.3) * st.bay, rand(-0.3, 0.3) * FH, P2);
        }
      }
      return B;
    }
    // Một lớp sàn / mái chia ô theo khoang; ô biên chìa ra ngoài tường 'over' đơn vị
    tileLevel(B, mk, y, th, role, f, over) {
      const { bx, bz, st } = B, W = bx * st.bay, D = bz * st.bay;
      const L = { y, th, role, f, tiles: [] };
      for (let i = 0; i < bx; i++) {
        for (let j = 0; j < bz; j++) {
          const ex0 = i === 0 ? over : 0, ex1 = i === bx - 1 ? over : 0, ez0 = j === 0 ? over : 0, ez1 = j === bz - 1 ? over : 0;
          const sx = st.bay + ex0 + ex1, sz = st.bay + ez0 + ez1;
          const lx = -W / 2 + st.bay * (i + 0.5) + (ex1 - ex0) / 2, lz = -D / 2 + st.bay * (j + 0.5) + (ez1 - ez0) / 2;
          const t = mk(this.slabPool, lx, y, lz, sx, th, sz, 0, role, f);
          t.ti = i; t.tj = j;
          L.tiles.push(t);
        }
      }
      return L;
    }
    // ---- VẬT CHÂN ĐẾ / KHUÔN VIÊN PHÁ ĐƯỢC: nổ gần hay trúng thẳng thì mái che sảnh gãy thanh giằng, gập sập xuống quanh mép
    // tựa tường; bồn cây bê tông vỡ vụn (cây bụi văng mất); cọc chắn xe cong gập ra xa tâm nổ. Xe húc / cán (ramYard): bồn
    // cây bị nghiền, cọc bị cán gập theo chiều xe chạy. Không chặn xe (vật nhỏ so với xe tăng)
    yardSetPart(t, part, M) {
      part.pool.set(part.idx, M); part.world = M;
      if (part.rec) { part.rec.world = M; part.rec.local = new THREE.Matrix4().copy(t.B.base).invert().multiply(M); }
    }
    yardBreak(t, dx, dz, fx, crush) {
      if (t.state) return;
      t.state = 1;
      const P = new THREE.Vector3(), Qn = new THREE.Quaternion(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      if (t.kind === 'bollard') {
        // gập quanh chân cọc, ngả theo hướng bị xô (cán: gần nằm rạp)
        const part = t.parts[0];
        part.world.decompose(P, Qn, S);
        const base = P.clone().addScaledVector(up, -S.y / 2), ax = new THREE.Vector3(dz, 0, -dx).normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(ax, crush ? rand(1.35, 1.5) : rand(0.6, 1.25));
        const mid = up.clone().multiplyScalar(S.y / 2).applyQuaternion(q).add(base);
        this.yardSetPart(t, part, new THREE.Matrix4().compose(mid, q.multiply(Qn), S));
        sfx('sheetMetal', t.x, t.y, t.z, 0.35);
      } else if (t.kind === 'planter') {
        // bồn vỡ: còn đống vụn thấp, xô lệch; cây bụi văng mất
        const part = t.parts[0];
        part.world.decompose(P, Qn, S);
        P.y -= S.y * 0.33; S.y *= 0.34; S.x *= rand(1.05, 1.2); S.z *= rand(1.1, 1.3);
        Qn.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.15, 0.15), rand(-0.3, 0.3), rand(-0.15, 0.15))));
        this.yardSetPart(t, part, new THREE.Matrix4().compose(P, Qn, S));
        for (const p of t.parts.slice(1)) p.pool.hide(p.idx);
        jet(fx, t.x, t.y + 1, t.z, dx, 0.4, dz, crush ? 6 : 10, 2.4, crush ? 10 : 24, [0.6, 0.59, 0.56]);
        dustJet(fx, t.x, t.y, t.z, dx, dz, crush ? 2 : 4, 8, [0.68, 0.66, 0.62], 10);
        sfx('concrete', t.x, t.y, t.z, crush ? 0.5 : 0.7);
      } else if (t.kind === 'canopy') {
        // thanh giằng đứt, mái gập xuống quanh mép tựa tường (~60°) rồi tụt xuống chút; mép ngoài chúi về phía mặt đất
        for (const r of t.rods) { r.pool.hide(r.idx); if (r.rec) r.rec.world = ZERO; }
        const ax = new THREE.Vector3(t.tx, 0, t.tz).normalize(), out = new THREE.Vector3(t.nx, 0, t.nz);
        let a = rand(0.95, 1.2);
        if (out.clone().applyAxisAngle(ax, a).y > 0) a = -a;
        const H = t.hinge, R = new THREE.Matrix4().makeRotationAxis(ax, a);
        const M = new THREE.Matrix4().makeTranslation(H.x, H.y - rand(1.5, 3), H.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-H.x, -H.y, -H.z));
        for (const part of t.parts) this.yardSetPart(t, part, M.clone().multiply(part.world));
        jet(fx, t.x, t.y, t.z, t.nx, 0.2, t.nz, 6, 1.6, 14, [0.32, 0.33, 0.34]);
        sfx('sheetMetal', t.x, t.y, t.z, 0.9);
      }
    }
    // Nổ / trúng thẳng (gọi từ damageAt): chỉ đạn nổ / xuyên lớn mới làm hư (đạn súng máy không quật đổ mái che, bồn bê tông)
    yardBlast(x, y, z, I, fx) {
      if (!this.yard || !this.yard.length || !((I.kg || 0) > 0 || I.hole >= 1)) return;
      const R0 = I.sr || 5;
      for (const t of this.yard) {
        if (t.state || Math.abs(t.x - x) > R0 + 60 || Math.abs(t.z - z) > R0 + 60) continue;
        let px = t.x, pz = t.z, reach;
        if (t.kind === 'canopy') {
          // khoảng cách tới đoạn trục mái che (dọc mặt tường) thay vì tới tâm
          const u = Math.max(-t.hs, Math.min(t.hs, (x - t.x) * t.tx + (z - t.z) * t.tz));
          px = t.x + t.tx * u; pz = t.z + t.tz * u; reach = R0 * 0.7 + 4;
        } else reach = t.kind === 'planter' ? R0 * 0.55 + 4 : R0 * 0.45 + 2;
        const dx = px - x, dz = pz - z, d = Math.hypot(dx, (t.y - y) * 0.7, dz);
        if (d < reach) { const l = Math.hypot(dx, dz) || 1; this.yardBreak(t, dx / l, dz / l, fx, false); }
      }
    }
    // Xe húc / cán (terrain.ramObjects): hộp thân xe ob { cx, cz, ux, uz, hu, hv } chạm bồn cây / cọc -> nghiền / cán gập
    ramYard(unit, ob, fx) {
      if (!this.yard || !this.yard.length || !ob) return 0;
      const sp = (unit && unit.speed) || 0, a = (unit && unit.bodyAngle) || 0;
      if (Math.abs(sp) < 0.5) return 0;
      const dx = -Math.sin(a) * Math.sign(sp), dz = -Math.cos(a) * Math.sign(sp);
      let n = 0;
      for (const t of this.yard) {
        if (t.state || t.kind === 'canopy' || Math.abs(t.x - ob.cx) > 60 || Math.abs(t.z - ob.cz) > 60) continue;
        const rx = t.x - ob.cx, rz = t.z - ob.cz, lu = rx * ob.ux + rz * ob.uz, lv = -rx * ob.uz + rz * ob.ux;
        if (Math.abs(lu) < ob.hu + t.r && Math.abs(lv) < ob.hv + t.r) { this.yardBreak(t, dx, dz, fx, true); n++; }
      }
      return n;
    }
    // ---- CHÂN ĐẾ CAO ỐC (chỉ để nhìn, không va chạm): gờ chân đế nhô ra chạy quanh nhà ngang sàn tầng 2 (tách khối đế với thân
    // tháp), sảnh có mái che vươn ra trước lối vào (tấm mái mỏng + diềm + 2 thanh giằng xiên lên tường) và 2 bồn cây hai bên.
    // Gờ & mái che gắn vào ô sàn tầng 2 (t.deco: sập theo sàn); bồn cây đứng trên đất, không gắn
    baseDeco(B, P) {
      const { b, st } = P;
      if (st.ruined || !(b.kind === 'office' || b.kind === 'apartment') || B.floors < 8) return;
      const pod = P.pod || 1, L0 = B.levels.find(L => L.role === 'slab' && L.f === pod - 1);
      if (!L0 || !L0.tiles.length) return;
      const bay = st.bay, W = B.bx * bay, D = B.bz * bay, FH = B.FH, y0 = 1.5;
      let hn = 0;
      const h = () => { hn++; return hash3(b.x * 0.0213 + hn * 0.517, b.z * 0.0177 - hn * 0.331, 90 + hn); };
      const tileAt = (lx, lz) => L0.tiles[Math.min(B.bx - 1, Math.max(0, Math.floor((lx + W / 2) / bay))) * B.bz + Math.min(B.bz - 1, Math.max(0, Math.floor((lz + D / 2) / bay)))];
      const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
      const put = (pool, lx, ly, lz, sx, sy, sz, col, ry, rx, attach) => {
        const local = new THREE.Matrix4().compose(V.set(lx, ly, lz), Q.setFromEuler(E.set(rx || 0, ry || 0, 0, 'YXZ')), S.set(sx, sy, sz));
        const world = B.base.clone().multiply(local);
        const idx = pool.add(world, col);
        if (idx < 0) return null;
        const part = { pool, idx, world, rec: null };
        if (attach) { const t = tileAt(lx, lz); part.rec = { pool, idx, local, world }; (t.deco || (t.deco = [])).push(part.rec); }
        return part;
      };
      // vật phá được (this.yard, xem yardBreak): tâm thế giới để dò nổ / xe húc
      const bit = (kind, parts, lx, ly, lz, extra) => {
        parts = parts.filter(Boolean);
        if (!parts.length) return;
        const w = this.toWorld(B, lx, ly, lz);
        this.yard.push(Object.assign({ kind, parts, B, x: w.x, y: w.y, z: w.z, state: 0 }, extra));
      };
      const lobby = P.gT.startsWith('lobby');
      // 1) gờ chân đế: đá ốp (sảnh) / vữa cùng màu tường (dãy ki-ốt), nhô ~0,22 m, cao ~0,5 m
      const po = 1.8, bandY = y0 + pod * FH + 0.4, bandC = lobby ? new THREE.Color(0xbdb5a6) : B.color.clone().multiplyScalar(1.08);
      for (let i = 0; i < B.bx; i++) {
        const e0 = i === 0 ? po : 0, e1 = i === B.bx - 1 ? po : 0;
        for (const s of [-1, 1]) put(this.colPool, -W / 2 + bay * (i + 0.5) + (e1 - e0) / 2, bandY, s * (D / 2 + po / 2), bay + e0 + e1, 4, po, bandC, 0, 0, true);
      }
      for (let j = 0; j < B.bz; j++) for (const s of [-1, 1]) put(this.colPool, s * (W / 2 + po / 2), bandY, -D / 2 + bay * (j + 0.5), po, 4, bay, bandC, 0, 0, true);
      const dr = P.door;
      // 2) khuôn viên (b.yard): sân trước lát đá từ dải cỏ sát mép lô tới mặt nhà, rộng hơn mặt nhà 9 m mỗi bên (chỗ đỗ xe);
      //    hàng cọc chắn xe dọc mép sân (chừa lối vào trước sảnh). Tấm sân bám độ cao đất tại chỗ, không gắn vào nhà
      if (b.yard && this.plazaPool) {
        const zE = -(b.d / 2 + b.yard.f) + 30, zF = -D / 2 + 0.5, mx = W / 2 + 72, TS = 32;
        const ucx = dr && dr.along ? -W / 2 + bay * (dr.i0 + dr.n / 2) : 0;
        const gl = (lx, lz) => { const p = this.toWorld(B, lx, 0, lz); return this.groundAt(p.x, p.z) - (B.y - 1.5); };
        for (let x0 = -mx; x0 < mx - 0.1; x0 += TS) for (let z0 = zE; z0 < zF - 0.1; z0 += TS) {
          const sx = Math.min(TS, mx - x0), sz = Math.min(TS, zF - z0), lx = x0 + sx / 2, lz = z0 + sz / 2;
          // dày 3 đv cắm xuống đất (mặt sân cao hơn đất ~7 cm): đất gồ ghề không trồi lên giữa các tấm; tông đá đã cũ bụi
          const hc = Math.max(gl(lx, lz), gl(x0 + 1, z0 + 1), gl(x0 + sx - 1, z0 + 1), gl(x0 + 1, z0 + sz - 1), gl(x0 + sx - 1, z0 + sz - 1));
          put(this.plazaPool, lx, hc + 0.55 - 1.5, lz, sx + 0.05, 3, sz + 0.05, new THREE.Color(0xd8d4cc).multiplyScalar(0.74 + 0.08 * h()), 0, 0, false);
        }
        for (let x = -mx + 6; x < mx - 4; x += 14) {
          if (Math.abs(x - ucx) < 30) continue;
          const g0 = gl(x, zE + 2);
          bit('bollard', [put(this.rodPool, x, g0 + 3.6, zE + 2, 1.3, 7.2, 1.3, new THREE.Color(0x6a6d70), 0, 0, false)], x, g0 + 3.6, zE + 2, { h: 7.2, r: 1.2 });   // cọc thép cao ~0,9 m
        }
      }
      // 3) mái che sảnh trước khoang lối vào (theo P.door): khung thép sơn sẫm, vươn ~2,7 m
      if (!dr) return;
      const span = dr.n * bay + 6, cd = 22, uc = -((dr.along ? W : D) / 2) + bay * (dr.i0 + dr.n / 2), s = dr.s;
      const ry = dr.along ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      const at = (u, v) => dr.along ? [u, s * (D / 2 + v)] : [s * (W / 2 + v), u];
      const cy = y0 + FH * 0.84, steel = new THREE.Color(0x3b3f42);
      let [x, z] = at(uc, cd / 2);
      const cParts = [put(this.colPool, x, cy, z, span, 1.2, cd, steel, ry, 0, true)], cx0 = x, cz0 = z;
      [x, z] = at(uc, cd - 0.4);
      cParts.push(put(this.colPool, x, cy + 0.4, z, span + 0.4, 2.8, 0.8, steel.clone().multiplyScalar(1.15), ry, 0, true));
      const rl = Math.hypot(cd, 14), ra = Math.atan2(-cd, 14), rods = [];
      for (const k of [-1, 1]) {
        [x, z] = at(uc + k * (span / 2 - 2), cd / 2);
        rods.push(put(this.rodPool, x, cy + 7, z, 0.6, rl, 0.6, new THREE.Color(DECO_ROD), ry, ra, true));
      }
      // mái che: bản lề là mép tựa tường (gập xuống quanh trục dọc tường khi gãy giằng)
      {
        const [hx, hz] = at(uc, 0), hw = this.toWorld(B, hx, cy, hz);
        const t = this.dirToWorld(B, dr.along ? 1 : 0, 0, dr.along ? 0 : 1), n = dr.along ? this.dirToWorld(B, 0, 0, s) : this.dirToWorld(B, s, 0, 0);
        bit('canopy', cParts, cx0, cy, cz0, { rods: rods.filter(Boolean), hinge: hw, tx: t.x, tz: t.z, nx: n.x, nz: n.z, hs: span / 2 });
      }
      // 4) bồn cây bê tông 2 bên lối vào (cây bụi cắt tỉa)
      for (const k of [-1, 1]) {
        [x, z] = at(uc + k * (span / 2 + 7), 5.5);
        bit('planter', [put(this.colPool, x, y0 + 2.3, z, 10, 4.6, 5.5, new THREE.Color(0x9a968e), ry),
          put(this.litterPool, x, y0 + 5.6, z, 9, 3 + h() * 1.5, 5, new THREE.Color(h() < 0.6 ? 0x3f5a2c : 0x4d6332), ry)], x, y0 + 2.3, z, { h: 4.6, r: 5.5 });
      }
    }
    // ---- CHI TIẾT MÁI BẰNG (chỉ để nhìn, không va chạm): tường chắn mái, tum / lồng cầu thang, bồn nước inox nằm / đứng,
    // cục nóng điều hòa, ăng-ten, chảo vệ tinh, máy nước nóng mặt trời. Chọn theo hash vị trí nhà (không lấy RNG chung ->
    // mọi máy dựng giống nhau). Mỗi chi tiết gắn vào ô mái bên dưới (t.deco): ẩn khi cắt tầng / ô mái sập, rơi theo khi nhà sập.
    // NHÀ MÁI DỐC đã ở nhiều năm: máng xối tôn chạy dọc 2 mép mái chìa (từng đoạn theo ô mái, hơi võng lệch, đôi khi một đoạn
    // tuột móc xệ xuống), ống thoát nước đứng ở đầu nhà (cổ ống chéo dưới mái chìa, đai ốp tường mỗi tầng, cút xả ra sân), tường
    // sau ống ố vệt nước chảy + chân tường rêu bùn hắt, đất dưới miệng ống loang ẩm; thỉnh thoảng ống đã rơi mất chỉ còn vệt ố.
    // Ống khói gạch / đá ám muội ở nhà ở (nhà gỗ: ống khói tôn). Máng / cổ ống / ống khói gắn vào ô mái, đoạn ống + vệt ố gắn
    // vào mảng tường góc từng tầng (m.deco: ẩn khi mảng / ô sập, rơi theo khi nhà đổ). Chọn theo vị trí nhà (hash), không lấy
    // số RNG chung
    // BIỂN HIỆU CỬA HÀNG trên mảng tường tầng trệt kiểu cửa hàng: biển ngang trên đầu cửa cuốn (cỡ / độ cao lệch nhau từng khoang),
    // ~1/5 khoang có thêm biển dọc chìa ra vỉa hè ở tầng 2; phố bỏ hoang: biển treo xệ 1 đầu, biển rơi mất chỉ còn khung sắt.
    // Gắn vào mảng tường (m.deco): mảng sập thì biển rơi / ẩn theo. Chọn theo vị trí (hash), không lấy số RNG chung
    signDeco(B, P) {
      if (!this.signPool || P.st.ruined) return;
      const FH = B.FH, frame = new THREE.Color(0x3a3c3e);
      const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
      const put = (m, lx, ly, lz, sx, sy, sz, col, ry, rz) => {
        const local = new THREE.Matrix4().compose(V.set(lx, ly, lz), Q.setFromEuler(E.set(0, ry, rz || 0, 'YXZ')), S.set(sx, sy, sz));
        const world = B.base.clone().multiply(local);
        const idx = this.signPool.add(world, col);
        if (idx >= 0) (m.deco || (m.deco = [])).push({ pool: this.signPool, idx, local, world });
      };
      for (const m of B.walls) {
        if (m.floor !== 0 || m.side || !m.style || !m.style.startsWith('shop')) continue;
        const h = k => hash3(B.x * 0.013 + m.lx * 0.071 + k * 0.37, B.z * 0.011 + m.lz * 0.067 - k * 0.29, 40 + k);
        const r = h(1);
        if (r < 0.18) continue;                                                     // khoang không biển
        // pháp tuyến ra NGOÀI nhà (mặt chữ phải quay ra phố): lấy theo phía của mảng tường so với tâm nhà
        const fl = m.ox * m.lx + m.oz * m.lz < 0 ? -1 : 1, ox = m.ox * fl, oz = m.oz * fl, ry = m.ry + (fl < 0 ? Math.PI : 0);
        const w = m.sx * (0.78 + 0.2 * h(2)), sh = FH * (0.24 + 0.1 * h(3)), out = m.hz + 0.9;
        const y = m.ly + m.hy * (0.74 + 0.14 * h(4));
        const px = m.lx + ox * out, pz = m.lz + oz * out;
        const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.72 + 0.28 * h(5));
        if (r < 0.28) put(m, px, y, pz, w, sh, 0.35, frame, ry);                                     // rơi mất, còn khung
        else if (r < 0.4) put(m, px, y - sh * 0.3, pz, w, sh, 0.6, tint, ry, (h(6) < 0.5 ? 1 : -1) * (0.1 + 0.14 * h(7)));   // treo xệ
        else put(m, px, y, pz, w, sh, 0.6, tint, ry);
        // biển dọc chìa ra vỉa hè ở tầng 2 (tấm vuông góc mặt tường)
        if (h(8) < 0.2 && B.floors > 1) {
          const along = (h(9) - 0.5) * m.sx * 0.7, ax = Math.cos(m.ry), az = -Math.sin(m.ry), d = m.hz + 4;
          put(m, m.lx + ax * along + ox * d, m.ly + m.hy + FH * 0.55, m.lz + az * along + oz * d, FH * 0.4, FH * 1.1, 0.5, tint, ry + Math.PI / 2, (h(10) - 0.5) * 0.08);
        }
      }
    }
    eaveDeco(B, P) {
      const { b, st } = P, kind = b.kind;
      if (st.roof !== 'pitched' || st.ruined || !B.roofMods || !B.roofShape) return;
      const bay = st.bay, bx = B.bx, W = bx * bay, D = B.bz * bay, FH = B.FH, topY = B.topY;
      const y0 = B.roofShape.y0, rh = B.roofShape.h, hz2 = (D + 7) / 2;
      let hn = 0;
      const h = () => { hn++; return hash3(b.x * 0.0157 + hn * 0.419, b.z * 0.0213 - hn * 0.337, 80 + hn); };
      const hr = (a, c) => a + h() * (c - a);
      const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
      const put = (mod, pool, lx, ly, lz, sx, sy, sz, col, rx, ry, rz) => {
        const local = new THREE.Matrix4().compose(V.set(lx, ly, lz), Q.setFromEuler(E.set(rx || 0, ry || 0, rz || 0, 'YXZ')), S.set(sx, sy, sz));
        const world = B.base.clone().multiply(local);
        const idx = pool.add(world, col);
        if (idx < 0 || !mod) return;
        (mod.deco || (mod.deco = [])).push({ pool, idx, local, world });
      };
      const C = hex => new THREE.Color(hex);
      const metal = st.mat === 'metal', r0 = h();
      const pipeC = C(metal || r0 < 0.55 ? 0x9a9e98 : r0 < 0.8 ? 0x7a5a44 : 0xd8d4c8);
      // 1) máng xối: mỗi ô mái 1 đoạn, lệch dốc nhẹ khác nhau; ~1/4 số nhà có 1 đoạn tuột móc xệ ở đầu nhà
      const sag = h() < 0.25 ? { s: h() < 0.5 ? -1 : 1, i: h() < 0.5 ? 0 : bx - 1 } : null;
      for (const s of [-1, 1]) for (let i = 0; i < bx; i++) {
        const xa = -W / 2 + i * bay - (i === 0 ? 3.5 : 0), xb = -W / 2 + (i + 1) * bay + (i === bx - 1 ? 3.5 : 0);
        const droop = sag && sag.s === s && sag.i === i;
        const rz = droop ? (i === 0 ? 1 : -1) * hr(0.07, 0.12) : (h() - 0.5) * 0.014;
        put(B.roofMods[i], this.pipePool, (xa + xb) / 2, y0 - 0.3 - (droop ? 0.8 : 0), s * (hz2 + 0.35), xb - xa, 0.9, 1.0, pipeC.clone().multiplyScalar(hr(0.85, 1.05)), 0, 0, rz);
      }
      // 2) ống thoát nước ở đầu nhà, mỗi mép mái 1 ống (nhà dài: 2 ống)
      const zW = D / 2 + 0.7;
      for (const s of [-1, 1]) {
        const ends = W > 90 ? [-1, 1] : [h() < 0.5 ? -1 : 1];
        for (const e of ends) {
          const i = e < 0 ? 0 : bx - 1, x = e * (W / 2 - 2.2), gone = h() < 0.12;
          const wall = f => B.wgrid['z' + s][f * bx + i];
          // cổ ống chéo từ đáy máng vào sát tường dưới mái chìa
          const dz = hz2 + 0.35 - zW, dy = y0 - 0.7 - (topY - 2.5), L = Math.hypot(dz, dy);
          put(B.roofMods[i], this.pipePool, x, topY - 2.5 + dy / 2, s * (zW + dz / 2), 0.8, L + 0.6, 0.8, pipeC, s * Math.atan2(dz, dy));
          for (let f = 0; f < B.floors; f++) {
            const m = wall(f);
            if (!m) continue;
            const ya = f === 0 ? 2.6 : 1.5 + f * FH, yb = f === B.floors - 1 ? topY - 2.5 : 1.5 + (f + 1) * FH;
            if (!gone) {
              put(m, this.pipePool, x, (ya + yb) / 2, s * zW, 0.8, yb - ya, 0.8, pipeC);
              put(m, this.pipePool, x, (ya + yb) / 2 + hr(-2, 2), s * (D / 2 + 0.4), 1.3, 0.4, 0.8, pipeC.clone().multiplyScalar(0.7));
              if (f === 0) put(m, this.pipePool, x, 2.9, s * (D / 2 + 1.5), 0.8, 0.8, 1.9, pipeC);
            }
            // vệt ố trên tường sau ống (tầng trệt: tấm có chân loe rêu bùn)
            put(m, f === 0 ? this.footPool : this.stainPool, x - e * hr(0.6, 1.4), 1.5 + f * FH + FH / 2, s * (D / 2 + 0.08), hr(7, 9.5), FH, 1, C(0xffffff).multiplyScalar(hr(0.75, 1.1)), 0, s > 0 ? 0 : Math.PI);
          }
          // đất ẩm dưới miệng ống (chỉ nơi đất phẳng, tránh tấm phẳng cắm vào sườn dốc)
          const P0 = new THREE.Vector3(x, 0, s * (D / 2 + 2.6)).applyMatrix4(B.base), P1 = new THREE.Vector3(x + 2.5, 0, s * (D / 2 + 4.5)).applyMatrix4(B.base);
          const g0 = this.groundAt(P0.x, P0.z), g1 = this.groundAt(P1.x, P1.z);
          if (Math.abs(g0 - g1) < 0.8) put(null, this.wetPool, x, g0 - (B.y - 1.5) + 0.12, s * (D / 2 + 3), hr(6, 9), 1, hr(6, 9), C(0xffffff), 0, h() * 6.28);
        }
      }
      // 3) ống khói: nhà ở có bếp củi / lò sưởi
      if (!(kind === 'stone' || kind === 'farm' || kind === 'villa' || kind === 'stilt') || h() > 0.85) return;
      const i = bx > 2 ? 1 + Math.floor(h() * (bx - 2)) : Math.floor(h() * bx);
      const lx = -W / 2 + bay * (i + 0.5) + hr(-0.2, 0.2) * bay, zc = (h() < 0.5 ? -1 : 1) * hz2 * hr(0.15, 0.4);
      const surf = y0 + rh * (1 - Math.abs(zc) / hz2), yb = surf - 2.5, yt = y0 + rh + hr(3, 5.5), mod = B.roofMods[i];
      if (kind === 'stilt') {
        put(mod, this.pipePool, lx, (yb + yt) / 2, zc, 1.3, yt - yb, 1.3, C(0x8a8e88));
        put(mod, this.pipePool, lx, yt + 0.5, zc, 2.6, 0.5, 2.6, C(0x6a6e68));
        return;
      }
      const stackC = kind === 'stone' ? C(0xa49c90) : kind === 'villa' && h() < 0.5 ? B.color.clone() : C(0x9a5a46);
      put(mod, this.colPool, lx, (yb + yt) / 2, zc, 4.6, yt - yb, 3.8, stackC);
      put(mod, this.colPool, lx, yt - 0.8, zc, 4.75, 1.6, 3.95, C(0x3a3530));          // muội khói ám đầu ống
      put(mod, this.colPool, lx, yt + 0.35, zc, 5.6, 0.7, 4.8, C(0x8e8a82));           // tấm bê tông đậy
      put(mod, this.colPool, lx + hr(-0.8, 0.8), yt + 1.5, zc, 1.4, 1.6, 1.4, C(0x2e2a26));   // ống khói con đen muội
    }
    roofDeco(B, P) {
      const { b, st } = P, kind = b.kind;
      if (st.roof !== 'flat' || st.ruined || !DECO_KINDS[kind]) return;
      const Lv = B.levels.find(L => L.role === 'roof');
      if (!Lv || !Lv.tiles.length) return;
      const bay = st.bay, W = B.bx * bay, D = B.bz * bay, FH = B.FH;
      const yR = Lv.y + Lv.th / 2;   // mặt mái
      let hn = 0;
      const h = () => { hn++; return hash3(b.x * 0.0173 + hn * 0.371, b.z * 0.0191 - hn * 0.293, 50 + hn); };
      const hr = (a, c) => a + h() * (c - a);
      const tileAt = (lx, lz) => {
        const i = Math.min(B.bx - 1, Math.max(0, Math.floor((lx + W / 2) / bay))), j = Math.min(B.bz - 1, Math.max(0, Math.floor((lz + D / 2) / bay)));
        return Lv.tiles[i * B.bz + j];
      };
      const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
      // ry: xoay quanh trục đứng (sau cùng), rx: nghiêng, rz: xoay trục Y của hình về nằm ngang
      const put = (pool, lx, ly, lz, sx, sy, sz, col, ry, rx, rz, q) => {
        const local = new THREE.Matrix4().compose(V.set(lx, ly, lz), q || Q.setFromEuler(E.set(rx || 0, ry || 0, rz || 0, 'YXZ')), S.set(sx, sy, sz));
        const world = B.base.clone().multiply(local);
        const idx = pool.add(world, col);
        if (idx < 0) return;
        const t = tileAt(lx, lz);
        (t.deco || (t.deco = [])).push({ pool, idx, local, world });
      };
      const rot = (yaw, x, z) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
      const C = hex => new THREE.Color(hex);
      const desert = kind === 'mudbrick', tube = kind === 'tube', tower = kind === 'apartment' || kind === 'office';
      const wallC = (desert ? C(st.slab || 0xc8b090) : B.color.clone()).multiplyScalar(1.28);
      const topC = Lv.tiles[0].c.clone();
      const pt = 1.4;   // tường chắn mái dày ~18 cm
      // Trục dài / mặt tiền (nhà ống: mặt hẹp phía phố cao hơn, tum + bồn nước dồn về phía sau)
      const longX = B.bx >= B.bz, Lu = longX ? W : D, Lw = longX ? D : W;
      const P2 = (u, v) => longX ? [u, v] : [v, u];
      const frontS = h() < 0.5 ? -1 : 1;
      const ph = { tube: hr(5.5, 8), shop: hr(6, 9), apartment: hr(7.5, 9.5), office: hr(8, 10), mudbrick: hr(4, 6.5) }[kind];
      const phF = tube ? ph + hr(3.5, 7) : ph;
      // 1) Tường chắn mái quanh mép (đoạn theo từng ô mái; 2 cạnh x ngắn lại ở góc để không chồng mặt)
      for (let i = 0; i < B.bx; i++) {
        const lx = -W / 2 + bay * (i + 0.5);
        for (const s of [-1, 1]) {
          const hh = !longX && s === frontS ? phF : ph;
          put(this.colPool, lx, yR + hh / 2 - 0.3, s * (D / 2 - pt / 2), bay, hh + 0.3, pt, wallC);
        }
      }
      for (let j = 0; j < B.bz; j++) {
        const z0 = -D / 2 + bay * j + (j === 0 ? pt : 0), z1 = -D / 2 + bay * (j + 1) - (j === B.bz - 1 ? pt : 0);
        for (const s of [-1, 1]) {
          const hh = longX && s === frontS ? phF : ph;
          put(this.colPool, s * (W / 2 - pt / 2), yR + hh / 2 - 0.3, (z0 + z1) / 2, pt, hh + 0.3, z1 - z0, wallC);
        }
      }
      // Ô chiếm chỗ trên mái (tránh các chi tiết chồng lên nhau)
      const occ = [];
      const fits = (x, z, hx, hz) => Math.abs(x) + hx < W / 2 - pt - 0.4 && Math.abs(z) + hz < D / 2 - pt - 0.4 &&
        !occ.some(o => Math.abs(o.x - x) < o.hx + hx + 0.8 && Math.abs(o.z - z) < o.hz + hz + 0.8);
      const take = (x, z, hx, hz) => { if (!fits(x, z, hx, hz)) return false; occ.push({ x, z, hx, hz }); return true; };
      const spot = (hx, hz, tries) => {
        for (let k = 0; k < (tries || 8); k++) { const x = hr(-0.5, 0.5) * W, z = hr(-0.5, 0.5) * D; if (take(x, z, hx, hz)) return { x, z }; }
        return null;
      };
      // mặt trước cục nóng quay vào giữa mái khi đặt sát tường chắn (axisX: tường chắn vuông góc trục x, s: phía)
      const faceIn = (axisX, s) => axisX ? (s > 0 ? -Math.PI / 2 : Math.PI / 2) : (s > 0 ? Math.PI : 0);
      const tankCol = () => {
        const r = h();
        return C(desert ? (r < 0.5 ? 0x34363a : r < 0.8 ? 0xd9dcdd : 0x6f8da8) : (r < 0.86 ? 0xdfe3e6 : r < 0.95 ? 0x5d86ad : 0x3b3e41));
      };
      // 2) Bồn nước: nằm trên 2 chân đỡ thép / đứng trên khung đế; y = mặt đặt
      const tank = (x, y, z, horiz, yaw) => {
        if (horiz) {
          const d = hr(8.2, 9.6), L = hr(12.5, 16);
          for (const s of [-0.3, 0.3]) {
            const [ox, oz] = rot(yaw, s * L, 0);
            put(this.colPool, x + ox, y + 1.2, z + oz, 1.2, 2.4, d * 0.8, C(DECO_STEEL), yaw);
          }
          put(this.tankPool, x, y + 2.2 + d / 2, z, d, L, d, tankCol(), yaw, 0, Math.PI / 2);
        } else {
          const d = hr(7.6, 9), H = hr(9.5, 12);
          put(this.colPool, x, y + 1.0, z, d * 0.92, 2.0, d * 0.92, C(DECO_STEEL), yaw);
          put(this.tankPool, x, y + 2 + H / 2, z, d, H, d, tankCol(), yaw);
        }
      };
      // 3) Cục nóng điều hòa (big: dàn nóng lớn của cao ốc)
      const ac = (x, z, yaw, big) => {
        const w = big ? hr(10, 13) : hr(6, 7), hh = big ? hr(8, 10) : hr(4.4, 5), dd = big ? hr(5, 7) : hr(2.4, 2.8);
        put(this.acPool, x, yR + 0.4 + hh / 2, z, w, hh, dd, C(DECO_AC).multiplyScalar(hr(0.82, 1)), yaw);
      };
      const acRow = (n, big) => {
        const alongX = h() < 0.5, s = h() < 0.5 ? -1 : 1, r = big ? 6.5 : 3.6, rc = big ? 3.5 : 1.4;
        const len = alongX ? W : D, edge = (alongX ? D : W) / 2 - pt - rc - 0.6, step = big ? 15 : 8.5;
        const start = hr(-0.5, 0.5) * Math.max(0, len - 2 * pt - 2 * r - (n - 1) * step) - (n - 1) * step / 2;
        for (let k = 0; k < n; k++) {
          const a = start + k * step, x = alongX ? a : s * edge, z = alongX ? s * edge : a;
          if (take(x, z, alongX ? r : rc, alongX ? rc : r)) ac(x, z, faceIn(!alongX, s), big);
        }
      };
      // 4) Ăng-ten TV (cột + cần ngang + các thanh chấn tử)
      const yagi = (x, y, z) => {
        const H = hr(20, 32), yaw = hr(0, 6.283), L = hr(12, 16), top = y + H - hr(1, 3);
        put(this.rodPool, x, y + H / 2, z, 0.55, H, 0.55, C(DECO_ROD));
        const [ax, az] = rot(yaw, 1, 0);
        put(this.rodPool, x + ax * L * 0.3, top, z + az * L * 0.3, 0.35, L, 0.35, C(DECO_ROD), yaw, 0, Math.PI / 2);
        for (let k = 0; k < 6; k++) {
          const p = (-0.12 + k * 0.17) * L;
          put(this.rodPool, x + ax * p, top, z + az * p, 0.25, 10.5 - k * 0.9, 0.25, C(DECO_ROD), yaw + Math.PI / 2, 0, Math.PI / 2);
        }
      };
      // 5) Chảo vệ tinh trên cột ngắn, cả bản đồ chĩa cùng hướng; tay đỡ đầu thu chìa ra giữa lòng chảo
      const dish = (x, y, z) => {
        const dD = hr(6, desert ? 9 : 8), poleH = hr(3.5, 6.5), cy = y + poleH;
        const ld = DISH_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -B.angle);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ld);
        put(this.rodPool, x, y + poleH / 2, z, 0.6, poleH, 0.6, C(DECO_ROD));
        put(this.dishPool, x, cy, z, dD, dD, dD, C(DECO_DISH).multiplyScalar(hr(0.85, 1)), 0, 0, 0, q);
        put(this.rodPool, x + ld.x * dD * 0.3, cy + ld.y * dD * 0.3, z + ld.z * dD * 0.3, 0.3, dD * 0.6, 0.3, C(DECO_ROD), 0, 0, 0, q);
      };
      const edgeSpot = (r) => {
        for (let k = 0; k < 6; k++) {
          const ax = h() < 0.5, s = h() < 0.5 ? -1 : 1, a = hr(-0.45, 0.45) * (ax ? D : W);
          const e = (ax ? W : D) / 2 - pt - r - 0.8, x = ax ? s * e : a, z = ax ? a : s * e;
          if (take(x, z, r, r)) return { x, z };
        }
        return null;
      };
      // Tum (lồng cầu thang ra sân thượng) + cửa quay về phía mặt tiền; trả về mặt nóc để đặt bồn / ăng-ten
      const tum = (uc, vc, td, tw, th, doorS) => {
        const [cx, cz] = P2(uc, vc), [sx, sz] = P2(td, tw);
        if (!take(cx, cz, sx / 2, sz / 2)) return null;
        put(this.colPool, cx, yR + th / 2 - 0.3, cz, sx, th + 0.3, sz, wallC);
        put(this.colPool, cx, yR + th + 0.5, cz, sx + 2, 1.2, sz + 2, topC);
        const [dx, dz] = P2(uc + doorS * (td / 2 + 0.15), vc + hr(-0.25, 0.25) * Math.max(0, tw - 10));
        const [dsx, dsz] = P2(0.5, 7);
        put(this.colPool, dx, yR + 8, dz, dsx, 16, dsz, C(DECO_DOOR));
        return { x: cx, z: cz, sx, sz, y: yR + th + 1.1 };
      };
      const yawLong = longX ? 0 : Math.PI / 2;
      // 6) Rác / đồ bỏ trên sân thượng, dồn sát tường chắn / góc: lốp xe cũ (có khi chồng 2-3 cái), túi rác buộc túm, tấm bạt /
      //    nilon bẹp, gạch vỡ & mảnh bê tông, ván gỗ / pallet cũ, thùng xốp (có thùng trồng rau)
      const junk = () => {
        const n = 2 + Math.floor(h() * (desert ? 2 : 4)) + (h() < 0.3 ? 2 : 0);
        for (let k = 0; k < n; k++) {
          const t = h(), yaw = hr(0, 6.283);
          if (t < 0.17) {
            const p = edgeSpot(3.2);
            if (!p) continue;
            for (let q = 0, m = h() < 0.35 ? 2 + Math.floor(h() * 2) : 1; q < m; q++)
              put(this.tirePool, p.x + hr(-0.3, 0.3), yR + 0.75 + q * 1.45, p.z + hr(-0.3, 0.3), 3.7, 3.7, 3.7, C(0x2a2928).multiplyScalar(hr(0.8, 1.25)), yaw);
          } else if (t < 0.4) {
            const p = edgeSpot(2.5), cols = [0x1c1d1f, 0x1c1d1f, 0x2a3b5c, 0xbcbdb4, 0x3c5a3a];
            if (!p) continue;
            for (let q = 0, m = 1 + Math.floor(h() * 3); q < m; q++) {
              const s = hr(3, 4.6);
              put(this.litterPool, p.x + hr(-2, 2), yR + s * 0.36, p.z + hr(-2, 2), s * hr(0.9, 1.2), s * hr(0.7, 0.9), s, C(cols[Math.floor(h() * cols.length)]), hr(0, 6.283));
            }
          } else if (t < 0.54) {
            const p = spot(5, 5), cols = [0x3a5f8a, 0x8a8f86, 0x5d6b3a, 0xb8b2a0];
            if (p) put(this.litterPool, p.x, yR + 0.2, p.z, hr(10, 15), 0.4, hr(7, 11), C(cols[Math.floor(h() * 4)]), yaw);
          } else if (t < 0.72) {
            const p = spot(4, 4);
            if (!p) continue;
            for (let q = 0, m = 3 + Math.floor(h() * 5); q < m; q++) {
              const brick = h() < 0.6;
              put(this.litterPool, p.x + hr(-4, 4), yR + 0.4, p.z + hr(-4, 4), brick ? 1.8 : hr(1.2, 2.6), brick ? 0.7 : hr(0.6, 1.2), brick ? 0.9 : hr(1.2, 2.2),
                C(brick ? 0x8a4a34 : 0x8c8a84).multiplyScalar(hr(0.8, 1.1)), hr(0, 6.283));
            }
          } else if (t < 0.88) {
            const p = edgeSpot(5);
            if (!p) continue;
            const wood = C(0x6e5a42).multiplyScalar(hr(0.7, 1.1));
            if (h() < 0.5) { for (let q = 0; q < 3; q++) put(this.boxPool, p.x, yR + 0.3 + q * 0.6, p.z, hr(8, 12), 0.6, 1.4, wood, yaw + hr(-0.15, 0.15)); }
            else {
              for (const s of [-1, 0, 1]) { const [ox, oz] = rot(yaw, 0, s * 3.2); put(this.boxPool, p.x + ox, yR + 0.5, p.z + oz, 9.6, 1.0, 0.9, wood, yaw); }
              put(this.boxPool, p.x, yR + 1.12, p.z, 9.6, 0.25, 8, wood.clone().multiplyScalar(1.1), yaw);
            }
          } else {
            // thùng xốp: 1-3 thùng cạnh nhau, có thùng trồng rau (sân thượng nhà phố)
            const p = edgeSpot(4.5);
            if (!p) continue;
            for (let q = 0, m = 1 + Math.floor(h() * 3); q < m; q++) {
              const [ox, oz] = rot(yaw, (q - 1) * 4.8, 0);
              put(this.boxPool, p.x + ox, yR + 1.6, p.z + oz, 4.4, 3.2, 3.2, C(0xd8d6cc).multiplyScalar(hr(0.75, 0.95)), yaw);
              if (!desert && h() < 0.5) put(this.litterPool, p.x + ox, yR + 3.3, p.z + oz, 4.0, hr(0.9, 1.8), 2.8, C(h() < 0.7 ? 0x3d5a2a : 0x5a6b30).multiplyScalar(hr(0.8, 1.1)), yaw);
            }
          }
        }
      };
      if (tower) {
        // Đỉnh cao ốc: mũ tường chắn mái nhô ra ngoài (chung cư: bê tông; văn phòng: ốp nhôm sẫm) + chung cư có gờ mái bê tông
        // nhô ~0,3 m chạy quanh nhà ngang sàn mái -> đỉnh nhà có đường bóng đổ, không còn là mép hộp vuông sắc
        const capC = kind === 'office' ? C(0x7d8386) : wallC.clone().multiplyScalar(1.06), corC = B.color.clone().multiplyScalar(1.12);
        const capY = yR + ph + 0.15, co = 2.4, corY = yR - Lv.th / 2 + 1.2;
        for (let i = 0; i < B.bx; i++) {
          const e0 = i === 0 ? 1 : 0, e1 = i === B.bx - 1 ? 1 : 0;
          for (const s of [-1, 1]) {
            put(this.colPool, -W / 2 + bay * (i + 0.5) + (e1 - e0) * 0.4, capY, s * (D / 2 - pt / 2 + 0.3), bay + (e0 + e1) * 0.4, 0.7, pt + 1.2, capC);
            if (kind === 'apartment') put(this.colPool, -W / 2 + bay * (i + 0.5) + (e1 - e0) * co / 2, corY, s * (D / 2 + co / 2), bay + (e0 + e1) * co, 3.4, co, corC);
          }
        }
        for (let j = 0; j < B.bz; j++) {
          const z0 = -D / 2 + bay * j + (j === 0 ? pt : 0), z1 = -D / 2 + bay * (j + 1) - (j === B.bz - 1 ? pt : 0);
          for (const s of [-1, 1]) {
            put(this.colPool, s * (W / 2 - pt / 2 + 0.3), capY, (z0 + z1) / 2, pt + 1.2, 0.7, z1 - z0, capC);
            if (kind === 'apartment') put(this.colPool, s * (W / 2 + co / 2), corY, -D / 2 + bay * (j + 0.5), co, 3.4, bay, corC);
          }
        }
        // Lồng cầu thang (1-2 lõi) nhô lên, cao ốc có thêm phòng máy thang máy cao hơn bên cạnh
        const n = W * D > bay * bay * 36 ? 3 : W * D > bay * bay * 16 ? 2 : 1;
        const cores = [];
        for (let k = 0; k < n; k++) {
          const td = bay * hr(1.15, 1.6), tw = bay * hr(0.75, 1.0), th = FH * hr(0.9, 1.05);
          const uc = n === 1 ? hr(-0.25, 0.25) * Lu : (k / (n - 1) - 0.5) * Lu * hr(0.5, 0.6), vc = hr(-0.2, 0.2) * Lw;
          const T2 = tum(uc, vc, td, tw, th, h() < 0.5 ? -1 : 1);
          if (!T2) continue;
          cores.push(T2);
          // bồn nước kê trên nóc lõi thang
          if (h() < 0.5) tank(T2.x + (h() - 0.5) * T2.sx * 0.4, T2.y, T2.z + (h() - 0.5) * T2.sz * 0.4, h() < 0.5, yawLong);
          if (kind === 'office' && k === 0) {
            const mw = td * 0.55, [mx, mz] = P2(uc + td / 2 + mw / 2, vc), [msx, msz] = P2(mw, tw * 0.8), mh = th * hr(1.2, 1.4);
            if (take(mx, mz, msx / 2, msz / 2)) {
              put(this.colPool, mx, yR + mh / 2 - 0.3, mz, msx, mh + 0.3, msz, wallC);
              put(this.colPool, mx, yR + mh + 0.4, mz, msx + 1.4, 1.0, msz + 1.4, topC);
            }
          }
        }
        // bồn nước inox cụm 2-4 cái, dàn nóng điều hòa theo hàng sát tường chắn
        const nt = 2 + Math.floor(h() * 3);
        for (let k = 0; k < nt; k++) {
          const horiz = h() < 0.55, p = spot(horiz ? 8.5 : 5, horiz ? 8.5 : 5);
          if (p) tank(p.x, yR, p.z, horiz, yawLong + (h() < 0.3 ? Math.PI / 2 : 0));
        }
        acRow(kind === 'office' ? 2 + Math.floor(h() * 3) : 4 + Math.floor(h() * 6), kind === 'office');
        if (kind === 'apartment' && h() < 0.6) acRow(3 + Math.floor(h() * 4), false);
        for (let k = 0, nd = 1 + Math.floor(h() * 2); k < nd; k++) { const p = edgeSpot(4.5); if (p) dish(p.x, yR, p.z); }
        if (h() < 0.55) { const p = spot(3, 3); if (p) yagi(p.x, yR, p.z); }
        // cột ăng-ten viễn thông trên nóc lồng thang cao ốc
        if (kind === 'office' && cores[0] && h() < 0.6) {
          const c = cores[0], H = hr(40, 60);
          put(this.rodPool, c.x, c.y + H / 2, c.z, 1.1, H, 1.1, C(DECO_ROD));
          for (let k = 0; k < 3; k++) put(this.rodPool, c.x, c.y + H * (0.55 + k * 0.15), c.z, 0.3, 8 - k * 1.5, 0.3, C(DECO_ROD), hr(0, 3.14), 0, Math.PI / 2);
        }
        junk();
        return;
      }
      // Nhà ống / khối nhà phố / nhà đất sa mạc
      let T1 = null;
      if ((tube && h() < 0.68) || (kind === 'shop' && h() < 0.45) || (desert && h() < 0.35)) {
        const tw = Math.min(Lw - 2 * pt - 1.6, hr(22, 30)), td = Math.min(Lu * 0.4, hr(24, 34)), th = FH * hr(0.82, 0.95);
        const uc = -frontS * (Lu / 2 - pt - td / 2 - 0.8 - hr(0, 4)), vc = (Lw / 2 - pt - tw / 2 - 0.8) * (h() * 2 - 1);
        T1 = tum(uc, vc, td, tw, th, frontS);
      }
      const nTank = desert ? (h() < 0.45 ? 1 : 0) : tube ? (h() < 0.2 ? 2 : 1) : 1 + Math.floor(h() * 2);
      for (let k = 0; k < nTank; k++) {
        const horiz = h() < (tube ? 0.6 : 0.5);
        if (T1 && k === 0 && h() < 0.8) {
          // bồn nước đặt trên nóc tum: rất đặc trưng nhà ống
          tank(T1.x, T1.y, T1.z, horiz, yawLong);
          continue;
        }
        // không có tum: bồn kê sát tường chắn phía sau
        const r = horiz ? 8.5 : 5;
        const [x, z] = P2(-frontS * (Lu / 2 - pt - r - 1 - hr(0, 10) - k * 18), (Lw / 2 - pt - r - 0.6) * (h() * 2 - 1));
        if (take(x, z, r, r)) tank(x, yR, z, horiz, yawLong);
      }
      // cục nóng điều hòa sát tường chắn hông
      const nac = desert ? (h() < 0.3 ? 1 : 0) : tube ? Math.floor(h() * 3) : 1 + Math.floor(h() * 4);
      for (let k = 0; k < nac; k++) {
        const s = h() < 0.5 ? -1 : 1, [x, z] = P2(hr(-0.4, 0.3) * Lu * -frontS, s * (Lw / 2 - pt - 1.4 - 0.6)), [hx, hz] = P2(3.6, 1.4);
        if (take(x, z, hx, hz)) ac(x, z, faceIn(!longX, s), false);
      }
      // máy nước nóng năng lượng mặt trời: tấm ống thu nghiêng + bồn nằm trên mép cao
      if (!desert && h() < (tube ? 0.16 : 0.12)) {
        const yaw = yawLong + Math.PI / 2 * (h() < 0.5 ? 1 : -1), p = spot(9, 9);
        if (p) {
          const tilt = -0.62, hy = 6 * Math.sin(-tilt), hz = 6 * Math.cos(tilt);
          put(this.colPool, p.x, yR + 1 + hy, p.z, 14, 0.8, 12, C(0x262b33), yaw, tilt);
          const [ox, oz] = rot(yaw, 0, hz + 1.2);
          put(this.tankPool, p.x + ox, yR + 1 + hy * 2 + 2.4, p.z + oz, 4.6, 14, 4.6, C(0xdfe3e6), yaw, 0, Math.PI / 2);
          for (const sx of [-6, 6]) {
            const [lx, lz] = rot(yaw, sx, hz);
            put(this.rodPool, p.x + lx, yR + (1 + hy * 2) / 2, p.z + lz, 0.5, 1 + hy * 2, 0.5, C(DECO_ROD));
          }
        }
      }
      // ăng-ten TV (nhiều nhà ống vẫn còn) / chảo vệ tinh
      if (h() < (desert ? 0.2 : tube ? 0.45 : 0.4)) {
        if (T1 && h() < 0.6) yagi(T1.x + (h() - 0.5) * T1.sx * 0.6, T1.y, T1.z + (h() - 0.5) * T1.sz * 0.6);
        else { const p = edgeSpot(2); if (p) yagi(p.x, yR, p.z); }
      }
      if (h() < (desert ? 0.6 : tube ? 0.3 : 0.35)) { const p = edgeSpot(4.5); if (p) dish(p.x, yR, p.z); }
      junk();
    }

    toLocal(B, x, y, z) {
      const dx = x - B.x, dz = z - B.z;
      const c = Math.cos(-B.angle), s = Math.sin(-B.angle);
      return { x: dx * c + dz * s, y: y - (B.y - 1.5), z: -dx * s + dz * c };
    }
    toWorld(B, lx, ly, lz) {
      const c = Math.cos(B.angle), s = Math.sin(B.angle);
      return { x: B.x + lx * c + lz * s, y: ly + B.y - 1.5, z: B.z - lx * s + lz * c };
    }
    dirToWorld(B, x, y, z) { const c = Math.cos(B.angle), s = Math.sin(B.angle); return { x: x * c + z * s, y, z: -x * s + z * c }; }
    dirToLocal(B, d) { const c = Math.cos(B.angle), s = Math.sin(B.angle); return { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c }; }

    modWorldPos(m) { return new THREE.Vector3().setFromMatrixPosition(m.world); }
    hideMod(m) { if (m.kit) { if (m.h) m.kit.hide(m.h); } else m.pool.hide(m.idx); if (m.deco) this.decoVis(m, false); }
    // Chi tiết mái gắn trên ô mái m (bồn nước, tường chắn, ăng-ten...): ẩn / hiện theo ô mái
    decoVis(m, on) { for (const d of m.deco) d.pool.set(d.idx, on ? d.world : ZERO); }
    tintMod(m, c) { if (m.kit) { if (m.h) m.kit.color(m.h, c); } else m.pool.color(m.idx, c); }

    // ---- ĐỒNG BỘ: trạng thái gọn từng nhà ('C' = đã sập; mỗi mô-đun 1 ký tự: 0 nguyên, 1 vỡ kính / sứt mặt, 2 thủng, 4 mất hẳn)
    // Ký tự cơ số 36 = trạng thái + 5 x mức nứt kết cấu (0..3, hp còn > 75% / 50% / 25% / ≤ 25%)
    stateString() {
      const R = { ok: 0, glass: 1, scarred: 1, holed: 2, stub: 3, gone: 4 };
      const lv = m => m.state === 'gone' || !(m.hp0 > 0) ? 0 : Math.max(0, Math.min(3, Math.floor((1 - Math.max(0, m.hp) / m.hp0) * 4 + 1e-6)));
      return this.items.map(B => B.collapsed ? 'C' : B.mods.map(m => ((R[m.state] || 0) + 5 * lv(m)).toString(36)).join('')).join('|');
    }
    // Áp trạng thái của máy khác theo kiểu HỢP NHẤT: chỉ phá thêm, không dựng lại (phá hủy luôn cộng dồn)
    applyState(str, fx) {
      const R = { ok: 0, glass: 1, scarred: 1, holed: 2, stub: 3, gone: 4 };
      const parts = String(str || '').split('|');
      this._syncing = true;
      try {
        parts.forEach((code, i) => {
          const B = this.items[i];
          if (!B || B.collapsed || !code) return;
          if (code === 'C') { this.collapse(B, fx); return; }
          let changed = false;
          B.mods.forEach((m, k) => {
            const v = parseInt(code[k], 36) || 0, t = v % 5, cur = R[m.state] || 0, cap = m.hp0 * (1 - Math.floor(v / 5) / 4);
            // nứt kết cấu: chỉ hạ độ bền xuống mức của máy kia, không hồi lại
            if (t < 3 && m.state !== 'gone' && m.hp > cap + 1e-6) {
              m.hp = cap; changed = true;
              if (m.role !== 'wall') { this.tintMod(m, m.c.clone().multiplyScalar(0.45 + 0.5 * clamp01(m.hp / m.hp0))); if (m.state === 'ok') m.state = 'scarred'; }
            }
            if (t <= cur) return;
            if (t >= 3) { this.setGone(B, m, fx, true); if (m.slice) this.roofBreach({ B, fx }, m, 0); changed = true; }
            else if (m.role === 'wall' && t === 2) {
              this.carve(B, m, 0, 0, { hole: B.st.bay * 0.3, crater: B.st.bay * 0.45, soot: B.st.bay * 0.5, chip: 0, stretch: 1, tx: 1, ty: 0, noise: holeNoise(), seed: rand(0, 1000), inner: false });
              changed = true;
            } else if (m.role === 'wall' && t === 1) { this.shatter(B, m, null); changed = true; }
            else if (t === 1) { m.state = 'scarred'; changed = true; }   // ô sàn / cột sứt mẻ
          });
          if (changed) { this.rebuildDamage(B); this.checkStructure(B, fx); this.syncPiles(B); }
        });
      } finally { this._syncing = false; }
      this.commitAll();
    }

    // ---------------------------------------------------------------------------
    // LƯỚI Ô CỦA MẢNG TƯỜNG ĐÃ TRÚNG ĐẠN
    // ---------------------------------------------------------------------------
    toMask(B, m) {
      const nx = Math.max(6, Math.round(B.st.bay / 1.7)), ny = Math.max(6, Math.round(B.FH / 1.7)), n = nx * ny;
      m.mk = { nx, ny, cw: B.st.bay / nx, ch: B.FH / ny, s: new Uint8Array(n).fill(1), hp: new Float32Array(n).fill(1),
        so: new Uint8Array(n), si: new Uint8Array(n), st: new Uint8Array(n), gone: 0, bow: -1, ver: 1 };
      // mảng tường giờ có hình riêng: bỏ instance dùng chung
      if (m.h) { m.kit.hide(m.h); m.h = null; }
      if (m.state === 'ok' || m.state === 'glass') m.state = 'scarred';
      B.dmgPanels.add(m);
      return m.mk;
    }
    // Ô tại điểm (hệ tọa độ nhà) có còn đặc không
    cellSolid(B, m, L) {
      const K = m.mk;
      if (!K) return true;
      const rx = L.x - m.lx, rz = L.z - m.lz;
      const px = rx * m.ax + rz * m.az, py = L.y - m.ly;
      const i = Math.max(0, Math.min(K.nx - 1, Math.floor((px + B.st.bay / 2) / K.cw)));
      const j = Math.max(0, Math.min(K.ny - 1, Math.floor((py + B.FH / 2) / K.ch)));
      return K.s[j * K.nx + i] === 1;
    }
    /**
     * Khoét mảng tường m tại (px, py) (hệ mảng: x dọc tường, y đứng, tâm mảng = 0).
     * P: hole / crater / soot (bán kính), chip (đạn nhỏ đục dần), stretch + (tx, ty) (kéo dài theo hướng đạn khi bắn xiên),
     *    noise (méo viền theo góc), seed, inner (nổ từ phía trong nhà -> bóc lở mặt trong)
     */
    carve(B, m, px, py, P) {
      if (m.state === 'gone') return { removed: 0 };
      const K = m.mk || this.toMask(B, m);
      const bay = B.st.bay, FH = B.FH;
      const Rm = Math.max(P.hole * 1.5, P.crater * 1.4, P.soot * 1.3) * Math.max(1, P.stretch) + 2;
      const gx0 = m.lx * m.ax + m.lz * m.az;
      let removed = 0, sx = 0, sy = 0, touched = false;
      for (let j = 0; j < K.ny; j++) {
        const cy = -FH / 2 + (j + 0.5) * K.ch, dy = cy - py;
        if (Math.abs(dy) > Rm) continue;
        for (let i = 0; i < K.nx; i++) {
          const k = j * K.nx + i;
          if (!K.s[k]) continue;
          const cx = -bay / 2 + (i + 0.5) * K.cw, dx = cx - px;
          if (Math.abs(dx) > Rm) continue;
          const a = dx * P.tx + dy * P.ty, b = -dx * P.ty + dy * P.tx;
          const d = Math.hypot(a / P.stretch, b);
          const nn = 1 + P.noise(Math.atan2(dy, dx)) + (hash3(cx + gx0, cy + m.ly, P.seed) - 0.5) * 0.24;
          const hR = P.hole * nn;
          if (hR > 0 && d < hR) { K.s[k] = 0; removed++; sx += cx; sy += cy; continue; }
          const cR = P.crater * nn;
          if (d < cR) {
            touched = true;
            let lvl;
            if (P.chip) {
              // đạn nhỏ: 1 phát chỉ mẻ vài cm (vết đạn dán, xem wallDebris) -> ô tường (~30 cm) chỉ bóc lở khi bị đục
              // nhiều phát dồn vào một chỗ, rồi thủng
              K.hp[k] -= P.chip * (1 - d / cR);
              lvl = K.hp[k] > 0.6 ? 0 : Math.min(3, 1 + Math.floor((0.6 - Math.max(0, K.hp[k])) / 0.6 * 3));
            } else lvl = Math.min(3, 1 + Math.floor(2.99 * (1 - (d - Math.max(0, hR)) / Math.max(0.5, cR - Math.max(0, hR)))));
            if (P.inner) K.si[k] = Math.max(K.si[k], lvl); else K.so[k] = Math.max(K.so[k], lvl);
            // bóc lở cả 2 mặt / đục mãi một chỗ: thủng xuyên
            if ((P.chip && K.hp[k] <= 0) || K.so[k] + K.si[k] >= 5) { K.s[k] = 0; removed++; sx += cx; sy += cy; continue; }
          }
          if (P.soot > 0 && !P.inner) {
            const sR = P.soot * nn;
            if (d < sR) { K.st[k] = Math.min(255, K.st[k] + 235 * Math.pow(1 - d / sR, 1.3)); touched = true; }
          }
        }
      }
      // lỗ xuyên nhỏ hơn 1 ô lưới (đạn xuyên / nổ lõm): vẫn thủng đúng ô ngay điểm chạm
      if (P.hole > 0 && !removed) {
        const i = Math.floor((px + bay / 2) / K.cw), j = Math.floor((py + FH / 2) / K.ch);
        if (i >= 0 && j >= 0 && i < K.nx && j < K.ny && K.s[j * K.nx + i]) {
          K.s[j * K.nx + i] = 0; removed = 1; sx = -bay / 2 + (i + 0.5) * K.cw; sy = -FH / 2 + (j + 0.5) * K.ch;
        }
      }
      let islands = 0;
      if (removed) islands = this.dropIslands(K);
      K.gone += removed + islands;
      if (removed || touched) { K.ver++; K.bow = P.inner ? 1 : -1; }
      if (K.gone >= K.nx * K.ny * 0.82) { this.setGone(B, m, null); }
      else if (K.gone > 0) m.state = 'holed';
      return { removed: removed + islands, cx: removed ? sx / removed : px, cy: removed ? sy / removed : py };
    }
    // Mảng tường treo lơ lửng (không còn dính vào mép mảng nào) rơi xuống
    dropIslands(K) {
      const { nx, ny, s } = K, seen = new Uint8Array(nx * ny), st = [];
      for (let i = 0; i < nx; i++) { st.push(i, (ny - 1) * nx + i); }
      for (let j = 0; j < ny; j++) { st.push(j * nx, j * nx + nx - 1); }
      while (st.length) {
        const k = st.pop();
        if (seen[k] || !s[k]) continue;
        seen[k] = 1;
        const i = k % nx, j = (k - i) / nx;
        if (i > 0) st.push(k - 1); if (i < nx - 1) st.push(k + 1);
        if (j > 0) st.push(k - nx); if (j < ny - 1) st.push(k + nx);
      }
      let n = 0;
      for (let k = 0; k < nx * ny; k++) if (s[k] && !seen[k]) { s[k] = 0; n++; }
      return n;
    }

    // 4 mảng tường kề cùng mặt phẳng [trái, phải, dưới, trên] (theo trục x / y của mảng), nhớ sẵn trên m
    panelNb(B, m) {
      if (m.nb) return m.nb;
      const bay = B.st.bay, FH = B.FH, nb = [null, null, null, null];
      for (const q of B.walls) {
        if (q === m || Math.abs(q.ry - m.ry) > 1e-3) continue;
        const rx = q.lx - m.lx, rz = q.lz - m.lz;
        if (Math.abs(rx * m.ox + rz * m.oz) > 0.5) continue;
        const d = rx * m.ax + rz * m.az, dy = q.ly - m.ly;
        if (Math.abs(dy) < 0.5) { if (Math.abs(d + bay) < 0.5) nb[0] = q; else if (Math.abs(d - bay) < 0.5) nb[1] = q; }
        else if (Math.abs(d) < 0.5) { if (Math.abs(dy + FH) < 0.5) nb[2] = q; else if (Math.abs(dy - FH) < 0.5) nb[3] = q; }
      }
      return (m.nb = nb);
    }
    // Khóa hình của mảng: đổi khi mảng hoặc mảng kề đổi (đỉnh ở mép mảng lấy cả ô của mảng kề)
    panelKey(B, m) {
      let s = '' + m.mk.ver;
      for (const q of this.panelNb(B, m)) s += q ? (q.state === 'gone' ? ',g' : ',' + (q.mk ? q.mk.ver : 0)) : ',-';
      return s;
    }
    // Hình của 1 mảng tường đã trúng đạn (tọa độ thế giới). Lưới ô (mk) chỉ là dữ liệu (va chạm / đồng bộ),
    // hình dựng kiểu "marching squares" trên trường giá trị ở ĐỈNH ô (trung bình các ô quanh đỉnh + nhiễu cố định
    // theo vị trí): viền lỗ thủng và mép vành bóc lở cắt chéo lởm chởm theo hình lỗ chứ không bậc thang theo ô,
    // đỉnh lưới quanh vùng hỏng xô lệch nhẹ, mặt bóc lở lõm dần về phía lỗ (gồ ghề, mặt gãy phẳng từng mảnh),
    // màu thô / muội khói loang mượt theo đỉnh. Ô nguyên vẹn xa vùng hỏng vẫn gộp theo hàng (ít tam giác).
    panelGeo(B, m) {
      const K = m.mk, bay = B.st.bay, FH = B.FH, T = B.T, raw = B.WM.edge, cb = m.c;
      const { nx, ny, cw, ch } = K, W = nx + 1, NA = 12, TH = 0.5, TS = 0.55, EU = 0.09, EV = 0.93;
      const P = [], N = [], U = [], C = [];
      // nhiễu theo vị trí thế giới trên mặt tường (không theo mảng) -> 2 mảng kề nhau khớp viền ở đường nối
      const gx0 = m.lx * m.ax + m.lz * m.az - bay / 2, gy0 = m.ly - FH / 2, sd = (B.seedG % 997) * 0.1 + m.ry;
      const nz = (i, j, s) => hash3(gx0 + i * cw + s * 13.7, gy0 + j * ch - s * 5.3, sd + s) - 0.5;
      // Ô ngoài mép mảng lấy từ mảng kề cùng mặt (trái / phải / dưới / trên): mảng mất hẳn = thủng, chưa trúng đạn = nguyên
      // trả chỉ số ô trong lưới cK, hoặc -1 không có ô (bỏ qua), -2 thủng, -3 nguyên vẹn
      const nb = this.panelNb(B, m);
      let cK = K;
      const cellAt = (ci, cj) => {
        let q = m, a = ci, b = cj;
        if (ci < 0 || ci >= nx) { if (cj < 0 || cj >= ny) return -1; q = nb[ci < 0 ? 0 : 1]; a = ci < 0 ? nx - 1 : 0; }
        else if (cj < 0 || cj >= ny) { q = nb[cj < 0 ? 2 : 3]; b = cj < 0 ? ny - 1 : 0; }
        if (!q) return -1;
        if (q.state === 'gone') return -2;
        if (!q.mk || q.mk.nx !== nx || q.mk.ny !== ny) return -3;
        cK = q.mk;
        return b * nx + a;
      };
      // Đỉnh: [0 x, 1 y, 2 độ đặc, 3 mức bóc trước, 4 mức bóc sau, 5 z mặt trước, 6 z mặt sau, 7/8 mức màu thô trước/sau,
      //        9 muội (0..1), 10 sắc mặt gãy, 11 sạn]. Ô thủng tính như bóc sâu (trước 3, sau 2) -> quanh lỗ luôn có vành lở hình phễu
      const V = new Array(W * (ny + 1));
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        let n = 0, sS = 0, so = 0, si = 0, ns = 0, stt = 0;
        for (let cj = j - 1; cj <= j; cj++) for (let ci = i - 1; ci <= i; ci++) {
          cK = K;
          const k = cellAt(ci, cj);
          if (k === -1) continue;
          n++;
          if (k === -3) { sS++; ns++; continue; }
          if (k >= 0 && cK.s[k]) { sS++; so += cK.so[k]; si += cK.si[k]; stt += cK.st[k]; ns++; } else { so += 3; si += 2; }
        }
        so /= n; si /= n;
        let zf = T / 2 - T * 0.2 * so - T * 0.12 * (nz(i, j, 4) + 0.5) * Math.min(1, so);
        let zb = -T / 2 + T * 0.2 * si + T * 0.12 * (nz(i, j, 5) + 0.5) * Math.min(1, si);
        if (zf - zb < 0.14 * T) { const c = (zf + zb) / 2; zf = c + 0.07 * T; zb = c - 0.07 * T; }
        V[j * W + i] = [-bay / 2 + i * cw, -FH / 2 + j * ch, sS / n + 0.62 * nz(i, j, 1), so + 0.9 * nz(i, j, 2), si + 0.9 * nz(i, j, 3),
          zf, zb, Math.min(3, so), Math.min(3, si), ns ? stt / ns / 255 : 0, 0.72 + 0.14 * (nz(i, j, 6) + 0.5), 0.9 + 0.2 * (nz(i, j, 7) + 0.5)];
      }
      // Ô cửa sổ: trên mảng nguyên chỉ là hình vẽ trên texture, nhưng ngoài đời là LỖ MỞ trên tường (kính đã vỡ hết khi
      // tường bị khoét). Lưới mảng vỡ coi đỉnh trong ô cửa là rỗng -> ô cửa thành lỗ thật có má cửa bê tông, nhìn xuyên vào
      // phòng; vành bóc lở quanh lỗ đạn dừng ở mép ô cửa (trước đây phủ cả lên ô cửa thành mảng bê tông đặc).
      // Đỉnh sát ô cửa: bỏ nhiễu độ đặc & không xô lệch -> mép ô cửa thẳng, không lởm chởm như mép vỡ
      const wr = m.side ? [] : winRects(m.style), win = new Uint8Array(W * (ny + 1));
      if (wr.length) {
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
          const tx = i / nx * 128, ty = (1 - j / ny) * 128;
          if (wr.some(([x, y, rw, rh]) => tx > x && tx < x + rw && ty > y && ty < y + rh)) { win[j * W + i] = 1; V[j * W + i][2] = -0.6; }
        }
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
          if (win[j * W + i]) continue;
          let near = false;
          for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii >= 0 && jj >= 0 && ii <= nx && jj <= ny && win[jj * W + ii] === 1) { near = true; break; }
          }
          if (!near) continue;
          win[j * W + i] = 2;
          if (V[j * W + i][2] >= 0.6) V[j * W + i][2] = 1;
        }
      }
      // ô nguyên vẹn hẳn (cả 4 đỉnh đặc, không bóc, không muội): gộp theo hàng như cũ
      const plain = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (!K.s[j * nx + i]) continue;
        let ok = 1;
        for (const c of [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1]) { const a = V[c]; if (a[2] < TH || a[3] >= TS || a[4] >= TS || a[9] > 0) ok = 0; }
        plain[j * nx + i] = ok;
      }
      // xô lệch đỉnh không dính ô nguyên vẹn (đỉnh ở mép mảng chỉ trượt dọc mép -> mép mảng vẫn thẳng, không hở khe)
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        let free = true;
        for (let cj = j - 1; cj <= j; cj++) for (let ci = i - 1; ci <= i; ci++) if (ci >= 0 && cj >= 0 && ci < nx && cj < ny && plain[cj * nx + ci]) free = false;
        if (!free || win[j * W + i]) continue;
        const a = V[j * W + i];
        if (i > 0 && i < nx) a[0] += nz(i, j, 8) * 0.6 * cw;
        if (j > 0 && j < ny) a[1] += nz(i, j, 9) * 0.6 * ch;
      }
      // em: cạnh ô chứa đỉnh (1 dưới, 2 phải, 4 trên, 8 trái); fc / gf / gb: đỉnh nằm trên viền lỗ / mép bóc trước / mép bóc sau
      const vert = (a, em) => ({ a, em, fc: false, gf: false, gb: false });
      const lerpV = (p, q, t, fl) => {
        const a = new Array(NA);
        for (let z = 0; z < NA; z++) a[z] = p.a[z] + (q.a[z] - p.a[z]) * t;
        const v = { a, em: p.em & q.em, fc: p.fc && q.fc, gf: p.gf && q.gf, gb: p.gb && q.gb };
        v[fl] = true;
        return v;
      };
      // cắt đa giác theo trường giá trị số fi tại ngưỡng th (Sutherland–Hodgman, nội suy tuyến tính trên cạnh)
      const clip = (poly, fi, th, above, fl) => {
        const out = [];
        for (let q = 0; q < poly.length; q++) {
          const p = poly[q], r = poly[(q + 1) % poly.length];
          const pin = (p.a[fi] >= th) === above, rin = (r.a[fi] >= th) === above;
          if (pin) out.push(p);
          if (pin !== rin) out.push(lerpV(p, r, (th - p.a[fi]) / (r.a[fi] - p.a[fi]), fl));
        }
        return out;
      };
      const tri = (p, q, r, wn, flat) => {
        const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
        let a = uy * vz - uz * vy, b = uz * vx - ux * vz, c = ux * vy - uy * vx;
        const L = Math.hypot(a, b, c);
        if (L < 1e-6) return;
        if (a * wn[0] + b * wn[1] + c * wn[2] < 0) { const t = q; q = r; r = t; a = -a; b = -b; c = -c; }
        if (flat) { a = wn[0]; b = wn[1]; c = wn[2]; } else { a /= L; b /= L; c /= L; }
        for (const s of [p, q, r]) { P.push(s[0], s[1], s[2]); N.push(a, b, c); U.push(s[3], s[4]); C.push(s[5][0], s[5][1], s[5][2]); }
      };
      const sootK = a => 1 - 0.86 * a[9];
      const cFI = a => { const s = sootK(a); return [cb.r * s, cb.g * s, cb.b * s]; };
      const cBI = [cb.r * 0.5, cb.g * 0.5, cb.b * 0.5];
      const cFS = a => {
        const l = a[7], t = 0.5 + 0.12 * l, sh = 1.04 - 0.1 * l, s = sootK(a) * a[11];
        return [(cb.r + (raw[0] * sh - cb.r) * t) * s, (cb.g + (raw[1] * sh - cb.g) * t) * s, (cb.b + (raw[2] * sh - cb.b) * t) * s];
      };
      const cBS = a => { const s = 0.5 * a[11]; return [raw[0] * s, raw[1] * s, raw[2] * s]; };
      const cE = a => { const s = a[10] * (1 - 0.5 * a[9]); return [raw[0] * s, raw[1] * s, raw[2] * s]; };
      const face = (poly, side, sp) => {
        const wn = [0, 0, side];
        const pts = poly.map(({ a }) => sp ? [a[0], a[1], side > 0 ? a[5] : a[6], EU, EV, side > 0 ? cFS(a) : cBS(a)]
          : [a[0], a[1], side * T / 2, a[0] / bay + 0.5, a[1] / FH + 0.5, side > 0 ? cFI(a) : cBI]);
        for (let q = 1; q + 1 < pts.length; q++) tri(pts[0], pts[q], pts[q + 1], wn, !sp);
      };
      // vách đứng giữa 2 đỉnh a -> b (đa giác ngược chiều kim đồng hồ: pháp tuyến quay ra ngoài)
      const wall = (a, b, za0, za1, zb0, zb1) => {
        const wn = [b[1] - a[1], a[0] - b[0], 0], ca = cE(a), cB = cE(b);
        const A0 = [a[0], a[1], za0, EU, EV, ca], A1 = [a[0], a[1], za1, EU, EV, ca], B0 = [b[0], b[1], zb0, EU, EV, cB], B1 = [b[0], b[1], zb1, EU, EV, cB];
        tri(A0, B0, B1, wn, false); tri(A0, B1, A1, wn, false);
      };
      // 1 mảnh: mặt trước / sau (nguyên hoặc bóc lở), vách viền lỗ + mép mảng (bm), gờ mép vành bóc lở
      const piece = (poly, fS, bS, bm) => {
        if (poly.length < 3) return;
        face(poly, 1, fS); face(poly, -1, bS);
        const zt = a => fS ? a[5] : T / 2, zb = a => bS ? a[6] : -T / 2;
        for (let q = 0; q < poly.length; q++) {
          const v = poly[q], w = poly[(q + 1) % poly.length], a = v.a, b = w.a;
          if ((v.fc && w.fc) || (v.em & w.em & bm)) wall(a, b, zb(a), zt(a), zb(b), zt(b));
          if (!fS && v.gf && w.gf) wall(a, b, a[5], T / 2, b[5], T / 2);
          if (!bS && v.gb && w.gb) wall(a, b, -T / 2, a[6], -T / 2, b[6]);
        }
      };
      for (let j = 0; j < ny; j++) {
        let i = 0;
        while (i < nx) {
          const bm = (j === 0 ? 1 : 0) | (j === ny - 1 ? 4 : 0) | (i === 0 ? 8 : 0);
          if (plain[j * nx + i]) {
            let e = i + 1;
            while (e < nx && plain[j * nx + e]) e++;
            piece([vert(V[j * W + i], 9), vert(V[j * W + e], 3), vert(V[(j + 1) * W + e], 6), vert(V[(j + 1) * W + i], 12)], false, false, bm | (e === nx ? 2 : 0));
            i = e;
            continue;
          }
          const a00 = V[j * W + i], a10 = V[j * W + i + 1], a11 = V[(j + 1) * W + i + 1], a01 = V[(j + 1) * W + i];
          if (a00[2] >= TH || a10[2] >= TH || a11[2] >= TH || a01[2] >= TH) {
            const sol = clip([vert(a00, 9), vert(a10, 3), vert(a11, 6), vert(a01, 12)], 2, TH, true, 'fc');
            let polys = [sol];
            // 2 góc chéo đặc, giữa ô thủng: tách thành 2 mảnh tam giác
            if (sol.length === 6 && (a00[2] + a10[2] + a11[2] + a01[2]) / 4 < TH) {
              let r = 0;
              while (sol[r].fc) r++;
              const s = q => sol[(r + q) % 6];
              polys = [[s(0), s(1), s(5)], [s(2), s(3), s(4)]];
            }
            const cbm = bm | (i === nx - 1 ? 2 : 0);
            for (const p of polys) {
              const fp = [clip(p, 3, TS, false, 'gf'), clip(p, 3, TS, true, 'gf')];
              for (let fs = 0; fs < 2; fs++) {
                if (fp[fs].length < 3) continue;
                piece(clip(fp[fs], 4, TS, false, 'gb'), fs === 1, false, cbm);
                piece(clip(fp[fs], 4, TS, true, 'gb'), fs === 1, true, cbm);
              }
            }
          }
          i++;
        }
      }
      // Nhà có tầng trệt khác tầng trên: texture atlas 2 nửa -> dồn v về nửa dưới (tầng trệt) / nửa trên (tầng trên)
      // vách hông kín: mặt trước / sau lấy 1 điểm vữa trơn (atlas không có mẫu tường kín)
      if (m.side) for (let q = 0; q < U.length; q += 2) { U[q] = 0.08; U[q + 1] = 0.93; }
      if (B.atlas) {
        const n = B.atlas.length, si = Math.max(0, B.atlas.indexOf(m.style));
        for (let q = 1; q < U.length; q += 2) U[q] = (U[q] + si) / n;
      }
      const pos = new Float32Array(P), nrm = new Float32Array(N);
      const e = m.frame.elements, v = new THREE.Vector3();
      for (let q = 0; q < pos.length; q += 3) {
        v.set(pos[q], pos[q + 1], pos[q + 2]).applyMatrix4(m.frame);
        pos[q] = v.x; pos[q + 1] = v.y; pos[q + 2] = v.z;
        const x = nrm[q], y = nrm[q + 1], z = nrm[q + 2];
        nrm[q] = e[0] * x + e[4] * y + e[8] * z; nrm[q + 1] = e[1] * x + e[5] * y + e[9] * z; nrm[q + 2] = e[2] * x + e[6] * y + e[10] * z;
      }
      return { pos, nrm, uv: new Float32Array(U), col: new Float32Array(C) };
    }
    // Cốt thép trong lỗ thủng (nhà bê tông cốt thép): thanh còn neo 2 đầu thì cong võng theo hướng sóng nổ,
    // lỗ rộng / neo 1 đầu thì gãy cụt chĩa ra, mảng nổ bay sạch không còn neo thì mất luôn
    rebarGeo(B, m) {
      const K = m.mk, bay = B.st.bay, FH = B.FH, bow = K.bow;
      const r = seededRng((m.id * 9973 + K.ver * 131 + B.seedG) >>> 0);
      const rr = (a, b) => a + r() * (b - a);
      const segs = [];
      const bar = pts => { for (let q = 0; q + 1 < pts.length; q++) segs.push([pts[q], pts[q + 1]]); };
      const runs = (len, solidAt, cb) => {
        let a = -1;
        for (let t = 0; t <= len; t++) {
          const hole = t < len && !solidAt(t);
          if (hole && a < 0) a = t;
          if (!hole && a >= 0) { cb(a, t - 1, a > 0, t < len); a = -1; }
        }
      };
      const step = 3;
      for (let i = 1; i < K.nx && segs.length < 40; i += step) {
        const x = -bay / 2 + (i + 0.5) * K.cw;
        runs(K.ny, j => K.s[j * K.nx + i], (j0, j1, aB, aT) => {
          if (!aB && !aT) return;
          const ya = -FH / 2 + j0 * K.ch, yb = -FH / 2 + (j1 + 1) * K.ch, L = yb - ya;
          if (aB && aT && L < 15 && r() < 0.8) bar([[x, ya - 0.5, 0], [x + rr(-0.8, 0.8), (ya + yb) / 2, bow * L * rr(0.12, 0.3)], [x, yb + 0.5, 0]]);
          else {
            if (aB) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[x, ya - 0.5, 0], [x, ya + l * 0.45, bow * l * 0.1], [x + rr(-1, 1), ya + l * 0.8, bow * l * rr(0.4, 0.8)]]); }
            if (aT) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[x, yb + 0.5, 0], [x, yb - l * 0.45, bow * l * 0.1], [x + rr(-1, 1), yb - l * 0.8, bow * l * rr(0.4, 0.8)]]); }
          }
        });
      }
      for (let j = 1; j < K.ny && segs.length < 72; j += step) {
        const y = -FH / 2 + (j + 0.5) * K.ch;
        runs(K.nx, i => K.s[j * K.nx + i], (i0, i1, aL, aR) => {
          if (!aL && !aR) return;
          const xa = -bay / 2 + i0 * K.cw, xb = -bay / 2 + (i1 + 1) * K.cw, L = xb - xa;
          if (aL && aR && L < 15 && r() < 0.8) bar([[xa - 0.5, y, 0], [(xa + xb) / 2, y - rr(0.3, 1.6), bow * L * rr(0.12, 0.3)], [xb + 0.5, y, 0]]);
          else {
            if (aL) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[xa - 0.5, y, 0], [xa + l * 0.5, y - rr(0, 1), bow * l * 0.15], [xa + l * 0.85, y - rr(0.5, 2.5), bow * l * rr(0.4, 0.8)]]); }
            if (aR) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[xb + 0.5, y, 0], [xb - l * 0.5, y - rr(0, 1), bow * l * 0.15], [xb - l * 0.85, y - rr(0.5, 2.5), bow * l * rr(0.4, 0.8)]]); }
          }
        });
      }
      if (!segs.length) return null;
      const list = [], up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), Bv = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), M = new THREE.Matrix4();
      for (const [a, b] of segs) {
        A.set(a[0], a[1], a[2]); Bv.set(b[0], b[1], b[2]);
        d.subVectors(Bv, A); const L = d.length(); if (L < 0.05) continue;
        q.setFromUnitVectors(up, d.normalize());
        const g = new THREE.BoxGeometry(0.28, L + 0.2, 0.28).toNonIndexed();
        g.applyMatrix4(M.compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
        g.applyMatrix4(m.frame);
        list.push(g);
      }
      return list.length ? merge(list) : null;
    }
    // Gộp hình mọi mảng tường đã trúng đạn của 1 nhà thành 1 mesh (+1 mesh cốt thép): ít draw call
    // Tính trước hình các mảng tường vừa đổi, dừng khi hết ngân sách thời gian (ms). Trả về true nếu đã xong hết
    prepPanels(B, budget) {
      const t0 = performance.now();
      for (const m of B.dmgPanels) {
        if (m.state === 'gone' || (B.cut && this.isCutMod(B, m))) continue;
        const key = this.panelKey(B, m);
        if (m.geoKey === key) continue;
        if (performance.now() - t0 > budget) return false;
        m.geo = this.panelGeo(B, m);
        if (m.geoVer !== m.mk.ver) {
          if (m.bar) m.bar.dispose();
          m.bar = B.st.rc && m.mk.gone > 0 ? this.rebarGeo(B, m) : null;
          m.geoVer = m.mk.ver;
        }
        m.geoKey = key;
      }
      return true;
    }
    rebuildDamage(B) {
      const parts = [], bars = [];
      for (const m of B.dmgPanels) {
        if (m.state === 'gone' || (B.cut && this.isCutMod(B, m))) continue;
        const key = this.panelKey(B, m);
        if (m.geoKey !== key) {
          m.geo = this.panelGeo(B, m);
          if (m.geoVer !== m.mk.ver) {
            if (m.bar) m.bar.dispose();
            m.bar = B.st.rc && m.mk.gone > 0 ? this.rebarGeo(B, m) : null;
            m.geoVer = m.mk.ver;
          }
          m.geoKey = key;
        }
        parts.push(m.geo);
        if (m.bar) bars.push(m.bar);
      }
      if (!B.dmgMesh) {
        B.dmgMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.dmgMats[B.dmgKey]);
        B.dmgMesh.castShadow = B.dmgMesh.receiveShadow = true;
        B.dmgMesh.userData.building = B;
        this.group.add(B.dmgMesh);
      }
      let n = 0;
      for (const p of parts) n += p.pos.length;
      const pos = new Float32Array(n), nrm = new Float32Array(n), uv = new Float32Array(n / 3 * 2), col = new Float32Array(n);
      let o = 0, ou = 0;
      for (const p of parts) { pos.set(p.pos, o); nrm.set(p.nrm, o); col.set(p.col, o); uv.set(p.uv, ou); o += p.pos.length; ou += p.uv.length; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      B.dmgMesh.geometry.dispose();
      B.dmgMesh.geometry = g;
      B.dmgMesh.visible = n > 0 && !B.collapsed;
      if (B.barMesh) { this.group.remove(B.barMesh); B.barMesh.geometry.dispose(); B.barMesh = null; }
      if (bars.length && !B.collapsed) {
        B.barMesh = new THREE.Mesh(merge(bars), REBAR_MAT());
        B.barMesh.raycast = () => {};   // không chặn tia dò va chạm của phòng thử
        this.group.add(B.barMesh);
      }
    }

    // ---------------------------------------------------------------------------
    // VA CHẠM ĐẠN: đoạn bay cắt mặt tường / sàn / mái còn đặc (lọt qua lỗ thủng & ô cửa đã vỡ toác)
    // ---------------------------------------------------------------------------
    wallAt(B, key, along, py) {
      const f = Math.floor((py - 1.5) / B.FH);
      if (f < 0 || f >= B.floors) return null;
      const n = key[0] === 'z' ? B.bx : B.bz, half = key[0] === 'z' ? B.halfW : B.halfD;
      const i = Math.max(0, Math.min(n - 1, Math.floor((along + half) / B.st.bay)));
      return B.wgrid[key][f * n + i] || null;
    }
    tileAt(B, Lv, px, pz) {
      const i = Math.max(0, Math.min(B.bx - 1, Math.floor((px + B.halfW) / B.st.bay)));
      const j = Math.max(0, Math.min(B.bz - 1, Math.floor((pz + B.halfD) / B.st.bay)));
      return Lv.tiles[i * B.bz + j] || null;
    }
    // Ô mái dốc / vòm tại hoành độ x (hệ nhà)
    roofSliceAt(B, x) { return B.roofMods[Math.max(0, Math.min(B.roofMods.length - 1, Math.floor((x + B.halfW) / B.st.bay)))]; }
    // Điểm p (hệ nhà) nằm trong phần mái dốc / vòm còn đứng (ô mái đã sập là lỗ hổng, đạn bay lọt qua)
    inRoof(B, p) {
      const R = B.roofShape;
      if (Math.abs(p.x) > R.hx || p.y < R.y0 || p.y > R.y0 + R.h) return false;
      const u = (p.y - R.y0) / R.h;
      if (!(R.kind === 'pitched' ? Math.abs(p.z) <= R.hz * (1 - u) : u * u + (p.z / R.hz) * (p.z / R.hz) <= 1)) return false;
      return this.roofSliceAt(B, p.x).state !== 'gone';
    }
    segHitB(B, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const hw = B.halfW, hd = B.halfD, T = B.T, wallTop = 1.5 + B.floors * B.FH;
      let best = null;
      // Tường: mặt ngoài (đạn từ ngoài vào) & mặt trong (đạn đã lọt vào nhà bắn ra)
      for (const axis of ['x', 'z']) {
        const p0 = axis === 'x' ? a.x : a.z, dp = axis === 'x' ? dx : dz, half = axis === 'x' ? hw : hd, lim = axis === 'x' ? hd : hw;
        if (Math.abs(dp) < 1e-9) continue;
        for (const sgn of [1, -1]) {
          for (const outer of [true, false]) {
            if (outer ? dp * sgn > 0 : dp * sgn < 0) continue;
            const t = (sgn * (outer ? half : half - T) - p0) / dp;
            if (t < 0 || t > 1 || (best && t >= best.t)) continue;
            const L = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
            if (L.y < 0.5 || L.y > wallTop) continue;
            const along = axis === 'x' ? L.z : L.x;
            if (Math.abs(along) > lim) continue;
            const m = this.wallAt(B, axis + sgn, along, L.y);
            if (!m || m.state === 'gone' || !this.cellSolid(B, m, L)) continue;
            best = { t, part: 'wall', m, L, ln: outer ? [m.ox, 0, m.oz] : [-m.ox, 0, -m.oz], inside: !outer };
          }
        }
      }
      // Sàn / mái: mặt trên (đạn rơi xuống) & mặt dưới (đạn bay lên)
      if (Math.abs(dy) > 1e-9) {
        for (const Lv of B.levels) {
          const top = dy < 0, yy = Lv.y + (top ? Lv.th / 2 : -Lv.th / 2);
          const t = (yy - a.y) / dy;
          if (t < 0 || t > 1 || (best && t >= best.t)) continue;
          const L = { x: a.x + dx * t, y: yy, z: a.z + dz * t };
          if (Math.abs(L.x) > hw + 0.6 || Math.abs(L.z) > hd + 0.6) continue;
          const m = this.tileAt(B, Lv, L.x, L.z);
          if (!m || m.state === 'gone') continue;
          best = { t, part: Lv.role, m, L, ln: [0, top ? 1 : -1, 0], inside: !(top && Lv.role === 'roof') };
        }
      }
      // Mái dốc / mái vòm: dò theo đoạn rồi chia đôi tìm điểm chạm
      if (B.roofMods && B.roofMods.some(m => m.state !== 'gone')) {
        // cắt đoạn theo hộp bao mái trước rồi mới dò dày trong hộp: trước đây chia cả đoạn làm 12 bước -> đoạn dài
        // (tia ngắm kính / đường đạn bay xa ~1 km) bước 80-100 đv nhảy qua hẳn mái dày vài đv -> đạn / tâm ngắm xuyên mái
        const R0 = B.roofShape;
        let t0 = 0, t1 = 1;
        for (const [p0, dp, lo, hi] of [[a.x, dx, -R0.hx, R0.hx], [a.y, dy, R0.y0, R0.y0 + R0.h], [a.z, dz, -R0.hz, R0.hz]]) {
          if (Math.abs(dp) < 1e-9) { if (p0 < lo || p0 > hi) { t0 = 1; t1 = 0; } continue; }
          let ta = (lo - p0) / dp, tb = (hi - p0) / dp;
          if (ta > tb) { const q = ta; ta = tb; tb = q; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        }
        const n = 16;
        let prevT = t0;
        for (let k = 0; k <= n && t0 <= t1; k++) {
          const t = t0 + (t1 - t0) * k / n;
          if (best && t >= best.t) break;
          const p = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
          if (this.inRoof(B, p)) {
            let lo = prevT, hi = t;
            for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; if (this.inRoof(B, { x: a.x + dx * mid, y: a.y + dy * mid, z: a.z + dz * mid })) hi = mid; else lo = mid; }
            const L = { x: a.x + dx * hi, y: a.y + dy * hi, z: a.z + dz * hi }, R = B.roofShape;
            let ln = R.kind === 'pitched' ? [0, R.hz, Math.sign(L.z) * R.h] : [0, (L.y - R.y0) / (R.h * R.h), L.z / (R.hz * R.hz)];
            // Trúng mặt ĐẦU HỒI (tam giác / bán nguyệt dựng đứng ở hai đầu nóc, |x| = hx) hoặc mặt cắt của đoạn mái đã sập:
            // điểm ngay trước khi chạm vẫn nằm trong mặt cắt ngang của mái, chỉ ra ngoài theo trục x -> pháp tuyến là ±x,
            // không phải pháp tuyến mặt mái dốc (trước đây dấu điểm ngắm / vết đạn trên đầu hồi nằm nghiêng theo mái, nhìn
            // từ phía đầu hồi chỉ thấy một vệt chéo)
            const Lo = { x: a.x + dx * lo, y: a.y + dy * lo, z: a.z + dz * lo }, uo = (Lo.y - R.y0) / R.h;
            const inProfile = uo >= 0 && uo <= 1 && (R.kind === 'pitched' ? Math.abs(Lo.z) <= R.hz * (1 - uo) : uo * uo + (Lo.z / R.hz) * (Lo.z / R.hz) <= 1);
            const xOut = Math.abs(Lo.x) >= R.hx - 0.05 || this.roofSliceAt(B, Lo.x).state === 'gone';
            if (inProfile && xOut && Math.abs(dx) > 1e-9) ln = [dx > 0 ? -1 : 1, 0, 0];
            const l = Math.hypot(ln[0], ln[1], ln[2]) || 1; ln = [ln[0] / l, ln[1] / l, ln[2] / l];
            best = { t: hi, part: 'roof', m: this.roofSliceAt(B, L.x), L, ln, inside: false };
            break;
          }
          prevT = t;
        }
      }
      return best;
    }
    // Đoạn bay (thế giới) -> điểm chạm nhà gần nhất { x, y, z, nx, ny, nz, B, part, m, L, inside }
    // Lưới ô SEG_CELL: mỗi nhà ghi vào các ô hộp bao (tâm ± r) của nó chạm tới. Đạn bay / bộ giải ngắm gọi hàm này
    // mỗi bước mô phỏng (~750 bước / phát dự đoán): trước đây duyệt MỌI nhà mỗi lần (~2/3 thời gian mô phỏng đường đạn).
    // Ứng viên xét theo đúng thứ tự chỉ số như vòng cũ -> cùng nhà thắng khi hoà khoảng cách: kết quả y hệt
    segGrid() {
      const G = this._segGrid;
      if (G && G.items === this.items && G.n === this.items.length) return G;
      const C = SEG_CELL, cells = new Map();
      this.items.forEach((B, i) => {
        const r = B._segR = Math.hypot(B.halfW, B.halfD) + 6;
        for (let cx = Math.floor((B.x - r) / C); cx <= Math.floor((B.x + r) / C); cx++) {
          for (let cz = Math.floor((B.z - r) / C); cz <= Math.floor((B.z + r) / C); cz++) {
            const k = cx * 65536 + cz;
            const l = cells.get(k);
            if (l) l.push(i); else cells.set(k, [i]);
          }
        }
      });
      return (this._segGrid = { items: this.items, n: this.items.length, cells, mark: new Int32Array(this.items.length), stamp: 0, cand: [] });
    }
    segmentHit(x0, y0, z0, x1, y1, z1) {
      let best = null;
      const G = this.segGrid(), C = SEG_CELL;
      const cx0 = Math.floor(Math.min(x0, x1) / C), cx1 = Math.floor(Math.max(x0, x1) / C);
      const cz0 = Math.floor(Math.min(z0, z1) / C), cz1 = Math.floor(Math.max(z0, z1) / C);
      let list = this.items, idx = null;
      if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) <= 64) {   // đoạn dài (dò tầm nhìn xa): duyệt hết như cũ
        const st = ++G.stamp, cand = G.cand;
        cand.length = 0;
        for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
          const l = G.cells.get(cx * 65536 + cz);
          if (l) for (const i of l) if (G.mark[i] !== st) { G.mark[i] = st; cand.push(i); }
        }
        if (!cand.length) return null;
        if (cand.length > 1) cand.sort((a, b) => a - b);
        idx = cand;
      }
      const N = idx ? idx.length : list.length;
      for (let j = 0; j < N; j++) {
        const B = idx ? list[idx[j]] : list[j];
        if (B.collapsed) continue;
        const r = B._segR;
        if (Math.max(x0, x1) < B.x - r || Math.min(x0, x1) > B.x + r || Math.max(z0, z1) < B.z - r || Math.min(z0, z1) > B.z + r) continue;
        if (Math.min(y0, y1) > B.y + B.hitTop) continue;
        if (segPointDist(x0, z0, x1, z1, B.x, B.z) > r) continue;
        const h = this.segHitB(B, this.toLocal(B, x0, y0, z0), this.toLocal(B, x1, y1, z1));
        if (h && (!best || h.t < best.t)) { h.B = B; best = h; }
      }
      if (!best) return null;
      const B = best.B, w = this.toWorld(B, best.L.x, best.L.y, best.L.z), n = this.dirToWorld(B, best.ln[0], best.ln[1], best.ln[2]);
      return Object.assign(best, { x: w.x, y: w.y, z: w.z, nx: n.x, ny: n.y, nz: n.z, type: 'BUILDING' });
    }

    // ---------------------------------------------------------------------------
    // TRÚNG ĐẠN
    // ---------------------------------------------------------------------------
    /**
     * Đạn nổ / xuyên tại (x, y, z). info: { t: loại va chạm ('BUILDING' = trúng thẳng nhà), dx/dy/dz: hướng bay }.
     * override: { power } hệ số sức phá (đạn xuyên đã mất bớt năng lượng).
     */
    damageAt(x, y, z, ammo, heavy, fx, override, info) {
      info = info || {};
      let I = bldInfo(ammo, heavy);
      if (override && override.power !== undefined) {
        const k = override.power;
        I = Object.assign({}, I, { hole: I.hole * k, crater: I.crater * Math.sqrt(k), sp: I.sp * k, glass: I.glass * Math.sqrt(k), sd: (I.sd || 0) * k, kg: (I.kg || 0) * k });
      }
      const events = [];
      this.yardBlast(x, y, z, I, fx);   // mái che sảnh, bồn cây, cọc chắn xe quanh chân cao ốc
      const dl = Math.hypot(info.dx || 0, info.dy || 0, info.dz || 0);
      const dir = dl > 1e-6 ? { x: info.dx / dl, y: info.dy / dl, z: info.dz / dl } : null;
      // Trúng thẳng: dò lại đúng mặt bị chạm từ hướng bay (mọi máy cùng điểm nổ chuẩn -> cùng kết quả)
      const direct = info.t === 'BUILDING' && dir ? this.segmentHit(x - dir.x * 30, y - dir.y * 30, z - dir.z * 30, x + dir.x * 4, y + dir.y * 4, z + dir.z * 4) : null;
      // Kính: vỡ chắc chắn trong bán kính I.glass, thưa dần tới ~3 lần (xem blastNear)
      const reach = Math.max(I.glass * 3, I.sr, I.crater * 1.5, I.soot * 1.2) + 10;
      // Mảnh văng bay xa: dò tia từ tâm nổ, tia nào chạm mặt tường trong tầm thì găm rỗ đúng chỗ đó
      // (tự đúng che chắn, mặt quay về phía vụ nổ, mật độ thưa dần theo bình phương khoảng cách)
      const frags = this.fragmentRays(x, y, z, ammo, heavy, info);
      for (const B of this.items) {
        if (B.collapsed) { if (B.rubbleTop && B.rubbleT >= 1) this.blastRubble(B, x, y, z, ammo, heavy, fx); continue; }
        const fh = frags.get(B);
        if (!fh && Math.hypot(x - B.x, z - B.z) > Math.hypot(B.halfW, B.halfD) + reach) continue;
        const ctx = { B, I, fx, touched: new Set(), changed: false, inside: false, floor: -1, glassFx: 0, ammo };
        let L = this.toLocal(B, x, y, z);
        if (direct && direct.B === B) { this.directHit(ctx, direct, dir); L = direct.L; }
        else {
          // Nổ ngoài trời sát nhà / nổ bên trong nhà (đạn lọt vào qua lỗ thủng, đạn con xuyên mái)
          const inBox = Math.abs(L.x) < B.halfW - B.T && Math.abs(L.z) < B.halfD - B.T && L.y > 1 && L.y < 1.5 + B.floors * B.FH;
          if (inBox) { ctx.inside = true; ctx.floor = Math.max(0, Math.min(B.floors - 1, Math.floor((L.y - 1.5) / B.FH))); }
        }
        // Nổ BÊN TRONG nhà (đạn lọt qua mái / ô sàn / lỗ thủng rồi nổ): sóng xung kích dội vách + áp suất dồn trong tầng kín
        // thổi bật tường ra ngoài, hất tung mái nhẹ -> nhà kho tôn / nhà gỗ tung toác, nhà bê tông thủng vách tầng đó
        if (ctx.inside && !I.kin && I.kg > 0) this.confinedBlast(ctx, L);
        this.blastNear(ctx, L);
        if (fh) this.fragmentPocks(ctx, fh);
        if (ctx.changed) this.heatUp(B, ctx, ammo, heavy, !!(direct && direct.B === B));
        if (ctx.changed) {
          events.hit = true;
          // Dựng lại hình tường chỉ là phần hiển thị (va chạm & đồng bộ mạng dùng lưới ô). Trúng thẳng: dựng ngay cho lỗ
          // thủng hiện tức thì; nổ gần (kính vỡ, rỗ mảnh văng, bóc lở): gom lại dựng trong update() — một loạt pháo /
          // chùm bom con quanh một tòa nhà không còn dựng lại hình từng quả (~8-25 ms mỗi lần)
          // (nhà ngoài khung nhìn / quá xa: chỉ đánh dấu, dựng lại hình khi vào tầm nhìn — lưới ô va chạm đã đổi ngay)
          if (direct && direct.B === B && this.inView(B, fx)) { B.dmgPending = false; this.rebuildDamage(B); }
          else B.dmgPending = true;
          const ev = this.checkStructure(B, fx);
          if (ev) events.push(ev);
          this.commitAll();
        }
      }
      return events;
    }

    // Tia mảnh văng từ tâm nổ -> Map(nhà -> [{ m, L, d, inside }]). Nổ chạm đất: mảnh văng tỏa ngang là chính (nửa dưới
    // cắm xuống đất), góc ngóc lên thưa dần. Chạy trong withSeed (rand) -> mọi máy cùng kết quả
    fragmentRays(x, y, z, ammo, heavy, info) {
      const out = new Map();
      const F = fragInfo(ammo, heavy);
      if (!F || !this.items.length) return out;
      // có nhà nào trong tầm không (đỡ dò tia vô ích)
      if (!this.items.some(B => !B.collapsed && Math.hypot(x - B.x, z - B.z) < F.fr + Math.hypot(B.halfW, B.halfD))) return out;
      const oy = y + 2;
      let budget = 300;
      for (let i = 0; i < F.rays; i++) {
        const az = rand(0, 6.283);
        const el = Math.asin(Math.pow(rand(0, 1), 1.6) * 0.82) + 0.02;
        const ce = Math.cos(el);
        const dx = Math.cos(az) * ce, dy = Math.sin(el), dz = Math.sin(az) * ce;
        const h = this.segmentHit(x, oy, z, x + dx * F.fr, oy + dy * F.fr, z + dz * F.fr);
        if (!h || h.part !== 'wall') continue;
        const d = h.t * F.fr;
        if (d < 4) continue;   // chính mặt tường bị nổ trúng thẳng: vết nổ đã khoét riêng
        // mảnh xa mất dần sức: gần thì một chùm vết, xa chỉ lác đác
        const n = 1 + Math.round(1.6 * Math.max(0, 1 - d / F.fr) * rand(0.5, 1.2));
        const list = out.get(h.B) || [];
        list.push({ m: h.m, L: h.L, d, inside: h.inside, n: Math.min(n, budget) });
        out.set(h.B, list);
        budget -= n;
        if (budget <= 0) break;
      }
      return out;
    }
    // Điểm (hệ toạ độ nhà) trên mảng tường m có rơi vào ô cửa / cửa đi lõm của mặt tiền không (RELIEF, ảnh 128x128)
    inOpening(B, m, L) {
      const R = m.kit && m.kit.styleKey && RELIEF[m.kit.styleKey];
      if (!R) return false;
      const px = (L.x - m.lx) * m.ax + (L.z - m.lz) * m.az, py = L.y - m.ly;
      const u = (px / B.st.bay + 0.5) * 128, v = (0.5 - py / B.FH) * 128;
      return R.o.some(o => u > o[0] && u < o[2] && v > o[1] && v < o[3]);
    }
    // Vết mảnh văng: dán vết sứt nhỏ (5-20 cm) đúng chỗ chùm mảnh chạm, bỏ qua ô cửa; kính trúng mảnh thì vỡ.
    // Không khoét lưới tường (ô lưới ~21 cm: vết hiện thành mảng bóc lở to, lại buộc dựng lại hình cả mảng tường).
    // Tường tôn: mảnh xuyên thủng tấm tôn mỏng -> lỗ thủng thật (lỗ tối). Lưới tường không đổi -> mọi máy cùng trạng thái
    fragmentPocks(ctx, hits) {
      const { B } = ctx;
      const layer = ctx.fx && ctx.fx.fragHoles;
      const metal = B.st.mat === 'metal';
      const tint = B.st.mat === 'adobe' ? [0.93, 0.8, 0.62] : B.st.mat === 'wood' ? [0.62, 0.48, 0.32] : B.st.mat === 'stone' ? [0.9, 0.88, 0.84] : [0.97, 0.95, 0.92];
      for (const h of hits) {
        const m = h.m;
        if (m.state === 'gone') continue;
        if (m.state === 'ok' && rand(0, 1) < 0.5) this.shatter(B, m, ctx);
        if (layer) {
          // vết dán chỉ là hình (không đổi trạng thái nhà): không tiêu dãy RNG đồng bộ mạng, mà sinh số từ toạ độ điểm chạm
          // (giống hệt nhau trên mọi máy) -> mọi người chơi thấy vết ở cùng chỗ
          let sd = (Math.floor(h.L.x * 97) ^ Math.floor(h.L.y * 131) * 7919 ^ Math.floor(h.L.z * 173) * 104729) >>> 0;
          const rnd = (lo, hi) => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return lo + (sd / 4294967296) * (hi - lo); };
          // chùm mảnh tỏa rộng dần theo khoảng cách; mảnh gần to & nhiều hơn
          const spread = 1 + h.d * 0.03, near = Math.max(0, 1 - h.d / 200);
          const cnt = h.n;
          const nIn = h.inside ? -1 : 1, nw = this.dirToWorld(B, m.ox * nIn, 0, m.oz * nIn);
          for (let k = 0; k < cnt; k++) {
            const u = rnd(-1, 1) * spread, v = rnd(-1, 1) * spread * 0.8;
            const L = { x: h.L.x + m.ax * u, y: h.L.y + v, z: h.L.z + m.az * u };
            if (Math.abs((L.x - m.lx) * m.ax + (L.z - m.lz) * m.az) > B.st.bay / 2 || Math.abs(L.y - m.ly) > B.FH / 2) continue;
            if (!h.inside && this.inOpening(B, m, L)) continue;
            if (m.mk && !this.cellSolid(B, m, L)) continue;
            const w = this.toWorld(B, L.x, L.y, L.z);
            const sz = metal ? rnd(0.35, 0.7) : rnd(0.8, 1.6) * (1 + 0.5 * near);
            const sh = rnd(0.85, 1.05);
            const col = metal ? null : new THREE.Color(tint[0] * sh, tint[1] * sh, tint[2] * sh);
            (metal && ctx.fx.wallHoles ? ctx.fx.wallHoles : layer).add(w.x, w.y, w.z, nw.x, 0, nw.z, sz, col);
          }
        }
      }
    }

    directHit(ctx, D, dir) {
      const { B, I, fx } = ctx;
      const ld = this.dirToLocal(B, dir);
      const W = this.toWorld(B, D.L.x, D.L.y, D.L.z), Nw = this.dirToWorld(B, D.ln[0], D.ln[1], D.ln[2]);
      const cosI = Math.max(0, -(ld.x * D.ln[0] + ld.y * D.ln[1] + ld.z * D.ln[2]));
      ctx.changed = true;
      if (D.part === 'wall') {
        const m = D.m;
        // trúng thẳng ô cửa kính còn nguyên: kính vỡ văng mảnh (trước đây mảng bị trúng chỉ đổi sang hình kính vỡ khi khoét
        // — không có mảnh kính nào; sóng nổ blastNear lại bỏ qua mảng đã trúng thẳng). Không tiêu số ngẫu nhiên đồng bộ
        if (m.state === 'ok' && this.inOpening(B, m, D.L)) this.shatter(B, m, ctx, D.inside, 1);
        let tx = ld.x * m.ax + ld.z * m.az, ty = ld.y;
        const tl = Math.hypot(tx, ty);
        if (tl > 1e-4) { tx /= tl; ty /= tl; } else { tx = 1; ty = 0; }
        const kinK = I.kin && B.WM.kin !== undefined ? B.WM.kin : 1;
        let hole = I.hole * (I.kin && B.WM.kin !== undefined ? B.WM.kin : B.WM.k), crater = I.crater, soot = I.soot, chip = (I.chip || 0) * (B.WM.chip || 1), stretch = 1;
        const ric = I.kin && cosI < I.ric;
        if (ric) { hole = 0; chip = chip ? chip * 0.5 : 0.35; crater *= 0.8; stretch = 2.6; soot = 0; }   // sượt: chỉ cày một rãnh bóc lở dài theo hướng bay
        else if (I.kin) stretch = Math.min(2.4, 1 / Math.max(cosI, 0.4));                                  // xuyên xiên: lỗ thuôn dài
        else {
          stretch = 1 + (1 - cosI) * 0.6;
          // nổ lõm chạm quá xiên: luồng phụt không đủ cự ly, lỗ nhỏ; đạn nổ chạm xiên: phần lớn sức nổ dội ra ngoài
          hole *= I.heat ? (cosI < 0.25 ? 0.45 : 1) : (0.6 + 0.4 * cosI);
        }
        const P = { hole, crater, soot, chip, stretch, tx, ty, noise: holeNoise(), seed: rand(0, 1000), inner: D.inside };
        const res = this.carveFace(ctx, m, D.L, P);
        const face1 = [...ctx.touched];
        this.strain(ctx, m, D.L, (I.sd || 0) * (ric ? 0.15 : I.kin ? kinK : 0.6 + 0.4 * cosI), face1);
        ctx.floor = m.floor;
        ctx.inside = D.inside;
        this.wallDebris(ctx, W, Nw, dir, res, ric);
        // Đạn động năng xuyên qua nhà: lỗ ra ở vách đối diện, bê tông phụt ra ngoài (đầu đạn mất phần lớn năng lượng)
        if (I.exit && !ric && !D.inside) {
          const s0 = { x: D.L.x + ld.x * (B.T + 0.8), y: D.L.y + ld.y * (B.T + 0.8), z: D.L.z + ld.z * (B.T + 0.8) };
          const span = B.w + B.d + B.topY;
          const h2 = this.segHitB(B, s0, { x: s0.x + ld.x * span, y: s0.y + ld.y * span, z: s0.z + ld.z * span });
          if (h2 && h2.part === 'wall') {
            const m2 = h2.m;
            // đạn bay vuông góc vách sau & nằm ngang: (ex, ey) = 0 -> hướng kéo dài lỗ mặc định ngang (trước đây chia cho 1 giữ
            // nguyên (0, 0): mọi ô trong ô vuông quét đều "ở tâm lỗ" -> một phát xuyên khoét bay ~2,8 m² vách sau)
            let ex = ld.x * m2.ax + ld.z * m2.az, ey = ld.y; let el = Math.hypot(ex, ey);
            if (el < 1e-4) { ex = 1; ey = 0; el = 1; }
            const cos2 = Math.abs(ld.x * m2.ox + ld.z * m2.oz);
            const P2 = { hole: I.exit * (B.WM.kin !== undefined ? B.WM.kin : B.WM.k), crater: I.crater * 1.5 * kinK, soot: 0, chip: 0, stretch: Math.min(2.4, 1 / Math.max(cos2, 0.4)), tx: ex / el, ty: ey / el, noise: holeNoise(), seed: rand(0, 1000), inner: false };
            const r2 = this.carveFace(ctx, m2, h2.L, P2);
            this.strain(ctx, m2, h2.L, (I.sd || 0) * 0.5 * kinK, [...ctx.touched].filter(q => !face1.includes(q)));
            const W2 = this.toWorld(B, h2.L.x, h2.L.y, h2.L.z);
            if (fx && fx.spallCone) fx.spallCone(new THREE.Vector3(W2.x, W2.y, W2.z), new THREE.Vector3(dir.x, dir.y, dir.z), 40, { spread: 0.45, dust: B.WM.dust });
            const o = this.dirToWorld(B, m2.ox, 0, m2.oz);
            jet(fx, W2.x, W2.y, W2.z, o.x, 0.1, o.z, 3 + Math.min(6, r2.removed >> 2), 2.6, 70, B.WM.edge, 0.4);
            sfx(matSnd(B), W2.x, W2.y, W2.z, 0.6, { h: W2.y - B.y });
          } else if (h2 && h2.m) this.hitTile(ctx, h2.m, I.sp * 0.6, W);
        }
        // Luồng nổ lõm xuyên tường: kim loại nóng chảy + bê tông phụt vào trong phòng
        if (I.heat && !ric && !D.inside && fx && fx.spallCone) fx.spallCone(new THREE.Vector3(W.x + dir.x * B.T, W.y + dir.y * B.T, W.z + dir.z * B.T), new THREE.Vector3(dir.x, dir.y, dir.z), 26, { spread: 0.5, dust: B.WM.dust });
      } else {
        // Sàn / mái bị chạm
        const m = D.m;
        const fromTop = D.ln[1] > 0.5;
        const dmg = (I.sp * 1.25 + I.hole * 0.04) * (I.kin ? 0.45 : 1) * (0.5 + 0.5 * cosI) * (B.WM.sk || 1);
        const broke = this.hitTile(ctx, m, dmg, W);
        if (D.part === 'roof') { ctx.inside = broke; ctx.floor = B.floors - 1; }
        else { ctx.inside = true; ctx.floor = fromTop ? Math.min(B.floors - 1, m.floor + 1) : m.floor; }
        const s = Math.min(1.6, 0.4 + I.sp);
        // ô mái chưa sụp: lỗ thủng lởm chởm đúng chỗ trúng (lộ lòng mái tối), đạn nhỏ chỉ sứt ngói
        if (D.part === 'roof' && !broke && fx && !this._syncing) {
          const P0 = new THREE.Vector3(W.x, W.y, W.z), N0 = new THREE.Vector3(Nw.x, Nw.y, Nw.z);
          if (I.chip) { if (fx.addWallPit) fx.addWallPit(P0, N0, I.chip > 0.45, B.WM.edge); }
          else if (this.roofHolePool && D.L && D.ln) {
            // lỗ thủng ~1,5-2,5 m dán phẳng trên mặt mái dốc, nhuộm theo màu mái
            const hs = Math.min(20, 10 + 7 * Math.min(1.6, 0.4 + I.sp));
            const ln = new THREE.Vector3(D.ln[0], D.ln[1], D.ln[2]).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), ln).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand(0, 6.28)));
            const local = new THREE.Matrix4().compose(new THREE.Vector3(D.L.x, D.L.y, D.L.z).addScaledVector(ln, 0.35), q, new THREE.Vector3(hs, hs, 1));
            const world = B.base.clone().multiply(local);
            const idx = this.roofHolePool.add(world, (m.c || new THREE.Color(1, 1, 1)).clone().multiplyScalar(1.15));
            if (idx >= 0) { (m.deco || (m.deco = [])).push({ pool: this.roofHolePool, idx, local, world }); if (B.cut && this.isCutMod(B, m)) this.roofHolePool.hide(idx); }
            this.roofHolePool.commit();
          }
        }
        jet(fx, W.x, W.y + 1, W.z, Nw.x, Math.max(0.6, Nw.y), Nw.z, Math.round(2 + 5 * s), 2.4 * s, 55, B.WM.edge, 0.8);
        dustBurst(fx, W.x, W.y + 2, W.z, Math.round(1 + 3 * s), 8 + 10 * s, B.WM.dust);
      }
    }
    // Khoét cả các mảng cùng mặt phẳng kề bên (lỗ / vành bóc lở / muội vượt qua mép mảng)
    carveFace(ctx, m, L, P) {
      const { B } = ctx, bay = B.st.bay, FH = B.FH;
      const R = Math.max(P.hole * 1.5, P.crater * 1.4, P.soot * 1.3) * Math.max(1, P.stretch) + 2;
      let removed = 0;
      for (const q of B.walls) {
        if (q.state === 'gone' || Math.abs(q.ry - m.ry) > 1e-3) continue;
        if (Math.abs((q.lx - m.lx) * m.ox + (q.lz - m.lz) * m.oz) > 0.5) continue;
        const rx = L.x - q.lx, rz = L.z - q.lz;
        const px = rx * q.ax + rz * q.az, py = L.y - q.ly;
        if (Math.abs(px) > bay / 2 + R || Math.abs(py) > FH / 2 + R) continue;
        removed += this.carve(B, q, px, py, P).removed;
        ctx.touched.add(q);
        if (B.cut && this.isCutMod(B, q)) this.cutHide(q);
      }
      return { removed };
    }
    // Gạch đá vỡ văng ra theo mặt bị nổ, bụi phụt, đống vụn rơi xuống chân tường
    wallDebris(ctx, W, N, dir, res, ric) {
      const { B, I, fx } = ctx;
      const cells = res.removed, vol = cells * 2.6 * B.T;
      if (I.chip) {
        // vết đạn trên mặt tường đúng cỡ (màu lớp vật liệu lộ ra); ô tường đã thủng thì bỏ vết quanh đó
        if (fx && fx.addWallPit) { if (cells) fx.removeMarksNear(W.x, W.y, W.z, 2.5); else if (!ric) fx.addWallPit(W, N, I.chip > 0.45, B.WM.edge); }
        dustJet(fx, W.x, W.y, W.z, N.x, N.z, 1, ric ? 2.5 : 3.2, B.WM.dust, 14);
        if (cells) jet(fx, W.x, W.y, W.z, N.x, N.y, N.z, 2, 1.2, 40, B.WM.edge, 0.5);
        if (!this._syncing) sfx(matSnd(B), W.x, W.y, W.z, 0.25, { h: W.y - B.y });
        return;
      }
      const s = Math.min(2.2, 0.5 + Math.sqrt(vol) / 18);
      // phần lớn mảnh vỡ bật ngược về phía mặt bị nổ, một ít bị sóng nổ thổi vào trong
      jet(fx, W.x, W.y, W.z, N.x, N.y + 0.15, N.z, Math.round(3 + 6 * s), 2.2 * s, 60 + 30 * s, B.WM.edge, 0.65);
      jet(fx, W.x, W.y, W.z, dir.x, dir.y, dir.z, Math.round(2 + 3 * s), 1.8 * s, 50, B.WM.edge, 0.5);
      dustJet(fx, W.x, W.y, W.z, N.x, N.z, Math.round(2 + 3 * s), 8 + 8 * s, B.WM.dust, 18 + 10 * s);
      dustBurst(fx, W.x, W.y, W.z, Math.round(1 + 2 * s), 10 + 8 * s, B.WM.dust);
      if (cells > 6) this.holeRubble(ctx, W, N, cells, vol);
      if (!this._syncing) sfx(matSnd(B), W.x, W.y, W.z, Math.min(1.2, 0.5 + s * 0.35), { h: W.y - B.y });
    }
    /**
     * Đống vụn của lỗ thủng trên tường nhà, theo đúng thể tích bê tông / gạch bị khoét (~55% nằm lại, còn lại thành bụi / văng xa).
     * Nổ áp mặt tường: sóng nổ thổi phần lớn lòng lỗ về phía sau (vào trong phòng, văng xa dần), lớp bóc lở mặt trước
     * rơi gần chân tường phía bị bắn; đạn động năng thì chia đều hơn. Nổ trong phòng: ngược lại, phần lớn đổ ra ngoài.
     * Mảnh trong phòng nằm trên sàn đúng tầng bị thủng (gắn vào ô sàn: ẩn khi ô sàn sập / cắt tầng, rơi theo khi nhà sập),
     * mảnh ngoài nhà rơi xuống đất ngay dưới lỗ (lỗ càng cao rơi càng toả xa). Chia cỡ: vài mảng tường dẹt dày bằng tường,
     * cục vừa, nhiều sạn nhỏ. Chỉ để nhìn (không đồng bộ), dùng dãy RNG riêng theo vị trí lỗ.
     */
    holeRubble(ctx, W, N, cells, vol) {
      const { B, I } = ctx;
      if (this._syncing) return;
      withSeed(Math.floor(hash3(W.x * 0.37, W.z * 0.41, W.y * 0.29 + cells) * 4294967295) >>> 0, () => {
        const Lw = this.toLocal(B, W.x, W.y, W.z), Nl = this.dirToLocal(B, N);
        const nl = Math.hypot(Nl.x, Nl.z) || 1, nx = Nl.x / nl, nz = Nl.z / nl;   // pháp tuyến mặt bị nổ (cục bộ, nằm ngang)
        const ax = -nz, az = nx;                                                    // dọc tường
        const rest = vol * 0.55, T = B.T, f = Math.max(0, ctx.floor), R = Math.sqrt(cells) * 0.9;
        const pFar = I.kin ? 0.5 : 0.6;
        // phía "xa" (sau tường so với điểm nổ) là trong nhà khi nổ ngoài, là ngoài nhà khi nổ trong phòng
        const farIn = !ctx.inside;
        const Lv = f > 0 ? B.levels.find(L => L.role === 'slab' && L.f === f - 1) : null;
        const yFloor = Lv ? Lv.y + Lv.th / 2 : 2.1;
        const baseMod = B.baseMod || (B.baseMod = B.mods.find(m => m.role === 'base'));
        const hFall = Math.max(0, W.y - this.groundAt(W.x, W.z));
        const col = () => new THREE.Color(B.WM.edge[0], B.WM.edge[1], B.WM.edge[2]).multiplyScalar(rand(0.78, 1.08));
        const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
        const place = (sx, sy, sz, flat, reach) => {
          const far = RNG() < pFar, inside = far === farIn;
          const side = inside ? -1 : 1;                 // -1: vào trong (ngược pháp tuyến mặt ngoài), +1: ra ngoài
          const sgn = ctx.inside ? -side : side;        // pháp tuyến N quay về phía điểm nổ
          E.set(flat ? rand(-0.35, 0.35) : rand(0, 3), rand(0, 6.28), flat ? rand(-0.35, 0.35) : rand(0, 3));
          Q.setFromEuler(E); S.set(sx, sy, sz);
          const al = rand(-1, 1) * R * (far ? 0.8 : 0.6);
          if (inside) {
            // văng vào phòng: phía xa văng xa hơn, phía gần (nổ trong phòng) rơi sát chân tường
            const off = (far ? T : 0) + 0.6 + rand(0, 1) * reach * (far ? 2.2 : 0.6);   // phía xa: qua hết bề dày tường
            let lx = Lw.x + nx * sgn * off + ax * al, lz = Lw.z + nz * sgn * off + az * al;
            lx = Math.max(-B.halfW + T + 0.8, Math.min(B.halfW - T - 0.8, lx));
            lz = Math.max(-B.halfD + T + 0.8, Math.min(B.halfD - T - 0.8, lz));
            const tile = Lv ? this.tileAt(B, Lv, lx, lz) : baseMod;
            if (!tile || tile.state === 'gone') return;   // ô sàn đã thủng: mảnh rơi lọt xuống, bỏ qua
            const local = new THREE.Matrix4().compose(V.set(lx, yFloor + sy * 0.25, lz), Q, S);
            const world = B.base.clone().multiply(local);
            const idx = this.bitPool.add(world, col());
            if (idx < 0) return;
            (tile.deco || (tile.deco = [])).push({ pool: this.bitPool, idx, local, world });
            if (B.cut && this.isCutMod(B, tile)) this.bitPool.hide(idx);
          } else {
            // rơi ra ngoài: rơi từ độ cao lỗ xuống đất, càng cao toả càng xa chân tường
            const off = (far ? T : 0) + 0.5 + rand(0, 1) * (reach * (far ? 1.6 : 0.7) + hFall * (far ? 0.3 : 0.14));
            const lx = Lw.x + nx * sgn * off + ax * al * (1 + hFall * 0.02), lz = Lw.z + nz * sgn * off + az * al * (1 + hFall * 0.02);
            const w = this.toWorld(B, lx, 0, lz), gy = this.groundAt(w.x, w.z);
            this.addGroundBit(new THREE.Matrix4().compose(V.set(w.x, gy + sy * 0.22, w.z), Q, S), w.x, w.z, col());
          }
        };
        const nBig = Math.min(3, 1 + Math.floor(cells / 70)), nMid = Math.min(9, 2 + Math.floor(cells / 20)), nSmall = Math.min(18, 4 + Math.floor(cells / 8));
        // mảng tường dẹt: dày cỡ bề dày tường, diện tích lấy theo thể tích
        for (let i = 0; i < nBig; i++) {
          const sy = Math.min(T * 0.85, 2.4) * rand(0.7, 1), a = Math.sqrt(rest * 0.4 / nBig / sy / 0.5);
          const sx = Math.min(B.st.bay * 0.5, a * rand(0.9, 1.3)), sz = Math.min(B.st.bay * 0.4, a * rand(0.7, 1));
          place(sx, sy, sz, true, 3);
        }
        for (let i = 0; i < nMid; i++) {
          const sc = Math.min(T * 1.4, Math.cbrt(rest * 0.35 / nMid / 0.4)) * rand(0.7, 1.3);
          place(sc * 1.2, sc * 0.75, sc, RNG() < 0.4, 5);
        }
        for (let i = 0; i < nSmall; i++) {
          const sc = Math.cbrt(rest * 0.25 / nSmall / 0.4) * rand(0.5, 1.4);
          place(sc * 1.15, sc * 0.8, sc, false, 8);
        }
      });
    }
    // Ô sàn / mái / mái dốc trúng sức phá dmg; trả về true nếu vỡ
    hitTile(ctx, m, dmg, W) {
      const { B } = ctx;
      if (m.state === 'gone') return false;
      m.hp -= dmg;
      ctx.changed = true;
      this.tintMod(m, m.c.clone().multiplyScalar(0.45 + 0.5 * clamp01(m.hp / m.hp0)));
      if (m.hp <= 0) {
        const over = -m.hp;
        this.setGone(B, m, ctx.fx);
        if (m.slice) this.roofBreach(ctx, m, over);
        return true;
      }
      if (m.state === 'ok') m.state = 'scarred';
      void W;
      return false;
    }
    // Ô mái ngói / tôn mỏng bị đục thủng: phần sức phá còn dư xuyên xuống trần tầng trên cùng ngay bên dưới; ngói vỡ, gạch
    // vụn, muội khói rơi phủ kín mặt trần dưới lỗ (nhìn từ trên xuống thấy lòng nhà tối sẫm, không phải mặt trần sạch)
    roofBreach(ctx, m, over) {
      const { B } = ctx, Lv = B.levels.find(L => L.role === 'slab' && L.f === B.floors - 1);
      if (!Lv) return;
      this.roofSkeleton(B, m, Lv);
      for (const t of Lv.tiles) {
        if (t.ti !== m.ti || t.state === 'gone') continue;
        if (!t.soot) { t.soot = true; t.c = t.c.clone().multiplyScalar(0.35); }
        if (over > 0.05) this.hitTile(ctx, t, over * 0.7, null);
        else this.tintMod(t, t.c.clone().multiplyScalar(0.45 + 0.5 * clamp01(t.hp / t.hp0)));
      }
    }
    // Dải mái dốc sập: còn trơ khung gỗ (xà nóc + kèo hai mái, nhiều cây gãy cụt / lệch, sém đen), ngói vỡ rơi đầy mặt trần
    // bên dưới — thay cho cảnh cả dải mái biến mất để lộ mặt trần phẳng sạch. Gắn vào ô trần (ẩn / rơi theo khi trần sập)
    roofSkeleton(B, m, Lv) {
      const R = B.roofShape;
      if (!R || !this.timberPool) return;
      this.roofEdges(B, m);
      const tiles = Lv.tiles.filter(t => t.ti === m.ti && t.state !== 'gone');
      if (!tiles.length) { if (this.shardPool) this.shardPool.commit(); return; }
      withSeed(Math.floor(hash3(B.x * 0.13 + m.ti, B.z * 0.17, m.lx * 0.31) * 4294967295) >>> 0, () => {
        const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
        const tileAtZ = (z) => tiles.reduce((a, t) => Math.abs(t.lz - z) < Math.abs(a.lz - z) ? t : a, tiles[0]);
        const put = (pool, x, y, z, sx, sy, sz, col, tile) => {
          Q.setFromEuler(E);
          const local = new THREE.Matrix4().compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
          const world = B.base.clone().multiply(local);
          const idx = pool.add(world, col);
          if (idx < 0) return;
          (tile.deco || (tile.deco = [])).push({ pool, idx, local, world });
          if (B.cut && this.isCutMod(B, tile)) pool.hide(idx);
        };
        // gỗ cũ xám nâu, nhiều chỗ cháy sém gần đen
        const wood = () => new THREE.Color(0.26, 0.2, 0.15).multiplyScalar(rand(0, 1) < 0.4 ? rand(0.12, 0.3) : rand(0.35, 0.7));
        const x0 = m.lx - m.hx + 1.2, x1 = m.lx + m.hx - 1.2;
        const yF = Lv.y + Lv.th / 2, rc = m.c || new THREE.Color(0.55, 0.3, 0.2);
        const sc0 = roofShardCol(B, m.c);   // màu thật của ngói / tôn (m.c chỉ là hệ số nhuộm texture)
        if (R.kind === 'pitched') {
          const yR = R.y0 + R.h - 0.6, L = Math.hypot(R.hz, R.h), al = Math.atan2(R.h, R.hz);
          // xà nóc: thường gãy giữa, một đoạn võng hẳn xuống
          const brk = rand(0.3, 0.7), xm = x0 + (x1 - x0) * brk;
          E.set(0, rand(-0.04, 0.04), rand(-0.06, 0.06)); put(this.timberPool, (x0 + xm) / 2, yR - rand(0, 1.2), rand(-0.4, 0.4), xm - x0, 0.9, 0.8, wood(), tileAtZ(0));
          if (rand(0, 1) < 0.7) {
            const drop = rand(0.25, 0.75), lr = (x1 - xm) * rand(0.6, 0.95);
            E.set(0, rand(-0.12, 0.12), -drop); put(this.timberPool, xm + Math.cos(drop) * lr / 2, yR - Math.sin(drop) * lr / 2, rand(-1, 1), lr, 0.9, 0.8, wood(), tileAtZ(0));
          }
          for (let x = x0; x <= x1 + 0.01; x += rand(3.6, 5.6)) {
            for (const sd of [-1, 1]) {
              // kèo: từ chân mái (mép tường) lên nóc; ~1/3 gãy cụt chỉ còn khúc chân, một số rơi hẳn xuống trần nằm chéo
              const r = rand(0, 1);
              if (r < 0.3) {
                if (rand(0, 1) < 0.5) {
                  const len = L * rand(0.35, 0.75), z = sd * R.hz * rand(0.2, 0.7), lean = rand(0.05, 0.5);
                  E.set(rand(-0.1, 0.1) + sd * lean, rand(-0.7, 0.7), rand(-0.15, 0.15));
                  put(this.timberPool, x + rand(-1, 1), yF + 0.5 + Math.sin(lean) * len * 0.5, z, 0.55, 0.75, len, wood(), tileAtZ(z));
                }
                continue;
              }
              const k = r < 0.68 ? rand(0.15, 0.6) : rand(0.8, 1);
              const th = Math.atan2(-R.h, -sd * R.hz);
              const bent = k < 0.75;
              E.set(th + (bent ? rand(-0.3, 0.2) : rand(-0.1, 0.06)), bent ? rand(-0.25, 0.25) : rand(-0.1, 0.1), bent ? rand(-0.2, 0.2) : rand(-0.12, 0.12));
              const len = L * k;
              const cz = sd * R.hz * (1 - k / 2), cy = R.y0 + R.h * (k / 2) - (bent ? rand(0, 1) : 0);
              put(this.timberPool, x + rand(-0.4, 0.4), cy, cz, 0.55, 0.75, len, wood(), tileAtZ(cz));
            }
          }
          // thanh mè (lati) ngang còn vắt trên kèo: đoạn ngắn, lệch, vài thanh tuột một đầu
          for (let i = 0; i < 10; i++) {
            const sd = rand(0, 1) < 0.5 ? -1 : 1, u = rand(0.08, 0.85), w = (x1 - x0) * rand(0.2, 0.7);
            E.set(sd * al, rand(-0.06, 0.06), rand(0, 1) < 0.3 ? rand(-0.35, 0.35) : rand(-0.05, 0.05));
            put(this.timberPool, x0 + rand(0, (x1 - x0) - w) + w / 2, R.y0 + R.h * u + 0.5, sd * R.hz * (1 - u), w, 0.25, 0.5, wood(), tileAtZ(sd * R.hz * (1 - u)));
          }
          // mảng mái còn dính chân tường một bên, gãy gập võng sụp vào lòng nhà (1-2 đoạn, đoạn sau dốc xuống hơn đoạn trước)
          if (this.shardPool && rand(0, 1) < 0.75) {
            const sd = rand(0, 1) < 0.5 ? -1 : 1, w = (x1 - x0) * rand(0.35, 0.7), xc = x0 + rand(0, (x1 - x0) - w) + w / 2;
            let pz = sd * (R.hz - 1.5), py = R.y0 + R.h * (1.5 / R.hz), a = al - rand(0.2, 0.45);
            const parts = rand(0, 1) < 0.6 ? 2 : 1;
            for (let p = 0; p < parts; p++) {
              let len = L * (p ? rand(0.2, 0.35) : rand(0.3, 0.5));
              if (Math.sin(a) < 0) len = Math.min(len, (py - yF - 0.8) / Math.max(0.05, -Math.sin(a)));
              if (len < 2) break;
              const dz = -sd * Math.cos(a), dy = Math.sin(a);
              const th = Math.atan2(-dy, dz);
              const pw = w * (p ? rand(0.6, 0.9) : 1);
              E.set(th, rand(-0.08, 0.08), rand(-0.12, 0.12));
              put(this.shardPool, xc + (p ? rand(-2, 2) : 0), py + dy * len / 2, pz + dz * len / 2, pw, 0.7, len, sc0.clone().multiplyScalar(rand(0.6, 0.9)), tileAtZ(pz + dz * len / 2));
              // kèo gãy kẹt dưới mảng võng
              E.set(th + rand(-0.1, 0.1), rand(-0.2, 0.2), 0);
              put(this.timberPool, xc + rand(-pw, pw) * 0.4, py + dy * len / 2 - 0.7, pz + dz * len / 2, 0.55, 0.75, len * rand(0.7, 1), wood(), tileAtZ(pz + dz * len / 2));
              pz += dz * len; py += dy * len; a -= rand(0.35, 0.7);
            }
          }
        } else if (R.kind === 'arched') {
          // mái vòm tôn: vì kèo thép cong còn trơ (gãy khúc, đoạn gãy treo lủng lẳng), xà gồ dọc gãy, tấm tôn rách treo võng xuống
          const P = (a, rs) => ({ y: R.y0 + R.h * Math.sin(a) * rs, z: R.hz * Math.cos(a) * rs });
          const steel = () => new THREE.Color(0.2, 0.19, 0.18).multiplyScalar(rand(0, 1) < 0.4 ? rand(0.4, 0.7) : rand(0.8, 1.3));
          const seg = (pool, x, p, q, w, t, col, tile) => {
            const dy = q.y - p.y, dz = q.z - p.z, len = Math.hypot(dy, dz);
            if (len < 0.3) return;
            E.set(Math.atan2(-dy, dz), rand(-0.03, 0.03), 0);
            put(pool, x, (p.y + q.y) / 2, (p.z + q.z) / 2, w, t, len + 0.2, col, tile || tileAtZ((p.z + q.z) / 2));
          };
          const NS = 12;
          for (let x = x0 + rand(0, 3); x <= x1 + 0.01; x += rand(10, 14)) {
            if (rand(0, 1) < 0.15) continue;   // vì kèo bị thổi bay hẳn
            const g0 = rand(0, 1) < 0.3 ? -1 : Math.floor(rand(1, NS - 2)), gl = 1 + Math.floor(rand(0, 4)), col = steel();
            const rs = rand(0.96, 0.99), xj = rand(-0.5, 0.5);
            for (let i = 0; i < NS; i++) {
              const a0 = Math.PI * i / NS, a1 = Math.PI * (i + 1) / NS;
              if (g0 >= 0 && i >= g0 && i < g0 + gl) {
                // đoạn gãy: khúc kề chỗ đứt cong gập treo xuống
                if (i === g0 && rand(0, 1) < 0.7) {
                  const p = P(a0, rs), len = rand(3, 8), dz = (p.z > 0 ? -1 : 1) * rand(0.1, 0.5);
                  seg(this.timberPool, x + xj, p, { y: Math.max(yF + 1, p.y - len), z: p.z + dz * len }, 0.7, 0.9, col);
                }
                continue;
              }
              seg(this.timberPool, x + xj, P(a0, rs + rand(-0.01, 0.01)), P(a1, rs + rand(-0.01, 0.01)), 0.7, 0.9, col);
            }
          }
          // xà gồ dọc nhà còn vắt qua các vì kèo, nhiều thanh gãy một đầu
          for (let i = 0; i < 8; i++) {
            const a = rand(0.25, Math.PI - 0.25), p = P(a, 0.97), w = (x1 - x0) * rand(0.25, 0.8), dr = rand(0, 1) < 0.35 ? rand(0.15, 0.5) : rand(-0.04, 0.04);
            E.set(0, rand(-0.05, 0.05), dr);
            put(this.timberPool, x0 + rand(0, (x1 - x0) - w) + w / 2, p.y - 0.6 - Math.sin(Math.abs(dr)) * w * 0.25, p.z, w, 0.45, 0.6, steel(), tileAtZ(p.z));
          }
          // tấm tôn rách treo võng từ một bên vòm xuống lòng nhà
          if (this.shardPool && rand(0, 1) < 0.75) {
            const sd = rand(0, 1) < 0.5 ? 1 : -1, w = (x1 - x0) * rand(0.3, 0.6), xc = x0 + rand(0, (x1 - x0) - w) + w / 2;
            const ah = rand(0.3, 0.7), p = P(sd > 0 ? ah : Math.PI - ah, 0.99);
            const len = Math.min(rand(8, 18), p.y - yF - 1), dz = -sd * rand(0.25, 0.6);
            if (len > 3) seg(this.shardPool, xc, p, { y: p.y - len, z: p.z + dz * len }, w, 0.25, sc0.clone().multiplyScalar(rand(0.6, 0.95)));
          }
        }
        // ngói / tôn vỡ rơi đầy mặt trần dưới dải mái: gạch ngói vụn + mảnh dẹt
        for (let i = 0; i < 26; i++) {
          const x = rand(x0, x1), z = rand(-R.hz * 0.9, R.hz * 0.9), t = tileAtZ(z), sc = rand(1.6, 3.6);
          E.set(rand(-0.4, 0.4), rand(0, 6.28), rand(-0.4, 0.4));
          put(this.bitPool, x, yF + sc * 0.2, z, sc * rand(1, 1.8), sc * 0.35, sc * rand(0.8, 1.4), rand(0, 1) < 0.6 ? sc0.clone().multiplyScalar(rand(1.3, 2.2)) : new THREE.Color(0.2, 0.18, 0.16).multiplyScalar(rand(0.5, 1.2)), t);
        }
        // mảng tro, muội, ngói vụn cháy đen phủ loang mặt trần (lớp phong hoá shader làm mặt trần còn sáng)
        if (this.shardPool) for (let i = 0; i < 6; i++) {
          const x = rand(x0, x1), z = rand(-R.hz * 0.75, R.hz * 0.75), sc = rand(5, 10);
          E.set(rand(-0.03, 0.03), rand(0, 6.28), rand(-0.03, 0.03));
          put(this.shardPool, x, yF + 0.15 + i * 0.03, z, sc * rand(1, 1.5), 0.2, sc, new THREE.Color(0.05, 0.045, 0.04).multiplyScalar(rand(0.6, 1.4)), tileAtZ(z));
        }
        if (this.shardPool) for (let i = 0; i < 14; i++) {
          const x = rand(x0, x1), z = rand(-R.hz * 0.85, R.hz * 0.85), sc = rand(1.5, 4);
          E.set(rand(-0.5, 0.5), rand(0, 6.28), rand(-0.5, 0.5));
          put(this.shardPool, x, yF + 0.6 + rand(0, 1.2), z, sc * rand(1, 1.6), 0.4, sc * rand(0.7, 1.2), sc0.clone().multiplyScalar(rand(0.5, 0.9)), tileAtZ(z));
        }
      });
      this.timberPool.commit(); this.bitPool.commit(); if (this.shardPool) this.shardPool.commit();
    }
    // Mép gãy hai bên dải mái vừa sập (chỗ giáp dải mái còn nguyên): ngói vỡ lởm chởm thò ra / chúc xuống, mè gãy chìa ra,
    // thay cho vết cắt thẳng tắp. Gắn vào dải mái kề (N.deco): dải đó sập nốt thì ẩn theo
    roofEdges(B, m) {
      const R = B.roofShape, pool = this.shardPool;
      if (!R || (R.kind !== 'pitched' && R.kind !== 'arched') || !pool || !B.roofMods) return;
      withSeed(Math.floor(hash3(B.x * 0.11 + m.ti * 1.7, B.z * 0.19, 3.1) * 4294967295) >>> 0, () => {
        const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
        const al = Math.atan2(R.h, R.hz), L = Math.hypot(R.h, R.hz), ca = Math.cos(al), sa = Math.sin(al);
        for (const s of [-1, 1]) {
          const N = B.roofMods.find(q => q.ti === m.ti + s);
          if (!N || N.state === 'gone') continue;
          const rc = roofShardCol(B, N.c || m.c);
          const xe = m.lx + s * m.hx, dir = -s;   // mép cắt và hướng chìa vào lỗ
          const put = (x, y, z, sx, sy, sz, col, u) => {
            Q.setFromEuler(E);
            const wp = this.toWorld(B, x, 0, z);
            if (u >= 0) y += roofSagY(u, wp.x, wp.z);   // bám theo độ võng của mặt mái dốc (roofSag); vòm không võng
            const local = new THREE.Matrix4().compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
            const world = B.base.clone().multiply(local);
            const idx = pool.add(world, col);
            if (idx < 0) return;
            (N.deco || (N.deco = [])).push({ pool, idx, local, world });
            if (B.cut && this.isCutMod(B, N)) pool.hide(idx);
          };
          if (R.kind === 'arched') {
            // tôn vòm rách: mép tấm tôn lởm chởm theo cung vòm, mảng quăn chúc xuống; vì kèo biên còn trơ ở mép
            for (let a = rand(0, 0.08); a < Math.PI - 0.04; a += rand(0.08, 0.2)) {
              if (rand(0, 1) < 0.15) continue;
              const ca2 = Math.cos(a), sa2 = Math.sin(a), y = R.y0 + R.h * sa2 + 0.1, z = R.hz * ca2;
              const nyA = sa2 / R.h, nzA = ca2 / R.hz, nl = Math.hypot(nyA, nzA);
              const long = rand(0, 1) < 0.2, len = long ? rand(3, 7) : rand(0.5, 3), dr = long ? rand(0.3, 0.9) : rand(0, 0.4), root = rand(0.3, 1);
              const arc = Math.hypot(R.h * ca2, R.hz * sa2) * rand(0.05, 0.14);
              const dn = -Math.sin(dr) * len / 2;
              E.set(Math.atan2(nzA / nl, nyA / nl), rand(-0.3, 0.3), -dir * dr);
              put(xe - dir * root / 2 + dir * Math.cos(dr) * len / 2, y + nyA / nl * dn, z + nzA / nl * dn, len + root, 0.15, arc, rand(0, 1) < 0.35 ? new THREE.Color(0.3, 0.17, 0.1).multiplyScalar(rand(0.6, 1.1)) : rc.clone().multiplyScalar(rand(0.4, 0.8)), -1);
            }
            continue;
          }
          for (const sd of [-1, 1]) {
            const ny = ca, nz = sd * sa;   // pháp tuyến mặt mái phía sd
            // hàng ngói vỡ dọc mép, từ chân mái lên nóc: dài ngắn lởm chởm, cái chúc xuống, cái mất hẳn, lệch hướng
            for (let u = rand(0, 0.05); u < 0.97; u += rand(0.04, 0.11)) {
              if (rand(0, 1) < 0.2) continue;
              const long = rand(0, 1) < 0.15, len = long ? rand(3, 6) : rand(0.4, 2.6), dr = long ? rand(0.3, 0.8) : rand(0, 0.45);
              const wd = L * rand(0.03, 0.07), root = rand(0.3, 1.2);
              const cl = Math.cos(dr) * len / 2, dn = 0.12 - Math.sin(dr) * len / 2;
              E.set(sd * al + rand(-0.1, 0.1), rand(-0.35, 0.35), -dir * dr);
              put(xe - dir * root / 2 + dir * cl, R.y0 + R.h * u + ny * dn, sd * R.hz * (1 - u) + nz * dn, len + root, rand(0.25, 0.45), wd, rc.clone().multiplyScalar(rand(0.55, 1)), u);
            }
            // ngói xô lệch, bật khỏi hàng nằm vương trên mái kề sát mép vỡ
            for (let i = 0, n = 4 + Math.floor(rand(0, 5)); i < n; i++) {
              const u = rand(0.05, 0.9), off = rand(0.5, 5), sc = rand(1, 2.4), dn = 0.3 + sc * 0.1;
              E.set(sd * al + rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
              put(xe - dir * off, R.y0 + R.h * u + ny * dn, sd * R.hz * (1 - u) + nz * dn, sc * rand(1, 1.5), 0.35, sc, rc.clone().multiplyScalar(rand(0.5, 0.9)), u);
            }
            // mè / lati gãy chìa ra khỏi mép (gỗ trơ, sém)
            for (let i = 0, n = 2 + Math.floor(rand(0, 3)); i < n; i++) {
              const u = rand(0.1, 0.85), len = rand(2, 6), dr = rand(0, 0.25), dn = 0.4 + Math.sin(dr) * len / 2;
              E.set(sd * al, rand(-0.15, 0.15), -dir * dr);
              put(xe + dir * (Math.cos(dr) * len / 2 - 0.5), R.y0 + R.h * u - ny * dn, sd * R.hz * (1 - u) - nz * dn, len + 1, 0.25, 0.5,
                new THREE.Color(0.26, 0.2, 0.15).multiplyScalar(rand(0.2, 0.6)), u);
            }
          }
        }
      });
    }
    // Sóng nổ / mảnh văng quanh điểm nổ: cột, ô sàn, mảng tường gần (không trúng thẳng), kính vỡ, khói phụt ra cửa sổ
    blastNear(ctx, L) {
      const { B, I, fx } = ctx;
      const bay = B.st.bay, FH = B.FH, T = B.T;
      const kIn = ctx.inside ? 1.5 : 1;
      if (I.sp > 0) {
        for (const m of B.mods) {
          if (m.role === 'wall' || m.state === 'gone' || m.role === 'base') continue;
          const d = Math.hypot(Math.max(0, Math.abs(L.x - m.lx) - m.hx), Math.max(0, Math.abs(L.y - m.ly) - m.hy), Math.max(0, Math.abs(L.z - m.lz) - m.hz));
          if (d > I.sr) continue;
          const dmg = I.sp * Math.pow(1 - d / I.sr, 1.5) * kIn * (B.WM.sk || 1);
          if (dmg < 0.03) continue;
          this.hitTile(ctx, m, dmg, null);
        }
      }
      let vents = 0;
      for (const m of B.walls) {
        if (m.state === 'gone' || ctx.touched.has(m)) continue;
        const rx = L.x - m.lx, rz = L.z - m.lz;
        const pz = rx * m.ox + rz * m.oz, px = rx * m.ax + rz * m.az, py = L.y - m.ly;
        const dp = Math.max(0, Math.abs(pz) - T / 2);
        const ex = Math.max(0, Math.abs(px) - bay / 2), ey = Math.max(0, Math.abs(py) - FH / 2);
        const d3 = Math.hypot(ex, ey, dp);
        const inner = pz < 0;                                  // điểm nổ ở phía trong nhà so với mảng này
        const sameRoom = ctx.inside && m.floor === ctx.floor;  // nổ trong phòng kín: sóng nổ dội khắp tầng
        if (d3 > I.glass * 3 && !sameRoom) continue;
        // kính: mảng quay về phía vụ nổ vỡ ở bán kính đầy đủ, mảng quay lưng chỉ vỡ khi rất gần.
        // Ngoài I.glass vẫn vỡ nhưng thưa dần tới ~3 lần bán kính (kính cửa sổ vỡ ở áp suất dư chỉ ~1-7 kPa: sóng nổ của
        // ~2 kg thuốc nổ còn làm vỡ kính cách 15-20 m; trước đây chỉ vỡ trong ~7 m rồi dừng cụt)
        const facing = inner === ctx.inside ? 1 : 0.4;
        const gR = I.glass * facing;
        if (m.state === 'ok') {
          const pG = sameRoom || d3 < gR ? 1 : d3 < gR * 3 ? Math.pow(1 - (d3 - gR) / (2 * gR), 2) : 0;
          if (pG >= 1 || (pG > 0 && rand(0, 1) < pG)) this.shatter(B, m, ctx, inner, sameRoom ? 1 : Math.max(0, 1 - d3 / gR));
        }
        if (d3 > I.glass && !sameRoom) continue;
        if (sameRoom && vents < 4 && !I.kin && I.sp > 0.3 && (m.state === 'glass' || m.state === 'holed')) {
          const w = this.toWorld(B, m.lx + m.ox * T, m.ly + FH * 0.15, m.lz + m.oz * T), o = this.dirToWorld(B, m.ox, 0, m.oz);
          if (this.vents.length < 48) this.vents.push({ B, x: w.x, y: w.y, z: w.z, nx: o.x, nz: o.z, t: rand(10, 22) * Math.min(1.5, I.sp), acc: rand(0, 0.2) });
          vents++;
        }
        if (I.kin && !ctx.inside) continue;
        // sóng nổ làm nứt mảng tường gần. Nổ trong phòng kín: áp suất dội đi dội lại không thoát ra được -> tường cùng tầng
        // sát điểm nổ bị thổi bay, xa hơn nứt toác (lựu pháo 155 nổ trong nhà 1 khoang ~ thổi bung tường quanh nó).
        // Nổ ngoài trời sát chân tường: sóng nổ dội thẳng vào mặt tường
        if (!I.kin && I.sd && !(sameRoom && ctx.confined)) {   // nổ trong tầng kín: confinedBlast đã tính cả tầng
          const rr = I.sr * (sameRoom ? 1 : 0.6);
          if (d3 < rr) { this.strain(ctx, m, null, I.sd * (sameRoom ? 2 : 0.8) * (1 - d3 / rr), null); if (m.state === 'gone') continue; }
        }
        // nổ gần (không trúng thẳng): chỉ phá thủng khi nổ sát mặt tường, xa hơn thì bóc lở / ám khói / mảnh văng rỗ mặt
        const hole = I.hole * B.WM.k * clamp01(1 - dp / (I.hole * 0.75 + 0.01)) * (sameRoom ? 1.25 : 1);
        const crater = I.crater * clamp01(1 - dp / (I.crater * 1.2 + 0.01));
        const soot = inner ? 0 : I.soot * clamp01(1 - dp / (I.soot * 1.1 + 0.01));
        const R = Math.max(hole, crater, soot) * 1.3;
        if ((hole > 1.2 || crater > 1.5 || soot > 2) && ex < R && ey < R) {
          this.carve(B, m, px, py, { hole: hole > 1.2 ? hole : 0, crater, soot, chip: 0, stretch: 1, tx: 1, ty: 0, noise: holeNoise(), seed: rand(0, 1000), inner });
          ctx.changed = true;
          if (B.cut && this.isCutMod(B, m)) this.cutHide(m);
        }
        if (I.sr > 0 && I.sp > 0.3 && dp < I.sr && ex < I.sr && ey < I.sr) {
          const n = Math.round(9 * (1 - dp / I.sr) * Math.min(1.6, I.sp));
          for (let k = 0; k < n; k++) {
            const a = rand(0, 6.283), r = rand(0.15, 1) * (dp * 0.9 + 6);
            const qx = px + Math.cos(a) * r, qy = py + Math.sin(a) * r;
            if (Math.abs(qx) > bay / 2 || Math.abs(qy) > FH / 2) continue;
            this.carve(B, m, qx, qy, { hole: 0, crater: rand(0.8, 1.5), soot: 0, chip: 0.3, stretch: 1, tx: 1, ty: 0, noise: NO_NOISE, seed: rand(0, 1000), inner });
            ctx.changed = true;
          }
          if (n && B.cut && this.isCutMod(B, m)) this.cutHide(m);
        }
      }
      if (vents) ctx.changed = true;
    }
    /**
     * Nổ trong không gian kín (một tầng nhà; tầng trên cùng gồm cả lòng mái dốc / vòm). Mỗi mảng tường của tầng chịu tải
     * tương đương = 30% áp suất phản xạ của sóng xung kích tại điểm gần nhất (Kinney-Graham, khoảng cách quy đổi R / kg^(1/3);
     * sóng ngắn nên chỉ một phần đỉnh áp gây hại) + áp suất tích tụ (quasi-static ~530·(kg/V)^0.72 kPa, UFC 3-340-02), giảm
     * theo phần vách / mái đã hở cho khí nổ thoát. Tải vượt sức chịu còn lại của mảng (WALLMAT.kpa x độ bền còn lại) ->
     * mảng bật văng ra ngoài; chưa tới -> nứt theo tỷ lệ. Mái dốc / vòm nhẹ bị hất tung cùng cách đó.
     * Ví dụ: đạn 120 (~2,2 kg) hay 155 (~7,7 kg) nổ trong kho tôn 20 x 13 m -> bật hết vách, kho sập; nhà gỗ / gạch đất
     * cũng vậy. Tầng chung cư bê tông 14 x 10 m: đạn 120 chỉ nứt vách; đạn 155 bật vách gần tâm nổ, vách xa nứt toác
     * (tầng trên cùng thường đổ cả tầng, tầng trệt cần quả thứ hai mới sập nhà).
     */
    confinedBlast(ctx, L) {
      const { B, I, fx } = ctx;
      const fl = this.structOf(B), f = Math.max(0, ctx.floor), F = fl[f];
      if (!F) return;
      const M = 1 / 8, bay = B.st.bay, FH = B.FH, T = B.T;
      const y0 = 1.5 + f * FH, topFloor = f === B.floors - 1, RS = topFloor && B.roofShape;
      const yC = RS ? RS.y0 + RS.h : y0 + FH;
      const P = { x: L.x, y: Math.max(y0 + 0.5, Math.min(yC - 0.5, L.y)), z: L.z };
      // thể tích khoang (m³): tầng + lòng mái (vòm: nửa elip, mái dốc: tam giác)
      const wM = B.w * M, dM = B.d * M;
      let V = wM * dM * FH * M;
      if (RS) V += RS.kind === 'arched' ? wM * Math.PI * dM * RS.h * M / 4 : wM * dM * RS.h * M / 2;
      // phần đã hở: mảng tường mất / thủng / vỡ kính, mái (ô mái bằng, mái dốc / vòm) đã mất
      let open = 0, area = 0;
      for (const m of F.mods) {
        if (m.role !== 'wall') continue;
        area += 1;
        open += m.state === 'gone' ? 1 : m.mk ? Math.min(1, m.mk.gone / (m.mk.nx * m.mk.ny)) : m.state === 'glass' ? 0.2 : 0;
      }
      const tileA = bay / FH;   // diện tích một ô sàn / mái quy theo mảng tường
      // mái dốc / vòm chia ô theo khoang (B.roofMods): mỗi ô phủ bz ô sàn
      if (topFloor && B.roofMods) for (const R of B.roofMods) { const n = B.bz * tileA; area += n; if (R.state === 'gone') open += n; }
      else {
        const ceil = B.levels.find(Lv => topFloor ? Lv.role === 'roof' : Lv.role === 'slab' && Lv.f === f);
        if (ceil) for (const t of ceil.tiles) { area += tileA; if (t.state === 'gone') open += tileA; }
      }
      const conf = Math.max(0.2, 1 - 1.5 * open / Math.max(1, area));
      const qsp = 530 * Math.pow(I.kg / Math.max(1, V), 0.72) * conf;
      const cbrt = Math.cbrt(I.kg);
      const load = d => {
        const Z = Math.max(0.3, d * M) / cbrt;
        const ps = 101.3 * 808 * (1 + (Z / 4.5) ** 2) / Math.sqrt((1 + (Z / 0.048) ** 2) * (1 + (Z / 0.32) ** 2) * (1 + (Z / 1.35) ** 2));
        const pr = 2 * ps * (7 * 101.3 + 4 * ps) / (7 * 101.3 + ps);
        return 0.3 * pr + qsp;
      };
      ctx.confined = true;
      const kpa = B.WM.kpa;
      const blown = [];
      for (const m of F.mods) {
        if (m.role !== 'wall' || m.state === 'gone' || m.state === 'stub') continue;
        const rx = P.x - m.lx, rz = P.z - m.lz;
        const pz = rx * m.ox + rz * m.oz, px = rx * m.ax + rz * m.az, py = P.y - m.ly;
        const d = Math.hypot(Math.max(0, Math.abs(px) - bay / 2), Math.max(0, Math.abs(py) - FH / 2), Math.max(0, Math.abs(pz) - T / 2));
        const s = load(d) / kpa;
        if (s < 0.04) continue;
        ctx.changed = true;
        const left = this.modEff(m) * m.hp0;
        if (s >= left) blown.push({ m, s });
        else m.hp = Math.max(0.03, m.hp - s * s / left);   // chưa tới ngưỡng: nứt theo bình phương tỷ lệ tải (kính cả tầng vỡ ở blastNear)
      }
      // mái dốc / vòm (ngói, tôn trên xà nhẹ): sóng nổ đội từ dưới lên, hất bay cả mái
      // (từng ô mái theo khoang: ô ngay trên tâm nổ chịu tải lớn nhất, ô xa dọc sống mái nhẹ hơn)
      if (topFloor && RS && B.roofMods) {
        const rk = B.st.mat === 'metal' ? 15 : 20;
        for (const RM of B.roofMods) {
          if (RM.state === 'gone') continue;
          const s = load(Math.hypot(Math.max(0, Math.abs(P.x - RM.lx) - bay / 2), Math.max(0, RS.y0 - P.y))) / rk;
          if (s >= 0.04) this.hitTile(ctx, RM, s * RM.hp0, null);
        }
      }
      if (!blown.length) return;
      // mảng tường bật văng ra ngoài: càng sát tâm nổ / tải càng dư càng văng xa
      let cx = 0, cz = 0, nfx = 0;
      for (const { m, s } of blown) {
        const push = Math.min(40, 6 + 10 * (s - 1));
        if (!this.fallMod(B, m, m.ox * 1.4, m.oz * 1.4, m.ly + rand(2, 6), rand(0, 0.06), push)) continue;
        cx += m.lx; cz += m.lz;
        if (nfx < 10 && !this._syncing) {
          nfx++;
          const w = this.toWorld(B, m.lx + m.ox * T, m.ly, m.lz + m.oz * T), o = this.dirToWorld(B, m.ox, 0, m.oz);
          jet(fx, w.x, w.y, w.z, o.x, 0.2, o.z, 4, 3, 70 + 15 * Math.min(3, s), B.WM.edge, 0.55);
          dustJet(fx, w.x, w.y, w.z, o.x, o.z, 2, 14, B.WM.dust, 30 + 8 * Math.min(3, s));
        }
      }
      const n = blown.length;
      this.fallFx(B, fx, cx / n, y0 + FH / 2, cz / n, Math.max(B.halfW, B.halfD) * 0.8, n, 1, null);
    }
    // Kính vỡ do sóng nổ (mảng tường còn nguyên đổi sang mặt cửa vỡ toác). inner: điểm nổ ở phía trong nhà so với mảng,
    // near: 0..1 độ gần điểm nổ. Mảnh kính (lớp mảnh kính riêng, không phải đá vụn): nổ ngoài nhà thì sóng nổ thổi phần lớn
    // kính vào trong phòng (nằm lại trên sàn tầng đó), một phần rơi xuống chân tường; nổ trong phòng thì phụt ra ngoài
    shatter(B, m, ctx, inner, near) {
      if (m.state !== 'ok' || !m.h) return;
      // kiểu vỡ theo vị trí mảng (không lấy RNG chung): kính vỡ toang / thủng sạch còn rèm / rạn mạng nhện
      const sv = Math.floor(hash3(B.x * 0.01 + m.lx * 0.13, m.ly * 0.11 + m.floor, B.z * 0.01 + m.lz * 0.17) * 3) % 3;
      m.h = m.kit.swap(m.h, sv ? 'shatter' + sv : 'shatter', m.c);
      m.state = 'glass';
      if (ctx) {
        ctx.changed = true;
        if (B.cut && this.isCutMod(B, m)) this.cutHide(m);
        if (ctx.fx && ctx.glassFx < 14 && B.st.mat !== 'metal' && !m.side && !this._syncing) {
          ctx.glassFx++;
          const k = clamp01(near === undefined ? 0.5 : near);
          const w = this.toWorld(B, m.lx, m.ly + B.FH * 0.05, m.lz), o = this.dirToWorld(B, m.ox, 0, m.oz);
          const floorY = this.toWorld(B, 0, m.floor > 0 ? 1.5 + m.floor * B.FH + 0.8 : 2.1, 0).y;
          if (ctx.fx.glassBurst) ctx.fx.glassBurst(w.x, w.y, w.z, o.x, o.z, { n: Math.round(6 + 12 * k), w: B.st.bay * 0.5, h: B.FH * 0.45, out: inner ? 0.85 : 0.2, speed: 0.4 + 0.9 * k, floor: floorY });
          else jet(ctx.fx, w.x, w.y, w.z, o.x * 0.6, 0.2, o.z * 0.6, 4, 0.9, 30, [0.72, 0.82, 0.88], 0.6);
        }
      }
    }
    // Mô-đun mất hẳn (mảng tường nát vụn / ô sàn sập / mái sập / cột gãy)
    setGone(B, m, fx, quiet) {
      if (m.state === 'gone') return;
      const wasMask = !!m.mk;
      m.state = 'gone';
      m.hp = 0;
      this.hideMod(m);
      if (wasMask) B.dmgPanels.delete(m);
      if (B.cut && this.isCutMod(B, m)) return;
      const wp = m.role === 'wall' ? this.toWorld(B, m.lx, m.ly, m.lz) : this.modWorldPos(m);
      if (fx && fx.removeMarksNear) fx.removeMarksNear(wp.x, wp.y, wp.z, (m.sx || 8) * 0.7);
      if (quiet && this._syncing) return;
      const big = m.role === 'slab' || m.role === 'roof';
      chunks(fx, wp.x, wp.y, wp.z, big ? 5 : 3, m.role === 'col' ? 2.6 : 3.4, B.WM.edge, big ? 10 : 30);
      dustBurst(fx, wp.x, wp.y, wp.z, big ? 4 : 3, big ? 16 : 12, B.WM.dust);
      sfx(matSnd(B), wp.x, wp.y, wp.z, 1, { h: wp.y - B.y });
    }

    // ---------------------------------------------------------------------------
    // KẾT CẤU CHỊU LỰC: mỗi tầng / mỗi mặt nhà có sức chịu = tổng độ bền tường + cột còn lại.
    // Mất một mặt -> mặt đó đổ ra ngoài (sập một bên); cả tầng không đỡ nổi phần trên -> các tầng trên sụp xuống
    // (va đập làm nứt tầng dưới, có thể sập dây chuyền); tầng trệt không đỡ nổi -> sập hẳn.
    // Mọi bước chỉ dựa trên trạng thái mô-đun (đồng bộ qua stateString) -> mọi máy cho cùng kết quả.
    // ---------------------------------------------------------------------------
    // Nứt kết cấu do trúng đạn: mảng m mất độ bền s (tường nguyên = 1), mảng kề cùng mặt (nbs) mất 35%,
    // cột cùng tầng sát điểm trúng L nứt vỡ theo. Mảng / cột hết độ bền thì vỡ vụn hẳn.
    strain(ctx, m, L, s, nbs) {
      const { B } = ctx;
      if (!(s > 0) || m.state === 'gone') return;
      s *= B.WM.sk || 1;
      ctx.changed = true;
      const hurt = (q, d) => {
        if (q.state === 'gone') return;
        q.hp = Math.max(0, q.hp - d);
        if (q.hp <= 0.02) this.setGone(B, q, ctx.fx);
      };
      if (nbs) for (const q of nbs) if (q !== m && q.role === 'wall') hurt(q, s * 0.35);
      const F = L && this.structOf(B)[m.floor];
      if (F) {
        const r = B.st.bay * 0.6;
        for (const c of F.mods) {
          if (c.role !== 'col' || c.state === 'gone') continue;
          const d = Math.hypot(Math.max(0, Math.abs(L.x - c.lx) - c.hx), Math.max(0, Math.abs(L.z - c.lz) - c.hz));
          if (d < r) hurt(c, s * 1.6 * (1 - d / r));
        }
      }
      hurt(m, s);
    }
    // Độ bền còn lại 0..1 của tường / cột: tường = phần còn lại sau khoét lỗ (tường dày chịu được lỗ to hơn) x độ nứt, cột = hp / hp0
    modEff(m) {
      if (m.state === 'gone' || m.state === 'stub') return 0;
      const h = clamp01(m.hp / m.hp0);
      return m.mk ? h * clamp01(1 - 1.5 * m.mk.gone / (m.mk.nx * m.mk.ny) / m.hp0) : h;
    }
    // Tường + cột theo tầng và theo 4 mặt (cột góc thuộc cả 2 mặt; cột nặng gấp đôi tường)
    structOf(B) {
      if (B.fl) return B.fl;
      const fl = [];
      for (let f = 0; f < B.floors; f++) fl.push({ mods: [], side: { x1: [], 'x-1': [], z1: [], 'z-1': [] }, failed: {} });
      for (const m of B.mods) {
        if ((m.role !== 'wall' && m.role !== 'col') || !fl[m.floor]) continue;
        const F = fl[m.floor];
        F.mods.push(m);
        // khả năng chịu lực: cột 2, tường 1; cao ốc khung cột: vách kính / tủ kính / khung bê tông dải kính chịu rất ít
        m.lb = m.role === 'wall' && B.tower ? (TOWER_LB[m.style] !== undefined ? TOWER_LB[m.style] : 0.7) : 1;
        m.sw = m.role === 'col' ? 2 : m.lb;
        if (m.role === 'wall') F.side[m.ox > 0.5 ? 'x1' : m.ox < -0.5 ? 'x-1' : m.oz > 0.5 ? 'z1' : 'z-1'].push(m);
        else {
          if (Math.abs(m.lx) > B.halfW - 3) F.side[m.lx > 0 ? 'x1' : 'x-1'].push(m);
          if (Math.abs(m.lz) > B.halfD - 3) F.side[m.lz > 0 ? 'z1' : 'z-1'].push(m);
        }
      }
      return (B.fl = fl);
    }

    // Nhịp sàn thiết kế của một lớp sàn / mái (số ô): nhà nguyên vẹn, ô xa tường / cột nhất cần bắc qua bao nhiêu ô mới tới
    // ô có tường / cột ngay dưới (nhà lớn lưới cột thưa cần > 2). Chỉ theo hình học -> mọi máy / mọi lúc tính ra như nhau
    slabSpan(B, Lv, fS) {
      const r = B.st.bay * 0.95, mods = B.fl[fS].mods, grid = new Map(), anc = new Set();
      for (const t of Lv.tiles) {
        grid.set(t.ti * 4096 + t.tj, t);
        if (mods.some(q => Math.hypot(q.lx - t.lx, q.lz - t.lz) < r)) anc.add(t);
      }
      const dist = (t, di, dj) => { for (let k = 1; ; k++) { const q = grid.get((t.ti + di * k) * 4096 + t.tj + dj * k); if (!q) return Infinity; if (anc.has(q)) return k; } };
      let K = 2;
      for (const t of Lv.tiles) {
        if (anc.has(t)) continue;
        const need = Math.min(Math.max(dist(t, -1, 0), dist(t, 1, 0)), Math.max(dist(t, 0, -1), dist(t, 0, 1)));
        if (need < Infinity) K = Math.max(K, need);
      }
      return K;
    }

    checkStructure(B, fx) {
      if (B.collapsed) return null;
      const fl = this.structOf(B), bay = B.st.bay;
      // thép / mảng gãy treo ở mép sàn: ô sàn đó sập nốt thì bỏ theo
      if (B.scars) B.scars = B.scars.filter(s => { if (!s.tiles.some(t => t.state === 'gone')) return true; this.removeScar(s); return false; });
      // ụ đổ nát trên nóc: sàn bên dưới sập quá nửa thì ụ rơi theo (tầng dưới sụp tiếp sẽ dựng ụ mới thấp hơn)
      if (B.piles) for (const P of B.piles.slice()) {
        if (P.y0 === undefined) continue;
        const Lv = B.levels.find(L => L.f === P.lvl && L.role === 'slab');
        if (!Lv || Lv.tiles.filter(t => t.state === 'gone').length * 2 > Lv.tiles.length) this.removePile(P);
      }
      // Đang áp trạng thái từ máy khác: mọi mảng đổ / sập của máy đó đã có sẵn trong chuỗi trạng thái; lỗ thủng ở đây chỉ dựng
      // gần đúng nên KHÔNG suy ra đổ sập mới (tránh máy nhận sập nhiều hơn máy gửi) — chỉ cập nhật chiều cao còn đứng
      if (this._syncing) {
        let top = 0;
        for (let f = fl.length - 1; f >= 0 && !top; f--) if (fl[f].mods.some(m => m.state !== 'gone')) top = f + 1;
        if (top < B.floors) B.entry.height = Math.min(B.entry.height, 1.5 + top * B.FH + 4);
        if (B.dmgDirty) { B.dmgDirty = false; this.rebuildDamage(B); }
        return null;
      }
      const sup = arr => { let a = 0, t = 0; for (const m of arr) { t += m.sw; a += m.sw * this.modEff(m); } return t > 0 ? a / t : 1; };
      // một mặt nhà chủ yếu tựa vào mảng tường của mặt đó: tường nát hết thì 2 cột góc đơn độc không giữ nổi cả mặt
      // (cao ốc khung cột: vách kính chịu ít -> phần cột của mặt đó chiếm tỉ trọng lớn, xem m.lb)
      const sideSup = arr => {
        let a = 0, t = 0, ca = 0, ct = 0, lb = 0;
        for (const m of arr) { const e = this.modEff(m); if (m.role === 'wall') { t++; a += e; lb += m.lb; } else { ct++; ca += e; } }
        const ww = t ? 0.75 * lb / t : 0;
        return t ? ww * a / t + (ct ? (1 - ww) * ca / ct : 1 - ww) : (ct ? ca / ct : 1);
      };
      // ĐƯỜNG TRUYỀN LỰC THEO PHƯƠNG ĐỨNG (bắn sập cột / mảng tường chân nhà -> phần nhà ngay phía trên đổ theo):
      // cấu kiện tầng f chỉ đứng được nếu ngay bên dưới (≤ ~0,75 khoang) còn tường / cột chịu lực, HOẶC còn chỗ đỡ ở CẢ HAI
      // phía dọc mặt nhà để dầm / lanh tô bắc qua (nhịp ≤ ~2 khoang). Góc nhà chỉ có một phía -> mất cột góc + tường hai bên góc
      // là cả cột góc nhà từ đó trở lên đổ xuống; xét từ dưới lên nên sập dây chuyền lên các tầng trên trong cùng một lượt
      const supAt = (f, x, z, r) => {
        let best = 0;
        for (const q of fl[f].mods) {
          if (q.state === 'gone') continue;
          const d = Math.hypot(q.lx - x, q.lz - z);
          if (d < r) best = Math.max(best, this.modEff(q) * (q.lb || 1) * (1 - 0.4 * d / r));
        }
        return best;
      };
      const spans = (f, x, z, ax, az) => supAt(f, x - ax * bay * 1.5, z - az * bay * 1.5, bay * 0.9) > 0.45 && supAt(f, x + ax * bay * 1.5, z + az * bay * 1.5, bay * 0.9) > 0.45;
      const parts = [];
      for (let f = 1; f < fl.length; f++) {
        for (const m of fl[f].mods) {
          if (m.state === 'gone' || supAt(f - 1, m.lx, m.lz, bay * 0.75) > 0.3) continue;
          const held = m.role === 'wall' ? spans(f - 1, m.lx, m.lz, m.ax, m.az) : (spans(f - 1, m.lx, m.lz, 1, 0) || spans(f - 1, m.lx, m.lz, 0, 1));
          if (held) continue;
          const tx = m.role === 'wall' ? m.ox : Math.sign(m.lx) * 0.7, tz = m.role === 'wall' ? m.oz : Math.sign(m.lz) * 0.7;
          if (this.fallMod(B, m, tx, tz, m.ly + rand(2, 6), rand(0, 0.15) + (f - 1) * 0.06)) parts.push(m);
        }
      }
      // Ô sàn / mái + mái dốc / vòm còn được đỡ không (chạy lại sau khi một mặt / các tầng đổ, xem cuối hàm)
      const settle = parts => {
        // Ô sàn / mái: đứng được khi ngay bên dưới còn tường / cột đỡ (ô "neo"), HOẶC bắc qua được theo một trục: cả hai phía,
        // trong ≤ K ô liền nhau còn nguyên, gặp ô neo (K = nhịp dầm sàn của chính nhà đó lúc nguyên vẹn, ít nhất 2 khoang, xem
        // slabSpan). Ô chỉ treo vào hàng xóm cũng đang lơ
        // lửng thì sụp theo -> không còn cả mảng sàn lơ lửng (ô neo không phụ thuộc ô khác nên kết quả không theo thứ tự duyệt)
        for (const Lv of B.levels) {
          const fS = Lv.f - (Lv.role === 'roof' ? 1 : 0);
          if (!fl[fS]) continue;
          // lớp sàn còn nguyên trên tầng đỡ còn nguyên: chắc chắn đứng (nhịp K tính theo đúng trạng thái này) -> bỏ qua cho nhanh
          if (!Lv.tiles.some(t => t.state === 'gone') && !fl[fS].mods.some(q => this.modEff(q) < 0.999)) continue;
          const grid = new Map(), anch = new Set(), drop = [];
          for (const t of Lv.tiles) if (t.state !== 'gone') {
            grid.set(t.ti * 4096 + t.tj, t);
            if (supAt(fS, t.lx, t.lz, bay * 0.95) > 0.2) anch.add(t);
          }
          const K = Lv.span || (Lv.span = this.slabSpan(B, Lv, fS));
          const reach = (t, di, dj) => {
            for (let k = 1; k <= K; k++) { const q = grid.get((t.ti + di * k) * 4096 + t.tj + dj * k); if (!q) return false; if (anch.has(q)) return true; }
            return false;
          };
          for (const t of grid.values()) if (!anch.has(t) && !(reach(t, -1, 0) && reach(t, 1, 0)) && !(reach(t, 0, -1) && reach(t, 0, 1))) drop.push(t);
          for (const t of drop) if (this.fallMod(B, t, Math.sign(t.lx) * 0.5, Math.sign(t.lz) * 0.5, t.ly + rand(2, 6), rand(0.05, 0.3))) parts.push(t);
        }
        // Mái dốc / vòm chia ô theo khoang: vì kèo mỗi ô gác lên 2 tường dọc (2 mép mái, z = ±) của tầng trên cùng.
        // Ô còn đủ chỗ tựa ở cả 2 mép thì đứng; chỉ còn một mép thì treo được nhờ xà gồ / bờ nóc gác sang ô kề bên còn đứng
        // vững; không thì sụp (lật về phía mép mất chỗ tựa). Xét theo chỗ tựa tính trước -> không phụ thuộc thứ tự duyệt
        const RS = B.roofMods, fT = B.floors - 1;
        if (RS && fl[fT]) {
          const hz = B.halfD - 0.8, hx = B.halfW - 0.8;
          const sup2 = RS.map(m => {
            if (m.state === 'gone') return -1;
            const x = Math.max(-hx, Math.min(hx, m.lx));
            return (supAt(fT, x, -hz, bay * 0.9) > 0.3 ? 1 : 0) + (supAt(fT, x, hz, bay * 0.9) > 0.3 ? 2 : 0);
          });
          RS.forEach((m, i) => {
            const k = sup2[i];
            if (k < 0 || k === 3) return;
            if (k && (sup2[i - 1] === 3 || sup2[i + 1] === 3)) return;
            const tz = k === 1 ? 0.6 : k === 2 ? -0.6 : 0;
            if (this.fallMod(B, m, rand(-0.15, 0.15), tz, m.ly + rand(2, 5), rand(0.1, 0.3))) parts.push(m);
          });
        }
        if (parts.length) {
          let wx = 0, wy = 0, wz = 0, f1 = 0;
          for (const m of parts) { wx += m.lx; wy += m.ly; wz += m.lz; f1 = Math.max(f1, m.floor || 0); }
          const n = parts.length, cxl = wx / n, czl = wz / n;
          const R = Math.max(bay * 0.6, ...parts.map(m => Math.hypot(m.lx - cxl, m.lz - czl))) + bay * 0.3;
          this.fallFx(B, fx, cxl, wy / n, czl, R, n, Math.max(1, f1), null);
        }
      };
      settle(parts);
      let top = 0;
      for (let pass = 0; pass < fl.length * 5 + 2; pass++) {
        top = 0;
        for (let f = fl.length - 1; f >= 0 && !top; f--) if (fl[f].mods.some(m => m.state !== 'gone')) top = f + 1;
        if (!top) break;
        let acted = false;
        // 1) Một mặt nhà ở tầng f còn dưới 40% sức chịu (tường mặt đó gần như nát hết): cả mặt đó từ tầng f trở lên đổ ra ngoài, dải sàn sát mặt sụp theo.
        //    Nhà hẹp (sâu ≤ 2 khoang) mất mặt dài thì cả phần nhà từ tầng đó trở lên đổ theo (nhà ống đổ nghiêng)
        for (let f = 0; f < top && !acted; f++) {
          const F = fl[f];
          for (const k in F.side) {
            if (F.failed[k] || !F.side[k].length || sideSup(F.side[k]) >= 0.4) continue;
            F.failed[k] = true;
            const len = k[0] === 'z' ? B.bx : B.bz, depth = k[0] === 'z' ? B.bz : B.bx;
            if (len >= depth && depth <= 2 && f + 1 < top) { this.dropFloors(B, f === 0 ? 1 : f, fx); acted = true; break; }
            if (this.dropSide(B, f, k, fx)) { acted = true; break; }
          }
        }
        if (acted) continue;
        // 2) Cả tầng f không đủ sức đỡ phần nhà phía trên: cần còn ~45-50% sức chịu (cột tầng dưới nhà cao đã to hơn, xem buildOne),
        //    mặt nào đã đổ thì tải dồn lệch nên cần nhiều hơn
        for (let f = 0; f < top; f++) {
          const F = fl[f];
          if (!F.mods.length) continue;
          let nf = 0;
          for (const k in F.failed) nf++;
          if (sup(F.mods) >= 0.45 + 0.05 * Math.min(1, (top - 1 - f) / 6) + 0.08 * nf) continue;
          if (f === 0) { top = 0; break; }
          this.dropFloors(B, f, fx);
          acted = true;
          break;
        }
        if (!acted) break;
      }
      if (!top) {
        if (B.dmgDirty) B.dmgDirty = false;
        this.collapse(B, fx);
        return { type: 'collapse', text: 'TÒA NHÀ SẬP ĐỔ', x: B.x, z: B.z };
      }
      settle([]);   // dải sàn thứ hai sau mặt vừa đổ / mái mất chỗ tựa: sụp ngay, không đợi phát bắn sau
      // phần nhà còn đứng thấp đi -> vật cản thấp theo (đạn / tầm nhìn bay qua được phía trên đống đổ)
      if (top < B.floors) B.entry.height = Math.min(B.entry.height, 1.5 + top * B.FH + 4);
      if (B.dmgDirty) { B.dmgDirty = false; this.rebuildDamage(B); }
      return null;
    }
    // Mô-đun rơi xuống (hiệu ứng như lúc sập nhà): mất ngay khỏi kết cấu, rơi đoạn drop rồi biến vào bụi
    // push: mảng bị sóng nổ thổi bật văng xa thêm theo hướng (tx, tz) (đơn vị thế giới)
    fallMod(B, m, tx, tz, drop, delay, push) {
      if (m.state === 'gone') return false;
      m.state = 'gone';
      m.hp = 0;
      if (!this._bulk) this.crushOfMod(B, m, tx, tz, push, delay);
      if (m.mk || (m.kit && !m.h) || (B.cut && this.isCutMod(B, m))) {
        this.hideMod(m);
        if (m.mk) { B.dmgPanels.delete(m); B.dmgDirty = true; }
        return true;
      }
      if (m.kit && m.h) for (const [p, i] of m.h.extra) p.hide(i);
      this.anim.push({ B, m, t: 0, delay, drop, tilt: { x: tx, z: tz }, spin: rand(-0.3, 0.3), push: push || 0 });
      return true;
    }
    // Vùng đè xe của một mô-đun rơi lẻ: mảng tường đổ / văng ra ngoài (rơi xa theo độ cao + sức đẩy), ô sàn trần tầng trệt /
    // mái nhà 1 tầng sụp xuống lòng nhà (chỉ xe ở dưới ô). Sàn tầng trên rơi xuống sàn tầng dưới còn nguyên: không tới xe
    crushOfMod(B, m, tx, tz, push, delay) {
      const mat = B.st.mat || 'concrete', d0 = delay || 0;
      if (m.role === 'wall') {
        const k = m.ly * 0.35 + (push || 0) * 0.5, tl = Math.hypot(tx || 0, tz || 0) || 1;
        this.queueCrush(B, m.lx + (tx || 0) / tl * k, m.lz + (tz || 0) / tl * k, B.st.bay * 0.55, B.st.bay * 0.55,
          CRUSH_PANEL[mat] * Math.sqrt(1 + m.floor), d0 + Math.sqrt(2 * m.ly / 90));
      } else if ((m.role === 'slab' && m.floor === 0) || (m.role === 'roof' && B.floors === 1)) {
        const roofK = m.role === 'roof' ? (B.roofMods && B.roofMods.includes(m) ? (mat === 'wood' || mat === 'metal' ? 0.35 : 0.6) : 1) : 1;
        this.queueCrush(B, m.lx, m.lz, (m.hx || B.st.bay / 2) * (m.slice ? 1 : 1), m.slice ? B.halfD : (m.hz || B.st.bay / 2),
          0.18 * roofK * (mat === 'wood' || mat === 'metal' ? 0.5 : 1), d0 + 0.35, { yTop: m.ly });
      }
    }
    // Một mặt nhà (k) từ tầng f trở lên đổ ra ngoài + dải sàn / mái sát mặt đó
    dropSide(B, f, k, fx) {
      this._bulk = true;
      try { return this.dropSideRaw(B, f, k, fx); } finally { this._bulk = false; }
    }
    dropSideRaw(B, f, k, fx) {
      const fl = B.fl, o = { x1: [1, 0], 'x-1': [-1, 0], z1: [0, 1], 'z-1': [0, -1] }[k];
      let n = 0, nw = 0, nt = 0;
      for (let g = f; g < fl.length; g++) for (const m of fl[g].side[k]) if (this.fallMod(B, m, o[0] + rand(-0.4, 0.4), o[1] + rand(-0.4, 0.4), m.ly + rand(2, 6), rand(0, 0.15) + (g - f) * 0.05)) { n++; if (m.role === 'wall') nw++; }
      const edge = t => k === 'x1' ? t.ti === B.bx - 1 : k === 'x-1' ? t.ti === 0 : k === 'z1' ? t.tj === B.bz - 1 : t.tj === 0;
      for (const Lv of B.levels) if (Lv.f >= f) for (const t of Lv.tiles) if (edge(t) && this.fallMod(B, t, o[0], o[1], t.ly + rand(2, 6), rand(0.05, 0.25))) { n++; nt++; }
      // mái dốc / vòm: mặt đầu hồi đổ -> ô mái đầu đó đổ theo; mặt dọc (mép mái) đổ -> cả mái mất chỗ tựa
      if (B.roofMods) for (const m of B.roofMods) {
        if (k === 'x1' ? m.ti !== B.bx - 1 : k === 'x-1' ? m.ti !== 0 : false) continue;
        if (this.fallMod(B, m, o[0] * 0.6, o[1] * 0.6, m.ly + rand(2, 5), rand(0.1, 0.3) + 0.04 * Math.abs(m.ti - (B.bx - 1) / 2))) n++;
      }
      if (!n) return 0;
      const y0 = 1.5 + f * B.FH, y1 = 1.5 + fl.length * B.FH;
      this.fallFx(B, fx, o[0] * B.halfW, (y0 + y1) / 2, o[1] * B.halfD, (o[0] ? B.halfD : B.halfW), n, fl.length - f, o);
      // đống gạch đá dọc chân mặt vừa đổ, mọc lên đúng lúc mảng tường chạm đất; mép sàn còn lại gãy lởm chởm, thép thò ra
      this.sidePile(B, f, k, nw, nt, 0.2 + Math.sqrt(2 * ((y0 + y1) / 2) / 90));
      // vùng đè xe dọc chân mặt vừa đổ (đúng chỗ đống gạch đá): nặng theo số tầng đổ, khung gỗ / tôn nhẹ hơn
      {
        const nf = B.floors - f, out = Math.min(22, 4 + nf * 2.2), along = k[0] === 'z' ? B.halfW : B.halfD, perp = k[0] === 'z' ? B.halfD : B.halfW;
        const cc = perp + out * 0.6, mk = { wood: 0.5, metal: 0.4, adobe: 0.8 }[B.st.mat] || 1;
        this.queueCrush(B, o[0] * cc, o[1] * cc, o[0] ? out * 1.1 : along, o[0] ? along : out * 1.1, Math.min(0.9, 0.2 + 0.12 * nf) * mk, 0.2 + Math.sqrt(2 * ((y0 + y1) / 2) / 90));
        // xe trong tầng trệt sát mặt vừa đổ: dải sàn mép sụp theo
        if (f === 0) this.queueCrush(B, o[0] * (perp - B.st.bay / 2), o[1] * (perp - B.st.bay / 2), o[0] ? B.st.bay / 2 : along, o[0] ? along : B.st.bay / 2, Math.min(0.9, 0.2 + 0.12 * nf) * mk, 0.4);
      }
      this.scarEdge(B, f, k);
      return n;
    }
    // Đống gạch đá dọc chân mặt k (từ tầng f trở lên đã đổ ra ngoài): khối lượng ~ phần đặc của tường trừ ô cửa (nw mảng)
    // + dải sàn mép (nt ô), nở rời 1.5 lần
    sidePile(B, f, k, nw, nt, delay) {
      // mỗi mặt một đống: mặt đó đổ thêm từ tầng thấp hơn thì thay bằng đống to hơn, đổ thêm phía trên thì giữ đống cũ
      const old = (B.piles || []).find(P => P.side === k);
      if (old && old.f <= f) return old;
      if (old) { nw += old.nw || 0; nt += old.nt || 0; this.removePile(old); }
      const o = { x1: [1, 0], 'x-1': [-1, 0], z1: [0, 1], 'z-1': [0, -1] }[k], nf = B.floors - f;
      const along = k[0] === 'z' ? B.halfW : B.halfD, perp = k[0] === 'z' ? B.halfD : B.halfW;
      const out = Math.min(22, 4 + nf * 2.2), spill = 3 + out * 0.4;
      const vol = (nw * B.st.bay * B.FH * B.T * 0.6 + nt * B.st.bay * B.st.bay * 1.6) * 1.5;
      const h = Math.max(2.5, Math.min(B.FH * 0.75, vol / (2 * along * (2 * out + spill))));
      const cc = perp + out * 0.6;
      const P = this.makePile(B, o[0] * cc, o[1] * cc, o[0] ? out : along * 0.97, o[0] ? along * 0.97 : out, h, spill,
        { side: k, delay, plates: Math.min(14, 2 + (nt >> 1) + nf), bricks: Math.min(24, 6 + (nw >> 1)), rebar: Math.min(20, 4 + nt) });
      P.f = f; P.nw = nw; P.nt = nt;
      return P;
    }
    // Ụ đổ nát của nF tầng vừa sụp đè lên nóc tầng f-1 + vành gạch đá văng ra quanh chân nhà
    floorPiles(B, f, nF, delay) {
      const yL = 1.5 + f * B.FH;
      if (f > 0) this.makePile(B, 0, 0, B.halfW * 0.86, B.halfD * 0.86, Math.min(B.FH * 0.7, 3 + nF * B.FH * 0.16), 2,
        { y0: yL + 0.8, edge: 0.15, delay, lvl: f - 1, plates: Math.min(16, 4 + nF * 3), bricks: Math.min(22, 6 + nF * 3), rebar: Math.min(18, 4 + nF * 3) });
      if (!(B.piles || []).some(P => P.ring)) this.makePile(B, 0, 0, B.halfW, B.halfD, Math.min(B.FH * 0.5, 2 + nF * 1.8), 4 + nF * 1.5,
        { ring: 5, delay: delay + 0.15, bricks: Math.min(20, 6 + nF * 2), plates: Math.min(8, 2 + nF), rebar: Math.min(8, 2 + nF) });
    }
    // Người vào trận sau / đồng bộ lại trạng thái: các mảng đã đổ có trong chuỗi trạng thái nhưng máy này không thấy lúc đổ ->
    // dựng lại các đống đổ nát tương ứng (ụ trên nóc phần còn đứng, vành gạch quanh chân, đống dọc chân mặt đã đổ). Chỉ để nhìn
    // (+ xe bò qua), không đụng kết cấu; dùng Math.random ngoài withSeed nên không ảnh hưởng đồng bộ
    syncPiles(B) {
      if (B.collapsed) return;
      const fl = this.structOf(B), piles = B.piles || [];
      let top = 0;
      for (let f = fl.length - 1; f >= 0 && !top; f--) if (fl[f].mods.some(m => m.state !== 'gone')) top = f + 1;
      if (top && top < B.floors && !piles.some(P => P.y0 !== undefined && P.lvl === top - 1)) {
        for (const P of piles.slice()) if (P.y0 !== undefined) this.removePile(P);
        this.floorPiles(B, top, B.floors - top, 0);
      }
      for (const k in (fl[0] || { side: {} }).side) {
        if ((B.piles || []).some(P => P.side === k)) continue;
        // tầng thấp nhất mà từ đó trở lên tường mặt k đã đổ hết
        let f0 = -1;
        for (let f = top - 1; f >= 0; f--) { const W = fl[f].side[k].filter(m => m.role === 'wall'); if (W.length && W.every(m => m.state === 'gone')) f0 = f; else break; }
        if (f0 < 0) continue;
        let nw = 0;
        for (let f = f0; f < fl.length; f++) nw += fl[f].side[k].filter(m => m.role === 'wall').length;
        this.sidePile(B, f0, k, nw, Math.max(1, (k[0] === 'z' ? B.bx : B.bz)) * (B.floors - f0), 0);
      }
      // hiện ngay (không mọc dần như lúc tận mắt thấy sập)
      for (const P of B.piles || []) if (!P.done) P.t = P.delay + P.dur;
      this.updatePiles(0);
    }
    // Mép sàn còn lại sau khi dải sàn sát mặt k đổ: thép sàn thò ra cong xuống, vài mảng bê tông gãy treo lủng lẳng
    // (mỗi tầng sàn 1 nhóm; ô sàn đó sập nốt thì nhóm biến theo, xem checkStructure / collapse / applyCut)
    scarEdge(B, f, k) {
      const bay = B.st.bay, W = B.bx * bay, D = B.bz * bay, sgn = k[1] === '-' ? -1 : 1, isX = k[0] === 'x';
      if ((isX ? B.bx : B.bz) < 2) return;
      const inner = t => isX ? t.ti === (sgn > 0 ? B.bx - 2 : 1) : t.tj === (sgn > 0 ? B.bz - 2 : 1);
      const ca = Math.cos(B.angle), sa = Math.sin(B.angle);
      for (const Lv of B.levels) {
        if (Lv.f < f) continue;
        const tiles = Lv.tiles.filter(t => t.state !== 'gone' && inner(t));
        if (!tiles.length) continue;
        const bars = [], chunks = [], mats = [];
        const yb = Lv.y - Lv.th * 0.2, edgeC = isX ? sgn * (W / 2 - bay) : sgn * (D / 2 - bay);
        for (const t of tiles) {
          const u0 = isX ? t.lz : t.lx;
          if (B.st.rc) for (let i = 0; i < 5; i++) {
            const u = u0 + rand(-0.45, 0.45) * bay, L = rand(1.8, 5.5), a = rand(0.25, 1.3) * sgn;
            const c = new THREE.CylinderGeometry(0.12, 0.12, L, 4);
            c.translate(0, -L / 2, 0);
            c.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(isX ? new THREE.Euler(rand(-0.2, 0.2), 0, a) : new THREE.Euler(-a, 0, rand(-0.2, 0.2))));
            c.translate(isX ? edgeC : u, yb + rand(-0.5, 0.4), isX ? u : edgeC);
            bars.push(c.toNonIndexed());
          }
          // mảng bê tông gãy còn dính thép, gập xuống
          if (RNG() < 0.6) {
            const u = u0 + rand(-0.3, 0.3) * bay, len = rand(3, 6), wid = rand(0.25, 0.55) * bay, a = rand(0.5, 1.2);
            const lx = isX ? edgeC + sgn * Math.cos(a) * len / 2 : u, lz = isX ? u : edgeC + sgn * Math.cos(a) * len / 2, ly = yb - Math.sin(a) * len / 2;
            const q = new THREE.Quaternion().setFromEuler(isX ? new THREE.Euler(0, B.angle, -sgn * a) : new THREE.Euler(sgn * a, B.angle, 0, 'YXZ'));
            const cm = new THREE.Matrix4().compose(new THREE.Vector3(B.x + lx * ca + lz * sa, ly + B.y - 1.5, B.z - lx * sa + lz * ca), q, isX ? new THREE.Vector3(len, Lv.th * 0.8, wid) : new THREE.Vector3(wid, Lv.th * 0.8, len));
            const idx = this.slabChunkPool.add(cm, t.c.clone().multiplyScalar(rand(0.7, 0.9)));
            if (idx >= 0) { chunks.push(idx); mats.push(cm); }
          }
        }
        let g = null;
        if (bars.length) {
          g = new THREE.Mesh(merge(bars), REBAR_MAT());
          g.position.set(B.x, B.y - 1.5, B.z);
          g.rotation.y = B.angle;
          this.group.add(g);
        }
        (B.scars || (B.scars = [])).push({ tiles, g, chunks, mats, lvl: Lv.role === 'roof' ? 99 : Lv.f });
        if (B.cut && (Lv.role === 'roof' || Lv.f >= 1)) this.scarVis(B.scars[B.scars.length - 1], false);
      }
    }
    scarVis(s, on) {
      if (s.g) s.g.visible = on;
      for (const i of s.chunks) if (!on) this.slabChunkPool.hide(i);
      s.hidden = !on;
      if (on && s.mats) for (let j = 0; j < s.chunks.length; j++) this.slabChunkPool.set(s.chunks[j], s.mats[j]);
    }
    removeScar(s) {
      if (s.g) { if (s.g.parent) s.g.parent.remove(s.g); s.g.geometry.dispose(); }
      for (const i of s.chunks) this.slabChunkPool.hide(i);
    }

    // Hướng yếu nhất (mặt tầng trệt còn ít sức chịu nhất) -> nhà sập nghiêng về phía đó; nhà còn nguyên thì hướng ngẫu nhiên
    weakDir(B, f) {
      const D = { x1: [1, 0], 'x-1': [-1, 0], z1: [0, 1], 'z-1': [0, -1] }, F = B.fl && B.fl[f || 0];
      let best = null, bs = 9;
      if (F) for (const k in F.side) {
        const arr = F.side[k];
        if (!arr.length) continue;
        let a = 0, t = 0;
        for (const m of arr) { t += m.sw || 1; a += (m.sw || 1) * this.modEff(m); }
        const s = a / t + rand(0, 0.08);
        if (s < bs) { bs = s; best = k; }
      }
      let x, z;
      if (best) { x = D[best][0] + rand(-0.3, 0.3); z = D[best][1] + rand(-0.3, 0.3); } else { const a = rand(0, 6.283); x = Math.cos(a); z = Math.sin(a); }
      const l = Math.hypot(x, z) || 1;
      return { x: x / l, z: z / l };
    }
    // Nhà đang sụp (collapse): khối nhà tụt xuống với gia tốc ~0.4-0.55 g, nghiêng dần quanh chân mặt yếu; mảng chạm mặt đống
    // đổ nát (dâng dần theo lượng nhà đã bị nghiền) thì vỡ vụn: đá văng + bụi phụt ngang ra khỏi chân nhà, cuộn thành đám bụi
    // dày bao lấy khối nhà đang chìm xuống. Chi tiết mái đi theo ô mái, lưới vỡ (mảng đã khoét) tụt theo cả khối
    updateCollapse(dt, fx) {
      if (!this.collapsing || !this.collapsing.length) return;
      // nháp dùng lại giữa các khung (Pool.set / matrix.copy chép giá trị, không giữ tham chiếu)
      const CS = this._colS || (this._colS = { off: new THREE.Matrix4(), T1: new THREE.Matrix4(), Rm: new THREE.Matrix4(), T2: new THREE.Matrix4(), M: new THREE.Matrix4(),
        bo: new THREE.Matrix4(), inv: new THREE.Matrix4(), v: new THREE.Vector3(), axis: new THREE.Vector3() });
      const off = CS.off, T1 = CS.T1, Rm = CS.Rm, T2 = CS.T2, M = CS.M, v = CS.v, axis = CS.axis;
      let nfx = 0;
      for (let i = this.collapsing.length - 1; i >= 0; i--) {
        const C = this.collapsing[i], B = C.B;
        const h = Math.min(dt, 0.1);
        C.t += h;
        C.v += C.a * h;
        C.y += C.v * h;
        const k = clamp01(C.y / Math.max(1, C.H));
        C.lean = C.leanMax * Math.pow(Math.min(1, k * 1.6), 2);
        const px = C.dir.x * B.halfW, pz = C.dir.z * B.halfD;
        axis.set(C.dir.z, 0, -C.dir.x).normalize();
        T1.makeTranslation(px, 1.5 - C.y, pz); Rm.makeRotationAxis(axis, C.lean); T2.makeTranslation(-px, -1.5, -pz);
        off.multiplyMatrices(T1, Rm).multiply(T2);
        const surf = 1.5 + (B.rubbleH || 0) * Math.max(0, B.rubbleT || 0) * 0.8;
        const W = B.base, bo = CS.bo.multiplyMatrices(W, off);
        let alive = 0;
        // ma trận từng tầng: khối nhà + xô lệch / xoay riêng tầng đó (tăng dần theo quãng đã sụp)
        const kp = Math.min(1, k * 2.2);
        if (C.fw) for (const F of C.fw) {
          F.m.makeRotationY(F.r * kp); F.m.setPosition(F.dx * kp, 0, F.dz * kp);
          F.m.premultiply(off);
        }
        for (const m of C.mods) {
          if (m.crushed) continue;
          const F = C.fw && C.fw[Math.min(C.fw.length - 1, m.floor | 0)], offM = F ? F.m : off;
          v.set(m.lx, m.ly - (m.hy || 0), m.lz).applyMatrix4(offM);
          const dS = (v.y - surf) / B.FH;
          // mảng tường ngoài sát trên đường nghiền bong khỏi khối, đổ nghiêng ra ngoài và rơi xuống đống đổ nát
          if (m._pa && dS < m._pa && dS > 0) {
            m.crushed = true;
            this.anim.push({ B, m, t: 0, delay: 0, drop: Math.max(4, v.y - surf + rand(2, 6)), tilt: { x: m.ox * 1.6 + rand(-0.3, 0.3), z: m.oz * 1.6 + rand(-0.3, 0.3) }, spin: rand(-0.5, 0.5), pre: offM.clone() });
            continue;
          }
          // ẩn khi cả mảng đã chìm dưới mặt đống (đỉnh mảng, không phải chân): tường tầng trệt chân sát mặt nền, xét chân thì
          // khung đầu tiên đã ẩn sạch -> cả nhà mất tường, mái lơ lửng trước khi bụi kịp phủ
          if (v.y + 2 * (m.hy || 0) < surf) {
            m.crushed = true;
            this.hideMod(m);
            if (fx && nfx < 12 && (m.role !== 'wall' || (m.id & 1))) {
              nfx++;
              const w = this.toWorld(B, v.x, surf + 2, v.z);
              chunks(fx, w.x, w.y, w.z, 2, 3, B.WM.edge, 18);
              if (fx.smoke) {
                const ex = v.x / (B.halfW + 1), ez = v.z / (B.halfD + 1), d = Math.hypot(ex, ez) || 1, o = this.dirToWorld(B, ex / d, 0, ez / d);
                const sp = rand(14, 34), c = B.WM.dust, s = rand(0.85, 1.05);
                fx.smoke.add({ x: w.x, y: B.y + rand(3, 10), z: w.z, vx: o.x * sp, vy: rand(2, 9), vz: o.z * sp, size: rand(22, 36) + B.floors, grow: rand(5, 9), drag: 0.55, grav: -0.5,
                  life: rand(12, 20), alpha: 0.72, fadeIn: 0.15, c0: [c[0] * s, c[1] * s, c[2] * s], cell: 2 });
              }
            }
            continue;
          }
          alive++;
          const bm = F ? CS.bm || (CS.bm = new THREE.Matrix4()) : bo;
          if (F) bm.multiplyMatrices(W, offM);
          // vùng bị nghiền (~1,2 tầng trên mặt đống): mảng bị bẻ gập chĩa ra ngoài quanh mép dưới, cột / sàn xiêu vẹo
          if (dS < 1.2 && m._cj) {
            const c = (1 - Math.max(0, dS) / 1.2) * m._cj, cr = CS.cr || (CS.cr = new THREE.Matrix4()), ct = CS.ct || (CS.ct = new THREE.Matrix4());
            const ox = m.role === 'wall' ? m.ox : (m.lx > 0 ? 0.5 : -0.5), oz = m.role === 'wall' ? m.oz : (m.lz > 0 ? 0.5 : -0.5);
            axis.set(oz, 0, -ox).normalize();
            const by = m.ly - (m.hy || 0);
            ct.makeTranslation(m.lx + ox * c * 3, by, m.lz + oz * c * 3); cr.makeRotationAxis(axis, c); ct.multiply(cr); cr.makeTranslation(-m.lx, -by, -m.lz); ct.multiply(cr);
            bm.multiply(ct);
          }
          M.multiplyMatrices(bm, m.local);
          if (m.kit) m.h.pool.set(m.h.idx, M); else m.pool.set(m.idx, M);
          if (m.deco) for (const dd of m.deco) dd.pool.set(dd.idx, M.multiplyMatrices(bm, dd.local));
        }
        // Bụi cuộn liên tục quanh chân nhà suốt lúc khối nhà chìm xuống (không đợi đổ xong mới có bụi): từng tầng bị nghiền ép
        // không khí phụt bụi ngang ra sát đất rồi bốc lên, che đường nghiền ở chân khối; đá vụn bắn ra ở đường nghiền
        if (alive && fx && fx.smoke) {
          const dK = { concrete: 1, stone: 0.9, adobe: 1.15, wood: 0.45, metal: 0.25 }[B.st.mat] || 1;
          C.dust += h * (30 + 8 * B.floors) * dK;
          const c = B.WM.dust;
          while (C.dust >= 1) {
            C.dust -= 1;
            // ~1/2 phụt ngang sát đất ra khỏi chân nhà, ~1/2 bốc ngược lên dọc mặt nhà đang chìm (che dần cả khối)
            const up = RNG() < 0.55, upK = 0.7 + Math.min(1.2, B.floors / 8);   // nhà càng cao bụi bốc dọc mặt nhà càng mạnh
            const sd = RNG() * 4 | 0, t = rand(-1, 1), nx = sd === 0 ? 1 : sd === 1 ? -1 : 0, nz = sd === 2 ? 1 : sd === 3 ? -1 : 0, inK = up ? rand(0.4, 1) : rand(0.75, 1.02);
            const lx = nx ? nx * B.halfW * inK : t * B.halfW, lz = nz ? nz * B.halfD * inK : t * B.halfD;
            // bụi bốc lên đặc quánh ngay tại đường nghiền ở chân khối (che chỗ khối nhà đang chìm vào đống đổ nát)
            const w = this.toWorld(B, lx, surf + (up ? rand(-2, B.FH * 1.6) : Math.pow(RNG(), 2) * B.FH), lz), o = this.dirToWorld(B, nx, 0, nz), sp = up ? rand(3, 10) : rand(16, 46), s = rand(0.85, 1.06);
            fx.smoke.add({ x: w.x, y: w.y, z: w.z, vx: o.x * sp + rand(-6, 6), vy: up ? rand(10, 26) * upK : rand(4, 14), vz: o.z * sp + rand(-6, 6), size: rand(40, 62) + B.floors * 2.5, grow: rand(8, 13), drag: 0.55, grav: -0.7,
              life: rand(16, 26), alpha: up ? 0.95 : 0.88, fadeIn: 0.08, c0: [c[0] * s, c[1] * s, c[2] * s], cell: 2 });
            if (RNG() < 0.3) chunks(fx, w.x, w.y, w.z, 2, 3.4, B.WM.edge, 30);
          }
        }
        // lưới vỡ (mảng đã khoét lỗ) + thép của nó tụt theo khối; qua ~1,5 tầng thì đã chìm trong bụi
        if (B.dmgMesh || B.barMesh) {
          M.multiplyMatrices(bo, CS.inv.copy(W).invert());
          for (const me of [B.dmgMesh, B.barMesh]) if (me) { me.matrix.copy(M); me.matrixWorldNeedsUpdate = true; if (C.y > B.FH * 1.5) me.visible = false; }
        }
        // đống đổ nát dâng lên theo lượng nhà đã bị nghiền
        B.rubbleT = Math.max(B.rubbleT || 0, Math.min(0.97, Math.pow(1 - alive / Math.max(1, C.n0), 0.8)));
        if (B.rubbleMesh) this.rubbleY(B);
        if (!alive || C.y > C.H + 20) {
          for (const m of C.mods) if (!m.crushed) { m.crushed = true; this.hideMod(m); }
          if (B.dmgMesh) B.dmgMesh.visible = false;
          if (B.barMesh) B.barMesh.visible = false;
          B.rubbleT = 1;
          if (B.rubbleMesh) this.rubbleY(B);
          for (const [idx, cm] of B.chunkIdx || []) this.slabChunkPool.set(idx, cm);
          this.rdShow(B.rubbleDeco);
          if (B.rubbleBarMesh) B.rubbleBarMesh.visible = true;
          B.cz = null;
          this.collapsing.splice(i, 1);
        }
      }
    }
    // Các tầng từ f trở lên đổ sụp xuống tầng f-1; va đập làm nứt tường / cột / sàn tầng f-1 (có thể sập dây chuyền)
    dropFloors(B, f, fx) {
      this._bulk = true;
      try { return this.dropFloorsRaw(B, f, fx); } finally { this._bulk = false; }
    }
    dropFloorsRaw(B, f, fx) {
      // các tầng trên đổ nghiêng về phía tầng gãy yếu nhất (mặt bị bắn nát), không theo hướng ngẫu nhiên
      const yL = 1.5 + f * B.FH, wd = this.weakDir(B, Math.max(0, f - 1)), tx = wd.x, tz = wd.z;
      let n = 0, nF = 0;
      for (const F of B.fl.slice(f)) if (F.mods.some(m => m.state !== 'gone')) nF++;
      for (const m of B.mods) {
        if (m.role === 'base' || m.floor < f) continue;
        if (this.fallMod(B, m, tx, tz, Math.max(3, (m.ly - yL) * 0.8) + rand(1, 4), (m.floor - f) * 0.05 + rand(0, 0.2))) n++;
      }
      const F = B.fl[f - 1];
      if (F) for (const q of F.mods) {
        if (q.state === 'gone') continue;
        q.hp = Math.max(0, q.hp - q.hp0 * Math.min(0.45, 0.1 * nF));
        if (q.hp <= 0.02) this.fallMod(B, q, tx, tz, q.ly + rand(2, 5), rand(0.2, 0.4));
      }
      for (const Lv of B.levels) if (Lv.f === f - 1) for (const t of Lv.tiles) {
        if (t.state === 'gone') continue;
        t.hp -= 0.6 * nF;
        if (t.hp <= 0) this.fallMod(B, t, tx, tz, t.ly - yL + B.FH + rand(2, 5), rand(0.2, 0.4));
        else if (t.state === 'ok') t.state = 'scarred';
      }
      if (n) this.fallFx(B, fx, 0, yL + (B.fl.length - f) * B.FH * 0.4, 0, Math.max(B.halfW, B.halfD), n, nF, null);
      // Các tầng vừa sụp thành ụ đổ nát đè lên nóc phần nhà còn đứng (sàn gãy chồng nghiêng, thép lòi; ẩn khi nhà sập hẳn),
      // phần văng ra ngoài thành vành gạch đá quanh chân nhà; cả hai mọc lên đúng lúc khối nhà rơi chạm xuống
      if (n) this.floorPiles(B, f, nF, 0.2 + Math.sqrt(2 * B.FH * 1.5 / 90));
      // gạch đá các tầng sụp văng ra vành quanh chân nhà (xe trong tầng trệt còn mái che: bỏ lòng nhà)
      if (n) this.queueCrush(B, 0, 0, B.halfW + 3 + nF * 1.5, B.halfD + 3 + nF * 1.5, (0.1 + 0.05 * nF) * ({ wood: 0.5, metal: 0.4, adobe: 0.8 }[B.st.mat] || 1),
        0.2 + Math.sqrt(2 * B.FH * 1.5 / 90), { inHu: B.halfW, inHv: B.halfD });
      B.entry.height = Math.min(B.entry.height, yL + 4);
      return n;
    }
    // Bụi, đá văng, tiếng đổ sập của một phần nhà (tâm lx/ly/lz cục bộ, bán kính R); o: hướng đổ ra ngoài (sập một bên)
    fallFx(B, fx, lx, ly, lz, R, n, nF, o) {
      const w = this.toWorld(B, lx, ly, lz);
      if (fx && fx.removeMarksNear) fx.removeMarksNear(w.x, w.y, w.z, R + (ly - 1.5) * 0.6 + 6);
      if (this._syncing) return;
      const gx = w.x + (o ? (this.dirToWorld(B, o[0], 0, o[1]).x * 8) : 0), gz = w.z + (o ? (this.dirToWorld(B, o[0], 0, o[1]).z * 8) : 0);
      chunks(fx, w.x, w.y, w.z, Math.min(10, 3 + (n >> 2)), 3.4, B.WM.edge, 40);
      const nd = Math.min(16, 3 + (n >> 1));
      for (let i = 0; i < nd; i++) dustBurst(fx, gx + rand(-R, R) * 0.8, B.y + rand(2, Math.max(4, ly * 0.6)), gz + rand(-R, R) * 0.8, 1, 16 + R * 0.25 + nF * 2, B.WM.dust);
      if (fx && fx.smoke && nF) {
        const Tc = 0.2 + Math.sqrt(2 * (ly / 8) / 9.8), col = B.WM.dust;
        for (let i = 0; i < Math.min(28, 8 + nF * 4); i++) {
          const a = rand(0, 6.283), sp = rand(18, 45), v = rand(0.88, 1.06);
          fx.smoke.add({ x: gx + Math.cos(a) * R * 0.6, y: B.y + rand(2, 8), z: gz + Math.sin(a) * R * 0.6, vx: Math.cos(a) * sp, vy: rand(2, 8), vz: Math.sin(a) * sp,
            size: rand(22, 34) + nF * 3, grow: rand(6, 9), drag: 0.55, grav: -0.6, life: rand(10, 18), alpha: 0.6, fadeIn: 0.25, c0: [col[0] * v, col[1] * v, col[2] * v], cell: 2, delay: Tc * rand(0.7, 1.05) });
        }
      }
      // đống gạch vụn dưới chân phần nhà vừa đổ
      for (let k = 0, nb = Math.min(10, 2 + (n >> 2)); k < nb; k++) {
        const px = gx + rand(-R, R) * 0.9, pz = gz + rand(-R, R) * 0.9, sz = rand(1.8, 3.8), gy = this.groundAt(px, pz);
        this.addGroundBit(new THREE.Matrix4().compose(new THREE.Vector3(px, gy + sz * 0.2, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))),
          new THREE.Vector3(sz * 1.3, sz * 0.8, sz)), px, pz, new THREE.Color(B.WM.edge[0], B.WM.edge[1], B.WM.edge[2]).multiplyScalar(rand(0.85, 1.15)));
      }
      sfx('collapse', w.x, w.y, w.z, Math.min(1.1, 0.4 + n / 90), { mat: matSnd(B), h: Math.max(B.FH, ly), floors: Math.max(1, nF) });
    }

    // ---- ĐỐNG ĐỔ NÁT KHI SẬP MỘT PHẦN ----
    // Ụ gạch đá vụn trên nền chữ nhật (cục bộ nhà): tâm (cx, cz), nửa cạnh hw x hd, dày h, tràn rìa spill.
    // o.y0: cao độ chân ụ (cục bộ nhà: ụ trên nóc phần nhà còn đứng); không có -> bám mặt đất từng đỉnh (dốc, hố bom).
    // o.ring: chỉ đắp quanh rìa, lõi nền nhà để trống (gạch rơi ra ngoài chân tường). Mặt ụ dùng nhiễu tần thấp (bước nhiễu
    // ≥ 3 lần bước lưới -> không gai nhọn), vài bậc gãy của mảng sàn, màu bê tông vụn phủ bụi; tảng sàn gãy, gạch, thép lòi
    // hiện ra khi ụ đã đổ xong. Ụ "mọc" dần từ chân sau delay giây (lúc phần nhà rơi chạm đất)
    makePile(B, cx, cz, hw, hd, h, spill, o) {
      o = o || {};
      const seed = RNG() * 1000;
      const hsh = (x, y) => { const k = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return k - Math.floor(k); };
      const vn = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      };
      const LX = 2 * (hw + spill), LZ = 2 * (hd + spill);
      const step = Math.max(2.4, Math.max(LX, LZ) / 48);
      const nx = Math.max(4, Math.round(LX / step)), nz = Math.max(4, Math.round(LZ / step));
      const ramp = Math.max(2, Math.min(hw, hd) * 0.8), ring = o.ring || 0, e0 = o.edge !== undefined ? o.edge : 0.55;
      const prof = (x, z) => {
        const dx = Math.abs(x) - hw, dz = Math.abs(z) - hd;
        let d = dx > 0 || dz > 0 ? Math.hypot(Math.max(0, dx), Math.max(0, dz)) : Math.max(dx, dz);
        if (ring && d < -ring) return 0;
        d += (vn(x * 0.07 + 3, z * 0.07 - 2) - 0.5) * spill * 0.9;   // mép tràn không thẳng
        if (d >= spill) return 0;
        let p = d > 0 ? e0 * Math.pow(1 - d / spill, 1.5) : Math.min(1, e0 + (1 - e0) * -d / ramp);
        if (ring && d < 0) p *= clamp01(1 + d / ring) * 1.2;
        return p;
      };
      const surf = (x, z, p) => h * p * (0.5 + 0.65 * vn(x * 0.05 + 9, z * 0.05) + 0.4 * (vn(x * 0.13, z * 0.13 + 4) - 0.5) + 0.2 * Math.floor(vn(x * 0.08 - 6, z * 0.08 + 1) * 3) / 3);
      const geo = new THREE.PlaneGeometry(LX, LZ, nx, nz);
      geo.rotateX(-Math.PI / 2);
      geo.translate(cx, 0, cz);
      const pos = geo.attributes.position, N = pos.count;
      const top = new Float32Array(N), off = new Float32Array(N), wxz = new Float32Array(N * 2), col = new Float32Array(N * 3);
      const ca = Math.cos(B.angle), sa = Math.sin(B.angle);
      const mineral = B.st.mat === 'concrete' || B.st.mat === 'stone', E = B.WM.edge;
      const base = mineral ? new THREE.Color(0.74, 0.72, 0.68).lerp(B.color, 0.25) : new THREE.Color(E[0] * 1.2, E[1] * 1.2, E[2] * 1.2);
      const rim = new THREE.Color(B.WM.dust[0], B.WM.dust[1], B.WM.dust[2]);
      const offAt = (x, z) => o.y0 !== undefined ? o.y0 - 0.3 : this.groundAt(B.x + x * ca + z * sa, B.z - x * sa + z * ca) - B.y + 0.8;
      let maxH = 0;
      for (let i = 0; i < N; i++) {
        const x = pos.getX(i), z = pos.getZ(i), rx = x - cx, rz = z - cz;
        const p = prof(rx, rz);
        const border = Math.abs(rx) > LX / 2 - 0.1 || Math.abs(rz) > LZ / 2 - 0.1;
        const s = border || p <= 0 ? -0.6 : surf(rx, rz, p);
        wxz[i * 2] = B.x + x * ca + z * sa; wxz[i * 2 + 1] = B.z - x * sa + z * ca;
        top[i] = s; off[i] = offAt(x, z);
        pos.setY(i, off[i] + s);
        maxH = Math.max(maxH, s);
        const n = vn(rx * 0.3 + 5, rz * 0.3);
        const c = base.clone().multiplyScalar(0.84 + 0.32 * n);
        if (mineral && vn(rx * 0.15 + 21, rz * 0.15) > 0.74) c.lerp(B.color, 0.45);
        const dk = 1 - clamp01(p / 0.35);
        c.lerp(rim, 0.06 + 0.5 * dk * dk);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      rubbleAO(col, top, nx, nz, hsh);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      rubbleUV(geo);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const g = new THREE.Group();
      g.position.set(B.x, B.y - 1.2, B.z);
      g.rotation.y = B.angle;
      const mesh = new THREE.Mesh(geo, B.st.mat === 'wood' ? this.rubbleMatWood : this.rubbleMat);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      const hAt = (x, z) => offAt(x, z) + Math.max(0, surf(x - cx, z - cz, Math.max(0, prof(x - cx, z - cz))));
      // tảng sàn gãy nằm nghiêng, gạch đá, thép lòi (hiện ra khi ụ đã đổ xong)
      const P = { B, g, mesh, top, off, w: wxz, R: Math.hypot(LX, LZ) / 2, bars: [], barMesh: null, chunks: [], t: 0, delay: o.delay || 0, dur: o.dur || 1.1, y0: o.y0, lvl: o.lvl || 0, done: false, side: o.side, ring: !!o.ring };
      // đống trên mặt đất (không phải ụ trên sàn tầng): xích xe bò lên được (VehicleCollision.debrisHeight)
      if (o.y0 === undefined) P.vcGrid = { grid: true, ox: B.x, oy: B.y - 1.2, oz: B.z, ca, sa, cx, cz, LX, LZ, nx, nz, arr: pos.array };
      const W = (lx, ly, lz) => new THREE.Vector3(B.x + lx * ca + lz * sa, ly + B.y - 1.2, B.z - lx * sa + lz * ca);
      const rnd = () => [cx + rand(-0.9, 0.9) * hw, cz + rand(-0.9, 0.9) * hd];
      for (let i = 0, np = o.plates || 0; i < np; i++) {
        // mảng sàn gãy cỡ nửa khoang trở lên, cắm nghiêng 10-40°, một phần chìm trong ụ, mép kia chổng lên
        const [x, z] = rnd(), big = Math.min(B.st.bay * 0.8, Math.max(5, Math.min(hw, hd) * 1.4));
        const sx = rand(0.35, 1) * big, sz = rand(0.3, 0.8) * big;
        const yo = rand(-0.6, 1.4), p = W(x, hAt(x, z) - 0.4, z);
        const tl = () => (RNG() < 0.5 ? -1 : 1) * rand(0.15, 0.7);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tl(), B.angle + rand(-0.8, 0.8), tl()));
        // tấm sàn gãy mép răng cưa, dày khác nhau, cắm chìm (xem buildRubble)
        const th = (hsh(i * 3.7 + 1, 9.3) > 0.82 ? 2.4 : 1.1) + hsh(i * 1.9, 4.4);
        p.y += yo * 0.3 - th * 0.45;
        const cm = new THREE.Matrix4().compose(p, q, new THREE.Vector3(sx, th * rand(1.1, 1.6) / 1.35, sz));
        const cc = (mineral ? new THREE.Color(0.8, 0.78, 0.74).lerp(B.color, RNG() < 0.3 ? 0.6 : 0.15) : base.clone()).multiplyScalar(rand(0.5, 0.95));
        cc.multiplyScalar(0.8 + 0.5 * hsh(i * 0.7, 8.8));
        const pv = this.rd.plates[Math.floor(hsh(i * 2.3, 6.1) * 4) % 4], gp = o.y0 !== undefined ? null : this.groundAt(p.x, p.z);
        if (this.rdAdd(P.chunks, pv, cm, cc, p.x, p.z, gp) >= 0) this.plateRebar(P.chunks, pv, cm, p, q, sx, sz, gp, i * 7 + 5, hsh);
      }
      for (let i = 0, nb = o.bricks || 0; i < nb; i++) {
        const [x, z] = rnd(), sz = rand(1.4, 3.6);
        const p = W(x, hAt(x, z) - sz * 0.12, z);
        const cm = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))), new THREE.Vector3(sz * 1.3, sz * 0.75, sz));
        this.rdAdd(P.chunks, this.rd.block, cm, new THREE.Color(E[0], E[1], E[2]).lerp(base, 0.4).multiplyScalar(rand(0.8, 1.15)), p.x, p.z, o.y0 !== undefined ? null : this.groundAt(p.x, p.z));
      }
      if (B.st.rc && o.rebar) {
        const bars = [];
        let bv = 0;
        for (let i = 0; i < o.rebar; i++) {
          const [x, z] = rnd(), L = rand(2.5, 6), y = hAt(x, z) - 0.6;
          const c = new THREE.CylinderGeometry(0.22, 0.22, L, 5), L2 = L * (0.35 + 0.5 * hsh(i * 1.31, 7.1));
          c.translate(0, L / 2, 0);
          const c2 = new THREE.CylinderGeometry(0.2, 0.2, L2, 5);
          c2.translate(0, L2 / 2, 0);
          c2.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((hsh(i * 2.7, 3.3) - 0.5) * 2.4, 0, (hsh(i * 0.9, 5.7) - 0.5) * 2.6)));
          c2.translate(0, L, 0);
          const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand(-1.1, 1.1), rand(0, 6.3), rand(-1.1, 1.1)));
          c.applyMatrix4(rot); c2.applyMatrix4(rot);
          c.translate(x, y, z); c2.translate(x, y, z);
          const nc = merge([c.toNonIndexed(), c2.toNonIndexed()]);
          bars.push(nc);
          P.bars.push({ v0: bv, n: nc.attributes.position.count, x: B.x + x * ca + z * sa, z: B.z - x * sa + z * ca, off: offAt(x, z) });
          bv += nc.attributes.position.count;
        }
        P.barMesh = new THREE.Mesh(merge(bars), REBAR_MAT());
        P.barMesh.castShadow = true;
        P.barMesh.visible = false;
        g.add(P.barMesh);
      }
      // cục vụn rời phủ mặt ụ, đồ của nhà, vụn văng ra đất, bụi chân ụ (bộ sinh riêng, chỉ để nhìn)
      withSeed((Math.floor(seed * 1e4) ^ B.seedG ^ 0x7a11) >>> 0, () => {
        const yr = o.y0 !== undefined;
        this.scatterRubble(B, { surf: this.rubbleSampler(LX, LZ, nx, nz, cx, cz, top, off, B.y - 1.2), ground: yr ? null : (x, z) => this.groundAt(x, z),
          cx, cz, hw, hd, spill: Math.max(2, spill), tMin: yr ? 0.3 : 0.4, list: P.chunks, floors: 1, k: 0.85, noRoof: !!o.ring, dustK: 0.6 });
      });
      this.group.add(g);
      this.pileY(P, 0);
      (this.piles || (this.piles = [])).push(P);
      (B.piles || (B.piles = [])).push(P);
      P.maxH = maxH;
      return P;
    }
    pileY(P, k) {
      const a = P.mesh.geometry.attributes.position, A = a.array;
      k = Math.max(0.001, k);
      for (let i = 0; i < P.top.length; i++) A[i * 3 + 1] = P.off[i] + P.top[i] * k;
      a.needsUpdate = true;
    }
    // ụ mọc dần; xong thì hiện tảng sàn / gạch / thép
    updatePiles(dt) {
      if (!this.piles) return;
      for (let i = this.piles.length - 1; i >= 0; i--) {
        const P = this.piles[i];
        if (P.done) { this.piles.splice(i, 1); continue; }
        P.t += dt;
        const k = clamp01((P.t - P.delay) / P.dur);
        if (k <= 0) continue;
        this.pileY(P, 1 - (1 - k) * (1 - k));
        if (k >= 1) {
          P.done = true;
          if (!(P.B.cut && P.lvl >= 1)) for (const c of P.chunks) c[0].set(c[1], c[2]);
          if (P.barMesh) P.barMesh.visible = true;
        }
      }
    }
    removePile(P) {
      if (P.g.parent) P.g.parent.remove(P.g);
      P.mesh.geometry.dispose();
      if (P.barMesh) P.barMesh.geometry.dispose();
      for (const c of P.chunks) c[0].hide(c[1]);
      P.done = true;
      if (P.B.piles) P.B.piles = P.B.piles.filter(q => q !== P);
    }
    // đống phụ hạ / nâng theo mặt đất mới (hố bom) — gọi từ reground
    regroundPiles(inBox) {
      for (const B of this.items) {
        if (!B.piles) continue;
        for (const P of B.piles) {
          if (P.y0 !== undefined) continue;
          let ch = false;
          for (let i = 0; i < P.off.length; i++) {
            const x = P.w[i * 2], z = P.w[i * 2 + 1];
            if (!inBox(x, z)) continue;
            const o = this.groundAt(x, z) - B.y + 0.8;
            if (o !== P.off[i]) { P.off[i] = o; ch = true; }
          }
          if (ch) { this.pileY(P, P.done ? 1 : clamp01((P.t - P.delay) / P.dur)); P.mesh.geometry.computeBoundingSphere(); }
          if (P.barMesh) {
            const a = P.barMesh.geometry.attributes.position;
            let bc = false;
            for (const r of P.bars) {
              if (!inBox(r.x, r.z)) continue;
              const d = this.groundAt(r.x, r.z) - B.y + 0.8 - r.off;
              if (!d) continue;
              for (let v = r.v0; v < r.v0 + r.n; v++) a.array[v * 3 + 1] += d;
              r.off += d; bc = true;
            }
            if (bc) a.needsUpdate = true;
          }
          for (const c of P.chunks) {
            if (c[5] === null || !inBox(c[3], c[4])) continue;
            const gg = this.groundAt(c[3], c[4]);
            if (gg === c[5]) continue;
            c[2].elements[13] += gg - c[5]; c[5] = gg;
            if (P.done) c[0].set(c[1], c[2]);
          }
        }
      }
    }

    // Đổ nát quanh (x, z) cho xích xe bò lên: mặt đống nhà sập + đống gạch chân tường (lưới độ cao).
    // walls: mảng tường góc còn đứng trên đống nhà sập (hộp vật cản thường)
    // ---------------------------------------------------------------------------
    // XE & NHÀ: thay hộp cứng cả nhà bằng hộp từng mảng tường / cột tầng trệt + tầng 2 (tầng 3 trở lên một khối) -> mảng đã
    // mất là lối cho xe chui vào tầng trệt / nòng chọc qua; mảng xe đủ lực húc thì bỏ hộp để ram() đánh đổ khi chạm (như rào
    // tường đá của PropSet). Nhà còn nguyên tầng trệt mà xe không đủ sức húc mảng yếu nhất: giữ một hộp cả nhà (nhẹ)
    // ---------------------------------------------------------------------------
    vehBox(B, m) {
      const b = m._vb || (m._vb = { cx: 0, cz: 0, ux: Math.cos(B.angle), uz: -Math.sin(B.angle), hu: 0, hv: 0, y0: 0, y1: 0, mat: B.st.mat || 'concrete', bld: B, mod: m });
      const w = this.toWorld(B, m.lx, 0, m.lz), side = Math.abs(Math.sin(m.ry || 0)) > 0.5;
      b.cx = w.x; b.cz = w.z; b.hu = side ? m.hz : m.hx; b.hv = side ? m.hx : m.hz;
      b.y0 = B.y - 1.5 + m.ly - m.hy - (m.floor === 0 ? 20 : 0); b.y1 = B.y - 1.5 + m.ly + m.hy;
      // vách gỗ / tôn / vách kính sảnh cao ốc: nòng quét qua thì xé toạc (barrelTear), không chặn tháp / nòng
      b.soft = m.role === 'wall' && (b.mat === 'wood' || b.mat === 'metal' || (m.lb !== undefined && m.lb < 0.3));
      return b;
    }
    // [lực đổ, năng lượng phá] của mảng tường / cột khi bị xe húc (RAM_WALL / RAM_COL x độ bền còn lại x phần chịu lực)
    ramSpec(B, m) {
      const T = (m.role === 'col' ? RAM_COL : RAM_WALL)[B.st.mat || 'concrete'] || RAM_WALL.concrete;
      const k = Math.max(0.12, this.modEff(m)) * (m.role === 'col' ? m.hp0 / 2.2 : 0.25 + 0.75 * (m.lb === undefined ? 1 : m.lb));
      return [T[0] * k, T[1] * k];
    }
    // pháp tuyến mặt hộp b gần điểm (x, z) nhất, hướng ra phía điểm
    boxNormal(b, x, z) {
      const tx = x - b.cx, tz = z - b.cz, lu = tx * b.ux + tz * b.uz, lv = -tx * b.uz + tz * b.ux;
      const o = this._bn || (this._bn = { x: 0, z: 0 });
      if (Math.abs(lu) / Math.max(0.1, b.hu) > Math.abs(lv) / Math.max(0.1, b.hv)) { const s = lu >= 0 ? 1 : -1; o.x = b.ux * s; o.z = b.uz * s; }
      else { const s = lv >= 0 ? 1 : -1; o.x = -b.uz * s; o.z = b.ux * s; }
      return o;
    }
    // Khe hở giữa hộp thân xe o và hộp b (định lý trục tách; < 0: chồng lên nhau) + pháp tuyến từ b về phía xe
    obbGap(o, b) {
      const r = this._og || (this._og = { gap: 0, nx: 0, nz: 0 });
      const dx = o.cx - b.cx, dz = o.cz - b.cz;
      r.gap = -Infinity;
      for (const [x, z] of [[o.ux, o.uz], [-o.uz, o.ux], [b.ux, b.uz], [-b.uz, b.ux]]) {
        const ro = o.hu * Math.abs(o.ux * x + o.uz * z) + o.hv * Math.abs(-o.uz * x + o.ux * z);
        const rb = b.hu * Math.abs(b.ux * x + b.uz * z) + b.hv * Math.abs(-b.uz * x + b.ux * z);
        const d = dx * x + dz * z, g = Math.abs(d) - ro - rb;
        if (g > r.gap) { r.gap = g; const s = d >= 0 ? 1 : -1; r.nx = x * s; r.nz = z * s; }
      }
      return r;
    }
    // Hộp vật cản quanh (x, z) cho terrain.vehicleObstacles. unit: xe đang dò (null: ô tô bị đẩy -> không húc đổ gì);
    // barrel: dò cho nòng (mọi mảng còn đứng đều chặn, kể cả mảng thân xe sắp húc đổ)
    vehicleBoxes(x, z, r, unit, out, barrel) {
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null, now = performance.now() / 1000;
      const ramK = unit && unit.isWheeled ? 0.7 : 1, uTop = unit && VC ? (unit.y || 0) + VC.hullBox(unit).maxY : 0;
      for (const B of this.items) {
        if (B.collapsed) continue;
        const mr = r + B.halfW + B.halfD + 10;
        if (Math.abs(x - B.x) > mr || Math.abs(z - B.z) > mr) continue;
        const fl = this.structOf(B), F0 = fl[0], F1 = fl[1];
        if (!F0) continue;
        // nhà đổ nát dựng sẵn (thiếu mảng từ đầu): luôn theo từng mảng -> xe len qua chỗ tường đã mất
        let open = !!B.st.ruined, minF = Infinity;
        if (!open) for (const m of F0.mods) { if (m.state === 'gone') { open = true; break; } const f = this.ramSpec(B, m)[0]; if (f < minF) minF = f; }
        if (!open && F1) open = F1.mods.some(m => m.state === 'gone');
        if (!open && !(unit && VC && !barrel && VC.ramForce(unit, Math.abs(unit.speed || 0), ramK) >= minF)) {
          const all = B._vcAll || (B._vcAll = { cx: B.x, cz: B.z, ux: Math.cos(B.angle), uz: -Math.sin(B.angle), hu: B.halfW, hv: B.halfD, y0: 0, y1: 0, mat: B.st.mat || 'concrete', bld: B,
            soft: B.st.mat === 'wood' || B.st.mat === 'metal' });
          all.y0 = B.y - 20; all.y1 = B.y + B.entry.height;
          out.push(all);
          continue;
        }
        for (const F of [F0, F1]) if (F) for (const m of F.mods) {
          if (m.state === 'gone') continue;
          const b = this.vehBox(B, m);
          // tầng 2: chỉ xe cao hơn chân tường tầng 2 (trần tầng trệt thấp) mới húc vào — nóc xe phá luôn lanh tô
          if (unit && VC && !barrel && (m.floor === 0 || uTop > b.y0 + 0.5)) {
            const n = this.boxNormal(b, unit.x, unit.z), vn = VC.approach(unit, n.x, n.z), F = this.ramSpec(B, m)[0];
            // lực kéo bám đất đã đủ ép đổ (xe tăng tì vào vách gỗ / tôn / đất, quay tại chỗ đè sườn lên tường) hoặc đủ đà húc
            if (VC.tractive(unit) >= F || (vn > 0.3 && VC.ramForce(unit, vn, ramK) >= F)) { m._goU = unit; m._goT = now; continue; }
          }
          out.push(b);
        }
        // tầng 3 trở lên: một khối (nòng ngóc cao, xe đứng trên đống đổ nát chân nhà)
        if (fl.length > 2 && fl.slice(2).some(F => F.mods.some(m => m.state !== 'gone'))) {
          const up = B._vcUp || (B._vcUp = { cx: B.x, cz: B.z, ux: Math.cos(B.angle), uz: -Math.sin(B.angle), hu: B.halfW, hv: B.halfD, y0: 0, y1: 0, mat: B.st.mat || 'concrete', bld: B });
          up.y0 = B.y - 1.5 + 1.5 + 2 * B.FH; up.y1 = B.y + B.entry.height;
          out.push(up);
        }
        // xe đã chui vào tầng trệt: trần tầng trệt chặn nòng ngóc lên (không chặn thân xe: noHull)
        if (unit) {
          const L = this.toLocal(B, unit.x, 0, unit.z);
          if (Math.abs(L.x) < B.halfW && Math.abs(L.z) < B.halfD) {
            const Lv = B.levels.find(q => q.f === 0 && q.role === 'slab') || B.levels.find(q => q.role === 'roof');
            const t = Lv && this.tileAt(B, Lv, L.x, L.z), rs = !Lv && B.roofMods ? this.roofSliceAt(B, L.x) : null;
            if ((t && t.state !== 'gone') || (rs && rs.state !== 'gone')) {
              const c = B._vcCeil || (B._vcCeil = { cx: B.x, cz: B.z, ux: Math.cos(B.angle), uz: -Math.sin(B.angle), hu: B.halfW, hv: B.halfD, y0: 0, y1: 0, mat: B.st.mat || 'concrete', bld: B, noHull: true });
              c.y0 = B.y - 1.5 + 1.5 + B.FH - 0.8; c.y1 = c.y0 + 2.4;
              out.push(c);
            }
          }
        }
      }
      return out;
    }
    // Mỗi khung, mọi xe (terrain.ramObjects): mảng tường / cột tầng trệt chạm hộp thân xe, xe đang áp vào đủ lực -> đổ vào
    // trong theo hướng xe chạy, xe mất đà theo năng lượng phá; mất chỗ tựa thì phần nhà phía trên đổ theo (checkStructure, có
    // thể đè xe vừa húc). Chạy trên mọi máy theo tư thế xe nhìn thấy (như rào / cây), số ngẫu nhiên gieo theo nhà + mảng
    ram(unit, ob, dt, fx) {
      if (typeof VehicleCollision === 'undefined') return null;
      const VC = VehicleCollision, remote = !!(unit.isRemote || unit._netProxy), now = performance.now() / 1000;
      const a = unit.bodyAngle || 0, sp = unit.speed || 0, vx = -Math.sin(a) * sp, vz = -Math.cos(a) * sp;
      const R0 = Math.hypot(ob.hu, ob.hv), ramK = unit.isWheeled ? 0.7 : 1, uTop = (unit.y || 0) + VC.hullBox(unit).maxY;
      let broke = null;
      for (const B of this.items) {
        if (B.collapsed) continue;
        const mr = R0 + B.halfW + B.halfD + 4;
        if (Math.abs(ob.cx - B.x) > mr || Math.abs(ob.cz - B.z) > mr) continue;
        const fl = this.structOf(B);
        if (!fl[0]) continue;
        let hit = null;
        for (const F of [fl[0], fl[1]]) if (F) for (const m of F.mods) {
          if (m.state === 'gone') continue;
          const b = this.vehBox(B, m);
          if (m.floor > 0 && uTop <= b.y0 + 0.5) continue;
          const g = this.obbGap(ob, b);
          if (g.gap > 0.8) continue;
          const promised = m._goU === unit && now - m._goT < 0.1, vn = VC.approach(unit, g.nx, g.nz);
          const S = this.ramSpec(B, m);
          // không áp tới (quay tại chỗ / trượt ngang đè sườn): chỉ đổ khi đã chồng vào nhau và lực kéo đủ ép
          const side = vn <= 0.3;
          if (side ? !(g.gap < 0.2 && (promised || VC.tractive(unit) >= S[0])) : (!promised && VC.ramForce(unit, vn, ramK) < S[0])) continue;
          // năng lượng phá theo phần mảng tường nằm trong bề ngang thân xe (mũi xe quẹt mép mảng: chỉ tốn một phần)
          let fr = 1;
          if (m.role === 'wall') {
            const lu = b.hu >= b.hv, ax = lu ? b.ux : -b.uz, az = lu ? b.uz : b.ux, hl = lu ? b.hu : b.hv;
            const d = (ob.cx - b.cx) * ax + (ob.cz - b.cz) * az, ro = ob.hu * Math.abs(ob.ux * ax + ob.uz * az) + ob.hv * Math.abs(-ob.uz * ax + ob.ux * az);
            fr = Math.max(0.25, Math.min(1, (Math.min(d + ro, hl) - Math.max(d - ro, -hl)) / (2 * hl)));
          }
          (hit || (hit = [])).push({ m, F: S[0], E: S[1] * fr, side, nx: g.nx, nz: g.nz });
        }
        if (!hit) continue;
        let ev = null;
        withSeed(Math.floor(hash3(B.x * 0.13 + hit[0].m.id, B.z * 0.17, 77) * 4294967295) >>> 0, () => {
          // đè sườn: mảng đổ ra xa thân xe (ngược pháp tuyến), húc thẳng: đổ theo hướng xe chạy
          for (const h of hit) this.ramBreak(B, h.m, h.side ? -h.nx : vx, h.side ? -h.nz : vz, fx);
          B.dmgDirty = true;
          ev = this.checkStructure(B, fx);
        });
        this.commitAll();
        for (const h of hit) {
          if (!remote) unit.speed = VC.speedAfter(unit, unit.speed, h.E, h.F);
          const w = this.toWorld(B, h.m.lx, 0, h.m.lz);
          (broke || (broke = [])).push({ x: w.x, z: w.z, mat: B.st.mat === 'concrete' ? 'stone' : B.st.mat });
        }
        const G = typeof window !== 'undefined' && window.game;
        if (ev && G && G.player && G.addCombatLog && Math.hypot(G.player.x - B.x, G.player.z - B.z) < 1400) G.addCombatLog('[[building]] Xe húc sập chân tường — tòa nhà đổ sập!', 'alert');
      }
      return broke;
    }
    // Mảng tường / cột bị xe húc đổ: đổ vào phía xe đang đẩy, gạch vụn + bụi phụt, tiếng vật liệu vỡ
    ramBreak(B, m, vx, vz, fx) {
      const d = this.dirToLocal(B, { x: vx, y: 0, z: vz }), dl = Math.hypot(d.x, d.z) || 1;
      this._bulk = true;
      this.fallMod(B, m, d.x / dl * 1.3, d.z / dl * 1.3, m.ly + rand(1, 3), 0, 6);
      this._bulk = false;
      if (this._syncing) return;
      const w = this.toWorld(B, m.lx, Math.min(m.ly, 1.5 + B.FH * 0.4), m.lz);
      chunks(fx, w.x, w.y, w.z, m.role === 'col' ? 5 : 8, 3, B.WM.edge, 40);
      dustBurst(fx, w.x, w.y, w.z, 4, 16, B.WM.dust);
      sfx(matSnd(B), w.x, w.y, w.z, 1.2, { h: w.y - B.y });
    }
    // Nòng (chốt A -> đầu nòng Bt, thế giới) xuyên qua vách gỗ / tôn / vách kính sảnh (hộp soft: không chặn tháp / nòng):
    // xé thủng một lỗ đúng chỗ nòng cắt mặt vách, nòng quét ngang thì lỗ kéo thành vệt rách (mỗi khi chỗ cắt dời > 1,4 đv).
    // Gọi mỗi khung cho mọi xe (barrel_sweep.update, kể cả xe bản sao mạng — mọi máy cùng thấy). Trả về số chỗ vừa xé
    barrelTear(A, Bt) {
      let n = 0;
      for (const B of this.items) {
        if (B.collapsed) continue;
        const mr = B.halfW + B.halfD + 60;
        if (Math.abs(A.x - B.x) > mr || Math.abs(A.z - B.z) > mr) continue;
        const fl = this.structOf(B);
        const a = this.toLocal(B, A.x, A.y, A.z), b = this.toLocal(B, Bt.x, Bt.y, Bt.z);
        if (Math.max(a.x, b.x) < -B.halfW - 2 || Math.min(a.x, b.x) > B.halfW + 2 || Math.max(a.z, b.z) < -B.halfD - 2 || Math.min(a.z, b.z) > B.halfD + 2) continue;
        let tore = false;
        for (const F of [fl[0], fl[1]]) if (F) for (const m of F.mods) {
          if (m.role !== 'wall' || m.state === 'gone' || !this.vehBox(B, m).soft) continue;
          // cắt mặt giữa vách: khoảng cách có dấu theo pháp tuyến (ox, oz) của hai đầu đoạn nòng
          const da = (a.x - m.lx) * m.ox + (a.z - m.lz) * m.oz, db = (b.x - m.lx) * m.ox + (b.z - m.lz) * m.oz;
          if ((da > 0) === (db > 0)) continue;
          const t = da / (da - db), px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t, pz = a.z + (b.z - a.z) * t;
          const qx = (px - m.lx) * m.ax + (pz - m.lz) * m.az, qy = py - m.ly;
          if (Math.abs(qx) > B.st.bay / 2 || Math.abs(qy) > B.FH / 2) continue;
          const last = m._tear;
          if (last && Math.hypot(last.x - qx, last.y - qy) < 1.4) continue;
          m._tear = { x: qx, y: qy };
          this.carve(B, m, qx, qy, { hole: 1.3, crater: 1.9, soot: 0, chip: 0, stretch: 1.4, tx: 1, ty: 0, noise: holeNoise(), seed: hash3(px * 0.37, py * 0.41, pz * 0.29) * 1000, inner: false });
          tore = true; n++;
          if (!this._syncing && (!this._tearSnd || performance.now() - this._tearSnd > 250)) {
            this._tearSnd = performance.now();
            const w = this.toWorld(B, px, py, pz);
            sfx(matSnd(B), w.x, w.y, w.z, 0.5, { h: w.y - B.y });
          }
        }
        if (tore) { B.dmgPending = true; B.dmgDirty = true; this.checkStructure(B, null); this.commitAll(); }
      }
      return n;
    }
    // ---------------------------------------------------------------------------
    // ĐÈ XE: nhà sập / một mặt nhà đổ / mảng tường văng / ô sàn trần tầng trệt sụp -> vùng đổ (hộp theo trục nhà) kèm thời
    // gian rơi; game.crushUnderBuilding trừ máu xe nằm dưới khi tới lúc chạm đất. gid: các vùng cùng một cú đổ (xe nằm trong
    // nhiều vùng của cùng cú đổ chỉ tính vùng nặng nhất); yTop: đỉnh khối rơi (xe cao hơn thì không bị đè). Không tính khi
    // đang áp trạng thái từ máy khác (đã đổ từ trước)
    // ---------------------------------------------------------------------------
    queueCrush(B, lx, lz, hu, hv, sev, delay, o) {
      if (this._syncing || !(sev > 0.005)) return;
      const w = this.toWorld(B, lx, 0, lz);
      (this.crushQ || (this.crushQ = [])).push({ x: w.x, z: w.z, ux: Math.cos(B.angle), uz: -Math.sin(B.angle), hu, hv, sev, t: delay,
        yTop: o && o.yTop !== undefined ? B.y - 1.5 + o.yTop : Infinity, inHu: (o && o.inHu) || 0, inHv: (o && o.inHv) || 0,
        gid: (o && o.gid) || (this._crushId = (this._crushId || 0) + 1), floors: B.floors });
    }
    takeCrush() { const d = this.crushDue; this.crushDue = null; return d; }
    // XE Ở TRONG NHÀ còn đứng (cách mép tường > 2 đv): { roof: phía trên còn ô sàn / mái nguyên (drone nhìn từ trên xuống
    // không thấy), hard: tường bê tông / đá / tôn (radar mặt đất không xuyên — chỉ bắt qua lỗ thủng), mat } | null
    coverAt(x, z) {
      for (const B of this.items) {
        if (B.collapsed) continue;
        const r = B.halfW + B.halfD;
        if (Math.abs(x - B.x) > r || Math.abs(z - B.z) > r) continue;
        const L = this.toLocal(B, x, 0, z);
        if (Math.abs(L.x) > B.halfW - 2 || Math.abs(L.z) > B.halfD - 2) continue;
        let roof = false;
        for (const Lv of B.levels) { const t = this.tileAt(B, Lv, L.x, L.z); if (t && t.state !== 'gone') { roof = true; break; } }
        if (!roof && B.roofMods) { const s = this.roofSliceAt(B, L.x); roof = !!s && s.state !== 'gone'; }
        const mat = B.st.mat || 'concrete';
        return { roof, hard: mat === 'concrete' || mat === 'stone' || mat === 'metal', mat };
      }
      return null;
    }
    // Trần gần nhất phía trên điểm (x, y, z) trong nhà còn đứng (khói / lửa xác xe cháy trong nhà không xuyên sàn tầng trên):
    // { y: đáy ô sàn / mái nguyên thấp nhất cao hơn y, top: mặt trên ô đó, ox, oz: hướng ra bức tường gần nhất } | null.
    // Ô sàn đã thủng thì bỏ qua -> khói bốc qua lỗ lên tới tầng trên
    ceilingAbove(x, z, y) {
      for (const B of this.items) {
        if (B.collapsed) continue;
        const r = B.halfW + B.halfD;
        if (Math.abs(x - B.x) > r || Math.abs(z - B.z) > r) continue;
        const L = this.toLocal(B, x, y, z);
        if (Math.abs(L.x) > B.halfW - 2 || Math.abs(L.z) > B.halfD - 2) continue;
        let lo = Infinity, hi = 0;
        for (const Lv of B.levels) {
          const l = Lv.y - Lv.th / 2;
          if (l < L.y - 1 || l >= lo) continue;
          const t = this.tileAt(B, Lv, L.x, L.z);
          if (t && t.state !== 'gone') { lo = l; hi = Lv.y + Lv.th / 2; }
        }
        const R = B.roofShape;
        if (lo === Infinity && R && B.roofMods && R.y0 > L.y - 1) {
          const s = this.roofSliceAt(B, L.x);
          if (s && s.state !== 'gone') { lo = R.y0; hi = R.y0 + R.h; }
        }
        if (lo === Infinity) return null;
        const ex = B.halfW - Math.abs(L.x) < B.halfD - Math.abs(L.z);
        const d = this.dirToWorld(B, ex ? Math.sign(L.x) || 1 : 0, 0, ex ? 0 : Math.sign(L.z) || 1);
        return { y: B.y - 1.5 + lo, top: B.y - 1.5 + hi, ox: d.x, oz: d.z };
      }
      return null;
    }
    vehicleDebris(x, z, r, out, walls) {
      for (const B of this.items) {
        const m = r + (B.rubbleR || 0) + B.halfW + B.halfD;
        if (Math.abs(x - B.x) > m || Math.abs(z - B.z) > m) continue;
        if (B.rubbleGrid && Math.hypot(x - B.x, z - B.z) < r + B.rubbleR) {
          out.push(B.rubbleGrid);
          if (walls && B.rubbleWalls) for (const w of B.rubbleWalls) walls.push(w);
        }
        if (B.piles) for (const P of B.piles) if (P.vcGrid && P.R && Math.hypot(x - P.vcGrid.ox, z - P.vcGrid.oz) < r + P.R + Math.hypot(P.vcGrid.cx, P.vcGrid.cz)) out.push(P.vcGrid);
      }
      return out;
    }

    // ---------------------------------------------------------------------------
    // CHÁY NHÀ: đạn cháy / đạn nổ (nhất là nổ trong phòng) làm bén lửa đồ đạc, khung gỗ, mái gỗ. Nhiệt tích theo từng phát
    // trúng (không nguội -> mọi máy nhận cùng chuỗi ENV_HIT bén lửa đúng cùng phát). Cháy lan dần lên các tầng trên; lửa phụt
    // ra ô cửa, cột khói đen bốc từ nóc. Nhà gỗ cháy rụi -> khung gãy, sập; kho tôn: khung thép mềm ra, mái võng sụp; nhà gạch /
    // bê tông: chỉ cháy đồ đạc + mái gỗ, tường ám đen. Tác động kết cấu chia bước cố định theo thời gian cháy, mỗi bước chạy
    // trong withSeed riêng -> mọi máy ra cùng kết quả (chỉ lệch thời điểm vài khung hình)
    // ---------------------------------------------------------------------------
    heatUp(B, ctx, ammo, heavy, direct) {
      if (B.fire || B.collapsed) return;
      const load = FIRE_LOAD[B.st.mat] !== undefined ? FIRE_LOAD[B.st.mat] : 0.3;
      const ig = (IGNITE[ammo] || 0) * (heavy ? 1.8 : 1);
      if (!ig) return;
      // nổ trong phòng: hơi nóng + mảnh cháy văng khắp phòng; trúng thẳng vách: một phần; nổ gần ngoài nhà: ít
      const where = ctx.inside ? 2.2 : direct ? 1 : (ctx.I.kin ? 0 : 0.3);
      B.fireHeat = (B.fireHeat || 0) + ig * where * load;
      if (B.fireHeat < 1) return;
      const dur = { wood: 75, metal: 45, adobe: 55, stone: 55, concrete: 70 }[B.st.mat] || 60;
      B.fire = { t: 0, f0: Math.max(0, Math.min(B.floors - 1, ctx.floor >= 0 ? ctx.floor : 0)), dur, step: 0, I: 0 };
      (this.fires || (this.fires = [])).push(B);
    }
    // ĐỒNG BỘ (terrain.envStateString): chỉ số các nhà đã bén lửa — mọi máy nhận cùng chuỗi ENV_HIT nên cùng một tập
    // (không gửi thời gian cháy: lệch vài khung hình giữa các máy sẽ làm "dấu vân tay" lệch mãi)
    fireState() { return this.items.map((B, i) => B.fire ? i : -1).filter(i => i >= 0).join(','); }
    // Máy vào trận giữa chừng / gộp trạng thái: nhà máy khác thấy đang cháy mà máy này chưa -> cháy giữa chừng, CHỈ phần hình
    // (synced: không chạy lại các bước hư kết cấu — phần đó đã có trong chuỗi trạng thái nhà, chạy lại là phá gấp đôi)
    applyFireState(str) {
      for (const v of String(str).split(',')) {
        const B = this.items[+v];
        if (!B || B.fire || v === '') continue;
        const dur = { wood: 75, metal: 45, adobe: 55, stone: 55, concrete: 70 }[B.st.mat] || 60;
        B.fireHeat = Math.max(B.fireHeat || 0, 1);
        B.fire = { t: dur * 0.4, f0: 0, dur, step: Infinity, I: 1, synced: true };
        (this.fires || (this.fires = [])).push(B);
      }
    }
    // Tầng đang cháy lúc t: từ tầng bén lửa lan lên trên ~15 s / tầng (lửa & khói bốc theo cầu thang, ô cửa), xuống dưới chậm
    fireFloors(B) {
      const F = B.fire, up = Math.floor(F.t / 15), down = Math.floor(F.t / 40);
      return [Math.max(0, F.f0 - down), Math.min(B.floors - 1, F.f0 + up)];
    }
    updateFires(dt, fx) {
      const budget = Math.min(1, 4 / this.fires.length);
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const B = this.fires[i], F = B.fire;
        F.t += dt;
        // cường độ: bùng lên trong ~10 s, cháy mạnh, tàn dần ở 30% cuối, sau đó âm ỉ bốc khói thêm ~30 s
        F.I = F.t < 10 ? F.t / 10 : F.t < F.dur * 0.7 ? 1 : F.t < F.dur ? 1 - 0.85 * (F.t - F.dur * 0.7) / (F.dur * 0.3) : Math.max(0, 0.15 * (1 - (F.t - F.dur) / 30));
        // tác động kết cấu theo bước cố định 6 s
        while (F.step < Math.floor(Math.min(F.t, F.dur) / 6)) {
          F.step++;
          if (!B.collapsed) withSeed((B.seedG ^ Math.imul(F.step, 7919) ^ 0x51f3) >>> 0, () => this.burnStep(B, F.step, fx));
        }
        if (F.t > F.dur + 30) { this.fires.splice(i, 1); F.done = true; continue; }
        // lửa / khói nhà cháy theo mức chi tiết (ở xa / sau lưng camera bớt hạt; tác động kết cấu ở trên vẫn chạy đủ)
        if (fx && !this._syncing) { if (fx.withLod) fx.withLod(B.x, B.y + 20, B.z, Math.max(B.halfW, B.halfD) + 20, () => this.emitHouseFire(B, F, dt, fx, budget)); else this.emitHouseFire(B, F, dt, fx, budget); }
      }
    }
    burnStep(B, k, fx) {
      const [fa, fb] = this.fireFloors(B), mat = B.st.mat;
      const ctx = { B, I: BLD.NORMAL, fx, touched: new Set(), changed: false, inside: true, floor: fa, glassFx: 0, ammo: 'FIRE' };
      // hư mỗi bước (6 s): khung gỗ cháy ~10-12 bước thì gãy; thép kho mềm dần làm mái võng sụp; nhà xây chỉ mất mái gỗ
      const kW = mat === 'wood' ? 0.08 : mat === 'metal' ? 0.03 : 0;
      const kC = mat === 'wood' ? 0.09 : mat === 'metal' ? 0.08 : 0;
      const kT = mat === 'wood' ? 0.22 : mat === 'metal' ? 0.2 : 0;
      const kR = B.roofMods ? (mat === 'wood' || mat === 'metal' ? 0.2 : 0.12) : kT;   // mái dốc / vòm: kèo gỗ / thép
      const sootK = Math.max(0.32, 0.85 - k * 0.06);
      for (const m of B.mods) {
        if (m.state === 'gone' || m.role === 'base') continue;
        const f = m.role === 'roof' ? B.floors - 1 : m.floor;
        if (f < fa || f > fb) continue;
        // ám khói đen dần quanh tầng cháy (tường / sàn / mái)
        if (m.c) this.tintMod(m, m.c.clone().multiplyScalar(sootK));
        let d = 0;
        if (m.role === 'wall') d = kW * m.hp0;
        else if (m.role === 'col') d = kC * m.hp0;
        else if (m.role === 'roof') d = (B.roofMods && B.roofMods.includes(m) ? kR : kT) * m.hp0;
        else if (m.role === 'slab') d = kT * m.hp0;
        if (!(d > 0)) continue;
        if (m.role === 'wall' || m.role === 'col') {
          m.hp = Math.max(0, m.hp - d);
          ctx.changed = true;
          if (m.hp <= 0.02) this.fallMod(B, m, m.ox || rand(-0.5, 0.5), m.oz || rand(-0.5, 0.5), m.ly + rand(2, 6), rand(0, 0.3));
        } else this.hitTile(ctx, m, d, null);
      }
      B.dmgDirty = true;
      const ev = this.checkStructure(B, fx);
      const G = typeof window !== 'undefined' && window.game;
      if (ev && G && G.player && G.addCombatLog && Math.hypot(G.player.x - B.x, G.player.z - B.z) < 1400) G.addCombatLog('[[flame]] Một ngôi nhà cháy rụi đã đổ sập!', 'tip');
      this.commitAll();
    }
    // Lửa phụt ra ô cửa các tầng đang cháy (liếm ngược lên mặt tường), tàn lửa, khói đen cuộn từ nóc; nhà đã sập thì lửa âm ỉ
    // trên đống đổ nát. Chỉ là hình (Math.random, không đụng trạng thái)
    emitHouseFire(B, F, dt, fx, budget) {
      const I = F.I * budget;
      if (I <= 0.01) return;
      const n = (rate) => { const e = rate * dt; return Math.floor(e) + (Math.random() < e - Math.floor(e) ? 1 : 0); };
      const [fa, fb] = this.fireFloors(B), FH = B.FH;
      const pick = () => {
        if (B.collapsed) {
          const w = this.toWorld(B, (Math.random() - 0.5) * B.w * 0.8, 1.5 + (B.rubbleH || 4) * Math.random() * 0.8, (Math.random() - 0.5) * B.d * 0.8);
          return { x: w.x, y: w.y, z: w.z, nx: 0, nz: 0 };
        }
        for (let tries = 0; tries < 6; tries++) {
          const m = B.walls[Math.floor(Math.random() * B.walls.length)];
          if (!m || m.floor < fa || m.floor > fb) continue;
          const out = B.T * 0.6 + 0.5, u = (Math.random() - 0.5) * B.st.bay * 0.5;
          const w = this.toWorld(B, m.lx + m.ox * out + m.ax * u, m.ly + FH * (Math.random() * 0.3 - 0.05), m.lz + m.oz * out + m.az * u);
          const o = this.dirToWorld(B, m.ox, 0, m.oz);
          return { x: w.x, y: w.y, z: w.z, nx: o.x, nz: o.z };
        }
        return null;
      };
      if (fx.fire) {
        const nF = n(I * (B.collapsed ? 14 : 22 + 8 * (fb - fa + 1)));
        for (let k = 0; k < nF; k++) {
          const p = pick(); if (!p) continue;
          const w = 0.7 + Math.random() * 0.3, big = 4 + Math.random() * 6 * (B.st.mat === 'wood' ? 1.4 : 1);
          fx.fire.add({ x: p.x, y: p.y, z: p.z, vx: p.nx * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3, vy: 9 + Math.random() * 12, vz: p.nz * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
            size: big, grow: 2.5, drag: 0.8, life: 0.6 + Math.random() * 0.6, alpha: 0.95, fadeIn: 0.05, c0: [1, 0.8 * w + 0.12, 0.42 * w], c1: [0.9, 0.24, 0.03], cell: 1, floor: false });
        }
        const nE = n(I * 6);
        for (let k = 0; k < nE; k++) {
          const p = pick(); if (!p) continue;
          fx.fire.add({ x: p.x, y: p.y + 2, z: p.z, vx: (Math.random() - 0.5) * 8 + 3, vy: 12 + Math.random() * 16, vz: (Math.random() - 0.5) * 8 + 2, size: 0.4 + Math.random() * 0.4, grow: -0.2, drag: 0.7, grav: -3,
            life: 1.5 + Math.random() * 1.5, alpha: 1, fadeIn: 0.01, c0: [1, 0.75, 0.35], c1: [0.9, 0.25, 0.02], cell: 3, floor: false });
        }
      }
      if (fx.smoke) {
        // cột khói đen đặc (đồ đạc, nhựa, gỗ cháy) bốc từ nóc, ngả theo gió; lúc âm ỉ: khói xám nhạt hơn
        const nS = n((F.I > 0.2 ? I : F.I) * (5 + B.w * 0.05));
        const top = B.collapsed ? 1.5 + (B.rubbleH || 4) : 1.5 + (fb + 1) * FH;
        for (let k = 0; k < nS; k++) {
          const w = this.toWorld(B, (Math.random() - 0.5) * B.w * 0.6, top, (Math.random() - 0.5) * B.d * 0.6);
          const g = F.I > 0.3 ? 0.06 + Math.random() * 0.07 : 0.2 + Math.random() * 0.1;
          fx.smoke.add({ x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 4 + 4, vy: 10 + Math.random() * 8, vz: (Math.random() - 0.5) * 4 + 3,
            size: 10 + Math.random() * 10 + B.w * 0.04, grow: 10, drag: 0.5, grav: -2.2, life: 7 + Math.random() * 5, alpha: 0.55, fadeIn: 0.25,
            c0: [g, g * 0.96, g * 0.92], c1: [g * 2.4 + 0.12, g * 2.3 + 0.12, g * 2.2 + 0.12], cell: 0, floor: false });
        }
      }
    }

    collapse(B, fx) {
      if (B.collapsed) return;
      if (B.cut) this.applyCut(B, false);
      B.collapsed = true;
      // Sập như ngoài đời: tầng dưới khuỵu, cả khối nhà phía trên tụt xuống gần như nguyên khối (các tầng dưới bị nghiền cản
      // lại nên rơi chậm hơn rơi tự do), nghiêng dần về phía yếu nhất; mảng nào chạm mặt đống đổ nát thì vỡ vụn, biến vào đám
      // bụi cuộn ra từ chân nhà; vài mảng tường tầng trên bong ra đổ ra ngoài riêng (xem updateCollapse)
      const dir = this.weakDir(B);
      const C = { B, t: 0, y: 0, v: 0, a: 90 * rand(0.4, 0.55), dir, lean: 0, leanMax: rand(0.05, 0.14) * (B.floors >= 3 ? 1 : 0.5), mods: [], n0: 0, dust: 0, H: B.topY };
      for (const m of B.mods) {
        if (m.state === 'gone' || m.role === 'base') continue;
        if (m.kit && !m.h) { m.state = 'gone'; continue; }   // mảng đã khoét lỗ: nằm trong lưới vỡ chung, tụt xuống cùng khối (dmgMesh)
        if (m.kit && m.h) for (const [p, i] of m.h.extra) p.hide(i);
        if (m.role === 'wall' && m.floor >= 1 && RNG() < 0.18) {
          m.state = 'gone';
          this.anim.push({ B, m, t: 0, delay: rand(0.1, 0.6) + m.floor * 0.04, drop: m.ly + rand(4, 10), tilt: { x: m.ox * 1.5 + rand(-0.3, 0.3), z: m.oz * 1.5 + rand(-0.3, 0.3) }, spin: rand(-0.6, 0.6) });
          continue;
        }
        m.state = 'gone';
        // biến dạng khi sụp (updateCollapse): góc bẻ ở vùng bị nghiền; mảng tường ngoài bong ra rơi ra ngoài khi đường nghiền tới gần
        m._cj = rand(0.15, 0.6) * (RNG() < 0.8 ? 1 : -1);
        m._pa = m.role === 'wall' && m.floor >= 1 && (Math.abs(m.ox) > 0.5 || Math.abs(m.oz) > 0.5) && RNG() < 0.22 ? rand(0.6, 2.2) : 0;
        C.mods.push(m);
      }
      C.n0 = C.mods.length;
      // mỗi tầng xô lệch ngang / xoay một chút, cộng dồn lên cao (lệch thêm về phía đổ): khối nhà cong gập chứ không là hộp cứng
      C.fw = [];
      for (let f = 0, dx = 0, dz = 0, r = 0; f <= B.floors; f++) {
        dx += rand(-1, 1) * 1.4 + dir.x * f * 0.35; dz += rand(-1, 1) * 1.4 + dir.z * f * 0.35; r += rand(-1, 1) * 0.012;
        C.fw.push({ dx, dz, r, m: new THREE.Matrix4() });
      }
      // ĐÈ XE: trọn khối nhà sụp xuống nền (xe trong / sát chân nhà) + vành gạch đá văng ra (nhẹ hơn), cùng một cú đổ
      {
        const mk = { wood: 0.5, metal: 0.45, adobe: 0.85 }[B.st.mat] || 1, sev = Math.min(1, 0.3 + 0.14 * B.floors) * mk, gid = this._crushId = (this._crushId || 0) + 1;
        const dt0 = 0.25 + Math.sqrt(2 * B.topY / 90) * 0.7;
        this.queueCrush(B, 0, 0, B.halfW + 2, B.halfD + 2, sev, dt0, { gid });
        this.queueCrush(B, 0, 0, B.halfW + 5 + B.floors * 1.6, B.halfD + 5 + B.floors * 1.6, sev * 0.3, dt0 + 0.2, { gid });
      }
      if (B.dmgMesh) { B.dmgMesh.matrixAutoUpdate = false; B.dmgMesh.visible = B.dmgMesh.geometry.attributes.position ? B.dmgMesh.geometry.attributes.position.count > 0 : false; }
      if (B.barMesh) { B.barMesh.matrixAutoUpdate = false; }
      B.cz = C;
      (this.collapsing || (this.collapsing = [])).push(C);
      if (B.topBits) { for (const i of B.topBits) this.bitPool.hide(i); B.topBits = null; }
      // ụ đổ nát trên nóc phần nhà còn đứng, thép / mảng treo ở mép sàn: rơi theo nhà (vành gạch quanh chân nhà giữ lại)
      if (B.piles) for (const P of B.piles.slice()) if (P.y0 !== undefined) this.removePile(P);
      if (B.scars) { for (const s of B.scars) this.removeScar(s); B.scars = null; }
      if (fx && fx.removeMarksNear) fx.removeMarksNear(B.x, B.y + B.topY / 2, B.z, Math.hypot(B.halfW, B.halfD, B.topY / 2) + 6);
      const H = B.topY;
      for (let i = 0; i < 26; i++) {
        const a = RNG() * 6.283, r = RNG() * Math.max(B.halfW, B.halfD);
        dustBurst(fx, B.x + Math.cos(a) * r, B.y + rand(0, H * 0.6), B.z + Math.sin(a) * r, 1, 22 + H * 0.12, [0.72, 0.7, 0.66]);
      }
      chunks(fx, B.x, B.y + H * 0.4, B.z, 12, 4, null, 60);
      // Bụi sập nhà như ngoài đời: các sàn đập xuống ép không khí phụt bụi ra sát mặt đất thành bức tường bụi cuộn lan
      // ra vài chục mét quanh nền nhà, cột bụi bốc cao quá nóc, che mờ cả khu 15-25 s rồi mới loãng dần (không phải vài
      // làn khói tan sau 5 s). Bụi phụt đúng lúc các tầng chạm đất (thời gian rơi tự do √(2h/g) như tiếng sập)
      if (fx && fx.smoke) {
        const Tc = 0.15 + B.floors * 0.12 + Math.sqrt(2 * (H / 8) / 9.8), R0 = Math.max(B.halfW, B.halfD), col = B.WM.dust;
        // cao ốc: khối vật liệu lớn hơn hẳn -> bụi dày & treo lâu hơn (16 tầng ~1,8 lần)
        const lifeK = 1 + 0.8 * Math.min(1, Math.max(0, H - 120) / 300);
        // lượng bụi theo vật liệu: gạch mộc / bê tông vỡ vụn ra rất nhiều bụi, nhà gỗ ít hơn, nhà kho tôn khung thép gần như chỉ bụi nền
        const dK = { concrete: 1, stone: 0.9, adobe: 1.15, wood: 0.45, metal: 0.25 }[B.st.mat] || 1;
        const nRing = Math.round(Math.min(64, 26 + R0 * 0.35 + B.floors * 4) * Math.max(0.35, Math.min(1, dK))), spK = 0.8 + Math.min(1, H / 160), aK = Math.min(1, dK + 0.15);
        // 2 lớp vòng: lớp trong cuộn chậm dày đặc, lớp ngoài phụt nhanh lan xa; các cụm chồng lên nhau thành một bức tường liền
        for (let L = 0; L < 2; L++) for (let i = 0; i < nRing; i++) {
          const a = ((i + L * 0.5) / nRing) * 6.283 + rand(-0.12, 0.12), ex = Math.cos(a), ez = Math.sin(a), v = rand(0.88, 1.08);
          const sp = (L ? rand(45, 75) : rand(18, 36)) * spK;
          fx.smoke.add({ x: B.x + ex * R0 * 0.8, y: B.y + rand(2, 8), z: B.z + ez * R0 * 0.8, vx: ex * sp, vy: rand(1, 7), vz: ez * sp,
            size: rand(28, 42) + H * 0.12, grow: rand(6, 10), drag: 0.5, grav: -0.6, life: rand(16, 26) * (0.5 + 0.5 * Math.min(1, dK)) * lifeK, alpha: (L ? 0.6 : 0.78) * aK, fadeIn: 0.25,
            c0: [col[0] * v, col[1] * v, col[2] * v], cell: 2, delay: Tc * rand(0.75, 1.05) });
        }
        // cột bụi cuồn cuộn bốc lên từ lòng nhà, cao quá nóc
        for (let i = 0; i < Math.round(24 * Math.min(1, dK)); i++) {
          const v = rand(0.85, 1.05);
          fx.smoke.add({ x: B.x + rand(-0.8, 0.8) * B.halfW, y: B.y + rand(0, H * 0.6), z: B.z + rand(-0.8, 0.8) * B.halfD, vx: rand(-6, 6), vy: rand(10, 24) * (0.6 + H / 150), vz: rand(-6, 6),
            size: rand(40, 60) + H * 0.15, grow: rand(6, 10), drag: 0.6, grav: -0.8, life: rand(18, 28) * lifeK, alpha: 0.7 * aK, fadeIn: 0.3, c0: [col[0] * v, col[1] * v, col[2] * v], cell: 2, delay: Tc * rand(0.08, 0.6) });
        }
        // nhà từ ~5 tầng: màn bụi lắng — các đám bụi to, loãng trôi chậm sát mặt đất quanh đống đổ nát, treo gần 1 phút
        // (bụi bê tông mịn lơ lửng rất lâu sau khi bức tường bụi đầu tiên đã tan)
        if (H > 130) for (let i = 0, nH = Math.round(Math.min(26, 8 + B.floors) * Math.min(1, dK)); i < nH; i++) {
          const a = rand(0, 6.283), r = R0 * rand(0.6, 1.6), v = rand(0.92, 1.06), sp = rand(4, 12);
          fx.smoke.add({ x: B.x + Math.cos(a) * r, y: B.y + rand(4, 20), z: B.z + Math.sin(a) * r, vx: Math.cos(a) * sp, vy: rand(0.4, 2), vz: Math.sin(a) * sp,
            size: rand(70, 110) + H * 0.15, grow: rand(2, 4), drag: 0.3, grav: -0.1, life: rand(40, 65), alpha: 0.34 * aK, fadeIn: 1.5, c0: [col[0] * v, col[1] * v, col[2] * v], cell: 2, delay: Tc + rand(1.5, 6) });
        }
      }
      sfx('collapse', B.x, B.y, B.z, Math.min(1.4, 0.6 + H / 80), { mat: matSnd(B), h: H, floors: B.floors });
      // Đống đổ nát giữ đúng khối lượng: phần đặc của nhà (~28% thể tích bao) nở rời ~1.5 lần khi vỡ vụn.
      // Bám theo nền chữ nhật của nhà (không phải ụ tròn), mặt lổn nhổn, tràn ra ngoài vài mét, sàn bê tông gãy xếp chồng,
      // vài mảng tường góc còn đứng nghiêng, thép lòi ra
      this.buildRubble(B);
      this.scatterDebris(B);
      this.commitAll();
      B.entry.height = B.rubbleH + 2;
      B.entry.radius *= 0.9;
    }

    // Mảnh vỡ văng tản ra quanh đống đổ nát lúc sập (khối bê tông, gạch, mảng sàn vỡ dẹt): dày sát chân đống, thưa dần ra xa;
    // nhà càng cao văng càng xa (tới ~1/2 chiều cao nhà). Nằm lại trên mặt đất, bám theo hố bom (addGroundBit)
    scatterDebris(B) {
      const H = B.topY, sp = B.rubbleSpill || 20, hw = B.halfW, hd = B.halfD;
      const n = Math.min(150, Math.round((14 + B.floors * 7) * ({ wood: 0.6, metal: 0.4 }[B.st.mat] || 1)));
      const E = B.WM.edge, mineral = B.st.mat === 'concrete' || B.st.mat === 'stone';
      const M = new THREE.Matrix4(), Qr = new THREE.Quaternion(), Er = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
      for (let k = 0; k < n; k++) {
        // điểm trên chu vi nền nhà + đẩy ra ngoài theo pháp tuyến cạnh đó
        const side = Math.floor(RNG() * 4), u = rand(-1, 1) * 1.08;
        const nx = side === 0 ? 1 : side === 1 ? -1 : 0, nz = side === 2 ? 1 : side === 3 ? -1 : 0;
        const d = sp * rand(0.5, 0.95) + H * 0.45 * Math.pow(RNG(), 1.9);
        const lx = nx ? nx * (hw + d) : u * hw, lz = nz ? nz * (hd + d) : u * hd;
        const w = this.toWorld(B, lx, 0, lz), gy = this.groundAt(w.x, w.z);
        const near = d < sp * 1.3, slab = mineral && RNG() < 0.1;
        const sz = (slab ? rand(4, 7) : rand(1.1, 3.0)) * (near ? 1.35 : 1);
        S.set(sz * rand(1, 1.6), slab ? sz * 0.28 : sz * rand(0.5, 0.9), sz * rand(0.8, 1.3));
        Qr.setFromEuler(Er.set(slab ? rand(-0.25, 0.25) : rand(0, 3), rand(0, 6.283), slab ? rand(-0.25, 0.25) : rand(0, 3)));
        M.compose(V.set(w.x, gy + S.y * 0.3, w.z), Qr, S);
        const c = mineral ? new THREE.Color(0.66, 0.64, 0.6).lerp(B.color, RNG() < 0.3 ? 0.5 : 0.15) : new THREE.Color(E[0] * 1.1, E[1] * 1.1, E[2] * 1.1);
        this.addGroundBit(M.clone(), w.x, w.z, c.multiplyScalar(rand(0.78, 1.1)));
      }
    }
    buildRubble(B) {
      const H = B.topY, W = B.w, D = B.d;
      // nhà thấp tràn ra ~1-2,5 m; cao ốc đổ xuống tràn xa hơn hẳn (16 tầng ~9 m quanh nền) -> đủ chỗ cho khối lượng vật liệu
      // thay vì dồn thành mô nhọn dốc đứng gọn trong nền nhà
      const spill = H <= 120 ? Math.min(20, 6 + H * 0.2) : 20 + (H - 120) * 0.15;
      B.rubbleSpill = spill;
      const solid = W * D * H * 0.28 * 1.5;
      const seed = RNG() * 1000;
      const hsh = (x, y) => { const k = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return k - Math.floor(k); };
      const vn = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      };
      // Các cục đổ nát lớn (khối sàn / cầu thang / lõi thang máy sụp chồng lên nhau)
      const lumps = [];
      // (cao ốc: cục rộng theo cỡ nhà — bán kính cố định mà chiều cao phóng theo nhà thì thành chóp nhọn hoắt)
      const lumpK = 1 + Math.max(0, H - 120) / 200;
      for (let i = 0; i < 6 + B.floors * 2; i++) lumps.push({ x: rand(-0.5, 0.5) * W, z: rand(-0.5, 0.5) * D, r: rand(10, 22) * lumpK, h: rand(0.2, 0.5) });
      const shape = (x, z) => {
        const ox = Math.max(0, Math.abs(x) - W / 2), oz = Math.max(0, Math.abs(z) - D / 2);
        const dOut = Math.hypot(ox, oz);
        const dIn = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
        // trong nền nhà gần như đầy, mép nhà dốc xuống rồi tràn ra ngoài theo dạng đất đá đổ (lởm chởm, không đều)
        const edgeNoise = (vn(x * 0.09 + 3, z * 0.09) - 0.5) * spill * 0.9;
        let f = dOut > 0 ? Math.max(0, 1 - Math.pow(Math.max(0, dOut + edgeNoise * 0.6) / (spill * 0.95), 0.75)) * 0.62 : 0.62 + 0.38 * Math.min(1, dIn / (Math.min(W, D) * 0.3));
        f = Math.max(0, f);
        // nhiễu tần thấp / vừa (bước nhiễu ≥ 3 lần bước lưới): mặt đống lổn nhổn mà không thành gai nhọn răng cưa
        let h = f * (0.55 + 0.7 * vn(x * 0.045, z * 0.045)) + f * 0.32 * (vn(x * 0.11 + 7, z * 0.11) - 0.5);
        for (const L of lumps) { const dd = Math.hypot(x - L.x, z - L.z) / L.r; if (dd < 1) h += L.h * f * (1 - dd * dd); }
        // bậc gãy của các mảng sàn sụp chồng lên nhau + khối bê tông vỡ góc cạnh cỡ 1-2 ô lưới (mặt phẳng nghiêng lởm chởm)
        h += f * 0.16 * Math.floor(vn(x * 0.075 - 6, z * 0.075 + 11) * 3) / 3;
        h += f * 0.1 * Math.floor(vn(x * 0.15 + 2, z * 0.15 - 9) * 3) / 3;
        return h;
      };
      const LX = W + spill * 2, LZ = D + spill * 2;
      const nx = Math.max(18, Math.min(64, Math.round(LX / 3))), nz = Math.max(18, Math.min(64, Math.round(LZ / 3)));
      const geo = new THREE.PlaneGeometry(LX, LZ, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const raw = new Float32Array(pos.count);
      let vol = 0, rawMax = 0.01;
      for (let i = 0; i < pos.count; i++) { raw[i] = shape(pos.getX(i), pos.getZ(i)); vol += raw[i]; rawMax = Math.max(rawMax, raw[i]); }
      vol *= (LX / nx) * (LZ / nz);
      // đống đổ nát thật cao ~1/5-1/4 chiều cao nhà, thấp và bè (phần dư khối lượng tràn rộng ra xung quanh)
      const sc = Math.min(Math.max(6, H * 0.24) / rawMax, solid / Math.max(1, vol));
      const hAt = (x, z) => shape(x, z) * sc;
      const col = new Float32Array(pos.count * 3);
      // bê tông / gạch đá: vụn xám ngả màu tường; nhà gỗ / đất / tôn: màu vật liệu đó (ván gỗ nâu, đất vàng, tôn xỉn)
      const E = B.WM.edge, mineral = B.st.mat === 'concrete' || B.st.mat === 'stone';
      const base = mineral ? new THREE.Color(0.74, 0.72, 0.68).lerp(B.color, 0.25) : new THREE.Color(E[0] * 1.2, E[1] * 1.2, E[2] * 1.2);
      const rim = new THREE.Color(B.WM.dust[0], B.WM.dust[1], B.WM.dust[2]);
      let maxH = 0;
      // Đống đổ nát bám theo mặt đất thật (dốc / hố bom) từng đỉnh: top = độ dày đống, off = mặt đất tại đỉnh đó so với nền nhà
      // (đống chỉ "mọc" phần top khi hiện dần, xem rubbleY; reground đổi off khi có hố bom mới / hố được lấp)
      const ca = Math.cos(B.angle), sa = Math.sin(B.angle);
      const top = new Float32Array(pos.count), off = new Float32Array(pos.count), wxz = new Float32Array(pos.count * 2);
      const offAt = (x, z) => this.groundAt(B.x + x * ca + z * sa, B.z - x * sa + z * ca) - B.y;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        let h = raw[i] * sc;
        const border = Math.abs(x) > LX / 2 - 0.1 || Math.abs(z) > LZ / 2 - 0.1;
        h = border ? -0.6 : h - 0.3;
        wxz[i * 2] = B.x + x * ca + z * sa; wxz[i * 2 + 1] = B.z - x * sa + z * ca;
        top[i] = h; off[i] = this.groundAt(wxz[i * 2], wxz[i * 2 + 1]) - B.y;
        pos.setY(i, h + off[i]);
        maxH = Math.max(maxH, h);
        // màu: bê tông vụn xám, chỗ trũng tối (khe rỗng), vài mảng sơn tường, bụi trắng phủ rìa
        // bê tông vụn loang lổ: mảng xám tối (bê tông gãy mới, khe rỗng), mảng sáng (bụi phủ), vụn sơn tường, gạch đỏ;
        // từng đỉnh lệch sáng tối một chút -> mặt đống lổn nhổn chứ không đều một màu
        const n = vn(x * 0.3 + 5, z * 0.3), n2 = vn(x * 0.12 - 3, z * 0.12 + 8), sp = hsh(x * 3.1, z * 2.7);
        // (chi tiết mảnh vụn nằm trong texture lặp theo mét; màu đỉnh chỉ còn loang lớn + AO + bụi)
        const c = base.clone().multiplyScalar(0.8 + 0.34 * n + 0.2 * (n2 - 0.5) + (sp - 0.5) * 0.1);
        if (mineral && vn(x * 0.15 + 21, z * 0.15) > 0.72) c.lerp(B.color, 0.45);
        if (mineral && sp > 0.96) c.lerp(new THREE.Color(0.5, 0.34, 0.28), 0.35);
        // bụi trắng phủ dày ở chân đống, nhạt dần lên đỉnh (không còn viền gắt)
        const dk = 1 - clamp01((raw[i] - 0.02) / 0.3);
        c.lerp(rim, 0.06 + 0.5 * dk * dk);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      rubbleAO(col, top, nx, nz, hsh);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      rubbleUV(geo);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();   // theo hình đống đã hiện hẳn (lúc mọc dần vẫn nằm trong khối cầu này)
      const g = new THREE.Group();
      g.position.set(B.x, B.y - 1.2, B.z);
      g.rotation.y = B.angle;
      const mesh = new THREE.Mesh(geo, B.st.mat === 'wood' ? this.rubbleMatWood : this.rubbleMat);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      B.rubbleMesh = mesh; B.rubbleTop = top; B.rubbleOff = off; B.rubbleW = wxz; B.rubbleR = Math.hypot(LX, LZ) / 2;
      // lưới độ cao của mặt đống cho xích xe bò lên (VehicleCollision.debrisHeight đọc thẳng mảng đỉnh đang hiển thị)
      B.rubbleGrid = { grid: true, ox: B.x, oy: B.y - 1.2, oz: B.z, ca, sa, cx: 0, cz: 0, LX, LZ, nx, nz, arr: pos.array };
      B.rubbleWalls = [];
      // Thép lòi ra khỏi đống đổ nát (cong queo, chĩa nhiều hướng)
      const bars = [];
      B.rubbleBars = [];
      let bv = 0;
      for (let i = 0; i < 12 + B.floors * 3; i++) {
        const x = rand(-0.5, 0.5) * W, z = rand(-0.5, 0.5) * D, L = rand(2.5, 6), o = offAt(x, z);
        // thanh thép Ø ~5 cm (to hơn thật một chút cho thấy được từ camera), đoạn đầu gập cong (hash, không lấy RNG)
        const c = new THREE.CylinderGeometry(0.22, 0.22, L, 5), L2 = L * (0.35 + 0.5 * hsh(i * 1.31, 7.1));
        c.translate(0, L / 2, 0);
        const c2 = new THREE.CylinderGeometry(0.2, 0.2, L2, 5);
        c2.translate(0, L2 / 2, 0);
        c2.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((hsh(i * 2.7, 3.3) - 0.5) * 2.4, 0, (hsh(i * 0.9, 5.7) - 0.5) * 2.6)));
        c2.translate(0, L, 0);
        const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand(-1.1, 1.1), rand(0, 6.3), rand(-1.1, 1.1)));
        c.applyMatrix4(rot); c2.applyMatrix4(rot);
        c.translate(x, hAt(x, z) - 0.6 + o, z); c2.translate(x, hAt(x, z) - 0.6 + o, z);
        const nc = merge([c.toNonIndexed(), c2.toNonIndexed()]);
        bars.push(nc);
        B.rubbleBars.push({ v0: bv, n: nc.attributes.position.count, x: B.x + x * ca + z * sa, z: B.z - x * sa + z * ca, off: o });
        bv += nc.attributes.position.count;
      }
      if (bars.length) {
        const rb = new THREE.Mesh(merge(bars), REBAR_MAT());
        rb.castShadow = true;
        rb.visible = false;   // thép lòi ra khi đống đã đổ xong (xem update)
        g.add(rb);
        B.rubbleBarMesh = rb;
      }
      this.group.add(g);
      B.rubbleGroup = g;
      this.rubbleY(B);
      B.rubbleH = maxH;
      B.rubbleT = 0;
      // Sàn bê tông gãy xếp chồng nghiêng ngả trên mặt đống + mảng tường góc còn đứng xiêu vẹo
      B.chunkIdx = [];
      B.rubbleDeco = [];   // chi tiết trang trí (tấm sàn gãy, thép, cục vụn, đồ của nhà, bụi): [pool, idx, ma trận, x, z, mặt đất]
      const toWorld = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), B.angle).add(new THREE.Vector3(B.x, B.y - 1.2, B.z));
      // mảng sàn gãy cỡ nửa tới gần cả khoang, cắm nghiêng 10-40°, một mép chìm trong đống, mép kia chổng lên
      const slabs = Math.min(40, 10 + B.floors * 5), big = B.st.bay * 0.85;
      for (let i = 0; i < slabs; i++) {
        const lx = rand(-0.55, 0.55) * W, lz = rand(-0.55, 0.55) * D;
        const sx = rand(0.4, 1) * Math.min(big, W * 0.5), sz = rand(0.3, 0.8) * Math.min(big, D * 0.45);
        const tl = () => (RNG() < 0.5 ? -1 : 1) * rand(0.15, 0.7);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tl(), B.angle + rand(-0.8, 0.8), tl()));
        const yo = rand(-0.6, 1.4), p = toWorld(lx, hAt(lx, lz) - 0.3, lz), o = offAt(lx, lz);
        p.y += o;
        // tấm sàn gãy mép răng cưa, dày 14-40 cm (sàn / dầm / mảng 2 lớp), tâm cắm chìm trong đống: mép thấp vùi, mép kia chổng lên
        const hs = hsh(i * 3.7 + 1, 9.3), th = (hs > 0.82 ? 2.4 : 1.1) + 1.0 * hsh(i * 1.9, 4.4);
        p.y += yo * 0.35 - th * 0.45;
        const cm = new THREE.Matrix4().compose(p, q, new THREE.Vector3(sx, th * (rand(1.0, 1.6) / 1.3), sz));
        const cc = (mineral ? new THREE.Color(0.8, 0.78, 0.74).lerp(B.color, RNG() < 0.3 ? 0.6 : 0.15) : base.clone()).multiplyScalar(rand(0.5, 0.95));
        // màu từng tấm lệch nhau: tấm bẩn tối, tấm phủ bụi, mặt trần sơn trắng
        const ht = hsh(i * 5.1, 2.2);
        cc.multiplyScalar(0.8 + 0.5 * hsh(i * 0.7, 8.8)).lerp(ht < 0.3 ? rim : ht > 0.85 ? new THREE.Color(0.9, 0.89, 0.85) : cc, ht < 0.3 ? 0.35 : 0.5);
        const pv = this.rd.plates[Math.floor(hsh(i * 2.3, 6.1) * 4) % 4], gp = this.groundAt(p.x, p.z);
        if (this.rdAdd(B.rubbleDeco || (B.rubbleDeco = []), pv, cm, cc, p.x, p.z, gp) >= 0) this.plateRebar(B.rubbleDeco, pv, cm, p, q, sx, sz, gp, i * 7 + 3, hsh);
      }
      // gạch đá, cục bê tông lăn xuống chân đống, vương ra mặt đường
      for (let i = 0, nb = Math.min(40, 14 + B.floors * 3); i < nb; i++) {
        const a = rand(0, 6.283), r = rand(0.75, 1.15);
        const lx = Math.max(-1, Math.min(1, Math.cos(a) * 1.4)) * (W / 2 + spill * r * 0.7), lz = Math.max(-1, Math.min(1, Math.sin(a) * 1.4)) * (D / 2 + spill * r * 0.7);
        const p = toWorld(lx, 0, lz), sz = rand(1.4, 4.2), gy = this.groundAt(p.x, p.z);
        this.addGroundBit(new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy + sz * 0.15, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))),
          new THREE.Vector3(sz * 1.3, sz * 0.75, sz)), p.x, p.z, base.clone().multiplyScalar(rand(0.6, 1.05)));
      }
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => RNG() - 0.5).slice(0, 2 + Math.floor(RNG() * 2));
      for (const [cx, cz] of corners) {
        const along = RNG() < 0.5;
        // cao ốc: mảng mặt nhà sót lại rộng 2-4 m, cao hơn đỉnh đống tối đa 1-2,5 tầng (không còn cột mảnh vống cao nửa nhà)
        const len = rand(6, 12) * (B.floors >= 6 ? rand(2, 3.5) : 1), hh = Math.min(rand(0.22, 0.42) * H, maxH + B.FH * rand(1, 2.5));
        const lx = cx * (W / 2 - (along ? len / 2 : 1)), lz = cz * (D / 2 - (along ? 1 : len / 2));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.25, 0.25), B.angle + (along ? 0 : Math.PI / 2), rand(-0.3, 0.3)));
        // chân mảng tường cắm theo chỗ thấp nhất dưới chân (trên dốc không hở gầm)
        const p = toWorld(lx, hh / 2 - 1, lz), o = Math.min(offAt(lx - len / 2, lz), offAt(lx + len / 2, lz), offAt(lx, lz - len / 2), offAt(lx, lz + len / 2));
        p.y += o;
        const cm = new THREE.Matrix4().compose(p, q, new THREE.Vector3(len, hh, 1.8));
        const idx = this.slabChunkPool.add(ZERO, (mineral ? B.color.clone() : base.clone()).multiplyScalar(rand(0.6, 0.85)));
        // mảng tường góc còn đứng: vẫn chặn thân xe như tường thấp (cao hơn bậc leo được)
        const wa = B.angle + (along ? 0 : Math.PI / 2);
        B.rubbleWalls.push({ cx: p.x, cz: p.z, ux: Math.cos(wa), uz: -Math.sin(wa), hu: len / 2, hv: 1.2, y0: p.y - hh / 2, y1: p.y + hh / 2 });
        if (idx >= 0) B.chunkIdx.push([idx, cm, p.x, p.z, this.groundAt(p.x, p.z)]);
      }
      // Phủ dày mặt đống bằng cục vụn rời, đồ của nhà, mảng tường còn ô cửa, vụn văng ra đất, bụi phủ quanh chân.
      // Bộ sinh số riêng theo seed đống: không đổi dãy RNG chung (đồng bộ mạng); chỉ để nhìn, không vào lưới độ cao xe bò
      withSeed((Math.floor(seed * 1e4) ^ B.seedG ^ 0x2b1d) >>> 0, () => {
        const Q = { surf: this.rubbleSampler(LX, LZ, nx, nz, 0, 0, top, off, B.y - 1.2), ground: (x, z) => this.groundAt(x, z),
          cx: 0, cz: 0, hw: W / 2, hd: D / 2, spill, tMin: 1.2, list: B.rubbleDeco, floors: B.floors, k: 1 };
        this.scatterRubble(B, Q);
        this.rubblePanels(B, Q, Math.min(7, 2 + Math.ceil(B.floors * 0.8)));
      });
    }

    // Vật liệu mặt đống + các bể instance chi tiết đống đổ nát (tạo 1 lần cho cả bản đồ, số draw call cố định).
    // Bể chỉ thêm, không thu hồi: đủ cho ~36 nhà sập; quá thì nhà sập sau ít chi tiết hơn (không lỗi)
    initRubbleDetail(list, cracked) {
      const RS = rubbleMaps('stone'), RW = rubbleMaps('wood');
      const surfMat = set => rubbleDetail(new THREE.MeshStandardMaterial({ map: set ? set.map : (cracked.map || null), normalMap: set ? set.normal : null, vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
      this.rubbleMat = surfMat(RS);
      this.rubbleMatWood = RW ? surfMat(RW) : this.rubbleMat;
      if (RS) this.rubbleMat.normalScale.set(1.1, 1.1);
      const nH = Math.max(4, Math.min(36, list.length));
      const plankMat = new THREE.MeshStandardMaterial({ map: rubblePlankTex(), roughness: 0.9 });
      withSeed(0x52554242, () => {
        const P = (geo, mat, cap, o) => new Pool(this.group, geo, mat, cap, Object.assign({ color: true }, o || {}));
        this.rd = {
          block: P(RUBBLE_GEO.block(), cracked, 130 * nH + 100),
          stone: P(RUBBLE_GEO.stone(), cracked, 260 * nH + 200, { castShadow: false }),
          shard: P(RUBBLE_GEO.shard(), cracked, 150 * nH + 100, { castShadow: false }),
          plates: [0, 1, 2, 3].map(() => P(RUBBLE_GEO.plate(), cracked, 14 * nH + 30)),
          rebar: [0, 1, 2].map(() => P(RUBBLE_GEO.rebar(), REBAR_MAT(), 22 * nH + 40, { color: false, castShadow: false })),
          plank: P(RUBBLE_GEO.plank(), plankMat, 50 * nH + 60),
          frame: P(RUBBLE_GEO.frame(), plankMat, 8 * nH + 20),
          pipe: P(RUBBLE_GEO.pipe(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.3 }), 10 * nH + 20, { castShadow: false }),
          tile: P(RUBBLE_GEO.tile(), new THREE.MeshStandardMaterial({ map: roofTileTex(), roughness: 0.85, side: THREE.DoubleSide }), 40 * nH + 40, { castShadow: false }),
          sheet: P(RUBBLE_GEO.sheet(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide }), 14 * nH + 20),
          dust: P(RUBBLE_GEO.dust(), new THREE.MeshStandardMaterial({ color: 0xffffff, map: rubbleDustTex(), transparent: true, depthWrite: false, roughness: 1,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 40 * nH + 40, { castShadow: false })
        };
        this.rd.dust.mesh.renderOrder = 1;
      });
    }
    // Chi tiết đống: thêm ẩn (ZERO), hiện khi đống đã đổ xong. Mục [pool, idx, ma trận, x, z, mặt đất | null] (cùng dạng P.chunks)
    rdAdd(list, pool, m, c, x, z, g) {
      const i = pool.add(ZERO, c);
      if (i >= 0) list.push([pool, i, m, x, z, g]);
      return i;
    }
    rdShow(list) { if (list) for (const e of list) e[0].set(e[1], e[2]); }
    // Rải chi tiết lên mặt đống (chạy trong withSeed: không đụng RNG chung). Q: thông số đống
    //  surf(lx, lz) -> { y: độ cao thế giới mặt đống đã đổ xong, t: độ dày } | null (ngoài lưới); ground(wx, wz) | null (ụ trên sàn)
    //  hw/hd: nửa nền đống, cx/cz: tâm (cục bộ nhà), spill: tràn rìa, k: hệ số mật độ, list: nơi giữ mục, tMin: độ dày mặt nhìn thấy
    scatterRubble(B, Q) {
      const ca = Math.cos(B.angle), sa = Math.sin(B.angle), list = Q.list, k = Q.k || 1;
      const E = B.WM.edge, mat = B.st.mat, mineral = mat === 'concrete' || mat === 'stone', woodH = mat === 'wood', metalH = mat === 'metal';
      const dust = new THREE.Color(B.WM.dust[0], B.WM.dust[1], B.WM.dust[2]);
      const base = mineral ? new THREE.Color(0.74, 0.72, 0.68).lerp(B.color, 0.2) : new THREE.Color(E[0] * 1.15, E[1] * 1.15, E[2] * 1.15);
      const W = (lx, lz) => [B.x + lx * ca + lz * sa, B.z - lx * sa + lz * ca];
      const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qa = new THREE.Quaternion(), qr = new THREE.Quaternion(), eu = new THREE.Euler();
      // mặt nhìn thấy tại (lx, lz): mặt đống nếu nhô khỏi đất, không thì mặt đất
      const sAt = (lx, lz) => {
        const s = Q.surf(lx, lz), [wx, wz] = W(lx, lz);
        const gy = Q.ground ? Q.ground(wx, wz) : -1e9;
        const on = s && s.t > Q.tMin;
        return { y: Math.max(on ? s.y : -1e9, gy), t: on ? s.t : 0, wx, wz, gy: Q.ground ? gy : null, ok: on || !!Q.ground };
      };
      // nằm trên mặt: nghiêng theo dốc mặt + lệch ngẫu nhiên, chìm một phần (sink = phần bề cao bị vùi)
      const pose = (lx, lz, sx, sy, sz, sink, tilt, yaw) => {
        const c = sAt(lx, lz);
        if (!c.ok) return null;
        const a = sAt(lx + 2, lz).y, b = sAt(lx - 2, lz).y, d = sAt(lx, lz + 2).y, e = sAt(lx, lz - 2).y;
        nrm.set(-(a - b) / 4, 1, -(d - e) / 4);
        // dốc cục bộ quay theo hướng nhà (lưới cục bộ -> thế giới)
        nrm.set(nrm.x * ca + nrm.z * sa, 1, -nrm.x * sa + nrm.z * ca).normalize();
        qa.setFromUnitVectors(up, nrm);
        qr.setFromEuler(eu.set(rand(-tilt, tilt), yaw !== undefined ? yaw : rand(0, 6.283), rand(-tilt, tilt)));
        qa.multiply(qr);
        const p = new THREE.Vector3(c.wx, c.y + sy * (0.5 - sink), c.wz);
        return { m: new THREE.Matrix4().compose(p, qa.clone(), new THREE.Vector3(sx, sy, sz)), c, p, q: qa.clone() };
      };
      const add = (pool, P, col) => P && this.rdAdd(list, pool, P.m, col, P.c.wx, P.c.wz, P.c.gy);
      // màu từng cục: bê tông xám đậm nhạt, mảng sơn tường, gạch nung, mặt gãy tối; ra rìa phủ bụi
      const tone = (rim) => {
        const u = RNG();
        let c;
        if (woodH) c = u < 0.55 ? new THREE.Color(0.5, 0.36, 0.24) : u < 0.8 ? new THREE.Color(0.66, 0.6, 0.5) : base.clone();
        else if (metalH) c = u < 0.5 ? new THREE.Color(0.55, 0.56, 0.54) : base.clone();
        else if (!mineral) c = base.clone();
        else c = u < 0.5 ? base.clone() : u < 0.68 ? base.clone().lerp(B.color, rand(0.5, 0.85)) : u < 0.8 ? new THREE.Color(0.56, 0.33, 0.25) : u < 0.92 ? new THREE.Color(0.42, 0.41, 0.39) : new THREE.Color(0.86, 0.84, 0.8);
        c.multiplyScalar(rand(0.62, 1.08));
        return c.lerp(dust, Math.min(0.75, 0.15 + rim * 0.6));
      };
      const x0 = Q.cx - Q.hw - Q.spill * 1.5, x1 = Q.cx + Q.hw + Q.spill * 1.5, z0 = Q.cz - Q.hd - Q.spill * 1.5, z1 = Q.cz + Q.hd + Q.spill * 1.5;
      const outD = (lx, lz) => Math.sqrt(Math.max(0, Math.abs(lx - Q.cx) - Q.hw) ** 2 + Math.max(0, Math.abs(lz - Q.cz) - Q.hd) ** 2);
      // rải đều kiểu ô lưới lệch ngẫu nhiên (phủ dày, không vón cục): trên đống thì dày, ngoài rìa thưa dần (vụn văng ra đất)
      const strat = (cell, fn) => {
        const c = cell / Math.sqrt(k);
        for (let z = z0; z < z1; z += c) for (let x = x0; x < x1; x += c) {
          const lx = x + RNG() * c, lz = z + RNG() * c, c0 = Q.surf(lx, lz), dO = outD(lx, lz);
          const onPile = c0 && c0.t > Q.tMin + 0.6;
          if (!onPile && (!Q.ground || RNG() > 0.55 * Math.max(0, 1 - dO / (Q.spill * 1.5)) ** 2)) continue;
          fn(lx, lz, onPile ? 0 : Math.min(1, dO / (Q.spill * 1.5) + 0.3), onPile);
        }
      };
      const rd = this.rd;
      // cục bê tông 0.6-1.5 m (gỗ: ít hơn), đá / gạch vụn 0.3-0.6 m, mảnh dẹt
      strat(woodH ? 26 : 15, (lx, lz, rim, on) => {
        const s = (5 + 7 * RNG() ** 1.8) * (on ? 1 : 0.6);
        add(rd.block, pose(lx, lz, s, s * rand(0.35, 0.7), s * rand(0.6, 1), rand(0.35, 0.55), 0.5), tone(rim));
      });
      strat(woodH ? 11 : 8.5, (lx, lz, rim, on) => {
        const s = rand(2.4, 5) * (on ? 1 : 0.75);
        add(rd.stone, pose(lx, lz, s * rand(0.9, 1.3), s * rand(0.55, 0.9), s, rand(0.25, 0.45), 1.2), tone(rim));
      });
      strat(12, (lx, lz, rim, on) => {
        const s = rand(3, 8) * (on ? 1 : 0.7);
        add(rd.shard, pose(lx, lz, s, s * rand(0.08, 0.16), s * rand(0.6, 1), rand(0.2, 0.5), 0.6), tone(rim));
      });
      // trong nền nhà: chọn chỗ ngẫu nhiên trên đống
      const onPile = (n, fn) => {
        for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
          const lx = Q.cx + rand(-1, 1) * Q.hw * 1.05, lz = Q.cz + rand(-1, 1) * Q.hd * 1.05, s = Q.surf(lx, lz);
          if (!s || s.t < Q.tMin + 1.5) continue;
          i++; fn(lx, lz);
        }
      };
      const F = Q.floors || 1, areaK = Math.min(3, (Q.hw * Q.hd) / 2400) * k;
      // ván, xà gỗ gãy (nhà gỗ: ngập ván), khung cửa, ống nước
      onPile(Math.round((woodH ? 70 : 10) * areaK + (woodH ? 10 : 2)), (lx, lz) => {
        const L = rand(8, 26), c = woodH ? new THREE.Color(0.7, 0.55, 0.4).multiplyScalar(rand(0.55, 1.05)) : new THREE.Color(0.62, 0.5, 0.38).multiplyScalar(rand(0.5, 1));
        add(rd.plank, pose(lx, lz, L, rand(0.5, 1.4), rand(1.2, 2.6), 0.35, 0.45), c.lerp(dust, 0.15));
      });
      if (B.kind !== 'hangar') onPile(Math.round(Math.min(8, 1 + F * 1.3) * Math.min(1.5, areaK)), (lx, lz) => {
        const u = RNG(), c = u < 0.45 ? new THREE.Color(0.48, 0.33, 0.21) : u < 0.75 ? new THREE.Color(0.82, 0.8, 0.74) : u < 0.9 ? new THREE.Color(0.42, 0.55, 0.5) : new THREE.Color(0.6, 0.62, 0.64);
        const P = pose(lx, lz, rand(0.9, 1.15), 1, rand(0.9, 1.1), 0, 0.15);
        if (P) {
          // khung nằm nghiêng trên đống, 1 thanh đứng vùi nửa trong vụn: dựng lại ma trận nằm ngửa theo mặt đống
          const q = P.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + rand(-0.5, 0.35), rand(-0.4, 0.4), 0)));
          P.p.y = P.c.y - rand(0.2, 0.9);
          P.m.compose(P.p, q, new THREE.Vector3().setScalar(rand(0.9, 1.15)));
          add(rd.frame, P, c.multiplyScalar(rand(0.7, 1)).lerp(dust, 0.2));
        }
      });
      onPile(Math.round(Math.min(12, 2 + F * 1.6) * Math.min(1.5, areaK)), (lx, lz) => {
        const u = RNG(), r = rand(0.35, 0.8), c = u < 0.45 ? new THREE.Color(0.78, 0.78, 0.74) : u < 0.75 ? new THREE.Color(0.42, 0.26, 0.16) : new THREE.Color(0.2, 0.2, 0.2);
        const P = pose(lx, lz, r * 2, rand(8, 24), r * 2, 0, 0.3);
        if (P) {
          const q = P.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + rand(-0.35, 0.35), 0, 0)));
          P.p.y = P.c.y + r * 0.2;
          P.m.compose(P.p, q, new THREE.Vector3(r * 2, rand(8, 24), r * 2));
          add(rd.pipe, P, c.multiplyScalar(rand(0.75, 1.05)));
        }
      });
      // mái: ngói (mái dốc) / tôn (nhà kho vòm, mái phụ nhà phố) theo vật liệu nhà
      const roof = B.st.roof;
      if (roof === 'pitched' && !Q.noRoof) {
        onPile(Math.round(26 * areaK + 8), (lx, lz) => add(rd.tile, pose(lx, lz, rand(3, 7), rand(0.8, 1.3), rand(3, 6), 0.4, 0.5), new THREE.Color(1, 1, 1).multiplyScalar(rand(0.65, 1.05)).lerp(dust, 0.2)));
        onPile(Math.round(5 * areaK + 2), (lx, lz) => add(rd.tile, pose(lx, lz, rand(12, 22), rand(1, 1.6), rand(9, 16), 0.35, 0.55), new THREE.Color(1, 1, 1).multiplyScalar(rand(0.7, 1)).lerp(dust, 0.15)));
      }
      const nSheet = Q.noRoof ? 0 : roof === 'arched' || metalH ? Math.round(16 * areaK + 4) : B.kind === 'tube' || B.kind === 'shop' ? 2 + Math.round(areaK) : 0;
      onPile(nSheet, (lx, lz) => {
        const u = RNG(), c = u < 0.5 ? new THREE.Color(0.62, 0.64, 0.62) : u < 0.8 ? new THREE.Color(0.5, 0.3, 0.2) : new THREE.Color(0.35, 0.45, 0.55);
        add(rd.sheet, pose(lx, lz, rand(14, 28), rand(0.3, 0.45), rand(8, 14), 0.05, 0.3), c.multiplyScalar(rand(0.5, 0.78)).lerp(dust, 0.1));
      });
      // lớp bụi phủ mặt đất quanh chân đống: đĩa mờ chồng lên nhau, đậm sát chân đống, nhạt dần ra xa
      if (Q.ground) {
        const per = 2 * (Q.hw + Q.hd), n = Math.round(Math.min(40, per / 9 + 6) * Math.min(1.3, k + 0.3));
        for (let i = 0; i < n; i++) {
          let t = RNG() * per, lx, lz, ox = 0, oz = 0;
          if (t < 2 * Q.hw) { lx = Q.cx - Q.hw + t; lz = Q.cz + (RNG() < 0.5 ? -Q.hd : Q.hd); oz = Math.sign(lz - Q.cz); }
          else { t -= 2 * Q.hw; lz = Q.cz - Q.hd + t % (2 * Q.hd); lx = Q.cx + (t < 2 * Q.hd ? -Q.hw : Q.hw); ox = Math.sign(lx - Q.cx); }
          const o = rand(-0.1, 1.2) * Q.spill;
          lx += ox * o; lz += oz * o;
          const [wx, wz] = W(lx, lz), gy = Q.ground(wx, wz), R = rand(18, 44) * (Q.dustK || 1);
          const a = Q.ground(wx + 4, wz), b = Q.ground(wx - 4, wz), d = Q.ground(wx, wz + 4), e = Q.ground(wx, wz - 4);
          nrm.set(-(a - b) / 8, 1, -(d - e) / 8).normalize();
          const s = Q.surf(lx, lz), y = Math.max(gy, s && s.t > Q.tMin ? s.y : -1e9) + 0.35;
          const m = new THREE.Matrix4().compose(new THREE.Vector3(wx, y, wz), new THREE.Quaternion().setFromUnitVectors(up, nrm).multiply(qr.setFromEuler(eu.set(0, RNG() * 6.283, 0))), new THREE.Vector3(R, 1, R * rand(0.6, 1)));
          this.rdAdd(list, rd.dust, m, dust.clone().multiplyScalar(rand(0.84, 0.96)), wx, wz, gy);
        }
      }
    }
    // Bó thép lòi ra ở 1-2 chỗ trên mép gãy của tấm sàn (pv: bể tấm, cm/p/q: tư thế tấm, sx/sz: cỡ tấm). h: hash trang trí
    plateRebar(list, pv, cm, p, q, sx, sz, g, s, h) {
      const E = pv.mesh.geometry.userData.edges;
      if (!E || !E.length) return;
      const n = h(s, 1.7) < 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const e = E[Math.floor(h(s + k * 13, 3.9) * E.length) % E.length];
        let dx = e.nx / sx, dz = e.nz / sz;
        const l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
        const pos = new THREE.Vector3(e.x * sx, 0, e.z * sz).applyQuaternion(q).add(p);
        const rq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx)));
        const rp = this.rd.rebar[Math.floor(h(s + k, 8.1) * 3) % 3];
        this.rdAdd(list, rp, new THREE.Matrix4().compose(pos, rq, new THREE.Vector3(1, 1, 1)), null, pos.x, pos.z, g);
      }
    }
    // Lấy mẫu mặt đống đã đổ xong (song tuyến trên lưới đỉnh): độ cao thế giới + độ dày
    rubbleSampler(LX, LZ, nx, nz, cx, cz, top, off, yB) {
      return (lx, lz) => {
        const fx = (lx - cx + LX / 2) / LX * nx, fz = (lz - cz + LZ / 2) / LZ * nz;
        if (!(fx >= 0 && fz >= 0 && fx <= nx && fz <= nz)) return null;
        const ix = Math.min(nx - 1, fx | 0), iz = Math.min(nz - 1, fz | 0), u = fx - ix, v = fz - iz;
        const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
        const t = (top[a] * (1 - u) + top[b] * u) * (1 - v) + (top[c] * (1 - u) + top[d] * u) * v;
        const o = (off[a] * (1 - u) + off[b] * u) * (1 - v) + (off[c] * (1 - u) + off[d] * u) * v;
        return { y: yB + o + t, t };
      };
    }
    // Mảng tường của chính nhà này (còn ô cửa sổ, mặt tường sơn) nằm nghiêng vùi một phần trên đống: dùng lại instance
    // mảng tường đã bị nghiền ẩn đi (cùng bể, không thêm instance)
    rubblePanels(B, Q, n) {
      const C = B.cz;
      if (!C || !n) return;
      const ca = Math.cos(B.angle), sa = Math.sin(B.angle);
      const cand = C.mods.filter(m => m.role === 'wall' && m.kit && m.h && !m.h.custom && m.h.pool && (m.h.pool === m.kit.pools.box || (m.kit.pools.shatterV && m.kit.pools.shatterV.includes(m.h.pool))));
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      for (let i = 0; i < n && cand.length; i++) {
        const m = cand.splice(Math.floor(RNG() * cand.length), 1)[0];
        m.h.m.decompose(pos, q, sc);
        // gần mép nền (tường đổ quanh chu vi), lệch vào trong
        const side = RNG() < 0.5, sg = RNG() < 0.5 ? -1 : 1;
        const lx = side ? sg * Q.hw * rand(0.55, 0.95) : rand(-0.8, 0.8) * Q.hw, lz = side ? rand(-0.8, 0.8) * Q.hd : sg * Q.hd * rand(0.55, 0.95);
        const s = Q.surf(lx, lz);
        if (!s || s.t < Q.tMin + 2) continue;
        const wx = B.x + lx * ca + lz * sa, wz = B.z - lx * sa + lz * ca;
        // mặt tường ngửa lên trời nghiêng 20-55°, chìm 35-55% chiều cao mảng trong vụn
        const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (RNG() < 0.5 ? -1 : 1) * rand(0.35, 0.95), B.angle + rand(-0.9, 0.9), rand(-0.3, 0.3), 'YXZ'));
        const ext = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);   // chiều cao mảng sau khi xoay
        const hgt = sc.y * Math.abs(ext.y);
        const mm = new THREE.Matrix4().compose(new THREE.Vector3(wx, s.y + hgt * (0.5 - rand(0.35, 0.55)), wz), qq, sc);
        Q.list.push([m.h.pool, m.h.idx, mm, wx, wz, Q.ground ? Q.ground(wx, wz) : null]);
      }
    }

    // Độ cao từng đỉnh đống đổ nát = mặt đất tại đó + độ dày đống x tiến độ hiện dần (rubbleT)
    /**
     * Nổ trên đống đổ nát của nhà đã sập: gạch đá tơi bị hất tung y như đất — khoét hố lòng chảo, vành gạch vụn hất lên quanh
     * miệng, tấm sàn gãy / cục bê tông / đồ đạc trong vùng nổ văng mất. Lưới độ cao đống (B.rubbleGrid) đổi theo nên xích xe
     * bò theo đúng mặt mới. Cỡ hố theo loại đạn (gạch đá tơi: rộng hơn đất nện một chút); đạn súng chỉ cày vết nhỏ.
     * Chỉ là hình + mặt xe bò (không đổi trạng thái đồng bộ); mọi máy nhận cùng chuỗi ENV_HIT nên cùng hình hố
     */
    blastRubble(B, x, y, z, ammo, heavy, fx) {
      const C = RUBBLE_CRATER[ammo];
      if (!C || Math.hypot(x - B.x, z - B.z) > B.rubbleR + C[0] * 2) return;
      const R = C[0] * (heavy ? 1.5 : 1), D = C[1] * (heavy ? 1.6 : 1);
      const geo = B.rubbleMesh.geometry, P = geo.attributes.position, a = P.array, W = B.rubbleW, top = B.rubbleTop, off = B.rubbleOff;
      const oy = B.y - 1.2;
      // nổ phải sát mặt đống (nổ trên cao / trúng nhà bên cạnh thì thôi)
      let near = Infinity, surf = -Infinity;
      for (let i = 0; i < P.count; i++) {
        const d = Math.hypot(W[i * 2] - x, W[i * 2 + 1] - z);
        if (d < near) { near = d; surf = oy + a[i * 3 + 1]; }
      }
      if (near > R * 1.4 || y - surf > R * 0.8) return;
      let any = false;
      for (let i = 0; i < P.count; i++) {
        const d = Math.hypot(W[i * 2] - x, W[i * 2 + 1] - z), u = d / R;
        if (u > 1.35) continue;
        const dy = u < 1 ? -D * (1 - u * u) : D * 0.25 * Math.sin(Math.PI * (u - 1) / 0.35);
        const t0 = top[i];
        top[i] = Math.max(-0.6, top[i] + dy);
        if (top[i] !== t0) { a[i * 3 + 1] = off[i] + top[i]; any = true; }
      }
      if (!any) return;
      P.needsUpdate = true;
      geo.computeVertexNormals();
      // chi tiết trên mặt đống nằm trong lòng hố: văng mất
      const R2 = R * 0.9;
      if (B.rubbleDeco) B.rubbleDeco = B.rubbleDeco.filter(e => { if (Math.hypot(e[3] - x, e[4] - z) < R2) { e[0].hide(e[1]); return false; } return true; });
      if (B.chunkIdx) B.chunkIdx = B.chunkIdx.filter(e => { if (Math.hypot(e[2] - x, e[3] - z) < R2) { this.slabChunkPool.hide(e[0]); return false; } return true; });
      this.commitAll();
      if (fx && !this._syncing) {
        chunks(fx, x, y + 1, z, Math.min(10, 3 + Math.round(R / 2)), 3, B.WM.edge, 50);
        dustBurst(fx, x, y + 2, z, Math.min(6, 2 + Math.round(R / 3)), 10 + R, B.WM.dust);
      }
    }
    // nhà có đang trong tầm nhìn camera không (dùng mức chi tiết của hệ hiệu ứng; không có thì coi như thấy)
    inView(B, fx) {
      fx = fx || (typeof window !== 'undefined' && window.game && window.game.effectsManager && window.game.effectsManager.fx);
      return !(fx && fx.lodAt) || fx.lodAt(B.x, B.y + (B.topY || 30) / 2, B.z, Math.hypot(B.halfW, B.halfD, (B.topY || 30) / 2)) > 0;
    }
    rubbleY(B) {
      const p = B.rubbleMesh.geometry.attributes.position, a = p.array, k = Math.max(0.001, B.rubbleT || 0);
      for (let i = 0; i < p.count; i++) a[i * 3 + 1] = B.rubbleOff[i] + B.rubbleTop[i] * k;
      p.needsUpdate = true;
    }
    // Gạch đá dưới chân tường (wallDebris / fallFx): nhớ lại để đặt lại theo mặt đất khi có hố bom
    addGroundBit(m, x, z, c) {
      const i = this.bitPool.add(m, c);
      if (i >= 0) (this.groundBits || (this.groundBits = [])).push({ i, m, x, z, g: this.groundAt(x, z) });
      return i;
    }
    // Mặt đất trong vùng chữ nhật vừa đổi (hố bom mới / hố bị xoá, gọi từ terrain.onGroundChanged): đống đổ nát, thép lòi,
    // tảng sàn gãy, mảng tường góc và gạch đá dưới chân tường hạ / nâng theo mặt đất mới (không lơ lửng trên hố, không vùi)
    reground(x0, z0, x1, z1) {
      const inBox = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
      let bits = false;
      if (this.regroundPiles) this.regroundPiles(inBox);   // đống đổ nát phụ của phần nhà sập một phần (makePile)
      if (this.groundBits) for (const b of this.groundBits) {
        if (!inBox(b.x, b.z)) continue;
        const g = this.groundAt(b.x, b.z);
        if (g === b.g) continue;
        b.m.elements[13] += g - b.g; b.g = g;
        this.bitPool.set(b.i, b.m);
        bits = true;
      }
      for (const B of this.items) {
        if (!B.rubbleMesh || B.x + B.rubbleR < x0 || B.x - B.rubbleR > x1 || B.z + B.rubbleR < z0 || B.z - B.rubbleR > z1) continue;
        let ch = false;
        for (let i = 0; i < B.rubbleOff.length; i++) {
          const x = B.rubbleW[i * 2], z = B.rubbleW[i * 2 + 1];
          if (!inBox(x, z)) continue;
          const o = this.groundAt(x, z) - B.y;
          if (o !== B.rubbleOff[i]) { B.rubbleOff[i] = o; ch = true; }
        }
        if (ch) { this.rubbleY(B); B.rubbleMesh.geometry.computeBoundingSphere(); }
        if (B.rubbleBarMesh) {
          const a = B.rubbleBarMesh.geometry.attributes.position;
          let bc = false;
          for (const r of B.rubbleBars) {
            if (!inBox(r.x, r.z)) continue;
            const d = this.groundAt(r.x, r.z) - B.y - r.off;
            if (!d) continue;
            for (let v = r.v0; v < r.v0 + r.n; v++) a.array[v * 3 + 1] += d;
            r.off += d; bc = true;
          }
          if (bc) { a.needsUpdate = true; B.rubbleBarMesh.geometry.computeBoundingSphere(); }
        }
        for (const e of B.chunkIdx || []) {
          if (!inBox(e[2], e[3])) continue;
          const g = this.groundAt(e[2], e[3]);
          if (g === e[4]) continue;
          e[1].elements[13] += g - e[4]; e[4] = g;
          if (B.rubbleT >= 1) this.slabChunkPool.set(e[0], e[1]);
        }
        for (const e of B.rubbleDeco || []) {
          if (e[5] === null || !inBox(e[3], e[4])) continue;
          const g = this.groundAt(e[3], e[4]);
          if (g === e[5]) continue;
          e[2].elements[13] += g - e[5]; e[5] = g;
          if (B.rubbleT >= 1) e[0].set(e[1], e[2]);
        }
      }
      return bits;
    }

    update(dt, fx) {
      this.updatePiles(dt);
      this.updateCollapse(dt, fx);
      // vùng đè xe tới lúc khối đổ chạm đất -> chờ game lấy (takeCrush)
      if (this.crushQ && this.crushQ.length) for (let i = this.crushQ.length - 1; i >= 0; i--) {
        const c = this.crushQ[i];
        if ((c.t -= dt) > 0) continue;
        this.crushQ.splice(i, 1);
        (this.crushDue || (this.crushDue = [])).push(c);
      }
      if (this.fires && this.fires.length) this.updateFires(dt, fx);
      // hình hư hại đang chờ dựng: mỗi tòa dựng lại tối đa ~4 lần / giây, mỗi khung hình tối đa 1 tòa
      // (hình từng mảng tính rải qua nhiều khung hình, ~4 ms mỗi khung, rồi mới gộp)
      let built = false;
      for (const B of this.items) {
        if (!B.dmgPending) continue;
        if (!this.inView(B, fx)) continue;   // ngoài tầm nhìn: hoãn dựng hình tới khi camera quay tới
        B.dmgWait = (B.dmgWait || 0) + dt;
        if (built || B.dmgWait < 0.25) continue;
        built = true;
        if (B.collapsed) { B.dmgPending = false; continue; }
        if (!this.prepPanels(B, 4)) continue;
        B.dmgPending = false; B.dmgWait = 0;
        this.rebuildDamage(B);
      }
      this._landN = 0;
      // nháp dùng lại mỗi khung cho mảng nhà đang rơi (Pool.set chép ma trận, không giữ tham chiếu)
      const AS = this.anim.length ? (this._animS || (this._animS = { off: new THREE.Matrix4(), m: new THREE.Matrix4(), bo: new THREE.Matrix4(), dm: new THREE.Matrix4(),
        p: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler() })) : null;
      for (let i = this.anim.length - 1; i >= 0; i--) {
        const A = this.anim[i];
        A.t += dt;
        const t = A.t - A.delay;
        if (t < 0) continue;
        const fall = Math.min(A.drop, 0.5 * 78.5 * t * t);   // rơi tự do đúng trọng lực thế giới (9,81 m/s² = 78,5 đv/s²)
        let k = fall / A.drop;
        // mảng tường / sàn vỡ toác giữa đường rơi (1/3 số mảng) hoặc lúc đập xuống: đá văng, bụi; mảng biến vào đống đổ nát
        if (k >= 1 || (k > 0.55 && A.m.id % 3 === 0 && A.m.role !== 'col')) {
          if (fx && this._landN < 10) {
            this._landN++;
            const p = AS.p.setFromMatrixPosition(AS.m.multiplyMatrices(A.B.base, A.m.local));
            p.y -= fall;
            chunks(fx, p.x, p.y, p.z, 3, A.m.role === 'wall' ? 2.8 : 3.6, A.B.WM.edge, 22);
            if (this._landN % 3 === 1) dustBurst(fx, p.x, p.y, p.z, 1, 12, A.B.WM.dust);
          }
          k = 1;
        }
        // mảng bị sóng nổ thổi văng (push): bay ngang đều theo thời gian trong khi rơi nhanh dần -> quỹ đạo parabol
        // (độ dời ngang ~ t ~ căn bậc hai quãng rơi); mảng đổ vì mất chỗ tựa thì nghiêng dần theo quãng rơi
        const kh = A.push ? Math.sqrt(k) : k;
        // nghiêng / xoay / bẹp quanh chân chính mảng đó (trước đây quay quanh tâm nhà: mảng tầng cao văng lơ lửng xa hàng chục mét)
        const pm = A.m, pyB = pm.ly - (pm.hy || 0);
        const off = AS.off.compose(
          AS.p.set(0, 0, 0),
          AS.q.setFromEuler(AS.e.set(A.tilt.z * k * 0.5, A.spin * k, -A.tilt.x * k * 0.5)),
          AS.s.set(1, 1 - k * 0.6, 1)
        );
        AS.p.set(pm.lx, pyB, pm.lz).applyMatrix4(off);
        off.elements[12] += pm.lx - AS.p.x + A.tilt.x * kh * (6 + (A.push || 0));
        off.elements[13] += pyB - AS.p.y - fall;
        off.elements[14] += pm.lz - AS.p.z + A.tilt.z * kh * (6 + (A.push || 0));
        const bo = AS.bo.multiplyMatrices(A.B.base, off);
        if (A.pre) bo.multiply(A.pre);   // mảng bong ra giữa lúc nhà đang sụp: rơi tiếp từ chỗ khối nhà đã tụt / nghiêng tới
        const m = AS.m.multiplyMatrices(bo, A.m.local);
        if (A.m.kit) A.m.h.pool.set(A.m.h.idx, m); else A.m.pool.set(A.m.idx, m);
        // chi tiết mái rơi theo ô mái bên dưới
        if (A.m.deco && k < 1) for (const d of A.m.deco) d.pool.set(d.idx, AS.dm.multiplyMatrices(bo, d.local));
        if (k >= 1) {
          A.m.state = 'gone';
          this.hideMod(A.m);
          this.anim.splice(i, 1);
        }
      }
      for (const B of this.items) {
        if (!B.collapsed || B.cz || B.rubbleT >= 1) continue;   // đang sụp: đống dâng theo updateCollapse
        B.rubbleT = Math.min(1, B.rubbleT + dt / 1.6);
        if (B.rubbleMesh) this.rubbleY(B);
        if (B.rubbleT >= 1) { for (const [idx, cm] of B.chunkIdx) this.slabChunkPool.set(idx, cm); this.rdShow(B.rubbleDeco); if (B.rubbleBarMesh) B.rubbleBarMesh.visible = true; }
      }
      // Nổ trong phòng: khói đen cuộn phụt ra các ô cửa vỡ / lỗ thủng của tầng đó một lúc lâu
      for (let i = this.vents.length - 1; i >= 0; i--) {
        const v = this.vents[i];
        v.t -= dt; v.acc += dt;
        if (v.t <= 0 || v.B.collapsed) { this.vents.splice(i, 1); continue; }
        if (v.acc < 0.25 || !fx || !fx.smoke) continue;
        v.acc = 0;
        const g = rand(0.16, 0.26);
        fx.smoke.add({ x: v.x, y: v.y, z: v.z, vx: v.nx * rand(6, 14), vy: rand(5, 12), vz: v.nz * rand(6, 14), size: rand(5, 9), grow: 6, drag: 0.8, grav: -3,
          life: rand(4, 7), alpha: 0.5 * Math.min(1, v.t / 4), fadeIn: 0.2, c0: [g, g * 0.97, g * 0.94], cell: 2 });
      }
    }

    // ---- NHÀ CHE KHUẤT XE MÌNH: tạm cắt bỏ các tầng trên (kiểu game chiến thuật) để luôn thấy xe ----
    isCutMod(B, m) { return m.role === 'roof' || (m.floor >= 1 && (m.role === 'wall' || m.role === 'col' || m.role === 'slab')); }
    cutHide(m) {
      if (m.kit) { if (m.h) { m.h.pool.hide(m.h.idx); for (const [p, i] of m.h.extra) p.hide(i); } }
      else if (m.pool) m.pool.hide(m.idx);
      if (m.deco) this.decoVis(m, false);
    }
    cutShow(m) {
      if (m.kit) { if (m.h) { m.h.pool.set(m.h.idx, m.h.m); for (const [p, i] of m.h.extra) p.set(i, m.h.m); } }
      else if (m.pool) m.pool.set(m.idx, m.world);
      if (m.deco) this.decoVis(m, true);
    }
    applyCut(B, on) {
      B.cut = on;
      for (const m of B.mods) {
        if (m.state === 'gone' || !this.isCutMod(B, m)) continue;
        if (on) this.cutHide(m); else this.cutShow(m);
      }
      // ụ đổ nát trên nóc tầng ≥ 1 và mép sàn gãy tầng trên: ẩn / hiện theo tầng bị cắt
      if (B.scars) for (const s of B.scars) if (s.lvl >= 1) this.scarVis(s, !on);
      if (B.piles) for (const P of B.piles) if (P.lvl >= 1) { P.g.visible = !on; if (P.done) for (const c of P.chunks) { if (on) c[0].hide(c[1]); else c[0].set(c[1], c[2]); } }
      if (B.dmgPanels.size) this.rebuildDamage(B);
    }
    // cam: vị trí camera, foc: xe đang theo dõi (x, y, z). Đường nhìn xe -> camera cắt qua nhà dưới mái -> cắt tầng
    setView(cam, foc, dt) {
      if (!cam || !foc) return;
      let dirty = false;
      for (const B of this.items) {
        let want = false;
        if (!B.collapsed && B.floors >= 2 && Math.abs(B.x - foc.x) < 700 && Math.abs(B.z - foc.z) < 700) {
          const a = this.toLocal(B, foc.x, foc.y + 10, foc.z), b = this.toLocal(B, cam.x, cam.y, cam.z);
          let t0 = 0, t1 = 1;
          for (const [p, d, h] of [[a.x, b.x - a.x, B.halfW + 6], [a.z, b.z - a.z, B.halfD + 6]]) {
            if (Math.abs(d) < 1e-6) { if (Math.abs(p) > h) { t0 = 2; break; } continue; }
            let u0 = (-h - p) / d, u1 = (h - p) / d;
            if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
            t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
          }
          if (t0 <= t1 && t0 <= 1) want = a.y + (b.y - a.y) * t0 < B.topY + B.FH * 0.5;
        }
        if (want) B.cutHold = 0.5; else B.cutHold -= dt || 0.016;
        const on = B.cutHold > 0;
        if (on !== B.cut) { this.applyCut(B, on); dirty = true; }
      }
      if (dirty) this.commitAll();
    }
  }

  // ===========================================================================
  // MẶT GÃY KHỐI BÊ TÔNG CỐT THÉP (tường / boong-ke)
  // - Đường gãy lấy theo nhiễu TỌA ĐỘ THẾ GIỚI dọc từng đường mép khối: các khối chồng / kề nhau cùng bị vỡ
  //   nối liền một đường gãy (trước đây mỗi khối một vết lõm bán nguyệt riêng -> mép lỗ lượn sóng lặp theo từng khối).
  // - Mặt gãy hình phễu: lớp bê tông bảo vệ ở 2 mặt tường bong vảy rộng hơn lõi, mặt gãy sần từng mảng,
  //   màu cốt liệu thô (không mang vân ván khuôn của mặt tường).
  // - Thép 2 lớp sát 2 mặt tường lòi ra khỏi mặt gãy theo lưới cố định trên tường: thanh gãy cụt / cong queo.
  // Không dùng RNG (chỉ băm theo vị trí) -> không lệch dãy số đồng bộ mạng, mọi máy dựng ra cùng một hình.
  // ===========================================================================
  const hashN = (a, b) => { const k = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return k - Math.floor(k); };
  function vnoise(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hashN(i, s); return a + (hashN(i + 1, s) - a) * u; }
  // nhiễu nhiều tầng tần số, khoảng -0.5..0.5
  function fbm1(x, s) { return (vnoise(x, s) - 0.5) * 0.6 + (vnoise(x * 2.17 + 13.1, s + 1.7) - 0.5) * 0.28 + (vnoise(x * 4.9 + 7.3, s + 3.1) - 0.5) * 0.12; }
  const ease01 = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  // Ô nhỏ trên texture bê tông không dính mạch ván khuôn / lỗ ty: mặt gãy & mảnh vụn chỉ lấy vân sạn ở đây
  const FRAC_UV = { u: 0.25, v: 0.69, k: 0.012 };
  function fracUV(geo) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, FRAC_UV.u + (uv.getX(i) - 0.5) * 0.09, FRAC_UV.v + (uv.getY(i) - 0.5) * 0.09);
    return geo;
  }
  // Vật liệu cùng texture nhưng nhận màu theo đỉnh (mặt gãy sáng màu cốt liệu, mặt tường giữ nguyên)
  function vcMat(mat) { return mat.userData.vc || (mat.userData.vc = Object.assign(mat.clone(), { vertexColors: true })); }

  /**
   * Khối bê tông bị vỡ một / nhiều cạnh (hệ đơn vị -0.5..0.5, khớp ma trận của khối).
   * len / h / T: kích thước thật của khối (dọc tường / cao / dày). E: { L|R|T|B: cạnh vỡ } với
   *   s: hạt nhiễu của đường mép (theo vị trí thế giới), w0: tọa độ thế giới dọc mép tại đầu cạnh,
   *   m: 't' = gốc gãy (mép trên vỡ sâu: lv mức gãy trung bình, l0 / l1 mức tại 2 đầu để khớp khối kề),
   *   còn lại = vết ăn vào cạnh: o0 / o1 đầu cạnh hở (vết vỡ chạy tiếp sang khối kề -> không thu hẹp về 0),
   *   f0: khối đối diện còn gốc gãy cao tới f0 (phần dưới mức này chưa vỡ).
   */
  function fractureSolid(len, h, T, E) {
    const DIM = { L: [len, h], R: [len, h], T: [h, len], B: [h, len] };   // [bề vuông góc với cạnh, chiều dài cạnh]
    const ZL = [0.5, 0.37, 0.14, -0.14, -0.37, -0.5].map(k => k * T);
    const NS = 64, sides = Object.keys(E), tab = {}, mx = { L: 0, R: 0, T: 0, B: 0 };
    for (const s of sides) {
      const e = E[s], [P, Lg] = DIM[s], top = e.m === 't', cap = (top ? 0.86 : 0.46) * P;
      const t0 = 0.4 + 0.35 * hashN(e.s, 2.2), t1 = 0.4 + 0.35 * hashN(e.s, 3.3);
      tab[s] = ZL.map((z, l) => {
        const zf = Math.pow(Math.abs(z) / (T / 2), 1.6), row = new Float32Array(NS + 1);
        for (let k = 0; k <= NS; k++) {
          const a = k / NS, tw = e.w0 + a * Lg;
          const S = 0.45 + 0.6 * vnoise(tw * 0.6, e.s + (z > 0 ? 5.3 : 9.1));
          let d;
          if (top) {
            const lv = e.lv + (e.l0 - e.lv) * (1 - ease01(a / 0.45)) + (e.l1 - e.lv) * (1 - ease01((1 - a) / 0.45));
            d = P * (1 - lv - 0.17 * fbm1(tw * 0.5, e.s)) + P * 0.13 * S * zf;
          } else {
            let tau = (e.o0 ? 1 : Math.sqrt(1 - Math.pow(1 - clamp01(a / t0), 2))) * (e.o1 ? 1 : Math.sqrt(1 - Math.pow(1 - clamp01((1 - a) / t1), 2)));
            if (e.f0 !== undefined) tau *= ease01((a - e.f0) / 0.28);
            d = P * (0.24 + 0.46 * fbm1(tw * 0.42, e.s)) * tau * (1 + S * zf);
          }
          d += P * 0.05 * (vnoise(tw * 1.9, e.s + 20 + l * 3.3) - 0.5) * ease01(d / (0.08 * P));
          row[k] = Math.max(0, Math.min(cap, d));
          if (row[k] > mx[s]) mx[s] = row[k];
        }
        return row;
      });
    }
    const depth = (s, l, a) => { const r = tab[s][l], f = clamp01(a) * NS, i = Math.min(NS - 1, Math.floor(f)); return r[i] + (r[i + 1] - r[i]) * (f - i); };
    // cạnh làm điểm (x, y) rơi ra ngoài phần bê tông còn lại: null = còn đặc, 'M' = nhiều cạnh cùng lúc
    const fail = (x, y, l) => {
      let f = null;
      for (const s of sides) {
        const dist = s === 'L' ? x + len / 2 : s === 'R' ? len / 2 - x : s === 'T' ? h / 2 - y : y + h / 2;
        const a = s === 'L' || s === 'R' ? (y + h / 2) / h : (x + len / 2) / len;
        if (dist < depth(s, l, a) - 1e-5) { if (f) return 'M'; f = s; }
      }
      return f;
    };
    // tâm "lõi" chắc chắn còn đặc (dự phòng cho góc khối vỡ cả 2 cạnh)
    const cx = (mx.L - mx.R) / 2, cy = (mx.B - mx.T) / 2;
    const IN = { L: [1, 0], R: [-1, 0], T: [0, -1], B: [0, 1] };
    // chu vi khối ngược chiều kim đồng hồ: dưới -> phải -> trên -> trái; e: cạnh chứa đoạn i -> i+1
    const per = [], segs = [['B', len], ['R', h], ['T', len], ['L', h]];
    for (const [s, Lg] of segs) {
      const M = Math.max(8, Math.min(30, Math.round(Lg / 0.42)));
      for (let k = 0; k < M; k++) {
        const t = k / M;
        per.push(s === 'B' ? [-len / 2 + len * t, -h / 2, s] : s === 'R' ? [len / 2, -h / 2 + h * t, s] : s === 'T' ? [len / 2 - len * t, h / 2, s] : [-len / 2, h / 2 - h * t, s]);
      }
    }
    const N = per.length;
    // Điểm chu vi rơi vào vùng vỡ: đẩy thẳng góc vào trong từ cạnh vỡ (mép gãy 2 khối chồng nhau khớp đúng tại đường nối,
    // không vát chéo ở góc khối); góc khối vỡ cả 2 cạnh thì kéo theo tia về tâm lõi
    const rings = ZL.map((z, l) => per.map(([px, py]) => {
      const f = fail(px, py, l);
      if (!f) return [px, py, z, 1];
      if (f !== 'M') {
        const [nx, ny] = IN[f], D = (f === 'L' || f === 'R' ? len : h) * 0.9;
        if (!fail(px + nx * D, py + ny * D, l)) {
          let lo = 0, hi = D;
          for (let it = 0; it < 13; it++) { const m = (lo + hi) / 2; if (fail(px + nx * m, py + ny * m, l)) lo = m; else hi = m; }
          return [px + nx * hi, py + ny * hi, z, 0];
        }
      }
      let lo = 0, hi = 1;
      for (let it = 0; it < 13; it++) { const m = (lo + hi) / 2; if (!fail(cx + (px - cx) * m, cy + (py - cy) * m, l)) lo = m; else hi = m; }
      return [cx + (px - cx) * lo, cy + (py - cy) * lo, z, 0];
    }));
    const pos = [], uv = [], col = [];
    const WHITE = [1, 1, 1];
    const rawCol = p => { const g = 0.84 + 0.26 * hashN(p[0] * 3.1 + p[2] * 1.7, p[1] * 2.3 + 0.5); return [1.1 * g, 1.08 * g, 1.03 * g]; };
    const fracUVof = (p, n) => {
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      const [a, b] = az >= ax && az >= ay ? [p[0], p[1]] : ax >= ay ? [p[2], p[1]] : [p[0], p[2]];
      return [FRAC_UV.u + a * FRAC_UV.k, FRAC_UV.v + b * FRAC_UV.k];
    };
    // kind: 'F' mặt trước, 'K' mặt sau, 'S' mặt hông nguyên, 'X' mặt gãy. Đỉnh truyền vào theo chiều pháp tuyến hướng ra ngoài
    const tri = (A, B, C, kind) => {
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-7) return;
      for (const p of [A, B, C]) {
        pos.push(p[0] / len, p[1] / h, p[2] / T);
        if (kind === 'X') { uv.push(...fracUVof(p, n)); col.push(...rawCol(p)); continue; }
        col.push(...WHITE);
        if (kind === 'F') uv.push(p[0] / len + 0.5, p[1] / h + 0.5);
        else if (kind === 'K') uv.push(-p[0] / len + 0.5, p[1] / h + 0.5);
        else if (Math.abs(n[0]) > Math.abs(n[1])) uv.push((n[0] > 0 ? -p[2] : p[2]) / T + 0.5, p[1] / h + 0.5);
        else uv.push(p[0] / len + 0.5, (n[1] > 0 ? -p[2] : p[2]) / T + 0.5);
      }
    };
    // 2 mặt tường: tam giác hóa đa giác viền (ngược chiều kim đồng hồ nhìn từ mặt trước)
    for (const [ring, side] of [[rings[0], 'F'], [rings[ZL.length - 1], 'K']]) {
      const faces = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const [a, b, c] of faces) {
        const A = ring[a], B = ring[b], C = ring[c];
        const ccw = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) > 0;
        if (ccw === (side === 'F')) tri(A, B, C, side); else tri(A, C, B, side);
      }
    }
    // vách giữa các lớp: viền ngược chiều kim đồng hồ, lớp sau nằm sâu hơn (z giảm) -> (a, c, b) quay ra ngoài
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      for (let l = 0; l + 1 < ZL.length; l++) {
        const a = rings[l][i], b = rings[l][j], c = rings[l + 1][j], d = rings[l + 1][i];
        const kind = a[3] && b[3] && c[3] && d[3] ? 'S' : 'X';
        tri(a, c, b, kind); tri(a, d, c, kind);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const bars = fractureRebar(len, h, T, E, depth, ZL);
    if (bars) geo.userData.rebar = bars;
    return geo;
  }
  // Thép lòi khỏi mặt gãy: lưới thanh cách đều theo tọa độ thế giới (khối kề nhau chung một lưới), 2 lớp sát 2 mặt tường.
  // Thanh chỉ lộ ra nơi bê tông vỡ đủ sâu; đoạn lộ gồm một khúc thẳng + một khúc bẻ cong (sóng nổ / sức nặng mảng rơi),
  // vài thanh gãy sát mặt bê tông
  function fractureRebar(len, h, T, E, depth, ZL) {
    const SP = 1.55, W = 0.11, cover = Math.max(0.5, Math.min(1.2, T * 0.1)), list = [];
    const OUT = { L: [-1, 0], R: [1, 0], T: [0, 1], B: [0, -1] };
    const seg = (A, B) => {
      const d = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), L = d.length();
      if (L < 0.05) return;
      const g = new THREE.BoxGeometry(W, L + W, W).toNonIndexed();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2), q, new THREE.Vector3(1, 1, 1)));
      g.applyMatrix4(new THREE.Matrix4().makeScale(1 / len, 1 / h, 1 / T));
      list.push(g);
    };
    for (const s in E) {
      const e = E[s], vert = s === 'L' || s === 'R', Lg = vert ? h : len, [ox, oy] = OUT[s];
      for (const zs of [1, -1]) {
        const z = zs * (T / 2 - cover), l = zs > 0 ? 1 : ZL.length - 2;
        const off = zs > 0 ? 0 : SP * 0.5;
        for (let tw = Math.ceil((e.w0 - off) / SP) * SP + off; tw < e.w0 + Lg; tw += SP) {
          const a = (tw - e.w0) / Lg;
          if (a < 0.05 || a > 0.95) continue;
          const d = depth(s, l, a);
          const r1 = hashN(tw * 1.37 + zs, e.s), r2 = hashN(tw * 2.11 - zs, e.s + 4.4), r3 = hashN(tw * 0.73 + zs * 3, e.s + 8.8);
          if (d < 0.55 || r1 < 0.3) continue;
          const u = vert ? -h / 2 + a * h : -len / 2 + a * len;
          // điểm trên mép cạnh gốc (trước khi vỡ) -> chân thanh ngập trong bê tông còn lại, đầu thanh chĩa vào lỗ
          const bx = vert ? ox * len / 2 : u, by = vert ? u : oy * h / 2;
          const inX = bx - ox * (d + 0.4), inY = by - oy * (d + 0.4);
          const ex = Math.min(3.2, d * (0.45 + 0.6 * r2) + 1.0 * r3);
          const e1 = ex * (0.3 + 0.4 * r2), e2 = (ex - e1) / 2;
          let px = bx - ox * d + ox * e1, py = by - oy * d + oy * e1, pz = z;
          seg([inX, inY, z], [px, py, pz]);
          // cong dần qua 2 khúc: thanh ngang võng xuống (đa số), thanh đứng ngả sang một bên; bị đẩy chếch khỏi mặt tường
          const bend = (0.15 + 0.75 * r3) * (r1 < 0.85 ? 1 : -1), sg = vert ? -1 : (r2 < 0.5 ? -1 : 1);
          const dzk = zs * (0.1 + 0.45 * r2) * (r3 < 0.25 ? -1 : 1);
          for (let k = 1; k <= 2; k++) {
            const b = bend * k / 2;
            const dx = vert ? ox * Math.cos(b) : sg * Math.sin(b), dy = vert ? sg * Math.sin(b) : oy * Math.cos(b);
            const nx = px + dx * e2, ny = py + dy * e2, nz = pz + dzk * e2 * k / 2;
            seg([px, py, pz], [nx, ny, nz]);
            px = nx; py = ny; pz = nz;
          }
        }
      }
    }
    return list.length ? merge(list) : null;
  }

  // Bề dày bê tông cốt thép (đơn vị game, 8 = 1 m) mỗi loại đạn nổ chạm phá thủng được trong 1 phát (BREACH) và đầu xuyên /
  // đạn nhỏ khoan thủng được (PEN). Ước lượng theo công thức phá vật cản công binh (FM 5-34: R^3 = P / (K.C), bê tông cốt
  // thép K ~1,76, khối nổ đặt sát mặt không lấp C ~3,6) và số liệu đạn: 120 mm đa năng ~25 cm, nổ mạnh 120 mm ~35 cm;
  // lựu pháo 155 mm (~3 lần thuốc nổ) phá theo căn bậc ba khối thuốc nổ -> ~x1,45 (~50 cm); bom con / lựu 40 mm (vài chục
  // gam) chỉ khoét ~7 cm; RPG-7 xuyên ~0,9 m, tên lửa chống tăng ~1,7 m, APFSDS ~2 m (lỗ hầm hẹp);
  // 12,7 mm xả dồn một chỗ khoét thủng được ~25 cm, 30 mm ~40 cm
  const BREACH = { NORMAL: 2.0, HE: 2.8, CLUSTER: 1.2, CLUSTER_SUBMUNITION: 0.6, RPG: 1.4, ANTI_TANK_MISSILE: 2.2, AP: 0 };
  const PEN = { AP: 16, RPG: 7, ANTI_TANK_MISSILE: 14, SCOUT_BULLET: 2, INCENDIARY_HMG: 2, MG762: 1, GATLING_BULLET: 3.2, INCENDIARY: 3.0 };
  // Đầu xuyên (APFSDS / luồng nổ lõm) phá kết cấu bê tông: phần khối bị phá mỗi phát với vách mỏng ~0,3 m (PIERCE_REF); vách
  // dày hơn chỉ bị khoan một đường hầm hẹp (5-10 cm) -> phần phá giảm theo (PIERCE_REF / bề dày)^2. Vách mỏng (<= 0,4 m)
  // đã thủng lỗ thì phát xuyên tiếp theo làm cả mảng vỡ toác; vách dày phải khoan nhiều lỗ mới vỡ
  const PIERCE_FRAC = { AP: 0.35, RPG: 0.35, ANTI_TANK_MISSILE: 0.45 };
  const PIERCE_REF = 2.4, PUNCH_BREAK_MAX = 3.2;
  // Khối dày hơn sức phá: mỗi phát nổ chỉ bóc ~ nửa bề dày phá được (hố mặt trước + bong vảy mặt sau) -> số phát ~ (dày / br)^1,35
  const THICK_EXP = 1.35;
  // Đạn 30 mm đục dần: lượng bê tông phải đục tỉ lệ bề dày khối (chuẩn: khối 1,5 m ~250-270 phát trúng)
  const GOUGE_REF = 12;

  // ===========================================================================
  // KẾT CẤU KHỐI BÊ TÔNG (tường / boong-ke): sứt mẻ -> nứt lộ thép -> vỡ còn gốc gãy -> vỡ vụn
  // ===========================================================================
  class BlockStructure {
    constructor(parent, cap) {
      // bê tông công sự lâu năm (weathering.js): ố vệt mưa chảy dọc, loang ẩm, rêu đọng; khối không gốc ở chân -> bỏ bùn chân
      const WXc = m => typeof Weathering !== 'undefined' ? Weathering.apply(m, 'concrete', { grime: 0, lift: 30 }) : m;
      const conc = WXc(new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92, metalness: 0.02 }));
      const cracked = WXc(new THREE.MeshStandardMaterial({ map: crackedTex(), roughness: 0.95 }));
      this.kitC = new FractureKit(parent, conc, cracked, cap, { maxCustom: 100 });      // khối lành
      this.kitK = new FractureKit(parent, cracked, cracked, cap, { maxCustom: 100 });   // khối đã nứt toác
      // đống vụn: sạn / cục nhỏ (khối đa diện) + mảnh vừa / tảng lớn góc cạnh (hộp méo), vân sạn thô, mặt phẳng từng mảng
      // sạn: khối hộp dẹt méo (mặt phẳng sắc như bê tông vỡ) — trước là khối 12 mặt tròn trịa trông như hòn đá cuội
      this.rubblePool = new Pool(parent, fracUV(jitter(new THREE.BoxGeometry(1, 0.62, 0.86).toNonIndexed(), 0.32, 7)), cracked, cap * 10, { color: true });
      // màu vụn theo bê tông của công trình (BunkerSet bê tông cũ sẫm màu đặt lại)
      this.debrisCol = [0.76, 0.74, 0.7];
      this.chunkPool = new Pool(parent, fracUV(jitter(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).toNonIndexed(), 0.34, 3)), cracked, cap * 8, { color: true });
      this.blocks = [];
    }
    // pos: tâm chân khối (thế giới), rotY: hướng trục dọc (+X cục bộ) của khối
    addBlock(o) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(o.x, o.y0 + o.h / 2, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY), new THREE.Vector3(o.len, o.h, o.thick));
      const c = new THREE.Color(1, 1, 1).multiplyScalar(rand(0.86, 1.02));
      const q = Object.assign({}, o, {
        y1: o.y0 + o.h, m, c, hp: o.hp || 7.0, hpMax: o.hp || 7.0, alive: true, cracked: false, stub: false,
        ax: Math.cos(o.rotY), az: -Math.sin(o.rotY), radius: Math.max(o.len, o.thick) * 0.55 + 1
      });
      q.kit = this.kitC;
      q.h = this.kitC.add('box', m, c);
      this.blocks.push(q);
      return q;
    }
    commit() { this.kitC.commit(); this.kitK.commit(); this.rubblePool.commit(); this.chunkPool.commit(); }

    // Sát thương hình cầu quanh điểm nổ
    // Điểm (thế giới) -> hệ cục bộ của khối: u dọc tường, v theo chiều cao, w theo bề dày (đều -0.5..0.5 khi nằm trong khối)
    // và khoảng cách từ điểm tới mặt khối (0 nếu nằm trong / trên mặt)
    localOf(q, x, y, z) {
      const dx = x - q.x, dz = z - q.z;
      const along = dx * q.ax + dz * q.az, across = dz * q.ax - dx * q.az;
      const ex = Math.max(0, Math.abs(along) - q.len / 2), ez = Math.max(0, Math.abs(across) - q.thick / 2);
      const ey = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0;
      const H = q.m.elements[5] || (q.y1 - q.y0);   // chiều cao gốc của khối (y1 bị hạ khi còn gốc gãy)
      const yc = q.m.elements[13];
      return { u: along / q.len, v: (y - yc) / H, w: across / q.thick, dist: Math.hypot(ex, ey, ez) };
    }

    // Sát thương hình cầu quanh điểm nổ. ammo (tùy chọn) quyết định dáng lỗ xuyên: AP (động năng) / HEAT / đạn nhỏ
    damageSphere(x, y, z, R, power, pierce, fx, filter, ammo, dir) {
      let broke = 0;
      this.lastPierced = false;
      this._blast = { x, y, z, R };   // điểm nổ: hướng đổ / văng của mảnh vỡ
      // Khối bị đạn chạm trực tiếp: chỉ khối này bị khoét lỗ xuyên (1 viên đạn = 1 lỗ, không thủng lan sang khối kề)
      let hitQ = null, hitD = 2.5;
      for (const q of this.blocks) {
        if (!q.alive || (filter && !filter(q))) continue;
        if (Math.abs(x - q.x) > q.radius + 3 || Math.abs(z - q.z) > q.radius + 3) continue;
        const L = this.localOf(q, x, y, z);
        if (L.dist < hitD) { hitD = L.dist; hitQ = q; }
      }
      this.lastHitQ = hitQ;
      for (const q of this.blocks) {
        if (!q.alive || (filter && !filter(q))) continue;
        const dy = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0;
        const d = Math.max(0, Math.hypot(x - q.x, z - q.z) - q.radius * 0.7);
        const dist = q === hitQ ? 0 : Math.hypot(d, dy);
        if (dist > R) continue;
        const direct = q === hitQ;
        const k = clamp01(1 - dist / R);
        const small = power < 0.3;
        // Tính góc tới của viên đạn đối với mặt khối tường
        let cosI = 1;
        if (dir && direct) {
          const normX = Math.sin(q.rotY), normZ = Math.cos(q.rotY);
          cosI = Math.max(0.18, Math.abs(dir.x * normX + dir.z * normZ));
        }
        const effThick = direct ? q.thick / cosI : q.thick;
        const pen = PEN[ammo] || 0, canBore = pen >= effThick;
        let dmg, over = false;
        if (small) {
          // đạn nhỏ chỉ sứt / đục dần mặt bê tông (12.7mm sứt mẻ, 30mm nổ-mảnh đục sâu hơn), gần như không lan sang khối bên
          dmg = power * (0.15 + 1.1 * k * k) * (power < 0.2 ? 0.3 : 0.45) * (direct ? 1 : 0.15);
          // 30 mm đục dần: khối mỏng nhanh thủng, khối dày tốn số phát tỉ lệ bề dày (trước đây khối 0,3 m hay 2 m đều ~270 phát)
          if (ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY') dmg *= Math.min(4, GOUGE_REF / effThick);
        } else {
          // Thuốc nổ: mỗi loại đạn nổ chạm phá thủng được bê tông cốt thép dày tới br; khối dày hơn chỉ bị bóc mất phần
          // (br / dày)^2 mỗi phát (bắn trúng cùng chỗ nhiều phát thì cộng dồn mới thủng). Khối kề chịu nhẹ hơn hẳn theo khoảng cách
          const A0 = AMMO[ammo] || AMMO.NORMAL;
          const pf = power / A0.power;
          // bán kính phá ~ khối thuốc nổ^(1/3), sức phá power ~ khối thuốc nổ^(2/3) -> br ~ power^0,5 (155 mm, pf 2,1: x1,45)
          const br = (BREACH[ammo] !== undefined ? BREACH[ammo] : 2) * Math.pow(pf, 0.5);
          const rel = Math.pow(br / effThick, 2);
          // Khối dày hơn sức phá: mỗi phát bóc mảng bê tông theo tỉ lệ thực tế của đạn pháo nổ công sự
          const relD = br >= effThick ? rel : Math.pow(br / effThick, THICK_EXP);
          let frac;
          if (direct) frac = relD;
          else { const f = clamp01(1 - dist / (br * 2 + 3)); frac = relD * 0.6 * f * f; }
          // Sức phá vượt hẳn bề dày tường (phá thủng được tường dày >= 1,12 lần): khối bị chạm bay sạch, không còn gốc
          // gãy che mất nửa lỗ -> 120 mm đa năng / nổ mạnh vào tường 0,2 m thủng lỗ ~0,8-1,2 m mép lởm chởm (khối 0,74 x 0,64 m
          // + mép vỡ lan sang 4 khối kề), không còn là cái khe thấp bé tí
          over = direct && rel >= 1.25;
          // Đạn xuyên (APFSDS / luồng nổ lõm): phần phá chính là đầu xuyên, tác dụng tập trung lên khối bị chạm
          if (pierce && direct) frac = Math.max(frac, (PIERCE_FRAC[ammo] !== undefined ? PIERCE_FRAC[ammo] : 0.3) * Math.min(1, pf) * Math.min(1, Math.pow(pen / effThick, 2)) * Math.min(1, Math.pow(PIERCE_REF / effThick, 2)));
          dmg = q.hpMax * Math.min(frac, 3);
        }
        const hp0 = q.hp;
        q.hp -= dmg;
        // đạn nhỏ không xuyên nổi bề dày khối: chỉ rỗ mặt, không làm yếu kết cấu (trước đây mài được tới 20% máu: ~200 viên
        // 30 mm rồi 4 phát nổ là vỡ tường 1,5 m). Khối đã bị đạn nổ làm yếu sẵn thì đạn nhỏ không trừ thêm
        // Ngoại lệ đạn 30mm nổ-mảnh (xe 6 nòng): mỗi phát bóc ~10-15 cm bê tông, xả dồn vào một khối (~250-300 phát trúng
        // khối tường 1,5 m) thì đục dần tới vỡ — trước đây kẹt ở 80% máu nên sấy mãi tường không suy suyển. 12.7mm vẫn chỉ rỗ mặt
        const gouge = ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY';
        if (small && !canBore && !gouge) q.hp = Math.max(q.hp, Math.min(hp0, q.hpMax * 0.8));
        // Đạn xuyên (APFSDS / luồng nổ lõm) trúng thẳng khối: khoét thủng xuyên qua tường đúng chỗ chạm — chỉ khi bề dày
        // khối không vượt sức xuyên của đạn (RPG-7 ~0,9 m bê tông, tên lửa chống tăng ~1,7 m, APFSDS ~2 m)
        const punch = pierce && direct && !small && canBore && (cosI >= 0.24);
        if (punch && !q.stub && !q.bored) {
          // phát xuyên đầu tiên: lỗ thủng gọn xuyên qua khối (không gãy cụt cả khối); phát sau mới làm vỡ
          q.hp = Math.max(q.hp, 0.25);
          this.boreBlock(q, fx, x, y, z, ammo === 'AP' ? 'ke' : ammo === 'ANTI_TANK_MISSILE' ? 'heatL' : 'heat');
          this.lastPierced = true;
        }
        else if (punch && q.bored && !q.stub && canBore && effThick <= PUNCH_BREAK_MAX) {
          // Vách mỏng đã thủng lỗ: phát xuyên tiếp theo làm vách bê tông nứt vỡ toác thành mảng (vách dày: chỉ thêm lỗ hầm)
          this.breakBlock(q, fx); broke++; this.lastPierced = true;
        }
        else if (q.hp <= 0) {
          // Sức nổ dư nhiều so với độ bền khối: thổi bay cả khối, không còn gốc gãy
          if (q.hp < -q.hpMax * 0.6 || over) q.noStub = true;
          this.breakBlock(q, fx); broke++; if (punch) this.lastPierced = true;
        }
        else if (punch && !q.stub) this.lastPierced = true;
        else if (!q.cracked && !q.stub && (direct || q.hp < q.hpMax * 0.75)) {
          this.crackBlock(q, fx);
          if (!small && fx) {
            spray(fx, x, y, z, q.ax, 0.25, -q.az, { bits: 10, chunks: 3, v0: 20, v1: 60, spread: 0.85, s0: 0.15, s1: 0.4 });
            cementDust(fx, x, y, z, 0, 0, 2, 5, 12);
          }
        }
        // Xả đạn liên tục vào một chỗ: đục thủng xuyên qua khối (lỗ toác lộ cốt thép) — chỉ khi khối đủ mỏng với cỡ đạn
        else if (q.cracked && !q.stub && !q.bored && small && canBore && direct && q.hp < q.hpMax * (power < 0.2 ? 0.3 : 0.45)) this.boreBlock(q, fx, x, y, z, 'bullet');
        else if (k > 0.2 && !q.stub) q.kit.color(q.h, q.c.clone().multiplyScalar(0.6 + 0.4 * (q.hp / q.hpMax)));
      }
      if (broke) this.refreshShapes();
      this.commit();
      return broke;
    }
    // 4 khối kề cùng mặt tường (trái / phải dọc tường, dưới / trên cùng cột), kể cả khối đã mất; nhớ sẵn trên khối
    nbOf(q) {
      if (q.nb4) return q.nb4;
      const nb = { L: null, R: null, T: null, B: null }, Hq = q.m.elements[5];
      for (const n of this.blocks) {
        if (n === q || Math.abs(n.rotY - q.rotY) > 0.01) continue;
        const dx = n.x - q.x, dz = n.z - q.z, lim = q.len + n.len + 2;
        if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
        const along = dx * q.ax + dz * q.az, across = dz * q.ax - dx * q.az;
        if (Math.abs(across) > 1.5) continue;
        if (Math.abs(along) < 1.5) {
          if (Math.abs(n.y0 + n.m.elements[5] - q.y0) < 1) nb.B = n;
          else if (Math.abs(n.y0 - (q.y0 + Hq)) < 1) nb.T = n;
        } else if (Math.abs(n.y0 - q.y0) < 1 && Math.abs(Math.abs(along) - (n.len + q.len) / 2) < 2) nb[along > 0 ? 'R' : 'L'] = n;
      }
      return (q.nb4 = nb);
    }
    // Thông số mép gãy của khối (xem fractureSolid): cạnh nào vỡ, đầu cạnh nào vết vỡ chạy tiếp sang khối kề,
    // mức gốc gãy khớp với gốc gãy bên cạnh. Mọi số làm tròn -> dùng luôn làm khóa hình (đổi mới dựng lại)
    fracSpec(q) {
      const nb = this.nbOf(q), H = q.m.elements[5];
      const ug = q.x * q.ax + q.z * q.az, ac = q.z * q.ax - q.x * q.az;
      const has = s => !!(q.bites && q.bites.has(s)) || (s === 'T' && q.stub);
      const ends = { L: ['B', 'T'], R: ['B', 'T'], T: ['L', 'R'], B: ['L', 'R'] }, SEED = { L: 11, R: 23, T: 37, B: 53 };
      const r2 = v => Math.round(v * 100) / 100;
      const E = {};
      for (const s of ['L', 'R', 'T', 'B']) {
        if (!has(s) || (q.stub && s === 'B')) continue;
        const vert = s === 'L' || s === 'R';
        const line = vert ? ug + (s === 'L' ? -0.5 : 0.5) * q.len : q.y0 + (s === 'B' ? 0 : H);
        const e = { s: r2(line * 0.731 + ac * 0.173 + SEED[s]), w0: r2(vert ? q.y0 : ug - q.len / 2) };
        if (s === 'T' && q.stub) {
          // gốc gãy: mức gãy trung bình theo khối, 2 đầu khớp với gốc gãy kề bên / vươn cao dần về phía khối còn lành
          e.m = 't'; e.lv = r2(q.h0frac);
          const lvl = n => !n ? e.lv : !n.alive ? e.lv - 0.08 : n.stub ? (e.lv + n.h0frac) / 2 : Math.min(0.9, e.lv + 0.28);
          e.l0 = r2(lvl(nb.L)); e.l1 = r2(lvl(nb.R));
        } else {
          const open = k => { const es = ends[s][k]; if (has(es)) return 1; const n = nb[es]; return n && (!n.alive || (n.bites && n.bites.has(s))) ? 1 : 0; };
          e.o0 = open(0); e.o1 = open(1);
          if (vert) { const f = nb[s]; if (f && f.alive && f.stub) e.f0 = r2(f.h0frac - 0.05); }
        }
        E[s] = e;
      }
      return E;
    }
    // Dựng lại hình khối vỡ khi trạng thái của nó / khối kề đổi
    shapeBlock(q) {
      if (!q.alive || q.bored) return;
      const E = this.fracSpec(q), sides = Object.keys(E);
      if (!sides.length) return;
      const key = (q.cracked ? 'k' : 'c') + JSON.stringify(E);
      if (q.shapeKey === key && q.h) return;
      q.shapeKey = key;
      const kit = q.cracked || q.stub ? this.kitK : this.kitC;
      if (q.h) q.kit.hide(q.h);
      q.kit = kit;
      const col = q.c.clone().multiplyScalar(q.stub ? 0.85 : q.cracked ? 0.92 : 1);
      const type = q.stub ? 'remnant' : 'bite' + sides.join('');
      if (kit.nCustom < kit.maxCustom) {
        const geo = fractureSolid(q.len, q.m.elements[5], q.thick, E);
        q.h = kit.addCustom(geo, q.m, col, false, vcMat(q.stub ? kit.brokenMat : kit.intactMat));
        q.h.type = type;
      } else {
        // quá nhiều khối vỡ: quay về vài mẫu hình dùng chung
        q.h = kit.add(type, q.m, col);
        kit.commit();
      }
    }
    refreshShapes() {
      for (const q of this.blocks) if (q.alive && !q.bored && (q.stub || q.bitten)) this.shapeBlock(q);
    }
    // Khoét thủng xuyên khối bê tông đúng chỗ đạn chạm (cỡ lỗ thật, 8 đv = 1 m; tường 0,2 m):
    //  ke    : mũi tên APFSDS 120 mm: lỗ vào gọn Ø ~11-14 cm (vảy bong quanh miệng Ø ~15-20 cm), mặt sau bê tông bong mảng
    //          (scabbing) thành phễu rộng Ø ~45-70 cm sâu quá nửa bề dày, lộ lưới thép
    //  heat  : đầu nổ lõm RPG: lòng lỗ Ø ~15-20 cm, miệng vào cháy rỗ Ø ~30-45 cm, mặt sau bong mảng Ø ~35-55 cm
    //  heatL : tên lửa chống tăng (đầu nổ kép lớn): lòng lỗ Ø ~21-28 cm, miệng vào Ø ~40-60 cm, mặt sau bong Ø ~50-70 cm
    //  bullet: xả đạn đục dần -> miệng vào toác rộng nhất, lộ lưới thép
    boreBlock(q, fx, x, y, z, kind) {
      q.bored = true;
      q.cracked = true;
      q.kit.hide(q.h);
      q.kit = this.kitK;
      const col = q.c.clone().multiplyScalar(0.88);
      if (x === undefined) {
        q.h = this.kitK.add('holed', q.m, col);
      } else {
        const L = this.localOf(q, x, y, z);
        const H = q.m.elements[5] || (q.y1 - q.y0);
        // bán kính lòng lỗ (đơn vị game) và tỉ lệ miệng vào / miệng ra so với lòng lỗ
        const P = { ke: [0.42, 0.55, 1.25, 1.5, 4.2, 5.2], heat: [0.6, 0.8, 1.8, 2.2, 2.3, 2.8], heatL: [0.85, 1.1, 1.8, 2.2, 2.2, 2.6], bullet: [0.9, 1.25, 1.7, 2.1, 1.2, 1.5] }[kind] || [0.9, 1.25, 1.7, 2.1, 1.2, 1.5];
        const core = rand(P[0], P[1]), kIn = rand(P[2], P[3]), kOut = rand(P[4], P[5]);
        const rx = core / q.len, ry = core / H;
        // đạn đến từ phía mặt +w hay -w của khối -> miệng vào nằm ở mặt đó
        const fromPlus = L.w >= 0;
        // tâm lỗ đúng chỗ chạm, chỉ co vào khi sát mép khối (lòng lỗ không cắt ra ngoài khối)
        const mx = Math.max(0.12, 0.44 - rx * 1.3), my = Math.max(0.12, 0.44 - ry * 1.3);
        const cx = Math.max(-mx, Math.min(mx, L.u)), cy = Math.max(-my, Math.min(my, L.v));
        // mũi tên động năng: eo lỗ lệch về mặt vào -> phễu bong mảng mặt sau sâu ~65% bề dày
        const zMid = kind === 'ke' ? (fromPlus ? 0.15 : -0.15) : undefined;
        const geo = boreGeo(cx, cy, rx, ry, fromPlus ? kIn : kOut, fromPlus ? kOut : kIn, zMid);
        // lưới thép 2 lớp lộ ra trong lòng lỗ / phễu bong mảng (đạn cắt đứt vài thanh, phần còn lại vắt ngang lỗ)
        q.h = this.kitK.addCustom(geo, q.m, col, true);
      }
      if (fx && fx.removeMarksNear) fx.removeMarksNear(x !== undefined ? x : q.x, y !== undefined ? y : (q.y0 + q.y1) / 2, z !== undefined ? z : q.z, 2.5);
      if (x !== undefined) this.boreDebris(q, fx, x, y, z, kind);
      else chunks(fx, q.x, (q.y0 + q.y1) / 2, q.z, 2, 1.2);
      sfx('concrete', q.x, (q.y0 + q.y1) / 2, q.z, 0.6);
      this.commit();
    }
    // Mảnh vỡ của lỗ xuyên: miệng vào bóc vảy bật ngược về phía bắn, mặt sau bê tông toác phụt thành chùm theo hướng đạn
    // (đạn động năng / nổ lõm: mặt sau văng mạnh nhất; xả đạn nhỏ: chủ yếu vụn ở miệng vào). Sạn rơi dưới chân 2 bên đúng chỗ lỗ
    boreDebris(q, fx, x, y, z, kind) {
      const L = this.localOf(q, x, y, z), inS = L.w >= 0 ? 1 : -1;   // mặt đạn vào: +w / -w
      const nX = -q.az * inS, nZ = q.ax * inS;                       // hướng ra khỏi mặt vào (về phía bắn)
      const al = L.u * q.len, ex = q.x + q.ax * al, ez = q.z + q.az * al;
      const bullet = kind === 'bullet', ke = kind === 'ke', big = kind === 'heatL';
      const back = bullet ? 0.3 : 1;
      const W = q.thick / 2 + 0.3;
      // Mặt sau: bê tông bong mảng (sóng ứng suất phản xạ) phụt thành chùm nón theo hướng đạn — sạn bay 8-45 m/s,
      // mảnh to chậm hơn nhiều; mũi tên động năng chùm hẹp & nhanh nhất
      spray(fx, ex - nX * W, y, ez - nZ * W, -nX, 0.05, -nZ, {
        bits: bullet ? 8 : ke ? 28 : big ? 26 : 20, chunks: bullet ? 2 : big ? 7 : ke ? 6 : 5,
        v0: bullet ? 25 : 60, v1: bullet ? 120 : ke ? 360 : 280, spread: ke ? 0.55 : 0.75, s0: 0.16, s1: bullet ? 0.3 : 0.5 });
      // Mặt trước: vảy bê tông quanh miệng lỗ bật ngược về phía bắn (chậm, toả rộng)
      spray(fx, ex + nX * W, y, ez + nZ * W, nX, 0.2, nZ, { bits: ke ? 6 : 10, chunks: ke ? 0 : 1 + (big ? 1 : 0), v0: 15, v1: ke ? 60 : 110, spread: 0.95, s0: 0.14, s1: 0.32 });
      // Bụi xi măng: đám lớn phụt ra mặt sau rồi lơ lửng, đám nhỏ ở miệng vào
      cementDust(fx, ex - nX * W, y, ez - nZ * W, -nX, -nZ, Math.round(2 + 3 * back), 4.5, 10 + 24 * back);
      cementDust(fx, ex + nX * W, y, ez + nZ * W, nX, nZ, 2, 3.5, 8);
      // Sạn rơi dưới chân 2 bên đúng chỗ lỗ: vị trí nằm cuối tính bằng RNG có hạt giống (như cũ), hình ảnh thì rơi thật
      // từ miệng lỗ xuống (không hiện sẵn dưới đất)
      const gy = q.groundY !== undefined ? q.groundY : q.y0 + 2, hF = Math.max(0, y - gy);
      for (let i = 0, n = bullet ? 4 : 6; i < n; i++) {
        const exitSide = RNG() < (bullet ? 0.35 : 0.7), sd = exitSide ? -1 : 1;
        const off = W + rand(0.2, 1) * (exitSide ? 2 + 4 * back + hF * 0.25 : 1 + hF * 0.12), a = al + rand(-1.5, 1.5);
        const s = rand(0.45, 1.1) * (exitSide ? 1 : 0.8);
        const E = new THREE.Vector3(q.x + q.ax * a + nX * sd * off, gy + s * 0.2, q.z + q.az * a + nZ * sd * off);
        const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))), Sc = new THREE.Vector3(s * 1.2, s * 0.8, s);
        const bi = this.rubblePool.add(new THREE.Matrix4().compose(E, Q, Sc), new THREE.Color(...this.debrisCol).multiplyScalar(rand(0.74, 1.04)));
        const a0 = al + vr(-0.6, 0.6);
        this.launch(fx, this.rubblePool, bi, E, Q, Sc, new THREE.Vector3(q.x + q.ax * a0 + nX * sd * W, y + vr(-0.6, 0.6), q.z + q.az * a0 + nZ * sd * W),
          { vy: exitSide ? vr(0, 8) * back : vr(0, 4), e: 0.3, turns: vr(1, 2.5), delay: vr(0, 0.04) });
      }
    }
    // ---- Mảnh đống vụn rơi theo đúng trọng lực: mảnh của đống vụn chân tường không hiện sẵn dưới đất mà bật ra từ chỗ
    // vỡ, bay theo đường đạn đạo (g = 78,5 đv/s² = 9,81 m/s²), lộn nhào, đập đất nảy một nhịp rồi nằm ĐÚNG chỗ đã định.
    // Chỗ nằm cuối & ụ vụn cho xe vẫn tính bằng RNG có hạt giống như cũ -> đồng bộ mạng không đổi; hoạt cảnh chỉ là hình
    // ảnh (Math.random), chạy theo nhịp ExplosionFX (không có hệ hiệu ứng thì mảnh nằm sẵn ở chỗ cuối như trước).
    // E / quat / scl: vị trí, hướng, cỡ cuối; S: điểm bật ra; o: { vy (vận tốc đứng lúc bật ra), e (hệ số nảy), turns, delay, puff }
    launch(fx, pool, idx, E, quat, scl, S, o) {
      if (idx < 0 || !fx || !fx.addTicker) return;
      if (S.y < E.y) S.y = E.y;   // điểm bật ra không thấp hơn chỗ nằm (khối chôn chân dưới mặt đất)
      const G = 78.5, vy0 = o.vy || 0, h = S.y - E.y;
      const T = Math.max(0.05, (vy0 + Math.sqrt(vy0 * vy0 + 2 * G * h)) / G);   // thời gian bay tới lúc chạm đất lần đầu
      const vyB = (G * T - vy0) * (o.e || 0.2);                                 // vận tốc nảy lên sau cú chạm
      const Tb = 2 * vyB / G, mu = 0.4;                                          // nhịp nảy; sau va chạm còn 40% trớn ngang
      const den = T + mu * Tb;
      const F = {
        pool, idx, sx: S.x, sy: S.y, sz: S.z, vx: (E.x - S.x) / den, vy: vy0, vz: (E.z - S.z) / den, T, Tb, vyB, mu, E: E.clone(),
        q1: quat.clone(), s: scl.clone(), ax: new THREE.Vector3(vr(-1, 1), vr(-1, 1), vr(-1, 1)).normalize(),
        th0: (o.turns || 1) * 6.283 * (Math.random() < 0.5 ? -1 : 1), t: -(o.delay || 0), puff: !!o.puff, landed: false
      };
      if (!F.ax.lengthSq()) F.ax.set(0, 1, 0);
      (this.flying || (this.flying = [])).push(F);
      this.poseFlying(F);   // ngay khung đầu: mảnh còn ở chỗ vỡ, chưa nằm dưới đất
      if (!this._ticking) {
        this._ticking = true;
        fx.addTicker(dt => { const on = this.stepFlying(dt, fx); if (!on) this._ticking = false; return on; });
      }
    }
    poseFlying(F) {
      const M = this._fm || (this._fm = new THREE.Matrix4()), P = this._fp || (this._fp = new THREE.Vector3());
      const Q = this._fq || (this._fq = new THREE.Quaternion()), Rq = this._fr || (this._fr = new THREE.Quaternion());
      const t = Math.max(0, F.t), g2 = 78.5 / 2;
      let th;
      if (t < F.T) {
        // bay: đường đạn đạo, lộn nhào đều
        P.set(F.sx + F.vx * t, F.sy + F.vy * t - g2 * t * t, F.sz + F.vz * t);
        th = F.th0 * (0.2 + 0.8 * (1 - t / F.T));
      } else {
        // nảy một nhịp thấp, trượt nốt chút trớn rồi nằm
        const tb = Math.min(F.Tb, t - F.T), k = F.T + F.mu * tb;
        P.set(F.sx + F.vx * k, F.E.y + F.vyB * tb - g2 * tb * tb, F.sz + F.vz * k);
        th = F.th0 * 0.2 * (1 - tb / Math.max(1e-3, F.Tb));
      }
      Q.copy(F.q1).multiply(Rq.setFromAxisAngle(F.ax, th));
      F.pool.set(F.idx, M.compose(P, Q, F.s));
    }
    stepFlying(dt, fx) {
      const L = this.flying;
      if (!L || !L.length) return false;
      const M = this._fm || (this._fm = new THREE.Matrix4());
      let n = 0;
      for (const F of L) {
        F.t = dt === Infinity ? 1e9 : F.t + dt;
        // tảng to đập đất: tung một nhúm bụi thấp sát đất
        if (F.puff && !F.landed && F.t >= F.T && dt !== Infinity) {
          F.landed = true;
          if (fx && fx.smoke) {
            const r = Math.max(F.s.x, F.s.z);
            fx.smoke.add({ x: F.E.x, y: F.E.y, z: F.E.z, vx: F.vx * 0.2, vy: vr(1, 3), vz: F.vz * 0.2, size: r * vr(1.4, 2.2), grow: r * 1.5,
              drag: 2, grav: -0.2, life: vr(1.8, 3), alpha: 0.42, fadeIn: 0.04, fadePow: 1.5, c0: [0.74, 0.72, 0.68], cell: 2 });
          }
        }
        if (F.t >= F.T + F.Tb) { F.pool.set(F.idx, M.compose(F.E, F.q1, F.s)); continue; }
        this.poseFlying(F);
        L[n++] = F;
      }
      L.length = n;
      return n > 0;
    }
    crackBlock(q, fx) {
      q.cracked = true;
      if (!q.bored && (q.stub || q.bitten)) { this.shapeBlock(q); return; }
      if (q.h && q.h.custom) {
        // hình vỡ riêng: giữ nguyên dáng, chỉ đổi sang mặt bê tông nứt
        q.h.pool.mesh.material = this.kitK.intactMat;
        q.kit = this.kitK;
        q.kit.color(q.h, q.c.clone().multiplyScalar(0.92));
        return;
      }
      // giữ hình dạng hiện có (lành / sứt mép) nhưng đổi sang mặt bê tông nứt toác
      const type = q.h ? q.h.type : 'box';
      this.kitC.hide(q.h);
      q.kit = this.kitK;
      q.h = this.kitK.add(type === 'remnant' ? 'remnant' : type, q.m, q.c.clone().multiplyScalar(0.92));
      this.commit();
      void fx;
    }
    // Mảnh vỡ theo đúng thể tích bê tông bị phá: ~35% nằm lại thành đống vụn chân tường, ~12% văng bay, còn lại thành bụi.
    // Đống vụn chia cỡ như bê tông nổ vỡ thật: 1-2 tảng lớn (dẹt, nằm nghiêng gần chân tường), vài mảnh vừa góc cạnh,
    // nhiều sạn / cục nhỏ văng xa hơn. Tảng lớn & vừa thành ụ vụn xe bò lên được (VehicleCollision.blockDebris)
    // yLo..yHi: dải chiều cao phần bê tông vừa bị phá (mảnh bật ra từ đó)
    debrisFor(q, vol, fx, yLo, yHi) {
      if (yLo === undefined) { yLo = q.y0; yHi = q.y1; }
      const yc = (yLo + yHi) / 2;
      const gy = q.groundY !== undefined ? q.groundY : q.y0 + 2;
      const Vr = vol * 0.35, sMax = Math.min(q.len, q.thick, q.m.elements[5]) * 0.7;
      const nBig = vol > 300 ? 2 : 1, nMid = vol > 120 ? 6 : 4, nSmall = vol > 120 ? 16 : 10;
      // Phía đống vụn đổ nhiều hơn: sóng nổ thổi bê tông về phía sau tường (xa điểm nổ), càng gần điểm nổ càng văng xa;
      // khối đổ do mất chân đỡ (xa điểm nổ) thì rơi gần như thẳng xuống, chia đều 2 bên
      let far = RNG() < 0.5 ? 1 : -1, kick = 0;
      const Bl = this._blast;
      if (Bl) {
        const acr = (Bl.z - q.z) * q.ax - (Bl.x - q.x) * q.az;
        kick = clamp01(1 - Math.hypot(Bl.x - q.x, Bl.y - yc, Bl.z - q.z) / (Bl.R + 4));
        if (Math.abs(acr) > q.thick * 0.3) far = acr > 0 ? -1 : 1;
        else kick *= 0.3;   // nổ ngay trên đỉnh / trong lòng tường: không có phía rõ ràng
      }
      const pFar = 0.5 + 0.25 * kick;
      const bumps = this.debrisBumps || (this.debrisBumps = []);
      // cls: 0 tảng lớn / 1 mảnh vừa / 2 sạn. Hình ảnh: mảnh bật ra từ phần vừa vỡ, rơi theo trọng lực xuống đúng chỗ nằm;
      // phía sóng nổ thổi (far) bị hất mạnh hơn, mảnh nhỏ hất cao hơn mảnh to; khối đổ vì mất chân đỡ thì sụp thẳng xuống
      const put = (pool, sx, sy, sz, reach, flat, bump, cls) => {
        const isFar = RNG() < pFar, side = isFar ? far : -far;
        const off = q.thick * 0.32 + rand(0, reach * (isFar ? 1 + 1.2 * kick : 1 - 0.4 * kick)) * Math.max(q.thick, 4), al = rand(-0.6, 0.6) * q.len;
        const bp = new THREE.Vector3(q.x + q.ax * al - q.az * side * off, gy + sy * (flat ? 0.3 : 0.22), q.z + q.az * al + q.ax * side * off);
        const rot = flat ? new THREE.Euler(rand(-0.4, 0.4), rand(0, 6.28), rand(-0.4, 0.4)) : new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3));
        const quat = new THREE.Quaternion().setFromEuler(rot), scl = new THREE.Vector3(sx, sy, sz);
        const bi = pool.add(new THREE.Matrix4().compose(bp, quat, scl), new THREE.Color(...this.debrisCol).multiplyScalar(rand(0.74, 1.04)));
        if (bi >= 0 && bump) bumps.push({ x: bp.x, z: bp.z, r: Math.max(sx, sz) * 0.5, base: gy, top: gy + sy * 0.75 });
        if (bi < 0 || !fx) return;
        const aS = Math.max(-0.45, Math.min(0.45, al / q.len * vr(0.6, 1))) * q.len, w = q.thick * vr(0.1, 0.5) * side;
        const S = new THREE.Vector3(q.x + q.ax * aS - q.az * w, vr(yLo, Math.max(yLo, yHi - Math.min(sx, sy, sz) * 0.4)), q.z + q.az * aS + q.ax * w);
        const blow = kick > 0.1 ? kick * (isFar ? 1 : 0.4) : 0;
        this.launch(fx, pool, bi, bp, quat, scl, S, {
          vy: vr(-1, 2) + blow * (cls === 0 ? vr(0, 6) : cls === 1 ? vr(2, 12) : vr(4, 22)),
          e: cls === 0 ? 0.12 : cls === 1 ? 0.2 : 0.3, turns: cls === 0 ? vr(0.2, 0.6) : cls === 1 ? vr(0.5, 1.3) : vr(1, 3),
          delay: kick > 0.1 ? vr(0, 0.05) : vr(0.03, 0.25), puff: cls < 2
        });
      };
      for (let i = 0; i < nBig; i++) {
        const s = Math.min(sMax, Math.cbrt(Vr * 0.45 / nBig / 0.7)) * rand(0.85, 1.15);
        put(this.chunkPool, s * 1.35, s * 0.5, s * 1.05, 0.5, true, true, 0);
      }
      for (let i = 0; i < nMid; i++) {
        const s = Math.min(sMax * 0.6, Math.cbrt(Vr * 0.33 / nMid / 0.7)) * rand(0.7, 1.3);
        put(this.chunkPool, s * 1.1, s * rand(0.6, 0.9), s * 0.9, 0.9, RNG() < 0.5, true, 1);
      }
      for (let i = 0; i < nSmall; i++) {
        const s = Math.cbrt(Vr * 0.22 / nSmall / 0.35) * rand(0.55, 1.4);
        put(this.rubblePool, s * 1.2, s * 0.8, s, 1.6, false, false, 2);
      }
      // Mảnh văng bay xa (ngoài đống vụn): vận tốc thật theo sức nổ — sạn 4-45 m/s, mảnh to chậm hơn; nhiều sạn nhỏ, ít mảnh to
      const dc = this.debrisCol.map(v => v * 0.97), fxX = -q.az * far, fxZ = q.ax * far;
      const sv = Math.sqrt(vol), sBig = Math.min(1.0, 0.22 + Math.cbrt(vol) * 0.035), nD = Math.min(4, Math.round(vol / 300));
      if (kick > 0.1) {
        // phụt theo hướng sóng nổ (ra phía sau tường), ít mảnh bóc lở bật ngược về phía điểm nổ
        spray(fx, q.x, yc, q.z, fxX, 0.25, fxZ, { bits: Math.min(36, Math.round(10 + sv * 2.5)), chunks: Math.min(10, Math.round(3 + sv * 0.4)),
          v0: 30 + 40 * kick, v1: 120 + 240 * kick, spread: 0.8, s0: 0.2, s1: sBig, col: dc });
        spray(fx, q.x, yc, q.z, -fxX, 0.35, -fxZ, { bits: 6, chunks: 1, v0: 15, v1: 60 + 60 * kick, spread: 0.9, s0: 0.2, s1: sBig * 0.7, col: dc });
        cementDust(fx, q.x, yc, q.z, fxX, fxZ, 3 + nD, 7 + Math.min(10, Math.cbrt(vol) * 0.8), 18 + 26 * kick, dc);
      } else {
        // mất chân đỡ, đổ sụp: vỡ vụn rơi gần như thẳng xuống, ít mảnh văng, chậm
        spray(fx, q.x, yc, q.z, fxX * 0.3, 0.5, fxZ * 0.3, { bits: 8, chunks: 2, v0: 5, v1: 40, spread: 1.1, s0: 0.2, s1: sBig, col: dc });
      }
      // đám bụi lơ lửng quanh chỗ vỡ + bụi cuộn sát chân tường khi đống vụn đổ xuống
      cementDust(fx, q.x, yc, q.z, 0, 0, 2 + nD, 8 + Math.min(10, Math.cbrt(vol) * 0.8), 10, dc);
      cementDust(fx, q.x, gy + 1.5, q.z, 0, 0, 2 + Math.min(2, nD), 6 + Math.min(8, Math.cbrt(vol) * 0.6), 14, dc);
    }

    breakBlock(q, fx) {
      const yc = (q.y0 + q.y1) / 2;
      // vết nổ / vết đạn dán trên mặt khối vừa mất (trước đây lấy nhầm q.h — tay cầm instance, không phải chiều cao —
      // nên bán kính ra NaN, vết muội cứ lơ lửng giữa không trung chỗ lỗ thủng)
      if (fx && fx.removeMarksNear) fx.removeMarksNear(q.x, yc, q.z, Math.max(q.len, q.m.elements[5] || (q.y1 - q.y0)) * 0.75);
      // khối đã thủng lỗ bị phá: thôi là khối lỗ, gốc gãy (nếu còn) dựng lại hình như khối thường
      if (q.bored) { q.bored = false; q.shapeKey = null; }
      const oldTop = q.y1;
      // Gốc gãy chỉ còn lại khi chân khối tựa trên nền / khối lành bên dưới; khối treo trên lỗ vỡ thì đổ hết,
      // không để lại dải bê tông lơ lửng có cốt thép chĩa lên
      if (!q.stub && !q.noStub && this.supported(q)) {
        // Vỡ lần đầu: còn trơ gốc gãy răng cưa lòi cốt thép (vẫn che được thân dưới xe)
        // hình gốc gãy dựng ở refreshShapes (sau khi cả chuỗi vỡ lan xong, để khớp mép với khối kề)
        q.kit.hide(q.h);
        q.h = null;
        q.kit = this.kitK;
        q.stub = true;
        q.y1 = q.y0 + q.h0frac * (oldTop - q.y0);
        q.hp = q.hpMax * 0.35;
        this.biteNeighbours(q, oldTop);
      } else {
        q.alive = false;
        q.kit.hide(q.h);
        q.h = null;
        // gốc gãy mất nốt: lúc này khối ngay dưới mới lộ mép trên
        this.biteNeighbours(q, oldTop, !!q.bitDone);
      }
      // Thể tích bị phá: lần đầu = phần trên gốc gãy, lần sau = phần gốc còn lại
      const vol = q.len * q.thick * Math.max(0, oldTop - q.y1 + (q.alive ? 0 : q.y1 - q.y0));
      this.debrisFor(q, Math.max(8, vol), fx, q.alive ? q.y1 : q.y0, oldTop);
      sfx('concrete', q.x, yc, q.z, 1);
      // Khối chồng bên trên mất chân đỡ: bê tông cốt thép liền khối -> còn khối lành kề bên cùng hàng thì
      // treo lại nhờ thép (nứt toác), chỉ đổ khi cả vùng xung quanh đã bị khoét cạn
      for (const o of this.blocks) {
        if (!o.alive || o === q) continue;
        if (Math.hypot(o.x - q.x, o.z - q.z) < 1.5 && o.y0 >= oldTop - 1) {
          // Gốc gãy bên trên mất chỗ tựa: cụt cả hai đầu thì không thép nào giữ nổi -> rơi xuống đống vụn
          if (o.stub) { if (!this.supported(o)) { o.noStub = true; this.breakBlock(o, fx); } continue; }
          if (this.hangs(o)) { if (!o.cracked) this.crackBlock(o, fx); continue; }
          o.noStub = true; this.breakBlock(o, fx);
        }
      }
      // Khối kề đỡ khối treo cũng có thể vừa mất chân: soát lại cả kết cấu (phá hết hàng dưới -> hàng trên đổ hết)
      this.settle(fx);
    }
    // Khối mất chân đỡ chỉ treo được nhờ thép khi có khối lành kề bên cùng hàng mà chính khối đó còn chân đỡ
    // (công-xôn 1 khối, như lanh-tô trên khe bắn) — không cho cả hàng treo vào nhau giữa không trung
    hangs(o) {
      return this.blocks.some(n => n !== o && n.alive && !n.stub && Math.abs(n.y0 - o.y0) < 1 && Math.abs(n.rotY - o.rotY) < 0.01 &&
        Math.abs(Math.hypot(n.x - o.x, n.z - o.z) - (n.len + o.len) / 2) < 2 && this.supported(n));
    }
    // Lặp tới khi ổn định: khối không chân đỡ & không treo được thì đổ (gốc gãy không chân đỡ cũng đổ)
    settle(fx) {
      if (this._settling) return;
      this._settling = true;
      for (let pass = 0; pass < 40; pass++) {
        let changed = false;
        for (const o of this.blocks) {
          if (!o.alive || this.supported(o)) continue;
          if (!o.stub && this.hangs(o)) continue;
          o.noStub = true; this.breakBlock(o, fx); changed = true;
        }
        if (!changed) break;
      }
      this._settling = false;
    }
    // Chân khối có tựa trên nền đất hoặc trên mặt một khối còn lành ngay bên dưới không
    supported(q) {
      if (q.groundY === undefined || q.y0 <= q.groundY + 2.5) return true;
      return this.blocks.some(n => n !== q && n.alive && !n.stub && Math.abs(n.y1 - q.y0) < 1 && Math.hypot(n.x - q.x, n.z - q.z) < 1.5);
    }
    // Vết vỡ lan sang khối kề: khối hai bên sứt mép cạnh giáp, khối dưới sứt mép trên, khối treo phía trên sứt mép dưới
    // -> lỗ vỡ trên tường loang lổ theo nhiều khối, không thành ô cửa vuông vắn đúng một khối
    // (chỉ ghi nhận cạnh vỡ; hình dựng lại ở refreshShapes). belowOnly: gốc gãy vừa mất -> chỉ khối dưới bị lộ mép trên
    biteNeighbours(q, top, belowOnly) {
      q.bitDone = true;
      const qTop = top !== undefined ? top : q.y1;
      const stubbed = q.alive && q.stub;   // gốc gãy còn đè lên khối dưới -> mép trên khối dưới chưa lộ
      const addBite = (n, side) => {
        n.bites = n.bites || new Set();
        if (n.bites.has(side)) return;
        n.bites.add(side);
        n.bitten = true;
      };
      for (const n of this.blocks) {
        if (n === q || !n.alive || n.stub || n.bored) continue;
        if (Math.abs(n.rotY - q.rotY) > 0.01) continue;
        const dx = q.x - n.x, dz = q.z - n.z;
        const along = dx * n.ax + dz * n.az;
        const sameCol = Math.hypot(dx, dz) < 1.5;
        if (sameCol) {
          if (Math.abs(n.y1 - q.y0) < 1) { if (!stubbed) addBite(n, 'T'); }               // khối ngay dưới
          else if (!belowOnly && Math.abs(n.y0 - qTop) < 1) addBite(n, 'B');            // khối treo ngay trên
          continue;
        }
        if (belowOnly || Math.abs(n.y0 - q.y0) > 1) continue;
        if (Math.abs(Math.abs(along) - n.len) > 2 || Math.hypot(dx - along * n.ax, dz - along * n.az) > 2) continue;
        addBite(n, along > 0 ? 'R' : 'L');
      }
    }
  }

  // ===========================================================================
  // BOONG-KE BÊ TÔNG CỐT THÉP
  // ===========================================================================
  // Hệ cục bộ: trục f hướng cửa mở (cos a, sin a), trục r vuông góc. Lòng hầm dài 72 x rộng 58.
  const BK = { L: 72, Wd: 58, T: 12, Hfull: 32, Hfront: 20, roofY: 32, roofT: 6, coverF: 8, block: 14 };

  class BunkerSet {
    constructor(parent, list, groundAt) {
      this.group = new THREE.Group();
      this.group.name = 'bunkers';
      this.group.userData.wallThick = BK.T;   // ExplosionFX.impactSurface: mặt sau tường boong-ke dày 1,5 m
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.S = new BlockStructure(this.group, list.length * 60 + 10);
      this.S.debrisCol = [0.5, 0.47, 0.43];   // boong-ke bê tông cũ sẫm, loang gỉ: vụn cùng tông (không trắng như đá rải)
      const unit = new THREE.BoxGeometry(1, 1, 1);
      // phong hoá (weathering.js): bê tông ố vệt mưa, rêu đọng; bao cát phủ mái bạc màu, bùn ố (khối không gốc ở chân
      // -> không tính bùn chân theo độ cao)
      const WXb = (m, p, o) => typeof Weathering !== 'undefined' ? Weathering.apply(m, p, o) : m;
      const conc = WXb(new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92, metalness: 0.02 }), 'concrete', { grime: 0, lift: 30 });
      this.roofPool = new Pool(this.group, unit, conc, list.length * 12, { color: true });
      const bag = jitter(new THREE.SphereGeometry(0.5, 8, 5), 0.12, 2);
      this.bagPool = new Pool(this.group, bag, WXb(new THREE.MeshStandardMaterial({ map: sandbagTex(), roughness: 1 }), 'soil', { grime: 0, fade: 0.5, stain: 0.7, moss: 0.4, lift: 30 }), list.length * 200, { color: true });
      for (const b of list) this.items.push(this.buildOne(b));
      this.S.commit();
      [this.roofPool, this.bagPool].forEach(p => p.commit());
    }

    buildOne(b) {
      const gy = this.groundAt(b.x, b.z);
      const a = b.openAngle;
      const f = { x: Math.cos(a), z: Math.sin(a) }, r = { x: -Math.sin(a), z: Math.cos(a) };
      const W = (lf, lr) => ({ x: b.x + f.x * lf + r.x * lr, z: b.z + f.z * lf + r.z * lr });
      // Góc quay để trục +X cục bộ của khối chạy dọc tường: dọc theo r (tường hậu) / dọc theo f (tường hông)
      const rotAlongR = Math.atan2(-r.z, r.x), rotAlongF = Math.atan2(-f.z, f.x);
      const K = { x: b.x, z: b.z, y: gy, openAngle: a, f, r, blocks: [], roofs: [], roofed: b.roofed !== false, side: b.side };
      const addBlock = (lf, lr, ly, len, thick, h, wall, alongF) => {
        const p = W(lf, lr);
        const gyl = Math.min(gy, this.groundAt(p.x, p.z));
        const q = this.S.addBlock({ x: p.x, z: p.z, y0: gyl - 2 + ly, h, len, thick, rotY: alongF ? rotAlongF : rotAlongR, wall, lf, lr, hp: 7.0, groundY: gyl });
        q.h0frac = rand(0.35, 0.6);
        q.K = K;
        K.blocks.push(q);
        return q;
      };
      const { L, Wd, T, Hfull, Hfront, coverF, block } = BK;
      // Tường hậu (quay về phía địch) cao hết cỡ, có khe bắn
      const backF = -L / 2 - T / 2;
      for (let lr = -Wd / 2 - T; lr < Wd / 2 + T - 0.1; lr += block) {
        const c = lr + block / 2;
        addBlock(backF, c, 0, block, T, 21, 'back', false);
        addBlock(backF, c, 25, block, T, Hfull - 25 + 2, 'back', false);
        if (Math.abs(c) > 10) addBlock(backF, c, 21, block, T, 4, 'back', false);
      }
      // 2 tường hông: phần dưới mái cao hết cỡ, phần trước thấp (tường chắn che thân xe)
      for (const s of [-1, 1]) {
        const lr = s * (Wd / 2 + T / 2);
        for (let lf = -L / 2; lf < L / 2 - 0.1; lf += block) {
          const c = lf + block / 2;
          addBlock(c, lr, 0, block, T, c < coverF ? Hfull + 2 : Hfront, 'side', true);
        }
        for (let k = 0; k < 10; k++) {
          const p = W(L / 2 + 3 + rand(-1, 1), lr + rand(-5, 5));
          const ym = this.groundAt(p.x, p.z) + 1 + (k % 3) * 2.2;
          this.bagPool.add(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ym, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAlongF + rand(-0.3, 0.3)), new THREE.Vector3(5, 2.2, 3)), new THREE.Color(1, 1, 1).multiplyScalar(rand(0.8, 1.05)));
        }
      }
      // Mái đổ bê tông dày + lớp bao cát phủ trên
      if (K.roofed) {
        const f0 = -L / 2 - T, f1 = coverF;
        for (let lf = f0; lf < f1 - 0.1; lf += 12) {
          const len = Math.min(12, f1 - lf);
          const p = W(lf + len / 2, 0);
          const ry = gy - 2 + BK.roofY + 2;
          const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, ry + BK.roofT / 2, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAlongR), new THREE.Vector3(Wd + 2 * T + 2, BK.roofT, len));
          const c = new THREE.Color(1, 1, 1).multiplyScalar(rand(0.82, 0.95));
          const bags = [];
          for (let k = 0; k < 12; k++) {
            const q = W(lf + rand(0, len), rand(-Wd / 2 - T, Wd / 2 + T));
            bags.push(this.bagPool.add(new THREE.Matrix4().compose(new THREE.Vector3(q.x, ry + BK.roofT + 1, q.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAlongR + rand(-0.4, 0.4)), new THREE.Vector3(5, 2, 3)), new THREE.Color(0.9, 0.88, 0.78).multiplyScalar(rand(0.85, 1.05))));
          }
          K.roofs.push({ lf: lf + len / 2, len, y0: ry, y1: ry + BK.roofT, m, c, hp: 16, alive: true, idx: this.roofPool.add(m, c), bags });
        }
      }
      K.fort = {
        x: b.x, z: b.z, openAngle: a, armRadius: Wd / 2 + 12, armLength: L / 2 + 12, wallThickness: T, wallHeight: Hfull + 6,
        outerRadius: Math.hypot(L / 2 + T, Wd / 2 + T) + 4, ref: K,
        get wallBlocks() { return K.blocks.filter(q => q.alive); }
      };
      return K;
    }

    local(K, x, z) {
      const dx = x - K.x, dz = z - K.z;
      return { f: dx * K.f.x + dz * K.f.z, r: dx * K.r.x + dz * K.r.z };
    }

    // Mái boong-ke còn nguyên phía trên (x, z): { y: đáy tấm mái, top: mặt bao cát trên mái, ox, oz: hướng ra cửa } | null
    roofOver(x, z) {
      for (const K of this.items) {
        if (!K.roofed) continue;
        const L = this.local(K, x, z);
        if (L.f > -BK.L / 2 && L.f < BK.coverF && Math.abs(L.r) < BK.Wd / 2) {
          const q = K.roofs.find(q => q.alive && Math.abs(q.lf - L.f) < q.len / 2);
          if (q) return { y: q.y0, top: q.y1 + 2, ox: K.f.x, oz: K.f.z };
        }
      }
      return null;
    }

    isUnderCover(x, z) {
      for (const K of this.items) {
        if (!K.roofed) continue;
        const L = this.local(K, x, z);
        if (L.f > -BK.L / 2 && L.f < BK.coverF - 4 && Math.abs(L.r) < BK.Wd / 2) {
          if (K.roofs.some(q => q.alive && Math.abs(q.lf - L.f) < q.len / 2 + 2)) return K;
        }
      }
      return null;
    }

    blocks(ex, ey, ez, ux, uy, uz) {
      for (const K of this.items) {
        if (segPointDist(ex, ez, ux, uz, K.x, K.z) > 80) continue;
        for (const q of K.blocks) {
          if (!q.alive) continue;
          const t = segCircleT(ex, ez, ux, uz, q.x, q.z, q.radius);
          if (t < 0) continue;
          const yLine = ey + (uy - ey) * t;
          if (yLine < q.y1 && yLine > q.y0 - 2) return { block: q, K };
        }
        if (K.roofed) {
          const Lu = this.local(K, ux, uz);
          if (Lu.f > -BK.L / 2 && Lu.f < BK.coverF && Math.abs(Lu.r) < BK.Wd / 2) {
            const roofY = K.y - 2 + BK.roofY + 2;
            if (ey > roofY && uy < roofY && K.roofs.some(q => q.alive && Math.abs(q.lf - Lu.f) < q.len / 2 + 4)) return { roof: true, K };
          }
        }
      }
      return null;
    }

    // info (tùy chọn, như terrain.damageAt): { t: loại va chạm, dx, dy, dz: hướng bay } — đạn xuyên động năng trúng tường
    // thì bay tiếp phá vách phía sau (throughWalls). override: { power, noRoof } cho các điểm dò của throughWalls
    damageAt(x, y, z, ammo, heavy, fx, override, info) {
      const A = override ? Object.assign({}, ammoInfo(ammo, heavy), override) : ammoInfo(ammo, heavy);
      const events = [];
      const R = A.radius + 5;
      // hướng bay: đạn bắn xiên phải đi xuyên quãng bê tông dài hơn (bề dày / cos góc tới), quá xiên thì không khoan thủng
      const il = info ? Math.hypot(info.dx || 0, info.dy || 0, info.dz || 0) : 0;
      const dir = il > 1e-6 ? { x: info.dx / il, y: info.dy / il, z: info.dz / il } : null;
      for (const K of this.items) {
        if (Math.hypot(x - K.x, z - K.z) > 90 + R) continue;
        const broke = this.S.damageSphere(x, y, z, R, A.power, A.pierce, fx, q => q.K === K, ammo, dir);
        if (this.S.lastHitQ) events.hitQ = this.S.lastHitQ;
        if (!A.noRoof) for (const s of K.roofs) {
          if (!s.alive) continue;
          const L = this.local(K, x, z);
          // khoảng cách 3 chiều tới tấm mái (trước đây chỉ tính chênh cao: 1 quả nổ trên nóc trừ đủ máu mọi đoạn mái
          // trong ±43 đv dọc hầm — gần cả mái dài 56)
          const df = Math.max(0, Math.abs(L.f - s.lf) - s.len / 2), dr = Math.max(0, Math.abs(L.r) - (BK.Wd / 2 + BK.T));
          const dy = y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0;
          const d = Math.hypot(df, dr, dy);
          if (d > R) continue;
          const k = clamp01(1 - d / R);
          // Mái bê tông dày 0.75 m: nổ phía dưới / bên cạnh gần như không làm sập, chỉ đạn rơi trúng nóc mới phá
          const hp0 = s.hp;
          // đạn xuyên động năng chỉ khoan một lỗ hầm hẹp qua mái dày, không làm sập như khối thuốc nổ cùng sức
          s.hp -= A.power * (0.1 + 0.9 * k) * (A.power < 0.2 ? 0.2 : 1) * (y < s.y0 ? 0.35 : 1) * (ammo === 'AP' ? 0.3 : 1);
          // đạn súng chỉ rỗ mặt bê tông 0,75 m, không làm sập mái (như tường: không mài quá 80% máu)
          if (A.power < 0.3) s.hp = Math.max(s.hp, Math.min(hp0, 16 * 0.8));
          this.roofPool.color(s.idx, s.c.clone().multiplyScalar(0.55 + 0.45 * clamp01(s.hp / 16)));
          if (s.hp <= 0) this.breakRoof(K, s, fx);
        }
        for (const s of K.roofs) {
          if (!s.alive) continue;
          // Tấm mái tựa trên tường hông (2 bên) và tường hậu (đoạn mái phía sau)
          const sup = K.blocks.some(q => q.alive && !q.stub && ((q.wall === 'side' && Math.abs(q.lf - s.lf) < 12) || (q.wall === 'back' && s.lf < -BK.L / 2 + 8 && q.y1 > K.y + 20)));
          if (!sup) this.breakRoof(K, s, fx, true);
        }
        if (broke) { events.hit = true; events.push({ type: 'bunker', text: 'BOONG-KE VỠ MẢNG TƯỜNG', x: K.x, z: K.z }); }
      }
      const first = events.hitQ;
      if (ammo === 'AP' && !override && first && info && info.t === 'WALL') this.throughWalls(x, y, z, info, first, fx);
      return events;
    }
    // Đạn xuyên động năng trúng tường boong-ke: xuyên thủng, bay tiếp phá vách phía sau (tối đa 2 lớp vách nữa, mỗi lớp yếu
    // dần). Điểm dò còn nằm trong mặt phẳng tường vừa xuyên thì bỏ qua — trước đây chỉ đếm vách khi khối VỠ hẳn nên các
    // điểm dò đầu (vẫn trong khối dày 12 đv vừa trúng) trúng lại chính khối đó: 1 phát AP trừ ~6,3/7 máu khối
    throughWalls(x, y, z, info, first, fx) {
      const sp = Math.hypot(info.dx || 0, info.dy || 0, info.dz || 0);
      if (sp <= 1) return;
      const dx = info.dx / sp, dy = info.dy / sp, dz = info.dz / sp;
      const planes = [first];
      const inPlane = (px, py, pz) => planes.some(q => Math.abs(this.S.localOf(q, px, py, pz).w) * q.thick < q.thick / 2 + 2.5);
      let walls = 0;
      for (let k = 6; k <= 66 && walls < 2; k += 4) {
        const px = x + dx * k, py = y + dy * k, pz = z + dz * k;
        if (inPlane(px, py, pz)) continue;
        const ev = this.damageAt(px, py, pz, 'AP', false, fx, { power: 0.7 - walls * 0.25, noRoof: true });
        if (ev.hitQ) { planes.push(ev.hitQ); walls++; }
      }
      if (fx && fx.spallCone) fx.spallCone(new THREE.Vector3(x + dx * 4, y + dy * 4, z + dz * 4), new THREE.Vector3(dx, dy, dz), 10, {});
    }
    breakRoof(K, s, fx, sag) {
      s.alive = false;
      this.roofPool.hide(s.idx);
      for (const bi of s.bags) this.bagPool.hide(bi);
      const p = { x: K.x + K.f.x * s.lf, z: K.z + K.f.z * s.lf };
      if (fx && fx.removeMarksNear) fx.removeMarksNear(p.x, s.y0, p.z, 18);
      // Tấm mái bê tông gãy sụp XUỐNG LÒNG HẦM thành đống tảng / mảng vụn trên nền hầm (trước đây biến mất tại chỗ, chỉ còn
      // ít bụi): mảnh rơi từ đúng cao độ tấm mái, nằm lại dọc dải mái vừa mất (khối giả dọc tấm mái cho debrisFor)
      const Wd = BK.Wd + 2 * BK.T;
      const slab = { x: p.x, z: p.z, len: Wd * 0.8, thick: s.len, ax: K.r.x, az: K.r.z, y0: s.y0, y1: s.y1, groundY: K.y, m: s.m };
      this.S.debrisFor(slab, Wd * s.len * BK.roofT * 0.5, fx, s.y0, s.y1);
      this.S.commit();
      chunks(fx, p.x, s.y0, p.z, sag ? 4 : 6, 4, null, sag ? 10 : 40);
      dustBurst(fx, p.x, s.y0, p.z, 5, 16);
      // bụi bê tông phụt ra khe cửa / lỗ bắn khi tấm mái đập xuống nền hầm
      dustBurst(fx, p.x, K.y + 4, p.z, 4, 22);
      sfx('concrete', p.x, s.y0, p.z, 1.1);
    }
    update() {}
  }

  // ===========================================================================
  // DÙNG CHO PHÒNG THỬ ĐẠN: 1 bức tường bê tông thẳng / 1 tòa nhà 4 tầng (cùng cơ chế với game)
  // ===========================================================================
  const LAB_POWER = { NORMAL: 1.8, HE: 2.8, AP: 4.2, CLUSTER: 1.6, CLUSTER_SUBMUNITION: 0.9, RPG: 2.2, ANTI_TANK_MISSILE: 2.6, HEAT: 2.6, HEAT120: 2.8 };
  class ConcreteWall {
    constructor(scene, opts = {}) {
      this.scene = scene;
      this.opts = opts;
      this.build();
    }
    build() {
      const o = this.opts;
      this.group = new THREE.Group();
      this.group.visible = this._vis || false;
      this.scene.add(this.group);
      // dày 1,6 đv (0,2 m) như tường bê tông cốt thép thường của nhà / tường rào: đạn pháo 120 mm đa năng nổ chạm khoét lỗ
      // người chui lọt qua tường 20 cm cốt thép 2 lớp trong 1 phát (BREACH) -> đạn thường / nổ mạnh 1 phát là thủng.
      // Dày 0,3 m thì đạn thường phải 2 phát trúng cùng chỗ, 0,8 m gần như không bắn vỡ nổi
      const cols = o.cols || 12, rows = o.rows || 5, bw = o.blockW || 5.9, bh = o.blockH || 5.1, bd = o.blockD || ConcreteWall.THICK;
      const yaw = o.yaw || 0;
      this.group.userData.wallThick = bd;   // ExplosionFX.impactSurface: đặt mặt sau (bê tông phụt ra) đúng bề dày tường
      this.S = new BlockStructure(this.group, cols * rows + 4);
      this.total = 0;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const lx = (c - (cols - 1) / 2) * bw;
          const q = this.S.addBlock({ x: (o.x || 0) + Math.cos(yaw) * lx, z: (o.z || 0) - Math.sin(yaw) * lx, y0: r * bh, h: bh + 0.02, len: bw + 0.02, thick: bd, rotY: yaw, hp: o.hp || 1.6, groundY: 0 });
          q.h0frac = rand(0.3, 0.65);
          this.total++;
        }
      }
      this.S.commit();
    }
    get visible() { return this.group.visible; }
    set visible(v) { this._vis = v; this.group.visible = v; }
    // power theo thang sức phá của phòng thử (fx_lab / tank_inspector: STRUCT_POWER, HE 2.8...). Đổi về thang của game
    // (AMMO) để bề dày phá được (BREACH) đúng như trong trận: pháo nặng x1.85, nổ trên đất sát chân tường x0.7 vẫn giữ tỉ lệ
    damageAt(worldPos, radius, power, ammoType, fx, dir) {
      const A = ammoInfo(ammoType, false);
      const ref = LAB_POWER[ammoType];
      if (ref && power >= 0.3) power = A.power * power / ref;
      const broke = this.S.damageSphere(worldPos.x, worldPos.y, worldPos.z, radius, power, A.pierce, fx, null, ammoType, dir);
      return { pierced: !!this.S.lastPierced, broke };
    }
    getHealthRatio() {
      let s = 0;
      for (const q of this.S.blocks) s += q.alive ? (q.stub ? 0.3 : clamp01(q.hp / q.hpMax) * 0.3 + 0.7) : 0;
      return s / this.total;
    }
    reset() {
      const vis = this.group.visible;
      this.scene.remove(this.group);
      this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this._vis = vis;
      this.build();
    }
  }

  ConcreteWall.THICK = 1.6;

  class SingleBuilding {
    constructor(scene, opts = {}) {
      this.scene = scene;
      this.opts = opts;
      this.build();
    }
    build() {
      const o = this.opts;
      this.group = new THREE.Group();
      this.group.visible = this._vis || false;
      this.scene.add(this.group);
      this.set = new BuildingSet(this.group, [{ x: o.x || 0, z: o.z || 0, w: o.w || 104, d: o.d || 78, floors: o.floors || 4, angle: o.angle || 0, kind: o.kind || 'apartment' }], () => 0);
      this.B = this.set.items[0];
    }
    get visible() { return this.group.visible; }
    set visible(v) { this._vis = v; this.group.visible = v; }
    get isCollapsed() { return this.B.collapsed; }
    // Cùng cơ chế với game: opts { dir (hướng bay), heavy, hitType ('BUILDING' = trúng thẳng nhà, khác = nổ gần) }
    damageAt(worldPos, radius, power, ammoType, fx, opts = {}) {
      this._fx = fx;
      const d = opts.dir || {};
      return this.set.damageAt(worldPos.x, worldPos.y, worldPos.z, ammoType, !!opts.heavy, fx, null,
        { t: opts.hitType || 'BUILDING', dx: d.x || 0, dy: d.y || 0, dz: d.z || 0 });
    }
    update(dt) { this.set.update(dt, this._fx); }
    getHealthRatio() {
      if (this.B.collapsed) return 0;
      let a = 0, t = 0;
      for (const m of this.B.mods) {
        if (m.role !== 'wall' && m.role !== 'col') continue;
        t++;
        if (m.state !== 'gone') a += m.mk ? 1 - m.mk.gone / (m.mk.nx * m.mk.ny) : 1;
      }
      return t ? a / t : 1;
    }
    reset() {
      const vis = this.group.visible;
      this.scene.remove(this.group);
      this._vis = vis;
      this.build();
    }
  }

  // Khoảng cách điểm -> đoạn thẳng (2D)
  function segPointDist(ax, az, bx, bz, px, pz) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  }
  // Tham số t (0..1) nơi đoạn thẳng AB cắt đường tròn tâm C bán kính r; -1 nếu không cắt
  function segCircleT(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az;
    const fx = ax - cx, fz = az - cz;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
    if (a < 1e-9) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
    // Bỏ qua khi một đầu nằm hẳn trong khối (điểm nổ / xe sát mặt tường)
    if (t1 > 0.02 && t1 < 0.98) return t1;
    if (t2 > 0.02 && t2 < 0.98 && c > 0) return t2;
    return -1;
  }

  // ---------------------------------------------------------------------------
  // BỤI CÂY ĐỊA HÌNH (terrain.buildBushes): vòm thẻ lá + texture lá nhạt màu (sắc xanh theo bản đồ do instanceColor).
  // Tách riêng khỏi hệ thống cây (TreeField) để bụi cây giữ nguyên kiểu thẻ lá này
  // ---------------------------------------------------------------------------
  const Foliage = (() => {
    const rgb = (c, k, a) => `rgba(${Math.max(0, Math.min(255, c[0] * k)) | 0},${Math.max(0, Math.min(255, c[1] * k)) | 0},${Math.max(0, Math.min(255, c[2] * k)) | 0},${a === undefined ? 1 : a})`;
    function drawLeaf(g, x, y, len, wid, ang, c, lit) {
      g.save(); g.translate(x, y); g.rotate(ang);
      g.fillStyle = rgb(c, 1);
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.25, -wid * 1.05, len * 0.7, -wid * 0.85, len, 0);
      g.bezierCurveTo(len * 0.7, wid * 0.85, len * 0.25, wid * 1.05, 0, 0);
      g.fill();
      g.fillStyle = rgb(c, lit, 0.9);
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.25, -wid * 1.05, len * 0.7, -wid * 0.85, len, 0);
      g.closePath(); g.fill();
      g.strokeStyle = rgb(c, 1.35, 0.55); g.lineWidth = Math.max(0.6, wid * 0.12);
      g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.88, 0); g.stroke();
      g.restore();
    }
    const pick3 = (pal) => pal[(RNG() * pal.length) | 0];
    function leafTex(kind) {
      return canvasTex('bushleaf_' + kind, 256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2;
        if (kind === 'frond') {
          // Tàu lá cọ (u ngang: sống lá ở giữa; v dọc: gốc ở đáy ảnh, chóp ở đỉnh ảnh): lá chét dài thuôn chĩa về chóp
          const pal = [[74, 94, 46], [86, 104, 52], [64, 84, 42], [96, 110, 58]];
          for (let y = h - 4; y > 6; y -= 3.2) {
            const v = 1 - y / h;
            const L = w * 0.49 * Math.sin(Math.PI * (0.12 + 0.82 * v)) * rand(0.85, 1.05);
            for (const s of [-1, 1]) {
              const c = RNG() < 0.06 ? [128, 120, 62] : pick3(pal);
              const a = s < 0 ? Math.PI + 0.55 + rand(-0.08, 0.08) : -0.55 + rand(-0.08, 0.08);
              drawLeaf(g, cx + s * 1.5, y, L, rand(2.6, 3.6), a, c, 1.18);
            }
          }
          g.strokeStyle = 'rgb(150,148,84)'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, 4); g.stroke();
          return;
        }
        if (kind === 'needle') {
          // Nhánh thông / vân sam nằm ngang: cành chính từ mép trái (sát thân) ra mép phải (đầu cành), cành con hai bên,
          // lá kim ngắn tua tủa; đường bao thuôn về đầu cành
          const pal = [[30, 54, 38], [38, 66, 42], [26, 46, 34], [48, 78, 50], [56, 86, 54]];
          const env = u => h * 0.46 * Math.sin(Math.PI * (0.1 + u * 0.82));
          const twigs = [];
          let ty = cy;
          const main = [];
          for (let x = 0; x <= w; x += 8) { ty += rand(-1.2, 1.2); main.push([x, ty]); }
          twigs.push(main);
          for (let x = 10, side = 1; x < w - 10; x += rand(8, 13), side = -side) {
            const u = x / w, L = env(u) * rand(0.8, 1.02), a = side * rand(0.7, 1.0);
            const base = main[Math.min(main.length - 1, Math.round(x / 8))];
            const tw = [];
            for (let k = 0; k <= 5; k++) { const t = k / 5; tw.push([base[0] + Math.cos(a * (1 - t * 0.15)) * L * t * 0.9 + t * 6, base[1] + Math.sin(a) * L * t]); }
            twigs.push(tw);
          }
          for (const tw of twigs) {
            g.strokeStyle = 'rgba(70,48,32,0.9)'; g.lineWidth = tw === main ? 2.4 : 1.2;
            g.beginPath(); tw.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
          }
          for (const tw of twigs) {
            for (let k = 0; k < tw.length - 1; k++) {
              const [x0, y0] = tw[k], [x1, y1] = tw[k + 1], dl = Math.hypot(x1 - x0, y1 - y0), da = Math.atan2(y1 - y0, x1 - x0);
              for (let t = 0; t < dl; t += 1.3) {
                const x = x0 + (x1 - x0) * t / dl, y = y0 + (y1 - y0) * t / dl;
                const u = x / w;
                if (Math.abs(y - cy) > env(Math.min(1, u)) + 4) continue;
                for (const s of [-1, 1]) {
                  const a = da + s * rand(0.55, 1.15), l = rand(5, 9) * (1 - u * 0.25), c = pick3(pal);
                  g.strokeStyle = rgb(c, rand(0.85, 1.15)); g.lineWidth = 1.3;
                  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
                }
              }
            }
          }
          return;
        }
        if (kind === 'scale') {
          // Bách / trắc bá: tán vảy dày đặc, chùm nhỏ xanh thẫm đan nhau, viền tán lởm chởm
          const pal = [[34, 56, 34], [42, 66, 38], [28, 48, 30], [52, 76, 44]];
          for (let i = 0; i < 1500; i++) {
            const a = RNG() * 6.283, r = Math.sqrt(RNG()) * w * 0.47;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            const c = pick3(pal), s = rand(2.2, 4.8) * (1 - r / w * 0.6);
            g.fillStyle = rgb(c, rand(0.82, 1.18)); g.beginPath(); g.ellipse(x, y, s, s * 0.6, rand(0, 3.14), 0, 6.3); g.fill();
          }
          for (let i = 0; i < 160; i++) {
            const a = RNG() * 6.283, r = Math.sqrt(RNG()) * w * 0.46, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            g.fillStyle = 'rgba(150,170,110,0.35)'; g.fillRect(x, y, 2, 2);
          }
          return;
        }
        if (kind === 'willow') {
          // Liễu rủ: những dải cành mảnh rủ thẳng xuống (đỉnh ảnh = chỗ treo), lá hẹp dài dọc theo cành, đuôi dài ngắn khác nhau
          const pal = [[74, 94, 44], [86, 106, 50], [64, 84, 40], [96, 112, 56]];
          for (let i = 0; i < 18; i++) {
            const x0 = 10 + RNG() * (w - 20), L = h * rand(0.6, 1), ph = rand(0, 6.3), sw = rand(2, 6);
            let px = x0, py = 0;
            g.strokeStyle = 'rgba(90,86,52,0.8)'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(px, py);
            for (let y = 0; y < L; y += 4) g.lineTo(x0 + Math.sin(y * 0.025 + ph) * sw, y);
            g.stroke();
            for (let y = 2, s = 1; y < L; y += rand(3, 5), s = -s) {
              px = x0 + Math.sin(y * 0.025 + ph) * sw; py = y;
              drawLeaf(g, px, py, rand(10, 15) * (1 - y / h * 0.3), rand(1.7, 2.4), Math.PI / 2 + s * rand(0.2, 0.45), pick3(pal), 1.2);
            }
          }
          return;
        }
        // Lá rộng: cụm cành con tỏa từ tâm, phiến lá mọc so le hai bên cành + lá rải lấp chỗ trống; mép cụm thưa dần
        const P = {
          broad: { pal: [[58, 78, 34], [70, 90, 40], [48, 66, 30], [84, 100, 46], [64, 86, 44]], len: [22, 34], wid: [8, 12], n: 120, twigs: 6 },
          jungle: { pal: [[34, 62, 28], [44, 74, 32], [28, 52, 24], [52, 84, 38]], len: [40, 62], wid: [13, 20], n: 54, twigs: 5 },
          dry: { pal: [[104, 108, 56], [122, 120, 64], [88, 94, 48], [136, 128, 72]], len: [7, 11], wid: [2.6, 3.8], n: 520, twigs: 8 },
          neutral: { pal: [[214, 226, 196], [190, 204, 172], [232, 238, 214], [176, 192, 160]], len: [20, 30], wid: [7, 11], n: 140, twigs: 6 }
        }[kind] || null;
        const Q = P || { pal: [[58, 78, 34], [70, 90, 40], [48, 66, 30]], len: [22, 34], wid: [8, 12], n: 120, twigs: 6 };
        const R = w * 0.47;
        const twigCol = kind === 'neutral' ? 'rgba(150,140,120,0.9)' : 'rgba(76,60,42,0.95)';
        const leaves = [];
        for (let t = 0; t < Q.twigs; t++) {
          const a0 = (t / Q.twigs) * 6.283 + rand(-0.3, 0.3), L = R * rand(0.75, 0.98);
          g.strokeStyle = twigCol; g.lineWidth = kind === 'dry' ? 1.2 : 2;
          g.beginPath(); g.moveTo(cx, cy);
          const pts = [];
          for (let k = 1; k <= 6; k++) { const s = k / 6, a = a0 + Math.sin(s * 3 + t) * 0.15; pts.push([cx + Math.cos(a) * L * s, cy + Math.sin(a) * L * s, a]); g.lineTo(pts[k - 1][0], pts[k - 1][1]); }
          g.stroke();
          const step = kind === 'dry' ? 4 : kind === 'jungle' ? 22 : 11;
          for (let d = step, s = 1; d < L; d += step * rand(0.8, 1.2), s = -s) {
            const k = Math.min(5, Math.floor(d / L * 6)), p = pts[k];
            const x = cx + Math.cos(p[2]) * d, y = cy + Math.sin(p[2]) * d;
            leaves.push([x, y, p[2] + s * rand(0.5, 1.0)]);
          }
          const tip = pts[5]; leaves.push([tip[0], tip[1], tip[2]]);
        }
        for (let i = leaves.length; i < Q.n; i++) {
          const a = RNG() * 6.283, r = Math.pow(RNG(), 0.7) * R * 0.85;
          leaves.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, a + rand(-0.9, 0.9)]);
        }
        // lá trong (gần tâm) vẽ trước, lá ngoài vẽ sau -> mép cụm là các phiến lá trọn vẹn
        leaves.sort((A, B) => Math.hypot(A[0] - cx, A[1] - cy) - Math.hypot(B[0] - cx, B[1] - cy));
        for (const [x, y, a] of leaves) {
          const r = Math.hypot(x - cx, y - cy) / R;
          const sc = 1 - r * 0.25;
          let len = rand(Q.len[0], Q.len[1]) * sc;
          // không để lá thò ra ngoài khung ảnh (cắt thẳng mép = lộ hình vuông của thẻ lá)
          const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
          if (ex < 3 || ex > w - 3 || ey < 3 || ey > h - 3) len *= 0.5;
          drawLeaf(g, x, y, len, rand(Q.wid[0], Q.wid[1]) * sc, a, pick3(Q.pal).map(v => v * rand(0.9, 1.1)), kind === 'jungle' ? 1.3 : 1.2);
        }
      });
    }
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const UPV = V3(0, 1, 0);
    const randUnit = () => { const z = rand(-1, 1), a = rand(0, 6.283), r = Math.sqrt(1 - z * z); return V3(Math.cos(a) * r, z, Math.sin(a) * r); };
    class Cards {
      constructor(vol) { this.vol = vol; this.pos = []; this.nrm = []; this.uv = []; this.col = []; }
      // tâm c, nửa cạnh U (theo u ảnh), V (theo v ảnh); tint: [r,g,b] nhân thêm; uvr: [u0,v0,u1,v1]
      quad(c, U, V, tint, uvr, nOverride) {
        const r = uvr || [0, 0, 1, 1];
        const P = [c.clone().sub(U).sub(V), c.clone().add(U).sub(V), c.clone().add(U).add(V), c.clone().sub(U).add(V)];
        const T = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
        const face = U.clone().cross(V).normalize();
        for (const i of [0, 1, 2, 0, 2, 3]) {
          const p = P[i];
          const n = nOverride ? nOverride(p) : this.normalAt(p, face);
          const ao = this.aoAt(p);
          this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(T[i][0], T[i][1]);
          this.col.push(ao * (tint ? tint[0] : 1), ao * (tint ? tint[1] : 1), ao * (tint ? tint[2] : 1));
        }
      }
      local(p) {
        const v = this.vol;
        const q = V3((p.x - v.c.x) / v.r.x, (p.y - v.c.y) / v.r.y, (p.z - v.c.z) / v.r.z);
        if (v.axis) q.y *= 0.35;
        return q;
      }
      normalAt(p, face) {
        const q = this.local(p);
        const L = q.length() || 1;
        const n = q.multiplyScalar(1 / L);
        n.y += this.vol.up || 0.25;
        n.normalize();
        // giữ chút hướng riêng của thẻ (lá lấp lánh sáng tối xen kẽ), cùng phía với pháp tuyến khối
        const f = face.dot(n) < 0 ? face.clone().negate() : face;
        return n.multiplyScalar(0.82).add(f.clone().multiplyScalar(0.18)).normalize();
      }
      aoAt(p) {
        const v = this.vol;
        const q = this.local(p);
        const e = Math.min(1.15, q.length());
        const hgt = Math.max(0, Math.min(1, (p.y - (v.c.y - v.r.y)) / (2 * v.r.y)));
        return Math.max(0.3, Math.min(1.0, (v.ao0 || 0.36) + 0.28 * hgt + 0.4 * Math.pow(e, 1.6)));
      }
      // thẻ lá đặt ngẫu nhiên hướng (hơi quay ra ngoài theo dir), cỡ s
      card(c, dir, s, tint, outward) {
        const f = dir.clone().multiplyScalar(outward === undefined ? 0.9 : outward).add(randUnit()).normalize();
        const t0 = Math.abs(f.y) < 0.95 ? UPV : V3(1, 0, 0);
        const U = t0.clone().cross(f).normalize();
        const V = f.clone().cross(U).normalize();
        const roll = rand(0, 6.283), cr = Math.cos(roll), sr = Math.sin(roll);
        const U2 = U.clone().multiplyScalar(cr).add(V.clone().multiplyScalar(sr)).multiplyScalar(s / 2);
        const V2 = V.clone().multiplyScalar(cr).sub(U.clone().multiplyScalar(sr)).multiplyScalar(s / 2);
        this.quad(c, U2, V2, tint);
      }
      geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        g.computeBoundingSphere();
        return g;
      }
    }
    const leafTint = (amt) => { const k = rand(1 - amt, 1 + amt * 0.6), hue = rand(-amt, amt) * 0.6; return [k * (1 + hue), k, k * (1 - hue * 0.8)]; };
    // Vật liệu tán lá: cắt alpha + bù alpha theo mức mipmap (lá ở xa không bị mỏng / biến mất), hai mặt dùng chung pháp tuyến
    // khối tán (mặt sau thẻ lá không bị tối đen như mặt phẳng đơn)
    function foliageMat(tex) {
      const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, vertexColors: true });
      m.extensions = { derivatives: true };
      m.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <alphatest_fragment>', `
            #ifdef USE_MAP
              { vec2 tq = vUv * 256.0; vec2 da = dFdx(tq), db = dFdy(tq);
                float lod = max(0.0, 0.5 * log2(max(dot(da, da), dot(db, db))));
                diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + lod * 0.32)); }
            #endif
            #include <alphatest_fragment>`)
          .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', ''));
      };
      m.customProgramCacheKey = () => 'bushFoliage1';
      return sightCull(m);
    }
    // Bụi cây thấp (khối đơn vị, đáy y ~ -0.2): vòm thẻ lá dày; dùng texture lá nhạt màu, màu thật do instanceColor từng bụi
    function bushGeometry(seed) {
      return withSeed(seed || 1, () => {
        const CB = new Cards({ c: V3(0, 0.1, 0), r: V3(1, 0.8, 1), up: 0.35, ao0: 0.4 });
        // Larger irregular cards read as leaves instead of a dense faceted blob and
        // reduce alpha-tested foliage triangles at the same time.
        for (let i = 0; i < 32; i++) {
          const d = randUnit();
          if (d.y < -0.25) d.y = -d.y * 0.4;
          const t = 0.4 + 0.6 * Math.cbrt(RNG());
          const p = V3(d.x * t, 0.1 + d.y * 0.8 * t, d.z * t);
          if (p.y < -0.2) p.y = -0.2;
          const edge = Math.min(1, Math.hypot(p.x, p.z));
          CB.card(p, d, rand(0.66, 0.96) * (0.92 + edge * 0.12), leafTint(0.14), 0.78);
        }
        return CB.geometry();
      });
    }
    // Bờ rào cây xén (khối dài L dọc x, cao h, dày t; đáy y = 0, tâm x = 0): thẻ lá phủ mặt ngoài + lớp trong, lâu không
    // cắt tỉa nên ngọn mọc vượt lởm chởm, mép không vuông thành sắc cạnh; chân thưa lá (gốc cành hở, tối)
    function hedgeGeometry(L, h, t, seed) {
      return withSeed(seed || 1, () => {
        const CB = new Cards({ c: V3(0, h * 0.5, 0), r: V3(L * 0.5, h * 0.55, t * 0.5), up: 0.3, ao0: 0.3 });
        const n = Math.round(L * (h + t) * 1.0);
        for (let i = 0; i < n; i++) {
          const k = RNG(), x = rand(-L * 0.52, L * 0.52);
          let p, d;
          if (k < 0.26) { p = V3(x, h * rand(0.86, 1.0), rand(-t * 0.48, t * 0.48)); d = V3(0, 1, 0); }                    // mặt trên
          else if (k < 0.8) {                                                                                                   // hai mặt bên (thưa dần xuống chân)
            const sd = RNG() < 0.5 ? -1 : 1, y = h * (0.08 + 0.9 * Math.pow(RNG(), 0.8));
            p = V3(x, y, sd * t * rand(0.36, 0.5)); d = V3(0, 0.1, sd);
          } else { p = V3(x, h * rand(0.2, 0.85), rand(-t * 0.28, t * 0.28)); d = randUnit(); }                                // lớp trong (che xuyên)
          CB.card(p, d, rand(3.2, 4.6), leafTint(0.14), 0.85);
        }
        // nhánh mọc vượt trên đỉnh (lâu không xén)
        const m = Math.round(L * 0.5);
        for (let i = 0; i < m; i++) CB.card(V3(rand(-L * 0.45, L * 0.45), h * rand(1.0, 1.18), rand(-t * 0.3, t * 0.3)), V3(rand(-0.4, 0.4), 1, rand(-0.4, 0.4)), rand(1.6, 2.4), leafTint(0.18), 0.7);
        return CB.geometry();
      });
    }
    return { leafTex, foliageMat, bushGeometry, hedgeGeometry };
  })();

  return { buildingInfo: BLD_INFO, SIGHT_CULL, Foliage, TreeField, BuildingSet, BunkerSet, ConcreteWall, SingleBuilding, BlockStructure, FractureKit, ammoInfo, BK, segCircleT, withSeed };
})();

if (typeof window !== 'undefined') window.Destructibles = Destructibles;
