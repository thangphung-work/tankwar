/**
 * NHẠC NỀN CHIẾN TRƯỜNG THÍCH ỨNG (procedural, gắn thêm vào SoundEngine — xem src/core/audio.js)
 * Tổng hợp 100% bằng Web Audio, không dùng file nhạc. Giọng Rê thứ, 100 BPM, vòng hợp âm i – VI – iv – V
 * (Dm – Bb – Gm – A); lúc cao trào đổi sang Dm – Eb – Dm – A (nốt Mi giáng bán cung "căng thẳng").
 *
 * Nhạc chia lớp, mỗi lớp tự vào / ra theo "cường độ trận đánh" 0..1:
 *   0.00+  nền: hợp âm đệm dày (sóng răng cưa lệch nhẹ) + tiếng trầm nền; bộ lọc mở sáng dần theo cường độ
 *   0.20+  ostinato bè trầm móc đơn / móc kép (kiểu nhạc phim hành động)
 *   0.40+  trống trận (taiko) + trống cơm / snare; 0.60+ dồn trống cuối vòng
 *   0.55+  dây vĩ cầm rải nốt cao liên tục
 *   0.65+  kèn đồng giật nhịp; 0.75+ hi-hat móc kép
 * Cường độ tính từ: xe địch ĐANG NHÌN THẤY ở gần (không dùng xe địch đang ẩn để nhạc không làm lộ vị trí),
 * sự kiện chiến đấu vừa xảy ra (mình bắn, đạn nổ gần, trúng đạn, đạn sượt qua, đạn pháo rít tới, bị khóa mục tiêu),
 * phút cuối trận. Lên nhanh (~1 s), xuống chậm (~6 s) để nhạc không giật cục.
 *
 * Điểm nhấn: hạ được địch -> kèn đồng + trống lớn + chũm chọe; xe mình bị hạ -> nhạc tắt nhịp, tiếng trầm rơi xuống;
 * máu thấp -> nhịp tim đập dồn (không phụ thuộc âm lượng nhạc), nhạc tối lại; tiếng nổ lớn / phát bắn của mình
 * dìm nhạc xuống trong chốc lát để cú nổ nghe "đã" hơn.
 *
 * game.js gọi: updateMusic(dt, game) mỗi khung hình, musicEvent('kill' | 'death' | 'win' | 'loss' | 'draw').
 * Âm lượng nhạc: setMusicVolume(0..1) (Cài đặt -> Nhạc nền).
 */
(function () {
  if (typeof SoundEngine === 'undefined') return;
  const P = SoundEngine.prototype;

  const BPM = 100;
  const STEP = 60 / BPM / 4;   // 1 móc kép = 0,15 s; 16 móc kép = 1 ô nhịp
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

  // bass: nốt trầm; pad: 3 nốt hợp âm đệm (quãng 3); hi: 3 nốt cao cho dây / kèn
  const PROG = [
    { bass: 38, pad: [50, 53, 57], hi: [62, 65, 69] },   // Dm
    { bass: 34, pad: [50, 53, 58], hi: [62, 65, 70] },   // Bb
    { bass: 31, pad: [50, 55, 58], hi: [62, 67, 70] },   // Gm
    { bass: 33, pad: [49, 52, 57], hi: [61, 64, 69] }    // A (Đô thăng: âm dẫn kéo về Rê)
  ];
  const PROG_CLIMAX = [
    PROG[0],
    { bass: 39, pad: [51, 55, 58], hi: [63, 67, 70] },   // Eb (bán cung Phrygian)
    PROG[0],
    PROG[3]
  ];
  // Ostinato bè trầm: quãng 8 nhảy lên ở các phách lệch -> cảm giác "đuổi bắt"
  const OST = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12];
  const TAIKO_BASE = [0, 6, 10];
  const TAIKO_HOT = [0, 3, 6, 8, 10, 12, 14];
  const BRASS_STEPS = [0, 3, 6];
  const STR_ORDER = [0, 1, 2, 1];

  // ---------------------------------------------------------------------------
  // ĐỊNH TUYẾN: nhạc -> dìm (khi nổ lớn) -> âm lượng người chơi -> master (đi qua bộ "ù tai" như mọi âm khác)
  // ---------------------------------------------------------------------------
  P.ensureMusicBus = function () {
    if (this._mus) return this._mus;
    if (!this.ctx || !this.masterGain) return null;
    const ctx = this.ctx, t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const tone = ctx.createBiquadFilter();   // "tối" nhạc khi máu thấp / xe bị hạ
    tone.type = 'lowpass';
    tone.frequency.value = 16000;
    tone.Q.value = 0.5;
    const duckG = ctx.createGain();
    duckG.gain.value = 1;
    const fade = ctx.createGain();           // vào / ra trận
    fade.gain.setValueAtTime(0, t);
    const user = ctx.createGain();
    user.gain.value = this.userMusic === undefined ? 0.6 : this.userMusic;
    bus.connect(tone);
    tone.connect(duckG);
    duckG.connect(fade);
    fade.connect(user);
    user.connect(this.masterGain);
    let send = null;
    if (this.reverb) {
      send = ctx.createGain();
      send.gain.value = 0.22;
      fade.connect(send);
      send.connect(this.reverb);
    }
    // Nhịp tim là tín hiệu trò chơi, không thuộc nhạc: không theo âm lượng nhạc
    const heart = ctx.createGain();
    heart.gain.value = 0.9;
    heart.connect(this.masterGain);
    this._mus = {
      bus, tone, duckG, fade, user, send, heart,
      state: 'off', I: 0, heat: 0, step: 0, next: 0, pad: null,
      climax: false, danger: 0, nextBeat: 0, lastCall: 0, lastBump: {}
    };
    return this._mus;
  };

  P.setMusicVolume = function (v) {
    if (typeof v === 'number') this.userMusic = clamp01(v);
    const M = this._mus;
    if (M && this.ctx) M.user.gain.setTargetAtTime(this.userMusic === undefined ? 0.6 : this.userMusic, this.ctx.currentTime, 0.05);
  };

  // Cú "đẩy" cường độ từ sự kiện chiến đấu (cộng dồn, tối đa 0,8; tự nguội dần)
  P.bumpCombat = function (amount, key = null, gap = 0) {
    const M = this._mus;
    if (!M || M.state !== 'match' || !this.ctx) return;
    if (key) {
      const now = this.ctx.currentTime;
      if (now - (M.lastBump[key] || -9) < gap) return;
      M.lastBump[key] = now;
    }
    M.heat = Math.min(0.8, M.heat + amount);
  };

  // ---------------------------------------------------------------------------
  // LỚP NỀN: hợp âm đệm bền (6 dao động răng cưa lệch nhau) + trầm nền
  // ---------------------------------------------------------------------------
  P.buildMusicPad = function (t) {
    const M = this._mus, ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 0.9;
    lp.connect(out);
    out.connect(M.bus);
    const oscs = [];
    PROG[0].pad.forEach((n, i) => {
      for (const det of [-9, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det + (i - 1) * 2;
        const g = ctx.createGain();
        g.gain.value = 0.16;
        o.connect(g);
        g.connect(lp);
        o.start(t);
        oscs.push(o);
      }
    });
    // trầm nền: sin ở nốt bass + tam giác quãng 8 trên (loa laptop vẫn nghe ra)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = mtof(PROG[0].bass);
    const subG = ctx.createGain();
    subG.gain.value = 0.5;
    const sub2 = ctx.createOscillator();
    sub2.type = 'triangle';
    sub2.frequency.value = mtof(PROG[0].bass + 12);
    const sub2G = ctx.createGain();
    sub2G.gain.value = 0.22;
    const subOut = ctx.createGain();
    subOut.gain.setValueAtTime(0, t);
    sub.connect(subG);
    subG.connect(subOut);
    sub2.connect(sub2G);
    sub2G.connect(subOut);
    subOut.connect(M.bus);
    sub.start(t);
    sub2.start(t);
    M.pad = { out, lp, oscs, sub, sub2, subOut };
  };

  P.setPadChord = function (ch, t, glide = 0.06) {
    const pad = this._mus && this._mus.pad;
    if (!pad) return;
    pad.oscs.forEach((o, i) => o.frequency.setTargetAtTime(mtof(ch.pad[Math.floor(i / 2)]), t, glide));
    pad.sub.frequency.setTargetAtTime(mtof(ch.bass), t, glide);
    pad.sub2.frequency.setTargetAtTime(mtof(ch.bass + 12), t, glide);
  };

  P.releaseMusicPad = function (after = 3) {
    const M = this._mus;
    if (!M || !M.pad) return;
    const pad = M.pad, t = this.ctx.currentTime;
    M.pad = null;
    for (const g of [pad.out.gain, pad.subOut.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.setTargetAtTime(0, t, after / 4);
    }
    for (const o of pad.oscs.concat([pad.sub, pad.sub2])) o.stop(t + after + 0.2);
  };

  // ---------------------------------------------------------------------------
  // NHẠC CỤ (mỗi nốt một chuỗi node ngắn, tự dọn sau khi tắt)
  // ---------------------------------------------------------------------------
  // Bè trầm ostinato: răng cưa + vuông, lọc thấp đóng nhanh -> "tưng tưng" gắt kiểu dây bass bật
  P.musBass = function (t, note, g, bright = 1) {
    const ctx = this.ctx, f = mtof(note);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(300 + 1500 * bright, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.11);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + 0.006);
    env.gain.setTargetAtTime(0.0001, t + 0.02, 0.05);
    lp.connect(env);
    env.connect(this._mus.bus);
    for (const [type, m, det] of [['sawtooth', 1, -6], ['square', 1, 6], ['sawtooth', 0.5, 0]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * m;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.3);
    }
  };

  // Trống taiko: thân da trầm (sin tụt cao độ) + tiếng dùi "bộp" + hơi thở thùng trống
  P.musTaiko = function (t, g, pitch = 1) {
    const out = this._mus.bus;
    this.tone(out, t, { freq: 128 * pitch, freqEnd: 46 * pitch, sweep: 0.14, gain: g, attack: 0.002, dur: 0.55, drive: 1.4 });
    this.tone(out, t, { freq: 210 * pitch, freqEnd: 120 * pitch, sweep: 0.05, gain: g * 0.35, attack: 0.001, dur: 0.12 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 650, gain: g * 1.6, attack: 0.001, dur: 0.11 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 1, gain: g * 0.4, attack: 0.001, dur: 0.03 });
  };

  // Snare / trống cơm quân hành: dây lò xo xè + thân "tách"
  P.musSnare = function (t, g) {
    const out = this._mus.bus;
    this.burst(out, t, { filter: 'bandpass', freq: 2600, Q: 0.7, gain: g, attack: 0.001, dur: 0.16 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 5000, gain: g * 0.5, attack: 0.001, dur: 0.09 });
    this.tone(out, t, { freq: 230, freqEnd: 170, sweep: 0.04, gain: g * 0.6, attack: 0.001, dur: 0.08 });
  };

  P.musHat = function (t, g) {
    this.burst(this._mus.bus, t, { filter: 'highpass', freq: 8000, gain: g, attack: 0.0008, dur: 0.035 });
  };

  // Kèn đồng: 3 răng cưa / nốt, bộ lọc mở "phừng" rồi khép (tiếng kèn đồng "bật hơi"), bão hòa nhẹ
  P.musBrass = function (t, notes, g, dur = 0.32) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.linearRampToValueAtTime(2800, t + 0.05);
    lp.frequency.setTargetAtTime(900, t + 0.08, dur * 0.4);
    const ws = ctx.createWaveShaper();
    ws.curve = this.getShaper(1.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + 0.035);
    env.gain.setValueAtTime(g * 0.8, t + dur * 0.6);
    env.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
    lp.connect(ws);
    ws.connect(env);
    env.connect(this._mus.bus);
    for (const n of notes) {
      for (const det of [-7, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur * 1.8 + 0.1);
      }
    }
  };

  // Dây rải: nốt cao ngắn, vào mềm (vĩ kéo) -> chuỗi móc kép "rì rì" căng thẳng
  P.musString = function (t, note, g) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = mtof(note) * 2.2;
    bp.Q.value = 0.7;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + 0.025);
    env.gain.setTargetAtTime(0.0001, t + STEP * 0.6, 0.03);
    bp.connect(env);
    env.connect(this._mus.bus);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(note);
      o.detune.value = det;
      o.connect(bp);
      o.start(t);
      o.stop(t + STEP + 0.2);
    }
  };

  P.musCymbal = function (t, g, dur = 1.6) {
    const out = this._mus.bus;
    this.burst(out, t, { filter: 'highpass', freq: 4500, gain: g, attack: 0.002, dur });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3200, Q: 2, gain: g * 0.6, attack: 0.002, dur: dur * 0.6 });
  };

  // ---------------------------------------------------------------------------
  // TRÌNH TỰ: lên lịch trước ~0,25 s theo đồng hồ âm thanh (không lệch nhịp khi khung hình giật)
  // ---------------------------------------------------------------------------
  P.scheduleMusicStep = function (t, step) {
    const M = this._mus;
    const I = M.I, dead = M.dead;
    const s = step % 16, bar = Math.floor(step / 16) % 4;
    if (s === 0 && bar === 0) M.climax = I > 0.82 && !dead;   // đổi vòng hợp âm chỉ ở đầu vòng
    const ch = (M.climax ? PROG_CLIMAX : PROG)[bar];
    if (s === 0) this.setPadChord(ch, t);

    const lvPulse = dead ? 0 : smooth(0.18, 0.35, I);
    const lvDrum = dead ? 0 : smooth(0.38, 0.55, I);
    const lvHot = dead ? 0 : smooth(0.6, 0.78, I);
    const lvStr = dead ? 0 : smooth(0.52, 0.7, I);
    const lvBrass = dead ? 0 : smooth(0.63, 0.8, I);
    const lvHat = dead ? 0 : smooth(0.74, 0.9, I);

    // bè trầm: móc đơn khi vừa, móc kép khi nóng
    if (lvPulse > 0.01 && (s % 2 === 0 || lvHot > 0.3)) {
      const acc = s % 4 === 0 ? 1 : 0.7;
      this.musBass(t, ch.bass + 12 + OST[s], 0.06 * lvPulse * acc, 0.3 + 0.7 * I);
    }
    if (lvDrum > 0.01) {
      const hot = lvHot > 0.3;
      if ((hot ? TAIKO_HOT : TAIKO_BASE).includes(s)) {
        const acc = s === 0 ? 1 : s === 10 ? 0.85 : 0.6;
        this.musTaiko(t, 0.22 * lvDrum * acc, s === 0 ? 1 : 1.15);
      }
      if ((s === 4 || s === 12) && I > 0.5) this.musSnare(t, 0.09 * lvDrum);
      // dồn trống cuối vòng (ô nhịp 4, 4 móc kép cuối): tom cao xuống trầm
      if (bar === 3 && s >= 12 && lvHot > 0.2) this.musTaiko(t, 0.16 * lvHot, 1.7 - (s - 12) * 0.18);
    }
    if (lvHat > 0.01) this.musHat(t, (s % 4 === 2 ? 0.07 : 0.035) * lvHat);
    if (lvStr > 0.01) this.musString(t, ch.hi[STR_ORDER[s % 4]] + (M.climax && s >= 8 ? 12 : 0), 0.024 * lvStr);
    if (lvBrass > 0.01 && (bar % 2 === 1 || I > 0.9) && BRASS_STEPS.includes(s)) {
      this.musBrass(t, ch.pad, (s === 6 ? 0.032 : 0.022) * lvBrass, s === 6 ? 0.55 : 0.22);
    }
    // phách đầu vòng khi cao trào: chũm chọe
    if (s === 0 && bar === 0 && M.climax) this.musCymbal(t, 0.07);
  };

  P.updateMusicMix = function (t) {
    const M = this._mus, pad = M.pad;
    const I = M.I;
    if (pad) {
      const dark = M.dead ? 0.15 : 1 - M.danger * 0.55;
      pad.lp.frequency.setTargetAtTime((320 + 2000 * Math.pow(I, 1.4)) * dark, t, 0.3);
      pad.out.gain.setTargetAtTime(M.dead ? 0.05 : 0.09 + 0.02 * I, t, 0.4);
      pad.subOut.gain.setTargetAtTime(M.dead ? 0.03 : 0.06 + 0.06 * smooth(0.3, 0.8, I), t, 0.4);
    }
    // máu thấp: toàn bộ nhạc mất âm cao như nghe qua lớp giáp, tim đập lấn lên
    const cut = M.dead ? 900 : 16000 - 13500 * M.danger;
    M.tone.frequency.setTargetAtTime(cut, t, 0.25);
  };

  // Nhịp tim: "thình-thịch" trầm, nhanh dần khi máu tụt
  P.musHeartbeat = function (t, k) {
    const out = this._mus.heart;
    for (const [d, g] of [[0, 1], [0.16, 0.65]]) {
      this.tone(out, t + d, { freq: 62, freqEnd: 38, sweep: 0.09, gain: 0.4 * k * g, attack: 0.006, dur: 0.2, drive: 1.3 });
      this.burst(out, t + d, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, gain: 0.35 * k * g, attack: 0.005, dur: 0.08 });
    }
  };

  // ---------------------------------------------------------------------------
  // VÀO / RA TRẬN & ĐIỂM NHẤN
  // ---------------------------------------------------------------------------
  P.startMusic = function () {
    const M = this.ensureMusicBus();
    if (!M) return;
    const t = this.ctx.currentTime;
    if (M.pad) this.releaseMusicPad(0.3);
    Object.assign(M, { state: 'match', I: 0.12, heat: 0, dead: false, danger: 0, climax: false, step: 0, next: t + 0.25, nextBeat: 0 });
    M.fade.gain.cancelScheduledValues(t);
    M.fade.gain.setValueAtTime(M.fade.gain.value, t);
    M.fade.gain.linearRampToValueAtTime(1, t + 2.5);
    this.buildMusicPad(t);
    this.setPadChord(PROG[0], t, 0.01);
    // mở màn: 1 tiếng trống lớn + chũm chọe vỗ nhẹ
    this.musTaiko(t + 0.25, 0.4, 0.9);
    this.musCymbal(t + 0.25, 0.04, 2.4);
  };

  P.stopMusic = function (fade = 1.5) {
    const M = this._mus;
    if (!M || M.state === 'off') return;
    const t = this.ctx.currentTime;
    M.state = 'off';
    M.fade.gain.cancelScheduledValues(t);
    M.fade.gain.setValueAtTime(M.fade.gain.value, t);
    M.fade.gain.setTargetAtTime(0, t, fade / 4);
    this.releaseMusicPad(fade + 0.5);
  };

  P.musicEvent = function (kind) {
    const M = this._mus;
    if (!M || !this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime + 0.02;
    if (kind === 'kill' && M.state === 'match') {
      // Hạ địch: kèn đồng hợp âm Rê trưởng (Picardy — chiến thắng nhỏ giữa giọng thứ) + trống lớn + chũm chọe
      this.musTaiko(t, 0.5, 0.85);
      this.musBrass(t, [50, 54, 57, 62], 0.06, 0.9);
      this.musCymbal(t, 0.08, 1.8);
      M.heat = Math.min(0.8, M.heat + 0.25);
    } else if (kind === 'death' && M.state === 'match') {
      // Xe mình bị hạ: nhịp nhạc tắt, nốt trầm rơi xuống nửa cung, chuông đồng xa
      M.dead = true;
      M.heat = 0;
      this.musTaiko(t, 0.5, 0.7);
      const ctx = this.ctx;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.09, t + 0.3);
      env.gain.setTargetAtTime(0.0001, t + 1.2, 1.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      lp.connect(env);
      env.connect(M.fade);
      for (const [n, det] of [[38, -8], [39, 8], [26, 0]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(mtof(n), t);
        o.frequency.exponentialRampToValueAtTime(mtof(n - 1), t + 3.5);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + 6.5);
      }
      this.metal(M.fade, t + 0.05, { f0: 110, ratios: [1, 2.32, 4.25, 6.63], decay: 3, gain: 0.05, click: 0.2 });
    } else if (kind === 'win' || kind === 'loss' || kind === 'draw') {
      if (M.state !== 'match') return;
      M.state = 'ended';
      if (kind === 'win') {
        // khớp với kèn chiến thắng (playVictoryFanfare, Đô trưởng): hợp âm đệm chuyển Đô trưởng, trống cuộn rồi đánh lớn
        this.setPadChord({ bass: 36, pad: [48, 52, 55] }, t, 0.15);
        for (let i = 0; i < 10; i++) this.musTaiko(t + i * 0.06, 0.12 + i * 0.02, 1.3);
        this.musTaiko(t + 0.62, 0.55, 0.85);
        this.musCymbal(t + 0.62, 0.09, 3);
        if (M.pad) M.pad.lp.frequency.setTargetAtTime(2400, t, 0.4);
      } else {
        // thua / hòa: hợp âm trầm tối, chuông đồng, tắt dần
        this.setPadChord(kind === 'loss' ? { bass: 34, pad: [46, 50, 53] } : { bass: 38, pad: [45, 50, 57] }, t, 0.3);
        this.musTaiko(t, 0.45, 0.7);
        this.metal(M.bus, t + 0.05, { f0: 98, ratios: [1, 2.32, 4.25, 6.63], decay: 3, gain: 0.06, click: 0.2 });
        if (M.pad) M.pad.lp.frequency.setTargetAtTime(500, t, 0.6);
      }
      M.tone.frequency.setTargetAtTime(16000, t, 0.2);
      M.fade.gain.cancelScheduledValues(t);
      M.fade.gain.setValueAtTime(M.fade.gain.value, t);
      M.fade.gain.setTargetAtTime(0, t + (kind === 'win' ? 3.5 : 2.5), 1.4);
      this.releaseMusicPad(kind === 'win' ? 9 : 8);
    }
  };

  // ---------------------------------------------------------------------------
  // GỌI MỖI KHUNG HÌNH
  // ---------------------------------------------------------------------------
  P.updateMusic = function (dt, g) {
    if (!this.ctx || !this.isInitialized) return;
    const M = this.ensureMusicBus();
    if (!M) return;
    const inMatch = !!(g && g.isGameStarted && !g.isGameOver);
    if (!inMatch) {
      if (M.state === 'match') {
        if (g && g.isGameOver) this.musicEvent('draw');   // kết thúc trận theo đường khác: tắt êm
        else this.stopMusic();
      } else if (M.state === 'ended' && g && !g.isGameStarted) M.state = 'off';
      return;
    }
    if (M.state !== 'match') {
      if (this.ctx.state !== 'running') return;
      this.startMusic();
    }
    const t = this.ctx.currentTime;
    dt = Math.max(0, Math.min(0.25, dt || 0));

    // --- cường độ trận đánh ---
    const me = g.player;
    let prox = 0, near = 0;
    const alive = !!(me && !me.isDead);
    if (alive && g.units) {
      for (const u of g.units) {
        if (u === me || u.isDead || u.team === me.team || u.isHiddenFromPlayer || u._netHidden) continue;
        const d = Math.hypot(u.x - me.x, u.z - me.z);
        if (d > 1300) continue;
        near++;
        prox = Math.max(prox, clamp01(1 - (d - 150) / 1150));
      }
    }
    if (M.dead && alive) { M.dead = false; M.I = 0.15; }   // xuất kích lại
    if (!alive) M.dead = true;
    M.heat *= Math.exp(-dt / 7);
    let late = 0;
    if (g.matchStartTime) {
      const left = (g.matchDuration || 600) - (Date.now() - g.matchStartTime) / 1000;
      if (left < 60) late = 0.15;
    }
    const hpR = alive && me.maxHp ? clamp01(me.hp / me.maxHp) : 1;
    const dangerT = alive ? smooth(0.4, 0.12, hpR) : 0;
    M.danger += (dangerT - M.danger) * (1 - Math.exp(-dt / 0.8));
    const target = M.dead ? 0.06 : clamp01(0.12 + prox * 0.5 + Math.min(3, Math.max(0, near - 1)) * 0.06 + M.heat + late + M.danger * 0.15);
    M.I += (target - M.I) * (1 - Math.exp(-dt / (target > M.I ? 0.8 : 6)));

    // --- lên lịch nhịp ---
    if (M.next < t - 0.1) {   // tab bị ẩn / khựng lâu: nhảy tới nhịp kế tiếp, không dồn một loạt nốt
      const skip = Math.ceil((t - M.next) / STEP);
      M.step += skip;
      M.next += skip * STEP;
    }
    while (M.next < t + 0.25) {
      this.scheduleMusicStep(M.next, M.step);
      M.step++;
      M.next += STEP;
    }
    this.updateMusicMix(t);

    // --- nhịp tim khi máu thấp ---
    if (alive && M.danger > 0.08) {
      if (M.nextBeat < t) M.nextBeat = t + 0.05;
      while (M.nextBeat < t + 0.2) {
        this.musHeartbeat(M.nextBeat, M.danger);
        M.nextBeat += 60 / (68 + 62 * M.danger);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // NỐI VÀO CÁC TIẾNG CHIẾN ĐẤU SẴN CÓ: đẩy cường độ + dìm nhạc khi nổ lớn
  // ---------------------------------------------------------------------------
  const wrap = (name, after) => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = function () {
      const r = orig.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) { /* nhạc không được làm hỏng tiếng chiến đấu */ }
      return r;
    };
  };
  // duck(): tiếng xe bị dìm khi nổ lớn — dìm cả nhạc (sâu hơn, hồi lâu hơn) để cú nổ có khoảng lặng tương phản
  const origDuck = P.duck;
  P.duck = function (depth = 0.4, release = 0.9) {
    origDuck.call(this, depth, release);
    const M = this._mus;
    if (!M || M.state === 'off') return;
    const g = M.duckG.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(1, g.value), t);
    g.linearRampToValueAtTime(Math.min(g.value, 0.12 + depth * 0.6), t + 0.015);
    g.setTargetAtTime(1, t + 0.15, release / 2);
  };
  wrap('playCannonFire', function (tankType, ammoType, distance) {
    if (!distance) this.bumpCombat(0.18);
    else if (distance < 900) this.bumpCombat(0.08 * (1 - distance / 900), 'rfire', 0.3);
  });
  wrap('playMissileLaunch', function (distance) { if (!distance) this.bumpCombat(0.2); });
  wrap('playGatlingShot', function (tankType, distance) { if (!distance) this.bumpCombat(0.05, 'gat', 0.25); });
  wrap('playExplosionAtDistance', function (distance, hitType, ammoType) {
    const small = ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY';
    if (distance < 700) this.bumpCombat((small ? 0.04 : 0.22) * (1 - distance / 700), small ? 'smallx' : null, small ? 0.3 : 0);
  });
  wrap('playHullHit', function () { this.bumpCombat(0.3, 'hull', 0.2); });
  wrap('playFlyby', function () { this.bumpCombat(0.15, 'flyby', 0.4); });
  wrap('playIncomingWhistle', function (dist) { if (dist < 400) this.bumpCombat(0.12, 'whistle', 0.5); });
  wrap('playLockWarning', function () { this.bumpCombat(0.15, 'lock', 1); });
  wrap('playMissileWarning', function () { this.bumpCombat(0.2, 'mwarn', 1); });
  wrap('playRadarAlert', function () { this.bumpCombat(0.12, 'radar', 2); });
})();
