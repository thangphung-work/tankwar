/**
 * DÒ TIA NHANH BẰNG CÂY BAO (BVH, thư viện three-mesh-bvh)
 * Raycast mặc định của Three.js chạy trên CPU, thử TỪNG tam giác của lưới. Mỗi phát trúng xe dò hàng chục tia lên mô hình
 * hàng chục nghìn tam giác (điểm chạm, ướm cỡ vết đạn, vết rỗ mảnh...) -> khựng khung hình. Cây bao chỉ thử vài chục tam
 * giác nằm gần tia -> nhanh hơn hàng trăm lần.
 *
 * - Dựng cây trên BẢN SAO chỉ số (dùng chung mảng toạ độ): MeshBVH sắp lại thứ tự tam giác, mà game tra bộ phận bị trúng
 *   theo faceIndex (VehicleDamage partRanges) -> lưới vẽ giữ nguyên, faceIndex trả về được đổi lại đúng thứ tự gốc
 * - Toạ độ đỉnh đổi (xe dân sự móp mềm, đất biến dạng) -> refit cây; chỉ số / nhóm vật liệu đổi -> dựng lại
 * - Chỉ dựng cho lưới >= MIN_TRIS tam giác và đã bị dò >= 2 lần (dựng tốn bằng vài lượt dò thường); xe dựng sẵn lúc vào
 *   trận (warm), chia nhỏ vào lúc trình duyệt rảnh. Dựng cây ~1 ms / 1000 tam giác và không chia nhỏ được: lưới
 *   > SYNC_MAX dựng lúc rảnh (trong lúc chờ dùng raycast gốc), lưới > MAX_TRIS (mặt đất) không dựng — tránh khựng nửa giây
 * - Lưới có xương / morph / drawRange / toạ độ interleaved: dùng raycast gốc
 */
(function () {
  if (typeof THREE === 'undefined' || typeof MeshBVHLib === 'undefined' || !MeshBVHLib.MeshBVH) return;
  const MIN_TRIS = 256, SYNC_MAX = 8000, MAX_TRIS = 60000;
  const origRaycast = THREE.Mesh.prototype.raycast;
  let nBuilt = 0, nTris = 0;   // số liệu cho bảng F9 (tích luỹ, gồm cả lưới đã bị huỷ)
  const E = new WeakMap();   // geometry -> { bvh, proxy, map, pos, posVer, idx, idxVer, gsig } | { uses }
  const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _sphere = new THREE.Sphere();

  function triCount(g) {
    const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    return Math.floor(n / 3);
  }
  // Nhóm vật liệu phải nối liền nhau từ 0 tới hết lưới, không hở / chồng, mốc chia hết cho 3: MeshBVH chia gốc cây theo mốc
  // ranh giới nhóm nhưng lúc dò tra vật liệu bằng groups[i] -> sai lệch nếu nhóm hở / chồng. Trả danh sách đã chuẩn hoá
  // (count Infinity -> tới hết lưới), [] nếu không có nhóm, null nếu không dùng được
  function groupsOf(g) {
    if (!g.groups.length) return [];
    const end = triCount(g) * 3, out = [];
    let at = 0;
    for (const gr of g.groups) {
      const c = Math.min(gr.count, end - gr.start);
      if (gr.start !== at || c <= 0 || gr.start % 3 || c % 3) return null;
      out.push({ start: gr.start, count: c, materialIndex: gr.materialIndex });
      at += c;
    }
    return at === end ? out : null;
  }
  function groupSig(g) {
    let s = '';
    for (const gr of g.groups) s += gr.start + ':' + gr.count + ':' + gr.materialIndex + ',';
    return s;
  }
  function eligible(mesh) {
    const g = mesh.geometry;
    if (!g || !g.isBufferGeometry || mesh.isSkinnedMesh || mesh.material === undefined) return false;
    const pos = g.attributes.position;
    if (!pos || pos.isInterleavedBufferAttribute || (g.index && g.index.isInterleavedBufferAttribute)) return false;
    if (g.morphAttributes && g.morphAttributes.position && g.morphAttributes.position.length) return false;
    if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
    const N = triCount(g);
    if (N < MIN_TRIS || N > MAX_TRIS) return false;
    const gs = groupsOf(g);
    if (!gs) return false;
    if (Array.isArray(mesh.material)) {
      // MeshBVH dựng một gốc cây cho mỗi nhóm: cần đủ nhóm & đủ vật liệu cho từng nhóm
      if (!gs.length) return false;
      for (const gr of gs) if (!mesh.material[gr.materialIndex]) return false;
    }
    return true;
  }

  function build(g) {
    const pos = g.attributes.position;
    const proxy = new THREE.BufferGeometry();
    proxy.setAttribute('position', pos);
    if (g.attributes.uv) proxy.setAttribute('uv', g.attributes.uv);
    const V = pos.count, N = triCount(g);
    let src;
    if (g.index) src = g.index.array.slice(0, N * 3);
    else { src = V > 65535 ? new Uint32Array(N * 3) : new Uint16Array(N * 3); for (let i = 0; i < N * 3; i++) src[i] = i; }
    proxy.setIndex(new THREE.BufferAttribute(src.slice(), 1));
    for (const gr of groupsOf(g)) proxy.addGroup(gr.start, gr.count, gr.materialIndex);
    const bvh = new MeshBVHLib.MeshBVH(proxy, { maxLeafTris: 10, verbose: false, setBoundingBox: false });
    // tam giác sau khi sắp lại -> tam giác gốc (MeshBVH chỉ hoán vị nguyên bộ 3 chỉ số, giữ thứ tự đỉnh trong tam giác)
    const key = new Map();
    for (let t = 0; t < N; t++) {
      const a = src[t * 3], b = src[t * 3 + 1], c = src[t * 3 + 2], k = a * V + b, e = key.get(k);
      if (e === undefined) key.set(k, t);
      else if (typeof e === 'number') key.set(k, [e, t]);
      else e.push(t);
    }
    const P = proxy.index.array, map = new Int32Array(N);
    for (let t = 0; t < N; t++) {
      const a = P[t * 3], b = P[t * 3 + 1], c = P[t * 3 + 2], e = key.get(a * V + b);
      if (typeof e === 'number') map[t] = e;
      else { let m = e[0]; for (const o of e) if (src[o * 3 + 2] === c) { m = o; break; } map[t] = m; }
    }
    return { bvh, proxy, map, pos, posVer: pos.version, idx: g.index, idxVer: g.index ? g.index.version : 0, gsig: groupSig(g) };
  }

  // cây còn khớp hình học hiện tại? (toạ độ đổi -> refit; chỉ số / nhóm / mảng toạ độ đổi -> dựng lại)
  function entryFor(g, force) {
    let e = E.get(g);
    if (e && e.bvh) {
      const pos = g.attributes.position;
      if (pos !== e.pos || pos.count !== e.pos.count || g.index !== e.idx || (g.index && g.index.version !== e.idxVer) || groupSig(g) !== e.gsig) {
        e = null;
      } else {
        if (pos.version !== e.posVer) { e.bvh.refit(); e.posVer = pos.version; }
        return e;
      }
    }
    if (!e) { e = { uses: 0 }; E.set(g, e); }
    if (!force && ++e.uses < 2) return null;
    if (!force && triCount(g) > SYNC_MAX) { enqueue(g); return null; }
    try { e = build(g); nBuilt++; nTris += triCount(g); } catch (err) { e = { uses: -1e9 }; }   // không dựng được: không thử lại, dùng raycast gốc
    E.set(g, e);
    return e.bvh ? e : null;
  }

  THREE.Mesh.prototype.raycast = function (raycaster, intersects) {
    if (!eligible(this)) return origRaycast.call(this, raycaster, intersects);
    const g = this.geometry;
    // loại sớm bằng cầu bao như raycast gốc (không tốn gì cho lưới tia không đi qua)
    if (g.boundingSphere === null) g.computeBoundingSphere();
    _sphere.copy(g.boundingSphere).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(_sphere)) return;
    const e = entryFor(g, false);
    if (!e) return origRaycast.call(this, raycaster, intersects);
    _inv.copy(this.matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inv);
    const hits = raycaster.firstHitOnly ? [e.bvh.raycastFirst(_ray, this.material)] : e.bvh.raycast(_ray, this.material);
    for (const h of hits) {
      if (!h) continue;
      h.point.applyMatrix4(this.matrixWorld);
      h.distance = h.point.distanceTo(raycaster.ray.origin);
      if (h.distance < raycaster.near || h.distance > raycaster.far) continue;
      h.faceIndex = e.map[h.faceIndex];
      h.object = this;
      intersects.push(h);
    }
  };

  // DỰNG SẴN cho mọi lưới đủ lớn trong một nhóm (xe): xếp hàng, mỗi lượt rảnh dựng tới ~6 ms
  const queue = [];
  let pumping = false;
  function pump(deadline) {
    const t0 = performance.now();
    let built = 0;
    while (queue.length) {
      // mỗi lượt dựng ít nhất 1 lưới (game bận: hết hạn chờ thì timeRemaining() = 0 -> không bao giờ dựng xong)
      const left = Math.min(deadline && deadline.timeRemaining ? deadline.timeRemaining() : 6, 6 - (performance.now() - t0));
      if (built > 0 && left <= 0) break;
      const g = queue.shift();
      const e = E.get(g);
      if (!e || !e.bvh) { entryFor(g, true); built++; }
    }
    if (queue.length) schedule(); else pumping = false;
  }
  function schedule() {
    pumping = true;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(pump, { timeout: 1500 });
    else setTimeout(pump, 16);
  }
  function enqueue(g) {
    if (queue.includes(g)) return;
    queue.push(g);
    if (!pumping) schedule();
  }
  function warm(obj) {
    if (!obj || !obj.traverse) return;
    const seen = new Set(queue);
    obj.traverse(o => {
      if (!o.isMesh || !eligible(o)) return;
      const g = o.geometry, e = E.get(g);
      if ((e && e.bvh) || seen.has(g)) return;
      seen.add(g); queue.push(g);
    });
    if (queue.length && !pumping) schedule();
  }

  window.RaycastBVH = { warm, origRaycast, stats: () => ({ queued: queue.length, built: nBuilt, tris: nTris }) };
})();
