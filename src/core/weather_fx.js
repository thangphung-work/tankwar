/**
 * HIỆU ỨNG THỜI TIẾT QUANH CAMERA: mưa (vệt hạt mưa rơi xiên theo gió) & bão cát (hạt cát bay ngang sát mặt đất).
 * Hạt nằm cố định trong một khối lặp lại quanh camera; vị trí tính hoàn toàn trên GPU (thời gian + vị trí camera),
 * không cập nhật bộ đệm mỗi khung hình. Thời tiết lấy từ bản đồ (MapGen.weatherFor) -> mọi máy giống nhau.
 * Quy ước: 8 đơn vị game = 1 m.
 */
const WeatherFX = (() => {
  // R: nửa cạnh ngang khối hạt quanh camera, H: chiều cao khối, n: số hạt, speed: tốc độ rơi (đv/s), len: dài vệt
  const RAIN = { R: 150, H: 190, n: 6000, speed: 125, len: 9, color: 0xb8c4cc, alpha: 0.32 };
  const DUST = { R: 260, H: 70, n: 3200, speed: 0, size: 9, color: 0xc9a774, alpha: 0.4 };

  function buildRain(parent) {
    const n = RAIN.n, pos = new Float32Array(n * 6), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: {
        camPos: { value: new THREE.Vector3() }, time: { value: 0 }, wind: { value: new THREE.Vector2() },
        box: { value: new THREE.Vector2(RAIN.R, RAIN.H) }, speed: { value: RAIN.speed }, len: { value: RAIN.len },
        color: { value: new THREE.Color(RAIN.color) }, alpha: { value: RAIN.alpha }
      },
      vertexShader: `
        uniform vec3 camPos; uniform float time, speed, len; uniform vec2 wind, box;
        attribute float aEnd;
        varying float vA;
        void main() {
          // mỗi hạt rơi với tốc độ hơi khác nhau; vệt kéo dài theo hướng vận tốc (rơi + gió)
          float sp = speed * (0.85 + 0.3 * fract(position.x * 91.7 + position.z * 37.3));
          vec3 vel = vec3(wind.x, -sp, wind.y);
          vec3 b = position * vec3(2.0 * box.x, box.y, 2.0 * box.x) + vel * time;
          vec3 p;
          p.x = camPos.x + mod(b.x - camPos.x, 2.0 * box.x) - box.x;
          p.z = camPos.z + mod(b.z - camPos.z, 2.0 * box.x) - box.x;
          p.y = camPos.y + mod(b.y - camPos.y, box.y) - box.y * 0.6;
          p -= normalize(vel) * len * aEnd;
          float d = length(p - camPos);
          // mờ dần ra rìa khối (không thấy mép khối lặp) và sát camera (không vệt to chắn mắt)
          vA = (1.0 - smoothstep(box.x * 0.45, box.x, d)) * smoothstep(3.0, 14.0, d) * (0.55 + 0.45 * aEnd);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color; uniform float alpha;
        varying float vA;
        void main() { gl_FragColor = vec4(color, alpha * vA); }`
    });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.name = 'weatherRain';
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    parent.add(mesh);
    return mesh;
  }

  function buildDust(parent) {
    const n = DUST.n, pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: {
        camPos: { value: new THREE.Vector3() }, time: { value: 0 }, wind: { value: new THREE.Vector2() },
        box: { value: new THREE.Vector2(DUST.R, DUST.H) }, size: { value: DUST.size }, scale: { value: 600 },
        color: { value: new THREE.Color(DUST.color) }, alpha: { value: DUST.alpha }
      },
      vertexShader: `
        uniform vec3 camPos; uniform float time, size, scale; uniform vec2 wind, box;
        varying float vA;
        void main() {
          // cát bay ngang theo gió (nhanh, không đều), cuộn lên xuống nhẹ
          float r = fract(position.x * 53.1 + position.y * 17.7);
          vec2 v = wind * (0.7 + 0.6 * r);
          vec3 b = position * vec3(2.0 * box.x, box.y, 2.0 * box.x);
          b.xz += v * time;
          b.y += sin(time * (0.8 + r) + r * 40.0) * 6.0;
          vec3 p;
          p.x = camPos.x + mod(b.x - camPos.x, 2.0 * box.x) - box.x;
          p.z = camPos.z + mod(b.z - camPos.z, 2.0 * box.x) - box.x;
          p.y = camPos.y + mod(b.y - camPos.y, box.y) - box.y * 0.5;
          float d = length(p - camPos);
          vA = (1.0 - smoothstep(box.x * 0.4, box.x, d)) * smoothstep(2.0, 10.0, d) * (0.5 + 0.5 * r);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = size * (0.6 + 0.8 * r) * scale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 color; uniform float alpha;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float s = 1.0 - smoothstep(0.15, 0.5, length(c));
          gl_FragColor = vec4(color, alpha * vA * s);
        }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'weatherDust';
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    parent.add(pts);
    return pts;
  }

  /**
   * weather: { kind, rain?, dust? } (MapGen.weatherFor). Trả về null khi trời không có hạt (quang / âm u / sương).
   */
  function build(parent, weather) {
    if (!weather || (!weather.rain && !weather.dust) || typeof THREE === 'undefined') return null;
    const meshes = [];
    if (weather.rain) meshes.push(buildRain(parent));
    if (weather.dust) meshes.push(buildDust(parent));
    let t = 0;
    return {
      kind: weather.kind, meshes,
      // wind: { vx, vz } của BallisticsSystem3D (đv/s đạn trôi) — dùng làm hướng gió cho hạt
      update(dt, camera, wind, viewH) {
        t += dt;
        const wx = wind ? wind.vx || 0 : 0, wz = wind ? wind.vz || 0 : 0, wl = Math.hypot(wx, wz) || 1;
        for (const m of meshes) {
          const U = m.material.uniforms;
          U.time.value = t;
          U.camPos.value.copy(camera.position);
          if (m.isPoints) {
            // bão cát: gió mạnh (~12-20 m/s) theo hướng gió hiện tại
            U.wind.value.set(wx / wl * 130, wz / wl * 130);
            U.scale.value = (viewH || 800) / (2 * Math.tan((camera.fov || 60) * Math.PI / 360));
          } else U.wind.value.set(wx * 1.4, wz * 1.4);
        }
      },
      setVisible(v) { for (const m of meshes) m.visible = v; },
      dispose() {
        for (const m of meshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
        meshes.length = 0;
      }
    };
  }

  /**
   * CỘT KHÓI XA (MapGen scars.plumes): làng / kho cháy ngoài chiến trường, sau vành núi. Mỗi cột là một tấm dựng đứng
   * luôn quay mặt về camera (quay quanh trục đứng), khói cuộn lên bằng nhiễu trong shader, phình rộng & ngả theo gió ở
   * trên cao. Sương mù tính riêng (nhẹ hơn cảnh) -> cột khói đen vẫn nổi trên nền trời xa như thật.
   */
  function plumes(parent, list, atm) {
    if (!list || !list.length || typeof THREE === 'undefined') return null;
    const n = list.length, S = 12;   // mỗi cột: dải S đoạn theo chiều cao
    const pos = [], uv = [], ctr = [], dim = [], idx = [];
    list.forEach((p, k) => {
      const o = k * (S + 1) * 2;
      for (let j = 0; j <= S; j++) {
        for (const side of [-1, 1]) {
          pos.push(side, j / S, 0);
          uv.push(side * 0.5 + 0.5, j / S);
          ctr.push(p.x, -60, p.z);
          dim.push(p.w, p.h, p.dark, k * 7.31);
        }
        if (j < S) { const a = o + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aCtr', new THREE.Float32BufferAttribute(ctr, 3));
    geo.setAttribute('aDim', new THREE.Float32BufferAttribute(dim, 4));
    geo.setIndex(idx);
    const fogC = new THREE.Color(atm && atm.fog !== undefined ? atm.fog : 0xc0c4c8);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 }, wind: { value: new THREE.Vector2(1, 0) },
        fogC: { value: fogC }, fogD: { value: (atm && atm.density ? atm.density : 0.00026) * 0.45 },
        sunC: { value: new THREE.Color(atm && atm.sunColor !== undefined ? atm.sunColor : 0xffffff) }
      },
      vertexShader: `
        attribute vec3 aCtr; attribute vec4 aDim;
        uniform vec2 wind; uniform float time;
        varying vec2 vUv; varying float vDark, vSeed, vDist;
        void main() {
          vUv = uv; vDark = aDim.z; vSeed = aDim.w;
          float h = position.y;
          // phình rộng dần lên trên, đỉnh ngả theo gió (cong dần), lắc lư rất chậm
          float w = aDim.x * (0.35 + 2.6 * pow(h, 1.3));
          vec2 lean = wind * aDim.y * 0.55 * h * h + vec2(sin(time * 0.05 + vSeed), cos(time * 0.04 + vSeed)) * 40.0 * h;
          vec3 c = aCtr + vec3(lean.x, aDim.y * h, lean.y);
          vec3 toCam = cameraPosition - c; toCam.y = 0.0;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
          vec3 p = c + right * position.x * w;
          vDist = length(cameraPosition - p);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float time, fogD; uniform vec3 fogC, sunC;
        varying vec2 vUv; varying float vDark, vSeed, vDist;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          // khói cuộn lên: nhiễu trượt theo chiều cao, cuộn to dần lên trên
          vec2 q = vec2(vUv.x * 2.2, vUv.y * 5.0 - time * 0.06) + vSeed;
          float n = noise(q) * 0.5 + noise(q * 2.1 + 3.7) * 0.3 + noise(q * 4.3 - 1.3) * 0.2;
          float edge = 1.0 - smoothstep(0.18 + 0.25 * n, 0.5, abs(vUv.x - 0.5));
          float a = edge * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.25, 0.65, n + 0.25);
          // gốc đen đặc (dầu / cao su cháy), lên cao loãng & xám dần; mép sáng nhẹ theo nắng
          vec3 col = mix(vec3(0.05, 0.045, 0.04), vec3(0.32, 0.31, 0.3), smoothstep(0.1, 0.9, vUv.y) * (1.0 - vDark * 0.5));
          col += sunC * 0.08 * (1.0 - edge);
          float f = 1.0 - exp(-pow(fogD * vDist, 2.0));
          col = mix(col, fogC, f);
          gl_FragColor = vec4(col, a * 0.85 * (1.0 - f * 0.85));
        }`
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'warPlumes';
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    parent.add(mesh);
    let t = 0;
    return {
      mesh,
      update(dt, wind) {
        t += dt;
        mat.uniforms.time.value = t;
        if (wind && (wind.vx || wind.vz)) { const L = Math.hypot(wind.vx, wind.vz); mat.uniforms.wind.value.set(wind.vx / L, wind.vz / L); }
      }
    };
  }

  return { build, plumes };
})();
if (typeof window !== 'undefined') window.WeatherFX = WeatherFX;
