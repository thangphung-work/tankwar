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

  // Toạ độ một trục: [-ext, -half) thưa dần ra xa, [-half, half] đúng theo ô lưới bản đồ, (half, ext] thưa dần
  function axis(half, cell, segs, ext) {
    const outer = [];
    let p = half, st = cell;
    while (p < ext) {
      st = Math.min(p > 8000 ? 600 : 260, st * 1.085);   // ngoài ~8000 đã chìm trong sương: lưới thưa hơn
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
    RIVER_LAKE: { pow: 1.0, r: [13, 21], squash: 0.8 },
    URBAN: { pow: 0.7, r: [12, 19], squash: 0.8 },
    HIGHLAND: { pow: 1.6, pine: true, r: [8, 12], hgt: [26, 40], treeline: 430 }
  };
  const SP = 50;   // bước lưới rải khóm cây
  // Khóm tán lá rộng: 4 khối tròn méo chồng lên nhau (u lồi lõm, không phải quả cầu nhẵn), gốc tối (bóng tán)
  function clumpGeometry() {
    const rng = MapGen.mulberry32(0x51ab), pos = [], nrm = [], col = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const lobes = [[0, 0.1, 0, 1], [0.55, -0.1, 0.25, 0.7], [-0.45, -0.05, 0.4, 0.68], [0.05, -0.12, -0.6, 0.66]];
    for (const [ox, oy, oz, r] of lobes) {
      const g = new THREE.IcosahedronGeometry(1, 0), P = g.attributes.position;
      // cùng một đỉnh (trùng toạ độ) nhận cùng độ lồi lõm -> khối kín, không nứt
      const bump = new Map();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
        if (!bump.has(key)) bump.set(key, 0.82 + rng() * 0.32);
        const k = bump.get(key);
        n.copy(v).normalize();
        pos.push(ox + v.x * r * k, oy + v.y * r * k * 0.85, oz + v.z * r * k);
        nrm.push(n.x, n.y, n.z);
        const ao = 0.45 + 0.55 * Math.max(0, Math.min(1, (oy + v.y * r * 0.85 + 0.7) / 1.5));
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
  // Cây thông: 2 tầng chóp chồng lên nhau, gốc tầng dưới tối
  function pineGeometry() {
    const parts = [[0.15, 0.62, 1.0], [0.5, 0.5, 0.68]];
    const pos = [], nrm = [], col = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (const [y0, hgt, r] of parts) {
      const g = new THREE.ConeGeometry(r, hgt, 7, 1, true);
      g.translate(0, y0 + hgt / 2, 0);
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
        pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z);
        const ao = 0.5 + 0.5 * Math.min(1, v.y);
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

  function buildForest(T, O, nz, seaLvl, meshH) {
    const F = FOREST[T.mapType];
    if (!F) return null;
    const rnd = MapGen.mulberry32((T.seed ^ 0x3a7f11) >>> 0);
    const ext = T.width / 2 + 5200, mats = [], cols = [];
    const leaf = T.leafColors ? T.leafColors() : [0x4a5632, 0x58643a];
    const c0 = new THREE.Color(leaf[0]), c1 = new THREE.Color(leaf[1]), c = new THREE.Color();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const H = meshH;
    for (let z = -ext; z <= ext; z += SP) for (let x = -ext; x <= ext; x += SP) {
      const px = x + (rnd() - 0.5) * SP * 0.9, pz = z + (rnd() - 0.5) * SP * 0.9, r1 = rnd(), r2 = rnd(), r3 = rnd();
      // ngoài tầm xe (xe bị giữ trong ±(nửa bản đồ - 60), lòng thung lũng kết thúc ở chân vành núi MapGen rimFoot)
      // bìa rừng theo chân vành núi, lượn sóng
      if (Math.hypot(px, pz) < O.rimFoot(px, pz) + 206 + 130 * nz(px * 0.0016 + 4, pz * 0.0016)) continue;
      const fm = smooth(-0.08, 0.28, MapGen.fbm(nz, px * 0.0024, pz * 0.0024, 3));
      if (r1 > Math.pow(fm, F.pow)) continue;
      const h = H(px, pz);
      if (seaLvl !== null && h < seaLvl + 7) continue;
      if (F.treeline && h > F.treeline + (r2 - 0.5) * 120) continue;
      const e = 8, gx = (H(px + e, pz) - H(px - e, pz)) / (2 * e), gz = (H(px, pz + e) - H(px, pz - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 0.9) continue;
      const rr = F.r[0] + (F.r[1] - F.r[0]) * r2;
      if (F.pine) { sc.set(rr, F.hgt[0] + (F.hgt[1] - F.hgt[0]) * r3, rr); p.set(px, h - 1, pz); }
      else { sc.set(rr, rr * F.squash * (0.85 + 0.3 * r3), rr * (0.85 + 0.3 * r1)); p.set(px, h + sc.y * 0.35, pz); }
      q.setFromAxisAngle(up, r3 * 6.283);
      m4.compose(p, q, sc);
      mats.push(m4.clone());
      // tán lá dày tự che khuất nhau: tối hơn màu lá gốc
      c.copy(c0).lerp(c1, r2).multiplyScalar(0.5 + 0.25 * r3);
      cols.push(c.r, c.g, c.b);
    }
    if (!mats.length) return null;
    const geo = F.pine ? pineGeometry() : clumpGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });
    mat.onBeforeCompile = (sh) => BattleTerrain3D.applyFarFade(sh, false);
    mat.customProgramCacheKey = () => 'backdropForest';
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    for (let i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols), 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'backdropForest';
    mesh.frustumCulled = false;
    return mesh;
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
      uv[v * 2] = 0.5 + Math.max(-half, Math.min(half, x)) / T.width;
      uv[v * 2 + 1] = 0.5 - Math.max(-half, Math.min(half, z)) / T.depth;
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
        // đỉnh núi cao: đá sáng / tuyết đọng lốm đốm
        const sn = smooth(560, 760, h + nz(x * 0.004, z * 0.004) * 60) * (1 - smooth(0.55, 0.85, slope) * 0.6);
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
        BattleTerrain3D.applyFarFade(sh, false);
      };
      mat.customProgramCacheKey = () => key() + ':far';
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
