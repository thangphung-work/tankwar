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
    // bvhLarge: lưới lớn dựng sẵn lúc tải bản đồ (mặt đất ~74k tam giác — ngắm theo chuột dò tia vào nó 30 lần/s)
    if (N < MIN_TRIS || (N > MAX_TRIS && !(mesh.userData && mesh.userData.bvhLarge))) return false;
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
    if (!force && triCount(g) > SYNC_MAX) { enqueue(g, true); return null; }
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

  // DỰNG SẴN cho mọi lưới đủ lớn trong một nhóm (xe): xếp hàng; dựng trong Web Worker (raycast_bvh_worker.js — cùng
  // tuỳ chọn nên ra đúng cây như dựng tại chỗ, luồng chính chỉ chép mảng & ghép cây trả về). Không có worker: mỗi lượt rảnh
  // dựng tới ~6 ms (game bận thì trình duyệt hiếm khi rảnh -> hàng đợi tắc, lưới lớn dò tia bằng raycast gốc rất lâu)
  const queue = [], queued = new Set();
  let pumping = false;
  const WORKER_URL = (() => { try { return new URL('raycast_bvh_worker.js', document.currentScript.src).href; } catch (e) { return null; } })();
  const W_INFLIGHT = 2;
  let worker = null, workerBad = !WORKER_URL || typeof Worker === 'undefined', jobId = 0;
  const jobs = new Map(), sending = new Set();   // id -> { g, pos, count, idx, idxVer, gsig, posVer }; hình học đang gửi đi
  function workerOf() {
    if (worker || workerBad) return worker;
    try {
      worker = new Worker(WORKER_URL);
      worker.onmessage = ev => onBuilt(ev.data);
      worker.onerror = () => {
        // không tải được worker: quay về dựng lúc rảnh, trả lại các lưới đang gửi đi
        workerBad = true; worker = null;
        for (const j of jobs.values()) enqueue(j.g, true);
        jobs.clear(); sending.clear();
        if (queue.length) schedule();
      };
    } catch (e) { workerBad = true; worker = null; }
    return worker;
  }
  function send(g) {
    const pos = g.attributes.position, V = pos.count, N = triCount(g);
    let src;
    if (g.index) src = g.index.array.slice(0, N * 3);
    else { src = V > 65535 ? new Uint32Array(N * 3) : new Uint16Array(N * 3); for (let i = 0; i < N * 3; i++) src[i] = i; }
    const P = pos.array.slice(0, V * pos.itemSize), id = ++jobId;
    sending.add(g);
    jobs.set(id, { g, pos, count: V, idx: g.index, idxVer: g.index ? g.index.version : 0, gsig: groupSig(g), posVer: pos.version });
    worker.postMessage({ id, pos: P, itemSize: pos.itemSize, normalized: pos.normalized, V, src, groups: groupsOf(g) }, [P.buffer, src.buffer]);
  }
  function onBuilt(d) {
    const j = jobs.get(d.id);
    if (!j) return;
    jobs.delete(d.id);
    sending.delete(j.g);
    const g = j.g, pos = g.attributes.position, cur = E.get(g);
    // lưới đổi chỉ số / nhóm / mảng toạ độ trong lúc chờ: bỏ, lần dò sau tự xếp hàng lại
    const ok = !d.error && !(cur && cur.bvh) && pos === j.pos && pos.count === j.count && g.index === j.idx &&
      (!g.index || g.index.version === j.idxVer) && groupSig(g) === j.gsig;
    if (ok) {
      try {
        const proxy = new THREE.BufferGeometry();
        proxy.setAttribute('position', pos);
        if (g.attributes.uv) proxy.setAttribute('uv', g.attributes.uv);
        proxy.setIndex(new THREE.BufferAttribute(d.index, 1));
        for (const gr of groupsOf(g)) proxy.addGroup(gr.start, gr.count, gr.materialIndex);
        const bvh = MeshBVHLib.MeshBVH.deserialize({ roots: d.roots, index: d.index }, proxy, { setIndex: false });
        // toạ độ đổi sau lúc chép (xe móp): posVer cũ -> lần dò tới refit theo toạ độ hiện tại
        E.set(g, { bvh, proxy, map: d.map, pos, posVer: j.posVer, idx: g.index, idxVer: j.idxVer, gsig: j.gsig });
        nBuilt++; nTris += triCount(g);
      } catch (err) { E.set(g, { uses: -1e9 }); }
    } else if (d.error && !(cur && cur.bvh)) E.set(g, { uses: -1e9 });
    if (queue.length && !pumping) schedule();
  }
  function pump(deadline) {
    const t0 = performance.now();
    let built = 0;
    if (workerOf()) {
      while (queue.length && jobs.size < W_INFLIGHT) {
        const g = queue.shift();
        queued.delete(g);
        const e = E.get(g);
        if ((e && e.bvh) || sending.has(g) || !eligible1(g)) continue;
        send(g);
      }
      pumping = false;   // lượt tiếp theo do onBuilt gọi khi worker trả cây
      return;
    }
    while (queue.length) {
      // mỗi lượt dựng ít nhất 1 lưới (game bận: hết hạn chờ thì timeRemaining() = 0 -> không bao giờ dựng xong)
      const left = Math.min(deadline && deadline.timeRemaining ? deadline.timeRemaining() : 6, 6 - (performance.now() - t0));
      if (built > 0 && left <= 0) break;
      const g = queue.shift();
      queued.delete(g);
      const e = E.get(g);
      if (!e || !e.bvh) { entryFor(g, true); built++; }
    }
    if (queue.length) schedule(); else pumping = false;
  }
  // hình học vẫn dựng được (lưới đã bị huỷ / đổi sang dạng không hỗ trợ trong lúc chờ thì bỏ)
  function eligible1(g) {
    const pos = g.attributes && g.attributes.position;
    return !!pos && !pos.isInterleavedBufferAttribute && triCount(g) >= MIN_TRIS && !!groupsOf(g);
  }
  function schedule() {
    pumping = true;
    if (!workerBad) { setTimeout(pump, 0); return; }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(pump, { timeout: 1500 });
    else setTimeout(pump, 16);
  }
  // front: lưới đang bị dò tia thật (đạn trúng, ngắm) — dựng trước các lưới chỉ xếp sẵn
  function enqueue(g, front) {
    if (queued.has(g)) {
      if (front && queue[0] !== g) { queue.splice(queue.indexOf(g), 1); queue.unshift(g); }
    } else {
      if (sending.has(g)) return;
      queued.add(g);
      if (front) queue.unshift(g); else queue.push(g);
    }
    if (!pumping) schedule();
  }
  // front: xếp lên đầu hàng (mô hình xe sắp hồi sinh — bước dựng lồng dò tia lên nó ngay sau đó)
  function warm(obj, front) {
    if (!obj || !obj.traverse) return;
    obj.traverse(o => {
      if (!o.isMesh || !eligible(o)) return;
      const g = o.geometry, e = E.get(g);
      if ((e && e.bvh) || sending.has(g)) return;
      if (front) { enqueue(g, true); return; }
      if (queued.has(g)) return;
      queued.add(g); queue.push(g);
    });
    if (queue.length && !pumping) schedule();
  }
  // mọi lưới dựng được cây trong obj đã có cây chưa
  function ready(obj) {
    let ok = true;
    if (obj && obj.traverse) obj.traverse(o => { if (ok && o.isMesh && eligible(o)) { const e = E.get(o.geometry); if (!(e && e.bvh)) ok = false; } });
    return ok;
  }

  // dựng cây NGAY (gọi lúc tải bản đồ, không phải giữa trận) cho lưới lớn đánh dấu userData.bvhLarge
  function prebuild(mesh) {
    if (!mesh || !mesh.isMesh || !eligible(mesh)) return false;
    return !!entryFor(mesh.geometry, true);
  }

  window.RaycastBVH = { warm, ready, prebuild, origRaycast, stats: () => ({ queued: queue.length, built: nBuilt, tris: nTris }) };
})();
