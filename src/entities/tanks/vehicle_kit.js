/**
 * Bộ Công Cụ Dựng Hình Xe Thiết Giáp Chân Thực (Vehicle Kit)
 * Dùng chung cho mọi file model xe trong thư mục src/entities/tanks/
 *
 * - Texture sơn ngụy trang sinh thủ tục bằng noise tuần hoàn (tileable), có lớp bẩn, bụi, hạt sơn
 * - PartBatch: gom hàng trăm chi tiết nhỏ thành 1 mesh / 1 vật liệu để giảm draw call
 * - loft / sideProfile: dựng khối giáp vát đa diện từ mặt cắt (tháp pháo, thân xe, giáp nêm)
 * - TrackSystem: dải xích từng mắt xích thật (InstancedMesh) chạy vòng quanh bánh, có animation
 * - WheelSet: cụm bánh chịu tải / bánh dẫn hướng / bánh sao xoay đúng vận tốc dài
 *
 * Quy ước tọa độ: Y hướng lên, mũi xe hướng -Z, mặt đất tại y = 0 trong chassisGroup.
 */

const VehicleKit = (() => {
  const TEX_CACHE = {};
  const UV_SCALE = 1 / 48; // 1 ô texture sơn phủ 48 đơn vị (~6 mét)

  // ---------------------------------------------------------------------------
  // NOISE TUẦN HOÀN (TILEABLE) CHO TEXTURE
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function periodicNoise(period, seed) {
    const rnd = mulberry32(seed);
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
      const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = grid[y0 * period + x0], b = grid[y0 * period + x1];
      const c = grid[y1 * period + x0], d = grid[y1 * period + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // fBm tuần hoàn: nx, ny trong [0, 1)
  function makeFbm(basePeriod, octaves, seed) {
    const layers = [];
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      layers.push({ p, fn: periodicNoise(p, seed + o * 101) });
    }
    return (nx, ny) => {
      let sum = 0, amp = 0.5, norm = 0;
      for (const l of layers) {
        sum += l.fn(nx * l.p, ny * l.p) * amp;
        norm += amp;
        amp *= 0.5;
      }
      return sum / norm;
    };
  }

  function hexToRgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }

  // ---------------------------------------------------------------------------
  // SƠN NGỤY TRANG QUÂN SỰ (map + roughnessMap + bumpMap)
  // ---------------------------------------------------------------------------
  const PAINT_SCHEMES = {
    // Sơn 3 màu rừng NATO: xanh đồng, nâu đất, đen
    WOODLAND: {
      base: 0x3b4431,
      patchA: { color: 0x433528, threshold: 0.55 },
      patchB: { color: 0x1b1c19, threshold: 0.6 },
      seed: 11
    },
    // Sơn sa mạc 2 màu: vàng cát CARC, nâu đất nung
    DESERT: {
      base: 0x96805d,
      patchA: { color: 0x6b5036, threshold: 0.56 },
      patchB: { color: 0x84704b, threshold: 0.62 },
      seed: 23
    }
  };

  function getPaintTextures(schemeName) {
    if (TEX_CACHE[schemeName]) return TEX_CACHE[schemeName];
    if (typeof document === 'undefined') return null;

    const scheme = PAINT_SCHEMES[schemeName] || PAINT_SCHEMES.WOODLAND;
    const size = 512;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      return c;
    };
    const colorCanvas = mk(), roughCanvas = mk(), bumpCanvas = mk();
    const cImg = colorCanvas.getContext('2d').createImageData(size, size);
    const rImg = roughCanvas.getContext('2d').createImageData(size, size);
    const bImg = bumpCanvas.getContext('2d').createImageData(size, size);

    const camoA = makeFbm(3, 5, scheme.seed);
    const camoB = makeFbm(4, 5, scheme.seed + 7);
    const warp = makeFbm(4, 3, scheme.seed + 13);
    const grime = makeFbm(2, 4, scheme.seed + 29);
    const grain = makeFbm(64, 2, scheme.seed + 41);
    const rnd = mulberry32(scheme.seed + 97);

    const base = hexToRgb(scheme.base);
    const pa = hexToRgb(scheme.patchA.color);
    const pb = hexToRgb(scheme.patchB.color);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size;
        // Uốn méo miền tọa độ để mảng sơn có viền hữu cơ như phun sơn bằng tay
        const w = (warp(nx, ny) - 0.5) * 0.12;
        const a = camoA(nx + w, ny - w);
        const b = camoB(nx - w, ny + w);

        let col = base;
        if (a > scheme.patchA.threshold) col = pa;
        if (b > scheme.patchB.threshold) col = pb;

        const g = grime(nx, ny);
        const fine = grain(nx, ny);
        // Lớp sơn bạc màu loang lổ + hạt sơn mịn
        let shade = 0.86 + g * 0.26 + (fine - 0.5) * 0.1;
        // Chấm tróc sơn / vết bùn khô lác đác
        const speck = rnd();
        let dirt = 0;
        if (speck > 0.9985) shade *= 0.6;
        else if (speck < 0.004) dirt = 0.35;

        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) {
          const dust = [118, 104, 84][k];
          let v = col[k] * shade;
          v = v * (1 - dirt) + dust * dirt;
          cImg.data[i + k] = Math.max(0, Math.min(255, v));
        }
        cImg.data[i + 3] = 255;

        // Sơn mờ quân sự: nhám cao, chỗ bạc màu nhám hơn
        const rough = Math.max(0, Math.min(255, (0.72 + g * 0.18 + (fine - 0.5) * 0.12) * 255));
        rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = rough;
        rImg.data[i + 3] = 255;

        // Bề mặt thép đúc sần sùi
        const bump = 128 + (fine - 0.5) * 120 + (g - 0.5) * 40;
        bImg.data[i] = bImg.data[i + 1] = bImg.data[i + 2] = Math.max(0, Math.min(255, bump));
        bImg.data[i + 3] = 255;
      }
    }

    colorCanvas.getContext('2d').putImageData(cImg, 0, 0);
    roughCanvas.getContext('2d').putImageData(rImg, 0, 0);
    bumpCanvas.getContext('2d').putImageData(bImg, 0, 0);

    const toTex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    TEX_CACHE[schemeName] = {
      map: toTex(colorCanvas),
      roughnessMap: toTex(roughCanvas),
      bumpMap: toTex(bumpCanvas)
    };
    return TEX_CACHE[schemeName];
  }

  // Texture mặt xích / lốp cao su (đường vân nhỏ), dùng chung
  function getGrimeTexture() {
    if (TEX_CACHE.__grime) return TEX_CACHE.__grime;
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const n = makeFbm(8, 4, 5);
    for (let i = 0, p = 0; i < size * size; i++, p += 4) {
      const v = 200 + (n((i % size) / size, Math.floor(i / size) / size) - 0.5) * 110;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = Math.max(0, Math.min(255, v));
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX_CACHE.__grime = t;
    return t;
  }

  // ---------------------------------------------------------------------------
  // BỘ VẬT LIỆU PBR CHUẨN CHO MỘT XE (mỗi xe một bộ riêng vì hiệu ứng tàng hình
  // và màu xác cháy chỉnh trực tiếp lên vật liệu)
  // ---------------------------------------------------------------------------
  function createMaterials(team) {
    const isBlue = team === 'BLUE';
    const paint = getPaintTextures(isBlue ? 'WOODLAND' : 'DESERT');
    const grimeTex = getGrimeTexture();

    const paintMat = (tint) => {
      const m = new THREE.MeshStandardMaterial({
        color: tint,
        map: paint ? paint.map : null,
        roughnessMap: paint ? paint.roughnessMap : null,
        bumpMap: paint ? paint.bumpMap : null,
        bumpScale: 0.035,
        roughness: 1.0,
        metalness: 0.05,
        vertexColors: true
      });
      m.userData.boxUV = true;
      m.userData.baseColor = tint;
      return m;
    };

    const mats = {
      // Giáp sơn ngụy trang chính
      paint: paintMat(0xffffff),
      // Sơn phủ bụi đất (bánh xe, gầm, váy xích)
      paintDusty: paintMat(0xd2c6ae),
      // Mặt trong / khe tối (lưới tản nhiệt, khoang sâu)
      dark: new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.85, metalness: 0.2 }),
      // Thép trần mài mòn (chốt xích, miệng nòng, vành bánh)
      steel: new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.42, metalness: 0.75 }),
      // Mắt xích thép đúc bám bùn
      track: new THREE.MeshStandardMaterial({
        color: 0x4a4740, map: grimeTex, roughness: 0.78, metalness: 0.45
      }),
      // Cao su đen vành bánh / đệm xích
      rubber: new THREE.MeshStandardMaterial({ color: 0x1c1b19, map: grimeTex, roughness: 0.95, metalness: 0.0 }),
      // Kính quang học phủ màng chống phản xạ
      glass: new THREE.MeshStandardMaterial({
        color: 0x0b141a, roughness: 0.08, metalness: 0.9, emissive: 0x0d2a36, emissiveIntensity: 0.55
      }),
      // Kính đèn pha
      lens: new THREE.MeshStandardMaterial({
        color: 0xcfcab4, roughness: 0.15, metalness: 0.2, emissive: 0x3a3424, emissiveIntensity: 0.4
      }),
      // Đèn hậu
      tailLens: new THREE.MeshStandardMaterial({
        color: 0x5c0f0b, roughness: 0.2, metalness: 0.1, emissive: 0x4a0604, emissiveIntensity: 0.6
      }),
      // Bạt vải / túi đồ dã chiến
      canvas: new THREE.MeshStandardMaterial({ color: isBlue ? 0x55553f : 0x8b7757, roughness: 0.97, metalness: 0.0 }),
      canvasDark: new THREE.MeshStandardMaterial({ color: isBlue ? 0x3d3d2e : 0x6b5a40, roughness: 0.97, metalness: 0.0 }),
      // Tấm vải nhận diện phe trên nóc tháp (nhìn rõ từ camera trên cao)
      idPanel: new THREE.MeshStandardMaterial({
        color: isBlue ? 0x3a72bd : 0xc4482f,
        emissive: isBlue ? 0x0b2a5c : 0x5c140b,
        emissiveIntensity: 0.35,
        roughness: 0.9,
        metalness: 0.0
      })
    };
    mats.glass.userData.surface = 'glass';
    mats.glass.userData.windowGlass = true;   // kính cửa / kính chắn gió (khác kính đèn, ống ngắm)
    mats.lens.userData.surface = 'glass';
    mats.tailLens.userData.surface = 'glass';
    mats.rubber.userData.surface = 'rubber';
    mats.canvas.userData.surface = 'cloth';
    mats.canvasDark.userData.surface = 'cloth';
    return mats;
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC
  // ---------------------------------------------------------------------------
  // Chiếu UV theo trục pháp tuyến trội (box/triplanar) để vân sơn liền mạch giữa các khối
  function applyBoxUV(geo, scale = UV_SCALE) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      let u, v;
      if (ax >= ay && ax >= az) { u = z; v = y; }
      else if (ay >= az) { u = x; v = z; }
      else { u = x; v = y; }
      uv[i * 2] = u * scale;
      uv[i * 2 + 1] = v * scale;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // Bóng tối & bụi bẩn tích tụ dần xuống phía gầm xe (vertex color theo độ cao thế giới)
  function applyGroundGrime(geo, yBase) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + yBase;
      let k = Math.max(0, Math.min(1, (y - 1.5) / 12.5));
      k = k * k * (3 - 2 * k);
      // Mặt úp xuống nhận ít ánh sáng phản xạ từ đất hơn
      const under = nrm.getY(i) < -0.5 ? 0.82 : 1.0;
      const r = (0.6 + 0.4 * k) * under;
      // Lớp bụi đất ngả nâu ở phần thấp
      col[i * 3] = r * (1.0 - (1 - k) * 0.02);
      col[i * 3 + 1] = r * (1.0 - (1 - k) * 0.06);
      col[i * 3 + 2] = r * (1.0 - (1 - k) * 0.14);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  // Gộp nhiều BufferGeometry không đánh chỉ số (position + normal + uv [+ color])
  function mergeGeometries(geos) {
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const hasColor = geos.every(g => g.attributes.color);
    const col = hasColor ? new Float32Array(total * 3) : null;
    let o = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
      nrm.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), o * 2);
      if (col) col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();

  function makeMatrix(pos, rot, scale) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, (rot && rot[3]) || 'XYZ');
    _q.setFromEuler(_e);
    _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (typeof scale === 'number') _s.set(scale, scale, scale);
    else if (scale) _s.set(scale[0], scale[1], scale[2]);
    else _s.set(1, 1, 1);
    return _m4.compose(_v, _q, _s);
  }

  // Vị trí giữa + góc Euler để trục Y của khối hướng từ p0 tới p1
  const _up = new THREE.Vector3(0, 1, 0);
  function orientBetween(p0, p1) {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return {
      len,
      pos: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
      rot: [e.x, e.y, e.z]
    };
  }

  // Điểm trên đường cong Bézier bậc 2
  function bezier3(p0, p1, p2, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [0, 1, 2].map(k => a * p0[k] + b * p1[k] + c * p2[k]);
  }

  /**
   * Gom chi tiết tĩnh theo vật liệu rồi gộp thành một mesh cho mỗi vật liệu.
   * Mọi tọa độ tính trong hệ tọa độ của group cha sẽ nhận mesh.
   */
  class PartBatch {
    // yBase: độ cao của gốc tọa độ batch so với mặt đất (để tính lớp bẩn gầm xe)
    constructor(yBase = 0) {
      this.buckets = new Map();
      this.yBase = yBase;
      this.tag = null;
    }

    // Đánh dấu các chi tiết thêm sau lệnh này thuộc bộ phận có thể hỏng / rơi ra (null = phần cố định).
    // Bộ phận vẫn gộp chung mesh (không tăng draw call); hệ thống hư hại tách riêng khi cần.
    setTag(tag) {
      this.tag = tag || null;
      return this;
    }

    add(geo, mat, pos, rot, scale) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(makeMatrix(pos, rot, scale));
      if (this.tag) g.userData.partTag = this.tag;
      if (mat.userData && mat.userData.boxUV) {
        applyBoxUV(g);
        applyGroundGrime(g, this.yBase);
      }
      if (!this.buckets.has(mat)) this.buckets.set(mat, []);
      this.buckets.get(mat).push(g);
      geo.dispose && geo !== g && geo.dispose();
      return this;
    }

    box(w, h, d, mat, pos, rot) {
      return this.add(new THREE.BoxGeometry(w, h, d), mat, pos, rot);
    }

    // Trụ nằm theo trục: 'x' | 'y' | 'z'
    cyl(rTop, rBottom, len, seg, mat, pos, axis = 'y', rot = null, open = false) {
      const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1, open);
      if (axis === 'x') g.rotateZ(-Math.PI / 2);
      else if (axis === 'z') g.rotateX(-Math.PI / 2);
      return this.add(g, mat, pos, rot);
    }

    // Ống trụ nối 2 điểm (xi-lanh thủy lực, thanh chống, ống dẫn)
    strut(p0, p1, radius, mat, seg = 8, radius1 = radius) {
      const o = orientBetween(p0, p1);
      return this.add(new THREE.CylinderGeometry(radius1, radius, o.len, seg), mat, o.pos, o.rot);
    }

    // Thanh hộp nối 2 điểm (tay đòn, dầm đỡ, mắt máng tiếp đạn)
    beam(p0, p1, w, d, mat) {
      const o = orientBetween(p0, p1);
      return this.add(new THREE.BoxGeometry(w, o.len, d), mat, o.pos, o.rot);
    }

    // Chuyển toàn bộ thành mesh và gắn vào group. origin: dời gốc mesh (để getWorldPosition có ý nghĩa)
    build(parent, origin = null, opts = {}) {
      const meshes = new Map();
      for (const [mat, geos] of this.buckets) {
        // Khoảng đỉnh của từng bộ phận được đánh dấu trong mesh gộp
        const ranges = {};
        let off = 0;
        for (const g of geos) {
          const n = g.attributes.position.count, tag = g.userData.partTag;
          if (tag) {
            const list = ranges[tag] || (ranges[tag] = []);
            const last = list[list.length - 1];
            if (last && last[0] + last[1] === off) last[1] += n;
            else list.push([off, n]);
          }
          off += n;
        }
        const merged = mergeGeometries(geos);
        geos.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(merged, mat);
        if (Object.keys(ranges).length) {
          mesh.userData.partRanges = ranges;
          if (PartBatch.registry) {
            for (const tag in ranges) {
              const list = PartBatch.registry[tag] || (PartBatch.registry[tag] = []);
              list.push({ mesh, ranges: ranges[tag], origin: origin ? origin.slice() : null });
            }
          }
        }
        if (origin) {
          merged.translate(-origin[0], -origin[1], -origin[2]);
          merged.computeBoundingSphere();
          mesh.position.set(origin[0], origin[1], origin[2]);
        }
        mesh.castShadow = opts.castShadow !== false;
        mesh.receiveShadow = opts.receiveShadow !== false;
        parent.add(mesh);
        meshes.set(mat, mesh);
      }
      this.buckets.clear();
      return meshes;
    }

    // Gộp thành 1 geometry duy nhất (dùng cho InstancedMesh) — bỏ qua phân biệt vật liệu
    toGeometryByMaterial() {
      const out = new Map();
      for (const [mat, geos] of this.buckets) {
        out.set(mat, mergeGeometries(geos));
        geos.forEach(g => g.dispose());
      }
      this.buckets.clear();
      return out;
    }
  }

  function pushTri(arr, a, b, c, desired) {
    // Đảo chiều tam giác nếu pháp tuyến ngược hướng mong muốn
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * desired[0] + ny * desired[1] + nz * desired[2] < 0) {
      arr.push(...a, ...c, ...b);
    } else {
      arr.push(...a, ...b, ...c);
    }
  }

  /**
   * Khối lăng trụ vát (loft) giữa đa giác đáy và đa giác đỉnh (cùng số đỉnh, tọa độ [x, z]).
   * yTop có thể là số hoặc mảng độ cao từng đỉnh -> mặt nóc nghiêng.
   * Pháp tuyến phẳng từng mặt => cạnh giáp sắc nét như thép tấm hàn.
   */
  function loft(bottom, top, yBottom, yTop) {
    const n = bottom.length;
    const yt = (i) => (Array.isArray(yTop) ? yTop[i] : yTop);
    let cx = 0, cz = 0;
    for (const p of bottom) { cx += p[0]; cz += p[1]; }
    cx /= n; cz /= n;
    const cy = (yBottom + (Array.isArray(yTop) ? yTop.reduce((s, v) => s + v, 0) / n : yTop)) / 2;

    const verts = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const b0 = [bottom[i][0], yBottom, bottom[i][1]];
      const b1 = [bottom[j][0], yBottom, bottom[j][1]];
      const t0 = [top[i][0], yt(i), top[i][1]];
      const t1 = [top[j][0], yt(j), top[j][1]];
      const mx = (b0[0] + b1[0] + t0[0] + t1[0]) / 4 - cx;
      const my = (b0[1] + b1[1] + t0[1] + t1[1]) / 4 - cy;
      const mz = (b0[2] + b1[2] + t0[2] + t1[2]) / 4 - cz;
      const out = [mx, my * 0.2, mz];
      pushTri(verts, b0, b1, t1, out);
      pushTri(verts, b0, t1, t0, out);
    }
    const capTris = (pts, yf, dir) => {
      const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const t of tris) {
        pushTri(verts,
          [pts[t[0]][0], yf(t[0]), pts[t[0]][1]],
          [pts[t[1]][0], yf(t[1]), pts[t[1]][1]],
          [pts[t[2]][0], yf(t[2]), pts[t[2]][1]],
          dir);
      }
    };
    capTris(top, yt, [0, 1, 0]);
    capTris(bottom, () => yBottom, [0, -1, 0]);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Khối đùn theo mặt cắt dọc (nhìn từ sườn xe): points = [[z, y], ...], đùn theo trục X với bề rộng width.
   * Dùng cho thân xe có giáp mũi vát, váy xích, tấm chắn bùn...
   */
  function sideProfile(points, width, bevel = 0) {
    const shape = new THREE.Shape();
    points.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      // Bo cạnh vào trong: mặt ngoài giữ đúng đường bao thiết kế, phụ kiện gắn sát bề mặt không bị chìm
      bevelOffset: -bevel,
      bevelSegments: 1,
      curveSegments: 1
    });
    g.rotateY(-Math.PI / 2);
    g.translate(depth / 2, 0, 0);
    return g;
  }

  // ---------------------------------------------------------------------------
  // CỤM BÁNH XOAY (InstancedMesh theo vật liệu, mỗi bánh một instance)
  // ---------------------------------------------------------------------------
  class WheelSet {
    /**
     * buildFn(batch): dựng 1 bánh quanh gốc tọa độ, trục quay = trục X, mặt ngoài hướng +X.
     * positions: [{ x, y, z }]; bánh bên trái (x < 0) tự lật 180° để mặt ngoài hướng ra ngoài.
     */
    constructor(parent, buildFn, positions, radius) {
      this.radius = radius;
      this.positions = positions;
      this.angles = new Float32Array(positions.length);
      const batch = new PartBatch(positions.length ? positions[0].y : 0);
      buildFn(batch);
      this.meshes = [];
      for (const [mat, geo] of batch.toGeometryByMaterial()) {
        const im = new THREE.InstancedMesh(geo, mat, positions.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        parent.add(im);
        this.meshes.push(im);
      }
      this._flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      this._roll = new THREE.Quaternion();
      this._steerQ = new THREE.Quaternion();
      this._axis = new THREE.Vector3(1, 0, 0);
      this._yAxis = new THREE.Vector3(0, 1, 0);
      // Góc bẻ lái chung; bánh nào có positions[i].steer (hệ số) mới bẻ theo
      this.steerAngle = 0;
      this._one = new THREE.Vector3(1, 1, 1);
      this._p = new THREE.Vector3();
      this._q = new THREE.Quaternion();
      this._m = new THREE.Matrix4();
      this._sm = new THREE.Matrix4();
      // Mức xịt lốp từng bánh (0 = căng, 1 = xẹp hẳn) và bánh bị văng mất
      this.flat = new Float32Array(positions.length);
      this.gone = new Uint8Array(positions.length);
      this.update();
    }

    setFlat(i, k) {
      if (i >= 0 && i < this.flat.length) { this.flat[i] = Math.max(0, Math.min(2, k)); this.update(); }
    }

    resetDamage() {
      this.flat.fill(0);
      this.gone.fill(0);
      this.update();
    }

    // Lăn quãng đường dài distLeft / distRight (đơn vị thế giới) -> góc quay = s / r
    roll(distLeft, distRight) {
      for (let i = 0; i < this.positions.length; i++) {
        const d = this.positions[i].x < 0 ? distLeft : distRight;
        this.angles[i] -= d / this.radius;
      }
      this.update();
    }

    update() {
      for (let i = 0; i < this.positions.length; i++) {
        const p = this.positions[i];
        const left = p.x < 0;
        // Bánh trái bị lật quanh Y nên chiều quay quanh trục X cục bộ đảo dấu
        this._roll.setFromAxisAngle(this._axis, left ? -this.angles[i] : this.angles[i]);
        if (left) this._q.copy(this._flip).multiply(this._roll);
        else this._q.copy(this._roll);
        if (p.steer) {
          this._steerQ.setFromAxisAngle(this._yAxis, this.steerAngle * p.steer);
          this._q.premultiply(this._steerQ);
        }
        if (this.gone[i]) {
          this._m.makeScale(0, 0, 0);
        } else if (this.flat[i] > 0) {
          // Lốp xẹp: tâm bánh tụt xuống, lốp bẹp theo phương đứng của thân xe (không xoay theo bánh)
          const f = this.flat[i];
          const sy = 1 - 0.2 * f;
          this._m.makeRotationFromQuaternion(this._q);
          this._sm.makeScale(1 + 0.04 * f, sy, 1 + 0.03 * f);
          this._m.premultiply(this._sm);
          this._m.setPosition(p.x, p.y - this.radius * (1 - sy), p.z);
        } else {
          this._p.set(p.x, p.y, p.z);
          this._m.compose(this._p, this._q, this._one);
        }
        for (const im of this.meshes) im.setMatrixAt(i, this._m);
      }
      for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // HỆ THỐNG XÍCH TỪNG MẮT (InstancedMesh)
  // ---------------------------------------------------------------------------
  /**
   * circles: các vòng tròn đường đi tâm mắt xích theo thứ tự ngược chiều kim đồng hồ khi nhìn
   * từ bên phải xe trong mặt phẳng (u = z, v = y): bánh dẫn hướng trước -> bánh tải đầu ->
   * bánh tải cuối -> bánh sao sau. Mỗi vòng { u, v, r } (r đã cộng nửa độ dày xích).
   */
  function buildTrackPath(circles) {
    const n = circles.length;
    const tangents = [];
    for (let i = 0; i < n; i++) {
      const A = circles[i], B = circles[(i + 1) % n];
      const du = B.u - A.u, dv = B.v - A.v;
      const L = Math.hypot(du, dv);
      const phi = Math.atan2(dv, du);
      const beta = phi - Math.acos(Math.max(-1, Math.min(1, (A.r - B.r) / L)));
      const nu = Math.cos(beta), nv = Math.sin(beta);
      tangents.push({
        beta,
        p0: { u: A.u + A.r * nu, v: A.v + A.r * nv },
        p1: { u: B.u + B.r * nu, v: B.v + B.r * nv }
      });
    }
    const segs = [];
    for (let i = 0; i < n; i++) {
      // Cung trên vòng tròn i: từ tiếp tuyến vào (i-1) tới tiếp tuyến ra (i)
      const C = circles[i];
      const tin = tangents[(i - 1 + n) % n], tout = tangents[i];
      let a0 = tin.beta, a1 = tout.beta;
      let d = a1 - a0;
      while (d < 0) d += Math.PI * 2;
      while (d >= Math.PI * 2) d -= Math.PI * 2;
      if (d > 1e-4 && d < Math.PI * 2 - 1e-4) {
        segs.push({ type: 'arc', C, a0, da: d, len: C.r * d });
      }
      const t = tout;
      const len = Math.hypot(t.p1.u - t.p0.u, t.p1.v - t.p0.v);
      segs.push({ type: 'line', p0: t.p0, p1: t.p1, len });
    }
    let total = 0;
    for (const s of segs) { s.start = total; total += s.len; }
    return { segs, length: total };
  }

  // Trả về vị trí (u, v) và hướng đi (tu, tv) tại khoảng cách s trên đường xích
  function samplePath(path, s, out) {
    s = ((s % path.length) + path.length) % path.length;
    let seg = path.segs[path.segs.length - 1];
    for (const sg of path.segs) {
      if (s < sg.start + sg.len) { seg = sg; break; }
    }
    const local = s - seg.start;
    if (seg.type === 'line') {
      const k = seg.len > 0 ? local / seg.len : 0;
      out.u = seg.p0.u + (seg.p1.u - seg.p0.u) * k;
      out.v = seg.p0.v + (seg.p1.v - seg.p0.v) * k;
      out.tu = (seg.p1.u - seg.p0.u) / (seg.len || 1);
      out.tv = (seg.p1.v - seg.p0.v) / (seg.len || 1);
    } else {
      const a = seg.a0 + local / seg.C.r;
      out.u = seg.C.u + seg.C.r * Math.cos(a);
      out.v = seg.C.v + seg.C.r * Math.sin(a);
      // Đi ngược chiều kim đồng hồ: tiếp tuyến = (-sin, cos)
      out.tu = -Math.sin(a);
      out.tv = Math.cos(a);
    }
    return out;
  }

  class TrackSystem {
    /**
     * opts: { circles, sidesX: [-x, +x], pitch, buildLink(batch) }
     * buildLink dựng 1 mắt xích: trục X = bề ngang xích, Y = hướng ra ngoài (mặt bám đất), Z = dọc xích.
     */
    constructor(parent, opts) {
      this.path = buildTrackPath(opts.circles);
      this.count = Math.max(8, Math.round(this.path.length / opts.pitch));
      this.pitch = this.path.length / this.count;
      this.sidesX = opts.sidesX;
      this.offsets = this.sidesX.map(() => 0);

      const batch = new PartBatch();
      opts.buildLink(batch, this.pitch);
      this.meshes = [];
      for (const [mat, geo] of batch.toGeometryByMaterial()) {
        const im = new THREE.InstancedMesh(geo, mat, this.count * this.sidesX.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        parent.add(im);
        this.meshes.push(im);
      }
      this._m = new THREE.Matrix4();
      this._smp = { u: 0, v: 0, tu: 0, tv: 0 };
      for (let s = 0; s < this.sidesX.length; s++) this.layoutSide(s);
    }

    layoutSide(sideIdx) {
      const x = this.sidesX[sideIdx];
      const base = sideIdx * this.count;
      const m = this._m;
      const p = this._smp;
      for (let i = 0; i < this.count; i++) {
        samplePath(this.path, i * this.pitch + this.offsets[sideIdx], p);
        // Hệ trục mắt xích: X ngang, Y hướng ra ngoài vòng xích, Z ngược chiều chạy
        const yx = 0, yy = -p.tu, yz = p.tv;
        const zx = 0, zy = -p.tv, zz = -p.tu;
        m.set(
          1, 0, 0, x,
          0, yy, zy, p.v,
          0, yz, zz, p.u,
          0, 0, 0, 1
        );
        for (const im of this.meshes) im.setMatrixAt(base + i, m);
      }
      for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    }

    // Dịch xích theo quãng đường xe lăn bánh (dương = tiến về phía trước)
    advance(distances) {
      for (let s = 0; s < this.sidesX.length; s++) {
        if (this.broken && this.broken[s]) continue;
        const d = distances[s] || 0;
        if (Math.abs(d) < 1e-5) continue;
        this.offsets[s] = (this.offsets[s] + d) % this.path.length;
        this.layoutSide(s);
      }
    }

    // Đứt xích tại chỗ: chốt mắt xích gãy ở bánh dẫn hướng trước / sau. Nhánh dưới vẫn nằm dưới bánh,
    // nhánh trên mất căng sụp xuống nằm trên đỉnh bánh chịu tải, đầu đứt rũ qua bánh xuống đất thành
    // một đoạn ngắn nằm ngay trước / sau xe (giữ nguyên số mắt xích, không văng ra xa)
    breakSide(s, forward = true) {
      this.broken = this.broken || this.sidesX.map(() => false);
      if (this.broken[s]) return;
      this.broken[s] = true;
      const x = this.sidesX[s], sx = Math.sign(x) || 1, base = s * this.count, m = this._m, p = this._smp;
      let minV = Infinity, maxV = -Infinity, minU = Infinity, maxU = -Infinity;
      for (let i = 0; i < this.count; i++) {
        samplePath(this.path, i * this.pitch, p);
        minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v); minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      }
      const sg = forward ? -1 : 1, endU = forward ? minU : maxU;
      const vSag = minV + (maxV - minV) * 0.58;
      const nearEnd = (u) => forward ? u < minU + 8 : u > maxU - 8;
      const put = (i, px, pv, pu, tu, tv, tw) => {
        // (tu, tv): hướng dọc dải xích trong mặt phẳng (u, v); trục Y (mặt bám) vuông góc, quay lên trên
        let a = -tu, b = tv;
        if (a < 0) { a = -a; b = -b; }
        const c = Math.cos(tw), sn = Math.sin(tw);
        m.set(
          c, 0, sn, px,
          sn * b, a, -b * c, pv,
          -sn * a, b, a * c, pu,
          0, 0, 0, 1
        );
        for (const im of this.meshes) im.setMatrixAt(base + i, m);
      };
      const drape = [];
      for (let i = 0; i < this.count; i++) {
        samplePath(this.path, i * this.pitch + this.offsets[s], p);
        if (p.v < minV + 1.2) continue;          // nhánh dưới vẫn nằm dưới bánh
        if (nearEnd(p.u)) { drape.push(i); continue; }
        // Nhánh trên sụp xuống đỉnh bánh chịu tải, võng nhẹ giữa các bánh, hơi lệch ra ngoài
        const sag = Math.abs(Math.sin(p.u * 0.33)) * 0.5;
        put(i, x + sx * 0.35 + (Math.random() - 0.5) * 0.15, vSag - sag, p.u, 1, 0, (Math.random() - 0.5) * 0.06);
      }
      // Đầu đứt: rũ từ đỉnh bánh dẫn hướng xuống đất rồi nằm duỗi một đoạn ngắn, xoắn nhẹ ra ngoài
      drape.sort((a, b) => {
        samplePath(this.path, a * this.pitch + this.offsets[s], p); const ua = p.u;
        samplePath(this.path, b * this.pitch + this.offsets[s], p); return (ua - p.u) * sg;
      });
      const pts = [[endU - sg * 8, vSag], [endU - sg * 2, maxV - 0.6], [endU + sg * 2.5, minV + 0.3], [endU + sg * 60, minV]];
      let seg = 0, t = 0;
      for (let k = 0; k < drape.length; k++) {
        let A = pts[seg], B = pts[seg + 1];
        let L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        while (t > L && seg < pts.length - 2) { t -= L; seg++; A = pts[seg]; B = pts[seg + 1]; L = Math.hypot(B[0] - A[0], B[1] - A[1]); }
        const tu = (B[0] - A[0]) / L, tv = (B[1] - A[1]) / L;
        const pu = A[0] + tu * t, pv = A[1] + tv * t;
        const out = sx * (0.35 + Math.min(1.6, k * 0.12));
        put(drape[k], x + out + (Math.random() - 0.5) * 0.2, pv, pu, tu, tv, seg > 0 ? (Math.random() - 0.5) * 0.12 + sx * Math.min(0.25, 0.03 * k) : 0);
        t += this.pitch;
      }
      for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    }

    // Nối xích tạm: lắp lại lên bánh
    repairSide(s) {
      if (!this.broken || !this.broken[s]) return;
      this.broken[s] = false;
      this.layoutSide(s);
    }
  }

  /**
   * Cụm cần ăng-ten roi (whip) dao động theo quán tính thật:
   * - Gốc ăng-ten tăng/giảm tốc, ôm cua, xe nhún khi bắn -> ngọn roi trễ pha, uốn cong rồi lắc tắt dần
   * - Xe chạy trên địa hình -> rung xóc nhỏ liên tục tỉ lệ tốc độ
   * Tất cả roi của một xe gộp chung 1 mesh, uốn bằng CPU mỗi khung hình (vài trăm đỉnh) -> 1 draw call.
   * Tọa độ khai báo trong hệ của group cha (thân xe hoặc tháp pháo).
   */
  class AntennaSet {
    constructor(material, parent) {
      this.material = material;
      this.parent = parent;
      this.whips = [];
      this.mesh = null;
      this.time = Math.random() * 100;
      this._q = new THREE.Quaternion();
      this._w = new THREE.Vector3();
      this._a = new THREE.Vector3();
    }

    // pos: chân roi; len: chiều dài; tilt: [ngả quanh X, ngả quanh Z] lúc đứng yên
    add(pos, len, opts = {}) {
      const tx = (opts.tilt && opts.tilt[0]) || 0, tz = (opts.tilt && opts.tilt[1]) || 0;
      const axis = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(tx, 0, tz)).normalize();
      // Roi dài -> tần số riêng thấp hơn (~1.1 Hz với roi 2 m, ~1.8 Hz với roi 1.4 m)
      const freq = opts.freq || Math.max(0.9, Math.min(2.4, 19 / len));
      this.whips.push({
        base: new THREE.Vector3(pos[0], pos[1], pos[2]), len, axis,
        r0: opts.r0 || 0.09, r1: opts.r1 || 0.045,
        w: Math.PI * 2 * freq, zeta: opts.damping || 0.11,
        // Độ uốn tĩnh của ngọn roi trên mỗi m/s² gia tốc nền
        gain: opts.gain || 0.028,
        bx: 0, bz: 0, vx: 0, vz: 0,
        prev: null, vel: new THREE.Vector3(), acc: new THREE.Vector3(),
        phase: Math.random() * 50, hidden: false, start: 0, count: 0
      });
      return this.whips.length - 1;
    }

    build() {
      const RAD = 5, SEG = 10;
      const pos = [], nrm = [], idx = [];
      this.meta = [];
      for (const w of this.whips) {
        w.start = pos.length / 3;
        for (let j = 0; j <= SEG; j++) {
          const u = j / SEG;
          const r = w.r0 + (w.r1 - w.r0) * u;
          for (let k = 0; k < RAD; k++) {
            const a = (k / RAD) * Math.PI * 2;
            const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
            pos.push(0, 0, 0);
            nrm.push(Math.cos(a), 0, Math.sin(a));
            this.meta.push(u, ox, oz);
          }
        }
        for (let j = 0; j < SEG; j++) {
          for (let k = 0; k < RAD; k++) {
            const a = w.start + j * RAD + k, b = w.start + j * RAD + (k + 1) % RAD;
            idx.push(a, a + RAD, b, b, a + RAD, b + RAD);
          }
        }
        w.count = (SEG + 1) * RAD;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
      g.setIndex(idx);
      this.geo = g;
      this.mesh = new THREE.Mesh(g, this.material);
      this.mesh.castShadow = true;
      this.mesh.name = 'antennas';
      this.parent.add(this.mesh);
      this.layout();
      g.computeBoundingSphere();
      g.boundingSphere.radius += 6; // chừa chỗ cho roi uốn
      return this.mesh;
    }

    // Đặt lại đỉnh theo độ uốn hiện tại
    layout() {
      const p = this.geo.attributes.position.array;
      const M = this.meta;
      for (const w of this.whips) {
        for (let i = w.start; i < w.start + w.count; i++) {
          const u = M[i * 3], ox = M[i * 3 + 1], oz = M[i * 3 + 2];
          if (w.hidden) { p[i * 3] = w.base.x; p[i * 3 + 1] = w.base.y; p[i * 3 + 2] = w.base.z; continue; }
          const s = w.len * u;
          // Lò xo chân + thân roi cong dần về ngọn
          const prof = 0.25 * u + 0.75 * u * u;
          const dx = w.bx * w.len * prof, dz = w.bz * w.len * prof;
          const shorten = (dx * dx + dz * dz) / (2 * Math.max(s, 0.5));
          p[i * 3] = w.base.x + w.axis.x * s + dx + ox;
          p[i * 3 + 1] = w.base.y + w.axis.y * s - shorten;
          p[i * 3 + 2] = w.base.z + w.axis.z * s + dz + oz;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
    }

    // Kick tức thời (vd sóng nổ đầu nòng, trúng đạn): dir trong hệ group cha, đơn vị m/s
    impulse(dx, dz) {
      for (const w of this.whips) { w.vx += dx; w.vz += dz; }
    }

    setHidden(i, hidden) {
      if (this.whips[i]) { this.whips[i].hidden = hidden; this.layout(); }
    }

    reset() {
      for (const w of this.whips) { w.bx = w.bz = w.vx = w.vz = 0; w.prev = null; w.vel.set(0, 0, 0); w.acc.set(0, 0, 0); }
      if (this.mesh) this.layout();
    }

    update(dt) {
      if (!this.mesh || !(dt > 0)) return;
      if (dt > 0.1) { this.reset(); return; }
      this.time += dt;
      this.parent.updateWorldMatrix(true, false);
      this.parent.getWorldQuaternion(this._q).invert();
      const kv = 1 - Math.exp(-dt / 0.04), ka = 1 - Math.exp(-dt / 0.07);
      for (const w of this.whips) {
        const wp = this._w.copy(w.base).applyMatrix4(this.parent.matrixWorld);
        if (!w.prev) { w.prev = wp.clone(); continue; }
        // Vận tốc / gia tốc chân roi (đơn vị game: 8 = 1 m) -> m/s, m/s²; làm mượt để khử nhiễu dt
        const vx = (wp.x - w.prev.x) / dt / 8, vy = (wp.y - w.prev.y) / dt / 8, vz = (wp.z - w.prev.z) / dt / 8;
        w.prev.copy(wp);
        if (vx * vx + vy * vy + vz * vz > 2500) { w.vel.set(0, 0, 0); w.acc.set(0, 0, 0); continue; } // dịch chuyển tức thời (hồi sinh)
        const ax = (vx - w.vel.x) / dt, ay = (vy - w.vel.y) / dt, az = (vz - w.vel.z) / dt;
        w.vel.x += (vx - w.vel.x) * kv; w.vel.y += (vy - w.vel.y) * kv; w.vel.z += (vz - w.vel.z) * kv;
        w.acc.x += (ax * kv - w.acc.x) * ka; w.acc.y += (ay * kv - w.acc.y) * ka; w.acc.z += (az * kv - w.acc.z) * ka;
        const a = this._a.copy(w.acc).applyQuaternion(this._q);
        a.clampLength(0, 40);
        // Rung xóc mặt đường tỉ lệ tốc độ (2 tần số lệch pha) + gió nhẹ khi đứng yên
        const sp = Math.min(1.2, Math.hypot(w.vel.x, w.vel.z) / 9);
        const t = this.time + w.phase;
        const road = sp * 2.4, wind = 0.25;
        const nx = road * (Math.sin(t * 11.3) * 0.6 + Math.sin(t * 6.1 + 1.7) * 0.4) + wind * Math.sin(t * 1.3);
        const nz = road * (Math.sin(t * 9.7 + 0.6) * 0.6 + Math.sin(t * 4.9 + 2.9) * 0.4) + wind * Math.sin(t * 0.9 + 1.1);
        // Xóc dọc (nhún) cũng làm roi lắc theo hướng đang ngả
        const heave = a.y * 0.25;
        const fx = -(a.x + nx) - heave * (w.axis.x * 4 + w.bx);
        const fz = -(a.z + nz) - heave * (w.axis.z * 4 + w.bz);
        const W = w.w, k2 = W * W, c = 2 * w.zeta * W;
        // Tích phân bán ẩn, chia bước nhỏ cho ổn định
        const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
        for (let s = 0; s < n; s++) {
          w.vx += (-k2 * w.bx - c * w.vx + w.gain * k2 * fx) * h;
          w.vz += (-k2 * w.bz - c * w.vz + w.gain * k2 * fz) * h;
          w.bx += w.vx * h; w.bz += w.vz * h;
        }
        const m = Math.hypot(w.bx, w.bz);
        if (m > 0.45) { w.bx *= 0.45 / m; w.bz *= 0.45 / m; }
      }
      this.layout();
    }
  }

  // Bộ phận rời là cả một group (đầu kính quét, trạm vũ khí, ống phóng...) có thể bị bắn bay
  function registerPartGroup(unit, name, obj) {
    if (!unit || !obj) return;
    (unit.partGroups || (unit.partGroups = {}))[name] = obj;
  }

  // Texture chớp lửa đầu nòng: lõi trắng nóng -> vàng -> cam -> trong suốt, kèm tia lửa tỏa
  function getMuzzleFlashTexture() {
    if (TEX_CACHE.__flash) return TEX_CACHE.__flash;
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0.0, 'rgba(255,255,240,1)');
    g.addColorStop(0.18, 'rgba(255,236,150,0.95)');
    g.addColorStop(0.45, 'rgba(255,150,40,0.55)');
    g.addColorStop(1.0, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,210,120,0.5)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      ctx.lineWidth = 3 - (i % 3);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    TEX_CACHE.__flash = t;
    return t;
  }

  // Decal chữ số hiệu chiến thuật (nền trong suốt)
  function createStencilDecal(text, w, h, color = 'rgba(232,228,214,0.88)') {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.round(256 * h / w);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(canvas.height * 0.78)}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    // Khe hở khuôn stencil
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(0, canvas.height * 0.47, canvas.width, canvas.height * 0.06);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.9, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  return {
    UV_SCALE,
    getPaintTextures,
    createMaterials,
    applyBoxUV,
    mergeGeometries,
    PartBatch,
    loft,
    sideProfile,
    WheelSet,
    TrackSystem,
    AntennaSet,
    registerPartGroup,
    buildTrackPath,
    samplePath,
    createStencilDecal,
    getMuzzleFlashTexture,
    orientBetween,
    bezier3,
    mulberry32
  };
})();

if (typeof window !== 'undefined') {
  window.VehicleKit = VehicleKit;
}
