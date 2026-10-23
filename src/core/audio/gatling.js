/**
 * PHÁO 6 NÒNG XOAY (GATLING), SÚNG LIÊN THANH XE TRINH SÁT, VỎ ĐẠN RƠI.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

// Va chạm thép dựng theo vật lý (synthGunshot): tc = thời gian tiếp xúc (s), len = độ dài mẫu (s),
// m = các nhóm mode [số mode, tần thấp, tần cao (Hz), t60 mode thấp, t60 mode cao (s), mức]. '…Hull' = rơi trên vỏ thép xe
const LOW_HULL = [18, 55, 420, 0.14, 0.05, 0.6];   // vỏ xe bị gõ rung trầm theo
const STEEL = {
  // tấm giáp / váy xích / gạch ERA (thép dày, nặng)
  // (rơi đất: mode thấp biên độ lớn bị đất ép tắt nhanh nhất; chạm bằng mép / góc trước nên xung ngắn hơn chạm cả mặt)
  debrisPlate: { tc: 0.0018, len: 0.25, m: [[70, 150, 5000, 0.045, 0.025, 1]] },
  debrisPlateHull: { tc: 0.0004, len: 1.3, m: [[70, 110, 8000, 0.8, 0.04, 1], [18, 55, 420, 0.14, 0.05, 1.2]] },
  // phụ kiện thép nhỏ: hộp đồ, đèn, lan can, giá súng, vỏ kính ngắm
  debrisMetal: { tc: 0.0012, len: 0.22, m: [[30, 350, 7000, 0.1, 0.018, 1]] },
  debrisMetalHull: { tc: 0.00018, len: 0.75, m: [[45, 300, 9000, 0.45, 0.03, 1], LOW_HULL] },
  // vỏ rỗng (bình nhiên liệu, ống phóng): vỏ mỏng + khoang khí cộng hưởng "boong" đục
  debrisCan: { tc: 0.0015, len: 0.35, m: [[35, 240, 6000, 0.22, 0.03, 1], [3, 170, 320, 0.12, 0.08, 1.5]] },
  debrisCanHull: { tc: 0.00025, len: 0.9, m: [[45, 240, 8000, 0.6, 0.04, 1], [3, 170, 320, 0.25, 0.15, 1.5], LOW_HULL] },
  // mắt xích thép đúc: khối đặc nhỏ -> "cạch" đanh, mode cao
  debrisLink: { tc: 0.0007, len: 0.25, m: [[20, 600, 8000, 0.14, 0.02, 1]] },
  debrisLinkHull: { tc: 0.00012, len: 0.7, m: [[25, 600, 9000, 0.5, 0.03, 1], LOW_HULL] },
  // đạn nổ / va đập lớn lên thân xe: giáp dày hàng chục mm bắt chặt vào khung, đầy thiết bị bên trong -> rung tắt nhanh,
  // "CHÁT-THỤP" nặng chứ không ngân như chuông; cả khối xe hàng chục tấn rung trầm theo
  hullBlast: { tc: 0.0003, len: 0.9, m: [[80, 70, 7000, 0.45, 0.025, 1], [25, 40, 300, 0.25, 0.08, 1.4]] },
  // đạn nhỏ đập vỏ xe (nghe trong khoang): "tạch / keng" khô, tắt nhanh
  hullTick: { tc: 0.00008, len: 0.35, m: [[40, 500, 9000, 0.18, 0.02, 1], [15, 80, 500, 0.08, 0.04, 0.8]] },
  // tôn / khung thép mỏng: tấm rộng mỏng, mode thấp dày đặc ngân lâu -> "oàng" rung rinh
  sheetMetal: { tc: 0.0006, len: 1.6, m: [[90, 50, 6000, 1.2, 0.08, 1]] },
  // khối tháp thép hàng chục tấn đập xuống đất: tiếp xúc rất lâu -> chỉ còn "RẦM" trầm đục, ít âm thép
  turretLand: { tc: 0.008, len: 1.0, m: [[50, 45, 2500, 0.35, 0.03, 1], [20, 30, 200, 0.3, 0.1, 1.5]] },
  // thanh cốt thép đứt bật: thanh dài mảnh -> ngân có cao độ thật (mode uốn của thanh tự do)
  rebar: { tc: 0.0001, len: 0.8, m: [[24, 700, 9000, 0.4, 0.03, 1]] }
};

SoundEngine.mixin(class {
  // ===========================================================================
  // 7. PHÁO 6 NÒNG XOAY (GATLING) & SÚNG LIÊN THANH XE TRINH SÁT
  // ===========================================================================
  ensureGatlingMotor() {
    if (this.gatlingMotor || !this.ctx || !this.pinkNoiseBuffer) return this.gatlingMotor;
    const ctx = this.ctx;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.vehicleBus);

    // Mô-tơ điện: răng cưa + vuông lệch quãng tám, lọc dải -> tiếng rít điện tăng dần
    // tần số khởi tạo = lúc nòng đứng yên (mặc định 440 Hz làm lần quay đầu tiên có tiếng "vút" tụt xuống rồi mới lên)
    const m1 = ctx.createOscillator();
    m1.type = 'sawtooth';
    m1.frequency.value = 85;
    const m2 = ctx.createOscillator();
    m2.type = 'square';
    m2.frequency.value = 43;
    const mf = ctx.createBiquadFilter();
    mf.type = 'bandpass';
    mf.Q.value = 2.6;
    const mg = ctx.createGain();
    mg.gain.value = 0.35;
    m1.connect(mf);
    m2.connect(mf);
    mf.connect(mg);
    mg.connect(out);

    // Cơ cấu cơ khí: nhiễu hồng điều biên theo tần số nòng đi qua (6 nòng x vòng/giây)
    const rn = ctx.createBufferSource();
    rn.buffer = this.pinkNoiseBuffer;
    rn.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.Q.value = 1.3;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(am.gain);
    rn.connect(rf);
    rf.connect(am);
    const rg = ctx.createGain();
    rg.gain.value = 1.2;
    am.connect(rg);
    rg.connect(out);

    // Hơi nóng xì xèo khi nòng quá nhiệt
    const hs = ctx.createBufferSource();
    hs.buffer = this.noiseBuffer;
    hs.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 3800;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    hs.connect(hf);
    hf.connect(hg);
    hg.connect(this.vehicleBus);

    // Lớp gầm liên tục khi đang xả đạn: nhiễu nâu điều biên theo nhịp bắn
    const roar = ctx.createBufferSource();
    roar.buffer = this.brownNoiseBuffer;
    roar.loop = true;
    const roarF = ctx.createBiquadFilter();
    roarF.type = 'lowpass';
    roarF.frequency.value = 650;
    const roarShaper = ctx.createWaveShaper();
    roarShaper.curve = this.getShaper(2.5);
    const roarAm = ctx.createGain();
    roarAm.gain.value = 1;
    const roarLfo = ctx.createOscillator();
    roarLfo.type = 'sawtooth';
    roarLfo.frequency.value = 13.3;
    const roarDepth = ctx.createGain();
    roarDepth.gain.value = 0;
    roarLfo.connect(roarDepth);
    roarDepth.connect(roarAm.gain);
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0;
    roar.connect(roarF);
    roarF.connect(roarShaper);
    roarShaper.connect(roarAm);
    roarAm.connect(roarGain);
    roarGain.connect(this.weaponBus);
    if (this.reverb) {
      const roarSend = ctx.createGain();
      roarSend.gain.value = 0.35;
      roarGain.connect(roarSend);
      roarSend.connect(this.reverb);
    }

    [m1, m2, rn, lfo, hs, roar, roarLfo].forEach(n => n.start());

    this.gatlingMotor = {
      out, m1, m2, mf, rf, lfo, hg, roarGain, roarLfo,
      lastRatio: 0, firing: false, burstShots: 0, wasOverheated: false
    };
    return this.gatlingMotor;
  }

  /**
   * Gọi mỗi khung hình cho xe người chơi có vũ khí liên thanh.
   * ratio: tốc độ quay nòng 0..1 (đã làm mượt quán tính), isFiring: đang nhả đạn, heat: nhiệt nòng 0..1
   */
  updateGatlingMotor(ratio, isFiring, heat = 0, overheated = false, tankType = 'GATLING') {
    if (!this.ctx || this.isMuted) return;
    const mm = this.ensureGatlingMotor();
    if (!mm) return;
    const t = this.ctx.currentTime;
    const rotary = tankType === 'GATLING';

    const motorHz = 85 + ratio * 640;
    const revPerSec = ratio * (rotary ? 8.28 : 6.05); // ~52 rad/s ~ 8.3 vòng/giây khớp tốc độ xả đạn mới
    mm.m1.frequency.setTargetAtTime(motorHz, t, 0.04);
    mm.m2.frequency.setTargetAtTime(motorHz * 0.503, t, 0.04);
    mm.mf.frequency.setTargetAtTime(motorHz * 1.7, t, 0.04);
    mm.lfo.frequency.setTargetAtTime(Math.max(0.5, revPerSec * 6), t, 0.04);
    mm.rf.frequency.setTargetAtTime(550 + ratio * 1100, t, 0.04);
    mm.out.gain.setTargetAtTime((!rotary || ratio < 0.01) ? 0 : 0.02 + ratio * 0.075, t, 0.05);

    const hiss = overheated ? 0.04 + heat * 0.07 : Math.max(0, heat - 0.55) * 0.07;
    mm.hg.gain.setTargetAtTime(hiss, t, 0.15);

    // Gầm tràng đạn: bật nhanh khi nhả đạn, tần số đồng bộ với tốc độ xả đạn dồn dập mới (~30.3 phát/giây)
    mm.roarLfo.frequency.setTargetAtTime(tankType === 'SCOUT' ? 18.2 : 30.3, t, 0.05);
    mm.roarGain.gain.setTargetAtTime(isFiring ? (rotary ? 0.14 : 0.05) : 0, t, isFiring ? 0.03 : 0.12);

    if (mm.firing && !isFiring && mm.burstShots >= 4) {
      this.playGatlingBurstTail(Math.min(1, mm.burstShots / 30), tankType);
    }
    if (!mm.firing && isFiring) mm.burstShots = 0;

    mm.wasOverheated = overheated;
    mm.firing = isFiring;
    mm.lastRatio = ratio;
  }

  // Tương thích ngược với lời gọi cũ
  playGatlingSpin(ratio = 0) {
    this.updateGatlingMotor(ratio, false);
  }

  // Biến thể dựng sẵn của tiếng súng (dựng lần đầu dùng, mỗi lần ~vài ms; tối đa 4 biến thể)
  // Mẫu dựng 10-90 ms/biến thể: chỉ dựng đồng bộ khi chưa có cái nào (thường đã dựng sẵn lúc rảnh, xem warmGunshots);
  // các biến thể còn lại dựng ngầm lúc trình duyệt rảnh để vụ nổ / loạt đạn không làm khựng khung hình
  gunshotBuffer(kind) {
    const cache = this._gunshots || (this._gunshots = {});
    const list = cache[kind] || (cache[kind] = []);
    const make = () => {
      const y = this.synthGunshot(kind, this.ctx.sampleRate);
      const b = this.ctx.createBuffer(1, y.length, this.ctx.sampleRate);
      b.getChannelData(0).set(y);
      list.push(b);
      return b;
    };
    if (!list.length) return make();
    // cú chạm vỏ đạn rơi dày (hàng chục lần/giây): cần nhiều biến thể hơn để tai không nhận ra mẫu lặp
    // súng máy ~10 phát/giây: 4 biến thể lặp lại dễ nghe ra nhịp "máy", cần nhiều hơn
    const maxV = (kind.startsWith('case') || kind === 'link127') ? 10 : kind === 'mg127' ? 8 : 4;
    if (list.length < maxV && !list.pending) {
      list.pending = true;
      this.whenIdle(() => { list.pending = false; if (list.length < maxV) make(); });
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  whenIdle(fn) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 400 });
    else if (typeof setTimeout === 'function') setTimeout(fn, 120);
    else fn();
  }

  // Dựng sẵn mỗi loại 1-2 biến thể ngay sau khi khởi tạo, từng mẫu một lúc trình duyệt rảnh
  warmGunshots() {
    const jobs = ['blast120', 'blastN', 'blast155', 'blastRPG', 'blastATGM', 'blast30', 'hitDirt', 'hitSteel', 'hitSteel127', 'mg127', 'case127', 'case30', 'hitSteelHeavy', 'blastAmmo',
      'debrisPlate', 'debrisMetal', 'debrisLink', 'hullBlast', 'hullTick', 'debrisPlateHull', 'debrisMetalHull', 'debrisCan',
      'debrisLinkHull', 'debrisCanHull', 'turretLand', 'sheetMetal', 'rebar',
      'blast120', 'blastN', 'blast155', 'blastRPG', 'blast30'];
    const step = () => {
      const k = jobs.shift();
      if (!k || !this.ctx) return;
      const list = (this._gunshots || (this._gunshots = {}))[k] || (this._gunshots[k] = []);
      if (list.length < 2) {
        const y = this.synthGunshot(k, this.ctx.sampleRate);
        const b = this.ctx.createBuffer(1, y.length, this.ctx.sampleRate);
        b.getChannelData(0).set(y);
        list.push(b);
      }
      this.whenIdle(step);
    };
    this.whenIdle(step);
  }

  /**
   * Tiếng súng dựng từng mẫu theo vật lý, thay cho cụm nhiễu lọc (nhiễu tắt dần luôn nghe "xì / bè", rất giả):
   *  - Sóng nổ đầu nòng = xung áp suất Friedlander p(t) = (1 - t/T)·e^(-b·t/T): đỉnh tức thì, pha dương ~1 ms rồi pha âm.
   *    Đây là tiếng "ĐOÀNG" thật; độ dài T quyết định độ trầm/đanh.
   *  - Khí thuốc phóng phụt ra sau đầu đạn: xung thứ 2 chậm hơn (T ~ 6 ms) -> cú "ĐÙNG" dày 60-200 Hz.
   *  - Phản xạ sớm: nóc xe (~1,6 ms) và mặt đất (~4,5 ms, mất bớt âm cao) — tai nghe thành "độ dày" của tiếng nổ.
   *  - Sóng nổ đập vào nóc xe / giá súng: tấm thép rung "thùng" ngắn (mode 90-1500 Hz, tắt ~0,1 s).
   *  - Luồng khí xoáy ở đầu nòng: nhiễu ngắn 6-10 ms.
   *  - Cơ cấu: bệ khóa nòng lùi rồi lao về đóng "cạch-cạch" (2 va chạm thép nhỏ) ~25-55 ms sau phát nổ.
   */
  synthGunshot(kind, SR) {
    const R = Math.random;
    // Vụ nổ (kind 'blast…'): [T pha dương sóng xung kích, mức cầu lửa, cắt trên cầu lửa Hz, thời gian tắt cầu lửa, độ dài mẫu]
    // T tỉ lệ căn bậc 3 khối thuốc nổ: 155mm (~7 kg) ~6 ms, 120mm ~4 ms, RPG ~2,5 ms, 30mm (vài chục gam) ~0,8 ms
    const BP = {
      blast155: [0.006, 0.5, 480, 0.24, 1.3], blast120: [0.004, 0.47, 560, 0.16, 1.0], blastN: [0.0035, 0.55, 600, 0.15, 0.9],
      blastRPG: [0.0025, 0.48, 800, 0.11, 0.8], blast30: [0.0008, 0.24, 1100, 0.028, 0.3],
      // tên lửa chống tăng lõm kép ~4-5 kg thuốc nổ: T ≈ 2,5 ms × (6,5)^(1/3) ≈ 4,5 ms — trầm & dày ngang đạn 120, cầu lửa gọn hơn
      blastATGM: [0.0045, 0.5, 640, 0.14, 1.0],
      // kho đạn xe kích nổ: hàng chục kg thuốc phóng + thuốc nổ, nổ dây chuyền -> sóng dài, cầu lửa lớn & lâu
      blastAmmo: [0.009, 0.6, 420, 0.32, 1.6]
    }[kind];
    const HIT = { hitSteel: 0.3, hitSteel127: 0.35, hitSteelHeavy: 0.7, hitDirt: 0.3, case127: 0.5, case30: 0.6, link127: 0.2 }[kind] || (STEEL[kind] && STEEL[kind].len);
    const N = Math.round((BP ? BP[4] : HIT || 0.32) * SR);
    const y = new Float32Array(N);
    const v = (a) => 1 + (R() - 0.5) * a;
    // xung Friedlander (có thời gian dựng 50 µs để không méo răng cưa)
    const friedlander = (dst, t0, amp, T, b) => {
      const i0 = Math.round(t0 * SR), L = Math.round(T * 7 * SR), tr = 0.000015;
      for (let i = 0; i < L && i0 + i < N; i++) {
        const t = i / SR;
        dst[i0 + i] += amp * (1 - t / T) * Math.exp(-b * t / T) * (1 - Math.exp(-t / tr));
      }
    };
    const onePoleLP = (x, f) => {
      const a = Math.exp(-2 * Math.PI * f / SR);
      let z = 0;
      for (let i = 0; i < x.length; i++) { z = z * a + x[i] * (1 - a); x[i] = z; }
      return x;
    };
    const ring = (x, ms, gain) => {
      for (const md of ms) {
        const w = 2 * Math.PI * md.f / SR, r = Math.exp(-6.91 / (md.t60 * SR));
        const c1 = 2 * r * Math.cos(w), c2 = -r * r, bb = Math.sin(w) * md.a * gain;
        let y1 = 0, y2 = 0, xp = 0;
        const end = Math.min(N, Math.round((0.06 + md.t60 * 1.2) * SR));
        for (let i = 0; i < end; i++) { const o = c1 * y1 + c2 * y2 + bb * xp; xp = x[i]; y2 = y1; y1 = o; y[i] += o; }
      }
    };
    const modes = (n, fLo, fHi, t60Lo, t60Hi) => {
      const m = [];
      for (let k = 0; k < n; k++) {
        const u = (k + R()) / n;
        m.push({ f: fLo * Math.pow(fHi / fLo, u), t60: t60Lo * Math.pow(t60Hi / t60Lo, u) * v(0.5), a: (0.5 + R()) / (1 + u * 3) });
      }
      return m;
    };
    if (BP) {
      // VỤ NỔ dựng theo vật lý: (1) sóng xung kích Friedlander — đỉnh tức thì, pha dương vài ms, pha âm hút ngược;
      // (2) phản xạ mặt đất nhập vào sóng tới (thân sóng Mach) ~1,2 ms sau; (3) không khí bị xé rối loạn ngay sau mặt sóng
      // ("rách" dải rộng vài chục ms); (4) quả cầu lửa / khí nổ giãn nở: khối "BÙM" trầm dải rộng tắt trong 0,03-0,13 s,
      // KHÔNG lọc dải hẹp (bướu "bè"); (5) đạn 155: khối đất hàng tấn bị hất -> nhịp "HỰ" thứ hai ~45 ms
      const [T, fbAmp, fbF, fbDec] = BP;
      const shock = new Float32Array(N);
      friedlander(shock, 0.002, 1.0, T * v(0.15), 1.3);
      const sg = onePoleLP(shock.slice(), 4000), dG = Math.round(0.0012 * v(0.3) * SR);
      for (let i = 0; i < N; i++) y[i] += shock[i] + (i >= dG ? sg[i - dG] * 0.6 : 0);
      const lobe = (t0, amp, fc, dec, rise) => {
        const x = new Float32Array(N), i0 = Math.round(t0 * SR);
        for (let i = 0; i + i0 < N; i++) { const tt = i / SR; x[i0 + i] = (R() * 2 - 1) * (1 - Math.exp(-tt / rise)) * Math.exp(-tt / dec); }
        onePoleLP(x, fc); onePoleLP(x, fc);
        let m = 0;
        for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(x[i]));
        for (let i = 0; i < N; i++) y[i] += x[i] / (m || 1) * amp;
      };
      lobe(0.002, fbAmp, fbF * v(0.15), fbDec * v(0.2), Math.max(0.0015, T * 0.6));
      if (kind === 'blast155') lobe(0.045 * v(0.2), fbAmp * 0.55, 220, 0.11, 0.006);
      // kho đạn: các viên / liều phóng bắt nhau kích nổ dây chuyền trong ~0,15 s -> 2 nhịp "ẦM" nối tiếp, khối lửa thuốc phóng cuộn
      if (kind === 'blastAmmo') { lobe(0.035 * v(0.4), fbAmp * 0.7, 380, 0.16, 0.004); lobe(0.09 * v(0.4), fbAmp * 0.5, 320, 0.22, 0.01); }
      // Đất rung: sóng nổ truyền qua nền đất + khí nổ cuộn lên — lớp trầm 100-200 Hz kéo dài ~0,3 s, "rung ngực"
      if (kind !== 'blast30') lobe(0.012, fbAmp * (kind === 'blast155' ? 0.75 : 0.6), 150, kind === 'blast155' ? 0.4 : 0.28, 0.015);
      // không khí xé rối sau mặt sóng
      { const i0 = Math.round(0.002 * SR), L = Math.round(T * 20 * SR), ta = Math.exp(-2 * Math.PI * 900 / SR); let xp = 0, yp = 0;
        for (let i = 0; i < L && i0 + i < N; i++) { const n = (R() * 2 - 1) * Math.exp(-i / (T * 5 * SR)) * 0.4; const o = ta * (yp + n - xp); xp = n; yp = o; y[i0 + i] += o; } }
    } else if (kind === 'hitSteel' || kind === 'hitSteelHeavy' || kind === 'hitSteel127') {
      // Đầu đạn đập vào giáp thép: xung tiếp xúc cực ngắn (va cứng -> sáng) gõ vào hàng chục mode của tấm giáp dày.
      // Giáp dày + bắt chặt nên tắt nhanh: "TÁNG / CHÁT" đanh, không ngân như chuông.
      // Đạn xuyên giáp 120mm (heavy): cú va lớn hơn hẳn, mode trầm hơn, kèm cú thụp cả khối xe và tiếng xé thép
      // Đạn 12.7mm (~45 g, ~850 m/s, ~16 kJ — như búa tạ quai vào giáp): lõi thép + vỏ đồng vỡ tan trên mặt giáp.
      // Mẫu 'hitSteel' cũ (mode từ 700 Hz, tắt 0,1 s) chỉ ra tiếng "tinh" mỏng như gõ thìa. Cú va đủ mạnh để gõ cả các mode
      // trầm của tấm giáp (từ ~250 Hz) + xung áp suất của đầu đạn vỡ vụn "CHÁT" + thân xe rung "thụp" ngắn
      const heavyHit = kind === 'hitSteelHeavy', mgHit = kind === 'hitSteel127';
      const x = new Float32Array(N), i0 = Math.round(0.002 * SR), L = Math.max(2, Math.round((heavyHit ? 0.00018 : mgHit ? 0.0001 : 0.00012) * SR));
      for (let i = 0; i < L; i++) x[i0 + i] += Math.PI / (2 * L) * Math.sin(Math.PI * (i + 0.5) / L);
      ring(x, heavyHit ? modes(60, 180, 8500, 0.3, 0.035) : mgHit ? modes(55, 260, 8500, 0.17, 0.022) : modes(40, 700, 9000, 0.1, 0.02), heavyHit ? 1.4 : 1);
      // mảnh kim loại / sơn tróc bắn ra: "xẹt" ngắn dải cao
      { const L2 = Math.round((mgHit ? 0.045 : 0.03) * SR), ta = Math.exp(-2 * Math.PI * 2000 / SR); let xp = 0, yp = 0;
        for (let i = 0; i < L2; i++) { const n = (R() * 2 - 1) * Math.exp(-i / ((mgHit ? 0.009 : 0.006) * SR)) * (mgHit ? 0.4 : 0.25); const o = ta * (yp + n - xp); xp = n; yp = o; y[i0 + i] += o; } }
      if (mgHit) {
        let pk0 = 0; for (let i = 0; i < N; i++) pk0 = Math.max(pk0, Math.abs(y[i]));
        // đầu đạn vỡ vụn: xung áp suất rất ngắn, dải rộng -> phần "CHÁT" đập vào tai trước cả tiếng thép ngân
        friedlander(y, 0.002, pk0 * 0.9, 0.00018 * v(0.3), 1.3);
        // thân xe rung "thụp": năng lượng dưới ~350 Hz, tắt ~25 ms (không có cao độ -> không thành tiếng trống)
        const th = new Float32Array(N);
        for (let i = 0; i < Math.round(0.15 * SR); i++) { const tt = i / SR; th[i0 + i] = (R() * 2 - 1) * (1 - Math.exp(-tt / 0.0008)) * Math.exp(-tt / 0.025); }
        onePoleLP(th, 350); onePoleLP(th, 350);
        let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(th[i]));
        for (let i = 0; i < N; i++) y[i] += th[i] / (m || 1) * pk0 * 0.55;
      }
      if (heavyHit) {
        // cả khối xe 60 tấn rung "THỤP" + thép bị xé rít
        const th = new Float32Array(N);
        for (let i = 0; i < Math.round(0.25 * SR); i++) { const tt = i / SR; th[i0 + i] = (R() * 2 - 1) * (1 - Math.exp(-tt / 0.002)) * Math.exp(-tt / 0.04); }
        onePoleLP(th, 260); onePoleLP(th, 260);
        let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(th[i]));
        let pk0 = 0; for (let i = 0; i < N; i++) pk0 = Math.max(pk0, Math.abs(y[i]));
        for (let i = 0; i < N; i++) y[i] += th[i] / (m || 1) * pk0 * 0.35;
      }
    } else if (kind === 'case127' || kind === 'case30' || kind === 'link127') {
      // MỘT cú chạm của vỏ đạn (số lần nảy, nhịp nảy, lăn... do dropCasing lập lịch lúc chạy -> không vỏ nào giống vỏ nào).
      // Ống kim loại rỗng rung theo các mode uốn (thanh tự do 1 : 2,76 : 5,40 : 8,93), mỗi mode tách đôi lệch vài Hz (ống không
      // tròn tuyệt đối -> ngân hơi "rung"); điểm chạm dọc thân vỏ ngẫu nhiên -> mode nào nằm gần nút thì yếu đi, âm sắc mỗi cú
      // một khác. Đồng thau 12.7mm "tinh" sáng; thép 30mm dày "cộc" trầm, tắt nhanh; mắt xích dây đạn (thép dập mỏng) "tích" khô
      const link = kind === 'link127', brass = kind === 'case127';
      const f1 = (link ? 3400 : brass ? 2300 : 1150) * v(0.12);
      const x = new Float32Array(N), i0 = Math.round(0.002 * SR), L = Math.max(2, Math.round((link ? 0.00004 : brass ? 0.00005 : 0.0001) * SR));
      for (let i = 0; i < L; i++) x[i0 + i] += Math.PI / (2 * L) * Math.sin(Math.PI * (i + 0.5) / L);
      const hitPos = R();
      const ms = [];
      [1, 2.76, 5.4, 8.93].forEach((r, k) => {
        if (f1 * r > SR * 0.42) return;
        const shape = Math.abs(Math.cos(Math.PI * hitPos * (k + 1.5)));
        const a = (0.25 + shape) * (0.6 + R() * 0.6) / (1 + k * 0.15);
        const t60 = (link ? 0.035 : brass ? 0.17 : 0.07) / (1 + k * 0.35) * v(0.3);
        ms.push({ f: f1 * r, t60, a }, { f: f1 * r * (1.002 + R() * 0.006), t60: t60 * 0.8, a: a * (0.3 + R() * 0.5) });
      });
      // nóc xe thép bị gõ khẽ: vài mode trầm tắt rất nhanh (cho tiếng chạm có "nền", không chỉ tiếng tinh)
      for (let k = 0; k < 6; k++) ms.push({ f: 300 + R() * 900, t60: 0.03, a: link ? 0.12 : 0.25 });
      ring(x, ms, 1);
      // tiếng "tách" của lúc chạm (dải rộng, 1-2 ms)
      for (let i = 0; i < Math.round(0.002 * SR); i++) y[i0 + i] += (R() * 2 - 1) * 0.12 * Math.exp(-i / (0.0004 * SR));
    } else if (STEEL[kind]) {
      // MỘT cú va của vật bằng thép (mảnh văng, tấm giáp, tháp pháo, thân xe...), xem bảng STEEL. Bản cũ dựng từ vài sóng
      // sin / dải nhiễu hẹp có cao độ rõ -> lần chạm nào cũng kêu "tưng / boong" như gảy đàn, gõ chuông. Ngoài đời:
      //  - xung tiếp xúc nửa hình sin dài tc: mặt mềm (đất) chạm lâu 1-8 ms -> xung tự lọc mất âm cao, chỉ gõ được các mode
      //    thấp, đất ôm lấy vật hút gần hết rung -> "CỘP / THỤNG" đục, tắt trong vài chục ms; thép đập thép chạm 0,1-0,5 ms
      //    -> gõ vào hàng chục mode;
      //  - mode của tấm / khối thép dày đặc và bất hòa -> "CHOANG / CHÁT" rền chứ không ra nốt; mode cao tắt nhanh hơn;
      //  - điểm chạm ngẫu nhiên: mode nằm gần đường nút gần như không kêu -> mỗi biến thể một âm sắc, lần nảy nào cũng khác
      const P = STEEL[kind];
      const x = new Float32Array(N), i0 = Math.round(0.002 * SR);
      const L = Math.max(2, Math.round(P.tc * v(0.5) * SR));
      for (let i = 0; i < L; i++) x[i0 + i] += Math.PI / (2 * L) * Math.sin(Math.PI * (i + 0.5) / L);
      const ms = [];
      for (const [n, fLo, fHi, tLo, tHi, amp] of P.m) for (const m of modes(n, fLo, fHi, tLo, tHi)) { m.a *= amp * (0.2 + R()); ms.push(m); }
      ring(x, ms, 1);
      let pk = 0;
      for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(y[i]));
      for (let i = 0; i < N; i++) y[i] /= pk || 1;
    } else if (kind === 'hitDirt') {
      // Đầu đạn cắm xuống đất: cú "phập" (xung ngắn) + đất bị xới bắn tung (nhiễu tắt ~25 ms) + thụp trầm của nền đất
      const x = new Float32Array(N);
      friedlander(x, 0.002, 1.0, 0.0003 * v(0.3), 1.2);
      for (let i = 0; i < N; i++) y[i] += x[i];
      const i0 = Math.round(0.0025 * SR);
      const dirt = new Float32Array(N), thud = new Float32Array(N);
      for (let i = 0; i + i0 < N && i < Math.round(0.2 * SR); i++) {
        const tt = i / SR;
        dirt[i0 + i] = (R() * 2 - 1) * (1 - Math.exp(-tt / 0.002)) * Math.exp(-tt / 0.025);
        thud[i0 + i] = (R() * 2 - 1) * (1 - Math.exp(-tt / 0.001)) * Math.exp(-tt / 0.02);
      }
      onePoleLP(dirt, 2500); onePoleLP(thud, 300); onePoleLP(thud, 300);
      const nrm = (a) => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(a[i])); return m || 1; };
      const md = nrm(dirt), mt = nrm(thud);
      for (let i = 0; i < N; i++) y[i] += dirt[i] / md * 0.28 + thud[i] / mt * 0.32;
    } else if (kind === 'mg127') {
      const blast = new Float32Array(N);
      friedlander(blast, 0.002, 1.0, 0.0006 * v(0.2), 1.4);          // sóng nổ đầu nòng
      friedlander(blast, 0.0024, 0.2, 0.007 * v(0.2), 1.2);          // khí thuốc phóng phụt "ĐÙNG"
      // sóng N của đầu đạn siêu thanh bay sát bên (~0,3 ms): tiếng "chắc" đanh của đạn cỡ lớn
      { const i0 = Math.round(0.0028 * SR), L = Math.round(0.0003 * SR); for (let i = 0; i <= L; i++) blast[i0 + i] += 0.45 * (1 - 2 * i / L); }
      // luồng khí xoáy đầu nòng
      for (let i = 0; i < Math.round(0.012 * SR); i++) blast[Math.round(0.002 * SR) + i] += (R() * 2 - 1) * 0.12 * Math.exp(-i / (0.004 * SR));
      // trực tiếp + phản xạ nóc xe + phản xạ mặt đất (mất âm cao)
      for (let i = 0; i < N; i++) y[i] += blast[i];
      const d1 = Math.round(0.0016 * SR), d2 = Math.round(0.0045 * v(0.2) * SR);
      const g = onePoleLP(blast.slice(), 3500);
      for (let i = N - 1; i >= 0; i--) {
        if (i >= d1) y[i] += blast[i - d1] * 0.2;
        if (i >= d2) y[i] += g[i - d2] * 0.45;
      }
      // Cú "thụp" trầm: sóng nổ đập xuống nóc xe + mặt đất, cả khối xe rung — năng lượng dưới ~380 Hz kéo dài ~40 ms,
      // dải rộng không có cao độ (không thành bướu "bè"). Đây là phần tạo sức nặng mà xung nổ ngắn không có
      {
        const th = new Float32Array(N), i0 = Math.round(0.002 * SR), L = Math.round(0.16 * SR);
        for (let i = 0; i < L; i++) { const tt = i / SR; th[i0 + i] = (R() * 2 - 1) * (1 - Math.exp(-tt / 0.002)) * Math.exp(-tt / 0.022); }
        onePoleLP(th, 380); onePoleLP(th, 380);
        let m = 0;
        for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(th[i]));
        for (let i = 0; i < N; i++) y[i] += th[i] / (m || 1) * 0.35;
      }
      // nóc xe / giá súng rung "thùng" theo sóng nổ
      ring(onePoleLP(blast.slice(), 2000), modes(30, 140, 1800, 0.12, 0.035), 0.006);
      // cơ cấu khóa nòng: lùi "cạch" ~25 ms, lao về đóng ~50 ms
      const mech = new Float32Array(N);
      for (const [tm, amp] of [[0.025 * v(0.15), 0.005], [0.052 * v(0.1), 0.007]]) {
        const i0 = Math.round(tm * SR), L = Math.round(0.0005 * SR);
        for (let i = 0; i < L; i++) mech[i0 + i] += amp * Math.PI / (2 * L) * Math.sin(Math.PI * (i + 0.5) / L);
      }
      ring(mech, modes(24, 500, 6000, 0.05, 0.015), 1);
      // Cắt dưới ~65 Hz: loa thường không phát, tai kém nhạy, nhưng lại chiếm hết đỉnh và kích limiter tổng ép mất
      // tiếng nổ đanh -> chỉ còn tiếng ù "bè bè". Bỏ đi thì cùng mức đỉnh, phần nghe được to và đanh hơn hẳn
      for (let pass = 0; pass < 2; pass++) {
        const a = Math.exp(-2 * Math.PI * 65 / SR);
        let xp = 0, yp = 0;
        for (let i = 0; i < N; i++) { const o = a * (yp + y[i] - xp); xp = y[i]; yp = o; y[i] = o; }
      }
    }
    if (BP || HIT) {
      // cắt dưới ~60 Hz: siêu trầm chiếm hết đỉnh, kích limiter tổng ép mất cú đập (tiếng nổ thành khối phẳng)
      for (let pass = 0; pass < 2; pass++) {
        const a = Math.exp(-2 * Math.PI * 60 / SR);
        let xp = 0, yp = 0;
        for (let i = 0; i < N; i++) { const o = a * (yp + y[i] - xp); xp = y[i]; yp = o; y[i] = o; }
      }
    }
    let pk = 0;
    for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(y[i]));
    // Nén như micro ghi âm súng bị quá tải: đỉnh nhọn bị ép, thân + đuôi của phát nổ to lên tương đối (nghe "ĐOÀNG" đặc, có sạn)
    const drive = (kind.startsWith('case') || kind === 'link127') ? 0.5 : (BP || HIT) ? 2 : 2.5, nd = Math.tanh(drive);   // vỏ đạn: giữ nguyên dải động
    const fade = Math.round(0.02 * SR);
    for (let i = 0; i < N; i++) y[i] = Math.tanh(y[i] / (pk || 1) * drive) / nd * (i > N - fade ? (N - i) / fade : 1);
    return y;
  }

  /**
   * Một phát đạn 30mm: xung nén + sức ép đầu nòng + tiếng trầm.
   * distance > 0: xe khác bắn (nhỏ dần, mất âm cao, vọng nhiều hơn, nổi trái/phải theo pos).
   * opts.inside: trạm súng điều khiển từ xa trên nóc xe tăng của mình — kíp xe ngồi trong tháp, nghe qua lớp thép
   * (ù, trầm, mất tiếng chát cao, thân tháp cộng hưởng; vỏ đạn rơi trên nóc nghe "lộc cộc" đục);
   * opts.interval: nhịp bắn thật (giây) — các phát rơi cùng khung hình được dàn lại cho đều
   */
  playGatlingShot(tankType = 'GATLING', distance = 0, pos = null, shooterId = null, opts = null) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const remote = distance > 0;
    if (remote) {
      // Giới hạn theo TỪNG xe bắn (trước đây một mốc chung 50 ms cho mọi xe: pháo 6 nòng địch 30 phát/giây bị cắt còn
      // ~15 phát/giây, nghe chậm như súng máy thường; 2 xe cùng bắn thì giành lượt nhau, tràng đạn lỗ chỗ).
      // Gần: giữ đủ nhịp 30 phát/giây; xa (>~100 m): các phát đã nhòe vào nhau, phát cách phát để đỡ tốn
      const key = shooterId !== null && shooterId !== undefined ? shooterId : '_';
      this._remoteGat = this._remoteGat || new Map();
      const gap = tankType === 'MG762' ? 0.075 : tankType === 'SCOUT' ? 0.09 : distance < 800 ? 0.03 : 0.06;
      const last = this._remoteGat.get(key);
      if (last !== undefined && now - last < gap) return;
      // tổng số phát của mọi xe khác trong ~0,1 s: chặn trên để mưa đạn không làm nghẽn âm thanh
      this._remoteGatWin = (this._remoteGatWin || []).filter(x => now - x < 0.1);
      if (this._remoteGatWin.length >= 8) return;
      this._remoteGatWin.push(now);
      this._remoteGat.set(key, now);
      if (this._remoteGat.size > 24) this._remoteGat.clear();
    }
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.22, delay: 0, pan: 0 };
    if (sp.gain < 0.05) return;
    // MG762: súng máy 7.62mm (trạm súng xe tăng) — cùng kiểu tiếng súng máy nhưng đạn nhỏ: "tạch" mỏng, cao, ngắn hơn
    const mg762 = tankType === 'MG762';
    const scout = tankType === 'SCOUT' || mg762;
    let t = now + sp.delay;
    if (!remote && !scout) {
      // Game nhả đạn theo khung hình: có khung 2 phát rơi cùng một thời điểm (chồng đôi, nhịp giật cục).
      // Cụm nòng quay đều nên nhịp thật đều tăm tắp ~33 ms: dàn lại theo đồng hồ âm thanh (lệch tối đa 30 ms)
      const last = this._gatShotT || 0;
      if (now - last < 0.1) t = Math.max(now, Math.min(now + 0.03, last + 0.033));
      this._gatShotT = t;
    }
    const inside = !remote && opts && opts.inside;
    if (!remote && scout && opts && opts.interval) {
      // súng máy bắn đều theo nhịp cơ khí: phát rơi cùng khung hình với phát trước -> lùi lại đúng một nhịp
      const last = this._mgShotT || 0;
      if (now - last < 0.3) t = Math.max(now, Math.min(now + 0.26, last + opts.interval));
      this._mgShotT = t;
    }
    const p = (mg762 ? 1.65 : scout ? 1.25 : 1.0) * (1 + (Math.random() - 0.5) * 0.1);
    // 30 phát/giây (6 nòng) / 10 phát/giây (12.7mm) cộng dồn: mỗi phát phải nhỏ, nếu không cả loạt thành bức tường ồn
    // chạm trần, đè mất mọi tiếng khác (đo được: loạt 30mm trước đây ~-4 dBFS liên tục)
    // Pháo 6 nòng của mình đi qua blastBus (bão hòa cả cụm): các phát quyện thành tiếng gầm "BRRRT" đặc
    // Súng máy 12.7mm của mình qua blastBus thường (giữ nguyên cú đấm 50-100 Hz; kênh heavy cắt trầm làm tiếng ồm "bè bè")
    const out = this.voice({ bus: (remote || scout) ? null : this.blastBus(true), gain: sp.gain * (mg762 ? 0.62 : 1) * (inside ? 0.5 : scout ? (remote ? 0.38 : 0.62) : remote ? 0.5 : 0.16), lowpass: remote ? sp.lowpass : inside ? 2300 : scout ? 9000 : 2200,
      wet: inside ? 0.12 : (scout && !remote) ? 0.55 : sp.wet,   // súng máy ngoài trời: tiếng dội môi trường lấp giữa các phát -> loạt đạn dày, thật
      pan: (!remote && !scout) ? (Math.random() - 0.5) * 0.25 : sp.pan });   // 6 nòng xoay: mỗi phát lệch nhẹ trái/phải -> loạt đạn rộng, dày

    if (!this.playSample('gatling_shot', out, t, { gain: 1.0, vary: 0.06 })) {
      if (scout) {
        // Súng máy 12.7mm / 7.62mm: một "bản ghi" phát bắn dựng theo vật lý (xem synthGunshot) — cả súng của mình lẫn của
        // xe khác (trước đây xe khác dùng cụm nhiễu lọc: nghe "xì / bè", lệch hẳn tiếng súng của mình).
        // Xe khác ở xa: voice() đã lọc mất âm cao, hạ mức, thêm vọng theo cự ly
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('mg127');
        src.playbackRate.value = p * 0.8;
        src.connect(out);
        src.start(t);
        if (inside) {
          // thân tháp thép rung theo cú giật của bệ súng: tiếng "thụp" trầm dội trong khoang + khung bệ lách cách
          this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, freqEnd: 90, sweep: 0.09, drive: 2, gain: 1.3, attack: 0.002, dur: 0.14 });
          this.tone(out, t, { freq: 95, freqEnd: 55, sweep: 0.07, gain: 0.5, attack: 0.002, dur: 0.1 });
          this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 3, gain: 0.12, attack: 0.001, dur: 0.03 });
        }
      } else {
        // Pháo 30mm: mỗi phát là một cú "ĐÙNG" nhỏ có thân dày 200-600 Hz, tắt nhanh trong ~40 ms để 30 phát/giây
        // vẫn tách nhịp thành tiếng xé "BRRRT" (đuôi dài làm cả loạt nhòe thành bức tường ồn).
        // Ít xì chói trên 2,5 kHz (trước đây chiếm 36% phần tai nghe thấy -> loạt đạn mỏng, "lẹt đẹt")
        // Xe khác bắn (remote): thân trầm 30 phát/giây chồng lên nhau thành một bức tường ù ở dải 100-300 Hz, chạm tầng giới
        // hạn đỉnh và ép mất cả phần trung -> loạt đạn 30mm ở 50 m nghe NHỎ hơn súng máy 12.7mm (đo được ~-11 dB theo tai).
        // Nên từ xa giảm lớp trầm, đuôi ngắn lại, nhấn tiếng "xé" dải trung 0,5-2 kHz
        const lk = remote ? 0.4 : 1;
        this.snap(out, t, 0.55, 5000 * p, 5);
        this.burst(out, t, { filter: 'lowpass', freq: 2600 * p, freqEnd: 350, sweep: 0.03, drive: 2, gain: 0.6, attack: 0.0006, dur: remote ? 0.08 : 0.05 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 250 * p, Q: 0.8, drive: 1.6, gain: 3.2 * lk, attack: 0.0008, dur: remote ? 0.1 : 0.07 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 150 * p, Q: 0.9, drive: 1.5, gain: 2.2 * lk, attack: 0.001, dur: remote ? 0.1 : 0.065 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 560 * p, Q: 0.8, drive: 1.4, gain: remote ? 1.6 : 1.1, attack: 0.0006, dur: remote ? 0.08 : 0.04 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 800 * p, freqEnd: 150, sweep: 0.06, drive: 2, gain: 1.2 * lk, attack: 0.001, dur: remote ? 0.16 : 0.07 });
        this.tone(out, t, { freq: 150 * p, freqEnd: 65, sweep: 0.04, drive: 2.5, gain: 1.1 * lk, attack: 0.001, dur: remote ? 0.1 : 0.06 });
        if (remote) this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300 * p, Q: 0.7, drive: 2, gain: 1.8, attack: 0.0006, dur: 0.06 });
      }
    }

    if (!remote) {
      if (this.interior && this.interiorShot) this.interiorShot(scout ? 'mg' : 'gatling', t);
      if (this.gatlingMotor) this.gatlingMotor.burstShots++;
      if (scout) {
        // Đại liên 12.7mm trên nóc xe: vỏ đồng thau văng lên nóc thép, nảy leng keng + mắt xích dây đạn
        // (mẫu dựng theo vật lý: ống kim loại rỗng rung + nảy vài lần, synthGunshot 'case127')
        // (7.62mm: vỏ nhỏ, nhẹ — rơi thưa hơn trong tai vì nhỏ tiếng; dùng chung mẫu vỏ / mắt xích)
        if (Math.random() < (mg762 ? 0.5 : 0.8)) this.dropCasing(t + 0.22 + Math.random() * 0.3, 'case127', inside);
        if (Math.random() < (mg762 ? 0.4 : 0.6)) this.dropCasing(t + 0.15 + Math.random() * 0.25, 'link127', inside);
      } else if (Math.random() < 0.3) {
        // Pháo 6 nòng 30mm: vỏ đạn thoát qua máng dưới hộp pháo, rơi thẳng xuống đất cạnh xe (không nảy trên nóc).
        // Giữa tiếng gầm 30 phát/giây chỉ còn nghe lộp cộp đục, rất nhỏ — trước đây ~10 vỏ/giây nảy ngân trên nóc thép
        // thành tràng "leng keng" như chuông gió, lấn cả tiếng súng
        this.dropChuteCasing(t + 0.18 + Math.random() * 0.2, 0.55);
      }
    }
  }

  /**
   * Một vỏ đạn (hoặc mắt xích dây đạn) rơi: chạm -> nảy vài lần (khoảng cách & độ mạnh giảm dần như quả bóng nảy, hệ số
   * nảy ngẫu nhiên) -> có khi lăn "lóc cóc" trên nóc xe. Mỗi lần chạm lấy một mẫu cú chạm khác (điểm chạm khác -> âm sắc
   * khác) nhưng cùng cao độ (vẫn là một vỏ). Một phần vỏ rơi thẳng xuống đất: chỉ "tộp" khẽ.
   * Bắn loạt dài, nóc xe phủ đầy vỏ: vỏ mới rơi vào đống vỏ cũ -> thêm tiếng "lẻng xẻng" của vỏ bên dưới bị gõ.
   */
  dropCasing(t, kind = 'case127', muffled = false) {
    if (!this.ready()) return;
    const link = kind === 'link127';
    const now = this.ctx.currentTime;
    // đống vỏ trên nóc: dồn lên theo số vỏ rơi, vơi dần (trượt khỏi nóc xe) khi ngừng bắn
    this._pile = Math.max(0, (this._pile || 0) - (now - (this._pileT === undefined ? now : this._pileT)) * 3);
    this._pileT = now;
    if (!link) this._pile = Math.min(30, this._pile + 1);
    // muffled: vỏ rơi trên nóc tháp, nghe từ trong xe qua lớp thép
    const out = this.voice({ bus: this.vehicleBus, gain: (link ? 0.07 : kind === 'case127' ? 0.11 : 0.14) * (muffled ? 0.75 : 1), wet: 0.08, lowpass: muffled ? 1600 : 20000, pan: 0.15 + (Math.random() - 0.5) * 0.7 });
    if (Math.random() > (link ? 0.55 : 0.7)) {
      // rơi xuống đất (cỏ, đất): cú "tộp" khẽ, gần như không ngân; thỉnh thoảng trúng sỏi đá
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, gain: 0.5, attack: 0.001, dur: 0.03 });
      if (Math.random() < 0.4) this.playCaseHit(out, t, kind, 1, 0.12, 2200);
      return;
    }
    const rate = 1 + (Math.random() - 0.5) * 0.12;
    const pile = Math.min(1, this._pile / 18);
    let tt = t, amp = 1, gap = (link ? 0.05 : 0.07) + Math.random() * 0.06;
    const n = (link ? 1 : 3) + Math.floor(Math.random() * 3);
    for (let b = 0; b < n; b++) {
      this.playCaseHit(out, tt, kind, rate, amp);
      if (pile > 0.1 && Math.random() < pile) this.playCaseHit(out, tt + 0.002 + Math.random() * 0.006, kind, rate * (1.1 + Math.random() * 0.25), amp * 0.5 * pile);
      const e = 0.55 + Math.random() * 0.25;   // hệ số nảy (vỏ kim loại nảy tưng tưng trên thép)
      tt += gap;
      gap *= e;
      amp *= e * (0.7 + Math.random() * 0.3);
      if (gap < 0.012) break;
    }
    // lăn trên nóc xe: chuỗi tiếng chạm li ti không đều, nhỏ dần
    if (!link && Math.random() < 0.55) {
      let rt = tt + 0.02, ra = 0.12 + Math.random() * 0.08;
      const f0 = (kind === 'case127' ? 2300 : 1150) * rate;
      const cnt = 4 + Math.floor(Math.random() * 9);
      for (let i = 0; i < cnt; i++) {
        this.metal(out, rt, { f0, ratios: [1, 2.76], decay: 0.025, gain: ra * 0.12, click: 0.3 });
        rt += 0.025 + Math.random() * 0.05;
        ra *= 0.85 + Math.random() * 0.12;
      }
    }
  }

  /**
   * Vỏ đạn 30mm của pháo 6 nòng rơi khỏi máng thoát vỏ xuống đất cạnh xe: vỏ thép nặng cắm xuống đất / đè lên vỏ
   * khác — "cộp" đục, tắt ngay, không nảy, không lăn trên nóc xe. amp < 1 khi đang bắn (tiếng súng át gần hết).
   */
  dropChuteCasing(t, amp = 1) {
    if (!this.ready()) return;
    const out = this.voice({ bus: this.vehicleBus, gain: 0.09 * amp, lowpass: 1800, wet: 0.06, pan: 0.25 + (Math.random() - 0.5) * 0.4 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520 + Math.random() * 260, gain: 0.7, attack: 0.001, dur: 0.035 });
    // thỉnh thoảng vỏ rơi đè lên vỏ cũ dưới đất / sỏi: một tiếng kim loại ngắn, đã mất âm cao
    if (Math.random() < 0.35) this.playCaseHit(out, t + 0.002, 'case30', 0.9 + Math.random() * 0.15, 0.35, 1400);
  }

  // phát một mẫu cú chạm vỏ đạn (lp > 0: chạm vật mềm / xa, cắt bớt âm cao)
  playCaseHit(dest, t, kind, rate, amp, lp = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.gunshotBuffer(kind);
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = amp;
    src.connect(g);
    if (lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      g.connect(f);
      f.connect(dest);
    } else g.connect(dest);
    src.start(Math.max(this.ctx.currentTime, t));
  }

  // Dư âm sau khi dứt một loạt đạn dài (phần lớn do hồi âm đảm nhiệm, lớp này thêm rền trầm)
  playGatlingBurstTail(intensity = 1, tankType = 'GATLING') {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const scout = tankType === 'SCOUT';
    const out = this.voice({ gain: 1, wet: 0.8 });
    this.burst(out, t, {
      buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: scout ? 650 : 450, freqEnd: 100, sweep: 2.0,
      gain: 0.24 * intensity, attack: 0.03, dur: 2.2
    });
    // Loạt đạn dài vọng lại từ đồi núi, công trình: "BRRRT ... rrrr" — như tiếng pháo, nhưng nhẹ hơn
    this.playTerrainEchoes(t - 0.1, (scout ? 0.28 : 0.4) * intensity);
    // Pháo 6 nòng vừa ngừng: mấy vỏ cuối còn trong máng tuột xuống đất — lúc súng im mới nghe rõ vài tiếng "cộp"
    if (!scout) {
      const n = 2 + Math.floor(Math.random() * 3 * intensity);
      let ct = t + 0.06 + Math.random() * 0.08;
      for (let i = 0; i < n; i++) {
        this.dropChuteCasing(ct, 0.8 + Math.random() * 0.3);
        ct += 0.05 + Math.random() * 0.12;
      }
    }
    // Tiếng vọng của CHÍNH loạt đạn: ngoài trời, nhả cò xong vẫn nghe "rrrr" theo đúng nhịp bắn vọng về từ xa, mờ dần
    // ~2 s. Thiếu lớp này thì sau 10 s "BRRRT" liên tục tiếng tụt 26 dB trong 1 s -> nghe như tắt phụt
    const ev = this.voice({ gain: 1, lowpass: 1000, wet: 0.9, pan: (Math.random() - 0.5) * 0.4 });
    const src = ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = scout ? 420 : 320;
    bp.Q.value = 0.8;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = scout ? 10 : 30.3;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(am.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime((scout ? 0.4 : 0.55) * intensity, t + 0.12);
    env.gain.setTargetAtTime(0, t + 0.25, scout ? 0.45 : 0.6);
    src.connect(bp);
    bp.connect(am);
    am.connect(env);
    env.connect(ev);
    src.start(t, Math.random() * 2);
    lfo.start(t);
    src.stop(t + 3.5);
    lfo.stop(t + 3.5);
  }
});
