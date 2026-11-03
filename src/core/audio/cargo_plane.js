/**
 * TIẾNG MÁY BAY VẬN TẢI thả hòm tiếp tế (tổng hợp, không cần file ghi âm). Gắn thêm phương thức vào SoundEngine. Nạp sau
 * sound_engine.js.
 * - 4 cánh quạt 4 lá ~1020 vòng/phút: tần số cánh quét ~68 Hz + chuỗi họa âm; 4 động cơ lệch nhau vài phần nghìn -> tiếng
 *   phách "ù... ù..." chậm đặc trưng của máy bay cánh quạt nhiều động cơ
 * - ầm trầm dải rộng của động cơ + luồng khí, tiếng rít tuabin / gió xé chỉ nghe khi bay sát đầu
 * - xa: không khí hấp thụ âm cao, chỉ còn tiếng ù trầm (lowpass của spatial); bay qua: Doppler từ cao xuống thấp
 * Không có nhịp gọi (hết trận, rời trận) quá 3 s thì tự tắt dần, không kẹt tiếng (khựng khung ngắn không làm đứt tiếng).
 */

SoundEngine.mixin(class {
  ensureCargoPlane() {
    if (this.cargoAmb) return this.cargoAmb;
    if (!this.ctx || !this.masterGain || !this.pinkNoiseBuffer) return null;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.5;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    lp.connect(out);
    if (pan) { out.connect(pan); pan.connect(this.masterGain); } else out.connect(this.masterGain);
    const nodes = [];
    // 4 cánh quạt: răng cưa cho nhiều họa âm, mỗi chiếc lệch một chút
    const props = [0.9968, 0.999, 1.0012, 1.0037].map(mul => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 68 * mul;
      const g = ctx.createGain(); g.gain.value = 0.2;
      o.connect(g); g.connect(lp); o.start(t);
      nodes.push(o);
      return { o, mul };
    });
    const loop = (buf, rate, type, freq, Q, gain) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); s.start(t, Math.random() * (buf.duration || 1));
      nodes.push(s);
      return g;
    };
    // ầm trầm thân động cơ
    loop(this.brownNoiseBuffer || this.pinkNoiseBuffer, 0.8, 'lowpass', 240, 0.5, 0.75).connect(lp);
    // gió xé + rít tuabin: không qua lowpass khoảng cách, tự chỉnh theo độ gần
    const rush = loop(this.pinkNoiseBuffer, 1, 'bandpass', 900, 0.6, 0);
    rush.connect(out);
    const whine = ctx.createOscillator();
    whine.type = 'triangle'; whine.frequency.value = 1180;
    const whineG = ctx.createGain(); whineG.gain.value = 0;
    whine.connect(whineG); whineG.connect(out); whine.start(t);
    nodes.push(whine);
    this.cargoAmb = { out, lp, pan, props, rush, whine, whineG, nodes, spT: -1, sp: null, stopTimer: 0 };
    return this.cargoAmb;
  }

  stopCargoPlane() {
    const A = this.cargoAmb;
    if (!A) return;
    this.cargoAmb = null;
    clearTimeout(A.stopTimer);
    const t = this.ctx.currentTime;
    A.out.gain.cancelScheduledValues(t);
    A.out.gain.setTargetAtTime(0, t, 0.5);
    setTimeout(() => {
      for (const n of A.nodes) { try { n.stop(); } catch (e) { /* đã dừng */ } }
      A.out.disconnect();
      if (A.pan) A.pan.disconnect();
    }, 2800);
  }

  // Gọi mỗi khung hình khi có máy bay. s = { x, y, z, vx, vz, fade } (vận tốc đv/s, fade 0..1 ở 2 đầu đường bay); null -> tắt dần
  updateCargoPlane(s) {
    if (!s) { this.stopCargoPlane(); return; }
    const A = this.ensureCargoPlane();
    if (!A) return;
    const g = window.game, me = g && (g.audioListener ? g.audioListener() : g.player);
    if (!me) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const ly = Number.isFinite(me.y) ? me.y : s.y - 1000;
    const dx = s.x - me.x, dy = s.y - ly, dz = s.z - me.z, d = Math.max(1, Math.hypot(dx, dy, dz)), m = d / 8;
    // tính không gian ~8 lần / giây: có dò tia che khuất địa hình
    if (!A.sp || t - A.spT > 0.12) { A.sp = this.spatial(d, s); A.spT = t; }
    const sp = A.sp;
    // Doppler: vận tốc tiến lại gần tai (đv/s -> m/s), âm thanh 343 m/s
    const closing = -(dx * s.vx + dz * s.vz) / d / 8, dop = 343 / Math.max(120, 343 - closing);
    const beat = 1 + Math.sin(t * 0.37) * 0.0015;   // vòng tua dao động rất nhẹ
    for (const P of A.props) P.o.frequency.setTargetAtTime(68 * P.mul * dop * beat, t, 0.18);
    A.lp.frequency.setTargetAtTime(Math.max(300, Math.min(2400, sp.lowpass)), t, 0.25);
    const near = Math.max(0, 1 - m / 320);
    A.rush.gain.setTargetAtTime(near * near * 0.32, t, 0.3);
    A.whine.frequency.setTargetAtTime(1180 * dop, t, 0.18);
    A.whineG.gain.setTargetAtTime(near * near * near * 0.012, t, 0.3);
    if (A.pan) A.pan.pan.setTargetAtTime(sp.pan * 0.75, t, 0.25);
    // vang xa: tiếng ù vẫn nghe được khắp chiến trường, trên đầu ù rất to nhưng không át tiếng pháo
    A.out.gain.setTargetAtTime(this.isMuted ? 0 : Math.min(0.34, sp.gain * 0.9) * (s.fade === undefined ? 1 : s.fade), t, 0.35);
    clearTimeout(A.stopTimer);
    A.stopTimer = setTimeout(() => this.stopCargoPlane(), 3000);
  }
});
