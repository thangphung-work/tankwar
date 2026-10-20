/**
 * ÂM THANH TRONG XE: nạp đạn, bíp cảnh báo radar, khóa mục tiêu, bộ đàm, kèn chiến thắng.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 4. NẠP ĐẠN TỰ ĐỘNG / NHẬN TIẾP TẾ
  // ===========================================================================
  playReloadDone() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.7, wet: 0.04 });
    // Đẩy đạn vào buồng nòng (trượt) rồi khối khóa nòng đóng (tiếng đục nặng)
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 1.0, gain: 0.18, attack: 0.03, dur: 0.16 });
    this.burst(out, t + 0.22, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2.5, gain: 0.9, attack: 0.001, dur: 0.12 });
    this.burst(out, t + 0.22, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1200, Q: 1.2, gain: 0.25, attack: 0.001, dur: 0.05 });
  }

  // Nòng 6 nòng nguội lại: chỉ còn tiếng rơ-le điện khẽ + xì hơi nóng tắt dần (không có tiếng nạp đạn)
  playGatlingCooled() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.3, wet: 0.03 });
    this.metal(out, t, { f0: 1800, ratios: [1, 2.1], decay: 0.04, gain: 0.03, click: 0.15 });
    this.burst(out, t, { filter: 'highpass', freq: 4000, gain: 0.03, attack: 0.05, dur: 0.6 });
  }

  // Va chạm kim loại tổng quát (giữ tương thích API cũ)
  playMetalClank(delay = 0, volume = 0.5, freq = 440) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const out = this.voice({ bus: this.weaponBus, gain: 1, wet: 0.05 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: Math.max(300, Math.min(2000, freq * 2)), Q: 1.1, drive: 2, gain: volume * 0.8, attack: 0.001, dur: 0.07 });
  }

  // ===========================================================================
  // 5. ĐIỆN TỬ TRONG XE (cảnh báo, khóa mục tiêu, bộ đàm) — qua dải tần tai nghe nội bộ
  // ===========================================================================
  headset(gain = 1) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = gain;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    input.connect(hp);
    hp.connect(lp);
    lp.connect(this.uiBus);
    return input;
  }

  // Chống loạn tiếng điện tử trong xe: mỗi loại tiếng có khoảng nghỉ tối thiểu; tiếng quan trọng (tên lửa lao tới,
  // bị chiếu laser) vừa kêu thì các tiếng phụ (ping báo vị trí, địch đến gần...) im trong ~1.5 s thay vì chồng lên nhau.
  // Xe tăng thật chỉ có vài tiếng báo trong tai nghe, mỗi tiếng một ý nghĩa rõ ràng.
  // prio: 5 tên lửa lao tới · 4 bị khóa / chiếu laser · 3 đầu dò tên lửa của mình · 2 thao tác khóa mục tiêu · 1 thông tin
  beepOk(kind, gap = 0, prio = 1) {
    const t = this.ctx.currentTime;
    const B = this._beep || (this._beep = { last: {}, hiT: -99, hiP: 0 });
    const last = B.last[kind] === undefined ? -99 : B.last[kind];
    if (t - last < gap) return false;
    if (prio < B.hiP && t - B.hiT < 1.5) return false;
    B.last[kind] = t;
    if (prio >= B.hiP || t - B.hiT >= 1.5) { B.hiP = prio; B.hiT = t; }
    return true;
  }

  // Cảnh báo radar (giữ cứ điểm sắp thua...): 4 tiếng trầm-cao xen kẽ, dịu (tam giác, không phải sóng vuông chói)
  playRadarAlert() {
    if (!this.ready() || !this.beepOk('radar', 6, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    for (let i = 0; i < 4; i++) {
      this.tone(out, t + i * 0.11, { type: 'triangle', freq: i % 2 ? 1250 : 950, gain: 0.08, attack: 0.004, hold: 0.07, dur: 0.02 });
    }
  }

  // Địch (đã biết vị trí) vừa áp sát: 1 (hoặc 2 khi rất gần) tiếng báo khẽ, không lặp liên tục
  playRadarProximityBeep(urgency = 1) {
    if (!this.ready() || !this.beepOk('prox', 6, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    const f = urgency > 1.5 ? 1320 : 1050;
    this.tone(out, t, { freq: f, gain: 0.1, attack: 0.006, hold: 0.06, dur: 0.05 });
    if (urgency > 1.5) this.tone(out, t + 0.14, { freq: f, gain: 0.1, attack: 0.006, hold: 0.06, dur: 0.05 });
  }

  // Đếm ngược vào trận: n = 3/2/1 bíp ngắn, n = 0 tiếng xuất kích dài + trầm
  playCountdownTick(n) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.8, wet: 0.3 });
    if (n > 0) {
      this.tone(out, t, { freq: 880, gain: 0.16, attack: 0.003, hold: 0.11, dur: 0.08 });
      return;
    }
    this.tone(out, t, { freq: 1320, gain: 0.15, attack: 0.003, hold: 0.42, dur: 0.3 });
    this.tone(out, t, { freq: 660, gain: 0.1, attack: 0.003, hold: 0.42, dur: 0.3 });
    this.tone(out, t, { type: 'triangle', freq: 110, gain: 0.22, attack: 0.005, hold: 0.25, dur: 0.4 });
  }

  // Khóa mục tiêu (TAB): 2 tiếng "tích" ngắn của máy ngắm
  playTargetLockSound() {
    if (!this.ready() || !this.beepOk('lock', 0.3, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    for (let i = 0; i < 2; i++) {
      this.tone(out, t + i * 0.08, { type: 'triangle', freq: 1000, gain: 0.06, attack: 0.003, hold: 0.035, dur: 0.02 });
    }
  }

  // Xác nhận (hạ càng xong, chiếm được cứ điểm): một tiếng liền ngắn
  playTargetLockAcquired() {
    if (!this.ready() || !this.beepOk('ack', 0.5, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    this.tone(out, t, { type: 'triangle', freq: 1480, gain: 0.06, attack: 0.006, hold: 0.22, dur: 0.05 });
  }

  playTargetLost() {
    if (!this.ready() || !this.beepOk('lost', 1, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    this.tone(out, t, { freq: 1100, gain: 0.09, attack: 0.005, hold: 0.08, dur: 0.03 });
    this.tone(out, t + 0.13, { freq: 740, gain: 0.09, attack: 0.005, hold: 0.1, dur: 0.04 });
  }

  // Đổi loại đạn: cơ cấu thật của từng loại (âm thanh cơ khí từ nhiễu lọc)
  //  pháo chính: khay chọn đạn trượt + chốt; súng máy: gạt bộ chọn băng; tên lửa: mô-tơ mở nắp ống phóng + chốt
  playAmmoSwitch(ammoType = 'NORMAL') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.45, wet: 0.04 });
    const clack = (tt, f, g) => {
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, Q: 1.8, gain: g, attack: 0.0006, dur: 0.03 });
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: g * 1.2, attack: 0.001, dur: 0.05 });
    };
    if (ammoType === 'ANTI_TANK_MISSILE') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, freqEnd: 1300, sweep: 0.32, Q: 8, gain: 0.07, attack: 0.08, dur: 0.32 });
      clack(t + 0.34, 1300, 0.16);
      // đầu dò bật nguồn: tiếng rít điện tử khẽ qua tai nghe
      this.tone(this.headset(0.6), t + 0.42, { type: 'sine', freq: 2400, freqEnd: 3100, sweep: 0.18, gain: 0.025, attack: 0.02, hold: 0.12, dur: 0.06 });
    } else if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY') {
      clack(t, 2100, 0.12);
      clack(t + 0.07, 1500, 0.1);
    } else {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, freqEnd: 950, sweep: 0.16, Q: 2.4, gain: 0.07, attack: 0.01, dur: 0.16 });
      clack(t + 0.18, 1100, 0.16);
    }
  }

  // Đầu dò tên lửa đang bám mục tiêu: tiếng "gừ" ngắt quãng, cao dần khi gần khóa xong (progress 0..1)
  playMissileSeek(progress = 0) {
    if (!this.ready() || !this.beepOk('seek', 0, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    const f = 420 + progress * 380;
    this.tone(out, t, { type: 'triangle', freq: f, gain: 0.05, attack: 0.006, hold: 0.07, dur: 0.02, vibrato: 38, vibratoDepth: f * 0.06 });
  }

  // Đầu dò đã khóa chắc mục tiêu: tiếng "tít" liền, cao và sạch
  playMissileLock() {
    if (!this.ready() || !this.beepOk('mlock', 0.3, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.75);
    this.tone(out, t, { type: 'triangle', freq: 1760, gain: 0.06, attack: 0.005, hold: 0.36, dur: 0.05 });
  }

  // Đã khóa, chờ phóng: nhắc rất khẽ để biết vẫn đang giữ khóa
  playMissileLockHold() {
    if (!this.ready() || !this.beepOk('mhold', 1.5, 1)) return;
    const t = this.ctx.currentTime;
    this.tone(this.headset(0.5), t, { freq: 1760, gain: 0.035, attack: 0.004, hold: 0.05, dur: 0.03 });
  }

  // Máy báo bị chiếu laser: m = 1 khóa súng (2 tiếng trầm-cao), m = 2 tia dẫn tên lửa (3 tiếng nhanh, cao hơn)
  playLockWarning(m = 1) {
    if (!this.ready() || !this.beepOk('lw' + m, m === 2 ? 0.8 : 2.5, 4)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.85);
    if (m === 2) {
      for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.1, { type: 'triangle', freq: 1500, gain: 0.08, attack: 0.003, hold: 0.05, dur: 0.02 });
    } else {
      this.tone(out, t, { type: 'triangle', freq: 880, gain: 0.07, attack: 0.003, hold: 0.08, dur: 0.02 });
      this.tone(out, t + 0.13, { type: 'triangle', freq: 1175, gain: 0.07, attack: 0.003, hold: 0.08, dur: 0.02 });
    }
  }

  // Tên lửa đang lao tới: cặp tiếng trầm-cao luân phiên "bíp-bốp" của máy báo động trong xe, dồn nhanh dần khi tên
  // lửa tới gần (urgency 0..1; game.js gọi mỗi 0.7 -> 0.3 s). Bản cũ là sóng vuông 1.7-2.2 kHz trượt giọng, gọi tới
  // 11 lần/giây -> nghe như còi rè chói tai. Âm tam giác cho tiếng tròn mà vẫn nổi rõ hơn mọi tiếng báo khác
  playMissileWarning(urgency = 0) {
    if (!this.ready() || !this.beepOk('mwarn', 0.25, 5)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    const u = Math.max(0, Math.min(1, urgency));
    const lo = 880 + u * 160, hi = lo * 1.335;   // quãng 4 đúng: rõ, không chát như quãng 2 / quãng 7
    const len = 0.085 - u * 0.025;
    this.tone(out, t, { type: 'triangle', freq: hi, gain: 0.085, attack: 0.004, hold: len, dur: 0.025 });
    this.tone(out, t + len + 0.03, { type: 'triangle', freq: lo, gain: 0.085, attack: 0.004, hold: len, dur: 0.03 });
  }

  // Bộ đàm: tiếng xẹt mở kênh + tiếng bíp xác nhận + xẹt đóng kênh
  playRadioChirp() {
    if (!this.ready() || !this.beepOk('radio', 3, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    this.burst(out, t, { filter: 'bandpass', freq: 1900, Q: 0.8, gain: 0.1, dur: 0.07 });
    this.tone(out, t + 0.07, { freq: 1450, gain: 0.07, attack: 0.004, hold: 0.06, dur: 0.03 });
    this.burst(out, t + 0.16, { filter: 'bandpass', freq: 2300, Q: 0.8, gain: 0.06, dur: 0.12 });
  }

  // Báo vị trí địch (radar trinh sát / đồng đội báo qua bộ đàm): 1 tiếng ping khẽ, tối đa ~1 lần mỗi 8 s —
  // đồng đội báo dồn dập thì chỉ kêu lần đầu, phần còn lại đọc trên bảng tin
  playReconPing() {
    if (!this.ready() || !this.beepOk('ping', 8, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.6, wet: 0.5 });
    this.tone(out, t, { freq: 1480, gain: 0.1, attack: 0.004, hold: 0.04, dur: 0.25 });
    this.tone(out, t + 0.32, { freq: 1480, gain: 0.03, attack: 0.004, hold: 0.03, dur: 0.2 });
  }

  // Kèn đồng chiến thắng: hợp âm trưởng phồng dần, âm sắc kèn đồng
  playVictoryFanfare() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.5, wet: 0.5 });
    const notes = [[261.6, 0], [329.6, 0.18], [392.0, 0.36], [523.3, 0.54]];
    for (const [f, d] of notes) {
      for (const det of [-4, 4]) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(600, t + d);
        lp.frequency.linearRampToValueAtTime(2600, t + d + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.linearRampToValueAtTime(0.09, t + d + 0.08);
        g.gain.setValueAtTime(0.09, t + 1.6);
        g.gain.setTargetAtTime(0.0001, t + 1.6, 0.25);
        osc.connect(lp);
        lp.connect(g);
        g.connect(out);
        osc.start(t + d);
        osc.stop(t + 2.8);
      }
    }
  }

  // Lá cây, cành nhỏ cọ xát khi xe lách vào bụi rậm
  playBushRustle() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.vehicleBus, gain: 0.9, wet: 0.1 });
    this.burst(out, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3600, Q: 0.6, gain: 1.6, attack: 0.06, dur: 0.5 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 700, Q: 0.9, gain: 0.16, attack: 0.08, dur: 0.38 });
    if (Math.random() < 0.5) this.snap(out, t + 0.05 + Math.random() * 0.2, 0.12, 5000, 1.5);
  }
});
