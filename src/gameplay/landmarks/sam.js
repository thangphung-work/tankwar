/**
 * TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG S-125 PECHORA (SA-3) — BỎ HOANG
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / kè đất: MapGen (map_gen.js).
 * Tên lửa 5V27, xe ZIL-131, pháo phòng không: dùng chung trong landmarks.js (api.missile125 / milTruck / aaGun).
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  KINDS.sam = {
    name: 'TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG', icon: '✈', color: '#9fd3ff',
    // trận địa S-75: đường vòng lục giác nối miệng 6 kè bệ phóng + nan hoa vào radar giữa ("ngôi sao"), đường cổng
    site: (() => {
      const ring = [[92, 157], [-92, 157], [-92, -157], [92, -157]];
      const spokes = ring.map(([f, r]) => { const d = Math.hypot(f, r); return [[[f, r], [f * 56 / d, r * 56 / d]], 14]; });
      return {
        roads: [[[[320, 0], [92, 0]], 30], [ring.concat([ring[0]]), 20]].concat(spokes),
        junctions: ring.map(([f, r]) => [f, r, 24, 24]).concat([[92, 0, 22, 30]]),
        gravel: (hu) => [[-90, -105, 70, 105], [hu - 150, -70, hu, 70], [-60, 380, 80, 450], [-250, -45, -185, 45], [-185, 370, -115, 430], [120, 360, 180, 440], [-165, -432, -95, -368],
          [92, 180, 156, 244], [-156, 180, -92, 244], [-156, -244, -92, -180], [92, -244, 156, -180],
          [147, 82, 203, 138], [147, -138, 203, -82], [-228, 92, -172, 148], [-228, -148, -172, -92]],
        slabs: [], noGrow: []
      };
    })(),
    build(K, group, anim, api) {
      // eslint-disable-next-line no-unused-vars
      const { TAU, hash, TEX, canvas, texOf, speckle, blotch, ageCanvas, concreteFill, concPair, concTex, grimePair, ribPair, hescoTex, hazardTex, bandTex, biohazard, trefoil, warnSign, signTex, icbmTex, detailTex, ABANDONED, SITES, siteOf, asphaltTex, roadStripGeo, roadNet, apronTex, MAT, mat, decal, decalT, doorMats, v3, M4, boxGeo, mergeGeos, defTile, Kit, apron, meshFenceMat, fence, sandbags, drum, camoMat, camoNet, warnPlate, loftGeo, plateGeo, heliSkin, heli, secKit, perimeter, officeBlock, stack, vTank, missile125, milTruck, aaGun } = api;
      const SITE = KINDS.sam.site;
      const L = K.L, EL = 30 * Math.PI / 180, SI = SITE;
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'sam');
      roadNet(group, SI.roads, SI.junctions, { bars: [[L.hu - 150, 0, 2.4, 28]], words: [['STOP', L.hu - 144, 0, Math.PI / 2, 14]] });
      const kit = secKit(K, anim), { iF, iR, G, mul, tower, pillbox, hesco } = kit;
      perimeter(K, kit);
      // ---- 4 BỆ PHÓNG 5P73: khung đế + 4 tay chống có kích đế tròn, bệ xoay, mâm, 2 dầm bên + giá 4 ray (2 trên / 2 dưới)
      //      nâng 30°, tên lửa treo trên ray trên và dưới ray dưới, tấm chắn luồng phụt, hộp điều khiển, cáp
      const ammo = [4, 2, 4, 0];
      L.launchers.forEach((P, idx) => {
        const base = mul(M4(P.f, 0, P.r), M4(0, 0, 0, 0, -P.az, 0)), at = (x, y, z, rx, ry, rz) => mul(base, M4(x, y, z, rx, ry, rz));
        K.add('concDark', new THREE.CylinderGeometry(30, 32, 2, 8), at(0, -0.4, 0));
        K.cbox('olive', 0, 3, 0, 22, 3, 22, 0.5, 0, base);
        for (const a of [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4]) {
          K.add('olive', new THREE.BoxGeometry(20, 2.4, 2.6), at(Math.cos(a) * 18, 3, Math.sin(a) * 18, 0, -a, 0));
          K.add('steelGray', new THREE.CylinderGeometry(0.9, 0.9, 5, 8), at(Math.cos(a) * 27, 3, Math.sin(a) * 27));
          K.add('steelDark', new THREE.CylinderGeometry(2.6, 3, 0.8, 12), at(Math.cos(a) * 27, 0.4, Math.sin(a) * 27));
        }
        K.add('steelDark', new THREE.CylinderGeometry(9, 9.6, 3, 20), at(0, 6, 0));
        K.cbox('olive', -2, 10, 0, 18, 5, 16, 0.6, 0, base);
        for (const s of [-1, 1]) K.add('olive', plateGeo([[-10, 0], [6, 0], [4, 10], [-6, 12]], 1.4), at(-2, 12, s * 8));
        K.cbox('oliveDark', 7, 11, 9, 5, 7, 4, 0.4, 0, base);
        const boom = mul(at(-4, 22, 0), M4(0, 0, 0, 0, 0, EL));
        for (const s of [-1, 1]) K.add('olive', new THREE.BoxGeometry(34, 3, 1.4), mul(boom, M4(10, 0, s * 7.4)));
        for (const x of [-2, 16]) K.add('olive', new THREE.BoxGeometry(2, 2.4, 16), mul(boom, M4(x, 0, 0)));
        const rails = [[3.6, -3.8], [3.6, 3.8], [-3.6, -3.8], [-3.6, 3.8]];
        rails.forEach(([y, z], k) => {
          K.add('steelGray', new THREE.BoxGeometry(44, 0.9, 1.4), mul(boom, M4(14, y, z)));
          if (k < ammo[idx]) missile125(K, mul(boom, M4(-8, y + (y > 0 ? 2.7 : -2.7), z)));
        });
        K.add('steelDark', new THREE.BoxGeometry(1, 12, 22), at(-24, 6, 0, 0, 0, 0.3));   // tấm chắn luồng phụt
        K.solid(P.f, P.r, 26, 26, 0, 24, P.az);
        for (let k = 0; k < 3; k++) {
          const x0 = -8 + k * 16, c = Math.cos(EL), sn = Math.sin(EL), mid = (x0 + 8) * c - 4;
          K.solid(P.f + Math.cos(P.az) * mid, P.r + Math.sin(P.az) * mid, 9 * c + 4, 10, 22 + x0 * sn - 6, 22 + (x0 + 16) * sn + 8, P.az);
        }
        const d = Math.hypot(P.f, P.r), ux = P.f / d, uz = P.r / d;
        K.add('concDark', new THREE.BoxGeometry(d - 70, 0.8, 3), M4(ux * (d / 2 + 4), 0.6, uz * (d / 2 + 4), 0, -P.az, 0));
        K.cbox('steelGray', P.f - ux * 34, 4, P.r - uz * 34, 4, 8, 6, 0.3, -P.az);
      });
      // tên lửa đổ nằm cạnh bệ thiếu đạn (rơi khỏi xe nạp đạn khi rút chạy)
      { const P = L.launchers[3]; missile125(K, M4(P.f - 44, 2.3, P.r + 26, 0.4, 0.6, 0.05)); K.solid(P.f - 30, P.r + 16, 26, 5, 0, 6, 0.6); }
      // ---- TRẠM RADAR DẪN BẮN SNR-125 ở giữa: cabin thiết bị trên rơ-moóc, cột ăng-ten xoay, ăng-ten parabol chữ nhật lớn
      //      (bám mục tiêu) + 2 máng phản xạ chéo (quét), loa thu trước mỗi ăng-ten, chảo nhỏ phát lệnh; vòng bao cát
      {
        const b = M4(0, 0, 0), at = (x, y, z, rx, ry, rz) => mul(b, M4(x, y, z, rx, ry, rz));
        K.add('steelDark', new THREE.BoxGeometry(56, 4, 16), at(0, 8, 0));
        K.cbox('olive', 0, 22, 0, 60, 24, 22, 1, 0, b); K.cbox('oliveDark', 0, 34.6, 0, 60.6, 1.4, 22.6, 0.3, 0, b);
        for (const x of [-20, 20]) for (const s of [-1, 1]) K.add('rubber', new THREE.CylinderGeometry(4.6, 4.6, 3, 16), at(x, 4.6, s * 9.5, Math.PI / 2, 0, 0));
        for (let x = -26; x <= 26; x += 4) for (const s of [-1, 1]) K.add('oliveDark', new THREE.BoxGeometry(0.5, 22, 0.5), at(x, 22, s * 11.2));
        K.add('steelGray', new THREE.BoxGeometry(0.5, 14, 6), at(30.4, 19, 4));
        K.cyl('steelDark', 0, 35, 0, 7, 8, 3, 16); K.cyl('olive', 0, 38, 0, 5, 6, 8, 14);
        const ant = M4(4, 48, 0, 0, 0, 0);
        K.cbox('oliveDark', 0, 0, 0, 12, 6, 14, 0.5, 0, ant);
        const dish = new THREE.CylinderGeometry(30, 30, 30, 18, 1, true, -0.55, 1.1);
        { const uv = dish.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * 1.2); }
        K.add('steelGray', dish, mul(ant, M4(-22, 20, 0, 0, Math.PI / 2, 0)));
        for (const y of [5, 35]) K.add('olive', new THREE.BoxGeometry(2, 1.2, 34), mul(ant, M4(5, y, 0)));
        for (const z of [-16, 16]) K.add('olive', new THREE.BoxGeometry(2, 32, 1.2), mul(ant, M4(5, 20, z)));
        K.beam('steelGray', [5, 6, -14], [24, 20, 0], 0.6, ant); K.beam('steelGray', [5, 34, -14], [24, 20, 0], 0.6, ant); K.beam('steelGray', [5, 20, 16], [24, 20, 0], 0.6, ant);
        K.add('steelDark', new THREE.BoxGeometry(3, 3, 3), mul(ant, M4(25, 20, 0)));
        const trough = (len, half, depth) => {
          const sh = new THREE.Shape(), N = 12, t = 0.5;
          for (let i = 0; i <= N; i++) { const y = -half + 2 * half * i / N, x = depth * (y / half) * (y / half); i ? sh.lineTo(-x, y) : sh.moveTo(-x, y); }
          for (let i = N; i >= 0; i--) { const y = -half + 2 * half * i / N, x = depth * (y / half) * (y / half); sh.lineTo(-x - t, y); }
          sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(depth * 0.5, 0, -len / 2);
          const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 24, uv.getY(i) / 24);
          return g;
        };
        for (const [z, rx] of [[-26, Math.PI / 4], [26, -Math.PI / 4]]) {
          K.add('oliveDark', trough(46, 4, 2.2), mul(ant, M4(4, 30, z, rx, 0, 0)));
          K.add('steelGray', new THREE.BoxGeometry(0.6, 0.6, 46), mul(ant, M4(10, 30, z, rx, 0, 0)));
          K.beam('steelGray', [0, 2, Math.sign(z) * 7], [4, 30, z], 0.8, ant);
        }
        K.add('steelWhite', new THREE.SphereGeometry(4.6, 14, 6, 0, TAU, 0, Math.PI * 0.35), mul(ant, M4(6, -2, -12, 0, 0, -Math.PI / 2)));
        K.solid(0, 0, 31, 12, 0, 38); K.solid(-12, 0, 14, 34, 40, 90);
        for (let k = 1; k < 10; k++) { const a0 = k / 10 * TAU + 0.3, a1 = a0 + TAU / 10 - 0.12; sandbags(K, Math.cos(a0) * 52, Math.sin(a0) * 52, Math.cos(a1) * 52, Math.sin(a1) * 52, 4, 0); }
      }
      // ---- XE CHỈ HUY + XE PHÂN PHỐI ĐIỆN (kung trên ZIL-131), cáp nối; 2 MÁY PHÁT DIESEL trên rơ-moóc (lá chắn gió, ống xả,
      //      bồn dầu, càng kéo)
      milTruck(K, M4(52, 0, 84, 0, -0.15 + Math.PI, 0), 'kung'); milTruck(K, M4(52, 0, -84, 0, 0.15 + Math.PI, 0), 'kung');
      K.solid(52, 84, 36, 11, 0, 32, 0.15); K.solid(52, -84, 36, 11, 0, 32, -0.15);
      for (const r of [84, -84]) K.beam('rubber', [34, 0.8, r * 0.8], [10, 0.8, r * 0.2], 1.4);
      for (const r of [-26, 26]) {
        K.add('steelDark', new THREE.BoxGeometry(34, 2, 12), M4(-66, 7, r));
        K.cbox('olive', -68, 15, r, 28, 14, 15, 0.8); for (const x of [-78, -70, -62]) K.box('louver', x, 15, r + Math.sign(r) * 7.6, 6, 9, 0.4);
        K.cyl('steelDark', -76, 22, r, 1.2, 1.2, 12, 8); K.add('steelDark', new THREE.CylinderGeometry(1.5, 1.5, 3, 8), M4(-76, 34.5, r));
        K.add('tankShell', new THREE.CylinderGeometry(3.4, 3.4, 12, 14), M4(-58, 10, r, Math.PI / 2, 0, 0));
        K.beam('steelDark', [-50, 6, r - 3], [-40, 3, r], 0.8); K.beam('steelDark', [-50, 6, r + 3], [-40, 3, r], 0.8);
        for (const x of [-78, -60]) for (const s of [-1, 1]) { K.add('rubber', new THREE.CylinderGeometry(3.4, 3.4, 2.6, 14), M4(x, 3.4, r + s * 7, Math.PI / 2, 0, 0)); K.add('olive', new THREE.CylinderGeometry(1.8, 1.8, 2.7, 10), M4(x, 3.4, r + s * 7.05, Math.PI / 2, 0, 0)); }
        K.solid(-66, r, 18, 9, 0, 36);
      }
      // ---- 4 KHẨU PHÁO PHÒNG KHÔNG TẦM TRUNG S-60 57 mm bảo vệ trận địa (ụ bao cát tròn), nòng hướng các hướng tiếp cận
      for (const [f, r, az] of [[175, 110, 0.5], [175, -110, -0.5], [-200, 120, 2.4], [-200, -120, -2.4]]) aaGun(K, f, r, az, 0.62);
      // ---- 2 XE VẬN TẢI - NẠP ĐẠN PR-14 (ZIL-131 chở 2 tên lửa trên ray) ở bãi nạp đạn
      for (const [r, n] of [[396, 2], [430, 1]]) {
        milTruck(K, M4(20, 0, r, 0, 0, 0), 'loader');
        for (let k = 0; k < n; k++) missile125(K, M4(-32, 23, r + (k ? 5 : -5)));
        K.solid(8, r, 34, 11, 0, 28);
      }
      // ---- KHO TÊN LỬA: vòm bê tông nửa trụ phủ đất 2 đầu, cửa thép 2 cánh hướng vào trận địa, gờ chắn đầu hồi
      {
        const f = -220, r = 0, R = 26, Lg = 80;
        const sh = new THREE.Shape(); sh.absarc(0, 0, R, 0, Math.PI, false); sh.lineTo(-R, 0); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: Lg, bevelEnabled: false, curveSegments: 18 }); g.translate(0, 0, -Lg / 2);
        { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 64, uv.getY(i) / 64); }
        K.add('conc', g, M4(f, 0, r, 0, 0, 0));
        K.cbox('concDark', f + R + 1, 14, r, 2, 28, 44, 0.4);
        for (const s2 of [-1, 1]) K.add(s2 > 0 ? doorMats()[0] : doorMats()[1], boxGeo(1, 20, 14, 0), M4(f + R + 2.2, 10, r + s2 * 7.2));
        K.plane(decal('mstore', signTex('mstore', ['MISSILE STORAGE', 'EXPLOSIVES — NO OPEN FLAME'], { w: 768, h: 160, bg: '#efece2', fg: '#a3221a' })), f + R + 2.3, 24, r, 20, 4.2);
        K.solid(f, r, R, Lg / 2, 0, R);
      }
      // ---- RADAR CẢNH GIỚI P-12 (giàn ăng-ten Yagi 2 tầng trên cột xoay, đặt trên xe kung) ở góc sau
      {
        const f = -150, r = 400;
        milTruck(K, M4(f, 0, r, 0, -0.4, 0), 'mast');
        const ant = M4(f - 13, 72, r - 5, 0, 0.9, 0);
        K.add('steelGray', new THREE.BoxGeometry(2, 22, 60), ant);
        for (const y of [-7, 7]) for (let z = -27; z <= 27; z += 6) { K.add('steelGray', new THREE.BoxGeometry(18, 0.5, 0.5), mul(ant, M4(4, y, z))); for (const x of [-4, 4, 12]) K.add('steelGray', new THREE.BoxGeometry(0.4, 0.4, 4.4), mul(ant, M4(x, y, z))); }
        K.solid(f, r, 36, 12, 0, 32, 0.4); K.solid(f - 13, r - 5, 30, 30, 58, 86);
      }
      // ---- DOANH TRẠI + SỞ CHỈ HUY trận địa, bồn dầu diesel có tường rọ đá
      officeBlock(K, kit, 150, 400, 0, 50, 70, 1, ['BATTERY HQ', 'AIR DEFENSE — RESTRICTED']);
      {
        const f = -130, r = -400;
        for (const z of [-16, 16]) { K.add('tankShell', new THREE.CylinderGeometry(8, 8, 42, 20), M4(f, 10, r + z, 0, 0, Math.PI / 2)); for (const x of [-14, 14]) K.cbox('concDark', f + x, 2.2, r + z, 3, 4.4, 12, 0.3); }
        hesco(f - 32, r - 34, f + 32, r - 34, 2); hesco(f - 32, r + 34, f + 32, r + 34, 2); hesco(f - 32, r - 34, f - 32, r + 34, 2);
        K.solid(f, r, 22, 26, 0, 19);
      }
      // ---- THÁP CANH + LÔ CỐT
      for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -iR + 38], [-iF + 38, iR - 38], [-iF + 38, -iR + 38], [iF - 28, G + 40], [iF - 28, -G - 40], [-iF + 30, 230], [-iF + 30, -230]]) tower(f, r);
      for (const [f, r] of [[iF - 34, 260], [iF - 34, -260], [-iF + 22, 300], [-iF + 22, -300]]) pillbox(f, r);
      // ---- XE BỎ LẠI
      anim.vehicles.push({ type: 'SCOUT', f: 60, r: -170, a: -0.9, ty: 0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: 0, r: 262, a: 0.3, ty: 0, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'GATLING', f: 120, r: -400, a: 0, ty: -0.6, hf: 43, hr: 32 });
    }
  };
})();
