/**
 * DẤU CHỈ 3D TRONG TRẬN — phong cách HUD tác chiến: nét mảnh, viền tối mỏng, góc vát, không phát sáng chói
 * (cùng bảng màu với thanh máu trên đầu xe: xanh phe ta #6cc4ef, đỏ địch #ec6a5c, vàng #e7a63a)
 * - Đường đạn dự kiến: một dải mỏng luôn quay mặt về camera, vạch có nhịp chạy dần về phía điểm rơi, mờ ở hai đầu
 * - Điểm rơi / điểm ngắm mặt đất / điểm lái tới: một mặt phẳng + shader vẽ nét (SDF), nghiêng theo mặt đất
 * - Khung khóa mục tiêu: 4 góc ngoặc vát quay mặt về camera, thu lại + xoay khi vừa khóa
 * Mỗi dấu là MỘT mesh tạo một lần; mỗi khung hình chỉ ghi vào buffer / uniform có sẵn.
 */
const WorldMarkers = (() => {
  // Bảng màu theo trạng thái ngắm
  const C = {
    free: 0x8fd0ec,      // chưa ngắm gì: xanh nhạt
    slew: 0xe7a63a,      // tháp / nòng đang xoay tới
    on: 0x86d39a,        // đã ngắm trúng
    blocked: 0xec6a5c,   // bị chắn / không bắn tới
    enemy: 0xec6a5c,
    ally: 0x6cc4ef
  };
  const stateColor = (state, wall) => state === 'on' ? C.on : state === 'slew' ? C.slew
    : (wall || state === 'blocked') ? C.blocked : C.free;

  const now = () => (performance.now() / 1000) % 1000;

  const LIB = `
    float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
    // nét vẽ: lõi màu + viền tối mảnh (đọc rõ trên cát sáng lẫn rừng tối); bề dày tối thiểu ~1 pixel
    void ink(float d, float fillD, float w, float pw, out float core, out float halo) {
      w = max(w, pw * 0.7);
      core = max(1.0 - smoothstep(w - pw * 0.5, w + pw * 0.5, d), 1.0 - smoothstep(-pw * 0.5, pw * 0.5, fillD));
      float o = pw * 1.7;
      halo = max(1.0 - smoothstep(w + o - pw * 0.5, w + o + pw * 0.5, d), 1.0 - smoothstep(o - pw * 0.5, o + pw * 0.5, fillD));
    }
  `;

  // ---------------------------------------------------------------- ĐƯỜNG ĐẠN
  function trajectory(maxPts = 360) {
    const n = maxPts;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3), tan = new Float32Array(n * 2 * 3);
    const side = new Float32Array(n * 2), along = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    const idx = new Uint16Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, o = i * 6;
      idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2;
      idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTan', new THREE.BufferAttribute(tan, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aS', new THREE.BufferAttribute(along, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(C.free) },
        uLen: { value: 1 },
        uTime: { value: 0 },
        uK: { value: 0.003 },       // nửa bề rộng / khoảng cách tới camera (giữ ~2 px trên màn hình)
        uPeriod: { value: 18 },
        uOpacity: { value: 1 }
      },
      vertexShader: `
        attribute vec3 aTan;
        attribute float aSide, aS;
        uniform float uK;
        varying float vSide, vS;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 toCam = cameraPosition - wp.xyz;
          float dist = length(toCam);
          vec3 sd = cross(aTan, toCam);
          float sl = length(sd);
          sd = sl > 1e-4 ? sd / sl : vec3(1.0, 0.0, 0.0);
          wp.xyz += sd * aSide * max(0.22, dist * uK);
          vSide = aSide; vS = aS;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uLen, uTime, uPeriod, uOpacity;
        varying float vSide, vS;
        void main() {
          float a = abs(vSide);
          float aw = fwidth(vSide);
          float core = 1.0 - smoothstep(0.46 - aw, 0.46 + aw, a);
          float halo = 1.0 - smoothstep(1.0 - aw * 1.5, 1.0, a);
          // nhịp vạch: vạch dài 60 %, cứ 5 vạch có 1 vạch ngắn đánh dấu cự ly; vạch trôi dần về phía điểm rơi
          float P = uPeriod;
          float u = vS - uTime * P * 1.1;
          float ph = mod(u, P);
          float k = mod(floor(u / P), 5.0);
          float on = k < 0.5 ? 0.25 : 0.6;
          float sw = max(fwidth(vS), 1e-3);
          float dash = smoothstep(0.0, sw, ph) * (1.0 - smoothstep(on * P - sw, on * P, ph));
          // mờ dần: sát miệng nòng và đoạn cuối trước điểm rơi
          float f = smoothstep(2.0, 36.0, vS) * (1.0 - 0.7 * smoothstep(uLen * 0.82, uLen, vS));
          float alpha = max(core, halo * 0.42) * dash * f * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(uColor * 0.14, uColor, core), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      extensions: { derivatives: true }
    });
    mat.color = mat.uniforms.uColor.value;   // giữ API .color.setHex như vật liệu cũ
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 997;
    mesh.userData.maxPts = n;
    return mesh;
  }

  // Ghi chuỗi điểm đường đạn vào buffer có sẵn (không tạo vật thể mới)
  function setTrajectory(mesh, points, colorHex, camera, viewH) {
    const geo = mesh.geometry, n = mesh.userData.maxPts;
    const src = points.length;
    const step = src > n ? (src - 1) / (n - 1) : 1;
    const cnt = Math.min(src, n);
    const pos = geo.attributes.position.array, tan = geo.attributes.aTan.array, al = geo.attributes.aS.array;
    let s = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < cnt; i++) {
      const p = points[Math.min(src - 1, Math.round(i * step))];
      if (i > 0) { const dx = p.x - px, dy = p.y - py, dz = p.z - pz; s += Math.sqrt(dx * dx + dy * dy + dz * dz); }
      px = p.x; py = p.y; pz = p.z;
      const o = i * 6;
      pos[o] = pos[o + 3] = p.x; pos[o + 1] = pos[o + 4] = p.y; pos[o + 2] = pos[o + 5] = p.z;
      al[i * 2] = al[i * 2 + 1] = s;
    }
    for (let i = 0; i < cnt; i++) {
      const a = Math.max(0, i - 1) * 6, b = Math.min(cnt - 1, i + 1) * 6, o = i * 6;
      let tx = pos[b] - pos[a], ty = pos[b + 1] - pos[a + 1], tz = pos[b + 2] - pos[a + 2];
      const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= l; ty /= l; tz /= l;
      tan[o] = tan[o + 3] = tx; tan[o + 1] = tan[o + 4] = ty; tan[o + 2] = tan[o + 5] = tz;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aTan.needsUpdate = true;
    geo.attributes.aS.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, cnt - 1) * 6);
    const U = mesh.material.uniforms;
    U.uLen.value = Math.max(1, s);
    U.uTime.value = now();
    U.uColor.value.setHex(colorHex);
    if (camera) {
      const h = Math.max(200, viewH || 600);
      U.uK.value = 2.3 * 2 * Math.tan((camera.fov || 50) * Math.PI / 360) / h;
      // nhịp vạch theo khoảng cách camera tới giữa đường đạn (nhìn từ xa vạch không dồn thành nét liền)
      const m = points[src >> 1], dx = m.x - camera.position.x, dy = m.y - camera.position.y, dz = m.z - camera.position.z;
      U.uPeriod.value = Math.max(14, Math.min(70, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.035));
    }
    mesh.visible = cnt > 1;
  }

  // ---------------------------------------------------------------- DẤU TRÊN MẶT ĐẤT
  const KIND = { impact: 0, move: 1, aim: 2 };
  function groundMarker(kind) {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(kind === 'move' ? C.ally : kind === 'aim' ? C.slew : C.free) },
        uKind: { value: KIND[kind] || 0 },
        uState: { value: 0 },      // điểm rơi: 1 = bị chắn (dấu X)
        uTime: { value: 0 },
        uSpin: { value: 0 },
        uPop: { value: 1 },        // điểm đến: 0 -> 1 gợn sóng khi vừa đặt
        uOpacity: { value: 1 },
        uThick: { value: 0.022 }
      },
      vertexShader: `
        varying vec2 vP;
        void main() { vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uKind, uState, uTime, uSpin, uPop, uOpacity, uThick;
        varying vec2 vP;
        ${LIB}
        void main() {
          vec2 p = vP;
          float pw = length(fwidth(p)) * 0.7071;
          float r = length(p);
          float d = 1e3, fillD = 1e3, extra = 0.0;
          if (uKind < 0.5) {
            // ĐIỂM RƠI: vòng mảnh + vạch chia quay chậm, chữ thập hở tâm; bị chắn: dấu X
            d = abs(r - 0.86);
            float st = 6.2831853 / 24.0;
            vec2 q = rot(p, uSpin);
            float k = floor(atan(q.y, q.x) / st + 0.5);
            vec2 t = rot(q, -k * st);
            float L0 = mod(k, 6.0) < 0.5 ? 0.6 : 0.76;
            d = min(d, sdSeg(t, vec2(L0, 0.0), vec2(0.86, 0.0)));
            vec2 f = abs(p);
            if (uState < 0.5) {
              if (f.x < f.y) f = f.yx;
              d = min(d, sdSeg(f, vec2(0.17, 0.0), vec2(0.48, 0.0)));
              fillD = r - 0.045;
            } else {
              d = min(d, sdSeg(f, vec2(0.12), vec2(0.4)));
            }
          } else if (uKind < 1.5) {
            // ĐIỂM ĐẾN (điểm hành quân): vòng tròn chia 4 cung hở ở 4 hướng, chấm tâm, mũi tên hướng hành quân phía
            // trước (trục +y cục bộ = hướng từ xe tới điểm, xem placeOnGround yaw) và 2 vạch dấu hai bên; gợn khi vừa đặt
            float R0 = 0.52;
            d = abs(r - R0);
            vec2 a = abs(p);
            if (min(a.x, a.y) < 0.13) d = 1e3;                  // khe ở 4 hướng
            d = min(d, sdSeg(a, vec2(R0 + 0.06, 0.0), vec2(R0 + 0.2, 0.0)));   // vạch dấu trái / phải
            // mũi tên hướng đi: tam giác nhọn đặc ở phía trước vòng
            vec2 t = vec2(abs(p.x), p.y - 0.62);
            float tri = max(t.x * 0.94 + t.y * 0.34 - 0.06, -t.y - 0.07);
            fillD = min(r - 0.07, tri);
            // gợn sóng lan ra khi vừa đặt điểm
            float rr = 0.35 + uPop * 0.62;
            float rw = max(uThick * 0.8, pw * 0.7);
            extra = (1.0 - smoothstep(rw - pw * 0.5, rw + pw * 0.5, abs(r - rr))) * (1.0 - uPop) * 0.9;
          } else {
            // ĐIỂM CHỈ ĐỊNH BẮN (điểm tham chiếu mục tiêu): 4 góc ngoặc vuông, chữ thập hở tâm, chấm tâm,
            // mũi tên nhỏ ở mép xa chỉ hướng bắn (trục +y cục bộ = hướng từ xe mình tới điểm). Đứng yên, không xoay
            vec2 a = abs(p);
            float B = 0.74, L = 0.26;
            d = min(sdSeg(a, vec2(B, B), vec2(B - L, B)), sdSeg(a, vec2(B, B), vec2(B, B - L)));
            vec2 f = a; if (f.x > f.y) f = f.yx;
            d = min(d, sdSeg(f, vec2(0.0, 0.16), vec2(0.0, 0.46)));
            vec2 t = vec2(abs(p.x), p.y - 0.9);
            d = min(d, sdSeg(t, vec2(0.0, 0.0), vec2(0.11, -0.1)));   // chevron ^ chỉ hướng bắn
            fillD = r - 0.05;
          }
          float core, halo;
          ink(d, fillD, uThick, pw, core, halo);
          core = max(core, extra);
          float alpha = max(core, halo * 0.45) * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(uColor * 0.12, uColor, core), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
      extensions: { derivatives: true }
    });
    mat.color = mat.uniforms.uColor.value;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 998;
    mesh.frustumCulled = false;
    mesh.userData.kind = kind;
    mesh.userData.pop = 1;
    mesh.userData.fade = 1;
    return mesh;
  }

  // Đặt dấu nằm sát mặt đất: nghiêng theo độ dốc tại chỗ, cỡ theo khoảng cách camera (luôn đọc được)
  const _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion();
  function placeOnGround(mesh, terrain, x, z, y, radius, yaw) {
    let gy = y;
    if (terrain && terrain.getElevationAt) {
      const e = radius * 0.6;
      const hx0 = terrain.getElevationAt(x - e, z), hx1 = terrain.getElevationAt(x + e, z);
      const hz0 = terrain.getElevationAt(x, z - e), hz1 = terrain.getElevationAt(x, z + e);
      if (gy === undefined || gy === null) gy = terrain.getElevationAt(x, z);
      _n.set(hx0 - hx1, 2 * e, hz0 - hz1).normalize();
      // dốc quá gắt (vách / tường): giữ nằm ngang cho khỏi dựng đứng
      if (_n.y < 0.55) _n.set(0, 1, 0);
      _q.setFromUnitVectors(_up, _n);
    } else _q.identity();
    _qy.setFromAxisAngle(_up, yaw || 0);
    mesh.quaternion.copy(_q).multiply(_qy);
    mesh.position.set(x, (gy || 0) + 0.5 + radius * 0.03, z);
    mesh.scale.setScalar(radius);
  }

  // Bán kính dấu theo khoảng cách camera: nhỏ nhất rMin, xa thì to dần để vẫn thấy rõ
  function sizeFor(camera, x, y, z, rMin, k) {
    if (!camera) return rMin;
    const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z;
    return Math.max(rMin, Math.sqrt(dx * dx + dy * dy + dz * dz) * k);
  }

  // Điểm đến: hiện + gợn sóng khi đặt, mờ dần khi tới nơi / hủy
  function tickMove(mesh, dt, active) {
    if (!mesh) return;
    const D = mesh.userData, U = mesh.material.uniforms;
    if (active) {
      D.pop = Math.min(1, D.pop + dt / 0.6);
      D.fade = Math.min(1, D.fade + dt * 5);
      mesh.visible = true;
    } else if (mesh.visible) {
      D.fade -= dt / 0.7;
      if (D.fade <= 0) { D.fade = 0; mesh.visible = false; }
    }
    U.uPop.value = D.pop;
    U.uOpacity.value = D.fade;
    U.uTime.value = now();
  }

  // ---------------------------------------------------------------- KHUNG KHÓA MỤC TIÊU
  function lockBrackets() {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(C.enemy) },
        uSize: { value: 40 },
        uLock: { value: 1 },       // 0 = vừa khóa (to + xoay 45°) -> 1 = ôm sát xe
        uOpacity: { value: 1 },
        uThick: { value: 0.016 }
      },
      vertexShader: `
        uniform float uSize;
        varying vec2 vP;
        void main() {
          vP = uv * 2.0 - 1.0;
          float sc = length(modelMatrix[0].xyz);
          vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          c.xy += vP * uSize * sc;
          gl_Position = projectionMatrix * c;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uLock, uOpacity, uThick;
        varying vec2 vP;
        ${LIB}
        void main() {
          float pw = length(fwidth(vP)) * 0.7071;
          float e = uLock;
          float s = 1.0 + (1.0 - e) * 0.35;
          vec2 q = rot(vP, (1.0 - e) * 0.7854) / s;
          vec2 a = abs(q);
          // 4 góc ngoặc vuông vát chéo ở đỉnh
          float B = 0.5, L = 0.17, c = 0.06;
          float d = min(sdSeg(a, vec2(B, B - L), vec2(B, B - c)), sdSeg(a, vec2(B, B - c), vec2(B - c, B)));
          d = min(d, sdSeg(a, vec2(B - c, B), vec2(B - L, B))) * s;
          // tam giác nhỏ chỉ xuống phía trên khung
          vec2 t = q - vec2(0.0, B + 0.05);
          float tri = max(t.y - 0.08, (abs(t.x) - t.y * 0.75) * 0.8) * s;
          float core, halo;
          ink(d, tri, uThick * (1.0 + (1.0 - e) * 0.6), pw, core, halo);
          float alpha = max(core, halo * 0.45) * uOpacity * (0.55 + 0.45 * e);
          if (alpha < 0.01) discard;
          vec3 col = mix(uColor, vec3(1.0), (1.0 - e) * 0.5);
          gl_FragColor = vec4(mix(col * 0.12, col, core), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      extensions: { derivatives: true }
    });
    mat.color = mat.uniforms.uColor.value;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 999;
    mesh.userData.t = 1;
    mesh.userData.half = 18;
    mesh.userData.forId = null;
    return mesh;
  }

  // Cập nhật khung khóa trên xe T: tâm khung giữa thân xe, cỡ ôm theo kích thước xe, hiệu ứng thu lại khi vừa khóa
  function tickLock(mesh, T, dt, camera) {
    const D = mesh.userData;
    if (D.forId !== T.id) {
      D.forId = T.id;
      D.t = 0;
      // cỡ xe (đo một lần khi đổi mục tiêu, hộp thân xe dùng chung với va chạm / cứ điểm)
      let half = 22, midY = 12;
      const B = typeof Strongholds !== 'undefined' && Strongholds.unitBox && T.group ? Strongholds.unitBox(T) : null;
      if (B) {
        half = Math.max(12, Math.min(36, ((B.maxX - B.minX) + (B.maxZ - B.minZ)) * 0.25));
        midY = (B.minY + B.maxY) * 0.5;
      }
      D.half = half; D.midY = midY;
    }
    D.t = Math.min(1, D.t + dt / 0.38);
    const e = 1 - Math.pow(1 - D.t, 3);
    const U = mesh.material.uniforms;
    U.uLock.value = e;
    const cy = (T.y || 0) + D.midY;
    mesh.position.set(T.x, cy, T.z);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
    // khung ôm xe (thêm lề 25 %), nhìn từ xa không nhỏ hơn ~40 px
    const minS = camera ? sizeFor(camera, T.x, cy, T.z, 0, 0.075) : 0;
    U.uSize.value = Math.max(D.half * 1.25 * 2, minS);
    mesh.visible = true;
  }

  return { C, stateColor, trajectory, setTrajectory, groundMarker, placeOnGround, sizeFor, tickMove, lockBrackets, tickLock, now };
})();
window.WorldMarkers = WorldMarkers;
