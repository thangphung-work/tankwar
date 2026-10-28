// Dựng EDL trailer v6: "ngăn chặn thảm hoạ hạt nhân" — đủ vai trò (pháo binh, xe tăng, trinh sát, 6 nòng, phòng không,
// UAV trinh sát, UAV cảm tử), máy tĩnh, không rung giả, không giọt nước giả, không quay chậm (trừ ù tai)
const fs = require('fs');
const R = 'H:/tankwar/assets/sfx/radio/';
const X = 'sfx/';
const clips = [], titles = [], fx = [];
let t = 0;
const add = (c) => { clips.push(c); t += (c.black || c.dur) - (c.x || 0); return t; };
const black = (d, o) => add(Object.assign({ black: d }, o || {}));
const COLD = 'cold', HOT = 'hot';

// ===== HỒI 1 — BÁO ĐỘNG (0–8.889)
black(0.3);
add({ src: 'v6/base4.mp4', in: 0.0, dur: 3.4, fadeIn: 0.7, grade: COLD });                   // trạm gác căn cứ, máy nâng
add({ src: 'v6/base4.mp4', in: 3.6, dur: 2.4, x: 0.5, grade: COLD });                         // vượt lên bệ giếng phóng
add({ src: 'v6/pov_recon.mp4', in: 0.9, dur: 1.8, x: 0.4, grade: COLD });                     // UAV TRINH SÁT cất cánh
add({ src: 'v6/base4.mp4', in: 20.0, dur: 8.889 - t, grade: COLD });                          // xe tăng tiến vào màn mưa
titles.push({ at: 0.45, dur: 5.0, type: 24, fadeIn: 0.05, fadeOut: 0.35, card: { kind: 'slug', alert: true, lines: ['⚠ PHÁT HIỆN KÍCH HOẠT ĐẦU ĐẠN HẠT NHÂN', 'CĂN CỨ TÊN LỬA — ĐÃ RƠI VÀO TAY ĐỊCH'] } });
titles.push({ at: 5.7, dur: 3.1, type: 26, fadeIn: 0.05, fadeOut: 0.2, card: { kind: 'slug', lines: ['NHIỆM VỤ: NGĂN CHẶN — BẰNG MỌI GIÁ'] } });
[['T-00:05:00', 6.0], ['T-00:04:59', 7.0], ['T-00:04:58', 8.0]].forEach(([m, a], i) => titles.push({ at: a, dur: i === 2 ? 0.85 : 1.0, fadeIn: i ? 0 : 0.1, fadeOut: i === 2 ? 0.1 : 0, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: m } }));
fx.push({ file: X + 'geiger.wav', at: 0.0, gain: 0.45, dur: 8.8 });
fx.push({ file: X + 'siren.wav', at: 3.2, gain: 0.32, dur: 5.6 });
[6.0, 7.0, 8.0].forEach(a => fx.push({ file: X + 'tick.wav', at: a, gain: 0.55 }));
fx.push({ file: X + 'static.wav', at: 7.05, gain: 0.35 });
fx.push({ file: R + 'spotted.wav', at: 7.25, gain: 0.85 });

// ===== HỒI 2 — TRIỂN KHAI HỎA LỰC (8.889–26.667): mỗi vai trò một khoảnh khắc
add({ src: 'v6/field.mp4', in: 1.0, dur: 2.4 });                                               // PHÁO BINH hạ chân chống
const fireAt = t + 0.3;
add({ src: 'v6/field.mp4', in: 3.5, dur: 1.6 });                                               // khai hỏa
titles.push({ at: fireAt, dur: 1.4, slam: 0.32, fadeIn: 0.02, fadeOut: 0.25, card: { kind: 'slam', main: 'Khai hỏa!' } });
fx.push({ file: X + 'braam.wav', at: fireAt - 0.05, gain: 0.8 });
add({ src: 'v6/field.mp4', in: 8.0, dur: 1.8 });                                               // dàn nòng ngóc lên trời bão
add({ src: 'v6/field.mp4', in: 12.2, dur: 2.4 });                                              // chân trời bão lửa (xa)
const tankAt = t;
add({ src: 'final/pov_tank.mp4', in: 1.4, dur: 2.2 });                                         // XE TĂNG: kính ngắm, trúng
fx.push({ file: X + 'static.wav', at: tankAt - 0.2, gain: 0.3 });
fx.push({ file: R + 'focus.wav', at: tankAt, gain: 0.8 });
add({ src: 'v6/street.mp4', in: 13.4, dur: 2.6, audio: { src: 'final/show_urban.mp4', in: 31.55 } });                                             // TRINH SÁT: tên lửa chống tăng
add({ src: 'final/live_urban.mp4', in: 69.6, dur: 1.3, grade: COLD });                         // 6 NÒNG xả đạn giữa phố
const aaAt = t;
add({ src: 'v6/pov_aa.mp4', in: 17.6, dur: 1.6 });                                             // PHÒNG KHÔNG bắn rơi drone
titles.push({ at: aaAt - 1.2, dur: 1.0, fadeIn: 0.05, fadeOut: 0.15, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: 'T-00:01:47' } });
fx.push({ file: X + 'tick.wav', at: aaAt - 1.2, gain: 0.55 });
fx.push({ file: X + 'static.wav', at: aaAt - 0.1, gain: 0.3 });
fx.push({ file: R + 'backup.wav', at: aaAt + 0.1, gain: 0.85 });
const blk = t;
black(26.667 - t - 0.978);                                                                      // màn đen: thời gian đang cạn
titles.push({ at: blk + 0.05, dur: 26.667 - 0.978 - blk - 0.05, slam: 0.25, fadeIn: 0.02, fadeOut: 0.12, card: { kind: 'slam', main: 'Thời gian đang cạn' } });
fx.push({ file: X + 'heartbeat.wav', at: blk + 0.05, gain: 0.9 });
fx.push({ file: X + 'riser.wav', at: 26.667 - 2.6, gain: 0.55 });
add({ src: 'final/pov_kami.mp4', in: 22.02, dur: 0.978, grade: HOT });                          // UAV CẢM TỬ lao xuống

// ===== HỒI 3 — CAO TRÀO (26.667–44.444): ít cảnh, mỗi cảnh một ý
fx.push({ file: X + 'braam.wav', at: 26.667, gain: 0.95 });
add({ src: 'v6/field.mp4', in: 28.5, dur: 2.2, flash: 0.35, grade: HOT });                     // hai hàng xe đấu pháo (xa)
add({ src: 'v6/base4.mp4', in: 24.2, dur: 1.6, grade: HOT });                                  // pháo kích dội xuống căn cứ
const sh0 = t;                                                                                  // Ù TAI (khoảnh khắc duy nhất)
add({ src: 'v6/field.mp4', in: 33.0, dur: 2.3, grade: 'bleach', sfx: 0.9, lp: 450 });
fx.push({ file: X + 'tinnitus.wav', at: sh0, gain: 0.5, dur: 2.5 });
fx.push({ file: X + 'heartbeat.wav', at: sh0 + 0.5, gain: 0.8 });
fx.push({ file: X + 'heartbeat.wav', at: sh0 + 1.4, gain: 0.8 });
add({ src: 'final/stage_hl.mp4', in: 44.8, dur: 2.2, flash: 0.15, grade: HOT });               // nhà trúng pháo sập
add({ src: 'final/pov_tank.mp4', in: 6.0, dur: 1.2, grade: HOT });                              // kính ngắm: hạ gục
titles.push({ at: t - 0.6, dur: 0.8, fadeIn: 0, fadeOut: 0.1, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: 'T-00:00:30' } });
fx.push({ file: X + 'tick.wav', at: t - 0.6, gain: 0.55 });
add({ src: 'v6/field.mp4', in: 15.3, dur: 2.2, grade: HOT });                                  // xe pháo cháy sau mưa đạn
add({ src: 'v6/pov_recon.mp4', in: 12.0, dur: 1.6, grade: HOT });                              // nổ giữa đồng
titles.push({ at: t - 0.4, dur: 0.8, fadeIn: 0, fadeOut: 0.1, card: { kind: 'clock', pos: 'tr', lbl: 'ĐẾM NGƯỢC', main: 'T-00:00:10' } });
fx.push({ file: X + 'tick.wav', at: t - 0.4, gain: 0.6 });
fx.push({ file: R + 'fallback.wav', at: t + 0.2, gain: 0.8 });
add({ src: 'v6/base4.mp4', in: 27.6, dur: 44.444 - t, grade: HOT });                            // căn cứ nổ dây chuyền (drone)

// ===== HỒI 4 — CHỚP KẾT (44.444–~48.8): hình loé xen đen, nhanh dần; đồng hồ 03 -> 01
const strobe = [
  ['v6/base4.mp4', 5.0, 0.42, 0.16], ['v6/base4.mp4', 21.0, 0.4, 0.15], ['v6/field.mp4', 34.0, 0.34, 0.12, 0.12],
  ['v6/field.mp4', 4.0, 0.3, 0.1], ['final/pov_kami.mp4', 22.6, 0.28, 0.1], ['v6/street.mp4', 15.0, 0.24, 0.08],
  ['v6/pov_aa.mp4', 19.0, 0.2, 0.08, 0.12], ['v6/field.mp4', 29.5, 0.18, 0.06], ['v6/base4.mp4', 28.5, 0.15, 0.06],
  ['v6/field.mp4', 13.5, 0.14, 0.05], ['final/pov_tank.mp4', 2.8, 0.13, 0.05, 0.1], ['v6/base4.mp4', 31.0, 0.12, 0.05],
  ['v6/field.mp4', 18.0, 0.12, 0.05]
];
for (const [src, a, d, gap, fl] of strobe) {
  fx.push({ file: X + 'thump.wav', at: t, gain: 0.75 });
  add({ src, in: a, dur: d, grade: HOT, flash: fl || 0, afadeIn: 0.005, afadeOut: 0.02, mute: /street/.test(src) });
  black(gap);
}
fx.push({ file: X + 'riser.wav', at: t - 2.6 + 0.2, gain: 0.6 });
add({ src: 'v6/base4.mp4', in: 29.4, dur: 0.2, flash: 0.15, grade: HOT });                     // chớp lớn cuối
const cut = t;
[['T-00:00:03', 44.444, 1.15], ['T-00:00:02', 45.6, 1.2], ['T-00:00:01', 46.8, cut - 46.8]].forEach(([m, a, d]) => {
  titles.push({ at: a, dur: d, fadeIn: 0, fadeOut: 0, card: { kind: 'clock', lbl: '', main: m } });
  fx.push({ file: X + 'tick.wav', at: a, gain: 0.7 });
});
black(49.68 - t);                                                                               // màn đen, im lặng
// ===== KẾT: logo trên nền xác xe pháo cháy dưới bão
add({ src: 'v6/field.mp4', in: 16.0, dur: 5.8, fadeIn: 1.0, fadeOut: 1.6, grade: 'dark', push: 0.05, sfx: 0.5 });
fx.push({ file: X + 'braam.wav', at: 49.7, gain: 0.7 });
titles.push({ at: 50.1, dur: 5.3, fadeIn: 1.0, fadeOut: 1.4, push: 0.04, card: { kind: 'logo', main: 'Chiến Địa Pháo Kích 3D', en: 'TACTICAL SPG COMMAND', tag: 'BẠN CÓ KỊP NGĂN CHẶN?', url: 'TANKWAR.ONLINE' } });

const E = {
  base: '.', out: 'trailer_v6.mp4', music: 'raw/music2.wav', musicIn: 8.889, musicGain: 0.8, sfxGain: 1.0,
  musicDips: [{ at: blk, dur: 26.667 - 0.978 - blk, to: 0.25 }, { at: cut + 0.02, dur: 49.66 - cut, to: 0 }, { at: sh0, dur: 2.3, to: 0.35 }],
  clips, titles, fx
};
fs.writeFileSync('edl_v6.json', JSON.stringify(E, null, 1));
console.log('tổng', t.toFixed(2), 's · đoạn', clips.length, '· chữ', titles.length, '· hiệu ứng âm', fx.length, '· màn đen', blk.toFixed(2), '· cắt', cut.toFixed(2));
