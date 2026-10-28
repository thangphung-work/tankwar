/**
 * NHẠC NỀN TRAILER TỔNG HỢP (tools/trailer/score.js) — nhạc điện ảnh kịch tính, chạy Node thuần (không cần trình duyệt)
 *
 *   node tools/trailer/score.js <out.wav> [cues.json]
 *
 * cues.json (giây, theo dòng thời gian bản dựng): { "bpm": 135, "build": 8.889, "hit": 26.667, "cut": 48.76,
 *   "logo": 49.66, "end": 55.3 }
 * Rê thứ, vòng hợp âm Dm–Bb–F–C (hồi dồn) / Dm–Bb–Gm–A (cao trào, A trưởng kéo căng về Dm):
 * - Mở màn (0 -> build): nền trầm D, tiếng ngân cao run rẩy, trống taiko lẻ mỗi ô nhịp, âm ngược dâng vào build
 * - Dồn (build -> hit): ostinato móc kép dây trầm (bộ lọc mở dần), pad hợp âm, taiko dày dần, cuộn trống + âm dâng,
 *   lặng phụt 1/4 phách ngay trước cú "ẦM"
 * - Cao trào (hit -> cut): cú đập lớn, ostinato chồng quãng tám, kèn đồng, giai điệu dây dài, trống trận dày dần,
 *   4 ô nhịp cuối cuộn trống móc kép + âm dâng -> cắt lặng tuyệt đối ở cut
 * - Logo (logo -> end): cú đập cuối + hợp âm Dm ngân, vang dài, tắt dần
 */
const fs = require('fs');
const path = require('path');

const SR = 48000;
const OUT = path.resolve(process.argv[2] || 'score.wav');
const C = Object.assign({ bpm: 135, build: 8.889, hit: 26.667, cut: 48.76, logo: 49.66, end: 55.3 },
  process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {});
const BEAT = 60 / C.bpm, BAR = BEAT * 4;
const N = Math.ceil(C.end * SR);
// bus khô (trái / phải) và bus gửi vang
const L = new Float32Array(N), R = new Float32Array(N), VL = new Float32Array(N), VR = new Float32Array(N);

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ghi một mẫu vào bus: pan -1..1, send = tỉ lệ gửi vang
function put(i, v, pan, send) {
  if (i < 0 || i >= N) return;
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  L[i] += v * gl; R[i] += v * gr;
  if (send) { VL[i] += v * gl * send; VR[i] += v * gr * send; }
}

// bộ lọc trạng thái biến thiên (Chamberlin) — thấp qua, cutoff đổi theo thời gian
function svf() { let lo = 0, bp = 0; return (x, fc, q) => { const f = 2 * Math.sin(Math.PI * clamp(fc, 20, SR / 6) / SR); lo += f * bp; const hi = x - lo - q * bp; bp += f * hi; return lo; }; }

// ---- giọng tổng hợp ----
// răng cưa giảm răng (polyBLEP) — dây / kèn đồng
function sawVoice(t0, dur, freq, opt) {
  const o = Object.assign({ gain: 0.2, att: 0.02, rel: 0.2, cut: 1200, cutEnd: null, q: 0.9, pan: 0, send: 0.25, detune: [0], vib: 0 }, opt);
  const i0 = Math.floor(t0 * SR), n = Math.floor((dur + o.rel) * SR);
  const ph = o.detune.map(() => rnd()), flt = svf();
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let env = t < o.att ? t / o.att : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / o.rel);
    if (env <= 0) continue;
    let s = 0;
    for (let d = 0; d < o.detune.length; d++) {
      const f = freq * Math.pow(2, o.detune[d] / 1200) * (1 + o.vib * Math.sin(2 * Math.PI * 5.2 * t)), dt = f / SR;
      ph[d] += dt; if (ph[d] >= 1) ph[d] -= 1;
      let v = 2 * ph[d] - 1, p = ph[d];
      if (p < dt) { p /= dt; v -= p + p - p * p - 1; } else if (p > 1 - dt) { p = (p - 1) / dt; v -= p * p + p + p + 1; }
      s += v;
    }
    s /= o.detune.length;
    const fc = o.cutEnd ? o.cut + (o.cutEnd - o.cut) * Math.min(1, t / dur) : o.cut;
    put(i0 + k, flt(s, fc, o.q) * env * o.gain, o.pan, o.send);
  }
}
// sin (sub, tiếng ngân cao)
function sineVoice(t0, dur, freq, opt) {
  const o = Object.assign({ gain: 0.2, att: 0.5, rel: 0.8, pan: 0, send: 0.3, trem: 0, glide: null }, opt);
  const i0 = Math.floor(t0 * SR), n = Math.floor((dur + o.rel) * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let env = t < o.att ? t / o.att : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / o.rel);
    const f = o.glide ? freq * Math.pow(o.glide / freq, Math.min(1, t / dur)) : freq;
    ph += f / SR;
    const tr = o.trem ? 1 - o.trem * (0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * t)) : 1;
    put(i0 + k, Math.sin(2 * Math.PI * ph) * env * tr * o.gain, o.pan, o.send);
  }
}
// trống taiko: sin trượt 130 -> 48 Hz + da trống (nhiễu lọc thấp)
function taiko(t0, gain, pan) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(1.1 * SR), flt = svf();
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, f = 48 + 82 * Math.exp(-t * 22);
    ph += f / SR;
    const body = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 4.2);
    const skin = flt(rnd() * 2 - 1, 900, 0.7) * Math.exp(-t * 28) * 0.9;
    put(i0 + k, (body + skin) * gain, pan || 0, 0.22);
  }
}
// trống dây / trống lẫy (cuộn trống): nhiễu dải giữa + tông 190 Hz
function snare(t0, gain, pan) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.3 * SR), flt = svf();
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR; ph += 190 / SR;
    const s = (flt(rnd() * 2 - 1, 3800, 0.5) * 0.8 * Math.exp(-t * 18) + Math.sin(2 * Math.PI * ph) * 0.5 * Math.exp(-t * 30));
    put(i0 + k, s * gain, pan || 0, 0.18);
  }
}
// cú đập điện ảnh: sub rơi + nhiễu bùng + vang nặng
function bigHit(t0, gain) {
  sineVoice(t0, 2.4, 92, { gain: 0.9 * gain, att: 0.003, rel: 1.4, glide: 30, send: 0.15 });
  const i0 = Math.floor(t0 * SR), n = Math.floor(1.6 * SR), flt = svf();
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    put(i0 + k, flt(rnd() * 2 - 1, 2400 * Math.exp(-t * 3) + 120, 0.6) * Math.exp(-t * 3.2) * 0.9 * gain, (rnd() - 0.5) * 0.4, 0.6);
  }
  for (const m of [26, 33, 38]) sawVoice(t0, 1.6, hz(m), { gain: 0.16 * gain, att: 0.01, rel: 1.5, cut: 1600, cutEnd: 260, q: 0.6, detune: [-8, 0, 9], send: 0.45 });
}
// âm dâng: nhiễu dải quét lên + răng cưa trượt, to dần, tắt phụt ở cuối
function riser(tEnd, dur, gain) {
  const t0 = tEnd - dur, i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), flt = svf();
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, p = t / dur, a = Math.pow(p, 2.2) * gain;
    ph += (90 * Math.pow(10, p * 1.1)) / SR;
    const s = flt(rnd() * 2 - 1, 300 + 6000 * p * p, 0.35) * 0.9 + (2 * (ph % 1) - 1) * 0.18;
    put(i0 + k, s * a, Math.sin(t * 3) * 0.5, 0.3);
  }
}
// âm ngược (cymbal đảo chiều): nhiễu cao to dần
function swell(tEnd, dur, gain) {
  const i0 = Math.floor((tEnd - dur) * SR), n = Math.floor(dur * SR), flt = svf();
  for (let k = 0; k < n; k++) {
    const p = k / n, x = rnd() * 2 - 1;
    put(i0 + k, (x - flt(x, 2500, 0.7)) * Math.pow(p, 3) * gain, 0, 0.5);
  }
}

// ---- soạn nhạc ----
const D2 = 38, D1 = 26;
const PROG_BUILD = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];        // Dm Bb F C (quãng 3 giữa)
const ROOT_BUILD = [38, 34, 41, 36];                                                  // D Bb F C (âm trầm)
const PROG_HIT = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];          // Dm Bb Gm A
const ROOT_HIT = [38, 34, 31, 33];
const barAt = (t) => Math.floor((t + 1e-6) / BAR);
const nBuild0 = barAt(C.build), nHit = barAt(C.hit), nCut = C.cut;

// 1. MỞ MÀN — nền trầm D + ngân cao run, taiko lẻ, âm ngược vào build
sineVoice(0.2, C.build - 0.2, hz(D1), { gain: 0.32, att: 2.5, rel: 0.6, send: 0.1 });
sawVoice(0.2, C.build - 0.2, hz(D2), { gain: 0.1, att: 3, rel: 0.6, cut: 220, cutEnd: 520, detune: [-7, 0, 6], send: 0.3 });
sineVoice(1.2, C.build - 1.4, hz(81), { gain: 0.035, att: 2.5, rel: 1, trem: 0.6, pan: -0.4, send: 0.6 });   // A5
sineVoice(2.4, C.build - 2.6, hz(86), { gain: 0.03, att: 2.5, rel: 1, trem: 0.6, pan: 0.4, send: 0.6 });    // D6
for (let b = 1; b < nBuild0; b++) taiko(b * BAR, 0.32 + 0.06 * b, 0);
swell(C.build, 1.6, 0.35);

// 2. DỒN — ostinato dây trầm móc kép, pad, taiko dày dần, cuộn trống + âm dâng, lặng phụt trước "ẦM"
const OST = [0, 0, 12, 0, 3, 0, 10, 0, 0, 0, 7, 0, 5, 0, 3, 2];   // độ lệch nửa cung theo âm gốc hợp âm
const silenceBeforeHit = BEAT * 0.25;
for (let b = nBuild0; b < nHit; b++) {
  const k = (b - nBuild0) % 4, p = (b - nBuild0) / Math.max(1, nHit - nBuild0), t0 = b * BAR;
  const root = ROOT_BUILD[k];
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * BEAT / 4;
    if (t > C.hit - silenceBeforeHit) break;
    sawVoice(t, BEAT / 4 * 0.8, hz(root + OST[s]), { gain: 0.12 + 0.04 * p, att: 0.004, rel: 0.05, cut: 700 + 1400 * p, q: 1.1, detune: [-5, 5], send: 0.12, pan: s % 2 ? 0.25 : -0.25 });
  }
  // pad hợp âm (dây lớp dày)
  const pd = Math.min(BAR, C.hit - silenceBeforeHit - t0);
  for (const m of PROG_BUILD[k]) sawVoice(t0, pd, hz(m), { gain: 0.035 + 0.03 * p, att: 0.3, rel: 0.4, cut: 900 + 1200 * p, detune: [-9, 0, 8], vib: 0.003, send: 0.5, pan: (m % 3 - 1) * 0.4 });
  sineVoice(t0, pd, hz(root - 12), { gain: 0.14, att: 0.05, rel: 0.2, send: 0.05 });
  // trống: 1 phách -> 1 & 3 -> móc đơn
  const hits = p < 0.4 ? [0] : p < 0.7 ? [0, 2] : [0, 1, 2, 3, 3.5];
  for (const h of hits) { const t = t0 + h * BEAT; if (t < C.hit - silenceBeforeHit) taiko(t, 0.5 + 0.35 * p, (h % 2) * 0.3 - 0.15); }
}
// kèn đồng trầm báo hiệu mỗi 2 ô nhịp
for (let b = nBuild0 + 2; b < nHit - 1; b += 2) bigHit(b * BAR, 0.32);
// cuộn trống ô nhịp cuối + âm dâng
for (let t = C.hit - BAR; t < C.hit - silenceBeforeHit; t += BEAT / 4) snare(t, 0.15 + 0.4 * (1 - (C.hit - t) / BAR), (rnd() - 0.5) * 0.6);
riser(C.hit - silenceBeforeHit, BAR * 1.5, 0.5);

// 3. CAO TRÀO — "ẦM", ostinato quãng tám, kèn đồng, giai điệu dây, trống trận
bigHit(C.hit, 1.0);
taiko(C.hit, 1.0, 0);
const MELODY = [69, 70, 67, 69, 74, 72, 70, 69];   // A4 Bb4 G4 A4 D5 C5 Bb4 A4 — mỗi nốt 1 ô nhịp, chồng lên hợp âm
const nCutBar = Math.ceil(nCut / BAR);
for (let b = nHit; b < nCutBar; b++) {
  const k = (b - nHit) % 4, p = (b - nHit) / Math.max(1, nCutBar - nHit), t0 = b * BAR;
  const root = ROOT_HIT[k], end = Math.min(t0 + BAR, nCut);
  if (end <= t0) break;
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * BEAT / 4;
    if (t >= nCut) break;
    const m = root + OST[s];
    sawVoice(t, BEAT / 4 * 0.8, hz(m), { gain: 0.11, att: 0.003, rel: 0.04, cut: 1700 + 900 * p, q: 1.1, detune: [-5, 5], send: 0.1, pan: -0.3 });
    sawVoice(t, BEAT / 4 * 0.8, hz(m + 12), { gain: 0.06, att: 0.003, rel: 0.04, cut: 2400, q: 1.0, detune: [-4, 4], send: 0.12, pan: 0.3 });
  }
  // kèn đồng: hợp âm cả ô nhịp, thổi mạnh đầu ô
  for (const m of PROG_HIT[k]) sawVoice(t0, end - t0 - 0.05, hz(m - 12), { gain: 0.06 + 0.03 * p, att: 0.06, rel: 0.12, cut: 700, cutEnd: 1500, q: 0.7, detune: [-6, 0, 7], send: 0.35, pan: (m % 3 - 1) * 0.35 });
  // giai điệu dây cao (từ ô nhịp thứ 2 của cao trào)
  if (b > nHit) sawVoice(t0, end - t0, hz(MELODY[(b - nHit - 1) % MELODY.length]), { gain: 0.05 + 0.03 * p, att: 0.25, rel: 0.3, cut: 2600, detune: [-10, 0, 10], vib: 0.004, send: 0.55 });
  sineVoice(t0, end - t0, hz(root - 12), { gain: 0.18, att: 0.02, rel: 0.05, send: 0.03 });
  // trống trận: taiko 1, 2+, 3, 4 + trống lẫy 2 & 4; 4 ô cuối cuộn móc kép
  const finale = nCutBar - b <= 3;
  const tk = finale ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 1.5, 2, 3, 3.5];
  for (const h of tk) { const t = t0 + h * BEAT; if (t < nCut) taiko(t, 0.62 + 0.25 * p, ((h * 2) % 2) * 0.4 - 0.2); }
  for (const h of [1, 3]) { const t = t0 + h * BEAT; if (t < nCut) snare(t, 0.32, 0.1); }
  if (finale) for (let t = t0; t < end; t += BEAT / 4) snare(t, 0.12 + 0.25 * ((t - t0) / BAR), (rnd() - 0.5) * 0.5);
}
for (let b = nHit + 4; b < nCutBar - 1; b += 4) bigHit(b * BAR, 0.45);
riser(nCut, BAR * 2, 0.55);

// 4. LOGO — cú đập cuối + hợp âm Dm ngân, vang dài
bigHit(C.logo, 1.0);
taiko(C.logo, 0.9, 0);
const tailD = C.end - C.logo - 0.3;
for (const m of [38, 45, 50, 53, 57, 62]) sawVoice(C.logo, tailD * 0.55, hz(m), { gain: m < 45 ? 0.07 : 0.045, att: 0.08, rel: tailD * 0.45, cut: 1300, cutEnd: 380, detune: [-9, 0, 9], vib: 0.003, send: 0.6, pan: (m % 4 - 1.5) * 0.25 });
sineVoice(C.logo, tailD * 0.5, hz(D1), { gain: 0.3, att: 0.01, rel: tailD * 0.5, send: 0.1 });

// ---- vang (Freeverb rút gọn: 4 lược + 2 thông tất mỗi kênh) ----
function reverb(inp, out, spread) {
  const combs = [1557, 1617, 1491, 1422].map(d => ({ b: new Float32Array(d + spread), i: 0, f: 0 }));
  const aps = [556, 441].map(d => ({ b: new Float32Array(d + spread), i: 0 }));
  const fb = 0.86, damp = 0.35;
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.12;
    let y = 0;
    for (const c of combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * fb; c.i = (c.i + 1) % c.b.length; y += o; }
    for (const a of aps) { const o = a.b[a.i]; const v = -y + o; a.b[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.b.length; y = v; }
    out[n] += y;
  }
}
reverb(VL, L, 0); reverb(VR, R, 23);

// cắt lặng tuyệt đối từ cut tới logo (tiếng vang cũng tắt: khoảng lặng thật sự)
for (let n = Math.floor(C.cut * SR); n < Math.floor(C.logo * SR) && n < N; n++) { L[n] = 0; R[n] = 0; }
// mờ cuối
const fo = Math.floor(1.2 * SR);
for (let k = 0; k < fo; k++) { const g = k / fo; L[N - 1 - k] *= g; R[N - 1 - k] *= g; }

// ---- chuẩn hoá đỉnh -1 dBFS, nén mềm, ghi WAV 16-bit ----
let pk = 1e-9;
for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n]));
const k = 0.89 / pk;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0, o = 44; n < N; n++, o += 4) {
  buf.writeInt16LE(Math.round(clamp(Math.tanh(L[n] * k * 1.1) * 32767, -32768, 32767)), o);
  buf.writeInt16LE(Math.round(clamp(Math.tanh(R[n] * k * 1.1) * 32767, -32768, 32767)), o + 2);
}
fs.writeFileSync(OUT, buf);
console.log('[SCORE] ' + C.bpm + ' BPM, ' + C.end.toFixed(1) + ' s ->', OUT);
