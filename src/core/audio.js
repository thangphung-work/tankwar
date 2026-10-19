/**
 * Hệ Thống Âm Thanh Chiến Trường Chân Thực (Battlefield Acoustic Engine v2)
 * Tổng hợp thủ tục 100% bằng Web Audio API — không dùng file âm thanh.
 *
 * Nguyên tắc chân thực:
 * - Không gian: hồi âm ngoài trời bằng ConvolverNode với impulse response sinh thủ tục
 *   (phản xạ sớm từ mặt đất/địa hình + đuôi vang tắt dần, mất âm cao theo thời gian)
 * - Khoảng cách: nhỏ dần, mất âm cao do không khí hấp thụ, càng xa càng "ướt" (nghe vọng nhiều hơn),
 *   trễ theo tốc độ âm thanh với nguồn ngoài tầm nhìn camera; âm thanh nổi trái/phải theo vị trí
 * - Tiếng súng/pháo/nổ: xung nén đầu nòng (N-wave) + sức ép nổ từ nhiễu băng rộng có méo bão hòa
 *   + sóng trầm chấn động + rền cuộn — không dùng sóng tuần hoàn quét tần số kiểu "pew pew"
 * - Kim loại (nạp đạn, trúng giáp, vỏ đạn, khóa nòng): tổng hợp cộng hưởng nhiều mode bất hòa âm
 * - Động cơ diesel nổ theo nhịp xi-lanh + turbo; xích sắt lách cách theo tốc độ; lốp xe trinh sát
 * - Pháo 6 nòng xoay: lớp âm liên tục mô-tơ điện + cơ cấu nòng theo tốc độ quay, xì hơi khi quá nhiệt
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isMapMuted = false;

    this.masterGain = null;
    this.compressor = null;
    this.limiter = null;
    this.reverb = null;
    this.weaponBus = null;
    this.vehicleBus = null;
    this.uiBus = null;

    this.noiseBuffer = null;
    this.pinkNoiseBuffer = null;
    this.brownNoiseBuffer = null;
    this.crackleBuffer = null;
    this.clickBuffer = null;
    this.shaperCache = {};

    this.engine = null;
    this.gatlingMotor = null;

    this.lastGatlingImpactTime = 0;
    this.lastRemoteGatlingTime = 0;
    this.lastWhistleTime = 0;

    this.isInitialized = false;
  }

  // ===========================================================================
  // KHỞI TẠO & ĐỊNH TUYẾN
  // ===========================================================================
  init() {
    if (this.isInitialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = this.ctx = new AudioContextClass();
    const t = ctx.currentTime;

    // Bus -> master -> nén keo (glue) -> giới hạn đỉnh chống vỡ tiếng -> loa
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9 * (this.userMaster === undefined ? 1 : this.userMaster), t);

    this.compressor = ctx.createDynamicsCompressor();
    // Nén nhẹ để giữ dải động: tiếng nổ lớn vẫn to hơn hẳn tiếng nhỏ, xung đầu lọt qua trước khi nén (attack 10 ms).
    // Nén mạnh (ngưỡng thấp, tỉ lệ cao) làm mọi tiếng to như nhau và tiếng nổ mất cú đấm
    this.compressor.threshold.setValueAtTime(-12, t);
    this.compressor.knee.setValueAtTime(6, t);
    this.compressor.ratio.setValueAtTime(2.5, t);
    this.compressor.attack.setValueAtTime(0.01, t);
    this.compressor.release.setValueAtTime(0.3, t);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-3, t);
    this.limiter.knee.setValueAtTime(0, t);
    this.limiter.ratio.setValueAtTime(20, t);
    this.limiter.attack.setValueAtTime(0.001, t);
    this.limiter.release.setValueAtTime(0.1, t);

    // "Ù tai" (shellShock): trộn giữa nhánh gốc và nhánh qua bộ lọc thông thấp CỐ ĐỊNH ~900 Hz.
    // Chỉ tự động hóa độ lớn 2 nhánh — không quét tần số bộ lọc (quét mạnh tần số biquad có thể làm bộ lọc
    // tự dao động thành tiếng gầm kéo dài)
    this.muffleDry = ctx.createGain();
    this.muffleDry.gain.setValueAtTime(1, t);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 900;
    this.muffle.Q.value = 0.5;
    this.muffleWet = ctx.createGain();
    this.muffleWet.gain.setValueAtTime(0, t);

    this.masterGain.connect(this.muffleDry);
    this.muffleDry.connect(this.compressor);
    this.masterGain.connect(this.muffle);
    this.muffle.connect(this.muffleWet);
    this.muffleWet.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.buildNoiseBuffers();

    // Hồi âm chiến trường ngoài trời
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.buildOutdoorImpulse(3.0);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.setValueAtTime(0.6, t);
    this.reverb.connect(reverbReturn);
    reverbReturn.connect(this.masterGain);

    this.weaponBus = ctx.createGain();
    // Cắt siêu trầm dưới ~32 Hz (loa / tai nghe không phát được, chỉ ăn hết headroom và gây ù),
    // rồi nhấn dải "BÙM" 60-90 Hz — vùng nghe thấy và cảm thấy được "đấm vào ngực"
    const weaponHp = ctx.createBiquadFilter();
    weaponHp.type = 'highpass';
    weaponHp.frequency.value = 32;
    weaponHp.Q.value = 0.7;
    const weaponHp2 = ctx.createBiquadFilter();
    weaponHp2.type = 'highpass';
    weaponHp2.frequency.value = 28;
    weaponHp2.Q.value = 0.7;
    const weaponShelf = ctx.createBiquadFilter();
    weaponShelf.type = 'peaking';
    weaponShelf.frequency.value = 75;
    weaponShelf.Q.value = 0.8;
    weaponShelf.gain.value = 4;
    const weaponClip = ctx.createWaveShaper();
    weaponClip.curve = this.getShaper(1.3);
    weaponClip.oversample = '2x';
    const weaponOut = ctx.createGain();
    weaponOut.gain.value = 0.85;
    this.weaponBus.connect(weaponHp);
    weaponHp.connect(weaponHp2);
    weaponHp2.connect(weaponShelf);
    weaponShelf.connect(weaponClip);
    weaponClip.connect(weaponOut);
    weaponOut.connect(this.masterGain);
    this.vehicleBus = ctx.createGain();
    this.vehicleDuck = ctx.createGain();
    // âm lượng tiếng động cơ / xích do người chơi chỉnh (Cài đặt)
    this.vehicleUser = ctx.createGain();
    this.vehicleUser.gain.setValueAtTime(this.userEngine === undefined ? 1 : this.userEngine, t);
    this.vehicleBus.connect(this.vehicleUser);
    this.vehicleUser.connect(this.vehicleDuck);
    this.vehicleDuck.connect(this.masterGain);
    this.uiBus = ctx.createGain();
    this.uiBus.gain.setValueAtTime(0.75, t);
    this.uiBus.connect(this.masterGain);

    this.setupEngineAndTrackSound();
    this.loadSampleOverrides();
    this.isInitialized = true;
  }

  // ===========================================================================
  // FILE ÂM THANH GHI ÂM THẬT (TÙY CHỌN)
  // Đặt file vào assets/sfx/ và khai báo trong assets/sfx/manifest.json, ví dụ:
  //   { "cannon_fire": "cannon.ogg", "explosion": "boom.ogg", "gatling_shot": "30mm.ogg" }
  // Khóa hỗ trợ: cannon_fire, artillery_fire, explosion, gatling_shot, bullet_impact, missile_launch.
  // Khóa nào có file sẽ thay phần tổng hợp lõi; khoảng cách, hướng, hồi âm vẫn áp dụng như thường.
  // ===========================================================================
  loadSampleOverrides() {
    this.samples = {};
    if (typeof fetch !== 'function' || !this.ctx) return;
    fetch('assets/sfx/manifest.json')
      .then(r => (r.ok ? r.json() : null))
      .then(list => {
        if (!list) return;
        Object.keys(list).forEach(key => {
          fetch('assets/sfx/' + list[key])
            .then(r => (r.ok ? r.arrayBuffer() : null))
            .then(buf => (buf ? this.ctx.decodeAudioData(buf) : null))
            .then(audio => { if (audio) this.samples[key] = audio; })
            .catch(() => {});
        });
      })
      .catch(() => {});
  }

  playSample(key, dest, t, { gain = 1, rate = 1, vary = 0.05 } = {}) {
    const buf = this.samples && this.samples[key];
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * vary);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest);
    src.start(t);
    return true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Mở bản đồ chiến thuật: tắt tiếng máy nổ / mô-tơ, giảm tiếng chiến trường
  // Âm lượng người chơi chọn (0..1): tổng và tiếng động cơ xe. Gọi được trước khi bật âm thanh.
  setUserVolume(master, engine) {
    if (typeof master === 'number') this.userMaster = Math.max(0, Math.min(1, master));
    if (typeof engine === 'number') this.userEngine = Math.max(0, Math.min(1, engine));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(0.9 * (this.userMaster === undefined ? 1 : this.userMaster), t, 0.05);
    if (this.vehicleUser) this.vehicleUser.gain.setTargetAtTime(this.userEngine === undefined ? 1 : this.userEngine, t, 0.05);
  }

  setMapMuted(muted) {
    this.isMapMuted = !!muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.vehicleBus) this.vehicleBus.gain.setTargetAtTime(muted ? 0 : 1, t, 0.05);
    if (this.weaponBus) this.weaponBus.gain.setTargetAtTime(muted ? 0.35 : 1, t, 0.05);
  }

  ready() {
    if (!this.ctx || this.isMuted) return false;
    this.resume();
    return true;
  }

  // ===========================================================================
  // BỘ ĐỆM NHIỄU & IMPULSE RESPONSE
  // ===========================================================================
  buildNoiseBuffers() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 3.0);

    this.noiseBuffer = ctx.createBuffer(1, len, sr);
    const white = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) white[i] = Math.random() * 2 - 1;

    this.pinkNoiseBuffer = ctx.createBuffer(1, len, sr);
    const pink = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      pink[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }

    this.brownNoiseBuffer = ctx.createBuffer(1, len, sr);
    const brown = this.brownNoiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      brown[i] = last * 3.5;
    }

    // Nhiễu lách tách thưa (mảnh vụn, đá sỏi, lá cây, kim loại rơi)
    this.crackleBuffer = ctx.createBuffer(1, len, sr);
    const cr = this.crackleBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0016) {
        const amp = (Math.random() * 0.8 + 0.2) * (Math.random() < 0.5 ? -1 : 1);
        const n = 8 + Math.floor(Math.random() * 40);
        for (let k = 0; k < n && i + k < len; k++) cr[i + k] += amp * Math.exp(-k / (n * 0.3)) * (Math.random() * 2 - 1);
      }
    }

    // Xung N-wave của sóng xung kích siêu thanh (tiếng "chát" đầu nòng / vụ nổ)
    const clen = Math.floor(sr * 0.012);
    this.clickBuffer = ctx.createBuffer(1, clen, sr);
    const ck = this.clickBuffer.getChannelData(0);
    const nw = Math.floor(sr * 0.0018);
    for (let i = 0; i < clen; i++) {
      let v = 0;
      if (i < nw) v = 1 - 2 * (i / nw);
      v += (Math.random() * 2 - 1) * 0.35 * Math.exp(-i / (sr * 0.002));
      ck[i] = v;
    }
  }

  // Impulse response ngoài trời: phản xạ sớm (mặt đất, địa hình gần) + đuôi vang mất dần âm cao
  buildOutdoorImpulse(seconds) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        // Đuôi vang khuếch tán: bắt đầu sau ~25ms, tắt dần
        const env = tt < 0.025 ? 0 : Math.exp(-(tt - 0.025) / 0.62) * Math.min(1, (tt - 0.025) / 0.04);
        const w = Math.random() * 2 - 1;
        // Lọc thông thấp tăng dần theo thời gian: đuôi vang càng lâu càng trầm
        const k = Math.max(0.02, 0.55 * Math.exp(-tt / 0.9));
        lp += (w - lp) * k;
        d[i] = lp * env * 0.55;
      }
      // Phản xạ sớm: mặt đất (rất sớm), gò đồi, công trình, rìa thung lũng
      const taps = [[0.011, 0.5], [0.043, 0.32], [0.088, 0.24], [0.17, 0.2], [0.31, 0.16], [0.52, 0.12]];
      for (const [time, amp] of taps) {
        const at = Math.floor((time + (ch ? 0.0037 : 0) + Math.random() * 0.004) * sr);
        for (let k = 0; k < 220 && at + k < len; k++) {
          d[at + k] += amp * Math.exp(-k / 40) * (Math.random() * 2 - 1);
        }
      }
    }
    return ir;
  }

  getShaper(drive) {
    const key = Math.round(drive * 10);
    if (this.shaperCache[key]) return this.shaperCache[key];
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.shaperCache[key] = curve;
    return curve;
  }

  // ===========================================================================
  // KHỐI DỰNG ÂM THANH
  // ===========================================================================
  // Mô hình không gian theo khoảng cách (đơn vị game, ~8 đơn vị = 1 mét)
  spatial(distance = 0, pos = null) {
    const d = Math.max(0, distance || 0);
    const m = d / 8;
    const gain = 1 / (1 + m / 45);
    // Không khí + mặt đất hấp thụ âm cao (theo suy hao khí quyển thật: 8 kHz mất ~3 dB sau ~30 m, 4 kHz ~100 m,
    // 2 kHz ~300 m): ~100 m còn dưới ~4 kHz, ~300 m ~1.5 kHz, ~600 m chỉ còn tiếng "ục" trầm và rền
    const lowpass = Math.max(380, Math.min(18000, 4200 * Math.pow(100 / Math.max(1, m), 0.9)));
    const wet = Math.min(0.9, 0.12 + m / 240);
    // Nguồn trong tầm nhìn camera phát ngay để khớp hình; ngoài màn hình mới trễ theo tốc độ âm thanh
    const delay = Math.min(1.0, Math.max(0, d - 600) / 8 / 343);
    let pan = 0;
    const me = window.game && window.game.player;
    if (pos && me) {
      const dx = pos.x - me.x, dz = pos.z - me.z;
      pan = Math.max(-0.85, Math.min(0.85, dx / (Math.abs(dx) + Math.abs(dz) + 60)));
    }
    return { gain, lowpass, wet, delay, pan };
  }

  // Kênh phát cho một sự kiện: gain -> lọc không khí -> pan -> bus, kèm nhánh gửi hồi âm
  voice({ bus = null, gain = 1, pan = 0, lowpass = 20000, wet = 0.2 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = gain;
    let node = input;
    if (lowpass < 19000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      lp.Q.value = 0.5;
      node.connect(lp);
      node = lp;
    }
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(bus || this.weaponBus);
    if (wet > 0 && this.reverb) {
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(this.reverb);
    }
    return input;
  }

  // Hai nhánh trái/phải: phát 2 cụm nhiễu khác nhau vào L và R -> tiếng nổ rộng, to như ngoài trời
  stereoSpread(dest, width = 0.6) {
    const ctx = this.ctx;
    const mk = (pan) => {
      const g = ctx.createGain();
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(dest);
      } else {
        g.connect(dest);
      }
      return g;
    };
    return { L: mk(-width), R: mk(width) };
  }

  // Ù tai sau chấn động mạnh: mọi âm thanh bị bóp nghẹt (mất âm cao) rồi trong dần lại, kèm tiếng ù cao tần.
  // amount 0..1 (1 = đạn lớn nổ ngay trên xe mình)
  shellShock(amount = 0.6) {
    if (!this.ready() || !this.muffle) return;
    const a = Math.max(0, Math.min(1, amount));
    if (a < 0.05) return;
    const t = this.ctx.currentTime;
    // Đang ù nặng hơn thì không ghi đè bằng cú nhẹ hơn
    if (this._shockUntil && t < this._shockUntil && a < (this._shockLevel || 0)) return;
    this._shockLevel = a;
    const hold = 0.25 + a * 0.9, rec = 0.45 + a * 0.9;
    this._shockUntil = t + hold + rec;
    // nhánh gốc tụt mạnh, nhánh nghẹt (mất âm cao) chiếm chỗ; sau "hold" thì trong dần lại
    const dry = this.muffleDry.gain, wet = this.muffleWet.gain;
    dry.cancelScheduledValues(t);
    wet.cancelScheduledValues(t);
    dry.setValueAtTime(dry.value, t);
    wet.setValueAtTime(wet.value, t);
    dry.linearRampToValueAtTime(Math.max(0.04, 1 - 0.95 * a), t + 0.03);
    wet.linearRampToValueAtTime(Math.min(1, 0.4 + 0.6 * a), t + 0.03);
    dry.setTargetAtTime(1, t + hold, rec);
    wet.setTargetAtTime(0, t + hold, rec);
    // Tiếng ù trong tai: đi thẳng vào bộ nén, không bị bộ lọc ù bóp lại
    if (a > 0.3 && this.compressor) {
      const g = this.ctx.createGain();
      g.gain.value = 1;
      g.connect(this.compressor);
      const fr = 3600 + Math.random() * 900;
      this.tone(g, t + 0.05, { freq: fr, gain: 0.022 * a, attack: 0.2, hold: 0.3 + a * 0.9, dur: 1.6 + a * 1.8 });
      this.tone(g, t + 0.05, { freq: fr * 1.012, gain: 0.012 * a, attack: 0.25, hold: 0.2 + a * 0.7, dur: 1.4 + a * 1.4 });
    }
    this.duck(0.15 + (1 - a) * 0.4, 1.2 + a);
  }

  // Dìm tiếng xe trong chốc lát khi có tiếng nổ lớn để tiếng nổ nghe to và "đã" hơn
  duck(depth = 0.4, release = 0.9) {
    if (!this.vehicleDuck) return;
    const g = this.vehicleDuck.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(1, g.value), t);
    g.linearRampToValueAtTime(depth, t + 0.02);
    g.setTargetAtTime(1, t + 0.08, release / 3);
  }

  /**
   * Cụm nhiễu có lọc + đường bao: o = { buffer, filter, freq, freqEnd, sweep, Q, filter2, freq2, Q2,
   * drive, gain, attack, dur, rate }
   */
  burst(dest, t, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.buffer || this.noiseBuffer;
    if (o.rate) src.playbackRate.value = o.rate;
    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.sweep || o.dur));
      f.Q.value = o.Q !== undefined ? o.Q : 0.7;
      node.connect(f);
      node = f;
    }
    if (o.filter2) {
      const f2 = ctx.createBiquadFilter();
      f2.type = o.filter2;
      f2.frequency.setValueAtTime(o.freq2, t);
      if (o.freq2End) f2.frequency.exponentialRampToValueAtTime(o.freq2End, t + (o.sweep || o.dur));
      f2.Q.value = o.Q2 !== undefined ? o.Q2 : 0.7;
      node.connect(f2);
      node = f2;
    }
    if (o.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.getShaper(o.drive);
      node.connect(ws);
      node = ws;
    }
    const g = ctx.createGain();
    const peak = o.gain !== undefined ? o.gain : 1;
    const a = o.attack !== undefined ? o.attack : 0.001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0.0001, t + a, o.dur / 4.5);
    node.connect(g);
    g.connect(dest);
    const blen = src.buffer.duration;
    const total = a + o.dur + 0.05;
    const off = o.offset !== undefined ? o.offset : (blen > total + 0.1 ? Math.random() * (blen - total - 0.1) : 0);
    src.start(t, off);
    src.stop(t + total);
  }

  // Âm tần số (sóng trầm chấn động, tiếng rít)
  tone(dest, t, o) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.sweep || o.dur));
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato;
      const depth = ctx.createGain();
      depth.gain.value = o.vibratoDepth || o.freq * 0.03;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + (o.attack || 0.002) + o.dur + 0.05);
    }
    let node = osc;
    if (o.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.getShaper(o.drive);
      node.connect(ws);
      node = ws;
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterFreq;
      f.Q.value = o.Q !== undefined ? o.Q : 0.7;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const a = o.attack !== undefined ? o.attack : 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + a);
    if (o.hold) g.gain.setValueAtTime(o.gain, t + a + o.hold);
    g.gain.setTargetAtTime(0.0001, t + a + (o.hold || 0), o.dur / 4.5);
    node.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + a + (o.hold || 0) + o.dur + 0.05);
  }

  // Xung nén N-wave (đầu nòng / vụ nổ) qua lọc và méo bão hòa
  snap(dest, t, gain = 1, lowpass = 9000, drive = 2.5) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.clickBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const ws = ctx.createWaveShaper();
    ws.curve = this.getShaper(drive);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(ws);
    ws.connect(g);
    g.connect(dest);
    src.start(t);
  }

  /**
   * Va chạm kim loại theo mô hình cộng hưởng nhiều mode (thanh/tấm thép):
   * các họa âm bất hòa tắt dần với tốc độ khác nhau + tiếng gõ nhiễu đầu.
   */
  metal(dest, t, { f0 = 400, ratios = [1, 2.76, 5.4, 8.93], decay = 0.4, gain = 0.3, click = 0.6 } = {}) {
    ratios.forEach((r, i) => {
      const amp = gain / (1 + i * 0.9);
      const dec = Math.min(0.35, decay / (1 + i * 0.7) * 0.55);
      this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0 * r * (1 + (Math.random() - 0.5) * 0.04), Q: 5 + i * 2.5, drive: 1.5, gain: amp * 2.6, attack: 0.001, dur: dec });
    });
    if (click > 0) {
      this.burst(dest, t, { filter: 'bandpass', freq: Math.min(9000, f0 * 6), Q: 0.8, gain: gain * click, dur: 0.012 });
    }
  }

  // ===========================================================================
  // 1. KHAI HỎA PHÁO CHÍNH (120mm xe tăng / 155mm pháo tự hành)
  // ===========================================================================
  playCannonFire(tankType = 'ALL_ROUNDER', ammoType = 'NORMAL', distance = 0, pos = null) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.45, delay: 0, pan: 0 };
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    const arty = tankType === 'ARTILLERY';
    const s = arty ? 1.7 : 1.15;
    // Mức đưa vào thấp có chủ đích (xem playExplosionAtDistance): giữ cú đấm, không bị ép bẹt ở đầu ra
    const out = this.voice({ gain: sp.gain * 0.2, lowpass: sp.lowpass, wet: Math.max(0.45, sp.wet), pan: sp.pan });

    if (!this.playSample(arty ? 'artillery_fire' : 'cannon_fire', out, t, { gain: 1.3 })) {
      // Pháo khai hỏa: xung nén đầu nòng cực gắt (đỉnh ngay ms đầu) -> khí thuốc phóng phụt "ĐÙNG" trầm dày
      // -> rền cuộn. Pháo 155 có hãm nòng: sóng nổ hắt ngang dữ dội, thân tiếng dài và nặng hơn
      const W = this.stereoSpread(out, arty ? 0.7 : 0.5);
      this.snap(out, t, 1.5 * s, 8000, 5);
      this.burst(out, t, { filter: 'bandpass', freq: arty ? 1900 : 2600, Q: 0.6, drive: 3, gain: 0.9 * s, attack: 0.0004, dur: 0.045 });
      // Sức ép nổ thuốc phóng (2 kênh lệch nhau)
      for (const ch of [W.L, W.R]) {
        this.burst(ch, t, { filter: 'lowpass', freq: 6500, freqEnd: 300, sweep: 0.09, drive: 3, gain: 1.1 * s, attack: 0.0005, dur: arty ? 0.3 : 0.22 });
        this.burst(ch, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 1600, freqEnd: 100, sweep: 0.5, drive: 2.5, gain: 1.5 * s, attack: 0.001, dur: arty ? 0.7 : 0.55 });
      }
      // Cú đấm ngực 50-160 Hz
      this.tone(out, t, { freq: arty ? 140 : 165, freqEnd: arty ? 50 : 58, sweep: 0.13, drive: 3, gain: 1.4 * s, attack: 0.0008, dur: arty ? 0.38 : 0.26 });
      this.tone(out, t, { freq: arty ? 72 : 85, freqEnd: arty ? 40 : 45, sweep: 0.35, drive: 2, gain: 1.1 * s, attack: 0.002, dur: arty ? 0.6 : 0.4 });
      // Khí thuốc phóng xé không khí: dải trung "rầm" + lớp trầm và phản xạ mặt đất trễ ~28 ms
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 700 : 900, Q: 0.6, drive: 2, gain: 3.6 * s, attack: 0.001, dur: arty ? 0.4 : 0.3 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2.5, gain: 1.0 * s, attack: 0.002, dur: arty ? 0.8 : 0.5 });
      this.burst(out, t + 0.028, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 360, drive: 2, gain: 0.5 * s, attack: 0.003, dur: arty ? 0.7 : 0.45 });
      // bụi đất trước đầu nòng bị thổi tung, xích / thân xe rung lách cách
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2000, Q: 0.5, gain: 3.0 * s, attack: 0.004, dur: 0.4 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, Q: 0.6, drive: 1.5, gain: 4.0 * s, attack: 0.001, dur: 0.18 });
    }
    if (!remote) {
      this.duck(arty ? 0.25 : 0.4, arty ? 1.4 : 0.9);
      const cv = this.voice({ bus: this.vehicleBus, gain: 0.7, wet: 0.05 });
      if (arty) {
        // Pháo 155: khóa nòng tự mở, quạt hút khói thuốc phóng xì ra
        this.burst(cv, t + 0.9, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, freqEnd: 1100, sweep: 0.25, Q: 2, gain: 0.12, attack: 0.01, dur: 0.25 });
        this.burst(cv, t + 1.05, { filter: 'highpass', freq: 2500, gain: 0.06, attack: 0.05, dur: 0.8 });
      } else {
        // Pháo tăng: khóa nòng mở, đế vỏ đạn cháy dở bị đẩy ra rơi "coong" xuống túi hứng vỏ trong tháp
        this.burst(cv, t + 0.75, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: 0.25, attack: 0.002, dur: 0.08 });
        this.metal(cv, t + 0.95, { f0: 520 + Math.random() * 80, ratios: [1, 2.3, 4.1], decay: 0.35, gain: 0.07, click: 0.5 });
        this.burst(cv, t + 0.95, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.15, attack: 0.002, dur: 0.06 });
      }
    }
    // Rền sấm cuộn dài + tiếng dội từ đồi núi, công trình xung quanh
    const roll = this.voice({ gain: sp.gain * 0.9, lowpass: Math.min(sp.lowpass, 600), wet: 0.9, pan: sp.pan * 0.5 });
    this.burst(roll, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 280, gain: 0.35 * s, attack: 0.15, dur: arty ? 3.0 : 1.8 });
    this.playTerrainEchoes(t, s * 0.55 * Math.sqrt(sp.gain), sp.lowpass);
  }

  // Tiếng nổ dội lại từ địa hình: các phản xạ rời rạc trái/phải, càng muộn càng nhỏ và trầm
  playTerrainEchoes(t, k = 1, lowpass = 20000) {
    const taps = [[0.16, 0.5, -0.6], [0.38, 0.38, 0.7], [0.74, 0.26, -0.3], [1.25, 0.16, 0.5]];
    for (const [d, g, pan] of taps) {
      const v = this.voice({ gain: g * k, lowpass: Math.min(1100, lowpass), wet: 0.85, pan: pan + (Math.random() - 0.5) * 0.3 });
      const tt = t + d + Math.random() * 0.08;
      this.burst(v, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, gain: 0.9, attack: 0.008, dur: 0.5 });
      this.burst(v, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, Q: 0.7, gain: 0.6, attack: 0.004, dur: 0.3 });
    }
  }

  // ===========================================================================
  // 2. VỤ NỔ ĐẠN PHÁO / TÊN LỬA / ĐẠN CHÙM
  // ===========================================================================
  // opts.heavy: đạn pháo 155mm (~6.6 kg thuốc nổ, gấp ~2.5 lần đạn HE 120mm của xe tăng) -> nổ to, trầm, dài hơn hẳn
  playExplosionAtDistance(distance, hitType = 'GROUND', ammoType = 'NORMAL', pos = null, opts = {}) {
    if (!this.ready()) return;
    if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY') {
      this.playGatlingImpact(distance, hitType, ammoType === 'INCENDIARY', pos, ammoType === 'SCOUT_BULLET');
      return;
    }
    // Đạn xuyên động năng không có thuốc nổ: không có tiếng nổ, chỉ có tiếng va chạm
    if (ammoType === 'AP') { this.playKineticImpact(distance, hitType, pos); return; }

    const sp = this.spatial(distance, pos);
    const t = this.ctx.currentTime + sp.delay;

    // đạn tiêu chuẩn 120mm (nổ phá đa năng) mang ~2 kg thuốc nổ -> không nhỏ hơn tiếng khai hỏa quá nhiều
    let k = ammoType === 'NORMAL' ? 1.2 : 1.0;
    if (ammoType === 'HE') k = 1.5;
    else if (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') k = 1.25;
    else if (ammoType === 'CLUSTER') k = 1.1;
    else if (ammoType === 'CLUSTER_SUBMUNITION') k = 0.45;
    const air = hitType === 'AIRBURST';
    const near = Math.max(0, 1 - distance / 900);
    // Cỡ vụ nổ (thời lượng, độ trầm) tách khỏi mức to: đạn 155 dài & trầm hơn, thêm tầng đất rung — mức to chỉ nhích
    // vừa phải vì đỉnh đã sát trần, tăng nữa chỉ làm méo
    const heavy = !!(opts && opts.heavy) && ammoType === 'HE';
    const Z = heavy ? 1.45 : 1;
    const lvl = heavy ? 1.3 : ammoType === 'HE' ? 1.2 : ammoType === 'NORMAL' ? 1.0 : 1;

    // Mức đưa vào thấp có chủ đích: nếu để to, tầng cắt đỉnh / giới hạn ở đầu ra ép tiếng nổ thành một khối ồn bẹt;
    // để thấp thì xung đầu vẫn chạm đỉnh còn thân nổ tụt nhanh phía sau -> có "cú đấm" như tiếng nổ thật
    const out = this.voice({ gain: sp.gain * 0.2 * lvl, lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.1), pan: sp.pan });

    if (!this.playSample('explosion', out, t, { gain: 1.4 * Math.min(1.3, k) })) {
      // Cấu trúc tiếng nổ thật: (1) sóng xung kích "ĐOÀNG" gắt nhất ngay ms đầu -> (2) thân nổ "BÙM" trầm dày
      // tắt trong ~1 s -> (3) đất đá, không khí xé "rào rào" -> (4) rền cuộn & tiếng dội nhỏ hơn hẳn phát nổ
      // Bề mặt chạm đổi cả thân tiếng nổ: nổ trên thép / đá gắt hơn; trong bao cát / dưới nước bị nghẹt mất âm cao;
      // trên đất / bao cát / đá có đất đá hất tung, trên vỏ xe & mặt nước thì không
      const MAT = {
        DIRECT_HIT: [1.35, 0.85, 0, 1400], WALL: [1.2, 0.9, 0.35, 1400], BUILDING: [0.9, 1.0, 0.35, 1100], TREE: [1.0, 0.9, 0.3, 1300],
        BOULDER: [1.35, 0.9, 0.5, 1500], SANDBAG: [0.4, 1.1, 0.6, 650], WATER: [0.35, 0.8, 0, 600], AIRBURST: [1.1, 0.7, 0, 1600]
      }[hitType] || [1, 1, 1, 1400];
      const [bright, bodyK, dirtK, bodyF] = MAT;
      const W = this.stereoSpread(out, 0.6);
      this.snap(out, t, 1.4 * k * Math.max(0.5, bright), 7000, 5);
      // Tiếng "CHÁT" của sóng nổ: cực ngắn rồi tắt ngay (không để xì xèo)
      this.burst(out, t, { filter: 'bandpass', freq: 2400, Q: 0.6, drive: 3, gain: 1.3 * k * bright, attack: 0.0004, dur: 0.04 });
      for (const ch of [W.L, W.R]) {
        // Sức ép nổ: dải rộng, cao tần sụt nhanh trong ~80 ms
        this.burst(ch, t, { filter: 'lowpass', freq: 6000 * Math.min(1, bright), freqEnd: 300, sweep: 0.08, drive: 3, gain: 1.1 * k * Math.max(0.5, bright), attack: 0.0005, dur: 0.2 * Z });
        // Thân nổ "BÙM": nhiễu nâu lọc trượt từ trung xuống trầm — phần chủ đạo, ít méo để giữ cú đấm
        this.burst(ch, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: bodyF, freqEnd: heavy ? 80 : 120, sweep: 0.5 * Z, drive: 2.5, gain: 1.1 * k * bodyK, attack: 0.001, dur: 0.55 * k * Z });
      }
      // Thân nổ dải 150-400 Hz: phần "BÙM" mà loa nhỏ (laptop / tai nghe) vẫn phát được — thiếu lớp này tiếng nổ chỉ còn
      // âm siêu trầm, loa thường không phát nổi nên nghe lép bép, mất uy lực
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: heavy ? 210 : 260, Q: 0.8, drive: 2, gain: 4.2 * k * bodyK, attack: 0.002, dur: 0.42 * k * Z });
      // Cú đấm ngực 50-150 Hz (vừa phải: âm siêu trầm ăn hết khoảng trống mức to mà tai / loa nhỏ lại ít nghe thấy)
      this.tone(out, t, { freq: 150, freqEnd: 65, sweep: 0.12 * Z, drive: 3, gain: 1.05 * k, attack: 0.0008, dur: 0.28 * Z });
      this.tone(out, t, { freq: 72, freqEnd: 45, sweep: 0.3 * Z, drive: 2, gain: (air ? 0.4 : 0.7) * k, attack: 0.002, dur: 0.4 * Z });
      // Khối khí & đất bị hất tung: dải trung "rầm" đục, rồi phản xạ mặt đất trễ ~30 ms làm dày tiếng
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 0.6, drive: 2, gain: 4.6 * k * Math.min(1, bright + 0.2), attack: 0.001, dur: 0.3 * Z });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2.5, gain: 1.0 * k, attack: 0.002, dur: 0.5 * k * Z });
      this.burst(out, t + 0.03, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 2, gain: 0.5 * k, attack: 0.004, dur: 0.45 * k * Z });
      // đất đá, mảnh vỡ bị hất tung ngay sau sóng nổ: "rắc rào" dải trung-cao
      if (!air && dirtK > 0) this.burst(out, t + 0.006, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200, Q: 0.5, gain: 5.0 * k * dirtK, attack: 0.003, dur: 0.45 * Z });
      // không khí bị xé + đất cát phụt: nhiễu dày dải 1-3 kHz tắt nhanh — làm tiếng nổ "rõ mặt", không chỉ ục ục
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700, Q: 0.6, drive: 1.5, gain: 5.2 * k * bright, attack: 0.001, dur: 0.22 * Z });
      if (heavy) {
        // 155mm: khối đất hàng tấn bị hất tung -> cú "HỰ" thứ hai trễ ~60 ms (phản xạ nền + đất đổ), đất rung trầm kéo dài
        this.burst(out, t + 0.06, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 0.7, drive: 2, gain: 2.4 * k, attack: 0.004, dur: 0.45 });
        this.burst(out, t + 0.02, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 170, drive: 2, gain: 1.1 * k, attack: 0.03, dur: 1.3 });
      }
    }
    if (distance < 700 * Z) this.duck(0.3 + 0.5 * (distance / (700 * Z)), heavy ? 1.6 : 1.0);

    // Rền cuộn lan xa + tiếng dội địa hình (nhỏ hơn hẳn phát nổ chính, kéo dài)
    const roll = this.voice({ gain: sp.gain * 0.8 * lvl, lowpass: Math.min(sp.lowpass, 500), wet: 0.95, pan: sp.pan * 0.5 });
    this.burst(roll, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: heavy ? 220 : 260, gain: 0.32 * k * Z, attack: 0.15, dur: (1.8 + 0.6 * k) * Z });
    if (k >= 0.9) this.playTerrainEchoes(t, k * 0.45 * Z * Math.sqrt(sp.gain), sp.lowpass);

    if (hitType === 'WATER') {
      // Nổ dưới nước: tiếng nổ bị nước nuốt thành "ụp" đục, cột nước vọt lên rồi đổ ào xuống như mưa rào
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, drive: 3, gain: 1.4 * k, attack: 0.004, dur: 0.5 });
      this.burst(out, t + 0.04, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, freqEnd: 2600, sweep: 0.3, Q: 0.7, gain: 0.8 * k, attack: 0.03, dur: 0.5 });
      this.burst(out, t + 0.5, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1400, gain: 0.55 * k, attack: 0.25, dur: 1.6 });
      this.burst(out, t + 0.55, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.6, gain: 0.9 * k, attack: 0.2, dur: 1.8 });
      return;
    }
    // Tiếng riêng của vật liệu bị trúng (giáp / bê tông / nhà gạch / gỗ / đá / bao cát / đất); tên lửa & RPG là đầu đạn lõm
    const heat = ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
    this.surfaceHit(out, t, hitType, heat ? 'heat' : 'blast', k);

    // Đất đá, mảnh vụn rơi rào rào + các cục đất rơi bịch bịch sau vụ nổ gần (không có khi nổ trên vỏ xe)
    if (!air && near > 0 && hitType !== 'DIRECT_HIT' && hitType !== 'WATER') {
      this.burst(out, t + 0.25, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 2200, gain: 0.3 * near * k * Z, attack: 0.35, dur: 1.4 * Z });
      this.burst(out, t + 0.25, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1400, gain: 0.9 * near * k * Z, attack: 0.3, dur: 1.5 * Z });
      for (let i = 0; i < (heavy ? 8 : 4); i++) {
        this.burst(out, t + 0.35 + Math.random() * 0.9 * Z * Z, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: 0.45 * near * k * (0.6 + Math.random() * 0.6), attack: 0.002, dur: 0.08 });
      }
    }
  }

  // ===========================================================================
  // ÂM THANH THỨ CẤP: nổ kho đạn, gạch ERA, xăng bùng cháy, nổ lốp, vỡ kính, giáp bong, xích đứt,
  // bê tông vỡ, nhà sập, cây gãy đổ, lửa cháy lách tách, tháp pháo rơi đập đất
  // ===========================================================================
  // Tự tính khoảng cách tới người nghe (xe người chơi trong game / camera ở phòng thử)
  secondaryAt(kind, pos, scale = 1) {
    if (!this.ready() || !pos) return;
    let lx = 0, lz = 0;
    const g = window.game, lab = window.__fxLab;
    if (g && g.player) { lx = g.player.x; lz = g.player.z; }
    else if (lab && lab.camera) { lx = lab.camera.position.x; lz = lab.camera.position.z; }
    const d = Math.hypot(pos.x - lx, pos.z - lz);
    if (d > 2600) return;
    // Giới hạn tần suất để không dồn dập khi nhiều sự kiện cùng lúc
    const now = this.ctx.currentTime;
    this._secLast = this._secLast || {};
    const gap = kind === 'cookoffSmall' ? 0.025 : kind === 'metalCrush' ? 0.35 : kind === 'armorPlate' ? 0.25 : (kind === 'debrisLand' || kind === 'snap') ? 0.07 : kind === 'debris' ? 0.3 : (kind === 'glass' || kind === 'concrete') ? 0.12 : 0.15;
    if (this._secLast[kind] && now - this._secLast[kind] < gap) return;
    this._secLast[kind] = now;
    this.playSecondary(kind, d, pos, scale);
  }

  playSecondary(kind, distance = 0, pos = null, k = 1) {
    if (!this.ready()) return;
    const sp = this.spatial(distance, pos);
    const t = this.ctx.currentTime + sp.delay;
    // Thứ bậc độ to như ngoài đời (cùng khoảng cách): nổ đạn pháo > kho đạn / gạch ERA > nhà sập > tháp rơi, thép oằn
    // > nổ lốp > xích đứt > mảnh rơi. Thiếu bậc này thì nổ lốp to ngang đạn 155 và tiếng nổ chính mất uy lực
    const LEVEL = {
      cookoff: 0.25, cookoffSmall: 0.3, era: 0.3, fuel: 0.2, collapse: 0.11, turretLand: 0.08, metalCrush: 0.25,
      tire: 0.2, trackSnap: 0.35, concrete: 0.3, treeFall: 0.4, armorPlate: 0.35, snap: 0.5, debris: 0.45, debrisLand: 0.45
    };
    const out = this.voice({ gain: sp.gain * (LEVEL[kind] || 1), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.08), pan: sp.pan });
    const near = Math.max(0, 1 - distance / 900);
    switch (kind) {
      case 'cookoff': {
        // Đạn trong kho nổ dây chuyền: chuỗi tiếng nổ đanh không đều + phụt lửa xì xèo
        const n = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const ti = t + i * (0.06 + Math.random() * 0.22);
          const kk = (0.6 + Math.random() * 0.6) * k;
          this.snap(out, ti, 0.9 * kk, 5000, 5);
          this.burst(out, ti, { filter: 'lowpass', freq: 3000, freqEnd: 180, sweep: 0.08, drive: 5, gain: 0.9 * kk, attack: 0.0008, dur: 0.22 });
          this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 4, gain: 1.2 * kk, attack: 0.003, dur: 0.6 });
        }
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 0.6, gain: 0.35 * k, attack: 0.05, dur: 1.6 });
        break;
      }
      case 'cookoffSmall': {
        // Đạn nhỏ (30mm / 12.7mm) trong thùng đạn bị lửa nung nổ: tiếng "bụp / tạch" ngắn gọn, mỗi phát một kiểu
        const kk = k * (0.7 + Math.random() * 0.6);
        this.snap(out, t, 0.6 * kk, 3500 + Math.random() * 2500, 3);
        this.burst(out, t, { filter: 'lowpass', freq: 2400, freqEnd: 300, sweep: 0.05, drive: 3, gain: 0.55 * kk, attack: 0.0005, dur: 0.07 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 600, drive: 2, gain: 0.5 * kk, attack: 0.001, dur: 0.12 });
        if (Math.random() < 0.3) this.burst(out, t + 0.02, { filter: 'bandpass', freq: 2600, Q: 3, gain: 0.12 * kk, attack: 0.002, dur: 0.18 });  // mảnh đạn rít
        break;
      }
      case 'era': {
        // Gạch giáp phản ứng nổ: tiếng nổ chát đanh, ngắn, kèm tiếng thép văng
        this.snap(out, t, 1.4 * k, 7000, 7);
        this.burst(out, t, { filter: 'bandpass', freq: 2600, Q: 0.8, drive: 5, gain: 0.9 * k, attack: 0.0004, dur: 0.06 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, drive: 5, gain: 1.4 * k, attack: 0.002, dur: 0.7 });
        this.metal(out, t + 0.02, { f0: 520, decay: 0.5, gain: 0.25 * k });
        break;
      }
      case 'fuel': {
        // Xăng dầu bắt lửa: "phừng" trầm + lửa gầm cuộn
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, freqEnd: 900, sweep: 0.4, drive: 3, gain: 1.6 * k, attack: 0.06, dur: 1.2 });
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 0.5, gain: 0.7 * k, attack: 0.25, dur: 2.6 });
        this.burst(out, t + 0.2, { buffer: this.crackleBuffer, filter: 'highpass', freq: 1200, gain: 0.8 * k, attack: 0.2, dur: 2.4 });
        break;
      }
      case 'tire': {
        // Nổ lốp / văng bánh: tiếng NỔ chát của khí nén thoát đột ngột + luồng hơi phụt + cao su rách phần phật
        this.snap(out, t, 1.1 * k, 2600, 4);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, freqEnd: 150, sweep: 0.1, drive: 4, gain: 1.1 * k, attack: 0.0008, dur: 0.16 });
        this.burst(out, t + 0.005, { filter: 'highpass', freq: 2200, gain: 0.45 * k, attack: 0.002, dur: 0.5 });
        this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 900, gain: 0.5 * k, attack: 0.01, dur: 0.3 });
        break;
      }
      case 'tireHiss': {
        // Lốp bị đạn xuyên thủng: không nổ, chỉ xì hơi rít giảm dần
        this.burst(out, t, { filter: 'highpass', freq: 3200, gain: 0.32 * k, attack: 0.01, dur: 1.4 });
        this.burst(out, t, { filter: 'bandpass', freq: 5200, freqEnd: 2600, sweep: 1.2, Q: 2, gain: 0.18 * k, attack: 0.01, dur: 1.3 });
        break;
      }
      case 'glass': {
        // Kính chống đạn nhiều lớp: cú va "cộp" đục của tấm kính dày -> lớp kính dán vỡ vụn lạo xạo (không giòn tan như kính thường)
        // -> mảnh vụn rơi xuống sàn cabin / mặt đất lách tách thưa dần
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 650, drive: 2, gain: 0.45 * k, attack: 0.0008, dur: 0.06 });
        this.burst(out, t, { filter: 'highpass', freq: 3200, drive: 2, gain: 0.4 * k, attack: 0.0004, dur: 0.03 });
        this.burst(out, t + 0.008, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.9 * k, attack: 0.003, dur: 0.22 });
        this.burst(out, t + 0.02, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 5200, Q: 1.1, gain: 0.45 * k, attack: 0.004, dur: 0.3 });
        for (let i = 0; i < 12; i++) {
          const ti = t + 0.12 + Math.pow(Math.random(), 0.6) * 0.8;
          this.burst(out, ti, { filter: 'bandpass', freq: 3500 + Math.random() * 4500, Q: 8, gain: (0.05 + Math.random() * 0.08) * k, attack: 0.0005, dur: 0.012 + Math.random() * 0.025 });
        }
        break;
      }
      case 'metalCrush': {
        // Thân xe bị ép bẹp / khung gầm gãy sụp: "rầm" đục của khối thép, tấm thép oằn rên trầm, mối hàn bung "tạch",
        // cuối cùng là tiếng thép đổ dồn xuống
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, drive: 3, gain: 1.2 * k, attack: 0.004, dur: 0.45 });
        this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420, freqEnd: 250, sweep: 0.7, Q: 12, drive: 2, gain: 0.9 * k, attack: 0.08, dur: 0.7 });
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 980, freqEnd: 620, sweep: 0.5, Q: 14, gain: 0.4 * k, attack: 0.05, dur: 0.5 });
        for (let i = 0; i < 3; i++) this.burst(out, t + 0.05 + Math.random() * 0.4, { filter: 'highpass', freq: 2800, gain: 0.22 * k, attack: 0.0004, dur: 0.012 });
        this.metal(out, t + 0.35 + Math.random() * 0.1, { f0: 140 + Math.random() * 40, ratios: [1, 2.3, 3.8], decay: 0.5, gain: 0.3 * k, click: 0.5 });
        break;
      }
      case 'armorPlate': {
        // Tấm giáp / váy xích bị xé khỏi thân: thép rít xé, bu-lông đứt "tạch tạch", khối thép nặng "huỵch"
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400, freqEnd: 800, sweep: 0.12, Q: 3, drive: 2, gain: 0.45 * k, attack: 0.002, dur: 0.14 });
        for (let i = 0; i < 3; i++) this.burst(out, t + 0.01 + i * (0.02 + Math.random() * 0.03), { filter: 'highpass', freq: 3000, gain: 0.3 * k, attack: 0.0004, dur: 0.012 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 3, gain: 0.9 * k, attack: 0.002, dur: 0.18 });
        this.metal(out, t + 0.005, { f0: 260 + Math.random() * 80, ratios: [1, 2.2, 3.6], decay: 0.22, gain: 0.3 * k, click: 0.2 });
        break;
      }
      case 'snap': {
        // Giá đỡ phụ kiện nhỏ gãy bật: tiếng "tách" khô + lạch cạch
        this.burst(out, t, { filter: 'highpass', freq: 2600, drive: 2, gain: 0.4 * k, attack: 0.0004, dur: 0.015 });
        this.metal(out, t + 0.003, { f0: 700 + Math.random() * 500, ratios: [1, 2.6], decay: 0.08, gain: 0.12 * k, click: 0.2 });
        break;
      }
      case 'debris':
      case 'debrisLand': {
        // Mảnh / phụ kiện rơi đập đất: "bịch" trầm theo khối lượng + tiếng kim loại đục cụt, nảy nhẹ một lần
        const heavy = Math.min(1.6, k);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520 - heavy * 160, drive: 2, gain: 0.55 * heavy, attack: 0.002, dur: 0.06 + heavy * 0.06 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (900 - heavy * 300) * (0.8 + Math.random() * 0.4), Q: 5, gain: 0.25 * heavy, attack: 0.001, dur: 0.07 });
        const tb = t + 0.12 + Math.random() * 0.12;
        this.burst(out, tb, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 480, gain: 0.2 * heavy, attack: 0.002, dur: 0.05 });
        this.burst(out, tb + 0.05, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1800, gain: 0.15 * heavy, attack: 0.01, dur: 0.18 });
        break;
      }
      case 'trackSnap': {
        // Xích đứt: chốt mắt xích gãy "chát", dải xích thép nặng tuột khỏi bánh dẫn hướng đổ lạch xạch xuống đất
        this.snap(out, t, 0.9 * k, 3600, 5);
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, Q: 5, drive: 2, gain: 0.6 * k, attack: 0.001, dur: 0.2 });
        let ti = t + 0.08;
        for (let i = 0; i < 8; i++) {
          ti += 0.05 + Math.random() * 0.05 + i * 0.008;
          this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 260 + Math.random() * 260, Q: 4, gain: (0.35 - i * 0.03) * k, attack: 0.001, dur: 0.05 });
          this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.25 * k, attack: 0.001, dur: 0.05 });
        }
        this.burst(out, ti + 0.06, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, drive: 2, gain: 0.6 * k, attack: 0.003, dur: 0.25 });
        break;
      }
      case 'concrete': {
        // Khối bê tông vỡ toác + đá vụn rơi
        this.burst(out, t, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 3000, gain: 1.2 * k, attack: 0.003, dur: 0.6 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 400, drive: 2, gain: 0.8 * k, attack: 0.004, dur: 0.5 });
        for (let i = 0; i < 4; i++) this.burst(out, t + 0.2 + Math.random() * 0.6, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, gain: 0.35 * k, attack: 0.002, dur: 0.07 });
        break;
      }
      case 'collapse': {
        // Nhà sập: tiếng gãy kết cấu nối tiếp + ầm ầm kéo dài + đá vụn đổ rào rào
        for (let i = 0; i < 4; i++) this.burst(out, t + i * 0.18 + Math.random() * 0.1, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 2200, gain: 1.0 * k, attack: 0.004, dur: 0.5 });
        this.burst(out, t + 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, drive: 3, gain: 2.2 * k, attack: 0.25, dur: 3.6 });
        this.tone(out, t + 0.1, { freq: 38, freqEnd: 22, sweep: 2.5, drive: 2, gain: 1.0 * k, attack: 0.3, dur: 3.2 });
        this.burst(out, t + 0.6, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 1800, gain: 0.5 * k, attack: 0.4, dur: 3.2 });
        if (near > 0.3) this.duck(0.4, 1.4);
        break;
      }
      case 'treeFall': {
        // Thân cây gãy rắc + lá xào xạc + đổ "rầm"
        this.burst(out, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1500, Q: 0.7, gain: 0.9 * k, attack: 0.002, dur: 0.3 });
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1800, gain: 0.35 * k, attack: 0.3, dur: 1.0 });
        this.burst(out, t + 1.2, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, drive: 2, gain: 1.0 * k, attack: 0.004, dur: 0.6 });
        break;
      }
      case 'vehFire': {
        // Xe / xác xe đang cháy (một đợt ~2.2 s, gọi lặp chồng lên nhau): lửa dầu gầm cuộn "phừng phừng" theo nhịp thở,
        // vật liệu cháy nổ lách tách, thỉnh thoảng "bụp" của bình / ống dầu phụt hoặc "xì" của lốp, đường ống
        const dur = 2.2;
        const roar = this.ctx.createGain();
        roar.gain.value = 1;
        roar.connect(out);
        // nhịp thở của lửa lớn: biên độ dao động chậm ~1.5-3 Hz
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 1.5 + Math.random() * 1.5;
        const ld = this.ctx.createGain();
        ld.gain.value = 0.35;
        lfo.connect(ld);
        ld.connect(roar.gain);
        lfo.start(t);
        lfo.stop(t + dur + 0.6);
        this.burst(roar, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 2, gain: 1.1 * k, attack: 0.5, dur: dur });
        this.burst(roar, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, Q: 0.6, gain: 0.35 * k, attack: 0.5, dur: dur });
        this.burst(out, t + 0.1, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2400, Q: 0.6, gain: 0.8 * k, attack: 0.3, dur: dur });
        if (Math.random() < 0.25) this.burst(out, t + Math.random() * 1.5, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 3, gain: 0.7 * k, attack: 0.002, dur: 0.12 });
        if (Math.random() < 0.15) this.burst(out, t + Math.random() * 1.2, { filter: 'highpass', freq: 3500, gain: 0.12 * k, attack: 0.05, dur: 0.8 });
        break;
      }
      case 'fire': {
        // Lửa cháy lách tách
        this.burst(out, t, { buffer: this.crackleBuffer, filter: 'highpass', freq: 900, gain: 0.5 * k, attack: 0.15, dur: 1.8 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.4 * k, attack: 0.3, dur: 2.0 });
        break;
      }
      case 'turretLand': {
        // Khối tháp thép hàng chục tấn đập xuống đất
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 180, drive: 4, gain: 2.0 * k, attack: 0.002, dur: 0.9 });
        this.tone(out, t, { freq: 60, freqEnd: 30, sweep: 0.4, drive: 2, gain: 1.2 * k, attack: 0.002, dur: 0.8 });
        this.metal(out, t, { f0: 110, ratios: [1, 2.1, 3.7, 5.2], decay: 1.6, gain: 0.4 * k, click: 1 });
        break;
      }
      default:
        this.metal(out, t, { f0: 500, decay: 0.3, gain: 0.15 * k });
    }
  }

  // Mũi tên APFSDS: trúng giáp -> tiếng "KHÁNG" chát của thép bị đâm thủng + rít xé + mảnh vỡ lách cách bên trong;
  // trúng đất / tường -> tiếng đập trầm + đất đá / bê tông vỡ
  playKineticImpact(distance, hitType = 'GROUND', pos = null) {
    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    // Đạn động năng không có thuốc nổ: tiếng va đanh, gắt nhưng nhỏ hơn hẳn một vụ nổ đạn HE
    const out = this.voice({ gain: sp.gain * 0.4, lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    this.snap(out, t, 1.0, 7000, 5);
    if (hitType === 'DIRECT_HIT') {
      // va chạm thép dày: xung cực gắt + thân "khang" trung trầm tắt nhanh (thép dày giảm chấn, không ngân)
      this.burst(out, t, { filter: 'bandpass', freq: 3200, Q: 1.4, drive: 4, gain: 0.9, attack: 0.0004, dur: 0.03 });
      this.metal(out, t, { f0: 210 + Math.random() * 60, ratios: [1, 1.9, 3.1, 4.6], decay: 0.35, gain: 0.55, click: 0.4 });
      // xé thủng: tiếng rít kim loại tụt tần nhanh
      this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 700, sweep: 0.14, Q: 2.5, drive: 3, gain: 0.5, attack: 0.002, dur: 0.18 });
      // mảnh vỡ văng trong khoang lách cách
      this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3800, Q: 0.9, gain: 0.5, attack: 0.01, dur: 0.35 });
      this.tone(out, t, { freq: 95, freqEnd: 45, sweep: 0.1, drive: 2, gain: 0.7, attack: 0.001, dur: 0.16 });
      // góc chạm xiên / giáp quá dày: mũi tên nảy bật đi rít
      if (Math.random() < 0.15) this.playRicochet(out, t + 0.01);
    } else if (hitType === 'WATER') {
      // Mũi tên xuyên cắm xuống nước: "tõm" nặng + cột nước nhỏ đổ xuống
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 0.9, attack: 0.002, dur: 0.18 });
      this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, freqEnd: 3000, sweep: 0.15, Q: 0.8, gain: 0.6, attack: 0.01, dur: 0.3 });
      this.burst(out, t + 0.3, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3200, Q: 0.7, gain: 0.5, attack: 0.1, dur: 0.7 });
    } else if (hitType === 'GROUND' || !hitType) {
      // cắm xuống đất: "huỵch" trầm + đất cát bắn tung
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, freqEnd: 120, sweep: 0.15, drive: 4, gain: 1.0, attack: 0.001, dur: 0.3 });
      this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200, Q: 0.8, gain: 0.7, attack: 0.02, dur: 0.5 });
    } else {
      // bê tông / nhà gạch / gỗ / đá / bao cát: tiếng vật liệu riêng
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 900, freqEnd: 180, sweep: 0.12, drive: 3, gain: 0.8, attack: 0.001, dur: 0.22 });
      this.surfaceHit(out, t, hitType, 'kinetic', 1);
    }
  }

  // Đạn liên thanh 30mm (đầu đạn nổ mạnh) / đạn súng máy 12.7mm găm đất / giáp / tường
  playGatlingImpact(distance, hitType = 'GROUND', isIncendiary = false, pos = null, isMG = false) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastGatlingImpactTime < 0.038) return;
    this.lastGatlingImpactTime = now;

    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.06) return;
    const t = now + sp.delay;
    // Đầu đạn 30mm chỉ vài chục gam thuốc nổ (đạn pháo 120mm: vài kg) -> mỗi phát nhỏ hơn hẳn; bắn 30 phát/giây cộng dồn đã đủ ồn
    const out = this.voice({ gain: sp.gain * (isMG ? 0.9 : 0.3), lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });

    if (this.playSample('bullet_impact', out, t, { gain: 1.0, vary: 0.1 })) return;

    if (isMG) {
      // Đạn 12.7mm không nổ: chỉ có tiếng va chạm
      this.snap(out, t, 0.45, 6000, 3);
    } else {
      // Đầu đạn 30mm nổ: xung nén + bụp trầm ngắn
      this.snap(out, t, 0.6, 5000, 4);
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 800, freqEnd: 140, sweep: 0.15, drive: 4, gain: 1.1, attack: 0.001, dur: 0.24 });
      this.tone(out, t, { freq: 70, freqEnd: 32, sweep: 0.12, drive: 2, gain: 0.6, attack: 0.002, dur: 0.18 });
    }

    if (hitType === 'DIRECT_HIT') {
      // Đạn đập vào giáp thép: tiếng "chát / cạch" kim loại khô, cao độ đổi mỗi phát (chỗ trúng khác nhau), không ngân
      const f = (isMG ? 1500 : 1100) * (0.8 + Math.random() * 0.45);
      const gk = isMG ? 1 : 2.6;   // 30mm: tiếng thép phải nổi trên tiếng "bụp" của đầu đạn nổ
      this.burst(out, t, { filter: 'bandpass', freq: f * 2.4, Q: 1.6, drive: 3, gain: (isMG ? 0.55 : 0.45) * gk, attack: 0.0004, dur: 0.022 });
      this.metal(out, t, { f0: f * 0.5, ratios: [1, 2.2, 3.9], decay: isMG ? 0.12 : 0.2, gain: (isMG ? 0.22 : 0.28) * gk, click: 0.3 });
      if (!isMG) this.burst(out, t + 0.005, { filter: 'highpass', freq: 3500, gain: 0.25, attack: 0.002, dur: 0.12 });   // mảnh thép tóe tia lửa
      // Đạn 12.7mm không xuyên nổi giáp: thỉnh thoảng nảy bật đi kêu rít
      if (isMG && Math.random() < 0.3) this.playRicochet(out, t + 0.008);
    } else if (hitType === 'WATER') {
      // Đạn găm mặt nước: tiếng "xẹt / tõm" ngắn + tia nước rơi lộp độp (30mm: cột nước lớn hơn, át tiếng nổ bị nước nuốt)
      const wk = isMG ? 1 : 2.5;
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, freqEnd: 3800, sweep: 0.06, Q: 1.2, gain: 0.45 * wk, attack: 0.002, dur: 0.09 });
      this.burst(out, t + 0.12, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3500, Q: 0.8, gain: 0.35 * wk, attack: 0.03, dur: 0.3 });
    }
    // tiếng vật liệu riêng (bê tông / nhà / gỗ / đá / bao cát / đất) + lớp đạn cháy
    this.surfaceHit(out, t, hitType, isMG ? 'b127' : 'b30', 1, isIncendiary);
  }

  /**
   * Xe mình va chạm. kind: 'obstacle' (tường, nhà, công sự, cây) | 'vehicle' (xe khác).
   * intensity 0..1 theo tốc độ lúc đâm. Đâm mạnh: "RẦM" thép nặng + tường / cây vỡ lạo xạo; cọ nhẹ: thép cạ ken két.
   */
  playCollision(intensity = 0.5, kind = 'obstacle') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    if (t - (this._lastBump || 0) < 0.35) return;
    this._lastBump = t;
    const k = Math.max(0.15, Math.min(1, intensity));
    const out = this.voice({ gain: 0.6 + 0.6 * k, wet: 0.12 });
    // khối thép hàng chục tấn đập vào vật cản: "huỵch" trầm
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200 + 120 * k, drive: 3, gain: 1.2 * k, attack: 0.003, dur: 0.25 + 0.2 * k });
    this.tone(out, t, { freq: 55, freqEnd: 30, sweep: 0.2, drive: 2, gain: 0.8 * k, attack: 0.003, dur: 0.3 });
    if (kind === 'vehicle') {
      // thép đâm thép: tiếng "KENG" lớn ngân trầm + cạ xước
      this.metal(out, t, { f0: 95 + Math.random() * 40, ratios: [1, 1.8, 2.9, 4.2], decay: 0.9, gain: 0.45 * k, click: 0.8 });
      this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1900, freqEnd: 900, sweep: 0.35, Q: 4, gain: 0.3 * k, attack: 0.01, dur: 0.4 });
    } else {
      // vật cản vỡ: gạch, bê tông, gỗ vỡ lạo xạo + giáp trước va cạ
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 2600, gain: 1.0 * k, attack: 0.005, dur: 0.5 });
      this.metal(out, t, { f0: 160 + Math.random() * 60, ratios: [1, 2.3, 3.7], decay: 0.35, gain: 0.25 * k, click: 0.5 });
    }
    // đồ đạc trong khoang xô lệch
    for (let i = 0; i < 3; i++) this.metal(out, t + 0.05 + Math.random() * 0.25, { f0: 700 + Math.random() * 800, ratios: [1, 2.4], decay: 0.05, gain: 0.05 * k, click: 0.3 });
  }

  /**
   * Tiếng của VẬT LIỆU bị trúng — dùng chung cho mọi loại đạn, mỗi cặp đạn × vật liệu ra tiếng riêng.
   * cls: 'blast' (đạn nổ) | 'heat' (đầu đạn lõm: tên lửa, RPG) | 'kinetic' (đạn xuyên giáp, không thuốc nổ)
   *      | 'b30' (đạn 30mm nổ mạnh) | 'b127' (đạn 12.7mm thường); k: cỡ; inc: đạn cháy
   * hitType -> vật liệu: DIRECT_HIT giáp thép · WALL bê tông · BUILDING nhà gạch vữa · TREE thân gỗ · BOULDER đá ·
   *   SANDBAG bao cát · WATER nước · còn lại đất
   */
  surfaceHit(out, t, hitType, cls, k = 1, inc = false) {
    const big = cls === 'blast' || cls === 'heat';
    const bullet = cls === 'b30' || cls === 'b127';
    const R = Math.random;
    // đạn nổ lớn / đầu đạn 30mm có thân tiếng nổ rất to -> lớp vật liệu phải đủ mạnh mới nghe ra
    k *= big ? 2.6 : cls === 'b30' ? 2.4 : 1;
    const stones = (t0, n, fLo, fHi, g, spread) => {
      for (let i = 0; i < n; i++) this.burst(out, t0 + Math.pow(R(), 0.8) * spread, { filter: 'bandpass', freq: fLo + R() * (fHi - fLo), Q: 6, gain: g * (0.4 + R() * 0.6), attack: 0.0005, dur: 0.012 + R() * 0.02 });
    };
    switch (hitType) {
      case 'DIRECT_HIT': {
        if (cls === 'heat') {
          // đầu đạn lõm: luồng kim loại nóng chảy xuyên giáp — "CHÍT" cực gắt, rồi mảnh giáp vụn phun "xèèè" vào trong
          this.burst(out, t, { filter: 'bandpass', freq: 3600, Q: 1.2, drive: 4, gain: 1.4 * k, attack: 0.0003, dur: 0.025 });
          this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 4200, freqEnd: 1400, sweep: 0.3, Q: 1.5, drive: 2, gain: 1.0 * k, attack: 0.003, dur: 0.35 });
          this.metal(out, t, { f0: 130 + R() * 40, ratios: [1, 1.8, 2.9, 4.3], decay: 0.6, gain: 0.35 * k, click: 0.6 });
        } else if (big) {
          // đạn nổ trên vỏ thép: thép cộng hưởng chát chúa + tiếng xé kim loại + thân xe "BOONG" trầm
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 1.2, drive: 3, gain: 0.9 * k, attack: 0.001, dur: 0.18 });
          this.burst(out, t, { filter: 'bandpass', freq: 2400, freqEnd: 900, Q: 0.9, drive: 2, gain: 0.4 * k, attack: 0.001, dur: 0.25 });
          this.metal(out, t + 0.005, { f0: 105 + R() * 35, ratios: [1, 1.7, 2.6, 3.9], decay: 0.8, gain: 0.4 * k, click: 0.5 });
        }
        break;   // đạn xuyên giáp / đạn nhỏ trúng giáp: hàm riêng đã tạo tiếng thép (kèm nảy rít)
      }
      case 'WALL': {
        // BÊ TÔNG: cứng, giòn — tiếng va "CHÁT" gắt, vụn bê tông bắn tung lạo xạo, tảng lớn rơi "bịch", bụi xi măng xì
        this.burst(out, t, { filter: 'bandpass', freq: 2200, Q: 0.9, drive: 3, gain: (bullet ? 0.5 : 0.9) * k, attack: 0.0004, dur: 0.04 });
        this.burst(out, t + 0.005, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.6, gain: (bullet ? 1.2 : 2.2) * k, attack: 0.004, dur: bullet ? 0.25 : 0.8 });
        if (!bullet) {
          for (let i = 0; i < (big ? 6 : 3); i++) this.burst(out, t + 0.15 + R() * 0.8, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.5 * k, attack: 0.002, dur: 0.07 });
          this.burst(out, t + 0.1, { filter: 'highpass', freq: 2600, gain: 0.12 * k, attack: 0.2, dur: 1.0 });
        }
        if (bullet && R() < (cls === 'b127' ? 0.35 : 0.15)) this.playRicochet(out, t + 0.006);
        break;
      }
      case 'BUILDING': {
        // NHÀ GẠCH VỮA: xốp hơn bê tông — tiếng "bộp / ầm" đục, gạch vữa vỡ vụn rào rào, bụi; đạn nổ làm kính vỡ, khung gỗ gãy
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: bullet ? 900 : 700, drive: 2, gain: (bullet ? 0.6 : 1.0) * k, attack: 0.001, dur: bullet ? 0.07 : 0.35 });
        this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1800, gain: (bullet ? 1.0 : 2.0) * k, attack: 0.008, dur: bullet ? 0.3 : 1.2 });
        if (!bullet) {
          this.burst(out, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 450, drive: 2, gain: 0.7 * k, attack: 0.08, dur: 1.6 });
          if (big) { stones(t + 0.05, 8, 3500, 7500, 0.12 * k, 0.6); this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1100, Q: 1, gain: 0.8 * k, attack: 0.002, dur: 0.2 }); }
        }
        break;
      }
      case 'TREE': {
        // THÂN GỖ: "cộc" (đạn nhỏ găm) / "RẮC" (đạn lớn làm nứt toác), dăm gỗ văng, lá cành xào xạc
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: bullet ? 650 : 500, Q: 3, drive: 2, gain: (bullet ? 0.8 : 1.2) * k, attack: 0.0006, dur: bullet ? 0.045 : 0.08 });
        this.burst(out, t + 0.004, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1500, Q: 0.7, gain: (bullet ? 0.8 : 2.0) * k, attack: 0.003, dur: bullet ? 0.18 : 0.5 });
        if (!bullet) {
          this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 900, Q: 1.2, gain: 1.4 * k, attack: 0.002, dur: 0.3 });
          this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 2800, gain: 0.25 * k, attack: 0.2, dur: 1.1 });
        }
        break;
      }
      case 'BOULDER': {
        // ĐÁ TẢNG: cứng nhất — "CHÁT" rất gắt, đá vụn văng lách cách, đạn nảy rít rất hay gặp
        this.burst(out, t, { filter: 'bandpass', freq: 3000, Q: 1.3, drive: 4, gain: (bullet ? 0.6 : 1.1) * k, attack: 0.0003, dur: 0.03 });
        stones(t + 0.01, bullet ? 3 : 12, 1800, 5000, (bullet ? 0.15 : 0.3) * k, bullet ? 0.25 : 0.9);
        if (!bullet && !big) this.burst(out, t + 0.005, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.7, gain: 1.2 * k, attack: 0.004, dur: 0.4 });
        if ((bullet && R() < 0.5) || (cls === 'kinetic' && R() < 0.4)) this.playRicochet(out, t + 0.005);
        break;
      }
      case 'SANDBAG': {
        // BAO CÁT: hút năng lượng — "phập" nghẹt, không vang; cát chảy rào rào từ bao rách
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: bullet ? 280 : 220, drive: 2, gain: (bullet ? 0.7 : 1.1) * k, attack: 0.001, dur: bullet ? 0.06 : 0.18 });
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 0.6, gain: (bullet ? 0.12 : 0.06) * k, attack: 0.08, dur: bullet ? 0.4 : 1.2 });
        if (!bullet) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, gain: 0.5 * k, attack: 0.002, dur: 0.35 });
        break;
      }
      case 'WATER': case 'AIRBURST': break;   // nước / nổ trên không: hàm gọi tự xử lý
      default: {
        // ĐẤT: tiếng "phụt" của đất bị xới (đạn nhỏ) — đạn lớn có lớp đất đá rơi riêng
        if (bullet) {
          this.burst(out, t + 0.005, { filter: 'bandpass', freq: 3000, Q: 0.7, gain: 0.25, attack: 0.008, dur: 0.2 });
          this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.7, attack: 0.03, dur: 0.35 });
        }
      }
    }
    // ĐẠN CHÁY: thuốc cháy bùng "phựt" + trên thép tóe tia lửa xèo xèo; trên gỗ / nhà bắt lửa lách tách
    // (lớp phụ: dùng cỡ gốc, không nhân hệ số tăng cường để không che tiếng vật liệu)
    if (cls === 'b30') k /= 2.4;
    if (inc) {
      this.burst(out, t + 0.003, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2200, Q: 0.8, gain: 0.35 * k, attack: 0.002, dur: 0.12 });
      if (hitType === 'DIRECT_HIT' || hitType === 'WALL' || hitType === 'BOULDER') this.burst(out, t + 0.01, { filter: 'highpass', freq: 4500, gain: 0.07 * k, attack: 0.01, dur: 0.4 });
      else if (hitType === 'TREE' || hitType === 'BUILDING') this.burst(out, t + 0.05, { buffer: this.crackleBuffer, filter: 'highpass', freq: 1200, gain: 0.5 * k, attack: 0.05, dur: 0.6 });
    }
  }

  // Tiếng đạn nảy rít vút đi: đầu đạn méo xoay lộn -> tiếng xé gió dải hẹp tụt tần (Doppler khi bay xa), hơi rung
  playRicochet(dest, t) {
    const f = 2400 + Math.random() * 1600;
    const d = 0.25 + Math.random() * 0.2;
    this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, freqEnd: f * 0.42, sweep: d, Q: 14, gain: 0.5, attack: 0.003, dur: d });
    this.tone(dest, t, { freq: f, freqEnd: f * 0.4, sweep: d, gain: 0.035, attack: 0.004, dur: d, vibrato: 30 + Math.random() * 20, vibratoDepth: f * 0.03 });
  }

  /**
   * Xe của mình trúng đạn — nghe từ trong khoang: thép thân xe truyền âm trực tiếp vào tai kíp lái.
   * Đạn nhỏ: tiếng "tạch / keng" khô như mưa đá đập mái tôn; đạn lớn: "BOONG" thép dày ngân trầm, rồi ù tai.
   */
  playHullHit(ammoType = 'NORMAL') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const small = ammoType === 'GATLING_BULLET' || ammoType === 'INCENDIARY' || ammoType === 'SCOUT_BULLET';
    if (small) {
      if (t - (this._lastHullTick || 0) < 0.035) return;
      this._lastHullTick = t;
      const out = this.voice({ gain: 0.35, wet: 0.02 });
      const mg = ammoType === 'SCOUT_BULLET';
      const f0 = (mg ? 700 : 480) * (0.8 + Math.random() * 0.45);
      this.burst(out, t, { filter: 'bandpass', freq: f0 * 3, Q: 1.2, drive: 3, gain: mg ? 0.5 : 0.6, attack: 0.0003, dur: 0.018 });
      this.metal(out, t, { f0, ratios: [1, 1.83, 2.95, 4.4], decay: mg ? 0.22 : 0.3, gain: mg ? 0.28 : 0.36, click: 0.5 });
      if (!mg) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2, gain: 0.7, attack: 0.001, dur: 0.12 });   // đầu đạn 30mm nổ ngoài vỏ
      return;
    }
    // mức đưa vào thấp có chủ đích để giữ cú "BOONG" gắt (không bị tầng cuối ép bẹt)
    const out = this.voice({ gain: 0.32, wet: 0.04 });
    const heavy = ammoType === 'HE' || ammoType === 'CLUSTER' || ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
    const f0 = 82 + Math.random() * 40;
    // va đập: xung gắt + khối thép dày ngân (mode bất hòa thấp, tắt chậm)
    this.snap(out, t, 1.4, 4500, 5);
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2.5, gain: 2.0, attack: 0.001, dur: heavy ? 0.45 : 0.3 });
    this.tone(out, t, { freq: 95, freqEnd: 45, sweep: 0.2, drive: 2, gain: 1.4, attack: 0.001, dur: 0.35 });
    this.metal(out, t, { f0, ratios: [1, 1.71, 2.63, 3.9, 5.3], decay: 1.4, gain: 0.55, click: 1 });
    // ngân dài của vỏ xe như chuông bị gõ
    this.tone(out, t + 0.005, { freq: f0 * 2.02, gain: 0.07, attack: 0.002, dur: 1.6 });
    this.tone(out, t + 0.005, { freq: f0 * 3.31, gain: 0.04, attack: 0.002, dur: 1.1 });
    // mảnh vỡ & sơn tróc lả tả bên trong khoang, đồ đạc trong xe xô lệch lách cách
    this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.8, gain: 0.55, attack: 0.01, dur: 0.6 });
    for (let i = 0; i < 4; i++) this.metal(out, t + 0.12 + Math.random() * 0.5, { f0: 600 + Math.random() * 900, ratios: [1, 2.4], decay: 0.06, gain: 0.06, click: 0.3 });
    this.shellShock(heavy ? 0.85 : ammoType === 'AP' ? 0.6 : 0.7);
  }

  /**
   * Đạn bay sượt qua gần xe mình (không trúng). kind: 'mg' | 'cannon30' | 'shell' | 'missile'.
   * Đạn siêu thanh: tiếng "CHÁT" của sóng xung kích tới trước, rồi tiếng xé gió; tên lửa: động cơ gầm vụt qua (Doppler).
   */
  playFlyby(kind = 'shell', missDist = 30, pos = null) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const small = kind === 'mg' || kind === 'cannon30';
    if (small) {
      if (now - (this._lastFlybySmall || 0) < 0.06) return;
      this._lastFlybySmall = now;
    }
    const R = kind === 'mg' ? 45 : kind === 'cannon30' ? 55 : kind === 'missile' ? 110 : 90;
    const near = Math.max(0, 1 - missDist / R);
    const sp = this.spatial(0, pos);
    const out = this.voice({ gain: 0.3 + 0.7 * near, wet: 0.2, pan: sp.pan * 0.7 });
    const t = now;
    if (kind === 'missile') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 3200, freqEnd: 700, sweep: 0.7, gain: 0.9, attack: 0.18, dur: 0.6 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, gain: 0.9, attack: 0.15, dur: 0.7 });
      this.burst(out, t + 0.1, { filter: 'bandpass', freq: 1800, freqEnd: 600, sweep: 0.5, Q: 3, gain: 0.25, attack: 0.05, dur: 0.5 });
      return;
    }
    if (kind === 'mg') {
      this.snap(out, t, 0.55, 9000, 3);
      this.burst(out, t + 0.004, { filter: 'bandpass', freq: 3800, freqEnd: 1800, sweep: 0.06, Q: 2, gain: 0.25, attack: 0.002, dur: 0.06 });
      return;
    }
    if (kind === 'cannon30') {
      this.snap(out, t, 0.8, 8000, 4);
      this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2200, freqEnd: 700, sweep: 0.12, Q: 1.6, gain: 0.5, attack: 0.004, dur: 0.12 });
      return;
    }
    // Đạn pháo 120mm: "CHÁT" cực gắt + tiếng xé gió dày, trầm dần + luồng gió đẩy "phựt"
    this.snap(out, t, 1.3, 7000, 6);
    this.burst(out, t, { filter: 'bandpass', freq: 2600, Q: 0.8, drive: 3, gain: 0.5, attack: 0.0004, dur: 0.03 });
    this.burst(out, t + 0.005, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, freqEnd: 320, sweep: 0.35, Q: 1.4, drive: 2, gain: 0.9, attack: 0.02, dur: 0.38 });
    this.burst(out, t + 0.01, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, gain: 0.8 * near + 0.2, attack: 0.01, dur: 0.25 });
  }

  // ===========================================================================
  // 3. ĐẠN PHÁO RÍT LAO XUỐNG GẦN XE
  // ===========================================================================
  /**
   * Đạn pháo cầu vồng đang lao xuống gần xe mình: mỗi viên một kênh âm liên tục, game cập nhật mỗi khung hình
   * theo thời gian còn lại tới lúc chạm đất -> tiếng rít tụt cao độ (Doppler) + xé gió to dần, tắt đúng lúc nổ.
   * heavy: đạn 155mm (thêm tiếng gầm trầm "như tàu hỏa lao tới"); lead: số giây trước khi chạm đất thì bắt đầu nghe.
   */
  startIncoming(heavy = false, lead = 2) {
    if (!this.ready()) return null;
    this._incCount = this._incCount || 0;
    if (this._incCount >= 4) return null;   // mưa pháo: chỉ giữ vài viên gần nhất cho khỏi rối tai
    this._incCount++;
    const ctx = this.ctx, t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 1;
    let tail = master;
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); master.connect(pan); tail = pan; }
    tail.connect(this.weaponBus);
    if (this.reverb) { const send = ctx.createGain(); send.gain.value = 0.3; tail.connect(send); send.connect(this.reverb); }
    const loopSrc = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * 2); s.stop(t + lead + 6); return s; };
    const mkGain = (dest) => { const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(dest); return g; };
    // 1. Tiếng rít: dải rất hẹp, chao nhẹ theo nhịp đạn lắc khi bay (tiến động)
    const wSrc = loopSrc(this.pinkNoiseBuffer);
    const wF = ctx.createBiquadFilter(); wF.type = 'bandpass'; wF.Q.value = 16;
    const wF2 = ctx.createBiquadFilter(); wF2.type = 'bandpass'; wF2.Q.value = 6;
    const wG = mkGain(master);
    wSrc.connect(wF); wF.connect(wF2); wF2.connect(wG);
    const flut = ctx.createOscillator(); flut.frequency.value = 9 + Math.random() * 6;
    const flutD = ctx.createGain(); flutD.gain.value = 0;
    flut.connect(flutD); flutD.connect(wF.frequency); flutD.connect(wF2.frequency);
    flut.start(t); flut.stop(t + lead + 6);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const oG = mkGain(master);
    osc.connect(oG); flutD.connect(osc.frequency); osc.start(t); osc.stop(t + lead + 6);
    // 2. Xé gió: dải rộng, trầm dần
    const rSrc = loopSrc(this.pinkNoiseBuffer);
    const rF = ctx.createBiquadFilter(); rF.type = 'bandpass'; rF.Q.value = 0.9;
    const rG = mkGain(master);
    rSrc.connect(rF); rF.connect(rG);
    // 3. Đạn 155mm: tiếng gầm trầm cuộn tới
    let bG = null;
    if (heavy) {
      const bSrc = loopSrc(this.brownNoiseBuffer);
      const bF = ctx.createBiquadFilter(); bF.type = 'lowpass'; bF.frequency.value = 320;
      bG = mkGain(master);
      bSrc.connect(bF); bF.connect(bG);
    }
    const h = { heavy, lead, master, pan, wF, wF2, wG, osc, oG, flutD, rF, rG, bG, alive: true };
    this.updateIncoming(h, lead, 400, null);
    return h;
  }

  updateIncoming(h, timeLeft, impactDist, impactPos = null) {
    if (!h || !h.alive || !this.ctx) return;
    const t = this.ctx.currentTime, tc = 0.03;
    const x = Math.max(0, Math.min(1, 1 - timeLeft / h.lead));        // 0 lúc bắt đầu nghe -> 1 lúc chạm đất
    const near = Math.max(0, Math.min(1, 1 - impactDist / 520));      // rơi càng sát mình càng to, tụt cao độ càng mạnh
    const drop = 0.62 * Math.pow(x, 1.3) * (0.45 + 0.55 * near);
    const fw = (h.heavy ? 1650 : 2350) * (1 - drop);
    h.wF.frequency.setTargetAtTime(fw, t, tc);
    h.wF2.frequency.setTargetAtTime(fw * 1.02, t, tc);
    h.osc.frequency.setTargetAtTime(fw, t, tc);
    h.flutD.gain.setTargetAtTime(fw * 0.025, t, tc);
    h.rF.frequency.setTargetAtTime((h.heavy ? 1000 : 1500) * (1 - 0.6 * x), t, tc);
    const L = (0.12 + 0.88 * x * x) * (0.3 + 0.7 * near);
    h.wG.gain.setTargetAtTime(Math.max(0.0001, L * 3.2), t, tc);
    h.oG.gain.setTargetAtTime(Math.max(0.0001, L * 0.035), t, tc);
    h.rG.gain.setTargetAtTime(Math.max(0.0001, L * (h.heavy ? 1.3 : 0.9) * (0.25 + 0.75 * x)), t, tc);
    if (h.bG) h.bG.gain.setTargetAtTime(Math.max(0.0001, L * 2.2 * x * x), t, tc);
    if (h.pan && impactPos) {
      const me = window.game && window.game.player;
      if (me) {
        const dx = impactPos.x - me.x, dz = impactPos.z - me.z;
        h.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, dx / (Math.abs(dx) + Math.abs(dz) + 60))), t, 0.05);
      }
    }
  }

  // Đạn chạm đất / nổ trên không / biến mất: cắt tiếng ngay (tiếng nổ thay thế)
  stopIncoming(h) {
    if (!h || !h.alive || !this.ctx) return;
    h.alive = false;
    this._incCount = Math.max(0, (this._incCount || 1) - 1);
    const t = this.ctx.currentTime;
    h.master.gain.cancelScheduledValues(t);
    h.master.gain.setValueAtTime(h.master.gain.value, t);
    h.master.gain.linearRampToValueAtTime(0.0001, t + 0.03);
    setTimeout(() => { try { h.master.disconnect(); } catch (e) { /* đã ngắt */ } }, 200);
  }

  // Bản cũ: một tiếng rít ngắn cố định (giữ tương thích)
  /**
   * Đạn pháo đang lao xuống gần xe mình. distImpact: khoảng cách từ xe tới điểm rơi dự đoán;
   * timeToImpact: số giây còn lại tới lúc chạm đất — tiếng được canh để lên đỉnh và tắt ĐÚNG lúc nổ;
   * opts: { heavy (155mm), pos (điểm rơi, để nghe trái/phải) }.
   * Trả về handle { stop() } để cắt ngay khi đạn nổ (phòng điểm rơi thực khác dự đoán).
   * Tiếng thật: tiếng xé gió "xèèè" dày dần (không phải tiếng huýt sáo trong phim), cao độ tụt dần khi đạn tới gần;
   * đạn cỡ lớn có thêm tiếng gầm trầm như tàu hỏa lao tới; vài phần mười giây cuối dồn dập to vọt.
   */
  playIncomingWhistle(distImpact, timeToImpact = 0.8, opts = {}) {
    if (!this.ready() || distImpact > 520) return null;
    const now = this.ctx.currentTime;
    if (now - this.lastWhistleTime < 0.15) return null;
    this.lastWhistleTime = now;
    const ctx = this.ctx;
    const heavy = !!opts.heavy;
    const T = Math.max(0.35, Math.min(3, timeToImpact));
    const t0 = now, t1 = now + T;
    const near = Math.max(0, 1 - distImpact / 520);
    const sp = this.spatial(0, opts.pos || null);
    const out = this.voice({ bus: this.weaponBus, gain: 0.35 + 0.65 * near, wet: 0.2, pan: sp.pan * 0.8 });
    const nodes = [];
    const gains = [];
    // lớp nhiễu quét tần: to dần theo hàm mũ (đạn mỗi lúc một gần), tụt cao độ, tắt cụt ở thời điểm nổ
    const swell = (buf, type, f0, f1, Q, peak, startK = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(f0, t0);
      f.frequency.exponentialRampToValueAtTime(f1, t1);
      f.Q.value = Q;
      const g = ctx.createGain();
      const ts = t0 + T * startK;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(peak * 0.12, ts + (t1 - ts) * 0.6);
      g.gain.exponentialRampToValueAtTime(peak, t1 - 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t0, Math.random() * 1.5);
      src.stop(t1 + 0.1);
      nodes.push(src);
      gains.push(g);
    };
    // Càng rơi sát xe, cao độ tụt càng sâu (Doppler rõ hơn)
    const drop = 0.5 - near * 0.2;
    // 1. Tiếng xé gió dải trung — thành phần chính
    swell(this.pinkNoiseBuffer, 'bandpass', heavy ? 1300 : 1800, (heavy ? 1300 : 1800) * drop, 1.6, heavy ? 1.6 : 1.3);
    // 2. Tiếng rít dải hẹp của đạn xoay (nghe như "huýt" nhẹ lẫn trong tiếng xé gió)
    swell(this.pinkNoiseBuffer, 'bandpass', heavy ? 2200 : 2900, (heavy ? 2200 : 2900) * drop, 11, heavy ? 1.1 : 1.0, 0.15);
    // 3. Đạn cỡ lớn: tiếng gầm trầm cuồn cuộn như tàu hỏa lao tới
    if (heavy) swell(this.brownNoiseBuffer, 'lowpass', 520, 220, 0.7, 1.5, 0.1);
    // 4. Vài phần mười giây cuối: luồng gió ép "vụt" dải cao bùng lên ngay trước tiếng nổ
    swell(this.noiseBuffer, 'highpass', 2600, 1800, 0.7, 0.35 * (0.4 + near), 0.75);
    return {
      stop: () => {
        const t = ctx.currentTime;
        for (const g of gains) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.02); }
        for (const n of nodes) { try { n.stop(t + 0.05); } catch (e) { /* đã dừng */ } }
      }
    };
  }

  // ===========================================================================
  // 4. NẠP ĐẠN TỰ ĐỘNG / NHẬN TIẾP TẾ
  // ===========================================================================
  playReloadDone() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.7, wet: 0.04 });
    // Đẩy đạn vào buồng nòng (trượt) rồi khối khóa nòng đóng (tiếng đục nặng)
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 1.0, gain: 0.18, attack: 0.03, dur: 0.16 });
    this.burst(out, t + 0.22, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2.5, gain: 0.9, attack: 0.001, dur: 0.12 });
    this.burst(out, t + 0.22, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1200, Q: 1.2, gain: 0.25, attack: 0.001, dur: 0.05 });
  }

  // ---------------------------------------------------------------------------
  // NẠP ĐẠN: chuỗi thao tác cơ khí chạy theo ĐÚNG đồng hồ nạp của xe
  // (trước đây mọi tiếng dồn vào 0,3 s lúc nạp xong, còn cả quãng chờ thì im lặng).
  // Mỗi bước là một "cue": { f } = tỉ lệ thời gian nạp tính từ lúc bắn, { before } = số giây TRƯỚC lúc sẵn sàng.
  // Tiếng khóa nòng đóng rơi đúng khoảnh khắc pháo sẵn sàng bắn.
  // ---------------------------------------------------------------------------

  // Khoang tháp pháo: hộp thép kín ~2 m -> phản xạ sớm 2-9 ms tạo màu "trong lòng xe", không phải hồi âm ngoài trời
  reloadCabin() {
    if (this.cabinBus) return this.cabinBus;
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.connect(this.weaponBus);
    // phản xạ chỉ tô màu dải trung - cao (dải trầm cộng đồng pha sẽ phồng tiếng đập lên vài dB)
    const refl = ctx.createBiquadFilter();
    refl.type = 'highpass';
    refl.frequency.value = 450;
    input.connect(refl);
    for (const [d, g] of [[0.0023, 0.3], [0.0041, 0.22], [0.0087, 0.15]]) {
      const dl = ctx.createDelay(0.05);
      dl.delayTime.value = d;
      const gg = ctx.createGain();
      gg.gain.value = g;
      refl.connect(dl);
      dl.connect(gg);
      gg.connect(this.weaponBus);
    }
    // vòng phản xạ qua lại giữa 2 vách thép (hồi tiếp nhẹ, vách hút bớt cao tần)
    const fb = ctx.createDelay(0.05);
    fb.delayTime.value = 0.0061;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 3200;
    const fbG = ctx.createGain();
    fbG.gain.value = 0.36;
    const fbOut = ctx.createGain();
    fbOut.gain.value = 0.3;
    refl.connect(fb);
    fb.connect(fbLp);
    fbLp.connect(fbG);
    fbG.connect(fb);
    fbLp.connect(fbOut);
    fbOut.connect(this.weaponBus);
    this.cabinBus = input;
    return input;
  }

  // Bộ "đồ nghề" âm thanh cơ khí cho một lần nạp (một kênh phát chung, đặt đúng phía người nạp đạn)
  reloadKit(tankType) {
    const ctx = this.ctx;
    const inside = tankType !== 'SCOUT';   // súng máy trinh sát nằm ngoài nóc xe
    // xe tăng: người nạp đạn ngồi bên TRÁI pháo; pháo tự hành / 6 nòng: máy nạp phía sau-phải
    const pan = tankType === 'ALL_ROUNDER' ? -0.3 : tankType === 'SCOUT' ? 0.05 : 0.18;
    const out = this.voice({ bus: inside ? this.reloadCabin() : this.weaponBus, gain: 0.6, pan, wet: inside ? 0.015 : 0.07 });
    const P = this.pinkNoiseBuffer, B = this.brownNoiseBuffer;
    const rnd = (a) => 1 + (Math.random() - 0.5) * a;
    // Nhiễu có đường bao giữ (attack - hold - release) cho tiếng kéo dài: trượt, thủy lực, mô-tơ
    const bed = (t, o) => {
      const src = ctx.createBufferSource();
      src.buffer = o.buffer || P;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
      f.Q.value = o.Q !== undefined ? o.Q : 1;
      const g = ctx.createGain();
      const a = Math.min(o.attack !== undefined ? o.attack : 0.02, o.dur * 0.5);
      const r = Math.min(o.release !== undefined ? o.release : 0.04, o.dur * 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain, t + a);
      g.gain.setValueAtTime(o.gain, t + o.dur - r);
      g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      const off = Math.random() * Math.max(0, src.buffer.duration - o.dur - 0.1);
      src.start(t, off);
      src.stop(t + o.dur + 0.05);
    };
    return {
      // Khối thép va nhau: lực đập trầm (theo khối lượng) + tiếng gõ đanh + các mode cộng hưởng bất hòa tắt dần
      clank: (t, { f0 = 600, mass = 0.5, g = 0.2, ring = 0.3, bright = 1 } = {}) => {
        this.burst(out, t, { buffer: B, filter: 'lowpass', freq: 140 + 280 * (1 - mass), drive: 1.6, gain: g * (1 + mass * 2.2), attack: 0.0008, dur: 0.05 + mass * 0.1 });
        this.burst(out, t, { buffer: P, filter: 'bandpass', freq: f0 * 1.6, Q: 1.4, gain: g * 0.7, attack: 0.0005, dur: 0.03 });
        this.burst(out, t, { filter: 'bandpass', freq: Math.min(7500, f0 * 4 * bright), Q: 1, gain: g * 0.45 * bright, attack: 0.0003, dur: 0.012 });
        if (ring > 0) this.metal(out, t + 0.001, { f0: f0 * rnd(0.06), ratios: [1, 2.32, 3.87, 5.95], decay: ring, gain: g * 0.3, click: 0 });
      },
      // Vật nặng mềm (vỏ liều phóng cháy được, đạn đặt lên khay lót): "thụp" đục, không ngân
      thud: (t, g = 0.12, f = 240) => {
        this.burst(out, t, { buffer: B, filter: 'lowpass', freq: f, drive: 1.4, gain: g * 2.2, attack: 0.002, dur: 0.09 });
        this.burst(out, t, { buffer: P, filter: 'bandpass', freq: f * 2.6, Q: 0.9, gain: g * 0.45, attack: 0.002, dur: 0.05 });
      },
      // Lẫy lò xo: 2 tiếng tách cách nhau 7-15 ms (nhả rồi sập) — đặc trưng của chốt cơ khí thật
      latch: (t, f = 2400, g = 0.1) => {
        const d = 0.007 + Math.random() * 0.008;
        this.burst(out, t, { filter: 'bandpass', freq: f * rnd(0.12), Q: 2.5, gain: g * 0.5, attack: 0.0003, dur: 0.01 });
        this.burst(out, t + d, { filter: 'bandpass', freq: f * 0.8 * rnd(0.12), Q: 2, gain: g, attack: 0.0003, dur: 0.018 });
        this.metal(out, t + d, { f0: f * 0.55, ratios: [1, 2.7], decay: 0.06, gain: g * 0.2, click: 0 });
      },
      // Kim loại trượt trên kim loại: tiếng rít ma sát dải hẹp + chuỗi tiếng vấp "lạch" ngẫu nhiên (stick-slip)
      scrape: (t, dur, f0, f1, g, grit = 1) => {
        bed(t, { freq: f0, freqEnd: f1, Q: 3, gain: g, attack: Math.min(0.03, dur * 0.3), release: dur * 0.3, dur });
        bed(t, { buffer: B, filter: 'lowpass', freq: f0 * 0.4, gain: g * 1.2, attack: dur * 0.2, release: dur * 0.3, dur });
        for (let x = Math.random() * 0.02; x < dur && grit > 0; x += 0.012 + Math.random() * 0.03 / grit) {
          this.burst(out, t + x, { filter: 'bandpass', freq: (f0 + (f1 - f0) * x / dur) * (2.2 + Math.random()), Q: 3, gain: g * grit * (0.25 + Math.random() * 0.45), attack: 0.0003, dur: 0.006 });
        }
      },
      // Dây đạn / xích đẩy chạy: chuỗi tiếng lách cách mắt xích, nhanh dần (acc > 1) hoặc đều
      chain: (t, dur, f, g, { gap = 0.03, acc = 1, ring = 0 } = {}) => {
        let x = 0, step = gap;
        while (x < dur) {
          const v = g * (0.55 + Math.random() * 0.45);
          this.burst(out, t + x, { buffer: P, filter: 'bandpass', freq: f * rnd(0.35), Q: 2.4, gain: v, attack: 0.0004, dur: 0.016 });
          this.burst(out, t + x, { filter: 'highpass', freq: f * 2, gain: v * 0.35, attack: 0.0002, dur: 0.005 });
          if (ring && Math.random() < 0.3) this.metal(out, t + x, { f0: ring * rnd(0.3), ratios: [1, 2.71], decay: 0.08, gain: v * 0.25, click: 0 });
          x += step * (0.6 + Math.random() * 0.8);
          step = Math.max(0.012, step / acc);
        }
      },
      // Mô-tơ điện / servo: tiếng rên cuộn dây (răng cưa qua lọc) + tiếng chổi than, lên - xuống tốc
      motor: (t, dur, f0, f1, g) => {
        this.tone(out, t, { type: 'sawtooth', freq: f0, freqEnd: f1, sweep: dur, filter: 'lowpass', filterFreq: 1200, Q: 1.5, gain: g, attack: Math.min(0.07, dur * 0.3), hold: dur * 0.75, dur: dur * 0.25 });
        this.tone(out, t, { type: 'sine', freq: f0 * 2, freqEnd: f1 * 2, sweep: dur, gain: g * 0.35, attack: Math.min(0.07, dur * 0.3), hold: dur * 0.75, dur: dur * 0.25 });
        bed(t, { freq: (f0 + f1) * 3, freqEnd: f1 * 6, Q: 2, gain: g * 0.6, attack: dur * 0.3, release: dur * 0.3, dur });
      },
      // Thủy lực: tiếng dầu xì qua van + bơm rền trầm
      hydraulic: (t, dur, g) => {
        bed(t, { freq: 2300 * rnd(0.1), freqEnd: 1700, Q: 1.3, gain: g, attack: 0.03, release: dur * 0.4, dur });
        bed(t, { buffer: B, filter: 'lowpass', freq: 170, Q: 0.8, gain: g * 1.4, attack: 0.05, release: dur * 0.4, dur });
      }
    };
  }

  // Kịch bản nạp đạn từng dòng xe (đồng hồ game: xe tăng 2,5 s, pháo tự hành 3 s, thay băng 4 s; xe hỏng nạp chậm thì giãn theo)
  reloadCues(tankType) {
    if (tankType === 'ARTILLERY') {
      // Pháo tự hành 155mm, máy nạp tự động (kiểu PzH 2000 / Archer). Khóa nòng mở + quạt hút khói đã có trong playCannonFire.
      return [
        { f: 0.36, play: (k, t) => {   // tay nạp thủy lực mở khóa, xoay ra ổ đạn
          k.latch(t, 2200, 0.08);
          k.hydraulic(t + 0.03, 0.45, 0.05);
          k.motor(t + 0.03, 0.45, 120, 190, 0.02);
          k.clank(t + 0.47, { f0: 300, mass: 0.6, g: 0.12, ring: 0.25 });
        } },
        { f: 0.55, play: (k, t) => {   // quả đạn 43 kg rơi vào khay nạp
          k.scrape(t, 0.09, 400, 300, 0.05, 0.6);
          k.clank(t + 0.08, { f0: 220, mass: 1, g: 0.17, ring: 0.35 });
        } },
        { before: 1.15, play: (k, t) => {   // xích đẩy đạn lao tới, đai dẫn hướng cắm vào rãnh xoắn "KẲNG"
          k.motor(t, 0.34, 300, 900, 0.035);
          k.chain(t, 0.32, 1400, 0.06, { gap: 0.045, acc: 1.12 });
          k.clank(t + 0.32, { f0: 480, mass: 0.8, g: 0.2, ring: 0.6, bright: 1.3 });
        } },
        { before: 0.72, play: (k, t) => {   // xích đẩy rút về
          k.motor(t, 0.22, 700, 300, 0.025);
          k.chain(t, 0.2, 1200, 0.035, { gap: 0.02 });
        } },
        { before: 0.5, play: (k, t) => {   // 2 khối liều phóng được đẩy vào sau đạn: "thụp - thụp" đục
          k.scrape(t, 0.12, 900, 1300, 0.025, 0.4);
          k.thud(t + 0.04, 0.11, 230);
          k.thud(t + 0.17, 0.1, 250);
        } },
        { before: 0.04, play: (k, t) => {   // khối khóa nòng trượt lên đóng sập + nạp hạt lửa + rơ-le sẵn sàng
          k.hydraulic(Math.max(this.ctx.currentTime, t - 0.06), 0.12, 0.04);
          k.scrape(t, 0.04, 800, 1300, 0.04, 0.5);
          k.clank(t + 0.04, { f0: 300, mass: 1, g: 0.24, ring: 0.6 });
          k.latch(t + 0.16, 2800, 0.07);
          k.latch(t + 0.27, 3400, 0.035);
        } }
      ];
    }
    if (tankType === 'GATLING') {
      // Pháo 30mm: thay thùng đạn dây 300 viên. Mô-tơ quay nòng hãm dần đã do updateGatlingMotor phát.
      return [
        { f: 0, play: (k, t) => {   // khóa nòng giữ lùi, chốt hãm cụm nòng
          k.clank(t + 0.05, { f0: 900, mass: 0.3, g: 0.12, ring: 0.2 });
          k.latch(t + 0.18, 2000, 0.07);
        } },
        { f: 0.08, play: (k, t) => {   // mở 2 lẫy nắp thùng đạn bọc giáp, nắp bản lề rít rồi tì vào chặn
          k.latch(t, 2000, 0.09);
          k.latch(t + 0.13, 1900, 0.09);
          k.scrape(t + 0.2, 0.2, 1600, 2300, 0.02, 0.3);
          k.clank(t + 0.4, { f0: 700, mass: 0.4, g: 0.12, ring: 0.3 });
        } },
        { f: 0.2, play: (k, t) => k.chain(t, 0.36, 1300, 0.05, { gap: 0.03, ring: 1500 }) },   // rút đuôi dây đạn cũ
        { f: 0.32, play: (k, t) => {   // thùng đạn mới (nặng) trượt vào khay, tì cữ, khóa
          k.scrape(t, 0.34, 300, 430, 0.07, 0.8);
          k.clank(t + 0.35, { f0: 260, mass: 0.9, g: 0.2, ring: 0.25 });
          k.latch(t + 0.52, 2200, 0.08);
        } },
        { f: 0.5, play: (k, t) => {   // luồn đầu dây đạn vào máng tiếp đạn
          k.chain(t, 0.45, 1200, 0.055, { gap: 0.026, ring: 1400 });
          k.latch(t + 0.48, 2500, 0.06);
        } },
        { f: 0.66, play: (k, t) => {   // đóng sập nắp, cài 2 lẫy
          k.clank(t, { f0: 650, mass: 0.5, g: 0.16, ring: 0.3 });
          k.latch(t + 0.13, 2000, 0.08);
          k.latch(t + 0.24, 1900, 0.08);
        } },
        { before: 0.78, play: (k, t) => {   // mô-tơ tiếp đạn kéo dây đạn chạy đều trong máng
          k.motor(t, 0.52, 300, 900, 0.035);
          k.chain(t + 0.05, 0.45, 1500, 0.045, { gap: 0.024 });
        } },
        { before: 0.03, play: (k, t) => {   // viên đầu vào buồng, khóa nòng đóng
          k.clank(t + 0.03, { f0: 1000, mass: 0.4, g: 0.16, ring: 0.25 });
          k.latch(t + 0.14, 3000, 0.04);
        } }
      ];
    }
    if (tankType === 'SCOUT') {
      // Súng máy 12.7mm trên nóc: thay hộp 100 viên, lên đạn tay 2 lần như súng thật
      const charge = (k, t) => {   // kéo tay lên đạn (lò xo nén, rít cao dần) tới cữ sau
        k.scrape(t, 0.14, 1100, 2600, 0.06, 1.2);
        k.clank(t + 0.15, { f0: 1400, mass: 0.3, g: 0.13, ring: 0.2 });
      };
      const slam = (k, t) => {   // nhả tay: bệ khóa nòng lao về đóng sập
        k.scrape(t, 0.03, 2400, 1600, 0.05, 0.5);
        k.clank(t + 0.03, { f0: 1100, mass: 0.45, g: 0.16, ring: 0.3 });
      };
      return [
        { f: 0, play: (k, t) => {   // ấn lẫy, nắp hộp khóa nòng bật lên tì vào chặn
          k.latch(t, 2600, 0.1);
          k.scrape(t + 0.02, 0.06, 2000, 2800, 0.03, 0.5);
          k.clank(t + 0.09, { f0: 1300, mass: 0.2, g: 0.1, ring: 0.25 });
        } },
        { f: 0.06, play: (k, t) => k.chain(t, 0.22, 2200, 0.04, { gap: 0.028, ring: 3000 }) },   // rút mắt xích còn sót
        { f: 0.15, play: (k, t) => {   // mở 2 lẫy hộp rỗng, nhấc ra, đặt xuống nóc xe kêu "bộp" rỗng
          k.latch(t, 2300, 0.08);
          k.latch(t + 0.1, 2200, 0.08);
          k.scrape(t + 0.16, 0.14, 700, 900, 0.03, 0.6);
          k.clank(t + 0.34, { f0: 520, mass: 0.3, g: 0.1, ring: 0.4 });
        } },
        { f: 0.33, play: (k, t) => {   // hộp đầy ~16 kg đặt vào giá, cài lẫy
          k.scrape(t, 0.12, 400, 600, 0.04, 0.7);
          k.clank(t + 0.12, { f0: 450, mass: 0.7, g: 0.16, ring: 0.2 });
          k.latch(t + 0.28, 2400, 0.08);
        } },
        { f: 0.47, play: (k, t) => {   // bật nắp hộp đạn, kéo dây đạn ra
          k.latch(t, 2600, 0.07);
          k.scrape(t + 0.04, 0.12, 1400, 1900, 0.015, 0.3);
          k.chain(t + 0.2, 0.3, 1900, 0.05, { gap: 0.026, ring: 2800 });
        } },
        { f: 0.6, play: (k, t) => {   // đặt viên đầu vào khay tiếp đạn, đập nắp xuống
          k.clank(t, { f0: 1600, mass: 0.15, g: 0.05, ring: 0.15 });
          k.clank(t + 0.16, { f0: 1200, mass: 0.4, g: 0.2, ring: 0.3 });
          k.latch(t + 0.17, 2800, 0.06);
        } },
        { before: 1.2, play: charge },
        { before: 0.75, play: slam },
        { before: 0.6, play: charge },
        { before: 0.03, play: slam }
      ];
    }
    // Xe tăng 120mm, người nạp đạn: khóa nòng mở + đế vỏ đạn rơi đã có trong playCannonFire (0,75 / 0,95 s)
    return [
      { f: 0.4, play: (k, t) => {   // gạt công tắc gối, cửa chống nổ khoang đạn trượt mở bằng thủy lực
        k.latch(t, 2400, 0.07);
        k.hydraulic(t + 0.02, 0.26, 0.045);
        k.scrape(t + 0.03, 0.22, 300, 420, 0.05, 0.6);
        k.clank(t + 0.25, { f0: 260, mass: 0.7, g: 0.14, ring: 0.25 });
      } },
      { f: 0.52, play: (k, t) => {   // rút quả đạn khỏi ống chứa: vỏ cháy được miết vào ống, đáy thép chạm mép
        k.scrape(t, 0.3, 700, 1150, 0.05, 0.9);
        k.clank(t + 0.3, { f0: 1500, mass: 0.1, g: 0.05, ring: 0.12 });
      } },
      { f: 0.66, play: (k, t) => {   // cửa chống nổ đóng sập
        k.hydraulic(t, 0.2, 0.04);
        k.scrape(t + 0.01, 0.2, 420, 300, 0.05, 0.6);
        k.clank(t + 0.21, { f0: 240, mass: 0.85, g: 0.17, ring: 0.3 });
      } },
      { before: 0.62, play: (k, t) => {   // đặt đạn lên khay sau khóa nòng
        k.thud(t, 0.09, 260);
        k.scrape(t + 0.02, 0.08, 900, 700, 0.025, 0.5);
      } },
      { before: 0.36, play: (k, t) => {   // đấm đạn vào buồng: trượt nhanh dần, đáy đạn chạm buồng "thộc"
        k.scrape(t, 0.25, 600, 1700, 0.07, 1);
        k.clank(t + 0.26, { f0: 420, mass: 0.7, g: 0.14, ring: 0.12 });
      } },
      { before: 0.035, play: (k, t) => {   // khối khóa nòng bật lên đóng sập "CHÁNG", gạt an toàn, rơ-le sẵn sàng
        k.scrape(t, 0.035, 900, 1400, 0.05, 0.5);
        k.clank(t + 0.035, { f0: 330, mass: 1, g: 0.22, ring: 0.55, bright: 1.2 });
        k.latch(t + 0.13, 2600, 0.07);
        k.latch(t + 0.2, 3300, 0.035);
      } }
    ];
  }

  // Gọi mỗi khung hình khi xe của người chơi đang nạp (remaining = thời gian nạp còn lại, total = tổng thời gian nạp).
  // Hẹn trước tối đa 60 ms bằng đồng hồ âm thanh nên tiếng đúng nhịp, không giật theo khung hình.
  updateReload(tankType, remaining, total) {
    if (!this.ready() || !(total > 0)) return;
    let r = this._reload;
    if (!r || r.type !== tankType || remaining > r.last + 1e-4) {
      r = this._reload = { type: tankType, cues: this.reloadCues(tankType), done: [], kit: null, last: remaining };
    }
    r.last = remaining;
    const elapsed = total - Math.max(0, remaining);
    const now = this.ctx.currentTime;
    r.cues.forEach((c, i) => {
      if (r.done[i]) return;
      const at = c.f !== undefined ? c.f * total : Math.max(0, total - c.before);
      if (at - elapsed > 0.06 && remaining > 0) return;
      r.done[i] = true;
      if (at < elapsed - 0.3) return;   // đã qua từ lâu (khung hình bị khựng) — bỏ, không phát dồn
      if (!r.kit) r.kit = this.reloadKit(tankType);
      c.play(r.kit, now + Math.max(0, at - elapsed));
    });
  }

  // Tương thích cũ (phòng thử xe): phát nửa đầu ('start') hoặc nửa cuối ('end') của chuỗi nạp ngay lập tức
  playReload(tankType = 'ALL_ROUNDER', stage = 'end') {
    if (!this.ready()) return;
    const total = (tankType === 'GATLING' || tankType === 'SCOUT') ? 4 : tankType === 'ARTILLERY' ? 3 : 2.5;
    const cues = this.reloadCues(tankType)
      .map(c => ({ at: c.f !== undefined ? c.f * total : total - c.before, play: c.play }))
      .filter(c => (stage === 'start') === (c.at < total * 0.5));
    if (!cues.length) return;
    const t0 = Math.min(...cues.map(c => c.at));
    const kit = this.reloadKit(tankType);
    const now = this.ctx.currentTime;
    for (const c of cues) c.play(kit, now + c.at - t0);
  }

  // Nòng 6 nòng nguội lại: chỉ còn tiếng rơ-le điện khẽ + xì hơi nóng tắt dần (không có tiếng nạp đạn)
  playGatlingCooled() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.3, wet: 0.03 });
    this.metal(out, t, { f0: 1800, ratios: [1, 2.1], decay: 0.04, gain: 0.03, click: 0.15 });
    this.burst(out, t, { filter: 'highpass', freq: 4000, gain: 0.03, attack: 0.05, dur: 0.6 });
  }

  // Va chạm kim loại tổng quát (giữ tương thích API cũ)
  playMetalClank(delay = 0, volume = 0.5, freq = 440) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const out = this.voice({ bus: this.weaponBus, gain: 1, wet: 0.05 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: Math.max(300, Math.min(2000, freq * 2)), Q: 1.1, drive: 2, gain: volume * 0.8, attack: 0.001, dur: 0.07 });
  }

  // ===========================================================================
  // 5. ĐIỆN TỬ TRONG XE (cảnh báo, khóa mục tiêu, bộ đàm) — qua dải tần tai nghe nội bộ
  // ===========================================================================
  headset(gain = 1) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = gain;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    input.connect(hp);
    hp.connect(lp);
    lp.connect(this.uiBus);
    return input;
  }

  // Cảnh báo bị radar phản pháo khóa (giống thiết bị cảnh báo radar quân sự)
  playRadarAlert() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    for (let i = 0; i < 6; i++) {
      this.tone(out, t + i * 0.075, { type: 'square', freq: i % 2 ? 1250 : 950, gain: 0.09, attack: 0.002, hold: 0.06, dur: 0.01 });
    }
  }

  playRadarProximityBeep(urgency = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    const f = urgency > 1.5 ? 1600 : 1200;
    this.tone(out, t, { freq: f, gain: 0.16, attack: 0.004, hold: 0.05, dur: 0.03 });
    if (urgency > 1.5) this.tone(out, t + 0.1, { freq: f, gain: 0.16, attack: 0.004, hold: 0.05, dur: 0.03 });
  }

  // Đếm ngược vào trận: n = 3/2/1 bíp ngắn, n = 0 tiếng xuất kích dài + trầm
  playCountdownTick(n) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.8, wet: 0.3 });
    if (n > 0) {
      this.tone(out, t, { freq: 880, gain: 0.16, attack: 0.003, hold: 0.11, dur: 0.08 });
      return;
    }
    this.tone(out, t, { freq: 1320, gain: 0.15, attack: 0.003, hold: 0.42, dur: 0.3 });
    this.tone(out, t, { freq: 660, gain: 0.1, attack: 0.003, hold: 0.42, dur: 0.3 });
    this.tone(out, t, { type: 'triangle', freq: 110, gain: 0.22, attack: 0.005, hold: 0.25, dur: 0.4 });
  }

  // Bộ dò khóa mục tiêu đang bám (tiếng "gừ" của đầu dò)
  playTargetLockSound() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    for (let i = 0; i < 3; i++) {
      this.tone(out, t + i * 0.07, { type: 'square', freq: 820, gain: 0.07, attack: 0.003, hold: 0.04, dur: 0.01, filter: 'lowpass', filterFreq: 1800 });
    }
  }

  // Khóa mục tiêu thành công: tiếng khóa liền mạch
  playTargetLockAcquired() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    this.tone(out, t, { type: 'square', freq: 1640, gain: 0.07, attack: 0.004, hold: 0.32, dur: 0.03, filter: 'lowpass', filterFreq: 3000 });
  }

  playTargetLost() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    this.tone(out, t, { freq: 1100, gain: 0.12, attack: 0.004, hold: 0.09, dur: 0.02 });
    this.tone(out, t + 0.13, { freq: 740, gain: 0.12, attack: 0.004, hold: 0.12, dur: 0.03 });
  }

  // Đổi loại đạn: cơ cấu thật của từng loại (âm thanh cơ khí từ nhiễu lọc)
  //  pháo chính: khay chọn đạn trượt + chốt; súng máy: gạt bộ chọn băng; tên lửa: mô-tơ mở nắp ống phóng + chốt
  playAmmoSwitch(ammoType = 'NORMAL') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.45, wet: 0.04 });
    const clack = (tt, f, g) => {
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, Q: 1.8, gain: g, attack: 0.0006, dur: 0.03 });
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: g * 1.2, attack: 0.001, dur: 0.05 });
    };
    if (ammoType === 'ANTI_TANK_MISSILE') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, freqEnd: 1300, sweep: 0.32, Q: 8, gain: 0.07, attack: 0.08, dur: 0.32 });
      clack(t + 0.34, 1300, 0.16);
      // đầu dò bật nguồn: tiếng rít điện tử khẽ qua tai nghe
      this.tone(this.headset(0.6), t + 0.42, { type: 'sine', freq: 2400, freqEnd: 3100, sweep: 0.18, gain: 0.025, attack: 0.02, hold: 0.12, dur: 0.06 });
    } else if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY') {
      clack(t, 2100, 0.12);
      clack(t + 0.07, 1500, 0.1);
    } else {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, freqEnd: 950, sweep: 0.16, Q: 2.4, gain: 0.07, attack: 0.01, dur: 0.16 });
      clack(t + 0.18, 1100, 0.16);
    }
  }

  // Đầu dò tên lửa đang bám mục tiêu: tiếng "gừ" ngắt quãng, cao dần khi gần khóa xong (progress 0..1)
  playMissileSeek(progress = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    const f = 420 + progress * 380;
    this.tone(out, t, { type: 'sawtooth', freq: f, gain: 0.05, attack: 0.004, hold: 0.07, dur: 0.02, filter: 'lowpass', filterFreq: 1500, vibrato: 38, vibratoDepth: f * 0.06 });
  }

  // Đầu dò đã khóa chắc mục tiêu: tiếng "tít" liền, cao và sạch
  playMissileLock() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.85);
    this.tone(out, t, { type: 'square', freq: 1900, gain: 0.06, attack: 0.004, hold: 0.42, dur: 0.04, filter: 'lowpass', filterFreq: 3200 });
  }

  // Đã khóa, chờ phóng: nhắc khẽ để biết vẫn đang giữ khóa
  playMissileLockHold() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    this.tone(this.headset(0.6), t, { type: 'square', freq: 1900, gain: 0.03, attack: 0.003, hold: 0.06, dur: 0.02, filter: 'lowpass', filterFreq: 3200 });
  }

  // Máy báo bị chiếu laser: m = 1 khóa súng (2 tiếng trầm-cao), m = 2 tia dẫn tên lửa (3 tiếng nhanh, cao hơn)
  playLockWarning(m = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    if (m === 2) {
      for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.09, { type: 'square', freq: 1500, gain: 0.07, attack: 0.002, hold: 0.05, dur: 0.01, filter: 'lowpass', filterFreq: 3000 });
    } else {
      this.tone(out, t, { type: 'square', freq: 880, gain: 0.06, attack: 0.002, hold: 0.08, dur: 0.01, filter: 'lowpass', filterFreq: 2400 });
      this.tone(out, t + 0.12, { type: 'square', freq: 1175, gain: 0.06, attack: 0.002, hold: 0.08, dur: 0.01, filter: 'lowpass', filterFreq: 2400 });
    }
  }

  // Tên lửa đang lao tới: tiếng báo động chói, game gọi dồn dập dần khi tên lửa tới gần (urgency 0..1)
  playMissileWarning(urgency = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(1.0);
    const f = 1700 + urgency * 500;
    this.tone(out, t, { type: 'square', freq: f, freqEnd: f * 0.82, sweep: 0.07, gain: 0.09, attack: 0.002, hold: 0.06, dur: 0.01, filter: 'lowpass', filterFreq: 3600 });
  }

  // Bộ đàm: tiếng xẹt mở kênh + tiếng bíp xác nhận + xẹt đóng kênh
  playRadioChirp() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    this.burst(out, t, { filter: 'bandpass', freq: 1900, Q: 0.8, gain: 0.12, dur: 0.07 });
    this.tone(out, t + 0.07, { freq: 1450, gain: 0.08, attack: 0.003, hold: 0.06, dur: 0.02 });
    this.burst(out, t + 0.16, { filter: 'bandpass', freq: 2300, Q: 0.8, gain: 0.08, dur: 0.12 });
  }

  // Quét radar trinh sát: xung phát + tiếng dội về
  playReconPing() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.8, wet: 0.7 });
    this.tone(out, t, { freq: 1480, gain: 0.12, attack: 0.003, hold: 0.04, dur: 0.25 });
    this.tone(out, t + 0.32, { freq: 1480, gain: 0.04, attack: 0.003, hold: 0.03, dur: 0.2 });
  }

  // Kèn đồng chiến thắng: hợp âm trưởng phồng dần, âm sắc kèn đồng
  playVictoryFanfare() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.5, wet: 0.5 });
    const notes = [[261.6, 0], [329.6, 0.18], [392.0, 0.36], [523.3, 0.54]];
    for (const [f, d] of notes) {
      for (const det of [-4, 4]) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(600, t + d);
        lp.frequency.linearRampToValueAtTime(2600, t + d + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.linearRampToValueAtTime(0.09, t + d + 0.08);
        g.gain.setValueAtTime(0.09, t + 1.6);
        g.gain.setTargetAtTime(0.0001, t + 1.6, 0.25);
        osc.connect(lp);
        lp.connect(g);
        g.connect(out);
        osc.start(t + d);
        osc.stop(t + 2.8);
      }
    }
  }

  // Lá cây, cành nhỏ cọ xát khi xe lách vào bụi rậm
  playBushRustle() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.vehicleBus, gain: 0.9, wet: 0.1 });
    this.burst(out, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3600, Q: 0.6, gain: 1.6, attack: 0.06, dur: 0.5 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 700, Q: 0.9, gain: 0.16, attack: 0.08, dur: 0.38 });
    if (Math.random() < 0.5) this.snap(out, t + 0.05 + Math.random() * 0.2, 0.12, 5000, 1.5);
  }

  // ===========================================================================
  // 6. ĐỘNG CƠ DIESEL, TURBO, XÍCH SẮT / LỐP XE
  // ===========================================================================
  setupEngineAndTrackSound() {
    try {
      const ctx = this.ctx;
      const e = {};

      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(this.vehicleBus);

      // Kênh riêng của tiếng máy: cắt siêu trầm dưới ~55 Hz (2 tầng) — phần dưới đó loa / tai nghe chỉ phát thành
      // tiếng "ù ù" đè nén, không làm tiếng máy dày hơn
      const eout = ctx.createGain();
      eout.gain.value = 1;
      e.habit = eout;   // giảm dần khi đứng chờ lâu (tai quen tiếng máy)
      const hp1 = ctx.createBiquadFilter();
      hp1.type = 'highpass';
      hp1.frequency.value = 55;
      hp1.Q.value = 0.6;
      const hp2 = ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = 45;
      hp2.Q.value = 0.6;
      // Cắt dải trên ~2 kHz: máy diesel nghe qua thân xe là tiếng gầm trầm-trung; để nguyên dải 1-4 kHz rung theo nhịp nổ
      // (55-180 Hz, đúng cao độ giọng người) thì tai nghe thành tiếng "è è" kèn kazoo / còi rè
      const lpOut = ctx.createBiquadFilter();
      lpOut.type = 'lowpass';
      lpOut.frequency.value = 1800;
      lpOut.Q.value = 0.5;
      // "ngực" của tiếng máy: nhấn dải 90-160 Hz — vùng loa / tai nghe thường vẫn phát được, nghe ra sức nặng khối máy
      const chest = ctx.createBiquadFilter();
      chest.type = 'peaking';
      chest.frequency.value = 120;
      chest.Q.value = 0.8;
      chest.gain.value = 5;
      eout.connect(hp1);
      hp1.connect(hp2);
      hp2.connect(chest);
      chest.connect(lpOut);
      lpOut.connect(out);
      e.hp1 = hp1;
      e.hp2 = hp2;

      // Đồng hồ nhịp nổ xi-lanh (răng cưa): KHÔNG phát trực tiếp — chỉ tạo xung phụt ống xả / gõ kim phun.
      // Phát thẳng răng cưa (đủ mọi họa âm, đều tăm tắp) nghe thành tiếng "è è" như kèn
      e.fire = ctx.createOscillator();
      e.fire.type = 'sawtooth';
      e.fire.frequency.value = 28;
      e.crank = ctx.createOscillator();
      e.crank.type = 'sine';
      e.crank.frequency.value = 27;
      // 2 tầng thông thấp không cộng hưởng cho thân tiếng máy (bậc trục khuỷu bên dưới)
      e.engineFilter = ctx.createBiquadFilter();
      e.engineFilter.type = 'lowpass';
      e.engineFilter.frequency.value = 380;
      e.engineFilter.Q.value = 0.7;
      e.engineFilter2 = ctx.createBiquadFilter();
      e.engineFilter2.type = 'lowpass';
      e.engineFilter2.frequency.value = 380;
      e.engineFilter2.Q.value = 0.5;
      e.engineFilter.connect(e.engineFilter2);
      e.engineGain = ctx.createGain();
      e.engineGain.gain.value = 0.0;

      // Máy thật không nổ đều tuyệt đối: mỗi xi-lanh, mỗi lần phun hơi khác nhau -> vòng tua chao nhẹ ngẫu nhiên
      // và biên độ từng nhát nổ dao động. Dùng nhiễu lọc chậm (không tuần hoàn, nên không thành tiếng "phạch phạch" trực thăng)
      const jit = ctx.createBufferSource();
      jit.buffer = this.pinkNoiseBuffer;
      jit.loop = true;
      const jitF = ctx.createBiquadFilter();
      jitF.type = 'lowpass';
      jitF.frequency.value = 7;
      e.jitterDepth = ctx.createGain();
      e.jitterDepth.gain.value = 0;
      jit.connect(jitF);
      jitF.connect(e.jitterDepth);
      e.jitterDepth.connect(e.fire.frequency);
      const jitHalf = ctx.createGain();
      jitHalf.gain.value = 0.5;
      e.jitterDepth.connect(jitHalf);
      jitHalf.connect(e.crank.frequency);
      const rough = ctx.createBufferSource();
      rough.buffer = this.pinkNoiseBuffer;
      rough.loop = true;
      const roughF = ctx.createBiquadFilter();
      roughF.type = 'lowpass';
      roughF.frequency.value = 22;
      const roughDepth = ctx.createGain();
      roughDepth.gain.value = 3.5;
      e.roughDepth = roughDepth;
      const engAm = ctx.createGain();
      engAm.gain.value = 1;
      rough.connect(roughF);
      roughF.connect(roughDepth);
      roughDepth.connect(engAm.gain);
      // Thân tiếng máy: các BẬC của trục khuỷu (0.5, 1, 1.5, 2, 3, 4 × tần số nổ) bằng sóng sin tròn, mỗi bậc to nhỏ
      // chậm ngẫu nhiên. Răng cưa (đủ mọi họa âm, đều tăm tắp) nghe thành tiếng "è è" kèn; nhiễu dải hẹp điều biên theo
      // nhịp nổ nghe thành "rè rè" loa rè. Bậc nửa (0.5) cho tiếng "lục bục" lệch nhịp đặc trưng của máy nhiều xi-lanh
      const ORD = [[0.5, 0.3], [1, 1], [1.5, 0.35], [2, 0.6], [3, 0.3], [4, 0.14]];
      e.orders = [];
      const bank = ctx.createGain();
      bank.gain.value = 0.5;
      ORD.forEach(([k, a], i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 60 * k;
        const jg = ctx.createGain();
        jg.gain.value = k;
        e.jitterDepth.connect(jg);
        jg.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = a;
        const n = ctx.createBufferSource();
        n.buffer = this.pinkNoiseBuffer;
        n.loop = true;
        n.playbackRate.value = 0.71 + i * 0.13;
        const nf = ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = 3 + i * 1.3;
        const nd = ctx.createGain();
        nd.gain.value = a * 7;
        n.connect(nf);
        nf.connect(nd);
        nd.connect(g.gain);
        o.connect(g);
        g.connect(bank);
        o.start();
        n.start(0, i * 0.37);
        e.orders.push({ o, k });
      });
      bank.connect(e.engineFilter);
      e.engineFilter2.connect(engAm);
      engAm.connect(e.engineGain);
      e.engineGain.connect(eout);

      // Xung theo nhịp nổ (răng cưa -> xung hẹp) dùng để "phụt" ống xả & gõ kim phun đúng từng nhát nổ
      const pulseShape = ctx.createWaveShaper();
      const pc = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; pc[i] = x > 0.55 ? Math.pow((x - 0.55) / 0.45, 1.5) : 0; }
      pulseShape.curve = pc;
      e.fire.connect(pulseShape);

      // Tiếng cháy nổ thô ráp: nhiễu hồng điều biên theo nhịp nổ
      const comb = ctx.createBufferSource();
      comb.buffer = this.pinkNoiseBuffer;
      comb.loop = true;
      const combF = ctx.createBiquadFilter();
      combF.type = 'bandpass';
      combF.frequency.value = 450;
      combF.Q.value = 0.5;
      e.combFilter = combF;
      e.combAm = ctx.createGain();
      e.combAm.gain.value = 0.5;
      e.combLfoDepth = ctx.createGain();
      e.combLfoDepth.gain.value = 0.08;
      e.fire.connect(e.combLfoDepth);
      e.combLfoDepth.connect(e.combAm.gain);
      e.combGain = ctx.createGain();
      e.combGain.gain.value = 0;
      comb.connect(combF);
      combF.connect(e.combAm);
      e.combAm.connect(e.combGain);
      e.combGain.connect(eout);

      // Tiếng gõ "lạch cạch" đặc trưng của máy diesel (kim phun, xu-páp): nhiễu dải trung-cao gõ theo từng nhát nổ,
      // nghe rõ nhất lúc không tải, bị tiếng gầm lấn át khi vòng tua cao
      const clk = ctx.createBufferSource();
      clk.buffer = this.noiseBuffer;
      clk.loop = true;
      const clkF = ctx.createBiquadFilter();
      clkF.type = 'bandpass';
      clkF.frequency.value = 1500;
      clkF.Q.value = 0.9;
      const clkAm = ctx.createGain();
      clkAm.gain.value = 0;
      pulseShape.connect(clkAm.gain);
      // mỗi nhát gõ to nhỏ ngẫu nhiên (có nhát gần như mất): gõ đều tăm tắp từng nhịp nổ chính là thứ tạo tiếng "è è"
      const clkRnd = ctx.createGain();
      clkRnd.gain.value = 0.45;
      const clkRndDepth = ctx.createGain();
      clkRndDepth.gain.value = 9;
      roughF.connect(clkRndDepth);
      clkRndDepth.connect(clkRnd.gain);
      e.clatterGain = ctx.createGain();
      e.clatterGain.gain.value = 0;
      e.clatterFilter = clkF;
      clk.connect(clkF);
      clkF.connect(clkAm);
      clkAm.connect(clkRnd);
      clkRnd.connect(e.clatterGain);
      e.clatterGain.connect(eout);

      // Turbo rít nhẹ theo vòng tua
      e.turbo = ctx.createOscillator();
      e.turbo.type = 'sine';
      e.turbo.frequency.value = 1800;
      e.turboGain = ctx.createGain();
      e.turboGain.gain.value = 0;
      e.turbo.connect(e.turboGain);
      e.turboGain.connect(out);

      // Ống xả: luồng khí phụt từng nhát theo nhịp nổ ("phụt phụt" trầm), không phải tiếng ù liên tục
      const exh = ctx.createBufferSource();
      exh.buffer = this.brownNoiseBuffer;
      exh.loop = true;
      const exhF = ctx.createBiquadFilter();
      exhF.type = 'lowpass';
      exhF.frequency.value = 340;
      exhF.Q.value = 0.6;
      e.exhaustFilter = exhF;
      const exhAm = ctx.createGain();
      exhAm.gain.value = 0.6;
      // Xung nổ được LÀM MỀM (lọc thông thấp theo nhịp nổ) trước khi điều biên: đóng/mở nhiễu gần 100% bằng xung cạnh sắc
      // ở 50-150 Hz đúng là vùng tai nghe thành độ "nhám / rè rè" mạnh nhất; nhịp mềm thì thành tiếng gầm "ùng ục"
      e.pulseSmooth = ctx.createBiquadFilter();
      e.pulseSmooth.type = 'lowpass';
      e.pulseSmooth.frequency.value = 90;
      e.pulseSmooth.Q.value = 0.5;
      const pulseAmt = ctx.createGain();
      pulseAmt.gain.value = 1.2;
      pulseShape.connect(e.pulseSmooth);
      e.pulseSmooth.connect(pulseAmt);
      pulseAmt.connect(exhAm.gain);
      // mỗi nhát phụt mạnh yếu khác nhau -> tiếng gầm "ùng ục" thô ráp chứ không thành một nốt nhạc đều
      const exhRnd = ctx.createGain();
      exhRnd.gain.value = 0.6;
      const exhRndDepth = ctx.createGain();
      exhRndDepth.gain.value = 3;
      roughF.connect(exhRndDepth);
      exhRndDepth.connect(exhRnd.gain);
      e.exhaustGain = ctx.createGain();
      e.exhaustGain.gain.value = 0;
      exh.connect(exhF);
      exhF.connect(exhAm);
      exhAm.connect(exhRnd);
      exhRnd.connect(e.exhaustGain);
      e.exhaustGain.connect(eout);

      // Xích sắt lách cách: nhiễu dải cao điều biên bằng 2 nhịp lệch nhau (2 dải xích)
      const trk = ctx.createBufferSource();
      trk.buffer = this.noiseBuffer;
      trk.loop = true;
      e.trackFilter = ctx.createBiquadFilter();
      e.trackFilter.type = 'bandpass';
      e.trackFilter.frequency.value = 1700;
      e.trackFilter.Q.value = 1.1;
      e.trackAm = ctx.createGain();
      e.trackAm.gain.value = 0.3;
      e.trackLfoA = ctx.createOscillator();
      e.trackLfoA.type = 'square';
      e.trackLfoB = ctx.createOscillator();
      e.trackLfoB.type = 'square';
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.3;
      e.trackLfoA.connect(lfoDepth);
      e.trackLfoB.connect(lfoDepth);
      lfoDepth.connect(e.trackAm.gain);
      this.trackGain = ctx.createGain();
      this.trackGain.gain.value = 0;
      trk.connect(e.trackFilter);
      e.trackFilter.connect(e.trackAm);
      e.trackAm.connect(this.trackGain);
      this.trackGain.connect(out);

      // Rung nặng của khối xe nghiến trên đất / tiếng lốp lăn
      const rum = ctx.createBufferSource();
      rum.buffer = this.brownNoiseBuffer;
      rum.loop = true;
      e.rumbleFilter = ctx.createBiquadFilter();
      e.rumbleFilter.type = 'lowpass';
      e.rumbleFilter.frequency.value = 140;
      e.rumbleGain = ctx.createGain();
      e.rumbleGain.gain.value = 0;
      rum.connect(e.rumbleFilter);
      e.rumbleFilter.connect(e.rumbleGain);
      e.rumbleGain.connect(out);

      // Xích rít khi xe quay gắt / lốp miết đường
      const sq = ctx.createBufferSource();
      sq.buffer = this.noiseBuffer;
      sq.loop = true;
      e.squealFilter = ctx.createBiquadFilter();
      e.squealFilter.type = 'bandpass';
      e.squealFilter.frequency.value = 2500;
      e.squealFilter.Q.value = 7;
      const sqAm = ctx.createGain();
      sqAm.gain.value = 0.7;
      const sqLfo = ctx.createOscillator();
      sqLfo.frequency.value = 7.3;
      const sqDepth = ctx.createGain();
      sqDepth.gain.value = 0.3;
      sqLfo.connect(sqDepth);
      sqDepth.connect(sqAm.gain);
      e.squealGain = ctx.createGain();
      e.squealGain.gain.value = 0;
      sq.connect(e.squealFilter);
      e.squealFilter.connect(sqAm);
      sqAm.connect(e.squealGain);
      e.squealGain.connect(out);

      [e.fire, e.crank, comb, e.turbo, exh, trk, e.trackLfoA, e.trackLfoB, rum, sq, sqLfo, jit, rough, clk].forEach(n => n.start());
      this.engine = e;
      // Tương thích tên cũ
      this.engineLowOsc = e.fire;
      this.engineGain = e.engineGain;
      this.trackFilter = e.trackFilter;
    } catch (err) {
      console.warn('Lỗi thiết lập âm thanh động cơ:', err);
    }
  }

  /**
   * opts (tùy chọn): { tankType, engineDmg: 0 lành | 1 hư | 2 hỏng nặng, dead, tracksBroken: số dải xích đứt 0..2,
   *   flatTires: số lốp xịt / nát }
   */
  updateEngine(speedRatio, isBoost = false, engineLoad = 1.0, opts = null) {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const tc = 0.12;
    const o = opts || {};
    const me = window.game && window.game.player;
    const type = o.tankType || (me && me.tankType) || 'ALL_ROUNDER';
    this.updateAmbience(t);
    this.sweepFires(t);
    const allGains = [e.engineGain, e.combGain, e.turboGain, e.exhaustGain, e.rumbleGain, e.squealGain];
    if (o.dead) {
      // Xe đã bị hạ: máy tắt lịm
      allGains.forEach(g => g && g.gain.setTargetAtTime(0, t, 0.4));
      this.trackGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._mv) this._mv.crunch.gain.setTargetAtTime(0, t, 0.2);
      this._engWasDead = true;
      return;
    }
    const sr = Math.max(0, Math.min(1.2, speedRatio || 0));
    const heavy = engineLoad > 1.2;
    // Xe trinh sát 4x4 và pháo tự hành 6x6 (xe tải) chạy bánh lốp; xe tăng & xe hỏa lực chạy xích
    const wheeled = type === 'SCOUT' || type === 'ARTILLERY';
    const truck = type === 'ARTILLERY';
    const dmg = o.engineDmg || 0;
    // tốc độ xoay thân xe (rad/s), làm mượt để tiếng xích không bật / tắt giật cục theo từng khung hình
    const dtT = this._engLastT ? Math.min(0.1, Math.max(0.001, this.ctx.currentTime - this._engLastT)) : 0.016;
    this._turnS = (this._turnS || 0) + (Math.min(3, Math.abs(o.turn || 0)) - (this._turnS || 0)) * Math.min(1, dtT * 5);
    const turn = Math.min(2, this._turnS);

    // Vào trận / hồi sinh: đề máy -> nổ máy rồi mới có tiếng máy chạy đều
    if (this._engWasDead !== false) {
      this._engWasDead = false;
      this._engStartT = t;
      this._gear = 0;
      this.playEngineStart(type);
    }
    if (t - (this._engStartT || -9) < 1.05) {
      allGains.forEach(g => g && g.gain.setTargetAtTime(0, t, 0.05));
      this.trackGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }

    // Vòng tua: theo tốc độ + tải động cơ (xe tăng tốc thì máy gằn lên, chạy đều thì lắng xuống — như xe dùng biến mô
    // thủy lực). Không mô phỏng sang số từng cấp: xe trong game tăng tốc từ 0 lên tối đa chỉ ~1.7 s, sang số thật sẽ
    // thành chuỗi "rồ-khục-rồ-khục" mỗi 0.35 s nghe rất giả
    const dtE = this._engLastT ? Math.min(0.1, Math.max(0.001, t - this._engLastT)) : 0.016;
    const accel = Math.max(0, (sr - (this._srPrev === undefined ? sr : this._srPrev)) / dtE);
    this._srPrev = sr;
    this._load = (this._load || 0) + (Math.min(1, accel * 1.6) - (this._load || 0)) * Math.min(1, dtE * (accel > 0.05 ? 6 : 2.5));
    let rpm = Math.min(1, 0.15 + sr * 0.6 + this._load * 0.25 + (isBoost ? 0.1 : 0) + (heavy ? 0.06 : 0));
    // Máy hỏng nặng: không lên nổi vòng tua cao, vòng tua dao động ì ạch
    if (dmg >= 2) rpm = Math.min(rpm, 0.62) * (0.9 + Math.random() * 0.12);
    // Tần số nổ thật: V12 (xích) ~55 Hz không tải -> ~180 Hz; diesel 6 máy xe tải 6x6 ~32 -> 112 Hz; xe 4x4 ~38 -> 130 Hz
    const fireHz = truck ? 32 + rpm * 80 : wheeled ? 38 + rpm * 92 : 55 + rpm * 125;
    e.fire.frequency.setTargetAtTime(fireHz, t, tc);
    if (e.orders) e.orders.forEach(r => r.o.frequency.setTargetAtTime(fireHz * r.k, t, tc));
    e.crank.frequency.setTargetAtTime(fireHz * 0.5, t, tc);
    // Máy hư: mất tiếng gằn cao (nghẹt), tiếng cháy nổ thô và ống xả to hơn (khói đen phụt)
    const choke = dmg >= 2 ? 0.55 : dmg === 1 ? 0.8 : 1;
    const engLp = fireHz * 3.2 * (heavy ? 1.15 : 1) * choke;
    e.engineFilter.frequency.setTargetAtTime(engLp, t, tc);
    if (e.engineFilter2) e.engineFilter2.frequency.setTargetAtTime(engLp * 1.2, t, tc);
    // Cắt luôn tần số nổ gốc (và mọi thứ dưới nó): loa chỉ phát nó thành tiếng ù, còn tai vẫn "nghe ra" nhịp máy trầm
    // qua các họa âm phía trên (âm gốc ảo) — máy nghe dày, chắc mà không ù
    if (e.hp1) {
      e.hp1.frequency.setTargetAtTime(Math.max(48, fireHz * 0.8), t, tc);
      e.hp2.frequency.setTargetAtTime(38, t, tc);
    }
    const eg = (0.02 + rpm * 0.03) * (heavy ? 1.25 : 1) * (truck ? 1.15 : 1);
    e.engineGain.gain.setTargetAtTime(eg, t, tc);
    e.combGain.gain.setTargetAtTime((0.08 + rpm * 0.18) * (1 + dmg * 0.35), t, tc);
    if (e.combFilter) e.combFilter.frequency.setTargetAtTime(220 + rpm * 420, t, tc);
    e.turbo.frequency.setTargetAtTime(1500 + rpm * 2800, t, 0.3);
    // Turbo hỏng: tiếng rít mất hẳn
    e.turboGain.gain.setTargetAtTime(dmg >= 2 ? 0 : Math.max(0, rpm - 0.3) * (isBoost ? 0.02 : 0.011), t, 0.3);
    e.exhaustGain.gain.setTargetAtTime((0.07 + rpm * 0.14) * (1 + dmg * 0.3), t, tc);
    if (e.exhaustFilter) e.exhaustFilter.frequency.setTargetAtTime((300 + rpm * 500) * choke, t, tc);
    if (e.pulseSmooth) e.pulseSmooth.frequency.setTargetAtTime(fireHz * 1.1, t, tc);
    // Độ lệch nhịp nổ: không tải chao rõ (máy "lục bục"), vòng tua cao đều hơn; máy hư chao mạnh
    // cao độ máy chỉ chao rất nhẹ (~±1% lúc không tải); chao mạnh nghe như băng cát-xét nhão / còi méo
    if (e.jitterDepth) e.jitterDepth.gain.setTargetAtTime(fireHz * 0.15 * Math.max(0, 1 - (rpm - 0.15) * 2.2) + (dmg ? fireHz * 0.12 * dmg : 0), t, tc);
    if (e.roughDepth) e.roughDepth.gain.setTargetAtTime(3.5 * Math.max(0.3, 1 - (rpm - 0.15) * 1.6) * (1 + dmg * 0.5), t, tc);
    // Tiếng gõ kim phun diesel: rõ khi không tải, cao độ nhích lên theo vòng tua
    if (e.clatterGain) {
      e.clatterGain.gain.setTargetAtTime((0.09 + rpm * 0.04) * (truck ? 1.2 : 1), t, tc);
      e.clatterFilter.frequency.setTargetAtTime(1300 + rpm * 900, t, tc);
    }
    // Đứng chờ lâu: tiếng máy lùi dần về nền (tai quen tiếng máy, như kíp lái ngồi trong xe); nhấn ga là trở lại ngay
    if (e.habit) {
      const dtI = this._engLastT ? Math.min(0.1, t - this._engLastT) : 0.016;
      this._idleT = (sr < 0.03 && !isBoost && turn < 0.1) ? (this._idleT || 0) + dtI : 0;
      const hab = 1 - 0.4 * Math.min(1, Math.max(0, (this._idleT - 3) / 5));
      e.habit.gain.setTargetAtTime(hab, t, this._idleT > 0 ? 0.8 : 0.08);
    }

    // Máy trúng đạn: xi-lanh bỏ nổ -> hụt tiếng "khục" từng nhịp, thỉnh thoảng ống xả nổ ngược "bụp"
    if (dmg > 0) {
      const dt = this._engLastT ? Math.min(0.1, t - this._engLastT) : 0.016;
      if (Math.random() < dt * (dmg >= 2 ? 7 : 2.5)) {
        const depth = dmg >= 2 ? 0.15 : 0.45;
        e.engineGain.gain.setValueAtTime(eg * depth, t);
        e.engineGain.gain.setTargetAtTime(eg, t + 0.05 + Math.random() * 0.08, 0.06);
        e.combGain.gain.setValueAtTime(0.02, t);
        if (Math.random() < (dmg >= 2 ? 0.35 : 0.15)) {
          const pop = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.15 });
          this.burst(pop, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 3, gain: 0.8, attack: 0.001, dur: 0.07 });
          this.burst(pop, t + 0.04, { filter: 'bandpass', freq: 900, Q: 1, gain: 0.15, attack: 0.001, dur: 0.03 });
        }
      }
    }
    this._engLastT = t;

    if (wheeled) {
      // Xe bánh lốp: tiếng lốp lăn rào rào, không có xích; lốp xịt / chạy trên vành: tiếng nghiến kim loại đục, phành phạch
      const flat = Math.min(3, o.flatTires || 0);
      this.trackGain.gain.setTargetAtTime(flat > 0 ? Math.min(0.12, sr * 0.06 * flat) : 0, t, tc);
      if (flat > 0) {
        const flapHz = 2 + sr * 10;
        e.trackLfoA.frequency.setTargetAtTime(flapHz, t, tc);
        e.trackLfoB.frequency.setTargetAtTime(flapHz * 1.31, t, tc);
        e.trackFilter.frequency.setTargetAtTime(700 + sr * 400, t, tc);
      }
      e.rumbleFilter.frequency.setTargetAtTime((truck ? 380 : 500) + sr * (truck ? 380 : 500), t, tc);
      e.rumbleGain.gain.setTargetAtTime(sr * (truck ? 0.14 : 0.1) * (1 + flat * 0.25), t, tc);
    } else {
      const linkHz = 3 + sr * 24;
      // Dải xích đứt: bên đó không còn lách cách
      const trackK = Math.max(0, 1 - (o.tracksBroken || 0) * 0.5);
      e.trackLfoA.frequency.setTargetAtTime(linkHz, t, tc);
      e.trackLfoB.frequency.setTargetAtTime(linkHz * 1.07, t, tc);
      e.trackFilter.frequency.setTargetAtTime(1300 + sr * 900, t, tc);
      // Quay đầu tại chỗ: hai dải xích vẫn chạy ngược chiều nhau nên vẫn lách cách
      const trackSpeed = Math.min(1.2, sr + turn * 0.35);
      this.trackGain.gain.setTargetAtTime(Math.min(0.07, trackSpeed * 0.06 * (isBoost ? 1.25 : 1)) * trackK, t, tc);
      e.rumbleFilter.frequency.setTargetAtTime(140, t, tc);
      e.rumbleGain.gain.setTargetAtTime(trackSpeed * 0.22, t, tc);
    }

    // Xích xe quay gắt: guốc xích trượt ngang trên đất, bánh tì nghiến -> tiếng rít ken két (rõ nhất khi quay đầu tại chỗ);
    // xe bánh lốp cua gắt ở tốc độ cao: lốp miết đường rít khàn
    if (e.squealGain) {
      let sq = 0;
      // xích chỉ rít rõ khi quay đầu tại chỗ / bẻ lái lúc chạy chậm (guốc xích trượt ngang); chạy nhanh rẽ chỉ rít khẽ
      if (!wheeled) sq = Math.min(0.016, Math.max(0, turn - 0.3) * (sr < 0.3 ? 0.008 : 0.003)) * Math.max(0, 1 - (o.tracksBroken || 0) * 0.5);
      else sq = sr > 0.5 ? Math.min(0.012, Math.max(0, turn - 1.0) * sr * 0.01) : 0;
      // cao độ trôi chậm ngẫu nhiên (không nhảy theo từng khung hình)
      this._sqF = Math.max(2000, Math.min(2900, (this._sqF || 2400) + (Math.random() - 0.5) * 30));
      e.squealFilter.frequency.setTargetAtTime(wheeled ? 900 : this._sqF, t, 0.3);
      e.squealFilter.Q.value = wheeled ? 1.5 : 6;
      e.squealGain.gain.setTargetAtTime(sq, t, 0.25);
    }

    this.updateMovement(t, wheeled ? sr : Math.min(1.2, sr + turn * 0.35), wheeled, type, o);

    // Xe tải 6x6 dừng hẳn: phanh hơi xả "xììì"
    if (truck && (this._engPrevSr || 0) > 0.2 && sr < 0.04) {
      const v = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.12 });
      this.burst(v, t + 0.15, { filter: 'highpass', freq: 2800, gain: 0.35, attack: 0.01, dur: 0.75 });
      this.burst(v, t + 0.15, { filter: 'bandpass', freq: 5200, Q: 2, gain: 0.12, attack: 0.01, dur: 0.6 });
    }
    this._engPrevSr = sr;
  }

  /**
   * Tiếng chuyển động của gầm xe (lên lịch trước ~0.12 s mỗi khung hình):
   * - Xe xích: từng mắt xích thép đập vào bánh răng chủ động / bánh tì: "cạch, keng" rời rạc có cộng hưởng kim loại,
   *   cao độ & nhịp lệch ngẫu nhiên (không đều như máy); 2 dải xích trái / phải lệch nhau
   * - Mọi xe: đất sỏi lạo xạo dưới xích / lốp, cú "thịch" khi gầm chồm qua mô đất, ổ gà; xe bánh có thêm tiếng nhíp kêu
   */
  updateMovement(t, speed, wheeled, type, o = {}) {
    const ctx = this.ctx;
    if (!this._mv) {
      const mk = pan => { const g = ctx.createGain(); g.gain.value = 1; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.vehicleBus); } else g.connect(this.vehicleBus); return g; };
      // sỏi đất lạo xạo: chuỗi xung thưa lặp, dải trung-cao
      const cr = ctx.createBufferSource();
      cr.buffer = this.crackleBuffer;
      cr.loop = true;
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = 1700;
      cf.Q.value = 0.6;
      const cg = ctx.createGain();
      cg.gain.value = 0;
      cr.connect(cf);
      cf.connect(cg);
      cg.connect(this.vehicleBus);
      cr.start();
      this._mv = { next: [0, 0], thump: 0, bus: [mk(-0.35), mk(0.35)], mid: mk(0), crunch: cg, crunchF: cf, crunchSrc: cr };
    }
    const M = this._mv;
    const v = Math.max(0, Math.min(1.2, speed));
    M.crunch.gain.setTargetAtTime(Math.min(1.4, v * 1.3) * (wheeled ? 0.8 : 1), t, 0.1);
    M.crunchF.frequency.setTargetAtTime(1300 + v * 900, t, 0.1);
    M.crunchSrc.playbackRate.setTargetAtTime(0.7 + v * 0.5, t, 0.3);
    if (this.isMapMuted) return;
    const look = 0.12;
    if (!wheeled && v > 0.02) {
      const heavy = type === 'ALL_ROUNDER' || type === 'GATLING';
      const rate = 3 + v * 26;   // số tiếng va mỗi giây trên một dải xích
      for (let s = 0; s < 2; s++) {
        if (o.tracksBroken && s < o.tracksBroken) continue;   // dải xích đứt: không còn chạy
        if (M.next[s] < t) M.next[s] = t + Math.random() * 0.04;
        while (M.next[s] < t + look) {
          const tt = M.next[s];
          const g = (0.012 + 0.03 * Math.min(1, v)) * (0.5 + Math.random());
          this.metal(M.bus[s], tt, { f0: (heavy ? 240 : 320) * (0.75 + Math.random() * 0.6), ratios: [1, 2.31, 3.92], decay: 0.04 + Math.random() * 0.05, gain: g, click: 0.6 });
          if (Math.random() < 0.3) this.burst(M.bus[s], tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, gain: g * 4, attack: 0.001, dur: 0.05 });
          M.next[s] = tt + (1 / rate) * (0.6 + Math.random() * 0.8);
        }
      }
    }
    // cú xóc gầm: thời điểm ngẫu nhiên, dày hơn khi chạy nhanh
    if (v > 0.15 && t > M.thump) {
      M.thump = t + 0.35 + Math.random() * Math.max(0.3, 1.8 - v * 1.2);
      const g = 0.18 + v * 0.3;
      const tt = t + 0.02 + Math.random() * 0.08;
      this.burst(M.mid, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 170, drive: 2, gain: g, attack: 0.002, dur: 0.12 });
      if (wheeled) this.metal(M.mid, tt + 0.03, { f0: 160 + Math.random() * 60, ratios: [1, 2.1], decay: 0.18, gain: 0.02 + v * 0.02, click: 0.2 });   // nhíp / giảm xóc kêu
      else this.metal(M.mid, tt, { f0: 140 + Math.random() * 50, ratios: [1, 2.4, 3.6], decay: 0.12, gain: 0.03 + v * 0.03, click: 0.5 });  // xích võng đập thân
    }
  }

  // Đề máy: củ đề quay nặng nề kéo trục khuỷu (nhịp nén xi-lanh), máy nổ bắt "bùm" rồi gầm lên vòng tua cao và hạ về không tải
  playEngineStart(tankType = 'ALL_ROUNDER') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.vehicleBus, gain: 0.7, wet: 0.1 });
    const big = tankType === 'ALL_ROUNDER' || tankType === 'GATLING' || tankType === 'ARTILLERY';
    // mô-tơ đề rít điện
    this.tone(out, t, { type: 'sawtooth', freq: 140, freqEnd: 210, sweep: 0.6, gain: 0.05, attack: 0.05, hold: 0.55, dur: 0.1, filter: 'bandpass', filterFreq: 600, Q: 3 });
    // nhịp nén xi-lanh khi trục quay chậm: "ục ục ục" nhanh dần
    let tt = t + 0.05;
    for (let i = 0; i < 7; i++) {
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, drive: 2, gain: 0.35, attack: 0.01, dur: 0.07 });
      tt += 0.13 - i * 0.008;
    }
    // máy nổ bắt: phát nổ đầu tiên + gầm vọt vòng tua
    const tc = t + 0.85;
    this.burst(out, tc, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 400, drive: 3, gain: 0.9, attack: 0.003, dur: 0.18 });
    this.tone(out, tc, { type: 'sawtooth', freq: big ? 50 : 40, freqEnd: big ? 120 : 100, sweep: 0.3, drive: 3, gain: 0.08, attack: 0.05, hold: 0.15, dur: 0.4, filter: 'lowpass', filterFreq: 700 });
    this.burst(out, tc + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 900, freqEnd: 400, sweep: 0.5, gain: 0.25, attack: 0.08, dur: 0.5 });
    if (big) this.burst(out, tc + 0.1, { filter: 'bandpass', freq: 1800, freqEnd: 2600, sweep: 0.4, Q: 4, gain: 0.04, attack: 0.1, dur: 0.6 });   // turbo quay lên
  }

  // Hộp số sang số: nhả ga thoáng chốc + tiếng "cạch" cơ khí khẽ trong hộp số (vào số thấp có thêm "ục" ăn số)
  playGearShift(tankType = 'ALL_ROUNDER', up = true) {
    if (!this.ready() || !this.engine) return;
    const t = this.ctx.currentTime;
    if (t - (this._lastShift || 0) < 0.6) return;
    this._lastShift = t;
    const e = this.engine;
    const g = e.engineGain.gain.value;
    e.engineGain.gain.setValueAtTime(g * 0.55, t);
    e.engineGain.gain.setTargetAtTime(g, t + 0.18, 0.08);
    const out = this.voice({ bus: this.vehicleBus, gain: 0.45, wet: 0.03 });
    this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 2.5, gain: 0.07, attack: 0.001, dur: 0.035 });
    this.burst(out, t + 0.05, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: up ? 0.1 : 0.18, attack: 0.002, dur: 0.08 });
    if (tankType === 'ARTILLERY' && up) this.burst(out, t + 0.02, { filter: 'highpass', freq: 3000, gain: 0.05, attack: 0.01, dur: 0.18 });   // xe tải: xả hơi bộ ly hợp
  }

  /**
   * Xe bị phá hủy — tiếng nổ thứ cấp riêng theo cấu tạo từng loại xe (đi sau phát bắn trúng ~0.1-0.25 s):
   * - Xe tăng (kho đạn 120mm trong tháp): kho đạn kích nổ "ẦM" cực lớn, sâu, hất tháp bay rít gió, thân thép ngân
   * - Pháo tự hành 155 (đạn + liều phóng): kích nổ lớn nhất, rồi liều phóng cháy phụt như mỏ hàn khổng lồ "phừừừ" 2-3 s
   * - Xe 6 nòng (đạn 30mm + dầu): nổ vừa + "phừng" dầu bốc cháy, sau đó đạn 30mm nổ lụp bụp dồn dập (cookoffSmall)
   * - Xe trinh sát (không có kho đạn pháo): bình xăng "phừng" + kính vỡ + đạn 12.7 tí tách
   */
  playVehicleDestroyed(tankType = 'ALL_ROUNDER', pos = null) {
    if (!this.ready()) return;
    const L = this.listenerXZ();
    const d = pos ? Math.hypot(pos.x - L.x, pos.z - L.z) : 0;
    if (d > 3200) return;
    const sp = this.spatial(d, pos);
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = tankType === 'ARTILLERY' ? 1.9 : tankType === 'ALL_ROUNDER' ? 1.6 : tankType === 'GATLING' ? 1.0 : 0.6;
    const t = this.ctx.currentTime + sp.delay + (big ? 0.12 + Math.random() * 0.12 : 0.05);
    const out = this.voice({ gain: sp.gain * 0.2, lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.15), pan: sp.pan });
    if (tankType !== 'SCOUT') {
      // kích nổ: sóng nổ gắt + thân nổ dày trầm (nặng hơn đạn HE vì cả kho đạn)
      const W = this.stereoSpread(out, 0.7);
      this.snap(out, t, 1.4 * k, 6500, 5);
      for (const ch of [W.L, W.R]) {
        this.burst(ch, t, { filter: 'lowpass', freq: 5000, freqEnd: 250, sweep: 0.1, drive: 3, gain: 1.1 * k, attack: 0.0005, dur: 0.25 });
        this.burst(ch, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 1200, freqEnd: 70, sweep: 0.7, drive: 2.5, gain: 1.6 * k, attack: 0.001, dur: 0.8 * k });
      }
      this.tone(out, t, { freq: 120, freqEnd: 45, sweep: 0.2, drive: 3, gain: 1.6 * k, attack: 0.001, dur: 0.45 });
      this.tone(out, t, { freq: 62, freqEnd: 36, sweep: 0.5, drive: 2, gain: 1.1 * k, attack: 0.003, dur: 0.8 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 800, Q: 0.6, drive: 2, gain: 3.2 * k, attack: 0.001, dur: 0.35 });
      // thân thép xe bị xé toạc: tiếng thép ngân trầm lẫn trong tiếng nổ + mảnh thép văng rít
      this.metal(out, t + 0.01, { f0: 90 + Math.random() * 30, ratios: [1, 1.7, 2.6, 3.9], decay: 1.2, gain: 0.5 * k, click: 0.5 });
      this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 900, sweep: 0.5, Q: 3, gain: 0.5 * k, attack: 0.01, dur: 0.5 });
      if (d < 700) this.duck(0.25, 1.4);
      // rền cuộn + tiếng dội
      const roll = this.voice({ gain: sp.gain * 0.8, lowpass: Math.min(sp.lowpass, 500), wet: 0.95, pan: sp.pan * 0.5 });
      this.burst(roll, t + 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: 0.35 * k, attack: 0.15, dur: 2.4 });
      this.playTerrainEchoes(t, 0.45 * k * Math.sqrt(sp.gain), sp.lowpass);
    }
    // nhiên liệu bốc cháy "phừng" (xe nào cũng có)
    this.burst(out, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, freqEnd: 900, sweep: 0.4, drive: 2, gain: (big ? 2.0 : 3.0), attack: 0.08, dur: 1.1 });
    this.burst(out, t + 0.12, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 0.5, gain: 2.0, attack: 0.25, dur: 1.8 });
    if (tankType === 'ARTILLERY') {
      // liều phóng thuốc súng cháy phụt thành luồng lửa: tiếng "phừừừ" gầm như mỏ hàn khổng lồ
      this.burst(out, t + 0.3, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 0.5, drive: 2, gain: 3.5, attack: 0.15, dur: 2.8 });
      this.burst(out, t + 0.3, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 400, gain: 2.0, attack: 0.2, dur: 2.8 });
      this.burst(out, t + 0.3, { filter: 'highpass', freq: 3500, gain: 0.6, attack: 0.2, dur: 2.5 });
    }
    if (tankType === 'SCOUT') {
      this.snap(out, t, 0.8, 4000, 3);
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 2.5, gain: 2.5, attack: 0.002, dur: 0.4 });
    }
  }

  // ===========================================================================
  // LỬA CHÁY LIÊN TỤC (xe cháy, xác xe, cây cháy): mỗi đám cháy là một nguồn âm chạy liên tục.
  // Bên gọi chỉ cần "báo còn cháy" ~2 lần/giây: fireSource(key, pos, k). Không được báo nữa -> lửa tắt dần.
  // Âm sắc lửa thật: tiếng gầm dải trung của luồng khí nóng (cao độ, độ lớn chao ngẫu nhiên — không theo nhịp đều),
  // lách tách dày của vật liệu cháy, tí tách trầm của mảnh lớn, xì khí nóng, thỉnh thoảng "bụp".
  // ===========================================================================
  listenerXZ() {
    const g = window.game, lab = window.__fxLab;
    if (g && g.player) return { x: g.player.x, z: g.player.z };
    if (lab && lab.camera) return { x: lab.camera.position.x, z: lab.camera.position.z };
    return { x: 0, z: 0 };
  }

  fireSource(key, pos, k = 1) {
    if (!this.ready() || !pos || key == null) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.fireLoops = this.fireLoops || new Map();
    this.sweepFires(t);
    const L = this.listenerXZ();
    const d = Math.hypot(pos.x - L.x, pos.z - L.z);
    let F = this.fireLoops.get(key);
    if (!F) {
      if (d > 1400) return;
      // tối đa 5 đám cháy cùng kêu: bỏ đám xa nhất nếu đám mới gần hơn
      if (this.fireLoops.size >= 5) {
        let far = null;
        for (const [kk, f] of this.fireLoops) if (!far || f.d > far[1].d) far = [kk, f];
        if (far && far[1].d > d) this.stopFire(far[0], 0.3); else return;
      }
      F = this.makeFireLoop(t);
      this.fireLoops.set(key, F);
    }
    F.seen = t;
    F.d = d;
    const sp = this.spatial(d, pos);
    const kk = Math.max(0.2, Math.min(1.5, k));
    F.out.gain.setTargetAtTime(sp.gain * 0.5 * kk, t, F.fresh ? 0.25 : 0.4);
    F.lp.frequency.setTargetAtTime(Math.max(500, sp.lowpass), t, 0.3);
    if (F.pan) F.pan.pan.setTargetAtTime(sp.pan, t, 0.3);
    F.send.gain.setTargetAtTime(Math.min(0.8, sp.wet), t, 0.3);
    F.fresh = false;
    // "bụp": túi khí / bình dầu / lốp nổ trong đám cháy, thỉnh thoảng
    if (Math.random() < 0.18 * kk) {
      const tp = t + Math.random() * 0.4;
      this.burst(F.mix, tp, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 2, gain: 0.9, attack: 0.002, dur: 0.12 });
      this.burst(F.mix, tp, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 0.8, gain: 0.5, attack: 0.001, dur: 0.05 });
    }
  }

  makeFireLoop(t) {
    const ctx = this.ctx;
    const mix = ctx.createGain();
    mix.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12000;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    mix.connect(lp);
    lp.connect(out);
    let node = out, pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); out.connect(pan); node = pan; }
    node.connect(this.weaponBus);
    const send = ctx.createGain();
    send.gain.value = 0.2;
    node.connect(send);
    if (this.reverb) send.connect(this.reverb);
    const srcs = [];
    const loop = (buf, rate) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate; srcs.push(s); return s; };
    // nhiễu chậm điều khiển độ "phừng" của lửa (không tuần hoàn)
    const flick = (hz, depth, target) => {
      const n = loop(this.pinkNoiseBuffer);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = depth;
      n.connect(f);
      f.connect(g);
      g.connect(target);
    };
    // 1. tiếng gầm của luồng khí nóng: nhiễu hồng dải trung, độ lớn & tâm tần chao ngẫu nhiên
    const roar = loop(this.pinkNoiseBuffer);
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 420;
    rf.Q.value = 0.55;
    flick(3, 4000, rf.frequency);   // tâm tần chao ±~200 Hz
    const ra = ctx.createGain();
    ra.gain.value = 1.4;
    flick(4, 9, ra.gain);           // độ lớn chao ±~40%
    roar.connect(rf);
    rf.connect(ra);
    ra.connect(mix);
    // lớp trầm "ù ù" của đám cháy lớn — nhỏ thôi
    const low = loop(this.brownNoiseBuffer);
    const lf = ctx.createBiquadFilter();
    lf.type = 'bandpass';
    lf.frequency.value = 160;
    lf.Q.value = 0.7;
    const lg = ctx.createGain();
    lg.gain.value = 0.18;
    low.connect(lf);
    lf.connect(lg);
    lg.connect(mix);
    // 2. lách tách dày (vật liệu cháy nứt nổ) — 2 lớp lệch tốc độ phát để không lặp
    for (const [rate, fq, g] of [[1, 2600, 3.2], [0.73, 1500, 2.4]]) {
      const c = loop(this.crackleBuffer, rate);
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = fq;
      cf.Q.value = 0.5;
      const cg = ctx.createGain();
      cg.gain.value = g;
      c.connect(cf);
      cf.connect(cg);
      cg.connect(mix);
    }
    // 3. tí tách trầm của mảnh lớn (than hồng, kim loại nóng co giãn)
    const pop = loop(this.crackleBuffer, 0.4);
    const pf = ctx.createBiquadFilter();
    pf.type = 'lowpass';
    pf.frequency.value = 700;
    const pg = ctx.createGain();
    pg.gain.value = 2.2;
    pop.connect(pf);
    pf.connect(pg);
    pg.connect(mix);
    // 4. khí nóng xì
    const hiss = loop(this.noiseBuffer);
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 4500;
    const hg = ctx.createGain();
    hg.gain.value = 0.035;
    flick(2, 0.4, hg.gain);
    hiss.connect(hf);
    hf.connect(hg);
    hg.connect(mix);
    srcs.forEach(s => s.start(t, Math.random() * 2.5));
    return { mix, lp, out, pan, send, srcs, seen: t, d: 0, fresh: true };
  }

  stopFire(key, fade = 0.6) {
    const F = this.fireLoops && this.fireLoops.get(key);
    if (!F) return;
    const t = this.ctx.currentTime;
    F.out.gain.cancelScheduledValues(t);
    F.out.gain.setValueAtTime(F.out.gain.value, t);
    F.out.gain.setTargetAtTime(0.0001, t, fade);
    F.srcs.forEach(s => { try { s.stop(t + fade * 6); } catch (e) { /* đã dừng */ } });
    this.fireLoops.delete(key);
  }

  // Lửa không còn được báo ~1.5 s -> tắt dần
  sweepFires(t) {
    if (!this.fireLoops || !this.fireLoops.size) return;
    for (const [key, F] of this.fireLoops) if (t - F.seen > 1.5) this.stopFire(key, 0.7);
  }

  // Gió chiến trường: nền rì rào trầm + từng cơn gió mạnh lên rồi lặng; luôn rất nhỏ, chỉ để không gian không "chết"
  updateAmbience(t) {
    if (!this.ctx || !this.brownNoiseBuffer) return;
    if (!this.ambience) {
      const ctx = this.ctx;
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.masterGain);
      // nền gió rì rào dải trung (tai người nghe gió là tiếng xào xạc, không phải tiếng ù trầm như gió thổi vào micro)
      const base = ctx.createBufferSource();
      base.buffer = this.pinkNoiseBuffer;
      base.loop = true;
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = 650;
      bf.Q.value = 0.5;
      const bg = ctx.createGain();
      bg.gain.value = 0.5;
      base.connect(bf);
      bf.connect(bg);
      bg.connect(out);
      const gust = ctx.createBufferSource();
      gust.buffer = this.pinkNoiseBuffer;
      gust.loop = true;
      const gf = ctx.createBiquadFilter();
      gf.type = 'bandpass';
      gf.frequency.value = 700;
      gf.Q.value = 0.8;
      const gg = ctx.createGain();
      gg.gain.value = 0;
      gust.connect(gf);
      gf.connect(gg);
      gg.connect(out);
      base.start();
      gust.start(0, Math.random() * 2);
      this.ambience = { out, gf, gg, next: 0 };
      out.gain.setTargetAtTime(0.04, t, 2);
    }
    const A = this.ambience;
    if (t >= A.next) {
      // cơn gió mới: mạnh / nhẹ ngẫu nhiên, gió mạnh thì "hú" cao hơn
      const s = Math.random();
      A.gg.gain.setTargetAtTime(0.02 + s * 0.12, t, 0.8 + Math.random() * 1.2);
      A.gf.frequency.setTargetAtTime(450 + s * 700, t, 1.5);
      A.next = t + 2.5 + Math.random() * 4;
    }
  }

  // ===========================================================================
  // 6b. MÔ-TƠ QUAY THÁP PHÁO (điện - thủy lực) — liên tục, theo tốc độ quay tháp so với thân xe
  // ===========================================================================
  ensureTurretDrive() {
    if (this.turretDrive || !this.ctx || !this.pinkNoiseBuffer) return this.turretDrive;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.vehicleBus);
    // Mô-tơ / bơm thủy lực: tiếng rít điện dải hẹp, cao độ theo tốc độ quay
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 160;
    const of = ctx.createBiquadFilter();
    of.type = 'bandpass';
    of.Q.value = 5;
    of.frequency.value = 480;
    const og = ctx.createGain();
    og.gain.value = 0.22;
    osc.connect(of);
    of.connect(og);
    og.connect(out);
    // Vòng răng tháp ăn khớp: nhiễu hồng dải trung, rung theo nhịp răng
    const n = ctx.createBufferSource();
    n.buffer = this.pinkNoiseBuffer;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 850;
    nf.Q.value = 1.4;
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 18;
    const ld = ctx.createGain();
    ld.gain.value = 0.4;
    lfo.connect(ld);
    ld.connect(am.gain);
    const ng = ctx.createGain();
    ng.gain.value = 0.8;
    n.connect(nf);
    nf.connect(am);
    am.connect(ng);
    ng.connect(out);
    [osc, n, lfo].forEach(x => x.start());
    this.turretDrive = { out, osc, of, og, nf, ng, lfo, moving: false };
    return this.turretDrive;
  }

  /**
   * rate: tốc độ quay tháp so với thân (rad/s); jammed: vòng bi tháp kẹt (quay tay, nghiến ken két).
   */
  updateTurretDrive(rate, tankType = 'ALL_ROUNDER', jammed = false) {
    if (!this.ctx || this.isMuted) return;
    const td = this.ensureTurretDrive();
    if (!td) return;
    const t = this.ctx.currentTime;
    const dtR = td.lastT ? Math.min(0.1, Math.max(0.001, t - td.lastT)) : 0.016;
    td.lastT = t;
    // làm mượt: hướng ngắm nhảy từng khung hình không làm mô-tơ bật / tắt giật cục
    td.rateS = (td.rateS || 0) + ((Math.abs(rate || 0) > 0.05 ? Math.abs(rate) : 0) - (td.rateS || 0)) * Math.min(1, dtR * 8);
    const k = Math.min(1, td.rateS / 2.6);   // ~150°/s = tốc độ quay tháp tối đa trong game
    const moving = k > 0.03;
    // Tháp lớn xe tăng: thủy lực trầm; pháo 6 nòng: mô-tơ điện nhanh, cao; xe trinh sát: bệ súng nhỏ, khẽ; pháo 155: tháp nặng
    const prof = {
      ALL_ROUNDER: [140, 260, 0.3], GATLING: [220, 420, 0.24], SCOUT: [300, 380, 0.12], ARTILLERY: [110, 200, 0.32]
    }[tankType] || [140, 260, 0.3];
    const f = prof[0] + k * prof[1];
    td.osc.frequency.setTargetAtTime(jammed ? f * 0.5 : f, t, 0.05);
    td.of.frequency.setTargetAtTime((jammed ? 0.6 : 1) * f * 3, t, 0.05);
    td.og.gain.setTargetAtTime(jammed ? 0.05 : 0.22, t, 0.1);
    td.lfo.frequency.setTargetAtTime(jammed ? 4 + k * 6 : 10 + k * 26, t, 0.05);
    td.nf.frequency.setTargetAtTime(jammed ? 520 : 700 + k * 500, t, 0.05);
    td.ng.gain.setTargetAtTime(jammed ? 1.6 : 0.8, t, 0.1);
    td.out.gain.setTargetAtTime(moving ? prof[2] * (0.35 + 0.65 * k) * (jammed ? 1.3 : 1) : 0, t, moving ? 0.05 : 0.08);
    // Tháp dừng: phanh hãm "cạch" khẽ
    if (td.moving && !moving && tankType !== 'SCOUT') {
      const out = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.03 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 2, gain: 0.08, attack: 0.0006, dur: 0.03 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.12, attack: 0.001, dur: 0.06 });
    }
    td.moving = moving;
  }

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
    mm.roarGain.gain.setTargetAtTime(isFiring ? (rotary ? 0.09 : 0.05) : 0, t, isFiring ? 0.03 : 0.12);

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

  /**
   * Một phát đạn 30mm: xung nén + sức ép đầu nòng + tiếng trầm.
   * distance > 0: xe khác bắn (nhỏ dần, mất âm cao, vọng nhiều hơn, nổi trái/phải theo pos).
   */
  playGatlingShot(tankType = 'GATLING', distance = 0, pos = null) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const remote = distance > 0;
    if (remote) {
      if (now - this.lastRemoteGatlingTime < 0.05) return;
      this.lastRemoteGatlingTime = now;
    }
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.22, delay: 0, pan: 0 };
    if (sp.gain < 0.05) return;
    const t = now + sp.delay;
    const scout = tankType === 'SCOUT';
    const p = (scout ? 1.25 : 1.0) * (1 + (Math.random() - 0.5) * 0.1);
    // 30 phát/giây (6 nòng) / 10 phát/giây (12.7mm) cộng dồn: mỗi phát phải nhỏ, nếu không cả loạt thành bức tường ồn
    // chạm trần, đè mất mọi tiếng khác (đo được: loạt 30mm trước đây ~-4 dBFS liên tục)
    const out = this.voice({ gain: sp.gain * (scout ? 0.38 : 0.08), lowpass: sp.lowpass, wet: sp.wet, pan: sp.pan });

    if (!this.playSample('gatling_shot', out, t, { gain: 1.0, vary: 0.06 })) {
      if (scout) {
        // Súng máy 12.7mm: tiếng "ĐÙNG" đanh, khô của đạn súng trường cỡ lớn — nhiều dải trung-cao, ít siêu trầm hơn pháo 30mm
        this.snap(out, t, 0.75, 9500 * p, 5);
        this.burst(out, t, { filter: 'bandpass', freq: 1700 * p, Q: 0.7, drive: 4, gain: 0.75, attack: 0.0006, dur: 0.06 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 1100 * p, freqEnd: 180, sweep: 0.12, drive: 3, gain: 0.9, attack: 0.001, dur: 0.2 });
        this.tone(out, t, { freq: 110 * p, freqEnd: 50, sweep: 0.08, drive: 2, gain: 0.45, attack: 0.001, dur: 0.12 });
        // khóa nòng giật lùi - lên đạn: tiếng "cạch" cơ khí ngay sau phát nổ (chỉ nghe được khi là súng của mình)
        if (!remote) this.burst(out, t + 0.028, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2300, Q: 2, gain: 0.07, attack: 0.0005, dur: 0.02 });
      } else {
        // Pháo 30mm: xung nén méo nặng + sức ép đầu nòng + thân tiếng nổ trầm + cú đấm siêu trầm
        this.snap(out, t, 0.7, 8000 * p, 5);
        this.burst(out, t, { filter: 'lowpass', freq: 6000 * p, freqEnd: 500, sweep: 0.06, drive: 5, gain: 0.85, attack: 0.0008, dur: 0.1 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 900 * p, freqEnd: 140, sweep: 0.08, drive: 3, gain: 1.3, attack: 0.001, dur: remote ? 0.32 : 0.12 });
        this.tone(out, t, { freq: 95 * p, freqEnd: 45, sweep: 0.06, drive: 2, gain: 1.1, attack: 0.001, dur: remote ? 0.22 : 0.09 });
      }
    }

    if (!remote) {
      if (this.gatlingMotor) this.gatlingMotor.burstShots++;
      // Vỏ đạn văng ra rơi xuống nóc xe / mặt đất: leng keng (12.7mm đồng thau nhẹ) / "coong" (30mm thép nặng)
      if (Math.random() < (scout ? 0.7 : 0.45)) {
        const cv = this.voice({ bus: this.vehicleBus, gain: 0.8, wet: 0.08, pan: (Math.random() - 0.5) * 0.5 });
        const tl = t + 0.3 + Math.random() * 0.35;
        this.metal(cv, tl, { f0: scout ? 2400 + Math.random() * 900 : 1100 + Math.random() * 500, ratios: [1, 2.71, 5.1], decay: scout ? 0.18 : 0.25, gain: scout ? 0.035 : 0.05, click: 0.4 });
        if (Math.random() < 0.5) this.metal(cv, tl + 0.07 + Math.random() * 0.06, { f0: scout ? 2600 : 1250, ratios: [1, 2.71], decay: 0.1, gain: scout ? 0.018 : 0.025, click: 0.2 });
      }
    }
  }

  // Dư âm sau khi dứt một loạt đạn dài (phần lớn do hồi âm đảm nhiệm, lớp này thêm rền trầm)
  playGatlingBurstTail(intensity = 1, tankType = 'GATLING') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ gain: 1, wet: 0.8 });
    this.burst(out, t, {
      buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: tankType === 'SCOUT' ? 650 : 450, freqEnd: 120, sweep: 1.2,
      gain: 0.18 * intensity, attack: 0.03, dur: 1.3
    });
  }

  // ===========================================================================
  // 8. TÊN LỬA CHỐNG TĂNG CỦA XE TRINH SÁT
  // ===========================================================================
  playMissileLaunch(distance = 0, pos = null) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.45, delay: 0, pan: 0 };
    if (sp.gain < 0.05) return;
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain, lowpass: sp.lowpass, wet: Math.max(0.45, sp.wet), pan: sp.pan });
    if (this.playSample('missile_launch', out, t, { gain: 1.1 })) return;

    // Kích nổ tầng phóng
    this.snap(out, t, 0.7, 8000, 2.5);
    this.burst(out, t, { filter: 'lowpass', freq: 4000, freqEnd: 600, sweep: 0.1, drive: 2, gain: 0.7, dur: 0.14 });
    // Động cơ tên lửa gầm, rung phần phật
    const ctx = this.ctx;
    const roarIn = ctx.createGain();
    roarIn.gain.value = 0.7;
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 23;
    const fd = ctx.createGain();
    fd.gain.value = 0.3;
    flutter.connect(fd);
    fd.connect(roarIn.gain);
    roarIn.connect(out);
    flutter.start(t);
    flutter.stop(t + 1.1);
    this.burst(roarIn, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 2200, freqEnd: 700, sweep: 1.0, gain: 0.8, attack: 0.03, dur: 0.9 });
    // Tiếng xé gió lao vút ra xa
    this.burst(out, t + 0.05, { filter: 'bandpass', freq: 900, freqEnd: 2400, sweep: 0.25, Q: 2, gain: 0.3, attack: 0.08, dur: 0.6 });
  }

  // Tên cũ (phòng thử xe gọi)
  playRocketLaunch(distance = 0, pos = null) { this.playMissileLaunch(distance, pos); }
}

window.soundEngine = new SoundEngine();
