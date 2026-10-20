/**
 * NHẠC NỀN TỔNG HỢP (không dùng file) — dàn nhạc điện ảnh quân sự giọng Rê thứ:
 *   trống taiko trầm, dây spiccato chạy móc kép (ostinato), dây nền, kèn đồng, hợp xướng "aah", trầm nền, piano trầm.
 *
 * setMusicMode(mode):
 *   'lobby'      sảnh chờ: chủ đề chính đi qua các đoạn mở đầu -> dồn dần -> cao trào -> lắng, lặp lại
 *   'search'     đang tìm trận: tối thiểu đoạn "dồn dần" + tiếng tích tắc móc đơn
 *   'countdown'  đếm ngược: cao trào + vê trống dồn + tiếng xoáy dâng lên
 *   'battle'     trong trận: nền căng thẳng, dày / mỏng theo độ ác liệt (musicHeat), phút cuối dồn dập
 *   'victory' | 'defeat' | 'draw'   đoạn kết ngắn rồi im
 *   'off'        tắt
 * Gọi được trước khi bật âm thanh: chế độ được nhớ lại, nhạc chạy ngay khi trình duyệt cho phép (thao tác đầu tiên).
 * setMusicVolume(0..1): Cài đặt -> Nhạc nền. Nhạc đi qua bus tổng nên theo âm lượng tổng và bị "ù tai" như mọi âm khác.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */
(function () {
  if (typeof SoundEngine === 'undefined') return;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // Hợp âm: b = nốt trầm (MIDI), t = 3 nốt hòa âm giữa, third = quãng ba so với nốt trầm (3 thứ / 4 trưởng)
  const ch = (b, t, third) => ({ b, t, third });
  const Dm = ch(38, [50, 53, 57], 3), Bb = ch(34, [50, 53, 58], 4), F = ch(41, [48, 53, 57], 4), C = ch(36, [48, 52, 55], 4);
  const Gm = ch(43, [50, 55, 58], 3), A = ch(45, [49, 52, 57], 4), Eb = ch(39, [51, 55, 58], 4);

  const Dmaj = ch(38, [50, 54, 57], 4);

  const SONGS = {
    // i - VI - III - VII - iv - VI - VII - I : vòng hợp âm anh hùng, ô nhịp cuối bừng sáng lên Rê TRƯỞNG rồi quay lại Rê thứ
    lobby: {
      bpm: 108, gain: 0.37, chords: [Dm, Bb, F, C, Gm, Bb, C, Dmaj],
      // chủ đề kèn đồng: nhịp chấm dôi "ta-ta TAAA", bước nhảy quãng 5 đi lên, đỉnh câu vút lên Rê cao
      // [ô nhịp, bước móc kép, nốt MIDI, độ dài (bước)]
      melody: [[0, 0, 62, 3], [0, 3, 62, 1], [0, 4, 69, 8], [0, 12, 67, 2], [0, 14, 65, 2],
        [1, 0, 65, 6], [1, 6, 67, 2], [1, 8, 65, 4], [1, 12, 62, 4],
        [2, 0, 60, 3], [2, 3, 60, 1], [2, 4, 65, 8], [2, 12, 69, 4],
        [3, 0, 67, 12], [3, 12, 64, 2], [3, 14, 67, 2],
        [4, 0, 70, 6], [4, 6, 69, 2], [4, 8, 67, 4], [4, 12, 62, 4],
        [5, 0, 65, 6], [5, 6, 67, 2], [5, 8, 70, 8],
        [6, 0, 72, 6], [6, 6, 70, 2], [6, 8, 69, 4], [6, 12, 67, 4],
        [7, 0, 69, 4], [7, 4, 74, 12]],
      order: ['intro', 'build', 'full', 'full', 'break', 'build', 'full', 'full'], loopFrom: 4
    },
    // i - VI - VII - i (hai lần, lần sau kết ở V): dồn dập, quyết liệt; mức cao nhất kèn đồng hát hiệu lệnh xung trận
    battle: {
      bpm: 112, gain: 0.16, chords: [Dm, Bb, C, Dm, Dm, Bb, C, A],
      melody: [[0, 0, 62, 3], [0, 3, 62, 1], [0, 4, 69, 12], [1, 0, 70, 8], [1, 8, 69, 4], [1, 12, 65, 4],
        [2, 0, 67, 12], [2, 12, 64, 4], [3, 0, 62, 16],
        [4, 0, 62, 3], [4, 3, 62, 1], [4, 4, 69, 12], [5, 0, 74, 8], [5, 8, 72, 4], [5, 12, 70, 4],
        [6, 0, 72, 8], [6, 8, 67, 8], [7, 0, 69, 16]]
    }
  };

  // Dây chạy móc kép: độ lệch (nửa cung) so với nốt trầm quãng tám 3; 'm' = quãng ba của hợp âm. Nhấn nhịp 3-3-3-3-4
  const OST = [0, 0, 12, 0, 0, 7, 0, 0, 12, 0, 0, 7, 0, 'm', 7, 12];
  const ACC = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0];
  // Trống taiko theo mức: [bước, lực, cao độ]
  const DRUMS = {
    1: [[0, 1, 1], [8, 0.7, 1.12]],
    2: [[0, 1, 1], [6, 0.55, 1.15], [8, 0.9, 1], [11, 0.55, 1.15], [14, 0.5, 1.3], [15, 0.55, 1.3]],
    3: [[0, 1.1, 1], [3, 0.6, 1.2], [6, 0.7, 1.2], [8, 1, 1], [10, 0.45, 1.35], [11, 0.65, 1.2], [12, 0.95, 1], [14, 0.65, 1.35], [15, 0.8, 1.35]]
  };
  // Trống quân hành (snare) mức đầy đủ: [bước, lực]
  const MARCH = [[4, 0.75], [10, 0.35], [12, 0.8], [14, 0.4], [15, 0.55]];
  // Các đoạn của nhạc sảnh. pad/drone/choir/piano: độ lớn từng bè; ost 1 = móc đơn, 2 = móc kép; drums: mức trống;
  // mel: kèn đồng hát chủ đề; stab: kèn đồng nhấn hợp âm theo nhịp; swell: kèn đồng ngân dâng mỗi 2 ô nhịp;
  // snare < 1: chỉ phách 2 & 4, = 1: trống quân hành; crash: chũm chọe đầu câu
  const SEC = {
    intro: { pad: 0.7, drone: 1, choir: 0.3, ost: 1, drums: 1, mel: 0, stab: 0, swell: 0.8, piano: 0, snare: 0, crash: 0.6, padLp: 1200 },
    build: { pad: 0.8, drone: 1, choir: 0.5, ost: 2, drums: 2, mel: 0.65, stab: 0, swell: 0, piano: 0, snare: 0.6, crash: 0.8, padLp: 1800 },
    full: { pad: 0.9, drone: 1, choir: 0.9, ost: 2, drums: 3, mel: 1, stab: 0.8, swell: 0, piano: 0, snare: 1, crash: 1, padLp: 2600 },
    break: { pad: 0.75, drone: 0.7, choir: 1, ost: 0, drums: 0, mel: 0, stab: 0, swell: 0.6, piano: 0.9, snare: 0, crash: 0, padLp: 1300 }
  };
  // Nhạc trận theo độ ác liệt 0..3 (drums 0.5 = một tiếng trống xa mỗi 2 ô nhịp)
  const BATTLE = [
    { pad: 0.5, drone: 0.9, choir: 0, ost: 0, drums: 0.5, mel: 0, stab: 0, swell: 0, snare: 0, padLp: 700 },
    { pad: 0.65, drone: 1, choir: 0, ost: 1, drums: 1, mel: 0, stab: 0, swell: 0.5, snare: 0, padLp: 1100 },
    { pad: 0.8, drone: 1, choir: 0.4, ost: 2, drums: 2, mel: 0, stab: 0.5, swell: 0.7, snare: 0.6, padLp: 1800 },
    { pad: 0.9, drone: 1, choir: 0.7, ost: 2, drums: 3, mel: 0.9, stab: 0.7, swell: 0, snare: 1, crash: 0.8, padLp: 2600 }
  ];
  const HEAT_UP = [0.2, 0.45, 0.75];   // ngưỡng lên mức 1, 2, 3

  SoundEngine.mixin(class {
    // =========================================================================
    // KHỞI TẠO, CHẾ ĐỘ, ÂM LƯỢNG
    // =========================================================================
    ensureMusic() {
      if (this._mz) return this._mz;
      if (!this.ctx || !this.masterGain) return null;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      // bài -> bus -> lọc "ù" (máu thấp / bị hạ) -> nén khi nổ gần -> âm lượng người chơi -> tổng
      const bus = ctx.createGain();
      // cắt dưới ~45 Hz: loa / tai nghe không phát được, chỉ làm nhạc đục và ăn chỗ của tiếng nổ
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 45;
      hp.Q.value = 0.7;
      const hp2 = ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = 38;
      hp2.Q.value = 0.6;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 20000;
      tone.Q.value = 0.5;
      const duck = ctx.createGain();
      const user = ctx.createGain();
      user.gain.setValueAtTime(this.userMusic === undefined ? 0.7 : this.userMusic, t);
      bus.connect(hp);
      hp.connect(hp2);
      hp2.connect(tone);
      tone.connect(duck);
      duck.connect(user);
      user.connect(this.masterGain);
      // hồi âm phòng hòa nhạc riêng cho nhạc (mượt, dài) — cắt trầm trước khi vào để tiếng trống không bị đục
      const hall = ctx.createConvolver();
      hall.buffer = this.buildHallImpulse(3.4);
      const hallHp = ctx.createBiquadFilter();
      hallHp.type = 'highpass';
      hallHp.frequency.value = 220;
      const hallSend = ctx.createGain();
      hallSend.gain.value = 0.42;
      bus.connect(hallHp);
      hallHp.connect(hallSend);
      hallSend.connect(hall);
      hall.connect(tone);

      this._mz = { bus, tone, duck, user, song: null, mode: 'off', step: 0, next: 0, stepDur: 0.16, heat: 0, lastT: t, final: 0, dead: false, lowHp: 0 };
      this._mzTimer = setInterval(() => { try { this._mzTick(); } catch (e) { /* bỏ qua một nhịp */ } }, 50);
      return this._mz;
    }

    buildHallImpulse(seconds) {
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const len = Math.floor(sr * seconds);
      const buf = ctx.createBuffer(2, len, sr);
      const pre = Math.floor(sr * 0.022);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let y = 0;
        for (let i = pre; i < len; i++) {
          const x = (Math.random() * 2 - 1) * Math.exp(-6.9 * (i - pre) / (len - pre));
          const a = 0.75 - 0.6 * (i / len);   // âm cao tắt nhanh hơn âm trầm
          y += a * (x - y);
          d[i] = y;
        }
      }
      return buf;
    }

    setMusicVolume(v) {
      if (typeof v === 'number') this.userMusic = Math.max(0, Math.min(1, v));
      if (this._mz && this.ctx) this._mz.user.gain.setTargetAtTime(this.userMusic, this.ctx.currentTime, 0.1);
    }

    musicEnabled() {
      return !this.isMuted && (this.userMusic === undefined || this.userMusic > 0.001);
    }

    setMusicMode(mode) {
      this._musicWant = mode;
      const M = this.ensureMusic();
      if (!M || M.mode === mode) return;
      const prev = M.mode;
      M.mode = mode;
      const t = this.ctx.currentTime;
      const S = M.song;
      if (mode === 'lobby' || mode === 'search' || mode === 'countdown') {
        if (!S || S.kind !== 'lobby') this._mzStart('lobby', t + 0.1, prev === 'off' ? 2.5 : 1.2);
        if (mode === 'countdown') this._mzCountdown(t);
        // về sảnh: xe mình đã tắt máy (sau trận về sảnh có thể còn tiếng máy treo)
        if (mode === 'lobby' && prev !== 'search' && prev !== 'countdown' && prev !== 'off') this._mzSilenceVehicles();
      } else if (mode === 'battle') {
        this._mzStop(0.25);
        M.heat = 0.3;
        if (this.playBattleStart) this.playBattleStart();
        this._mzStart('battle', t + 3.2, 4);
      } else if (mode === 'victory' || mode === 'defeat' || mode === 'draw') {
        this._mzStop(1.2);
        this.playMusicStinger(mode, t + 0.15);
      } else {
        this._mzStop(1.5);
      }
    }

    // độ ác liệt trận đánh: mỗi sự kiện cộng thêm, tự nguội dần (~14 s)
    musicHeat(x) {
      const M = this._mz;
      if (M && M.mode === 'battle') M.heat = Math.min(1, M.heat + x);
    }

    // nhạc nhỏ đi một chút khi có tiếng nổ lớn gần (cú nổ "xuyên" qua nhạc)
    musicDuck(depth = 0.5, release = 1.6) {
      const M = this._mz;
      if (!M) return;
      const g = M.duck.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(depth, t + 0.03);
      g.setTargetAtTime(1, t + 0.25, release / 3);
    }

    _mzSilenceVehicles() {
      try {
        if (this.updateEngine) this.updateEngine(0, false, 1, { dead: true });
        if (this.stopOtherEngines) this.stopOtherEngines();
        if (this.updateGatlingMotor) this.updateGatlingMotor(0, false, 0, false);
        if (this.updateTurretDrive) this.updateTurretDrive(0);
        if (this.updateElevationDrive) this.updateElevationDrive(0);
      } catch (e) { /* bỏ qua */ }
    }

    // =========================================================================
    // BỘ HẸN GIỜ: lên lịch nốt trước ~0,6 s theo đồng hồ âm thanh (chính xác tới mẫu, không lệch nhịp)
    // =========================================================================
    _mzStart(kind, t, fade) {
      const M = this._mz;
      if (M.song) this._mzStop(Math.min(1.5, fade));
      const def = SONGS[kind];
      const out = this.ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(def.gain, t + fade);
      out.connect(M.bus);
      M.song = { kind, def, out, bar: -1, phrase: -1, sec: 'intro', level: 0, L: SEC.intro, chord: def.chords[0], barIn: 0 };
      M.stepDur = 60 / def.bpm / 4;
      M.step = 0;
      M.next = t;
    }

    _mzStop(fade) {
      const M = this._mz;
      const S = M && M.song;
      if (!S) return;
      M.song = null;
      const t = this.ctx.currentTime;
      S.out.gain.cancelScheduledValues(t);
      S.out.gain.setValueAtTime(Math.max(0.0001, S.out.gain.value), t);
      S.out.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => { try { S.out.disconnect(); } catch (e) { /* đã ngắt */ } }, (fade + 4) * 1000);
    }

    _mzTick() {
      const M = this._mz;
      if (!M || !this.ctx) return;
      const now = this.ctx.currentTime;
      const dt = Math.min(1, Math.max(0, now - M.lastT));
      M.lastT = now;
      M.heat *= Math.exp(-dt / 14);
      const on = this.musicEnabled();
      if (on !== M.on) { M.on = on; M.bus.gain.setTargetAtTime(on ? 1 : 0, now, 0.1); }
      if (this.dramaTick) this.dramaTick(now);
      if (!M.song || !this.musicEnabled()) { if (M.song) M.next = now + 0.05; return; }
      const ahead = (typeof document !== 'undefined' && document.hidden) ? 1.5 : 0.6;
      if (M.next < now) M.next = now + 0.05;   // bị khựng (tab nền, máy bận): bắt nhịp lại, không dồn nốt
      let guard = 0;
      while (M.next < now + ahead && guard++ < 64) {
        if (M.song) this._mzStep(M.step, M.next);
        M.next += M.stepDur;
        M.step++;
      }
    }

    _mzBar(S, t) {
      const M = this._mz;
      const def = S.def;
      S.bar++;
      S.barIn = S.bar % def.chords.length;
      S.chord = def.chords[S.barIn];
      const barDur = M.stepDur * 16;
      let L;
      if (S.kind === 'lobby') {
        if (S.barIn === 0) {
          S.phrase++;
          const o = def.order;
          S.sec = S.phrase < o.length ? o[S.phrase] : o[def.loopFrom + (S.phrase - def.loopFrom) % (o.length - def.loopFrom)];
        }
        let sec = S.sec;
        if (M.mode === 'search' && (sec === 'intro' || sec === 'break')) sec = 'build';
        if (M.mode === 'countdown') sec = 'full';
        L = Object.assign({}, SEC[sec]);
        if (M.mode === 'search' || M.mode === 'countdown') L.hat = 1;
        // vào đoạn cao trào: một tiếng "ẦM" trầm mở màn
        if (sec === 'full' && S.prevSec !== 'full') this._mzImpact(S.out, t, 0.8);
        S.prevSec = sec;
      } else {
        // trận đánh: mức theo độ ác liệt; chỉ hạ mức ở đầu cặp ô nhịp để không chập chờn
        let want = 0;
        for (let i = 0; i < HEAT_UP.length; i++) if (M.heat >= HEAT_UP[i]) want = i + 1;
        if (M.final >= 1) want = Math.max(want, 2);
        if (M.final >= 2) want = 3;
        if (M.dead) want = 0;
        if (want > S.level || S.bar % 2 === 0) S.level = want;
        L = Object.assign({}, BATTLE[S.level]);
        if (M.final) L.clock = M.final;
      }
      S.L = L;
      const c = S.chord;
      if (L.pad) this._mzPad(S.out, t, c.t, barDur, L.pad, L.padLp);
      if (L.drone) this._mzDrone(S.out, t, c.b, barDur, L.drone);
      if (L.choir) this._mzChoir(S.out, t, c.t.map(m => m + 12), barDur, L.choir);
      // kèn đồng ngân dâng (nốt gốc + quãng năm) mỗi 2 ô nhịp
      if (L.swell && S.bar % 2 === 0) {
        this._mzBrass(S.out, t, c.b + 12, barDur * 1.9, L.swell, true);
        this._mzBrass(S.out, t, c.b + 19, barDur * 1.9, L.swell * 0.7, true);
      }
      // chũm chọe đầu câu
      if (L.crash && S.barIn === 0) this._mzCrash(S.out, t, L.crash);
    }

    _mzStep(i, t) {
      const M = this._mz;
      const S = M.song;
      const s = i % 16;
      if (s === 0) this._mzBar(S, t);
      const L = S.L, c = S.chord, sd = M.stepDur;
      // dây chạy dồn
      if (L.ost && (L.ost === 2 || s % 2 === 0)) {
        let off = OST[s];
        if (off === 'm') off = c.third;
        this._mzString(S.out, t, c.b + 12 + off, !!ACC[s] || (L.ost === 1 && s % 4 === 0), L.ost === 2 ? 1 : 0.8);
      }
      // trống
      if (L.drums) {
        const pat = L.drums < 1 ? (S.bar % 2 === 0 ? [[0, 0.7, 0.95]] : []) : DRUMS[L.drums];
        for (const p of pat) if (p[0] === s) this._mzTaiko(S.out, t, p[1] * (L.drums < 1 ? 0.6 : 1), p[2]);
      }
      if (L.snare) {
        if (L.snare >= 1) { for (const p of MARCH) if (p[0] === s) this._mzSnare(S.out, t, p[1]); }
        else if (s === 4 || s === 12) this._mzSnare(S.out, t, 0.7 * L.snare);
        if (L.snare >= 1 && S.barIn === S.def.chords.length - 1 && s >= 8) this._mzSnare(S.out, t, 0.3 + (s - 8) / 8 * 0.7);   // vê trống cuối câu
      }
      // kèn đồng nhấn hợp âm theo nhịp 3-3-2 (phách 1, 2½, 4)
      if (L.stab && (s === 0 || s === 6 || s === 12)) {
        for (const m of c.t) this._mzBrass(S.out, t, m, s === 12 ? 0.32 : 0.2, L.stab * (s === 0 ? 1 : 0.8), false, 0.012);
      }
      if (L.hat && s % 2 === 0) this._mzTick16(S.out, t, s % 4 === 0 ? 1 : 0.55);
      if (L.clock && (L.clock === 2 ? s % 2 === 0 : s % 4 === 0)) this._mzClock(S.out, t, s % 8 === 0 ? 1 : 0.7);
      if (S.roll && t < S.roll.end && t >= S.roll.start) this._mzSnare(S.out, t, 0.2 + 0.8 * (t - S.roll.start) / (S.roll.end - S.roll.start));
      // chủ đề kèn đồng
      if (L.mel && S.def.melody) {
        for (const n of S.def.melody) if (n[0] === S.barIn && n[1] === s) this._mzBrass(S.out, t, n[2], n[3] * sd, L.mel, false);
      }
      // piano trầm rải hợp âm
      if (L.piano) {
        if (s === 0) this._mzPiano(S.out, t, c.t[0] + 12, L.piano);
        else if (s === 6) this._mzPiano(S.out, t, c.t[1] + 12, L.piano * 0.7);
        else if (s === 10) this._mzPiano(S.out, t, c.t[2] + 12, L.piano * 0.6);
      }
    }

    // đếm ngược 3 giây: vê trống dồn + tiếng xoáy dâng
    _mzCountdown(t) {
      const M = this._mz;
      if (M.song) M.song.roll = { start: t, end: t + 3 };
      this._mzRiser(M.song ? M.song.out : M.bus, t, 3);
    }

    // =========================================================================
    // NHẠC CỤ
    // =========================================================================
    // dây nền: mỗi nốt 2 sóng răng cưa lệch nhẹ, chung một bộ lọc thấp; vào chậm, nhả dài để các ô nhịp nối liền
    _mzPad(dest, t, notes, dur, lv, lp) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lp * 0.6, t);
      f.frequency.linearRampToValueAtTime(lp, t + dur * 0.6);
      f.Q.value = 0.7;
      const g = ctx.createGain();
      const peak = 0.065 * lv;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.7);
      g.gain.setValueAtTime(peak, t + dur);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.45);
      f.connect(g);
      g.connect(dest);
      for (const m of notes) {
        for (const det of [-8, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = det + (Math.random() - 0.5) * 4;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 2.4);
        }
      }
    }

    // trầm nền: sin + răng cưa lọc thấp dưới nốt trầm
    _mzDrone(dest, t, m, dur, lv) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07 * lv, t + 0.25);
      g.gain.setValueAtTime(0.07 * lv, t + dur);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.3);
      g.connect(dest);
      const s = ctx.createOscillator();
      s.type = 'sine';
      s.frequency.value = mtof(m);
      s.connect(g);
      const r = ctx.createOscillator();
      r.type = 'sawtooth';
      r.frequency.value = mtof(m) * 1.003;
      const rf = ctx.createBiquadFilter();
      rf.type = 'lowpass';
      rf.frequency.value = 240;
      const rg = ctx.createGain();
      rg.gain.value = 0.35;
      r.connect(rf);
      rf.connect(rg);
      rg.connect(g);
      for (const o of [s, r]) { o.start(t); o.stop(t + dur + 1.6); }
    }

    // dây spiccato (nảy cung): răng cưa đôi qua lọc mở nhanh rồi đóng lại, kèm bè cello quãng tám dưới
    _mzString(dest, t, m, acc, lv) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1.6;
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(acc ? 3000 : 1900, t + 0.012);
      f.frequency.setTargetAtTime(650, t + 0.02, 0.06);
      const g = ctx.createGain();
      const peak = (acc ? 0.12 : 0.08) * lv;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.setTargetAtTime(0.0001, t + 0.03, 0.045);
      f.connect(g);
      g.connect(dest);
      const fr = mtof(m);
      for (const [mul, det] of [[1, -9], [1, 9], [0.5, 0]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr * mul;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + 0.32);
      }
    }

    // trống taiko lớn: mặt da "bùm" sin tụt cao độ + tiếng da đập + đuôi rền trầm
    _mzTaiko(dest, t, vel, p = 1) {
      this.tone(dest, t, { freq: 128 * p, freqEnd: 56 * p, sweep: 0.2, gain: 0.6 * vel, attack: 0.002, dur: 0.95 });
      this.tone(dest, t, { freq: 215 * p, freqEnd: 105 * p, sweep: 0.12, gain: 0.2 * vel, attack: 0.002, dur: 0.35 });
      this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 2600, gain: 0.4 * vel, attack: 0.001, dur: 0.07 });
      this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 320 * p, Q: 1.2, gain: 0.5 * vel, attack: 0.002, dur: 0.22 });
      this.burst(dest, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 170, gain: 0.22 * vel, attack: 0.004, dur: 0.6 });
    }

    // trống quân đội (snare): da căng + dây lò xo
    _mzSnare(dest, t, vel) {
      this.burst(dest, t, { filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.2 * vel, attack: 0.001, dur: 0.13 });
      this.burst(dest, t, { filter: 'highpass', freq: 5200, gain: 0.08 * vel, attack: 0.001, dur: 0.17 });
      this.tone(dest, t, { type: 'triangle', freq: 200, freqEnd: 165, sweep: 0.05, gain: 0.1 * vel, attack: 0.001, dur: 0.07 });
    }

    // tích tắc móc đơn (đang tìm trận)
    _mzTick16(dest, t, vel) {
      this.burst(dest, t, { filter: 'highpass', freq: 7000, gain: 0.07 * vel, attack: 0.001, dur: 0.03 });
    }

    // tiếng đồng hồ phút cuối: "cách" gỗ khô + kim loại nhỏ
    _mzClock(dest, t, vel) {
      this.burst(dest, t, { filter: 'bandpass', freq: 3200, Q: 6, gain: 0.22 * vel, attack: 0.0005, dur: 0.035 });
      this.tone(dest, t, { freq: 1850, gain: 0.03 * vel, attack: 0.001, dur: 0.05 });
    }

    // kèn đồng (horn + trombone): răng cưa ba lớp + quãng tám dưới, lọc mở dần ("bwaaa"), méo nhẹ, rung nhẹ khi ngân
    // atk: thời gian vào tiếng (kèn nhấn ngắn ~0,01 s)
    _mzBrass(dest, t, m, dur, lv, swell, atk) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1.3;
      const top = 900 + 2600 * lv;
      const a = swell ? dur * 0.5 : (atk || 0.06);
      f.frequency.setValueAtTime(260, t);
      f.frequency.linearRampToValueAtTime(top, t + (swell ? dur * 0.55 : a + 0.08));
      f.frequency.linearRampToValueAtTime(top * 0.6, t + Math.max(dur, a + 0.1));
      const ws = ctx.createWaveShaper();
      ws.curve = this.getShaper(2.0);
      const g = ctx.createGain();
      const peak = 0.075 * lv;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + Math.max(a, dur * 0.92));
      g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur * 0.92), dur < 0.4 ? 0.08 : 0.18);
      f.connect(ws);
      ws.connect(g);
      g.connect(dest);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vd = ctx.createGain();
      vd.gain.setValueAtTime(0, t);
      vd.gain.linearRampToValueAtTime(7, t + Math.min(dur, 0.9));
      vib.connect(vd);
      const fr = mtof(m);
      const oscs = [vib];
      for (const [mul, det] of [[1, -7], [1, 0], [1, 7], [0.5, 3]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr * mul;
        o.detune.value = det;
        vd.connect(o.detune);
        o.connect(f);
        oscs.push(o);
      }
      for (const o of oscs) { o.start(t); o.stop(t + dur + 1); }
    }

    // hợp xướng "aah": răng cưa qua 3 bộ lọc formant của nguyên âm "a"
    _mzChoir(dest, t, notes, dur, lv) {
      const ctx = this.ctx;
      const sum = ctx.createGain();
      sum.gain.value = 1;
      const g = ctx.createGain();
      const peak = 0.2 * lv;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 1.0);
      g.gain.setValueAtTime(peak, t + dur);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.5);
      g.connect(dest);
      for (const [fq, q, a] of [[800, 5, 1], [1150, 7, 0.55], [2900, 9, 0.22]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fq;
        bp.Q.value = q;
        const ag = ctx.createGain();
        ag.gain.value = a;
        sum.connect(bp);
        bp.connect(ag);
        ag.connect(g);
      }
      for (const m of notes) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = det;
          o.connect(sum);
          o.start(t);
          o.stop(t + dur + 2.6);
        }
      }
    }

    // piano trầm: họa âm sin tắt dần, búa gõ nhẹ
    _mzPiano(dest, t, m, lv) {
      const f = mtof(m);
      this.tone(dest, t, { freq: f, gain: 0.11 * lv, attack: 0.003, dur: 3.2 });
      this.tone(dest, t, { freq: f * 2.003, gain: 0.035 * lv, attack: 0.003, dur: 1.4 });
      this.tone(dest, t, { type: 'triangle', freq: f * 3.01, gain: 0.012 * lv, attack: 0.002, dur: 0.5 });
      this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, Q: 1, gain: 0.02 * lv, attack: 0.001, dur: 0.02 });
    }

    // chũm chọe lớn: nhiễu cao tần ngân dài + ánh kim
    _mzCrash(dest, t, k) {
      this.burst(dest, t, { filter: 'highpass', freq: 3800, gain: 0.16 * k, attack: 0.003, dur: 2.6 });
      this.burst(dest, t, { filter: 'bandpass', freq: 6500, Q: 1.5, gain: 0.08 * k, attack: 0.002, dur: 1.6 });
    }

    // tiếng "ẦM" mở đoạn: trống lớn + trầm sâu
    _mzImpact(dest, t, k) {
      this._mzTaiko(dest, t, 1.2 * k, 0.85);
      this.tone(dest, t, { freq: 70, freqEnd: 44, sweep: 1.2, gain: 0.3 * k, attack: 0.004, dur: 2.0 });
      this.burst(dest, t, { filter: 'highpass', freq: 4500, gain: 0.09 * k, attack: 0.002, dur: 1.4 });   // chũm chọe xa
    }

    // tiếng xoáy dâng (riser): nhiễu dải hẹp quét lên + chũm chọe ngược, to dần tới thời điểm kết thúc
    _mzRiser(dest, t, dur) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(t, Math.random());
      src.stop(t + dur + 0.1);
      // cao độ dâng (răng cưa quét lên một quãng tám rưỡi)
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(50), t);
      o.frequency.exponentialRampToValueAtTime(mtof(68), t + dur);
      const of = ctx.createBiquadFilter();
      of.type = 'lowpass';
      of.frequency.setValueAtTime(400, t);
      of.frequency.exponentialRampToValueAtTime(3000, t + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.06, t + dur);
      og.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
      o.connect(of);
      of.connect(og);
      og.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    // =========================================================================
    // ĐOẠN KẾT TRẬN
    // =========================================================================
    playMusicStinger(kind, t0) {
      const M = this.ensureMusic();
      if (!M || !this.musicEnabled()) return;
      const t = t0 === undefined ? this.ctx.currentTime + 0.05 : t0;
      const out = this.ctx.createGain();
      out.gain.value = 0.42;
      out.connect(M.bus);
      setTimeout(() => { try { out.disconnect(); } catch (e) { /* đã ngắt */ } }, 20000);
      const D = ch(38, [50, 54, 57], 4), Bbmaj = ch(34, [50, 53, 58], 4), Cmaj = ch(36, [48, 52, 55], 4);
      if (kind === 'victory') {
        // VI - VII - I (Si giáng - Đô - Rê trưởng): cái kết anh hùng, kèn đồng + hợp xướng + trống lớn
        const b = 1.25;
        const seq = [[Bbmaj, 0, b, 62], [Cmaj, b, b, 64], [D, 2 * b, 4.5, 66]];
        for (const [c, d, len, top] of seq) {
          const tt = t + d;
          this._mzTaiko(out, tt, 1, 1);
          this._mzPad(out, tt, c.t, len, 1, 2600);
          this._mzDrone(out, tt, c.b, len, 1);
          this._mzChoir(out, tt, c.t.map(m => m + 12), len, 0.9);
          for (const m of c.t) this._mzBrass(out, tt, m, len, 0.9, false);
          this._mzBrass(out, tt, top + 12, len, 0.8, false);
        }
        this._mzImpact(out, t + 2 * b, 1.1);
        this._mzTaiko(out, t + 2 * b + 0.32, 0.7, 1.2);
        this._mzTaiko(out, t + 2 * b + 0.48, 0.8, 1.2);
      } else if (kind === 'defeat') {
        // Rê thứ - Si giáng / Rê - Son thứ / Rê - Rê thứ: chậm, trầm, dây + piano
        const b = 2.4;
        const seq = [[Dm, 0, b], [ch(38, [50, 53, 58], 4), b, b], [ch(38, [50, 55, 58], 3), 2 * b, b], [Dm, 3 * b, 5]];
        this._mzTaiko(out, t, 0.9, 0.85);
        for (const [c, d, len] of seq) {
          this._mzPad(out, t + d, c.t, len, 0.9, 900);
          this._mzDrone(out, t + d, c.b, len, 0.9);
          this._mzPiano(out, t + d, c.t[2] + 12, 0.9);
          this._mzPiano(out, t + d + b / 2, c.t[1] + 12, 0.6);
        }
        this._mzChoir(out, t + 3 * b, Dm.t.map(m => m + 12), 5, 0.6);
      } else {
        // hòa: Rê treo (sus4) rồi Rê quãng năm rỗng — không thắng, không thua
        this._mzTaiko(out, t, 0.9, 1);
        this._mzPad(out, t, [50, 55, 57], 2.6, 0.9, 1600);
        this._mzBrass(out, t, 55, 2.6, 0.6, true);
        this._mzPad(out, t + 2.6, [50, 57, 62], 4, 0.9, 1600);
        this._mzDrone(out, t, 38, 6.6, 0.9);
        this._mzTaiko(out, t + 2.6, 0.8, 1);
      }
    }
  });

  // nhạc chạy ngay khi âm thanh được bật (init cần thao tác đầu tiên của người chơi do trình duyệt chặn tự phát)
  const P = SoundEngine.prototype;
  const baseInit = P.init;
  P.init = function () {
    const r = baseInit.apply(this, arguments);
    if (this._musicWant && this.ctx) { const w = this._musicWant; this._musicWant = null; this.setMusicMode(w); }
    return r;
  };
  // Đã có nhạc thì đoạn kết dàn nhạc thay cho kèn bíp chiến thắng cũ (tránh hai giai điệu chồng nhau)
  const baseFanfare = P.playVictoryFanfare;
  if (baseFanfare) {
    P.playVictoryFanfare = function () {
      if (this._mz && this.musicEnabled()) return;
      return baseFanfare.apply(this, arguments);
    };
  }
  if (typeof window !== 'undefined') {
    const unlock = () => {
      const se = window.soundEngine;
      if (!se || !se._musicWant) return;
      try { se.init(); se.resume(); } catch (e) { /* bỏ qua */ }
      if (se.ctx) { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }
})();
