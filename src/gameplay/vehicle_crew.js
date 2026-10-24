/**
 * KÍP XE TRINH SÁT (2 người: LÁI XE trong cabin + XẠ THỦ đứng ở lỗ nóc vòng súng)
 *
 * Xạ thủ là hình người thật trên vòng súng (quay theo vòng tháp), hai tay bám đúng vị trí bằng IK 2 khớp (vai - khuỷu -
 * bàn tay) nên luôn cầm đúng tay nắm / nắp / hộp đạn / ống tên lửa đang chuyển động:
 *  - Bình thường: hai tay nắm tay cầm súng 12.7mm (theo nòng ngóc / giật)
 *  - THAY HỘP ĐẠN SÚNG MÁY (thủ công): lật nắp khóa nòng, gỡ hộp rỗng thả xuống, cúi xuống khoang lấy hộp mới, đặt vào
 *    khay, sập nắp, kéo tay kéo lên đạn 2 lần
 *  - NẠP TÊN LỬA kiểu TOW (thủ công, ống phóng cố định dùng lại): đứng nhô lên khỏi lỗ nóc, quay sang ống phóng, mở nắp
 *    khóa sau, rút vỏ chứa rỗng ra vứt xuống đất, cúi xuống khoang lấy quả mới, nâng lên đẩy vào ống từ phía sau, đóng
 *    nắp, ngồi về súng. Xe chạy nhanh thì nạp chậm hẳn (phải đứng trên nóc giữ thăng bằng)
 *  - XẠ THỦ HY SINH: gục lên súng; súng máy & tên lửa không còn người điều khiển (vô hiệu), không nạp được nữa
 *  - LÁI XE HY SINH: xe mất khả năng cơ động
 * Thương vong: đạn trúng thẳng hình người xạ thủ (đứng nạp tên lửa thì lộ cả nửa người trên tấm chắn), mảnh nổ gần
 * (nhô người càng cao càng dễ trúng), phát xuyên vào khoang kíp lái. Ghi vào bộ phận đã mất của VehicleDamage
 * ('crewGunner' / 'crewDriver') -> đồng bộ mạng theo bản tóm tắt hư hại như các bộ phận khác.
 */
const VehicleCrew = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const c01 = x => Math.max(0, Math.min(1, x));
  const sm = x => { x = c01(x); return x * x * (3 - 2 * x); };
  const UP = V(0, 1, 0);

  // ---------- HÌNH NGƯỜI ----------
  // Quân phục / mũ bọc vải rằn ri (texture vẽ tay: nền + mảng loang 3 màu), áo giáp & găng trơn
  const MATS = {};
  function camoTex(base, spots) {
    // rằn ri quân đội in sắc nét (512 px, mép mảng sắc như vải in lưới): lớp nền chuyển sắc nhẹ, mảng to méo nhiều
    // thùy, mảng vừa chồng lên, nét "cành" mảnh lượn dài (kiểu MultiCam), đốm nhỏ, cuối cùng hạt vải lấm tấm.
    // Vẽ tuần hoàn qua mép ô (lặp không lộ đường nối)
    const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wrap = (draw, x, y, r) => { for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) if (x + ox > -r * 2 && x + ox < n + r * 2 && y + oy > -r * 2 && y + oy < n + r * 2) draw(x + ox, y + oy); };
    // nền chuyển sắc loang rất nhẹ
    for (let i = 0; i < 18; i++) {
      const x = rnd() * n, y = rnd() * n, r = 60 + rnd() * 90;
      wrap((X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2); }, x, y, r);
    }
    const blob = (x, y, r, el, a0, lobes) => {
      const pts = [];
      for (let k = 0; k < lobes; k++) { const a = k / lobes * Math.PI * 2, rr = r * (0.45 + rnd() * 0.75); pts.push([Math.cos(a + a0) * rr, Math.sin(a + a0) * rr * el]); }
      wrap((X, Y) => {
        g.beginPath();
        // nối các thùy bằng đường cong bậc 2 -> mép mảng mềm mà sắc
        for (let k = 0; k <= pts.length; k++) {
          const p0 = pts[k % pts.length], p1 = pts[(k + 1) % pts.length], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
          k ? g.quadraticCurveTo(X + p0[0], Y + p0[1], X + mx, Y + my) : g.moveTo(X + mx, Y + my);
        }
        g.fill();
      }, x, y, r);
    };
    spots.forEach((col, ci) => {
      g.fillStyle = col;
      const big = ci < 2, cnt = big ? 46 : ci === 2 ? 90 : 150, rMax = big ? 46 : ci === 2 ? 20 : 7;
      for (let i = 0; i < cnt; i++) blob(rnd() * n, rnd() * n, 4 + rnd() * rMax, 0.4 + rnd() * 0.55, rnd() * 6, big ? 13 : 8);
      // nét "cành" mảnh lượn (lớp sẫm thứ 2)
      if (ci === 1) {
        g.strokeStyle = col; g.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          let x = rnd() * n, y = rnd() * n, a = rnd() * 6;
          g.lineWidth = 1.5 + rnd() * 3;
          wrap((X, Y) => {
            g.beginPath(); g.moveTo(X, Y);
            let px = X, py = Y, aa = a;
            for (let k = 0; k < 5; k++) { aa += (rnd() - 0.5) * 1.2; const L = 6 + rnd() * 12; const nx = px + Math.cos(aa) * L, ny = py + Math.sin(aa) * L; g.quadraticCurveTo(px + Math.cos(aa + 0.5) * L * 0.5, py + Math.sin(aa + 0.5) * L * 0.5, nx, ny); px = nx; py = ny; }
            g.stroke();
          }, x, y, 60);
        }
      }
    });
    // Lớp hao mòn chiến trường: bụi đất bám thành mảng mềm, muội dầu nhỏ và vệt bạc màu do cọ xát.
    // Cố ý không phủ đều để quân phục vẫn đọc được họa tiết rằn ri, nhưng mất vẻ sạch/bão hòa như đồ chơi mới.
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 85; i++) {
      const x = rnd() * n, y = rnd() * n, r = 8 + rnd() * 42;
      wrap((X, Y) => {
        const gr = g.createRadialGradient(X, Y, 0, X, Y, r);
        gr.addColorStop(0, `rgba(55,43,28,${0.08 + rnd() * 0.14})`);
        gr.addColorStop(0.65, `rgba(73,60,39,${0.035 + rnd() * 0.08})`);
        gr.addColorStop(1, 'rgba(70,55,35,0)');
        g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2);
      }, x, y, r);
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(190,174,137,0.075)'; g.lineCap = 'round';
    for (let i = 0; i < 45; i++) {
      const x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI * 2, L = 5 + rnd() * 22;
      g.lineWidth = 0.6 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    }
    // hạt vải lấm tấm (sợi in không đều)
    const img = g.getImageData(0, 0, n, n), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const k = (rnd() - 0.5) * 16; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  // Bản đồ pháp tuyến vải: sợi dệt chéo mịn + nếp nhăn mềm ngẫu nhiên (ánh sáng bắt nếp như vải thật, không bóng
  // phẳng như nhựa). Vẽ bản đồ độ cao trên canvas rồi đổi sang pháp tuyến
  let FABRIC_N = null, LEATHER_N = null;
  function normalFromHeight(H, n, strength) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = (i, j) => H[((j + n) % n) * n + ((i + n) % n)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), o = (y * n + x) * 4;
      img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function fabricNormal() {
    if (FABRIC_N) return FABRIC_N;
    const n = 128, H = new Float32Array(n * n);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const folds = [];
    for (let i = 0; i < 9; i++) folds.push([rnd() * n, rnd() * n, rnd() * Math.PI, 6 + rnd() * 14, 0.5 + rnd()]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let h = 0.08 * Math.sin((x + y) * 1.6) * Math.sin((x - y) * 1.6);   // sợi dệt chéo
      for (const [fx, fy, a, w, s] of folds) {
        // nếp nhăn: dải mềm dài, tuần hoàn theo ô texture
        let dx = x - fx, dy = y - fy;
        dx -= Math.round(dx / n) * n; dy -= Math.round(dy / n) * n;
        const across = dx * Math.cos(a) + dy * Math.sin(a), along = -dx * Math.sin(a) + dy * Math.cos(a);
        h += s * Math.exp(-(across * across) / (w * 0.6)) * Math.exp(-(along * along) / (w * w * 9));
      }
      H[y * n + x] = h;
    }
    return (FABRIC_N = normalFromHeight(H, n, 1.4));
  }
  function leatherNormal() {
    if (LEATHER_N) return LEATHER_N;
    const n = 64, H = new Float32Array(n * n);
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n * n; i++) H[i] = rnd() * 0.35;
    return (LEATHER_N = normalFromHeight(H, n, 1.0));
  }
  // mắt kính bảo hộ: tráng màu khói sẫm dần lên trên, vệt phản chiếu bầu trời ngang mắt kính
  let LENS_T = null, GRIME_T = null;
  function grimeTex() {
    if (GRIME_T) return GRIME_T;
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    let seed = 41; const rnd = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 24; i++) {
      const x = rnd() * n, y = rnd() * n, r = 5 + rnd() * 24, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.3 + rnd() * 0.55})`); gr.addColorStop(0.6, 'rgba(205,205,205,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    GRIME_T = new THREE.CanvasTexture(c); GRIME_T.wrapS = GRIME_T.wrapT = THREE.RepeatWrapping;
    return GRIME_T;
  }
  function lensTex() {
    if (LENS_T) return LENS_T;
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, '#0d1418'); gr.addColorStop(0.55, '#24343c'); gr.addColorStop(1, '#3b4a4c');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 32);
    g.fillStyle = 'rgba(190,215,230,0.35)'; g.fillRect(0, 9, 64, 3);
    g.fillStyle = 'rgba(190,215,230,0.15)'; g.fillRect(0, 14, 64, 2);
    return (LENS_T = new THREE.CanvasTexture(c));
  }
  function mats(team) {
    if (MATS[team]) return MATS[team];
    const red = team === 'RED';
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0 }, o));
    // vải (quân phục, áo giáp, túi, khăn): bản đồ pháp tuyến nếp vải
    const cloth = (o) => std(Object.assign({ normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.7, 0.7) }, o));
    // rằn ri đa địa hình kiểu MTP: nền ô liu ngả cát, mảng nâu sẫm + xanh rêu sẫm, đốm cát nhạt
    // màu theo phe: XANH = rằn ri rừng ô liu ngả lạnh (rêu, xanh xám, nâu sẫm), ĐỎ = rằn ri sa mạc ngả ấm (cát, nâu đỏ)
    const camo = camoTex(red ? '#806c50' : '#555b43', red ? ['#553b2b', '#6e573d', '#9b8768', '#30261e'] : ['#343c2d', '#272d24', '#6c745b', '#474b45']);
    return (MATS[team] = {
      uni: cloth({ map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(1.5, 1.5); return t; })() }),
      vest: cloth({ color: red ? 0x40372a : 0x3b3e30, roughness: 0.98, side: THREE.DoubleSide }),
      pouch: cloth({ map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(0.7, 0.7); return t; })(), roughness: 0.9 }),
      grenade: std({ color: 0x343a2b, roughness: 0.82 }),
      band: std({ color: 0x8c7a3c, roughness: 0.75 }),
      smoke: std({ color: 0x45483d, roughness: 0.84 }),
      helm: cloth({ map: camo, color: 0xd0cab8, roughness: 0.96 }),
      helmD: std({ color: red ? 0x3d3324 : 0x343a28, roughness: 0.9 }),
      velcro: cloth({ color: 0x8a7a56, roughness: 1 }),
      skin: std({ color: 0x684735, roughness: 0.9 }),
      skinV: std({ color: 0xc2aa98, vertexColors: true, roughness: 0.88 }),
      // găng chiến thuật sẫm hơn quân phục (ô liu đen / nâu sẫm theo phe), vải tổng hợp + da lòng bàn tay
      glove: std({ color: red ? 0x3a3125 : 0x2c2f24, roughness: 0.93, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.55, 0.55) }),
      gloveP: std({ color: red ? 0x2e271e : 0x23251d, roughness: 0.8, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.4, 0.4) }),
      knuck: std({ color: 0x171714, roughness: 0.82 }),
      pad: std({ color: red ? 0x554a38 : 0x3e4235, roughness: 0.88, side: THREE.DoubleSide, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.3, 0.3) }),
      boot: std({ color: 0x1c1a17 }),
      lens: std({ color: 0x1a2a33, roughness: 0.15, metalness: 0.6 }),
      visor: std({ map: lensTex(), roughness: 0.06, metalness: 0.55, side: THREE.DoubleSide }),
      frame: std({ color: 0x171816, roughness: 0.76 }),
      strap: std({ color: 0x1f1e1a }),
      hair: std({ color: 0x1e1813, roughness: 0.95, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.8, 0.8) }),
      vestD: cloth({ color: red ? 0x463b28 : 0x3c432d, roughness: 0.9, side: THREE.DoubleSide }),
      mag: std({ color: 0x1d1d1a, roughness: 0.82 }),
      patch: cloth({ color: red ? 0x7a3a30 : 0x3a5272, roughness: 0.95 }),   // huy hiệu / cờ theo màu phe
      tq: std({ color: 0x1a1a18, roughness: 0.7 }),
      gaiter: cloth({ map: camoTex(red ? '#94795a' : '#5e6450', red ? ['#73593f', '#b09677'] : ['#454c3b', '#7c836b']), side: THREE.DoubleSide }),
      shell: std({ color: 0x6f6047, roughness: 0.82 }),
      trim: std({ color: 0x3a3428, roughness: 0.8 }),
      web: cloth({ color: 0x80704f, roughness: 0.9 }),
      web2: std({ color: red ? 0x4f4430 : 0x4a4c36, roughness: 0.95, side: THREE.DoubleSide }),
      webD: std({ color: 0x5c4f38, roughness: 0.6 }),
      headset: std({ color: 0x242620, roughness: 0.82 }),
      dust: std({ color: red ? 0x6b5135 : 0x62583e, alphaMap: grimeTex(), transparent: true, opacity: 0.48, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      soot: std({ color: 0x211d18, alphaMap: grimeTex(), transparent: true, opacity: 0.34, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      lip: std({ color: 0x9a6a52 }),
      // hy sinh: quân phục vẫn rằn ri (cùng tỉ lệ vân), chỉ sẫm & ngả đỏ nhẹ (thấm máu, bụi); áo giáp: bản sẫm của chính nó.
      // Trước đây nhân nâu đỏ đậm và thay cả áo giáp trơn bằng vải rằn ri -> cả người như bị nhuộm nâu
      dead: cloth({ map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(1.5, 1.5); return t; })(), color: 0xb89890 }),
      deadVest: cloth({ color: red ? 0x3f3426 : 0x3a3a2a, roughness: 0.9, side: THREE.DoubleSide })
    });
  }

  // khối tròn xoay dạng viên nhộng (three r128 chưa có CapsuleGeometry): đứng dọc +Y từ 0 tới len
  const GEO = {};
  function capsule(r, len, key) {
    if (GEO[key]) return GEO[key];
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, r + Math.sin(a) * r)); }
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, len - r + Math.sin(a) * r)); }
    return (GEO[key] = new THREE.LatheGeometry(pts, 12));
  }
  // Chi tròn xoay theo mặt cắt cơ (đơn vị: chiều dài đoạn chi), nếp vải ngang dồn ở gần khớp
  function limbGeo(kind) {
    const key = 'limb_' + kind;
    if (GEO[key]) return GEO[key];
    const L = kind === 'up' ? ARM_UP : ARM_FORE;
    const prof = kind === 'up'
      ? [[0, -0.05], [0.36, -0.03], [0.5, 0.1], [0.54, 0.3], [0.54, 0.55], [0.51, 0.85], [0.5, 1.15], [0.47, 1.6], [0.42, 2.0], [0.42, 2.3], [0.32, 2.52], [0, 2.58]]
      : [[0, -0.3], [0.3, -0.25], [0.44, -0.05], [0.47, 0.35], [0.45, 0.8], [0.4, 1.3], [0.35, 1.7], [0.33, 2.0], [0.2, 2.12], [0, 2.14]];
    const thick = kind === 'up' ? 1.12 : 1.08;   // bắp tay / cẳng tay to hơn
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0] * thick, q[1] * L / (kind === 'up' ? 2.3 : 2.15))), 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const a = Math.atan2(z, x);
      // nếp vải: dồn mạnh gần khuỷu (đầu dưới cánh tay trên / đầu trên cẳng tay), nhẹ dọc thân tay
      const nearJ = kind === 'up' ? Math.max(0, (y - 1.4) / 1.0) : Math.max(0, 1 - y / 0.9);
      const w = (0.012 + 0.035 * nearJ) * Math.sin(y * 17 + Math.sin(a * 3) * 1.6) + 0.01 * Math.sin(a * 5 + y * 6);
      const k = (r + w) / r;
      p.setXYZ(i, x * k, y, z * k * 0.94);
    }
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  // đoạn ngón tay (viên nhộng) từ a tới b
  function seg(parent, a, b, r, mat) {
    const d = b.clone().sub(a), L = d.length();
    const m = new THREE.Mesh(capsule(r, L + r * 2, 'sg' + r.toFixed(3) + '_' + L.toFixed(3)), mat);
    m.position.copy(a).addScaledVector(d, -r / L);
    m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
    m.castShadow = true;
    parent.add(m);
    (parent.userData.segs || (parent.userData.segs = [])).push(m);
    return m;
  }
  // hộp bo tròn cạnh (áo giáp, túi, ray mũ... — vải / nhựa không có cạnh sắc như khối hộp)
  function rbox(w, h, d) {
    const r = Math.min(0.07, Math.min(w, h, d) * 0.22), key = 'rb' + [w, h, d].map(v => v.toFixed(3)).join('_');
    if (GEO[key]) return GEO[key];
    const iw = w / 2 - r, ih = h / 2 - r, c = r * 0.6;
    const s = new THREE.Shape();
    s.moveTo(-iw + c, -ih); s.lineTo(iw - c, -ih); s.quadraticCurveTo(iw, -ih, iw, -ih + c);
    s.lineTo(iw, ih - c); s.quadraticCurveTo(iw, ih, iw - c, ih); s.lineTo(-iw + c, ih);
    s.quadraticCurveTo(-iw, ih, -iw, ih - c); s.lineTo(-iw, -ih + c); s.quadraticCurveTo(-iw, -ih, -iw + c, -ih);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return (GEO[key] = g);
  }
  // tấm giáp dạng SAPI (chữ nhật vát 2 góc trên) bọc vải, bo cạnh, uốn cong theo bề ngang (bend > 0: mép hai bên
  // lùi về +Z — tấm trước; < 0: tấm sau)
  function plateGeo(w, h, d, bend) {
    // lưới mịn (cột x hàng) -> cả mặt tấm uốn cong đều theo bề ngang (không chỉ mép); 2 góc trên vát kiểu SAPI
    const key = 'pl' + [w, h, d, bend].join('_');
    if (GEO[key]) return GEO[key];
    const NX = 16, NY = 8, cut = 0.55, hw = w / 2, hh = h / 2, pos = [], idx = [];
    const halfAt = (y) => y > hh - cut ? hw - (y - (hh - cut)) * 0.8 : hw;
    const zOf = (x) => bend * (x / hw) * (x / hw);
    for (const side of [-1, 1]) for (let j = 0; j <= NY; j++) {
      const y = -hh + h * j / NY, ha = halfAt(y);
      for (let i = 0; i <= NX; i++) { const x = -ha + 2 * ha * i / NX; pos.push(x, y, zOf(x) + side * d / 2); }
    }
    const R = NX + 1, off = (NY + 1) * R;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a0 = j * R + i, b0 = a0 + R;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);                       // mặt sau (-z)
      idx.push(off + a0, off + b0, off + a0 + 1, off + a0 + 1, off + b0, off + b0 + 1);   // mặt trước (+z)
    }
    // thành mép: nối vòng chu vi giữa 2 mặt
    const ring = [];
    for (let i = 0; i <= NX; i++) ring.push(i);
    for (let j = 1; j <= NY; j++) ring.push(j * R + NX);
    for (let i = NX - 1; i >= 0; i--) ring.push(NY * R + i);
    for (let j = NY - 1; j >= 1; j--) ring.push(j * R);
    for (let k = 0; k < ring.length; k++) {
      const p0 = ring[k], p1 = ring[(k + 1) % ring.length];
      idx.push(p0, off + p0, p1, p1, off + p0, off + p1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  // Mũ high-cut: vòm cầu, mép cắt theo đường cong rim(φ) (φ = 0 phía trước): trước ~ngang trán, hai bên khoét cao chừa
  // chụp tai, sau thấp xuống gáy. Đỉnh dưới đường mép dồn lên mép (ẩn)
  const HEL_R = 1.12, HEL_S = [0.97, 0.95, 1.05], HEL_Y = 0.9;   // vỏ và lớp đệm ôm sát hộp sọ, không tạo khe hở giả ở đỉnh đầu
  // mép: trước -0.08 (sát gọng kính), hai bên 0.08 (vừa chừa chụp tai), sau -0.45 (phủ kín gáy) — mũ sâu, ôm đầu
  // sau gáy -0.65: vỏ ôm hẳn ra sau đầu
  // mép mũ kiểu tactical: các đoạn gần thẳng nối bằng bậc gắt — trước gần phẳng ngang trán, bậc dựng lên khoét tai,
  // đoạn khoét tai phẳng hơi võng, bậc xuống sau tai, sau gáy thấp phẳng
  const step = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const helRim = (phi) => {
    const f = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
    return -0.12 - 0.02 * f + 0.2 * step(f, 0.78, 0.98) - 0.03 * Math.sin(Math.max(0, Math.min(1, (f - 0.98) / 1.12)) * Math.PI) - 0.92 * step(f, 1.68, 2.02);   // sau: hạ sâu ôm hẳn ra sau đầu, phủ gáy
  };
  // vòm vuông vức hơn quả cầu (siêu elip trên mặt bằng): 4 góc chéo phình ra
  const squareK = (phi) => { const c = Math.abs(Math.cos(phi)), sn = Math.abs(Math.sin(phi)); return Math.pow(Math.pow(c, 2.6) + Math.pow(sn, 2.6), -1 / 2.6) * 0.93; };
  // phần vỏ sát mép thu vào trong (cong nhẹ ôm đầu): 0 ở cao trên mép, ~12% ngay mép
  // phía sau thu vào mạnh hơn: ôm sát sau tai / gáy
  const helTuck = (d, phi = 0) => (0.08 + 0.1 * Math.min(1, Math.max(0, 0.25 - Math.cos(phi)))) * Math.pow(Math.max(0, 1 - Math.max(0, d) / 0.55), 2);
  function helmetGeo() {
    if (GEO.helmet) return GEO.helmet;
    const g = new THREE.SphereGeometry(HEL_R, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const phi = Math.atan2(x, -z), rim = helRim(phi), sq = squareK(phi);
      x *= sq; z *= sq;
      if (y < rim) {
        const rr = Math.sqrt(Math.max(0, HEL_R * HEL_R - rim * rim)), h = Math.hypot(x, z) || 1;
        x = x / h * rr * sq; z = z / h * rr * sq; y = rim;
      }
      // vành trước hơi loe, đỉnh hơi dẹt
      const fl = -helTuck(y - rim, phi);   // mép cụp nhẹ vào trong ôm đầu (không loe)
      p.setXYZ(i, x * HEL_S[0] * (1 + fl), (y > 0.8 ? 0.8 + (y - 0.8) * 0.85 : y) * HEL_S[1], z * HEL_S[2] * (1 + fl));
    }
    g.computeVertexNormals();
    return (GEO.helmet = g);
  }
  function helmetRimGeo() {
    if (GEO.helRim) return GEO.helRim;
    const pts = [];
    for (let k = 0; k < 64; k++) {
      const phi = k / 64 * Math.PI * 2, rim = helRim(phi), rr = Math.sqrt(HEL_R * HEL_R - rim * rim) + 0.015;
      pts.push(V(Math.sin(phi) * rr * HEL_S[0], rim * HEL_S[1], -Math.cos(phi) * rr * HEL_S[2]));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, 0.085, 8, true);
    return (GEO.helRim = g);
  }
  // điểm trên mặt vỏ mũ (hệ head): góc φ quanh trục đứng (0 = trước), độ cao y so với tâm vòm, nổi ra ngoài `off`;
  // trả cả pháp tuyến & tiếp tuyến ngang -> gắn phụ kiện ốp sát vỏ
  function helPt(phi, y, off = 0) {
    const rr = Math.sqrt(Math.max(0, HEL_R * HEL_R - y * y));
    const yy = y > 0.8 ? 0.8 + (y - 0.8) * 0.85 : y;
    const sq = squareK(phi) * (1 - helTuck(y - helRim(phi), phi));
    const P = V(Math.sin(phi) * rr * sq * HEL_S[0], yy * HEL_S[1], -Math.cos(phi) * rr * sq * HEL_S[2]);
    const n = V(P.x / (HEL_S[0] * HEL_S[0]), P.y / (HEL_S[1] * HEL_S[1]), P.z / (HEL_S[2] * HEL_S[2])).normalize();
    const t = V(Math.cos(phi), 0, Math.sin(phi));
    t.addScaledVector(n, -t.dot(n)).normalize();
    P.addScaledVector(n, off).add(V(0, HEL_Y, 0.07));
    return { p: P, n, t };
  }
  // đường may / dây chạy trên vỏ mũ qua các điểm [φ, y]
  function helLine(pts, off, r) {
    const key = 'hl' + JSON.stringify(pts) + off + r;
    if (GEO[key]) return GEO[key];
    return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([f, y]) => helPt(f, y, off).p)), pts.length * 8, r, 4, false));
  }
  // dải tấm ốp liền mạch bám mặt vỏ mũ: chạy theo φ từ f0 -> f1, mép dưới / trên = lo(φ) / hi(φ), dày `th`
  // (2 lớp + gờ mép) — ray ARC, cánh ray
  function helRibbon(key, f0, f1, lo, hi, off, th) {
    if (GEO[key]) return GEO[key];
    const N = 24, pos = [], idx = [];
    const ring = (f, k) => [helPt(f, lo(f), off + k).p, helPt(f, hi(f), off + k).p];
    for (let i = 0; i <= N; i++) {
      const f = f0 + (f1 - f0) * i / N;
      const [a0, b0] = ring(f, 0), [a1, b1] = ring(f, th);
      pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
    }
    for (let i = 0; i < N; i++) {
      const o = i * 4, q = o + 4;
      // mặt ngoài (lớp th), mặt trong, gờ dưới, gờ trên
      idx.push(o + 2, q + 2, o + 3, o + 3, q + 2, q + 3);
      idx.push(o, o + 1, q, o + 1, q + 1, q);
      idx.push(o, q, o + 2, o + 2, q, q + 2);
      idx.push(o + 1, o + 3, q + 1, o + 3, q + 3, q + 1);
    }
    const e = N * 4;   // nắp hai đầu
    idx.push(0, 2, 1, 1, 2, 3, e, e + 1, e + 2, e + 1, e + 3, e + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  // dây dệt dẹt theo đường cong: mặt cắt chữ nhật rộng w, dày t; mặt dây úp theo pháp tuyến ra ngoài thân / lên trên
  function strapGeo(curve, w, t, key, core = V(0, 2.6, 0)) {
    if (GEO[key]) return GEO[key];
    const N = 24, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, P = curve.getPointAt(u), T = curve.getTangentAt(u);
      const out = P.clone().sub(core).normalize();   // hướng ra ngoài từ lõi (thân / đầu)
      const side = V().crossVectors(T, out).normalize(), nrm = V().crossVectors(side, T).normalize();
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const q = P.clone().addScaledVector(side, a * w / 2).addScaledVector(nrm, b * t / 2);
        pos.push(q.x, q.y, q.z);
      }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  // viền bọc mép tấm giáp: ống chạy theo chu vi tấm SAPI (cùng hệ toạ độ & độ uốn như plateGeo)
  function plateBindGeo(w, h, d, bend) {
    const key = 'pb' + [w, h, d, bend].join('_');
    if (GEO[key]) return GEO[key];
    const x = w / 2 - 0.02, y = h / 2 - 0.02, cut = 0.55, xt = x - cut * 0.8;
    const ol = [[-x, -y], [x, -y], [x, y - cut], [xt, y], [-xt, y], [-x, y - cut]], pts = [];
    for (let i = 0; i < ol.length; i++) {
      const a = ol[i], b = ol[(i + 1) % ol.length];
      for (let k = 0; k < 6; k++) { const u = k / 6, px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u; pts.push(V(px, py, bend * (px / (w / 2)) * (px / (w / 2)))); }
    }
    return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.1), 72, d * 0.32, 5, true));
  }
  // Mắt kính: đường viền vẽ phẳng (u ngang theo cung, v dọc) rồi quấn lên mặt trụ ôm mặt (bán kính GL_R quanh trục
  // đứng của đầu), cong thêm theo chiều dọc. sx = -1 trái / 1 phải
  const GL_R = 1.0, GL_Y = 0.84, GL_C = 0.3, GL_W = 0.5, GL_H = 0.3;
  function glWrap(sx, u, v, off = 0) {
    const a = sx * (GL_C + u / GL_R), r = GL_R + off - 0.35 * v * v;
    return V(Math.sin(a) * r * 0.95, GL_Y + v, -Math.cos(a) * r * 1.03);
  }
  function lensOutline() {
    // trên phẳng hơi xếch ra ngoài, dưới tròn, góc trong-dưới vát theo sống mũi (u < 0 là phía mũi)
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24 * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      let u = c * GL_W / 2, v = sn * GL_H / 2;
      v = sn > 0 ? Math.pow(sn, 0.35) * GL_H / 2 + u * 0.08 : -Math.pow(-sn, 0.8) * GL_H / 2;
      if (u < -0.12 && v < 0) v += (-0.12 - u) * 0.6;
      pts.push([u, v]);
    }
    return pts;
  }
  function lensGeo(sx) {
    const key = 'lens' + sx;
    if (GEO[key]) return GEO[key];
    const ol = lensOutline(), shape = new THREE.Shape(ol.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ShapeGeometry(shape, 8), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i), w = glWrap(sx, u, v);
      p.setXYZ(i, w.x, w.y, w.z);
      uv.setXY(i, u / GL_W + 0.5, v / GL_H + 0.5);
    }
    if (sx < 0) g.index.array.reverse();   // quấn đối xứng làm lật mặt tam giác: đảo lại cho mặt ngoài quay ra
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  // gọng: viền ôm chu vi 2 mắt kính (mép trên dày) + cầu mũi nối 2 mắt
  function glassFrameGeo() {
    if (GEO.gframe) return GEO.gframe;
    const geos = [];
    for (const sx of [-1, 1]) {
      const ol = lensOutline().slice(0, -1);
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ol.map(([u, v]) => glWrap(sx, u, v, 0.012)), true), 48, 0.022, 4, true));
      const top = [];
      for (let i = 2; i <= 10; i++) { const [u, v] = ol[i]; top.push(glWrap(sx, u, v + 0.015, 0.02)); }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 16, 0.04, 5, false));
    }
    const br = new THREE.CatmullRomCurve3([glWrap(-1, -GL_W / 2 + 0.02, 0.1, 0.02), V(0, GL_Y + 0.08, -GL_R * 1.03 - 0.04), glWrap(1, -GL_W / 2 + 0.02, 0.1, 0.02)]);
    geos.push(new THREE.TubeGeometry(br, 10, 0.035, 5, false));
    return (GEO.gframe = mergeGeos(geos));
  }
  // goggle: viền ngoài bo tròn rộng ~ cả bề ngang mặt, mép dưới khoét chỗ sống mũi; quấn lên trụ ôm mặt
  const GG = { R: 1.06, Y: 0.66, W: 1.78, H: 0.44 };
  function ggWrap(u, v, off = 0) {
    const a = u / GG.R, r = GG.R + off - 0.3 * v * v - 0.05 * Math.pow(Math.abs(u), 3) + 0.06 * Math.exp(-(u / 0.4) * (u / 0.4));   // giữa kính hơi nhô trước sống mũi
    return V(Math.sin(a) * r * 0.95, GG.Y + v, -Math.cos(a) * r * 1.02);
  }
  function ggOutline(inset = 0) {
    const pts = [], hw = GG.W / 2 - inset, hh = GG.H / 2 - inset;
    for (let i = 0; i < 48; i++) {
      const t = i / 48 * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      // chữ nhật dẹt bo góc nhỏ
      const u = Math.sign(c) * Math.pow(Math.abs(c), 0.15) * hw;
      let v = Math.sign(sn) * Math.pow(Math.abs(sn), 0.18) * hh;
      if (v < 0) v += 0.2 * Math.exp(-Math.pow(Math.abs(u) / 0.17, 1.6)) * Math.pow(-v / hh, 0.5);   // khoét cong ôm sống mũi
      v -= 0.05 * (u / hw) * (u / hw);                                           // xếch xuống hai bên
      pts.push([u, v]);
    }
    return pts;
  }
  // KÍNH kiểu ESS Crossbow: một tấm mắt kính liền; mép trên thẳng nằm dưới thanh gọng; mép dưới mỗi bên lượn tròn
  // xuống má, giữa khoét vòm chữ U đỡ trên sống mũi. Dựng lưới (cột u x hàng v) giữa mép trên & mép dưới -> không gấp
  // mép như cắt hình phẳng
  const ggBottom = (u) => {
    const hw = GG.W / 2, x = Math.abs(u) / hw;
    const lobe = -GG.H / 2 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (x - 0.55) / 0.45), 2)));  // tròn về hai đầu
    const nose = GG.H * 0.55 * Math.exp(-Math.pow(Math.abs(u) / 0.14, 2.2));                           // vòm mũi
    return Math.min(GG.H / 2 - 0.04, lobe + nose);
  };
  function goggleLensGeo() {
    if (GEO.ggLens) return GEO.ggLens;
    const NU = 40, NV = 6, hw = GG.W / 2, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = -hw + 2 * hw * i / NU, vb = ggBottom(u), vt = GG.H / 2;
      for (let j = 0; j <= NV; j++) {
        const v = vb + (vt - vb) * j / NV, w = ggWrap(u, v);
        pos.push(w.x, w.y, w.z); uv.push(i / NU, (v + GG.H / 2) / GG.H);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + NV + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO.ggLens = g);
  }
  function goggleFrameGeo() {
    if (GEO.ggFrame) return GEO.ggFrame;
    const hw = GG.W / 2, top = [];
    for (let i = 0; i <= 24; i++) { const u = -hw - 0.02 + (2 * hw + 0.04) * i / 24; top.push(ggWrap(u, GG.H / 2 + 0.03, 0.03)); }
    // thanh gọng trên bản rộng dẹt + gờ dày ở hai đầu (khớp càng), đệm mũi chữ U ôm vòm mũi
    const geos = [strapGeo(new THREE.CatmullRomCurve3(top), 0.13, 0.05, 'ggBrow', V(0, GG.Y, 0.3))];
    const pad = [];
    for (let i = 0; i <= 12; i++) { const u = -0.17 + 0.34 * i / 12; pad.push(ggWrap(u, ggBottom(u) + 0.015, -0.02)); }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pad), 16, 0.025, 5, false));
    return (GEO.ggFrame = mergeGeos(geos));
  }
  function mergeGeos(list) {
    // ghép nhiều BufferGeometry (cùng thuộc tính position/normal/uv, có index) thành một
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      if (g.attributes.uv) uvs.set(g.attributes.uv.array, ov * 2);
      if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov; oi += g.index.count; }
      else { for (let i = 0; i < c; i++) idx[oi + i] = ov + i; oi += c; }
      ov += c;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  }
  // MẶT nặn từ quả cầu: kéo dài dọc, hàm thon dần xuống cằm, sống mũi + đầu mũi, hốc mắt lõm, gò mày, gò má, cằm.
  // Mặt nhìn về -Z
  const FACE_LOW = 1.62;
  function faceGeo() {
    if (GEO.face) return GEO.face;
    // khuôn mặt nam: mặt trước phẳng hơn quả cầu, sống mũi thẳng + đầu mũi + 2 cánh mũi, nhân trung, môi trên / dưới,
    // khe miệng, rãnh dưới môi, cằm vuông, đường hàm, gò má. Màu da theo đỉnh: môi hồng sẫm, râu lún phún xanh xám ở
    // hàm / cằm / mép, má hơi ửng, hốc mắt tối
    const g = new THREE.SphereGeometry(0.9, 44, 34), p = g.attributes.position, col = [];
    const G2 = (a, s) => Math.exp(-(a / s) * (a / s));
    const skin = [0.5, 0.35, 0.26];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const yn = y / 0.9;
      x *= 0.84; y *= y < 0 ? FACE_LOW : 1.12;   // nửa dưới mặt kéo dài (mặt dài, có cằm)
      if (yn < 0) { const t = Math.pow(-yn, 1.5); x *= 1 - 0.22 * t - 0.04 * t * t; z *= 1 - 0.08 * t; }   // mặt chữ V: hàm thon dần về cằm
      let c = skin.slice();
      if (z < 0) {
        const ax = Math.abs(x);
        z *= 0.97 + 0.03 * Math.min(1, ax / 0.6);                       // mặt trước nhô (không bẹt)
        z -= (0.1 + 0.12 * Math.max(0, Math.min(1, (0.1 - y) / 0.3))) * G2(x, 0.06) * G2(y + 0.12, 0.2);   // sống mũi (cao dần xuống)
        z -= 0.14 * G2(x, 0.075) * G2(y + 0.3, 0.075);                  // đầu mũi
        z -= 0.09 * G2(ax - 0.1, 0.05) * G2(y + 0.34, 0.05);            // cánh mũi
        z += 0.05 * G2(ax - 0.17, 0.03) * G2(y + 0.31, 0.08);           // rãnh cánh mũi
        z += 0.03 * G2(ax - 0.08, 0.03) * G2(y + 0.36, 0.025);          // lỗ mũi
        z += 0.015 * G2(x, 0.03) * G2(y + 0.36, 0.04);                  // nhân trung
        z -= 0.08 * G2(x, 0.19) * G2(y + 0.43, 0.04);                   // môi trên
        z += 0.05 * G2(x, 0.18) * G2(y + 0.48, 0.012);                  // khe miệng
        z -= 0.075 * G2(x, 0.16) * G2(y + 0.53, 0.045);                 // môi dưới
        z += 0.04 * G2(ax - 0.21, 0.03) * G2(y + 0.48, 0.04);           // khoé miệng
        z += 0.04 * G2(ax - 0.27, 0.05) * G2(y + 0.3, 0.13);            // rãnh mũi má
        z += 0.035 * G2(x, 0.16) * G2(y + 0.64, 0.045);                 // rãnh dưới môi
        z -= 0.15 * G2(x, 0.36) * G2(y + 1.05, 0.16);
        z -= 0.08 * G2(x, 0.32) * G2(y + 0.72, 0.28);   // miệng / cằm nhô ra trước                   // cằm vuông nhô
        z += 0.03 * G2(x, 0.3) * G2(y + 1.3, 0.08);                     // dưới cằm thụt vào cổ
        z -= 0.05 * G2(ax - 0.5, 0.12) * G2(y + 0.82, 0.16);            // góc hàm
        z += 0.07 * G2(ax - 0.3, 0.14) * G2(y - 0.12, 0.1);             // hốc mắt
        z -= 0.05 * G2(ax - 0.28, 0.24) * G2(y - 0.27, 0.07);           // gò mày
        z -= 0.05 * G2(ax - 0.47, 0.15) * G2(y + 0.02, 0.13);           // gò má
        z += 0.03 * G2(ax - 0.36, 0.1) * G2(y + 0.32, 0.12);            // má hóp dưới gò má
        const lip = G2(x, 0.19) * (G2(y + 0.42, 0.04) + G2(y + 0.52, 0.045));
        const beard = Math.min(1, Math.max(0, (-y - 0.4) * 2.2)) * (0.6 + 0.4 * Math.min(1, ax / 0.4)) * (1 - lip);
        const blush = G2(ax - 0.42, 0.18) * G2(y + 0.15, 0.15);
        const sock = G2(ax - 0.3, 0.15) * G2(y - 0.12, 0.1);
        c = [c[0] - 0.08 * lip - 0.2 * beard - 0.12 * sock + 0.04 * blush, c[1] - 0.15 * lip - 0.17 * beard - 0.12 * sock - 0.03 * blush, c[2] - 0.12 * lip - 0.1 * beard - 0.1 * sock - 0.03 * blush];
      } else {
        const beard = Math.min(1, Math.max(0, (-y - 0.4) * 2.2)) * Math.max(0, 1 - z / 0.5);
        c = [c[0] - 0.18 * beard, c[1] - 0.15 * beard, c[2] - 0.08 * beard];
      }
      // bóng đổ dưới vành mũ & quanh kính: da tối dần lên trên thái dương / trán
      const ao = 1 - 0.35 * Math.min(1, Math.max(0, (y - 0.05) / 0.35));
      p.setXYZ(i, x, y, z);
      col.push(c[0] * ao, c[1] * ao, c[2] * ao);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return (GEO.face = g);
  }
  // tóc: cùng khối sọ như mặt (nặn giống faceGeo, bỏ chi tiết mặt), nổi lên một lớp mỏng; chỉ giữ phần sau / hai
  // bên / đỉnh, mép tóc trước ở thái dương, chân tóc gáy thấp sau tai
  function hairGeo() {
    if (GEO.hair) return GEO.hair;
    const g = new THREE.SphereGeometry(0.9, 40, 30), p = g.attributes.position, keep = [];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const yn = y / 0.9;
      x *= 0.84; y *= y < 0 ? FACE_LOW : 1.12;
      if (yn < 0) { const t = Math.pow(-yn, 1.5); x *= 1 - 0.22 * t - 0.04 * t * t; z *= 1 - 0.08 * t; }
      if (z < 0) z *= 0.9 + 0.1 * Math.min(1, Math.abs(x) / 0.6);
      const r = Math.hypot(x, z) || 1, k = (r + 0.025) / r;
      x *= k; z *= k; y += 0.02;
      p.setXYZ(i, x, y, z);
      // mép tóc: phía trước (z < 0) chỉ ở trên trán cao + thái dương ngoài má; sau gáy xuống tới chân tóc
      const side = Math.abs(x) / (r || 1);
      const lim = z < 0 ? (side > 0.72 ? -0.2 : side > 0.55 ? 0.2 : 0.62) : -0.48 + 0.22 * Math.max(0, side - 0.6);
      keep.push(y > lim);
    }
    const idx = g.index.array, out = [];
    for (let t = 0; t < idx.length; t += 3) if (keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex(out);
    g.computeVertexNormals();
    return (GEO.hair = g);
  }
  // cổ + khăn quấn cổ: tròn xoay theo mặt cắt (loe rộng ở gốc cổ phủ lên cổ áo -> thon lên dưới hàm), nhìn ngang hơi
  // ngả về trước như cổ người; nếp vải chùng xuống thành vòng lượn không đều (không phải vòng tròn đều)
  function neckGeo() {
    if (GEO.neck) return GEO.neck;
    // cổ người ~12 cm + khăn mỏng: r ~0.5; chỉ loe ở gốc (cơ thang) chui dưới cổ áo. Bản cũ r 0.64 -> 0.53 suốt cổ: ống phồng như phao
    const prof = [[0.0, 3.28], [0.62, 3.3], [0.55, 3.4], [0.48, 3.52], [0.44, 3.66], [0.42, 3.78], [0.0, 3.8]];
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 28), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const h = Math.max(0, Math.min(1, (y - 3.3) / 0.5));
      // nếp chùng: lượn theo góc (thấp ở trước, cao ở sau), biên độ lớn ở dưới
      const fold = (0.014 + 0.012 * (1 - h)) * Math.sin(y * 24 + 2.2 * Math.sin(a) + Math.sin(a * 3) * 0.8);
      const k = (r + fold) / r;
      x *= k; z *= k * 0.9;
      z -= 0.07 * h;   // cổ chỉ ngả nhẹ về trước, không chui sâu vào hàm
      p.setXYZ(i, x, y, z);
      // UV theo kích thước thật (họa tiết rằn ri cùng cỡ với áo, không bị kéo dài ngang thành vệt sọc)
      g.attributes.uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 3.4 * 0.55, y * 0.55);
    }
    g.computeVertexNormals();
    return (GEO.neck = g);
  }
  // CỔ ÁO quân phục thường: vành vải mỏng ôm gốc cổ, cao hơn chút sau gáy, hở chữ V phía trước; mép trên gập viền gọn.
  // (trước đây là cổ giáp độn dày ~0.2 + cuộn mép 0.17, dựng cao sau gáy -> nhìn như phao cổ.) Quét mặt cắt (tường mỏng +
  // mép tròn nhỏ) quanh cổ theo góc φ (φ = 0 phía trước, -Z), hai đầu ở cổ trước thu tròn lại
  const COLLAR_GAP = 0.55;
  function collarCurve(f) {
    const bk = (1 - Math.cos(f)) / 2;   // 0 trước -> 1 sau gáy
    // ôm sát cổ (khăn quấn cổ r ~0.6 ở y 3.7): mép trên chỉ cách cổ ~0.04, chân cổ áo đặt trên gốc cổ — không đứng cách
    // cổ như cái phễu (trước đây r 1.0 -> 0.8, nhìn từ trên xuống thành vành phao dày)
    // Sau gáy thấp và đổ ra vai như vải thật; gợn nhẹ phá đường viền tròn đều kiểu vòng nhựa.
    const wrinkle = Math.sin(f * 3 + 0.45) * 0.018 * (0.35 + 0.65 * bk);
    return { bk, yB: 3.38 - 0.04 * bk, yT: 3.58 + 0.065 * Math.pow(bk, 0.8) + wrinkle, rB: 0.76 + 0.035 * bk, rT: 0.59 + 0.025 * bk };
  }
  const collarXZ = (f, r) => [Math.sin(f) * r, -Math.cos(f) * r * 0.86 + 0.08];
  function collarGeo() {
    if (GEO.collar) return GEO.collar;
    const NA = 44, K = 6, NS = 9, f0 = COLLAR_GAP, f1 = Math.PI * 2 - COLLAR_GAP;
    const pos = [], uv = [], idx = [];
    let NC = 0;
    for (let i = 0; i <= NA; i++) {
      const f = f0 + (f1 - f0) * i / NA, C = collarCurve(f);
      // mặt cắt (r, y): vải mỏng ~0.08 từ chân B lên đỉnh T, mép gập viền tròn nhỏ; nếp vải lượn rất nhẹ
      const dr = C.rT - C.rB, dy = C.yT - C.yB, L = Math.hypot(dr, dy), d = [dr / L, dy / L], n = [d[1], -d[0]];
      const quilt = 0.006 * Math.pow(Math.abs(Math.sin(f * 5)), 0.6), w = 0.04 + quilt, rho = 0.055 + quilt * 0.5, Lc = L - rho;
      const h = l => w + (rho - w) * sm((l - (Lc - 0.1)) / 0.1);
      const ct = [];
      for (let j = 0; j < K; j++) { const l = Lc * j / K; ct.push([C.rB + d[0] * l - n[0] * h(l), C.yB + d[1] * l - n[1] * h(l)]); }
      const cr = C.rB + d[0] * Lc, cy = C.yB + d[1] * Lc;
      for (let j = 0; j < NS; j++) { const t = Math.PI * j / (NS - 1); ct.push([cr - n[0] * rho * Math.cos(t) + d[0] * rho * Math.sin(t), cy - n[1] * rho * Math.cos(t) + d[1] * rho * Math.sin(t)]); }
      for (let j = K - 1; j >= 0; j--) { const l = Lc * j / K; ct.push([C.rB + d[0] * l + n[0] * h(l), C.yB + d[1] * l + n[1] * h(l)]); }
      // hai đầu cổ trước: mặt cắt thu dần về tâm thành đầu tròn
      const e = Math.min(1, Math.min(f - f0, f1 - f) / 0.28), sc = Math.sqrt(1 - (1 - e) * (1 - e));
      const mr = (C.rB + cr) / 2, my = (C.yB + cy) / 2;
      let arc = 0;
      ct.forEach((q, j) => {
        const r = mr + (q[0] - mr) * sc, y = my + (q[1] - my) * sc;
        if (j) arc += Math.hypot(q[0] - ct[j - 1][0], q[1] - ct[j - 1][1]);
        const [x, z] = collarXZ(f, r);
        pos.push(x, y, z);
        uv.push(f * 0.9 * 0.55, arc * 0.55);   // UV theo kích thước thật (rằn ri cùng cỡ với áo)
      });
      NC = ct.length;
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NC; j++) {
      const a = i * NC + j, b = a + NC, c = i * NC + (j + 1) % NC, dd = c + NC;
      idx.push(a, b, c, b, dd, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO.collar = g);
  }
  // viền bọc mép cổ áo: dải băng dệt chạy dọc đỉnh cuộn
  function collarBindGeo() {
    if (GEO.collarBind) return GEO.collarBind;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const f = COLLAR_GAP + 0.12 + (Math.PI * 2 - 2 * COLLAR_GAP - 0.24) * i / 40, C = collarCurve(f);
      const [x, z] = collarXZ(f, C.rT - 0.02);
      pts.push(V(x, C.yT + 0.01, z));
    }
    return (GEO.collarBind = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.022, 5, false));
  }
  // tai: vành tai, hõm tai, dái tai
  function earGeo() {
    if (GEO.ear) return GEO.ear;
    const g = new THREE.SphereGeometry(0.2, 14, 10), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      x *= 0.16; y *= 1.45; z *= 0.85;   // vành tai mỏng
      const r = Math.hypot(y / 0.29, z / 0.17);
      if (x > 0 && r < 0.75) x -= 0.025 * (1 - r / 0.75);               // hõm tai
      if (y < -0.18) z *= 0.8;                                         // dái tai
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return (GEO.ear = g);
  }
  // khăn che mặt: ống vải ôm từ cổ lên sống mũi, phồng ra ở mũi & cằm, nếp vải ngang
  function gaiterGeo() {
    // khăn ôm theo mặt: dựng lại khối mặt giản lược (hàm, cằm, sống mũi, đầu mũi — bỏ chi tiết môi / lỗ mũi) rồi đẩy
    // ra ngoài một lớp vải; chỉ giữ phần dưới sống mũi (mặt trước) / dưới mép mũ (sau gáy). Nếp vải ngang ở cổ & cằm
    if (GEO.gaiter) return GEO.gaiter;
    const g = new THREE.SphereGeometry(0.9, 40, 30), p = g.attributes.position;
    const G2 = (a, s) => Math.exp(-(a / s) * (a / s)), keep = [];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const yn = y / 0.9;
      x *= 0.84; y *= y < 0 ? FACE_LOW : 1.12;
      if (yn < 0) { const t = Math.pow(-yn, 1.5); x *= 1 - 0.22 * t - 0.04 * t * t; z *= 1 - 0.08 * t; }
      if (z < 0) {
        const ax = Math.abs(x);
        z *= 0.97 + 0.03 * Math.min(1, ax / 0.6);
        // mũi dưới khăn: sống hẹp (~1/4 bề ngang mặt) cao dần từ dưới kính xuống đầu mũi, đầu mũi tròn gọn; vải từ đầu
        // mũi căng chéo xuống môi / cằm (không ôm lõm vào nhân trung) và loe sang hai bên má thành mặt phẳng vải.
        // (trước đây khối mũi rộng σ 0.13 + sống mũi kéo dài σ 0.22 -> nhìn nghiêng thành cái mõm vát.)
        const tipY = -0.38, below = Math.max(0, tipY - y);
        z -= (0.15 + 0.07 * Math.max(0, Math.min(1, (0.0 - y) / 0.38))) * G2(x, 0.07) * G2(y + 0.16, 0.25);   // sống mũi
        z -= 0.11 * G2(x, 0.08) * G2(y - tipY, 0.08);                  // đầu mũi
        z -= 0.05 * G2(Math.abs(x) - 0.09, 0.06) * G2(y + 0.41, 0.06); // cánh mũi
        z -= 0.12 * Math.exp(-below / 0.45) * G2(x, 0.11 + 0.35 * below) * (below > 0 ? 1 : G2(y - tipY, 0.08));   // vải căng từ đầu mũi xuống
        // nửa dưới khối cầu cong vào rất nhanh -> bù miệng / cằm ra trước để mặt nghiêng gần thẳng đứng dưới mũi (không vát mỏ)
        z -= 0.26 * G2(x, 0.34) * G2(y + 1.08, 0.17);                  // cằm nhô rõ dưới khăn
        z -= 0.14 * G2(x, 0.34) * G2(y + 0.7, 0.26);                   // miệng / môi nhô ra trước
        z += 0.14 * G2(x, 0.4) * G2(y + 1.34, 0.1);                   // vải thụt vào dưới cằm (cổ)
        z -= 0.06 * G2(Math.abs(x) - 0.45, 0.12) * G2(y + 0.9, 0.18);  // đường hàm hai bên
      }
      // lớp vải dày, nếp ngang không đều
      const a = Math.atan2(z, x), r = Math.hypot(x, z) || 1;
      const off = 0.07 + 0.02 * Math.sin(y * 26 + Math.sin(a * 2) * 1.4) * Math.min(1, Math.max(0, -y - 0.3)) + 0.008 * Math.sin(a * 7 + y * 9);
      const k = (r + off) / r;
      x *= k; z *= k; y -= y < -1.2 ? 0.05 : 0;
      // mép trên khăn: trước ngang sống mũi (dưới goggle), hai bên dưới tai, sau gáy dưới mép mũ — đỉnh vượt mép thì dồn
      // xuống đúng mép (mép khăn liền mạch, không răng cưa)
      const cut = z < 0 ? -0.2 + 0.22 * Math.exp(-(x / 0.15) * (x / 0.15)) - 0.06 * Math.pow(Math.min(1, Math.abs(x) / 0.75), 3) : -0.3;   // trước: ngay dưới mép kính; sau gáy: kéo cao lên tận mép mũ
      const over = y > cut;
      if (over) y = cut;
      p.setXYZ(i, x, y + 0.72, z);
      g.attributes.uv.setXY(i, (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * 3.0 * 0.55, (y + 0.72) * 0.55);   // UV trụ: rằn ri không bị kéo sọc ở cằm / gáy
      keep.push(!over || true);
    }
    // bỏ tam giác ngoài vùng khăn
    const idx = g.index.array, out = [];
    for (let t = 0; t < idx.length; t += 3) if (keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex(out);
    g.computeVertexNormals();
    return (GEO.gaiter = g);
  }

  // thân người tròn xoay theo mặt cắt (hông -> eo -> ngực -> vai), dẹt trước-sau
  function torsoGeo() {
    if (GEO.torso) return GEO.torso;
    const prof = [[0.0, -2.2], [1.35, -2.2], [1.45, -1.4], [1.3, -0.3], [1.38, 0.6], [1.64, 1.6], [1.8, 2.5], [1.78, 2.86], [1.58, 3.02], [1.05, 3.36], [0.6, 3.64], [0.46, 3.86], [0.0, 3.9]];
    const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0] * 1.02, p[1])), 16);
    g.scale(1, 1, 0.64);
    return (GEO.torso = g);
  }

  // ống vải vai (cơ delta): đứng dọc +Y từ 0 (gốc trên thân, r 0.6) tới 1 (bắp tay, r 0.5) — solveArm kéo dài theo khoảng cách
  function deltGeo() {
    if (GEO.delt) return GEO.delt;
    const prof = [[0.0, -0.08], [0.42, -0.06], [0.58, 0.08], [0.6, 0.35], [0.56, 0.7], [0.5, 1.0], [0.36, 1.1], [0.0, 1.12]];
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 16);
    g.scale(1, 1, 0.9);
    return (GEO.delt = g);
  }
  // Kích thước người thật (8 đv = 1 m): vai ~0.45 m, thân ~0.5 m, cánh tay trên 0.29 m, cẳng tay 0.27 m
  const ARM_UP = 2.3, ARM_FORE = 2.15;
  function buildFigure(team) {
    const M = mats(team);
    const root = new THREE.Group();
    const torso = new THREE.Group();          // gốc ở hông (khớp hông): nghiêng (cúi) / vặn người
    root.add(torso);
    const hips = new THREE.Group();           // thân dưới giữ thăng bằng độc lập với ngực khi cúi / vặn
    root.add(hips);
    const chest = new THREE.Group();          // phần ngực (phồng xẹp theo nhịp thở)
    torso.add(chest);
    const meshes = [];
    const add = (parent, geo, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true;
      parent.add(m); meshes.push(m);
      return m;
    };
    // Gắn túi theo tiếp tuyến của eo elip: mặt sau túi áp vào đai, chiều dày hướng ra ngoài thân.
    // a=0 ở trước bụng (-Z), a=PI/2 ở sườn phải (+X).
    const beltPouch = (a, y, w, h, d, mat = M.pouch) => {
      const x = Math.sin(a) * (1.43 + d * 0.42), z = -Math.cos(a) * (0.96 + d * 0.42);
      const m = add(torso, rbox(w, h, d), mat, x, y, z, 0, Math.PI - a, 0);
      // Dải lưng mỏng lấp khe giữa túi và đai ở góc nhìn xiên.
      add(torso, rbox(w * 0.88, h * 0.72, 0.055), M.web2,
        Math.sin(a) * 1.445, y, -Math.cos(a) * 0.975, 0, Math.PI - a, 0);
      return m;
    };
    const box = rbox;
    // Phần thân dưới nhìn thấy qua lỗ nóc: đũng quần, hai đùi tách khối, gối và ống quần. Bản cũ kết thúc bằng một khối
    // thân cụt ngay dưới thắt lưng nên lúc xạ thủ nhô/cúi trông như tượng bán thân trượt lên xuống.
    add(hips, new THREE.CylinderGeometry(1.28, 1.42, 1.0, 18), M.uni, 0, -1.55, 0).scale.set(1, 1, 0.7);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.62, -1.8, 0.08); leg.rotation.set(-0.1, 0, sx * -0.045); hips.add(leg);
      add(leg, new THREE.CylinderGeometry(0.58, 0.48, 2.25, 14), M.uni, 0, -1.05, 0);
      add(leg, new THREE.SphereGeometry(0.5, 12, 8), M.pad, 0, -2.18, -0.08).scale.set(0.82, 0.7, 0.55);
      add(leg, new THREE.CylinderGeometry(0.46, 0.36, 2.05, 12), M.uni, 0, -3.08, 0.12);
      add(leg, rbox(0.78, 0.52, 1.18), M.boot, 0, -4.15, -0.28, 0.08);
    }
    // thân (áo chiến đấu rằn ri) + thắt lưng chiến đấu có đệm, khóa, túi
    add(chest, torsoGeo(), M.uni, 0, 0, 0);
    // Bụi/muội cục bộ ở nơi tì vào thành xe và thao tác súng; lớp alpha phá biên nên không thành decal vuông sạch sẽ.
    add(chest, new THREE.PlaneGeometry(2.55, 1.45), M.dust, 0.12, 1.35, -1.405, 0.03, 0, 0.05);
    add(chest, new THREE.PlaneGeometry(1.8, 1.25), M.soot, -0.25, 2.25, -1.43, -0.05, 0, -0.08);
    add(chest, new THREE.PlaneGeometry(2.25, 1.5), M.dust, -0.12, 1.72, 1.72, 0, Math.PI, -0.04);
    add(torso, new THREE.CylinderGeometry(1.47, 1.47, 0.42, 28, 1, true), M.web2, 0, -0.9, 0).scale.set(1, 1, 0.68);
    add(torso, new THREE.CylinderGeometry(1.43, 1.43, 0.48, 28, 1, true), M.strap, 0, -0.9, 0).scale.set(1, 1, 0.68);   // đai đệm trong
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.95) continue; add(torso, rbox(0.2, 0.05, 0.03), M.strap, Math.cos(a) * 1.48, -0.9, Math.sin(a) * 1.48 * 0.68, 0, -a + Math.PI / 2, 0); }
    add(torso, rbox(0.42, 0.34, 0.08), M.knuck, 0, -0.9, -1.02);   // khóa cài kim loại
    add(torso, rbox(0.16, 0.2, 0.04), M.web2, 0, -0.9, -1.07);
    add(torso, rbox(0.45, 0.32, 0.12), M.strap, 0, -0.9, -1.0);
    const waistR = beltPouch(0.96, -0.82, 0.52, 0.58, 0.4);
    const waistL = beltPouch(-2.14, -0.8, 0.46, 0.62, 0.38);
    // Nắp, dây giữ và nếp đáy theo cùng hướng của từng túi, tạo lớp chồng thay vì khối hộp trơn.
    for (const [m, a, w, h, d] of [[waistR, 0.96, 0.52, 0.58, 0.4], [waistL, -2.14, 0.46, 0.62, 0.38]]) {
      const out = V(Math.sin(a), 0, -Math.cos(a)), p = m.position.clone().addScaledVector(out, d * 0.52);
      add(torso, rbox(w * 0.9, h * 0.24, 0.08), M.vestD, p.x, m.position.y + h * 0.3, p.z, 0, Math.PI - a, 0.08);
      add(torso, rbox(0.09, h * 0.62, 0.06), M.strap, p.x, m.position.y, p.z, 0, Math.PI - a, 0);
    }
    const vestFrom = meshes.length;
    // ÁO GIÁP MANG TẤM (plate carrier): tấm trước / sau dạng SAPI (vát 2 góc vai) bọc vải, cong ôm theo ngực
    add(chest, plateGeo(2.3, 2.35, 0.3, 0.22), M.vest, 0, 2.1, -1.08, -0.08);
    add(chest, plateGeo(2.6, 2.65, 0.3, -0.2), M.vest, 0, 2.15, 1.1, 0.05);
    // viền bọc mép tấm (băng dệt may quanh chu vi)
    add(chest, plateBindGeo(2.3, 2.35, 0.3, 0.22), M.strap, 0, 2.1, -1.08, -0.08);
    add(chest, plateBindGeo(2.6, 2.65, 0.3, -0.2), M.strap, 0, 2.15, 1.1, 0.05);
    // dải MOLLE trên ngực tấm trước (trên túi hành chính), khe cắt laser kiểu tấm vải ép
    for (let r = 0; r < 2; r++) for (let c = -2; c <= 2; c++) add(chest, rbox(0.26, 0.09, 0.04), M.strap, c * 0.32, 3.02 + r * 0.2, -1.27 - r * 0.02, -0.08);

    const cb = add(chest, new THREE.CylinderGeometry(1.61, 1.58, 1.25, 24, 1, true), M.vestD, 0, 1.35, 0);
    cb.scale.set(1, 1, 0.635);   // trùng mặt elip của áo, làm lớp cầu nối liên tục giữa tấm trước và sau
    for (let r = 0; r < 3; r++) add(chest, new THREE.CylinderGeometry(1.62, 1.62, 0.05, 24, 1, true, Math.PI * 0.3, Math.PI * 0.4), M.strap, 0, 1.0 + r * 0.32, 0).scale.set(1, 1, 0.64);
    for (let r = 0; r < 3; r++) add(chest, new THREE.CylinderGeometry(1.62, 1.62, 0.05, 24, 1, true, Math.PI * 1.3, Math.PI * 0.4), M.strap, 0, 1.0 + r * 0.32, 0).scale.set(1, 1, 0.64);
    // quai vai: dải vải dệt dẹt mỏng (~4 cm bản, vài mm dày) vắt sát qua vai nối mép trên hai tấm, khóa nhựa chỉnh dây
    for (const sx of [-1, 1]) {
      // (tọa độ trước khi kéo áo giáp sát thân bên dưới: y -0.22, x * 0.955, z * 0.91) — đi dọc cơ thang giữa cổ và đầu vai,
      // bám mặt thân. Trước đây vắt qua điểm x ~1.05 nằm ngoài khối vai -> quai vồng lơ lửng trên vai như cái quai xách
      const c = new THREE.CatmullRomCurve3([V(sx * 0.84, 3.3, -1.12), V(sx * 0.84, 3.52, -0.66), V(sx * 0.84, 3.72, -0.33), V(sx * 0.84, 3.79, 0.11),
        V(sx * 0.84, 3.67, 0.44), V(sx * 0.84, 3.45, 0.77), V(sx * 0.84, 3.32, 1.12)]);
      add(chest, strapGeo(c, 0.4, 0.05, 'shoulder' + sx, V(sx * 0.8, 2.4, 0)), M.web2, 0, 0, 0);
      add(chest, rbox(0.46, 0.12, 0.08), M.knuck, sx * 0.84, 3.53, -0.66, -0.75, 0, 0);
    }
    // MẶT TRƯỚC (như áo giáp thật kiểu JPC + placard): BẢNG DÁN NGỰC trên (velcro, túi bản đồ khoá kéo, khoá cài quai
    // vai), HÀNG TÚI BỤNG rộng dưới: 3 túi băng đạn súng trường giữa (thấy đáy băng đạn cong + dây kéo), 2 túi băng đạn
    // súng ngắn hẹp bên phải, túi lựu đạn + quả lựu nổ mảnh bên trái, lựu khói; garô trên quai vai trái
    add(chest, rbox(1.45, 0.9, 0.16), M.pouch, 0, 2.62, -1.34, -0.08);                // bảng dán ngực
    add(chest, rbox(1.25, 0.5, 0.04), M.patch, 0, 2.72, -1.43, -0.08);   // huy hiệu ngực màu phe
    add(chest, rbox(1.1, 0.04, 0.03), M.strap, 0, 2.3, -1.43, -0.08);                 // khoá kéo túi bản đồ
    add(chest, rbox(0.14, 0.1, 0.05), M.knuck, 0.5, 2.3, -1.44, -0.08);
    for (const sx of [-1, 1]) {
      add(chest, rbox(0.26, 0.2, 0.06), M.knuck, sx * 0.82, 3.28, -1.26, -0.35);    // khoá cài quai vai
      add(chest, rbox(0.06, 0.32, 0.04), M.strap, sx * 0.82, 3.05, -1.3, -0.3);
    }
    // hàng túi bụng: tấm đế rộng (thò ra ngoài bề ngang tấm giáp)
    add(chest, rbox(3.1, 0.95, 0.14), M.pouch, 0, 1.28, -1.36, -0.05);
    for (let i = -1; i <= 1; i++) {
      const x = i * 0.56;
      add(chest, rbox(0.52, 0.88, 0.4), M.pouch, x, 1.32, -1.58, -0.05);
      add(chest, rbox(0.4, 0.3, 0.22), M.mag, x, 1.86, -1.58, -0.1);                  // đáy băng đạn
      add(chest, rbox(0.42, 0.06, 0.25), M.knuck, x, 2.02, -1.58, -0.1);
      add(chest, rbox(0.1, 0.5, 0.05), M.strap, x, 1.55, -1.8, -0.05);                 // dây kéo / chun
      add(chest, rbox(0.14, 0.1, 0.07), M.strap, x, 1.83, -1.82, -0.05);
      add(chest, rbox(0.5, 0.04, 0.03), M.strap, x, 1.02, -1.79, -0.05);              // đường may đáy túi
    }
    for (const x of [1.05, 1.32]) {
      add(chest, rbox(0.25, 0.8, 0.3), M.pouch, x, 1.3, -1.48, -0.05, -0.2, 0);
      add(chest, rbox(0.2, 0.16, 0.16), M.mag, x, 1.75, -1.48, -0.1, -0.2, 0);
      add(chest, rbox(0.06, 0.4, 0.04), M.strap, x, 1.45, -1.64, -0.05, -0.2, 0);
    }
    add(chest, rbox(0.42, 0.55, 0.36), M.pouch, -1.1, 1.38, -1.5, -0.05, 0.25, 0);     // túi lựu đạn
    {
      const gr = add(chest, new THREE.SphereGeometry(0.2, 14, 10), M.grenade, -1.38, 1.02, -1.52);
      gr.scale.set(1, 1.15, 1);
      add(chest, new THREE.CylinderGeometry(0.203, 0.203, 0.025, 14), M.band, -1.38, 1.14, -1.52);
      add(chest, new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), M.knuck, -1.38, 1.3, -1.52);
      add(chest, new THREE.TorusGeometry(0.06, 0.015, 4, 10), M.knuck, -1.3, 1.34, -1.6, 0, 0.6, 0);
    }
    add(chest, new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12), M.smoke, -0.78, 1.05, -1.62);   // lựu khói
    add(chest, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), M.knuck, -0.78, 1.34, -1.62);
    add(chest, rbox(0.24, 0.62, 0.24), M.tq, -0.8, 3.0, -1.28, -0.3);
    // dây chun giữ băng đạn ngang mặt túi, nhãn tên + nhóm máu trên quai vai phải, cờ IR trên túi hành chính,
    // nút bấm PTT trên quai vai trái + dây cáp chạy xuống bộ đàm bên sườn
    add(chest, rbox(0.42, 0.16, 0.03), M.patch, 0.82, 3.25, -1.2, -0.35);
    for (let r = 0; r < 3; r++) add(chest, rbox(0.5, 0.05, 0.02), M.strap, -0.3, 2.62 + r * 0.09, -1.46, -0.08);
    add(chest, rbox(0.22, 0.28, 0.12), M.knuck, -0.72, 2.9, -1.36, -0.3);
    add(chest, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), M.strap, -0.72, 2.92, -1.43, Math.PI / 2 - 0.3, 0, 0);
    {
      const ptt = new THREE.CatmullRomCurve3([V(-0.72, 2.75, -1.36), V(-0.95, 2.62, -1.3), V(-1.3, 2.45, -1.08), V(-1.6, 2.3, -0.6), V(-1.66, 2.25, 0.05)]);
      add(chest, new THREE.TubeGeometry(ptt, 14, 0.03, 4, false), M.strap, 0, 0, 0);
    }
    // khóa bám nhả nhanh 2 bên sườn (tháo áo giáp khẩn cấp)
    for (const sx of [-1, 1]) add(chest, rbox(0.06, 0.28, 0.3), M.knuck, sx * 1.67, 1.95, -0.55);
    // SƯỜN: bộ đàm trong túi bên trái + ăng-ten mềm ngả ra sau vai; túi đa năng bên phải
    add(chest, rbox(0.68, 0.95, 0.44), M.pouch, -1.64, 1.45, 0.08, 0, -Math.PI / 2, 0.03);
    add(chest, rbox(0.56, 0.28, 0.12), M.vestD, -1.89, 1.77, 0.08, 0, -Math.PI / 2, 0.08); // nắp radio ôm theo sườn
    add(chest, rbox(0.1, 0.62, 0.08), M.strap, -1.9, 1.48, 0.08, 0, -Math.PI / 2, 0);
    add(chest, rbox(0.3, 0.6, 0.3), M.strap, -1.62, 2.1, 0.12, 0, -Math.PI / 2, 0);
    add(chest, new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), M.knuck, -1.64, 2.62, 0.18);
    {
      const ant = new THREE.CatmullRomCurve3([V(-1.66, 2.74, 0.2), V(-1.64, 3.4, 0.45), V(-1.55, 3.95, 0.9), V(-1.4, 4.25, 1.45)]);
      add(chest, new THREE.TubeGeometry(ant, 16, 0.022, 4, false), M.strap, 0, 0, 0);
    }
    add(chest, rbox(0.72, 0.76, 0.5), M.pouch, 1.65, 1.35, 0.04, 0, Math.PI / 2, -0.03);
    add(chest, rbox(0.6, 0.24, 0.13), M.vestD, 1.93, 1.58, 0.04, 0, Math.PI / 2, -0.08);
    add(chest, rbox(0.1, 0.48, 0.08), M.strap, 1.94, 1.34, 0.04, 0, Math.PI / 2, 0);
    // SAU LƯNG: túi nước có đáy phồng, hông xếp nếp, nắp và dây siết chồng lớp — tránh cảm giác một tấm hộp phẳng dán lên áo.
    add(chest, rbox(1.62, 1.82, 0.46), M.pouch, 0, 2.03, 1.47, 0.06);
    const backBulge = add(chest, new THREE.SphereGeometry(0.72, 18, 12), M.pouch, 0, 1.95, 1.72);
    backBulge.scale.set(1.02, 1.12, 0.27);
    add(chest, rbox(1.42, 0.42, 0.18), M.vestD, 0, 2.72, 1.72, 0.16);                 // nắp túi chồng lên thân
    for (const sx of [-1, 1]) {
      add(chest, rbox(0.12, 1.45, 0.12), M.vestD, sx * 0.72, 1.98, 1.61, 0, sx * 0.05, 0.03); // nếp hông/gusset
      add(chest, rbox(0.14, 1.3, 0.08), M.web2, sx * 0.43, 1.92, 1.86, sx * 0.04);             // dây nén nổi khỏi mặt túi
      add(chest, rbox(0.2, 0.16, 0.12), M.knuck, sx * 0.43, 1.44, 1.91, sx * 0.04);           // khóa dây
    }
    for (let r = 0; r < 3; r++) add(chest, rbox(1.25, 0.055, 0.06), M.strap, 0, 1.72 + r * 0.34, 1.91);
    add(chest, new THREE.TorusGeometry(0.28, 0.07, 6, 12, Math.PI), M.strap, 0, 3.3, 1.28, 0.3);
    add(chest, rbox(1.02, 0.52, 0.48), M.pouch, 0, 0.8, 1.28);
    add(chest, rbox(0.92, 0.16, 0.13), M.vestD, 0, 1.04, 1.55, 0.12);                  // nắp túi cứu thương
    add(chest, rbox(0.16, 0.3, 0.08), M.web2, 0, 0.92, 1.57);
    const tube = new THREE.CatmullRomCurve3([V(0.5, 3.0, 1.45), V(0.95, 3.7, 0.6), V(0.85, 3.55, -0.9), V(0.55, 3.0, -1.32)]);
    add(chest, new THREE.TubeGeometry(tube, 12, 0.035, 5, false), M.strap, 0, 0, 0);
    // Cả bộ áo giáp cùng dùng một “da” elip sát thân. Bản cũ nới z 1.04 làm mặt trong túi cách áo 15–20 cm,
    // đặc biệt lộ rõ khi nhìn ngang; kéo tâm phụ kiện vào nhưng giữ nguyên độ dày để mặt ngoài vẫn có khối.
    for (let i = vestFrom; i < meshes.length; i++) {
      const m = meshes[i];
      m.position.y -= 0.22;
      m.position.x *= 0.955;
      m.position.z *= 0.91;
    }
    // vai tròn
    // khối vai liền thân (cơ delta lấn vào thân) — nối đầu cánh tay với thân, không hở khi tay đưa ra trước
    for (const sx of [-1, 1]) add(chest, new THREE.SphereGeometry(0.56, 16, 12), M.uni, sx * 1.4, 2.72, 0).scale.set(0.95, 0.72, 1.12);   // vai dày, ôm vào thân
    // cổ áo đứng của áo chiến đấu (dưới khăn), khóa kéo ngực
    // cổ áo đứng (kiểu combat shirt) ôm gốc cổ, mở hở chữ V phía trước + khóa kéo; xương quai xanh nổi nhẹ hai bên
    // (bỏ lớp cổ áo trụ thứ hai — chồng lên cổ áo dưới thành vành dày hai lớp)
    // cổ áo quân phục mỏng ôm gốc cổ + đường viền gập mép trên (cùng vải rằn ri áo)
    add(chest, collarGeo(), M.uni, 0, 0, 0);
    add(chest, collarBindGeo(), M.uni, 0, 0, 0);   // đường gập mép (cùng vải, không viền sẫm như cổ giáp)
    // cổ + đầu
    // cổ: thon từ gốc cổ (cơ thang) lên dưới hàm, khăn quấn có ngấn
    add(chest, neckGeo(), M.gaiter, 0, 0, 0.08);   // cổ quấn khăn: một khối liền loe xuống vai, nếp vải chùng mềm
    const head = new THREE.Group();
    head.position.set(0, 4.16, 0.04);
    head.scale.setScalar(0.92);   // hộp sọ đủ lớn so với vai, nằm sát cổ hơn
    chest.add(head);
    // MẶT: một khối liền nặn từ quả cầu (mũi, môi, cằm, gò má, hàm) — màu da theo đỉnh (môi, râu lún phún)
    add(head, faceGeo(), M.skinV, 0, 0.72, 0);
    for (const sx of [-1, 1]) add(head, earGeo(), M.skin, sx * 0.79, 0.66, 0.07, 0, sx * 0.2, 0).scale.set(sx * 0.9, 0.88, 0.9);
    // khăn che mặt (neck gaiter) kéo lên sống mũi, ôm dưới goggle
    add(head, gaiterGeo(), M.gaiter, 0, 0.0, 0);
    // tóc cắt ngắn sát: gáy + mai tóc trước tai (dưới mép mũ)
    add(head, hairGeo(), M.hair, 0, 0.72, 0.02);   // tóc cắt ngắn ôm sát sọ: đỉnh -> thái dương -> gáy
    for (const sx of [-1, 1]) add(head, rbox(0.035, 0.16, 0.09), M.hair, sx * 0.735, 0.89, -0.08, 0, sx * 0.25, 0);
    // KÍNH GOGGLE chống mảnh (kiểu Revision / ESS): một mắt kính liền to cong ôm mặt, khung đệm xốp dày, khoét sống
    // mũi, 2 tai bắt dây; dây chun bản rộng quấn quanh mũ
    add(head, goggleLensGeo(), M.visor, 0, 0, 0);
    add(head, goggleFrameGeo(), M.frame, 0, 0, 0);
    // GỌNG: 2 càng dẹt từ mép ngoài khung chạy dọc thái dương ra sau, nối vào khóa dây chun ngay trước tai
    for (const sx of [-1, 1]) {
      // càng kính chạy dọc thái dương, vắt qua đỉnh tai rồi cụp xuống ôm sau tai
      const a = ggWrap(sx * (GG.W / 2 + 0.02), GG.H / 2 + 0.03, 0.03), b = V(sx * 0.89, 1.0, -0.1), c = V(sx * 0.94, 1.1, 0.15);
      const d = V(sx * 0.93, 0.98, 0.37), e2 = V(sx * 0.86, 0.7, 0.38);
      // càng dẹt (bản ~1 cm, dày 2 mm) bám sát thái dương, vắt trên gáy tai
      add(head, strapGeo(new THREE.CatmullRomCurve3([a, b, c, d, e2]), 0.07, 0.02, 'ggArm' + sx, V(0, 0.75, 0.1)), M.frame, 0, 0, 0);
    }
    {
      const band = [];
      for (let k = 0; k <= 20; k++) band.push([1.1 + k / 20 * (Math.PI * 2 - 2.2), 0.16]);
      add(head, strapGeo(new THREE.CatmullRomCurve3(band.map(([f, y]) => helPt(f, y, 0.025).p)), 0.16, 0.025, 'ggBand', V(0, 1.0, 0.1)), M.strap, 0, 0, 0);
    }
    // QUAI CẰM 4 điểm (dây dệt màu cát): nhánh trước từ ray ARC xuống thẳng trước tai, nhánh sau vòng dưới tai lên gáy,
    // 2 nhánh gặp ở khóa cài dưới góc hàm, xuống đệm cằm; khóa trượt chỉnh dây trên mỗi nhánh
    for (const sx of [-1, 1]) {
      const jn = V(sx * 0.7, -0.22, -0.18), cup = V(sx * 0.22, -0.74, -0.5);
      const fr = helPt(sx * 1.05, helRim(sx * 1.05) + 0.02, 0.02).p, bk = helPt(sx * 2.35, helRim(sx * 2.35) + 0.02, 0.02).p;
      // dây dệt dẹt ~2 cm áp sát má / sau tai (mặt dây úp theo bề mặt đầu)
      const HC = V(0, 0.45, 0.05), fl = (pts, k) => add(head, strapGeo(new THREE.CatmullRomCurve3(pts), 0.15, 0.022, k + sx, HC), M.web, 0, 0, 0);
      fl([fr, V(sx * 0.8, 0.3, -0.38), jn], 'csF');
      fl([bk, V(sx * 0.68, 0.2, 0.4), jn], 'csB');
      fl([jn, V(sx * 0.5, -0.5, -0.36), cup], 'csC');
      add(head, rbox(0.06, 0.2, 0.14), M.webD, sx * 0.84, 0.42, -0.4, 0, sx * 0.6, 0);   // khóa trượt nhánh trước
      add(head, rbox(0.06, 0.14, 0.22), M.webD, sx * 0.67, 0.08, 0.2, 0, sx * -0.9, 0);  // khóa trượt nhánh sau
      add(head, rbox(0.08, 0.18, 0.2), M.webD, jn.x, jn.y, jn.z, 0.3, sx * 0.9, 0);       // khóa cài
    }
    add(head, rbox(0.55, 0.14, 0.3), M.web, 0, -0.78, -0.48, 0.7, 0, 0);         // đệm cằm
    for (const m of head.userData.segs || []) meshes.push(m);
    // MŨ HIGH-CUT (kiểu FAST) bọc vải: vỏ khoét cao hai bên chừa chụp tai, ray phụ kiện hai bên, gáy che vừa,
    // đế gắn kính đêm phía trước, miếng dán velcro trên đỉnh, bao pin đối trọng sau, dây cằm 4 điểm
    // vỏ mũ: đường mép thật của mũ high-cut — trước ngang trán, hai bên khoét cao qua chụp tai, sau thấp phủ gáy
    add(head, helmetGeo(), M.helm, 0, HEL_Y, 0.07);
    // dây chun buộc mũ quanh vòm, các miếng velcro hai bên & sau, đèn nhận dạng IR trên đỉnh sau
    add(head, new THREE.TorusGeometry(0.93, 0.028, 5, 28), M.strap, 0, 1.36, 0.07, Math.PI / 2 - 0.08).scale.set(0.98, 1.06, 1);
    // phụ kiện ốp sát vỏ: hướng theo pháp tuyến / tiếp tuyến mặt mũ tại chỗ gắn
    const flush = (geo, mat, phi, y, off) => {
      const h = helPt(phi, y, off), m = add(head, geo, mat, h.p.x, h.p.y, h.p.z);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(h.t, V().crossVectors(h.n, h.t), h.n));
      return m;
    };
    // gờ mép mỏng quanh vỏ
    {
      const edge = [];
      for (let k = 0; k <= 72; k++) { const f = k / 72 * Math.PI * 2; edge.push([f, helRim(f) + 0.015]); }
      add(head, helLine(edge, 0.012, 0.026), M.trim, 0, 0, 0);
    }
    // VÀNH TRƯỚC: tấm dẹt mỏng dựng theo mép trước, nhô cao hơn mặt vỏ một chút (gờ chắn trán)
    add(head, helRibbon('brim', -0.9, 0.9, f => helRim(f) - 0.01, f => helRim(f) + 0.1, 0.035, 0.03), M.shell, 0, 0, 0);
    // RAY ARC to màu cát mỗi bên (như mũ thật): bản ray liền chạy dọc trên mép khoét tai, gờ rãnh ray, lỗ vít, CÁNH
    // TRƯỚC vát chéo xuống thái dương (chỗ bắt quai cằm) có lỗ tam giác giảm nặng, đuôi ray vuốt về sau
    for (const sx of [-1, 1]) {
      const fa = 0.92, fb = 2.25, F = f => sx * f;
      const lo = f => helRim(f) + 0.1, hi = f => helRim(f) + 0.44;
      const ribbon = (key, f0, f1, l, h, off, th) => add(head, helRibbon(key + sx, F(f0) < F(f1) ? F(f0) : F(f1), F(f0) < F(f1) ? F(f1) : F(f0), l, h, off, th), M.shell, 0, 0, 0);
      ribbon('arc', fa, fb, lo, hi, 0.02, 0.07);
      ribbon('arcSlot', fa + 0.05, fb - 0.05, f => helRim(f) + 0.33, f => helRim(f) + 0.37, 0.09, 0.012).material = M.knuck;
      // cánh trước: tam giác từ thân ray xuống điểm bắt quai ở thái dương
      ribbon('arcWing', 0.72, fa + 0.02, f => helRim(f) + 0.05 + 0.1 * Math.max(0, (Math.abs(f) - 0.72) / 0.2), f => helRim(f) + 0.12 + 1.6 * Math.max(0, Math.abs(f) - 0.72), 0.02, 0.07);
      flush(rbox(0.12, 0.08, 0.02), M.knuck, F(0.8), helRim(F(0.8)) + 0.1, 0.095);
      for (const f of [1.25, 1.65, 2.0]) {
        flush(rbox(0.13, 0.1, 0.02), M.knuck, F(f), helRim(F(f)) + 0.21, 0.095);     // lỗ giảm nặng
        flush(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), M.knuck, F(f + 0.17), helRim(F(f + 0.17)) + 0.21, 0.1).rotation.x += Math.PI / 2;
      }
      // miếng velcro + quai kéo bên sườn sau
      flush(rbox(0.36, 0.32, 0.03), M.velcro, F(2.5), 0.4, 0.02);
      flush(rbox(0.13, 0.28, 0.04), M.web, F(2.5), 0.3, 0.05);
    }
    // đường may vải bọc mũ: dọc giữa trước -> sau, ngang hai bên
    add(head, helLine([[0, 0.05], [0, 0.5], [0, 0.9], [0.0001, 1.0], [Math.PI, 0.9], [Math.PI, 0.4], [Math.PI, -0.25]], 0.01, 0.014), M.helmD, 0, 0, 0);
    add(head, helLine([[-Math.PI / 2, 0.28], [-Math.PI / 2, 0.7], [-Math.PI / 2, 1.0], [Math.PI / 2, 1.0], [Math.PI / 2, 0.7], [Math.PI / 2, 0.28]], 0.01, 0.014), M.helmD, 0, 0, 0);
    // ĐẾ KÍNH ĐÊM (shroud) trước mũ: tấm đế 3 vít + khối khoá + lẫy gạt
    flush(rbox(0.56, 0.44, 0.08), M.strap, 0, 0.3, 0.03);
    for (const [dx, dy] of [[-0.18, 0.12], [0.18, 0.12], [0, -0.14]]) flush(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6), M.knuck, dx, 0.3 + dy, 0.08).rotation.x += Math.PI / 2;
    flush(rbox(0.3, 0.22, 0.2), M.knuck, 0, 0.2, 0.14);
    flush(rbox(0.06, 0.16, 0.06), M.strap, 0.12, 0.13, 0.24);
    // miếng velcro hai bên (gai dán) + sau (dán cờ IR), velcro đỉnh
    flush(rbox(0.6, 0.38, 0.035), M.velcro, Math.PI, 0.35, 0.02);
    for (let r = 0; r < 3; r++) flush(rbox(0.5, 0.05, 0.02), M.strap, Math.PI, 0.25 + r * 0.1, 0.045);
    flush(rbox(0.46, 0.4, 0.03), M.velcro, Math.PI, 1.05, 0.0);
    // núm vặn siết đai lót (BOA) ngay dưới mép sau, bao pin đối trọng ốp sau mũ + cáp pin
    // tay: cánh tay trên / cẳng tay (viên nhộng, tay áo rằn ri), khớp khuỷu tròn, găng tay có ngón cái
    const arms = [-1, 1].map(s => {
      const up = new THREE.Group(), fore = new THREE.Group(), hand = new THREE.Group();
      root.add(up, fore, hand);
      // CÁNH TAY TRÊN: cơ delta tròn ở đầu vai, bắp tay, thon về khuỷu; tay áo có nếp dồn gần khuỷu
      add(up, limbGeo('up'), M.uni, 0, 0, 0);
      // túi tay áo bắp tay (khoá kéo chéo + nắp dán velcro, miếng cờ) ở MẶT NGOÀI tay — nhóm riêng xoay quanh trục tay
      // mỗi khung hình cho luôn hướng ra ngoài thân (solveArm)
      const pocket = new THREE.Group();
      up.add(pocket);
      add(pocket, rbox(0.12, 0.72, 0.58), M.uni, 0.5, 0.95, 0);
      add(pocket, rbox(0.05, 0.42, 0.44), M.patch, 0.57, 0.98, 0);
      add(pocket, rbox(0.03, 0.03, 0.56), M.strap, 0.57, 0.62, 0, 0.35, 0, 0);
      // đường may raglan & khóa kéo tay áo
      add(up, new THREE.TorusGeometry(0.5, 0.012, 4, 20), M.helmD, 0, 0.2, 0, Math.PI / 2 + 0.25, 0, 0);
      // CẲNG TAY: bắp cẳng tay to gần khuỷu, thon về cổ tay; đệm khuỷu ốp mỏm khuỷu (+X); cổ tay áo dán velcro
      add(fore, limbGeo('fore'), M.uni, 0, 0, 0);
      // đệm khuỷu: vỏ nhựa dẹt cong ôm mỏm khuỷu (phía +X), viền mép, 2 dây chun ôm tay
      add(fore, new THREE.CylinderGeometry(0.5, 0.5, 0.62, 12, 1, true, Math.PI / 2 - 0.85, 1.7), M.pad, 0, 0.1, 0);
      add(fore, new THREE.CylinderGeometry(0.52, 0.52, 0.06, 12, 1, true, Math.PI / 2 - 0.85, 1.7), M.strap, 0, 0.4, 0);
      for (const y of [-0.12, 0.34]) add(fore, new THREE.CylinderGeometry(0.47, 0.47, 0.07, 14, 1, true), M.web, 0, y, 0);
      add(fore, new THREE.CylinderGeometry(0.34, 0.33, 0.22, 14), M.uni, 0, ARM_FORE - 0.32, 0);
      add(fore, rbox(0.1, 0.18, 0.3), M.uni, 0.33, ARM_FORE - 0.32, 0);
      // GĂNG TAY CHIẾN THUẬT: cổ găng ôm cổ tay có quai dán, mu bàn tay ốp đốt cứng, lòng bàn tay da, 4 ngón 3 đốt cong
      // ôm quanh tay cầm (tay cầm dọc theo trục Z của bàn tay), ngón cái ôm chéo phía trên
      // Cổ găng thu từ tay áo sang bàn tay; lòng bàn tay phải có bề dày thật để không biến thành một lát phẳng khi nhìn ngang.
      // GĂNG: cổ găng ôm cổ tay + quai dán; bàn tay dẹt như tay thật (dày ~3 cm, rộng ~8.5 cm — bản cũ là một quả cầu dày gần
      // bằng bề ngang); mu tay ốp đốt cao su thấp cùng tông sẫm; 4 ngón 3 đốt thon dần, có khe giữa ngón; lòng bàn tay da
      add(hand, new THREE.CylinderGeometry(0.29, 0.33, 0.34, 12), M.glove, 0, -0.1, 0).scale.set(0.82, 1, 1);
      add(hand, new THREE.TorusGeometry(0.3, 0.03, 5, 12), M.gloveP, 0, -0.02, 0, Math.PI / 2).scale.set(0.82, 1, 1);
      add(hand, rbox(0.06, 0.16, 0.2), M.gloveP, 0.25, -0.06, 0.04);                       // quai dán cổ găng
      add(hand, rbox(0.27, 0.56, 0.6), M.glove, 0.0, 0.26, 0);                               // bàn tay
      add(hand, rbox(0.05, 0.46, 0.5), M.gloveP, -0.13, 0.26, 0);                            // lòng bàn tay da
      add(hand, rbox(0.06, 0.2, 0.56), M.gloveP, 0.14, 0.47, 0);                             // ốp đốt cao su thấp
      for (let f = 0; f < 4; f++) {
        const z = (f - 1.5) * 0.152, r = f === 3 ? 0.06 : 0.068, k = f === 3 ? 0.86 : f === 1 ? 1.04 : 1;
        // Ba đốt tạo móc chữ C; đầu ngón về phía lòng bàn tay nên cán nằm lọt giữa lòng tay và đầu ngón.
        const p0 = V(0.06, 0.52, z), p1 = V(0.0, 0.68 * k, z), p2 = V(-0.19 * k, 0.6 * k, z), p3 = V(-0.26 * k, 0.4, z);
        seg(hand, p0, p1, r, M.glove); seg(hand, p1, p2, r * 0.93, M.glove); seg(hand, p2, p3, r * 0.86, M.gloveP);
      }
      const tz = s * 0.33;
      // Ngón cái đối lực từ gò cái, vòng chéo về đầu ngón trỏ thay vì chìa thẳng ra cạnh bàn tay.
      seg(hand, V(-0.02, 0.12, tz * 0.6), V(-0.1, 0.3, tz), 0.078, M.glove);
      seg(hand, V(-0.1, 0.3, tz), V(-0.22, 0.4, tz * 0.6), 0.066, M.gloveP);
      for (const m of hand.userData.segs || []) meshes.push(m);
      hand.scale.setScalar(0.92);   // bàn tay chiến sĩ trưởng thành, không lọt thỏm cạnh tay cầm 12.7 mm
      // CƠ DELTA / VAI ÁO: ống vải thuôn nối từ đầu vai trên thân sang bắp tay — đổi hướng theo tay mỗi khung (solveArm),
      // vai không còn là quả cầu đầu cánh tay tách khỏi thân khi giơ tay / đưa tay ra trước
      const delt = add(root, deltGeo(), M.uni, 0, 0, 0);
      return { s, up, fore, hand, pocket, delt, sh: V(s * 1.5, 2.76, 0) };   // vai (hệ ngực)
    });
    // vẽ sau lòng hố lỗ nóc (recon_marten: mặt nạ độ sâu khoét nóc) -> phần người dưới mép nóc vẫn thấy qua lỗ
    // vẽ ở lượt trong suốt SAU lòng hố lỗ nóc (recon_marten: renderOrder 10-11) -> phần người dưới mép nóc vẫn thấy qua lỗ
    for (const m of meshes) {
      m.userData.crewRole = 'gunner'; m.renderOrder = 12;
      if (!m.material.transparent) { m.material.transparent = true; m.material.opacity = 1; }
    }
    if (!M.dead.transparent) { M.dead.transparent = true; M.dead.opacity = 1; }
    return { root, torso, hips, chest, head, arms, meshes, M, rise: 0, bend: 0, twist: 0, roll: 0, look: 0, lookP: 0, t: Math.random() * 10 };
  }

  // IK 2 khớp trong hệ root: vai S -> khuỷu E -> bàn tay T; khuỷu bẻ về phía pole
  const _q = new THREE.Quaternion(), _d = V(0, 0, 0);
  // đặt đoạn chi từ `from` tới `to` (+Y dọc chi). xHint: hướng trục X của đoạn (vuông góc với chi) — khóa xoay quanh
  // trục chi để chi tiết một phía (đệm khuỷu, túi tay áo, mu bàn tay) luôn nằm đúng phía
  const _x = V(0, 0, 0), _z = V(0, 0, 0), _m = new THREE.Matrix4();
  function aim(obj, from, to, xHint) {
    _d.subVectors(to, from);
    const L = _d.length();
    obj.position.copy(from);
    if (L < 1e-5) return;
    _d.multiplyScalar(1 / L);
    if (!xHint) { obj.quaternion.setFromUnitVectors(UP, _d); return; }
    _x.copy(xHint).addScaledVector(_d, -xHint.dot(_d));
    if (_x.lengthSq() < 1e-6) { obj.quaternion.setFromUnitVectors(UP, _d); return; }
    _x.normalize();
    _z.crossVectors(_x, _d);
    obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _d, _z));
  }
  function solveArm(F, arm, targetW, poleL, gripAxisW) {
    const S = F.chest.localToWorld(arm.sh.clone());
    F.root.worldToLocal(S);
    const G = F.root.worldToLocal(targetW.clone());
    // Khi nắm cán, target là tâm lòng bàn tay chứ không phải cổ tay. Lùi cổ tay theo hướng với tới để
    // lòng bàn tay và các ngón thực sự bao quanh cán, thay vì chỉ chạm mép ngoài của nó.
    const reach = G.clone().sub(S).normalize();
    // Nắm cán: tâm cán phải lọt vào giữa móc chữ C của 4 ngón (hệ bàn tay ~(-0.12, 0.48) — phía lòng tay, ngang đốt giữa),
    // không xuyên giữa khối lòng bàn tay. Trục cán đổi chiều cho tay trái để mu bàn tay hai bên cùng quay ra ngoài, ngón cái
    // hai tay cùng ở phía trên (ấn lẫy cò bướm). Dựng hệ trục bàn tay trước rồi lùi cổ tay theo đó
    let HB = null, T = G;
    if (gripAxisW) {
      const invRoot = new THREE.Matrix4().copy(F.root.matrixWorld).invert();
      const ax = gripAxisW.clone().transformDirection(invRoot).multiplyScalar(arm.s < 0 ? -1 : 1);
      const hz = ax.addScaledVector(reach, -ax.dot(reach)).normalize(), hx = V().crossVectors(reach, hz).normalize();
      HB = { hx, hy: reach.clone(), hz };
      T = G.clone().addScaledVector(reach, -0.44).addScaledVector(hx, 0.11);
    }
    const a = ARM_UP, b = ARM_FORE;
    const ST = T.clone().sub(S);
    let d = ST.length();
    const dir = d > 1e-5 ? ST.clone().multiplyScalar(1 / d) : V(0, -1, 0);
    d = Math.max(Math.abs(a - b) + 0.05, Math.min(a + b - 0.02, d));
    const Tc = S.clone().addScaledVector(dir, d);   // tay không với tới: duỗi thẳng về phía mục tiêu
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pv = poleL.clone().sub(S);
    pv.addScaledVector(dir, -pv.dot(dir));
    if (pv.lengthSq() < 1e-6) pv.set(0, -1, 0);
    pv.normalize();
    const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
    // +X của cánh tay / cẳng tay = phía mỏm khuỷu (chiều bẻ khuỷu); bàn tay: +X ra phía ngoài thân (mu bàn tay)
    aim(arm.up, S, E, pv);
    if (arm.delt) {
      // gốc trên thân (đầu vai, lấn vào trong thân) -> điểm trên bắp tay cách khớp vai ~0.75
      const A = F.root.worldToLocal(F.chest.localToWorld(V(arm.s * 1.12, 2.86, 0.02)));
      const B = S.clone().addScaledVector(E.clone().sub(S).normalize(), 0.75);
      const d = B.sub(A), L = d.length();
      arm.delt.position.copy(A);
      arm.delt.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(1e-4, L)));
      arm.delt.scale.set(1, Math.max(0.2, L), 1);
    }
    if (arm.pocket) {
      const lat = V(arm.s, 0.35, 0).applyQuaternion(arm.up.quaternion.clone().invert());
      arm.pocket.rotation.y = Math.atan2(-lat.z, lat.x);
    }
    aim(arm.fore, E, Tc, pv);
    if (HB) {
      arm.hand.position.copy(Tc);
      arm.hand.quaternion.setFromRotationMatrix(_m.makeBasis(HB.hx, HB.hy, HB.hz));
    } else aim(arm.hand, Tc, Tc.clone().addScaledVector(Tc.clone().sub(E).normalize(), 1), V(arm.s, 0, 0));
  }

  // ---------- XẠ THỦ XE TRINH SÁT ----------
  // turret: vòng súng; mg: { cover, ammo, barrel } của súng 12.7mm (recon_marten buildRingMount)
  function attachScoutGunner(unit, turret, mg) {
    hook();
    const F = buildFigure(unit.team);
    // đứng trong lỗ nóc (tâm vòng = gốc turret, bán kính 3.4), hông dưới mép nóc; chỗ đứng theo vị trí súng (recon_marten
    // mg.stand): tay ôm súng có khoảng cách tự nhiên với ngực
    F.base = mg && mg.stand ? mg.stand.clone() : V(0, -0.9, 2.4);
    F.root.position.copy(F.base);
    turret.add(F.root);
    unit.crew = { gunner: F, mg, turret, kind: 'scout' };
    return F;
  }

  // ẨN / HIỆN KÍP XE (phòng thử): ẩn = gỡ hình người (xạ thủ, người dự bị, vệt máu) khỏi tháp -> không vẽ, đạn không trúng,
  // không tính thương vong. Hoạt cảnh ống phóng / súng vẫn chạy như thường
  function setShown(u, on) {
    const C = u && u.crew;
    if (!C) return;
    C.off = !on;
    for (const o of [C.gunner && C.gunner.root, C.mate && C.mate.root, C.stains]) {
      if (!o) continue;
      if (!on) { if (o.parent) o.parent.remove(o); }
      else if (o.parent !== C.turret) C.turret.add(o);
    }
  }

  const wp = (obj, x, y, z) => obj.localToWorld(V(x, y, z));
  // điểm trong lòng xe / quanh lỗ nóc tính theo chỗ đứng xạ thủ (x, z lệch so với F.base; y theo mặt nóc)
  const ws = (T, F, x, y, z) => wp(T, F.base.x + x, y, F.base.z + z);
  const lerpV = (a, b, k) => a.clone().lerp(b, k);

  // khung hình chính: [mốc thời gian, hàm(ctx) -> { L, R (Vector3 thế giới), rise, bend, twist }]; nội suy mượt giữa 2 mốc liền kề
  function track(keys, t, ctx) {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const [t0, f0] = keys[i], [t1, f1] = keys[i + 1];
    const k = t1 > t0 ? sm((t - t0) / (t1 - t0)) : 1;
    const A = f0(ctx), B = f1(ctx);
    return {
      L: lerpV(A.L, B.L, k), R: lerpV(A.R, B.R, k),
      rise: A.rise + (B.rise - A.rise) * k, bend: A.bend + (B.bend - A.bend) * k, twist: A.twist + (B.twist - A.twist) * k,
      lz: (A.lz || 0) + ((B.lz || 0) - (A.lz || 0)) * k
    };
  }

  const pose = (L, R, rise = 0, bend = 0, twist = 0, lz = 0) => ({ L, R, rise, bend, twist, lz });

  // Thay hộp đạn súng máy (pr 0..1 theo reloadTimer — đồng bộ với hoạt cảnh nắp / hộp trong recon_marten).
  // Khay hộp đạn nằm sát chốt súng, cách chỗ đứng ~6 đv: xạ thủ đứng lên bậc, CHỒM NGƯỜI tới (lz < 0) để tay làm việc ở tầm
  // khuỷu gập — trước đây đứng nguyên chỗ duỗi thẳng tay, ôm hộp 13 kg bằng hai cánh tay thẳng đơ. Hộp luôn có hai tay: tay
  // phải nắm quai trên nắp, tay trái đỡ dưới mép đáy; kéo sát ngực rồi mới đổi hướng. Hộp rỗng quăng qua mạn trái, hộp mới
  // lấy từ giá trong khoang, nhấc thẳng đứng giữa lòng lỗ lên ngang ngực rồi mới đưa ra khay (c.r0: tư thế đứng súng)
  const MG_KEYS = [
    [0.00, c => pose(c.gripL, c.gripR, c.r0)],
    [0.07, c => pose(c.gripL, c.coverH, c.r0 + 0.2, 0.3, 0, -0.7)],              // tay phải nhấc nắp khóa nòng
    [0.14, c => pose(c.beltT, c.coverH, c.r0 + 0.3, 0.42, -0.05, -0.9)],         // tay trái nhấc dây cũ khỏi khay nạp
    [0.24, c => pose(c.beltT, c.coverH, c.r0 + 0.3, 0.45, -0.08, -1.0)],         // kéo dây cũ ra hẳn, tay phải vẫn giữ nắp
    [0.28, c => pose(c.boxH2, c.boxH, c.r0 + 0.35, 0.55, -0.12, -1.2)],          // tay phải nắm quai, tay trái luồn đỡ đáy hộp
    [0.33, c => pose(c.boxH2, c.boxH, c.r0 + 0.3, 0.45, -0.12, -1.0)],           // nhấc hộp khỏi chốt khay
    [0.40, c => pose(c.boxH2, c.boxH, c.r0, 0.15, -0.3, -0.3)],                  // kéo hộp về sát ngực trái, đứng thẳng lại
    [0.43, c => pose(c.tossL, c.tossR, c.r0 + 0.1, 0.05, -0.55, -0.2)],          // lấy đà, quăng hộp rỗng qua mạn trái
    [0.47, c => pose(c.restL, c.restR, c.r0, 0.1, -0.2, 0)],
    [0.53, c => pose(c.boxH2, c.boxH, c.r0 - 1.6, 0.85, 0.05, 0.25)],            // cúi xuống giá đạn trong khoang, nắm hộp mới
    [0.55, c => pose(c.boxH2, c.boxH, c.r0 - 1.6, 0.85, 0.05, 0.25)],
    [0.62, c => pose(c.boxH2, c.boxH, c.r0 - 0.2, 0.25, -0.1, 0)],               // nhấc thẳng lên ngang ngực, giữa lòng lỗ
    [0.70, c => pose(c.boxH2, c.boxH, c.r0 + 0.35, 0.55, -0.12, -1.2)],          // chồm tới đặt hộp lên khay, ghì vào chốt
    [0.75, c => pose(c.boxH, c.lidH, c.r0 + 0.3, 0.45, 0, -1.1)],                // một tay giữ hộp, một tay lật nắp
    [0.79, c => pose(c.boxH, c.beltT, c.r0 + 0.3, 0.45, 0, -1.0)],               // bốc đầu dây mới
    [0.88, c => pose(c.coverH, c.beltT, c.r0 + 0.25, 0.4, 0, -0.9)],             // đặt dây vào khay, tay trái đỡ nắp khóa nòng
    [0.92, c => pose(c.gripL, c.coverH, c.r0 + 0.2, 0.3, 0, -0.7)],              // sập và ép nắp khóa nòng vào chốt
    // kéo lên đạn 2 lần: nắm tay kéo ở chỗ nghỉ phía trước rồi mới lùi (tay bám theo tay kéo — chargePull). Thân người dồn
    // sức: với ra trước khi nắm, ngả ra sau theo cú giật (lò xo khối khóa nòng 12.7 rất cứng) — c.chBend theo hành trình tay
    [0.92, c => pose(c.gripL, c.chargeH, c.r0, c.chBend, c.chTwist, -0.6)],
    [0.974, c => pose(c.gripL, c.chargeH, c.r0, c.chBend, c.chTwist, -0.6)],
    [1.00, c => pose(c.gripL, c.gripR, c.r0)]
  ];
  // TAY KÉO LÊN ĐẠN theo tiến độ nạp (0 = chỗ nghỉ phía trước, 1 = lùi hết): kéo lùi chậm, buông là lò xo bật về gần như
  // tức thì; kéo 2 lần như súng M2 thật (lần 1 đưa viên đầu lên, lần 2 đẩy vào buồng đạn). recon_marten đẩy tay kéo theo
  const CHARGE_KEYS = [[0.92, 0], [0.94, 1], [0.944, 0], [0.955, 0], [0.97, 1], [0.974, 0]];
  // NHỊP THẬT CỦA LƯỢT THAY HỘP: MG_KEYS / CHARGE_KEYS / hoạt cảnh recon_marten / tiếng (spg SCOUT_RELOAD_STEPS) đều viết
  // theo "mốc hoạt cảnh" a. Bảng này đổi tiến độ thời gian t (0..1 theo reloadTimer) -> a, để các bước nặng có đủ thời
  // gian như người thật: cúi xuống lòng xe móc hộp đạn 13 kg ~0.8 s, nhấc lên qua lỗ nóc ~0.85 s, mỗi lần kéo tay kéo
  // lên đạn 12.7 ~0.3 s (lò xo khối khóa nòng cứng). Trước đây t = a: cả lượt ~4 s, mỗi lần kéo tay kéo chỉ 0.08 s.
  // Cặp [t, a] (ở 6 s nạp: 0.05 = 0.3 s)
  const MG_WARP = [
    [0, 0], [0.05, 0.08], [0.12, 0.14],   // rời tay cầm, mở nắp khóa nòng
    [0.20, 0.24], [0.24, 0.28],           // nhấc rồi rút dây đạn cũ ra khỏi khay nạp
    [0.38, 0.44], [0.41, 0.47],           // giữ bằng hai tay, hạ hộp cũ vào khoang
    [0.52, 0.55], [0.66, 0.70],           // tìm quai hộp mới, nhấc hộp nặng lên và ghì vào khay
    [0.71, 0.75], [0.82, 0.88],           // mở nắp hộp, luồn dây mới vào khay nạp
    [0.86, 0.92],                         // sập nắp khóa nòng
    [0.875, 0.94], [0.88, 0.944], [0.895, 0.955], [0.935, 0.97], [0.94, 0.974],   // kéo lên đạn 2 lần
    [1, 1]                                // tay về tay cầm, nòng hạ về
  ];
  function warpBy(T, x, i, j) {
    if (x <= T[0][i]) return T[0][j];
    for (let k = 1; k < T.length; k++) {
      if (x <= T[k][i]) return T[k - 1][j] + (T[k][j] - T[k - 1][j]) * (x - T[k - 1][i]) / Math.max(1e-6, T[k][i] - T[k - 1][i]);
    }
    return T[T.length - 1][j];
  }
  const mgWarp = (t) => warpBy(MG_WARP, t, 0, 1);     // tiến độ thời gian -> mốc hoạt cảnh
  const mgUnwarp = (a) => warpBy(MG_WARP, a, 1, 0);   // mốc hoạt cảnh -> tiến độ thời gian (canh tiếng)
  // mốc hoạt cảnh thay hộp hiện tại của xe (1 = không nạp)
  function mgReloadPr(u) {
    if (!(u.reloadDuration > 0) || !(u.reloadTimer > 0)) return 1;
    return mgWarp(Math.max(0, Math.min(1, 1 - u.reloadTimer / u.reloadDuration)));
  }
  function chargePull(pr) {
    const n = CHARGE_KEYS.length;
    if (pr <= CHARGE_KEYS[0][0] || pr >= CHARGE_KEYS[n - 1][0]) return 0;
    for (let i = 0; i < n - 1; i++) {
      const [a, va] = CHARGE_KEYS[i], [b, vb] = CHARGE_KEYS[i + 1];
      if (pr < b) return va + (vb - va) * sm((pr - a) / (b - a));
    }
    return 0;
  }

  // Nạp tên lửa kiểu TOW (pr 0..1 theo antiTankCooldown). Mốc chuyển động của ống phóng: xem animateLauncher
  // RÚT VỎ RỖNG & ĐẨY QUẢ MỚI: động tác dứt khoát của kíp thạo việc — nắm chắc, trụ người (khựng ngắn) rồi giật / tống một
  // phát: vỏ rỗng giật ra ~0.4 s (vọt nhanh, chậm lại cuối tầm tay), quả mới tống vào ~0.3 s (tăng tốc, đập khựng vào chốt
  // hãm — ống phóng giật nảy). Trước đây trượt đều ~1 s mỗi động tác, nhìn lừ đừ
  const AT = { capOpen: [0.16, 0.21], spentGrab: 0.25, spentOut: [0.27, 0.34], toss: 0.42, grab: [0.47, 0.53], lift: [0.53, 0.60], newUp: [0.60, 0.66], push: [0.69, 0.75], capClose: [0.79, 0.84], ready: 0.9 };
  // ống tên lửa trên giá cố định thấp (ngang hông người đứng): đứng lên bậc vừa phải (rise 1.1), không trèo cao
  const AT_KEYS = [
    // lúc phóng & dẫn tên lửa: thụp xuống sau tấm chắn (chỉ nhô mắt), chỉ đứng lên khi bắt đầu nạp quả mới
    [0.00, c => pose(c.gripL, c.gripR, -1.4, 0.1)],
    [0.10, c => pose(c.gripL, c.gripR, -1.4, 0.1)],
    [0.16, c => pose(c.tubeL, c.capH, 1.1, 0.05, -0.55)],
    [0.21, c => pose(c.tubeL, c.capH, 1.1, 0.05, -0.55)],
    // nắm đuôi vỏ rỗng, trụ người hơi đổ tới -> giật mạnh ra sau, người ngả theo
    [0.25, c => pose(c.spentL, c.spentR, 1.1, 0.16, -0.55)],
    [0.27, c => pose(c.spentL, c.spentR, 1.1, 0.18, -0.55)],
    [0.34, c => pose(c.spentL, c.spentR, 1.1, -0.12, -0.75)],
    [0.43, c => pose(c.tossL, c.tossR, 1.1, -0.05, -0.9)],
    // cúi xuống lòng xe, ôm quả tên lửa mới (trong ống chứa) nhấc lên qua lỗ nóc, xoay ra sau ống phóng
    [0.47, c => pose(c.hatchL, c.hatchR, 0.3, 0.75, -0.3)],
    [0.53, c => pose(c.misL, c.misR, 0.2, 0.8, -0.3)],
    [0.60, c => pose(c.misL, c.misR, 0.9, 0.3, -0.45)],
    [0.66, c => pose(c.misL, c.misR, 1.1, 0.12, -0.55)],
    // kề đuôi quả vào miệng ống, lùi vai lấy đà -> tống một phát, người lao theo
    [0.69, c => pose(c.misL, c.misR, 1.1, 0.0, -0.55)],
    [0.75, c => pose(c.tubeL, c.misR, 1.1, 0.3, -0.55)],
    [0.79, c => pose(c.tubeL, c.capH, 1.1, 0.1, -0.55)],
    [0.85, c => pose(c.tubeL, c.capH, 1.1, 0.05, -0.55)],
    [0.93, c => pose(c.gripL, c.gripR)],
    [1.00, c => pose(c.gripL, c.gripR)]
  ];
  const easeOut = x => 1 - Math.pow(1 - c01(x), 3);   // giật: vọt nhanh, chậm lại cuối tầm tay
  const easeIn = x => Math.pow(c01(x), 2.2);          // tống: tăng tốc tới cuối, khựng hẳn ở chốt hãm

  // vỏ chứa rỗng (đẩy ra từ đuôi ống) — tạo khi cần trong ống phóng
  function spentOf(A) {
    if (A.spent) return A.spent;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3a33, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 4.6, 12), mat);
    body.rotation.x = Math.PI / 2; g.add(body);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.7 }));
    ring.rotation.x = Math.PI / 2; ring.position.z = 2.1; g.add(ring);
    g.visible = false;
    A.can.add(g);
    A.spent = g;
    return g;
  }

  // quả tên lửa mới đi qua lỗ nóc: vẽ ở lượt trong suốt sau lòng hố (như xạ thủ) để không bị lòng hố che
  function missileOverPit(A) {
    if (A._mslPit) return;
    A._mslPit = true;
    A.missile.traverse(o => { if (o.isMesh) { const m0 = o.material, m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.customProgramCacheKey = m0.customProgramCacheKey; m.userData = Object.assign({}, m0.userData); m.transparent = true; m.opacity = 1; o.material = m; o.renderOrder = 12; } });
  }
  // Ống phóng theo tiến trình nạp: nắp sau mở / đóng, vỏ rỗng trượt ra, quả mới nâng lên & đẩy vào, nắp trước
  function animateLauncher(u, A, pr, reloading, has, dead) {
    const spent = spentOf(A);
    missileOverPit(A);
    if (!reloading) {
      A._hatchTop = null;
      A.rearCap.rotation.x = 0; A.missile.visible = false; spent.visible = false; A.can.position.z = 0;
      A.capCover.visible = has; A.capOpen.visible = !has;
      return;
    }
    const open = sm((pr - AT.capOpen[0]) / (AT.capOpen[1] - AT.capOpen[0])) * (1 - sm((pr - AT.capClose[0]) / (AT.capClose[1] - AT.capClose[0])));
    A.rearCap.rotation.x = -1.6 * open;
    // vỏ rỗng: nằm trong ống tới lúc rút; trượt lùi ra sau; vứt đi ở mốc toss
    const so = easeOut((pr - AT.spentOut[0]) / (AT.spentOut[1] - AT.spentOut[0]));
    spent.position.set(0, 0, -0.9 + 5.6 * so);
    spent.visible = pr < AT.toss && so > 0.02;
    const load = has && !dead;
    const up = sm((pr - AT.newUp[0]) / (AT.newUp[1] - AT.newUp[0])), push = easeIn((pr - AT.push[0]) / (AT.push[1] - AT.push[0]));
    A.missile.visible = load && pr > AT.grab[0] && push < 0.97;
    // quả mới lấy từ lòng xe: nằm trong lỗ nóc (sâu dưới mép) -> được nhấc thẳng lên khỏi lỗ -> đưa ra sau đuôi ống
    const behind = V(0, 0, 5.4);   // ngay sau đuôi ống, thẳng trục ống
    if (pr < AT.newUp[0] && u.turretGroup) {
      const lift = sm((pr - AT.lift[0]) / (AT.lift[1] - AT.lift[0]));
      const G = u.crew && u.crew.gunner, hz = G ? G.base.z - 1.5 : 0.9;
      const hw = u.turretGroup.localToWorld(V(-0.3, -1.8 + 3.2 * lift, hz));
      const hl = A.can.worldToLocal(hw);
      A._hatchTop = A._hatchTop || hl.clone();
      if (lift >= 0.99) A._hatchTop.copy(hl);
      A.missile.position.copy(hl);
    } else {
      if (up < 1) A.missile.position.copy(A._hatchTop || behind).lerp(behind, up);
      else A.missile.position.set(0, 0, 5.4 * (1 - push));
    }
    // ống phóng giật nảy trên giá: quả mới đập vào chốt hãm (mạnh, tắt nhanh) / vỏ rỗng bị giật bật ra / nắp đóng (nhẹ)
    const kick = (a, amp, w) => (pr > a && pr < a + w ? Math.sin(c01((pr - a) / w) * Math.PI) * amp * (1 - c01((pr - a) / w)) : 0);
    A.can.position.z = kick(AT.push[1], -0.22, 0.03) + kick(AT.spentOut[0], 0.12, 0.025) + kick(AT.capClose[0], 0.1, 0.05);
    A.capOpen.visible = !(load && pr >= AT.capClose[1]); A.capCover.visible = !A.capOpen.visible;
  }

  // nạp giàn rocket: pha của quả đang nạp (0..1) — mốc RK_PH
  function rocketPhase(u, G) {
    const n = G.muzzles.length, pr = 1 - u.reloadTimer / u.reloadDuration;
    return pr * n - Math.min(n - 1, Math.floor(pr * n));
  }
  // NHỊP NẠP 1 QUẢ ROCKET: cúi lấy ở lòng xe -> nhấc lên qua lỗ nóc & bê ra sau giàn -> kề mũi quả vào ĐÚNG miệng sau ống
  // của nó (nằm thẳng trục ống) -> trụ người -> tống một phát dứt khoát tới chốt hãm (đầu đạn trong ống hiện đúng lúc này —
  // recon_marten, ống giật khựng) -> buông tay. (Trước đây quả trên tay biến mất ngay lúc bắt đầu đẩy, tay đẩy vào khoảng
  // không, quả ngắn hơn quả trong ống & không nằm đúng trục ống)
  const RK_PH = { unlock: 0.06, open: 0.16, fetch: 0.24, lift: 0.34, align: 0.58, entry: 0.68, push: 0.76, seat: 0.90, lock: 0.98 };
  // tâm quả (trục z của giàn) theo pha: kề miệng ống (1/3 quả đã vào) -> trượt vào tới chỗ nằm
  function rocketZ(G, ph) {
    const RL = G.roundLen || 5.65, seat = G.seatZ !== undefined ? G.seatZ : -1.1, rear = G.rear !== undefined ? G.rear : 2;
    const entry = rear + RL / 2 - RL * 0.3;
    const e = Math.pow(c01((ph - RK_PH.push) / (RK_PH.seat - RK_PH.push)), 2.2);   // tăng tốc tới cuối, khựng ở chốt
    return entry + (seat - entry) * e;
  }
  function carryRocket(C, T, G, ph, hand, m) {
    let R = C.rocket;
    const show = ph >= RK_PH.lift && ph < RK_PH.seat;
    if (!show) { if (R) R.visible = false; return; }
    if (!R) {
      R = C.rocket = G.makeRound ? G.makeRound() : new THREE.Group();
      // đi qua lỗ nóc: vẽ ở lượt trong suốt sau lòng hố như xạ thủ
      R.traverse(o => { if (o.isMesh) { const m0 = o.material, mm = m0.clone(); mm.transparent = true; mm.opacity = 1; o.material = mm; o.renderOrder = 12; } });
      T.add(R);
    }
    R.visible = true;
    const RL = G.roundLen || 5.65;
    const tq = T.getWorldQuaternion(new THREE.Quaternion()).invert();
    const q = G.pivot.getWorldQuaternion(new THREE.Quaternion());
    R.quaternion.copy(tq.multiply(q));
    // bê trên tay: hai tay ôm nửa sau quả (tâm quả ở trước giữa hai tay)
    const fwd = V(0, 0, -1).applyQuaternion(q);
    const held = hand[0].clone().add(hand[1]).multiplyScalar(0.5).addScaledVector(fwd, RL / 2 - 0.9);
    // nằm đúng trục ống của nó
    const onAxis = m ? G.pivot.localToWorld(V(m.x, m.y, rocketZ(G, ph))) : held;
    const k = sm(c01((ph - RK_PH.align) / (RK_PH.entry - RK_PH.align)));
    R.position.copy(T.worldToLocal(held.lerp(onAxis, k)));
  }

  let SPENT_GEO = null;
  function tossSpent(u, A) {
    if (typeof ReloadFX === 'undefined' || !u.scene || !A.spent) return;
    if (!SPENT_GEO) { SPENT_GEO = new THREE.CylinderGeometry(0.44, 0.44, 4.6, 10); SPENT_GEO.rotateX(Math.PI / 2); SPENT_GEO.userData.shared = true; }
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3a33, roughness: 0.85 }); mat.userData.own = true;
    const m = new THREE.Mesh(SPENT_GEO, mat);
    m.castShadow = true; m.userData.half = 0.45;
    A.spent.updateWorldMatrix(true, false);
    const pos = A.spent.getWorldPosition(V(0, 0, 0));
    A.spent.getWorldQuaternion(m.quaternion);
    const q = new THREE.Quaternion();
    u.turretGroup.getWorldQuaternion(q);
    const side = V(1, 0.15, 0.4).applyQuaternion(q);
    ReloadFX.toss(u.scene, m, pos, { x: side.x * 14, y: 10, z: side.z * 14 }, { x: 0.8, y: 1.6, z: -2.4 }, 12);
  }

  const REPLACE_T = 7.5;   // giây từ lúc xạ thủ hy sinh tới khi người dự bị lên thay
  // KÉO XÁC: người dự bị nhô lên trong khoang từ MATE_IN, nắm quai vai áo giáp xác từ PULL_T, giật 3 nhịp kéo xuống
  // (deadPull: 0 -> 1); trèo lên thay: F.newbie > CLIMB_T là đang bám mép lỗ đu người lên
  const MATE_IN = 1.4, PULL_T = 1.95, CLIMB_T = 0.75, CLIMB_TOTAL = 2.2;
  const TUGS = [[2.05, 0.3], [2.7, 0.35], [3.3, 0.35]];
  function deadPull(t) {
    let g = 0;
    for (const [t0, a] of TUGS) g += a * sm(Math.max(0, Math.min(1, (t - t0) / 0.2)));
    return g;
  }
  // đổi quân phục / áo giáp sang bản thẫm máu (on) hoặc trả lại vật liệu gốc
  function deadTint(F, on) {
    F.deadTint = on;
    for (const m of F.meshes) {
      if (on) {
        if (m.material === F.M.uni) { m.userData.mat0 = m.material; m.material = F.M.dead; }
        else if (m.material === F.M.vest) { m.userData.mat0 = m.material; m.material = F.M.deadVest || F.M.vest; }
      } else if (m.userData.mat0) { m.material = m.userData.mat0; m.userData.mat0 = null; }
    }
  }
  // người dự bị: dựng lần đầu khi cần (xe bot không tốn thêm hình người tới khi xạ thủ hy sinh), đứng sau xạ thủ trong khoang
  function ensureMate(u, C) {
    if (C.mate) return C.mate;
    const M = buildFigure(u.team);
    M.base = (C.gunner && C.gunner.base ? C.gunner.base : V(0, -0.9, 2.4)).clone();
    M.root.position.copy(M.base); M.root.visible = false;
    M.rise = -4.4; M.mateOn = false;
    C.turret.add(M.root);
    return (C.mate = M);
  }
  // Hoạt cảnh người dự bị kéo xác: lỗ nóc chỉ vừa MỘT người (~0,85 m) -> người dự bị đứng DƯỚI NÓC phía sau (khuất, đầu
  // thấp hơn mặt nóc), chỉ hai cánh tay vươn vào lòng lỗ túm thắt lưng sau của xác, ngồi thụp theo từng nhịp giật kéo xác tụt
  // xuống (xác tụt theo — xem tư thế hy sinh). Trước đây đứng ngay sau lưng xác trong lỗ -> hai thân người lồng vào nhau
  // Chỉ hiện 2 cánh tay của hình người (người dự bị ở trong khoang dưới nóc: thân & đầu không bao giờ lộ ra ngoài — nóc thân
  // xe phía sau thấp hơn vành tháp nên để cả người thì mũ chọc xuyên nóc). armsOnly(F, false) trả lại cả người
  function armsOnly(F, on) {
    if (!F.armMesh) {
      const arm = new Set();
      for (const a of F.arms) for (const g of [a.up, a.fore, a.hand]) if (g) g.traverse(o => arm.add(o));
      F.armMesh = new Set(F.meshes.filter(m => arm.has(m)));
    }
    if (F.armsOnly === on) return;
    F.armsOnly = on;
    for (const m of F.meshes) if (!F.armMesh.has(m)) m.visible = !on;
  }
  function animateMate(u, C, D, dt0, dt) {
    const M = C.mate;
    if (!M || M === D) return;
    const on = !!(C.down && C.down.pull) && !u.isDead && dt0 >= MATE_IN && dt0 < PULL_T + 2.1;
    M.root.visible = on;
    armsOnly(M, true);
    if (!on) { M.mateOn = false; M.rise = -4.4; return; }
    if (!M.mateOn) { M.mateOn = true; M.hT = null; M.rise = -4.4; }
    // dưới nóc sau lỗ: đầu (cả mũ) nằm hẳn ngoài bán kính lỗ (>= ~4) và dưới mặt nóc -> từ ngoài chỉ thấy 2 cánh tay vươn
    // vào lòng lỗ; mỗi nhịp giật ngồi thụp thêm
    const wantRise = -4.6 - (dt0 < PULL_T ? 0 : 1.1 * deadPull(dt0));
    M.rise += (wantRise - M.rise) * (1 - Math.exp(-dt * (dt0 < PULL_T ? 5 : 8)));
    M.root.position.set(M.base.x + 0.3, M.base.y + M.rise, M.base.z + 5.1);
    M.root.rotation.y = 0;
    M.torso.rotation.set(-0.2, 0, 0, 'YXZ');
    M.head.rotation.set(0.35, 0, 0, 'YXZ');
    M.root.updateMatrixWorld(true);
    D.root.updateMatrixWorld(true);
    // thắt lưng sau của xác (hai bên hông, phía lưng)
    const grab = D.arms.map(a => D.root.localToWorld(V(a.s * 0.75, 0.35, 0.6)));
    const H = M.hT || (M.hT = grab.map(g => g.clone().add(V(0, -1.5, 0))));
    const kh = 1 - Math.exp(-dt * (dt0 < PULL_T ? 9 : 30));
    for (let i = 0; i < 2; i++) H[i].lerp(grab[i], kh);
    for (const arm of M.arms) {
      const sh = M.chest.localToWorld(arm.sh.clone()); M.root.worldToLocal(sh);
      solveArm(M, arm, H[arm.s < 0 ? 0 : 1], sh.add(V(arm.s * 2.2, -2.4, 0.6)));
    }
  }
  const GUNNERS = 2;       // số người đứng súng mỗi xe trinh sát (xạ thủ + 1 dự bị)
  let BLOOD = null;
  // Máu: tia máu văng (giọt rơi theo trọng lực) từ ngực / đầu + vệt máu đọng trên tấm chắn súng & nóc quanh lỗ
  function bloodBurst(u, C) {
    const F = C.gunner;
    if (!F || typeof ReloadFX === 'undefined' || !u.scene) return;
    if (!BLOOD) {
      BLOOD = { geo: new THREE.SphereGeometry(0.09, 5, 4), mat: new THREE.MeshStandardMaterial({ color: 0x5c0a08, roughness: 0.35 }) };
      BLOOD.geo.userData.shared = true;
    }
    const at = F.chest.localToWorld(V(0, 2.6, -0.9));
    const q = new THREE.Quaternion(); u.turretGroup.getWorldQuaternion(q);
    const back = V(0, 0.3, 1).applyQuaternion(q);
    // sương máu: đám hơi đỏ sẫm phụt ra sau lưng chỗ trúng, loãng & tan nhanh (thấy rõ cả từ xa, khác khói súng)
    if (typeof SpgFXPool !== 'undefined' && u.fxParticles && u.scene) {
      for (let k = 0; k < 4; k++) {
        const p = SpgFXPool.acquire(u.scene, 'smoke', 0x7a0b09, 0.55);
        p.position.copy(at);
        u.fxParticles.push({ mesh: p, base: 0.7 + k * 0.35, vx: back.x * (4 + k * 2.5) + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2,
          vz: back.z * (4 + k * 2.5) + (Math.random() - 0.5) * 2, scale: 0.6, alpha: 0.55, growSpeed: 2.2, rotSpeed: (Math.random() - 0.5), drag: 3, life: 0.7 + k * 0.15 });
      }
    }
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(BLOOD.geo, BLOOD.mat);
      const sc = 0.5 + Math.random(); m.scale.setScalar(sc); m.userData.half = 0.05;
      ReloadFX.toss(u.scene, m, at.clone(), { x: back.x * (3 + Math.random() * 6) + (Math.random() - 0.5) * 5, y: 2 + Math.random() * 5, z: back.z * (3 + Math.random() * 6) + (Math.random() - 0.5) * 5 }, { x: 0, y: 0, z: 0 }, 2.5);
    }
    // vệt máu đọng: tấm dẹt đỏ sẫm trên nóc sau lỗ & trên áo (gắn vào tháp — quay theo, mất khi người mới lên)
    if (!C.stains) {
      C.stains = new THREE.Group();
      const sm = new THREE.MeshStandardMaterial({ color: 0x3e0605, roughness: 0.3, transparent: true, opacity: 0.9, depthWrite: false });
      for (let i = 0; i < 4; i++) {
        const st = new THREE.Mesh(new THREE.CircleGeometry(0.4 + Math.random() * 0.5, 9), sm);
        st.rotation.x = -Math.PI / 2; st.position.set((Math.random() - 0.5) * 3, 0.66, 3.6 + Math.random() * 1.5);
        st.userData.isFxDecal = true; C.stains.add(st);
      }
      C.turret.add(C.stains);
    }
    C.stains.visible = true;
  }

  // Tiếng xạ thủ hy sinh: xe mình nghe rõ (kèm tín hiệu bộ đàm báo thương vong); xe khác nghe theo khoảng cách
  function gunnerDownSound(u) {
    const se = window.soundEngine, g = window.game;
    if (!se || !se.playGunnerDown || !g) return;
    const L = g.audioListener ? g.audioListener() : g.player;
    const own = u === g.player, d = own || !L ? 0 : Math.hypot(u.x - L.x, u.z - L.z);
    if (d < 700) se.playGunnerDown(d, { x: u.x, z: u.z }, own);
  }

  function bloodDrip(u, C, t) {
    const F = C.gunner;
    if (!F || !BLOOD || typeof ReloadFX === 'undefined' || !u.scene) return;
    const at = F.chest.localToWorld(V((Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 0.8, -1.0));
    const m = new THREE.Mesh(BLOOD.geo, BLOOD.mat);
    m.scale.set(0.35, 0.6, 0.35); m.userData.half = 0.03;
    ReloadFX.toss(u.scene, m, at, { x: (Math.random() - 0.5) * 0.4, y: -0.5, z: (Math.random() - 0.5) * 0.4 }, { x: 0, y: 0, z: 0 }, 1.5);
    if (C.stains) for (const st of C.stains.children) { const k = Math.min(1.8, 1 + t * 0.15); st.scale.set(k, k, 1); }
  }

  // ---------- MỖI KHUNG HÌNH ----------
  function animate(u, dt) {
    const C = u.crew;
    if (!C || !(dt > 0)) return;
    const d = u.dmg;
    let F = C.gunner;
    C.loadShift = 0; C.loadZ = 0; C.lean = 0;
    let gDead = !!(d && d.lost && d.lost.has('crewGunner'));
    const dDead = !!(d && d.lost && d.lost.has('crewDriver'));
    // XẠ THỦ HY SINH -> gục lên súng (máu bắn) -> đổ sụp xuống lòng xe -> xạ thủ dự bị (lái xe phụ) trèo lên thay sau
    // REPLACE_T giây. Trong lúc đó súng & tên lửa không ai điều khiển. Chạy trên mọi máy theo cờ 'crewGunner' đồng bộ
    const DN = C.down;
    // 2 người đứng súng mỗi xe (xạ thủ chính + 1 dự bị). Đếm theo lần chuyển sang "hy sinh" — mọi máy thấy cùng cờ
    // 'crewGunner' nên cùng đếm được; hồi sinh xe đặt lại (spg.respawn)
    if (C.left === undefined) { C.left = GUNNERS; C.max = GUNNERS; }
    C.replaceT = REPLACE_T;
    if (gDead && !u.isDead) {
      if (!DN) {
        // hướng giật khác nhau giữa các lần trúng; giữ nguyên suốt hoạt cảnh để thân / đầu / tay không đổi phía giữa chừng
        C.down = { t: 0, side: Math.random() < 0.5 ? -1 : 1 };
        if (C.left > 1) ensureMate(u, C);   // người dự bị (kéo xác xuống rồi trèo lên thay)
        C.left = Math.max(0, C.left - 1);
        C.down.pull = C.left > 0;   // còn người dự bị: kéo xác xuống rồi lên thay
        bloodBurst(u, C);
        gunnerDownSound(u);
        if (u.isPlayer && window.game) window.game.addCombatLog(C.left > 0 ? '[[user-x]] XẠ THỦ HY SINH — người dự bị sẽ lên thay (còn ' + C.left + '/' + C.max + ')' : '[[user-x]] XẠ THỦ CUỐI CÙNG HY SINH — không còn ai đứng súng & nạp tên lửa tới khi xe hồi sinh', 'alert');
      }
      else {
        DN.t += dt;
        // máu rỉ: giọt nhỏ chảy từ vết thương xuống người / nóc trong ~5 s, vệt máu loang rộng dần
        DN.drip = (DN.drip || 0) - dt;
        if (DN.t < 5.5 && DN.drip <= 0) { DN.drip = 0.18 + Math.random() * 0.2; bloodDrip(u, C, DN.t); }
        if (DN.t >= REPLACE_T && !dDead && C.left > 0) {
          d.lost.delete('crewGunner'); C.down = null; gDead = false;
          // NGƯỜI DỰ BỊ LÊN THAY: đổi hình người đứng súng sang người dự bị (người khác hẳn, không phải xác cũ sống lại);
          // xác nằm lại trong khoang (ẩn), lần sau dùng lại làm người dự bị
          const M = C.mate;
          if (M) {
            const old = F;
            if (old.deadTint) deadTint(old, false);
            old.root.visible = false; old.rise = -3.6; old.hT = null; old.yaw = 0; old.root.rotation.y = 0;
            C.mate = old; F = C.gunner = M; M.mateOn = false; M.hT = null;
            armsOnly(M, false);   // người dự bị lên thay: hiện cả người
          }
          // trèo lên: tay bám mép lỗ, đu người lên (F.newbie > CLIMB_T) rồi mới nắm tay cầm súng
          if (C.gunner) {
            C.gunner.rise = -3.5; C.gunner.newbie = CLIMB_TOTAL; C.gunner.root.visible = true;
            C.gunner.bend = 0.55; C.gunner.twist = 0; C.gunner.hT = null;
            C.recoverT = CLIMB_TOTAL + 0.45; // thời gian trèo + áp vai / kiểm tra súng
          }
          if (u.isPlayer && window.game) window.game.addCombatLog('[[user-check]] Xạ thủ dự bị đang trèo lên vị trí — giữ hỏa lực', 'tip');
        }
      }
    } else if (DN && !gDead) C.down = null;
    if (!gDead && C.recoverT > 0) {
      const wasRecovering = C.recoverT;
      C.recoverT = Math.max(0, C.recoverT - dt);
      if (wasRecovering > 0 && C.recoverT <= 0 && u.isPlayer && window.game) window.game.addCombatLog('[[user-check]] Xạ thủ mới đã bám chắc tay cầm — vũ khí hoạt động lại', 'tip');
    }
    applyEffects(u, gDead || C.recoverT > 0, dDead, dt);

    const A = u._noAtgm ? null : u.atgmCan;   // giàn rocket: không có ống tên lửa (không hoạt cảnh nạp)
    const cd = u.antiTankCooldown || 0, cdMax = u.antiTankCooldownMax || 1;
    const S = C.st || (C.st = { lastCd: 0, at: false, tossed: false });
    if (cd > S.lastCd + 0.05 && !u.isDead) { S.at = true; S.tossed = false; S.puffs = 0; S.t = 0; }
    S.lastCd = cd;
    const atPr = S.at ? (cd > 0 ? 1 - cd / cdMax : 1) : 1;
    const has = u.missileAmmoCount === undefined || u.missileAmmoCount > 0;
    if (A) {
      animateLauncher(u, A, atPr, S.at, has, gDead);
      if (S.at) {
        S.t += dt;
        // khói thuốc phóng còn rỉ ra miệng & đuôi ống sau khi phóng
        if (S.puffs < 3 && S.t > 0.15 + S.puffs * 0.35 && typeof ReloadFX !== 'undefined' && u.getLauncherWorldTransform) {
          S.puffs++;
          const L = u.getLauncherWorldTransform();
          ReloadFX.puff(u, L.position, { x: L.direction.x * 0.3, y: 0.6, z: L.direction.z * 0.3 }, 0.5);
        }
        if (!S.tossed && atPr >= AT.toss && !gDead) { S.tossed = true; tossSpent(u, A); }
      }
      if (S.at && cd <= 0) S.at = false;
    }
    if (!F) return;
    // xa camera: không cần tính tư thế từng khung (giữ tư thế cũ)
    const cam = window.game && window.game.camera;
    if (cam && Math.hypot(cam.position.x - u.x, cam.position.z - u.z) > 900) return;

    u.group.updateMatrixWorld(true);
    const P = u.barrelPivot, T = C.turret, mg = C.mg;
    const gripNode = mg && mg.kick ? mg.kick : P;
    const gripLAt = mg && mg.gripL ? mg.gripL : V(-0.45, 0, 3.3);
    const gripRAt = mg && mg.gripR ? mg.gripR : V(0.45, 0, 3.3);
    const gripOrigin = gripNode.localToWorld(V(0, 0, 0));
    const gripAxis = gripNode.localToWorld(V(0, 1, 0)).sub(gripOrigin).normalize();
    const c = {
      // nắm đúng 2 tay cầm chữ D sau khóa nòng (recon_marten buildRingMount)
      // neo trực tiếp vào nhóm giật của súng: tay đi cùng tay cầm khi súng hất/lệch, không cần bù tọa độ về sau
      gripL: gripNode.localToWorld(gripLAt.clone()), gripR: gripNode.localToWorld(gripRAt.clone()), gripAxis, lift: (mg && mg.lift) || 0,
      r0: ((mg && mg.lift) || 0) + 0.8,   // tư thế đứng súng (súng nằm ngang): mốc độ cao cho các động tác thao tác súng
      // cúi xuống lòng xe lấy đạn: trước bụng, dưới mép nóc
      hatchL: ws(T, F, -0.7, -1.2, -1.8), hatchR: ws(T, F, 0.6, -1.2, -1.7)
    };
    let tgt, onGrip = false;
    // (nạp thông minh: thay đạn cả khi hộp / giàn còn đạn — spg scoutSmartReload)
    const mgReload = !u.isDead && u.reloadTimer > 0 && u.reloadDuration > 0;
    // giàn rocket trên chân đế là trạm điều khiển từ xa: xạ thủ ngồi trong xe, chỉ trèo ra khi hết giàn để nhét đạn
    const G = u.mainGun && u.mainGun.kind === 'rocket' ? u.mainGun : null;
    // XE NGƯỜI CHƠI — CHẾ ĐỘ LÁI: không ngắm / khóa mục tiêu / bắn / nạp -> xạ thủ chui xuống đóng nắp (chậm 1.5 s sau khi
    // thôi chiến đấu). Mở kính ngắm, khóa mục tiêu hay bóp cò -> nhô lên sau ~0.35 s (nắp mở trước rồi mới nhô người);
    // chưa lên tới súng thì chưa bắn được (crewHidden). Xe bot / xe máy khác luôn đứng súng
    {
      const g = window.game;
      // (khóa drone bằng radar / ngắm trời cũng là đang chiến đấu: trước đây xạ thủ vẫn chui trong xe -> vòng súng bị giữ,
      //  máy tính hỏa lực tính điểm đón đầu nhưng súng không quay theo drone)
      // người chơi bấm H: xạ thủ chui vào xe & ở yên trong xe (bỏ qua mọi lý do nhô lên) tới khi bấm lại
      const stay = u.isPlayer && !!u._crewStay && !gDead;
      const combat = !stay && (!u.isPlayer || !g || !!g._sight || !!(g.lockedTarget && !g.lockedTarget.isDead) || !!g._airAim || !!u.isFiringGatling
        || performance.now() - (u._wantUpT || 0) < 1500
        || mgReload || (S.at && A && atPr < 1));
      C.combatT = combat ? Math.max(0, C.combatT || 0) + dt : Math.min(0, C.combatT || 0) - dt;
      if (C.hidden === undefined) C.hidden = !combat;
      if (stay) {
        if (!C.hidden) { C.hidden = true; C.hideT = 0; }
        // ở trong xe không thao tác được bên ngoài: thay đạn / nạp tên lửa / nạp giàn dừng tại chỗ
        if (u.reloadTimer > 0) u.reloadTimer += dt;
        if (u.antiTankCooldown > 0 && S.at) u.antiTankCooldown += dt;
      }
      else if (C.hidden && C.combatT > 0.35) C.hidden = false;
      else if (!C.hidden && C.combatT < -8) C.hidden = true;   // thôi chiến đấu ~8 s mới chui vào xe
      // lên tới súng rồi còn cần ~0.6 s áp vai, lấy đường ngắm mới bắn được (nhảy lên là bóp cò ngay thì không thật)
      C.readyT = !C.hidden && F.rise > -2.0 && Math.abs(F.rise - (F.tgtRise || 0)) < 0.35 ? (C.readyT || 0) + dt : 0;
      if (d) d.crewHidden = !gDead && !G && (!!C.hidden || C.readyT < 0.6);
      // người còn ở trong xe (chưa lên tới vòng súng): tháp không ai quay (spg.js)
      // ghi lên xe (u.dmg chỉ có sau khi xe bị trúng đạn lần đầu -> trước đây cờ không có tác dụng, tháp vẫn tự quay)
      // (thụp sau tấm chắn lúc phóng / dẫn tên lửa — trước mốc mở nắp ống: vẫn cầm kính, tháp vẫn quay bám mục tiêu)
      const guiding = !!(S.at && A && atPr < AT.capOpen[0]);
      u._crewInside = !gDead && !G && (!!C.hidden || (F.rise < -1.2 && !guiding));
      u._crewHidden = !gDead && !G && (!!C.hidden || C.readyT < 0.6);
    }
    const dt0 = C.down ? C.down.t : 99;
    const deadSide = C.down && C.down.side || 1;
    if (gDead || u.isDead) {
      // HY SINH: giật ngửa 0,22 s (tay bật khỏi tay cầm) -> khuỵu gối, gục về trước lên mép lỗ nghiêng sang bên, hai tay
      // buông thõng qua mép -> (còn người dự bị) bị kéo xuống khoang theo 3 nhịp giật: người ngửa ra sau, hai tay bị kéo
      // hất lên mép lỗ. Xe bị phá hủy: gục lại trên súng
      const pulling = gDead && !u.isDead && !!(C.mate && C.down && C.down.pull) && dt0 >= PULL_T, pull = pulling ? deadPull(dt0) : 0;
      const ds = C.down && C.down.side || 1;
      // 0-0,1 s: phản xạ giật lệch khỏi hướng trúng; 0,1-0,34 s: hai tay mất lực rời tay cầm; 0,34-0,7 s:
      // đầu gối khuỵu, một tay quờ mép lỗ; sau đó mới gục hẳn. Tránh chuyển tức thì từ đứng bắn sang tư thế nằm trên vành.
      if (dt0 < 0.1) tgt = pose(ws(T, F, -1.4, 2.4, -0.7), ws(T, F, 1.35, 2.15, -0.8), 0.15, -0.35, ds * 0.42);
      else if (dt0 < 0.34) tgt = pose(lerpV(c.gripL, ws(T, F, -1.7, 1.25, -1.5), 0.75), lerpV(c.gripR, ws(T, F, 1.55, 0.9, -1.8), 0.75), -0.1, 0.15, ds * 0.5);
      else if (dt0 < 0.7) tgt = pose(ws(T, F, -1.65, 0.55, -2.35), ws(T, F, 1.45, 0.35, -2.55), -0.48, 0.48, ds * 0.4);
      // gục vừa phải: đầu cúi gằm nhưng vẫn trong lòng lỗ (cúi sâu hơn thì đầu cắm xuyên vành lỗ phía trước), hai cẳng tay
      // vắt lên vành trước
      else if (!pulling) tgt = pose(ws(T, F, -1.4, 0.5, -2.5), ws(T, F, 1.25, 0.35, -2.6), -0.55, 0.55, ds * 0.3);
      else tgt = pose(ws(T, F, -1.6, 1.0 + 0.8 * pull, 0.2), ws(T, F, 1.5, 1.2 + 0.8 * pull, 0.4), -0.55 - 3.2 * pull, 0.55 - 0.95 * Math.min(1, pull * 2.2), ds * 0.3 * (1 - pull));
    } else if (S.at && A && atPr < 1) {
      const can = A.can;
      Object.assign(c, {
        tubeL: wp(can, 0.25, 0.62, 1.2),
        capH: wp(A.rearCap, 0, -1.15, 0.2),
        spentL: wp(spentOf(A), -0.35, 0.1, 2.3), spentR: wp(spentOf(A), 0.38, 0.0, 2.25),
        tossL: ws(T, F, 3.6, 4.6, -0.8), tossR: ws(T, F, 3.9, 4.1, -2.0),
        // tay ôm ngoài vỏ quả: trái đỡ dưới thân trước, phải đỡ dưới thân sau rồi chuyển ra tì đuôi quả để đẩy
        misL: wp(A.missile, 0, -0.56, -1.4), misR: atPr < AT.newUp[1] ? wp(A.missile, 0, -0.56, 0.4) : wp(A.missile, 0, 0.05, 1.42)
      });
      tgt = track(AT_KEYS, atPr, c);
    } else if (G && mgReload) {
      // nạp lại giàn: mỗi quả = cúi xuống cửa nóc lấy đạn -> đẩy vào đuôi ống kế tiếp (đầu đạn hiện dần — recon_marten)
      const n = G.muzzles.length, pr = 1 - u.reloadTimer / u.reloadDuration;
      const i = Math.min(n - 1, Math.floor(pr * n)), ph = pr * n - i, m = G.muzzles[n - 1 - i];
      C.rkTube = m;
      C.fastHands = ph >= RK_PH.align && ph < RK_PH.lock;   // tay bám sát quả / nắp khi căn, tống và khóa
      const rz = G.rear !== undefined ? G.rear : 1.24;   // đuôi ống (hộp phóng có người của xe trinh sát: G.rear)
      const RL = G.roundLen || 5.65, tz = rocketZ(G, ph) + RL / 2;   // đuôi quả đang nạp (trên trục ống)
      const tube = wp(G.pivot, m.x, m.y, rz + 0.3);
      const cap = G.rearCaps && G.rearCaps[n - 1 - i];
      const capLatch = cap ? wp(cap, 0, -0.82, 0.08) : tube;
      const capEdge = cap ? wp(cap, 0, -0.35, 0.08) : tube;
      // chuyển trọng tâm về phía ống đang nạp; lúc nhấc quả thì lùi hông, lúc tống thì dồn hông tới trước
      C.loadShift = Math.max(-0.3, Math.min(0.3, -m.x * 0.09)) * Math.sin(Math.PI * Math.min(1, ph / RK_PH.lock));
      C.loadZ = ph < RK_PH.align ? 0.2 * c01((ph - RK_PH.fetch) / (RK_PH.align - RK_PH.fetch))
        : ph < RK_PH.seat ? -0.12 * c01((ph - RK_PH.push) / (RK_PH.seat - RK_PH.push)) : 0;
      // hai tay ôm đuôi quả: tay phải tì đáy đuôi (đẩy), tay trái đỡ bên hông thân quả
      const tailR = wp(G.pivot, m.x + 0.12, m.y - 0.05, tz + 0.12), tailL = wp(G.pivot, m.x - 0.3, m.y - 0.12, tz - 0.6);
      tgt = ph < RK_PH.unlock ? pose(tube, capLatch, 1.2, 0.12)                                         // một tay đỡ miệng ống, một tay tìm lẫy
        : ph < RK_PH.open ? pose(tube, capEdge, 1.2, 0.2)                                               // giật lẫy và đẩy nắp dựng lên
        : ph < RK_PH.fetch ? pose(c.hatchL, c.hatchR, 0.1, 0.65)                                        // hạ hai tay xuống lỗ nóc
        : ph < RK_PH.lift ? pose(c.hatchL, c.hatchR, 0.35, 0.78)                                        // ôm quả trong giá chứa, lấy đúng trọng tâm
        : ph < RK_PH.align ? pose(lerpV(tube, c.hatchL, 0.2), tube, 1.35, 0.2, -0.08)                   // nhấc lên, xoay ngang và bê ra sau giàn
        : ph < RK_PH.push ? pose(tailL, tailR, 1.4, ph < RK_PH.entry ? 0.12 : 0.02)                      // kề mũi vào miệng ống, lùi vai lấy đà
        : ph < RK_PH.seat ? pose(tailL, tailR, 1.4, 0.02 + 0.3 * c01((ph - RK_PH.push) / (RK_PH.seat - RK_PH.push)))    // đẩy hai nhịp, thân dồn theo
        : ph < RK_PH.lock ? pose(tube, capEdge, 1.25, 0.2)                                               // kéo nắp xuống
        : pose(tube, capLatch, 1.2, 0.16);                                                               // ép lẫy khóa, kiểm tra bằng tay
    } else if (G) {
      tgt = pose(c.hatchL, c.hatchR, -3.2, 0);   // ngồi thụp trong xe, giàn tự xoay ngắm
    } else if (mgReload && mg) {
      const pr = mgReloadPr(u);
      // tay kéo lên đạn: chỗ nghỉ phía trước / lùi hết (theo súng đang lắp). Tay về trước chậm hơn tay kéo bật về -> đọc ra
      // là buông tay cho lò xo đẩy, không phải đẩy tay kéo về
      const ca = mg.chargeAt || { x: 0.56, y: 0.12, z: 1.12, len: 1.0 };
      const hp = pr < 0.92 || pr >= 0.97 ? (pr >= 0.97 ? 1 : 0) : pr < 0.94 ? sm((pr - 0.92) / 0.02) : pr < 0.952 ? 1 - sm((pr - 0.94) / 0.012) : pr < 0.955 ? 0 : sm((pr - 0.955) / 0.015);
      // buông tay kéo: bàn tay bật khỏi thanh nắm (ra ngoài, hơi lên) rồi mới đưa về trước nắm lại / về tay cầm — tay kéo
      // lò xo đập về một mình, không phải tay đẩy nó về
      const away = pr < 0.94 ? 0 : pr < 0.944 ? sm((pr - 0.94) / 0.004) : pr < 0.95 ? 1 : pr < 0.955 ? 1 - sm((pr - 0.95) / 0.005) : pr < 0.97 ? 0 : sm(Math.min(1, (pr - 0.97) / 0.004));
      // thân: tay kéo nằm giữa thành hộp khóa nòng, xa hơn tầm tay người đứng thẳng sau tay cầm (vai -> tay kéo ~4.9, tay
      // dài 4.45) -> chồm người qua súng, vai phải đưa tới để nắm (hp 0), rồi vừa kéo vừa ngả người về, vai phải lùi (hp 1)
      c.chBend = 0.5 - 0.22 * hp;
      c.chTwist = 0.22 - 0.3 * hp;
      // đang nắm tay kéo: bàn tay bám sát thanh nắm (bộ lọc mượt thường làm tay trễ ~0.2 sau tay kéo đang chạy)
      if (pr >= 0.92 && pr < 0.974 && away < 0.01) C.fastHands = true;
      Object.assign(c, {
        coverH: mg.coverAt ? mg.cover.localToWorld(mg.coverAt.clone()) : wp(mg.cover, 0, 0.3, 1.55),
        // tay phải: cổ tay trên quai nắp hộp (bàn tay chúc xuống nắm quai); tay trái: cổ tay dưới mép đáy phía sau, bàn tay luồn
        // ra trước đỡ đáy. Hộp đã quăng đi / chưa lấy: tay để trước ngực
        boxH: mg.ammo.visible ? wp(mg.ammo, 0.02, 0.88, 0.22) : ws(T, F, 0.5, 1.6, -1.5),
        boxH2: mg.ammo.visible ? wp(mg.ammo, -0.12, -0.62, 0.58) : ws(T, F, -0.8, 1.5, -1.4),
        tossL: ws(T, F, -3.4, 4.4, -2.6), tossR: ws(T, F, -3.0, 4.9, -1.8),
        restL: ws(T, F, -0.9, 1.5, -1.4), restR: ws(T, F, 0.6, 1.4, -1.5),
        chargeH: wp(mg.charge ? mg.charge.parent : P, ca.x + 0.28 * away, ca.y + 0.12 * away, ca.z + ca.len * hp),   // 12.7: theo thân súng đang hạ dần
        lidH: mg.ammoLid ? wp(mg.ammoLid, mg.lidEdge || 1.35, 0.1, 0.0) : wp(mg.cover, 0, 0.3, 1.55),
        beltT: mg.beltTip ? wp(P, mg.beltTip.x, mg.beltTip.y + 0.12, mg.beltTip.z) : wp(P, -0.5, 0.4, 0.6)
      });
      tgt = track(MG_KEYS, pr, c);
      C.loadZ = tgt.lz;
    } else if (C.hidden) {
      // CHUI VÀO XE & ĐÓNG NẮP: với tay phải ra sau nắm quai mép nắp (gần bản lề) -> vừa hạ người vừa kéo nắp sập theo,
      // tay bám quai tới khi nắp đóng hẳn rồi mới buông xuống
      // nắp có thanh xoắn trợ lực: xạ thủ quay người ra sau, đẩy nắp dựng đứng rồi nắm quai chữ U mặt trong, vừa thụp
      // xuống vừa kéo sập nắp; tay kia chống lên mép vòng
      const ht = C.hideT || 0, lz = u.hatchLid ? -(u.hatchLid.position.z) * (u.hatchLid.userData.grip || 0.45) : 0;
      // hai tay cùng nắm quai chữ U (không chống lên vành: tay đè xuyên vành khi thụp xuống)
      // (đích IK là cổ tay, bàn tay chìa thêm ~0.6 theo cẳng tay -> đặt cổ tay dưới thanh quai, không thì bàn tay xuyên lên mặt nắp)
      const pull = u.hatchLid ? wp(u.hatchLid, 0.3, -1.05, lz) : c.hatchR, rim = u.hatchLid ? wp(u.hatchLid, -0.3, -1.05, lz) : c.hatchL;
      // QUAY NGƯỜI RA SAU (bản lề nắp ở sau lưng): buông súng, cả người xoay tại chỗ ~180° quanh trục đứng (F.yaw — xoay
      // nguyên khối người ở tâm lỗ, không vặn thân: vặn vai thì vai / tay quét xuyên thành vòng) -> nắm quai bằng hai tay
      // trước mặt, đẩy nắp dựng đứng, rồi vừa thụp xuống vừa kéo sập. Trước đây đứng quay lưng với tay ngoặt ra sau đầu.
      // Đã quay lại thì tay trái ở phía +x của tháp -> nắm bên +x của quai (không bắt chéo tay)
      tgt = ht < 0.1 ? pose(c.gripL, c.gripR, -0.2, 0, 0)
        : ht < 0.7 ? pose(pull, rim, -0.3, 0.12, 0)
        // thụp sâu (~ -4.8 như người dự bị ngồi khoang): thụp nông thì đỉnh mũ còn cao hơn mặt dưới nắp -> mũ lòi qua nắp
        : ht < 1.55 ? pose(pull, rim, -0.3 - 4.5 * sm((ht - 0.7) / 0.6), 0.35, 0)
        : pose(ws(T, F, 0.7, -1.2, 1.8), ws(T, F, -0.6, -1.2, 1.7), -4.8, 0);   // ngồi trong xe, tay trước bụng (đã quay ra sau)
    } else if (F.newbie > 0) {
      // NGƯỜI DỰ BỊ TRÈO LÊN: bám mép -> kéo vai qua vành -> chống một tay đứng dậy -> chuyển từng tay sang súng.
      // Giữ ít nhất một điểm tựa ở mọi pha, tránh model nổi thẳng từ khoang lên rồi cả hai tay cùng "teleport" vào tay cầm.
      const cl = c01(1 - F.newbie / CLIMB_TOTAL);
      const rimL = ws(T, F, -1.75, 0.42, -1.15), rimR = ws(T, F, 1.75, 0.42, -1.15);
      if (cl < 0.22) tgt = pose(rimL, rimR, -3.15 + cl / 0.22 * 0.55, 0.62, 0);
      else if (cl < 0.5) tgt = pose(rimL, rimR, -2.6 + (cl - 0.22) / 0.28 * 1.15, 0.5, -0.12);
      else if (cl < 0.72) tgt = pose(rimL, c.gripR, -1.45 + (cl - 0.5) / 0.22 * 0.85, 0.28, -0.08);
      else if (cl < 0.9) tgt = pose(c.gripL, c.gripR, -0.6 + (cl - 0.72) / 0.18 * 0.5, 0.12, 0);
      else { tgt = pose(c.gripL, c.gripR, 0, 0, 0); onGrip = true; }
    } else {
      // tay cầm hạ thấp khi súng ngóc lên (đuôi súng chúi xuống): xạ thủ khuỵu thấp người theo, không để tay đè lên vòng.
      // Ngóc cao (bắn drone, tới 70°): tay cầm vừa thấp vừa chồm ra ngoài mép trước lỗ nóc -> thụp xuống thì vai / lưng /
      // tay cắm xuyên vành. Như xạ thủ thật: đứng lên bậc, chồm người qua mép trước, ấn tay cầm xuống
      // (mg.lift: trụ súng cao hơn bản đầu -> mọi độ cao tay cầm dời lên đúng chừng đó, xạ thủ đứng cao lên theo)
      const L = c.lift, gl = T.worldToLocal(c.gripL.clone()), gy = gl.y - L;
      const ahead = c01((-(gl.z - F.base.z) - 3.55) / 1.6);   // tay cầm vượt chỗ cầm bình thường (z -3.3 so với chỗ đứng)
      const crouch = Math.max(-1.6, Math.min(0.8, (gy - 1.8) * 0.9));
      tgt = pose(c.gripL, c.gripR, L + crouch + (0.55 - crouch) * sm(ahead), Math.max(0, (1.8 - gy) * 0.12) + 0.55 * ahead);
      C.loadZ = -1.1 * sm(ahead);
      C.lean = sm(ahead);
      onGrip = true;
    }

    // NẮP LỖ NÓC: chỉ mở khi xạ thủ cần nhô lên (đứng súng / trèo ra nhét rocket); ngồi hẳn trong xe thì đóng. Nắp mở gần
    // hết rồi mới nhô người lên; người thụp hẳn xuống rồi nắp mới đóng (không chui xuyên qua nắp)
    const lid = u.hatchLid;
    if (lid) {
      const open = lid.userData.open || 1.95;
      if (C.hidden && !gDead) {
        // nắp do tay xạ thủ kéo: đóng theo nhịp hạ người (xem tư thế "chui vào xe" ở trên)
        C.hideT = (C.hideT || 0) + dt;
        const ht = C.hideT, vert = Math.PI / 2 + 0.15;
        lid.rotation.x = ht < 0.7 ? open + (vert - open) * sm((ht - 0.25) / 0.45) : vert * (1 - sm((ht - 0.9) / 0.75));   // nắp sập theo sau đầu (người thụp xuống trước)
      } else {
        C.hideT = 0;
        const up = gDead || tgt.rise > -2.4;
        const want = up ? open : F.rise < -2.8 ? 0 : lid.rotation.x;
        lid.rotation.x += (want - lid.rotation.x) * (1 - Math.exp(-dt * 6));
        if (up && lid.rotation.x < open - 0.45) tgt.rise = Math.min(tgt.rise, -3.0);
      }
    }
    F.tgtRise = tgt.rise;
    // thân người: nhô lên / cúi / vặn mượt (không giật cục khi đổi hoạt cảnh)
    if (F.newbie > 0) F.newbie -= dt;
    const k = 1 - Math.exp(-dt * (gDead ? (dt0 < 0.22 ? 9 : dt0 >= PULL_T && C.down && C.down.pull ? 7 : 3) : F.newbie > 0 ? 4 : 10));
    F.rise += (tgt.rise - F.rise) * k; F.bend += (tgt.bend - F.bend) * k; F.twist += (tgt.twist - F.twist) * k;
    // CHUYỂN ĐỘNG TỰ NHIÊN: xe tăng / giảm tốc -> người ngả ra sau / chúi về trước, ôm cua -> nghiêng theo quán tính,
    // thở (ngực phồng xẹp), bóp cò -> vai rung theo súng; đầu đảo nhìn quanh khi rảnh, cúi nhìn tay khi nạp đạn
    F.t += dt;
    const spd = u.speed || 0, yaw = u.bodyAngle || 0;
    const acc = F.lastSpd === undefined ? 0 : (spd - F.lastSpd) / dt;
    let yr = F.lastYaw === undefined ? 0 : yaw - F.lastYaw;
    while (yr > Math.PI) yr -= Math.PI * 2;
    while (yr < -Math.PI) yr += Math.PI * 2;
    F.lastSpd = spd; F.lastYaw = yaw;
    const kl = 1 - Math.exp(-dt * 4);
    F.leanF = (F.leanF || 0) + (Math.max(-0.2, Math.min(0.2, acc * 0.0011)) - (F.leanF || 0)) * kl;
    F.roll += (Math.max(-0.16, Math.min(0.16, (yr / dt) * spd * 0.0009)) - F.roll) * kl;
    const firing = !gDead && !!u.isFiringGatling;
    // bắn: mỗi phát giật vai ra sau rồi hồi (lò xo tắt nhanh), thân rung theo súng
    // độ giật theo loại súng: 12.7 nhịp nhanh, giật ngắn; phóng lựu 40 mm nhịp chậm, mỗi quả đẩy vai mạnh & hồi chậm
    const gk = u.mainGun && u.mainGun.kind, RC = gk === 'agl' ? { amp: 0.18, decay: 5, body: 0.12 } : { amp: 0.11, decay: 12, body: 0.075 };
    // Bộ đếm phát bắn do model súng phát ra: không hụt xung vì thứ tự update / FPS và không kích hoạt lặp từ đuôi chớp lửa.
    const recoilSeq = u._crewRecoilSeq || 0;
    if (firing && recoilSeq !== (F.recoilSeq || 0)) F.kick = Math.min(1.35, (F.kick || 0) + 1);
    F.recoilSeq = recoilSeq;
    F.kick = (F.kick || 0) * Math.exp(-dt * RC.decay);
    // vai / thân nhận lực trễ nhỏ sau tay: đủ nhìn thấy khối người hấp thụ giật nhưng không rung toàn thân như súng đồ chơi
    const jit = F.kick * RC.body;
    // thụp xuống: người dịch về phía tâm lỗ (chỗ đứng lệch về mép sau mà thụp thẳng thì lưng / tay quệt thành vòng)
    const hiding = C.hidden && !gDead && lid;
    // (lùi về tâm ngay khi quay người: đứng sát mép sau mà kéo nắp thì khuỷu ra ngang chạm / lòi ra ngoài vành phía bản lề)
    F.dz = (F.dz || 0) + ((hiding && C.hideT > 0.2 ? -F.base.z * 0.7 : 0) - (F.dz || 0)) * (1 - Math.exp(-dt * 4));
    F.hp = (F.hp || 0) + ((hiding && C.hideT > 0.25 ? 1 : 0) - (F.hp || 0)) * (1 - Math.exp(-dt * 8));
    const loadK = 1 - Math.exp(-dt * 9);
    F.loadX = (F.loadX || 0) + ((C.loadShift || 0) - (F.loadX || 0)) * loadK;
    F.loadZ = (F.loadZ || 0) + ((C.loadZ || 0) - (F.loadZ || 0)) * loadK;
    F.root.position.set(F.base.x + F.loadX, F.base.y + F.rise, F.base.z + F.dz + F.loadZ);
    // cả người quay ra sau để đóng nắp (C.hidden); nhô lên lại thì quay về phía súng (~0,35 s)
    const bodyYaw = hiding && C.hideT > 0.08 ? Math.PI : 0;
    F.yaw = (F.yaw || 0) + (bodyYaw - (F.yaw || 0)) * (1 - Math.exp(-dt * 8));
    F.root.rotation.y = F.yaw;
    // đã chui hẳn vào xe: ẩn để không lòi qua nóc — đang kéo nắp thì giữ tới khi nắp sập hẳn (tay không biến mất giữa chừng)
    F.root.visible = F.rise > -2.9 || (hiding && lid.rotation.x > 0.06);
    // Ngực theo hông có độ trễ nhỏ: người thật giữ đầu / vai ổn định khi xe lắc, không quay cả khối như tượng gắn trên trục.
    F.chestLag = (F.chestLag || 0) + ((-F.leanF * 0.32 - F.roll * 0.16) - (F.chestLag || 0)) * (1 - Math.exp(-dt * 5));
    F.torso.rotation.set(-F.bend + F.leanF + jit, F.twist, (gDead ? deadSide * 0.18 : 0) + F.roll, 'YXZ');
    if (F.hips) F.hips.rotation.set(F.bend * 0.16 - F.leanF * 0.25, -F.twist * 0.22, -F.roll * 0.3, 'YXZ');
    const br = Math.sin(F.t * 1.55 + Math.sin(F.t * 0.17) * 0.18);
    // Không scale cả áo giáp / túi theo nhịp thở (trông như cao su). Chỉ nâng lồng ngực rất nhẹ và xoay một lượng khó nhận ra.
    F.chest.scale.set(1 + br * 0.0015, 1 + br * 0.001, 1 + br * 0.002);
    F.chest.position.y = br * 0.018;
    const idleBody = !gDead && !mgReload && !(S.at && A && atPr < 1) && !firing && !(F.newbie > 0) ? Math.sin(F.t * 0.43 + 0.7) * 0.009 : 0;
    F.chest.rotation.x = br * 0.004 + F.chestLag * 0.12;
    F.chest.rotation.y = idleBody * 0.55;
    F.chest.rotation.z = F.chestLag * 0.08 + idleBody;
    // hướng nhìn: nạp đạn -> cúi nhìn việc tay đang làm; bắn -> nhìn thẳng theo súng; rảnh -> đảo mắt quan sát
    const busy = !gDead && tgt !== null && (mgReload || (S.at && A && atPr < 1));
    // Quan sát theo điểm nhìn rời rạc: giữ một hướng vài giây, đảo nhanh sang hướng khác rồi lại dừng. Chuyển động sin liên tục khiến đầu
    // lắc đều như robot. Khi thao tác / bắn vẫn khóa mắt vào công việc hoặc đường ngắm.
    F.gazeT = (F.gazeT || 0) - dt;
    // ĐANG CHIẾN ĐẤU (bóp cò, vừa bắn xong một loạt, mở kính ngắm / khóa mục tiêu / ngắm trời): mắt dán theo đường ngắm dọc
    // nòng — không đảo nhìn quanh giữa các loạt bắn. Trước đây chỉ khóa nhìn đúng lúc đang bóp cò, buông cò là đầu lại quay
    C.fireHold = firing ? 3 : Math.max(0, (C.fireHold || 0) - dt);
    const gm = window.game;
    const aiming = onGrip && !gDead && !busy && !C.hidden && (firing || C.fireHold > 0
      || (u.isPlayer && !!gm && (!!gm._sight || !!(gm.lockedTarget && !gm.lockedTarget.isDead) || !!gm._airAim)));
    // ngẩng / cúi theo góc ngóc của súng (đầu ngả theo đường ngắm qua thước ngắm, không ngửa hết cỡ theo nòng)
    const aimPitch = Math.max(-0.3, Math.min(0.7, (P ? P.rotation.x : 0) * 0.7 + 0.02));
    if (F.gazeT <= 0 && !busy && !aiming && !gDead && !(F.newbie > 0)) {
      F.gazeT = 1.2 + Math.random() * 3.4;
      F.gazeYaw = (Math.random() - 0.5) * 0.92;
      F.gazePitch = (Math.random() - 0.5) * 0.16 - 0.01;
      F.gazeFast = 0.16 + Math.random() * 0.12;
    }
    const wantYaw = gDead ? deadSide * 0.28 : F.newbie > 0 ? -0.12 : busy ? -F.twist * 0.25 : aiming ? 0 : (F.gazeYaw || 0);
    const wantPitch = gDead ? -0.7 : F.newbie > 0 ? -0.32 : busy ? -0.45 : aiming ? aimPitch : (F.gazePitch || 0);
    const lookRate = busy || aiming || gDead ? 7 : (F.gazeFast > 0 ? 9 : 2.6);
    F.gazeFast = Math.max(0, (F.gazeFast || 0) - dt);
    F.look += (wantYaw - F.look) * (1 - Math.exp(-dt * lookRate));
    F.lookP += (wantPitch - F.lookP) * (1 - Math.exp(-dt * lookRate));
    F.head.rotation.set(F.lookP + F.bend * 0.55 - F.leanF * 0.5, F.look, -F.roll * 0.5, 'YXZ');
    F.root.updateMatrixWorld(true);
    const H = F.hT || (F.hT = [tgt.L.clone(), tgt.R.clone()]);
    const kh = 1 - Math.exp(-dt * (C.fastHands ? 45 : 16));
    C.fastHands = false;
    H[0].lerp(tgt.L, kh); H[1].lerp(tgt.R, kh);
    // tay nắm tay cầm đi đúng theo cụm súng giật / hất lên (12.7: lùi ngắn rung; 40 mm: lùi dài trên giá lò xo, nòng hất) —
    // lấy độ dời thật của tay cầm (nhóm giật so với khớp ngóc), cộng SAU bộ lọc mượt (không bị lọc mất, không tích lũy).
    // Trước đây cộng một độ lùi ước lượng vào luôn trạng thái tay: lệch với súng, tay cầm trượt xuyên qua bàn tay
    const hand = [H[0].clone(), H[1].clone()];
    // Khi đang bắn, mục tiêu tay cầm cần bám cứng theo frame hiện tại của súng; bỏ bộ lọc IK ở riêng hai bàn tay để
    // không xuất hiện một frame tay trượt khỏi cán sau mỗi cú giật. Các tư thế khác vẫn giữ nội suy mềm ở trên.
    if (onGrip) { hand[0].copy(c.gripL); hand[1].copy(c.gripR); }
    carryRocket(C, T, G, G && mgReload && !gDead ? rocketPhase(u, G) : -1, hand, C.rkTube);
    // khuỷu tay chĩa xuống & hơi ra ngoài, về sau (người thật ôm tay cầm súng máy) — không vắt ngược qua vai.
    // Kéo nắp (tay với lên quai sau đầu): khuỷu hếch lên & về trước, khép sát thân — khuỷu ra ngang / ra sau là cắm
    // xuyên vành lỗ khi người thụp xuống
    for (const arm of F.arms) {
      const sh = F.chest.localToWorld(arm.sh.clone()); F.root.worldToLocal(sh);
      const hp = F.hp || 0;
      // Hai khuỷu không bao giờ đối xứng tuyệt đối: tay thuận khép sát hơn, tay đỡ mở và thấp hơn. Sai khác nhỏ này đồng thời
      // làm vai / cẳng tay đọc rõ hơn khi nắm súng, bê hộp hay giữ rocket.
      const support = arm.s < 0 ? 1 : 0;
      // chồm qua mép trước (súng ngóc cao): khuỷu ra ngang thay vì chĩa xuống — chĩa xuống là cắm vào vành phía trước
      const pole = sh.add(V(arm.s * (3.5 - 3.1 * hp + 1.2 * C.lean) * (support ? 1.04 : 0.92),
        -2.2 + 4.2 * hp + 2.0 * C.lean - (support ? 0.14 : -0.05), 1.5 - 3.3 * hp + (support ? 0.12 : -0.08)));
      solveArm(F, arm, hand[arm.s < 0 ? 0 : 1], pole, onGrip ? c.gripAxis : null);
    }
    // người dự bị kéo xác xuống khoang (chỉ khi còn người dự bị)
    animateMate(u, C, F, dt0, dt);
    // hy sinh: quân phục / áo giáp sẫm màu (máu, bụi); hồi sinh trả lại vật liệu gốc
    if (gDead && !F.deadTint) deadTint(F, true);
    else if (!gDead && F.deadTint) deadTint(F, false);
    if (!gDead && C.stains && C.stains.visible && !(F.newbie > 0)) C.stains.visible = false;
  }

  // Ảnh hưởng của kíp xe lên xe (xe máy mình điều khiển): xạ thủ hy sinh -> súng & tên lửa vô hiệu, không nạp; lái xe hy sinh
  // -> xe đứng im. Đang nạp tên lửa mà xe chạy nhanh: nạp chậm (xạ thủ phải đứng trên nóc bám giữ)
  function applyEffects(u, gDead, dDead, dt) {
    const d = u.dmg;
    // không có xạ thủ: chặn bắn (cờ riêng — gunDead là súng bị phá hủy thật)
    if (d) { d.crewDown = gDead; d.rpgDisabled = gDead || d.lost.has('atgm'); }
    if (gDead) u.isFiringGatling = false;
    if (dDead && d) { u.baseMaxSpeed = 0; u.speed = (u.speed || 0) * Math.exp(-dt * 3); }
    if (u._netProxy || u.isDead) return;
    if (gDead) {
      // không ai nạp: hồi nạp đứng yên
      if (u.antiTankCooldown > 0) u.antiTankCooldown += dt;
      if (u.reloadTimer > 0) u.reloadTimer += dt;
      return;
    }
    if (u.antiTankCooldown > 0 && u.crew && u.crew.st && u.crew.st.at) {
      const vmax = (d && d.base && d.base.baseMaxSpeed) || u.baseMaxSpeed || 100;
      if (Math.abs(u.speed || 0) > vmax * 0.25) {
        u.antiTankCooldown += dt * 0.6;   // còn ~40% tốc độ nạp
        if (u.isPlayer && window.game && (!u._atSlowT || performance.now() - u._atSlowT > 6000)) {
          u._atSlowT = performance.now();
          window.game.addCombatLog('[[rocket]] Xe đang chạy — xạ thủ đứng trên nóc nạp tên lửa rất chậm. Dừng / chạy chậm lại để nạp nhanh', 'tip');
        }
      }
    }
  }

  // ---------- THƯƠNG VONG ----------
  function killCrew(u, role, events, how) {
    const d = window.VehicleDamage.state(u), tag = role === 'gunner' ? 'crewGunner' : 'crewDriver';
    if (d.lost.has(tag)) return false;
    d.lost.add(tag);
    events.push(crewEvent(role, how));
    return true;
  }
  function crewEvent(role, how) {
    return role === 'gunner'
      ? { type: 'crew', text: `XẠ THỦ ${how || 'TRÚNG ĐẠN'} HY SINH — súng & tên lửa tạm ngừng, người dự bị lên thay sau vài giây` }
      : { type: 'crew', text: `LÁI XE ${how || 'TRÚNG ĐẠN'} HY SINH — xe mất khả năng cơ động` };
  }
  // (trụ súng cao thêm mg.lift: xạ thủ & tấm chắn cùng nâng lên chừng đó -> mức lộ người tính trên độ nhô so với tấm chắn)
  const exposure = u => {
    const G = u.crew && u.crew.gunner;
    if (!G) return 0;
    const r = G.rise - ((u.crew.mg && u.crew.mg.lift) || 0);
    return G.rise < -2.5 ? 0 : r > 0.8 ? 1 : 0.5;
  };

  function onHit(u, opts, r) {
    if (!u || u.isDead || !u.crew || u.crew.off || u.crew.kind !== 'scout' || !r || !r.events || r.intercepted || r.shielded) return;
    const VD = window.VehicleDamage, d = VD.state(u), hit = opts && opts.hit;
    if (hit && hit.object && hit.object.userData && hit.object.userData.crewRole === 'gunner') {
      if (!hit.ricochet) killCrew(u, 'gunner', r.events, 'TRÚNG ĐẠN');
      return;
    }
    // đạn nổ trúng thẳng thân xe (tấm chắn súng, nóc, giá súng...) ngay cạnh xạ thủ: mảnh văng
    if (hit && hit.point) fragKill(u, hit.point.x, hit.point.y, hit.point.z, opts, hitBlastRadius(opts), r.events);
    const AO = d.lastOutcome;
    if (!AO || !AO.pen || AO.zone !== 'crew' || r.mul <= 0) return;
    const cls = VD.ammoClass(opts.ammo);
    const p = cls === 'small' ? 0.15 : cls === 'cannon' ? 0.3 : 0.6;
    if (Math.random() > p) return;
    // phát xuyên vào khoang: nửa trước (cabin) trúng lái xe, nửa sau (dưới lỗ nóc) trúng chân / thân dưới xạ thủ
    let front = true;
    if (hit && hit.point && u.chassisGroup) front = u.chassisGroup.worldToLocal(hit.point.clone()).z < 0;
    killCrew(u, front ? 'driver' : 'gunner', r.events, 'TRÚNG MẢNH XUYÊN KHOANG');
  }

  function onSplash(u, opts, r) {
    if (!u || u.isDead || !u.crew || u.crew.off || !u.crew.gunner || !r || !r.events || r.shielded) return;
    const d = window.VehicleDamage.state(u);
    if (d.lost.has('crewGunner')) return;
    fragKill(u, opts.x, opts.y, opts.z, opts, opts.radius, r.events);
  }

  // Mảnh văng của một vụ nổ tại (x, y, z) với xạ thủ đang nhô người khỏi lỗ nóc. Dùng cho cả nổ trượt cạnh xe (onSplash) lẫn
  // đạn nổ trúng thẳng thân xe ngay cạnh người (onHit — trước đây trúng thẳng xe thì không tính mảnh cho người đứng sát)
  function fragKill(u, x, y, z, opts, radius, events) {
    if (!u.crew || !u.crew.gunner) return;
    const d = window.VehicleDamage.state(u);
    if (d.lost.has('crewGunner')) return;
    const cls = opts.gl40 ? 'gl40' : window.VehicleDamage.ammoClass(opts.ammo);
    // đạn súng 12.7 không có thuốc nổ: chỉ trúng thẳng người mới tính. Đạn nổ 30mm & lựu 40mm nổ sát xạ thủ: mảnh hạ được
    if (cls === 'small' || !(radius > 0)) return;
    // tầm mảnh sát thương với người (phần bán kính nổ) & độ chết theo loại đạn
    const reach = cls === 'gl40' ? 0.75 : cls === 'cannon' ? 0.55 : 0.85, k = cls === 'gl40' ? 1.0 : cls === 'cannon' ? 0.5 : 1;
    const h = u.crew.gunner.head.getWorldPosition(V(0, 0, 0)), b = u.crew.gunner.chest.getWorldPosition(V(0, 0, 0));
    const dist = Math.min(Math.hypot(h.x - x, h.y - y, h.z - z), Math.hypot(b.x - x, b.y - y, b.z - z));
    // shieldK: vật che giữa điểm nổ và xe (game.js blastShield — tường, gò đất, cây, ụ đất...) chặn mảnh cả với người
    const sk = opts.shieldK === undefined ? 1 : Math.max(0, opts.shieldK);
    const p = exposure(u) * Math.pow(c01(1 - dist / (radius * reach)), 1.3) * k * sk * (opts.heavy ? 1.2 : 1);
    if (Math.random() < p) killCrew(u, 'gunner', events, 'TRÚNG MẢNH NỔ');
  }
  // bán kính nổ (đv) của đạn trúng thẳng thân xe — để tính mảnh với xạ thủ đứng sát
  function hitBlastRadius(opts) {
    if (opts.gl40) return 26;
    const cls = window.VehicleDamage.ammoClass(opts.ammo);
    return cls === 'cannon' ? 10 : cls === 'heat' ? 24 : cls === 'blast' ? (opts.heavy ? 60 : 36) : 0;
  }

  // gắn vào VehicleDamage: tính thương vong trên máy có quyền với phát bắn (không chạy ở lượt chỉ vẽ hình), báo khi nhận
  // bản tóm tắt hư hại từ máy khác
  function hook() {
    const VD = typeof window !== 'undefined' && window.VehicleDamage;
    if (!VD || VD.__crew) return;
    VD.__crew = true;
    let vis = 0;
    const oV = VD.visualOnly;
    VD.visualOnly = function (fn) { vis++; try { return oV.call(this, fn); } finally { vis--; } };
    const oH = VD.onDirectHit;
    VD.onDirectHit = function (u, opts) {
      const r = oH.apply(this, arguments);
      if (!vis) { try { onHit(u, opts, r); } catch (e) { console.error('[VehicleCrew]', e); } }
      return r;
    };
    const oS = VD.onSplash;
    VD.onSplash = function (u, opts) {
      const r = oS.apply(this, arguments);
      if (!vis) { try { onSplash(u, opts, r); } catch (e) { console.error('[VehicleCrew]', e); } }
      return r;
    };
    const oA = VD.applyDigest;
    VD.applyDigest = function (u, s) {
      const had = u && u.dmg && u.dmg.lost ? { g: u.dmg.lost.has('crewGunner'), d: u.dmg.lost.has('crewDriver') } : { g: false, d: false };
      const ev = oA.apply(this, arguments);
      try {
        const L = u && u.dmg && u.dmg.lost;
        if (L && Array.isArray(ev)) {
          if (!had.g && L.has('crewGunner')) ev.push(crewEvent('gunner'));
          if (!had.d && L.has('crewDriver')) ev.push(crewEvent('driver'));
        }
      } catch (e) { /* bỏ qua */ }
      return ev;
    };
  }
  hook();

  return { attachScoutGunner, setShown, animate, buildFigure, hook, AT, chargePull, mgReloadPr, mgWarp, mgUnwarp };
})();

if (typeof window !== 'undefined') window.VehicleCrew = VehicleCrew;
