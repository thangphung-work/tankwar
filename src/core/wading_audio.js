/**
 * TIẾNG XE LỘI NƯỚC (procedural, gắn thêm vào SoundEngine — xem src/core/audio.js)
 * - Nước óc ách quanh thân xe: nhiễu hồng lọc dải trung, to nhỏ chậm ngẫu nhiên (sóng vỗ vào thân)
 * - Nước rẽ xè xè ở mũi: nhiễu trắng dải cao, to dần theo tốc độ
 * - Tiếng ục ục trầm của khối nước bị thân xe đẩy: nhiễu nâu lọc thấp, theo độ sâu
 * - Tiếng toé "ào" rời rạc (dày hơn khi chạy nhanh / ngập sâu), bong bóng nước lục bục
 * - Lao xuống nước khi đang chạy: một tiếng "ào" lớn
 * updateWading(depth, speedRatio, o) gọi mỗi khung hình từ game.js; depth theo đơn vị game (8 = 1 m).
 */
(function () {
  if (typeof SoundEngine === 'undefined') return;
  const rand = (a, b) => a + Math.random() * (b - a);

  SoundEngine.prototype.buildWading = function () {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.vehicleBus || this.masterGain || ctx.destination);
    const loop = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 2); return s; };
    // Bộ điều biên chậm ngẫu nhiên (nhiễu hồng chạy chậm qua lọc thấp vài Hz)
    const slowMod = (hz, depth) => {
      const m = loop(this.pinkNoiseBuffer, 0.5);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hz;
      const d = ctx.createGain(); d.gain.value = depth;
      m.connect(f); f.connect(d);
      return d;
    };
    // nước óc ách
    const sl = loop(this.pinkNoiseBuffer, 0.8);
    const slF = ctx.createBiquadFilter(); slF.type = 'bandpass'; slF.frequency.value = 480; slF.Q.value = 0.9;
    const slAm = ctx.createGain(); slAm.gain.value = 1;
    slowMod(5, 3.5).connect(slAm.gain);
    const slG = ctx.createGain(); slG.gain.value = 0;
    sl.connect(slF); slF.connect(slAm); slAm.connect(slG); slG.connect(out);
    // nước rẽ xè xè
    const hs = loop(this.noiseBuffer);
    const hsF = ctx.createBiquadFilter(); hsF.type = 'bandpass'; hsF.frequency.value = 2400; hsF.Q.value = 0.6;
    const hsF2 = ctx.createBiquadFilter(); hsF2.type = 'lowpass'; hsF2.frequency.value = 6500;
    const hsAm = ctx.createGain(); hsAm.gain.value = 1;
    slowMod(9, 1.6).connect(hsAm.gain);
    const hsG = ctx.createGain(); hsG.gain.value = 0;
    hs.connect(hsF); hsF.connect(hsF2); hsF2.connect(hsAm); hsAm.connect(hsG); hsG.connect(out);
    // ục ục trầm
    const gu = loop(this.brownNoiseBuffer, 0.9);
    const guF = ctx.createBiquadFilter(); guF.type = 'lowpass'; guF.frequency.value = 230; guF.Q.value = 1.4;
    const guAm = ctx.createGain(); guAm.gain.value = 1;
    slowMod(3, 2.5).connect(guAm.gain);
    const guG = ctx.createGain(); guG.gain.value = 0;
    gu.connect(guF); guF.connect(guAm); guAm.connect(guG); guG.connect(out);
    this._wade = { out, slG, slF, hsG, hsF, guG, next: 0, bub: 0, prevDepth: 0 };
  };

  // Máy ngập nước: vài nhịp nổ hụt nghẹn nước "bụp... bụp", ộc nước, xì hơi nóng, bong bóng sủi lên rồi tắt hẳn
  SoundEngine.prototype.playEngineFlood = function () {
    if (!this.ctx || !this.brownNoiseBuffer) return;
    if (!this._wade) this.buildWading();
    const out = this._wade.out, t = this.ctx.currentTime + 0.02;
    let tt = t;
    for (let i = 0; i < 5; i++) {
      const g = 0.55 * (1 - i * 0.16);
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220 - i * 25, drive: 2.5, gain: g, attack: 0.004, dur: 0.16 });
      this.burst(out, tt + 0.03, { filter: 'bandpass', freq: rand(500, 900), Q: 1.2, gain: g * 0.35, attack: 0.01, dur: 0.25 });
      tt += 0.22 + i * 0.12 + Math.random() * 0.08;
    }
    this.burst(out, t + 0.15, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, freqEnd: 150, sweep: 1.2, gain: 0.45, attack: 0.05, dur: 1.4 });   // ộc nước
    this.burst(out, t + 0.4, { filter: 'highpass', freq: 3500, gain: 0.2, attack: 0.2, dur: 1.8 });                                                   // xì hơi nóng
    for (let i = 0; i < 14; i++) {
      const f0 = rand(220, 520);
      this.tone(out, t + 0.3 + i * rand(0.06, 0.16), { freq: f0, freqEnd: f0 * rand(1.6, 2.3), sweep: 0.05, gain: rand(0.02, 0.05), attack: 0.003, dur: 0.07 });
    }
  };

  SoundEngine.prototype.updateWading = function (depth, speedRatio, o = {}) {
    if (!this.ctx || !this.pinkNoiseBuffer || !this.brownNoiseBuffer) return;
    if (!this._wade) this.buildWading();
    const W = this._wade, t = this.ctx.currentTime;
    const inW = depth > 0.6 && !o.dead && !this.isMapMuted;
    const k = inW ? Math.min(1.2, depth / 10) : 0;       // ngập ~1.25 m = 1
    const v = Math.max(0, Math.min(1.2, speedRatio || 0));
    const stall = inW && !!o.stall;                       // bánh / xích quẫy tại chỗ ở chỗ nước quá sâu
    const churn = Math.min(1.2, v + (stall ? 0.7 : 0));
    this._wadeK = inW ? Math.min(1, depth / 3) : 0;       // audio.js giảm tiếng sỏi lạo xạo khi gầm ngập nước

    W.slG.gain.setTargetAtTime(inW ? (0.08 + 0.32 * k) * (0.3 + 0.7 * Math.min(1, churn * 1.3)) : 0, t, 0.15);
    W.slF.frequency.setTargetAtTime(380 + churn * 420, t, 0.2);
    W.hsG.gain.setTargetAtTime(inW ? 0.09 * Math.pow(churn, 1.5) * (0.5 + 0.5 * k) : 0, t, 0.12);
    W.hsF.frequency.setTargetAtTime(1800 + churn * 1200, t, 0.2);
    W.guG.gain.setTargetAtTime(inW ? 0.5 * k * (0.35 + 0.65 * churn) : 0, t, 0.25);

    // Lao xuống nước khi đang chạy: "ào" lớn
    if (inW && W.prevDepth < 1.2 && depth >= 1.2 && v > 0.2) {
      const g = Math.min(1, 0.4 + v * 0.6);
      this.burst(W.out, t, { filter: 'lowpass', freq: 2600, freqEnd: 700, sweep: 0.8, gain: 0.55 * g, attack: 0.02, dur: 1.0 });
      this.burst(W.out, t + 0.03, { filter: 'highpass', freq: 2200, gain: 0.22 * g, attack: 0.01, dur: 0.8 });
      this.burst(W.out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, gain: 0.5 * g, attack: 0.01, dur: 0.35 });
    }
    W.prevDepth = inW ? depth : 0;
    if (!inW) return;

    const look = 0.12;
    // Tiếng toé rời rạc: sóng vỗ thân, nước tạt từ xích / bánh
    const rate = (0.7 + churn * 7) * (0.5 + k);
    if (W.next < t) W.next = t + Math.random() * 0.05;
    while (W.next < t + look) {
      const tt = W.next;
      const f = rand(500, 1500);
      const g = (0.05 + 0.12 * Math.min(1, churn)) * rand(0.5, 1.2) * (0.6 + 0.4 * k);
      this.burst(W.out, tt, { filter: 'bandpass', freq: f, freqEnd: f * 0.55, sweep: 0.3, Q: 0.9, gain: g, attack: rand(0.01, 0.04), dur: rand(0.18, 0.45) });
      if (Math.random() < 0.35) this.burst(W.out, tt + 0.01, { filter: 'highpass', freq: 3000, gain: g * 0.45, attack: 0.005, dur: rand(0.12, 0.3) });
      W.next = tt + (1 / rate) * rand(0.4, 1.6);
    }
    // Bong bóng lục bục (máy nổ dưới nước, khí thoát từ gầm)
    if (W.bub < t) W.bub = t + Math.random() * 0.1;
    while (W.bub < t + look) {
      const tt = W.bub;
      const f0 = rand(260, 620) * (1.2 - 0.4 * Math.min(1, k));
      this.tone(W.out, tt, { freq: f0, freqEnd: f0 * rand(1.5, 2.2), sweep: 0.04, gain: rand(0.012, 0.03) * (0.4 + k), attack: 0.003, dur: 0.06 });
      W.bub = tt + rand(0.06, 0.35) / (0.4 + k + churn * 0.5);
    }
  };
})();
