/**
 * MÔ-TƠ QUAY THÁP PHÁO & BƠM NÂNG HẠ NÒNG.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 6b. MÔ-TƠ QUAY THÁP PHÁO (điện - thủy lực) — liên tục, theo tốc độ quay tháp so với thân xe
  // ===========================================================================
  ensureTurretDrive() {
    if (this.turretDrive || !this.ctx || !this.pinkNoiseBuffer) return this.turretDrive;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    // cắt dưới ~110 Hz: đuôi trầm của các dải nhiễu chỉ thành tiếng "ù" trên tai nghe, không giúp nghe ra tháp quay
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 75;
    hp.Q.value = 0.6;
    out.connect(hp);
    hp.connect(this.vehicleBus);
    // nhiễu dài riêng (bộ đệm lửa 11.7 s) — bộ đệm chung 3 s phát lặp lâu sẽ nghe ra vòng lặp
    let nb = this.pinkNoiseBuffer;
    try { nb = this.ensureFireBuffers().pink; } catch (e) { /* dùng bộ đệm chung */ }
    // 1. Mô-tơ servo điện quay tháp: tiếng "vù-uuu" cao độ theo vòng quay mô-tơ — sin cơ bản + bậc 2 + một bậc lệch
    //    (từ trường / răng hộp số hành tinh), lọc thấp: tròn, không chói như răng cưa
    const parts = [[1, 'sine', 1], [2, 'sine', 0.3]].map(([r, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 260 * r;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og);
      return { o, og, r };
    });
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 3200;
    wlp.Q.value = 0.5;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    parts.forEach(p => p.og.connect(wlp));
    wlp.connect(wg);
    wg.connect(out);
    // 1b. Tiếng rít thật của mô-tơ không phải sin sạch: dải nhiễu hẹp bám bậc 2 / bậc 3 (chổi than, từ trường, bánh răng hành tinh)
    //     -> nghe "xè-vù" cơ khí thay vì tiếng còi điện tử
    const ws = ctx.createBufferSource();
    ws.buffer = nb;
    ws.loop = true;
    const wn = ctx.createBiquadFilter();
    wn.type = 'bandpass';
    wn.frequency.value = 520;
    wn.Q.value = 9;
    const wng = ctx.createGain();
    wng.gain.value = 0;
    ws.connect(wn);
    wn.connect(wng);
    wng.connect(out);
    // 1c. Bơm / mô-tơ thủy lực: tiếng ừ trầm có họa âm (tam giác lọc thấp), nền "nặng" của khối tháp
    const ho = ctx.createOscillator();
    ho.type = 'triangle';
    ho.frequency.value = 120;
    const hlp = ctx.createBiquadFilter();
    hlp.type = 'lowpass';
    hlp.frequency.value = 520;
    hlp.Q.value = 0.7;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    ho.connect(hlp);
    hlp.connect(hg);
    hg.connect(out);
    // 2. Bánh răng ăn khớp (bánh răng nhỏ chạy trên vành răng tháp): tiếng "rrr" dải trung, độ lớn chao ngẫu nhiên (không theo nhịp)
    const gs = ctx.createBufferSource();
    gs.buffer = nb;
    gs.loop = true;
    gs.playbackRate.value = 1.07;
    const gf = ctx.createBiquadFilter();
    gf.type = 'bandpass';
    gf.frequency.value = 750;
    gf.Q.value = 1.0;
    const gg = ctx.createGain();
    gg.gain.value = 0;
    gs.connect(gf);
    // răng bánh răng ăn khớp theo nhịp: điều biên bằng LFO răng cưa ở tần số ăn răng (tăng theo tốc độ) -> "rrrrr" lạch cạch cơ khí,
    // không phải tiếng xè đều của nhiễu
    const gm = ctx.createGain();
    gm.gain.value = 0.45;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 20;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.4;
    lfo.connect(lfoG);
    lfoG.connect(gm.gain);
    gf.connect(gm);
    gm.connect(gg);
    gg.connect(out);
    // 3. Vòng bi tháp hàng chục tấn lăn: tiếng ầm trầm-trung, nhẹ
    const rs = ctx.createBufferSource();
    rs.buffer = nb;
    rs.loop = true;
    rs.playbackRate.value = 0.83;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';   // dải, không phải lọc thấp: phần dưới ~100 Hz chỉ thành tiếng "ù" trên tai nghe
    rf.frequency.value = 200;
    rf.Q.value = 0.9;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rs.connect(rf);
    rf.connect(rg);
    rg.connect(out);
    parts.forEach(p => p.o.start());
    ho.start();
    lfo.start();
    ws.start(this.ctx.currentTime, Math.random() * nb.duration);
    gs.start(this.ctx.currentTime, Math.random() * nb.duration);
    rs.start(this.ctx.currentTime, Math.random() * nb.duration);
    this.turretDrive = { out, parts, wlp, wg, wn, wng, ho, hg, lfo, gf, gg, rf, rg, moving: false, spin: 0, env: 0 };
    return this.turretDrive;
  }

  /**
   * rate: tốc độ quay tháp (hướng ngắm trong thế giới, rad/s); jammed: vòng bi tháp kẹt (quay tay, nghiến ken két).
   */
  updateTurretDrive(rate, tankType = 'ALL_ROUNDER', jammed = false) {
    if (!this.ctx || this.isMuted) return;
    // vòng súng quay tay của xe trinh sát: không có mô-tơ — tiếng riêng (updateRingTraverse), tắt kênh mô-tơ
    if (tankType === 'SCOUT_RING') {
      if (this.turretDrive) { this.turretDrive.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); this.turretDrive.moving = false; this.turretDrive.env = 0; }
      this.updateRingTraverse(rate);
      return;
    }
    if (this.ringDrive) this.updateRingTraverse(0);
    const td = this.ensureTurretDrive();
    if (!td) return;
    const t = this.ctx.currentTime;
    const dtR = td.lastT ? Math.min(0.1, Math.max(0.001, t - td.lastT)) : 0.016;
    td.lastT = t;
    // làm mượt: hướng ngắm nhảy từng khung hình không làm mô-tơ bật / tắt giật cục
    td.rateS = (td.rateS || 0) + ((Math.abs(rate || 0) > 0.008 ? Math.abs(rate) : 0) - (td.rateS || 0)) * Math.min(1, dtR * 8);
    // Chuyển động RÒNG trong ~0,25 s: bộ giải đường đạn / bù nghiêng thân xe nhích hướng ngắm qua lại ±0,1° mỗi 0,25 s khi đứng ngắm
    // một chỗ — mỗi lần nhích là một gai tốc độ ngắn; tính theo tốc độ tức thời thì mô-tơ bật tắt lụp bụp ("rè rè"). Rung qua lại ròng ≈ 0.
    td.disp = (td.disp || 0) * Math.exp(-dtR / 0.25) + (rate || 0) * dtR;
    const net = Math.abs(td.disp) / 0.25;
    // Tháp xe tăng: servo điện (kiểu Leopard 2A7 / K2); pháo 155: tháp rất nặng, mô-tơ chậm, ầm nhiều; pháo 6 nòng: tháp phòng không
    // quay nhanh, mô-tơ rít cao; trạm súng máy trinh sát: servo nhỏ, cao và khẽ.
    // f0/f1: cao độ mô-tơ lúc nhích chậm / quay hết tốc; maxR = turretRates().traverse (rad/s); whine/grind/rumble: tỉ lệ 3 lớp
    const P = {
      ALL_ROUNDER: { f0: 330, f1: 620, hf: 105, tooth: 46, maxR: 0.96, g: 0.016, whine: 0.7, grind: 6, rumble: 2.2, gF: 750, rF: 260 },
      ARTILLERY: { f0: 230, f1: 400, hf: 80, tooth: 30, maxR: 0.49, g: 0.023, whine: 0.5, grind: 6, rumble: 3.5, gF: 560, rF: 200 },
      GATLING: { f0: 480, f1: 980, hf: 140, tooth: 60, maxR: 1.4, g: 0.0095, whine: 0.9, grind: 7, rumble: 2.2, gF: 950, rF: 300 },
      SCOUT: { f0: 700, f1: 1350, hf: 180, tooth: 70, maxR: 1.75, g: 0.0068, whine: 0.9, grind: 7, rumble: 1, gF: 1400, rF: 360 }
    };
    const p = P[tankType] || P.ALL_ROUNDER;
    const k = Math.min(1, td.rateS / p.maxR);
    // ngưỡng có trễ: ngắm chỉnh từng chút (~1°/s) cũng nghe mô-tơ, nhưng không bật / tắt lập bập quanh ngưỡng
    const moving = td.moving ? td.rateS > 0.009 && net > 0.006 : td.rateS > 0.018 && net > 0.018;
    td.runT = moving ? (td.runT || 0) + dtR : 0;
    // Quán tính mô-tơ: vòng quay lên dần khi bắt đầu quay ("vù-uu" cao dần), tụt dần khi dừng ("uuu-ù") — dấu hiệu nghe rõ nhất
    const want = moving ? Math.pow(k, 0.8) : 0;
    const accel = Math.max(0, want - td.spin);   // đang tăng tốc: mô-tơ chịu tải, kêu to hơn
    td.spin += (want - td.spin) * Math.min(1, dtR * (want > td.spin ? 6 : 3.5));
    td.env += ((moving ? 1 : 0) - td.env) * Math.min(1, dtR * (moving ? 14 : 4));
    const s = td.spin;
    // cao độ trôi rất nhẹ ngẫu nhiên (≤0,5%), không rung đều
    const f = (p.f0 + (p.f1 - p.f0) * s) * (1 + (Math.random() - 0.5) * 0.01) * (jammed ? 0.45 : 1);
    td.parts.forEach(q => q.o.frequency.setTargetAtTime(f * q.r, t, 0.06));
    td.wn.frequency.setTargetAtTime(f * 2.02, t, 0.06);
    td.wng.gain.setTargetAtTime((jammed ? 0.3 : 1) * p.whine * 9 * (0.5 + 0.5 * s), t, 0.05);
    td.ho.frequency.setTargetAtTime(p.hf * (0.92 + 0.2 * s) * (jammed ? 0.7 : 1), t, 0.08);
    td.hg.gain.setTargetAtTime(0.55 * (0.6 + 0.4 * s) * (1 + 0.6 * accel), t, 0.06);
    // nhịp ăn răng: tháp chạy nhanh thì "rrr" dày hơn; kẹt vòng bi: nhịp chậm, giật
    td.lfo.frequency.setTargetAtTime(jammed ? 7 + 4 * Math.random() : p.tooth * (0.35 + 0.65 * s), t, 0.05);
    td.wg.gain.setTargetAtTime((jammed ? 0.1 : 1) * p.whine * (1 - 0.3 * s) * (1 + 0.8 * accel), t, 0.05);
    td.gf.frequency.setTargetAtTime(jammed ? 420 : p.gF * (0.9 + 0.25 * s), t, 0.08);
    td.gg.gain.setTargetAtTime((jammed ? 12 : p.grind * (0.35 + 0.65 * s)) * (0.75 + 0.5 * Math.random()), t, 0.07);
    td.rf.frequency.setTargetAtTime(p.rF * (0.85 + 0.3 * s), t, 0.1);
    td.rg.gain.setTargetAtTime((jammed ? 1.6 : 1) * p.rumble * (0.3 + 0.7 * s), t, 0.1);
    // quay liên tục lâu thì tai quen, nhỏ dần
    const hab = 0.72 + 0.28 * Math.exp(-td.runT / 2.5);
    td.out.gain.setTargetAtTime(td.env * p.g * hab * (jammed ? 1.2 : 1), t, 0.03);
    // Bắt đầu quay: khe hở bánh răng ăn vào "cục" khẽ; dừng: phanh hãm "cạch" khẽ — chỉ khi đã quay một đoạn, không dồn dập
    if (moving && !td.moving) {
      td.startT = t;
      if (t - (td.clunkT || -9) > 0.4 && tankType !== 'SCOUT') {
        td.clunkT = t;
        const heavy = tankType === 'ARTILLERY';
        const o = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.03 });
        this.burst(o, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: heavy ? 150 : 190, gain: heavy ? 0.12 : 0.08, attack: 0.002, dur: heavy ? 0.09 : 0.06 });
        this.burst(o, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: heavy ? 1500 : 2000, Q: 2, gain: 0.025, attack: 0.0006, dur: 0.015 });
      }
    }
    if (td.moving && !moving && tankType !== 'SCOUT' && t - (td.startT || 0) > 0.15 && t - (td.clunkT || -9) > 0.35) {
      td.clunkT = t;
      const o = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.03 });
      this.burst(o, t + 0.12, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 2, gain: 0.07, attack: 0.0006, dur: 0.03 });
      this.burst(o, t + 0.12, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.1, attack: 0.001, dur: 0.06 });
    }
    td.moving = moving;
  }

  // ===========================================================================
  // 6b'. VÒNG SÚNG QUAY TAY (xe trinh sát: xạ thủ tì người đẩy vòng súng / súng 12.7 trên giá) — CƠ HỌC, KHÔNG MÔ-TƠ:
  //   vòng bi lăn trên rãnh vòng thép "rrr" trầm khô, đổi cao độ theo tốc độ; sạn bụi trong rãnh lạo xạo không đều;
  //   phụ kiện thép quanh vòng (chốt hãm, quai, nắp lỗ) lách cách ngẫu nhiên; thỉnh thoảng rít ma sát khi lia chậm;
  //   dừng tay: vòng còn trôi theo quán tính rồi xạ thủ ghì lại "cộc" khẽ. Không có tiếng "vù" cao độ đều của mô-tơ
  // ===========================================================================
  ensureRingDrive() {
    if (this.ringDrive || !this.ctx || !this.pinkNoiseBuffer) return this.ringDrive;
    const ctx = this.ctx;
    let nb = this.pinkNoiseBuffer;
    try { nb = this.ensureFireBuffers().pink; } catch (e) { /* dùng bộ đệm chung */ }
    const out = ctx.createGain(); out.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.6;
    out.connect(hp); hp.connect(this.vehicleBus);
    const loop = (rate) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.playbackRate.value = rate; s.start(ctx.currentTime, Math.random() * nb.duration); return s; };
    // điều biên ngẫu nhiên (không tuần hoàn): nhiễu lọc rất thấp -> độ lớn chao lên xuống như bi lăn qua chỗ mòn / sạn
    const amp = (src, f, depth) => {
      const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = f;
      const d = ctx.createGain(); d.gain.value = depth;
      const g = ctx.createGain(); g.gain.value = 1;
      const n = loop(0.6 + Math.random() * 0.3); n.connect(lf); lf.connect(d); d.connect(g.gain);
      src.connect(g);
      return g;
    };
    // 1. bi lăn trên rãnh: dải trầm-trung khô
    const r1 = loop(0.9), rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 420; rf.Q.value = 1.3;
    r1.connect(rf);
    const rg = ctx.createGain(); rg.gain.value = 0;
    amp(rf, 14, 2.2).connect(rg); rg.connect(out);
    // 2. sạn / bụi trong rãnh lạo xạo: dải cao, hẹp, điều biên nhanh không đều
    const r2 = loop(1.13), gfl = ctx.createBiquadFilter(); gfl.type = 'bandpass'; gfl.frequency.value = 2600; gfl.Q.value = 2.2;
    r2.connect(gfl);
    const gg = ctx.createGain(); gg.gain.value = 0;
    amp(gfl, 40, 3).connect(gg); gg.connect(out);
    this.ringDrive = { out, rf, rg, gfl, gg, spin: 0, env: 0, moving: false, tickT: 0, creakT: 0, rateS: 0, disp: 0 };
    return this.ringDrive;
  }

  updateRingTraverse(rate) {
    if (!this.ctx || this.isMuted) return;
    const rd = this.ensureRingDrive();
    if (!rd) return;
    const t = this.ctx.currentTime;
    const dtR = rd.lastT ? Math.min(0.1, Math.max(0.001, t - rd.lastT)) : 0.016;
    rd.lastT = t;
    const r = Math.abs(rate || 0);
    rd.rateS += ((r > 0.008 ? r : 0) - rd.rateS) * Math.min(1, dtR * 8);
    rd.disp = rd.disp * Math.exp(-dtR / 0.25) + (rate || 0) * dtR;
    const net = Math.abs(rd.disp) / 0.25;
    const moving = rd.moving ? rd.rateS > 0.01 && net > 0.007 : rd.rateS > 0.02 && net > 0.02;
    const k = Math.min(1, rd.rateS / 1.75);   // turretRates SCOUT 100°/s
    // vòng nặng có quán tính: lăn lên / trôi xuống mượt (không bật tắt)
    rd.spin += ((moving ? Math.pow(k, 0.7) : 0) - rd.spin) * Math.min(1, dtR * (moving ? 7 : 3));
    rd.env += ((moving ? 1 : 0) - rd.env) * Math.min(1, dtR * (moving ? 12 : 3.5));
    const s = rd.spin;
    rd.rf.frequency.setTargetAtTime(330 + 380 * s, t, 0.08);
    rd.rg.gain.setTargetAtTime(1.6 * (0.35 + 0.65 * s), t, 0.06);
    rd.gfl.frequency.setTargetAtTime(2200 + 1200 * s, t, 0.08);
    rd.gg.gain.setTargetAtTime(0.5 * (0.2 + 0.8 * s), t, 0.06);
    rd.out.gain.setTargetAtTime(rd.env * 0.05, t, 0.04);
    const R = Math.random;
    if (moving && rd.env > 0.3) {
      // phụ kiện thép quanh vòng lách cách: càng lia nhanh càng dày
      rd.tickT -= dtR;
      if (rd.tickT <= 0) {
        rd.tickT = 0.08 + R() * (0.45 - 0.3 * s);
        const o = this.voice({ bus: this.vehicleBus, gain: 0.4, wet: 0.05 });
        this.playCaseHit(o, t + R() * 0.02, 'debrisLink', 1.4 + R() * 0.8, 0.02 + 0.03 * s * R(), 8000);
      }
      // lia chậm: ma sát rãnh vòng rít khẽ "kít" (lia nhanh thì bi lăn át đi)
      rd.creakT -= dtR;
      if (rd.creakT <= 0) {
        rd.creakT = 0.6 + R() * 1.4;
        if (s < 0.5 && R() < 0.6) {
          const o = this.voice({ bus: this.vehicleBus, gain: 0.35, wet: 0.04 });
          const f = 900 + R() * 700;
          this.burst(o, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, freqEnd: f * (0.9 + R() * 0.25), sweep: 0.2, Q: 7, gain: 0.06, attack: 0.03, dur: 0.12 + R() * 0.15 });
        }
      }
    }
    // xạ thủ ghì vòng lại sau một lần lia: "cộc" khẽ của khối súng + vòng
    if (rd.moving && !moving && t - (rd.startT || 0) > 0.25 && t - (rd.stopT || -9) > 0.4) {
      rd.stopT = t;
      const o = this.voice({ bus: this.vehicleBus, gain: 0.45, wet: 0.04 });
      this.burst(o, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, gain: 0.08, attack: 0.002, dur: 0.06 });
      this.playCaseHit(o, t + 0.085, 'debrisMetal', 1.2, 0.04, 6000);
    }
    if (moving && !rd.moving) rd.startT = t;
    rd.moving = moving;
  }

  // ===========================================================================
  // 6c. BƠM / XI LANH NÂNG HẠ NÒNG — liên tục khi nòng đang nâng / hạ, khác hẳn tiếng mô-tơ quay tháp:
  //     tiếng bơm thủy lực trầm (tam giác lọc thấp, không phải răng cưa "è è") + dầu nén gầm nhẹ + dầu xì qua van
  // ===========================================================================
  ensureElevationDrive() {
    if (this.elevDrive || !this.ctx || !this.pinkNoiseBuffer) return this.elevDrive;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.vehicleBus);
    // Bơm: tam giác (chỉ có họa âm lẻ, yếu dần 1/n²) -> lọc thấp: tiếng "ừ" trầm, không chói
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 90;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.value = 600;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    osc.connect(lp);
    lp.connect(hg);
    hg.connect(out);
    // Dầu nén trong xi lanh: nhiễu hồng dải trung trầm (phần nghe được trên loa nhỏ) + xì qua van dải cao, rất khẽ
    const n = ctx.createBufferSource();
    n.buffer = this.pinkNoiseBuffer;
    n.loop = true;
    const gf = ctx.createBiquadFilter();
    gf.type = 'bandpass';
    gf.Q.value = 1.1;
    gf.frequency.value = 330;
    const gg = ctx.createGain();
    gg.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.Q.value = 0.8;
    sf.frequency.value = 1500;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    n.connect(gf);
    gf.connect(gg);
    gg.connect(out);
    n.connect(sf);
    sf.connect(sg);
    sg.connect(out);
    [osc, n].forEach(x => x.start());
    this.elevDrive = { out, osc, lp, hg, gf, gg, sf, sg, moving: false, rateS: 0, runT: 0 };
    return this.elevDrive;
  }

  /**
   * Tốc độ nâng / hạ nòng do NGƯỜI CHƠI (hoặc máy tính hỏa lực bám mục tiêu), rad/s, từ unit.elevation (độ, so với thân xe) mỗi khung hình.
   * Bỏ phần bộ ổn định tự chạy bù khi thân xe chồm / nghiêng trên địa hình: unit._bwo.el (độ lệch nòng do thân nghiêng, đo lại ~4 lần/giây)
   * đổi Δ thì nòng sẽ chạy -Δ để giữ hướng — lượng đó được "trừ nợ", không kêu. Xe chỉ nghiêng mà không ai nâng hạ: unit.elevation không đổi.
   * st: đối tượng trạng thái riêng của bên gọi (giữ giữa các khung hình).
   */
  elevationRate(st, unit, dt) {
    const el = unit.elevation || 0, off = unit._bwo ? unit._bwo.el : 0;
    if (st.el === undefined || st.unit !== unit) { st.el = el; st.off = off; st.comp = 0; st.unit = unit; return 0; }
    let d = el - st.el;
    if (Math.abs(d) > 20) d = 0;   // hồi sinh / đổi xe: nhảy góc, không phải nòng đang chạy
    st.comp = Math.max(-10, Math.min(10, st.comp * Math.exp(-dt * 1.2) - (off - st.off)));
    if (d * st.comp > 0) { const c = Math.sign(d) * Math.min(Math.abs(d), Math.abs(st.comp)); st.comp -= c; d -= c; }
    st.el = el;
    st.off = off;
    return dt > 0 ? d * Math.PI / 180 / dt : 0;
  }

  /**
   * rate: tốc độ nòng đổi góc do người chơi nâng / hạ (rad/s) — tính bằng elevationRate() (đã trừ phần bộ ổn định tự bù).
   */
  updateElevationDrive(rate, tankType = 'ALL_ROUNDER') {
    if (!this.ctx || this.isMuted) return;
    const ed = this.ensureElevationDrive();
    if (!ed) return;
    const t = this.ctx.currentTime;
    const dtR = ed.lastT ? Math.min(0.1, Math.max(0.001, t - ed.lastT)) : 0.016;
    ed.lastT = t;
    // súng trên giá quay tay (xe trinh sát): ngóc / chúc bằng tay quanh chốt nôi súng — không bơm, chỉ ma sát chốt khẽ
    if (tankType === 'SCOUT_RING') {
      ed.out.gain.setTargetAtTime(0, t, 0.05);
      ed.moving = false;
      const r = Math.abs(rate || 0);
      ed.pinT = (ed.pinT || 0) - dtR;
      if (r > 0.05 && ed.pinT <= 0) {
        ed.pinT = 0.35 + Math.random() * 0.6;
        const o = this.voice({ bus: this.vehicleBus, gain: 0.3, wet: 0.03 });
        const f = 1300 + Math.random() * 600;
        this.burst(o, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, freqEnd: f * 1.1, sweep: 0.15, Q: 5, gain: 0.035, attack: 0.02, dur: 0.1 });
      }
      return;
    }
    // Pháo chính xe tăng: bơm điện-thủy lực; pháo 155: giá pháo nặng, bơm lớn trầm và chậm; pháo 6 nòng: mô-tơ điện servo;
    // trạm súng máy trinh sát: servo nhỏ, rất khẽ. maxR = turretRates().elevate (rad/s); att = thời gian bơm lên áp
    const P = {
      ALL_ROUNDER: { f0: 100, fk: 30, lp: 650, gr: 420, hiss: 1500, hum: 0.11, grow: 1.4, hs: 0.15, g: 0.1, att: 0.05, maxR: 0.52 },
      ARTILLERY: { f0: 62, fk: 14, lp: 420, gr: 280, hiss: 1100, hum: 0.12, grow: 1.6, hs: 0.12, g: 0.135, att: 0.12, maxR: 0.245 },
      GATLING: { f0: 175, fk: 120, lp: 1300, gr: 620, hiss: 2200, hum: 0.6, grow: 1.0, hs: 0.15, g: 0.03, att: 0.03, maxR: 0.96 },
      SCOUT: { f0: 230, fk: 120, lp: 1500, gr: 700, hiss: 2600, hum: 0.6, grow: 1.0, hs: 0.2, g: 0.018, att: 0.03, maxR: 1.05 }
    }[tankType] || null;
    const p = P || { f0: 100, fk: 30, lp: 650, gr: 420, hiss: 1500, hum: 0.11, grow: 1.4, hs: 0.15, g: 0.1, att: 0.05, maxR: 0.52 };
    const r = Math.abs(rate || 0);
    ed.rateS += ((r > 0.004 ? r : 0) - ed.rateS) * Math.min(1, dtR * (r > ed.rateS ? 14 : 7));
    // chuyển động ròng ~0,25 s (như tháp): nghiệm đường đạn giải lại mỗi 0,12 s làm nòng nhích qua lại vài phần trăm độ -> không kêu
    ed.disp = (ed.disp || 0) * Math.exp(-dtR / 0.25) + (rate || 0) * dtR;
    const net = Math.abs(ed.disp) / 0.25;
    const k = Math.min(1, ed.rateS / p.maxR);
    const moving = ed.moving ? ed.rateS > 0.006 && net > 0.004 : ed.rateS > 0.012 && net > 0.012;   // ~0.7°/s; trễ để không lập bập
    ed.runT = moving ? ed.runT + dtR : 0;
    const f = p.f0 + k * p.fk;
    if (moving && !ed.moving) {
      ed.startT = t;
      // bơm khởi động: cao độ trườn lên từ thấp (không "bật" tức thì)
      ed.osc.frequency.cancelScheduledValues(t);
      ed.osc.frequency.setValueAtTime(f * 0.72, t);
    }
    ed.osc.frequency.setTargetAtTime(f, t, p.att);
    ed.lp.frequency.setTargetAtTime(p.lp * (0.85 + 0.3 * k), t, 0.08);
    ed.gf.frequency.setTargetAtTime(p.gr * (0.9 + 0.25 * k), t, 0.08);
    ed.sf.frequency.setTargetAtTime(p.hiss * (0.9 + 0.2 * k), t, 0.1);
    // dầu nén gầm không đều (ngẫu nhiên, không điều biên tuần hoàn -> không thành tiếng "phạch phạch" đều đặn)
    ed.hg.gain.setTargetAtTime(p.hum, t, 0.1);
    ed.gg.gain.setTargetAtTime(p.grow * (0.75 + 0.5 * Math.random()), t, 0.06);
    ed.sg.gain.setTargetAtTime(p.hs * (0.3 + 0.7 * k), t, 0.1);
    // âm lượng sàn cao cho nâng hạ chậm; giữ phím lâu thì tai quen dần (không gây mệt tai)
    const hab = 0.65 + 0.35 * Math.exp(-ed.runT / 2);
    ed.out.gain.setTargetAtTime(moving ? p.g * (0.7 + 0.3 * k) * hab : 0, t, moving ? p.att : 0.07);
    // Nòng dừng: van khóa xi lanh đóng "cạch" khẽ (bỏ qua chạm phím rất ngắn, không dồn dập)
    if (ed.moving && !moving && tankType !== 'SCOUT' && t - ed.startT > 0.12 && t - (ed.clunkT || -9) > 0.3) {
      ed.clunkT = t;
      const heavy = tankType === 'ARTILLERY', gat = tankType === 'GATLING';
      const out = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.03 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: heavy ? 650 : gat ? 1400 : 900, Q: 1.8, gain: gat ? 0.04 : 0.06, attack: 0.0006, dur: 0.025 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: heavy ? 190 : 260, gain: heavy ? 0.16 : gat ? 0.06 : 0.11, attack: 0.001, dur: heavy ? 0.1 : 0.06 });
    }
    ed.moving = moving;
  }
});
