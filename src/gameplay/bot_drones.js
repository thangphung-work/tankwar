/**
 * DRONE CỦA BOT PHÁO TỰ HÀNH (chơi đơn / máy chủ phòng chạy bot) — trước đây drone của bot luôn đậu trên nóc cabin, trên
 * trời không bao giờ có drone địch khi chơi với bot.
 *
 *  - UAV TRINH SÁT: đậu sạc trên đế -> cất cánh -> bay ra vùng có địch (xe địch phe mình đã biết; chưa biết thì bay dò về
 *    phía địch), giữ khoảng cách, lượn vòng quan sát ở ~40-48 m trên mặt đất. Drone đang bay tự soi xe địch bên dưới cho cả
 *    phe (TeamIntel.droneSees) -> có ích thật, đáng bị bắn hạ. Pin yếu / thân hỏng nặng thì bay về đáp sạc. Bị bắn trúng:
 *    né (đổi hướng + độ cao đột ngột vài giây) và lùi ra xa kẻ bắn.
 *  - UAV CẢM TỬ (bot lắp ô UAV 'kami' — Equipment.botKit): có xe địch đã lộ trong tầm thì phóng khỏi ống, bay bằng tới gần,
 *    mục tiêu nằm dưới góc bổ nhào thì chúc đầu lao xuống đón đầu xe đang chạy; chạm hộp thân xe / đất là kích nổ ĐÚNG như
 *    UAV cảm tử của người chơi (KamiUAV.fireWarhead: một viên đạn đầu nổ thật). Hết nhiên liệu thì lượn rơi, chạm đất nổ.
 *  - Bị bắn hạ: sát thương trừ ngay trên máy chạy bot (dr.onHit); máy khác bắn trúng thì gửi DRONE_HIT về máy này
 *    (drone_air onNetDroneHit). Rơi / nổ trên trời như drone người chơi, báo các máy bằng DRONE_DOWN.
 *  - Mạng: máy chạy bot gửi trạng thái drone của từng bot (gói DRONE như drone người chơi) — máy khác thấy bay & bắn được.
 * Gọi từ DroneAir.updateOtherDrones (drone_air.js) cho mỗi xe pháo bot mà máy này có chủ quyền.
 */
const BotDrones = (() => {
  const BD = {
    firstDelay: [8, 22],   // giây sau khi vào trận / hồi sinh mới cất cánh lần đầu
    relaunch: [12, 30],    // nghỉ trên đế sau khi đáp (vẫn sạc) rồi mới bay lại
    minBatt: 0.6,          // pin tối thiểu để bot cho cất cánh (người chơi: 20%)
    alt: [300, 380],       // độ cao bay trên mặt đất (đv) — ngoài tầm mắt thường soi rõ, vẫn trong tầm súng máy / 6 nòng
    minAlt: 140,           // không xuống thấp hơn mức này trên mặt đất ngay dưới drone
    cruise: 150,           // tốc độ bay đường dài (đv/s) — người chơi lái 105, Shift 240
    accel: 110,            // gia tốc tối đa (đv/s²)
    loiterR: [140, 220], loiterV: 80,   // lượn vòng quan sát: bán kính / tốc độ
    standoff: [280, 480],  // điểm quan sát cách xe địch (về phía mình) — không treo ngay trên đầu địch
    repick: [14, 24],      // chọn lại vùng quan sát
    jinkT: 2.6, jinkV: 120, // bị bắn trúng: né lệch hướng + đổi độ cao trong bấy nhiêu giây
    retreatHp: 0.45,       // thân còn dưới mức này thì bay về
    kamiR: 2200,           // UAV cảm tử: chỉ phóng khi có xe địch đã lộ trong bán kính này
    kamiWait: [6, 16],     // nghỉ sau khi nạp quả mới / vào trận rồi mới phóng
    kamiAlt: 220,          // độ cao bay bằng trên mặt đất trước khi bổ nhào
    sendFly: 0.1, sendIdle: 1.0
  };
  const nowS = () => performance.now() / 1000;
  const rr = (a) => a[0] + Math.random() * (a[1] - a[0]);
  const airborne = (st) => st === 'launching' || st === 'flying' || st === 'returning';
  const ST = ['docked', 'launching', 'flying', 'returning', 'lost'];   // khớp drone_air.js ST (mã trạng thái gói DRONE)
  const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  const methods = {
    /** Drone của xe u do máy này lái theo AI: u là bot (không phải xe người chơi) và máy này có chủ quyền với xe */
    botDroneAuth(u) {
      if (!u || u === this.player || !u.botAI || u.tankType !== 'ARTILLERY') return false;
      const NS = this.netSync && !this.netSync.detached ? this.netSync : null;
      return !NS || NS.owns(u);
    },

    // đế sạc trên nóc cabin xe bot (tọa độ thế giới)
    botPadWorld(u) {
      const ch = u.chassisGroup, v = this._bdPadV || (this._bdPadV = new THREE.Vector3());
      if (ch && typeof ReconDrone !== 'undefined') {
        ch.updateWorldMatrix(true, false);
        v.set(ReconDrone.PAD.x, ReconDrone.PAD.y, ReconDrone.PAD.z);
        ch.localToWorld(v);
        return { x: v.x, y: v.y, z: v.z };
      }
      return { x: u.x, y: (u.y || 0) + 24, z: u.z };
    },

    // xe địch mà phe của bot đang biết vị trí (tầm nhìn / radar / drone / đồng đội báo), gần điểm (x, z) nhất
    botKnownEnemy(u, x, z, maxR) {
      let best = null, bd = maxR || Infinity;
      for (const e of this.units) {
        if (!e || e.isDead || e.team === u.team) continue;
        if (typeof TeamIntel !== 'undefined' && !TeamIntel.knows(u, e)) continue;
        const d = Math.hypot(e.x - x, e.z - z);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    // xe địch gần nhất (không cần biết vị trí): chỉ để chọn HƯỚNG bay dò khi phe chưa thấy ai
    botNearestEnemy(u) {
      let best = null, bd = Infinity;
      for (const e of this.units) {
        if (!e || e.isDead || e.team === u.team) continue;
        const d = Math.hypot(e.x - u.x, e.z - u.z);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    /** Mỗi khung hình cho drone R của xe pháo bot u (máy này có chủ quyền) */
    updateBotDrone(R, u, dt) {
      if (!(dt > 0)) return;
      const B = R.bot || (R.bot = { batt: 1, wait: rr(BD.firstDelay), vx: 0, vy: 0, vz: 0, sendAcc: 0, sentCode: -1, reloadT: 0, fuel: 1 });
      const kami = u.uavKind === 'kami' && typeof KamiUAV !== 'undefined';
      if (!R.onHit) R.onHit = (dmg, by) => this.botDroneHurt(u, dmg, by);
      R.team = u.team;
      if (u.isDead) {
        // xe bị hạ: drone mất liên lạc rơi; hồi sinh nhận drone mới
        if (airborne(R.state)) this.botDroneDown(u, null, 'link');
        B.respawn = true;
        this.botDroneSend(R, u, dt);
        return;
      }
      if (B.respawn) {
        B.respawn = false;
        R.state = kami && (u.kamikazeCount || 0) <= 0 ? 'lost' : 'docked';
        R.hp = 1; B.batt = 1; B.fuel = 1; B.wait = rr(kami ? BD.kamiWait : BD.firstDelay); B.reloadT = 0;
        B.spare = ArtilleryGame3D.DRONE.spare; B.prepT = 0;
      }
      if (kami) this.botKamiStep(R, u, dt, B);
      else this.botReconStep(R, u, dt, B);
      this.botDroneSend(R, u, dt);
    },

    // ---------- UAV TRINH SÁT ----------
    botReconStep(R, u, dt, B) {
      const C = ArtilleryGame3D.DRONE, T = this.terrain;
      const ground = (x, z) => (T ? T.getElevationAt(x, z) : 0);
      if (R.state === 'lost') {
        // bị bắn hạ: lắp drone dự phòng (cùng luật người chơi — game.js DRONE.spare); hết thì chờ xe hồi sinh
        if (B.spare === undefined) B.spare = C.spare;
        if (B.spare > 0) {
          if (!(B.prepT > 0)) B.prepT = C.sparePrep;
          if ((B.prepT -= dt) <= 0) { B.spare--; B.prepT = 0; R.state = 'docked'; R.hp = 1; B.batt = C.spareBatt; B.wait = rr(BD.firstDelay); }
        }
        return;
      }
      const pd = this.botPadWorld(u);
      if (R.state === 'docked') {
        B.batt = Math.min(1, B.batt + dt / C.charge * (u.dmg && u.dmg.lost && u.dmg.lost.has('generator') ? 0.5 : 1));
        R.hp = 1;
        if ((B.wait -= dt) > 0 || B.batt < BD.minBatt || !this.botNearestEnemy(u)) return;
        R.state = 'launching'; B.t = 0; B.vx = B.vy = B.vz = 0;
        R.x = pd.x; R.y = pd.y; R.z = pd.z; R.yaw = u.bodyAngle || 0;
        B.alt = rr(BD.alt); B.goal = null; B.repick = 0;
        return;
      }
      if (R.state === 'launching') {
        // bốc thẳng lên ~35 đv khỏi đế như drone người chơi rồi mới bay đi
        B.t += dt;
        const k = Math.min(1, Math.max(0, (B.t - 0.5) / 0.75));
        R.x = pd.x; R.z = pd.z; R.y = pd.y + k * k * (3 - 2 * k) * 35;
        B.batt = Math.max(0, B.batt - dt / C.flight);
        if (B.t >= 1.3) { R.state = 'flying'; B.vx = B.vz = 0; B.vy = 40; }
        return;
      }
      const sp = Math.hypot(B.vx, B.vz);
      B.batt = Math.max(0, B.batt - dt / C.flight * Math.min(1.6, 1 + sp / 1200));
      const home = Math.hypot(R.x - pd.x, R.z - pd.z);
      // pin dự phòng đủ bay về (tốc độ bay về ~0,8 rthSpeed, chậm dần khi tới gần) + hạ từ độ cao bay xuống đế (~50 đv/s,
      // hãm dần sát đế) + 10 s dư — chỉ tính quãng ngang thì cạn pin lúc đang hạ ngay trên xe
      const reserve = (home / (C.rthSpeed * 0.6) + Math.max(0, R.y - pd.y) / 50 + 10) / C.flight;
      if (R.state === 'flying' && (B.batt <= reserve || (R.hp !== undefined && R.hp < BD.retreatHp))) R.state = 'returning';
      let tx, ty, tz, vmax;
      if (R.state === 'returning') {
        tx = pd.x; tz = pd.z; vmax = Math.min(C.rthSpeed * 0.8, Math.max(20, home * 1.4));
        ty = home > 60 ? Math.max(ground(R.x, R.z) + BD.minAlt, pd.y + 40) : pd.y;
        if (home < 4 && R.y - pd.y < 1.5) { R.state = 'docked'; B.wait = rr(BD.relaunch); B.vx = B.vy = B.vz = 0; R.x = pd.x; R.y = pd.y; R.z = pd.z; return; }
      } else {
        // chọn vùng quan sát: xe địch phe mình đã biết (gần drone nhất) -> điểm cách nó standoff về phía mình, lệch ngang;
        // chưa biết ai thì bay dò về hướng địch gần nhất (dừng ở nửa đường, quét rộng)
        if (!B.goal || (B.repick -= dt) <= 0) {
          B.repick = rr(BD.repick);
          const E = this.botKnownEnemy(u, R.x, R.z, 3200), N = E || this.botNearestEnemy(u);
          if (N) {
            const dx = u.x - N.x, dz = u.z - N.z, d = Math.max(1, Math.hypot(dx, dz));
            const so = E ? rr(BD.standoff) : d * 0.45, lat = (Math.random() - 0.5) * (E ? 300 : 600);
            B.goal = { x: N.x + dx / d * so - dz / d * lat, z: N.z + dz / d * so + dx / d * lat };
          } else B.goal = { x: u.x, z: u.z };
          B.orbR = rr(BD.loiterR); B.orbA = Math.atan2(R.z - B.goal.z, R.x - B.goal.x); B.orbDir = Math.random() < 0.5 ? -1 : 1;
        }
        const g = B.goal, dg = Math.hypot(R.x - g.x, R.z - g.z);
        if (dg > B.orbR * 1.6) { tx = g.x; tz = g.z; vmax = BD.cruise; }
        else {
          B.orbA += B.orbDir * BD.loiterV / B.orbR * dt;
          tx = g.x + Math.cos(B.orbA) * B.orbR; tz = g.z + Math.sin(B.orbA) * B.orbR; vmax = BD.loiterV * 1.3;
        }
        ty = Math.max(ground(tx, tz), ground(R.x, R.z)) + B.alt;
      }
      // bị bắn trúng: né — giật lệch ngang + đổi độ cao, lùi khỏi kẻ bắn
      if (B.jink > 0) {
        B.jink -= dt;
        const J = B.jinkDir;
        tx = R.x + J.x * 200; tz = R.z + J.z * 200; ty = R.y + J.y * 80; vmax = Math.max(vmax, BD.jinkV);
      }
      ty = Math.max(ty, R.state === 'returning' && home < 60 ? pd.y : ground(R.x, R.z) + BD.minAlt);
      // lái: vận tốc mong muốn về điểm đích (chậm dần khi tới gần), gia tốc có giới hạn -> bay trơn, đón đầu được
      const dx = tx - R.x, dz = tz - R.z, dh = Math.hypot(dx, dz);
      const want = Math.min(vmax, R.state === 'returning' ? vmax : dh * 1.2 + 10);
      const wvx = dh > 0.01 ? dx / dh * want : 0, wvz = dh > 0.01 ? dz / dh * want : 0;
      const wvy = Math.max(-70, Math.min(70, (ty - R.y) * 1.4));
      const ax = wvx - B.vx, ay = wvy - B.vy, az = wvz - B.vz, al = Math.hypot(ax, ay, az), cap = BD.accel * dt;
      const k = al > cap ? cap / al : 1;
      B.vx += ax * k; B.vy += ay * k; B.vz += az * k;
      R.x += B.vx * dt; R.y += B.vy * dt; R.z += B.vz * dt;
      if (Math.hypot(B.vx, B.vz) > 8) R.yaw = Math.atan2(-B.vx, -B.vz);
      if (B.batt <= 0 && R.state !== 'docked') this.botDroneDown(u, null, 'batt');   // cạn pin giữa trời: rơi
    },

    // ---------- UAV CẢM TỬ ----------
    botKamiStep(R, u, dt, B) {
      const KC = KamiUAV.C, T = this.terrain;
      const ground = (x, z) => (T ? T.getElevationAt(x, z) : 0);
      const rackLost = !!(u.dmg && u.dmg.lost && u.dmg.lost.has('kamiRack'));
      // nắp nhựa đầu ống: lắp lại khi ống có quả (bật văng lúc phóng — kamiEjectFx)
      const cap = u.kamiRack && u.kamiRack.caps && u.kamiRack.caps[0];
      if (cap) cap.visible = R.state === 'docked';
      if (R.state === 'lost') {
        // nạp quả mới vào ống sau mỗi lần phóng (còn vật tư, ống còn nguyên)
        if ((B.reloadT -= dt) <= 0 && (u.kamikazeCount || 0) > 0 && !rackLost) { R.state = 'docked'; B.wait = rr(BD.kamiWait); }
        return;
      }
      if (R.state === 'docked') {
        const tube = this.kamiTubeWorld ? this.kamiTubeWorld(u) : null;
        if (tube) { R.x = tube.pos.x; R.y = tube.pos.y; R.z = tube.pos.z; }
        if ((B.wait -= dt) > 0 || rackLost || (u.kamikazeCount || 0) <= 0 || !tube) return;
        const tgt = this.botKnownEnemy(u, u.x, u.z, BD.kamiR);
        if (!tgt) { B.wait = 1 + Math.random(); return; }
        // phóng: khí nén đẩy khỏi ống theo hướng ống, ~0,3 s sau động cơ tên lửa đánh lửa
        u.kamikazeCount--;
        B.tgt = tgt; B.fuel = 1; B.t = 0; B.dive = false; B.lostT = 0; B.warned = false;
        R.state = 'launching'; R.hp = 1;
        R.x = tube.pos.x; R.y = tube.pos.y; R.z = tube.pos.z;
        B.vx = tube.dir.x * KC.ejectV; B.vy = tube.dir.y * KC.ejectV; B.vz = tube.dir.z * KC.ejectV;
        R.yaw = Math.atan2(-tube.dir.x, -tube.dir.z);
        if (this.kamiEjectFx) { try { this.kamiEjectFx(u, tube); } catch (e) { /* hiệu ứng phụ */ } }
        const SE = window.soundEngine, P = this.player;
        if (SE && P) { const d = Math.hypot(P.x - u.x, P.z - u.z); if (d < 1400) { if (SE.playKamiLaunch) SE.playKamiLaunch(d, { x: u.x, z: u.z }); else if (SE.playRocketLaunch) SE.playRocketLaunch(d, { x: u.x, z: u.z }); } }
        return;
      }
      B.t += dt;
      const px = R.x, py = R.y, pz = R.z;
      // nhiên liệu
      B.fuel = Math.max(0, B.fuel - dt / KC.fuel * (B.dive ? KC.boostBurn : 1));
      // mục tiêu: còn sống & phe còn biết vị trí; mất dấu > 4 s thì đổi mục tiêu đã lộ gần nhất, không còn ai thì lượn chờ
      let tgt = B.tgt;
      if (tgt && !tgt.isDead && (typeof TeamIntel === 'undefined' || TeamIntel.knows(u, tgt))) B.lostT = 0;
      else if ((B.lostT += dt) > 4 || !tgt || tgt.isDead) { tgt = B.tgt = this.botKnownEnemy(u, R.x, R.z, 3000); B.lostT = 0; }
      let wx, wy, wz, sp;
      if (B.fuel <= 0) {
        // hết nhiên liệu: mất lực đẩy, lượn chúc dần rồi đâm xuống đất nổ
        B.vy -= 40 * dt; wx = B.vx; wz = B.vz; sp = Math.hypot(B.vx, B.vz);
      } else if (R.state === 'launching' && B.t < 0.6) {
        B.vy -= 40 * dt;   // khí nén đẩy ra, chưa có lực đẩy
      } else {
        if (R.state === 'launching') R.state = 'flying';
        const gy = ground(R.x, R.z);
        if (tgt) {
          // đón đầu xe đang chạy theo thời gian bay còn lại (tối đa attackLead s)
          const ty0 = (tgt.y || 0) + 6, h = Math.hypot(tgt.x - R.x, tgt.z - R.z), dy = R.y - ty0;
          const v = B.dive ? KC.maxV * 0.85 : KC.cruise;
          const eta = Math.min(KC.attackLead, Math.hypot(h, dy) / v);
          const tvx = tgt.vx !== undefined ? tgt.vx : -Math.sin(tgt.bodyAngle || 0) * (tgt.speed || 0);
          const tvz = tgt.vz !== undefined ? tgt.vz : -Math.cos(tgt.bodyAngle || 0) * (tgt.speed || 0);
          const lx = tgt.x + tvx * eta, lz = tgt.z + tvz * eta;
          if (!B.dive && Math.atan2(dy, Math.max(1, h)) > KC.diveLos) B.dive = true;
          if (B.dive) {
            const ddx = lx - R.x, ddy = ty0 - R.y, ddz = lz - R.z, dl = Math.max(1, Math.hypot(ddx, ddy, ddz));
            wx = ddx / dl; wy = ddy / dl; wz = ddz / dl; sp = v;
            if (!B.warned && tgt === this.player) {
              B.warned = true;
              this.addCombatLog(`[[alert-triangle]] UAV CẢM TỬ CỦA ${u.name} ĐANG BỔ NHÀO VÀO XE BẠN!`, 'alert');
            }
          } else {
            const ddx = lx - R.x, ddz = lz - R.z, dl = Math.max(1, Math.hypot(ddx, ddz));
            const wantY = Math.max(gy + BD.kamiAlt, ty0 + 120);
            wx = ddx / dl; wz = ddz / dl; wy = Math.max(-0.5, Math.min(0.6, (wantY - R.y) / 120)); sp = KC.cruise;
            const n = Math.hypot(wx, wy, wz); wx /= n; wy /= n; wz /= n;
          }
        } else {
          // không còn mục tiêu: lượn vòng chờ tại chỗ
          B.loitA = (B.loitA || 0) + dt * KC.cruise / KC.loiterR;
          wx = -Math.sin(B.loitA); wz = Math.cos(B.loitA); wy = Math.max(-0.4, Math.min(0.4, (gy + BD.kamiAlt - R.y) / 120)); sp = KC.cruise;
          const n = Math.hypot(wx, wy, wz); wx /= n; wy /= n; wz /= n;
        }
        // bẻ hướng có giới hạn (cánh lái): quay vận tốc hiện tại về hướng mong muốn với tốc độ góc tối đa
        const cv = Math.max(1, Math.hypot(B.vx, B.vy, B.vz));
        let ux = B.vx / cv, uy = B.vy / cv, uz = B.vz / cv;
        const dot = Math.max(-1, Math.min(1, ux * wx + uy * wy + uz * wz)), ang = Math.acos(dot), maxA = (B.dive ? KC.attackTurn : KC.turn) * dt;
        if (ang > 1e-4) { const k = Math.min(1, maxA / ang); ux += (wx - ux) * k; uy += (wy - uy) * k; uz += (wz - uz) * k; const n = Math.hypot(ux, uy, uz); ux /= n; uy /= n; uz /= n; }
        const nv = cv + (sp - cv) * Math.min(1, dt * 1.6);
        B.vx = ux * nv; B.vy = uy * nv; B.vz = uz * nv;
      }
      R.x += B.vx * dt; R.y += B.vy * dt; R.z += B.vz * dt;
      if (Math.hypot(B.vx, B.vz) > 5) R.yaw = Math.atan2(-B.vx, -B.vz);
      // chạm hộp thân xe (mọi xe trừ chính mình — UAV không phân biệt phe khi đâm) -> kích nổ đúng điểm chạm
      const SB = typeof Strongholds !== 'undefined' && Strongholds.segUnitBox;
      let hit = null, bt = 2;
      if (SB) {
        for (const e of this.units) {
          if (e === u || e.isDead || Math.hypot(e.x - R.x, e.z - R.z) > 120) continue;
          const t = SB(e, px, py, pz, R.x, R.y, R.z, KC.hitPad);
          if (t >= 0 && t < bt) { bt = t; hit = { u: e, x: px + (R.x - px) * t, y: py + (R.y - py) * t, z: pz + (R.z - pz) * t }; }
        }
      }
      const gy = ground(R.x, R.z);
      if (hit || R.y <= gy + 0.5) {
        const at = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : new THREE.Vector3(R.x, gy + 0.5, R.z);
        const vl = Math.max(1, Math.hypot(B.vx, B.vy, B.vz));
        const dir = new THREE.Vector3(B.vx / vl, B.vy / vl, B.vz / vl);
        if (this.ballistics && KamiUAV.fireWarhead) KamiUAV.fireWarhead(this.ballistics, u, at, dir, null);
        R.state = 'lost'; B.reloadT = KC.reload; B.dive = false;
        if (R.model) R.model.visible = false;
        B.sendAcc = 99;
      }
    },

    // ---------- BỊ BẮN / RƠI ----------
    /** Trừ thân drone của bot (máy này có chủ quyền): né đạn, hỏng nặng thì rơi */
    botDroneHurt(u, dmg, by) {
      const R = this.otherDrone(u), B = R.bot;
      if (!B || !airborne(R.state) || !(dmg > 0)) return;
      R.hp = Math.max(0, (R.hp === undefined ? 1 : R.hp) - dmg);
      if (R.hp <= 0) { this.botDroneDown(u, by); return; }
      // né: lệch ngang so với hướng tới kẻ bắn + đổi độ cao
      if (u.uavKind !== 'kami') {
        let ax = by ? R.x - by.x : (Math.random() - 0.5), az = by ? R.z - by.z : (Math.random() - 0.5);
        const al = Math.max(1e-3, Math.hypot(ax, az)); ax /= al; az /= al;
        const side = Math.random() < 0.5 ? -1 : 1;
        B.jinkDir = { x: ax * 0.6 - az * side * 0.8, z: az * 0.6 + ax * side * 0.8, y: Math.random() < 0.5 ? -1 : 1 };
        B.jink = BD.jinkT;
        B.goal = null;   // né xong chọn vùng quan sát khác
      }
      B.sendAcc = 99;
    },

    /** Drone / UAV cảm tử của bot rơi: bị bắn hạ (by), mất liên lạc khi xe bị hạ ('link'), cạn pin ('batt') */
    botDroneDown(u, by, why) {
      const R = this.otherDrone(u), B = R.bot || {};
      if (!airborne(R.state)) return;
      const kami = u.uavKind === 'kami' && typeof KamiUAV !== 'undefined';
      const x = R.x, y = R.y, z = R.z, vx = B.vx || R.wvx || 0, vz = B.vz || R.wvz || 0;
      R.state = 'lost'; R.hp = 0; R.fell = true;
      if (kami) { B.reloadT = KamiUAV.C.reload; if (this.kamiAirBurst) this.kamiAirBurst(u.team, x, y, z, vx, B.vy || 0, vz, R.yaw || 0, false); }
      else if (this.startDroneFall) this.startDroneFall(u.team, x, y, z, vx, vz, R.yaw || 0, false);
      if (R.model) R.model.visible = false;
      if (this._airAim && this._airAim.dr === R && this.clearAirAim) this.clearAirAim();
      const P = this.player;
      if (by && P) {
        if (by === P) {
          this.addCombatLog(kami ? `[[target-arrow]] ĐÃ BẮN HẠ UAV CẢM TỬ CỦA ${u.name}!` : `[[target-arrow]] ĐÃ BẮN HẠ DRONE TRINH SÁT CỦA ${u.name}! Pháo địch mất mắt ngắm`, 'tip');
          if (window.soundEngine && window.soundEngine.playTargetLockSound) window.soundEngine.playTargetLockSound();
        } else if (u.team === P.team || by.team === P.team) {
          this.addCombatLog(`[[alert-triangle]] ${by.name} đã bắn hạ ${kami ? 'UAV cảm tử' : 'drone trinh sát'} của ${u.name}`, u.team === P.team ? 'alert' : 'tip');
        }
      }
      const NS = this.netSync;
      if (NS && !NS.detached && u.netId !== undefined) {
        NS.net.send('DRONE_DOWN', { o: u.netId, a: by && by.netId !== undefined ? by.netId : -1,
          p: [Math.round(x * 10), Math.round(y * 10), Math.round(z * 10)], v: [Math.round(vx * 10), Math.round(vz * 10)], up: 1 });
      }
      B.sendAcc = 99;
    },

    // gói DRONE cho máy khác (cùng định dạng drone người chơi — drone_air sendDroneState / onNetDrone)
    botDroneSend(R, u, dt) {
      const NS = this.netSync, B = R.bot;
      if (!NS || NS.detached || u.netId === undefined || !B) return;
      const code = Math.max(0, ST.indexOf(R.state)), up = airborne(R.state), per = up ? BD.sendFly : BD.sendIdle;
      B.sendAcc += dt;
      if (B.sentCode === code && B.sendAcc < per) return;
      B.sendAcc = B.sentCode === code && B.sendAcc < per * 2 ? B.sendAcc - per : 0;
      B.sentCode = code;
      const m = { i: u.netId, s: code, h: Math.round(Math.max(0, R.hp === undefined ? 1 : R.hp) * 100) };
      if (up) {
        m.x = Math.round(R.x * 10); m.y = Math.round(R.y * 10); m.z = Math.round(R.z * 10); m.w = Math.round(wrapPi(R.yaw || 0) * 100);
        if (NS.net.clockSynced && NS.net.now) m.t = Math.round(NS.net.now());
      }
      NS.net.send('DRONE', m);
    }
  };

  return { BD, methods };
})();

if (typeof window !== 'undefined') {
  window.BotDrones = BotDrones;
  if (typeof ArtilleryGame3D !== 'undefined') Object.assign(ArtilleryGame3D.prototype, BotDrones.methods);
}
