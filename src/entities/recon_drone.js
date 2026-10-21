/**
 * DRONE TRINH SÁT của pháo tự hành — trang bị theo xe, cất trong HỘP CHỨA DRONE bọc thép trên nóc cabin.
 * Kiểu quadcopter trinh sát quân sự cỡ nhỏ (như Skydio X10D / Parrot Anafi USA): sải cánh kể cả cánh quạt ~0.8 m
 * (8 đơn vị = 1 m) để vừa hộp chứa; thân composite bo tròn, 4 tay đòn sợi carbon có khớp gập, mô-tơ không chổi than,
 * cánh quạt 2 lá có xoắn, cụm gimbal 3 ống kính (ngày / zoom / nhiệt) dưới mũi, camera tránh vật cản, vòm GPS,
 * pin rút ở lưng, chân đáp dưới mô-tơ, đèn hàng không (trái đỏ / phải xanh / đuôi chớp trắng) + đèn màu phe.
 * Gốc tọa độ = mặt đáy chân đáp, mũi drone hướng -z.
 *
 * Hộp chứa (buildDock): khung thép + vách giáp, sàn sạc có dấu đáp, 2 nắp lật mở trước / sau, đèn trạng thái.
 * Đặt lệch phải trên nóc cabin Arbalest (spg_arbalest.js: CAB_ROOF = 22.5, nóc phẳng z -33.5 .. -19.5, rộng ±10.6):
 * tránh nòng pháo gác trên giá hành quân ở giữa (x = 0, z -21.6), cửa nóc bên trái (x -4.6) và ăng-ten (x 7.6, z -31.5).
 */
const ReconDrone = (() => {
  const DOCK = { x: 6.1, y: 22.5, z: -26.4, w: 8.0, d: 8.0, h: 3.3, floor: 0.45 };
  // bãi đáp (đáy chân đáp khi đậu) = sàn sạc trong hộp
  const PAD = { x: DOCK.x, y: DOCK.y + DOCK.floor, z: DOCK.z };
  const CENTER_Y = 1.5;   // tâm thân drone trên gốc mô hình

  // ---------- dựng hình: gộp phần tĩnh theo vật liệu (ít lượt vẽ); hình khối dựng 1 lần, mọi drone dùng chung ----------
  function batcher() {
    const buckets = new Map();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    return {
      dy: 0,   // dời cả cụm theo chiều cao (dựng thân theo số đo gốc rồi hạ xuống)
      // color: màu đỉnh (cho vật liệu vertexColors, vd đèn hàng không đỏ / xanh trong cùng 1 lưới)
      add(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], color = null) {
        const g = geo.index ? geo.toNonIndexed() : geo;
        if (geo !== g) geo.dispose();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (color) {
          const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
          g.setAttribute('color', new THREE.BufferAttribute(a, 3));
        }
        q.setFromEuler(e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ'));
        m4.compose(p.set(pos[0], pos[1] + this.dy, pos[2]), q, s.set(scl[0], scl[1], scl[2]));
        g.applyMatrix4(m4);
        if (!buckets.has(mat)) buckets.set(mat, []);
        buckets.get(mat).push(g);
        return g;
      },
      // ống tròn nối 2 điểm
      tube(a, b, r, mat, seg = 8) {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
        const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
        g.translate((A.x + B.x) / 2, (A.y + B.y) / 2 - this.dy, (A.z + B.z) / 2);
        this.add(g, mat);
      },
      // thanh ống vuông cạnh w nối 2 điểm
      bar(a, b, w, mat) {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
        const g = new THREE.BoxGeometry(w, L, w);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
        g.translate((A.x + B.x) / 2, (A.y + B.y) / 2 - this.dy, (A.z + B.z) / 2);
        this.add(g, mat);
      },
      // gộp: [{ geo, mat }] — mỗi vật liệu một lưới
      merge() {
        const out = [];
        buckets.forEach((geos, mat) => {
          let n = 0;
          for (const g of geos) n += g.attributes.position.count;
          const hasCol = geos.every(g => g.attributes.color);
          const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = hasCol ? new Float32Array(n * 3) : null;
          let o = 0;
          for (const g of geos) {
            const c = g.attributes.position.count;
            pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
            nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
            uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
            if (col) col.set(g.attributes.color.array.subarray(0, c * 3), o * 3);
            o += c;
            g.dispose();
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          geo.computeBoundingSphere();
          out.push({ geo, mat });
        });
        return out;
      }
    };
  }

  // lưới dùng chung -> Mesh (đổ bóng tùy chọn)
  function meshes(list, parent, shadow) {
    for (const { geo, mat } of list) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !!shadow;
      m.receiveShadow = !!shadow;
      m.userData.shared = true;   // hình khối dùng chung giữa các drone: không dispose khi gỡ một drone
      parent.add(m);
    }
  }

  // khối bo tròn mép: đường viền nhìn từ trên (điểm [x, -z]: dương = phía mũi) đùn theo chiều cao
  function roundedSlab(outline, height, bevel) {
    const sh = new THREE.Shape();
    outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, height - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel < 0.08 ? 1 : 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);   // đùn theo +y; outline y dương -> -z (mũi)
    g.translate(0, bevel, 0);
    return g;
  }

  // đường viền bo góc (chữ nhật bo + vuốt mũi): rộng w, dài l, bo r, mũi thu hẹp còn nose * w
  function bodyOutline(w, l, r, nose) {
    const pts = [], hw = w / 2, hl = l / 2, n = 6;
    const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    const fw = hw * nose;
    corner(fw - r, hl - r, 0);           // mũi phải -> mũi trái (y dương = mũi)
    corner(-fw + r, hl - r, Math.PI / 2);
    corner(-hw + r, -hl + r, Math.PI);
    corner(hw - r, -hl + r, Math.PI * 1.5);
    return pts;
  }

  // đường viền vát góc (bát giác kéo dài, kiểu thân xe giáp): rộng w, dài l, cạnh vát c, mũi thu hẹp còn nose * w
  function chamferOutline(w, l, c, nose) {
    const hw = w / 2, hl = l / 2, fw = hw * nose;
    return [[fw - c, hl], [-fw + c, hl], [-fw, hl - c], [-hw, -hl + c], [-hw + c, -hl], [hw - c, -hl], [hw, -hl + c], [fw, hl - c]];
  }

  // mặt phẳng lá cánh quạt (nhìn từ trên): gốc hẹp, phình ~40% bán kính, mũi thon tròn
  function bladeGeo(R) {
    const sh = new THREE.Shape(), r0 = 0.22, c = [0.16, 0.34, 0.3, 0.22, 0.12];
    sh.moveTo(r0, -c[0] / 2);
    [0.35, 0.6, 0.82, 0.96].forEach((t, i) => sh.lineTo(r0 + (R - r0) * t, -c[i + 1] * 0.45));
    sh.quadraticCurveTo(R + 0.04, 0, R * 0.96, c[4] * 0.5);
    [0.82, 0.6, 0.35].forEach((t, i) => sh.lineTo(r0 + (R - r0) * t, c[3 - i] * 0.55));
    sh.lineTo(r0, c[0] / 2);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // vệt mờ đĩa cánh quạt khi quay nhanh: vành ngoài đậm hơn, giữa trong suốt, vài vòng mảnh
  let DISC_TEX = null;
  function discTexture() {
    if (DISC_TEX || typeof document === 'undefined') return DISC_TEX;
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const x = cv.getContext('2d'), c = S / 2;
    const gr = x.createRadialGradient(c, c, S * 0.08, c, c, S * 0.5);
    gr.addColorStop(0, 'rgba(30,32,34,0)');
    gr.addColorStop(0.2, 'rgba(30,32,34,0.25)');
    gr.addColorStop(0.75, 'rgba(30,32,34,0.55)');
    gr.addColorStop(0.95, 'rgba(30,32,34,0.35)');
    gr.addColorStop(1, 'rgba(30,32,34,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(200,205,210,0.06)';
    [0.42, 0.62, 0.8].forEach(k => { x.lineWidth = 1.2; x.beginPath(); x.arc(c, c, k * S / 2, 0, Math.PI * 2); x.stroke(); });
    DISC_TEX = new THREE.CanvasTexture(cv);
    return DISC_TEX;
  }

  function materials() {
    const std = (color, roughness, metalness, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra || {}));
    return {
      shell: std(0x4a4f34, 0.8, 0.05),      // vỏ giáp composite sơn xanh ô-liu quân sự, mờ
      dark: std(0x262824, 0.7, 0.12),       // khung / nhựa kỹ thuật xám đen
      carbon: std(0x202224, 0.38, 0.35),    // ống sợi carbon
      metal: std(0x3a3d40, 0.32, 0.75),     // chuông mô-tơ nhôm anode
      prop: std(0x151617, 0.45, 0.05, { side: THREE.DoubleSide }),
      glass: std(0x0a1216, 0.06, 0.7, { emissive: 0x06121a, emissiveIntensity: 0.25 }),
      rubber: std(0x111111, 0.95, 0),
      lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),   // đèn hàng không (màu theo đỉnh)
      teamB: new THREE.MeshBasicMaterial({ color: 0x40a0ff }),
      teamR: new THREE.MeshBasicMaterial({ color: 0xff4040 })
    };
  }

  // vị trí 4 mô-tơ [x, z] (trước trái, trước phải, sau trái, sau phải) và độ cao đế mô-tơ
  const MOTORS = [[-2.25, -2.05], [2.25, -2.05], [-2.25, 2.05], [2.25, 2.05]];
  const MOTOR_Y = 1.52, HUB_Y = MOTOR_Y + 0.48, PROP_R = 1.32;

  // KHUÔN DRONE (dựng 1 lần): thân + gimbal + tay đòn + mô-tơ + chân đáp + ăng-ten gộp theo vật liệu (6 lưới),
  // lá cánh quạt (2 chiều quay), đĩa mờ 4 rotor gộp 1 lưới, đèn hàng không trước (đỏ / xanh) và sau (trắng chớp)
  let TPL = null;
  function template() {
    if (TPL) return TPL;
    const M = materials(), B = batcher();
    B.dy = -0.5;   // thân dựng theo số đo gốc rồi hạ thấp 0.5 (chân đáp ngắn, choãi)
    // ---- thân: khối giáp góc cạnh (vát mép, không bo tròn), mũi vát nêm ----
    const slab = (w, l, c, nose, h, bev) => roundedSlab(chamferOutline(w, l, c, nose), h, bev);
    B.add(slab(2.1, 3.6, 0.42, 0.66, 0.8, 0.06), M.dark, [0, 1.35, 0]);            // khoang dưới
    B.add(slab(2.3, 3.3, 0.38, 0.72, 0.18, 0.04), M.shell, [0, 2.1, 0.05]);         // gờ giáp ốp vai (chìa ra 2 bên)
    B.add(slab(1.9, 3.0, 0.36, 0.7, 0.42, 0.05), M.shell, [0, 2.24, 0.05]);         // nắp giáp trên
    B.add(new THREE.BoxGeometry(0.9, 0.12, 2.3), M.shell, [0, 2.71, 0.15]);         // sống lưng
    // thanh ray gắn phụ kiện (kiểu Picatinny) trên sống lưng
    B.add(new THREE.BoxGeometry(0.42, 0.08, 1.9), M.dark, [0, 2.81, 0.1]);
    for (let i = 0; i < 9; i++) B.add(new THREE.BoxGeometry(0.5, 0.06, 0.1), M.dark, [0, 2.87, -0.75 + i * 0.21]);
    // bu-lông góc nắp giáp
    for (const [bx, bz] of [[-0.78, -1.05], [0.78, -1.05], [-0.82, 1.25], [0.82, 1.25], [-0.82, 0.1], [0.82, 0.1]]) B.add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 6), M.metal, [bx, 2.69, bz]);
    // pin hình hộp rút ở đuôi + quai kéo
    B.add(slab(1.3, 1.0, 0.12, 1, 0.5, 0.04), M.dark, [0, 2.2, 1.95]);
    B.add(new THREE.BoxGeometry(0.9, 0.08, 0.08), M.metal, [0, 2.78, 2.35]);
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.08, 0.1, 0.08), M.metal, [sx * 0.42, 2.72, 2.35]);
    // module định vị / liên lạc vệ tinh: hộp vuông vát dẹt
    B.add(slab(0.8, 0.8, 0.18, 1, 0.16, 0.03), M.dark, [0, 2.86, -0.55]);
    // 2 ăng-ten vây liên lạc
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.07, 0.48, 0.32), M.dark, [sx * 0.62, 2.95, 1.05], [0, 0, sx * 0.14]);
    // lưới tản nhiệt 2 bên hông
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) B.add(new THREE.BoxGeometry(0.05, 0.36, 0.08), M.metal, [sx * 1.05, 1.75, -0.6 + i * 0.2]);
    // camera tránh vật cản: cặp mắt kép trên mặt mũi vát / đuôi / đáy (khung vuông + kính)
    for (const sx of [-0.36, 0.36]) {
      B.add(new THREE.BoxGeometry(0.3, 0.24, 0.06), M.dark, [sx, 1.78, -1.82]);
      B.add(new THREE.CircleGeometry(0.08, 10), M.glass, [sx, 1.78, -1.855], [0, Math.PI, 0]);
      B.add(new THREE.CircleGeometry(0.08, 10), M.glass, [sx, 1.78, 1.87]);
      B.add(new THREE.CircleGeometry(0.08, 10), M.glass, [sx * 1.4, 1.34, 0.5], [Math.PI / 2, 0, 0]);
    }
    // ---- gimbal dưới mũi: giá chữ U + hộp camera vát 3 ống kính (ngày / zoom, góc rộng, nhiệt, đo xa laser) ----
    B.add(new THREE.BoxGeometry(0.5, 0.2, 0.5), M.dark, [0, 1.26, -1.15]);
    B.add(new THREE.BoxGeometry(1.2, 0.12, 0.42), M.dark, [0, 1.12, -1.15]);
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.1, 0.42, 0.36), M.dark, [sx * 0.57, 0.88, -1.15]);
    const gx = 0, gy = 0.86, gz = -1.15;
    B.add(slab(0.92, 0.78, 0.14, 1, 0.52, 0.03), M.shell, [gx, gy - 0.26, gz]);
    B.add(new THREE.BoxGeometry(0.98, 0.1, 0.84), M.dark, [gx, gy + 0.24, gz]);    // tấm che nắng / mưa
    B.add(new THREE.CylinderGeometry(0.19, 0.21, 0.12, 12), M.dark, [gx - 0.2, gy + 0.06, gz - 0.42], [Math.PI / 2, 0, 0]);
    B.add(new THREE.CircleGeometry(0.15, 14), M.glass, [gx - 0.2, gy + 0.06, gz - 0.485], [0, Math.PI, 0]);
    B.add(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 10), M.dark, [gx + 0.22, gy + 0.08, gz - 0.42], [Math.PI / 2, 0, 0]);
    B.add(new THREE.CircleGeometry(0.08, 10), M.glass, [gx + 0.22, gy + 0.08, gz - 0.475], [0, Math.PI, 0]);
    B.add(new THREE.BoxGeometry(0.26, 0.22, 0.08), M.dark, [gx + 0.2, gy - 0.16, gz - 0.42]);
    B.add(new THREE.PlaneGeometry(0.17, 0.15), M.glass, [gx + 0.2, gy - 0.16, gz - 0.465], [0, Math.PI, 0]);
    B.add(new THREE.CircleGeometry(0.05, 8), M.glass, [gx - 0.2, gy - 0.18, gz - 0.43], [0, Math.PI, 0]);
    // ---- càng đáp kiểu trượt: 2 thanh trượt ống vuông + 4 chân chống choãi (đặt dưới thân, chịu va đập) ----
    for (const sx of [-1, 1]) {
      B.add(new THREE.BoxGeometry(0.16, 0.14, 3.5), M.dark, [sx * 1.45, 0.07 + 0.5, 0.1]);
      for (const sz of [-1, 1]) {
        B.add(new THREE.BoxGeometry(0.2, 0.08, 0.2), M.rubber, [sx * 1.45, 0.04 + 0.5, 0.1 + sz * 1.85]);   // đầu bịt cao su
        B.bar([sx * 0.88, 1.4, sz * 0.95], [sx * 1.45, 0.14, sz * 1.0], 0.15, M.dark);
      }
    }
    // ---- 4 tay đòn ống vuông (khớp gập bản lề ở thân, hơi chếch lên) + đế mô-tơ vuông + mô-tơ + chóp cánh quạt ----
    const L = batcher();   // đèn hàng không: trước trái đỏ, trước phải xanh lá; sau: trắng (chớp)
    const LR = batcher();
    B.dy = 0;
    for (const [mx, mz] of MOTORS) {
      const sx = Math.sign(mx), sz = Math.sign(mz), bx = sx * 0.98, bz = sz * 1.2, my = MOTOR_Y;
      B.add(new THREE.BoxGeometry(0.55, 0.4, 0.55), M.dark, [bx, 1.36, bz], [0, Math.atan2(sx, sz), 0]);   // khớp gập
      B.add(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), M.metal, [bx, 1.36, bz]);                        // chốt bản lề
      B.bar([bx, 1.38, bz], [mx, my - 0.1, mz], 0.26, M.carbon);
      // đế mô-tơ vuông vát + chuông mô-tơ + vòng khe gió + chóp ốc giữ cánh quạt (tròn đều -> không quay theo cánh)
      B.add(roundedSlab(chamferOutline(0.8, 0.8, 0.18, 1), 0.2, 0.03), M.dark, [mx, my - 0.18, mz]);
      B.add(new THREE.CylinderGeometry(0.33, 0.35, 0.3, 12), M.metal, [mx, my + 0.17, mz]);
      B.add(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12, 1, true), M.dark, [mx, my + 0.12, mz]);
      B.add(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 8), M.metal, [mx, HUB_Y + 0.02, mz]);
      (sz < 0 ? L : LR).add(new THREE.BoxGeometry(0.18, 0.1, 0.14), M.lamp, [mx + sx * 0.42, my - 0.1, mz], [0, 0, 0], [1, 1, 1], sz < 0 ? (sx < 0 ? 0xff2a1a : 0x2aff5a) : 0xf4f6ff);
    }
    // lá cánh quạt: 2 lá có bước xoắn (dir = chiều quay), dựng sẵn 2 bộ
    const blades = {};
    for (const dir of [1, -1]) {
      const BL = batcher();
      for (const k of [0, 1]) BL.add(bladeGeo(PROP_R), M.prop, [0, 0, 0], [dir * 0.16, k * Math.PI, 0, 'YXZ']);   // xoắn quanh trục lá rồi quay lá 2 nửa vòng
      blades[dir] = BL.merge();
    }
    // đĩa mờ cánh quạt 4 rotor gộp 1 lưới (đĩa tròn đều nên không cần quay)
    const discGeo = (() => {
      const D = batcher(), m = new THREE.MeshBasicMaterial();
      for (const [mx, mz] of MOTORS) D.add(new THREE.CircleGeometry(1.34, 28), m, [mx, HUB_Y + 0.03, mz], [-Math.PI / 2, 0, 0]);
      return D.merge()[0].geo;
    })();
    TPL = { M, body: B.merge(), blades, discGeo, navFront: L.merge(), navRear: LR.merge(), ledGeo: new THREE.BoxGeometry(0.7, 0.07, 0.06) };
    return TPL;
  }

  function build(team) {
    const T = template(), M = T.M;
    const g = new THREE.Group();
    g.name = 'reconDrone';
    meshes(T.body, g, true);
    const rotors = [];
    MOTORS.forEach(([mx, mz]) => {
      const dir = Math.sign(mx) * Math.sign(mz) > 0 ? 1 : -1;
      const hub = new THREE.Group();
      hub.position.set(mx, HUB_Y, mz);
      hub.rotation.y = Math.random() * Math.PI;
      const blades = new THREE.Group();
      meshes(T.blades[dir], blades, true);
      hub.add(blades);
      g.add(hub);
      rotors.push({ hub, blades, dir });
    });
    // đĩa mờ: vật liệu riêng từng drone (độ đậm theo vòng quay của drone đó)
    const discMat = new THREE.MeshBasicMaterial({ map: discTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(T.discGeo, discMat);
    disc.userData.shared = true;
    disc.visible = false;
    g.add(disc);
    const navF = new THREE.Group(), navR = new THREE.Group();
    meshes(T.navFront, navF, false);
    meshes(T.navRear, navR, false);
    g.add(navF, navR);
    // đèn màu phe (dải mảnh ở đuôi thân)
    const led = new THREE.Mesh(T.ledGeo, team === 'RED' ? M.teamR : M.teamB);
    led.userData.shared = true;
    led.position.set(0, 1.15, 2.33);
    g.add(led);
    g.userData = { rotors, disc, discMat, led, navF, navR, rpm: 0, t: 0 };
    return g;
  }

  // rpm 0..1 (0 = cánh đứng yên, 1 = treo); cánh quay + đĩa mờ hiện dần khi quay nhanh; đèn hàng không bật khi bay
  function animate(g, dt, rpm) {
    const U = g.userData;
    U.rpm += (rpm - U.rpm) * Math.min(1, dt * (rpm > U.rpm ? 2.5 : 1.2));
    U.t += dt;
    if (U.rpm > 0.002) for (const r of U.rotors) r.hub.rotation.y += r.dir * U.rpm * 95 * dt;
    const op = Math.max(0, Math.min(0.85, (U.rpm - 0.3) * 1.4));
    U.discMat.opacity = op;
    U.disc.visible = op > 0.01;
    const fast = U.rpm > 0.8;
    for (const r of U.rotors) r.blades.visible = !fast;
    const on = U.rpm > 0.05;
    U.navF.visible = on;
    U.navR.visible = on && (U.t % 1.1) < 0.07;
    U.led.visible = !on || (U.t % 1.2) < 0.5;
  }

  // ---------- HỘP CHỨA DRONE trên nóc cabin ----------
  let DOCK_TPL = null;
  function dockTemplate() {
    if (DOCK_TPL) return DOCK_TPL;
    const std = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const M = { armor: std(0x56604a, 0.78, 0.15), frame: std(0x3a3f35, 0.6, 0.35), pad: std(0x23251f, 0.9, 0.05), mark: std(0xc9a640, 0.7, 0.05), steel: std(0x5e5b55, 0.45, 0.6) };
    const B = batcher(), W = DOCK.w, D = DOCK.d, H = DOCK.h, t = 0.28;
    // đế + sàn sạc (vạch đáp chữ H, tiếp điểm sạc)
    B.add(new THREE.BoxGeometry(W, DOCK.floor, D), M.frame, [0, DOCK.floor / 2, 0]);
    B.add(new THREE.BoxGeometry(W - 2 * t - 0.1, 0.04, D - 2 * t - 0.1), M.pad, [0, DOCK.floor + 0.02, 0]);
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.22, 0.02, 2.2), M.mark, [sx * 0.85, DOCK.floor + 0.05, 0]);
    B.add(new THREE.BoxGeometry(1.5, 0.02, 0.22), M.mark, [0, DOCK.floor + 0.05, 0]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(new THREE.BoxGeometry(0.5, 0.06, 0.5), M.steel, [sx * 2.5, DOCK.floor + 0.04, sz * 2.25]);
    // vách giáp 4 bên + cột góc
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(t, H - DOCK.floor, D), M.armor, [sx * (W / 2 - t / 2), DOCK.floor + (H - DOCK.floor) / 2, 0]);
    for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(W - 2 * t, H - DOCK.floor, t), M.armor, [0, DOCK.floor + (H - DOCK.floor) / 2, sz * (D / 2 - t / 2)]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(new THREE.BoxGeometry(0.45, H + 0.05, 0.45), M.frame, [sx * (W / 2 - 0.15), (H + 0.05) / 2, sz * (D / 2 - 0.15)]);
    // gân tăng cứng + bu-lông + móc cẩu 2 bên hông, hộp điều khiển / sạc phía sau
    for (const sx of [-1, 1]) {
      for (const y of [1.2, 2.2]) B.add(new THREE.BoxGeometry(0.12, 0.16, D - 0.6), M.frame, [sx * (W / 2 + 0.04), y, 0]);
      B.add(new THREE.TorusGeometry(0.28, 0.08, 6, 10), M.steel, [sx * (W / 2 + 0.1), H - 0.5, 0], [0, Math.PI / 2, 0]);
    }
    B.add(new THREE.BoxGeometry(2.4, 1.2, 0.5), M.frame, [1.6, 1.25, D / 2 + 0.25]);
    B.add(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), M.steel, [2.6, 1.25, D / 2 + 0.55], [Math.PI / 2, 0, 0]);   // giắc cáp
    // bản lề nắp trước / sau
    for (const sz of [-1, 1]) B.add(new THREE.CylinderGeometry(0.16, 0.16, W - 1.0, 10), M.steel, [0, H, sz * (D / 2 - 0.05)], [0, 0, Math.PI / 2]);
    // 2 nắp lật: bản lề ở mép trước / sau
    const lids = {};
    for (const sz of [-1, 1]) {
      const LB = batcher(), half = D / 2 - 0.05;
      LB.add(new THREE.BoxGeometry(W - 0.1, 0.24, half), M.armor, [0, 0.12, -sz * half / 2]);
      for (let i = 0; i < 3; i++) LB.add(new THREE.BoxGeometry(W - 1.4, 0.1, 0.18), M.armor, [0, 0.28, -sz * (0.6 + i * 1.15)]);   // gân chống võng
      LB.add(new THREE.BoxGeometry(1.4, 0.12, 0.12), M.armor, [0, 0.3, -sz * (half - 0.35)]);   // tay nắm / chốt khóa
      lids[sz] = LB.merge();
    }
    DOCK_TPL = { body: B.merge(), lids, lampGeo: new THREE.BoxGeometry(0.5, 0.18, 0.06) };
    return DOCK_TPL;
  }

  function buildDock() {
    const T = dockTemplate(), D = DOCK.d, H = DOCK.h;
    const g = new THREE.Group();
    g.name = 'droneDock';
    meshes(T.body, g, true);
    // 2 nắp lật: bản lề ở mép trước / sau, mở ngửa ra ngoài
    const lids = [];
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, H, sz * (D / 2 - 0.05));
      meshes(T.lids[sz], pivot, true);
      g.add(pivot);
      lids.push({ pivot, sz });
    }
    // đèn trạng thái trên hộp điều khiển (vật liệu riêng: màu theo trạng thái từng xe)
    const lamp = new THREE.Mesh(T.lampGeo, new THREE.MeshBasicMaterial({ color: 0x40ff70 }));
    lamp.userData.shared = true;
    lamp.position.set(1.6, 1.55, D / 2 + 0.52);
    g.add(lamp);
    g.position.set(DOCK.x, DOCK.y, DOCK.z);
    g.userData = { lids, lamp, open: 0, t: 0 };
    return g;
  }

  /** open: nắp mở (true) / đóng; status: 'ready' (xanh) | 'charging' (vàng nhấp nháy) | 'out' (xanh dương: drone đang bay) | 'empty' (đỏ: mất drone) */
  function animateDock(dock, dt, open, status) {
    const U = dock.userData;
    U.t += dt;
    U.open += ((open ? 1 : 0) - U.open) * Math.min(1, dt * 7);
    const a = U.open * 1.68;   // ~96°: nắp trước không quệt vào ăng-ten cabin
    for (const L of U.lids) L.pivot.rotation.x = L.sz * a;
    const col = status === 'empty' ? 0xff3020 : status === 'out' ? 0x3aa0ff : status === 'charging' ? 0xffb020 : 0x40ff70;
    if (U.col !== col) { U.col = col; U.lamp.material.color.setHex(col); }
    U.lamp.visible = status !== 'charging' || (U.t % 1) < 0.6;
  }

  return { PAD, DOCK, CENTER_Y, build, animate, buildDock, animateDock };
})();

if (typeof window !== 'undefined') window.ReconDrone = ReconDrone;
