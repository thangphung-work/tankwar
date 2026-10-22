/**
 * BUILD BẢN PHÁT HÀNH -> dist/
 * Gộp các <script src> cục bộ liền nhau trong index.html thành 1 tệp (giữ đúng thứ tự, script nội tuyến /
 * script ngoài như AdSense giữ nguyên chỗ), gộp CSS cục bộ, nén bằng esbuild, đặt tên theo hash nội dung.
 * Script cổ điển dùng chung phạm vi toàn cục nên nối thẳng giữ nguyên ngữ nghĩa; esbuild chỉ "transform"
 * (không bundle) nên không đổi tên biến toàn cục.
 * Chạy: npm run build. Máy chủ (npm start, không --dev) tự phục vụ dist/index.html nếu có.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const LOCAL_SCRIPT = /^\s*<script\s+src="(?!https?:|\/\/)([^"?]+)(\?[^"]*)?"\s*><\/script>\s*$/;
const LOCAL_CSS = /^\s*<link\s+rel="stylesheet"\s+href="(?!https?:|\/\/|assets\/vendor\/)([^"?]+)(\?[^"]*)?"\s*>\s*$/;

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function emit(name, ext, code, loader) {
  let out = code;
  try {
    out = esbuild.transformSync(code, { loader, minify: true, target: 'es2020', charset: 'utf8', legalComments: 'none' }).code;
  } catch (e) {
    console.warn(`! Không nén được ${name}.${ext}, dùng bản chưa nén:`, e.message.split('\n')[0]);
  }
  const file = `${name}.${hash(out)}.${ext}`;
  fs.writeFileSync(path.join(OUT, file), out);
  console.log(`  ${file}  ${(code.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
  // ?v= để máy chủ đặt cache 1 năm (immutable); hash đổi theo nội dung nên không kẹt bản cũ
  return `dist/${file}?v=${file.split('.')[1]}`;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

const lines = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split(/\r?\n/);
const out = [];
let group = null;
let jsCount = 0;
let cssDone = false;
const cssFiles = [];
let cssAt = -1;
let inComment = false;

function flush() {
  if (!group) return;
  const code = group.files.map((f) => `/* ${f} */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n').join('');
  out[group.at] = `  <script src="${emit('app' + ++jsCount, 'js', code, 'js')}"></script>`;
  group = null;
}

for (const line of lines) {
  const js = line.match(LOCAL_SCRIPT);
  const css = !cssDone && line.match(LOCAL_CSS);
  if (js) {
    if (!group) { group = { at: out.length, files: [] }; out.push(''); }
    group.files.push(js[1]);
  } else if (css) {
    if (cssAt < 0) { cssAt = out.length; out.push(''); }
    cssFiles.push(css[1]);
  } else {
    // Dòng trống / chú thích giữa các script không cắt nhóm (bỏ đi); mọi dòng khác thì cắt nhóm
    const filler = inComment || /^\s*(<!--.*)?$/.test(line);
    if (/<!--/.test(line) && !/-->/.test(line)) inComment = true;
    else if (inComment && /-->/.test(line)) inComment = false;
    if (group && filler) continue;
    flush();
    if (/<\/head>/i.test(line)) cssDone = true;
    out.push(line);
  }
}
flush();

if (cssFiles.length) {
  const code = cssFiles.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  out[cssAt] = `  <link rel="stylesheet" href="${emit('style', 'css', code, 'css')}">`;
}

fs.writeFileSync(path.join(OUT, 'index.html'), out.join('\n'));
console.log(`Xong: dist/index.html (${cssFiles.length} CSS, ${lines.filter((l) => LOCAL_SCRIPT.test(l)).length} script -> ${jsCount} tệp JS)`);
