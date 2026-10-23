/**
 * TIẾNG MƯA & SẤM (tổng hợp, không cần file ghi âm). Gắn thêm phương thức vào SoundEngine. Nạp sau sound_engine.js.
 * - Mưa nặng hạt: lớp rào rào dải cao (vô số giọt đập lá, đất), lớp ào ào trầm (màn mưa xa), lộp độp giọt to rời rạc gần tai.
 *   Trong lòng hầm: mưa ngoài miệng hầm nghe đục & nhỏ, thêm tiếng nước nhỏ giọt vang trong hầm.
 *   Nhìn qua kính ngắm (ngồi trong xe): mưa gõ lộp bộp trên vỏ thép, tiếng ngoài nghẹt.
 * - Sấm: tiếng sét gần xé trời "toạc" rồi nổ đanh, sét xa chỉ còn tiếng ì ầm rền cuộn dài; đến trễ theo khoảng cách
 *   (âm thanh 343 m/s — chớp trước, sấm sau).
 */

SoundEngine.mixin(class {
  // k: độ nặng hạt (0 = tắt), cover: 1 = đang ở dưới mái che (lòng hầm cứ điểm)
  updateRain(k = 0, cover = 0) {
    if (!this.ctx || !this.pinkNoiseBuffer || !this.masterGain) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.rainAmb) {
      if (!(k > 0)) return;
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.masterGain);
      const loop = (buf, rate) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * 2); return s; };
      // rào rào: nhiễu hồng lọc dải cao, rộng
      const hiS = loop(this.pinkNoiseBuffer, 1);
      const hiHp = ctx.createBiquadFilter(); hiHp.type = 'highpass'; hiHp.frequency.value = 900; hiHp.Q.value = 0.5;
      const hiLp = ctx.createBiquadFilter(); hiLp.type = 'lowpass'; hiLp.frequency.value = 9000; hiLp.Q.value = 0.4;
      const hiG = ctx.createGain(); hiG.gain.value = 0.55;
      hiS.connect(hiHp); hiHp.connect(hiLp); hiLp.connect(hiG);
      // ào ào trầm: màn mưa xa đổ xuống rừng / mặt đất
      const loS = loop(this.brownNoiseBuffer || this.pinkNoiseBuffer, 0.9);
      const loBp = ctx.createBiquadFilter(); loBp.type = 'bandpass'; loBp.frequency.value = 420; loBp.Q.value = 0.6;
      const loG = ctx.createGain(); loG.gain.value = 0.5;
      loS.connect(loBp); loBp.connect(loG);
      // lọc chung: trong hầm / trong xe nghe đục
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000; lp.Q.value = 0.5;
      hiG.connect(lp); loG.connect(lp); lp.connect(out);
      // lớp giọt to lộp độp (gần tai): bus riêng để lên lịch từng giọt
      const drops = ctx.createGain(); drops.gain.value = 1;
      drops.connect(out);
      this.rainAmb = { out, lp, hiG, loG, drops, k: 0, cover: 0, nextDrops: 0, nextDrip: 0 };
    }
    const R = this.rainAmb;
    const interior = !!this.interior;
    R.k = k; R.cover = cover;
    const vol = k > 0 ? 0.16 * (0.55 + 0.45 * k) * (cover ? 0.4 : 1) * (interior ? 0.7 : 1) : 0;
    R.out.gain.setTargetAtTime(this.isMuted ? 0 : vol, t, k > 0 ? 0.8 : 0.5);
    R.lp.frequency.setTargetAtTime(cover ? 1300 : interior ? 2400 : 12000, t, 0.4);
    R.hiG.gain.setTargetAtTime(0.4 + 0.3 * k, t, 1);
    if (!(k > 0) || this.isMuted) return;
    // lên lịch giọt to cho 0,6 s tới (đi theo nhịp gọi ~4 lần / giây)
    if (t >= R.nextDrops) {
      const n = Math.round((interior ? 26 : 14) * k * (cover ? 0.15 : 1));
      for (let i = 0; i < n; i++) {
        const tp = t + 0.05 + Math.random() * 0.6;
        if (interior) {
          // mưa gõ trên vỏ thép: "tách / bộp" kim loại ngắn
          this.burst(R.drops, tp, { buffer: this.noiseBuffer, filter: 'bandpass', freq: 1800 + Math.random() * 2600, Q: 3, gain: 0.25 + Math.random() * 0.35, attack: 0.001, dur: 0.035 });
        } else {
          this.burst(R.drops, tp, { buffer: this.noiseBuffer, filter: 'bandpass', freq: 2500 + Math.random() * 4500, Q: 1.4, gain: 0.08 + Math.random() * 0.18, attack: 0.001, dur: 0.025 });
        }
      }
      R.nextDrops = t + 0.6;
    }
    // trong lòng hầm: nước nhỏ giọt từ mạch trần xuống vũng, "tõm" vang
    if (cover && t >= R.nextDrip) {
      const tp = t + Math.random() * 0.3, f = 900 + Math.random() * 900;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, tp);
      o.frequency.exponentialRampToValueAtTime(f * 1.9, tp + 0.06);
      g.gain.setValueAtTime(0.0001, tp);
      g.gain.linearRampToValueAtTime(0.18, tp + 0.004);
      g.gain.setTargetAtTime(0.0001, tp + 0.004, 0.03);
      o.connect(g); g.connect(R.out);
      if (this.reverb) { const s = ctx.createGain(); s.gain.value = 0.8; g.connect(s); s.connect(this.reverb); }
      o.start(tp); o.stop(tp + 0.25);
      R.nextDrip = t + 0.4 + Math.random() * 1.6;
    }
  }

  // Sấm: d = khoảng cách tia sét (đơn vị game, 8 = 1 m), pos = { x, z } chỗ sét đánh
  thunder(d, pos) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const m = Math.max(30, d / 8);
    // chớp trước, sấm sau: trễ đúng theo tốc độ âm thanh (tối đa ~1,5 s cho sét xa để không lệch quá xa khỏi ánh chớp)
    const t0 = ctx.currentTime + Math.min(1.5 + m / 2000, m / 343);
    const sp = this.spatial(d, pos);
    const near = m < 140;
    const out = ctx.createGain();
    out.gain.value = Math.min(1.1, 0.95 / (1 + m / 260)) * (this.interior ? 0.75 : 1);
    let node = out;
    if (sp.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan * 0.6; out.connect(p); node = p; }
    node.connect(this.masterGain);
    if (this.reverb) { const s = ctx.createGain(); s.gain.value = 0.7; out.connect(s); s.connect(this.reverb); }
    const brown = this.brownNoiseBuffer || this.pinkNoiseBuffer;
    if (near) {
      // sét gần: tiếng "toạc" xé không khí (nhiễu sáng quét xuống) rồi một tiếng nổ đanh như pháo
      this.burst(out, t0, { buffer: this.noiseBuffer, filter: 'highpass', freq: 5000, freqEnd: 900, sweep: 0.18, gain: 0.9, attack: 0.002, dur: 0.28 });
      for (let i = 0; i < 4; i++) this.burst(out, t0 + 0.02 + Math.random() * 0.15, { buffer: this.noiseBuffer, filter: 'bandpass', freq: 1500 + Math.random() * 2000, Q: 0.8, gain: 0.6, attack: 0.001, dur: 0.08 });
      this.burst(out, t0 + 0.12, { buffer: brown, filter: 'lowpass', freq: 900, freqEnd: 120, sweep: 0.6, drive: 2.5, gain: 1.2, attack: 0.004, dur: 1.1 });
    }
    // ì ầm rền cuộn: nhiều đợt nhiễu trầm chồng nhau, to nhỏ thất thường, kéo dài 3-7 s (sét càng xa càng trầm, càng dài)
    const len = 3 + Math.min(4, m / 250) + Math.random() * 1.5;
    const lpf = Math.max(140, 520 - m * 0.25);
    const rolls = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < rolls; i++) {
      const u = i / rolls;
      const tp = t0 + (near ? 0.25 : 0) + u * len * (0.6 + Math.random() * 0.5);
      this.burst(out, tp, {
        buffer: brown, filter: 'lowpass', freq: lpf * (0.8 + Math.random() * 0.5), Q: 0.7, drive: near ? 1.8 : 1.2,
        gain: (0.5 + Math.random() * 0.6) * (1 - u * 0.55), attack: 0.08 + Math.random() * 0.25, dur: 0.9 + Math.random() * 1.6
      });
    }
    // nền rền dài phía dưới các đợt
    this.burst(out, t0, { buffer: brown, filter: 'lowpass', freq: lpf * 0.7, Q: 0.5, gain: 0.45, attack: 0.4, dur: len });
  }
});
