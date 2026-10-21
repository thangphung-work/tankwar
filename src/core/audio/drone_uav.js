/**
 * DRONE TRINH SÁT (màn hình điều khiển hỏa lực của pháo tự hành) — nghe qua micro gắn trên drone.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 *
 * Âm thanh quadcopter thật gồm:
 * - 4 cánh quạt: tần số cánh quét (BPF = vòng/phút / 60 x số cánh, ~150-260 Hz khi treo) + chuỗi họa âm giảm dần —
 *   tiếng "vo vo" đặc trưng. Bốn rotor không bao giờ quay đúng bằng nhau: bộ điều khiển bay liên tục chỉnh từng mô-tơ
 *   vài phần trăm để giữ thăng bằng -> các BPF lệch nhau tạo tiếng phách "ào ào" chao lên xuống, không đều
 * - Mô-tơ không chổi than: tiếng rít điện cao (tần số đảo pha = vòng quay x số cặp cực, ~7 x BPF/2), rất khẽ
 * - Nhiễu khí động của cánh: nhiễu dải rộng 0.8-3 kHz, bị "băm" theo nhịp cánh quét qua
 * - Gió thổi vào micro khi bay nhanh: tiếng ầm trầm, giật cục
 * Lực đẩy (vòng quay) tăng khi cất cánh / lên cao / tăng tốc; nghiêng cánh thì rotor một bên quay nhanh hơn bên kia.
 * Kết nối dữ liệu: bíp số + nhiễu sóng khi bắt / chuyển vùng / ngắt tín hiệu; bíp báo pin yếu / tự bay về.
 */

SoundEngine.mixin(class {
  ensureDrone() {
    if (this.drone || !this.ctx || !this.pinkNoiseBuffer) return this.drone;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    // cắt dưới ~80 Hz: micro nhỏ trên drone không thu được trầm, phần đó chỉ thành tiếng ù trên tai nghe
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 80;
    hp.Q.value = 0.6;
    out.connect(hp);
    hp.connect(this.masterGain);
    // 4 rotor: trước-trái, trước-phải, sau-trái, sau-phải (đặt lệch trái / phải trong âm thanh nổi)
    const rotors = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([side, front], i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';                     // cánh quét: xung áp suất nhọn -> nhiều họa âm
      o.frequency.value = 40;
      const lp = ctx.createBiquadFilter();     // họa âm cao tắt nhanh (thân cánh mềm, không khí hấp thụ)
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 0.7;
      const w = ctx.createOscillator();        // tiếng rít mô-tơ điện
      w.type = 'sine';
      w.frequency.value = 280;
      const wg = ctx.createGain();
      wg.gain.value = 0;
      const g = ctx.createGain();
      g.gain.value = 0;
      let node = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = side * 0.38;
        g.connect(p);
        node = p;
      }
      node.connect(out);
      o.connect(lp);
      lp.connect(g);
      w.connect(wg);
      wg.connect(g);
      o.start(t);
      w.start(t);
      return { o, lp, w, wg, g, side, front, jit: 0, phase: Math.random() * 6.28, mul: 0.97 + i * 0.02 };
    });
    // Nhiễu khí động của cánh, bị băm theo nhịp cánh quét (điều biên bằng BPF của rotor 1)
    let nb = this.pinkNoiseBuffer;
    try { nb = this.ensureFireBuffers().pink; } catch (e) { /* dùng bộ đệm chung */ }
    const ns = ctx.createBufferSource();
    ns.buffer = nb;
    ns.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1500;
    nf.Q.value = 0.55;
    const chop = ctx.createGain();
    chop.gain.value = 0.6;
    const chopLfo = ctx.createOscillator();
    chopLfo.type = 'triangle';
    chopLfo.frequency.value = 40;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.4;
    chopLfo.connect(chopDepth);
    chopDepth.connect(chop.gain);
    const ng = ctx.createGain();
    ng.gain.value = 0;
    ns.connect(nf);
    nf.connect(chop);
    chop.connect(ng);
    ng.connect(out);
    // Gió thổi vào micro khi bay nhanh
    const ws = ctx.createBufferSource();
    ws.buffer = this.brownNoiseBuffer || nb;
    ws.loop = true;
    ws.playbackRate.value = 0.9;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    wf.Q.value = 0.5;
    const windG = ctx.createGain();
    windG.gain.value = 0;
    ws.connect(wf);
    wf.connect(windG);
    windG.connect(hp);   // gió không qua đường bao chung: vẫn nghe khi rotor đang tắt dần
    ns.start(t, Math.random() * nb.duration);
    ws.start(t, Math.random() * (ws.buffer.duration || 1));
    chopLfo.start(t);
    this.drone = { out, hp, rotors, ns, nf, ng, chop, chopLfo, ws, wf, windG, rpm: 0, env: 0, gust: 0, on: false, lastT: 0 };
    return this.drone;
  }

  /**
   * Gọi mỗi khung hình khi đang mở màn hình drone (active = true), và một lần khi đóng (active = false: rotor tắt dần).
   * s = { climb: tốc độ lên cao (đv/s), speed: tốc độ bay ngang (đv/s), roll: góc nghiêng cánh (rad) }
   */
  updateDrone(active, s = {}) {
    if (!this.ctx) return;
    if (!active && !this.drone) return;
    if (this.isMuted) { if (this.drone) this.drone.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); return; }
    const D = this.ensureDrone();
    if (!D) return;
    const t = this.ctx.currentTime;
    const dt = D.lastT ? Math.min(0.1, Math.max(0.001, t - D.lastT)) : 0.016;
    D.lastT = t;
    if (active && !D.on) { D.on = true; if (D.stopT) { clearTimeout(D.stopT); D.stopT = null; } this.setDroneFar(true); }
    if (!active && D.on) {
      // ngắt tín hiệu: rotor tắt dần, gỡ hết nút âm thanh sau khi im hẳn
      D.on = false;
      this.setDroneFar(false);
      D.out.gain.setTargetAtTime(0, t, 0.18);
      D.windG.gain.setTargetAtTime(0, t, 0.1);
      D.rotors.forEach(r => r.o.frequency.setTargetAtTime(r.o.frequency.value * 0.45, t, 0.35));
      D.stopT = setTimeout(() => this.disposeDrone(D), 1600);
      return;
    }
    if (!active) return;
    // Lực đẩy: treo = 1; lên cao / tăng tốc cần thêm lực đẩy, hạ xuống bớt; vòng quay ~ căn bậc hai lực đẩy
    const climb = s.climb || 0, speed = s.speed || 0, roll = s.roll || 0;
    const thrust = Math.max(0.55, Math.min(1.7, 1 + climb / 900 + speed / 2600 + Math.abs(roll) * 1.5));
    const wantRpm = Math.sqrt(thrust);
    // vừa cất cánh: rotor quay lên từ chậm ("vù" cao dần) — quán tính cánh quạt
    D.rpm += (wantRpm - D.rpm) * Math.min(1, dt * (D.rpm < 0.8 ? 1.6 : 4));
    D.env += (1 - D.env) * Math.min(1, dt * 1.8);
    const bpf = 205 * D.rpm;   // tần số cánh quét khi treo ~205 Hz (2 cánh, ~6150 vòng/phút)
    D.rotors.forEach((r, i) => {
      // bộ điều khiển bay chỉnh từng mô-tơ liên tục (bước ngẫu nhiên lọc ~0.15 s) + nghiêng cánh: bên ngoài quay nhanh hơn
      r.jit += ((Math.random() - 0.5) * 0.05 - r.jit) * Math.min(1, dt * 7);
      r.phase += dt * (0.7 + i * 0.23);
      const f = bpf * r.mul * (1 + r.jit * 0.5 + Math.sin(r.phase) * 0.006 - r.side * roll * 0.5);
      r.o.frequency.setTargetAtTime(f, t, 0.04);
      r.w.frequency.setTargetAtTime(f * 3.6, t, 0.04);
      r.lp.frequency.setTargetAtTime(900 + 900 * D.rpm, t, 0.08);
      r.g.gain.setTargetAtTime(0.32 * (0.85 + r.jit * 2), t, 0.05);
      r.wg.gain.setTargetAtTime(0.05 * D.rpm, t, 0.08);
    });
    D.chopLfo.frequency.setTargetAtTime(bpf * D.rotors[0].mul, t, 0.05);
    D.nf.frequency.setTargetAtTime(1100 + 700 * D.rpm, t, 0.1);
    D.ng.gain.setTargetAtTime(0.5 * D.rpm * D.rpm, t, 0.08);
    // tổng: to dần theo vòng quay (lúc cất cánh), nhỏ hơn hẳn tiếng nổ chiến trường
    D.out.gain.setTargetAtTime(0.075 * D.env * Math.min(1, D.rpm * 1.15), t, 0.06);
    // gió vào micro: theo tốc độ bay, giật cục
    D.gust += ((Math.random() - 0.5) * 0.9 - D.gust) * Math.min(1, dt * 3);
    const wv = Math.min(1, speed / 1500) * (0.75 + D.gust * 0.5);
    D.windG.gain.setTargetAtTime(0.09 * Math.max(0, wv), t, 0.12);
    D.wf.frequency.setTargetAtTime(260 + 500 * Math.min(1, speed / 1500), t, 0.15);
  }

  disposeDrone(D) {
    if (!D || this.drone !== D || D.on) return;
    try {
      D.rotors.forEach(r => { r.o.stop(); r.w.stop(); });
      D.ns.stop(); D.ws.stop(); D.chopLfo.stop();
      D.out.disconnect(); D.hp.disconnect();
    } catch (e) { /* đã dừng */ }
    this.drone = null;
  }

  // Đang xem qua drone: tiếng máy / xích xe mình ở xa phía sau -> nhỏ đi (không tắt hẳn)
  setDroneFar(on) {
    if (!this.vehicleFar || !this.ctx) return;
    this.vehicleFar.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, 0.25);
  }

  // Cảnh báo pin của trạm điều khiển drone: 'low' — 3 bíp ngắn; 'rth' — bíp trầm dài 2 lần (drone tự bay về)
  playDroneBattery(kind = 'low') {
    if (!this.ready()) return;
    const bus = this.uiBus || this.masterGain, t = this.ctx.currentTime + 0.01;
    const beep = (at, f, hold) => this.tone(bus, at, { type: 'square', freq: f, gain: 0.016, attack: 0.003, hold, dur: 0.04, filter: 'lowpass', filterFreq: 3000 });
    if (kind === 'rth') { beep(t, 880, 0.22); beep(t + 0.36, 660, 0.3); }
    else { beep(t, 1320, 0.05); beep(t + 0.12, 1320, 0.05); beep(t + 0.24, 1320, 0.05); }
  }

  /**
   * Tiếng cánh quạt của drone KHÁC đang bay (nghe từ xe mình): d = khoảng cách tới drone gần nhất (null: không có),
   * pos = vị trí drone (lệch trái / phải). Tiếng "vo vo" cao, nhỏ dần theo khoảng cách, lọc trầm khi ở xa.
   */
  updateDroneAmbient(d, pos) {
    if (!this.ctx) return;
    const A = this.droneAmb;
    if ((d === null || this.isMuted) && !A) return;
    const t = this.ctx.currentTime;
    if (d === null || this.isMuted) { A.out.gain.setTargetAtTime(0, t, 0.25); return; }
    if (!A) {
      const ctx = this.ctx, out = ctx.createGain();
      out.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      out.connect(lp);
      let node = lp;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { lp.connect(pan); node = pan; }
      node.connect(this.masterGain);
      // 2 cặp rotor lệch nhau vài Hz -> tiếng phách "ào ào" của quadcopter nghe từ xa
      const oscs = [196, 203, 211, 189].map(f => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.22;
        o.connect(g);
        g.connect(out);
        o.start(t);
        return o;
      });
      const ns = ctx.createBufferSource();
      ns.buffer = this.pinkNoiseBuffer || this.noiseBuffer;
      ns.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 1400;
      nf.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.value = 0.35;
      ns.connect(nf);
      nf.connect(ng);
      ng.connect(out);
      ns.start(t);
      this.droneAmb = { out, lp, pan, oscs, ns, jit: 0 };
      return;
    }
    const near = Math.max(0, 1 - d / 1000);
    A.out.gain.setTargetAtTime(0.05 * near * near, t, 0.2);
    A.lp.frequency.setTargetAtTime(600 + 2400 * near, t, 0.3);
    if (A.pan && pos) {
      const sp = this.spatial(d, pos);
      A.pan.pan.setTargetAtTime(sp.pan * 0.8, t, 0.2);
    }
    A.jit += ((Math.random() - 0.5) * 0.04 - A.jit) * 0.1;
    A.oscs.forEach((o, i) => o.frequency.setTargetAtTime([196, 203, 211, 189][i] * (1 + A.jit), t, 0.1));
  }

  /**
   * Drone bị đạn bắn trúng. hard = trúng drone của mình (nghe qua micro: tiếng "keng" kim loại vỡ + nhiễu sóng chập chờn);
   * ngược lại: tiếng "tách" nhỏ nghe từ xa khi đạn mình trúng drone địch
   */
  playDroneHit(hard = true) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.005;
    const bus = this.uiBus || this.masterGain;
    if (!hard) {
      const out = this.voice({ gain: 0.35, wet: 0.1 });
      this.metal(out, t, { f0: 1900 + Math.random() * 500, ratios: [1, 2.7], decay: 0.05, gain: 0.25, click: 0.8 });
      return;
    }
    const out = this.voice({ gain: 0.7, wet: 0.05 });
    this.snap(out, t, 0.9, 9000, 4);
    this.metal(out, t + 0.004, { f0: 900 + Math.random() * 600, ratios: [1, 2.3, 4.1], decay: 0.12, gain: 0.35, click: 1 });
    this.burst(out, t + 0.01, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'bandpass', freq: 3200, Q: 0.9, gain: 0.35, attack: 0.002, dur: 0.18 });
    // nhiễu sóng vô tuyến chập chờn (hình mất vài khung)
    this.burst(bus, t + 0.02, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'bandpass', freq: 2400, Q: 0.7, filter2: 'highpass', freq2: 700, gain: 0.05, attack: 0.003, dur: 0.35 });
  }

  /** Drone của mình bị bắn hạ: nổ chát trong micro, rotor gào lên rồi tắt, nhiễu trắng kéo dài (mất tín hiệu) */
  playDroneLost() {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const bus = this.uiBus || this.masterGain;
    const out = this.voice({ gain: 0.9, wet: 0.08 });
    this.snap(out, t, 1.2, 8000, 5);
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 2600, freqEnd: 400, sweep: 0.4, drive: 2, gain: 0.7, attack: 0.002, dur: 0.5 });
    this.metal(out, t + 0.01, { f0: 700, ratios: [1, 2.6, 4.9], decay: 0.3, gain: 0.3, click: 1 });
    // rotor mất cân bằng: gào lên rồi tụt
    this.tone(out, t + 0.05, { type: 'sawtooth', freq: 260, freqEnd: 70, gain: 0.08, attack: 0.01, hold: 0.25, dur: 0.6, filter: 'lowpass', filterFreq: 1800 });
    // màn hình mất tín hiệu: nhiễu trắng "xèèè" ~2.6 s
    this.burst(bus, t + 0.25, { buffer: this.noiseBuffer, filter: 'highpass', freq: 500, gain: 0.07, attack: 0.02, dur: 2.6 });
    this.tone(bus, t + 0.4, { type: 'square', freq: 1400, gain: 0.014, attack: 0.002, hold: 0.12, dur: 0.05, filter: 'lowpass', filterFreq: 3500 });
    this.tone(bus, t + 0.6, { type: 'square', freq: 900, gain: 0.014, attack: 0.002, hold: 0.3, dur: 0.08, filter: 'lowpass', filterFreq: 3500 });
  }

  /**
   * Kết nối dữ liệu drone: 'up' bắt tín hiệu (nhiễu sóng + 2 bíp số lên giọng), 'hop' chuyển vùng xa (nhiễu ngắn),
   * 'down' ngắt (bíp xuống giọng + nhiễu tắt)
   */
  playDroneLink(kind = 'up') {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const bus = this.uiBus || this.masterGain;
    // nhiễu sóng vô tuyến: dải 2-4 kHz, lạo xạo (bộ đệm lách tách nếu có)
    const st = { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, filter2: 'highpass', freq2: 700 };
    if (kind === 'up') {
      this.burst(bus, t, Object.assign({}, st, { gain: 0.05, attack: 0.005, dur: 0.45 }));
      this.burst(bus, t, { filter: 'bandpass', freq: 1200, Q: 1.2, gain: 0.03, attack: 0.002, dur: 0.18 });
      this.tone(bus, t + 0.22, { type: 'square', freq: 1760, gain: 0.018, attack: 0.002, hold: 0.045, dur: 0.03, filter: 'lowpass', filterFreq: 3500 });
      this.tone(bus, t + 0.31, { type: 'square', freq: 2350, gain: 0.018, attack: 0.002, hold: 0.06, dur: 0.04, filter: 'lowpass', filterFreq: 3500 });
    } else if (kind === 'hop') {
      this.burst(bus, t, Object.assign({}, st, { gain: 0.035, attack: 0.004, dur: 0.22 }));
      this.tone(bus, t + 0.12, { type: 'square', freq: 2100, gain: 0.012, attack: 0.002, hold: 0.03, dur: 0.03, filter: 'lowpass', filterFreq: 3500 });
    } else {
      this.tone(bus, t, { type: 'square', freq: 2100, gain: 0.016, attack: 0.002, hold: 0.05, dur: 0.03, filter: 'lowpass', filterFreq: 3500 });
      this.tone(bus, t + 0.09, { type: 'square', freq: 1400, gain: 0.016, attack: 0.002, hold: 0.07, dur: 0.04, filter: 'lowpass', filterFreq: 3500 });
      this.burst(bus, t + 0.05, Object.assign({}, st, { gain: 0.045, attack: 0.003, dur: 0.3 }));
    }
  }
});
