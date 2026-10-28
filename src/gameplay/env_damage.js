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
    // 7.62mm súng máy nóc tháp (game.applyEnvDamage: SCOUT_BULLET + cờ m): ~0,3 sức phá 12.7, vết nhỏ hơn
    MG762: { kin: 0.006, blast: 0, r: 0, e: 0.03 },
    // đạn cháy 30mm (xe 6 nòng) ~ đạn 30mm thường; INCENDIARY_HMG: đạn cháy 12.7mm (xe trinh sát) ~ đạn 12.7 thường
    INCENDIARY: { kin: 0.05, blast: 0.04, r: 4, e: 0.1 },
    INCENDIARY_HMG: { kin: 0.02, blast: 0.01, r: 2, e: 0.06 },
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
  // Cầu bê tông cốt thép: đạn súng chỉ để vết, không trừ máu nhịp (trước 0,1: ~11.700 viên 12.7 vẫn sập được nhịp)
  const MAT = { rock: [0.9, 1.0, 0.35], bridge: [0.35, 0.8, 0] };
  const smallArms = (A) => A.blast < 0.1 && A.kin < 0.1;

  function ammoOf(ammo, heavy) {
    const a = AMMO[ammo] || AMMO.NORMAL;
    if (!heavy) return a;
    // lựu pháo 155mm: ~3 lần thuốc nổ đạn 120mm -> sức phá x2,1, tầm x1,45 (cùng hệ số với Destructibles HEAVY_K)
    return { kin: a.kin * 1.5, blast: a.blast * 2.1, r: a.r * 1.45, e: a.e * 2.5 };
  }
  // khung toạ độ của một mặt bê tông theo pháp tuyến: n, t (ngang), b (dọc theo mặt, hướng lên)
  function faceFrame(nx, ny, nz) {
    const n = new THREE.Vector3(nx, ny || 0, nz).normalize();
    const t = new THREE.Vector3(-n.z, 0, n.x);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0); else t.normalize();
    const b = new THREE.Vector3().crossVectors(n, t);
    if (b.y < 0) b.negate();
    return { n, t, b };
  }
  const isInc = (ammo) => ammo === 'INCENDIARY' || ammo === 'INCENDIARY_HMG';
  const isBullet = (ammo) => ammo === 'SCOUT_BULLET' || ammo === 'MG762' || ammo === 'GATLING_BULLET' || isInc(ammo);
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
        // thép lộ: vài thanh gỉ sẫm cong vênh, đứt đoạn (không kẻ ô đều)
        g.strokeStyle = 'rgba(66,44,30,0.9)'; g.lineWidth = 2.4;
        for (let i = -2; i <= 2; i++) for (const v of [0, 1]) {
          if (rnd() < 0.4) continue;
          const o = i * 15 + (rnd() - 0.5) * 6, bow = (rnd() - 0.5) * 14, e0 = 22 + rnd() * 20, e1 = 22 + rnd() * 20;
          g.beginPath();
          if (v) { g.moveTo(c - e0, c + o); g.quadraticCurveTo(c, c + o + bow, c + e1, c + o + (rnd() - 0.5) * 8); }
          else { g.moveTo(c + o, c - e0); g.quadraticCurveTo(c + o + bow, c, c + o + (rnd() - 0.5) * 8, c + e1); }
          g.stroke();
        }
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
  // số vết giữ lại mỗi loại (mỗi vết là 1 ô cộng dồn ~2.5 đơn vị; đầy thì ô cũ nhất bị thay) — đủ cho cả trận xả đạn liên thanh
  const POOL_CAP = { g_pock: 3000, g_hei: 3000, g_burn: 1200, c_pock: 2000, c_chip: 1200, c_spall: 400, soot: 600, r_chip: 800 };
  // vết đạn trên đất (g_*): 12.7mm lỗ phễu ~5 cm + quạt cát ~30 cm; 30mm nổ-mảnh hố ~25 cm + muội & rỗ mảnh ~0,8 m (8 đơn vị = 1 m)
  // g_hei: vết cháy 30mm nổ-mảnh trên đất ~0,55 m (trước 6,5 đv ~0,8 m — to ngang vết bom con)
  const BASE_SIZE = { g_pock: 2.6, g_hei: 4.5, g_burn: 5.5, c_pock: 2.4, c_chip: 4.8, c_spall: 13, soot: 18, r_chip: 5 };

  const GROUND_MARK = { g_pock: 'pock', g_hei: 'hei', g_burn: 'burn' };
  const DEF_TINT = [0.84, 0.79, 0.72];

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
      // Vết đạn trên đất: shader nhân màu đất bên dưới + nổi khối theo nắng (ExplosionFX), 4 biến thể hình dạng
      const gm = GROUND_MARK[kind];
      if (gm && typeof ExplosionFX !== 'undefined' && ExplosionFX.bulletMarkMesh) {
        const im = ExplosionFX.bulletMarkMesh(gm, cap);
        im.matrixAutoUpdate = false;
        this.parent.add(im);
        P = this.pools[kind] = { im, cap, next: 0, owner: new Array(cap).fill(null), pos: new Float32Array(cap * 3), mark: true };
        return P;
      }
      // rỗ / mẻ bê tông do đạn: dùng texture hố mẻ bê tông tươi có pháp tuyến của ExplosionFX nếu có
      // (đá tảng cũng vậy: texture vẽ tay hình sao răng cưa trắng trước đây trông như lá cây dán lên mặt đá, không có khối)
      const pit = (kind === 'c_pock' || kind === 'c_chip' || kind === 'r_chip') && typeof ExplosionFX !== 'undefined' && ExplosionFX._pitTex ? ExplosionFX._pitTex(kind === 'c_pock' ? 'concretePit' : 'concretePitHE', 0) : null;
      const mat = pit
        ? new THREE.MeshStandardMaterial({ map: pit.map, normalMap: pit.normal, roughness: 0.92, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })
        : new THREE.MeshLambertMaterial({ map: texture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      if ((kind[0] === 'c' || kind === 'soot') && typeof Strongholds !== 'undefined' && Strongholds.holeDiscard) Strongholds.holeDiscard(mat);
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
      if (P.mark) {
        // màu đất lật theo vật liệu; càng nhiều phát dồn vào ô vết càng đậm
        const t = cell.tint || DEF_TINT;
        this._c.setRGB(t[0], t[1], t[2]);
        P.im.geometry.attributes.iMark.setXY(cell.idx, cell.variant, 1 + Math.min(1.2, 0.14 * (cell.hits - 1)));
        P.im.geometry.attributes.iMark.needsUpdate = true;
      } else {
        // mẻ đá: mặt vỡ tươi chỉ sáng hơn mặt đá phong hóa một chút (texture hố là bê tông mới, rất sáng) -> nhuộm xám ấm
        const k = cell.kind === 'r_chip' ? 0.62 : 1;
        this._c.setRGB(cell.shade * k, cell.shade * k * 0.97, cell.shade * k * 0.92);
      }
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
        cell = { key, kind: null, idx: undefined, e: 0, hits: 0, x, y, z, nx, ny, nz, rot: hash3(x, y, z) * 6.283, variant: Math.floor(hash3(z, x, y) * 4) & 3 };
        this.cells.set(key, cell);
      } else {
        // dồn tâm vết về trung bình các phát trúng
        const w = 1 / (cell.hits + 1);
        cell.x += (x - cell.x) * w; cell.y += (y - cell.y) * w; cell.z += (z - cell.z) * w;
      }
      cell.e += energy;
      cell.hits++;
      if (opts.tint) cell.tint = opts.tint;
      if (opts.maxSize) cell.maxSize = Math.min(cell.maxSize || Infinity, opts.maxSize);
      if (opts.stretch) { cell.stretch = Math.max(cell.stretch || 1, opts.stretch); cell.rot = opts.rot !== undefined ? opts.rot : cell.rot; }
      const kind = tierFn(cell.e);
      if (cell.kind && cell.kind !== kind) this.unplace(cell);
      cell.kind = kind;
      const base = BASE_SIZE[kind] || 4;
      // càng nhiều phát dồn vào một chỗ vết càng rộng & đậm (log để không phình vô hạn)
      cell.size = base * Math.min(2.4, 1 + 0.45 * Math.log2(1 + cell.e / (opts.e0 || energy || 0.1) / 3)) * (opts.sizeMul || 1);
      if (cell.maxSize) cell.size = Math.min(cell.size, cell.maxSize);
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
  // trọng lực thật theo tỉ lệ thế giới (8 đv = 1 m -> 78,5 đv/s², cùng GRAV của explosion_fx / ballistics); trước đây 98 (x1,25)
  const DEB_G = 78.5, DEB_VK = Math.sqrt(DEB_G / 260);
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
        // vận tốc truyền vào theo trọng lực cũ 260 -> thu √(g/260): giữ tầm văng & độ cao, thời gian bay như thật
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
        p.vy -= DEB_G * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.w * dt; p.rz += p.w * 0.7 * dt;
        // gần đất mới dò đủ các đỉnh (mảnh nằm nghiêng trên dốc không cắm một nửa vào sườn dốc) — và chỉ khi đang rơi xuống:
        // vừa nảy lên thì đang rời đất, khỏi dò 12 điểm mỗi khung
        const g0 = groundAt(p.x, p.z), ext = Math.max(p.s, p.sy);
        const gy = p.y - g0 > ext * 1.3 ? g0 + ext : p.vy > 0 && p.y > g0 ? g0 - ext : this.contactY(p, groundAt);
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
  // hệ số nứt vỡ khi xe đè / ủi theo loại đá (cường độ nén: sa thạch ~50 MPa, đá vôi / đá thường ~100, granite ~200+ và dai)
  const ROCK_CRUSH = { sandstone: 1, stone: 0.45, granite: 0.08 };
  class RockField {
    constructor(sys, items) {
      this.sys = sys; this.T = sys.T;
      this.items = items || [];
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
      for (const it of this.items) {
        // máu theo cỡ đá: đá nhỏ 1-2 phát pháo tăng, tảng to nhất ~9 phát nổ phá / ~13 phát xuyên giáp, 2-3 phát lựu pháo;
        // súng máy 12.7mm gần như không sứt. (Trước đây máu ~ thể tích: tảng lớn ~50 máu = ~40 phát pháo tăng mới vỡ)
        it.maxHp = it.hp = Math.max(0.35, Math.pow(Math.min(it.r, 26) / 10, 1.5) * Math.sqrt(Math.min(it.h, 30) / 10) * 1.6);
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
        // đạn nổ trên xe đậu sát đá / nổ cận đích: không phải trúng thẳng vào đá (chỉ sức nổ lan)
        const direct = (dist < 3 || info.t === 'BOULDER') && info.t !== 'DIRECT_HIT' && info.t !== 'PROXIMITY';
        // đạn xuyên động năng (không có thuốc nổ): mũi tên khoan một lỗ / bóc một mảng, hiếm khi chẻ đôi được tảng đá lớn
        // như đạn nổ (trước đây ~12 phát AP chẻ tảng lớn nhất, gần bằng 8 phát nổ mạnh)
        const kinK = A.blast < 0.05 && A.kin > 0.5 ? 0.4 : 1;
        let dmg = sk * ((direct ? A.kin * mk * kinK : 0) + (A.r > 0 && dist < A.r ? A.blast * mb * Math.pow(1 - dist / A.r, 2) : 0));
        if (dmg <= 0.0005) continue;
        it.hp -= dmg;
        // vết mẻ / ám khói trên mặt đá, ngay phía điểm nổ
        const cy = it.y + it.h * 0.35;
        const n = new THREE.Vector3(x - it.x, (y - cy) * 0.8, z - it.z);
        if (n.lengthSq() < 1e-4) n.set(0, 1, 0);
        n.normalize();
        const k = it.hp / it.maxHp;
        const sc = this.scaleK(it, k);
        // trúng trực tiếp: vết đúng chỗ đạn chạm (trước đây đặt trên hình trụ giả định quanh tâm đá -> đá méo thì vết
        // lơ lửng ngoài mép hoặc chìm vào trong); nổ gần: vết ở phía điểm nổ như cũ
        let px = it.x + n.x * it.r * 0.9 * sc, py = cy + n.y * it.h * 0.6 * sc, pz = it.z + n.z * it.r * 0.9 * sc;
        if (direct) { px = x; py = y; pz = z; }
        if (it.hp > 0) {
          // đạn súng: mẻ nhỏ ~25-30 cm mỗi chỗ (12.7mm / 30mm vào đá cứng chỉ bóc một lớp), ô cộng dồn nhỏ để các phát tách nhau
          const sa = smallArms(A);
          this.attachScar(it, this.sys.scars.hit('r', sa ? 2.5 : 5, px, py, pz, n.x, n.y, n.z, A.e, () => 'r_chip', { e0: 0.3, sizeMul: sa ? 0.45 : 1 }));
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
      // vòng va chạm (chặn xe / đạn / nòng) co theo hình: trước đây giữ cỡ ban đầu -> quanh đá đã mẻ còn vành vô hình rộng
      // gần gấp đôi (xe bị chặn cách đá cả mét, đạn nổ vào khoảng không). Đá thấp đi thì có thể thành đá xe trèo qua được
      const bo = it.boulder;
      if (bo) {
        if (bo.r0 === undefined) { bo.r0 = bo.radius; bo.h0 = bo.height; }
        bo.radius = bo.r0 * s; bo.height = bo.h0 * s;
      }
      // càng nát càng sậm màu (bụi khói bám, vết nứt)
      const c = 0.55 + 0.45 * k;
      it.im.setColorAt(it.k, new THREE.Color(it.color.r * c, it.color.g * c, it.color.b * c));
      if (it.im.instanceColor) it.im.instanceColor.needsUpdate = true;
      // đá nhỏ dần / lún: vết mẻ cũ co vào theo mặt đá (không lơ lửng ngoài không khí)
      if (it.scarCells && it.scarCells.size) this.syncScars(it, s);
    }
    // ---- XE ĐÈ / HÚC / ỦI ĐÁ TẢNG (terrain.ramObjects, mọi xe mọi khung, cả xe bản sao mạng — mọi máy cùng thấy)
    // ob: hộp thân xe (VehicleCollision.vehObb). Đá thấp xe trèo qua (terrain.lowRock): đá nằm dưới dải xích / bánh gánh
    // một phần trọng lượng xe -> nứt dần theo tải (xe tăng 60 t ~ x1, xe 6 nòng 65 t nhỉnh hơn, xe bánh lốp gần như không
    // sứt — lốp cao su dàn tải). Đá cao chặn xe: cú húc đầu theo động năng xe, tì ủi liên tục theo lực kéo bám đất (lưỡi
    // ủi dồn hết lực lên lưỡi cắt: x3,6; khiên V x2,4). Đá to (> ~1,2 m) tì ủi khó nứt hơn theo cỡ.
    // Theo loại đá (ROCK_CRUSH): sa thạch giòn vỡ nhanh, đá vôi / đá thường chậm hơn ~2 lần, granite gần như không vỡ —
    // xe tăng đứng ủi cả phút mới chẻ được tảng vừa, cán qua chỉ để lại vết mẻ
    crush(unit, ob, dt, fx) {
      if (!this.items.length || !dt || typeof VehicleCollision === 'undefined') return;
      const VC = VehicleCollision, T = this.T, m = unit.mass || 40, tracked = !unit.isWheeled;
      const R = Math.hypot(ob.hu, ob.hv) + 30, cg = this._cg || (this._cg = {});
      const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      const a = unit.bodyAngle || 0, fwx = -Math.sin(a), fwz = -Math.cos(a);
      let front = 0;
      if (unit.tankType === 'GATLING' && typeof VehicleDamage !== 'undefined' && VehicleDamage.hasPart) {
        if ((!unit.frontId || unit.frontId === 'dozer') && VehicleDamage.hasPart(unit, 'dozer')) front = 3.6;
        else if (unit.frontId === 'vshield' && (VehicleDamage.hasPart(unit, 'appliqueVSL') || VehicleDamage.hasPart(unit, 'appliqueVSR'))) front = 2.4;
      }
      for (const it of this.items) {
        const bo = it.boulder;
        if (!it.alive || !bo || Math.abs(it.x - ob.cx) > R || Math.abs(it.z - ob.cz) > R) continue;
        const K = ROCK_CRUSH[it.kind] || ROCK_CRUSH.stone, rad = bo.radius || it.r;
        let dmg = 0, px, py, pz, nx = 0, ny = 1, nz = 0;
        if (T.lowRock && T.lowRock(bo, unit)) {
          // đá nằm dưới thân xe: dải xích / bánh ở 2 mép hộp thân (~45% bề ngang ngoài); giữa 2 dải là gầm — đá cao hơn
          // khoảng sáng gầm (~3,4 đv) mới bị bụng xe tì
          const tx = it.x - ob.cx, tz = it.z - ob.cz, lu = tx * ob.ux + tz * ob.uz, lv = -tx * ob.uz + tz * ob.ux;
          if (Math.abs(lu) > ob.hu + rad * 0.5 || Math.abs(lv) > ob.hv + rad * 0.3) continue;
          const share = Math.abs(lu) + rad * 0.6 > ob.hu * 0.55 ? 1 : (bo.height || 0) > 3.4 ? 0.5 : 0;
          if (!share) continue;
          dmg = K * Math.pow(m / 60, 1.5) * 1.3 * share * (tracked ? 1 : 0.3) * dt;
          px = it.x; py = it.y + (bo.height || it.h * 0.6); pz = it.z;
        } else {
          VC.circleGap(ob, it.x, it.z, rad, cg);
          if (cg.gap > 1) { if (it._rcU === unit.id) it._rcU = null; continue; }
          const vn = VC.approach(unit, cg.nx, cg.nz);
          if (vn <= 0.3) continue;
          // cú húc đầu (xe chưa tì đá này trong ~0,4 s): động năng phần áp vào đá; đá chặn khiến tốc độ khung đầu đã hụt ~1/3
          const first = !(it._rcU === unit.id && now - it._rcT < 0.4);
          it._rcU = unit.id; it._rcT = now;
          const blade = front && -(cg.nx * fwx + cg.nz * fwz) > 0.6 ? front : 1;
          if (first) dmg += K * 0.5 * m * 1000 * (vn / 8) * (vn / 8) / 1e6 * (tracked ? 1 : 0.45) * (blade > 1 ? 1.4 : 1);
          dmg += K * (VC.tractive(unit) / 4e5) * 0.25 * blade / Math.max(1, it.r / 10) * dt;
          nx = cg.nx; ny = 0.3; nz = cg.nz;
          px = it.x + cg.nx * rad * 0.9; py = it.y + Math.min(it.h * 0.4, 6); pz = it.z + cg.nz * rad * 0.9;
        }
        if (dmg > 0) this.crushHit(it, dmg, px, py, pz, nx, ny, nz, fx);
      }
    }
    // Tích hư hại do xe đè / ủi: hình đá, vết mẻ, vụn văng, tiếng nứt chỉ cập nhật theo nấc (mỗi ~10% máu hoặc cú húc) —
    // không dựng lại ma trận / vết mỗi khung khi xích bò chậm trên đá
    crushHit(it, dmg, px, py, pz, nx, ny, nz, fx) {
      it.hp -= dmg;
      if (it.hp <= 0) { this.shatter(it, fx, []); return; }
      it._cAcc = (it._cAcc || 0) + dmg;
      if (it._cAcc < Math.max(0.05, it.maxHp * 0.1)) return;
      const e = it._cAcc; it._cAcc = 0;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.attachScar(it, this.sys.scars.hit('r', 4, px, py, pz, nx / l, ny / l, nz / l, 0.5, () => 'r_chip', { e0: 0.3, sizeMul: 0.7 }));
      this.reshape(it, it.hp / it.maxHp);
      if (this.sys.debris) this.sys.debris.burst(px, py, pz, Math.min(8, 2 + Math.round(e * 6)), Math.max(0.5, it.r * 0.05), it.col, 40 + e * 40);
      if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt && (!this._crSnd || performance.now() - this._crSnd > 180)) {
        this._crSnd = performance.now();
        window.soundEngine.secondaryAt('rockSplit', { x: px, y: py, z: pz }, Math.min(0.7, 0.25 + e * 0.6), { h: 2 });
      }
    }
    shatter(it, fx, events) {
      it.alive = false;
      // đống vụn thấp tại chỗ (xe đi qua xóc nhẹ — terrain.vehicleDebris)
      if (this.T.rockRubble) {
        const gy = this.T.groundAtRaw ? this.T.groundAtRaw(it.x, it.z) : it.y;
        this.T.rockRubble.push({ bump: true, mat: 'rock', x: it.x, z: it.z, r: it.r * 0.85, base: gy, top: gy + Math.min(2.6, it.h * 0.18) });
      }
      it.im.setMatrixAt(it.k, new THREE.Matrix4().makeScale(0, 0, 0));
      it.im.instanceMatrix.needsUpdate = true;
      this.sys.scars.removeNear(it.x, it.y + it.h * 0.4, it.z, it.r * 1.6 + 6);
      // mất va chạm (đạn bay qua, xe đi qua đống vụn)
      if (it.boulder) {
        const bi = this.T.boulders.indexOf(it.boulder);
        if (bi >= 0) this.T.boulders.splice(bi, 1);
        this.sys.markNav(it.x, it.z, (it.boulder.radius || it.r || 18) + 60);
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

  // Bê tông cầu: hạt sần, mảng loang ố, mạch ván khuôn ngang, vệt nước mưa chảy dọc từ mép trên xuống (canvas trên = mặt
  // trên khối); walk: tấm đan vỉa hè có ron. 1 ô texture = 48 đơn vị (6 m)
  const BR_TEX = {};
  function bridgeTex(walk) {
    const k = walk ? 'walk' : 'conc';
    if (BR_TEX[k]) return BR_TEX[k];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = walk ? '#a29d92' : '#a19d94'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 20 + Math.random() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r), dark = Math.random() < 0.6;
      gr.addColorStop(0, dark ? 'rgba(60,58,50,0.16)' : 'rgba(210,205,192,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(40,38,34,0.18)' : 'rgba(225,220,210,0.14)'; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
    if (walk) {
      g.strokeStyle = 'rgba(50,48,44,0.55)'; g.lineWidth = 1.5;
      for (let p = 0; p <= 256; p += 64) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); }
    } else {
      g.fillStyle = 'rgba(60,58,52,0.18)';
      for (let y = 42; y < 256; y += 85) g.fillRect(0, y, 256, 1.5);
      for (let i = 0; i < 46; i++) {
        const x = Math.random() * 256, L = 30 + Math.random() * 150, w = 1 + Math.random() * 4;
        const gr = g.createLinearGradient(0, 0, 0, L);
        gr.addColorStop(0, 'rgba(48,46,40,0.28)'); gr.addColorStop(1, 'rgba(48,46,40,0)');
        g.fillStyle = gr; g.fillRect(x, 0, w, L);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return (BR_TEX[k] = t);
  }
  // UV chiếu hộp theo pháp tuyến + màu đỉnh: gầm cầu / mặt dưới tối (khuất sáng trời), chân trụ dưới ngấn nước rêu tối xanh,
  // mặt đứng tối dần xuống dưới. oy: cao độ gốc của mesh (y thế giới = y hình học + oy)
  // ao: hệ số khuất sáng (chi tiết dưới gầm cầu: dầm, vách ngăn — mặt hướng lên cũng không thấy trời)
  function weatherGeo(geo, oy, ao = 1) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, S = 48;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, x / S, z / S);
      else if (ax >= az) uv.setXY(i, z / S, y / S);
      else uv.setXY(i, x / S, y / S);
      const wy = y + oy;
      let k = (n.getY(i) < -0.5 ? 0.62 : n.getY(i) > 0.5 ? 1 : 0.72 + 0.22 * Math.max(0, Math.min(1, (wy + 2) / 14))) * ao;
      let r = k, gg = k, b = k;
      if (wy < 1.2) { r *= 0.58; gg *= 0.64; b *= 0.55; }          // ngấn nước + rêu
      else if (wy < 3) { r *= 0.8; gg *= 0.82; b *= 0.76; }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    uv.needsUpdate = true;
  }

  // Hố đạn trên mặt cầu: lòng sẫm rỗ, viền bê tông vỡ xám (không trắng loá), quầng muội khói mờ dần ra ngoài; deep: lộ lưới
  // thép gỉ sẫm, đan lệch (thanh cong, đứt) — hố nông chỉ bong lớp mặt, không thấy thép
  const HOLE_TEX = {};
  function holeTex(deep) {
    const key = deep ? 'deep' : 'spall';
    if (HOLE_TEX[key]) return HOLE_TEX[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    let q = deep ? 500 : 1; const rnd = () => hash3(q++, 3.7, 9.1);
    const soot = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    soot.addColorStop(0, 'rgba(30,28,25,0.75)'); soot.addColorStop(0.7, 'rgba(36,34,30,0.35)'); soot.addColorStop(1, 'rgba(40,38,34,0)');
    g.fillStyle = soot; g.fillRect(0, 0, 128, 128);
    // lòng hố: đa giác lởm chởm, mép bê tông vỡ xám
    const poly = (R0, jit) => { g.beginPath(); for (let i = 0; i <= 22; i++) { const a = i / 22 * 6.283, r = R0 * (1 - jit + 2 * jit * rnd()); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); };
    poly(36, 0.16); g.fillStyle = 'rgb(104,100,93)'; g.fill();
    poly(29, 0.18); g.fillStyle = deep ? 'rgb(34,32,29)' : 'rgb(70,67,62)'; g.fill();
    for (let i = 0; i < 700; i++) { const a = rnd() * 6.283, r = rnd() * 38; g.fillStyle = rnd() < 0.55 ? 'rgba(22,21,19,0.45)' : 'rgba(150,146,138,0.3)'; g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }
    return (HOLE_TEX[key] = new THREE.CanvasTexture(c));
  }

  // ------------------------------------------------------------------ CẦU BÊ TÔNG NHIỀU NHỊP, SẬP ĐƯỢC
  // Kết cấu dầm giản đơn: mỗi nhịp gối lên 2 trụ / mố -> nhịp chỉ đứng khi CẢ 2 gối còn (không phụ thuộc nhịp bên cạnh).
  // Nhịp chia thành nhiều đốt (đốt = mảnh gãy): trúng giữa nhịp khi 2 gối còn -> gãy chữ V (2 mảng gục vào giữa, thép lòi
  // ở mép gãy); trúng sát gối -> đứt đầu đó, cả nhịp chúi quanh gối còn lại; mất 1 gối -> chúi quanh gối kia; mất cả 2 ->
  // rơi phẳng. Trụ có máu riêng: trụ đổ kéo sập 2 nhịp gối lên nó. Hư hại theo vị trí trúng (giữa nhịp mô men uốn lớn
  // nhất, trúng dầm từ bên dưới nặng hơn, trúng mép lan can nhẹ hơn). Đạn nổ khoét hố trên mặt cầu (xe đi qua sụp bánh),
  // hố to thủng xuyên bản mặt, lộ thép. Mọi ngẫu nhiên băm theo toạ độ (hash3) -> mọi máy cùng 1 kết quả.
  // Sơn lan can thép: xanh xám bạc màu, tróc sơn lộ gỉ nâu, vệt gỉ chảy dọc (v = dọc thanh)
  let RAIL_TEX = null;
  function railTex() {
    if (RAIL_TEX) return RAIL_TEX;
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    let q = 11; const rnd = () => hash3(q++, 1.3, 5.7);
    g.fillStyle = '#5d6a64'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 1400; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(30,34,32,0.12)' : 'rgba(170,180,174,0.1)'; g.fillRect(rnd() * 64, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 3); }
    for (let i = 0; i < 26; i++) {   // mảng tróc sơn lộ gỉ
      const x = rnd() * 64, y = rnd() * 256, r = 2 + rnd() * 7;
      g.fillStyle = 'rgba(110,62,34,0.85)'; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd()), rnd() * 3, 0, 6.3); g.fill();
      g.fillStyle = 'rgba(70,40,24,0.6)'; g.beginPath(); g.ellipse(x, y, r * 0.5, r * 0.4, 0, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 14; i++) {   // vệt gỉ chảy
      const x = rnd() * 64, y = rnd() * 200, L = 20 + rnd() * 60, gr = g.createLinearGradient(0, y, 0, y + L);
      gr.addColorStop(0, 'rgba(120,66,36,0.55)'); gr.addColorStop(1, 'rgba(120,66,36,0)');
      g.fillStyle = gr; g.fillRect(x, y, 1.5 + rnd() * 2, L);
    }
    RAIL_TEX = new THREE.CanvasTexture(c);
    RAIL_TEX.wrapS = RAIL_TEX.wrapT = THREE.RepeatWrapping;
    return RAIL_TEX;
  }
  // gộp nhiều hình (cùng vật liệu) thành 1 -> 1 lệnh vẽ cho cả đoạn lan can
  function mergeGeos(list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      P.set(g.attributes.position.array, ov * 3); N.set(g.attributes.normal.array, ov * 3); U.set(g.attributes.uv.array, ov * 2);
      if (g.index) { const idx = g.index.array; for (let k = 0; k < idx.length; k++) I[oi + k] = idx[k] + ov; oi += idx.length; }
      else { for (let k = 0; k < c; k++) I[oi + k] = ov + k; oi += c; }
      ov += c;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    out.setIndex(new THREE.BufferAttribute(I, 1));
    out.computeBoundingSphere();
    return out;
  }

  class BridgeSet {
    constructor(sys) {
      this.sys = sys;
      const T = this.T = sys.T;
      this.items = [];
      this.anims = [];
      const list = (T.map && T.map.bridges) || [];
      if (!list.length) return;
      const conc = this.conc = new THREE.MeshStandardMaterial({ map: bridgeTex(false), color: 0xd8d4cc, vertexColors: true, roughness: 0.93 });
      const walkMat = new THREE.MeshStandardMaterial({ map: bridgeTex(true), color: 0xb4afa6, vertexColors: true, roughness: 0.95 });
      const steel = new THREE.MeshStandardMaterial({ map: railTex(), color: 0xc8d0cc, roughness: 0.62, metalness: 0.45 });
      const rubber = new THREE.MeshStandardMaterial({ color: 0x1e1f1f, roughness: 0.9, metalness: 0 });
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6b6f6e, roughness: 0.6, metalness: 0.4 });
      const jointMat = new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 0.6, metalness: 0.7 });
      this.rebarMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1e, roughness: 0.7, metalness: 0.5 });
      this.rebarGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 4);
      this.holeDeepMat = new THREE.MeshStandardMaterial({ map: holeTex(true), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.holeMat = new THREE.MeshStandardMaterial({ map: holeTex(false), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.voidMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0a });
      const asphaltMat = {};
      const asphalt = (lanes) => {
        const k = lanes === 4 ? 'asphalt4' : 'asphalt';
        return asphaltMat[k] || (asphaltMat[k] = new THREE.MeshStandardMaterial({ map: T.roadTexture(k), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      };
      for (const b of list) {
        const f = { x: Math.sin(b.angle), z: Math.cos(b.angle) };
        const hA = T.groundAtRaw(b.x - f.x * b.length / 2, b.z - f.z * b.length / 2);
        const hB = T.groundAtRaw(b.x + f.x * b.length / 2, b.z + f.z * b.length / 2);
        const urban = !!b.urban;
        const deckY = urban ? Math.max(hA, hB) + 0.3 : Math.max(4, Math.max(hA, hB) + 1.2);
        // cầu đô thị: mặt cầu vồng lên giữa kênh (sin² -> 2 đầu tiếp tuyến mặt phố, dốc tối đa ~12°), bản mặt 0,75 m + 4 dầm
        // chữ I, vỉa hè 2 bên cao 25 cm, tường chắn + tay vịn (8 đơn vị = 1 m); cầu sông giữ mặt phẳng như cũ
        const rise = urban ? Math.min(16, b.length * 0.065) : 0;
        const arch = (al) => rise * Math.pow(Math.sin(Math.PI * (al / b.length + 0.5)), 2);
        const TH = urban ? 6 : 4, GD = urban ? 5 : 0, walk = urban ? (b.walk || 0) : 0;
        // uốn hình học theo mặt vồng (z hình học = toạ độ dọc cầu)
        // dầm dưới gầm: đáy không thấp hơn mặt nước + 0,15 m — gần bờ (mặt cầu thấp) dầm thu dần vào bản mặt (dầm vút)
        const lowY = (T.waterLevel !== undefined ? T.waterLevel : 0.2) + 1.2;
        const bendG = (geo) => { bend(geo); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const cap = deckY - TH + arch(p.getZ(i)) - 0.2; p.setY(i, Math.min(cap, Math.max(p.getY(i), lowY + (p.getY(i) - (deckY - TH - GD + arch(p.getZ(i)))) * 0.3))); } geo.computeVertexNormals(); return geo; };
        const bend = (geo) => {
          const p = geo.attributes.position;
          for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + arch(p.getZ(i)));
          geo.computeVertexNormals();
          return geo;
        };
        const root = new THREE.Group();
        root.position.set(b.x, 0, b.z);
        root.rotation.y = b.angle;
        // trụ cầu (cầu đô thị: 2 trụ trong lòng kênh, nhịp giữa dài nhất)
        const pz = [];
        if (urban) pz.push(-Math.round(b.length * 0.15), Math.round(b.length * 0.15));
        else for (let z = -b.length / 2 + 40; z < b.length / 2 - 30; z += 55) pz.push(z);
        const piers = [];
        for (const z of pz) {
          const top = deckY - TH - GD + arch(z), grp = new THREE.Group();
          const pier = { z, top, bottom: -16, halfW: b.width * (urban ? 0.31 : 0.35), thick: urban ? 9 : 7, grp, state: 'ok' };
          if (urban) {
            // xà mũ đỡ dầm + thân trụ dạng tường mũi tròn, chân cắm xuống đáy kênh
            const cap = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.62 + 9, 6, 11), conc);
            cap.position.set(0, top - 3, z); cap.castShadow = cap.receiveShadow = true; grp.add(cap);
            const H = top - 6 + 18;
            const body = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.62, H, 9), conc);
            body.position.set(0, top - 6 - H / 2, z); body.castShadow = true; grp.add(body);
            for (const sd of [-1, 1]) {
              const nose = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, H, 12, 1, false, 0, Math.PI), conc);
              nose.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2;
              nose.position.set(sd * b.width * 0.31, top - 6 - H / 2, z); grp.add(nose);
            }
          } else {
            const H = top + 16;
            const m = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.7, H, 7), conc);
            m.position.set(0, top - H / 2, z); m.castShadow = true; grp.add(m);
          }
          if (urban) {
            // gối cao su dưới mỗi dầm dọc (2 nhịp gối chung trụ: 2 hàng) + ống thoát nước mặt cầu chạy dọc thân trụ xuống sông
            for (let gi = 0; gi < 4; gi++) for (const dz of [-3, 3]) {
              const bg = new THREE.BoxGeometry(5, 1, 3); bg.translate((gi / 3 - 0.5) * b.width * 0.78, top - 0.4, z + dz);
              grp.add(new THREE.Mesh(bg, rubber));
            }
            for (const sd of [-1, 1]) {
              const yTop = deckY - TH + arch(z), Hp = yTop + 2;
              const pg = new THREE.CylinderGeometry(0.55, 0.55, Hp, 8); pg.translate(sd * (b.width / 2 - 4), yTop - Hp / 2, z + 6);
              grp.add(new THREE.Mesh(pg, pipeMat));
            }
          }
          root.add(grp);
          piers.push(pier);
        }
        // khe co giãn trên mỗi trụ: tấm thép răng lược phủ khe giữa 2 nhịp (thuộc trụ, ở lại khi nhịp sập)
        for (const z of pz) {
          const jg = new THREE.BoxGeometry(b.width - 1, 0.2, 1.2); jg.translate(0, deckY + arch(z) + 0.12, z);
          const j = new THREE.Mesh(jg, jointMat); j.receiveShadow = true;
          piers.find(p => p.z === z).grp.add(j);
        }
        // mố cầu 2 đầu (cầu đô thị): khối bê tông đỡ đầu dầm trên bờ
        if (urban) for (const sg of [-1, 1]) {
          const al = sg * (b.length / 2 - 9), top = deckY - TH + arch(al);
          const gy = T.groundAtRaw(b.x + f.x * al, b.z + f.z * al);
          const H = Math.max(4, top - gy + 14);
          const ab = new THREE.Mesh(new THREE.BoxGeometry(b.width + 4, H, 18), conc);
          ab.position.set(0, top - H / 2, al); ab.castShadow = ab.receiveShadow = true; root.add(ab);
        }
        const bounds = [-b.length / 2, ...pz, b.length / 2];
        const spans = [];
        for (let s = 0; s < bounds.length - 1; s++) {
          const a0 = bounds[s], a1 = bounds[s + 1], len = a1 - a0;
          const grp = new THREE.Group();
          const NSEG = Math.max(3, Math.min(6, Math.round(len / 20)));
          const segs = [], rails = [];
          for (let k = 0; k < NSEG; k++) {
            // đốt nhịp: mép 2 đầu nhịp chừa khe 0,15 (khe co giãn), giữa các đốt liền nhau
            const s0 = a0 + len * k / NSEG, s1 = a0 + len * (k + 1) / NSEG;
            const sl = s1 - s0, sm = (s0 + s1) / 2, nz = Math.max(1, Math.ceil(sl / 8));
            const g = new THREE.Group(), segRails = [];
            const box = (w, h, x, y, mat, under) => { const geo = new THREE.BoxGeometry(w, h, sl, 1, 1, nz); geo.translate(x, y, sm); const m = new THREE.Mesh(under ? bendG(geo) : bend(geo), mat); g.add(m); return m; };
            const deck = box(b.width, TH, 0, deckY - TH / 2, conc); deck.castShadow = deck.receiveShadow = true;
            for (let gi = 0; GD && gi < 4; gi++) {
              const gx = (gi / 3 - 0.5) * b.width * 0.78;
              const wm = box(3, GD, gx, deckY - TH - GD / 2, conc, true), fm = box(7, 1.6, gx, deckY - TH - GD + 0.8, conc, true);
              wm.castShadow = fm.castShadow = true; wm.userData.ao = 0.6; fm.userData.ao = 0.55;
            }
            // mặt nhựa: UV như dải đường (u ngang lòng đường, v dọc = quãng / 2 bề rộng) -> vạch làn khớp với phố 2 đầu
            const cw = urban ? b.width - 2 * walk : b.width - 6;
            const tg = new THREE.PlaneGeometry(cw, sl, 1, nz);
            tg.rotateX(-Math.PI / 2);
            tg.translate(0, deckY + 0.05, sm);
            { const p = tg.attributes.position, uv = tg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / cw + 0.5, p.getZ(i) / (cw * 2)); }
            const top = new THREE.Mesh(bend(tg), asphalt(urban ? b.lanes : 2));
            top.receiveShadow = true; g.add(top);
            for (const sd of [-1, 1]) {
              const cwid = urban ? walk : 3, ch = urban ? 2 : 1.6;
              box(cwid, ch, sd * (b.width / 2 - cwid / 2), deckY + ch / 2, urban ? walkMat : conc).receiveShadow = true;
              // lan can: nhóm đặt tại chân lan can (vênh / ngả quanh chân khi nhịp hư), hình học theo toạ độ tương đối
              const railG = new THREE.Group();
              railG.position.set(sd * (b.width / 2 - 1.2), deckY + ch, 0);
              let base = 0;
              const RH = urban ? 5 : 4.2;
              if (urban) {
                // tường chắn bê tông cao 0,45 m + 2 thanh tay vịn: tổng cao ~1,1 m
                // tường chắn thuộc đốt (bê tông không cong theo lan can thép)
                const geo = new THREE.BoxGeometry(2.4, 3.6, sl, 1, 1, nz); geo.translate(railG.position.x, deckY + ch + 1.8, sm);
                const par = new THREE.Mesh(bend(geo), conc); par.castShadow = true; g.add(par);
                base = 3.6;
              }
              // lan can thép: tay vịn ống tròn Ø ~10 cm + ống giữa Ø ~7 cm, cột thép hộp 7 cm có đế bắt bu lông xuống tường
              // chắn / bó vỉa mỗi 1 m, song chắn đứng Ø ~3 cm mỗi 12 cm; sơn xanh xám bạc màu, tróc sơn gỉ
              const parts = [];
              const pipe = (r, y) => { const geo = new THREE.CylinderGeometry(r, r, sl - 0.4, 8, nz, true); geo.rotateX(Math.PI / 2); geo.translate(0, y, sm); parts.push(geo); };
              pipe(0.42, base + RH);
              pipe(0.28, base + (urban ? RH * 0.45 : RH * 0.55));
              if (!urban) pipe(0.28, base + 0.8);
              for (let z = s0 + 2; z < s1 - 0.5; z += 8) {
                const post = new THREE.BoxGeometry(0.55, RH, 0.55); post.translate(0, base + RH / 2, z); parts.push(post);
                const plate = new THREE.BoxGeometry(1.5, 0.22, 1.5); plate.translate(0, base + 0.11, z); parts.push(plate);
              }
              for (let z = s0 + 1; z < s1 - 0.3; z += 1) {
                const bal = new THREE.CylinderGeometry(0.12, 0.12, RH - (urban ? 0.4 : 1.2), 4); bal.translate(0, base + (urban ? 0.2 : 0.8) + (RH - (urban ? 0.4 : 1.2)) / 2, z); parts.push(bal);
              }
              const rm = new THREE.Mesh(bend(mergeGeos(parts)), steel); rm.castShadow = true; railG.add(rm);
              railG.userData.sd = sd;
              g.add(railG); rails.push(railG); segRails.push(railG);
            }
            // dầm ngang (vách ngăn) nối 4 dầm dọc ở 2 đầu nhịp & giữa nhịp — gầm cầu nhìn ra kết cấu thật
            if (GD) for (const zd of [a0 + 2.5, (a0 + a1) / 2, a1 - 2.5]) {
              if (zd < s0 || zd >= s1) continue;
              const dg = new THREE.BoxGeometry(b.width * 0.78, GD * 0.85, 1.4); dg.translate(0, deckY - TH - GD * 0.45, zd);
              const dm = new THREE.Mesh(bendG(dg), conc); dm.castShadow = true; dm.userData.ao = 0.6; g.add(dm);
            }
            grp.add(g);
            segs.push({ a0: s0, a1: s1, g, rails: segRails });
          }
          root.add(grp);
          // nhịp bê tông cốt thép: đạn nổ 120 mm chỉ khoét hố mặt cầu, phải dồn ~15-22 phát mới gãy dầm; lựu pháo 155 trúng
          // thẳng ~8 quả, tên lửa ~17 (ngoài đời phải đặt mìn phá hoặc dội pháo dồn dập)
          const maxHp = (6 + len * 0.04) * (urban ? 3.2 : 2.5);
          spans.push({ a0, a1, len, grp, segs, rails, holes: [], hp: maxHp, maxHp, state: 'ok', sag: 0, pieces: null });
        }
        // trụ: bê tông khối đặc, gấp ~2,2 lần nhịp
        for (const p of piers) p.hp = p.maxHp = spans[0].maxHp * 2.2;
        root.traverse(o => { if (o.isMesh && (o.material === conc || o.material === walkMat)) weatherGeo(o.geometry, o.position.y, o.userData.ao || 1); });
        T.group.add(root);
        this.items.push({ x: b.x, z: b.z, angle: b.angle, f, width: b.width, length: b.length, deckY, arch, rise, TH: TH + GD, slab: TH, urban, root, spans, piers });
      }
    }
    local(b, x, z) {
      const dx = x - b.x, dz = z - b.z;
      return { along: dx * b.f.x + dz * b.f.z, across: -dx * b.f.z + dz * b.f.x };
    }
    toWorld(b, along, across) { return { x: b.x + along * b.f.x - across * b.f.z, z: b.z + along * b.f.z + across * b.f.x }; }
    spanAt(b, along) {
      for (const s of b.spans) if (along >= s.a0 && along <= s.a1) return s;
      return null;
    }
    slope(b, al) { return (b.arch(al + 0.5) - b.arch(al - 0.5)); }
    // gối tại toạ độ dọc cầu a còn đỡ? (mố 2 đầu luôn còn)
    supported(b, a) {
      if (Math.abs(Math.abs(a) - b.length / 2) < 0.5) return true;
      const p = b.piers.find(q => Math.abs(q.z - a) < 0.5);
      return !p || p.state === 'ok';
    }
    // lõm mặt cầu do hố đạn tại (along, across) trên nhịp chưa sập
    holeDip(sp, al, ac) {
      let dip = 0;
      for (const h of sp.holes) {
        const d = Math.hypot(al - h.al, ac - h.ac);
        if (d < h.r) dip = Math.max(dip, h.depth * (1 - (d / h.r) * (d / h.r)));
      }
      return dip;
    }
    // điểm mặt cầu tại toạ độ a (trước khi gãy) của mảnh đang chúi: -> { along, y } trong khung cầu
    piecePt(b, sp, pc, a, dy = 0) {
      const P = pc.pose, c = Math.cos(P.th), s = Math.sin(P.th);
      const zr = a - P.hinge, yr = b.arch(a) - b.arch(P.hinge) - sp.sag * 1.8 + dy;
      return { along: P.hinge + yr * s + zr * c, y: P.py + yr * c - zr * s };
    }
    // Mặt cầu còn nguyên tại (x, z)? -> { b, along, across, span, y } hoặc null
    at(x, z) {
      for (const b of this.items) {
        const L = this.local(b, x, z);
        if (Math.abs(L.along) > b.length / 2 || Math.abs(L.across) > b.width / 2) continue;
        const sp = this.spanAt(b, L.along);
        if (!sp || sp.state !== 'ok') return null;
        // y: mặt cầu hiện tại (vồng, nhịp hư nặng võng xuống, lõm ở hố đạn) — xe / vết đạn nằm đúng mặt
        return { b, along: L.along, across: L.across, span: sp, y: b.deckY + b.arch(L.along) - sp.sag * 1.8 - this.holeDip(sp, L.along, L.across) };
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
          if (!sp.pieces) continue;
          for (const pc of sp.pieces) {
            const c = Math.max(0.2, Math.cos(pc.pose.th));
            let a = pc.pose.hinge + (L.along - pc.pose.hinge) / c;
            for (let it = 0; it < 2; it++) a += (L.along - this.piecePt(b, sp, pc, a).along) / c;   // khử lệch do mặt vồng
            if (a < pc.a0 - 0.5 || a > pc.a1 + 0.5) continue;
            const y = this.piecePt(b, sp, pc, a).y;
            if (best === null || y > best) best = y;
          }
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
      const S = this.sys.scars;
      for (const cell of sp.scars) {
        if (cell.idx === undefined) { sp.scars.delete(cell); continue; }
        const al = cell.br.al, ac = cell.br.ac, s = this.slope(b, al), k = 1 / Math.hypot(1, s);
        const pc = sp.pieces ? sp.pieces.find(p => al >= p.a0 - 0.5 && al <= p.a1 + 0.5) : null;
        let along = al, y = b.deckY + b.arch(al) - sp.sag * 1.8, ny = k, nz = -s * k;
        if (pc) {
          const pt = this.piecePt(b, sp, pc, al), c = Math.cos(pc.pose.th), sn = Math.sin(pc.pose.th);
          along = pt.along; y = pt.y;
          const ny0 = ny, nz0 = nz; ny = ny0 * c - nz0 * sn; nz = ny0 * sn + nz0 * c;
        }
        const w = this.toWorld(b, along, ac);
        cell.x = w.x; cell.z = w.z; cell.y = y;
        cell.nx = b.f.x * nz; cell.ny = ny; cell.nz = b.f.z * nz;
        S.place(cell);
      }
    }
    damageAt(x, y, z, A, info, fx, events) {
      const [mk, mb, ms] = MAT.bridge;
      const sk = smallArms(A) ? ms : 1;
      if (!sk) return;
      for (const b of this.items) {
        const L = this.local(b, x, z);
        if (Math.abs(L.across) > b.width / 2 + A.r + 4 || Math.abs(L.along) > b.length / 2 + A.r + 4) continue;
        if (y > b.deckY + b.rise + 30 + A.r || y < -20 - A.r) continue;
        // --- TRỤ: khoảng cách tới khối trụ (thân + xà mũ)
        for (const p of b.piers) {
          if (p.state !== 'ok') continue;
          const da = Math.max(0, Math.abs(L.along - p.z) - p.thick / 2), dc = Math.max(0, Math.abs(L.across) - p.halfW), dy = Math.max(0, y - p.top, p.bottom - y);
          const dist = Math.hypot(da, dc, dy);
          const direct = dist < 2.5 && info.t !== 'DIRECT_HIT' && info.t !== 'PROXIMITY';
          const dmg = sk * ((direct ? A.kin * mk : 0) + (A.r > 0 && dist < A.r ? A.blast * mb * Math.pow(1 - dist / A.r, 2) : 0));
          if (dmg <= 0.0005) continue;
          p.hp -= dmg;
          // vết đạn + mảnh bê tông văng trên mặt trụ gần tâm nổ nhất; trụ yếu dần -> bong mảng xà mũ / thân trụ
          const cal = Math.max(p.z - p.thick / 2, Math.min(p.z + p.thick / 2, L.along)), cac = Math.max(-p.halfW, Math.min(p.halfW, L.across)), cy = Math.max(p.bottom, Math.min(p.top, y));
          this.hitFx(b, cal, cac, cy, L.along - cal, L.across - cac, y - cy, A, p);
          const lvl = Math.floor((1 - Math.max(0, p.hp) / p.maxHp) * 4);
          if (lvl > (p.spall || 0) && p.hp > 0) { p.spall = lvl; this.chunkBurst(b, p.z - p.thick / 2, p.z + p.thick / 2, p.halfW * 1.6, p.top - 2, 6, L.along, cy, 4, fx); }
          if (p.hp <= 0) this.collapsePier(b, p, fx, events);
        }
        // --- NHỊP: nhịp chứa điểm nổ (nửa mở [a0, a1)) nhận động năng trúng thẳng & đủ sức nổ, nhịp kề chịu 60% sức nổ
        const own = b.spans.find(sp => L.along >= sp.a0 && L.along < sp.a1) || null;
        for (const sp of b.spans) {
          if (sp.state !== 'ok') continue;
          const da = Math.max(0, sp.a0 - L.along, L.along - sp.a1);
          const dc = Math.max(0, Math.abs(L.across) - b.width / 2);
          const al = Math.max(sp.a0, Math.min(sp.a1, L.along)), dY = b.deckY + b.arch(al);
          const dy = Math.max(0, (dY - b.TH) - y, y - (dY + 1.5));
          const dist = Math.hypot(da, dc, dy);
          const mine = !own || sp === own;
          // đạn trúng xe đang chạy trên cầu / nổ cận đích: chỉ sức nổ lan tới mặt cầu, không tính động năng trúng thẳng
          const direct = dist < 2.5 && mine && info.t !== 'DIRECT_HIT' && info.t !== 'PROXIMITY';
          // hư hại theo vị trí: giữa nhịp (mô men uốn lớn nhất) x1,35, sát gối x0,65; trúng dầm từ dưới x1,35; mép lan can x0,7
          let loc = 1;
          if (mine) {
            loc = 0.65 + 0.7 * Math.sin(Math.PI * clamp01((L.along - sp.a0) / sp.len));
            if (y < dY - b.slab - 0.5) loc *= 1.35;
            if (Math.abs(L.across) > b.width / 2 * 0.8) loc *= 0.7;
          }
          const dmg = loc * sk * ((direct ? A.kin * mk : 0) + (A.r > 0 && dist < A.r ? A.blast * mb * Math.pow(1 - dist / A.r, 2) * (mine ? 1 : 0.6) : 0));
          if (dmg <= 0.0005) continue;
          sp.hp -= dmg;
          // nổ dưới gầm: vết đạn + bê tông rơi từ mặt dưới dầm / bản mặt
          if (mine && y < dY - b.slab && dist < A.r * 0.8) this.hitFx(b, al, Math.max(-b.width / 2, Math.min(b.width / 2, L.across)), dY - b.TH, 0, 0, -1, A, sp);
          // lan can trong tầm nổ: cong / ngả ra ngoài, nặng thì gãy rời rơi xuống sông
          if (mine && A.r > 0) for (const sg of sp.segs) for (const rg of sg.rails || []) {
            if (sg.blown || rg.userData.gone) continue;
            const ra = Math.max(sg.a0, Math.min(sg.a1, L.along)), rac = -rg.position.x;
            const d = Math.hypot(ra - L.along, rac - L.across, Math.max(0, y - (dY + 6), dY - 2 - y));
            if (d > A.r * 0.6) continue;
            rg.userData.bend = (rg.userData.bend || 0) + A.blast * (1 - d / (A.r * 0.6)) * 0.45;
            if (rg.userData.bend > 0.95) this.dropRail(b, rg, fx);
            else this.bendRail(rg, sp);
          }
          // hố trên mặt cầu: nổ sát mặt cầu (từ trên) hoặc đạn xuyên trúng thẳng
          if (mine && Math.abs(L.across) < b.width / 2 && Math.abs(L.along - al) < 0.5 && y > dY - 2 && y < dY + 4 && (A.blast >= 0.3 || A.kin >= 0.9)) this.addHole(b, sp, L.along, L.across, A, fx);
          if (sp.hp <= 0) { this.collapse(b, sp, L.along, fx, events); continue; }
          this.deform(b, sp);
        }
      }
    }
    // Hố đạn: bán kính theo sức nổ (HE 120 ~0,5 m, lựu 155 ~0,8 m; AP chỉ lỗ ~0,2 m); nổ chồng lên hố cũ -> hố loang rộng,
    // sâu dần tới thủng bản mặt (lòng đen, thép gỉ võng qua lỗ). Hố là con của đốt nhịp -> rơi theo mảnh khi sập
    addHole(b, sp, al, ac, A, fx) {
      let r = A.blast > 0 ? Math.min(7, 1.6 + A.blast * 1.5) : 1.4;
      let h = sp.holes.find(q => Math.hypot(q.al - al, q.ac - ac) < q.r * 0.9 + r * 0.5);
      if (!h && sp.holes.length >= 14) h = sp.holes.reduce((m, q) => Math.hypot(q.al - al, q.ac - ac) < Math.hypot(m.al - al, m.ac - ac) ? q : m);
      if (h) { h.r = Math.min(12, Math.hypot(h.r, r * 0.8)); h.hits++; }
      else { h = { al, ac, r, hits: 1, mesh: null }; sp.holes.push(h); }
      h.through = h.r > 5 || h.hits >= 3;
      h.depth = h.through ? 3 : 0.4 + h.r * 0.12;
      const seg = sp.segs.find(s => h.al >= s.a0 - 0.5 && h.al <= s.a1 + 0.5) || sp.segs[0];
      if (h.mesh) h.mesh.parent && h.mesh.parent.remove(h.mesh);
      const m = new THREE.Group(), ang = hash3(h.al, h.ac, b.x) * 6.283, s = this.slope(b, h.al);
      const y = b.deckY + b.arch(h.al);   // khung đốt (đã võng cùng nhịp)
      // mép vỡ lởm chởm: đĩa có bán kính từng đỉnh lệch theo băm
      const disc = (rad, yy, mat, seed) => {
        const geo = new THREE.CircleGeometry(1, 18), p = geo.attributes.position;
        for (let i = 1; i < p.count; i++) { const k = 0.88 + 0.24 * hash3(i, seed, h.al); p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
        geo.rotateX(-Math.PI / 2);
        const mm = new THREE.Mesh(geo, mat); mm.scale.set(rad, 1, rad); mm.position.y = yy; mm.rotation.y = ang; return mm;
      };
      m.add(disc(h.r * 1.6, 0.08, h.through ? this.holeDeepMat : this.holeMat, 1));
      if (h.through) {
        m.add(disc(h.r * 0.5, 0.1, this.voidMat, 2));
        // thép gỉ võng ngang qua lỗ (2 lớp lưới, vài thanh đứt chĩa xuống)
        for (let k = -2; k <= 2; k++) for (const dir of [0, 1]) {
          if (hash3(k, dir, h.al) < 0.45) continue;
          const bar = new THREE.Mesh(this.rebarGeo, this.rebarMat), L2 = h.r * 1.3;
          bar.scale.set(1, L2, 1);
          const off = k * h.r * 0.22, sag = 0.3 + hash3(k, dir + 5, h.ac) * 0.9;
          if (dir) { bar.rotation.set(Math.PI / 2 + (hash3(k, 9, h.al) - 0.5) * 0.3, 0, 0); bar.position.set(off, -sag, 0); }
          else { bar.rotation.set(0, 0, Math.PI / 2 + (hash3(k, 7, h.al) - 0.5) * 0.3); bar.position.set(0, -sag - 0.3, off); }
          m.add(bar);
        }
        // mảng bê tông bong ở mặt dưới bản cầu
        const under = disc(h.r * 1.2, -b.slab - 0.06, this.holeMat, 3); under.rotation.x = Math.PI; m.add(under);
      }
      m.position.set(-h.ac, y, h.al);   // trục x khung cầu = -across
      m.rotation.x = -Math.atan(s);
      seg.g.add(m);
      h.mesh = m;
      if (this.sys.debris) {
        const w = this.toWorld(b, h.al, h.ac);
        this.sys.debris.burst(w.x, y - sp.sag * 1.8 + 1, w.z, Math.round(4 + h.r * 1.5), 0.9, [0.62, 0.6, 0.56], 70, 0.8);
      }
    }
    // Vết đạn bê tông (trụ / mặt dưới dầm) tại điểm (al, ac, y) khung cầu, pháp tuyến (nal, nac, ny) hướng về tâm nổ.
    // owner: trụ / nhịp mang vết -> gỡ vết khi trụ đổ / nhịp sập (vết không lơ lửng)
    hitFx(b, al, ac, y, nal, nac, ny, A, owner) {
      const l = Math.hypot(nal, nac, ny) || 1, w = this.toWorld(b, al, ac);
      const nx = (b.f.x * nal - b.f.z * nac) / l, nz = (b.f.z * nal + b.f.x * nac) / l;
      const c = this.sys.concreteHit(w.x, y, w.z, nx, nz, A.blast > 0 ? 'NORMAL' : 'AP', A, false, 10, ny / l);
      if (c) (owner.marks || (owner.marks = new Set())).add(c);
      if (this.sys.debris) this.sys.debris.burst(w.x + nx * 1.5, y + ny / l * 1.5, w.z + nz * 1.5, Math.round(6 + A.blast * 8), 0.8, [0.6, 0.58, 0.54], 60, 0.5);
    }
    clearMarks(owner) {
      if (!owner.marks) return;
      for (const c of owner.marks) if (c.idx !== undefined) this.sys.scars.unplace(c);
      owner.marks.clear();
    }
    // lan can cong / ngả ra ngoài quanh chân (cộng với độ vênh do nhịp võng)
    bendRail(rg, sp) {
      const k = sp.sag || 0, i = sp.rails.indexOf(rg);
      rg.rotation.z = (i % 2 ? 1 : -1) * k * 0.35 - (rg.userData.sd || 0) * Math.min(1.1, rg.userData.bend || 0);
      rg.rotation.y = (hash3(rg.position.x, i, k) - 0.5) * 0.25 * Math.min(1, rg.userData.bend || 0);
      rg.updateMatrix();
    }
    // lan can gãy chân, bị thổi văng ra ngoài rơi xuống sông (vật lý như mảng bê tông)
    dropRail(b, rg, fx) {
      rg.userData.gone = true;
      b.root.attach(rg);
      this.chunks = this.chunks || [];
      const sd = rg.userData.sd || 1, h = (k) => hash3(rg.position.z, k, b.x);
      this.chunks.push({ b, m: rg, v: [sd * (14 + 16 * h(1)), 10 + 10 * h(2), (h(3) - 0.5) * 10], w: [(h(4) - 0.5) * 3, (h(5) - 0.5) * 2, -sd * (2 + 2 * h(6))], half: 1, big: false, bounced: false, wet: false });
    }
    // Hư nặng: nhịp cầu võng xuống, lan can cong vênh
    deform(b, sp) {
      const k = clamp01((0.6 - sp.hp / sp.maxHp) / 0.6);
      if (k <= sp.sag + 0.02) return;
      sp.sag = k;
      sp.grp.position.y = -k * 1.8;
      sp.grp.rotation.z = (hash3(b.x, sp.a0, b.z) - 0.5) * 0.03 * k;
      sp.rails.forEach(r => { if (!r.userData.gone) this.bendRail(r, sp); });
      sp.grp.updateMatrix();
      this.syncScars(b, sp);
    }
    // thép chủ lòi ra ở mép gãy (con của đốt -> chúi theo mảnh), chĩa ra ngoài và rũ xuống
    rebarAt(b, g, at, dir, n, seed) {
      for (let i = 0; i < n; i++) {
        const bar = new THREE.Mesh(this.rebarGeo, this.rebarMat), L = 3 + hash3(i, seed, at) * 6, droop = 0.15 + hash3(seed, i, at) * 0.9;
        const th = dir * (Math.PI / 2 + droop);
        bar.scale.set(1, L, 1);
        bar.rotation.set(th, (hash3(i, at, seed) - 0.5) * 0.4, 0);
        const x = (hash3(i + 3, seed, at) - 0.5) * (b.width - 6), y0 = b.deckY + b.arch(at) - b.slab * (0.25 + 0.5 * hash3(i, 2, seed));
        bar.position.set(x, y0 + Math.cos(th) * L / 2, at + Math.sin(th) * L / 2);
        g.add(bar);
      }
    }
    // Nhịp gãy. alongHit: chỗ trúng đòn cuối (hoặc toạ độ trụ vừa đổ)
    // pier: nhịp sập vì mất gối (trụ đổ) -> không có đốt bị nổ phá
    collapse(b, sp, alongHit, fx, events, pier) {
      if (sp.state !== 'ok') return;
      sp.state = 'falling';
      this.clearMarks(sp);
      const supA = this.supported(b, sp.a0), supB = this.supported(b, sp.a1);
      // đốt hứng đòn cuối bị nổ phá vụn (bản mặt + dầm văng thành mảng bê tông, rơi xuống sông); 2 phần còn lại mất liên
      // kết ở mép gãy -> gục quanh gối của mình (mất gối thì rơi phẳng), mép gãy lởm chởm lòi thép
      const kb = pier ? -1 : Math.max(0, sp.segs.findIndex(g => alongHit >= g.a0 - 0.01 && alongHit <= g.a1 + 0.01));
      const pieces = [];
      if (kb >= 0) {
        // khe phá ~2 đốt (~3 m): đốt trúng + đốt kề phía gần chỗ trúng hơn
        const sg = sp.segs[kb], kn = alongHit - sg.a0 < sg.a1 - alongHit ? kb - 1 : kb + 1;
        const k0 = Math.max(0, Math.min(kb, kn)), k1 = Math.min(sp.segs.length - 1, Math.max(kb, kn));
        for (let k = k0; k <= k1; k++) this.blowSeg(b, sp, sp.segs[k], alongHit, fx);
        const L = sp.segs.slice(0, k0), Rr = sp.segs.slice(k1 + 1);
        if (L.length) pieces.push(supA ? { segs: L, hinge: sp.a0, freeSign: 1 } : { segs: L, hinge: sp.a0, freeSign: 1, flat: true });
        if (Rr.length) pieces.push(supB ? { segs: Rr, hinge: sp.a1, freeSign: -1 } : { segs: Rr, hinge: sp.a1, freeSign: -1, flat: true });
        // đốt sát gối bị phá: đầu nhịp kề / mố còn lại rũ thép xuống khe
        if (k0 === 0 && supA) this.rebarAt(b, b.root, sp.a0, 1, 5, sp.a0 * 3.1);
        if (k1 === sp.segs.length - 1 && supB) this.rebarAt(b, b.root, sp.a1, -1, 5, sp.a1 * 3.1);
      } else if (supA || supB) pieces.push({ segs: sp.segs, hinge: supA ? sp.a0 : sp.a1, freeSign: supA ? 1 : -1 });
      else pieces.push({ segs: sp.segs, hinge: sp.a0, freeSign: 1, flat: true });
      sp.pieces = [];
      if (!pieces.length) sp.state = 'down';
      const TH = b.TH, gAt = (a) => this.T.groundAtRaw(b.x + b.f.x * a, b.z + b.f.z * a), NS = 10;
      for (const P of pieces) {
        const pa0 = P.segs[0].a0, pa1 = P.segs[P.segs.length - 1].a1, plen = pa1 - pa0;
        const freeEnd = P.freeSign > 0 ? pa1 : pa0;
        // thép lòi ở mép gãy (trước khi gắn vào bản lề: toạ độ đốt = toạ độ khung cầu)
        const fseg = P.freeSign > 0 ? P.segs[P.segs.length - 1] : P.segs[0];
        this.rebarAt(b, fseg.g, freeEnd, P.freeSign, 7, freeEnd + sp.a0);
        this.jagged(b, fseg.g, freeEnd, P.freeSign, freeEnd * 1.7 + sp.a1);
        const py = b.deckY + b.arch(P.hinge);
        const pivot = new THREE.Group();
        pivot.position.set(0, py, P.hinge);
        b.root.add(pivot);
        b.root.updateMatrixWorld(true);
        pivot.updateMatrixWorld(true);
        for (const s of P.segs) { pivot.attach(s.g); s.g.matrixAutoUpdate = true; }
        pivot.matrixAutoUpdate = true;
        const pc = { a0: pa0, a1: pa1, pivot, pose: { hinge: P.hinge, py, th: 0 }, freeSign: P.freeSign, hinge: P.hinge };
        // đáy dầm tại toạ độ a sau khi tụt drop & chúi góc th (quanh bản lề)
        const bottomAt = (a, drop, th) => { pc.pose = { hinge: P.hinge, py: py - drop, th }; return this.piecePt(b, sp, pc, a, -TH); };
        const pts = []; for (let k = 0; k <= NS; k++) pts.push(P.hinge + P.freeSign * plen * k / NS);
        const clear = pts.map(a => { const q = bottomAt(a, 0, 0); return q.y - gAt(q.along) > 0.5; });
        let drop = 0, th = 0;
        if (P.flat) {
          let clr = Infinity;
          for (let k = 0; k <= NS; k++) if (clear[k]) { const q = bottomAt(pts[k], 0, 0); clr = Math.min(clr, q.y - gAt(q.along)); }
          drop = Math.max(2, clr === Infinity ? 6 : clr);
        } else {
          // đầu bản lề tụt khỏi gối một chút, rồi chúi tới khi chạm đất / lòng sông
          drop = clear[0] ? Math.min(3, Math.max(0, bottomAt(pts[0], 0, 0).y - gAt(P.hinge) - 0.3)) : 0;
          for (th = 0.02; th < 1.25; th += 0.01) {
            let touch = false;
            for (let k = 1; k <= NS && !touch; k++) {
              if (!clear[k]) continue;
              const q = bottomAt(pts[k], drop, P.freeSign * th);
              if (q.y <= gAt(q.along)) touch = true;
            }
            if (touch) break;
          }
        }
        pc.pose = { hinge: P.hinge, py, th: 0 };
        const ang = P.freeSign * th, fallH = P.flat ? drop : drop + plen * Math.sin(th);
        // thời gian rơi theo trọng lực thật (rơi tự do √(2h/g); mảnh còn bản lề quay chậm hơn ~1,3 lần)
        const dur = Math.max(0.9, Math.min(3.2, Math.sqrt(2 * (Math.max(6, fallH) / 8) / 9.8) * (P.flat ? 1.05 : 1.3)));
        sp.pieces.push(pc);
        this.anims.push({ b, sp, pc, pivot, t: 0, dur, ang, drop, py, splashed: false, freeEnd, plen });
      }
      this.broken = (this.broken || 0) + 1;
      const mw = this.toWorld(b, (sp.a0 + sp.a1) / 2, 0);
      this.sys.markNav(mw.x, mw.z, sp.len / 2 + (b.width || 60) + 60);
      this.sys.mapDirty = true;
      // mảnh bê tông vỡ văng ở chỗ gãy
      const bw = this.toWorld(b, Math.max(sp.a0, Math.min(sp.a1, alongHit)), 0), by = b.deckY + b.arch(alongHit);
      if (this.sys.debris) { this.sys.debris.burst(bw.x, by, bw.z, 26, 2.4, [0.62, 0.6, 0.56], 60, 0.4); this.sys.debris.burst(bw.x, by, bw.z, 40, 1, [0.55, 0.53, 0.5], 90, 0.7); }
      if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('collapse', { x: mw.x, y: b.deckY, z: mw.z }, 1.4, { mat: 'concrete', h: 6, floors: 1 });
      if (fx && fx.spawnDust && fx.palette) fx.spawnDust(bw.x, by, bw.z, 1.6, { micro: false }, fx.palette('WALL'), true, null);
      if (events) events.push({ type: 'bridgeCollapse', x: mw.x, z: mw.z });
    }
    // Đốt bị nổ phá: ẩn đốt, thay bằng mảng bê tông văng theo hướng nổ (tấm bản mặt lớn rơi gần như thẳng xuống, cục
    // nhỏ văng xa), bụi khói + tia nước lớn
    blowSeg(b, sp, seg, hitAl, fx) {
      seg.g.visible = false;
      seg.blown = true;
      for (const h of sp.holes) if (h.al >= seg.a0 - 0.5 && h.al <= seg.a1 + 0.5 && h.mesh) h.mesh.visible = false;
      const top = b.deckY + b.arch((seg.a0 + seg.a1) / 2) - sp.sag * 1.8;
      this.chunkBurst(b, seg.a0, seg.a1, b.width, top, b.TH, hitAl, top + 1, Math.round(16 + (seg.a1 - seg.a0) * 0.6), fx);
      const w = this.toWorld(b, (seg.a0 + seg.a1) / 2, 0);
      if (fx && fx.spawnDust && fx.palette) for (let k = -1; k <= 1; k++) { const q = this.toWorld(b, (seg.a0 + seg.a1) / 2, k * b.width * 0.3); fx.spawnDust(q.x, top, q.z, 2.2, { micro: false }, fx.palette('WALL'), true, null); }
      if (this.sys.debris) { this.sys.debris.burst(w.x, top, w.z, 60, 1, [0.55, 0.53, 0.5], 110, 0.8); this.sys.debris.burst(w.x, top, w.z, 30, 0.5, [0.4, 0.38, 0.35], 140, 0.9); }
    }
    // mảng bê tông văng (vật lý đơn giản: trọng lực, nảy 1 lần, chìm xuống đáy sông, nằm lại thành đống đổ nát).
    // Toạ độ trong khung cầu (root); mọi ngẫu nhiên băm theo toạ độ -> mọi máy như nhau
    chunkBurst(b, a0, a1, wid, top, depth, hitAl, hitY, n, fx) {
      if (!this.chunkGeo) this.chunkGeo = new THREE.BoxGeometry(1, 1, 1);
      this.chunks = this.chunks || [];
      for (let i = 0; i < n; i++) {
        const h = (k) => hash3(i * 7 + k, a0 + hitAl * 0.37, b.x * 0.01 + k);
        const big = i < 4;   // vài tấm bản mặt lớn
        const sx = big ? wid * (0.18 + 0.2 * h(1)) : 1.2 + h(1) * 4, sy = big ? Math.min(depth, 5) * (0.7 + 0.3 * h(2)) : 0.8 + h(2) * 2.5, sz = big ? (a1 - a0) * (0.35 + 0.3 * h(3)) : 1.2 + h(3) * 4;
        const m = new THREE.Mesh(this.chunkGeo, this.conc);
        m.scale.set(sx, sy, sz);
        const al = a0 + h(4) * (a1 - a0), ac = (h(5) - 0.5) * (wid - sx);
        m.position.set(ac, top - h(6) * depth, al);
        m.rotation.set((h(7) - 0.5) * 0.4, h(8) * 6.28, (h(9) - 0.5) * 0.4);
        m.castShadow = true;
        b.root.add(m);
        // vận tốc: đẩy ra xa tâm nổ + hất lên; mảng to nặng -> chậm (đv/giây, 8 đv = 1 m)
        let dx = ac, dy = m.position.y - hitY + 2, dz = al - hitAl; const dl = Math.hypot(dx, dy, dz) || 1;
        const sp0 = (big ? 6 : 30 + 70 * h(10)) / Math.sqrt(Math.max(1, sx * sy * sz / 30));
        const v = [dx / dl * sp0, (big ? 4 : 18 + 40 * h(11)) + Math.max(0, dy / dl) * sp0, dz / dl * sp0];
        const w = [(h(12) - 0.5) * (big ? 1.2 : 9), (h(13) - 0.5) * (big ? 0.8 : 7), (h(14) - 0.5) * (big ? 1.2 : 9)];
        this.chunks.push({ b, m, v, w, half: sy / 2, big, lean: (h(15) < 0.5 ? -1 : 1) * (0.5 + 0.5 * h(16)), bounced: false, wet: false, rest: false });
      }
    }
    // mép gãy lởm chởm: vài cục bê tông vỡ chìa / lệch ở đầu tự do (con của đốt -> chúi theo mảnh)
    jagged(b, g, at, dir, seed) {
      if (!this.chunkGeo) this.chunkGeo = new THREE.BoxGeometry(1, 1, 1);
      for (let i = 0; i < 6; i++) {
        const h = (k) => hash3(i, seed, k);
        const m = new THREE.Mesh(this.chunkGeo, this.conc);
        const sx = 3 + h(1) * 9, sy = 1.5 + h(2) * (b.slab + 2), sz = 1.5 + h(3) * 4;
        m.scale.set(sx, sy, sz);
        m.position.set((h(4) - 0.5) * (b.width - sx), b.deckY + b.arch(at) - b.slab * (0.2 + 0.7 * h(5)), at + dir * (sz * 0.3 - 0.5));
        m.rotation.set((h(6) - 0.5) * 0.9, (h(7) - 0.5) * 0.5, (h(8) - 0.5) * 0.7);
        g.add(m);
      }
    }
    // Trụ đổ: thân trụ gãy ở chân, nghiêng đổ sang 1 bên & tụt xuống lòng sông; 2 nhịp gối lên nó mất gối -> sập theo
    collapsePier(b, p, fx, events) {
      p.state = 'falling';
      this.clearMarks(p);
      const side = hash3(b.x, p.z, b.z) < 0.5 ? -1 : 1;
      this.anims.push({ b, pier: p, t: 0, dur: 1.8, side });
      const w = this.toWorld(b, p.z, 0);
      if (this.sys.debris) this.sys.debris.burst(w.x, p.top - 4, w.z, 30, 2.2, [0.6, 0.58, 0.54], 70, 0.5);
      if (fx && fx.spawnDust && fx.palette) fx.spawnDust(w.x, p.top, w.z, 1.8, { micro: false }, fx.palette('WALL'), true, null);
      // xà mũ + đỉnh thân trụ vỡ văng thành mảng
      this.chunkBurst(b, p.z - p.thick / 2, p.z + p.thick / 2, p.halfW * 2, p.top, 8, p.z, p.top - 6, 12, fx);
      for (const sp of b.spans) if (sp.state === 'ok' && (Math.abs(sp.a0 - p.z) < 0.5 || Math.abs(sp.a1 - p.z) < 0.5)) this.collapse(b, sp, p.z, fx, events, true);
    }
    update(dt, fx) {
      if (this.chunks && this.chunks.length) {
        const G = 78.4, ws = this.T.waterMesh ? this.T.waterMesh.position.y : 0;
        for (let i = this.chunks.length - 1; i >= 0; i--) {
          const c = this.chunks[i], m = c.m, b = c.b;
          c.v[1] -= G * dt * (c.wet ? 0.25 : 1);
          if (c.wet) { c.v[0] *= 1 - 3 * dt; c.v[2] *= 1 - 3 * dt; c.v[1] = Math.max(c.v[1], -18); }   // nước cản
          m.position.x += c.v[0] * dt; m.position.y += c.v[1] * dt; m.position.z += c.v[2] * dt;
          m.rotation.x += c.w[0] * dt; m.rotation.y += c.w[1] * dt; m.rotation.z += c.w[2] * dt;
          const wp = this.toWorld(b, m.position.z, -m.position.x), g = this.T.groundAtRaw(wp.x, wp.z);
          if (!c.wet && g < ws - 0.5 && m.position.y < ws) {
            c.wet = true;
            if (fx && fx.waterBurst && c.half > 1.2) fx.waterBurst(wp.x, ws, wp.z, 'HE', false, 2);
          }
          if (m.position.y - c.half <= g) {
            m.position.y = g + c.half * 0.8;
            const sp = Math.hypot(c.v[0], c.v[1], c.v[2]);
            if (!c.bounced && sp > 25 && !c.wet) { c.bounced = true; c.v = [c.v[0] * 0.35, -c.v[1] * 0.22, c.v[2] * 0.35]; c.w = c.w.map(x => x * 0.4); }
            else {
              // nằm lại thành đống đổ nát: tấm bản mặt lớn cắm nghiêng chỏng chơ (1 đầu chống đáy sông, đầu kia nhô khỏi mặt nước)
              if (c.big) { m.rotation.x = c.lean; m.rotation.z *= 0.3; m.position.y = g + Math.abs(Math.sin(c.lean)) * m.scale.z * 0.45; }
              this.chunks.splice(i, 1);
            }
          }
        }
      }
      for (let i = this.anims.length - 1; i >= 0; i--) {
        const a = this.anims[i];
        a.t += dt;
        const u = Math.min(1, a.t / a.dur), e = u * u;   // rơi nhanh dần
        if (a.pier) {
          const p = a.pier;
          p.grp.rotation.z = a.side * 0.55 * e;
          p.grp.position.y = -(p.top + 4) * 0.45 * e;
          if (u >= 1) { p.state = 'down'; this.anims.splice(i, 1); }
          continue;
        }
        a.pivot.rotation.x = a.ang * e;
        a.pivot.position.y = a.py - a.drop * e;
        a.pivot.updateMatrix();
        // tư thế mảnh cho mặt đất xe (brokenDeckAt) & vết đạn trên mặt cầu rơi theo mảnh
        a.pc.pose = { hinge: a.pc.hinge, py: a.pivot.position.y, th: a.ang * e };
        this.syncScars(a.b, a.sp);
        if (u >= 1 && !a.splashed) {
          a.splashed = true;
          if (!this.anims.some(o => o !== a && o.sp === a.sp && !o.splashed)) a.sp.state = 'down';
          const q = this.piecePt(a.b, a.sp, a.pc, a.freeEnd), w = this.toWorld(a.b, q.along, 0);
          const ws = this.T.waterMesh ? this.T.waterMesh.position.y : 0;
          const wet = this.T.groundAtRaw(w.x, w.z) < ws - 0.1;
          if (fx && fx.waterBurst && wet) fx.waterBurst(w.x, ws, w.z, 'HE', true, 6);
          else if (fx && fx.spawnDust && fx.palette) fx.spawnDust(w.x, this.T.groundAtRaw(w.x, w.z), w.z, 1.8, { micro: false }, fx.palette('WALL'), true, null);
          if (this.sys.debris) this.sys.debris.burst(w.x, ws + 2, w.z, 14, 1.6, [0.62, 0.6, 0.56], 90, 0.7);
          if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(wet ? 'splashBig' : 'slabImpact', { x: w.x, z: w.z }, 1.4);
          this.anims.splice(i, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------------ ỤN ĐẤT CỨ ĐIỂM: cháy sém + lõm dần (chỉ hình ảnh)
  // Hố trên lớp đất đắp phủ cứ điểm theo loại đạn [bán kính, sâu] (đv): đất đắp tơi nên hố như hố bom ngoài đồng (nhỏ hơn
  // chút vì đất đầm chặt), nhưng đáy chạm bản bê tông bên dưới nên không sâu quá ~1 m. Trước đây dùng bán kính sóng nổ
  // (to gấp mấy lần hố) với độ lún vài cm -> chỉ là một vệt mờ, không đọc ra là hố đạn
  const MOUND_CRATER = { NORMAL: [8, 3.2], HE: [9, 3.6], CLUSTER: [5, 1.4], CLUSTER_SUBMUNITION: [2.6, 1], RPG: [3.4, 1.4], ANTI_TANK_MISSILE: [4.4, 1.8], AP: [2.4, 1.1] };
  function moundCrater(ammo, heavy) {
    const C = MOUND_CRATER[ammo];
    if (!C) return null;
    return heavy ? [C[0] * 1.5, C[1] * 1.6] : C;
  }
  // R: bán kính lòng hố, depth: độ sâu đào thêm (cộng dồn, chặn ở ~1 m dưới mặt ụ gốc), burn: mức cháy sém (0 = đạn xuyên)
  function scorchMound(SS, x, y, z, R, depth, burn) {
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
      const RR = R * 1.35;
      for (let i = 0; i < P.count; i++) {
        const dx = P.getX(i) - L.x, dz = P.getZ(i) - L.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > RR * RR) continue;
        const d = Math.sqrt(d2), w = Math.max(0, 1 - d / RR);
        // tâm cháy đen, vành đất bị hất (nâu), tích dần theo số phát
        const sc = Math.min(0.75, burn * w * w * 0.8);
        const r0 = C.getX(i), g0 = C.getY(i), b0 = C.getZ(i);
        // ụ đất dùng shader mặt đất: màu đỉnh là hệ số nhân lên màu địa hình (1 = nguyên màu) -> đích cháy là hệ số tối / ngả nâu
        const mul = g.userData.tintMul, inner = d < R * 0.5;
        const tr = mul ? (inner ? 0.26 : 0.64) : inner ? 0.11 : 0.36, tg = mul ? (inner ? 0.22 : 0.5) : inner ? 0.09 : 0.27, tb = mul ? (inner ? 0.2 : 0.42) : inner ? 0.07 : 0.18;
        C.setXYZ(i, r0 + (tr - r0) * sc, g0 + (tg - g0) * sc, b0 + (tb - b0) * sc);
        // lòng hố hình chảo (sâu nhất ở tâm), vành đất hất lên quanh miệng
        const u = d / R;
        const dy = u < 1 ? -depth * (1 - u * u) : depth * 0.22 * Math.sin(Math.PI * (u - 1) / 0.35);
        const ny = Math.max(g.userData.y0[i] - 8, Math.min(g.userData.y0[i] + 1.5, P.getY(i) + dy));
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
      this.rocks = new RockField(this, rockItems || (T && T.rockItems) || []);
      this.bridges = new BridgeSet(this);
      this.navBoxes = [];   // vùng lưới tìm đường cần tính lại (Navigator.invalidate theo vùng)
      this.mapDirty = false;
    }

    // Vật cản / mặt đường quanh (x, z) bán kính r vừa đổi: lưới tìm đường của bot tính lại riêng vùng này ở khung sau
    markNav(x, z, r) {
      if (this.navBoxes.length > 24) { this.navBoxes = [null]; return; }   // quá nhiều vùng trong 1 khung: dựng lại cả lưới
      if (this.navBoxes[0] === null) return;
      this.navBoxes.push({ x0: x - r, z0: z - r, x1: x + r, z1: z + r });
    }

    // Sóng nổ / đạn tác động lên đá tảng, cầu, bê tông & ụ đất cứ điểm. info: { t: loại va chạm, nx, nz: pháp tuyến tường }
    damageAt(x, y, z, ammo, heavy, fx, info = {}) {
      const A = ammoOf(ammo, heavy);
      const events = [];
      this.rocks.damageAt(x, y, z, A, info, fx, events);
      this.bridges.damageAt(x, y, z, A, info, fx, events);
      const SS = this.T.strongholdSet;
      if (SS) this.fragmentScars(SS, x, y, z, ammo, heavy);
      // nổ trên vỉa hè: mặt lát bê tông rỗ / mẻ / bong mảng + muội (không khoét hố đất — Terrain.noCraterAt)
      const ST = this.T.streetscape;
      if (!isBullet(ammo) && info.t !== 'WALL' && ST && ST.covers && ST.covers(x, z)) {
        const wy = ST.junk && ST.junk.rest ? ST.junk.rest(x, z) : y;
        if (y < wy + 6) this.concreteHit(x, wy, z, 0, 0, ammo, A, true);
      }
      if (SS && SS.covers(x, z, 8)) {
        if (info.t === 'WALL') {
          const ny = info.ny || 0;
          const room = this.wallRoom(SS, x, y, z, info.nx, info.nz, ny);
          const c1 = this.concreteHit(x, y, z, info.nx, info.nz, ammo, A, false, room, ny);
          const hole = this.concreteCrater(SS, x, y, z, info.nx, info.nz, ammo, heavy, room, c1, ny);
          this.concretePits(SS, x, y, z, info.nx, info.nz, ammo, A, fx, hole, ny);
        }
        else if (SS.surfaceInfo && SS.surfaceInfo(x, z)) {
          // sàn hầm / dốc / sân bê tông: vết rỗ, mẻ, bong mảng + muội như mặt bê tông (trước đây đạn nổ / AP không để lại gì)
          if (!isBullet(ammo)) this.concreteHit(x, y, z, 0, 0, ammo, A, true);
        } else {
          const MC = moundCrater(ammo, heavy);
          if (MC) scorchMound(SS, x, y, z, MC[0], MC[1], A.blast > 0.15 ? A.blast : 0);
        }
        // mái cứ điểm bị bào mòn -> sập từng ô (va chạm & che chắn đổi theo; xe bot phải tìm đường lại)
        if (SS.damagePanels) {
          const ev = SS.damagePanels(x, y, z, ammo, heavy, info, fx, A.r);
          if (ev.length) { events.push(...ev); this.markNav(x, z, Math.max(160, (A.r || 0) * 1.3 + 120)); }
        }
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
    concreteHit(x, y, z, nx, nz, ammo, A, up = false, room = Infinity, ny = 0) {
      let n;
      if (up || nx === undefined || nx === null || (!nx && !nz)) n = { x: 0, y: 1, z: 0 };
      else { const l = Math.hypot(nx, ny, nz) || 1; n = { x: nx / l, y: ny / l, z: nz / l }; }
      // tường cứ điểm: hố thật khoét vào tường (concreteCrater) -> vết dán chỉ làm vành mẻ / nứt quanh hố, không dán mảng bong
      // mặt cầu: mảng bong / thủng do hệ hố cầu (BridgeSet.addHole) vẽ -> vết dán chỉ tới mức mẻ, không vẽ chồng 2 hố
      const spallE = up && !this.bridges.at(x, z) ? 1.3 : Infinity;
      const tier = (e) => e < 0.35 ? 'c_pock' : e < spallE ? 'c_chip' : 'c_spall';
      // tường cứ điểm: mảng bong tối đa ~2,2 m và không chìa quá mép tường (cửa, góc, đỉnh)
      const ms = up ? undefined : Math.min(18, room * 2);
      const c1 = this.scars.hit('c', ammo === 'SCOUT_BULLET' || ammo === 'MG762' || isInc(ammo) ? 3 : 5, x, y, z, n.x, n.y, n.z, A.e, tier, { e0: 0.2, maxSize: ms });
      const c2 = (A.blast > 0.3 || isInc(ammo)) ? this.scars.hit('s', 12, x, y, z, n.x, n.y, n.z, A.e, () => 'soot', { sizeMul: isInc(ammo) ? 0.35 : Math.min(1.6, 0.6 + A.r / 40), maxSize: ms && ms * 1.3 }) : null;
      // mặt cầu: vết bám nhịp cầu (võng / rơi theo nhịp)
      if (up) { this.bridges.tagScar(c1, x, z); this.bridges.tagScar(c2, x, z); }
      return c1;
    }

    // Hố đạn thật trên tường cứ điểm (Strongholds.addCrater): đạn pháo / tên lửa khoét hố ngay phát đầu, đạn súng chỉ đục
    // được hố khi dồn nhiều phát vào một chỗ (ô vết cộng dồn năng lượng). Mảnh bê tông vỡ văng ra rơi xuống chân tường
    concreteCrater(SS, x, y, z, nx, nz, ammo, heavy, room, cell, ny = 0) {
      if (!SS.addCrater || (!nx && !nz)) return null;
      let k = 1;
      if (isBullet(ammo)) {
        // 30mm nổ-mảnh mẻ được hố ngay từ phát thứ 2 dồn vào một ô (loạt gatling tản rộng: trước đây cần 4 phát cùng ô
        // 62 cm nên sấy cả băng gần như không ô nào đủ -> tường không có hố); 12.7mm phải dồn ~9 phát mới mẻ
        const e = cell ? cell.e : 0, thr = ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY' ? 0.2 : 0.45;
        if (e < thr) return null;
        k = Math.min(1.6, 0.8 + (e - thr) * 0.6);
      }
      const h = SS.addCrater(x, y, z, nx, ny, nz, ammo, heavy, room, k);
      if (h && this.debris) {
        const l = Math.hypot(nx, nz) || 1, ox = nx / l * 1.5, oz = nz / l * 1.5;
        const big = !isBullet(ammo);
        this.debris.burst(x + ox, y, z + oz, big ? Math.min(14, 4 + Math.round(h.R * 1.4)) : 1, big ? Math.max(0.5, h.R * 0.11) : 0.35, [0.6, 0.58, 0.54], big ? 80 : 40, 0.5);
      }
      return h;
    }

    // Khoảng trống quanh điểm trúng trên mặt tường tới mép gần nhất (cửa, góc, đỉnh tường): vết dán không chìa ra ngoài khoảng không
    wallRoom(SS, x, y, z, nx, nz, ny = 0) {
      if (!nx && !nz) return Infinity;
      const F = faceFrame(nx, ny, nz), n = F.n, t = F.t, b = F.b;
      const on = (px, py, pz) => { const h = SS.segmentHit(px + n.x * 3, py + n.y * 3, pz + n.z * 3, px - n.x * 2, py - n.y * 2, pz - n.z * 2); return h && h.type === 'WALL'; };
      const at = (u, v) => on(x + t.x * u + b.x * v, y + t.y * u + b.y * v, z + t.z * u + b.z * v);
      for (const d of [2, 4, 7, 11]) {
        if (!at(d, 0) || !at(-d, 0) || !at(0, d) || !at(0, -d)) return Math.max(1.2, d - 1);
      }
      return Infinity;
    }

    // Tường bê tông cứ điểm: hố rỗ 3D thật (lõm có bóng đổ, như tường nhà) ngoài vết dán phẳng — vết dán xám trên nền bê tông
    // xám gần như không thấy từ tầm bắn xe tăng. Hư hại chỉ ở bề mặt: pháo chính mẻ 1 hố ~40-60 cm + vài rỗ mảnh văng quanh,
    // đạn súng 1 rỗ nhỏ; kết cấu, va chạm không đổi. Rỗ nào rơi ra ngoài mặt tường (mép cửa, góc) thì bỏ
    concretePits(SS, x, y, z, nx, nz, ammo, A, fx, hole, ny = 0) {
      const L = fx && fx.wallPits;
      if (!L || (!nx && !nz)) return;
      if (!L._holeMat && typeof Strongholds !== 'undefined' && Strongholds.holeDiscard) {
        L._holeMat = true;
        for (const P of [L.s, L.he]) for (const ly of P.layers || []) Strongholds.holeDiscard(ly.im.material);
      }
      const F = faceFrame(nx, ny, nz), n = F.n, t = F.t, b = F.b;   // t: ngang trên mặt, b: dọc theo mặt (đứng / dốc mặt vát)
      let sd = (Math.floor(x * 10) * 73856093 ^ Math.floor(y * 10) * 19349663 ^ Math.floor(z * 10) * 83492791) >>> 0;
      const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      const tint = [0.86, 0.84, 0.8];
      const put = (u, v, size, he) => {
        const px = x + t.x * u + b.x * v, py = y + t.y * u + b.y * v, pz = z + t.z * u + b.z * v;
        const h = SS.segmentHit(px + n.x * 4, py + n.y * 4, pz + n.z * 4, px - n.x * 3, py - n.y * 3, pz - n.z * 3);
        if (!h || h.type !== 'WALL' || (SS.inHole && SS.inHole(h.x, h.y, h.z, size * 0.5))) return;
        (he ? L.he : L.s).add(new THREE.Vector3(h.x, h.y, h.z), n, size, null, null, 0.85 + rnd() * 0.3, tint);
      };
      if (isBullet(ammo)) { put(0, 0, ammo === 'GATLING_BULLET' ? 2.8 : 2.1, ammo === 'GATLING_BULLET'); return; }
      if (!hole) put(0, 0, 3.6 * Math.min(1.5, 0.55 + A.e * 0.42), true);
      // rỗ mảnh văng quanh hố chính (thưa dần ra ngoài)
      const k = Math.round(3 + A.blast * 3);
      for (let i = 0; i < k; i++) {
        const a = rnd() * 6.283, d = 3 + Math.pow(rnd(), 0.7) * (5 + A.r * 0.35);
        put(Math.cos(a) * d, Math.sin(a) * d * 0.8, 1.4 + rnd() * 1.3, rnd() < 0.35);
      }
    }

    // Đạn súng chạm đất (gọi từ hiệu ứng nổ, mọi máy tự vẽ): vết nhỏ theo loại đạn, cộng dồn theo ô ~2.5 đơn vị
    groundHit(x, z, ammo, dir, tint) {
      const T = this.T;
      const y = this.surf(x, z);   // trong hố bom: vết nằm trên lòng hố nhìn thấy, không lơ lửng ở lưới vật lý
      const br = this.bridges.at(x, z);
      if (br) { this.concreteHit(x, br.y, z, 0, 0, ammo, ammoOf(ammo, false), true); return true; }
      // sàn / dốc / sân bê tông cứ điểm: vết đạn trên bê tông (sứt, rỗ), không phải lỗ đất
      const SS = T.strongholdSet;
      if (SS && SS.surfaceInfo && SS.surfaceInfo(x, z)) { this.concreteHit(x, y, z, 0, 0, ammo, ammoOf(ammo, false), true); return true; }
      // vỉa hè: vết đạn trên mặt lát (cao hơn đất một bậc bó vỉa), không phải lỗ đất bị mặt lát che
      const ST = T.streetscape;
      if (ST && ST.covers && ST.covers(x, z)) { this.concreteHit(x, ST.junk && ST.junk.rest ? ST.junk.rest(x, z) : y, z, 0, 0, ammo, ammoOf(ammo, false), true); return true; }
      const e = 1.5, hx = this.surf(x + e, z) - this.surf(x - e, z), hz = this.surf(x, z + e) - this.surf(x, z - e);
      const n = new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
      const A = ammoOf(ammo, false);
      const kind = isInc(ammo) ? 'g_burn' : ammo === 'GATLING_BULLET' ? 'g_hei' : 'g_pock';
      // đạn bay xiên: vết kéo dài theo hướng bay
      // trục +u của vết = hướng bay trên mặt đất (vết xoay quanh pháp tuyến: trục x cục bộ -> (cos r, 0, -sin r))
      let opts = { e0: A.e, tint };
      if (dir) {
        const fl = Math.hypot(dir.x || 0, dir.z || 0), sp = Math.hypot(fl, dir.y || 0) || 1;
        if (fl > 0.05) opts = { e0: A.e, tint, stretch: 1 + (fl / sp) * (kind === 'g_pock' ? 0.8 : 0.35), rot: Math.atan2(-dir.z, dir.x) };
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
      if (this.navBoxes.length) {
        const boxes = this.navBoxes;
        this.navBoxes = [];
        if (typeof Navigator !== 'undefined' && Navigator.invalidate) for (const b of boxes) Navigator.invalidate(this.T, b || undefined);
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
