/**
 * Module Trí Tuệ Nhân Tạo Xe Tăng Chiến Đấu (Tactical Tank Bot AI)
 * - Tự động ra quyết định di chuyển: Chạy bo, né đạn pháo, chiếm cứ điểm A/B/C, nhặt hòm tiếp tế
 * - Giải thuật ngắm bắn đường đạn: Tính toán góc ngắm và cự ly bắn chuẩn xác
 * - Chiến thuật tác chiến theo dòng xe:
 *   + ARTILLERY: Tuyến sau đóng quân cắm chân chống thủy lực bắn chi viện tầm xa, không lao lên xáp lá cà
 *   + SCOUT: Cơ động tốc độ cao ra 2 cánh chiếm cứ điểm A/C, núp bụi rậm bắn tỉa tên lửa chống tăng
 *   + ALL_ROUNDER: Tiên phong dẫn đầu đội hình chiếm cứ điểm B trung tâm
 *   + GATLING: Tuần tra bọc lót sườn, áp sát xả 6 nòng liên thanh
 * - Cơ chế phân tán đội hình: Tự động giữ khoảng cách an toàn 50-70m với đồng đội, không chụm đầu dồn cục
 * - Cơ chế tự động lùi thoát kẹt: Nhận biết khi bị kẹt bờ tường công sự, vào số lùi bẻ lái thoát hiểm
 */
// Xe t vừa phóng khói đa phổ lúc bị khóa: phe team không khóa / ngắm được t cho tới khi khói tan (Equipment.lockBlocked)
const smokeVeiled = (t, team) => typeof Equipment !== 'undefined' && !!Equipment.lockBlocked && Equipment.lockBlocked(t, team);

class BotAIController {
  constructor(unit) {
    this.unit = unit;

    // Cơ chế chống kẹt xe thông minh
    this.stuckTimer = 0;
    this.stuckCount = 0;
    this.reverseSteer = 1;
    this.lastCheckPos = { x: unit.x, z: unit.z };
    this.posCheckTimer = 0;

    // Vị trí đóng quân chiến lược cho pháo tự hành
    this.assignedCampPos = null;

    // SAI SỐ NGẮM CỦA BOT (ngoài độ tản mát của khẩu pháo, người chơi không có phần này):
    // tay nghề mỗi bot khác nhau; mỗi lượt giao chiến bắt đầu với sai số ước lượng cự ly / ngắm / đón đầu,
    // sau mỗi phát (thấy điểm rơi) chỉnh dần về đúng; mục tiêu mới xuất hiện cần một nhịp phản xạ mới bắn
    this.skill = 0.8 + Math.random() * 0.45;
    this.eng = null;          // lượt giao chiến hiện tại { id, n, bAz, bEl (mrad), rangeErr, leadErr, lastAt }
    this.trk = null;          // bám vị trí mục tiêu để ước lượng vận tốc (đón đầu) { id, x, z, vx, vz }
    this.clock = 0;
  }

  // Bắt đầu / tiếp tục lượt giao chiến với xe t (quên sau 15 s không bắn nó)
  engagement(t) {
    const E = this.eng;
    if (E && E.id === t.id && this.clock - E.lastAt < 15) return E;
    const g = () => { const u = Math.max(1e-9, Math.random()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
    const lob = this.unit.tankType === 'ARTILLERY';
    const k = this.skill;
    this.eng = {
      id: t.id, n: 0, lastAt: this.clock, g,
      // lệch ngắm ban đầu (mrad, đã theo tỉ lệ game): ngang / dọc
      bAz: g() * BotAIController.AIM_ERR.az * (lob ? 0.3 : 1) * k,
      bEl: g() * BotAIController.AIM_ERR.el * k,
      // ước lượng sai cự ly (tỉ lệ) và vận tốc mục tiêu khi đón đầu (tỉ lệ)
      rangeErr: g() * BotAIController.AIM_ERR.range * k,
      leadErr: g() * BotAIController.AIM_ERR.lead * k,
      // nhịp phản xạ: thấy mục tiêu mới -> chần chừ một chút mới bóp cò
      react: 0.45 + Math.random() * 0.6 * k
    };
    return this.eng;
  }

  // Sau mỗi phát bắn vào mục tiêu: nhìn điểm rơi, chỉnh sai số về gần đúng (còn lại một phần ngẫu nhiên)
  correctAfterShot(E) {
    if (!E) return;
    const C = BotAIController.AIM_ERR, k = this.skill, j = C.jitter;
    E.n++;
    E.lastAt = this.clock;
    E.bAz = E.bAz * C.keep + E.g() * C.az * j * k * (this.unit.tankType === 'ARTILLERY' ? 0.3 : 1);
    E.bEl = E.bEl * C.keep + E.g() * C.el * j * k;
    E.rangeErr = E.rangeErr * C.keep + E.g() * C.range * j * k;
    // đón đầu: xe địch đổi tốc độ / hướng liên tục -> sai số vận tốc chỉnh được ít hơn
    E.leadErr = E.leadErr * C.keep + E.g() * C.lead * 0.7 * k;
  }

  // Vận tốc mục tiêu bot ước lượng được (đo dịch chuyển mỗi khung hình, lọc mượt ~0.4 s)
  trackTarget(t, dt) {
    if (!t || t.isDead) { this.trk = null; return; }
    const R = this.trk;
    if (!R || R.id !== t.id) { this.trk = { id: t.id, x: t.x, z: t.z, vx: 0, vz: 0 }; return; }
    if (dt > 0) {
      const ivx = (t.x - R.x) / dt, ivz = (t.z - R.z) / dt;
      const k = Math.min(1, dt / 0.4);
      // nhảy vị trí bất thường (hồi sinh / dịch chuyển): bỏ qua
      if (Math.hypot(ivx, ivz) < 400) { R.vx += (ivx - R.vx) * k; R.vz += (ivz - R.vz) * k; }
    }
    R.x = t.x; R.z = t.z;
  }

  /**
   * Giải góc bắn vào xe t với sai số của bot: đón đầu theo vận tốc ước lượng, sai cự ly, lệch ngắm.
   * Trả về { sol, x, z } (điểm ngắm) hoặc null.
   */
  aimAtUnit(t, ballistics, terrain, full = false) {
    const U = this.unit;
    const E = this.engagement(t);
    // dò quanh nghiệm lần trước (góc nòng, liều phóng) cho nhanh — lựu pháo giải quỹ đạo khá nặng
    const solve = (x, z) => ballistics.solveAimingForTarget(U.x, U.y, U.z, x, z, terrain, U,
      { atUnit: true, hintEl: E.solEl, hintCharge: E.solCharge });
    const R = this.trk && this.trk.id === t.id ? this.trk : null;
    const dist = Math.hypot(t.x - U.x, t.z - U.z) || 1;
    const moving = R && Math.hypot(R.vx, R.vz) > 2;
    // thời gian đạn bay: lấy từ nghiệm lần trước nếu có, chưa có thì giải một lần vào vị trí hiện tại
    let sol = null, tf = E.tf;
    if (moving && tf === undefined) {
      sol = solve(t.x, t.z);
      if (!sol) return null;
      tf = Math.min(12, (sol.flightTime || 0) / (ballistics.bulletSpeedMultiplier || 1));
    }
    let px = t.x, pz = t.z;
    if (moving) {
      const L = 1 + E.leadErr;
      px += R.vx * tf * L; pz += R.vz * tf * L;
    }
    // ước lượng cự ly sai: điểm ngắm trượt dọc theo đường nhìn
    const ux = (t.x - U.x) / dist, uz = (t.z - U.z) / dist;
    px += ux * dist * E.rangeErr; pz += uz * dist * E.rangeErr;
    // Ngắm lại giữa chừng (không phải lúc ra quyết định bắn): điểm ngắm mới gần như cùng cự ly với nghiệm trước
    // -> chỉ xoay theo phương vị mới, giữ góc nòng cũ (không giải lại quỹ đạo — đỡ tốn máy khi bám xe đang chạy)
    const bear = (x, z) => Math.atan2(x - U.x, -(z - U.z)) * 180 / Math.PI;
    const L0 = E.last, dNew = Math.hypot(px - U.x, pz - U.z);
    const fresh = L0 && this.clock - L0.at < 0.6;   // nghiệm vừa giải chưa tới 0.6 s: dùng lại kể cả khi cự ly đổi chút ít
    if (!full && !sol && L0 && (fresh || Math.abs(dNew - L0.dist) < Math.max(6, dNew * 0.02)) && Math.hypot(px - L0.px, pz - L0.pz) < dNew * 0.15) {
      sol = Object.assign({}, L0.sol, { azimuth: (L0.sol.azimuth + bear(px, pz) - bear(L0.px, L0.pz) + 720) % 360 });
    } else {
      if (!sol || Math.hypot(px - t.x, pz - t.z) > 1) sol = solve(px, pz) || sol;
      if (!sol) return null;
      // pháo / súng bắn thẳng: nhắm giữa thân xe địch (điểm 3D) như người chơi, không nhắm mặt đất dưới gầm — bộ giải
      // theo điểm mặt đất coi đường tới chân xe đâm vào gò trước mặt (đường tới thân xe vẫn thông) -> nòng hạ thấp,
      // đạn cắm xuống gò. Lựu pháo / xe 6 nòng (máy tính hỏa lực riêng) giữ nguyên
      if (U.tankType !== 'ARTILLERY' && U.tankType !== 'GATLING' && U.canElevate !== false && ballistics.elevationThrough && typeof BallisticsSystem3D !== 'undefined') {
        const r3 = ballistics.elevationThrough(U, px, (t.y || 0) + BallisticsSystem3D.unitAimHeight(t), pz, terrain, sol.elevation);
        if (r3) {
          // giữ phần bù gió của bộ giải, chỉ đổi gốc hướng từ tâm xe sang trục tháp
          const azC = (Math.atan2(px - U.x, -(pz - U.z)) * 180 / Math.PI + 360) % 360;
          const az = (sol.azimuth + ((r3.az - azC + 540) % 360 - 180) + 360) % 360;
          sol = Object.assign({}, sol, { elevation: Math.round(r3.el * 100) / 100, azimuth: Math.round(az * 10) / 10, reachable: true, aim3d: true });
        }
      }
      E.last = { px, pz, dist: dNew, at: this.clock, sol: Object.assign({}, sol) };
    }
    E.tf = Math.min(12, (sol.flightTime || 0) / (ballistics.bulletSpeedMultiplier || 1));
    E.solEl = sol.elevation; E.solCharge = sol.charge;
    // lệch ngắm (mrad -> độ)
    const lobArty = U.tankType === 'ARTILLERY' && sol.direct === false;
    sol.azimuth = (sol.azimuth + E.bAz * 0.0573 + 360) % 360;
    if (!lobArty) sol.elevation += E.bEl * 0.0573;
    return { sol, x: px, z: pz };
  }

  // Ra lệnh cho tháp / máy tính hỏa lực theo nghiệm bắn
  applyAim(sol, x, z, terrain) {
    const U = this.unit;
    U.charge = sol.charge;
    if (U.canElevate) U.aimTo(sol.azimuth, sol.elevation);
    else {
      U.aimTo(sol.azimuth);
      // Xe 6 nòng: máy tính hỏa lực tự nâng hạ nòng vào tâm mục tiêu
      U.fcsTarget = { x, z, y: terrain.getElevationAt(x, z) + 9, el: sol.reachable ? sol.elevation : undefined };
    }
  }

  /**
   * PHÒNG KHÔNG (xe 6 nòng / xe trinh sát; xe tăng dùng trạm súng máy trên nóc tháp): tự phát hiện drone trinh sát địch bay trong tầm nhìn & tầm súng -> bám đón đầu,
   * ngóc nòng xả loạt (có nhịp phản xạ + sai số ngắm chỉnh dần như bắn xe). true = đang bắn drone (bỏ qua bắn mục tiêu mặt đất)
   */
  updateAntiAir(dt, ballistics) {
    const U = this.unit, G = typeof window !== 'undefined' ? window.game : null;
    const tank = U.tankType === 'ALL_ROUNDER';
    if ((U.tankType !== 'GATLING' && U.tankType !== 'SCOUT' && !(tank && U.rcwsGun && (!U.roofWeapon || U.roofWeapon === 'rcws'))) || U.isDead || !G || !G.airDroneList || !G.airShotSolution) {
      if (this.aa) { this.aa = null; U.isFiringGatling = false; U._aa = null; }
      return false;
    }
    const ammo = tank ? 'MG762' : U.selectedAmmo === 'INCENDIARY' ? 'INCENDIARY' : (U.tankType === 'SCOUT' ? 'SCOUT_BULLET' : 'GATLING_BULLET');
    const elMax = tank && typeof DroneAir !== 'undefined' ? DroneAir.C.RCWS.elMax : 60;
    const cap = G.aaRound ? (G.aaRound(U, ammo).maxTravel || 800) : 800;
    const seeR = typeof DroneAir !== 'undefined' ? DroneAir.C.BOT_SEE_R : 1100;
    const cy = typeof DroneAir !== 'undefined' ? DroneAir.C.CENTER_Y : 2.8;
    let A = this.aa;
    if (!A) {
      if ((this.aaScan = (this.aaScan || 0) - dt) > 0) return false;
      this.aaScan = 0.5 + Math.random() * 0.4;
      let best = null, bd = cap * 0.85;
      for (const d of G.airDroneList()) {
        if (d.team === U.team || !G.droneIsAirborne(d)) continue;
        const h = Math.hypot(d.x - U.x, d.z - U.z);
        if (h > seeR) continue;
        const r3 = Math.hypot(h, d.y - (U.y || 0));
        if (r3 < bd && Math.atan2(d.y - (U.y || 0), h) < elMax * Math.PI / 180 - 0.05) { bd = r3; best = d; }
      }
      // xe địch đang áp sát mà bot tự nhìn thấy: lo xe địch trước
      if (!best || (this.burstUnit && !this.burstUnit.isDead && Math.hypot(this.burstUnit.x - U.x, this.burstUnit.z - U.z) < 220)) return false;
      const g = () => { const u = Math.max(1e-9, Math.random()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
      const k = this.skill, E = BotAIController.AIM_ERR;
      A = this.aa = { d: best, t: -(0.5 + Math.random() * 0.8 * k), g, bAz: g() * E.az * k, bEl: g() * E.el * k, solT: 0, corrT: 0, until: 5 + Math.random() * 3 };
      if (!tank) { this.burstUnit = null; this.pendingShot = null; }   // xe tăng: pháo chính vẫn đánh mặt đất, súng trên nóc lo drone
      if (U.tankType === 'SCOUT' && U.selectedAmmo === 'ANTI_TANK_MISSILE') U.selectedAmmo = 'SCOUT_BULLET';
    }
    const d = A.d;
    A.t += dt;
    const h = Math.hypot(d.x - U.x, d.z - U.z);
    if (!G.droneIsAirborne(d) || A.t > A.until || h > seeR * 1.1 || Math.hypot(h, d.y - (U.y || 0)) > cap) {
      this.aa = null;
      U.isFiringGatling = false;
      U._aa = null;
      this.aaScan = 0.6;
      return false;
    }
    if ((A.solT -= dt) <= 0) {
      A.solT = 0.12;
      A.sol = G.airShotSolution(U, ammo, d.x, d.y + cy, d.z, d.wvx || 0, d.wvy || 0, d.wvz || 0);
    }
    // nhìn vệt đạn vạch đường: cứ ~0.6 s kéo loạt đạn về gần drone hơn
    if (A.t > 0 && (A.corrT += dt) >= 0.6) {
      A.corrT = 0;
      const E = BotAIController.AIM_ERR;
      A.bAz = A.bAz * E.keep + A.g() * E.az * E.jitter * this.skill;
      A.bEl = A.bEl * E.keep + A.g() * E.el * E.jitter * this.skill;
    }
    const S = A.sol;
    if (!S) return !tank;
    const az = (S.az + A.bAz * 0.0573 + 360) % 360, el = Math.max(-5, Math.min(elMax, S.el + A.bEl * 0.0573));
    if (!tank) U.aimTo(az, el);
    if (!tank && !U.canElevate) {
      const r = az * Math.PI / 180;
      U.fcsTarget = { x: U.x + Math.sin(r) * 800, z: U.z - Math.cos(r) * 800, y: (U.y || 0) + 800 * Math.tan(el * Math.PI / 180), el };
    }
    let on = false;
    {
      const v = G.aaMuzzle ? G.aaMuzzle(U).direction : U.getMuzzleWorldTransform().direction;
      const baz = (Math.atan2(v.x, -v.z) * 180 / Math.PI + 360) % 360, bel = Math.asin(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
      on = Math.abs(((baz - az + 540) % 360) - 180) < 2 && Math.abs(bel - el) < 2;
    }
    const fire = A.t > 0 && on && S.el <= elMax;
    if (tank) { U._aa = { az, el, firing: fire, until: performance.now() / 1000 + 0.3 }; return false; }   // pháo chính vẫn tự do
    U.isFiringGatling = fire;
    U.aiTimer = Math.max(U.aiTimer, 0.4);
    return true;
  }

  /**
   * Xe tăng gắn súng phóng lựu / giàn rocket ở ô nóc tháp: trạm vũ khí bám xe địch đang giao chiến mà bot tự nhìn thấy
   * (nghiệm đường đạn thật của vũ khí đó, có sai số theo tay nghề), bắn khi bệ đã quay khớp hướng; pháo chính vẫn tự do
   */
  updateRoofWeapon(dt, T) {
    const U = this.unit, G = typeof window !== 'undefined' ? window.game : null;
    if (!U.rcwsGun || !U.roofWeapon || U.roofWeapon === 'rcws' || typeof DroneAir === 'undefined') return;
    const R = DroneAir.roofCfg(U), reach = U.roofWeapon === 'rocket' ? 650 : 950;
    const ok = !U.isDead && G && G.airShotSolution && T && !T.isDead && Math.hypot(T.x - U.x, T.z - U.z) < reach && this.seesDirect(T);
    if (!ok) { if (this.roofT) { this.roofT = null; U._aa = null; } return; }
    const st = this.roofT && this.roofT.u === T ? this.roofT
      : (this.roofT = { u: T, solT: 0, sol: null, bias: (Math.random() - 0.5) * 2.4 * this.skill, t: -(0.4 + Math.random() * 0.6) });
    st.t += dt;
    if ((st.solT -= dt) <= 0) {
      st.solT = 0.2;
      const y = (T.y || this.unit.y || 0) + 8;
      st.sol = G.airShotSolution(U, R.ammo, T.x, y, T.z, 0, 0, 0);
      st.bias *= 0.85;   // thấy điểm nổ thì chỉnh dần về mục tiêu
    }
    const S = st.sol;
    if (!S) return;
    const az = (S.az + st.bias + 360) % 360, el = Math.max(R.elMin, Math.min(R.elMax, S.el));
    const v = G.aaMuzzle(U).direction;
    const baz = (Math.atan2(v.x, -v.z) * 180 / Math.PI + 360) % 360, bel = Math.asin(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
    const on = Math.abs(((baz - az + 540) % 360) - 180) < 1.5 && Math.abs(bel - el) < 1.5;
    U._aa = { az, el, firing: st.t > 0 && on, until: performance.now() / 1000 + 0.3 };
  }

  update(dt, terrain, ballistics, radar, zone, allUnits, airdrop = null, supplyCrates = null, capturePoints = null) {
    this.unit.aiTimer -= dt;
    this.clock += dt;
    this.updateAntiAir(dt, ballistics);
    // bám mục tiêu đang giao chiến / đang chờ bắn để ước lượng vận tốc (đón đầu)
    const trkU = (this.pendingShot && this.pendingShot.tu) || this.burstUnit || this.lockUnit;
    this.updateRoofWeapon(dt, trkU);
    if (trkU) this.trackTarget(trkU, dt);
    // Xả loạt liên thanh: bám theo mục tiêu (ngắm lại ~5 lần/giây); hết loạt khi mục tiêu chết / khuất
    if (this.burstUnit) {
      const B = this.burstUnit;
      if (!this.unit.isFiringGatling || B.isDead || !this.seesDirect(B)) this.burstUnit = null;
      else if ((this.reaimT = (this.reaimT || 0) - dt) <= 0 && this.lastBallistics) {
        this.reaimT = 0.3;
        // nhìn vệt đạn vạch đường: cứ ~0.6 s kéo loạt đạn về gần mục tiêu hơn
        let corrected = false;
        if ((this.burstCorrT = (this.burstCorrT || 0) + 0.3) >= 0.6) { this.burstCorrT = 0; if (this.eng && this.eng.id === B.id) { this.correctAfterShot(this.eng); corrected = true; } }
        // ngắm lại khi vừa chỉnh sai số hoặc mục tiêu đã nhích đi
        if (corrected || this.burstAx === undefined || Math.hypot(B.x - this.burstAx, B.z - this.burstAz) > 4) {
          this.burstAx = B.x; this.burstAz = B.z;
          const a = this.aimAtUnit(B, this.lastBallistics, terrain);
          if (a) this.applyAim(a.sol, a.x, a.z, terrain);
        }
      }
    }
    // Phát bắn đang chờ: tháp quay / nòng nâng xong và giữ yên một nhịp (hoặc quá 4 s) mới khai hỏa;
    // mục tiêu mới xuất hiện: chờ thêm nhịp phản xạ (S.t bắt đầu âm)
    if (this.pendingShot) {
      const S = this.pendingShot;
      S.t += dt;
      // vẫn bám theo xe mục tiêu trong lúc chờ (xe địch đang chạy)
      if (S.tu && !S.tu.isDead && (S.reaim = (S.reaim || 0) - dt) <= 0) {
        // lựu pháo: giải quỹ đạo nặng -> ngắm lại thưa, và chỉ khi mục tiêu đã dịch đi đáng kể
        const arty = this.unit.tankType === 'ARTILLERY';
        // xe khác: ~3 lần/giây, chỉ khi mục tiêu đã nhích đi (xe đứng yên thì nghiệm cũ vẫn đúng — đỡ tốn máy)
        S.reaim = arty ? 1.0 : 0.3;
        if (S.ax === undefined || Math.hypot(S.tu.x - S.ax, S.tu.z - S.az) > (arty ? 25 : 4)) {
          S.ax = S.tu.x; S.az = S.tu.z;
          const a = this.aimAtUnit(S.tu, S.ballistics, terrain);
          if (a) this.applyAim(a.sol, a.x, a.z, terrain);
        }
      }
      // tháp đã chỉ đúng hướng lệnh (sai lệch còn lại rất nhỏ)
      // (bám xe đang chạy: lệch nhỏ còn lại vẫn tính là đã ngắm; tháp còn đang quay xa mới tính lại nhịp giữ yên)
      const U = this.unit;
      const off = U.barrelWorldOffset ? U.barrelWorldOffset() : { az: 0, el: 0 };
      const resAz = U.aimAz === undefined ? 0 : Math.abs(((U.aimAz - off.az - (U.azimuth || 0) + 540) % 360) - 180);
      const resEl = U.aimEl === undefined ? 0 : Math.abs(U.aimEl - off.el - U.elevation);
      if (resAz < 0.3 && resEl < 0.2) { if (S.doneAt === undefined) S.doneAt = S.t; }
      else if (resAz > 1.5 || resEl > 1) S.doneAt = undefined;
      // quá lâu tháp / nòng vẫn chưa tới hướng bắn (bị tường chặn, vượt giới hạn nâng nòng): bỏ phát này,
      // không bóp cò khi nòng còn đang quay (trước đây quá 4 s là bắn luôn -> đạn bay lệch hàng trăm mét)
      if (this.unit.isDead || S.t > 14) this.pendingShot = null;
      else if ((S.t >= 0 && S.doneAt !== undefined && S.t - S.doneAt >= (S.settle || 0)) || (S.t > 4 && resAz < 1.5 && resEl < 1)) {
        if (this.unit.tankType !== 'ARTILLERY' || this.unit.isDeployed) {
          // Tên lửa dẫn hướng: như người chơi, chỉ phóng khi tự nhìn thấy xe mục tiêu lúc bóp cò
          const mtU = S.mt && S.mt.unit;
          if (S.anti && this.unit.antiTankCooldown <= 0 && mtU && !mtU.isDead && this.seesDirect(mtU)) {
            this.unit.missileTarget = S.mt;
            this.unit.fireAntiTank(S.ballistics, S.radar);
          }
          else this.unit.fire(S.ballistics, S.radar);
          this.unit.isFiringGatling = S.burst;
          // liên thanh: bám mục tiêu suốt loạt; bắn xong mỗi phát / loạt -> nhìn điểm rơi chỉnh dần sai số
          this.burstUnit = S.burst && S.tu ? S.tu : null;
          this.burstAx = this.burstAz = undefined;
          if (S.tu && this.eng && this.eng.id === S.tu.id) this.correctAfterShot(this.eng);
        }
        this.pendingShot = null;
      }
    }
    if (this.unit.evadeTimer > 0) this.unit.evadeTimer -= dt;

    // Đang ngắm / khóa xe địch: tia laser đo xa (hoặc dẫn tên lửa) chiếu vào mục tiêu -> xe kia nhận cảnh báo
    if (this.lockUnit) {
      const L = this.lockUnit;
      this.lockHold -= dt;
      if (this.unit.isDead || L.isDead || this.lockHold <= 0 || !this.seesDirect(L)) {
        this.lockUnit = null;
        this.unit._lockOn = null;
      } else {
        const m = this.unit.tankType === 'SCOUT' && this.unit.antiTankCooldown <= 0 && (this.unit.missileAmmoCount || 0) > 0 ? 2 : 1;
        this.unit._lockOn = { id: L.id, m, at: Date.now() };
      }
    }

    const zoneCenterX = zone.current.x - zone.worldWidth / 2;
    const zoneCenterZ = zone.current.y - zone.worldHeight / 2;
    const distToZone = Math.hypot(this.unit.x - zoneCenterX, this.unit.z - zoneCenterZ);

    // 0. CƠ CHẾ PHÁT HIỆN KẸT XE & TỰ ĐỘNG LÙI THOÁT HIỂM (ANTI-STUCK & REVERSE)
    this.posCheckTimer += dt;
    if (this.posCheckTimer >= 0.8) {
      this.posCheckTimer = 0;
      const movedDist = Math.hypot(this.unit.x - this.lastCheckPos.x, this.unit.z - this.lastCheckPos.z);
      // Nếu xe đang muốn nhấn ga mà thực tế chỉ nhích < 5.0m trong 0.8s
      if (Math.abs(this.unit.speed) > 12 && movedDist < 5.0) {
        this.stuckCount++;
        if (this.stuckCount >= 2) {
          // Kẹt quá 1.6 giây: Kích hoạt chế độ lùi xe bẻ lái
          this.stuckTimer = 1.5;
          this.reverseSteer = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4);
          // Xe bánh lốp đang lùi mà kẹt (đuôi xe húc tường): thoát bằng số tiến; còn lại thì lùi
          this.escapeDir = this.unit.isWheeled && this.unit.speed < 0 ? 1 : -1;
          this.stuckCount = 0;
        }
      } else {
        this.stuckCount = Math.max(0, this.stuckCount - 1);
      }
      this.lastCheckPos = { x: this.unit.x, z: this.unit.z };
    }

    if (this.stuckTimer > 0) {
      this.stuckTimer -= dt;
      // Vào số lùi và bẻ lái để thoát khỏi góc tường công sự
      if (this.unit.isWheeled && this.unit.applyWheelSteer) {
        // Xe bánh lốp: bẻ hết lái rồi lăn vòng cung (thân xe chỉ quay khi bánh lăn, lùi thì đầu xe quay ngược chiều)
        this.unit.speed = (this.escapeDir || -1) * this.unit.baseMaxSpeed * 0.45;
        this.unit.bodyAngle += this.unit.applyWheelSteer(Math.sign(this.reverseSteer), dt) * dt;
        this.unit._gear = this.escapeDir || -1;
      } else {
        this.unit.bodyAngle += this.reverseSteer * this.unit.turnRate * dt;
        this.unit.speed = -this.unit.baseMaxSpeed * 0.65;
      }
      return;
    }

    // ƯU TIÊN 1: Chạy vào vòng bo an toàn nếu đang ở ngoài / sát mép bo, hoặc sắp bị vòng kế tiếp bỏ lại.
    // Trước đây ngưỡng 0,78 bán kính: vòng cuối ôm cứ điểm A/C ở ~0,92 bán kính -> bot ở A/C bỏ cờ, ngừng bắn
    const soon = zone.next && (zone.state === 'shrinking' || (zone.state === 'waiting' && zone.timer < 20));
    const safe = soon ? zone.next : zone.current;
    const safeX = safe.x - zone.worldWidth / 2, safeZ = safe.y - zone.worldHeight / 2;
    const distToSafe = Math.hypot(this.unit.x - safeX, this.unit.z - safeZ);
    if (distToZone > zone.current.radius - 40 || distToSafe > safe.radius - Math.min(120, safe.radius * 0.15)) {
      // Pháo tự hành phải nhổ chân chống để chạy bo
      if (this.unit.tankType === 'ARTILLERY') {
        this.unit.isDeployed = false;
        this.assignedCampPos = null;
      }
      this.driveTowards(safeX, safeZ, dt, false, allUnits);
      return;
    }

    // ƯU TIÊN 2: Né đạn pháo khẩn cấp khi nghe tiếng rít đạn rơi
    if (this.unit.evadeTimer > 0 && this.unit.evadeTarget) {
      if (this.unit.tankType === 'ARTILLERY') {
        this.unit.isDeployed = false;
        this.assignedCampPos = null;
      }
      const distEvade = Math.hypot(this.unit.evadeTarget.x - this.unit.x, this.unit.evadeTarget.z - this.unit.z);
      if (distEvade > 30) {
        this.driveTowards(this.unit.evadeTarget.x, this.unit.evadeTarget.z, dt, true, allUnits);
        return;
      } else {
        this.unit.evadeTarget = null;
      }
    }

    // ƯU TIÊN 3: CHIẾN THUẬT RIÊNG CHO PHÁO TỰ HÀNH (ARTILLERY)
    // Pháo tự hành chỉ huy tuyến sau: không lao lên phía trước, đứng yên hạ càng cắm đất bắn chi viện
    if (this.unit.tankType === 'ARTILLERY') {
      const isBlue = (this.unit.team === 'BLUE');
      if (!this.assignedCampPos && typeof this.unit.spawnX === 'number') {
        // Xuất phát ở vị trí ngẫu nhiên trên bản đồ: lập trận địa ngay quanh chỗ xuất phát;
        // chỗ xuất phát đã nằm ngoài vòng bo an toàn (vừa chạy bo vào) -> lập trận địa tại chỗ đang đứng, không quay ra lại
        const spawnSafe = Math.hypot(this.unit.spawnX - safeX, this.unit.spawnZ - safeZ) < safe.radius - 150;
        this.assignedCampPos = spawnSafe ? { x: this.unit.spawnX, z: this.unit.spawnZ } : { x: this.unit.x, z: this.unit.z };
      }
      if (!this.assignedCampPos) {
        // Chọn vị trí trận địa tuyến sau phù hợp với phe
        const baseZ = isBlue ? 950 : -950;
        // Phân tán theo chiều ngang từ -550 đến +550 để không trùng nhau
        const laneOffset = ((this.unit.id || Math.random()) % 5 - 2) * 220;
        this.assignedCampPos = {
          x: Math.max(-650, Math.min(650, laneOffset)),
          z: baseZ + (Math.random() - 0.5) * 150
        };
      }

      const distToCamp = Math.hypot(this.unit.x - this.assignedCampPos.x, this.unit.z - this.assignedCampPos.z);
      if (distToCamp > 60) {
        this.unit.isDeployed = false;
        this.driveTowards(this.assignedCampPos.x, this.assignedCampPos.z, dt, false, allUnits);
        return;
      } else {
        // Đã tới vị trí trận địa: Dừng xe hẳn và hạ chân chống thủy lực cắm đất
        this.unit.speed = 0;
        this.unit.isDeployed = true;
        // Chuyển sang thực hiện ngắm bắn phản pháo ở dưới
      }
    }

    // ƯU TIÊN 4: CỐ THỦ CÔNG SỰ MÓNG NGỰA CHỈ KHI BỊ THƯƠNG NẶNG (MÁU < 35%)
    // Và mỗi công sự chỉ cho phép tối đa 1 xe vào nấp
    if (this.unit.tankType !== 'ARTILLERY' && this.unit.hp < this.unit.maxHp * 0.35 && terrain.horseshoeForts && terrain.horseshoeForts.length > 0) {
      const inFort = terrain.isUnitInsideHorseshoe(this.unit.x, this.unit.z);
      if (!inFort.inside) {
        let bestFort = null;
        let minDist = Infinity;

        for (const fort of terrain.horseshoeForts) {
          const fortDistToZone = Math.hypot(fort.x - zoneCenterX, fort.z - zoneCenterZ);
          if (fortDistToZone < zone.current.radius * 0.75) {
            // Kiểm tra xem đã có xe nào đang ở trong công sự này chưa
            const isOccupied = (allUnits || []).some(u => {
              if (u === this.unit || u.isDead) return false;
              const d = Math.hypot(u.x - fort.x, u.z - fort.z);
              return d < (fort.armLength || 76) + 25;
            });

            if (!isOccupied) {
              const d = Math.hypot(fort.x - this.unit.x, fort.z - this.unit.z);
              if (d < minDist) {
                minDist = d;
                bestFort = fort;
              }
            }
          }
        }

        if (bestFort && minDist < 650) {
          const armLen = bestFort.armLength || 76;
          // Điểm tiếp cận ngoài cổng an toàn (cách cổng mở 45m theo hướng cửa mở)
          const gateOuterX = bestFort.x + Math.cos(bestFort.openAngle) * (armLen + 45);
          const gateOuterZ = bestFort.z + Math.sin(bestFort.openAngle) * (armLen + 45);
          const distToGate = Math.hypot(this.unit.x - gateOuterX, this.unit.z - gateOuterZ);

          if (distToGate > 35) {
            this.driveTowards(gateOuterX, gateOuterZ, dt, false, allUnits);
            return;
          } else {
            // Đã tới cửa mở: Lái thẳng vào trong lòng móng ngựa
            const insideX = bestFort.x + Math.cos(bestFort.openAngle) * (armLen * 0.4);
            const insideZ = bestFort.z + Math.sin(bestFort.openAngle) * (armLen * 0.4);
            this.driveTowards(insideX, insideZ, dt, false, allUnits);
            return;
          }
        }
      }
    }

    // CHỌN MỘT ĐÍCH DI CHUYỂN DUY NHẤT CHO KHUNG NÀY: các bước dưới chỉ đề xuất đích kèm mức ưu tiên, cuối hàm mới
    // lái đúng một lần. (Trước đây mỗi bước tự gọi driveTowards -> một khung lái 2–4 lần: bot tăng tốc / quay thân
    // nhanh gấp mấy lần người chơi, và lệnh gọi sau cùng luôn thắng nên bot bỏ dở việc chiếm cứ điểm.)
    let goal = null;
    const want = (x, z, boost, pri) => { if (!goal || pri > goal.pri) goal = { x, z, boost, pri }; };
    const U = this.unit;
    U._holdingCp = false;
    this.objCp = null;

    // ƯU TIÊN 5: Tranh chấp Hòm Tiếp Tế Rơi Dù nếu đã tiếp đất
    if (U.tankType !== 'ARTILLERY' && airdrop && !airdrop.collected && airdrop.landed) {
      const distToDrop = Math.hypot(airdrop.x - U.x, airdrop.z - U.z);
      if (distToDrop < 650) want(airdrop.x, airdrop.z, true, 32);
    }

    // ƯU TIÊN 5b: Tranh chấp các Hòm Tiếp Tế Rải Rác ở gần
    if (U.tankType !== 'ARTILLERY' && supplyCrates && Array.isArray(supplyCrates)) {
      let nearestCrate = null;
      let minCrateDist = (U.hp < U.maxHp * 0.7) ? 450 : 250;
      for (const crate of supplyCrates) {
        if (crate.active) {
          const d = Math.hypot(crate.x - U.x, crate.z - U.z);
          if (d < minCrateDist) {
            minCrateDist = d;
            nearestCrate = crate;
          }
        }
      }
      if (nearestCrate) want(nearestCrate.x, nearestCrate.z, true, 30);
    }

    // ƯU TIÊN 5c: TRANH CHẤP & GIỮ CỨ ĐIỂM CHIẾN LƯỢC A, B, C THEO PHÂN CÔNG TÁC CHIẾN
    // (đồng hồ giữ cờ chỉ chạy khi có xe phe chủ đứng trong vùng -> chiếm xong phải có xe ở lại giữ)
    if (capturePoints && Array.isArray(capturePoints) && capturePoints.length > 0 && U.tankType !== 'ARTILLERY') {
      const set = terrain && terrain.strongholdSet;
      const inCp = (cp, u) => (cp.K && set && set.inCaptureZone) ? set.inCaptureZone(cp.K, u.x, u.z) : Math.hypot(u.x - cp.x, u.z - cp.z) <= cp.radius;
      const holders = (cp) => (allUnits || []).reduce((n, u) => n + (u && !u.isDead && u.team === U.team && inCp(cp, u) ? 1 : 0), 0);
      // điểm đứng riêng của từng bot trong cứ điểm (không dồn cục vào tâm)
      if (!this._holdOff) { const a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.2; this._holdOff = { c: Math.cos(a) * r, s: Math.sin(a) * r }; }
      const holdAt = (cp) => ({ x: cp.x + this._holdOff.c * cp.radius, z: cp.z + this._holdOff.s * cp.radius });

      // 1. Tình huống khẩn cấp: Địch sắp giữ đủ 60s để thắng!
      let urgentEnemyCp = null;
      let maxHoldTime = 0;
      for (const cp of capturePoints) {
        if (cp.owner && cp.owner !== U.team && cp.holdTimer > 25.0) {
          if (cp.holdTimer > maxHoldTime) {
            maxHoldTime = cp.holdTimer;
            urgentEnemyCp = cp;
          }
        }
      }

      if (urgentEnemyCp) {
        this.objCp = urgentEnemyCp;
        const distToCp = Math.hypot(urgentEnemyCp.x - U.x, urgentEnemyCp.z - U.z);
        if (distToCp > urgentEnemyCp.radius * 0.6) want(urgentEnemyCp.x, urgentEnemyCp.z, true, 50);
      } else {
        // 2. Đang đứng trong cứ điểm của phe mình mà ít xe giữ: ở lại giữ cho đồng hồ chạy
        const here = capturePoints.find(cp => cp.owner === U.team && inCp(cp, U));
        if (here && holders(here) <= 2 && U.hp >= U.maxHp * 0.35) {
          this.objCp = here;
          U._holdingCp = true;
          const h = holdAt(here);
          if (Math.hypot(h.x - U.x, h.z - U.z) > 18) want(h.x, h.z, false, 40);
          else want(U.x, U.z, false, 40);   // đã tới chỗ đứng: dừng lại giữ
        } else {
          // 3. Bình thường: Phân công chiếm cứ điểm theo dòng xe
          let targetCp = null;
          if (U.tankType === 'SCOUT') {
            // Xe trinh sát: Ưu tiên chiếm 2 cánh (Cứ điểm A hoặc C)
            const flankCps = capturePoints.filter(cp => cp.owner !== U.team && (cp.id === 'A' || cp.id === 'C' || Math.abs(cp.x) > 300));
            if (flankCps.length > 0) {
              // giữ nguyên cánh đã chọn tới khi chiếm xong (bốc lại mỗi khung hình -> xe lưỡng lự đổi hướng liên tục)
              if (!flankCps.includes(this._flankCp)) this._flankCp = flankCps[Math.floor(Math.random() * flankCps.length)];
              targetCp = this._flankCp;
            }
          } else if (U.tankType === 'ALL_ROUNDER') {
            // Xe tiên phong: Ưu tiên chiếm trung tâm (Cứ điểm B)
            targetCp = capturePoints.find(cp => cp.owner !== U.team && (cp.id === 'B' || Math.abs(cp.x) <= 300));
          }

          // Chưa chọn được: cứ điểm gần nhất chưa thuộc phe mình
          if (!targetCp) {
            let minCpDist = Infinity;
            for (const cp of capturePoints) {
              if (cp.owner !== U.team) {
                const d = Math.hypot(cp.x - U.x, cp.z - U.z);
                if (d < minCpDist) { minCpDist = d; targetCp = cp; }
              }
            }
          }
          // Cứ điểm phe mình đang bỏ trống (đồng hồ giữ đứng yên): xe 6 nòng / tăng chủ lực tới giữ nếu gần hơn đích tấn công;
          // phe mình đã giữ hết thì mọi xe tới giữ cứ điểm trống gần nhất
          let empty = null, emptyD = Infinity;
          for (const cp of capturePoints) {
            if (cp.owner !== U.team || holders(cp) > 0) continue;
            const d = Math.hypot(cp.x - U.x, cp.z - U.z);
            if (d < emptyD) { emptyD = d; empty = cp; }
          }
          if (empty) {
            const tD = targetCp ? Math.hypot(targetCp.x - U.x, targetCp.z - U.z) : Infinity;
            if (!targetCp || (U.tankType !== 'SCOUT' && emptyD < tD)) targetCp = empty;
          }

          if (targetCp) {
            this.objCp = targetCp;
            const h = targetCp.owner === U.team ? holdAt(targetCp) : { x: targetCp.x, z: targetCp.z };
            const distToCp = Math.hypot(h.x - U.x, h.z - U.z);
            if (distToCp > targetCp.radius * 0.65 || (targetCp.owner === U.team && distToCp > 18)) want(h.x, h.z, true, 20);
          }
        }
      }
    }

    // ƯU TIÊN 6: TẤN CÔNG PHẢN PHÁO BẰNG GIẢI THUẬT ĐƯỜNG ĐẠN TỰ ĐỘNG
    if (this.unit.aiTimer <= 0 && this.unit.reloadTimer === 0) {
      this.unit.aiTimer = (this.unit.tankType === 'ARTILLERY') ? (2.2 + Math.random() * 1.5) : (2.6 + Math.random() * 2.2);

      let targetX = null;
      let targetZ = null;
      let targetUnit = null;

      // Bot cũng chỉ biết vị trí địch như người chơi: tự nhìn thấy (xe núp bụi chỉ thấy khi ở gần), radar của chính nó
      // (xe trinh sát), hoặc đồng đội trinh sát báo vị trí
      const enemyUnits = (allUnits || []).filter(u => {
        if (u.isDead || u.team === this.unit.team) return false;
        if (smokeVeiled(u, this.unit.team)) return false;   // mất khóa sau khói đa phổ: chỉ còn bắn mò theo vị trí kẻ vừa bắn mình
        if (typeof TeamIntel !== 'undefined') return TeamIntel.knows(this.unit, u);
        return !(u.isInBush && (u.revealTimer || 0) <= 0) || Math.hypot(u.x - this.unit.x, u.z - this.unit.z) <= 260;
      });

      // TỰ VỆ TẦM GẦN: xe địch tự nhìn thấy đã vào dưới tầm cầu vồng -> ưu tiên hạ nòng bắn thẳng xe gần nhất
      const AD = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT : null;
      const lobMin = ballistics.artyLobMinRange ? ballistics.artyLobMinRange() : (this.unit.minFiringDist || 440);
      let closeFoe = null, closeD = lobMin * 1.08;
      if (AD) for (const u of enemyUnits) {
        const d = Math.hypot(u.x - this.unit.x, u.z - this.unit.z);
        if (d >= AD.min && d < closeD && this.seesDirect(u)) { closeD = d; closeFoe = u; }
      }

      if (closeFoe) {
        targetUnit = closeFoe;
        targetX = closeFoe.x;
        targetZ = closeFoe.z;
      } else if (this.unit.lastAttackerPos) {
        targetX = this.unit.lastAttackerPos.x + (Math.random() - 0.5) * 40;
        targetZ = this.unit.lastAttackerPos.z + (Math.random() - 0.5) * 40;
        this.unit.lastAttackerPos = null;
      } else {
        // (không còn radar phản pháo: phát bắn chỉ để lại dấu vị trí trên bản đồ, bot không tự bắn trả vào dấu đó)
        if (enemyUnits.length > 0) {
          // đang giao chiến với xe nào mà vẫn thấy thì bắn tiếp xe đó (đã chỉnh được sai số qua các phát trước)
          const cur = this.eng && this.clock - this.eng.lastAt < 15 ? enemyUnits.find(u => u.id === this.eng.id && this.seesDirect(u)) : null;
          const targetEnemy = cur || enemyUnits[Math.floor(Math.random() * enemyUnits.length)];
          targetUnit = targetEnemy;
          // tự nhìn thấy: ngắm thẳng vào xe (sai số của bot tính trong aimAtUnit); chỉ biết qua đồng đội báo: vị trí phỏng chừng
          const fuzz = this.seesDirect(targetEnemy) ? 0 : 50;
          targetX = targetEnemy.x + (Math.random() - 0.5) * fuzz;
          targetZ = targetEnemy.z + (Math.random() - 0.5) * fuzz;
        }
      }

      // Dưới tầm cầu vồng chỉ hạ nòng bắn thẳng được xe tự nhìn thấy (không bắn thẳng vào điểm đoán mò);
      // sát hơn tầm bắn thẳng ngắn nhất (nòng dài hơn khoảng cách) thì không bắn
      if (targetX !== null && this.unit.tankType === 'ARTILLERY') {
        const d = Math.hypot(targetX - this.unit.x, targetZ - this.unit.z);
        if ((AD && d < AD.min) || (d < lobMin && !closeFoe)) targetX = targetZ = null;
        // Mục tiêu ngay trước mũi xe (điểm mù, nòng không quay qua cabin): nhổ càng, chạy ngang một đoạn ngắn
        // để thân xe quay lệch đi rồi hạ càng bắn tiếp
        const bear = targetX !== null ? Math.atan2(targetX - this.unit.x, -(targetZ - this.unit.z)) * 180 / Math.PI : 0;
        if (targetX !== null && ballistics.inArtyBlind && ballistics.inArtyBlind(this.unit, bear)) {
          if (this.clock - (this.blindMoveAt || -99) > 10) {
            this.blindMoveAt = this.clock;
            const dx = (targetX - this.unit.x) / Math.max(1, d), dz = (targetZ - this.unit.z) / Math.max(1, d);
            const side = Math.random() < 0.5 ? 1 : -1;
            this.assignedCampPos = { x: this.unit.x - dz * side * 110 - dx * 30, z: this.unit.z + dx * side * 110 - dz * 30 };
            this.unit.isDeployed = false;
          }
          targetX = targetZ = null;
        }
      }

      // vùng cấm bắn (khu công trình giữa 3 cứ điểm): bot không nhắm bắn vào đó
      if (targetX !== null && terrain && terrain.landmarkSet && terrain.landmarkSet.noFireAt(targetX, targetZ, 20)) targetX = targetZ = null;
      if (targetX !== null && targetZ !== null) {
        this.lastBallistics = ballistics;
        // Xe tự nhìn thấy: ngắm có đón đầu + sai số của bot (chỉnh dần qua từng phát); còn lại: bắn vào điểm phỏng chừng
        const seenUnit = targetUnit && this.seesDirect(targetUnit) ? targetUnit : null;
        let sol = null;
        if (seenUnit) {
          const a = this.aimAtUnit(seenUnit, ballistics, terrain, true);
          if (a) { sol = a.sol; targetX = a.x; targetZ = a.z; }
        }
        // xe không tự nhìn thấy (đồng đội báo vị trí phỏng chừng): lựu pháo ưu tiên cầu vồng, không bắn thẳng mù
        if (!sol) sol = ballistics.solveAimingForTarget(this.unit.x, this.unit.y, this.unit.z, targetX, targetZ, terrain, this.unit, targetUnit ? { atUnit: true, preferLob: true } : null);
        if (sol) {
          // Tháp quay dần tới hướng bắn (không nhảy tức thì); bắn khi tháp đã quay xong (xem pendingShot)
          this.applyAim(sol, targetX, targetZ, terrain);

          // Pháo tự hành: Bắt buộc dừng xe hạ càng cắm đất mới bắn
          if (this.unit.tankType === 'ARTILLERY') {
            this.unit.speed = 0;
            if (!this.unit.isDeployed) {
              return;
            }
          }

          // Xe trinh sát hoặc xe 6 nòng xả đạn súng máy cận chiến (sau khi tháp quay tới)
          const distToTarget = Math.hypot(targetX - this.unit.x, targetZ - this.unit.z);
          // tầm hiệu quả súng (số liệu thật x tỉ lệ game): 30mm ~1000, 12.7mm ~700
          const gunCap = ballistics.maxTravelFor ? ballistics.maxTravelFor(this.unit.tankType === 'GATLING' ? 'GATLING_BULLET' : 'SCOUT_BULLET', this.unit) : 700;
          const burst = (this.unit.tankType === 'SCOUT' || this.unit.tankType === 'GATLING') && distToTarget <= gunCap * 0.92;
          this.unit.isFiringGatling = false;
          // Tên lửa chỉ dùng khi đã có xe mục tiêu mà chính bot nhìn thấy (không bắn tên lửa vào điểm / vị trí đồng đội báo)
          const seen = targetUnit && this.seesDirect(targetUnit);
          const anti = this.unit.tankType === 'SCOUT' && this.unit.antiTankCooldown <= 0 && (this.unit.missileAmmoCount || 0) > 0 && seen;
          const mt = anti ? { unit: targetUnit } : null;
          // mục tiêu mới: nhịp phản xạ trước phát đầu; mỗi phát: giữ yên tháp một chút cho nòng hết rung rồi mới bóp cò
          const E = seenUnit && this.eng && this.eng.id === seenUnit.id ? this.eng : null;
          const react = E && !E.reacted ? E.react : 0;
          if (E) E.reacted = true;
          this.pendingShot = { t: -react, anti, burst, ballistics, radar, mt, tu: seenUnit, settle: 0.15 + Math.random() * 0.3, reaim: 0.2,
            ax: seenUnit ? seenUnit.x : undefined, az: seenUnit ? seenUnit.z : undefined };
          if (seen && this.unit.tankType !== 'ARTILLERY') { this.lockUnit = targetUnit; this.lockHold = 4.5; }

          // Pháo tự hành đứng yên bắn tiếp, các xe khác đổi vị trí sau khi bắn
          if (this.unit.tankType !== 'ARTILLERY') {
            const O = this.objCp;
            const nearObj = O && Math.hypot(O.x - this.unit.x, O.z - this.unit.z) < O.radius * 1.5;
            if (nearObj) {
              // đang ở cứ điểm: chỉ né ngang trong vùng cờ, không bỏ cứ điểm chạy đi xa
              const a = Math.random() * Math.PI * 2, r = O.radius * (0.15 + Math.random() * 0.3);
              this.unit.aiShootAndScootDest = { x: O.x + Math.cos(a) * r, z: O.z + Math.sin(a) * r };
              this.unit.aiState = 'fleeing';
            } else if (!O) {
              const scootAngle = Math.random() * Math.PI * 2;
              const scootDist = 180 + Math.random() * 200;
              this.unit.aiShootAndScootDest = {
                x: this.unit.clampToMap(this.unit.x + Math.cos(scootAngle) * scootDist, 'x'),
                z: this.unit.clampToMap(this.unit.z + Math.sin(scootAngle) * scootDist, 'z')
              };
              this.unit.aiState = 'fleeing';
            }
            // đang trên đường tới cứ điểm: cứ chạy tiếp (đang cơ động sẵn), không rẽ ngang
          }
        }
      }
    }

    // Cơ động đổi vị trí sau khi bắn cho các xe không phải pháo tự hành
    if (this.unit.tankType !== 'ARTILLERY' && this.unit.aiState === 'fleeing' && this.unit.aiShootAndScootDest) {
      const D = this.unit.aiShootAndScootDest, O = this.objCp;
      // điểm đổi chỗ cũ (đặt lúc chưa có cứ điểm để tới) nằm xa cứ điểm đang nhắm: bỏ, không kéo bot đi lệch
      if (O && Math.hypot(D.x - O.x, D.z - O.z) > O.radius * 1.5) {
        this.unit.aiState = 'patrol';
        this.unit.aiShootAndScootDest = null;
      } else if (Math.hypot(D.x - this.unit.x, D.z - this.unit.z) > 40) want(D.x, D.z, false, 25);
      else {
        this.unit.aiState = 'patrol';
        this.unit.aiShootAndScootDest = null;
      }
    }

    // LÁI ĐÚNG MỘT LẦN theo đích ưu tiên cao nhất; không có việc gì thì phanh dừng
    // (trước đây không gọi lệnh lái nào thì tốc độ giữ nguyên -> bot trôi tuột qua cứ điểm)
    if (goal && Math.hypot(goal.x - this.unit.x, goal.z - this.unit.z) > 1) this.driveTowards(goal.x, goal.z, dt, goal.boost, allUnits);
    else if (!(this.unit.tankType === 'ARTILLERY' && this.unit.isDeployed)) this.unit.steer(0, 0, dt);
  }

  /**
   * Điều khiển xe di chuyển tới tọa độ mục tiêu kết hợp lực đẩy phân tán đội hình
   * Giúp xe giữ cự ly an toàn 50-70m với đồng đội, không bị dồn cục
   */
  // Bot tự nhìn thấy xe đó (mắt / kính ngắm), không tính vị trí do đồng đội báo hay radar
  seesDirect(t) {
    if (!t || t.isDead) return false;
    if (smokeVeiled(t, this.unit.team)) return false;   // khói đa phổ: kính ngắm / laser đo xa không khóa được
    if (typeof TeamIntel === 'undefined') return true;
    return TeamIntel.seesDirect(this.unit, t);
  }

  // Bộ bám đường (Navigator.steer) theo từng đích: trong một khung bot có thể lái lần lượt tới vài đích (hòm tiếp tế,
  // cứ điểm, điểm đổi vị trí sau khi bắn...). Dùng chung một bộ thì mỗi lần đổi đích bị coi là "đích dời xa" -> tính lại
  // đường A* ở MỌI lần gọi (~20 lần / khung cho cả trận). Mỗi đích giữ đường riêng, tự tính lại theo nhịp bình thường.
  navFor(tx, tz) {
    const navs = this._navs || (this._navs = []);
    let best = null, bd = 200 * 200;   // trong 200: cùng đích (steer tự xử lý đích dịch dần)
    for (const n of navs) {
      if (n.tx === undefined) continue;
      const d = (n.tx - tx) * (n.tx - tx) + (n.tz - tz) * (n.tz - tz);
      if (d <= bd) { bd = d; best = n; }
    }
    if (!best) {
      if (navs.length >= 4) navs.sort((a, b) => a.usedAt - b.usedAt).shift();   // bỏ đích lâu không dùng nhất
      best = {};
      navs.push(best);
    }
    best.usedAt = this.clock;
    return best;
  }

  driveTowards(targetX, targetZ, dt, isBoost = false, allUnits = null) {
    let dx = targetX - this.unit.x;
    let dz = targetZ - this.unit.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.001) {
      dx /= dist;
      dz /= dist;
    }
    // Tìm đường né nhà, đá tảng, tường công sự / cứ điểm và sườn quá dốc với loại xe này
    const terrain = window.game && window.game.terrain;
    if (typeof Navigator !== 'undefined' && terrain && dist > 30) {
      const st = Navigator.steer(this.unit, this.navFor(targetX, targetZ), terrain, targetX, targetZ, dt, 20);
      if (!st.arrived) { dx = st.dx; dz = st.dz; }
    }

    // Lực đẩy phân tán đội hình (Flocking Separation): Đẩy xe dạt ra khi quá gần đồng đội
    if (allUnits && Array.isArray(allUnits)) {
      for (const other of allUnits) {
        if (other !== this.unit && !other.isDead) {
          const sepX = this.unit.x - other.x;
          const sepZ = this.unit.z - other.z;
          const sepDist = Math.hypot(sepX, sepZ);
          const safeRadius = (other.team === this.unit.team) ? 75 : 55;
          if (sepDist > 0.001 && sepDist < safeRadius) {
            const pushWeight = ((safeRadius - sepDist) / safeRadius) * 2.2;
            dx += (sepX / sepDist) * pushWeight;
            dz += (sepZ / sepDist) * pushWeight;
          }
        }
      }
    }

    // Kẹt ở sườn quá dốc (vd pháo tự hành trước ụ cứ điểm): rẽ ngang đi vòng một lúc
    if (this.unit.climbStall) this._stallT = (this._stallT || 0) + dt; else this._stallT = Math.max(0, (this._stallT || 0) - dt);
    if (this._stallT > 0.6 && !(this._detour > 0)) { this._detour = 1.8; this._detourSide = Math.random() < 0.5 ? -1 : 1; this._stallT = 0; }
    if (this._detour > 0) {
      this._detour -= dt;
      const s = this._detourSide;
      const ndx = -dz * s, ndz = dx * s;
      dx = ndx; dz = ndz;
    }

    this.unit.steer(dx, dz, dt, isBoost);
  }
}

// Sai số ngắm của bot (σ, nhân tay nghề 0.8–1.25): az / el theo mrad đã theo tỉ lệ game (cùng hệ với dispersion.js),
// range = sai ước lượng cự ly (tỉ lệ), lead = sai ước lượng vận tốc mục tiêu khi đón đầu (tỉ lệ).
// Sau mỗi phát: sai số còn keep (giữ lại) + một phần ngẫu nhiên mới jitter -> 2–3 phát là chỉnh gần trúng.
BotAIController.AIM_ERR = { az: 12, el: 12, range: 0.04, lead: 0.35, keep: 0.5, jitter: 0.3 };

if (typeof window !== 'undefined') {
  window.BotAIController = BotAIController;
}
if (typeof module !== 'undefined') {
  module.exports = BotAIController;
}
