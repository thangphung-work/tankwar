/**
 * ĐỒNG HỒ ẢO CHO QUAY TRAILER (tools/trailer/timewarp.js) — chèn vào trang TRƯỚC mọi script game (CDP
 * Page.addScriptToEvaluateOnNewDocument).
 *
 * - Lúc nạp trang / dựng bản đồ: mọi thứ chạy thời gian thật như thường.
 * - __TW.enter(): từ đó performance.now / Date.now / requestAnimationFrame / setTimeout / setInterval /
 *   requestIdleCallback chạy theo đồng hồ ảo. Mỗi lần __TW.frame() đồng hồ tiến đúng 1/fps giây, chạy các hẹn giờ
 *   tới hạn rồi một khung game (update + render) -> video mượt dù máy vẽ mỗi khung mất bao lâu.
 * - Âm thanh: AudioContext của game được thay bằng OfflineAudioContext. Mỗi khung, bộ dựng âm chạy tới đúng mốc
 *   thời gian của khung rồi tạm dừng (suspend) -> tiếng pháo / nổ khớp hình tới vài ms. Hết buổi quay lấy cả
 *   dải âm thanh (__TW.finishAudio) ra WAV.
 */
(function () {
  if (!/[?&]lab=trailer(&|$)/.test(location.search)) return;
  const R = {
    now: performance.now.bind(performance),
    dateNow: Date.now,
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window),
    ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window),
    ci: window.clearInterval.bind(window),
    ric: window.requestIdleCallback ? window.requestIdleCallback.bind(window) : null,
    cic: window.cancelIdleCallback ? window.cancelIdleCallback.bind(window) : null
  };
  const q = new URLSearchParams(location.search);
  const FPS = parseFloat(q.get('fps')) || 30;
  const AUDIO_SEC = parseFloat(q.get('asec')) || 240;
  const SR = 48000;

  const TW = window.__TW = {
    virtual: false, V: 0, dateOff: 0, fps: FPS, frameN: 0, real: R,
    raf: new Map(), timers: new Map(), idle: new Map(), id: 1e8,
    audio: null, audioStarted: false, _parked: Promise.resolve(), audioDone: null, audioBuf: null
  };

  // trang chạy ẩn (headless) vẫn coi như đang hiện: game tắt tiếng / hãm logic khi tab ẩn
  try {
    Object.defineProperty(document, 'hidden', { get: () => false });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    document.hasFocus = () => true;
  } catch (e) { /* bỏ qua */ }

  // ---------------------------------------------------------------- thời gian
  performance.now = function () { return TW.virtual ? TW.V : R.now(); };
  Date.now = function () { return TW.virtual ? TW.dateOff + TW.V : R.dateNow(); };

  window.requestAnimationFrame = function (cb) {
    if (!TW.virtual) return R.raf(cb);
    const id = ++TW.id; TW.raf.set(id, cb); return id;
  };
  window.cancelAnimationFrame = function (id) { if (TW.raf.has(id)) TW.raf.delete(id); else R.caf(id); };

  function addTimer(fn, d, args, rep) {
    const id = ++TW.id;
    d = Math.max(0, +d || 0);
    TW.timers.set(id, { at: TW.V + d, fn, args, rep: rep ? Math.max(1, d) : 0 });
    return id;
  }
  window.setTimeout = function (fn, d, ...args) {
    if (!TW.virtual || typeof fn !== 'function') return R.st(fn, d, ...args);
    return addTimer(fn, d, args, false);
  };
  window.setInterval = function (fn, d, ...args) {
    if (!TW.virtual || typeof fn !== 'function') return R.si(fn, d, ...args);
    return addTimer(fn, d, args, true);
  };
  window.clearTimeout = function (id) { if (TW.timers.has(id)) TW.timers.delete(id); else R.ct(id); };
  window.clearInterval = function (id) { if (TW.timers.has(id)) TW.timers.delete(id); else R.ci(id); };
  if (R.ric) {
    window.requestIdleCallback = function (cb, o) {
      if (!TW.virtual) return R.ric(cb, o);
      const id = ++TW.id; TW.idle.set(id, cb); return id;
    };
    window.cancelIdleCallback = function (id) { if (TW.idle.has(id)) TW.idle.delete(id); else R.cic(id); };
  }

  TW.enter = function () {
    if (TW.virtual) return;
    TW.V = R.now();
    TW.dateOff = R.dateNow() - TW.V;
    TW.virtual = true;
  };

  function runTimers() {
    let guard = 0;
    for (;;) {
      let best = null, bestId = 0;
      for (const [id, t] of TW.timers) if (t.at <= TW.V && (!best || t.at < best.at)) { best = t; bestId = id; }
      if (!best || ++guard > 5000) break;
      if (best.rep) best.at += best.rep; else TW.timers.delete(bestId);
      try { best.fn(...(best.args || [])); } catch (e) { console.error('[TW] timer', e); }
    }
  }
  function runIdle() {
    if (!TW.idle.size) return;
    const list = [...TW.idle.values()]; TW.idle.clear();
    const dl = { didTimeout: false, timeRemaining: () => 8 };
    for (const cb of list) { try { cb(dl); } catch (e) { console.error('[TW] idle', e); } }
  }
  function runRaf() {
    const list = [...TW.raf.values()]; TW.raf.clear();
    for (const cb of list) { try { cb(TW.V); } catch (e) { console.error('[TW] raf', e); } }
  }
  function stepClock() {
    TW.frameN++;
    // timeScale < 1: quay chậm thật (game chạy ít thời gian hơn mỗi khung hình, vẫn ghi đủ 30 khung / giây)
    TW.V += 1000 / FPS * Math.max(0.05, Math.min(1, TW.timeScale || 1));
    runTimers();
    runIdle();
    runRaf();
  }

  // ---------------------------------------------------------------- âm thanh
  // Mọi lần game "new AudioContext()" đều nhận chung một OfflineAudioContext
  function makeCtx() {
    if (TW.audio) return TW.audio;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(AUDIO_SEC * SR), sampleRate: SR });
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    ctx.resume = () => Promise.resolve();
    ctx.close = () => Promise.resolve();
    ctx.__suspend = OfflineAudioContext.prototype.suspend.bind(ctx);
    ctx.__resume = OfflineAudioContext.prototype.resume.bind(ctx);
    ctx.suspend = () => Promise.resolve();
    TW.audio = ctx;
    return ctx;
  }
  function FakeAudioContext() { return makeCtx(); }
  FakeAudioContext.prototype = OfflineAudioContext.prototype;
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  // Một khung: âm thanh chạy tới mốc thời gian khung này rồi dừng, khi đó mới chạy khung game
  // skipAudio: khung chạy ngầm (chờ cỏ / chi tiết dựng xong sau khi cắt cảnh, không ghi hình): đồng hồ âm thanh đứng yên
  TW.audioSkip = 0;
  TW.frame = function (skipAudio) {
    const ctx = TW.audio;
    if (skipAudio && TW.audioStarted) { TW.audioSkip++; stepClock(); return Promise.resolve(TW.frameN); }
    const t = (TW.audioFrame0 !== undefined ? TW.frameN + 1 - TW.audioFrame0 - TW.audioSkip : 0) / FPS;
    if (!ctx || !TW.audioStarted || t >= AUDIO_SEC - 0.05) { stepClock(); return Promise.resolve(TW.frameN); }
    // phải đợi bộ dựng âm DỪNG HẲN ở mốc trước rồi mới resume (resume lúc chưa dừng bị bỏ qua -> hai bên chờ nhau mãi)
    return TW._parked.then(() => new Promise((res) => {
      TW._parked = ctx.__suspend(t);
      TW._parked.then(() => { stepClock(); res(TW.frameN); }, (e) => { console.warn('[TW] suspend', e); TW._parked = Promise.resolve(); stepClock(); res(TW.frameN); });
      ctx.__resume().catch((e) => console.warn('[TW] resume', e));
    }));
  };

  // Bắt đầu dựng âm thanh (đặt mốc 0 của dải âm = khung kế tiếp)
  TW.startAudio = function () {
    const ctx = makeCtx();
    if (TW.audioStarted) return;
    TW.audioStarted = true;
    TW.audioFrame0 = TW.frameN;
    // đặt điểm dừng TRƯỚC khi bắt đầu dựng (dựng chạy ngay trên luồng âm thanh) -> dừng ở mốc ~0 chờ khung đầu
    TW._parked = ctx.__suspend(128 / SR).catch(() => {});
    TW.audioDone = ctx.startRendering().then((b) => { TW.audioBuf = b; return b; });
    return TW._parked;
  };

  // Dựng hết phần âm còn lại, cắt đúng độ dài đã quay, đổi ra WAV 16 bit
  TW.finishAudio = async function () {
    const ctx = TW.audio;
    if (!ctx || !TW.audioStarted) return null;
    const usedSec = (TW.frameN - TW.audioFrame0 - TW.audioSkip) / FPS;
    await TW._parked;
    ctx.__resume();
    const buf = await TW.audioDone;
    const n = Math.min(buf.length, Math.ceil(usedSec * SR));
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    w(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) {
      out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      out.setInt16(o + 2, Math.max(-1, Math.min(1, Rr[i])) * 32767, true);
    }
    return new Blob([out.buffer], { type: 'audio/wav' });
  };
})();
