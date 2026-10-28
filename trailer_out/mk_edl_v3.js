// Dựng EDL trailer v5 (kịch bản "ngăn chặn thảm hoạ hạt nhân")
const fs = require('fs');
const R = 'H:/tankwar/assets/sfx/radio/';
const X = 'sfx/';
const clips = [], titles = [], fx = [];
let t = 0;
const add = (c) => { clips.push(c); t += (c.black || c.dur) - (c.x || 0); return t; };
const black = (d, o) => add(Object.assign({ black: d }, o || {}));

// ===== HỒI 1 — BÁO ĐỘNG (0–8.889): lạnh, mưa bão, Geiger, còi
const COLD = 'cold';
black(0.3);
add({ src: 'v5/base2.mp4', in: 0.0, dur: 3.4, fadeIn: 0.7, grade: COLD });
add({ src: 'v5/base2.mp4', in: 3.6, dur: 2.6, x: 0.5, grade: COLD });
add({ src: 'v5/base2.mp4', in: 7.0, dur: 1.6, x: 0.4, grade: COLD });
add({ src: 'v5/base2.mp4', in: 19.4, dur: 8.889 - t, grade: COLD });
titles.push({ at: 0.45, dur: 5.1, type: 24, fadeIn: 0.05, fadeOut: 0.35, card: { kind: 'slug', alert: true, lines: ['⚠ PHÁT HIỆN KÍCH HOẠT ĐẦU ĐẠN HẠT NHÂN', 'CĂN CỨ TÊN LỬA — ĐÃ RƠI VÀO TAY ĐỊCH'] } });
titles.push({ at: 5.8, dur: 3.0, type: 26, fadeIn: 0.05, fadeOut: 0.2, card: { kind: 'slug', lines: ['NHIỆM VỤ: NGĂN CHẶN — BẰNG MỌI GIÁ'] } });
[['T-00:05:00', 6.0], ['T-00:04:59', 7.0], ['T-00:04:58', 8.0]].forEach(([m, a], i) => titles.push({ at: a, dur: i === 2 ? 0.85 : 1.0, fadeIn: i ? 0 : 0.1, fadeOut: i === 2 ? 0.1 : 0, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: m } }));
fx.push({ file: X + 'geiger.wav', at: 0.0, gain: 0.45, dur: 8.8 });
fx.push({ file: X + 'siren.wav', at: 3.2, gain: 0.32, dur: 5.6 });
[6.0, 7.0, 8.0].forEach(a => fx.push({ file: X + 'tick.wav', at: a, gain: 0.55 }));
fx.push({ file: X + 'static.wav', at: 7.05, gain: 0.35 });
fx.push({ file: R + 'spotted.wav', at: 7.25, gain: 0.85 });

// ===== HỒI 2 — TẤN CÔNG (8.889–26.667)
add({ src: 'final/show_urban.mp4', in: 26.4, dur: 1.8, flash: 0.15, grade: COLD });          // pháo tự hành khai hỏa
titles.push({ at: 8.95, dur: 1.5, slam: 0.32, fadeIn: 0.02, fadeOut: 0.25, card: { kind: 'slam', main: 'Khai hỏa!' } });
fx.push({ file: X + 'braam.wav', at: 8.889, gain: 0.85 });
add({ src: 'v5/base2.mp4', in: 24.0, dur: 2.0 });                                              // pháo kích dội xuống căn cứ
add({ src: 'v5/forest.mp4', in: 4.0, dur: 2.4 });                                              // cụm rừng bốc cháy (drone)
add({ src: 'v5/forest.mp4', in: 17.0, dur: 1.6 });                                             // cột lửa giữa mưa (mặt đất)
fx.push({ file: X + 'whoosh.wav', at: 16.4, gain: 0.5 });
add({ src: 'final/pov_tank.mp4', in: 1.4, dur: 2.2 });                                         // qua kính ngắm: trúng
fx.push({ file: X + 'static.wav', at: 16.75, gain: 0.3 });
fx.push({ file: R + 'focus.wav', at: 16.95, gain: 0.8 });
add({ src: 'v5/battle.mp4', in: 0.6, dur: 2.0 });                                              // hai hàng xe đấu pháo
titles.push({ at: 19.3, dur: 1.0, fadeIn: 0.05, fadeOut: 0.15, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: 'T-00:01:47' } });
fx.push({ file: X + 'tick.wav', at: 19.3, gain: 0.55 });
add({ src: 'final/stage_hl.mp4', in: 44.8, dur: 2.2, grade: COLD });                           // nhà trúng pháo kích sập
add({ src: 'v5/forest.mp4', in: 8.5, dur: 1.4 });                                              // rừng cháy, khói cuộn (drone)
fx.push({ file: X + 'static.wav', at: 23.0, gain: 0.3 });
fx.push({ file: R + 'backup.wav', at: 23.2, gain: 0.85 });
black(26.667 - t - 0.978);                                                                      // màn đen: thời gian đang cạn
titles.push({ at: 24.55, dur: 1.1, slam: 0.25, fadeIn: 0.02, fadeOut: 0.15, card: { kind: 'slam', main: 'Thời gian đang cạn' } });
fx.push({ file: X + 'heartbeat.wav', at: 24.5, gain: 0.9 });
fx.push({ file: X + 'heartbeat.wav', at: 25.3, gain: 0.9 });
fx.push({ file: X + 'riser.wav', at: 26.667 - 2.6, gain: 0.55 });
add({ src: 'final/pov_kami.mp4', in: 22.02, dur: 0.978, grade: 'hot' });                       // UAV cảm tử lao xuống

// ===== HỒI 3 — ĐỊA NGỤC (26.667–44.444): nóng, chớp ở cú nổ
const HOT = 'hot';
fx.push({ file: X + 'braam.wav', at: 26.667, gain: 0.95 });
add({ src: 'v5/base2.mp4', in: 28.0, dur: 1.8, flash: 0.35, ca: 0.3, grade: HOT });            // căn cứ trúng pháo (drone)
add({ src: 'v5/battle.mp4', in: 41.6, dur: 1.6, grade: HOT });                                 // xe trúng đạn bốc cháy
// Ù TAI: khói trắng trùm ống kính, tiếng nghẹt, ù tai + tim đập; rồi lửa loé trở lại
const sh0 = t;
add({ src: 'v5/battle.mp4', in: 47.2, dur: 2.3, grade: 'bleach', sfx: 0.9, lp: 450 });              // xe cháy rực, tiếng nghẹt
fx.push({ file: X + 'tinnitus.wav', at: sh0, gain: 0.5, dur: 2.5 });
fx.push({ file: X + 'heartbeat.wav', at: sh0 + 0.5, gain: 0.8 });
fx.push({ file: X + 'heartbeat.wav', at: sh0 + 1.4, gain: 0.8 });
add({ src: 'v5/battle.mp4', in: 53.2, dur: 0.8, flash: 0.2, ca: 0.25, grade: HOT });
add({ src: 'v5/forest.mp4', in: 49.3, dur: 1.4, grade: HOT });                                 // xe nổ trong hầm cứ điểm (drone)
add({ src: 'final/pov_tank.mp4', in: 6.0, dur: 1.2, grade: HOT });                              // kính ngắm: hạ gục
titles.push({ at: 35.9, dur: 0.8, fadeIn: 0, fadeOut: 0.1, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: 'T-00:00:30' } });
fx.push({ file: X + 'tick.wav', at: 35.9, gain: 0.55 });
add({ src: 'v5/forest.mp4', in: 40.0, dur: 1.3, flash: 0.15, grade: HOT });                    // lửa dưới mái hầm
add({ src: 'v5/battle.mp4', in: 20.6, dur: 1.4, grade: HOT });                                 // trúng đạn qua vai
add({ src: 'v5/battle.mp4', in: 12.0, dur: 1.0, grade: HOT });                                 // hàng xác xe cháy (ngắn, tốc độ thật)
add({ src: 'final/pov_tank.mp4', in: 9.0, dur: 1.5, grade: HOT });                              // xác xe cháy, lửa soi vũng nước
titles.push({ at: 41.0, dur: 0.8, fadeIn: 0, fadeOut: 0.1, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: 'T-00:00:10' } });
fx.push({ file: X + 'tick.wav', at: 41.0, gain: 0.6 });
add({ src: 'v5/battle.mp4', in: 100.2, dur: 1.6, grade: HOT });                                // sét + xác xe cháy
fx.push({ file: R + 'fallback.wav', at: 42.1, gain: 0.8 });
add({ src: 'v5/forest.mp4', in: 20.0, dur: 44.444 - t, grade: HOT });                          // cột lửa giữa mưa

// ===== HỒI 4 — CHỚP KẾT (44.444–~48.8): hình loé xen đen, nhanh dần; đồng hồ 03 -> 01
const strobe = [
  ['v5/base2.mp4', 5.0, 0.42, 0.16], ['v5/base2.mp4', 20.0, 0.4, 0.15], ['v5/battle.mp4', 47.8, 0.34, 0.12, 0.12],
  ['v5/forest.mp4', 18.0, 0.3, 0.1], ['final/pov_kami.mp4', 22.6, 0.28, 0.1], ['v5/battle.mp4', 1.8, 0.24, 0.08],
  ['v5/forest.mp4', 5.5, 0.2, 0.08, 0.12], ['v5/base2.mp4', 33.5, 0.18, 0.06], ['v5/battle.mp4', 53.3, 0.15, 0.06],
  ['v5/forest.mp4', 49.6, 0.14, 0.05], ['v5/battle.mp4', 2.5, 0.13, 0.05, 0.1], ['v5/forest.mp4', 21.0, 0.12, 0.05],
  ['v5/base2.mp4', 29.0, 0.12, 0.05]
];
for (const [src, a, d, gap, fl] of strobe) {
  fx.push({ file: X + 'thump.wav', at: t, gain: 0.75 });
  add({ src, in: a, dur: d, grade: HOT, flash: fl || 0, afadeIn: 0.005, afadeOut: 0.02 });
  black(gap);
}
fx.push({ file: X + 'riser.wav', at: t - 2.6 + 0.2, gain: 0.6 });
add({ src: 'v5/forest.mp4', in: 18.6, dur: 0.2, flash: 0.15, grade: HOT });                    // chớp lớn cuối
const cut = t;
[['T-00:00:03', 44.444, 1.15], ['T-00:00:02', 45.6, 1.2], ['T-00:00:01', 46.8, cut - 46.8]].forEach(([m, a, d]) => {
  titles.push({ at: a, dur: d, fadeIn: 0, fadeOut: 0, card: { kind: 'clock', lbl: '', main: m } });
  fx.push({ file: X + 'tick.wav', at: a, gain: 0.7 });
});
// màn đen tuyệt đối, im lặng tới hồi kèn kết
black(49.68 - t);
// ===== KẾT: logo trên căn cứ đổ nát cháy trong mưa
add({ src: 'v5/base2.mp4', in: 33.6, dur: 5.8, fadeIn: 1.0, fadeOut: 1.6, grade: 'dark', push: 0.05, sfx: 0.5 });
fx.push({ file: X + 'braam.wav', at: 49.7, gain: 0.7 });
titles.push({ at: 50.1, dur: 5.3, fadeIn: 1.0, fadeOut: 1.4, push: 0.04, card: { kind: 'logo', main: 'Chiến Địa Pháo Kích 3D', en: 'TACTICAL SPG COMMAND', tag: 'BẠN CÓ KỊP NGĂN CHẶN?', url: 'TANKWAR.ONLINE' } });

const E = {
  base: '.', out: 'trailer_v5.mp4', music: 'raw/music2.wav', musicIn: 8.889, musicGain: 0.8, sfxGain: 1.0,
  musicDips: [{ at: 24.45, dur: 1.25, to: 0.25 }, { at: cut + 0.02, dur: 49.66 - cut, to: 0 }, { at: sh0, dur: 2.3, to: 0.35 }],
  clips, titles, fx
};
fs.writeFileSync('edl_v5.json', JSON.stringify(E, null, 1));
console.log('tổng', t.toFixed(2), 's · đoạn', clips.length, '· chữ', titles.length, '· hiệu ứng âm', fx.length, '· cắt đen ở', cut.toFixed(2));
