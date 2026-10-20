/**
 * HIỆU ỨNG KỊCH TÍCH THEO DIỄN BIẾN TRẬN
 * - Vào trận: tiếng "BRAAAM" kèn đồng trầm + trống lớn
 * - Hạ gục được địch: cú "ẦM" điện ảnh + kèn đồng chớp nhanh
 * - Máu dưới 30 %: tim đập "thình thịch" nhanh dần theo máu, nhạc bị bóp nghẹt
 * - Bị hạ: tiếng trầm tụt xuống kiểu quay chậm, nhạc chìm hẳn; hồi sinh: tiếng dâng + trống
 * - Còn 1 phút: chuông trầm báo động, nhạc chạy tiếng đồng hồ; 10 giây cuối: đếm từng giây
 * - Độ ác liệt của nhạc trận (musicHeat) tăng theo tiếng súng / nổ / trúng đạn quanh xe mình
 * Theo dõi trạng thái game (window.game) ~10 lần/giây — không cần sửa logic trận đấu.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau music.js.
 */
(function () {
  if (typeof SoundEngine === 'undefined') return;

  SoundEngine.mixin(class {
    dramaTick(now) {
      const M = this._mz;
      const D = this._drama || (this._drama = { at: 0 });
      if (now < D.at) return;
      D.at = now + 0.1;
      const g = typeof window !== 'undefined' && (window.game || window.artilleryGame);
      const P = g && g.player;
      if (!M || M.mode !== 'battle' || !g || !g.isGameStarted || g.isGameOver || !P) {
        if (D.player) { this._drama = { at: D.at }; if (M) { M.final = 0; M.dead = false; M.lowHp = 0; M.tone.frequency.setTargetAtTime(20000, now, 0.3); } }
        return;
      }
      if (D.player !== P) {   // trận mới / xe mới: lấy mốc, không phát gì
        D.player = P;
        D.kills = P.kills || 0;
        D.alive = !P.isDead;
        D.lastSec = null;
        D.minute = false;
        D.above = false;
        D.nextBeat = 0;
      }
      // thời gian còn lại (bỏ qua phòng thử không giới hạn)
      const dur = g.matchDuration || 600;
      if (dur < 99 * 60 && g.matchStartTime) {
        const rem = dur - (Date.now() - g.matchStartTime) / 1000;
        M.final = rem <= 20 ? 2 : rem <= 60 ? 1 : 0;
        if (rem > 60) D.above = true;   // chỉ báo khi chính mình chứng kiến lúc vượt mốc (vào trận muộn thì thôi)
        if (rem <= 60 && D.above && !D.minute) {
          D.minute = true;
          this.playOneMinuteAlarm();
          if (g.addCombatLog) { try { g.addCombatLog('[[clock]] CÒN 1 PHÚT — dồn sức cho đòn quyết định!', 'alert'); } catch (e) { /* bỏ qua */ } }
        }
        const sec = Math.ceil(rem);
        if (sec >= 1 && sec <= 10 && sec !== D.lastSec) { D.lastSec = sec; this.playFinalSecondTick(sec); }
      }
      // máu, bị hạ, hồi sinh
      const alive = !P.isDead;
      const ratio = P.maxHp > 0 ? Math.max(0, P.hp / P.maxHp) : 1;
      const low = alive && ratio < 0.3 ? 1 - ratio / 0.3 : 0;
      M.lowHp = low;
      M.dead = !alive;
      if (low > 0 && now >= (D.nextBeat || 0)) {
        this.playHeartbeat(0.45 + 0.55 * low);
        D.nextBeat = now + 60 / (78 + 62 * low);
      }
      const lp = !alive ? 480 : low > 0 ? 2200 - 1400 * low : 20000;
      if (lp !== D.lp) { D.lp = lp; M.tone.frequency.setTargetAtTime(lp, now, lp < 20000 ? 0.25 : 0.8); }
      if (D.alive && !alive) this.playDeathSting();
      else if (D.alive === false && alive) this.playRespawnRise();
      D.alive = alive;
      // hạ gục
      const k = P.kills || 0;
      if (k > D.kills) { this.playKillConfirm(); this.musicHeat(0.3); }
      D.kills = k;
    }

    // âm SFX kịch tích: đi qua bus giao diện (không phụ thuộc âm lượng nhạc)
    dramaOut(gain = 1, wet = 0.15) {
      return this.voice({ bus: this.uiBus || this.masterGain, gain, wet });
    }

    // Vào trận: "BRAAAM" — ba lớp kèn đồng Rê trầm méo dày, lọc mở bừng rồi khép, trống lớn + trầm sâu
    playBattleStart() {
      const M = this.ensureMusic();
      if (!M || !this.musicEnabled()) return;
      const t = this.ctx.currentTime + 0.03;
      const out = this.ctx.createGain();
      out.gain.value = 0.75;
      out.connect(M.bus);
      setTimeout(() => { try { out.disconnect(); } catch (e) { /* đã ngắt */ } }, 9000);
      for (const m of [38, 45, 50]) this._mzBrass(out, t, m, 3.2, 1.35, false);
      this._mzBrass(out, t, 26, 3.2, 1.1, false);
      this._mzImpact(out, t, 1.2);
      this._mzTaiko(out, t + 1.6, 0.6, 1.1);
      this._mzTaiko(out, t + 1.75, 0.7, 1.1);
      this._mzTaiko(out, t + 1.9, 0.9, 1);
    }

    // tim đập "thình — thịch"
    playHeartbeat(k = 1) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.02;
      const out = this.dramaOut(0.9, 0);
      this.tone(out, t, { freq: 62, freqEnd: 40, sweep: 0.1, gain: 0.55 * k, attack: 0.006, dur: 0.22 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 140, gain: 0.35 * k, attack: 0.006, dur: 0.16 });
      this.tone(out, t + 0.17, { freq: 55, freqEnd: 36, sweep: 0.1, gain: 0.38 * k, attack: 0.006, dur: 0.2 });
    }

    // hạ gục địch: cú đấm trầm + ngân kim loại + kèn đồng chớp (đúng giọng của nhạc)
    playKillConfirm() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.02;
      const out = this.dramaOut(0.8, 0.35);
      this.tone(out, t, { freq: 95, freqEnd: 34, sweep: 0.7, gain: 0.5, attack: 0.003, dur: 1.1 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, gain: 0.45, attack: 0.003, dur: 0.6 });
      this.burst(out, t, { filter: 'highpass', freq: 3800, gain: 0.07, attack: 0.002, dur: 0.9 });
      this.metal(out, t, { f0: 620, ratios: [1, 2.01, 2.76, 4.07], decay: 1.4, gain: 0.07, click: 0.15 });
      const M = this._mz;
      if (M && this.musicEnabled()) {
        const o = this.ctx.createGain();
        o.gain.value = 0.6;
        o.connect(M.bus);
        setTimeout(() => { try { o.disconnect(); } catch (e) { /* đã ngắt */ } }, 5000);
        for (const m of [50, 57, 62]) this._mzBrass(o, t, m, 0.7, 1, false);
      }
    }

    // bị hạ: âm trầm tụt dần như quay chậm + gió hút
    playDeathSting() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.05;
      const out = this.dramaOut(0.7, 0.5);
      this.tone(out, t, { type: 'sawtooth', freq: 110, freqEnd: 36, sweep: 2.6, gain: 0.16, attack: 0.08, hold: 0.6, dur: 2.2, filter: 'lowpass', filterFreq: 420 });
      this.tone(out, t, { freq: 73.4, freqEnd: 30, sweep: 2.8, gain: 0.3, attack: 0.05, hold: 0.5, dur: 2.4 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400, freqEnd: 220, sweep: 2.4, Q: 1.4, gain: 0.18, attack: 0.3, dur: 2.4 });
    }

    // hồi sinh: tiếng dâng ngắn kết bằng trống
    playRespawnRise() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.03;
      const out = this.dramaOut(0.6, 0.3);
      this._mzRiser(out, t, 1.1);
      this._mzTaiko(out, t + 1.1, 0.9, 1);
    }

    // còn 1 phút: hai tiếng chuông trầm ngân dài
    playOneMinuteAlarm() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.03;
      const out = this.dramaOut(0.9, 0.5);
      for (const d of [0, 0.85]) {
        this.metal(out, t + d, { f0: 146.8, ratios: [1, 2.0, 2.76, 4.1, 5.4], decay: 2.4, gain: 0.22, click: 0.3 });
        this._mzTaiko(out, t + d, 0.8, 0.9);
      }
    }

    // 10 giây cuối: mỗi giây một tiếng "tách" + trống trầm, 3 giây cuối cao và gắt hơn
    playFinalSecondTick(n) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.02;
      const out = this.dramaOut(0.8, 0.1);
      const hot = n <= 3;
      this.burst(out, t, { filter: 'bandpass', freq: hot ? 4200 : 3000, Q: 5, gain: hot ? 0.4 : 0.28, attack: 0.0005, dur: 0.04 });
      this.tone(out, t, { freq: hot ? 1320 : 880, gain: hot ? 0.08 : 0.05, attack: 0.002, dur: 0.12 });
      this.tone(out, t, { freq: 70, freqEnd: 42, sweep: 0.15, gain: hot ? 0.5 : 0.32, attack: 0.003, dur: 0.35 });
    }
  });

  // Độ ác liệt cho nhạc trận: lắng nghe chính các tiếng súng / nổ / trúng đạn đang phát quanh xe mình
  const P = SoundEngine.prototype;
  const hook = (name, fn) => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = function () {
      try { fn.apply(this, arguments); } catch (e) { /* không để nhạc làm hỏng tiếng súng */ }
      return orig.apply(this, arguments);
    };
  };
  const near = (d, r) => Math.max(0, 1 - (d || 0) / r);   // 8 đơn vị game = 1 m
  hook('playCannonFire', function (type, ammo, d) { this.musicHeat(d > 0 ? 0.05 * near(d, 2400) : 0.08); });
  hook('playExplosionAtDistance', function (d) {
    const k = near(d, 2400);
    this.musicHeat(0.2 * k);
    if (d < 500) this.musicDuck(0.4 + 0.4 * (d / 500));
  });
  hook('playHullHit', function () { this.musicHeat(0.35); });
  hook('playIncomingWhistle', function () { this.musicHeat(0.15); });
  hook('playFlyby', function () { this.musicHeat(0.1); });
  hook('playGatlingShot', function (type, d) { this.musicHeat(d > 0 ? 0.006 * near(d, 2400) : 0.01); });
  hook('playMissileLaunch', function (d) { this.musicHeat(d > 0 ? 0.06 * near(d, 2400) : 0.08); });
  hook('playVehicleDestroyed', function () { this.musicHeat(0.15); });
  hook('playMissileWarning', function () { this.musicHeat(0.08); });
  hook('playLockWarning', function () { this.musicHeat(0.05); });
})();
