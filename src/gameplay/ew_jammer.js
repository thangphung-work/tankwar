/**
 * TÁC CHIẾN ĐIỆN TỬ CHỐNG UAV — MÁY PHÁ SÓNG PHÁT CHÙM ĐỊNH HƯỚNG TRÊN NÓC THÁP XE TĂNG (thay trạm súng máy 7.62mm:
 * súng nhỏ, tầm ngắn hơn độ cao bay của drone, gần như không bắn rơi được drone).
 *
 * Vai trò: xe 6 nòng bắn HẠ drone từ xa (có radar); xe tăng chỉ TỰ VỆ — phá sóng, không phá hủy drone:
 *  - [4] / nhấp ô PHÁ SÓNG: chọn máy phá sóng làm vũ khí (như súng máy cũ; [4] lần nữa / [1]-[3] về pháo chính).
 *    Khóa drone địch (Tab / nhấp vào drone / ngắm tâm kính trúng drone rồi bấm), GIỮ Space / chuột trái mới phát chùm,
 *    chưa khóa hoặc drone còn ngoài tầm (gần hơn radar phòng không 6 nòng) thì không phát; nhả là tắt.
 *    Pin: phát liên tục tối đa ~12 s, sạc lại đầy ~30 s; cần >= 25% mới bắt đầu phát được
 *  - đầu phát mảng ăng-ten tấm trên bệ xoay bám tâm kính: chùm hình nón hẹp ±15°; drone (mọi phe, kể cả đồng đội) nằm
 *    trong chùm, cách ~950: hình camera nhiễu sọc, giữ trong chùm ~2.5 s là mất liên lạc điều khiển -> drone tự bay về
 *    xe (ra khỏi chùm thì mức nhiễu tụt dần). Phải ngắm trúng & giữ — khó hơn xe 6 nòng
 *  - chùm chiếu trúng xe địch có radar khóa mục tiêu (trinh sát, 6 nòng) ~0.4 s: radar xe đó mất khóa & không khóa
 *    được mục tiêu (trinh sát: cả xe lẫn drone; 6 nòng: drone) tới ~3 s sau khi ra khỏi chùm
 *  - đang phát sóng thì xe bị dò phương lộ vị trí với địch trong ~2.400 (máy chủ & TeamIntel)
 *  - bot xe tăng tự chĩa & phát khi có drone địch bay tới gần
 * Đồng bộ mạng: trạng thái phát sóng đi kèm gói AA_MG (trường j) của xe — máy chủ đã cho chuyển tiếp gói này từ máy
 * điều khiển xe tăng. Mỗi máy tự xét drone CỦA MÌNH có nằm trong vùng phá sóng không (drone bot luôn đậu trên xe).
 */
const EWJammer = (() => {
  const C = {
    R: 950,          // tầm chùm phá sóng (đv, 3D)
    HALF: 0.27,      // nửa độ mở chùm theo phương ngang (rad, ~15°)
    EL_MIN: -0.1, EL_MAX: 1.3,   // giới hạn ngóc đầu phát (rad)
    SLEW: 1.8,       // tốc độ quay / ngóc đầu phát của bot (rad/s)
    SLEW_P: 4.0,     // ... của người chơi (bám tâm kính)
    ON: 12,          // pin đầy bật liên tục được bấy nhiêu giây
    CHARGE: 30,      // sạc từ cạn tới đầy (s)
    MIN: 0.25,       // pin tối thiểu để bật
    LINK: 2.5,       // drone nằm trong chùm bấy nhiêu giây thì mất liên lạc, bị ép bay về
    DETECT: 2400,    // địch dò phương bắt được xe đang phát sóng trong bán kính này
    SEND: 0.5,       // nhịp báo trạng thái đang phát cho máy khác (s)
    TTL: 1.3,        // máy khác coi là đang phát tới khi hết hạn gói cuối + chừng này
    BLIND_IN: 0.4,   // radar địch nằm trong chùm bấy nhiêu giây thì bị phá sóng
    BLIND: 3.0       // radar bị phá sóng: không khóa được mục tiêu tới bấy nhiêu giây sau khi ra khỏi chùm
  };
  const nowS = () => performance.now() / 1000;
  const SIG_TXT = 'SẮP RA NGOÀI TẦM TÍN HIỆU';

  const methods = {
    jamState(u) { return u._jam || (u._jam = { e: 1, on: false, sendT: 0, sent: false, idle: 0, az: null, el: 0.35 }); },

    // hướng tháp xe trên thế giới (rad, quy ước như tháp: hướng nhìn = (-sin, -cos))
    jamTurretYaw(u) { return (u._turretYaw !== undefined ? u._turretYaw : 0) + (u.bodyAngle || 0); },

    // drone d nằm trong chùm hình nón của xe u (theo hướng thật của đầu phát: góc lệch so với trục chùm <= HALF)
    inJamBeam(u, J, d) {
      if (!J || J.az === null) return false;
      const dx = d.x - u.x, dy = (d.y || 0) - ((u.y || 0) + 6), dz = d.z - u.z, r = Math.hypot(dx, dy, dz);
      if (r > C.R || r < 1) return false;
      const ce = Math.cos(J.el), ax = -Math.sin(J.az) * ce, ay = Math.sin(J.el), az = -Math.cos(J.az) * ce;
      return (ax * dx + ay * dy + az * dz) / r >= Math.cos(C.HALF);
    },

    // hướng (az, el) từ đầu phát xe u tới tâm drone d
    jamAimAt(u, d) {
      const dx = d.x - u.x, dz = d.z - u.z, cy = typeof DroneAir !== 'undefined' ? DroneAir.C.CENTER_Y : 1.5;
      return { az: Math.atan2(-dx, -dz), el: Math.max(C.EL_MIN, Math.min(C.EL_MAX, Math.atan2(d.y + cy - ((u.y || 0) + 6), Math.hypot(dx, dz)))) };
    },

    // Drone địch (đang thấy) gần hướng ngắm nhất: trong kính — lệch tâm kính <= ~18° (góc 3D); ngoài kính — lệch hướng
    // camera <= ~28° theo phương ngang. Đầu phát tự bám drone đó (như đầu dò bám mục tiêu) để chùm chĩa đúng vào nó
    jamAssistDrone(u, az, el, sight) {
      if (!this.airDroneList || !this.droneIsAirborne) return null;
      const ce = Math.cos(el), ax = -Math.sin(az) * ce, ay = Math.sin(el), azz = -Math.cos(az) * ce;
      let best = null, ba = sight ? C.HALF * 1.2 : C.HALF * 1.8;
      for (const d of this.airDroneList()) {
        if (d.team === u.team || d.key === 'own' || !d.seen || !this.droneIsAirborne(d)) continue;
        const dx = d.x - u.x, dy = d.y - ((u.y || 0) + 6), dz = d.z - u.z, r = Math.hypot(dx, dy, dz);
        if (r > C.R * 1.3 || r < 1) continue;
        let a;
        if (sight) a = Math.acos(Math.max(-1, Math.min(1, (ax * dx + ay * dy + azz * dz) / r)));
        else { a = Math.atan2(-dx, -dz) - az; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; a = Math.abs(a); }
        if (a < ba) { ba = a; best = d; }
      }
      return best;
    },

    jamRange() { return C.R; },

    // drone đang khóa bằng cơ chế khóa phòng không chung (DroneAir.setAirAim)
    jamLocked() { const A = this._airAim; return A && A.kind === 'drone' ? A.dr : null; },

    // [4] máy phá sóng: khóa drone (Tab / nhấp vào drone / tâm kính sượt drone) — như xe phòng không, kính lia bám drone
    jamLockDrone(dr) {
      const P = this.player;
      if (!P || !P.ewActive || !dr || !this.setAirAim) return;
      const S = this._sight;
      this.setAirAim({ kind: 'drone', dr, hard: !!(S && !S.arty) });
    },

    // Hướng đầu phát muốn chĩa. Người chơi: drone đã nhấp khóa, không thì drone địch gần hướng ngắm (tự bám), không có
    // thì theo đúng tâm kính (trong kính) / hướng camera, ngửa ~20° (ngoài kính). Bot: chĩa thẳng về drone địch gần nhất
    jamWantAim(u) {
      let az;
      if (u === this.player) {
        const S = this._sight, sight = !!(S && !S.arty && S.aimPitch !== undefined), J = this.jamState(u);
        const baseAz = sight ? (S.aimYaw !== undefined ? S.aimYaw : S.yaw) : (this._camYaw !== undefined ? this._camYaw : this.jamTurretYaw(u));
        const baseEl = sight ? S.aimPitch : 0.35;
        let dr = J.lockDr = this.jamLocked();
        if (!dr) dr = this.jamAssistDrone(u, baseAz, baseEl, sight);
        J.track = dr || null;
        if (dr) return this.jamAimAt(u, dr);
        return { az: baseAz, el: Math.max(C.EL_MIN, Math.min(C.EL_MAX, baseEl)) };
      } else {
        let best = null, bd = C.R * 1.3;
        if (this.airDroneList && this.droneIsAirborne) for (const d of this.airDroneList()) {
          if (d.team === u.team || !this.droneIsAirborne(d)) continue;
          const r = Math.hypot(d.x - u.x, d.y - (u.y || 0), d.z - u.z);
          if (r < bd) { bd = r; best = d; }
        }
        az = best ? Math.atan2(-(best.x - u.x), -(best.z - u.z)) : this.jamTurretYaw(u);
      }
      let el = 0.35;
      if (this.airDroneList && this.droneIsAirborne) {
        let bd = C.R;
        for (const d of this.airDroneList()) {
          if (!this.droneIsAirborne(d)) continue;
          const dx = d.x - u.x, dz = d.z - u.z, r = Math.hypot(dx, d.y - (u.y || 0), dz);
          if (r > bd) continue;
          let a = Math.atan2(-dx, -dz) - az;
          while (a > Math.PI) a -= Math.PI * 2;
          while (a < -Math.PI) a += Math.PI * 2;
          if (Math.abs(a) > C.HALF * 1.6) continue;
          bd = r; el = Math.atan2(d.y - ((u.y || 0) + 6), Math.hypot(dx, dz));
        }
      }
      return { az, el: Math.max(C.EL_MIN, Math.min(C.EL_MAX, el)) };
    },

    // xe tăng có máy phá sóng còn dùng được (chưa bị bắn văng)
    canJam(u) {
      return !!(u && u.jammer && !u.isDead && !(u.dmg && u.dmg.lost && u.dmg.lost.has('jammer')));
    },

    // xe u đang phát sóng (xe máy mình điều khiển: theo trạng thái; xe máy khác: theo gói mạng còn hạn)
    jamming(u) {
      if (!u || u.isDead || !u.jammer) return false;
      const J = u._jam;
      if (!J) return false;
      if (J.remoteUntil !== undefined && !this.jamLocal(u)) return J.remoteUntil > nowS();
      return !!J.on;
    },

    // xe do máy mình điều khiển (người chơi, bot khi chơi đơn / chủ phòng)
    jamLocal(u) {
      const NS = this.netSync;
      if (!NS || NS.detached) return true;
      return u === this.player || !!(u.botAI && !u._netProxy);
    },

    // [4] / nhấp ô PHÁ SÓNG: chọn máy phá sóng làm vũ khí (Space / chuột trái giữ để phát), bấm lại để về pháo chính
    selectJammer(on) {
      const P = this.player;
      if (!P || P.isDead || !P.jammer) return;
      const want = on === undefined ? !P.ewActive : !!on;
      if (want === !!P.ewActive) return;
      if (want && !this.canJam(P)) { this.addCombatLog('[[alert-triangle]] Máy phá sóng trên nóc tháp đã bị bắn văng — không phá sóng được nữa', 'alert'); return; }
      P.ewActive = want;
      const J = this.jamState(P), S = this._sight && !this._sight.arty ? this._sight : null;
      if (want) {
        // ngóc kính lên trời chờ drone; đang khóa xe mặt đất thì thả khóa (kính bám xe sẽ không ngóc lên)
        if (S) {
          if (this.lockedTarget && this.setLockedTarget) this.setLockedTarget(null);
          S.aimPitch = Math.max(S.aimPitch || 0, 0.45);
          if (S.vPitch !== undefined) S.vPitch = Math.max(S.vPitch, S.aimPitch - 0.25);
        }
        // như xe phòng không: thấy drone địch trong tầm chùm thì khóa luôn
        if (this.airDroneList && this.droneIsAirborne) {
          let best = null, bd = C.R * 1.3;
          for (const d of this.airDroneList()) {
            if (d.team === P.team || d.key === 'own' || !d.seen || !this.droneIsAirborne(d)) continue;
            const r = Math.hypot(d.x - P.x, d.y - (P.y || 0), d.z - P.z);
            if (r < bd) { bd = r; best = d; }
          }
          if (best) this.jamLockDrone(best);
        }
        this.addCombatLog(`[[antenna-bars-5]] MÁY PHÁ SÓNG — chùm định hướng ±15°, tầm ~${C.R}: KHÓA drone địch (Tab / nhấp vào drone) rồi GIỮ Space / chuột trái để phát — chưa khóa thì không phát, giữ drone trong chùm ~${C.LINK} s là nó mất liên lạc, bị ép bay về (cả drone phe mình). Đang phát: xe bị địch dò ra vị trí. Pin ${Math.round(J.e * 100)}% · [4] về pháo chính`, 'tip');
      } else {
        J.on = false; J.lockDr = null; J.track = null;
        if (this._airAim && this.clearAirAim) this.clearAirAim();
        if (S) { S.aimPitch = Math.min(S.aimPitch, 0.08); if (S.vPitch !== undefined) S.vPitch = Math.min(S.vPitch, 0.08); }
        this.addCombatLog('[[target-arrow]] Về pháo chính 120mm', 'tip');
      }
      const SE = window.soundEngine;
      if (SE && SE.playAmmoSwitch) SE.playAmmoSwitch(want ? 'SCOUT_BULLET' : P.selectedAmmo);
      J.sendT = 0;
      if (this.updateAmmoUI) this.updateAmmoUI();
    },
    toggleJammer() { this.selectJammer(); },

    // [Tab] khi cầm máy phá sóng: khóa drone địch (đang thấy, đang bay) gần nhất; bấm tiếp đổi sang drone kế tiếp
    jamCycleDrone() {
      const P = this.player;
      if (!P || !P.ewActive || !this.airDroneList || !this.droneIsAirborne) return;
      const list = this.airDroneList()
        .filter(d => d.team !== P.team && d.key !== 'own' && d.seen && this.droneIsAirborne(d) && Math.hypot(d.x - P.x, d.z - P.z) <= C.R * 2)
        .sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
      if (!list.length) { this.addCombatLog('[[drone-off]] Không thấy drone địch nào quanh xe để khóa', 'alert'); return; }
      const i = list.indexOf(this.jamLocked());
      this.jamLockDrone(list[(i + 1) % list.length]);
    },

    // Người chơi: đang chọn máy phá sóng + giữ Space / chuột trái -> phát, nhưng chỉ khi đã KHÓA drone địch (như xe 6 nòng)
    // và drone đó đã vào tầm chùm. Chưa khóa mà đầu phát đang tự bám drone trong kính thì bấm là khóa luôn drone đó
    playerJammer(u, J) {
      const held = !!(u.ewActive && this.keys && (this.keys.Space || this.isPointerFiring));
      if (!held) { J.on = false; J.warned = false; J.noLockT = 0; return; }
      if (!this.jamLocked() && J.track) this.jamLockDrone(J.track);
      const dr = J.lockDr = this.jamLocked();
      if (!dr) {
        J.on = false;
        if (!J.noLockT || nowS() - J.noLockT > 2) { J.noLockT = nowS(); this.addCombatLog('[[target-off]] Chưa khóa drone — bấm Tab / nhấp vào drone địch để khóa rồi mới phát chùm được', 'alert'); }
        return;
      }
      if (Math.hypot(dr.x - u.x, (dr.y || 0) - (u.y || 0), dr.z - u.z) > C.R) {
        J.on = false;
        if (!J.noLockT || nowS() - J.noLockT > 2) { J.noLockT = nowS(); this.addCombatLog(`[[antenna-bars-off]] Drone khóa còn ngoài tầm phá sóng ~${C.R}M — chờ nó tới gần`, 'alert'); }
        return;
      }
      if (J.on || !this.canJam(u)) return;
      if (J.e >= C.MIN) { J.on = true; return; }
      if (!J.warned) {
        J.warned = true;
        this.addCombatLog(`[[battery]] Máy phá sóng đang sạc ${Math.round(J.e * 100)}% — cần ${Math.round(C.MIN * 100)}% mới phát được`, 'alert');
      }
    },

    // Mỗi khung hình: pin / hẹn giờ của xe mình điều khiển, bot tự bật, báo trạng thái cho máy khác, đèn trên mô hình,
    // drone của mình nằm trong vùng phá sóng
    updateJammers(dt) {
      if (!(dt > 0) || !this.units) return;
      const NS = this.netSync && !this.netSync.detached ? this.netSync : null;
      for (const u of this.units) {
        if (!u.jammer) continue;
        const J = this.jamState(u);
        if (this.jamLocal(u)) {
          if (!this.canJam(u)) J.on = false;
          // xe không phải người chơi do máy mình điều khiển (bot; xe mục tiêu phòng thử): tự bật khi drone địch tới gần
          if (u === this.player) this.playerJammer(u, J);
          else this.botJammer(u, J, dt);
          // đầu phát quay / ngóc dần về hướng muốn chĩa (tắt thì thu về chĩa theo tháp)
          const aiming = J.on || (u === this.player && u.ewActive);
          const W = aiming ? this.jamWantAim(u) : { az: this.jamTurretYaw(u), el: 0.1 };
          if (J.az === null) J.az = W.az;
          let da = W.az - J.az;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const st = (u === this.player ? C.SLEW_P : C.SLEW) * dt;
          J.az += Math.max(-st, Math.min(st, da));
          if (J.az > Math.PI) J.az -= Math.PI * 2; else if (J.az < -Math.PI) J.az += Math.PI * 2;
          J.el += Math.max(-st, Math.min(st, W.el - J.el));
          if (J.on) {
            J.e = Math.max(0, J.e - dt / C.ON);
            if (J.e <= 0) {
              J.on = false; J.warned = true;
              if (u === this.player) { this.addCombatLog('[[battery]] Máy phá sóng hết pin — ngừng phát, đang sạc lại', 'alert'); if (this.updateAmmoUI) this.updateAmmoUI(); }
            }
          } else J.e = Math.min(1, J.e + dt / C.CHARGE);
          // báo máy khác: lúc đổi trạng thái + nhắc đều khi đang phát (máy kia hết hạn thì tự coi là đã tắt)
          if (NS && u.netId !== undefined && NS.net) {
            J.sendT -= dt;
            const turned = J.on && Math.abs(J.az - (J.sentAz || 0)) > 0.08 && J.sendT < C.SEND - 0.15;
            if (J.on !== J.sent || (J.on && J.sendT <= 0) || turned) {
              J.sentAz = J.az;
              NS.net.send('AA_MG', { i: u.netId, j: J.on ? 1 : 0, a: Math.round(J.az * 100), e: Math.round(J.el * 100) });
              J.sent = J.on; J.sendT = C.SEND;
            }
          }
        }
        this.animateJammer(u, this.jamming(u), J, dt);
      }
      this.jamOwnDrone(dt);
      this.jamRadars(dt);
    },

    // ---------- PHÁ SÓNG RADAR KHÓA MỤC TIÊU CỦA ĐỊCH ----------
    // xe có radar khóa mục tiêu (trinh sát, 6 nòng) đang bị máy phá sóng xe tăng địch chiếu
    radarJammed(u) { return !!u && (u._radarJamUntil || 0) > nowS(); },

    radarJamNote(force) {
      const P = this.player, t = nowS();
      if (!P || (!force && t - (this._rjNoteT || 0) < 2)) return;
      this._rjNoteT = t;
      const left = Math.max(0, (P._radarJamUntil || 0) - t);
      this.addCombatLog(`[[radar-off]] RADAR BỊ PHÁ SÓNG — không khóa được mục tiêu (còn ~${left.toFixed(1)} S sau khi ra khỏi chùm), phải ngắm tay`, 'alert');
    },

    // Mỗi máy xét xe radar do mình điều khiển (người chơi, bot) có nằm trong chùm của xe tăng địch đang phát không
    // (chùm của xe máy khác đã đồng bộ hướng qua AA_MG). Xe mình đang phát: báo khi chùm chiếu trúng radar địch
    jamRadars(dt) {
      const t = nowS(), P = this.player;
      for (const v of this.units) {
        if (v.isDead || (v.tankType !== 'SCOUT' && v.tankType !== 'GATLING')) continue;
        const pt = { x: v.x, y: (v.y || 0) + 10, z: v.z };
        let hit = null;
        for (const u of this.units) {
          if (u === v || u.isDead || u.team === v.team || !u.jammer || !this.jamming(u)) continue;
          if (this.inJamBeam(u, u._jam, pt)) { hit = u; break; }
        }
        // xe mình đang chiếu trúng radar địch: báo một lần mỗi lượt chiếu
        if (hit === P) {
          if (t - (v._rjToldT || 0) > 3) {
            const nm = v.tankType === 'SCOUT' ? 'XE TRINH SÁT' : 'XE 6 NÒNG';
            this.addCombatLog(`[[antenna-bars-5]] Chùm phá sóng đang chiếu radar ${nm} địch — giữ thêm chút là nó mất khóa mục tiêu ~${C.BLIND} S`, 'tip');
          }
          v._rjToldT = t;
        }
        if (!this.jamLocal(v)) continue;
        if (hit) {
          v._rjExpo = (v._rjExpo || 0) + dt;
          if (v._rjExpo >= C.BLIND_IN) {
            const was = this.radarJammed(v);
            v._radarJamUntil = t + C.BLIND;
            if (!was) this.onRadarJammed(v);
          }
        } else v._rjExpo = Math.max(0, (v._rjExpo || 0) - dt);
      }
    },

    // Radar xe v vừa bị phá sóng: người chơi mất khóa đang có (trinh sát: cả xe lẫn drone; 6 nòng: drone)
    onRadarJammed(v) {
      if (v !== this.player) return;   // bot: aaRadarUp / airRadarR tự tắt theo radarJammed
      if (this._airAim && this._airAim.kind === 'drone' && this.clearAirAim) this.clearAirAim();
      if (v.tankType === 'SCOUT' && this.lockedTarget && this.setLockedTarget) this.setLockedTarget(null);
      this.radarJamNote(true);
      const SE = window.soundEngine;
      if (SE && SE.playRadarContact) SE.playRadarContact(0.2);
    },

    // Bot xe tăng: drone địch bay vào tầm ~1 s (kíp xe kịp phát hiện) thì bật; không còn drone nào quanh ~2 s thì tắt cho đỡ lộ
    botJammer(u, J, dt) {
      if (!this.airDroneList || !this.droneIsAirborne) return;
      let near = false, close = false;
      for (const d of this.airDroneList()) {
        if (d.team === u.team || !this.droneIsAirborne(d)) continue;
        const r = Math.hypot(d.x - u.x, d.y - (u.y || 0), d.z - u.z);
        if (r < C.R * 1.3) near = true;
        if (r < C.R) close = true;
      }
      if (J.on) {
        J.idle = near ? 0 : J.idle + dt;
        if (J.idle > 2) J.on = false;
      } else {
        J.seeT = close ? (J.seeT || 0) + dt : 0;
        if (J.seeT > 1 && J.e >= 0.4 && this.canJam(u)) { J.on = true; J.idle = 0; }
      }
    },

    // Đèn trạng thái trên máy phá sóng: đỏ nhấp nháy khi đang phát, xanh khi sẵn sàng, vàng khi đang sạc
    animateJammer(u, on, J, dt) {
      const JM = u.jammer, M = JM && JM.ledMat;
      if (!M) return;
      const t = nowS();
      // đầu phát: góc thế giới -> góc cục bộ trên tháp; ngóc theo J.el
      if (JM.head && J.az !== null) {
        JM.head.rotation.y = J.az - this.jamTurretYaw(u);
        if (JM.tilt) JM.tilt.rotation.x = J.el;
      }
      // chùm sáng mờ: xe mình — biết đang chĩa đi đâu; xe khác đang phát — thấy chùm chĩa vào drone mình (cả từ camera
      // drone). Xe địch khuất tầm nhìn thì cả mô hình đã ẩn
      const mine = u === this.player;
      if (JM.tilt && (mine || on || JM.beam)) {
        if (!JM.beam) {
          const L = C.R, rad = Math.tan(C.HALF) * L;
          const g = new THREE.ConeGeometry(rad, L, 28, 1, true);
          g.translate(0, -L / 2, 0); g.rotateX(Math.PI / 2);   // đỉnh nón tại đầu phát, mở về phía -Z
          JM.beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
          JM.beam.renderOrder = 3; JM.beam.frustumCulled = false;
          if (JM.beamScale) JM.beam.scale.setScalar(JM.beamScale);   // đầu phát nằm trên chân đế đã phóng to
          JM.tilt.add(JM.beam);
        }
        const want = on ? (mine ? 0.06 : 0.045) + 0.02 * Math.sin(t * 9) : mine && u.ewActive ? 0.018 : 0;
        const bm = JM.beam.material;
        bm.opacity += (want - bm.opacity) * Math.min(1, (dt || 0.016) * 8);
        JM.beam.visible = bm.opacity > 0.003 && !(mine && this._sight && this._sight.arty);
      }
      if (u.isDead) { M.emissiveIntensity = 0; return; }
      if (on) { M.emissive.setRGB(1, 0.12, 0.08); M.emissiveIntensity = 1.4 + 1.2 * (Math.sin(t * 18) > 0 ? 1 : 0); }
      else if ((J.remoteUntil === undefined || this.jamLocal(u)) && J.e < C.MIN) { M.emissive.setRGB(1, 0.65, 0.1); M.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 3); }
      else { M.emissive.setRGB(0.2, 1, 0.35); M.emissiveIntensity = 0.7; }
    },

    // Drone của mình trong vùng phá sóng của bất kỳ xe tăng nào đang phát (cả đồng đội): hình nhiễu, ~2 s mất liên lạc
    // -> tự bay về xe (dùng đường bay về khi pin yếu: qua miệng hầm nếu xe nằm trong hầm)
    jamOwnDrone(dt) {
      const P = this.player;
      if (!P || P.tankType !== 'ARTILLERY' || !this.droneState || !this.droneIsAirborne) return;
      const D = this.droneState();
      const S = this._sight && this._sight.arty ? this._sight : null;
      let jam = null;
      if (this.droneIsAirborne(D)) {
        for (const u of this.units) {
          if (!this.jamming(u)) continue;
          if (this.inJamBeam(u, u._jam, D)) { jam = u; break; }
        }
      }
      const T = this._droneTags;
      if (jam) {
        // vừa lọt vào chùm: báo trục trặc do nhiễu điện từ (một lần mỗi lượt bị chiếu)
        if (!(D.jamT > 0.05)) {
          this.addCombatLog('[[alert-triangle]] DRONE TRỤC TRẶC — NHIỄU ĐIỆN TỪ: hình nhiễu sọc, lệnh điều khiển chập chờn, drone giật / trôi dạt, báo pin loạn. Bay ra khỏi chùm phá sóng ngay!', 'alert');
          if (window.soundEngine && window.soundEngine.playDroneBattery) window.soundEngine.playDroneBattery('warn');
        }
        D.jamT = (D.jamT || 0) + dt;
        const k = Math.min(1, D.jamT / C.LINK);
        // trục trặc (game.js đọc D.emiT): lệnh điều khiển mất từng lúc, drone giật / trôi dạt, cảm biến pin báo loạn —
        // pin thật KHÔNG bị rút (nhiễu làm hỏng liên lạc / điện tử, không đốt pin)
        D.emiT = 0.6;
        if (S) {
          S.glitch = Math.max(S.glitch || 0, 0.15 + 0.35 * k);
          S.jolt = Math.max(S.jolt || 0, 0.1 + 0.25 * k);
          if (T && T.sig) {
            const txt = D.jamT < C.LINK ? `⚠ NHIỄU ĐIỆN TỪ — DRONE TRỤC TRẶC, ĐIỀU KHIỂN CHẬP CHỜN · MẤT LIÊN LẠC SAU ${(C.LINK - D.jamT).toFixed(1)} S` : '⚠ NHIỄU ĐIỆN TỪ — MẤT ĐIỀU KHIỂN, DRONE TỰ BAY VỀ';
            if (T.sig.textContent !== txt) T.sig.textContent = txt;
            T.sig.hidden = false; T._sig = true; T._jamTxt = true;
          }
          if (D.jamT >= C.LINK && !S.rth) {
            S.rth = true;
            S.auto = null;
            this.addCombatLog('[[antenna-bars-off]] DRONE BỊ PHÁ SÓNG — mất liên lạc điều khiển, drone tự bay về xe', 'alert');
            if (window.soundEngine && window.soundEngine.playDroneBattery) window.soundEngine.playDroneBattery('rth');
          }
        }
      } else {
        D.jamT = Math.max(0, (D.jamT || 0) - dt * 1.2);
        if (D.emiT > 0) D.emiT = Math.max(0, D.emiT - dt);
        if (T && T.sig && T._jamTxt) {
          T._jamTxt = false;
          T.sig.textContent = SIG_TXT;
          T._sig = !!(S && S.sigEdge);
          T.sig.hidden = !T._sig;
        }
      }
    }
  };

  // ---------- gắn vào game ----------
  if (typeof ArtilleryGame3D !== 'undefined' && ArtilleryGame3D.prototype) {
    const G = ArtilleryGame3D.prototype;
    Object.assign(G, methods);
    // chạy mỗi khung hình cùng phần drone / phòng không (DroneAir.updateDroneWorld gọi updateRCWS)
    const origRCWS = G.updateRCWS;
    if (typeof origRCWS === 'function' && !origRCWS.__ew) {
      G.updateRCWS = function (dt) {
        const r = origRCWS.call(this, dt);
        try { this.updateJammers(dt); } catch (e) { if (!this._ewErr) { this._ewErr = true; console.error('[EW]', e); } }
        return r;
      };
      G.updateRCWS.__ew = true;
    }
    // gói AA_MG có trường j: trạng thái phát sóng của xe tăng máy khác
    const origNet = G.onNetAAmg;
    if (typeof origNet === 'function' && !origNet.__ew) {
      G.onNetAAmg = function (d, from, NS) {
        if (d && d.j !== undefined) {
          const u = NS && NS.byNetId ? NS.byNetId[d.i] : null;
          if (!u || u === this.player || NS.owns(u) || NS.ownerOf(u) !== from || !u.jammer) return;
          const J = this.jamState(u);
          J.remoteUntil = d.j ? nowS() + C.TTL : 0;
          if (d.a !== undefined) J.az = d.a / 100;
          if (d.e !== undefined) J.el = d.e / 100;
          return;
        }
        return origNet.call(this, d, from, NS);
      };
      G.onNetAAmg.__ew = true;
    }
  }

  return { C, methods };
})();

if (typeof window !== 'undefined') window.EWJammer = EWJammer;
