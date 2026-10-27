/**
 * DÒ KHOẢNH KHẮC ĐÁNG DÙNG TRONG BUỔI QUAY (tools/trailer/highlights.js)
 *
 *   node tools/trailer/highlights.js <thư mục>/<tên>     (đọc <tên>.events.json + <tên>.mp4)
 *
 * In danh sách mốc (giây trong video) kèm nhãn: xe bị hạ trong khung hình, quay chậm, đạn bay trúng, UAV phóng / bị bắn
 * hạ, cảnh dàn dựng, flycam bản đồ. Ghi <tên>.sheet.jpg: ảnh xem trước mỗi mốc (có nhãn thời gian) để chọn đoạn dựng.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = process.env.FFMPEG || (() => { try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; } })();

const base = path.resolve(process.argv[2]);
const ev = JSON.parse(fs.readFileSync(base + '.events.json', 'utf8'));
const fps = ev.fps || 30, f0 = ev.f0 || 0;
// mốc trên video: theo số khung đã ghi (v) nếu có — khung chờ dựng cảnh không được ghi
const v0 = ev.v0;
const T = (l) => +((v0 !== undefined && l.v !== undefined ? l.v - v0 : l.f - f0) / fps).toFixed(2);
const marks = [];
for (const l of ev.log) {
  if (l.f < f0 || T(l) < 0) continue;
  const t = T(l);
  if (l.type === 'kill' && l.vis) marks.push({ t, tag: 'KILL ' + (l.tt || ''), w: 3 });
  else if (l.type === 'shellhit') marks.push({ t, tag: 'SHELLHIT', w: 2 });
  else if (l.type === 'droneDown') marks.push({ t, tag: 'DRONE DOWN ' + l.why + (l.vis ? ' vis' : ''), w: l.vis ? 3 : 1 });
  else if (l.type === 'uav') marks.push({ t, tag: 'UAV ' + (l.kami ? 'kami' : 'recon'), w: 2 });
  else if (l.type === 'stage') marks.push({ t, tag: 'STAGE ' + l.what + (l.name ? ' ' + l.name : '') + (l.tt ? ' ' + l.tt : ''), w: 2 });
  else if (l.type === 'overview') marks.push({ t, tag: 'MAP ' + l.name, w: 2 });
  else if (l.type === 'shot' && (l.kind === 'shell' || l.kind === 'drone' || l.kind === 'wreck')) marks.push({ t, tag: 'SHOT ' + l.kind + ' ' + (l.tt || ''), w: 1 });
  else if (l.type === 'impact' && l.vis && l.tgt && l.d < 450) marks.push({ t, tag: 'HIT ' + l.ammo, w: 1 });
}
marks.sort((a, b) => a.t - b.t);
// gộp mốc sát nhau (< 0,4 s)
const out = [];
for (const m of marks) { const p = out[out.length - 1]; if (p && m.t - p.t < 0.4) { p.tag += ' + ' + m.tag; p.w = Math.max(p.w, m.w); } else out.push(Object.assign({}, m)); }
for (const m of out) console.log(m.t.toFixed(2).padStart(7), '★'.repeat(m.w).padEnd(3), m.tag);

// ảnh xem trước: khung tại t + 0,4 s, ô 4 cột
const mp4 = base + '.mp4';
if (fs.existsSync(mp4) && out.length) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tw-hl-'));
  const list = out.slice(0, 48);
  list.forEach((m, i) => {
    spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, m.t + 0.4)), '-i', mp4, '-frames:v', '1', '-vf',
      `scale=480:-1,drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='${m.t.toFixed(1)}s':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.6`,
      path.join(tmp, `h_${String(i).padStart(3, '0')}.jpg`)]);
  });
  const rows = Math.ceil(list.length / 4);
  spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', path.join(tmp, 'h_%03d.jpg'), '-vf', `tile=4x${rows}`, '-frames:v', '1', base + '.sheet.jpg']);
  console.log('ảnh xem trước:', base + '.sheet.jpg');
}
