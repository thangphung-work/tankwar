/**
 * ÂM THANH KHI NGẮM QUA KÍNH (NGHE TỪ TRONG XE) + TIẾNG TÊN LỬA BÁM THEO VIÊN ĐẠN THẬT.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js, weapon_fire.js, gatling.js.
 *
 * - setInterior(on): nhìn qua kính ngắm = ngồi trong xe. Tiếng bên ngoài (nổ, xe khác bắn, đạn rơi) bị vỏ thép chặn
 *   bớt âm cao và nhỏ đi (spatial() đọc this.interior); phát bắn của chính mình thêm lớp nghe từ trong khoang:
 *   áp suất dội trong khoang kín "ĐỘP" đè ngực, khối pháo giật lùi đập vào giá "KẠNG", thép tháp ngân "boong",
 *   đồ đạc trong xe rung lách cách, pháo về vị trí "cộc".
 * - startMissileTrack / updateMissileTrack / stopMissileTrack: tiếng động cơ tên lửa là một kênh liên tục, game cập nhật
 *   mỗi khung hình theo vị trí THẬT của tên lửa (khoảng cách, hướng, vận tốc lại gần -> Doppler, hết nhiên liệu ->
 *   chỉ còn tiếng xé gió) và tắt đúng lúc nổ. Tên lửa địch lao thẳng vào mình: gầm to dần, rít cao dần.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 1. NGHE TỪ TRONG XE KHI NHÌN QUA KÍNH NGẮM
  // ===========================================================================
  setInterior(on, tankType = 'ALL_ROUNDER') {
    this.interior = on ? 1 : 0;
    this.interiorType = on ? tankType : null;
  }

  // Lớp tiếng trong khoang cho phát bắn của chính mình (gọi từ playCannonFire / playGatlingShot / playMissileLaunch)
  // kind: 'cannon' | 'arty' | 'gatling' | 'mg' | 'missile'
  interiorShot(kind, t) {
    if (!this.ready() || !this.interior) return;
    t = t === undefined ? this.ctx.currentTime : t;
    const R = Math.random;
    if (kind === 'gatling') {
      // hộp khóa nòng 6 nòng đập từng nhịp + bệ tháp truyền rung xuống khoang: "tạch" kim loại khô + "thụp" trầm ngắn
      const out = this.voice({ bus: this.weaponBus, gain: 0.5, wet: 0.02 });
      this.burst(out, t, { filter: 'bandpass', freq: 1900 + R() * 400, Q: 2.2, gain: 0.16, attack: 0.0004, dur: 0.018 });
      this.tone(out, t, { freq: 88, freqEnd: 52, sweep: 0.04, drive: 2, gain: 0.32, attack: 0.001, dur: 0.05 });
      return;
    }
    if (kind === 'mg') {
      // súng máy 12.7 trên giá điều khiển từ xa: nóc thép ngay trên đầu dội "thùng" theo từng phát
      const out = this.voice({ bus: this.weaponBus, gain: 0.55, wet: 0.02 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 2, gain: 0.55, attack: 0.001, dur: 0.07 });
      this.burst(out, t + 0.002, { filter: 'bandpass', freq: 2600, Q: 1.8, gain: 0.07, attack: 0.0005, dur: 0.02 });
      return;
    }
    if (kind === 'missile') {
      // ống phóng trên nóc: liều đẩy dội xuống khoang "thụp", giá phóng rung lách cách
      const out = this.voice({ bus: this.weaponBus, gain: 0.6, wet: 0.02 });
      this.tone(out, t, { freq: 70, freqEnd: 38, sweep: 0.15, drive: 2.5, gain: 0.9, attack: 0.001, dur: 0.28 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2, gain: 0.7, attack: 0.001, dur: 0.16 });
      this.burst(out, t + 0.02, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2400, Q: 0.7, gain: 0.45, attack: 0.002, dur: 0.22 });
      return;
    }
    // Pháo 120 mm (hoặc 155 hạ nòng bắn thẳng) nghe từ ghế pháo thủ
    const big = kind === 'arty';
    const out = this.voice({ bus: this.blastBus ? this.blastBus(big) : this.weaponBus, gain: 0.3, wet: 0.03 });
    // (1) sóng áp suất trong khoang kín: "ĐỘP" siêu trầm đè ngực, ép màng nhĩ
    this.tone(out, t, { freq: big ? 54 : 62, freqEnd: big ? 30 : 34, sweep: 0.3, drive: 3, gain: big ? 2.2 : 2.0, attack: 0.0015, dur: big ? 0.55 : 0.45 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, drive: 2.5, gain: 2.2, attack: 0.002, dur: 0.3 });
    // (2) khối pháo vài tấn giật lùi hết hành trình, đập vào giá: "KẠNG" thép đặc ngay sát tai
    const tr = t + (big ? 0.016 : 0.012);
    this.burst(out, tr, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, drive: 3, gain: 2.6, attack: 0.0008, dur: 0.11 });
    this.burst(out, tr, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1250, Q: 1.3, drive: 2, gain: 1.4, attack: 0.0005, dur: 0.06 });
    // (3) thép tháp pháo / thân xe ngân "boong" sau cú đập (dao động riêng của vỏ thép dày, tắt ~0,6 s)
    this.modal(out, tr, { f0: big ? 118 : 142, ratios: [1, 1.52, 2.21, 2.93, 3.82], T: big ? 0.8 : 0.65, gain: 0.55, hard: 0.85, tilt: 0.7 });
    // (4) đồ đạc trong xe (hộp đạn, dây, nắp thiết bị) rung lách cách
    this.burst(out, t + 0.02, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.6, gain: 1.1, attack: 0.003, dur: 0.32 });
    for (let i = 0; i < 3; i++) {
      this.metal(out, t + 0.03 + R() * 0.18, { f0: 900 + R() * 1400, ratios: [1, 2.3], decay: 0.05, gain: 0.08, click: 0.3 });
    }
    // (5) bộ phục hồi đẩy pháo về vị trí bắn: "cộc" đục cuối hành trình
    const tb = t + (big ? 0.42 : 0.3) + R() * 0.03;
    this.burst(out, tb, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520, drive: 2, gain: 1.1, attack: 0.001, dur: 0.08 });
    this.burst(out, tb, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 1.4, gain: 0.45, attack: 0.0006, dur: 0.04 });
    this.duck(0.18, big ? 1.4 : 1.1);
  }

  // ===========================================================================
  // 2. TIẾNG TÊN LỬA BÁM THEO VIÊN ĐẠN THẬT
  // ===========================================================================
  /**
   * Mở kênh tiếng động cơ cho một tên lửa / đạn phản lực. delay: số giây tới lúc động cơ hành trình bắt lửa.
   * opts.big: tên lửa bệ đột nóc (động cơ to hơn quả ATGM xe trinh sát) — gầm trầm dày hơn, rít to hơn
   */
  startMissileTrack(delay = 0, opts = null) {
    const big = !!(opts && opts.big);
    if (!this.ready()) return null;
    this._trackN = this._trackN || 0;
    if (this._trackN >= 6) return null;
    this._trackN++;
    const ctx = this.ctx, t = ctx.currentTime;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * 2); return s; };
    const env = ctx.createGain(); env.gain.value = 0;
    const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.Q.value = 0.5; air.frequency.value = 16000;
    const am = ctx.createGain(); am.gain.value = 1;
    // gầm phản lực nhiên liệu rắn (dải rộng) + xì xé gió (cao) + gầm trầm + lách tách ngọn lửa
    const roar = loop(this.pinkNoiseBuffer);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.5; bp.frequency.value = 1150;
    const rg = ctx.createGain(); rg.gain.value = 1.5;
    const hiss = loop(this.noiseBuffer);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const hg = ctx.createGain(); hg.gain.value = 0.2;
    const low = loop(this.brownNoiseBuffer);
    const lowF = ctx.createBiquadFilter(); lowF.type = 'lowpass'; lowF.frequency.value = big ? 200 : 260;
    const lg = ctx.createGain(); lg.gain.value = 0.7;
    const crk = loop(this.crackleBuffer);
    const crkF = ctx.createBiquadFilter(); crkF.type = 'lowpass'; crkF.frequency.value = 1500;
    const cg = ctx.createGain(); cg.gain.value = 0.18;
    // ngọn lửa cháy không đều: nhiễu ~30 Hz điều biên
    const rough = loop(this.pinkNoiseBuffer);
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 30;
    const rd = ctx.createGain(); rd.gain.value = 3;
    roar.connect(bp); bp.connect(rg); rg.connect(am);
    low.connect(lowF); lowF.connect(lg); lg.connect(am);
    crk.connect(crkF); crkF.connect(cg); cg.connect(am);
    rough.connect(rlp); rlp.connect(rd); rd.connect(am.gain);
    am.connect(air);
    hiss.connect(hp); hp.connect(hg); hg.connect(air);   // xé gió không bị điều biên theo ngọn lửa
    // TIẾNG RÍT: luồng khí siêu âm phụt qua loa phụt rít cao dải hẹp (~2 kHz, rung nhẹ theo ngọn lửa) + tiếng rít xé gió
    // dải hẹp cao hơn khi lao nhanh — cả hai lệch cao độ theo Doppler (lao lại gần rít lên, vụt qua rồi tụt xuống)
    const wh = ctx.createOscillator(); wh.type = 'sawtooth'; wh.frequency.value = big ? 1750 : 2100;
    const vib = ctx.createOscillator(); vib.frequency.value = 6.5;
    const vibG = ctx.createGain(); vibG.gain.value = 30;
    vib.connect(vibG); vibG.connect(wh.frequency);
    const whBp = ctx.createBiquadFilter(); whBp.type = 'bandpass'; whBp.Q.value = 3; whBp.frequency.value = big ? 1900 : 2300;
    const whG = ctx.createGain(); whG.gain.value = 0;
    wh.connect(whBp); whBp.connect(whG); whG.connect(air);
    const scr = loop(this.noiseBuffer);
    const scrBp = ctx.createBiquadFilter(); scrBp.type = 'bandpass'; scrBp.Q.value = 8; scrBp.frequency.value = 3400;
    const scrG = ctx.createGain(); scrG.gain.value = 0;
    scr.connect(scrBp); scrBp.connect(scrG); scrG.connect(air);
    wh.start(t); vib.start(t);
    air.connect(env);
    let tail = env;
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); env.connect(pan); tail = pan; }
    tail.connect(this.weaponBus);
    let send = null;
    if (this.reverb) { send = ctx.createGain(); send.gain.value = 0.25; tail.connect(send); send.connect(this.reverb); }
    return { t0: t + Math.max(0, delay), env, air, bp, hp, rg, lg, cg, hg, pan, send, big, wh, whBp, whG, scrBp, scrG,
      srcs: [roar, hiss, low, crk, rough, wh, vib, scr], done: false };
  }

  /**
   * Cập nhật mỗi khung hình. o: { dist (đơn vị game), pos {x,z}, vr (vận tốc lại gần, đv/giây ~ m/giây thật),
   * speed (đv/giây), burning (động cơ còn cháy) }
   */
  updateMissileTrack(h, o) {
    if (!h || h.done || !this.ready()) return;
    const now = this.ctx.currentTime, at = Math.max(now, h.t0), tc = 0.04;
    const sp = this.spatial(o.dist, o.pos);
    const m = Math.max(0, o.dist) / 8;
    // gần thì to hẳn (tên lửa lao sát / vừa rời ống), xa nhỏ dần
    let g = (h.big ? 1.3 : 1) / (1 + m / 20);
    if (this.interior) g *= 0.75;
    // Doppler: lại gần rít cao, vụt qua rồi tụt trầm (chặn biên để tai còn nghe ra)
    const c = 343, vr = Math.max(-300, Math.min(300, o.vr || 0));
    const dop = Math.max(0.55, Math.min(1.9, c / (c - vr)));
    const lp = Math.max(700, Math.min(16000, 4200 * Math.pow(100 / Math.max(1, m), 0.9)));
    const burn = o.burning ? 1 : 0;
    const wind = Math.min(1, (o.speed || 0) / 300);
    h.env.gain.setTargetAtTime(g, at, tc);
    h.air.frequency.setTargetAtTime(this.interior ? Math.min(lp, 2600) : lp, at, tc);
    h.bp.frequency.setTargetAtTime(1150 * dop, at, tc);
    h.hp.frequency.setTargetAtTime(2600 * dop, at, tc);
    h.rg.gain.setTargetAtTime((h.big ? 2.0 : 1.5) * burn, at, 0.06);
    h.lg.gain.setTargetAtTime((h.big ? 1.3 : 0.7) * burn, at, 0.06);
    if (h.wh) {
      h.wh.frequency.setTargetAtTime((h.big ? 1750 : 2100) * dop, at, tc);
      h.whBp.frequency.setTargetAtTime((h.big ? 1900 : 2300) * dop, at, tc);
      h.whG.gain.setTargetAtTime((h.big ? 0.1 : 0.07) * burn, at, 0.06);
      h.scrBp.frequency.setTargetAtTime(3400 * dop, at, tc);
      h.scrG.gain.setTargetAtTime((h.big ? 0.4 : 0.28) * burn + 0.3 * wind, at, 0.06);
    }
    h.cg.gain.setTargetAtTime(0.18 * burn, at, 0.06);
    h.hg.gain.setTargetAtTime(0.2 + 0.25 * wind * (1 - burn), at, 0.06);   // tắt máy: chỉ còn tiếng xé gió
    if (h.pan) h.pan.pan.setTargetAtTime(sp.pan, now, tc);
  }

  /** Tên lửa nổ / biến mất: tắt nhanh kênh tiếng */
  stopMissileTrack(h) {
    if (!h || h.done) return;
    h.done = true;
    this._trackN = Math.max(0, (this._trackN || 1) - 1);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    h.env.gain.cancelScheduledValues(now);
    h.env.gain.setTargetAtTime(0, now, 0.02);
    for (const s of h.srcs) { try { s.stop(now + 0.25); } catch (e) { /* đã dừng */ } }
  }
});
