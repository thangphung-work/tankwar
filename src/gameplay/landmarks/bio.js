/**
 * 2. HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC (BSL-4) — BỎ HOANG GIỮA RỪNG RẬM
 * Theo các cơ sở thật (phòng thí nghiệm sinh học quân sự ngầm kiểu Biopreparat / Vozrozhdeniya, cơ sở BSL-4 kiểu
 * Plum Island): phòng thí nghiệm nằm dưới gò đất đắp phủ (MapGen: L.mound), lối vào là cửa đường hầm khoét vào gò:
 *  - mặt tiền bê tông có mái hắt chống nổ, cửa chống nổ trượt 2 cánh (mở hé) -> khoang đệm -> cửa áp lực trong;
 *    2 bên là buồng khoá khí nhân viên (cửa áp lực tay quay) và khoá khí vật liệu (nồi hấp 2 cửa xuyên tường)
 *  - buồng tắm hoá chất / khử nhiễm nhân viên nối hành lang kín sang nhà kiểm soát ra vào (phòng thay đồ)
 *  - sân cách ly có rào riêng, giàn rửa khử nhiễm xe ở cổng sân, chốt gác
 *  - nóc gò: cụm lọc khí thải HEPA 2 dãy (hộp lọc túi kín bag-in/bag-out) + 2 quạt ly tâm + ống gió dẫn lên ống xả
 *    cao, cửa lấy gió tươi, giếng thông gió, cửa thoát hiểm, cột ăng-ten, ống gió chỉ hướng, cầu thang thép lên nóc
 *  - hệ tiệt trùng nước thải (3 bồn "kill tank" + sàn thao tác, bộ trao đổi nhiệt, bơm), bồn nitơ lỏng + giàn hoá
 *    hơi đóng băng, lò đốt chất thải bệnh phẩm (ống khói, công-te-nơ lạnh chứa xác động vật), cụm máy làm lạnh +
 *    tháp giải nhiệt (cầu ống vượt đường sang gò), máy phát điện dự phòng đóng công-te-nơ + bồn dầu, tháp nước,
 *    nhà nuôi giữ động vật thí nghiệm + chuồng ngoài trời + xi-lô thức ăn, bãi trực thăng cấp cứu, kho chất thải nguy
 *    hại (công-te-nơ, phuy cứu hộ, bồn IBC), trạm rửa mắt / tắm khẩn cấp, biển báo song ngữ Anh - Việt
 *  - bỏ hoang nhiều năm trong rừng ẩm: bê tông loang rêu tảo, dây leo rủ, cây bụi / cây non mọc phủ gò, đồ đạc đổ
 *    vỡ, vết tràn hoá chất, biển rơi
 * Canh phòng cấp căn cứ chiến lược như bãi phóng (bộ dùng chung secKit / perimeter).
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / ụ đất: MapGen (map_gen.js).
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  KINDS.bio = {
    name: 'HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC', icon: '☣', color: '#ff8a5c',
    // cổng -> giàn rửa xe -> sân cửa hầm; trục ngang trước; 2 đường dịch vụ 2 bên gò (nhà động vật / máy phát, lò đốt)
    site: {
      roads: [[[[300, 0], [58, 0]], 36], [[[150, -340], [150, 340]], 26], [[[150, 280], [-190, 280]], 22], [[[150, -280], [-190, -280]], 22]],
      junctions: [[150, 0, 26, 36], [150, 280, 26, 22], [150, -280, 26, 22]],
      gravel: (hu) => [[hu - 150, -70, hu, 70], [30, -100, 136, 100], [64, 106, 136, 212], [166, 106, 234, 202], [70, -200, 142, -100],
        [-186, -270, -8, -204], [0, -362, 82, -300], [-182, -402, -92, -292], [-194, 208, 42, 268], [-182, 300, 62, 400], [-66, -372, -14, -318], [158, -200, 232, -120]],
      slabs: [[160, 202, 232, 334], [98, -24, 130, 24], [-58, -264, -12, -220]],
      noGrow: [[-132, -12, -52, 62]]
    },
    build(K, group, anim, api) {
      const { TAU, hash, canvas, texOf, speckle, blotch, ageCanvas, concPair, ribPair, biohazard, warnSign, ABANDONED, roadNet, MAT, decalT, doorMats,
        M4, boxGeo, apron, meshFenceMat, fence, sandbags, drum, camoNet, heli, secKit, perimeter, officeBlock, stack, vTank, milTruck } = api;
      const SITE = KINDS.bio.site;
      const L = K.L, M = L.mound, F0 = M.face - 14, F1 = M.face + 22, CUT = M.cut;   // tường mặt tiền f: -4..32
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'bio');
      roadNet(group, SITE.roads, SITE.junctions, { bars: [[140, 0, 2.4, 32]], words: [['STOP', 146, 0, Math.PI / 2, 16]] });
      const kit = secKit(K, anim), { iF, iR, G, mul, win, acUnit, booth, tower, pillbox, hesco } = kit;
      perimeter(K, kit);
      const HP = Math.PI / 2;
      const at = (b, x, y, z, rx, ry, rz, sx, sy, sz) => mul(b, M4(x, y, z, rx, ry, rz, sx, sy, sz));

      // =====================================================================================================
      // VẬT LIỆU / TEXTURE RIÊNG HẦM SINH HỌC (đăng ký vào MAT -> dùng chung tên chuỗi với Kit, gộp lưới theo vật liệu)
      // =====================================================================================================
      // Bê tông rừng ẩm: nền bê tông đổ khuôn + tảo đen chảy từ mép trên, rêu xanh dày dần xuống chân (ẩm mao dẫn),
      // địa y đốm xám xanh, ố nước; 1 ô = 64 đơn vị như bê tông thường (phải truyền ô texture khi dựng hộp)
      if (!MAT.bioMoss) {
        const [t0, b0] = concPair(), N = 512, c = canvas(N, N), g = c.getContext('2d');
        g.drawImage(t0.image, 0, 0, N, N);
        g.fillStyle = 'rgba(64,78,50,0.16)'; g.fillRect(0, 0, N, N);
        const wrap = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };
        // tảo đen chảy dài từ mép trên
        for (let i = 0; i < 70; i++) {
          const x = hash(i + 12000) * N, l = 90 + hash(i + 12001) * 380, wd = 3 + hash(i + 12002) * 16;
          const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(34,40,26,0.5)'); gr.addColorStop(0.5, 'rgba(40,48,30,0.24)'); gr.addColorStop(1, 'rgba(40,48,30,0)');
          g.fillStyle = gr; g.fillRect(x, 0, wd, l);
        }
        // rêu xanh: dày dần về chân ô ảnh (= chân tường khi hộp dựng từ mặt đất)
        for (let i = 0; i < 170; i++) {
          const x = hash(i + 12100) * N, y = (1 - Math.pow(hash(i + 12101), 2.4)) * N, r = 6 + hash(i + 12102) * 34, k = hash(i + 12103);
          wrap((ox, oy) => blotch(g, x + ox, y + oy, r, k < 0.55 ? '72,94,40' : k < 0.85 ? '52,70,34' : '96,104,58', 0.34));
        }
        for (let i = 0; i < 2400; i++) {
          const x = hash(i + 12300) * N, y = (1 - Math.pow(hash(i + 12301), 1.8)) * N;
          g.fillStyle = hash(i + 12302) < 0.6 ? 'rgba(66,92,36,0.55)' : 'rgba(104,120,60,0.5)'; g.fillRect(x, y, 1 + hash(i + 12303) * 2.5, 1 + hash(i + 12304) * 2);
        }
        // địa y đốm xám xanh nhạt + mốc đen
        for (let i = 0; i < 160; i++) {
          const x = hash(i + 12500) * N, y = hash(i + 12501) * N, r = 1.5 + hash(i + 12502) * 5;
          g.fillStyle = hash(i + 12503) < 0.7 ? 'rgba(176,184,150,0.5)' : 'rgba(30,32,26,0.45)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
        MAT.bioMoss = new THREE.MeshStandardMaterial({ map: t, bumpMap: b0, bumpScale: 0.5, color: 0xb6b8aa, roughness: 0.97 });
      }
      // Lá cây bụi nhiệt đới (cụm lá bản rộng toả từ giữa, nền trong suốt) + dương xỉ (lá kép dài toả từ gốc)
      if (!MAT.bioLeaf) {
        const leaf = (q, x, y, len, wd, a, col) => {
          q.save(); q.translate(x, y); q.rotate(a);
          q.fillStyle = col; q.beginPath(); q.moveTo(0, 0); q.quadraticCurveTo(len * 0.5, -wd, len, 0); q.quadraticCurveTo(len * 0.5, wd, 0, 0); q.fill();
          q.strokeStyle = 'rgba(190,200,140,0.35)'; q.lineWidth = 0.8; q.beginPath(); q.moveTo(0, 0); q.lineTo(len * 0.95, 0); q.stroke();
          q.restore();
        };
        const green = (k) => { const v = hash(k), y = hash(k + 1) < 0.1; return y ? `rgb(${118 + v * 30 | 0},${112 + v * 26 | 0},${52 + v * 10 | 0})` : `rgb(${34 + v * 46 | 0},${62 + v * 58 | 0},${22 + v * 26 | 0})`; };
        const tl = texOf('bioLeaf', 256, 256, (q, w, h) => {
          q.clearRect(0, 0, w, h);
          for (let i = 0; i < 95; i++) {
            const a = hash(i + 13000) * TAU, d = Math.pow(hash(i + 13001), 0.7) * w * 0.3, x = w / 2 + Math.cos(a) * d, y = h * 0.52 + Math.sin(a) * d * 0.8;
            leaf(q, x, y, 26 + hash(i + 13002) * 40, 7 + hash(i + 13003) * 9, a + (hash(i + 13004) - 0.5) * 1.2, green(i * 3 + 13005));
          }
        });
        MAT.bioLeaf = new THREE.MeshStandardMaterial({ map: tl, side: THREE.DoubleSide, alphaTest: 0.45, roughness: 0.85 });
        const tf = texOf('bioFern', 256, 256, (q, w, h) => {
          q.clearRect(0, 0, w, h);
          for (let i = 0; i < 16; i++) {
            const a = -HP + (hash(i + 13200) - 0.5) * 2.6, len = 90 + hash(i + 13201) * 120, bend = (hash(i + 13202) - 0.5) * 0.8;
            let x = w / 2, y = h - 4, dir = a;
            const col = green(i * 5 + 13203);
            for (let s = 0; s < 18; s++) {
              const st = len / 18, nx = x + Math.cos(dir) * st, ny = y + Math.sin(dir) * st;
              q.strokeStyle = 'rgb(58,72,30)'; q.lineWidth = 1.4; q.beginPath(); q.moveTo(x, y); q.lineTo(nx, ny); q.stroke();
              const ll = (1 - s / 18) * 16 + 3;
              for (const sd of [-1, 1]) leaf(q, nx, ny, ll, 2.6, dir + sd * 1.1, col);
              x = nx; y = ny; dir += bend * 0.12 + 0.03 * Math.sign(Math.cos(a));
            }
          }
        });
        MAT.bioFern = new THREE.MeshStandardMaterial({ map: tf, side: THREE.DoubleSide, alphaTest: 0.45, roughness: 0.9 });
        // vỏ cây rừng xám nâu
        MAT.bioBark = new THREE.MeshStandardMaterial({ color: 0x5d564a, roughness: 0.95, map: texOf('bioBark', 64, 128, (q, w, h) => {
          q.fillStyle = '#8a8270'; q.fillRect(0, 0, w, h);
          for (let i = 0; i < 40; i++) { q.fillStyle = hash(i + 13400) < 0.5 ? 'rgba(60,56,46,0.6)' : 'rgba(150,146,120,0.4)'; q.fillRect(hash(i + 13401) * w, 0, 1 + hash(i + 13402) * 3, h); }
          for (let i = 0; i < 30; i++) blotch(q, hash(i + 13410) * w, hash(i + 13411) * h, 4 + hash(i + 13412) * 8, '80,100,50', 0.4);
        }, true) });
      }
      // Vỏ công-te-nơ ISO tôn sóng (đỏ gỉ / xanh quân đội), vết tràn hoá chất (vũng loang trong suốt)
      if (!MAT.bioContR) {
        const [t, b] = ribPair('rib_v', false, 16, 236);
        MAT.bioContR = new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 0.8, color: 0x8a4430, roughness: 0.75, metalness: 0.3 });
        MAT.bioContG = new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 0.8, color: 0x5c6648, roughness: 0.75, metalness: 0.3 });
        MAT.bioSpill = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
          map: texOf('bioSpill', 128, 128, (q, w, h) => {
            q.clearRect(0, 0, w, h);
            for (let i = 0; i < 22; i++) { const a = hash(i + 13600) * TAU, d = hash(i + 13601) * 34; blotch(q, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 10 + hash(i + 13602) * 26, i % 3 ? '46,52,30' : '92,70,30', 0.55); }
            q.strokeStyle = 'rgba(160,150,90,0.4)'; q.lineWidth = 1.5; q.beginPath(); q.ellipse(w / 2, h / 2, 40, 34, 0.3, 0, TAU); q.stroke();
          }) });
      }
      // ---- BẢNG KÝ HIỆU GỘP 1 ẢNH (atlas 2048 x 2048): mọi biển song ngữ / nhãn / ký hiệu của hầm dùng chung 1 vật liệu
      //      (1 lệnh vẽ thay vì mỗi biển 1 vật liệu); mặt phẳng ánh xạ UV vào ô của biển
      const ATL = (() => {
        if (MAT.bioAtlas) return MAT.bioAtlas;
        const W = 2048, c = canvas(W, W), g = c.getContext('2d');
        const icon = (q, kind, x, y, s) => {
          if (kind === 'bio') { warnSign(q, x, y, s, s, 'bio'); return; }
          q.save(); q.translate(x, y);
          if (kind === 'eye') {
            q.fillStyle = '#1f7a3e'; q.fillRect(0, 0, s, s); q.strokeStyle = '#fff'; q.lineWidth = s * 0.06;
            q.beginPath(); q.ellipse(s / 2, s * 0.42, s * 0.3, s * 0.15, 0, 0, TAU); q.stroke();
            q.fillStyle = '#fff'; q.beginPath(); q.arc(s / 2, s * 0.42, s * 0.09, 0, TAU); q.fill();
            for (const dx of [-0.16, 0, 0.16]) { q.beginPath(); q.moveTo(s * (0.5 + dx), s * 0.66); q.quadraticCurveTo(s * (0.44 + dx), s * 0.78, s * (0.5 + dx), s * 0.82); q.quadraticCurveTo(s * (0.56 + dx), s * 0.78, s * (0.5 + dx), s * 0.66); q.fill(); }
          } else if (kind === 'snow') {
            q.fillStyle = '#1d4f9a'; q.fillRect(0, 0, s, s); q.strokeStyle = '#fff'; q.lineWidth = s * 0.06; q.lineCap = 'round';
            for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; q.beginPath(); q.moveTo(s / 2 - Math.cos(a) * s * 0.36, s / 2 - Math.sin(a) * s * 0.36); q.lineTo(s / 2 + Math.cos(a) * s * 0.36, s / 2 + Math.sin(a) * s * 0.36); q.stroke(); }
          } else if (kind === 'fuel') {
            q.fillStyle = '#c8261c'; q.beginPath(); q.moveTo(s / 2, 0); q.lineTo(s, s / 2); q.lineTo(s / 2, s); q.lineTo(0, s / 2); q.closePath(); q.fill();
            q.fillStyle = '#111'; q.beginPath(); q.moveTo(s / 2, s * 0.22); q.quadraticCurveTo(s * 0.7, s * 0.5, s * 0.6, s * 0.7); q.lineTo(s * 0.4, s * 0.7); q.quadraticCurveTo(s * 0.32, s * 0.48, s / 2, s * 0.22); q.fill();
          }
          q.restore();
        };
        // biển chữ: nền, dải đầu, viền, biểu tượng trái (+ phải), các dòng [chữ, cỡ (phần chiều cao), màu]
        const panel = (o) => (q, w, h) => {
          o = Object.assign({ bg: '#e9e6dc', border: '#1d1d1d', band: null, bandH: 0.36, icon: null, icon2: false }, o);
          q.fillStyle = o.bg; q.fillRect(0, 0, w, h);
          if (o.band) { q.fillStyle = o.band; q.fillRect(0, 0, w, h * o.bandH); }
          const lw = Math.max(3, h * 0.035); q.strokeStyle = o.border; q.lineWidth = lw; q.strokeRect(lw, lw, w - lw * 2, h - lw * 2);
          let x0 = h * 0.08, x1 = w - h * 0.08;
          if (o.icon) { const s = h * 0.72; icon(q, o.icon, h * 0.12, (h - s) / 2, s); x0 = h * 0.12 + s + h * 0.06; if (o.icon2) { icon(q, o.icon, w - h * 0.12 - s, (h - s) / 2, s); x1 = w - h * 0.12 - s - h * 0.06; } }
          const tot = o.lines.reduce((a, l) => a + l[1] * 1.22, 0);
          let y = (h - tot * h) / 2;
          q.textAlign = 'center'; q.textBaseline = 'middle';
          for (const [txt, sz, col] of o.lines) {
            const px = sz * h; y += px * 0.61;
            q.font = `bold ${px | 0}px Arial, sans-serif`; q.fillStyle = col;
            const fit = Math.min(1, (x1 - x0) / q.measureText(txt).width);
            q.save(); q.translate((x0 + x1) / 2, y); q.scale(fit, 1); q.fillText(txt, 0, 0); q.restore();
            y += px * 0.61;
          }
          speckle(q, w, h, Math.round(w * h / 300), ['#6a6258', '#ffffff'], 1, 3, w + h);
          if (ABANDONED) ageCanvas(q, w, h, w * 7 + h * 3, 0.75);
        };
        const R = '#a3221a', D = '#1d1d1d', Y = '#f0c419';
        const SPEC = [
          ['main', 1024, 256, panel({ icon: 'bio', icon2: true, lines: [['MILITARY BIOLOGICAL RESEARCH FACILITY — BSL-4', 0.17, R], ['CƠ SỞ NGHIÊN CỨU SINH HỌC QUÂN SỰ — AN TOÀN SINH HỌC CẤP 4', 0.12, D],
            ['AUTHORIZED PERSONNEL ONLY  /  CHỈ NHÂN VIÊN ĐƯỢC PHÉP', 0.1, D], ['FACILITY 17-B', 0.08, '#444']] })],
          ['bioicon', 256, 256, (q, w, h) => {
            q.fillStyle = '#f0c419'; q.fillRect(0, 0, w, h); q.strokeStyle = '#141414'; q.lineWidth = 12; q.strokeRect(6, 6, w - 12, h - 12);
            biohazard(q, w / 2, h * 0.42, 70, '#141414');
            q.fillStyle = '#141414'; q.font = 'bold 30px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('BIOHAZARD', w / 2, h * 0.8); q.font = 'bold 20px Arial'; q.fillText('NGUY HIỂM SINH HỌC', w / 2, h * 0.9);
            if (ABANDONED) ageCanvas(q, w, h, 77, 0.8);
          }],
          ['airP', 512, 192, panel({ icon: 'bio', band: '#1d2a3a', bandH: 0.42, lines: [['PERSONNEL AIRLOCK', 0.2, '#ffffff'], ['BUỒNG KHOÁ KHÍ NHÂN VIÊN', 0.12, D], ['POSITIVE-PRESSURE SUIT REQUIRED', 0.09, R], ['BẮT BUỘC MẶC ĐỒ BẢO HỘ ÁP DƯƠNG', 0.08, R]] })],
          ['airM', 512, 192, panel({ icon: 'bio', band: '#1d2a3a', bandH: 0.42, lines: [['MATERIAL AIRLOCK', 0.2, '#ffffff'], ['KHOÁ KHÍ VẬT LIỆU — NỒI HẤP 2 CỬA', 0.11, D], ['PASS-THROUGH AUTOCLAVE 134°C', 0.09, R], ['KHÔNG MỞ CẢ 2 CỬA CÙNG LÚC', 0.08, R]] })],
          ['decon', 768, 160, panel({ icon: 'bio', icon2: true, band: '#d9a61c', bandH: 0.4, lines: [['CHEMICAL SHOWER — DECONTAMINATION', 0.17, D], ['BUỒNG TẮM HOÁ CHẤT — KHỬ NHIỄM', 0.13, D], ['MANDATORY 8 MIN BEFORE EXIT / BẮT BUỘC 8 PHÚT', 0.09, R]] })],
          ['quar', 768, 256, panel({ bg: '#efece2', band: '#b52a1e', bandH: 0.34, icon: 'bio', lines: [['QUARANTINE ZONE', 0.2, '#ffffff'], ['KHU VỰC CÁCH LY', 0.15, R], ['NO ENTRY WITHOUT CLEARANCE', 0.09, D], ['CẤM VÀO KHI CHƯA ĐƯỢC PHÉP', 0.09, D]] })],
          ['wash', 768, 160, panel({ bg: '#efece2', band: '#1d2a3a', bandH: 0.38, lines: [['VEHICLE DECONTAMINATION', 0.2, '#ffffff'], ['KHỬ NHIỄM PHƯƠNG TIỆN', 0.14, D], ['STOP — ALL VEHICLES / DỪNG LẠI — MỌI XE', 0.1, R]] })],
          ['hepa', 768, 160, panel({ icon: 'bio', lines: [['HEPA EXHAUST FILTERS', 0.18, R], ['BỘ LỌC KHÍ THẢI HEPA — BAG-IN / BAG-OUT', 0.11, D], ['DO NOT OPEN — CONTAMINATED / KHÔNG MỞ — NHIỄM BẨN', 0.09, D]] })],
          ['eds', 768, 160, panel({ icon: 'bio', icon2: true, lines: [['EFFLUENT DECONTAMINATION SYSTEM', 0.17, R], ['HỆ THỐNG TIỆT TRÙNG NƯỚC THẢI (KILL TANK)', 0.12, D], ['121°C STEAM — LIVE CULTURE WASTE / HƠI NƯỚC 121°C — CHẤT THẢI NUÔI CẤY', 0.085, D]] })],
          ['ln2', 512, 192, panel({ bg: '#efece2', icon: 'snow', lines: [['LIQUID NITROGEN', 0.2, '#1d4f9a'], ['NITƠ LỎNG', 0.15, '#1d4f9a'], ['−196°C CRYOGENIC — ASPHYXIANT', 0.085, D], ['CỰC LẠNH — GÂY NGẠT', 0.085, D]] })],
          ['incin', 768, 160, panel({ icon: 'bio', icon2: true, lines: [['PATHOLOGICAL WASTE INCINERATOR', 0.18, R], ['LÒ ĐỐT CHẤT THẢI BỆNH PHẨM', 0.13, D], ['AUTHORIZED STAFF ONLY / CHỈ NHÂN VIÊN ĐƯỢC PHÉP', 0.09, D]] })],
          ['animal', 768, 160, panel({ icon: 'bio', icon2: true, band: '#3b4a2c', bandH: 0.38, lines: [['ANIMAL HOLDING — VIVARIUM', 0.19, '#ffffff'], ['KHU NUÔI GIỮ ĐỘNG VẬT THÍ NGHIỆM', 0.13, D], ['INFECTED ANIMALS — DO NOT FEED OR TOUCH / ĐỘNG VẬT NHIỄM BỆNH', 0.085, R]] })],
          ['genset', 768, 160, panel({ icon: 'fuel', lines: [['EMERGENCY POWER', 0.19, R], ['MÁY PHÁT ĐIỆN DỰ PHÒNG', 0.13, D], ['DIESEL — NO SMOKING / DẦU DIESEL — CẤM LỬA', 0.09, D]] })],
          ['fence', 768, 256, panel({ bg: Y, border: '#141414', icon: 'bio', lines: [['BIOHAZARD', 0.22, '#141414'], ['NGUY HIỂM SINH HỌC', 0.15, '#141414'], ['RESTRICTED MILITARY AREA — NO ENTRY', 0.085, R], ['KHU VỰC QUÂN SỰ — CẤM VÀO', 0.085, R]] })],
          ['eye', 256, 256, (q, w, h) => {
            q.fillStyle = '#1f7a3e'; q.fillRect(0, 0, w, h); icon(q, 'eye', w * 0.2, 6, w * 0.6);
            q.fillStyle = '#fff'; q.font = 'bold 24px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle';
            q.fillText('EMERGENCY', w / 2, h * 0.7); q.fillText('EYEWASH', w / 2, h * 0.8); q.font = 'bold 15px Arial'; q.fillText('RỬA MẮT KHẨN CẤP', w / 2, h * 0.91);
            if (ABANDONED) ageCanvas(q, w, h, 91, 0.7);
          }],
          ['chill', 768, 160, panel({ lines: [['CHILLED WATER PLANT — NEGATIVE-PRESSURE HVAC', 0.16, '#1d4f9a'], ['TRẠM NƯỚC LẠNH — ĐIỀU HOÀ PHÒNG ÁP SUẤT ÂM', 0.13, D]] })],
          ['access', 768, 128, panel({ bg: '#e9e6dc', lines: [['ACCESS CONTROL — CHANGE ROOMS', 0.22, '#1d2a3a'], ['KIỂM SOÁT RA VÀO — PHÒNG THAY ĐỒ', 0.17, D]] })],
          ['drum', 256, 128, panel({ bg: '#f2f0ea', icon: 'bio', lines: [['BIOHAZARD', 0.22, R], ['WASTE', 0.18, D], ['CHẤT THẢI SINH HỌC', 0.11, D]] })],
          ['un6', 256, 256, (q, w, h) => {
            q.fillStyle = '#e8e4da'; q.fillRect(0, 0, w, h);
            q.save(); q.translate(w / 2, h / 2); q.rotate(Math.PI / 4); q.fillStyle = '#fff'; q.fillRect(-82, -82, 164, 164); q.strokeStyle = '#111'; q.lineWidth = 5; q.strokeRect(-76, -76, 152, 152); q.restore();
            biohazard(q, w / 2, h * 0.36, 34, '#111');
            q.fillStyle = '#111'; q.font = 'bold 15px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle';
            q.fillText('INFECTIOUS', w / 2, h * 0.58); q.fillText('SUBSTANCE', w / 2, h * 0.65); q.font = 'bold 13px Arial'; q.fillText('CHẤT LÂY NHIỄM', w / 2, h * 0.72);
            q.font = 'bold 30px Arial'; q.fillText('6', w / 2, h * 0.84); q.font = 'bold 18px Arial'; q.fillText('UN 2814', w / 2, h * 0.1);
            if (ABANDONED) ageCanvas(q, w, h, 33, 1);
          }],
          ['hazyard', 768, 160, panel({ icon: 'bio', icon2: true, lines: [['BIOHAZARDOUS WASTE STORAGE', 0.18, R], ['KHO CHẤT THẢI NGUY HẠI SINH HỌC', 0.13, D], ['SEALED CONTAINERS ONLY / CHỈ CHỨA THÙNG ĐÃ NIÊM PHONG', 0.085, D]] })],
          ['lab', 512, 128, panel({ bg: '#e9e6dc', lines: [['MOBILE BIOLAB', 0.3, R], ['PHÒNG THÍ NGHIỆM DI ĐỘNG', 0.2, D]] })],
          ['kill', 256, 128, panel({ bg: '#e9e6dc', lines: [['KILL TANK', 0.3, R], ['BỒN TIỆT TRÙNG', 0.2, D]] })],
          ['spray', 512, 192, (q, w, h) => {
            // chữ sơn xịt cảnh báo trên tấm tôn (dấu vết đội dọn dẹp cuối cùng)
            q.fillStyle = '#8e9396'; q.fillRect(0, 0, w, h); speckle(q, w, h, 1200, ['#6c7072', '#b0b4b6'], 1, 3, 4);
            q.fillStyle = 'rgba(196,40,30,0.9)'; q.font = 'bold 54px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle';
            q.fillText('DO NOT ENTER', w / 2, h * 0.32); q.font = 'bold 40px Arial'; q.fillText('KHÔNG ĐƯỢC VÀO', w / 2, h * 0.64);
            q.font = 'bold 22px Arial'; q.fillText('CONTAMINATED — 1998', w / 2, h * 0.88);
            if (ABANDONED) ageCanvas(q, w, h, 55, 1.2);
          }]
        ];
        // xếp kệ: từng hàng cao bằng ô cao nhất, chừa viền 8 px chống lem mipmap
        const slots = {}; let x = 0, y = 0, rowH = 0;
        for (const [key, w, h, draw] of SPEC.slice().sort((a, b) => b[2] - a[2])) {
          if (x + w + 8 > W) { x = 0; y += rowH + 8; rowH = 0; }
          g.save(); g.translate(x + 4, y + 4); g.beginPath(); g.rect(0, 0, w, h); g.clip(); draw(g, w, h); g.restore();
          slots[key] = [(x + 4) / W, 1 - (y + 4 + h) / W, (x + 4 + w) / W, 1 - (y + 4) / W];
          x += w + 8; rowH = Math.max(rowH, h);
        }
        const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
        const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        m.userData.slots = slots;
        return (MAT.bioAtlas = m);
      })();
      const uvSlot = (g, key) => { const q = ATL.userData.slots[key], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, q[0] + uv.getX(i) * (q[2] - q[0]), q[1] + uv.getY(i) * (q[3] - q[1])); return g; };
      // biển phẳng (mặc định quay về +f như K.plane), mtx: ma trận gốc tuỳ chọn
      const sign = (key, x, y, z, w, h, ry, base) => { const m = M4(x, y, z, 0, ry === undefined ? HP : ry, 0); K.add(ATL, uvSlot(new THREE.PlaneGeometry(w, h), key), base ? mul(base, m) : m); };
      const signM = (key, w, h, mtx) => K.add(ATL, uvSlot(new THREE.PlaneGeometry(w, h), key), mtx);
      // nhãn cong ôm thân bồn / phuy (mảng trụ hở, quay về hướng a trong mặt phẳng f-r)
      // (hướng a: góc từ +f sang +r; trụ three.js: x = R sin θ, z = R cos θ -> θ = π/2 - a; u tăng theo θ = đọc trái sang phải)
      const signCyl = (key, f, y, r, R, w, h, a) => { const arc = w / R; K.add(ATL, uvSlot(new THREE.CylinderGeometry(R, R, h, 10, 1, true, HP - a - arc / 2, arc), key), M4(f, y, r)); };

      // ---- hộp vát cạnh có ô texture tuỳ chọn (Kit.cbox cố định ô 24 với vật liệu ngoài danh sách -> bê tông rêu cần ô 64)
      const cbt = (m, x, y, z, sx, sy, sz, c, ry, base, tile) => {
        c = Math.min(c || 1.5, sx / 3, sy / 3, sz / 3);
        const sh = new THREE.Shape();
        sh.moveTo(-sx / 2 + c, -sy / 2 + c); sh.lineTo(sx / 2 - c, -sy / 2 + c); sh.lineTo(sx / 2 - c, sy / 2 - c); sh.lineTo(-sx / 2 + c, sy / 2 - c); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: sz - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1 });
        g.translate(0, 0, -(sz - 2 * c) / 2);
        const tl = tile || 64, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tl, uv.getY(i) / tl);
        const lm = M4(x, y, z, 0, ry || 0, 0);
        K.add(m, g, base ? mul(base, lm) : lm);
      };
      const MB = (x, y, z, sx, sy, sz, ry) => K.box('bioMoss', x, y, z, sx, sy, sz, ry, 64);   // khối bê tông rêu
      const pipe = (m, a, b, R, seg) => {   // ống tròn thẳng từ a tới b
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        K.add(m, new THREE.CylinderGeometry(R, R, len, seg || 8), new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      };
      const pipeRun = (m, pts, R, seg) => { for (let i = 1; i < pts.length; i++) pipe(m, pts[i - 1], pts[i], R, seg); for (let i = 1; i < pts.length - 1; i++) K.add(m, new THREE.SphereGeometry(R * 1.05, seg || 8, 4), M4(...pts[i])); };
      const flange = (p, R, axis) => K.add('steelDark', new THREE.CylinderGeometry(R * 1.5, R * 1.5, 0.6, 10), M4(p[0], p[1], p[2], axis === 'r' ? HP : 0, 0, axis === 'f' ? HP : 0));
      const spill = (f, r, s, a, y) => K.add(MAT.bioSpill, new THREE.PlaneGeometry(s, s * (0.6 + hash(f * 3 + r) * 0.5)), M4(f, (y || 0) + 0.72, r, -HP, 0, a || 0));

      // ---- THỰC VẬT (cây bụi, dương xỉ, cây non mọc hoang): chỉ hình, không va chạm
      const bush = (f, r, s, sd, y0, m) => {
        const y = y0 === undefined ? K.earth(f, r) : y0, a0 = hash(sd) * TAU, w = s * (1.2 + hash(sd + 1) * 0.6), hh = s * (0.8 + hash(sd + 2) * 0.5);
        for (let k = 0; k < 3; k++) K.add(m || 'bioLeaf', new THREE.PlaneGeometry(w, hh), M4(f, y + hh * 0.42, r, (hash(sd + k + 3) - 0.5) * 0.25, a0 + k * Math.PI / 3, 0));
      };
      const fern = (f, r, s, sd, y0) => {
        const y = y0 === undefined ? K.earth(f, r) : y0, a0 = hash(sd) * TAU;
        for (let k = 0; k < 2; k++) K.add('bioFern', new THREE.PlaneGeometry(s * 1.5, s), M4(f, y + s / 2 - 0.3, r, 0, a0 + k * HP, 0));
      };
      const tree = (f, r, H, sd) => {
        const y = K.earth(f, r) - 1, base = M4(f, y, r, (hash(sd) - 0.5) * 0.22, hash(sd + 9) * TAU, (hash(sd + 1) - 0.5) * 0.22);
        K.add('bioBark', new THREE.CylinderGeometry(0.45, 1.2, H, 7), at(base, 0, H / 2, 0));
        for (let k = 0; k < 2; k++) { const a = hash(sd + k + 20) * TAU; K.add('bioBark', new THREE.CylinderGeometry(0.2, 0.45, H * 0.35, 5), at(base, Math.cos(a) * 3, H * 0.72, Math.sin(a) * 3, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)); }
        for (let k = 0; k < 4; k++) {
          const a = hash(sd + k * 3 + 30) * TAU, d = k ? 6 + hash(sd + k * 3 + 31) * 7 : 0, cy = H - 3 + hash(sd + k * 3 + 32) * 7, s = 16 + hash(sd + k + 40) * 10;
          const cm = at(base, Math.cos(a) * d, cy, Math.sin(a) * d, 0, a, 0);
          for (let j = 0; j < 3; j++) K.add('bioLeaf', new THREE.PlaneGeometry(s * 1.3, s), mul(cm, M4(0, 0, 0, 0.2 * (j - 1), j * Math.PI / 3, 0)));
          K.add('bioLeaf', new THREE.PlaneGeometry(s * 1.3, s * 1.3), mul(cm, M4(0, s * 0.12, 0, -HP, 0, 0)));
        }
      };
      // dải cây bụi dọc chân tường (f0, r0) -> (f1, r1), lệch ra ngoài (nf, nr)
      const shrubs = (f0, r0, f1, r1, nf, nr, sd, step, s0) => {
        const len = Math.hypot(f1 - f0, r1 - r0);
        for (let t = hash(sd) * 6, i = 0; t < len; t += (step || 10) + hash(sd + i * 7) * 9, i++) {
          const p = t / len, o = 2 + hash(sd + i * 3) * 5, f = f0 + (f1 - f0) * p + nf * o, r = r0 + (r1 - r0) * p + nr * o;
          if (hash(sd + i * 5 + 1) < 0.35) fern(f, r, (s0 || 8) * (0.8 + hash(sd + i) * 0.6), sd + i * 11, 0); else bush(f, r, (s0 || 8) * (0.8 + hash(sd + i) * 0.7), sd + i * 13, 0);
        }
      };
      // dây leo rủ từ mép trên (f0, r0) -> (f1, r1) ở cao độ yTop, lệch ra (nf, nr)
      const vines = (f0, r0, f1, r1, yTop, nf, nr, sd, step, hMax) => {
        const len = Math.hypot(f1 - f0, r1 - r0), ang = Math.atan2(r1 - r0, f1 - f0);
        for (let t = hash(sd) * 6, i = 0; t < len; t += (step || 9) + hash(sd + i * 3) * 10, i++) {
          const hh = Math.min(hMax || 99, 10 + hash(sd + i * 5 + 1) * 30), ww = 7 + hash(sd + i * 5 + 2) * 7, p = t / len, o = 0.35 + hash(sd + i * 5 + 3) * 0.5;
          K.add('vine', new THREE.PlaneGeometry(ww, hh), M4(f0 + (f1 - f0) * p + nf * o, yTop - hh / 2 + 1, r0 + (r1 - r0) * p + nr * o, 0, -ang, 0));
        }
      };

      // ---- ĐỒ VẬT NGUY HẠI SINH HỌC (bỏ lại)
      // phuy cứu hộ (overpack) vàng Ø 0.75 m: thân, vành lăn, nắp vặn, nhãn chất thải sinh học; tip: đổ nghiêng
      const overpack = (f, r, ry, tip, y0) => {
        const b = M4(f, (y0 || 0) + (tip ? 3 : 0), r, 0, ry || 0, tip ? HP : 0);
        K.add('yellow', new THREE.CylinderGeometry(3, 2.8, 8.4, 14), at(b, 0, tip ? 0 : 4.2, 0));
        for (const y of [2.8, 5.6]) K.add('steelDark', new THREE.TorusGeometry(3, 0.25, 4, 14), at(b, 0, tip ? y - 4.2 : y, 0, HP, 0, 0));
        K.add('yellow', new THREE.CylinderGeometry(3.3, 3.3, 1, 14), at(b, 0, tip ? 4.4 : 8.6, 0));
        K.add(ATL, uvSlot(new THREE.CylinderGeometry(3.05, 2.9, 2.6, 8, 1, true, 0.4, 1.6), 'drum'), at(b, 0, tip ? 0.2 : 4.4, 0));
      };
      // bồn IBC 1000 L: bình nhựa trắng đục trong lồng thép ống, pa-lét, van xả đáy
      const ibc = (f, r, ry, y0) => {
        const b = M4(f, y0 || 0, r, 0, ry || 0, 0);
        K.add('steelDark', new THREE.BoxGeometry(9.6, 1.2, 8), at(b, 0, 0.6, 0));
        K.add('steelWhite', new THREE.BoxGeometry(9, 8, 7.4), at(b, 0, 5.4, 0));
        for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.add('steelGray', new THREE.BoxGeometry(0.35, 8.6, 0.35), at(b, x * 4.7, 5.4, z * 3.9));
        for (const y of [3.2, 6.4, 9.6]) { for (const z of [-3.9, 3.9]) K.add('steelGray', new THREE.BoxGeometry(9.6, 0.3, 0.3), at(b, 0, y, z)); for (const x of [-4.7, 4.7]) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 8), at(b, x, y, 0)); }
        K.add('steelDark', new THREE.CylinderGeometry(0.5, 0.5, 1.6, 8), at(b, 5.2, 2.4, 0, 0, 0, HP));
        K.add('steelGray', new THREE.CylinderGeometry(1.4, 1.4, 0.6, 10), at(b, 0, 9.7, 0));
      };
      // thùng rác y tế có bánh (đỏ), nắp đen, nhãn
      const redBin = (f, r, ry, tip) => {
        const b = M4(f, tip ? 3 : 0, r, 0, ry || 0, tip ? 1.35 : 0);
        K.add('steelRed', new THREE.BoxGeometry(6, 8, 5.4), at(b, 0, 4.6, 0));
        K.add('rubber', new THREE.BoxGeometry(6.6, 0.8, 6), at(b, 0, 9, 0, tip ? 0 : -0.15, 0, 0));
        for (const z of [-2, 2]) K.add('rubber', new THREE.CylinderGeometry(0.9, 0.9, 0.8, 8), at(b, -2.6, 0.9, z, HP, 0, 0));
        signM('drum', 4.6, 2.3, at(b, 3.02, 5.6, 0, 0, HP, 0));
      };
      // công-te-nơ ISO 20 ft (6.06 x 2.44 x 2.59 m): vỏ tôn sóng, khung + góc đúc, 2 cánh cửa đuôi có thanh khoá, nhãn UN 2814;
      // open: hé 1 cánh
      // roll: lật nghiêng quanh trục dọc (công-te-nơ đổ nằm hông)
      const container = (f, r, y0, ry, m, open, roll) => {
        const b = mul(M4(f, y0, r, 0, ry || 0, 0), roll ? M4(0, 9.4, 0, roll, 0, 0) : M4(0, 10.4, 0));   // gốc = tâm thùng
        K.add(m, boxGeo(48, 19.6, 18.6, 24), b);
        for (const y of [-10, 10]) for (const z of [-9.3, 9.3]) K.add('steelDark', new THREE.BoxGeometry(48.4, 1, 1), at(b, 0, y, z));
        for (const x of [-24, 24]) for (const y of [-10, 10]) for (const z of [-9.3, 9.3]) K.add('steelDark', new THREE.BoxGeometry(1.4, 1.4, 1.4), at(b, x, y, z));
        for (const x of [-24, 24]) { for (const y of [-10, 10]) K.add('steelDark', new THREE.BoxGeometry(1, 1, 18.6), at(b, x, y, 0)); for (const z of [-9.3, 9.3]) K.add('steelDark', new THREE.BoxGeometry(1, 20, 1), at(b, x, 0, z)); }
        // 2 cánh cửa đuôi (+x), mỗi cánh 2 thanh khoá đứng; open: cánh phải mở toang (bản lề ở mép z = 9.3) lộ lòng tối
        for (const s of [-1, 1]) {
          if (s > 0 && open) { K.add(m, boxGeo(0.5, 19, 9.2, 24), mul(at(b, 24.4, 0, 9.3, 0, -1.2, 0), M4(0, 0, -4.6))); continue; }
          K.add(m, boxGeo(0.5, 19, 9.2, 24), at(b, 24.3, 0, s * 4.65));
          for (const z of [-2.2, 2.2]) K.add('steelGray', new THREE.CylinderGeometry(0.3, 0.3, 19, 6), at(b, 24.8, 0, s * 4.65 + z));
        }
        if (open) K.add('void', new THREE.PlaneGeometry(9, 18.6), at(b, 24.1, 0, 4.65, 0, HP, 0));
        signM('un6', 7, 7, at(b, 24.6, 3, -4.65, 0, HP, 0));
        for (const s of [-1, 1]) signM('un6', 7, 7, at(b, -12, 2, s * 9.45, 0, s > 0 ? 0 : Math.PI, 0));
      };
      // trạm rửa mắt + tắm khẩn cấp (ống đứng sơn vàng, chụp vòi sen, tay kéo, chậu rửa mắt, bàn đạp, biển xanh)
      const eyewash = (f, r, ry) => {
        const b = M4(f, 0, r, 0, ry || 0, 0);
        K.add('steelDark', new THREE.CylinderGeometry(2, 2, 0.4, 10), at(b, 0, 0.2, 0));
        K.add('yellow', new THREE.CylinderGeometry(0.4, 0.4, 19, 8), at(b, 0, 9.7, 0));
        K.add('yellow', new THREE.CylinderGeometry(0.35, 0.35, 5, 8), at(b, 2.5, 19, 0, 0, 0, HP));
        K.add('yellow', new THREE.ConeGeometry(2, 1.6, 12, 1, true), at(b, 5, 17.8, 0));
        K.add('steelGray', new THREE.CylinderGeometry(0.12, 0.12, 6, 4), at(b, 4.2, 14.6, 0));
        K.add('steelGray', new THREE.TorusGeometry(0.8, 0.12, 4, 3), at(b, 4.2, 11.2, 0, HP, 0, 0));
        K.add('yellow', new THREE.CylinderGeometry(0.3, 0.3, 3.2, 6), at(b, 1.6, 8, 0, 0, 0, HP));
        K.add('steelWhite', new THREE.CylinderGeometry(1.8, 1.2, 1, 12), at(b, 3.4, 8.2, 0));
        K.add('steelDark', new THREE.BoxGeometry(2.4, 0.3, 2.4), at(b, 2, 0.6, 0));
        signM('eye', 4, 4, at(b, -0.5, 13, 0, 0, -HP, 0));
        K.solid(f, r, 4, 4, 0, 20);
      };

      // =====================================================================================================
      // MẶT TIỀN CỬA HẦM: 2 trụ + lanh tô bê tông rêu, gờ đỉnh, gân trụ; mái hắt chống nổ vươn ra trước (tường cánh + bản
      // mái), cửa chống nổ trượt 2 cánh mở hé trên ray, khoang đệm phía sau với cửa áp lực trong + đèn sự cố; 2 bên là buồng
      // khoá khí nhân viên / vật liệu; biển tên song ngữ, biểu tượng nguy hiểm sinh học, camera, loa, đèn, ống điện ốp tường
      // =====================================================================================================
      const DW = 44, DH = 56, TOPY = 92, FW = CUT + 16, PD = 26, FC = (F0 + F1) / 2;
      for (const s of [-1, 1]) MB(FC, (TOPY - 6) / 2, s * (DW + FW) / 2, F1 - F0, TOPY + 6, FW - DW);
      MB(FC, (DH + TOPY) / 2, 0, F1 - F0, TOPY - DH, DW * 2);
      cbt('concDark', FC + 2, TOPY + 2, 0, F1 - F0 + 6, 4, FW * 2 + 6, 0.8);
      K.box('concDark', F1 + 1, 64, 0, 2, 2, FW * 2 - 2);                                     // gờ chỉ ngang
      for (const s of [-1, 1]) K.box('bioMoss', F1 + 1.2, TOPY / 2, s * (DW + 12), 2.4, TOPY, 6, 0, 64);   // gân trụ
      // mái hắt: 2 tường cánh + bản mái vát cạnh, sọc cảnh báo mép trong, tấm thép chống va chân tường
      for (const s of [-1, 1]) {
        cbt('bioMoss', F1 + PD / 2, (DH + 12) / 2 - 1, s * (DW + 5), PD, DH + 10, 8, 0.8);
        K.box('hazard', F1 + PD - 2.5, DH / 2, s * (DW + 0.8), 5, DH - 4, 0.4, 0, 16);
        K.box('steelDark', F1 + PD / 2, 2.5, s * (DW + 0.7), PD - 4, 5, 0.5);
        K.box('lampRed', F1 + 4, DH - 6, s * (DW + 0.8), 2, 1.6, 0.6);
      }
      cbt('bioMoss', F1 + PD / 2 + 1, DH + 6, 0, PD + 2, 12, DW * 2 + 20, 1.2);
      K.box('concDark', F1 + PD + 1, DH - 0.6, 0, 1.2, 1.2, DW * 2 + 18);                     // gờ cắt nước mép mái
      for (let r = -DW + 8; r <= DW - 8; r += 16) K.box('lampAmber', F1 + PD / 2, DH - 0.3, r, 3, 0.6, 1.4);   // đèn trần mái hắt
      K.solid(F1 + PD / 2, 0, PD / 2, DW + 9, DH - 1, DH + 12);
      for (const s of [-1, 1]) K.solid(F1 + PD / 2, s * (DW + 5), PD / 2, 4, -2, DH + 10);
      // khung thép ô cửa + ngưỡng, ray dưới 2 cánh cửa trượt, ổ khoá chốt
      K.box('steelDark', F1 + 0.6, DH + 1.5, 0, 1.2, 3, DW * 2 + 2);
      for (const s of [-1, 1]) K.box('steelDark', F1 + 0.6, DH / 2, s * (DW - 0.6), 1.2, DH, 1.2);
      K.box('steelDark', F1 - 12, 0.5, 0, 10, 1, DW * 2 + 24);
      for (const fo of [-15, -9]) K.box('steelGray', F1 + fo, 1.15, 0, 1.2, 0.5, DW * 2 + 24);
      K.box('steelGray', F1 + PD / 2, 0.45, 0, PD, 0.5, DW * 2 - 2, 0, 24);
      const [dA, dB] = doorMats(), GAP = 22, LW = DW + 6;
      K.add(dB, boxGeo(8, DH, LW, 0), M4(F1 - 12, DH / 2, -(GAP / 2 + LW / 2)));
      K.add(dA, boxGeo(8, DH, LW, 0), M4(F1 - 12, DH / 2, GAP / 2 + LW / 2));
      for (const s of [-1, 1]) for (const y of [8, DH / 2, DH - 8]) { K.box('steelGray', F1 - 7.6, y, s * (GAP / 2 + 2), 1.2, 4, 3); K.cyl('steelDark', F1 - 7.4, y - 1, s * (GAP / 2 + 5), 0.8, 0.8, 2, 8); }
      // khoang đệm: sàn, đèn sự cố đỏ 2 vách, cửa áp lực trong đóng kín (khung sọc, bánh lái khoá, ô kính tròn)
      K.box('concDark', (F0 + F1) / 2 - 6, 0.3, 0, F1 - F0 + 4, 0.6, DW * 2);
      K.box('steelDark', -7, DH / 2, 0, 2, DH, DW * 2);
      K.box('hazard', -5.8, DH / 2, 0, 0.4, DH - 4, 30, 0, 16);
      K.box('steelGray', -5.5, 20, 0, 0.8, 34, 22);
      K.add('steelDark', new THREE.TorusGeometry(3, 0.5, 6, 16), M4(-4.8, 18, 0, 0, HP, 0));
      K.add('glass', new THREE.CircleGeometry(2, 14), M4(-5, 30, 0, 0, HP, 0));
      for (const s of [-1, 1]) for (const fo of [-2, 8]) K.box('lampRed', fo, 40, s * (DW - 0.4), 2, 1.2, 0.6);
      K.box('concDark', F0 - 12, (DH + M.h) / 2 + 0.4, 0, 26, M.h - DH + 0.8, CUT * 2 + 10);   // mái lòng hầm sau mặt tiền (che rãnh khoét gò)
      // biển tên + biểu tượng + chiếu sáng, camera, loa báo động, lưới hút gió, ống điện + hộp đấu ốp tường
      sign('main', F1 + 0.5, 79.5, 0, 100, 25);
      for (const s of [-1, 1]) {
        sign('bioicon', F1 + 2.5, 46, s * 80, 20, 20);
        K.box('louver', F1 + 0.4, 16, s * 84, 0.6, 12, 16);
        K.box('steelDark', F1 + 0.3, 16, s * 84, 0.4, 13, 17);
        K.box('steelGray', F1 + 3, 84, s * (FW - 6), 5, 4, 4); K.box('glass', F1 + 5.6, 84, s * (FW - 6), 0.4, 2.4, 2.4);
        K.box('steelDark', F1 + 1, 86.6, s * (FW - 6), 2, 1.2, 1.2);
        K.add('steelGray', new THREE.ConeGeometry(2.2, 4, 10, 1, true), M4(F1 + 3, 63.5, s * (DW + 26), 0, 0, -HP));
        K.box('steelDark', F1 + 1, 63.5, s * (DW + 26), 2, 1.4, 1.4);
        K.box('lampAmber', F1 + 2, 74, s * (DW + 22), 4, 4, 5);
        K.cyl('steelGray', F1 + 1, 0, s * (FW - 1.5), 0.8, 0.8, TOPY - 2, 8);
        K.cyl('steelGray', F1 + 1, 0, s * (FW - 3.6), 0.6, 0.6, TOPY - 6, 8);
        for (let y = 10; y < TOPY - 6; y += 14) K.box('steelDark', F1 + 1.1, y, s * (FW - 2.5), 1.6, 0.6, 4);
        K.box('steelGray', F1 + 2, 34, s * (FW - 2.5), 3, 6, 5);
      }
      K.solid(FC, 0, (F1 - F0) / 2 + 2, FW, -6, TOPY + 4);
      // ---- BUỒNG KHOÁ KHÍ NHÂN VIÊN (trái): hộp bê tông nhô trước tường, cửa áp lực tay quay có ô kính tròn, đồng hồ áp,
      //      bàn phím thẻ, đèn báo, biển; ống cấp khí thở (cho đồ bảo hộ áp dương) chạy dọc tường
      {
        const r = -(DW + 9 + 9), f0 = F1, f1 = F1 + 20, fm = (f0 + f1) / 2;   // r -71..-53: giữa tường cánh mái hắt và tường chắn đất
        cbt('bioMoss', fm, 15, r, 20, 30, 18, 0.8);
        cbt('concDark', fm, 31, r, 22, 2, 20, 0.4);
        K.box('steelDark', f1 + 0.3, 11.5, r, 0.6, 23, 13);
        cbt('steelGray', f1 + 1, 11, r, 1.6, 21, 11, 0.5);
        K.add('glass', new THREE.CircleGeometry(1.6, 14), M4(f1 + 1.85, 16, r, 0, HP, 0));
        K.add('steelDark', new THREE.TorusGeometry(2, 0.35, 5, 14), M4(f1 + 2.2, 9.5, r, 0, HP, 0));
        for (let k = 0; k < 4; k++) K.box('steelDark', f1 + 2.2, 9.5, r, 0.3, 0.3, 4, 0, 0, k * Math.PI / 4);
        for (const y of [3, 19]) K.box('steelDark', f1 + 1.4, y, r - 5.6, 1.6, 2, 1.2);   // bản lề
        K.box('steelWhite', f1 + 0.6, 12, r + 7.4, 1, 2.6, 2); K.add('steelDark', new THREE.CircleGeometry(0.8, 10), M4(f1 + 1.15, 12, r + 7.4, 0, HP, 0));
        K.box('steelDark', f1 + 0.6, 9, r - 7.4, 1, 2.4, 1.8);
        K.box('lampRed', f1 + 0.8, 24.5, r + 4, 1, 1.4, 1.4); K.box('lampAmber', f1 + 0.8, 24.5, r - 4, 1, 1.4, 1.4);
        sign('airP', f1 + 0.4, 27, r, 13, 4.9);
        pipeRun('yellow', [[f0 + 1, 44, r - 8.4], [f0 + 1, 32.6, r - 8.4], [f1 - 4, 32.6, r - 8.4], [f1 - 4, 14, r - 9.6]], 0.5);
        K.solid(fm, r, 11, 10, 0, 32);
      }
      // ---- KHOÁ KHÍ VẬT LIỆU (phải): cửa tròn nồi hấp xuyên tường (vấu khoá hướng tâm, tay quay), giá con lăn, xe đẩy rác
      {
        const r = DW + 9 + 9, f0 = F1, f1 = F1 + 18, fm = (f0 + f1) / 2;
        cbt('bioMoss', fm, 15, r, 18, 30, 18, 0.8);
        cbt('concDark', fm, 31, r, 20, 2, 20, 0.4);
        K.add('steelDark', new THREE.CylinderGeometry(7.6, 7.6, 1, 24), M4(f1 + 0.4, 12, r, 0, 0, HP));
        K.add('steelGray', new THREE.CylinderGeometry(6.6, 6.6, 1.4, 24), M4(f1 + 1.2, 12, r, 0, 0, HP));
        for (let k = 0; k < 10; k++) { const a = k * TAU / 10; K.box('steelDark', f1 + 1.8, 12 + Math.cos(a) * 6.3, r + Math.sin(a) * 6.3, 0.8, 1.6, 1.6, 0, 0, a); }
        K.add('steelDark', new THREE.CylinderGeometry(1, 1, 1.4, 10), M4(f1 + 2.4, 12, r, 0, 0, HP));
        for (let k = 0; k < 3; k++) K.box('steelDark', f1 + 2.6, 12, r, 0.4, 7, 0.5, 0, 0, k * Math.PI / 3);
        K.box('hazard', f1 + 0.3, 12, r, 0.3, 17, 16.6, 0, 16);
        sign('airM', f1 + 0.4, 27, r, 13, 4.9);
        // giá con lăn (bàn nhận hàng) trước cửa nồi hấp
        K.box('steelGray', f1 + 7, 4.6, r, 12, 0.6, 10);
        for (let x = -5; x <= 5; x += 1.5) K.add('steelGray', new THREE.CylinderGeometry(0.4, 0.4, 9.6, 6), M4(f1 + 7 + x, 5.2, r, HP, 0, 0));
        for (const [x, z] of [[-5, -4], [-5, 4], [5, -4], [5, 4]]) K.box('steelDark', f1 + 7 + x, 2.2, r + z, 0.6, 4.4, 0.6);
        K.solid(fm, r, 10, 10, 0, 32); K.solid(f1 + 7, r, 6, 5, 0, 6);
        for (let i = 0; i < 4; i++) redBin(f1 + 16 + i * 7.4, r - 2 + (i % 2) * 1.2, (hash(i + 70) - 0.5) * 0.4, i === 3);
        K.solid(f1 + 27, r - 2, 15, 4, 0, 10);
      }
      // ---- dây leo rủ gờ đỉnh mặt tiền + mái hắt; rêu cây bụi chân tường; đống đổ nát trước cửa
      if (ABANDONED) {
        vines(F1 + 3.2, -FW + 4, F1 + 3.2, -DW - 12, TOPY + 2, 1, 0, 300, 7);
        vines(F1 + 3.2, DW + 12, F1 + 3.2, FW - 4, TOPY + 2, 1, 0, 302, 7);
        vines(F1 + 3.2, -DW - 10, F1 + 3.2, DW + 10, TOPY + 2, 1, 0, 304, 13, 15);   // trên biển tên: rủ ngắn, thưa
        vines(F1 + PD + 2.2, -DW - 8, F1 + PD + 2.2, DW + 8, DH + 12, 1, 0, 310, 10, 22);
        shrubs(F1 + 1, -FW + 2, F1 + 1, -DW - 32, 1, 0, 320, 7, 7);
        shrubs(F1 + 1, DW + 32, F1 + 1, FW - 2, 1, 0, 330, 7, 7);
        for (let k = 0; k < 16; k++) { const sz = 1 + hash(k + 8600) * 3.2; K.add('concDark', new THREE.IcosahedronGeometry(sz, 0), M4(F1 + PD + 4 + hash(k + 8601) * 14, sz * 0.35, -DW + 6 + hash(k + 8602) * 30, hash(k) * 3, hash(k + 1) * 3, 0, 1, 0.6, 1)); }
        K.add('steelDark', new THREE.BoxGeometry(1.4, 0.6, 22), M4(F1 + PD + 8, 0.8, 30, 0, 0.3, 1.45));
        signM('quar', 14, 4.7, M4(F1 + PD + 12, 0.55, -18, -HP + 0.1, 0, 0.6));
        K.add('drumRust', new THREE.CylinderGeometry(1.9, 1.9, 5.6, 14), M4(F1 + PD + 18, 1.9, 26, HP, 0.7, 0));
        spill(F1 + PD + 16, 22, 14, 0.5);
      }
      // ---- tường chắn đất 2 bên sân (bê tông rêu, đỉnh bám mặt gò thật), lỗ thoát nước chân tường, dây leo rủ mép trên
      const WF1 = M.fc + M.af + 12;
      for (const s of [-1, 1]) {
        const sh = new THREE.Shape(), pts = [];
        for (let f = F0; f <= WF1; f += 4) pts.push([f, Math.max(5, Math.max(K.earth(f, s * (CUT + 14)), K.earth(f, s * (CUT + 22))) + 3)]);
        sh.moveTo(F0, -6); sh.lineTo(WF1, -6);
        for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 20, bevelEnabled: false });
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
        K.add('bioMoss', g, M4(0, 0, s > 0 ? CUT - 8 : -CUT - 12));
        K.solid((F0 + WF1) / 2, s * (CUT + 2), (WF1 - F0) / 2, 10, -6, pts.reduce((a, p) => Math.max(a, p[1]), 0));
        const ri = s * (CUT - 8.1);
        for (let f = F1 + 30; f < WF1 - 4; f += 12) K.add('void', new THREE.CircleGeometry(0.9, 8), M4(f, 3.5, ri, 0, s > 0 ? Math.PI : 0, 0));
        if (ABANDONED) {
          for (let i = 1; i < pts.length; i += 2) {
            const [f, y] = pts[i], hh = 8 + hash(i * 7 + s * 3) * Math.min(26, y - 4);
            if (f > F1 + PD + 2) K.add('vine', new THREE.PlaneGeometry(8, hh), M4(f, y - hh / 2 + 1, ri - s * 0.5, 0, 0, 0));
          }
          shrubs(F1 + PD + 6, ri - s * 1, WF1 - 2, ri - s * 1, 0, -s, 340 + s * 20, 9, 6);
        }
      }

      // =====================================================================================================
      // SÂN CÁCH LY: buồng tắm hoá chất / khử nhiễm nhân viên + hành lang kín sang nhà kiểm soát; giàn rửa khử nhiễm xe;
      // rào cách ly riêng có cổng trượt + chốt gác; lều khử nhiễm sập, phuy cứu hộ, bồn IBC, công-te-nơ mẫu bệnh phẩm
      // =====================================================================================================
      {
        // buồng tắm hoá chất dạng mô-đun thép (vách trắng, dải vàng), 3 khoang: thay đồ bẩn -> tắm hoá chất -> tắm nước
        const fa = F1 + PD + 2, fb = 100, rA = -70, rB = -48, fm = (fa + fb) / 2, rm = (rA + rB) / 2, HH = 22;
        K.cbox('concDark', fm, 0.8, rm, fb - fa + 3, 1.6, rB - rA + 3, 0.4);
        K.cbox('steelWhite', fm, HH / 2 + 1.6, rm, fb - fa, HH, rB - rA, 0.6);
        K.box('yellow', fm, HH - 3, rB + 0.2, fb - fa + 0.2, 2.4, 0.4); K.box('yellow', fm, HH - 3, rA - 0.2, fb - fa + 0.2, 2.4, 0.4);
        K.cbox('steelGray', fm, HH + 2.4, rm, fb - fa + 2, 1.2, rB - rA + 2, 0.3);
        for (const x of [fa + 13, fa + 26]) K.box('steelDark', x, HH / 2 + 1.6, rB + 0.25, 0.6, HH, 0.4);   // mạch nối mô-đun
        K.box('steelGray', fa + 7, 10, rB + 0.4, 6, 15, 0.6); K.box('steelGray', fa + 20, 10, rB + 0.4, 6, 15, 0.6);
        K.box('lampAmber', fa + 7, 19, rB + 0.8, 2, 1, 1);
        for (const x of [fa + 31, fa + 36]) win(M4(x, 0, rB, 0, 0, 0), 0, 15, 3.6, 3);
        // cửa đầu hồi quay về cửa buồng khoá khí (lối tắm xong -> vào khoá khí) + tấm sàn lưới nối; hành lang kín sang nhà
        // kiểm soát ra vào (vách tôn sóng, cửa sổ nhỏ)
        K.box('steelGray', fa - 0.4, 10, rm - 2, 0.6, 15, 6); K.box('lampRed', fa - 0.8, 19, rm - 2, 1, 1, 2);
        K.box('steelDark', (F1 + 20 + fa) / 2, 0.5, -62, fa - F1 - 20, 0.4, 10);
        K.box('corrGray', 94, 10.6, (-108 + rA) / 2, 12, 18, rA + 108, 0, 24);
        K.cbox('steelGray', 94, 20.4, (-108 + rA) / 2, 14, 1.4, 40, 0.3);
        for (const z of [-100, -88, -78]) win(M4(100, 0, z, 0, HP, 0), 0, 12, 3, 3);
        // trên nóc: bồn nước tắm, bồn dung dịch khử nhiễm, ống thông hơi, quạt hút
        K.cyl('steelWhite', fa + 10, HH + 3, rm, 4, 4, 9, 14); K.add('steelWhite', new THREE.ConeGeometry(4.2, 1.6, 14), M4(fa + 10, HH + 12.8, rm));
        for (const s of [-1, 1]) K.box('steelGray', fa + 10 + s * 2.6, HH + 3.6, rm, 0.6, 1.2, 8);
        K.cyl('steelGray', fa + 27, HH + 3, rm + 4, 0.6, 0.6, 7, 6); K.cyl('steelGray', fa + 33, HH + 3, rm - 4, 2, 2, 3, 12);
        // bồn hứng nước thải tắm (về hệ tiệt trùng), lưới thoát sàn, phuy hoá chất trên pa-lét, ống mềm
        K.box('steelDark', fm, 0.9, rB + 6, fb - fa - 6, 0.3, 3);
        K.cbox('olive', fb + 4, 5, rB - 4, 8, 10, 8, 0.4); K.solid(fb + 4, rB - 4, 4, 4, 0, 10);
        K.box('wood', fa + 4, 0.7, rB + 14, 12, 1.4, 12); for (let j = 0; j < 4; j++) drum(K, fa + 1 + (j % 2) * 6, rB + 11 + Math.floor(j / 2) * 6, j ? 'drumBlue' : 'yellow', 1.4);
        pipeRun('rubber', [[fa + 7, 8.6, rB + 11], [fa + 9, 1, rB + 7], [fa + 18, 0.8, rB + 4], [fa + 22, 6, rB + 0.6]], 0.45);
        sign('decon', fm, HH - 7.5, rB + 0.5, 30, 6.25, 0);
        eyewash(fa + 16, rB + 18, Math.PI);
        K.solid(fm, rm, (fb - fa) / 2 + 1, (rB - rA) / 2 + 1, 0, HH + 4);
        K.solid(94, (-108 + rA) / 2, 7, 20, 0, 21);
        if (ABANDONED) { vines(fa, rB + 1, fb, rB + 1, HH + 3, 0, 1, 360, 12, 14); shrubs(fa, rB + 3, fb, rB + 3, 0, 1, 370, 12, 6); }
      }
      // ---- GIÀN RỬA KHỬ NHIỄM XE: bệ bê tông có rãnh thu nước lưới thép, 2 khung cổng thép mang ống phun (đỉnh + 2 bên),
      //      bơm + bồn IBC dung dịch, biển song ngữ, đèn
      {
        const f0 = 98, f1 = 130, fm = (f0 + f1) / 2, RW = 22;
        K.cbox('concDark', fm, 0.4, 0, f1 - f0, 1, RW * 2 + 6, 0.3);
        for (const r of [-RW, 0, RW]) { K.box('void', fm, 0.92, r, f1 - f0 - 4, 0.05, 2.6); for (let f = f0 + 3; f < f1 - 2; f += 1.4) K.box('steelDark', f, 1, r, 0.35, 0.3, 2.8); }
        for (const f of [f0 + 6, f1 - 6]) {
          for (const s of [-1, 1]) {
            K.box('yellow', f, 20, s * RW, 1.6, 40, 1.6); K.box('hazard', f, 3, s * RW, 1.8, 6, 1.8, 0, 16);
            K.cbox('concDark', f, 0.8, s * RW, 4, 1.6, 4, 0.3);
            K.cyl('steelGray', f + 1.4, 2, s * (RW - 1.4), 0.4, 0.4, 36, 6);
            for (let y = 6; y < 38; y += 6) K.add('steelDark', new THREE.ConeGeometry(0.5, 1, 6), M4(f + 1.4, y, s * (RW - 2.2), 0, 0, s * HP));
            K.solid(f, s * RW, 1.4, 1.4, 0, 42);
          }
          K.box('yellow', f, 40.8, 0, 1.6, 1.6, RW * 2 + 1.6);
          K.add('steelGray', new THREE.CylinderGeometry(0.45, 0.45, RW * 2 - 2, 6), M4(f + 1.4, 38.6, 0, HP, 0, 0));
          for (let r = -RW + 4; r <= RW - 4; r += 4) K.add('steelDark', new THREE.ConeGeometry(0.5, 1, 6), M4(f + 1.4, 37.7, r, Math.PI, 0, 0));
          K.box('lampAmber', f, 39.6, 0, 3, 0.6, 1.4);
        }
        sign('wash', f1 - 5.6, 46, 0, 28, 5.8);
        K.box('steelGray', f1 - 6, 46, 0, 0.6, 8, 29);
        // bồn IBC dung dịch khử nhiễm + cụm bơm, ống cấp vào rãnh
        ibc(f0 + 10, -RW - 18, 0.1); K.cbox('steelDark', f0 + 20, 3, -RW - 18, 8, 6, 6, 0.4); K.cyl('steelGray', f0 + 20, 6, -RW - 18, 1.8, 1.8, 2, 10);
        pipeRun('steelGray', [[f0 + 15, 1.2, -RW - 18], [f0 + 17, 1.2, -RW - 18]], 0.5);
        pipeRun('steelGray', [[f0 + 20, 1.2, -RW - 15], [f0 + 20, 1.2, -RW - 3], [f0 + 20, 2.2, -RW - 1.4]], 0.6);
        K.solid(f0 + 15, -RW - 18, 10, 5, 0, 11);
        spill(f0 + 14, -RW - 8, 12, 1.1);
      }
      // ---- RÀO CÁCH LY QUANH SÂN CỬA HẦM: cổng trượt mở hé, chốt gác, biển song ngữ; đường hầm cống ngầm bê tông
      {
        const FF = 136, RR = 100, GW = 24;
        fence(K, FF, -RR, FF, -GW, 1, 15, true); fence(K, FF, GW + 32, FF, RR, 1, 15, true);
        fence(K, 102, -RR, FF, -RR, -1, 15, true); fence(K, 84, RR, FF, RR, 1, 15, true);
        fence(K, 84, CUT + 12, 84, RR, 1, 15, false); fence(K, 84, -CUT - 12, 84, -RR, 1, 15, false);
        // cánh cổng trượt (khung lưới) kéo hé, ray dưới
        {
          const lg = new THREE.PlaneGeometry(34, 14), luv = lg.attributes.uv;
          for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 17, luv.getY(i) * 7);
          K.add(meshFenceMat(), lg, M4(FF - 2, 8, GW + 26, 0, 0, 0));
          for (const [a, b] of [[[FF - 2, 1, GW + 9], [FF - 2, 1, GW + 43]], [[FF - 2, 15, GW + 9], [FF - 2, 15, GW + 43]], [[FF - 2, 1, GW + 9], [FF - 2, 15, GW + 9]], [[FF - 2, 1, GW + 43], [FF - 2, 15, GW + 43]], [[FF - 2, 1, GW + 9], [FF - 2, 15, GW + 43]]]) K.beam('steelGray', a, b, 0.7);
          K.box('steelDark', FF - 2, 0.4, GW + 26, 2, 0.8, 50);
          K.cyl('steelGray', FF, 0, GW, 1.2, 1.2, 18, 8); K.cyl('steelGray', FF, 0, -GW, 1.2, 1.2, 18, 8);
          K.solid(FF - 2, GW + 26, 1.5, 17, 0, 16);
        }
        booth(120, GW + 16, HP, 12, 10);
        for (const s of [-1, 1]) sign('quar', FF + 1.6, 9, s * 66, 18, 6);
        sign('quar', FF + 1.6, 9, -GW - 14, 12, 4);
        // xà chắn (barie) gãy rủ xuống cạnh chốt
        K.box('steelGray', FF - 5, 5, -GW - 4, 2.4, 10, 2.4);
        K.add('bands', new THREE.BoxGeometry(1.6, 34, 1.6), M4(FF - 5, 8.8, -GW + 10.8, -1.05, 0, 0));
        // nắp mương cáp / ống từ hầm ra hệ tiệt trùng nước thải (bê tông đúc sẵn)
        for (let r = CUT + 12; r < 112; r += 6.4) K.cbox('concDark', 74, 0.5, r, 10, 1, 6, 0.3);
      }
      // ---- trong sân: lều khử nhiễm dã chiến sập (khung vòm + bạt võng), phuy cứu hộ, bồn IBC, công-te-nơ mẫu bệnh phẩm,
      //      rào chữ A, băng phong toả, vũng tràn hoá chất
      {
        const tf = 119, tr = -80;
        // 4 vòm khung (2 vòm phía +f sập: 1 bẹp, 1 đổ nghiêng), bạt phủ võng theo khung, nửa sau sụp xuống
        for (let k = 0; k < 4; k++) {
          const f = tf - 12 + k * 8;
          K.add('steelGray', new THREE.TorusGeometry(10, 0.3, 4, 12, Math.PI), M4(f, 0, tr, k === 3 ? -1.2 : 0, HP, 0, 1, k === 2 ? 0.45 : 1, 1));
        }
        const tg = new THREE.PlaneGeometry(26, 22, 6, 8); tg.rotateX(-HP);
        { const P = tg.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), u = z / 10.5; P.setY(i, Math.max(0.6, 10.2 * Math.sqrt(Math.max(0, 1 - u * u)) * (x > 2 ? 0.45 : 1) - Math.max(0, x - 6) * 0.25 + (hash(i * 3) - 0.5) * 1.2)); } tg.computeVertexNormals(); }
        K.add('tarp', tg, M4(tf, 0, tr, 0, 0, 0));
        for (let i = 0; i < 7; i++) overpack(84 + (i % 4) * 6.6, -30 - Math.floor(i / 4) * 7, hash(i + 80) * 3, i === 6, 0);
        overpack(100, -24, 0.6, true); spill(96, -40, 16, 0.3);
        K.solid(94, -34, 12, 8, 0, 9);
        container(108, 80, 0, 0, MAT.bioContG, false);
        K.solid(108, 80, 25, 10, 0, 21);
        // rào chắn chữ A sơn sọc + băng phong toả vàng đen võng giữa các cột (quanh lều sập)
        for (const [f, r] of [[88, 30]]) { K.box('hazard', f, 5, r, 2, 3, 10, 0, 16); for (const z of [-4, 4]) K.beam('steelGray', [f, 6.5, r + z], [f + 2, 0, r + z], 0.4); }
        for (let k = 0; k < 5; k++) { const r = -96 + k * 9; K.cyl('steelGray', 102.5, 0, r, 0.3, 0.3, 8, 5); if (k) { const r0 = r - 9; K.beam('yellow', [102.5, 7.4, r0], [102.5, 6.2, r0 + 4.5], 0.15); K.beam('yellow', [102.5, 6.2, r0 + 4.5], [102.5, 7.4, r], 0.15); } }
        eyewash(76, 40, -HP);
      }

      // =====================================================================================================
      // NÓC GÒ: cụm lọc khí thải HEPA (2 dãy hộp lọc túi kín, quạt ly tâm, ống gió góp) -> ống xả cao; cửa lấy gió tươi;
      // giếng thông gió chụp nấm; cửa thoát hiểm; cột ăng-ten + chảo; ống gió chỉ hướng gió; cầu thang thép lên nóc;
      // cây bụi / cây non mọc phủ
      // =====================================================================================================
      const keep = [];   // vùng thiết bị trên gò (không trồng cây): [f, r, bán kính]
      {
        const hf = -100, hr = 26, y = K.earth(hf, hr) - 1.5;
        keep.push([hf, hr, 46]);
        K.cbox('concDark', hf + 2, y + 1.5, hr, 72, 3, 60, 0.6);
        K.box('steelDark', hf - 6, y + 3.6, hr, 52, 1.2, 50);
        // 2 dãy x 4 hộp lọc (hộp inox, cửa túi kín tròn 2 bên, tay khoá, đồng hồ chênh áp)
        for (const rr of [hr - 12, hr + 12]) {
          for (let i = 0; i < 4; i++) {
            const f = hf - 24 + i * 11;
            K.cbox('steelWhite', f, y + 12, rr, 10, 16, 12, 0.4);
            for (const s of [-1, 1]) {
              K.add('steelGray', new THREE.CylinderGeometry(2.6, 2.6, 1.2, 14), M4(f, y + 12, rr + s * 6.4, HP, 0, 0));
              K.add('rubber', new THREE.CylinderGeometry(2, 2, 1.3, 12), M4(f, y + 12, rr + s * 6.6, HP, 0, 0));
            }
            for (const yy of [6, 18]) K.box('steelDark', f + 5.1, y + yy, rr, 0.4, 0.8, 8);
            K.box('steelWhite', f + 5.2, y + 15, rr - 3, 0.6, 2, 2);
          }
          // ống gió vào từ dưới đất (khí thải phòng thí nghiệm) + chụp chuyển tiếp ra quạt
          K.box('steelGray', hf - 33, y + 9, rr, 6, 18, 8); K.box('steelGray', hf - 30, y + 15, rr, 6, 8, 8);
          K.add('steelGray', new THREE.CylinderGeometry(6, 3, 6, 4, 1, true), M4(hf + 21, y + 12, rr, Math.PI / 4, 0, HP));   // chụp chóp vuông nằm ngang
          // quạt ly tâm: vỏ xoắn ốc, động cơ, chụp dây curoa, đế chống rung
          K.cbox('steelDark', hf + 28, y + 4.6, rr, 12, 1.4, 12, 0.3);
          K.add('steelGray', new THREE.CylinderGeometry(6, 6, 5, 18), M4(hf + 28, y + 11, rr, HP, 0, 0));
          K.box('steelGray', hf + 31, y + 17, rr, 6, 6, 5);
          K.cyl('steelDark', hf + 26, y + 5.3, rr + 6, 2, 2, 1, 10);
          K.add('olive', new THREE.CylinderGeometry(2.2, 2.2, 6, 12), M4(hf + 25, y + 8, rr + 7.5, HP, 0, 0));
          K.box('yellow', hf + 28, y + 10, rr + 4.2, 6, 4, 1.2);
          K.box('steelGray', hf + 31, y + 23, rr, 5, 6, 5);
        }
        // ống gió góp xả: chạy từ 2 quạt lên rồi sang ống xả cao
        K.box('steelGray', hf + 31, y + 28, hr, 6, 4, 30);
        const sf = -64, sr = 62, sy = K.earth(sf, sr) - 2;
        pipeRun('steelGray', [[hf + 31, y + 28, hr + 15], [hf + 31, y + 28, sr - 4], [sf, y + 28, sr - 4], [sf, y + 28, sr]], 2.4, 10);
        for (const z of [hr - 8, hr + 8, sr - 4]) { K.box('steelDark', hf + 31, y + 15, z, 1, 24, 1); K.box('steelDark', hf + 31, y + 25.6, z, 4, 0.8, 1); }
        // sàn thao tác lưới thép quanh dãy lọc + lan can vàng, thang lên
        for (const rr of [hr - 23, hr + 23]) { K.box('steelDark', hf - 6, y + 4.8, rr, 52, 0.4, 4); for (let x = -26; x <= 26; x += 6.5) K.box('steelGray', hf - 6 + x, y + 8.4, rr + Math.sign(rr - hr) * 2, 0.35, 7.2, 0.35); K.box('yellow', hf - 6, y + 11.8, rr + Math.sign(rr - hr) * 2, 52, 0.4, 0.4); }
        for (const z of [-26, -10]) K.box('steelGray', hf + 37.6, y + 6, hr + z, 0.4, 7, 0.4);
        sign('hepa', hf + 37.9, y + 7, hr - 18, 18, 3.75);
        stack(K, sf, sr, 4.4, 3.4, 116 + sy, 'steelGray');
        for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5, ax = sf + Math.cos(a) * 30, az = sr + Math.sin(a) * 30, ay = K.earth(ax, az); K.box('concDark', ax, ay + 1, az, 4, 3, 4); K.beam('steelDark', [ax, ay + 3, az], [sf, sy + 90, sr], 0.3); }
        anim.steam.push([K.W(sf, sr), L.G + sy + 124]);
        keep.push([sf, sr, 14]);
        K.solid(hf + 2, hr, 36, 32, y, y + 31);
      }
      // giếng thông gió chụp nấm có lưới chắn chim
      for (const [f, r] of [[-24, 96], [-24, -96], [-160, -60], [-160, 70]]) {
        const y = K.earth(f, r) - 3; keep.push([f, r, 16]);
        K.cyl('concDark', f, y, r, 11, 12, 8, 16); K.cyl('steelGray', f, y + 8, r, 7, 7, 22, 14);
        K.cyl('steelDark', f, y + 30, r, 7.6, 7.6, 5, 14); K.cyl('steelGray', f, y + 35, r, 9, 15, 7, 16);
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8; K.box('steelDark', f + Math.cos(a) * 7.4, y + 32.5, r + Math.sin(a) * 7.4, 0.4, 4, 0.4); }
        for (const y2 of [12, 20]) K.add('steelDark', new THREE.TorusGeometry(7.1, 0.3, 4, 16), M4(f, y + y2, r, HP, 0, 0));
        K.solid(f, r, 12, 12, y, y + 42);
      }
      // cửa lấy gió tươi: hộp lá chắn mưa, lưới lọc, ống cổ ngỗng
      {
        const f = -40, r = -58, y = K.earth(f, r) - 1; keep.push([f, r, 22]);
        K.cbox('concDark', f, y + 1, r, 30, 2, 24, 0.4);
        K.cbox('steelGray', f, y + 10, r, 24, 16, 18, 0.5);
        for (const s of [-1, 1]) K.box('louver', f, y + 10, r + s * 9.2, 22, 13, 0.5);
        K.box('louver', f + 12.2, y + 10, r, 0.5, 13, 16);
        K.cbox('steelGray', f, y + 19, r, 27, 1.2, 21, 0.3);
        pipeRun('steelGray', [[f - 8, y + 19, r], [f - 8, y + 26, r], [f - 3, y + 30, r]], 2, 10);
        K.solid(f, r, 15, 12, y, y + 31);
      }
      // cửa thoát hiểm: hộp bê tông, nắp thép, lan can chắn, tay vịn thang
      {
        const f = -148, r = -104, y = K.earth(f, r) - 1; keep.push([f, r, 14]);
        K.cbox('bioMoss', f, y + 3, r, 18, 6, 18, 0.5);
        K.cbox('steelDark', f, y + 6.4, r, 10, 1, 10, 0.3); K.box('yellow', f + 4, y + 7.2, r, 1, 0.6, 6);
        for (const [a, b] of [[[-8, -8], [8, -8]], [[8, -8], [8, 8]], [[-8, 8], [8, 8]]]) { K.beam('yellow', [f + a[0], y + 13, r + a[1]], [f + b[0], y + 13, r + b[1]], 0.35); }
        for (const [x, z] of [[-8, -8], [8, -8], [8, 8], [-8, 8]]) K.box('yellow', f + x, y + 9.5, r + z, 0.4, 7, 0.4);
        K.solid(f, r, 9, 9, y, y + 14);
      }
      // cột ăng-ten giàn + chảo vi ba, cột thu lôi, ống gió chỉ hướng (quan trọng khi rò rỉ sinh học)
      {
        const af = -70, ar = -112, ay = K.earth(af, ar) - 2; keep.push([af, ar, 16]);
        K.cbox('concDark', af, ay + 1.5, ar, 10, 3, 10, 0.4);
        for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.beam('steelGray', [af + x * 3, ay + 3, ar + z * 3], [af + x * 1, ay + 60, ar + z * 1], 0.6);
        for (let yy = 10; yy < 60; yy += 10) { const w = 3 - (yy / 60) * 2; K.box('steelGray', af, ay + yy, ar, w * 2, 0.4, 0.4); K.box('steelGray', af, ay + yy, ar, 0.4, 0.4, w * 2); }
        K.add('steelWhite', new THREE.SphereGeometry(7, 16, 8, 0, TAU, 0, Math.PI * 0.32), M4(af + 3, ay + 46, ar, 0, 0, -HP + 0.1));
        K.cyl('steelGray', af, ay + 60, ar, 0.2, 0.4, 16, 4);
        K.solid(af, ar, 5, 5, ay, ay + 76);
        const wf = -44, wr = -22, wy = K.earth(wf, wr) - 1; keep.push([wf, wr, 6]);
        K.cyl('steelGray', wf, wy, wr, 0.5, 0.7, 34, 6);
        K.add('ochre', new THREE.ConeGeometry(2.4, 12, 10, 1, true), M4(wf + 6, wy + 33, wr + 1, 0, 0.3, HP + 0.6));
        K.solid(wf, wr, 2, 2, wy, wy + 36);
      }
      // bậc thang bê tông lên nóc gò (cạnh mặt tiền trái, bám theo mặt dốc như bậc trên đê / gò thật): mỗi bậc là khối bê tông
      // cắm vào sườn (cao ~0.22 m), lan can ống thép 2 bên trên cột, chiếu nghỉ bê tông ở đỉnh
      {
        const r = -FW - 7, fA = 76, fB = 18, N = 40, pts = [];
        for (let i = 0; i <= N; i++) { const f = fA + (fB - fA) * i / N; pts.push([f, Math.max(0, K.earth(f, r), K.earth(f, r - 3), K.earth(f, r + 3), i ? pts[i - 1][1] : 0)]); }
        for (let i = 1; i <= N; i++) {
          const [fa, ya] = pts[i - 1], [fb, yb] = pts[i], top = yb + 0.3, bot = Math.min(ya, yb) - 2;
          K.box('concDark', (fa + fb) / 2, (top + bot) / 2, r, Math.abs(fb - fa) + 0.25, top - bot, 6);
        }
        for (const dz of [-3.4, 3.4]) {
          let pp = null;
          for (let i = 0; i <= N; i += 5) {
            const [f, y] = pts[i]; K.box('steelGray', f, y + 3.5, r + dz, 0.4, 7, 0.4);
            if (pp) K.beam('yellow', [pp[0], pp[1] + 7, r + dz], [f, y + 7, r + dz], 0.35);
            pp = pts[i];
          }
        }
        K.cbox('concDark', fB - 5, pts[N][1] + 0.3, r, 10, 1.2, 8, 0.3);
      }
      // cây bụi / dương xỉ / cây non mọc hoang trên gò (dày ở sườn, thưa trên nóc; tránh thiết bị)
      if (ABANDONED) {
        const free = (f, r, pad) => !keep.some(([kf, kr, kd]) => Math.hypot(f - kf, r - kr) < kd + pad);
        const inMound = (f, r) => { const u = (f - M.fc) / M.af, v = r / M.ar; return Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6); };
        let nt = 0;
        for (let i = 0; i < 420; i++) {
          const f = M.fc + (hash(i * 3 + 14000) * 2 - 1) * M.af, r = (hash(i * 3 + 14001) * 2 - 1) * M.ar, d = inMound(f, r);
          if (d > 0.98 || (f > F0 - 30 && Math.abs(r) < FW + 10) || !free(f, r, 4)) continue;
          const slope = d > 0.68, k = hash(i + 14002);
          if (!slope && k > 0.45) continue;   // nóc gò: thưa hơn (cỏ dại phủ)
          if (k < 0.07 && nt < 14 && free(f, r, 14)) { tree(f, r, 44 + hash(i + 14003) * 40, i * 17 + 14004); nt++; }
          else if (k < 0.45) bush(f, r, 7 + hash(i + 14005) * 9, i * 7 + 14006);
          else fern(f, r, 6 + hash(i + 14007) * 6, i * 5 + 14008);
        }
      }

      // =====================================================================================================
      // NHÀ KIỂM SOÁT RA VÀO + PHÒNG THAY ĐỒ (2 tầng) cạnh sân, biển song ngữ, dây leo
      // =====================================================================================================
      officeBlock(K, kit, 104, -150, 0, 56, 84, 2, null);
      sign('access', 132.4, 31, -150, 56, 9.3);
      eyewash(68, -150, Math.PI);
      if (ABANDONED) { vines(132.6, -190, 132.6, -110, 38, 1, 0, 400, 11, 18); vines(76, -191.6, 132, -191.6, 38, 0, -1, 410, 10, 24); shrubs(76, -193, 132, -193, 0, -1, 420, 10, 7); }

      // =====================================================================================================
      // HỆ TIỆT TRÙNG NƯỚC THẢI (EDS): 3 bồn "kill tank" inox có áo hơi + mô-tơ khuấy trong gờ chống tràn, sàn thao tác nối
      // đỉnh bồn, ống góp hơi / xả, nhà bơm, bộ trao đổi nhiệt làm nguội, tủ lấy mẫu, mương ống từ hầm sang, biển
      // =====================================================================================================
      {
        const f = 100, r = 160;
        K.cbox('concDark', f, 0.8, r, 66, 1.6, 96, 0.4);
        for (const s2 of [-1, 1]) { K.cbox('concDark', f, 3, r + s2 * 47, 66, 4.4, 2, 0.3); K.cbox('concDark', f + s2 * 32, 3, r, 2, 4.4, 96, 0.3); }
        const tf = f - 10;
        for (const z of [-30, 0, 30]) {
          vTank(K, tf, r + z, 11, 40, z * 0.1);
          for (const y of [10, 22, 34]) K.add('steelGray', new THREE.TorusGeometry(11.1, 0.35, 4, 28), M4(tf, y, r + z, HP, 0, 0));
          K.cyl('olive', tf, 45.4, r + z, 2.2, 2.2, 5, 12); K.cyl('steelGray', tf, 50.4, r + z, 1.4, 1.4, 1.2, 8);
          K.box('steelWhite', tf + 4, 47, r + z, 3, 3, 3);
          signCyl('kill', tf, 26, r + z, 11.08, 10, 5, -0.7);
          pipeRun('steelGray', [[tf + 8, 0.8, r + z], [tf + 12.5, 0.8, r + z], [tf + 12.5, 5, r + z]], 1, 8);
          K.cyl('steelDark', tf + 12.5, 5, r + z, 1.8, 1.8, 2.4, 10);
        }
        // sàn thao tác lưới thép trên đỉnh 3 bồn + lan can, thang lồng từ đất
        K.box('steelDark', tf - 14, 44.6, r, 4, 0.5, 86);
        for (let z = -42; z <= 42; z += 7) K.box('steelGray', tf - 16, 48, r + z, 0.35, 7, 0.35);
        K.box('yellow', tf - 16, 51.4, r, 0.4, 0.4, 86); K.box('steelGray', tf - 16, 48, r, 0.3, 0.3, 86);
        for (let y = 2; y < 44; y += 2.4) K.box('steelGray', tf - 14, y, r - 46, 2.6, 0.3, 0.3);
        for (const s2 of [-1, 1]) K.box('steelGray', tf - 14 + s2 * 1.3, 23, r - 46, 0.3, 44, 0.3);
        // ống góp hơi nước + ống xả dọc đỉnh bồn, nhánh xuống từng bồn; ống nước thải vào từ mương (hầm)
        pipeRun('steelWhite', [[tf - 6, 54, r - 44], [tf - 6, 54, r + 40], [tf - 6, 47, r + 40]], 1.3, 10);
        for (const z of [-30, 0, 30]) pipe('steelWhite', [tf - 6, 54, r + z], [tf - 6, 43, r + z], 0.8);
        pipeRun('steelGray', [[74, 1, r - 48], [74, 6, r - 48], [74, 6, r - 30], [tf - 8, 6, r - 30]], 1.4, 10);
        flange([74, 4, r - 48], 1.4, 'y');
        // nhà bơm, bộ trao đổi nhiệt nằm ngang trên 2 gối, tủ lấy mẫu
        K.cbox('steelWhite', f + 22, 9, r, 18, 18, 40, 0.5); K.cbox('steelGray', f + 22, 18.8, r, 20, 1.6, 42, 0.3);
        K.box('steelGray', f + 31.2, 7.5, r + 8, 0.6, 13, 6);
        K.box('louver', f + 31.2, 13, r - 8, 0.5, 6, 10);
        K.add('steelWhite', new THREE.CylinderGeometry(4, 4, 24, 16), M4(f + 18, 8, r + 36, 0, 0, HP));
        for (const s2 of [-1, 1]) { K.add('steelWhite', new THREE.SphereGeometry(4, 12, 6), M4(f + 18 + s2 * 12, 8, r + 36, 0, 0, 0, 0.35, 1, 1)); K.cbox('concDark', f + 18 + s2 * 8, 2.4, r + 36, 3, 4.8, 8, 0.3); }
        for (const x of [-6, 6]) K.cyl('steelGray', f + 18 + x, 12, r + 36, 1, 1, 4, 8);
        K.cbox('steelWhite', f + 26, 7, r - 34, 6, 12, 8, 0.4);
        for (const z of [-41, -19]) K.box('steelGray', f + 34, 8, r + z, 0.5, 16, 0.5);
        sign('eds', f + 34.3, 13, r - 30, 26, 5.4);
        sign('eds', f + 31.1, 16, r + 8, 14, 2.9);
        eyewash(f + 28, r - 44, 0);
        K.solid(f + 22, r, 10, 21, 0, 20); K.solid(f + 18, r + 36, 15, 5, 0, 13); K.solid(tf - 14, r, 3, 44, 40, 53);
        if (ABANDONED) { spill(f + 12, r - 12, 18, 0.4, 1.6); spill(f - 24, r + 20, 12, 1.4, 1.6); shrubs(f - 34, r - 46, f - 34, r + 46, -1, 0, 430, 8, 7); }
      }
      // =====================================================================================================
      // BỒN NITƠ LỎNG (bảo quản mẫu -196°C): 2 bồn đứng hai vỏ, 2 giàn hoá hơi cánh tản nhiệt phủ băng, ống góp, tủ nạp
      // từ xe bồn hướng ra đường, lồng bình Dewar, rào riêng + cổng, biển song ngữ
      // =====================================================================================================
      {
        const f0 = 172, f1 = 228, r0 = 112, r1 = 198, fm = (f0 + f1) / 2;
        K.cbox('conc', fm, 0.6, (r0 + r1) / 2, f1 - f0 - 4, 1.2, r1 - r0 - 4, 0.4);
        for (const [tr, R, H] of [[134, 8, 62], [174, 6.4, 46]]) {
          const tf = 210;
          K.cyl('concDark', tf, 0, tr, R + 4, R + 4, 2, 20); K.cyl('steelWhite', tf, 2, tr, R, R, H, 20);
          K.add('steelWhite', new THREE.SphereGeometry(R, 20, 8, 0, TAU, 0, HP), M4(tf, H + 2, tr));
          for (let k = 0; k < 4; k++) { const a = k * HP + 0.4; K.beam('steelGray', [tf + Math.cos(a) * (R + 3), 0, tr + Math.sin(a) * (R + 3)], [tf + Math.cos(a) * (R - 0.4), 14, tr + Math.sin(a) * (R - 0.4)], 1); }
          K.cyl('steelGray', tf - R - 0.8, 3, tr, 0.5, 0.5, H - 4, 6);
          K.box('steelWhite', tf - R - 1, 14, tr + 3, 1.6, 2.6, 2.6);
          K.solid(tf, tr, R + 3, R + 3, 0, H + R + 2);
        }
        signCyl('ln2', 210, 32, 134, 8.06, 10.5, 4, Math.PI + 0.7);
        // giàn hoá hơi: dãy ống cánh nhôm đứng (phủ băng trắng), ống góp đỉnh / đáy
        for (const z of [134, 172]) {
          for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { const x = 184 + j * 4, zz = z + (i - 3) * 2.4; K.cyl('steelWhite', x, 1.6, zz, 0.9, 1.1, 28, 6); for (let a = 0; a < 2; a++) K.box('steelWhite', x, 15, zz, 0.2, 26, 2.4, a * HP); }
          K.box('steelGray', 188, 30.4, z, 12, 1, 18); K.box('steelGray', 188, 1.2, z, 12, 1.2, 18);
          pipeRun('steelGray', [[194, 3, z], [201, 3, z]], 0.8);
          K.solid(188, z, 7, 9, 0, 31);
        }
        // tủ nạp từ xe bồn (hướng ra đường trục ngang), ống mềm, biển; lồng bình Dewar
        K.cbox('steelWhite', f0 + 4, 8, 152, 5, 14, 12, 0.4);
        K.add('steelGray', new THREE.TorusGeometry(2.6, 0.5, 6, 12), M4(f0 + 1.2, 8, 152, 0, HP, 0));
        pipeRun('steelGray', [[f0 + 6, 3, 152], [196, 3, 152], [196, 3, 172]], 0.8);
        sign('ln2', f0 + 1.4, 12.5, 152, 10, 3.75, -HP);
        {
          const cf = 186, cr = 190;
          K.box('steelDark', cf, 0.4, cr, 14, 0.8, 8);
          for (let i = 0; i < 6; i++) K.cyl(i === 4 ? 'steelGray' : 'steelWhite', cf - 5 + (i % 3) * 5, 0.8, cr - 2 + Math.floor(i / 3) * 4, 1.6, 1.6, i === 4 ? 9 : 12, 10);
          K.add(meshFenceMat(), new THREE.PlaneGeometry(14, 14), M4(cf, 7.8, cr + 4.2, 0, 0, 0));
          K.solid(cf, cr, 7, 4, 0, 14);
        }
        fence(K, f0, r0, f1, r0, -1, 12); fence(K, f0, r1, f1, r1, 1, 12); fence(K, f1, r0, f1, r1, 1, 12);
        fence(K, f0, r0, f0, 140, -1, 12); fence(K, f0, 164, f0, r1, -1, 12);
        sign('ln2', f0 - 1.4, 7, 126, 10, 3.75, -HP);
        eyewash(f0 + 8, r0 + 8, Math.PI);
      }

      // =====================================================================================================
      // BÃI TRỰC THĂNG CẤP CỨU / CHỞ MẪU: sân bê tông, vòng tròn chữ H + chữ thập đỏ, đèn viền, cọc neo, ống gió, trực thăng
      // UH-60 bỏ lại (thân dọc trục r)
      // =====================================================================================================
      {
        const a0 = 160, a1 = 232, r0 = 204, r1 = 334, cf = (a0 + a1) / 2, cr = (r0 + r1) / 2;
        K.cbox('conc', cf, 0.4, cr, a1 - a0, 1.4, r1 - r0, 0.5);
        K.add(MAT.bioHeli || (MAT.bioHeli = decalT('bioHeli', texOf('bioHeli', 512, Math.round(512 * (r1 - r0) / (a1 - a0)), (q, w, h) => {
          q.clearRect(0, 0, w, h);
          const k = w / (a1 - a0), cx = w / 2, cy = h / 2;
          q.strokeStyle = 'rgba(60,58,52,0.55)'; q.lineWidth = 1.5;
          for (let y = 32 * k; y < h; y += 32 * k) { q.beginPath(); q.moveTo(0, y); q.lineTo(w, y); q.stroke(); }
          q.beginPath(); q.moveTo(cx, 0); q.lineTo(cx, h); q.stroke();
          q.strokeStyle = 'rgba(232,190,40,0.9)'; q.lineWidth = 3 * k; q.strokeRect(4 * k, 4 * k, w - 8 * k, h - 8 * k);
          q.strokeStyle = 'rgba(238,234,222,0.92)'; q.lineWidth = 3 * k; q.beginPath(); q.arc(cx, cy, 30 * k, 0, TAU); q.stroke();
          q.fillStyle = 'rgba(190,36,28,0.9)'; q.fillRect(cx - 6 * k, cy - 18 * k, 12 * k, 36 * k); q.fillRect(cx - 18 * k, cy - 6 * k, 36 * k, 12 * k);
          q.fillStyle = 'rgba(238,234,222,0.92)';
          q.fillRect(cx - 12 * k, cy - 2 * k, 24 * k, 4 * k); q.fillRect(cx - 12 * k, cy - 14 * k, 4 * k, 28 * k); q.fillRect(cx + 8 * k, cy - 14 * k, 4 * k, 28 * k);
          for (let i = 0; i < 12; i++) blotch(q, cx + (hash(i + 177) - 0.5) * 60 * k, cy + (hash(i + 178) - 0.5) * 80 * k, (6 + hash(i + 179) * 10) * k, '30,28,24', 0.4);
          for (let i = 0; i < 40; i++) blotch(q, hash(i + 190) * w, hash(i + 191) * h, (3 + hash(i + 192) * 8) * k, '70,92,40', 0.5);   // rêu bám mạch
        }))), new THREE.PlaneGeometry(a1 - a0, r1 - r0), M4(cf, 1.15, cr, -HP, 0, 0));
        for (let r = r0 + 6; r < r1; r += 20) for (const f of [a0 + 3, a1 - 3]) K.box(r % 40 < 20 ? 'lampAmber' : 'lampRed', f, 1.6, r, 1.4, 0.8, 1.4);
        // mũi hướng -r (rô-to lệch về phía đường trục, tránh khung tháp canh góc)
        heli(K, M4(cf, 0.6, cr - 4, 0, HP + 0.08, 0));
        K.solid(cf, cr, 11, 66, 0, 34, -0.08);
        for (const [x, z] of [[-14, -30], [14, -30], [-14, 30], [14, 30]]) K.cyl('steelDark', cf + x, 1, cr + z, 0.5, 0.5, 0.8, 6);
        K.cyl('steelGray', a0 + 4, 0, r1 + 8, 0.5, 0.7, 30, 6);
        K.add('ochre', new THREE.ConeGeometry(2.4, 12, 10, 1, true), M4(a0 + 10, 29, r1 + 8, 0, 0.6, HP + 0.25));
        K.cyl('steelGray', a1 - 6, 0, r0 - 2, 1.6, 1.6, 2, 8); K.cyl('lampRed', a1 - 6, 2, r0 - 2, 2, 2, 9, 12);
        if (ABANDONED) for (let i = 0; i < 26; i++) { const t = hash(i + 15000); (t < 0.5 ? fern : bush)(a0 + 2 + hash(i + 15001) * (a1 - a0 - 4), (hash(i + 15002) < 0.5 ? r0 + 1 : r1 - 1) + (hash(i + 15003) - 0.5) * 3, 3 + hash(i + 15004) * 4, i * 9 + 15005, 1.1); }
      }

      // =====================================================================================================
      // NHÀ NUÔI GIỮ ĐỘNG VẬT THÍ NGHIỆM (vivarium): nhà bê tông 1 tầng mái bằng, dải cửa sổ cao, cửa cuốn nhập thức ăn,
      // cửa người có mái che, quạt hút mái + dàn điều hoà, ống thoát khí; chuồng ngoài trời lưới thép 4 ô có mái lưới;
      // xi-lô thức ăn; dây leo, cây bụi, chuồng đổ
      // =====================================================================================================
      {
        const af = -115, ar = -242, AL = 120, AW = 40, AH = 28, fa = af - AL / 2, fb = af + AL / 2, ra = ar - AW / 2, rb = ar + AW / 2;
        K.cbox('concDark', af, 1.5, ar, AL + 2, 3, AW + 2, 0.4);
        cbt('bioMoss', af, AH / 2 + 1, ar, AL, AH, AW, 1);
        for (const s2 of [-1, 1]) cbt('concDark', af, AH + 2.5, ar + s2 * (AW / 2 - 0.7), AL, 3, 1.4, 0.3, 0, null, 64);
        for (const s2 of [-1, 1]) cbt('concDark', af + s2 * (AL / 2 - 0.7), AH + 2.5, ar, 1.4, 3, AW, 0.3, 0, null, 64);
        const sideA = M4(af, 0, ra, 0, Math.PI, 0), sideB = M4(af, 0, rb, 0, 0, 0);
        for (let x = -AL / 2 + 10; x <= AL / 2 - 10; x += 12) { win(sideA, x, AH - 7, 7, 3); win(sideB, x, AH - 7, 7, 3); }
        K.box('shutter', af - 30, 10.5, ra - 0.4, 18, 18, 0.6); K.cbox('steelGray', af - 30, 20.6, ra - 1.6, 20, 2.2, 2.4, 0.3);
        K.cbox('concDark', af - 30, 0.6, ra - 8, 22, 1.2, 14, 0.3);
        K.box('steelGray', af + 6, 8.5, ra - 0.4, 6, 15, 0.6); K.cbox('concDark', af + 6, 17, ra - 4, 12, 1, 8, 0.3); K.box('lampAmber', af + 6, 16, ra - 1, 2, 1, 1);
        for (const x of [-40, -10, 20, 45]) { K.cyl('steelGray', af + x, AH + 1, ar + 6, 2.6, 2.6, 4, 12); K.cyl('steelGray', af + x, AH + 5, ar + 6, 4.4, 2.6, 2.2, 12); }
        K.cbox('steelWhite', af - 20, AH + 4, ar - 8, 16, 6, 12, 0.5); K.cbox('steelWhite', af + 30, AH + 4, ar - 8, 12, 6, 10, 0.5);
        for (const z of [-4, 4]) K.cyl('steelGray', af - 42, AH + 1, ar + z, 1.2, 1.2, 8, 8);
        sign('animal', af - 8, AH - 15, ra - 0.4, 50, 10.4, Math.PI);
        sign('bioicon', fa - 0.4, 14, ar, 10, 10, -HP);
        acUnit(sideA, 30, 8); acUnit(sideA, -10, 8);
        K.solid(af, ar, AL / 2 + 1, AW / 2 + 1, 0, AH + 8);
        // chuồng ngoài trời (đầu +f): sàn bê tông có rãnh, khung ống, vách + mái lưới thép, vách ngăn 4 ô, cửa ô
        const k0 = fb, k1 = fb + 40, km = (k0 + k1) / 2, KH = 16;
        K.cbox('concDark', km, 0.6, ar, 40, 1.2, AW, 0.3);
        K.box('void', km, 1.25, ra + 2, 40, 0.05, 1.4);
        const mesh = (w, h, mtx) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2); K.add(meshFenceMat(), g, mtx); };
        for (const z of [ra, rb]) mesh(40, KH, M4(km, KH / 2 + 1, z, 0, 0, 0));
        mesh(AW, KH, M4(k1, KH / 2 + 1, ar, 0, HP, 0));
        for (let i = 1; i < 4; i++) mesh(AW - 2, KH, M4(k0 + i * 10, KH / 2 + 1, ar, 0, HP, 0));
        const roofM = new THREE.PlaneGeometry(40, AW); { const uv = roofM.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 20, uv.getY(i) * AW / 2); }
        K.add(meshFenceMat(), roofM, M4(km, KH + 1, ar, -HP, 0, 0));
        for (let i = 0; i <= 4; i++) for (const z of [ra, rb]) K.cyl('steelGray', k0 + i * 10, 0, z, 0.5, 0.5, KH + 1, 6);
        for (const z of [ra, rb]) K.box('steelGray', km, KH + 1, z, 40, 0.6, 0.6);
        for (let i = 0; i <= 4; i++) K.box('steelGray', k0 + i * 10, KH + 1, ar, 0.6, 0.6, AW);
        for (let i = 0; i < 4; i++) { K.cyl('steelGray', k0 + 5 + i * 10, 1.2, ra + 4, 1.2, 1, 1, 8); if (i === 2) K.add('wood', new THREE.BoxGeometry(7, 6, 7), M4(k0 + 25, 4, ar + 8, 0.3, 0.6, 1.2)); }
        K.solid(km, ar, 20, AW / 2, 0, KH + 2);
        // xi-lô thức ăn: thân trụ, phễu côn, 4 chân giằng, thang
        {
          const sf = -40, sr = -211, SH = 30;
          for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { K.box('steelGray', sf + x * 4.6, 7, sr + z * 4.6, 1, 14, 1); K.cbox('concDark', sf + x * 4.6, 0.6, sr + z * 4.6, 2.6, 1.2, 2.6, 0.2); }
          K.add('steelWhite', new THREE.ConeGeometry(6.6, 9, 18, 1, true), M4(sf, 12, sr, Math.PI, 0, 0));
          K.cyl('steelWhite', sf, 16.5, sr, 6.6, 6.6, SH, 18);
          K.add('steelWhite', new THREE.ConeGeometry(6.8, 4, 18), M4(sf, SH + 18.5, sr));
          for (let y = 4; y < SH + 16; y += 2.4) K.box('steelGray', sf + 7.6, y, sr, 0.3, 0.3, 2.4);
          for (const s2 of [-1, 1]) K.box('steelGray', sf + 7.6, (SH + 20) / 2, sr + s2 * 1.2, 0.3, SH + 16, 0.3);
          pipe('steelGray', [sf, 7.5, sr], [fb - 1, AH - 2, ar + 10], 0.9);   // vít tải thức ăn vào đầu hồi nhà
          K.solid(sf, sr, 7, 7, 0, SH + 21);
        }
        if (ABANDONED) {
          vines(fa, ra - 0.8, fb, ra - 0.8, AH + 4, 0, -1, 440, 10, 22); vines(fa, rb + 0.8, fb, rb + 0.8, AH + 4, 0, 1, 450, 9, 26);
          vines(fa - 0.8, ra, fa - 0.8, rb, AH + 4, -1, 0, 460, 9, 24);
          shrubs(fa, ra - 2, af - 42, ra - 2, 0, -1, 470, 8, 8); shrubs(af - 18, ra - 2, fb, ra - 2, 0, -1, 480, 9, 7);
          shrubs(fa, rb + 2, fb + 40, rb + 2, 0, 1, 490, 7, 9);
          for (let i = 0; i < 6; i++) bush(k0 + 4 + hash(i + 15100) * 32, ra + 4 + hash(i + 15101) * (AW - 8), 4 + hash(i + 15102) * 4, i * 7 + 15103, 1.2);
        }
      }

      // =====================================================================================================
      // CỤM MÁY LÀM LẠNH + THÁP GIẢI NHIỆT (điều hoà phòng sạch áp suất âm); cụm bơm, cầu ống vượt đường sang gò
      // =====================================================================================================
      {
        const f = 40, r = -330;
        K.cbox('concDark', f, 0.6, r, 72, 1.2, 52, 0.4);
        for (const z of [-14, 14]) for (const x of [-20, 4]) {
          K.cbox('steelWhite', f + x, 7, r + z, 22, 12, 14, 0.5);
          K.box('louver', f + x, 7, r + z + 7.1, 18, 8, 0.4); K.box('louver', f + x, 7, r + z - 7.1, 18, 8, 0.4);
          for (const k of [-5, 5]) { K.cyl('steelDark', f + x + k, 13, r + z, 4.2, 4.2, 0.6, 16); for (const a of [0, HP]) K.box('steelGray', f + x + k, 13.5, r + z, 7.6, 0.3, 0.4, a); K.add('void', new THREE.CircleGeometry(3.8, 14), M4(f + x + k, 13.62, r + z, -HP, 0, 0)); }
        }
        K.cbox('steelGray', f + 28, 14, r, 14, 28, 24, 0.6); K.box('louver', f + 35.2, 10, r, 0.4, 16, 20);
        K.cyl('steelDark', f + 28, 28, r, 8, 8, 2, 18); K.cyl('steelGray', f + 28, 30, r, 7, 8, 5, 18);
        K.add('void', new THREE.CircleGeometry(6.6, 18), M4(f + 28, 35.05, r, -HP, 0, 0));
        sign('chill', f + 35.5, 23, r, 16, 3.3);
        // cụm bơm + ống góp; cầu ống vượt đường dịch vụ sang gò (2 cột chữ H, ống cấp / hồi nước lạnh có bảo ôn)
        for (const z of [-6, 6]) { K.cbox('olive', f - 30, 3, r + z, 8, 5, 4, 0.3); K.cyl('steelDark', f - 34, 3, r + z, 1.6, 1.6, 2, 8); }
        const pf = [f - 24, f - 20];
        for (const x of pf) pipeRun('steelWhite', [[x, 4, r + 10], [x, 4, r + 28], [x, 40, r + 28], [x, 40, -206], [x, 6, -206], [x, 6, -198]], 1.5, 10);
        for (const z of [-296, -264]) { for (const x of [f - 28, f - 16]) K.box('steelGray', x, 21, z, 1.6, 42, 1.6); K.box('steelGray', f - 22, 38.2, z, 14, 1.2, 1.6); K.cbox('concDark', f - 22, 0.8, z, 16, 1.6, 4, 0.3); K.solid(f - 22, z, 7, 1.5, 0, 42); }
        K.cbox('bioMoss', f - 22, 6, -200, 16, 12, 6, 0.6);
        sign('bioicon', f - 22, 8, -203.2, 5, 5, Math.PI);
        K.solid(f, r, 36, 26, 0, 36);
        if (ABANDONED) shrubs(f - 36, r - 27, f + 36, r - 27, 0, -1, 500, 9, 7);
      }
      // ---- THÁP NƯỚC: bồn trụ trên 4 chân giằng chéo, thang, lan can
      {
        const f = -40, r = -345, H = 96;
        for (const [x, z] of [[-12, -12], [-12, 12], [12, -12], [12, 12]]) { K.cbox('concDark', f + x, 1.5, r + z, 6, 3, 6, 0.4); K.add('olive', new THREE.BoxGeometry(2, H, 2), M4(f + x, H / 2 + 3, r + z)); }
        for (let y = 14; y < H; y += 24) for (const [a, b, c2, d] of [[-12, -12, 12, -12], [12, -12, 12, 12], [12, 12, -12, 12], [-12, 12, -12, -12]]) {
          K.beam('olive', [f + a, y, r + b], [f + c2, y, r + d], 0.9); K.beam('olive', [f + a, y, r + b], [f + c2, y + 24, r + d], 0.6); K.beam('olive', [f + c2, y, r + d], [f + a, y + 24, r + b], 0.6);
        }
        K.add('tankShell', new THREE.CylinderGeometry(19, 19, 30, 28, 1, true), M4(f, H + 18, r));
        K.add('steelWhite', new THREE.ConeGeometry(19.4, 8, 28), M4(f, H + 37, r));
        K.cyl('steelGray', f, H + 2, r, 21, 21, 1, 28);
        for (let i = 0; i < 24; i++) { const a = i * TAU / 24; K.box('steelGray', f + Math.cos(a) * 20.6, H + 5.5, r + Math.sin(a) * 20.6, 0.3, 6, 0.3); }
        K.add('steelGray', new THREE.TorusGeometry(20.6, 0.25, 3, 28), M4(f, H + 8.5, r, HP, 0, 0));
        K.add('steelGray', new THREE.CylinderGeometry(1.4, 1.4, H, 8), M4(f, H / 2 + 3, r));
        for (let y = 4; y < H; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 2.6), M4(f + 13.2, y, r));
        K.solid(f, r, 21, 21, 0, H + 42);
        if (ABANDONED) vines(f - 19.5, r - 12, f - 19.5, r + 12, H + 32, -1, 0, 510, 8, 20);
      }

      // =====================================================================================================
      // MÁY PHÁT ĐIỆN DỰ PHÒNG: 3 tổ máy đóng công-te-nơ (lá chắn gió 2 đầu, ống xả + bầu giảm thanh trên nóc), bồn dầu
      // nằm 2 vỏ trên gối trong bờ bao bê tông, bồn dầu ngày, mương cáp vào gò, biển
      // =====================================================================================================
      {
        const gr = 236;
        for (const [k, gf] of [[0, -160], [1, -110], [2, -60]]) {
          K.cbox('concDark', gf, 0.8, gr, 52, 1.6, 24, 0.3);
          K.add(MAT.bioContG, boxGeo(48, 19, 19.6, 24), M4(gf, 11.1, gr));
          for (const x of [-24, 24]) { K.box('louver', gf + x * 1.005, 11, gr, 0.5, 14, 15); for (const y of [1.6, 20.6]) for (const z of [-9.8, 9.8]) K.box('steelDark', gf + x, y, gr + z, 1.4, 1.4, 1.4); }
          // cửa bảo dưỡng + biển quay ra đường dịch vụ (+r); tổ máy giữa mở cửa lộ lòng tối
          if (k === 1) K.add('void', new THREE.PlaneGeometry(7, 14), M4(gf + 8, 9, gr + 9.85, 0, 0, 0)); else K.box('steelGray', gf + 8, 9, gr + 9.9, 8, 15, 0.4);
          K.box('steelGray', gf - 8, 9, gr + 9.9, 8, 15, 0.4);
          K.add('steelGray', new THREE.CylinderGeometry(2.2, 2.2, 14, 12), M4(gf + 8, 23.6, gr, 0, 0, HP));
          K.cyl('steelDark', gf + 14, 20.6, gr, 1, 1, 12, 8); K.add('steelDark', new THREE.CylinderGeometry(1.1, 1, 2.4, 8), M4(gf + 14.6, 33, gr, 0, 0, -0.5));
          signM('genset', 14, 2.9, M4(gf - 6, 18, gr + 10.05, 0, 0, 0));
          K.solid(gf, gr, 25, 11, 0, 30);
          anim.steam.push([K.W(gf + 14, gr), L.G + 35]);
        }
        // mương cáp nắp bê tông từ tổ máy vào chân gò
        for (let f = -180; f <= -40; f += 6.4) K.cbox('concDark', f, 0.5, 216, 6, 1, 8, 0.3);
        // bồn dầu chính: bờ bao, 2 gối, thân trụ nằm, đầu chỏm, cửa người, ống thở, thang, bồn dầu ngày
        const tf = 10, tr = 238;
        K.cbox('concDark', tf, 0.8, tr, 56, 1.6, 34, 0.3);
        for (const s2 of [-1, 1]) { K.cbox('concDark', tf, 3.5, tr + s2 * 16, 56, 5, 2, 0.3); K.cbox('concDark', tf + s2 * 27, 3.5, tr, 2, 5, 34, 0.3); }
        for (const x of [-12, 12]) K.cbox('concDark', tf + x, 4, tr, 4, 7, 20, 0.4);
        K.add('olive', new THREE.CylinderGeometry(10, 10, 40, 24), M4(tf, 15, tr, 0, 0, HP));
        for (const s2 of [-1, 1]) K.add('olive', new THREE.SphereGeometry(10, 18, 8), M4(tf + s2 * 20, 15, tr, 0, 0, 0, 0.3, 1, 1));
        K.cyl('steelDark', tf - 6, 24.6, tr, 2.4, 2.4, 1.4, 12); K.cyl('steelGray', tf + 8, 24.6, tr, 0.5, 0.5, 6, 6); K.add('steelGray', new THREE.SphereGeometry(1, 8, 6), M4(tf + 8, 31, tr));
        for (let y = 2; y < 25; y += 2.4) K.box('steelGray', tf + 24, y, tr - 8, 0.3, 0.3, 2.6);
        K.cbox('olive', tf - 34, 7, tr + 6, 8, 12, 8, 0.4);
        pipeRun('steelGray', [[tf - 20, 8, tr + 4], [tf - 30, 8, tr + 4]], 0.7);
        signM('genset', 20, 4.2, M4(tf, 15, tr + 10.15, 0, 0, 0));
        signM('genset', 12, 2.5, M4(tf + 10, 3.5, tr + 17.1, 0, 0, 0));
        K.solid(tf, tr, 28, 17, 0, 26); K.solid(tf - 34, tr + 6, 4, 4, 0, 13);
        if (ABANDONED) { shrubs(-186, gr - 13, 0, gr - 13, 0, -1, 520, 8, 8); vines(-184, gr - 10.2, -36, gr - 10.2, 21, 0, -1, 530, 14, 12); }
      }

      // =====================================================================================================
      // LÒ ĐỐT CHẤT THẢI BỆNH PHẨM: nhà lò, cửa nạp, ống khói 31 m nối ống khói ngang, bồn dầu đốt, dãy thùng rác y tế,
      // thùng tro, công-te-nơ lạnh chứa xác động vật
      // =====================================================================================================
      {
        const f = -150, r = 330;
        cbt('bioMoss', f, 17, r, 50, 34, 46, 1.2);
        K.box('shutter', f + 25.3, 11, r - 8, 0.6, 20, 16); K.cbox('steelGray', f + 26.6, 22, r - 8, 2.4, 2.4, 18, 0.3);
        for (const z of [-15, 10]) K.box('louver', f + 25.3, 26, r + z, 0.6, 6, 10);
        K.cbox('concDark', f + 32, 2, r - 8, 14, 4, 18, 0.4);   // sàn dỡ hàng
        K.cbox('steelGray', f, 37, r + 18, 8, 6, 8, 0.4);
        K.box('steelGray', f, 40, r + 32, 6, 6, 26);   // ống khói ngang (breeching)
        stack(K, f, r + 44, 6, 4, 250, 'conc');
        anim.steam.push([K.W(f, r + 44), L.G + 256]);
        signM('incin', 22, 4.6, M4(f + 25.4, 31, r + 10, 0, HP, 0));
        K.add('tankShell', new THREE.CylinderGeometry(6, 6, 22, 20), M4(f + 50, 8, r - 12, HP, 0, 0));
        for (const z of [-7, 7]) K.cbox('concDark', f + 50, 1.6, r - 12 + z, 10, 3.2, 2, 0.3);
        K.solid(f, r, 26, 24, 0, 36); K.solid(f + 50, r - 12, 7, 12, 0, 15); K.solid(f + 32, r - 8, 7, 9, 0, 5);
        for (let i = 0; i < 5; i++) redBin(f + 34 + (i % 3) * 7, r + 8 + Math.floor(i / 3) * 8, (hash(i + 90) - 0.5) * 0.5, i === 4);
        for (const x of [36, 48]) K.cbox('steelRust', f + x, 4, r + 30, 10, 8, 10, 0.4);   // thùng tro
        K.solid(f + 42, r + 30, 11, 5, 0, 8);
        // công-te-nơ lạnh (lạnh đông xác động vật): vỏ trắng, máy lạnh đầu
        container(-85, 385, 0, 0, 'steelWhite', false);
        K.cbox('steelGray', -85 - 26, 10, 385, 4, 18, 16, 0.5); K.box('louver', -85 - 28.1, 12, 385, 0.4, 12, 12);
        K.solid(-87, 385, 27, 10, 0, 21);
        if (ABANDONED) { vines(f + 25.6, r - 22, f + 25.6, r + 22, 34, 1, 0, 540, 9, 20); shrubs(f - 25, r - 24, f - 25, r + 24, -1, 0, 550, 8, 8); spill(f + 34, r + 14, 16, 2.1); }
      }
      // ---- TRẠM PHÁT ĐIỆN CHÍNH: nhà máy phát, lá chắn gió, quạt mái, 2 ống xả; bãi biến áp có rào + biển điện cao thế
      {
        const f = -20, r = 330;
        cbt('bioMoss', f, 18, r, 80, 36, 42, 1.2);
        for (const x of [-26, -2, 22]) K.box('louver', f + x, 25, r - 21.3, 14, 9, 0.6);
        K.box('shutter', f + 33, 11, r - 21.4, 12, 20, 0.6);
        for (const x of [-18, 18]) { K.cyl('steelGray', f + x, 36, r + 8, 3, 3.8, 50, 12); K.cyl('steelDark', f + x, 86, r + 8, 3.3, 3.3, 2, 12); }
        for (const x of [-30, -6]) { K.cbox('steelGray', f + x, 38.5, r - 6, 14, 4, 14, 0.5); K.add('void', new THREE.CircleGeometry(5.6, 18), M4(f + x, 40.6, r - 6, -HP, 0, 0)); }
        K.solid(f, r, 40, 21, 0, 42);
        const tf = f + 66, tr = r + 4;
        K.cbox('conc', tf, 0.6, tr, 26, 1.2, 50, 0.4);
        for (const z of [-14, 14]) { K.cbox('steelGray', tf, 8, tr + z, 10, 14, 9, 0.6); for (const x of [-3, 0, 3]) for (let j = 0; j < 3; j++) K.cyl('steelWhite', tf + x, 15 + j * 1.6, tr + z, 1.1, 1.3, 1.2, 8); }
        fence(K, tf - 15, tr - 27, tf + 15, tr - 27, -1, 13); fence(K, tf - 15, tr + 27, tf + 15, tr + 27, 1, 13); fence(K, tf + 15, tr - 27, tf + 15, tr + 27, 1, 13);
        K.plane(api.decal('hv_sign', api.signTex('hv_sign', ['DANGER', 'HIGH VOLTAGE — KEEP OUT'], { w: 512, h: 256, bg: '#efece2', fg: '#a3221a' })), tf + 15.6, 9, tr, 9, 4.5, HP);
        K.solid(tf, tr, 13, 26, 0, 22);
        if (ABANDONED) { vines(f - 40, r - 21.8, f + 40, r - 21.8, 36, 0, -1, 560, 10, 22); shrubs(f - 40, r + 23, f + 40, r + 23, 0, 1, 570, 9, 8); }
      }

      // =====================================================================================================
      // KHO CHẤT THẢI NGUY HẠI (góc sau trái): công-te-nơ ISO xếp chồng + 1 chiếc đổ nghiêng, pa-lét phuy (gỉ / phuy cứu
      // hộ), dãy bồn IBC, mái che tôn sập, tường rọ đá, vũng tràn, biển
      // =====================================================================================================
      {
        container(-140, -384, 0, 0, MAT.bioContR, true);
        container(-136, -384, 21, 0.04, MAT.bioContG, false);
        container(-108, -325, 0, HP + 0.15, MAT.bioContR, true, HP * 0.98);
        K.solid(-140, -384, 25, 10, 0, 42); K.solid(-108, -325, 25, 10, 0, 20, -(HP + 0.15));
        for (let p = 0; p < 6; p++) {
          const pf = -168 + (p % 3) * 14, pr = -350 + Math.floor(p / 3) * 14;
          K.box('wood', pf, 0.7, pr, 12, 1.4, 12);
          for (let j = 0; j < 4; j++) { const x = pf - 3 + (j % 2) * 6, z = pr - 3 + Math.floor(j / 2) * 6; if (p === 4 && j === 1) continue; if ((p + j) % 3) drum(K, x, z, (p + j) % 4 ? 'drumRust' : 'drumBlue', 1.4); else overpack(x, z, j, false, 1.4); }
        }
        overpack(-150, -336, 1.2, true); overpack(-146, -329, 2.2, true);
        K.solid(-154, -343, 22, 16, 0, 10);
        for (let i = 0; i < 4; i++) ibc(-170 + i * 11, -306, (hash(i + 95) - 0.5) * 0.2);
        K.solid(-153, -306, 22, 5, 0, 11);
        // mái che tôn sập một đầu (cột gãy)
        for (const [x, z, h] of [[-176, -372, 26], [-176, -332, 26], [-124, -372, 26], [-124, -332, 12]]) K.cyl('steelRust', x, 0, z, 0.8, 0.8, h, 6);
        K.add('corrGray', boxGeo(56, 0.5, 46, 24), M4(-150, 20, -352, 0.0, 0, -0.27));
        signM('spray', 14, 5.25, M4(-150, 22.6, -329.2, 0.25, 0, 0));
        hesco(-180, -400, -106, -400, 2); hesco(-92, -394, -92, -362, 2);
        sign('hazyard', -87.3, 12, -381, 22, 4.6);
        spill(-160, -322, 20, 0.6); spill(-128, -348, 26, 2.2); spill(-140, -364, 14, 1);
        eyewash(-186, -320, 0);
        if (ABANDONED) for (let i = 0; i < 18; i++) (hash(i + 15200) < 0.5 ? bush : fern)(-180 + hash(i + 15201) * 86, -400 + hash(i + 15202) * 104, 5 + hash(i + 15203) * 6, i * 13 + 15204);
      }

      // =====================================================================================================
      // XE BỎ LẠI: 2 xe tải chuyên dụng (phòng thí nghiệm di động / khử nhiễm), xe trinh sát, xe bồn nhiên liệu, xe xích
      // =====================================================================================================
      for (const [tf, tr, k] of [[196, -140, 0], [194, -174, 1]]) {
        const b = M4(tf, 0, tr, 0, k ? 0.06 : -0.03, 0);
        milTruck(K, b, 'kung');
        for (const s2 of [-1, 1]) signM('lab', 22, 5.5, at(b, -12, 21, s2 * 9.75, 0, s2 > 0 ? 0 : Math.PI, 0));
        signM('bioicon', 7, 7, at(b, -30.6, 22, 3, 0, -HP, 0));
        K.solid(tf, tr, 34, 11, 0, 32, k ? -0.06 : 0.03);
      }
      anim.vehicles.push({ type: 'SCOUT', f: 150, r: -214, a: HP + 0.1, ty: 0.4, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: 60, r: 238, a: 1.5, ty: -0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: -60, r: -280, a: Math.PI + 0.05, ty: 0, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'ARTILLERY', f: 90, r: 280, a: 0, chassis: true, cargo: 'jp8', hf: 50, hr: 13 });
      anim.vehicles.push({ type: 'GATLING', f: 196, r: -236, a: HP, ty: 0.8, hf: 43, hr: 32 });
      camoNet(K, M4(196, 0, -236, 0, 0.1, 0), 52, 76, 44, 5);

      // =====================================================================================================
      // CANH PHÒNG: tháp canh, lô cốt, tường rọ đá; biển nguy hiểm sinh học song ngữ trên rào ngoài
      // =====================================================================================================
      for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -iR + 38], [-iF + 38, iR - 38], [-iF + 38, -iR + 38], [iF - 28, G + 40], [iF - 28, -G - 40], [-iF + 30, 250], [-iF + 30, -250], [96, iR - 30], [60, -iR + 30]]) tower(f, r);
      for (const [f, r] of [[iF - 30, -300], [-iF + 24, 320], [-iF + 24, -316]]) pillbox(f, r);
      sandbags(K, 160, -118, 160, -196, 3, 0);
      const fw = (f, r, ry) => sign('fence', f, 9, r, 16, 5.3, ry);
      for (const [f, r, ry] of [[-120, -(L.hv - 35.4), Math.PI], [120, -(L.hv - 35.4), Math.PI], [-120, L.hv - 35.4, 0], [120, L.hv - 35.4, 0], [-(L.hu - 35.4), 200, -HP], [-(L.hu - 35.4), -200, -HP],
        [L.hu - 35.4, -120, HP], [L.hu - 35.4, 120, HP], [-(L.hu - 61.4), 0, -HP], [0, -(L.hv - 61.4), Math.PI], [0, L.hv - 61.4, 0]]) fw(f, r, ry);
    }
  };
})();
