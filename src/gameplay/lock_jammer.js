/**
 * MÁY PHÁ KHÓA RADAR TẦM GẦN — bó ăng-ten phát nhiễu đa hướng trên chân đế nóc tháp xe 6 nòng (ô NÓC THÁP, món 'rjam';
 * mô hình: roof_mounts.js, phần cứng u.lockJammer). Khác máy phá sóng chống UAV của xe tăng (chùm hẹp, đánh drone):
 * phát RỘNG mọi hướng, tầm ngắn, nhằm vào máy đo xa / radar khóa mục tiêu & đầu dò tên lửa của địch.
 *
 *  - [4] bật / tắt (không chiếm cò: pháo chính vẫn bắn). Pin phát tối đa ~10 s, sạc đầy ~25 s, cần >= 30% mới bật.
 *  - Đang phát: xe địch trong bán kính R không khóa được xe này — khóa đang giữ bị bẻ gãy (cả khóa của bot), đầu dò tên
 *    lửa chống tăng chỉ thấy nhiễu (mù), tên lửa dẫn đường đang lao tới mất dẫn hướng (bay thẳng theo quán tính).
 *  - Cái giá: đang phát thì địch dò phương thấy vị trí xe (như máy phá sóng xe tăng — TeamIntel + máy chủ, trường j).
 *  - Bot tự bật khi bị khóa / có tên lửa lao tới.
 * Đồng bộ mạng: gói AA_MG trường lj (máy chủ đã cho chuyển tiếp gói này từ máy điều khiển xe tăng / 6 nòng).
 */
const LockJammer = (() => {
  const C = {
    R: 650,        // bán kính phá khóa (đv, phương ngang)
    ON: 10,        // pin đầy phát liên tục được bấy nhiêu giây
    CHARGE: 25,    // sạc từ cạn tới đầy (s)
    MIN: 0.3,      // pin tối thiểu để bật
    SEND: 0.5,     // nhịp báo trạng thái đang phát cho máy khác (s)
    TTL: 1.3       // máy khác coi là đang phát tới khi hết hạn gói cuối + chừng này
  };
  const nowS = () => performance.now() / 1000;

  const methods = {
    ljState(u) { return u._lj || (u._lj = { e: 1, on: false, sendT: 0, sent: false, remoteUntil: 0, botT: 0 }); },
    canLockJam(u) { return !!(u && u.lockJammer && !u.isDead && !(u.dmg && u.dmg.lost && u.dmg.lost.has('rjam'))); },
    ljLocal(u) { return !this.netSync || u === this.player || (!!u.botAI && !u._netProxy); },
    lockJamming(u) {
      if (!u || u.isDead || !u.lockJammer || !u._lj) return false;
      return this.ljLocal(u) ? !!u._lj.on : (u._lj.remoteUntil || 0) > nowS();
    },
    /** Xe t đang phá khóa và kẻ khóa `from` (xe / viên đạn có x, z) nằm trong vùng phá khóa */
    lockJammedBy(t, from) {
      return !!(t && from && this.lockJamming(t) && Math.hypot(t.x - from.x, t.z - from.z) < C.R);
    },

    // [4] bật / tắt máy phá khóa radar của xe mình
    toggleLockJammer() {
      const P = this.player;
      if (!P || P.isDead || !P.lockJammer) return;
      const L = this.ljState(P), SE = window.soundEngine;
      if (!this.canLockJam(P)) { this.addCombatLog('[[alert-triangle]] Máy phá khóa radar đã bị bắn văng — không dùng được', 'alert'); return; }
      if (!L.on && L.e < C.MIN) {
        this.addCombatLog(`[[battery-2]] Máy phá khóa radar đang sạc (${Math.round(L.e * 100)}%) — cần ${Math.round(C.MIN * 100)}% mới phát được`, 'alert');
        return;
      }
      L.on = !L.on;
      L.sendT = 0;
      if (SE && SE.playLockJamToggle) SE.playLockJamToggle(L.on);
      this.addCombatLog(L.on
        ? `[[radar-off]] MÁY PHÁ KHÓA RADAR ĐANG PHÁT — địch trong ~${Math.round(C.R / 8)} m không khóa được xe bạn, tên lửa dẫn đường mất dẫn hướng. Địch dò phương thấy bạn! [4] tắt`
        : '[[radar]] Đã tắt máy phá khóa radar', L.on ? 'tip' : 'system');
      if (this.updateAmmoUI) this.updateAmmoUI();
    },

    // Mỗi khung hình: pin, đồng bộ, bot tự bật, tác dụng lên khóa / đầu dò / tên lửa, đèn & tiếng ù
    updateLockJammers(dt) {
      if (!(dt > 0)) return;
      const t = nowS(), P = this.player, SE = window.soundEngine;
      let hum = 0;
      for (const u of this.units) {
        if (!u.lockJammer) continue;
        const L = this.ljState(u), local = this.ljLocal(u);
        if (local) {
          if (!this.canLockJam(u)) L.on = false;
          if (L.on) {
            L.e -= dt / C.ON;
            if (L.e <= 0) {
              L.e = 0; L.on = false;
              if (u === P) { this.addCombatLog('[[battery-off]] Máy phá khóa radar cạn pin — tự tắt, đang sạc lại', 'alert'); if (SE && SE.playLockJamToggle) SE.playLockJamToggle(false); }
            }
          } else L.e = Math.min(1, L.e + dt / C.CHARGE);
          // bot: bật khi đang bị khóa (xe người chơi khóa / tên lửa đang lao tới), tắt khi hết nguy
          if (u.botAI && !u._netProxy && (L.botT -= dt) <= 0) {
            L.botT = 0.6;
            const threat = this.ljThreatened(u);
            if (threat && !L.on && L.e >= C.MIN && this.canLockJam(u)) L.on = true;
            else if (!threat && L.on && L.e < 0.6) L.on = false;
          }
          const NS = this.netSync;
          if (NS && !NS.detached && u.netId !== undefined && (L.sendT -= dt) <= 0 && (L.on || L.sent)) {
            L.sendT = C.SEND;
            NS.net.send('AA_MG', { i: u.netId, lj: L.on ? 1 : 0 });
            L.sent = L.on;
          }
        }
        const on = this.lockJamming(u);
        this.animateLockJammer(u, on, t, dt);
        if (on && P && !P.isDead) {
          const d = Math.hypot(u.x - P.x, u.z - P.z);
          if (d < 900) hum = Math.max(hum, u === P ? 1 : 1 - d / 900);
        }
      }
      if (SE && SE.updateLockJamHum) SE.updateLockJamHum(hum);

      // khóa của người chơi vào xe đang phá khóa trong tầm: bẻ gãy, tạm không tự khóa lại
      if (P && !P.isDead && this.lockedTarget && this.lockJammedBy(this.lockedTarget, P)) {
        const T = this.lockedTarget;
        this.setLockedTarget(null);
        this.autoLockCooldown = Math.max(this.autoLockCooldown || 0, 2.5);
        if (t - (this._ljNoteT || 0) > 2.5) {
          this._ljNoteT = t;
          this.addCombatLog(`[[radar-off]] BỊ PHÁ KHÓA — ${T.name || 'xe địch'} đang phát nhiễu radar, máy đo xa / khóa mục tiêu mù trong ~${Math.round(C.R / 8)} m. Ngắm tay hoặc lùi ra xa!`, 'alert');
          if (SE && SE.playTargetLost) SE.playTargetLost();
        }
      }
      // khóa của bot vào xe đang phá khóa: bot mất mục tiêu khóa (vẫn tự ngắm theo mắt nhìn được)
      for (const b of this.units) {
        const A = b.botAI;
        if (!A || b._netProxy || b.isDead || !A.lockUnit) continue;
        if (this.lockJammedBy(A.lockUnit, b)) A.lockUnit = null;
      }
      // tên lửa dẫn đường đang lao vào xe phát nhiễu: mất dẫn hướng, bay thẳng theo quán tính
      const B = this.ballistics;
      if (B && B.activeShells) {
        for (const s of B.activeShells) {
          const G = s.guide;
          if (!G || G.jammed || !G.targetId) continue;
          const T = this.units.find(u => u.id === G.targetId);
          if (T && this.lockJammedBy(T, s)) {
            G.jammed = true;
            s.guide = null;
            if (T === P && t - (this._ljMslT || 0) > 2) { this._ljMslT = t; this.addCombatLog('[[shield-check]] Tên lửa địch mất dẫn hướng trong vùng phá khóa!', 'tip'); }
          }
        }
      }
    },

    // xe u có đang bị khóa / bị tên lửa nhắm không (bot dùng để tự bật máy phá khóa)
    ljThreatened(u) {
      if (this.player && !this.player.isDead && this.lockedTarget === u && this.player.team !== u.team) return true;
      for (const b of this.units) if (b.botAI && b.team !== u.team && b.botAI.lockUnit === u) return true;
      const B = this.ballistics;
      if (B && B.activeShells) for (const s of B.activeShells) if (s.guide && s.guide.targetId === u.id) return true;
      return false;
    },

    // đèn trạng thái: xanh = sẵn sàng, vàng = sạc dưới mức bật, đỏ nhấp nháy = đang phát; đầu ăng-ten quay chậm khi phát
    animateLockJammer(u, on, t, dt) {
      const J = u.lockJammer, M = J && J.ledMat;
      if (!M) return;
      if (J.head && on) J.head.rotation.y += dt * 1.6;
      if (u.isDead) { M.emissiveIntensity = 0; return; }
      const L = u._lj || { e: 1 };
      if (on) { M.emissive.setRGB(1, 0.12, 0.08); M.emissiveIntensity = 1.3 + 1.1 * (Math.sin(t * 22) > 0 ? 1 : 0); }
      else if (this.ljLocal(u) && L.e < C.MIN) { M.emissive.setRGB(1, 0.65, 0.1); M.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 3); }
      else { M.emissive.setRGB(0.2, 1, 0.35); M.emissiveIntensity = 0.7; }
    }
  };

  // ---------- gắn vào game ----------
  if (typeof ArtilleryGame3D !== 'undefined' && ArtilleryGame3D.prototype) {
    const G = ArtilleryGame3D.prototype;
    Object.assign(G, methods);
    // chạy mỗi khung hình cùng phần trạm vũ khí nóc tháp (DroneAir.updateDroneWorld gọi updateRCWS)
    const origRCWS = G.updateRCWS;
    if (typeof origRCWS === 'function' && !origRCWS.__lj) {
      G.updateRCWS = function (dt) {
        const r = origRCWS.call(this, dt);
        try { this.updateLockJammers(dt); } catch (e) { if (!this._ljErr) { this._ljErr = true; console.error('[LJ]', e); } }
        return r;
      };
      G.updateRCWS.__lj = true;
      G.updateRCWS.__ew = origRCWS.__ew;
    }
    // gói AA_MG có trường lj: trạng thái phát nhiễu của xe máy khác
    const origNet = G.onNetAAmg;
    if (typeof origNet === 'function' && !origNet.__lj) {
      G.onNetAAmg = function (d, from, NS) {
        if (d && d.lj !== undefined) {
          const u = NS && NS.byNetId ? NS.byNetId[d.i] : null;
          if (!u || u === this.player || NS.owns(u) || NS.ownerOf(u) !== from || !u.lockJammer) return;
          this.ljState(u).remoteUntil = d.lj ? nowS() + C.TTL : 0;
          return;
        }
        return origNet.call(this, d, from, NS);
      };
      G.onNetAAmg.__lj = true;
      G.onNetAAmg.__ew = origNet.__ew;
    }
  }

  return { C, methods };
})();

if (typeof window !== 'undefined') window.LockJammer = LockJammer;
