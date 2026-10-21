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
  const DOCK = { x: 6.1, y: 22.5, z: -26.4, w: 8.0, d: 8.0, h: 3.7, floor: 0.45 };
  // bãi đáp (đáy chân đáp khi đậu) = sàn sạc trong hộp
  const PAD = { x: DOCK.x, y: DOCK.y + DOCK.floor, z: DOCK.z };
  const CENTER_Y = 2.0;   // tâm thân drone trên gốc mô hình

  // ---------- dựng hình: gộp phần tĩnh theo vật liệu (ít lượt vẽ) ----------
  function batcher() {
    const buckets = new Map();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    return {
      add(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
        let g = geo.index ? geo.toNonIndexed() : geo;
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        q.setFromEuler(e.set(rot[0], rot[1], rot[2]));
        m4.compose(p.set(pos[0], pos[1], pos[2]), q, s.set(scl[0], scl[1], scl[2]));
        g.applyMatrix4(m4);
        if (!buckets.has(mat)) buckets.set(mat, []);
        buckets.get(mat).push(g);
        return g;
      },
      // ống tròn nối 2 điểm
      tube(a, b, r, mat, seg = 8) {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
        const g = new THREE.CylinderGeometry(r, r, L, seg, 1).toNonIndexed();
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
        g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        this.add(g, mat);
      },
      build(group) {
        buckets.forEach((geos, mat) => {
          let n = 0;
          for (const g of geos) n += g.attributes.position.count;
          const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
          let o = 0;
          for (const g of geos) {
            const c = g.attributes.position.count;
            pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
            nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
            uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
            o += c;
            g.dispose();
          }
          const out = new THREE.BufferGeometry();
          out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
          out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          out.computeBoundingSphere();
          const mesh = new THREE.Mesh(out, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        });
      }
    };
  }

  // khối bo tròn mép: đường viền nhìn từ trên (điểm [x, -z]: dương = phía mũi) đùn theo chiều cao
  function roundedSlab(outline, height, bevel) {
    const sh = new THREE.Shape();
    outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, height - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
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
    x.strokeStyle = 'rgba(200,205,210,0.18)';
    [0.42, 0.62, 0.8].forEach(k => { x.lineWidth = 1.2; x.beginPath(); x.arc(c, c, k * S / 2, 0, Math.PI * 2); x.stroke(); });
    DISC_TEX = new THREE.CanvasTexture(cv);
    return DISC_TEX;
  }

  function materials() {
    const std = (color, roughness, metalness, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra || {}));
    return {
      shell: std(0x4d5444, 0.72, 0.05),     // vỏ composite sơn xanh ô-liu mờ
      dark: std(0x1f2220, 0.6, 0.1),        // nhựa kỹ thuật đen xám
      carbon: std(0x202224, 0.38, 0.35),    // ống sợi carbon
      metal: std(0x3a3d40, 0.32, 0.75),     // chuông mô-tơ nhôm anode
      prop: std(0x151617, 0.45, 0.05, { side: THREE.DoubleSide }),
      glass: std(0x0a1216, 0.06, 0.7, { emissive: 0x06121a, emissiveIntensity: 0.25 }),
      rubber: std(0x111111, 0.95, 0)
    };
  }

  function build(team) {
    const g = new THREE.Group();
    g.name = 'reconDrone';
    const M = materials(), B = batcher();
    // ---- thân: đáy + vỏ trên vồng, mũi vuốt ----
    B.add(roundedSlab(bodyOutline(1.9, 3.3, 0.45, 0.78), 0.75, 0.2), M.dark, [0, 1.35, 0]);
    B.add(roundedSlab(bodyOutline(1.7, 3.0, 0.5, 0.72), 0.55, 0.22), M.shell, [0, 2.02, 0.05]);
    B.add(roundedSlab(bodyOutline(1.25, 1.85, 0.35, 0.8), 0.28, 0.12), M.shell, [0, 2.5, 0.2]);
    // pin rút ở lưng (sau), gân bấm tháo
    B.add(roundedSlab(bodyOutline(1.1, 0.95, 0.15, 1), 0.36, 0.08), M.dark, [0, 2.5, 1.05]);
    for (let i = 0; i < 3; i++) B.add(new THREE.BoxGeometry(1.0, 0.05, 0.08), M.metal, [0, 2.88, 0.75 + i * 0.22]);
    // vòm GPS / liên lạc vệ tinh
    B.add(new THREE.CylinderGeometry(0.42, 0.46, 0.14, 16), M.dark, [0, 2.84, -0.15]);
    B.add(new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.shell, [0, 2.9, -0.15], [0, 0, 0], [1, 0.35, 1]);
    // khe tản nhiệt hai bên hông
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) B.add(new THREE.BoxGeometry(0.04, 0.12, 0.45), M.dark, [sx * 1.16, 1.82, -0.2 + i * 0.22 - 0.3]);
    // camera tránh vật cản: cặp mắt kép mũi / đuôi / nóc / đáy
    for (const sx of [-0.4, 0.4]) {
      B.add(new THREE.SphereGeometry(0.13, 10, 8), M.glass, [sx, 1.95, -1.83]);
      B.add(new THREE.SphereGeometry(0.11, 10, 8), M.glass, [sx, 1.9, 1.85]);
      B.add(new THREE.SphereGeometry(0.1, 10, 8), M.glass, [sx, 2.74, -0.9]);
      B.add(new THREE.SphereGeometry(0.1, 10, 8), M.glass, [sx * 1.4, 1.32, 0.5]);
    }
    // ---- gimbal dưới mũi: giá chữ U + đầu camera 3 ống kính ----
    B.add(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 12), M.dark, [0, 1.25, -1.15]);
    B.add(new THREE.BoxGeometry(1.15, 0.12, 0.42), M.dark, [0, 1.12, -1.15]);
    for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.1, 0.62, 0.36), M.dark, [sx * 0.55, 0.82, -1.15]);
    const ball = new THREE.Group();
    ball.position.set(0, 0.72, -1.15);
    {
      const BB = batcher();
      BB.add(roundedSlab(bodyOutline(0.62, 0.52, 0.2, 1), 0.66, 0.16), M.shell, [0, -0.33, 0]);
      BB.add(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 16), M.dark, [-0.2, 0.08, -0.42], [Math.PI / 2, 0, 0]);   // ống zoom
      BB.add(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 16), M.glass, [-0.2, 0.08, -0.45], [Math.PI / 2, 0, 0]);
      BB.add(new THREE.CylinderGeometry(0.12, 0.13, 0.1, 14), M.dark, [0.2, 0.14, -0.42], [Math.PI / 2, 0, 0]);   // góc rộng
      BB.add(new THREE.CylinderGeometry(0.085, 0.085, 0.11, 14), M.glass, [0.2, 0.14, -0.44], [Math.PI / 2, 0, 0]);
      BB.add(new THREE.BoxGeometry(0.24, 0.22, 0.08), M.dark, [0.2, -0.14, -0.42]);                                   // cảm biến nhiệt
      BB.add(new THREE.BoxGeometry(0.16, 0.15, 0.09), M.glass, [0.2, -0.14, -0.45]);
      BB.add(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10), M.glass, [-0.2, -0.17, -0.44], [Math.PI / 2, 0, 0]); // đo xa laser
      BB.build(ball);
    }
    g.add(ball);
    // ---- 4 tay đòn sợi carbon (khớp gập ở thân, hơi chếch lên) + mô-tơ + chân đáp ----
    const rotors = [], navMats = [];
    const ARM = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of ARM) {
      const bx = sx * 0.95, bz = sz * 1.15, mx = sx * 2.25, mz = sz * 2.05, my = 2.02;
      B.add(new THREE.BoxGeometry(0.46, 0.34, 0.46), M.dark, [bx, 1.86, bz], [0, Math.atan2(sx, sz), 0]);   // khớp gập
      B.add(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), M.metal, [bx, 1.86, bz]);                         // chốt khớp
      B.tube([bx, 1.88, bz], [mx, my, mz], 0.13, M.carbon, 10);
      // đế + chuông mô-tơ (chuông có khe gió: vòng tối)
      B.add(new THREE.CylinderGeometry(0.36, 0.3, 0.2, 16), M.dark, [mx, my + 0.02, mz]);
      B.add(new THREE.CylinderGeometry(0.33, 0.35, 0.28, 18), M.metal, [mx, my + 0.26, mz]);
      B.add(new THREE.CylinderGeometry(0.355, 0.355, 0.06, 18), M.dark, [mx, my + 0.24, mz]);
      // chân đáp dưới mô-tơ: thanh chéo + đế cao su
      B.tube([mx, my - 0.08, mz], [mx + sx * 0.25, 0.12, mz + sz * 0.2], 0.06, M.carbon, 6);
      B.add(new THREE.SphereGeometry(0.13, 10, 8), M.rubber, [mx + sx * 0.25, 0.1, mz + sz * 0.2], [0, 0, 0], [1, 0.75, 1]);
      // đèn hàng không dưới mô-tơ: trước trái đỏ, trước phải xanh lá, sau: trắng chớp
      const nav = new THREE.MeshBasicMaterial({ color: sz < 0 ? (sx < 0 ? 0xff2a1a : 0x2aff5a) : 0xf4f6ff });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), nav);
      lamp.position.set(mx, my - 0.12, mz);
      g.add(lamp);
      navMats.push({ m: lamp, rear: sz > 0 });
      // rotor: 2 lá có xoắn (bước cánh) + chóp mũ ốc + đĩa mờ khi quay nhanh
      const hub = new THREE.Group();
      hub.position.set(mx, my + 0.48, mz);
      const dir = sx * sz > 0 ? 1 : -1;
      const blades = new THREE.Group();
      for (const k of [0, 1]) {
        const b = new THREE.Mesh(bladeGeo(1.32), M.prop);
        b.rotation.set(dir * 0.16, k * Math.PI, 0, 'YXZ');   // bước cánh: xoắn quanh trục lá rồi xoay lá thứ 2 nửa vòng
        b.castShadow = true;
        blades.add(b);
      }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.metal);
      cap.scale.set(1, 0.8, 1);
      blades.add(cap);
      hub.add(blades);
      g.add(hub);
      rotors.push({ hub, blades, dir });
    }
    // ăng-ten liên lạc gập dưới 2 chân sau
    for (const sx of [-1, 1]) B.tube([sx * 2.35, 1.9, 2.15], [sx * 2.55, 0.9, 2.45], 0.035, M.dark, 5);
    B.build(g);
    // đĩa mờ cánh quạt (chung 1 vật liệu, đậm dần theo vòng quay)
    const discMat = new THREE.MeshBasicMaterial({ map: discTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    for (const r of rotors) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.34, 32), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.03;
      r.hub.add(disc);
      r.disc = disc;
    }
    // đèn màu phe (dải mảnh ở đuôi thân)
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.06), new THREE.MeshBasicMaterial({ color: team === 'RED' ? 0xff4040 : 0x40a0ff }));
    led.position.set(0, 1.62, 1.86);
    g.add(led);
    g.traverse(o => { if (o.isMesh && o.material !== discMat && o.material.type !== 'MeshBasicMaterial') o.castShadow = true; });
    g.userData = { rotors, discMat, led, ball, nav: navMats, rpm: 0, t: 0 };
    return g;
  }

  // rpm 0..1 (0 = cánh đứng yên, 1 = treo); cánh quay + đĩa mờ hiện dần khi quay nhanh; đèn hàng không bật khi bay
  function animate(g, dt, rpm) {
    const U = g.userData;
    U.rpm += (rpm - U.rpm) * Math.min(1, dt * (rpm > U.rpm ? 2.5 : 1.2));
    U.t += dt;
    for (const r of U.rotors) r.hub.rotation.y += r.dir * U.rpm * 95 * dt;
    U.discMat.opacity = Math.max(0, Math.min(0.85, (U.rpm - 0.3) * 1.4));
    const fast = U.rpm > 0.8;
    for (const r of U.rotors) r.blades.visible = !fast;
    const on = U.rpm > 0.05;
    const strobe = (U.t % 1.1) < 0.07;
    for (const n of U.nav) n.m.visible = on && (!n.rear || strobe);
    U.led.visible = !on || (U.t % 1.2) < 0.5;
  }

  // ---------- HỘP CHỨA DRONE trên nóc cabin ----------
  function buildDock() {
    const g = new THREE.Group();
    g.name = 'droneDock';
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
    B.build(g);
    // 2 nắp lật: bản lề ở mép trước / sau, mở ngửa ra ngoài
    const lids = [];
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, H, sz * (D / 2 - 0.05));
      const LB = batcher(), half = D / 2 - 0.05;
      LB.add(new THREE.BoxGeometry(W - 0.1, 0.24, half), M.armor, [0, 0.12, -sz * half / 2]);
      for (let i = 0; i < 3; i++) LB.add(new THREE.BoxGeometry(W - 1.4, 0.1, 0.18), M.frame, [0, 0.28, -sz * (0.6 + i * 1.15)]);   // gân chống võng
      LB.add(new THREE.BoxGeometry(1.4, 0.12, 0.12), M.steel, [0, 0.3, -sz * (half - 0.35)]);   // tay nắm / chốt khóa
      LB.build(pivot);
      g.add(pivot);
      lids.push({ pivot, sz });
    }
    // đèn trạng thái trên hộp điều khiển
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.06), new THREE.MeshBasicMaterial({ color: 0x40ff70 }));
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
    U.lamp.material.color.setHex(col);
    U.lamp.visible = status !== 'charging' || (U.t % 1) < 0.6;
  }

  return { PAD, DOCK, CENTER_Y, build, animate, buildDock, animateDock };
})();

if (typeof window !== 'undefined') window.ReconDrone = ReconDrone;
