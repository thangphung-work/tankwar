/**
 * PHÒNG THỬ ĐẠN — BIA DRONE + KÍNH NGẮM XẠ THỦ (gắn thêm phương thức vào TankInspector — tank_inspector.js)
 *
 * - BIA DRONE [B]: 4 drone địch bay thật trên bãi thử (treo, bay vòng, cắt ngang, bay cao lượn số 8) ở nhiều cự ly / độ cao /
 *   tốc độ. Đạn súng máy / pháo 30mm bay bằng ĐÚNG hệ đường đạn trong trận (ballistics.js: trọng lực + cản + tản mát +
 *   vạch đường), trúng drone tính như trong trận (drone_air.js: bán kính trúng, sát thương từng loại đạn). Drone hỏng
 *   bốc khói / cháy, bắn hạ thì nổ, vỡ mảnh, rơi — vài giây sau drone mới bay vào thế chỗ.
 * - Cơ chế ngắm trong trận: nhấp đúng drone = khóa (máy tính hỏa lực tự đón đầu + nâng nòng), giữ Space xả đạn;
 *   nhấp lên trời = nâng nòng theo hướng đó.
 * - KÍNH NGẮM [V]: nhìn qua kính ngắm của xạ thủ (gắn trên nòng / trạm súng — nòng tới đâu hình tới đó, có độ trễ servo
 *   thật). Chuột di hướng ngắm (nhấp để khóa chuột), giữ chuột trái bắn, cuộn / chuột phải đổi độ phóng đại,
 *   [T] bật / tắt bám mục tiêu tự động (máy tính hỏa lực), [L] dấu đón đầu, Q E Z X chỉnh hướng ngắm bằng phím.
 *   Xe tăng: kính ngắm của trạm súng máy 7.62mm trên nóc tháp (Space vẫn bắn pháo chính).
 */
const RangeAir = (() => {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const wrap360 = a => ((a % 360) + 360) % 360;
  const ZOOM = [{ fov: 48, k: '×1' }, { fov: 18, k: '×2.7' }, { fov: 7, k: '×7' }];
  const MAX_SPEED_KMH = v => (typeof GameTiming !== 'undefined' && GameTiming.kmh ? GameTiming.kmh(v) : v * 0.45);
  // Quỹ đạo bia (đơn vị game, 8 = 1 m; xe mới vào nhìn về phía -z). h: độ cao trên mặt đất
  const PATTERNS = [
    { id: 'hover', name: 'TREO', pos: (t) => ({ x: -120 + Math.sin(t * 0.31) * 6, z: -310 + Math.cos(t * 0.23) * 6, h: 110 + Math.sin(t * 0.9) * 3 }) },
    { id: 'orbit', name: 'BAY VÒNG', pos: (t) => { const a = t * 0.38; return { x: 170 + Math.cos(a) * 130, z: -480 + Math.sin(a) * 130, h: 170 + Math.sin(t * 0.5) * 8 }; } },
    { id: 'cross', name: 'CẮT NGANG', pos: (t) => { const p = (t * 100 / 1040) % 2, s = p < 1 ? p : 2 - p, e = s * s * (3 - 2 * s); return { x: -520 + e * 1040, z: -620 + Math.sin(t * 0.7) * 10, h: 240 }; } },
    { id: 'weave', name: 'CAO · LƯỢN', pos: (t) => { const a = t * 0.28; return { x: -260 + Math.sin(a) * 220, z: -820 + Math.sin(a * 2) * 110, h: 360 + Math.sin(t * 0.33) * 30 }; } }
  ];

  const methods = {
    // ---------- "GAME" GIẢ cho drone_air.js: dùng lại đúng code trúng đạn / khóa / đón đầu / rơi / cháy / trạm súng ----------
    raGame() {
      if (typeof DroneAir === 'undefined') return null;
      let G = this._raG;
      if (!G) {
        G = this._raG = Object.assign({
          units: [], keys: {}, _sight: null, isPointerFiring: false, lockedTarget: null,
          addCombatLog: (msg) => this.toast(String(msg).replace(/\[\[([\w-]+)\]\]/g, '<i class="ti ti-$1"></i>').replace(/ — /, '<br>'), 2600),
          selectAmmoType: (a) => { if (this.activeUnit) { this.activeUnit.selectedAmmo = a; this.renderAmmoTestChips(); } },
          setLockedTarget: () => {}
        }, DroneAir.methods);
      }
      const u = this.activeUnit;
      G.scene = this.scene;
      G.camera = this.camera;
      G.terrain = this.getTestTerrain();
      G.ballistics = this.raBallistics();
      G.player = u;
      G.units = u ? [u] : [];
      G.keys = { Space: !!this.testFiring };
      return G;
    },

    // hệ đường đạn thật (như trong trận) cho đạn súng bắn lên trời: vạch đường, trúng drone, rơi xuống đất nổ đúng chỗ
    raBallistics() {
      if (!this._raB && typeof BallisticsSystem3D !== 'undefined' && this.scene) {
        const B = new BallisticsSystem3D(this.scene);
        B.wind = { direction: 0, speed: 0, vx: 0, vz: 0, nextChange: Infinity };   // bãi thử lặng gió (như đạn thử cũ)
        B.airTargets = [];
        B.onAirHit = (s, T, h) => this.raOnHit(s, T, h);
        B.onAirNear = (s, T) => { if (this._ra) this._ra.near++; };
        const fire = B.fireShell3D.bind(B);
        B.fireShell3D = (...a) => { const s = fire(...a); if (s && this._ra) this._ra.fired++; return s; };
        this._raB = B;
      }
      const B = this._raB;
      if (B) { B.scene = this.scene; const fx = this.getTestEffects(); B.fx = fx ? fx.fx : null; }
      return B || null;
    },

    // mặt đất cho đạn thật: bãi thử + tường thử + đá / cây / xác xe (đạn găm đúng chỗ như đạn thử cũ), biên rộng để đạn bay tới bia xa
    raTerrain() {
      const T = this.getTestTerrain();
      if (!this._raT || this._raT.base !== T) {
        const W = Object.create(T);
        Object.defineProperty(W, 'width', { value: 7000 });
        Object.defineProperty(W, 'depth', { value: 7000 });
        W.base = T;
        const NOHIT = { hit: false };
        W.checkHorseshoeCollision = () => NOHIT;
        W.buildingSegmentHit = (x0, y0, z0, x1, y1, z1) => this.raSegHit(x0, y0, z0, x1, y1, z1);
        this._raT = W;
      }
      return this._raT;
    },

    raSegHit(x0, y0, z0, x1, y1, z1) {
      const a = this._raA || (this._raA = new THREE.Vector3()), b = this._raBv || (this._raBv = new THREE.Vector3());
      a.set(x0, y0, z0); b.set(x1, y1, z1);
      let best = null, bd = Infinity;
      const wallG = this.testWallGroup, W = this.testWall;
      if (wallG && wallG.visible && W && Math.min(z0, z1) < W.cz + W.hd + 4 && Math.max(z0, z1) > W.cz - W.hd - 4 && Math.min(y0, y1) < 60) {
        const len = a.distanceTo(b);
        if (len > 1e-4) {
          const ray = this._raRay || (this._raRay = new THREE.Raycaster());
          ray.set(a, b.clone().sub(a).divideScalar(len));
          ray.far = len;
          for (const it of ray.intersectObject(wallG, true)) {
            const mt = Array.isArray(it.object.material) ? it.object.material[0] : it.object.material;
            if (!it.object.visible || it.object.userData.isFxDecal || (mt && mt.isMeshBasicMaterial)) continue;
            const n = it.face ? it.face.normal.clone().transformDirection(it.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
            best = { point: it.point.clone(), normal: n, object: it.object, hitType: 'WALL', faceIndex: it.faceIndex, instanceId: it.instanceId };
            bd = it.distance;
            break;
          }
        }
      }
      const F = this.field;
      if (F) {
        const fh = F.segmentHit(a, b);
        if (fh && fh.point.distanceTo(a) < bd) best = { point: fh.point, normal: fh.normal, object: null, hitType: fh.hitType, tree: fh.tree, sandbag: fh.sandbag };
      }
      if (!best) return null;
      this._raHit = best;
      const n = best.normal || { x: 0, y: 1, z: 0 };
      return { x: best.point.x, y: best.point.y, z: best.point.z, nx: n.x, ny: n.y, nz: n.z };
    },

    // đạn thật chạm đất / tường / nước: nổ bằng đúng hiệu ứng + âm thanh của phòng thử (spawnTestImpact)
    raOnImpact(s, type) {
      const u = this.activeUnit;
      let hit = type === 'BUILDING' ? this._raHit : null;
      this._raHit = null;
      if (!hit) hit = { point: new THREE.Vector3(s.x, s.y, s.z), normal: new THREE.Vector3(0, 1, 0), object: null, hitType: type === 'WATER' ? 'WATER' : 'GROUND' };
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
      const dist = u ? Math.hypot(hit.point.x - u.x, hit.point.y - (u.y || 0), hit.point.z - u.z) : 300;
      this.spawnTestImpact({ x: hit.point.x, y: hit.point.y, z: hit.point.z, ammoType: s.ammoType, dist, hit, dir: new THREE.Vector3(s.vx / sp, s.vy / sp, s.vz / sp) });
    },

    // ---------- BẬT / TẮT BIA DRONE ----------
    raSetDrones(on) {
      const R = this.raState();
      if (on === R.on) return;
      R.on = on;
      if (on) {
        if (typeof ReconDrone === 'undefined' || typeof DroneAir === 'undefined') { R.on = false; this.toast('Thiếu mô-đun drone'); return; }
        const team = this.currentTeam === 'RED' ? 'BLUE' : 'RED';
        R.t = 0;
        R.drones = PATTERNS.map((P, i) => {
          const m = ReconDrone.build(team);
          m.rotation.order = 'YXZ';
          this.scene.add(m);
          return { key: 'bia' + i, P, m, team, hp: 1, hits: 0, dead: false, respawn: 0, x: 0, y: 0, z: 0, wvx: 0, wvy: 0, wvz: 0, yaw: 0, state: 'flying', seen: true, t0: i * 7 };
        });
        this.raPlaceDrones(0);
        const u = this.activeUnit;
        const air = u && DroneAir.C.AA_TYPES[u.tankType];
        this.toast('<i class="ti ti-drone"></i> <b>4 drone bia</b> đang bay (35–110 m). ' + (air
          ? 'Nhấp vào drone để khóa + giữ <b>Space</b> xả đạn, hoặc bấm <b>V</b> nhìn qua kính ngắm'
          : 'Lựu pháo không bắn được mục tiêu trên không — chọn xe 6 nòng, trinh sát hoặc xe tăng (súng máy nóc tháp)'), 5200);
      } else {
        (R.drones || []).forEach(d => { if (d.m.parent) d.m.parent.remove(d.m); if (d.m.userData.discMat) d.m.userData.discMat.dispose(); });
        R.drones = [];
        const G = this.raGame();
        if (G) { G.clearAirAim(); G.resetDroneWorld(); G.updateDroneAmbient([]); }
        this.raClearShells();
      }
      this.raSyncBar();
    },

    raState() {
      return this._ra || (this._ra = { on: false, drones: [], t: 0, fired: 0, hits: 0, near: 0, kills: 0, mark: 0, msg: 0 });
    },

    raClearShells() {
      const B = this._raB;
      if (!B) return;
      for (let i = B.activeShells.length - 1; i >= 0; i--) B.removeShellMesh(B.activeShells[i], i);
      B.activeShells.length = 0;
      for (const p of B.trailParticles) { B.scene.remove(p.mesh); if (p.mesh.material) p.mesh.material.dispose(); }
      B.trailParticles.length = 0;
    },

    // vị trí / hướng / nghiêng thân drone theo quỹ đạo (vận tốc đo theo sai phân để máy tính hỏa lực đón đầu đúng)
    raPlaceDrones(dt) {
      const R = this._ra, F = this.field;
      const pad = F ? F.groundAt(0, 0) : 0;
      for (const d of R.drones) {
        const t = R.t + d.t0, p = d.P.pos(t);
        const gy = Math.max(pad, F ? F.groundAt(p.x, p.z) : 0);
        const x = p.x, y = gy + p.h, z = p.z;
        if (dt > 0) {
          const k = Math.min(1, dt * 8);
          d.wvx += ((x - d.x) / dt - d.wvx) * k; d.wvy += ((y - d.y) / dt - d.wvy) * k; d.wvz += ((z - d.z) / dt - d.wvz) * k;
        }
        d.x = x; d.y = y; d.z = z;
        const sp = Math.hypot(d.wvx, d.wvz);
        if (sp > 4) {
          const want = Math.atan2(-d.wvx, -d.wvz);
          let dy = want - d.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          d.yaw += dy * Math.min(1, dt * 2.5);
        } else d.yaw += dt * 0.15;
        // quadcopter chúi mũi theo hướng bay (nhanh thì chúi nhiều)
        d.m.position.set(x, y, z);
        d.m.rotation.set(-Math.min(0.32, sp / 380), d.yaw, 0);
        ReconDrone.animate(d.m, dt, 1);
        d.m.visible = !d.dead;
      }
    },

    // ---------- TRÚNG DRONE ----------
    raOnHit(s, T, h) {
      const R = this._ra, d = T && T.ref;
      if (!R || !d || d.dead) return;
      const G = this.raGame(), C = DroneAir.C;
      G.onDroneShot(s, d, h);   // tia lửa trên vỏ + tiếng đạn chạm (đúng như trong trận)
      const dmg = s.aaMG ? C.RCWS.dmgDrone : (C.DMG[s.ammoType] || 0);
      d.hp -= dmg; d.hits++;
      R.hits++;
      R.mark = 0.3;
      if (d.hp <= 1e-3) {
        d.dead = true; d.respawn = 7;
        R.kills++;
        G.startDroneFall(d.team, d.x, d.y, d.z, d.wvx, d.wvz, d.yaw, false);
        R.msg = 2.2;
        R.msgTxt = 'ĐÃ HẠ DRONE · ' + d.hits + ' PHÁT TRÚNG';
        if (G._airAim && G._airAim.dr === d) G.clearAirAim();
        if (this.sight && this.sight.track === d) this.sight.track = null;
        if (!this.sight) this.toast(`<i class="ti ti-target-arrow"></i> Đã hạ drone <b>${d.P.name}</b> — ${d.hits} phát trúng (tổng đã bắn ${R.fired})`, 3000);
      }
    },

    // nhấp chuột ở chế độ thường: trúng drone -> khóa (máy tính hỏa lực), trỏ lên trời -> nâng nòng theo hướng đó
    raPick(clientX, clientY) {
      const R = this._ra, u = this.activeUnit;
      if (!R || !R.on || !u || u.isDead || !this.camera) return false;
      const G = this.raGame();
      if (!G) return false;
      const rc = this.renderer.domElement.getBoundingClientRect();
      const mouse = { x: ((clientX - rc.left) / rc.width) * 2 - 1, y: -((clientY - rc.top) / rc.height) * 2 + 1 };
      const v = new THREE.Vector3();
      let best = null, bp = 44;
      for (const d of R.drones) {
        if (d.dead) continue;
        v.set(d.x, d.y + DroneAir.C.CENTER_Y, d.z).project(this.camera);
        if (v.z > 1) continue;
        const px = Math.hypot((v.x - mouse.x) * rc.width / 2, (v.y - mouse.y) * rc.height / 2);
        if (px < bp) { bp = px; best = d; }
      }
      const air = G.canShootAir(u);
      if (best) {
        if (!air) { this.toast('Lựu pháo không bắn được mục tiêu trên không'); return true; }
        G.setAirAim({ kind: 'drone', dr: best });
        this.mouseShot = null;
        return true;
      }
      if (!air) return false;
      const ray = this._pickRay || (this._pickRay = new THREE.Raycaster());
      ray.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), this.camera);
      if (ray.ray.direction.y > 0.04 && !this.pickPoint(clientX, clientY)) {
        G.aimAtSky(ray.ray);
        this.mouseShot = null;
        return true;
      }
      if (G._airAim) G.clearAirAim();
      return false;
    },

    // ---------- MỖI KHUNG HÌNH: TRƯỚC khi xe cập nhật (lệnh ngắm / cò) ----------
    // trả { keys: kính ngắm giữ phím Q E Z X, fire: bóp cò vũ khí chính của kính ngắm, noMain: không bắn pháo chính }
    raPre(dt, u) {
      const R = this._ra, S = this.sight;
      if (!(R && R.on) && !S) return null;
      const G = this.raGame();
      if (!G || !u || u.isDead) return null;
      const K = this.keys || {};
      const tank = u.tankType === 'ALL_ROUNDER';
      const out = { keys: !!S, fire: false, noMain: false };
      if (S) {
        if (S.track && !G._airAim) {
          G.setAirAim({ kind: 'drone', dr: S.track });
        }
        if (G._airAim) {
          // bám mục tiêu tự động: máy tính hỏa lực lái nòng (đón đầu); hướng ngắm tay đi theo để thôi bám không bị giật
          G.keys = { Space: !!S.fire };   // xe tăng: chuột trái = súng máy nóc tháp (Space vẫn là pháo chính)
          G.updatePlayerAirAim(dt, false);
          if (!G._airAim) S.track = null;
          const A = G._airAim;
          if (A) { S.az = A.sol ? A.sol.az : S.az; S.el = A.sol ? A.sol.el : S.el; }
        }
        if (!G._airAim) {
          // xoay / ngóc bằng phím (đúng tốc độ tháp / trạm súng)
          const TR = tank ? { traverse: DroneAir.C.RCWS.yawRate * R2D, elevate: DroneAir.C.RCWS.pitchRate * R2D } : (u.turretRates ? u.turretRates() : { traverse: 42, elevate: 24 });
          if (K.KeyQ) S.az = wrap360(S.az - TR.traverse * dt);
          if (K.KeyE) S.az = wrap360(S.az + TR.traverse * dt);
          if (K.KeyZ) S.el += TR.elevate * dt;
          if (K.KeyX) S.el -= TR.elevate * dt;
          S.el = Math.max(-8, Math.min(tank ? DroneAir.C.RCWS.elMax : 60, S.el));
          if (tank) u._aa = { az: S.az, el: S.el, firing: !!S.fire, until: performance.now() / 1000 + 0.3 };
          else if (u.tankType === 'GATLING') {
            u.aimTo(S.az);
            const r = S.az * D2R;
            u.fcsTarget = { x: u.x + Math.sin(r) * 800, z: u.z - Math.cos(r) * 800, y: (u.y || 0) + 800 * Math.tan(S.el * D2R), el: S.el };
          } else u.aimTo(S.az, S.el);
        }
        out.fire = !tank && !!S.fire;
        return out;
      }
      // chế độ thường: khóa drone / ngắm trời như trong trận (Q E Z X = tự ngắm tay -> hủy khóa)
      if (G._airAim) {
        G.keys = { Space: !!this.testFiring };
        const manual = !!(K.KeyQ || K.KeyE || K.KeyZ || K.KeyX);
        if (G.updatePlayerAirAim(dt, manual)) out.noMain = tank;
      }
      return out;
    },

    // ---------- SAU khi xe cập nhật: trạm súng, bia, đạn thật, khói / lửa / xác rơi, tiếng cánh quạt ----------
    raPost(dt, u) {
      const R = this._ra, S = this.sight;
      if (!(R && R.on) && !S && !(this._raB && this._raB.activeShells.length) && !(this._raG && (this._raG._droneFalls || []).length)) return;
      const G = this.raGame();
      if (!G) return;
      if (u && u.tankType === 'ALL_ROUNDER' && !u.isDead) {
        if (!S && !G._airAim) u._aa = null;
        G.updateRCWS(dt);
      }
      const B = G.ballistics;
      if (R && R.on) {
        R.t += dt;
        for (const d of R.drones) {
          if (d.dead && (d.respawn -= dt) <= 0) { d.dead = false; d.hp = 1; d.hits = 0; }
        }
        this.raPlaceDrones(dt);
        B.airTargets = R.drones.filter(d => !d.dead).map(d => ({ x: d.x, y: d.y + DroneAir.C.CENTER_Y, z: d.z, r: DroneAir.C.HIT_R, nearR: DroneAir.C.NEAR_R, team: d.team, ref: d }));
        G.updateDroneDamageFX(dt, R.drones.filter(d => !d.dead));
        G.updateDroneAmbient(R.drones.filter(d => !d.dead));
      } else if (B) B.airTargets = [];
      if (B) B.updateShells3D(dt, this.raTerrain(), [], (s, type) => this.raOnImpact(s, type));
      G.updateDroneFalls(dt);
      if (R) { R.mark = Math.max(0, R.mark - dt); R.msg = Math.max(0, R.msg - dt); }
    },

    // ---------- KÍNH NGẮM XẠ THỦ ----------
    raSightOK(u) {
      return !!(u && !u.isDead && (u.tankType === 'GATLING' || u.tankType === 'SCOUT' || (u.tankType === 'ALL_ROUNDER' && u.rcwsGun)));
    },

    setSight(on) {
      const u = this.activeUnit;
      if (on && !this.raSightOK(u)) { this.toast('Lựu pháo không có kính ngắm phòng không — chọn xe 6 nòng, trinh sát hoặc xe tăng'); on = false; }
      const overlay = document.getElementById('tank-inspector-overlay');
      if (on && !this.sight) {
        const p = this.raSightPose(u);
        this.sight = {
          az: wrap360(Math.atan2(p.dir.x, -p.dir.z) * R2D), el: Math.asin(Math.max(-1, Math.min(1, p.dir.y))) * R2D,
          zoom: 0, fire: false, track: null, assist: this._raAssist !== false, R: 600, rT: 0,
          rcws: u.tankType === 'ALL_ROUNDER', fov: ZOOM[0].fov, kick: 0
        };
        this.driveTo = null; this.mouseShot = null;
        if (this.autoRotate) { this.autoRotate = false; this.syncAutoRotateBtn(); }
        const G = this.raGame();
        if (G) G.clearAirAim();
        if (overlay) overlay.classList.add('ti-sight-on');
        if (u.hpGroup) u.hpGroup.visible = false;
        this.resumeTestSound();
        this.toast('<i class="ti ti-crosshair"></i> <b>Kính ngắm xạ thủ</b> — nhấp vào khung hình để khóa chuột, di chuột ngắm, giữ chuột trái bắn · cuộn / chuột phải: phóng đại · <b>T</b> bám mục tiêu · <b>L</b> dấu đón đầu · <b>V</b> / Esc thoát', 5200);
      } else if (!on && this.sight) {
        this.sight = null;
        if (this.camera) { this.camera.fov = 38; this.camera.near = 1; this.camera.updateProjectionMatrix(); }
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        if (overlay) overlay.classList.remove('ti-sight-on');
        const G = this._raG;
        if (G) G.clearAirAim();
        if (u) { u._aa = null; u.fcsTarget = null; u.aimAz = u.aimEl = undefined; }
      }
      this.raSyncBar();
    },

    // vị trí kính ngắm + hướng nòng thật: xe tăng = camera ngày trên trạm súng; xe 6 nòng / trinh sát = kính ngắm cạnh nòng, ngóc theo nòng
    raSightPose(u) {
      const out = this._raPose || (this._raPose = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), muzzle: new THREE.Vector3() });
      if (u.tankType === 'ALL_ROUNDER' && u.rcwsGun) {
        u.rcwsGun.updateWorldMatrix(true, false);
        const M = u.rcwsGun.matrixWorld;
        out.pos.set(0.42, 0.18, -1.05).applyMatrix4(M);
        out.dir.set(0, 0, -1).transformDirection(M);
        out.muzzle.copy(u.rcwsMuzzleLocal).applyMatrix4(M);
        return out;
      }
      const m = u.getMuzzleWorldTransform();
      out.dir.copy(m.direction).normalize();
      out.muzzle.copy(m.position);
      const piv = u.barrelPivot ? u.barrelPivot.getWorldPosition(this._raPv || (this._raPv = new THREE.Vector3())) : m.position;
      // kính ngắm đặt trên cao + lệch phải so với trục nòng, ngóc cùng nòng
      const right = this._raRt || (this._raRt = new THREE.Vector3());
      right.set(-out.dir.z, 0, out.dir.x).normalize();
      const up = right.clone().cross(out.dir).negate();
      if (up.y < 0) up.negate();
      const side = u.tankType === 'GATLING' ? 3.2 : 2.2, hi = u.tankType === 'GATLING' ? 3.6 : 2.6;
      out.pos.copy(piv).addScaledVector(up, hi).addScaledVector(right, side).addScaledVector(out.dir, 1.5);
      return out;
    },

    // camera kính ngắm: true = đã đặt camera (bỏ camera vòng quanh xe)
    raSightCamera(dt) {
      const S = this.sight, u = this.activeUnit, cam = this.camera;
      if (!S || !cam) return false;
      if (!this.raSightOK(u)) { this.setSight(false); return false; }
      const p = this.raSightPose(u);
      // đo xa laser theo trục nòng (~6 lần / giây): drone gần trục nòng, mặt đất / tường, hoặc trời (giữ cự ly cũ)
      if ((S.rT -= dt) <= 0) {
        S.rT = 0.16;
        S.laser = null;
        const R = this._ra;
        let best = null, ba = 1.5 * D2R;
        if (R && R.on) {
          for (const d of R.drones) {
            if (d.dead) continue;
            const dx = d.x - p.muzzle.x, dy = d.y + 1.5 - p.muzzle.y, dz = d.z - p.muzzle.z, L = Math.hypot(dx, dy, dz);
            const a = Math.acos(Math.max(-1, Math.min(1, (dx * p.dir.x + dy * p.dir.y + dz * p.dir.z) / L)));
            if (a < ba) { ba = a; best = L; }
          }
        }
        if (best === null && this.field) {
          const a = new THREE.Vector3(), b = new THREE.Vector3();
          for (let t = 0; t < 1800; t += 18) {
            a.copy(p.muzzle).addScaledVector(p.dir, t); b.copy(p.muzzle).addScaledVector(p.dir, t + 18);
            if (b.y < -50) break;
            const h = this.field.segmentHit(a, b);
            if (h) { best = h.point.distanceTo(p.muzzle); break; }
          }
        }
        if (best !== null) { S.laser = best; S.R = best; }
      }
      // ống ngắm hội tụ với nòng ở cự ly đo xa: tâm kính ngắm = điểm nòng chỉ tới ở cự ly đó
      const tgt = this._raTg || (this._raTg = new THREE.Vector3());
      tgt.copy(p.muzzle).addScaledVector(p.dir, Math.max(120, S.R || 600));
      // rung hình theo phát bắn (súng nhỏ trên bệ nhẹ rung nhiều hơn)
      const firing = S.rcws ? !!u.isFiringAAmg : !!u.isFiringGatling;
      S.kick = firing ? Math.min(1, S.kick + dt * 8) : Math.max(0, S.kick - dt * 6);
      const j = S.kick * (S.rcws ? 0.0035 : u.tankType === 'SCOUT' ? 0.0025 : 0.0016) * (S.R || 600);
      if (j > 0) tgt.x += (Math.random() - 0.5) * j, tgt.y += (Math.random() - 0.5) * j, tgt.z += (Math.random() - 0.5) * j;
      const fovT = ZOOM[S.zoom].fov;
      S.fov += (fovT - S.fov) * Math.min(1, dt * 10);
      if (Math.abs(cam.fov - S.fov) > 0.01 || cam.near !== 0.3) { cam.fov = S.fov; cam.near = 0.3; cam.updateProjectionMatrix(); }
      cam.position.copy(p.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(tgt);
      this.camFocus.x = u.x; this.camFocus.z = u.z;
      return true;
    },

    raSightPointerDown(e, canvas) {
      const S = this.sight;
      if (!S) return;
      if (e.button === 2) { this.raZoom(1); return; }
      if (e.button !== 0) return;
      this.resumeTestSound();
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        S.dragging = true;
        S.lockAsk = true;
        try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* không hỗ trợ khóa chuột: kéo để ngắm */ }
        return;
      }
      S.fire = true;
    },

    raSightPointerUp() {
      const S = this.sight;
      if (!S) return;
      S.fire = false;
      S.dragging = false;
    },

    raSightPointerMove(e, canvas) {
      const S = this.sight;
      if (!S) return;
      const locked = document.pointerLockElement === canvas;
      if (!locked && !S.dragging) return;
      if (this._raG && this._raG._airAim) { this._raG.clearAirAim(); S.track = null; }   // tự ngắm tay: thôi bám mục tiêu
      const k = 0.0021 * (S.fov / ZOOM[0].fov) * R2D;
      S.az = wrap360(S.az + (e.movementX || 0) * k);
      S.el = Math.max(-8, Math.min(S.rcws ? DroneAir.C.RCWS.elMax : 60, S.el - (e.movementY || 0) * k));
    },

    raZoom(step) {
      const S = this.sight;
      if (!S) return;
      S.zoom = (S.zoom + step + ZOOM.length) % ZOOM.length;
    },

    // [T]: bám mục tiêu tự động — drone gần tâm kính ngắm nhất (≤ 6°): máy tính hỏa lực khóa + đón đầu
    raToggleTrack() {
      const S = this.sight, R = this._ra, G = this.raGame();
      if (!S || !G) return;
      if (S.track) { S.track = null; G.clearAirAim(); this.toast('Thôi bám mục tiêu — ngắm tay'); return; }
      if (!R || !R.on) { this.toast('Chưa có bia drone — bấm <b>B</b>'); return; }
      const cam = this.camera, f = new THREE.Vector3();
      cam.getWorldDirection(f);
      let best = null, ba = 6 * D2R;
      for (const d of R.drones) {
        if (d.dead) continue;
        const v = new THREE.Vector3(d.x - cam.position.x, d.y + 1.5 - cam.position.y, d.z - cam.position.z).normalize();
        const a = Math.acos(Math.max(-1, Math.min(1, v.dot(f))));
        if (a < ba) { ba = a; best = d; }
      }
      if (!best) { this.toast('Không có drone nào gần tâm kính ngắm (≤ 6°)'); return; }
      S.track = best;
      G.setAirAim({ kind: 'drone', dr: best });
    },

    // ---------- GIAO DIỆN: thanh công cụ, khung khóa, kính ngắm ----------
    raEnsureDom() {
      if (this._raDom) return this._raDom;
      const canvas = document.getElementById('ti-canvas');
      const stage = canvas && canvas.parentElement;
      if (!stage) return null;
      if (!document.getElementById('ra-style')) {
        const st = document.createElement('style');
        st.id = 'ra-style';
        st.textContent = `
.ra-bar{position:absolute;top:12px;right:12px;z-index:7;display:none;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;max-width:min(560px,70%);font-family:"Chakra Petch",system-ui,sans-serif}
.ti-range-mode .ra-bar{display:flex}
.ra-bar button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:6px;background:rgba(12,16,20,.72);border:1px solid rgba(255,255,255,.16);color:#d9e1e8;font-size:12px;font-weight:600;letter-spacing:.06em;backdrop-filter:blur(4px)}
.ra-bar button:hover{border-color:rgba(255,190,80,.6)}
.ra-bar button.on{background:rgba(255,170,40,.22);border-color:#ffb020;color:#ffd27a}
.ra-bar kbd{font:inherit;font-size:10px;opacity:.7;border:1px solid currentColor;border-radius:3px;padding:0 4px}
.ra-stats{width:100%;text-align:right;color:#cfd8df;font-size:11.5px;letter-spacing:.04em;text-shadow:0 1px 2px #000}
.ra-stats b{color:#ffd27a}
.ra-list{width:100%;display:grid;grid-template-columns:auto auto auto auto auto;gap:1px 10px;justify-content:end;color:#b9c4cc;font:11px "Share Tech Mono",ui-monospace,monospace;text-shadow:0 1px 2px #000}
.ra-list .dead{color:#ff7a6a}
.ra-tags{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden}
.ra-tag{position:absolute;left:0;top:0;margin:-5px 0 0 -5px;width:10px;height:10px;border:1.5px solid rgba(255,120,100,.85);transform-origin:center;box-sizing:border-box}
.ra-tag span{position:absolute;left:14px;top:-3px;white-space:nowrap;color:rgba(255,190,180,.9);font:10px "Share Tech Mono",ui-monospace,monospace;text-shadow:0 0 3px #000}
.ra-lock{position:absolute;inset:0;pointer-events:none;z-index:6;--ac:#ffb020;font-family:"Chakra Petch",system-ui,sans-serif}
.ra-lock .b{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;background:linear-gradient(var(--ac),var(--ac)) 0 0/12px 2px,linear-gradient(var(--ac),var(--ac)) 0 0/2px 12px,linear-gradient(var(--ac),var(--ac)) 100% 0/12px 2px,linear-gradient(var(--ac),var(--ac)) 100% 0/2px 12px,linear-gradient(var(--ac),var(--ac)) 0 100%/12px 2px,linear-gradient(var(--ac),var(--ac)) 0 100%/2px 12px,linear-gradient(var(--ac),var(--ac)) 100% 100%/12px 2px,linear-gradient(var(--ac),var(--ac)) 100% 100%/2px 12px;background-repeat:no-repeat;filter:drop-shadow(0 0 2px #000)}
.ra-lock .l{position:absolute;left:0;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid var(--ac);border-radius:50%;box-sizing:border-box;filter:drop-shadow(0 0 2px #000)}
.ra-lock .t{position:absolute;left:0;top:0;margin:28px 0 0 -110px;width:220px;text-align:center;color:var(--ac);font-size:11px;font-weight:600;letter-spacing:.08em;text-shadow:0 0 3px #000,0 0 6px #000;white-space:nowrap}
.ti-sight-on .ti-stage-foot,.ti-sight-on .ti-test-panel,.ti-sight-on .ti-range-bar{opacity:0;pointer-events:none}
.ra-sight{position:absolute;inset:0;pointer-events:none;z-index:6;display:none;color:#b6f5c8;font-family:"Share Tech Mono",ui-monospace,monospace;font-size:12px;letter-spacing:.05em;text-shadow:0 0 3px rgba(0,0,0,.9)}
.ti-sight-on .ra-sight{display:block}
.ra-sight .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 58%,rgba(0,0,0,.55) 100%),repeating-linear-gradient(0deg,rgba(0,0,0,.06) 0 1px,transparent 1px 3px)}
.ra-sight svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.ra-sight .cmd{position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;opacity:.75}
.ra-sight .cmd:before,.ra-sight .cmd:after{content:"";position:absolute;background:#ffd27a}
.ra-sight .cmd:before{left:6px;top:0;width:2px;height:14px}.ra-sight .cmd:after{left:0;top:6px;width:14px;height:2px}
.ra-sight .trk{position:absolute;left:0;top:0;border:1.5px solid #8dffb0;box-sizing:border-box;display:none}
.ra-sight .trk.lock{border-color:#ffb020}
.ra-sight .trk span{position:absolute;left:0;top:100%;margin-top:3px;white-space:nowrap;font-size:11px}
.ra-sight .lead{position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #ffb020;transform:rotate(45deg);box-sizing:border-box;display:none}
.ra-sight .c{position:absolute;padding:10px 14px;line-height:1.5}
.ra-sight .tl{left:0;top:52px}.ra-sight .tr{right:0;top:52px;text-align:right}.ra-sight .bl{left:0;bottom:8px}.ra-sight .br{right:0;bottom:8px;text-align:right;opacity:.8}
.ra-sight b{color:#eafff0;font-weight:400}
.ra-sight .warn{color:#ff8a70}
.ra-sight .hit{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;background:linear-gradient(45deg,transparent 45%,#fff 45%,#fff 55%,transparent 55%),linear-gradient(-45deg,transparent 45%,#fff 45%,#fff 55%,transparent 55%);filter:drop-shadow(0 0 2px #000)}
.ra-sight .msg{position:absolute;left:0;right:0;top:34%;text-align:center;font-family:"Chakra Petch",system-ui,sans-serif;font-size:20px;font-weight:700;letter-spacing:.14em;color:#ffd27a;opacity:0}
.ra-sight .hint{position:absolute;left:0;right:0;top:58%;text-align:center;color:#fff;font-family:"Chakra Petch",system-ui,sans-serif;font-size:13px;letter-spacing:.06em}
`;
        document.head.appendChild(st);
      }
      const bar = document.createElement('div');
      bar.className = 'ra-bar';
      bar.innerHTML = '<button data-ra="drones" title="Thả 4 drone địch bay làm bia (treo, bay vòng, cắt ngang, bay cao)"><i class="ti ti-drone" aria-hidden="true"></i> BIA DRONE <kbd>B</kbd></button>' +
        '<button data-ra="sight" title="Nhìn qua kính ngắm của xạ thủ / trạm súng"><i class="ti ti-crosshair" aria-hidden="true"></i> KÍNH NGẮM <kbd>V</kbd></button>' +
        '<button data-ra="reset" title="Đặt lại số liệu bắn"><i class="ti ti-refresh" aria-hidden="true"></i></button>' +
        '<div class="ra-stats"></div><div class="ra-list"></div>';
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        b.blur();
        const k = b.dataset.ra;
        if (k === 'drones') this.raSetDrones(!(this._ra && this._ra.on));
        else if (k === 'sight') this.setSight(!this.sight);
        else if (k === 'reset') { const R = this.raState(); R.fired = R.hits = R.near = R.kills = 0; }
      });
      const tags = document.createElement('div');
      tags.className = 'ra-tags';
      const lock = document.createElement('div');
      lock.className = 'ra-lock';
      lock.hidden = true;
      lock.innerHTML = '<div class="b"></div><div class="l"></div><div class="t"></div>';
      const sight = document.createElement('div');
      sight.className = 'ra-sight';
      sight.innerHTML = '<div class="vig"></div><svg></svg><div class="cmd"></div><div class="trk"><span></span></div><div class="lead"></div>' +
        '<div class="c tl"></div><div class="c tr"></div><div class="c bl"></div><div class="c br"></div><div class="hit"></div><div class="msg"></div><div class="hint"></div>';
      stage.append(tags, lock, sight, bar);
      const q = (r, s) => r.querySelector(s);
      this._raDom = {
        stage, canvas, bar, stats: q(bar, '.ra-stats'), list: q(bar, '.ra-list'), tags, tagEls: [], lock, lockB: q(lock, '.b'), lockL: q(lock, '.l'), lockT: q(lock, '.t'),
        sight, svg: q(sight, 'svg'), cmd: q(sight, '.cmd'), trk: q(sight, '.trk'), trkT: q(sight, '.trk span'), lead: q(sight, '.lead'),
        tl: q(sight, '.tl'), tr: q(sight, '.tr'), bl: q(sight, '.bl'), br: q(sight, '.br'), hit: q(sight, '.hit'), msg: q(sight, '.msg'), hint: q(sight, '.hint')
      };
      this.raSyncBar();
      return this._raDom;
    },

    raSyncBar() {
      const D = this._raDom;
      if (!D) return;
      D.bar.querySelector('[data-ra="drones"]').classList.toggle('on', !!(this._ra && this._ra.on));
      D.bar.querySelector('[data-ra="sight"]').classList.toggle('on', !!this.sight);
    },

    // chiếu điểm thế giới -> tọa độ trong khung sân khấu (px); null nếu sau lưng camera
    raProj(x, y, z) {
      const D = this._raDom, v = this._raPV || (this._raPV = new THREE.Vector3());
      v.set(x, y, z).project(this.camera);
      if (v.z > 1) return null;
      const c = D.canvas;
      return { x: c.offsetLeft + (v.x * 0.5 + 0.5) * c.clientWidth, y: c.offsetTop + (-v.y * 0.5 + 0.5) * c.clientHeight, out: Math.abs(v.x) > 1 || Math.abs(v.y) > 1 };
    },

    raHUD(dt) {
      if (!this.rangeMode) return;
      const D = this.raEnsureDom();
      if (!D) return;
      const R = this._ra, S = this.sight, u = this.activeUnit, G = this._raG;
      // số liệu bắn + danh sách bia (~4 lần / giây)
      if ((this._raStatT = (this._raStatT || 0) - dt) <= 0) {
        this._raStatT = 0.25;
        const r = R || { fired: 0, hits: 0, near: 0, kills: 0 };
        const pct = r.fired ? (100 * r.hits / r.fired) : 0;
        const st = `Đã bắn <b>${r.fired}</b> · Trúng <b>${r.hits}</b> (${pct.toFixed(1)}%${r.hits ? ' · ' + Math.round(r.fired / r.hits) + ' viên/trúng' : ''}) · Sượt ${r.near} · Hạ <b>${r.kills}</b>`;
        if (D._st !== st) { D.stats.innerHTML = st; D._st = st; }
        let ls = '';
        if (R && R.on && u && !S) {
          for (const d of R.drones) {
            const dist = Math.round(Math.hypot(d.x - u.x, d.y - (u.y || 0), d.z - u.z));
            const gy = this.field ? this.field.groundAt(d.x, d.z) : 0;
            ls += `<span${d.dead ? ' class="dead"' : ''}>${d.P.name}</span><span>${dist} M</span><span>cao ${Math.round(d.y - gy)}</span><span>${Math.round(MAX_SPEED_KMH(Math.hypot(d.wvx, d.wvy, d.wvz)))} km/h</span><span${d.dead ? ' class="dead"' : ''}>${d.dead ? 'BỊ HẠ' : Math.round(d.hp * 100) + '%'}</span>`;
          }
        }
        if (D._ls !== ls) { D.list.innerHTML = ls; D._ls = ls; }
      }
      // dấu bia trên màn hình (chế độ thường): ô vuông nhỏ + cự ly, để dễ tìm drone trên trời
      const showTags = R && R.on && !S && u;
      const n = showTags ? R.drones.length : 0;
      while (D.tagEls.length < n) { const t = document.createElement('div'); t.className = 'ra-tag'; t.innerHTML = '<span></span>'; D.tags.appendChild(t); D.tagEls.push(t); }
      D.tagEls.forEach((t, i) => {
        const d = showTags && R.drones[i];
        const p = d && !d.dead ? this.raProj(d.x, d.y + 1.5, d.z) : null;
        const lockd = d && G && G._airAim && G._airAim.dr === d;
        if (!p || p.out || lockd) { if (t.style.display !== 'none') t.style.display = 'none'; return; }
        t.style.display = '';
        t.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) rotate(45deg)`;
        t.firstChild.style.transform = 'rotate(-45deg)';
        t.firstChild.textContent = Math.round(Math.hypot(d.x - u.x, d.y - (u.y || 0), d.z - u.z)) + ' M';
      });
      // khung khóa drone (chế độ thường) — như trong trận
      const A = G && G._airAim;
      if (!S && A && A.kind === 'drone' && u && !u.isDead) {
        const dr = A.dr, p = this.raProj(dr.x, dr.y + 1.5, dr.z);
        if (p) {
          D.lock.hidden = false;
          D.lockB.style.transform = D.lockT.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;
          const l = A.lead ? this.raProj(A.lead.x, A.lead.y, A.lead.z) : null;
          D.lockL.style.transform = `translate(${Math.round(l ? l.x : p.x)}px,${Math.round(l ? l.y : p.y)}px)`;
          const col = A.state === 'high' || A.state === 'far' ? '#ff5a4a' : A.on ? '#5cf08a' : '#ffb020';
          D.lock.style.setProperty('--ac', col);
          const txt = 'DRONE ' + dr.P.name + ' · ' + Math.round(A.dist || 0) + ' M · ' + (A.state === 'high' ? 'QUÁ CAO' : A.state === 'far' ? 'NGOÀI TẦM SÚNG' : A.on ? 'ĐÃ NGẮM TRÚNG — GIỮ SPACE' : 'ĐANG XOAY THÁP') + (R && R.mark > 0 ? ' · TRÚNG!' : '');
          if (D.lockT.textContent !== txt) D.lockT.textContent = txt;
        } else D.lock.hidden = true;
      } else if (!D.lock.hidden) D.lock.hidden = true;
      if (S) this.raSightHUD(D, dt);
    },

    raSightHUD(D, dt) {
      const S = this.sight, u = this.activeUnit, R = this._ra, G = this._raG, cam = this.camera;
      const W = D.canvas.clientWidth, H = D.canvas.clientHeight, cx = D.canvas.offsetLeft + W / 2, cy = D.canvas.offsetTop + H / 2;
      // lưới ngắm: vạch chia mil theo độ phóng đại (1 mil = 1 m ở 1000 m)
      const pxMil = (H / 2) / Math.tan(cam.fov * D2R / 2) * 0.001;
      const key = Math.round(pxMil * 100) + ':' + W + ':' + H;
      if (D._svgKey !== key) {
        D._svgKey = key;
        const g = 6 * pxMil < 10 ? 10 : 6 * pxMil, L = Math.max(W, H);
        let s = `<g stroke="#b6f5c8" stroke-width="1.4" fill="none" opacity=".9" transform="translate(${cx},${cy})">`;
        s += `<line x1="${-L}" y1="0" x2="${-g}" y2="0"/><line x1="${g}" y1="0" x2="${L}" y2="0"/><line x1="0" y1="${g}" x2="0" y2="${L}"/><line x1="0" y1="${-L}" x2="0" y2="${-g * 2.2}"/>`;
        s += `<circle r="1.6" fill="#b6f5c8" stroke="none"/>`;
        for (let m = 5; m <= 60; m += 5) {
          const x = m * pxMil;
          if (x > W / 2 - 20) break;
          const h = m % 10 === 0 ? 7 : 4;
          s += `<line x1="${x}" y1="${-h}" x2="${x}" y2="${h}"/><line x1="${-x}" y1="${-h}" x2="${-x}" y2="${h}"/>`;
          if (m % 10 === 0 && x > 18) s += `<text x="${x}" y="${-h - 3}" fill="#b6f5c8" stroke="none" font-size="9" text-anchor="middle">${m}</text>`;
          const y = m * pxMil;
          if (y < H / 2 - 20) s += `<line x1="${-h}" y1="${y}" x2="${h}" y2="${y}"/>`;
        }
        // vòng đón đầu 20 mil (~drone 50 km/h ở 400 m)
        if (20 * pxMil < H / 2 - 10) s += `<circle r="${20 * pxMil}" opacity=".55" stroke-dasharray="4 6"/>`;
        s += '</g>';
        D.svg.innerHTML = s;
      }
      // hướng ngắm đang ra lệnh (tay / chuột): dấu + ; nòng đang đuổi theo với tốc độ servo thật
      const p = this.raSightPose(u), Rg = Math.max(120, S.R || 600);
      const az = S.az * D2R, el = S.el * D2R;
      const cmd = this.raProj(p.pos.x + Math.sin(az) * Math.cos(el) * Rg, p.pos.y + Math.sin(el) * Rg, p.pos.z - Math.cos(az) * Math.cos(el) * Rg);
      const showCmd = cmd && !(G && G._airAim) && Math.hypot(cmd.x - cx, cmd.y - cy) > 3;
      D.cmd.style.display = showCmd ? '' : 'none';
      if (showCmd) D.cmd.style.transform = `translate(${Math.round(cmd.x)}px,${Math.round(cmd.y)}px)`;
      // khung bám mục tiêu (drone gần tâm nhất trong 4°, hoặc mục tiêu đang bám) + dấu đón đầu
      let trk = S.track, ta = 4 * D2R;
      const f = cam.getWorldDirection(this._raF || (this._raF = new THREE.Vector3()));
      if (!trk && R && R.on) {
        for (const d of R.drones) {
          if (d.dead) continue;
          const vx = d.x - cam.position.x, vy = d.y + 1.5 - cam.position.y, vz = d.z - cam.position.z, L = Math.hypot(vx, vy, vz);
          const a = Math.acos(Math.max(-1, Math.min(1, (vx * f.x + vy * f.y + vz * f.z) / L)));
          if (a < ta) { ta = a; trk = d; }
        }
      }
      let info = '';
      if (trk && !trk.dead) {
        const tp = this.raProj(trk.x, trk.y + 1.5, trk.z);
        const dist = Math.hypot(trk.x - p.muzzle.x, trk.y + 1.5 - p.muzzle.y, trk.z - p.muzzle.z);
        if (tp && !tp.out) {
          const sz = Math.max(18, Math.min(160, 12 / dist / Math.tan(cam.fov * D2R / 2) * (H / 2) * 1.6));
          D.trk.style.display = 'block';
          D.trk.classList.toggle('lock', !!S.track);
          D.trk.style.width = D.trk.style.height = Math.round(sz) + 'px';
          D.trk.style.transform = `translate(${Math.round(tp.x - sz / 2)}px,${Math.round(tp.y - sz / 2)}px)`;
          const gy = this.field ? this.field.groundAt(trk.x, trk.z) : 0;
          const t = `UAV ${trk.P.name} · ${Math.round(dist)} M · CAO ${Math.round(trk.y - gy)} · ${Math.round(MAX_SPEED_KMH(Math.hypot(trk.wvx, trk.wvy, trk.wvz)))} KM/H${S.track ? ' · BÁM' : ''}`;
          if (D.trkT.textContent !== t) D.trkT.textContent = t;
        } else D.trk.style.display = 'none';
        // dấu đón đầu: đặt tâm kính ngắm vào dấu này thì đạn (bay theo đường đạn thật) gặp drone
        let lp = null;
        if (S.assist && G) {
          if ((S.solT = (S.solT || 0) - dt) <= 0 || S.solFor !== trk) {
            S.solT = 0.08; S.solFor = trk;
            const ammo = S.rcws ? 'MG762' : u.selectedAmmo === 'INCENDIARY' ? 'INCENDIARY' : u.tankType === 'SCOUT' ? 'SCOUT_BULLET' : 'GATLING_BULLET';
            S.sol = G.airShotSolution(u, ammo, trk.x, trk.y + 1.5, trk.z, trk.wvx, trk.wvy, trk.wvz);
          }
          const so = S.sol;
          if (so) {
            const a2 = so.az * D2R, e2 = so.el * D2R, Rr = Math.max(120, so.dist);
            lp = this.raProj(p.muzzle.x + Math.sin(a2) * Math.cos(e2) * Rr, p.muzzle.y + Math.sin(e2) * Rr, p.muzzle.z - Math.cos(a2) * Math.cos(e2) * Rr);
            if (!so.reach) info = '<span class="warn">NGOÀI TẦM SÚNG</span>';
          }
        }
        D.lead.style.display = lp && !lp.out ? 'block' : 'none';
        if (lp) D.lead.style.transform = `translate(${Math.round(lp.x)}px,${Math.round(lp.y)}px) rotate(45deg)`;
      } else { D.trk.style.display = 'none'; D.lead.style.display = 'none'; }
      // khung thông tin 4 góc
      const tank = S.rcws, d = p.dir;
      const gaz = wrap360(Math.atan2(d.x, -d.z) * R2D), gel = Math.asin(Math.max(-1, Math.min(1, d.y))) * R2D;
      let wpn, ammoTxt;
      if (tank) {
        const rs = u._rcws || {};
        wpn = 'SÚNG MÁY 7.62MM · TRẠM ĐIỀU KHIỂN TỪ XA';
        ammoTxt = rs.reload > 0 ? `<span class="warn">THAY HỘP ĐẠN ${rs.reload.toFixed(1)} S</span>` : `ĐẠN <b>${rs.mag !== undefined ? rs.mag : DroneAir.C.RCWS.mag}</b> / ${DroneAir.C.RCWS.mag}`;
      } else {
        wpn = u.tankType === 'GATLING' ? 'PHÁO 30MM 6 NÒNG' : 'SÚNG MÁY 12.7MM';
        if (u.selectedAmmo === 'INCENDIARY') wpn += ' · ĐẠN CHÁY';
        const heat = Math.round((u.barrelHeat || 0) * 100);
        ammoTxt = (u.reloadTimer > 0 && u.gatlingMag <= 0 ? `<span class="warn">NẠP ĐẠN ${u.reloadTimer.toFixed(1)} S</span>` : `ĐẠN <b>${u.gatlingMag !== undefined ? u.gatlingMag : '--'}</b> / ${u.gatlingMagMax || '--'}`) +
          (u.tankType === 'GATLING' ? `<br>NHIỆT NÒNG ${u.isOverheated ? '<span class="warn">QUÁ NHIỆT</span>' : heat + '%'}` : '');
      }
      const tl = `${wpn}<br>${ammoTxt}`;
      const tr = `HƯỚNG <b>${gaz.toFixed(1).padStart(5, '0')}°</b><br>GÓC TẦM <b>${(gel >= 0 ? '+' : '') + gel.toFixed(1)}°</b><br>PHÓNG ĐẠI <b>${ZOOM[S.zoom].k}</b>`;
      const bl = `CỰ LY LASER <b>${S.laser ? Math.round(S.laser) + ' M' : '----'}</b>${info ? '<br>' + info : ''}<br>${S.track ? 'BÁM MỤC TIÊU: <b>BẬT</b>' : 'NGẮM TAY'} · ĐÓN ĐẦU: <b>${S.assist ? 'BẬT' : 'TẮT'}</b>`;
      const br = `chuột: ngắm · giữ trái: bắn · cuộn / phải: phóng đại<br>T: bám mục tiêu · L: dấu đón đầu · V / Esc: thoát${tank ? '<br>Space: pháo chính' : ''}`;
      if (D._tl !== tl) { D.tl.innerHTML = tl; D._tl = tl; }
      if (D._tr !== tr) { D.tr.innerHTML = tr; D._tr = tr; }
      if (D._bl !== bl) { D.bl.innerHTML = bl; D._bl = bl; }
      if (D._br !== br) { D.br.innerHTML = br; D._br = br; }
      const locked = document.pointerLockElement === D.canvas;
      const hint = !locked && !S.dragging ? 'NHẤP VÀO KHUNG HÌNH ĐỂ CẦM SÚNG (khóa chuột) · hoặc kéo chuột để ngắm, Space bắn' : '';
      if (D._hint !== hint) { D.hint.textContent = hint; D._hint = hint; }
      D.hit.style.opacity = R && R.mark > 0 ? Math.min(1, R.mark / 0.15) : 0;
      D.msg.style.opacity = R && R.msg > 0 ? Math.min(1, R.msg / 0.4) : 0;
      if (R && R.msg > 0 && D.msg.textContent !== R.msgTxt) D.msg.textContent = R.msgTxt;
    },

    // phím tắt phòng thử đạn: B bia drone, V kính ngắm, T bám mục tiêu, L dấu đón đầu
    raBindKeys() {
      if (this._raKeys) return;
      this._raKeys = true;
      window.addEventListener('keydown', (e) => {
        if (!this.isOpen || !this.rangeMode || e.repeat) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName)) return;
        const c = e.code;
        if (c === 'KeyB') this.raSetDrones(!(this._ra && this._ra.on));
        else if (c === 'KeyV') this.setSight(!this.sight);
        else if (c === 'KeyT' && this.sight) this.raToggleTrack();
        else if (c === 'KeyL' && this.sight) { this.sight.assist = !this.sight.assist; this._raAssist = this.sight.assist; }
        else return;
        e.preventDefault();
        e.stopPropagation();
      }, true);
      document.addEventListener('pointerlockchange', () => {
        const S = this.sight;
        if (S && document.pointerLockElement !== (this._raDom && this._raDom.canvas)) { S.fire = false; S.dragging = false; }
      });
    },

    /** Vào / ra phòng thử, đổi xe, đóng phòng xem */
    raReset(opts = {}) {
      if (this.sight) this.setSight(false);
      const G = this._raG;
      if (G) G.clearAirAim();
      if (opts.unit) { this.raClearShells(); return; }
      if (this._ra && this._ra.on) this.raSetDrones(false);
      this.raClearShells();
      if (G) G.resetDroneWorld();
      const D = this._raDom;
      if (D) { D.lock.hidden = true; D.tagEls.forEach(t => { t.style.display = 'none'; }); }
    }
  };

  return { methods, PATTERNS, ZOOM };
})();

if (typeof TankInspector !== 'undefined') Object.assign(TankInspector.prototype, RangeAir.methods);
if (typeof window !== 'undefined') window.RangeAir = RangeAir;
