/**
 * Hệ Thống Âm Thanh Chiến Trường Chân Thực (Battlefield Acoustic Engine v2)
 * Tổng hợp thủ tục 100% bằng Web Audio API — không dùng file âm thanh.
 *
 * Nguyên tắc chân thực:
 * - Không gian: hồi âm ngoài trời bằng ConvolverNode với impulse response sinh thủ tục
 *   (phản xạ sớm từ mặt đất/địa hình + đuôi vang tắt dần, mất âm cao theo thời gian)
 * - Khoảng cách: nhỏ dần, mất âm cao do không khí hấp thụ, càng xa càng "ướt" (nghe vọng nhiều hơn),
 *   trễ theo tốc độ âm thanh (cùng tỉ lệ nén với đường đạn), bị đồi / nhà / cứ điểm / rừng che thì nghẹt & vọng hơn;
 *   âm thanh nổi trái/phải theo vị trí; ngân sách tiếng: tiếng xa / nhỏ nhường chỗ khi quá nhiều tiếng cùng lúc
 * - Tiếng súng/pháo/nổ: xung nén đầu nòng (N-wave) + sức ép nổ từ nhiễu băng rộng có méo bão hòa
 *   + sóng trầm chấn động + rền cuộn — không dùng sóng tuần hoàn quét tần số kiểu "pew pew"
 * - Kim loại (nạp đạn, trúng giáp, vỏ đạn, khóa nòng): tổng hợp cộng hưởng nhiều mode bất hòa âm
 * - Động cơ diesel nổ theo nhịp xi-lanh + turbo; xích sắt lách cách theo tốc độ; lốp xe trinh sát
 * - Pháo 6 nòng xoay: lớp âm liên tục mô-tơ điện + cơ cấu nòng theo tốc độ quay, xì hơi khi quá nhiệt
 *
 * Mã nguồn chia thành nhiều file trong src/core/audio/ (nạp theo đúng thứ tự trong index.html):
 *   sound_engine.js      lõi: khởi tạo, định tuyến bus, bộ đệm nhiễu, hồi âm, khối dựng âm (burst/tone/snap/metal)
 *   weapon_fire.js       khai hỏa pháo chính, vụ nổ, tên lửa chống tăng
 *   destruction.js       âm thanh thứ cấp: nổ kho đạn, nhà sập, cây đổ, vật liệu vỡ
 *   impacts.js           đạn trúng giáp / đất, va chạm, đạn bay sượt qua
 *   incoming.js          đạn pháo rít lao xuống gần xe
 *   cockpit_cues.js      nạp đạn, bíp cảnh báo, khóa mục tiêu, bộ đàm, kèn chiến thắng
 *   vehicle_engine.js    động cơ diesel, turbo, xích / lốp xe mình
 *   vehicle_destroyed.js xe bị phá hủy, xác xe cháy
 *   other_engines.js     tiếng máy các xe khác
 *   fire_ambience.js     lửa cháy liên tục, gió nền
 *   turret_drives.js     mô-tơ quay tháp, bơm nâng hạ nòng
 *   drone_uav.js         drone trinh sát của màn hình điều khiển hỏa lực (cánh quạt, gió vào micro, kết nối dữ liệu)
 *   gatling.js           pháo 6 nòng xoay, súng liên thanh, vỏ đạn
 *   wading.js            lội nước
 *   music.js             nhạc nền (sảnh, ghép trận, trong trận, kết quả)
 *   battle_drama.js      hiệu ứng kịch tích theo diễn biến trận (tim đập, đồng hồ, hạ gục...)
 *   ui_sounds.js         âm thanh giao diện: rê chuột, bấm nút, chọn xe / bản đồ, xuất trận
 */

// Trái / phải theo hướng camera đang nhìn (camera bám đuôi xoay theo xe): dx, dz = nguồn âm - xe mình
function viewPan(dx, dz, lim) {
  const yaw = (typeof window !== 'undefined' && window.game && window.game._camYaw) || 0;
  const side = dx * Math.cos(yaw) - dz * Math.sin(yaw), fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  return Math.max(-lim, Math.min(lim, side / (Math.abs(side) + Math.abs(fwd) + 60)));
}

// TRỄ ÂM THANH: cùng tỉ lệ nén với đường đạn (quãng đường x rangeScale, thời gian x timerScale — game_timing.js) nên thứ
// tự tới tai đúng như thật: đạn pháo ~1700 m/s tới trước, tiếng nổ đầu nòng / tiếng nổ trúng (343 m/s) tới sau, ánh chớp
// xa trước, tiếng ùng sau. Cảnh ngay trước mặt (< 250 đơn vị) phát luôn để khớp hình; trần 4 s
const SOUND_NEAR = 250, SOUND_DELAY_MAX = 4;
function soundDelay(d) {
  const T = typeof GameTiming !== 'undefined' ? GameTiming : null;
  const c = 343 * (T ? T.rangeScale / T.timerScale : 1);
  return Math.min(SOUND_DELAY_MAX, Math.max(0, d - SOUND_NEAR) / c);
}

// CHE KHUẤT ÂM: đồi / bờ dốc, ụ đất & bê tông cứ điểm, nhà, rừng rậm nằm giữa nguồn và tai. Âm trầm nhiễu xạ vòng qua
// vật cản nên chủ yếu mất âm cao (rào chắn thật: ~10-15 dB ở 2-4 kHz, chỉ 3-5 dB ở 125 Hz) và phần tới tai là tiếng dội
// nhiều hơn. 0 = thoáng .. 1 = khuất hẳn sau đồi. Lưu theo ô 24 đơn vị (nguồn & tai) trong 0.25 s: loạt mảnh vỡ / đạn
// liên thanh cùng chỗ chỉ dò một lần
const OCC_CELL = 24, OCC_TTL = 250, _occCache = new Map();
function occlusionAt(T, sx, sy, sz, lx, ly, lz) {
  const q = v => Math.round(v / OCC_CELL);
  const key = q(sx) + ',' + q(sy) + ',' + q(sz) + '|' + q(lx) + ',' + q(ly) + ',' + q(lz);
  const now = performance.now(), c = _occCache.get(key);
  if (c && now - c.t < OCC_TTL) return c.o;
  if (_occCache.size > 400) _occCache.clear();
  const o = occlusionTrace(T, sx, sy, sz, lx, ly, lz);
  _occCache.set(key, { t: now, o });
  return o;
}
function occlusionTrace(T, sx, sy, sz, lx, ly, lz) {
  const dx = lx - sx, dy = ly - sy, dz = lz - sz, len = Math.hypot(dx, dz);
  if (len < 60) return 0;
  let o = 0;
  // địa hình + ụ đất / bê tông cứ điểm: dò các điểm giữa đường (bỏ hai đầu: nguồn nằm sát đất không tính là bị chắn)
  const SS = T.strongholdSet, n = Math.max(4, Math.min(16, Math.ceil(len / 80)));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = sx + dx * t, y = sy + dy * t, z = sz + dz * t;
    if (T.getHeightAt(x, z) > y + 6) return 1;
    if (SS && o < 0.75) {
      const sf = SS.surfaceAt ? SS.surfaceAt(x, z) : null;
      if ((sf !== null && sf > y + 2) || (SS.concreteAt && SS.concreteAt(x, y, z))) o = 0.75;
    }
  }
  // nhà còn đứng (khối hộp thu vào 2 đơn vị: nguồn sát mặt tường ngoài không tính)
  const BS = T.buildingSet;
  if (BS && BS.items && BS.toLocal && o < 0.8) {
    const mnx = Math.min(sx, lx), mxx = Math.max(sx, lx), mnz = Math.min(sz, lz), mxz = Math.max(sz, lz);
    for (const B of BS.items) {
      if (B.collapsed) continue;
      const r = Math.hypot(B.halfW, B.halfD);
      if (mxx < B.x - r || mnx > B.x + r || mxz < B.z - r || mnz > B.z + r) continue;
      if (segBox(BS.toLocal(B, sx, sy, sz), BS.toLocal(B, lx, ly, lz), B.halfW - 2, B.hitTop || 0, B.halfD - 2)) { o = 0.8; break; }
    }
  }
  // rừng rậm: tán lá & thân cây hút / tán xạ âm cao (~10 dB qua 50 m rừng dày)
  if (o < 0.5 && T.forestLOS) {
    const L = T.forestLOS(sx, sz, lx, lz, 800);
    if (L > 0) o = Math.max(o, Math.min(0.5, L / 800));
  }
  return o;
}
// đoạn a -> b (toạ độ riêng của nhà) cắt khối [-hx, hx] x [0, hy] x [-hz, hz]?
function segBox(a, b, hx, hy, hz) {
  let t0 = 0, t1 = 1;
  const A = [a.x, a.y, a.z], D = [b.x - a.x, b.y - a.y, b.z - a.z], LO = [-hx, 0, -hz], HI = [hx, hy, hz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(D[k]) < 1e-9) { if (A[k] < LO[k] || A[k] > HI[k]) return false; continue; }
    let u = (LO[k] - A[k]) / D[k], v = (HI[k] - A[k]) / D[k];
    if (u > v) { const w = u; u = v; v = w; }
    if (u > t0) t0 = u;
    if (v < t1) t1 = v;
    if (t0 > t1) return false;
  }
  return true;
}

// NGÂN SÁCH TIẾNG (chỉ tiếng ngoài chiến trường đi bus mặc định — tiếng xe mình, buồng lái, giao diện luôn phát): mọi
// tiếng dưới -48 dB tới tai bỏ luôn; khi tiếng mới dồn dập (nhà sập, mảnh rơi, cháy nổ, liên thanh cùng lúc) ngưỡng
// nâng dần theo số tiếng đã phát trong 1 s qua (24 tiếng/s trở xuống: -48 dB; 48: -30 dB; ~80: -16 dB là trần) -> tiếng
// xa / nhỏ nhường chỗ cho tiếng gần / to. Tiếng bị bỏ vẫn trả nút gain nhưng không nối tới loa: Web Audio chỉ xử lý các
// nhánh có đường tới loa nên nhánh đó không tốn công tính
const VOICE_SOFT = 24, VOICE_MIN = 0.004, VOICE_MAXTHR = 0.15;

// HỒ SƠ TIẾNG VANG theo môi trường bản đồ (buildOutdoorImpulse). default = hồ sơ cũ (giữ nguyên số liệu)
const REVERB_ENV = {
  // ngoài trời chung: đuôi vang vừa, vài tiếng dội từ gò đồi / công trình
  default: { onset: 0.025, decay: 0.62, lp0: 0.55, lpTau: 0.9, amp: 0.55, tapLen: 220, tapTau: 40,
    taps: [[0.011, 0.5], [0.043, 0.32], [0.088, 0.24], [0.17, 0.2], [0.31, 0.16], [0.52, 0.12]] },
  // phố: tường nhà hai bên dội qua lại dày đặc (vang "lốp bốp" sau tiếng nổ), đuôi dài hơn, sáng hơn (mặt bê tông / kính)
  urban: { onset: 0.012, decay: 0.75, lp0: 0.7, lpTau: 1.2, amp: 0.55, tapLen: 260, tapTau: 34,
    taps: [[0.011, 0.5], [0.028, 0.34], [0.047, 0.3], [0.071, 0.27], [0.098, 0.24], [0.13, 0.21], [0.17, 0.2], [0.22, 0.17], [0.29, 0.14], [0.38, 0.12], [0.6, 0.1]] },
  // cao nguyên / thung lũng: tiếng vọng rời rạc từ sườn núi xa, trễ dần và trầm (đường xa hút âm cao)
  valley: { onset: 0.03, decay: 0.7, lp0: 0.45, lpTau: 0.8, amp: 0.5, tapLen: 700, tapTau: 140,
    taps: [[0.011, 0.45], [0.06, 0.22], [0.42, 0.3], [0.86, 0.22], [1.4, 0.14], [2.1, 0.08]] },
  // sa mạc: đất trống, gần như không có gì dội lại -> khô, đuôi ngắn
  desert: { onset: 0.03, decay: 0.32, lp0: 0.45, lpTau: 0.7, amp: 0.45, tapLen: 220, tapTau: 40,
    taps: [[0.011, 0.5], [0.07, 0.12], [0.24, 0.07]] },
  // rừng: thân cây, tán lá hấp thụ & khuếch tán -> đuôi ngắn, tối (mất âm cao), nhiều dội nhỏ dày
  forest: { onset: 0.02, decay: 0.45, lp0: 0.3, lpTau: 0.5, amp: 0.55, tapLen: 300, tapTau: 70,
    taps: [[0.011, 0.4], [0.026, 0.2], [0.041, 0.18], [0.063, 0.15], [0.09, 0.12], [0.13, 0.09]] },
  // sông hồ: mặt nước phẳng dội âm rõ, sáng, đuôi vừa
  water: { onset: 0.02, decay: 0.75, lp0: 0.62, lpTau: 1.0, amp: 0.55, tapLen: 220, tapTau: 40,
    taps: [[0.011, 0.55], [0.05, 0.35], [0.12, 0.25], [0.3, 0.18], [0.6, 0.12]] }
};
const REVERB_MAP = { URBAN: 'urban', HIGHLAND: 'valley', DESERT: 'desert', JUNGLE: 'forest', RIVER_LAKE: 'water' };

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isMapMuted = false;

    this.masterGain = null;
    this.compressor = null;
    this.limiter = null;
    this.reverb = null;
    // ngân sách tiếng (thời điểm bắt đầu các tiếng đã phát trong 1 s qua) & bộ đếm cho bảng đo F9
    this._vWin = [];
    this._vHead = 0;
    this.audioStats = { made: 0, culled: 0, occl: 0 };
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
    this.masterGain.gain.setValueAtTime(this.masterTarget(), t);

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

    // Hồi âm chiến trường ngoài trời (bộ vang theo môi trường bản đồ: setEnvironment)
    const reverbReturn = this.reverbReturn = ctx.createGain();
    reverbReturn.gain.setValueAtTime(0.6, t);
    reverbReturn.connect(this.masterGain);
    this._envKey = null;
    this.setEnvironment(this._envWanted || '');

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
    // xem qua drone trinh sát: tiếng xe mình nhỏ đi như nghe từ xa (drone_uav.js setDroneFar)
    this.vehicleFar = ctx.createGain();
    this.vehicleDuck.connect(this.vehicleFar);
    this.vehicleFar.connect(this.masterGain);
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

  // Âm lượng tổng thực tế: tab bị ẩn (chuyển tab / thu nhỏ) thì về 0.
  // Không suspend AudioContext vì chơi mạng logic vẫn chạy nền (startBackgroundTicker) và gọi ready() -> resume() lại;
  // hạ gain giữ đồng hồ âm thanh chạy đều nên quay lại tab không bị dồn một loạt tiếng nổ cũ.
  masterTarget() {
    if (this.isPageHidden) return 0;
    return 0.9 * (this.userMaster === undefined ? 1 : this.userMaster);
  }

  setPageHidden(hidden) {
    this.isPageHidden = !!hidden;
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.setTargetAtTime(this.masterTarget(), t, hidden ? 0.03 : 0.15);
  }

  // Mở bản đồ chiến thuật: tắt tiếng máy nổ / mô-tơ, giảm tiếng chiến trường
  // Âm lượng người chơi chọn (0..1): tổng và tiếng động cơ xe. Gọi được trước khi bật âm thanh.
  setUserVolume(master, engine) {
    if (typeof master === 'number') this.userMaster = Math.max(0, Math.min(1, master));
    if (typeof engine === 'number') this.userEngine = Math.max(0, Math.min(1, engine));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this.masterTarget(), t, 0.05);
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
  // P (hồ sơ môi trường, xem REVERB_ENV): onset / decay đuôi vang khuếch tán (s), lp0 / lpTau độ sáng đuôi (đuôi càng
  // lâu càng trầm), amp, taps phản xạ sớm [thời điểm s, biên độ], tapLen / tapTau độ dài & độ nhoè mỗi tiếng dội (mẫu)
  buildOutdoorImpulse(seconds, P = REVERB_ENV.default) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        // Đuôi vang khuếch tán: bắt đầu sau P.onset, tắt dần
        const env = tt < P.onset ? 0 : Math.exp(-(tt - P.onset) / P.decay) * Math.min(1, (tt - P.onset) / 0.04);
        const w = Math.random() * 2 - 1;
        // Lọc thông thấp tăng dần theo thời gian: đuôi vang càng lâu càng trầm
        const k = Math.max(0.02, P.lp0 * Math.exp(-tt / P.lpTau));
        lp += (w - lp) * k;
        d[i] = lp * env * P.amp;
      }
      // Phản xạ sớm: mặt đất (rất sớm), gò đồi, công trình, rìa thung lũng (theo hồ sơ môi trường)
      for (const [time, amp] of P.taps) {
        const at = Math.floor((time + (ch ? 0.0037 : 0) + Math.random() * 0.004) * sr);
        for (let k = 0; k < P.tapLen && at + k < len; k++) {
          d[at + k] += amp * Math.exp(-k / P.tapTau) * (Math.random() * 2 - 1);
        }
      }
    }
    return ir;
  }

  // TIẾNG VANG THEO MÔI TRƯỜNG (gọi khi đổi bản đồ): mỗi hồ sơ một ConvolverNode riêng (tạo khi cần, giữ lại). Âm mới gửi
  // vào bộ vang của môi trường hiện tại; đuôi vang của âm cũ tự tắt trên bộ cũ -> đổi không giật
  setEnvironment(mapType) {
    const key = REVERB_MAP[String(mapType || '').toUpperCase()] || 'default';
    this._envWanted = mapType;   // tên bản đồ (âm thanh khởi tạo sau khi vào bản đồ: áp lúc khởi tạo)
    if (!this.ctx || !this.reverbReturn) return;
    if (this._envKey === key && this.reverb) return;
    const R = this._reverbs || (this._reverbs = {});
    let cv = R[key];
    if (!cv) {
      cv = this.ctx.createConvolver();
      cv.buffer = this.buildOutdoorImpulse(3.0, REVERB_ENV[key] || REVERB_ENV.default);
      cv.connect(this.reverbReturn);
      R[key] = cv;
    }
    this._envKey = key;
    this.reverb = cv;
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
    let wet = Math.min(0.9, 0.12 + m / 240);
    const delay = soundDelay(d);
    let pan = 0, occ = 0;
    // tai nghe: xe mình, hoặc micro drone khi đang xem qua camera drone (game.audioListener)
    const g = window.game, me = g && (g.audioListener ? g.audioListener() : g.player);
    if (pos && me) {
      pan = viewPan(pos.x - me.x, pos.z - me.z, 0.85);
      occ = this.occlusion(pos, me, d);
    }
    // bị che: mất tới ~5 dB tổng & phần lớn âm cao, nghe vọng hơn (tiếng tới tai chủ yếu là tiếng dội / nhiễu xạ)
    const og = 1 - 0.45 * occ, olp = occ > 0 ? Math.max(300, lowpass * (1 - 0.7 * occ)) : lowpass;
    if (occ > 0) wet = Math.min(0.95, wet + 0.25 * occ);
    // Đang nhìn qua kính ngắm = ngồi trong xe (sight_audio.js setInterior): vỏ thép chặn âm cao, tiếng ngoài nhỏ và
    // ít hồi âm ngoài trời hơn
    if (this.interior) return { gain: gain * og * 0.72, lowpass: Math.min(olp, 2600), wet: wet * 0.6, delay, pan, occ };
    return { gain: gain * og, lowpass: olp, wet, delay, pan, occ };
  }

  // Mức che khuất 0..1 giữa nguồn pos {x, z[, y]} và tai (xe mình: cao ~2.5 m trên thân xe; micro drone: đúng vị trí camera)
  occlusion(pos, me, d) {
    const T = window.game && window.game.terrain;
    if (!T || !T.getHeightAt || !(d > 60)) return 0;
    const sy = Number.isFinite(pos.y) ? pos.y + 6 : T.getHeightAt(pos.x, pos.z) + 8;
    const ly = me.isVector3 ? me.y : (Number.isFinite(me.y) ? me.y : T.getHeightAt(me.x, me.z)) + 20;
    const o = occlusionAt(T, pos.x, sy, pos.z, me.x, ly, me.z);
    if (o > 0) this.audioStats.occl++;
    return o;
  }

  // Có cho tiếng ngoài chiến trường mức `level` (gain tới tai) phát không — xem NGÂN SÁCH TIẾNG đầu file
  voiceAllowed(level) {
    const now = this.ctx.currentTime, W = this._vWin;
    let h = this._vHead;
    while (h < W.length && now - W[h] > 1) h++;
    if (h > 256) { W.splice(0, h); h = 0; }
    this._vHead = h;
    const n = W.length - h, S = this.audioStats;
    const thr = Math.min(VOICE_MAXTHR, VOICE_MIN * Math.pow(2, Math.max(0, n - VOICE_SOFT) / 8));
    if (!(level >= thr)) { S.culled++; return false; }
    W.push(now);
    S.made++;
    return true;
  }

  // Kênh phát cho một sự kiện: gain -> lọc không khí -> pan -> bus, kèm nhánh gửi hồi âm
  voice({ bus = null, gain = 1, pan = 0, lowpass = 20000, wet = 0.2 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = gain;
    // tiếng chiến trường dưới ngưỡng ngân sách: trả nút treo (không nối tới loa -> không tốn công xử lý)
    if (!bus && !this.voiceAllowed(gain)) return input;
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
    // mức nền phải im lặng: mặc định gain = 1 trước sự kiện đầu tiên -> mẫu đầu lọt ra nguyên biên độ thành tiếng "tách"
    // (nghe rõ khi lọc thông cao)
    g.gain.value = 0;
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
    g.gain.value = 0;
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

  /**
   * Tổng hợp theo mode dao động (modal synthesis) cho vật rắn bị gõ: mỗi mode là một dao động sin tắt dần theo hàm mũ,
   * tỉ lệ tần số bất hòa đúng loại vật thể (tấm thép / thanh / vỏ rỗng), mode cao tắt nhanh hơn. Khác metal()
   * (nhiễu lọc dải, ngân tối đa ~0,35 s): ngân được lâu như thép thật (thép đập thép ~1-2 s) và có cao độ rõ.
   * T: thời gian tắt (-60 dB) của mode gốc; hard: độ cứng mặt va (1 = thép trên thép) -> tiếng chạm đanh hơn.
   */
  modal(dest, t, { f0 = 300, ratios = [1, 1.47, 2.09, 2.65, 3.4, 4.3], T = 0.3, gain = 0.3, hard = 0.5, tilt = 0.55, fall = 0.45 } = {}) {
    const ctx = this.ctx;
    ratios.forEach((r, i) => {
      const f = f0 * r * (1 + (Math.random() - 0.5) * 0.03);
      if (f > 16000) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const amp = gain / (1 + i * tilt) * (0.75 + Math.random() * 0.5);
      const Ti = Math.max(0.03, T / (1 + i * fall) * Math.pow(f0 / f, 0.15));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.0015);
      g.gain.setTargetAtTime(0.0001, t + 0.0015, Ti / 6.9);
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + 0.0015 + Ti * 1.3 + 0.05);
    });
    // tiếng chạm: xung nhiễu ngắn, mặt càng cứng càng đanh và sáng
    this.burst(dest, t, { filter: 'bandpass', freq: 1400 + 3000 * hard, Q: 0.7, gain: gain * (0.6 + 1.6 * hard), attack: 0.0003, dur: 0.012 - 0.006 * hard });
  }
}

// Gắn phương thức từ một lớp phụ vào SoundEngine — để mỗi nhóm âm thanh nằm ở file riêng mà vẫn viết như phương thức lớp
SoundEngine.mixin = function (Part) {
  for (const k of Object.getOwnPropertyNames(Part.prototype)) {
    if (k !== 'constructor') Object.defineProperty(SoundEngine.prototype, k, Object.getOwnPropertyDescriptor(Part.prototype, k));
  }
};

window.soundEngine = new SoundEngine();

// Chuyển sang tab khác / thu nhỏ cửa sổ: tắt tiếng (động cơ, nổ, môi trường...) tới khi quay lại tab
if (typeof document !== 'undefined') {
  window.soundEngine.isPageHidden = !!document.hidden;
  document.addEventListener('visibilitychange', () => window.soundEngine.setPageHidden(document.hidden));
}
