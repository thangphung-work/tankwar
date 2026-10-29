/**
 * NHẠC NỀN TRAILER "CHIẾN TRƯỜNG" (tools/trailer/score2.js) — Node thuần, không cần trình duyệt
 *
 *   node tools/trailer/score2.js <out.wav> [cues.json]
 *
 * cues.json (giây): { bpm, build, mid, hit, logo, end, extra: [..] } — mid (tuỳ chọn) = lúc giai điệu chủ đề vào
 * Rê thứ, nhịp 135. Lối hoà âm Hans-Zimmer-kiểu: ostinato dây móc kép không ngừng, trống trận nhiều lớp,
 * kèn đồng hùng tráng + hợp xướng "ah", tiếng gầm "braaam" trầm.
 *  - Mở (0 -> build)  : braaam, tiếng tích tắc căng thẳng, dây trầm rung, trống lớn lẻ, âm ngược dồn vào build
 *  - Dồn 1 (build -> mid): ostinato dây trầm + dây nảy cao, trống dày dần, hợp xướng trầm nền
 *  - Dồn 2 (mid -> hit) : giai điệu chủ đề kèn đồng (Dm Bb F C), trống trận đủ bộ, 2 ô cuối cuộn trống + dâng, lặng 1/4 phách
 *  - Cao trào (hit -> logo): ẦM + chũm choẹ, nhịp trống gấp đôi, chủ đề hợp xướng + kèn chồng quãng tám (Dm Bb Gm A),
 *                            tiếng búa thép phách 2 & 4, ô cuối dồn trống -> lặng 1/2 phách
 *  - Logo: ẦM cuối + hợp âm Dm (kèn, hợp xướng) ngân dài
 */
const fs = require('fs');
const path = require('path');

const SR = 48000;
const OUT = path.resolve(process.argv[2] || 'score2.wav');
const C = Object.assign({ bpm: 135, build: 3.556, hit: 28.444, logo: 39.9, end: 45.3 },
  process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {});
const BEAT = 60 / C.bpm, BAR = BEAT * 4;
if (!C.mid) C.mid = C.build + Math.round((C.hit - C.build) / BAR * 0.45) * BAR;
const N = Math.ceil(C.end * SR);
const L = new Float32Array(N), R = new Float32Array(N), VL = new Float32Array(N), VR = new Float32Array(N);
// bus "dồn" (ostinato) — bị nén nhịp theo trống lớn (pumping)
const PL = new Float32Array(N), PR = new Float32Array(N), DUCK = new Float32Array(N).fill(1);

let seed = 777;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function put(i, v, pan, send, pump) {
  if (i < 0 || i >= N) return;
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  if (pump) { PL[i] += v * gl; PR[i] += v * gr; } else { L[i] += v * gl; R[i] += v * gr; }
  if (send) { VL[i] += v * gl * send; VR[i] += v * gr * send; }
}
// bộ lọc trạng thái (Chamberlin): trả về {lo, bp, hi}
function svf() {
  let lo = 0, bp = 0; const o = { lo: 0, bp: 0, hi: 0 };
  return (x, fc, q) => { const f = 2 * Math.sin(Math.PI * clamp(fc, 20, SR / 6) / SR); lo += f * bp; const hi = x - lo - q * bp; bp += f * hi; o.lo = lo; o.bp = bp; o.hi = hi; return o; };
}
function blepSaw(ph, dt) {
  let v = 2 * ph - 1, p = ph;
  if (p < dt) { p /= dt; v -= p + p - p * p - 1; } else if (p > 1 - dt) { p = (p - 1) / dt; v -= p * p + p + p + 1; }
  return v;
}

// ---- giọng ----
// răng cưa chồng (dây / kèn / synth): lọc thấp có đường bao, trượt cao độ đầu nốt, méo tanh
function saw(t0, dur, freq, opt) {
  const o = Object.assign({ gain: 0.2, att: 0.02, rel: 0.2, cut: 1200, cutA: null, cutT: 0.15, cutEnd: null, q: 0.9, pan: 0, send: 0.25,
    detune: [0], vib: 0, vibD: 0.3, scoop: 0, drive: 0, pump: false, spread: 0 }, opt);
  const i0 = Math.floor(t0 * SR), n = Math.floor((dur + o.rel) * SR);
  const ph = o.detune.map(() => rnd()), fl = svf(), fr = svf();
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let env = t < o.att ? t / o.att : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / o.rel);
    if (env <= 0) continue;
    const vibA = o.vib * Math.min(1, t / o.vibD), sc = o.scoop ? Math.pow(2, -o.scoop / 1200 * Math.exp(-t * 30)) : 1;
    let sl = 0, sr = 0;
    for (let d = 0; d < o.detune.length; d++) {
      const f = freq * sc * Math.pow(2, o.detune[d] / 1200) * (1 + vibA * Math.sin(2 * Math.PI * (5 + d * 0.3) * t)), dt = f / SR;
      ph[d] += dt; if (ph[d] >= 1) ph[d] -= 1;
      const v = blepSaw(ph[d], dt);
      const pp = o.detune.length > 1 ? (d / (o.detune.length - 1)) * 2 - 1 : 0;
      sl += v * (1 - o.spread * pp); sr += v * (1 + o.spread * pp);
    }
    sl /= o.detune.length; sr /= o.detune.length;
    let fc = o.cutEnd ? o.cut + (o.cutEnd - o.cut) * Math.min(1, t / dur) : o.cut;
    if (o.cutA != null) fc = o.cutA + (fc - o.cutA) * Math.min(1, t / o.cutT);
    let yl = fl(sl, fc, o.q).lo, yr = fr(sr, fc, o.q).lo;
    if (o.drive) { yl = Math.tanh(yl * (1 + o.drive)) / Math.tanh(1 + o.drive); yr = Math.tanh(yr * (1 + o.drive)) / Math.tanh(1 + o.drive); }
    const a = env * o.gain;
    if (o.spread) { put(i0 + k, yl * a, -1 + (o.pan + 1) * 0.5, o.send, o.pump); put(i0 + k, yr * a, (o.pan + 1) * 0.5, o.send, o.pump); }
    else put(i0 + k, (yl + yr) * 0.5 * a, o.pan, o.send, o.pump);
  }
}
function sine(t0, dur, freq, opt) {
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
// hợp xướng "ah": răng cưa dày qua 3 bộ lọc dải (formant)
const VOW = { ah: [[730, 1], [1090, 0.5], [2440, 0.22]], oh: [[570, 1], [840, 0.45], [2410, 0.15]] };
function choir(t0, dur, midi, opt) {
  const o = Object.assign({ gain: 0.1, att: 0.5, rel: 0.8, pan: 0, send: 0.7, vowel: 'ah' }, opt);
  const F = VOW[o.vowel], f0 = hz(midi), i0 = Math.floor(t0 * SR), n = Math.floor((dur + o.rel) * SR);
  const det = [-14, -6, 0, 7, 15], ph = det.map(() => rnd()), fs = F.map(() => svf()), rates = det.map(() => 4.6 + rnd() * 1.4);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let env = t < o.att ? Math.pow(t / o.att, 1.5) : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / o.rel);
    if (env <= 0) continue;
    let s = 0;
    for (let d = 0; d < det.length; d++) {
      const f = f0 * Math.pow(2, det[d] / 1200) * (1 + 0.006 * Math.sin(2 * Math.PI * rates[d] * t + d)), dt = f / SR;
      ph[d] += dt; if (ph[d] >= 1) ph[d] -= 1;
      s += blepSaw(ph[d], dt);
    }
    s /= det.length;
    let y = 0;
    for (let j = 0; j < F.length; j++) y += fs[j](s, F[j][0], 0.18).bp * F[j][1];
    put(i0 + k, y * env * o.gain, o.pan, o.send);
  }
}
// trống trận lớn: thân sin trượt + da trống + sub
function taiko(t0, gain, pan, pitch) {
  const pk = pitch || 1, i0 = Math.floor(t0 * SR), n = Math.floor(1.3 * SR), fl = svf();
  let ph = 0, ps = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, f = (46 + 95 * Math.exp(-t * 20)) * pk;
    ph += f / SR; ps += 38 * pk / SR;
    const body = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 3.6);
    const sub = Math.sin(2 * Math.PI * ps) * Math.exp(-t * 2.4) * 0.45 * Math.min(1, t * 200);
    const skin = fl(rnd() * 2 - 1, 1100 * pk, 0.6).lo * Math.exp(-t * 26) * 1.1;
    put(i0 + k, Math.tanh((body + sub + skin) * 1.3) * gain, pan || 0, 0.28);
  }
  // nén nhịp bus ostinato
  const dn = Math.floor(0.22 * SR);
  for (let k = 0; k < dn; k++) { const i = i0 + k; if (i >= 0 && i < N) DUCK[i] = Math.min(DUCK[i], 1 - Math.min(0.55, gain * 0.6) * (1 - k / dn)); }
}
// trống dàn (ensemble): 3 trống lệch nhau vài ms
function ens(t0, gain, pan) { taiko(t0, gain, (pan || 0) - 0.25, 1); taiko(t0 + 0.009, gain * 0.7, (pan || 0) + 0.3, 1.18); taiko(t0 + 0.017, gain * 0.5, pan || 0, 0.82); }
function tom(t0, gain, pan, f0) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.5 * SR), fl = svf(); let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, f = f0 * (1 + 0.6 * Math.exp(-t * 30)); ph += f / SR;
    const s = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7) + fl(rnd() * 2 - 1, 2000, 0.6).lo * Math.exp(-t * 35) * 0.6;
    put(i0 + k, s * gain, pan || 0, 0.22);
  }
}
function snare(t0, gain, pan) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.35 * SR), fl = svf(); let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR; ph += 185 / SR;
    const s = fl(rnd() * 2 - 1, 4200, 0.5).bp * 1.6 * Math.exp(-t * 14) + Math.sin(2 * Math.PI * ph) * 0.55 * Math.exp(-t * 28);
    put(i0 + k, s * gain, pan || 0, 0.3);
  }
}
function hat(t0, gain, pan) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.06 * SR), fl = svf();
  for (let k = 0; k < n; k++) { const t = k / SR; put(i0 + k, fl(rnd() * 2 - 1, 7000, 0.4).hi * Math.exp(-t * 70) * gain, pan || 0, 0.05); }
}
// búa thép (anvil): các họa âm không điều hoà
function anvil(t0, gain, pan) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.9 * SR), P = [1, 2.76, 5.4, 8.93].map(r => ({ f: 520 * r, p: rnd() }));
  for (let k = 0; k < n; k++) {
    const t = k / SR; let s = 0;
    for (let j = 0; j < P.length; j++) { P[j].p += P[j].f / SR; s += Math.sin(2 * Math.PI * P[j].p) * Math.exp(-t * (6 + j * 5)) / (1 + j); }
    put(i0 + k, s * gain * 0.6, pan || 0, 0.35);
  }
}
function crash(t0, gain) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(2.6 * SR), fl = svf(), fr = svf();
  for (let k = 0; k < n; k++) {
    const t = k / SR, e = Math.exp(-t * 1.7) * gain;
    L[i0 + k] += (fl(rnd() * 2 - 1, 5000, 0.5).hi) * e * 0.5 || 0;
    R[i0 + k] += (fr(rnd() * 2 - 1, 5000, 0.5).hi) * e * 0.5 || 0;
  }
}
// "braaam": cụm kèn đồng trầm méo, lọc mở dần
function braam(t0, dur, gain, root) {
  const r = root || 26;
  for (const [m, gg] of [[r, 1], [r + 7, 0.7], [r + 12, 0.8], [r + 15, 0.35]])
    saw(t0, dur, hz(m), { gain: 0.16 * gain * gg, att: 0.04, rel: 1.4, cutA: 180, cut: 1500, cutT: 0.5, cutEnd: 300, q: 0.7, detune: [-11, -4, 3, 10], drive: 2.2, send: 0.45, spread: 0.6 });
  sine(t0, dur * 0.9, hz(r - 12), { gain: 0.5 * gain, att: 0.01, rel: 1.2, send: 0.05 });
}
// cú ẦM: sub rơi + nhiễu bùng + braaam ngắn
function boom(t0, gain) {
  sine(t0, 2.6, 88, { gain: 0.95 * gain, att: 0.002, rel: 1.6, glide: 28, send: 0.12 });
  const i0 = Math.floor(t0 * SR), n = Math.floor(1.8 * SR), fl = svf();
  for (let k = 0; k < n; k++) { const t = k / SR; put(i0 + k, fl(rnd() * 2 - 1, 2600 * Math.exp(-t * 2.8) + 110, 0.6).lo * Math.exp(-t * 3) * 0.9 * gain, (rnd() - 0.5) * 0.4, 0.6); }
}
function riser(tEnd, dur, gain) {
  const t0 = tEnd - dur, i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), fl = svf();
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, p = t / dur, a = Math.pow(p, 2.2) * gain;
    ph += (90 * Math.pow(10, p * 1.2)) / SR;
    const s = fl(rnd() * 2 - 1, 300 + 7000 * p * p, 0.35).lo * 0.9 + (2 * (ph % 1) - 1) * 0.16;
    put(i0 + k, s * a, Math.sin(t * 3) * 0.5, 0.3);
  }
}
function swell(tEnd, dur, gain) {
  const i0 = Math.floor((tEnd - dur) * SR), n = Math.floor(dur * SR), fl = svf();
  for (let k = 0; k < n; k++) { const p = k / n; put(i0 + k, fl(rnd() * 2 - 1, 2500, 0.7).hi * Math.pow(p, 3) * gain, 0, 0.5); }
}
// tiếng gió rơi sau cú đập (downlifter)
function whoosh(t0, dur, gain) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), fl = svf();
  for (let k = 0; k < n; k++) { const p = k / n; put(i0 + k, fl(rnd() * 2 - 1, 5000 * Math.pow(1 - p, 2) + 150, 0.5).bp * (1 - p) * Math.min(1, p * 40) * gain, Math.cos(p * 4) * 0.5, 0.4); }
}

// ---- soạn ----
const at = (bar, beat) => bar * BAR + (beat || 0) * BEAT;
const nB = Math.round(C.build / BAR), nM = Math.round(C.mid / BAR), nH = Math.round(C.hit / BAR), nL = Math.floor(C.logo / BAR);
const PB = [[50, 53, 57], [46, 50, 53], [45, 48, 53], [48, 52, 55]];   // Dm Bb F C
const RB = [38, 34, 41, 36];
const PH = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];   // Dm Bb Gm A
const RH = [38, 34, 31, 33];
// chủ đề: [nốt, phách bắt đầu, số phách] cho 4 ô nhịp
const THEME_B = [[[62, 0, 3], [64, 3, 1]], [[65, 0, 2], [62, 2, 2]], [[60, 0, 3], [57, 3, 1]], [[64, 0, 4]]];
const THEME_H = [[[62, 0, 3], [64, 3, 1]], [[65, 0, 2], [69, 2, 2]], [[67, 0, 2], [65, 2, 1], [62, 3, 1]], [[61, 0, 4]]];
const OST = [0, 0, 12, 0, 3, 0, 10, 0, 0, 0, 7, 0, 5, 0, 3, 2];
const SPIC = [0, 7, 12, 7, 15, 12, 7, 12];   // dây nảy cao móc đơn

// 1. MỞ MÀN
braam(0.12, 2.6, 0.9, 26);
sine(0.2, C.build, hz(26), { gain: 0.22, att: 1.5, rel: 0.4, send: 0.1 });
saw(0.4, C.build - 0.4, hz(50), { gain: 0.05, att: 1.5, rel: 0.3, cut: 900, detune: [-8, 0, 8], vib: 0.012, vibD: 0.01, send: 0.5, spread: 0.5 });   // dây run
for (let t = BEAT * 2; t < C.build - 0.05; t += BEAT / 2) hat(t, 0.08 + 0.12 * t / C.build, (t / BEAT) % 1 ? 0.3 : -0.3);
for (let b = 1; b < nB; b++) ens(at(b), 0.55, 0);
for (let t = C.build - BEAT; t < C.build - 0.02; t += BEAT / 4) snare(t, 0.1 + 0.25 * (1 - (C.build - t) / BEAT), (rnd() - 0.5) * 0.5);
swell(C.build, 1.6, 0.4);

// 2+3. DỒN
const pre = BEAT * 0.25;
for (let b = nB; b < nH; b++) {
  const k = (b - nB) % 4, p = (b - nB) / Math.max(1, nH - nB), t0 = at(b), part2 = b >= nM;
  const root = RB[k];
  // ostinato dây trầm (bus nén nhịp)
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * BEAT / 4; if (t > C.hit - pre) break;
    saw(t, BEAT / 4 * 0.7, hz(root + OST[s]), { gain: 0.15 + 0.05 * p, att: 0.003, rel: 0.04, cutA: 2600 + 1400 * p, cut: 700 + 900 * p, cutT: 0.05, q: 1.0, detune: [-6, 6], send: 0.1, pan: s % 2 ? 0.3 : -0.3, pump: true });
    if (s % 2 === 0) sine(t, BEAT / 4 * 0.8, hz(root - 12), { gain: 0.16, att: 0.003, rel: 0.04, send: 0 });
  }
  // dây nảy cao (từ ô 2 của dồn)
  if (b >= nB + 2) for (let s = 0; s < 8; s++) {
    const t = t0 + s * BEAT / 2; if (t > C.hit - pre) break;
    saw(t, 0.08, hz(root + 24 + SPIC[s]), { gain: 0.045 + 0.03 * p, att: 0.002, rel: 0.06, cutA: 5000, cut: 1800, cutT: 0.06, detune: [-7, 7], send: 0.3, spread: 0.7, pump: true });
  }
  // hợp xướng nền "oh" + pad
  const pd = Math.min(BAR, C.hit - pre - t0);
  for (const m of PB[k]) choir(t0, pd, m - (part2 ? 0 : 12), { gain: 0.05 + 0.05 * p, att: 0.4, rel: 0.4, vowel: 'oh', pan: (m % 3 - 1) * 0.5 });
  // chủ đề kèn đồng (phần 2)
  if (part2) for (const [m, s0, len] of THEME_B[k]) {
    const t = t0 + s0 * BEAT; if (t > C.hit - pre) continue;
    const d = Math.min(len * BEAT - 0.06, C.hit - pre - t);
    saw(t, d, hz(m - 12), { gain: 0.085, att: 0.05, rel: 0.25, cutA: 400, cut: 1900, cutT: 0.14, cutEnd: 1400, q: 0.7, detune: [-7, 0, 6], scoop: 40, drive: 0.8, vib: 0.006, vibD: 0.5, send: 0.45, spread: 0.4 });
    saw(t, d, hz(m), { gain: 0.04, att: 0.08, rel: 0.3, cut: 2600, detune: [-9, 0, 9], vib: 0.005, send: 0.55, spread: 0.6 });
  }
  // trống
  const pat = !part2 ? (p < 0.2 ? [0, 2] : [0, 1.5, 2, 3]) : [0, 0.75, 1.5, 2, 2.75, 3.5];
  for (const h of pat) { const t = t0 + h * BEAT; if (t < C.hit - pre) ens(t, 0.55 + 0.3 * p, (h % 2 ? 0.2 : -0.2)); }
  if (part2) for (const h of [1, 3]) { const t = t0 + h * BEAT; if (t < C.hit - pre) snare(t, 0.38, 0.1); }
  for (let h = 0; h < 8; h++) { const t = t0 + h * BEAT / 2; if (t < C.hit - pre) hat(t, part2 ? 0.16 : 0.1, h % 2 ? 0.35 : -0.35); }
  if (part2 && k === 3 && b < nH - 2) for (const [h, f] of [[3, 160], [3.25, 130], [3.5, 110], [3.75, 90]]) tom(t0 + h * BEAT, 0.45, (f - 125) / 80, f);
}
braam(at(nM), 2.4, 0.8, 26);                 // vào phần 2
for (const x of C.extra || []) { boom(x, 0.6); whoosh(x + 0.05, 1.4, 0.25); }
// 2 ô cuối: cuộn trống + toms + âm dâng
for (let t = C.hit - BAR * 2; t < C.hit - pre; t += BEAT / 4) {
  const q = 1 - (C.hit - t) / (BAR * 2);
  snare(t, 0.12 + 0.45 * q, (rnd() - 0.5) * 0.6);
  if (q > 0.5 && ((t - C.hit) / BEAT * 4) % 2 < 0.5) tom(t, 0.3 + 0.3 * q, (rnd() - 0.5) * 0.8, 90 + 70 * q);
}
riser(C.hit - pre, BAR * 2, 0.6);

// 4. CAO TRÀO
boom(C.hit, 1.0); ens(C.hit, 1.0, 0); crash(C.hit, 0.9); anvil(C.hit, 0.5, 0); braam(C.hit, 2.2, 1.0, 26); whoosh(C.hit + 0.1, 2.2, 0.3);
const gap = BEAT * 0.5;
for (let b = nH; b <= nL; b++) {
  const k = (b - nH) % 4, t0 = at(b), endB = Math.min(t0 + BAR, C.logo - gap), p = (b - nH) / Math.max(1, nL - nH);
  if (endB <= t0) break;
  const root = RH[k], last = b === nL - 1 || t0 + BAR > C.logo - gap - 0.01;
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * BEAT / 4; if (t >= endB) break;
    const m = root + OST[s];
    saw(t, BEAT / 4 * 0.7, hz(m), { gain: 0.15, att: 0.003, rel: 0.04, cutA: 3800, cut: 1500, cutT: 0.05, q: 1.0, detune: [-6, 6], send: 0.1, pan: -0.35, pump: true });
    saw(t, BEAT / 4 * 0.7, hz(m + 12), { gain: 0.08, att: 0.003, rel: 0.04, cutA: 4500, cut: 2200, cutT: 0.05, detune: [-5, 5], send: 0.12, pan: 0.35, pump: true });
    if (s % 2 === 0) sine(t, BEAT / 4 * 0.8, hz(root - 12), { gain: 0.2, att: 0.003, rel: 0.04, send: 0 });
    saw(t, 0.07, hz(root + 24 + SPIC[s % 8]), { gain: 0.05, att: 0.002, rel: 0.05, cutA: 6000, cut: 2200, cutT: 0.05, detune: [-7, 7], send: 0.3, spread: 0.7, pump: true });
  }
  // chủ đề: kèn đồng chồng quãng tám + hợp xướng "ah"
  for (const [m, s0, len] of THEME_H[k]) {
    const t = t0 + s0 * BEAT; if (t >= endB) continue;
    const d = Math.min(len * BEAT - 0.05, endB - t);
    saw(t, d, hz(m - 12), { gain: 0.1, att: 0.04, rel: 0.25, cutA: 500, cut: 2400, cutT: 0.12, cutEnd: 1700, q: 0.7, detune: [-7, 0, 6], scoop: 40, drive: 1.0, vib: 0.006, vibD: 0.4, send: 0.45, spread: 0.4 });
    saw(t, d, hz(m - 24), { gain: 0.07, att: 0.04, rel: 0.25, cutA: 300, cut: 1200, cutT: 0.12, detune: [-6, 6], drive: 1.0, send: 0.35, spread: 0.3 });
    choir(t, d, m, { gain: 0.11, att: 0.12, rel: 0.35 });
    choir(t, d, m + 12, { gain: 0.05, att: 0.15, rel: 0.35 });
  }
  for (const m of PH[k]) choir(t0, endB - t0, m - 12, { gain: 0.07, att: 0.2, rel: 0.3, vowel: 'oh', pan: (m % 3 - 1) * 0.5 });
  // trống trận nhân đôi
  const pat = last ? [0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75] : [0, 0.5, 0.75, 1.5, 2, 2.5, 2.75, 3.5];
  for (const h of pat) { const t = t0 + h * BEAT; if (t < endB) ens(t, 0.7 + 0.2 * p, (h * 2) % 2 ? 0.25 : -0.25); }
  for (const h of [1, 3]) { const t = t0 + h * BEAT; if (t < endB) { snare(t, 0.5, 0.1); anvil(t, 0.18, 0.4); } }
  for (let h = 0; h < 16; h++) { const t = t0 + h * BEAT / 4; if (t < endB) hat(t, h % 2 ? 0.08 : 0.15, h % 2 ? 0.35 : -0.35); }
  if (k === 0 && b > nH) { braam(t0, 1.6, 0.6, 26); crash(t0, 0.5); }
  if (last) { for (let t = t0 + BAR / 2; t < endB; t += BEAT / 4) snare(t, 0.2 + 0.4 * (t - t0) / BAR, (rnd() - 0.5) * 0.6); }
}
riser(C.logo - gap, BAR * 1.5, 0.55);

// 5. LOGO
boom(C.logo, 1.1); ens(C.logo, 1.0, 0); crash(C.logo, 0.8); braam(C.logo, 2.8, 1.0, 26);
const tail = C.end - C.logo - 0.3;
for (const m of [38, 45, 50, 53, 57, 62]) saw(C.logo, tail * 0.5, hz(m), { gain: m < 45 ? 0.06 : 0.04, att: 0.06, rel: tail * 0.5, cutA: 600, cut: 1800, cutT: 0.3, cutEnd: 400, detune: [-9, 0, 9], vib: 0.004, send: 0.6, spread: 0.5 });
for (const m of [62, 65, 69]) choir(C.logo, tail * 0.5, m, { gain: 0.08, att: 0.2, rel: tail * 0.5 });
taiko(C.logo + BAR, 0.5, 0); taiko(C.logo + BAR * 2, 0.35, 0);

// ---- trộn: bus nén nhịp + vang ----
for (let i = 0; i < N; i++) { L[i] += PL[i] * DUCK[i]; R[i] += PR[i] * DUCK[i]; }
function reverb(inp, out, spread) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ b: new Float32Array(d + spread), i: 0, f: 0 }));
  const aps = [556, 441, 341].map(d => ({ b: new Float32Array(d + spread), i: 0 }));
  const fb = 0.87, damp = 0.32;
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.1; let y = 0;
    for (const c of combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * fb; c.i = (c.i + 1) % c.b.length; y += o; }
    for (const a of aps) { const o = a.b[a.i]; const v = -y + o; a.b[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.b.length; y = v; }
    out[n] += y;
  }
}
reverb(VL, L, 0); reverb(VR, R, 23);
// lặng ngắn ngay trước ẦM logo
for (let n = Math.floor((C.logo - gap * 0.6) * SR); n < Math.floor(C.logo * SR) && n < N; n++) { L[n] *= 0.05; R[n] *= 0.05; }
const fo = Math.floor(1.4 * SR);
for (let k = 0; k < fo; k++) { const g = k / fo; L[N - 1 - k] *= g; R[N - 1 - k] *= g; }

// ---- master: nén mềm (RMS chậm) + giới hạn tanh, WAV 16-bit ----
let pk = 1e-9;
for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n]));
let env = 0;
const att = 1 - Math.exp(-1 / (0.005 * SR)), relc = 1 - Math.exp(-1 / (0.25 * SR));
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const k0 = 1.4 / pk;
for (let n = 0, o = 44; n < N; n++, o += 4) {
  const l = L[n] * k0, r = R[n] * k0, lv = Math.max(Math.abs(l), Math.abs(r));
  env += (lv > env ? att : relc) * (lv - env);
  const gr = env > 0.5 ? Math.pow(0.5 / env, 0.5) : 1;   // nén 2:1 trên ngưỡng
  buf.writeInt16LE(Math.round(clamp(Math.tanh(l * gr * 1.15) * 0.95 * 32767, -32768, 32767)), o);
  buf.writeInt16LE(Math.round(clamp(Math.tanh(r * gr * 1.15) * 0.95 * 32767, -32768, 32767)), o + 2);
}
fs.writeFileSync(OUT, buf);
console.log('[SCORE2] ' + C.bpm + ' BPM · build ' + C.build + ' · mid ' + C.mid.toFixed(2) + ' · hit ' + C.hit + ' · logo ' + C.logo + ' ->', OUT);
