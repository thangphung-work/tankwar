/**
 * Lớp Xe Pháo Tự Hành 3D Siêu Chi Tiết & Bộ Hiệu Ứng Cơ Giới Chân Thực (Art of War 3 SPG)
 * - Thiết kế khí tài quân sự viễn tưởng chuẩn phong cách Art of War 3:
 *   + Thân xe giáp nêm vát nghiêng đa diện, trang bị các khối giáp phản ứng nổ ERA ở mũi và sườn xe
 *   + Vè xích bọc giáp chịu lực, 10 bánh chịu lực hợp kim có vành crom + bánh răng dẫn hướng
 *   + 2 Thùng nhiên liệu phụ hình trụ gắn sau đuôi xe với đai kim loại
 *   + Đèn pha chiếu sáng rọi mặt đất (Headlight light cones) + đèn hậu cảnh báo đỏ
 *   + Tháp pháo đa giác góc cạnh hầm hố, tổ hợp trạm vũ khí điều khiển từ xa RCWS 12.7mm trên nóc
 *   + Đài radar/quang học xoay 360 độ liên tục trên vòm tháp pháo
 *   + 2 Ăng-ten viễn thông chiến thuật dài uốn lượn có đèn nhấp nháy chớp tắt nhịp điệu
 *   + Nòng pháo 155mm đa tầng, piston thủy lực kép, bầu hút khói nòng và loa che lửa 2 tầng có khe mang cá
 * - Bộ Hiệu Ứng Cơ Giới Sống Động:
 *   + Vết xích xe (Track Marks) hằn in trên mặt đất cát và mờ dần theo thời gian
 *   + Chớp lửa đầu nòng cực đại (Muzzle Flash), ánh sáng chiếu bừng cả thân xe và khu vực xung quanh
 *   + Vòng sóng kích nổ (Blast Shockwave Ring) bung ra cùng 2 luồng khói phụt 2 bên loa che lửa
 *   + Khói nòng lững lờ bốc lên sau phát bắn (Lingering barrel smoke)
 *   + Hiệu ứng giật thụt nòng pháo kèm nhún chấn động thân xe theo chu kỳ lò xo giảm chấn
 *   + Khói xả động cơ diesel phụt nhịp nhàng, cuộn đặc và có tàn lửa khi bứt tốc (Shift)
 *   + Bụi cát tung bay dày đặc theo xích xe và gió chiến trường, tăng vọt khi quay xe
 *   + Hiệu ứng hư hỏng theo % máu: bốc khói khoang máy (<60% HP), bốc lửa cháy rực rỡ (<30% HP), xác xe cháy đen bốc khói khi bị tiêu diệt
 */

/**
 * Kho tái sử dụng hạt hiệu ứng (khói, bụi, tia lửa, vệt xích)
 * - Hình khối dùng chung 1 bản duy nhất, chỉ phóng to/thu nhỏ theo kích thước
 * - Mesh + vật liệu được thu hồi về kho khi hạt tan biến, lần sau lấy ra dùng lại
 * => Không còn cấp phát/hủy hàng nghìn đối tượng mỗi giây gây giật khung hình
 */
// Texture khói thể tích procedural đa tầng: viền mềm mịn, tâm xốp, không còn bọc tròn sắc cạnh
let SMOKE_TEX_VARIANTS = null;
function getSmokeTextures() {
  if (SMOKE_TEX_VARIANTS || typeof document === 'undefined') return SMOKE_TEX_VARIANTS;
  SMOKE_TEX_VARIANTS = [];
  const size = 128;
  const c = size / 2;

  for (let v = 0; v < 3; v++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Các cụm búp khói xốp lồng nhau quanh tâm tạo hình đám khói tự nhiên
    const count = 7 + v * 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (v * 1.7) + (Math.sin(i * 3.3) * 0.4);
      const dist = (i === 0) ? 0 : (c * (0.16 + (Math.sin(i * 7.1 + v) * 0.5 + 0.5) * 0.22));
      const px = c + Math.cos(a) * dist;
      const py = c + Math.sin(a) * dist;
      const r = (i === 0) ? (c * 0.58) : (c * (0.34 + (Math.cos(i * 5.2) * 0.5 + 0.5) * 0.24));

      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      // Nửa trên hơi sáng nhẹ tạo cảm giác thể tích ánh sáng 3D
      const lum = 245 + Math.round((c - py) * 0.15);
      grad.addColorStop(0, `rgba(${lum}, ${lum}, ${lum}, 0.85)`);
      grad.addColorStop(0.35, `rgba(${lum - 8}, ${lum - 8}, ${lum - 8}, 0.52)`);
      grad.addColorStop(0.7, `rgba(${lum - 20}, ${lum - 20}, ${lum - 20}, 0.16)`);
      grad.addColorStop(1, `rgba(${lum - 30}, ${lum - 30}, ${lum - 30}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    SMOKE_TEX_VARIANTS.push(tex);
  }
  return SMOKE_TEX_VARIANTS;
}

const SpgFXPool = {
  geos: null,
  free: { sphere: [], sphereLow: [], plane: [], smoke: [] },
  maxFree: 600,

  init() {
    if (this.geos) return;
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.geos = {
      sphere: new THREE.SphereGeometry(1, 6, 6),
      sphereLow: new THREE.SphereGeometry(1, 4, 4),
      plane
    };
  },

  acquire(scene, kind, color, opacity, transparent = true) {
    this.init();

    // Hạt khói và bụi: dùng Sprite thể tích viền mềm, tự động quay mặt về camera ở mọi góc nhìn
    if (kind === 'sphere' || kind === 'smoke' || kind === 'dust') {
      if (!this.free.smoke) this.free.smoke = [];
      let sprite = this.free.smoke.pop();
      if (!sprite) {
        const texs = getSmokeTextures();
        const tex = texs ? texs[Math.floor(Math.random() * texs.length)] : null;
        const mat = new THREE.SpriteMaterial({
          map: tex,
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthWrite: false
        });
        sprite = new THREE.Sprite(mat);
        sprite.userData.fxKind = 'smoke';
        sprite.renderOrder = 13;   // vẽ sau xạ thủ trinh sát (lượt trong suốt 12) -> khói phía trước che được người
      }
      sprite.material.color.setHex(color);
      sprite.material.opacity = opacity;
      sprite.material.transparent = transparent;
      sprite.material.rotation = Math.random() * Math.PI * 2;
      sprite.position.set(0, 0, 0);
      sprite.scale.set(1, 1, 1);
      sprite.visible = true;
      scene.add(sprite);
      return sprite;
    }

    let mesh = this.free[kind] ? this.free[kind].pop() : null;
    if (!mesh) {
      mesh = new THREE.Mesh(this.geos[kind] || this.geos.plane, new THREE.MeshBasicMaterial({ depthWrite: false }));
      mesh.userData.fxKind = kind;
    }
    const mat = mesh.material;
    mat.color.setHex(color);
    mat.transparent = transparent;
    mat.opacity = opacity;
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.visible = true;
    scene.add(mesh);
    return mesh;
  },

  release(mesh) {
    if (mesh.parent) mesh.parent.remove(mesh);
    const kind = mesh.userData.fxKind;
    if (kind === 'smoke') {
      if (!this.free.smoke) this.free.smoke = [];
      if (this.free.smoke.length < this.maxFree) this.free.smoke.push(mesh);
      else mesh.material.dispose();
      return;
    }
    const list = this.free[kind];
    if (list && list.length < this.maxFree) {
      list.push(mesh);
    } else {
      mesh.material.dispose();
    }
  },

  // 3 đèn chớp tạo sẵn cho mỗi scene, xoay vòng tái sử dụng (số đèn không đổi -> không biên dịch lại shader)
  // Mỗi lần lấy đèn tăng userData.claim: nơi giữ đèn ghi lại số này, đèn đã bị nơi khác lấy thì thôi không chỉnh nữa
  // (trước đây chủ cũ ghi đè độ sáng / tắt đèn của chủ mới). opts.life (s): đèn bận tới lúc đó.
  // opts.low: đèn phụ (ánh lửa cháy) — chỉ lấy đèn đang rảnh, không giật đèn chớp nổ / đầu nòng
  muzzleLight(scene, opts) {
    if (!scene) return null;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let pool = scene.userData.muzzleLights;
    if (!pool) {
      pool = { lights: [], next: 0 };
      for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xffb066, 0, 220, 2);
        scene.add(l);
        pool.lights.push(l);
      }
      scene.userData.muzzleLights = pool;
    }
    let l = null;
    if (opts && opts.low) {
      for (let i = 0; i < pool.lights.length; i++) {
        const c = pool.lights[(pool.next + i) % pool.lights.length];
        if (!(c.userData.busyUntil > now)) { l = c; break; }
      }
      if (!l) return null;
    } else {
      l = pool.lights[pool.next];
      pool.next = (pool.next + 1) % pool.lights.length;
    }
    l.userData.claim = (l.userData.claim || 0) + 1;
    l.userData.busyUntil = now + ((opts && opts.life) || 0.15) * 1000;
    return l;
  },

  // Vật liệu lửa đầu nòng (cộng sáng, 2 mặt). Dùng chung cho rig dưới đây & bước làm nóng shader (game.prewarmEffects)
  // -> cùng tham số shader
  flashMaterial(map) {
    return new THREE.MeshBasicMaterial({
      map, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
  },

  // Tấm 1x1 trỏ vào 1 trong 4 ô atlas lửa (2x2). tip: lưỡi lửa dựng dọc trục -Z, mép ảnh trên (miệng nòng) ở gốc
  flashGeos() {
    if (this._mfGeos) return this._mfGeos;
    const quad = (tip) => [0, 1, 2, 3].map(q => {
      const g = new THREE.PlaneGeometry(1, 1), uv = g.attributes.uv;
      const u0 = (q % 2) * 0.5, v0 = (q >> 1) ? 0 : 0.5;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
      if (tip) { g.rotateX(Math.PI / 2); g.translate(0, 0, -0.5); }
      return g;
    });
    return (this._mfGeos = { disc: quad(false), petal: quad(true) });
  },

  /**
   * LỬA ĐẦU NÒNG PHÁO CHÍNH: bể 4 rig dựng sẵn cho mỗi scene, xoay vòng như đèn chớp. Mỗi rig: 1 đĩa lửa nhìn dọc nòng +
   * 4 lưỡi lửa dọc nòng xếp 45° quanh trục (nhìn góc nào cũng ra hình ngọn lửa) + 2 cụm lưỡi lửa phụt ngang của loa hãm
   * lùi (lựu pháo), vẽ bằng atlas lửa có thớ (lõi nhỏ, lưỡi khí cháy lệch không đều, mép rách — không phải đốm tròn có tia
   * sao). Vật liệu tạo một lần, không huỷ: trước đây mỗi phát tạo 8 vật liệu mới rồi huỷ sau 0,08 s.
   * Tự hoạt ảnh theo đồng hồ trong onBeforeRender: không cần vòng cập nhật của xe, xe bị gỡ giữa chừng không để lại lửa
   */
  flashRig(scene) {
    if (!scene || typeof VehicleKit === 'undefined' || !VehicleKit.getAutocannonFlashAtlas) return null;
    let pool = scene.userData.flashRigs;
    if (!pool) {
      const atlas = VehicleKit.getAutocannonFlashAtlas();
      if (!atlas) return null;
      const G = this.flashGeos();
      pool = scene.userData.flashRigs = { rigs: [], next: 0 };
      for (let i = 0; i < 4; i++) {
        const front = this.flashMaterial(atlas.front), side = this.flashMaterial(atlas.side);
        const group = new THREE.Group();
        group.visible = false;
        const disc = new THREE.Mesh(G.disc[0], front);
        group.add(disc);
        const petals = [];
        for (let a = 0; a < 4; a++) {
          const m = new THREE.Mesh(G.petal[a], side);
          group.add(m);
          petals.push(m);
        }
        // loa hãm lùi: mỗi bên 2 lưỡi bắt chéo, phụt ngang và hơi ngả về sau (khí bị hắt để triệt tiêu lực giật)
        const jets = [];
        for (const s of [-1, 1]) {
          const holder = new THREE.Group();
          holder.position.set(s * 1.4, 0, 3.2);
          holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(s, 0, 0.3).normalize());
          for (const r of [0, Math.PI / 2]) {
            const m = new THREE.Mesh(G.petal[0], side);
            m.rotation.z = r;
            holder.add(m);
            jets.push(m);
          }
          group.add(holder);
        }
        const rig = { group, disc, petals, jets, front, side, t0: -1e9, life: 0.08, L: 1, W: 1, D: 1, J: 0 };
        const tick = () => this.tickFlashRig(rig);
        for (const m of [disc, ...petals, ...jets]) {
          m.onBeforeRender = tick;
          m.renderOrder = 14;   // cùng lượt lửa của ExplosionFX (vẽ sau khói)
          m.userData.isFxDecal = true;   // tia dò đạn / dò bề mặt bỏ qua
        }
        scene.add(group);
        pool.rigs.push(rig);
      }
    }
    const rig = pool.rigs[pool.next];
    pool.next = (pool.next + 1) % pool.rigs.length;
    return rig;
  },

  // Bùng lửa một phát bắn: tip / dir / side (thế giới) — side là trục ngang của nòng. o: { k: cỡ (pháo 120 mm = 1), brake }
  fireFlashRig(rig, tip, dir, side, o) {
    const k = o.k || 1, g = rig.group, G = this.flashGeos(), R = Math.random;
    const z = new THREE.Vector3().copy(dir).negate().normalize();
    const x = new THREE.Vector3().copy(side).addScaledVector(z, -side.dot(z)).normalize();
    if (x.lengthSq() < 0.5) x.set(1, 0, 0).cross(z).normalize();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z));
    g.position.copy(tip);
    // mỗi phát một dáng khác: biến thể texture, góc xoay, độ dài / bề ngang lưỡi lửa
    const roll = R() * Math.PI / 4;
    rig.petals.forEach((m, a) => { m.geometry = G.petal[(a + (R() * 4 | 0)) % 4]; m.rotation.z = roll + a * Math.PI / 4 + (R() - 0.5) * 0.3; });
    rig.disc.geometry = G.disc[R() * 4 | 0];
    rig.disc.rotation.z = R() * Math.PI * 2;
    rig.disc.position.z = -1.2 * k;
    for (const m of rig.jets) m.geometry = G.petal[R() * 4 | 0];
    // 120 mm: lưỡi lửa ~3-4 m, đĩa ~2 m; lựu pháo 155 có hãm lùi: lửa phía trước ngắn lại, phần lớn phụt ngang
    rig.L = (o.brake ? 17 : 27) * k * (0.85 + R() * 0.35);
    rig.W = rig.L * (0.45 + R() * 0.15);
    rig.D = (o.brake ? 13 : 17) * k * (0.9 + R() * 0.25);
    rig.J = o.brake ? 15 * k * (0.85 + R() * 0.3) : 0;
    rig.life = o.brake ? 0.1 : 0.08;
    rig.t0 = performance.now();
    g.visible = true;
    this.tickFlashRig(rig);
  },

  // Chớp thật chỉ vài ms: sáng nhất ngay khung đầu rồi tắt theo hàm mũ (~3-5 khung ở 60 FPS); lưỡi lửa vươn dài ra trong
  // ~20 ms đầu, màu từ trắng vàng (lửa sơ cấp) ngả cam đỏ (khí cháy lần hai nguội dần)
  tickFlashRig(rig) {
    const t = (performance.now() - rig.t0) / 1000;
    if (t >= rig.life) { rig.group.visible = false; rig.front.opacity = rig.side.opacity = 0; return; }
    const I = Math.exp(-t / (rig.life * 0.34)) * (1 - t / rig.life);
    const grow = 1 - Math.exp(-t / 0.016);
    const hot = Math.max(0, 1 - t / (rig.life * 0.55));
    rig.side.opacity = I;
    rig.front.opacity = I * 0.85;
    rig.side.color.setRGB(1, 0.6 + 0.35 * hot, 0.3 + 0.55 * hot);
    rig.front.color.setRGB(1, 0.7 + 0.3 * hot, 0.45 + 0.5 * hot);
    const L = rig.L * (0.6 + 0.6 * grow), W = rig.W * (0.7 + 0.5 * grow);
    for (const m of rig.petals) m.scale.set(W, 1, L);
    rig.disc.scale.setScalar(rig.D * (0.75 + 0.55 * grow));
    for (const m of rig.jets) {
      m.visible = rig.J > 0;
      m.scale.set(rig.J * 0.5 * (0.7 + 0.5 * grow), 1, rig.J * (0.6 + 0.6 * grow));
    }
  },

  // NGÂN SÁCH BỤI / KHÓI XE: mỗi hạt là 1 Sprite / Mesh riêng = 1 lượt vẽ trong suốt (không gộp được vì độ mờ từng hạt
  // khác nhau) — 10 xe chạy trên cát ~500 lượt vẽ + tô chồng nhiều lớp. Quá ngưỡng: xe ở xa thưa bụi trước, xe gần vẫn đủ;
  // quá hẳn thì bỏ hạt mới. Đếm tổng hạt đang sống của mọi xe, cache 0,1 s
  FX_SOFT: 220, FX_HARD: 360,
  _live: 0, _liveAt: 0,
  liveCount() {
    const now = performance.now();
    if (now - this._liveAt < 100) return this._live;
    this._liveAt = now;
    const g = window.game || window.artilleryGame;
    let n = 0;
    if (g && g.units) for (const u of g.units) if (u.fxParticles) n += u.fxParticles.length;
    return (this._live = n);
  },
  // true = bỏ hạt bụi / khói xe này. dist: cự ly tới xe người chơi (gần ưu tiên giữ)
  thin(dist) {
    const n = this.liveCount();
    if (n < this.FX_SOFT) return false;
    if (n >= this.FX_HARD) return true;
    const k = (n - this.FX_SOFT) / (this.FX_HARD - this.FX_SOFT);   // 0..1
    return Math.random() < k * Math.min(1, dist / 350);
  },
  distToPlayer(x, z) {
    const g = window.game || window.artilleryGame, p = g && g.player;
    return p ? Math.hypot(x - p.x, z - p.z) : 0;
  },

  // Chỉ sinh hiệu ứng cho xe nằm trong tầm nhìn quanh xe người chơi
  isNearView(x, z, range = 1100) {
    const g = window.game || window.artilleryGame;
    const p = g && g.player;
    if (!p) return true;
    return Math.abs(x - p.x) < range && Math.abs(z - p.z) < range;
  }
};
window.SpgFXPool = SpgFXPool;

// Thời gian chờ trong game = thời gian thật x hệ số nhịp game (src/core/game_timing.js, mặc định 0.5)
const gameTime = (realSeconds) => (typeof GameTiming !== 'undefined' ? GameTiming.t(realSeconds) : realSeconds * 0.5);
// Tốc độ tối đa cơ sở = tốc độ thật (km/h) x speedScale; trên đường nhựa tốt (x1.15) đạt đúng tốc độ thật tối đa
const vehicleTopSpeed = (tankType, fallback) => (typeof GameTiming !== 'undefined' ? GameTiming.baseVehicleSpeed(tankType) : fallback);
// Bán kính quay vòng tối thiểu của xe bánh lốp thật (m, tính tới tâm cầu sau), quy theo tỉ lệ thân xe 8 đơn vị = 1 m:
// xe tải 6x6 chở lựu pháo 155mm (kiểu Caesar 6x6 / Archer) quay vòng ~20 m đường kính; xe trinh sát 4x4 (kiểu Fennek / LMV) ~13 m
const WHEEL_TURN_RADIUS_M = { ARTILLERY: 10.0, SCOUT: 6.5 };
const wheelTurnRadius = (tankType) => (WHEEL_TURN_RADIUS_M[tankType] || 0) * (typeof GameTiming !== 'undefined' ? GameTiming.UNITS_PER_M : 8);

const NO_DEBRIS = [];   // danh sách đổ nát rỗng (xích tì lên mặt hố bom, không có đống gạch)
const SPG_EB_NONE = Object.freeze({ s: 1, a: 1 });   // engineBoost: máy nguyên bản (không tăng tốc)
// Hệ số lăn bánh theo loại mặt đất (bánh xích vs bánh lốp): hằng, không dựng lại mỗi khung
const SPG_DRIVE = {
  ARTILLERY: { SAND: 0.82, JUNGLE_SOIL: 0.85, WATER: 0.8, MOUNTAIN: 1, GRASS: 0.95, ROAD: 1.05, URBAN_ROAD: 1.1, BRIDGE: 1.1 },
  SCOUT: { SAND: 0.95, JUNGLE_SOIL: 0.95, WATER: 0.85, ROAD: 1.05, URBAN_ROAD: 1.08, BRIDGE: 1.08 },
  TRACKED: { SAND: 1.06, JUNGLE_SOIL: 1.05, WATER: 1.05 }   // xích ít bị địa hình mềm cản hơn
};
// Va chạm xe - xe: ô nhớ dùng lại (hộp thân xe mình / xe kia, vector đẩy, danh sách xe ở gần)
const SPG_OBB_ME = {}, SPG_OBB_OT = {}, SPG_OBB_P = {}, SPG_NEAR_VEH = [];
// Hộp thân xe (mặt bằng, xoay theo hướng xe) khi tâm xe ở (x, z) -> ghi vào o
function spgVehObb(VC, u, x, z, o) {
  const B = VC.hullBox(u), a = u.bodyAngle || 0, ca = Math.cos(a), sa = Math.sin(a);
  const lcx = (B.minX + B.maxX) / 2, lcz = (B.minZ + B.maxZ) / 2;
  o.cx = x + lcx * ca + lcz * sa; o.cz = z - lcx * sa + lcz * ca; o.ux = ca; o.uz = -sa;
  o.hu = (B.maxX - B.minX) / 2; o.hv = (B.maxZ - B.minZ) / 2;
  return o;
}
// Bộ hiệu ứng khói bụi / tia lửa của trận (null ở phòng thử không có)
function spgFx() { const g = typeof window !== 'undefined' && window.game; return g && g.effectsManager && g.effectsManager.fx || null; }
/**
 * VA CHẠM CÓ LỰC (xe - xe, xe - tường / đá / cây / cột / ô tô): mọi xe (cả AI, xe mạng), không chỉ xe người chơi.
 * vn: tốc độ áp sát theo pháp tuyến (đv/s), vt: tốc độ trượt dọc mặt tiếp xúc, mA / mB: khối lượng (tấn; mB = Infinity
 * với vật cố định). Xung lực J = khối lượng quy đổi x vn -> độ to / độ trầm tiếng va, rung camera (xe mình), bụi / tia lửa.
 * first: lúc mới chạm (tiếng va); đang tì sát mà trượt dọc thì tiếng cạ nghiến kéo dài (scrapeAt)
 */
function spgImpact(unit, mat, pos, vn, vt, mA, mB, first, other) {
  const S = typeof window !== 'undefined' && window.soundEngine;
  const mu = isFinite(mB) ? mA * mB / (mA + mB) : mA, J = mu * Math.max(0, vn);
  const self = !!(unit && unit.isPlayer) || !!(other && other.isPlayer);
  const key = (unit && unit.id) + '|' + (other ? other.id || mat : mat);
  if (first && vn > 4) {
    if (S && S.collideAt) S.collideAt(pos, { J, vn, mA, mB, mat, self, key });
    // rung camera theo xung lực (xe tăng 60 tấn đâm tường ở 36 km/h rung mạnh; xe 4x4 cạ ô tô gần như không)
    const g = typeof window !== 'undefined' && window.game;
    if (self && g) {
      g.cameraShake = Math.max(g.cameraShake || 0, Math.min(9, Math.sqrt(J) / 7));
      if (g.pushCamera) {
        const pUnit = (unit && unit.isPlayer) ? unit : (other && other.isPlayer) ? other : null;
        if (pUnit && pos) {
          const dx = pUnit.x - pos.x, dz = pUnit.z - pos.z, d = Math.hypot(dx, dz) || 1;
          const p = Math.min(18, Math.sqrt(J) * 0.35);
          g.pushCamera(dx / d * p, Math.min(8, p * 0.4), dz / d * p);
        }
      }
    }
    // bụi tường / đất tung ở chỗ va, tia lửa thép - thép
    const fx = spgFx();
    if (fx && fx.smoke && J > 300) {
      const n = Math.min(10, 2 + Math.floor(J / 600)), metal = mat === 'vehicle' || mat === 'wreck' || mat === 'metal' || mat === 'pole';
      const col = metal ? [0.32, 0.3, 0.28] : mat === 'tree' || mat === 'wood' ? [0.42, 0.36, 0.24] : [0.6, 0.57, 0.52];
      for (let i = 0; i < n; i++) fx.smoke.add({ x: pos.x + (Math.random() - 0.5) * 6, y: pos.y + Math.random() * 4, z: pos.z + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 14, vy: 3 + Math.random() * 8, vz: (Math.random() - 0.5) * 14, size: 1.6 + Math.random() * 2, grow: 3, drag: 2, grav: 3, life: 1.2 + Math.random(), alpha: 0.45, fadeIn: 0.02, c0: col, cell: 2 });
    }
  } else if (!first && vt > 10 && S && S.scrapeAt) S.scrapeAt(pos, { vt, mA, mat, self, key });

  // BIẾN DẠNG MÓP MÉO VÀ VĂNG PHỤ KIỆN KHI ĐÂM NHAU (Tank vs Tank / Xe vs Xe / Xe vs Tường)
  if (typeof VehicleDamage !== 'undefined' && pos) {
    const isVehCrash = mat === 'vehicle' || mat === 'wreck';
    const hitP = new THREE.Vector3(pos.x, pos.y, pos.z);
    // 1. Va chạm mạnh (first và vn > 5.5) hoặc xung lực J lớn: làm móp sâu thật trên vỏ xe
    if (first && (vn > 5.5 || J > 320)) {
      const depth = Math.min(1.8, Math.max(0.18, J / 450 * 0.45));
      const rad = Math.min(8.5, Math.max(3.2, Math.sqrt(J) * 0.28));
      const crashDirA = other ? new THREE.Vector3(other.x - unit.x, 0, other.z - unit.z).normalize() : new THREE.Vector3(-Math.sin(unit.bodyAngle || 0), 0, -Math.cos(unit.bodyAngle || 0));
      VehicleDamage.crumpleAt(unit, hitP, crashDirA, rad, depth);
      if (other && other.group) {
        const crashDirB = crashDirA.clone().negate();
        VehicleDamage.crumpleAt(other, hitP, crashDirB, rad * 0.9, depth * (mA / Math.max(mB, 1)));
      }
      // Tia lửa thép va thép tóe sáng
      if (VehicleDamage.sfx && isVehCrash) VehicleDamage.sfx('armorPlate', hitP, Math.min(1.3, 0.45 + J / 800));
    }

    // 2. Phụ kiện gắn quanh vùng va chạm (chắn bùn, đèn pha, gương, giá đồ, váy xích) bị bẻ quẹo hoặc giật bung
    if (vn > 3.5 || (first && J > 200)) {
      const checkStrip = (uTarget, awayDir) => {
        if (!uTarget || !uTarget.group) return;
        const dState = VehicleDamage.state(uTarget);
        const tags = Object.keys(uTarget.partRegistry || {}).concat(Object.keys(uTarget.partGroups || {}));
        for (const t of tags) {
          if (dState.lost.has(t)) continue;
          if (/^(skirt|flap|lamp|mirror|bin|box|can|cans|tool|dozer|shield|travelLock)/.test(t)) {
            const pw = VehicleDamage.partWorld ? VehicleDamage.partWorld(uTarget, t) : null;
            if (pw && pw.distanceTo(hitP) < 14) {
              if (vn > 8.5 || J > 600) {
                const imp = awayDir.clone().multiplyScalar(40).add(new THREE.Vector3(0, 18, 0));
                if (VehicleDamage.detachTag(uTarget, t, imp, pw)) {
                  VehicleDamage.onPartLost(uTarget, t, 'acc', [], spgFx(), pw);
                }
              } else if (!dState.bent.has(t)) {
                VehicleDamage.bendTag(uTarget, t, awayDir.clone().multiplyScalar(30));
              }
            }
          }
        }
      };
      const awayA = other ? new THREE.Vector3(unit.x - other.x, 0.2, unit.z - other.z).normalize() : new THREE.Vector3(Math.sin(unit.bodyAngle || 0), 0.2, Math.cos(unit.bodyAngle || 0));
      checkStrip(unit, awayA);
      if (other && isVehCrash) checkStrip(other, awayA.clone().negate());
    }
  }
}

class SPGUnit3D {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.id = options.id || Math.random().toString(36).substring(2, 9);
    this.name = options.name || 'PHÁO TỰ HÀNH #1';
    this.isPlayer = !!options.isPlayer;
    this.isRemotePlayer = !!options.isRemotePlayer;
    this.peerId = options.peerId || null;
    this.team = options.team || (this.isPlayer ? 'BLUE' : 'RED');
    // hạt giống vẻ ngoài (hao mòn, số hiệu, vết bẩn — VehicleKit.lookSeed); phòng xem xe truyền cố định để dựng lại không đổi
    if (options.lookSeed != null) this.lookSeed = options.lookSeed;
    this.invulnerableTimer = 0; // Thời gian khiên bảo vệ bất tử khi mới xuất trận hoặc hồi sinh

    // Tọa độ không gian 3D
    this.x = options.x || 0;
    this.z = options.z || 0;
    this.y = 0;
    this.bodyAngle = options.bodyAngle || 0;

    // ==========================================
    // PHÂN LOẠI 3 BINH CHỦNG XE TĂNG TÁC CHIẾN:
    // 1. ALL_ROUNDER: Tank đa dụng (mặc định) - Máu cao, dame vừa, bắn tầm trung
    // 2. GATLING: Tank 6 nòng cận chiến - Đốt máu dần, khởi động 3s đạt full công suất, nạp chậm
    // 3. ARTILLERY: Pháo tự hành hạng nặng - Tầm bắn toàn bản đồ, dame cực cao, máu giấy, di chuyển chậm
    // ==========================================
    this.tankType = options.tankType || 'ALL_ROUNDER';

    if (this.tankType === 'GATLING') {
      // Xe hỏa lực yểm trợ bánh xích trên khung gầm xe tăng: 3.0 máu (dưới xe tăng chủ lực 3.2 — hỏa lực liên thanh mạnh
      // nhất trận nên không thể trâu nhất; trước đây 4.0). Chỉ mũi thân dày, tháp vũ khí / sườn / đuôi mỏng
      this.baseMaxHp = 3.0;
      this.maxHp = 3.0;
      this.baseMaxSpeed = vehicleTopSpeed('GATLING', 113); // khung gầm xích như tăng chủ lực nhưng nặng nhất: 65 km/h đường tốt
      this.acceleration = this.baseMaxSpeed * 0.5;          // lực kéo lúc khởi hành; giảm dần khi xe nhanh lên (0 -> 50% ~1.2 s, 0 -> 90% ~2.6 s)
      this.turnRate = 1.7;       // rad/s tối đa khi xoay thân (~100°/s)
      this.climbMax = 1.0;       // độ dốc leo được tối đa (tan): ~45°, xích bám tốt
      this.reloadDuration = gameTime(6.0);  // thay hòm đạn 300 viên (gốc 6 s, đã rút gọn so với vài phút ngoài thực tế); hòm 450 / 650: fsv_hailstorm.js mountMag

      // Thông số cụm 6 nòng xoay Gatling & Cơ chế nhiệt độ nòng
      this.spinUpTime = 0;
      this.spinRequired = 0.50; // Khởi động nòng 0.50s (tiếng mô tơ xoay rù rù rồi xả bão đạn cực nhanh)
      this.isSpinning = false;
      this.gatlingAngle = 0;
      this.gatlingRofTimer = 0;
      this.gatlingMagMax = 300; // Hòm đạn mặc định 300 viên (~10 s xả liên tục ở 1800 phát/phút); mua thêm hòm 450 / 650 (ô HỘP ĐẠN)
      this.gatlingMag = 300;
      this.gatlingCluster = null;
      this.barrelHeat = 0.0;    // Nhiệt độ nòng (0.0: Nguội -> 1.0: Quá nhiệt)
      this.isOverheated = false;// Trạng thái nòng quá nhiệt chờ nguội
      this.gatlingHeatMat = null;
    } else if (this.tankType === 'ARTILLERY') {
      // Pháo tự hành bánh lốp 6x6: cabin bọc giáp mỏng, chạy đường nhanh (bắn - chạy) nhưng nặng nề, cua rộng
      this.baseMaxHp = 2.2;   // máu vừa (trên trinh sát): hỏa lực to nhất nhưng kém chính xác
      this.maxHp = 2.2;
      this.hp = 2.2;
      this.baseMaxSpeed = vehicleTopSpeed('ARTILLERY', 122); // xe tải 6x6 chở lựu pháo: 70 km/h đường tốt, nặng nề ngoài địa hình
      this.acceleration = this.baseMaxSpeed * 0.358;          // xe tải 6x6 nặng: 0 -> 50% ~1.7 s, 0 -> 90% ~3.6 s
      this.turnRate = 1.5;
      this.climbMax = 0.5;       // leo dốc hạn chế (~27°): không lên được ụ cứ điểm / sườn đá dốc
      this.reloadDuration = gameTime(6.0);  // nạp đạn tự động thật ~6 s (8-9 phát/phút như Archer / PzH 2000)

      // Cơ chế chân chống thủy lực (Deploy Outrigger Legs)
      this.isDeployed = false;
      this.deployProgress = 0.0;// Tiến trình hạ càng 1.5s
      this.standStillTimer = 0.0;
      this.minFiringDist = 500.0;// Cự ly tối thiểu: liều phóng nhỏ nhất (liều 5) ở góc nòng tối đa 70° (~5 km thật x tỉ lệ lựu pháo)
      this.artySpadeGroup = null;
      this.outriggerLeft = null;
      this.outriggerRight = null;
    } else if (this.tankType === 'SCOUT') {
      // Xe trinh sát 4x4 giáp nhẹ: chỉ chống đạn súng bộ binh & mảnh, nhanh và linh hoạt nhất
      this.baseMaxHp = 1.6;   // máu yếu nhất trận: đánh du kích, bắn tên lửa rồi rút
      this.maxHp = 1.6;
      this.baseMaxSpeed = vehicleTopSpeed('SCOUT', 148); // xe nhanh nhất: 85 km/h đường tốt (xe 4x4 bọc thép, nặng hơn xe dân sự)
      this.acceleration = this.baseMaxSpeed * 0.589;      // xe 4x4 nhẹ: 0 -> 50% ~1.0 s, 0 -> 90% ~2.2 s
      this.turnRate = 2.6;
      this.climbMax = 1.05;      // 4x4 việt dã: leo địa hình rất tốt
      this.reloadDuration = gameTime(12.0); // thay hộp 100 viên 12.7mm thật ~10-15 s một người: lật nắp khóa nòng, tháo hộp cũ, cúi xuống khoang lấy hộp mới, lắp dây đạn, kéo lên đạn 2 lần (nhịp từng bước: VehicleCrew MG_WARP)
      this.reconRadius = 950.0;  // Bán kính radar trinh sát quay tròn (bắt cả xe địch núp bụi) — xem TeamIntel

      // Súng máy hạng nhẹ
      this.spinUpTime = 0;
      this.spinRequired = 0.25;  // Chỉ cần nhấp nhẹ 0.25s là nhả đạn
      this.isSpinning = false;
      this.gatlingAngle = 0;
      this.gatlingRofTimer = 0;
      this.gatlingMagMax = 100;  // Dây đạn 100 viên súng máy 12.7mm
      this.gatlingMag = 100;
      this.gatlingCluster = null;

      // Đạn RPG / chống tăng (Tên lửa phản lực tầm xa)
      this.antiTankCooldownMax = gameTime(11.0); // kíp thạo việc nạp lại ống phóng trên nóc ~11 s: giật vỏ rỗng, tống quả mới dứt khoát (hoạt cảnh: VehicleCrew AT)
      this.antiTankCooldown = 0;      // Đã sẵn sàng khi vào trận
      this.antiTankLauncherMesh = null;
    } else {
      this.tankType = 'ALL_ROUNDER';
      this.baseMaxHp = 3.2; // Máu cao nhất trận (3.2, trên xe 6 nòng 3.0), giáp composite dày nhất ở mặt trước, sát thương mỗi phát to
      this.maxHp = 3.2;
      this.baseMaxSpeed = vehicleTopSpeed('ALL_ROUNDER', 122); // 70 km/h đường tốt (~45-55 việt dã)
      this.acceleration = this.baseMaxSpeed * 0.433;            // xe 60 tấn, 1500 mã lực: 0 -> 50% ~1.4 s, 0 -> 90% ~3 s
      this.turnRate = 1.5;       // ~85°/s khi xoay tại chỗ
      this.climbMax = 1.0;       // xe tăng leo được ụ đất / nắp hầm cứ điểm
      this.reloadDuration = gameTime(5.0);  // nạp đạn thật ~5 s (nạp tay / tự động 5-7 s); người chơi & bot như nhau
    }
    // Xe bánh lốp (Arbalest 6x6, Marten 4x4) lái bằng bánh trước: không xoay tại chỗ như xe xích, quay theo bán kính quay vòng
    this.isWheeled = this.tankType === 'SCOUT' || this.tankType === 'ARTILLERY';
    // KHỐI LƯỢNG (tấn): xe 6 nòng (thân nặng + lưỡi ủi) 65, xe tăng chủ lực 60, xe tải 6x6 mang pháo 155 32, xe trinh sát
    // 4x4 10. Dùng chia lực đẩy khi 2 xe va nhau (xe nhẹ bật ra, xe nặng gần như không suy suyển) và tính xung lực va chạm
    // (độ to tiếng va, rung, hư hại vật bị húc)
    this.mass = { GATLING: 65, ARTILLERY: 32, SCOUT: 10 }[this.tankType] || 60;
    this.turnRadius = this.isWheeled ? wheelTurnRadius(this.tankType) : 0;
    // Lội nước (8 đơn vị = 1 m): [sâu lội bình thường, sâu tối đa trước khi nước tràn vào khoang máy]
    // Xe tăng ~1.2 m (lội không chuẩn bị), xe hỏa lực cùng khung gầm; xe tải 6x6 ~1 m; xe 4x4 trinh sát thấp nhất ~0.8 m.
    // Ngập (nước vào khoang máy) ở ~1.45 m — ngay trên miệng ống xả / cửa hút gió sàn máy (Halberd ~1.3 m); trước đây 1.75 m,
    // sâu hơn lòng sông sâu nhất (~1.5 m) nên xe tăng không bao giờ bị ngập
    const WADE = { ALL_ROUNDER: [9.6, 11.5], GATLING: [9.6, 11.5], ARTILLERY: [8, 11], SCOUT: [6.5, 9.5] }[this.tankType] || [9.6, 11.5];
    this.wadeDepth = WADE[0];
    this.wadeMax = WADE[1];
    this.waterDepth = 0;

    this.speed = 0;
    this.hp = this.maxHp;
    this.hasReactiveArmor = false;
    this.reactiveArmorMesh = null;
    this.speedBoostTimer = 0;

    // Trạng thái núp bụi ngụy trang chiến thuật
    this.isInBush = false;
    this.revealTimer = 0;
    this.isHiddenFromPlayer = false;

    // Hệ thống góc bắn (xe 6 nòng cận chiến cố định nòng ở 0 độ)
    this.azimuth = options.azimuth || 0;
    // Pháo tự hành: mũi xe là điểm mù khi BẮN (không bắn vắt qua cabin), nhưng nòng vẫn gác được lên giá khóa trên
    // nóc cabin khi hành quân. Hướng ban đầu rơi vào điểm mù -> gác nòng thẳng mũi xe (tư thế hành quân)
    if (this.tankType === 'ARTILLERY' && typeof BallisticsSystem3D !== 'undefined') {
      const rel = -(this.azimuth * Math.PI / 180) - (options.bodyAngle || 0);
      if (Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel))) < BallisticsSystem3D.ARTY_DIRECT.blind) this.azimuth = ((-(options.bodyAngle || 0) * 180 / Math.PI) % 360 + 360) % 360;
    }
    this.canElevate = (this.tankType !== 'GATLING');
    this.elevation = this.canElevate ? (options.elevation !== undefined ? options.elevation : 0) : 0;
    this.charge = options.charge || 1;

    // Hiệu ứng giật lùi nòng pháo & nhún giảm xóc thân xe
    this.barrelRecoil = 0;
    this.chassisRecoilPitch = 0;
    this.chassisRecoilRoll = 0;
    // Dao động thân xe do lực giật (lò xo + giảm chấn): góc & vận tốc góc theo trục dọc / ngang
    this.rockPitch = 0;
    this.rockRoll = 0;
    this.rockVelP = 0;
    this.rockVelR = 0;
    this.idleVibeTimer = Math.random() * 10;

    // Mô phỏng độ nghiêng và hệ thống giảm xóc bám theo địa hình 3D (Terrain Suspension)
    this.currentPitch = 0;
    this.currentRoll = 0;
    this.engineLoad = 1.0;
    this.currentTerrainType = 'SAND';

    this.reloadTimer = 0;
    this.isDead = false;

    // Thiết lập hệ thống đạn dược chuyên biệt hóa theo từng dòng xe chiến đấu
    this.burnTimer = 0; // Thời gian thiêu đốt khi dính đạn cháy
    this.burnDamageTimer = 0;

    if (this.tankType === 'ARTILLERY') {
      this.availableAmmos = ['HE', 'CLUSTER']; // Đạn xuyên giáp mũi tên chỉ dành cho xe tăng
      this.selectedAmmo = 'HE'; // Mặc định nạp đạn nổ mạnh
      this.heAmmoCount = 4;     // Đạn nổ mạnh
      this.clusterAmmoCount = 3;// Đạn chùm nổ trên không diện rộng
      this.apAmmoCount = 2;     // Đạn xuyên phá
    } else if (this.tankType === 'GATLING') {
      this.availableAmmos = ['GATLING_BULLET', 'GATLING_HE', 'INCENDIARY'];
      this.selectedAmmo = 'GATLING_BULLET'; // Đạn nhỏ liên thanh
      this.incendiaryAmmoCount = 80;        // Đạn cháy nâng cao, số lượng hạn chế
      this.heFragAmmoCount = 0;             // Đạn nổ mảnh ngòi cận đích: không có sẵn, mua trong kho vũ khí (Equipment.startLife nạp)
    } else if (this.tankType === 'SCOUT') {
      this.availableAmmos = ['SCOUT_BULLET', 'INCENDIARY', 'ANTI_TANK_MISSILE'];
      this.selectedAmmo = 'SCOUT_BULLET';   // Đạn nhỏ 30mm cơ bản
      this.incendiaryAmmoCount = 45;        // Đạn cháy nâng cao
      this.missileAmmoCount = 3;            // Tên lửa chống tăng dẫn hướng trong ống phóng trên nóc (ô đạn 3, tối đa 3 quả)
    } else {
      this.availableAmmos = ['NORMAL', 'AP', 'HE'];
      this.selectedAmmo = 'NORMAL';
      this.apAmmoCount = 3;
      this.heAmmoCount = 3;
    }

    // Các bộ phận chuyển động
    this.roadWheels = [];
    this.radarDish = null;
    this.rcwsTurret = null;
    this.strobeLight = null;
    this.strobeTimer = 0;

    // Bộ quản lý vệt xích xe & hạt hiệu ứng 3D
    this.lastTrackPos = { x: this.x, z: this.z };
    this.exhaustTimer = 0;
    this.dustTimer = 0;
    this.damageFxTimer = 0;
    this.fxParticles = [];
    this.trackMarks = [];

    // Hiệu ứng khói nòng sau khi bắn
    this.barrelSmokeTimer = 0;

    // Đạn đặc biệt nhận từ Hòm Tiếp Tế
    this.specialAmmoCount = 0;

    // Chỉ số chiến đấu
    this.shotsFired = 0;
    this.kills = 0;
    this.deaths = 0;
    this.damageDealt = 0;

    // AI Chiến thuật nâng cao
    this.aiTimer = 1 + Math.random() * 2;
    this.aiShootAndScootDest = null;
    this.aiState = 'patrol';
    this.evadeTimer = 0;
    this.evadeTarget = null;
    this.lastAttackerPos = null;

    // Dựng mô hình 3D khí tài qua TankModelBuilder
    if (typeof TankModelBuilder !== 'undefined') {
      // ghi lại các thuộc tính do mô hình đặt lên xe (detachWreck gỡ đúng các thuộc tính này trước khi dựng mô hình mới)
      const pre = Object.assign({}, this);
      TankModelBuilder.buildModel(this);
      this._modelKeys = Object.keys(this).filter(k => this[k] !== pre[k]);
    } else {
      this.initMesh3D();
    }
    this.trimShadows();

    // Khởi tạo bộ não trí tuệ nhân tạo Bot AI
    if (!this.isPlayer && typeof BotAIController !== 'undefined') {
      this.botAI = new BotAIController(this);
    }
  }

  initMesh3D() {
    this.group = new THREE.Group();
    this.group.userData.vehicleUnit = this;

    // Màu sơn quân sự Art of War 3 theo 2 phe tác chiến:
    // - Phe Xanh: Sơn trắng bạc ngụy trang công nghệ cao, sọc xanh dương, đèn LED xanh neon
    // - Phe Đỏ: Sơn ngụy trang sa mạc sỏi đá nâu đất, sọc đỏ tươi, đèn LED đỏ rực
    const isBlue = this.team === 'BLUE';
    const armorColor = isBlue ? 0xe2e8f0 : 0x7c2d12;
    const secondaryArmor = isBlue ? 0xcbd5e1 : 0x5a2318;
    const stripeColor = isBlue ? 0x0284c7 : 0xdc2626;
    const darkMetalColor = 0x1e293b;
    const rubberColor = 0x0f172a;
    const ledColor = isBlue ? 0x00e5ff : 0xff2a2a;
    const opticColor = isBlue ? 0x38bdf8 : 0xf59e0b;

    // Bảng vật liệu tiêu chuẩn quân sự có chiều sâu kim loại và độ bóng phản quang thực tế
    const matArmor = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.65, metalness: 0.35 });
    const matSecArmor = new THREE.MeshStandardMaterial({ color: secondaryArmor, roughness: 0.72, metalness: 0.28 });
    const matStripe = new THREE.MeshStandardMaterial({ color: stripeColor, roughness: 0.55, metalness: 0.45 });
    const matDarkMetal = new THREE.MeshStandardMaterial({ color: darkMetalColor, roughness: 0.45, metalness: 0.85 });
    const matRubber = new THREE.MeshStandardMaterial({ color: rubberColor, roughness: 0.92, metalness: 0.08 });
    const matChrome = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.15, metalness: 0.95 });
    const matGlowLed = new THREE.MeshBasicMaterial({ color: ledColor });
    const matOptic = new THREE.MeshBasicMaterial({ color: opticColor });
    const matSmokeTube = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.7 });
    const matChevron = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const matSearchlight = new THREE.MeshBasicMaterial({ color: 0xfffbeb });

    // Khối thân xe chính có thể nhún giật theo địa hình gồ ghề (Chassis group)
    this.chassisGroup = new THREE.Group();
    this.chassisGroup.position.y = 8;
    this.group.add(this.chassisGroup);

    // =========================================================================
    // 1. TÙY BIẾN KÍCH THƯỚC VÀ HÌNH THỂ THÂN XE THEO TỪNG BINH CHỦNG CHIẾN THUẬT
    // =========================================================================
    let hullW = 28, hullH = 11, hullL = 48;
    let noseL = 14, noseRot = 0.28;
    let skirtW = 6.2, skirtH = 8.5, skirtL = 50;
    let wheelCountPerSide = 6;
    let wheelSpacing = 5.4;
    let trackX = 17.2;

    if (this.tankType === 'SCOUT') {
      // XE TRINH SÁT BÁNH LỐP 8X8: Thân thon dài, gầm chữ V chống mìn, lướt gió tốc độ cao
      hullW = 22; hullH = 9.8; hullL = 46;
      noseL = 15; noseRot = 0.38;
      wheelCountPerSide = 4; // 4 Bánh mỗi bên = 8 Bánh lốp độc lập 8x8
      wheelSpacing = 8.2;
      trackX = 14.8;
    } else if (this.tankType === 'GATLING') {
      // XE CHIẾN ĐẤU CHI VIỆN HỎA LỰC 6 NÒNG: Cơ bắp, bọc giáp lồng chống đạn phản lực, lưỡi ủi dọn đường
      hullW = 30; hullH = 12.0; hullL = 48;
      noseL = 14; noseRot = 0.25;
      skirtW = 7.0; skirtH = 9.5; skirtL = 50;
      wheelCountPerSide = 6;
      wheelSpacing = 5.2;
      trackX = 18.5;
    } else if (this.tankType === 'ARTILLERY') {
      // PHÁO TỰ HÀNH HẠNG NẶNG: Khung gầm siêu dài 7 cặp bánh chịu tải, sàn pháo vững chãi
      hullW = 32; hullH = 12.5; hullL = 58;
      noseL = 15; noseRot = 0.22;
      skirtW = 7.0; skirtH = 9.5; skirtL = 60;
      wheelCountPerSide = 7;
      wheelSpacing = 4.8;
      trackX = 19.5;
    }

    // 1.1. Khối thân xe chính (Hull main)
    const hullMainGeo = new THREE.BoxGeometry(hullW, hullH, hullL);
    this.hullMainMesh = new THREE.Mesh(hullMainGeo, matArmor);
    this.hullMainMesh.position.y = hullH / 2 - 1.5;
    this.hullMainMesh.castShadow = true;
    this.hullMainMesh.receiveShadow = true;
    this.chassisGroup.add(this.hullMainMesh);

    // 1.2. Mũi xe giáp nghiêng vát chống đạn sắc cạnh (Glacis plate)
    const noseGeo = new THREE.BoxGeometry(hullW - 2, hullH * 0.7, noseL);
    const noseMesh = new THREE.Mesh(noseGeo, matSecArmor);
    noseMesh.position.set(0, 1.8, -(hullL / 2 + noseL / 2 - 2));
    noseMesh.rotation.x = noseRot;
    noseMesh.castShadow = true;
    this.chassisGroup.add(noseMesh);

    // 1.3. Vát đáy mũi xe (Lower front plate) tạo góc chữ V chống mìn và vượt chướng ngại vật
    const lowerGlacisGeo = new THREE.BoxGeometry(hullW - 2.5, hullH * 0.55, 9);
    const lowerGlacis = new THREE.Mesh(lowerGlacisGeo, matDarkMetal);
    lowerGlacis.position.set(0, -2.5, -(hullL / 2 + 3.5));
    lowerGlacis.rotation.x = -0.42;
    this.chassisGroup.add(lowerGlacis);

    // 1.4. Dải sơn nhận diện quân đội tác chiến trên nóc thân xe
    const stripeTopGeo = new THREE.BoxGeometry(hullW + 0.4, 1.8, hullL * 0.72);
    const stripeTopMesh = new THREE.Mesh(stripeTopGeo, matStripe);
    stripeTopMesh.position.set(0, hullH - 2.4, -2);
    this.chassisGroup.add(stripeTopMesh);

    // 1.5. Vạch sơn nhận diện chiến thuật hình chữ V (Tactical Chevron Marks) trên mũi xe
    const chevronGeo = new THREE.BoxGeometry(hullW * 0.42, 0.6, 2.5);
    const chevronMesh = new THREE.Mesh(chevronGeo, matChevron);
    chevronMesh.position.set(0, hullH - 1.0, -(hullL / 2 - 6));
    this.chassisGroup.add(chevronMesh);

    // 1.6. CHI TIẾT ĐẶC THÙ MŨI XE THEO TỪNG LOẠI
    if (this.tankType === 'ALL_ROUNDER') {
      // Tank đa dụng: Mũi xe bọc đầy gạch giáp phản ứng nổ ERA xếp so le 2 tầng
      const eraCount = Math.floor(hullW / 4.4);
      const eraGeo = new THREE.BoxGeometry(3.6, 1.8, 4.5);
      for (let row = 0; row < 2; row++) {
        for (let i = -Math.floor(eraCount / 2); i <= Math.floor(eraCount / 2); i++) {
          const eraBlock = new THREE.Mesh(eraGeo, matDarkMetal);
          eraBlock.position.set(i * 4.0 + (row % 2 ? 2.0 : 0), 2.8 + row * 2.2, -(hullL / 2 + noseL / 2 - 2 + row * 3.2));
          eraBlock.rotation.x = noseRot;
          eraBlock.castShadow = true;
          this.chassisGroup.add(eraBlock);
        }
      }
    } else if (this.tankType === 'GATLING') {
      // Xe 6 nòng: Lưỡi ủi dọn chướng ngại vật bằng thép đúc phía trước gầm
      const dozerGeo = new THREE.BoxGeometry(hullW + 4, 7, 3);
      const dozerMesh = new THREE.Mesh(dozerGeo, matDarkMetal);
      dozerMesh.position.set(0, -0.5, -(hullL / 2 + noseL - 2));
      dozerMesh.rotation.x = -0.15;
      this.chassisGroup.add(dozerMesh);
      // Hai thanh giằng thủy lực đẩy lưỡi ủi
      for (let side of [-8, 8]) {
        const armGeo = new THREE.CylinderGeometry(1.2, 1.2, 10, 8);
        armGeo.rotateX(Math.PI / 2);
        const armMesh = new THREE.Mesh(armGeo, matChrome);
        armMesh.position.set(side, 0, -(hullL / 2 + noseL / 2));
        this.chassisGroup.add(armMesh);
      }
    } else if (this.tankType === 'ARTILLERY') {
      // Pháo cao xạ: Giá đỡ khóa nòng hành quân hình chữ A (Gun travel lock) ở mũi xe
      const lockGroup = new THREE.Group();
      lockGroup.position.set(0, hullH - 1.0, -(hullL / 2 - 4));
      const legGeo = new THREE.CylinderGeometry(0.8, 1.0, 9, 6);
      const legL = new THREE.Mesh(legGeo, matDarkMetal);
      legL.position.set(-4, 4, 0); legL.rotation.z = -0.35;
      lockGroup.add(legL);
      const legR = new THREE.Mesh(legGeo, matDarkMetal);
      legR.position.set(4, 4, 0); legR.rotation.z = 0.35;
      lockGroup.add(legR);
      const clampGeo = new THREE.CylinderGeometry(3.5, 3.5, 3.5, 12, 1, false, 0, Math.PI);
      clampGeo.rotateZ(Math.PI / 2);
      const clampMesh = new THREE.Mesh(clampGeo, matSecArmor);
      clampMesh.position.set(0, 8, 0);
      lockGroup.add(clampMesh);
      this.chassisGroup.add(lockGroup);
    }

    // 1.7. Hai đèn pha LED tác chiến siêu sáng tích hợp chóa phản xạ
    const ledGeo = new THREE.BoxGeometry(3.8, 2.4, 2);
    const ledLeft = new THREE.Mesh(ledGeo, matGlowLed);
    ledLeft.position.set(-(hullW / 2 - 3.5), 3, -(hullL / 2 + noseL - 4));
    this.chassisGroup.add(ledLeft);

    const ledRight = ledLeft.clone();
    ledRight.position.set((hullW / 2 - 3.5), 3, -(hullL / 2 + noseL - 4));
    this.chassisGroup.add(ledRight);

    // 1.8. Dây cáp kéo thép cứu hộ bện chạy dọc 2 bên hông mũi xe
    const cableGeo = new THREE.CylinderGeometry(0.55, 0.55, hullL * 0.55, 6);
    cableGeo.rotateX(Math.PI / 2);
    const cableLeft = new THREE.Mesh(cableGeo, matDarkMetal);
    cableLeft.position.set(-(hullW / 2 + 0.3), hullH - 3.5, 0);
    this.chassisGroup.add(cableLeft);

    const cableRight = cableLeft.clone();
    cableRight.position.set((hullW / 2 + 0.3), hullH - 3.5, 0);
    this.chassisGroup.add(cableRight);

    // 1.9. Đèn hậu cảnh báo màu đỏ ở đuôi xe & lưới tản nhiệt động cơ tuốc-bin
    const tailLedMat = new THREE.MeshBasicMaterial({ color: 0xff1100 });
    const tailLedLeft = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.2), tailLedMat);
    tailLedLeft.position.set(-(hullW / 2 - 3), 4, hullL / 2 + 0.5);
    this.chassisGroup.add(tailLedLeft);

    const tailLedRight = tailLedLeft.clone();
    tailLedRight.position.set(hullW / 2 - 3, 4, hullL / 2 + 0.5);
    this.chassisGroup.add(tailLedRight);

    const grillMesh = new THREE.Mesh(new THREE.BoxGeometry(hullW * 0.65, 5, 2), matDarkMetal);
    grillMesh.position.set(0, 6, hullL / 2 + 0.5);
    this.chassisGroup.add(grillMesh);

    // 1.10. Hai thùng nhiên liệu phụ bọc thép gắn sau đuôi xe
    const fuelDrumGeo = new THREE.CylinderGeometry(3.0, 3.0, 8.5, 12);
    fuelDrumGeo.rotateZ(Math.PI / 2);
    const fuelDrumLeft = new THREE.Mesh(fuelDrumGeo, matStripe);
    fuelDrumLeft.position.set(-(hullW * 0.28), 7, hullL / 2 + 3.5);
    this.chassisGroup.add(fuelDrumLeft);

    const fuelDrumRight = fuelDrumLeft.clone();
    fuelDrumRight.position.set(hullW * 0.28, 7, hullL / 2 + 3.5);
    this.chassisGroup.add(fuelDrumRight);

    // Ống xả kép vát chéo
    const exhaustGeo = new THREE.CylinderGeometry(1.5, 2.0, 6.5, 8);
    exhaustGeo.rotateX(Math.PI / 3.8);
    this.exhaustLeft = new THREE.Mesh(exhaustGeo, matDarkMetal);
    this.exhaustLeft.position.set(-(hullW / 2 - 3.5), hullH - 1, hullL / 2 - 2);
    this.chassisGroup.add(this.exhaustLeft);

    this.exhaustRight = this.exhaustLeft.clone();
    this.exhaustRight.position.set(hullW / 2 - 3.5, hullH - 1, hullL / 2 - 2);
    this.chassisGroup.add(this.exhaustRight);

    // 1.11. LỒNG THÉP CHỐNG ĐẠN PHẢN LỰC (SLAT ARMOR) BAO BỌC CHO XE 6 NÒNG
    if (this.tankType === 'GATLING') {
      const cageGroup = new THREE.Group();
      const cageBarGeo = new THREE.CylinderGeometry(0.35, 0.35, 8.5, 6);
      // Song sắt hai bên sườn
      for (let side of [-(hullW / 2 + 6.2), hullW / 2 + 6.2]) {
        for (let z = -hullL / 2 + 10; z <= hullL / 2 + 2; z += 4.5) {
          const bar = new THREE.Mesh(cageBarGeo, matDarkMetal);
          bar.position.set(side, 5, z);
          cageGroup.add(bar);
        }
        const horizBar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, hullL * 0.75, 6), matDarkMetal);
        horizBar.rotateX(Math.PI / 2);
        horizBar.position.set(side, 8, 0);
        cageGroup.add(horizBar);
      }
      // Song sắt bảo vệ đuôi xe
      for (let x = -hullW / 2 + 2; x <= hullW / 2 - 2; x += 4.2) {
        const barB = new THREE.Mesh(cageBarGeo, matDarkMetal);
        barB.position.set(x, 5, hullL / 2 + 6.5);
        cageGroup.add(barB);
      }
      this.chassisGroup.add(cageGroup);
    }

    // 1.12. CHÂN CHỐNG THỦY LỰC CHO PHÁO CAO XẠ
    if (this.tankType === 'ARTILLERY') {
      this.artySpadeGroup = new THREE.Group();
      this.artySpadeGroup.position.set(0, 0, hullL / 2);

      const artySpadeGeo = new THREE.BoxGeometry(hullW + 2, 8, 6);
      const artySpade = new THREE.Mesh(artySpadeGeo, matDarkMetal);
      artySpade.position.set(0, -1, 3);
      this.artySpadeGroup.add(artySpade);

      // 2 Pít-tông thủy lực mạ crom cắm xuống đất
      const spadePistonGeo = new THREE.CylinderGeometry(1.4, 1.4, 10, 8);
      spadePistonGeo.rotateX(Math.PI / 4);
      const spPistonLeft = new THREE.Mesh(spadePistonGeo, matChrome);
      spPistonLeft.position.set(-9, 3, 1.5);
      this.artySpadeGroup.add(spPistonLeft);

      const spPistonRight = spPistonLeft.clone();
      spPistonRight.position.set(9, 3, 1.5);
      this.artySpadeGroup.add(spPistonRight);

      this.chassisGroup.add(this.artySpadeGroup);

      // 2 Càng thủy lực mở rộng sườn xe
      const outriggerGeo = new THREE.CylinderGeometry(1.2, 1.4, 14, 8);
      outriggerGeo.rotateZ(Math.PI / 2);
      const padGeo = new THREE.BoxGeometry(6, 2, 7);

      this.outriggerLeft = new THREE.Group();
      this.outriggerLeft.position.set(-(hullW / 2 + 1), 2, hullL / 2 - 6);
      const legL = new THREE.Mesh(outriggerGeo, matDarkMetal);
      legL.position.x = -7;
      this.outriggerLeft.add(legL);
      const padL = new THREE.Mesh(padGeo, matSecArmor);
      padL.position.set(-14, -1, 0);
      this.outriggerLeft.add(padL);
      this.chassisGroup.add(this.outriggerLeft);

      this.outriggerRight = new THREE.Group();
      this.outriggerRight.position.set(hullW / 2 + 1, 2, hullL / 2 - 6);
      const legR = new THREE.Mesh(outriggerGeo, matDarkMetal);
      legR.position.x = 7;
      this.outriggerRight.add(legR);
      const padR = new THREE.Mesh(padGeo, matSecArmor);
      padR.position.set(14, -1, 0);
      this.outriggerRight.add(padR);
      this.chassisGroup.add(this.outriggerRight);
    } else {
      const spadeGeo = new THREE.BoxGeometry(hullW - 2, 5.5, 4.0);
      const spadeMesh = new THREE.Mesh(spadeGeo, matDarkMetal);
      spadeMesh.position.set(0, 0, hullL / 2 + 1.5);
      this.chassisGroup.add(spadeMesh);
    }

    // =========================================================================
    // 2. HỆ THỐNG DI CHUYỂN: PHÂN HÓA BÁNH LỐP 8X8 (SCOUT) VÀ BÁNH XÍCH (TANK/PHÁO)
    // =========================================================================
    this.roadWheels = [];

    if (this.tankType === 'SCOUT') {
      // ----------------------------------------------------
      // A. HỆ THỐNG 8 BÁNH LỐP ĐỘC LẬP 8X8 CHO XE TRINH SÁT (EBRC JAGUAR / BOXER)
      // ----------------------------------------------------
      const tireRadius = 5.2; // Lốp cao su đường kính 10.4 mét hầm hố
      const tireWidth = 4.2;
      const tireGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 18);
      tireGeo.rotateZ(Math.PI / 2);

      // Gai lốp địa hình quân sự dập nổi
      const treadRibGeo = new THREE.TorusGeometry(tireRadius, 0.45, 6, 18);
      treadRibGeo.rotateY(Math.PI / 2);

      // Đĩa vành thép đúc có đinh tán bu-lông
      const rimGeo = new THREE.CylinderGeometry(3.0, 3.0, tireWidth + 0.4, 12);
      rimGeo.rotateZ(Math.PI / 2);
      const hubcapGeo = new THREE.CylinderGeometry(1.6, 1.6, tireWidth + 0.8, 8);
      hubcapGeo.rotateZ(Math.PI / 2);

      for (let side of [-trackX, trackX]) {
        for (let i = 0; i < wheelCountPerSide; i++) {
          const zPos = (i - (wheelCountPerSide - 1) / 2) * wheelSpacing;
          
          // Càng giảm xóc treo độc lập tay đòn kép cố định vào thân xe
          const suspArm = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 2.0), matDarkMetal);
          suspArm.position.set(side > 0 ? side - 2.2 : side + 2.2, 0.7, zPos);
          this.chassisGroup.add(suspArm);

          // Cụm bánh xe có khả năng bẻ lái góc Y (2 trục trước) và xoay tròn quanh trục X
          const wheelGroup = new THREE.Group();
          wheelGroup.position.set(side, -0.8, zPos);

          const roller = new THREE.Group();
          wheelGroup.add(roller);

          const tireMesh = new THREE.Mesh(tireGeo, matRubber);
          tireMesh.castShadow = true;
          roller.add(tireMesh);

          const ribMesh = new THREE.Mesh(treadRibGeo, matDarkMetal);
          roller.add(ribMesh);

          const rimMesh = new THREE.Mesh(rimGeo, matSecArmor);
          roller.add(rimMesh);

          const hubMesh = new THREE.Mesh(hubcapGeo, matChrome);
          roller.add(hubMesh);

          // 2 trục trước (i = 2, 3) có thể bẻ góc lái chân thực theo góc bẻ cua
          const steerFactor = (i === 3 ? 1.0 : (i === 2 ? 0.55 : 0));
          wheelGroup.userData = { roller: roller, steerFactor: steerFactor };

          this.chassisGroup.add(wheelGroup);
          this.roadWheels.push(wheelGroup);
        }
      }
    } else {
      // ----------------------------------------------------
      // B. HỆ THỐNG BÁNH XÍCH & VÈ BỌC GIÁP (CHASSIS SKIRTS & ROAD WHEELS)
      // ----------------------------------------------------
      const sideSkirtGeo = new THREE.BoxGeometry(skirtW, skirtH, skirtL);
      const skirtLeft = new THREE.Mesh(sideSkirtGeo, matSecArmor);
      skirtLeft.position.set(-trackX, 4, 0);
      this.chassisGroup.add(skirtLeft);

      const skirtRight = skirtLeft.clone();
      skirtRight.position.set(trackX, 4, 0);
      this.chassisGroup.add(skirtRight);

      // Dải xích thép hợp kim chịu lực
      const treadGeo = new THREE.BoxGeometry(skirtW + 0.6, 9.5, skirtL + 2);
      const treadLeft = new THREE.Mesh(treadGeo, matRubber);
      treadLeft.position.set(-trackX, 0, 0);
      treadLeft.castShadow = true;
      this.chassisGroup.add(treadLeft);

      const treadRight = treadLeft.clone();
      treadRight.position.set(trackX, 0, 0);
      this.chassisGroup.add(treadRight);

      // Bánh chịu tải kép có viền cao su đen
      const wheelRadius = (this.tankType === 'ARTILLERY') ? 4.2 : 4.4;
      const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, skirtW + 0.6, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const tireBandGeo = new THREE.TorusGeometry(wheelRadius, 0.45, 6, 18);
      tireBandGeo.rotateY(Math.PI / 2);
      const hubcapGeo = new THREE.CylinderGeometry(1.8, 1.8, skirtW + 1.2, 8);
      hubcapGeo.rotateZ(Math.PI / 2);

      const halfWheels = Math.floor(wheelCountPerSide / 2);
      for (let side of [-trackX, trackX]) {
        for (let i = -halfWheels; i <= halfWheels; i++) {
          const wheelGroup = new THREE.Group();
          wheelGroup.position.set(side, -0.6, i * wheelSpacing);

          const wheel = new THREE.Mesh(wheelGeo, matSecArmor);
          const tireBand = new THREE.Mesh(tireBandGeo, matRubber);
          const hubcap = new THREE.Mesh(hubcapGeo, matChrome);
          wheelGroup.add(wheel);
          wheelGroup.add(tireBand);
          wheelGroup.add(hubcap);

          wheelGroup.userData = { roller: wheelGroup, steerFactor: 0 };

          this.chassisGroup.add(wheelGroup);
          this.roadWheels.push(wheelGroup);
        }
      }
    }

    // =========================================================================
    // 3. THÁP PHÁO CHIẾN THUẬT ĐA DẠNG HÓA CHUYÊN BIỆT (SPECIALIZED TURRETS)
    // =========================================================================
    this.turretGroup = new THREE.Group();
    const turretPosZ = (this.tankType === 'ARTILLERY') ? 6 : ((this.tankType === 'SCOUT') ? -1 : -2);
    this.turretGroup.position.set(0, hullH - 1.5, turretPosZ);
    this.chassisGroup.add(this.turretGroup);

    let turretW = 24, turretH = 11, turretL = 28;

    if (this.tankType === 'SCOUT') {
      // ----------------------------------------------------
      // THÁP PHÁO XE TRINH SÁT: KHÔNG NGƯỜI LÁI, VÁT GÓC TÀNG HÌNH, CỘT BUỒM TRINH SÁT
      // ----------------------------------------------------
      turretW = 16; turretH = 7.8; turretL = 20;
      const scoutTurretMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW, turretH, turretL), matArmor);
      scoutTurretMesh.position.y = turretH / 2;
      scoutTurretMesh.castShadow = true;
      this.turretGroup.add(scoutTurretMesh);

      // Chảo radar trinh sát vòm cầu xoay 360 độ (Radome)
      this.radarDish = new THREE.Group();
      this.radarDish.position.set(0, turretH + 2.5, 0);
      const radomeBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.2, 2.2, 12), matDarkMetal);
      this.radarDish.add(radomeBase);

      const radomeDome = new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), matStripe);
      radomeDome.position.y = 1.1;
      this.radarDish.add(radomeDome);

      const radomeRing = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.4, 6, 20), matGlowLed);
      radomeRing.rotateX(Math.PI / 2);
      radomeRing.position.y = 1.1;
      this.radarDish.add(radomeRing);
      this.turretGroup.add(this.radarDish);

      // Cột buồm trinh sát quang điện tử ảnh nhiệt (Telescopic Sensor Mast)
      const mastGroup = new THREE.Group();
      mastGroup.position.set(-5.5, turretH + 1.2, 4);
      const mastPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 14, 8), matDarkMetal);
      mastPillar.position.y = 7;
      mastGroup.add(mastPillar);
      const sensorHead = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), matSecArmor);
      sensorHead.position.y = 14;
      const opticLens = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), matOptic);
      opticLens.position.set(0, 14, -2.25);
      mastGroup.add(sensorHead);
      mastGroup.add(opticLens);
      this.turretGroup.add(mastGroup);

      this.addSmokeDischargers(this.turretGroup, 3, turretW / 2 + 0.8, turretH - 2, 0, matSmokeTube);

    } else if (this.tankType === 'GATLING') {
      // ----------------------------------------------------
      // THÁP PHÁO 6 NÒNG: BỆ SÚNG KÉP CƠ BẮP, 2 THÙNG ĐẠN KHỔNG LỒ, BĂNG CHUYỀN KIM LOẠI
      // ----------------------------------------------------
      turretW = 26; turretH = 12.0; turretL = 28;
      const gatTurretMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW, turretH, turretL), matArmor);
      gatTurretMesh.position.y = turretH / 2;
      gatTurretMesh.castShadow = true;
      this.turretGroup.add(gatTurretMesh);

      // Tấm giáp góc cạnh gia cường 2 bên má
      const cheekMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW + 2, 7, 18), matSecArmor);
      cheekMesh.position.set(0, turretH * 0.6, 1);
      this.turretGroup.add(cheekMesh);

      // Hai hòm tiếp đạn đại liên bọc thép khổng lồ 2 bên sườn tháp pháo
      for (let side of [-(turretW / 2 + 3.5), turretW / 2 + 3.5]) {
        const binMesh = new THREE.Mesh(new THREE.BoxGeometry(6.5, 9.5, 16), matDarkMetal);
        binMesh.position.set(side, 6.5, 2);
        this.turretGroup.add(binMesh);

        // Băng chuyền kim loại uốn cong nối vào súng
        const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 14), matChrome);
        beltMesh.position.set(side > 0 ? side - 2.8 : side + 2.8, 5.5, -3);
        beltMesh.rotation.y = side > 0 ? -0.22 : 0.22;
        this.turretGroup.add(beltMesh);
      }

      // Hai đèn rọi chiến thuật siêu sáng cạnh nòng
      const lightGeo = new THREE.CylinderGeometry(2.2, 2.6, 4.5, 12);
      lightGeo.rotateX(Math.PI / 2);
      const lightMeshL = new THREE.Mesh(lightGeo, matDarkMetal);
      lightMeshL.position.set(-10, 8.5, -11);
      const glowL = new THREE.Mesh(new THREE.CircleGeometry(2.1, 12), matSearchlight);
      glowL.position.set(0, 0, -2.3);
      lightMeshL.add(glowL);
      this.turretGroup.add(lightMeshL);

      const lightMeshR = lightMeshL.clone();
      lightMeshR.position.set(10, 8.5, -11);
      this.turretGroup.add(lightMeshR);

      this.addSmokeDischargers(this.turretGroup, 4, turretW / 2 + 1.2, turretH - 2, 2, matSmokeTube);

    } else if (this.tankType === 'ARTILLERY') {
      // ----------------------------------------------------
      // THÁP PHÁO PHÁO CAO XẠ / TỰ HÀNH: CABIN HỘP KHỔNG LỒ CHỨA AUTOLOADER, CỘT KHÍ TƯỢNG
      // ----------------------------------------------------
      turretW = 28; turretH = 13.0; turretL = 36;
      const artyTurretMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW, turretH, turretL), matArmor);
      artyTurretMesh.position.y = turretH / 2;
      artyTurretMesh.castShadow = true;
      this.turretGroup.add(artyTurretMesh);

      // Cột khí tượng đo gió và sơ tốc đầu nòng
      const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 18, 6), matDarkMetal);
      mastMesh.position.set(-9, turretH + 9, 8);
      this.turretGroup.add(mastMesh);

      const vaneMesh = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 0.6), matStripe);
      vaneMesh.position.set(-9, turretH + 18, 8);
      this.turretGroup.add(vaneMesh);

      // Radar đo sơ tốc đầu nòng (MVR) gắn sát gốc nòng pháo
      const mvrMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.5, 4.2), matDarkMetal);
      mvrMesh.position.set(8, turretH + 1.5, -12);
      this.turretGroup.add(mvrMesh);

      // Hòm chứa đạn đại bác bọc giáp khổng lồ phía sau đuôi tháp
      const bigBustle = new THREE.Mesh(new THREE.BoxGeometry(turretW - 2, 10, 12), matDarkMetal);
      bigBustle.position.set(0, 6, turretL / 2 + 6);
      this.turretGroup.add(bigBustle);

      // Cửa mở nạp đạn đại bác thủy lực và thoát vỏ đạn
      const hatchMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 1), matSecArmor);
      hatchMesh.position.set(0, 6, turretL / 2 + 12.2);
      this.turretGroup.add(hatchMesh);

      this.addSmokeDischargers(this.turretGroup, 4, turretW / 2 + 1.0, turretH - 2, 0, matSmokeTube);

    } else {
      // ----------------------------------------------------
      // THÁP PHÁO TANK ĐA DỤNG (ALL_ROUNDER): GIÁP NÊM VÁT DỐC LEOPARD 2A7 & KÍNH NHIỆT CITV
      // ----------------------------------------------------
      turretW = 24; turretH = 11.0; turretL = 29;
      const allTurretMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW, turretH, turretL), matArmor);
      allTurretMesh.position.y = turretH / 2;
      allTurretMesh.castShadow = true;
      this.turretGroup.add(allTurretMesh);

      // Giáp nêm góc nhọn vát dốc khí động học (Wedge Turret Armor) phía trước
      const wedgeMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW + 1.6, 8, 16), matSecArmor);
      wedgeMesh.position.set(0, 6.5, -3);
      this.turretGroup.add(wedgeMesh);

      // Kính ngắm nhiệt độc lập toàn cảnh trưởng xe (CITV)
      const citvGroup = new THREE.Group();
      citvGroup.position.set(-6, turretH + 2.5, 2);
      const citvBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.0, 3, 10), matDarkMetal);
      citvGroup.add(citvBase);
      const citvHead = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), matSecArmor);
      citvHead.position.y = 2.5;
      const citvLens = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.8), matOptic);
      citvLens.position.set(0, 2.5, -2.62);
      citvGroup.add(citvHead);
      citvGroup.add(citvLens);
      this.turretGroup.add(citvGroup);

      // Hòm chứa dụng cụ và lưới ngụy trang phía sau tháp
      const bustleMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 9), matDarkMetal);
      bustleMesh.position.set(0, 5.5, 17.5);
      this.turretGroup.add(bustleMesh);

      // Giáp phản ứng nổ ERA sườn tháp
      for (let side of [-(turretW / 2 + 0.6), turretW / 2 + 0.6]) {
        for (let z = -6; z <= 6; z += 4) {
          const eraCheek = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 3.2), matDarkMetal);
          eraCheek.position.set(side, 6.5, z);
          this.turretGroup.add(eraCheek);
        }
      }

      this.addSmokeDischargers(this.turretGroup, 4, turretW / 2 + 1.2, turretH - 2, 2, matSmokeTube);
    }

    // Vòm chỉ huy tròn (Cupola) & Trạm vũ khí điều khiển từ xa RCWS 12.7mm trên nóc
    const cupolaMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.8, 3.5, 12), matStripe);
    cupolaMesh.position.set(4.5, turretH + 1.8, 1);
    this.turretGroup.add(cupolaMesh);

    const periscopeMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1.4, 12), matOptic);
    periscopeMesh.position.set(4.5, turretH + 3.8, 1);
    this.turretGroup.add(periscopeMesh);

    this.rcwsTurret = new THREE.Group();
    this.rcwsTurret.position.set(4.5, turretH + 4.8, 1);
    const rcwsBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 3), matDarkMetal);
    const rcwsGun = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 6), matDarkMetal);
    rcwsGun.rotateX(Math.PI / 2);
    rcwsGun.position.set(0, 0.4, 4);
    this.rcwsTurret.add(rcwsBase);
    this.rcwsTurret.add(rcwsGun);
    this.turretGroup.add(this.rcwsTurret);

    // Cần ăng-ten liên lạc dài uốn đàn hồi
    const antennaGeo = new THREE.CylinderGeometry(0.25, 0.45, 24, 6);
    const ant1 = new THREE.Mesh(antennaGeo, matDarkMetal);
    ant1.position.set(-7.5, turretH + 12, turretL / 2 - 2);
    ant1.rotation.z = -0.12;
    this.turretGroup.add(ant1);

    const ant2 = new THREE.Mesh(antennaGeo, matDarkMetal);
    ant2.position.set(7.5, turretH + 12, turretL / 2 - 2);
    ant2.rotation.z = 0.12;
    this.turretGroup.add(ant2);

    const strobeGeo = new THREE.SphereGeometry(0.8, 6, 6);
    this.strobeLight = new THREE.Mesh(strobeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.strobeLight.position.set(-8.8, turretH + 24, turretL / 2 - 2);
    this.turretGroup.add(this.strobeLight);

    // =========================================================================
    // 4. KHỐI NÒNG PHÁO 3D & PISTON THỦY LỰC NÂNG HẠ CHUYÊN BIỆT
    // =========================================================================
    this.barrelPivot = new THREE.Group();
    this.barrelPivot.position.set(0, turretH * 0.52, -(turretL / 2));
    this.turretGroup.add(this.barrelPivot);

    const mantletW = (this.tankType === 'SCOUT') ? 10 : ((this.tankType === 'ARTILLERY') ? 16 : 13);
    const mantletMesh = new THREE.Mesh(new THREE.BoxGeometry(mantletW, 9.0, 7.5), matStripe);
    mantletMesh.position.set(0, 0, -3.5);
    this.barrelPivot.add(mantletMesh);

    const pistonGeo = new THREE.CylinderGeometry(1.2, 1.2, 10, 8);
    pistonGeo.rotateX(Math.PI / 2);
    const pistonLeft = new THREE.Mesh(pistonGeo, matChrome);
    pistonLeft.position.set(-(mantletW / 2 - 1.2), -2.0, -5.5);
    this.barrelPivot.add(pistonLeft);

    const pistonRight = pistonLeft.clone();
    pistonRight.position.set((mantletW / 2 - 1.2), -2.0, -5.5);
    this.barrelPivot.add(pistonRight);

    this.barrelGroup = new THREE.Group();
    this.barrelPivot.add(this.barrelGroup);

    // CỤM NÒNG VŨ KHÍ TÙY BIẾN CHO TỪNG LOẠI XE TĂNG
    if (this.tankType === 'GATLING') {
      // ----------------------------------------
      // A. CỤM 6 NÒNG XOAY CẬN CHIẾN (GATLING ROTARY CANNON)
      // ----------------------------------------
      this.gatlingCluster = new THREE.Group();
      this.barrelGroup.add(this.gatlingCluster);

      const gatlingLength = 36;
      const barrelRadius = 0.95;
      const clusterRadius = 3.6;

      this.gatlingHeatMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.45,
        metalness: 0.85,
        emissive: 0x000000,
        emissiveIntensity: 0
      });

      // 6 nòng súng máy xếp vòng tròn đối xứng
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const bGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, gatlingLength, 8);
        bGeo.rotateX(Math.PI / 2);
        const bMesh = new THREE.Mesh(bGeo, this.gatlingHeatMat);
        bMesh.position.set(Math.cos(ang) * clusterRadius, Math.sin(ang) * clusterRadius, -(gatlingLength / 2 + 5));
        bMesh.castShadow = true;
        this.gatlingCluster.add(bMesh);

        const tipGeo = new THREE.CylinderGeometry(barrelRadius + 0.4, barrelRadius, 3.2, 8);
        tipGeo.rotateX(Math.PI / 2);
        const tipMesh = new THREE.Mesh(tipGeo, this.gatlingHeatMat);
        tipMesh.position.set(Math.cos(ang) * clusterRadius, Math.sin(ang) * clusterRadius, -(gatlingLength + 5.5));
        this.gatlingCluster.add(tipMesh);
      }

      // 3 Vòng đai thép kẹp nòng
      for (let rz of [-14, -25, -(gatlingLength + 3.5)]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(clusterRadius, 0.9, 8, 20), matSecArmor);
        ring.position.set(0, 0, rz);
        this.gatlingCluster.add(ring);
      }

      // Lồng chụp bảo vệ xẻ rãnh làm mát cho cụm nòng
      const shroudGeo = new THREE.CylinderGeometry(clusterRadius + 1.8, clusterRadius + 1.8, 16, 12, 1, true);
      shroudGeo.rotateX(Math.PI / 2);
      const shroudMesh = new THREE.Mesh(shroudGeo, matDarkMetal);
      shroudMesh.position.set(0, 0, -14);
      this.barrelGroup.add(shroudMesh);

      // Trục xoay trung tâm
      const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, gatlingLength, 8), matDarkMetal);
      coreMesh.rotateX(Math.PI / 2);
      coreMesh.position.set(0, 0, -(gatlingLength / 2 + 5));
      this.gatlingCluster.add(coreMesh);

      this.muzzleTipLocal = new THREE.Vector3(0, 0, -(gatlingLength + 9));

    } else if (this.tankType === 'ARTILLERY') {
      // ----------------------------------------
      // B. PHÁO TỰ HÀNH HẠNG NẶNG (NÒNG SIÊU DÀI 68M - BẦU HÚT KHÓI KÉP - LOA HÃM LÙI 2 TẦNG)
      // ----------------------------------------
      const barrelLength = 68;
      const barrelGeo = new THREE.CylinderGeometry(2.6, 4.0, barrelLength, 16);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, matDarkMetal);
      barrelMesh.position.set(0, 0, -(barrelLength / 2 + 6));
      barrelMesh.castShadow = true;
      this.barrelGroup.add(barrelMesh);

      // Bầu hút khói kép lớn (Bore Evacuator)
      const evacMesh1 = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 16, 14), matSecArmor);
      evacMesh1.rotateX(Math.PI / 2);
      evacMesh1.position.set(0, 0, -30);
      this.barrelGroup.add(evacMesh1);

      // Loa che lửa hãm lùi 2 tầng xẻ rãnh mang cá hầm hố (Double-Baffle Muzzle Brake)
      const brakeGeo = new THREE.BoxGeometry(11.2, 8.2, 14);
      const brakeMesh = new THREE.Mesh(brakeGeo, matStripe);
      brakeMesh.position.set(0, 0, -(barrelLength + 8));
      this.barrelGroup.add(brakeMesh);

      // Các đai thép gia cố chịu áp lực cao trên nòng pháo
      for (let bz of [-16, -44, -58]) {
        const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 2.0, 12), matDarkMetal);
        ringMesh.rotateX(Math.PI / 2);
        ringMesh.position.set(0, 0, bz);
        this.barrelGroup.add(ringMesh);
      }

      this.muzzleTipLocal = new THREE.Vector3(0, 0, -(barrelLength + 15));

    } else if (this.tankType === 'SCOUT') {
      // ----------------------------------------
      // C. XE TRINH SÁT: PHÁO BẮN NHANH 30MM + BỆ PHÓNG ĐẠN CHỐNG TĂNG CÓ CÁNH
      // ----------------------------------------
      const barrelLength = 28;
      const barrelGeo = new THREE.CylinderGeometry(1.0, 1.4, barrelLength, 10);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, matDarkMetal);
      barrelMesh.position.set(-2.5, 0, -(barrelLength / 2 + 5));
      barrelMesh.castShadow = true;
      this.barrelGroup.add(barrelMesh);

      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 3.8, 8), matStripe);
      muzzleBrake.rotateX(Math.PI / 2);
      muzzleBrake.position.set(-2.5, 0, -(barrelLength + 5.5));
      this.barrelGroup.add(muzzleBrake);

      // Cụm bệ phóng tên lửa chống tăng điều khiển bên sườn phải
      this.antiTankLauncherMesh = new THREE.Group();
      this.antiTankLauncherMesh.position.set(5.8, 2.0, -4);

      const launcherBox = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.2, 16), matSecArmor);
      this.antiTankLauncherMesh.add(launcherBox);

      // 2 Đầu đạn chống tăng nhô ra trước ống phóng
      const matMissileTip = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.3, metalness: 0.8 });
      const tip1 = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.6, 8), matMissileTip);
      tip1.rotateX(Math.PI / 2);
      tip1.position.set(-1.2, 0, -9.2);
      this.antiTankLauncherMesh.add(tip1);

      const tip2 = tip1.clone();
      tip2.position.set(1.2, 0, -9.2);
      this.antiTankLauncherMesh.add(tip2);

      this.barrelGroup.add(this.antiTankLauncherMesh);
      this.muzzleTipLocal = new THREE.Vector3(-2.5, 0, -(barrelLength + 8));

    } else {
      // ----------------------------------------
      // D. TANK ĐA DỤNG: NÒNG PHÁO 125MM CÓ VỎ BỌC CÁCH NHIỆT VÀ BỘ HÚT KHÓI
      // ----------------------------------------
      const barrelLength = 44;
      const barrelGeo = new THREE.CylinderGeometry(2.0, 3.0, barrelLength, 14);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, matDarkMetal);
      barrelMesh.position.set(0, 0, -(barrelLength / 2 + 6));
      barrelMesh.castShadow = true;
      this.barrelGroup.add(barrelMesh);

      // Ốp bọc cách nhiệt từng đoạn chống cong vênh nòng (Thermal Sleeve)
      for (let sz of [-14, -32]) {
        const sleeveMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 12), matSecArmor);
        sleeveMesh.rotateX(Math.PI / 2);
        sleeveMesh.position.set(0, 0, sz);
        this.barrelGroup.add(sleeveMesh);
      }

      // Bộ hút khói pháo (Bore Evacuator)
      const evacuatorMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 12, 12), matSecArmor);
      evacuatorMesh.rotateX(Math.PI / 2);
      evacuatorMesh.position.set(0, 0, -22);
      this.barrelGroup.add(evacuatorMesh);

      // Loa che lửa đầu nòng
      const brakeMesh = new THREE.Mesh(new THREE.BoxGeometry(7.5, 5.5, 8.5), matStripe);
      brakeMesh.position.set(0, 0, -(barrelLength + 7));
      this.barrelGroup.add(brakeMesh);

      this.muzzleTipLocal = new THREE.Vector3(0, 0, -(barrelLength + 12));
    }

    // =========================================================================
    // 5. THANH MÁU 3D TRÊN ĐẦU XE (BILLBOARD GROUP CỐ ĐỊNH HƯỚNG CAMERA)
    // =========================================================================
    this.hpGroup = new THREE.Group();
    this.hpGroup.position.set(0, 36, 0);

    const hpBgGeo = new THREE.PlaneGeometry(32, 3.8);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0a0e14, side: THREE.DoubleSide });
    this.hpBgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    this.hpBgMesh.position.set(0, 0, 0);
    this.hpGroup.add(this.hpBgMesh);

    const hpFgGeo = new THREE.PlaneGeometry(30, 2.8);
    const hpFgMat = new THREE.MeshBasicMaterial({
      color: isBlue ? 0x00e5ff : 0xff3b30,
      side: THREE.DoubleSide
    });
    this.hpBarMesh = new THREE.Mesh(hpFgGeo, hpFgMat);
    this.hpBarMesh.position.set(0, 0, 0.2);
    this.hpGroup.add(this.hpBarMesh);

    this.group.add(this.hpGroup);

    // 6. KHỐI GIÁP PHẢN ỨNG NỔ 3D
    const shieldGeo = new THREE.CylinderGeometry(hullW * 0.9, hullW * 1.05, 12, 12, 1, true);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.reactiveArmorMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.reactiveArmorMesh.position.set(0, 11, 0);
    this.reactiveArmorMesh.visible = false;
    this.group.add(this.reactiveArmorMesh);

    // Thu thập danh sách tất cả các vật liệu của xe để tạo hiệu ứng mờ bán trong suốt khi núp bụi
    this.stealthMaterials = [];
    this.stealthAlpha = 1.0;
    this.targetStealthAlpha = 1.0;

    this.group.traverse((child) => {
      if (child.isMesh && child !== this.reactiveArmorMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (mat && !this.stealthMaterials.includes(mat)) {
            mat.userData = mat.userData || {};
            mat.userData.origOpacity = (mat.opacity !== undefined) ? mat.opacity : 1.0;
            mat.userData.origTransparent = !!mat.transparent;
            this.stealthMaterials.push(mat);
          }
        });
      }
    });

    this.scene.add(this.group);
  }

  // Phương thức phụ trợ: Tạo cụm ống phóng lựu đạn khói ngụy trang chiến thuật
  addSmokeDischargers(parentGroup, tubeCount, posX, posY, posZ, mat) {
    const tubeGeo = new THREE.CylinderGeometry(0.5, 0.65, 3.2, 6);
    tubeGeo.rotateX(Math.PI / 3);

    for (let side of [-posX, posX]) {
      const cluster = new THREE.Group();
      cluster.position.set(side, posY, posZ);

      for (let i = 0; i < tubeCount; i++) {
        const tube = new THREE.Mesh(tubeGeo, mat);
        tube.position.set((side > 0 ? 1 : -1) * (i * 0.7), i * 0.5, i * 1.1);
        tube.rotation.y = (side > 0 ? -1 : 1) * 0.35;
        cluster.add(tube);
      }
      parentGroup.add(cluster);
    }
  }

  // Cập nhật hiệu ứng mờ bán trong suốt khi chui vào bụi cây ngụy trang
  updateStealthVisual(dt) {
    if (this.isDead) {
      if (this.stealthAlpha < 1.0) {
        this.stealthAlpha = 1.0;
        this.applyStealthAlpha(1.0);
      }
      return;
    }

    // Nếu xe đang chui vào bụi cây và chưa bị lộ vị trí do nổ súng
    // (chỉ khi bụi thật sự che được loại xe này: trinh sát mờ hẳn, xe tăng / 6 nòng mờ nhẹ, xe pháo không mờ)
    const cover = typeof TeamIntel !== 'undefined' && TeamIntel.bushCover ? TeamIntel.bushCover(this)
      : (this.isInBush && (this.revealTimer || 0) <= 0 ? { spot: 1 } : null);
    const isStealthing = !!cover;
    this.targetStealthAlpha = cover ? (cover.spot ? 0.38 : 0.72) : 1.0;

    // Chuyển đổi độ mờ mượt mà: vào bụi thì mờ êm, khi nổ súng hoặc ra khỏi bụi thì hiện rõ ngay lập tức
    const fadeSpeed = isStealthing ? 4.5 : 8.0;
    if (Math.abs(this.stealthAlpha - this.targetStealthAlpha) > 0.005) {
      this.stealthAlpha += (this.targetStealthAlpha - this.stealthAlpha) * Math.min(1.0, dt * fadeSpeed);
      this.applyStealthAlpha(this.stealthAlpha);
    } else if (this.stealthAlpha !== this.targetStealthAlpha) {
      this.stealthAlpha = this.targetStealthAlpha;
      this.applyStealthAlpha(this.stealthAlpha);
    }
  }

  applyStealthAlpha(alpha) {
    const isTranslucent = alpha < 0.98;
    for (let i = 0; i < this.stealthMaterials.length; i++) {
      const mat = this.stealthMaterials[i];
      mat.transparent = isTranslucent || mat.userData.origTransparent;
      mat.opacity = (mat.userData.origOpacity !== undefined ? mat.userData.origOpacity : 1.0) * alpha;
      mat.depthWrite = !isTranslucent || alpha > 0.65;
    }
  }

  // Kích hoạt trạng thái bốc cháy khi bị trúng đạn cháy
  // Máy châm lửa (máy có quyền với phát bắn) là máy duy nhất tính sát thương cháy -> không trừ máu 2 lần khi chơi mạng
  ignite(duration = 2.5) {
    if (this.isDead || this.invulnerableTimer > 0) return;   // khiên hồi sinh: không bén lửa (cháy âm ỉ quá 3 s khiên)
    if (typeof Equipment !== 'undefined' && Equipment.extIgniteMul) duration *= Equipment.extIgniteMul(this);   // bình chữa cháy: cháy ngắn hơn
    if (typeof VehicleDamage !== 'undefined' && VehicleDamage.extinguisherSound) VehicleDamage.extinguisherSound(this);
    this.burnTimer = Math.max(this.burnTimer || 0, duration);
    this.burnAuth = true;
  }
  // Lửa do máy khác báo sang: chỉ hiện khói lửa, không tự trừ máu
  igniteVisual(duration = 2.5) {
    if (this.isDead) return;
    if (typeof VehicleDamage !== 'undefined' && VehicleDamage.extinguisherSound) VehicleDamage.extinguisherSound(this);
    this.burnTimer = Math.max(this.burnTimer || 0, duration);
  }

  update(dt, terrain, ballistics, radar, allUnits, airdrop = null, supplyCrates = null, capturePoints = null) {
    // Xử lý trạng thái thiêu đốt khi dính đạn cháy
    if (this.burnTimer > 0) {
      // bình chữa cháy tự động (trang bị): lửa tắt nhanh hơn, cháy ít sát thương hơn
      const EQ = typeof Equipment !== 'undefined' && Equipment.fireMul ? Equipment : null;
      this.burnTimer = Math.max(0, this.burnTimer - dt * (EQ ? EQ.fireMul(this) : 1));
      this.burnDamageTimer = (this.burnDamageTimer || 0) + dt;
      if (this.burnDamageTimer >= 0.4) {
        this.burnDamageTimer = 0;
        // xe giáp dày khoang kín, vách ngăn chống cháy + hệ dập lửa: cháy hại chậm hơn xe vỏ mỏng (xe tải pháo, xe trinh sát
        // cháy là cháy rụi nhanh)
        const clsK = { ALL_ROUNDER: 0.5, GATLING: 0.7, ARTILLERY: 1.2, SCOUT: 1.1 }[this.tankType] || 1;
        if (this.burnAuth) this.takeDamage(0.04 * clsK * (EQ ? EQ.burnDamageMul(this) : 1), null, 'BURN');
        this.spawnExhaustPuff(true, false);
      }
      if (this.burnTimer <= 0) this.burnAuth = false;
      // Lội nước ngập quá thân dưới (bánh xích, sườn xe): nước trùm lên vỏ dập chất cháy bám ngoài sau ~0,5 s — hết cháy,
      // hết mất máu. Mọi máy tự tính theo vị trí xe (máy có quyền thôi gửi B, máy khác cũng tự dập ngay)
      if (!this.isDead && this.waterY !== null && this.waterY !== undefined && this.waterDepth > (this.wadeDepth || 10) * 0.8) {
        this._burnWet = (this._burnWet || 0) + dt;
        if (this._burnWet > 0.5) {
          this.burnTimer = 0;
          this.burnAuth = false;
          const fx = window.game && window.game.effectsManager && window.game.effectsManager.fx;
          if (fx && fx.douseSteam) fx.douseSteam(new THREE.Vector3(this.x, this.waterY + 3, this.z), this.waterY, 0.8);
          if (typeof VehicleDamage !== 'undefined' && VehicleDamage.logDoused) VehicleDamage.logDoused(this);
        }
      } else this._burnWet = 0;
    }
    if (this.isDead) {
      // xác đã tách thành vật riêng, mô hình mới đang dựng sẵn ngoài cảnh chờ xuất kích (game.js prepRespawn): không làm gì
      if (this._respawnPrep) return;
      // Cập nhật xác xe cháy bốc khói đen (hệ thống nổ mới tự lo khi đang theo dõi xe này)
      if (!this.damageFxByEngine) this.updateWreckFX(dt);
      this.updateFXParticles(dt);
      this.updateTrackMarks(dt);
      return;
    }

    // 0. Khiên bảo vệ bất tử tạm thời khi mới xuất trận hoặc vừa hồi sinh
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
      this.group.visible = Math.floor(Date.now() / 90) % 2 === 0;
    } else {
      this.group.visible = true;
    }

    // 0.1. Cập nhật thời gian duy trì Item tăng tốc độ di chuyển
    if (this.speedBoostTimer > 0) {
      this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
      if (Math.random() < 0.35) {
        this.spawnExhaustPuff(true, true);
      }
    }

    // 1. Phục hồi giật nòng pháo & nhún giảm chấn thân xe
    if (this.barrelRecoil > 0) {
      // súng phóng lựu 40mm trên chân đế: cả súng lùi trên giá có lò xo giảm giật rồi đẩy về (~0.12 s) và nòng hất lên;
      // súng máy 12.7 lùi ngắn về nhanh; pháo (lùi cả chục đơn vị) về theo tốc độ hãm lùi của pháo
      const agl = this.mainGun && this.mainGun.kind === 'agl';
      const back = agl ? 5 : this.tankType === 'SCOUT' ? 9 : 38;
      this.barrelRecoil = Math.max(0, this.barrelRecoil - dt * back);
      this.barrelGroup.position.z = this.barrelRecoil;
      if (agl) this.barrelGroup.rotation.x = this.barrelRecoil * 0.075 + this.barrelDamagePitch();
    } else if (this.mainGun && this.mainGun.kind === 'agl' && this.barrelGroup.rotation.x !== this.barrelDamagePitch()) this.barrelGroup.rotation.x = this.barrelDamagePitch();
    this.updateRecoilRock(dt);

    // 2. Dao động máy nổ không tải (Idle vibration)
    this.idleVibeTimer += dt * 18;
    // Rung máy nổ khi đứng yên: cực nhẹ, mờ dần theo tốc độ (không bật/tắt giật ở ngưỡng).
    // Góc này xoay cả thân quanh gốc ở mặt đất nên đầu nòng / ăng-ten khuếch đại lên nhiều lần:
    // 0.0022 rad (~2.9 Hz) đã đủ làm cả xe run lẩy bẩy ở phòng xem xe -> nay 0.0004 rad (dưới 1 px ở mức zoom thường).
    // idleVibeAmp = 0 tắt hẳn (phòng xem xe đặt vậy để xe đứng yên trên bệ).
    const idleAmp = this.idleVibeAmp !== undefined ? this.idleVibeAmp : 0.0004;
    const idleVibe = idleAmp > 0 && !this.isDead ? Math.sin(this.idleVibeTimer) * idleAmp * Math.max(0, 1 - Math.abs(this.speed) / 5) : 0;

    // 3. Tiến trình nạp đạn pháo chính (xe 6 nòng / trinh sát nạp băng trong updateGatling — trừ ở đây nữa thì
    // bộ đếm chạy gấp đôi, và khi nó về 0 ở đây thì updateGatling không bao giờ nạp lại băng: súng kẹt 0 viên)
    if (this.reloadTimer > 0 && this.tankType !== 'GATLING' && this.tankType !== 'SCOUT') {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.isPlayer) this.updateReloadSound();
    }

    // 4. Xoay radar cảnh giới & chớp đèn ăng-ten
    // Xe trinh sát: ăng-ten radar quay đúng theo tia quét thật của hệ tình báo (radarSweep, quy ước azimuth)
    if (this.radarDish && !this.isDead) {
      if (this.radarSweep !== undefined && this.tankType === 'SCOUT') {
        this.radarDish.rotation.y = -this.radarSweep - (this.bodyAngle || 0);
      } else {
        this.radarDish.rotation.y += dt * 2.2;
      }
    }
    this.strobeTimer += dt;
    if (this.strobeLight) {
      const isStrobeOn = (Math.sin(this.strobeTimer * 8) > 0.6);
      this.strobeLight.visible = isStrobeOn;
    }

    // 4.1. CẬP NHẬT CHÂN CHỐNG THỦY LỰC CHO PHÁO CAO XẠ (DỪNG 2S HẠ CÀNG MỚI BẮN ĐƯỢC)
    if (this.tankType === 'ARTILLERY') {
      const isStill = Math.abs(this.speed) < 2.0;
      if (isStill) {
        this.standStillTimer += dt;
        // Xe dừng đỗ thì từ từ hạ càng trong 2.0 giây
        // (Trước đây chặn ở 1.5 trong khi cần >= 2.0 mới hạ càng xong -> pháo không bao giờ bắn được)
        const prevDeploy = this.deployProgress;
        this.deployProgress = Math.min(2.0, this.deployProgress + dt * (this.dmg ? this.dmg.deploy : 1));
        let legEvt = null;
        if (this.deployProgress >= 2.0 && !this.isDeployed) {
          this.isDeployed = true;
          legEvt = 'set';
          if (this.isPlayer && window.soundEngine && typeof window.soundEngine.playTargetLockAcquired === 'function') {
            window.soundEngine.playTargetLockAcquired();
          }
        }
        if (this.isPlayer && window.soundEngine && window.soundEngine.updateArtyLegs) window.soundEngine.updateArtyLegs(this.deployProgress > prevDeploy ? 1 : 0, legEvt);
      } else {
        // Xe lăn bánh di chuyển: Tự động thu càng nhanh chóng
        this.standStillTimer = 0.0;
        this.isDeployed = false;
        const prevDeploy = this.deployProgress;
        this.deployProgress = Math.max(0.0, this.deployProgress - dt * 3.2);
        if (this.isPlayer && window.soundEngine && window.soundEngine.updateArtyLegs) {
          window.soundEngine.updateArtyLegs(this.deployProgress < prevDeploy ? -1 : 0, prevDeploy > 0 && this.deployProgress <= 0 ? 'stowed' : null);
        }
      }

      // Điều khiển góc mở của chân chống đuôi và 2 càng sườn 3D
      const deployRatio = this.deployProgress / 2.0;
      if (this.artySpadeGroup) {
        this.artySpadeGroup.rotation.x = deployRatio * 0.72;
        this.artySpadeGroup.position.y = - deployRatio * 2.5;
      }
      if (this.outriggerLeft) {
        this.outriggerLeft.rotation.z = - deployRatio * 0.85;
      }
      if (this.outriggerRight) {
        this.outriggerRight.rotation.z = deployRatio * 0.85;
      }
    }

    // 5. MÔ PHỎNG ĐỊA HÌNH 3D CHÂN THỰC: ĐỘ DỐC, MA SÁT, HỆ THỐNG GIẢM XÓC
    const forwardX = -Math.sin(this.bodyAngle);
    const forwardZ = -Math.cos(this.bodyAngle);
    const rightX = Math.cos(this.bodyAngle);
    const rightZ = -Math.sin(this.bodyAngle);

    // Tính độ cao 4 điểm tiếp xúc vệt xích xe trên mặt đất để xác định độ nghiêng dốc
    // Mặt bánh xích bám (trong cứ điểm: sàn khoang / dốc bê tông, không leo lên ụ đất)
    const refY = this._suspY !== undefined ? this._suspY : undefined;
    // Gần hố bom: xích tì lên mặt hố NHÌN THẤY (lòng hố, gờ đất) như một dải cứng -> hố nhỏ hơn thân xe thì xích bắc cầu
    // qua, hố to thì trọng tâm qua mép là xe chúc mũi lao xuống, leo ra phải vượt được vách hố
    const nearCrater = !!(terrain.cratersNear && terrain.vehicleSurfaceAt && terrain.cratersNear(this.x, this.z, 40));
    const groundAt = nearCrater ? (gx, gz) => terrain.vehicleSurfaceAt(gx, gz, refY)
      : terrain.getVehicleGroundAt ? (gx, gz) => terrain.getVehicleGroundAt(gx, gz, refY) : (gx, gz) => terrain.getElevationAt(gx, gz);
    this.inCrater = nearCrater;
    // Điểm dò mặt đất theo kích thước thân xe thật (hộp thân xe, tính 1 lần / mô hình): 4x4 ngắn hẹp nghiêng khác 6x6 dài.
    // Giới hạn trong khoảng hẹp quanh mặc định cũ ±18 / ±14 (không có mô hình thì giữ mặc định)
    let gs = this._gSamp;
    if (!gs || gs.g !== this.group) {
      gs = this._gSamp = { g: this.group, f: 18, s: 14 };
      if (typeof VehicleCollision !== 'undefined' && this.group) {
        const B = VehicleCollision.hullBox(this);
        if (B && isFinite(B.maxZ - B.minZ) && isFinite(B.maxX - B.minX)) {
          gs.f = Math.max(14, Math.min(24, (B.maxZ - B.minZ) / 2 * 0.6));
          gs.s = Math.max(10, Math.min(17, (B.maxX - B.minX) / 2 * 0.85));
        }
      }
    }
    const SF = gs.f, SS = gs.s;
    const frontY = groundAt(this.x + forwardX * SF, this.z + forwardZ * SF);
    const rearY  = groundAt(this.x - forwardX * SF, this.z - forwardZ * SF);
    const leftY  = groundAt(this.x - rightX * SS, this.z - rightZ * SS);
    const rightY = groundAt(this.x + rightX * SS, this.z + rightZ * SS);
    // Đống đổ nát nhà sập / gạch vụn / gốc tường gãy thấp quanh xe: xích tì lên mặt đống (VehicleCollision.trackSupport)
    // -> thân xe nhô lên, ngóc / chúc mũi và nghiêng theo đống, qua mép bậc thì bập bênh chúc xuống
    const debris = terrain.vehicleDebris && typeof VehicleCollision !== 'undefined' ? terrain.vehicleDebris(this.x, this.z, this) : null;
    const sup = (debris || nearCrater) && typeof VehicleCollision !== 'undefined' ? VehicleCollision.trackSupport(this, this.x, this.z, this.bodyAngle, groundAt, debris || NO_DEBRIS, refY !== undefined ? refY : groundAt(this.x, this.z), this._trackSup || (this._trackSup = {})) : null;

    // Độ dốc dọc theo mũi xe: khi frontY > rearY (lên dốc), mũi ngửa lên chuẩn xác (góc dương)
    const rawPitch = sup ? Math.atan2(sup.front - sup.rear, 36) : Math.atan2(frontY - rearY, 2 * SF);
    // Độ dốc ngang sườn xe: khi leftY > rightY (bên trái cao), thân xe nghiêng bám sườn (góc âm quanh Z)
    const rawRoll  = sup ? Math.atan2(sup.right - sup.left, 28) : Math.atan2(rightY - leftY, 2 * SS);

    // Giới hạn góc nghiêng nhún thân xe tối đa (±17° Pitch, ±12° Roll) để xe luôn giữ dáng vững chãi, không bị lộn mèo hay vặn xoắn
    const maxPitch = 0.75;   // đủ để thân xe ngóc theo sườn ụ đất dốc khi leo
    const maxRoll  = 0.45;
    const slopePitch = Math.max(-maxPitch, Math.min(maxPitch, rawPitch));
    const slopeRoll  = Math.max(-maxRoll,  Math.min(maxRoll,  rawRoll));

    // Lấy thông số địa hình thực tế (Đường nén, Đồi cao, Sườn sỏi, Sa mạc cát)
    // Độ dốc do xe tự xử lý theo khả năng leo của từng loại (không để địa hình phạt dốc lần nữa)
    const terrainInfo = terrain.getTerrainInfoAt(this.x, this.z, 0);
    const wheeledDrive = this.tankType === 'SCOUT' || this.tankType === 'ARTILLERY';
    // Bánh xích vs bánh lốp trên từng loại mặt đất: xe tải lún cát / bùn, chậm trên sườn đá; 4x4 trinh sát việt dã tốt
    const DRIVE = SPG_DRIVE[this.tankType === 'ARTILLERY' || this.tankType === 'SCOUT' ? this.tankType : 'TRACKED'];
    // Sườn đá / cao nguyên: địa hình tự giảm 50% — xe xích & 4x4 vượt địa hình tốt hơn nhiều, chỉ xe tải bị ì
    // Độ sâu nước tại chỗ xe đứng (0 nếu trên cạn / trên cầu)
    const waterY = terrain.waterSurfaceAt ? terrain.waterSurfaceAt(this.x, this.z) : null;
    const wDepth = waterY !== null && waterY !== undefined ? Math.max(0, waterY - groundAt(this.x, this.z)) : 0;
    this.waterDepth = wDepth;
    this.waterY = waterY;
    const baseSurf = terrainInfo.type === 'MOUNTAIN'
      ? (this.tankType === 'ARTILLERY' ? 0.62 : this.tankType === 'SCOUT' ? 0.88 : 0.9) / (DRIVE.MOUNTAIN || 1)
      : terrainInfo.type === 'WATER' ? 1   // nước cản trực tiếp lên vận tốc (bên dưới), không nhân hệ số
      : terrainInfo.speedMult;
    const speedMult = baseSurf * (DRIVE[terrainInfo.type] || 1);
    // NƯỚC CẢN (ì): lao xuống nước nhanh thì bị ghì lại trong ~0.5-1 s (mũi chúi theo lực hãm), đạp ga cũng không
    // vượt được tốc độ lội; lên bờ phải tăng tốc lại từ tốc độ lội chứ không bật ngay về tốc độ cũ
    if (terrainInfo.type === 'WATER') {
      const cap = (this.baseMaxSpeed || 100) * this.wadeSpeedMult(wDepth);
      const v = Math.abs(this.speed), sg = Math.sign(this.speed);
      if (v > cap) {
        let nv = this._wPrevSpd !== undefined ? Math.min(v, Math.max(cap, this._wPrevSpd)) : v;   // ga không đẩy thêm được
        nv = cap + (nv - cap) * Math.exp(-dt * (2.2 + 3 * Math.min(1, wDepth / (this.wadeDepth || 10))));
        this.speed = sg * nv;
      }
    }
    this._wPrevSpd = Math.abs(this.speed);
    this.currentTerrainType = terrainInfo.type;

    // LEO DỐC theo khả năng từng xe: dốc càng gần giới hạn càng chậm; quá giới hạn thì không leo nổi (trượt lùi nhẹ)
    const dirSign = this.speed >= 0 ? 1 : -1;
    let grade = ((frontY - rearY) / (2 * SF)) * dirSign;      // dốc theo hướng đang chạy (tan góc)
    // Trên đống đổ nát: dốc theo đường đỡ của xích trên mặt đống — sườn đống quá dốc so với khả năng leo thì trượt lại
    this.onDebris = !!(sup && sup.lift > 0.8);
    if (this.onDebris) grade = Math.max(grade, sup.slope * dirSign);
    else if (sup) grade = sup.slope * dirSign;   // trong / qua hố: dốc theo đường tì của xích (vách hố)
    this.moveGrade = grade;   // lưỡi ủi đẩy đất lên dốc nặng hơn (game.js updateDig)
    const climbMax = this.climbMax || 0.8;
    let slopeMult = 1;
    this.climbStall = false;
    if (grade > 0.03) {
      const k = grade / climbMax;
      if (k >= 1) { slopeMult = 0; this.climbStall = Math.abs(this.speed) > 3; }
      // dốc vừa gần như không chậm; chỉ khi sát giới hạn leo mới ì hẳn
      else slopeMult = Math.max(0.3, 1 - 0.65 * Math.pow(k, 2.2));
      this.engineLoad = Math.min(2, 1 + Math.min(1, k) * 0.9);
    } else {
      // đổ dốc: trôi nhanh hơn một chút
      if (grade < -0.05) slopeMult = Math.min(1.25, 1 - grade * 0.5);
      this.engineLoad = terrainInfo.engineLoad && grade > -0.05 ? terrainInfo.engineLoad : 0.9;
    }
    // Lội nước: máy gồng theo độ sâu (nước cản thân xe), quá mức lội thì gồng hết cỡ
    if (wDepth > 1) this.engineLoad = Math.max(this.engineLoad, Math.min(2, 1.2 + 0.5 * wDepth / this.wadeDepth));
    // Lưỡi ủi đang đẩy đống đất (game.js updateDig: _dozerLoad 0..1): máy gầm theo tải trên lưỡi
    if (this._dozerLoad > 0) this.engineLoad = Math.max(this.engineLoad, Math.min(2, 1 + this._dozerLoad));
    if (this.climbStall && this.isPlayer && window.game && typeof window.game.addCombatLog === 'function') {
      const now = performance.now();
      if (!this._stallLogT || now - this._stallLogT > 3000) {
        this._stallLogT = now;
        window.game.addCombatLog(this.tankType === 'ARTILLERY' ? '[[mountain]] DỐC QUÁ CAO — pháo tự hành (xe tải 6x6) không leo nổi, hãy đi vòng!' : '[[mountain]] DỐC QUÁ CAO — xe không leo nổi!', 'alert');
      }
    }

    // Bò trên đống đổ nát: xích trượt trên gạch đá lổn nhổn -> chậm hẳn; đang leo lên đống thì máy gầm (tải nặng)
    if (this.onDebris) {
      slopeMult *= 0.6;
      if (Math.abs(this.speed) > 2) this.engineLoad = Math.max(this.engineLoad, Math.min(2, 1.35 + Math.max(0, grade) * 0.8));
    }
    // ĐÀ QUA RANH GIỚI MẶT ĐẤT / DỐC: hệ số lăn (mặt đất x dốc) không đổi tức thì ở ranh giới (đường nhựa -> cát, chân dốc)
    // mà tiến dần (~0.2-0.3 s): vào cát xe ì dần, lên đường xe bốc dần. Dốc quá giới hạn (trượt lùi) thì áp ngay
    const wantMul = speedMult * slopeMult;
    if (this._terrainMul === undefined || this.climbStall) this._terrainMul = wantMul;
    else this._terrainMul = wantMul + (this._terrainMul - wantMul) * Math.exp(-dt * (wantMul < this._terrainMul ? 5 : 3.5));
    this._groundMult = this._terrainMul;   // tốc độ lăn thật / this.speed — xe bánh lốp quay thân theo tốc độ lăn thật
    let nextX = this.x + forwardX * this.speed * this._terrainMul * dt;
    let nextZ = this.z + forwardZ * this.speed * this._terrainMul * dt;
    if (this.climbStall) {
      // bánh / xích quay trượt, xe tụt lùi nhẹ khỏi sườn quá dốc
      const back = Math.min(1.5, grade / climbMax - 1) * 25 * dt + 4 * dt;
      nextX -= forwardX * dirSign * back;
      nextZ -= forwardZ * dirSign * back;
      this.speed *= Math.exp(-dt * 2.5);
    }
    void wheeledDrive;

    // NƯỚC QUÁ SÂU (sâu hơn wadeMax): xe vẫn lội tiếp được (chỉ còn bò, xem wadeSpeedMult) nhưng ngập -> tụt máu dần (updateSubmerged)
    if (this.isPlayer && window.game && typeof window.game.addCombatLog === 'function') {
      const now = performance.now();
      if (wDepth > this.wadeMax) {
        if (!this.submerged || !this._wadeLogT || now - this._wadeLogT > 6000) {
          // vừa ngập: tiếng nước ộc vào khoang máy
          if (!this.submerged && window.soundEngine && window.soundEngine.playEngineFlood) window.soundEngine.playEngineFlood();
          this._wadeLogT = now;
          window.game.addCombatLog('[[ripple]] XE ĐANG NGẬP NƯỚC — mất máu dần, lội ra chỗ nông hoặc đi qua cầu!', 'alert');
        }
      } else if (wDepth > this.wadeDepth && !this._wadeDeepIn) {
        if (!this._wadeLogT || now - this._wadeLogT > 8000) {
          this._wadeLogT = now;
          window.game.addCombatLog('[[ripple]] Nước sâu — xe đi rất chậm', 'tip');
        }
      }
    }
    this._wadeDeepIn = wDepth > this.wadeDepth * 0.9;
    this.updateSubmerged(dt, wDepth);

    this._mapHalfX = terrain.width / 2 - 100; this._mapHalfZ = terrain.depth / 2 - 100;   // cho clampToMap (điểm né / đổi chỗ của bot)
    // Xe bản sao mạng (đã có tư thế nội suy): vị trí do máy chủ quyền gửi, postUpdate ghi đè -> không tích phân / va chạm
    // (đỡ tốn CPU, độ cao & góc nghiêng lấy đúng tại vị trí nhận được). Xe mình vẫn nhận trọn phần đẩy từ xe bản sao
    const netPose = !!(this._netProxy && this._netVis);
    if (netPose) { nextX = this.x; nextZ = this.z; this._touchingVeh = false; }

    // KIỂM TRA VA CHẠM VỚI CÁC XE PHÁO KHÁC (KHÔNG ĐI XUYÊN QUA NHAU)
    // Thân xe là hình hộp xoay theo hướng xe (đo trên mô hình, như va chạm tường) chứ không phải vòng tròn bán kính cố
    // định: xe tăng dài ~9 m mà vòng cũ chỉ cách tâm ~4 m -> hai xe chồng sâu vào nhau. Xe mình chịu nửa phần đẩy,
    // xe kia tự đẩy nửa còn lại ở lượt cập nhật của nó; xe kia không tự chạy (proxy mạng / đã bỏ) thì mình nhận trọn.
    // Tính TRƯỚC biên bản đồ & vật cản tĩnh, cộng vào quãng đi -> xe khác ủi không đẩy được xe mình xuyên tường / qua vành núi
    if (allUnits && !netPose) {
      let touching = false;
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      let mvx = nextX - this.x, mvz = nextZ - this.z;
      const mvLen = Math.hypot(mvx, mvz);
      const rMe = VC ? VC.reach(this) : 0;
      const near = SPG_NEAR_VEH;
      near.length = 0;
      for (const other of allUnits) {
        // xác xe đã chết vẫn là khối thép nằm đó: chặn như xe sống (chỉ bỏ qua khi xác đã dọn / ẩn khỏi cảnh)
        if (other === this || (other.isDead && (!other.group || !other.group.visible || !other.group.parent))) continue;
        // khác tầng (xe trên nóc hầm / xe trong lòng hầm bên dưới, cầu / gầm cầu): không chạm nhau
        if (Math.abs((this.y || 0) - (other.y || 0)) > 24) continue;
        if (Math.hypot(nextX - other.x, nextZ - other.z) > (VC ? rMe + VC.reach(other) : 34) + mvLen) continue;
        near.push(other);
      }
      if (near.length) {
        // Khung hình dài (FPS thấp): chia quãng đi thành bước ~4 đv, dừng ở bước đầu tiên chạm xe khác rồi mới đẩy ra; xe
        // đang chạm sẵn từ đầu khung thì mỗi khung chỉ được lấn thêm ~3 đv vào nó (như ở 60 FPS — vẫn ủi được xe khác,
        // phần còn lại trượt dọc mặt tiếp xúc) -> không nhảy xuyên qua xe khác. 60 FPS: 1 bước như cũ
        const n = VC ? Math.max(1, Math.min(8, Math.ceil(mvLen / 4))) : 1;
        if (n > 1) {
          const me0 = spgVehObb(VC, this, this.x, this.z, SPG_OBB_ME);
          const fresh = [];
          for (const other of near) {
            const ob = spgVehObb(VC, other, other.x, other.z, SPG_OBB_OT);
            const p0 = VC.obbPush(me0.cx, me0.cz, me0.ux, me0.uz, me0.hu, me0.hv, ob, SPG_OBB_P);
            if (!p0) { fresh.push(other); continue; }
            const nx = p0.x / p0.d, nz = p0.z / p0.d, dn = mvx * nx + mvz * nz;   // p0.d > 0 luôn (obbPush trả null khi không chồng)
            if (dn < -3) { mvx -= (dn + 3) * nx; mvz -= (dn + 3) * nz; }
          }
          nextX = this.x + mvx; nextZ = this.z + mvz;
          for (let k = 1; k < n && fresh.length; k++) {
            const me = spgVehObb(VC, this, this.x + mvx * k / n, this.z + mvz * k / n, SPG_OBB_ME);
            let any = false;
            for (const other of fresh) {
              if (VC.obbPush(me.cx, me.cz, me.ux, me.uz, me.hu, me.hv, spgVehObb(VC, other, other.x, other.z, SPG_OBB_OT), SPG_OBB_P)) { any = true; break; }
            }
            if (any) { nextX = this.x + mvx * k / n; nextZ = this.z + mvz * k / n; break; }
          }
        }
        const me = VC ? spgVehObb(VC, this, nextX, nextZ, SPG_OBB_ME) : null;
        for (const other of near) {
          let px = 0, pz = 0;
          if (VC) {
            const ob = spgVehObb(VC, other, other.x, other.z, SPG_OBB_OT);
            const p = VC.obbPush(me.cx, me.cz, me.ux, me.uz, me.hu, me.hv, ob, SPG_OBB_P);
            if (!p) continue;
            px = p.x; pz = p.z;
            // chồng sâu tới mức tâm hai xe đã vượt qua nhau theo trục đẩy (so với đầu khung): đẩy về phía cũ, không đẩy
            // xuyên ra phía bên kia xe (độ đẩy ngược = độ chồng + 2 x khoảng lệch tâm theo trục đó)
            if (p.d > 1e-4 && px * (me.cx - nextX + this.x - ob.cx) + pz * (me.cz - nextZ + this.z - ob.cz) < 0) {
              const nx = px / p.d, nz = pz / p.d;
              const m = p.d + 2 * Math.abs((ob.cx - me.cx) * nx + (ob.cz - me.cz) * nz);
              px = -nx * m; pz = -nz * m;
            }
          } else {
            const dx = nextX - other.x, dz = nextZ - other.z;
            const dist = Math.hypot(dx, dz), minSep = 34;
            if (!(dist < minSep && dist > 0.001)) continue;
            px = dx / dist * (minSep - dist); pz = dz / dist * (minSep - dist);
          }
          touching = true;
          const pl = Math.hypot(px, pz);
          // VA CHẠM THEO KHỐI LƯỢNG: phần đẩy xe mình nhận = quán tính xe kia / tổng quán tính. Quán tính = khối lượng x
          // hệ số phanh: xe đứng yên ghì phanh (xích bám đất x6, bánh lốp x2.5) gần như không đẩy nổi -> xe trinh sát 10 tấn
          // húc xe tăng 60 tấn đang đứng thì tự bật lại, xe tăng không xê dịch; xe tăng chạy húc xe trinh sát thì ủi nó đi.
          // Mỗi xe tự tính phần của mình theo cùng công thức -> 2 phần cộng lại đúng bằng độ chồng (không xuyên, không văng)
          const inertia = u => (u.mass || 40) * (Math.abs(u.speed || 0) < 3 && !u.isDead ? (u.isWheeled ? 2.5 : 6) : 1);
          const mMe = inertia(this), mOt = inertia(other);
          let share = mOt / (mMe + mOt);
          // xác xe không tự đẩy lại (đứng im như tảng thép); xe bản sao mạng do máy chủ của nó tự đẩy ra khi nhận vị trí xe
          // mình -> trong lúc chờ chỉ cho chồng tối đa 3 đv (không thấy 2 xe lồng vào nhau)
          if (other.isDead) share = 1;
          else if (other._netProxy || other.isRemote) share = Math.max(share, pl > 3 ? 1 - 3 / pl : 0);
          nextX += px * share; nextZ += pz * share;
          if (me) { me.cx += px * share; me.cz += pz * share; }
          // mất đà theo phần mình bị đẩy lùi (xe nhẹ đâm xe nặng khựng hẳn, xe nặng ủi xe nhẹ gần như không chậm)
          if (pl > 0.5) this.speed *= Math.pow(1 - 0.3 * share, dt * 60);
          // TIẾNG / RUNG VA CHẠM: tốc độ áp sát theo pháp tuyến (cả 2 xe), xung lực theo khối lượng quy đổi; tiếng cạ
          // nghiến khi 2 thân xe trượt dọc nhau. Mỗi cặp xe chỉ phát 1 lần (xe có id nhỏ hơn phát), mọi xe (cả AI)
          if (pl > 1e-4 && (!other.id || String(this.id) < String(other.id) || other._netProxy || other.isRemote || other.isDead)) {
            const nx = px / pl, nz = pz / pl, fa = this.bodyAngle || 0, fb = other.bodyAngle || 0;
            const vax = -Math.sin(fa) * (this.speed || 0), vaz = -Math.cos(fa) * (this.speed || 0);
            const vbx = other.isDead ? 0 : -Math.sin(fb) * (other.speed || 0), vbz = other.isDead ? 0 : -Math.cos(fb) * (other.speed || 0);
            const rvx = vax - vbx, rvz = vaz - vbz, vn = -(rvx * nx + rvz * nz), vt = Math.abs(-rvx * nz + rvz * nx);
            const pos = { x: (nextX + other.x) / 2, y: (this.y || 0) + 8, z: (nextZ + other.z) / 2 };
            if (typeof spgImpact === 'function') spgImpact(this, other.isDead ? 'wreck' : 'vehicle', pos, vn, vt, this.mass || 40, other.mass || 40, !this._touchingVeh, other);
          }
        }
      }
      this._touchingVeh = touching;
    }

    // Ô TÔ / CỘT TRÊN PHỐ (đô thị): xe xích leo lên cán bẹp ô tô, xe bánh lốp / lưỡi ủi đẩy ô tô trượt xoay sang bên; cột
    // đèn / cột điện đủ đà (khối lượng x tốc độ) thì gãy đổ, không đủ thì chặn xe. Xe bản sao mạng chỉ tác động lên đồ vật
    const PS = terrain.propSet && terrain.propSet.street;
    if (PS) {
      const r = PS.vehicleContact(this, this.x, this.z, nextX, nextZ, dt, netPose);
      if (!netPose) { nextX = r.x; nextZ = r.z; }
      // Thùng rác / bao rác / thùng các-tông trên vỉa hè: bị xe húc văng, cán bẹp, túi rách tung
      const JKS = terrain.streetscape && terrain.streetscape.junk;
      if (JKS && JKS.crush) JKS.crush(this, nextX, nextZ, dt);
    }
    // XÁC XE trên bản đồ: xe đủ lực kéo ủi trượt / xoay xác xe theo khối lượng (props.js wreckContact), không đủ thì bị chặn
    const PW = terrain.propSet;
    if (PW && PW.wreckContact) {
      const r = PW.wreckContact(this, this.x, this.z, nextX, nextZ, dt, netPose);
      if (!netPose) { nextX = r.x; nextZ = r.z; }
    }

    // Giới hạn biên bản đồ
    nextX = Math.max(-terrain.width / 2 + 60, Math.min(terrain.width / 2 - 60, nextX));
    nextZ = Math.max(-terrain.depth / 2 + 60, Math.min(terrain.depth / 2 - 60, nextZ));
    // tường vô hình trên sườn vành núi, bám đường chân núi méo của bản đồ (không leo qua núi ra bờ biển / ra góc)
    const OUT = terrain.map && terrain.map.outer;
    if (OUT && OUT.rimFoot) {
      const d = Math.hypot(nextX, nextZ), lim = OUT.rimFoot(nextX, nextZ) + OUT.wall;
      if (d > lim) { nextX *= lim / d; nextZ *= lim / d; }
    }

    // KIỂM TRA VA CHẠM VẬT CẢN (TÒA NHÀ CĂN CỨ & BỜ TƯỜNG CÔNG SỰ MÓNG NGỰA)
    // A parked vehicle has no swept volume. A push from another vehicle above changes
    // nextX/nextZ, so real contacts still take the exact collision path.
    const collisionMove = Math.abs(nextX - this.x) + Math.abs(nextZ - this.z);
    const resolved = netPose ? null : collisionMove > 0.001
      ? terrain.resolveVehicleCollision(this.x, this.z, nextX, nextZ, 16, this)
      : { x: nextX, z: nextZ, hit: false, mat: null };
    if (resolved && resolved.hit) {
      // Húc gần như thẳng vào vật cản: xe dừng lại (vẫn quay đầu / lùi thoải mái).
      // Húc chéo: thân xe trượt dọc theo mặt tường, chỉ hao tốc độ do cọ sát
      const want = Math.hypot(nextX - this.x, nextZ - this.z);
      const gx = resolved.x - this.x, gz = resolved.z - this.z;
      const slide = want > 1e-4 && gx * (nextX - this.x) + gz * (nextZ - this.z) > 0 ? Math.min(1, Math.hypot(gx, gz) / want) : 0;
      // Tiếng / rung / bụi va vật cản theo vật liệu (nhà bê tông, gạch, tôn, gỗ, đá, cây, cột, cầu): tốc độ áp sát = phần
      // quãng đi bị vật cản chặn (/dt); đang tì trượt dọc tường thì tiếng cạ nghiến
      if (dt > 0) {
        // tốc độ áp sát = vận tốc xe chiếu lên pháp tuyến mặt chặn. KHÔNG lấy phần quãng bị chặn / dt: khung hình đầu tiên
        // chạm tường xe chỉ lấn vào một phần ngẫu nhiên của quãng đi trong khung -> cú húc hết tốc lực có lúc nghe như cạ
        // khẽ, thậm chí dưới ngưỡng tiếng (im lặng) rồi các khung sau không còn là "lần chạm đầu"
        const cx = nextX - resolved.x, cz = nextZ - resolved.z, cl = Math.hypot(cx, cz);
        const mx = nextX - this.x, mz = nextZ - this.z, ml = Math.hypot(mx, mz);
        const vn = cl > 1e-4 ? Math.max(0, (mx * cx + mz * cz) / cl) / dt : ml / dt;
        const vt = slide * Math.abs(this.speed || 0);
        const pos = { x: resolved.x + (cl > 1e-4 ? cx / cl * 18 : 0), y: (this.y || 0) + 6, z: resolved.z + (cl > 1e-4 ? cz / cl * 18 : 0) };
        // lần chạm đầu: chưa tì vật cản trong ~0,2 s qua (tì tường chập chờn chạm / nhả từng khung không phát lại tiếng va)
        spgImpact(this, resolved.mat || 'concrete', pos, vn, vt, this.mass || 40, Infinity, !(this._bumpFree < 0.2), null);
      }
      if (slide < 0.3) this.speed *= Math.pow(0.65, dt * 60);   // hãm theo thời gian (cùng mức 60 FPS cũ)
      else {
        const cap = (this.baseMaxSpeed || Math.abs(this.speed)) * (0.35 + 0.65 * slide);
        if (Math.abs(this.speed) > cap) this.speed = Math.sign(this.speed) * cap;
      }
    }
    this._bumping = !!(resolved && resolved.hit);
    this._bumpFree = this._bumping ? 0 : (this._bumpFree === undefined ? 1 : this._bumpFree + dt);
    if (resolved) { this.x = resolved.x; this.z = resolved.z; }
    // CHỐNG XUYÊN: tường vừa đẩy xe mình lùi lại có thể đẩy ngược vào xe khác (bước xe - xe tính trước bước tường) ->
    // còn chồng lên xe khác quá 2 đv thì đẩy ra lần nữa rồi xét lại tường; chỉ nhận nếu bớt chồng
    if (resolved && allUnits && typeof VehicleCollision !== 'undefined' && SPG_NEAR_VEH.length) {
      const VC = VehicleCollision, me = spgVehObb(VC, this, this.x, this.z, SPG_OBB_ME);
      for (const other of SPG_NEAR_VEH) {
        const p = VC.obbPush(me.cx, me.cz, me.ux, me.uz, me.hu, me.hv, spgVehObb(VC, other, other.x, other.z, SPG_OBB_OT), SPG_OBB_P);
        if (!p || p.d <= 2) continue;
        const d0 = p.d, r2 = terrain.resolveVehicleCollision(this.x, this.z, this.x + p.x, this.z + p.z, 16, this);
        const me2 = spgVehObb(VC, this, r2.x, r2.z, {}), p2 = VC.obbPush(me2.cx, me2.cz, me2.ux, me2.uz, me2.hu, me2.hv, spgVehObb(VC, other, other.x, other.z, SPG_OBB_OT), {});
        if (!p2 || p2.d < d0) { this.x = r2.x; this.z = r2.z; spgVehObb(VC, this, this.x, this.z, me); }
      }
    }

    // Độ cao mặt đất tại tâm xe + độ lún cát nhẹ + xóc nảy gồ ghề
    let groundBaseY = groundAt(this.x, this.z);
    // trên đống đổ nát: tâm xe theo đường đỡ của xích (tính ở vị trí cũ, cộng phần mặt đất đổi khi xe vừa nhích đi)
    if (sup) groundBaseY = Math.max(groundBaseY, sup.center + groundBaseY - sup.g0);
    const sinkY = this.onDebris ? 0 : Math.max(-1.0, terrainInfo.sinkY || 0);

    // Xóc nảy địa hình mấp mô theo QUÃNG ĐƯỜNG đã chạy (tần số thấp, mượt) — trước đây dùng sin(t*360)
    // ~57 Hz vượt tần số khung hình nên thành rung giật ngẫu nhiên, và đẩy cả camera rung theo.
    // Xóc chỉ áp lên thân xe (chassis), vị trí xe / camera bám mặt đất đã lọc mượt.
    const speedRatio = Math.abs(this.speed) / this.baseMaxSpeed;
    this._odo = (this._odo || 0) + Math.abs(this.speed) * dt;
    // Xe bánh lốp (giảm xóc lò xo) nhún nhiều hơn xe xích; tần số ~1-2.5 Hz ở tốc độ tối đa
    this._bumpiness = this.onDebris ? 1.2 : (terrainInfo.bumpiness || 0.4);   // độ gồ ghề dưới xe (dispersion.js: chạy đường xấu kém chụm)
    const bumpAmp = Math.min(0.35, this._bumpiness * speedRatio * (wheeledDrive ? 0.32 : 0.2));
    this._bumpY = (Math.sin(this._odo * 0.065) + 0.45 * Math.sin(this._odo * 0.15 + 1.3)) * bumpAmp * 0.7;

    // Hệ treo: độ cao thân bám mặt đất có lọc (không giật theo từng cạnh tam giác địa hình)
    const groundTarget = groundBaseY + sinkY;
    // Rơi theo trọng lực: mặt tì tụt nhanh hơn xe tự rơi (lao qua mép hố, chúi xuống vách dốc) thì xe hẫng, rơi tự do rồi
    // đập xuống (nảy thân, máy gầm) — không trượt mượt xuống như đi thang máy. Leo lên vẫn bám mặt đất có lọc.
    const G = 78;   // 9,8 m/s² (8 đơn vị = 1 m)
    // tốc độ lên / xuống của chính mặt tì dưới xe (xuống dốc đều thì xe cũng đi xuống đều, không phải rơi)
    const gv = this._gPrev !== undefined && dt > 0 ? (groundTarget - this._gPrev) / dt : 0;
    this._gPrev = groundTarget;
    // xe bị dời chỗ đột ngột (đặt lại vị trí / gói mạng nhảy xa): bám ngay mặt đất mới, không rơi từ độ cao cũ
    const warped = this._gLX !== undefined && Math.abs(this.x - this._gLX) + Math.abs(this.z - this._gLZ) > 80;
    this._gLX = this.x; this._gLZ = this.z;
    // mặt tì tụt xuống dưới cả quỹ đạo rơi tự do của xe -> hẫng. Gần hố bom: như cũ; nơi khác (lao khỏi vách / ụ đất / nhịp
    // cầu sập) thì thêm điều kiện mặt tì tụt nhanh hơn hẳn vận tốc đứng của xe và dốc hơn ~45° theo tốc độ chạy — xuống dốc
    // đều / qua đỉnh đồi thoải vẫn bám mặt đất như cũ, chỉ mép vách / bậc hẫng mới rơi
    const vy0 = this._vy || 0;
    const dropping = !(this._gGrace > 0) && groundTarget < this._suspY + vy0 * dt - 0.5 * G * dt * dt - 1.5
      && (nearCrater || gv < vy0 - G * dt - 40 - Math.abs(this.speed));
    if (this._suspY === undefined || groundTarget - this._suspY > 12 || (warped && this._suspY - groundTarget > 12)) {
      this._suspY = groundTarget; this._vy = 0; this.airborne = false;
    } else if (this.airborne || dropping) {
      // mặt tì tụt xuống dưới cả quỹ đạo rơi tự do của xe (lao qua mép hố, vách dốc đứng, nhịp cầu sập) -> hẫng
      if (!this.airborne) { this.airborne = true; this._airT = 0; }
      this._airT += dt;
      this._vy = (this._vy || 0) - G * dt;
      this._suspY += this._vy * dt;
      // điểm chạm sớm nhất của thân xe: đầu / đuôi / hai bên dải xích theo góc chúc & nghiêng hiện tại (qua đỉnh gờ hố,
      // xe chúi mũi -> mũi đập vào vách trước khi tâm xe chạm mặt tì)
      const tp = Math.tan(this.currentPitch || 0), tr = Math.tan(this.currentRoll || 0);
      let pen = groundTarget - this._suspY;
      for (let si = -1; si <= 1; si += 2) for (let fs = -28; fs <= 28; fs += 14) {
        const gx = this.x + forwardX * fs + rightX * 14 * si, gz = this.z + forwardZ * fs + rightZ * 14 * si;
        const d = groundAt(gx, gz) - (this._suspY + fs * tp + 14 * si * tr);
        if (d > pen) pen = d;
      }
      if (pen >= 0) {
        const hit = Math.max(0, gv - this._vy);   // vận tốc va so với mặt đất
        this._suspY = Math.min(this._suspY + pen, Math.max(groundTarget, this._suspY)); this._vy = Math.max(gv, this._vy); this.airborne = false;
        this._gGrace = 0.35;   // vừa đập xuống: thân bập bênh xuôi theo mặt tì, không coi là hẫng tiếp
        if (hit > 14) {
          // chạm đất: thân xe nhún xuống theo lực va, bập bênh, xe khựng lại
          const k = Math.min(1, hit / 90);
          this._landK = Math.max(this._landK || 0, k); this._landT = 0;
          this.speed *= 1 - 0.45 * k;
          // tiếng nện đất theo vận tốc chạm, khối lượng, xích / bánh lốp, mặt đất chỗ rơi — mọi xe (có vị trí / khoảng cách)
          const S = window.soundEngine;
          if (S && S.landAt) S.landAt({ x: this.x, y: this.y, z: this.z }, { k, mA: this.mass || 40, wheeled: wheeledDrive, self: !!this.isPlayer, key: this.id });
          else if (this.isPlayer && S && S.playCollision) S.playCollision(0.4 + 0.6 * k, 'obstacle');
          if (this.isPlayer && window.game) {
            window.game.cameraShake = Math.max(window.game.cameraShake || 0, 4 + 10 * k);
            if (window.game.pushCamera) window.game.pushCamera(0, -Math.min(20, 6 + 18 * k), 0);
          }
        }
      }
    } else {
      if (this._gGrace > 0) this._gGrace -= dt;
      this._suspY += (groundTarget - this._suspY) * Math.min(1, dt * 12);
      // vận tốc đứng làm mượt (xích trượt tới lui ở vách quá dốc không bị coi là rơi)
      this._vy = (this._vy || 0) + (Math.max(-200, Math.min(200, gv)) - (this._vy || 0)) * Math.min(1, dt * 8);
    }
    this.y = this._suspY;
    // nhún thân sau cú đập xuống: lún rồi bật lại tắt dần
    if (this._landK > 0.01) {
      this._landT += dt;
      this._bumpY -= this._landK * 3.2 * Math.cos(this._landT * 16) * Math.exp(-this._landT * 5);
      this._landK *= Math.exp(-dt * 3);
    } else { this._landK = 0; this._landT = 0; }
    this.group.position.set(this.x, this.y, this.z);

    // Làm mượt góc nghiêng thân xe theo dốc địa hình và vật liệu bên dưới (bê tông cứng ngửa dốc chắc nịch, ô tô kim loại mềm lún mượt)
    const matRate = sup && sup.mat === 'car' ? 12.0 : sup ? 10.0 : 8.0;
    this.currentPitch += (slopePitch - this.currentPitch) * Math.min(1.0, dt * matRate);
    this.currentRoll  += (slopeRoll  - this.currentRoll)  * Math.min(1.0, dt * matRate);

    // Tiếng cọ xát và tia lửa khi xích sắt bò cày trượt trên nóc ô tô hoặc xác xe kim loại
    if (sup && sup.mat === 'car' && Math.abs(this.speed || 0) > 3) {
      this._trackGrindT = (this._trackGrindT || 0) - dt;
      if (this._trackGrindT <= 0) {
        this._trackGrindT = 0.12;
        const fxObj = spgFx();
        if (fxObj && fxObj.fire) {
          const grindP = {
            x: this.x + (Math.random() - 0.5) * 16,
            y: (this.y || 0) + 2,
            z: this.z + (Math.random() - 0.5) * 22
          };
          for (let q = 0; q < 5; q++) {
            fxObj.fire.add({
              x: grindP.x, y: grindP.y, z: grindP.z,
              vx: (Math.random() - 0.5) * 25, vy: 5 + Math.random() * 20, vz: (Math.random() - 0.5) * 25,
              size: 0.7 + Math.random() * 0.9, grow: -0.3, drag: 0.9, grav: 90, life: 0.25 + Math.random() * 0.25,
              alpha: 1, fadeIn: 0.005, c0: [1, 0.9, 0.6], c1: [1, 0.4, 0.1], cell: 3
            });
          }
        }
      }
    }

    // Group chính giữ thăng bằng theo trục Y chuẩn của thế giới (giúp thanh máu luôn ngay ngắn)
    this.group.rotation.set(0, this.bodyAngle, 0);

    // 6. Xoay bánh xe khi lăn bánh & bẻ góc lái chân thực cho xe bánh lốp (Arbalest, Marten)
    const wheelRollSpeed = (this.speed / 4.3) * dt;

    if (this.prevBodyAngle === undefined) this.prevBodyAngle = this.bodyAngle;
    let angleDelta = this.bodyAngle - this.prevBodyAngle;
    while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    this.prevBodyAngle = this.bodyAngle;

    // Góc bẻ lái tương ứng chuẩn xác theo hướng rẽ (rẽ phải bánh bẻ sang phải, rẽ trái bánh bẻ sang trái)
    const inputSteer = (this.steerInput !== undefined) ? this.steerInput * 0.55 : 0;
    const dynamicTurnSteer = dt > 0 ? Math.max(-0.55, Math.min(0.55, (angleDelta / dt) * 0.35)) : 0;
    const targetSteer = Math.abs(inputSteer) > 0.05 ? inputSteer : dynamicTurnSteer;
    this.currentSteer = (this.currentSteer || 0) + (targetSteer - (this.currentSteer || 0)) * Math.min(1.0, dt * 12.0);
    if (this.steerInput !== undefined) {
      this.steerInput *= Math.max(0, 1 - dt * 6.0); // Tự động trả thẳng lái mượt mà khi nhả phím
    }

    this.roadWheels.forEach(w => {
      if (w.userData && w.userData.roller) {
        w.userData.roller.rotation.x += wheelRollSpeed;
        if (w.userData.steerFactor) {
          w.rotation.y = this.currentSteer * w.userData.steerFactor;
        }
      } else {
        w.rotation.x += wheelRollSpeed;
      }
    });

    // Hoạt ảnh riêng của model (xích từng mắt, bánh lăn theo từng bên...)
    if (this.modelAnimator) {
      if (!this.isPlayer && (this.isHiddenFromPlayer || (this.group && !this.group.visible))) {
        this._animDtAcc = 0;
      } else if (!this.isPlayer && typeof SpgFXPool !== 'undefined' && !SpgFXPool.isNearView(this.x, this.z, 380)) {
        this._animDtAcc = (this._animDtAcc || 0) + dt;
        this._animSkip = ((this._animSkip || 0) + 1) & 1;
        if (this._animSkip === 0) {
          this.modelAnimator.update(this._animDtAcc, this);
          this._animDtAcc = 0;
        }
      } else {
        this.modelAnimator.update(dt + (this._animDtAcc || 0), this);
        this._animDtAcc = 0;
      }
    }

    // Dồn trọng tâm: tăng tốc ngóc mũi, phanh chúi mũi, vào cua nghiêng ra ngoài (xe bánh lốp nghiêng nhiều hơn xe xích)
    if (dt > 0) {
      const longAcc = (this.speed - (this._prevSpeed === undefined ? this.speed : this._prevSpeed)) / dt;
      this._prevSpeed = this.speed;
      const yawRate = angleDelta / dt;
      const wheeled = this.tankType === 'SCOUT' || this.tankType === 'ARTILLERY';
      const wantP = Math.max(-0.035, Math.min(0.035, longAcc * 0.00011));
      const wantR = Math.max(-0.05, Math.min(0.05, -this.speed * yawRate * (wheeled ? 0.00011 : 0.00005)));
      const kk = Math.min(1, dt * 5);
      this._dynPitch = (this._dynPitch || 0) + (wantP - (this._dynPitch || 0)) * kk;
      this._dynRoll = (this._dynRoll || 0) + (wantR - (this._dynRoll || 0)) * kk;
    }
    // Thân xe và hệ thống bánh xích nghiêng nhún bám dốc địa hình 3D mượt mà
    // lưỡi ủi hạ (game.js updateDig): đầu xe chúi xuống
    const recoilPitch = (this._dynPitch || 0) + idleVibe + this.rockPitch + (this._dozerPitch || 0);
    const dmgTiltP = this.dmg ? this.dmg.tiltP : 0, dmgTiltR = this.dmg ? this.dmg.tiltR : 0;
    this.chassisGroup.rotation.x = this.currentPitch + recoilPitch + dmgTiltP;
    this.chassisGroup.rotation.z = this.currentRoll + (this._dynRoll || 0) + this.rockRoll + dmgTiltR;
    // tư thế thân xe KHÔNG kể dao động nhất thời (rung máy, nhún khi tăng / giảm tốc, giật khi bắn / trúng đạn):
    // hệ ổn định pháo giữ hướng nòng theo tư thế này (getMuzzleWorldTransform)
    this._stabRot = this._stabRot || { x: 0, z: 0 };
    this._stabRot.x = this.currentPitch + dmgTiltP;
    this._stabRot.z = this.currentRoll + dmgTiltR;
    // Thân xe ngồi thấp xuống theo độ tụt của các bánh xẹp / mất bánh (bánh lành vẫn chạm đất)
    // Độ cao gốc của khung thân theo từng mẫu xe (mẫu mới dựng ở y = 0, mẫu cũ ở y = 8) -> chỉ cộng thêm độ sụt / nhún
    if (this._chassisBaseY === undefined) this._chassisBaseY = this.chassisGroup.position.y;
    // (+ _deployLift: pháo tự hành hạ chân chống ép đất nhấc thân lên — spg_arbalest modelAnimator)
    this.chassisGroup.position.y = this._chassisBaseY - (this.dmg ? this.dmg.sink || 0 : 0) - (this.rockHeave || 0) + (this._bumpY || 0) + (this._deployLift || 0);
    if (this.dmg) { this.dmg.tiltRApplied = dmgTiltR; this.dmg.tiltPApplied = dmgTiltP; this.dmg.sinkApplied = this.dmg.sink || 0; }
    // Lốp xẹp kéo lệch hướng xe về phía bánh xẹp khi đang chạy
    if (this.dmg && this.dmg.pull && !this.isDead && Math.abs(this.speed) > 5) {
      this.bodyAngle -= this.dmg.pull * dt * Math.min(1, Math.abs(this.speed) / Math.max(1, this.baseMaxSpeed)) * Math.sign(this.speed);
    }

    // 6b. Lăn qua hố đạn: xích / bánh ép, gạt đất cát sang hai bên, ủi dồn về trước, gờ sụp & cát tràn xuống lấp hố
    if (this.inCrater && typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene) {
      const efx = ExplosionFX.forScene(this.scene);
      if (efx && efx.soilUnderVehicle) efx.soilUnderVehicle(this, dt);
    }

    // 7. TẠO VỆT XÍCH XE HẰN TRÊN MẶT ĐẤT (GROUND TRACK MARKS)
    // Vệt liền mạch đúng vị trí dải xích / từng bánh, hoa xích / hoa lốp riêng từng xe, màu & độ hằn theo mặt đất
    if (typeof TireTracks !== 'undefined') {
      if (this.alwaysFX || SpgFXPool.isNearView(this.x, this.z, 1400)) TireTracks.update(this, terrain, terrainInfo);
    } else {
      const distMoved = Math.hypot(this.x - this.lastTrackPos.x, this.z - this.lastTrackPos.z);
      if (distMoved > 9 && Math.abs(this.speed) > 10) {
        this.spawnTrackMarks(terrain);
        this.lastTrackPos = { x: this.x, z: this.z };
      }
    }

    // 8b. LỘI NƯỚC: sóng rẽ ở mũi, bọt hai bên xích, vòng sóng, tia nước khi tăng tốc (thay cho bụi)
    const wading = this.waterDepth > 0.6 && !this.isDead;
    if (typeof WadingFX !== 'undefined') {
      const vNow = Math.abs(this.speed) * (this._groundMult || 1);
      const accel = dt > 0 && this._wadePrevV !== undefined ? (vNow - this._wadePrevV) / dt : 0;
      this._wadePrevV = vNow;
      if (wading && (this.alwaysFX || SpgFXPool.isNearView(this.x, this.z))) {
        WadingFX.emit(this, dt, { depth: this.waterDepth, waterY: this.waterY, boost: Math.abs(this.speed) > this.baseMaxSpeed, accel });
      } else if (!wading) WadingFX.leave(this);
      WadingFX.frame();
    }

    // 8. HIỆU ỨNG BỤI CÁT XÍCH XE THÍCH ỨNG ĐỊA HÌNH (DUST STORM)
    if (Math.abs(this.speed) > 12 && !wading && terrainInfo.type !== 'WATER') {
      this.dustTimer += dt;
      const isBoosting = Math.abs(this.speed) > this.baseMaxSpeed;
      const dustInterval = isBoosting ? 0.04 : (terrainInfo.type === 'SAND' ? 0.05 : 0.08);

      if (this.dustTimer > dustInterval) {
        this.dustTimer = 0;
        this.spawnDustPuff(terrain, ballistics.wind, isBoosting, terrainInfo);
      }
    }

    // 9. HIỆU ỨNG KHÓI ỐNG XẢ DIESEL (KHI LEO DỐC NẶNG KHÓI ĐEN DÀY HƠN)
    this.exhaustTimer += dt;
    const isBoosting = Math.abs(this.speed) > this.baseMaxSpeed;
    const isHeavyLoad = this.engineLoad > 1.3;
    const exhaustInterval = (isBoosting || isHeavyLoad) ? 0.05 : (Math.abs(this.speed) > 10 ? 0.12 : 0.25);

    if (this.exhaustTimer > exhaustInterval) {
      this.exhaustTimer = 0;
      this.spawnExhaustPuff(isBoosting, isHeavyLoad);
    }

    // 10. HIỆU ỨNG KHÓI NÒNG BỐC LÊN SAU KHI BẮN (LINGERING BARREL SMOKE)
    // (nhịp theo thời gian: trước đây 40% mỗi khung -> 144 FPS sinh khói gấp 2,4 lần 60 FPS)
    if (this.barrelSmokeTimer > 0) {
      this.barrelSmokeTimer -= dt;
      this._barrelPuffT = (this._barrelPuffT || 0) - dt;
      if (this._barrelPuffT <= 0) {
        this._barrelPuffT = 0.05 + Math.random() * 0.04;
        this.spawnBarrelSmokePuff(ballistics.wind);
      }
    }

    // 11. HIỆU ỨNG HỎNG HÓC THEO MỨC MÁU (DAMAGE SMOKE & FIRE)
    const hpRatio = Math.max(0, this.hp / this.maxHp);
    if (hpRatio < 0.6 && !this.damageFxByEngine) {
      this.damageFxTimer += dt;
      const dmgInterval = hpRatio < 0.3 ? 0.06 : 0.14;
      if (this.damageFxTimer > dmgInterval) {
        this.damageFxTimer = 0;
        this.spawnDamageSmokeAndFire(hpRatio);
      }
    }

    // 12. CẬP NHẬT TẤT CẢ CÁC HẠT HIỆU ỨNG & VỆT XÍCH XE
    this.updateFXParticles(dt);
    this.updateTrackMarks(dt);

    // 12b. THÁP QUAY DẦN / NÒNG NÂNG DẦN TỚI HƯỚNG ĐƯỢC LỆNH (click ngắm, bot ngắm) với tốc độ thật của từng xe
    //      (trước đây gán thẳng azimuth -> tháp "nhảy" tức thì sang hướng mới)
    if (this.aimAz !== undefined && !this._netProxy && !this.isDead) {
      const T = this.turretRates();
      const off = this.barrelWorldOffset();   // bù độ nghiêng thân xe: nòng thật chỉ đúng hướng / góc lệnh
      const wantAz = this.aimAz - off.az;
      let d = ((wantAz - this.azimuth + 540) % 360) - 180;
      const st = T.traverse * dt;
      if (this.turretBlindHalf() > 0) {
        // pháo tự hành: quay vòng phía đuôi xe, không quét qua điểm mù mũi xe; hướng lệnh trong điểm mù -> dừng ở mép
        const r = this.stepAzimuth(this.azimuth, wantAz, st);
        this.azimuth = r.az;
        d = r.done ? 0 : 1;
      } else if (Math.abs(d) <= st) { this.azimuth = ((wantAz % 360) + 360) % 360; d = 0; }
      else this.azimuth = (this.azimuth + Math.sign(d) * st + 360) % 360;
      let de = 0;
      if (this.aimEl !== undefined && this.canElevate !== false) {
        de = (this.aimEl - off.el) - this.elevation;
        const es = T.elevate * dt;
        if (Math.abs(de) <= es) { this.elevation = this.aimEl - off.el; de = 0; } else this.elevation += Math.sign(de) * es;
      }
      if (d === 0 && de === 0) { this.aimAz = undefined; this.aimEl = undefined; }
    }

    // 12c. Độ tản mát đạn: đo tốc độ quay tháp / thân xe, thời gian đứng ngắm, độ nở sau phát bắn (dispersion.js)
    if (typeof Dispersion !== 'undefined') Dispersion.track(this, dt);

    // 13. XOAY THÁP PHÁO 3D BÁM GIỮ NGUYÊN HƯỚNG MỤC TIÊU (AZIMUTH STABILIZER)
    // Hướng ngắm trong thế giới: - (azimuth * PI / 180)
    // Tháp pháo quay cục bộ bù trừ hoàn toàn góc xoay thân xe -> Thân xe xoay nòng KHÔNG bị xoay theo!
    const prevTurretYaw = this.turretGroup.rotation.y, prevBarrelEl = this.barrelPivot.rotation.x;   // tư thế khung trước (chặn nòng xuyên tường)
    const targetWorldTurretAngle = - (this.azimuth * Math.PI) / 180;
    let targetTurretYaw = targetWorldTurretAngle - this.bodyAngle;
    // Pháo tự hành: mũi xe là điểm mù khi BẮN (không bắn vắt qua cabin) nhưng tháp vẫn quay qua được để gác nòng lên
    // giá khóa trên nóc cabin (tư thế hành quân, nòng hạ 0°). Nằm trong điểm mù thì không khai hỏa (xem fire()).
    // Góc tháp biểu diễn 0..2PI (0 = mũi xe); lệnh ngắm tự động đi vòng phía đuôi (stepAzimuth)
    // Xe 6 nòng: tháp chỉ quay nửa trước (±115° quanh mũi xe), không bao giờ vào điểm mù phía đuôi — lệnh / thân xe xoay
    // đẩy hướng giữ vào điểm mù thì tháp dừng ở mép gần nhất (hướng bắn ghi ngược theo tháp). Góc tháp biểu diễn có dấu
    // -PI..PI quanh mũi xe -> mọi đường quay tuyến tính đều đi vòng qua mũi, không cắt qua đuôi
    const blindS = this.turretBlindHalf(), blindC = this.turretBlindCenter(), TWO_PI = Math.PI * 2;
    const toU = a => ((a % TWO_PI) + TWO_PI) % TWO_PI;
    const rearLimit = blindS > 0 && blindC !== 0, yawLim = Math.PI - blindS;
    if (rearLimit) {
      const v = Math.atan2(Math.sin(targetTurretYaw), Math.cos(targetTurretYaw));
      targetTurretYaw = Math.max(-yawLim, Math.min(yawLim, v));
      this.turretInBlind = false;
      if (targetTurretYaw !== v && !this._netProxy) {
        const worldA = -(targetTurretYaw + this.bodyAngle) * 180 / Math.PI;
        this.azimuth = ((worldA % 360) + 360) % 360;
      }
    } else if (blindS > 0) {
      const u = toU(targetTurretYaw);
      this.turretInBlind = u < blindS || u > TWO_PI - blindS;
      targetTurretYaw = u;
    }
    const trav = this.dmg ? this.dmg.traverse : 1;
    // xe trinh sát: vòng súng quay & ngóc bằng tay xạ thủ -> xạ thủ chui trong xe (chế độ lái / chưa lên tới súng) thì
    // tháp đứng yên theo thân xe, nòng giữ góc cũ; hướng / góc lệnh ghi ngược theo tháp thật (giàn rocket điều khiển từ xa: vẫn quay)
    const crewHeld = this._crewInside && !(this.mainGun && this.mainGun.kind === 'rocket') && this._turretYaw !== undefined;
    if (crewHeld) {
      if (!this._netProxy) {
        const worldA = -(this._turretYaw + this.bodyAngle) * 180 / Math.PI;
        this.azimuth = ((worldA % 360) + 360) % 360;
        // xạ thủ buông súng trước khi chui xuống: súng tự cân về hơi chúc mũi (đuôi súng / tay cầm nhấc lên khỏi nắp lỗ đã đóng)
        if (this._heldEl === undefined) this._heldEl = this.elevation;
        this._heldEl += (-3 - this._heldEl) * Math.min(1, dt * 2.5);
        this.elevation = this._heldEl;
      }
    } else {
      this._heldEl = undefined;
    }
    if (crewHeld) { /* giữ nguyên _turretYaw */ }
    else if (trav >= 0.999 || this._turretYaw === undefined) {
      this._turretYaw = targetTurretYaw;
    } else {
      // Vòng bi tháp bị kẹt: quay tay chậm chạp, tháp bị thân xe kéo lệch theo khi xe xoay
      let dy;
      if (rearLimit) {
        const v = Math.atan2(Math.sin(this._turretYaw), Math.cos(this._turretYaw));
        this._turretYaw = Math.max(-yawLim, Math.min(yawLim, v));
      } else if (blindS > 0) this._turretYaw = toU(this._turretYaw);
      dy = targetTurretYaw - this._turretYaw;
      if (!rearLimit) {
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
      }
      const step = 1.6 * trav * dt;
      this._turretYaw += Math.max(-step, Math.min(step, dy));
      // Hướng bắn thật là hướng tháp đang chỉ (không phải hướng lệnh): ghi ngược về azimuth
      if (!this._netProxy) {
        const worldA = -(this._turretYaw + this.bodyAngle) * 180 / Math.PI;
        this.azimuth = ((worldA % 360) + 360) % 360;
      }
    }
    this.turretGroup.rotation.y = this._turretYaw;

    // 14. NÂNG HẠ NÒNG PHÁO 3D THEO ELEVATION (Xe 6 nòng cận chiến nòng cố định ở 0 độ)
    // (bản sao xe của máy khác: góc nòng lấy từ gói mạng, không để máy tính hỏa lực kéo về 0°)
    if (!this.canElevate && !this._netProxy) {
      // Xe 6 nòng: hệ điều khiển hỏa lực tự nâng / hạ nòng nhắm đúng tâm mục tiêu (người lái chỉ xoay tháp)
      let want = 0;
      const T = this.fcsTarget;
      if (T && !this.isDead && this.barrelPivot) {
        const mp = this.barrelPivot.getWorldPosition(new THREE.Vector3());
        const dist = Math.hypot(T.x - mp.x, T.z - mp.z);
        const gMin = (ballistics && ballistics.minElevationFor)
          ? ballistics.minElevationFor(this)
          : (typeof BallisticsSystem3D !== 'undefined' && BallisticsSystem3D.gatlingMinElevation
            ? BallisticsSystem3D.gatlingMinElevation(this)
            : (this.frontId === 'vshield' ? -1.0 : -3.2));
        if (T.el !== undefined && T.el !== null) want = Math.max(gMin, Math.min(60, T.el - this.barrelWorldOffset().el));   // nghiệm đường đạn (vòng / cầu vồng qua vật cản), bù thân xe nghiêng
        else if (dist > 20) want = Math.max(gMin, Math.min(22, Math.atan2(T.y - mp.y, dist) * 180 / Math.PI));
      }
      const step = 45 * dt;
      this.elevation += Math.max(-step, Math.min(step, want - this.elevation));
    }
    // Góc nâng nòng tối đa theo loại pháo (xe tăng bắn thẳng 12°, lựu pháo 85°)
    // (khi bắn cầu vồng vượt vật cản cho phép nâng tới giới hạn cơ khí của giá pháo)
    if (this.canElevate && ballistics && ballistics.maxElevationFor) this.elevation = Math.min(this.elevation, ballistics.maxLobElevationFor ? ballistics.maxLobElevationFor(this) : ballistics.maxElevationFor(this));
    // Lựu pháo trên xe tải: hạ nòng tối đa -5° ra hai bên / phía sau, vắt qua nóc cabin / khoang máy thì tự nâng vượt mọi thứ bên dưới (ballistics.js artyMinElevation)
    // Xe 6 nòng: khối mũi / khiên chữ V chắn -> cung phía trước hạn chế góc hạ nòng (ballistics.js gatlingMinElevation)
    const minElev = (ballistics && ballistics.minElevationFor)
      ? ballistics.minElevationFor(this)
      : (this.tankType === 'GATLING' && typeof BallisticsSystem3D !== 'undefined' && BallisticsSystem3D.gatlingMinElevation
        ? BallisticsSystem3D.gatlingMinElevation(this)
        : (this.tankType === 'GATLING' ? (this.frontId === 'vshield' ? -1.0 : -3.2) : -10));
    if (this.tankType === 'ARTILLERY' || this.tankType === 'GATLING') this.elevation = Math.max(this.elevation, minElev);
    const elRad = (this.elevation * Math.PI) / 180;
    this.barrelPivot.rotation.x = elRad;
    // Nòng pháo không xuyên qua bê tông / ụ đất của cứ điểm: hạ nòng khi chạm trần, tháp dừng ở mép tường
    if (terrain && terrain.barrelBlocked && terrain.nearStronghold && terrain.nearStronghold(this.x, this.z)) this.applyBarrelClearance(terrain);
    // Nòng pháo không xoay / nâng hạ xuyên qua tường bê tông, nhà: chạm mặt tường là tháp dừng lại
    const barrelMoved = Math.abs(this.speed || 0) > 0.1 || Math.abs((this._turretYaw || 0) - prevTurretYaw) > 1e-4 || Math.abs(elRad - prevBarrelEl) > 1e-4;
    if (barrelMoved && terrain && terrain.vehicleObstacles && typeof VehicleCollision !== 'undefined' && !this._netProxy && !this.isDead) this.applyWallBarrelBlock(terrain, prevTurretYaw, prevBarrelEl);
    // Nòng quét / đập vào cảnh vật: rào đổ, thùng rác văng, cột đèn gãy, bao cát rơi, cây non gãy (gameplay/barrel_sweep.js)
    if (barrelMoved && terrain && typeof BarrelSweep !== 'undefined') BarrelSweep.update(this, terrain, dt, prevTurretYaw, prevBarrelEl);

    // 15. CẬP NHẬT THANH MÁU 3D (BILLBOARD CHUẨN: LUÔN HƯỚNG VỀ CAMERA, KHÔNG XOAY THEO THÂN XE HAY THÁP PHÁO)
    const hpU = this.hpBarMesh && this.hpBarMesh.material && this.hpBarMesh.material.uniforms;
    if (hpU && hpU.uHp) {
      // thanh máu shader (tank_models.js): vệt "máu vừa mất" đứng 0.45 s rồi rút dần về mức máu mới
      const r = Math.min(1, hpRatio);
      if (this._hpGhost === undefined || r > this._hpGhost) this._hpGhost = r;
      if (r < hpU.uHp.value - 1e-4) { this._hpGhostHold = 0.45; hpU.uHit.value = 1; }
      if (this._hpGhostHold > 0) this._hpGhostHold -= dt;
      else this._hpGhost = Math.max(r, this._hpGhost - dt * 0.7);
      hpU.uHp.value = r;
      hpU.uGhost.value = this._hpGhost;
      hpU.uHit.value = Math.max(0, hpU.uHit.value - dt * 3);
      hpU.uTime.value = (hpU.uTime.value + dt) % 1000;
    } else if (this.hpBarMesh) {
      this.hpBarMesh.scale.x = hpRatio;
      this.hpBarMesh.position.x = -15 * (1 - hpRatio);
    }

    const activeCam = (window.game && window.game.camera) ? window.game.camera : ((window.artilleryGame && window.artilleryGame.camera) ? window.artilleryGame.camera : null);
    if (this.hpGroup) {
      if (activeCam) {
        this.hpGroup.quaternion.copy(this.group.quaternion).invert().multiply(activeCam.quaternion);
      } else {
        this.hpGroup.rotation.y = -this.bodyAngle;
        this.hpGroup.rotation.x = -0.92;
      }
    } else {
      if (activeCam) {
        const billboardQuat = new THREE.Quaternion().copy(this.group.quaternion).invert().multiply(activeCam.quaternion);
        if (this.hpBgMesh) this.hpBgMesh.quaternion.copy(billboardQuat);
        if (this.hpBarMesh) this.hpBarMesh.quaternion.copy(billboardQuat);
      }
    }

    // 16. CẬP NHẬT KHỐI GIÁP PHẢN ỨNG NỔ 3D
    // Giáp phản ứng nổ nhặt từ hòm tiếp tế: KHÔNG vẽ vòng khiên vàng quay quanh xe nữa (trông như lá chắn phép thuật) —
    // tác dụng chặn 1 phát vẫn giữ; trạng thái hiện trên HUD / nhật ký khi nhặt
    if (this.reactiveArmorMesh) this.reactiveArmorMesh.visible = false;

    if (!this.isPlayer && !this.isRemotePlayer) {
      this.updateAI(dt, terrain, ballistics, radar, allUnits, airdrop, supplyCrates, capturePoints);
    }

    // 17. CẬP NHẬT ĐỘ MỜ BÁN TRONG SUỐT NGỤY TRANG KHI NÚP BỤI RẬM
    this.updateStealthVisual(dt);

    // 18. CẬP NHẬT VÒNG TUA NÒNG & BẮN LIÊN THANH CHO XE TĂNG 6 NÒNG VÀ XE TRINH SÁT
    if (this.tankType === 'GATLING' || this.tankType === 'SCOUT') {
      this.updateGatling(dt, !!this.isFiringGatling, ballistics, radar);
    }

    // 19. CẬP NHẬT TRINH SÁT CHIẾN TRƯỜNG & HỒI CHIÊU TÊN LỬA CHO XE TRINH SÁT
    if (this.tankType === 'SCOUT') {
      this.updateRecon(dt, allUnits, window.gameInstance || null);
    }
  }

  // TẠO VỆT XÍCH XE TRÊN MẶT ĐẤT THEO ĐỘ CAO ĐỊA HÌNH
  spawnTrackMarks(terrain) {
    if (!this.alwaysFX && !SpgFXPool.isNearView(this.x, this.z)) return;
    const markLength = 9;
    const markWidth = 6.2;

    // vệt theo mặt đất: nhựa / bê tông chỉ còn vệt cao su & bụi mờ sẫm xám (xích không cày được mặt cứng); đá sỏi vệt nhạt;
    // bùn hằn sâu sẫm, lâu tan; cát khô vệt sáng nhanh lấp; đất thường nâu
    const soil = terrain.dozerSoil ? terrain.dozerSoil(this.x, this.z) : 'soil';
    const TM = { hard: [0x1c1c1d, 0.22, 8], rock: [0x3a362f, 0.3, 10], mud: [0x1f170e, 0.72, 26], slurry: [0x1f170e, 0.6, 18],
      sand: [0x7a6448, 0.4, 9], wsand: [0x4e3e2a, 0.55, 16], soil: [0x2e271c, 0.55, 14] }[soil] || [0x2e271c, 0.55, 14];
    for (let side of [-16.8, 16.8]) {
      const markMesh = SpgFXPool.acquire(this.scene, 'plane', TM[0], TM[1]);
      markMesh.scale.set(markWidth, 1, markLength);
      const offsetX = Math.cos(this.bodyAngle) * side;
      const offsetZ = -Math.sin(this.bodyAngle) * side;

      const posX = this.x + offsetX;
      const posZ = this.z + offsetZ;
      const posY = terrain.getElevationAt(posX, posZ) + 0.35;

      markMesh.position.set(posX, posY, posZ);
      markMesh.rotation.y = this.bodyAngle;

      this.trackMarks.push({
        mesh: markMesh,
        alpha: TM[1],
        life: TM[2] * TM[1] / 0.55   // (giảm alpha theo dt / life từ mức đầu -> thời gian tồn tại ~TM[2] giây)
      });
    }

    // Giới hạn số lượng vệt xích để giữ mượt 60 FPS
    if (this.trackMarks.length > 50) {
      const oldMark = this.trackMarks.shift();
      SpgFXPool.release(oldMark.mesh);
    }
  }

  updateTrackMarks(dt) {
    for (let i = this.trackMarks.length - 1; i >= 0; i--) {
      const tm = this.trackMarks[i];
      tm.alpha -= dt / tm.life;
      tm.mesh.material.opacity = Math.max(0, tm.alpha);

      if (tm.alpha <= 0) {
        SpgFXPool.release(tm.mesh);
        this.trackMarks.splice(i, 1);
      }
    }
  }

  // HIỆU ỨNG BỤI CÁT CUỘN TRÒN TỪ XÍCH XE THÍCH ỨNG THEO ĐỊA HÌNH
  spawnDustPuff(terrain, wind, isBoosting, terrainInfo = null) {
    if (!this.alwaysFX && !SpgFXPool.isNearView(this.x, this.z)) return;
    if (!this.alwaysFX && SpgFXPool.thin(SpgFXPool.distToPlayer(this.x, this.z))) return;
    const dustMult = terrainInfo ? (terrainInfo.dustMult || 1.0) : 1.0;
    let dustColor = 0xd8ba73; // Mặc định vàng cát
    if (terrainInfo) {
      if (terrainInfo.type === 'MOUNTAIN') dustColor = 0xb8ad9b; // Bụi đá xám nâu
      else if (terrainInfo.type === 'ROAD') dustColor = 0xc4b89d; // Bụi đường đất
    }
    // trời mưa: đất ướt không tung bụi — bùn & nước bị xích / lốp hất lên (spawnMudSpray)
    const wet = !!(terrain && terrain.weather && terrain.weather.rain);
    if (wet) { this.spawnMudSpray(terrain, isBoosting, terrainInfo); return; }

    // bụi tung từ đúng dải xích / bánh sau của từng xe
    const sidesX = this._tt ? [...new Set(this._tt.map(L => L.lx))] : [-16.8, 16.8];
    const backDist = this.speed >= 0 ? 16 : -16;
    const throwBack = (this.speed || 0) * -0.22;
    for (let side of sidesX) {
      const baseSize = (isBoosting ? 8 + Math.random() * 5 : 5.5 + Math.random() * 3.5) * dustMult;
      const a0 = isBoosting ? 0.6 : 0.42;
      const pMesh = SpgFXPool.acquire(this.scene, 'dust', dustColor, a0);
      const offsetX = Math.cos(this.bodyAngle) * side + Math.sin(this.bodyAngle) * backDist;
      const offsetZ = -Math.sin(this.bodyAngle) * side + Math.cos(this.bodyAngle) * backDist;

      pMesh.position.set(this.x + offsetX, this.y + 1.2, this.z + offsetZ);

      this.fxParticles.push({
        mesh: pMesh,
        base: baseSize,
        vx: (wind ? wind.vx * 0.35 : 0) - Math.sin(this.bodyAngle) * throwBack + (Math.random() - 0.5) * 3,
        vy: 2.8 + Math.random() * 3.6,
        vz: (wind ? wind.vz * 0.35 : 0) - Math.cos(this.bodyAngle) * throwBack + (Math.random() - 0.5) * 3,
        scale: 1.0,
        growSpeed: 3.2 + Math.random() * 1.8,
        drag: 2.0,
        alpha: a0,
        life: 0.85 + Math.random() * 0.3
      });
    }
  }

  /**
   * TRỜI MƯA — BÙN NƯỚC XÍCH / LỐP HẤT LÊN (thay cho bụi):
   * - Xe xích: guốc xích vòng qua bánh sao chủ động phía sau văng bùn lỏng ngược ra sau & lên trên, cục bùn dính guốc
   *   rơi lả tả sau đuôi; tốc độ càng cao càng tung cao.
   * - Xe bánh lốp: mỗi lốp kéo theo "đuôi gà" bùn nước phun ngược ra sau chếch lên (rãnh gai lốp vắt nước), lốp trước
   *   tóe sang hai bên; chạy nhanh có màn sương nước mịn bám sau xe.
   * - Mặt cứng (nhựa, bê tông, cầu, đá): chỉ có nước bẩn & sương nước, không có bùn cục. Cát ướt: cát vón thành nắm.
   * - Lăn qua vũng nước (Weather.puddleAt): nước đục tóe mạnh sang hai bên & về trước, vòng sóng loang trên vũng.
   * Hạt dùng lớp hạt của ExplosionFX (giọt / khói) + cục đất 3D (bits): rơi theo trọng lực, nằm lại trên mặt đất.
   */
  spawnMudSpray(terrain, isBoosting, info) {
    const fxs = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null;
    if (!fxs || !fxs.smoke) return;
    const rand = (a, b) => a + Math.random() * (b - a);
    const nq = (w) => Math.floor(w) + (Math.random() < w % 1 ? 1 : 0);
    const a = this.bodyAngle || 0, c = Math.cos(a), s = Math.sin(a);
    const fx = -s, fz = -c;                       // mũi xe
    const sg = this.speed >= 0 ? 1 : -1;          // tiến / lùi: bùn văng ngược hướng chạy
    const v = Math.abs(this.speed) * (this._groundMult || 1);
    const vmax = Math.max(60, this.baseMaxSpeed || 120);
    const k = Math.min(1.6, v / vmax + (isBoosting ? 0.25 : 0));
    const vx = fx * this.speed * (this._groundMult || 1), vz = fz * this.speed * (this._groundMult || 1);
    const type = info && info.type;
    const hard = type === 'URBAN_ROAD' || type === 'BRIDGE' || type === 'MOUNTAIN' || (type === 'ROAD' && /NHỰA/.test(info.name || ''));
    const sandy = type === 'SAND';
    const pal = fxs.surfacePalette ? fxs.surfacePalette(this.x, this.z, 'GROUND') : null;
    const soil = pal ? pal.soil : [0.3, 0.25, 0.18], dark = pal ? pal.dark : [0.1, 0.08, 0.06];
    // bùn ướt: sẫm hơn đất khô nhiều; cát ướt: vàng sẫm; nước bẩn: xám nâu nhạt, trong
    const mud = sandy ? [soil[0] * 0.72, soil[1] * 0.7, soil[2] * 0.66] : [(soil[0] * 0.45 + dark[0] * 0.55), (soil[1] * 0.45 + dark[1] * 0.55), (soil[2] * 0.45 + dark[2] * 0.55)];
    const water = [0.5 + soil[0] * 0.2, 0.5 + soil[1] * 0.2, 0.48 + soil[2] * 0.2];
    const wheels = !!this.wheelSet;
    const lines = this._tt && this._tt.length ? this._tt : [{ lx: -12.4, lz: 0 }, { lx: 12.4, lz: 0 }];
    const T = terrain;
    const W = typeof Weather !== 'undefined' && Weather.puddleAt ? Weather : null;
    for (const L of lines) {
      const out = Math.sign(L.lx || 1);            // phía ngoài thân xe
      const rx = c * out, rz = -s * out;            // hướng ra ngoài (thế giới)
      // điểm tiếp đất của dải xích / bánh: xe xích lấy đuôi dải (bánh sao chủ động), xe bánh lấy đúng tâm bánh
      const lz = wheels ? (L.lz || 0) : sg * 15;
      const px = this.x + c * L.lx + s * lz, pz = this.z - s * L.lx + c * lz;
      const gy = T.getElevationAt(px, pz);
      const puddle = W ? W.puddleAt(T, px, pz) : 0;
      // --- 1. vũng nước: nước đục tóe ra (cả khi chạy chậm) ---
      if (puddle > 0.25) {
        const pk = puddle * (0.4 + Math.min(1.2, v / vmax));
        for (let i = nq(pk * 3.5 * (isBoosting ? 0.5 : 1)); i > 0; i--) {
          const side = rand(4, 22) * pk, fwd = rand(-0.2, 0.7) * v * 0.35;
          fxs.smoke.add({ x: px + rand(-2, 2), y: gy + 0.6, z: pz + rand(-2, 2),
            vx: vx * 0.35 + rx * side + fx * sg * fwd, vy: rand(10, 26) * Math.sqrt(pk), vz: vz * 0.35 + rz * side + fz * sg * fwd,
            size: rand(1.2, 2.6), grow: 2.5, drag: 1.0, grav: 78, life: rand(0.5, 0.9), alpha: 0.6, fadeIn: 0.01, c0: water, cell: 2 });
        }
        if (typeof WadingFX !== 'undefined' && WadingFX.puddleRing && Math.random() < 0.5) WadingFX.puddleRing(this.scene, px, gy + 0.25, pz, pk);
      }
      if (v < 10) continue;
      // --- 2. bùn lỏng / nước bị xích, lốp hất lên ---
      const ox = px + fx * sg * (wheels ? -3 : 0), oz = pz + fz * sg * (wheels ? -3 : 0);
      const oy = gy + (wheels ? 2.2 : 4.5);       // đỉnh lốp sau / bánh sao (~0,5 m)
      // lốp trước chủ yếu tóe sang hai bên (bên dưới); "đuôi gà" chính từ lốp sau. Bứt tốc gọi dày gấp đôi -> mỗi lần nửa số hạt
      const rear = !wheels || (L.lz || 0) * sg > 0;
      const nDrop = rear ? nq((hard ? 2.2 : 3) * k * (wheels ? 1.4 : 1) * (isBoosting ? 0.5 : 1)) : 0;
      for (let i = 0; i < nDrop; i++) {
        // "đuôi gà": ngược ra sau chếch lên ~25-50°, tốc độ ~ một nửa tốc độ xe; xe xích văng rộng hơn sang ngoài
        const back = v * rand(0.3, wheels ? 0.75 : 0.5), up = rand(8, 18) + v * rand(0.05, wheels ? 0.2 : 0.12), lat = rand(-2, wheels ? 4 : 7);
        fxs.smoke.add({ x: ox + rand(-1.5, 1.5), y: oy, z: oz + rand(-1.5, 1.5),
          vx: vx - fx * sg * back + rx * lat, vy: up, vz: vz - fz * sg * back + rz * lat,
          size: hard ? rand(0.8, 1.6) : rand(0.5, 1.3), grow: hard ? 1.6 : 0.2, drag: hard ? 1.4 : 0.5, grav: 78, life: rand(0.45, 0.8),
          alpha: hard ? 0.45 : 0.9, fadeIn: 0.01, c0: hard ? water : mud, cell: 2 });
      }
      // lốp trước / đầu dải xích tóe sang hai bên
      if (!rear && !hard) {
        for (let i = nq(1.2 * k); i > 0; i--) {
          fxs.smoke.add({ x: px + rx * 1.5, y: gy + 0.8, z: pz + rz * 1.5, vx: vx * 0.6 + rx * rand(6, 16), vy: rand(5, 12), vz: vz * 0.6 + rz * rand(6, 16),
            size: rand(0.4, 0.9), grow: 0.2, drag: 0.5, grav: 78, life: rand(0.35, 0.6), alpha: 0.85, fadeIn: 0.01, c0: mud, cell: 2 });
        }
      }
      // --- 3. cục bùn / nắm cát ướt dính guốc xích rơi lả tả sau đuôi (không có trên mặt cứng) ---
      if (rear && !hard && fxs.bits && Math.random() < (wheels ? 0.18 : 0.4) * Math.min(1, k + 0.3) * (isBoosting ? 0.5 : 1)) {
        const back = v * rand(0.05, 0.3), tone = rand(0.8, 1.1);
        fxs.bits.add({ x: ox, y: oy + 1, z: oz, vx: vx * 0.6 - fx * sg * back + rx * rand(-2, 5), vy: rand(4, 12), vz: vz * 0.6 - fz * sg * back + rz * rand(-2, 5),
          size: rand(0.18, 0.45), life: 4, restLife: rand(25, 45), raw: true, e: 0.05, slide: false, c: [mud[0] * tone, mud[1] * tone, mud[2] * tone] });
      }
      // --- 4. sương nước mịn sau lốp khi chạy nhanh (đường cứng / xe bánh lốp rõ nhất) ---
      if (rear && (wheels || hard) && k > 0.45 && Math.random() < (k - 0.35) * (hard ? 0.9 : 0.5) * (isBoosting ? 0.5 : 1)) {
        fxs.smoke.add({ x: ox - fx * sg * 4, y: gy + 2.5, z: oz - fz * sg * 4, vx: vx * 0.5 - fx * sg * v * 0.1, vy: rand(1, 4), vz: vz * 0.5 - fz * sg * v * 0.1,
          size: rand(4, 7), grow: 7, drag: 1.6, grav: -0.5, life: rand(0.8, 1.4), alpha: 0.16, fadeIn: 0.08, c0: [0.78, 0.8, 0.8], cell: 0, floor: false });
      }
    }
  }

  // HIỆU ỨNG KHÓI ỐNG XẢ DIESEL PHỤT RA TỪ ĐUÔI XE (KHI LEO DỐC NẶNG KHÓI ĐEN DÀY)
  spawnExhaustPuff(isBoosting, isHeavyLoad = false) {
    if (!SpgFXPool.isNearView(this.x, this.z, 900)) return;
    if (!this.alwaysFX && SpgFXPool.thin(SpgFXPool.distToPlayer(this.x, this.z))) return;
    const size = (isBoosting || isHeavyLoad) ? 3.6 + Math.random() * 2.2 : 2.0 + Math.random() * 1.2;
    // Khói diesel xốp mềm tự nhiên thay vì bọc cầu thô cứng. Tuabin khí cháy sạch: khí xả nóng gần trong suốt, xám nhạt;
    // hybrid chạy điện lúc nhẹ tải nên khói mỏng hơn
    const turb = this.engineId === 'turbine', hyb = this.engineId === 'hybrid';
    const pMesh = SpgFXPool.acquire(
      this.scene, 'smoke',
      turb ? 0x8a8c8e : isHeavyLoad ? 0x242629 : (isBoosting ? 0x35383e : 0x4a4e57),
      ((isBoosting || isHeavyLoad) ? 0.65 : 0.38) * (turb ? 0.35 : hyb ? 0.7 : 1)
    );
    const pipeWorld = new THREE.Vector3();
    const pipe = Math.random() > 0.5 ? this.exhaustLeft : this.exhaustRight;
    pipe.getWorldPosition(pipeWorld);

    pMesh.position.copy(pipeWorld);

    this.fxParticles.push({
      mesh: pMesh,
      base: size,
      vx: (Math.random() - 0.5) * 4,
      vy: isBoosting ? 13.0 : 7.5,
      vz: (Math.random() - 0.5) * 4 + 4,
      scale: 1.0,
      alpha: (isBoosting || isHeavyLoad) ? 0.65 : 0.38,
      growSpeed: 2.8,
      rotSpeed: (Math.random() - 0.5) * 1.4,
      drag: 1.5,
      life: isBoosting ? 0.8 : 0.6
    });

    // Khi bứt tốc hành quân: Phụt kèm vài tàn lửa nhỏ
    if (isBoosting && Math.random() < 0.4) {
      const sparkMesh = SpgFXPool.acquire(this.scene, 'sphereLow', 0xff7700, 1.0);
      sparkMesh.position.copy(pipeWorld);

      this.fxParticles.push({
        mesh: sparkMesh,
        base: 0.7,
        vx: (Math.random() - 0.5) * 12,
        vy: 10 + Math.random() * 10,
        vz: (Math.random() - 0.5) * 12,
        scale: 1.0,
        alpha: 1.0,
        life: 0.35
      });
    }
  }

  // HIỆU ỨNG KHÓI NÒNG BỐC LÊN TỰ NHIÊN SAU KHI BẮN
  spawnBarrelSmokePuff(wind) {
    if (!this.alwaysFX && !SpgFXPool.isNearView(this.x, this.z)) return;
    // Lớp hạt GPU dùng chung (gió tự cuốn theo): nòng nguội dần -> khói rỉ ra mỏng dần
    const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null;
    if (fx && fx.smoke && this.barrelGroup && this.muzzleTipLocal) {
      const M = this.getMuzzleWorldTransform(), p = M.position, d = M.direction, R = Math.random;
      const k = Math.min(1, Math.max(0, this.barrelSmokeTimer / 2.5));
      const arty = this.tankType === 'ARTILLERY';
      let x = p.x, y = p.y, z = p.z, vx = d.x * 2.5, vz = d.z * 2.5;
      // pháo tự hành: khói rỉ cả từ hai khe thoát khí mang cá của loa hãm lùi
      if (arty && R() < 0.55) {
        const s = R() < 0.5 ? -1 : 1, sd = new THREE.Vector3(1, 0, 0).applyQuaternion(this.barrelGroup.getWorldQuaternion(new THREE.Quaternion()));
        x += d.x * -3.2 + sd.x * s * 1.8; y += d.y * -3.2 + sd.y * s * 1.8; z += d.z * -3.2 + sd.z * s * 1.8;
        vx = sd.x * s * 2.2; vz = sd.z * s * 2.2;
      }
      const g = 0.7 + R() * 0.12;
      fx.smoke.add({ x, y, z, vx: vx + (R() - 0.5) * 1.5, vy: 2.5 + R() * 3, vz: vz + (R() - 0.5) * 1.5,
        size: (1.1 + R() * 0.8) * (arty ? 1.3 : 1), grow: 3.2, drag: 1.2, grav: -2.5, life: 1.4 + R(), alpha: 0.28 * (0.35 + 0.65 * k), fadeIn: 0.08,
        c0: [g, g, g * 0.97], c1: [g * 1.08, g * 1.08, g * 1.06], cell: 0, floor: false });
      return;
    }
    // Khói tàn bốc lên: màu xám bạc mờ trong suốt, viền xốp mềm bồng bềnh
    const pMesh = SpgFXPool.acquire(this.scene, 'smoke', 0xcad2dc, 0.28);
    const tipWorld = new THREE.Vector3();
    this.barrelGroup.localToWorld(tipWorld.copy(this.muzzleTipLocal));

    const arty = this.tankType === 'ARTILLERY';
    const sideDir = new THREE.Vector3(1, 0, 0);
    if (this.barrelGroup) {
      sideDir.applyQuaternion(this.barrelGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
    }

    // Với pháo tự hành: khói rỉ từ cả miệng nòng lẫn hai khe thoát khí mang cá hai bên
    if (arty && Math.random() < 0.55) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const muzzle = this.getMuzzleWorldTransform();
      const fireDir = muzzle.direction;
      const slotPos = tipWorld.clone().addScaledVector(fireDir, -3.2).addScaledVector(sideDir, side * 1.8);
      pMesh.position.copy(slotPos);
      this.fxParticles.push({
        mesh: pMesh,
        base: 2.2,
        vx: (wind ? wind.vx * 0.4 : 0) + sideDir.x * side * 2.2,
        vy: 3.5 + Math.random() * 2.2,
        vz: (wind ? wind.vz * 0.4 : 0) + sideDir.z * side * 2.2,
        scale: 1.0,
        alpha: 0.26,
        growSpeed: 2.0,
        rotSpeed: (Math.random() - 0.5) * 0.9,
        drag: 1.2,
        life: 1.2
      });
      return;
    }

    pMesh.position.copy(tipWorld);

    this.fxParticles.push({
      mesh: pMesh,
      base: 2.4,
      vx: wind ? wind.vx * 0.4 : 0,
      vy: 4.2 + Math.random() * 2.8,
      vz: wind ? wind.vz * 0.4 : 0,
      scale: 1.0,
      alpha: 0.28,
      growSpeed: 2.2,
      rotSpeed: (Math.random() - 0.5) * 0.8,
      drag: 1.2,
      life: 1.1
    });
  }

  /**
   * Khai hỏa pháo chính (120 mm nòng trơn / lựu pháo 155 mm có hãm lùi):
   * - Ngọn lửa: rig dựng sẵn của scene (SpgFXPool.flashRig) — lưỡi lửa có thớ, chớp vài ms, mỗi phát một dáng
   * - Cầu lửa thứ cấp, sóng nổ đầu nòng (khúc xạ + rạp cỏ + vành bụi), khói thuốc phóng, vòng khói xoáy, bụi đất, tàn
   *   thuốc phóng, đèn chớp: lớp hạt GPU dùng chung của ExplosionFX (muzzleBlast) — 1 lượt vẽ cho cả nghìn hạt, trôi theo
   *   gió, thưa dần theo khoảng cách. Trước đây ~40-60 Sprite riêng mỗi phát (mỗi cái 1 lượt vẽ trong suốt)
   * - Cảnh không có ExplosionFX: đèn chớp + khói / bụi bằng Sprite như cũ
   */
  spawnMuzzleBlast(tipWorld, fireDir) {
    if (!this.alwaysFX && !SpgFXPool.isNearView(this.x, this.z)) return;
    const arty = this.tankType === 'ARTILLERY';
    const k = arty ? 1.45 : 1.0;

    // Vector phương ngang của cụm nòng pháo trong không gian thế giới
    const sideDir = new THREE.Vector3(1, 0, 0);
    if (this.barrelGroup) {
      sideDir.applyQuaternion(this.barrelGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
    } else {
      sideDir.crossVectors(fireDir, new THREE.Vector3(0, 1, 0)).normalize();
    }

    const rig = SpgFXPool.flashRig(this.scene);
    if (rig) SpgFXPool.fireFlashRig(rig, tipWorld, fireDir, sideDir, { k, brake: arty });
    const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null;
    if (fx && fx.muzzleBlast) {
      fx.muzzleBlast(tipWorld, fireDir, { k, brake: arty, side: sideDir });
      return;
    }

    // Đèn chớp tái sử dụng từ bể đèn của scene
    const light = SpgFXPool.muzzleLight(this.scene);
    if (light) {
      light.position.copy(tipWorld);
      light.color.setHex(0xffb066);
      light.distance = arty ? 320 : 220;
      let lt = 0;
      const lLife = 0.12, claim = light.userData.claim;
      light.intensity = 5.0 * k;
      this.fxParticles.push({
        update: (dt) => {
          lt += dt;
          if (light.userData.claim !== claim) return false;   // đèn đã bị nơi khác lấy
          light.intensity = Math.max(0, 5.0 * k * (1 - lt / lLife));
          return lt < lLife;
        },
        dispose: () => { if (light.userData.claim === claim) light.intensity = 0; }
      });
    }

    // Đám khói cuộn xốp mềm phụt về phía trước, bung nở bồng bềnh
    const smokeCount = arty ? 16 : 10;
    for (let i = 0; i < smokeCount; i++) {
      const sp = (14 + Math.random() * 40) * k;
      // Màu khói thuốc phóng ấm tự nhiên: xám tro pha chút vàng nhạt của khí nổ
      const c = Math.random() < 0.4 ? 0xbaaFA4 : (Math.random() < 0.7 ? 0x9e9588 : 0x867c6f);
      const m = SpgFXPool.acquire(this.scene, 'smoke', c, 0.45);
      m.position.copy(tipWorld).addScaledVector(fireDir, (2 + Math.random() * 10) * k);
      this.fxParticles.push({
        mesh: m,
        base: (3.2 + Math.random() * 2.8) * k,
        vx: fireDir.x * sp + (Math.random() - 0.5) * 12,
        vy: fireDir.y * sp + 2.5 + Math.random() * 6,
        vz: fireDir.z * sp + (Math.random() - 0.5) * 12,
        scale: 1.0,
        alpha: 0.45,
        growSpeed: 3.8 + Math.random() * 2.2,
        rotSpeed: (Math.random() - 0.5) * 1.8,
        drag: 2.2,
        life: 1.5 + Math.random() * 1.1
      });
    }

    // Pháo tự hành: 2 luồng khói phản lực cực mạnh xì sang hai bên từ loa hãm lùi 2 tầng (chếch lùi về sau ~16 độ)
    if (arty) {
      const sideSmokeCount = 9;
      const brakeOrigin = tipWorld.clone().addScaledVector(fireDir, -3.2);
      for (const side of [-1, 1]) {
        // Hướng xì khói: sang hai bên và hơi ngả về sau để triệt tiêu lực giật nòng
        const jetDir = sideDir.clone().multiplyScalar(side).addScaledVector(fireDir, -0.28).normalize();
        for (let j = 0; j < sideSmokeCount; j++) {
          const sp = 28 + Math.random() * 36; // Vận tốc phụt ngang rất cao
          const c = Math.random() < 0.5 ? 0xb5ad9e : 0x93897b;
          const m = SpgFXPool.acquire(this.scene, 'smoke', c, 0.48);
          // Điểm xuất phát ở khe mang cá của loa hãm lùi
          const startPos = brakeOrigin.clone().addScaledVector(sideDir, side * (1.6 + Math.random() * 1.2));
          m.position.copy(startPos);
          this.fxParticles.push({
            mesh: m,
            base: (3.0 + Math.random() * 2.4) * k,
            vx: jetDir.x * sp + (Math.random() - 0.5) * 8,
            vy: jetDir.y * sp + 2.0 + Math.random() * 5,
            vz: jetDir.z * sp + (Math.random() - 0.5) * 8,
            scale: 1.0,
            alpha: 0.48,
            growSpeed: 4.2 + Math.random() * 2.5,
            rotSpeed: (Math.random() - 0.5) * 2.2,
            drag: 2.4,
            life: 1.6 + Math.random() * 1.0
          });
        }
      }
    }

    // Bụi đất mặt đất bị sóng nổ thổi tung quanh điểm dưới miệng nòng
    const groundY = this.y + 1.5;
    const height = tipWorld.y - groundY;
    if (height < 45) {
      const dustCount = arty ? 12 : 8;
      const gx = tipWorld.x + fireDir.x * 8, gz = tipWorld.z + fireDir.z * 8;
      for (let i = 0; i < dustCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (14 + Math.random() * 26) * k;
        const m = SpgFXPool.acquire(this.scene, 'dust', 0xa89476, 0.35);
        m.position.set(gx + Math.cos(a) * 4, groundY, gz + Math.sin(a) * 4);
        this.fxParticles.push({
          mesh: m,
          base: (3.0 + Math.random() * 2.6) * k,
          vx: Math.cos(a) * sp + fireDir.x * 12,
          vy: 1.8 + Math.random() * 3,
          vz: Math.sin(a) * sp + fireDir.z * 12,
          scale: 1.0,
          alpha: 0.35 * (1 - height / 60),
          growSpeed: 2.8,
          rotSpeed: (Math.random() - 0.5) * 1.2,
          drag: 1.6,
          life: 1.6 + Math.random() * 1.0
        });
      }
    }


  }

  /**
   * Lực giật đẩy thân xe NGƯỢC hướng nòng: bắn về trước thì xe ngửa ra sau (đuôi nhún),
   * bắn sang ngang thì xe nghiêng sang phía đối diện, rồi dao động tắt dần trên hệ treo.
   * (Trước đây trừ thẳng 0.22 rad vào độ chúi -> xe cắm đầu xuống ~12° mỗi phát.)
   */
  kickRecoil(strength) {
    const yaw = this.turretGroup ? this.turretGroup.rotation.y : 0;
    // Lực giật dọc trục nòng: thành phần ngang làm xe ngửa / nghiêng theo hướng tháp,
    // thành phần thẳng đứng (nòng ngóc cao) ép thân xe lún xuống hệ treo; tháp đặt lệch sau / trước
    // tạo thêm mô-men chúi theo vị trí tháp trên thân
    const el = this.barrelPivot ? this.barrelPivot.rotation.x : (this.elevation || 0) * Math.PI / 180;
    const zOff = this.turretGroup ? this.turretGroup.position.z : 0;
    const horiz = Math.cos(el), vert = Math.sin(el);
    this.rockVelP += strength * (horiz * Math.cos(yaw) + vert * zOff / 22);
    this.rockVelR -= strength * horiz * Math.sin(yaw) + strength * vert * (this.turretGroup ? this.turretGroup.position.x : 0) / 22;
    this.rockVelH = (this.rockVelH || 0) + strength * vert * 7;
  }

  updateRecoilRock(dt) {
    const k = 140, c = 13; // ~1.9 Hz, hệ số tắt dần 0.55
    let remain = Math.min(dt, 0.1);
    while (remain > 0) {
      const h = Math.min(remain, 0.016);
      this.rockVelP += (-k * this.rockPitch - c * this.rockVelP) * h;
      this.rockPitch += this.rockVelP * h;
      this.rockVelR += (-k * this.rockRoll - c * this.rockVelR) * h;
      this.rockRoll += this.rockVelR * h;
      this.rockVelH = (this.rockVelH || 0) + (-k * (this.rockHeave || 0) - c * (this.rockVelH || 0)) * h;
      this.rockHeave = (this.rockHeave || 0) + this.rockVelH * h;
      remain -= h;
    }
  }

  // HIỆU ỨNG HỎNG HÓC: KHÓI ĐỘNG CƠ & NGỌN LỬA CHÁY
  spawnDamageSmokeAndFire(hpRatio) {
    if (!this.alwaysFX && !SpgFXPool.isNearView(this.x, this.z)) return;
    const pipeWorld = new THREE.Vector3();
    this.hullMainMesh.getWorldPosition(pipeWorld);
    pipeWorld.y += 6;
    pipeWorld.z += 12;

    // Khói động cơ bốc lên: màu xám đen xốp mềm tự nhiên
    const smokeSize = (hpRatio < 0.3) ? 3.6 + Math.random() * 2.2 : 2.4 + Math.random() * 1.5;
    const smokeCol = Math.random() < 0.5 ? 0x3d4148 : 0x4e5561;
    const smokeMesh = SpgFXPool.acquire(this.scene, 'smoke', smokeCol, 0.52);
    smokeMesh.position.set(
      pipeWorld.x + (Math.random() - 0.5) * 4,
      pipeWorld.y + 1,
      pipeWorld.z + (Math.random() - 0.5) * 4
    );

    this.fxParticles.push({
      mesh: smokeMesh,
      base: smokeSize,
      vx: (Math.random() - 0.5) * 3,
      vy: 8.5 + Math.random() * 4,
      vz: (Math.random() - 0.5) * 3,
      scale: 1.0,
      alpha: 0.52,
      growSpeed: 2.6,
      rotSpeed: (Math.random() - 0.5) * 1.2,
      drag: 1.1,
      life: 1.3
    });

    // Ngọn lửa bùng cháy khi máu dưới 30%
    if (hpRatio < 0.3) {
      const fireSize = 2.0 + Math.random() * 1.6;
      const fireMesh = SpgFXPool.acquire(this.scene, 'smoke', Math.random() > 0.5 ? 0xff5500 : 0xffaa00, 0.85);
      fireMesh.position.set(
        pipeWorld.x + (Math.random() - 0.5) * 3,
        pipeWorld.y + 1.2,
        pipeWorld.z + (Math.random() - 0.5) * 3
      );

      this.fxParticles.push({
        mesh: fireMesh,
        base: fireSize,
        vx: (Math.random() - 0.5) * 4,
        vy: 11.0 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 4,
        scale: 1.0,
        alpha: 0.85,
        growSpeed: 3.5,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        drag: 1.4,
        life: 0.45
      });
    }
  }

  // HIỆU ỨNG XÁC XE CHÁY BỐC KHÓI SAU KHI TIÊU DIỆT
  updateWreckFX(dt) {
    if (Math.random() < 0.35 && SpgFXPool.isNearView(this.x, this.z)) {
      const wreckSize = 3.6 + Math.random() * 2.4;
      const wreckCol = Math.random() < 0.5 ? 0x27292d : 0x383c44;
      const wreckSmoke = SpgFXPool.acquire(this.scene, 'smoke', wreckCol, 0.55);
      wreckSmoke.position.set(
        this.x + (Math.random() - 0.5) * 8,
        this.y + 8,
        this.z + (Math.random() - 0.5) * 8
      );

      this.fxParticles.push({
        mesh: wreckSmoke,
        base: wreckSize,
        vx: (Math.random() - 0.5) * 3,
        vy: 9.0 + Math.random() * 5,
        vz: (Math.random() - 0.5) * 3,
        scale: 1.0,
        alpha: 0.55,
        growSpeed: 2.8,
        rotSpeed: (Math.random() - 0.5) * 1.1,
        drag: 1.2,
        life: 1.5
      });
    }
  }

  /**
   * NGẬP NƯỚC: nước sâu hơn wadeMax tràn vào khoang -> xe tụt máu dần (càng ngập sâu càng nhanh), lội ra chỗ nông là hết.
   * Mất ~3%/s máu tối đa ngay mép ngập, tới ~8%/s khi ngập sâu thêm 1 m. Chỉ máy chủ quyền của xe tính (nguồn WATER, netcode.js)
   */
  updateSubmerged(dt, wDepth) {
    const M = this.wadeMax || 14;
    this.submerged = wDepth > M;
    if (!this.submerged) { this._drownDmg = 0; return; }
    const k = Math.min(1, (wDepth - M) / 8);
    this._drownDmg = (this._drownDmg || 0) + (this.maxHp || 3) * (0.03 + 0.05 * k) * dt;
    // gộp ~0.25 s một lần trừ máu (đỡ gửi mạng từng khung hình)
    if (this._drownDmg >= 0.05) {
      const amt = this._drownDmg;
      this._drownDmg = 0;
      this.takeDamage(amt, null, 'WATER');
    }
  }

  // Hệ số tốc độ khi lội nước theo độ sâu: nước nông chậm vừa, tới mức lội của xe ~một nửa,
  // quá mức lội (ngập, đang tụt máu) chỉ còn bò
  wadeSpeedMult(depth) {
    const W = this.wadeDepth || 10, M = this.wadeMax || 14;
    if (depth <= W) return 0.82 - 0.44 * Math.pow(Math.max(0, depth) / W, 1.1);
    return 0.38 - 0.24 * Math.min(1, (depth - W) / Math.max(1, M - W));
  }

  // CẬP NHẬT TẤT CẢ HẠT HIỆU ỨNG 3D
  updateFXParticles(dt) {
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      if (p.update) {
        if (!p.update(dt)) {
          if (p.dispose) p.dispose();
          this.fxParticles.splice(i, 1);
        }
        continue;
      }

      // Lực cản không khí giúp khói cuộn chậm dần tự nhiên
      const drag = p.drag || 1.6;
      const decay = Math.exp(-drag * dt);
      p.vx = (p.vx || 0) * decay;
      p.vz = (p.vz || 0) * decay;
      p.vy = (p.vy || 0) * (decay * 0.9 + 0.1);

      p.mesh.position.x += (p.vx || 0) * dt;
      p.mesh.position.y += (p.vy || 0) * dt;
      p.mesh.position.z += (p.vz || 0) * dt;

      // Bung nở thể tích mềm mịn
      p.scale += dt * (p.growSpeed || 2.8);
      p.alpha -= dt / p.life;
      const s = p.scale * (p.base || 1);
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = Math.max(0, p.alpha);

      // Tự xoay góc texture mượt mà
      if (p.rotSpeed && p.mesh.material && p.mesh.material.rotation !== undefined) {
        p.mesh.material.rotation += p.rotSpeed * dt;
      }

      if (p.alpha <= 0) {
        if (p.mesh.userData.fxKind) {
          SpgFXPool.release(p.mesh);
        } else {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
        }
        this.fxParticles.splice(i, 1);
      }
    }
  }

  // LÁI XE TỰ ĐỘNG XOAY THÂN XE THEO HƯỚNG PHÍM BẤM
  // Tốc độ quay tháp / nâng nòng (độ/giây) theo loại xe: tháp nặng quay chậm, giá súng máy trinh sát quay nhanh
  // Tốc độ quay tháp / nâng nòng (độ/giây): xe tăng 120mm truyền động điện đời mới (360° trong ~6.5 s), tháp 30mm điện
  // kiểu pháo phòng không, pháo 155mm tự hành nặng, trạm súng máy điều khiển từ xa — nhỉnh hơn số liệu xe thật ~1.3 lần
  // cho tay ngắm đỡ ì (âm thanh mô-tơ tháp / bơm nòng trong src/core/audio/turret_drives.js lấy maxR theo đúng các số này)
  turretRates() {
    const R = { ALL_ROUNDER: [55, 30], GATLING: [80, 55], ARTILLERY: [28, 14], SCOUT: [100, 60] }[this.tankType] || [55, 30];
    return { traverse: R[0], elevate: R[1] };
  }

  // Lệnh ngắm: tháp tự quay dần tới hướng az (độ) và nâng nòng tới el (độ, bỏ qua nếu không truyền)
  aimTo(az, el) {
    this.aimAz = ((az % 360) + 360) % 360;
    this.aimEl = el === undefined || el === null ? undefined : el;
  }

  /**
   * ĐỘNG CƠ TĂNG TỐC (ô ĐỘNG CƠ — Equipment: u.engineSpec { spd, acc, heat, spool }): máy nguyên bản không tăng tốc được.
   * Giữ Shift khi đang chạy: công suất lên dần theo spool (tuabin trễ, mô-tơ điện tức thì), máy nóng dần (heat giây tới
   * 100%), nhả nguội nhanh gấp đôi. Quá nhiệt: khóa tăng tốc tới khi nguội dưới 35% (còi báo, khói nắp máy). Máy hư mất
   * nửa công suất tăng tốc, hỏng nặng thì không tăng tốc. Bot tự nhả ga khi máy nóng ~85%.
   * Trả về hệ số { s: tốc độ tối đa, a: gia tốc } — gọi đúng 1 lần mỗi khung hình (move / steer)
   */
  engineBoost(want, dt) {
    const E = this.engineSpec, S = this._eng || (this._eng = { heat: 0, lock: false, lvl: 0 });
    if (!E || !(dt > 0)) { S.lvl = 0; S.on = false; return SPG_EB_NONE; }
    const dmgE = this.dmg ? this.dmg.engine || 0 : 0;
    if (this.botAI && !this.isPlayer) {
      if (S.heat > 0.85) S.botRest = true; else if (S.heat < 0.45) S.botRest = false;
      if (S.botRest) want = false;
    }
    const on = !!want && !S.lock && dmgE < 2;
    S.on = on;
    const tgt = on ? 1 : 0;
    const rate = tgt > S.lvl ? 1 / Math.max(0.04, E.spool) : 4;
    S.lvl += Math.max(-rate * dt, Math.min(rate * dt, tgt - S.lvl));
    if (on) S.heat = Math.min(1, S.heat + dt / E.heat);
    else S.heat = Math.max(0, S.heat - dt * 2 / E.heat);
    if (!S.lock && S.heat >= 1) {
      S.lock = true;
      if (this.isPlayer) {
        const G = window.game, SE = window.soundEngine;
        if (G && G.addCombatLog) G.addCombatLog('[[temperature]] ĐỘNG CƠ QUÁ NHIỆT — nhả ga chờ máy nguội mới tăng tốc lại được!', 'alert');
        if (SE && SE.playEngineOverheat) SE.playEngineOverheat(true);
      }
    } else if (S.lock && S.heat < 0.35) {
      S.lock = false;
      if (this.isPlayer) {
        const G = window.game, SE = window.soundEngine;
        if (G && G.addCombatLog) G.addCombatLog('[[temperature]] Động cơ đã nguội — tăng tốc lại được', 'tip');
        if (SE && SE.playEngineOverheat) SE.playEngineOverheat(false);
      }
    }
    // quá nhiệt: hơi nóng / khói nhạt phụt từ lưới tản nhiệt nắp máy
    if (S.lock && Math.random() < dt * 6 && this.spawnExhaustPuff) this.spawnExhaustPuff(false, true);
    const m = dmgE === 1 ? 0.5 : 1;
    const R = S.out || (S.out = { s: 1, a: 1 });   // ô nhớ dùng lại (chỉ đọc ngay trong move / steer)
    R.s = 1 + (E.spd - 1) * S.lvl * m; R.a = 1 + (E.acc - 1) * S.lvl * m;
    return R;
  }

  steer(inputX, inputZ, dt, isBoost = false) {
    if (this.isDead) return;

    // Hệ số gia tăng tốc độ nếu đang có Item tăng tốc độ di chuyển
    const hasSpeedItem = (this.speedBoostTimer > 0);
    const speedItemMult = hasSpeedItem ? 1.65 : 1.0;

    // Tăng tốc (Shift) chỉ khi lắp động cơ mới (ô ĐỘNG CƠ) — có nhiệt động cơ (engineBoost)
    const EB = this.engineBoost(isBoost && (inputX !== 0 || inputZ !== 0), dt);
    const maxSpd = this.baseMaxSpeed * EB.s * speedItemMult;
    const accel = this.acceleration * EB.a * speedItemMult;

    // Xe bánh lốp không quay tại chỗ được: lái theo bán kính quay vòng, tự lùi / tiến vòng cung để quay đầu
    if (this.isWheeled) { this.steerWheeled(inputX, inputZ, dt, maxSpd, accel); return; }

    // XÍCH ĐỨT (VehicleDamage: dmg.trackTimer[0 trái | 1 phải] > 0 trong lúc chờ nối) — xem steerBrokenTrack
    const TT = this.dmg && this.dmg.trackTimer;
    const brokeL = !!(TT && TT[0] > 0), brokeR = !!(TT && TT[1] > 0);
    if (brokeL || brokeR) { this.steerBrokenTrack(inputX, inputZ, dt, brokeL, brokeR); return; }

    // XE XÍCH: hai dải xích chạy ngược chiều -> xoay tại chỗ được
    const maxTurn = this.turnRate * (this._dozerTurnK || 1);   // lưỡi ủi tì đống đất: quay ì (game.js updateDig)
    const turnAccel = maxTurn * 5;   // quán tính quay: đạt tốc độ quay tối đa sau ~0.2 s
    this.yawRate = this.yawRate || 0;

    if (inputX !== 0 || inputZ !== 0) {
      // Góc mục tiêu tương ứng chuẩn với hướng phím bấm trên màn hình
      const targetAngle = Math.atan2(-inputX, -inputZ);

      let angleDiff = targetAngle - this.bodyAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Góc bẻ lái bánh xe theo mức độ đánh lái
      this.steerInput = Math.max(-1.0, Math.min(1.0, angleDiff / 0.6));

      // Tốc độ quay thân bám theo góc lệch (chậm dần khi gần đúng hướng -> vào hướng mượt, không giật / vọt quá)
      const wantRate = Math.max(-maxTurn, Math.min(maxTurn, angleDiff * 6));
      const dr = wantRate - this.yawRate, ms = turnAccel * dt;
      this.yawRate += Math.max(-ms, Math.min(ms, dr));
      const step = this.yawRate * dt;
      if (Math.abs(step) >= Math.abs(angleDiff) && Math.sign(step) === Math.sign(angleDiff)) {
        this.bodyAngle = targetAngle;
        this.yawRate = angleDiff / Math.max(dt, 1e-4) * 0.5;
      } else {
        this.bodyAngle += step;
      }

      // Tăng ga theo độ thẳng hướng: đang quay gắt thì đi chậm (xe xích gần như xoay tại chỗ)
      const alignment = Math.max(0.3, Math.cos(angleDiff));
      const targetSpeed = maxSpd * alignment;
      if (this.speed < targetSpeed) {
        // lực kéo lớn lúc khởi hành, giảm dần khi gần tốc độ tối đa (như xe thật)
        const fall = 1 - 0.6 * Math.max(0, Math.min(1, this.speed / Math.max(1, maxSpd)));
        this.speed = Math.min(targetSpeed, this.speed + accel * fall * dt);
      } else {
        // giảm tốc khi vào cua gắt êm hơn tăng tốc (không khựng)
        this.speed = Math.max(targetSpeed, this.speed - accel * 0.8 * dt);
      }
    } else {
      this.steerInput = 0;
      // Nhả lái: thân xe hết quán tính quay nhanh, không xoay tiếp
      const ms = turnAccel * 1.4 * dt;
      this.yawRate -= Math.max(-ms, Math.min(ms, this.yawRate));
      this.bodyAngle += this.yawRate * dt;
      // Khi nhả ga: trôi rồi dừng (trước hãm gấp 3 lần gia tốc -> xe khựng lại như đâm tường)
      const brake = accel * 2.0 * dt;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - brake);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + brake);
      }
    }
  }

  // Xe xích đứt xích: đứt cả 2 dải -> nằm im (chỉ trôi nốt quán tính); đứt 1 dải -> dải còn lại kéo một mình, xe không chạy
  // thẳng được mà chỉ xoay quanh dải đứt (bánh dẫn của dải đứt thành trục): dải lành tiến -> thân quay về phía bên đứt, tâm
  // xe nhích tới theo cung; dải lành lùi -> quay ra phía kia, tâm xe lùi. Vận tốc tâm = tốc độ quay x nửa khoảng cách 2 dải
  steerBrokenTrack(inputX, inputZ, dt, brokeL, brokeR) {
    const clamp = (v, k) => Math.max(-k, Math.min(k, v));
    this.yawRate = this.yawRate || 0;
    if (brokeL && brokeR) {
      this.steerInput = 0;
      this.yawRate -= clamp(this.yawRate, this.turnRate * 7 * dt);
      this.bodyAngle += this.yawRate * dt;
      this.speed -= clamp(this.speed, this.acceleration * 2.5 * dt);
      return;
    }
    const half = this.trackSystem && this.trackSystem.sidesX ? Math.abs(this.trackSystem.sidesX[1]) : 12;
    // quay trái (yaw tăng) = dải phải chạy tiến: dải trái đứt -> yaw dương đi kèm tâm xe tiến
    const dirK = brokeL ? 1 : -1;
    const maxTurn = this.turnRate * 0.5;
    let want = 0;
    if (inputX !== 0 || inputZ !== 0) {
      let diff = Math.atan2(-inputX, -inputZ) - this.bodyAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.steerInput = clamp(diff / 0.6, 1);
      want = clamp(diff * 4, maxTurn);
    } else this.steerInput = 0;
    this.yawRate += clamp(want - this.yawRate, this.turnRate * 3 * dt);
    this.bodyAngle += this.yawRate * dt;
    this.speed = this.yawRate * half * dirK;
  }

  // Bánh trước bẻ dần tới góc lái mong muốn (-1..1 = hết lái trái..phải; dương = sang trái) rồi quay thân theo mô hình xe đạp:
  // tốc độ quay = vận tốc / bán kính quay vòng x góc lái, giới hạn bởi turnRate. Đứng yên -> không quay;
  // lùi -> đầu xe quay ngược chiều đánh lái như xe thật. Trả về tốc độ quay thân (rad/s).
  applyWheelSteer(wantSteer, dt) {
    const ms = 3.5 * dt;   // ~0.3 s từ thẳng tới hết lái
    const cur = this._wheelSteer || 0;
    this._wheelSteer = cur + Math.max(-ms, Math.min(ms, wantSteer - cur));
    this.steerInput = this._wheelSteer;
    const R = this.turnRadius || 60;
    const roll = this.speed * (this._groundMult === undefined ? 1 : this._groundMult);   // tốc độ lăn bánh thật (địa hình / dốc)
    const yaw = Math.max(-this.turnRate, Math.min(this.turnRate, roll / R * this._wheelSteer));
    this.yawRate = yaw;
    return yaw;
  }

  // LÁI XE BÁNH LỐP THEO HƯỚNG PHÍM: tự chọn số tiến / lùi để quay đầu vòng cung, không đứng xoay tại chỗ
  steerWheeled(inputX, inputZ, dt, maxSpd, accel) {
    const hasInput = inputX !== 0 || inputZ !== 0;
    // Xe có thực sự nhích không (đang húc tường / xe khác)
    const movedRate = this._wlx !== undefined && dt > 0 ? Math.hypot(this.x - this._wlx, this.z - this._wlz) / dt : 99;
    this._wlx = this.x; this._wlz = this.z;
    this._gearHold = Math.max(0, (this._gearHold || 0) - dt);
    let gear = this._gear || 1;   // 1 = số tiến, -1 = số lùi
    let wantSteer = 0, targetSpeed = 0, diff = 0;

    if (hasInput) {
      const targetAngle = Math.atan2(-inputX, -inputZ);
      diff = targetAngle - this.bodyAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Hướng gần như ngược hẳn: giữ phía quay đã chọn, không lưỡng lự trái / phải
      if (Math.abs(diff) > 2.8 && this._uSide) diff = this._uSide * Math.abs(diff);
      else this._uSide = diff >= 0 ? 1 : -1;
      const ad = Math.abs(diff);

      if (this._gearHold <= 0) {
        // Hướng muốn đi ở phía sau mà xe đang chậm: lùi vòng cung cho đầu xe quay về hướng đó rồi mới tiến
        // (lùi tối đa ~4 s rồi tiến lại, không lùi mãi khi đích di chuyển)
        this._revT = gear < 0 ? (this._revT || 0) + dt : 0;
        if (gear > 0 && ad > 2.0 && this.speed < maxSpd * 0.3) { gear = -1; this._revAlign = 1.5; }
        else if (gear < 0 && (ad < (this._revAlign || 1.5) || this._revT > 4)) { gear = 1; this._gearHold = 0.7; }   // vào số tiến thì chạy hẳn một đoạn, không đổi số liên tục
        // Cua mãi không vào được hướng (đích nằm lọt trong vòng quay của xe): lùi vòng cung tới khi đích gần như ngay trước mũi
        this._wideT = gear > 0 && ad > 1.2 ? (this._wideT || 0) + dt : 0;
        if (this._wideT > 4.0) { gear = -1; this._gearHold = 1.2; this._wideT = 0; this._revAlign = 0.5; }
        // Húc tường / xe khác mà vẫn cần quay: tự đổi số tiến <-> lùi (quay đầu nhiều lần như xe thật)
        const blocked = (this._bumping || this._touchingVeh) && movedRate < 10;
        this._blockT = blocked && ad > 0.3 ? (this._blockT || 0) + dt : 0;
        if (this._blockT > 0.45) { gear = -gear; this._gearHold = 1.1; this._blockT = 0; this._revAlign = 1.5; }
      }
      // Bánh trước bẻ về phía cần quay; khi xe đang lùi thì bẻ ngược lại để đầu xe vẫn quay về đúng hướng
      const rollDir = this.speed > 0.5 ? 1 : this.speed < -0.5 ? -1 : gear;
      wantSteer = Math.max(-1, Math.min(1, diff / 0.5)) * rollDir;
      // Số tiến: vào cua gắt thì giảm ga nhưng vẫn lăn bánh (cần vận tốc mới quay được); số lùi: chạy lùi chậm
      targetSpeed = gear > 0 ? maxSpd * Math.max(0.5, Math.cos(diff)) : -maxSpd * 0.4;
    } else {
      this._wideT = 0; this._blockT = 0;
      if (Math.abs(this.speed) < 1 && this._gearHold <= 0) gear = 1;   // đã dừng hẳn: về số tiến
    }
    this._gear = gear;

    const yaw = this.applyWheelSteer(wantSteer, dt);
    const step = yaw * dt;
    if (hasInput && Math.abs(step) >= Math.abs(diff) && Math.sign(step) === Math.sign(diff)) {
      // vào đúng hướng: không quay vọt quá, trả lái về giữa
      this.bodyAngle += diff;
      this._wheelSteer *= 0.5;
    } else {
      this.bodyAngle += step;
    }

    const s = this.speed;
    if (s < targetSpeed) {
      // đang lùi mà cần dừng / tiến: phanh; tiến: lực kéo lớn lúc khởi hành, giảm dần khi gần tốc độ tối đa
      const rate = s < 0 ? accel * 2.0 : accel * (1 - 0.6 * Math.max(0, Math.min(1, s / Math.max(1, maxSpd))));
      this.speed = Math.min(targetSpeed, s + rate * dt);
    } else if (s > targetSpeed) {
      // tiến mà cần lùi / dừng: phanh; vào cua: giảm tốc êm; lùi: gia tốc số lùi
      const rate = s > 0 ? (targetSpeed > 0 ? accel * 0.8 : accel * 2.0) : accel * 0.7;
      this.speed = Math.max(targetSpeed, s - rate * dt);
    }
  }

  move(forwardInput, turnInput, dt, isBoost = false) {
    if (this.isDead) return;

    const hasSpeedItem = (this.speedBoostTimer > 0);
    const speedItemMult = hasSpeedItem ? 1.65 : 1.0;

    const EB = this.engineBoost(isBoost && forwardInput !== 0, dt);
    const maxSpd = this.baseMaxSpeed * EB.s * speedItemMult;
    const accel = this.acceleration * EB.a * speedItemMult;

    // ĐÁNH LÁI (A / D theo thân xe)
    if (this.isWheeled) {
      // Xe bánh lốp: A / D chỉ bẻ bánh trước; thân xe quay khi lăn bánh theo bán kính quay vòng
      // (đứng yên thì không quay, lùi thì đầu xe quay ngược chiều đánh lái như xe thật)
      this.bodyAngle += this.applyWheelSteer(-turnInput, dt) * dt;
    } else {
      // Xe xích: hai dải xích chạy ngược chiều -> xoay tại chỗ được; chạy nhanh thì cua chậm lại một chút.
      // Lưỡi ủi đang tì đống đất (game.js updateDig: _dozerTurnK < 1): đất cản ngang mặt lưỡi -> quay ì hẳn
      const dzK = this._dozerTurnK || 1;
      const maxTurn = this.turnRate * dzK * (1 - 0.3 * Math.min(1, Math.abs(this.speed) / Math.max(1, maxSpd)));
      const wantRate = -turnInput * maxTurn;
      const ms = this.turnRate * dzK * (turnInput ? 5 : 7) * dt;   // quán tính quay ~0.2 s
      this.yawRate = (this.yawRate || 0) + Math.max(-ms, Math.min(ms, wantRate - (this.yawRate || 0)));
      this.bodyAngle += this.yawRate * dt;
      this.steerInput = -turnInput;
    }

    // GA / PHANH / LÙI (W / S)
    const s = this.speed;
    // Hết tăng tốc / hết Item tốc độ mà đang nhanh hơn tốc độ tối đa mới: tụt dần (accel*0.8 như steer), không cắt cụt 1 khung
    if (forwardInput > 0) {
      if (s < 0) this.speed = Math.min(0, s + accel * 2.0 * dt);   // đang lùi: phanh trước
      else if (s > maxSpd) this.speed = Math.max(maxSpd, s - accel * 0.8 * dt);
      else this.speed = Math.min(maxSpd, s + accel * (1 - 0.6 * Math.min(1, s / Math.max(1, maxSpd))) * dt);   // lực kéo giảm dần khi nhanh
    } else if (forwardInput < 0) {
      if (s > 0) this.speed = Math.max(0, s - accel * 2.0 * dt);   // đang tiến: phanh trước
      else if (s < -maxSpd * 0.45) this.speed = Math.min(-maxSpd * 0.45, s + accel * 0.8 * dt);
      else this.speed = Math.max(-maxSpd * 0.45, s - accel * 0.7 * dt);   // số lùi chậm hơn số tiến
    } else if (s > 0) {
      this.speed = Math.max(0, s - accel * 1.2 * dt);   // nhả ga: trôi rồi dừng (nhẹ hơn đạp phanh S)
    } else if (s < 0) {
      this.speed = Math.min(0, s + accel * 1.2 * dt);
    }
  }

  /**
   * Lấy vị trí thế giới và vector hướng chính xác 100% của đầu nòng pháo 3D
   * Đảm bảo đạn xuất phát chuẩn từ miệng nòng và bay đúng theo phương nòng pháo
   */
  // Miệng ống phóng tên lửa chống tăng (nếu model có ống phóng riêng), ngược lại dùng đầu nòng
  getLauncherWorldTransform() {
    const L = this.antiTankLauncherMesh;
    if (!L || !this.atgmTipLocal) return this.getMuzzleWorldTransform();
    this.group.updateMatrixWorld(true);
    const tip = L.localToWorld(this.atgmTipLocal.clone());
    const back = L.localToWorld(this.atgmTipLocal.clone().setZ(this.atgmTipLocal.z + 4));
    const dir = new THREE.Vector3().subVectors(tip, back).normalize();
    const rear = this.atgmRearLocal ? L.localToWorld(this.atgmRearLocal.clone()) : back;
    return { position: tip, direction: dir, rear };
  }

  // Tiếng phóng tên lửa: xe mình nghe trọn; xe khác phóng thì nghe theo khoảng cách & hướng
  playMissileLaunchSound() {
    const se = window.soundEngine;
    if (!se || typeof se.playMissileLaunch !== 'function') return;
    if (this.isPlayer) { se.playMissileLaunch(); return; }
    const me = window.game && window.game.player, L = window.game && window.game.audioListener ? window.game.audioListener() : me;
    if (!me || me === this) return;
    const d = Math.hypot(this.x - L.x, this.z - L.z);
    if (d < 2200) se.playMissileLaunch(Math.max(1, d), { x: this.x, z: this.z });
  }

  // Phóng tên lửa: chớp miệng ống + luồng phụt ngược sau ống, súng không giật
  spawnMissileLaunchFX(launch) {
    const fx = (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene) ? ExplosionFX.forScene(this.scene) : null;
    // xe trinh sát: xạ thủ đứng ngay cạnh đuôi ống -> tên lửa phóng mềm (không phụt lửa ngược vào người)
    if (fx && fx.missileLaunch) fx.missileLaunch(launch.position, launch.direction, launch.rear, this.tankType === 'SCOUT' ? { soft: true } : null);
  }

  // Giữ nòng pháo không cắm vào vật rắn của cứ điểm. Thử lần lượt: tư thế mong muốn -> hạ dần nòng -> tư thế an toàn gần nhất
  // Tháp xoay / nòng nâng hạ mà đầu nòng cắm vào tường (khối bê tông, nhà) thì giữ tư thế cũ (hoặc chỉ phần không chạm).
  // Đang kẹt sẵn (xe bị đẩy sát tường) thì vẫn cho xoay ra hướng ngập ít hơn.
  // Nửa góc điểm mù (rad): pháo tự hành trên xe tải — quanh mũi xe (nòng không vắt qua cabin); xe 6 nòng — quanh đuôi
  // xe (nòng không gạt qua thùng đồ / can / mái lồng sàn sau); xe khác 0
  turretBlindHalf() {
    if (typeof BallisticsSystem3D === 'undefined') return 0;
    return this.tankType === 'ARTILLERY' ? BallisticsSystem3D.ARTY_DIRECT.blind : this.tankType === 'GATLING' ? BallisticsSystem3D.GATLING_REAR_BLIND : 0;
  }
  // Tâm điểm mù so với mũi xe (rad): 0 = mũi xe, PI = đuôi xe
  turretBlindCenter() {
    return this.tankType === 'GATLING' ? Math.PI : 0;
  }
  // Xoay hướng bắn từ cur tới want (độ thế giới) tối đa stepDeg, tránh điểm mù: đi vòng phía bên kia (pháo tự hành
  // vòng qua đuôi, xe 6 nòng vòng qua mũi), hướng lệnh trong điểm mù thì dừng ở mép gần nhất. Tháp đang gác nòng trên
  // cabin (trong điểm mù) thì quay dần ra mép gần đường tới hướng lệnh nhất (không nhảy cóc). Trả về { az, done }
  stepAzimuth(cur, want, stepDeg) {
    const S = this.turretBlindHalf(), T = Math.PI * 2, C = this.turretBlindCenter();
    const toU = az => { const u = -(az * Math.PI / 180) - (this.bodyAngle || 0) - C; return ((u % T) + T) % T; };
    const clampU = (u, side) => (u >= S && u <= T - S) ? u : (side < Math.PI ? S : T - S);
    const uc = toU(cur), st = stepDeg * Math.PI / 180;
    const inBlind = uc < S || uc > T - S;
    const ut0 = toU(want), ut = clampU(ut0, inBlind ? (ut0 < Math.PI ? 0 : T) : uc);
    let d;
    if (inBlind) {
      const v = uc > Math.PI ? uc - T : uc;                  // góc có dấu quanh mũi xe (-S..S)
      const up = ut - v, down = v - (ut - T);               // ra mép trái / mép phải rồi tới hướng lệnh
      d = up <= down ? up : -down;
      const nu = Math.abs(d) <= st ? ut : v + Math.sign(d) * st;
      const w = -(nu + C + (this.bodyAngle || 0)) * 180 / Math.PI;
      return { az: ((w % 360) + 360) % 360, done: Math.abs(d) <= st && ut === ut0 };
    }
    d = ut - uc;
    const nu = Math.abs(d) <= st ? ut : uc + Math.sign(d) * st;
    const w = -(nu + C + (this.bodyAngle || 0)) * 180 / Math.PI;
    return { az: ((w % 360) + 360) % 360, done: Math.abs(d) <= st && ut === ut0 };
  }

  applyWallBarrelBlock(terrain, yaw0, el0) {
    if (!this.turretGroup || !this.barrelPivot) return;
    const boxes = terrain.vehicleObstacles(this.x, this.z, this, true);
    this.barrelWallHit = null;   // hộp tường / nhà nòng vừa nện vào (tiếng & bụi theo vật liệu: barrel_sweep.js)
    if (!boxes || !boxes.length) return;
    const VC = VehicleCollision, yaw = this.turretGroup.rotation.y, el = this.barrelPivot.rotation.x;
    const d = VC.barrelDepth(this, yaw, el, boxes);
    if (d < 0.3) { this.barrelWallBlocked = false; return; }
    const d0 = VC.barrelDepth(this, yaw0, el0, boxes);
    if (d <= d0 + 0.01) { this.barrelWallBlocked = false; return; }
    let hd = 0;
    for (const b of boxes) { const dd = VC.barrelDepth(this, yaw, el, [b]); if (dd > hd) { hd = dd; this.barrelWallHit = b; } }
    let pick = [yaw0, el0];
    for (const c of [[yaw, el0], [yaw0, el]]) {
      if (VC.barrelDepth(this, c[0], c[1], boxes) <= Math.max(0.3, d0 + 0.01)) { pick = c; break; }
    }
    this.turretGroup.rotation.y = this._turretYaw = pick[0];
    this.barrelPivot.rotation.x = pick[1];
    this.elevation = pick[1] * 180 / Math.PI;
    // Hướng bắn thật là hướng tháp đang chỉ
    const worldA = -(pick[0] + this.bodyAngle) * 180 / Math.PI;
    this.azimuth = ((worldA % 360) + 360) % 360;
    this.barrelWallBlocked = true;
  }

  applyBarrelClearance(terrain) {
    if (!this.barrelPivot || !this.barrelGroup || !this.muzzleTipLocal) return;
    const base = this._bcBase || (this._bcBase = new THREE.Vector3());
    const tip = this._bcTip || (this._bcTip = new THREE.Vector3());
    // lần thử đầu cập nhật cả xe, các lần sau chỉ cập nhật cụm tháp (nòng nằm trong tháp) cho nhẹ
    let full = true;
    const clear = () => {
      if (this.syncBarrelPose) this.syncBarrelPose();   // mô hình có trục nòng thật riêng (lựu pháo trên xe tải)
      if (full) { this.group.updateMatrixWorld(true); full = false; } else this.turretGroup.updateMatrixWorld(true);
      this.barrelPivot.getWorldPosition(base);
      this.barrelGroup.localToWorld(tip.copy(this.muzzleTipLocal));
      return !terrain.barrelBlocked(base, tip);
    };
    const yaw0 = this.turretGroup.rotation.y, el0 = this.barrelPivot.rotation.x;
    const minEl = -0.1;   // hạ nòng tối đa -6°
    // Góc cao nhất (≤ from) mà nòng không chạm: hạ từng nấc 3° tới góc đầu tiên không chạm, rồi dò nhị phân ngược lên sát
    // chỗ chạm (nòng nằm sát dưới trần). Không giả định "càng hạ càng thoáng": trong hầm chúc nòng xuống thì chạm sàn
    // (trước đây thử thẳng -6° thấy chạm sàn -> bỏ cuộc, nòng ghim -6° rồi giằng co với máy tính hỏa lực -> nòng giật lên xuống)
    const lower = (from) => {
      const st = 3 * Math.PI / 180;
      let hiBlocked = from;
      for (let e = from - st; ; e -= st) {
        const ee = Math.max(minEl, e);
        this.barrelPivot.rotation.x = ee;
        if (clear()) {
          let lo = ee, hi = hiBlocked;
          for (let k = 0; k < 6; k++) {
            const m = (lo + hi) / 2;
            this.barrelPivot.rotation.x = m;
            if (clear()) lo = m; else hi = m;
          }
          this.barrelPivot.rotation.x = lo;
          clear();
          return true;
        }
        hiBlocked = ee;
        if (ee <= minEl) return false;
      }
    };
    let ok = clear() || lower(el0);
    if (!ok && this._clearYaw !== undefined) {
      // Quay vào tường bên (nòng dài chĩa ngang chạm vách): tháp dừng ở góc an toàn trước đó, nòng hạ tới khi không chạm.
      // KHÔNG trả nòng về góc nâng cũ ghi lúc còn ở ngoài hầm (nòng xuyên mái) trừ khi góc đó vẫn thật sự không chạm
      this.turretGroup.rotation.y = this._turretYaw = this._clearYaw;
      this.barrelPivot.rotation.x = Math.min(el0, this._clearEl);
      ok = clear() || lower(Math.min(el0, this._clearEl));
      if (!ok) { this.barrelPivot.rotation.x = this._clearEl; ok = clear(); }
      // hướng bắn thật = hướng tháp đang chỉ (lệnh quay tiếp tục từ đây, không chạy trước tháp)
      const worldA = -(this._clearYaw + this.bodyAngle) * 180 / Math.PI;
      this.azimuth = ((worldA % 360) + 360) % 360;
    }
    if (!ok) {
      // không có tư thế nào thoáng: giữ nguyên tư thế lệnh
      this.barrelPivot.rotation.x = el0; this.turretGroup.rotation.y = this._turretYaw = yaw0; clear();
      const worldA = -(yaw0 + this.bodyAngle) * 180 / Math.PI;
      this.azimuth = ((worldA % 360) + 360) % 360;
    }
    if (this.canElevate && Math.abs(this.barrelPivot.rotation.x - el0) > 1e-4) this.elevation = this.barrelPivot.rotation.x * 180 / Math.PI;
    this.barrelBlockedNow = !ok || this.turretGroup.rotation.y !== yaw0 || Math.abs(this.barrelPivot.rotation.x - el0) > 1e-4;
    if (ok) { this._clearYaw = this.turretGroup.rotation.y; this._clearEl = this.barrelPivot.rotation.x; }
  }

  // Độ lệch (độ) giữa hướng nòng thật trong thế giới và góc lệnh azimuth / elevation — do thân xe nghiêng trên dốc.
  // Bộ giải đường đạn tính theo mặt phẳng ngang: trừ độ lệch này vào lệnh để nòng thật chỉ đúng nghiệm.
  // Đo lại ~4 lần/giây (đủ theo kịp xe chạy trên địa hình, không tốn tính toán ma trận mỗi khung hình).
  barrelWorldOffset() {
    const now = performance.now();
    if (this._bwo && now - this._bwoT < 250) return this._bwo;
    this._bwoT = now;
    if (!this.barrelGroup || !this.muzzleTipLocal) return (this._bwo = { el: 0, az: 0 });
    const m = this.getMuzzleWorldTransform();
    const worldEl = Math.asin(Math.max(-1, Math.min(1, m.direction.y))) * 180 / Math.PI;
    const worldAz = (Math.atan2(m.direction.x, -m.direction.z) * 180 / Math.PI + 360) % 360;
    this._bwo = { el: worldEl - this.elevation, az: ((worldAz - this.azimuth + 540) % 360) - 180 };
    return this._bwo;
  }

  // Hình học nòng đo trên mô hình 3D: tâm quay nòng (cao / trước tâm xe) và chiều dài nòng — cho bộ giải đường đạn
  // Tâm quay của tháp thường không nằm ở tâm xe (pháo tự hành: bàn xoay đặt phía sau thùng xe) -> ghi thêm vị trí trục tháp
  // (axX / axZ so với tâm xe) và gốc nòng so với trục tháp theo hướng nòng (fwd: phía trước, lat: sang phải) để bộ giải
  // đặt miệng nòng đúng chỗ cho mọi hướng bắn (trước đây coi gốc nòng nằm trên đường thẳng từ tâm xe theo hướng bắn
  // -> lệch tới ~20 đơn vị, điểm rơi bộ giải tính khác đường đạn thật)
  barrelGeometry() {
    if (!this.barrelGroup || !this.muzzleTipLocal) return null;
    this.group.updateMatrixWorld(true);
    const tip = this.barrelGroup.localToWorld(this.muzzleTipLocal.clone());
    const base = this.barrelGroup.localToWorld(new THREE.Vector3());
    const out = { pivotH: base.y - this.y, pivotFwd: Math.hypot(base.x - this.x, base.z - this.z), len: tip.distanceTo(base) };
    if (this.turretGroup) {
      const ax = this.turretGroup.getWorldPosition(new THREE.Vector3());
      const dx = tip.x - base.x, dz = tip.z - base.z, dl = Math.hypot(dx, dz);
      if (dl > 1e-3) {
        const ux = dx / dl, uz = dz / dl, ox = base.x - ax.x, oz = base.z - ax.z;
        out.axX = ax.x - this.x; out.axZ = ax.z - this.z;
        out.fwd = ox * ux + oz * uz;
        out.lat = ox * -uz + oz * ux;   // phải của hướng (ux, uz) trong hệ x-z là (-uz, ux)
      }
    }
    return out;
  }

  // Góc ngóc thêm của nhóm nòng do hư hại (vehicle_damage poseBarrel): nòng cong + gục khi bị phá
  barrelDamagePitch() {
    const d = this.dmg;
    return d ? (d.bendRot ? d.bendRot.x : 0) - (d.gunDead ? 0.11 : 0) : 0;
  }

  getMuzzleWorldTransform() {
    // HỆ ỔN ĐỊNH PHÁO: thân xe rung máy / nhún / giật nhưng nòng giữ hướng -> tính theo tư thế thân xe đã bỏ dao động nhất
    // thời (hình xe vẫn rung như cũ). Trước đây rung máy ~0,02° làm hướng nòng dao động: đường đạn sượt mép ụ đất / tán
    // cây thì điểm rơi dự kiến lật qua lại liên tục
    const C = this.chassisGroup, st = this._stabRot;
    let rx = 0, rz = 0;
    if (C && st) { rx = C.rotation.x; rz = C.rotation.z; C.rotation.x = st.x; C.rotation.z = st.z; }
    this.group.updateMatrixWorld(true);
    // NÒNG CONG (vehicle_damage applyBend): kính ngắm gắn trên tháp vẫn chỉ theo đường ngắm cũ -> direction (đường ngắm:
    // đường đạn dự kiến, vòng ngắm, bộ giải ngắm của bot) tính như nòng thẳng; đạn thật bay theo đoạn ống nòng sau chỗ cong
    // (boreDir, ballistics fireShell3D) và ra từ miệng nòng đã dời (tipOff) -> lệch khỏi tâm ngắm, phải tự ngắm bù.
    // Cụm 6 nòng nghiêng cả cụm (bendRot) thay vì uốn lưới: bỏ phần nghiêng đó khi tính đường ngắm
    const D = this.dmg, br = D && D.bendRot, bv = D && D.bore, bg = this.barrelGroup;
    const tipWorld = new THREE.Vector3().copy(this.muzzleTipLocal);
    if (D && D.tipOff) tipWorld.add(D.tipOff);
    bg.localToWorld(tipWorld);
    if (br) { bg.rotation.x -= br.x; bg.rotation.y -= br.y; this.group.updateMatrixWorld(true); }
    const sightTip = bg.localToWorld(new THREE.Vector3().copy(this.muzzleTipLocal));
    const dir = sightTip.sub(bg.localToWorld(new THREE.Vector3())).normalize();
    const bore = bv ? bv.clone().transformDirection(bg.matrixWorld) : null;
    if (br) { bg.rotation.x += br.x; bg.rotation.y += br.y; if (!(C && st)) this.group.updateMatrixWorld(true); }
    if (C && st) { C.rotation.x = rx; C.rotation.z = rz; this.group.updateMatrixWorld(true); }

    return bore ? { position: tipWorld, direction: dir, boreDir: bore } : { position: tipWorld, direction: dir };
  }

  // Chu trình nạp đạn nghe từ trong xe (chỉ xe người chơi): khóa nòng mở lúc bắn ('open', gọi trong fire()) ->
  // lấy đạn ra khỏi hộc / băng chuyền nạp tự động xoay ('fetch') -> đẩy đạn vào nòng, khóa nòng đóng sập ('ram'),
  // canh để tiếng đóng khóa nòng rơi đúng lúc đồng hồ nạp đạn về 0
  updateReloadSound() {
    const se = window.soundEngine;
    if (!se || !se.playReloadPhase || !this._reloadSndPhase) return;
    const arty = this.tankType === 'ARTILLERY';
    const ramLead = arty ? 1.05 : 0.6;
    const elapsed = (this.reloadDuration || 0) - this.reloadTimer;
    if (this._reloadSndPhase === 'open' && elapsed >= (arty ? 0.9 : 1.1) && this.reloadTimer > ramLead + 0.7) {
      se.playReloadPhase(this.tankType, 'fetch');
      this._reloadSndPhase = 'fetch';
    }
    if (this.reloadTimer <= ramLead) {
      // lựu pháo: số module liều phóng theo liều đang chọn (liều 1 = 5 module ... liều nhỏ = 1); xe tăng: loại đạn
      const ch = this.charge || 1, mods = ch >= 0.9 ? 5 : ch >= 0.6 ? 4 : ch >= 0.4 ? 3 : ch >= 0.25 ? 2 : 1;
      se.playReloadPhase(this.tankType, 'ram', this.reloadTimer, { ammo: this.selectedAmmo, modules: mods });
      this._reloadSndPhase = null;
    }
  }

  // Xe trinh sát (xe người chơi): phát tiếng từng bước thay đạn đúng lúc tiến độ nạp vượt mốc của hoạt cảnh
  // (recon_marten + vehicle_crew MG_KEYS / CHARGE_KEYS / rocketPhase). Theo tiến độ chứ không hẹn giờ trước, nên nạp
  // bị dừng (xạ thủ hy sinh) thì tiếng cũng dừng theo
  updateScoutReloadSound(prevReload) {
    const se = window.soundEngine, D = this.reloadDuration;
    if (!se || !se.playScoutReload || !(D > 0)) return;
    const p0 = 1 - prevReload / D, p1 = 1 - this.reloadTimer / D;
    if (p1 <= p0) return;
    const G = this.mainGun, kind = G && G.kind === 'agl' ? 'agl' : G && G.kind === 'rocket' ? 'rocket' : 'hmg';
    const hit = (a) => p0 < a && p1 >= a;
    if (kind === 'rocket') {
      // mỗi quả chiếm 1/n tiến độ: cúi lấy (< 0.4) -> bê ra đuôi ống (< 0.7) -> đẩy vào ống
      const n = Math.max(1, (G.muzzles && G.muzzles.length) || 1);
      for (let i = 0; i < n; i++) {
        for (const [ph, step] of SPGUnit3D.SCOUT_ROCKET_STEPS) {
          if (hit((i + ph) / n)) se.playScoutReload(step, kind, 0.14 * D / n);
        }
      }
      return;
    }
    // mốc trong bảng là mốc hoạt cảnh -> đổi ra tiến độ thời gian theo cùng nhịp với hình (VehicleCrew MG_WARP)
    const VC = typeof VehicleCrew !== 'undefined' && VehicleCrew.mgUnwarp ? VehicleCrew : null;
    const at = (a) => (VC ? VC.mgUnwarp(a) : a);
    const S = SPGUnit3D.SCOUT_RELOAD_STEPS;
    for (let i = 0; i < S.length; i++) {
      const a = at(S[i][0]), b = i + 1 < S.length ? at(S[i + 1][0]) : 1;
      if (hit(a)) se.playScoutReload(S[i][1], kind, (b - a) * D);
    }
  }

  // ==========================================
  // KHAI HỎA: KÍCH HOẠT HIỆU ỨNG BẮN SIÊU MÃN NHÃN
  // ==========================================
  fire(ballistics, radar) {
    if (this.isDead) return null;
    // Xe 6 nòng & xe trinh sát không có pháo chính: xả đạn liên thanh qua updateGatling().
    // Ngoại lệ: xe trinh sát đang chọn tên lửa dẫn hướng (ô đạn 3) -> phóng từ ống phóng trên nóc. Ống phóng có hồi nạp
    // riêng (antiTankCooldown) — đang thay hộp đạn súng máy (reloadTimer) không chặn phóng tên lửa như trước
    if (this.tankType === 'SCOUT' && this.selectedAmmo === 'ANTI_TANK_MISSILE') return this.fireAntiTank(ballistics, radar);
    if (this.reloadTimer > 0) return null;
    if (this.tankType === 'GATLING' || this.tankType === 'SCOUT') return null;
    if (this.dmg && this.dmg.gunDead) return null;   // pháo chính bị phá hủy (vehicle_damage damageGun)
    // Pháo cao xạ / pháo tự hành hạng nặng bắt buộc phải dừng xe hạ chân chống thủy lực mới được khai hỏa
    if (this.tankType === 'ARTILLERY' && !this.isDeployed) {
      return null;
    }
    // Nòng đang vắt qua nóc cabin (gác giá khóa / điểm mù mũi xe): không khai hỏa
    if (this.tankType === 'ARTILLERY' && this.turretInBlind) return null;

    // Xác định loại đạn bắn ra theo dòng xe và loại đạn đang nạp
    let ammoTypeToFire = 'NORMAL', baseRound = false;
    if (this.tankType === 'ARTILLERY') {
      if (this.selectedAmmo === 'CLUSTER') {
        if (this.clusterAmmoCount > 0) {
          ammoTypeToFire = 'CLUSTER';
          this.clusterAmmoCount--;
          if (this.clusterAmmoCount <= 0) this.selectedAmmo = 'HE';
        } else {
          this.selectedAmmo = 'HE';
          ammoTypeToFire = 'HE';
          baseRound = true;
        }
      } else if (this.selectedAmmo === 'AP') {
        if (this.apAmmoCount > 0) {
          ammoTypeToFire = 'AP';
          this.apAmmoCount--;
          if (this.apAmmoCount <= 0) this.selectedAmmo = 'HE';
        } else {
          this.selectedAmmo = 'HE';
          ammoTypeToFire = 'HE';
          baseRound = true;
        }
      } else {
        // HE (Đạn nổ mạnh): hết số quả đặc chủng thì bắn đạn thường trong cơ số
        ammoTypeToFire = 'HE';
        if (this.heAmmoCount > 0) this.heAmmoCount--;
        else baseRound = true;
      }
    } else if (this.selectedAmmo === 'AP') {
      if (this.apAmmoCount > 0) {
        ammoTypeToFire = 'AP';
        this.apAmmoCount--;
        if (this.apAmmoCount <= 0) this.selectedAmmo = 'NORMAL';
      } else {
        this.selectedAmmo = 'NORMAL';
      }
    } else if (this.selectedAmmo === 'HE') {
      if (this.heAmmoCount > 0) {
        ammoTypeToFire = 'HE';
        this.heAmmoCount--;
        if (this.heAmmoCount <= 0) this.selectedAmmo = 'NORMAL';
      } else {
        this.selectedAmmo = 'NORMAL';
      }
    }

    // đạn thường lấy từ cơ số mang theo mỗi lần xuất kích (AmmoLoad): hết thì pháo câm tới khi được tiếp tế
    if ((baseRound || ammoTypeToFire === 'NORMAL') && typeof AmmoLoad !== 'undefined' && AmmoLoad.take(this, 'main', 1) < 1) {
      AmmoLoad.dryNote(this, 'main');
      return null;
    }

    const isSpecial = ammoTypeToFire !== 'NORMAL';
    const shell = ballistics.fireShell3D(this, this.azimuth, this.elevation, this.charge, ammoTypeToFire);
    shell.ammoType = ammoTypeToFire;

    // Khi nổ súng: Bị lộ vị trí trong 4.0 giây do chớp lửa và tiếng nổ lớn
    this.revealTimer = 4.0;

    radar.registerShot({
      id: this.id,
      isPlayer: this.isPlayer,
      x: this.x + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800),
      y: this.z + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800),
      baseMaxSpeed: this.baseMaxSpeed
    });

    // 1. TỌA ĐỘ VÀ HƯỚNG ĐẦU NÒNG CHÍNH XÁC 3D
    const muzzle = this.getMuzzleWorldTransform();
    const tipWorld = muzzle.position;
    const fireDir = muzzle.direction;

    // 2. LỬA ĐẦU NÒNG, SÓNG NỔ, KHÓI CUỘN & BỤI ĐẤT BỊ THỔI TUNG
    this.spawnMuzzleBlast(tipWorld, fireDir);
    // Bắn sát mặt nước: sóng ép đầu nòng + màn bụi nước (src/gameplay/wading_fx.js)
    if (typeof WadingFX !== 'undefined' && (this.alwaysFX || SpgFXPool.isNearView(this.x, this.z))) WadingFX.muzzleBlast(this, tipWorld, fireDir);

    // 6. GIẬT THỤT NÒNG PHÁO CỰC MẠNH & NHÚN THÂN XE LÒ XO
    if (this.tankType === 'ARTILLERY') {
      this.barrelRecoil = 32.0; // Pháo cao xạ giật thụt nòng cực đại 32 đơn vị
      // Đã hạ chân chống + lưỡi càng: càng cắm đất gánh gần hết lực giật -> thân xe chỉ rung nhẹ
      this.kickRecoil(this.isDeployed ? 0.16 : 0.9);
      if (shell) {
        shell.isHeavyArty = true;
        // PHÁO CAO XẠ DAME TO TUYỆT ĐỐI (MÁU GIẤY NHƯNG HỎA LỰC HỦY DIỆT)
        if (ammoTypeToFire === 'AP') {
          shell.damage = 2.6; // Đạn xuyên phá công phá cực mạnh (hút ~80% máu xe thường)
        } else if (ammoTypeToFire === 'CLUSTER') {
          shell.damage = 1.2; // Đạn mẹ bung trên không (mỗi mảnh văng 0.35)
        } else if (ammoTypeToFire === 'HE') {
          shell.damage = 2.0; // Nổ diện rộng 90m
        } else {
          shell.damage = 1.8;
        }
      }
    } else {
      this.barrelRecoil = 18.0;
      this.kickRecoil(0.75);
      if (shell) {
        shell.damage = (ammoTypeToFire === 'AP' || ammoTypeToFire === 'HE') ? 2.0 : 1.0;
      }
    }
    this.barrelSmokeTimer = 2.5;

    this.reloadTimer = this.reloadDuration;
    // LỰU PHÁO NÓNG NÒNG: nạp tự động bắn loạt nhanh được (~8 phát / phút) nhưng không giữ mãi — sau ~8 phát trong 1 phút (thật)
    // nòng & buồng đạn quá nóng (nguy cơ đạn tự cháy trong buồng), phải giãn nhịp còn ~2-3 phát / phút tới khi nguội bớt
    if (this.tankType === 'ARTILLERY') {
      const now = performance.now() / 1000, win = gameTime(60);
      this._artyShots = (this._artyShots || []).filter(t => now - t < win);
      this._artyShots.push(now);
      if (this._artyShots.length > 8) {
        this.reloadTimer = this.reloadDuration * 2.8;
        if (this.isPlayer && window.game && window.game.addCombatLog && (!this._heatLogT || now - this._heatLogT > 20)) {
          this._heatLogT = now;
          window.game.addCombatLog('[[flame]] Nòng pháo quá nóng sau loạt bắn dồn dập — phải giãn nhịp bắn chờ nòng nguội', 'alert');
        }
      }
    }
    this.shotsFired++;

    if (window.soundEngine) {
      // Lựu pháo: tiếng nổ theo liều phóng đang dùng
      const sndOpts = (this.tankType === 'ARTILLERY' && ballistics.artyChargeMulOf) ? { chargeMul: ballistics.artyChargeMulOf(this.charge) } : {};
      if (this.isPlayer) {
        window.soundEngine.playCannonFire(this.tankType, ammoTypeToFire, 0, null, sndOpts);
        // Khóa nòng bán tự động mở ra ở cuối hành trình lùi, đẩy vỏ / đáy liều ra (chu trình nạp: xem updateReloadSound)
        if (window.soundEngine.playReloadPhase) window.soundEngine.playReloadPhase(this.tankType, 'open');
        this._reloadSndPhase = 'open';
      } else {
        // Xe khác nã pháo: nghe theo khoảng cách & hướng tới người chơi
        const me = window.game && window.game.player, L = window.game && window.game.audioListener ? window.game.audioListener() : me;
        if (me && me !== this) {
          const d = Math.hypot(this.x - L.x, this.z - L.z);
          if (d < 3200) window.soundEngine.playCannonFire(this.tankType, ammoTypeToFire, Math.max(1, d), { x: this.x, z: this.z }, sndOpts);
        }
      }
    }

    return shell;
  }

  // ==========================================
  // HỆ THỐNG ĐIỀU PHỐI VÒNG TUA NÒNG & BẮN CỦA XE 6 NÒNG VÀ XE TRINH SÁT
  // ==========================================
  updateGatling(dt, isFiring, ballistics, radar) {
    if (this.tankType !== 'GATLING' && this.tankType !== 'SCOUT') return;
    if (this.isDead) {
      // Xe bị hạ: tắt hẳn tiếng mô-tơ nòng xoay
      if (this.isPlayer && window.soundEngine && typeof window.soundEngine.updateGatlingMotor === 'function') {
        window.soundEngine.updateGatlingMotor(0, false, 0, false, this.tankType);
      }
      return;
    }
    let firedThisFrame = false;

    // Tản nhiệt cho cụm nòng: đang xả đạn thì gần như không kịp nguội (nóng dần lên),
    // nhả cò mới tản nhiệt nhanh. Trước đây nguội 0.20/s > nóng ~0.16/s nên nòng không bao giờ đỏ.
    const holdingTrigger = isFiring && this.spinUpTime >= this.spinRequired && this.reloadTimer <= 0 && this.gatlingMag > 0;
    const coolRate = this.isOverheated ? 0.28 : (holdingTrigger ? 0.03 : 0.20);
    this.barrelHeat = Math.max(0.0, (this.barrelHeat || 0) - dt * coolRate);

    // Xử lý trạng thái quá nhiệt
    if (this.isOverheated) {
      // Khi nòng nguội xuống dưới 30%, giải phóng khóa quá nhiệt
      if (this.barrelHeat <= 0.30) {
        this.isOverheated = false;
        if (this.isPlayer && window.soundEngine && window.soundEngine.playGatlingCooled) {
          window.soundEngine.playGatlingCooled();
        }
      }
      // Nòng quá nhiệt nóng đỏ xì khói nóng nghi ngút
      if (Math.random() < 0.2) {
        this.spawnExhaustPuff(true, false);
      }
    }

    // Phòng hờ: hết thời gian nạp mà băng vẫn rỗng -> lắp băng mới
    // (xe trinh sát: hết đạn chờ một nhịp rồi xạ thủ mới thay — scoutSmartReload)
    // (cơ số mang theo AmmoLoad: hết cơ số thì súng câm; vừa được tiếp tế thì kíp xe bắt đầu thay hòm)
    if (this.reloadTimer <= 0 && this.gatlingMag <= 0 && this.tankType !== 'SCOUT') {
      if (typeof AmmoLoad === 'undefined' || !AmmoLoad.tracks(this)) this.gatlingMag = this.gatlingMagMax;
      else if (AmmoLoad.left(this, 'main') > 0) this.reloadTimer = this.reloadDuration;
      else if (isFiring) AmmoLoad.dryNote(this, 'main');
    }

    // XE TRINH SÁT: xạ thủ đang ở ống tên lửa (scoutGunnerBusy) -> súng không bắn, thay đạn tạm dừng;
    // nạp thông minh (tự nạp khi rảnh / bóp cò lúc đang nạp dở) — scoutSmartReload
    const busy = this._gunnerBusy = this.scoutGunnerBusy();
    if (busy && isFiring && this.isPlayer && window.game && window.game.addCombatLog && performance.now() - (this._busyNoteT || 0) > 2500) {
      this._busyNoteT = performance.now();
      window.game.addCombatLog(this.missileInFlight() ? '[[hourglass]] Xạ thủ đang giữ kính dẫn tên lửa — chưa đứng súng được tới khi tên lửa nổ'
        : `[[hourglass]] Xạ thủ đang nạp ống phóng tên lửa — súng chưa bắn được (còn ${this.antiTankCooldown.toFixed(1)} s)`, 'alert');
    }
    if (this.tankType === 'SCOUT') this.scoutSmartReload(dt, isFiring);
    if (this._mgAbortT > 0) this._mgAbortT = Math.max(0, this._mgAbortT - dt);

    // Nếu đang trong thời gian nạp lại băng đạn (hết đạn)
    if (this.reloadTimer > 0) {
      const prevReload = this.reloadTimer;
      if (!busy) this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      // Tiếng lắp băng / dây đạn mới, canh để tiếng khóa cuối cùng rơi đúng lúc nạp xong
      // (xe trinh sát: từng bước theo hoạt cảnh xạ thủ thay đạn — updateScoutReloadSound)
      const magInLead = 1.5;
      if (this.isPlayer && this.tankType === 'SCOUT') this.updateScoutReloadSound(prevReload);
      else if (this.isPlayer && prevReload > magInLead && this.reloadTimer <= magInLead && window.soundEngine && window.soundEngine.playReloadPhase) {
        window.soundEngine.playReloadPhase(this.tankType, 'magIn', this.reloadTimer);
      }
      if (this.reloadTimer <= 0) {
        this.gatlingMag = this.refillMag();
      } else if (this.tankType === 'SCOUT') {
        const G = this.mainGun;
        if (G && G.kind === 'rocket') {
          // giàn rocket: quả nào đã tống tới chốt (pha 0.92 của lượt nạp quả đó) là bắn được ngay
          const n = this.gatlingMagMax, pr = 1 - this.reloadTimer / Math.max(0.1, this.reloadDuration);
          this.gatlingMag = Math.max(this.gatlingMag, Math.min(this._rkCap !== undefined ? this._rkCap : n, Math.floor(pr * n + 0.08)));
        } else if (this.gatlingMag > 0 && this.scoutReloadPr() >= SPGUnit3D.MG_BOX_OUT) {
          // hộp cũ đã tháo khỏi khay: phải lắp xong hộp mới mới bắn được (hộp dở còn đạn cất lại vào khoang — AmmoLoad)
          if (typeof AmmoLoad !== 'undefined') AmmoLoad.give(this, 'main', this.gatlingMag);
          this.gatlingMag = 0;
        }
      }
      // Nòng quay hãm chậm dần về 0 khi đang nạp đạn
      this.spinUpTime = Math.max(0, this.spinUpTime - dt * 2.5);
    } else if (isFiring && this.gatlingMag > 0 && !this.isOverheated && !(this._mgAbortT > 0) && !busy) {
      // Đang giữ phím bắn và nòng KHÔNG bị quá nhiệt:
      this.spinUpTime = Math.min(this.spinRequired, this.spinUpTime + dt);

      // Khi đạt đủ thời gian khởi động: BẮT ĐẦU XẢ ĐẠN LIÊN THANH FULL CÔNG SUẤT!
      if (this.spinUpTime >= this.spinRequired) {
        this.gatlingRofTimer += dt;
        // Gatling 6 nòng ~30 phát/giây (~1800 phát/phút); súng máy 12.7mm xe trinh sát ~600 phát/phút như thật
        // vũ khí chính trên chân đế mô-đun (xe trinh sát): nhịp bắn theo vũ khí đang lắp
        const mainCfg = this.mainGun && SPGUnit3D.MAIN_WEAPONS[this.mainGun.kind];
        const fireInterval = (mainCfg ? mainCfg.rof : (this.tankType === 'SCOUT') ? 0.1 : 0.033) * (this.dmg ? this.dmg.rofInterval : 1);
        // nhịp bắn thực (đã tính hư hại bộ tiếp đạn): cụm nòng quay đúng 1 nòng / phát, mô-tơ & tiếng gầm cùng nhịp này
        this.gatlingShotHz = 1 / fireInterval;
        while (this.gatlingRofTimer >= fireInterval && this.gatlingMag > 0 && !this.isOverheated) {
          this.gatlingRofTimer -= fireInterval;
          // phần thời gian còn dư = viên này lẽ ra đã bắn từ ngần ấy giây trước trong khung: đạn bay trước đoạn đó
          // (dòng đạn giãn đều ở máy chậm) + nhịp bắn cho đếm loạt băng đạn theo thời gian (ballistics.fireShell3D)
          this._shotLead = this.gatlingRofTimer; this._shotIval = fireInterval;
          try { this.fireGatlingBullet(ballistics, radar); } finally { this._shotLead = 0; this._shotIval = 0; }
          this.gatlingMag--;
          firedThisFrame = true;

          // Tăng nhiệt độ nòng sau mỗi viên bắn (trừ nguội 0.03/s lúc giữ cò): xả liền một băng 300 viên (~10 s) nòng mới
          // ấm ~46%, băng 450 (~15 s) đỏ sẫm ~69%, hết băng 650 (~21 s) thì nóng đỏ rực, vừa chạm ngưỡng quá nhiệt
          if (this.tankType === 'GATLING') {
            this.barrelHeat = Math.min(1.0, (this.barrelHeat || 0) + 0.00253);
            if (this.barrelHeat >= 1.0) {
              this.isOverheated = true;
              break;
            }
          }

          if (this.gatlingMag <= 0) {
            // Hết đạn: Chuyển sang thời gian nạp lại băng đạn (xe trinh sát: chờ SCOUT_EMPTY_WAIT rồi mới thay — scoutSmartReload)
            if (this.tankType !== 'SCOUT') this.reloadTimer = this.reloadDuration;
            if (this.isPlayer && this.tankType === 'GATLING' && window.soundEngine && window.soundEngine.playReloadPhase) window.soundEngine.playReloadPhase(this.tankType, 'magOut');
            break;
          }
        }
      }
    } else {
      // Khi nhả phím bắn: nòng quay chậm dần lại. Cụm 6 nòng nặng quay theo quán tính ~1.6 s mới dừng hẳn (đúng như hình
      // cụm nòng đang quay) -> bóp cò lại khi nòng còn quay thì chỉ cần lấy lại phần tốc độ đã mất, không phải khởi động
      // lại từ đầu như trước (trước đây tụt về 0 sau 0.25 s trong khi nòng vẫn đang quay trên màn hình)
      const spinDown = this.tankType === 'GATLING' ? this.spinRequired / 1.6 : 2.0;
      this.spinUpTime = Math.max(0, this.spinUpTime - dt * spinDown);
    }

    // Xoay cụm 6 nòng 3D theo tốc độ quay nòng cực nhanh tương ứng tốc độ xả đạn
    const spinPowerRatio = this.spinUpTime / this.spinRequired;
    // 6 nòng: mỗi phát cụm quay 1/6 vòng -> rad/s = nhịp bắn x 2π / 6 (~31.7 rad/s ở 30.3 phát/s)
    const rotSpeed = spinPowerRatio * (this.gatlingShotHz || 30.3) * Math.PI / 3;
    // Model mới tự xoay cụm nòng (chống hiệu ứng quay ngược do tần số khung hình)
    if (this.gatlingCluster && !this.gatlingSpinByModel) {
      this.gatlingCluster.rotation.z += rotSpeed * dt;
    }

    // Âm thanh liên tục: mô-tơ quay nòng theo tốc độ, xì hơi theo nhiệt độ nòng
    if (this.isPlayer && window.soundEngine && typeof window.soundEngine.updateGatlingMotor === 'function') {
      const holdingFire = isFiring && this.reloadTimer <= 0 && !this.isOverheated && this.gatlingMag > 0;
      this.gatlingAudioFiring = firedThisFrame || (holdingFire && spinPowerRatio >= 1 && !!this.gatlingAudioFiring);
      window.soundEngine.updateGatlingMotor(this.gatlingVisualSpin !== undefined ? this.gatlingVisualSpin : spinPowerRatio, this.gatlingAudioFiring, this.barrelHeat || 0, !!this.isOverheated, this.tankType, this.gatlingShotHz || 0);
    }

    // CẬP NHẬT HIỆU ỨNG NÓNG ĐỎ NÒNG DẦN DẦN (BARREL HEAT GLOW)
    // Nhiệt NHÌN THẤY tách khỏi nhiệt gameplay (barrelHeat — khóa quá nhiệt, nguội nhanh 0.20/s cho nhịp chơi): thép nòng dày
    // nguội chậm, ửng đỏ còn vài chục giây sau khi nhả cò (~0.03/s); đỏ sẫm rồi cam vừa phải, không chói như đèn
    if (this.gatlingHeatMat) {
      this.gatlingGlow = Math.max(this.barrelHeat || 0, (this.gatlingGlow || 0) - dt * 0.03);
      const heat = this.gatlingGlow;
      // (theo băng xả liền: 300 viên ~0.46 ấm ửng đỏ nhạt, 450 viên ~0.69 đỏ sẫm, 650 viên ~1.0 nóng đỏ rực)
      if (heat < 0.25) {
        this.gatlingHeatMat.emissive.setHex(0x000000);
        this.gatlingHeatMat.emissiveIntensity = 0;
      } else if (heat < 0.75) {
        // Nóng ửng đỏ sẫm dần dần
        const t = (heat - 0.25) / (0.75 - 0.25);
        this.gatlingHeatMat.emissive.setHex(0x9a1810);
        this.gatlingHeatMat.emissiveIntensity = t * 1.1;
      } else {
        // Nóng rực chuyển sang màu cam lửa
        const t = (heat - 0.75) / 0.25;
        this.gatlingHeatMat.emissive.setHex(0xe8400a);
        this.gatlingHeatMat.emissiveIntensity = 1.1 + t * 1.1;
      }
    }
  }

  /**
   * NẠP THÔNG MINH CỦA XE TRINH SÁT (súng 12.7 / phóng lựu / giàn rocket) — người chơi & bot như nhau:
   * - Tự nạp khi rảnh: ngừng bắn SCOUT_IDLE_RELOAD giây mà hộp còn dưới 60% (giàn rocket: thiếu quả nào) thì xạ thủ tự
   *   thay. Không tự nạp khi xạ thủ đang ở trong xe (phím H) hoặc đã hy sinh / súng hỏng.
   * - Bóp cò lúc đang nạp dở: giàn rocket — ống nào đã có quả bắn được ngay, quả đang nạp dở dừng lại; súng 12.7 / phóng
   *   lựu — mới lật nắp, hộp cũ chưa tháo (mốc MG_BOX_OUT) thì sập nắp bắn tiếp số đạn còn lại, đã tháo hộp thì phải thay xong
   */
  /**
   * Xe trinh sát chỉ có MỘT xạ thủ: đang nạp ống tên lửa (đứng quay ra ống phóng, rút vỏ, tống quả mới) hoặc đang giữ
   * kính dẫn tên lửa đang bay (antiTankCooldown giữ ở mức đầy — updateRecon) thì không đứng súng được: súng 12.7 /
   * phóng lựu không bắn, thay hộp đạn tạm dừng. Hết tên lửa: chỉ bận tới lúc vứt vỏ rỗng (VehicleCrew AT.toss).
   * Giàn rocket điều khiển từ xa (không có ống tên lửa) không bị ảnh hưởng
   */
  scoutGunnerBusy() {
    if (this.tankType !== 'SCOUT' || this._noAtgm || !(this.antiTankCooldown > 0)) return false;
    if ((this.missileAmmoCount || 0) > 0 || this.missileInFlight()) return true;
    const AT = typeof VehicleCrew !== 'undefined' && VehicleCrew.AT;
    return 1 - this.antiTankCooldown / (this.antiTankCooldownMax || 1) < (AT ? AT.toss : 0.42);
  }

  scoutSmartReload(dt, isFiring) {
    const rocket = !!(this.mainGun && this.mainGun.kind === 'rocket');
    if (this._gunnerBusy) return;   // xạ thủ đang ở ống tên lửa: không thay đạn / không tự nạp
    // hết sạch đạn: xạ thủ nhận ra súng câm, buông tay cầm rồi mới bắt đầu thay (không nạp tức thì ngay phát cuối).
    // Không có ai nạp (trong xe / hy sinh): chờ tới khi xạ thủ lên súng
    if (this.reloadTimer <= 0 && this.gatlingMag <= 0) {
      this._idleFireT = 0;
      if (this._crewStay || (this.dmg && this.dmg.crewDown)) return;
      this._emptyWaitT = (this._emptyWaitT === undefined ? SPGUnit3D.SCOUT_EMPTY_WAIT : this._emptyWaitT) - dt;
      if (this._emptyWaitT <= 0) { this._emptyWaitT = undefined; this.startScoutReload(); }
      return;
    }
    this._emptyWaitT = undefined;
    if (this.reloadTimer > 0) {
      this._idleFireT = 0;
      if (!isFiring || this.gatlingMag <= 0) return;
      if (rocket) {
        // xạ thủ đang đứng ngay sau đuôi giàn nhét đạn: dừng nạp, chui về xe đóng nắp (RK_ABORT_T) rồi giàn mới phóng
        // (phóng lúc người còn đứng sau ống là luồng lửa phụt thẳng vào người)
        this.reloadTimer = 0;
        this.settleRocketLoad();
        this._mgAbortOpen = 0;
        this._mgAbortT = SPGUnit3D.RK_ABORT_T;
        if (this.isPlayer && typeof window !== 'undefined' && window.game && window.game.addCombatLog) {
          window.game.addCombatLog(`[[rocket]] Xạ thủ dừng nạp, chui về xe — giàn phóng sau ~${SPGUnit3D.RK_ABORT_T.toFixed(1)} s (còn ${this.gatlingMag} quả)`, 'tip');
        }
      } else if (this.scoutReloadPr() < SPGUnit3D.MG_BOX_OUT) {
        // sập nắp khóa nòng lại (recon_marten đóng nắp theo _mgAbortT), chưa bắn được tới khi nắp sập hẳn
        const c = Math.max(0, Math.min(1, (this.scoutReloadPr() - 0.08) / 0.12));
        this._mgAbortOpen = c * c * (3 - 2 * c);
        this._mgAbortT = SPGUnit3D.MG_ABORT_T;
        this.reloadTimer = 0;
      }
      return;
    }
    if (isFiring) { this._idleFireT = 0; return; }
    this._idleFireT = (this._idleFireT || 0) + dt;
    if (this._idleFireT < SPGUnit3D.SCOUT_IDLE_RELOAD) return;
    if (this._crewStay || (this.dmg && (this.dmg.crewDown || this.dmg.gunDead))) return;
    const max = this.gatlingMagMax || 0;
    if (typeof AmmoLoad !== 'undefined' && !(AmmoLoad.left(this, 'main') > 0)) return;   // hết cơ số: không có hộp nào để thay
    if (rocket ? this.gatlingMag < max : this.gatlingMag < max * 0.6) this.startScoutReload();
  }

  // Lắp băng / hộp mới xong: rút từ cơ số mang theo (AmmoLoad) — hộp cũ còn đạn cất lại khoang; giàn rocket: số quả đã
  // giữ chỗ lúc bắt đầu nạp (startScoutReload). Xe không đếm cơ số (bản sao mạng / phòng thử): luôn đầy
  refillMag() {
    const n = this.gatlingMagMax;
    if (typeof AmmoLoad === 'undefined' || !AmmoLoad.tracks(this)) { this._rkCap = undefined; return n; }
    if (this._rkCap !== undefined) { const cap = this._rkCap; this.gatlingMag = cap; this.settleRocketLoad(); return cap; }
    return AmmoLoad.fillMag(this, this.gatlingMag, n);
  }
  // giàn rocket: chốt số quả đã nhét vào ống trong lượt nạp này (nạp xong / xạ thủ dừng nạp giữa chừng)
  settleRocketLoad() {
    if (this._rkCap === undefined) return;
    if (typeof AmmoLoad !== 'undefined') AmmoLoad.take(this, 'main', Math.max(0, (this.gatlingMag || 0) - (this._rkFrom || 0)));
    this._rkCap = undefined;
  }

  // Bắt đầu thay đạn. Giàn rocket chỉ nạp bù các ống trống: tiến độ bắt đầu từ số quả còn trong giàn (mỗi quả 1/n thời
  // gian nạp cả giàn) -> hoạt cảnh / tiếng / đầu đạn hiện dần nối tiếp đúng ống trống kế tiếp
  startScoutReload() {
    const D = this.reloadDuration || 0, n = this.gatlingMagMax || 1;
    if (!(D > 0)) return;
    // hết cơ số mang theo (AmmoLoad): không còn hộp / quả nào để nạp — chờ tiếp tế
    const AL = typeof AmmoLoad !== 'undefined' && AmmoLoad.tracks(this) ? AmmoLoad : null;
    if (AL && !(AL.left(this, 'main') > 0)) { AL.dryNote(this, 'main'); return; }
    if (this.mainGun && this.mainGun.kind === 'rocket') {
      const from = Math.max(0, Math.min(n - 1, this.gatlingMag || 0));
      this.reloadTimer = D * (1 - (from + 1e-3) / n);
      // giữ chỗ số quả nạp được theo cơ số còn (rút thật khi nạp xong / dừng nạp — settleRocketLoad)
      this._rkFrom = this.gatlingMag || 0;
      this._rkCap = AL ? Math.min(n, this._rkFrom + AL.left(this, 'main')) : undefined;
    } else this.reloadTimer = D;
    this._mgAbortT = 0;
  }

  // mốc hoạt cảnh thay hộp đạn hiện tại (0..1, theo nhịp thật VehicleCrew MG_WARP)
  scoutReloadPr() {
    if (typeof VehicleCrew !== 'undefined' && VehicleCrew.mgReloadPr) return VehicleCrew.mgReloadPr(this);
    return this.reloadDuration > 0 && this.reloadTimer > 0 ? 1 - this.reloadTimer / this.reloadDuration : 1;
  }

  // Bắn 1 viên đạn liên thanh súng máy
  fireGatlingBullet(ballistics, radar) {
    if (!ballistics || this.isDead) return;
    if (this.dmg && this.dmg.gunDead) return;   // súng máy / cụm 6 nòng bị phá hủy
    if (this.dmg && this.dmg.crewDown) return;  // xe trinh sát: xạ thủ hy sinh, người dự bị chưa lên
    if (this._crewHidden) return; // xạ thủ đang chui trong xe (chế độ lái), chưa nhô lên tới súng
    if (this.mainGun && SPGUnit3D.MAIN_WEAPONS[this.mainGun.kind]) return this.fireMainModule(ballistics, radar);

    let bulletType = (this.tankType === 'SCOUT') ? 'SCOUT_BULLET' : 'GATLING_BULLET';
    let isIncendiary = false;
    let isHe = false;

    if (this.selectedAmmo === 'INCENDIARY') {
      if (this.incendiaryAmmoCount > 0) {
        bulletType = 'INCENDIARY';
        isIncendiary = true;
        this.incendiaryAmmoCount--;
        if (this.incendiaryAmmoCount <= 0) {
          this.selectedAmmo = (this.tankType === 'SCOUT') ? 'SCOUT_BULLET' : 'GATLING_BULLET';
        }
      } else {
        this.selectedAmmo = (this.tankType === 'SCOUT') ? 'SCOUT_BULLET' : 'GATLING_BULLET';
      }
    } else if (this.selectedAmmo === 'GATLING_HE') {
      // vật tư mua thêm (Equipment AMMO_SHOP): hết viên thì băng tự về đạn thường như đạn cháy. Bản sao mạng (_netProxy) không
      // mang kho đạn — máy chủ quyền đã đếm, bản sao bắn đúng loại đạn chủ quyền đang chọn
      if (this._netProxy || (this.heFragAmmoCount || 0) > 0) {
        bulletType = 'GATLING_HE';
        isHe = true;
        if (!this._netProxy && --this.heFragAmmoCount <= 0) this.selectedAmmo = 'GATLING_BULLET';
      } else {
        this.selectedAmmo = 'GATLING_BULLET';
      }
    }

    const shell = ballistics.fireShell3D(this, this.azimuth, this.elevation, 1, bulletType);
    if (shell) {
      shell.isGatling = true;
      shell.isIncendiary = isIncendiary;
      shell.isHe = isHe;
      if (isIncendiary) {
        shell.damage = (this.tankType === 'SCOUT') ? 0.08 : 0.095; // Đạn cháy sát thương cao hơn
      } else if (isHe) {
        shell.damage = 0.06; // Đạn nổ tạo mảnh phòng không
      } else {
        shell.damage = (this.tankType === 'SCOUT') ? 0.045 : 0.055;
      }
    }

    this.revealTimer = 2.0;

    // Pháo 6 nòng xoay không giật nòng (chỉ nóng đỏ); súng xe trinh sát rung nhẹ
    if (this.tankType === 'SCOUT') {
      this.barrelRecoil = 0.22;   // cả súng lùi ngắn trên giá giảm giật (nòng giật thêm trong thân súng + súng nảy: recon_marten)
      if (this.barrelGroup) this.barrelGroup.position.z = this.barrelRecoil;
    }
    this.gatlingShotFlash = 1;

    if (radar) {
      radar.registerShot({
        id: this.id,
        isPlayer: this.isPlayer,
        x: this.x + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800),
        y: this.z + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800),
        baseMaxSpeed: this.baseMaxSpeed
      });
    }

    if (window.soundEngine && typeof window.soundEngine.playGatlingShot === 'function') {
      if (this.isPlayer) {
        window.soundEngine.playGatlingShot(this.tankType, 0);
      } else {
        // Xe khác xả đạn: nghe nhỏ dần và trầm dần theo khoảng cách tới người chơi
        const me = window.game && window.game.player, L = window.game && window.game.audioListener ? window.game.audioListener() : me;
        if (me && !me.isDead) {
          const d = Math.hypot(this.x - L.x, this.z - L.z);
          if (d < 1400) window.soundEngine.playGatlingShot(this.tankType, Math.max(1, d), { x: this.x, z: this.z }, this.id);
        }
      }
    }
  }

  // Vũ khí chính lắp trên chân đế mô-đun (xe trinh sát — ô VŨ KHÍ CHÍNH, mô hình roof_mounts.js): súng phóng lựu 40mm HV
  // (quả lựu nổ mảnh, đường đạn theo ballistics.roundParams) hoặc giàn rocket 8 ống (đạn nổ lõm như RPG, phóng lần lượt
  // từng ống). Bắn qua đúng vòng liên thanh của xe trinh sát (giữ Space, dây / giàn, nạp lại) -> đồng bộ mạng như súng máy
  fireMainModule(ballistics, radar) {
    const G = this.mainGun, cfg = SPGUnit3D.MAIN_WEAPONS[G.kind];
    let shell = null;
    if (G.kind === 'rocket') {
      const k = Math.max(0, Math.min(G.muzzles.length - 1, cfg.mag - this.gatlingMag));
      const m = this.getMuzzleWorldTransform();
      const pos = this.barrelGroup.localToWorld(G.muzzles[k].clone());
      this._launchOverride = { position: pos, direction: m.direction };
      try { shell = ballistics.fireShell3D(this, this.azimuth, this.elevation, 1, 'RPG'); } finally { this._launchOverride = null; }
      if (shell && BallisticsSystem3D.MAIN_ROCKET_TRAVEL) shell.maxTravel = BallisticsSystem3D.MAIN_ROCKET_TRAVEL;   // rocket giàn bay xa hơn B-40
      if (shell) shell.aaFuze = true;   // ngòi nổ cận đích: bay sát drone địch là nổ trên không (ballistics airFuze)
      if (G.rounds && G.rounds[k]) G.rounds[k].visible = false;
      // ống hở hai đầu: động cơ cháy ngay trong ống -> chớp miệng ống + luồng lửa & khói trắng phụt ra đuôi ống (xạ thủ đã
      // thụp trong xe đóng nắp; trước đây phóng không có khói lửa nào ở giàn)
      if (shell && G.rear !== undefined) {
        const fx = (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene) ? ExplosionFX.forScene(this.scene) : null;
        const rear = this.barrelGroup.localToWorld(G.muzzles[k].clone().setZ(G.rear + 0.1));
        if (fx && fx.missileLaunch) fx.missileLaunch(pos, m.direction, rear, null);
      }
    } else {
      shell = ballistics.fireShell3D(this, this.azimuth, this.elevation, 1, 'GATLING_BULLET');
      if (shell) {
        shell.isGatling = false; shell.gl40 = true;
        shell.roofDirect = cfg.direct; shell.roofSplash = cfg.splash; shell.roofBlast = cfg.blast;
      }
    }
    if (shell && cfg.spread) {
      const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
      const sp = Math.hypot(shell.vx, shell.vy, shell.vz);
      const ax = Math.atan2(shell.vx, -shell.vz) + g() * cfg.spread, ae = Math.asin(Math.max(-1, Math.min(1, shell.vy / sp))) + g() * cfg.spread;
      shell.vx = Math.sin(ax) * Math.cos(ae) * sp; shell.vy = Math.sin(ae) * sp; shell.vz = -Math.cos(ax) * Math.cos(ae) * sp;
    }
    this.revealTimer = 2.0;
    // phóng lựu: chớp lửa nhỏ + khói đầu nòng, vỏ lựu văng, vai xạ thủ giật (recon_marten / vehicle_crew đọc cờ này)
    if (G.kind !== 'rocket' && shell && this.tankType === 'SCOUT') this.gatlingShotFlash = 1;
    this.barrelRecoil = G.kind === 'rocket' ? 0.15 : 0.6;
    if (this.barrelGroup) this.barrelGroup.position.z = this.barrelRecoil;
    if (radar) radar.registerShot({ id: this.id, isPlayer: this.isPlayer, x: this.x + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800), y: this.z + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800), baseMaxSpeed: this.baseMaxSpeed });
    const SE = window.soundEngine, me = window.game && window.game.player, L = window.game && window.game.audioListener ? window.game.audioListener() : me;
    const d = this.isPlayer || !L ? 0 : Math.max(1, Math.hypot(this.x - L.x, this.z - L.z));
    if (SE && d < 1800) {
      const pos = d ? { x: this.x, z: this.z } : null;
      if (G.kind === 'rocket') { if (SE.playRocketLaunch) SE.playRocketLaunch(d, pos); }
      else if (SE.playGrenadeLauncher) SE.playGrenadeLauncher(d, pos, this.id);
      else if (SE.playGatlingShot) SE.playGatlingShot('SCOUT', d, pos, this.id);
    }
    return shell;
  }

  // ==========================================
  // BẮN ĐẠN CHỐNG TĂNG CỦA XE TRINH SÁT (TÊN LỬA TẦM XA - HỒI CHẬM)
  // ==========================================
  fireAntiTank(ballistics, radar) {
    if (this.dmg && this.dmg.rpgDisabled) return null; // Ống phóng tên lửa đã bị bắn phá
    if (this._crewHidden) return null;  // xạ thủ chưa nhô lên
    if (this._noAtgm) return null;                     // xe trinh sát lắp giàn rocket: không mang ống tên lửa
    if (this.tankType !== 'SCOUT' || this.isDead) return null;
    if (this.antiTankCooldown > 0 || (this.missileAmmoCount || 0) <= 0) return null;

    // Kíp xe nạp quả tiếp theo vào ống phóng (~15 s); hết tên lửa thì quay về súng 30mm
    this.antiTankCooldown = this.antiTankCooldownMax;
    this.missileAmmoCount--;
    // quả cuối: chưa đổi về súng máy ngay — tên lửa bắn drone dẫn theo tia của kính ở chế độ tên lửa (đổi ô đạn = tắt tia,
    // quả đang bay mất dẫn đường). Bay xong mới đổi (updateRecon)
    // quả cuối: chờ quả tên lửa bay nổ xong mới đổi ô đạn (xử lý trong updateRecon)

    const launch = this.getLauncherWorldTransform();
    // ống phóng gắn cố định trên tháp (không ngóc theo súng): không khóa mục tiêu thì dẫn theo hướng nòng súng đang ngắm
    if (this.antiTankLauncherMesh && this.getMuzzleWorldTransform) launch.aimDir = this.getMuzzleWorldTransform().direction;
    this._launchOverride = launch;
    const shell = ballistics.fireShell3D(this, this.azimuth, this.elevation, 1, 'ANTI_TANK_MISSILE');
    this._launchOverride = null;
    if (shell) {
      shell.isAntiTank = true;
      shell.damage = 1.6; // Đòn đánh chống tăng uy lực cao
    }

    this.revealTimer = 3.5;

    // Tên lửa tự đẩy rời ống phóng: không có giật nòng, chỉ luồng phụt ngược + rung nhẹ thân xe
    this.spawnMissileLaunchFX(launch);
    this.kickRecoil(0.05);

    if (radar) {
      radar.registerShot({
        id: this.id,
        isPlayer: this.isPlayer,
        x: this.x + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800),
        y: this.z + (typeof MapGen !== 'undefined' ? MapGen.HALF : 1800),
        baseMaxSpeed: this.baseMaxSpeed
      });
    }

    this.playMissileLaunchSound();

    return shell;
  }

  /** Tên lửa của xe này còn đang bay theo dẫn đường (chưa nổ, chưa mất dẫn đường) */
  missileInFlight() {
    const g = typeof window !== 'undefined' ? window.game : null, B = g && g.ballistics;
    if (!B || !B.activeShells) return false;
    // tên lửa bắn-và-quên (đạn cao cấp 'topatk'): tự bám, xạ thủ không phải giữ kính dẫn -> không tính là đang dẫn
    for (const s of B.activeShells) if (s.shooterId === this.id && s.guide && !s.guide.lost && !s.guide.fnf && !s.exploded) return true;
    return false;
  }

  // ==========================================
  // HỆ THỐNG TRINH SÁT CHIẾN TRƯỜNG (XE TRINH SÁT)
  // Radar quay tròn bắt mục tiêu (kể cả núp bụi) trong bán kính 950M, khóa mục tiêu để báo vị trí cho đồng đội
  // ==========================================
  updateRecon(dt, allUnits, game) {
    if (this.tankType !== 'SCOUT' || this.isDead || !allUnits) return;

    // Giảm thời gian hồi chiêu đạn chống tăng — tên lửa dẫn theo đường ngắm / tia laser: quả đang bay thì xạ thủ còn
    // phải giữ kính trên mục tiêu (thụp sau tấm chắn), chỉ nạp quả mới khi quả này đã nổ / tự hủy / mất dẫn đường
    // (vehicle_crew cộng thêm hồi nạp khi xe chạy nhanh / xạ thủ hy sinh: lúc đang dẫn thì giữ ở mức đầy, không dồn vượt)
    const inFlight = this.missileInFlight();
    const gObj = game || (typeof window !== 'undefined' ? window.game : null), bSys = gObj && gObj.ballistics;
    const anyMissileFlying = !!(bSys && bSys.activeShells && bSys.activeShells.some(s => s.shooterId === this.id && s.isAntiTank && !s.exploded));
    // hết tên lửa, quả cuối đã bay xong: về súng máy
    if (this.selectedAmmo === 'ANTI_TANK_MISSILE' && (this.missileAmmoCount || 0) <= 0 && !anyMissileFlying) {
      this.selectedAmmo = 'SCOUT_BULLET';
      const g = game || (typeof window !== 'undefined' ? window.game : null);
      if (this.isPlayer && g && g.updateAmmoUI) g.updateAmmoUI();
    }
    if (this.antiTankCooldown > 0 && inFlight) this.antiTankCooldown = Math.min(this.antiTankCooldown, this.antiTankCooldownMax || this.antiTankCooldown);
    else if (this.antiTankCooldown > 0) {
      const prevAT = this.antiTankCooldown;
      this.antiTankCooldown = Math.max(0, this.antiTankCooldown - dt);
      // nạp lại ống phóng tên lửa (xe mình): tiếng từng bước đúng lúc hoạt cảnh xạ thủ tới mốc (vehicle_crew AT) —
      // theo tiến độ nên xạ thủ hy sinh / xe chạy nhanh làm nạp chậm lại thì tiếng cũng chờ theo
      const se = this.isPlayer && typeof window !== 'undefined' && window.soundEngine;
      const AT = typeof VehicleCrew !== 'undefined' && VehicleCrew.AT;
      if (se && se.playAtgmReload && AT && !this._noAtgm) {
        const M = this.antiTankCooldownMax || 5.5, p0 = 1 - prevAT / M, p1 = 1 - this.antiTankCooldown / M;
        const has = (this.missileAmmoCount || 0) > 0;
        const steps = [[AT.capOpen[0], 'capOpen', 0], [AT.spentOut[0], 'yank', 0], [AT.toss, 'toss', 0], [AT.lift[0], 'lift', 1],
          [AT.push[0], 'push', 1], [AT.push[1], 'seat', 1], [AT.capClose[0], 'capClose', 1], [AT.ready, 'ready', 1]];
        for (const [a, step, needNew] of steps) if (p0 < a && p1 >= a && (has || !needNew)) se.playAtgmReload(step);
      }
    }

    // Radar quay & phát hiện mục tiêu (kể cả núp bụi) do TeamIntel xử lý theo từng vòng quét thật;
    // ở đây chỉ báo tiếng "ping" cho người chơi khi radar bắt được xe địch núp bụi.
    if (!this.isPlayer || !this.radarContacts) return;
    this.reconScanTimer = (this.reconScanTimer || 0) + dt;
    if (this.reconScanTimer < 0.25) return;
    this.reconScanTimer = 0;
    // Chỉ báo khi radar bắt được xe núp bụi MỚI (trước đây ping + tin nhắn lặp mỗi 2.5 s suốt lúc mục tiêu còn đó)
    // (mục tiêu mất khỏi radar giữa 2 vòng quét rồi bắt lại trong vòng 10 s không tính là mới)
    const seen = this._pingedBush || (this._pingedBush = new Map());
    const nowT = performance.now() / 1000;
    let fresh = false;
    for (const c of this.radarContacts.values()) {
      if (!c.inBush || !c.unit || c.unit.isDead) continue;
      const last = seen.get(c.unit.id);
      if (last === undefined || nowT - last > 10) fresh = true;
      seen.set(c.unit.id, nowT);
    }
    for (const [id, last] of seen) if (nowT - last > 30) seen.delete(id);

    if (fresh) {
      if (window.soundEngine && typeof window.soundEngine.playReconPing === 'function') {
        window.soundEngine.playReconPing();
      }
      if (game && typeof game.addCombatLog === 'function') {
        game.addCombatLog('[[radar-2]] RADAR TRINH SÁT: ĐÃ PHÁT HIỆN MỤC TIÊU ĐỊCH NÚP BỤI RẬM!', 'tip');
      }
    }
  }

  takeDamage(amount, attacker = null, source = 'SHELL') {
    if (this.isDead || this.invulnerableTimer > 0) {
      return { blocked: false, killed: false, prevHp: this.hp, currentHp: this.hp };
    }

    // Bắn nhầm đồng đội / mảnh văng của chính mình: VẪN mất máu như đạn địch (không còn miễn nhiễm cùng phe)

    // Xe mình trúng đạn địch (kể cả phát bị gạch giáp nổ chặn): khoanh vùng nơi kẻ bắn có thể đang đứng trên minimap
    if (this.isPlayer && attacker && source !== 'BURN' && source !== 'WATER' && source !== 'ZONE' && typeof RadarMinimap !== 'undefined') RadarMinimap.noteHit(this, attacker);

    // GIÁP PHẢN ỨNG NỔ (thùng tiếp tế): kích nổ phá hủy đầu đạn -> không mất máu. Đạn nhỏ & sức nổ lan không làm gạch
    // kích nổ, đạn mạnh chỉ bị giảm bớt: game.js quyết theo Equipment.eraEffect rồi đặt _eraIgnore cho các phát đó
    if (this.hasReactiveArmor && (source === 'SHELL' || source === 'DIRECT_HIT') && !this._eraIgnore) {
      this.hasReactiveArmor = false;
      if (this.reactiveArmorMesh) this.reactiveArmorMesh.visible = false;
      this.spawnReactiveArmorTriggerFX();
      return { blocked: true, killed: false, prevHp: this.hp, currentHp: this.hp };
    }

    const prevHp = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    if (amount > 0 && source !== 'BURN' && source !== 'ZONE' && source !== 'WATER') this._lastHitAt = performance.now();

    if (attacker && attacker !== this) {
      attacker.damageDealt += amount;
      // kẻ gây sát thương gần nhất: chết vì cháy / nổ kho đạn ngay sau đó vẫn ghi công hạ cho kẻ này (game.sweepUnhandledDeaths)
      this._lastAttacker = attacker;
      this._lastAttackerAt = performance.now();
      if (!this.isPlayer && source !== 'BURN' && source !== 'WATER') {
        // Ghi nhớ vị trí kẻ bắn để bắn trả: chỉ biết chính xác khi đang thấy / được báo vị trí kẻ đó (TeamIntel).
        // Không thấy: chỉ đoán được hướng đạn bay tới -> vị trí phỏng chừng, sai số ~25% cự ly
        // (trước đây bot luôn biết toạ độ chính xác kẻ bắn kể cả khi kẻ đó núp bụi / ở rất xa)
        const known = typeof TeamIntel === 'undefined' || TeamIntel.knows(this, attacker);
        if (known) this.lastAttackerPos = { x: attacker.x, z: attacker.z };
        else {
          const d = Math.hypot(attacker.x - this.x, attacker.z - this.z);
          const err = Math.max(60, d * 0.25), ea = Math.random() * Math.PI * 2, er = Math.sqrt(Math.random()) * err;
          this.lastAttackerPos = { x: attacker.x + Math.cos(ea) * er, z: attacker.z + Math.sin(ea) * er };
        }
        this.aiTimer = Math.min(this.aiTimer, known ? 0.6 : 1.4);
        // Né tránh: chạy chéo ra xa hướng đạn tới, tối đa 1 lần / 6 s. Đang đứng giữ cứ điểm thì chỉ né ngang
        // một đoạn ngắn (trước đây trúng đạn nào cũng chạy 200 m theo hướng ngẫu nhiên -> bỏ cứ điểm)
        const now = performance.now();
        if (!this._evadeAt || now - this._evadeAt > 6000) {
          this._evadeAt = now;
          this.evadeTimer = 2.4;
          const away = Math.atan2(this.x - attacker.x, this.z - attacker.z) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
          const dist = this._holdingCp ? 45 : 170;
          this.evadeTarget = {
            x: this.clampToMap(this.x + Math.sin(away) * dist, 'x'),
            z: this.clampToMap(this.z + Math.cos(away) * dist, 'z')
          };
        }
      }
    }

    const fxSys = (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene) ? ExplosionFX.forScene(this.scene) : null;
    if (fxSys && this.hp < this.maxHp) fxSys.trackVehicle(this);
    if (this.hp <= 0) {
      this.isDead = true;
      this.deaths++;
      // Kiểu chết (nổ kho đạn / cháy trong / cháy khoang máy...) do explosion_fx.killInfo chọn theo phát trúng cuối
      this._killSource = source;
      // Nổ tung, hất văng tháp pháo theo quán tính đạn và điểm nổ thực tế (sơn cháy sém dần trong explosion_fx)
      if (fxSys) {
        fxSys.onVehicleDestroyed(this, this.lastHitDir || null, this.lastHitPoint || null);
      } else if (this.hullMainMesh && this.hullMainMesh.material) {
        // Không có hệ hiệu ứng: đổi thẳng sang màu xác xe cháy đen
        this.hullMainMesh.material.color.setHex(0x181512);
      }
      if (attacker && attacker !== this) {
        attacker.kills++;
      }
      return { blocked: false, killed: true, prevHp: prevHp, currentHp: 0 };
    }

    return { blocked: false, killed: false, prevHp: prevHp, currentHp: this.hp };
  }

  spawnReactiveArmorTriggerFX() {
    // Vụ nổ cản phá nhỏ phát sáng vàng bảo vệ xe
    if (!this.scene) return;
    const flashGeo = new THREE.SphereGeometry(16, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.set(this.x, this.y + 12, this.z);
    this.scene.add(flashMesh);

    let t = 0;
    const anim = () => {
      t += 0.06;
      flashMesh.scale.addScalar(0.3);
      flashMat.opacity = Math.max(0, 0.95 - t * 2.5);
      if (flashMat.opacity > 0) {
        requestAnimationFrame(anim);
      } else {
        this.scene.remove(flashMesh);
        flashGeo.dispose();
        flashMat.dispose();
      }
    };
    anim();
  }

  // Tái xuất kích xe pháo (vị trí do game chọn ngẫu nhiên trên bản đồ; bodyAngle tùy chọn: hướng thân xe)
  respawn(newX, newZ, bodyAngle) {
    this.x = newX;
    this.z = newZ;
    this.spawnX = newX;
    this.spawnZ = newZ;
    if (typeof bodyAngle === 'number' && isFinite(bodyAngle)) {
      this.bodyAngle = bodyAngle;
      if (this.group) this.group.rotation.y = bodyAngle;
    }
    if (this.botAI) this.botAI.assignedCampPos = null;
    this.y = 0;
    this.submerged = false; this._drownDmg = 0;
    this._suspY = undefined; this._gPrev = undefined; this._vy = 0; this.airborne = false; this._landK = 0; this._gGrace = 0; this._terrainMul = undefined; this._gLX = undefined; this.yawRate = 0; this._wheelSteer = 0; this._gear = 1; this._gearHold = 0; this._wlx = undefined; this._dynPitch = this._dynRoll = 0; this._prevSpeed = undefined;
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;
    this.hasReactiveArmor = false;
    this.speedBoostTimer = 0;
    this.burnTimer = 0;
    this.burnAuth = false;
    this.isInBush = false;
    this.revealTimer = 0;
    this.isHiddenFromPlayer = false;
    if (this.reactiveArmorMesh) this.reactiveArmorMesh.visible = false;
    this.isDead = false;
    this._deathHandled = false;
    this._lastAttacker = null;
    this._lastAttackerAt = 0;
    this.speed = 0;
    this.invulnerableTimer = 3.0; // 3 giây khiên bảo vệ bất tử
    this.reloadTimer = 0;
    this._reloadSndPhase = null;
    this.barrelRecoil = 0;
    this.chassisRecoilPitch = 0;
    this.rockPitch = this.rockRoll = this.rockVelP = this.rockVelR = this.rockHeave = this.rockVelH = 0;
    // giáp mua thêm đã vỡ ở lần xuất kích này: ghi lại (sửa sau trận) trước khi dựng lại xe
    if (typeof Equipment !== 'undefined' && Equipment.noteArmor && this._eq && this._eq.local) Equipment.noteArmor(this);
    if (typeof VehicleDamage !== 'undefined') VehicleDamage.reset(this);
    if (this.crew) { this.crew.left = this.crew.max || 2; this.crew.down = null; this._crewStay = false; }   // xe mới: đủ 2 xạ thủ, đứng súng (vehicle_crew)
    // Xe có trang bị: Equipment.onRespawn tự nạp đạn đặc chủng theo kho, cần đọc số đạn còn lại TRƯỚC khi nạp
    // (để tính số đạn mua đã bắn) -> không nạp cứng ở đây
    const eqAmmo = typeof Equipment !== 'undefined' && !!this._eq;
    if (!eqAmmo) {
      this.apAmmoCount = 2; // Khôi phục 2 quả đạn xuyên phá khi hồi sinh
      this.heAmmoCount = 2; // Khôi phục 2 quả đạn nổ mạnh khi hồi sinh
    }
    // xe mới: nòng nguội, càng thu, vũ khí nóc tháp đầy băng, máy phá sóng đầy pin
    // (trước đây giữ nguyên trạng thái lúc chết: chết khi quá nhiệt -> hồi sinh bị khoá súng; chết khi đã hạ càng -> bắn ngay)
    this.barrelHeat = 0;
    this.isOverheated = false;
    if (this.tankType === 'ARTILLERY') { this.isDeployed = false; this.deployProgress = 0; this.standStillTimer = 0; }
    if (this._rcws && typeof DroneAir !== 'undefined' && DroneAir.roofCfg) { this._rcws.mag = DroneAir.roofCfg(this).mag; this._rcws.reload = 0; }
    if (typeof AmmoLoad !== 'undefined') AmmoLoad.reset(this);   // lần xuất kích mới: cơ số đạn mang theo đầy lại
    this._rkCap = undefined;
    if (this._jam) { this._jam.e = 1; this._jam.on = false; }
    if (this.tankType === 'GATLING') {
      this.gatlingMag = this.gatlingMagMax;
      this.spinUpTime = 0;
      this.isSpinning = false;
    } else if (this.tankType === 'SCOUT') {
      this.gatlingMag = this.gatlingMagMax;
      this.spinUpTime = 0;
      this.isSpinning = false;
      this.antiTankCooldown = 0;
      if (!eqAmmo) this.missileAmmoCount = Math.max(this.missileAmmoCount || 0, 2);   // hồi sinh: ống phóng có ít nhất 2 quả
    }

    // Trang bị mua thêm: nạp lại đạn đặc chủng (miễn phí + mua thêm), lựu đạn khói... cho lần xuất kích mới
    if (typeof Equipment !== 'undefined' && Equipment.onRespawn) Equipment.onRespawn(this);

    const isBlue = this.team === 'BLUE';
    const armorColor = isBlue ? 0xeef2f7 : 0x7c3429;
    if (this.hullMainMesh && this.hullMainMesh.material) {
      const mat = this.hullMainMesh.material;
      const baseColor = (mat.userData && mat.userData.baseColor !== undefined) ? mat.userData.baseColor : armorColor;
      mat.color.setHex(baseColor);
    }
    if (this.turretGroup) {
      this.turretGroup.rotation.z = 0;
      this.turretGroup.rotation.x = 0;
    }
    this.group.visible = true;
  }

  // Tối ưu bóng đổ: chi tiết rất nhỏ (bu-lông, móc kéo, ăng-ten mảnh...) không đổ bóng — từ camera trên cao không thấy
  // khác biệt nhưng bớt hàng chục lượt vẽ trong bản đồ bóng mỗi khung hình
  trimShadows() {
    if (!this.group) return;
    this.group.traverse(o => {
      if (!o.isMesh || !o.castShadow || o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (bs && bs.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 1.6) o.castShadow = false;
    });
  }

  // Xác xe nằm lại suốt trận: ngay trước khi xuất kích lại, tách nguyên mô hình đang có (móp, cháy sém, tháp văng, bánh /
  // xích rơi — cùng toàn bộ trạng thái hư hại VehicleDamage) thành một "xác" độc lập, vẫn bắn rã tiếp được như lúc vừa bị
  // hạ, rồi dựng mô hình mới cho xe. Trả về xác (cùng lớp, isDead, id riêng) hoặc null nếu không tách được (respawn khi đó
  // trả mô hình cũ về nguyên vẹn như trước)
  detachWreck() {
    const job = this.beginDetachWreck();
    if (!job) return null;
    while (!job.step()) { /* chạy liền một mạch */ }
    return job.W;
  }

  // Tách xác theo từng bước (game.js prepRespawn dựng sẵn trong lúc chờ hồi sinh, mỗi khung một ít): lượt này tách xác
  // + dựng khung mô hình mới; job.step() gắn tiếp trang bị (Equipment.refitSteps) từng phần, true = xong (đã tách riêng
  // vật liệu dùng chung). null nếu không tách được
  beginDetachWreck() {
    if (!this.isDead || !this.group || !this.group.parent || !this.group.visible || !this._modelKeys || typeof TankModelBuilder === 'undefined') return null;
    // tình trạng giáp lắp thêm của lần xuất kích này: ghi trước khi bộ hư hại chuyển sang xác
    if (typeof Equipment !== 'undefined' && Equipment.noteArmor && this._eq && this._eq.local) Equipment.noteArmor(this);
    const W = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    this._wreckN = (this._wreckN || 0) + 1;
    W.id = `${this.id}~wreck${this._wreckN}`;
    W.wreckOf = this;
    W.isWreckHulk = true;
    W.isPlayer = false; W.isRemotePlayer = false; W._netProxy = false; W.botAI = null;
    delete W.netId;
    if (W.hpGroup) W.hpGroup.visible = false;
    if (W.reactiveArmorMesh) W.reactiveArmorMesh.visible = false;

    // Gỡ khỏi xe mọi tham chiếu vào mô hình cũ (kể cả tháp đã văng khỏi thân): thuộc tính do mô hình đặt (_modelKeys),
    // trạng thái hư hại / lưới lá ngụy trang, và mọi thuộc tính khác còn trỏ vào đối tượng 3D cũ (cụm gắn thêm trong trận)
    const old = new Set();
    for (const root of [this.group, this.turretGroup]) if (root && root.isObject3D) root.traverse(o => old.add(o));
    const refsOld = (v, depth) => {
      if (!v || typeof v !== 'object') return false;
      if (v.isObject3D) return old.has(v);
      if (depth <= 0) return false;
      const proto = Object.getPrototypeOf(v);
      const vals = Array.isArray(v) ? v : (proto === Object.prototype || proto === null ? Object.values(v) : null);
      if (!vals) return false;
      for (let i = 0; i < vals.length && i < 32; i++) if (refsOld(vals[i], depth - 1)) return true;
      return false;
    };
    if (typeof VehicleDamage !== 'undefined' && VehicleDamage.handOver) VehicleDamage.handOver(this, W);
    const drop = new Set(this._modelKeys.concat(['camoFire', '_cfStatic', '_groupsMarked', 'partGroups', '_eqBuilt', '_eqRadarHead', '_stockSmokeHidden']));
    const removed = {};
    for (const k of Object.keys(this)) {
      if (k === '_modelKeys' || !(drop.has(k) || refsOld(this[k], 3))) continue;
      removed[k] = this[k];
      delete this[k];
    }
    this.fxDestroyed = false;
    this.fxWreck = null;
    this._killSource = null;

    try {
      TankModelBuilder.buildModel(this);
    } catch (err) {
      console.warn('[SPG] detachWreck: không dựng được mô hình mới, giữ mô hình cũ', err);
      if (this.group && this.group !== W.group && this.group.parent) this.group.parent.remove(this.group);
      Object.assign(this, removed);
      this.dmg = W.dmg; this.fxDestroyed = W.fxDestroyed; this.fxWreck = W.fxWreck; this._killSource = W._killSource;
      return null;
    }
    this.trimShadows();
    this.group.position.set(this.x, this.y || 0, this.z);
    this.group.rotation.y = this.bodyAngle || 0;
    let it = typeof Equipment !== 'undefined' && Equipment.refitSteps ? Equipment.refitSteps(this) : null;
    if (!it && typeof Equipment !== 'undefined' && Equipment.refit) Equipment.refit(this);
    let done = false;
    const finish = () => {
      // Vật liệu dùng chung giữa xác và mô hình mới (bộ vật liệu đệm theo phe...): xác lấy bản riêng giữ màu cháy sém,
      // bản chung trả màu gốc — không thì xe mới ra trận đen thui theo xác
      const fresh = new Set();
      this.group.traverse(o => { if (o.material) for (const m of [].concat(o.material)) fresh.add(m); });
      const swap = new Map();
      const own = m => {
        if (!m || !fresh.has(m)) return m;
        let c = swap.get(m);
        if (!c) {
          c = m.clone();
          // clone() không chép shader vá (sơn ngụy trang, lớp bẩn, muội / gỉ cháy theo vkChar) -> xác giữ nguyên vẻ cháy
          c.onBeforeCompile = m.onBeforeCompile;
          c.customProgramCacheKey = m.customProgramCacheKey;
          c.userData = Object.assign({}, m.userData);
          swap.set(m, c);
        }
        return c;
      };
      for (const root of [W.group, W.turretGroup]) {
        if (root && root.isObject3D) root.traverse(o => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
      }
      if (swap.size) {
        for (const m of swap.keys()) {
          if (m.userData && m.userData.fxOrigColor) { m.color.copy(m.userData.fxOrigColor); delete m.userData.fxOrigColor; }
          if (m.userData) delete m.userData.vkChar;
        }
        if (W.fxWreck && W.fxWreck.charMats) W.fxWreck.charMats = W.fxWreck.charMats.map(m => swap.get(m) || m);
      }
    };
    return {
      W,
      step: () => {
        if (done) return true;
        if (it) { if (!it.next().done) return false; it = null; }
        finish();
        done = true;
        return true;
      }
    };
  }

  // Kẹp toạ độ trong biên bản đồ thật (trước đây kẹp cứng ±1600 của bản đồ 3600 cũ -> bot ở cứ điểm A/C x≈±2790
  // hễ né đạn là phóng hơn 1000 đơn vị về giữa bản đồ, bỏ cứ điểm)
  clampToMap(v, axis) {
    const h = (axis === 'z' ? this._mapHalfZ : this._mapHalfX) || 8000;
    return Math.max(-h, Math.min(h, v));
  }

  // Cảnh báo đạn pháo đang lao xuống gần xe: bot lập tức cơ động né đạn
  alertIncomingShell(shellX, shellZ) {
    if (this.isDead || this.isPlayer) return;
    // nhịp phản xạ như người: nghe tiếng rít ~0,25-0,7 s mới bẻ lái, ~15% lượt không kịp nhận ra (trước đây né tức thì,
    // lần nào cũng né). Lời gọi lặp mỗi khung khi đạn còn rơi gần -> một lượt cảnh báo kéo dài tới 3 s
    const now = performance.now();
    if (!this._shellAlertAt || now - this._shellAlertAt > 3000) {
      this._shellAlertAt = now;
      this._shellReactAt = Math.random() < 0.15 ? Infinity : now + 250 + Math.random() * 450;
    }
    if (now < this._shellReactAt) return;
    if (this.evadeTimer > 0 && this.aiState === 'evading') return;   // đang né sẵn: không đổi hướng giữa chừng
    this.evadeTimer = 2.8;
    const awayAngle = Math.atan2(this.x - shellX, this.z - shellZ) + (Math.random() - 0.5) * 0.6;
    // đang giữ cứ điểm: né vừa đủ ra khỏi tâm nổ rồi quay lại, không bỏ cứ điểm
    const dist = this._holdingCp ? 70 : 220;
    this.evadeTarget = {
      x: this.clampToMap(this.x + Math.sin(awayAngle) * dist, 'x'),
      z: this.clampToMap(this.z + Math.cos(awayAngle) * dist, 'z')
    };
    this.aiState = 'evading';
  }

  // TRÍ TUỆ NHÂN TẠO BOT TÁC CHIẾN ĐA TẦNG
  updateAI(dt, terrain, ballistics, radar, allUnits, airdrop = null, supplyCrates = null, capturePoints = null) {
    if (!this.botAI && typeof BotAIController !== 'undefined') {
      this.botAI = new BotAIController(this);
    }
    if (this.botAI) {
      this.botAI.update(dt, terrain, ballistics, radar, allUnits, airdrop, supplyCrates, capturePoints);
    }
  }

  driveTowards(targetX, targetZ, dt, isBoost = false) {
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    this.steer(dx, dz, dt, isBoost);
  }
}

// Vũ khí chính lắp trên chân đế mô-đun của xe trinh sát (ô VŨ KHÍ CHÍNH): rof nhịp bắn (s), mag số đạn / dây, reload
// thời gian nạp lại (giây thật), direct / splash / blast: sát thương gốc trúng thẳng / nổ sát & vùng nổ của quả lựu
SPGUnit3D.MAIN_WEAPONS = {
  agl: { rof: 0.25, mag: 48, reload: 12, spread: 0.01, direct: 0.42, splash: 0.65, blast: { radius: 30, core: 7 }, name: 'LỰU 40MM' },
  rocket: { rof: 0.6, mag: 8, reload: 25, spread: 0.008, name: 'ROCKET' }
};
// Mốc tiếng thay đạn xe trinh sát theo mốc hoạt cảnh 0..1 (chưa qua VehicleCrew MG_WARP) — PHẢI khớp hoạt cảnh recon_marten (nắp / hộp / dây đạn) và
// vehicle_crew (MG_KEYS, CHARGE_KEYS: kéo 0.92 -> buông 0.944, kéo 0.955 -> buông 0.974)
SPGUnit3D.SCOUT_RELOAD_STEPS = [
  [0.08, 'coverOpen'], [0.14, 'beltOut'], [0.28, 'boxOut'], [0.46, 'boxDrop'], [0.54, 'boxGrab'], [0.70, 'boxSeat'], [0.75, 'lidOpen'],
  [0.79, 'belt'], [0.915, 'coverClose'], [0.92, 'pull'], [0.944, 'release'], [0.955, 'pull'], [0.974, 'chamber']
];
// giàn rocket: pha trong lượt nạp mỗi quả (vehicle_crew rocketPhase / carryRocket)
// (khớp VehicleCrew RK_PH: nhấc 0.3 · tống 0.78 -> chốt 0.92)
SPGUnit3D.SCOUT_ROCKET_STEPS = [[0.06, 'rOpen'], [0.34, 'rLift'], [0.76, 'rPush'], [0.90, 'rSeat'], [0.98, 'rLock']];
// Nạp thông minh xe trinh sát (scoutSmartReload): ngừng bắn bao lâu (giây) thì tự thay đạn · mốc hoạt cảnh hộp cũ bắt đầu
// rời khay (khớp recon_marten / MG_KEYS 0.28 — trước mốc này bóp cò thì sập nắp bắn tiếp) · thời gian sập nắp (giây)
SPGUnit3D.SCOUT_IDLE_RELOAD = 4;
SPGUnit3D.SCOUT_EMPTY_WAIT = 1.2;   // bắn hết đạn: chờ bấy nhiêu giây rồi xạ thủ mới bắt đầu thay
SPGUnit3D.MG_BOX_OUT = 0.28;
SPGUnit3D.MG_ABORT_T = 0.22;
SPGUnit3D.RK_ABORT_T = 1.2;   // giàn rocket: bóp cò lúc đang nạp -> xạ thủ chui về xe bấy nhiêu giây rồi giàn mới phóng
window.SPGUnit3D = SPGUnit3D;
