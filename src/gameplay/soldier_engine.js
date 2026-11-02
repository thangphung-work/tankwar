/**
 * ENGINE CHIẾN SĨ (SoldierEngine) — lớp nền chung cho mọi đơn vị bộ binh (súng trường, SWAT, chống tăng, bắn tỉa,
 * công binh mìn, phóng lựu, súng cối...). Tách bạch theo lớp:
 *   - Hình (SoldierModel.buildFigure: lưới skinned ~20 lượt vẽ)       - Động tác (SoldierModel.animateMotion)
 *   - Bộ máy di chuyển (Motor): tăng/giảm tốc, quay người (chân bước theo), dốc, nước, va chạm, bám đất,
 *     men tường + tìm đường lưới mịn riêng cho bộ binh khi bị chặn
 *   - Ý định (intent): AI hay người chơi chỉ ra lệnh "đi tới / dừng / ngắm / tư thế / hướng canh"
 *   - Tổ (Squad): đội hình, mỗi người canh một hướng khi đi, dừng thì quỳ cảnh giới vòng tròn, phản ứng lệnh lệch nhau
 *   - Thế giới (World): danh sách lính, tránh nhau, cập nhật thưa cho lính xa / ngoài khung nhìn, bóng đổ theo cự ly
 * Đơn vị: 8 đv = 1 m (như xe & địa hình). Hướng: heading = góc quay root quanh Y, mặt trước = (-sin h, 0, -cos h).
 */
const SoldierEngine = (() => {
  const RADIUS = 2.4;                  // bán kính thân khi va chạm (~30 cm: vai + áo giáp)
  const CFG = {
    accel: 34, decel: 52,              // đv/s² (~4,2 / 6,5 m/s²): người mang trang bị không bứt / dừng tức thì
    turnWalk: 4.5, turnRun: 3.2, turnIdle: 5.0,   // rad/s quay người
    climbMax: 1.0,                     // dốc tối đa đi được (tan góc ~45°)
    wadeMax: 9.6,                      // nước sâu tối đa lội được (~1,2 m)
    arrive: 3.5,                       // bán kính coi như tới điểm
    stuckTime: 0.8,                    // tiến < 40% dự kiến trong khoảng này -> tìm đường vòng
    navCell: 6, navMargin: 160, navMaxCells: 26000,
    sight: 1600,                       // tầm nhìn phát hiện ~200 m (giảm khi mục tiêu trong bụi / rừng)
    fovGuard: 220 * Math.PI / 180,     // canh gác: góc quan sát rộng (đảo mắt quanh hướng canh)
    fovMove: 140 * Math.PI / 180,
    perceive: 0.25,                    // giây giữa 2 lần quét
    lostAfter: 3.0                     // mất dấu bao lâu thì thôi giao chiến, quay lại lệnh cũ
  };
  // thông số vũ khí cho giao chiến tự động (game nối đường đạn thật qua World.onFire)
  const ARMS = {
    // spread: độ tản (phần của cự ly) phát chỉnh bắn; first: lệch thêm ở phát đầu (chưa ước đúng cự ly); acquire: giây ngắm / ước cự ly trước phát đầu
    gl: { mag: 6, rof: 0.85, reload: 4.6, range: 3200, minRange: 48, kneelBeyond: 160, spread: 0.022, first: 0.06, acquire: [0.9, 1.6] },
    rifle: { mag: 30, rof: 0.18, reload: 2.8, range: 2400, minRange: 0, kneelBeyond: 240, spread: 0.006, first: 0.01, acquire: [0.4, 0.8] }
  };
  const GS = () => SoldierModel.GAIT_SPEED;
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const rnd = (a, b) => a + Math.random() * (b - a);
  let uid = 0;

  class Soldier {
    /**
     * @param {World} world
     * @param {Object} o - { team, x, z, heading, weapon, role, size }
     */
    constructor(world, o = {}) {
      this.world = world;
      this.id = ++uid;
      this.team = o.team || 'BLUE';
      this.role = o.role || 'rifleman';
      this.figure = SoldierModel.buildFigure(this.team, { role: 'infantry', weapon: o.weapon, renderOrder: 2 });
      this.root = this.figure.root;
      // khác biệt từng người: cỡ người ±5% (sải chân & tốc độ theo cỡ -> chân vẫn không trượt), phản xạ, kiểu đảo mắt
      this.k = o.size || rnd(0.95, 1.05);
      this.root.scale.setScalar(this.k);
      this.react = rnd(0.1, 0.7);
      this.scanFreq = rnd(0.35, 0.65); this.scanPh = rnd(0, 6.28); this.scanAmp = rnd(0.28, 0.42);
      world.scene.add(this.root);
      this.x = o.x || 0; this.z = o.z || 0;
      this.heading = o.heading || 0;
      this.y = world.groundAt(this.x, this.z, null);
      this.speed = 0;                    // tốc độ thực (đv/s) theo hướng mặt
      this.turnNow = 0;                  // tốc độ quay thực (rad/s)
      this.alive = true;
      this.intent = { gait: 'walk', target: null, path: null, aim: null, stance: 'stand', sector: 0, scan: false, face: null };
      this.motion = 'idle';
      this.lookYaw = 0;
      this.animT = Math.random() * 10;
      this._prog = { t: 0, d: 0 };
      this._orders = [];
      this._wall = 0; this._wallT = 0;
      // canh gác & giao chiến
      this.guard = !!o.guard;
      this.sight = o.sight || CFG.sight;
      this.weapon = this.figure.weapon;
      const A = ARMS[this.weapon] || ARMS.rifle;
      this.arms = { def: A, mag: A.mag, cd: 0, reload: 0 };
      this.enemy = null; this._seen = 0; this._percT = Math.random() * CFG.perceive; this._resume = null;
      this.hp = 100;
      this.squad = null;
      this.applyTransform();
    }

    // ----- Ý ĐỊNH (API cho AI / người chơi / tổ) -----
    // delay: giây trễ trước khi thực hiện (phản xạ người thật; tổ dùng để không ai xuất phát cùng lúc)
    order(fn, delay = 0) { if (delay > 0) this._orders.push({ t: delay, fn }); else fn(); }
    moveTo(x, z, gait, delay = 0) {
      this.order(() => {
        const I = this.intent;
        const same = I.target && I.path && Math.hypot(I.target.x - x, I.target.z - z) < 12;
        I.target = { x, z }; if (!same) I.path = null; I.aim = null; I.face = null;
        if (gait) I.gait = gait;
        if (I.stance === 'kneel') I.stance = 'stand';
        this._prog.t = 0; this._prog.d = 0; this._wallT = 0;
        // đường thẳng bị nhà / tường / cây chặn: tính đường vòng ngay (người thật nhìn thấy tường, không húc vào rồi mới tính)
        if (!same && !this.world.lineFree(this.x, this.z, x, z)) this.replan();
      }, delay);
    }
    stop() { this.intent.target = null; this.intent.path = null; }
    aimAt(x, y, z) { this.intent.aim = { x, y, z }; }
    clearAim() { this.intent.aim = null; }
    setStance(s) { this.intent.stance = s; }          // 'stand' | 'kneel'
    faceTo(h) { this.intent.face = h; }               // hướng đứng / quỳ khi không di chuyển (rad)
    setSector(a, scan = true) { this.intent.sector = a; this.intent.scan = scan; }   // hướng canh (rad so với mặt trước, + = trái)
    get forwardX() { return -Math.sin(this.heading); }
    get forwardZ() { return -Math.cos(this.heading); }
    hitboxes() { return SoldierModel.getHitboxes(this.figure); }
    setGuard(on) { this.guard = !!on; if (!on) this.disengage(false); }

    // ----- CANH GÁC & GIAO CHIẾN -----
    // phát hiện địch (quét thưa) -> sau thời gian phản xạ: dừng, quỳ (xa) / đứng (gần), quay & ngắm, bắn theo nhịp vũ khí,
    // hết đạn thì nạp; mất dấu > lostAfter giây thì quay lại lệnh đang làm dở. Cả tổ được báo vị trí địch ngay.
    combat(dt) {
      const W = this.world, A = this.arms;
      A.cd -= dt;
      if (A.reload > 0 && (A.reload -= dt) <= 0) A.mag = A.def.mag;
      if ((this._percT -= dt) <= 0) {
        this._percT = CFG.perceive;
        if (this.enemy && (!this.enemy.alive || !W.isEnemy(this, this.enemy))) this.enemy = null;
        if (this.enemy) {
          if (W.canSee(this, this.enemy)) this._seen = 0; else this._seen += CFG.perceive;
          if (this._seen > CFG.lostAfter) this.disengage(true);
        } else if (this.guard && !this._pendingEnemy) {
          const t = W.spot(this);
          if (t) {
            this._pendingEnemy = t;
            this.order(() => { this._pendingEnemy = null; this.engage(t); if (this.squad) this.squad.contact(t, this); }, this.react + 0.25);
          }
        }
      }
      const E = this.enemy;
      if (!E) return;
      // ngắm vào ngực mục tiêu (xe: giữa thân); đứng / quỳ theo cự ly
      const tx = E.x, tz = E.z, ty = E.y + (E.aimH || 9);
      this.aimAt(tx, ty, tz);
      const d = Math.hypot(tx - this.x, tz - this.z);
      this.setStance(d > A.def.kneelBeyond ? 'kneel' : 'stand');
      const dh = Math.abs(angDiff(this.heading, Math.atan2(-(tx - this.x), -(tz - this.z))));
      if (this._seen === 0 && dh < 0.08 && this.speed < 0.6 && A.cd <= 0 && A.reload <= 0 && d <= A.def.range && d >= A.def.minRange) {
        if (A.mag > 0) {
          A.mag--; A.cd = A.def.rof * rnd(0.9, 1.25);
          this._recoil = 1;
          // độ tản: phát đầu lệch nhiều (ước sai cự ly), các phát sau chỉnh dần theo điểm nổ
          const e = d * (A.def.spread + A.def.first * Math.max(0, 1 - (this._shots || 0) / 3)), ea = Math.random() * Math.PI * 2, er = e * Math.sqrt(Math.random());
          this._shots = (this._shots || 0) + 1;
          if (W.onFire) W.onFire(this, E, { x: tx + Math.cos(ea) * er, y: ty, z: tz + Math.sin(ea) * er, dist: d, weapon: this.weapon });
        }
        if (A.mag <= 0) A.reload = A.def.reload;
      }
    }
    engage(t) {
      if (!t || !t.alive || this.enemy === t) return;
      if (!this.enemy) {
        // nhớ lệnh đang làm dở để quay lại sau khi hết địch
        const I = this.intent;
        this._resume = I.target ? { x: I.target.x, z: I.target.z, gait: I.gait } : null;
        this._resumeStance = I.stance;
        this.stop();
      }
      this.enemy = t; this._seen = this.world.canSee(this, t) ? 0 : CFG.perceive;
      this._shots = 0;
      const q = this.arms.def.acquire; this.arms.cd = Math.max(this.arms.cd, rnd(q[0], q[1]));   // ngắm & ước cự ly trước phát đầu
    }
    disengage(resume) {
      this.enemy = null; this._pendingEnemy = null; this.clearAim();
      if (resume && this._resume) { const R = this._resume; this.moveTo(R.x, R.z, R.gait, this.react); }
      else if (this._resumeStance) this.setStance(this._resumeStance);
      this._resume = null;
    }
    // trúng đạn / mảnh / sóng nổ (game gọi): hết máu thì ngã
    damage(amount, src) {
      if (!this.alive) return false;
      this.hp -= amount;
      if (this.hp <= 0) { this.kill(src); return true; }
      return false;
    }
    revive(x, z, heading) {
      this.alive = true;
      this.hp = 100;
      if (x != null) this.x = x;
      if (z != null) this.z = z;
      if (heading != null) this.heading = heading;
      this.y = this.world.groundAt(this.x, this.z, null);
      this.speed = 0;
      this.turnNow = 0;
      this.enemy = null;
      this._seen = 0;
      this.root.rotation.set(0, this.heading, 0);
      this.applyTransform();
    }
    kill() {
      this.alive = false; this.enemy = null;
      if (this.squad) this.squad.onDeath(this);
      // tạm: ngã ngửa nằm trên đất (động tác ngã thật làm ở bước tư thế nằm)
      this.root.rotation.set(-Math.PI / 2 * 0.96, this.heading, 0, 'YXZ');
      this.root.position.y = this.y + 1.2;
    }

    // ----- BỘ MÁY DI CHUYỂN -----
    update(dt, animate = true) {
      if (!this.alive) return;
      this.combat(dt);
      for (let i = this._orders.length - 1; i >= 0; i--) { const o = this._orders[i]; if ((o.t -= dt) <= 0) { this._orders.splice(i, 1); o.fn(); } }
      const W = this.world, I = this.intent;
      // 1. điểm cần tới lúc này
      let goal = null;
      if (I.path && I.path.length) {
        goal = I.path[0];
        if (Math.hypot(goal.x - this.x, goal.z - this.z) < CFG.arrive * 1.6 && I.path.length > 1) { I.path.shift(); goal = I.path[0]; }
      } else if (I.target) goal = I.target;
      let wantSpeed = 0, wantHeading = this.heading;
      if (goal) {
        const dx = goal.x - this.x, dz = goal.z - this.z, d = Math.hypot(dx, dz);
        const last = !I.path || I.path.length <= 1;
        if (last && d < CFG.arrive) { this.stop(); }
        else {
          wantHeading = Math.atan2(-dx, -dz);
          wantSpeed = (GS()[I.gait] || GS().walk) * this.k * (I.speedMul || 1);
          if (last) wantSpeed *= Math.max(0.4, Math.min(1, d / 20));      // giảm tốc khi gần đích
          // men tường: đang bị chặn thẳng hướng -> lệch sang một bên tới khi thoát
          if (this._wallT > 0) { this._wallT -= dt; wantHeading += this._wall; }
        }
      } else if (I.aim) wantHeading = Math.atan2(-(I.aim.x - this.x), -(I.aim.z - this.z));
      else if (I.face != null) wantHeading = I.face;
      // 2. quay người có giới hạn; lệch nhiều thì chậm lại để xoay trước rồi mới bước tiếp
      const turn = (wantSpeed > 14 ? CFG.turnRun : wantSpeed > 0 ? CFG.turnWalk : CFG.turnIdle) * dt;
      const dh = angDiff(this.heading, wantHeading), applied = Math.max(-turn, Math.min(turn, dh));
      this.heading += applied;
      this.turnNow = Math.abs(applied) / Math.max(1e-4, dt);
      wantSpeed *= Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(dh) * 1.3)));
      // 3. địa hình: dốc lên chậm, xuống hơi chậm, nước lội chậm
      if (wantSpeed > 0) {
        const fx = this.forwardX, fz = this.forwardZ;
        const h0 = W.groundAt(this.x, this.z, this.y), h1 = W.groundAt(this.x + fx * 4, this.z + fz * 4, this.y);
        const grade = (h1 - h0) / 4;
        wantSpeed *= grade > 0 ? Math.max(0.3, 1 - grade * 0.85) : Math.max(0.7, 1 + grade * 0.35);
        const wd = W.waterDepth(this.x, this.z);
        if (wd > 0) wantSpeed *= Math.max(0.35, 1 - wd / 12);
      }
      // 4. tăng / giảm tốc
      const a = wantSpeed > this.speed ? CFG.accel : CFG.decel;
      this.speed += Math.max(-a * dt, Math.min(a * dt, wantSpeed - this.speed));
      if (this.speed < 0.05 && wantSpeed === 0) this.speed = 0;
      // 5. bước + va chạm
      if (this.speed > 0) {
        const step = this.speed * dt;
        let nx = this.x + this.forwardX * step, nz = this.z + this.forwardZ * step;
        const p = W.collide(this, this.x, this.z, nx, nz);
        nx = p.x; nz = p.z;
        const gN = W.groundAt(nx, nz, this.y), gC = W.groundAt(this.x, this.z, this.y);
        const moved = Math.hypot(nx - this.x, nz - this.z);
        const ok = !(moved > 1e-3 && (gN - gC) / moved > CFG.climbMax) && W.waterDepth(nx, nz) <= CFG.wadeMax;
        if (ok) { this.x = nx; this.z = nz; }
        const real = (ok ? moved : 0) / Math.max(1e-4, dt);
        // bị chặn thẳng: chọn phía men theo tường (phía vật cản đẩy ra) trong ~0,9 s
        if (goal && real < 0.4 * this.speed && this._wallT <= 0) {
          const sx = p.x - (this.x + this.forwardX * step), sz = p.z - (this.z + this.forwardZ * step);
          const side = (-this.forwardZ * sx + this.forwardX * sz) >= 0 ? -1 : 1;
          this._wall = side * 1.1; this._wallT = 0.9;
        }
        this.speed = Math.min(this.speed, real + 0.5);
        // 6. kẹt lâu: dựng đường vòng trên lưới mịn bộ binh
        this._prog.t += dt; this._prog.d += real * dt;
        if (this._prog.t > CFG.stuckTime) {
          if (goal && this._prog.d < 0.4 * (GS()[I.gait] || 9) * this._prog.t) this.replan();
          this._prog.t = 0; this._prog.d = 0;
        }
      } else { this._prog.t = 0; this._prog.d = 0; }
      // 7. bám mặt đất
      const g = W.groundAt(this.x, this.z, this.y);
      this.y += (g - this.y) * Math.min(1, dt * 18);
      this.applyTransform();
      // 8. hướng canh: thân + đầu + súng đảo quanh hướng được giao (đi tuần mạnh, đi bộ vừa, chạy thì nhìn thẳng)
      const scanK = !I.scan ? 0 : this.motion === 'patrol' ? 1 : this.motion === 'walk' ? 0.6 : this.motion === 'run' ? 0 : 0.8;
      const t = this.animT;
      const ly = scanK * (I.sector * 0.75 + this.scanAmp * Math.sin(t * this.scanFreq + this.scanPh) * (0.6 + 0.4 * Math.sin(t * 0.21 + this.id)));
      this.lookYaw += (Math.max(-1.1, Math.min(1.1, ly)) - this.lookYaw) * Math.min(1, dt * 2.5);
      this.figure.lookYaw = this.lookYaw;
      // 9. động tác: nhịp bước chạy theo tốc độ thực (chia cỡ người) -> bàn chân không trượt
      this.pickMotion();
      const base = GS()[this.motion];
      const rate = this._turnStep ? 0.55 : base ? Math.max(0.35, this.speed / (base * this.k)) : 1;
      this.animT += dt * rate;
      if (animate) {
        SoldierModel.animateMotion(this.figure, this.motion, this.animT, 1);
        if (I.aim && this.speed < 0.6 && this.motion !== 'aim' && this.motion !== 'crouch') SoldierModel.lookAt(this.figure, new THREE.Vector3(I.aim.x, I.aim.y, I.aim.z));
      }
    }

    pickMotion() {
      const I = this.intent, s = this.speed / this.k, G = GS();
      // quay tại chỗ nhanh: chân bước theo (không xoay như bàn xoay)
      this._turnStep = s < 0.6 && this.turnNow > 0.9 && I.stance !== 'kneel';
      if (this._turnStep) this.motion = I.gait === 'patrol' ? 'patrol' : 'walk';
      else if (s < 0.6) this.motion = I.stance === 'kneel' ? 'crouch' : I.aim ? 'aim' : 'idle';
      else if (s > (G.walk + G.run) * 0.5) this.motion = 'run';
      else this.motion = I.gait === 'patrol' ? 'patrol' : 'walk';
    }

    replan() {
      const I = this.intent, dst = I.target;
      if (!dst) return;
      const path = this.world.findPath(this.x, this.z, dst.x, dst.z);
      if (path && path.length) { I.path = path; this._wallT = 0; }
    }

    applyTransform() {
      if (!this.alive) return;   // xác: giữ tư thế ngã
      this.root.position.set(this.x, this.y - SoldierModel.FOOT_Y * this.k, this.z);
      this.root.rotation.y = this.heading;
    }

    dispose() {
      this.alive = false;
      this.world.scene.remove(this.root);
      this.root.traverse(o => { if (o.isSkinnedMesh && !o.geometry.userData.shared) o.geometry.dispose(); });   // lưới mẫu dùng chung giữa các lính
    }
  }

  // ---------- TỔ: đội hình, hướng canh, dừng thì quỳ cảnh giới ----------
  // vị trí (mét, hệ người dẫn: x phải, z sau) + hướng canh (độ, + = trái) — tổ bộ binh thật mỗi người một khu vực quan sát
  const FORMATIONS = {
    wedge: [[0, 0, 0], [-4, 4, 55], [4, 4, -55], [-8, 8, 95], [8, 8, -95], [-12, 12, 130], [12, 12, -130], [0, 10, 180]],
    column: [[0, 0, 0], [0, 5, 60], [0, 10, -60], [0, 15, 90], [0, 20, -90], [0, 25, 120], [0, 30, -120], [0, 35, 180]],
    line: [[0, 0, 0], [-5, 0, 25], [5, 0, -25], [-10, 0, 45], [10, 0, -45], [-15, 0, 60], [15, 0, -60], [-20, 0, 75]]
  };
  class Squad {
    constructor(world, members, formation = 'wedge') {
      this.world = world; this.members = members; this.formation = formation;
      this.leader = members[0]; this._t = 0; this.halted = true; this._haltT = 0; this.gait = 'walk';
      this.selected = new Set(members);          // đang chọn để ra lệnh (mặc định cả tổ)
      for (const m of members) { m.squad = this; m.detached = false; }
      this.assignSectors();
    }
    // ----- CHỌN & RA LỆNH: cả tổ hoặc từng người -----
    alive() { return this.members.filter(m => m.alive); }
    select(which) {
      // 'all' | chỉ số (0-based) | mảng chỉ số
      const A = this.members;
      this.selected = new Set(which === 'all' ? A.filter(m => m.alive) : [].concat(which).map(i => A[i]).filter(m => m && m.alive));
      return [...this.selected];
    }
    get allSelected() { return this.alive().every(m => this.selected.has(m)); }
    // đi tới điểm: chọn cả tổ -> đi theo đội hình; chọn từng người -> những người đó tách ra đi riêng, toả quanh điểm đích
    cmdMove(x, z, gait = this.gait) {
      if (this.allSelected) { for (const m of this.members) m.detached = false; return this.moveTo(x, z, gait); }
      const L = [...this.selected], n = L.length;
      L.forEach((m, i) => {
        m.detached = true; m.disengage(false);
        const a = n > 1 ? i / n * Math.PI * 2 : 0, r = n > 1 ? 14 : 0;
        m.moveTo(x + Math.cos(a) * r, z + Math.sin(a) * r, gait, m.react * 0.5);
      });
    }
    cmdHold() { for (const m of this.selected) { m.stop(); m.detached = true; } }
    cmdRejoin() { for (const m of this.selected) m.detached = false; this.follow(true); }
    cmdGuard(on) { for (const m of this.selected) m.setGuard(on); }
    cmdStance(st) { for (const m of this.selected) m.setStance(st); }
    // một người thấy địch -> báo cả tổ (đồng đội biết vị trí địch & của nhau)
    contact(t, from) {
      for (const m of this.members) if (m !== from && m.alive && m.guard && !m.enemy) m.order(() => m.engage(t), m.react * 0.6 + 0.2);
    }
    onDeath(m) {
      this.selected.delete(m);
      if (m === this.leader) { const a = this.alive(); if (a.length) this.leader = a[0]; }
    }
    slot(i) { const S = FORMATIONS[this.formation] || FORMATIONS.wedge; return S[i % S.length]; }
    assignSectors() { this.members.forEach((m, i) => m.setSector(this.slot(i)[2] * Math.PI / 180, true)); }
    moveTo(x, z, gait = 'walk') {
      this.gait = gait; this.halted = false; this._haltT = 0; this._secured = false;
      this.leader.moveTo(x, z, gait, 0.05);
      for (const m of this.members) { m.setStance('stand'); m.clearAim(); m.faceTo(null); }
      this._t = 0; this.follow(true);
    }
    setFormation(f) { this.formation = f; this.assignSectors(); this.follow(true); }
    stop() { for (const m of this.members) m.stop(); }
    // Thành viên giữ chỗ trong đội hình: khi người dẫn đang đi, mỗi người đuổi theo điểm phía trước chỗ của mình (không tới
    // nơi rồi đứng chờ -> không đi-dừng-đi giật cục); tụt sau thì bước nhanh hơn / chạy, vượt lên thì bước chậm lại
    follow(force) {
      const L = this.leader, moving = !!L.intent.target;
      const c = Math.cos(L.heading), s = Math.sin(L.heading), fx = L.forwardX, fz = L.forwardZ;
      for (let i = 1; i < this.members.length; i++) {
        const m = this.members[i], o = this.slot(i);
        if (!m.alive || m.detached || m.enemy || m === L) continue;   // đang giao chiến / được lệnh riêng: không kéo về đội hình
        const ox = o[0] * 8, oz = o[1] * 8;
        const px = L.x + ox * c + oz * s, pz = L.z - ox * s + oz * c;     // chỗ trong đội hình lúc này
        if (moving) {
          const behind = (px - m.x) * fx + (pz - m.z) * fz;                // > 0: đang tụt sau chỗ của mình
          const lead = Math.max(24, L.speed * 2.2);
          const tx = px + fx * lead, tz = pz + fz * lead;
          const gait = behind > 70 ? 'run' : this.gait;
          const mul = Math.max(0.55, Math.min(1.4, 1 + behind / 45));
          if (force || !m.intent.target || Math.hypot(m.intent.target.x - tx, m.intent.target.z - tz) > 6 || m.intent.gait !== gait) m.moveTo(tx, tz, gait, force ? m.react : 0);
          m.intent.speedMul = gait === 'run' ? 1 : mul;
        } else {
          m.intent.speedMul = 1;
          const d = Math.hypot(px - m.x, pz - m.z);
          if (force || (!this.halted && d > CFG.arrive && !m.intent.target)) m.moveTo(px, pz, d > 70 ? 'run' : this.gait, force ? m.react : 0);
          else if (m.intent.target && Math.hypot(m.intent.target.x - px, m.intent.target.z - pz) > 6) m.moveTo(px, pz, m.intent.gait, 0);
        }
      }
    }
    update(dt) {
      this._t += dt;
      if (this._t > 0.25 && !this.halted) { this._t = 0; this.follow(false); }
      // cả tổ đã đứng yên -> lần lượt quỳ xuống, quay mặt ra hướng canh của mình (cảnh giới vòng tròn quanh tổ)
      // (lệnh còn đang chờ phản xạ = chưa đứng yên: trước đây cờ dừng bật ngay lúc vừa ra lệnh -> tổ thôi giữ đội hình)
      const still = this.members.every(m => !m.alive || m.detached || m.enemy || (!m.intent.target && m.speed < 0.6 && !m._orders.length));
      if (still && !this._secured) {
        this._haltT += dt;
        if (this._haltT > 0.6) {
          this.halted = true;
          this._secured = true;
          const H = this.leader.heading;
          this.members.forEach((m, i) => {
            if (!m.alive || m.detached || m.enemy) return;
            const sec = this.slot(i)[2] * Math.PI / 180;
            m.order(() => { m.faceTo(H + sec); m.setStance('kneel'); m.setSector(0, true); }, m.react * 2.2 + 0.2 * i);
          });
        }
      } else if (!still) this._haltT = 0;
    }
  }

  // ---------- THẾ GIỚI ----------
  class World {
    /**
     * @param {THREE.Scene} scene
     * @param {BattleTerrain3D} terrain
     * @param {Object} o - { vehicles: () => units[] }
     */
    constructor(scene, terrain, o = {}) {
      this.scene = scene; this.terrain = terrain;
      this.vehicles = o.vehicles || (() => (typeof window !== 'undefined' && window.game && window.game.units) || []);
      // trận đấu nối đường đạn / sát thương thật vào đây: onFire(lính, mục tiêu, { x, y, z, dist, weapon })
      this.onFire = o.onFire || null;
      // phe đối địch (mặc định: khác team); game có thể thay bằng luật riêng
      this.isEnemy = o.isEnemy || ((a, b) => a.team !== b.team);
      this.soldiers = []; this.squads = [];
      this.frame = 0;
      this.animNear = 1200;    // < 150 m: động tác mỗi khung
      this.animFar = 4000;     // 150-500 m: 1/3 khung; xa hơn / ngoài khung nhìn: 1/8 khung
      this.shadowNear = 700;   // chỉ lính trong ~90 m đổ bóng
      this.lodNear = 200;      // < 25 m (cự ly biểu kiến): đủ chi tiết
      this.lodFar = 640;       // 25-80 m: lưới giản lược; xa hơn: lưới rất nhẹ một lượt vẽ
      this._frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
      this._ob = {};
      this._blk = new Map();   // đệm ô lưới bộ binh bị chặn (vật cản tĩnh)
    }
    spawn(o) { const s = new Soldier(this, o); this.soldiers.push(s); return s; }

    // mục tiêu có thể giao chiến: lính phe khác + xe phe khác (chuẩn hoá {x, y, z, team, alive, aimH, kind, ref})
    targetsFor(viewer) {
      const out = [];
      for (const s of this.soldiers) if (s.alive && s !== viewer && this.isEnemy(viewer, s)) out.push(s);
      for (const v of this.vehicles()) {
        if (!v || v.isDead || !this.isEnemy(viewer, v)) continue;
        const T = v._infT || (v._infT = { kind: 'vehicle', ref: v, aimH: 12 });
        T.x = v.x; T.y = v.y; T.z = v.z; T.team = v.team; T.alive = !v.isDead;
        out.push(T);
      }
      return out;
    }
    // mức lộ: trong bụi / rừng khó thấy hơn (lính dễ ẩn trong rừng)
    concealment(t) {
      const T = this.terrain;
      let k = 1;
      if (t.kind !== 'vehicle') {
        if (T && T.isPositionInBush && T.isPositionInBush(t.x, t.z)) k *= 0.3;
        if (T && T.forestDensityAt) k *= 1 - 0.65 * Math.min(1, T.forestDensityAt(t.x, t.z) || 0);
        if (t.intent && t.intent.stance === 'kneel') k *= 0.75;
        if (t.intent && t.intent.stance === 'prone') k *= 0.45;
      } else if (t.ref && t.ref.isInBush) k *= 0.5;
      return k;
    }
    // nhìn thấy: trong tầm (theo mức lộ), trong góc nhìn, không bị đồi / nhà / cây chắn
    canSee(v, t) {
      const dx = t.x - v.x, dz = t.z - v.z, d = Math.hypot(dx, dz);
      if (d > v.sight * this.concealment(t)) return false;
      const fov = v.guard ? CFG.fovGuard : CFG.fovMove;
      if (d > 24 && Math.abs(angDiff(v.heading, Math.atan2(-dx, -dz))) > fov / 2) return false;
      const ey = v.y + 12.5 * (v.k || 1), ty = t.y + (t.aimH || 9);
      const n = Math.ceil(d / 12);
      for (let i = 1; i < n; i++) {
        const f = i / n, x = v.x + dx * f, z = v.z + dz * f, h = ey + (ty - ey) * f;
        if (this.groundAt(x, z, null) > h - 0.5) return false;           // đồi / mép đất chắn
        if (h - this.groundAt(x, z, null) < 30 && this.blocked(Math.floor(x / CFG.navCell), Math.floor(z / CFG.navCell)) && f > 0.04 && f < 0.96) return false;   // nhà / tường / thân cây
      }
      return true;
    }
    // chọn mục tiêu gần nhất nhìn thấy được (ưu tiên lính địch trong tầm phóng lựu tối thiểu trở lên)
    spot(v) {
      let best = null, bd = Infinity;
      for (const t of this.targetsFor(v)) {
        const d = Math.hypot(t.x - v.x, t.z - v.z);
        if (d >= bd || d > v.sight) continue;
        if (this.canSee(v, t)) { best = t; bd = d; }
      }
      return best;
    }
    squad(members, formation) { const q = new Squad(this, members, formation); this.squads.push(q); return q; }
    remove(s) { const i = this.soldiers.indexOf(s); if (i >= 0) this.soldiers.splice(i, 1); s.dispose(); }
    // nhà sập / vật cản đổi: xoá đệm ô chặn
    invalidateNav() { this._blk.clear(); }

    groundAt(x, z, refY) {
      const T = this.terrain;
      if (!T) return 0;
      if (T.vehicleSurfaceAt && refY != null) return T.vehicleSurfaceAt(x, z, refY);
      return T.getElevationAt(x, z);
    }
    waterDepth(x, z) {
      const T = this.terrain;
      if (!T || !T.waterSurfaceAt) return 0;
      const ws = T.waterSurfaceAt(x, z);
      return ws == null ? 0 : Math.max(0, ws - T.getElevationAt(x, z));
    }

    // va chạm hình tròn thân người: nhà / đá / tường (địa hình) -> thân cây -> xe
    collide(self, x0, z0, x1, z1) {
      const T = this.terrain;
      let x = x1, z = z1;
      if (T && T.resolveVehicleCollision) { const r = T.resolveVehicleCollision(x0, z0, x, z, RADIUS, null); x = r.x; z = r.z; }
      if (T && T.trees && T.trees.near) {
        for (const it of T.trees.near(x, z, RADIUS + 8)) {
          if (it.fallen || it.shattered || it.down) continue;
          const m = RADIUS + (it.trunkR || 1), dx = x - it.x, dz = z - it.z, d = Math.hypot(dx, dz);
          if (d < m && d > 1e-4) { x = it.x + dx * m / d; z = it.z + dz * m / d; }
        }
      }
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      for (const v of this.vehicles()) {
        if (!v || v.isDead && !v.group) continue;
        const dx = x - v.x, dz = z - v.z;
        if (dx * dx + dz * dz > 50 * 50) continue;
        if (VC && VC.vehObb && VC.circleGap) {
          const ob = VC.vehObb(v, v.x, v.z, v.bodyAngle, this._ob), g = VC.circleGap(ob, x, z, RADIUS, this._gap || (this._gap = {}));
          if (g && g.gap < 0) { x -= g.nx * g.gap; z -= g.nz * g.gap; }
        } else {
          const m = 16 + RADIUS, d = Math.hypot(dx, dz);
          if (d < m && d > 1e-4) { x = v.x + dx * m / d; z = v.z + dz * m / d; }
        }
      }
      return { x, z };
    }

    // ô lưới bộ binh (6 đv ~ 0,75 m) có đi qua được không: thử va chạm thật tại tâm ô (đệm lại)
    blocked(i, j) {
      const k = i * 100003 + j;
      let b = this._blk.get(k);
      if (b !== undefined) return b;
      const C = CFG.navCell, x = (i + 0.5) * C, z = (j + 0.5) * C, T = this.terrain;
      b = false;
      if (T && T.resolveVehicleCollision) { const r = T.resolveVehicleCollision(x, z, x + 1e-3, z, RADIUS + 0.6, null); if (Math.hypot(r.x - x - 1e-3, r.z - z) > 0.3) b = true; }
      if (!b && T && T.trees && T.trees.near) for (const it of T.trees.near(x, z, RADIUS + 6)) { if (!it.fallen && !it.shattered && Math.hypot(it.x - x, it.z - z) < RADIUS + (it.trunkR || 1)) { b = true; break; } }
      if (!b && this.waterDepth(x, z) > CFG.wadeMax) b = true;
      this._blk.set(k, b);
      return b;
    }
    lineFree(ax, az, bx, bz) {
      const C = CFG.navCell, n = Math.ceil(Math.hypot(bx - ax, bz - az) / (C * 0.5));
      for (let s = 0; s <= n; s++) { const t = s / Math.max(1, n); if (this.blocked(Math.floor((ax + (bx - ax) * t) / C), Math.floor((az + (bz - az) * t) / C))) return false; }
      return true;
    }
    // A* 8 hướng trên lưới mịn trong khung bao quanh tuyến đi, rồi kéo thẳng đường (bỏ điểm thừa)
    findPath(x0, z0, x1, z1) {
      const C = CFG.navCell, M = CFG.navMargin;
      const i0 = Math.floor((Math.min(x0, x1) - M) / C), j0 = Math.floor((Math.min(z0, z1) - M) / C);
      const nx = Math.floor((Math.max(x0, x1) + M) / C) - i0 + 1, nz = Math.floor((Math.max(z0, z1) + M) / C) - j0 + 1;
      if (nx * nz > CFG.navMaxCells) return null;
      const idx = (i, j) => (j - j0) * nx + (i - i0);
      const si = Math.floor(x0 / C), sj = Math.floor(z0 / C);
      let gi = Math.floor(x1 / C), gj = Math.floor(z1 / C);
      if (this.blocked(gi, gj)) {    // đích nằm trong vật cản: lấy ô trống gần nhất
        let best = null;
        for (let r = 1; r < 12 && !best; r++) for (let di = -r; di <= r && !best; di++) for (let dj = -r; dj <= r; dj++) if (!this.blocked(gi + di, gj + dj)) { best = [gi + di, gj + dj]; break; }
        if (!best) return null; [gi, gj] = best;
      }
      const N = nx * nz, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const open = [];   // đống nhị phân [f, k]
      const push = (f, k) => { open.push([f, k]); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
      const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; } } return top; };
      const h = (i, j) => { const a = Math.abs(i - gi), b = Math.abs(j - gj); return Math.max(a, b) + 0.414 * Math.min(a, b); };
      const s0 = idx(si, sj), goal = idx(gi, gj);
      g[s0] = 0; push(h(si, sj), s0);
      let found = false, it = 0;
      while (open.length && it++ < 40000) {
        const [, k] = pop();
        if (closed[k]) continue;
        closed[k] = 1;
        if (k === goal) { found = true; break; }
        const ci = k % nx + i0, cj = ((k / nx) | 0) + j0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < i0 || nj < j0 || ni >= i0 + nx || nj >= j0 + nz) continue;
          if (this.blocked(ni, nj)) continue;
          if (di && dj && (this.blocked(ci + di, cj) || this.blocked(ci, cj + dj))) continue;   // không lách chéo qua góc
          const nk = idx(ni, nj), ng = g[k] + (di && dj ? 1.414 : 1);
          if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(ng + h(ni, nj), nk); }
        }
      }
      if (!found) return null;
      const pts = [];
      for (let k = goal; k !== -1; k = from[k]) pts.push({ x: (k % nx + i0 + 0.5) * C, z: (((k / nx) | 0) + j0 + 0.5) * C });
      pts.reverse();
      pts[pts.length - 1] = { x: x1, z: z1 };
      // kéo thẳng: giữ điểm xa nhất còn nhìn thấy thẳng
      const out = []; let cx = x0, cz = z0, a = 0;
      while (a < pts.length - 1) {
        let b = pts.length - 1;
        while (b > a + 1 && !this.lineFree(cx, cz, pts[b].x, pts[b].z)) b--;
        out.push(pts[b]); cx = pts[b].x; cz = pts[b].z; a = b;
      }
      if (!out.length) out.push({ x: x1, z: z1 });
      return out;
    }

    // lính không chồng lên nhau: đẩy mềm theo cặp trong ô lưới 16 đv
    separate() {
      const cell = 16, grid = new Map(), L = this.soldiers;
      for (const s of L) { if (!s.alive) continue; const k = Math.floor(s.x / cell) * 73856093 ^ Math.floor(s.z / cell) * 19349663; (grid.get(k) || grid.set(k, []).get(k)).push(s); }
      const min = RADIUS * 2.1;
      for (const s of L) {
        if (!s.alive) continue;
        const ci = Math.floor(s.x / cell), cj = Math.floor(s.z / cell);
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
          const l = grid.get(i * 73856093 ^ j * 19349663); if (!l) continue;
          for (const o of l) {
            if (o.id <= s.id) continue;
            const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
            if (d < min && d > 1e-4) {
              const push = (min - d) * 0.5, ux = dx / d, uz = dz / d;
              s.x -= ux * push; s.z -= uz * push; o.x += ux * push; o.z += uz * push;
            }
          }
        }
      }
    }

    /**
     * Gọi mỗi khung từ vòng lặp game. camera: để cập nhật thưa lính xa / ngoài khung nhìn & bật tắt bóng đổ.
     */
    update(dt, camera) {
      this.frame++;
      for (const q of this.squads) q.update(dt);
      let fr = null, cx = 0, cz = 0;
      if (camera) {
        camera.updateMatrixWorld();
        this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._pm);
        fr = this._frustum; cx = camera.position.x; cz = camera.position.z;
      }
      for (const s of this.soldiers) {
        let every = 1;
        if (fr) {
          const d = Math.hypot(s.x - cx, s.z - cz);
          this._sph.center.set(s.x, s.y + 7, s.z); this._sph.radius = 9;
          const seen = fr.intersectsSphere(this._sph);
          every = !seen ? 8 : d < this.animNear ? 1 : d < this.animFar ? 3 : 8;
          const shadow = seen && d < this.shadowNear;
          if (s._shadow !== shadow) { s._shadow = shadow; SoldierModel.setShadow(s.figure, shadow); }
          // cự ly biểu kiến: soi kính (fov hẹp) thì lính xa to lên, phải giữ chi tiết; nới 8% khi hạ bậc để không nhấp nháy ở ngưỡng
          const ap = d * Math.min(1, (camera.fov || 55) / 55), cur = s.figure.lod ? s.figure.lod.cur : 0, up = 1.08;
          const lvl = ap < this.lodNear * (cur > 0 ? 1 : up) ? 0 : ap < this.lodFar * (cur > 1 ? 1 : up) ? 1 : 2;
          if (lvl !== cur) SoldierModel.setLod(s.figure, lvl);
        }
        // động tác chỉ tính ở khung đến lượt (bước di chuyển vẫn chạy mỗi khung để va chạm chính xác)
        s.update(dt, (this.frame + s.id) % every === 0);
      }
      this.separate();
      for (const s of this.soldiers) s.applyTransform();
    }
  }

  return { World, Soldier, Squad, FORMATIONS, CFG, RADIUS, ARMS };
})();

if (typeof window !== 'undefined') window.SoldierEngine = SoldierEngine;
