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
// v8d: pháo bắn vào nhà (bám đạn + góc rộng), UAV cảm tử bay thuận nắng bám liền tới lúc nổ, UAV thứ hai máy tĩnh
const D = ev('v8/v8d.events.json'), dSide = scene(D, 'arty-shellside'), dHit = (D.find(e => e.type === 'shellhit') || { s: dSide + 0.9 }).s;
const dWide = scene(D, 'house-wide'), dKc = scene(D, 'kami-chase'), dKf = scene(D, 'kami-fixed');
const dEnd = D.filter(e => e.type === 'stage' && e.what === 'kamiEnd').map(e => e.s);
const sKc = scene(A, 'kami-chase'), sKf = scene(A, 'kami-fixed');
const kEnd = A.filter(e => e.type === 'stage' && e.what === 'kamiEnd').map(e => e.s);
const N3 = ev('v7/nuke3.events.json'), dead3 = (N3.find(e => e.type === 'stage' && e.what === 'baseDead') || { s: 31.4 }).s;
console.log('scout', sScout.toFixed(1), '· v8c fire', fireC.toFixed(1), 'side', sSide.toFixed(1), 'hit', hitC.toFixed(1), '· wide', sWide.toFixed(1), 'hit', hitW.toFixed(1), '· kami', sKc.toFixed(1), sKf.toFixed(1), 'end', kEnd.map(s => s.toFixed(1)).join('/'), 'air', sAir.toFixed(1));

const clips = [], titles = [], fx = [];
let t = 0;
const add = (c) => { clips.push(c); t += (c.black || c.dur) - (c.x || 0); return t; };
const black = (d, o) => add(Object.assign({ black: d }, o || {}));
const DAY = 'day';
// chữ: một mạch cảm xúc, không nói tính năng — yên ắng -> phát súng đầu tiên -> dấu vết -> không khoan nhượng -> kẻ đứng vững -> lời mời
const line = (main, at, d, sub, kind) => titles.push({ at, dur: d, fadeIn: 0.35, fadeOut: 0.4, card: Object.assign({ kind: kind || 'cine', main }, sub ? { sub } : {}) });

// ===== HỒI 1 — CHIẾN TRƯỜNG (0–8.889): flycam qua các căn cứ (bỏ cảnh rừng cỏ nhập nhằng -> căn cứ tên lửa nắng chiều)
black(0.25);
line('CHIẾN TRƯỜNG CHÂN THỰC', 0.6, 3.9, 'TỪ SA MẠC, SÔNG HỒ ĐẾN ĐÔ THỊ');
add({ src: 'final/live_river.mp4', in: 0.3, dur: 2.7, fadeIn: 0.7, grade: DAY });
add({ src: 'final/live_desert2.mp4', in: 0.2, dur: 2.1, mute: true, grade: DAY });
add({ src: 'v7/nuke2.mp4', in: 0.6, dur: 2.0, grade: DAY, sfx: 0.5 });
add({ src: 'v8/pp.mp4', in: 6.0, dur: 8.889 - t, grade: DAY, sfx: 0.5 });                          // nhà máy điện nhiệt hạch: mặt trước nhà lò, thấy buồng Tokamak

// ===== HỒI 2 — CHÂN THỰC (8.889–26.667)
line('CẦM LÁI CỖ MÁY CỦA BẠN', 9.2, 5.1, 'XE TĂNG · PHÁO TỰ HÀNH · XE 6 NÒNG · TRINH SÁT', 'low');
add({ src: 'final/show_urban.mp4', in: 1.7, dur: 1.4, grade: DAY });                              // xe tăng chủ lực
add({ src: 'final/show_urban.mp4', in: 5.5, dur: 1.3, grade: DAY });
add({ src: 'final/show_urban.mp4', in: 9.3, dur: 1.3, grade: DAY });
add({ src: 'v8/v8a.mp4', in: sScout + 0.15, dur: 1.7, grade: DAY });                                // xe trinh sát (không lưới lá), nắng
// pháo tự hành: khai hỏa -> bám viên đạn -> nổ giữa cụm xe địch
// cắt ngay trước khung lửa đầu nòng (ánh lửa nhuộm vàng cả mặt đất 1-2 khung) -> tiếng nổ nòng đặt bằng lớp âm
add({ src: 'v8/v8c.mp4', in: fireC - 1.0, dur: 0.98, grade: DAY });
fx.push({ file: 'v8/v8c.mp4', at: t - 0.04, in: fireC - 0.02, dur: 0.8, gain: 1.0 });
line('MỖI PHÁT BẮN ĐỀU CÓ SỨC NẶNG', t + 0.3, 3.4, '', 'low');
add({ src: 'v8/v8d.mp4', in: dSide + 0.05, dur: dHit - dSide + 2.0, grade: DAY });               // viên đạn bay qua trời -> nổ sát nhà, kính vỡ
add({ src: 'v8/v8d.mp4', in: dWide + 2.0, dur: 2.4, grade: DAY });                                 // góc rộng: loạt đạn nổ trước nhà
add({ src: 'final/duels_desert.mp4', in: 1.4, dur: 2.0, grade: DAY, audio: { src: 'final/stage_hl.mp4', in: 1.2 } });  // xuyên giáp, cháy
line('TỪ MẶT ĐẤT ĐẾN BẦU TRỜI', t + 0.2, 26.667 - t - 0.3, 'PHÒNG KHÔNG · UAV CẢM TỬ', 'low');
add({ src: 'v7/povG.mp4', in: 13.6, dur: 1.5, grade: DAY });                                         // phòng không bắn rơi drone
// UAV cảm tử lao vào xe: chạm nổ đúng cú "ẦM" của nhạc
// UAV bay thuận nắng, bám liền một hơi: chạm nổ đúng cú "ẦM" rồi đi tiếp qua cú nổ (không cắt giữa chừng)
const kHit = dEnd[0] || dKc + 10;
const kPre = 26.667 - t;
add({ src: 'v8/v8d.mp4', in: kHit - kPre, dur: kPre + 1.5, grade: DAY });


// ===== HỒI 3 — KHÔNG KHOAN NHƯỢNG (26.667–~47)

line('MỌI THỨ ĐỀU CÓ THỂ BỊ PHÁ HUỶ', t + 0.3, 2.6);
add({ src: 'final/stage_hl.mp4', in: 44.6, dur: 2.6, grade: DAY });                                // nhà trúng pháo sập
add({ src: 'v7/nuke2.mp4', in: 39.7, dur: 2.3, grade: DAY });                                      // mưa đạn chùm quanh căn cứ
line('10 ĐẤU 10 — KHÔNG KHOAN NHƯỢNG', t + 0.15, 2.2);
add({ src: 'final/duels_desert.mp4', in: 4.6, dur: 2.0, grade: DAY, audio: { src: 'final/stage_hl.mp4', in: 4 } });
add({ src: 'final/live_urban.mp4', in: 34.2, dur: 1.6, grade: DAY });                              // giao tranh giữa phố
add({ src: 'v8/v8d.mp4', in: (dEnd[1] || dKf + 12) - 1.2, dur: 2.4, grade: DAY });                // UAV cảm tử thứ hai: máy tĩnh
add({ src: 'final/live_urban.mp4', in: 69.6, dur: 1.5, grade: DAY });                              // 6 nòng xả đạn
add({ src: 'final/duels_hl.mp4', in: 24.6, dur: 1.4, grade: DAY });                                // kho đạn trên xe nổ
add({ src: 'v7/nuke3.mp4', in: dead3 - 0.7, dur: 2.7, grade: DAY });                               // căn cứ nổ dây chuyền
line('CHỈ KẺ MẠNH NHẤT CÒN ĐỨNG VỮNG', t + 0.3, 49.66 - t - 1.45);         // trên cảnh căn cứ sụp
add({ src: 'v7/nuke2.mp4', in: 56.3, dur: 49.66 - t - 0.9, grade: DAY, fadeOut: 0.4 });            // căn cứ sụp thành khung cháy
const cut = t;
black(49.66 - t);

// ===== KẾT: logo trên flycam cứ điểm (cờ vẫy chậm)
add({ src: 'v8/v8b_660.mp4', in: sAir + 0.6, dur: 5.6, fadeIn: 0.9, fadeOut: 1.4, grade: DAY, push: 0.03, sfx: 0.5 });

titles.push({ at: 50.0, dur: 5.1, fadeIn: 0.9, fadeOut: 1.2, push: 0.03, card: { kind: 'logo', main: 'Chiến Địa Pháo Kích 3D', en: 'TACTICAL SPG COMMAND', tag: 'TRẬN CHIẾN ĐANG CHỜ BẠN', url: 'TANKWAR.ONLINE · CHƠI NGAY TRÊN TRÌNH DUYỆT' } });

const E = {
  base: '.', out: 'trailer_v11.mp4', music: 'raw/score_v11.wav', musicIn: 0, musicGain: 0.95, sfxGain: 1.0, vignette: 10,
  musicDips: [],
  clips, titles, fx
};
fs.writeFileSync('edl_v11.json', JSON.stringify(E, null, 1));
console.log('tổng', t.toFixed(2), 's · đoạn', clips.length, '· chữ', titles.length, '· cắt', cut.toFixed(2));
