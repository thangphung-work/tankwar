// Dựng EDL trailer v8 = V1 chuốt lại: chỉ nói về độ chân thực (bỏ liệt kê tính năng), ít chữ, cảnh lỗi thay bằng cảnh quay bù
// (v8/v8a: xe trinh sát không ngụy trang, bám đường đạn pháo -> nổ có sóng xung kích, UAV cảm tử lao vào xe, flycam cứ điểm).
const fs = require('fs');
const X = 'sfx/';
const ev = (f) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j.log.map(e => Object.assign({ s: e.v / j.fps }, e)); };
const scene = (log, name) => { const e = log.find(e => e.type === 'stage' && e.what === 'scene' && e.name === name); if (!e) throw new Error('thiếu cảnh ' + name); return e.s; };
const A = ev('v8/v8a.events.json');
const sScout = scene(A, 'scout-drive');
// pháo: v8c (cự ly 2,4 km, máy bay song song viên đạn), góc rộng lấy từ v8b_660 (bụi sóng xung kích bung trên xe)
const C = ev('v8/v8c.events.json'), fireC = (C.find(e => e.type === 'stage' && e.what === 'shell') || { s: 1.9 }).s;
const sSide = scene(C, 'arty-shellside'), hitC = (C.find(e => e.type === 'shellhit') || { s: 3.0 }).s;
const W = ev('v8/v8b_660.events.json'), sWide = scene(W, 'arty-impact-wide'), hitW = (W.find(e => e.type === 'stage' && e.what === 'impact2') || { s: sWide + 1.1 }).s;
const sAir = scene(W, 'stronghold-aerial');
const sKc = scene(A, 'kami-chase'), sKf = scene(A, 'kami-fixed');
const kEnd = A.filter(e => e.type === 'stage' && e.what === 'kamiEnd').map(e => e.s);
const N3 = ev('v7/nuke3.events.json'), dead3 = (N3.find(e => e.type === 'stage' && e.what === 'baseDead') || { s: 31.4 }).s;
console.log('scout', sScout.toFixed(1), '· v8c fire', fireC.toFixed(1), 'side', sSide.toFixed(1), 'hit', hitC.toFixed(1), '· wide', sWide.toFixed(1), 'hit', hitW.toFixed(1), '· kami', sKc.toFixed(1), sKf.toFixed(1), 'end', kEnd.map(s => s.toFixed(1)).join('/'), 'air', sAir.toFixed(1));

const clips = [], titles = [], fx = [];
let t = 0;
const add = (c) => { clips.push(c); t += (c.black || c.dur) - (c.x || 0); return t; };
const black = (d, o) => add(Object.assign({ black: d }, o || {}));
const DAY = 'day';
const line = (main, d, kicker) => titles.push({ at: t + 0.2, dur: d, fadeIn: 0.3, fadeOut: 0.35, card: Object.assign({ kind: 'cine', main }, kicker ? { kicker } : {}) });

// ===== HỒI 1 — CHIẾN TRƯỜNG (0–8.889): flycam qua các căn cứ (bỏ cảnh rừng cỏ nhập nhằng -> căn cứ tên lửa nắng chiều)
black(0.25);
line('CHIẾN TRƯỜNG THẬT', 3.6);
add({ src: 'final/live_river.mp4', in: 0.3, dur: 2.7, fadeIn: 0.7, grade: DAY });
add({ src: 'final/live_desert2.mp4', in: 0.2, dur: 2.1, mute: true, grade: DAY });
add({ src: 'v7/nuke2.mp4', in: 0.6, dur: 2.0, grade: DAY, sfx: 0.5 });
add({ src: 'final/live_urban.mp4', in: 0.3, dur: 8.889 - t, grade: DAY });

// ===== HỒI 2 — CHÂN THỰC (8.889–26.667)
add({ src: 'final/show_urban.mp4', in: 1.7, dur: 1.4, grade: DAY });                              // xe tăng chủ lực
add({ src: 'final/show_urban.mp4', in: 5.5, dur: 1.3, grade: DAY });
add({ src: 'final/show_urban.mp4', in: 9.3, dur: 1.3, grade: DAY });
add({ src: 'v8/v8a.mp4', in: sScout + 0.15, dur: 1.7, grade: DAY });                                // xe trinh sát (không lưới lá), nắng
// pháo tự hành: khai hỏa -> bám viên đạn -> nổ giữa cụm xe địch
line('ĐƯỜNG ĐẠN THẬT', 2.6);
// cắt ngay trước khung lửa đầu nòng (ánh lửa nhuộm vàng cả mặt đất 1-2 khung) -> tiếng nổ nòng đặt bằng lớp âm
add({ src: 'v8/v8c.mp4', in: fireC - 1.0, dur: 0.98, grade: DAY });
fx.push({ file: 'v8/v8c.mp4', at: t - 0.04, in: fireC - 0.02, dur: 0.8, gain: 1.0 });
add({ src: 'v8/v8c.mp4', in: sSide + 0.05, dur: hitC - sSide + 2.4, grade: DAY });              // bay theo viên đạn -> nổ, cột bụi sóng xung kích
add({ src: 'v8/v8b_660.mp4', in: hitW - 0.5, dur: 2.0, grade: DAY });                              // góc rộng: đạn rơi trúng xe, bụi bung
add({ src: 'final/duels_desert.mp4', in: 1.4, dur: 3.0, grade: DAY, audio: { src: 'final/stage_hl.mp4', in: 1.2 } });  // xuyên giáp, cháy
// UAV cảm tử lao vào xe: chạm nổ đúng cú "ẦM" của nhạc
const kHit = kEnd[0] || sKc + 8;
// bám sau UAV (cắt trước dải sáng mờ lúc chúc xuống) -> cú nổ trên nóc xe khớp "ẦM"
const kDur = 26.667 - t;
add({ src: 'v8/v8a.mp4', in: kHit - 0.85 - kDur, dur: kDur, grade: DAY });
fx.push({ file: X + 'riser.wav', at: 26.667 - 2.6, gain: 0.45 });

// ===== HỒI 3 — KHÔNG KHOAN NHƯỢNG (26.667–~47)
fx.push({ file: X + 'braam.wav', at: 26.667, gain: 0.9 });
add({ src: 'v8/v8a.mp4', in: kHit - 0.06, dur: 1.6, grade: DAY });                                 // UAV cảm tử nổ trên nóc xe
add({ src: 'final/stage_hl.mp4', in: 44.6, dur: 2.6, grade: DAY });                                // nhà trúng pháo sập
add({ src: 'v7/nuke2.mp4', in: 39.7, dur: 2.3, grade: DAY });                                      // mưa đạn chùm quanh căn cứ
line('KHÔNG KHOAN NHƯỢNG', 2.0);
add({ src: 'final/duels_desert.mp4', in: 4.6, dur: 2.0, grade: DAY, audio: { src: 'final/stage_hl.mp4', in: 4 } });
add({ src: 'final/live_urban.mp4', in: 34.2, dur: 1.6, grade: DAY });                              // giao tranh giữa phố
add({ src: 'v8/v8a.mp4', in: (kEnd[1] || sKf + 8) - 1.3, dur: 2.4, grade: DAY });                  // UAV cảm tử thứ hai: máy tĩnh
add({ src: 'final/live_urban.mp4', in: 69.6, dur: 1.5, grade: DAY });                              // 6 nòng xả đạn
add({ src: 'final/duels_hl.mp4', in: 24.6, dur: 1.4, grade: DAY });                                // kho đạn trên xe nổ
add({ src: 'v7/nuke3.mp4', in: dead3 - 0.7, dur: 2.7, grade: DAY });                               // căn cứ nổ dây chuyền
add({ src: 'v7/nuke2.mp4', in: 56.3, dur: 49.66 - t - 0.9, grade: DAY, fadeOut: 0.4 });            // căn cứ sụp thành khung cháy
const cut = t;
black(49.66 - t);

// ===== KẾT: logo trên flycam cứ điểm (cờ vẫy chậm)
add({ src: 'v8/v8b_660.mp4', in: sAir + 0.6, dur: 5.6, fadeIn: 0.9, fadeOut: 1.4, grade: DAY, push: 0.03, sfx: 0.5 });
fx.push({ file: X + 'braam.wav', at: 49.7, gain: 0.7 });
titles.push({ at: 50.0, dur: 5.1, fadeIn: 0.9, fadeOut: 1.2, push: 0.03, card: { kind: 'logo', main: 'Chiến Địa Pháo Kích 3D', en: 'TACTICAL SPG COMMAND', tag: 'CHƠI NGAY TRÊN TRÌNH DUYỆT', url: 'TANKWAR.ONLINE' } });

const E = {
  base: '.', out: 'trailer_v8.mp4', music: 'raw/music2.wav', musicIn: 8.889, musicGain: 0.8, sfxGain: 1.0, vignette: 10,
  musicDips: [{ at: cut, dur: 49.66 - cut, to: 0.15 }],
  clips, titles, fx
};
fs.writeFileSync('edl_v8.json', JSON.stringify(E, null, 1));
console.log('tổng', t.toFixed(2), 's · đoạn', clips.length, '· chữ', titles.length, '· cắt', cut.toFixed(2));
