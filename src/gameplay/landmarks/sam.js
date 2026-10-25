/**
 * CĂN CỨ PHÒNG KHÔNG — TIỂU ĐOÀN TÊN LỬA S-125 PECHORA (SA-3 GOA) GIỮA SA MẠC, BỎ HOANG
 *
 * Bố trí theo trận địa S-125 thật (tiểu đoàn hoả lực):
 * - gò đất giữa trận địa đặt cột ăng-ten dẫn bắn SNR-125 "Low Blow" (UNV) trên rơ-moóc: cabin thiết bị, 2 ăng-ten máng
 *   quét UV-10 / UV-11 nghiêng ±45°, ăng-ten parabol bám mục tiêu UV-12, chảo nhỏ phát lệnh; 2 cabin điều khiển UNK
 *   (thùng kung trên ZIL-131) trong ụ chữ U 2 bên gò, cáp nối trong mương có nắp bê tông
 * - 4 bệ phóng 5P73 (4 ray, 2 trên / 2 dưới) trên bệ bê tông tròn trong kè đất móng ngựa, đường vòng nối miệng kè
 * - hầm chỉ huy phủ đất (KP), kho tên lửa 2 vòm phủ đất + sân nạp đạn với xe vận tải - nạp đạn PR-14, giá cẩu
 * - trạm phát điện: 2 máy phát diesel 5E96 trên rơ-moóc trong ụ chữ U dưới lưới nguỵ trang, tủ phân phối, cáp đi
 *   trong mương nắp bê tông tới gò radar; kho dầu diesel 3 bồn nằm trong bờ bao đất
 * - radar cảnh giới P-18 "Spoon Rest D" (2 hàng x 8 ăng-ten Yagi trên cột) trên gò riêng, xe thiết bị dưới chân gò
 * - phòng thủ gần: 4 hố pháo ZU-23-2, 2 pháo S-60, hào giao thông kè bao cát, lô cốt, tháp canh, 2 lớp rào + cổng
 *   kiểm soát (bộ canh phòng chung), doanh trại, tháp nước, cột cờ, bãi xe trong ụ
 * Sa mạc: sơn nguỵ trang cát / xanh Liên Xô bạc nắng, tróc lớp sơn; cát dạt chân tường, kè, bánh xe và phủ mặt đường;
 * lưới nguỵ trang màu cát; nền sân cát nén thay bãi cỏ.
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Ụ đất / kè / gò: MapGen (map_gen.js,
 * detailSam / moundSam) — toạ độ đọc lại từ L.* để hình khớp địa hình.
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  // đường vòng nối miệng 4 kè bệ phóng; đường cổng vào chân dốc gò radar; 2 nhánh ngang 2 bên (r = ±300) tới doanh trại,
  // bãi xe, gò P-18 / trạm điện, kho dầu, sân nạp đạn; nhánh sau tới hầm chỉ huy
  const RING = [[92, 157], [-92, 157], [-92, -157], [92, -157]];
  const ROADS = [
    [[[320, 0], [92, 0]], 30],
    [RING.concat([RING[0]]), 20],
    [[[0, 157], [0, 300]], 16], [[[0, -157], [0, -300]], 16],
    [[[200, 300], [-150, 300]], 18], [[[200, -300], [-60, -300]], 18],
    [[[-92, 0], [-106, 0]], 20]
  ];
  const JUNCTIONS = RING.map(([f, r]) => [f, r, 24, 24]).concat([[92, 0, 22, 30], [0, 157, 16, 20], [0, -157, 16, 20], [0, 300, 16, 18], [0, -300, 16, 18], [-92, 0, 20, 20]]);
  // nền sỏi / đất nện quanh công trình (vẽ lên sân cát)
  const PADS = (hu) => [[hu - 150, -70, hu, 70], [-36, 66, 28, 150], [-36, -150, 28, -66], [-150, -60, -100, 60], [56, -428, 204, -316], [-42, -432, 68, -330],
    [-176, 294, -124, 346], [-62, 304, 56, 404], [56, 312, 200, 450], [-124, -440, -54, -304],
    [18, 214, 62, 258], [18, -258, 62, -214], [-248, 128, -204, 172], [-248, -172, -204, -128],
    [84, 170, 164, 254], [-164, 170, -84, 254], [-164, -254, -84, -170], [84, -254, 164, -170]];
  KINDS.sam = {
    name: 'CĂN CỨ PHÒNG KHÔNG', icon: '✈', color: '#9fd3ff',
    // slabs phủ cả khu: cỏ dại chỉ lún phún thưa thấp (sa mạc), không um tùm như căn cứ vùng cỏ
    site: { roads: ROADS, junctions: JUNCTIONS, gravel: PADS, slabs: [[-340, -540, 340, 540]], noGrow: [] },
    build(K, group, anim, api) {
      const { TAU, hash, texOf, speckle, blotch, grimePair, signTex, detailTex, MAT, decal, decalT, v3, M4, sandbags, drum, plateGeo, secKit, perimeter, milTruck, aaGun } = api;
      const L = K.L, mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);

      // =====================================================================================================
      // VẬT LIỆU SA MẠC (dùng chung cache MAT, khoá 'sam_')
      // =====================================================================================================
      // Sơn thép lát lặp 256 px / 3 m: nền + mảng nguỵ trang méo, mảng bạc phấn nắng, bụi cát, sơn tróc lộ lót gỉ, xước
      const paintTex = (key, base, blots, seed, chip) => texOf('sam_p_' + key, 256, 256, (g, w, h) => {
        const wrap = (fn) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        blots.forEach(([col, n, R], b) => {
          for (let i = 0; i < n; i++) {
            const s = seed + b * 131 + i * 7, cx = hash(s) * w, cy = hash(s + 1) * h, rr = R * (0.6 + hash(s + 2) * 0.8), rot = hash(s + 3) * TAU;
            wrap(() => {
              g.fillStyle = col; g.beginPath();
              for (let k = 0; k < 14; k++) {
                const a = k / 14 * TAU, q = rr * (0.6 + hash(s * 3 + k) * 0.55), x = Math.cos(a) * q * 1.5, y = Math.sin(a) * q * 0.75;
                const X = cx + x * Math.cos(rot) - y * Math.sin(rot), Y = cy + x * Math.sin(rot) + y * Math.cos(rot);
                k ? g.lineTo(X, Y) : g.moveTo(X, Y);
              }
              g.closePath(); g.fill();
            });
          }
        });
        // nắng sa mạc: mảng phấn bạc màu, bụi cát loang
        for (let i = 0; i < 46; i++) { const s = seed + 900 + i * 5, x = hash(s) * w, y = hash(s + 1) * h, r = 10 + hash(s + 2) * 46; wrap(() => blotch(g, x, y, r, hash(s + 3) < 0.6 ? '240,232,212' : '170,146,108', 0.12)); }   // (đậm hơn -> chi tiết nhỏ mang 1 chấm trắng giữa mặt)
        // sơn tróc từng mảng nhỏ: lộ lớp lót nâu đỏ / thép xám, viền tối
        for (let i = 0; i < (chip || 1) * 14; i++) {
          const s = seed + 1500 + i * 9, cx = hash(s) * w, cy = hash(s + 1) * h, R = 1 + hash(s + 2) * 3.5;
          wrap(() => {
            g.beginPath();
            for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, q = R * (0.5 + hash(s + k + 3) * 0.8); k ? g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.7) : g.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.7); }
            g.closePath(); g.fillStyle = hash(s + 20) < 0.55 ? 'rgba(128,84,52,0.85)' : 'rgba(150,146,136,0.85)'; g.fill();
            g.strokeStyle = 'rgba(50,40,30,0.25)'; g.lineWidth = 0.6; g.stroke();
          });
        }
        g.strokeStyle = 'rgba(246,240,224,0.3)'; g.lineWidth = 0.7;
        for (let i = 0; i < 30; i++) { const s = seed + 2100 + i * 4, x = hash(s) * w, y = hash(s + 1) * h, a = hash(s + 2) * TAU, l = 5 + hash(s + 3) * 22; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
        // vệt bụi / nước mưa chảy dọc (bụi cát đọng dưới gờ, nước rửa sạch thành vệt sáng)
        // (thưa, nhạt: vệt dọc dày đặc + đậm làm thép sơn nhìn như ván gỗ xẻ; loang bẩn / vệt chảy chính do lớp mòn shader)
        for (let i = 0; i < 14; i++) {
          const s = seed + 2400 + i * 7, x = hash(s) * w, y0 = hash(s + 1) * h, l = 30 + hash(s + 2) * 120, ww = 2 + hash(s + 3) * 6, dark = hash(s + 4) < 0.6;
          wrap(() => { const gr = g.createLinearGradient(0, y0, 0, y0 + l); gr.addColorStop(0, dark ? 'rgba(96,78,52,0.1)' : 'rgba(236,226,200,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y0, ww, l); });
        }
        speckle(g, w, h, 700, ['rgba(110,94,68,1)', 'rgba(130,112,84,1)'], 0.8, 1.4, seed + 77);
      }, true);
      const pm = (key, base, blots, seed, o, chip) => MAT['sam_' + key] || (MAT['sam_' + key] = new THREE.MeshStandardMaterial(Object.assign({
        map: paintTex(key, base, blots, seed, chip), roughness: 0.85, metalness: 0.15 }, o || {})));   // không bump: lớp bump vết gỉ tạo hố tròn như mặt trăng
      const std = (key, o) => MAT['sam_' + key] || (MAT['sam_' + key] = new THREE.MeshStandardMaterial(o));
      // vải bao tải (bao cát): thớ đan ngang dọc mịn, loang bẩn đất / ố nước, bạc nắng; ảnh sần là thớ đan (lớp sần ô 2 px
      // của grimePair phóng to trên bao thành khối vuông vỡ hạt như Minecraft)
      const burlap = () => [texOf('sam_burlap', 128, 128, (g, w, h) => {
        g.fillStyle = '#e2d4b4'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 18; i++) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, hash(i + 7600) * w + ox, hash(i + 7601) * h + oy, 8 + hash(i + 7602) * 26, hash(i + 7603) < 0.6 ? '96,80,56' : '250,244,226', 0.18);
        speckle(g, w, h, 2200, ['#a8966f', '#f2e8d2', '#c4b28c'], 1, 1.2, 7630);
      }, true), texOf('sam_burlapB', 128, 128, (g, w, h) => {
        g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        // (thớ đan ở đúng tỉ lệ nhỏ hơn 1 px ảnh -> chỉ còn độ sần li ti + nếp nhăn mềm; ô đan 2 px phóng to thành rổ mây)
        for (let i = 0; i < 2600; i++) { const v = 110 + hash(i + 7650) * 40 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(hash(i + 7651) * w, hash(i + 7652) * h, 1, 1); }
        for (let i = 0; i < 14; i++) blotch(g, hash(i + 7640) * w, hash(i + 7641) * h, 8 + hash(i + 7642) * 18, hash(i + 7643) < 0.5 ? '100,100,100' : '156,156,156', 0.35);
      }, true)];
      // Hộp / trụ thô thêm thẳng bằng K.add giữ UV 0..1 mỗi mặt -> vân sơn bị kéo giãn theo cỡ khối (khối to: mảng loang
      // khổng lồ, chi tiết nhỏ: vân nén chi chít) trông như đồ chơi. Với vật liệu sơn lát lặp, chiếu lại UV theo kích thước
      // thật (1 ô = 24 đơn vị ≈ 3 m) theo hướng pháp tuyến của từng mặt.
      // (khối đùn ExtrudeGeometry — cánh tên lửa, má gối trục, tấm bản — giữ UV theo đơn vị gốc -> sơn lặp dày gấp ~24 lần,
      // nhìn như vải đan / bần; cũng chiếu lại. Đánh dấu bằng WeakSet: bản clone() dùng chung userData với hình gốc)
      const PAINT = new Set(), add0 = K.add.bind(K), UVD = new WeakSet();
      const worldUV = (g) => {
        const P = g.attributes.position, N = g.attributes.normal, uv = g.attributes.uv;
        if (g.type === 'CylinderGeometry') {
          const p = g.parameters, ku = Math.PI * (p.radiusTop + p.radiusBottom) / 24, kv = p.height / 24;
          for (let i = 0; i < uv.count; i++) if (Math.abs(N.getY(i)) < 0.9) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv); else uv.setXY(i, P.getX(i) / 24, P.getZ(i) / 24);
          return;
        }
        for (let i = 0; i < uv.count; i++) {
          const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
          if (ax >= ay && ax >= az) uv.setXY(i, P.getZ(i) / 24, P.getY(i) / 24);
          else if (ay >= az) uv.setXY(i, P.getX(i) / 24, P.getZ(i) / 24);
          else uv.setXY(i, P.getX(i) / 24, P.getY(i) / 24);
        }
      };
      K.add = (m, g, x) => {
        // (bản clone() của khối đùn / tiện có type 'BufferGeometry' -> xét mọi hình có pháp tuyến + UV, trừ trụ chiếu riêng)
        if (PAINT.has(m) && g && !UVD.has(g) && g.attributes.normal && g.attributes.uv) { worldUV(g); UVD.add(g); }
        add0(m, g, x);
      };
      const M = {
        // nguỵ trang sa mạc kiểu xuất khẩu (nền cát, mảng nâu + xanh ô-liu nhạt) — bệ phóng, cột ăng-ten, máy phát, pháo
        camo: pm('camo', '#a28f69', [['#86714f', 6, 54], ['#85815e', 4, 44]], 101),
        camoDark: pm('camoDark', '#7c6d50', [['#6a5b41', 5, 50]], 131),
        // sơn xanh Liên Xô bạc nắng (xe, cabin), cát trơn (thép tháp canh / rào)
        oliveSun: pm('oliveSun', '#737858', [], 151, null, 1.4),
        oliveSunDark: pm('oliveSunDark', '#575c46', [], 171, null, 1.2),
        tanSteel: pm('tanSteel', '#a8956c', [], 191),
        tanDark: pm('tanDark', '#7e6e50', [], 211),
        // sơn xe tải quân sự sa mạc: khaki xám (cát sáng như tanSteel + khung thanh vuông trông như giàn ván gỗ thông),
        // ít vết gỉ lấm tấm trong ảnh (tróc sơn do lớp mòn shader)
        truck: pm('truck', '#77715a', [['#6f6a52', 4, 60]], 371, null, 0.3),
        truckDark: pm('truckDark', '#55513f', [], 391, null, 0.3),
        mWhite: pm('mWhite', '#d8d6ca', [], 231, { roughness: 0.62, metalness: 0.15 }, 0.5),
        mGreen: pm('mGreen', '#6c7352', [], 251, { roughness: 0.7 }),
        dish: pm('dish', '#b5b3a6', [], 271, { side: THREE.DoubleSide, roughness: 0.62, metalness: 0.3 }, 0.6),
        door: pm('door', '#6d7660', [], 291, { roughness: 0.8, metalness: 0.25 }, 2),
        tarp: pm('tarp', '#a08d66', [['#8e7a56', 5, 40]], 311, { roughness: 1, metalness: 0 }, 0.2),
        // sơn pháo phòng không (ZU-23, S-60): cát sẫm hơn nền + mảng nâu, bụi phủ nhẹ (bụi đặc như xe -> cả khẩu pháo
        // thấp sát đất ngả màu kem, nhìn như đồ gỗ)
        gunTan: pm('gunTan', '#8a7a5a', [['#7e6f52', 4, 50]], 331, { roughness: 0.96, metalness: 0.05 }, 0.6),
        gunTanDark: pm('gunTanDark', '#665a43', [['#5c513c', 4, 44]], 351, { roughness: 0.96, metalness: 0.05 }, 0.6),
        // gỗ hòm đạn sơn ô-liu (không mảng bạc nắng trắng của pm: trên tấm ván nhỏ thành chấm trắng như dán decal)
        crate: MAT.sam_crate || (MAT.sam_crate = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0, map: texOf('sam_crateWood', 256, 256, (g, w, h) => {
          g.fillStyle = '#50553f'; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 40; i++) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, hash(i + 7900) * w + ox, hash(i + 7901) * h + oy, 10 + hash(i + 7902) * 30, hash(i + 7903) < 0.6 ? '58,60,40' : '120,122,92', 0.16);
          // thớ gỗ dưới lớp sơn mỏng (vệt mảnh lượn dọc)
          for (let i = 0; i < 70; i++) { const y = hash(i + 7910) * h; g.strokeStyle = 'rgba(40,40,26,' + (0.08 + hash(i + 7911) * 0.12) + ')'; g.lineWidth = 0.6 + hash(i + 7912); g.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * 0.03 + i) * 2.5; x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
          // xước, vết dao / va quệt lộ gỗ sáng
          g.strokeStyle = 'rgba(176,164,128,0.45)'; g.lineWidth = 0.8;
          for (let i = 0; i < 30; i++) { const x = hash(i + 7920) * w, y = hash(i + 7921) * h, a = hash(i + 7922) * 0.6 - 0.3, l = 4 + hash(i + 7923) * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
          speckle(g, w, h, 1400, ['#474d33', '#6d7350', '#3c3f2c'], 1, 1.8, 7930);
        }, true) })),
        bagTan: std('bagTan', { color: 0xc6b088, map: burlap()[0], bumpMap: burlap()[1], bumpScale: 0.18, roughness: 1 }),
        bagSand: std('bagSand', { color: 0xb29b74, map: burlap()[0], bumpMap: burlap()[1], bumpScale: 0.18, roughness: 1 }),
        // không có envMap: kim loại cao chỉ còn bóng đèn trực tiếp -> vỏ đạn đồng tối như que gỗ; hạ metalness, sáng màu hơn
        brass: std('brass', { color: 0x9c8452, roughness: 0.5, metalness: 0.3 }),
        trench: std('trench', { color: 0x7a664a, roughness: 1 }),
        black: std('black', { color: 0x2a2a28, roughness: 0.7, metalness: 0.1 })
      };
      for (const k of ['camo', 'camoDark', 'oliveSun', 'oliveSunDark', 'tanSteel', 'tanDark', 'mWhite', 'mGreen', 'tarp', 'gunTan', 'gunTanDark', 'crate']) PAINT.add(M[k]);
      // Bụi cát bám chân: mọi bề mặt sơn + lốp ngả màu cát dần xuống sát đất (theo độ cao thế giới so với cốt nền L.G),
      // loang lổ theo vị trí; bụi bám dày hơn trên mặt nằm ngang (nóc chắn bùn, bậc, sàn bệ)
      const DUST = MAT.sam_dustY || (MAT.sam_dustY = { value: 0 });
      DUST.value = L.G;
      // kMax: mức phủ tối đa sát đất; col: màu bụi (lốp cao su: bụi mỏng xám nâu, chỉ ngả nhẹ — phủ đặc màu cát thì
      // bánh xe thành màu kem như đồ chơi)
      // wear { k, bare }: lớp cũ nát theo toạ độ thế giới (không cần UV / texture riêng, mỗi chỗ một kiểu): loang bẩn không
      // đều 2 tầng, mặt trên bạc nắng ngả xám, sơn tróc từng mảng nhỏ lộ lớp dưới (bare: thép gỉ sẫm / gỗ xám), vệt bẩn
      // chảy dọc trên mặt đứng, mép dưới tối. Không có lớp này, mặt sơn một màu đều tăm tắp dưới nắng nhìn như đồ nhựa mới.
      const dusty = (m, kMax, col, wear) => {
        if (m.userData.samDust) return m;
        m.userData.samDust = true;
        const K0 = (kMax || 0.78).toFixed(2), C0 = (col || [0.74, 0.62, 0.45]).map(v => v.toFixed(2)).join(', ');
        // s: cỡ vết tróc (nhỏ hơn 1 = mảng to, thưa — mặt lớn như cabin / bệ; 1 = vết nhỏ trên pháo), c: ngưỡng phủ (cao = ít tróc)
        const WK = wear ? wear.k.toFixed(2) : '', WB = wear ? wear.bare.map(v => v.toFixed(2)).join(', ') : '', WS = wear ? (wear.s || 1).toFixed(2) : '', WC = wear ? (wear.c || 0.76).toFixed(3) : '';
        m.customProgramCacheKey = () => 'samDust' + K0 + C0 + (wear ? 'w' + WK + WB + WS + WC : '');
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uDustY = DUST;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDW;\nvarying vec3 vDN;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvDW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDN = normalize(mat3(modelMatrix) * objectNormal);');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDustY;\nvarying vec3 vDW;\nvarying vec3 vDN;')
            .replace('#include <map_fragment>', `#include <map_fragment>
            {
              float dh = vDW.y - uDustY;
              float patchy = 0.72 + 0.28 * sin(vDW.x * 0.37 + sin(vDW.z * 0.23) * 2.0) * sin(vDW.z * 0.41 + vDW.y * 0.6);
              float k = (1.0 - smoothstep(0.0, 11.0, dh)) * ${K0} * patchy;
              k = max(k, smoothstep(0.55, 0.95, vDN.y) * ${K0} * 0.45 * patchy);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${C0}), clamp(k, 0.0, 0.85));
            }` + (wear ? `
            {
              vec3 wp = vDW;
              float mott = samN(wp * 0.11) * 0.6 + samN(wp * 0.37 + 17.0) * 0.4;
              diffuseColor.rgb *= 0.74 + 0.36 * mott;
              float up = smoothstep(0.35, 0.95, vDN.y);
              float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.1, 1.07, 1.0), 0.4 * up * ${WK});
              float ch = samN(wp * 2.6 * ${WS}) * 0.55 + samN(wp * 7.1 * ${WS} + 5.0) * 0.45 + (mott - 0.5) * 0.3;
              float chip = smoothstep(${WC}, ${WC} + 0.03, ch) * 0.85 * ${WK};
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${WB}) * (0.8 + 0.4 * samN(wp * 2.7)), chip);
              // vệt bẩn chảy: thưa (vài vệt / mét, rộng vài cm), nhạt dần xuống — nhiễu dọc dày đặc tần số cao thành sọc ván gỗ
              float st = samN(vec3(wp.x * 0.9, wp.y * 0.06, wp.z * 0.9)) * samN(vec3(wp.x * 0.23 + 3.0, wp.y * 0.05, wp.z * 0.23));
              diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.42, 0.62, st) * (1.0 - up) * ${WK};
            }` : ''));
          if (wear) sh.fragmentShader = sh.fragmentShader.replace('uniform float uDustY;', `uniform float uDustY;
float samH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float samN(vec3 p) { vec3 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
  return mix(mix(mix(samH(i), samH(i + vec3(1, 0, 0)), q.x), mix(samH(i + vec3(0, 1, 0)), samH(i + vec3(1, 1, 0)), q.x), q.y),
             mix(mix(samH(i + vec3(0, 0, 1)), samH(i + vec3(1, 0, 1)), q.x), mix(samH(i + vec3(0, 1, 1)), samH(i + vec3(1, 1, 1)), q.x), q.y), q.z); }`);
        };
        return m;
      };
      const RUSTY = { k: 1, bare: [0.27, 0.23, 0.19] };
      dusty(M.gunTan, 0.42, null, RUSTY); dusty(M.gunTanDark, 0.42, null, RUSTY);
      M.gunTan.userData.flatTint = M.gunTanDark.userData.flatTint = true;
      dusty(M.crate, 0.45, null, { k: 1, bare: [0.42, 0.39, 0.33] });
      // lớp mòn cũ cho thép sơn còn lại (bệ phóng, cabin radar, máy phát, xe, tháp): nhám, gần như không bóng; tên lửa
      // sơn trắng / xanh và bạt chỉ cũ nhẹ
      // xe tải: tróc sơn lộ thép xám (vết nâu trên nền cát sáng = mắt gỗ -> khung xe nhìn như giàn gỗ thông)
      for (const k of ['truck', 'truckDark']) { Object.assign(M[k], { roughness: 0.94, metalness: 0.06 }); dusty(M[k], 0.45, null, { k: 0.8, bare: [0.36, 0.35, 0.33], s: 0.7, c: 0.8 }); M[k].userData.flatTint = true; }
      for (const [k, w] of [['camo', 1], ['camoDark', 1], ['oliveSun', 1], ['oliveSunDark', 1], ['tanSteel', 0.9], ['tanDark', 0.9],  ['mGreen', 0.45], ['mWhite', 0.25], ['door', 1], ['dish', 0.5]]) {
        Object.assign(M[k], { roughness: Math.max(M[k].roughness, 0.93), metalness: Math.min(M[k].metalness, 0.06) });
        dusty(M[k], 0.5, null, { k: w, bare: RUSTY.bare, s: 0.55, c: 0.79 });
        M[k].userData.flatTint = true;
      }
      PAINT.forEach(m => dusty(m));
      dusty(M.brass, 0.32, [0.62, 0.54, 0.42]);   // vỏ đạn nằm trong cát: xỉn, bám bụi
      M.rubber = dusty(MAT.sam_rubber || (MAT.sam_rubber = new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.95 })), 0.3, [0.42, 0.37, 0.3]);
      // Vữa trát doanh trại (1 ô = 3 m): vữa cát bạc, vệt nước, mảng vữa bong lộ gạch, vết nứt
      M.plaster = MAT.sam_plaster || (MAT.sam_plaster = new THREE.MeshStandardMaterial({ roughness: 0.95, bumpMap: grimePair('r0.4', 0.4)[1], bumpScale: 0.5, map: texOf('sam_plaster', 256, 256, (g, w, h) => {
        g.fillStyle = '#d4c39f'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, hash(i + 4600) * w + ox, hash(i + 4601) * h + oy, 12 + hash(i + 4602) * 40, hash(i + 4603) < 0.5 ? '176,156,120' : '236,226,204', 0.22);
        for (let i = 0; i < 26; i++) { const x = hash(i + 4700) * w, l = 30 + hash(i + 4701) * 120, gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(120,100,72,0.22)'); gr.addColorStop(1, 'rgba(120,100,72,0)'); g.fillStyle = gr; g.fillRect(x, hash(i + 4702) * h * 0.5, 2 + hash(i + 4703) * 6, l); }
        for (let i = 0; i < 5; i++) {
          const cx = hash(i + 4800) * w, cy = hash(i + 4801) * h, R = 10 + hash(i + 4802) * 16;
          g.save(); g.beginPath();
          for (let k = 0; k < 11; k++) { const a = k / 11 * TAU, q = R * (0.6 + hash(i * 13 + k) * 0.6); k ? g.lineTo(cx + Math.cos(a) * q * 1.4, cy + Math.sin(a) * q) : g.moveTo(cx + Math.cos(a) * q * 1.4, cy + Math.sin(a) * q); }
          g.closePath(); g.fillStyle = '#9a6a4c'; g.fill(); g.clip();
          g.strokeStyle = 'rgba(200,184,150,0.8)'; g.lineWidth = 1.2;
          for (let y = cy - R; y < cy + R; y += 5) { g.beginPath(); g.moveTo(cx - R * 1.6, y); g.lineTo(cx + R * 1.6, y); g.stroke(); for (let x = cx - R * 1.6 + ((y / 5) % 2) * 6; x < cx + R * 1.6; x += 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 5); g.stroke(); } }
          g.restore(); g.strokeStyle = 'rgba(80,64,46,0.5)'; g.lineWidth = 1; g.stroke();
        }
        g.strokeStyle = 'rgba(90,76,56,0.45)'; g.lineWidth = 0.8;
        for (let i = 0; i < 10; i++) { let x = hash(i + 4900) * w, y = hash(i + 4901) * h, a = hash(i + 4902) * TAU; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { a += (hash(i * 17 + k + 4903) - 0.5) * 1.3; x += Math.cos(a) * 5; y += Math.sin(a) * 5; g.lineTo(x, y); } g.stroke(); }
        speckle(g, w, h, 3000, ['#a8946e', '#ece2cc', '#8c7a5c'], 1, 2, 4950);
      }, true) }));
      // Cát dạt (đụn nhỏ chân tường, phủ bánh xe): hạt cát lấm tấm + gợn sóng gió
      M.sand = MAT.sam_sand || (MAT.sam_sand = new THREE.MeshStandardMaterial({ roughness: 1, map: texOf('sam_sand', 256, 256, (g, w, h) => {
        g.fillStyle = '#d3b587'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, hash(i + 5100) * w + ox, hash(i + 5101) * h + oy, 20 + hash(i + 5102) * 50, hash(i + 5103) < 0.5 ? '190,158,112' : '230,206,160', 0.25);
        g.strokeStyle = 'rgba(150,120,80,0.16)'; g.lineWidth = 1.4;
        for (let y = 0; y < h; y += 7) { g.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / w * TAU * 2 + y * 0.3) * 2.5; x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
        speckle(g, w, h, 5000, ['#b89a6c', '#ead2a4', '#a0835a'], 1, 1.8, 5150);
      }, true) }));
      // Lưới nguỵ trang sa mạc: mảng vải cát / nâu / kaki trên lưới dây
      M.net = MAT.sam_net || (MAT.sam_net = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, alphaTest: 0.45, map: texOf('sam_net', 256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const cols = ['#b39b6c', '#9c8457', '#c9b48a', '#7d6a48', '#a8946a'];
        for (let i = 0; i < 780; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.ellipse(hash(i + 5250) * w, hash(i + 5251) * h, 2.5 + hash(i + 5252) * 5.5, 1.5 + hash(i + 5253) * 3, hash(i + 5254) * 3, 0, TAU); g.fill(); }
        g.strokeStyle = '#6e5e42'; g.lineWidth = 1; for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
      }, true) }));
      // Mảng cát phủ mặt đường (ảnh trong suốt, mép loang)
      M.sandPatch = MAT.sam_sandPatch || (MAT.sam_sandPatch = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, map: texOf('sam_sandPatch', 256, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) { const x = w * (0.15 + hash(i + 5300) * 0.7), y = h * (0.2 + hash(i + 5301) * 0.6), r = 8 + hash(i + 5302) * 30; blotch(g, x, y, r, hash(i + 5303) < 0.5 ? '214,184,136' : '196,164,116', 0.55); }
        g.globalCompositeOperation = 'source-atop'; g.strokeStyle = 'rgba(150,120,80,0.35)'; g.lineWidth = 1.2;
        for (let x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Math.sin(x) * 3, h); g.stroke(); }
        g.globalCompositeOperation = 'source-over';
      }) }));
      const tankM = 'tankShell';
      // Kit đổi vật liệu cho các khối dựng sẵn dùng chung (milTruck, aaGun, bộ canh phòng): cùng gom vào K
      // (lưới nguỵ trang xanh dùng chung -> lưới màu cát)
      const NETG = api.camoMat();
      const remap = (map) => { const P = Object.create(K); P.add = (m, g, x) => K.add(m === NETG ? M.net : typeof m === 'string' && map[m] ? map[m] : m, g, x); P.solid = (...a) => K.solid(...a); return P; };
      const TK = remap({ rubber: M.rubber, olive: M.oliveSun, oliveDark: M.oliveSunDark, missile: M.mWhite, bagGreen: M.bagTan, sand: M.bagSand });
      const TT = remap({ rubber: M.rubber, olive: M.truck, oliveDark: M.truckDark, missile: M.mWhite, bagGreen: M.bagTan, sand: M.bagSand });
      const CK = remap({ rubber: M.rubber, olive: M.camo, oliveDark: M.camoDark, missile: M.mWhite, bagGreen: M.bagTan, sand: M.bagSand, yellow: M.brass });
      const SK = remap({ olive: M.tanSteel, oliveDark: M.tanDark, bagGreen: M.bagTan, sand: M.bagSand });

      // =====================================================================================================
      // HÌNH CƠ BẢN
      // =====================================================================================================
      // đĩa bê tông tròn có UV theo kích thước thật (1 ô = 8 m)
      const disk = (m, f, y, r, R0, R1, h, seg) => {
        const g = new THREE.CylinderGeometry(R0, R1, h, seg || 28), uv = g.attributes.uv, P = g.attributes.position, N = g.attributes.normal;
        for (let i = 0; i < uv.count; i++) { if (Math.abs(N.getY(i)) > 0.9) uv.setXY(i, P.getX(i) / 64, P.getZ(i) / 64); else uv.setXY(i, uv.getX(i) * TAU * R1 / 64, (P.getY(i) + h / 2) / 64); }
        K.add(m, g, M4(f, y + h / 2, r));
      };
      // đụn cát dạt (nửa elip dẹt, mặt lồi lổn nhổn): dài len theo hướng ang, sâu dep, cao ht; side > 0 dồn dốc về 1 phía
      const drift = (f, r, len, dep, ht, ang, y0) => {
        const g = new THREE.SphereGeometry(1, 16, 5, 0, TAU, 0, Math.PI / 2), P = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 1 + (hash(i * 3.1 + f * 0.7 + r * 1.3) - 0.5) * 0.3 * y;
          P.setXYZ(i, x * len / 2, y * ht * n, z * dep / 2 * (z > 0 ? 1.4 : 0.6));
          uv.setXY(i, P.getX(i) / 24, P.getZ(i) / 24);
        }
        g.computeVertexNormals();
        K.add(M.sand, g, M4(f, (y0 || 0) + 0.15, r, 0, -ang, 0));
      };
      // dây cáp nằm trên đất nối các điểm (f, r) (bám cao độ đất), võng nhẹ
      const cable = (pts, t, lift) => {
        for (let i = 1; i < pts.length; i++) {
          const [af, ar, ay] = pts[i - 1], [bf, br, by] = pts[i];
          const A = [af, ay !== undefined ? ay : Math.max(0, K.earth(af, ar)) + (lift || 0.7), ar], B = [bf, by !== undefined ? by : Math.max(0, K.earth(bf, br)) + (lift || 0.7), br];
          K.beam('rubber', A, B, t || 0.9);
        }
      };
      // lưới nguỵ trang sa mạc trên khung cọc (base: tâm, cỡ w x d, cao y, độ võng sag): mặt lưới đội lên thành chóp ở
      // từng cọc giữa (đĩa đỡ chống thủng lưới), võng giữa các cọc, mép rủ xiên xuống thành vạt so le, dây néo từ góc
      // + giữa cạnh xuống cọc ghim đất
      const net = (base, w, d, y, sag) => {
        const nx = Math.max(1, Math.round(w / 34)), nz = Math.max(1, Math.round(d / 34));
        const poles = [];
        for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) poles.push([(-0.5 + i / nx) * (w - 2), (-0.5 + j / nz) * (d - 2), i > 0 && i < nx && j > 0 && j < nz]);
        if (nx === 1 && nz === 1) poles.push([0, 0, true]);
        const top = (x, z) => {   // cao độ mặt lưới: võng parabol, đội lên quanh cọc giữa
          const u = x / (w / 2), v = z / (d / 2);
          let h = y - sag * (1 - u * u) * (1 - v * v);
          for (const [px, pz, mid] of poles) if (mid) { const r = Math.hypot(x - px, z - pz); h = Math.max(h, y + 2.4 - r * 0.22); }
          return h;
        };
        const SX = Math.round(w / 3), SZ = Math.round(d / 3), g = new THREE.PlaneGeometry(w, d, SX, SZ); g.rotateX(-Math.PI / 2);
        const P = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, top(x, z) + (hash(i * 7 + w) - 0.5) * 0.9); uv.setXY(i, x / 40, z / 40); }
        g.computeVertexNormals();
        K.add(M.net, g, base);
        // vạt rủ 4 cạnh: dải nghiêng ra ngoài, mép dưới so le (vạt dài ngắn)
        const skirt = (x0, z0, x1, z1, ox, oz) => {
          const len = Math.hypot(x1 - x0, z1 - z0), N = Math.max(4, Math.round(len / 4)), pos = [], idx = [], uvs = [];
          for (let k = 0; k <= N; k++) {
            const t = k / N, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, h = top(x, z), drop = y * (0.38 + 0.22 * hash(k * 3.7 + x0 + z1)), out = drop * 0.45;
            pos.push(x, h, z, x + ox * out, h - drop, z + oz * out);
            uvs.push(t * len / 40, 0, t * len / 40, drop / 40);
            if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
          }
          const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); sg.setIndex(idx); sg.computeVertexNormals();
          K.add(M.net, sg, base);
        };
        const hw = w / 2, hd = d / 2;
        skirt(-hw, -hd, hw, -hd, 0, -1); skirt(hw, hd, -hw, hd, 0, 1); skirt(-hw, hd, -hw, -hd, -1, 0); skirt(hw, -hd, hw, hd, 1, 0);
        // cọc: ống thép, cọc giữa có đĩa đỡ; dây néo + cọc ghim
        for (const [px, pz, mid] of poles) {
          const H = top(px, pz);
          K.add('steelDark', new THREE.CylinderGeometry(0.35, 0.45, H, 6), mul(base, M4(px, H / 2, pz)));
          if (mid) K.add('steelDark', new THREE.CylinderGeometry(1.6, 1.6, 0.25, 10), mul(base, M4(px, H - 0.3, pz)));
          else {
            const ox = Math.sign(px) || 0, oz = Math.sign(pz) || 0, sx = px + ox * y * 0.75, sz = pz + oz * y * 0.75;
            K.beam('rubber', [px, H - 0.4, pz], [sx, 0.6, sz], 0.18, base);
            K.add('steelGray', new THREE.CylinderGeometry(0.2, 0.08, 2.4, 5), mul(base, M4(sx, 0.6, sz, ox * 0.4, 0, -oz * 0.4)));
          }
        }
      };
      // khoảng cách tới mép đường gần nhất (âm = trên mặt đường)
      const roadGap = (f, r) => {
        let d = Infinity;
        for (const [pts, wd] of ROADS) for (let i = 1; i < pts.length; i++) {
          const [af, ar] = pts[i - 1], [bf, br] = pts[i], ef = bf - af, er = br - ar, t = Math.max(0, Math.min(1, ((f - af) * ef + (r - ar) * er) / (ef * ef + er * er)));
          d = Math.min(d, Math.hypot(f - af - ef * t, r - ar - er * t) - wd / 2);
        }
        return d;
      };
      // mương cáp có nắp bê tông (tấm 0.9 x 0.65 m, lệch nhẹ, vài tấm vỡ / mất lộ lòng mương tối): chạy theo polyline
      const cableTrench = (pts) => {
        let n = 0;
        for (let i = 1; i < pts.length; i++) {
          const [af, ar] = pts[i - 1], [bf, br] = pts[i], len = Math.hypot(bf - af, br - ar), ang = Math.atan2(br - ar, bf - af);
          for (let s = 4; s < len; s += 7.6) {
            const f = af + (bf - af) * s / len, r = ar + (br - ar) * s / len;
            if (roadGap(f, r) < 3) continue;
            const y = Math.max(0, K.earth(f, r)), j = hash(++n * 3.3 + af);
            if (j < 0.05) { K.box('void', f, y + 0.5, r, 7, 0.2, 4.4, -ang); continue; }
            K.cbox('concDark', f, y + 0.5, r, 7.2, 1, 5.2, 0.3, -ang + (j - 0.5) * 0.06);
          }
        }
      };
      // hào giao thông kè bao cát 2 bên (đất sa mạc cứng: hào nông + tường bao cát), nền hào đất tối, ván lót
      const trench = (pts) => {
        for (let i = 1; i < pts.length; i++) {
          const [af, ar] = pts[i - 1], [bf, br] = pts[i], len = Math.hypot(bf - af, br - ar), nf = -(br - ar) / len, nr = (bf - af) / len, ang = Math.atan2(br - ar, bf - af);
          for (const s of [-1, 1]) sandbags(SK, af + nf * s * 5.4, ar + nr * s * 5.4, bf + nf * s * 5.4, br + nr * s * 5.4, 2, 0);
          const g = new THREE.PlaneGeometry(len + 6, 8.4); g.rotateX(-Math.PI / 2);
          K.add(M.trench, g, M4((af + bf) / 2, 0.55, (ar + br) / 2, 0, -ang, 0));
          for (let s = 3; s < len; s += 6) K.box('wood', af + (bf - af) * s / len, 0.75, ar + (br - ar) * s / len, 1.6, 0.3, 6, -ang);
          K.solid((af + bf) / 2 + nf * 5.4, (ar + br) / 2 + nr * 5.4, len / 2, 1.6, 0, 6, ang);
          K.solid((af + bf) / 2 - nf * 5.4, (ar + br) / 2 - nr * 5.4, len / 2, 1.6, 0, 6, ang);
        }
      };
      // mảng cát phủ mặt đường
      const sandOnRoad = (f, r, len, wd, ang) => { const g = new THREE.PlaneGeometry(len, wd); g.rotateX(-Math.PI / 2); K.add(M.sandPatch, g, M4(f, 0.95, r, 0, -ang, 0)); };
      // bảng chữ trên cọc thép
      const signPost = (key, lines, opts, f, r, ry, w, h) => {
        const base = M4(f, 0, r, 0, ry, 0);
        for (const s of [-1, 1]) K.add('steelGray', new THREE.CylinderGeometry(0.4, 0.4, 12 + h, 6), mul(base, M4(0, (12 + h) / 2, s * (w / 2 - 1))));
        K.add(decal(key, signTex(key, lines, opts)), new THREE.PlaneGeometry(w, h), mul(base, M4(0.5, 10 + h / 2, 0, 0, Math.PI / 2, 0)));
        K.add('steelDark', new THREE.BoxGeometry(0.4, h + 0.6, w + 0.6), mul(base, M4(0.2, 10 + h / 2, 0)));
      };

      // =====================================================================================================
      // SÂN CÁT NÉN (thay bãi cỏ của các căn cứ vùng cỏ): cát + sỏi nện, gợn gió, nền sỏi quanh công trình, lề đường,
      // vết bánh xe, vết dầu; lớp chi tiết hạt sỏi lát lặp ở gần
      // =====================================================================================================
      {
        const f0 = -L.hu, f1 = L.hu, r0 = -L.hv, r1 = L.hv, Wd = 1024, Hh = Math.round(Wd * (r1 - r0) / (f1 - f0));
        const tex = texOf('sam_apron_' + L.hu + '_' + L.hv, Wd, Hh, (g, w, h) => {
          const P = (f, r) => [(f - f0) / (f1 - f0) * w, (r - r0) / (r1 - r0) * h], S = w / (f1 - f0);
          g.fillStyle = '#c2a67b'; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 90; i++) blotch(g, hash(i + 6000) * w, hash(i + 6001) * h, 30 + hash(i + 6002) * 110, hash(i + 6003) < 0.5 ? '216,190,146' : '160,136,100', 0.28);
          speckle(g, w, h, 30000, ['#9c845e', '#d8c098', '#8a7454', '#c9b086', '#a89070'], 1, 3, 6010);
          // gợn cát theo gió
          g.strokeStyle = 'rgba(120,98,66,0.09)'; g.lineWidth = 1.6;
          for (let i = 0; i < 260; i++) {
            const x = hash(i + 6100) * w, y = hash(i + 6101) * h, l = 40 + hash(i + 6102) * 160;
            g.beginPath(); for (let k = 0; k <= 10; k++) { const t = k / 10, xx = x + t * l, yy = y + t * l * 0.35 + Math.sin(t * 9 + i) * 3; k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
          }
          // đường tuần tra sỏi nện giữa 2 lớp rào
          const iF = L.hu - 62, iR = L.hv - 62;
          g.strokeStyle = 'rgba(150,132,104,0.9)'; g.lineWidth = 20 * S; g.strokeRect(...P(-iF + 14, -iR + 14), (iF * 2 - 28) * S, (iR * 2 - 28) * S);
          // nền sỏi quanh công trình
          for (const [fa, ra, fb, rb] of PADS(L.hu)) {
            const [x0, y0] = P(Math.min(fa, fb), Math.min(ra, rb)), ww = Math.abs(fb - fa) * S, hh = Math.abs(rb - ra) * S;
            g.save(); g.beginPath(); g.rect(x0, y0, ww, hh); g.clip();
            g.fillStyle = 'rgba(158,144,120,0.92)'; g.fillRect(x0, y0, ww, hh);
            for (let i = 0; i < ww * hh / 18; i++) { const x = x0 + hash(i * 1.7 + fa) * ww, y = y0 + hash(i * 2.3 + ra) * hh; g.fillStyle = hash(i + fa + ra) < 0.5 ? 'rgba(110,100,86,0.8)' : 'rgba(196,184,160,0.8)'; g.fillRect(x, y, 1.5, 1.5); }
            for (let i = 0; i < 8; i++) blotch(g, x0 + hash(i + fa * 3) * ww, y0 + hash(i + ra * 3) * hh, 12 * S + hash(i) * 20 * S, '200,172,128', 0.5);   // cát lấn vào
            g.restore();
          }
          // lề đường đất sỏi + cát dạt mép đường
          g.lineCap = 'round'; g.lineJoin = 'round';
          for (const [pts, wd] of ROADS) for (const [ex, col] of [[14, 'rgba(176,150,110,0.6)'], [6, 'rgba(120,104,80,0.55)']]) {
            g.strokeStyle = col; g.lineWidth = (wd + ex) * S; g.beginPath(); pts.forEach(([f, r], i) => i ? g.lineTo(...P(f, r)) : g.moveTo(...P(f, r))); g.stroke();
          }
          // vết bánh xe 2 vệt song song (xe ra vào ụ, đi tắt qua sân)
          g.lineCap = 'butt';
          const track = (pts, k) => {
            for (const s of [-1, 1]) {
              g.strokeStyle = 'rgba(96,78,54,0.22)'; g.lineWidth = 2.6 * S; g.beginPath();
              pts.forEach(([f, r], i) => {
                const j = Math.min(i + 1, pts.length - 1), m = Math.max(i - 1, 0), tf = pts[j][0] - pts[m][0], tr = pts[j][1] - pts[m][1], l = Math.hypot(tf, tr) || 1;
                const x = f - tr / l * s * 9, y = r + tf / l * s * 9; i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y));
              });
              g.stroke();
            }
            if (k) for (let i = 0; i < 12; i++) blotch(g, ...P(pts[pts.length - 1][0] + (hash(i + k) - 0.5) * 30, pts[pts.length - 1][1] + (hash(i + k + 1) - 0.5) * 30), (3 + hash(i + k + 2) * 8) * S, '40,34,26', 0.32);
          };
          track([[92, 157], [60, 130], [24, 128], [-4, 140]], 1); track([[92, -157], [60, -130], [24, -128], [-4, -140]], 2);
          track([[200, -300], [170, -318], [140, -340], [130, -370]], 3); track([[200, -300], [150, -306], [110, -330], [104, -372]], 4);
          track([[0, 300], [-10, 320], [-30, 350]], 5); track([[0, 300], [16, 322], [24, 350]], 6);
          track([[-60, -300], [-80, -330], [-90, -360]], 7); track([[-150, 300], [-112, 300], [-90, 330], [-84, 350]], 8);
          track([[150, 0], [140, -30], [110, -60], [70, -90], [40, -118]], 0); track([[-92, -60], [-140, -100], [-200, -150], [-216, -150]], 0);
          for (let i = 0; i < 60; i++) blotch(g, hash(i + 6500) * w, hash(i + 6501) * h, (3 + hash(i + 6502) * 10) * S, '44,36,28', 0.26);
          // vết cháy xém trên bệ bệ phóng trống (tên lửa phóng / cháy khi rút chạy)
          { const Pq = L.launchers[3]; const [x, y] = P(Pq.f, Pq.r); const gr = g.createRadialGradient(x, y, 0, x, y, 60 * S); gr.addColorStop(0, 'rgba(30,26,22,0.55)'); gr.addColorStop(0.6, 'rgba(50,42,34,0.3)'); gr.addColorStop(1, 'rgba(50,42,34,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 60 * S, 0, TAU); g.fill(); }
        });
        const am = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        const rep = new THREE.Vector2(L.hu * 2 / 24, L.hv * 2 / 24);
        am.onBeforeCompile = (sh) => {
          sh.uniforms.tGrav = { value: detailTex('gravel') }; sh.uniforms.uRep = { value: rep };
          sh.fragmentShader = 'uniform sampler2D tGrav;\nuniform vec2 uRep;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
            { vec3 dv = texture2D(tGrav, vUv * uRep * 1.7).rgb; diffuseColor.rgb *= mix(vec3(1.0), dv * 2.0, 0.45); }`);
        };
        const top = new THREE.Mesh(new THREE.PlaneGeometry(L.hu * 2, L.hv * 2), am);
        top.rotation.x = -Math.PI / 2; top.position.set(0, 0.35, 0); top.receiveShadow = true;
        group.add(top);
      }
      api.roadNet(group, ROADS, JUNCTIONS, { bars: [[L.hu - 150, 0, 2.4, 28]], words: [['STOP', L.hu - 144, 0, Math.PI / 2, 14]] });
      // cát gió thổi phủ ngang mặt đường từng đám
      for (const [f, r, len, wd, ang] of [[250, 6, 30, 26, 0.2], [130, -4, 46, 30, 0], [40, 157, 40, 22, 0], [-60, -157, 34, 20, 0.1], [-92, 80, 22, 40, 0], [92, -80, 24, 36, 0],
        [0, 230, 18, 34, Math.PI / 2], [0, -250, 20, 30, Math.PI / 2], [120, 300, 50, 22, 0], [-80, 300, 40, 20, 0.15], [140, -300, 44, 22, -0.1], [-30, -300, 30, 20, 0], [-100, 0, 18, 22, 0]]) sandOnRoad(f, r, len, wd, ang);

      // =====================================================================================================
      // CHU VI AN NINH (bộ canh phòng chung, thép sơn cát), tháp canh, lô cốt
      // =====================================================================================================
      const kit = secKit(SK, anim), { iF, iR, G, win, acUnit, tower, pillbox, hesco } = kit;
      perimeter(SK, kit);
      for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -iR + 38], [iF - 28, G + 40], [iF - 28, -G - 40], [-iF + 34, iR - 34], [-iF + 26, -250]]) tower(f, r);
      for (const [f, r] of [[iF - 34, 260], [iF - 34, -260]]) pillbox(f, r);
      // biển tên đơn vị ngoài cổng
      signPost('sam_gate', ['AIR DEFENSE MISSILE BATTALION', 'ЗЕНИТНЫЙ РАКЕТНЫЙ ДИВИЗИОН — ЗАПРЕТНАЯ ЗОНА'], { w: 1024, h: 192, bg: '#e6dcc4', fg: '#1d2a3a', fg2: '#a3221a' }, L.hu - 16, G - 4, 0, 30, 6.5);

      // =====================================================================================================
      // TÊN LỬA 5V27 (dài 6.1 m): tầng đẩy Ø 0.55 m sơn xanh có 4 cánh lớn, đoạn chuyển tầng, tầng hành trình Ø 0.375 m
      // trắng ngà có 4 cánh giữa, mũi vuốt nhọn có 4 cánh lái mũi + 4 cánh mất ổn định nhỏ, khe ăng-ten ngòi nổ, vạch sơn.
      // Nằm dọc +X, đuôi tại x = 0. cover: áo bạt che tầng hành trình (tên lửa trong kho / trên xe)
      // =====================================================================================================
      const finGeo = {};
      const fin = (key, x0, x1, t0, t1, span, rad, th) => finGeo[key] || (finGeo[key] = (() => {
        const sh = new THREE.Shape(); sh.moveTo(x0, rad); sh.lineTo(x1, rad); sh.lineTo(t1, rad + span); sh.lineTo(t0, rad + span); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }); g.translate(0, 0, -th / 2); return g;
      })());
      const noseGeo = new THREE.LatheGeometry(Array.from({ length: 10 }, (_, i) => { const t = i / 9; return new THREE.Vector2(1.5 * Math.pow(1 - t * t, 0.7) + 0.02, t * 9); }), 16);
      const missile = (base, cover) => {
        const at = (x, y, z, rx, ry, rz) => mul(base, M4(x, y, z, rx, ry, rz));
        const along = (m, r0, r1, x0, x1, seg) => K.add(m, new THREE.CylinderGeometry(r1, r0, x1 - x0, seg || 16), at((x0 + x1) / 2, 0, 0, 0, 0, -Math.PI / 2));
        along('steelDark', 1.5, 2, -1.8, 0, 12);
        along(M.mGreen, 2.2, 2.2, 0, 15.6, 18);
        for (const x of [0.4, 15.2]) along('steelDark', 2.3, 2.3, x - 0.3, x + 0.3, 18);
        along('steelDark', 2.2, 1.55, 15.6, 17.4, 16);
        along(M.mWhite, 1.5, 1.5, 17.4, 40.5, 16);
        along('steelRed', 1.52, 1.52, 21, 21.8, 16);
        K.add(M.mWhite, noseGeo.clone(), at(40.5, 0, 0, 0, 0, -Math.PI / 2));
        for (let k = 0; k < 4; k++) {
          const roll = Math.PI / 4 + k * Math.PI / 2;
          K.add(M.mGreen, fin('b', 0.8, 10, 6, 10.5, 6.6, 2.1, 0.5).clone(), at(0, 0, 0, roll, 0, 0));
          K.add(M.mWhite, fin('w', 25, 34, 30.5, 34.6, 3.8, 1.4, 0.35).clone(), at(0, 0, 0, roll, 0, 0));
          K.add(M.mWhite, fin('c', 37.2, 39.8, 38.2, 40, 1.9, 1.4, 0.3).clone(), at(0, 0, 0, roll - Math.PI / 4, 0, 0));
          K.add(M.mWhite, fin('d', 43, 44, 43.4, 44.1, 0.8, 0.9, 0.2).clone(), at(0, 0, 0, roll, 0, 0));
          K.add('steelDark', new THREE.BoxGeometry(1.6, 0.12, 0.5), at(42.4, Math.cos(roll) * 1.32, Math.sin(roll) * 1.32, roll, 0, 0));
        }
        if (cover) {
          along(M.tarp, 1.8, 1.8, 20, 41, 14);
          K.add(M.tarp, new THREE.ConeGeometry(1.85, 9.4, 14), at(45.7, 0, 0, 0, 0, -Math.PI / 2));
          for (const x of [23, 30, 37]) along('steelDark', 1.9, 1.9, x - 0.25, x + 0.25, 14);
        }
      };

      // =====================================================================================================
      // 4 BỆ PHÓNG 5P73 trong kè móng ngựa: bệ bê tông tròn, đế chữ thập 4 tay chống có kích + đế tròn, mâm xoay, khung
      // gối trục, 2 dầm phóng giàn mắt cáo mỗi dầm 1 ray trên + 1 ray dưới (tên lửa đặt trên ray trên, treo dưới ray dưới),
      // cơ cấu nâng, tấm chắn luồng phụt, tủ điều khiển, hộp cáp + cáp. Bỏ hoang: bệ thiếu đạn, 1 bệ trống cháy xém
      // =====================================================================================================
      const ammo = [4, 2, 4, 0], ELS = [0.42, 0.16, 0.5, 0.3], YAW = [0.12, -0.25, -0.08, 0.4];
      L.launchers.forEach((P, idx) => {
        const base = mul(M4(P.f, 0, P.r), M4(0, 0, 0, 0, -P.az, 0)), at = (x, y, z, rx, ry, rz) => mul(base, M4(x, y, z, rx, ry, rz));
        disk('concDark', P.f, 0, P.r, 33, 34.5, 1.4, 32);
        K.add('conc', new THREE.TorusGeometry(33.6, 0.9, 4, 32), at(0, 1.3, 0, Math.PI / 2, 0, 0));
        // 4 tay chống hình chữ I vuốt thon (cánh trên / dưới + bản bụng có lỗ giảm trọng), khớp bản lề ở chân bệ,
        // đầu tay: kích vít có tay quay + đế tròn lún cát, bu-lông neo vào bệ bê tông
        for (const a of [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4]) {
          const arm = mul(base, M4(Math.cos(a) * 9, 0, Math.sin(a) * 9, 0, -a, 0)), aa = (x, y, z, rx, ry, rz) => mul(arm, M4(x, y, z, rx, ry, rz));
          const web = plateGeo([[0, 0], [19, 0], [19, 1.6], [0, 3.6]], 0.6);
          K.add(M.camo, web, aa(0, 2.2, 0));
          K.beam(M.camo, [0, 5.9, 0], [19, 3.9, 0], 0.4, arm); K.add(M.camo, new THREE.BoxGeometry(19.6, 0.5, 2.6), aa(9.6, 2.2, 0));
          K.beam(M.camo, [0, 6, -1.2], [19, 4, -1.2], 0.5, arm); K.beam(M.camo, [0, 6, 1.2], [19, 4, 1.2], 0.5, arm);
          for (const x of [5, 10, 14.5]) K.add('void', new THREE.CylinderGeometry(0.9 - x * 0.025, 0.9 - x * 0.025, 0.7, 10), aa(x, 4 - x * 0.06, 0, Math.PI / 2, 0, 0));
          for (const s of [-1, 1]) K.add('steelDark', new THREE.CylinderGeometry(0.9, 0.9, 1, 10), aa(0.6, 3.4, s * 1.8, Math.PI / 2, 0, 0));
          // kích vít
          K.cbox(M.camoDark, 19.6, 4.2, 0, 3, 3, 3, 0.3, 0, arm);
          K.add('steelGray', new THREE.CylinderGeometry(0.7, 0.7, 7, 8), aa(19.6, 3.6, 0));
          for (let k = 0; k < 6; k++) K.add('steelDark', new THREE.TorusGeometry(0.75, 0.12, 3, 8), aa(19.6, 1.4 + k * 0.5, 0, Math.PI / 2, 0, 0));
          K.add('steelDark', new THREE.TorusGeometry(1.5, 0.18, 4, 12), aa(19.6, 7.4, 0, Math.PI / 2, 0, 0));
          for (let k = 0; k < 3; k++) K.beam('steelDark', [19.6, 7.4, 0], [19.6 + Math.cos(k * 2.1) * 1.5, 7.4, Math.sin(k * 2.1) * 1.5], 0.15, arm);
          K.add('steelDark', new THREE.CylinderGeometry(2.6, 3, 0.8, 14), aa(19.6, 1.6, 0));
          for (let k = 0; k < 4; k++) K.add('steelGray', new THREE.CylinderGeometry(0.22, 0.22, 0.5, 6), aa(19.6 + Math.cos(k * TAU / 4 + 0.4) * 2.2, 2.1, Math.sin(k * TAU / 4 + 0.4) * 2.2));
        }
        // đế chữ thập: khung bát giác có gân + bu-lông, mâm cố định có vành răng (xích quay) quanh chu vi
        K.add(M.camo, new THREE.CylinderGeometry(11.5, 12.5, 3.4, 8), at(0, 3.8, 0, 0, Math.PI / 8, 0));
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU + Math.PI / 8;
          K.add(M.camoDark, new THREE.BoxGeometry(0.6, 3, 4), at(Math.cos(a) * 12.1, 3.8, Math.sin(a) * 12.1, 0, -a, 0));
          K.add('steelDark', new THREE.CylinderGeometry(0.3, 0.3, 0.5, 6), at(Math.cos(a + 0.2) * 10.6, 5.7, Math.sin(a + 0.2) * 10.6));
        }
        K.add('steelDark', new THREE.CylinderGeometry(10, 10.4, 2.2, 32), at(0, 6.6, 0));
        for (let k = 0; k < 48; k++) { const a = k / 48 * TAU; K.add('steelGray', new THREE.BoxGeometry(0.7, 1.6, 0.5), at(Math.cos(a) * 10.45, 6.6, Math.sin(a) * 10.45, 0, -a, 0)); }
        // phần quay (mâm + khung gối trục + dầm phóng) lệch hướng ngẫu nhiên so với bệ
        const tb = mul(base, M4(0, 0, 0, 0, YAW[idx], 0)), tat = (x, y, z, rx, ry, rz) => mul(tb, M4(x, y, z, rx, ry, rz));
        K.cbox(M.camo, -2, 10, 0, 24, 4.4, 18, 0.6, 0, tb);
        for (const s of [-1, 1]) K.add(M.camo, plateGeo([[-13, 0], [6, 0], [1, 12], [-9, 12]], 1.4), tat(0, 12, s * 7.8));
        K.add('steelGray', new THREE.CylinderGeometry(1.5, 1.5, 19, 12), tat(-6, 22.5, 0, Math.PI / 2, 0, 0));
        K.cbox(M.camoDark, 7, 15, 9.6, 6, 8, 4, 0.4, 0, tb);
        K.add('steelDark', new THREE.BoxGeometry(0.3, 6.6, 3.4), tat(10.1, 15, 9.6));
        K.add('steelGray', new THREE.BoxGeometry(14, 0.4, 0.4), tat(-2, 15.6, -10.4));
        for (const x of [-8, 4]) K.add('steelGray', new THREE.BoxGeometry(0.4, 4, 0.4), tat(x, 13.8, -10.4));
        for (let k = 0; k < 4; k++) K.add('steelDark', new THREE.BoxGeometry(1.4, 0.3, 2.4), tat(12.6, 2.4 + k * 2.2, -6));
        // má gối trục: lỗ giảm trọng, ổ bi trục có nắp bu-lông; bình dầu thuỷ lực + ống mềm, hộp tay quay, cáp cuộn trên mâm
        for (const s of [-1, 1]) {
          for (const [x, y] of [[-6, 15], [-1, 15.5]]) K.add('void', new THREE.CylinderGeometry(1.3, 1.3, 1.5, 10), tat(x, y, s * 7.8, Math.PI / 2, 0, 0));
          K.add('steelDark', new THREE.CylinderGeometry(2.6, 2.6, 1, 14), tat(-6, 22.5, s * 8.8, Math.PI / 2, 0, 0));
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; K.add('steelGray', new THREE.CylinderGeometry(0.22, 0.22, 0.5, 6), tat(-6 + Math.cos(a) * 1.9, 22.5 + Math.sin(a) * 1.9, s * 9.4, Math.PI / 2, 0, 0)); }
        }
        K.add(M.camoDark, new THREE.CylinderGeometry(1.6, 1.6, 7, 12), tat(-9, 13.6, -10.6, 0, 0, Math.PI / 2));
        for (const x of [-11.6, -6.4]) K.add('steelDark', new THREE.TorusGeometry(1.65, 0.2, 4, 12), tat(x, 13.6, -10.6, 0, Math.PI / 2, 0));
        K.beam('rubber', [-6, 12.2, -10.4], [-2, 12.6, -6], 0.5, tb); K.beam('rubber', [-12, 12.2, -10.4], [-12, 12.4, -7], 0.5, tb);
        K.cbox(M.camoDark, 9, 13.6, -9.6, 4, 3, 2.4, 0.3, 0, tb);
        K.add('steelDark', new THREE.CylinderGeometry(1.2, 1.2, 0.3, 10), tat(9, 13.6, -11, Math.PI / 2, 0, 0));
        K.add('steelDark', new THREE.CylinderGeometry(0.2, 0.2, 1.6, 5), tat(9.8, 13.6, -11.6, Math.PI / 2, 0, 0));
        K.add('rubber', new THREE.TorusGeometry(2, 0.5, 5, 14), tat(2, 12.7, 6, Math.PI / 2, 0, 0));
        K.add('rubber', new THREE.TorusGeometry(1.6, 0.5, 5, 14), tat(2, 13.5, 6, Math.PI / 2, 0, 0));
        // tấm chắn luồng phụt nghiêng sau đuôi tên lửa: gân chịu lực sau lưng, mặt trước cháy xém muội
        K.add('steelDark', new THREE.BoxGeometry(0.8, 10, 18), tat(-19, 8.6, 0, 0, 0, 0.42));
        for (const z of [-6, 0, 6]) K.add('steelDark', new THREE.BoxGeometry(1.4, 9.6, 0.5), tat(-19.9, 8.4, z, 0, 0, 0.42));
        K.add(M.black, new THREE.PlaneGeometry(15, 8), mul(tat(-19, 8.6, 0, 0, 0, 0.42), M4(0.45, 0, 0, 0, Math.PI / 2, 0)));
        for (const s of [-1, 1]) K.beam('steelDark', [-14, 12.4, s * 9], [-24, 4, s * 9], 0.8, tb);
        // dầm phóng nâng góc EL quanh trục gối
        const EL = ELS[idx], boom = mul(tat(-6, 22.5, 0), M4(0, 0, 0, 0, 0, EL)), bat = (x, y, z, rx, ry, rz) => mul(boom, M4(x, y, z, rx, ry, rz));
        for (const s of [-1, 1]) {
          const z = s * 7.8;
          for (const y of [-2.6, 2.6]) K.add(M.camo, new THREE.BoxGeometry(46, 1.4, 1.6), bat(16, y, z));
          for (let x = -6; x < 38; x += 7.4) { K.add(M.camoDark, new THREE.BoxGeometry(0.6, 5.2, 0.6), bat(x, 0, z)); K.beam(M.camoDark, [x, 2.4, z], [x + 7.4, -2.4, z], 0.45, boom); }
          for (const y of [-3.8, 3.8]) { K.add('steelGray', new THREE.BoxGeometry(48, 0.8, 1.1), bat(17, y, z)); K.add('steelDark', new THREE.BoxGeometry(2, 1.2, 1.6), bat(40.2, y, z)); }
        }
        for (const x of [-4, 14, 32]) K.add(M.camoDark, new THREE.BoxGeometry(2, 2, 15.6), bat(x, 0, 0));
        // cơ cấu nâng: 2 xi-lanh từ mâm lên bụng dầm
        for (const s of [-1, 1]) {
          const p = new THREE.Vector3(16, -3.2, s * 4).applyMatrix4(mul(M4(-6, 22.5, 0), M4(0, 0, 0, 0, 0, EL)));
          K.beam('steelGray', [6, 12, s * 4], [p.x, p.y, p.z], 1.3, tb);
          K.beam('steelDark', [6, 12, s * 4], [(6 + p.x) / 2, (12 + p.y) / 2, s * 4], 1.8, tb);
        }
        // 4 ray: trên trái, trên phải, dưới trái, dưới phải
        [[3.8, -7.8], [3.8, 7.8], [-3.8, -7.8], [-3.8, 7.8]].forEach(([y, z], k) => {
          if (k >= ammo[idx]) return;
          const my = y + (y > 0 ? 2.75 : -2.75);
          missile(bat(-5, my, z), false);
          for (const x of [2, 20]) K.add('steelDark', new THREE.BoxGeometry(2.4, 1.1, 0.9), bat(x, (y + my) / 2 + (y > 0 ? -0.2 : 0.2), z));
        });
        // va chạm: bệ + dầm phóng (3 đoạn nâng dần theo góc)
        K.solid(P.f, P.r, 28, 28, 0, 22, P.az + YAW[idx]);
        for (let k = 0; k < 3; k++) {
          const x0 = -6 + k * 16, c = Math.cos(EL), sn = Math.sin(EL), mid = -6 + (x0 + 8) * c, a = P.az + YAW[idx];
          K.solid(P.f + Math.cos(a) * mid, P.r + Math.sin(a) * mid, 8 * c + 3, 12, 22.5 + x0 * sn - 9, 22.5 + (x0 + 16) * sn + 9, a);
        }
        // hộp cáp mép bệ + cáp, cát dạt phía gió (sau bệ)
        const d = Math.hypot(P.f, P.r), ux = P.f / d, uz = P.r / d, bx = P.f - ux * 30 - uz * 12, bz = P.r - uz * 30 + ux * 12;
        K.cbox('steelGray', bx, 4, bz, 4, 8, 6, 0.3, -P.az);
        cable([[bx, bz], [P.f - ux * 14, P.r - uz * 14, 2], [P.f - ux * 6, P.r - uz * 6, 3.2]], 0.9);
        drift(P.f + uz * 32, P.r - ux * 32, 30, 10, 3.5, P.az + Math.PI / 2);
        drift(P.f + ux * 22 - uz * 26, P.r + uz * 22 + ux * 26, 22, 8, 2.6, P.az + 0.8);
      });
      // tên lửa rơi khỏi xe nạp đạn nằm đổ cạnh bệ trống (cánh gãy), thùng tên lửa bật nắp
      { missile(M4(36, 2.4, -122, 0.35, -0.15, 0.05), false); K.solid(60, -118, 26, 6, 0, 6, 0.15); drift(58, -126, 26, 8, 2.2, 0.15); }

      // =====================================================================================================
      // DA ĐẤT KÈ / GÒ: lưới địa hình chỉ 1 điểm / 16 đơn vị nên kè (rộng ~2 ô) hiện thành khối tam giác gãy khúc.
      // Phủ lớp da mịn (bước 1.5 - 2 đơn vị) dựng theo mặt cắt kè thật: đỉnh bằng, mái dốc, đỉnh nhấp nhô, rãnh xói dọc mái
      // ngoài; không bao giờ thấp hơn mặt đất thật (max với earth + 0.25) để không bị đất xuyên lên. Chỉ dựng ô nào thực
      // sự nhô lên khỏi nền (đường / sân không bị phủ cát).
      // =====================================================================================================
      const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      // minH: ô thấp hơn mức này coi như sát đất (bỏ) — ụ pháo dùng ngưỡng thấp để mép ụ không thành răng cưa cao
      const skin = (fn, cols, rows, at2, keep, minH) => {   // at2(i, j) -> [f, r]; fn(f, r, i, j) -> độ cao mong muốn so với cốt nền
        const pos = new Float32Array(cols * rows * 3), uvs = new Float32Array(cols * rows * 2), up = new Uint8Array(cols * rows), idx = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const k = j * cols + i, [f, r] = at2(i, j), want = fn(f, r, i, j), e = K.earth(f, r);
          pos[k * 3] = f; pos[k * 3 + 1] = Math.max(e + 0.25, want); pos[k * 3 + 2] = r;
          uvs[k * 2] = f / 24; uvs[k * 2 + 1] = r / 24; up[k] = want > (minH || 0.6) && keep(f, r) ? 1 : 0;
        }
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
          const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
          if (up[a] + up[b] + up[c] + up[d] < 2) continue;
          idx.push(a, c, b, b, c, d);
        }
        if (!idx.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
        g.computeVertexNormals();
        // pháp tuyến hướng lên (lưới quét theo chiều có thể lật mặt)
        { const N = g.attributes.normal; let s = 0; for (let i = 0; i < N.count; i++) s += N.getY(i); if (s < 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; } g.setIndex(idx); g.computeVertexNormals(); } }
        K.add(M.berm, g, null);
      };
      M.berm = MAT.sam_berm || (MAT.sam_berm = new THREE.MeshStandardMaterial({ roughness: 1, map: M.sand.map, bumpMap: grimePair('r1.5', 1.5)[1], bumpScale: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      // kè móng ngựa bệ phóng: mặt cắt hình thang (đỉnh bằng rộng ~6, mái trong dốc hơn mái ngoài), đỉnh nhấp nhô,
      // rãnh xói nước mưa hiếm hoi chảy dọc mái ngoài, 2 đầu kè ốp bao cát giữ đất
      {
        const B = L.berm, IN = B.r - B.w - 3, OUT = B.r + B.w + 6, NR = Math.ceil((OUT - IN) / 1.5) + 1, NA = 120;
        L.launchers.forEach((P, idx) => {
          const open0 = P.az + Math.PI;
          skin((f, r, i, j) => {
            const df = f - P.f, dr = r - P.r, d = Math.hypot(df, dr), th = Math.atan2(dr, df);
            const o = Math.atan2(Math.sin(th - open0), Math.cos(th - open0)), gate = smooth(B.gap, B.gap + 0.3, Math.abs(o));
            const x = d - B.r, crest = 3, Hc = B.h * (1.02 + 0.07 * Math.sin(th * 5 + idx * 1.7) + 0.04 * Math.sin(th * 13 + idx));
            const prof = x < 0 ? 1 - smooth(crest, B.w * 0.85, -x) : 1 - smooth(crest, B.w + 5, x);
            const rill = x > crest ? Math.pow(Math.max(0, Math.sin(th * 38 + hash(Math.floor(th * 6.05) + idx * 9) * 6)), 10) * 1.3 * smooth(crest, crest + 4, x) * (1 - smooth(B.w, B.w + 5, x)) : 0;
            return Hc * prof * gate - rill;
          }, NA + 1, NR, (i, j) => { const a = i / NA * TAU, d = IN + (OUT - IN) * j / (NR - 1); return [P.f + Math.cos(a) * d, P.r + Math.sin(a) * d]; }, () => true);
          // 2 đầu kè: tường bao cát xếp so le chặn đất sạt vào lối xe
          for (const s of [-1, 1]) {
            const a = open0 + s * (B.gap + 0.04), ca = Math.cos(a), sa = Math.sin(a);
            sandbags(SK, P.f + ca * (B.r - B.w * 0.75), P.r + sa * (B.r - B.w * 0.75), P.f + ca * (B.r + B.w * 0.55), P.r + sa * (B.r + B.w * 0.55), 3, 0);
          }
        });
      }
      // gò radar dẫn bắn: da mịn theo đúng công thức gò (MapGen), thêm rãnh xói trên ta-luy; chừa sân bê tông trên đỉnh
      // và dốc lên xe (mặt đường)
      if (typeof MapGen !== 'undefined' && MapGen.landmarkMound) {
        const U = L.unv, F0 = U.f - U.hf - U.run - 4, F1 = U.f + U.hf + U.run + 4, R0 = U.r - U.hr - U.run - 4, R1 = U.r + U.hr + U.run + 4;
        const NF = Math.ceil((F1 - F0) / 2) + 1, NRr = Math.ceil((R1 - R0) / 2) + 1;
        skin((f, r) => {
          const m = MapGen.landmarkMound(L, f, r), pf = f - U.f, pr = r - U.r, out = Math.hypot(Math.max(0, Math.abs(pf) - U.hf), Math.max(0, Math.abs(pr) - U.hr));
          const rill = out > 3 && out < U.run - 3 ? Math.pow(Math.max(0, Math.sin(Math.atan2(pr, pf) * 44)), 12) * 1.1 : 0;
          return m - rill;
        }, NF, NRr, (i, j) => [F0 + (F1 - F0) * i / (NF - 1), R0 + (R1 - R0) * j / (NRr - 1)],
        (f, r) => !(Math.abs(f - U.f) < U.hf + 1 && Math.abs(r - U.r) < U.hr + 1) && !(f - U.f > U.hf - 4 && Math.abs(r - U.r) < U.ramp.hw + 3));
      }

      // =====================================================================================================
      // GÒ RADAR DẪN BẮN: sân bê tông trên gò, cột ăng-ten SNR-125 (UNV) trên rơ-moóc 2 trục có 4 kích chống: cabin thiết bị
      // có gân, cửa, thang, điều hoà lọc độc; mâm xoay trên nóc, khung ăng-ten: chảo parabol bám mục tiêu UV-12 + loa thu,
      // 2 ăng-ten máng quét UV-10 / UV-11 nghiêng ±45° (ống dẫn sóng phía trước, thanh chống), chảo nhỏ phát lệnh UV-13,
      // đối trọng; bờ bao cát quanh mép gò, cáp thả xuống dốc
      // =====================================================================================================
      {
        const U = L.unv, H = U.h + 2;
        K.cbox('concDark', U.f, U.h, U.r, 62, 4, 58, 0.6);
        for (const [a, b, c2, d2] of [[-U.hf + 1, -U.hr + 1, U.hf - 1, -U.hr + 1], [-U.hf + 1, U.hr - 1, U.hf - 1, U.hr - 1], [-U.hf + 1, -U.hr + 1, -U.hf + 1, U.hr - 1], [U.hf - 1, -U.hr + 1, U.hf - 1, -18], [U.hf - 1, 18, U.hf - 1, U.hr - 1]]) sandbags(SK, U.f + a, U.r + b, U.f + c2, U.r + d2, 2, U.h - 0.4);
        const b = M4(U.f - 2, H, U.r, 0, -Math.PI / 2 - 0.08, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
        // rơ-moóc: 2 dầm dọc, 2 trục bánh đôi, chắn bùn, càng kéo, 4 kích chống
        for (const z of [-5, 5]) K.add('steelDark', new THREE.BoxGeometry(54, 2.4, 1.6), at(0, 7.4, z));
        for (const x of [-12, -2]) for (const s of [-1, 1]) {
          K.add('rubber', new THREE.CylinderGeometry(4.2, 4.2, 4.4, 16), at(x, 4.2, s * 8.6, Math.PI / 2, 0, 0));
          K.add(M.camoDark, new THREE.CylinderGeometry(2.2, 2.2, 4.5, 10), at(x, 4.2, s * 8.6, Math.PI / 2, 0, 0));
        }
        for (const s of [-1, 1]) K.add(M.camo, new THREE.BoxGeometry(22, 0.6, 5.2), at(-7, 9.4, s * 8.6));
        K.beam('steelDark', [26, 6.6, -5], [40, 5, 0], 1.2, b); K.beam('steelDark', [26, 6.6, 5], [40, 5, 0], 1.2, b);
        K.add('steelDark', new THREE.TorusGeometry(1.2, 0.4, 6, 10), at(41.4, 5, 0, Math.PI / 2, 0, 0));
        for (const [x, z] of [[-25, -11], [-25, 11], [22, -11], [22, 11]]) {
          K.beam('steelGray', [x * 0.85, 7.6, z * 0.4], [x, 5, z], 1, b);
          K.add('steelGray', new THREE.CylinderGeometry(0.8, 0.8, 6, 8), at(x, 3, z));
          K.add('steelDark', new THREE.CylinderGeometry(2.4, 2.8, 0.8, 10), at(x, 0.4, z));
        }
        // cabin
        K.cbox(M.camo, 0, 20, 0, 46, 20, 22, 0.8, 0, b);
        for (let x = -20; x <= 20; x += 4) for (const s of [-1, 1]) K.add(M.camoDark, new THREE.BoxGeometry(0.6, 19, 0.5), at(x, 20, s * 11.2));
        K.add(M.door, new THREE.BoxGeometry(7, 15, 0.5), at(8, 18.5, 11.3));
        for (let k = 0; k < 4; k++) K.add('steelGray', new THREE.BoxGeometry(5, 0.4, 2.2), at(8, 2.4 + k * 2.4, 12.6 + k * 0.4));
        K.cbox('steelWhite', -23.4, 22, -4, 2.4, 7, 9, 0.3, 0, b); K.add('void', new THREE.CircleGeometry(2.4, 12), at(-24.7, 22, -4, 0, -Math.PI / 2, 0));
        K.add(M.camoDark, new THREE.BoxGeometry(0.5, 12, 8), at(23.3, 19, 4));
        for (let k = 0; k < 5; k++) K.add('steelDark', new THREE.CylinderGeometry(0.7, 0.7, 1.4, 8), at(24, 14 + k * 2, 4, 0, 0, Math.PI / 2));
        for (let y = 12; y < 30; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 3), at(-23.6, y, 7));
        for (const s of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(0.35, 19, 0.35), at(-23.6, 21, 7 + s * 1.5));   // 2 thanh dọc thang
        // mái cabin: lan can ống quanh mép, 2 máy điều hoà, tang cuốn cáp, cột ăng-ten roi liên lạc
        for (const [x0, z0, x1, z1] of [[-22, -10.4, 22, -10.4], [-22, 10.4, 22, 10.4], [-22, -10.4, -22, 10.4]]) {
          K.beam('steelGray', [x0, 32.6, z0], [x1, 32.6, z1], 0.35, b);
          const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 7);
          for (let k = 0; k <= n; k++) K.add('steelGray', new THREE.CylinderGeometry(0.18, 0.18, 2.6, 5), at(x0 + (x1 - x0) * k / n, 31.3, z0 + (z1 - z0) * k / n));
        }
        for (const x of [-17, 15]) {
          K.cbox('steelWhite', x, 31.4, -6, 6, 2.8, 5, 0.3, 0, b);
          for (let k = 0; k < 5; k++) K.add('steelDark', new THREE.BoxGeometry(4.6, 0.2, 0.3), at(x, 32.9, -8 + k));
        }
        K.add('steelDark', new THREE.CylinderGeometry(1.8, 1.8, 2.6, 12), at(17, 32, 6, Math.PI / 2, 0, 0));
        K.add('rubber', new THREE.CylinderGeometry(1.4, 1.4, 2.7, 12), at(17, 32, 6, Math.PI / 2, 0, 0));
        K.add('steelDark', new THREE.CylinderGeometry(0.12, 0.2, 16, 5), at(-21, 38, 9));
        // mâm xoay: vành bi có bu-lông
        K.cyl('steelDark', 0, 30, 0, 8, 9, 3, 24, at(0, 30, 0));
        K.add('steelGray', new THREE.TorusGeometry(8.4, 0.35, 4, 28), at(0, 32.6, 0, Math.PI / 2, 0, 0));
        for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; K.add('steelDark', new THREE.CylinderGeometry(0.25, 0.25, 0.6, 6), at(Math.cos(a) * 8.6, 33, Math.sin(a) * 8.6)); }
        const ant = mul(at(0, 33, 0), M4(0, 0, 0, 0, 1.25, 0)), aat = (x, y, z, rx, ry, rz) => mul(ant, M4(x, y, z, rx, ry, rz));
        K.cbox(M.camo, -2, 3, 0, 18, 6, 16, 0.6, 0, ant);
        K.cbox(M.camoDark, -14, 8, 0, 8, 10, 12, 0.5, 0, ant);
        for (let k = 0; k < 4; k++) K.add('steelGray', new THREE.BoxGeometry(0.4, 0.4, 10.4), aat(-18.3, 4.4 + k * 2.4, 0));
        K.cbox('steelGray', 6, 7, -7, 4, 4, 3, 0.3, 0, ant);
        // khung ăng-ten giàn thép: 2 cột giàn đỡ dầm ngang giàn dài 62
        const truss = (A, B, w, t, m) => {   // dầm giàn tiết diện vuông w từ A tới B (cục bộ ant): 4 thanh góc + giằng chéo zic-zắc
          const d = v3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), len = d.length(), q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.clone().normalize());
          const T = mul(ant, new THREE.Matrix4().compose(v3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2), q, v3(1, 1, 1)));
          const h = w / 2, n = Math.max(2, Math.round(len / (w * 1.2)));
          for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) K.add(m, new THREE.BoxGeometry(t, len, t), mul(T, M4(x, 0, z)));
          for (let k = 0; k < n; k++) {
            const y0 = -len / 2 + len * k / n, y1 = y0 + len / n;
            for (const [a, c] of [[[-h, -h], [h, -h]], [[h, -h], [h, h]], [[h, h], [-h, h]], [[-h, h], [-h, -h]]]) {
              const [p, r2] = k % 2 ? [c, a] : [a, c];
              K.beam(m, [p[0], y0, p[1]], [r2[0], y1, r2[1]], t * 0.55, T);
            }
          }
        };
        for (const s of [-1, 1]) truss([2, 6, s * 7], [2, 30, s * 7], 2.8, 0.6, M.camo);
        truss([2, 30, -31], [2, 30, 31], 2.6, 0.55, M.camo);
        for (const s of [-1, 1]) K.beam(M.camoDark, [2, 8, s * 7], [2, 28.6, -s * 7], 0.5, ant);
        // chảo parabol UV-12 (mặt cong 26 x 22, tiêu cự ~10.6): vành ống, 8 gân sau toả từ moay-ơ, loa thu hình phễu trên
        // 3 thanh chống, ống dẫn sóng từ loa về sau chảo
        {
          const w = 26, h = 22, dep = 4, g = new THREE.PlaneGeometry(w, h, 16, 14), P = g.attributes.position, sag = (y, z) => dep * (y * y + z * z);
          for (let i = 0; i < P.count; i++) { const y = P.getX(i) / (w / 2), z = P.getY(i) / (h / 2); P.setZ(i, sag(y, z)); }
          g.computeVertexNormals();
          const D = aat(5, 17, 0, 0, Math.PI / 2, 0), cl = (v) => Math.max(-1, Math.min(1, v));
          K.add(M.dish, g, D);
          const rim = [];
          for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU, y = cl(Math.cos(a) * 1.25), z = cl(Math.sin(a) * 1.25); rim.push([y * w / 2, z * h / 2, sag(y, z) - 0.3]); }
          for (let k = 1; k < rim.length; k++) K.beam('steelGray', rim[k - 1], rim[k], 0.55, D);
          for (let k = 0; k < 8; k++) {
            const a = k / 8 * TAU, pts = [];
            for (let j = 0; j <= 5; j++) { const t = j / 5, y = cl(Math.cos(a) * 1.25 * t), z = cl(Math.sin(a) * 1.25 * t); pts.push([y * w / 2, z * h / 2, sag(y, z) - 0.4 - (1 - t) * 1.2]); }
            for (let j = 1; j < pts.length; j++) K.beam(M.camoDark, pts[j - 1], pts[j], 0.5, D);
          }
          K.add('steelDark', new THREE.CylinderGeometry(2.2, 2.6, 2, 12), mul(D, M4(0, 0, -1.2, Math.PI / 2, 0, 0)));
          for (const [y, z] of [[17 - h / 2 + 1, -w / 2 + 2], [17 - h / 2 + 1, w / 2 - 2], [17 + h / 2 - 1, 0]]) K.beam('steelGray', [5 + dep * 0.9, y, z], [15.6, 17, 0], 0.5, ant);
          K.add('steelDark', new THREE.CylinderGeometry(2.2, 0.7, 3.6, 4, 1, true), aat(15.2, 17, 0, Math.PI / 4, 0, Math.PI / 2));
          K.add('steelDark', new THREE.BoxGeometry(2.4, 1.6, 1.6), aat(17.4, 17, 0));
          K.beam('steelGray', [17.6, 16.2, 0], [9.2, 7.2, 12], 0.45, ant);
        }
        // 2 máng quét UV-10 / UV-11 (dài 40, miệng 13) nghiêng ±45°: mặt phản xạ trên các gân cong, 2 tấm bịt đầu,
        // xương sống giàn sau lưng, ống dẫn sóng khe phía trước (dãy khe bức xạ) trên 5 tay đỡ
        {
          const prof = (half, dep, t, flat) => {   // tiết diện parabol x = dep (y / half)^2, dày t (flat: bịt kín tới lưng phẳng)
            const sh = new THREE.Shape(), N = 14;
            for (let i = 0; i <= N; i++) { const y = -half + 2 * half * i / N, x = dep * (y / half) * (y / half); i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
            if (flat) { sh.lineTo(-t, half); sh.lineTo(-t, -half); }
            else for (let i = N; i >= 0; i--) { const y = -half + 2 * half * i / N, x = dep * (y / half) * (y / half); sh.lineTo(x - t, y); }
            sh.closePath();
            return sh;
          };
          const ext = (sh, len) => {
            const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2);
            const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
            return g;
          };
          const HALF = 6.5, DEP = 3.4, LEN = 40;
          const skin = ext(prof(HALF, DEP, 0.3), LEN), rib = ext(prof(HALF, DEP, 1.1), 0.5), cap = ext(prof(HALF, DEP, 1.6, true), 0.5);
          for (const s of [-1, 1]) {
            const tm = mul(aat(4, 46, s * 24, -s * Math.PI / 4, 0, 0), M4(-DEP * 0.5, 0, 0)), tt = (x, y, z, rx, ry, rz) => mul(tm, M4(x, y, z, rx, ry, rz));
            K.add(M.dish, skin.clone(), tm);
            for (let z = -LEN / 2 + 4; z < LEN / 2 - 2; z += 5) K.add(M.camoDark, rib.clone(), tt(-0.3, 0, z));
            for (const z of [-LEN / 2 + 0.25, LEN / 2 - 0.25]) K.add(M.camo, cap.clone(), tt(0, 0, z));
            for (const y of [-HALF, HALF]) K.add('steelGray', new THREE.BoxGeometry(0.6, 0.6, LEN), tt(DEP, y, 0));
            // xương sống giàn tam giác sau lưng máng
            K.add(M.camoDark, new THREE.BoxGeometry(1, 1, LEN - 2), tt(-3.2, 0, 0));
            for (let z = -LEN / 2 + 2; z < LEN / 2 - 2; z += 4) { K.beam(M.camoDark, [-3.2, 0, z], [-1.2, 3, z + 2], 0.35, tm); K.beam(M.camoDark, [-3.2, 0, z], [-1.2, -3, z + 2], 0.35, tm); }
            // ống dẫn sóng khe: hộp chữ nhật, dãy khe nghiêng xen kẽ, 5 tay đỡ về đáy + mép máng
            K.add('steelGray', new THREE.BoxGeometry(1.2, 2, LEN - 3), tt(DEP + 3.6, 0, 0));
            for (let k = 0, z = -LEN / 2 + 3; z < LEN / 2 - 3; z += 1.6, k++) K.add('void', new THREE.BoxGeometry(0.1, 1.1, 0.25), tt(DEP + 4.25, 0, z, k % 2 ? 0.35 : -0.35, 0, 0));
            for (const z of [-16, -8, 0, 8, 16]) { K.beam('steelGray', [0.2, 0, z], [DEP + 3.2, 0, z], 0.35, tm); K.beam('steelGray', [DEP, HALF * 0.9, z], [DEP + 3.2, 0.6, z], 0.25, tm); K.beam('steelGray', [DEP, -HALF * 0.9, z], [DEP + 3.2, -0.6, z], 0.25, tm); }
            // giằng nối máng về dầm ngang
            K.beam(M.camo, [2, 30, s * 12], [2.6, 36.5, s * 14.4], 1.2, ant);
            K.beam(M.camo, [2, 30, s * 28], [2.6, 46, s * 24], 1.2, ant);
            K.beam(M.camoDark, [-1, 30, s * 4], [2.6, 46, s * 24], 0.7, ant);
          }
        }
        // chảo nhỏ phát lệnh dẫn tên lửa UV-13: vành, loa thu trên 3 tay đỡ + đối trọng bê tông sau khung
        K.add(M.dish, new THREE.SphereGeometry(5, 18, 6, 0, TAU, 0, Math.PI * 0.32), aat(6, 4, -11, 0, 0, -Math.PI / 2));
        K.add('steelGray', new THREE.TorusGeometry(4.3, 0.3, 4, 20), aat(8.6, 4, -11, 0, Math.PI / 2, 0));
        for (const a of [0, 2.1, 4.2]) K.beam('steelGray', [8.4, 4 + Math.cos(a) * 4, -11 + Math.sin(a) * 4], [12.6, 4, -11], 0.25, ant);
        K.add('steelDark', new THREE.CylinderGeometry(0.9, 0.4, 1.6, 4), aat(12.8, 4, -11, 0, 0, Math.PI / 2));
        K.add('steelDark', new THREE.BoxGeometry(2, 2, 2), aat(4.4, 4, -11));
        K.cbox('concDark', -15, 15.5, 0, 6, 3, 10, 0.3, 0, ant);
        // va chạm: rơ-moóc + cabin, khung ăng-ten
        K.solid(U.f - 2, U.r, 14, 29, U.h - 2, U.h + 34, -0.08);
        K.solid(U.f, U.r, 18, 38, U.h + 34, U.h + 94, Math.PI / 2 + 0.08 - 1.25);
        // cáp thả xuống dốc gò về 2 cabin UNK + cát dạt trên sân bê tông
        for (const s of [-1, 1]) cable([[U.f - 6, U.r + s * 12, H + 0.6], [U.f - 6, U.r + s * 29, H + 0.6], [U.f - 6, U.r + s * 40], [U.f - 6, U.r + s * 60], [U.f - 4, U.r + s * 80]], 1);
        cable([[U.f + 10, U.r, H + 0.6], [U.f + 28, U.r + 4, H + 0.6], [U.f + 50, U.r + 10], [U.f + 74, U.r + 12]], 0.8);
        drift(U.f - 26, U.r + 22, 18, 10, 2.2, 0.4, H - 1); drift(U.f + 24, U.r - 24, 14, 8, 1.8, -0.8, H - 1);
      }

      // =====================================================================================================
      // 2 CABIN ĐIỀU KHIỂN UNK (thùng kung trên ZIL-131) trong ụ chữ U 2 bên gò, lưới nguỵ trang, hộp đấu cáp
      // =====================================================================================================
      for (const R of L.revs.slice(0, 2)) {
        milTruck(TK, M4(R.f + Math.cos(R.a) * 2, 0, R.r + Math.sin(R.a) * 2, 0, -R.a, 0), 'kung');
        K.solid(R.f + Math.cos(R.a) * 2, R.r + Math.sin(R.a) * 2, 34, 11, 0, 32, R.a);
        net(M4(R.f, 0, R.r, 0, -R.a, 0), 82, 46, 38, 5);
        const bk = [R.f - Math.cos(R.a) * (R.hl - 2), R.r - Math.sin(R.a) * (R.hl - 2)];
        K.cbox('steelGray', bk[0] + 8, 5, bk[1], 6, 10, 4, 0.3, -R.a);
        drift(R.f + Math.cos(R.a) * (R.hl + 6) + 14, R.r + Math.sin(R.a) * (R.hl + 6), 20, 8, 2.4, R.a + Math.PI / 2);
      }
      // mương cáp nắp bê tông: gò radar -> 4 bệ phóng
      for (const P of L.launchers) { const d = Math.hypot(P.f, P.r); cableTrench([[P.f * 74 / d, P.r * 74 / d], [P.f * (d - 36) / d, P.r * (d - 36) / d]]); }

      // =====================================================================================================
      // HẦM CHỈ HUY TIỂU ĐOÀN (KP) phủ đất: mặt tiền bê tông, cửa chống nổ thép 2 cánh (1 cánh mở hé) lùi trong hốc có mái
      // hắt, tường cánh xiên giữ đất, tường rọ đá chắn mảnh trước cửa, lưới nguỵ trang; nóc gò: 2 ống thông gió nắp nấm,
      // cửa thoát hiểm, cột ăng-ten dây néo, bờ bao cát
      // =====================================================================================================
      {
        const C = L.kp, ff = C.f + C.hf, W = C.hr, Hh = C.h + 6, DW = 12, DH = 24;
        for (const s of [-1, 1]) K.cbox('conc', ff - 7, Hh / 2 - 2, C.r + s * (W + DW) / 2, 14, Hh + 4, W - DW, 1.2);
        K.cbox('conc', ff - 7, (DH + Hh) / 2 - 1, C.r, 14, Hh - DH + 2, DW * 2, 1.2);
        K.cbox('concDark', ff - 4, Hh + 1.5, C.r, 22, 3, W * 2 + 6, 1);
        K.cbox('concDark', ff + 6, DH + 4, C.r, 14, 3, DW * 2 + 10, 0.8);
        for (const s of [-1, 1]) K.cbox('concDark', ff + 6, (DH + 4) / 2, C.r + s * (DW + 3.5), 14, DH + 4, 3, 0.6);
        K.box('void', ff - 4, DH / 2, C.r, 0.6, DH, DW * 2);
        K.box('concDark', ff + 5, 0.5, C.r, 18, 1, DW * 2);
        for (const s of [-1, 1]) {
          const leaf = mul(M4(ff - 3, 0, C.r + s * DW), M4(0, 0, 0, 0, s < 0 ? 0.9 : 0, 0));
          K.cbox(M.door, 2.5, DH / 2, -s * DW / 2, 5, DH, DW, 0.4, 0, leaf);
          for (const y of [5, DH / 2, DH - 5]) K.add('steelDark', new THREE.BoxGeometry(1.2, 2, 3), mul(leaf, M4(5.4, y, -s * 1.5)));
          K.add('steelDark', new THREE.CylinderGeometry(1.4, 1.4, 0.8, 12), mul(leaf, M4(5.2, DH / 2, -s * DW / 2, 0, 0, Math.PI / 2)));
          const sh = new THREE.Shape(); sh.moveTo(0, -2); sh.lineTo(C.run + 6, -2); sh.lineTo(C.run + 6, 3); sh.lineTo(0, Hh - 2); sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: 10, bevelEnabled: false });
          if (s > 0) g.translate(0, 0, -10);
          const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
          K.add('conc', g, M4(ff - 10, 0, C.r + s * W, 0, s > 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35, 0));
          K.solid(ff - 10 + Math.sin(0.35) * C.run / 2, C.r + s * (W + C.run / 2), 6, C.run / 2 + 3, -2, Hh * 0.6, s * (Math.PI / 2 - 0.35));
          drift(ff + 3, C.r + s * (DW + 20), 26, 10, 3.6, Math.PI / 2);
        }
        K.plane(decal('sam_kp', signTex('sam_kp', ['COMMAND POST', 'КП ДИВИЗИОНА — ВХОД ВОСПРЕЩЁН'], { w: 768, h: 192, bg: '#e6dcc4', fg: '#a3221a' })), ff + 0.2, DH + 10, C.r, 36, 9);
        K.add('lampAmber', new THREE.BoxGeometry(1.4, 1.6, 4), M4(ff + 13.5, DH + 1, C.r));
        K.solid(ff - 7, C.r, 8, W, -2, Hh + 3);
        K.solid(ff + 6, C.r, 7, DW + 5, DH + 2, DH + 6);
        hesco(ff + 30, C.r - 22, ff + 30, C.r + 22, 1);
        net(M4(ff + 21, 0, C.r, 0, 0, 0), 30, 58, 30, 4);
        const top = C.h;
        for (const [f, r] of [[C.f - 14, C.r - 24], [C.f - 14, C.r + 24]]) {
          K.cyl('concDark', f, top - 2, r, 5, 6, 5, 14); K.cyl('steelGray', f, top + 3, r, 2.4, 2.4, 9, 10);
          K.add('steelGray', new THREE.SphereGeometry(4.4, 14, 6, 0, TAU, 0, Math.PI / 2), M4(f, top + 12, r, 0, 0, 0, 1, 0.5, 1));
          K.solid(f, r, 5, 5, top - 2, top + 15);
        }
        K.cbox('concDark', C.f + 6, top + 1, C.r + 30, 14, 4, 14, 1); K.cbox(M.door, C.f + 6, top + 3.4, C.r + 30, 9, 1, 9, 0.3);
        const mf = C.f - 20, mr = C.r + 6, MH = 110;
        K.cbox('conc', mf, top + 1, mr, 8, 4, 8, 1);
        K.cyl('steelGray', mf, top + 3, mr, 0.8, 1.4, MH, 8);
        for (const y of [MH * 0.5, MH * 0.95]) K.add('steelGray', new THREE.BoxGeometry(14, 0.5, 0.5), M4(mf, top + 3 + y, mr, 0, 0.6, 0));
        for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4, ax = mf + Math.cos(a) * 30, az = mr + Math.sin(a) * 30, ay = K.earth(ax, az); K.box('concDark', ax, ay + 1, az, 4, 3, 4); K.beam('steelDark', [ax, ay + 3, az], [mf, top + MH * 0.7, mr], 0.3); }
        K.solid(mf, mr, 4, 4, top, top + MH + 4);
        K.cyl('steelGray', C.f + 18, top, C.r - 36, 0.25, 0.4, 44, 5);
        sandbags(SK, ff - 22, C.r - W + 4, ff - 22, C.r + W - 4, 2, C.h - 1);
        cableTrench([[ff + 2, C.r + 36], [-64, C.r + 36]]);
      }

      // =====================================================================================================
      // KHO TÊN LỬA 2 VÒM PHỦ ĐẤT: tường đầu hồi bê tông khoét 2 cửa vòm, cửa thép trượt (kho 1 mở hé thấy thùng tên lửa
      // bên trong tối), ray trượt trên cửa, đèn chống nổ, biển cấm lửa, tường cánh, 2 cột thu lôi trên gò, ống thông gió;
      // SÂN NẠP ĐẠN bê tông trước kho: 2 xe vận tải - nạp đạn PR-14 chở tên lửa, giá cẩu chữ A, tên lửa trên giá kê, thùng
      // tên lửa xếp chồng, bảng cứu hoả
      // =====================================================================================================
      {
        const S = L.store, ff = S.f + S.hf, W = S.hr, Hh = S.h + 6, AW = 18, AH = 16;
        // tường đầu hồi khoét 2 cửa vòm (rộng 4.5 m, cao 4.25 m)
        {
          const sh = new THREE.Shape(); sh.moveTo(-W, -2); sh.lineTo(W, -2); sh.lineTo(W, Hh); sh.lineTo(-W, Hh); sh.closePath();
          for (const dr of S.doors) {
            const x = dr - S.r, hole = new THREE.Path();
            hole.moveTo(x - AW, 0); hole.lineTo(x + AW, 0); hole.lineTo(x + AW, AH); hole.absarc(x, AH, AW, 0, Math.PI, false); hole.lineTo(x - AW, 0);
            sh.holes.push(hole);
          }
          const g = new THREE.ExtrudeGeometry(sh, { depth: 14, bevelEnabled: false, curveSegments: 14 });
          const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
          K.add('conc', g, new THREE.Matrix4().makeBasis(v3(0, 0, 1), v3(0, 1, 0), v3(-1, 0, 0)).setPosition(ff, 0, S.r));
        }
        K.cbox('concDark', ff - 6, Hh + 1.5, S.r, 18, 3, W * 2 + 4, 1);
        for (const s of [-1, 1]) {
          const sh = new THREE.Shape(); sh.moveTo(0, -2); sh.lineTo(S.run + 6, -2); sh.lineTo(S.run + 6, 3); sh.lineTo(0, Hh - 2); sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: 10, bevelEnabled: false });
          if (s > 0) g.translate(0, 0, -10);
          const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
          K.add('conc', g, M4(ff - 10, 0, S.r + s * W, 0, s > 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35, 0));
          K.solid(ff - 10 + Math.sin(0.35) * S.run / 2, S.r + s * (W + S.run / 2), 6, S.run / 2 + 3, -2, Hh * 0.6, s * (Math.PI / 2 - 0.35));
        }
        // cánh cửa: nửa vòm (mép thẳng ở giữa), dày 1.4; s = -1 cánh phía -r, s = +1 phía +r
        const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.lineTo(AW, 0); leafShape.lineTo(AW, AH); leafShape.absarc(0, AH, AW, 0, Math.PI / 2, false); leafShape.lineTo(0, 0);
        const leafG = new THREE.ExtrudeGeometry(leafShape, { depth: 1.4, bevelEnabled: false, curveSegments: 8 });
        { const uv = leafG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24); }
        S.doors.forEach((dr, k) => {
          // lòng vòm tối + nền bê tông trước cửa
          const arch = new THREE.Shape(); arch.moveTo(-AW, 0); arch.lineTo(AW, 0); arch.lineTo(AW, AH); arch.absarc(0, AH, AW, 0, Math.PI, false); arch.closePath();
          K.add('void', new THREE.ShapeGeometry(arch, 12), M4(ff - 13.6, 0, dr, 0, Math.PI / 2, 0));
          K.box('concDark', ff + 9, 0.5, dr, 20, 1, AW * 2 + 6);
          for (const s of [-1, 1]) {
            // cửa trượt: kho 0 cánh -r đã đẩy sang bên (lộ nửa lòng kho)
            const open = k === 0 && s < 0 ? AW : 0, x0 = s < 0 ? ff + 1.2 : ff + 2.6;
            const m = new THREE.Matrix4().makeBasis(v3(0, 0, s), v3(0, 1, 0), v3(-s, 0, 0)).setPosition(x0, 0, dr + s * open);
            K.add(M.door, leafG.clone(), m);
            for (const y of [6, 18]) K.add('steelDark', new THREE.BoxGeometry(AW - 2, 0.8, 0.6), mul(m, M4(AW / 2, y, s < 0 ? 1.8 : -0.4)));
            K.add('steelDark', new THREE.BoxGeometry(0.8, 4, 0.6), mul(m, M4(2, 12, s < 0 ? 1.8 : -0.4)));
          }
          K.add('steelDark', new THREE.BoxGeometry(1.4, 1.4, AW * 2 + 18), M4(ff + 2.6, AH + AW + 2, dr));
          K.add('lampAmber', new THREE.BoxGeometry(1.6, 2, 3), M4(ff + 1.6, AH + AW + 5.4, dr));
          K.add(decal('sam_dn' + k, texOf('sam_dn' + k, 64, 64, (q, w, h) => { q.fillStyle = '#e8dcc0'; q.fillRect(0, 0, w, h); q.fillStyle = '#a3221a'; q.font = 'bold 46px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(String(k + 1), w / 2, h / 2 + 3); })), new THREE.PlaneGeometry(4, 4), M4(ff + 0.15, AH + AW + 5.4, dr + AW + 4, 0, Math.PI / 2, 0));
          // thùng tên lửa trong lòng kho thấy qua cửa mở
          if (k === 0) for (let j = 0; j < 4; j++) K.box(M.oliveSunDark, ff - 7, 3.6 + (j % 2) * 7.2, dr - 6 - Math.floor(j / 2) * 9, 10, 7, 8, 0, 24);
        });
        K.plane(decal('sam_mstore', signTex('sam_mstore', ['MISSILE STORAGE', 'ВЗРЫВООПАСНО — НЕ КУРИТЬ — NO OPEN FLAME'], { w: 768, h: 160, bg: '#efe6d0', fg: '#a3221a' })), ff + 0.2, Hh - 4.6, (S.doors[0] + S.doors[1]) / 2, 30, 6.2);
        K.solid(ff - 7, S.r, 7, W, -2, Hh + 3);
        // nóc gò: ống thông gió nắp chụp + 2 cột thu lôi giàn thép
        for (const dr of S.doors) { const y0 = S.h; K.cyl('steelGray', S.f - 10, y0 - 1, dr, 1.8, 1.8, 10, 10); K.add('steelGray', new THREE.ConeGeometry(3.4, 3, 10), M4(S.f - 10, y0 + 10.5, dr)); K.solid(S.f - 10, dr, 4, 4, y0, y0 + 12); }
        for (const [f, r] of [[S.f - 40, S.r - W - 18], [S.f + 10, S.r + W + 14]]) {
          const y0 = Math.max(0, K.earth(f, r));
          K.cbox('concDark', f, y0 + 1, r, 6, 3, 6, 0.6);
          for (let k = 0; k < 4; k++) K.beam('steelGray', [f + (k < 2 ? -2 : 2), y0 + 2, r + (k % 2 ? -2 : 2)], [f, y0 + 92, r], 0.5);
          for (let y = 12; y < 90; y += 14) K.add('steelGray', new THREE.BoxGeometry(3.2 * (1 - y / 100), 0.4, 3.2 * (1 - y / 100)), M4(f, y0 + y, r));
          K.cyl('steelGray', f, y0 + 92, r, 0.15, 0.3, 16, 5);
          K.solid(f, r, 3, 3, y0, y0 + 108);
        }
        drift(ff + 4, S.r - W + 6, 30, 10, 3.8, Math.PI / 2); drift(ff + 4, S.r + W - 8, 22, 8, 3, Math.PI / 2);
        drift(ff + 3, (S.doors[0] + S.doors[1]) / 2, 14, 7, 2.6, Math.PI / 2);
        // sân nạp đạn bê tông
        const pf0 = ff + 2, pf1 = -54, pr0 = -436, pr1 = -306, pf = (pf0 + pf1) / 2, pr = (pr0 + pr1) / 2;
        K.cbox('conc', pf, 0.4, pr, pf1 - pf0, 1.2, pr1 - pr0, 0.4);
        // 2 xe PR-14 (ZIL-131 khung ray chở 2 tên lửa, xe 2 tên lửa phủ bạt) lùi đuôi sát cửa kho
        for (const [r, cover] of [[S.doors[0], false], [S.doors[1], true]]) {
          const tb = M4(-80, 1, r, 0, 0, 0);
          milTruck(TT, tb, 'loader');
          for (const z of [-5, 5]) {
            missile(mul(tb, M4(-47, 22.4, z)), cover);
            // 2 yên đỡ lòng máng (đệm cao su) ôm thân tên lửa + đai kẹp vận chuyển có tăng-đơ: tầng đẩy (r 2.2) và tầng
            // hành trình (r 1.5, yên cao hơn) — tên lửa không còn nằm lơ lửng trên ray
            for (const [x, rr] of [[-40, 2.2], [-14, 1.5]]) {
              const yb = 22.4 - rr;
              K.add(M.truckDark, new THREE.BoxGeometry(2, Math.max(0.4, yb - 20.05), 3.4), mul(tb, M4(x, (20.05 + yb) / 2, z)));
              K.add(M.rubber, new THREE.CylinderGeometry(rr + 0.25, rr + 0.25, 1.8, 14, 1, true, Math.PI / 2 + 0.7, Math.PI - 1.4), mul(tb, M4(x, 22.4, z, 0, 0, Math.PI / 2)));
              K.add('steelDark', new THREE.TorusGeometry(rr + 0.15, 0.14, 4, 16, Math.PI), mul(tb, M4(x + 0.4, 22.4, z, 0, Math.PI / 2, 0)));
              for (const s of [-1, 1]) K.add('steelGray', new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6), mul(tb, M4(x + 0.4, 21.4, z + s * (rr + 0.2))));
            }
          }
          K.solid(-82, r, 36, 11, 0, 30);
        }
        // tên lửa trên 2 giá kê gỗ chờ nạp (phủ bạt) mép sân
        { const f = -100, r = -316; for (const x of [-12, 12]) { K.box('wood', f + x, 2.4, r, 3, 4.8, 8); K.box('wood', f + x, 5.4, r, 3, 1.2, 4); } missile(M4(f - 25, 8.2, r), true); K.solid(f, r, 26, 6, 0, 12); }
        // thùng tên lửa (gỗ / thép sơn xanh) xếp chồng mép sân, 1 thùng bật nắp
        for (let j = 0; j < 5; j++) K.box(j % 2 ? 'wood' : M.oliveSunDark, -96, 3.6 + (j > 2 ? 7.2 : 0), pr0 + 6 + (j > 2 ? j - 2.5 : j) * 9, 52, 7, 8, 0, 24);
        K.box(M.oliveSunDark, -66, 1.2, pr0 + 8, 52, 2.4, 8, 0, 24); K.box(M.oliveSunDark, -66, 4.2, pr0 + 13, 52, 0.6, 8, 0, 24, 0.6);
        K.solid(-96, pr0 + 15, 27, 10, 0, 15); K.solid(-66, pr0 + 9, 27, 6, 0, 6);
        // bảng cứu hoả sơn đỏ (xô hình nón, xẻng, bình bọt) + thùng cát
        K.cbox('steelRed', pf1 - 2, 10, pr1 - 10, 1, 14, 18, 0.2);
        for (const z of [-5, 0, 5]) K.add('steelRed', new THREE.ConeGeometry(1.4, 3, 10), M4(pf1 - 0.8, 12, pr1 - 10 + z, Math.PI, 0, 0));
        K.add('wood', new THREE.BoxGeometry(0.4, 10, 0.6), M4(pf1 - 0.9, 9, pr1 - 3, 0.2, 0, 0));
        K.cbox('wood', pf1 - 2, 3, pr1 - 24, 6, 6, 10, 0.3);
        K.solid(pf1 - 2, pr1 - 16, 4, 14, 0, 17);
      }

      // =====================================================================================================
      // TRẠM PHÁT ĐIỆN: 2 máy phát diesel 5E96 trên rơ-moóc (vỏ có cửa chớp, cửa bảo dưỡng, ống xả + giảm thanh, két
      // nước, càng kéo, kích chống) trong ụ chữ U dưới lưới nguỵ trang, tủ phân phối điện, cáp, túi dầu mềm, phuy;
      // cáp đi trong mương nắp bê tông về gò radar
      // =====================================================================================================
      {
        const R = L.revs[2];
        const genset = (f, r, a) => {
          const b = M4(f, 0, r, 0, -a, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
          for (const z of [-4.6, 4.6]) K.add('steelDark', new THREE.BoxGeometry(50, 2, 1.4), at(0, 7, z));
          for (const x of [-12, 10]) for (const s of [-1, 1]) {
            K.add('rubber', new THREE.CylinderGeometry(4, 4, 2.6, 16), at(x, 4, s * 8.6, Math.PI / 2, 0, 0));
            K.add(M.camoDark, new THREE.CylinderGeometry(2.1, 2.1, 2.7, 10), at(x, 4, s * 8.7, Math.PI / 2, 0, 0));
          }
          K.beam('steelDark', [24, 6, -4], [36, 4.4, 0], 1, b); K.beam('steelDark', [24, 6, 4], [36, 4.4, 0], 1, b);
          K.add('steelGray', new THREE.CylinderGeometry(0.6, 0.6, 5, 6), at(34, 2.4, 0));
          for (const [x, z] of [[-22, -8], [-22, 8], [20, -8], [20, 8]]) { K.add('steelGray', new THREE.CylinderGeometry(0.7, 0.7, 6, 6), at(x, 3, z)); K.add('steelDark', new THREE.BoxGeometry(3, 0.6, 3), at(x, 0.3, z)); }
          K.cbox(M.camo, 0, 19, 0, 48, 20, 18, 0.8, 0, b);
          for (const x of [-23.8, 23.8]) K.add('louver', new THREE.BoxGeometry(0.6, 12, 12), at(x, 19, 0));
          for (const x of [-14, -2, 10]) for (const s of [-1, 1]) { K.add(M.camoDark, new THREE.BoxGeometry(10, 15, 0.4), at(x, 18.5, s * 9.1)); K.add('steelDark', new THREE.BoxGeometry(1.4, 0.6, 0.6), at(x + 3.6, 18, s * 9.4)); }
          K.add('louver', new THREE.BoxGeometry(8, 5, 0.5), at(-14, 24, 9.2));
          K.add('void', new THREE.BoxGeometry(9, 12, 0.3), at(10, 18, -9.05));
          K.add(M.camoDark, new THREE.BoxGeometry(9, 12, 0.5), at(15.4, 18, -13.6, 0, -1.1, 0));
          K.cyl('steelDark', -8, 29, 4, 2.6, 2.6, 3, 12, at(-8, 29, 4));
          K.add('steelDark', new THREE.CylinderGeometry(2.4, 2.4, 10, 12), at(-12, 31.4, -3, 0, 0, Math.PI / 2));
          K.cyl('steelRust', -18, 31, -3, 1, 1, 12, 8, at(-18, 31, -3));
          K.add('steelRust', new THREE.CylinderGeometry(1.6, 1.6, 0.4, 10), at(-18.6, 43.4, -3, 0, 0, 0.5));
          K.add('rubber', new THREE.CylinderGeometry(3.4, 3.4, 1, 14), at(26, 9, 0, 0, 0, Math.PI / 2));
          K.solid(f, r, 26, 11, 0, 44, a);
        };
        genset(R.f - 27, R.r - 4, R.a); genset(R.f + 27, R.r - 4, R.a);
        // tủ phân phối điện (cabin nhỏ trên bệ) ở đáy ụ + cáp từ 2 máy
        const bf = R.f, br = R.r - R.hl + 10;
        K.cbox(M.oliveSun, bf, 10, br, 28, 16, 14, 0.5);
        K.cbox('concDark', bf, 1, br, 30, 2, 16, 0.3);
        K.add(M.oliveSunDark, new THREE.BoxGeometry(8, 12, 0.5), M4(bf - 6, 10, br + 7.2));
        K.add('void', new THREE.BoxGeometry(8, 12, 0.3), M4(bf + 6, 10, br + 7.1));
        K.add(M.oliveSunDark, new THREE.BoxGeometry(8, 12, 0.5), M4(bf + 12.4, 10, br + 10.6, 0, -1.2, 0));
        K.plane(decal('sam_hv', signTex('sam_hv', ['ОПАСНО — DANGER', 'HIGH VOLTAGE 400 V'], { w: 512, h: 192, bg: '#e6dcc4', fg: '#a3221a' })), bf - 6, 12, br + 7.6, 7, 2.6, 0);
        K.solid(bf, br, 15, 8, 0, 18);
        for (const s of [-1, 1]) cable([[R.f + s * 16, R.r - 22, 8], [R.f + s * 16, br + 2], [bf + s * 14, br + 2, 6]], 1.1);
        cable([[bf, br + 7.5, 4], [bf, br + 12], [bf + 2, R.r + 30], [R.f + 30, R.r + R.hl + 6]], 1.3);
        net(M4(R.f, 0, R.r, 0, 0, 0), 116, 86, 46, 6);
        // phuy dầu ở miệng ụ, biển cảnh báo trên cọc
        for (let j = 0; j < 6; j++) drum(K, R.f + 44 + (j % 3) * 5.4, R.r + 26 + Math.floor(j / 3) * 5.4, j === 4 ? 'drumRust' : M.oliveSun);
        K.solid(R.f + 50, R.r + 29, 9, 7, 0, 8);
        signPost('sam_hv2', ['DANGER — HIGH VOLTAGE', 'ЭЛЕКТРОСТАНЦИЯ ДИВИЗИОНА'], { w: 768, h: 192, bg: '#d9a61c', fg: '#151515' }, R.f + 66, R.r + R.hl + 4, -Math.PI / 2, 22, 6);
        cableTrench([[R.f + 30, R.r + R.hl + 10], [R.f + 30, -314], [34, -314], [34, -150], [34, -66]]);
        drift(R.f - 60, R.r + R.hl + 2, 30, 10, 3, Math.PI / 2 + 0.3); drift(R.f, R.r + 2, 40, 8, 2, 0, 0);
      }

      // =====================================================================================================
      // KHO DẦU DIESEL: 3 bồn nằm trên gối bê tông trong bờ bao đất (lối vào phía đường), đai thép, cổ bồn, sàn đi nóc +
      // thang, ống góp tới trạm bơm ngoài lối vào, biển ДИЗТОПЛИВО / ОГНЕОПАСНО, phuy
      // =====================================================================================================
      {
        const B = L.bund;
        for (const dr of [-22, 0, 22]) {
          const r = B.r + dr;
          K.add(tankM, new THREE.CylinderGeometry(8.6, 8.6, 52, 22, 1, true), M4(B.f, 12.6, r, 0, 0, Math.PI / 2));
          for (const s of [-1, 1]) K.add('steelWhite', new THREE.SphereGeometry(8.6, 18, 8), M4(B.f + s * 26, 12.6, r, 0, 0, 0, 0.3, 1, 1));
          for (const x of [-16, 16]) { K.cbox('concDark', B.f + x, 2.4, r, 4, 4.8, 14, 0.4); K.add('steelDark', new THREE.TorusGeometry(8.8, 0.35, 4, 22, Math.PI), M4(B.f + x, 12.6, r, 0, Math.PI / 2, 0)); }
          K.cyl('steelGray', B.f + 6, 21, r, 1.6, 1.6, 2, 10); K.cyl('steelGray', B.f - 10, 21, r, 0.6, 0.6, 4, 6);
          K.add(decal('sam_dt', signTex('sam_dt', ['ДИЗТОПЛИВО', 'DIESEL — ОГНЕОПАСНО'], { w: 512, h: 160, bg: '#efe6d0', fg: '#a3221a' })), new THREE.PlaneGeometry(7, 2.2), M4(B.f + 28.5, 13, r, 0, Math.PI / 2, 0));
          K.solid(B.f, r, 29, 9, 0, 22);
        }
        K.add('steelDark', new THREE.BoxGeometry(3, 0.4, 50), M4(B.f + 6, 22.2, B.r));
        for (let y = 2; y < 22; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 3), M4(B.f + 6, y, B.r + 33.5));
        for (const s of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(0.3, 22, 0.3), M4(B.f + 6, 11, B.r + 33.5 + s * 1.4));
        // ống góp đầu bồn -> trạm bơm ngoài lối vào
        K.add('steelGray', new THREE.CylinderGeometry(0.9, 0.9, 52, 8), M4(B.f + 32, 5, B.r, Math.PI / 2, 0, 0));
        for (const dr of [-22, 0, 22]) K.beam('steelGray', [B.f + 27, 8, B.r + dr], [B.f + 32, 5, B.r + dr], 0.9);
        K.beam('steelGray', [B.f + 32, 5, B.r + 26], [B.f + 32, 5, B.r + 42], 1.6); K.beam('steelGray', [B.f + 32, 5, B.r + 42], [B.f + 2, 5, B.r + 46], 1.6);
        K.beam('steelGray', [B.f + 2, 5, B.r + 46], [B.f, 4, B.r + 58], 1.6);
        const pr = B.r + B.hl + 18;
        K.cbox('concDark', B.f, 1, pr, 12, 2, 10, 0.3); K.cbox(M.oliveSun, B.f, 6, pr, 8, 8, 6, 0.4);
        K.add('steelDark', new THREE.CylinderGeometry(2, 2, 6, 12), M4(B.f + 6.6, 6, pr, 0, 0, Math.PI / 2));
        K.solid(B.f, pr, 7, 6, 0, 10);
        signPost('sam_fuel', ['ОГНЕОПАСНО', 'FLAMMABLE — NO SMOKING'], { w: 512, h: 192, bg: '#d9a61c', fg: '#151515' }, B.f - 20, pr + 4, -Math.PI / 2, 16, 5.5);
        for (let j = 0; j < 4; j++) drum(K, B.f - 24 + j * 5.2, B.r + B.hl - 5, j === 2 ? 'drumBlue' : 'drumRust');
        K.solid(B.f - 16, B.r + B.hl - 5, 10, 3, 0, 8);
        drift(B.f - 8, B.r + B.hl - 2, 30, 6, 2, 0); drift(B.f + 20, B.r - B.hl + 4, 26, 7, 2, 0);
      }

      // =====================================================================================================
      // RADAR CẢNH GIỚI P-18 trên gò riêng: đế 4 tay chống có kích, cột ăng-ten ống lồng, đầu xoay, 2 hàng x 8 ăng-ten Yagi
      // (mỗi chiếc 1 chấn tử phản xạ + chấn tử chủ động + 6 chấn tử dẫn xạ), giàn đỡ, dây néo; xe thiết bị (kung) dưới
      // chân gò, cáp; bờ bao cát mép gò
      // =====================================================================================================
      {
        const Q = L.p18, y0 = Q.h, b = M4(Q.f, y0, Q.r + 4, 0, 0.9, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
        K.cbox('concDark', Q.f, y0 - 1, Q.r + 4, 34, 3, 34, 0.5);
        for (const a of [0.4, 0.4 + Math.PI / 2, 0.4 + Math.PI, 0.4 - Math.PI / 2]) {
          K.add(M.camo, new THREE.BoxGeometry(22, 2, 2.4), mul(M4(Q.f, y0 + 2.4, Q.r + 4), M4(Math.cos(a) * 10, 0, Math.sin(a) * 10, 0, -a, 0)));
          K.add('steelGray', new THREE.CylinderGeometry(0.8, 0.8, 4, 8), M4(Q.f + Math.cos(a) * 20, y0 + 2, Q.r + 4 + Math.sin(a) * 20));
          K.add('steelDark', new THREE.CylinderGeometry(2.2, 2.6, 0.8, 10), M4(Q.f + Math.cos(a) * 20, y0 + 0.9, Q.r + 4 + Math.sin(a) * 20));
        }
        K.cbox(M.camo, 0, 4.6, 0, 10, 5, 10, 0.5, 0, b);
        K.cyl(M.camoDark, 0, 7, 0, 2.2, 2.6, 30, 12, at(0, 7, 0));
        K.cyl(M.camoDark, 0, 37, 0, 1.7, 1.9, 30, 12, at(0, 37, 0));
        K.cyl('steelDark', 0, 36, 0, 2.8, 2.8, 1.4, 12, at(0, 36, 0));
        K.cyl('steelDark', 0, 67, 0, 3.2, 3.2, 3, 14, at(0, 67, 0));
        const hd = at(0, 70, 0);
        K.add(M.camo, new THREE.BoxGeometry(3, 3, 76), mul(hd, M4(-2, 12, 0)));
        K.add(M.camo, new THREE.BoxGeometry(3, 3, 76), mul(hd, M4(-2, 0, 0)));
        for (const z of [-30, -10, 10, 30]) K.add(M.camo, new THREE.BoxGeometry(2, 13, 2), mul(hd, M4(-2, 6, z)));
        for (const s of [-1, 1]) { K.beam(M.camo, [-2, 0, 0], [-2, 12, s * 30], 0.8, hd); K.beam('steelGray', [-2, -3, 0], [-2, 12, s * 36], 0.4, hd); }
        for (const y of [0, 12]) for (let i = 0; i < 8; i++) {
          const z = -31.5 + i * 9;
          K.add('steelGray', new THREE.BoxGeometry(28, 0.6, 0.6), mul(hd, M4(12, y, z)));
          K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 8.4), mul(hd, M4(0.6, y, z)));
          K.add('steelDark', new THREE.BoxGeometry(0.5, 0.9, 7.8), mul(hd, M4(4.4, y, z)));
          for (let k = 0; k < 6; k++) K.add('steelGray', new THREE.BoxGeometry(0.25, 0.25, 7 - k * 0.25), mul(hd, M4(8.4 + k * 3.8, y, z)));
        }
        for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.4, ax = Q.f + Math.cos(a) * 32, az = Q.r + 4 + Math.sin(a) * 32, ay = Math.max(0, K.earth(ax, az)); K.box('concDark', ax, ay + 0.8, az, 3, 2.4, 3); K.beam('steelDark', [ax, ay + 2, az], [Q.f, y0 + 52, Q.r + 4], 0.25); }
        K.solid(Q.f, Q.r + 4, 12, 12, y0, y0 + 68);
        K.solid(Q.f, Q.r + 4, 34, 34, y0 + 64, y0 + 86, 0.9 + Math.PI / 2);
        for (const [a0, a1] of [[0.6, 2.2], [2.6, 4.0], [-1.4, 0.2]]) for (let k = 0; k < 4; k++) { const t0 = a0 + (a1 - a0) * k / 4, t1 = a0 + (a1 - a0) * (k + 1) / 4; sandbags(SK, Q.f + Math.cos(t0) * (Q.R - 2), Q.r + Math.sin(t0) * (Q.R - 2), Q.f + Math.cos(t1) * (Q.R - 2), Q.r + Math.sin(t1) * (Q.R - 2), 2, Q.h - 1); }
        // xe thiết bị radar dưới chân gò (thùng kung, cột ăng-ten thông tin), cáp lên gò
        milTruck(TK, M4(-80, 0, 346, 0, Math.PI / 2, 0), 'kung');
        K.solid(-80, 347, 34, 11, 0, 32, -Math.PI / 2);
        net(M4(-80, 0, 348, 0, Math.PI / 2, 0), 80, 40, 36, 4);
        cable([[Q.f, Q.r + 4, y0 + 6], [Q.f + 4, Q.r - 20, y0 + 0.6], [Q.f + 8, Q.r - Q.R - 10], [Q.f + 14, Q.r - Q.R - 30], [-84, 380]], 1);
        cableTrench([[Q.f + 30, 312], [-40, 312], [-40, 150], [-40, 66]]);
        drift(Q.f + 22, Q.r + 40, 30, 10, 3, 1.1, 0);
      }

      // =====================================================================================================
      // PHÒNG KHÔNG TẦM THẤP: 4 hố pháo ZU-23-2 + 2 ụ pháo S-60
      // Hố ZU-23 (theo công sự dã chiến thật): lòng hố Ø ~5 m nền đất nện, vách trong xếp bao cát đứng giữ đất, bờ đất đắp
      // đỉnh bằng rộng sau vách, mái ngoài thoải có rãnh xói, chừa lối vào có 2 tường bao cát chặn đầu; 2 hốc để hòm đạn
      // dưới chân vách, đống vỏ đạn dưới máng hất 2 bên súng. Bờ đất địa hình (MapGen, lưới 16 đơn vị) quá thô -> phủ da mịn.
      // ZU-23-2: đế tam giác 3 chân kích (vỏ kích, trục vít, tay quay, đế lún cát), 2 bánh nhấc khỏi đất trên tay đòn, mâm
      // xoay, khung trên 2 má gối trục, 2 ghế pháo thủ (đệm, tựa, gác chân), 2 tay quay tầm / hướng, 2 lò xo cân bằng, 2 khẩu
      // 2A14 (hộp khoá nòng, tay kéo nạp, ống bọc gốc nòng, nòng mảnh có quai xách, loa che lửa có khe), 2 hòm băng đạn 50
      // viên ngoài 2 bên có máng tiếp đạn + băng đạn lộ, máng hất vỏ đạn, kính ngắm ZAP-23.
      // S-60: xe 4 bánh (2 trục, chắn bùn) nhấc bánh, khung dọc + càng kéo dựng, 2 càng ngang, 4 kích; mâm xoay, má gối
      // trục, LÁ CHẮN thép phía trước (khe nòng + 2 cánh gập), nòng dài có loa hãm lỗ tổ ong, xi-lanh lùi / đẩy về, khay nạp
      // kẹp 4 viên trên khoá nòng, 2 ghế + tay quay, kính ngắm; ụ bao cát có đất đắp ngoài.
      // =====================================================================================================
      // nền đất nện lòng hố: đất nâu xám bị dẫm, dấu giày, sỏi, vỏ đạn lấp lánh
      M.pitFloor = MAT.sam_pitFloor || (MAT.sam_pitFloor = new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, map: texOf('sam_pitFloor', 256, 256, (g, w, h) => {
        g.fillStyle = '#9a8562'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) blotch(g, hash(i + 7300) * w + ox, hash(i + 7301) * h + oy, 10 + hash(i + 7302) * 34, hash(i + 7303) < 0.55 ? '112,94,66' : '196,174,134', 0.24);
        speckle(g, w, h, 2600, ['#7a6a50', '#c9b48e', '#6a5c46', '#b09a74'], 1, 2.4, 7310);
        // dấu giày (cặp vệt bầu dục sẫm), lộn xộn quanh súng
        // (từng vết đơn mờ, đế giày dài + gót, hướng lộn xộn; cặp bầu dục đậm nhìn như dấu chân thú)
        for (let i = 0; i < 46; i++) {
          const x = hash(i + 7320) * w, y = hash(i + 7321) * h, a = hash(i + 7322) * TAU;
          g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = `rgba(70,58,42,${0.06 + hash(i + 7323) * 0.07})`;
          g.beginPath(); g.ellipse(0, -1.6, 2, 3.4, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(0, 3.6, 1.7, 1.8, 0, 0, TAU); g.fill();
          g.restore();
        }
        for (let i = 0; i < 140; i++) { g.fillStyle = hash(i + 7330) < 0.6 ? 'rgba(196,150,62,0.85)' : 'rgba(120,92,40,0.8)'; g.save(); g.translate(hash(i + 7331) * w, hash(i + 7332) * h); g.rotate(hash(i + 7333) * TAU); g.fillRect(-2, -0.6, 4, 1.2); g.restore(); }
      }, true) }));
      // mặt đất nện tròn bám địa hình (lưới cực), bán kính R
      const pitFloor = (f, r, R) => {
        const NA = 32, NR = 6, pos = [], uvs = [], idx = [];
        pos.push(f, Math.max(0, K.earth(f, r)) + 0.45, r); uvs.push(f / 24, r / 24);
        for (let j = 1; j <= NR; j++) for (let i = 0; i < NA; i++) {
          const a = i / NA * TAU, d = R * j / NR, pf = f + Math.cos(a) * d, pr = r + Math.sin(a) * d;
          pos.push(pf, Math.max(0, K.earth(pf, pr)) + 0.45, pr); uvs.push(pf / 24, pr / 24);
        }
        for (let i = 0; i < NA; i++) idx.push(0, 1 + (i + 1) % NA, 1 + i);
        for (let j = 1; j < NR; j++) for (let i = 0; i < NA; i++) {
          const a = 1 + (j - 1) * NA + i, b2 = 1 + (j - 1) * NA + (i + 1) % NA, c = a + NA, d = b2 + NA;
          idx.push(a, b2, c, b2, d, c);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
        if (g.attributes.normal.getY(0) < 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; } g.setIndex(idx); g.computeVertexNormals(); }
        K.add(M.pitFloor, g, null);
      };
      // bóng tiếp xúc (không có AO): mảng tối mờ dưới súng / chồng hòm, dải tối sát chân vách bao cát -> vật không còn như
      // dán lên nền. aoDisc: đĩa tối dần ra mép; aoRing: dải từ R0 (nhạt) tới R1 (đậm, sát chân vách)
      const aoTex = MAT.sam_aoTex || (MAT.sam_aoTex = texOf('sam_ao', 64, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }));
      M.ao = MAT.sam_ao || (MAT.sam_ao = new THREE.MeshBasicMaterial({ color: 0x1a140c, map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      const aoGeo = (f, r, R0, R1, uvAt) => {
        const NA = 32, NR = 4, pos = [], uvs = [], idx = [];
        for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
          const a = i / NA * TAU, t = j / NR, d = R0 + (R1 - R0) * t, pf = f + Math.cos(a) * d, pr = r + Math.sin(a) * d;
          pos.push(pf, Math.max(0, K.earth(pf, pr)) + 0.5, pr); uvs.push(...uvAt(a, t));
          if (i && j) { const c = j * (NA + 1) + i, b2 = c - 1, u = c - NA - 1, v = u - 1; idx.push(v, b2, u, u, b2, c); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
        K.add(M.ao, g, null);
      };
      const aoDisc = (f, r, R) => aoGeo(f, r, 0.01, R, (a, t) => [0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5]);
      // (u = 0.5 cố định, v chạy theo bán kính ảnh đốm: tâm đốm = sát chân vách)
      const aoRing = (f, r, R0, R1) => aoGeo(f, r, R0, R1, (a, t) => [0.5, 0.5 + (1 - t) * 0.5]);
      // vòng bao cát theo cung tròn bán kính R (tâm f, r), từ góc a0 tới a1, rows hàng; y0 bám đất
      const arcBags = (f, r, R, a0, a1, rows, lift) => {
        const n = Math.max(1, Math.round(R * Math.abs(a1 - a0) / 9));
        for (let k = 0; k < n; k++) {
          const t0 = a0 + (a1 - a0) * k / n, t1 = a0 + (a1 - a0) * (k + 1) / n - 0.02 * Math.sign(a1 - a0), tm = (t0 + t1) / 2;
          sandbags(SK, f + Math.cos(t0) * R, r + Math.sin(t0) * R, f + Math.cos(t1) * R, r + Math.sin(t1) * R, rows, Math.max(0, K.earth(f + Math.cos(tm) * R, r + Math.sin(tm) * R)) - 0.5 + (lift || 0));
        }
      };
      // đống vỏ đạn (n vỏ, tâm cf, cr, bán kính R, cao đống H): vỏ nằm ngổn ngang, dày ở giữa
      const casingHeap = (cf, cr, n, R, H, cr0, len) => {
        const y0 = Math.max(0, K.earth(cf, cr)) + 0.45;
        for (let k = 0; k < n; k++) {
          const s = cf * 3.1 + cr * 1.7 + k * 7.3, d = R * Math.sqrt(hash(s)) * (0.4 + 0.6 * hash(s + 1)), a = hash(s + 2) * TAU, hh = H * Math.max(0, 1 - d / R) * hash(s + 3);
          K.add(M.brass, new THREE.CylinderGeometry(cr0, cr0 * 1.08, len, 6), M4(cf + Math.cos(a) * d, y0 + cr0 + hh, cr + Math.sin(a) * d, Math.PI / 2 + (hash(s + 4) - 0.5) * 0.6, hash(s + 5) * TAU, (hash(s + 6) - 0.5) * 0.4));
        }
      };
      // hòm đạn gỗ sơn ô-liu kiểu Liên Xô: ghép từ từng tấm ván (mỗi tấm lệch tông, khe hở giữa ván thấy lòng tối), nẹp gỗ
      // đứng 4 góc, thanh cầm gỗ đóng ngang 2 đầu, 2 khoá gài thép + bản lề nắp, chữ sơn trắng tróc mặt trước; open: bật nắp
      const crateText = decalT('sam_crate', texOf('sam_crateTx', 256, 96, (q, w, h) => {
        q.clearRect(0, 0, w, h); q.fillStyle = 'rgba(232,228,212,0.82)'; q.font = 'bold 34px Arial'; q.textAlign = 'center';
        q.fillText('23 ММ  БЗТ-ОФЗ', w / 2, 40); q.font = 'bold 22px Arial'; q.fillText('200 ШТ  58 КГ  №2-17', w / 2, 76);
        q.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 900; i++) { q.fillStyle = 'rgba(0,0,0,' + (0.3 + hash(i + 7700) * 0.7) + ')'; q.fillRect(hash(i + 7701) * w, hash(i + 7702) * h, 1 + hash(i + 7703) * 3, 1 + hash(i + 7704) * 2); }
      }));
      const ammoCrate = (f, r, y, ang, w, hgt, dep, open, round) => {
        const b = M4(f, y, r, 0, -ang, 0), at = (x, yy, z, rx, ry, rz) => mul(b, M4(x, yy, z, rx, ry, rz)), G = 0.07, T = 0.32, nb = 3, bh = hgt / nb;
        K.add(M.black, new THREE.BoxGeometry(w - 0.5, hgt - 0.3, dep - 0.5), at(0, hgt / 2, 0));   // lòng hòm tối sau khe ván
        for (let k = 0; k < nb; k++) for (const sz of [-1, 1]) K.add(M.crate, new THREE.BoxGeometry(w - 0.6, bh - G, T), at((hash(f + k + sz) - 0.5) * 0.08, bh * (k + 0.5), sz * (dep / 2 - T / 2)));
        for (const sx of [-1, 1]) {
          for (let k = 0; k < nb; k++) K.add(M.crate, new THREE.BoxGeometry(T, bh - G, dep - 2 * T), at(sx * (w / 2 - 0.3 - T / 2), bh * (k + 0.5), 0));
          for (const sz of [-1, 1]) K.add(M.crate, new THREE.BoxGeometry(0.6, hgt + 0.05, 0.6), at(sx * (w / 2 - 0.3), hgt / 2, sz * (dep / 2 - 0.3)));
          K.add(M.crate, new THREE.BoxGeometry(0.45, 0.55, dep - 0.9), at(sx * (w / 2 + 0.12), hgt * 0.68, 0));
        }
        for (const sx of [-0.28, 0.28]) { K.add('steelDark', new THREE.BoxGeometry(0.6, 1.1, 0.14), at(sx * w, hgt - 0.45, -dep / 2 - 0.05)); K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 0.2), at(sx * w, hgt - 0.95, -dep / 2 - 0.1)); }
        const tw = Math.min(w * 0.7, 6.6);
        K.add(crateText, new THREE.PlaneGeometry(tw, tw * 0.375), at(0, hgt * 0.45, -dep / 2 - 0.02, 0, Math.PI, 0));
        for (const sx of [-0.3, 0.3]) K.add('steelDark', new THREE.BoxGeometry(0.9, 0.2, 0.2), at(sx * w, hgt, dep / 2 + 0.05));
        const lid = (m) => {
          for (let k = 0; k < 2; k++) K.add(M.crate, new THREE.BoxGeometry(w - 0.2, 0.32, dep / 2 - G), mul(m, M4(0, 0, (k - 0.5) * dep / 2)));
          for (const sx of [-1, 1]) K.add(M.crate, new THREE.BoxGeometry(0.5, 0.3, dep), mul(m, M4(sx * (w / 2 - 1), 0.28, 0)));
        };
        if (open) {
          K.add(M.black, new THREE.BoxGeometry(w - 0.8, 0.1, dep - 0.8), at(0, hgt - 0.3, 0));
          lid(mul(at(0, hgt + 0.05, dep / 2), M4(0, dep * 0.45, dep * 0.2, -1.9, 0, 0)));
          if (round) for (let k = 0; k < Math.floor((w - 1.4) / (round * 2.3)); k++) {
            const x = -w / 2 + 0.9 + round * 1.2 + k * round * 2.3;
            K.add(M.brass, new THREE.CylinderGeometry(round, round, dep * 0.55, 8), at(x, hgt - round - 0.4, dep * 0.12, Math.PI / 2, 0, 0));
            K.add('steelDark', new THREE.ConeGeometry(round * 0.9, dep * 0.3, 8), at(x, hgt - round - 0.4, -dep * 0.3, -Math.PI / 2, 0, 0));
          }
        } else lid(at(0, hgt + 0.16, 0));
      };
      // bánh lốp có gai (lốp xuyến + vấu gai quanh mặt lăn), vành sơn, moay-ơ, đai ốc; trục bánh dọc Z cục bộ
      const tyre = (base, R, T, gx) => {
        // (lốp đường bộ: gai nông nhiều rãnh, không phải vấu to như lốp máy cày)
        K.add(M.rubber, new THREE.TorusGeometry(R, T, 10, 28), base);
        for (let k = 0; k < 30; k++) { const a = k / 30 * TAU; K.add(M.rubber, new THREE.BoxGeometry(0.34, 0.14, T * 1.2), mul(base, M4(Math.cos(a) * (R + T * 0.97), Math.sin(a) * (R + T * 0.97), 0, 0, k % 2 ? 0.35 : -0.35, a + Math.PI / 2))); }
        K.add(M.gunTanDark, new THREE.CylinderGeometry(R * 0.72, R * 0.72, T * 1.1, 14), mul(base, M4(0, 0, 0, Math.PI / 2, 0, 0)));
        K.add('steelGray', new THREE.CylinderGeometry(R * 0.26, R * 0.3, T * 1.6, 10), mul(base, M4(0, 0, 0, Math.PI / 2, 0, 0)));
        for (let k = 0; k < (gx || 6); k++) { const a = k / (gx || 6) * TAU; K.add('steelDark', new THREE.CylinderGeometry(0.14, 0.14, T * 1.4, 6), mul(base, M4(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, 0, Math.PI / 2, 0, 0))); }
      };
      // tay quay: vòng xuyến + 3 nan + núm cầm; trục quay dọc X cục bộ của base
      const handwheel = (base, R) => {
        K.add('steelDark', new THREE.TorusGeometry(R, 0.14, 4, 14), mul(base, M4(0, 0, 0, 0, Math.PI / 2, 0)));
        for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; K.beam('steelDark', [0, 0, 0], [0, Math.cos(a) * R, Math.sin(a) * R], 0.16, base); }
        K.add('steelGray', new THREE.CylinderGeometry(0.22, 0.22, 0.6, 6), mul(base, M4(0, 0, 0, 0, 0, Math.PI / 2)));
        K.add(M.black, new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), mul(base, M4(-0.6, R * 0.7, R * 0.7, 0, 0, Math.PI / 2)));
      };
      // kích chân đế: vỏ kích, trục vít, tay quay chữ T, đế tròn lún cát (gốc tại mặt đất)
      // (đế bám mặt nền thật tại chỗ đặt kích: nền lòng hố không phẳng -> đế lún mất / lơ lửng; trục vít dài ra cho tới đế)
      const jack = (base, H) => {
        const p = new THREE.Vector3().setFromMatrixPosition(base), dy = Math.min(H - 1, Math.max(0, K.earth(p.x, p.z)) + 0.42 - p.y);
        K.add(M.gunTanDark, new THREE.CylinderGeometry(1.3, 1.5, 0.5, 12), mul(base, M4(0, dy + 0.1, 0)));
        K.add('steelGray', new THREE.CylinderGeometry(0.42, 0.42, H - dy, 8), mul(base, M4(0, (H + dy) / 2, 0)));
        K.add(M.gunTanDark, new THREE.CylinderGeometry(0.8, 0.8, H * 0.55, 10), mul(base, M4(0, H * 0.72, 0)));
        K.add('steelDark', new THREE.BoxGeometry(2.6, 0.22, 0.22), mul(base, M4(0, H + 0.2, 0, 0, 0.6, 0)));
        K.add(M.black, new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6), mul(base, M4(Math.cos(0.6) * 1.3, H + 0.6, -Math.sin(0.6) * 1.3)));
      };
      // ghế pháo thủ: cột, mâm ghế + đệm, tựa lưng nghiêng, thanh gác chân
      const seat = (base) => {
        K.add('steelDark', new THREE.CylinderGeometry(0.25, 0.3, 2.6, 6), mul(base, M4(0, 1.3, 0)));
        K.cbox(M.gunTanDark, 0, 2.75, 0, 2.6, 0.4, 2.4, 0.12, 0, base);
        K.cbox(M.oliveSunDark, 0.1, 3.1, 0, 2.2, 0.4, 2, 0.15, 0, base);
        K.cbox(M.oliveSunDark, -1.3, 4.2, 0, 0.4, 1.6, 1.8, 0.15, 0, mul(base, M4(0, 0, 0, 0, 0, 0.18)));
        K.beam('steelDark', [-1.1, 2.7, 0], [-1.5, 5.4, 0], 0.22, base);
        K.beam('steelDark', [1, 2.6, -0.9], [3.6, 0.9, -0.9], 0.18, base); K.beam('steelDark', [1, 2.6, 0.9], [3.6, 0.9, 0.9], 0.18, base);
        K.add('steelGray', new THREE.BoxGeometry(0.4, 0.2, 2.2), mul(base, M4(3.6, 0.9, 0)));
      };

      const zu23 = (f, r, az, el) => {
        const gy = Math.max(0, K.earth(f, r)) + 0.4;
        const b = M4(f, gy, r, 0, -az, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
        // đế tam giác: moay-ơ giữa, 3 chân hộp thép thon (có gân), kích ở đầu chân
        K.add(M.gunTanDark, new THREE.CylinderGeometry(3.6, 4.2, 1.8, 12), at(0, 2.6, 0));
        for (const a of [0, 2.25, -2.25]) {
          const lg = mul(b, M4(0, 0, 0, 0, -a, 0)), la = (x, y, z, rx, ry, rz) => mul(lg, M4(x, y, z, rx, ry, rz));
          K.add(M.gunTanDark, plateGeo([[2, 1.6], [14, 1.3], [14, 2.6], [2, 3.6]], 1.5), la(0, 0, 0));
          K.add(M.gunTan, new THREE.BoxGeometry(12, 0.3, 1.9), la(8, 3.2, 0, 0, 0, -0.1));
          jack(la(14.4, 0, 0), 3.4);
        }
        // 2 bánh nhấc khỏi đất trên tay đòn
        for (const s of [-1, 1]) {
          K.beam(M.gunTanDark, [0.5, 3, s * 3.2], [-2, 5, s * 6.2], 1, b);
          K.add('steelDark', new THREE.CylinderGeometry(0.45, 0.45, 2.4, 8), at(-2, 5.2, s * 6.6, Math.PI / 2, 0, 0));
          tyre(at(-2, 5.2, s * 8, 0, 0, 0.3), 2.3, 0.95, 5);
        }
        // mâm xoay + khung trên
        K.add('steelDark', new THREE.CylinderGeometry(3.9, 3.9, 0.9, 20), at(0, 3.9, 0));
        K.add('steelGray', new THREE.TorusGeometry(3.9, 0.22, 4, 24), at(0, 4.3, 0, Math.PI / 2, 0, 0));
        K.cbox(M.gunTan, -1.5, 5, 0, 11, 1, 7.4, 0.3, 0, b);
        for (const s of [-1, 1]) {
          K.add(M.gunTan, plateGeo([[-4, 0], [4.5, 0], [2.6, 5.4], [-1.6, 5.4]], 0.6), at(0, 5.4, s * 2.9));
          K.add('steelDark', new THREE.CylinderGeometry(1, 1, 0.6, 12), at(0.6, 9.8, s * 3.3, Math.PI / 2, 0, 0));
          seat(at(-6.2, 5.4, s * 3.4));
          // lò xo cân bằng (ống lò xo đứng sau má gối trục)
          K.add(M.gunTanDark, new THREE.CylinderGeometry(0.75, 0.75, 4.6, 10), at(-2.8, 8, s * 3.3, 0, 0, -0.35));
          for (let k = 0; k < 4; k++) K.add('steelDark', new THREE.TorusGeometry(0.78, 0.12, 4, 10), at(-2.8 + 0.4 * (k - 1.5), 8 + (k - 1.5) * 1.05, s * 3.3, Math.PI / 2, 0.35, 0));
        }
        // 2 tay quay tầm / hướng trước ghế pháo thủ chính (bên trái)
        handwheel(at(-3.6, 8.2, -3.6), 1.05);
        handwheel(mul(at(-3.2, 6.8, -1.6), M4(0, 0, 0, 0, Math.PI / 2, 0)), 0.9);
        // cụm nòng nâng góc tà quanh trục gối
        const cr = mul(at(0.6, 9.8, 0), M4(0, 0, 0, 0, 0, el)), cat = (x, y, z, rx, ry, rz) => mul(cr, M4(x, y, z, rx, ry, rz));
        K.cbox(M.gunTanDark, 0.5, -0.9, 0, 9, 1, 4.4, 0.25, 0, cr);
        for (const s of [-1, 1]) {
          const z = s * 1.25;
          K.cbox(M.gunTanDark, 1.5, 0.4, z, 10.5, 2.3, 1.5, 0.2, 0, cr);
          K.add('steelDark', new THREE.BoxGeometry(8, 0.35, 0.9), cat(1.8, 1.65, z));
          K.add('steelGray', new THREE.BoxGeometry(1.4, 0.5, 0.3), cat(-1.5, 0.8, z + s * 0.9));
          K.add('steelDark', new THREE.CylinderGeometry(0.62, 0.66, 4.4, 10), cat(8.6, 0.5, z, 0, 0, -Math.PI / 2));
          K.add('steelDark', new THREE.CylinderGeometry(0.34, 0.42, 18, 10), cat(19.6, 0.5, z, 0, 0, -Math.PI / 2));
          K.add('steelGray', new THREE.TorusGeometry(0.5, 0.1, 4, 8), cat(14, 0.5, z, 0, Math.PI / 2, 0));
          K.add('steelDark', new THREE.TorusGeometry(0.9, 0.14, 4, 8, Math.PI), cat(14, 0.6, z, 0, 0, 0));
          K.add('steelDark', new THREE.CylinderGeometry(0.6, 0.55, 2.6, 10), cat(29.9, 0.5, z, 0, 0, -Math.PI / 2));
          for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; K.add('void', new THREE.BoxGeometry(1.6, 0.14, 0.14), cat(29.9, 0.5 + Math.cos(a) * 0.6, z + Math.sin(a) * 0.6)); }
          K.add('steelDark', new THREE.CylinderGeometry(0.7, 0.7, 0.3, 10), cat(31.2, 0.5, z, 0, 0, -Math.PI / 2));
          // hòm băng đạn 50 viên ngoài 2 bên: thân thép dập có 2 gân dọc mặt ngoài, nắp trùm mép, bản lề nắp phía trong,
          // 2 khoá gài 2 đầu, quai xách gập trên nắp, gờ bắt vào nôi; máng tiếp đạn + băng đạn lộ
          {
            const mz = s * 4.3, ox = s * 1.42;
            K.cbox(M.gunTanDark, 0.4, -0.05, mz, 5, 3.9, 2.8, 0.18, 0, cr);
            K.cbox(M.gunTanDark, 0.4, 2.05, mz, 5.3, 0.45, 3.05, 0.12, 0, cr);
            for (const dx of [-1.2, 1.2]) K.add(M.gunTan, new THREE.BoxGeometry(1.4, 3.1, 0.12), cat(0.4 + dx, -0.15, mz + ox - s * 0.04));
            K.add('steelDark', new THREE.BoxGeometry(4.6, 0.2, 0.22), cat(0.4, -1.95, mz + ox));
            K.add('steelGray', new THREE.CylinderGeometry(0.12, 0.12, 4.4, 6), cat(0.4, 2.2, mz - s * 1.55, 0, 0, Math.PI / 2));
            for (const dx of [-2.7, 2.7]) { K.add('steelDark', new THREE.BoxGeometry(0.22, 1.3, 0.8), cat(0.4 + dx, 1.5, mz)); K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 0.5), cat(0.4 + dx * 1.04, 2.1, mz)); }
            for (const x of [-0.6, 1.4]) K.beam('steelDark', [x, 2.35, mz - 0.4], [x, 2.35, mz + 0.4], 0.14, cr);
            K.beam('steelDark', [-0.6, 2.35, mz + s * 0.4], [1.4, 2.35, mz + s * 0.4], 0.16, cr);
            K.add('steelDark', new THREE.BoxGeometry(4, 0.5, 0.5), cat(0.4, -1.4, mz - s * 1.5));
          }
          K.add('steelDark', new THREE.BoxGeometry(2.4, 0.9, 1.9), cat(1.2, 2.2, s * 2.55, 0.2 * s, 0, 0));
          for (let k = 0; k < 5; k++) {
            const zz = s * (2 + k * 0.46);
            K.add(M.brass, new THREE.CylinderGeometry(0.15, 0.17, 1.2, 6), cat(0.6, 2.75, zz, 0, 0, -Math.PI / 2));
            K.add('steelDark', new THREE.ConeGeometry(0.13, 0.7, 6), cat(1.55, 2.75, zz, 0, 0, -Math.PI / 2));
          }
          K.add('steelDark', new THREE.BoxGeometry(1.2, 2.6, 0.8), cat(0.3, -2, z, 0, 0, 0.35));
        }
        // kính ngắm ZAP-23 (bên trái, trước pháo thủ chính): thân hộp, ống kính, thị kính cao su, vòng chuẩn trực
        K.cbox(M.gunTanDark, -1.6, 3.2, -3.1, 3, 2.4, 1.6, 0.2, 0, cr);
        K.add('steelDark', new THREE.CylinderGeometry(0.45, 0.45, 2.6, 8), cat(1, 3.6, -3.1, 0, 0, -Math.PI / 2));
        K.add(M.black, new THREE.CylinderGeometry(0.42, 0.5, 0.9, 8), cat(-3.4, 3.4, -3.1, 0, 0, -Math.PI / 2));
        K.add('glass', new THREE.CircleGeometry(0.4, 8), cat(2.35, 3.6, -3.1, 0, Math.PI / 2, 0));
        K.add('steelGray', new THREE.TorusGeometry(0.9, 0.08, 4, 12), cat(2.6, 4.7, -3.1, 0, Math.PI / 2, 0));
        K.solid(f, r, 15, 15, 2.2, 16, az);   // y0 > 2: không sinh dải đất bẩn vuông quanh súng giữa lòng hố
      };

      // hố ZU-23: lòng hố, vách bao cát trong, bờ đất mịn, lối vào, hòm đạn, vỏ đạn
      const zuPit = (f, r, ent) => {
        const RW = 21.5, gap = (th) => smooth(0.35, 0.6, Math.abs(Math.atan2(Math.sin(th - ent), Math.cos(th - ent))));
        // bờ đất: sau vách là đất đắp đỉnh bằng (cao ~1 m sát vách, 1.25 m ở đỉnh), mái ngoài theo đúng ụ địa hình
        const want = (pf, pr) => {
          const df = pf - f, dr = pr - r, d = Math.hypot(df, dr), th = Math.atan2(dr, df);
          if (d < RW - 0.2) return 0;
          const outer = 10 * (d <= 20 ? 0 : 1 - smooth(0, 9, Math.abs(d - 29)));
          const fill = d < 29 ? 8 + 2 * smooth(RW, 28, d) : 0;
          const rill = d > 30 && d < 37 ? Math.pow(Math.max(0, Math.sin(th * 23 + f)), 12) * 0.9 : 0;
          return (Math.max(outer, fill) + 0.35 * Math.sin(th * 7 + r) * smooth(RW, 26, d)) * gap(th) - rill;
        };
        const NA = 112, R0 = RW - 0.5, R1 = 40, NR = Math.ceil((R1 - R0) / 1.5) + 1;
        skin((pf, pr) => want(pf, pr), NA + 1, NR, (i, j) => { const a = i / NA * TAU, d = R0 + (R1 - R0) * j / (NR - 1); return [f + Math.cos(a) * d, r + Math.sin(a) * d]; },
          (pf, pr) => want(pf, pr) > K.earth(pf, pr) - 0.4, 0.15);
        pitFloor(f, r, RW + 0.5);
        aoRing(f, r, RW - 4, RW + 0.6);
        // vách bao cát đứng 4 hàng ôm lòng hố (chừa lối vào), 2 tường chặn đầu lối vào
        arcBags(f, r, RW + 0.8, ent + 0.62, ent + TAU - 0.62, 4, 0);
        for (const s of [-1, 1]) { const a = ent + s * 0.66; sandbags(SK, f + Math.cos(a) * (RW + 1), r + Math.sin(a) * (RW + 1), f + Math.cos(a) * (RW + 6.5), r + Math.sin(a) * (RW + 6.5), 4, Math.max(0, K.earth(f + Math.cos(a) * (RW + 2), r + Math.sin(a) * (RW + 2))) - 0.5); }
        // vài bao nằm trên đỉnh bờ (đè lưới / chặn bạt), 1 bao rách xẹp
        for (let k = 0; k < 5; k++) { const a = ent + 1.2 + k * 0.95, d = RW + 4 + hash(f + k) * 3; sandbags(SK, f + Math.cos(a) * d, r + Math.sin(a) * d, f + Math.cos(a + 0.1) * d, r + Math.sin(a + 0.1) * d, 1, want(f + Math.cos(a) * d, r + Math.sin(a) * d) - 0.6); }
        // 2 chỗ để hòm đạn dưới chân vách (2 bên sau súng), 1 hòm bật nắp, hòm rỗng vứt lệch
        for (const s of [-1, 1]) {
          const a = ent + s * 1.55, d = RW - 4.2, cf = f + Math.cos(a) * d, crr = r + Math.sin(a) * d, y = Math.max(0, K.earth(cf, crr)) + 0.45;
          aoDisc(cf, crr, 6.5);
          ammoCrate(cf, crr, y, a + Math.PI / 2, 6.4, 2.6, 3.4, false);
          ammoCrate(cf + Math.cos(a + 1.57) * 0.3, crr + Math.sin(a + 1.57) * 0.3, y + 2.8, a + Math.PI / 2 + 0.08, 6.4, 2.6, 3.4, s > 0, 0.4);
          ammoCrate(f + Math.cos(a + s * 1) * (RW - 3.8), r + Math.sin(a + s * 1) * (RW - 3.8), y, a + s * 1 + 1.2, 6.4, 2.6, 3.4, true);
        }
        // tấm bạt phủ dở đống hòm phía trái
        { const a = ent - 1.55, d = RW - 4.2; K.add(M.tarp, new THREE.BoxGeometry(8, 0.2, 5), M4(f + Math.cos(a) * d, Math.max(0, K.earth(f, r)) + 6.1, r + Math.sin(a) * d, 0.12, -a - Math.PI / 2, 0.05)); }
      };
      for (const [f, r, a] of L.pits) {
        const el = 0.3 + hash(f + r) * 0.5, az = a + Math.PI;
        zuPit(f, r, a);
        zu23(f, r, az, el);
        aoDisc(f, r, 13);
        // vỏ đạn: 2 đống dưới máng hất 2 bên súng + vương vãi khắp lòng hố
        for (const s of [-1, 1]) { const c = Math.cos(az), sn = Math.sin(az), lx = 0.5, lz = s * 2.4; casingHeap(f + c * lx - sn * lz, r + sn * lx + c * lz, 46, 3.4, 1.1, 0.16, 1.2); }
        casingHeap(f, r, 40, 17, 0, 0.16, 1.2);
      }

      // ===== S-60 =====
      const s60 = (f, r, az, el) => {
        const gy = Math.max(0, K.earth(f, r)) + 0.4;
        const b = M4(f, gy, r, 0, -az, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
        // khung dọc + càng kéo dựng, 2 càng ngang, 4 kích
        K.cbox(M.gunTanDark, 0, 4, 0, 30, 2.4, 4, 0.3, 0, b);
        K.beam(M.gunTanDark, [14, 4.4, 0], [21, 10.5, 0], 1.4, b);
        K.add('steelDark', new THREE.TorusGeometry(1.1, 0.3, 6, 12), at(21.6, 11.5, 0, 0, 0, 0.8));
        for (const s of [-1, 1]) {
          K.add(M.gunTanDark, plateGeo([[-1.6, 2], [1.6, 2], [1.1, 22], [-1.1, 22]], 2), at(0, 3.6, 0, Math.PI / 2 * s, 0, 0));
          jack(at(0, 0, s * 21.5), 3.2);
          jack(at(s * 15.5, 0, 0), 3.2);
        }
        // 2 trục 4 bánh nhấc khỏi đất, nhíp lá, chắn bùn
        for (const x of [-9, 9]) for (const s of [-1, 1]) {
          tyre(at(x, 6.2, s * 7.8, 0, 0, x * 0.03), 2.7, 1, 6);
          K.add('steelDark', new THREE.CylinderGeometry(0.5, 0.5, 5, 8), at(x, 6.2, s * 5.4, Math.PI / 2, 0, 0));
          for (let k = 0; k < 3; k++) K.add('steelDark', new THREE.BoxGeometry(6 - k * 1.6, 0.3, 1.2), at(x, 5 - k * 0.3, s * 5.6));
          K.add(M.gunTan, new THREE.CylinderGeometry(3.9, 3.9, 2.8, 12, 1, true, Math.PI - 0.9, 1.8), at(x, 6.2, s * 7.8, Math.PI / 2, 0, 0));
        }
        // sàn đứng (tấm sàn gân), mâm xoay
        K.cbox(M.gunTan, 0, 6.6, 0, 18, 0.6, 12, 0.2, 0, b);
        K.add('steelDark', new THREE.CylinderGeometry(5.4, 5.6, 1.4, 22), at(0, 7.6, 0));
        K.add('steelGray', new THREE.TorusGeometry(5.5, 0.25, 4, 26), at(0, 8.3, 0, Math.PI / 2, 0, 0));
        // má gối trục
        for (const s of [-1, 1]) {
          K.add(M.gunTan, plateGeo([[-6, 0], [6, 0], [3.4, 8.6], [-2.4, 8.6]], 0.8), at(0, 8.4, s * 3.6));
          K.add(M.gunTanDark, new THREE.CylinderGeometry(1.4, 1.5, 0.6, 14), at(0.8, 15, s * 4.1, Math.PI / 2, 0, 0));
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; K.add('steelDark', new THREE.CylinderGeometry(0.16, 0.16, 0.3, 6), at(0.8 + Math.cos(a) * 1.05, 15 + Math.sin(a) * 1.05, s * 4.5, Math.PI / 2, 0, 0)); }
        }
        // lá chắn thép (theo S-60 thật): tấm trước 2 nửa trái / phải chừa khe nòng + dải dưới khe; mép trên gập xiên ra sau;
        // 2 cánh hông gập chéo bắt bản lề; mặt thép móp nhẹ (vết đạn / va quệt), hàng đinh tán quanh mép, thép góc gia cường
        // sau lưng, ô ngắm có nắp trượt, giá đỡ chéo về mâm; số hiệu khẩu đội sơn trắng tróc
        {
          const X = 7.2, Y0 = 8.6, HL = 10.5, HT = 2.4, SLOT = 2.1, W = 10 - SLOT;
          const dentPanel = (zc, Wd, H, y0, tilt, seed) => {   // tấm thép đứng (dày 0.45, mặt trước +x) có vết móp + đinh tán mép
            const g = new THREE.BoxGeometry(0.45, H, Wd, 1, Math.max(2, Math.round(H / 1.2)), Math.max(2, Math.round(Wd / 1.2))), P = g.attributes.position;
            const dents = [0, 1, 2].map(k => [(hash(seed + k * 3) - 0.5) * Wd * 0.8, (hash(seed + k * 3 + 1) - 0.5) * H * 0.8, 0.6 + hash(seed + k * 3 + 2) * 1.2]);
            for (let i = 0; i < P.count; i++) {
              const y = P.getY(i), z = P.getZ(i); let d = 0;
              for (const [dz, dy, R] of dents) d -= 0.22 * Math.exp(-((z - dz) ** 2 + (y - dy) ** 2) / (R * R));
              const edge = Math.min(H / 2 - Math.abs(y), Wd / 2 - Math.abs(z));
              P.setX(i, P.getX(i) + d * Math.min(1, edge / 0.8) + 0.08 * Math.sin(z * 0.9 + seed) * Math.sin(y * 0.7));
            }
            g.computeVertexNormals();
            const base = mul(mul(at(X, y0, zc), M4(0, 0, 0, 0, 0, tilt)), M4(0, H / 2, 0));
            K.add(M.gunTan, g, base);
            const rv = (y, z) => K.add('steelDark', new THREE.CylinderGeometry(0.16, 0.18, 0.18, 6), mul(base, M4(0.27, y, z, 0, 0, Math.PI / 2)));
            for (let z = -Wd / 2 + 0.5; z <= Wd / 2 - 0.4; z += 1.5) { rv(H / 2 - 0.45, z); rv(-H / 2 + 0.45, z); }
            for (let y = -H / 2 + 1.9; y <= H / 2 - 1.4; y += 1.5) { rv(y, -Wd / 2 + 0.45); rv(y, Wd / 2 - 0.45); }
          };
          for (const s of [-1, 1]) {
            const zc = s * (SLOT + W / 2);
            dentPanel(zc, W, HL, Y0, 0, 41 + s * 7);
            dentPanel(zc, W - 0.3, HT, Y0 + HL - 0.15, 0.44, 57 + s * 5);
            K.add('steelDark', new THREE.CylinderGeometry(0.28, 0.28, W - 0.6, 6), at(X - 0.05, Y0 + HL - 0.1, zc, Math.PI / 2, 0, 0));
            for (const yy of [3.2, 7.6]) { K.add('steelDark', new THREE.BoxGeometry(0.9, 0.2, W - 0.8), at(X - 0.65, Y0 + yy, zc)); K.add('steelDark', new THREE.BoxGeometry(0.2, 0.9, W - 0.8), at(X - 0.3, Y0 + yy + 0.35, zc)); }
            // cánh hông: tấm chéo về sau, bản lề 3 lá, đinh tán mép dưới
            const wing = mul(at(X - 0.1, Y0, s * 10.1), M4(0, 0, 0, 0, s * 0.62, 0));
            K.add(M.gunTan, plateGeo([[0, 0], [-6.4, 0], [-6.4, 7.4], [-1.6, HL + 0.6], [0, HL + 0.6]], 0.45), wing);
            for (const yy of [1.8, 5.2, 8.8]) K.add('steelDark', new THREE.CylinderGeometry(0.32, 0.32, 1.4, 8), at(X - 0.15, Y0 + yy, s * 10.05));
            for (let x = -0.9; x > -6.2; x -= 1.4) K.add('steelDark', new THREE.CylinderGeometry(0.15, 0.17, 0.7, 6), mul(wing, M4(x, 0.5, 0, Math.PI / 2, 0, 0)));
            K.beam('steelDark', [X - 0.6, Y0 + 6, s * 6], [1, Y0 + 0.6, s * 3.6], 0.5, b);
          }
          dentPanel(0, SLOT * 2 + 0.2, 2.2, Y0, 0, 71);
          K.add('steelDark', new THREE.BoxGeometry(0.5, 0.5, SLOT * 2 + 0.4), at(X - 0.6, Y0 + HL + 0.6, 0));
          // ô ngắm phía pháo thủ ngắm (trái): khung, lòng tối, nắp trượt kéo hé
          K.add('steelDark', new THREE.BoxGeometry(0.6, 2.2, 2.8), at(X + 0.05, Y0 + 7.4, -6.2));
          K.add(M.black, new THREE.BoxGeometry(0.62, 1.4, 2), at(X + 0.08, Y0 + 7.4, -6.2));
          K.add(M.gunTanDark, new THREE.BoxGeometry(0.2, 1.8, 2.4), at(X + 0.4, Y0 + 7.9, -5.3));
          // số hiệu khẩu đội sơn trắng tróc (tấm phải)
          K.add(decalT('sam_s60no', texOf('sam_s60no', 128, 64, (q, w, h) => {
            q.clearRect(0, 0, w, h); q.fillStyle = 'rgba(230,226,212,0.85)'; q.font = 'bold 52px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('312', w / 2, h / 2 + 3);
            q.globalCompositeOperation = 'destination-out';
            for (let i = 0; i < 500; i++) { q.fillStyle = 'rgba(0,0,0,' + (0.4 + hash(i + 7800) * 0.6) + ')'; q.fillRect(hash(i + 7801) * w, hash(i + 7802) * h, 1 + hash(i + 7803) * 4, 1 + hash(i + 7804) * 3); }
          })), new THREE.PlaneGeometry(4.4, 2.2), at(X + 0.32, Y0 + 7.2, 6.2, 0, Math.PI / 2, 0));
        }
        // cụm nòng: thân nôi, khoá nòng, nòng dày phần gốc, nòng thon, loa hãm lỗ tổ ong, xi-lanh lùi / đẩy về
        const cr = mul(at(0.8, 15, 0), M4(0, 0, 0, 0, 0, el)), cat = (x, y, z, rx, ry, rz) => mul(cr, M4(x, y, z, rx, ry, rz));
        K.cbox(M.gunTan, 1, 0, 0, 15, 3.4, 4, 0.4, 0, cr);
        K.cbox('steelDark', -7.6, 0.3, 0, 3.6, 3.2, 3.2, 0.3, 0, cr);
        K.add('steelDark', new THREE.CylinderGeometry(0.85, 1, 10, 12), cat(13, 0.4, 0, 0, 0, -Math.PI / 2));
        K.add('steelDark', new THREE.CylinderGeometry(0.55, 0.68, 24, 12), cat(30, 0.4, 0, 0, 0, -Math.PI / 2));
        K.add('steelDark', new THREE.CylinderGeometry(1.05, 1.05, 3.4, 12), cat(43.4, 0.4, 0, 0, 0, -Math.PI / 2));
        for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; K.add('void', new THREE.CylinderGeometry(0.26, 0.26, 0.3, 6), cat(42.3 + row * 1.1, 0.4 + Math.cos(a) * 1.02, Math.sin(a) * 1.02, a, 0, 0)); }
        for (const s of [-1, 1]) K.add('steelGray', new THREE.CylinderGeometry(0.55, 0.55, 12, 10), cat(6, -1.6, s * 0.9, 0, 0, -Math.PI / 2));
        K.add(M.gunTanDark, new THREE.CylinderGeometry(0.7, 0.7, 10, 10), cat(5.5, 2.1, 0, 0, 0, -Math.PI / 2));
        // khay nạp + kẹp 4 viên đạn 57 mm nằm trên khoá nòng (vỏ đồng + đầu đạn sơn)
        K.add(M.gunTanDark, new THREE.BoxGeometry(9, 0.4, 3.6), cat(-4.2, 2.9, 0));
        for (const s of [-1, 1]) K.add('steelDark', new THREE.BoxGeometry(9, 1, 0.3), cat(-4.2, 3.5, s * 1.8));
        for (let k = 0; k < 4; k++) {
          const z = (k - 1.5) * 0.85;
          K.add(M.brass, new THREE.CylinderGeometry(0.4, 0.44, 4, 10), cat(-6, 3.5, z, 0, 0, -Math.PI / 2));
          K.add(M.oliveSunDark, new THREE.CylinderGeometry(0.3, 0.38, 1.6, 10), cat(-3.2, 3.5, z, 0, 0, -Math.PI / 2));
          K.add(M.oliveSunDark, new THREE.ConeGeometry(0.3, 1.1, 10), cat(-1.85, 3.5, z, 0, 0, -Math.PI / 2));
        }
        K.add('steelDark', new THREE.BoxGeometry(0.3, 1.2, 3.8), cat(-8.2, 3.6, 0));
        // 2 ghế + tay quay, kính ngắm bên trái
        for (const s of [-1, 1]) {
          K.beam(M.gunTanDark, [-2, 9, s * 3.8], [-6, 10, s * 6.8], 0.8, b);
          seat(at(-6.4, 9.2, s * 7, 0, 0, 0));
          handwheel(at(-3.4, 13.6, s * 6.6), 1.1);
        }
        K.cbox(M.gunTanDark, -2.2, 17.4, -6.2, 3, 2.6, 1.8, 0.2, 0, b);
        K.add('steelDark', new THREE.CylinderGeometry(0.5, 0.5, 3, 8), at(0.4, 17.8, -6.2, 0, 0, -Math.PI / 2));
        K.add(M.black, new THREE.CylinderGeometry(0.45, 0.55, 1, 8), at(-4.2, 17.6, -6.2, 0, 0, -Math.PI / 2));
        K.add('glass', new THREE.CircleGeometry(0.45, 8), at(1.95, 17.8, -6.2, 0, Math.PI / 2, 0));
        K.solid(f, r, 22, 22, 2.2, 22, az);
      };
      // ụ S-60: lòng ụ nền đất nện, tường bao cát 4 hàng có đất đắp thoải sát lưng bên ngoài, lối vào phía sau, hòm đạn,
      // kẹp đạn, vỏ đạn 57 mm
      const s60Pit = (f, r, az, el) => {
        const ent = az + Math.PI, RW = 29, gapA = 0.5;
        const ga = (th) => smooth(gapA - 0.05, gapA + 0.4, Math.abs(Math.atan2(Math.sin(th - ent), Math.cos(th - ent))));
        const want = (pf, pr) => {
          const df = pf - f, dr = pr - r, d = Math.hypot(df, dr), th = Math.atan2(dr, df);
          if (d < RW + 2.4) return 0;
          return (7.6 * (1 - smooth(RW + 3.5, RW + 14, d)) + 0.3 * Math.sin(th * 9 + f)) * ga(th);
        };
        const NA = 128, R0 = RW + 2.2, R1 = RW + 15, NR = Math.ceil((R1 - R0) / 1.5) + 1;
        skin((pf, pr) => want(pf, pr), NA + 1, NR, (i, j) => { const a = i / NA * TAU, d = R0 + (R1 - R0) * j / (NR - 1); return [f + Math.cos(a) * d, r + Math.sin(a) * d]; },
          (pf, pr) => want(pf, pr) > K.earth(pf, pr) - 0.4, 0.15);
        pitFloor(f, r, RW + 1);
        aoRing(f, r, RW - 4.5, RW + 0.2);
        arcBags(f, r, RW + 1, ent + gapA + 0.04, ent + TAU - gapA - 0.04, 4, 0);
        // va chạm tường ụ (9 đoạn)
        for (let k = 0; k < 9; k++) {
          const a0 = ent + gapA + (TAU - 2 * gapA) * k / 9, a1 = ent + gapA + (TAU - 2 * gapA) * (k + 1) / 9, am = (a0 + a1) / 2, R = RW + 2.3;
          K.solid(f + Math.cos(am) * R, r + Math.sin(am) * R, R * (a1 - a0) / 2 + 1, 3.2, 2.2, 8, am + Math.PI / 2);   // y0 > 2: không sinh dải đất bẩn quanh chân
        }
        s60Gear(f, r, az, el, ent, RW);
      };
      const s60Gear = (f, r, az, el, ent, RW) => {
        s60(f, r, az, el);
        aoDisc(f, r, 17);
        // hòm đạn kẹp (dài) xếp sát tường 2 bên lối vào, 1 hòm mở; kẹp đạn rời; vỏ đạn 57 mm vương vãi + đống dưới khoá nòng
        for (const s of [-1, 1]) {
          const a = ent + s * 1.0, d = RW - 4.5, cf = f + Math.cos(a) * d, crr = r + Math.sin(a) * d, y = Math.max(0, K.earth(cf, crr)) + 0.45;
          aoDisc(cf, crr, 8);
          ammoCrate(cf, crr, y, a + Math.PI / 2, 9.6, 3, 4.4, false);
          ammoCrate(cf, crr, y + 3.2, a + Math.PI / 2 - 0.05, 9.6, 3, 4.4, s < 0, 0.44);
        }
        const c = Math.cos(az), sn = Math.sin(az);
        casingHeap(f - c * 9, r - sn * 9, 34, 5, 1.4, 0.42, 3.4);
        casingHeap(f, r, 26, RW - 6, 0, 0.42, 3.4);
      };
      s60Pit(iF - 53, 172, 0.55, 0.55); s60Pit(iF - 53, -172, -0.55, 0.62);
      // hào giao thông kè bao cát: tuyến chặn trước (giữa cổng và 2 bệ phóng trước), hào nối hố pháo sau
      for (const s of [-1, 1]) {
        trench([[112, s * 30], [128, s * 58], [114, s * 86], [132, s * 114], [120, s * 138]]);
        trench([[-186, s * 150], [-168, s * 128], [-150, s * 140], [-132, s * 122]]);
      }

      // =====================================================================================================
      // DOANH TRẠI: 2 dãy nhà 1 tầng tường vữa bạc nắng, mái bằng có tường chắn mái, hiên che nắng tôn trên cột thép,
      // cửa sổ có song sắt, điều hoà, bồn nước đen trên mái, số nhà sơn; cát dạt chân tường; tháp nước, cột cờ, nhà vệ sinh
      // =====================================================================================================
      const barrack = (f, r, len, wid, num) => {
        const base = M4(f, 0, r);
        K.cbox('concDark', f, 1.2, r, len + 2, 2.4, wid + 2, 0.4);
        K.cbox(M.plaster, f, 15.4, r, len, 26, wid, 0.6);
        K.cbox('concDark', f, 29.4, r, len + 3, 2, wid + 3, 0.4);
        for (const s of [-1, 1]) { K.cbox(M.plaster, f, 31.6, r + s * (wid / 2 + 0.8), len + 3, 2.6, 1.4, 0.3); K.cbox(M.plaster, f + s * (len / 2 + 0.8), 31.6, r, 1.4, 2.6, wid + 3, 0.3); }
        const front = mul(base, M4(0, 0, -wid / 2, 0, Math.PI, 0)), back = mul(base, M4(0, 0, wid / 2, 0, 0, 0));
        for (let x = -len / 2 + 12; x <= len / 2 - 12; x += 16) {
          const door = Math.round((x + len / 2 - 12) / 16) % 3 === 2;
          if (door) {
            K.add(M.door, new THREE.BoxGeometry(8, 16, 0.6), mul(front, M4(x, 10.4, 0.3)));
            K.cbox('concDark', f - x, 1.4, r - wid / 2 - 4, 10, 1, 6, 0.2);
          } else {
            win(front, x, 15, 8, 8);
            for (let k = -3; k <= 3; k++) K.add('steelDark', new THREE.BoxGeometry(0.3, 8, 0.3), mul(front, M4(x + k * 1.1, 15, 0.7)));
          }
          win(back, x, 17, 7, 6);
          if (hash(x + f) < 0.4) acUnit(back, x + 6.2, 9);
        }
        // hiên che nắng mặt trước
        K.add('corrTan', boxGeo2(len - 6, 0.6, 14), M4(f, 22.4, r - wid / 2 - 7, -0.06, 0, 0));
        for (let x = -len / 2 + 4; x <= len / 2 - 4; x += 20) K.cyl('steelGray', f + x, 2.4, r - wid / 2 - 13, 0.6, 0.6, 20, 6);
        K.add('steelGray', new THREE.BoxGeometry(len - 6, 0.8, 0.8), M4(f, 22, r - wid / 2 - 13));
        K.cbox('concDark', f, 2.6, r - wid / 2 - 7, len - 4, 0.8, 14, 0.2);
        // mái: bồn nước đen, ăng-ten, ống thoát nước mái
        K.cyl(M.black, f - len / 4, 30.4, r + 6, 5, 5, 8, 14); K.cbox('steelGray', f - len / 4, 30.8, r + 6, 12, 0.8, 12, 0.2);
        K.cyl('steelGray', f + len / 3, 30.4, r, 0.2, 0.3, 18, 5); K.add('steelGray', new THREE.BoxGeometry(10, 0.3, 0.3), M4(f + len / 3, 46, r, 0, 0.5, 0));
        for (const x of [-len / 2 + 6, len / 2 - 6]) K.add('steelGray', new THREE.BoxGeometry(1, 1, 4), M4(f + x, 30.6, r + wid / 2 + 2));
        K.add(decal('sam_bn' + num, texOf('sam_bn' + num, 128, 128, (q, w, h) => { q.fillStyle = '#d4c39f'; q.fillRect(0, 0, w, h); q.fillStyle = 'rgba(40,40,36,0.85)'; q.font = 'bold 92px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(String(num), w / 2, h / 2 + 6); speckle(q, w, h, 500, ['#b8a684', '#efe4cc'], 1, 2, num * 7); })), new THREE.PlaneGeometry(9, 9), M4(f + len / 2 + 0.05, 20, r, 0, Math.PI / 2, 0));
        K.solid(f, r, len / 2 + 1.5, wid / 2 + 1.5, 0, 33);
        K.solid(f, r - wid / 2 - 7, len / 2 - 3, 7, 18, 23);
        drift(f + len / 2 + 3, r, 30, 12, 4, Math.PI / 2); drift(f - len / 4, r + wid / 2 + 3, 44, 10, 3.6, 0); drift(f + len / 5, r + wid / 2 + 3, 30, 9, 3, 0);
      };
      const boxGeo2 = (sx, sy, sz) => api.boxGeo(sx, sy, sz, 24);
      barrack(125, 350, 128, 44, 1); barrack(125, 424, 128, 40, 2);
      signPost('sam_bar', ['BARRACKS — КАЗАРМА', 'ЛИЧНЫЙ СОСТАВ ДИВИЗИОНА'], { w: 768, h: 192, bg: '#e6dcc4', fg: '#1d2a3a' }, 196, 312, 0, 22, 6);
      // tháp nước thép 4 chân
      {
        const f = 40, r = 436, H = 66;
        for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { K.cbox('concDark', f + a * 9, 1, r + b * 9, 4, 2, 4, 0.3); K.beam(M.tanSteel, [f + a * 9, 2, r + b * 9], [f + a * 6, H, r + b * 6], 1.2); }
        for (let y = 14; y < H; y += 16) { const w = 9 - (y / H) * 3; for (const [p0, p1] of [[[-w, -w], [w, -w]], [[w, -w], [w, w]], [[w, w], [-w, w]], [[-w, w], [-w, -w]]]) { K.beam(M.tanSteel, [f + p0[0], y, r + p0[1]], [f + p1[0], y, r + p1[1]], 0.6); K.beam(M.tanSteel, [f + p0[0], y, r + p0[1]], [f + p1[0], y + 16, r + p1[1]], 0.35); } }
        K.cbox(M.tanSteel, f, H + 1, r, 18, 2, 18, 0.3);
        K.cyl(M.tanSteel, f, H + 2, r, 11, 11, 18, 18); K.add(M.tanDark, new THREE.ConeGeometry(11.6, 5, 18), M4(f, H + 22.5, r));
        K.cyl('steelGray', f + 3, 0, r, 1, 1, H + 2, 8);
        for (let y = 2; y < H + 18; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 3), M4(f - 11.8, y, r));
        for (const s of [-1, 1]) K.add('steelGray', new THREE.BoxGeometry(0.35, H + 18, 0.35), M4(f - 11.8, (H + 18) / 2, r + s * 1.5));   // 2 thanh dọc thang
        K.solid(f, r, 12, 12, 0, H + 26);
      }
      // cột cờ (cờ rách bạc màu phần phật theo gió)
      {
        const f = 200, r = 336;
        K.cbox('concDark', f, 1, r, 6, 2, 6, 0.4); K.cyl('steelGray', f, 2, r, 0.5, 0.8, 76, 8);
        const W = 14, H = 8.5;
        const fg = new THREE.PlaneGeometry(W, H, 28, 14);
        fg.translate(W / 2, 0, 0); // Đặt gốc x=0 ngay tại cột cờ
        // Mép cờ tưa rách tự nhiên ở phần đuôi vạt cờ
        const ps = fg.attributes.position;
        for (let i = 0; i < ps.count; i++) {
          const x = ps.getX(i);
          if (x > W * 0.72 && hash(i * 17 + 5) < 0.45) {
            ps.setX(i, x - (x - W * 0.72) * 0.45 * hash(i * 31 + 7));
          }
        }
        fg.computeVertexNormals();
        const flagMat = MAT.sam_flag || (MAT.sam_flag = new THREE.MeshStandardMaterial({
          side: THREE.DoubleSide,
          roughness: 0.92,
          map: texOf('sam_flag_v2', 256, 160, (q, w, h) => {
            // Vải bạt quân sự ngả rêu bạc màu
            q.fillStyle = '#555d44'; q.fillRect(0, 0, w, h);
            // Thớ vải dệt li ti đan chéo
            for (let x = 0; x < w; x += 2) {
              q.fillStyle = (x % 4 === 0) ? 'rgba(35, 40, 28, 0.15)' : 'rgba(230, 225, 200, 0.08)';
              q.fillRect(x, 0, 1, h);
            }
            for (let y = 0; y < h; y += 2) {
              q.fillStyle = (y % 4 === 0) ? 'rgba(35, 40, 28, 0.12)' : 'rgba(230, 225, 200, 0.06)';
              q.fillRect(0, y, w, 1);
            }
            // Vòng tròn vàng quân hiệu
            const cx = w * 0.36, cy = h * 0.5;
            q.fillStyle = '#caa540';
            q.beginPath(); q.arc(cx, cy, 36, 0, TAU); q.fill();
            // Ngôi sao 5 cánh bên trong
            q.fillStyle = '#555d44';
            q.beginPath();
            for (let k = 0; k < 10; k++) {
              const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 10 : 26;
              k ? q.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : q.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            q.fill();
            // Viền may gân mép cờ
            q.strokeStyle = 'rgba(40, 45, 30, 0.5)'; q.lineWidth = 3;
            q.strokeRect(3, 3, w - 6, h - 6);
            // Mép trái sát cột có nẹp vải dày + 2 khuyên đồng
            q.fillStyle = '#424a35'; q.fillRect(0, 0, 10, h);
            q.fillStyle = '#c2a048';
            q.beginPath(); q.arc(5, 14, 4, 0, TAU); q.arc(5, h - 14, 4, 0, TAU); q.fill();
            q.fillStyle = '#222';
            q.beginPath(); q.arc(5, 14, 2, 0, TAU); q.arc(5, h - 14, 2, 0, TAU); q.fill();
            // Vết bạc màu nắng sa mạc & bụi bám
            q.fillStyle = 'rgba(236, 228, 206, 0.28)'; q.fillRect(0, 0, w, h);
            speckle(q, w, h, 600, ['#7a6a52', '#3d382e', '#ede2c8'], 1, 2.5, 9);
          })
        }));
        const flagMesh = new THREE.Mesh(fg, flagMat);
        flagMesh.position.set(f, 70, r);
        flagMesh.rotation.y = 0.45;
        flagMesh.castShadow = true;
        group.add(flagMesh);
        if (anim && anim.flags) anim.flags.push({ mesh: flagMesh, base0: fg.attributes.position.array.slice(), w: W, h: H, t: hash(f + r) * 10 });
        K.solid(f, r, 3, 3, 0, 78);
      }
      // nhà vệ sinh / kho nhỏ tôn
      K.cbox('corrTan', -76, 10, 438, 16, 18, 12, 0.3); K.cbox('steelGray', -76, 19.6, 438, 18, 1, 14, 0.2); K.add(M.door, new THREE.BoxGeometry(0.4, 14, 6), M4(-67.8, 8, 438)); K.solid(-76, 438, 9, 7, 0, 21);

      // =====================================================================================================
      // BÃI XE: 2 ụ chữ U che xe dưới lưới nguỵ trang (xe kung + xe trinh sát bỏ lại), cát lấp nửa bánh
      // =====================================================================================================
      {
        const [R1, R2] = [L.revs[3], L.revs[4]];
        milTruck(TT, M4(R1.f, 0, R1.r + 4, 0, -R1.a, 0), 'kung');
        K.solid(R1.f, R1.r + 4, 34, 11, 0, 32, R1.a);
        for (const R of [R1, R2]) { net(M4(R.f, 0, R.r, 0, -R.a, 0), 80, 40, 34, 5); drift(R.f + 4, R.r + Math.sin(R.a) * 6, 12, 8, 2.6, R.a, 0); }
        anim.vehicles.push({ type: 'SCOUT', f: R2.f, r: R2.r - 4, a: R2.a, ty: 0.4, hf: 20, hr: 11 });
      }
      anim.vehicles.push({ type: 'SCOUT', f: 150, r: -27, a: Math.PI + 0.22, ty: -0.5, hf: 20, hr: 11 });

      // cát dạt chân tường cổng kiểm soát / tường rọ đá
      for (const s of [-1, 1]) { drift(iF - 70, s * 64, 40, 10, 3.4, 0); drift(iF - 20, s * 64, 30, 8, 2.8, 0); }
      delete K.add;   // trả lại K.add gốc (prototype) sau khi dựng xong
    }
  };
})();
