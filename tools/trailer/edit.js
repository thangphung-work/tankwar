/**
 * DỰNG TRAILER TỪ CÁC ĐOẠN ĐÃ QUAY (tools/trailer/edit.js)
 *
 *   node tools/trailer/edit.js <edl.json>
 *
 * edl.json:
 * {
 *   "base": "<thư mục chứa nguồn>", "out": "trailer.mp4", "music": "music.wav", "musicGain": 0.8, "sfxGain": 1,
 *   "clips": [ { "src": "stage_hl7.mp4", "in": 12.3, "dur": 2.2, "sfx": 1, "fadeIn": 0.3, "fadeOut": 0 },
 *              { "black": 0.6 } ],                 // màn đen
 *   "titles": [ { "at": 2, "dur": 3, "card": { "kind": "center|low|logo", "kicker": "", "main": "", "sub": "" } } ]
 * }
 * - Các đoạn nối liền nhau theo thứ tự (cắt cứng; fadeIn / fadeOut = mờ từ / về đen).
 * - Chỉnh màu điện ảnh nhẹ, viền đen 2.39:1, hạt phim nhẹ; chữ: thẻ PNG nền trong suốt dựng bằng Chrome (titles.html).
 * - Tiếng: tiếng game của từng đoạn + nhạc; nhạc nén theo tiếng game (tiếng nổ lớn xuyên qua nhạc); chuẩn hoá -14 LUFS.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const EDL_PATH = path.resolve(process.argv[2] || 'edl.json');
const E = JSON.parse(fs.readFileSync(EDL_PATH, 'utf8'));
const BASE = path.resolve(path.dirname(EDL_PATH), E.base || '.');
const OUT = path.resolve(BASE, E.out || 'trailer.mp4');
const FFMPEG = process.env.FFMPEG || (() => { try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; } })();
const W = 1920, H = 1080, FPS = 30;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function chromePath() {
  return ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
}

// thẻ chữ -> PNG nền trong suốt
async function renderTitles(titles, dir) {
  if (!titles.length) return [];
  const port = 9700 + Math.floor(Math.random() * 200);
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'tankwar-titles-'));
  const ch = spawn(chromePath(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, `--window-size=${W},${H}`, '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  try {
    let list = null;
    for (let i = 0; i < 100 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { await sleep(200); } }
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const wait = new Map();
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result || d); wait.delete(d.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const files = [];
    const page = 'file:///' + path.join(__dirname, 'titles.html').replace(/\\/g, '/');
    for (let i = 0; i < titles.length; i++) {
      await send('Page.navigate', { url: page + '#' + encodeURIComponent(JSON.stringify(titles[i].card)) });
      for (let k = 0; k < 60; k++) { const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }); if (r.result && r.result.value === 'OK') break; await sleep(100); }
      await sleep(150);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(dir, `title_${i}.png`);
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      files.push(f);
    }
    return files;
  } finally { try { ch.kill(); } catch (e) { /* bỏ qua */ } }
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tankwar-edit-'));
  const titles = E.titles || [];
  const titleFiles = await renderTitles(titles, tmp);
  const args = ['-y', '-loglevel', 'error'];
  const fc = [];
  const vLabels = [], aLabels = [];
  let inIdx = 0, t = 0;
  const silence = (d, lab) => fc.push(`anullsrc=r=48000:cl=stereo,atrim=0:${d.toFixed(3)}[${lab}]`);
  E.clips.forEach((c, i) => {
    if (c.black) {
      fc.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${c.black}[v${i}]`);
      silence(c.black, `a${i}`);
      vLabels.push(`[v${i}]`); aLabels.push(`[a${i}]`);
      t += c.black;
      return;
    }
    args.push('-ss', String(c.in), '-t', String(c.dur), '-i', path.resolve(BASE, c.src));
    const k = inIdx++;
    let v = `[${k}:v]setpts=PTS-STARTPTS,scale=${W}:${H},fps=${FPS},trim=duration=${c.dur}`;
    if (c.fadeIn) v += `,fade=t=in:st=0:d=${c.fadeIn}`;
    if (c.fadeOut) v += `,fade=t=out:st=${(c.dur - c.fadeOut).toFixed(3)}:d=${c.fadeOut}`;
    fc.push(v + `[v${i}]`);
    const g = (c.sfx === undefined ? 1 : c.sfx) * (E.sfxGain || 1);
    const af = Math.min(0.02, c.dur / 4);
    fc.push(`[${k}:a]asetpts=PTS-STARTPTS,aresample=48000,atrim=duration=${c.dur},apad=whole_dur=${c.dur},volume=${g.toFixed(3)},afade=t=in:d=${c.afadeIn || af},afade=t=out:st=${(c.dur - (c.afadeOut || af)).toFixed(3)}:d=${c.afadeOut || af}[a${i}]`);
    vLabels.push(`[v${i}]`); aLabels.push(`[a${i}]`);
    t += c.dur;
  });
  const total = t;
  fc.push(`${vLabels.join('')}concat=n=${vLabels.length}:v=1:a=0[vcat]`);
  fc.push(`${aLabels.join('')}concat=n=${aLabels.length}:v=0:a=1[sfx]`);
  // chỉnh màu: tương phản nhẹ, bóng đổ xanh lạnh / sáng ấm, vi-nhét, hạt phim, viền đen 2.39:1
  const bar = Math.round((H - W / 2.39) / 2);
  let vg = `[vcat]eq=contrast=1.07:saturation=1.06:gamma=0.98,colorbalance=rs=-0.03:gs=-0.01:bs=0.04:rh=0.035:gh=0.01:bh=-0.035,vignette=angle=PI/5,noise=alls=3:allf=t`;
  if (E.letterbox !== false) vg += `,drawbox=x=0:y=0:w=${W}:h=${bar}:color=black:t=fill,drawbox=x=0:y=${H - bar}:w=${W}:h=${bar}:color=black:t=fill`;
  fc.push(vg + '[vg]');
  // chữ
  let cur = '[vg]';
  titles.forEach((T, i) => {
    args.push('-loop', '1', '-t', String(T.dur), '-i', titleFiles[i]);
    const k = inIdx++;
    const fi = T.fadeIn !== undefined ? T.fadeIn : 0.45, fo = T.fadeOut !== undefined ? T.fadeOut : 0.5;
    fc.push(`[${k}:v]format=rgba,fade=t=in:st=0:d=${fi}:alpha=1,fade=t=out:st=${(T.dur - fo).toFixed(3)}:d=${fo}:alpha=1,setpts=PTS-STARTPTS+${T.at}/TB[t${i}]`);
    fc.push(`${cur}[t${i}]overlay=0:0:eof_action=pass[o${i}]`);
    cur = `[o${i}]`;
  });
  fc.push(`${cur}format=yuv420p[vout]`);
  // nhạc nén theo tiếng game, trộn, chuẩn hoá
  if (E.music) {
    args.push('-i', path.resolve(BASE, E.music));
    const k = inIdx++;
    fc.push(`[${k}:a]aresample=48000,atrim=${E.musicIn || 0}:${(E.musicIn || 0) + total},asetpts=PTS-STARTPTS,volume=${E.musicGain || 0.8}[mus]`);
    fc.push(`[sfx]asplit=2[sfxa][sfxsc]`);
    fc.push(`[mus][sfxsc]sidechaincompress=threshold=0.08:ratio=4:attack=8:release=350:makeup=1[musd]`);
    fc.push(`[sfxa][musd]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${(total - 1.2).toFixed(3)}:d=1.2,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000[aout]`);
  } else fc.push(`[sfx]loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000[aout]`);
  const fcFile = path.join(tmp, 'graph.txt');
  fs.writeFileSync(fcFile, fc.join(';\n'));
  args.push('-filter_complex_script', fcFile, '-map', '[vout]', '-map', '[aout]', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '256k', '-t', total.toFixed(3), OUT);
  console.log(`[EDIT] ${E.clips.length} đoạn, ${titles.length} thẻ chữ, dài ${total.toFixed(1)} s -> ${OUT}`);
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error('[EDIT] ffmpeg lỗi; đồ thị lọc:', fcFile); process.exit(1); }
  console.log('[EDIT] XONG');
})();
