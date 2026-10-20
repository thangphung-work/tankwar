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

// Trái / phải theo hướng camera đang nhìn (camera bám đuôi xoay theo xe): dx, dz = nguồn âm - xe mình
function viewPan(dx, dz, lim) {
  const yaw = (typeof window !== 'undefined' && window.game && window.game._camYaw) || 0;
  const side = dx * Math.cos(yaw) - dz * Math.sin(yaw), fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  return Math.max(-lim, Math.min(lim, side / (Math.abs(side) + Math.abs(fwd) + 60)));
}

// Âm sắc phá hủy theo vật liệu (tiếng nứt vỡ đầu tiên + từng mảnh vụn rơi đập đất + lớp sỏi đổ rào rào).
// Bê tông: nứt đanh, mảnh "cộc" trung-cao; gạch đá: đục hơn; đất / gạch mộc: bở, "bịch" mềm, đất đổ rào;
// gỗ: thớ gãy rắc rắc, mảnh gõ rỗng; tôn thép: oàng rung, mảnh leng keng; đá tảng: nứt "CẮC" cực gắt, khối đá rơi nặng
const BREAK_MAT = {
  concrete: { snap: 0.55, snapLp: 7000, crackF: 2100, crackG: 0.8, crackD: 0.035, bodyF: 750, bodyG: 0.9, bodyD: 0.18, thudF: 380, thudG: 0.7,
    chunkF: [900, 3200], chunkQ: 0.9, chunkG: 0.45, pourF: 1100, pourG: 0.32 },
  masonry: { snap: 0.45, snapLp: 5000, crackF: 1600, crackG: 0.65, crackD: 0.04, bodyF: 600, bodyG: 0.9, bodyD: 0.2, thudF: 330, thudG: 0.75,
    chunkF: [700, 2500], chunkQ: 0.9, chunkG: 0.45, pourF: 900, pourG: 0.34 },
  adobe: { snap: 0.3, snapLp: 2500, crackF: 1100, crackG: 0.35, crackD: 0.04, bodyF: 420, bodyG: 0.8, bodyD: 0.25, thudF: 260, thudG: 0.9,
    chunkF: [350, 1200], chunkQ: 0.7, chunkG: 0.35, pourF: 650, pourG: 0.5 },
  woodBreak: { thudF: 300, thudG: 0.5, chunkF: [400, 1600], chunkQ: 2, chunkG: 0.4, pourF: 0, pourG: 0 },
  sheetMetal: { thudF: 320, thudG: 0.7, chunkF: [700, 2400], chunkQ: 9, chunkG: 0.4, ring: 900, pourF: 0, pourG: 0 },
  rockSplit: { snap: 0.75, snapLp: 10000, crackF: 3000, crackG: 0.9, crackD: 0.02, bodyF: 520, bodyG: 0.8, bodyD: 0.16, thudF: 280, thudG: 1.0,
    chunkF: [600, 2400], chunkQ: 1.1, chunkG: 0.48, pourF: 1300, pourG: 0.25 }
};
// Tiếng vỡ thường do chính một vụ nổ / phát bắn gây ra -> bị sóng nổ che (xem SoundEngine.blastMask)
const BLAST_MASKABLE = { concrete: 1, masonry: 1, adobe: 1, woodBreak: 1, sheetMetal: 1, rockSplit: 1, leafStrip: 1, treeFall: 1, collapse: 1, glass: 1 };

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
    // bộ đệm lửa dài (~27 s âm thanh) tạo sẵn lúc rảnh, không để đám cháy đầu tiên giữa trận làm khựng hình
    const prepFire = () => { try { if (this.ctx) this.ensureFireBuffers(); } catch (e) { /* tạo lại khi cần */ } };
    if (typeof window !== 'undefined' && window.requestIdleCallback) window.requestIdleCallback(prepFire, { timeout: 4000 });
    else if (typeof setTimeout !== 'undefined') setTimeout(prepFire, 1500);

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
    this.warmGunshots();
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
      pan = viewPan(pos.x - me.x, pos.z - me.z, 0.85);
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
    // Mức đưa vào thấp có chủ đích (xem playExplosionAtDistance): giữ cú đấm, không bị ép bẹt ở đầu ra.
    // Phát bắn của chính mình đi qua "blastBus" (bão hòa nhẹ cả cụm): các lớp quyện vào nhau thành một khối đặc, dày
    const out = this.voice({ bus: remote ? null : this.blastBus(arty), gain: sp.gain * (remote ? 0.2 : arty ? 0.2 : 0.22), lowpass: sp.lowpass, wet: Math.max(0.45, sp.wet), pan: sp.pan });

    if (!this.playSample(arty ? 'artillery_fire' : 'cannon_fire', out, t, { gain: 1.3 })) {
      // Pháo khai hỏa: xung nén đầu nòng cực gắt (đỉnh ngay ms đầu) -> khí thuốc phóng phụt "ĐÙNG" trầm dày
      // -> rền cuộn. Pháo 155 có hãm nòng: sóng nổ hắt ngang dữ dội, thân tiếng dài và nặng hơn
      const W = this.stereoSpread(out, arty ? 0.7 : 0.5);
      this.snap(out, t, 1.9 * s, 7500, 5);
      this.burst(out, t, { filter: 'bandpass', freq: arty ? 1900 : 2500, Q: 0.6, drive: 3, gain: 0.9 * s, attack: 0.0004, dur: 0.045 });
      // Sức ép nổ thuốc phóng (2 kênh lệch nhau)
      for (const ch of [W.L, W.R]) {
        this.burst(ch, t, { filter: 'lowpass', freq: 6000, freqEnd: 280, sweep: 0.09, drive: 3, gain: 1.1 * s, attack: 0.0005, dur: arty ? 0.32 : 0.24 });
        this.burst(ch, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 1500, freqEnd: 90, sweep: 0.55, drive: 2.5, gain: (arty ? 0.9 : 1.5) * s, attack: 0.001, dur: arty ? 0.8 : 0.62 });
      }
      // Cú đấm ngực 40-130 Hz
      this.tone(out, t, { freq: arty ? 115 : 130, freqEnd: arty ? 42 : 48, sweep: 0.17, drive: 3, gain: (arty ? 0.95 : 1.4) * s, attack: 0.0008, dur: arty ? 0.48 : 0.36 });
      this.tone(out, t, { freq: arty ? 62 : 70, freqEnd: arty ? 34 : 38, sweep: 0.4, drive: 2, gain: (arty ? 0.4 : 1.0) * s, attack: 0.002, dur: arty ? 0.75 : 0.55 });
      // Thân "ĐÙM" 110-160 Hz: dải trầm mà loa laptop / điện thoại vẫn phát được -> sức nặng
      this.burst(out, t + 0.001, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 125 : 155, freqEnd: arty ? 90 : 110, sweep: 0.4, Q: 0.9, drive: 1.8, gain: 4.0 * s, attack: 0.002, dur: arty ? 0.75 : 0.5 });
      // Sóng nổ dội từ mặt đất + thân xe "hự" theo sau ~18 ms: thành 2 lớp đập liền nhau, dày như vụ nổ
      this.burst(out, t + 0.018, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 200 : 240, Q: 0.8, drive: 1.8, gain: 2.4 * s, attack: 0.002, dur: arty ? 0.35 : 0.25 });
      // Khí thuốc phóng xé không khí: dải trung "rầm" + lớp trầm và phản xạ mặt đất trễ ~28 ms
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 520 : 650, Q: 0.6, drive: 2, gain: 3.6 * s, attack: 0.001, dur: arty ? 0.42 : 0.32 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2.5, gain: (arty ? 0.8 : 1.1) * s, attack: 0.002, dur: arty ? 0.85 : 0.55 });
      this.burst(out, t + 0.028, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 0.6 * s, attack: 0.003, dur: arty ? 0.75 : 0.5 });
      if (arty) {
        // Hãm nòng 155mm: khí thuốc phóng bị hắt NGANG sang 2 bên thành 2 luồng nổ cực gắt ngay cạnh xe
        // ("ĐOÀNG" xé tai, dải 0,8-3 kHz) — chính là cái làm tiếng pháo tự hành dữ hơn hẳn pháo tăng
        for (const [ch, d] of [[W.L, 0], [W.R, 0.0015]]) {
          this.burst(ch, t + d, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.5, drive: 3.5, gain: 6.0, attack: 0.0004, dur: 0.16 });
          this.burst(ch, t + d, { filter: 'bandpass', freq: 3200, Q: 0.7, drive: 3, gain: 1.6, attack: 0.0003, dur: 0.05 });
          this.burst(ch, t + d + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, Q: 0.6, drive: 2.5, gain: 4.5, attack: 0.001, dur: 0.26 });
        }
        // Nhịp đập thứ 2: sóng nổ dội từ mặt đất + cả khối xe 50 tấn giật lùi "hự" ~55 ms sau
        this.burst(out, t + 0.055, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 190, Q: 0.8, drive: 2, gain: 3.0 * s, attack: 0.003, dur: 0.4 });
        this.burst(out, t + 0.055, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 0.6, drive: 1.8, gain: 1.6 * s, attack: 0.003, dur: 0.25 });
      }
      // Tiếng xé gió gắt + bụi đất trước đầu nòng bị thổi tung, xích / thân xe rung lách cách
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1800, Q: 0.5, gain: 3.0 * s, attack: 0.004, dur: 0.45 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1600, Q: 0.6, drive: 1.5, gain: 3.8 * s, attack: 0.001, dur: 0.2 });
    }
    if (!remote) this.duck(arty ? 0.2 : 0.3, arty ? 1.6 : 1.1);
    this.noteBlast(distance, remote ? 1 : 1.5);
    // Rền sấm cuộn dài + tiếng dội từ đồi núi, công trình xung quanh
    const roll = this.voice({ gain: sp.gain * 0.9, lowpass: Math.min(sp.lowpass, 600), wet: 0.9, pan: sp.pan * 0.5 });
    this.burst(roll, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 280, gain: 0.48 * s, attack: 0.15, dur: arty ? 3.4 : 2.3 });
    this.playTerrainEchoes(t, s * 0.55 * Math.sqrt(sp.gain), sp.lowpass);
  }

  // Kênh gộp cho phát bắn của chính người chơi: bão hòa mềm cả cụm (như micro / màng nhĩ bị sóng nổ ép),
  // các lớp quyện thành một khối "ĐÙNG" đặc thay vì nghe rời từng lớp.
  // Pháo 155 (heavy): tiếng to tới mức chạm trần, nên cắt bớt siêu trầm <60 Hz (loa thường không phát, tai kém nhạy,
  // chỉ ăn hết headroom làm limiter ép cả tiếng) và nhấn dải "ĐÙM" 160 Hz -> cùng mức đỉnh mà nghe to, dày hơn hẳn
  blastBus(heavy = false) {
    const key = heavy ? '_blastBusHeavy' : '_blastBus';
    if (this[key]) return this[key];
    const ctx = this.ctx;
    const input = ctx.createGain();
    let node = input;
    if (heavy) {
      for (const f of [75, 70]) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = f;
        hp.Q.value = 0.7;
        node.connect(hp);
        node = hp;
      }
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = 160;
      pk.Q.value = 0.9;
      pk.gain.value = 3;
      node.connect(pk);
      node = pk;
    }
    const ws = ctx.createWaveShaper();
    ws.curve = this.getShaper(1.8);
    ws.oversample = '2x';
    const g = ctx.createGain();
    g.gain.value = 0.9;
    node.connect(ws);
    ws.connect(g);
    g.connect(this.weaponBus);
    this[key] = input;
    return input;
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
    if (ammoType === 'AP') { this.noteBlast(distance, 0.6); this.playKineticImpact(distance, hitType, pos); return; }

    const sp = this.spatial(distance, pos);
    const t = this.ctx.currentTime + sp.delay;

    // đạn tiêu chuẩn 120mm (nổ phá đa năng) mang ~2 kg thuốc nổ -> không nhỏ hơn tiếng khai hỏa quá nhiều
    let k = ammoType === 'NORMAL' ? 1.2 : 1.0;
    if (ammoType === 'HE') k = 1.5;
    else if (ammoType === 'RPG') k = 1.25;
    else if (ammoType === 'ANTI_TANK_MISSILE') k = 1.45;   // đầu nổ lõm kép cỡ 152mm: ~4-5 kg thuốc nổ (RPG-7 chỉ ~0,7 kg)
    else if (ammoType === 'CLUSTER') k = 1.1;
    else if (ammoType === 'CLUSTER_SUBMUNITION') k = 0.45;
    const air = hitType === 'AIRBURST';
    const near = Math.max(0, 1 - distance / 900);
    // Cỡ vụ nổ (thời lượng, độ trầm) tách khỏi mức to: đạn 155 dài & trầm hơn, thêm tầng đất rung — mức to chỉ nhích
    // vừa phải vì đỉnh đã sát trần, tăng nữa chỉ làm méo
    const heavy = !!(opts && opts.heavy) && ammoType === 'HE';
    const heat = ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
    const Z = heavy ? 1.45 : 1;
    const lvl = heavy ? 1.3 : ammoType === 'HE' ? 1.2 : ammoType === 'NORMAL' ? 1.0 : 1;
    this.noteBlast(distance, Math.min(1.3, k * lvl));

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
      // Sóng xung kích + quả cầu lửa dựng theo vật lý (synthGunshot 'blast…'): hai biến thể khác nhau cho 2 kênh trái/phải
      // lệch 0,6 ms -> vụ nổ có bề rộng. Bề mặt mềm (bao cát, nước) nuốt âm cao: lọc bớt
      const bk = heavy ? 'blast155' : ammoType === 'HE' ? 'blast120' : ammoType === 'ANTI_TANK_MISSILE' ? 'blastATGM' : heat ? 'blastRPG' : ammoType === 'CLUSTER_SUBMUNITION' ? 'blast30' : 'blastN';
      let bDest = [W.L, W.R];
      if (bright < 0.8) {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700 + 2600 * bright;
        lp.connect(out);
        bDest = [lp, lp];
      }
      bDest.forEach((d, c) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer(bk);
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 6.5 * k * Math.max(0.7, bodyK);
        src.connect(g);
        g.connect(d);
        src.start(t + c * 0.0006);
      });
      // Khối khí & đất bị hất tung: dải trung "rầm" đục, rồi phản xạ mặt đất trễ ~30 ms làm dày tiếng
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 0.6, drive: 1.5, gain: 2.8 * k * Math.min(1, bright + 0.2), attack: 0.002, dur: 0.26 * Z });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 1.5, gain: 0.6 * k, attack: 0.004, dur: 0.5 * k * Z });
      this.burst(out, t + 0.03, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 2, gain: 0.5 * k, attack: 0.004, dur: 0.45 * k * Z });
      // đất đá, mảnh vỡ bị hất tung ngay sau sóng nổ: "rắc rào" dải trung-cao
      if (!air && dirtK > 0) this.burst(out, t + 0.006, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200, Q: 0.5, gain: 5.0 * k * dirtK, attack: 0.003, dur: 0.45 * Z });
      // không khí bị xé + đất cát phụt: nhiễu dày dải 1-3 kHz tắt nhanh — làm tiếng nổ "rõ mặt", không chỉ ục ục
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700, Q: 0.6, drive: 1.2, gain: 2.4 * k * bright, attack: 0.002, dur: 0.16 * Z });
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
  secondaryAt(kind, pos, scale = 1, opts = null) {
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
    const gap = kind === 'flare' ? 0.5 : kind === 'cookoffSmall' ? 0.025 : kind === 'metalCrush' ? 0.35 : kind === 'armorPlate' ? 0.25 : (kind === 'debrisLand' || kind === 'snap') ? 0.07 : kind === 'debris' ? 0.3 : BREAK_MAT[kind] || kind === 'glass' || kind === 'leafStrip' ? 0.12 : 0.15;
    // Cây đổ: một quả nổ quật đổ cả cụm cây cùng lúc, mỗi cây chạm đất một thời điểm riêng -> cho tối đa 3 cây / 0.3 s
    if (kind === 'treeFall') {
      this._treeT = (this._treeT || []).filter(x => now - x < 0.3);
      if (this._treeT.length >= 3) return;
      this._treeT.push(now);
    } else {
      if (this._secLast[kind] && now - this._secLast[kind] < gap) return;
      this._secLast[kind] = now;
    }
    // Tiếng vỡ do chính vụ nổ gây ra được gọi TRƯỚC tiếng nổ (game.js phá cảnh vật rồi mới phát nổ): nếu phát ngay,
    // tiếng nứt "tách" đến trước và tai coi nó là âm chính -> lấn cú nổ. Chờ hết lượt xử lý hiện tại để biết có
    // sóng nổ / phát bắn nào vừa xảy ra không rồi mới phát (lệch < 1 khung hình)
    if (BLAST_MASKABLE[kind] && typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        const m = this.blastMask(d);
        this.playSecondary(kind, d, pos, scale, m ? Object.assign({}, opts, { mask: m }) : opts);
      });
      return;
    }
    this.playSecondary(kind, d, pos, scale, opts);
  }

  // Ghi lại sóng nổ / phát bắn vừa xảy ra (mức tới tai người nghe) để che tiếng vỡ đi kèm
  noteBlast(distance, strength = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._blasts = (this._blasts || []).filter(b => now - b.t < 0.5);
    this._blasts.push({ t: now, g: this.spatial(distance).gain * strength });
  }

  // Độ che 0..1 của sóng nổ gần nhất lên một tiếng vỡ ở khoảng cách d: chỉ khi tiếng nổ tới tai không nhỏ hơn hẳn
  // (gần bằng hoặc gần hơn nguồn vỡ) và vừa xảy ra trong 0,4 s
  blastMask(distance) {
    if (!this._blasts || !this._blasts.length) return 0;
    const now = this.ctx.currentTime, g = this.spatial(distance).gain;
    let m = 0;
    for (const b of this._blasts) {
      const age = now - b.t, r = b.g / g;
      if (age > 0.4 || r < 0.6) continue;
      m = Math.max(m, Math.min(1, r) * (1 - age / 0.4));
    }
    return m > 0.05 ? m : 0;
  }

  // Mảnh vụn vỡ ra đổ xuống: phần lớn vụn đổ NGAY khi mảng tường vỡ (rào rào liền mạch 0,1-0,5 s, không có khoảng lặng),
  // chỉ vài mảnh bị hất cao rơi muộn tới ~√(2h/g) (h: độ cao điểm vỡ, đơn vị game). Mỗi cú va là một tiếng "cạch" ngắn dải
  // rộng (Q thấp — lọc cộng hưởng hẹp nghe thành "cốc cốc" gõ mõ có cao độ) + "bịch" trầm cho mảnh to; nền vụn / sỏi / đất đổ
  debrisRain(out, t, mat, k, { n = 6, h = 16, spread = 0.25, pour = 1 } = {}) {
    const P = BREAK_MAT[mat] || BREAK_MAT.concrete;
    const tf = Math.sqrt(2 * Math.max(0.3, h / 8) / 9.8);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const ti = t + 0.02 + (tf + spread) * Math.pow(u, 1.8) + i * 0.006;
      const big = (0.35 + 0.65 * Math.pow(1 - i / n, 1.3)) * (0.7 + 0.5 * Math.random()) * (1 - 0.5 * u);
      const f = P.chunkF[0] * Math.pow(P.chunkF[1] / P.chunkF[0], Math.random());
      this.burst(out, ti, { filter: 'bandpass', freq: f, Q: P.chunkQ, gain: P.chunkG * k * (0.35 + big), attack: 0.0004, dur: 0.008 + 0.014 * big });
      if (big > 0.6) this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: P.thudF, drive: 1.4, gain: P.thudG * k * big * 0.8, attack: 0.0015, dur: 0.05 + 0.06 * big });
      if (P.ring && Math.random() < 0.4) this.metal(out, ti, { f0: P.ring * (0.7 + Math.random() * 0.8), ratios: [1, 2.4, 4.1], decay: 0.2, gain: 0.07 * k, click: 0.2 });
    }
    if (pour > 0 && P.pourG) {
      // vụn vỡ đổ rào rào liền ngay sau tiếng vỡ, tắt dần theo thời gian rơi
      this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: P.pourF, Q: 0.5, filter2: 'lowpass', freq2: P.pourF * 2.4, gain: P.pourG * k * pour * 1.3, attack: 0.025, dur: 0.3 + 0.35 * tf + 0.3 * pour });
      this.burst(out, t + 0.01, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: P.thudF * 1.3, gain: P.thudG * 0.5 * k * pour, attack: 0.02, dur: 0.25 + 0.2 * pour });
    }
  }

  // Tiếng vật liệu gãy vỡ (bước đầu tiên khi một mảng tường / khối đá / cấu kiện bị phá): mỗi vật liệu một kiểu
  breakCrack(out, t, mat, k) {
    const P = BREAK_MAT[mat] || BREAK_MAT.concrete;
    if (mat === 'woodBreak') {
      // thớ gỗ đứt dần "rắc-rắc-RẮC": chuỗi tiếng nứt khô dồn dập + thân gỗ cộng hưởng "cộc" rỗng
      let ti = t;
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        this.burst(out, ti, { filter: 'bandpass', freq: 900 + Math.random() * 1300, Q: 0.9, drive: 1.5, gain: (last ? 0.7 : 0.3 + Math.random() * 0.25) * k, attack: 0.0004, dur: last ? 0.05 : 0.018 + Math.random() * 0.02 });
        if (last || Math.random() < 0.5) this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 180 + Math.random() * 220, Q: 3.5, drive: 1.4, gain: (last ? 1.5 : 0.6) * k, attack: 0.001, dur: last ? 0.16 : 0.08 });
        if (last) this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 1.6, gain: 0.8 * k, attack: 0.002, dur: 0.14 });
        ti += 0.012 + Math.random() * 0.05;
      }
      return ti - t;
    }
    if (mat === 'sheetMetal') {
      // tôn / khung thép: tấm thép oằn "oàng" trầm rung rinh + xé rít + đinh tán bật
      this.metal(out, t, { f0: 85 + Math.random() * 40, ratios: [1, 1.52, 2.31, 3.4, 4.9], decay: 1.1, gain: 1.1 * k, click: 0.6 });
      this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2300, freqEnd: 1100, sweep: 0.25, Q: 6, gain: 0.35 * k, attack: 0.01, dur: 0.3 });
      for (let i = 0; i < 3; i++) this.burst(out, t + 0.02 + Math.random() * 0.15, { filter: 'highpass', freq: 3000, gain: 0.25 * k, attack: 0.0004, dur: 0.01 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 1.3 * k, attack: 0.002, dur: 0.25 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 0.8, drive: 1.5, gain: 0.7 * k, attack: 0.001, dur: 0.12 });
      return 0.05;
    }
    // vật liệu giòn (bê tông / gạch đá / đất / đá tảng): tiếng nứt toác đanh + khối vỡ "rầm" + tiếng vỡ vụn trung tần
    this.snap(out, t, P.snap * k, P.snapLp, 3);
    this.burst(out, t, { filter: 'bandpass', freq: P.crackF, Q: 0.8, drive: 1.8, gain: P.crackG * k, attack: 0.0004, dur: P.crackD });
    this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: P.bodyF, Q: 0.7, drive: 1.6, gain: P.bodyG * k, attack: 0.002, dur: P.bodyD });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: P.thudF, drive: 2, gain: P.thudG * 1.3 * k, attack: 0.003, dur: P.bodyD * 1.4 });
    return 0.03;
  }

  playSecondary(kind, distance = 0, pos = null, k = 1, opts = null) {
    if (!this.ready()) return;
    const sp = this.spatial(distance, pos);
    // Bị sóng nổ che (opts.mask 0..1, xem blastMask): kết cấu vỡ SAU khi sóng xung kích tới (~20-50 ms) -> tiếng nổ
    // giữ được cú mở đầu, tiếng nứt vỡ chìm dưới sóng nổ rồi mới nổi lên ở đoạn mảnh vụn rơi
    const mask = (opts && opts.mask) || 0;
    const t = this.ctx.currentTime + sp.delay + (mask ? 0.02 + 0.03 * mask : 0);
    // Thứ bậc độ to như ngoài đời (cùng khoảng cách): nổ đạn pháo > kho đạn / gạch ERA > nhà sập > tháp rơi, thép oằn
    // > nổ lốp > xích đứt > mảnh rơi. Thiếu bậc này thì nổ lốp to ngang đạn 155 và tiếng nổ chính mất uy lực
    const LEVEL = {
      cookoff: 0.25, cookoffSmall: 0.3, era: 0.3, fuel: 0.2, flare: 0.22, collapse: 0.11, turretLand: 0.08, metalCrush: 0.25,
      tire: 0.2, trackSnap: 0.35, concrete: 0.3, treeFall: 0.25, armorPlate: 0.35, snap: 0.5, debris: 0.45, debrisLand: 0.45,
      masonry: 0.3, adobe: 0.3, woodBreak: 0.32, sheetMetal: 0.26, rockSplit: 0.25, leafStrip: 0.35, slabImpact: 0.14, splashBig: 0.12
    };
    const out = this.voice({ gain: sp.gain * (LEVEL[kind] || 1), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.08), pan: sp.pan });
    if (mask) {
      // nửa giây đầu bị dìm (tối đa -12 dB), mảnh vụn rơi phía sau trở lại mức thường
      const g0 = out.gain.value;
      out.gain.setValueAtTime(g0 * (1 - 0.75 * mask), this.ctx.currentTime);
      out.gain.setValueAtTime(g0 * (1 - 0.75 * mask), t + 0.05);
      out.gain.linearRampToValueAtTime(g0, t + 0.5);
    }
    const near = Math.max(0, 1 - distance / 900);
    switch (kind) {
      case 'cookoff': {
        // Đạn pháo trong kho bắt lửa: từng viên / liều phóng bùng nổ "ĐÙNG" (mẫu vật lý, cỡ ngẫu nhiên: liều phóng
        // cháy bùng thì trầm & dài, đầu đạn kích nổ thì đanh), mảnh văng rít, lửa phụt "phừng" sau mỗi tiếng nổ
        const n = 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const ti = t + i * (0.05 + Math.random() * 0.2);
          const kk = (0.6 + Math.random() * 0.6) * k;
          const src = this.ctx.createBufferSource();
          src.buffer = this.gunshotBuffer(Math.random() < 0.35 ? 'blast120' : 'blastRPG');
          src.playbackRate.value = 0.75 + Math.random() * 0.45;
          const g = this.ctx.createGain();
          g.gain.value = 4.2 * kk;
          src.connect(g); g.connect(out);
          src.start(ti);
          this.burst(out, ti + 0.01, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 1.5, gain: 0.7 * kk, attack: 0.003, dur: 0.45 });
          if (Math.random() < 0.5) this.burst(out, ti + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400 + Math.random() * 1200, freqEnd: 900, sweep: 0.5, Q: 4, gain: 0.25 * kk, attack: 0.01, dur: 0.5 });
        }
        this.sustainNoise(out, t + 0.03, { buffer: this.pinkNoiseBuffer, freq: 650, Q: 0.5, drive: 1.3, gain: 0.9 * k, attack: 0.06, hold: 0.25 + Math.random() * 0.3, release: 0.7, flicker: 0.4 });
        break;
      }
      case 'cookoffSmall': {
        // Đạn nhỏ (30mm / 12.7mm) trong thùng đạn bị lửa nung nổ: "bụp / tạch" ngắn (xung nổ vật lý nhỏ, mỗi phát một
        // cỡ), thỉnh thoảng đầu đạn văng rít
        const kk = k * (0.7 + Math.random() * 0.6);
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('blast30');
        src.playbackRate.value = 0.7 + Math.random() * 0.6;
        const g = this.ctx.createGain();
        g.gain.value = 3.0 * kk;
        src.connect(g); g.connect(out);
        src.start(t);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 600, drive: 1.5, gain: 0.4 * kk, attack: 0.001, dur: 0.1 });
        if (Math.random() < 0.3) this.burst(out, t + 0.02, { filter: 'bandpass', freq: 2600 + Math.random() * 1500, freqEnd: 1200, sweep: 0.25, Q: 3, gain: 0.12 * kk, attack: 0.002, dur: 0.25 });
        break;
      }
      case 'flare': {
        // Lửa bùng "PHỪNG": khối khí nóng / dầu bén lửa cuộn lên — trầm, dày, phồng lên rồi xẹp (không có xung nổ)
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, freqEnd: 700, sweep: 0.3, drive: 1.6, gain: 2.6 * k, attack: 0.09, dur: 0.9 });
        this.sustainNoise(out, t + 0.03, { buffer: this.pinkNoiseBuffer, freq: 480, Q: 0.5, drive: 1.3, gain: 1.6 * k, attack: 0.18, hold: 0.35 + Math.random() * 0.3, release: 0.9, flicker: 0.45 });
        this.burst(out, t + 0.08, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1200, gain: 0.6 * k, attack: 0.1, dur: 0.8 });
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
      case 'concrete': case 'masonry': case 'adobe': case 'woodBreak': case 'sheetMetal': case 'rockSplit': {
        // Mảng tường / khối bê tông / đá tảng vỡ: tiếng nứt vỡ theo vật liệu -> mảnh vụn văng ra rơi đập đất đúng
        // thời gian rơi (độ cao opts.h), mảnh to "cộc" nặng trước, vụn nhỏ lả tả sau, sỏi / đất đổ rào rào
        const h = opts && opts.h !== undefined ? opts.h : 14;
        // đạn nhỏ đục tường: tiếng đạn chạm đã có (surfaceHit) -> chỉ thêm ít vụn vữa / bê tông rơi lả tả
        if (k < 0.4) { this.debrisRain(out, t + 0.01, kind, k * 1.6, { n: 2, h: Math.min(h, 12), spread: 0.1, pour: 0.25 }); break; }
        const dt = this.breakCrack(out, t, kind, k);
        this.debrisRain(out, t + dt, kind, k, { n: Math.round(5 + 9 * Math.min(1.6, k)), h, spread: 0.1 + 0.15 * k, pour: Math.min(1.2, k) });
        break;
      }
      case 'collapse': {
        // Nhà / nhịp cầu sập. opts: { mat, h (chiều cao, đơn vị game), floors }.
        // Thứ tự như ngoài đời: kết cấu chịu lực gãy (bê tông nứt toác / cốt thép bật "tưng" / gỗ gãy rắc / thép oằn)
        // -> khối nhà rơi tự do ~√(2h/g) giây, tiếng ầm dâng dần -> các sàn đập xuống nối tiếp "ẦM ẦM" -> đá vụn, kính,
        // tôn đổ rào rào kéo dài rồi tắt dần. Không dùng âm < 40 Hz: loa thường không phát được mà ăn hết headroom.
        const mat = (opts && opts.mat) || 'concrete';
        const H = Math.max(16, (opts && opts.h) || 60);
        const floors = Math.max(1, Math.min(8, (opts && opts.floors) || Math.round(H / 25)));
        const tf = Math.sqrt(2 * (H / 8) / 9.8);       // thời gian rơi tự do của phần trên cùng
        const T = 0.15 + floors * 0.12 + tf;           // khớp hình sập: tầng dưới khuỵu trước, các tầng trên rơi theo
        const brittle = mat !== 'woodBreak' && mat !== 'sheetMetal';
        // 1) kết cấu gãy: vài tiếng nứt lớn cách nhau không đều
        for (let i = 0; i < 3; i++) this.breakCrack(out, t + i * (0.07 + Math.random() * 0.12), mat, k * (1 - i * 0.2));
        if (mat === 'concrete') for (let i = 0; i < 3; i++) this.metal(out, t + 0.05 + Math.random() * 0.5, { f0: 900 + Math.random() * 700, ratios: [1, 2.7, 5.1], decay: 0.35, gain: 0.08 * k, click: 0.3 }); // cốt thép đứt
        if (mat === 'sheetMetal') this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 340, freqEnd: 190, sweep: T, Q: 9, gain: 0.5 * k, attack: 0.2, dur: T });   // khung thép oằn rên
        if (mat === 'woodBreak') for (let i = 0; i < 4; i++) this.breakCrack(out, t + 0.2 + Math.random() * T * 0.8, 'woodBreak', 0.6 * k);
        // 2) ầm ầm dâng lên trong lúc khối nhà đổ xuống (trung trầm 120-400 Hz: nghe được cả trên loa nhỏ)
        this.burst(out, t + 0.05, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2, gain: (brittle ? 1.3 : 0.9) * k, attack: T * 0.85, dur: 1.6 + floors * 0.2 });
        this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 220, Q: 0.6, gain: 0.9 * k, attack: T * 0.8, dur: 1.4 + floors * 0.2 });
        // 3) từng sàn / mảng lớn đập xuống: "ẦM" nối tiếp nhau
        for (let f = 0; f < floors; f++) {
          const ti = t + 0.15 + (f + 1) * 0.12 + tf * (0.55 + 0.45 * Math.sqrt((f + 1) / floors)) + Math.random() * 0.08;
          const g = k * (1 - f * 0.06);
          this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2.5, gain: 1.4 * g, attack: 0.004, dur: 0.45 });
          this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: brittle ? 520 : 380, Q: 0.8, drive: 1.5, gain: 0.9 * g, attack: 0.002, dur: 0.22 });
          if (mat === 'sheetMetal') this.metal(out, ti, { f0: 70 + Math.random() * 50, ratios: [1, 1.6, 2.4, 3.7], decay: 0.9, gain: 0.35 * g, click: 0.5 });
        }
        // 4) đá vụn / mảnh gỗ / tôn văng đổ rào rào, kính vỡ lả tả
        this.debrisRain(out, t + T * 0.6, mat, k, { n: 10 + floors * 2, h: 24, spread: 1.2 + floors * 0.15, pour: 0 });
        if (brittle) this.burst(out, t + T * 0.7, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (BREAK_MAT[mat] || BREAK_MAT.concrete).pourF || 900, Q: 0.5, filter2: 'lowpass', freq2: 2200, gain: 0.55 * k, attack: 0.5, dur: 2.4 + floors * 0.3 });
        if (mat === 'concrete') for (let i = 0; i < 10; i++) this.burst(out, t + 0.2 + Math.random() * (T + 1.2), { filter: 'bandpass', freq: 3500 + Math.random() * 4500, Q: 8, gain: (0.04 + Math.random() * 0.06) * k, attack: 0.0005, dur: 0.015 + Math.random() * 0.03 });
        if (near > 0.3) this.duck(0.4, 1.4 + tf);
        break;
      }
      case 'treeFall': {
        // Cây đổ. opts: { dur (s: từ lúc gãy tới lúc tán chạm đất, khớp hình), h (chiều cao cây, đơn vị game), crush }.
        // Thớ thân gãy "rắc… rắc-RẮC" -> gốc kẽo kẹt khi cây bắt đầu nghiêng -> tán lá xé gió "ào" mạnh dần theo tốc độ rơi
        // -> chạm đất: "rầm" trầm của thân + cành gãy răng rắc + lá xào xạc, nảy nhẹ một lần
        const dur = Math.max(0.6, (opts && opts.dur) || 1.6);
        const big = Math.min(1.5, Math.max(0.35, ((opts && opts.h) || 40) / 45));
        this.breakCrack(out, t, 'woodBreak', 0.9 * k);
        if (!(opts && opts.crush)) this.breakCrack(out, t + 0.12 + Math.random() * 0.15, 'woodBreak', 0.6 * k);
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420 / big, freqEnd: 300 / big, sweep: dur * 0.5, Q: 12, gain: 0.22 * k, attack: dur * 0.2, dur: dur * 0.4 });
        this.burst(out, t + dur * 0.15, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 900, filter2: 'lowpass', freq2: 5000, gain: 0.5 * k * big, attack: dur * 0.85, dur: 0.25 });
        const ti = t + dur;
        this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200 + 60 / big, drive: 2, gain: 1.1 * k * big, attack: 0.004, dur: 0.35 + 0.2 * big });
        this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 0.7, gain: 0.5 * k * big, attack: 0.003, dur: 0.18 });
        for (let i = 0; i < 6 + Math.round(4 * big); i++) this.burst(out, ti + Math.pow(Math.random(), 1.6) * 0.4, { filter: 'bandpass', freq: 1300 + Math.random() * 2400, Q: 1.3, gain: (0.12 + Math.random() * 0.2) * k, attack: 0.0004, dur: 0.012 + Math.random() * 0.025 });
        this.burst(out, ti + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1800, gain: 0.4 * k * big, attack: 0.01, dur: 0.9 });
        this.burst(out, ti + 0.22 + Math.random() * 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: 0.35 * k * big, attack: 0.003, dur: 0.18 });
        break;
      }
      case 'leafStrip': {
        // Tán lá / cành bị mảnh đạn, sóng nổ xé trụi: vài cành con gãy "tách" + lá rào rào rơi
        for (let i = 0; i < 4; i++) this.burst(out, t + Math.random() * 0.15, { filter: 'bandpass', freq: 1400 + Math.random() * 2000, Q: 1.2, gain: (0.5 + Math.random() * 0.5) * k, attack: 0.0004, dur: 0.015 });
        this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, Q: 2, gain: 0.5 * k, attack: 0.001, dur: 0.06 });
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1500, gain: 0.9 * k, attack: 0.05, dur: 0.9 });
        break;
      }
      case 'slabImpact': {
        // Nhịp cầu / khối bê tông hàng chục tấn đập xuống lòng sông cạn / mặt đất
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 3, gain: 1.6 * k, attack: 0.003, dur: 0.7 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, Q: 0.8, drive: 1.6, gain: 1.0 * k, attack: 0.002, dur: 0.3 });
        this.breakCrack(out, t + 0.01, 'concrete', 0.8 * k);
        this.debrisRain(out, t + 0.05, 'concrete', k, { n: 12, h: 30, spread: 0.8, pour: 1.2 });
        if (near > 0.3) this.duck(0.5, 1.0);
        break;
      }
      case 'splashBig': {
        // Khối lớn rơi xuống sông: cú đập mặt nước "ÙM" trầm + cột nước tung xé gió -> nước đổ mưa rào xuống, bọt sủi
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 2.5, gain: 1.5 * k, attack: 0.004, dur: 0.6 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 500, Q: 0.7, gain: 0.9 * k, attack: 0.003, dur: 0.35 });
        this.burst(out, t + 0.02, { filter: 'bandpass', freq: 1700, Q: 0.4, gain: 0.6 * k, attack: 0.05, dur: 1.4 });
        this.burst(out, t + 0.7, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1500, gain: 0.45 * k, attack: 0.3, dur: 1.6 });
        for (let i = 0; i < 14; i++) this.burst(out, t + 0.6 + Math.random() * 1.6, { filter: 'bandpass', freq: 1800 + Math.random() * 4000, Q: 4, gain: (0.04 + Math.random() * 0.06) * k, attack: 0.001, dur: 0.03 });
        for (let i = 0; i < 5; i++) { const f = 250 + Math.random() * 400; this.tone(out, t + 0.3 + Math.random() * 1.5, { freq: f, freqEnd: f * 1.8, sweep: 0.05, gain: 0.05 * k, attack: 0.003, dur: 0.06 }); }
        if (near > 0.3) this.duck(0.5, 1.0);
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
    const play = (kind, g) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer(kind);
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.08;
      const gg = this.ctx.createGain();
      gg.gain.value = g;
      src.connect(gg);
      gg.connect(out);
      src.start(t);
    };
    if (hitType === 'DIRECT_HIT') {
      // mũi tên xuyên giáp ~1,6 km/s đập vào giáp thép dày: cú va cực lớn gõ vào khối thép (mẫu dựng theo vật lý)
      play('hitSteelHeavy', 1.6);
      // xé thủng: tiếng rít kim loại tụt tần nhanh
      this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 700, sweep: 0.14, Q: 2.5, drive: 3, gain: 0.5, attack: 0.002, dur: 0.18 });
      // mảnh vỡ văng trong khoang lách cách
      this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3800, Q: 0.9, gain: 0.5, attack: 0.01, dur: 0.35 });
      this.tone(out, t, { freq: 95, freqEnd: 45, sweep: 0.1, drive: 2, gain: 0.7, attack: 0.001, dur: 0.16 });
      // góc chạm xiên / giáp quá dày: mũi tên nảy bật đi rít
      if (Math.random() < 0.15) this.playRicochet(out, t + 0.01);
    } else if (hitType === 'WATER') {
      this.snap(out, t, 0.6, 5000, 4);
      // Mũi tên xuyên cắm xuống nước: "tõm" nặng + cột nước nhỏ đổ xuống
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 0.9, attack: 0.002, dur: 0.18 });
      this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, freqEnd: 3000, sweep: 0.15, Q: 0.8, gain: 0.6, attack: 0.01, dur: 0.3 });
      this.burst(out, t + 0.3, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3200, Q: 0.7, gain: 0.5, attack: 0.1, dur: 0.7 });
    } else if (hitType === 'GROUND' || !hitType) {
      play('hitDirt', 1.2);
      // cắm xuống đất: "huỵch" trầm + đất cát bắn tung
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, freqEnd: 120, sweep: 0.15, drive: 4, gain: 1.0, attack: 0.001, dur: 0.3 });
      this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200, Q: 0.8, gain: 0.7, attack: 0.02, dur: 0.5 });
    } else {
      play('hitDirt', 0.9);
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

    // Mẫu dựng theo vật lý (synthGunshot): 30mm = xung nổ nhỏ của đầu đạn; 12.7mm = cú va (thép: "chát", đất: "phập")
    const play = (kind, g, rate = 1) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer(kind);
      src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.12);
      const gg = this.ctx.createGain();
      gg.gain.value = g;
      src.connect(gg);
      gg.connect(out);
      src.start(t);
    };
    const steel = hitType === 'DIRECT_HIT';
    if (!isMG) play('blast30', 1.6);
    if (steel) play('hitSteel', isMG ? 0.55 : 1.3, isMG ? 1.1 : 0.85);
    else if (isMG && hitType !== 'WATER') play('hitDirt', hitType === 'WALL' || hitType === 'BOULDER' ? 0.35 : 0.45, hitType === 'WALL' || hitType === 'BOULDER' ? 1.4 : 1);

    if (steel) {
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
          // Đạn xuyên động năng chỉ khoét lỗ nhỏ, không có tiếng nổ che phía sau: vụn rơi phải dồn sát cú va.
          // Rải tới ~1 s thì tiếng "bịch" lẻ loi tách hẳn ra, nghe như một tiếng nổ nhỏ thứ hai sau phát bắn
          const kin = cls === 'kinetic';
          for (let i = 0; i < (big ? 6 : 3); i++) this.burst(out, t + (kin ? 0.04 + R() * 0.22 : 0.15 + R() * 0.8), { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: (kin ? 0.35 : 0.5) * k, attack: 0.002, dur: 0.07 });
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
        h.pan.pan.setTargetAtTime(viewPan(impactPos.x - me.x, impactPos.z - me.z, 0.8), t, 0.05);
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
    // Luồng khí xoáy sau đuôi đạn: biên độ chập chờn ngẫu nhiên 30-80 lần/giây -> tiếng "xé vải" lởm chởm của đạn thật,
    // không phải nhiễu lọc trơn tru (nghe như tiếng gió máy). Một nguồn điều biên dùng chung cho các lớp
    const turb = ctx.createBufferSource();
    turb.buffer = this.noiseBuffer;
    turb.loop = true;
    const turbF = ctx.createBiquadFilter();
    turbF.type = 'lowpass';
    turbF.frequency.value = 70;
    turbF.Q.value = 0.5;
    turb.connect(turbF);
    turb.start(t0, Math.random() * 1.5);
    turb.stop(t1 + 0.1);
    nodes.push(turb);
    // lớp nhiễu quét tần: to dần theo hàm mũ (đạn mỗi lúc một gần), tụt cao độ, tắt cụt ở thời điểm nổ.
    // rough: độ "rách" (0..1); wob: chao cao độ theo nhịp đạn lắc khi bay (tỉ lệ)
    const swell = (buf, type, f0, f1, Q, peak, startK = 0, rough = 0, wob = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(f0, t0);
      f.frequency.exponentialRampToValueAtTime(f1, t1);
      f.Q.value = Q;
      if (wob) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 7 + Math.random() * 6;
        const lg = ctx.createGain();
        lg.gain.value = (f0 + f1) * 0.5 * wob;
        lfo.connect(lg);
        lg.connect(f.frequency);
        lfo.start(t0);
        lfo.stop(t1 + 0.1);
        nodes.push(lfo);
      }
      let head = f;
      if (rough) {
        const am = ctx.createGain();
        am.gain.value = 1 - rough * 0.5;
        const depth = ctx.createGain();
        depth.gain.value = rough * 6;   // nhiễu lọc 70 Hz có biên độ nhỏ (~0,08) -> nhân lên cho đủ độ sâu
        turbF.connect(depth);
        depth.connect(am.gain);
        f.connect(am);
        head = am;
      }
      const g = ctx.createGain();
      const ts = t0 + T * startK;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(peak * 0.12, ts + (t1 - ts) * 0.6);
      g.gain.exponentialRampToValueAtTime(peak, t1 - 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
      src.connect(f);
      head.connect(g);
      g.connect(out);
      src.start(t0, Math.random() * 1.5);
      src.stop(t1 + 0.1);
      nodes.push(src);
      gains.push(g);
    };
    // Càng rơi sát xe, cao độ tụt càng sâu (Doppler rõ hơn)
    const drop = 0.5 - near * 0.2;
    // 1. Tiếng xé gió dải trung — thành phần chính, "rách" lởm chởm theo luồng khí xoáy
    swell(this.pinkNoiseBuffer, 'bandpass', heavy ? 1300 : 1800, (heavy ? 1300 : 1800) * drop, 1.4, heavy ? 1.7 : 1.4, 0, 0.75);
    // 2. Tiếng rít của đạn xoay: dải hẹp, cao độ tụt dần và chao nhẹ theo nhịp đạn lắc (tiến động)
    swell(this.pinkNoiseBuffer, 'bandpass', heavy ? 2200 : 2900, (heavy ? 2200 : 2900) * drop, 13, heavy ? 4.5 : 4.2, 0.1, 0.25, 0.025);
    // 3. Đạn cỡ lớn: tiếng gầm trầm cuồn cuộn như tàu hỏa lao tới — cũng rách, không ù đều
    if (heavy) swell(this.brownNoiseBuffer, 'lowpass', 520, 220, 0.7, 1.5, 0.1, 0.6);
    // 4. Vài phần mười giây cuối: luồng gió ép "vụt" dải cao bùng lên ngay trước tiếng nổ
    swell(this.noiseBuffer, 'highpass', 2600, 1800, 0.7, 0.35 * (0.4 + near), 0.75, 0.5);
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

  // Chống loạn tiếng điện tử trong xe: mỗi loại tiếng có khoảng nghỉ tối thiểu; tiếng quan trọng (tên lửa lao tới,
  // bị chiếu laser) vừa kêu thì các tiếng phụ (ping báo vị trí, địch đến gần...) im trong ~1.5 s thay vì chồng lên nhau.
  // Xe tăng thật chỉ có vài tiếng báo trong tai nghe, mỗi tiếng một ý nghĩa rõ ràng.
  // prio: 5 tên lửa lao tới · 4 bị khóa / chiếu laser · 3 đầu dò tên lửa của mình · 2 thao tác khóa mục tiêu · 1 thông tin
  beepOk(kind, gap = 0, prio = 1) {
    const t = this.ctx.currentTime;
    const B = this._beep || (this._beep = { last: {}, hiT: -99, hiP: 0 });
    const last = B.last[kind] === undefined ? -99 : B.last[kind];
    if (t - last < gap) return false;
    if (prio < B.hiP && t - B.hiT < 1.5) return false;
    B.last[kind] = t;
    if (prio >= B.hiP || t - B.hiT >= 1.5) { B.hiP = prio; B.hiT = t; }
    return true;
  }

  // Cảnh báo radar (giữ cứ điểm sắp thua...): 4 tiếng trầm-cao xen kẽ, dịu (tam giác, không phải sóng vuông chói)
  playRadarAlert() {
    if (!this.ready() || !this.beepOk('radar', 6, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    for (let i = 0; i < 4; i++) {
      this.tone(out, t + i * 0.11, { type: 'triangle', freq: i % 2 ? 1250 : 950, gain: 0.08, attack: 0.004, hold: 0.07, dur: 0.02 });
    }
  }

  // Địch (đã biết vị trí) vừa áp sát: 1 (hoặc 2 khi rất gần) tiếng báo khẽ, không lặp liên tục
  playRadarProximityBeep(urgency = 1) {
    if (!this.ready() || !this.beepOk('prox', 6, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    const f = urgency > 1.5 ? 1320 : 1050;
    this.tone(out, t, { freq: f, gain: 0.1, attack: 0.006, hold: 0.06, dur: 0.05 });
    if (urgency > 1.5) this.tone(out, t + 0.14, { freq: f, gain: 0.1, attack: 0.006, hold: 0.06, dur: 0.05 });
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

  // Khóa mục tiêu (TAB): 2 tiếng "tích" ngắn của máy ngắm
  playTargetLockSound() {
    if (!this.ready() || !this.beepOk('lock', 0.3, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    for (let i = 0; i < 2; i++) {
      this.tone(out, t + i * 0.08, { type: 'triangle', freq: 1000, gain: 0.06, attack: 0.003, hold: 0.035, dur: 0.02 });
    }
  }

  // Xác nhận (hạ càng xong, chiếm được cứ điểm): một tiếng liền ngắn
  playTargetLockAcquired() {
    if (!this.ready() || !this.beepOk('ack', 0.5, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    this.tone(out, t, { type: 'triangle', freq: 1480, gain: 0.06, attack: 0.006, hold: 0.22, dur: 0.05 });
  }

  playTargetLost() {
    if (!this.ready() || !this.beepOk('lost', 1, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    this.tone(out, t, { freq: 1100, gain: 0.09, attack: 0.005, hold: 0.08, dur: 0.03 });
    this.tone(out, t + 0.13, { freq: 740, gain: 0.09, attack: 0.005, hold: 0.1, dur: 0.04 });
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
    if (!this.ready() || !this.beepOk('seek', 0, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    const f = 420 + progress * 380;
    this.tone(out, t, { type: 'triangle', freq: f, gain: 0.05, attack: 0.006, hold: 0.07, dur: 0.02, vibrato: 38, vibratoDepth: f * 0.06 });
  }

  // Đầu dò đã khóa chắc mục tiêu: tiếng "tít" liền, cao và sạch
  playMissileLock() {
    if (!this.ready() || !this.beepOk('mlock', 0.3, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.75);
    this.tone(out, t, { type: 'triangle', freq: 1760, gain: 0.06, attack: 0.005, hold: 0.36, dur: 0.05 });
  }

  // Đã khóa, chờ phóng: nhắc rất khẽ để biết vẫn đang giữ khóa
  playMissileLockHold() {
    if (!this.ready() || !this.beepOk('mhold', 1.5, 1)) return;
    const t = this.ctx.currentTime;
    this.tone(this.headset(0.5), t, { freq: 1760, gain: 0.035, attack: 0.004, hold: 0.05, dur: 0.03 });
  }

  // Máy báo bị chiếu laser: m = 1 khóa súng (2 tiếng trầm-cao), m = 2 tia dẫn tên lửa (3 tiếng nhanh, cao hơn)
  playLockWarning(m = 1) {
    if (!this.ready() || !this.beepOk('lw' + m, m === 2 ? 0.8 : 2.5, 4)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.85);
    if (m === 2) {
      for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.1, { type: 'triangle', freq: 1500, gain: 0.08, attack: 0.003, hold: 0.05, dur: 0.02 });
    } else {
      this.tone(out, t, { type: 'triangle', freq: 880, gain: 0.07, attack: 0.003, hold: 0.08, dur: 0.02 });
      this.tone(out, t + 0.13, { type: 'triangle', freq: 1175, gain: 0.07, attack: 0.003, hold: 0.08, dur: 0.02 });
    }
  }

  // Tên lửa đang lao tới: cặp tiếng trầm-cao luân phiên "bíp-bốp" của máy báo động trong xe, dồn nhanh dần khi tên
  // lửa tới gần (urgency 0..1; game.js gọi mỗi 0.7 -> 0.3 s). Bản cũ là sóng vuông 1.7-2.2 kHz trượt giọng, gọi tới
  // 11 lần/giây -> nghe như còi rè chói tai. Âm tam giác cho tiếng tròn mà vẫn nổi rõ hơn mọi tiếng báo khác
  playMissileWarning(urgency = 0) {
    if (!this.ready() || !this.beepOk('mwarn', 0.25, 5)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    const u = Math.max(0, Math.min(1, urgency));
    const lo = 880 + u * 160, hi = lo * 1.335;   // quãng 4 đúng: rõ, không chát như quãng 2 / quãng 7
    const len = 0.085 - u * 0.025;
    this.tone(out, t, { type: 'triangle', freq: hi, gain: 0.085, attack: 0.004, hold: len, dur: 0.025 });
    this.tone(out, t + len + 0.03, { type: 'triangle', freq: lo, gain: 0.085, attack: 0.004, hold: len, dur: 0.03 });
  }

  // Bộ đàm: tiếng xẹt mở kênh + tiếng bíp xác nhận + xẹt đóng kênh
  playRadioChirp() {
    if (!this.ready() || !this.beepOk('radio', 3, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    this.burst(out, t, { filter: 'bandpass', freq: 1900, Q: 0.8, gain: 0.1, dur: 0.07 });
    this.tone(out, t + 0.07, { freq: 1450, gain: 0.07, attack: 0.004, hold: 0.06, dur: 0.03 });
    this.burst(out, t + 0.16, { filter: 'bandpass', freq: 2300, Q: 0.8, gain: 0.06, dur: 0.12 });
  }

  // Báo vị trí địch (radar trinh sát / đồng đội báo qua bộ đàm): 1 tiếng ping khẽ, tối đa ~1 lần mỗi 8 s —
  // đồng đội báo dồn dập thì chỉ kêu lần đầu, phần còn lại đọc trên bảng tin
  playReconPing() {
    if (!this.ready() || !this.beepOk('ping', 8, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.6, wet: 0.5 });
    this.tone(out, t, { freq: 1480, gain: 0.1, attack: 0.004, hold: 0.04, dur: 0.25 });
    this.tone(out, t + 0.32, { freq: 1480, gain: 0.03, attack: 0.004, hold: 0.03, dur: 0.2 });
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
      // Gằn máy khi đạp ga (bão hòa song song): một nhánh tiếng máy được ép méo tanh rồi trộn lại — xung nổ dày, đặc, "gầm"
      // như máy đang gồng hết công suất; nhả ga thì nhánh này tắt, máy về tiếng tròn. Cắt trên ~1 kHz để phần méo
      // không thành tiếng rè ở dải trên
      e.satIn = ctx.createGain();
      e.satIn.gain.value = 0;
      const sat = ctx.createWaveShaper();
      sat.curve = this.getShaper(3);
      const satLp = ctx.createBiquadFilter();
      satLp.type = 'lowpass';
      satLp.frequency.value = 950;
      satLp.Q.value = 0.5;
      e.satOut = ctx.createGain();
      e.satOut.gain.value = 0;
      chest.connect(e.satIn);
      e.satIn.connect(sat);
      // bỏ phần siêu trầm của nhánh méo: chỉ lấy tiếng gằn 120-900 Hz (loa nhỏ vẫn phát được), không thêm ù
      const satHp = ctx.createBiquadFilter();
      satHp.type = 'highpass';
      satHp.frequency.value = 120;
      satHp.Q.value = 0.6;
      sat.connect(satHp);
      satHp.connect(satLp);
      satLp.connect(e.satOut);
      e.satOut.connect(lpOut);
      // Cộng hưởng ống xả: khối khí trong ống xả dài cộng hưởng ở ~70-110 Hz -> tiếng "ùm" đầy, nặng khi gầm máy
      e.pipe = ctx.createBiquadFilter();
      e.pipe.type = 'peaking';
      e.pipe.frequency.value = 90;
      e.pipe.Q.value = 1.4;
      e.pipe.gain.value = 0;
      lpOut.connect(e.pipe);
      e.pipe.connect(out);
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
        e.orders.push({ o, k, g });
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

      // Tiếng gõ "lạch cạch" của máy diesel (kim phun, xu-páp): vài tiếng tách RỜI RẠC, ngẫu nhiên mỗi giây (lên lịch
      // trong updateEngine). Không gõ theo từng nhát nổ: 75-180 nhát/giây ở dải 1-2 kHz tai không nghe ra "lạch cạch"
      // mà nghe thành một nốt rè "è è" ở dải trên
      e.clatterOut = ctx.createGain();
      e.clatterOut.gain.value = 1;
      e.clatterOut.connect(eout);

      // Turbo rít nhẹ theo vòng tua
      e.turbo = ctx.createOscillator();
      e.turbo.type = 'sine';
      e.turbo.frequency.value = 1800;
      e.turboGain = ctx.createGain();
      e.turboGain.gain.value = 0;
      e.turbo.connect(e.turboGain);
      e.turboGain.connect(out);

      // Lớp dải trên KHÔNG đi qua bộ cắt 1.8 kHz của tiếng máy (vẫn chịu "quen tai" khi đứng chờ lâu)
      e.habitHi = ctx.createGain();
      e.habitHi.gain.value = 1;
      e.habitHi.connect(out);
      // Quạt làm mát khoang máy + bánh răng, bơm, dây đai: luồng gió / tiếng cơ khí băng rộng theo vòng tua. Xe tăng thật
      // nghe rõ tiếng quạt "vù vù" lẫn trong tiếng máy. Không điều biên theo nhịp nổ (chỉ chao chậm ngẫu nhiên) nên không
      // thành tiếng "è è" ở dải trên, mà làm tiếng máy bớt "tròn trịa" như đàn điện tử
      const mech = ctx.createBufferSource();
      mech.buffer = this.pinkNoiseBuffer;
      mech.loop = true;
      e.mechFilter = ctx.createBiquadFilter();
      e.mechFilter.type = 'bandpass';
      e.mechFilter.frequency.value = 700;
      e.mechFilter.Q.value = 0.45;
      const mechAm = ctx.createGain();
      mechAm.gain.value = 1;
      const mechRnd = ctx.createGain();
      mechRnd.gain.value = 3;
      jitF.connect(mechRnd);
      mechRnd.connect(mechAm.gain);
      e.mechGain = ctx.createGain();
      e.mechGain.gain.value = 0;
      mech.connect(e.mechFilter);
      e.mechFilter.connect(mechAm);
      mechAm.connect(e.mechGain);
      e.mechGain.connect(e.habitHi);
      // Cửa hút gió / máy nén turbo: tiếng "hút xì" băng rộng theo tốc độ quay của turbo (turbo có quán tính: gằn ga
      // thì vọt lên sau ~0.5 s, nhả ga vẫn quay trớn rít nhỏ dần)
      const air = ctx.createBufferSource();
      air.buffer = this.noiseBuffer;
      air.loop = true;
      e.airFilter = ctx.createBiquadFilter();
      e.airFilter.type = 'bandpass';
      e.airFilter.frequency.value = 2400;
      e.airFilter.Q.value = 0.9;
      e.airGain = ctx.createGain();
      e.airGain.gain.value = 0;
      air.connect(e.airFilter);
      e.airFilter.connect(e.airGain);
      e.airGain.connect(e.habitHi);
      mech.start(0, 0.83);
      air.start(0, 1.7);

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
      e.trackFilter.frequency.value = 1100;
      e.trackFilter.Q.value = 1.1;
      e.trackAm = ctx.createGain();
      e.trackAm.gain.value = 0.3;
      e.trackLfoA = ctx.createOscillator();
      e.trackLfoA.type = 'triangle';   // sóng vuông bật / tắt nhiễu đột ngột -> nghe thành "xẹt xẹt" như nhiễu radio
      e.trackLfoB = ctx.createOscillator();
      e.trackLfoB.type = 'triangle';
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

      [e.fire, e.crank, comb, e.turbo, exh, trk, e.trackLfoA, e.trackLfoB, rum, sq, sqLfo, jit, rough].forEach(n => n.start());
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
    const allGains = [e.engineGain, e.combGain, e.turboGain, e.exhaustGain, e.rumbleGain, e.squealGain, e.mechGain, e.airGain];
    if (o.dead) {
      // Xe đã bị hạ: máy tắt lịm
      allGains.forEach(g => g && g.gain.setTargetAtTime(0, t, 0.4));
      this.trackGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._mv) this._mv.crunch.gain.setTargetAtTime(0, t, 0.2);
      this._engWasDead = true;
      return;
    }
    const sr = Math.max(0, Math.min(1.2, speedRatio || 0));
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
    const dsr = (sr - (this._srPrev === undefined ? sr : this._srPrev)) / dtE;
    const accel = Math.max(0, dsr);
    this._srPrev = sr;
    this._dsr = (this._dsr || 0) + (dsr - (this._dsr || 0)) * Math.min(1, dtE * 8);
    this._load = (this._load || 0) + (Math.min(1, accel * 1.6) - (this._load || 0)) * Math.min(1, dtE * (accel > 0.05 ? 6 : 2.5));
    // xe xích quay đầu / bẻ lái: hai dải xích kéo ngược nhau rất tốn sức -> máy gằn lên dù xe gần như đứng yên
    const pivot = wheeled ? 0 : Math.min(1, turn * 0.6) * Math.max(0, 1 - sr);
    // Leo dốc / lội bùn, cát, nước (engineLoad > 1): máy bị ghì — đạp lút ga mà vòng tua tụt xuống, lên vòng chậm chạp,
    // gằn nặng, ục ịch "ì ạch"; vòng tua chao chậm (bộ điều tốc gồng theo tải). Chỉ khi xe đang chạy (đứng trên dốc thì không)
    const climbT = Math.min(1, Math.max(0, (engineLoad - 1) / 0.8) * Math.min(1, sr * 4) + (o.stall ? 0.6 : 0));
    this._climb = (this._climb || 0) + (climbT - (this._climb || 0)) * Math.min(1, dtE * (climbT > (this._climb || 0) ? 1.5 : 2.5));
    const climb = this._climb;
    if (!(this._surgeNext > t - 2)) this._surgeNext = t;
    if (t >= this._surgeNext) { this._surgeTgt = Math.random() * 2 - 1; this._surgeNext = t + 0.45 + Math.random() * 0.7; }
    const surge = climb * (this._surgeTgt || 0);
    let rpm = Math.min(1, 0.15 + sr * 0.6 + this._load * 0.25 + pivot * 0.18 + (isBoost ? 0.1 : 0));
    rpm = 0.15 + (rpm - 0.15) * (1 - 0.3 * climb);
    // Máy hỏng nặng: không lên nổi vòng tua cao, vòng tua dao động ì ạch
    if (dmg >= 2) rpm = Math.min(rpm, 0.62) * (0.9 + Math.random() * 0.12);
    // Độ đạp ga: tăng tốc = đạp lút ga (máy gằn, ống xả gầm to, nhiều họa âm cao); giữ tốc độ = ga vừa đủ thắng sức cản
    // (chạy càng nhanh càng cần nhiều công suất); nhả ga / phanh = máy ghìm lại (nhỏ, tối hẳn, chỉ còn tiếng cơ khí và
    // turbo quay trớn) dù vòng tua còn cao. Máy thật to nhỏ theo GA nhiều hơn theo vòng tua
    const coasting = this._dsr < -0.08;
    const thrT = coasting ? 0.03 : Math.min(1, 0.1 + sr * 0.5 + this._load * 0.9 + pivot * 0.45 + (isBoost ? 0.15 : 0) + climb * 0.45);
    this._thr = (this._thr === undefined ? thrT : this._thr) + (thrT - (this._thr === undefined ? thrT : this._thr)) * Math.min(1, dtE * (thrT > (this._thr || 0) ? 9 : 5));
    const thr = this._thr;
    // Turbo có quán tính: vọt lên theo khí xả (vòng tua × ga) sau ~0.5 s, nhả ga vẫn quay trớn rồi rít nhỏ dần
    const boostT = Math.min(1, rpm * (0.25 + thr * 0.85));
    this._turboS = (this._turboS || 0) + (boostT - (this._turboS || 0)) * Math.min(1, dtE * (boostT > (this._turboS || 0) ? 1.8 : 0.7));
    const tb = this._turboS;
    // Tần số nổ thật: V12 (xích) ~55 Hz không tải -> ~180 Hz; diesel 6 máy xe tải 6x6 ~32 -> 112 Hz; xe 4x4 ~38 -> 130 Hz
    const fireHz = (truck ? 32 + rpm * 80 : wheeled ? 38 + rpm * 92 : 55 + rpm * 125) * (1 + surge * 0.02);
    // máy bị ghì: vòng tua đổi chậm hẳn (lên dốc nhấn ga máy chỉ gầm lên từ từ)
    const tcF = tc + climb * 0.4;
    e.fire.frequency.setTargetAtTime(fireHz, t, tcF);
    if (e.orders) e.orders.forEach(r => r.o.frequency.setTargetAtTime(fireHz * r.k, t, tcF));
    e.crank.frequency.setTargetAtTime(fireHz * 0.5, t, tcF);
    // Giọng máy theo loại: V12 xe xích nổ dày, đều (bậc lẻ nhỏ, bậc cao rõ); diesel 6 máy xe tải "lục bục" ục ịch (bậc
    // nửa & 1.5 lớn); máy 4x4 nhỏ quay nhanh, đanh hơn
    if (e.orders && this._engVoice !== type) {
      this._engVoice = type;
      const A = truck ? [0.45, 1, 0.5, 0.5, 0.26, 0.1] : wheeled ? [0.3, 1, 0.38, 0.62, 0.36, 0.2] : [0.16, 1, 0.22, 0.7, 0.4, 0.2];
      e.orders.forEach((r, i) => r.g.gain.setTargetAtTime(A[i], t, 0.05));
    }
    // Máy hư: mất tiếng gằn cao (nghẹt), tiếng cháy nổ thô và ống xả to hơn (khói đen phụt)
    const choke = dmg >= 2 ? 0.55 : dmg === 1 ? 0.8 : 1;
    // đạp ga mạnh: cháy nổ mạnh -> nhiều họa âm cao (máy "gằn"); nhả ga: tiếng máy tròn, tối
    const engLp = fireHz * (2.3 + thr * 1.6) * (1 + climb * 0.1) * choke;
    e.engineFilter.frequency.setTargetAtTime(engLp, t, tc);
    if (e.engineFilter2) e.engineFilter2.frequency.setTargetAtTime(engLp * 1.2, t, tc);
    // Cắt luôn tần số nổ gốc (và mọi thứ dưới nó): loa chỉ phát nó thành tiếng ù, còn tai vẫn "nghe ra" nhịp máy trầm
    // qua các họa âm phía trên (âm gốc ảo) — máy nghe dày, chắc mà không ù
    if (e.hp1) {
      e.hp1.frequency.setTargetAtTime(Math.max(42, fireHz * (0.8 - thr * 0.3)), t, tc);
      e.hp2.frequency.setTargetAtTime(38, t, tc);
    }
    const tk = (1 + climb * 0.06) * (1 + surge * 0.1) * (truck ? 1.15 : 1);
    // máy đang gồng (đạp ga): to, đặc, gằn hẳn lên; nhả ga / không tải giữ nguyên tiếng tròn, nhỏ
    const grunt = Math.max(0, thr - 0.25) / 0.75;
    const eg = (0.012 + rpm * 0.014 + thr * 0.018 + grunt * 0.022) * tk;
    // nhánh gằn máy + cộng hưởng ống xả chỉ mở khi đạp ga; nhả ga / không tải: tắt
    if (e.satIn) {
      e.satIn.gain.setTargetAtTime(6 * grunt, t, tc);
      e.satOut.gain.setTargetAtTime(0.05 * grunt * tk, t, tc);
      e.pipe.frequency.setTargetAtTime(Math.min(115, Math.max(70, fireHz * 0.75)), t, tc);
      e.pipe.gain.setTargetAtTime(4 * grunt + 1.5 * climb, t, tc);
    }
    e.engineGain.gain.setTargetAtTime(eg, t, tc);
    e.combGain.gain.setTargetAtTime((0.06 + rpm * 0.12 + thr * 0.24) * (1 + dmg * 0.35) * tk, t, tc);
    if (e.combFilter) e.combFilter.frequency.setTargetAtTime(200 + rpm * 300 + thr * 260, t, tc);
    e.turbo.frequency.setTargetAtTime(1500 + tb * 2600, t, 0.08);
    // Turbo hỏng: tiếng rít mất hẳn
    e.turboGain.gain.setTargetAtTime(dmg >= 2 ? 0 : Math.max(0, tb - 0.2) * (isBoost ? 0.009 : 0.0055), t, 0.1);
    if (e.airGain) {
      e.airGain.gain.setTargetAtTime(dmg >= 2 ? 0.002 : (0.002 + tb * 0.016) * (wheeled ? 0.8 : 1), t, 0.1);
      e.airFilter.frequency.setTargetAtTime(1700 + tb * 2300, t, 0.1);
    }
    // quạt làm mát + cơ khí: theo vòng tua (quạt dẫn động từ trục máy), không theo ga
    if (e.mechGain) {
      e.mechGain.gain.setTargetAtTime((0.006 + rpm * 0.026) * (wheeled ? 0.75 : 1), t, tc);
      e.mechFilter.frequency.setTargetAtTime(450 + rpm * 900, t, tc);
    }
    e.exhaustGain.gain.setTargetAtTime((0.04 + rpm * 0.07 + thr * 0.15 + grunt * 0.1) * (1 + dmg * 0.3) * tk, t, tc);
    if (e.exhaustFilter) e.exhaustFilter.frequency.setTargetAtTime((200 + rpm * 260 + thr * 320) * choke, t, tc);
    if (e.pulseSmooth) e.pulseSmooth.frequency.setTargetAtTime(fireHz * 1.1, t, tc);
    // Độ lệch nhịp nổ: không tải chao rõ (máy "lục bục"), vòng tua cao đều hơn; máy hư chao mạnh
    // cao độ máy chỉ chao rất nhẹ (~±1% lúc không tải); chao mạnh nghe như băng cát-xét nhão / còi méo
    if (e.jitterDepth) e.jitterDepth.gain.setTargetAtTime(fireHz * 0.15 * Math.max(0, 1 - (rpm - 0.15) * 2.2) + (dmg ? fireHz * 0.12 * dmg : 0), t, tc);
    if (e.roughDepth) e.roughDepth.gain.setTargetAtTime(3.5 * Math.max(0.3, 1 - (rpm - 0.15) * 1.6) * (1 + dmg * 0.5) * (1 + climb * 0.4), t, tc);
    // Tiếng gõ kim phun / xu-páp: vài tiếng tách lẻ, nhịp ngẫu nhiên; rõ khi không tải, chìm dần khi máy gầm lên
    if (e.clatterOut && !this.isMapMuted) {
      if (!(this._clkNext > t - 0.5)) this._clkNext = t + Math.random() * 0.2;
      while (this._clkNext < t + 0.12) {
        const tt = this._clkNext;
        const g = (0.05 - rpm * 0.025) * (truck ? 1.2 : 1) * (0.4 + Math.random() * 0.9);
        this.burst(e.clatterOut, tt, { filter: 'bandpass', freq: 1100 + Math.random() * 700, Q: 1.4, gain: g, attack: 0.001, dur: 0.012 + Math.random() * 0.01 });
        this._clkNext = tt + (0.06 + Math.random() * 0.22) / (1 + rpm);
      }
    }
    // Đứng chờ lâu: tiếng máy lùi dần về nền (tai quen tiếng máy, như kíp lái ngồi trong xe); nhấn ga là trở lại ngay
    if (e.habit) {
      const dtI = this._engLastT ? Math.min(0.1, t - this._engLastT) : 0.016;
      this._idleT = (sr < 0.03 && !isBoost && turn < 0.1) ? (this._idleT || 0) + dtI : 0;
      const hab = 1 - 0.4 * Math.min(1, Math.max(0, (this._idleT - 3) / 5));
      e.habit.gain.setTargetAtTime(hab, t, this._idleT > 0 ? 0.8 : 0.08);
      if (e.habitHi) e.habitHi.gain.setTargetAtTime(hab, t, this._idleT > 0 ? 0.8 : 0.08);
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
      e.trackFilter.frequency.setTargetAtTime(800 + sr * 500, t, tc);   // dải 1.3-2.2 kHz nghe như nhiễu rè
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
      // Đất sỏi bị xích / lốp nghiến: tiếng "rào rào" trầm, dày, to nhỏ chậm ngẫu nhiên theo mặt đất. Chuỗi tiếng tách
      // sắc dưới 1 ms ở dải 1.3-2.2 kHz (bản cũ) nghe thành tiếng nhiễu "lẹt xẹt" như radio rè, không ra tiếng sỏi
      const cg = ctx.createGain();
      cg.gain.value = 0;
      cg.connect(this.vehicleBus);
      const gr = ctx.createBufferSource();
      gr.buffer = this.pinkNoiseBuffer;
      gr.loop = true;
      const gf = ctx.createBiquadFilter();
      gf.type = 'bandpass';
      gf.frequency.value = 400;
      gf.Q.value = 1.0;
      const gAm = ctx.createGain();
      gAm.gain.value = 1;
      const gm = ctx.createBufferSource();
      gm.buffer = this.pinkNoiseBuffer;
      gm.loop = true;
      gm.playbackRate.value = 0.63;
      const gmF = ctx.createBiquadFilter();
      gmF.type = 'lowpass';
      gmF.frequency.value = 9;
      const gmD = ctx.createGain();
      gmD.gain.value = 5;
      gm.connect(gmF);
      gmF.connect(gmD);
      gmD.connect(gAm.gain);
      const gk = ctx.createGain();
      gk.gain.value = 0.08;   // to hơn thì dải 1-4 kHz của tiếng sỏi ngang cả tiếng máy -> "lẹt xẹt"
      gr.connect(gf);
      gf.connect(gAm);
      gAm.connect(gk);
      gk.connect(cg);
      // vài hòn sỏi lộp cộp lẫn vào: tiếng tách thưa nhưng đã làm mềm (cắt dải cao) và nhỏ
      const cr = ctx.createBufferSource();
      cr.buffer = this.crackleBuffer;
      cr.loop = true;
      const cf = ctx.createBiquadFilter();
      cf.type = 'lowpass';
      cf.frequency.value = 800;
      cf.Q.value = 0.5;
      const ck = ctx.createGain();
      ck.gain.value = 0.35;
      cr.connect(cf);
      cf.connect(ck);
      ck.connect(cg);
      gr.start(0, 2.3);
      gm.start(0, 0.9);
      cr.start();
      this._mv = { next: [0, 0], thump: 0, bus: [mk(-0.35), mk(0.35)], mid: mk(0), crunch: cg, crunchF: cf, grindF: gf, crunchSrc: cr };
    }
    const M = this._mv;
    const v = Math.max(0, Math.min(1.2, speed));
    M.crunch.gain.setTargetAtTime(Math.min(1.4, v * 1.3) * (wheeled ? 0.8 : 1) * (1 - 0.85 * (this._wadeK || 0)), t, 0.1);   // gầm ngập nước: không còn tiếng sỏi (xem wading_audio.js)
    M.crunchF.frequency.setTargetAtTime(600 + v * 400, t, 0.1);
    if (M.grindF) M.grindF.frequency.setTargetAtTime((wheeled ? 300 : 340) + v * 240, t, 0.1);
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
          this.metal(M.bus[s], tt, { f0: (heavy ? 240 : 320) * (0.75 + Math.random() * 0.6), ratios: [1, 2.31, 3.92], decay: 0.04 + Math.random() * 0.05, gain: g, click: 0.3 });
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
  playVehicleDestroyed(tankType = 'ALL_ROUNDER', pos = null, kind = 'det', dur = 5) {
    if (!this.ready()) return;
    const L = this.listenerXZ();
    const d = pos ? Math.hypot(pos.x - L.x, pos.z - L.z) : 0;
    if (d > 3200) return;
    const sp = this.spatial(d, pos);
    if (kind === 'vent' || kind === 'crew' || kind === 'fuel') { this.playWreckEvent(tankType, kind, d, sp, dur); return; }
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = tankType === 'ARTILLERY' ? 1.9 : tankType === 'ALL_ROUNDER' ? 1.6 : tankType === 'GATLING' ? 1.0 : 0.6;
    const t = this.ctx.currentTime + sp.delay + (big ? 0.12 + Math.random() * 0.12 : 0.05);
    const out = this.voice({ gain: sp.gain * 0.2 * (big ? 1.3 : 1.15), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.12), pan: sp.pan });
    if (tankType !== 'SCOUT') {
      // Kích nổ kho đạn dựng theo vật lý (như đạn nổ, xem synthGunshot 'blastAmmo'): sóng xung kích dài hơn đạn 155
      // (hàng chục kg thuốc phóng + thuốc nổ), vài viên kích nổ dây chuyền nối nhau trong ~0,1 s -> "ẦM-ẦM" dày, rồi
      // khối lửa thuốc phóng bùng cháy. Thay cho nhiễu lọc thấp + sóng sin trầm cũ (nghe "ục" đục, bé hơn 1 quả 155)
      const W = this.stereoSpread(out, 0.7);
      const bk = tankType === 'GATLING' ? 'blast120' : 'blastAmmo';
      [W.L, W.R].forEach((dst, c) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer(bk);
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 6.5 * Math.min(1.25, k);
        src.connect(g);
        g.connect(dst);
        src.start(t + c * 0.0007);
      });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 800, Q: 0.6, drive: 1.5, gain: 2.4 * k, attack: 0.002, dur: 0.35 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700, Q: 0.6, drive: 1.2, gain: 1.8 * k, attack: 0.002, dur: 0.2 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 1.5, gain: 0.6 * k, attack: 0.004, dur: 0.6 });
      // thân thép xe bị xé toạc: tiếng thép ngân trầm lẫn trong tiếng nổ + mảnh thép văng rít
      this.metal(out, t + 0.01, { f0: 90 + Math.random() * 30, ratios: [1, 1.7, 2.6, 3.9], decay: 1.2, gain: 0.5 * k, click: 0.5 });
      this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 900, sweep: 0.5, Q: 3, gain: 0.5 * k, attack: 0.01, dur: 0.5 });
      if (d < 700) this.duck(0.25, 1.4);
      // rền cuộn + tiếng dội
      const roll = this.voice({ gain: sp.gain * 0.8, lowpass: Math.min(sp.lowpass, 500), wet: 0.95, pan: sp.pan * 0.5 });
      this.burst(roll, t + 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: 0.35 * k, attack: 0.15, dur: 2.4 });
      this.playTerrainEchoes(t, 0.45 * k * Math.sqrt(sp.gain), sp.lowpass);
    }
    // khối thuốc phóng / nhiên liệu bùng cháy thành quả cầu lửa sau tiếng nổ: gầm "PHỪỪNG" dày, phồng lên rồi lụi dần
    this.sustainNoise(out, t + 0.06, { buffer: this.pinkNoiseBuffer, freq: 520, Q: 0.45, drive: 1.5, gain: (big ? 2.6 : 1.8) * Math.min(1.2, k), attack: 0.16, hold: big ? 1.1 : 0.6, release: 1.8, flicker: 0.4 });
    this.sustainNoise(out, t + 0.06, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: (big ? 1.4 : 1.0), attack: 0.2, hold: big ? 1.2 : 0.7, release: 2, flicker: 0.3 });
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
      // Thùng đạn 12.7 + bình nhiên liệu: tiếng nổ vừa (vật lý 'blastN') rồi "phừng"
      [0, 1].forEach(c => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('blastN');
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 2.0;
        src.connect(g);
        g.connect(out);
        src.start(t + c * 0.0007);
      });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 1.5, gain: 1.2, attack: 0.002, dur: 0.4 });
    }
  }

  // Tiếng lửa / áp suất kéo dài có bao "giữ" (burst() chỉ tắt dần): vào attack, giữ hold có chập chờn ngẫu nhiên, nhả release
  sustainNoise(dest, t, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.buffer || this.pinkNoiseBuffer;
    src.loop = true;
    let node = src;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.value = o.freq || 900;
    f.Q.value = o.Q !== undefined ? o.Q : 0.5;
    node.connect(f); node = f;
    if (o.drive) { const ws = ctx.createWaveShaper(); ws.curve = this.getShaper(o.drive); node.connect(ws); node = ws; }
    const g = ctx.createGain();
    const G = o.gain || 1, a = o.attack || 0.1, h = o.hold || 1, r = o.release || 1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(G, t + a);
    // chập chờn: mức đổi ngẫu nhiên mỗi 80-200 ms (lửa phụt không đều), không theo chu kỳ
    for (let ti = t + a + 0.08; ti < t + a + h; ti += 0.08 + Math.random() * 0.12) g.gain.linearRampToValueAtTime(G * (1 - (o.flicker || 0.35) * Math.random()), ti);
    g.gain.linearRampToValueAtTime(G * 0.8, t + a + h);
    g.gain.setTargetAtTime(0.0001, t + a + h, r / 3.5);
    node.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * Math.max(0, src.buffer.duration - 0.5));
    src.stop(t + a + h + r + 0.3);
  }

  /**
   * Các kiểu xe chết KHÔNG nổ tung ngay (explosion_fx.killInfo):
   * - 'crew': đạn xuyên khoang kíp lái — nghe từ ngoài là cú "THỤP" đục bị vỏ thép nuốt, thân xe ngân trầm, mảnh văng lạch
   *           cạch bên trong, rồi lửa bén "phừ" nhỏ dần to (tiếng lửa cháy liên tục do fireSource lo)
   * - 'fuel': dầu / nhiên liệu bốc cháy "PHỪNG" trầm + lửa cuộn
   * - 'vent': hốc đạn sau tháp xả áp — tấm xả áp bật "BỤP-KENG", rồi đạn cháy phụt lửa thẳng lên gầm rít như động cơ
   *           phản lực / mỏ hàn khổng lồ suốt dur giây, lúc bùng lúc dịu (tiếng đạn nổ lách tách là 'cookoff' riêng)
   */
  playWreckEvent(tankType, kind, d, sp, dur) {
    const t = this.ctx.currentTime + sp.delay + 0.03;
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = big ? 1 : tankType === 'GATLING' ? 0.85 : 0.65;
    const out = this.voice({ gain: sp.gain * 0.2, lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.12), pan: sp.pan });
    if (kind === 'crew') {
      // nổ / áp suất bên trong khoang kín: chỉ dải trầm-trung lọt ra ngoài vỏ thép
      const thud = this.ctx.createBiquadFilter();
      thud.type = 'lowpass'; thud.frequency.value = big ? 900 : 1500;
      thud.connect(out);
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer('blastRPG');
      src.playbackRate.value = 0.8 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 3.4 * k;
      src.connect(g); g.connect(thud);
      src.start(t);
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 1.5, gain: 1.2 * k, attack: 0.003, dur: 0.35 });
      // thân xe ngân trầm (cả khối thép bị đánh từ trong), mảnh văng lạch cạch
      this.metal(out, t + 0.005, { f0: (big ? 80 : 120) + Math.random() * 30, ratios: [1, 1.6, 2.5, 3.7], decay: big ? 1.0 : 0.7, gain: 0.32 * k, click: 0.3 });
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2300, Q: 0.7, gain: 0.5 * k, attack: 0.002, dur: 0.3 });
      // lửa bén: "phừ" nhỏ to dần trong ~1,5 s (sau đó tiếng lửa cháy liên tục tiếp nối)
      this.sustainNoise(out, t + 0.35, { buffer: this.pinkNoiseBuffer, freq: 750, Q: 0.5, gain: 0.55 * k, attack: 1.4, hold: 1.2, release: 1.2, flicker: 0.4 });
      if (!big) this.burst(out, t + 0.02, { filter: 'highpass', freq: 3500, gain: 0.25, attack: 0.002, dur: 0.25 });   // kính rạn vỡ
      return;
    }
    if (kind === 'fuel') {
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, freqEnd: 900, sweep: 0.35, drive: 2, gain: 3.0 * k, attack: 0.07, dur: 1.1 });
      this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420, Q: 0.6, drive: 1.5, gain: 2.2 * k, attack: 0.05, dur: 0.6 });
      this.sustainNoise(out, t + 0.1, { buffer: this.pinkNoiseBuffer, freq: 700, Q: 0.5, gain: 1.4 * k, attack: 0.3, hold: 1.2, release: 1.5, flicker: 0.45 });
      this.burst(out, t + 0.2, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 900, gain: 0.5 * k, attack: 0.2, dur: 2 });
      return;
    }
    // 'vent': tấm xả áp bật tung — cú nổ nhỏ gọn + thép "KENG"
    [0, 1].forEach(c => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer('blastRPG');
      src.playbackRate.value = 0.9 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 3.6;
      src.connect(g); g.connect(out);
      src.start(t + c * 0.0006);
    });
    this.metal(out, t + 0.01, { f0: 150 + Math.random() * 40, ratios: [1, 2.3, 3.7, 5.1], decay: 0.7, gain: 0.45, click: 0.6 });
    if (d < 500) this.duck(0.5, 0.8);
    // Luồng lửa đạn cháy phụt thẳng lên: gầm dày dải rộng (như mỏ hàn khổng lồ / động cơ phản lực), rít cao, rền trầm
    const h = Math.max(1, dur - 1.6);
    this.sustainNoise(out, t + 0.04, { buffer: this.pinkNoiseBuffer, freq: 950, Q: 0.45, drive: 1.6, gain: 3.2, attack: 0.12, hold: h, release: 1.5, flicker: 0.4 });
    this.sustainNoise(out, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 360, gain: 1.7, attack: 0.18, hold: h, release: 1.6, flicker: 0.3 });
    this.sustainNoise(out, t + 0.08, { buffer: this.noiseBuffer, filter: 'highpass', freq: 3200, gain: 0.5, attack: 0.2, hold: h * 0.9, release: 1.2, flicker: 0.5 });
    // vài đợt bùng mạnh khi từng cụm đạn bắt lửa
    for (let i = 0; i < 4; i++) {
      this.burst(out, t + 0.3 + Math.random() * h * 0.85, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600 + Math.random() * 600, Q: 0.6, drive: 1.4, gain: 1.8, attack: 0.04, dur: 0.5 + Math.random() * 0.5 });
    }
    // rền + dội địa hình nhỏ
    this.playTerrainEchoes(t, 0.25 * Math.sqrt(sp.gain), sp.lowpass);
  }

  // ===========================================================================
  // TIẾNG MÁY CỦA XE KHÁC (đồng đội, địch, bot, người chơi mạng)
  // Ngoài đời nghe được xe tăng từ vài trăm mét: tiếng gầm máy trầm, ống xả, xích / lốp rào rào khi tới gần.
  // Giữ NHỎ và GỌN để không lấn tiếng xe mình: tối đa 3 xe gần nhất trong 400 m, xe gần nhất rõ nhất, xe sau nhỏ dần.
  // Mỗi giọng rẻ (3 dao động sin + 2 nguồn nhiễu, 3 bộ lọc; nhiễu chậm làm sống tiếng máy dùng chung), giọng được tái
  // sử dụng giữa các xe, tham số cập nhật ~10 lần/giây (không phải mỗi khung hình). Không có lớp nhiễu bị bật / tắt
  // bằng sóng vuông (nghe thành "lẹt xẹt").
  // Bên gọi (game.js) CHỈ đưa vào xe mà client thực sự có vị trí (đồng đội, địch đang bị phát hiện và không bị máy chủ
  // giấu) — tiếng máy không được làm lộ xe địch khuất tầm nhìn.
  // list: [{ id, x, z, type, sr: tốc độ / tốc độ tối đa, turn: tốc độ xoay thân (rad/s), dmg: 0 lành | 1 hư | 2 hỏng nặng }]
  // ===========================================================================
  updateOtherEngines(list) {
    if (!this.ctx || !this.vehicleBus || !this.brownNoiseBuffer) return;
    const t = this.ctx.currentTime;
    const OE_MAX = 3, OE_RANGE = 3200;   // 3 xe, 400 m
    const L = this.listenerXZ();
    const V = this.otherEngines || (this.otherEngines = []);
    const cand = [];
    for (const u of list || []) {
      if (!u || u.id == null || !isFinite(u.x) || !isFinite(u.z)) continue;
      const d = Math.hypot(u.x - L.x, u.z - L.z);
      if (d < OE_RANGE) cand.push({ u, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const want = new Map();
    for (let i = 0; i < cand.length && i < OE_MAX; i++) { cand[i].rank = i; want.set(cand[i].u.id, cand[i]); }
    // xe đi xa / bị hạ / khuất tầm / bị xe gần hơn chiếm chỗ: nhả giọng, tắt dần
    for (const v of V) {
      if (v.id != null && !want.has(v.id)) {
        v.id = null;
        v.freeAt = t;
        v.out.gain.cancelScheduledValues(t);
        v.out.gain.setTargetAtTime(0, t, 0.25);
      }
    }
    for (const [id, c] of want) {
      let v = V.find(x => x.id === id);
      if (!v) {
        // giọng rảnh đã tắt hẳn mới được gán cho xe khác (đổi xe giữa chừng nghe như tiếng máy nhảy chỗ)
        v = V.find(x => x.id == null && t - x.freeAt > 0.5);
        if (!v && V.length < OE_MAX) { v = this.makeOtherEngineVoice(t); if (v) V.push(v); }
        if (!v) continue;
        Object.assign(v, { id, fresh: true, srPrev: undefined, thr: undefined, dsr: 0, load: 0, lastT: 0, prevSr: 0, type: null, nextUpd: 0, rankW: undefined });
      }
      this.driveOtherEngine(v, c.u, c.d, t, c.rank);
    }
    // giọng rảnh lâu: dừng nguồn, giải phóng
    for (let i = V.length - 1; i >= 0; i--) {
      if (V[i].id == null && t - V[i].freeAt > 6) { this.releaseOtherEngineVoice(V[i]); V.splice(i, 1); }
    }
    // Bên gọi ngừng cập nhật (hết trận, về sảnh, tab bị ẩn): tự tắt sau ~2 s thay vì kêu mãi ở mức cuối
    if (typeof setTimeout === 'function') {
      clearTimeout(this._oeIdle);
      this._oeIdle = setTimeout(() => this.stopOtherEngines(), 2000);
    }
  }

  stopOtherEngines() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    (this.otherEngines || []).forEach(v => {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, 0.3);
      this.releaseOtherEngineVoice(v, 2);
    });
    this.otherEngines = [];
    if (this._oeMod) {
      this._oeMod.srcs.forEach(s => { try { s.stop(t + 2.2); } catch (e) { /* đã dừng */ } });
      this._oeMod = null;
    }
  }

  releaseOtherEngineVoice(v, after = 0.1) {
    const t = this.ctx.currentTime;
    v.srcs.forEach(s => { try { s.stop(t + after); } catch (e) { /* đã dừng */ } });
    if (typeof setTimeout === 'function') setTimeout(() => { try { (v.pan || v.out).disconnect(); } catch (e) { /* đã ngắt */ } }, (after + 0.2) * 1000);
  }

  // Nhiễu chậm (~8 Hz) dùng chung cho mọi giọng: 2 dòng lệch nhau để 2 xe cạnh nhau không chao cùng nhịp
  otherEngineMod(t) {
    if (this._oeMod) return this._oeMod;
    const ctx = this.ctx;
    const M = { srcs: [], outs: [] };
    for (let i = 0; i < 2; i++) {
      const s = ctx.createBufferSource();
      s.buffer = this.pinkNoiseBuffer;
      s.loop = true;
      s.playbackRate.value = i ? 0.83 : 1.11;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 8;
      f.Q.value = 0.5;
      s.connect(f);
      s.start(t, i * 1.3);
      M.srcs.push(s);
      M.outs.push(f);
    }
    return (this._oeMod = M);
  }

  // Một giọng: thân máy (2 bậc trục khuỷu) + ống xả phụt theo nhịp nổ + xích / lốp rào rào
  //  -> lọc không khí theo khoảng cách -> trễ âm (Doppler tự nhiên khi xe lao qua) -> pan -> bus xe
  makeOtherEngineVoice(t) {
    try {
      const ctx = this.ctx;
      const srcs = [];
      const gain = g => { const n = ctx.createGain(); n.gain.value = g; return n; };
      const filt = (type, f, Q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = Q; return n; };
      const osc = f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.start(t); srcs.push(o); return o; };
      const loop = (buf, rate) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * 2.5); srcs.push(s); return s; };
      const mod = this.otherEngineMod(t);
      const pick = (this._oePick = ((this._oePick || 0) + 1) % 2);
      const v = { srcs, freeAt: t, id: null };

      v.mix = gain(1);
      v.lp = filt('lowpass', 4000, 0.5);
      v.delay = ctx.createDelay(1.5);
      v.out = gain(0);
      v.mix.connect(v.lp);
      v.lp.connect(v.delay);
      v.delay.connect(v.out);
      let node = v.out;
      if (ctx.createStereoPanner) { v.pan = ctx.createStereoPanner(); v.out.connect(v.pan); node = v.pan; }
      node.connect(this.vehicleBus);
      v.send = gain(0.2);
      node.connect(v.send);
      if (this.reverb) v.send.connect(this.reverb);

      // Thân máy: 2 bậc trục khuỷu (sin tròn — răng cưa nghe thành "è è"), độ lớn chao chậm ngẫu nhiên
      v.bodyAm = gain(1);
      const bodyDepth = gain(4);
      mod.outs[pick].connect(bodyDepth);
      bodyDepth.connect(v.bodyAm.gain);
      v.orders = [0, 1].map(() => { const o = osc(60); const g = gain(0.5); o.connect(g); g.connect(v.bodyAm); return { o, g, k: 1, a: 0.5 }; });
      v.bodyAm.connect(v.mix);

      // Ống xả: nhiễu nâu dải 150-700 Hz (không có siêu trầm) phụt nhẹ theo nhịp nổ (điều biên sin nông — điều biên sâu
      // bằng xung sắc ở 50-150 Hz nghe thành "rè rè")
      v.pulse = osc(40);
      const pulseAmt = gain(0.45);
      v.pulse.connect(pulseAmt);
      const exhAm = gain(1);
      pulseAmt.connect(exhAm.gain);
      v.exhF = filt('bandpass', 300, 0.7);
      v.exhG = gain(0);
      loop(this.brownNoiseBuffer, 1).connect(v.exhF);
      v.exhF.connect(exhAm);
      exhAm.connect(v.exhG);
      v.exhG.connect(v.mix);

      // Gầm xe: xích lăn / lốp lăn — nhiễu hồng dải trung-thấp, to nhỏ chậm ngẫu nhiên theo mặt đất (KHÔNG bật / tắt)
      v.bedF = filt('bandpass', 500, 0.8);
      const bedAm = gain(1);
      const bedDepth = gain(3);
      mod.outs[1 - pick].connect(bedDepth);
      bedDepth.connect(bedAm.gain);
      v.bedG = gain(0);
      loop(this.pinkNoiseBuffer, 0.9 + Math.random() * 0.2).connect(v.bedF);
      v.bedF.connect(bedAm);
      bedAm.connect(v.bedG);
      v.bedG.connect(v.mix);
      v.nextClank = 0;
      return v;
    } catch (err) {
      console.warn('Lỗi tạo tiếng máy xe khác:', err);
      return null;
    }
  }

  driveOtherEngine(v, u, d, t, rank = 0) {
    const type = u.type || 'ALL_ROUNDER';
    const wheeled = type === 'SCOUT' || type === 'ARTILLERY';
    const truck = type === 'ARTILLERY';
    const sr = Math.max(0, Math.min(1.2, u.sr || 0));
    const turn = Math.min(2, Math.abs(u.turn || 0));
    const mv = wheeled ? sr : Math.min(1.2, sr + turn * 0.35);
    const m = d / 8;
    if (v.fresh || t >= v.nextUpd) {
      const fresh = v.fresh;
      const tc = fresh ? 0.01 : 0.15;
      const dt = v.lastT ? Math.min(0.3, Math.max(0.01, t - v.lastT)) : 0.1;
      v.lastT = t;
      v.nextUpd = t + 0.1;
      // Vòng tua & độ đạp ga như xe mình (gọn hơn): tăng tốc thì gằn, chạy đều lắng xuống, nhả ga thì ghìm
      const dsr = v.srPrev === undefined ? 0 : (sr - v.srPrev) / dt;
      v.srPrev = sr;
      v.dsr += (dsr - v.dsr) * Math.min(1, dt * 8);
      v.load += (Math.min(1, Math.max(0, dsr) * 1.6) - v.load) * Math.min(1, dt * (dsr > 0.05 ? 6 : 2.5));
      const pivot = wheeled ? 0 : Math.min(1, turn * 0.6) * Math.max(0, 1 - sr);
      const dmg = u.dmg || 0;
      let rpm = Math.min(1, 0.15 + sr * 0.6 + v.load * 0.25 + pivot * 0.18);
      if (dmg >= 2) rpm = Math.min(rpm, 0.62);
      const thrT = v.dsr < -0.08 ? 0.05 : Math.min(1, 0.1 + sr * 0.5 + v.load * 0.9 + pivot * 0.45);
      v.thr = v.thr === undefined ? thrT : v.thr + (thrT - v.thr) * Math.min(1, dt * (thrT > v.thr ? 9 : 5));
      const thr = v.thr;
      // Tần số nổ: V12 xe xích ~55 -> 180 Hz; diesel 6 máy xe tải 6x6 ~32 -> 112 Hz; xe 4x4 ~38 -> 130 Hz
      const fireHz = truck ? 32 + rpm * 80 : wheeled ? 38 + rpm * 92 : 55 + rpm * 125;
      // nhịp nổ trôi rất nhẹ ngẫu nhiên (≤ ~1%) để 2 xe cùng loại không kêu cùng một nốt
      v.wob = Math.max(-0.012, Math.min(0.012, (v.wob || 0) + (Math.random() - 0.5) * 0.006));
      const f = fireHz * (1 + v.wob);
      if (v.type !== type) {
        v.type = type;
        // Giọng theo loại: V12 dày, bậc 2 rõ; diesel 6 máy xe tải "lục bục" (bậc 1.5); máy 4x4 nhỏ, đanh
        const K = truck ? [1, 1.5] : [1, 2];
        const A = truck ? [1, 0.6] : wheeled ? [0.8, 1] : [0.7, 1];
        v.orders.forEach((r, i) => { r.k = K[i]; r.a = A[i]; });
        v.bedF.Q.value = wheeled ? 0.7 : 0.9;
      }
      // cao độ bậc 1 luôn trên ~50 Hz (thấp hơn loa chỉ phát thành tiếng ù), bậc trên sáng dần khi đạp ga
      v.orders.forEach(r => r.o.frequency.setTargetAtTime(f * r.k * (r.k * f < 50 ? 2 : 1), t, tc));
      v.pulse.frequency.setTargetAtTime(truck ? f * 0.5 : f, t, tc);
      const choke = dmg >= 2 ? 0.6 : dmg === 1 ? 0.85 : 1;
      // Độ lớn nguồn: xe tăng chủ lực to nhất, xe tải 6x6 vừa, xe 4x4 nhỏ
      const K = truck ? 0.8 : wheeled ? 0.55 : 1;
      const bodyLv = (0.04 + rpm * 0.04 + thr * 0.06) * K * (dmg >= 2 ? 0.7 : 1);
      v.orders.forEach((r, i) => r.g.gain.setTargetAtTime(bodyLv * r.a * (i ? 0.5 + thr * 0.8 : 1), t, tc));
      v.exhG.gain.setTargetAtTime((0.08 + rpm * 0.1 + thr * 0.24) * (1 + dmg * 0.3) * K * (truck ? 1.25 : 1), t, tc);
      v.exhF.frequency.setTargetAtTime((170 + rpm * 200 + thr * 220) * choke, t, tc);
      // xích lăn (cả khi quay đầu tại chỗ) / lốp lăn: dải trung-thấp, to theo tốc độ
      v.bedF.frequency.setTargetAtTime(wheeled ? (truck ? 320 : 400) + sr * 300 : 450 + mv * 350, t, tc);
      v.bedG.gain.setTargetAtTime(wheeled ? sr * (truck ? 0.05 : 0.035) : Math.min(0.07, mv * 0.06), t, tc);

      // Không gian: suy hao, lọc không khí, hồi âm, pan theo spatial(); trễ âm theo khoảng cách THẬT (d/343) để tiếng
      // máy tự có Doppler khi xe lao qua (spatial() bỏ trễ dưới 75 m cho tiếng nổ khớp hình — với tiếng máy liên tục
      // trễ đó không thấy lệch, còn cao độ chao đúng như ngoài đời)
      const sp = this.spatial(d, { x: u.x, z: u.z });
      const edge = Math.max(0, Math.min(1, (400 - m) / 80));   // mờ dần ở rìa 320-400 m, không bật / tắt đột ngột
      // xe gần nhất rõ nhất, xe thứ 2, 3 nhỏ hẳn: nhiều xe cùng gầm to như nhau nghe lộn xộn, át tiếng xe mình
      const rankW = [1, 0.55, 0.35][rank] || 0.35;
      const g = sp.gain * edge * rankW * 0.5;
      const delay = Math.min(1.4, m / 343);
      if (fresh) {
        v.delay.delayTime.setValueAtTime(delay, t);
        v.lp.frequency.setValueAtTime(Math.min(sp.lowpass, 3500), t);
        if (v.pan) v.pan.pan.setValueAtTime(sp.pan, t);
        v.out.gain.cancelScheduledValues(t);
        v.out.gain.setValueAtTime(0, t);
        v.out.gain.setTargetAtTime(g, t, 0.3);
      } else {
        v.delay.delayTime.setTargetAtTime(delay, t, 0.12);
        v.lp.frequency.setTargetAtTime(Math.min(sp.lowpass, 3500), t, 0.15);
        if (v.pan) v.pan.pan.setTargetAtTime(sp.pan, t, 0.15);
        v.out.gain.setTargetAtTime(g, t, 0.2);
      }
      v.send.gain.setTargetAtTime(Math.min(0.8, sp.wet * 0.7), t, 0.3);
      v.fresh = false;
    }

    if (this.isMapMuted || this.isMuted) { v.prevSr = sr; return; }
    // Mắt xích thép đập bánh răng / bánh tì: vài tiếng "cạch" kim loại trầm, chỉ xe xích GẦN NHẤT trong ~100 m
    if (rank === 0 && !wheeled && mv > 0.05 && m < 100) {
      const heavy = type === 'ALL_ROUNDER' || type === 'GATLING';
      const rate = Math.min(10, 2 + mv * 9);
      const near = 1 - m / 100;
      if (v.nextClank < t) v.nextClank = t + Math.random() * 0.05;
      while (v.nextClank < t + 0.12) {
        const tt = v.nextClank;
        const f0 = (heavy ? 230 : 300) * (0.8 + Math.random() * 0.5);
        this.burst(v.mix, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0, Q: 7, gain: (0.06 + 0.08 * Math.min(1, mv)) * near * (0.4 + Math.random()), attack: 0.002, dur: 0.06 + Math.random() * 0.04 });
        v.nextClank = tt + (1 / rate) * (0.55 + Math.random() * 0.9);
      }
    }
    // Xe tải 6x6 dừng hẳn gần mình: phanh hơi xả "xììì"
    if (truck && m < 120 && v.prevSr > 0.2 && sr < 0.04) {
      this.burst(v.mix, t + 0.15, { filter: 'bandpass', freq: 3200, Q: 0.8, gain: 0.12, attack: 0.02, dur: 0.6 });
    }
    v.prevSr = sr;
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

  // opts.leaf: lá ngụy trang / cành lá cháy — lép bép giòn dày, xì hơi nước (lá tươi), ít tiếng gầm; opts.dry: lá khô
  fireSource(key, pos, k = 1, opts = null) {
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
      F = this.makeFireLoop(t, opts);
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
    this.scheduleFireSnaps(F, t, kk);
    // "bụp": túi khí / bình dầu / lốp nổ trong đám cháy, thỉnh thoảng
    if (Math.random() < (F.leaf ? 0.04 : 0.18) * kk) {
      const tp = t + Math.random() * 0.4;
      this.burst(F.mix, tp, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 2, gain: 0.9, attack: 0.002, dur: 0.12 });
      this.burst(F.mix, tp, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 0.8, gain: 0.5, attack: 0.001, dur: 0.05 });
    }
  }

  // Bộ đệm riêng cho lửa: các bộ đệm nhiễu chung chỉ dài 3 s, phát lặp liên tục thì cứ 3 s chuỗi lách tách lặp lại y hệt
  // -> nghe ra "vòng lặp có cấu trúc". Lửa dùng bộ đệm dài, độ dài lệch nhau (không bội số của nhau), tạo một lần khi cần.
  ensureFireBuffers() {
    if (this.fireBufs) return this.fireBufs;
    const ctx = this.ctx, sr = ctx.sampleRate;
    // nhiễu hồng 11.7 s (tiếng gầm, nhịp thở, lớp trầm, xì)
    const plen = Math.floor(sr * 11.7);
    const pink = ctx.createBuffer(1, plen, sr);
    const pd = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < plen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // lách tách 15.1 s: mật độ không đều (từng cụm dày / thưa như vật liệu cháy nứt), biên độ lệch (đa số nhỏ, ít tiếng to)
    const clen = Math.floor(sr * 15.1);
    const crk = ctx.createBuffer(1, clen, sr);
    const cd = crk.getChannelData(0);
    let dens = 1, densT = 0;
    for (let i = 0; i < clen; i++) {
      if (i >= densT) { dens = 0.35 + Math.random() * 1.6; densT = i + Math.floor(sr * (0.08 + Math.random() * 0.5)); }
      if (Math.random() < 0.0016 * dens) {
        const amp = (0.12 + 0.88 * Math.pow(Math.random(), 2.2)) * (Math.random() < 0.5 ? -1 : 1);
        const n = 6 + Math.floor(Math.random() * 44);
        for (let k = 0; k < n && i + k < clen; k++) cd[i + k] += amp * Math.exp(-k / (n * 0.3)) * (Math.random() * 2 - 1);
      }
    }
    // nhiễu điều khiển chậm (độ "phừng", tâm tần chao): 3 kHz, 97 s, phổ ~1/f vùng 0.5-15 Hz; chuẩn hóa để sau lọc thấp 3 Hz
    // có rms ≈ 0.046 như nhiễu hồng cũ (giữ nguyên các độ sâu chao đã chỉnh)
    const ssr = 3000, slen = ssr * 97;
    const slow = ctx.createBuffer(1, slen, ssr);
    const sd = slow.getChannelData(0);
    let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
    for (let i = 0; i < slen; i++) {
      const w = Math.random() * 2 - 1;
      c0 = 0.99886 * c0 + w * 0.0555; c1 = 0.99332 * c1 + w * 0.0751; c2 = 0.969 * c2 + w * 0.1539; c3 = 0.8665 * c3 + w * 0.3105;
      sd[i] = c0 + c1 + c2 + c3 + w * 0.3;
    }
    const al = 1 - Math.exp(-2 * Math.PI * 3 / ssr);
    let y1 = 0, y2 = 0, m = 0, q = 0;
    for (let i = 0; i < slen; i++) { y1 += al * (sd[i] - y1); y2 += al * (y1 - y2); m += y2; q += y2 * y2; }
    m /= slen;
    const sc = 0.046 / Math.sqrt(Math.max(1e-12, q / slen - m * m));
    for (let i = 0; i < slen; i++) sd[i] = (sd[i] - m) * sc;
    this.fireBufs = { pink, crk, slow };
    return this.fireBufs;
  }

  makeFireLoop(t, opts) {
    const ctx = this.ctx;
    const leaf = !!(opts && opts.leaf), dry = !!(opts && opts.dry);
    const B = this.ensureFireBuffers();
    const rnd = (a, b) => a + Math.random() * (b - a);
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
    // mỗi lớp: tốc độ phát & điểm bắt đầu ngẫu nhiên riêng -> các lớp không trùng nhịp lặp, mỗi đám cháy một kiểu
    const loop = (buf, r0, r1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rnd(r0, r1); srcs.push(s); return s; };
    // nhiễu chậm điều khiển độ "phừng" của lửa (không tuần hoàn, mỗi bộ chao một đoạn khác nhau của bộ đệm 97 s)
    const flick = (hz, depth, target) => {
      const n = loop(B.slow, 0.8, 1.25);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = depth;
      n.connect(f);
      f.connect(g);
      g.connect(target);
    };
    const size = leaf ? rnd(0.55, 0.7) : rnd(0.85, 1.15);   // đám cháy to hơn: gầm trầm hơn; lá cháy: ngọn nhỏ, sáng tiếng
    // 1. tiếng gầm của luồng khí nóng: nhiễu hồng dải trung, độ lớn & tâm tần chao ngẫu nhiên
    const roar = loop(B.pink, 0.92, 1.08);
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 420 / size;
    rf.Q.value = rnd(0.45, 0.65);
    flick(3, 4000, rf.frequency);   // tâm tần chao ±~200 Hz
    const ra = ctx.createGain();
    ra.gain.value = leaf ? 0.6 : 1.4;
    flick(4, 9, ra.gain);           // độ lớn chao ±~40%
    roar.connect(rf);
    rf.connect(ra);
    ra.connect(mix);
    // nhịp "thở" của đám cháy lớn: khối lửa cuộn lên từng đợt (dải 180-400 Hz, độ lớn chao chậm & sâu, không tuần hoàn)
    const br = loop(B.pink, 0.82, 0.97);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 260 / size;
    bf.Q.value = 0.6;
    flick(1.5, 1500, bf.frequency);
    const ba = ctx.createGain();
    ba.gain.value = leaf ? 0.3 : 1.0;
    flick(rnd(0.9, 1.4), 14, ba.gain);
    br.connect(bf);
    bf.connect(ba);
    ba.connect(mix);
    // lớp trầm "ù ù" của đám cháy lớn — nhỏ thôi (nhiễu hồng ×1.7 ≈ mức nhiễu nâu cũ ở dải 160 Hz)
    const low = loop(B.pink, 0.7, 0.9);
    const lf = ctx.createBiquadFilter();
    lf.type = 'bandpass';
    lf.frequency.value = 160;
    lf.Q.value = 0.7;
    const lg = ctx.createGain();
    lg.gain.value = leaf ? 0.04 : 0.3;
    low.connect(lf);
    lf.connect(lg);
    lg.connect(mix);
    // 2. lách tách dày (vật liệu cháy nứt nổ) — 2 lớp lệch tốc độ phát, mật độ dâng / lắng chậm ngẫu nhiên
    // lá cháy: lách tách giòn, dải cao, dày hơn (lá & cành nhỏ quăn nổ liên tục)
    for (const [r0, r1, fq, g] of (leaf ? [[1.1, 1.35, 4200, 4.2], [0.9, 1.1, 2600, 3.4]] : [[0.9, 1.12, 2600, 3.2], [0.66, 0.8, 1500, 2.4]])) {
      const c = loop(B.crk, r0, r1);
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = fq * rnd(0.85, 1.15);
      cf.Q.value = 0.5;
      const cg = ctx.createGain();
      cg.gain.value = g * rnd(0.8, 1.2);
      flick(0.7, g * 9, cg.gain);   // ±~40% theo đợt cháy bùng / lắng
      c.connect(cf);
      cf.connect(cg);
      cg.connect(mix);
    }
    // 3. tí tách trầm của mảnh lớn (than hồng, kim loại nóng co giãn)
    const pop = loop(B.crk, 0.36, 0.45);
    const pf = ctx.createBiquadFilter();
    pf.type = 'lowpass';
    pf.frequency.value = 700;
    const pg = ctx.createGain();
    pg.gain.value = leaf ? 0.5 : 2.2;
    pop.connect(pf);
    pf.connect(pg);
    pg.connect(mix);
    // 4. khí nóng xì (nhiễu hồng dải cao ×6 ≈ mức nhiễu trắng cũ)
    const hiss = loop(B.pink, 1.0, 1.2);
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = leaf ? 3600 : 4500;
    const hg = ctx.createGain();
    // lá tươi: nhựa & hơi nước sôi xèo xèo (xì to, chao nhanh); lá khô xì ít
    hg.gain.value = leaf ? (dry ? 0.45 : 1.0) : 0.2;
    flick(leaf ? 5 : 2, leaf ? 9 : 2.4, hg.gain);
    hiss.connect(hf);
    hf.connect(hg);
    hg.connect(mix);
    srcs.forEach(s => s.start(t, Math.random() * s.buffer.duration));
    // tiếng "lép bép" to rời rạc: quá trình Poisson (khoảng cách ngẫu nhiên theo phân bố mũ), mỗi đám cháy một mật độ
    return { mix, lp, out, pan, send, srcs, seen: t, d: 0, fresh: true, leaf, snapRate: leaf ? rnd(dry ? 8 : 5, dry ? 13 : 9) : rnd(1.5, 4), nextSnap: t + Math.random() * 0.3 };
  }

  // Lên lịch các tiếng "lép bép" rời rạc cho ~0.7 s tới (gọi mỗi lần đám cháy được báo, ~2 lần/giây)
  scheduleFireSnaps(F, t, kk) {
    const rate = F.snapRate * (0.5 + 0.5 * kk);
    if (F.nextSnap < t) F.nextSnap = t + 0.01;
    let guard = 0;
    while (F.nextSnap < t + 0.7 && guard++ < 12) {
      const ts = F.nextSnap;
      const loud = Math.pow(Math.random(), 2.5);   // đa số nhỏ, thỉnh thoảng một tiếng to
      if (F.leaf) {
        // lá / cành nhỏ nổ "tách" giòn, ngắn, dải cao; thỉnh thoảng một chùm 2-3 tiếng sát nhau (cuống lá quăn nổ)
        const nb = Math.random() < 0.25 ? 2 + (Math.random() < 0.4 ? 1 : 0) : 1;
        for (let b = 0; b < nb; b++) this.burst(F.mix, ts + b * (0.012 + Math.random() * 0.03), { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200 + Math.random() * 4800, Q: 0.8 + Math.random() * 1.2, gain: 0.35 + 1.6 * loud, attack: 0.0005, dur: 0.008 + Math.random() * 0.025 });
        F.nextSnap = ts - Math.log(1 - Math.random()) / rate;
        continue;
      }
      this.burst(F.mix, ts, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1100 + Math.random() * 3400, Q: 0.7 + Math.random() * 0.9, gain: 0.5 + 2.4 * loud, attack: 0.0008, dur: 0.02 + Math.random() * 0.05 });
      if (loud > 0.5) this.burst(F.mix, ts, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600 + Math.random() * 500, Q: 1, gain: 0.5 * loud, attack: 0.001, dur: 0.04 });
      F.nextSnap = ts - Math.log(1 - Math.random()) / rate;
    }
  }

  // Lưới lá ngụy trang bén lửa: "phừng" nhẹ của lá bắt lửa (luồng khí nóng dải trung bùng lên rồi lắng) + chùm lách tách
  camoIgnite(pos, dry = false) {
    if (!this.ready() || !pos) return;
    const L = this.listenerXZ();
    const d = Math.hypot(pos.x - L.x, pos.z - L.z);
    if (d > 1200) return;
    const sp = this.spatial(d, pos);
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain * 0.32, lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    const rise = 0.08 + Math.random() * 0.1;
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: dry ? 700 : 520, freqEnd: dry ? 1300 : 950, sweep: rise + 0.3, Q: 0.6, gain: dry ? 1.3 : 1.0, attack: rise, dur: 0.7 + Math.random() * 0.4 });
    this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 3800, gain: dry ? 0.35 : 0.55, attack: 0.12, dur: 0.9 });
    for (let i = 0, n = 4 + Math.floor(Math.random() * 5); i < n; i++) {
      this.burst(out, t + 0.05 + Math.random() * 0.6, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2400 + Math.random() * 4200, Q: 1, gain: 0.4 + Math.random() * 0.9, attack: 0.0005, dur: 0.01 + Math.random() * 0.02 });
    }
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
    const maxV = (kind.startsWith('case') || kind === 'link127') ? 10 : 4;
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
    const jobs = ['blast120', 'blastN', 'blast155', 'blastRPG', 'blastATGM', 'blast30', 'hitDirt', 'hitSteel', 'mg127', 'case127', 'case30', 'hitSteelHeavy', 'blastAmmo',
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
    const HIT = { hitSteel: 0.3, hitSteelHeavy: 0.7, hitDirt: 0.3, case127: 0.5, case30: 0.6, link127: 0.2 }[kind];
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
    } else if (kind === 'hitSteel' || kind === 'hitSteelHeavy') {
      // Đầu đạn đập vào giáp thép: xung tiếp xúc cực ngắn (va cứng -> sáng) gõ vào hàng chục mode của tấm giáp dày.
      // Giáp dày + bắt chặt nên tắt nhanh: "TÁNG / CHÁT" đanh, không ngân như chuông.
      // Đạn xuyên giáp 120mm (heavy): cú va lớn hơn hẳn, mode trầm hơn, kèm cú thụp cả khối xe và tiếng xé thép
      const heavyHit = kind === 'hitSteelHeavy';
      const x = new Float32Array(N), i0 = Math.round(0.002 * SR), L = Math.max(2, Math.round((heavyHit ? 0.00018 : 0.00012) * SR));
      for (let i = 0; i < L; i++) x[i0 + i] += Math.PI / (2 * L) * Math.sin(Math.PI * (i + 0.5) / L);
      ring(x, heavyHit ? modes(60, 180, 8500, 0.3, 0.035) : modes(40, 700, 9000, 0.1, 0.02), heavyHit ? 1.4 : 1);
      // mảnh kim loại / sơn tróc bắn ra: "xẹt" ngắn dải cao
      { const L2 = Math.round(0.03 * SR), ta = Math.exp(-2 * Math.PI * 2000 / SR); let xp = 0, yp = 0;
        for (let i = 0; i < L2; i++) { const n = (R() * 2 - 1) * Math.exp(-i / (0.006 * SR)) * 0.25; const o = ta * (yp + n - xp); xp = n; yp = o; y[i0 + i] += o; } }
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
      // một khác. Đồng thau 12.7mm "tinh" sáng; thép 30mm "keng" trầm nặng; mắt xích dây đạn (thép dập mỏng) "tích" khô
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
        const t60 = (link ? 0.035 : brass ? 0.17 : 0.22) / (1 + k * 0.35) * v(0.3);
        ms.push({ f: f1 * r, t60, a }, { f: f1 * r * (1.002 + R() * 0.006), t60: t60 * 0.8, a: a * (0.3 + R() * 0.5) });
      });
      // nóc xe thép bị gõ khẽ: vài mode trầm tắt rất nhanh (cho tiếng chạm có "nền", không chỉ tiếng tinh)
      for (let k = 0; k < 6; k++) ms.push({ f: 300 + R() * 900, t60: 0.03, a: link ? 0.12 : 0.25 });
      ring(x, ms, 1);
      // tiếng "tách" của lúc chạm (dải rộng, 1-2 ms)
      for (let i = 0; i < Math.round(0.002 * SR); i++) y[i0 + i] += (R() * 2 - 1) * 0.12 * Math.exp(-i / (0.0004 * SR));
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
    const scout = tankType === 'SCOUT';
    let t = now + sp.delay;
    if (!remote && !scout) {
      // Game nhả đạn theo khung hình: có khung 2 phát rơi cùng một thời điểm (chồng đôi, nhịp giật cục).
      // Cụm nòng quay đều nên nhịp thật đều tăm tắp ~33 ms: dàn lại theo đồng hồ âm thanh (lệch tối đa 30 ms)
      const last = this._gatShotT || 0;
      if (now - last < 0.1) t = Math.max(now, Math.min(now + 0.03, last + 0.033));
      this._gatShotT = t;
    }
    const p = (scout ? 1.25 : 1.0) * (1 + (Math.random() - 0.5) * 0.1);
    // 30 phát/giây (6 nòng) / 10 phát/giây (12.7mm) cộng dồn: mỗi phát phải nhỏ, nếu không cả loạt thành bức tường ồn
    // chạm trần, đè mất mọi tiếng khác (đo được: loạt 30mm trước đây ~-4 dBFS liên tục)
    // Pháo 6 nòng của mình đi qua blastBus (bão hòa cả cụm): các phát quyện thành tiếng gầm "BRRRT" đặc
    // Súng máy 12.7mm của mình qua blastBus thường (giữ nguyên cú đấm 50-100 Hz; kênh heavy cắt trầm làm tiếng ồm "bè bè")
    const out = this.voice({ bus: (remote || scout) ? null : this.blastBus(true), gain: sp.gain * (scout ? (remote ? 0.38 : 0.62) : remote ? 0.08 : 0.16), lowpass: remote ? sp.lowpass : scout ? 9000 : 2200,
      wet: (scout && !remote) ? 0.55 : sp.wet,   // súng máy ngoài trời: tiếng dội môi trường lấp giữa các phát -> loạt đạn dày, thật
      pan: (!remote && !scout) ? (Math.random() - 0.5) * 0.25 : sp.pan });   // 6 nòng xoay: mỗi phát lệch nhẹ trái/phải -> loạt đạn rộng, dày

    if (!this.playSample('gatling_shot', out, t, { gain: 1.0, vary: 0.06 })) {
      if (scout && !remote) {
        // Đại liên 12.7mm ngay trên nóc xe mình: một "bản ghi" phát bắn dựng theo vật lý (xem synthGunshot)
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('mg127');
        src.playbackRate.value = p * 0.8;
        src.connect(out);
        src.start(t);
      } else if (scout) {
        // Súng máy 12.7mm: tiếng "ĐÙNG" đanh, khô của đạn súng trường cỡ lớn — nhiều dải trung-cao, ít siêu trầm hơn pháo 30mm
        this.snap(out, t, 0.75, 9500 * p, 5);
        this.burst(out, t, { filter: 'bandpass', freq: 1700 * p, Q: 0.7, drive: 4, gain: 0.75, attack: 0.0006, dur: 0.06 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 1100 * p, freqEnd: 180, sweep: 0.12, drive: 3, gain: 0.9, attack: 0.001, dur: 0.2 });
        this.tone(out, t, { freq: 110 * p, freqEnd: 50, sweep: 0.08, drive: 2, gain: 0.45, attack: 0.001, dur: 0.12 });
        // khóa nòng giật lùi - lên đạn: tiếng "cạch" cơ khí ngay sau phát nổ (chỉ nghe được khi là súng của mình)
        if (!remote) this.burst(out, t + 0.028, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2300, Q: 2, gain: 0.07, attack: 0.0005, dur: 0.02 });
      } else {
        // Pháo 30mm: mỗi phát là một cú "ĐÙNG" nhỏ có thân dày 200-600 Hz, tắt nhanh trong ~40 ms để 30 phát/giây
        // vẫn tách nhịp thành tiếng xé "BRRRT" (đuôi dài làm cả loạt nhòe thành bức tường ồn).
        // Ít xì chói trên 2,5 kHz (trước đây chiếm 36% phần tai nghe thấy -> loạt đạn mỏng, "lẹt đẹt")
        this.snap(out, t, 0.55, 5000 * p, 5);
        this.burst(out, t, { filter: 'lowpass', freq: 2600 * p, freqEnd: 350, sweep: 0.03, drive: 2, gain: 0.6, attack: 0.0006, dur: remote ? 0.1 : 0.05 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 250 * p, Q: 0.8, drive: 1.6, gain: 3.2, attack: 0.0008, dur: remote ? 0.14 : 0.07 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 150 * p, Q: 0.9, drive: 1.5, gain: 2.2, attack: 0.001, dur: remote ? 0.15 : 0.065 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 560 * p, Q: 0.8, drive: 1.4, gain: 1.1, attack: 0.0006, dur: remote ? 0.1 : 0.04 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 800 * p, freqEnd: 150, sweep: 0.06, drive: 2, gain: 1.2, attack: 0.001, dur: remote ? 0.32 : 0.07 });
        this.tone(out, t, { freq: 150 * p, freqEnd: 65, sweep: 0.04, drive: 2.5, gain: 1.1, attack: 0.001, dur: remote ? 0.2 : 0.06 });
      }
    }

    if (!remote) {
      if (this.gatlingMotor) this.gatlingMotor.burstShots++;
      // Vỏ đạn văng ra rơi xuống nóc xe / mặt đất: leng keng (12.7mm đồng thau nhẹ) / "coong" (30mm thép nặng)
      // (mẫu dựng theo vật lý: ống kim loại rỗng rung + nảy vài lần, synthGunshot 'case127' / 'case30')
      // từng vỏ một: chạm, nảy, lăn lập lịch lúc chạy; súng 12.7mm còn rơi thêm mắt xích dây đạn
      if (Math.random() < (scout ? 0.8 : 0.35)) this.dropCasing(t + 0.22 + Math.random() * 0.3, scout ? 'case127' : 'case30');
      if (scout && Math.random() < 0.6) this.dropCasing(t + 0.15 + Math.random() * 0.25, 'link127');
    }
  }

  /**
   * Một vỏ đạn (hoặc mắt xích dây đạn) rơi: chạm -> nảy vài lần (khoảng cách & độ mạnh giảm dần như quả bóng nảy, hệ số
   * nảy ngẫu nhiên) -> có khi lăn "lóc cóc" trên nóc xe. Mỗi lần chạm lấy một mẫu cú chạm khác (điểm chạm khác -> âm sắc
   * khác) nhưng cùng cao độ (vẫn là một vỏ). Một phần vỏ rơi thẳng xuống đất: chỉ "tộp" khẽ.
   * Bắn loạt dài, nóc xe phủ đầy vỏ: vỏ mới rơi vào đống vỏ cũ -> thêm tiếng "lẻng xẻng" của vỏ bên dưới bị gõ.
   */
  dropCasing(t, kind = 'case127') {
    if (!this.ready()) return;
    const link = kind === 'link127';
    const now = this.ctx.currentTime;
    // đống vỏ trên nóc: dồn lên theo số vỏ rơi, vơi dần (trượt khỏi nóc xe) khi ngừng bắn
    this._pile = Math.max(0, (this._pile || 0) - (now - (this._pileT === undefined ? now : this._pileT)) * 3);
    this._pileT = now;
    if (!link) this._pile = Math.min(30, this._pile + 1);
    const out = this.voice({ bus: this.vehicleBus, gain: link ? 0.07 : kind === 'case127' ? 0.11 : 0.14, wet: 0.08, pan: 0.15 + (Math.random() - 0.5) * 0.7 });
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
    const ctx = this.ctx;
    // Tên lửa cỡ 152mm phóng từ ống như ngoài đời:
    //  (1) liều phóng đẩy tên lửa khỏi ống: "BỤP" trầm đục + khí phụt ngược khỏi đuôi ống;
    //  (2) ~0,1 s sau động cơ hành trình bắt lửa "XOẠC": tiếng gầm phản lực dải rộng của nhiên liệu rắn, biên độ dao động
    //      ngẫu nhiên (không theo chu kỳ — rung đều nghe thành "phành phạch" giả);
    //  (3) tên lửa lao đi ~300 m/s: nhỏ dần theo 1/r, mất âm cao dần (không khí hấp thụ), cao độ tụt gần một quãng tám
    //      do Doppler của nguồn đang ra xa (× c / (c + v) ≈ 0,53), kéo dài ~2,5 s rồi chìm hẳn.
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 230, Q: 0.7, drive: 2, gain: 1.7, attack: 0.002, dur: 0.16 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 480, drive: 1.6, gain: 1.0, attack: 0.002, dur: 0.22 });
    this.snap(out, t, 0.55, 5000, 2);
    this.burst(out, t + 0.004, { filter: 'bandpass', freq: 1700, Q: 0.6, gain: 0.55, attack: 0.002, dur: 0.12 });
    const ti = t + 0.09 + Math.random() * 0.03;
    this.snap(out, ti, 0.4, 7000, 2);
    this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.6, drive: 1.5, gain: 0.8, attack: 0.002, dur: 0.1 });
    const D = 2.6, N = 80, c = 343;
    const r0 = remote ? Math.max(8, distance / 8) : 5, vr = remote ? 150 : 300;   // xe khác: hướng bay không thẳng ra xa mình
    const gC = new Float32Array(N), bpC = new Float32Array(N), hpC = new Float32Array(N), lpC = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // thời điểm nghe τ -> thời điểm phát te (âm đi chậm dần vì nguồn mỗi lúc một xa): te + r(te)/c = τ
      const tau = (i / (N - 1)) * D;
      let te = tau;
      for (let it = 0; it < 4; it++) te = Math.max(0, tau - vr * Math.max(0, te - 0.125) / c);
      const v = vr * Math.min(1, te / 0.25), r = r0 + vr * Math.max(0, te - 0.125);
      const dop = c / (c + v);
      gC[i] = Math.min(1, te / 0.04) * (r0 / r) * (i === N - 1 ? 0 : 1);
      bpC[i] = 1150 * dop; hpC[i] = 2600 * dop;
      lpC[i] = Math.max(700, Math.min(16000, 4200 * Math.pow(100 / Math.max(1, r), 0.9)));
    }
    const env = ctx.createGain(); env.gain.value = 0;
    const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.Q.value = 0.5;
    const am = ctx.createGain(); am.gain.value = 1;
    const roar = ctx.createBufferSource(); roar.buffer = this.pinkNoiseBuffer; roar.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.5;
    const rg = ctx.createGain(); rg.gain.value = 1.5;
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noiseBuffer; hiss.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    const hg = ctx.createGain(); hg.gain.value = 0.2;
    const low = ctx.createBufferSource(); low.buffer = this.brownNoiseBuffer; low.loop = true;
    const lowF = ctx.createBiquadFilter(); lowF.type = 'lowpass'; lowF.frequency.value = 260;
    const lg = ctx.createGain(); lg.gain.value = 0.7;
    // ngọn lửa phản lực cháy không đều: nhiễu lọc thấp ~30 Hz điều biên (độ sâu ~35 %), lách tách nhẹ dải thấp
    const rough = ctx.createBufferSource(); rough.buffer = this.pinkNoiseBuffer; rough.loop = true;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 30;
    const rd = ctx.createGain(); rd.gain.value = 3;
    const crk = ctx.createBufferSource(); crk.buffer = this.crackleBuffer; crk.loop = true;
    const crkF = ctx.createBiquadFilter(); crkF.type = 'lowpass'; crkF.frequency.value = 1500;
    const cg = ctx.createGain(); cg.gain.value = 0.18;
    roar.connect(bp); bp.connect(rg); rg.connect(am);
    hiss.connect(hp); hp.connect(hg); hg.connect(am);
    low.connect(lowF); lowF.connect(lg); lg.connect(am);
    crk.connect(crkF); crkF.connect(cg); cg.connect(am);
    rough.connect(rlp); rlp.connect(rd); rd.connect(am.gain);
    am.connect(air); air.connect(env); env.connect(out);
    env.gain.setValueCurveAtTime(gC, ti, D);
    bp.frequency.setValueCurveAtTime(bpC, ti, D);
    hp.frequency.setValueCurveAtTime(hpC, ti, D);
    air.frequency.setValueCurveAtTime(lpC, ti, D);
    const off = () => Math.random() * 2;
    for (const n of [roar, hiss, low, rough, crk]) { n.start(ti, off()); n.stop(ti + D + 0.05); }
  }

  playRocketLaunch(distance = 0, pos = null) { this.playMissileLaunch(distance, pos); }
}

window.soundEngine = new SoundEngine();
