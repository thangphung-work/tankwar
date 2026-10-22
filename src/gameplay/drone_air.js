/**
 * DRONE TRINH SÁT TRÊN CHIẾN TRƯỜNG (gắn thêm phương thức vào ArtilleryGame3D — xem cuối game.js)
 * - Đồng bộ mạng: máy điều khiển xe pháo gửi trạng thái drone (đậu / cất cánh / bay / bay về / mất) + vị trí khi bay
 *   ~10 lần/giây; máy khác thấy drone đậu trên nóc cabin, bay trên trời (nội suy trễ ~120 ms), nghe tiếng cánh quạt
 * - Bắn hạ được: đạn bay qua sát thân drone là trúng (ballistics.js airTargetHit). Như sát thương xe, MÁY CỦA NGƯỜI BẮN
 *   quyết định trúng (gửi DRONE_HIT); máy điều khiển drone trừ "thân drone", hết thì drone rơi (DRONE_DOWN)
 * - Mất drone: pháo không còn mắt ngắm cầu vồng (chỉ bắn thẳng tự vệ trong tầm nhìn), phải hồi sinh mới có drone mới
 * - Xe 6 nòng / xe trinh sát: nhấp lên trời = nâng nòng bắn lên hướng đó; nhấp đúng drone địch đang thấy = khóa drone
 *   (máy tính hỏa lực tự đón đầu + nâng hạ nòng). Radar / Tab / tự khóa KHÔNG khóa drone — phải tự nhấp vào drone.
 * - Xe 6 nòng có radar cảnh giới phòng không riêng (bộ phận 'aaRadar' trên nóc tháp): phe mình thấy drone địch xa hơn
 *   (AA_RADAR_R thay vì SEE_R), xe mình báo bíp + nhật ký khi drone địch lọt vào vùng phủ, đánh dấu vết radar trên màn hình
 *   (mũi tên mép màn hình khi drone ngoài khung nhìn) để người chơi tìm & nhấp khóa. Radar bị bắn bay -> mất hết.
 */
const DroneAir = (() => {
  const C = {
    HIT_R: 4.5,          // bán kính trúng quanh tâm thân drone (sải cánh kể cả cánh quạt ~0.8 m = 6.6 đv)
    NEAR_R: 42,          // đạn bay qua trong bán kính này: tiếng rít qua micro drone
    CENTER_Y: 1.5,       // tâm thân drone trên gốc mô hình (đáy chân đáp) — recon_drone.js CENTER_Y
    // phần "thân drone" mất mỗi phát trúng (1 = rơi): drone nhựa / sợi carbon rất mỏng manh —
    // 30mm 2 phát, 12.7mm 3 phát, đạn cháy 2 phát (đạn pháo không bắn được mục tiêu trên không)
    DMG: { GATLING_BULLET: 0.5, SCOUT_BULLET: 0.34, INCENDIARY: 0.5 },
    // Mảnh văng của đạn 30mm nổ trên không (đạn lập trình ngòi 'ahead30', ballistics abmBurst) trúng drone: sát thương
    // bằng FRAG_K phát trúng thẳng. Đạn 30mm thường dùng ngòi chạm: bay sượt qua không nổ, không có mảnh
    FRAG_K: 0.5,
    ABM: { reach: 40, cone: 0.18, base: 3 },   // chùm bi vonfram hình nón phía trước điểm nổ (đv): tầm, độ mở, bán kính gốc
    SEE_R: 1500,         // đội có xe trong bán kính ngang này thì thấy drone địch bay (drone bay cao, dễ lộ)
    AA_RADAR_R: 2600,    // xe 6 nòng còn radar phòng không: phát hiện drone địch trong bán kính ngang này (~325 m)
    SCOUT_AIR_R: 1800,   // radar trinh sát cũng bắt & khóa được drone, nhưng tầm ngắn hơn radar phòng không 6 nòng
    BOT_SEE_R: 1100,     // bot tự phát hiện drone trong bán kính này
    SEND_FLY: 0.1, SEND_IDLE: 1.0,
    INTERP: 0.12, EXTRAP: 0.35,
    DOCK_VIEW: 1300,     // drone đậu trên nóc xe khác chỉ vẽ khi camera trong khoảng này
    AA_TYPES: { GATLING: 1, SCOUT: 1, ALL_ROUNDER: 1 },
    // trạm súng máy 7.62mm điều khiển từ xa trên nóc tháp xe tăng: súng nhỏ, đạn thường — yếu hơn hẳn súng máy 12.7mm
    // xe trinh sát: tầm ngắn hơn ~1/3 (đạn nhẹ, cản lớn, rơi nhanh), ~7 phát trúng drone mới rơi (12.7mm: 3), bắn vào xe
    // bọc thép vô hại; bắn nhanh hơn (~11 phát/giây như súng 7.62mm thật), dây đạn 200 viên. Quay độc lập với tháp pháo.
    // v / k / travel: hệ số so với đường đạn 12.7mm (SCOUT_BULLET)
    RCWS: { rof: 0.09, mag: 200, reload: 5, yawRate: 1.7, pitchRate: 1.2, elMin: -8, elMax: 70, dmgDrone: 0.15, dmgVehicle: 0.005,
      v: 0.92, k: 1.9, travel: 0.65,
      spread: 0.008, name: 'Súng máy 7.62mm', ammo: 'MG762' },  // spread: tản mát thêm (rad, ~8 mil — bệ ổn định, chùm đạn gọn)
    // Các vũ khí khác gắn được lên cùng bệ xoay ở ô NÓC THÁP (u.roofWeapon; mô hình: mbt_halberd.js). Cùng cơ chế trạm súng:
    // lệnh u._aa { az, el, firing } -> bệ quay / ngóc đúng tốc độ, giữ cò bắn theo nhịp, hết hộp thì thay
    ROOF: {
      // Súng phóng lựu tự động 40mm (Mk 19): ~5 quả/giây, quả lựu bay chậm cầu vồng thấp (bắn ra như đạn 30mm rồi giảm tốc),
      // nổ mảnh bán kính nhỏ. direct / splash: sát thương gốc trúng thẳng / nổ sát (trước khi tính giáp), blast: vùng nổ
      agl: { rof: 0.2, mag: 32, reload: 7, yawRate: 1.4, pitchRate: 1.0, elMin: -8, elMax: 45, v: 0.3, spread: 0.012,
        direct: 0.32, splash: 0.5, blast: { radius: 26, core: 6 }, name: 'Súng phóng lựu 40mm', ammo: 'AGL40' },
      // Giàn rocket 4 ống không điều khiển: đạn nổ lõm như RPG, giữ cò phóng lần lượt từng ống, hết 4 quả nạp cả hộp
      rocket: { rof: 0.75, mag: 4, reload: 20, yawRate: 1.1, pitchRate: 0.8, elMin: -5, elMax: 30, spread: 0.006,
        name: 'Giàn rocket', ammo: 'RPG' }
    }
  };
  // Thông số vũ khí trên bệ nóc tháp của xe (mặc định: súng máy)
  const roofCfg = (u) => (u && u.roofWeapon && C.ROOF[u.roofWeapon]) || C.RCWS;
  const ST = ['docked', 'launching', 'flying', 'returning', 'lost'];
  const airborne = s => s === 'launching' || s === 'flying' || s === 'returning';
  const wrapPi = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const nowS = () => performance.now() / 1000;

  const methods = {
    /** Trận mới: dọn drone / xác drone / khói của trận trước */
    resetDroneWorld() {
      const drop = m => { if (m && m.parent) m.parent.remove(m); };
      if (this._otherDrones) this._otherDrones.forEach(R => drop(R.model));
      this._otherDrones = new Map();
      (this._droneFalls || []).forEach(f => drop(f.m));
      this._droneFalls = [];
      (this._droneSmoke || []).forEach(p => { drop(p.m); p.m.material.dispose(); });
      this._droneSmoke = [];
      (this._droneFalls || []).forEach(f => (f.flames || []).forEach(drop));
      (this._droneDebris || []).forEach(d => { drop(d.m); if (d.flame) drop(d.flame); });
      this._droneDebris = [];
      if (this._droneFlames) this._droneFlames.forEach(drop);
      this._droneFlames = new Map();
      this._airList = [];
      this._airAim = null;
      this._droneLocks = new Map();
      this._droneThreat = null;
      this._droneSentCode = undefined;
      if (this._airLockEl) this._airLockEl.hidden = true;
      this._aaContacts = new Set();
      if (this._aaRadarEl) this._aaRadarEl.hidden = true;
      if (this.ballistics && this.ballistics.airTargets) this.ballistics.airTargets.length = 0;
    },

    // ---------- DANH SÁCH DRONE ĐANG BAY ----------
    /** Drone đang bay trên trời (mọi phe, cả drone của mình). Mỗi phần tử: x, y (đáy), z, wvx/wvy/wvz, team, owner, key */
    airDroneList() { return this._airList || []; },

    droneIsAirborne(dr) { return !!dr && airborne(dr.state) && !(dr.owner && dr.owner.isDead); },

    /** Xe có radar cảnh giới phòng không còn hoạt động (xe 6 nòng, cụm radar chưa bị bắn bay) */
    aaRadarUp(u) {
      return !!u && !u.isDead && u.tankType === 'GATLING' && !(u.dmg && u.dmg.lost && u.dmg.lost.has('aaRadar'))
        && !(this.radarJammed && this.radarJammed(u));
    },

    /** Tầm radar bắt / khóa drone của xe (0: không có / hỏng / đang bị phá sóng): 6 nòng AA_RADAR_R, trinh sát SCOUT_AIR_R */
    airRadarR(u) {
      if (this.aaRadarUp(u)) return C.AA_RADAR_R;
      if (!u || u.isDead || u.tankType !== 'SCOUT' || (u.dmg && u.dmg.lost && u.dmg.lost.has('sensor'))) return 0;
      return this.radarJammed && this.radarJammed(u) ? 0 : C.SCOUT_AIR_R;
    },

    /** UAV cảm tử kiểu tên lửa (vệt khói + động cơ đẩy nóng) bị radar bắt xa hơn drone thường */
    airDetectMul(dr) {
      return dr && dr.owner && dr.owner.uavKind === 'kami' && typeof KamiUAV !== 'undefined' ? KamiUAV.C.DETECT_MUL : 1;
    },

    /** Phe team có thấy drone này không: drone phe mình, hoặc có xe phe mình còn sống trong bán kính SEE_R
     *  (xe còn radar bắt drone: airRadarR — 6 nòng AA_RADAR_R, trinh sát SCOUT_AIR_R) */
    droneSeenByTeam(dr, team) {
      if (!dr || dr.team === team) return true;
      for (const u of this.units) {
        if (u.isDead || u.team !== team) continue;
        const R = Math.max(C.SEE_R, this.airRadarR(u) * this.airDetectMul(dr));
        const dx = u.x - dr.x, dz = u.z - dr.z;
        if (dx * dx + dz * dz <= R * R) return true;
      }
      return false;
    },

    // ---------- TAI NGHE ----------
    // Đang xem qua camera drone: nghe bằng micro trên drone (âm thanh chiến trường quanh drone, theo độ cao bay, trễ theo
    // khoảng cách, trái / phải theo hướng camera drone); còn lại: nghe tại xe mình
    audioListener() {
      const S = this._sight;
      if (S && S.arty && this.camera) return this.camera.position;
      return this.player;
    },

    /** Khoảng cách từ micro drone tới nguồn âm pos {x, z[, y]} (null: không xem qua drone) — nguồn thiếu y coi như trên mặt đất */
    droneEarDistance(pos) {
      const S = this._sight;
      if (!S || !S.arty || !pos || !this.camera) return null;
      const L = this.camera.position;
      const y = pos.y !== undefined ? pos.y : (this.terrain ? this.terrain.getElevationAt(pos.x, pos.z) : 0);
      return Math.max(1, Math.hypot(pos.x - L.x, y - L.y, pos.z - L.z));
    },

    unitById(id) {
      for (const u of this.units) if (u.id === id) return u;
      return null;
    },

    // ---------- MỖI KHUNG HÌNH (trước khi cập nhật đạn) ----------
    updateDroneWorld(dt) {
      const P = this.player;
      const list = this._airList || (this._airList = []);
      list.length = 0;
      let own = null;
      if (P && P.tankType === 'ARTILLERY') {
        own = this.droneState();
        own.key = 'own'; own.team = P.team; own.owner = P;
        this.trackDroneVel(own, dt);
        if (this.droneIsAirborne(own)) list.push(own);
      }
      this.updateOtherDrones(dt, list);
      // mục tiêu trên không cho đạn
      const B = this.ballistics;
      if (B) {
        const AT = B.airTargets || (B.airTargets = []);
        AT.length = 0;
        const viewing = this._sight && this._sight.arty;
        for (const dr of list) {
          const T = dr._at || (dr._at = { dr });
          T.x = dr.x; T.y = dr.y + C.CENTER_Y; T.z = dr.z;
          T.r = C.HIT_R; T.team = dr.team;
          T.nearR = dr === own && viewing ? C.NEAR_R : 0;
          AT.push(T);
        }
        if (!B.onAirHit) B.onAirHit = (s, T, h) => this.onDroneShot(s, T.dr, h);
        if (!B.onAirNear) B.onAirNear = (s, T, d) => this.onDroneNearMiss(s, T.dr, d);
      }
      this.updateDroneDocks(dt);
      this.updateDroneDamageFX(dt, list);
      this.updateDroneFalls(dt);
      this.sendDroneState(dt);
      this.updateRCWS(dt);
      this.sendAAmg(dt);
      this.flushDroneHits();
      this.sendDroneLocks(dt);
      this.updateDroneThreat(dt);
      this.updateDroneAmbient(list);
      this.updateAirLockOverlay();
      this.updateAARadar(list);
    },

    // ĐẾ SẠC DRONE trên nóc cabin mọi xe pháo: kẹp càng nhả khi drone cất cánh / sắp đáp, đèn trạng thái
    // (xanh lá: sẵn sàng, vàng nhấp nháy: đang sạc, xanh dương: drone đang bay, đỏ: mất drone)
    updateDroneDocks(dt) {
      if (typeof ReconDrone === 'undefined' || !ReconDrone.buildDock) return;
      const P = this.player, cam = this.camera;
      for (const u of this.units) {
        if (u.tankType !== 'ARTILLERY' || !u.chassisGroup) continue;
        if (!u._droneDock || u._droneDock.parent !== u.chassisGroup) { u._droneDock = ReconDrone.buildDock(); u.chassisGroup.add(u._droneDock); }
        // UAV cảm tử: phóng từ ống trên chân đế mô-đun, không có đế sạc drone trinh sát
        u._droneDock.visible = u.uavKind !== 'kami';
        if (u.uavKind === 'kami') continue;
        if (u.isDead || !u.group || !u.group.visible) continue;
        if (cam && u !== P && Math.hypot(cam.position.x - u.x, cam.position.z - u.z) > C.DOCK_VIEW) continue;
        const dr = u === P ? this.droneState() : this.otherDrone(u);
        let open = false, status = 'ready';
        if (dr.state === 'lost') status = 'empty';
        else if (dr.state === 'docked') status = u === P && dr.batt < 0.999 ? 'charging' : 'ready';
        else {
          status = 'out';
          const pd = u === P ? this.dronePadWorld() : { x: u.x, y: (u.y || 0) + ReconDrone.PAD.y, z: u.z };
          open = dr.state === 'launching' || (Math.hypot(dr.x - pd.x, dr.z - pd.z) < 140 && dr.y - pd.y < 220);
        }
        ReconDrone.animateDock(u._droneDock, dt, open, status);
      }
    },

    // vận tốc thật của drone (ước lượng từ dịch chuyển, lọc nhẹ) — dùng để đón đầu
    trackDroneVel(dr, dt) {
      if (!(dt > 0)) return;
      if (dr._px === undefined || !airborne(dr.state)) { dr.wvx = dr.wvy = dr.wvz = 0; }
      else {
        const ivx = (dr.x - dr._px) / dt, ivy = (dr.y - dr._py) / dt, ivz = (dr.z - dr._pz) / dt;
        if (Math.hypot(ivx, ivz) < 2500) {
          const k = 1 - Math.exp(-dt * 6);
          dr.wvx += (ivx - dr.wvx) * k; dr.wvy += (ivy - dr.wvy) * k; dr.wvz += (ivz - dr.wvz) * k;
        }
      }
      dr._px = dr.x; dr._py = dr.y; dr._pz = dr.z;
    },

    // Drone của các xe pháo khác: bot / xe của máy khác. Đậu thì gắn lên nóc cabin (theo xe), bay thì nội suy từ gói mạng
    otherDrone(u) {
      const M = this._otherDrones || (this._otherDrones = new Map());
      let R = M.get(u.id);
      if (!R) {
        R = { key: 'u' + u.id, unit: u, owner: u, team: u.team, state: 'docked', hp: 1, samples: [], x: u.x, y: u.y || 0, z: u.z, yaw: 0,
          wvx: 0, wvy: 0, wvz: 0, model: null, net: false, seen: false };
        M.set(u.id, R);
      }
      return R;
    },

    updateOtherDrones(dt, list) {
      if (typeof ReconDrone === 'undefined') return;
      const cam = this.camera, myTeam = this.player ? this.player.team : null, t = nowS();
      for (const u of this.units) {
        if (u === this.player || u.tankType !== 'ARTILLERY') continue;
        const R = this.otherDrone(u);
        R.team = u.team;
        // xe bot (không có gói mạng): drone luôn đậu; hồi sinh / xe chết không đổi gì
        // (drone bị bắn nát ngay trên đế — game.hitDockedDrone: mất tới khi xe chết & hồi sinh mới có drone mới)
        if (!R.net && R.state === 'lost' && u.isDead) R.state = 'docked';
        if (!R.net && R.state !== 'docked' && R.state !== 'lost' && !u.isDead) R.state = 'docked';
        if (airborne(R.state)) {
          this.interpDrone(R, t);
          this.trackDroneVel(R, dt);
          if (!u.isDead || R.net) list.push(R);
          R.seen = myTeam === null || this.droneSeenByTeam(R, myTeam);
          // lựu pháo mang UAV cảm tử: mô hình cánh cố định (kamikaze_uav.js)
          const kami = u.uavKind === 'kami' && typeof KamiUAV !== 'undefined';
          if (R.model && !!R.model.userData.kami !== kami) { if (R.model.parent) R.model.parent.remove(R.model); R.model = null; }
          if (!R.model) R.model = kami ? KamiUAV.build(u.team) : ReconDrone.build(u.team);
          const m = R.model;
          if (m.parent !== this.scene) this.scene.add(m);
          m.visible = R.seen;
          if (R.seen) {
            m.position.set(R.x, R.y, R.z);
            const tilt = Math.min(0.25, Math.hypot(R.wvx, R.wvz) / 2400);
            m.rotation.set(kami ? Math.atan2(R.wvy || 0, Math.hypot(R.wvx, R.wvz) || 1) : -tilt, R.yaw, 0);
            if (kami) { KamiUAV.animate(m, dt, 1, 1); if (this.kamiTrailModel) this.kamiTrailModel(m, dt); } else ReconDrone.animate(m, dt, 1);
          }
          continue;
        }
        R.seen = false;
        R._px = undefined;
        const ch = u.chassisGroup;
        const showDock = R.state === 'docked' && u.uavKind !== 'kami' && !u.isDead && ch && u.group && u.group.visible && !u.isHiddenFromPlayer
          && cam && Math.hypot(cam.position.x - u.x, cam.position.z - u.z) < C.DOCK_VIEW;
        if (showDock) {
          if (!R.model) R.model = ReconDrone.build(u.team);
          const m = R.model;
          if (m.parent !== ch) { ch.add(m); m.rotation.set(0, 0, 0); }
          m.position.set(ReconDrone.PAD.x, ReconDrone.PAD.y, ReconDrone.PAD.z);
          m.visible = true;
          ReconDrone.animate(m, dt, 0);
        } else if (R.model) R.model.visible = false;
        R.x = u.x; R.z = u.z; R.y = (u.y || 0) + ReconDrone.PAD.y;
      }
    },

    // nội suy vị trí drone từ gói mạng (trễ C.INTERP), ngoại suy tối đa C.EXTRAP khi gói đến muộn
    interpDrone(R, t) {
      const S = R.samples;
      if (!S.length) return;
      const rt = t - C.INTERP;
      let a = S[0], b = null;
      for (let i = S.length - 1; i >= 0; i--) { if (S[i].t <= rt) { a = S[i]; b = S[i + 1] || null; break; } }
      if (b) {
        const k = Math.max(0, Math.min(1, (rt - a.t) / Math.max(1e-3, b.t - a.t)));
        R.x = a.x + (b.x - a.x) * k; R.y = a.y + (b.y - a.y) * k; R.z = a.z + (b.z - a.z) * k;
        R.yaw = a.w + wrapPi(b.w - a.w) * k;
        return;
      }
      const L = S[S.length - 1], Pv = S.length > 1 ? S[S.length - 2] : null;
      if (rt <= L.t || !Pv) { R.x = L.x; R.y = L.y; R.z = L.z; R.yaw = L.w; return; }
      const span = Math.max(1e-3, L.t - Pv.t), e = Math.min(C.EXTRAP, rt - L.t);
      R.x = L.x + (L.x - Pv.x) / span * e; R.y = L.y + (L.y - Pv.y) / span * e; R.z = L.z + (L.z - Pv.z) / span * e;
      R.yaw = L.w;
    },

    // ---------- ĐẠN TRÚNG / BAY SƯỢT QUA DRONE ----------
    onDroneShot(s, dr, h) {
      if (!dr) return;
      const fx = this.ballistics && this.ballistics.fx;
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
      if (fx) {
        try {
          if (fx.spawnBulletSurfaceImpact) {
            const D = new THREE.Vector3(s.vx / sp, s.vy / sp, s.vz / sp);
            fx.spawnBulletSurfaceImpact(new THREE.Vector3(h.x, h.y, h.z), D.clone().negate(), D, s.ammoType, 'steel', {});
          }
        } catch (e) { /* hiệu ứng phụ */ }
      }
      const shooter = this.unitById(s.shooterId);
      const NS = this.netSync && !this.netSync.detached ? this.netSync : null;
      const auth = !s.netRemote && (!NS || (shooter && NS.owns(shooter)));
      const dmg = (s.aaMG ? C.RCWS.dmgDrone : (C.DMG[s.ammoType] || 0)) * (h && h.d > C.HIT_R ? C.FRAG_K : 1);
      if (!dmg) return;
      if (dr.key === 'own') {
        if (auth) this.damageOwnDrone(dmg, shooter);
        else this.droneHitFX(true);   // đạn từ bản sao trên máy mình: chỉ hình / tiếng, sát thương do máy người bắn báo
        return;
      }
      const SE = window.soundEngine, P = this.player;
      if (SE && SE.playDroneHit && P && Math.hypot(P.x - h.x, P.z - h.z) < 1300) SE.playDroneHit(false);
      if (!auth || !dr.net || !shooter) return;
      dr.pend = (dr.pend || 0) + dmg;
      dr.pendBy = shooter;
      if (shooter === P) this._droneHitMark = 0.35;
    },

    onDroneNearMiss(s, dr, d) {
      if (!dr || dr.key !== 'own') return;
      const S = this._sight;
      if (!S || !S.arty) return;
      const SE = window.soundEngine;
      if (SE && SE.playFlyby) SE.playFlyby(s.ammoType === 'SCOUT_BULLET' ? 'mg' : 'cannon30', d, { x: s.x, z: s.z });
      S.jolt = Math.max(S.jolt || 0, 0.18 * (1 - d / C.NEAR_R) + 0.05);
      S.underFire = 2.2;
    },

    /**
     * Sóng nổ / mảnh văng của một vụ nổ (x, y, z) lên mọi drone đang bay trong bán kính (mọi phe, cả drone của chính
     * người bắn): sát thương theo khoảng cách 3D, trọn vẹn trong vùng lõi, giảm dần tới mép. Drone thân nhựa / sợi
     * carbon nhẹ: lựu pháo / đạn tăng nổ gần là rơi, đạn 30 mm nổ sát mới sứt
     */
    blastDrones(s, x, y, z, radius, core) {
      const list = this._airList;
      if (!list || !list.length || !(radius > 0)) return;
      const shooter = this.unitById(s.shooterId);
      const NS = this.netSync && !this.netSync.detached ? this.netSync : null;
      const auth = !s.netRemote && (!NS || (shooter && NS.owns(shooter)));
      const a = s.ammoType;
      const base = s.isHeavyArty ? 1.6 : a === 'HE' ? 1.3 : a === 'NORMAL' || a === 'CLUSTER' ? 1.1 : a === 'RPG' || a === 'ANTI_TANK_MISSILE' ? 1.0
        : a === 'CLUSTER_SUBMUNITION' ? 0.6 : a === 'GATLING_BULLET' || a === 'INCENDIARY' ? 0.12 : a === 'AP' ? 0.1 : 0;
      if (!base) return;
      // drone lơ lửng trên không: sức ép lan tự do hơn mặt đất -> bán kính ảnh hưởng ~1.2 lần
      const R = radius * 1.2;
      for (const dr of list) {
        const d = Math.hypot(dr.x - x, dr.y + C.CENTER_Y - y, dr.z - z);
        if (d > R) continue;
        const dmg = Math.round(base * Math.min(1, (core || R * 0.3) / Math.max(1, d)) * (1 - Math.pow(d / R, 2)) * 1000) / 1000;
        if (dmg < 0.01) continue;
        if (dr.key === 'own') {
          if (auth) this.damageOwnDrone(dmg, shooter);
          else this.droneHitFX(true);
        } else if (auth && dr.net && shooter) {
          dr.pend = (dr.pend || 0) + dmg;
          dr.pendBy = shooter;
        }
      }
    },

    // gửi gộp các phát trúng drone của máy khác (~10 lần/giây) cho máy điều khiển drone đó
    flushDroneHits() {
      const M = this._otherDrones, NS = this.netSync;
      if (!M || !NS || NS.detached) return;
      const t = nowS();
      M.forEach(R => {
        if (!(R.pend > 0) || t - (R.hitSentAt || 0) < 0.1) return;
        R.hitSentAt = t;
        NS.net.send('DRONE_HIT', { o: R.unit.netId, a: R.pendBy && R.pendBy.netId !== undefined ? R.pendBy.netId : -1, d: Math.round(R.pend * 1000) });
        R.pend = 0;
      });
    },

    // ---------- DRONE TRÊN BẢN ĐỒ NHỎ / BẢN ĐỒ CHIẾN THUẬT ----------
    // Drone phe mình luôn hiện (xanh); drone địch chỉ hiện khi phe mình đang thấy (đỏ) — radar mặt đất không bắt drone,
    // radar phòng không xe 6 nòng (AA_RADAR_R) và radar trinh sát (SCOUT_AIR_R, ngắn hơn).
    // Ký hiệu: dấu X 4 cánh quạt trong vòng tròn + vạch hướng bay; drone đang bị mình khóa: vòng khóa vàng;
    // bản đồ lớn có nhãn UAV + độ cao
    drawDronesOnMap(ctx, toScreen, big) {
      const P = this.player;
      if (!P) return;
      const t = performance.now() / 1000, A = this._airAim;
      // Xe 6 nòng / trinh sát: vòng nét đứt = vùng radar bắt drone, vạch quét quay theo ăng-ten
      const RR = this.airRadarR(P);
      if (RR) {
        const c = toScreen(P.x, P.z), e = toScreen(P.x + RR, P.z), rr = Math.abs(e.x - c.x);
        if (rr > 4) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,190,90,0.45)'; ctx.lineWidth = big ? 1.4 : 1;
          ctx.setLineDash(big ? [6, 5] : [3, 3]);
          ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          const a = t * Math.PI * 2;
          ctx.strokeStyle = 'rgba(255,190,90,0.3)';
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(a) * rr, c.y - Math.cos(a) * rr); ctx.stroke();
          ctx.restore();
        }
      }
      for (const dr of this.airDroneList()) {
        const ally = dr.team === P.team;
        if (!ally && !dr.seen) continue;
        const s = toScreen(dr.x, dr.z), r = big ? 7 : 4.2;
        const col = ally ? '#5fb0dc' : '#ff6a5c';
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.strokeStyle = col; ctx.fillStyle = ally ? 'rgba(95,176,220,0.25)' : 'rgba(255,106,92,0.25)'; ctx.lineWidth = big ? 1.6 : 1.1;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // 4 cánh quạt
        ctx.lineWidth = big ? 1.3 : 0.9;
        const k = r * 0.62;
        ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke();
        for (const [ax, ay] of [[-k, -k], [k, -k], [-k, k], [k, k]]) { ctx.beginPath(); ctx.arc(ax, ay, r * 0.28, 0, Math.PI * 2); ctx.stroke(); }
        // vạch hướng bay (theo vận tốc)
        const sp = Math.hypot(dr.wvx || 0, dr.wvz || 0);
        if (sp > 20) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo((dr.wvx / sp) * r * 2.2, (dr.wvz / sp) * r * 2.2); ctx.stroke(); }
        if (A && A.dr === dr) {
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(0, 0, r + 3 + Math.sin(t * 6), 0, Math.PI * 2); ctx.stroke();
        }
        if (big) {
          ctx.fillStyle = ally ? 'rgba(160,225,245,0.95)' : 'rgba(255,150,150,0.95)';
          ctx.font = '10px Share Tech Mono, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const gy = this.terrain ? this.terrain.getElevationAt(dr.x, dr.z) : 0;
          ctx.fillText('UAV · CAO ' + Math.round(Math.max(0, dr.y - gy)) + 'M', r + 4, 0);   // cùng đơn vị với HUD drone
        }
        ctx.restore();
      }
    },

    // ---------- TRẠM SÚNG MÁY PHÒNG KHÔNG TRÊN NÓC THÁP XE TĂNG ----------
    /** Thông số đường đạn dùng để ngắm mục tiêu trên không. 'MG762': súng 7.62mm trạm xe tăng (suy từ đạn 12.7mm) */
    aaRound(u, ammo) {
      const B = this.ballistics;
      if (ammo === 'AGL40') {
        // quả lựu 40mm: bắn ra như đạn 30mm rồi giảm tốc (fireRoofAGL) -> cùng hệ số khi ngắm / tính đường đạn
        const r = Object.assign({}, B.roundParams('GATLING_BULLET', u));
        r.v0 *= C.ROOF.agl.v;
        return r;
      }
      if (ammo !== 'MG762') return B.roundParams(ammo, u);
      const r = Object.assign({}, B.roundParams('SCOUT_BULLET', u)), R = C.RCWS;
      r.v0 *= R.v; r.k *= R.k; r.maxTravel = (r.maxTravel || 900) * R.travel;
      return r;
    },

    /** Thông số vũ khí đang gắn trên bệ nóc tháp của xe (súng máy / phóng lựu / rocket) */
    roofCfg(u) { return roofCfg(u); },

    /** Miệng nòng dùng để bắn mục tiêu trên không: trạm súng máy (xe tăng) hoặc nòng chính (xe 6 nòng / trinh sát) */
    aaMuzzle(u) {
      if (u.rcwsGun && u.rcwsMuzzleLocal) {
        u.rcwsGun.updateWorldMatrix(true, false);
        const M = u.rcwsGun.matrixWorld;
        const pos = u.rcwsMuzzleLocal.clone().applyMatrix4(M);
        const dir = new THREE.Vector3(0, 0, -1).transformDirection(M);
        return { position: pos, direction: dir };
      }
      if (u.getMuzzleWorldTransform) return u.getMuzzleWorldTransform();
      return { position: new THREE.Vector3(u.x, (u.y || 0) + 20, u.z), direction: new THREE.Vector3(0, 0, -1) };
    },

    // Mỗi khung hình, mọi xe tăng: trạm súng quay / ngóc về hướng lệnh u._aa { az, el, firing } (người chơi, bot, hoặc
    // gói mạng của xe máy khác), không có lệnh thì về vị trí nghỉ; bắn ~8 phát/giây, hộp 100 viên, thay hộp 6 s
    updateRCWS(dt) {
      if (!(dt > 0) || !this.ballistics) return;
      const now = performance.now() / 1000, D2R = Math.PI / 180;
      for (const u of this.units) {
        if (!u.rcwsTurret || !u.rcwsGun) continue;   // xe nào có trạm vũ khí trên chân đế mô-đun (roof_mounts.js)
        const R = roofCfg(u);
        let A = u._aa;
        if (A && (A.until || 0) < now) A = u._aa = null;
        const S = u._rcws || (u._rcws = { yaw: 0, pitch: 0, mag: R.mag, reload: 0, t: R.rof });
        if (u.isDead) {
          u.isFiringAAmg = false;
          if (u === this.player && window.soundEngine && window.soundEngine.updateRCWSServo) window.soundEngine.updateRCWSServo(0);
          continue;
        }
        let wy = 0, wp = 0;
        if (A) {
          // hướng lệnh (thế giới) đổi sang khung tọa độ của tháp pháo (kể cả thân xe nghiêng trên dốc) -> góc quay / ngóc
          const par = u.rcwsTurret.parent, az = A.az * D2R, e = Math.max(R.elMin, Math.min(R.elMax, A.el)) * D2R;
          const v = this._rcwsV || (this._rcwsV = new THREE.Vector3()), q = this._rcwsQ || (this._rcwsQ = new THREE.Quaternion());
          v.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
          if (par) { par.updateWorldMatrix(true, false); par.getWorldQuaternion(q); v.applyQuaternion(q.invert()); }
          wy = Math.atan2(-v.x, -v.z);
          wp = Math.atan2(v.y, Math.hypot(v.x, v.z));
        }
        // đang nạp (thay hộp dây đạn / nạp lại giàn rocket): kíp xe ngóc trạm lên để thao tác, không bám mục tiêu
        if (S.reload > 0 && u.roofWeapon && u.roofWeapon !== 'rcws') wp = Math.min(R.elMax, 14) * D2R;
        const dy = wrapPi(wy - S.yaw), sy = R.yawRate * dt;
        const y0 = S.yaw, p0 = S.pitch;
        S.yaw = wrapPi(S.yaw + Math.max(-sy, Math.min(sy, dy)));
        S.pitch += Math.max(-R.pitchRate * dt, Math.min(R.pitchRate * dt, Math.max(R.elMin * D2R, Math.min(R.elMax * D2R, wp)) - S.pitch));
        // tiếng mô-tơ servo trạm súng của xe mình (theo tốc độ quay / ngóc)
        if (u === this.player && window.soundEngine && window.soundEngine.updateRCWSServo) {
          window.soundEngine.updateRCWSServo(Math.abs(wrapPi(S.yaw - y0)) / (R.yawRate * dt) * 0.7 + Math.abs(S.pitch - p0) / (R.pitchRate * dt) * 0.5);
        }
        u.rcwsTurret.rotation.y = S.yaw;
        u.rcwsGun.rotation.x = S.pitch;
        if (S.reload > 0) {
          const prev = S.reload;
          S.reload -= dt;
          // thay hộp đạn: tiếng lắp hộp mới + dây đạn + kéo khóa lên đạn canh rơi đúng lúc thay xong
          if (u === this.player && prev > 1.3 && S.reload <= 1.3 && window.soundEngine && window.soundEngine.playReloadPhase) window.soundEngine.playReloadPhase('MG762', 'magIn', S.reload);
          if (S.reload <= 0) S.mag = R.mag;
        }
        // giàn rocket: đầu đạn trong miệng ống hiện theo số quả còn lại; đang nạp thì hiện dần từng quả (kíp xe nhét đạn)
        if (u.roofRounds) {
          const n = u.roofRounds.length;
          const vis = S.reload > 0 ? Math.floor((1 - S.reload / R.reload) * n) : S.mag;
          if (S.reload > 0 && vis > (S._rv || 0) && u === this.player && window.soundEngine && window.soundEngine.playReloadPhase) window.soundEngine.playReloadPhase('MG762', 'magIn', 0.2);
          S._rv = S.reload > 0 ? vis : 0;
          for (let i = 0; i < n; i++) u.roofRounds[i].visible = i >= n - vis;
        }
        const firing = !!(A && A.firing) && S.reload <= 0;
        u.isFiringAAmg = firing;
        if (!firing) { S.t = R.rof; continue; }
        S.t += dt;
        while (S.t >= R.rof && S.mag > 0) {
          S.t -= R.rof;
          this.fireRCWS(u);
          if (--S.mag <= 0) {
            S.reload = R.reload;
            if (u === this.player) {
              this.addCombatLog(R === C.RCWS ? '[[hourglass]] Súng máy phòng không 7.62mm hết dây đạn — đang thay hộp (5 s)'
                : `[[hourglass]] ${R.name} hết đạn — đang nạp lại (${R.reload} s)`, 'alert');
              if (window.soundEngine && window.soundEngine.playReloadPhase) window.soundEngine.playReloadPhase('MG762', 'magOut');   // mở nắp tháp, tháo hộp rỗng (súng 7.62 có tiếng riêng)
            }
          }
        }
      }
    },

    fireRCWS(u) {
      // trạm vũ khí nóc tháp bị bắn văng
      if (u.dmg && u.dmg.lost && u.dmg.lost.has(u._roofTag || 'rcws')) { u.mgActive = false; return null; }
      if (u.roofWeapon === 'agl') return this.fireRoofAGL(u);
      if (u.roofWeapon === 'rocket') return this.fireRoofRocket(u);
      const m = this.aaMuzzle(u), d = m.direction;
      const az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      let shell = null;
      u._launchOverride = { position: m.position, direction: d };
      try { shell = this.ballistics.fireShell3D(u, az, el, 1, 'SCOUT_BULLET'); } finally { u._launchOverride = null; }
      if (shell) {
        // đạn 7.62mm: chậm hơn chút, cản lớn hơn hẳn (rơi nhanh), tầm ngắn hơn ~1/3 so với 12.7mm
        const rp = this.aaRound(u, 'MG762'), f = C.RCWS.v;
        shell.vx *= f; shell.vy *= f; shell.vz *= f;
        // bệ súng nhẹ trên nóc tháp rung theo từng phát: lệch thêm ngẫu nhiên quanh hướng nòng (phân bố chuẩn)
        const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
        const sp = Math.hypot(shell.vx, shell.vy, shell.vz), ax = Math.atan2(shell.vx, -shell.vz) + g() * C.RCWS.spread;
        const ae = Math.asin(Math.max(-1, Math.min(1, shell.vy / sp))) + g() * C.RCWS.spread;
        shell.vx = Math.sin(ax) * Math.cos(ae) * sp; shell.vy = Math.sin(ae) * sp; shell.vz = -Math.cos(ax) * Math.cos(ae) * sp;
        shell.k = rp.k; shell.dragMul = rp.k / (this.ballistics.dragCoeff || 1); shell.maxTravel = rp.maxTravel;
        shell.isGatling = true; shell.aaMG = true; shell.damage = C.RCWS.dmgVehicle;
      }
      const SE = window.soundEngine, P = this.player;
      if (SE && SE.playGatlingShot && P) {
        if (u === P) SE.playGatlingShot('MG762', 0, null, null, { inside: true, interval: C.RCWS.rof });
        else {
          const L = this.audioListener() || P, dd = Math.hypot(u.x - L.x, u.z - L.z);
          if (dd < 1200) SE.playGatlingShot('MG762', Math.max(1, dd), { x: u.x, z: u.z }, u.id);
        }
      }
    },

    // Lệch ngẫu nhiên quanh hướng bay (phân bố chuẩn, rad) — bệ nhẹ trên nóc tháp rung theo từng phát
    roofScatter(shell, spread) {
      const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
      const sp = Math.hypot(shell.vx, shell.vy, shell.vz);
      const ax = Math.atan2(shell.vx, -shell.vz) + g() * spread, ae = Math.asin(Math.max(-1, Math.min(1, shell.vy / sp))) + g() * spread;
      shell.vx = Math.sin(ax) * Math.cos(ae) * sp; shell.vy = Math.sin(ae) * sp; shell.vz = -Math.cos(ax) * Math.cos(ae) * sp;
    },

    // Súng phóng lựu 40mm: quả lựu bắn ra theo hệ đạn 30mm rồi giảm tốc (bay cầu vồng thấp, chậm), sát thương / vùng nổ
    // riêng (handleShellImpact đọc shell.roofDirect / roofSplash / roofBlast). Đạn mỗi máy tự mô phỏng theo cò đồng bộ
    // AA_MG như súng máy; sát thương do máy có chủ quyền với xe bắn quyết định
    fireRoofAGL(u) {
      const R = C.ROOF.agl, m = this.aaMuzzle(u), d = m.direction;
      const az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      let shell = null;
      u._launchOverride = { position: m.position, direction: d };
      try { shell = this.ballistics.fireShell3D(u, az, el, 1, 'GATLING_BULLET'); } finally { u._launchOverride = null; }
      if (shell) {
        shell.vx *= R.v; shell.vy *= R.v; shell.vz *= R.v;
        this.roofScatter(shell, R.spread);
        shell.isGatling = false; shell.gl40 = true;
        shell.roofDirect = R.direct; shell.roofSplash = R.splash; shell.roofBlast = R.blast;
      }
      const SE = window.soundEngine, P = this.player;
      if (SE && SE.playGrenadeLauncher && P) {   // module_weapons.js: "bụp" liều phóng + khóa nòng nặng
        if (u === P) SE.playGrenadeLauncher(0, null, u.id);
        else {
          const L = this.audioListener() || P, dd = Math.hypot(u.x - L.x, u.z - L.z);
          if (dd < 1400) SE.playGrenadeLauncher(Math.max(1, dd), { x: u.x, z: u.z }, u.id);
        }
      } else if (SE && SE.playGatlingShot && P) {
        if (u === P) SE.playGatlingShot('SCOUT', 0, null, null, { inside: true, interval: R.rof });
        else {
          const L = this.audioListener() || P, dd = Math.hypot(u.x - L.x, u.z - L.z);
          if (dd < 1400) SE.playGatlingShot('SCOUT', Math.max(1, dd), { x: u.x, z: u.z }, u.id);
        }
      }
      return shell;
    },

    // Giàn rocket: phóng lần lượt từng ống (u.roofMuzzles), đạn nổ lõm không điều khiển như RPG
    fireRoofRocket(u) {
      const R = C.ROOF.rocket, S = u._rcws;
      const k = S && u.roofMuzzles ? Math.max(0, Math.min(u.roofMuzzles.length - 1, R.mag - S.mag)) : -1;
      u.rcwsGun.updateWorldMatrix(true, false);
      const M = u.rcwsGun.matrixWorld;
      const pos = (k >= 0 ? u.roofMuzzles[k] : u.rcwsMuzzleLocal).clone().applyMatrix4(M);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(M);
      const az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      let shell = null;
      u._launchOverride = { position: pos, direction: d };
      try { shell = this.ballistics.fireShell3D(u, az, el, 1, 'RPG'); } finally { u._launchOverride = null; }
      if (shell) this.roofScatter(shell, R.spread);
      const SE = window.soundEngine, P = this.player;
      if (SE && SE.playRocketLaunch && P) {
        const L = u === P ? null : (this.audioListener() || P);
        const dd = L ? Math.hypot(u.x - L.x, u.z - L.z) : 0;
        if (dd < 2000) SE.playRocketLaunch(dd, L ? { x: u.x, z: u.z } : null);
      }
      return shell;
    },

    // xe tăng mình điều khiển (người chơi, bot) đang dùng trạm súng phòng không: báo hướng súng + cò cho máy khác
    // (thấy súng quay, thấy đạn vạch đường bay lên) ~6 lần/giây; thôi thì báo một lần để máy khác thu súng về
    sendAAmg(dt) {
      const NS = this.netSync;
      if (!NS || NS.detached) return;
      if ((this._aaSendT = (this._aaSendT || 0) - dt) > 0) return;
      this._aaSendT = 0.15;
      for (const u of this.units) {
        if (!u.rcwsGun || u.netId === undefined || !(u === this.player || (u.botAI && !u._netProxy))) continue;
        const A = u._aa;
        if (A) { NS.net.send('AA_MG', { i: u.netId, a: Math.round(A.az * 10), e: Math.round(A.el * 10), f: A.firing ? 1 : 0 }); u._aaSent = true; }
        else if (u._aaSent) { NS.net.send('AA_MG', { i: u.netId, x: 1 }); u._aaSent = false; }
      }
    },

    onNetAAmg(d, from, NS) {
      if (!d) return;
      const u = NS.byNetId[d.i];
      if (!u || u === this.player || NS.owns(u) || NS.ownerOf(u) !== from || !u.rcwsGun) return;
      u._aa = d.x ? null : { az: (d.a || 0) / 10, el: (d.e || 0) / 10, firing: !!d.f, until: performance.now() / 1000 + 0.6 };
    },

    // ---------- BỊ KHÓA MỤC TIÊU ----------
    // Máy nào điều khiển xe đang khóa / đang bắn drone của máy khác (người chơi khóa drone, bot đang bám drone) thì báo
    // cho máy chủ drone ~2 lần/giây: DRONE_LOCK { o: xe pháo chủ drone, a: xe khóa, f: 1 = đang xả đạn }
    sendDroneLocks(dt) {
      const NS = this.netSync;
      if (!NS || NS.detached) return;
      if ((this._lockSendT = (this._lockSendT || 0) - dt) > 0) return;
      this._lockSendT = 0.5;
      const P = this.player, A = this._airAim;
      const send = (dr, u) => {
        if (!dr || !dr.net || !dr.unit || dr.unit.netId === undefined || u.netId === undefined) return;
        NS.net.send('DRONE_LOCK', { o: dr.unit.netId, a: u.netId, f: u.isFiringGatling || u.isFiringAAmg ? 1 : 0 });
      };
      if (A && A.kind === 'drone' && P && !P.isDead) send(A.dr, P);
      for (const u of this.units) {
        if (u === P || u.isDead || !u.botAI || !u.botAI.aa || u._netProxy) continue;
        send(u.botAI.aa.d, u);
      }
    },

    onNetDroneLock(d, from, NS) {
      if (!d || !this.player) return;
      if (NS.byNetId[d.o] !== this.player) return;
      const a = NS.byNetId[d.a];
      if (!a || a.team === this.player.team || NS.ownerOf(a) !== from) return;
      const L = this._droneLocks || (this._droneLocks = new Map());
      L.set(a, { until: performance.now() / 1000 + 1.6, firing: !!d.f });
    },

    /** Drone mình đang bị khóa / bị bắn: báo động trạm điều khiển, chữ cảnh báo + nhãn xe đang khóa trên màn hình drone */
    updateDroneThreat(dt) {
      const P = this.player, D = this._drone, SE = window.soundEngine, now = performance.now() / 1000;
      const L = this._droneLocks || (this._droneLocks = new Map());
      const T = this._droneThreat || (this._droneThreat = { beep: 0, was: false, top: null, firing: false });
      // bot do máy mình điều khiển đang bám drone mình (chơi đơn / chủ phòng)
      if (D && D.unit === P) for (const u of this.units) {
        if (!u.isDead && u.botAI && !u._netProxy && u.botAI.aa && u.botAI.aa.d === D) L.set(u, { until: now + 0.3, firing: !!(u.isFiringGatling || u.isFiringAAmg) });
      }
      let top = null, best = Infinity, firing = false;
      const up = D && D.unit === P && !P.isDead && airborne(D.state);
      L.forEach((v, u) => {
        if (v.until < now || u.isDead || !up) { L.delete(u); return; }
        const d = Math.hypot(u.x - D.x, u.z - D.z);
        if (v.firing) firing = true;
        if (d < best) { best = d; top = u; }
      });
      T.top = top;
      T.firing = firing;
      const on = !!top, viewing = this._sight && this._sight.arty;
      if (on && !T.was) {
        this.addCombatLog(`[[target-arrow]] DRONE BỊ PHÒNG KHÔNG ĐỊCH KHÓA MỤC TIÊU (${top.name}) — đổi hướng, hạ thấp hoặc bay khuất sau địa hình`, 'alert');
        T.beep = 0;
      }
      if (on && firing && !T.wasFiring) this.addCombatLog('[[alert-triangle]] PHÒNG KHÔNG ĐỊCH ĐANG XẢ ĐẠN VÀO DRONE!', 'alert');
      T.was = on;
      T.wasFiring = on && firing;
      if (on && SE && SE.playDroneLockAlarm && (T.beep -= dt) <= 0) {
        T.beep = firing ? 0.28 : 0.95;
        SE.playDroneLockAlarm(firing ? 'fire' : 'lock', viewing ? 1 : 0.5);
      }
      const U = this._uavEl;
      if (U && U.lock) {
        const txt = !on ? '' : firing ? '⚠ PHÒNG KHÔNG ĐANG BẮN — NÉ NGAY' : '⚠ BỊ KHÓA MỤC TIÊU';
        if (U.lock.textContent !== txt) U.lock.textContent = txt;
        if (U.lock.hidden === !!txt) U.lock.hidden = !txt;
        U.lock.classList.toggle('fire', firing);
      }
    },

    // ---------- DRONE CỦA MÌNH BỊ BẮN ----------
    damageOwnDrone(dmg, attacker) {
      const D = this.droneState();
      if (!airborne(D.state)) return;
      D.hp = Math.max(0, (D.hp === undefined ? 1 : D.hp) - dmg);
      this.droneHitFX(true);
      if (D.hp <= 0) { this.destroyOwnDrone(attacker); return; }
      const t = nowS();
      if (!(this._sight && this._sight.arty) && t - (this._droneHitLogAt || 0) > 2.5) {
        this._droneHitLogAt = t;
        this.addCombatLog(`[[alert-triangle]] DRONE TRINH SÁT ĐANG BỊ BẮN! Thân drone còn ${Math.round(D.hp * 100)}%`, 'alert');
      }
    },

    /** Hình drone giật, nhiễu trắng chớp qua (trúng đạn) */
    droneHitFX(hard) {
      const S = this._sight, SE = window.soundEngine, t = nowS();
      if (t - (this._droneFxAt || 0) < 0.07) return;
      this._droneFxAt = t;
      if (SE && SE.playDroneHit) SE.playDroneHit(!!(S && S.arty));
      if (!S || !S.arty) return;
      S.glitch = Math.max(S.glitch || 0, hard ? 0.42 : 0.2);
      S.underFire = 2.5;
      S.jolt = Math.max(S.jolt || 0, 0.35);
      const st = this._uavEl && this._uavEl.stat;
      if (st) { st.style.animation = 'none'; void st.offsetWidth; st.style.animation = ''; }
    },

    /** Drone mình bị bắn hạ (attacker) hoặc rơi vì xe mình bị hạ (attacker = null, why = 'link') */
    destroyOwnDrone(attacker, why) {
      const P = this.player, D = this.droneState();
      if (D.state === 'lost') return;
      const wasUp = airborne(D.state);
      D.state = 'lost'; D.hp = 0;
      if (wasUp) this.startDroneFall(P.team, D.x, D.y, D.z, D.wvx || 0, D.wvz || 0, D.yaw || 0, true);
      if (D.model) D.model.visible = false;
      const SE = window.soundEngine;
      if (why !== 'link') {
        if (SE && SE.playDroneLost) SE.playDroneLost();
        if (SE && SE.updateDrone) SE.updateDrone(false);
        const by = !attacker ? 'ĐỊCH' : attacker === P ? 'CHÍNH ĐẠN CỦA BẠN' : attacker.team === P.team ? `${attacker.name} (ĐỒNG ĐỘI BẮN NHẦM)` : attacker.name;
        this.addCombatLog(`[[alert-triangle]] DRONE TRINH SÁT ĐÃ BỊ ${by} BẮN HẠ — mất mắt ngắm cầu vồng, chỉ còn bắn thẳng tự vệ. Hồi sinh để nhận drone mới`, 'alert');
        const S = this._sight;
        if (S && S.arty) S.dying = { t: 0, x: D.x, y: D.y, z: D.z, yaw: D.yaw || 0 };
        // mất mắt: bỏ điểm ngắm / mục tiêu ở ngoài tầm bắn thẳng
        const AD = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT : { max: 800 };
        const far = (x, z) => Math.hypot(x - P.x, z - P.z) > AD.max;
        if (this._aimPoint && far(this._aimPoint.x, this._aimPoint.z)) { this._aimPoint = null; this._lockTrack = null; }
        if (this.lockedTarget && far(this.lockedTarget.x, this.lockedTarget.z)) this.setLockedTarget(null);
      }
      const NS = this.netSync;
      if (NS && !NS.detached && P.netId !== undefined) {
        NS.net.send('DRONE_DOWN', { o: P.netId, a: attacker && attacker.netId !== undefined ? attacker.netId : -1,
          p: [Math.round(D.x * 10), Math.round(D.y * 10), Math.round(D.z * 10)], v: [Math.round((D.wvx || 0) * 10), Math.round((D.wvz || 0) * 10)], up: wasUp ? 1 : 0 });
        this._droneSendAcc = 99;   // gửi ngay trạng thái mất drone
      }
    },

    /** Pháo mất drone: không ngắm cầu vồng / khóa mục tiêu ngoài tầm bắn thẳng. true = chặn (đã báo) */
    artyAimBlocked(x, z) {
      const P = this.player;
      if (!P || P.tankType !== 'ARTILLERY' || !this._drone || this._drone.unit !== P || this._drone.state !== 'lost') return false;
      const AD = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT : { max: 800 };
      if (Math.hypot(x - P.x, z - P.z) <= AD.max) return false;
      const t = nowS();
      if (t - (this._blindLogAt || 0) > 1.5) {
        this._blindLogAt = t;
        this.addCombatLog(`[[eye-off]] MẤT DRONE — không còn mắt ngắm cầu vồng. Chỉ bắn thẳng được địch trong ${AD.max}M; hồi sinh để có drone mới`, 'alert');
      }
      return true;
    },

    // ---------- DRONE BỊ BẮN HỎNG KHI ĐANG BAY: thân dưới 60% bốc khói, dưới 35% bắt lửa (máy khác thấy theo máu
    // drone trong gói mạng). Drone mình khi đang xem qua camera của nó: không vẽ (camera nằm trong drone) ----------
    updateDroneDamageFX(dt, list) {
      const FL = this._droneFlames || (this._droneFlames = new Map());
      const viewing = this._sight && this._sight.arty, t = performance.now() / 1000;
      const seen = this._dmgSeen || (this._dmgSeen = new Set());
      seen.clear();
      for (const dr of list) {
        const hp = dr.hp === undefined ? 1 : dr.hp;
        if (hp >= 0.6 || (dr.key === 'own' && viewing) || (dr.key !== 'own' && !dr.seen)) continue;
        seen.add(dr.key);
        const yaw = dr.yaw || 0, ox = Math.sin(yaw) * 1.2, oz = Math.cos(yaw) * 1.2;   // đuôi drone (khoang pin)
        dr._puff = (dr._puff || 0) - dt;
        if (dr._puff <= 0) { dr._puff = hp < 0.35 ? 0.06 : 0.12; this.droneSmokePuff(dr.x + ox, dr.y + 2, dr.z + oz, hp < 0.35 ? 0.9 : 0.55); }
        if (hp < 0.35 && typeof ReconDrone !== 'undefined' && ReconDrone.buildFlame) {
          let f = FL.get(dr.key);
          if (!f) { f = ReconDrone.buildFlame(); this.scene.add(f); FL.set(dr.key, f); }
          f.position.set(dr.x + ox, dr.y + 1.9, dr.z + oz);
          ReconDrone.animateFlame(f, t, 0.75);
        }
      }
      FL.forEach((f, k) => { if (!seen.has(k)) f.visible = false; });
    },

    // ---------- DRONE BỊ BẮN NỔ: pin bùng cháy, vỡ tung mảnh (cánh quạt, tay đòn, mô-tơ, pin, vỏ), thân rơi xoay vừa
    // cháy vừa kéo khói, chạm đất thì cháy âm ỉ rồi chỉ còn khói ----------
    startDroneFall(team, x, y, z, vx, vz, yaw, own) {
      if (typeof ReconDrone === 'undefined') return;
      const m = ReconDrone.build(team);
      m.position.set(x, y, z);
      m.rotation.set(0, yaw, 0);
      this.scene.add(m);
      // 2 cánh quạt bị bắn văng khỏi xác (bay ra thành mảnh vỡ)
      const rot = m.userData.rotors || [];
      const lostRotors = [Math.floor(Math.random() * 4)];
      lostRotors.push((lostRotors[0] + 1 + Math.floor(Math.random() * 3)) % 4);
      const flames = [];
      if (ReconDrone.buildFlame) for (let i = 0; i < 2; i++) { const fl = ReconDrone.buildFlame(); this.scene.add(fl); flames.push(fl); }
      const F = this._droneFalls || (this._droneFalls = []);
      F.push({ m, x, y, z, vx: vx * 0.6, vy: 20, vz: vz * 0.6, spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4), tumble: 1.5 + Math.random() * 2, t: 0, puff: 0, own, ground: false, gT: 0, flames });
      // mảnh vỡ văng tung tóe
      const kinds = ['prop', 'prop', 'arm', 'motor', 'battery', 'plate', 'shard', 'shard', 'shard', 'skid'];
      kinds.forEach((kind, i) => {
        let px = x, pz = z;
        if (kind === 'prop' && rot[lostRotors[i]]) {
          const h = rot[lostRotors[i]].hub;
          h.visible = false;
          const c = Math.cos(yaw), sn = Math.sin(yaw);
          px = x + h.position.x * c + h.position.z * sn; pz = z - h.position.x * sn + h.position.z * c;
        }
        this.spawnDroneDebris(kind, px, y + C.CENTER_Y, pz, vx, vz, kind === 'battery');
      });
      const fx = this.ballistics && this.ballistics.fx;
      try {
        if (fx && fx.spawn) {
          fx.spawn(x, y + C.CENTER_Y, z, 'INCENDIARY', 'AIR', {});            // pin lithium bùng cháy
          fx.spawn(x, y + C.CENTER_Y, z, 'CLUSTER_SUBMUNITION', 'AIR', {});   // tia lửa + mảnh văng
        }
      } catch (e) { /* hiệu ứng phụ */ }
      const P = this.player, SE = window.soundEngine;
      if (P && SE && SE.playExplosionAtDistance && !(own && this._sight && this._sight.arty)) {
        SE.playExplosionAtDistance(Math.hypot(P.x - x, (P.y || 0) - y, P.z - z), 'AIRBURST', 'CLUSTER_SUBMUNITION', { x, z });
      }
    },

    updateDroneFalls(dt) {
      const F = this._droneFalls || (this._droneFalls = []);
      const T = this.terrain, G = 78, fx = this.ballistics && this.ballistics.fx;
      for (let i = F.length - 1; i >= 0; i--) {
        const f = F[i], m = f.m;
        f.t += dt;
        if (!f.ground) {
          f.vy -= G * dt;
          f.vx *= 1 - dt * 0.4; f.vz *= 1 - dt * 0.4;
          f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
          m.position.set(f.x, f.y, f.z);
          m.rotation.y += f.spin * dt;
          m.rotation.x += f.tumble * dt * 0.6;
          m.rotation.z += f.tumble * dt;
          ReconDrone.animate(m, dt, Math.max(0, 0.6 - f.t * 0.4));
          // vệt khói đen kéo theo, lửa bốc ngược lên khi rơi
          if ((f.puff -= dt) <= 0) { f.puff = 0.04; this.droneSmokePuff(f.x, f.y + 2, f.z, 1.1); }
          this.placeFallFlames(f, 1.0);
          const gy = T ? T.getElevationAt(f.x, f.z) : 0;
          if (f.y <= gy) {
            f.ground = true;
            f.y = gy; m.position.y = gy + 0.5;
            m.rotation.set(0.35, m.rotation.y, 1.2);
            ReconDrone.animate(m, 1, 0);
            m.traverse(o => { if (o.isMesh && o.material && o.material.color && !o.material.transparent) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); o.userData.ownMat = true; } });
            try { if (fx && fx.spawn) fx.spawn(f.x, gy + 1, f.z, 'GATLING_BULLET', 'GROUND', {}); } catch (e) { /* hiệu ứng phụ */ }
            const P = this.player, SE = window.soundEngine;
            if (P && SE && SE.playExplosionAtDistance) SE.playExplosionAtDistance(Math.hypot(P.x - f.x, P.z - f.z), 'GROUND', 'GATLING_BULLET', { x: f.x, z: f.z });
          }
        } else {
          f.gT += dt;
          // xác cháy âm ỉ ~8 s (lửa nhỏ dần), khói bốc tới ~12 s
          this.placeFallFlames(f, f.gT < 6 ? 1.1 : Math.max(0, 1.1 * (1 - (f.gT - 6) / 3)));
          if (f.gT < 12 && (f.puff -= dt) <= 0) { f.puff = f.gT < 8 ? 0.15 : 0.35; this.droneSmokePuff(f.x, f.y + 2, f.z, 0.8); }
          if (f.gT > 15) {
            (f.flames || []).forEach(fl => this.scene.remove(fl));
            this.scene.remove(m);
            // hình khối dùng chung giữa các drone (recon_drone.js): chỉ hủy vật liệu cháy sém đã nhân bản riêng
            m.traverse(o => { if (o.isMesh && o.userData.ownMat) o.material.dispose(); });
            if (m.userData.discMat) m.userData.discMat.dispose();
            F.splice(i, 1);
            continue;
          }
        }
        // drone mình đang rơi khi màn hình drone còn mở: camera nằm trong drone -> ẩn mô hình
        m.visible = !(f.own && this._sight && this._sight.arty);
        if (!m.visible) (f.flames || []).forEach(fl => { fl.visible = false; });
      }
      this.updateDroneDebris(dt);
      this.updateDroneSmoke(dt);
    },

    // 2 ngọn lửa trên xác (khoang pin + thân), luôn bốc thẳng lên
    placeFallFlames(f, k) {
      const t = performance.now() / 1000;
      (f.flames || []).forEach((fl, i) => {
        fl.position.set(f.x + (i ? 0.8 : -0.5), f.y + (f.ground ? 0.6 : 1.6) + i * 0.3, f.z + (i ? -0.4 : 0.6));
        ReconDrone.animateFlame(fl, t + i * 3.7, k * (i ? 0.75 : 1));
      });
    },

    // mảnh vỡ: văng ra theo vận tốc drone + lực nổ, xoay lộn, rơi xuống nảy nhẹ rồi nằm im; pin vẫn cháy một lúc
    spawnDroneDebris(kind, x, y, z, vx, vz, burning) {
      if (!ReconDrone.buildDebris) return;
      const L = this._droneDebris || (this._droneDebris = []);
      if (L.length > 60) return;
      const m = ReconDrone.buildDebris(kind);
      m.position.set(x, y, z);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = 25 + Math.random() * 45;
      let flame = null;
      if (burning && ReconDrone.buildFlame) { flame = ReconDrone.buildFlame(); this.scene.add(flame); }
      L.push({ m, flame, x, y, z, vx: vx * 0.5 + Math.cos(a) * sp, vy: 15 + Math.random() * 35, vz: vz * 0.5 + Math.sin(a) * sp,
        rx: (Math.random() - 0.5) * 18, ry: (Math.random() - 0.5) * 18, rz: (Math.random() - 0.5) * 18, t: 0, rest: false, bounce: 0 });
    },

    updateDroneDebris(dt) {
      const L = this._droneDebris;
      if (!L || !L.length) return;
      const T = this.terrain, t = performance.now() / 1000;
      for (let i = L.length - 1; i >= 0; i--) {
        const d = L[i], m = d.m;
        d.t += dt;
        if (!d.rest) {
          d.vy -= 78 * dt;
          d.vx *= 1 - dt * 0.6; d.vz *= 1 - dt * 0.6;
          d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
          m.rotation.x += d.rx * dt; m.rotation.y += d.ry * dt; m.rotation.z += d.rz * dt;
          const gy = T ? T.getElevationAt(d.x, d.z) : 0;
          if (d.y <= gy + 0.15) {
            d.y = gy + 0.15;
            if (d.bounce < 2 && d.vy < -12) { d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; d.rx *= 0.5; d.rz *= 0.5; d.bounce++; }
            else { d.rest = true; m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI; m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI; }
          }
          m.position.set(d.x, d.y, d.z);
          if (d.t < 2.5 && Math.random() < dt * 12) this.droneSmokePuff(d.x, d.y, d.z, d.flame ? 0.6 : 0.3);
        }
        if (d.flame) { d.flame.position.set(d.x, d.y, d.z); ReconDrone.animateFlame(d.flame, t + i, d.t < 6 ? 0.6 : Math.max(0, 0.6 * (1 - (d.t - 6) / 2))); }
        if (d.t > 14) {
          this.scene.remove(m);
          if (d.flame) this.scene.remove(d.flame);
          L.splice(i, 1);
        }
      }
    },

    // khói: mảng khói mềm (sprite tròn mờ mép, luôn quay về camera) — đen đặc lúc mới nhả, loang rộng, nhạt dần, bốc lên
    droneSmokeTex() {
      if (this._droneSmokeTex || typeof document === 'undefined') return this._droneSmokeTex;
      const S = 64, cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const x = cv.getContext('2d'), gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.7)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, S, S);
      this._droneSmokeTex = new THREE.CanvasTexture(cv);
      return this._droneSmokeTex;
    },

    droneSmokePuff(x, y, z, k) {
      const L = this._droneSmoke || (this._droneSmoke = []);
      if (L.length > 160) return;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.droneSmokeTex(), color: 0x1e1c1a, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
      m.scale.setScalar(1.2 * k);
      m.material.rotation = Math.random() * 6.28;
      this.scene.add(m);
      L.push({ m, life: 1.8, max: 1.8, k, drift: (Math.random() - 0.5) * 2 });
    },

    updateDroneSmoke(dt) {
      const L = this._droneSmoke;
      if (!L) return;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.life -= dt;
        if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); L.splice(i, 1); continue; }
        const a = 1 - p.life / p.max;
        p.m.scale.setScalar((1.2 + a * 4.5) * p.k);
        p.m.position.y += dt * (5 - a * 2);
        p.m.position.x += p.drift * dt;
        // đen đặc -> xám nhạt dần rồi tan
        p.m.material.opacity = 0.7 * (1 - a) * (1 - a * 0.3);
        p.m.material.color.setHex(a < 0.3 ? 0x1e1c1a : 0x3a3734);
      }
    },

    // ---------- MẠNG ----------
    sendDroneState(dt) {
      const NS = this.netSync, P = this.player;
      if (!NS || NS.detached || !P || P.tankType !== 'ARTILLERY' || P.netId === undefined) return;
      const D = this.droneState();
      const code = Math.max(0, ST.indexOf(D.state));
      const up = airborne(D.state);
      this._droneSendAcc = (this._droneSendAcc || 0) + dt;
      if (this._droneSentCode === code && this._droneSendAcc < (up ? C.SEND_FLY : C.SEND_IDLE)) return;
      this._droneSendAcc = 0;
      this._droneSentCode = code;
      const m = { i: P.netId, s: code, h: Math.round(Math.max(0, D.hp === undefined ? 1 : D.hp) * 100) };
      if (up) { m.x = Math.round(D.x * 10); m.y = Math.round(D.y * 10); m.z = Math.round(D.z * 10); m.w = Math.round(wrapPi(D.yaw || 0) * 100); }
      NS.net.send('DRONE', m);
    },

    onNetDrone(d, from, NS) {
      if (!d) return;
      const u = NS.byNetId[d.i];
      if (!u || u === this.player || u.tankType !== 'ARTILLERY' || NS.ownerOf(u) !== from) return;
      const R = this.otherDrone(u);
      R.net = true;
      const prev = R.state, st = ST[d.s] || 'docked';
      R.hp = (d.h || 0) / 100;
      if (airborne(st) && typeof d.x === 'number') {
        const s = { t: nowS(), x: d.x / 10, y: d.y / 10, z: d.z / 10, w: (d.w || 0) / 100 };
        if (!airborne(prev)) { R.samples.length = 0; R.x = s.x; R.y = s.y; R.z = s.z; R.yaw = s.w; }
        R.samples.push(s);
        if (R.samples.length > 8) R.samples.shift();
      }
      // gói DRONE_DOWN bị mất: vẫn cho drone rơi từ chỗ cuối cùng
      if (st === 'lost' && airborne(prev) && !R.fell) { R.fell = true; this.startDroneFall(u.team, R.x, R.y, R.z, R.wvx || 0, R.wvz || 0, R.yaw || 0, false); }
      if (st !== 'lost') R.fell = false;
      R.state = st;
      if (st === 'lost' && R.model) R.model.visible = false;
    },

    onNetDroneHit(d, from, NS) {
      if (!d || !this.player) return;
      const o = NS.byNetId[d.o];
      if (o !== this.player) return;
      const a = typeof d.a === 'number' && d.a >= 0 ? NS.byNetId[d.a] : null;
      if (a && NS.ownerOf(a) !== from) return;
      // đồng đội bắn trúng drone mình: vẫn mất máu (không miễn nhiễm cùng phe)
      this.damageOwnDrone(Math.max(0, Math.min(1, (d.d || 0) / 1000)), a);
    },

    onNetDroneDown(d, from, NS) {
      if (!d) return;
      const u = NS.byNetId[d.o];
      if (!u || u === this.player || NS.ownerOf(u) !== from) return;
      const R = this.otherDrone(u);
      const a = typeof d.a === 'number' && d.a >= 0 ? NS.byNetId[d.a] : null;
      if (d.up && !R.fell && d.p) {
        R.fell = true;
        this.startDroneFall(u.team, d.p[0] / 10, d.p[1] / 10, d.p[2] / 10, (d.v ? d.v[0] : 0) / 10, (d.v ? d.v[1] : 0) / 10, R.yaw || 0, false);
      }
      R.state = 'lost';
      R.samples.length = 0;
      if (R.model) R.model.visible = false;
      if (this._airAim && this._airAim.dr === R) this._airAim = null;
      if (!a) return;
      const P = this.player;
      if (a === P) {
        this.addCombatLog(`[[target-arrow]] ĐÃ BẮN HẠ DRONE TRINH SÁT CỦA ${u.name}! Pháo địch mất mắt ngắm`, 'tip');
        if (window.soundEngine && window.soundEngine.playTargetLockSound) window.soundEngine.playTargetLockSound();
      } else if (P && (u.team === P.team || a.team === P.team)) {
        this.addCombatLog(`[[alert-triangle]] ${a.name} đã bắn hạ drone trinh sát của ${u.name}`, u.team === P.team ? 'alert' : 'tip');
      }
    },

    // ---------- TIẾNG CÁNH QUẠT DRONE KHÁC ----------
    updateDroneAmbient(list) {
      const SE = window.soundEngine, P = this.player;
      if (!SE || !SE.updateDroneAmbient) return;
      const near = this._ambList || (this._ambList = []);
      near.length = 0;
      const viewing = this._sight && this._sight.arty, L = this.audioListener();
      if (P && !P.isDead && L) {
        const py = viewing ? L.y : (P.y || 0) + 10;
        for (const dr of list) {
          if (dr.key === 'own' && (dr.state === 'launching' || viewing)) continue;   // cất cánh / camera trên drone: đã có tiếng riêng
          const dx = dr.x - L.x, dy = dr.y - py, dz = dr.z - L.z, d = Math.hypot(dx, dy, dz);
          if (d > 1650) continue;
          // vận tốc lại gần xe mình (m/s, 8 đv = 1 m): dương = đang lao tới -> tiếng cao lên (Doppler)
          const vr = -((dr.wvx || 0) * dx + (dr.wvy || 0) * dy + (dr.wvz || 0) * dz) / Math.max(1, d) / 8;
          near.push({ d, pos: { x: dr.x, z: dr.z }, vr, speed: Math.hypot(dr.wvx || 0, dr.wvz || 0), climb: dr.wvy || 0 });
        }
        near.sort((a, b) => a.d - b.d);
      }
      // tiếng máy / xích xe mình át tiếng drone khi xe chạy nhanh
      const mask = viewing ? 0.45 : P && !P.isDead ? Math.min(1, Math.abs(P.speed || 0) / Math.max(1, P.baseMaxSpeed || 100)) : 0;   // micro drone: tiếng cánh quạt của chính nó át bớt
      SE.updateDroneAmbient(near, mask);
    },

    // ---------- PHÒNG KHÔNG: XE 6 NÒNG / XE TRINH SÁT ----------
    canShootAir(P) { return !!(P && C.AA_TYPES[P.tankType]); },

    /** Drone địch (đang thấy) gần con trỏ nhất trên màn hình (≤ 40 px). mouse: tọa độ chuẩn hóa, r: khung canvas */
    pickDroneAt(mouse, r) {
      const P = this.player;
      if (!P) return null;
      const v = this._pickV || (this._pickV = new THREE.Vector3());
      let best = null, bp = 40;
      for (const dr of this.airDroneList()) {
        if (dr.team === P.team || dr.key === 'own' || !dr.seen) continue;
        v.set(dr.x, dr.y + C.CENTER_Y, dr.z).project(this.camera);
        if (v.z > 1) continue;
        const px = Math.hypot((v.x - mouse.x) * r.width / 2, (v.y - mouse.y) * r.height / 2);
        if (px < bp) { bp = px; best = dr; }
      }
      return best;
    },

    /** Nhấp lên trời (tia không chạm đất, hướng lên): nâng nòng bắn theo đúng hướng con trỏ */
    aimAtSky(ray, quiet) {
      const P = this.player;
      const m = P.getMuzzleWorldTransform ? P.getMuzzleWorldTransform().position : { x: P.x, y: (P.y || 0) + 20, z: P.z };
      const px = ray.origin.x + ray.direction.x * 900, py = ray.origin.y + ray.direction.y * 900, pz = ray.origin.z + ray.direction.z * 900;
      const dx = px - m.x, dy = py - m.y, dz = pz - m.z, hd = Math.hypot(dx, dz);
      if (hd < 1) return;
      const az = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
      const el = Math.max(-5, Math.min(60, Math.atan2(dy, hd) * 180 / Math.PI));
      this.setAirAim({ kind: 'sky', az, el }, quiet);
    },

    // quiet: súng bám theo chuột (gọi liên tục) — không ghi nhật ký / không đổi ô đạn mỗi lần
    setAirAim(A, quiet) {
      const P = this.player;
      if (!P || !A) return;
      // radar (trinh sát / phòng không 6 nòng) đang bị máy phá sóng địch chiếu: không khóa được drone (ew_jammer.js)
      if (A.kind === 'drone' && (P.tankType === 'SCOUT' || P.tankType === 'GATLING') && this.radarJammed && this.radarJammed(P)) {
        this.radarJamNote();   // tự giãn cách 2 s, không lặp khi bám theo chuột
        return;
      }
      if (this.lockedTarget) this.setLockedTarget(null);
      this._aimPoint = null;
      this._lockTrack = null;
      P.fcsTarget = null;
      A.solT = 0;
      this._airAim = A;
      if (P.tankType === 'SCOUT' && P.selectedAmmo === 'ANTI_TANK_MISSILE' && this.selectAmmoType) this.selectAmmoType('SCOUT_BULLET');
      if (A.kind === 'drone') {
        const d = Math.round(Math.hypot(A.dr.x - P.x, A.dr.y - (P.y || 0), A.dr.z - P.z));
        const R = P.ewActive && this.jamRange ? this.jamRange() : 0;
        this.addCombatLog(R
          ? `[[lock]] ĐẦU PHÁ SÓNG ĐÃ KHÓA DRONE ĐỊCH // CỰ LY ${d}M${d > R ? ' (ngoài tầm chùm ~' + R + 'M — chờ nó tới gần)' : ''} — giữ Space để phát chùm`
          : `[[lock]] ĐÃ KHÓA DRONE ĐỊCH // CỰ LY ${d}M — máy tính hỏa lực tự đón đầu & nâng nòng. Giữ Space để xả đạn`, 'tip');
        if (window.soundEngine && window.soundEngine.playTargetLockSound) window.soundEngine.playTargetLockSound();
      } else if (!quiet) {
        this.addCombatLog(`[[crosshair]] Nâng nòng bắn lên trời ${Math.round(A.el)}° — nhấp vào drone địch để khóa & đón đầu`, 'tip');
      }
    },

    clearAirAim(msg) {
      if (!this._airAim) return;
      this._airAim = null;
      const P = this.player;
      if (P) { P.fcsTarget = null; P.aimAz = P.aimEl = undefined; P._aa = null; }
      if (msg) this.addCombatLog(msg, 'alert');
      if (this._airLockEl) this._airLockEl.hidden = true;
    },

    /**
     * Nghiệm bắn vào điểm trên không đang bay (tx..tz, vận tốc tvx..tvz): mô phỏng đúng đường đạn súng (trọng lực + cản + gió)
     * rồi chỉnh góc nòng / điểm đón đầu theo thời gian đạn bay. Trả { az, el (độ, thế giới), t (giây), dist, reach }
     */
    airShotSolution(shooter, ammo, tx, ty, tz, tvx, tvy, tvz) {
      const B = this.ballistics;
      if (!B || !B.roundParams) return null;
      const rp = this.aaRound(shooter, ammo), M = B.bulletSpeedMultiplier || 1;
      const mz = this.aaMuzzle(shooter).position;
      let t = Math.hypot(tx - mz.x, ty - mz.y, tz - mz.z) / Math.max(1, rp.v0 * M);
      let az = 0, el, dist = 0, travel = 0;
      for (let it = 0; it < 3; it++) {
        const ax = tx + tvx * t, ay = ty + tvy * t, azp = tz + tvz * t;
        const dx = ax - mz.x, dy = ay - mz.y, dz = azp - mz.z, hd = Math.max(1, Math.hypot(dx, dz));
        az = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
        if (el === undefined) el = Math.atan2(dy, hd) * 180 / Math.PI;
        dist = Math.hypot(hd, dy);
        let tSim = t * M;
        // chỉnh góc nòng theo chênh lệch GÓC NHÌN (tới mục tiêu và tới điểm đạn bay qua ở cùng cự ly ngang): hệ số ~1 ở
        // mọi góc ngóc. Trước đây cộng atan(Δy / cự ly) — đúng khi bắn gần ngang, nhưng ngóc cao (drone bay trên đầu)
        // thì chỉnh quá tay 1/cos²(góc) lần (~3 lần ở 56°) -> góc nhảy qua lại, kẹt ở nghiệm sai, bắn mãi không trúng
        for (let k = 0; k < 6; k++) {
          const r = this.simBulletAt(rp, az, el, hd);
          if (!r) break;
          const de = (Math.atan2(dy, hd) - Math.atan2(r.y, hd)) * 180 / Math.PI;
          el = Math.max(-30, Math.min(89, el + de));
          tSim = r.t; travel = r.travel;
          if (Math.abs(de) < 0.01) break;
        }
        t = tSim / M;
      }
      return { az, el, t, dist, reach: !rp.maxTravel || travel <= rp.maxTravel };
    },

    // bay thử một viên đạn (cùng bước tích phân với đạn thật) tới khi đi được hd theo phương ngang: { y, t, travel }
    simBulletAt(rp, azDeg, elDeg, hd) {
      const B = this.ballistics;
      const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180, ca = Math.sin(a), cz = -Math.cos(a);
      const p = this._simP || (this._simP = {});
      p.x = 0; p.y = 0; p.z = 0; p.k = rp.k; p.g = rp.g; p.burnTravel = 0; p.travel = 0;
      p.vx = rp.v0 * Math.cos(e) * ca; p.vy = rp.v0 * Math.sin(e); p.vz = rp.v0 * Math.cos(e) * cz;
      const h = 1 / 90;
      let t = 0, prevH = 0, prevY = 0, travel = 0;
      for (let i = 0; i < 400; i++) {
        const x0 = p.x, y0 = p.y, z0 = p.z;
        B.integrateFlight(p, h);
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
        t += h;
        travel += Math.hypot(p.x - x0, p.y - y0, p.z - z0);
        const along = p.x * ca + p.z * cz;
        if (along >= hd) {
          const k = (hd - prevH) / Math.max(1e-6, along - prevH);
          return { y: prevY + (p.y - prevY) * k, t: t - h * (1 - k), travel };
        }
        prevH = along; prevY = p.y;
      }
      return null;
    },

    /** Mỗi khung hình khi đang ngắm trời / khóa drone. false = đã thôi (quay lại cơ chế ngắm thường) */
    updatePlayerAirAim(dt, manual) {
      const P = this.player, A = this._airAim;
      if (!A || !P || P.isDead || !this.canShootAir(P)) { this._airAim = null; return false; }
      if (manual) { this.clearAirAim(); return false; }
      // xe tăng cầm máy phá sóng: không có đạn — đầu phát tự chĩa vào drone (ew_jammer.js), tháp quay theo, pháo chính đứng yên
      if (P.tankType === 'ALL_ROUNDER' && P.ewActive) return this.updateJamAirAim(P, A);
      const B = this.ballistics;
      const tank = P.tankType === 'ALL_ROUNDER';   // xe tăng: trạm súng máy trên nóc tháp, pháo chính không ngóc lên
      const ammo = tank ? 'MG762' : P.selectedAmmo === 'INCENDIARY' ? 'INCENDIARY' : (P.tankType === 'SCOUT' ? 'SCOUT_BULLET' : 'GATLING_BULLET');
      const elMax = tank ? C.RCWS.elMax : 60;
      let az = A.az, el = A.el;
      if (A.kind === 'drone') {
        const dr = A.dr;
        if (!this.droneIsAirborne(dr) || !dr.seen) { this.clearAirAim('[[radar-2]] MẤT DẤU DRONE ĐỊCH — đã hủy khóa'); return false; }
        A.solT -= dt;
        if (A.solT <= 0 || !A.sol) {
          A.solT = 0.1;
          A.sol = this.airShotSolution(P, ammo, dr.x, dr.y + C.CENTER_Y, dr.z, dr.wvx || 0, dr.wvy || 0, dr.wvz || 0);
        }
        const S = A.sol;
        if (!S) return true;
        az = S.az; el = S.el;
        const cap = this.aaRound(P, ammo).maxTravel || 900;
        A.state = el > elMax ? 'high' : (!S.reach || S.dist > cap) ? 'far' : 'track';
        A.lead = { x: dr.x + (dr.wvx || 0) * S.t, y: dr.y + C.CENTER_Y + (dr.wvy || 0) * S.t, z: dr.z + (dr.wvz || 0) * S.t };
        A.dist = S.dist;
        if (S.dist > cap * 1.8) { this.clearAirAim('[[alert-triangle]] Drone địch đã ra quá xa tầm súng — đã hủy khóa'); return false; }
      }
      el = Math.max(-5, Math.min(elMax, el));
      // xe tăng: tháp quay theo hướng drone (camera nhìn theo), trạm súng trên nóc tự ngóc / bám chính xác
      if (tank) { P._aa = { az, el, firing: !!(this.keys && (this.keys.Space || this.isPointerFiring)), until: performance.now() / 1000 + 0.3 }; if (P.aimTo) P.aimTo(az); }
      else if (P.aimTo) P.aimTo(az, el); else { P.aimAz = az; P.aimEl = el; }
      if (!tank && (P.canElevate === false || P.tankType === 'GATLING')) {
        const r = az * Math.PI / 180;
        P.fcsTarget = { x: P.x + Math.sin(r) * 800, z: P.z - Math.cos(r) * 800, y: (P.y || 0) + 800 * Math.tan(el * Math.PI / 180), el };
      }
      // nòng đã khớp hướng nghiệm chưa (đo hướng thật của nòng / súng trạm phòng không)
      {
        const d = this.aaMuzzle(P).direction;
        const baz = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, bel = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
        A.on = Math.abs(((baz - az + 540) % 360) - 180) < 1.2 && Math.abs(bel - el) < 1.2;
        A.barrelEl = bel;
      }
      return true;
    },

    // khóa drone / ngắm trời bằng máy phá sóng: hướng thẳng tới drone, trạng thái theo tầm chùm phá sóng
    updateJamAirAim(P, A) {
      const R = this.jamRange ? this.jamRange() : 950;
      let az = A.az;
      if (A.kind === 'drone') {
        const dr = A.dr;
        if (!this.droneIsAirborne(dr) || !dr.seen) { this.clearAirAim('[[radar-2]] MẤT DẤU DRONE ĐỊCH — đã hủy khóa'); return false; }
        const dx = dr.x - P.x, dz = dr.z - P.z, dist = Math.hypot(dx, dr.y - (P.y || 0), dz);
        if (dist > R * 2.5) { this.clearAirAim('[[alert-triangle]] Drone địch đã ra quá xa — đã hủy khóa'); return false; }
        az = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
        A.dist = dist;
        A.lead = { x: dr.x, y: dr.y + C.CENTER_Y, z: dr.z };
        A.state = dist > R ? 'far' : 'track';
      }
      if (P.aimTo) P.aimTo(az);
      A.on = A.kind === 'drone' && A.state === 'track';
      return true;
    },

    /**
     * Xe tăng chọn súng máy [4] (game.selectMG), không ngắm trời: trạm súng nóc tháp bám đúng chỗ người chơi đang ngắm —
     * xe đang khóa (đón đầu theo vận tốc ước lượng của bộ bám mục tiêu), điểm mặt đất / tâm kính ngắm, không có thì theo
     * hướng tháp & góc nòng. Nghiệm đường đạn 7.62mm thật (airShotSolution chạy được cho cả điểm đứng yên trên mặt đất).
     */
    updatePlayerGroundMG() {
      const P = this.player, R = roofCfg(P);
      if (!P || P.isDead || !P.rcwsGun) return;
      const T = this.lockedTarget && !this.lockedTarget.isDead ? this.lockedTarget : null, pt = this._aimPoint;
      let az = P.azimuth || 0, el = P.elevation || 0;
      let tgt = null;
      if (T) {
        const tr = this._lockTrack && this._lockTrack.id === T.id ? this._lockTrack : null;
        tgt = [T.x, (T.y || this.terrain.getElevationAt(T.x, T.z)) + 8, T.z, tr ? tr.vx : 0, tr ? tr.vz : 0];   // giữa thân xe (~1 m)
      } else if (pt) {
        tgt = [pt.x, (pt.hy !== undefined ? pt.hy : pt.y + 1), pt.z, 0, 0];
      }
      if (tgt) {
        const S = this.airShotSolution(P, R.ammo || 'MG762', tgt[0], tgt[1], tgt[2], tgt[3], 0, tgt[4]);
        if (S) { az = S.az; el = S.el; }
      }
      el = Math.max(R.elMin, Math.min(R.elMax, el));
      const want = !!(this.keys && (this.keys.Space || this.isPointerFiring));
      const nfz = want && this.inNoFireZone();
      if (nfz) this.noFireWarn();
      P._aa = { az, el, firing: want && !nfz, until: performance.now() / 1000 + 0.3 };
    },

    // khung khóa drone địch (HTML): góc ngoặc quanh drone + chấm điểm đón đầu + cự ly / trạng thái
    updateAirLockOverlay() {
      const A = this._airAim;
      let el = this._airLockEl;
      if (!A || A.kind !== 'drone' || !this.player || this.player.isDead) { if (el && !el.hidden) el.hidden = true; return; }
      if (!el) {
        if (!document.getElementById('air-lock-style')) {
          const st = document.createElement('style');
          st.id = 'air-lock-style';
          st.textContent = [
            '#air-lock{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:"Chakra Petch",system-ui,sans-serif;--ac:#ffb020}',
            '#air-lock .al-box{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;',
            'background:linear-gradient(var(--ac),var(--ac)) 0 0/12px 2px,linear-gradient(var(--ac),var(--ac)) 0 0/2px 12px,',
            'linear-gradient(var(--ac),var(--ac)) 100% 0/12px 2px,linear-gradient(var(--ac),var(--ac)) 100% 0/2px 12px,',
            'linear-gradient(var(--ac),var(--ac)) 0 100%/12px 2px,linear-gradient(var(--ac),var(--ac)) 0 100%/2px 12px,',
            'linear-gradient(var(--ac),var(--ac)) 100% 100%/12px 2px,linear-gradient(var(--ac),var(--ac)) 100% 100%/2px 12px;background-repeat:no-repeat;filter:drop-shadow(0 0 2px #000)}',
            '#air-lock .al-txt{position:absolute;left:0;top:0;margin:28px 0 0 -90px;width:180px;text-align:center;color:var(--ac);font-size:11px;font-weight:600;letter-spacing:.08em;text-shadow:0 0 3px #000,0 0 6px #000;white-space:nowrap}',
            '#air-lock .al-lead{position:absolute;left:0;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid var(--ac);border-radius:50%;box-sizing:border-box;filter:drop-shadow(0 0 2px #000)}',
            '#air-lock .al-line{position:absolute;left:0;top:0;height:1px;background:var(--ac);opacity:.55;transform-origin:0 50%}'
          ].join('');
          document.head.appendChild(st);
        }
        el = this._airLockEl = document.createElement('div');
        el.id = 'air-lock';
        el.innerHTML = '<div class="al-line"></div><div class="al-box"></div><div class="al-lead"></div><div class="al-txt"></div>';
        el._box = el.querySelector('.al-box'); el._lead = el.querySelector('.al-lead'); el._txt = el.querySelector('.al-txt'); el._line = el.querySelector('.al-line');
        document.body.appendChild(el);
      }
      const dr = A.dr, cam = this.camera, W = window.innerWidth, H = window.innerHeight;
      const v = this._alV || (this._alV = new THREE.Vector3());
      v.set(dr.x, dr.y + C.CENTER_Y, dr.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { if (!el.hidden) el.hidden = true; return; }
      if (el.hidden) el.hidden = false;
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      el._box.style.transform = el._txt.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px)';
      let lx = sx, ly = sy;
      if (A.lead) {
        v.set(A.lead.x, A.lead.y, A.lead.z).project(cam);
        if (v.z <= 1) { lx = (v.x * 0.5 + 0.5) * W; ly = (-v.y * 0.5 + 0.5) * H; }
      }
      el._lead.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(ly) + 'px)';
      const ll = Math.hypot(lx - sx, ly - sy);
      el._line.style.width = Math.round(ll) + 'px';
      el._line.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) rotate(' + Math.atan2(ly - sy, lx - sx) + 'rad)';
      const col = A.state === 'high' || A.state === 'far' ? '#ff5a4a' : A.on ? '#5cf08a' : '#ffb020';
      if (el._c !== col) { el._c = col; el.style.setProperty('--ac', col); }
      const txt = 'DRONE ĐỊCH · ' + Math.round(A.dist || 0) + ' M · ' + (A.state === 'high' ? 'QUÁ CAO — LÙI XE RA XA'
        : A.state === 'far' ? 'NGOÀI TẦM SÚNG' : A.on ? 'ĐÃ NGẮM TRÚNG' : 'ĐANG XOAY THÁP') + (this._droneHitMark > 0 ? ' · TRÚNG!' : '');
      if (el._txt.textContent !== txt) el._txt.textContent = txt;
    },

    // ---------- RADAR PHÒNG KHÔNG XE 6 NÒNG: CẢNH BÁO + ĐÁNH DẤU VẾT TRÊN MÀN HÌNH ----------
    /**
     * Người chơi lái xe 6 nòng còn radar: drone địch mới lọt vào vùng phủ -> bíp + nhật ký (phương vị, cự ly, độ cao).
     * Mỗi vết radar có ô kim cương trên màn hình (ngoài khung nhìn: mũi tên ở mép màn hình chỉ hướng) để tìm & nhấp khóa.
     * Không tự khóa — vẫn phải nhấp vào drone (pickDroneAt). Drone đang khóa đã có khung khóa riêng nên bỏ qua.
     */
    updateAARadar(list) {
      const P = this.player, seen = this._aaContacts || (this._aaContacts = new Set());
      let el = this._aaRadarEl;
      const RR = this.airRadarR(P);
      if (!RR) {
        if (seen.size) seen.clear();
        if (el && !el.hidden) el.hidden = true;
        return;
      }
      const A = this._airAim, now = new Set(), tracks = [];
      for (const dr of list) {
        if (dr.team === P.team || dr.key === 'own' || !this.droneIsAirborne(dr)) continue;
        const dx = dr.x - P.x, dz = dr.z - P.z, Rd = RR * this.airDetectMul(dr);
        if (dx * dx + dz * dz > Rd * Rd) continue;
        now.add(dr.key);
        if (!seen.has(dr.key)) {
          const brg = Math.round((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) % 360;
          const gy = this.terrain ? this.terrain.getElevationAt(dr.x, dr.z) : 0;
          this.addCombatLog(`[[radar-2]] ${P.tankType === 'SCOUT' ? 'RADAR TRINH SÁT' : 'RADAR PHÒNG KHÔNG'}: DRONE ĐỊCH · phương vị ${String(brg).padStart(3, '0')}° · cự ly ${Math.round(Math.hypot(dx, dz))}M · cao ${Math.round(Math.max(0, dr.y - gy))}M — [F] / Tab / nhấp vào drone để khóa`, 'alert');
          const SE = window.soundEngine;
          if (SE && SE.playRadarContact) SE.playRadarContact(1);
        }
        if (!(A && A.kind === 'drone' && A.dr === dr)) tracks.push(dr);
      }
      seen.clear();
      for (const k of now) seen.add(k);

      if (!tracks.length) { if (el && !el.hidden) el.hidden = true; return; }
      if (!el) {
        if (!document.getElementById('aa-radar-style')) {
          const st = document.createElement('style');
          st.id = 'aa-radar-style';
          st.textContent = [
            '#aa-radar{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:"Chakra Petch",system-ui,sans-serif}',
            '#aa-radar .ar-m{position:absolute;left:0;top:0;color:#ffbe5a;font-size:10px;font-weight:600;letter-spacing:.08em;text-shadow:0 0 3px #000,0 0 6px #000;white-space:nowrap}',
            '#aa-radar .ar-d{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border:1.5px solid currentColor;transform:rotate(45deg);box-sizing:border-box;filter:drop-shadow(0 0 2px #000)}',
            '#aa-radar .ar-a{position:absolute;left:-7px;top:-8px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:14px solid currentColor;transform-origin:7px 8px;filter:drop-shadow(0 0 2px #000)}',
            '#aa-radar .ar-t{position:absolute;left:14px;top:-6px}',
            '#aa-radar .ar-m.off .ar-t{left:-40px;top:12px;width:80px;text-align:center}'
          ].join('');
          document.head.appendChild(st);
        }
        el = this._aaRadarEl = document.createElement('div');
        el.id = 'aa-radar';
        el._marks = [];
        document.body.appendChild(el);
      }
      if (el.hidden) el.hidden = false;
      const cam = this.camera, W = window.innerWidth, H = window.innerHeight, MG = 34;
      const v = this._arV || (this._arV = new THREE.Vector3());
      for (let i = 0; i < Math.max(tracks.length, el._marks.length); i++) {
        let m = el._marks[i];
        const dr = tracks[i];
        if (!dr) { if (m && !m.hidden) m.hidden = true; continue; }
        if (!m) {
          m = document.createElement('div');
          m.className = 'ar-m';
          m.innerHTML = '<div class="ar-d"></div><div class="ar-a"></div><div class="ar-t"></div>';
          m._d = m.children[0]; m._a = m.children[1]; m._t = m.children[2];
          el.appendChild(m);
          el._marks.push(m);
        }
        if (m.hidden) m.hidden = false;
        v.set(dr.x, dr.y + C.CENTER_Y, dr.z).project(cam);
        let nx = v.x, ny = v.y;
        const behind = v.z > 1;
        if (behind) { nx = -nx; ny = -ny; }
        const off = behind || Math.abs(nx) > 1 || Math.abs(ny) > 1;
        let sx = (nx * 0.5 + 0.5) * W, sy = (-ny * 0.5 + 0.5) * H, ang = 0;
        if (off) {
          // dồn ra mép màn hình theo hướng từ tâm tới vết
          const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
          const k = Math.min((cx - MG) / Math.max(1e-3, Math.abs(dx)), (cy - MG) / Math.max(1e-3, Math.abs(dy)));
          sx = cx + dx * k; sy = cy + dy * k; ang = Math.atan2(dy, dx);
        }
        if (m._off !== off) { m._off = off; m.classList.toggle('off', off); m._d.hidden = off; m._a.hidden = !off; }
        m.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px)';
        if (off) m._a.style.transform = 'rotate(' + ang.toFixed(3) + 'rad)';
        const txt = 'RADAR · ' + Math.round(Math.hypot(dr.x - P.x, dr.z - P.z)) + 'M';
        if (m._t.textContent !== txt) m._t.textContent = txt;
      }
    },

    // ---------- MÀN HÌNH DRONE KHI BỊ BẮN HẠ: hình lật nhào, rồi nhiễu trắng "MẤT TÍN HIỆU" ----------
    updateDroneDeathCam(dt, S) {
      // 0–0.75 s: drone lộn nhào theo xác rơi, ánh lửa liếm ống kính, hình giật xé; 0.75 s: hình đứng khựng ở khung cuối,
      // nhiễu trắng + vạch xé hình phủ dần; 1.15 s: hiện "MẤT TÍN HIỆU"; ~3.6 s: về camera xe
      const cam = this.camera, K = S.dying, U = this._uavEl;
      K.t += dt;
      const dead = U && U.dead;
      if (K.t < 0.75) {
        const F = this._droneFalls && this._droneFalls.find(f => f.own);
        const x = F ? F.x : K.x, y = F ? F.y : K.y, z = F ? F.z : K.z;
        cam.position.set(x, y + 1, z);
        const yaw = K.yaw + K.t * 5.5, pitch = -0.9 + Math.sin(K.t * 7) * 0.5;
        cam.lookAt(x - Math.sin(yaw) * Math.cos(pitch) * 100, y + 1 + Math.sin(pitch) * 100, z - Math.cos(yaw) * Math.cos(pitch) * 100);
        cam.rotateZ(K.t * 9);
        this.renderer.domElement.style.transform = 'translate(' + Math.round((Math.random() - 0.5) * 28) + 'px,' + Math.round((Math.random() - 0.5) * 20) + 'px)';
        if (U && U.burn) U.burn.style.opacity = (0.6 + Math.random() * 0.4).toFixed(2);
        if (U && U.fire) { U.fire.hidden = false; U.fire.textContent = '⚠ DRONE TRÚNG ĐẠN · ĐANG RƠI'; }
      } else {
        if (!K.freeze) {
          K.freeze = true;
          this.renderer.domElement.style.transform = 'translate(0,' + Math.round((Math.random() - 0.5) * 14) + 'px)';   // khung cuối lệch dòng
          if (U && U.burn) U.burn.style.opacity = '0.25';
          if (U && U.fire) U.fire.hidden = true;
          if (dead) dead.hidden = false;
        }
        if (dead) {
          const k = Math.min(1, (K.t - 0.75) / 0.9);
          dead.style.setProperty('--na', (0.35 + 0.6 * k).toFixed(2));
          dead.style.setProperty('--bg', (0.75 * Math.max(0, (K.t - 1.4) / 0.8)).toFixed(2));
          if (K.t > 1.15 && !dead.classList.contains('txt')) dead.classList.add('txt');
        }
      }
      if (K.t > 3.6) {
        this.setSightMode(false);
        if (!K.kami) this.addCombatLog('[[eye-off]] Mất tín hiệu drone — về camera xe pháo', 'alert');
      }
    }
  };

  return { C, ST, airborne, methods, roofCfg };
})();

if (typeof window !== 'undefined') window.DroneAir = DroneAir;

// Tiếng chiến trường có vị trí (nổ, khai hỏa, súng máy, phóng tên lửa, đạn găm): khi đang xem qua drone, khoảng cách
// tính lại từ micro drone thay vì từ xe (nơi gọi đã tính từ xe mình). [vị trí tham số khoảng cách, vị trí tham số pos]
(function () {
  if (typeof SoundEngine === 'undefined') return;
  const P = SoundEngine.prototype;
  const MAP = { playExplosionAtDistance: [0, 3], playCannonFire: [2, 3], playGatlingShot: [1, 2], playMissileLaunch: [0, 1], playGatlingImpact: [0, 3], playKineticImpact: [0, 2] };
  Object.keys(MAP).forEach(name => {
    const orig = P[name];
    if (typeof orig !== 'function' || orig.__droneEar) return;
    const [di, pi] = MAP[name];
    const w = function (...a) {
      const g = typeof window !== 'undefined' ? window.game : null;
      if (a[pi] && g && g.droneEarDistance) {
        const d = g.droneEarDistance(a[pi]);
        if (d !== null) a[di] = d;
      }
      return orig.apply(this, a);
    };
    w.__droneEar = true;
    P[name] = w;
  });
})();
