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
      st = Math.min(260, st * 1.085);
      p = ext - (p + st) < st * 0.4 ? ext : p + st;
      outer.push(p);
    }
    const a = [];
    for (let i = outer.length - 1; i >= 0; i--) a.push(-outer[i]);
    for (let i = 0; i <= segs; i++) a.push(i === segs ? half : -half + i * cell);
    for (const v of outer) a.push(v);
    return { a, n0: outer.length };
  }

  // Sắc vertex color phủ lên shader mặt đất: rừng xa (mảng xanh đậm), vân đá núi bàn, đỉnh núi đá sáng
  const TINT = {
    DESERT: null,
    URBAN: { forest: [0.56, 0.64, 0.5], density: 0.75 },
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
    URBAN: { pow: 1.4, r: [11, 17], squash: 0.8 },
    HIGHLAND: { pow: 1.0, pine: true, r: [5, 8], hgt: [17, 28], treeline: 430 }
  };
  const SP = 50;   // bước lưới rải khóm cây
  function buildForest(T, O, nz, seaLvl) {
    const F = FOREST[T.mapType];
    if (!F) return null;
    const rnd = MapGen.mulberry32((T.seed ^ 0x3a7f11) >>> 0);
    const ext = 6200, mats = [], cols = [];
    const leaf = T.leafColors ? T.leafColors() : [0x4a5632, 0x58643a];
    const c0 = new THREE.Color(leaf[0]), c1 = new THREE.Color(leaf[1]), c = new THREE.Color();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const H = (x, z) => O.heightAt(x, z);
    for (let z = -ext; z <= ext; z += SP) for (let x = -ext; x <= ext; x += SP) {
      const px = x + (rnd() - 0.5) * SP * 0.9, pz = z + (rnd() - 0.5) * SP * 0.9, r1 = rnd(), r2 = rnd(), r3 = rnd();
      // ngoài tầm xe (xe bị giữ trong ±(nửa bản đồ - 60), chân vành núi dốc dần từ ~1550)
      // bìa rừng lượn sóng, không thành vòng tròn
      if (Math.hypot(px, pz) < 1790 + 130 * nz(px * 0.0016 + 4, pz * 0.0016)) continue;
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
      c.copy(c0).lerp(c1, r2).multiplyScalar(0.72 + 0.3 * r3);
      cols.push(c.r, c.g, c.b);
    }
    if (!mats.length) return null;
    let geo;
    if (F.pine) {
      geo = new THREE.ConeGeometry(1, 1, 7, 1, true);
      geo.translate(0, 0.5, 0);
    } else {
      // khối tán tròn nhẵn: pháp tuyến = hướng từ tâm (không lộ mặt phẳng tam giác)
      geo = new THREE.IcosahedronGeometry(1, 1);
      const P = geo.attributes.position, N = geo.attributes.normal;
      for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i).normalize(); N.setXYZ(i, p.x, p.y, p.z); }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
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
        H[j * NA + i] = O.heightAt(x, z) + dl * (1 - smooth(0, 400, dOut));
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
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) {
      const v = idx[j * NA + i];
      if (v < 0) continue;
      const x = ax[i], z = ax[j], h = H[j * NA + i];
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      // pháp tuyến: sai phân trung tâm trên lưới không đều
      const i0 = Math.max(0, i - 1), i1 = Math.min(NA - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NA - 1, j + 1);
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
        let f = smooth(-0.08, 0.28, MapGen.fbm(nz, x * 0.0024, z * 0.0024, 3)) * (1 - smooth(0.42, 0.7, slope)) * tint.density * k;
        if (seaLvl !== null) f *= smooth(seaLvl + 4, seaLvl + 14, h);
        if (tint.treeline) f *= 1 - smooth(tint.treeline - 80, tint.treeline + 60, h);
        r = 1 + (tint.forest[0] - 1) * f; g = 1 + (tint.forest[1] - 1) * f; b = 1 + (tint.forest[2] - 1) * f;
      }
      if (T.mapType === 'DESERT') {
        // vách núi bàn: vân đá trầm tích theo độ cao, đỉnh cao ngả đỏ gạch
        const band = (1 + 0.1 * Math.sin(h * 0.11 + nz(x * 0.003, z * 0.003) * 1.5)) * smooth(0.3, 0.6, slope);
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
      GroundShader.apply(mat, { mapType: T.mapType, macroCanvas: T.groundCanvas, water: O.sea || !!(T.map.river || T.map.lakes.length), waterLvl: O.sea ? 3.0 : undefined, terrain: T, ownNormals: true });
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
    const forest = buildForest(T, O, nz, seaLvl);
    if (forest) group.add(forest);
    group.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    return { group, land, sea, forest, verts: nv };
  }

  return { build };
})();

if (typeof window !== 'undefined') window.Backdrop = Backdrop;
