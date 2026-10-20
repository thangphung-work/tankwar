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
    hp.frequency.value = 110;
    hp.Q.value = 0.6;
    out.connect(hp);
    hp.connect(this.vehicleBus);
    // nhiễu dài riêng (bộ đệm lửa 11.7 s) — bộ đệm chung 3 s phát lặp lâu sẽ nghe ra vòng lặp
    let nb = this.pinkNoiseBuffer;
    try { nb = this.ensureFireBuffers().pink; } catch (e) { /* dùng bộ đệm chung */ }
    // 1. Mô-tơ servo điện quay tháp: tiếng "vù-uuu" cao độ theo vòng quay mô-tơ — sin cơ bản + bậc 2 + một bậc lệch
    //    (từ trường / răng hộp số hành tinh), lọc thấp: tròn, không chói như răng cưa
    const parts = [[1, 'sine', 1], [2, 'sine', 0.42], [3.03, 'triangle', 0.16]].map(([r, type, g]) => {
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
    gf.connect(gg);
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
    gs.start(this.ctx.currentTime, Math.random() * nb.duration);
    rs.start(this.ctx.currentTime, Math.random() * nb.duration);
    this.turretDrive = { out, parts, wlp, wg, gf, gg, rf, rg, moving: false, spin: 0, env: 0 };
    return this.turretDrive;
  }

  /**
   * rate: tốc độ quay tháp (hướng ngắm trong thế giới, rad/s); jammed: vòng bi tháp kẹt (quay tay, nghiến ken két).
   */
  updateTurretDrive(rate, tankType = 'ALL_ROUNDER', jammed = false) {
    if (!this.ctx || this.isMuted) return;
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
      ALL_ROUNDER: { f0: 240, f1: 900, maxR: 0.96, g: 0.016, whine: 1, grind: 6, rumble: 2.2, gF: 750, rF: 260 },
      ARTILLERY: { f0: 170, f1: 480, maxR: 0.49, g: 0.023, whine: 0.75, grind: 6, rumble: 3.5, gF: 560, rF: 200 },
      GATLING: { f0: 360, f1: 1400, maxR: 1.4, g: 0.0095, whine: 1.1, grind: 7, rumble: 2.2, gF: 950, rF: 300 },
      SCOUT: { f0: 520, f1: 1800, maxR: 1.75, g: 0.0068, whine: 1, grind: 7, rumble: 1, gF: 1400, rF: 360 }
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
