/**
 * ĐÀI ĐIỀU KHIỂN RADAR VỆ TINH (bản đồ cao nguyên) — BỎ HOANG
 *
 * Theo các trạm mặt đất điều khiển / bám vệ tinh quân sự thật (kiểu Menwith Hill, Pine Gap, trạm điều khiển vệ tinh
 * AFSCN): mặt bằng san 2 cấp trên đỉnh cao nguyên — NỀN TRÊN (cao 3.5 m, MapGen: L.terrace) giữ bằng tường chắn đất bê
 * tông mặt vát, ta-luy cỏ phía sau, đường dốc chạy dọc chân tường; trên nền: chảo parabol 18 m bệ phương vị - cao độ
 * (tháp bệ bê tông, bàn xoay, giá chữ U hộp thép, bánh răng quạt cao độ, đối trọng, phòng thiết bị sau chảo, khung
 * giàn lưng chảo, gương phụ Cassegrain trên chân 4 càng, côn loa thu), 2 RADOME "quả bóng golf" (vỏ cầu trắc địa ghép
 * tấm tam giác trên bệ trụ bê tông có cửa thép, máy điều hoà). NỀN DƯỚI: nhà điều hành 2 tầng (vườn ăng-ten trên mái:
 * radome nhỏ, chảo VSAT, ăng-ten HF log-chu kỳ, cần thu phát), cầu cáp từ mái sang nền trên, cụm máy làm lạnh, chảo
 * 9 m (gác ở tư thế thiên đỉnh), cụm chảo VSAT, radar cảnh giới trên tháp giàn, tháp chuyển tiếp vi ba 45 m (ăng-ten
 * trống, sàn công tác, thang, đèn báo bay) + nhà trạm, nhà phát điện + bồn dầu ngày + trạm biến áp, 2 bồn dầu nằm
 * trong đê bao, sân trực thăng, mương cáp nắp bê tông. Canh phòng cấp căn cứ chiến lược (bộ dùng chung).
 *
 * Bỏ hoang: mất điện (đèn tắt, chảo kẹt ở góc ngẩng cuối cùng, radar đứng yên), tấm phản xạ chảo bong rơi xuống
 * nền cỏ, vỏ radome thủng vài tấm, rêu / tảo bám chân radome, dây leo rủ tường chắn, lan can gỉ gãy, 1 chảo VSAT đổ.
 * (LandmarkSet.update bỏ qua mọi chuyển động khi bỏ hoang -> không cần móc cập nhật riêng.)
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / nền trên: MapGen (map_gen.js:
 * detailRadar / moundRadar).
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  const TAU = Math.PI * 2;
  // bản sao thông số nền trên (MapGen detailRadar đặt L.terrace — dùng khi thiếu)
  const TER = { f0: -200, f1: -68, r0: -370, r1: 150, h: 28, run: 46, rf: -84, rw: 16, rEnd: 330, cut: 18 };
  // vị trí công trình chính (f, r cục bộ)
  const POS = {
    dish18: { f: -148, r: -130 }, domeA: { f: -150, r: -300 }, domeB: { f: -145, r: 50 },
    ops: { f: 20, r: -160, L: 80, W: 200 }, dish9: { f: 40, r: 110 }, gen: { f: 20, r: 255 }, fuel: { f: -180, r: 272 },
    mw: { f: -160, r: 392 }, srad: { f: 40, r: -385 }, heli: { f: 45, r: 400 }
  };
  // đường: cổng -> trục dọc trước -> nhánh tới chân đường dốc; đường dốc + đường nền trên bám mặt đất (dựng riêng)
  const ROAD_GATE = [[[320, 0], [140, 0]], 30], ROAD_SPINE = [[[140, -420], [140, 360]], 26], ROAD_LINK = [[[140, 330], [-84, 330]], 24];
  const ROAD_UP = [[[-84, 330], [-84, 150], [-84, -360]], 24];
  const FLAT_ROADS = [ROAD_GATE, ROAD_SPINE, ROAD_LINK];
  const JUNCS = [[140, 0, 26, 30], [140, 330, 26, 24], [-84, 330, 24, 24]];

  // ---------------------------------------------------------------------------------------------
  // TEXTURE / VẬT LIỆU RIÊNG (bộ nhớ đệm cấp module)
  // ---------------------------------------------------------------------------------------------
  const RM = {};
  let A = null;   // api landmarks.js (gán khi build)
  // Tấm phản xạ chảo (atlas 2 x 2 biến thể, mỗi ô 1 tấm): nhôm sơn trắng xỉn, mạch ghép + đinh tán viền tấm;
  // 0 sạch, 1 vệt bẩn mưa, 2 sơn bong lộ gỉ, 3 địa y / tảo xanh xám
  function panelTex() {
    const { texOf, hash, blotch } = A;
    return texOf('rd_panel', 256, 256, (g) => {
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2) * 128, oy = (k >> 1) * 128;
        g.save(); g.beginPath(); g.rect(ox, oy, 128, 128); g.clip();
        g.fillStyle = ['#dddbd4', '#d4d1c8', '#d6d0c4', '#d0d3c6'][k]; g.fillRect(ox, oy, 128, 128);
        for (let i = 0; i < 500; i++) { g.fillStyle = hash(i + k * 999) < 0.5 ? 'rgba(120,116,104,0.25)' : 'rgba(255,255,255,0.3)'; g.fillRect(ox + hash(i * 3 + k) * 128, oy + hash(i * 5 + k + 1) * 128, 1.5, 1.5); }
        for (let i = 0; i < 8; i++) blotch(g, ox + hash(i + k * 50 + 3) * 128, oy + hash(i + k * 50 + 4) * 128, 10 + hash(i + k * 50) * 26, '150,144,128', 0.22);
        if (k === 1) for (let i = 0; i < 22; i++) {   // vệt bẩn mưa chảy theo tấm
          const x = ox + hash(i + 300) * 128, y0 = oy + hash(i + 301) * 40, l = 30 + hash(i + 302) * 90, gr = g.createLinearGradient(0, y0, 0, y0 + l);
          gr.addColorStop(0, 'rgba(84,78,64,0.38)'); gr.addColorStop(1, 'rgba(84,78,64,0)'); g.fillStyle = gr; g.fillRect(x, y0, 2 + hash(i + 303) * 5, l);
        }
        if (k === 2) for (let i = 0; i < 10; i++) {   // sơn bong, gỉ loang
          const x = ox + 10 + hash(i + 400) * 108, y = oy + 10 + hash(i + 401) * 108, rr = 3 + hash(i + 402) * 12;
          g.fillStyle = 'rgba(128,78,40,0.85)'; g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, hash(i) * 3, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(60,40,26,0.5)'; g.lineWidth = 1; g.stroke();
          const gr = g.createLinearGradient(0, y, 0, y + 40); gr.addColorStop(0, 'rgba(140,80,36,0.4)'); gr.addColorStop(1, 'rgba(140,80,36,0)'); g.fillStyle = gr; g.fillRect(x - 1.5, y, 3, 40);
        }
        if (k === 3) for (let i = 0; i < 26; i++) blotch(g, ox + hash(i + 500) * 128, oy + hash(i + 501) * 128, 4 + hash(i + 502) * 14, hash(i + 503) < 0.6 ? '92,104,70' : '64,66,56', 0.45);
        // mạch ghép tấm + đinh tán
        g.strokeStyle = 'rgba(70,68,62,0.85)'; g.lineWidth = 3; g.strokeRect(ox + 1.5, oy + 1.5, 125, 125);
        g.strokeStyle = 'rgba(250,250,246,0.4)'; g.lineWidth = 1; g.strokeRect(ox + 4, oy + 4, 120, 120);
        g.fillStyle = 'rgba(80,76,68,0.8)';
        for (let t = 8; t < 124; t += 12) for (const [x, y] of [[t, 7], [t, 121], [7, t], [121, t]]) { g.beginPath(); g.arc(ox + x, oy + y, 1.1, 0, TAU); g.fill(); }
        g.restore();
      }
    });
  }
  // Tấm vỏ radome tam giác (UV tam giác (0,0) (1,0) (0.5,1)): nền trắng ngà, gờ ghép tấm + bu lông dọc 3 cạnh
  function domeTex() {
    const { texOf, hash } = A;
    return texOf('rd_dome', 128, 128, (g, w, h) => {
      g.fillStyle = '#e6e4de'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) { g.fillStyle = hash(i + 7100) < 0.5 ? 'rgba(130,126,116,0.22)' : 'rgba(255,255,255,0.35)'; g.fillRect(hash(i + 7101) * w, hash(i + 7102) * h, 1.4, 1.4); }
      const tri = [[2, h - 2], [w - 2, h - 2], [w / 2, 2]];
      g.strokeStyle = 'rgba(110,106,98,0.9)'; g.lineWidth = 4; g.beginPath(); tri.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(10, h - 7); g.lineTo(w - 10, h - 7); g.lineTo(w / 2, 13); g.closePath(); g.stroke();
      g.fillStyle = 'rgba(96,92,84,0.85)';
      for (let k = 0; k < 3; k++) {
        const [x0, y0] = tri[k], [x1, y1] = tri[(k + 1) % 3];
        for (let t = 0.08; t < 0.95; t += 0.09) { g.beginPath(); g.arc(x0 + (x1 - x0) * t + (k === 0 ? 0 : k === 1 ? -3 : 3), y0 + (y1 - y0) * t + (k === 0 ? -4 : 2), 1.1, 0, TAU); g.fill(); }
      }
    });
  }
  const dishMat = () => RM.dish || (RM.dish = new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.18, name: 'rd_dish' }));
  const domeMat = () => RM.dome || (RM.dome = new THREE.MeshStandardMaterial({ map: domeTex(), vertexColors: true, roughness: 0.8, metalness: 0.02, name: 'rd_dome' }));
  // Biển cảnh báo bức xạ tần số vô tuyến (kiểu ANSI C95.2): dải cam WARNING, tam giác vàng + biểu tượng ăng-ten phát sóng
  function rfMat() {
    const { texOf, ageCanvas, decal } = A;
    return decal('rd_rf', texOf('rd_rf', 256, 320, (g, w, h) => {
      g.fillStyle = '#eeece4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e06a1a'; g.fillRect(8, 8, w - 16, 62);
      g.fillStyle = '#151515'; g.font = 'bold 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WARNING', w / 2, 41);
      const cx = w / 2, cy = 150, s = 66;
      g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.1, cy + s * 0.75); g.lineTo(cx - s * 1.1, cy + s * 0.75); g.closePath();
      g.fillStyle = '#f0c419'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#151515'; g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 40); g.moveTo(cx - 12, cy + 40); g.lineTo(cx + 12, cy + 40); g.stroke();
      for (const k of [1, 2]) { g.beginPath(); g.arc(cx, cy - 18, 12 * k, -0.7, 0.7); g.stroke(); g.beginPath(); g.arc(cx, cy - 18, 12 * k, Math.PI - 0.7, Math.PI + 0.7); g.stroke(); }
      g.font = 'bold 25px Arial, sans-serif'; g.fillText('RADIO FREQUENCY', w / 2, 238); g.fillText('RADIATION HAZARD', w / 2, 266);
      g.font = 'bold 15px Arial, sans-serif'; g.fillText('BEYOND THIS POINT', w / 2, 294);
      g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      ageCanvas(g, w, h, 191, 0.9);
    }));
  }

  KINDS.radar = {
    name: 'ĐÀI ĐIỀU KHIỂN RADAR VỆ TINH', icon: '📡', color: '#8fe3c8',
    site: {
      roads: [ROAD_GATE, ROAD_SPINE, ROAD_LINK, ROAD_UP],
      junctions: JUNCS,
      gravel: (hu) => [[hu - 150, -70, hu, 70], [62, -282, 128, -40], [-32, 196, 100, 300], [-245, 215, -115, 335], [-205, 350, -80, 440], [0, -432, 96, -338],
        [-5, 66, 88, 156], [74, 130, 118, 238], [-32, -312, 72, -262], [150, -70, 175, 70]],
      // mặt bê tông: sân trực thăng, bệ chảo 18 m (nền trên), bệ chảo 9 m
      slabs: [[-25, 352, 115, 448], [-194, -176, -102, -84], [16, 86, 64, 134]],
      noGrow: []
    },
    build(K, group, anim, api) {
      A = api;
      const { hash, texOf, signTex, MAT, decal, decalT, v3, M4, boxGeo, roadNet, roadStripGeo, apron, fence, plateGeo, heli, secKit, perimeter, officeBlock, ABANDONED } = api;
      const L = K.L, T = L.terrace || TER, TH = T.h, SI = KINDS.radar.site;
      const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
      const earth = (f, r) => K.earth(f, r);
      const cylM = (m, mtx, rT, rB, h, seg) => K.cyl(m, 0, 0, 0, rT, rB, h, seg, mtx);
      const uvK = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / k, uv.getY(i) / k); return g; };
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'radar');
      roadNet(group, FLAT_ROADS, JUNCS, {
        bars: [[160, 0, 2.4, 28]].concat([-235, -195, -155].map(r => [100, r, 40, 1])),
        words: [['STOP', 166, 0, Math.PI / 2, 14]]
      });

      // ---- BỘ GOM TAM GIÁC TÔ MÀU TỪNG TẤM (tấm chảo / tấm radome: mỗi tấm 1 sắc độ riêng như ngoài thực tế)
      const BT = new Map(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
      const tri3 = (m, M, NM, p, n, uv, c) => {
        let d = BT.get(m); if (!d) BT.set(m, d = { p: [], n: [], u: [], c: [] });
        const per = Array.isArray(c[0]);
        for (let k = 0; k < 3; k++) {
          _v.set(p[k][0], p[k][1], p[k][2]).applyMatrix4(M); d.p.push(_v.x, _v.y, _v.z);
          _n.set(n[k][0], n[k][1], n[k][2]).applyMatrix3(NM).normalize(); d.n.push(_n.x, _n.y, _n.z);
          d.u.push(uv[k][0], uv[k][1]);
          const cc = per ? c[k] : c; d.c.push(cc[0], cc[1], cc[2]);
        }
      };
      const buildBatch = () => {
        for (const [m, d] of BT) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(d.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
          g.computeBoundingSphere();
          const me = new THREE.Mesh(g, m); me.castShadow = me.receiveShadow = true; group.add(me);
        }
      };
      // hình 2 mặt (mặt phản xạ mỏng nhìn được cả 2 phía với vật liệu 1 mặt của bộ ghép hình)
      const twoSided = (geo) => {
        const g = geo.index ? geo.toNonIndexed() : geo;
        if (!g.attributes.normal) g.computeVertexNormals();
        const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, n = P.length / 3;
        const P2 = new Float32Array(P.length * 2), N2 = new Float32Array(P.length * 2), U2 = new Float32Array(U.length * 2);
        P2.set(P); N2.set(N); U2.set(U);
        for (let t = 0; t < n; t += 3) for (let k = 0; k < 3; k++) {
          const src = t + (k === 0 ? 0 : 3 - k), dst = n + t + k;
          for (let c = 0; c < 3; c++) { P2[dst * 3 + c] = P[src * 3 + c]; N2[dst * 3 + c] = -N[src * 3 + c]; }
          U2[dst * 2] = U[src * 2]; U2[dst * 2 + 1] = U[src * 2 + 1];
        }
        const o = new THREE.BufferGeometry();
        o.setAttribute('position', new THREE.BufferAttribute(P2, 3)); o.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); o.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
        return o;
      };

      // ---- CHI TIẾT NHỎ DÙNG CHUNG
      // lan can ống thép (pts [f, y, r] trong khung base): cột mỗi ~1.5 m, tay vịn + thanh giữa
      const railing = (pts, h, m, base) => {
        m = m || 'steelRust'; h = h || 8.5;
        const B = base || new THREE.Matrix4();
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(len / 12));
          for (let k = 0; k <= n; k++) {
            if (k === n && i < pts.length - 2) continue;
            const t = k / n;
            K.add(m, new THREE.BoxGeometry(0.5, h, 0.5), mul(B, M4(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + h / 2, a[2] + (b[2] - a[2]) * t)));
          }
          K.beam(m, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.5, B);
          K.beam(m, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.35, B);
        }
      };
      // thang leo thép (khung mtx: gốc chân thang, +z quay ra ngoài), cage = lồng bảo vệ
      const ladder = (mtx, h, cage) => {
        for (const x of [-1.8, 1.8]) K.add('steelGray', new THREE.BoxGeometry(0.4, h, 0.5), mul(mtx, M4(x, h / 2, 0)));
        for (let y = 2; y < h; y += 2.4) K.add('steelGray', new THREE.BoxGeometry(3.6, 0.25, 0.25), mul(mtx, M4(0, y, 0)));
        if (cage && h > 24) {
          for (let y = 18; y < h; y += 6) K.add('steelGray', new THREE.TorusGeometry(3, 0.18, 3, 10, Math.PI), mul(mtx, M4(0, y, 0.2, Math.PI / 2, 0, 0)));
          for (const a of [0.5, 1.3, 1.85, 2.65]) K.add('steelGray', new THREE.BoxGeometry(0.25, h - 18, 0.25), mul(mtx, M4(Math.cos(a) * 3, 18 + (h - 18) / 2, 0.2 + Math.sin(a) * 3)));
        }
      };
      // biển cảnh báo bức xạ RF trên cọc, mặt quay theo hướng ang (f/r)
      const rfPost = (f, r, ang) => {
        const y = Math.max(0, earth(f, r));
        K.cyl('steelGray', f, y - 1, r, 0.4, 0.45, 15, 6);
        K.add('steelGray', new THREE.BoxGeometry(0.3, 8, 6.4), M4(f + Math.cos(ang) * 0.5, y + 10.5, r + Math.sin(ang) * 0.5, 0, -ang, 0));
        K.plane(rfMat(), f + Math.cos(ang) * 0.7, y + 10.5, r + Math.sin(ang) * 0.7, 6, 7.5, Math.PI / 2 - ang);
      };
      // mương cáp nắp bê tông đúc sẵn (mỗi nắp ~1 m, khe hở giữa các nắp) dọc đường gấp khúc, bám mặt đất
      const trench = (pts, w) => {
        for (let i = 1; i < pts.length; i++) {
          const [af, ar] = pts[i - 1], [bf, br] = pts[i], len = Math.hypot(bf - af, br - ar), ang = Math.atan2(br - ar, bf - af), n = Math.max(1, Math.round(len / 8));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n, f = af + (bf - af) * t, r = ar + (br - ar) * t;
            K.add(hash(f * 3.1 + r * 7.7) < 0.08 ? 'concDark' : 'conc', boxGeo(len / n - 0.7, 1.4, w, 64), M4(f, Math.max(0, earth(f, r)) + 0.2, r, (hash(f + r) - 0.5) * 0.04, -ang, (hash(f * 2 + r) - 0.5) * 0.05));
          }
        }
      };
      // đường nhựa bám mặt đất (đường dốc + đường nền trên): chia nhỏ 1 m, mỗi đỉnh nâng theo cao độ đất
      const earthRoad = (pts, wd) => {
        const sp = [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8);
          for (let k = i === 1 ? 0 : 1; k <= n; k++) sp.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
        }
        const g = roadStripGeo(sp, wd, 0), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) P.setY(i, Math.max(0, earth(P.getX(i), P.getZ(i))) + 0.55);
        g.computeVertexNormals();
        const me = new THREE.Mesh(g, MAT.road); me.receiveShadow = true; group.add(me);
      };
      earthRoad(ROAD_UP[0], ROAD_UP[1]);

      // =========================================================================================
      // TƯỜNG CHẮN ĐẤT NỀN TRÊN: bê tông mặt vát (chân dày 3 m, đỉnh 1.5 m), chia tấm 4 m có mạch, gờ đỉnh, ống thoát
      // nước sau tường, rãnh thoát nước chân tường, lan can ống gỉ (gãy vài đoạn), dây leo rủ; chạy suốt mặt trước nền
      // trên + dọc đường dốc, đỉnh hạ dần theo mặt đất phía sau; cầu thang bộ lên nền trên
      // =========================================================================================
      const FB = T.f1 + 2, FF = T.f1 + 26, BAT = 11, SR0 = 0, SR1 = 16;
      const faceF = (y) => FF - BAT * Math.max(0, Math.min(1, y / (TH + 6)));
      const inStair = (r) => r > SR0 - 2 && r < SR1 + 2;
      const wallH = (r) => inStair(r) ? TH - 0.6 : Math.max(0, earth(FB - 8, r)) + 6;
      // khối lăng trụ: mặt cắt 4 điểm (f, y) tại r = ra (A) và r = rb (B), thứ tự ngược chiều kim đồng hồ nhìn từ +r
      const prism = (m, Ap, Bp, ra, rb) => {
        const pos = [], uv = [];
        const V = (p, r) => [p[0], p[1], r];
        const tri = (a, b, c, side) => { for (const q of [a, b, c]) { pos.push(...q); uv.push(side ? q[2] / 64 : q[0] / 64, q[1] / 64); } };
        for (let e = 0; e < 4; e++) {
          const a0 = V(Ap[e], ra), a1 = V(Ap[(e + 1) % 4], ra), b1 = V(Bp[(e + 1) % 4], rb), b0 = V(Bp[e], rb);
          tri(a0, a1, b1, true); tri(a0, b1, b0, true);
        }
        tri(V(Bp[0], rb), V(Bp[1], rb), V(Bp[2], rb)); tri(V(Bp[0], rb), V(Bp[2], rb), V(Bp[3], rb));
        tri(V(Ap[0], ra), V(Ap[2], ra), V(Ap[1], ra)); tri(V(Ap[0], ra), V(Ap[3], ra), V(Ap[2], ra));
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.computeVertexNormals();
        K.add(m, g);
      };
      {
        const rA = T.r0 - T.run + 2, rB = T.rEnd - 4;
        let cuts = [];
        for (let r = rA; r < rB; r += 32) cuts.push(r);
        cuts = cuts.filter(r => Math.abs(r - (SR0 - 2)) > 8 && Math.abs(r - (SR1 + 2)) > 8).concat([SR0 - 2, SR1 + 2, rB]).sort((a, b) => a - b);
        for (let i = 0; i < cuts.length - 1; i++) {
          const ra = cuts[i], rb = cuts[i + 1], ha = Math.max(5, wallH(ra + 0.01)), hb = Math.max(5, wallH(rb - 0.01)), rc = (ra + rb) / 2, hc = Math.max(ha, hb);
          const sec = (h) => [[FB, -3], [FF, -3], [faceF(h), h], [FB, h]];
          prism('conc', sec(ha), sec(hb), ra, rb);
          // gờ đỉnh tường
          const cop = (h) => [[FB - 1, h], [faceF(h) + 1.2, h], [faceF(h) + 1.2, h + 1.6], [FB - 1, h + 1.6]];
          if (!inStair(rc)) prism('concDark', cop(ha), cop(hb), ra - 0.2, rb + 0.2);
          // mạch tấm (dải nhô nhẹ) ở mép tấm
          const jt = (h) => [[faceF(-3) - 1, -3], [FF + 0.35, -3], [faceF(h) + 0.35, h], [faceF(h) - 1, h]];
          prism('concDark', jt(hb), jt(hb), rb - 0.5, rb + 0.5);
          // ống thoát nước sau tường (2 ống / tấm) + vệt nước gỉ đen dưới miệng ống
          if (hc > 10) for (const t of [0.3, 0.75]) {
            const r = ra + (rb - ra) * t;
            K.add('rubber', new THREE.CylinderGeometry(0.5, 0.5, 2.4, 8), M4(faceF(6) + 0.8, 6, r, 0, 0, Math.PI / 2));
          }
          // dây leo rủ từ đỉnh tường (ôm theo mặt vát)
          if (ABANDONED && hc > 10) for (let k = 0; k < 2; k++) {
            if (hash(rc * 0.37 + k * 11) > 0.55) continue;
            const r = ra + 4 + hash(rc + k * 5) * (rb - ra - 8), w = 7 + hash(rc * 3 + k) * 9, yT = ha + (hb - ha) * (r - ra) / (rb - ra), len = Math.min(yT - 1, 10 + hash(rc * 7 + k) * 22);
            const y0 = yT - len, f0 = faceF(y0) + 0.7, f1 = faceF(yT) + 0.9;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute([f1, yT + 0.5, r - w / 2, f1, yT + 0.5, r + w / 2, f0, y0, r - w / 2, f0, y0, r + w / 2], 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
            g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
            K.add('vine', g);
          }
          // lan can trên gờ đỉnh (bỏ hoang: gãy mất vài đoạn), không có ở chiếu nghỉ cầu thang
          if (!inStair(rc) && hc > 12 && hash(rc * 1.7 + 3) > 0.16) {
            const fr = (FB + faceF(hc)) / 2;
            railing([[fr, ha + 1.6, ra + 0.5], [fr, hb + 1.6, rb - 0.5]], 8.5, 'steelRust');
          }
          K.solid((FB + FF) / 2, rc, (FF - FB) / 2, (rb - ra) / 2, 0, hc + (inStair(rc) ? 1 : 3));
        }
        // rãnh thoát nước chân tường: đáy + gờ ngoài
        for (let r = rA; r < rB; r += 64) {
          const len = Math.min(64, rB - r);
          K.box('concDark', FF + 4.5, 0.45, r + len / 2, 9, 0.9, len);
          K.box('concDark', FF + 9.4, 1.3, r + len / 2, 1.2, 2.6, len);
        }
      }
      // ---- CẦU THANG BỘ lên nền trên: 16 bậc bê tông dọc chân tường, chiếu nghỉ vắt qua đỉnh tường, lan can ngoài
      {
        const sf = FF + 9, n = 16, rise = TH / n, run = 3.6;
        for (let i = 0; i < n; i++) { const yT = TH - i * rise; K.box('conc', sf, yT / 2, SR1 + (i + 0.5) * run, 16, yT, run + 0.05); }
        K.box('conc', (FB - 8 + FF + 17) / 2, TH - 1.4, (SR0 + SR1) / 2, FF + 17 - (FB - 8), 3.2, SR1 - SR0);
        railing([[FF + 16.5, 0, SR1 + n * run], [FF + 16.5, TH, SR1], [FF + 16.5, TH, SR0], [FB - 6, TH, SR0]], 8.5, 'steelGray');
        K.solid(sf, SR1 + n * run / 2, 8, n * run / 2, 0, TH * 0.5);
      }

      // =========================================================================================
      // CHẢO PARABOL BỆ PHƯƠNG VỊ - CAO ĐỘ (kiểu 18 m / 9 m Cassegrain)
      // o: f, r, y0 (cốt bệ), R (bán kính miệng), F (tiêu cự), EY (cao trục cao độ), az (hướng phương vị), el (góc ngẩng),
      //    pad (bán kính bệ bát giác), seed, miss (tỉ lệ tấm rơi mất), tower (tháp bệ bê tông) / cột thép
      // =========================================================================================
      const dishPanels = (E, o, rings, secs, onMissing) => {
        const NM = new THREE.Matrix3().getNormalMatrix(E), F = o.F, Xv = o.Xv;
        const Pp = (rho, ph) => [Xv + rho * rho / (4 * F), rho * Math.cos(ph), rho * Math.sin(ph)];
        const Np = (rho, ph) => { const a = -rho / (2 * F), l = Math.hypot(1, a); return [1 / l, a * Math.cos(ph) / l, a * Math.sin(ph) / l]; };
        let id = 0;
        for (let i = 0; i < secs.length; i++) {
          const n = secs[i], ra = rings[i], rb = rings[i + 1], off = (i % 2) * 0.5;
          for (let j = 0; j < n; j++, id++) {
            const pa = (j + off) / n * TAU, pb = (j + 1 + off) / n * TAU;
            if (o.miss && i > 0 && hash(o.seed * 977 + id * 13) < o.miss) { if (onMissing) onMissing(ra, rb, pa, pb, id); continue; }
            panel(E, NM, Pp, Np, ra, rb, pa, pb, o.seed * 31 + id);
          }
        }
      };
      // 1 tấm phản xạ: lưới 3 x 2 ô bám mặt paraboloid, ô atlas + sắc độ theo hàm băm
      const panel = (M, NM, Pp, Np, ra, rb, pa, pb, sd) => {
        const vr = hash(sd * 7 + 1), vk = vr < 0.55 ? 0 : vr < 0.78 ? 1 : vr < 0.9 ? 2 : 3, u0 = (vk % 2) * 0.5, v0 = 0.5 - (vk >> 1) * 0.5;
        const t = 0.8 + hash(sd * 3 + 2) * 0.2, col = [t, t * 0.99, t * 0.955], NF = 3, NR = 2;
        const pt = (a, b) => { const rho = ra + (rb - ra) * b / NR, ph = pa + (pb - pa) * a / NF; return [Pp(rho, ph), Np(rho, ph), [u0 + 0.012 + 0.476 * a / NF, v0 + 0.012 + 0.476 * b / NR]]; };
        for (let a = 0; a < NF; a++) for (let b = 0; b < NR; b++) {
          const q00 = pt(a, b), q10 = pt(a, b + 1), q01 = pt(a + 1, b), q11 = pt(a + 1, b + 1);
          tri3(dishMat(), M, NM, [q00[0], q10[0], q01[0]], [q00[1], q10[1], q01[1]], [q00[2], q10[2], q01[2]], col);
          tri3(dishMat(), M, NM, [q10[0], q11[0], q01[0]], [q10[1], q11[1], q01[1]], [q10[2], q11[2], q01[2]], col);
        }
      };
      const dishAntenna = (o) => {
        const s = o.R / 72, R = o.R, F = o.F, EY = o.EY, Xv = 6 * s, y0 = o.y0, big = s > 0.75;
        const base = M4(o.f, y0, o.r, 0, -o.az, 0), at = (x, y, z, rx, ry, rz) => mul(base, M4(x, y, z, rx, ry, rz));
        const yD = EY - 44 * s, yT = yD - 9 * s, Zy = 34 * s;
        // bệ bát giác bê tông
        cylM('concDark', at(0, -3, 0, 0, Math.PI / 8, 0), o.pad, o.pad + 1.5, 5, 8);
        if (o.tower) {
          // tháp bệ bê tông côn: cửa thép + bậc + mái hắt, cửa chớp thông gió, ống cáp chui vào chân tháp, thang lồng ngoài
          cylM('conc', at(0, 2, 0), 20 * s, 24 * s, yT - 2, 28);
          cylM('concDark', at(0, 2, 0), 25.5 * s, 26.5 * s, 2.6, 28);
          K.add('steelGray', boxGeo(1.2, 17, 10, 24), at(-23.6 * s, 2 + 8.5, 0));
          for (const z of [-5.6, 5.6]) K.add('steelDark', new THREE.BoxGeometry(1.6, 18, 1), at(-23.8 * s, 11, z));
          K.add('steelDark', new THREE.BoxGeometry(1.6, 1, 12.2), at(-23.8 * s, 19.6, 0));
          K.cbox('concDark', -25 * s - 3, 21.5, 0, 7, 1, 15, 0.3, 0, base);
          K.cbox('concDark', -26.5 * s - 3, 1.2, 0, 7, 2.4, 13, 0.3, 0, base);
          K.add('lampAmber', new THREE.BoxGeometry(1, 0.8, 2), at(-24.4 * s - 0.5, 20.6, 0));
          for (const a of [1.2, -1.2]) K.add('louver', boxGeo(0.8, 8, 9, 8), at(Math.cos(a) * 22.6 * s, yT - 14, Math.sin(a) * 22.6 * s, 0, -a, 0));
          for (const z of [-3, 0, 3]) K.add('steelGray', new THREE.CylinderGeometry(0.9, 0.9, 12, 8), at(24 * s + 4, 2.4, z, 0, 0, Math.PI / 2));
          const lb = mul(base, M4(0, 2, 0, 0, Math.PI / 2, 0));
          ladder(mul(lb, M4(0, 0, 23.6 * s + 0.6)), yD - 2 - 6 * s, true);
        } else {
          // cột thép (kingpost) bích đế bulông + 4 bản gân, tủ điện chân cột
          cylM('steelGray', at(0, 2, 0), 7, 8, yT - 2, 18);
          cylM('steelDark', at(0, 2, 0), 11, 11, 1.6, 18);
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; K.add('steelGray', plateGeo([[0, 0], [5, 0], [0, 9]], 0.8), at(Math.cos(a) * 7.5, 3.6, Math.sin(a) * 7.5, 0, -a, 0)); }
          for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; K.cyl('steelDark', 0, 0, 0, 0.5, 0.5, 1.4, 6, at(Math.cos(a) * 9.6, 3.6, Math.sin(a) * 9.6)); }
          K.cbox('steelWhite', 0, 6.5, 14, 8, 9, 5, 0.4, 0, base);
          ladder(at(-7.8, 3.6, 0, 0, -Math.PI / 2, 0), yD - 3.6 - 6 * s, true);
        }
        // ổ quay phương vị + vành răng
        cylM('steelGray', at(0, yT, 0), 22 * s, 23 * s, 3 * s + 1, 32);
        cylM('steelDark', at(0, yT + 1, 0), 24 * s, 24 * s, 1.6 * s + 0.6, 32);
        // sàn bàn xoay (alidade) + lan can 2 đầu
        K.cbox('steelWhite', 0, yD - 3 * s, 0, 56 * s, 6 * s, 76 * s, 0.8, 0, base);
        for (const x of [-27.5 * s, 27.5 * s]) railing([[x, yD, -36 * s], [x, yD, 36 * s]], 8.5, 'steelGray', base);
        // giá chữ U: 2 tay hộp thép hình thang, gân tăng cứng, ổ trục cao độ, thang leo lên ổ trục
        const hA = EY + 5 * s - yD;
        for (const sz of [-1, 1]) {
          K.add('steelWhite', uvK(plateGeo([[-24 * s, 0], [24 * s, 0], [9 * s, hA], [-9 * s, hA]], 4 * s), 24), at(0, yD, sz * Zy));
          K.add('steelWhite', new THREE.BoxGeometry(2 * s + 0.6, hA - 3 * s, 1.6 * s + 0.4), at(0, yD + (hA - 3 * s) / 2, sz * (Zy + 2.6 * s)));
          K.add('steelGray', new THREE.CylinderGeometry(7 * s, 7 * s, 6 * s, 20), at(0, EY, sz * (Zy + 4 * s), Math.PI / 2, 0, 0));
          K.add('steelDark', new THREE.CylinderGeometry(3 * s, 3 * s, 7.5 * s, 12), at(0, EY, sz * (Zy + 5 * s), Math.PI / 2, 0, 0));
        }
        ladder(mul(base, M4(-6 * s, yD, Zy + 2 * s + 1.2)), hA - 12 * s, false);
        // hộp số + mô-tơ bánh răng quạt cao độ (cố định trên tay giá)
        K.cbox('steelDark', 0, EY - 33 * s, Zy - 6 * s, 9 * s, 7 * s, 7 * s, 0.4, 0, base);
        K.add('steelGray', new THREE.CylinderGeometry(2.4 * s, 2.4 * s, 8 * s, 10), at(-7 * s, EY - 33 * s, Zy - 6 * s, 0, 0, Math.PI / 2));

        // ---- phần quay theo cao độ (khung E: +x = hướng búp sóng)
        const E = mul(base, M4(0, EY, 0, 0, 0, o.el)), atE = (x, y, z, rx, ry, rz, sx, sy, sz) => mul(E, M4(x, y, z, rx, ry, rz, sx, sy, sz));
        K.add('steelWhite', new THREE.CylinderGeometry(14 * s, 15 * s, 16 * s, 20), atE(Xv - 8 * s, 0, 0, 0, 0, -Math.PI / 2));
        K.add('steelGray', new THREE.CylinderGeometry(3.5 * s, 3.5 * s, 2 * Zy, 12), atE(0, 0, 0, Math.PI / 2, 0, 0));
        K.cbox('steelWhite', -17 * s, 0, 0, 16 * s, 24 * s, 36 * s, 0.6, 0, E);   // phòng thiết bị sau đỉnh chảo
        if (big) {
          K.add('steelGray', new THREE.BoxGeometry(0.6, 6, 13), atE(-25.2 * s, 0, -9 * s));
          K.cbox('steelWhite', -17 * s, 0, 18 * s + 1.8, 7, 5, 3.6, 0.3, 0, E);
          K.add('void', new THREE.CircleGeometry(1.5, 12), atE(-17 * s, 0, 18 * s + 3.65));
        }
        // đối trọng 2 bên phía sau trục + tay đỡ
        for (const sz of [-1, 1]) {
          K.cbox('steelDark', -30 * s, 0, sz * 16 * s, 12 * s, 16 * s, 10 * s, 0.6 * s, 0, E);
          K.beam('steelWhite', [-8 * s, 6 * s, sz * 14 * s], [-25 * s, 5 * s, sz * 16 * s], 2 * s + 0.3, E);
          K.beam('steelWhite', [-8 * s, -6 * s, sz * 14 * s], [-25 * s, -5 * s, sz * 16 * s], 2 * s + 0.3, E);
        }
        // bánh răng quạt cao độ + 2 nan nối trục
        K.add('steelDark', new THREE.TorusGeometry(30 * s, 1.6 * s, 4, 24, 1.3), atE(0, 0, Zy - 6 * s, 0, 0, Math.PI));
        for (const a of [Math.PI, Math.PI + 1.3]) K.beam('steelWhite', [0, 0, Zy - 6 * s], [Math.cos(a) * 29 * s, Math.sin(a) * 29 * s, Zy - 6 * s], 1.6 * s + 0.3, E);
        // mặt phản xạ ghép tấm (vài tấm rơi mất -> lộ khung giàn lưng chảo)
        const rings = [10, 22, 34, 46, 58, 72].map(x => x * s), secs = big ? [12, 18, 24, 30, 36] : [10, 14, 18, 22, 26];
        const lost = [];
        dishPanels(E, { F, Xv, seed: o.seed, miss: o.miss }, rings, secs, (ra, rb, pa, pb, id) => lost.push([ra, rb, pa, pb, id]));
        K.add('steelGray', new THREE.TorusGeometry(R, 0.8 * s + 0.3, 4, 72), atE(Xv + R * R / (4 * F), 0, 0, 0, Math.PI / 2, 0));
        // khung giàn lưng chảo: sườn hướng tâm (cánh trước bám mặt chảo, cánh sau, thanh đứng, thanh chéo) + vành giằng
        {
          const nRib = big ? 24 : 16, rr = [13, 26, 39, 52, 63, 71].map(x => x * s), Dh = 18 * s, tb = Math.max(0.55, 1.1 * s);
          const Pf = (rho, ph) => [Xv + rho * rho / (4 * F) - 0.9, rho * Math.cos(ph), rho * Math.sin(ph)];
          const Pb = (rho, ph) => { const d = Dh * (1 - 0.82 * rho / R) + 1.2; return [Xv + rho * rho / (4 * F) - d, rho * Math.cos(ph), rho * Math.sin(ph)]; };
          for (let k = 0; k < nRib; k++) {
            const ph = (k + 0.5) / nRib * TAU, ph2 = (k + 1.5) / nRib * TAU;
            for (let i = 0; i < rr.length; i++) {
              K.beam('steelGray', Pf(rr[i], ph), Pb(rr[i], ph), tb * 0.8, E);
              if (i < rr.length - 1) {
                K.beam('steelGray', Pf(rr[i], ph), Pf(rr[i + 1], ph), tb, E);
                K.beam('steelGray', Pb(rr[i], ph), Pb(rr[i + 1], ph), tb, E);
                K.beam('steelGray', i % 2 ? Pf(rr[i], ph) : Pb(rr[i], ph), i % 2 ? Pb(rr[i + 1], ph) : Pf(rr[i + 1], ph), tb * 0.7, E);
              }
            }
            for (const i of [1, 3, 5]) K.beam('steelGray', Pb(rr[i], ph), Pb(rr[i], ph2), tb * 0.8, E);
          }
        }
        // côn loa thu giữa chảo + gương phụ lồi trên chân 4 càng
        K.add('steelWhite', new THREE.CylinderGeometry(4.5 * s, 9 * s, 19 * s, 16), atE(Xv + 8.5 * s, 0, 0, 0, 0, -Math.PI / 2));
        K.add('steelGray', new THREE.CylinderGeometry(4.7 * s, 4.7 * s, 1.4 * s, 16), atE(Xv + 18.4 * s, 0, 0, 0, 0, -Math.PI / 2));
        const xs = Xv + F * 0.86, Rs = 7.5 * s, ca = 0.55, rs = Rs / Math.sin(ca), xb = xs + rs * (1 - Math.cos(ca));
        K.add('steelWhite', new THREE.SphereGeometry(rs, 18, 4, 0, TAU, 0, ca), atE(xs + rs, 0, 0, 0, 0, Math.PI / 2));
        K.add('steelGray', new THREE.CylinderGeometry(Rs * 0.9, Rs, 2 * s, 18), atE(xb + 1 * s, 0, 0, 0, 0, -Math.PI / 2));
        K.cbox('steelWhite', xb + 5 * s, 0, 0, 6 * s, 6 * s, 6 * s, 0.4 * s, 0, E);
        for (let k = 0; k < 4; k++) {
          const ph = Math.PI / 4 + k * Math.PI / 2, rho = R * 0.94;
          K.beam('steelWhite', [Xv + rho * rho / (4 * F), rho * Math.cos(ph), rho * Math.sin(ph)], [xb + 4 * s, 3.4 * s * Math.cos(ph), 3.4 * s * Math.sin(ph)], Math.max(0.9, 1.8 * s), E);
          K.add('steelDark', new THREE.BoxGeometry(2.4 * s + 0.5, 2.4 * s + 0.5, 2.4 * s + 0.5), atE(Xv + rho * rho / (4 * F), rho * Math.cos(ph), rho * Math.sin(ph)));
        }
        // va chạm: tháp bệ + sàn, giá chữ U, khối chảo
        K.solid(o.f, o.r, 26 * s, 26 * s, 0, y0 + yD);
        K.solid(o.f, o.r, 26 * s, 38 * s, y0 + yD, y0 + EY + 6 * s, o.az);
        const C = v3(Xv + 14 * s, 0, 0).applyMatrix4(E), sn = Math.abs(Math.sin(o.el)), cs = Math.abs(Math.cos(o.el));
        K.solid(C.x, C.z, R * sn * 0.85 + 12 * s, R * 0.9, C.y - R * cs * 0.9 - 8 * s, C.y + R * cs * 0.9 + 8 * s, o.az);
        return { lost, E, F, Xv, base };
      };

      // ---- CHẢO CHÍNH 18 m trên nền trên: kẹt ở góc ngẩng 38°, hướng về phía cổng; 2 tấm phản xạ rơi nằm trong cỏ
      {
        const P = POS.dish18, d = dishAntenna({ f: P.f, r: P.r, y0: TH, R: 72, F: 50, EY: 104, az: 0.45, el: 0.66, pad: 46, seed: 7, miss: 0.05, tower: true });
        const Pp = (rho, ph) => [d.Xv + rho * rho / (4 * d.F), rho * Math.cos(ph), rho * Math.sin(ph)];
        const Np = (rho, ph) => { const a = -rho / (2 * d.F), l = Math.hypot(1, a); return [1 / l, a * Math.cos(ph) / l, a * Math.sin(ph) / l]; };
        d.lost.slice(0, 3).forEach(([ra, rb, pa, pb, id], k) => {
          const c = Pp((ra + rb) / 2, (pa + pb) / 2), gf = P.f + 30 + k * 26 - hash(id) * 10, gr = P.r + 52 - k * 40 + hash(id + 1) * 12;
          const M = mul(M4(gf, Math.max(0, earth(gf, gr)) + 1.2 + k * 0.4, gr, (hash(id + 2) - 0.5) * 0.3, hash(id + 3) * TAU, 1.5 + (hash(id + 4) - 0.5) * 0.3), M4(-c[0], -c[1], -c[2]));
          panel(M, new THREE.Matrix3().getNormalMatrix(M), Pp, Np, ra, rb, pa, pb, id * 5 + 3);
        });
        K.plane(decal('rd_ant1', signTex('rd_ant1', ['ANTENNA AE-1  18 M', 'AZ-EL TRACKING — KEEP CLEAR WHEN MOVING'], { w: 768, h: 160, bg: '#efece2', fg: '#1d2a3a' })), P.f - Math.cos(0.45) * 22.6, TH + 30, P.r - Math.sin(0.45) * 22.6, 18, 3.75, -Math.PI / 2 - 0.45);
        rfPost(P.f + 52, P.r - 40, 0); rfPost(P.f + 52, P.r + 40, 0); rfPost(P.f - 10, P.r + 52, Math.PI / 2);
      }
      // ---- CHẢO 9 m nền dưới: cột thép, gác ở tư thế thiên đỉnh (chống gió)
      {
        const P = POS.dish9;
        dishAntenna({ f: P.f, r: P.r, y0: 0, R: 36, F: 25, EY: 58, az: 2.4, el: Math.PI / 2 - 0.03, pad: 25, seed: 19, miss: 0.03, tower: false });
        rfPost(P.f + 30, P.r - 26, 0); rfPost(P.f + 30, P.r + 26, 0);
        // xích chắn vùng bức xạ quanh bệ (cọc sơn vàng đen, xích võng)
        for (let k = 0; k < 10; k++) {
          const a0 = k / 10 * TAU, a1 = (k + 1) / 10 * TAU, p0 = [P.f + Math.cos(a0) * 34, P.r + Math.sin(a0) * 34], p1 = [P.f + Math.cos(a1) * 34, P.r + Math.sin(a1) * 34];
          K.cyl('yellow', p0[0], 0, p0[1], 0.6, 0.6, 7, 8);
          if (k !== 5) { const mid = [(p0[0] + p1[0]) / 2, 4.6, (p0[1] + p1[1]) / 2]; K.beam('steelDark', [p0[0], 6.4, p0[1]], mid, 0.3); K.beam('steelDark', mid, [p1[0], 6.4, p1[1]], 0.3); }
        }
      }

      // =========================================================================================
      // RADOME "QUẢ BÓNG GOLF": vỏ cầu trắc địa ghép tấm tam giác (mỗi tấm 1 sắc độ: tấm thay mới trắng hơn, tấm bám
      // tảo xanh xám, vệt bẩn chảy dọc), cắt phẳng ở 3/4 cầu, vành thép chân vỏ trên bệ trụ bê tông; cửa thép có mái
      // hắt + bậc, cửa chớp thông gió, máy điều hoà đóng gói, đèn báo bay đỉnh vòm; bỏ hoang: vài tấm vỡ lộ lòng tối
      // =========================================================================================
      const radome = (o) => {
        const R = o.R, cosC = -0.55, Rc = R * Math.sqrt(1 - cosC * cosC), y0 = o.y0, PH = o.PH, cy = y0 + PH - cosC * R;
        const C = M4(o.f, cy, o.r), NM = new THREE.Matrix3().getNormalMatrix(C), cut = cosC * R, sm = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
        K.cyl('conc', o.f, y0 - 3, o.r, Rc + 3, Rc + 3.8, PH + 3, 40);
        K.cyl('concDark', o.f, y0 + PH - 1.6, o.r, Rc + 4.4, Rc + 4.4, 2, 40);
        K.cyl('steelGray', o.f, y0 + PH, o.r, Rc + 0.8, Rc + 1.2, 2.4, 48);
        const g = new THREE.IcosahedronGeometry(R, o.det || 4), P = g.attributes.position.array;
        for (let i = 0, t = 0; i < P.length; i += 9, t++) {
          const tri = [[P[i], P[i + 1], P[i + 2]], [P[i + 3], P[i + 4], P[i + 5]], [P[i + 6], P[i + 7], P[i + 8]]];
          if (tri.every(q => q[1] <= cut + 0.01)) continue;
          const ym = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
          if (o.miss && ym > 0.05 * R && hash(o.seed * 131 + t * 7) < o.miss) continue;
          for (const q of tri) if (q[1] < cut) { const k = Rc / Math.max(1e-6, Math.hypot(q[0], q[2])); q[0] *= k; q[2] *= k; q[1] = cut; }
          const nn = tri.map(q => { const l = Math.hypot(q[0], q[1], q[2]); return [q[0] / l, q[1] / l, q[2] / l]; });
          const v = hash(o.seed * 17 + t * 3 + 1), tn = 0.94 + hash(t * 5 + o.seed) * 0.06;
          const base = v < 0.1 ? [0.99, 0.99, 0.98] : v < 0.18 ? [0.86, 0.89, 0.82] : v < 0.24 ? [0.91, 0.87, 0.81] : [0.94, 0.93, 0.91];
          const cols = tri.map(q => {
            const yy = q[1] / R, ph = Math.atan2(q[2], q[0]);
            const streak = yy < 0.5 && hash(Math.floor((ph + Math.PI) / TAU * 44) + o.seed * 7) < 0.3 ? 0.9 + 0.1 * sm((yy + 0.55) / 1.05) : 1;
            const low = 0.84 + 0.16 * sm((yy + 0.55) / 0.75), alg = yy < 0 ? 1 - 0.07 * (-yy / 0.55) : 1;
            return [base[0] * tn * low * streak * alg, base[1] * tn * low * streak, base[2] * tn * low * streak * alg * alg];
          });
          tri3(domeMat(), C, NM, tri, nn, [[0, 0], [1, 0], [0.5, 1]], cols);
        }
        g.dispose();
        K.add('void', new THREE.SphereGeometry(R * 0.965, 28, 14, 0, TAU, 0, Math.acos(cosC)), M4(o.f, cy, o.r));
        K.cyl('steelGray', o.f, cy + R - 0.6, o.r, 0.4, 0.5, 5, 6);
        K.add('lampRed', new THREE.SphereGeometry(1.1, 8, 6), M4(o.f, cy + R + 5, o.r));
        if (!o.mini) {
          const ca = Math.cos(o.da), sa = Math.sin(o.da), D = M4(o.f + ca * (Rc + 3.3), y0, o.r + sa * (Rc + 3.3), 0, -o.da, 0), atD = (x, y, z) => mul(D, M4(x, y, z));
          K.add('steelGray', boxGeo(1.2, 17, 10, 24), atD(0, 8.5, 0));
          for (const z of [-5.6, 5.6]) K.add('steelDark', new THREE.BoxGeometry(1.8, 18, 1), atD(0.2, 9, z));
          K.add('steelDark', new THREE.BoxGeometry(1.8, 1, 12.2), atD(0.2, 18.4, 0));
          K.cbox('concDark', 3.4, 20.2, 0, 7, 1, 15, 0.3, 0, D);
          K.cbox('concDark', 3.6, 0.8, 0, 7, 1.6, 14, 0.3, 0, D);
          K.add('lampAmber', new THREE.BoxGeometry(1, 0.8, 2), atD(1.2, 19.2, 0));
          K.add(decal('rd_dome' + o.n, signTex('rd_dome' + o.n, ['RADOME ' + o.n, 'RF HAZARD — NO ENTRY WHEN RADIATING'], { w: 512, h: 160, bg: '#efece2', fg: '#1d2a3a' })),
            new THREE.PlaneGeometry(10, 3.2), mul(D, M4(1.8, 13.5, 11.5, 0, Math.PI / 2, 0)));
          for (const a of [o.da + 1.1, o.da - 1.3, o.da + 2.6]) K.box('louver', o.f + Math.cos(a) * (Rc + 3.6), y0 + PH - 8, o.r + Math.sin(a) * (Rc + 3.6), 0.8, 7, 11, -a);
          // máy điều hoà đóng gói trên bệ + ống gió vào thân bệ
          const ha = o.da - 0.75, hx = o.f + Math.cos(ha) * (Rc + 15), hz = o.r + Math.sin(ha) * (Rc + 15);
          K.cbox('concDark', hx, y0 + 0.4, hz, 18, 1.6, 14, 0.3, -ha);
          K.cbox('steelWhite', hx, y0 + 6, hz, 14, 9, 10, 0.4, -ha);
          for (const dz of [-2.6, 2.6]) K.add('void', new THREE.CircleGeometry(2.2, 12), M4(hx - Math.sin(ha) * dz, y0 + 10.56, hz + Math.cos(ha) * dz, -Math.PI / 2, 0, 0));
          K.add('steelGray', new THREE.BoxGeometry(12, 3, 3), M4(o.f + Math.cos(ha) * (Rc + 8), y0 + 6, o.r + Math.sin(ha) * (Rc + 8), 0, -ha, 0));
          K.solid(hx, hz, 8, 6, 0, y0 + 11, ha);
          rfPost(o.f + ca * (Rc + 12) - sa * 24, o.r + sa * (Rc + 12) + ca * 24, o.da);
        }
        K.solid(o.f, o.r, Rc + 3.6, Rc + 3.6, o.mini ? y0 - 2 : 0, y0 + PH);
        K.solid(o.f, o.r, R * 0.8, R * 0.8, y0 + PH, cy + R * 0.85);
      };
      radome({ f: POS.domeA.f, r: POS.domeA.r, y0: TH, R: 56, PH: 22, seed: 3, miss: 0.012, da: 0, n: 1 });
      radome({ f: POS.domeB.f, r: POS.domeB.r, y0: TH, R: 44, PH: 20, seed: 11, miss: 0.02, da: 0, n: 2 });

      // ---- MƯƠNG CÁP nền trên: dọc sau tường chắn, nhánh tới bệ chảo / radome
      trench([[-70, -332], [-70, 60]], 4);
      for (const [r, f1] of [[-300, -98], [-130, -100], [50, -103]]) trench([[-70, r], [f1, r]], 4);

      // =========================================================================================
      // NHÀ ĐIỀU HÀNH (2 tầng) + vườn ăng-ten trên mái, cầu cáp sang nền trên, cụm máy làm lạnh
      // =========================================================================================
      const kit = secKit(K, anim), { iF, iR, G, tower, pillbox } = kit;
      {
        const { f: of, r: orr, L: OL, W: OW } = POS.ops, RY = 36;
        officeBlock(K, kit, of, orr, 0, OL, OW, 2, ['SATELLITE OPERATIONS CENTER', 'SATCOM GROUND TERMINAL — AUTHORIZED PERSONNEL ONLY']);
        // radome nhỏ trên mái
        radome({ f: of - 8, r: orr - 72, y0: RY, R: 14, PH: 5, seed: 31, miss: 0, mini: true, det: 3 });
        // ăng-ten HF log-chu kỳ trên cột quay: cột, 3 dây néo, hộp quay, cần, 14 cặp phần tử dài dần
        {
          const mf = of + 18, mr = orr - 20, MH = 46;
          K.cyl('steelGray', mf, RY, mr, 0.9, 1.1, MH, 10);
          K.cbox('steelDark', mf, RY + MH + 1.5, mr, 3, 3, 3, 0.3);
          for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.3; K.beam('steelDark', [mf, RY + MH * 0.75, mr], [mf + Math.cos(a) * 20, RY + 3, mr + Math.sin(a) * 20], 0.15); }
          const by = RY + MH + 3.6;
          K.add('steelGray', new THREE.BoxGeometry(1, 1, 46), M4(mf, by, mr));
          for (let k = 0; k < 14; k++) { const z = -22 + k * 3.3, l = 40 - k * 2.2; K.add('steelGray', new THREE.CylinderGeometry(0.15, 0.15, l, 4), M4(mf, by + (k % 2 ? 0.6 : -0.6), mr + z, 0, 0, Math.PI / 2)); }
        }
        // thiết bị mái: 2 máy điều hoà đóng gói (quạt có lưới), cửa thăm mái, kim thu sét 4 góc
        for (const [f, r] of [[of + 26, orr + 70], [of + 26, orr + 34]]) {
          K.cbox('steelWhite', f, RY + 4.5, r, 16, 7, 12, 0.4);
          K.add('void', new THREE.CircleGeometry(3.6, 14), M4(f + 3, RY + 8.05, r, -Math.PI / 2, 0, 0));
          for (const rot of [0, Math.PI / 2]) K.box('steelDark', f + 3, RY + 8.2, r, 7.6, 0.3, 0.35, rot);
          K.add('louver', boxGeo(0.4, 5, 10, 8), M4(f - 8.2, RY + 4.5, r));
          K.box('steelGray', f - 12, RY + 2, r, 6, 2.4, 2.4);
        }
        K.cbox('steelGray', of - 4, RY + 2.2, orr + 80, 8, 3, 8, 0.3);
        for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.cyl('steelGray', of + a * (OL / 2 - 1), RY + 3, orr + b * (OW / 2 - 1), 0.25, 0.3, 12, 4);
        // cần thu phát VHF/UHF trên gờ mái
        for (let k = 0; k < 6; k++) { const f = of - OL / 2 + 4 + (k % 2) * (OL - 8), r = orr - OW / 2 + 20 + k * 30; K.cyl('steelDark', f, RY + 3, r, 0.2, 0.35, 16 + hash(k + 70) * 12, 5); K.cyl('steelGray', f, RY + 3, r, 0.8, 0.8, 1.2, 6); }
        // máng cáp trên mái tới mép sau (đầu cầu cáp)
        K.box('steelDark', of - 35, RY + 1.2, orr + 50, 8, 1, 3.6);
        K.box('steelDark', of - 32, RY + 1.2, orr - 11, 3.6, 1, 126);
        K.box('steelDark', of - 27, RY + 1.2, orr - 72, 10, 1, 3.6);
        // cầu cáp giàn thép từ mái sang nền trên (vắt qua tường chắn), cột đỡ trên nền trên
        {
          const r0 = orr + 50, fa = of - OL / 2 + 1, fb = FB - 12, y = 40, n = Math.round((fa - fb) / 7);
          for (const s of [-1, 1]) {
            K.beam('steelGray', [fa, y, r0 + s * 3], [fb, y, r0 + s * 3], 0.7); K.beam('steelGray', [fa, y + 6, r0 + s * 3], [fb, y + 6, r0 + s * 3], 0.6);
            for (let k = 0; k <= n; k++) {
              const f = fa + (fb - fa) * k / n; K.add('steelGray', new THREE.BoxGeometry(0.5, 6, 0.5), M4(f, y + 3, r0 + s * 3));
              if (k < n) K.beam('steelGray', [f, y, r0 + s * 3], [fa + (fb - fa) * (k + 1) / n, y + 6, r0 + s * 3], 0.4);
            }
          }
          K.box('steelDark', (fa + fb) / 2, y + 0.6, r0, fa - fb, 0.5, 6);
          for (const z of [-1.4, 0, 1.4]) K.add('rubber', new THREE.CylinderGeometry(0.7, 0.7, fa - fb, 6), M4((fa + fb) / 2, y + 1.6, r0 + z, 0, 0, Math.PI / 2));
          const ey = Math.max(0, earth(fb, r0));
          for (const s of [-1, 1]) K.cyl('steelGray', fb, ey, r0 + s * 3, 0.6, 0.7, y - ey, 8);
          K.cbox('concDark', fb, ey + 0.5, r0, 6, 2, 10, 0.3);
          K.box('steelDark', fb - 1.5, (ey + y) / 2, r0, 0.6, y - ey, 3.6);
          K.solid(fb, r0, 2, 5, 0, y + 7);
        }
        // cụm 3 máy làm lạnh giải nhiệt gió (dàn coil chữ V, 2 quạt có lưới) + ống nước lạnh bọc cách nhiệt vào nhà
        const cr = orr - OW / 2 - 27;
        for (const cf of [-4, 26, 56]) {
          K.cbox('concDark', cf, 0.8, cr, 30, 1.6, 18, 0.3);
          K.cbox('steelWhite', cf, 4, cr, 26, 5, 12, 0.4);
          for (const s of [-1, 1]) K.add('louver', boxGeo(26, 9, 0.6, 8), M4(cf, 11, cr + s * 4.4, -s * 0.36, 0, 0));
          for (const x of [-13, 13]) K.box('steelWhite', cf + x, 11, cr, 0.8, 10, 12);
          K.cbox('steelWhite', cf, 16.4, cr, 26, 1.2, 12, 0.3);
          for (const dx of [-6.5, 6.5]) {
            K.cyl('steelGray', cf + dx, 17, cr, 5, 5, 2.2, 18);
            K.add('void', new THREE.CircleGeometry(4.6, 16), M4(cf + dx, 19.25, cr, -Math.PI / 2, 0, 0));
            for (const rot of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4]) K.box('steelDark', cf + dx, 19.4, cr, 9.6, 0.3, 0.35, rot);
          }
          K.solid(cf, cr, 14, 8, 0, 20);
        }
        for (const y of [3.6, 6.8]) {
          K.add('steelWhite', new THREE.CylinderGeometry(1.2, 1.2, 74, 10), M4(26, y, cr + 10, 0, 0, Math.PI / 2));
          for (const f of [11, 39]) K.add('steelWhite', new THREE.CylinderGeometry(1.2, 1.2, 17, 10), M4(f, y, cr + 18.5, Math.PI / 2, 0, 0));
        }
        for (const f of [-8, 20, 50]) K.box('steelDark', f, 2.4, cr + 10, 1.2, 4.8, 3);
        // mương cáp nhà điều hành -> chảo 9 m -> nhà phát điện; 3 chảo VSAT (1 chiếc đổ)
        trench([[5, orr + OW / 2 + 2], [5, 226]], 5); trench([[5, 110], [15, 110]], 4);
      }
      // ---- CHẢO VSAT (lệch tiêu): cột trên khối bê tông, mặt phản xạ elip, cần đỡ loa + bộ LNB
      const vsat = (f, r, y0, az, el, Rr, fallen) => {
        const base = fallen ? M4(f, y0 + 1.6, r, 1.4, -az, 0.25) : M4(f, y0, r, 0, -az, 0);
        if (!fallen) K.cbox('concDark', 0, 1.5, 0, 9, 3, 9, 0.4, 0, base);
        else K.cbox('concDark', f, 1.5, r - 12, 9, 3, 9, 0.4, 0.3);
        K.add('steelGray', new THREE.CylinderGeometry(0.9, 0.9, 13, 10), mul(base, M4(0, 9.5, 0)));
        const D = mul(base, M4(0, 16, 0, 0, 0, el)), rs = Rr / Math.sin(0.5);
        K.add('steelWhite', twoSided(new THREE.SphereGeometry(rs, 18, 5, 0, TAU, 0, 0.5)), mul(D, M4(rs - 1, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1.12)));
        K.add('steelGray', new THREE.BoxGeometry(2, 3, 6), mul(D, M4(-2.4, 0, 0)));
        K.beam('steelGray', [-1, -Rr * 0.85, 0], [Rr * 1.15, -Rr * 0.2, 0], 0.5, D);
        K.cbox('steelDark', Rr * 1.15, -Rr * 0.2, 0, 2.2, 1.6, 1.6, 0.2, 0, D);
        K.solid(f, r, Rr + 1, Rr + 1, 0, y0 + (fallen ? 10 : 16 + Rr));
      };
      vsat(95, 152, 0, 0.6, 0.75, 10); vsat(95, 186, 0, 0.6, 0.75, 10); vsat(98, 220, 0, 0.3, 0.2, 9, true);
      vsat(POS.ops.f + 6, POS.ops.r + 74, 36, 0.9, 0.7, 9);

      // =========================================================================================
      // THÁP GIÀN THÉP 4 chân côn: thanh chân, thanh ngang + giằng chéo chữ X mỗi đoạn, giằng ngang mặt bằng, móng trụ
      // =========================================================================================
      const lattice = (base, H, w0, w1, n, m, t) => {
        const w = (y) => w0 + (w1 - w0) * y / H, C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (const [a, b] of C4) { K.beam(m, [a * w0, 0, b * w0], [a * w1, H, b * w1], t * 1.8, base); K.cbox('concDark', a * w0, 1, b * w0, 7, 4, 7, 0.4, 0, base); }
        for (let i = 0; i < n; i++) {
          const ya = H * i / n, yb = H * (i + 1) / n, wa = w(ya), wb = w(yb);
          for (let e = 0; e < 4; e++) {
            const [a0, b0] = C4[e], [a1, b1] = C4[(e + 1) % 4];
            K.beam(m, [a0 * wb, yb, b0 * wb], [a1 * wb, yb, b1 * wb], t, base);
            K.beam(m, [a0 * wa, ya, b0 * wa], [a1 * wb, yb, b1 * wb], t * 0.75, base);
            K.beam(m, [a1 * wa, ya, b1 * wa], [a0 * wb, yb, b0 * wb], t * 0.75, base);
          }
          if (i % 3 === 2) { K.beam(m, [-wb, yb, -wb], [wb, yb, wb], t * 0.7, base); K.beam(m, [wb, yb, -wb], [-wb, yb, wb], t * 0.7, base); }
        }
        return w;
      };
      // sàn công tác lưới thép quanh thân tháp + lan can
      const platform = (base, y, hw) => {
        K.add('steelDark', new THREE.BoxGeometry(hw * 2, 0.6, hw * 2), mul(base, M4(0, y, 0)));
        railing([[-hw, y, -hw], [hw, y, -hw], [hw, y, hw], [-hw, y, hw], [-hw, y, -hw]], 8.5, 'steelGray', base);
      };
      // thang leo theo mặt nghiêng của tháp (mặt -x), có lồng
      const towerLadder = (base, H, w0, w1, y1) => {
        const xw = (y) => -(w0 + (w1 - w0) * y / H) - 1.2;
        for (const z of [-1.8, 1.8]) K.beam('steelGray', [xw(0), 0, z], [xw(y1), y1, z], 0.4, base);
        for (let y = 2.4; y < y1; y += 3) K.add('steelGray', new THREE.BoxGeometry(0.3, 0.3, 3.6), mul(base, M4(xw(y), y, 0)));
        for (let y = 20; y < y1; y += 9) K.add('steelGray', new THREE.TorusGeometry(3, 0.18, 3, 10, Math.PI), mul(base, M4(xw(y), y, 0, Math.PI / 2, 0, Math.PI / 2)));
      };
      // ăng-ten trống vi ba (mtx: +x hướng phát): thân trụ, nắp radome phẳng trước, hộp sau, giá kẹp
      const drumAnt = (mtx, R) => {
        const at = (x, y, z, rx, ry, rz) => mul(mtx, M4(x, y, z, rx, ry, rz));
        K.add('steelGray', new THREE.CylinderGeometry(R, R, 0.6 * R, 22), at(0, 0, 0, 0, 0, -Math.PI / 2));
        K.add('steelWhite', new THREE.CylinderGeometry(R * 1.03, R * 1.03, 1.2, 22), at(0.3 * R + 0.5, 0, 0, 0, 0, -Math.PI / 2));
        K.add('steelGray', new THREE.CylinderGeometry(R * 0.95, R * 0.45, 0.4 * R, 16), at(-0.5 * R, 0, 0, 0, 0, -Math.PI / 2));
        K.cbox('steelDark', -0.8 * R - 1, 0, 0, 2.4, 3, 3, 0.2, 0, mtx);
        for (const y of [-0.6 * R, 0.6 * R]) K.beam('steelDark', [-0.6 * R, y, 0], [-0.9 * R - 3, y * 0.6, 0], 0.5, mtx);
      };

      // ---- THÁP CHUYỂN TIẾP VI BA 45 m + nhà trạm thiết bị, cầu cáp ngang ("ice bridge")
      {
        const { f: mf, r: mr } = POS.mw, H = 360, w0 = 28, w1 = 8, base = M4(mf, 0, mr);
        const w = lattice(base, H, w0, w1, 15, 'steelGray', 0.9);
        for (const y of [252, 334]) platform(base, y, w(y) + 7);
        K.add('steelDark', new THREE.BoxGeometry(w1 * 2 + 2, 1, w1 * 2 + 2), M4(mf, H + 0.5, mr));
        towerLadder(base, H, w0, w1, H);
        for (const [y, a, R] of [[264, 0.45, 12], [264, 2.9, 12], [318, -1.2, 10], [346, 1.75, 8], [298, 4.3, 6]]) {
          const wr = w(y) + 3, px = Math.cos(a) * wr, pz = Math.sin(a) * wr;
          K.cyl('steelGray', 0, 0, 0, 0.9, 0.9, R * 2 + 8, 8, mul(base, M4(px, y - R - 4, pz)));
          for (const dy of [-R * 0.7, R * 0.7]) K.beam('steelDark', [px, y + dy, pz], [Math.cos(a) * (w(y) - 0.5), y + dy, Math.sin(a) * (w(y) - 0.5)], 0.6, base);
          drumAnt(mul(base, M4(px + Math.cos(a) * (0.9 * R + 3), y, pz + Math.sin(a) * (0.9 * R + 3), 0, -a, 0)), R);
          // ống dẫn sóng từ ăng-ten về thang cáp chân tháp
          K.beam('rubber', [px, y - 2, pz], [w(y) - 1, y - 6, w(y) - 1], 0.6, base);
        }
        K.beam('steelDark', [w0 - 2.5, 8, w0 - 2.5], [w1 - 1.5, 340, w1 - 1.5], 2.6, base);   // thang cáp dọc chân tháp
        for (const [x, z] of [[1, 1], [-1, -1]]) { K.add('lampRed', new THREE.SphereGeometry(1, 8, 6), mul(base, M4(x * w1, H + 1.5, z * w1))); K.add('lampRed', new THREE.SphereGeometry(0.9, 8, 6), mul(base, M4(x * (w(180) + 0.8), 180, z * (w(180) + 0.8)))); }
        K.cyl('steelGray', mf, H + 1, mr, 0.3, 0.6, 24, 6);
        K.add('lampRed', new THREE.SphereGeometry(1.4, 8, 6), M4(mf, H + 26, mr));
        // nhà trạm (khung tôn) + điều hoà + cầu cáp ngang từ chân tháp
        const sf = mf + 58, sr = mr - 6;
        K.cbox('concDark', sf, 0.6, sr, 36, 1.6, 28, 0.3);
        K.box('corrTan', sf, 11.5, sr, 32, 21, 24);
        K.cbox('steelGray', sf, 22.6, sr, 34, 1.4, 26, 0.3);
        K.box('steelGray', sf + 16.3, 8.5, sr - 5, 0.6, 15, 7);
        K.plane(rfMat(), sf + 16.4, 10, sr + 5, 5, 6.25);
        K.cbox('steelWhite', sf + 4, 8, sr + 13.6, 9, 9, 3.2, 0.3);
        K.add('void', new THREE.CircleGeometry(3, 14), M4(sf + 4, 8, sr + 15.25));
        const ib0 = mf + w0 - 2, ib1 = sf - 16;
        K.box('steelDark', (ib0 + ib1) / 2, 15, mr + 4, ib1 - ib0, 0.6, 3.6);
        for (const f of [ib0 + 4, (ib0 + ib1) / 2, ib1 - 3]) K.cyl('steelGray', f, 0, mr + 4, 0.5, 0.6, 15, 6);
        K.solid(mf, mr, w0 + 2, w0 + 2, 0, 120); K.solid(mf, mr, w(120) + 1, w(120) + 1, 120, H + 4);
        K.solid(sf, sr, 17, 13, 0, 24);
      }
      // ---- RADAR CẢNH GIỚI trên tháp giàn 19 m: sàn đỉnh, bệ quay, mặt phản xạ cong kép, loa thu trên cần, thanh ăng-ten
      //      hỏi đáp IFF phía trên, nhà thiết bị dưới chân; mất điện -> đứng yên
      {
        const { f: sf, r: sr } = POS.srad, H = 150, w0 = 20, w1 = 10, base = M4(sf, 0, sr), az = 2.2;
        lattice(base, H, w0, w1, 6, 'steelGray', 0.8);
        platform(base, H, 17);
        towerLadder(base, H, w0, w1, H);
        K.cyl('steelDark', sf, H + 0.3, sr, 6, 7, 7, 16); K.cyl('steelGray', sf, H + 7.3, sr, 7.5, 7.5, 2, 20);
        const Aa = M4(sf, H + 9.3, sr, 0, -az, 0), atA = (x, y, z, rx, ry, rz) => mul(Aa, M4(x, y, z, rx, ry, rz));
        K.cbox('steelDark', 0, 2, 0, 8, 4, 10, 0.4, 0, Aa);
        // mặt phản xạ cong kép (lưới 12 x 6), 2 mặt
        {
          const NU = 12, NV = 6, W = 76, HH = 30, Fz = 36, pos = [], uv = [], idx = [];
          const S = (i, j) => { const U = (i / NU - 0.5) * W, V = j / NV * HH; return [-6 - U * U / (4 * Fz) - (V - 10) * (V - 10) / 240 - V * 0.12, 4 + V, U]; };
          for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { pos.push(...S(i, j)); uv.push(i / NU * W / 24, j / NV * HH / 24); }
          for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
          K.add('steelGray', twoSided(g), Aa);
          // giàn lưng: 3 thanh ngang theo mặt cong + 5 sườn đứng + thanh chống về bệ
          for (const j of [1, 3, 5]) for (let i = 0; i < NU; i++) { const p = S(i, j), q = S(i + 1, j); K.beam('steelDark', [p[0] - 2, p[1], p[2]], [q[0] - 2, q[1], q[2]], 0.6, Aa); }
          for (const i of [0, 3, 6, 9, 12]) for (let j = 0; j < NV; j++) { const p = S(i, j), q = S(i, j + 1); K.beam('steelDark', [p[0] - 1.2, p[1], p[2]], [q[0] - 1.2, q[1], q[2]], 0.6, Aa); }
          for (const i of [3, 9]) for (const j of [1, 5]) { const p = S(i, j); K.beam('steelDark', [p[0] - 2, p[1], p[2]], [-1, 3, 0], 0.7, Aa); }
          // cần loa thu + loa hình chóp cụt
          for (const z of [-2, 2]) K.beam('steelGray', [2, 1, z], [Fz * 0.75 - 4, 7, 0], 0.7, Aa);
          K.add('steelGray', new THREE.CylinderGeometry(4.4, 1.4, 7, 4), atA(Fz * 0.75 - 4, 7, 0, 0, 0, Math.PI / 2));
          // thanh ăng-ten IFF trên đỉnh mặt phản xạ
          const top = S(NU / 2, NV);
          K.cbox('steelWhite', top[0] - 1, top[1] + 4, 0, 3, 5, 72, 0.4, 0, Aa);
          for (let z = -32; z <= 32; z += 8) K.add('steelDark', new THREE.BoxGeometry(2, 0.6, 0.6), atA(top[0] + 1.2, top[1] + 4, z));
        }
        // nhà thiết bị radar chân tháp + máng cáp lên
        K.cbox('concDark', sf + 38, 0.6, sr, 30, 1.6, 24, 0.3);
        K.box('corrTan', sf + 38, 10, sr, 26, 18, 20);
        K.cbox('steelGray', sf + 38, 19.6, sr, 28, 1.2, 22, 0.3);
        K.box('steelGray', sf + 51.3, 8, sr + 4, 0.6, 14, 6);
        K.box('steelDark', sf + w0 + 1, H / 2, sr + w0 - 3, 1, H, 3);
        K.box('steelDark', sf + w0 + 6, 16, sr + w0 - 3, 12, 0.6, 3);
        K.solid(sf, sr, w0 + 2, w0 + 2, 0, H + 2); K.solid(sf, sr, 40, 40, H + 2, H + 50);
        K.solid(sf + 38, sr, 14, 11, 0, 21);
      }

      // =========================================================================================
      // NHÀ PHÁT ĐIỆN dự phòng: khối bê tông, cửa cuốn + cửa người đi, cửa chớp lấy gió / xả gió, két làm mát quạt + ống
      // giảm thanh + ống xả trên mái, bồn dầu ngày; trạm biến áp có rào
      // =========================================================================================
      {
        const { f: gf, r: gr } = POS.gen, GL = 90, GW = 56, GH = 32, fx = gf + GL / 2;
        K.cbox('conc', gf, GH / 2, gr, GL, GH, GW, 1.2);
        K.cbox('concDark', gf, GH + 1.2, gr, GL + 2, 2.4, GW + 2, 0.4);
        K.box('shutter', fx + 0.3, 11, gr - 8, 0.6, 22, 24);
        K.cbox('steelGray', fx + 1.6, 23.5, gr - 8, 2.6, 3.4, 27, 0.3);
        for (const z of [-20.8, 4.8]) K.box('steelDark', fx + 0.8, 11, gr + z, 1.2, 22, 1.4);
        K.box('steelGray', fx + 0.3, 8.5, gr + 16, 0.6, 17, 8);
        K.cbox('concDark', fx + 4, 19, gr + 16, 8, 1, 14, 0.2);
        K.box('lampAmber', fx + 1, 17.6, gr + 16, 1, 0.8, 2);
        K.cbox('concDark', fx + 6, 0.5, gr - 8, 12, 1, 28, 0.3);
        for (const x of [-30, -6, 18]) { K.box('louver', gf + x, 18, gr - GW / 2 - 0.3, 16, 12, 0.6); K.box('steelDark', gf + x, 18, gr - GW / 2 - 0.1, 17.2, 13.2, 0.3); }
        for (const x of [-24, 0, 24]) K.box('louver', gf + x, 23, gr + GW / 2 + 0.3, 14, 10, 0.6);
        for (const x of [-26, 6]) {
          K.cbox('steelGray', gf + x, GH + 5.4, gr - 10, 22, 6, 18, 0.5);
          for (const dz of [-4.5, 4.5]) for (const dx of [-5.5, 5.5]) {
            K.add('void', new THREE.CircleGeometry(3.6, 14), M4(gf + x + dx, GH + 8.45, gr - 10 + dz, -Math.PI / 2, 0, 0));
            K.box('steelDark', gf + x + dx, GH + 8.6, gr - 10 + dz, 7.4, 0.3, 0.3);
          }
          K.add('steelRust', new THREE.CylinderGeometry(3.2, 3.2, 22, 14), M4(gf + x, GH + 7.5, gr + 14, 0, 0, Math.PI / 2));
          for (const dx of [-8, 8]) K.box('steelDark', gf + x + dx, GH + 3, gr + 14, 1.5, 5, 6);
          K.cyl('steelRust', gf + x + 11, GH + 7.5, gr + 14, 1.4, 1.4, 16, 10);
          K.add('steelRust', new THREE.CylinderGeometry(2.2, 1.7, 1.6, 10), M4(gf + x + 11.3, GH + 24.2, gr + 14, 0, 0, 0.5));
        }
        K.plane(decal('rd_power', signTex('rd_power', ['POWER HOUSE', 'DANGER — HIGH VOLTAGE — HEARING PROTECTION REQUIRED'], { w: 768, h: 192, bg: '#efece2', fg: '#a3221a' })), fx + 0.5, GH - 6, gr + 4, 30, 7.5);
        // bồn dầu ngày nằm trên gối cạnh nhà
        K.add('tankShell', new THREE.CylinderGeometry(5, 5, 22, 16), M4(gf - 10, 9.5, gr + GW / 2 + 9, 0, 0, Math.PI / 2));
        for (const x of [-7, 7]) K.cbox('concDark', gf - 10 + x, 2.5, gr + GW / 2 + 9, 2.4, 5, 9, 0.3);
        K.add('steelGray', new THREE.CylinderGeometry(0.6, 0.6, 9, 6), M4(gf - 2, 9, gr + GW / 2 + 4.5, Math.PI / 2, 0, 0));
        K.solid(gf, gr, GL / 2, GW / 2, 0, GH + 3);
        K.solid(gf - 10, gr + GW / 2 + 9, 12, 6, 0, 15);
        // trạm biến áp: bệ, máy biến áp lá tản nhiệt, sứ cách điện, rào lưới riêng
        const tf = 98, tr = 252;
        K.cbox('conc', tf, 0.6, tr, 22, 1.2, 30, 0.3);
        K.cbox('steelGray', tf, 8, tr, 10, 14, 12, 0.6);
        for (let k = -3; k <= 3; k++) for (const s of [-1, 1]) K.box('steelGray', tf + s * 6, 7.6, tr + k * 1.5, 2.2, 11, 0.3);
        for (const z of [-3.5, 0, 3.5]) { K.cyl('steelGray', tf, 15, tr + z, 0.6, 0.6, 2, 6); for (let j = 0; j < 3; j++) K.cyl('steelWhite', tf, 17 + j * 1.6, tr + z, 1.1, 1.3, 1.2, 8); }
        K.add('steelGray', new THREE.CylinderGeometry(1.8, 1.8, 8, 10), M4(tf - 3, 17, tr, Math.PI / 2, 0, 0));
        fence(K, tf - 14, tr - 19, tf + 14, tr - 19, -1, 13); fence(K, tf - 14, tr + 19, tf + 14, tr + 19, 1, 13);
        fence(K, tf + 14, tr - 19, tf + 14, tr + 19, 1, 13); fence(K, tf - 14, tr - 19, tf - 14, tr - 6, -1, 13); fence(K, tf - 14, tr + 6, tf - 14, tr + 19, -1, 13);
        K.plane(decal('hv_sign', signTex('hv_sign', ['DANGER', 'HIGH VOLTAGE — KEEP OUT'], { w: 512, h: 256, bg: '#efece2', fg: '#a3221a' })), tf + 14.6, 9, tr - 10, 8, 4);
        K.solid(tf, tr, 12, 17, 0, 22);
      }
      // ---- BỒN DẦU DIESEL: 2 bồn nằm trên gối bê tông trong đê bao 1.2 m, sàn thao tác nối 2 nóc bồn + thang, ống thở
      {
        const { f: ff, r: fr } = POS.fuel, bf0 = ff - 52, bf1 = ff + 52, br0 = fr - 44, br1 = fr + 44;
        K.box('concDark', ff, 0.3, fr, bf1 - bf0, 0.6, br1 - br0);
        for (const [a, b, c, d] of [[bf0, br0, bf1, br0], [bf0, br1, bf1, br1], [bf0, br0, bf0, br1], [bf1, br0, bf1, br1]]) {
          const len = Math.hypot(c - a, d - b), vert = a === c;
          K.cbox('conc', (a + c) / 2, 5, (b + d) / 2, vert ? 3 : len + 3, 10, vert ? len + 3 : 3, 0.4);
          K.solid((a + c) / 2, (b + d) / 2, vert ? 2 : len / 2 + 1.5, vert ? len / 2 + 1.5 : 2, 0, 10);
        }
        for (const z of [-20, 20]) {
          K.add('tankShell', new THREE.CylinderGeometry(13, 13, 80, 28, 1, true), M4(ff, 17, fr + z, 0, 0, Math.PI / 2));
          for (const s of [-1, 1]) K.add('steelWhite', new THREE.SphereGeometry(13, 20, 8, 0, TAU, 0, Math.PI / 2), M4(ff + s * 40, 17, fr + z, 0, 0, -s * Math.PI / 2, 1, 0.3, 1));
          for (const x of [-27, 0, 27]) K.cbox('concDark', ff + x, 3.5, fr + z, 5, 7, 22, 0.4);
          for (const x of [-30, 30]) K.add('steelDark', new THREE.TorusGeometry(13.2, 0.4, 4, 28), M4(ff + x, 17, fr + z, 0, Math.PI / 2, 0));
          K.cyl('steelGray', ff - 20, 29.5, fr + z, 0.8, 0.8, 7, 8); K.add('steelGray', new THREE.CylinderGeometry(1.8, 1.8, 1, 8), M4(ff - 20, 37, fr + z));
          K.cyl('steelGray', ff + 10, 29.4, fr + z, 2.4, 2.4, 1.6, 12);
          K.solid(ff, fr + z, 46, 13.5, 0, 31);
        }
        K.box('steelDark', ff + 10, 30.4, fr, 6, 0.6, 30);
        railing([[ff + 13, 30.4, fr - 14], [ff + 13, 30.4, fr + 14]], 8.5, 'yellow'); railing([[ff + 7, 30.4, fr - 14], [ff + 7, 30.4, fr + 14]], 8.5, 'yellow');
        ladder(M4(ff + 16, 0.6, fr, 0, Math.PI / 2, 0), 30, true);
        K.plane(decal('rd_fuel', signTex('rd_fuel', ['DIESEL FUEL', 'FLAMMABLE — NO SMOKING WITHIN 50 FT'], { w: 768, h: 192, bg: '#d9a61c', fg: '#151515' })), bf1 + 1.6, 6, fr - 20, 22, 5.5);
        K.plane(decal('rd_nfpa', texOf('rd_nfpa', 128, 128, (q, w, h) => {
          q.fillStyle = '#f2f0ea'; q.fillRect(0, 0, w, h);
          const cx = w / 2, cy = h / 2, d = 26;
          for (const [dx, dy, col, n] of [[0, -d, '#c8261c', '2'], [-d, 0, '#1f5fb0', '1'], [d, 0, '#e6c41c', '0'], [0, d, '#ffffff', '']]) {
            q.fillStyle = col; q.beginPath(); q.moveTo(cx + dx, cy + dy - d); q.lineTo(cx + dx + d, cy + dy); q.lineTo(cx + dx, cy + dy + d); q.lineTo(cx + dx - d, cy + dy); q.closePath(); q.fill();
            q.strokeStyle = '#111'; q.lineWidth = 2; q.stroke(); q.fillStyle = '#111'; q.font = 'bold 22px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(n, cx + dx, cy + dy + 1);
          }
          A.ageCanvas(q, w, h, 53, 0.8);
        })), bf1 + 1.6, 6, fr + 20, 6, 6);
        // bậc leo qua đê bao
        for (let k = 0; k < 4; k++) K.box('concDark', bf1 + 3 + k * 2.4, 1.25 + k * 2.5, br1 - 12, 2.4, 2.5, 8);
      }

      // ---- SÂN TRỰC THĂNG (trạm núi tiếp tế bằng trực thăng): sân bê tông, vòng chữ H, đèn viền, ống gió, 1 trực thăng
      {
        const { f: hf, r: hr } = POS.heli, a0 = hf - 70, a1 = hf + 70, r0 = hr - 48, r1 = hr + 48;
        K.cbox('conc', hf, 0.4, hr, a1 - a0, 1.4, r1 - r0, 0.5);
        K.add(decalT('rd_heli', texOf('rd_heli', 1024, Math.round(1024 * (r1 - r0) / (a1 - a0)), (q, w, h) => {
          q.clearRect(0, 0, w, h);
          const P = (f, r) => [(f - a0) / (a1 - a0) * w, (r - r0) / (r1 - r0) * h], k = w / (a1 - a0);
          q.strokeStyle = 'rgba(60,58,52,0.55)'; q.lineWidth = 1.5;
          for (let f = a0 + 35; f < a1; f += 35) { const [x] = P(f, 0); q.beginPath(); q.moveTo(x, 0); q.lineTo(x, h); q.stroke(); }
          for (let r = r0 + 32; r < r1; r += 32) { const [, y] = P(0, r); q.beginPath(); q.moveTo(0, y); q.lineTo(w, y); q.stroke(); }
          q.strokeStyle = 'rgba(232,190,40,0.85)'; q.lineWidth = 3 * k; q.strokeRect(...P(a0 + 4, r0 + 4), (a1 - a0 - 8) * k, (r1 - r0 - 8) * k);
          const [cx, cy] = P(hf, hr);
          q.strokeStyle = 'rgba(238,234,222,0.85)'; q.lineWidth = 3.4 * k; q.beginPath(); q.arc(cx, cy, 40 * k, 0, TAU); q.stroke();
          q.fillStyle = 'rgba(238,234,222,0.85)';
          q.fillRect(cx - 18 * k, cy - 3.5 * k, 36 * k, 7 * k); q.fillRect(cx - 18 * k, cy - 22 * k, 7 * k, 44 * k); q.fillRect(cx + 11 * k, cy - 22 * k, 7 * k, 44 * k);
          for (let i = 0; i < 14; i++) A.blotch(q, cx + (hash(i + 177) - 0.5) * 90 * k, cy + (hash(i + 178) - 0.5) * 60 * k, (6 + hash(i + 179) * 12) * k, '30,28,24', 0.35);
        })), new THREE.PlaneGeometry(a1 - a0, r1 - r0), M4(hf, 1.15, hr, -Math.PI / 2, 0, 0));
        for (let f = a0 + 6; f < a1; f += 20) for (const r of [r0 + 3, r1 - 3]) K.box(f % 40 < 20 ? 'lampAmber' : 'lampRed', f, 1.6, r, 1.4, 0.8, 1.4);
        heli(K, M4(hf - 2, 0.6, hr, 0, 0.12, 0));
        K.solid(hf - 4, hr, 62, 11, 0, 34, -0.12);
        K.cyl('steelGray', a1 + 10, 0, r1 - 6, 0.5, 0.7, 30, 6);
        K.add('ochre', new THREE.ConeGeometry(2.4, 12, 10, 1, true), M4(a1 + 16, 29, r1 - 6, 0, 0.6, Math.PI / 2 + 0.3));
      }

      // =========================================================================================
      // CANH PHÒNG: chu vi chung (rào 2 lớp, cổng kiểm soát, cảm biến, nhím thép, đèn), tháp canh, lô cốt, biển tên trạm
      // =========================================================================================
      perimeter(K, kit);
      for (const [f, r] of [[iF - 38, iR - 38], [iF - 38, -(iR - 38)], [iF - 28, G + 40], [iF - 28, -(G + 40)], [-iF + 33, iR - 28]]) tower(f, r);
      for (const [f, r] of [[iF - 34, 262], [iF - 34, -262]]) pillbox(f, r);
      {
        // biển tên trạm trên 2 cột thép trong khu cổng
        const f = 166, r = -78;
        for (const z of [-22, 22]) K.cyl('steelGray', f, 0, r + z, 0.9, 1, 26, 8);
        K.box('steelGray', f - 0.5, 19, r, 0.6, 13, 48);
        K.plane(decal('rd_station', signTex('rd_station', ['SATELLITE TRACKING STATION', 'DEFENSE SATELLITE CONTROL NETWORK — RESTRICTED AREA'], { w: 1024, h: 192, bg: '#1d2a3a', fg: '#ffffff', fg2: '#e8c34a', border: '#d6a51f' })), f - 0.1, 19, r, 46, 8.6);
        K.solid(f, r, 2, 24, 0, 26);
      }

      // ---- XE BỎ LẠI: 2 xe trinh sát + xe tải trong bãi đỗ trước nhà điều hành, xe pháo 30 mm cạnh chảo 9 m
      anim.vehicles.push({ type: 'SCOUT', f: 100, r: -215, a: Math.PI + 0.06, ty: 0.4, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'SCOUT', f: 102, r: -175, a: Math.PI - 0.1, ty: -0.3, hf: 20, hr: 11 });
      anim.vehicles.push({ type: 'ARTILLERY', f: 106, r: -104, a: -Math.PI / 2, chassis: true, hf: 50, hr: 13 });
      anim.vehicles.push({ type: 'GATLING', f: 62, r: 30, a: 0.35, ty: 0.9, hf: 43, hr: 32 });

      buildBatch();
    }
  };
})();
