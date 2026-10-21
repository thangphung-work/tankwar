/**
 * LỚP PHỦ MẶT ĐẤT 3D QUANH CAMERA: khóm cỏ dày (lay theo gió) + đá vụn / sỏi
 * - Chỉ dựng trong vùng camera nhìn thấy, rải lại theo ô lưới khi camera di chuyển (vị trí cố định theo ô -> không nhảy)
 * - Mọc đúng chỗ shader mặt đất vẽ cỏ (dùng chung mặt nạ nhiễu), không mọc trên đường, nước, đá dốc, cứ điểm, nhà
 * - Đá vụn dày hơn ở chỗ đất trống, sườn dốc, bãi sỏi -> mặt đất lồi lõm không phẳng lì
 * - Chỉ để trang trí: không va chạm, không chặn đạn, không đổ bóng (nhẹ máy)
 */
const GroundCover = (() => {
  const CELL = 40;              // ô rải
  const RADIUS = 720;           // bán kính quanh tâm khung nhìn
  const TUFTS_PER_CELL = 16;
  const PEBBLES_PER_CELL = 7;
  const OG = 7;                 // hệ số rải dày trong ô thuộc căn cứ bỏ hoang (cỏ dại um tùm)

  const BIOME = {
    HIGHLAND: { grass: [[0.36, 0.41, 0.23], [0.53, 0.5, 0.33]], density: 1.0, pebble: [0.44, 0.42, 0.39], pebbleK: 1.0, tuftH: [5, 9] },
    RIVER_LAKE: { grass: [[0.33, 0.42, 0.21], [0.51, 0.5, 0.31]], density: 1.1, pebble: [0.43, 0.4, 0.36], pebbleK: 0.8, tuftH: [5, 10] },
    JUNGLE: { grass: [[0.25, 0.33, 0.17], [0.38, 0.38, 0.22]], density: 1.2, pebble: [0.36, 0.33, 0.28], pebbleK: 0.6, tuftH: [6, 11] },
    DESERT: { grass: [[0.74, 0.66, 0.42], [0.82, 0.72, 0.5]], density: 0.04, pebble: [0.68, 0.57, 0.44], pebbleK: 0.35, tuftH: [3, 6] },
    URBAN: { grass: [[0.35, 0.39, 0.23], [0.49, 0.47, 0.31]], density: 0.35, pebble: [0.43, 0.42, 0.4], pebbleK: 1.1, tuftH: [3, 6] }
  };

  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Texture lá cỏ: nhiều ngọn từ gốc tỏa lên, nền trong suốt (alpha test)
  let bladeTex = null;
  // Ảnh lá cỏ: atlas 2x2 = 4 kiểu khóm khác nhau (số lá, độ cao, độ xòe, độ khô) — mỗi khóm chọn ngẫu nhiên 1 kiểu
  function blades() {
    if (bladeTex) return bladeTex;
    // atlas 2x2, mỗi ô 256 px (~1 m tấm lá): 4 kiểu khóm — cỏ đồng dày, cỏ cao trổ bông, búi cỏ thấp, cỏ khô úa.
    // Lá mảnh thon nhọn, cong võng (Bezier bậc 3), một số gãy gập; gốc sẫm -> ngọn sáng; lẫn lá chết nâu
    const C = 256, c = document.createElement('canvas'); c.width = c.height = C * 2;
    const g = c.getContext('2d');
    const kinds = [{ n: 150, hMin: 0.4, hMax: 0.95, spread: 60, seed: 77 }, { n: 95, hMin: 0.55, hMax: 1.0, spread: 34, seed: 91, heads: 16 },
      { n: 190, hMin: 0.22, hMax: 0.6, spread: 90, seed: 113 }, { n: 120, hMin: 0.35, hMax: 0.9, spread: 80, seed: 137, dry: true, heads: 6 }];
    kinds.forEach((K, idx) => {
      const ox = (idx % 2) * C, oy = (idx >> 1) * C, rnd = rngOf(K.seed);
      g.save(); g.beginPath(); g.rect(ox, oy, C, C); g.clip();
      const blade = (front) => {
        const x0 = ox + C * (0.2 + rnd() * 0.6), lean = (rnd() - 0.5) * K.spread * (front ? 1.2 : 0.8), h = C * (K.hMin + rnd() * (K.hMax - K.hMin)) - 2, w = 1.1 + rnd() * 2.2;
        const k = (front ? 0.82 : 0.62) + rnd() * 0.38, dead = rnd() < 0.08, dry = K.dry ? 0.35 + rnd() * 0.6 : dead ? 0.9 : rnd() * 0.22;
        const base = dead ? [120, 104, 80] : [118 + 70 * dry, 138 + 26 * dry, 96 - 8 * dry], tip = dead ? [168, 150, 112] : [176 + 50 * dry, 200 - 4 * dry, 140 - 50 * dry];
        const bend = rnd() < 0.18;                  // lá gãy gập: ngọn quặt xuống
        const tx = x0 + lean * (bend ? 1.7 : 1), ty = oy + C - h * (bend ? 0.72 : 1);
        const c1x = x0 + lean * 0.1, c1y = oy + C - h * 0.45, c2x = x0 + lean * (bend ? 1.2 : 0.6), c2y = oy + C - h * (bend ? 1.02 : 0.85);
        const gr = g.createLinearGradient(0, oy + C, 0, oy + C - h);
        gr.addColorStop(0, `rgb(${base[0] * k * 0.7 | 0},${base[1] * k * 0.7 | 0},${base[2] * k * 0.7 | 0})`);
        gr.addColorStop(1, `rgb(${Math.min(255, tip[0] * k) | 0},${Math.min(255, tip[1] * k) | 0},${Math.max(0, tip[2] * k) | 0})`);
        g.fillStyle = gr; g.beginPath();
        g.moveTo(x0 - w, oy + C);
        g.bezierCurveTo(c1x - w * 0.8, c1y, c2x - w * 0.35, c2y, tx, ty);
        g.bezierCurveTo(c2x + w * 0.35, c2y, c1x + w * 0.8, c1y, x0 + w, oy + C);
        g.closePath(); g.fill();
      };
      for (let i = 0; i < K.n * 0.45; i++) blade(false);   // lớp lá sau (tối)
      for (let i = 0; i < K.n * 0.55; i++) blade(true);
      // bông hạt: thân mảnh + bông hạt thuôn (cỏ trổ bông lâu ngày không cắt)
      for (let i = 0; i < (K.heads || 0); i++) {
        const x0 = ox + C * (0.25 + rnd() * 0.5), lean = (rnd() - 0.5) * 50, h = C * (0.75 + rnd() * 0.24);
        const tx = x0 + lean, ty = oy + C - h;
        g.strokeStyle = K.dry ? 'rgb(170,150,104)' : 'rgb(150,150,96)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, oy + C); g.quadraticCurveTo(x0 + lean * 0.3, oy + C - h * 0.6, tx, ty); g.stroke();
        for (let j = 0; j < 14; j++) { const t = j / 14; g.fillStyle = `rgba(${190 + rnd() * 30 | 0},${172 + rnd() * 20 | 0},${118 + rnd() * 20 | 0},0.95)`; g.beginPath(); g.ellipse(tx - lean * 0.05 * t + (rnd() - 0.5) * 3, ty + t * 22, 1.6, 3, lean * 0.01, 0, 6.283); g.fill(); }
      }
      g.restore();
    });
    bladeTex = new THREE.CanvasTexture(c);
    bladeTex.anisotropy = 4;
    return bladeTex;
  }

  // Khóm cỏ: 9 tấm lá toả tròn, mỗi tấm cong 2 đoạn (gốc gần đứng, ngọn ngả ra ngoài như bụi cỏ thật), rộng hẹp /
  // cao thấp khác nhau; pháp tuyến hướng lên như mặt đất
  function tuftGeometry() {
    const P = [], UV = [], NR = [], I = [];
    const n = 9, rnd = rngOf(4242);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + (rnd() - 0.5) * 0.7, ca = Math.cos(a), sa = Math.sin(a);
      const tilt = 0.3 + rnd() * 0.55, w = 0.28 + rnd() * 0.26, hy = 0.6 + rnd() * 0.4;
      const px = -sa * w, pz = ca * w;
      const pt = (t, lift) => { const lean = tilt * t * t, y = hy * (t * 0.98 + lift); return [ca * (0.06 + lean), y, sa * (0.06 + lean)]; };
      const o = P.length / 3;
      for (const [t, v] of [[0, 0], [0.55, 0.55], [1, 1]]) {
        const [x, y, z] = pt(t, 0), ww = 1 - t * 0.12;
        P.push(x - px * ww, y, z - pz * ww, x + px * ww, y, z + pz * ww); UV.push(0, v, 1, v);
        NR.push(0, 1, 0, 0, 1, 0);
      }
      I.push(o, o + 1, o + 3, o, o + 3, o + 2, o + 2, o + 3, o + 5, o + 2, o + 5, o + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
    g.setIndex(I);
    return g;
  }

  class Cover {
    constructor(terrain) {
      this.T = terrain;
      this.B = BIOME[terrain.mapType] || BIOME.HIGHLAND;
      this.group = new THREE.Group();
      this.group.name = 'groundCover';
      terrain.group.add(this.group);   // dọn theo địa hình khi đổi bản đồ
      const maxCells = Math.ceil((2 * RADIUS / CELL) + 2) ** 2;
      this.maxT = Math.round(maxCells * TUFTS_PER_CELL * Math.max(0.3, this.B.density) * 1.5) + 90000;   // + cỏ dại dày trong căn cứ
      this.maxP = maxCells * PEBBLES_PER_CELL;
      // cỏ
      const gm = new THREE.MeshStandardMaterial({ map: blades(), alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });   // lá mảnh: ngưỡng thấp để xa không bị mỏng mất
      gm.onBeforeCompile = (sh) => {
        sh.uniforms.gTime = GroundShader && GroundShader.time ? GroundShader.time : { value: 0 };
        sh.vertexShader = 'uniform float gTime;\nvarying float vBY;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          vBY = uv.y;
          {
            float hv = fract(sin(dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(12.9898, 78.233))) * 43758.5453);
            vUv = vUv * 0.5 + vec2(step(0.5, fract(hv * 2.0)), step(0.5, hv)) * 0.5;
          }`).replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            // lay theo gió: ngọn đung đưa, gốc đứng yên; mỗi khóm lệch pha theo vị trí
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            float sw = sin(gTime * 1.9 + ip.x * 0.045 + ip.z * 0.031) * 0.16 + sin(gTime * 3.7 + ip.x * 0.11) * 0.05;
            transformed.x += sw * uv.y;
            transformed.z += sw * 0.6 * uv.y;
          }`);
        // ánh sáng: lá cỏ 2 mặt -> mặt sau bị lật pháp tuyến xuống dưới thành lá tối sẫm xen lá sáng chói. Cho mọi lá nhận
        // sáng như mặt đất (pháp tuyến hướng lên), gốc khóm tối dần (lá che nhau), ngọn sáng
        sh.fragmentShader = 'varying float vBY;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            diffuseColor.rgb *= mix(0.38, 1.04, smoothstep(0.0, 0.9, vBY));`)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
            normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
      };
      gm.customProgramCacheKey = () => 'grassTuft4';
      this.grass = new THREE.InstancedMesh(tuftGeometry(), gm, this.maxT);
      this.grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxT * 3), 3);
      this.grass.count = 0; this.grass.frustumCulled = false; this.grass.receiveShadow = true; this.grass.castShadow = false;
      this.group.add(this.grass);
      // đá vụn
      const pg = new THREE.IcosahedronGeometry(1, 0);
      const pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setY(i, y > 0 ? y * 0.55 : y * 0.25); }
      pg.computeVertexNormals();
      this.peb = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02, flatShading: true }), this.maxP);
      this.peb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxP * 3), 3);
      this.peb.count = 0; this.peb.frustumCulled = false; this.peb.receiveShadow = true;
      this.group.add(this.peb);
      this.lastCx = null; this.lastCz = null;
      this.noise = GroundShader && GroundShader.noiseSampler ? GroundShader.noiseSampler() : null;
    }

    // Mặt nạ trộn lớp giống hệt shader mặt đất: trả về mật độ cỏ & đá vụn tại (x, z)
    masks(x, z) {
      const T = this.T, e = 6;
      const h = T.groundAtRaw(x, z);
      const gx = (T.groundAtRaw(x + e, z) - T.groundAtRaw(x - e, z)) / (2 * e), gz = (T.groundAtRaw(x, z + e) - T.groundAtRaw(x, z - e)) / (2 * e);
      // độ dốc lấy từ bản đồ pháp tuyến mượt (khớp shader mặt đất)
      const slope = T._gBake ? T._gBake.slopeAt(x, z) : 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
      let wDirt = 0, wFine = 0, wRock = smooth(0.2, 0.42, slope);
      if (this.noise) {
        // cùng phép xoay toạ độ như shader mặt đất (wr1, wr2)
        const x1 = 0.866 * x + 0.5 * z, z1 = -0.5 * x + 0.866 * z, x2 = 0.423 * x + 0.906 * z, z2 = -0.906 * x + 0.423 * z;
        const nz = this.noise(x1 / 1100, z1 / 1100), nz2 = this.noise(x2 / 260 + 0.5, z2 / 260 + 0.5);
        wDirt = smooth(0.5, 0.82, nz[0] * 0.55 + nz2[1] * 0.45 + (nz2[2] - 0.5) * 0.2) * 0.85;
        wFine = smooth(0.6, 0.78, nz[1] + (nz2[2] - 0.5) * 0.3) * 0.6;
        wRock = smooth(0.2, 0.42, slope + (nz2[0] - 0.5) * 0.14);
      }
      wDirt = Math.max(wDirt, smooth(0.1, 0.3, slope) * 0.75);
      return { h, grass: (1 - wDirt) * (1 - wFine) * (1 - wRock), rough: 0.18 + wDirt * 0.55 + wFine * 0.6 + wRock * 0.9 };
    }

    // Lưới đánh dấu chỗ có nhà (dựng 1 lần) -> kiểm tra chặn O(1)
    buildMask() {
      const T = this.T, G = 24, n = Math.ceil(T.width / G), m = new Uint8Array(n * n), half = T.width / 2;
      for (const b of T.buildings) {
        const r = b.radius + 6;
        for (let j = Math.floor((b.z - r + half) / G); j <= Math.floor((b.z + r + half) / G); j++)
          for (let i = Math.floor((b.x - r + half) / G); i <= Math.floor((b.x + r + half) / G); i++)
            if (i >= 0 && j >= 0 && i < n && j < n) m[j * n + i] = 1;
      }
      // ruộng: không mọc cỏ dại / đá vụn trên mặt ruộng
      const fields = (T.map.props && T.map.props.fields) || [];
      for (const f of fields) {
        const ca = Math.cos(f.angle), sa = Math.sin(f.angle), r = Math.hypot(f.w, f.d) / 2;
        for (let j = Math.floor((f.z - r + half) / G); j <= Math.floor((f.z + r + half) / G); j++)
          for (let i = Math.floor((f.x - r + half) / G); i <= Math.floor((f.x + r + half) / G); i++) {
            if (i < 0 || j < 0 || i >= n || j >= n) continue;
            const dx = -half + (i + 0.5) * G - f.x, dz = -half + (j + 0.5) * G - f.z;
            if (Math.abs(dx * ca + dz * sa) < f.w / 2 - 4 && Math.abs(-dx * sa + dz * ca) < f.d / 2 - 4) m[j * n + i] = 1;
          }
      }
      this.mask = { m, n, G, half };
    }

    blocked(x, z) {
      const T = this.T;
      if (!this.mask) this.buildMask();
      const M = this.mask, i = Math.floor((x + M.half) / M.G), j = Math.floor((z + M.half) / M.G);
      if (i >= 0 && j >= 0 && i < M.n && j < M.n && M.m[j * M.n + i]) return true;
      if (T.groundAtRaw(x, z) < 0.6 && (T.map.river || T.map.lakes.length)) return true;
      if (T.map.roadAt && T.map.roadAt(x, z)) return true;
      if (T.strongholdSet && T.strongholdSet.covers(x, z, 4)) return true;
      if (T.landmarkSet && T.landmarkSet.covers(x, z, 4) && !(T.landmarkSet.overgrowth && T.landmarkSet.overgrowth(x, z))) return true;
      if (T.bridges.length && T.bridgeAt(x, z)) return true;
      return false;
    }

    // Dữ liệu 1 ô (tính 1 lần, lưu lại): ma trận + màu của khóm cỏ & đá vụn
    cellData(i, j) {
      const key = i + ',' + j;
      let c = this.cache.get(key);
      if (c) return c;
      const B = this.B, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const gm = [], gc = [], pm = [], pc = [];
      const ox = i * CELL, oz = j * CELL, half = this.T.width / 2 - 70;
      if (Math.abs(ox) <= half && Math.abs(oz) <= half) {
        const rnd = rngOf((i * 73856093) ^ (j * 19349663) ^ 0x5bd1e995);
        const nTry = Math.round(TUFTS_PER_CELL * B.density);
        // Cỏ mọc theo CỤM và MẢNG như ngoài đồng (không rắc đều từng khóm giống nhau -> hết cảm giác hoa văn lặp):
        // - mảng lớn (~150 m) dày / thưa / trống theo nhiễu; mỗi cụm 1-6 khóm sát nhau
        // - cả cụm chung cỡ & sắc độ (khô / xanh), từng khóm lệch nhẹ
        // ô nằm trong căn cứ bỏ hoang: cỏ dại um tùm -> rải dày gấp 2.6, từng khóm lọc theo mức mọc tại chỗ
        const LS = this.T.landmarkSet, inBase = !!(LS && LS.overgrowth && LS.covers(ox + CELL / 2, oz + CELL / 2, CELL));
        const nClu = Math.max(1, Math.round(nTry / 2.6 * (inBase ? OG : 1)));
        for (let k = 0; k < nClu; k++) {
          const cx = ox + rnd() * CELL, cz = oz + rnd() * CELL, ra = rnd(), rb = rnd(), rc = rnd(), rd = rnd();
          const pn = this.noise ? this.noise(cx / 170 + 0.37, cz / 170 + 0.11) : [0.5, 0.5, 0.5];
          const dens = smooth(0.3, 0.66, pn[2]) * 1.35 + 0.08;
          const n = 1 + Math.floor(ra * rb * 6), cr = 2.5 + rc * 7;
          const size = 0.65 + rd * rd * 1.0;
          const cDry = Math.max(0, Math.min(1, pn[0] * 0.9 - 0.15 + (rnd() - 0.5) * 0.5));
          for (let t = 0; t < n; t++) {
            const a = rnd() * 6.283, d = Math.sqrt(rnd()) * cr;
            const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, r1 = rnd(), r2 = rnd(), r3 = rnd();
            const M = this.masks(x, z);
            // trong căn cứ: mật độ / chiều cao theo mức cỏ dại tại chỗ (bãi cỏ cũ um tùm, sỏi & mặt đường thưa thấp)
            const inside = inBase && !!LS.noFireAt(x, z, 0), og = inside ? LS.overgrowth(x, z) : null, mg = og ? 0.85 : M.grass;
            if (inside ? (!og || r1 > og.k / 2.6) : (r1 > mg * 1.15 * dens / (inBase ? OG : 1) || this.blocked(x, z))) continue;
            const hgt = (B.tuftH[0] + r2 * (B.tuftH[1] - B.tuftH[0])) * size * (t === 0 ? 1.1 : 0.8 + r3 * 0.3) * (og ? og.h : 1), wid = hgt * (0.7 + r3 * 0.5) * (og ? 1.25 : 1);
            const r4 = rnd(), r5 = rnd();
            e.set((r4 - 0.5) * 0.5, r3 * 6.283, (r5 - 0.5) * 0.5);
            m4.compose(v.set(x, M.h - 0.3, z), q.setFromEuler(e), sc.set(wid * (0.65 + r4 * 0.7), hgt, wid * (0.65 + r5 * 0.7)));
            gm.push(...m4.elements);
            const dry = Math.max(0, Math.min(1, cDry + (r2 - 0.5) * 0.25 + (1 - mg) * 0.4)), kk = 1.0 + r1 * 0.22;
            for (let ch = 0; ch < 3; ch++) gc.push((B.grass[0][ch] + (B.grass[1][ch] - B.grass[0][ch]) * dry) * kk);
          }
        }
        for (let k = 0; k < PEBBLES_PER_CELL; k++) {
          const x = ox + rnd() * CELL, z = oz + rnd() * CELL, r1 = rnd(), r2 = rnd(), r3 = rnd();
          const M = this.masks(x, z);
          const clump = this.noise ? this.noise(x / 90 + 0.21, z / 90 + 0.63)[1] : 0.5;
          if (r1 > Math.min(1, M.rough * B.pebbleK * Math.max(0, clump - 0.35) * 2.6) || this.blocked(x, z)) continue;
          const s = 0.7 + r2 * r2 * 2.8;
          e.set((r3 - 0.5) * 0.6, r2 * 6.283, (r1 - 0.5) * 0.6);
          m4.compose(v.set(x, M.h - s * 0.12, z), q.setFromEuler(e), sc.set(s * (0.8 + r3 * 0.5), s, s));
          pm.push(...m4.elements);
          const kk = 0.72 + r3 * 0.45;
          for (let ch = 0; ch < 3; ch++) pc.push(B.pebble[ch] * kk);
        }
      }
      c = { gm: new Float32Array(gm), gc: new Float32Array(gc), pm: new Float32Array(pm), pc: new Float32Array(pc), dense: gm.length / 16 > TUFTS_PER_CELL * 4 };
      this.cache.set(key, c);
      return c;
    }

    rebuild(cx, cz) {
      if (!this.cache) this.cache = new Map();
      const gA = this.grass.instanceMatrix.array, gC = this.grass.instanceColor.array;
      const pA = this.peb.instanceMatrix.array, pC = this.peb.instanceColor.array;
      let nt = 0, np = 0;
      const c0x = Math.floor((cx - RADIUS) / CELL), c1x = Math.floor((cx + RADIUS) / CELL);
      const c0z = Math.floor((cz - RADIUS) / CELL), c1z = Math.floor((cz + RADIUS) / CELL);
      for (let j = c0z; j <= c1z; j++) for (let i = c0x; i <= c1x; i++) {
        const c = this.cellData(i, j);
        // ô cỏ dày (căn cứ bỏ hoang): đủ dày trong ~300 quanh tâm nhìn, xa hơn chỉ lấy 1/3 (các khóm rải ngẫu nhiên -> lấy phần đầu)
        const far = c.dense && Math.hypot(i * CELL + CELL / 2 - cx, j * CELL + CELL / 2 - cz) > 300;
        const ng = far ? Math.floor(c.gm.length / 16 / 3) : c.gm.length / 16, npb = c.pm.length / 16;
        if (ng && nt + ng <= this.maxT) { gA.set(c.gm.subarray(0, ng * 16), nt * 16); gC.set(c.gc.subarray(0, ng * 3), nt * 3); nt += ng; }
        if (npb && np + npb <= this.maxP) { pA.set(c.pm, np * 16); pC.set(c.pc, np * 3); np += npb; }
      }
      // dọn ô quá xa khỏi bộ nhớ đệm
      if (this.cache.size > 6000) {
        for (const k of this.cache.keys()) {
          const [i, j] = k.split(',').map(Number);
          if (Math.abs(i * CELL - cx) > RADIUS * 3 || Math.abs(j * CELL - cz) > RADIUS * 3) this.cache.delete(k);
        }
      }
      this.grass.count = nt; this.peb.count = np;
      this.grass.instanceMatrix.needsUpdate = true; this.grass.instanceColor.needsUpdate = true;
      this.peb.instanceMatrix.needsUpdate = true; this.peb.instanceColor.needsUpdate = true;
    }

    // focus: tâm vùng camera nhìn thấy trên mặt đất
    update(focusX, focusZ) {
      const cx = Math.round(focusX / CELL), cz = Math.round(focusZ / CELL);
      if (cx === this.lastCx && cz === this.lastCz) return;
      this.lastCx = cx; this.lastCz = cz;
      this.rebuild(cx * CELL, cz * CELL);
    }
  }

  return { Cover, CELL, RADIUS };
})();

if (typeof window !== 'undefined') window.GroundCover = GroundCover;
