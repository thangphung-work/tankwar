// đo xuyên: đỉnh lưới người (tư thế thật qua boneTransform) nằm trong mặt súng (khoảng cách có dấu tới tam giác gần nhất)
window.__pen = function (F, o = {}) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  F.root.updateMatrixWorld(true);
  const R = F.rifle, inR = new Set(); R.traverse(x => inR.add(x));
  const named = new Map();
  const nm = (obj, n) => { if (obj) named.set(obj, n); };
  F.arms.forEach((a, i) => { const s = i ? 'R' : 'L'; nm(a.up, 'up' + s); nm(a.fore, 'fore' + s); nm(a.hand, 'hand' + s); nm(a.clav, 'clav' + s); nm(a.upS, 'up' + s); nm(a.fix, 'up' + s); nm(a.fixB, 'clav' + s); });
  nm(F.chest, 'chest'); nm(F.torso, 'torso'); nm(F.head, 'head'); nm(F.hips, 'hips');
  (F.legs || []).forEach((L, i) => { const s = i ? 'R' : 'L'; nm(L.leg, 'thigh' + s); nm(L.knee, 'shin' + s); nm(L.ankle, 'foot' + s); });
  const nameOf = (b) => { for (let x = b; x; x = x.parent) { if (inR.has(x)) return 'GUN'; if (named.has(x)) return named.get(x); } return 'other'; };
  const tris = [], body = [];   // tris: [a,b,c] world; body: [p, name]
  const tmp = V(0, 0, 0);
  F.root.traverse(m => {
    if (!m.isMesh || !m.visible) return;
    let vis = true; for (let x = m; x; x = x.parent) if (x.visible === false) vis = false; if (!vis) return;
    const g = m.geometry, P = g.attributes.position; if (!P) return;
    const n = P.count, W = new Array(n), nmv = new Array(n);
    if (m.isSkinnedMesh) {
      const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = m.skeleton.bones;
      for (let i = 0; i < n; i++) {
        tmp.fromBufferAttribute(P, i); m.boneTransform(i, tmp); W[i] = tmp.clone().applyMatrix4(m.matrixWorld);
        let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = SW.array[i * 4 + k]; if (w > bw) { bw = w; bi = SI.array[i * 4 + k]; } }
        nmv[i] = nameOf(bones[bi]);
      }
    } else {
      const nmM = nameOf(m);
      for (let i = 0; i < n; i++) { W[i] = V(0, 0, 0).fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); nmv[i] = nmM; }
    }
    const I = g.index, nt = I ? I.count / 3 : n / 3;
    const usedB = new Uint8Array(n);
    for (let t = 0; t < nt; t++) {
      const a = I ? I.getX(3 * t) : 3 * t, b = I ? I.getX(3 * t + 1) : 3 * t + 1, c = I ? I.getX(3 * t + 2) : 3 * t + 2;
      if (nmv[a] === 'GUN' && nmv[b] === 'GUN' && nmv[c] === 'GUN') tris.push([W[a], W[b], W[c]]);
    }
    for (let i = 0; i < n; i++) if (nmv[i] !== 'GUN' && !usedB[i]) body.push([W[i], nmv[i]]);
  });
  // lưới 3D các tam giác súng
  const C = 0.3, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  const bb = new THREE.Box3();
  tris.forEach((T, ti) => {
    bb.setFromPoints(T);
    for (let x = Math.floor(bb.min.x / C); x <= Math.floor(bb.max.x / C); x++) for (let y = Math.floor(bb.min.y / C); y <= Math.floor(bb.max.y / C); y++) for (let z = Math.floor(bb.min.z / C); z <= Math.floor(bb.max.z / C); z++) {
      const k = key(x, y, z); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(ti);
    }
  });
  // khung bao súng trong hệ súng: đỉnh áo ngoài khung bao không thể nằm trong súng (dấu theo pháp tuyến tam giác gần nhất báo sai sau mặt cuối báng, sâu tới 0,6)
  const gb = new THREE.Box3(), invR = new THREE.Matrix4().copy(R.matrixWorld).invert(), lp = V(0, 0, 0);
  for (const T of tris) for (const v of T) gb.expandByPoint(lp.copy(v).applyMatrix4(invR));
  gb.expandByScalar(0.02);
  const tri = new THREE.Triangle(), cp = V(0, 0, 0), nrm = V(0, 0, 0);
  const res = {}, skip = new Set(o.skip || ['handL', 'handR', 'other']);
  for (const [p, name] of body) {
    if (skip.has(name)) continue;
    if (!gb.containsPoint(lp.copy(p).applyMatrix4(invR))) continue;
    const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), cz = Math.floor(p.z / C);
    let best = 1e9, sgn = 1; const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = grid.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
      for (const ti of l) { if (seen.has(ti)) continue; seen.add(ti); const T = tris[ti]; tri.set(T[0], T[1], T[2]); tri.closestPointToPoint(p, cp); const d = cp.distanceTo(p); if (d < best) { best = d; tri.getNormal(nrm); sgn = nrm.dot(tmp.copy(p).sub(cp)) < 0 ? -1 : 1; } }
    }
    if (best < 1e8 && sgn < 0 && best > 0.015 && best < 0.6) {
      const r = res[name] || (res[name] = { n: 0, max: 0 }); r.n++; if (o.pts) o.pts.push(p); r.max = Math.max(r.max, +best.toFixed(3));
    }
  }
  if (o.tris) o.tris.push(...tris);
  return { tris: tris.length, body: body.length, res };
};

// đo ngược: điểm dò súng nằm trong thân (khối chìm hẳn trong người thì đo đỉnh áo không thấy). Trả [số điểm lún > 0,03, sâu nhất]
window.__inv = function (F) {
  const R = F.rifle, P = SoldierModel.WEAPONS[F.weapon]._probes; let n = 0, mx = 0;
  F.root.updateMatrixWorld(true);
  for (const [q, r] of P) { const d = SoldierModel.bodyClear(F, R.localToWorld(q.clone()), r).length(); if (d > 0.03) { n++; mx = Math.max(mx, d); } }
  return [n, +mx.toFixed(2)];
};
