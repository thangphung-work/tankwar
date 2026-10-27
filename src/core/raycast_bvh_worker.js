/**
 * DỰNG CÂY BAO (BVH) NGOÀI LUỒNG CHÍNH cho raycast_bvh.js
 * Nhận bản sao toạ độ + chỉ số của một lưới, dựng MeshBVH y như build() bên luồng chính (cùng tuỳ chọn -> cùng cây), trả
 * về cây đã đóng gói (MeshBVH.serialize), mảng chỉ số đã sắp lại và bảng tam giác sau sắp -> tam giác gốc
 */
importScripts('../../three.min.js', '../../three-mesh-bvh.js');

onmessage = ev => {
  const { id, pos, itemSize, normalized, V, src, groups } = ev.data;
  try {
    const N = src.length / 3;
    const proxy = new THREE.BufferGeometry();
    proxy.setAttribute('position', new THREE.BufferAttribute(pos, itemSize, normalized));
    proxy.setIndex(new THREE.BufferAttribute(src.slice(), 1));
    for (const gr of groups) proxy.addGroup(gr.start, gr.count, gr.materialIndex);
    const bvh = new MeshBVHLib.MeshBVH(proxy, { maxLeafTris: 10, verbose: false, setBoundingBox: false });
    const data = MeshBVHLib.MeshBVH.serialize(bvh, { cloneBuffers: false });
    const key = new Map();
    for (let t = 0; t < N; t++) {
      const a = src[t * 3], b = src[t * 3 + 1], k = a * V + b, e = key.get(k);
      if (e === undefined) key.set(k, t);
      else if (typeof e === 'number') key.set(k, [e, t]);
      else e.push(t);
    }
    const P = data.index, map = new Int32Array(N);
    for (let t = 0; t < N; t++) {
      const a = P[t * 3], b = P[t * 3 + 1], c = P[t * 3 + 2], e = key.get(a * V + b);
      if (typeof e === 'number') map[t] = e;
      else { let m = e[0]; for (const o of e) if (src[o * 3 + 2] === c) { m = o; break; } map[t] = m; }
    }
    postMessage({ id, roots: data.roots, index: P, map }, [...data.roots, P.buffer, map.buffer]);
  } catch (err) {
    postMessage({ id, error: String(err && err.message || err) });
  }
};
