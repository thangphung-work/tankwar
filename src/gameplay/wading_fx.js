/**
 * HIỆU ỨNG XE LỘI NƯỚC (sông / hồ)
 * - Sóng rẽ nước ở mũi xe: bọt trắng dồn trước mũi rồi tách sang hai bên thành hình chữ V phía sau
 * - Bọt trắng sủi hai bên dải xích / bánh, kéo thành vệt sau đuôi xe
 * - Vòng sóng loang: xe chạy thì chồng lên nhau thành vệt sóng đuôi tàu, xe đứng yên thì gợn nhẹ do máy rung
 * - Tia nước bắn khi xe tăng tốc / bứt tốc / bánh quay trượt (dùng lớp hạt của ExplosionFX như cột nước đạn rơi)
 * Một lớp InstancedMesh phẳng nằm trên mặt nước cho cả bọt và vòng sóng (1 lần vẽ cho mọi xe).
 * Tỉ lệ: 8 đơn vị = 1 m.
 */
const WadingFX = (() => {
  const MAX = 900;
  let L = null;          // lớp vẽ hiện tại (theo scene)
  let lastNow = 0;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Vân bọt nước: nhiều bọt nhỏ chen nhau, mép tơi (không thành đĩa tròn đặc)
  let TEX = null;
  function foamTexture() {
    if (TEX) return TEX;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    // nền bọt loang mềm ở giữa, rồi rắc dày các bọt nhỏ lên trên
    const base = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.48);
    base.addColorStop(0, 'rgba(255,255,255,0.55)');
    base.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    base.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * 6.283, r = Math.pow(Math.random(), 0.7) * S * 0.48;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, s = rand(1.5, 6) * (1 - r / S);
      const k = rand(0.25, 0.9);
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, `rgba(255,255,255,${k})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, s, 0, 6.283); g.fill();
    }
    TEX = new THREE.CanvasTexture(c);
    return TEX;
  }

  function makeLayer(scene) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    const iData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    iPos.setUsage(THREE.DynamicDrawUsage); iData.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', iPos);
    geo.setAttribute('iData', iData);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,   // mặt phẳng XY trải sang XZ bị lật chiều
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uCol: { value: new THREE.Color(0.8, 0.84, 0.83) } }]),
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iData;   // iData: cỡ, góc xoay, độ đục, loại (0 bọt, 1 vòng sóng)
        varying vec2 vUv; varying float vA; varying float vK; varying float vS;
        #include <fog_pars_vertex>
        void main() {
          float c = cos(iData.y), s = sin(iData.y);
          vec2 p = position.xy * iData.x;
          vec3 w = iPos + vec3(c * p.x - s * p.y, 0.0, s * p.x + c * p.y);
          vec4 mvPosition = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vUv = uv; vA = iData.z; vK = iData.w; vS = iData.x;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec3 uCol;
        varying vec2 vUv; varying float vA; varying float vK; varying float vS;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec2 q = vUv * 2.0 - 1.0;
          float d = length(q);
          float n = texture2D(uMap, vUv).r;
          float a;
          if (vK < 0.5) a = smoothstep(0.06, 0.6, n) * (1.0 - smoothstep(0.35, 1.0, d));
          else {
            float w = clamp(2.2 / vS, 0.02, 0.14);
            float n2 = texture2D(uMap, vec2(atan(q.y, q.x) * 0.159 + 0.5, 0.5 + d * 0.3)).r;
            a = (1.0 - smoothstep(0.0, w, abs(d - 0.86))) * (0.55 + 0.45 * smoothstep(0.05, 0.5, n2));
          }
          a *= vA;
          if (a < 0.008) discard;
          gl_FragColor = vec4(uCol * (0.9 + 0.1 * n), min(1.0, a));
          #include <fog_fragment>
        }`
    });
    mat.uniforms.uMap.value = foamTexture();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;           // vẽ sau mặt nước (renderOrder 2)
    scene.add(mesh);
    return { scene, mesh, geo, iPos, iData, parts: [] };
  }

  function layerFor(scene) {
    // trận mới có thể dọn sạch scene cũ (cùng đối tượng scene) -> lớp đã bị gỡ thì tạo lại
    if (L && L.scene === scene && L.mesh.parent === scene) return L;
    if (L) { if (L.mesh.parent) L.mesh.parent.remove(L.mesh); L.geo.dispose(); L.mesh.material.dispose(); }
    L = scene ? makeLayer(scene) : null;
    return L;
  }

  function add(p) {
    if (!L) return;
    p.t = 0;
    p.rot = p.rot !== undefined ? p.rot : Math.random() * 6.283;
    p.rotV = p.rotV !== undefined ? p.rotV : rand(-0.3, 0.3);
    if (L.parts.length >= MAX) L.parts.shift();
    L.parts.push(p);
  }

  // Cập nhật lớp hạt — gọi từ mọi xe mỗi khung, chỉ chạy 1 lần / khung hình
  function frame() {
    if (!L) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    if (dt < 0.002) return;
    lastNow = now;
    const P = L.parts, pos = L.iPos.array, dat = L.iData.array;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const dr = Math.exp(-(p.drag || 0) * dt);
      p.vx *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      p.rot += p.rotV * dt;
      P[n++] = p;
    }
    P.length = n;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const fi = p.fadeIn || 0.08;
      const a = p.t < fi ? p.alpha * p.t / fi : p.alpha * Math.pow(1 - (p.t - fi) / (p.life - fi), 1.3);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      dat[i * 4] = p.size; dat[i * 4 + 1] = p.rot; dat[i * 4 + 2] = Math.max(0, a); dat[i * 4 + 3] = p.kind;
    }
    L.geo.instanceCount = n;
    L.iPos.needsUpdate = true; L.iData.needsUpdate = true;
  }

  // Kích thước thân xe (hệ toạ độ xe: mũi -Z, phải +X), bỏ tháp pháo / nòng
  function dims(u) {
    if (u._wadeDims) return u._wadeDims;
    let d = { front: 22, rear: 20, halfW: 15 };
    try {
      const g = u.group;
      g.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const box = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
      const skip = u.turretGroup;
      const walk = (o) => {
        if (o === skip || !o.visible) return;
        if (o.isMesh && o.geometry && !o.isInstancedMesh) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          m.multiplyMatrices(inv, o.matrixWorld);
          tmp.copy(o.geometry.boundingBox).applyMatrix4(m);
          box.union(tmp);
        }
        for (const c of o.children) walk(c);
      };
      walk(u.chassisGroup || g);
      if (!box.isEmpty()) {
        const f = -box.min.z, r = box.max.z, w = Math.max(-box.min.x, box.max.x);
        if (f > 8 && f < 60 && r > 8 && r < 60 && w > 6 && w < 30) d = { front: f, rear: r, halfW: w };
      }
    } catch (e) { /* giữ kích thước mặc định */ }
    u._wadeDims = d;
    return d;
  }

  /**
   * Phát hiệu ứng cho xe `u` đang lội nước.
   * w: { depth (đơn vị game, từ đáy tới mặt nước), waterY, boost, accel (đơn vị/s²), stall (bánh quay trượt chỗ nước quá sâu) }
   */
  function emit(u, dt, w) {
    if (!u.scene || !w || w.depth < 0.6) return;
    layerFor(u.scene);
    const S = u._wadeFx || (u._wadeFx = { bow: 0, side: 0, ring: 0, idle: 0, spray: 0, dist: 0, lx: u.x, lz: u.z, wasIn: false });
    const D = dims(u);
    const a = u.bodyAngle || 0;
    const fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
    const vAbs = Math.abs(u.speed || 0), dir = (u.speed || 0) >= 0 ? 1 : -1;
    const vmax = u.baseMaxSpeed || 100;
    const sp = Math.min(1.3, vAbs / vmax);
    const dk = Math.min(1, w.depth / 10);                  // ngập càng sâu sóng càng to
    const y = w.waterY + 0.3;
    // đầu xe theo chiều đang chạy (lùi thì sóng dồn ở đuôi)
    const bowL = dir > 0 ? D.front : D.rear;
    const bx = u.x + fx * dir * bowL * 0.92, bz = u.z + fz * dir * bowL * 0.92;
    const sternL = dir > 0 ? D.rear : D.front;
    const sx = u.x - fx * dir * sternL, sz = u.z - fz * dir * sternL;
    const vx = fx * (u.speed || 0) * (u._groundMult || 1), vz = fz * (u.speed || 0) * (u._groundMult || 1);   // vận tốc thật của xe
    const fxSys = window.game && window.game.effectsManager && window.game.effectsManager.fx;
    const muddy = w.depth < 4;
    const WATER = [0.78, 0.84, 0.85], MUD = [0.5, 0.47, 0.38];
    const sprayCol = () => (muddy && Math.random() < 0.5 ? MUD : WATER);

    // Xe vừa lao xuống nước khi đang chạy: nước toé mạnh quanh mũi
    if (!S.wasIn && sp > 0.25 && fxSys && fxSys.smoke) {
      const n = Math.round(16 + sp * 24);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1, sideSp = rand(10, 30) * (0.5 + sp);
        fxSys.smoke.add({ x: bx + rx * side * rand(0, D.halfW), y: w.waterY + 1, z: bz + rz * side * rand(0, D.halfW),
          vx: rx * side * sideSp + vx * 0.6, vy: rand(18, 42) * (0.6 + sp * 0.6), vz: rz * side * sideSp + vz * 0.6,
          size: rand(3, 7), grow: 6, drag: 1.2, grav: 140, life: rand(0.7, 1.2), alpha: 0.75, fadeIn: 0.01, c0: sprayCol(), cell: 2, floor: false });
      }
      for (let i = 0; i < 2; i++) add({ kind: 1, x: bx, y, z: bz, vx: vx * 0.3, vz: vz * 0.3, size: 10, grow: 26 + sp * 20, drag: 0.6, alpha: 0.55, life: 2.2 + i * 0.6, fadeIn: 0.05 });
    }
    S.wasIn = true;

    // 1) Sóng rẽ ở mũi: bọt dồn trước mũi (chạy theo xe) rồi tách ra hai bên -> hình chữ V
    if (vAbs > 3) {
      S.bow += dt;
      const iv = 0.05 / Math.max(0.35, sp);
      while (S.bow > iv) {
        S.bow -= iv;
        for (const side of [-1, 1]) {
          const off = rand(0, D.halfW * 1.05);
          const out = (6 + vAbs * 0.32) * rand(0.7, 1.2);
          add({ kind: 0, x: bx + rx * side * off + fx * dir * rand(0, 3), y: y + 0.08, z: bz + rz * side * off + fz * dir * rand(0, 3),
            vx: vx * 0.85 + rx * side * out, vz: vz * 0.85 + rz * side * out, size: rand(6, 10) * (0.6 + dk * 0.6), grow: rand(5, 9),
            drag: 1.4, alpha: 0.75 * (0.5 + 0.5 * Math.min(1, sp * 1.5)), life: rand(1.6, 2.6), fadeIn: 0.06 });
        }
      }
      // tia nước bắn lên trước mũi (sóng mũi vỡ) — càng nhanh càng cao
      if (fxSys && fxSys.smoke && sp > 0.18) {
        S.spray += dt * (4 + sp * 22) * (0.4 + dk);
        while (S.spray > 1) {
          S.spray -= 1;
          const side = Math.random() < 0.5 ? -1 : 1, off = rand(0.2, 1.05) * D.halfW;
          fxSys.smoke.add({ x: bx + rx * side * off, y: w.waterY + 0.8, z: bz + rz * side * off,
            vx: vx * 0.9 + rx * side * rand(6, 16), vy: rand(6, 14) + sp * 16, vz: vz * 0.9 + rz * side * rand(6, 16),
            size: rand(2.5, 5), grow: 5, drag: 1.6, grav: 120, life: rand(0.45, 0.8), alpha: 0.6, fadeIn: 0.01, c0: sprayCol(), cell: 2, floor: false });
        }
      }
    }

    // 2) Bọt sủi hai bên dải xích / bánh: kéo dài thành 2 vệt bọt sau xe
    if (vAbs > 2 || w.stall) {
      S.side += dt * (vAbs / 9 + (w.stall ? 10 : 0));
      while (S.side > 1) {
        S.side -= 1;
        for (const side of [-1, 1]) {
          const along = rand(-sternL, bowL) * dir;
          const off = D.halfW * rand(0.92, 1.12);
          add({ kind: 0, x: u.x + rx * side * off + fx * along, y, z: u.z + rz * side * off + fz * along,
            vx: vx * 0.15 + rx * side * rand(2, 6), vz: vz * 0.15 + rz * side * rand(2, 6), size: rand(5, 9), grow: rand(2.5, 5),
            drag: 0.9, alpha: rand(0.45, 0.7), life: rand(2.6, 4.2), fadeIn: 0.1 });
        }
      }
      // nước sủi trắng ngay sau đuôi do xích / bánh quẫy
      if (Math.random() < dt * (3 + sp * 10)) {
        add({ kind: 0, x: sx + rx * rand(-1, 1) * D.halfW * 0.8, y, z: sz + rz * rand(-1, 1) * D.halfW * 0.8,
          vx: -vx * 0.1, vz: -vz * 0.1, size: rand(8, 14), grow: 5, drag: 1, alpha: 0.55, life: rand(2.5, 3.8), fadeIn: 0.12 });
      }
    }

    // 3) Vòng sóng: chạy -> mỗi quãng một vòng ở mũi (chồng thành sóng đuôi tàu); đứng yên -> gợn nhẹ do máy rung
    S.dist += Math.hypot(u.x - S.lx, u.z - S.lz);
    S.lx = u.x; S.lz = u.z;
    if (vAbs > 4) {
      if (S.dist > 16) {
        S.dist = 0;
        add({ kind: 1, x: bx - fx * dir * 4, y: y - 0.05, z: bz - fz * dir * 4, vx: 0, vz: 0, size: D.halfW * 1.6, grow: 18 + vAbs * 0.18, drag: 0,
          alpha: 0.2 + 0.22 * Math.min(1, sp * 1.4) * (0.5 + dk * 0.5), life: rand(2.4, 3.2), fadeIn: 0.05, rotV: 0 });
      }
    } else {
      S.idle += dt;
      if (S.idle > 1.1) {
        S.idle = 0;
        add({ kind: 1, x: u.x, y: y - 0.05, z: u.z, vx: 0, vz: 0, size: Math.max(D.front, D.rear) * 2, grow: 10, drag: 0, alpha: 0.22, life: 2.4, fadeIn: 0.2, rotV: 0 });
      }
    }

    // 4) Tia nước khi tăng tốc / bứt tốc / bánh quay trượt: phụt ngược ra sau từ dải xích / bánh
    const push = Math.max(0, (w.accel || 0) / vmax) * 2.2 + (w.boost ? 0.6 : 0) + (w.stall ? 1.2 : 0);
    if (fxSys && fxSys.smoke && push > 0.15) {
      const lines = u._tt && u._tt.length ? u._tt : [{ lx: -D.halfW * 0.8, lz: 0 }, { lx: D.halfW * 0.8, lz: 0 }];
      const want = push * dt * 70;
      const n = Math.min(10, Math.floor(want) + (Math.random() < want % 1 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const Ln = lines[(Math.random() * lines.length) | 0];
        const lat = Ln.lx || 0;
        const ox = u.x + rx * lat - fx * dir * sternL * 0.9, oz = u.z + rz * lat - fz * dir * sternL * 0.9;
        const back = rand(14, 34) * Math.min(1.6, push);
        fxSys.smoke.add({ x: ox, y: w.waterY + 1.2, z: oz,
          vx: -fx * dir * back + rx * Math.sign(lat || 1) * rand(0, 8) + vx * 0.4, vy: rand(16, 34) * Math.min(1.4, 0.5 + push), vz: -fz * dir * back + rz * Math.sign(lat || 1) * rand(0, 8) + vz * 0.4,
          size: rand(2, 4.5), grow: 4, drag: 1.1, grav: 150, life: rand(0.6, 1.1), alpha: 0.7, fadeIn: 0.01, c0: sprayCol(), cell: 2, floor: false });
      }
    }
  }

  // Xe ra khỏi nước
  function leave(u) { if (u._wadeFx) u._wadeFx.wasIn = false; }

  /**
   * Khai hỏa sát mặt nước: luồng khí thuốc phóng từ đầu nòng ép mặt nước thành vòng sóng xung kích chạy nhanh,
   * xé mặt nước thành màn bụi nước hình nón theo hướng bắn, mặt nước dưới đầu nòng bị thổi phẳng trắng xoá.
   * tip: đầu nòng (THREE.Vector3), dir: hướng bắn (đơn vị). Không có nước trong tầm thì không làm gì.
   */
  function muzzleBlast(u, tip, dir) {
    const T = window.game && window.game.terrain;
    if (!T || !T.waterSurfaceAt || !u.scene || !tip || !dir) return;
    const hl = Math.hypot(dir.x, dir.z) || 1, hx = dir.x / hl, hz = dir.z / hl;
    // điểm mặt nước gần nhất dưới / trước đầu nòng mà luồng khí chạm tới
    let P = null;
    for (const d of [0, 10, 22, 36]) {
      const x = tip.x + hx * d, z = tip.z + hz * d, wy = T.waterSurfaceAt(x, z);
      if (wy === null || wy === undefined) continue;
      const h = tip.y + dir.y * d - wy;
      if (h > -2 && h < 42) { P = { x, z, wy, h: Math.max(0, h), d }; break; }
    }
    if (!P) return;
    layerFor(u.scene);
    const arty = u.tankType === 'ARTILLERY';
    const k = (arty ? 1.5 : 1) * (1 - P.h / 48) * (u.tankType === 'SCOUT' ? 0.6 : 1);
    if (k <= 0.05) return;
    const y = P.wy + 0.3, cx = P.x + hx * 6, cz = P.z + hz * 6;
    // vòng sóng xung kích: chạy rất nhanh rồi tắt (mặt nước rung lên như bị quất)
    add({ kind: 1, x: cx, y, z: cz, vx: hx * 40, vz: hz * 40, size: 6, grow: 260 * k, drag: 0, alpha: 0.75 * k, life: 0.45, fadeIn: 0.01, rotV: 0 });
    add({ kind: 1, x: cx, y, z: cz, vx: hx * 20, vz: hz * 20, size: 4, grow: 120 * k, drag: 0, alpha: 0.5 * k, life: 0.9, fadeIn: 0.02, rotV: 0 });
    // mảng nước bị thổi phẳng, sủi trắng dưới luồng khí (dài theo hướng bắn)
    for (let i = 0; i < 6; i++) {
      const s = rand(0, 26) * k;
      add({ kind: 0, x: cx + hx * s + rand(-4, 4), y: y + 0.05, z: cz + hz * s + rand(-4, 4), vx: hx * rand(10, 30), vz: hz * rand(10, 30),
        size: rand(12, 20) * Math.sqrt(k), grow: 22 * k, drag: 1.6, alpha: 0.7 * k, life: rand(1.6, 2.6), fadeIn: 0.03 });
    }
    // gợn sóng loang chậm sau đó
    add({ kind: 1, x: cx, y: y - 0.05, z: cz, vx: 0, vz: 0, size: 10, grow: 30 * Math.sqrt(k), drag: 0, alpha: 0.35 * k, life: 3.2, fadeIn: 0.2, rotV: 0 });
    const fxSys = window.game && window.game.effectsManager && window.game.effectsManager.fx;
    if (!fxSys || !fxSys.smoke) return;
    // màn bụi nước hình nón theo hướng bắn + tia toé sang hai bên
    const n = Math.round(46 * k);
    for (let i = 0; i < n; i++) {
      const spread = rand(-0.75, 0.75), ca = Math.cos(spread), sa = Math.sin(spread);
      const fx = hx * ca - hz * sa, fz = hz * ca + hx * sa;
      const sp = rand(40, 130) * k;
      fxSys.smoke.add({ x: cx + rand(-3, 3), y: P.wy + 0.8, z: cz + rand(-3, 3), vx: fx * sp, vy: rand(6, 26) * Math.sqrt(k), vz: fz * sp,
        size: rand(2.5, 5) * Math.sqrt(k), grow: 8, drag: 2.2, grav: 90, life: rand(0.5, 1.0), alpha: 0.7, fadeIn: 0.01, c0: [0.8, 0.85, 0.86], cell: 2, floor: false });
    }
    // sương nước mịn lơ lửng, trôi theo hướng bắn rồi tan
    for (let i = 0; i < Math.round(10 * k); i++) {
      const s = rand(4, 30);
      fxSys.smoke.add({ x: cx + hx * s, y: P.wy + rand(1, 4), z: cz + hz * s, vx: hx * rand(15, 40) + rand(-6, 6), vy: rand(2, 6), vz: hz * rand(15, 40) + rand(-6, 6),
        size: rand(7, 12) * Math.sqrt(k), grow: 10, drag: 1.4, grav: -1, life: rand(1.4, 2.4), alpha: 0.3 * k, fadeIn: 0.05, c0: [0.86, 0.9, 0.92], cell: 0, floor: false });
    }
  }

  return { emit, leave, frame, dims, muzzleBlast };
})();

if (typeof window !== 'undefined') window.WadingFX = WadingFX;
