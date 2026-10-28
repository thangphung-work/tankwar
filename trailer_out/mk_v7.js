// Dựng EDL trailer v7: "CĂN CỨ HẠT NHÂN" — hai phe giành quyền làm chủ căn cứ tên lửa. Ban ngày, nắng chiều, không tiếng người.
// Còi báo động hạt nhân là sợi chỉ xuyên suốt: dâng lên từ đầu, gào dưới trận đánh, tắt phụt khi hai xe chĩa nòng vào nhau.
const fs = require('fs');
const X = 'sfx/';
const ev = (n) => { const j = JSON.parse(fs.readFileSync(`v7/${n}.events.json`, 'utf8')); return j.log.map(e => Object.assign({ s: e.v / j.fps }, e)); };
const scene = (log, name) => { const e = log.find(e => e.type === 'stage' && e.what === 'scene' && e.name === name); if (!e) throw new Error('thiếu cảnh ' + name); return e.s; };
const N3 = ev('nuke3');
const sLow = scene(N3, 'silo-low'), dead = (N3.find(e => e.type === 'stage' && e.what === 'baseDead') || { s: 31.4 }).s;
const N4 = ev('nuke4');
const sGun = scene(N4, 'gunsight'), sWide = scene(N4, 'standoff-wide'), sStand = scene(ev('nuke5'), 'standoff-wide');
const kGun = (N4.find(e => e.type === 'kill' && e.s > sGun && e.s < sWide) || { s: sGun + 2.0 }).s;
console.log('nuke3 silo-low', sLow.toFixed(1), 'dead', dead.toFixed(1), '· nuke4 gun', sGun.toFixed(1), 'kill', kGun.toFixed(1), 'wide', sWide.toFixed(1), '· nuke5 standoff', sStand.toFixed(1));

const clips = [], titles = [], fx = [];
let t = 0;
const add = (c) => { clips.push(c); t += (c.black || c.dur) - (c.x || 0); return t; };
const black = (d, o) => add(Object.assign({ black: d }, o || {}));
const DAY = 'day';
const role = (main, sub, d) => titles.push({ at: t + 0.15, dur: (d || 2) - 0.25, fadeIn: 0.15, fadeOut: 0.2, card: { kind: 'low', main, sub } });

// ===== HỒI 1 — CĂN CỨ (0–8.889): cảnh quan, bệ phóng, hai phe
black(0.25);
add({ src: 'v7/nuke2.mp4', in: 0.4, dur: 3.5, fadeIn: 0.8, grade: DAY, push: 0.05 });                // toàn cảnh căn cứ dưới nắng chiều
titles.push({ at: 0.9, dur: 2.7, fadeIn: 0.5, fadeOut: 0.4, card: { kind: 'cine', main: 'MỘT CĂN CỨ HẠT NHÂN' } });
add({ src: 'v7/nuke2.mp4', in: 9.0, dur: 2.0, x: 0.4, grade: DAY });                                  // lướt qua tháp canh, bệ phóng
add({ src: 'v7/nuke3.mp4', in: sLow + 0.6, dur: 1.7, grade: DAY });                                   // nắp giếng phóng
const twoAt = t;
add({ src: 'v7/nuke2.mp4', in: 16.2, dur: 1.2, grade: DAY });                                         // phe Xanh lao tới
add({ src: 'v7/nuke2.mp4', in: 21.0, dur: 8.889 - t, grade: DAY });                                   // phe Đỏ tiến về căn cứ
titles.push({ at: twoAt + 0.1, dur: 8.889 - twoAt - 0.15, fadeIn: 0.15, fadeOut: 0.1, card: { kind: 'cine', main: 'HAI PHE' } });
fx.push({ file: X + 'whoosh.wav', at: twoAt - 0.25, gain: 0.5 });

// thẻ đen: lời tuyên bố (nhạc vào đoạn dồn)
const decl = t;
black(1.75);
titles.push({ at: decl + 0.1, dur: 1.6, fadeIn: 0.15, fadeOut: 0.15, card: { kind: 'cine', main: 'KẺ LÀM CHỦ NÓ', sub: 'LÀM CHỦ CẢ CUỘC CHIẾN' } });
fx.push({ file: X + 'braam.wav', at: decl, gain: 0.75 });

// ===== HỒI 2 — LỰC LƯỢNG (→26.667): mỗi phương tiện một khoảnh khắc + tên vai trò
role('PHÁO TỰ HÀNH', 'Hỏa lực tầm xa', 2.1);
// roles.mp4 treo giữa buổi -> không có tiếng: mượn tiếng pháo của v6/field (phát bắn 4.70) cho cả 3 khẩu
[0.5, 0.9].forEach((o, i) => fx.push({ file: 'v6/field.mp4', at: t + o - 0.06, in: 4.64, dur: 1.2, gain: 0.7 - i * 0.12 }));
add({ src: 'v7/roles.mp4', in: 8.0, dur: 2.1, grade: DAY, audio: { src: 'v6/field.mp4', in: 4.64 } });      // dàn pháo khai hỏa
role('XE TĂNG CHỦ LỰC', 'Xuyên giáp — một phát hạ gục', 2.3);
add({ src: 'v7/nuke4.mp4', in: Math.max(sGun + 0.6, kGun - 1.4), dur: 2.3, grade: DAY });            // kính ngắm, bắn trúng
role('XE TRINH SÁT', 'Tên lửa chống tăng', 2.1);
add({ src: 'v7/roles.mp4', in: 13.2, dur: 2.1, grade: DAY, audio: { src: 'final/show_urban.mp4', in: 31.67 } }); // phóng tên lửa
role('XE 6 NÒNG', 'Áp chế cự ly gần', 1.5);
add({ src: 'final/live_urban.mp4', in: 69.6, dur: 1.5, grade: DAY });                                 // 6 nòng xả đạn
role('PHÒNG KHÔNG', 'Bắn hạ UAV trên đầu', 2.1);
add({ src: 'v7/povG.mp4', in: 13.5, dur: 2.1, grade: DAY });                                          // kính ngắm phòng không, drone rơi
role('UAV TRINH SÁT', 'Mắt trên trời', 1.5);
add({ src: 'v7/povA.mp4', in: 6.0, dur: 1.5, grade: DAY });
role('UAV CẢM TỬ', 'Lao thẳng vào mục tiêu', 2.6);
add({ src: 'v7/povA.mp4', in: 13.0, dur: 2.6, grade: DAY });                                          // lao xuống -> MẤT TÍN HIỆU
const blk = t;
black(26.667 - t);
titles.push({ at: blk + 0.05, dur: 26.667 - blk - 0.1, slam: 0.25, fadeIn: 0.02, fadeOut: 0.1, card: { kind: 'slam', main: 'KHÔNG KHOAN NHƯỢNG' } });
fx.push({ file: X + 'heartbeat.wav', at: blk + 0.05, gain: 0.8 });
fx.push({ file: X + 'riser.wav', at: 26.667 - 2.6, gain: 0.5 });

// ===== HỒI 3 — GIAO TRANH (26.667–~44): đạn chùm, xe cháy, nhà sập, căn cứ sụp
fx.push({ file: X + 'braam.wav', at: 26.667, gain: 0.95 });
add({ src: 'v7/nuke2.mp4', in: 39.7, dur: 2.6, flash: 0.25, grade: DAY });                           // đạn chùm phủ quanh căn cứ
add({ src: 'final/duels_hl.mp4', in: 3.6, dur: 2.0, grade: DAY });                                    // xe trúng đạn bốc cháy
add({ src: 'v7/nuke2.mp4', in: 44.0, dur: 1.8, grade: DAY });                                         // xe nổ giữa mưa đạn
add({ src: 'final/stage_hl.mp4', in: 44.8, dur: 2.2, grade: DAY });                                   // nhà trúng pháo sập
add({ src: 'final/duels_hl.mp4', in: 24.6, dur: 1.4, grade: DAY });                                   // kho đạn trên xe nổ tung
const strikeAt = t;
add({ src: 'v7/nuke3.mp4', in: dead - 0.7, dur: 2.7, grade: DAY });                                    // căn cứ nổ dây chuyền, tháp canh đổ (tele)
add({ src: 'v7/nuke2.mp4', in: 56.3, dur: 3.3, grade: DAY });                                          // nhìn từ trên: căn cứ sụp thành khung cháy đen
const t44 = t;

// ===== HỒI 4 — ĐỐI ĐẦU: hai xe chĩa nòng vào nhau trên bệ phóng; còi lên đỉnh rồi tắt phụt
add({ src: 'v7/nuke5.mp4', in: sStand + 0.3, dur: 4.3, grade: DAY, push: 0.1, sfx: 0.6 });              // Xanh – Đỏ chĩa nòng vào nhau, căn cứ phía sau
const cut = t;
black(0.12);
const ctaAt = t;
black(49.66 - t);
titles.push({ at: ctaAt + 0.25, dur: 49.66 - ctaAt - 0.4, fadeIn: 0.4, fadeOut: 0.3, card: { kind: 'cine', main: 'TRẬN CHIẾN ĐANG CHỜ BẠN' } });

// ===== KẾT: logo trên toàn cảnh căn cứ (sáng, không tối)
add({ src: 'v7/nuke2.mp4', in: 0.3, dur: 5.6, fadeIn: 0.9, fadeOut: 1.4, grade: DAY, push: 0.04, sfx: 0.4 });
fx.push({ file: X + 'braam.wav', at: 49.7, gain: 0.7 });
titles.push({ at: 50.0, dur: 5.1, fadeIn: 0.9, fadeOut: 1.2, push: 0.03, card: { kind: 'logo', main: 'Chiến Địa Pháo Kích 3D', en: 'TACTICAL SPG COMMAND', tag: 'XUẤT KÍCH NGAY · CHƠI TRÊN TRÌNH DUYỆT', url: 'TANKWAR.ONLINE' } });

// còi hạt nhân: cắt đúng lúc đang gào ở đỉnh chu kỳ (tệp: chu kỳ 9.6 s, đỉnh 3.5–6.2 s) -> chu kỳ 5, giây 44.4 của tệp
const sirenAt = cut - 44.4, rel = (a) => +(a - sirenAt).toFixed(2);
fx.push({
  file: X + 'nsiren.wav', at: Math.max(0, sirenAt), in: Math.max(0, -sirenAt), dur: +(cut - Math.max(0, sirenAt)).toFixed(3), fo: 0.01, gain: 0.6,
  env: [[0, 0.8], [rel(decl), 0.8], [rel(decl + 1.8), 0.32], [rel(26.5), 0.32], [rel(27.2), 0.45], [rel(t44 - 1.5), 0.45], [rel(t44 + 1.0), 1.5], [rel(cut), 1.8]]
});

const E = {
  base: '.', out: 'trailer_v7.mp4', music: 'raw/music2.wav', musicIn: 8.889, musicGain: 0.75, sfxGain: 1.0, vignette: 10,   // PI/4.2 cũ làm tối nửa khung (YAVG 107 -> 58); PI/10 chỉ ~ -7%
  musicDips: [{ at: 0, dur: decl, to: 0.55 }, { at: blk, dur: 26.667 - blk, to: 0.3 }, { at: t44, dur: cut - t44, to: 0.45 }, { at: cut, dur: 49.66 - cut, to: 0 }],
  clips, titles, fx
};
fs.writeFileSync('edl_v7.json', JSON.stringify(E, null, 1));
console.log('tổng', t.toFixed(2), 's · đoạn', clips.length, '· chữ', titles.length, '· còi từ', sirenAt.toFixed(2), '· căn cứ sập', strikeAt.toFixed(2), '· đối đầu', t44.toFixed(2), '· cắt', cut.toFixed(2));
