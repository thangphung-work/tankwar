/**
 * PHÁ HỦY CẢNH VẬT THEO LOẠI ĐẠN (cộng dồn)
 *  - Vết đạn tích tụ (Scars): mỗi ô nhỏ trên bề mặt cộng dồn "năng lượng" các phát trúng -> vết to dần, đậm dần,
 *    lên cấp (bê tông: rỗ đạn -> vỡ mảng -> bong lớp lộ cốt thép). Đất: lỗ 12.7mm, vết nổ-mảnh 30mm, vết cháy đạn cháy.
 *  - Đá tảng có máu (RockField): máu theo thể tích; mỗi phát mẻ đá văng vụn, đá nhỏ lại, ám khói; hết máu vỡ tung
 *    thành đống đá vụn, mất va chạm (xe đi qua được, bot tính lại đường).
 *  - Cầu sập được (BridgeSet): mỗi nhịp cầu giữa 2 trụ có máu riêng; hư nặng thì võng xuống, lan can cong;
 *    hết máu nhịp cầu gãy, đổ chúi xuống sông (mặt cầu mất, xe rơi xuống nước).
 *  - Ụ đất cứ điểm: vụ nổ làm cháy sém, lõm dần mặt đất đắp (không phá được công sự).
 * Sát thương lên cảnh vật = động năng (trúng trực tiếp) + sức nổ giảm theo khoảng cách, nhân hệ số vật liệu.
 * Mọi thay đổi ảnh hưởng lối chơi (máu đá / cầu) đi qua game.applyEnvDamage -> đồng bộ ENV_HIT giữa các máy.
 */
const EnvDamage = (() => {
  // kin: động năng khi trúng trực tiếp · blast: sức nổ tại tâm · r: bán kính nổ tác động cảnh vật (đơn vị game)
  // e: năng lượng để lại vết trên bề mặt (vết cộng dồn theo ô)
  const AMMO = {
    SCOUT_BULLET: { kin: 0.02, blast: 0, r: 0, e: 0.05 },
    INCENDIARY: { kin: 0.03, blast: 0.02, r: 3, e: 0.08 },
    GATLING_BULLET: { kin: 0.06, blast: 0.05, r: 4, e: 0.12 },
    AP: { kin: 1.0, blast: 0, r: 0, e: 0.6 },
    NORMAL: { kin: 0.35, blast: 1.0, r: 20, e: 1.2 },
    HE: { kin: 0.15, blast: 1.6, r: 28, e: 2.0 },
    RPG: { kin: 0.3, blast: 0.7, r: 12, e: 1.0 },
    ANTI_TANK_MISSILE: { kin: 0.45, blast: 1.3, r: 17, e: 1.5 },
    CLUSTER_SUBMUNITION: { kin: 0.1, blast: 0.35, r: 9, e: 0.5 },
    CLUSTER: { kin: 0.1, blast: 0.6, r: 18, e: 0.8 }
  };
  // Hệ số vật liệu: [động năng, sức nổ, đạn cỡ nhỏ (súng máy / 30mm chỉ làm sứt mẻ bề mặt)]
  const MAT = { rock: [0.5, 1.0, 0.35], bridge: [0.35, 0.8, 0.1] };
  const smallArms = (A) => A.blast < 0.1 && A.kin < 0.1;

  function ammoOf(ammo, heavy) {
    const a = AMMO[ammo] || AMMO.NORMAL;
    if (!heavy) return a;
    // lựu pháo 155mm: thuốc nổ gấp ~4 lần đạn 120mm
    return { kin: a.kin * 1.5, blast: a.blast * 2.6, r: a.r * 1.7, e: a.e * 2.5 };
  }
  const isBullet = (ammo) => ammo === 'SCOUT_BULLET' || ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY';
  const hash3 = (x, y, z) => { let h = (Math.round(x * 7) * 374761393 + Math.round(y * 7) * 668265263 + Math.round(z * 7) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  // ------------------------------------------------------------------ texture vết đạn (vẽ thủ tục, cache)
  const TEX = {};
  function texture(kind) {
    if (TEX[kind] || typeof document === 'undefined') return TEX[kind];
    const S = 128, c = S / 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    let seed = kind.length * 977 + kind.charCodeAt(0) * 31;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed & 0xffff) / 0xffff; };
    const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
    const ragged = (r0, jag, col) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.283, r = r0 * (1 - jag + jag * 2 * rnd()); const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.fill();
    };
    const cracks = (n, len, col, w) => {
      g.strokeStyle = col; g.lineWidth = w;
      for (let k = 0; k < n; k++) {
        let a = rnd() * 6.283, x = c + Math.cos(a) * 6, y = c + Math.sin(a) * 6;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 5; s++) { a += (rnd() - 0.5) * 0.9; const l = len * (0.12 + rnd() * 0.16); x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
        g.stroke();
      }
    };
    switch (kind) {
      case 'g_pock':   // 12.7mm cắm vào đất: lỗ nhỏ, vành đất bị hất
        for (let i = 0; i < 26; i++) { const a = rnd() * 6.283, d = 14 + rnd() * 34; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + rnd() * 4, 'rgba(70,52,36,0.55)'); }
        blob(c, c, 30, 'rgba(48,36,26,0.55)');
        ragged(11, 0.35, 'rgba(22,16,12,0.92)');
        blob(c, c, 7, 'rgba(5,4,3,1)');
        break;
      case 'g_hei':    // 30mm nổ-mảnh: vết cháy hình sao, lỗ giữa, mảnh văng rạch đất
        g.strokeStyle = 'rgba(25,20,16,0.5)';
        for (let i = 0; i < 22; i++) { const a = rnd() * 6.283, l = 30 + rnd() * 30; g.lineWidth = 1 + rnd() * 2.5; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); g.stroke(); }
        blob(c, c, 44, 'rgba(20,16,12,0.75)');
        ragged(16, 0.4, 'rgba(12,9,7,0.95)');
        blob(c, c, 8, 'rgba(0,0,0,1)');
        break;
      case 'g_burn':   // đạn cháy: vết cháy xém loang, tàn đỏ nâu
        for (let i = 0; i < 14; i++) blob(c + (rnd() - 0.5) * 40, c + (rnd() - 0.5) * 40, 14 + rnd() * 18, 'rgba(18,12,8,0.45)');
        for (let i = 0; i < 10; i++) blob(c + (rnd() - 0.5) * 34, c + (rnd() - 0.5) * 34, 4 + rnd() * 7, 'rgba(110,38,12,0.45)');
        blob(c, c, 12, 'rgba(8,6,5,0.9)');
        break;
      case 'c_pock':   // đạn súng trên bê tông: mẻ sáng màu (bê tông mới lộ), lõi tối, nứt chân chim
        ragged(26, 0.35, 'rgba(205,200,190,0.75)');
        cracks(5, 70, 'rgba(40,38,36,0.6)', 1.1);
        ragged(12, 0.4, 'rgba(70,66,62,0.95)');
        blob(c, c, 6, 'rgba(15,14,13,1)');
        break;
      case 'c_chip':   // 30mm / APFSDS: hố vỡ sâu, nứt tỏa nhiều nhánh
        cracks(9, 120, 'rgba(35,33,31,0.7)', 1.5);
        ragged(36, 0.3, 'rgba(190,185,175,0.8)');
        ragged(24, 0.35, 'rgba(95,90,84,0.95)');
        ragged(12, 0.4, 'rgba(30,28,26,1)');
        break;
      case 'c_spall':  // nổ mạnh: bong mảng lớn lộ cốt thép gỉ
        cracks(12, 130, 'rgba(30,28,26,0.75)', 2);
        ragged(56, 0.2, 'rgba(160,155,146,0.85)');
        ragged(46, 0.25, 'rgba(92,88,82,0.97)');
        g.strokeStyle = 'rgba(105,58,32,0.95)'; g.lineWidth = 3.2;
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(c - 40, c + i * 14 + (rnd() - 0.5) * 3); g.lineTo(c + 40, c + i * 14 + (rnd() - 0.5) * 3); g.stroke(); g.beginPath(); g.moveTo(c + i * 14, c - 40); g.lineTo(c + i * 14 + (rnd() - 0.5) * 4, c + 40); g.stroke(); }
        g.globalCompositeOperation = 'destination-in'; ragged(47, 0.25, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'source-over';
        blob(c, c, 26, 'rgba(25,22,20,0.55)');
        break;
      case 'soot':     // muội khói / cháy sém
        for (let i = 0; i < 18; i++) { const a = rnd() * 6.283, d = rnd() * 30; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 18 + rnd() * 22, 'rgba(14,12,10,0.32)'); }
        break;
      case 'r_chip':   // đá tảng bị mẻ: vết vỡ tươi màu sáng, rỗ tối
        ragged(44, 0.3, 'rgba(225,218,204,0.7)');
        ragged(28, 0.35, 'rgba(160,152,140,0.9)');
        for (let i = 0; i < 12; i++) blob(c + (rnd() - 0.5) * 50, c + (rnd() - 0.5) * 50, 2 + rnd() * 4, 'rgba(40,36,32,0.8)');
        cracks(4, 110, 'rgba(45,40,36,0.6)', 1.4);
        break;
    }
    const t = new THREE.CanvasTexture(cv);
    TEX[kind] = t;
    return t;
  }

  // ------------------------------------------------------------------ VẾT ĐẠN TÍCH TỤ
  const POOL_CAP = { g_pock: 700, g_hei: 700, g_burn: 300, c_pock: 500, c_chip: 400, c_spall: 260, soot: 400, r_chip: 300 };
  const BASE_SIZE = { g_pock: 2.6, g_hei: 4.6, g_burn: 5.5, c_pock: 2.4, c_chip: 4.8, c_spall: 13, soot: 18, r_chip: 5 };

  class Scars {
    constructor(parent) {
      this.parent = parent;
      this.pools = {};
      this.cells = new Map();
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
      this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._n = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
      this._c = new THREE.Color();
      this._Z = new THREE.Matrix4().makeScale(0, 0, 0);
    }
    pool(kind) {
      let P = this.pools[kind];
      if (P) return P;
      const cap = POOL_CAP[kind] || 300;
      const mat = new THREE.MeshLambertMaterial({ map: texture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
      im.count = 0; im.frustumCulled = false; im.renderOrder = 3; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      im.matrixAutoUpdate = false;
      this.parent.add(im);
      P = this.pools[kind] = { im, cap, next: 0, owner: new Array(cap).fill(null), pos: new Float32Array(cap * 3) };
      return P;
    }
    // Đặt / cập nhật 1 vết (cell: bản ghi ô đang giữ vết)
    place(cell) {
      const P = this.pool(cell.kind);
      if (cell.idx === undefined) {
        const i = P.next;
        const old = P.owner[i];
        if (old) { this.cells.delete(old.key); old.idx = undefined; }
        P.owner[i] = cell; cell.idx = i;
        P.next = (P.next + 1) % P.cap;
        P.im.count = Math.max(P.im.count, i + 1);
      }
      const n = this._n.set(cell.nx, cell.ny, cell.nz).normalize();
      this._q.setFromUnitVectors(this._z, n);
      this._q2.setFromAxisAngle(this._z, cell.rot);
      this._q.multiply(this._q2);
      this._p.set(cell.x + n.x * 0.12, cell.y + n.y * 0.12, cell.z + n.z * 0.12);
      this._s.set(cell.size * (cell.stretch || 1), cell.size, 1);
      this._m.compose(this._p, this._q, this._s);
      P.im.setMatrixAt(cell.idx, this._m);
      P.pos.set([this._p.x, this._p.y, this._p.z], cell.idx * 3);
      this._c.setRGB(cell.shade, cell.shade, cell.shade);
      P.im.setColorAt(cell.idx, this._c);
      P.im.instanceMatrix.needsUpdate = true;
      P.im.instanceColor.needsUpdate = true;
    }
    unplace(cell) {
      if (cell.idx === undefined) return;
      const P = this.pools[cell.kind];
      P.im.setMatrixAt(cell.idx, this._Z);
      P.owner[cell.idx] = null;
      P.im.instanceMatrix.needsUpdate = true;
      cell.idx = undefined;
    }
    /**
     * Một phát trúng bề mặt: cls = lớp bề mặt ('g' đất, 'c' bê tông, 'r' đá, 's' muội), cs = cỡ ô cộng dồn,
     * tierFn(e) -> loại vết theo năng lượng tích lũy của ô, sizeFn(kind, e) -> cỡ vết.
     */
    hit(cls, cs, x, y, z, nx, ny, nz, energy, tierFn, opts = {}) {
      const key = cls + '|' + Math.round(x / cs) + '|' + Math.round(y / cs) + '|' + Math.round(z / cs);
      let cell = this.cells.get(key);
      if (!cell) {
        cell = { key, kind: null, idx: undefined, e: 0, hits: 0, x, y, z, nx, ny, nz, rot: hash3(x, y, z) * 6.283 };
        this.cells.set(key, cell);
      } else {
        // dồn tâm vết về trung bình các phát trúng
        const w = 1 / (cell.hits + 1);
        cell.x += (x - cell.x) * w; cell.y += (y - cell.y) * w; cell.z += (z - cell.z) * w;
      }
      cell.e += energy;
      cell.hits++;
      if (opts.stretch) { cell.stretch = Math.max(cell.stretch || 1, opts.stretch); cell.rot = opts.rot !== undefined ? opts.rot : cell.rot; }
      const kind = tierFn(cell.e);
      if (cell.kind && cell.kind !== kind) this.unplace(cell);
      cell.kind = kind;
      const base = BASE_SIZE[kind] || 4;
      // càng nhiều phát dồn vào một chỗ vết càng rộng & đậm (log để không phình vô hạn)
      cell.size = base * Math.min(2.4, 1 + 0.45 * Math.log2(1 + cell.e / (opts.e0 || energy || 0.1) / 3)) * (opts.sizeMul || 1);
      cell.shade = Math.max(0.42, 1 - 0.06 * (cell.hits - 1));
      this.place(cell);
      return cell;
    }
    // Vết đạn trên đất trong vùng mặt đất vừa đổi (hố bom): đặt lại sát mặt đất mới
    regroundGround(x0, z0, x1, z1, surf) {
      for (const cell of this.cells.values()) {
        if (cell.key.charCodeAt(0) !== 103 /* 'g' */ || cell.x < x0 || cell.x > x1 || cell.z < z0 || cell.z > z1) continue;
        cell.y = surf(cell.x, cell.z);
        if (cell.idx !== undefined) this.place(cell);
      }
    }
    removeNear(x, y, z, r) {
      for (const cell of this.cells.values()) {
        if ((cell.x - x) ** 2 + (cell.y - y) ** 2 + (cell.z - z) ** 2 < r * r) { this.unplace(cell); this.cells.delete(cell.key); }
      }
    }
  }

  // ------------------------------------------------------------------ MẢNH VỠ / ĐÁ VỤN (rơi rồi nằm lại)
  const DEB_VK = Math.sqrt(98 / 260);
  class Debris {
    constructor(parent, map, cap = 420) {
      const geo = new THREE.IcosahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({ map: map || null, roughness: 0.95, flatShading: true });
      this.im = new THREE.InstancedMesh(geo, mat, cap);
      this.im.count = 0; this.im.frustumCulled = false; this.im.castShadow = true; this.im.receiveShadow = true;
      this.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      this.im.matrixAutoUpdate = false;
      parent.add(this.im);
      this.cap = cap; this.next = 0; this.live = [];
      this.parts = new Array(cap).fill(null);   // mọi mảnh (cả mảnh đã nằm yên) để đặt lại khi mặt đất đổi
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
      this._v = new THREE.Vector3();
      // 12 đỉnh khối 20 mặt (dò điểm chạm đất thấp nhất thay vì chỉ tâm mảnh)
      const P = geo.attributes.position, seen = new Set();
      this.verts = [];
      for (let i = 0; i < P.count; i++) {
        const k = P.getX(i).toFixed(3) + ',' + P.getY(i).toFixed(3) + ',' + P.getZ(i).toFixed(3);
        if (!seen.has(k)) { seen.add(k); this.verts.push(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))); }
      }
    }
    // Độ cao tâm mảnh để không đỉnh nào của mảnh (đã xoay) lọt xuống đất; lún nhẹ ~30% cỡ mảnh như vụn nằm trên đất tơi
    contactY(p, groundAt) {
      this._e.set(p.rx, p.ry, p.rz);
      this._q.setFromEuler(this._e);
      let need = -Infinity;
      for (const v0 of this.verts) {
        const v = this._v.set(v0.x * p.s, v0.y * p.sy, v0.z * p.s * 0.9).applyQuaternion(this._q);
        need = Math.max(need, groundAt(p.x + v.x, p.z + v.z) - v.y);
      }
      return need - 0.3 * Math.min(p.s, p.sy);
    }
    // Mặt đất dưới vùng vừa đổi (hố bom): mảnh đã nằm yên hạ / nâng theo mặt mới
    reground(x0, z0, x1, z1, groundAt) {
      let any = false;
      for (const p of this.parts) {
        if (!p || !p.rest || p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
        p.y = this.contactY(p, groundAt);
        this._e.set(p.rx, p.ry, p.rz);
        this._m.compose(this._p.set(p.x, p.y, p.z), this._q.setFromEuler(this._e), this._s.set(p.s, p.sy, p.s * 0.9));
        this.im.setMatrixAt(p.i, this._m);
        any = true;
      }
      if (any) this.im.instanceMatrix.needsUpdate = true;
    }
    burst(x, y, z, n, size, col, speed = 90, up = 0.8) {
      for (let k = 0; k < n; k++) {
        const i = this.next; this.next = (this.next + 1) % this.cap;
        this.im.count = Math.max(this.im.count, i + 1);
        const old = this.live.findIndex(p => p.i === i); if (old >= 0) this.live.splice(old, 1);
        // vận tốc truyền vào theo trọng lực cũ 260 -> thu √(98/260): giữ tầm văng, thời gian bay như thật (g ×1,25)
        const a = Math.random() * 6.283, sp = speed * DEB_VK * (0.3 + Math.random() * 0.8);
        const s = size * (0.45 + Math.random() * 0.7);
        const part = { i, x, y, z, vx: Math.cos(a) * sp, vy: speed * DEB_VK * up * (0.3 + Math.random() * 0.9), vz: Math.sin(a) * sp,
          rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, w: (Math.random() - 0.5) * 14, s, sy: s * (0.55 + Math.random() * 0.4), t: 0 };
        this.live.push(part);
        this.parts[i] = part;
        const v = 0.8 + Math.random() * 0.3;
        this.im.setColorAt(i, new THREE.Color(col[0] * v, col[1] * v, col[2] * v));
      }
      this.im.instanceColor.needsUpdate = true;
    }
    update(dt, groundAt) {
      if (!this.live.length) return;
      for (let j = this.live.length - 1; j >= 0; j--) {
        const p = this.live[j];
        p.t += dt;
        p.vy -= 98 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.w * dt; p.rz += p.w * 0.7 * dt;
        // gần đất mới dò đủ các đỉnh (mảnh nằm nghiêng trên dốc không cắm một nửa vào sườn dốc)
        const g0 = groundAt(p.x, p.z), ext = Math.max(p.s, p.sy);
        const gy = p.y - g0 > ext * 1.3 ? g0 + ext : this.contactY(p, groundAt);
        let rest = false;
        if (p.y <= gy) {
          p.y = gy;
          if (Math.abs(p.vy) < 40 * DEB_VK || p.t > 4) rest = true;
          p.vy = -p.vy * 0.28; p.vx *= 0.5; p.vz *= 0.5; p.w *= 0.5;
        }
        this._e.set(p.rx, p.ry, p.rz);
        this._m.compose(this._p.set(p.x, p.y, p.z), this._q.setFromEuler(this._e), this._s.set(p.s, p.sy, p.s * 0.9));
        this.im.setMatrixAt(p.i, this._m);
        if (rest) { p.rest = true; this.live.splice(j, 1); }   // nằm lại thành đống vụn (ma trận giữ nguyên)
      }
      this.im.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ ĐÁ TẢNG CÓ MÁU
  class RockField {
    constructor(sys, items) {
      this.sys = sys; this.T = sys.T;
      this.items = items || [];
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
      for (const it of this.items) {
        // máu theo thể tích (đá to vài phát lựu pháo / hàng chục phát pháo tăng; súng máy 12.7mm gần như không sứt)
        it.maxHp = it.hp = Math.max(0.35, Math.pow(Math.min(it.r, 26) / 10, 2) * (Math.min(it.h, 30) / 10) * 2.4);
        it.alive = true;
        // mặt đất nguyên thuỷ dưới chân đá (5 điểm) -> hố bom khoét dưới đá thì đá lún theo
        it.pos0 = it.pos.clone(); it.y0 = it.y; it.dy = 0;
        it.g0s = this.footprint(it).map(([x, z]) => this.T.groundAtRaw ? this.T.groundAtRaw(x, z) : 0);
        it.scarCells = new Set();
      }
    }
    footprint(it) {
      const d = it.r * 0.6;
      return [[it.x, it.z], [it.x + d, it.z], [it.x - d, it.z], [it.x, it.z + d], [it.x, it.z - d]];
    }
    // Mặt đất dưới đá vừa đổi: đá tựa trên 2 điểm đỡ cao nhất (hố khoét một bên thì đá nằm vắt trên mép, khoét hết thì lún xuống)
    reground(x0, z0, x1, z1, surf) {
      for (const it of this.items) {
        if (!it.alive || it.x + it.r < x0 || it.x - it.r > x1 || it.z + it.r < z0 || it.z - it.r > z1) continue;
        const ds = this.footprint(it).map(([x, z], k) => surf(x, z) - it.g0s[k]).sort((a, b) => b - a);
        const dy = Math.min(0.5, ds[1]);
        if (Math.abs(dy - it.dy) < 0.02) continue;
        it.dy = dy;
        it.pos.y = it.pos0.y + dy; it.y = it.y0 + dy;
        this.reshape(it, it.hp / it.maxHp);
      }
    }
    // Vết mẻ / muội trên mặt đá bám theo đá: lưu toạ độ chuẩn hoá theo cỡ đá lúc trúng
    meshPos(it, s) { return { x: it.pos.x, y: it.pos.y - (1 - s) * it.h * 0.25, z: it.pos.z }; }
    attachScar(it, cell) {
      if (!cell) return;
      const s = this.scaleK(it, it.hp / it.maxHp), P = this.meshPos(it, s);
      cell.u = { x: (cell.x - P.x) / s, y: (cell.y - P.y) / s, z: (cell.z - P.z) / s };
      it.scarCells.add(cell);
    }
    syncScars(it, s) {
      const P = this.meshPos(it, s), S = this.sys.scars;
      for (const cell of it.scarCells) {
        if (cell.idx === undefined || !cell.u) { it.scarCells.delete(cell); continue; }
        cell.x = P.x + cell.u.x * s; cell.y = P.y + cell.u.y * s; cell.z = P.z + cell.u.z * s;
        S.place(cell);
      }
    }
    damageAt(x, y, z, A, info, fx, events) {
      const [mk, mb, ms] = MAT.rock;
      const sk = smallArms(A) ? ms : 1;
      for (const it of this.items) {
        if (!it.alive) continue;
        const dxz = Math.hypot(x - it.x, z - it.z);
        if (dxz > it.r + A.r + 6) continue;
        const top = it.y + it.h * 0.95;
        if (y > top + A.r + 4 || y < it.y - 8 - A.r) continue;
        const surf = Math.max(0, dxz - it.r * 0.85), dy = Math.max(0, y - top);
        const dist = Math.hypot(surf, dy);
        const direct = dist < 3;
        let dmg = sk * ((direct ? A.kin * mk : 0) + (A.r > 0 && dist < A.r ? A.blast * mb * Math.pow(1 - dist / A.r, 2) : 0));
        if (dmg <= 0.0005) continue;
        it.hp -= dmg;
        // vết mẻ / ám khói trên mặt đá, ngay phía điểm nổ
        const cy = it.y + it.h * 0.35;
        const n = new THREE.Vector3(x - it.x, (y - cy) * 0.8, z - it.z);
        if (n.lengthSq() < 1e-4) n.set(0, 1, 0);
        n.normalize();
        const k = it.hp / it.maxHp;
        const sc = this.scaleK(it, k);
        const px = it.x + n.x * it.r * 0.9 * sc, py = cy + n.y * it.h * 0.6 * sc, pz = it.z + n.z * it.r * 0.9 * sc;
        if (it.hp > 0) {
          this.attachScar(it, this.sys.scars.hit('r', 5, px, py, pz, n.x, n.y, n.z, A.e, () => 'r_chip', { e0: 0.3 }));
          if (A.blast > 0.3) this.attachScar(it, this.sys.scars.hit('s', 10, px, py, pz, n.x, n.y, n.z, A.e, () => 'soot', { sizeMul: Math.min(1.4, it.r / 14) }));
          this.reshape(it, k);
          // vụn đá văng ra theo độ mạnh
          const nChips = Math.min(10, Math.round(1 + dmg * 6));
          if (this.sys.debris) this.sys.debris.burst(px, py, pz, nChips, Math.max(0.6, it.r * 0.06), it.col, 70 + dmg * 60);
        } else {
          this.shatter(it, fx, events);
        }
      }
    }
    scaleK(it, k) { return 0.55 + 0.45 * Math.cbrt(clamp01(k)); }
    reshape(it, k) {
      const s = this.scaleK(it, k);
      this._s.copy(it.scale).multiplyScalar(s);
      this._p.set(it.pos.x, it.pos.y - (1 - s) * it.h * 0.25, it.pos.z);
      this._m.compose(this._p, it.quat, this._s);
      it.im.setMatrixAt(it.k, this._m);
      it.im.instanceMatrix.needsUpdate = true;
      // càng nát càng sậm màu (bụi khói bám, vết nứt)
      const c = 0.55 + 0.45 * k;
      it.im.setColorAt(it.k, new THREE.Color(it.color.r * c, it.color.g * c, it.color.b * c));
      if (it.im.instanceColor) it.im.instanceColor.needsUpdate = true;
      // đá nhỏ dần / lún: vết mẻ cũ co vào theo mặt đá (không lơ lửng ngoài không khí)
      if (it.scarCells && it.scarCells.size) this.syncScars(it, s);
    }
    shatter(it, fx, events) {
      it.alive = false;
      it.im.setMatrixAt(it.k, new THREE.Matrix4().makeScale(0, 0, 0));
      it.im.instanceMatrix.needsUpdate = true;
      this.sys.scars.removeNear(it.x, it.y + it.h * 0.4, it.z, it.r * 1.6 + 6);
      // mất va chạm (đạn bay qua, xe đi qua đống vụn)
      if (it.boulder) {
        const bi = this.T.boulders.indexOf(it.boulder);
        if (bi >= 0) this.T.boulders.splice(bi, 1);
        this.sys.navDirty = true;
      }
      const cy = it.y + it.h * 0.4;
      if (this.sys.debris) {
        this.sys.debris.burst(it.x, cy, it.z, Math.min(26, 8 + Math.round(it.r)), Math.max(1, it.r * 0.2), it.col, 110, 0.9);
        this.sys.debris.burst(it.x, cy, it.z, 10, Math.max(0.6, it.r * 0.08), it.col, 170, 1);
        // đá tảng nứt toác thành vài khối lớn đổ nghiêng tại chỗ (không tan biến hết thành sỏi)
        this.sys.debris.burst(it.x, it.y + it.h * 0.3, it.z, 3 + (it.r > 12 ? 2 : 0), Math.max(1.5, it.r * 0.42), it.col, 40, 0.5);
      }
      if (fx && fx.spawnDust && fx.palette) fx.spawnDust(it.x, it.y, it.z, Math.min(2.2, 0.6 + it.r / 14), { micro: false }, fx.palette('BOULDER'), false, null);
      if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('rockSplit', { x: it.x, y: it.y + it.h * 0.5, z: it.z }, Math.min(1.6, 0.6 + it.r / 15), { h: it.h });
      events.push({ type: 'boulder', x: it.x, z: it.z, r: it.r });
    }
  }

  // ------------------------------------------------------------------ CẦU BÊ TÔNG NHIỀU NHỊP, SẬP ĐƯỢC
  class BridgeSet {
    constructor(sys) {
      this.sys = sys;
      const T = this.T = sys.T;
      this.items = [];
      this.anims = [];
      const list = (T.map && T.map.bridges) || [];
      if (!list.length) return;
      const conc = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.9 });
      const asphalt = new THREE.MeshStandardMaterial({ map: T.roadTexture('asphalt'), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x5f6a70, roughness: 0.5, metalness: 0.6 });
      for (const b of list) {
        const f = { x: Math.sin(b.angle), z: Math.cos(b.angle) };
        const hA = T.groundAtRaw(b.x - f.x * b.length / 2, b.z - f.z * b.length / 2);
        const hB = T.groundAtRaw(b.x + f.x * b.length / 2, b.z + f.z * b.length / 2);
        const deckY = Math.max(4, Math.max(hA, hB) + 1.2);
        const root = new THREE.Group();
        root.position.set(b.x, 0, b.z);
        root.rotation.y = b.angle;
        // trụ cầu chia mặt cầu thành các nhịp
        const piers = [];
        for (let z = -b.length / 2 + 40; z < b.length / 2 - 30; z += 55) piers.push(z);
        for (const z of piers) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.7, deckY + 16, 7), conc);
          pier.position.set(0, (deckY - 4) / 2 - 6, z); pier.castShadow = true; root.add(pier);
        }
        const bounds = [-b.length / 2, ...piers, b.length / 2];
        const spans = [];
        for (let s = 0; s < bounds.length - 1; s++) {
          const a0 = bounds[s], a1 = bounds[s + 1], len = a1 - a0, mid = (a0 + a1) / 2;
          const grp = new THREE.Group();
          grp.position.set(0, 0, mid);
          const deck = new THREE.Mesh(new THREE.BoxGeometry(b.width, 4, len - 0.3), conc);
          deck.position.y = deckY - 2; deck.castShadow = deck.receiveShadow = true; grp.add(deck);
          const top = new THREE.Mesh(new THREE.PlaneGeometry(b.width - 6, len - 0.3), asphalt);
          top.rotation.x = -Math.PI / 2; top.position.y = deckY + 0.05; top.receiveShadow = true; grp.add(top);
          const rails = [];
          for (const sd of [-1, 1]) {
            const curb = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, len - 0.3), conc);
            curb.position.set(sd * (b.width / 2 - 1.5), deckY + 0.8, 0); grp.add(curb);
            const railG = new THREE.Group();
            railG.position.set(sd * (b.width / 2 - 1.2), deckY + 0.8, 0);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, len - 1), steel);
            rail.position.y = 3.4; railG.add(rail);
            for (let z = a0 + 6; z < a1 - 1; z += 12) {
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 0.6), steel);
              post.position.set(0, 1.6, z - mid); railG.add(post);
            }
            grp.add(railG); rails.push(railG);
          }
          root.add(grp);
          const maxHp = 6 + len * 0.04;
          spans.push({ a0, a1, len, grp, rails, hp: maxHp, maxHp, state: 'ok', sag: 0 });
        }
        T.group.add(root);
        this.items.push({ x: b.x, z: b.z, angle: b.angle, f, width: b.width, length: b.length, deckY, root, spans });
      }
    }
    local(b, x, z) {
      const dx = x - b.x, dz = z - b.z;
      return { along: dx * b.f.x + dz * b.f.z, across: -dx * b.f.z + dz * b.f.x };
    }
    spanAt(b, along) {
      for (const s of b.spans) if (along >= s.a0 && along <= s.a1) return s;
      return null;
    }
    // Mặt cầu còn nguyên tại (x, z)? -> { b, along, across, span } hoặc null
    at(x, z) {
      for (const b of this.items) {
        const L = this.local(b, x, z);
        if (Math.abs(L.along) > b.length / 2 || Math.abs(L.across) > b.width / 2) continue;
        const sp = this.spanAt(b, L.along);
        if (!sp || sp.state !== 'ok') return null;
        // y: mặt cầu hiện tại (nhịp hư nặng võng xuống) — xe / vết đạn nằm đúng mặt võng
        return { b, along: L.along, across: L.across, span: sp, y: b.deckY - sp.sag * 1.8 };
      }
      return null;
    }
    // Mặt nhịp cầu đang sập / đã nằm dưới sông tại (x, z) (null nếu không có): xe trên nhịp rơi theo nhịp, không tụt
    // thẳng xuống lòng sông ngay khi nhịp vừa gãy; xe không xuyên qua mặt cầu đã đổ
    brokenDeckAt(x, z) {
      if (!this.broken) return null;
      let best = null;
      for (const b of this.items) {
        const L = this.local(b, x, z);
        if (Math.abs(L.along) > b.length / 2 + 40 || Math.abs(L.across) > b.width / 2) continue;
        for (const sp of b.spans) {
          const P = sp.pose;
          if (!P) continue;
          const c = Math.cos(P.th), sn = Math.sin(P.th);
          const a = P.hinge + (L.along - P.hinge) / Math.max(0.2, c);    // vị trí trên nhịp trước khi chúi
          if (a < sp.a0 - 0.5 || a > sp.a1 + 0.5) continue;
          const y = P.py - sp.sag * 1.8 * c - (a - P.hinge) * sn;
          if (best === null || y > best) best = y;
        }
      }
      return best;
    }
    // Vết đạn trên mặt cầu: nhớ nhịp & toạ độ trên nhịp để vết võng / rơi theo mặt cầu
    tagScar(cell, x, z) {
      if (!cell || cell.br) return;
      const br = this.at(x, z);
      if (!br) return;
      cell.br = { b: br.b, sp: br.span, al: br.along, ac: br.across };
      (br.span.scars || (br.span.scars = new Set())).add(cell);
    }
    syncScars(b, sp) {
      if (!sp.scars || !sp.scars.size) return;
      const P = sp.pose || { hinge: 0, py: b.deckY, th: 0 }, c = Math.cos(P.th), sn = Math.sin(P.th), S = this.sys.scars;
      for (const cell of sp.scars) {
        if (cell.idx === undefined) { sp.scars.delete(cell); continue; }
        const d = cell.br.al - P.hinge, sg = sp.sag * 1.8;
        const along = P.hinge + d * c - sg * sn, ac = cell.br.ac;
        cell.x = b.x + along * b.f.x - ac * b.f.z;
        cell.z = b.z + along * b.f.z + ac * b.f.x;
        cell.y = P.py - sg * c - d * sn;
        cell.nx = b.f.x * sn; cell.ny = c; cell.nz = b.f.z * sn;
        S.place(cell);
      }
    }
    damageAt(x, y, z, A, info, fx, events) {
      const [mk, mb, ms] = MAT.bridge;
      const sk = smallArms(A) ? ms : 1;
      for (const b of this.items) {
        const L = this.local(b, x, z);
        if (Math.abs(L.across) > b.width / 2 + A.r + 4 || Math.abs(L.along) > b.length / 2 + A.r + 4) continue;
        if (y > b.deckY + 30 + A.r || y < b.deckY - 40 - A.r) continue;
        for (const sp of b.spans) {
          if (sp.state !== 'ok') continue;
          const da = Math.max(0, sp.a0 - L.along, L.along - sp.a1);
          const dc = Math.max(0, Math.abs(L.across) - b.width / 2);
          const dy = Math.max(0, (b.deckY - 4) - y, y - (b.deckY + 1.5));
          const dist = Math.hypot(da, dc, dy);
          const direct = dist < 2.5;
          const dmg = sk * ((direct ? A.kin * mk : 0) + (A.r > 0 && dist < A.r ? A.blast * mb * Math.pow(1 - dist / A.r, 2) : 0));
          if (dmg <= 0.0005) continue;
          sp.hp -= dmg;
          if (sp.hp <= 0) { this.collapse(b, sp, L.along, fx, events); continue; }
          this.deform(b, sp);
        }
      }
    }
    // Hư nặng: nhịp cầu võng xuống, lan can cong vênh
    deform(b, sp) {
      const k = clamp01((0.6 - sp.hp / sp.maxHp) / 0.6);
      if (k <= sp.sag + 0.02) return;
      sp.sag = k;
      sp.grp.position.y = -k * 1.8;
      sp.grp.rotation.z = (hash3(b.x, sp.a0, b.z) - 0.5) * 0.03 * k;
      sp.rails.forEach((r, i) => { r.rotation.z = (i ? 1 : -1) * k * 0.35; r.rotation.y = (hash3(sp.a1, i, b.z) - 0.5) * 0.12 * k; r.updateMatrix(); });
      sp.grp.updateMatrix();
      this.syncScars(b, sp);
    }
    collapse(b, sp, alongHit, fx, events) {
      sp.state = 'falling';
      const idx = b.spans.indexOf(sp);
      const prev = b.spans[idx - 1], next = b.spans[idx + 1];
      const leftOk = !prev || prev.state === 'ok', rightOk = !next || next.state === 'ok';
      // gãy ở đầu gần điểm nổ, đầu kia còn bám trụ làm bản lề -> nhịp cầu chúi xuống sông
      let hinge = alongHit < (sp.a0 + sp.a1) / 2 ? sp.a1 : sp.a0;
      if (hinge === sp.a1 && !rightOk && leftOk) hinge = sp.a0;
      else if (hinge === sp.a0 && !leftOk && rightOk) hinge = sp.a1;
      // nhịp sát bờ: đầu gối lên mố bờ làm bản lề, đầu trụ rơi xuống sông (không cắm đầu tự do vào bờ đất)
      const bankA0 = sp.a0 <= -b.length / 2 + 0.01, bankA1 = sp.a1 >= b.length / 2 - 0.01;
      if (bankA0 !== bankA1) hinge = bankA0 ? sp.a0 : sp.a1;
      const flat = !leftOk && !rightOk;
      const pivot = new THREE.Group();
      pivot.position.set(0, b.deckY, hinge);
      b.root.add(pivot);
      b.root.updateMatrixWorld(true);
      pivot.updateMatrixWorld(true);
      pivot.attach(sp.grp);
      sp.grp.matrixAutoUpdate = true;
      pivot.matrixAutoUpdate = true;
      const mw = { x: b.x + b.f.x * (sp.a0 + sp.a1) / 2, z: b.z + b.f.z * (sp.a0 + sp.a1) / 2 };
      const freeSign = hinge === sp.a0 ? 1 : -1;   // đầu tự do nằm phía +z cục bộ hay -z
      // Tư thế nằm cuối: đáy dầm (dày 4) chạm đất / lòng sông tại điểm đầu tiên dọc nhịp — tính trên đúng địa hình dưới cầu
      const TH = 4, gAt = (a) => this.T.groundAtRaw(b.x + b.f.x * a, b.z + b.f.z * a);
      const base = b.deckY - TH, NS = 10;
      // điểm ban đầu đã ngập trong đất (dầm gối trên mố bờ) không tính là chạm
      const clear = [];
      for (let k = 0; k <= NS; k++) clear.push(base - gAt(hinge + freeSign * sp.len * k / NS) > 0.5);
      let drop = 0, th = 0;
      if (flat) {
        // nhịp rơi phẳng: hạ tới khi điểm thấp nhất chạm đáy
        let clr = Infinity;
        for (let k = 0; k <= NS; k++) if (clear[k]) clr = Math.min(clr, base - gAt(hinge + freeSign * sp.len * k / NS));
        drop = Math.max(2, clr === Infinity ? 6 : clr);
      } else {
        // đầu bản lề tụt khỏi gối một chút (không lún xuống đất dưới gối), rồi chúi tới khi chạm
        drop = clear[0] ? Math.max(0, Math.min(3, base - gAt(hinge) - 0.3)) : 0;
        for (th = 0.02; th < 1.25; th += 0.01) {
          const c = Math.cos(th), sn = Math.sin(th);
          let touch = false;
          for (let k = 1; k <= NS && !touch; k++) {
            if (!clear[k]) continue;
            const d = sp.len * k / NS;
            if (b.deckY - drop - d * sn - TH * c <= gAt(hinge + freeSign * d * c)) touch = true;
          }
          if (touch) break;
        }
      }
      const ang = freeSign * th;
      const fallH = flat ? drop : drop + sp.len * Math.sin(th);
      // thời gian rơi theo trọng lực thật (rơi tự do √(2h/g); nhịp còn bản lề quay chậm hơn ~1,3 lần)
      const dur = Math.max(0.9, Math.min(3.2, Math.sqrt(2 * (Math.max(6, fallH) / 8) / 9.8) * (flat ? 1.05 : 1.3)));
      sp.pose = { hinge, py: b.deckY, th: 0 };
      this.broken = (this.broken || 0) + 1;
      this.anims.push({ b, sp, pivot, t: 0, dur, ang, drop, freeSign, hinge, splashed: false });
      this.sys.navDirty = true;
      this.sys.mapDirty = true;
      if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('collapse', { x: mw.x, y: b.deckY, z: mw.z }, 1.4, { mat: 'concrete', h: drop, floors: 1 });
      if (fx && fx.spawnDust && fx.palette) fx.spawnDust(mw.x, b.deckY, mw.z, 1.6, { micro: false }, fx.palette('WALL'), true, null);
      events.push({ type: 'bridgeCollapse', x: mw.x, z: mw.z });
    }
    update(dt, fx) {
      for (let i = this.anims.length - 1; i >= 0; i--) {
        const a = this.anims[i];
        a.t += dt;
        const u = Math.min(1, a.t / a.dur), e = u * u;   // rơi nhanh dần
        a.pivot.rotation.x = a.ang * e;
        a.pivot.position.y = a.b.deckY - a.drop * e;
        a.pivot.updateMatrix();
        // tư thế nhịp cho mặt đất xe (brokenDeckAt) & vết đạn trên mặt cầu rơi theo nhịp
        a.sp.pose = { hinge: a.hinge, py: a.pivot.position.y, th: Math.abs(a.ang * e) * a.freeSign };
        this.syncScars(a.b, a.sp);
        if (u >= 1 && !a.splashed) {
          a.splashed = true;
          a.sp.state = 'down';
          const fz = a.hinge + a.freeSign * a.sp.len * Math.cos(a.ang);   // đầu tự do đã chúi (gần bản lề hơn)
          const wx = a.b.x + a.b.f.x * fz, wz = a.b.z + a.b.f.z * fz;
          const ws = this.T.waterMesh ? this.T.waterMesh.position.y : 0;
          const wet = this.T.groundAtRaw(wx, wz) < 0.1;
          if (fx && fx.waterBurst && wet) fx.waterBurst(wx, ws, wz, 'HE', true, 6);
          else if (fx && fx.spawnDust && fx.palette) fx.spawnDust(wx, this.T.groundAtRaw(wx, wz), wz, 1.8, { micro: false }, fx.palette('WALL'), true, null);
          if (this.sys.debris) this.sys.debris.burst(wx, ws + 2, wz, 14, 1.6, [0.62, 0.6, 0.56], 90, 0.7);
          if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(wet ? 'splashBig' : 'slabImpact', { x: wx, z: wz }, 1.4);
          this.anims.splice(i, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------------ ỤN ĐẤT CỨ ĐIỂM: cháy sém + lõm dần (chỉ hình ảnh)
  function scorchMound(SS, x, y, z, R, amount) {
    if (!SS || !SS.items) return;
    for (const K of SS.items) {
      if (Math.abs(x - K.x) > 260 || Math.abs(z - K.z) > 260) continue;
      const m = K.group && K.group.getObjectByName('stronghold_mound');
      if (!m || !m.geometry) continue;
      const g = m.geometry, P = g.attributes.position, C = g.attributes.color;
      if (!g.userData.y0) g.userData.y0 = Float32Array.from({ length: P.count }, (_, i) => P.getY(i));
      m.updateMatrixWorld(true);
      const L = m.worldToLocal(new THREE.Vector3(x, y, z));
      let any = false;
      for (let i = 0; i < P.count; i++) {
        const dx = P.getX(i) - L.x, dz = P.getZ(i) - L.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const d = Math.sqrt(d2), w = 1 - d / R;
        // tâm cháy đen, vành đất bị hất (nâu), tích dần theo số phát
        const burn = Math.min(0.75, amount * w * w * 0.7);
        const r0 = C.getX(i), g0 = C.getY(i), b0 = C.getZ(i);
        // ụ đất dùng shader mặt đất: màu đỉnh là hệ số nhân lên màu địa hình (1 = nguyên màu) -> đích cháy là hệ số tối / ngả nâu
        const mul = g.userData.tintMul, inner = d < R * 0.5;
        const tr = mul ? (inner ? 0.26 : 0.64) : inner ? 0.11 : 0.36, tg = mul ? (inner ? 0.22 : 0.5) : inner ? 0.09 : 0.27, tb = mul ? (inner ? 0.2 : 0.42) : inner ? 0.07 : 0.18;
        C.setXYZ(i, r0 + (tr - r0) * burn, g0 + (tg - g0) * burn, b0 + (tb - b0) * burn);
        const ny = Math.max(g.userData.y0[i] - 3.5, P.getY(i) - amount * 1.4 * w * w);
        P.setY(i, ny);
        any = true;
      }
      if (any) { C.needsUpdate = true; P.needsUpdate = true; g.computeVertexNormals(); }
    }
  }

  // ------------------------------------------------------------------ HỆ THỐNG CHUNG (gắn vào BattleTerrain3D)
  class System {
    constructor(T, rockItems) {
      this.T = T;
      this.group = new THREE.Group();
      this.group.name = 'env_damage';
      T.group.add(this.group);
      this.scars = new Scars(this.group);
      this.debris = new Debris(this.group, T.rockTexture ? T.rockTexture() : null);
      this.rocks = new RockField(this, rockItems);
      this.bridges = new BridgeSet(this);
      this.navDirty = false;
      this.mapDirty = false;
    }

    // Sóng nổ / đạn tác động lên đá tảng, cầu, bê tông & ụ đất cứ điểm. info: { t: loại va chạm, nx, nz: pháp tuyến tường }
    damageAt(x, y, z, ammo, heavy, fx, info = {}) {
      const A = ammoOf(ammo, heavy);
      const events = [];
      this.rocks.damageAt(x, y, z, A, info, fx, events);
      this.bridges.damageAt(x, y, z, A, info, fx, events);
      const SS = this.T.strongholdSet;
      if (SS) this.fragmentScars(SS, x, y, z, ammo, heavy);
      if (SS && SS.covers(x, z, 8)) {
        if (info.t === 'WALL') this.concreteHit(x, y, z, info.nx, info.nz, ammo, A);
        else if (A.blast > 0.15 && A.r > 0) scorchMound(SS, x, y, z, Math.max(6, A.r * 0.9), A.blast);
      }
      // Mặt cầu: vết đạn / vỡ bê tông cộng dồn trên mặt đường
      if (!isBullet(ammo) && info.t === 'GROUND') {
        const br = this.bridges.at(x, z);
        if (br && Math.abs(y - br.y) < 3) this.concreteHit(x, br.y, z, 0, 0, ammo, A, true);
      }
      return events;
    }

    // Mảnh văng của quả nổ gần cứ điểm găm rỗ mặt bê tông (trước đây chỉ phát trúng thẳng mới để lại vết). Dò tia từ tâm nổ:
    // tự đúng che chắn & mặt quay về phía nổ; mật độ thưa theo bình phương khoảng cách; cộng dồn: rỗ -> mẻ dần
    fragmentScars(SS, x, y, z, ammo, heavy) {
      const F0 = { NORMAL: [240, 60], HE: [280, 80], RPG: [110, 20], ANTI_TANK_MISSILE: [140, 26], CLUSTER_SUBMUNITION: [90, 20] }[ammo];
      if (!F0) return;
      const fr = F0[0] * (heavy ? 1.6 : 1), rays = Math.round(F0[1] * (heavy ? 1.4 : 1));
      if (SS.near && !SS.near(x, z, fr)) return;
      const oy = y + 2;
      // số ngẫu nhiên sinh từ toạ độ điểm nổ (đã làm tròn như gói ENV_HIT) -> mọi máy vẽ vết ở cùng chỗ
      let sd = (Math.floor(x * 10) * 73856093 ^ Math.floor(y * 10) * 19349663 ^ Math.floor(z * 10) * 83492791) >>> 0;
      const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      for (let i = 0; i < rays; i++) {
        const az = rnd() * 6.283, el = Math.asin(Math.pow(rnd(), 1.6) * 0.82) + 0.02, ce = Math.cos(el);
        const ex = x + Math.cos(az) * ce * fr, ey = oy + Math.sin(el) * fr, ez = z + Math.sin(az) * ce * fr;
        // chỉ dò từng bước trong đoạn tia cắt vùng bao cứ điểm (dò cả tia ~380 đơn vị mỗi bước 2 đơn vị: ~15 ms / quả 155)
        let t0 = 1, t1 = 0;
        for (const K of SS.items) {
          const R = (typeof Strongholds !== 'undefined' && Strongholds.S && Strongholds.S.REACH) || 120;
          const dx = ex - x, dz = ez - z, fx = x - K.x, fz = z - K.z;
          const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - R * R;
          const disc = b * b - 4 * a * c;
          if (a < 1e-9 || disc < 0) continue;
          const sq = Math.sqrt(disc), ta = (-b - sq) / (2 * a), tb = (-b + sq) / (2 * a);
          if (tb < 0 || ta > 1) continue;
          t0 = Math.min(t0, Math.max(0, ta)); t1 = Math.max(t1, Math.min(1, tb));
        }
        if (t1 <= t0) continue;
        const P = (t) => [x + (ex - x) * t, oy + (ey - oy) * t, z + (ez - z) * t];
        const [ax, ay, az2] = P(t0), [bx, by, bz] = P(t1);
        const h = SS.segmentHit(ax, ay, az2, bx, by, bz);
        if (!h || h.type !== 'WALL' || !h.normal) continue;
        const d = Math.hypot(h.x - x, h.y - oy, h.z - z);
        if (d < 4) continue;
        const n = h.normal, e = 0.05 + 0.18 * Math.max(0, 1 - d / fr);
        this.scars.hit('c', 3, h.x, h.y, h.z, n.nx || 0, n.ny || 0, n.nz || 0, e, (v) => v < 0.35 ? 'c_pock' : v < 1.3 ? 'c_chip' : 'c_spall', { e0: 0.08 });
      }
    }

    // Bê tông (cứ điểm / mặt cầu): rỗ đạn -> mẻ vỡ -> bong mảng lộ cốt thép, cộng dồn theo ô 5 đơn vị
    concreteHit(x, y, z, nx, nz, ammo, A, up = false) {
      let n;
      if (up || nx === undefined || nx === null || (!nx && !nz)) n = { x: 0, y: 1, z: 0 };
      else { const l = Math.hypot(nx, nz) || 1; n = { x: nx / l, y: 0, z: nz / l }; }
      const tier = (e) => e < 0.35 ? 'c_pock' : e < 1.3 ? 'c_chip' : 'c_spall';
      const c1 = this.scars.hit('c', ammo === 'SCOUT_BULLET' || ammo === 'INCENDIARY' ? 3 : 5, x, y, z, n.x, n.y, n.z, A.e, tier, { e0: 0.2 });
      const c2 = (A.blast > 0.3 || ammo === 'INCENDIARY') ? this.scars.hit('s', 12, x, y, z, n.x, n.y, n.z, A.e, () => 'soot', { sizeMul: ammo === 'INCENDIARY' ? 0.35 : Math.min(1.6, 0.6 + A.r / 40) }) : null;
      // mặt cầu: vết bám nhịp cầu (võng / rơi theo nhịp)
      if (up) { this.bridges.tagScar(c1, x, z); this.bridges.tagScar(c2, x, z); }
    }

    // Đạn súng chạm đất (gọi từ hiệu ứng nổ, mọi máy tự vẽ): vết nhỏ theo loại đạn, cộng dồn theo ô ~2.5 đơn vị
    groundHit(x, z, ammo, dir) {
      const T = this.T;
      const y = this.surf(x, z);   // trong hố bom: vết nằm trên lòng hố nhìn thấy, không lơ lửng ở lưới vật lý
      const br = this.bridges.at(x, z);
      if (br) { this.concreteHit(x, br.y, z, 0, 0, ammo, ammoOf(ammo, false), true); return true; }
      const e = 1.5, hx = this.surf(x + e, z) - this.surf(x - e, z), hz = this.surf(x, z + e) - this.surf(x, z - e);
      const n = new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
      const A = ammoOf(ammo, false);
      const kind = ammo === 'INCENDIARY' ? 'g_burn' : ammo === 'GATLING_BULLET' ? 'g_hei' : 'g_pock';
      // đạn bay xiên: vết kéo dài theo hướng bay
      let opts = { e0: A.e };
      if (dir) {
        const fl = Math.hypot(dir.x || 0, dir.z || 0), sp = Math.hypot(fl, dir.y || 0) || 1;
        if (fl > 0.05) opts = { e0: A.e, stretch: 1 + (fl / sp) * 0.7, rot: Math.atan2(dir.z, dir.x) };
      }
      this.scars.hit('g', 2.5, x, y, z, n.x, n.y, n.z, A.e, () => kind, opts);
      return true;
    }

    // mặt đất nhìn thấy (lòng hố bom sâu hơn lưới vật lý) cho mảnh vụn & vết đạn trên đất
    surf(x, z) { return this.T.surfaceAt ? this.T.surfaceAt(x, z) : this.T.getElevationAt(x, z); }
    // Mặt đất trong vùng vừa đổi (hố bom mới / bị xoá): mảnh vụn, đá tảng, vết đạn trên đất đặt lại theo mặt mới
    reground(x0, z0, x1, z1) {
      const f = this._surf || (this._surf = (x, z) => this.surf(x, z));
      this.debris.reground(x0, z0, x1, z1, f);
      this.rocks.reground(x0, z0, x1, z1, this.T.surfaceAt ? (x, z) => this.T.surfaceAt(x, z, true) : f);
      this.scars.regroundGround(x0, z0, x1, z1, f);
    }

    update(dt, fx) {
      this.debris.update(dt, this._surf || (this._surf = (x, z) => this.surf(x, z)));
      this.bridges.update(dt, fx);
      if (this.navDirty) {
        this.navDirty = false;
        if (typeof Navigator !== 'undefined' && Navigator.invalidate) Navigator.invalidate(this.T);
      }
      if (this.mapDirty) {
        this.mapDirty = false;
        if (this.T.renderPrecomputedMap) this.T.renderPrecomputedMap();
      }
    }
  }

  return { AMMO, MAT, ammoOf, System, Scars, texture };
})();

if (typeof window !== 'undefined') window.EnvDamage = EnvDamage;
