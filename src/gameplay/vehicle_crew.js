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
  let LENS_T = null;
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
    const camo = camoTex(red ? '#a08560' : '#69704f', red ? ['#6e4a31', '#8a6a45', '#c2a77c', '#3e2c1f'] : ['#3f4a33', '#2f3628', '#8a9272', '#5b5f56']);
    return (MATS[team] = {
      uni: cloth({ map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(1.5, 1.5); return t; })() }),
      vest: cloth({ color: red ? 0x4f4430 : 0x4a4c36, roughness: 0.9, side: THREE.DoubleSide }),
      pouch: cloth({ map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(0.7, 0.7); return t; })(), roughness: 0.9 }),
      grenade: std({ color: 0x3d4630, roughness: 0.55 }),
      band: std({ color: 0x8c7a3c, roughness: 0.75 }),
      smoke: std({ color: 0x55584a, roughness: 0.6 }),
      helm: cloth({ map: camo, roughness: 0.8 }),
      helmD: std({ color: red ? 0x3d3324 : 0x343a28, roughness: 0.9 }),
      velcro: cloth({ color: 0x8a7a56, roughness: 1 }),
      skin: std({ color: 0x7c5640, roughness: 0.72 }),
      skinV: std({ vertexColors: true, roughness: 0.68 }),
      glove: std({ color: 0x7a6a50, roughness: 0.75, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.5, 0.5) }),
      knuck: std({ color: 0x1c1c1a, roughness: 0.5 }),
      pad: std({ color: red ? 0x6e5f45 : 0x4f5240, roughness: 0.55, side: THREE.DoubleSide, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.3, 0.3) }),
      boot: std({ color: 0x1c1a17 }),
      lens: std({ color: 0x1a2a33, roughness: 0.15, metalness: 0.6 }),
      visor: std({ map: lensTex(), roughness: 0.06, metalness: 0.55, side: THREE.DoubleSide }),
      frame: std({ color: 0x1b1c1a, roughness: 0.45 }),
      strap: std({ color: 0x1f1e1a }),
      hair: std({ color: 0x1e1813, roughness: 0.95, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.8, 0.8) }),
      vestD: cloth({ color: red ? 0x463b28 : 0x3c432d, roughness: 0.9, side: THREE.DoubleSide }),
      mag: std({ color: 0x23231f, roughness: 0.6 }),
      patch: cloth({ color: red ? 0x7a3a30 : 0x3a5272, roughness: 0.95 }),   // huy hiệu / cờ theo màu phe
      tq: std({ color: 0x1a1a18, roughness: 0.7 }),
      gaiter: cloth({ map: camoTex(red ? '#94795a' : '#5e6450', red ? ['#73593f', '#b09677'] : ['#454c3b', '#7c836b']), side: THREE.DoubleSide }),
      shell: std({ color: 0x8c7856, roughness: 0.55 }),
      trim: std({ color: 0x3a3428, roughness: 0.8 }),
      web: cloth({ color: 0x80704f, roughness: 0.9 }),
      web2: std({ color: red ? 0x4f4430 : 0x4a4c36, roughness: 0.95, side: THREE.DoubleSide }),
      webD: std({ color: 0x5c4f38, roughness: 0.6 }),
      headset: std({ color: 0x2b2d27, roughness: 0.6 }),
      lip: std({ color: 0x9a6a52 }),
      dead: cloth({ map: camo, color: 0x9a6a62 })   // áo rằn ri thẫm máu
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
      ? [[0, -0.12], [0.42, -0.1], [0.6, 0.05], [0.63, 0.2], [0.6, 0.45], [0.53, 0.8], [0.51, 1.15], [0.47, 1.6], [0.42, 2.0], [0.42, 2.3], [0.32, 2.52], [0, 2.58]]
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
  const HEL_R = 1.14, HEL_S = [0.99, 0.97, 1.08];   // vỏ dày ~2 cm + lớp đệm lót: đứng xa đầu như mũ chống đạn thật
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
    P.addScaledVector(n, off).add(V(0, 1.05, 0.1));
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
      const r = Math.hypot(x, z) || 1, k = (r + 0.045) / r;
      x *= k; z *= k; y += 0.02;
      p.setXYZ(i, x, y, z);
      // mép tóc: phía trước (z < 0) chỉ ở trên trán cao + thái dương ngoài má; sau gáy xuống tới chân tóc
      const side = Math.abs(x) / (r || 1);
      const lim = z < 0 ? (side > 0.72 ? -0.32 : side > 0.55 ? 0.1 : 0.55) : -0.62 + 0.25 * Math.max(0, side - 0.6);
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
    const prof = [[0.0, 3.4], [0.78, 3.42], [0.72, 3.55], [0.6, 3.72], [0.52, 3.92], [0.48, 4.12], [0.47, 4.32], [0.0, 4.34]];
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 28), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const h = Math.max(0, Math.min(1, (y - 3.45) / 0.85));
      // nếp chùng: lượn theo góc (thấp ở trước, cao ở sau), biên độ lớn ở dưới
      const fold = (0.025 + 0.02 * (1 - h)) * Math.sin(y * 24 + 2.2 * Math.sin(a) + Math.sin(a * 3) * 0.8);
      const k = (r + fold) / r;
      x *= k; z *= k * 0.9;
      z -= 0.12 * h;   // cổ ngả về trước
      p.setXYZ(i, x, y, z);
      // UV theo kích thước thật (họa tiết rằn ri cùng cỡ với áo, không bị kéo dài ngang thành vệt sọc)
      g.attributes.uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 3.4 * 0.55, y * 0.55);
    }
    g.computeVertexNormals();
    return (GEO.neck = g);
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
        z -= 0.24 * G2(x, 0.13) * G2(y + 0.28, 0.13);                  // vải căng qua đầu mũi (mũi cao)
        z -= 0.2 * G2(x, 0.09) * G2(y + 0.1, 0.22);                    // sống mũi thẳng đứng, cao
        z -= 0.2 * G2(x, 0.36) * G2(y + 1.06, 0.15);
        z -= 0.08 * G2(x, 0.32) * G2(y + 0.72, 0.28);                  // miệng / cằm nhô ra trước                  // cằm nhô rõ dưới khăn
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
      const cut = z < 0 ? -0.2 + 0.12 * Math.exp(-(x / 0.15) * (x / 0.15)) - 0.06 * Math.pow(Math.min(1, Math.abs(x) / 0.75), 3) : -0.3;   // trước: ngay dưới mép kính; sau gáy: kéo cao lên tận mép mũ
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

  // Kích thước người thật (8 đv = 1 m): vai ~0.45 m, thân ~0.5 m, cánh tay trên 0.29 m, cẳng tay 0.27 m
  const ARM_UP = 2.3, ARM_FORE = 2.15;
  function buildFigure(team) {
    const M = mats(team);
    const root = new THREE.Group();
    const torso = new THREE.Group();          // gốc ở hông (khớp hông): nghiêng (cúi) / vặn người
    root.add(torso);
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
    const box = rbox;
    // thân (áo chiến đấu rằn ri) + thắt lưng chiến đấu có đệm, khóa, túi
    add(chest, torsoGeo(), M.uni, 0, 0, 0);
    add(torso, new THREE.CylinderGeometry(1.47, 1.47, 0.42, 28, 1, true), M.web2, 0, -0.9, 0).scale.set(1, 1, 0.68);
    add(torso, new THREE.CylinderGeometry(1.43, 1.43, 0.48, 28, 1, true), M.strap, 0, -0.9, 0).scale.set(1, 1, 0.68);   // đai đệm trong
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.95) continue; add(torso, rbox(0.2, 0.05, 0.03), M.strap, Math.cos(a) * 1.48, -0.9, Math.sin(a) * 1.48 * 0.68, 0, -a + Math.PI / 2, 0); }
    add(torso, rbox(0.42, 0.34, 0.08), M.knuck, 0, -0.9, -1.02);   // khóa cài kim loại
    add(torso, rbox(0.16, 0.2, 0.04), M.web2, 0, -0.9, -1.07);
    add(torso, rbox(0.45, 0.32, 0.12), M.strap, 0, -0.9, -1.0);
    add(torso, rbox(0.5, 0.55, 0.42), M.pouch, 1.12, -0.8, -0.55, 0, -0.5, 0);
    add(torso, rbox(0.42, 0.6, 0.38), M.pouch, -1.15, -0.8, 0.45, 0, 0.6, 0);
    const vestFrom = meshes.length;
    // ÁO GIÁP MANG TẤM (plate carrier): tấm trước / sau dạng SAPI (vát 2 góc vai) bọc vải, cong ôm theo ngực
    add(chest, plateGeo(2.3, 2.35, 0.3, 0.22), M.vest, 0, 2.1, -1.08, -0.08);
    add(chest, plateGeo(2.6, 2.65, 0.3, -0.2), M.vest, 0, 2.15, 1.1, 0.05);
    // viền bọc mép tấm (băng dệt may quanh chu vi)
    add(chest, plateBindGeo(2.3, 2.35, 0.3, 0.22), M.strap, 0, 2.1, -1.08, -0.08);
    add(chest, plateBindGeo(2.6, 2.65, 0.3, -0.2), M.strap, 0, 2.15, 1.1, 0.05);
    // dải MOLLE trên ngực tấm trước (trên túi hành chính), khe cắt laser kiểu tấm vải ép
    for (let r = 0; r < 2; r++) for (let c = -2; c <= 2; c++) add(chest, rbox(0.26, 0.09, 0.04), M.strap, c * 0.32, 3.02 + r * 0.2, -1.27 - r * 0.02, -0.08);

    const cb = add(chest, new THREE.CylinderGeometry(1.64, 1.62, 1.25, 24, 1, true), M.vestD, 0, 1.35, 0);
    cb.scale.set(1, 1, 0.68);
    for (let r = 0; r < 3; r++) add(chest, new THREE.CylinderGeometry(1.66, 1.66, 0.05, 24, 1, true, Math.PI * 0.3, Math.PI * 0.4), M.strap, 0, 1.0 + r * 0.32, 0).scale.set(1, 1, 0.69);
    for (let r = 0; r < 3; r++) add(chest, new THREE.CylinderGeometry(1.66, 1.66, 0.05, 24, 1, true, Math.PI * 1.3, Math.PI * 0.4), M.strap, 0, 1.0 + r * 0.32, 0).scale.set(1, 1, 0.69);
    // quai vai: dải vải dệt dẹt mỏng (~4 cm bản, vài mm dày) vắt sát qua vai nối mép trên hai tấm, khóa nhựa chỉnh dây
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V(sx * 0.86, 3.4, -1.16), V(sx * 1.02, 3.66, -0.6), V(sx * 1.06, 3.7, 0.15), V(sx * 0.92, 3.4, 1.1)]);
      add(chest, strapGeo(c, 0.4, 0.05, 'shoulder' + sx, V(sx * 0.85, 2.4, 0)), M.web2, 0, 0, 0);
      add(chest, rbox(0.46, 0.12, 0.08), M.knuck, sx * 0.86, 3.4, -0.85, -0.9, 0, 0);
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
    add(chest, rbox(0.42, 0.95, 0.42), M.pouch, -1.66, 1.45, 0.1);
    add(chest, rbox(0.3, 0.6, 0.3), M.strap, -1.66, 2.1, 0.15);
    add(chest, new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), M.knuck, -1.66, 2.62, 0.2);
    {
      const ant = new THREE.CatmullRomCurve3([V(-1.66, 2.74, 0.2), V(-1.64, 3.4, 0.45), V(-1.55, 3.95, 0.9), V(-1.4, 4.25, 1.45)]);
      add(chest, new THREE.TubeGeometry(ant, 16, 0.022, 4, false), M.strap, 0, 0, 0);
    }
    add(chest, rbox(0.42, 0.75, 0.55), M.pouch, 1.66, 1.35, 0.05);
    // SAU LƯNG: túi nước dẹt có ống hút vắt qua vai, quai kéo thương binh, túi cứu thương ngang dưới
    add(chest, rbox(1.6, 1.85, 0.34), M.pouch, 0, 2.05, 1.42, 0.06);
    for (let r = 0; r < 4; r++) add(chest, rbox(1.5, 0.05, 0.05), M.strap, 0, 1.4 + r * 0.38, 1.6);
    add(chest, new THREE.TorusGeometry(0.28, 0.07, 6, 12, Math.PI), M.strap, 0, 3.3, 1.28, 0.3);
    add(chest, rbox(1.0, 0.5, 0.4), M.pouch, 0, 0.8, 1.2);
    const tube = new THREE.CatmullRomCurve3([V(0.5, 3.0, 1.45), V(0.95, 3.7, 0.6), V(0.85, 3.55, -0.9), V(0.55, 3.0, -1.32)]);
    add(chest, new THREE.TubeGeometry(tube, 12, 0.035, 5, false), M.strap, 0, 0, 0);
    // cả bộ áo giáp: hạ thấp xuống một chút & nới rộng theo thân to hơn
    for (let i = vestFrom; i < meshes.length; i++) { const m = meshes[i]; m.position.y -= 0.28; m.position.x *= 1.02; m.position.z *= 1.04; m.scale.x *= 1.02; }
    // vai tròn
    // khối vai liền thân (cơ delta lấn vào thân) — nối đầu cánh tay với thân, không hở khi tay đưa ra trước
    for (const sx of [-1, 1]) add(chest, new THREE.SphereGeometry(0.56, 16, 12), M.uni, sx * 1.4, 2.72, 0).scale.set(0.95, 0.72, 1.12);   // vai dày, ôm vào thân
    // cổ áo đứng của áo chiến đấu (dưới khăn), khóa kéo ngực
    // cổ áo đứng (kiểu combat shirt) ôm gốc cổ, mở hở chữ V phía trước + khóa kéo; xương quai xanh nổi nhẹ hai bên
    {
      const cg = new THREE.CylinderGeometry(0.62, 0.7, 0.42, 22, 1, true, 0.35, Math.PI * 2 - 0.7), cu = cg.attributes.uv;
      for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 1.1, cu.getY(i) * 0.12);   // UV đúng tỉ lệ (hết vệt sọc ngang)
      const col = add(chest, cg, M.uni, 0, 3.72, 0.06);
      col.rotation.y = Math.PI; col.scale.set(1, 1, 0.9);
    }
    // cổ + đầu
    // cổ: thon từ gốc cổ (cơ thang) lên dưới hàm, khăn quấn có ngấn
    add(chest, neckGeo(), M.gaiter, 0, 0, 0.08);   // cổ quấn khăn: một khối liền loe xuống vai, nếp vải chùng mềm
    const head = new THREE.Group();
    head.position.set(0, 4.22, 0.05);
    head.scale.setScalar(0.9);   // đầu (kèm mũ) nhỏ lại cân với thân
    chest.add(head);
    // MẶT: một khối liền nặn từ quả cầu (mũi, môi, cằm, gò má, hàm) — màu da theo đỉnh (môi, râu lún phún)
    add(head, faceGeo(), M.skinV, 0, 0.72, 0);
    for (const sx of [-1, 1]) add(head, earGeo(), M.skin, sx * 0.8, 0.72, 0.02, 0, sx * 0.3, 0).scale.set(sx * 0.95, 0.95, 0.95);
    // khăn che mặt (neck gaiter) kéo lên sống mũi, ôm dưới goggle
    add(head, gaiterGeo(), M.gaiter, 0, 0.0, 0);
    // tóc cắt ngắn sát: gáy + mai tóc trước tai (dưới mép mũ)
    add(head, hairGeo(), M.hair, 0, 0.72, 0);   // tóc cắt ngắn ôm sát sọ: đỉnh -> thái dương -> gáy
    for (const sx of [-1, 1]) add(head, rbox(0.05, 0.22, 0.12), M.hair, sx * 0.76, 0.98, -0.12, 0, sx * 0.3, 0);
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
    add(head, helmetGeo(), M.helm, 0, 1.05, 0.1);
    // dây chun buộc mũ quanh vòm, các miếng velcro hai bên & sau, đèn nhận dạng IR trên đỉnh sau
    add(head, new THREE.TorusGeometry(0.96, 0.03, 5, 28), M.strap, 0, 1.52, 0.1, Math.PI / 2 - 0.08).scale.set(0.98, 1.08, 1);
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
      add(hand, new THREE.CylinderGeometry(0.31, 0.33, 0.4, 12), M.glove, 0, -0.12, 0);
      add(hand, rbox(0.12, 0.34, 0.36), M.strap, 0.27, -0.12, 0);
      add(hand, new THREE.SphereGeometry(0.32, 12, 10), M.glove, 0.1, 0.25, 0).scale.set(0.38, 0.9, 1);   // bàn tay
      add(hand, new THREE.SphereGeometry(0.26, 10, 8), M.knuck, 0.2, 0.33, 0).scale.set(0.25, 0.7, 0.95);   // ốp mu bàn tay
      for (let f = 0; f < 4; f++) {
        const z = (f - 1.5) * 0.15, r = f === 3 ? 0.055 : 0.065, k = f === 3 ? 0.85 : 1;
        const p0 = V(0.14, 0.52, z), p1 = V(0.04, 0.52 + 0.2 * k, z), p2 = V(-0.14 * k, 0.5 + 0.17 * k, z), p3 = V(-0.2 * k, 0.32, z);
        seg(hand, p0, p1, r + 0.01, M.glove); seg(hand, p1, p2, r, M.glove); seg(hand, p2, p3, r - 0.005, M.glove);
        add(hand, new THREE.SphereGeometry(0.055, 8, 6), M.knuck, 0.17, 0.55, z);       // đệm đốt
      }
      const tz = s * 0.36;
      seg(hand, V(0.08, 0.15, tz * 0.6), V(-0.02, 0.36, tz), 0.075, M.glove);
      seg(hand, V(-0.02, 0.36, tz), V(-0.14, 0.48, tz * 0.75), 0.068, M.glove);
      for (const m of hand.userData.segs || []) meshes.push(m);
      hand.scale.setScalar(0.86);   // bàn tay cân với cổ tay
      return { s, up, fore, hand, pocket, sh: V(s * 1.5, 2.76, 0) };   // vai (hệ ngực)
    });
    // vẽ sau lòng hố lỗ nóc (recon_marten: mặt nạ độ sâu khoét nóc) -> phần người dưới mép nóc vẫn thấy qua lỗ
    // vẽ ở lượt trong suốt SAU lòng hố lỗ nóc (recon_marten: renderOrder 10-11) -> phần người dưới mép nóc vẫn thấy qua lỗ
    for (const m of meshes) {
      m.userData.crewRole = 'gunner'; m.renderOrder = 12;
      if (!m.material.transparent) { m.material.transparent = true; m.material.opacity = 1; }
    }
    if (!M.dead.transparent) { M.dead.transparent = true; M.dead.opacity = 1; }
    return { root, torso, chest, head, arms, meshes, M, rise: 0, bend: 0, twist: 0, roll: 0, look: 0, lookP: 0, t: Math.random() * 10 };
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
  function solveArm(F, arm, targetW, poleL) {
    const S = F.chest.localToWorld(arm.sh.clone());
    F.root.worldToLocal(S);
    const T = F.root.worldToLocal(targetW.clone());
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
    if (arm.pocket) {
      const lat = V(arm.s, 0.35, 0).applyQuaternion(arm.up.quaternion.clone().invert());
      arm.pocket.rotation.y = Math.atan2(-lat.z, lat.x);
    }
    aim(arm.fore, E, Tc, pv);
    aim(arm.hand, Tc, Tc.clone().addScaledVector(Tc.clone().sub(E).normalize(), 1), V(arm.s, 0, 0));
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
      rise: A.rise + (B.rise - A.rise) * k, bend: A.bend + (B.bend - A.bend) * k, twist: A.twist + (B.twist - A.twist) * k
    };
  }

  const pose = (L, R, rise = 0, bend = 0, twist = 0) => ({ L, R, rise, bend, twist });

  // Thay hộp đạn súng máy (pr 0..1 theo reloadTimer — đồng bộ với hoạt cảnh nắp / hộp trong recon_marten)
  const MG_KEYS = [
    [0.00, c => pose(c.gripL, c.gripR)],
    [0.07, c => pose(c.gripL, c.coverH)],                     // lật nắp khóa nòng
    [0.20, c => pose(c.boxH, c.coverH, 0, 0.12)],             // tay trái nắm quai hộp rỗng
    [0.40, c => pose(c.boxH, c.boxH2, -0.3, 0.55)],           // thả hộp rỗng xuống khoang
    [0.46, c => pose(c.hatchL, c.hatchR, -0.9, 0.85)],        // cúi hẳn xuống lòng xe
    [0.52, c => pose(c.boxH, c.boxH2, -0.9, 0.85)],           // móc hộp đạn mới
    [0.66, c => pose(c.boxH, c.boxH2, 0, 0.15)],              // nhấc lên qua lỗ, đặt vào khay
    [0.70, c => pose(c.boxH, c.lidH, 0, 0.12)],               // lật nắp hộp
    [0.75, c => pose(c.boxH, c.beltT, 0, 0.15)],              // bốc đầu dây đạn
    [0.86, c => pose(c.coverH, c.beltT, 0, 0.1)],             // kéo dây đặt vào khay nạp (tay trái giữ nắp)
    [0.90, c => pose(c.gripL, c.coverH)],                     // sập nắp
    [0.93, c => pose(c.gripL, c.chargeB)],
    [0.955, c => pose(c.gripL, c.chargeF)],
    [0.975, c => pose(c.gripL, c.chargeB)],
    [1.00, c => pose(c.gripL, c.gripR)]
  ];

  // Nạp tên lửa kiểu TOW (pr 0..1 theo antiTankCooldown). Mốc chuyển động của ống phóng: xem animateLauncher
  const AT = { capOpen: [0.20, 0.26], spentOut: [0.26, 0.42], toss: 0.45, grab: [0.50, 0.56], lift: [0.56, 0.62], newUp: [0.62, 0.67], push: [0.67, 0.80], capClose: [0.80, 0.86] };
  const AT_KEYS = [
    // lúc phóng & dẫn tên lửa: thụp xuống sau tấm chắn (chỉ nhô mắt), chỉ đứng lên khi bắt đầu nạp quả mới
    [0.00, c => pose(c.gripL, c.gripR, -1.4, 0.1)],
    [0.12, c => pose(c.gripL, c.gripR, -1.4, 0.1)],
    [0.20, c => pose(c.tubeL, c.capH, 1.6, 0.05, -0.55)],
    [0.26, c => pose(c.tubeL, c.capH, 1.6, 0.05, -0.55)],
    [0.30, c => pose(c.spentL, c.spentR, 1.6, 0.1, -0.55)],
    [0.42, c => pose(c.spentL, c.spentR, 1.6, 0.0, -0.75)],
    [0.46, c => pose(c.tossL, c.tossR, 1.6, -0.05, -0.9)],
    // cúi xuống lòng xe, ôm quả tên lửa mới (trong ống chứa) nhấc lên qua lỗ nóc, xoay ra sau ống phóng
    [0.50, c => pose(c.hatchL, c.hatchR, 0.3, 0.75, -0.3)],
    [0.56, c => pose(c.misL, c.misR, 0.2, 0.8, -0.3)],
    [0.62, c => pose(c.misL, c.misR, 1.2, 0.3, -0.45)],
    [0.67, c => pose(c.misL, c.misR, 1.6, 0.12, -0.55)],
    [0.80, c => pose(c.tubeL, c.misR, 1.6, 0.18, -0.55)],
    [0.83, c => pose(c.tubeL, c.capH, 1.6, 0.1, -0.55)],
    [0.87, c => pose(c.tubeL, c.capH, 1.6, 0.05, -0.55)],
    [0.96, c => pose(c.gripL, c.gripR)],
    [1.00, c => pose(c.gripL, c.gripR)]
  ];

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
    const so = sm((pr - AT.spentOut[0]) / (AT.spentOut[1] - AT.spentOut[0]));
    spent.position.set(0, 0, -0.9 + 5.6 * so);
    spent.visible = pr < AT.toss && so > 0.02;
    const load = has && !dead;
    const up = sm((pr - AT.newUp[0]) / (AT.newUp[1] - AT.newUp[0])), push = sm((pr - AT.push[0]) / (AT.push[1] - AT.push[0]));
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
    A.can.position.z = pr > AT.capClose[0] && pr < AT.capClose[1] + 0.02 ? Math.sin(c01((pr - AT.capClose[0]) / 0.08) * Math.PI) * 0.1 : 0;
    A.capOpen.visible = !(load && pr >= AT.capClose[1]); A.capCover.visible = !A.capOpen.visible;
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
    for (let i = 0; i < 14; i++) {
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
    const d = u.dmg, F = C.gunner;
    let gDead = !!(d && d.lost && d.lost.has('crewGunner'));
    const dDead = !!(d && d.lost && d.lost.has('crewDriver'));
    // XẠ THỦ HY SINH -> gục lên súng (máu bắn) -> đổ sụp xuống lòng xe -> xạ thủ dự bị (lái xe phụ) trèo lên thay sau
    // REPLACE_T giây. Trong lúc đó súng & tên lửa không ai điều khiển. Chạy trên mọi máy theo cờ 'crewGunner' đồng bộ
    const DN = C.down;
    if (gDead && !u.isDead) {
      if (!DN) { C.down = { t: 0 }; bloodBurst(u, C); }
      else {
        DN.t += dt;
        // máu rỉ: giọt nhỏ chảy từ vết thương xuống người / nóc trong ~5 s, vệt máu loang rộng dần
        DN.drip = (DN.drip || 0) - dt;
        if (DN.t < 5.5 && DN.drip <= 0) { DN.drip = 0.18 + Math.random() * 0.2; bloodDrip(u, C, DN.t); }
        if (DN.t >= REPLACE_T && !dDead) {
          d.lost.delete('crewGunner'); C.down = null; gDead = false;
          if (C.gunner) { C.gunner.rise = -3.3; C.gunner.newbie = 1.2; }
          if (u.isPlayer && window.game) window.game.addCombatLog('[[user-check]] Xạ thủ dự bị đã lên vị trí — súng & tên lửa hoạt động lại', 'tip');
        }
      }
    } else if (DN && !gDead) C.down = null;
    applyEffects(u, gDead, dDead, dt);

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
    const c = {
      // nắm đúng 2 tay cầm chữ D sau khóa nòng (recon_marten buildRingMount)
      gripL: wp(P, -0.45, 0.0, 3.3), gripR: wp(P, 0.45, 0.0, 3.3),
      // cúi xuống lòng xe lấy đạn: trước bụng, dưới mép nóc
      hatchL: ws(T, F, -0.7, -1.2, -1.8), hatchR: ws(T, F, 0.6, -1.2, -1.7)
    };
    let tgt;
    const mgReload = !u.isDead && u.gatlingMag <= 0 && u.reloadTimer > 0 && u.reloadDuration > 0;
    // giàn rocket trên chân đế là trạm điều khiển từ xa: xạ thủ ngồi trong xe, chỉ trèo ra khi hết giàn để nhét đạn
    const G = u.mainGun && u.mainGun.kind === 'rocket' ? u.mainGun : null;
    // XE NGƯỜI CHƠI — CHẾ ĐỘ LÁI: không ngắm / khóa mục tiêu / bắn / nạp -> xạ thủ chui xuống đóng nắp (chậm 1.5 s sau khi
    // thôi chiến đấu). Mở kính ngắm, khóa mục tiêu hay bóp cò -> nhô lên sau ~0.35 s (nắp mở trước rồi mới nhô người);
    // chưa lên tới súng thì chưa bắn được (crewHidden). Xe bot / xe máy khác luôn đứng súng
    {
      const g = window.game;
      const combat = !u.isPlayer || !g || !!g._sight || !!(g.lockedTarget && !g.lockedTarget.isDead) || !!u.isFiringGatling
        || performance.now() - (u._wantUpT || 0) < 1500
        || mgReload || (S.at && A && atPr < 1);
      C.combatT = combat ? Math.max(0, C.combatT || 0) + dt : Math.min(0, C.combatT || 0) - dt;
      if (C.hidden === undefined) C.hidden = !combat;
      if (C.hidden && C.combatT > 0.35) C.hidden = false;
      else if (!C.hidden && C.combatT < -8) C.hidden = true;   // thôi chiến đấu ~8 s mới chui vào xe
      // lên tới súng rồi còn cần ~0.6 s áp vai, lấy đường ngắm mới bắn được (nhảy lên là bóp cò ngay thì không thật)
      C.readyT = !C.hidden && F.rise > -2.0 && Math.abs(F.rise - (F.tgtRise || 0)) < 0.35 ? (C.readyT || 0) + dt : 0;
      if (d) d.crewHidden = !gDead && !G && (!!C.hidden || C.readyT < 0.6);
      // người còn ở trong xe (chưa lên tới vòng súng): tháp không ai quay (spg.js)
      // ghi lên xe (u.dmg chỉ có sau khi xe bị trúng đạn lần đầu -> trước đây cờ không có tác dụng, tháp vẫn tự quay)
      u._crewInside = !gDead && !G && (!!C.hidden || F.rise < -1.2);
      u._crewHidden = !gDead && !G && (!!C.hidden || C.readyT < 0.6);
    }
    const dt0 = C.down ? C.down.t : 99;
    if ((gDead || u.isDead) && dt0 < 2.4) {
      // trúng đạn: giật ngửa ra sau 0.25 s rồi gục về trước lên súng, hai tay buông thõng
      tgt = dt0 < 0.25 ? pose(c.gripL, c.gripR, 0.1, -0.45, 0.25) : pose(ws(T, F, -1.0, 0.6, -1.5), ws(T, F, 1.0, 0.4, -1.6), -0.5, 1.0, 0.18);
    } else if (gDead || u.isDead) {
      // đổ sụp xuống lòng xe (thi thể được kéo xuống), người dự bị chuẩn bị lên
      tgt = pose(c.hatchL, c.hatchR, u.isDead ? -0.5 : -3.6, u.isDead ? 1.0 : 0.6, 0.3);
    } else if (S.at && A && atPr < 1) {
      const can = A.can;
      Object.assign(c, {
        tubeL: wp(can, 0.25, 0.62, 1.2),
        capH: wp(A.rearCap, 0, -1.15, 0.2),
        spentL: wp(spentOf(A), -0.35, 0.1, 2.3), spentR: wp(spentOf(A), 0.38, 0.0, 2.25),
        tossL: ws(T, F, 3.6, 4.6, -0.8), tossR: ws(T, F, 3.9, 4.1, -2.0),
        // tay ôm ngoài vỏ quả: trái đỡ dưới thân trước, phải đỡ dưới thân sau rồi chuyển ra tì đuôi quả để đẩy
        misL: wp(A.missile, 0, -0.56, -1.4), misR: atPr < 0.67 ? wp(A.missile, 0, -0.56, 0.4) : wp(A.missile, 0, 0.05, 1.42)
      });
      tgt = track(AT_KEYS, atPr, c);
    } else if (G && mgReload) {
      // nạp lại giàn: mỗi quả = cúi xuống cửa nóc lấy đạn -> đẩy vào đuôi ống kế tiếp (đầu đạn hiện dần — recon_marten)
      const n = G.muzzles.length, pr = 1 - u.reloadTimer / u.reloadDuration;
      const i = Math.min(n - 1, Math.floor(pr * n)), ph = pr * n - i, m = G.muzzles[n - 1 - i];
      const rz = G.rear !== undefined ? G.rear : 1.24;   // đuôi ống (hộp phóng có người của xe trinh sát: G.rear)
      const tube = wp(G.pivot, m.x, m.y, rz + 0.3), tubeIn = wp(G.pivot, m.x, m.y, rz - 0.2);
      tgt = ph < 0.4 ? pose(c.hatchL, c.hatchR, 0.4, 0.7) : ph < 0.7 ? pose(lerpV(tube, c.hatchL, 0.15), tube, 1.4, 0.15) : pose(tubeIn, tubeIn, 1.4, 0.2);
    } else if (G) {
      tgt = pose(c.hatchL, c.hatchR, -3.2, 0);   // ngồi thụp trong xe, giàn tự xoay ngắm
    } else if (mgReload && mg) {
      const pr = 1 - u.reloadTimer / u.reloadDuration;
      Object.assign(c, {
        coverH: wp(mg.cover, 0, 0.3, 1.55),
        boxH: mg.ammo.visible ? wp(mg.ammo, 0, 0.95, 0) : ws(T, F, -0.9, -1.2, -1.6),
        boxH2: mg.ammo.visible ? wp(mg.ammo, 0.6, 0.6, 0.2) : ws(T, F, -0.2, -1.2, -1.6),
        chargeF: wp(P, 0.6, 0.15, 0.9), chargeB: wp(P, 0.6, 0.15, 1.9),
        lidH: mg.ammoLid ? wp(mg.ammoLid, 1.35, 0.1, 0.0) : wp(mg.cover, 0, 0.3, 1.55),
        beltT: mg.beltTip ? wp(P, mg.beltTip.x, mg.beltTip.y + 0.12, mg.beltTip.z) : wp(P, -0.5, 0.4, 0.6)
      });
      tgt = track(MG_KEYS, pr, c);
    } else if (C.hidden) {
      // CHUI VÀO XE & ĐÓNG NẮP: với tay phải ra sau nắm quai mép nắp (gần bản lề) -> vừa hạ người vừa kéo nắp sập theo,
      // tay bám quai tới khi nắp đóng hẳn rồi mới buông xuống
      // nắp có thanh xoắn trợ lực: xạ thủ quay người ra sau, đẩy nắp dựng đứng rồi nắm quai chữ U mặt trong, vừa thụp
      // xuống vừa kéo sập nắp; tay kia chống lên mép vòng
      const ht = C.hideT || 0, lz = u.hatchLid ? -(u.hatchLid.position.z) * 0.45 : 0;
      // hai tay cùng nắm quai chữ U (không chống lên vành: tay đè xuyên vành khi thụp xuống)
      const pull = u.hatchLid ? wp(u.hatchLid, 0.3, -0.55, lz) : c.hatchR, rim = u.hatchLid ? wp(u.hatchLid, -0.3, -0.55, lz) : c.hatchL;
      tgt = ht < 0.25 ? pose(c.gripL, c.gripR, -0.2, 0, 0)
        : ht < 0.7 ? pose(rim, pull, -0.3, -0.25, 0.7)
        : ht < 1.55 ? pose(rim, pull, -0.3 - 2.9 * sm((ht - 0.7) / 0.55), 0.35, 0.6)
        : pose(c.hatchL, c.hatchR, -3.3, 0);
    } else {
      // tay cầm hạ thấp khi súng ngóc lên (đuôi súng chúi xuống): xạ thủ khuỵu thấp người theo, không để tay đè lên vòng
      const gy = T.worldToLocal(c.gripL.clone()).y;
      tgt = pose(c.gripL, c.gripR, Math.max(-1.6, Math.min(0.8, (gy - 1.8) * 0.9)), Math.max(0, (1.8 - gy) * 0.12));
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
        lid.rotation.x = ht < 0.7 ? open + (vert - open) * sm((ht - 0.25) / 0.45) : vert * (1 - sm((ht - 0.82) / 0.75));   // nắp sập theo sau đầu (người thụp xuống trước)
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
    const k = 1 - Math.exp(-dt * (gDead ? (dt0 < 2.4 ? 3 : 2.2) : F.newbie > 0 ? 3 : 10));
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
    const gk = u.mainGun && u.mainGun.kind, RC = gk === 'agl' ? { amp: 0.2, decay: 5, shake: 0.012, up: 0.08 } : { amp: 0.09, decay: 14, shake: 0.035, up: 0.03 };
    if (firing && (u.gatlingShotFlash || 0) >= 0.999) F.kick = 1;
    F.kick = (F.kick || 0) * Math.exp(-dt * RC.decay);
    // giật chỉ truyền vào tay (tay cầm lùi theo súng) + vai hơi nhún; thân người đứng vững
    const jit = F.kick * RC.amp * 0.15;
    F.root.position.set(F.base.x, F.base.y + F.rise, F.base.z);
    F.root.visible = F.rise > -2.9;   // đã chui hẳn vào xe: ẩn để không lòi qua nóc
    F.torso.rotation.set(-F.bend + F.leanF + jit, F.twist, (gDead ? 0.12 : 0) + F.roll, 'YXZ');
    const br = Math.sin(F.t * 1.7);
    F.chest.scale.set(1 + br * 0.01, 1 + br * 0.012, 1 + br * 0.025);
    // hướng nhìn: nạp đạn -> cúi nhìn việc tay đang làm; bắn -> nhìn thẳng theo súng; rảnh -> đảo mắt quan sát
    const busy = !gDead && tgt !== null && (mgReload || (S.at && A && atPr < 1));
    const wantYaw = gDead ? 0.2 : busy ? -F.twist * 0.25 : firing ? 0 : 0.45 * Math.sin(F.t * 0.31) + 0.22 * Math.sin(F.t * 0.83 + 1.1);
    const wantPitch = gDead ? -0.7 : busy ? -0.45 : firing ? 0.02 : 0.08 * Math.sin(F.t * 0.52);
    F.look += (wantYaw - F.look) * (1 - Math.exp(-dt * 3));
    F.lookP += (wantPitch - F.lookP) * (1 - Math.exp(-dt * 3));
    F.head.rotation.set(F.lookP + F.bend * 0.55 - F.leanF * 0.5, F.look, -F.roll * 0.5, 'YXZ');
    F.root.updateMatrixWorld(true);
    const H = F.hT || (F.hT = [tgt.L.clone(), tgt.R.clone()]);
    const kh = 1 - Math.exp(-dt * 16);
    H[0].lerp(tgt.L, kh); H[1].lerp(tgt.R, kh);
    // tay cầm lùi theo cụm súng giật (12.7: giật ngắn rung; 40 mm: đẩy lùi dài, hồi chậm)
    if (firing && P) {
      const back = V(0, 0, 1).transformDirection(P.matrixWorld).multiplyScalar(F.kick * (gk === 'agl' ? 0.45 : 0.22));
      const sh = (Math.random() - 0.5) * RC.shake * 2;
      H[0].add(back).y += sh; H[1].add(back).y += sh;
    }
    // khuỷu tay chĩa xuống & hơi ra ngoài, về sau (người thật ôm tay cầm súng máy) — không vắt ngược qua vai
    for (const arm of F.arms) {
      const sh = F.chest.localToWorld(arm.sh.clone()); F.root.worldToLocal(sh);
      solveArm(F, arm, H[arm.s < 0 ? 0 : 1], sh.add(V(arm.s * 3.5, -2.2, 1.5)));
    }
    // hy sinh: quân phục / áo giáp sẫm màu (máu, bụi); hồi sinh trả lại vật liệu gốc
    if (gDead && !F.deadTint) { F.deadTint = true; for (const m of F.meshes) if (m.material === F.M.uni || m.material === F.M.vest) { m.userData.mat0 = m.material; m.material = F.M.dead; } }
    else if (!gDead && F.deadTint) { F.deadTint = false; for (const m of F.meshes) if (m.userData.mat0) { m.material = m.userData.mat0; m.userData.mat0 = null; } }
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
  const exposure = u => (u.crew && u.crew.gunner ? (u.crew.gunner.rise > 0.8 ? 1 : u.crew.gunner.rise < -2.5 ? 0 : 0.5) : 0);

  function onHit(u, opts, r) {
    if (!u || u.isDead || !u.crew || u.crew.kind !== 'scout' || !r || !r.events || r.intercepted || r.shielded) return;
    const VD = window.VehicleDamage, d = VD.state(u), hit = opts && opts.hit;
    if (hit && hit.object && hit.object.userData && hit.object.userData.crewRole === 'gunner') {
      if (!hit.ricochet) killCrew(u, 'gunner', r.events, 'TRÚNG ĐẠN');
      return;
    }
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
    if (!u || u.isDead || !u.crew || !u.crew.gunner || !r || !r.events || r.shielded) return;
    const d = window.VehicleDamage.state(u);
    if (d.lost.has('crewGunner')) return;
    const cls = window.VehicleDamage.ammoClass(opts.ammo);
    if (cls === 'small' || cls === 'cannon' || !(opts.radius > 0)) return;
    const h = u.crew.gunner.head.getWorldPosition(V(0, 0, 0));
    const dist = Math.hypot(h.x - opts.x, h.y - opts.y, h.z - opts.z);
    const p = exposure(u) * Math.pow(c01(1 - dist / (opts.radius * 0.85)), 1.3) * (opts.heavy ? 1.2 : 1);
    if (Math.random() < p) killCrew(u, 'gunner', r.events, 'TRÚNG MẢNH NỔ');
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

  return { attachScoutGunner, animate, buildFigure, hook, AT };
})();

if (typeof window !== 'undefined') window.VehicleCrew = VehicleCrew;
