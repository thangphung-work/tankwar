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
  const ROOF_MSL_SCALE = 1.45;   // tên lửa bệ đột nóc so với mô hình ATGM chung (xem roofMissileProfile)
  const C = {
    HIT_R: 4.5,          // bán kính trúng quanh tâm thân drone (sải cánh kể cả cánh quạt ~0.8 m = 6.6 đv)
    NEAR_R: 42,          // đạn bay qua trong bán kính này: tiếng rít qua micro drone
    CENTER_Y: 1.5,       // tâm thân drone trên gốc mô hình (đáy chân đáp) — recon_drone.js CENTER_Y
    // phần "thân drone" mất mỗi phát trúng (1 = rơi): drone nhựa / sợi carbon rất mỏng manh —
    // 30mm 2 phát, 12.7mm 3 phát, đạn cháy 2 phát (đạn pháo không bắn được mục tiêu trên không)
    DMG: { GATLING_BULLET: 0.5, SCOUT_BULLET: 0.34, INCENDIARY: 0.5 },
    // đạn 12.7 nổ-cháy-xuyên Mk211 (s.heiap): ngòi chạm nổ ngay trên vỏ nhựa / sợi carbon. Viên đi qua lõi thân (pin, mạch,
    // động cơ — trong HEIAP_CORE x HIT_R quanh tâm) là rơi; trúng cánh / cần quạt ở rìa thì mất HEIAP_EDGE
    HEIAP_CORE: 0.55, HEIAP_EDGE: 0.6,
    // Mảnh văng của đạn 30mm nổ trên không (đạn lập trình ngòi 'ahead30', ballistics abmBurst) trúng drone: sát thương
    // bằng FRAG_K phát trúng thẳng. Đạn 30mm thường dùng ngòi chạm: bay sượt qua không nổ, không có mảnh
    FRAG_K: 0.5,
    ABM: { reach: 40, cone: 0.18, base: 3 },   // chùm bi vonfram hình nón phía trước điểm nổ (đv): tầm, độ mở, bán kính gốc
    SEE_R: 1500,         // đội có xe trong bán kính ngang này thì thấy drone địch bay (drone bay cao, dễ lộ)
    AA_RADAR_R: 2600,    // xe 6 nòng còn radar phòng không: phát hiện drone địch trong bán kính ngang này (~325 m)
    SCOUT_AIR_R: 1800,   // radar trinh sát cũng bắt & khóa được drone, nhưng tầm ngắn hơn radar phòng không 6 nòng
    BOT_SEE_R: 1100,     // bot tự phát hiện drone trong bán kính này
    // TÊN LỬA PHÒNG KHÔNG (xe trinh sát chọn ô tên lửa, khóa drone): kính ngắm chiếu tia laser dẫn vào drone. lockR: tầm
    // bộ bám bắt được drone (ngắn hơn tầm đánh xe — drone nhỏ, khó bám); dropR: drone ra xa hơn thì hủy khóa.
    // Nổ cận đích: trong ballistics AIR_FUZE (9 đv) = hạ chắc; mảnh còn sát thương tới fragR
    // lostT: drone khuất / vượt góc ngóc liên tục bấy nhiêu giây thì kính mất dấu (hủy khóa)
    MSL: { lockR: 1600, dropR: 2400, fragR: 26, aimTol: 1.5, lostT: 1.0 },
    SEND_FLY: 0.1, SEND_IDLE: 1.0,
    INTERP: 0.15, INTERP_MAX: 0.5, EXTRAP: 0.35,   // trễ nội suy tối thiểu / tối đa (thích ứng theo khoảng gói, độ trễ mạng)
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
      // Bệ tên lửa đột nóc 2 ống (kiểu Javelin trên tháp): 2 quả mỗi lần xuất kích, không nạp lại. Khóa xe địch bằng đầu
      // dò ảnh nhiệt (giữ tâm ngắm trên xe lockT giây, lệch tâm tụt về 0; không khóa được khi địch trong khói/bụi), bấm Space
      // phóng 1 quả: khí nén đẩy ra khỏi ống (coldT giây chưa đánh lửa), động cơ cháy -> vút lên đỉnh vồng -> bổ nhào gần thẳng
      // đứng xuống nóc (ballistics guideMissile G.loft). Bắn-và-quên: xe phóng rút được ngay, đầu dò tự bám mục tiêu (mất
      // dấu khi địch thả khói hoặc vào bụi). Bệ ngóc launchEl lúc chờ phóng. Chỉ đánh xe trong minR..maxR (gần hơn không kịp vồng lên).
      // dmg: phần máu tối đa mất khi trúng nóc — bare: không có mái lồng, cage: mái lồng chống UAV còn nguyên; kill: xe giáp
      // mỏng trúng là hạ gọn
      atgm: { mag: 2, reload: 0, rof: 1, yawRate: 1.0, pitchRate: 0.7, elMin: -5, elMax: 30, launchEl: 20,
        lockT: 2.5, minR: 300, maxR: 1600, coldT: 0.3, coldG: 8,
        loft: { base: 50, k: 0.4, max: 250, diveK: 0.5, minDive: 40, climb: 2.0, aimY: -10 },
        dmg: { bare: [0.90, 0.95], cage: [0.80, 0.85], kill: ['SCOUT', 'ARTILLERY'] },
        name: 'Tên lửa đột nóc', ammo: 'ANTI_TANK_MISSILE' }
    }
  };
  // Thông số vũ khí trên bệ nóc tháp của xe (mặc định: súng máy)
  const roofCfg = (u) => (u && u.roofWeapon && C.ROOF[u.roofWeapon]) || C.RCWS;
  const ST = ['docked', 'launching', 'flying', 'returning', 'lost'];
  const airborne = s => s === 'launching' || s === 'flying' || s === 'returning';
  const wrapPi = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const nowS = () => performance.now() / 1000;
  // màu búp khói drone hỏng (0x1e1c1a -> 0x3a3734, chia 0,66 bù độ sáng ô khói atlas ExplosionFX)
  const DSMOKE_C0 = [0.118 / 0.66, 0.110 / 0.66, 0.102 / 0.66], DSMOKE_C1 = [0.227 / 0.66, 0.216 / 0.66, 0.204 / 0.66];
  // gỡ ngọn lửa (recon_drone.js) + hủy vật liệu riêng của nó
  const dropFlame = fl => { if (!fl) return; if (typeof ReconDrone !== 'undefined' && ReconDrone.disposeFlame) ReconDrone.disposeFlame(fl); else if (fl.parent) fl.parent.remove(fl); };

  const methods = {
    /** Trận mới: dọn drone / xác drone / khói của trận trước */
    resetDroneWorld() {
      const drop = m => { if (m && m.parent) m.parent.remove(m); };
      if (this._otherDrones) this._otherDrones.forEach(R => drop(R.model));
      this._otherDrones = new Map();
      // lửa: hủy luôn vật liệu riêng (trước đây chỉ gỡ khỏi cảnh -> rò 14 vật liệu / ngọn); lửa xác rơi gỡ TRƯỚC khi xóa danh sách
      (this._droneFalls || []).forEach(f => { drop(f.m); (f.flames || []).forEach(dropFlame); });
      this._droneFalls = [];
      this._droneSmoke = [];
      (this._droneDebris || []).forEach(d => { drop(d.m); if (d.flame) dropFlame(d.flame); });
      this._droneDebris = [];
      if (this._droneFlames) this._droneFlames.forEach(dropFlame);
      this._droneFlames = new Map();
      this._airList = [];
      this._airAim = null;
      this._droneLocks = new Map();
      this._droneThreat = null;
      this._droneSentCode = undefined;
      if (this._airLockEl) this._airLockEl.hidden = true;
      if (this._laserGlintEl) this._laserGlintEl.hidden = true;
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
        // tên lửa đánh drone: nổ cận đích / còn tia dẫn không / mất dẫn đường
        if (!B.onAirBurst) B.onAirBurst = (s, T, h) => this.missileAirBurst(s, T, h);
        if (!B.airBeamOk) B.airBeamOk = (u, dr) => this.missileBeamOk(u, dr);
        if (!B.onAirMissileLost) B.onAirMissileLost = (s, why) => this.airMissileLost(s, why);
        if (!B.onMissileIgnite) B.onMissileIgnite = (s) => this.roofMissileIgniteFx(s);   // tên lửa đột nóc phóng nguội đánh lửa
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
        // xe bot do máy này chạy: AI tự lái drone trinh sát / UAV cảm tử (bot_drones.js) — vị trí đặt thẳng, không nội suy gói
        const botAuth = !!(this.updateBotDrone && this.botDroneAuth && this.botDroneAuth(u));
        if (botAuth) { R.net = false; this.updateBotDrone(R, u, dt); }
        else {
          // xe không có gói mạng & không có AI drone: drone luôn đậu; hồi sinh / xe chết không đổi gì
          // (drone bị bắn nát ngay trên đế — game.hitDockedDrone: mất tới khi xe chết & hồi sinh mới có drone mới)
          if (!R.net && R.state === 'lost' && u.isDead) R.state = 'docked';
          if (!R.net && R.state !== 'docked' && R.state !== 'lost' && !u.isDead) R.state = 'docked';
        }
        if (airborne(R.state)) {
          if (!botAuth) this.interpDrone(R, t, dt);
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
          // UAV cảm tử: gói mạng không có góc nghiêng — suy ra từ tốc độ đổi hướng (vòng rẽ phối hợp, KamiUAV.bankFor)
          let roll = 0;
          if (kami && dt > 0) {
            const w = R._kyaw === undefined ? 0 : wrapPi(R.yaw - R._kyaw) / dt;
            R._kyaw = R.yaw;
            R._kw = (R._kw || 0) + (w - (R._kw || 0)) * (1 - Math.exp(-dt * 4));
            roll = KamiUAV.bankFor(R._kw, Math.hypot(R.wvx, R.wvz), KamiUAV.C.attackBank);
          }
          if (R.seen) {
            m.position.set(R.x, R.y, R.z);
            const tilt = Math.min(0.25, Math.hypot(R.wvx, R.wvz) / 2400);
            m.rotation.set(kami ? Math.atan2(R.wvy || 0, Math.hypot(R.wvx, R.wvz) || 1) : -tilt, R.yaw, roll);
            if (kami) { KamiUAV.animate(m, dt, 1, 1); if (this.kamiTrailModel) this.kamiTrailModel(m, dt); } else ReconDrone.animate(m, dt, 1);
          }
          continue;
        }
        R.seen = false;
        R._px = undefined; R._kyaw = undefined; R._kw = 0;
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
    interpDrone(R, t, dt) {
      const S = R.samples;
      if (!S.length) return;
      // mẫu đóng mốc lúc gửi theo đồng hồ chung: lấy giờ chung (cùng hệ với mốc mẫu)
      const NS = this.netSync;
      if (R.tb === 'net' && NS && NS.net && NS.net.now) t = NS.net.now() / 1000;
      // trễ hiển thị thích ứng: >= 1,5 khoảng gói + 2 x dao động + độ trễ mạng (mốc lúc gửi) — trễ cố định 0,12 s cũ chưa tới
      // 1,5 khoảng gói 10 Hz nên hay phải ngoại suy; đổi dần để dòng thời gian không giật
      const want = Math.min(C.INTERP_MAX, Math.max(C.INTERP, (R.gapA || C.SEND_FLY) * 1.5 + 2 * (R.gapJ || 0) + (R.lagA || 0) + 2 * (R.lagJ || 0)));
      R.delay = R.delay === undefined ? want : R.delay + (want - R.delay) * Math.min(1, (dt || 0.016) * 2);
      const rt = t - R.delay;
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
      // (h.d chỉ là khoảng cách ở cuối bước đạn vừa lọt vùng trúng ~ sát rìa; h.dl: khoảng cách gần nhất của đường đạn tới tâm)
      const hd = h ? (h.dl !== undefined ? h.dl : h.d) : Infinity;
      const dmg = s.heiap ? (hd < C.HIT_R * C.HEIAP_CORE ? 1 : C.HEIAP_EDGE)
        : (s.aaMG ? C.RCWS.dmgDrone : (C.DMG[s.ammoType] || 0)) * (h && h.d > C.HIT_R ? C.FRAG_K : 1);
      // Mk211: chớp nổ-cháy nhỏ ngay trên thân drone
      if (s.heiap && fx && fx.spawnIncendiarySplash) { try { fx.spawnIncendiarySplash(h.x, h.y, h.z, 0.7); } catch (e) { /* hiệu ứng phụ */ } }
      if (!dmg) return;
      if (dr.key === 'own') {
        if (auth) this.damageOwnDrone(dmg, shooter);
        else this.droneHitFX(true);   // đạn từ bản sao trên máy mình: chỉ hình / tiếng, sát thương do máy người bắn báo
        return;
      }
      const SE = window.soundEngine, P = this.player;
      if (SE && SE.playDroneHit && P && Math.hypot(P.x - h.x, P.z - h.z) < 1300) SE.playDroneHit(false);
      // drone của bot do máy này lái (bot_drones.js): trừ thân ngay tại đây
      if (dr.onHit && !dr.net) { if (auth) dr.onHit(dmg, shooter); if (shooter === P) this._droneHitMark = 0.35; return; }
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
      // lựu 40mm (gl40) bay theo mã đạn 30mm nhưng đầu nổ mảnh lớn hơn hẳn: tính riêng, không lấy hệ số đạn 30mm
      const base = s.isHeavyArty ? 2.2 : s.gl40 ? 0.5 : a === 'HE' ? 1.6 : a === 'NORMAL' || a === 'CLUSTER' ? 1.2 : a === 'RPG' || a === 'ANTI_TANK_MISSILE' ? 1.1
        : a === 'CLUSTER_SUBMUNITION' ? 0.7 : a === 'GATLING_BULLET' || a === 'INCENDIARY' ? 0.15 : a === 'AP' ? 0.1 : 0;
      if (!base) return;
      // drone lơ lửng trên không: sức ép lan tự do hơn mặt đất -> bán kính ảnh hưởng ~1.3 lần
      const R = radius * 1.3;
      for (const dr of list) {
        const d = Math.max(1, Math.hypot(dr.x - x, dr.y + C.CENTER_Y - y, dr.z - z));
        if (d > R) continue;

        // 1. Tác động lực đẩy gió của sóng xung kích (Shockwave wind blast push)
        const pushK = Math.max(0, 1 - d / R);
        const pushVel = (s.isHeavyArty ? 220 : a === 'HE' ? 160 : 100) * pushK;
        const dirX = (dr.x - x) / d, dirY = (dr.y + C.CENTER_Y - y) / d, dirZ = (dr.z - z) / d;
        dr.wvx = (dr.wvx || 0) + dirX * pushVel;
        dr.wvy = (dr.wvy || 0) + Math.max(0.3, dirY) * pushVel * 0.7;
        dr.wvz = (dr.wvz || 0) + dirZ * pushVel;
        if (dr.key === 'own') {
          dr.vx = (dr.vx || 0) + dirX * pushVel;
          dr.vy = (dr.vy || 0) + Math.max(0.3, dirY) * pushVel * 0.7;
          dr.vz = (dr.vz || 0) + dirZ * pushVel;
        }

        // 2. Sát thương mảnh văng & sức ép nổ: trong vùng lõi (core) xé toạc drone rơi ngay
        let dmg = 0;
        const cR = core || (s.isHeavyArty ? 48 : R * 0.35);
        if (d <= cR) {
          dmg = Math.max(1.0, base);
        } else {
          dmg = Math.round(base * (cR / d) * Math.pow(1 - d / R, 1.2) * 1000) / 1000;
        }
        if (dmg < 0.02) continue;
        this.hurtDrone(dr, dmg, shooter, auth);
      }
    },

    // trừ "thân drone" theo đúng chủ quyền: drone mình tự trừ khi lọt vùng nổ, drone bia phòng thử, drone máy khác (gửi gộp)
    hurtDrone(dr, dmg, shooter, auth) {
      if (dr.key === 'own') {
        // Drone của người chơi: luôn tự trừ máu khi dính nổ của bất kỳ viên đạn nào
        this.damageOwnDrone(dmg, shooter);
      } else if (dr.onHit && !dr.net) {   // drone bia của phòng thử đạn (range_lab.js) / drone bot do máy này lái tự trừ thân
        if (auth) dr.onHit(dmg, shooter);
      } else if (auth && dr.net && shooter) {
        dr.pend = (dr.pend || 0) + dmg;
        dr.pendBy = shooter;
      }
    },

    // ---------- TÊN LỬA PHÒNG KHÔNG (xe trinh sát) ----------
    /**
     * Ngòi cận đích kích nổ (ballistics airFuze): quả cầu lửa + mảnh văng trên không, KHÔNG đào hố / phá nhà bên dưới.
     * Trong AIR_FUZE quanh tâm drone = hạ chắc (mảnh + sức ép xé drone nhựa / sợi carbon); xa hơn mảnh yếu dần tới fragR
     * (mọi drone đang bay trong vùng, cả drone phe mình)
     */
    missileAirBurst(s, T, h) {
      const fx = this.ballistics && this.ballistics.fx;
      if (fx && fx.spawn) {
        try { fx.spawn(h.x, h.y, h.z, 'RPG', 'AIR', {}); fx.spawn(h.x, h.y, h.z, 'CLUSTER_SUBMUNITION', 'AIR', { noShock: true }); } catch (e) { /* hiệu ứng phụ */ }
      }
      const SE = window.soundEngine, L = this.audioListener && this.audioListener();
      if (SE && SE.playExplosionAtDistance && L) {
        SE.playExplosionAtDistance(Math.max(1, Math.hypot(L.x - h.x, (L.y || 0) - h.y, L.z - h.z)), 'AIRBURST', s.ammoType || 'ANTI_TANK_MISSILE', { x: h.x, z: h.z });
      }
      const shooter = this.unitById(s.shooterId);
      const NS = this.netSync && !this.netSync.detached ? this.netSync : null;
      const auth = !s.netRemote && (!NS || (shooter && NS.owns(shooter)));
      const FZ = BallisticsSystem3D.AIR_FUZE || 9, FR = C.MSL.fragR;
      let downed = false;
      for (const dr of this._airList || []) {
        const d = Math.hypot(dr.x - h.x, dr.y + C.CENTER_Y - h.y, dr.z - h.z);
        if (d > FR) continue;
        const dmg = d <= FZ ? 1 : Math.round(0.9 * (1 - (d - FZ) / (FR - FZ)) * 1000) / 1000;
        if (dmg < 0.01) continue;
        if (T && dr === T.dr && dmg >= 1) downed = true;
        this.hurtDrone(dr, dmg, shooter, auth);
      }
      if (shooter && shooter === this.player && !s.netRemote) {
        this._droneHitMark = 0.6;
        const what = s.aaFuze ? 'ROCKET' : 'TÊN LỬA';
        this.addCombatLog(downed ? `[[rocket]] ${what} NỔ CẬN ĐÍCH SÁT DRONE ĐỊCH — mảnh & sức ép xé nát drone!` : `[[rocket]] ${what} nổ cận đích cạnh drone địch`, 'tip');
      }
    },

    /**
     * Tia dẫn còn giữ trên drone không (ballistics.airBeamOk, mỗi bước bay của tên lửa). Xe mình: kính phải còn khóa đúng
     * drone đó ở chế độ tên lửa, drone trong tầm nhìn / góc ngóc, xạ thủ không chui vào xe. Xe khác (bản sao / bot): máy
     * điều khiển xe đó tự quyết định — ở đây chỉ xét xe còn sống & còn xạ thủ
     */
    missileBeamOk(u, dr) {
      if (!u || u.isDead || (u.dmg && u.dmg.crewDown)) return false;
      if (u !== this.player) return true;
      if (u._crewStay) return false;
      const A = this._airAim;
      return !!(A && A.kind === 'drone' && A.dr === dr && A.msl && A.state === 'track' && A.los);
    },

    /** Tên lửa của xe mình đang bay theo tia dẫn tới drone (chưa mất dẫn đường) */
    airMissileGuiding() {
      const P = this.player, B = this.ballistics;
      if (!P || !B || !B.activeShells) return false;
      for (const s of B.activeShells) {
        const G = s.guide;
        if (G && !G.lost && !s.exploded && !s.netRemote && s.shooterId === P.id && G.airOwner !== undefined && G.airOwner !== null) return true;
      }
      return false;
    },

    airMissileLost(s, why) {
      const P = this.player;
      if (!P || s.netRemote || s.shooterId !== P.id) return;
      this.addCombatLog(why === 'gone' ? '[[drone-off]] Drone mục tiêu đã rơi — tên lửa bay tiếp tới hết tầm rồi tự hủy'
        : '[[alert-triangle]] TÊN LỬA MẤT DẪN ĐƯỜNG — kính ngắm mất tia trên drone, tên lửa bay thẳng tới hết tầm rồi tự hủy', why === 'gone' ? 'tip' : 'alert');
      if (why !== 'gone' && window.soundEngine && window.soundEngine.playTargetLost) window.soundEngine.playTargetLost();
    },

    /** Đường ngắm từ điểm (x, y, z) tới drone có bị địa hình che không (dò 24 điểm dọc đường ngắm) */
    droneInSight(x, y, z, dr) {
      const T = this.terrain;
      if (!T || !T.getElevationAt) return true;
      const tx = dr.x, ty = dr.y + C.CENTER_Y, tz = dr.z;
      for (let i = 1; i < 24; i++) {
        const k = i / 24, px = x + (tx - x) * k, pz = z + (tz - z) * k;
        if (T.getElevationAt(px, pz) > y + (ty - y) * k + 1) return false;
      }
      return true;
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
    // Ký hiệu kiểu APP-6 (cùng bộ với xe trên tactical_map.js): khung KHÔNG QUÂN hở đáy — vòm (ta) / mái nhọn (địch) —
    // trong là hình UAV chữ V; vạch dự báo dài theo tốc độ (vị trí sau LEAD_S giây), vệt các điểm đã bay qua,
    // drone phe mình có đường datalink nét đứt về xe điều khiển; drone đang bị mình khóa: khung góc vàng + TRK.
    // Bản đồ lớn có khối nhãn: UAV / LM (UAV cảm tử) · độ cao · tốc độ, dòng trạng thái EW (bị phá sóng) / DMG (hư hại)
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
      const LEAD_S = 4, TRAIL_DT = 0.45, TRAIL_N = big ? 14 : 7;
      for (const dr of this.airDroneList()) {
        const ally = dr.team === P.team;
        // vệt bay: lấy mẫu theo thời gian (cả 2 bản đồ cùng gọi — chỉ thêm khi đủ TRAIL_DT); hạ cánh rồi bay lại thì bỏ vệt cũ
        // drone địch: chỉ ghi vệt lúc phe mình đang thấy (không lộ quãng đã bay khi còn ẩn)
        const tr = dr._mapTrail || (dr._mapTrail = []);
        if (!ally && !dr.seen) { tr.length = 0; continue; }
        const lastT = tr.length ? tr[tr.length - 1].t : -1e9;
        if (t - lastT > 1.5) tr.length = 0;
        if (t - lastT >= TRAIL_DT) { tr.push({ x: dr.x, z: dr.z, t }); if (tr.length > 14) tr.shift(); }
        const kami = !!(dr.owner && dr.owner.uavKind === 'kami');
        const col = ally ? '#5fb0dc' : '#e0675c';
        const fill = ally ? 'rgba(95,176,220,0.28)' : 'rgba(224,103,92,0.28)';
        const soft = ally ? 'rgba(95,176,220,' : 'rgba(224,103,92,';
        const jam = (dr.emiT || 0) > 0, hurt = dr.hp !== undefined && dr.hp < 0.5;
        // bị phá sóng: ký hiệu giật / chập chờn như vệt radar mất bám
        let s = toScreen(dr.x, dr.z);
        if (jam) s = { x: s.x + (Math.random() - 0.5) * 3, y: s.y + (Math.random() - 0.5) * 3 };
        const r = big ? 9 : 5.5;
        ctx.save();
        // datalink: xe điều khiển -> drone (chỉ phe mình, bản đồ lớn)
        const O = dr.owner;
        if (big && ally && O && !O.isDead) {
          const o = toScreen(O.x, O.z);
          ctx.strokeStyle = jam ? 'rgba(255,190,90,0.5)' : soft + '0.35)'; ctx.lineWidth = 1;
          ctx.setLineDash(jam ? [2, 5] : [5, 4]); ctx.lineDashOffset = -t * 18;
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(s.x, s.y); ctx.stroke();
          ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }
        // vệt các điểm đã bay qua, mờ dần
        const n0 = Math.max(0, tr.length - TRAIL_N);
        for (let i = n0; i < tr.length - 1; i++) {
          const p = toScreen(tr[i].x, tr[i].z), a = (i - n0 + 1) / (tr.length - n0);
          ctx.fillStyle = soft + (0.55 * a).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, big ? 1.6 : 1.1, 0, Math.PI * 2); ctx.fill();
        }
        // vạch dự báo: vị trí sau LEAD_S giây nếu giữ hướng / tốc độ, vạch ngang ở đầu
        const sp = Math.hypot(dr.wvx || 0, dr.wvz || 0);
        if (sp > 20) {
          const e = toScreen(dr.x + (dr.wvx || 0) * LEAD_S, dr.z + (dr.wvz || 0) * LEAD_S);
          const dx = e.x - s.x, dy = e.y - s.y, L0 = Math.hypot(dx, dy);
          if (L0 > r) {
            // phóng to bản đồ thì vạch dài theo, nhưng không dài quá ~5 lần ký hiệu (che xe / drone khác)
            const L = Math.min(L0, r * 5), ux = dx / L0, uy = dy / L0;
            const bx = s.x + ux * r * 0.9, by = s.y + uy * r * 0.9, ex = s.x + ux * L, ey = s.y + uy * L;
            ctx.strokeStyle = col; ctx.lineWidth = big ? 1.4 : 1;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey);
            const w = big ? 3.5 : 2.2;
            ctx.moveTo(ex - uy * w, ey + ux * w); ctx.lineTo(ex + uy * w, ey - ux * w); ctx.stroke();
          }
        }
        ctx.translate(s.x, s.y);
        if (jam) ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 23));
        // khung không quân hở đáy: vòm (ta) / mái nhọn (địch)
        ctx.lineWidth = big ? 1.6 : 1.1; ctx.strokeStyle = col; ctx.fillStyle = fill;
        if (hurt) ctx.setLineDash([3, 2]);
        ctx.beginPath();
        if (ally) { ctx.moveTo(-r, r * 0.55); ctx.lineTo(-r, r * 0.1); ctx.arc(0, r * 0.1, r, Math.PI, 0); ctx.lineTo(r, r * 0.55); }
        else { ctx.moveTo(-r, r * 0.55); ctx.lineTo(-r, -r * 0.05); ctx.lineTo(0, -r * 1.05); ctx.lineTo(r, -r * 0.05); ctx.lineTo(r, r * 0.55); }
        ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        // hình UAV chữ V; UAV cảm tử thêm đầu nổ (chấm dưới mũi V)
        ctx.fillStyle = '#eef6fb';
        ctx.beginPath();
        ctx.moveTo(-r * 0.66, -r * 0.2); ctx.lineTo(0, r * 0.12); ctx.lineTo(r * 0.66, -r * 0.2);
        ctx.lineTo(r * 0.66, -r * 0.02); ctx.lineTo(0, r * 0.32); ctx.lineTo(-r * 0.66, -r * 0.02); ctx.closePath(); ctx.fill();
        if (kami) { ctx.beginPath(); ctx.arc(0, r * 0.5, big ? 1.7 : 1.1, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        // đang bị mình khóa: khung góc vàng nhịp thở
        if (A && A.dr === dr) {
          const q = r + 4 + Math.sin(t * 6), c = q * 0.45;
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.moveTo(sx * q, sy * (q - c)); ctx.lineTo(sx * q, sy * q); ctx.lineTo(sx * (q - c), sy * q);
          }
          ctx.stroke();
        }
        if (big) {
          // khối nhãn bên phải ký hiệu: loại · độ cao (cùng đơn vị với HUD drone) · tốc độ; dòng trạng thái
          const gy = this.terrain ? this.terrain.getElevationAt(dr.x, dr.z) : 0;
          const alt = Math.round(Math.max(0, dr.y - gy)), kmh = Math.round(sp / 8 * 3.6);
          const st = [];
          if (A && A.dr === dr) st.push(['TRK', '#ffd166']);
          if (jam) st.push(['EW', '#ffbe5a']);
          if (hurt) st.push(['DMG', '#ff8a6a']);
          ctx.font = 'bold 10px Share Tech Mono, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const x0 = r + 10, l1 = kami ? 'LM' : 'UAV', l2 = 'ALT ' + alt + 'M  ' + kmh + 'KM/H';
          ctx.font = '10px Share Tech Mono, monospace';
          const w = Math.max(ctx.measureText(l2).width, 30) + 8, h = st.length ? 37 : 26;
          ctx.fillStyle = 'rgba(8,12,11,0.62)'; ctx.fillRect(x0 - 3, -13, w, h);
          ctx.fillStyle = col; ctx.fillRect(x0 - 3, -13, 2, h);
          ctx.fillStyle = ally ? 'rgba(170,228,248,0.98)' : 'rgba(255,165,155,0.98)';
          ctx.font = 'bold 10px Share Tech Mono, monospace'; ctx.fillText(l1 + (ally ? '' : ' · HOSTILE'), x0 + 1, -6);
          ctx.font = '10px Share Tech Mono, monospace'; ctx.fillStyle = 'rgba(225,232,222,0.9)'; ctx.fillText(l2, x0 + 1, 6);
          let sx = x0 + 1;
          for (const [txt, c] of st) {
            ctx.font = 'bold 9px Share Tech Mono, monospace';
            const tw = ctx.measureText(txt).width + 6;
            ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(sx, 13, tw, 10);
            ctx.fillStyle = c; ctx.fillText(txt, sx + 3, 18.5);
            sx += tw + 3;
          }
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

    /** Thông số vũ khí đang gắn trên bệ nóc tháp của xe (súng máy / phóng lựu / tên lửa đột nóc) */
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
        // đang nạp (thay hộp dây đạn súng máy / phóng lựu): kíp xe ngóc trạm lên để thao tác, không bám mục tiêu
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
          // hộp mới rút từ cơ số mang theo (AmmoLoad): hết cơ số thì bệ câm tới khi được tiếp tế
          if (S.reload <= 0) S.mag = typeof AmmoLoad !== 'undefined' ? AmmoLoad.fillRoof(u, R.mag) : R.mag;
        } else if (S.mag <= 0 && typeof AmmoLoad !== 'undefined' && AmmoLoad.roofCanReload(u)) {
          // hết hộp mà cơ số còn (vừa được tiếp tế / tên lửa đột nóc: kíp xe ra lắp cặp ống mới) -> thay hộp
          S.reload = AmmoLoad.roofReloadTime(u, R.reload);
          if (u === this.player) this.addCombatLog(`[[hourglass]] ${R.name}: đang lắp ${R === C.ROOF.atgm ? 'ống phóng mới' : 'hộp đạn mới'} (${S.reload.toFixed(0)} s)`, 'tip');
        }
        // bệ tên lửa đột nóc: nắp đầu ống còn trên ống nào thì ống đó còn tên lửa (phóng là nắp bật văng — hồi sinh có ống mới)
        if (u.roofRounds) {
          const n = u.roofRounds.length;
          for (let i = 0; i < n; i++) u.roofRounds[i].visible = i >= n - S.mag;
        }
        // tên lửa đột nóc phóng từng quả theo lệnh rời (fireRoofMissile — người chơi bấm Space / bot / gói REMOTE_FIRE_EVENT),
        // không theo cờ giữ cò như súng: chỉ quay / ngóc bệ
        if (u.roofWeapon === 'atgm') { u.isFiringAAmg = false; continue; }
        const firing = !!(A && A.firing) && S.reload <= 0;
        u.isFiringAAmg = firing;
        if (!firing) { S.t = R.rof; continue; }
        S.t += dt;
        while (S.t >= R.rof && S.mag > 0) {
          S.t -= R.rof;
          this.fireRCWS(u);
          if (--S.mag <= 0) {
            const dry = typeof AmmoLoad !== 'undefined' && AmmoLoad.tracks(u) && !AmmoLoad.roofCanReload(u);
            S.reload = dry ? 0 : R.reload;
            if (dry) { if (u === this.player) AmmoLoad.dryNote(u, 'roof'); }
            else if (u === this.player) {
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
      const m = this.aaMuzzle(u), d = m.direction;
      const az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      let shell = null;
      // _roofShot: độ nở tản mát của trạm nóc tháp tính riêng, không cộng vào pháo chính (dispersion.js perturb)
      u._launchOverride = { position: m.position, direction: d }; u._roofShot = true;
      try { shell = this.ballistics.fireShell3D(u, az, el, 1, 'SCOUT_BULLET'); } finally { u._launchOverride = null; u._roofShot = false; }
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
      u._launchOverride = { position: m.position, direction: d }; u._roofShot = true;
      try { shell = this.ballistics.fireShell3D(u, az, el, 1, 'GATLING_BULLET'); } finally { u._launchOverride = null; u._roofShot = false; }
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

    /**
     * Bệ tên lửa đột nóc: phóng 1 quả vào xe đã khóa (u.missileTarget do bên gọi đặt — người chơi, bot, hoặc gói
     * REMOTE_FIRE_EVENT cờ tk trên máy khác). Ống phóng lần lượt (u.roofMuzzles), mỗi ống 1 quả, không nạp lại tới lần xuất
     * kích sau. Khí nén đẩy tên lửa ra ống với tốc độ phóng mặc định của tên lửa (0.3 tốc độ hành trình — khớp vận tốc gửi
     * qua mạng), coldT giây sau mới đánh lửa rồi vồng lên bổ nhào (ballistics guideMissile: G.cold, G.loft).
     * remote: tái hiện phát bắn của máy khác — không kiểm tra số quả còn (máy bắn đã kiểm tra), chỉ trừ cho khớp hình nắp ống
     */
    fireRoofMissile(u, remote) {
      const R = C.ROOF.atgm;
      if (!u || u.isDead || !u.rcwsGun || u.roofWeapon !== 'atgm') return null;
      const S = u._rcws || (u._rcws = { yaw: 0, pitch: 0, mag: R.mag, reload: 0, t: R.rof });
      if (!remote && S.mag <= 0) return null;
      const n = u.roofMuzzles ? u.roofMuzzles.length : 0;
      const k = n ? Math.max(0, Math.min(n - 1, R.mag - Math.max(1, S.mag))) : -1;
      u.rcwsGun.updateWorldMatrix(true, false);
      const M = u.rcwsGun.matrixWorld;
      const pos = (k >= 0 ? u.roofMuzzles[k] : u.rcwsMuzzleLocal).clone().applyMatrix4(M);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(M);
      const az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      let shell = null;
      u._launchOverride = { position: pos, direction: d };
      try { shell = this.ballistics.fireShell3D(u, az, el, 1, 'ANTI_TANK_MISSILE'); } finally { u._launchOverride = null; }
      S.mag = Math.max(0, S.mag - 1);
      if (shell) this.roofMissileProfile(shell);
      this.roofMissileEjectFx(u, k >= 0 && u.roofRounds ? u.roofRounds[k] : null, pos, d);
      u.revealTimer = Math.max(u.revealTimer || 0, 3.5);   // khói khí nén + vệt lửa phóng làm lộ vị trí
      const SE = window.soundEngine, P = this.player;
      if (SE && P) {
        const L = u === P ? null : (this.audioListener() || P);
        const dd = L ? Math.hypot(u.x - L.x, u.z - L.z) : 0;
        // ống khí nén "phụt" + nắp bật, ~0,3 s sau động cơ đánh lửa (module_weapons.js)
        if (dd < 2200) (SE.playTopMissileLaunch || SE.playKamiLaunch || SE.playMissileLaunch).call(SE, dd, L ? { x: u.x, z: u.z } : null);
      }
      return shell;
    },

    // Gắn đường bay tên lửa đột nóc cho viên vừa phóng (cũng dùng khi máy khác tái hiện phát bắn không qua được bệ — netcode)
    roofMissileProfile(shell) {
      const R = C.ROOF.atgm, G = shell.guide;
      shell.isAntiTank = true;
      shell.topMsl = true;   // handleShellImpact: trúng nóc mất R.dmg phần máu tối đa
      if (G) {
        G.top = true;
        G.fnf = true;   // bắn-và-quên kiểu Javelin: đầu dò ảnh nhiệt tự bám, xe phóng rút được ngay
        G.loft = R.loft;
        G.cold = R.coldT * (this.ballistics.bulletSpeedMultiplier || 1);
        G.coldG = R.coldG;
      }
      shell.cold = true;     // chưa đánh lửa: ẩn lửa đuôi, chưa nhả khói (ballistics guideMissile đánh lửa)
      // tên lửa bệ đột nóc to hơn quả ATGM của xe trinh sát (mô hình chung): dài ~1,1 m, Ø ~15 cm — vừa khít ống phóng
      // dài ~1,2 m trên bệ (roof_mounts.js), không còn bé tí trong ống
      if (shell.mesh && !shell.mesh.userData.roofMsl) { shell.mesh.scale.multiplyScalar(ROOF_MSL_SCALE); shell.mesh.userData.roofMsl = true; }
      if (shell.mesh) shell.mesh.traverse(o => { if (o.userData.tracer) o.visible = false; });
    },

    // Phóng nguội: nắp đầu ống bật văng, hơi khí nén trắng phụt ra miệng ống & phụt ngược ở đuôi ống
    roofMissileEjectFx(u, cap, pos, dir) {
      const FX = this.ballistics && this.ballistics.fx;
      if (!this.kamiPuff && !(FX && FX.missileColdLaunch)) return;
      if (cap) {
        const M = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 14), cap.material);
        M.position.copy(pos);
        M.rotation.x = Math.PI / 2;
        this.scene.add(M);
        (this._kamiBits || (this._kamiBits = [])).push({ m: M, vx: dir.x * 55 + (Math.random() - 0.5) * 14, vy: 22 + Math.random() * 10,
          vz: dir.z * 55 + (Math.random() - 0.5) * 14, sx: 8 + Math.random() * 6, sz: 5 + Math.random() * 5, life: 5 });
      }
      const back = pos.clone().addScaledVector(dir, -10), rev = dir.clone().negate().add(new THREE.Vector3(0, 0.4, 0)).normalize();
      // hơi khí nén đặc + vòng hơi xổ ngang, mảnh nắp vỡ, đuôi ống phụt ngược hơi trộn bụi (explosion_fx.js)
      if (FX && FX.missileColdLaunch) { FX.missileColdLaunch(pos, dir, back); return; }
      for (let i = 0; i < 8; i++) this.kamiPuff(pos, dir, 16 + Math.random() * 26, 1.3 + Math.random() * 1.1, 0.8 + Math.random() * 0.5);
      for (let i = 0; i < 6; i++) this.kamiPuff(back, rev, 10 + Math.random() * 18, 1.2 + Math.random(), 0.8 + Math.random() * 0.4);
    },

    // Tên lửa phóng nguội đánh lửa (ballistics.onMissileIgnite): cụm khói mồi lửa xám phụt sau đuôi
    roofMissileIgniteFx(s) {
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1, back = new THREE.Vector3(-s.vx / sp, -s.vy / sp, -s.vz / sp);
      // tiếng động cơ bắt lửa "ĐÙNG – XOẠC" (module_weapons.js), nghe theo khoảng cách tới tai người chơi
      const SE = window.soundEngine, LS = (this.audioListener && this.audioListener()) || this.player;
      if (SE && SE.playMissileIgnite && LS) {
        const dd = Math.hypot(s.x - LS.x, (s.y || 0) - (LS.y || 0), s.z - LS.z);
        if (dd < 2600) SE.playMissileIgnite(dd, { x: s.x, z: s.z });
      }
      // chớp + đèn, cầu lửa phụt ngược, cụm khói mồi lửa nở bung, tàn lửa (explosion_fx.js)
      const FX = this.ballistics && this.ballistics.fx;
      if (FX && FX.missileIgnite) { FX.missileIgnite(new THREE.Vector3(s.x, s.y, s.z), back.clone().negate()); return; }
      if (!this.kamiPuff) return;
      const at = new THREE.Vector3(s.x, s.y, s.z).addScaledVector(back, 4);
      for (let i = 0; i < 8; i++) this.kamiPuff(at, back, 10 + Math.random() * 20, 1.4 + Math.random(), 1.6 + Math.random(), 0xc8c4bc, 0.6);
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
      // l: 1 = kính ngắm đang chiếu tia laser dẫn tên lửa vào drone (camera drone thấy đốm chói tím ở xe chiếu)
      const send = (dr, u, l) => {
        if (!dr || !dr.net || !dr.unit || dr.unit.netId === undefined || u.netId === undefined) return;
        NS.net.send('DRONE_LOCK', { o: dr.unit.netId, a: u.netId, f: u.isFiringGatling || u.isFiringAAmg ? 1 : 0, l: l ? 1 : 0 });
      };
      if (A && A.kind === 'drone' && P && !P.isDead) send(A.dr, P, A.msl && A.state === 'track' && A.los);
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
      L.set(a, { until: performance.now() / 1000 + 1.6, firing: !!d.f, laser: !!d.l });
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
      let top = null, best = Infinity, firing = false, laser = null, bestL = Infinity;
      const up = D && D.unit === P && !P.isDead && airborne(D.state);
      L.forEach((v, u) => {
        if (v.until < now || u.isDead || !up) { L.delete(u); return; }
        const d = Math.hypot(u.x - D.x, u.z - D.z);
        if (v.firing) firing = true;
        if (d < best) { best = d; top = u; }
        if (v.laser && d < bestL) { bestL = d; laser = u; }
      });
      T.top = top;
      T.firing = firing;
      T.laser = laser;
      const on = !!top, viewing = this._sight && this._sight.arty;
      if (on && !T.was) {
        this.addCombatLog(`[[target-arrow]] DRONE BỊ PHÒNG KHÔNG ĐỊCH KHÓA MỤC TIÊU (${top.name}) — đổi hướng, hạ thấp hoặc bay khuất sau địa hình`, 'alert');
        T.beep = 0;
      }
      if (laser && !T.wasLaser) {
        this.addCombatLog(`[[target-arrow]] DRONE BỊ CHIẾU LASER DẪN TÊN LỬA (${laser.name}) — tên lửa có thể đang lao tới: bay khuất sau đồi / hạ thấp ngay`, 'alert');
        T.beep = 0;
      }
      T.wasLaser = !!laser;
      this.updateLaserGlint(laser, viewing);
      if (on && firing && !T.wasFiring) this.addCombatLog('[[alert-triangle]] PHÒNG KHÔNG ĐỊCH ĐANG XẢ ĐẠN VÀO DRONE!', 'alert');
      T.was = on;
      T.wasFiring = on && firing;
      if (on && SE && SE.playDroneLockAlarm && (T.beep -= dt) <= 0) {
        T.beep = firing ? 0.28 : laser ? 0.5 : 0.95;
        SE.playDroneLockAlarm(firing || laser ? 'fire' : 'lock', viewing ? 1 : 0.5);
      }
      const U = this._uavEl;
      if (U && U.lock) {
        const txt = !on ? '' : laser ? '⚠ BỊ CHIẾU LASER — TÊN LỬA CÓ THỂ ĐANG LAO TỚI' : firing ? '⚠ PHÒNG KHÔNG ĐANG BẮN — NÉ NGAY' : '⚠ BỊ KHÓA MỤC TIÊU';
        if (U.lock.textContent !== txt) U.lock.textContent = txt;
        if (U.lock.hidden === !!txt) U.lock.hidden = !txt;
        U.lock.classList.toggle('fire', firing || !!laser);
      }
    },

    /**
     * ĐỐM CHÓI LASER trên hình camera drone: cảm biến camera drone (lọc hồng ngoại kém) thu tia laser dẫn chiếu thẳng vào
     * ống kính thành một đốm tím-trắng nhấp nháy ĐÚNG Ở KÍNH NGẮM xe đang chiếu — chỉ hiện khi đang xem qua camera drone
     * bị chiếu (người khác / góc nhìn thường không thấy gì, không vẽ tia trong thế giới 3D)
     */
    updateLaserGlint(u, viewing) {
      let el = this._laserGlintEl;
      const show = !!(u && viewing && !u.isDead && this.camera);
      if (!show) { if (el && !el.hidden) el.hidden = true; return; }
      if (!el) {
        el = this._laserGlintEl = document.createElement('div');
        el.id = 'laser-glint';
        el.style.cssText = 'position:fixed;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px;pointer-events:none;z-index:6;border-radius:50%;'
          + 'mix-blend-mode:screen;background:radial-gradient(circle,#fff 0 9%,#f1d9ff 15%,rgba(196,120,255,.85) 30%,rgba(140,60,255,.35) 52%,rgba(120,40,255,0) 72%)';
        document.body.appendChild(el);
      }
      // điểm phát tia: kính ngắm trên vòng súng (khớp ngóc súng), không có thì ~2.5 m trên thân xe
      const v = this._lgV || (this._lgV = new THREE.Vector3());
      if (u.barrelPivot && u.group && u.group.visible) u.barrelPivot.getWorldPosition(v);
      else v.set(u.x, (u.y || 0) + 20, u.z);
      v.project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { if (!el.hidden) el.hidden = true; return; }
      if (el.hidden) el.hidden = false;
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const t = performance.now() / 1000, k = 0.75 + 0.25 * Math.sin(t * 37) + 0.15 * Math.sin(t * 11.3);
      el.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) scale(' + k.toFixed(2) + ')';
      el.style.opacity = (0.7 + 0.3 * Math.sin(t * 23)).toFixed(2);
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
        this.addCombatLog(`[[alert-triangle]] ${this.kamiOn && this.kamiOn(this.player) ? 'UAV CẢM TỬ' : 'DRONE TRINH SÁT'} ĐANG BỊ BẮN! Thân còn ${Math.round(D.hp * 100)}%`, 'alert');
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
      // UAV cảm tử: nổ nhỏ trên trời, xác cánh cố định rơi, ống nạp quả mới (kamikaze_uav.js)
      if (this.kamiOn && this.kamiOn(P) && this.kamiShotDown) { this.kamiShotDown(attacker, why); return; }
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
          fx.spawn(x, y + C.CENTER_Y, z, 'CLUSTER_SUBMUNITION', 'AIR', { noShock: true });   // tia lửa + mảnh văng (không thuốc nổ: không sóng xung kích)
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
          const dk = Math.exp(-0.4 * dt);   // cản gió (độc lập FPS; ~1 - 0,4·dt ở 60 FPS)
          f.vx *= dk; f.vz *= dk;
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
            (f.flames || []).forEach(dropFlame);
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
          const dk = Math.exp(-0.6 * dt);   // cản gió độc lập FPS
          d.vx *= dk; d.vz *= dk;
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
          if (d.flame) dropFlame(d.flame);
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

    // Đưa vào lớp khói instanced của ExplosionFX (1 lần vẽ cho mọi hạt) thay vì mỗi búp một Sprite + vật liệu riêng.
    // Giữ dáng cũ: cỡ 1,2k -> 5,7k trong 1,8 s, bốc 5 -> 3 đv/s, trôi ngang, đen đặc -> xám rồi tan
    // (màu chia 0,66 bù độ sáng ô khói trong atlas; ~(1-a)^1,2 ≈ (1-a)(1-0,3a) cũ)
    droneSmokePuff(x, y, z, k) {
      const S = this.ballistics && this.ballistics.fx && this.ballistics.fx.smoke;
      if (!S) return;
      S.add({ x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 2, vy: 5, vz: 0, size: 1.2 * k, grow: 2.5 * k, drag: 0, grav: 2 / 1.8,
        life: 1.8, alpha: 0.7, fadeIn: 0.005, fadePow: 1.2, c0: DSMOKE_C0, c1: DSMOKE_C1, colorRate: 2.5, cell: 0, rotV: 0, floor: false });
    },

    updateDroneSmoke() { /* khói drone nay do ExplosionFX.smoke cập nhật */ },

    // ---------- MẠNG ----------
    sendDroneState(dt) {
      const NS = this.netSync, P = this.player;
      if (!NS || NS.detached || !P || P.tankType !== 'ARTILLERY' || P.netId === undefined) return;
      const D = this.droneState();
      const code = Math.max(0, ST.indexOf(D.state));
      const up = airborne(D.state);
      const per = up ? C.SEND_FLY : C.SEND_IDLE;
      this._droneSendAcc = (this._droneSendAcc || 0) + dt;
      if (this._droneSentCode === code && this._droneSendAcc < per) return;
      // giữ nhịp gửi đều (trừ đúng một chu kỳ; đặt 0 thì khoảng gửi = chu kỳ + phần dư khung -> trôi chậm dần).
      // Đổi trạng thái / gửi gấp (=99) / tụt quá 2 chu kỳ: đặt lại từ đầu
      this._droneSendAcc = this._droneSentCode === code && this._droneSendAcc < per * 2 ? this._droneSendAcc - per : 0;
      this._droneSentCode = code;
      const m = { i: P.netId, s: code, h: Math.round(Math.max(0, D.hp === undefined ? 1 : D.hp) * 100) };
      if (up) {
        m.x = Math.round(D.x * 10); m.y = Math.round(D.y * 10); m.z = Math.round(D.z * 10); m.w = Math.round(wrapPi(D.yaw || 0) * 100);
        // mốc thời gian gửi theo đồng hồ chung (ms): máy nhận nội suy theo lúc GỬI, không theo lúc nhận (mạng giật không méo đường bay)
        if (NS.net.clockSynced && NS.net.now) m.t = Math.round(NS.net.now());
      }
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
        // mốc thời gian: lúc gửi theo đồng hồ chung nếu cả 2 máy đã đồng bộ (tb 'net'), không thì lúc nhận (tb 'local')
        const net = typeof d.t === 'number' && NS.net && NS.net.clockSynced && NS.net.now;
        const tb = net ? 'net' : 'local', rNow = net ? NS.net.now() / 1000 : nowS();
        const s = { t: net ? d.t / 1000 : rNow, x: d.x / 10, y: d.y / 10, z: d.z / 10, w: (d.w || 0) / 100 };
        if (!airborne(prev) || R.tb !== tb) { R.samples.length = 0; R.tb = tb; R.lagA = R.lagJ = R.gapA = R.gapJ = 0; }
        if (!airborne(prev)) { R.x = s.x; R.y = s.y; R.z = s.z; R.yaw = s.w; }
        const S = R.samples, L = S[S.length - 1];
        if (!L || s.t > L.t) {   // gói cũ đến muộn / trùng: bỏ
          // trễ hiển thị thích ứng (như SnapshotBuffer của netcode): đo khoảng gói & độ trễ tới (lúc nhận - lúc gửi) cùng dao động
          if (L && s.t - L.t < 1) { const g = s.t - L.t; R.gapA = R.gapA ? R.gapA * 0.9 + g * 0.1 : g; R.gapJ = R.gapJ * 0.9 + Math.abs(g - R.gapA) * 0.1; }
          if (net) { const lag = Math.max(0, rNow - s.t); R.lagA = R.lagA ? R.lagA * 0.9 + lag * 0.1 : lag; R.lagJ = R.lagJ * 0.9 + Math.abs(lag - R.lagA) * 0.1; }
          S.push(s);
          if (S.length > 8) S.shift();
        }
      }
      // gói DRONE_DOWN bị mất: vẫn cho drone rơi từ chỗ cuối cùng
      // (UAV cảm tử chuyển 'lost' khi đâm mục tiêu: vụ nổ đã do viên đạn đầu nổ vẽ — không cho xác quadcopter rơi)
      if (st === 'lost' && airborne(prev) && !R.fell && u.uavKind !== 'kami') { R.fell = true; this.startDroneFall(u.team, R.x, R.y, R.z, R.wvx || 0, R.wvz || 0, R.yaw || 0, false); }
      if (st !== 'lost') R.fell = false;
      R.state = st;
      if (st === 'lost' && R.model) R.model.visible = false;
    },

    onNetDroneHit(d, from, NS) {
      if (!d || !this.player) return;
      const o = NS.byNetId[d.o];
      const a = typeof d.a === 'number' && d.a >= 0 ? NS.byNetId[d.a] : null;
      if (a && NS.ownerOf(a) !== from) return;
      // máy khác bắn trúng drone của bot do máy này lái (bot_drones.js)
      if (o && o !== this.player && this.botDroneAuth && this.botDroneAuth(o) && this.botDroneHurt) {
        this.botDroneHurt(o, Math.max(0, Math.min(1, (d.d || 0) / 1000)), a);
        return;
      }
      if (o !== this.player) return;
      // đồng đội bắn trúng drone mình: vẫn mất máu (không miễn nhiễm cùng phe)
      this.damageOwnDrone(Math.max(0, Math.min(1, (d.d || 0) / 1000)), a);
    },

    onNetDroneDown(d, from, NS) {
      if (!d) return;
      const u = NS.byNetId[d.o];
      if (!u || u === this.player || NS.ownerOf(u) !== from) return;
      const R = this.otherDrone(u);
      const a = typeof d.a === 'number' && d.a >= 0 ? NS.byNetId[d.a] : null;
      const kami = u.uavKind === 'kami' && !!this.kamiAirBurst;
      if (d.up && !R.fell && d.p) {
        R.fell = true;
        const px = d.p[0] / 10, py = d.p[1] / 10, pz = d.p[2] / 10, vx = (d.v ? d.v[0] : 0) / 10, vz = (d.v ? d.v[1] : 0) / 10;
        if (kami) this.kamiAirBurst(u.team, px, py, pz, vx, 0, vz, R.yaw || 0, false);   // UAV cảm tử: nổ nhỏ trên trời
        else this.startDroneFall(u.team, px, py, pz, vx, vz, R.yaw || 0, false);
      }
      R.state = 'lost';
      R.samples.length = 0;
      if (R.model) R.model.visible = false;
      if (this._airAim && this._airAim.dr === R) this._airAim = null;
      if (!a) return;
      const P = this.player;
      if (a === P) {
        this.addCombatLog(kami ? `[[target-arrow]] ĐÃ BẮN HẠ UAV CẢM TỬ CỦA ${u.name}!` : `[[target-arrow]] ĐÃ BẮN HẠ DRONE TRINH SÁT CỦA ${u.name}! Pháo địch mất mắt ngắm`, 'tip');
        if (window.soundEngine && window.soundEngine.playTargetLockSound) window.soundEngine.playTargetLockSound();
      } else if (P && (u.team === P.team || a.team === P.team)) {
        this.addCombatLog(`[[alert-triangle]] ${a.name} đã bắn hạ ${kami ? 'UAV cảm tử' : 'drone trinh sát'} của ${u.name}`, u.team === P.team ? 'alert' : 'tip');
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

    /** Góc ngóc cao nhất khi bắn / chiếu tia lên trời: trạm súng nóc tháp xe tăng, bệ 12.7 trinh sát (+70°), 6 nòng (+60°) */
    airElMax(P) {
      if (P && P.tankType === 'ALL_ROUNDER') return C.RCWS.elMax;
      if (P && P.tankType === 'SCOUT' && typeof BallisticsSystem3D !== 'undefined' && BallisticsSystem3D.scoutElMax) return BallisticsSystem3D.scoutElMax(P);
      return 60;
    },

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
      const el = Math.max(-5, Math.min(this.airElMax(P), Math.atan2(dy, hd) * 180 / Math.PI));
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
      // xe trinh sát đang chọn tên lửa: khóa drone = kính ngắm chiếu tia dẫn (giữ ô tên lửa); ngắm trời thì về súng máy
      const msl = P.tankType === 'SCOUT' && P.selectedAmmo === 'ANTI_TANK_MISSILE';
      if (msl && A.kind !== 'drone' && this.selectAmmoType) this.selectAmmoType('SCOUT_BULLET');
      // khóa bằng tên lửa: bộ bám giữ drone — kính / camera tự lia theo drone (như khóa F), rê chuột không hủy khóa; chỉ mất
      // dấu khi drone ra khỏi tầm nhìn (updateMissileAirAim). Thôi khóa: F / Tab / nhấp chỗ khác
      if (msl && A.kind === 'drone') { A.hard = true; A.msl = true; }
      if (A.kind === 'drone') {
        const d = Math.round(Math.hypot(A.dr.x - P.x, A.dr.y - (P.y || 0), A.dr.z - P.z));
        const R = P.ewActive && this.jamRange ? this.jamRange() : 0;
        if (!msl && P.mainGun && P.mainGun.kind === 'rocket') this.addCombatLog(`[[lock]] ĐÃ KHÓA DRONE ĐỊCH // CỰ LY ${d}M — máy tính hỏa lực tự đón đầu & ngóc giàn. Giữ Space phóng loạt rocket (nổ cận đích ~1 m quanh drone, tự hủy ở ~900)`, 'tip');
        else if (msl) this.addCombatLog(`[[lock]] KÍNH NGẮM KHÓA DRONE ĐỊCH // CỰ LY ${d}M${d > C.MSL.lockR ? ' (ngoài tầm bám ~' + C.MSL.lockR + 'M — chờ nó tới gần)' : ''} — tháp tự bám, chiếu tia dẫn. Bám xong bấm Space phóng`, 'tip');
        else this.addCombatLog(R
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
        for (let k = 0; k < 3; k++) {
          const r = this.simBulletAt(rp, az, el, hd);
          if (!r) break;
          el += Math.atan2(dy - r.y, hd) * 180 / Math.PI;
          tSim = r.t; travel = r.travel;
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
      // rocket giàn: động cơ còn cháy (burnTravel) thì bù cản & phần lớn trọng lực — như rocket thật (integrateFlight)
      p.x = 0; p.y = 0; p.z = 0; p.k = rp.k; p.g = rp.g; p.burnTravel = rp.burnTravel || 0; p.travel = 0;
      p.vx = rp.v0 * Math.cos(e) * ca; p.vy = rp.v0 * Math.sin(e); p.vz = rp.v0 * Math.cos(e) * cz;
      const h = 1 / 90;
      let t = 0, prevH = 0, prevY = 0, travel = 0;
      // đủ bước cho đạn tới hết đời bay (lifeTravel) — trước đây 400 bước (~4.4 s mô phỏng): đạn 12.7 chưa tới ~900 đv đã hết
      // bước -> không có nghiệm, súng chĩa thẳng vào drone không bù đạn rơi (ở 1000 đv đạn đi thấp hơn drone ~30 đv)
      for (let i = 0; i < 1600; i++) {
        const x0 = p.x, y0 = p.y, z0 = p.z;
        B.integrateFlight(p, h);
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
        t += h;
        travel += Math.hypot(p.x - x0, p.y - y0, p.z - z0);
        p.travel = travel;
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
      // (đổi sang súng phóng lựu / giàn rocket giữa chừng: không bắn drone được nữa -> thôi khóa)
      if (!A || !P || P.isDead || !this.canShootAir(P) || (this.airAimAllowed && !this.airAimAllowed(P) && !P.ewActive)) { this._airAim = null; return false; }
      if (manual) { this.clearAirAim(); return false; }
      // xe tăng cầm máy phá sóng: không có đạn — đầu phát tự chĩa vào drone (ew_jammer.js), tháp & pháo chính đứng yên
      if (P.tankType === 'ALL_ROUNDER' && P.ewActive) return this.updateJamAirAim(P, A);
      // xe trinh sát chọn tên lửa: kính ngắm chĩa thẳng vào drone (tia dẫn), không tính bắn đón cho đạn súng
      if (P.tankType === 'SCOUT' && P.selectedAmmo === 'ANTI_TANK_MISSILE') {
        if (A.kind !== 'drone') { this.clearAirAim(); return false; }
        return this.updateMissileAirAim(P, A, dt);
      }
      A.msl = false;
      const B = this.ballistics;
      const tank = P.tankType === 'ALL_ROUNDER';   // xe tăng: trạm súng máy trên nóc tháp, pháo chính không ngóc lên
      const ammo = tank ? 'MG762' : P.selectedAmmo === 'INCENDIARY' ? 'INCENDIARY' : (P.tankType === 'SCOUT' ? 'SCOUT_BULLET' : 'GATLING_BULLET');
      const elMax = this.airElMax(P);
      let az = A.az, el = A.el;
      if (A.kind === 'drone') {
        const dr = A.dr;
        if (!this.droneIsAirborne(dr) || !dr.seen) { this.clearAirAim('[[radar-2]] MẤT DẤU DRONE ĐỊCH — đã hủy khóa'); return false; }
        A.solT -= dt;
        if (A.solT <= 0 || !A.sol) {
          A.solT = 0.05;   // (0.1 s: drone bay ngang dịch ~10 đv giữa 2 lần tính -> loạt đạn trễ sau đuôi drone)
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

    /**
     * Khóa drone bằng tên lửa (dẫn theo tia laser): tháp tự xoay / ngóc kính thẳng vào drone (không đón đầu — điểm đón đầu
     * do máy tính trên xe truyền cho tên lửa khi bay). state: 'track' tia nằm trên drone · 'far' ngoài tầm bộ bám ·
     * 'high' quá góc ngóc của bệ · los: không bị địa hình che. Người chơi tự quay tháp -> hủy khóa (mất tia)
     */
    updateMissileAirAim(P, A, dt) {
      const dr = A.dr;
      if (!this.droneIsAirborne(dr) || !dr.seen) { this.clearAirAim('[[radar-2]] MẤT DẤU DRONE ĐỊCH — đã hủy khóa'); return false; }
      const m = this.aaMuzzle(P).position;
      const dx = dr.x - m.x, dy = dr.y + C.CENTER_Y - m.y, dz = dr.z - m.z, hd = Math.max(1, Math.hypot(dx, dz));
      const dist = Math.hypot(hd, dy);
      if (dist > C.MSL.dropR) { this.clearAirAim('[[alert-triangle]] Drone địch đã ra quá xa tầm bám tên lửa — đã hủy khóa'); return false; }
      const az = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, elRaw = Math.atan2(dy, hd) * 180 / Math.PI;
      const elMax = this.airElMax(P), el = Math.max(-5, Math.min(elMax, elRaw));
      if (P.aimTo) P.aimTo(az, el); else { P.aimAz = az; P.aimEl = el; }
      A.msl = true;
      A.dist = dist;
      A.lead = null;
      A.sol = null;
      A.los = this.droneInSight(m.x, m.y, m.z, dr);
      A.state = elRaw > elMax ? 'high' : dist > C.MSL.lockR ? 'far' : 'track';
      // MẤT DẤU chỉ khi drone ra khỏi tầm nhìn của kính: khuất sau địa hình / bay vượt góc ngóc của bệ quá ~1 s
      A.lostT = A.los && A.state !== 'high' ? 0 : (A.lostT || 0) + (dt || 0);
      if (A.lostT > C.MSL.lostT) {
        this.clearAirAim(A.state === 'high' ? '[[radar-2]] Drone vượt góc ngóc của bệ — ra khỏi tầm kính, mất dấu' : '[[radar-2]] Drone khuất sau địa hình — kính mất dấu, đã hủy khóa');
        return false;
      }
      const d = this.aaMuzzle(P).direction;
      const baz = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360, bel = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
      A.on = Math.abs(((baz - az + 540) % 360) - 180) < C.MSL.aimTol && Math.abs(bel - el) < C.MSL.aimTol;
      A.barrelEl = bel;
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
      // đầu phát trên bệ xoay riêng tự bám drone (ew_jammer.js) — tháp & pháo chính đứng yên, không quay theo
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
      // bệ tên lửa đột nóc: quay về hướng mục tiêu, ngóc sẵn góc phóng (tên lửa tự vồng lên, không ngắm thẳng); bấm Space
      // phóng từng quả qua game.triggerRoofMissile, không giữ cò
      if (P.roofWeapon === 'atgm') {
        if (tgt) az = (Math.atan2(tgt[0] - P.x, -(tgt[2] - P.z)) * 180 / Math.PI + 360) % 360;
        P._aa = { az, el: R.launchEl, firing: false, until: performance.now() / 1000 + 0.3 };
        return;
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
      let col = A.state === 'high' || A.state === 'far' ? '#ff5a4a' : A.on ? '#5cf08a' : '#ffb020';
      let txt = 'DRONE ĐỊCH · ' + Math.round(A.dist || 0) + ' M · ' + (A.state === 'high' ? 'QUÁ CAO — LÙI XE RA XA'
        : A.state === 'far' ? 'NGOÀI TẦM SÚNG' : A.on ? 'ĐÃ NGẮM TRÚNG' : 'ĐANG XOAY THÁP') + (this._droneHitMark > 0 ? ' · TRÚNG!' : '');
      if (A.msl) {
        // tên lửa: xanh = đã bám / đang dẫn, vàng nhấp nháy = bộ bám đang bắt, xám = mất tia (khuất / quá cao / ngoài tầm)
        const S = this._seeker || { state: 'none', p: 0 }, guiding = this.airMissileGuiding();
        const lost = A.state !== 'track' || !A.los;
        const st = A.state === 'high' ? 'QUÁ CAO — MẤT TIA' : A.state === 'far' ? 'NGOÀI TẦM BÁM ~' + C.MSL.lockR + ' M' : !A.los ? 'KHUẤT TẦM NHÌN'
          : guiding ? 'ĐANG DẪN TÊN LỬA' : S.state === 'locked' ? 'ĐÃ BÁM · SPACE PHÓNG' : S.state === 'seeking' ? 'ĐANG BÁM ' + Math.round(S.p * 100) + '%' : 'ĐANG XOAY THÁP';
        col = lost ? '#8a96a3' : guiding || S.state === 'locked' ? '#5cf08a' : (Math.sin(Date.now() * 0.03) > 0 ? '#ffd166' : '#c9822a');
        txt = 'DRONE ĐỊCH · ' + Math.round(A.dist || 0) + ' M · ' + st;
      }
      if (el._c !== col) { el._c = col; el.style.setProperty('--ac', col); }
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
