/**
 * CẢNH NỀN NGOÀI BẢN ĐỒ: địa hình nối liền mép bản đồ kéo dài tới chân trời (độ cao từ MapGen: map.outer)
 * - Vành núi bao quanh chiến trường, sườn ngoài đổ xuống bờ biển (đảo giữa biển: sông hồ / rừng rậm / đô thị),
 *   biển cát có núi bàn (sa mạc) hoặc các dãy núi nối tiếp (cao nguyên); xa nữa là đảo, núi đá vôi giữa biển
 * - Lưới không đều: sát mép bản đồ dày đúng bằng ô lưới địa hình (đỉnh ở mép trùng khít -> không hở, không gờ),
 *   ra xa thưa dần; mặt biển dùng chung shader mặt nước sông hồ
 * - Chỉ để nhìn: không va chạm, không tia dò, không đổ bóng; xa dần hòa hẳn vào sương / bầu trời trước mặt phẳng
 *   cắt xa của camera nên không lộ mép cắt
 */
const Backdrop = (() => {
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // PHỐI CẢNH KHÔNG KHÍ cho đồi núi ngoài bản đồ (xem HAZE_GLSL)
  const HAZE_GLSL = `#ifdef USE_FOG
  {
    // sương giữa chừng: chunk sương chung (sky.js — không khí xa sẫm ngả lam), y như địa hình trong bản đồ cùng cự ly
    // (sương riêng dày hơn làm rừng nền thành cục xám lam như mây). Mép tầm nhìn: mờ hẳn về màu không khí xa sẫm, khớp
    // chân dãy núi chân trời phía sau (không thành dải sáng)
    float gD = length(vViewPosition);
    vec3 gFar = fogColor * vec3(0.36, 0.42, 0.5);
    #ifdef FOG_EXP2
    gFar = mix(gFar, fogColor, smoothstep(0.0003, 0.0007, fogDensity));   // sương mù dày: mờ về đúng màu sương (không thành dải sẫm)
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gFar, smoothstep(farFade.x, farFade.y, gD));
  }
  #endif`;
  function hazeFog(sh) {
    sh.uniforms.farFade = BattleTerrain3D.FAR_FADE;
    sh.fragmentShader = 'uniform vec2 farFade;\n' + sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n' + HAZE_GLSL);
  }

  // Toạ độ một trục: [-ext, -half) thưa dần ra xa, [-half, half] đúng theo ô lưới bản đồ, (half, ext] thưa dần
  function axis(half, cell, segs, ext) {
    const outer = [];
    let p = half, st = cell;
    while (p < ext) {
      st = Math.min(p > half + 4200 ? 460 : 185, st * 1.055);   // vùng núi gần mép dày hơn để dáng núi tròn trịa
      p = ext - (p + st) < st * 0.4 ? ext : p + st;
      outer.push(p);
    }
    const a = [];
    for (let i = outer.length - 1; i >= 0; i--) a.push(-outer[i]);
    for (let i = 0; i <= segs; i++) a.push(i === segs ? half : -half + i * cell);
    for (const v of outer) a.push(v);
    return { a, n0: outer.length };
  }

  // Độ cao lấy mẫu theo bước st dọc trục dày (alongX: trục x), nội suy tuyến tính giữa 2 mẫu
  function isoSample(fn, x, z, half, st, cell, alongX) {
    if (st < cell * 1.5) return fn(x, z);
    // bước làm tròn về lũy thừa 2 của ô bản đồ: các cột cùng bậc dùng chung mạng điểm mẫu, mạng bậc thô nằm gọn
    // trong mạng bậc mịn -> các cột cạnh nhau khớp nhau (không lệch thành vệt)
    st = cell * Math.pow(2, Math.round(Math.log2(st / cell)));
    const u = alongX ? x : z, u0 = -half + Math.floor((u + half) / st) * st, t = (u - u0) / st;
    const a = alongX ? fn(u0, z) : fn(x, u0), b = alongX ? fn(u0 + st, z) : fn(x, u0 + st);
    return a + (b - a) * t;
  }

  // Sắc vertex color phủ lên shader mặt đất: rừng xa (mảng xanh đậm), vân đá núi bàn, đỉnh núi đá sáng
  const TINT = {
    DESERT: null,
    URBAN: { forest: [0.56, 0.64, 0.5], density: 0.9 },   // (đồi ngoài phố ngả xanh cỏ: GroundShader, nền đô thị)
    JUNGLE: { forest: [0.42, 0.55, 0.38], density: 1.0 },
    HIGHLAND: { forest: [0.46, 0.53, 0.42], density: 0.8, treeline: 430 },
    RIVER_LAKE: { forest: [0.5, 0.6, 0.42], density: 0.9 }
  };

  // RỪNG XA TRANG TRÍ phủ vành núi & đồi ngoài bản đồ (cây thật của bản đồ chỉ mọc trong vùng chiến đấu):
  // mỗi khóm là một khối tán cây đơn giản (cây lá rộng) hoặc chóp thông, rải theo đúng mặt nạ mảng rừng
  // của vertex color cảnh nền; chỉ mọc ngoài tầm xe chạy tới, không va chạm / không chặn đạn / không đổ bóng.
  const FOREST = {
    JUNGLE: { pow: 0.3, r: [18, 28], squash: 0.75 },
    RIVER_LAKE: { pow: 1.0, r: [13, 21], squash: 0.8, conif: 0.3 },
    URBAN: { pow: 0.7, r: [12, 19], squash: 0.8, conif: 0.22 },
    HIGHLAND: { pow: 1.1, pine: true, r: [8, 12], hgt: [26, 40], treeline: 430 }
  };
  const SP = 50;   // bước lưới rải khóm cây
  // cây xa giả trong vùng chơi: ẩn khi camera cách gốc < FAR_TREE_NEAR + (0..450, ngẫu nhiên theo cây)
  const FAR_TREE_NEAR = 950;
  // Tán lá rộng nhìn xa: 9 búp lá nhỏ lồi lõm mạnh (kiểu súp lơ) xếp thành vòm méo lệch, búp trên nhỏ dần -> viền tán lởm
  // chởm, không thành quả cầu nhẵn; gốc tán tối (bóng tán)
  function clumpGeometry() {
    const rng = MapGen.mulberry32(0x51ab), pos = [], nrm = [], col = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const lobes = [[0, 0.25, 0, 0.62], [0.5, -0.05, 0.2, 0.5], [-0.45, 0, 0.35, 0.5], [0.05, -0.08, -0.55, 0.52], [-0.4, 0.02, -0.35, 0.45],
      [0.45, 0.05, -0.38, 0.44], [0.2, 0.5, 0.15, 0.42], [-0.22, 0.48, -0.12, 0.4], [0.05, 0.75, 0.02, 0.3]];
    for (const [ox, oy, oz, r] of lobes) {
      const g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position;
      // cùng một đỉnh (trùng toạ độ) nhận cùng độ lồi lõm -> khối kín, không nứt
      const bump = new Map();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
        if (!bump.has(key)) bump.set(key, 0.62 + rng() * 0.62);
        const k = bump.get(key);
        n.copy(v).normalize();
        const y = oy + v.y * r * k * 0.9;
        pos.push(ox + v.x * r * k, y, oz + v.z * r * k);
        nrm.push(n.x, n.y, n.z);
        const ao = 0.4 + 0.6 * Math.max(0, Math.min(1, (y + 0.6) / 1.4));
        col.push(ao, ao, ao);
      }
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  // Cây thông: 3 tầng chóp 5 cạnh chồng lên nhau thon dần (viền răng cưa), gốc tầng dưới tối. Nhìn từ >1 km chỉ còn vài
  // điểm ảnh -> ít đỉnh (36) là đủ; hàng chục nghìn cây mỗi khung
  function pineGeometry() {
    const parts = [[0.1, 0.5, 1.0], [0.42, 0.42, 0.7], [0.7, 0.34, 0.4]];
    const pos = [], nrm = [], col = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    // (dựng tay từng tam giác: ConeGeometry có bảng chỉ mục — đọc đỉnh theo thứ tự thô thì tam giác ghép sai thành
    // mảnh dẹt nằm sát đất, cả rừng thông nền thành vụn mảnh)
    const S = 5;
    for (const [y0, hgt, r] of parts) {
      const ny = r / hgt, top = y0 + hgt;
      for (let k = 0; k < S; k++) {
        const a0 = k / S * Math.PI * 2, a1 = (k + 1) / S * Math.PI * 2, am = (a0 + a1) / 2;
        for (const [x, y, z, a] of [[0, top, 0, am], [Math.cos(a1) * r, y0, Math.sin(a1) * r, a1], [Math.cos(a0) * r, y0, Math.sin(a0) * r, a0]]) {
          n.set(Math.cos(a), ny, Math.sin(a)).normalize();
          pos.push(x, y, z); nrm.push(n.x, n.y, n.z);
          const ao = 0.5 + 0.5 * Math.min(1, y);
          col.push(ao, ao, ao);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }

  function buildForest(T, O, nz, seaLvl, meshH) {
    const isLab = (T.map && T.map.testField) || (typeof window !== 'undefined' && (window.RANGE_LAB || window.STRONGHOLD_LAB || window.FREECAM_LAB || (window.location && window.location.search && window.location.search.includes('lab='))));
    if (isLab) return null;
    const F = FOREST[T.mapType];
    if (!F) return null;
    const rnd = MapGen.mulberry32((T.seed ^ 0x3a7f11) >>> 0);
    const ext = T.width / 2 + 5200, mats = [], cols = [], matsC = [], colsC = [], matsN = [], colsN = [];
    const leaf = T.leafColors ? T.leafColors() : [0x4a5632, 0x58643a];
    const c0 = new THREE.Color(leaf[0]), c1 = new THREE.Color(leaf[1]), c = new THREE.Color();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const H = meshH;
    // MẶT NẠ RỪNG (GroundShader.cover.forest): mỗi cây chấm vào lưới FN² phủ [-ext, ext] -> mặt đất dưới đám rừng vẽ nền
    // rừng sẫm + lốm đốm ngọn cây nổi khối: đám rừng xa liền tán như thật mà không cần đủ từng cây
    const FN = 512, fac = new Float32Array(FN * FN), fk = FN / (2 * ext);
    const splat = (x, z, w) => {
      const i = Math.floor((x + ext) * fk), j = Math.floor((z + ext) * fk);
      if (i >= 0 && j >= 0 && i < FN && j < FN) fac[j * FN + i] += w;
    };
    for (let z = -ext; z <= ext; z += SP) for (let x = -ext; x <= ext; x += SP) {
      const px = x + (rnd() - 0.5) * SP * 0.9, pz = z + (rnd() - 0.5) * SP * 0.9, r1 = rnd(), r2 = rnd(), r3 = rnd();
      // ngoài tầm xe (xe bị giữ trong ±(nửa bản đồ - 60), lòng thung lũng kết thúc ở chân vành núi MapGen rimFoot)
      // bìa rừng theo chân vành núi, lượn sóng; từng đoạn dài lùi hẳn lên sườn (trảng cỏ, sườn trọc) -> bìa rừng không
      // thành một vành tròn đều ôm quanh lòng thung lũng
      const fb = MapGen.fbm(nz, px * 0.0004 - 7, pz * 0.0004 + 3, 2), back = 700 * Math.max(0, Math.min(1, (fb + 0.05) / 0.3));
      if (Math.hypot(px, pz) < O.rimFoot(px, pz) - 50 + 90 * nz(px * 0.0016 + 4, pz * 0.0016) + back) continue;
      let fm = smooth(-0.08, 0.28, MapGen.fbm(nz, px * 0.0024, pz * 0.0024, 3));
      // rừng thông: mọc thành từng đám rừng kín (lõi dày đặc, bìa thưa dần) xen trảng cỏ trống, không rắc đều từng cây
      if (F.pine) fm = smooth(-0.05, 0.25, MapGen.fbm(nz, px * 0.0016 + 2.2, pz * 0.0016 - 4.4, 3) + 0.35 * (nz(px * 0.006, pz * 0.006 + 9) - 0.2));
      if (r1 > Math.pow(fm, F.pow)) continue;
      const h = H(px, pz);
      if (seaLvl !== null && h < seaLvl + 7) continue;
      if (F.treeline && h > F.treeline + (r2 - 0.5) * 120) continue;
      const e = 8, gx = (H(px + e, pz) - H(px - e, pz)) / (2 * e), gz = (H(px, pz + e) - H(px, pz - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 0.9) continue;
      // cây thật dồn về sườn vành gần bản đồ (thấy rõ dáng); càng xa càng thưa — ở đó tán rừng liền do mặt đất vẽ
      // (bản đồ mặt nạ rừng splat bên dưới), từng cây chỉ còn 1-2 điểm ảnh
      const dOut = Math.max(Math.abs(px), Math.abs(pz)) - T.width / 2;
      if (rnd() > 1 - 0.85 * smooth(1200, 4500, dOut)) { splat(px, pz, 0.5 * fm); continue; }
      // cỡ cây chênh nhau nhiều (cây non / cây cổ thụ), không đều tăm tắp
      const rr = (F.r[0] + (F.r[1] - F.r[0]) * r2) * (0.65 + 0.7 * rnd());
      // rừng hỗn giao: một phần là cây lá kim nhọn vượt lên trên tán lá rộng
      const conif = F.pine || (F.conif && rnd() < F.conif);
      if (F.pine) { sc.set(rr, F.hgt[0] + (F.hgt[1] - F.hgt[0]) * r3, rr); p.set(px, h - 1, pz); }
      else if (conif) { sc.set(rr * 0.55, rr * (2.2 + 0.8 * r3), rr * 0.55); p.set(px, h - 1, pz); }
      else {
        // lõi mảng rừng: tán to chồng lên nhau thành mảng rừng liền tán; bìa rừng: khóm nhỏ rời
        const big = rr * (0.75 + 0.95 * fm);
        sc.set(big, big * F.squash * (0.85 + 0.3 * r3), big * (0.85 + 0.3 * r1)); p.set(px, h + sc.y * 0.3, pz);
      }
      q.setFromAxisAngle(up, r3 * 6.283);
      m4.compose(p, q, sc);
      splat(px, pz, 0.45);
      // tán lá dày tự che khuất nhau: tối hơn màu lá gốc; lá kim sẫm & ngả lam hơn
      c.copy(c0).lerp(c1, r2).multiplyScalar(0.5 + 0.25 * r3);
      if (F.pine) { c.multiplyScalar(0.68); c.b *= 1.08; }   // lá kim sẫm ngả lam (rừng thông xa đen sẫm như ảnh thật)
      if (conif && !F.pine) { c.multiplyScalar(0.72); c.b *= 1.12; matsC.push(m4.clone()); colsC.push(c.r, c.g, c.b); }
      else { mats.push(m4.clone()); cols.push(c.r, c.g, c.b); }
      // lõi đám thông: thêm 1-4 cây sát quanh (tán khép kín, cây cao thấp chen nhau), bìa đám chỉ cây lẻ
      if (F.pine) for (let t = 0, nt = Math.floor(fm * fm * 4.5); t < nt; t++) {
        const a = rnd() * 6.283, dd = 9 + rnd() * SP * 0.45, qx = px + Math.cos(a) * dd, qz = pz + Math.sin(a) * dd, qh = H(qx, qz);
        if (F.treeline && qh > F.treeline + (r2 - 0.5) * 120) continue;
        const rq = (F.r[0] + (F.r[1] - F.r[0]) * rnd()) * (0.6 + 0.6 * rnd());
        sc.set(rq, (F.hgt[0] + (F.hgt[1] - F.hgt[0]) * rnd()) * (0.6 + 0.5 * rnd()), rq); p.set(qx, qh - 1, qz);
        q.setFromAxisAngle(up, rnd() * 6.283);
        m4.compose(p, q, sc);
        mats.push(m4.clone());
        splat(qx, qz, 0.3);
        c.copy(c0).lerp(c1, rnd()).multiplyScalar(0.3 + 0.2 * rnd());
        cols.push(c.r, c.g * 1.02, c.b * 1.08);
      }
    }
    if (!mats.length && !matsC.length) return null;
    if (typeof GroundShader !== 'undefined' && GroundShader.cover.forest) {
      // cây thật trong bản đồ cũng chấm vào mặt nạ: đám rừng trên đồi trong vùng chơi nhìn từ xa liền tán, sần sùi
      for (const t of (T.map && T.map.trees) || []) if (t.kind !== 'deadTree' && t.kind !== 'cactus') splat(t.x, t.z, 0.4);
      // ĐỒI TRONG VÙNG CHƠI: mảng rừng phủ sườn đồi (chỉ hình ảnh ở xa — shader tắt dần khi lại gần, cây thật mới chặn đạn):
      // ưa sườn dốc, giữa đồi; lòng thung lũng phẳng & đỉnh trọc thưa
      if (F.pine || F.conif) {
        const half = T.width / 2, st = 2 * ext / FN, wet = T.hasWater && T.hasWater();
        for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
          const x = -ext + (i + 0.5) * st, z = -ext + (j + 0.5) * st;
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          const h = H(x, z);
          if (wet && T.getElevationAt(x, z) < T.waterLevel + 1.5) continue;
          if (seaLvl !== null && h < seaLvl + 7) continue;
          if (F.treeline && h > F.treeline) continue;
          const g = Math.hypot(H(x + st, z) - H(x - st, z), H(x, z + st) - H(x, z - st)) / (2 * st);
          const m = MapGen.fbm(nz, x * 0.0011 + 5.1, z * 0.0011 - 2.3, 3) + 0.3 * (nz(x * 0.004, z * 0.004 + 3) - 0.5) + Math.min(0.35, g * 1.4);
          const fw = smooth(0.12, 0.38, m);
          fac[j * FN + i] += 0.9 * fw;
          // CÂY XA GIẢ (chỉ rừng thông): 2-5 cây mỗi ô (lõi mảng rừng) theo độ đậm mảng rừng -> sống đồi xa có răng cưa ngọn thông.
          // Không va chạm; vertex shader thu nhỏ về 0 khi camera trong ~1 km (lại gần chỉ còn cây thật)
          if (F.pine && fw > 0.35) {
            const gh = T.getElevationAt ? (px, pz) => T.getElevationAt(px, pz) : H;
            // đám cây chụm quanh 1 tâm trong ô (không rắc lẻ tẻ khắp ô); bìa mảng rừng (mật độ thấp) bỏ hẳn, không cây lẻ
            const nt = Math.round(fw * fw * 4.5 + rnd() * 0.5);
            const gx0 = x + (rnd() - 0.5) * st * 0.5, gz0 = z + (rnd() - 0.5) * st * 0.5;
            for (let t = 0; nt >= 2 && t < nt; t++) {
              const qx = gx0 + (rnd() - 0.5) * st * 0.55, qz = gz0 + (rnd() - 0.5) * st * 0.55, qh = gh(qx, qz);
              if (F.treeline && qh > F.treeline + (rnd() - 0.5) * 120) continue;
              if (wet && qh < T.waterLevel + 1.5) continue;   // không mọc giữa hồ / suối
              const rq = (F.r[0] + (F.r[1] - F.r[0]) * rnd()) * (0.75 + 0.6 * rnd());
              sc.set(rq, (F.hgt[0] + (F.hgt[1] - F.hgt[0]) * rnd()) * (0.75 + 0.5 * rnd()), rq); p.set(qx, qh - 1, qz);
              q.setFromAxisAngle(up, rnd() * 6.283);
              m4.compose(p, q, sc);
              matsN.push(m4.clone());
              c.copy(c0).lerp(c1, rnd()).multiplyScalar(0.3 + 0.2 * rnd());
              colsN.push(c.r, c.g * 1.02, c.b * 1.08);
            }
          }
        }
      }
      // làm mềm 2 lượt 3x3 -> mép đám rừng lượn tự nhiên, không lộ ô lưới
      let a = fac, b = new Float32Array(FN * FN);
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
          let sum = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = Math.min(FN - 1, Math.max(0, i + di)), jj = Math.min(FN - 1, Math.max(0, j + dj));
            sum += a[jj * FN + ii];
          }
          b[j * FN + i] = sum / 9;
        }
        const t = a; a = b; b = t;
      }
      const px8 = new Uint8Array(FN * FN);
      for (let k = 0; k < FN * FN; k++) px8[k] = Math.min(255, a[k] * 1.6 * 255);
      const tex = new THREE.DataTexture(px8, FN, FN, THREE.LuminanceFormat);
      tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
      const U = GroundShader.cover.forest;
      if (U.map.value && U.map.value.dispose) U.map.value.dispose();
      U.map.value = tex; U.xf.value.set(ext, 1 / (2 * ext), 1, 0);
    }
    // vân chùm lá trên tán: đốm sáng (chùm lá đón nắng) / tối (kẽ lá) theo toạ độ thế giới, mờ dần khi nhỏ hơn điểm ảnh
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      // pháp tuyến tán ngả lên trời: khối tán xa đổ bóng như mặt rừng gồ ghề, không thành từng cục bông tròn sáng viền
      sh.vertexShader = 'varying vec3 vFw;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.5));`).replace('#include <begin_vertex>', `#include <begin_vertex>
        vFw =(modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = `varying vec3 vFw;
float fHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fHash(i), fHash(i + vec3(1, 0, 0)), f.x), mix(fHash(i + vec3(0, 1, 0)), fHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fHash(i + vec3(0, 0, 1)), fHash(i + vec3(1, 0, 1)), f.x), mix(fHash(i + vec3(0, 1, 1)), fHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float pw = length(fwidth(vFw));
          float lv = fNoise(vFw * 0.32) * 0.6 + fNoise(vFw * 0.8 + 3.1) * 0.4;
          diffuseColor.rgb *= mix(1.0, 0.68 + 0.6 * lv, 1.0 - smoothstep(1.5, 5.0, pw));
        }`);
      hazeFog(sh);
    };
    mat.customProgramCacheKey = () => 'backdropForest4';
    const mk = (geo, list, cl, name) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cl), 3);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = name;
      mesh.frustumCulled = false;
      return mesh;
    };
    const grp = new THREE.Group();
    grp.name = 'backdropForest';
    if (mats.length) grp.add(mk(F.pine ? pineGeometry() : clumpGeometry(), mats, cols, 'backdropForestA'));
    if (matsC.length) grp.add(mk(pineGeometry(), matsC, colsC, 'backdropForestC'));
    if (matsN.length) {
      // cây xa giả trong vùng chơi: cùng vật liệu + thu nhỏ theo khoảng cách ngang tới camera (gốc cây đứng yên)
      const matN = mat.clone();
      matN.onBeforeCompile = (sh, r) => {
        mat.onBeforeCompile(sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // mỗi cây một ngưỡng ẩn riêng (950-1400) & tắt gọn trong 40 đv: không còn dải cây co nhỏ trông như cây non lẻ tẻ
          vec3 tIp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float tTh = ${FAR_TREE_NEAR.toFixed(1)} + 450.0 * fract(sin(dot(tIp.xz, vec2(12.9898, 78.233))) * 43758.5453);
          transformed *= smoothstep(tTh, tTh + 40.0, length(tIp.xz - cameraPosition.xz));
        }`);
      };
      matN.customProgramCacheKey = () => 'backdropForestFar2';
      const mN = mk(pineGeometry(), matsN, colsN, 'backdropForestFar');
      mN.material = matN;
      grp.add(mN);
    }
    return grp;
  }

  function build(T) {
    const O = T.map && T.map.outer;
    if (!O || typeof THREE === 'undefined') return null;
    const half = T.width / 2, S = T.segments, NG = S + 1, cell = T.width / S;
    const { a: ax, n0 } = axis(half, cell, S, O.ext);
    const NA = ax.length;
    const inner = i => i >= n0 && i <= n0 + S;
    const seaLvl = O.sea ? O.seaLevel : null;

    // lấy mẫu một hàm (độ cao, mặt nạ rừng...) tại nút (i, j): ở dải lưới dọc cạnh bản đồ (một chiều dày, chiều kia thưa)
    // lấy theo bước thưa ở cả hai chiều rồi nội suy -> không thành vệt sọc dọc trục
    const iso = (fn, i, j) => {
      const x = ax[i], z = ax[j];
      if (inner(i) && !inner(j) && j > 0 && j < NA - 1) return isoSample(fn, x, z, half, Math.max(ax[j + 1] - ax[j], ax[j] - ax[j - 1]), cell, true);
      if (inner(j) && !inner(i) && i > 0 && i < NA - 1) return isoSample(fn, x, z, half, Math.max(ax[i + 1] - ax[i], ax[i] - ax[i - 1]), cell, false);
      return fn(x, z);
    };
    // số ô bản đồ trong một bước lấy mẫu thưa của dải có nút thưa idx (khớp isoSample)
    const isoK = (idx) => {
      if (idx <= 0 || idx >= NA - 1) return 1;
      const st = Math.max(ax[idx + 1] - ax[idx], ax[idx] - ax[idx - 1]);
      return st < cell * 1.5 ? 1 : Math.pow(2, Math.round(Math.log2(st / cell)));
    };
    // 1. ĐỘ CAO mọi nút lưới (trong bản đồ lấy đúng lưới địa hình -> pháp tuyến ở mép tính liền mạch)
    const H = new Float32Array(NA * NA);
    const edgeDelta = new Map();
    for (let j = 0; j < NA; j++) {
      const z = ax[j];
      for (let i = 0; i < NA; i++) {
        const x = ax[i];
        if (inner(i) && inner(j)) { H[j * NA + i] = T.heightData[(j - n0) * NG + (i - n0)]; continue; }
        // chỗ lưới địa hình đã bị sửa sát mép (nếu có): chênh lệch ở mép mờ dần ra ngoài
        const ci = Math.max(n0, Math.min(n0 + S, i)), cj = Math.max(n0, Math.min(n0 + S, j));
        const key = cj * NA + ci;
        let dl = edgeDelta.get(key);
        if (dl === undefined) { dl = T.heightData[(cj - n0) * NG + (ci - n0)] - O.heightAt(ax[ci], ax[cj]); edgeDelta.set(key, dl); }
        const dOut = Math.hypot(x - ax[ci], z - ax[cj]);
        // dải lưới thẳng ra từ cạnh bản đồ: một chiều dày (theo ô bản đồ), chiều kia thưa -> lấy mẫu độ cao theo
        // bước thưa ở cả hai chiều rồi nội suy (không thành vệt sọc dọc trục)
        H[j * NA + i] = iso(O.heightAt, i, j) + dl * (1 - smooth(0, 400, dOut));
      }
    }

    // 2. ĐỈNH: chỉ các nút trên mép hoặc ngoài bản đồ
    const idx = new Int32Array(NA * NA).fill(-1);
    let nv = 0;
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) {
      if (inner(i) && inner(j) && i > n0 && i < n0 + S && j > n0 && j < n0 + S) continue;
      idx[j * NA + i] = nv++;
    }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const dep = O.sea ? new Float32Array(nv) : null;
    const rng = MapGen.mulberry32((T.seed ^ 0x7f0e57) >>> 0), nz = MapGen.makeNoise(rng);
    const tint = TINT[T.mapType] || null;
    const forestN = (x, z) => MapGen.fbm(nz, x * 0.0024, z * 0.0024, 3);
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) {
      const v = idx[j * NA + i];
      if (v < 0) continue;
      const x = ax[i], z = ax[j], h = H[j * NA + i];
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      // pháp tuyến: sai phân trung tâm trên lưới không đều
      // dải dọc cạnh bản đồ: độ cao tuyến tính từng khúc theo bước thưa -> sai phân trên cùng bước đó cho pháp tuyến mượt
      // (sai phân 1 ô làm sáng tối đổi đột ngột ở mỗi điểm mẫu thành vệt sọc)
      const kx = inner(i) && !inner(j) ? isoK(j) : 1, kz = inner(j) && !inner(i) ? isoK(i) : 1;
      const i0 = Math.max(0, i - kx), i1 = Math.min(NA - 1, i + kx), j0 = Math.max(0, j - kz), j1 = Math.min(NA - 1, j + kz);
      const dx = (H[j * NA + i1] - H[j * NA + i0]) / (ax[i1] - ax[i0]), dz = (H[j1 * NA + i] - H[j0 * NA + i]) / (ax[j1] - ax[j0]);
      const l = Math.hypot(dx, 1, dz);
      nrm[v * 3] = -dx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -dz / l;
      // uv bám mép bản đồ: sắc tầng lớn ở mép kéo dài ra (shader tự làm trung tính dần ngoài bản đồ)
      uv[v * 2] = 0.5 + x / T.width;
      uv[v * 2 + 1] = 0.5 - z / T.depth;
      const dOut = Math.hypot(x - Math.max(-half, Math.min(half, x)), z - Math.max(-half, Math.min(half, z)));
      const k = smooth(150, 700, dOut);   // sát mép giữ đúng màu mặt đất trong bản đồ
      let r = 1, g = 1, b = 1;
      const slope = 1 - 1 / l;
      if (tint) {
        let f = smooth(-0.08, 0.28, iso(forestN, i, j)) * (1 - smooth(0.42, 0.7, slope)) * tint.density * k;
        if (seaLvl !== null) f *= smooth(seaLvl + 4, seaLvl + 14, h);
        if (tint.treeline) f *= 1 - smooth(tint.treeline - 80, tint.treeline + 60, h);
        r = 1 + (tint.forest[0] - 1) * f; g = 1 + (tint.forest[1] - 1) * f; b = 1 + (tint.forest[2] - 1) * f;
      }
      if (T.mapType === 'DESERT') {
        // vách núi bàn: vân đá trầm tích theo độ cao, đỉnh cao ngả đỏ gạch
        const band = 1 + 0.1 * Math.sin(h * 0.11 + nz(x * 0.003, z * 0.003) * 1.5) * smooth(0.3, 0.6, slope);
        const red = smooth(70, 190, h) * k;
        r = (1 + 0.08 * red) * (1 + (band - 1) * k); g = (1 - 0.04 * red) * (1 + (band - 1) * k); b = (1 - 0.12 * red) * (1 + (band - 1) * k);
      }
      if (T.mapType === 'HIGHLAND') {
        // sườn dốc lộ đá granite xám sáng, đỉnh cao có vệt đá sáng / tuyết đọng lốm đốm
        const rockK = smooth(0.3, 0.6, slope) * k;
        r = r * (1 - 0.15 * rockK) + 0.12 * rockK; g = g * (1 - 0.15 * rockK) + 0.12 * rockK; b = b * (1 - 0.1 * rockK) + 0.14 * rockK;
        const sn = smooth(500, 720, h + nz(x * 0.004, z * 0.004) * 60) * (1 - smooth(0.55, 0.85, slope) * 0.5);
        r += (1.45 - r) * sn; g += (1.45 - g) * sn; b += (1.55 - b) * sn;
      }
      if (seaLvl !== null) {
        // bãi biển: cát sáng, ấm hơn cát phù sa ven sông
        const bc = smooth(-2, 0.5, h - seaLvl) * (1 - smooth(3.5, 6, h - seaLvl)) * k;
        r *= 1 + 0.34 * bc; g *= 1 + 0.3 * bc; b *= 1 + 0.2 * bc;
      }
      if (seaLvl !== null && h < seaLvl) { const w = smooth(0, 10, seaLvl - h); r *= 1 - 0.25 * w; g *= 1 - 0.2 * w; b *= 1 - 0.15 * w; }
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b;
      if (dep) dep[v] = seaLvl - h;
    }

    // 3. TAM GIÁC: bỏ các ô nằm trong bản đồ; mặt biển chỉ ở ô có nước
    const tri = [], triSea = [];
    for (let j = 0; j < NA - 1; j++) for (let i = 0; i < NA - 1; i++) {
      if (i >= n0 && i + 1 <= n0 + S && j >= n0 && j + 1 <= n0 + S) continue;
      const a = idx[j * NA + i], b = idx[j * NA + i + 1], c = idx[(j + 1) * NA + i], d = idx[(j + 1) * NA + i + 1];
      tri.push(a, c, b, b, c, d);
      if (dep && Math.max(dep[a], dep[b], dep[c], dep[d]) > -3) triSea.push(a, c, b, b, c, d);
    }

    const group = new THREE.Group();
    group.name = 'backdrop';
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({ map: T.groundTexture, vertexColors: true, roughness: T.mapType === 'URBAN' ? 0.82 : 0.95, metalness: 0.0 });
    if (typeof GroundShader !== 'undefined') {
      // biển: dải cát rộng hơn ven sông (bãi biển cao tới ~4 đơn vị trên mặt nước)
      GroundShader.apply(mat, { mapType: T.mapType, macroCanvas: T.groundCanvas, water: O.sea || (T.hasWater ? T.hasWater() : !!(T.map.river || T.map.lakes.length)), waterLvl: O.sea ? 3.0 : undefined, terrain: T, ownNormals: true });
      const base = mat.onBeforeCompile, key = mat.customProgramCacheKey;
      mat.onBeforeCompile = (sh, r) => {
        base(sh, r);
        hazeFog(sh);
      };
      mat.customProgramCacheKey = () => key() + ':haze';
    } else {
      mat.map = null;
      mat.color.setHex(T.atmosphere ? T.atmosphere.ground : 0x806a50);
    }
    const land = new THREE.Mesh(geo, mat);
    land.name = 'backdropLand';
    land.receiveShadow = true;
    group.add(land);

    let sea = null;
    if (dep && triSea.length) {
      const sg = new THREE.BufferGeometry();
      const sp = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) { sp[v * 3] = pos[v * 3]; sp[v * 3 + 2] = pos[v * 3 + 2]; }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const up = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) up[v * 3 + 1] = 1;
      sg.setAttribute('normal', new THREE.BufferAttribute(up, 3));
      sg.setAttribute('aDep', new THREE.BufferAttribute(dep, 1));
      sg.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(triSea, 1) : new THREE.Uint16BufferAttribute(triSea, 1));
      sg.computeBoundingSphere();
      sea = new THREE.Mesh(sg, T.waterMaterial(true).mat);
      sea.name = 'backdropSea';
      sea.position.y = seaLvl;
      sea.renderOrder = 2;
      group.add(sea);
    }
    // độ cao đúng mặt lưới cảnh nền (nội suy song tuyến trên lưới không đều) -> cây đứng sát mặt đất nhìn thấy
    const findCell = (v) => { let lo = 0, hi = NA - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ax[m] <= v) lo = m; else hi = m; } return lo; };
    const meshH = (x, z) => {
      const i = findCell(x), j = findCell(z), tx = (x - ax[i]) / (ax[i + 1] - ax[i]), tz = (z - ax[j]) / (ax[j + 1] - ax[j]);
      const a = H[j * NA + i], b = H[j * NA + i + 1], c = H[(j + 1) * NA + i], d = H[(j + 1) * NA + i + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };
    const forest = buildForest(T, O, nz, seaLvl, meshH);
    if (forest) group.add(forest);
    group.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    return { group, land, sea, forest, verts: nv };
  }

  return { build };
})();

if (typeof window !== 'undefined') window.Backdrop = Backdrop;
