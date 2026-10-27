/**
 * DỰNG TRAILER TỪ CÁC ĐOẠN ĐÃ QUAY (tools/trailer/edit.js)
 *
 *   node tools/trailer/edit.js <edl.json>
 *
 * edl.json:
 * {
 *   "base": "<thư mục chứa nguồn>", "out": "trailer.mp4", "music": "music.wav", "musicGain": 0.8, "sfxGain": 1,
 *   "clips": [ { "src": "a.mp4", "in": 12.3, "dur": 2.2, "sfx": 1, "fadeIn": 0.3, "x": 0.6, "dip": false, "flash": 0.25, "grade": "cold|neutral|hot|bleach", "push": 0.05, "mute": false, "audio": { "src", "in" } },
 *              { "black": 0.6 } ],                 // màn đen
 *   "titles": [ { "at": 2, "dur": 3, "card": { "kind": "center|low|logo", "kicker": "", "main": "", "sub": "" } } ]
 * }
 * - Nối theo thứ tự: cắt cứng, hoặc x = mờ chồng với đoạn trước (dip: mờ qua đen); fadeIn / fadeOut = mờ từ / về đen;
 *   flash = chớp trắng đầu đoạn; grade = tông màu theo hồi; push = máy đẩy chậm vào khung.
 * - Vi-nhét, hạt phim, viền đen 2.39:1; chữ: thẻ PNG nền trong suốt dựng bằng Chrome (titles.html), push = chữ tiến lại gần.
 * - musicIn = bắt đầu nhạc từ giây; musicDips = [{ at, dur, to }] lặng nhạc (vd. ngay trước cú "ẦM").
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
    let nav = 0;
    const snap = async (card, f) => {
      await send('Page.navigate', { url: page + '?n=' + (nav++) + '#' + encodeURIComponent(JSON.stringify(card)) });   // ?n: buộc nạp lại trang (đổi mỗi #... thì không)
      for (let k = 0; k < 60; k++) { const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }); if (r.result && r.result.value === 'OK') break; await sleep(100); }
      await sleep(120);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    };
    for (let i = 0; i < titles.length; i++) {
      const T = titles[i];
      if (T.type) {
        // chữ máy đánh: một ảnh cho mỗi ký tự gõ thêm (title_i_000.png ...), phát với tốc độ T.type ký tự / giây
        const N = (T.card.lines || [T.card.main || '']).join('').length;
        for (let k = 0; k <= N; k++) await snap(Object.assign({}, T.card, { k }), path.join(dir, `title_${i}_${String(k).padStart(3, '0')}.png`));
        files.push({ seq: path.join(dir, `title_${i}_%03d.png`), n: N + 1 });
      } else {
        const f = path.join(dir, `title_${i}.png`);
        await snap(T.card, f);
        files.push(f);
      }
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
  let inIdx = 0;
  const silence = (d, lab) => fc.push(`anullsrc=r=48000:cl=stereo,atrim=0:${d.toFixed(3)}[${lab}]`);

  // TÔNG MÀU theo hồi: cold = lạnh, ngả xám (mở đầu lặng); hot = nóng, tương phản gắt (cao trào); mặc định = teal-cam
  const GRADE = {
    neutral: 'eq=contrast=1.10:saturation=0.92:gamma=0.97,colorbalance=rs=-0.04:gs=-0.01:bs=0.05:rh=0.05:gh=0.01:bh=-0.05',
    cold: 'eq=contrast=1.12:saturation=0.62:gamma=0.94:brightness=-0.02,colorbalance=rs=-0.06:gs=0.0:bs=0.08:rm=-0.03:bm=0.04:rh=0.0:bh=0.03',
    hot: 'eq=contrast=1.20:saturation=1.05:gamma=0.95,colorbalance=rs=-0.03:bs=0.05:rm=0.05:gm=0.0:bm=-0.04:rh=0.08:gh=0.02:bh=-0.07',
    bleach: 'eq=contrast=1.25:saturation=0.45:gamma=0.92,colorbalance=rh=0.04:bh=-0.02',
    // nền logo: tối, lạnh, chữ nổi lên
    dark: 'eq=contrast=1.15:saturation=0.55:gamma=0.85:brightness=-0.07,colorbalance=rs=-0.05:bs=0.07:rh=0.02'
  };

  // từng đoạn -> [v_i][a_i] đã chỉnh màu, đúng độ dài
  const segs = [];
  E.clips.forEach((c, i) => {
    if (c.black) {
      fc.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${c.black},format=yuv420p,setsar=1,settb=AVTB[v${i}]`);
      silence(c.black, `a${i}`);
      segs.push({ c, dur: c.black });
      return;
    }
    args.push('-ss', String(c.in), '-t', String(c.dur), '-i', path.resolve(BASE, c.src));
    const k = inIdx++;
    let v = `[${k}:v]setpts=PTS-STARTPTS,fps=${FPS},trim=duration=${c.dur}`;
    // máy đẩy chậm vào khung (push: tỉ lệ phóng thêm tới cuối đoạn) — phóng to trước để zoompan không rung
    if (c.push) v += `,scale=${W * 2}:${H * 2},zoompan=z='1+${c.push}*on/${Math.round(c.dur * FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`;
    else v += `,scale=${W}:${H}`;
    v += ',' + (GRADE[c.grade || E.grade || 'neutral'] || GRADE.neutral);
    if (c.ca) v += `,rgbashift=rh=-9:bh=9:rv=2:bv=-2:enable='lt(t,${c.ca})'`;
    if (c.fadeIn) v += `,fade=t=in:st=0:d=${c.fadeIn}`;
    if (c.fadeOut) v += `,fade=t=out:st=${(c.dur - c.fadeOut).toFixed(3)}:d=${c.fadeOut}`;
    fc.push(v + `,format=yuv420p,setsar=1,settb=AVTB[v${i}]`);
    const g = (c.sfx === undefined ? 1 : c.sfx) * (E.sfxGain || 1);
    const af = Math.min(0.02, c.dur / 4);
    let aIn = `${k}:a`;
    if (c.audio) { args.push('-ss', String(c.audio.in), '-t', String(c.dur), '-i', path.resolve(BASE, c.audio.src)); aIn = `${inIdx++}:a`; }
    if (c.mute && !c.audio) silence(c.dur, `a${i}`);
    else fc.push(`[${aIn}]asetpts=PTS-STARTPTS,aresample=48000,atrim=duration=${c.dur},apad=whole_dur=${c.dur},volume=${g.toFixed(3)},afade=t=in:d=${c.afadeIn || af},afade=t=out:st=${(c.dur - (c.afadeOut || af)).toFixed(3)}:d=${c.afadeOut || af}[a${i}]`);
    segs.push({ c, dur: c.dur });
  });

  // nối: x = mờ chồng với đoạn trước (giây), dip = mờ qua đen; còn lại cắt cứng
  let curV = '[v0]', curA = '[a0]', len = segs[0].dur;
  const starts = [0];
  for (let i = 1; i < segs.length; i++) {
    const c = segs[i].c, x = Math.min(c.x || 0, segs[i].dur * 0.9, len * 0.9);
    if (x > 0) {
      const off = len - x;
      fc.push(`${curV}[v${i}]xfade=transition=${c.dip ? 'fadeblack' : 'fade'}:duration=${x}:offset=${off.toFixed(3)},settb=AVTB[xv${i}]`);
      fc.push(`${curA}[a${i}]acrossfade=d=${x}:c1=tri:c2=tri[xa${i}]`);
      starts.push(off); len = off + segs[i].dur;
    } else {
      fc.push(`${curV}[v${i}]concat=n=2:v=1:a=0,settb=AVTB[xv${i}]`);
      fc.push(`${curA}[a${i}]concat=n=2:v=0:a=1[xa${i}]`);
      starts.push(len); len += segs[i].dur;
    }
    curV = `[xv${i}]`; curA = `[xa${i}]`;
  }
  const total = len;
  fc.push(`${curA}anull[sfx]`);

  // chớp trắng đầu đoạn (cú nổ / chuyển hồi): flash = độ dài (giây)
  let cur = curV;
  segs.forEach((s, i) => {
    if (!s.c.flash) return;
    const f = s.c.flash;
    fc.push(`color=c=white:s=${W}x${H}:r=${FPS}:d=${f},format=rgba,fade=t=out:st=0:d=${f}:alpha=1,setpts=PTS-STARTPTS+${starts[i].toFixed(3)}/TB[fl${i}]`);
    fc.push(`${cur}[fl${i}]overlay=0:0:eof_action=pass[fo${i}]`);
    cur = `[fo${i}]`;
  });

  // vi-nhét, hạt phim, viền đen 2.39:1
  const bar = Math.round((H - W / 2.39) / 2);
  let vg = `${cur}vignette=angle=PI/4.2,noise=alls=4:allf=t`;
  if (E.letterbox !== false) vg += `,drawbox=x=0:y=0:w=${W}:h=${bar}:color=black:t=fill,drawbox=x=0:y=${H - bar}:w=${W}:h=${bar}:color=black:t=fill`;
  fc.push(vg + '[vg]');

  // chữ: mờ vào / ra, push = tiến chậm lại gần (phóng dần quanh tâm)
  cur = '[vg]';
  titles.forEach((T, i) => {
    const TF = titleFiles[i];
    if (TF && TF.seq) args.push('-framerate', String(T.type), '-start_number', '0', '-i', TF.seq);
    else args.push('-loop', '1', '-t', String(T.dur), '-i', TF);
    const k = inIdx++;
    const fi = T.fadeIn !== undefined ? T.fadeIn : 0.45, fo = T.fadeOut !== undefined ? T.fadeOut : 0.5;
    let tv = `[${k}:v]format=rgba,fps=${FPS}`;
    if (TF && TF.seq) tv += `,tpad=stop_mode=clone:stop_duration=${Math.max(0.1, T.dur - TF.n / T.type).toFixed(3)},trim=duration=${T.dur}`;
    // chữ đập: phóng từ (1 + slam) về đúng cỡ trong 0,22 s
    if (T.slam) tv += `,scale=w='trunc(${W}*(1+${T.slam}*max(0,1-t/0.22))/2)*2':h=-2:eval=frame,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2`;
    if (T.push) tv += `,scale=w='trunc(${W}*(1+${T.push}*t/${T.dur})/2)*2':h=-2:eval=frame,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2`;
    tv += `,fade=t=in:st=0:d=${fi}:alpha=1,fade=t=out:st=${(T.dur - fo).toFixed(3)}:d=${fo}:alpha=1,setpts=PTS-STARTPTS+${T.at}/TB`;
    fc.push(tv + `[t${i}]`);
    fc.push(`${cur}[t${i}]overlay=0:0:eof_action=pass[o${i}]`);
    cur = `[o${i}]`;
  });
  fc.push(`${cur}format=yuv420p[vout]`);

  // nhạc: nén theo tiếng game; musicDips = lặng nhạc (vd. ngay trước cú "ẦM"): [{ at, dur, to }]
  if (E.music) {
    args.push('-i', path.resolve(BASE, E.music));
    const k = inIdx++;
    let m = `[${k}:a]aresample=48000,atrim=${E.musicIn || 0}:${(E.musicIn || 0) + total},asetpts=PTS-STARTPTS,volume=${E.musicGain || 0.8}`;
    for (const d of (E.musicDips || [])) m += `,volume=enable='between(t,${d.at},${d.at + d.dur})':volume=${d.to}`;
    fc.push(m + '[mus]');
    fc.push(`[sfx]asplit=2[sfxa][sfxsc]`);
    fc.push(`[mus][sfxsc]sidechaincompress=threshold=0.08:ratio=4:attack=8:release=350:makeup=1[musd]`);
    const fxs = E.fx || [];
    fxs.forEach((x, n) => {
      args.push('-i', path.resolve(BASE, x.file));
      const kk = inIdx++, ms = Math.round(x.at * 1000);
      fc.push(`[${kk}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${x.gain === undefined ? 1 : x.gain}${x.dur ? `,atrim=duration=${x.dur},afade=t=out:st=${Math.max(0, x.dur - 0.3)}:d=0.3` : ''},adelay=${ms}|${ms}[fx${n}]`);
    });
    if (fxs.length) fc.push(`${fxs.map((x, n) => `[fx${n}]`).join('')}amix=inputs=${fxs.length}:duration=longest:normalize=0[fxm]`);
    fc.push(`[sfxa][musd]${fxs.length ? '[fxm]' : ''}amix=inputs=${fxs.length ? 3 : 2}:duration=first:normalize=0,afade=t=in:d=0.3,afade=t=out:st=${(total - 1.4).toFixed(3)}:d=1.4,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000[aout]`);
  } else fc.push(`[sfx]loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000[aout]`);
  const fcFile = path.join(tmp, 'graph.txt');
  fs.writeFileSync(fcFile, fc.join(';\n'));
  args.push('-filter_complex_script', fcFile, '-map', '[vout]', '-map', '[aout]', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '256k', '-t', total.toFixed(3), OUT);
  console.log(`[EDIT] ${E.clips.length} đoạn, ${titles.length} thẻ chữ, dài ${total.toFixed(2)} s -> ${OUT}`);
  // mốc bắt đầu từng đoạn trên phim thành phẩm (để canh chữ / nhạc)
  console.log('[EDIT] mốc:', starts.map((s, i) => `${i}:${s.toFixed(2)}`).join(' '));
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error('[EDIT] ffmpeg lỗi; đồ thị lọc:', fcFile); process.exit(1); }
  console.log('[EDIT] XONG');
})();
