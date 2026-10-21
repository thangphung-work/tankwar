/**
 * 2. HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC (BSL-4) — BỎ HOANG
 * Theo các cơ sở thật (phòng thí nghiệm sinh học quân sự ngầm, khu Biopreparat): phòng thí nghiệm BSL-4 nằm dưới gò đất
 * đắp phủ (MapGen: L.mound), cửa hầm chống nổ trong sân khoét vào gò; trên nóc gò: hộp lọc khí thải HEPA, giếng thông
 * gió, ống khói xả, cửa thoát hiểm; quanh gò: nhà kiểm soát ra vào + khử nhiễm, hệ tiệt trùng nước thải (3 bồn "kill
 * tank"), bồn nitơ lỏng + giàn hoá hơi, lò đốt chất thải y sinh có ống khói cao, trạm phát điện, tháp nước, cụm
 * máy làm lạnh. Canh phòng cấp căn cứ chiến lược như bãi phóng (bộ dùng chung).
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / ụ đất: MapGen (map_gen.js).
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  KINDS.bio = {
    name: 'HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC', icon: '☣', color: '#ff8a5c',
    // hầm sinh học: cổng -> sân cửa hầm, trục ngang trước, 2 đường dịch vụ 2 bên gò
    site: {
      roads: [[[[300, 0], [40, 0]], 36], [[[150, -340], [150, 340]], 26], [[[150, 280], [-190, 280]], 22], [[[150, -280], [-120, -280]], 22]],
      junctions: [[150, 0, 26, 36], [150, 280, 26, 22], [150, -280, 26, 22]],
      gravel: (hu) => [[hu - 150, -70, hu, 70], [32, -80, 72, 80], [70, -200, 140, -100], [62, 108, 138, 212], [184, 112, 220, 188], [-180, 300, -100, 385],
        [-65, 305, 25, 355], [30, 300, 62, 365], [-95, -355, -45, -305], [2, -358, 78, -302]],
      slabs: [], noGrow: []
    },
    build(K, group, anim, api) {
      // eslint-disable-next-line no-unused-vars
      const { TAU, hash, TEX, canvas, texOf, speckle, blotch, ageCanvas, concreteFill, concPair, concTex, grimePair, ribPair, hescoTex, hazardTex, bandTex, biohazard, trefoil, warnSign, signTex, icbmTex, detailTex, ABANDONED, SITES, siteOf, asphaltTex, roadStripGeo, roadNet, apronTex, MAT, mat, decal, decalT, doorMats, v3, M4, boxGeo, mergeGeos, defTile, Kit, apron, meshFenceMat, fence, sandbags, drum, camoMat, camoNet, warnPlate, loftGeo, plateGeo, heliSkin, heli, secKit, perimeter, officeBlock, stack, vTank, missile125, milTruck, aaGun } = api;
      const SITE = KINDS.bio.site;
      const L = K.L, M = L.mound, F0 = M.face - 14, F1 = M.face + 22, CUT = M.cut;   // tường mặt tiền f: -4..32
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'bio');
      roadNet(group, SITE.roads, SITE.junctions, { bars: [[F1 + 26, 0, 2.4, 32]], words: [['STOP', F1 + 32, 0, Math.PI / 2, 16]] });
      const kit = secKit(K, anim), { iF, iR, G, mul, booth, tower, pillbox, hesco } = kit;
      perimeter(K, kit);
      // ---- MẶT TIỀN CỬA HẦM: 2 trụ + lanh tô (cửa 15 x 7.5 m), gờ đỉnh, khung cửa sọc cảnh báo, 2 cánh cửa chống nổ
      //      trượt (hé), ray, biển tên, biểu tượng nguy hiểm sinh học, camera giám sát, đèn
      const DW = 60, DH = 60, TOPY = 92, FW = CUT + 16;
      for (const s of [-1, 1]) K.box('conc', (F0 + F1) / 2, (TOPY - 6) / 2, s * (DW + FW) / 2, F1 - F0, TOPY + 6, FW - DW);
      K.box('conc', (F0 + F1) / 2, (DH + TOPY) / 2, 0, F1 - F0, TOPY - DH, DW * 2);
      K.box('concDark', (F0 + F1) / 2 + 2, TOPY + 2, 0, F1 - F0 + 6, 4, FW * 2 + 6);
      for (const s of [-1, 1]) { K.box('concDark', F1 + 3, (DH + 6) / 2, s * (DW + 3), 6, DH + 6, 6); K.box('hazard', F1 + 6.2, DH / 2, s * (DW + 3), 0.4, DH, 6); }
      K.box('concDark', F1 + 3, DH + 3, 0, 6, 6, DW * 2 + 12);
      const [dA, dB] = doorMats();
      K.box('void', F0 - 4, DH / 2, 0, 40, DH, DW * 2);
      // mái bê tông lòng hầm sau mặt tiền (che rãnh khoét gò phía sau tường), bằng cốt mặt gò
      K.cbox('concDark', F0 - 12, (DH + M.h) / 2, 0, 26, M.h - DH, CUT * 2 + 10, 0.6);
      K.add(dB, boxGeo(8, DH, DW - 4, 0), M4(F1 - 14, DH / 2, -(DW + 4) / 2 - 8));
      K.add(dA, boxGeo(8, DH, DW - 4, 0), M4(F1 - 14, DH / 2, (DW + 4) / 2 + 8));
      K.box('steelDark', F1 - 9, 2, 0, 3, 4, DW * 2 + 20);
      K.plane(decal('bio_sign', signTex('bio_sign', ['MILITARY BIOLOGICAL RESEARCH FACILITY', 'BIOHAZARD — BSL-4 — AUTHORIZED PERSONNEL ONLY'], { icon: 'bio' })), F1 + 0.4, 78, 0, 116, 21);
      for (const s of [-1, 1]) {
        K.plane(decal('bio_icon', texOf('bio_icon', 128, 128, (g, w, h) => warnSign(g, 0, 0, w, h, 'bio'))), F1 + 0.4, 38, s * (DW + 30), 26, 26);
        K.box('lampAmber', F1 + 2, 70, s * (DW + 14), 4, 5, 6);
        K.box('steelGray', F1 + 3, 84, s * (FW - 6), 5, 4, 4); K.box('glass', F1 + 6, 84, s * (FW - 6), 1, 2.5, 2.5);
      }
      K.solid((F0 + F1) / 2, 0, (F1 - F0) / 2 + 6, FW, -6, TOPY + 4);
      if (ABANDONED) {
        // dây leo rủ từ gờ đỉnh mặt tiền, rêu bám; đống đổ nát trước cửa: bê tông vụn, tấm biển rơi, đèn vỡ, phuy lăn
        for (let r = -FW + 6; r < FW - 4; r += 9 + hash(r) * 10) {
          const hh = 14 + hash(r + 3) * 34, ww = 8 + hash(r + 5) * 8;
          K.add('vine', new THREE.PlaneGeometry(ww, hh), M4(F1 + 3.6 + hash(r + 7) * 0.6, TOPY + 2 - hh / 2, r, 0, Math.PI / 2, 0));
        }
        for (let k = 0; k < 14; k++) { const sz = 1 + hash(k + 8600) * 3.2; K.add('concDark', new THREE.IcosahedronGeometry(sz, 0), M4(F1 + 6 + hash(k + 8601) * 12, sz * 0.35, -DW + 6 + hash(k + 8602) * 34, hash(k) * 3, hash(k + 1) * 3, 0, 1, 0.6, 1)); }
        K.add('steelDark', new THREE.BoxGeometry(1.4, 0.6, 22), M4(F1 + 10, 0.8, 44, 0, 0.3, 1.45));
        K.add(decal('bio_sign_fallen', signTex('bio_sign_fallen', ['RESTRICTED', 'BSL-4 ZONE'], { w: 512, h: 192, icon: 'bio' })), new THREE.PlaneGeometry(14, 5.2), M4(F1 + 14, 0.5, -20, -Math.PI / 2 + 0.12, 0, 0.6));
        K.add('drumRust', new THREE.CylinderGeometry(1.9, 1.9, 5.6, 14), M4(F1 + 20, 1.9, 30, Math.PI / 2, 0.7, 0));
      }
      // tường chắn đất 2 bên sân: đỉnh bám mặt gò thật
      const WF1 = M.fc + M.af + 12;
      for (const s of [-1, 1]) {
        const sh = new THREE.Shape(), pts = [];
        for (let f = F0; f <= WF1; f += 4) pts.push([f, Math.max(5, Math.max(K.earth(f, s * (CUT + 14)), K.earth(f, s * (CUT + 22))) + 3)]);
        sh.moveTo(F0, -6); sh.lineTo(WF1, -6);
        for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 20, bevelEnabled: false });
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64);
        K.add('conc', g, M4(0, 0, s > 0 ? CUT - 8 : -CUT - 12));
        K.solid((F0 + WF1) / 2, s * (CUT + 2), (WF1 - F0) / 2, 10, -6, pts.reduce((a, p) => Math.max(a, p[1]), 0));
      }
      // sân trước cửa hầm: container khử nhiễm + buồng tắm khử độc (vàng), chốt gác cửa hầm, rào chắn chữ A, thùng phuy
      {
        const f = F1 + 18;
        K.cbox('steelWhite', f, 11, -52, 18, 21, 46, 0.6); K.box('yellow', f, 21.8, -52, 18.4, 1.6, 46); K.box('yellow', f, 1, -52, 18.4, 2, 46.4);
        K.plane(decal('decon', signTex('decon', ['DECONTAMINATION', 'MANDATORY DECON BEFORE EXIT'], { w: 1024, h: 160, icon: 'bio' })), f + 9.2, 13, -52, 40, 6.5);
        K.solid(f, -52, 10, 24, 0, 23);
        booth(f, 50, Math.PI / 2, 14, 12);
        for (const r of [-24, 24]) { K.box('hazard', f + 12, 5, r, 2, 3, 10, 0, 16); for (const z of [-4, 4]) K.beam('steelGray', [f + 12, 6.5, r + z], [f + 14, 0, r + z], 0.4); }
        for (let i = 0; i < 6; i++) drum(K, f - 4 + (i % 3) * 5.4, 70 - Math.floor(i / 3) * 5.6, i === 4 ? 'drumBlue' : 'yellow', 0);
      }
      // ---- NÓC GÒ: hộp lọc khí thải HEPA 2 tầng + quạt hút, 3 giếng thông gió có chụp, ống khói xả, cửa thoát hiểm, ăng-ten
      for (const [f, r] of [[-30, -90], [-30, 90], [-150, -70]]) {
        const y = K.earth(f, r) - 3;
        K.cyl('concDark', f, y, r, 11, 12, 8, 16); K.cyl('steelGray', f, y + 8, r, 7, 7, 26, 14);
        K.cyl('steelDark', f, y + 34, r, 7.6, 7.6, 5, 14); K.cyl('steelGray', f, y + 39, r, 9, 15, 7, 16);
        K.solid(f, r, 12, 12, y, y + 46);
      }
      {
        const f = -100, r = 30, y = K.earth(f, r) - 2;
        K.cbox('concDark', f, y + 2, r, 64, 4, 44, 0.6);
        for (const k of [0, 1]) { K.cbox('steelGray', f, y + 4 + 9 + k * 18, r, 56, 17, 36, 0.6); for (let i = 0; i < 6; i++) K.box('louver', f + 28.4, y + 7 + k * 18 + i * 2.2, r, 0.6, 1.6, 30); }
        K.box('hazard', f, y + 40.6, r, 56, 1.2, 36, 0, 16);
        for (const z of [-10, 10]) { K.cyl('steelDark', f - 12, y + 41, r + z, 5, 5, 6, 14); K.add('void', new THREE.CircleGeometry(4.4, 14), M4(f - 12, y + 47.1, r + z, -Math.PI / 2, 0, 0)); }
        K.add('steelGray', new THREE.CylinderGeometry(4, 4, 60, 12), M4(f + 32, y + 20, r - 26, Math.PI / 2, 0, 0.5));
        K.plane(decal('hepa', signTex('hepa', ['HEPA EXHAUST — DO NOT OPEN', 'BIOLOGICAL CONTAINMENT FILTERS'], { w: 768, h: 160, icon: 'bio' })), f + 28.8, y + 26, r, 30, 6);
        K.solid(f, r, 32, 22, y, y + 42);
        const sf = -170, sr = 100, sy = K.earth(sf, sr) - 3;
        stack(K, sf, sr, 8, 5.4, 150 + sy, 'concDark');
        const hf = -150, hr = -120, hy = K.earth(hf, hr) - 1;
        K.cbox('conc', hf, hy + 3, hr, 18, 6, 18, 0.5); K.cbox('steelDark', hf, hy + 6.4, hr, 10, 1, 10, 0.3);
        K.box('yellow', hf + 4, hy + 7.2, hr, 1, 0.6, 6); K.solid(hf, hr, 9, 9, hy, hy + 8);
        const af = -60, ar = -130, ay = K.earth(af, ar) - 2;
        K.cyl('steelGray', af, ay, ar, 1.2, 1.6, 44, 8);
        K.add('steelWhite', new THREE.SphereGeometry(16, 18, 8, 0, TAU, 0, Math.PI * 0.3), M4(af + 4, ay + 46, ar, 0, 0, -0.9));
        K.solid(af, ar, 4, 4, ay, ay + 50);
      }
      // ---- NHÀ KIỂM SOÁT RA VÀO + KHỬ NHIỄM NHÂN VIÊN (2 tầng) cạnh cửa hầm
      officeBlock(K, kit, 104, -150, 0, 56, 84, 2, ['ACCESS CONTROL', 'PERSONNEL DECONTAMINATION — CHANGE ROOMS']);
      // ---- HỆ TIỆT TRÙNG NƯỚC THẢI (EDS): 3 bồn "kill tank" inox trong gờ chống tràn, nhà bơm, ống nối, biển cảnh báo
      {
        const f = 100, r = 160;
        K.cbox('concDark', f, 0.8, r, 66, 1.6, 96, 0.4);
        for (const s2 of [-1, 1]) { K.cbox('concDark', f, 3, r + s2 * 47, 66, 4.4, 2, 0.3); K.cbox('concDark', f + s2 * 32, 3, r, 2, 4.4, 96, 0.3); }
        for (const z of [-30, 0, 30]) vTank(K, f - 10, r + z, 11, 40, z * 0.1);
        K.cbox('steelWhite', f + 22, 9, r, 18, 18, 40, 0.5); K.cbox('steelGray', f + 22, 18.8, r, 20, 1.6, 42, 0.3);
        K.box('steelGray', f + 31.2, 7.5, r + 8, 0.6, 13, 6);
        for (const z of [-30, 0, 30]) { K.add('steelGray', new THREE.CylinderGeometry(1, 1, 22, 8), M4(f + 6, 30, r + z, 0, 0, Math.PI / 2)); K.add('steelGray', new THREE.CylinderGeometry(1, 1, 12, 8), M4(f + 17, 24, r + z)); }
        K.add('steelGray', new THREE.CylinderGeometry(1.2, 1.2, 80, 8), M4(f + 6, 4, r, Math.PI / 2, 0, 0));
        K.plane(decal('eds', signTex('eds', ['EFFLUENT DECONTAMINATION SYSTEM', 'BIOHAZARD — LIVE CULTURE WASTE'], { w: 1024, h: 160, icon: 'bio' })), f + 33.1, 9, r - 14, 22, 3.8);
        K.solid(f + 22, r, 10, 21, 0, 20);
      }
      // ---- BỒN NITƠ LỎNG đứng (bảo quản mẫu -196°C) + 2 giàn hoá hơi cánh tản nhiệt, rào riêng
      {
        const f = 202, r = 150;
        K.cyl('concDark', f, 0, r, 12, 12, 2, 20); K.cyl('steelWhite', f, 2, r, 8, 8, 62, 20);
        K.add('steelWhite', new THREE.SphereGeometry(8, 20, 8, 0, TAU, 0, Math.PI / 2), M4(f, 64, r));
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; K.beam('steelGray', [f + Math.cos(a) * 11, 0, r + Math.sin(a) * 11], [f + Math.cos(a) * 7.6, 14, r + Math.sin(a) * 7.6], 1); }
        K.plane(decal('ln2', signTex('ln2', ['LIQUID NITROGEN', 'CRYOGENIC — ASPHYXIANT'], { w: 512, h: 192, bg: '#efece2', fg: '#1d4f9a' })), f + 8.2, 30, r, 10, 4);
        for (const z of [-22, 22]) { for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) { K.box('steelWhite', f - 4 + j * 4, 16, r + z + (i - 4) * 1.6, 0.4, 30, 1.4); } K.box('steelGray', f, 31.5, r + z, 14, 1, 16); }
        K.add('steelGray', new THREE.CylinderGeometry(0.8, 0.8, 44, 8), M4(f - 4, 4, r, Math.PI / 2, 0, 0));
        fence(K, f - 16, r - 34, f + 16, r - 34, -1, 12); fence(K, f - 16, r + 34, f + 16, r + 34, 1, 12); fence(K, f + 16, r - 34, f + 16, r + 34, 1, 12); fence(K, f - 16, r - 34, f - 16, r - 10, -1, 12);
        K.solid(f, r, 14, 32, 0, 66);
      }
      // ---- LÒ ĐỐT CHẤT THẢI Y SINH: nhà lò, cửa nạp, ống khói 31 m (thang lồng, 2 sàn), bồn dầu đốt
      {
        const f = -150, r = 330;
        K.cbox('conc', f, 17, r, 50, 34, 46, 1.2);
        K.box('shutter', f + 25.3, 11, r - 8, 0.6, 20, 16); K.cbox('steelGray', f + 26.6, 22, r - 8, 2.4, 2.4, 18, 0.3);
        for (const z of [-15, 10]) K.box('louver', f + 25.3, 26, r + z, 0.6, 6, 10);
        K.add('steelGray', new THREE.CylinderGeometry(2.4, 2.4, 20, 12), M4(f, 38, r + 14, Math.PI / 2, 0, 0));
        stack(K, f, r + 44, 6, 4, 250, 'conc');
        K.plane(decal('incin', signTex('incin', ['MEDICAL WASTE INCINERATOR', 'BIOHAZARD — AUTHORIZED STAFF ONLY'], { w: 1024, h: 160, icon: 'bio' })), f + 25.4, 30, r + 10, 22, 3.5, Math.PI / 2);
        K.add('tankShell', new THREE.CylinderGeometry(6, 6, 22, 20), M4(f + 40, 8, r - 10, Math.PI / 2, 0, 0));
        for (const z of [-7, 7]) K.cbox('concDark', f + 40, 1.6, r - 10 + z, 10, 3.2, 2, 0.3);
        K.solid(f, r, 26, 24, 0, 36); K.solid(f + 40, r - 10, 7, 12, 0, 15);
      }
      // ---- TRẠM PHÁT ĐIỆN: nhà máy phát, lá chắn gió, quạt mái, 2 ống xả; bãi biến áp có rào + biển điện cao thế
      {
        const f = -20, r = 330;
        K.cbox('conc', f, 18, r, 80, 36, 42, 1.2);
        for (const x of [-26, -2, 22]) K.box('louver', f + x, 25, r - 21.3, 14, 9, 0.6);
        K.box('shutter', f + 33, 11, r - 21.4, 12, 20, 0.6);
        for (const x of [-18, 18]) { K.cyl('steelGray', f + x, 36, r + 8, 3, 3.8, 50, 12); K.cyl('steelDark', f + x, 86, r + 8, 3.3, 3.3, 2, 12); }
        for (const x of [-30, -6]) { K.cbox('steelGray', f + x, 38.5, r - 6, 14, 4, 14, 0.5); K.add('void', new THREE.CircleGeometry(5.6, 18), M4(f + x, 40.6, r - 6, -Math.PI / 2, 0, 0)); }
        K.solid(f, r, 40, 21, 0, 42);
        const tf = f + 66, tr = r + 4;
        K.cbox('conc', tf, 0.6, tr, 26, 1.2, 50, 0.4);
        for (const z of [-14, 14]) { K.cbox('steelGray', tf, 8, tr + z, 10, 14, 9, 0.6); for (const x of [-3, 0, 3]) for (let j = 0; j < 3; j++) K.cyl('steelWhite', tf + x, 15 + j * 1.6, tr + z, 1.1, 1.3, 1.2, 8); }
        fence(K, tf - 15, tr - 27, tf + 15, tr - 27, -1, 13); fence(K, tf - 15, tr + 27, tf + 15, tr + 27, 1, 13); fence(K, tf + 15, tr - 27, tf + 15, tr + 27, 1, 13);
        K.plane(decal('hv_sign', signTex('hv_sign', ['DANGER', 'HIGH VOLTAGE — KEEP OUT'], { w: 512, h: 256, bg: '#efece2', fg: '#a3221a' })), tf + 15.6, 9, tr, 9, 4.5, Math.PI / 2);
        K.solid(tf, tr, 13, 26, 0, 22);
      }
      // ---- THÁP NƯỚC: bồn trụ trên 4 chân giằng chéo, thang, lan can
      {
        const f = -70, r = -330, H = 96;
        for (const [x, z] of [[-12, -12], [-12, 12], [12, -12], [12, 12]]) { K.cbox('concDark', f + x, 1.5, r + z, 6, 3, 6, 0.4); K.add('olive', new THREE.BoxGeometry(2, H, 2), M4(f + x, H / 2 + 3, r + z)); }
        for (let y = 14; y < H; y += 24) for (const [a, b, c2, d] of [[-12, -12, 12, -12], [12, -12, 12, 12], [12, 12, -12, 12], [-12, 12, -12, -12]]) {
          K.beam('olive', [f + a, y, r + b], [f + c2, y, r + d], 0.9); K.beam('olive', [f + a, y, r + b], [f + c2, y + 24, r + d], 0.6); K.beam('olive', [f + c2, y, r + d], [f + a, y + 24, r + b], 0.6);
        }
        K.add('tankShell', new THREE.CylinderGeometry(19, 19, 30, 28, 1, true), M4(f, H + 18, r));
        K.add('steelWhite', new THREE.ConeGeometry(19.4, 8, 28), M4(f, H + 37, r));
        K.cyl('steelGray', f, H + 2, r, 21, 21, 1, 28);
        K.add('steelGray', new THREE.CylinderGeometry(1.4, 1.4, H, 8), M4(f, H / 2 + 3, r));
        for (let y = 4; y < H; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 2.6), M4(f + 13.2, y, r));
        K.solid(f, r, 21, 21, 0, H + 42);
      }
      // ---- CỤM MÁY LÀM LẠNH + THÁP GIẢI NHIỆT (điều hoà phòng sạch áp suất âm)
      {
        const f = 40, r = -330;
        K.cbox('concDark', f, 0.6, r, 70, 1.2, 50, 0.4);
        for (const z of [-14, 14]) for (const x of [-20, 4]) {
          K.cbox('steelWhite', f + x, 7, r + z, 22, 12, 14, 0.5);
          for (const k of [-5, 5]) { K.cyl('steelDark', f + x + k, 13, r + z, 4.2, 4.2, 0.6, 16); for (const a of [0, Math.PI / 2]) K.box('steelGray', f + x + k, 13.5, r + z, 7.6, 0.3, 0.4, a); }
        }
        K.cbox('steelGray', f + 28, 14, r, 14, 28, 24, 0.6); K.box('louver', f + 35.2, 10, r, 0.4, 16, 20);
        K.cyl('steelDark', f + 28, 28, r, 8, 8, 2, 18);
        K.solid(f, r, 36, 26, 0, 30);
      }
      // ---- TƯỜNG RỌ ĐÁ chắn mảnh quanh bồn nitơ / nhà kiểm soát
      hesco(170, 112, 170, 188, 2); hesco(60, -212, 130, -212, 2);
      // ---- THÁP CANH + LÔ CỐT
      for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -iR + 38], [-iF + 38, iR - 38], [-iF + 38, -iR + 38], [iF - 28, G + 40], [iF - 28, -G - 40], [-iF + 30, 250], [-iF + 30, -250], [60, iR - 30], [60, -iR + 30]]) tower(f, r);
      for (const [f, r] of [[iF - 30, 360], [iF - 30, -360], [-iF + 24, 330], [-iF + 24, -330]]) pillbox(f, r);
      // ---- BIỂN NGUY HIỂM SINH HỌC trên rào ngoài
      const bw = decal('bio_warn', signTex('bio_warn', ['BIOHAZARD', 'RESTRICTED MILITARY AREA — NO ENTRY'], { w: 768, h: 256, icon: 'bio', bg: '#f0c419', fg: '#141414' }));
      for (const [f, r, ry] of [[-120, -(L.hv - 35.4), Math.PI], [120, -(L.hv - 35.4), Math.PI], [-120, L.hv - 35.4, 0], [120, L.hv - 35.4, 0], [-(L.hu - 35.4), 200, -Math.PI / 2], [-(L.hu - 35.4), -200, -Math.PI / 2]]) K.plane(bw, f, 9, r, 16, 5.3, ry);
      // ---- XE BỎ LẠI: 3 xe trinh sát, xe bồn, 1 xe bánh xích
      anim.vehicles.push({ type: 'SCOUT', f: 150, r: -60, a: 0.12, ty: 0.4, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: 70, r: 240, a: 1.5, ty: -0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: -120, r: -250, a: -1.4, ty: 0, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'ARTILLERY', f: 90, r: 280, a: 0, chassis: true, cargo: 'jp8', hf: 50, hr: 13 });
      anim.vehicles.push({ type: 'GATLING', f: 205, r: -250, a: Math.PI / 2, ty: 0.8, hf: 43, hr: 32 });
    }
  };
})();
