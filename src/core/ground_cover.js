/**
 * LỚP PHỦ MẶT ĐẤT 3D QUANH CAMERA: khóm cỏ dày (lay theo gió) + đá vụn / sỏi
 * - Chỉ dựng trong vùng camera nhìn thấy, rải lại theo ô lưới khi camera di chuyển (vị trí cố định theo ô -> không nhảy)
 * - Mọc đúng chỗ shader mặt đất vẽ cỏ (dùng chung mặt nạ nhiễu), không mọc trên đường, nước, đá dốc, cứ điểm, nhà
 * - Đá vụn dày hơn ở chỗ đất trống, sườn dốc, bãi sỏi -> mặt đất lồi lõm không phẳng lì
 * - Chỉ để trang trí: không va chạm, không chặn đạn, không đổ bóng (nhẹ máy)
 */
const GroundCover = (() => {
  const CELL = 40;              // ô rải
  const RADIUS = 840;           // bán kính rải cỏ hình tròn quanh tâm nhìn (840 đơn vị ~ 105m, phủ rộng và mượt mà)
  const FADE_DIST = 180;        // dải chuyển tiếp mờ dần ở viền ngoài (~22m) để cỏ lùn sát đất và hòa vào nền
  const TUFTS_PER_CELL = 16;
  const PEBBLES_PER_CELL = 7;
  const OG = 7;                 // hệ số rải dày trong ô thuộc căn cứ bỏ hoang (cỏ dại um tùm)
  const CARPET_R = 340, CARPET_FADE = 200, CARPET_STEP = 5;   // thảm cỏ ngắn: bán kính quanh tâm thảm, dải mờ viền, lưới rải
  // bản đồ bóng khóm cỏ cho shader mặt đất: 640² điểm phủ 1280 đơn vị (2 đv/điểm — khóm chỉ rộng 5-9 đv; 4 đv/điểm thì bóng
  // nhoè thành vầng mờ, đất sát gốc không sẫm -> khóm như đặt lên mặt đất)
  const COV_N = 640, COV_SIZE = 1280;

  const BIOME = {
    HIGHLAND: { grass: [[0.36, 0.41, 0.23], [0.53, 0.5, 0.33]], density: 1.0, pebble: [0.44, 0.42, 0.39], pebbleK: 1.0, tuftH: [5, 9], carpet: [1.6, 2.8] },
    RIVER_LAKE: { grass: [[0.33, 0.42, 0.21], [0.51, 0.5, 0.31]], density: 1.1, pebble: [0.43, 0.4, 0.36], pebbleK: 0.8, tuftH: [5, 10], carpet: [1.6, 3.0] },
    JUNGLE: { grass: [[0.25, 0.33, 0.17], [0.38, 0.38, 0.22]], density: 1.2, pebble: [0.36, 0.33, 0.28], pebbleK: 0.6, tuftH: [6, 11], carpet: [2.0, 3.4] },
    DESERT: { grass: [[0.74, 0.66, 0.42], [0.82, 0.72, 0.5]], density: 0.04, pebble: [0.68, 0.57, 0.44], pebbleK: 0.35, tuftH: [3, 6] },
    // thành phố ma: cỏ dại cao um tùm trên đất trống (xanh lẫn úa)
    URBAN: { grass: [[0.3, 0.38, 0.18], [0.52, 0.48, 0.28]], density: 0.85, pebble: [0.43, 0.42, 0.4], pebbleK: 1.1, tuftH: [4, 11], carpet: [1.4, 2.6], city: true }
  };

  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // màu khóm cỏ quanh hố nổ: dirt = đất văng phủ (lấm đất nâu), sear = sém lửa sát gờ (sẫm, hơi úa — không cháy đen kịt)
  const BLAST_DIRT = [0.27, 0.21, 0.15];
  const blastTint = (g, ch, dirt, sear) => {
    if (dirt > 0) g += (BLAST_DIRT[ch] - g) * Math.min(0.75, dirt * 0.9);
    if (sear > 0) g *= 1 - 0.3 * sear + (ch === 0 ? 0.08 * sear : 0);
    return g;
  };
  const _tm = new THREE.Matrix4(), _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _ts = new THREE.Vector3(), _ta = new THREE.Vector3(), _tq2 = new THREE.Quaternion();
  const hash2 = (x, z) => { let h = (Math.round(x * 7) ^ Math.round(z * 13)) | 0; h = Math.imul(h ^ (h >>> 15), 1 | h); return ((h ^ (h >>> 14)) >>> 0) / 4294967296; };

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
  // Sóng xung kích quét qua thảm cỏ (ExplosionFX.spawnShock -> shock): 4 vụ nổ gần nhất (x, z, lúc nổ theo đồng hồ
  // GroundShader, bán kính phần nhìn thấy R) + độ cao tâm nổ trên mặt đất. Shader tính mặt sóng y như ShockLayer
  // (tốc độ trung bình 700 đv/s, chậm dần về 0,6 lần rồi lan đều) -> cỏ rạp đúng lúc vỏ sóng trên màn hình quét qua
  // Đánh dấu dải instance [s, s + n) cần gửi lên GPU, GỘP với dải đang chờ. three r128 chỉ có MỘT updateRange mỗi thuộc
  // tính: lệnh sau ghi đè lệnh trước -> cùng một khung vừa rải lại cả lớp cỏ (camera dịch) vừa có xe đè cỏ (trample) thì
  // chỉ dải xe đè được gửi, phần cỏ mới rải không bao giờ lên GPU: GPU vẽ cỏ của tâm nhìn cũ -> quanh camera trơ đất,
  // cỏ chỉ còn vài dải vòng cung. three đặt count = -1 sau khi gửi xong -> count != -1 nghĩa là còn dải chờ chưa gửi.
  function markUpload(a, s, n) {
    const U = a.updateRange, sz = a.itemSize;
    let lo = s * sz, hi = (s + n) * sz;
    if (U.count !== -1) { lo = Math.min(lo, U.offset); hi = Math.max(hi, U.offset + U.count); }
    U.offset = lo; U.count = hi - lo; a.needsUpdate = true;
  }
  const SHOCKS = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
  const SHOCK_H = [0, 0, 0, 0];
  let shockI = 0;
  function shock(x, z, R, h = 0) {
    const t = GroundShader && GroundShader.time ? GroundShader.time.value : 0;
    const i = shockI++ % 4;
    SHOCKS[i].set(x, z, t, R);
    SHOCK_H[i] = h;
  }
  // sóng xung kích quét qua: khóm cỏ rạp ra xa tâm nổ đúng lúc mặt sóng tới, bật ngược về phía tâm (pha áp suất
  // âm) rồi lắc tắt dần; gần tâm rạp sát đất, xa dần còn rung nhẹ (ip = gốc khóm, dùng chung cho khóm cỏ & thảm cỏ)
  const SHOCK_GLSL = `for (int i = 0; i < 4; i++) {
              vec4 b = uShock[i];
              float age = gTime - b.z;
              if (b.w <= 0.0 || age < 0.0 || age > 3.0) continue;
              vec2 dv = ip.xz - b.xy;
              float r = length(dv), d = length(vec2(r, uShockH[i]));
              float R = b.w, dur = max(0.06, R / 700.0), p = age / dur;
              float rf = p <= 1.0 ? R * (0.4 * (1.0 - pow(1.0 - p, 3.0)) + 0.6 * p) : R * (1.0 + 0.6 * (p - 1.0));
              float past = rf - d;
              float amp = clamp(1.0 - d / (2.2 * R), 0.0, 1.0);
              if (past <= 0.0 || amp <= 0.0) continue;
              float tau = past / (0.6 * R / dur);
              float lean = 0.95 * amp * amp * smoothstep(0.0, 3.0, past) * exp(-tau * 2.2) * cos(tau * 6.0);
              vec3 dw = vec3(dv.x, 0.0, dv.y) / max(r, 1.0);
              vec3 ld = vec3(dot(instanceMatrix[0].xyz, dw), dot(instanceMatrix[1].xyz, dw), dot(instanceMatrix[2].xyz, dw)) * inversesqrt(max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 1e-6));
              transformed += ld * lean * uv.y;
              transformed.y -= 0.35 * abs(lean) * uv.y;
            }`;

  // Thảm cỏ ngắn (lớp giữa nền đất và khóm cỏ cao): 1 dải lá mảnh, dày, cao xấp xỉ nhau, gốc liền thành thảm.
  // Ảnh 2 hàng: trên = cỏ xanh, dưới = cỏ lẫn lá khô; mỗi đám chọn 1 hàng
  let carpetTex = null;
  function carpetBlades() {
    if (carpetTex) return carpetTex;
    const Wd = 512, Hh = 128, c = document.createElement('canvas'); c.width = Wd; c.height = Hh * 2;
    const g = c.getContext('2d');
    for (let row = 0; row < 2; row++) {
      const rnd = rngOf(501 + row * 17), oy = row * Hh;
      g.save(); g.beginPath(); g.rect(0, oy, Wd, Hh); g.clip();
      for (let i = 0; i < 260; i++) {
        const front = i > 110, x0 = 4 + rnd() * (Wd - 8), h = Hh * (0.45 + rnd() * 0.53) - 1, lean = (rnd() - 0.5) * 26, w = 1.0 + rnd() * 1.6;
        const dead = rnd() < (row ? 0.3 : 0.06), k = (front ? 0.85 : 0.6) + rnd() * 0.3;
        const tip = dead ? [205, 185, 140] : [200 + rnd() * 30, 222, 160 - rnd() * 30], base = dead ? [130, 115, 90] : [120, 138, 98];
        const gr = g.createLinearGradient(0, oy + Hh, 0, oy + Hh - h);
        gr.addColorStop(0, `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`);
        gr.addColorStop(1, `rgb(${Math.min(255, tip[0] * k) | 0},${Math.min(255, tip[1] * k) | 0},${tip[2] * k | 0})`);
        g.fillStyle = gr; g.beginPath();
        g.moveTo(x0 - w, oy + Hh);
        g.quadraticCurveTo(x0 + lean * 0.3 - w * 0.6, oy + Hh - h * 0.6, x0 + lean, oy + Hh - h);
        g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.6, oy + Hh - h * 0.6, x0 + w, oy + Hh);
        g.closePath(); g.fill();
      }
      g.restore();
    }
    carpetTex = new THREE.CanvasTexture(c);
    carpetTex.anisotropy = 4;
    return carpetTex;
  }
  // Đám thảm cỏ: 7 tấm lá đứng xoay lệch nhau trong hình tròn bán kính 0,5 (gốc ở y = 0, ngọn y = 1), ngả nhẹ ra ngoài
  function carpetGeometry() {
    const P = [], UV = [], NR = [], I = [], rnd = rngOf(9191);
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), d = Math.sqrt(rnd()) * 0.32, b = rnd() * 6.283;
      const ox = Math.cos(b) * d, oz = Math.sin(b) * d, w = 0.32 + rnd() * 0.12, lx = Math.cos(b) * 0.15, lz = Math.sin(b) * 0.15;
      const u0 = rnd() * 0.5, o = P.length / 3;
      P.push(ox - ca * w, 0, oz - sa * w, ox + ca * w, 0, oz + sa * w, ox - ca * w + lx, 1, oz - sa * w + lz, ox + ca * w + lx, 1, oz + sa * w + lz);
      UV.push(u0, 0, u0 + 0.5, 0, u0, 1, u0 + 0.5, 1);
      NR.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      I.push(o, o + 1, o + 3, o, o + 3, o + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
    g.setIndex(I);
    return g;
  }

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
    // VÒNG LÁ XÒE SÁT ĐẤT: lá ngoài cùng của khóm ngả rạp ra xung quanh, ngọn gần chạm đất -> khóm "mọc" ra từ mặt đất
    // thay vì 9 tấm lá dựng đứng cắm xuống như đồ dán. Mỗi tấm 1 mặt phẳng nghiêng ~20°; aSk = 1 (shader tắt ở xa)
    const SK = new Array(P.length / 3).fill(0), nS = 6;
    for (let k = 0; k < nS; k++) {
      const a = (k + 0.5) / nS * Math.PI * 2 + (rnd() - 0.5) * 0.8, ca = Math.cos(a), sa = Math.sin(a);
      const r1 = 0.75 + rnd() * 0.3, y1 = 0.2 + rnd() * 0.12, w = 0.32 + rnd() * 0.16, px = -sa * w, pz = ca * w, o = P.length / 3;
      P.push(ca * 0.04 - px * 0.6, 0.04, sa * 0.04 - pz * 0.6, ca * 0.04 + px * 0.6, 0.04, sa * 0.04 + pz * 0.6,
        ca * r1 - px, y1, sa * r1 - pz, ca * r1 + px, y1, sa * r1 + pz);
      UV.push(0, 0, 1, 0, 0, 1, 1, 1);
      NR.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      I.push(o, o + 1, o + 3, o, o + 3, o + 2);
      SK.push(1, 1, 1, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
    g.setAttribute('aSk', new THREE.Float32BufferAttribute(SK, 1));
    g.setIndex(I);
    return g;
  }

  let sharedTuftGeo = null;
  function getTuftGeometry() {
    if (sharedTuftGeo) return sharedTuftGeo;
    return (sharedTuftGeo = tuftGeometry());
  }

  let sharedPebGeo = null;
  function getPebGeometry() {
    if (sharedPebGeo) return sharedPebGeo;
    const pg = new THREE.IcosahedronGeometry(1, 0);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setY(i, y > 0 ? y * 0.55 : y * 0.25); }
    pg.computeVertexNormals();
    return (sharedPebGeo = pg);
  }

  class Cover {
    constructor(terrain) {
      this.T = terrain;
      this.B = BIOME[terrain.mapType] || BIOME.HIGHLAND;
      this.group = new THREE.Group();
      this.group.name = 'groundCover';
      terrain.group.add(this.group);   // dọn theo địa hình khi đổi bản đồ
      const maxCells = Math.ceil(Math.PI * (RADIUS / CELL + 1) ** 2);
      this.uFocus = { value: new THREE.Vector2(0, 0) };
      this.uCoverRadius = { value: RADIUS };
      this.uFadeDist = { value: FADE_DIST };
      this.maxT = Math.round(maxCells * TUFTS_PER_CELL * Math.max(0.3, this.B.density) * 1.5) + 18000;   // + cỏ dại dày trong căn cứ
      this.maxP = maxCells * PEBBLES_PER_CELL;
      // cỏ
      // alphaToCoverage (như lá cây): mép lá cỏ mịn theo khử răng cưa MSAA, hết nhấp nháy khi xe chạy / lia camera (tắt MSAA thì GPU bỏ qua)
      const gm = new THREE.MeshStandardMaterial({ map: blades(), alphaTest: 0.32, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });   // lá mảnh: ngưỡng thấp để xa không bị mỏng mất
      gm.onBeforeCompile = (sh) => {
        sh.uniforms.gTime = GroundShader && GroundShader.time ? GroundShader.time : { value: 0 };
        sh.uniforms.uWindV = (typeof Weather !== 'undefined' && Weather.WINDV) || { value: new THREE.Vector4(0.8, 0.6, 1, 0) };
        sh.uniforms.uShock = { value: SHOCKS };
        sh.uniforms.uShockH = { value: SHOCK_H };
        sh.uniforms.uFocus = this.uFocus;
        sh.uniforms.uCoverRadius = this.uCoverRadius;
        sh.uniforms.uFadeDist = this.uFadeDist;
        sh.vertexShader = 'uniform float gTime;\nuniform vec4 uWindV;\nuniform vec4 uShock[4];\nuniform float uShockH[4];\nuniform vec2 uFocus;\nuniform float uCoverRadius;\nuniform float uFadeDist;\nattribute float aSk;\nvarying float vBY;\nvarying float vSk;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          vBY = uv.y; vSk = aSk;
          {
            float hv = fract(sin(dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(12.9898, 78.233))) * 43758.5453);
            vUv = vUv * 0.5 + vec2(step(0.5, fract(hv * 2.0)), step(0.5, hv)) * 0.5;
          }`).replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            // lay theo gió: ngọn đung đưa, gốc đứng yên; mỗi khóm lệch pha theo vị trí
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            // viền ngoài chuyển tiếp êm dịu vào nền đất: khóm cỏ thấp dần và thu nhỏ về 0 trước khi chạm tới mép rải
            float cDist = length(ip.xz - uFocus);
            float cFade = clamp((uCoverRadius - cDist) / max(uFadeDist, 1.0), 0.0, 1.0);
            cFade = cFade * cFade * (3.0 - 2.0 * cFade);
            // viền ngoài: khóm THƯA dần (bỏ bớt theo hạt ngẫu nhiên mỗi khóm), khóm còn lại chỉ lùn bớt — trước đây cả loạt teo
            // nhỏ đều thành chấm li ti; ra xa camera cũng bớt ~40% khóm (bù bằng toả rộng bên dưới), shader đất vẽ tiếp thành vệt
            float hk = fract(sin(dot(ip.xz, vec2(41.37, 17.91))) * 23421.631);
            float cFarT = smoothstep(350.0, 900.0, length((modelMatrix * vec4(ip.x, 0.0, ip.z, 1.0)).xz - cameraPosition.xz));
            transformed *= step(hk, cFade * 1.1 - 0.4 * cFarT);
            transformed.y *= mix(0.55, 1.0, cFade);
            // xa camera: khóm toả rộng, thấp hơn -> các khóm liền thành mảng cỏ, không lấm tấm từng chấm
            float cFar = smoothstep(250.0, 750.0, length((modelMatrix * vec4(ip.x, 0.0, ip.z, 1.0)).xz - cameraPosition.xz));
            transformed.xz *= 1.0 + 0.4 * cFar;
            transformed.y *= 1.0 - 0.2 * cFar;
            // vòng lá xòe sát đất: chỉ thấy rõ ở gần (xa hơn ~40 m nhỏ dưới vài điểm ảnh) -> thu về 0, đỡ tô điểm ảnh
            transformed *= 1.0 - aSk * smoothstep(220.0, 320.0, length((modelMatrix * vec4(ip.x, 0.0, ip.z, 1.0)).xz - cameraPosition.xz));
            float sw = (sin(gTime * 1.9 + ip.x * 0.045 + ip.z * 0.031) * 0.16 + sin(gTime * 3.7 + ip.x * 0.11) * 0.05) * (0.6 + 0.4 * uWindV.z);
            transformed.x += sw * uv.y;
            transformed.z += sw * 0.6 * uv.y;
            // gió mạnh / cơn giật (mưa giông): cả khóm rạp xuôi gió — hướng gió thế giới đổi về toạ độ cục bộ khóm cỏ
            float ln = (max(uWindV.z - 1.0, 0.0) * 0.07 + uWindV.w * 0.22 * (0.8 + 0.4 * sin(gTime * 5.3 + ip.x * 0.07))) * uv.y;
            vec3 lw = vec3(uWindV.x, 0.0, uWindV.y) * ln;
            transformed += vec3(dot(instanceMatrix[0].xyz, lw), dot(instanceMatrix[1].xyz, lw), dot(instanceMatrix[2].xyz, lw)) / max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 1e-6);
            ${SHOCK_GLSL}
          }`);
        // ánh sáng: lá cỏ 2 mặt -> mặt sau bị lật pháp tuyến xuống dưới thành lá tối sẫm xen lá sáng chói. Cho mọi lá nhận
        // sáng như mặt đất (pháp tuyến hướng lên), gốc khóm tối dần (lá che nhau), ngọn sáng
        sh.fragmentShader = 'varying float vBY;\nvarying float vSk;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            // chân tấm lá lởm chởm (cột lá cụt chân cao thấp khác nhau): hết đường cắt ngang thẳng tắp nơi tấm lá cắm xuống đất
            if (vSk < 0.5 && vBY < 0.11 * fract(sin(floor(vUv.x * 180.0) * 91.7) * 4375.85)) discard;
            // ở xa (ngoài vùng thảm cỏ): gốc bớt tối, cả khóm sáng lên -> không thành chấm sẫm lấm tấm trên nền đất sáng
            float gFar = smoothstep(220.0, 700.0, length(vViewPosition)), gS = smoothstep(0.0, 0.9, vBY);
            diffuseColor.rgb *= mix(mix(0.38, 1.04, gS), mix(0.85, 1.12, gS), gFar);`)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
            normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
      };
      gm.customProgramCacheKey = () => 'grassTuft8';
      this.grass = new THREE.InstancedMesh(getTuftGeometry(), gm, this.maxT);
      this.grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxT * 3), 3);
      this.grass.count = 0; this.grass.frustumCulled = false; this.grass.receiveShadow = true; this.grass.castShadow = false;
      this.group.add(this.grass);
      // thảm cỏ ngắn: phủ kín đất cỏ quanh camera (tâm thảm lệch từ tâm nhìn về phía camera, xem update)
      // (dùng chung uniform với shader mặt đất: đất dưới thảm sẫm theo cùng vùng / dải mờ viền)
      this.uCarpet = GroundShader && GroundShader.cover && GroundShader.cover.carpet || { value: new THREE.Vector4() };
      this.uCarpet.value.set(0, 0, this.B.carpet ? CARPET_R : 0, CARPET_FADE);
      this.maxC = Math.ceil(Math.PI * (CARPET_R / CELL + 2.5) ** 2) * (CELL / CARPET_STEP) ** 2;
      const cm = new THREE.MeshStandardMaterial({ map: carpetBlades(), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
      cm.onBeforeCompile = (sh) => {
        sh.uniforms.gTime = GroundShader && GroundShader.time ? GroundShader.time : { value: 0 };
        sh.uniforms.uWindV = (typeof Weather !== 'undefined' && Weather.WINDV) || { value: new THREE.Vector4(0.8, 0.6, 1, 0) };
        sh.uniforms.uShock = { value: SHOCKS };
        sh.uniforms.uShockH = { value: SHOCK_H };
        sh.uniforms.uCarpet = this.uCarpet;
        sh.vertexShader = 'uniform float gTime;\nuniform vec4 uWindV;\nuniform vec4 uShock[4];\nuniform float uShockH[4];\nuniform vec4 uCarpet;\nvarying float vBY;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          vBY = uv.y;
          vUv.y = vUv.y * 0.5 + step(0.62, fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453)) * 0.5;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            // viền thảm: lá thấp dần về 0 (lẫn vào màu cỏ của nền đất)
            float cFade = smoothstep(0.0, uCarpet.w, uCarpet.z - length(ip.xz - uCarpet.xy));
            transformed.y *= cFade;
            float sw = (sin(gTime * 1.9 + ip.x * 0.045 + ip.z * 0.031) * 0.05 + sin(gTime * 3.7 + ip.x * 0.11) * 0.02) * (0.6 + 0.4 * uWindV.z);
            transformed.xz += vec2(sw, sw * 0.6) * uv.y;
            ${SHOCK_GLSL}
          }`);
        sh.fragmentShader = 'varying float vBY;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.8, vBY));
            // chân tấm lá lởm chởm (cột lá cụt chân cao thấp khác nhau): hết đường đáy thẳng của tấm lá trên nền đất
            if (vBY < 0.3 * fract(sin(floor(vUv.x * 90.0) * 91.7) * 4375.85)) discard;`)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
            normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
      };
      cm.customProgramCacheKey = () => 'grassCarpet1';
      this.carpet = new THREE.InstancedMesh(carpetGeometry(), cm, this.maxC);
      this.carpet.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxC * 3), 3);
      this.carpet.count = 0; this.carpet.frustumCulled = false; this.carpet.receiveShadow = true; this.carpet.castShadow = false;
      this.group.add(this.carpet);
      // đá vụn
      const pg = getPebGeometry();
      const pm = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02, flatShading: true });
      pm.onBeforeCompile = (sh) => {
        sh.uniforms.uFocus = this.uFocus;
        sh.uniforms.uCoverRadius = this.uCoverRadius;
        sh.uniforms.uFadeDist = this.uFadeDist;
        sh.vertexShader = 'uniform vec2 uFocus;\nuniform float uCoverRadius;\nuniform float uFadeDist;\nvarying vec3 vRW;\nvarying float vRY;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vRW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          vRY = position.y;
          {
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            float cDist = length(ip.xz - uFocus);
            float cFade = clamp((uCoverRadius - cDist) / max(uFadeDist, 1.0), 0.0, 1.0);
            cFade = cFade * cFade * (3.0 - 2.0 * cFade);
            transformed *= cFade;
          }`);
        // mặt đá: vân lốm đốm 2 thang theo toạ độ thế giới (mỗi hòn một khác), vệt khoáng sáng / sẫm; chân bám đất sẫm,
        // mặt trên phủ bụi đất & rêu nhạt -> hòn đá "ngồi" trong đất thay vì đặt nổi
        sh.fragmentShader = 'varying vec3 vRW;\nvarying float vRY;\nfloat rkH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\n'
          + 'float rkN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n'
          + '  return mix(mix(mix(rkH(i), rkH(i + vec3(1, 0, 0)), f.x), mix(rkH(i + vec3(0, 1, 0)), rkH(i + vec3(1, 1, 0)), f.x), f.y),\n'
          + '             mix(mix(rkH(i + vec3(0, 0, 1)), rkH(i + vec3(1, 0, 1)), f.x), mix(rkH(i + vec3(0, 1, 1)), rkH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }\n'
          + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            {
              float n1 = rkN(vRW * 0.9), n2 = rkN(vRW * 3.1 + 17.0);
              diffuseColor.rgb *= 0.72 + 0.42 * n1 + 0.2 * (n2 - 0.5);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.12, 1.02), smoothstep(0.78, 0.86, rkN(vRW * 1.7 + 5.0)) * 0.6);
              diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(-0.05, 0.3, vRY));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.34, 0.24), smoothstep(0.32, 0.55, vRY) * (0.15 + 0.3 * n2));
            }`);
      };
      pm.customProgramCacheKey = () => 'pebCover3';
      this.peb = new THREE.InstancedMesh(pg, pm, this.maxP);
      this.peb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxP * 3), 3);
      this.peb.count = 0; this.peb.frustumCulled = false; this.peb.receiveShadow = true;
      this.group.add(this.peb);
      this.lastCx = null; this.lastCz = null;
      this.covOn = true;
      if (GroundShader && GroundShader.cover) GroundShader.cover.xf.value.w = 0;   // bóng cỏ của bản đồ trước
      this.noise =GroundShader && GroundShader.noiseSampler ? GroundShader.noiseSampler() : null;
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
      wDirt = Math.max(wDirt, smooth(0.1, 0.3, slope) * (T.mapType === 'RIVER_LAKE' || T.mapType === 'JUNGLE' || T.mapType === 'URBAN' ? 0.2 : 0.75));   // khớp shader mặt đất
      if (T.mapType === 'DESERT' && GroundShader.desertMtn) {
        // núi đá & quạt sỏi vành ngoài sa mạc: không cỏ, đá vụn dày hơn (khớp shader mặt đất)
        const D = GroundShader.desertMtn(T, x, z, slope);
        wDirt = Math.max(wDirt, D.fan * 0.92); wRock = Math.max(wRock, D.rock);
      }
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
      // sân trước lát đá của khuôn viên cao ốc (map_gen b.yard, BuildingSet.baseDeco): không mọc cỏ dại xuyên mặt sân
      for (const b of (T.map && T.map.buildings) || []) {
        if (!b.yard) continue;
        const sa = Math.sin(b.angle), ca = Math.cos(b.angle), q = b.d / 2 + b.yard.f / 2 + 6;
        const fx = b.x - sa * q, fz = b.z - ca * q, hw = b.w / 2 + 80, hd = b.yard.f / 2, r = Math.hypot(hw, hd);
        for (let j = Math.floor((fz - r + half) / G); j <= Math.floor((fz + r + half) / G); j++)
          for (let i = Math.floor((fx - r + half) / G); i <= Math.floor((fx + r + half) / G); i++) {
            if (i < 0 || j < 0 || i >= n || j >= n) continue;
            const dx = -half + (i + 0.5) * G - fx, dz = -half + (j + 0.5) * G - fz;
            if (Math.abs(dx * ca - dz * sa) < hw && Math.abs(dx * sa + dz * ca) < hd) m[j * n + i] = 1;
          }
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
      if (T.map && T.map.testField) {
        const tf = T.map.testField;
        if (Math.hypot(x - tf.x, z - tf.z) < (tf.r || 1000) * 0.95) return true;
      }
      if (!this.mask) this.buildMask();
      const M = this.mask, i = Math.floor((x + M.half) / M.G), j = Math.floor((z + M.half) / M.G);
      if (i >= 0 && j >= 0 && i < M.n && j < M.n && M.m[j * M.n + i]) return true;
      if (T.groundAtRaw(x, z) < 0.6 && (T.hasWater ? T.hasWater() : (T.map.river || T.map.lakes.length))) return true;
      if (T.map.roadAt && T.map.roadAt(x, z)) return true;
      if (T.streetscape && T.streetscape.covers(x, z)) return true;   // vỉa hè đô thị (cao hơn mặt đất 15 cm)
      if (T.strongholdSet && T.strongholdSet.covers(x, z, 4)) return true;
      if (T.landmarkSet && T.landmarkSet.covers(x, z, 4) && !(T.landmarkSet.overgrowth && T.landmarkSet.overgrowth(x, z))) return true;
      if (T.bridges.length && T.bridgeAt(x, z)) return true;
      // nền ụ đất xe ủi (đất đã bị lưỡi ủi cạo, kể cả chỗ ụ bị nổ khoét thủng)
      if (T.berms && T.berms.length) for (const b of T.berms) {
        if (!b.mesh || b.k < 0.05) continue;
        const dx = x - b.x, dz = z - b.z;
        if (Math.abs(dx * b.cx + dz * b.cz) < b.L && Math.abs(dx * b.fx + dz * b.fz) < b.W) return true;
      }
      return false;
    }

    // Hố nổ chạm ô (x0..x1, z0..z1): các phát nổ (ExplosionFX craters[].blasts) để xét cỏ trong / quanh hố
    blastsIn(x0, z0, x1, z1) {
      const T = this.T;
      const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(T.scene) : null;
      if (!fx || !fx.craters || !fx.craters.length) return null;
      let out = null;
      for (const c of fx.craters) {
        if (!c.surf || !c.blasts) continue;
        for (const b of c.blasts) {
          const r = Math.max(b.A, b.B) * 2.4 + b.shift;
          if (b.x + r < x0 || b.x - r > x1 || b.z + r < z0 || b.z - r > z1) continue;
          (out || (out = [])).push(b);
        }
      }
      return out;
    }
    // Ảnh hưởng hố nổ lên khóm cỏ tại (x, z): rho = khoảng cách chuẩn hoá tới tâm hố gần nhất, mép méo như lòng hố (< 1 lòng
    // hố, ~1-1,15 gờ đất đắp dày); cov 0..1 = đất văng phủ dày tới đâu, theo đúng tia & mảng loang của texture hố
    // (ExplosionFX.blastCover) -> mép vùng trụi cỏ lởm chởm theo vệt đất, không phải elip tròn cắt gọn
    blastRho(L, x, z) {
      let best = 9, gouge = false, cov = 0;
      const BC = typeof ExplosionFX !== 'undefined' && ExplosionFX.blastCover;
      for (const b of L) {
        let rho, c = 0;
        if (BC) ({ rho, cov: c } = BC(b, x, z));
        else {
          const bx = b.x + b.fx * b.shift, bz = b.z + b.fz * b.shift, dx = x - bx, dz = z - bz;
          rho = Math.hypot((dx * b.fx + dz * b.fz) / b.A, (-dx * b.fz + dz * b.fx) / b.B);
        }
        cov = Math.max(cov, c);
        if (rho < best) { best = rho; gouge = b.kind === 'gouge'; }
      }
      return { rho: best, gouge, cov };
    }
    // Mặt đất mới (hố nổ / hố bị lấp / ụ đất bị khoét): các ô cỏ chạm vùng tính lại, rải lại quanh tâm nhìn hiện tại
    reground(x0, z0, x1, z1) {
      if (!this.cache) return;
      let hit = false;
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++)
        for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) if (this.cache.delete(i + ',' + j)) hit = true;
      if (hit) this.covDirty = true;
      if (hit && this.lastCx !== null) this.rebuild(this.lastCx * CELL, this.lastCz * CELL);
    }

    // Dữ liệu 1 ô (tính 1 lần, lưu lại): ma trận + màu của khóm cỏ & đá vụn
    cellData(i, j) {
      const key = i + ',' + j;
      let c = this.cache.get(key);
      if (c) return c;
      const B = this.B, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const gm = [], gc = [], pm = [], pc = [];
      const ox = i * CELL, oz = j * CELL, half = this.T.width / 2 - 70;
      // hố nổ trong ô: cỏ lòng hố bị hất tung, gờ hố bị đất văng vùi, quanh hố cháy sém / rạp. Mặt đất lấy theo mặt hố nhìn
      // thấy (T.surfaceAt) để khóm cỏ còn lại không lơ lửng trên lòng hố / chìm dưới gờ
      const BL = this.blastsIn(ox - 4, oz - 4, ox + CELL + 4, oz + CELL + 4);
      const surfH = (x, z, h) => BL && this.T.surfaceAt ? this.T.surfaceAt(x, z, true) : h;
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
            if (!inside && this.bareAt(x, z) > 0.55 + hash2(x, z) * 0.45) continue;   // vạt đất trơ: chỉ lác đác khóm ở mép
            let hgt = (B.tuftH[0] + r2 * (B.tuftH[1] - B.tuftH[0])) * size * (t === 0 ? 1.1 : 0.8 + r3 * 0.3) * (og ? og.h : 1), wid = hgt * (0.7 + r3 * 0.5) * (og ? 1.25 : 1);
            const r4 = rnd(), r5 = rnd();
            // hố nổ: lòng hố & gờ đất đắp không còn cỏ; ngoài gờ đất văng vùi khóm cỏ thành từng mảng theo tia đất — chỗ đất dày
            // vùi hẳn, chỗ mỏng khóm cỏ thấp hẳn đi (vùi nửa thân), rạp, lấm đất. Lửa nổ chỉ chớp qua: sém nhẹ sát gờ, không
            // thành vành cỏ cháy vàng / đen đều quanh hố
            let dirt = 0, sear = 0;
            if (BL) {
              const H = this.blastRho(BL, x, z);
              // khóm cao toả lá rộng: vành đất liền sát gờ (tới ~1,9 bán kính) vùi hết, không thì lá chìa vào lòng hố
              if (H.rho < 1.9) continue;
              if (r5 < Math.min(0.88, H.cov * 1.15 - 0.1)) continue;   // khóm cứng: vài khóm vẫn ló lên qua lớp đất dày
              dirt = H.cov;
              if (!H.gouge) sear = (1 - smooth(1.1, 1.7, H.rho)) * (0.4 + 0.6 * r4);
              hgt *= 1 - 0.55 * dirt - 0.25 * sear; wid *= 1 + 0.2 * dirt;
            }
            const flop = 0.5 + dirt * 0.3 + sear * 0.3;
            e.set((r4 - 0.5) * flop, r3 * 6.283, (r5 - 0.5) * flop);
            m4.compose(v.set(x, surfH(x, z, M.h) - 0.3, z), q.setFromEuler(e), sc.set(wid * (0.65 + r4 * 0.7), hgt, wid * (0.65 + r5 * 0.7)));
            gm.push(...m4.elements);
            const dry = Math.max(0, Math.min(1, cDry + (r2 - 0.5) * 0.25 + (1 - mg) * 0.4)), kk = 1.0 + r1 * 0.22;
            for (let ch = 0; ch < 3; ch++) {
              const g0 = (B.grass[0][ch] + (B.grass[1][ch] - B.grass[0][ch]) * dry) * kk;
              gc.push(blastTint(g0, ch, dirt, sear));
            }
          }
        }
        for (let k = 0; k < PEBBLES_PER_CELL; k++) {
          const x = ox + rnd() * CELL, z = oz + rnd() * CELL, r1 = rnd(), r2 = rnd(), r3 = rnd();
          const M = this.masks(x, z);
          const clump = this.noise ? this.noise(x / 90 + 0.21, z / 90 + 0.63)[1] : 0.5;
          const bare = this.bareAt(x, z);   // vạt đất trơ giữa đồng cỏ: sỏi đá lộ dày, có hòn to
          if (r1 > Math.max(Math.min(1, M.rough * B.pebbleK * Math.max(0, clump - 0.35) * 2.6), bare * 0.85) || this.blocked(x, z)) continue;
          if (BL) { const H = this.blastRho(BL, x, z); if (H.rho < 1.12 || H.cov > 0.4) continue; }   // lòng hố / gờ: đá vụn bị hất đi, vùi dưới đất văng
          const s = (0.7 + r2 * r2 * 2.8) * (1 + bare * r3 * 1.6);
          e.set((r3 - 0.5) * 0.6, r2 * 6.283, (r1 - 0.5) * 0.6);
          m4.compose(v.set(x, surfH(x, z, M.h) - s * (0.12 + 0.18 * bare), z), q.setFromEuler(e), sc.set(s * (0.8 + r3 * 0.5), s, s));
          pm.push(...m4.elements);
          // hòn to bám đất / rêu: sẫm hơn, ngả màu đất
          const kk = (0.72 + r3 * 0.45) * (1 - 0.25 * bare);
          for (let ch = 0; ch < 3; ch++) pc.push(B.pebble[ch] * kk * (1 - 0.12 * bare * ch / 2));
        }
      }
      c = { gm: new Float32Array(gm), gc: new Float32Array(gc), pm: new Float32Array(pm), pc: new Float32Array(pc), dense: gm.length / 16 > TUFTS_PER_CELL * 4, off: -1, n: 0, poff: -1 };
      const ML = this.marks && this.marks.get(key);
      if (ML) for (const mk of ML) this.applyMark(c, mk, false);
      this.cache.set(key, c);
      return c;
    }

    // Thảm cỏ ngắn của 1 ô (tính khi ô lọt vào vùng thảm, lưu cùng ô): lưới lệch ngẫu nhiên mỗi CARPET_STEP, mọc theo mặt
    // nạ cỏ của shader đất (đất trơ / đá / sỏi thưa dần rồi hết), thấp dần ở mép vùng cỏ; hố nổ: hất sạch / cháy sém
    carpetData(c, i, j) {
      if (c.cm) return c;
      const B = this.B, cm = [], cc = [], ox = i * CELL, oz = j * CELL, half = this.T.width / 2 - 70;
      if (B.carpet && Math.abs(ox) <= half && Math.abs(oz) <= half) {
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
        const rnd = rngOf((i * 19349663) ^ (j * 83492791) ^ 0x2545f491), n = CELL / CARPET_STEP;
        const BL = this.blastsIn(ox - 4, oz - 4, ox + CELL + 4, oz + CELL + 4);
        for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) {
          const x = ox + (ii + 0.1 + rnd() * 0.8) * CARPET_STEP, z = oz + (jj + 0.1 + rnd() * 0.8) * CARPET_STEP;
          const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
          const M = this.masks(x, z);
          // đô thị: bãi đất trống / sân bỏ hoang (trong khu phố) cỏ dại mọc thành từng đám dày xen đất trơ (đường, vỉa hè, nhà,
          // quảng trường lát đã chặn ở blocked) — trước đây tắt hẳn: bãi trống chỉ lác đác khóm cỏ trên nền phẳng
          if (r1 > M.grass * 1.25 - 0.08 || this.blocked(x, z)) continue;
          // (mép đường: dải nhựa vẽ rộng hơn bề rộng tuyến đường dùng ở blocked -> nới 10 đv, không mọc thảm cỏ trên lòng đường)
          if (B.city && this.T.map.nearestRoad) { const nr = this.T.map.nearestRoad(x, z, 80); if (nr && nr.d < nr.road.width / 2 + 10) continue; }
          if (B.city && this.cityAt(x, z) > 0.12 && this.noise && this.noise(x / 43 + 0.37, z / 43 + 0.71)[1] * 0.7 + this.noise(x / 11 + 0.2, z / 11)[0] * 0.3 < 0.47 + r4 * 0.08) continue;
          if (this.bareAt(x, z) > 0.15 + r4 * 0.3) continue;   // vạt đất trơ: thảm dừng trước mép, viền lởm chởm
          // hố nổ: như khóm cỏ (cellData) — thảm cỏ thấp bị đất văng vùi kín sớm hơn khóm cao
          let dirt = 0, sear = 0;
          if (BL) {
            const H = this.blastRho(BL, x, z);
            if (H.rho < 1.12) continue;
            if (r4 < Math.min(H.rho < 1.35 ? 1 : 0.93, H.cov * 1.5 - 0.05)) continue;   // lác đác ngọn cỏ ló qua đất văng
            dirt = H.cov;
            if (!H.gouge) sear = (1 - smooth(1.1, 1.7, H.rho)) * (0.4 + 0.6 * r3);
          }
          const pn = this.noise ? this.noise(x / 170 + 0.37, z / 170 + 0.11) : [0.5, 0.5, 0.5];
          const hgt = (B.carpet[0] + r2 * (B.carpet[1] - B.carpet[0])) * (0.45 + 0.55 * Math.min(1, M.grass * 1.2)) * (1 - 0.6 * dirt - 0.3 * sear);
          const wd = CARPET_STEP * (1.5 + r3 * 0.6);
          e.set((r3 - 0.5) * 0.16, r4 * 6.283, (r2 - 0.5) * 0.16);
          m4.compose(v.set(x, (BL && this.T.surfaceAt ? this.T.surfaceAt(x, z, true) : M.h) - 0.35, z), q.setFromEuler(e), sc.set(wd, hgt, wd * (0.8 + r1 * 0.4)));
          cm.push(...m4.elements);
          const dry = Math.max(0, Math.min(1, pn[0] * 0.9 - 0.15 + (r2 - 0.5) * 0.3 + (1 - M.grass) * 0.5)), kk = 0.92 + r1 * 0.16;
          for (let ch = 0; ch < 3; ch++) {
            const g0 = (B.grass[0][ch] + (B.grass[1][ch] - B.grass[0][ch]) * dry) * kk * [1.24, 1.15, 1.2][ch];
            cc.push(blastTint(g0, ch, dirt, sear));
          }
        }
      }
      c.cm = new Float32Array(cm); c.cc = new Float32Array(cc); c.coff = -1; c.cn = 0;
      const ML = this.marks && this.marks.get(i + ',' + j);
      if (ML) for (const mk of ML) this.applyMark(c, mk, false);   // vệt xe đi qua từ trước (khóm cỏ / sỏi đã rạp: bỏ qua)
      return c;
    }

    // Vạt đất trơ giữa đồng cỏ 0..1 (đất trần lấm sỏi, giữa vạt có bùn): đúng công thức gBareP của shader mặt đất
    bareAt(x, z) {
      if (!this.noise || this.T.mapType === 'DESERT') return 0;
      const x1 = 0.866 * x + 0.5 * z, z1 = -0.5 * x + 0.866 * z, x2 = 0.423 * x + 0.906 * z, z2 = -0.906 * x + 0.423 * z;
      const bn = this.noise(x2 / 520 + 0.19, z2 / 520 + 0.83)[1] * 0.6 + this.noise(x / 1900 + 0.61, z / 1900 + 0.27)[0] * 0.4
        + (this.noise(x1 / 37 + 0.47, z1 / 37 + 0.09)[2] - 0.5) * 0.15;
      const b = smooth(0.64, 0.67, bn);
      return b > 0 && this.B.city ? b * (this.cityAt(x, z) > 0.12 ? 0 : 1) : b;
    }

    // đô thị: mức "trong khu phố" (sân / vỉa hè lát) tại (x, z) theo cùng mặt nạ shader mặt đất (GroundShader cityMask);
    // thảm cỏ chỉ mọc ở đất cỏ ngoại ô, không trùm lên sân bê tông
    cityAt(x, z) {
      const C = this.T._gCity, K = this.T._gBake;
      if (!C || !K) return 0;
      const img = C.tex.image, N = img.width;
      const i = Math.floor((x + K.half) / K.size * N), j = Math.floor((z + K.half) / K.size * N);
      if (i < 0 || j < 0 || i >= N || j >= N) return 0;
      return img.data[(j * N + i) * 4] / 255;
    }

    // XE ĐI QUA: khóm cỏ dưới thân xe rạp sát đất xuôi chiều xe chạy, dập nát sẫm màu; sỏi bị ép lún
    trample(m) {
      if (!this.marks) this.marks = new Map();
      const R = Math.hypot(m.hu, m.hv) + 2;
      let lo = Infinity, hi = -1, plo = Infinity, phi = -1, clo = Infinity, chi = -1;
      for (let j = Math.floor((m.cz - R) / CELL); j <= Math.floor((m.cz + R) / CELL); j++)
        for (let i = Math.floor((m.cx - R) / CELL); i <= Math.floor((m.cx + R) / CELL); i++) {
          const key = i + ',' + j;
          let L = this.marks.get(key);
          if (!L) this.marks.set(key, L = []);
          L.push(m);
          if (L.length > 160) L.shift();
          const c = this.cache && this.cache.get(key);
          if (!c) continue;
          const r = this.applyMark(c, m, true);
          if (r.g0 <= r.g1) { lo = Math.min(lo, r.g0); hi = Math.max(hi, r.g1); }
          if (r.p0 <= r.p1) { plo = Math.min(plo, r.p0); phi = Math.max(phi, r.p1); }
          if (r.c0 <= r.c1) { clo = Math.min(clo, r.c0); chi = Math.max(chi, r.c1); }
        }
      const up = (a, s, e) => markUpload(a, s, e - s + 1);
      if (hi >= 0) { up(this.grass.instanceMatrix, lo, hi); up(this.grass.instanceColor, lo, hi); }
      if (phi >= 0) up(this.peb.instanceMatrix, plo, phi);
      if (chi >= 0) { up(this.carpet.instanceMatrix, clo, chi); up(this.carpet.instanceColor, clo, chi); }
      this.marksN = (this.marksN || 0) + 1;
      if (this.marksN > 20000) { this.marks.clear(); this.marksN = 0; }
    }
    applyMark(c, m, live) {
      const res = { g0: Infinity, g1: -1, p0: Infinity, p1: -1, c0: Infinity, c1: -1 };
      const inLane = (x, z) => {
        const tx = x - m.cx, tz = z - m.cz, lu = tx * m.ux + tz * m.uz, lv = -tx * m.uz + tz * m.ux;
        if (Math.abs(lv) > m.hv || Math.abs(lu) > m.hu) return 0;
        return Math.abs(lu) > m.hu - m.lane * 2 ? 1 : 0.45;
      };
      const M = _tm, P = _tp, Q = _tq, S = _ts, ax = _ta.set(m.dz, 0, -m.dx).normalize();
      if (c.flat === undefined) c.flat = new Float32Array(c.gm.length / 16);
      const gA = live ? this.grass.instanceMatrix.array : null, gC = live ? this.grass.instanceColor.array : null;
      for (let k = 0; k < c.gm.length / 16; k++) {
        const x = c.gm[k * 16 + 12], z = c.gm[k * 16 + 14], f = inLane(x, z);
        if (f <= c.flat[k] + 0.05) continue;
        const prev = c.flat[k];
        c.flat[k] = f;
        M.fromArray(c.gm, k * 16).decompose(P, Q, S);
        const add = f - prev;
        Q.premultiply(_tq2.setFromAxisAngle(ax, 1.25 * add + (hash2(x, z) - 0.5) * 0.3 * add));
        S.y *= Math.max(0.2, 1 - 0.75 * add); S.x *= 1 + 0.2 * add; S.z *= 1 + 0.2 * add;
        M.compose(P, Q, S).toArray(c.gm, k * 16);
        for (let ch = 0; ch < 3; ch++) c.gc[k * 3 + ch] *= 1 - 0.28 * add;
        if (live && c.off >= 0 && k < c.n) {
          const o = c.off + k;
          gA.set(c.gm.subarray(k * 16, k * 16 + 16), o * 16);
          gC.set(c.gc.subarray(k * 3, k * 3 + 3), o * 3);
          if (o < res.g0) res.g0 = o; if (o > res.g1) res.g1 = o;
        }
      }
      // thảm cỏ: rạp bẹp sát đất, sẫm màu (vệt bánh xích trên nền đất lộ ra)
      if (c.cm) {
        if (c.cflat === undefined) c.cflat = new Float32Array(c.cm.length / 16);
        const cA = live ? this.carpet.instanceMatrix.array : null, cC = live ? this.carpet.instanceColor.array : null;
        for (let k = 0; k < c.cm.length / 16; k++) {
          const f = inLane(c.cm[k * 16 + 12], c.cm[k * 16 + 14]);
          if (f <= c.cflat[k] + 0.05) continue;
          const add = f - c.cflat[k];
          c.cflat[k] = f;
          const ky = Math.max(0.15, 1 - 0.85 * add);
          for (let r = 4; r < 7; r++) c.cm[k * 16 + r] *= ky;
          for (let ch = 0; ch < 3; ch++) c.cc[k * 3 + ch] *= 1 - 0.3 * add;
          if (live && c.coff >= 0 && k < c.cn) {
            const o = c.coff + k;
            cA.set(c.cm.subarray(k * 16, k * 16 + 16), o * 16);
            cC.set(c.cc.subarray(k * 3, k * 3 + 3), o * 3);
            if (o < res.c0) res.c0 = o; if (o > res.c1) res.c1 = o;
          }
        }
      }
      if (c.pflat === undefined) c.pflat = new Uint8Array(c.pm.length / 16);
      const pA = live ? this.peb.instanceMatrix.array : null;
      for (let k = 0; k < c.pm.length / 16; k++) {
        if (c.pflat[k]) continue;
        const x = c.pm[k * 16 + 12], z = c.pm[k * 16 + 14];
        if (inLane(x, z) < 1) continue;
        c.pflat[k] = 1;
        c.pm[k * 16 + 13] -= 0.6 * Math.hypot(c.pm[k * 16 + 4], c.pm[k * 16 + 5], c.pm[k * 16 + 6]);
        if (live && c.poff >= 0) {
          const o = c.poff + k;
          pA[o * 16 + 13] = c.pm[k * 16 + 13];
          if (o < res.p0) res.p0 = o; if (o > res.p1) res.p1 = o;
        }
      }
      return res;
    }

    // Ô quanh tâm xếp từ gần ra xa (tính 1 lần): tâm nhìn nhảy xa (đổi sang kính ngắm pháo, hồi sinh, lia camera) thì gần
    // như cả ~1400 ô phải rải mới — trước đây rải hết trong 1 khung (khựng lớn). Giờ mỗi khung rải ô mới tới ~4 ms, gần
    // trước xa sau; ô xa chưa rải tạm để trống, khung sau rải tiếp (cỏ mọc dần ra xa thay vì đứng hình)
    static ring() {
      if (Cover._ring) return Cover._ring;
      const r = Math.ceil(RADIUS / CELL) + 1, out = [];
      const maxR2 = (RADIUS / CELL) * (RADIUS / CELL);
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const d2 = di * di + dj * dj;
          if (d2 <= maxR2) out.push([di, dj, d2]);
        }
      }
      out.sort((a, b) => a[2] - b[2]);
      return (Cover._ring = out);
    }
    rebuild(cx, cz) {
      if (!this.cache) this.cache = new Map();
      const gA = this.grass.instanceMatrix.array, gC = this.grass.instanceColor.array;
      const pA = this.peb.instanceMatrix.array, pC = this.peb.instanceColor.array;
      const cA = this.carpet.instanceMatrix.array, cC = this.carpet.instanceColor.array, CC = this.carpetC || { x: cx, z: cz };
      let nt = 0, np = 0, nc = 0;
      const ci = Math.floor(cx / CELL), cj = Math.floor(cz / CELL), t0 = performance.now();
      this.pending = false;
      for (const [di, dj] of Cover.ring()) {
        const i = ci + di, j = cj + dj;
        let c = this.cache.get(i + ',' + j);
        if (!c) {
          if (performance.now() - t0 > 4) { this.pending = true; continue; }
          c = this.cellData(i, j);
        }
        // ô cỏ dày (căn cứ bỏ hoang): đủ dày trong ~300 quanh tâm nhìn, xa hơn chỉ lấy 1/3 (các khóm rải ngẫu nhiên -> lấy phần đầu)
        const far = c.dense && Math.hypot(i * CELL + CELL / 2 - cx, j * CELL + CELL / 2 - cz) > 300;
        const ng = far ? Math.floor(c.gm.length / 16 / 3) : c.gm.length / 16, npb = c.pm.length / 16;
        if (ng && nt + ng <= this.maxT) { gA.set(c.gm.subarray(0, ng * 16), nt * 16); gC.set(c.gc.subarray(0, ng * 3), nt * 3); c.off = nt; c.n = ng; nt += ng; } else { c.off = -1; c.n = 0; }
        if (npb && np + npb <= this.maxP) { pA.set(c.pm, np * 16); pC.set(c.pc, np * 3); c.poff = np; np += npb; } else c.poff = -1;
        // thảm cỏ: ô trong vùng thảm (+ lề 1,5 ô: tâm thảm trôi theo camera giữa 2 lần rải lại)
        c.coff = -1; c.cn = 0;
        if (Math.hypot(i * CELL + CELL / 2 - CC.x, j * CELL + CELL / 2 - CC.z) < CARPET_R + CELL * 1.5) {
          if (!c.cm) { if (performance.now() - t0 > 4) { this.pending = true; continue; } this.carpetData(c, i, j); }
          const ncc = c.cm.length / 16;
          if (ncc && nc + ncc <= this.maxC) { cA.set(c.cm, nc * 16); cC.set(c.cc, nc * 3); c.coff = nc; c.cn = ncc; nc += ncc; }
        }
      }
      // dọn ô quá xa khỏi bộ nhớ đệm
      if (this.cache.size > 6000) {
        for (const k of this.cache.keys()) {
          const [i, j] = k.split(',').map(Number);
          if (Math.abs(i * CELL - cx) > RADIUS * 3 || Math.abs(j * CELL - cz) > RADIUS * 3) this.cache.delete(k);
        }
      }
      this.grass.count = nt; this.peb.count = np; this.carpet.count = nc;
      // chỉ tải lên GPU phần đang dùng (bộ đệm cỡ tối đa ~57k khóm = ~5 MB mỗi lần dựng lại)
      const up = (a, n) => markUpload(a, 0, Math.max(1, n));
      up(this.grass.instanceMatrix, nt); up(this.grass.instanceColor, nt);
      up(this.peb.instanceMatrix, np); up(this.peb.instanceColor, np);
      up(this.carpet.instanceMatrix, nc); up(this.carpet.instanceColor, nc);
      // bóng khóm cỏ (~2 ms): vẽ lại khi tâm nhìn dịch đủ xa (bản đồ bóng rộng 1280, khóm gần tâm luôn còn trong bản đồ) hoặc mặt đất đổi
      if (!this.pending && (this.covDirty || !this.covC || Math.hypot(cx - this.covC.x, cz - this.covC.z) >= 160)) {
        this.covDirty = false; this.covC = { x: cx, z: cz };
        this.splatCover(cx, cz);
      }
    }

    // Bóng khóm cỏ lên mặt đất: mỗi khóm in 1 vệt tròn mềm (cỡ theo tán lá, đậm theo chiều cao) vào bản đồ quanh tâm nhìn;
    // shader mặt đất đọc lại để làm sẫm đất dưới / sát gốc khóm (GroundShader.cover)
    splatCover(cx, cz) {
      const GC = GroundShader && GroundShader.cover;
      if (!GC) return;
      const N = COV_N, k = N / COV_SIZE, half = COV_SIZE / 2;
      if (!this.covTex) {
        this.covBuf = new Float32Array(N * N);
        this.covTex = new THREE.DataTexture(new Uint8Array(N * N), N, N, THREE.LuminanceFormat, THREE.UnsignedByteType);
        this.covTex.magFilter = this.covTex.minFilter = THREE.LinearFilter;
      }
      const d = this.covBuf, A = this.grass.instanceMatrix.array;
      d.fill(0);
      for (let n = 0; n < this.grass.count; n++) {
        const o = n * 16, dx = A[o + 12] - cx, dz = A[o + 14] - cz;
        const edge = half - 12 - Math.max(Math.abs(dx), Math.abs(dz));   // mép bản đồ về 0 (ngoài bản đồ: không bóng)
        if (edge <= 0) continue;
        const sx = Math.hypot(A[o], A[o + 1], A[o + 2]), sy = Math.hypot(A[o + 4], A[o + 5], A[o + 6]);
        // vệt gọn quanh gốc, đậm dồn vào giữa (cạnh khóm sẫm rõ, nhạt nhanh ra ngoài): vệt rộng đều thì cả cụm khóm hoà
        // thành một mảng bão hoà, đất sát gốc không khác gì bãi trống
        const r = (0.48 * sx + 1.5) * k, w = Math.min(1, 0.3 + sy / 12) * Math.min(1, edge / 60);
        const u = (dx + half) * k - 0.5, v = (dz + half) * k - 0.5;
        for (let j = Math.max(0, Math.ceil(v - r)); j <= Math.min(N - 1, Math.floor(v + r)); j++)
          for (let i = Math.max(0, Math.ceil(u - r)); i <= Math.min(N - 1, Math.floor(u + r)); i++) {
            const q = Math.hypot(i - u, j - v) / r;
            if (q >= 1) continue;
            const s = w * (1 - q) * (1 - q) * (1 + q), p = j * N + i;
            d[p] = d[p] + s - d[p] * s;
          }
      }
      const img = this.covTex.image.data;
      for (let p = 0; p < N * N; p++) img[p] = d[p] * 255;
      this.covTex.needsUpdate = true;
      GC.map.value = this.covTex;
      GC.xf.value.set(cx, cz, 1 / COV_SIZE, this.covOn ? 1 : 0);
    }
    // bật / tắt cỏ 3D (cài đặt đồ họa): tắt thì bỏ luôn bóng cỏ trên mặt đất
    show(on) {
      this.group.visible = on;
      this.covOn = on;
      if (GroundShader && GroundShader.cover && this.covTex) GroundShader.cover.xf.value.w = on ? 1 : 0;
      this.uCarpet.value.z = on && this.B.carpet ? CARPET_R : 0;
    }

    // focus: tâm vùng camera nhìn thấy trên mặt đất
    // camX/camZ (tuỳ chọn): vị trí camera -> tâm thảm cỏ ngắn lệch từ tâm nhìn về phía camera (đất ngay trước mặt
    // camera mới cần thảm cỏ; xa hơn lá cỏ ngắn nhỏ dưới 1 điểm ảnh)
    update(focusX, focusZ, camX, camZ) {
      if (this.uFocus) this.uFocus.value.set(focusX, focusZ);
      let tx = focusX, tz = focusZ;
      if (camX !== undefined) {
        const dx = focusX - camX, dz = focusZ - camZ, d = Math.hypot(dx, dz);
        // (tâm nhìn rất xa camera, vd kính ngắm: tâm thảm không ra khỏi vòng ô rải quanh tâm nhìn)
        if (d > 1) { const a = Math.max(Math.min(d * 0.5, 160), d - (RADIUS - CARPET_R - 2 * CELL)) / d; tx = camX + dx * a; tz = camZ + dz * a; }
      }
      this.uCarpet.value.x = tx; this.uCarpet.value.y = tz;
      const cx = Math.round(focusX / CELL), cz = Math.round(focusZ / CELL);
      const cMoved = !this.carpetC || Math.hypot(tx - this.carpetC.x, tz - this.carpetC.z) > CELL;
      if (cx === this.lastCx && cz === this.lastCz && !this.pending && !cMoved) return;   // pending: còn ô xa chưa rải (rebuild)
      if (cMoved) this.carpetC = { x: tx, z: tz };
      this.lastCx = cx; this.lastCz = cz;
      this.rebuild(cx * CELL, cz * CELL);
    }
  }

  return { Cover, CELL, RADIUS, shock };
})();

if (typeof window !== 'undefined') window.GroundCover = GroundCover;
