/**
 * SOÁT HÌNH TỰ ĐỘNG (tools/trailer/qc.js): node tools/trailer/qc.js <video.mp4> [ngưỡng=40]
 * Đo độ tương phản luma (YHIGH - YLOW, ffmpeg signalstats) 5 lần / giây; in các đoạn "bị khói / sương trùm kín"
 * (tương phản dưới ngưỡng) và các đoạn đen kịt — để loại khi chọn cảnh dựng trailer.
 */
const { spawnSync } = require('child_process');
const FFMPEG = process.env.FFMPEG || (() => { try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; } })();
const file = process.argv[2], thr = parseFloat(process.argv[3] || '40');
const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-vf', 'fps=5,scale=320:-1,signalstats,metadata=print', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const out = r.stderr || '';
const rows = [];
let t = null, lo = null, hi = null, av = null;
for (const line of out.split(/\r?\n/)) {
  let m;
  if ((m = line.match(/pts_time:([\d.]+)/))) t = +m[1];
  else if ((m = line.match(/lavfi\.signalstats\.YLOW=([\d.]+)/))) lo = +m[1];
  else if ((m = line.match(/lavfi\.signalstats\.YHIGH=([\d.]+)/))) hi = +m[1];
  else if ((m = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/))) { av = +m[1]; if (t !== null && lo !== null && hi !== null) rows.push({ t, c: hi - lo, av }); }
}
const bad = [];
for (const x of rows) {
  const kind = x.av < 18 ? 'đen' : x.c < thr ? 'khói/mờ' : null;
  const p = bad[bad.length - 1];
  if (kind && p && p.kind === kind && x.t - p.t1 <= 0.25) p.t1 = x.t;
  else if (kind) bad.push({ kind, t0: x.t, t1: x.t });
}
console.log(`${file}: ${rows.length} mẫu, tương phản TB ${(rows.reduce((s, x) => s + x.c, 0) / Math.max(1, rows.length)).toFixed(0)}`);
for (const b of bad.filter(b => b.t1 - b.t0 >= 0.4)) console.log(`  ${b.kind.padEnd(8)} ${b.t0.toFixed(1)}–${b.t1.toFixed(1)} s`);
