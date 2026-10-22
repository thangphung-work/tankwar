/**
 * LÁ CÂY ĐỌNG TRÊN XE TRINH SÁT — ngụy trang tự nhiên
 *
 * Xe trinh sát húc / cọ vào cây (Destructibles.brush): cây không đổ, lá & cành nhỏ rụng, một phần rơi đọng lại trên nóc,
 * nắp capo, giá súng. Lá phủ càng dày (cover 0..1) thì khi xe ĐỨNG YÊN và chưa vừa nổ súng, địch phải vào gần hơn mới
 * thấy / radar mới bắt được (Equipment.camoFactor / camoRadarFactor). Yếu hơn lưới ngụy trang thật (lá thưa, không che
 * kín đường viền xe): đầy lá -> tầm nhìn địch còn 75%, radar 80% (lưới: 65% / 60%).
 * Chạy nhanh: gió thổi lá bay dần; để lâu lá cũng tự tuột / héo rơi (~4 phút).
 * Chỉ tính trên máy này (không đồng bộ mạng): máy khác vẫn thấy xe như bình thường.
 */
const LeafCover = (() => {
  const N = 42;                 // số lá tối đa trên một xe
  const GAIN = 0.07;            // mỗi cú húc cây: lá đọng thêm (cộng thêm theo tốc độ húc)
  const DECAY_FAST = 0.06;      // /giây khi chạy trên 40% tốc độ tối đa (gió thổi bay)
  const DECAY_IDLE = 0.004;     // /giây (tuột / héo rơi dần)

  let TEX = null;
  function leafTexture() {
    if (TEX || typeof document === 'undefined') return TEX;
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    // phiến lá hình mũi mác, gân giữa sẫm; màu trắng để nhuộm theo màu tán cây (instanceColor)
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 2);
    g.bezierCurveTo(54, 18, 52, 44, 32, 60);
    g.bezierCurveTo(12, 44, 10, 18, 32, 2);
    g.fill();
    g.strokeStyle = 'rgba(90,90,90,0.8)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(32, 6); g.lineTo(32, 58); g.stroke();
    g.lineWidth = 0.8;
    for (let y = 16; y < 52; y += 8) { g.beginPath(); g.moveTo(32, y); g.lineTo(22, y - 6); g.moveTo(32, y); g.lineTo(42, y - 6); g.stroke(); }
    TEX = new THREE.CanvasTexture(cv);
    return TEX;
  }

  function state(u) { return u._leaf || (u._leaf = { cover: 0, shown: 0, mesh: null, spots: null }); }

  // Chỗ lá có thể đọng: dò tia từ trên xuống mô hình thân xe (lá nằm trên mặt nóc, capo, giá hàng — không lơ lửng)
  function findSpots(u) {
    const G = u.chassisGroup;
    if (!G || typeof THREE === 'undefined') return null;
    G.updateMatrixWorld(true);
    const targets = [];
    G.traverse(o => { if (o.isMesh && !o.userData.leafCover && o.visible) targets.push(o); });
    const box = new THREE.Box3().setFromObject(G);
    if (box.isEmpty()) return null;
    const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), spots = [];
    const nm = new THREE.Matrix3();
    for (let k = 0; k < N * 4 && spots.length < N; k++) {
      const x = box.min.x + Math.random() * (box.max.x - box.min.x), z = box.min.z + Math.random() * (box.max.z - box.min.z);
      rc.set(new THREE.Vector3(x, box.max.y + 5, z), down);
      const h = rc.intersectObjects(targets, false)[0];
      if (!h || !h.face) continue;
      nm.getNormalMatrix(h.object.matrixWorld);
      const n = h.face.normal.clone().applyMatrix3(nm).normalize();
      if (n.y < 0.45) continue;   // mặt quá dốc: lá không đọng được
      const p = G.worldToLocal(h.point.clone());
      const nl = n.transformDirection(new THREE.Matrix4().copy(G.matrixWorld).invert());
      spots.push({ p, n: nl });
    }
    return spots.length ? spots : null;
  }

  function ensureMesh(u, S) {
    const G = u.chassisGroup;
    if (!G) return null;
    if (S.mesh && S.mesh.parent === G) return S.mesh;
    S.spots = findSpots(u);
    if (!S.spots) return null;
    const mat = new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, S.spots.length);
    im.userData.leafCover = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(S.spots.length * 3).fill(1), 3);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
    // Thứ tự xuất hiện ngẫu nhiên; mỗi lá nằm áp mặt xe, xoay ngẫu nhiên, hơi vênh, cỡ ~15-30 cm (8 đv = 1 m)
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m = new THREE.Matrix4(), s = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    S.spots.sort(() => Math.random() - 0.5);
    S.spots.forEach((sp, i) => {
      q.setFromUnitVectors(Z, sp.n);
      q2.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2));
      q.multiply(q2);
      const L = 1.3 + Math.random() * 1.2;
      s.set(L * (0.55 + Math.random() * 0.2), L, 1);
      m.compose(sp.p.clone().addScaledVector(sp.n, 0.08 + i * 0.002), q, s);
      im.setMatrixAt(i, m);
    });
    G.add(im);
    S.mesh = im;
    return im;
  }

  /** Xe trinh sát vừa húc cây `tree` ở tốc độ speed (đv/s): lá rơi đọng thêm, mang màu tán cây đó */
  function brush(u, tree, speed) {
    if (!u || u.isDead || u.tankType !== 'SCOUT') return;
    if (tree && (tree.ci < 0 || tree.crownGone)) return;   // cây trơ cành: không còn lá để rụng
    const S = state(u);
    const im = ensureMesh(u, S);
    const before = Math.round(S.cover * N);
    S.cover = Math.min(1, S.cover + GAIN * (0.6 + Math.min(1, (speed || 0) / 50)));
    if (!im) return;
    // lá mới mang màu tán cây vừa húc (lá héo / cây bị cháy sém: nâu), mỗi lá đậm nhạt khác nhau
    const base = tree && tree.tint ? tree.tint : new THREE.Color(0.32, 0.42, 0.18);
    const brown = tree && tree.state && tree.state !== 'ok';
    const c = new THREE.Color();
    const to = Math.min(im.instanceMatrix.count, Math.round(S.cover * N));
    for (let i = before; i < to; i++) {
      c.copy(brown ? new THREE.Color(0.45, 0.36, 0.2) : base).multiplyScalar(0.75 + Math.random() * 0.45);
      if (Math.random() < 0.18) c.lerp(new THREE.Color(0.55, 0.45, 0.22), 0.6);   // vài lá vàng úa
      im.setColorAt(i, c);
    }
    im.instanceColor.needsUpdate = true;
  }

  function update(units, dt) {
    if (!units) return;
    for (const u of units) {
      const S = u._leaf;
      if (!S || (!S.cover && !S.shown)) continue;
      if (u.isDead) S.cover = 0;
      const fast = Math.abs(u.speed || 0) > (u.baseMaxSpeed || 100) * 0.4;
      S.cover = Math.max(0, S.cover - dt * (fast ? DECAY_FAST : DECAY_IDLE));
      if (S.mesh) {
        const n = Math.min(S.mesh.instanceMatrix.count, Math.round(S.cover * N));
        if (n !== S.mesh.count) S.mesh.count = n;
        S.shown = n;
      }
    }
  }

  /** Hệ số tầm nhìn / radar của địch tới xe t (1 = không ảnh hưởng); maxCut = mức giảm khi lá phủ đầy */
  function factor(t, maxCut) {
    const S = t && t._leaf;
    if (!S || S.cover <= 0.02) return 1;
    if ((t.revealTimer || 0) > 0) return 1;                                     // vừa nổ súng: lộ
    if (Math.abs(t.speed || 0) >= (t.baseMaxSpeed || 120) * 0.06) return 1;    // đang chạy: lá rung, lộ hình xe
    return 1 - maxCut * S.cover;
  }

  function cover(u) { return (u && u._leaf && u._leaf.cover) || 0; }

  return { brush, update, factor, cover };
})();

if (typeof window !== 'undefined') window.LeafCover = LeafCover;
if (typeof module !== 'undefined') module.exports = LeafCover;
