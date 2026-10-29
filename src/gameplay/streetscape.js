/**
 * PHỐ XÁ ĐÔ THỊ (dựng hình từ MapGen: map.blocks, map.canals, map.props.junctions / crossings)
 * - Vỉa hè lát gạch cao 15 cm quanh mỗi ô phố, bó vỉa đá (mép sáng + mặt đứng) bo tròn ở góc phố
 * - Mảng nhựa lòng ngã tư (lấp phần góc bo giữa 2 dải đường), vạch qua đường kẻ sọc + vạch dừng
 * - Kè kênh bê tông dựng đứng 2 bờ, lan can sắt dọc bờ, tường đầu cống ngầm ở 2 đầu kênh
 * Thuần hình (không va chạm): xe vẫn chạy theo lưới độ cao (bậc 15 cm không đáng kể với xích / bánh).
 * Hệ toạ độ / tỉ lệ như terrain.js (8 đơn vị = 1 m), độ cao lấy T.groundAtRaw.
 */
const Streetscape = (() => {
  const CURB_H = 1.2, CURB_W = 1.6;
  const hash = (n) => { let h = (n | 0) * 374761393 + 668265263; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // phong hoá vật liệu (src/gameplay/weathering.js; thiếu module thì giữ nguyên vật liệu)
  const WX = (m, preset, over) => typeof Weathering !== 'undefined' ? Weathering.apply(m, preset, over) : m;

  // ---- texture thủ tục
  const TEX = {};
  function canvasTex(key, w, h, draw) {
    if (TEX[key]) return TEX[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return (TEX[key] = t);
  }
  // hạt mặt gạch / bê tông lát vỉa hè: chỉ vân hạt + đốm (không kẻ viên — kiểu lát, viên, mạch dựng thủ tục trong walkShader)
  const grainTex = () => canvasTex('walkgrain', 256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const k = hash(i * 3 + 11), a = 0.08 + 0.14 * hash(i * 3 + 12);
      g.fillStyle = k < 0.5 ? `rgba(40,40,40,${a})` : `rgba(230,230,230,${a})`;
      g.fillRect(hash(i * 5 + 1) * w, hash(i * 5 + 2) * h, 1 + hash(i * 5 + 3) * 1.6, 1 + hash(i * 5 + 4) * 1.6);
    }
    for (let i = 0; i < 40; i++) {
      const x = hash(i * 7 + 900) * w, y = hash(i * 7 + 901) * h, r = 5 + hash(i * 7 + 902) * 18, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(60,60,60,0.18)'); gr.addColorStop(1, 'rgba(60,60,60,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  });
  // đất lòng ô gốc cây: đất sẫm, lá mục, cành khô, cỏ dại lún phún
  const soilTex = () => canvasTex('pitsoil', 256, 256, (g, w, h) => {
    g.fillStyle = '#3a2f25'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = hash(i * 7 + 3) < 0.6 ? 'rgba(20,15,10,0.3)' : 'rgba(110,95,75,0.25)'; g.fillRect(hash(i * 7 + 4) * w, hash(i * 7 + 5) * h, 1 + hash(i * 7 + 6) * 2.5, 1 + hash(i * 7 + 1) * 2.5); }
    const LEAF = ['rgba(120,80,35,0.9)', 'rgba(95,65,30,0.9)', 'rgba(140,110,50,0.85)', 'rgba(70,50,25,0.9)'];
    for (let i = 0; i < 260; i++) {
      const x = hash(i * 11 + 1) * w, y = hash(i * 11 + 2) * h, r = 3 + hash(i * 11 + 3) * 5;
      g.save(); g.translate(x, y); g.rotate(hash(i * 11 + 4) * 6.28); g.fillStyle = LEAF[Math.floor(hash(i * 11 + 5) * 4)];
      g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 6.2832); g.fill(); g.restore();
    }
    g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = hash(i * 13 + 7) * w, y = hash(i * 13 + 8) * h, a = hash(i * 13 + 9) * 6.28, l = 8 + hash(i * 13 + 10) * 20; g.strokeStyle = 'rgba(60,45,30,0.8)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 160; i++) {
      const x = hash(i * 17 + 1) * w, y = hash(i * 17 + 2) * h;
      g.strokeStyle = `rgba(${60 + hash(i * 17 + 3) * 40 | 0},${85 + hash(i * 17 + 4) * 40 | 0},30,0.85)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i * 17 + 5) - 0.5) * 6, y - 4 - hash(i * 17 + 6) * 7); g.stroke();
    }
  });
  // đồ gang đường phố, 4 ô 256 px (kênh alpha cắt hình): nắp hố ga tròn / nắp bể cáp vuông / song chắn rác miệng thu
  // nước / tấm ghi gốc cây; gờ nổi sáng hơn -> bumpMap cùng ảnh
  const metalAtlas = () => canvasTex('streetmetal', 512, 512, (g) => {
    const rust = (x0, y0, n, sd) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + 20 + hash(sd + i * 3) * 216, y = y0 + 20 + hash(sd + i * 3 + 1) * 216, r = 6 + hash(sd + i * 3 + 2) * 26, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(120,62,28,0.45)'); gr.addColorStop(1, 'rgba(120,62,28,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      for (let i = 0; i < 900; i++) { g.fillStyle = hash(sd + i * 5 + 7) < 0.5 ? 'rgba(15,14,12,0.25)' : 'rgba(170,160,145,0.12)'; g.fillRect(x0 + 10 + hash(sd + i * 5 + 8) * 236, y0 + 10 + hash(sd + i * 5 + 9) * 236, 1.5, 1.5); }
    };
    // 1. nắp hố ga tròn: vành khung, khe nắp, lưới gờ trám, 3 vòng gờ, 2 lỗ móc
    {
      const cx = 128, cy = 128;
      g.save(); g.beginPath(); g.arc(cx, cy, 116, 0, 6.2832); g.clip();
      g.fillStyle = '#5a5751'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#3b3935'; g.beginPath(); g.arc(cx, cy, 104, 0, 6.2832); g.fill();
      g.strokeStyle = '#1e1d1b'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 104, 0, 6.2832); g.stroke();
      g.save(); g.beginPath(); g.arc(cx, cy, 92, 0, 6.2832); g.clip();
      g.strokeStyle = '#64605a'; g.lineWidth = 5;
      for (let k = -200; k <= 200; k += 20) {
        g.beginPath(); g.moveTo(cx + k - 200, cy - 200); g.lineTo(cx + k + 200, cy + 200); g.stroke();
        g.beginPath(); g.moveTo(cx + k + 200, cy - 200); g.lineTo(cx + k - 200, cy + 200); g.stroke();
      }
      g.restore();
      g.strokeStyle = '#5d5a53'; g.lineWidth = 6; for (const r of [92, 60, 30]) { g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.stroke(); }
      g.fillStyle = '#121110'; for (const s of [-1, 1]) g.fillRect(cx + s * 76 - 7, cy - 4, 14, 8);
      rust(0, 0, 14, 100);
      g.restore();
    }
    // 2. nắp bể cáp vuông: khung bê tông, tấm thép gân chống trượt, 2 khe nhấc
    {
      const x0 = 268, y0 = 12, s = 232;
      g.save(); g.beginPath(); g.rect(x0, y0, s, s); g.clip();
      g.fillStyle = '#7d7a72'; g.fillRect(x0, y0, s, s);
      g.fillStyle = '#4a4742'; g.fillRect(x0 + 18, y0 + 18, s - 36, s - 36);
      g.strokeStyle = '#1b1a18'; g.lineWidth = 3; g.strokeRect(x0 + 18, y0 + 18, s - 36, s - 36);
      g.strokeStyle = '#6a665e';
      for (let yy = y0 + 30; yy < y0 + s - 36; yy += 16) for (let xx = x0 + 30; xx < x0 + s - 36; xx += 16) {
        g.beginPath(); if (((xx + yy) / 16) % 2 < 1) { g.moveTo(xx, yy); g.lineTo(xx + 9, yy + 9); } else { g.moveTo(xx + 9, yy); g.lineTo(xx, yy + 9); } g.stroke();
      }
      g.fillStyle = '#121110'; g.fillRect(x0 + s / 2 - 20, y0 + 40, 40, 8); g.fillRect(x0 + s / 2 - 20, y0 + s - 48, 40, 8);
      rust(256, 0, 10, 300);
      g.restore();
    }
    // 3. song chắn rác miệng thu nước: khung gang, khe tối vuông góc bó vỉa
    {
      g.save(); g.beginPath(); g.rect(10, 266, 236, 236); g.clip();
      g.fillStyle = '#3d3b37'; g.fillRect(10, 266, 236, 236);
      g.fillStyle = '#0b0a09'; for (let i = 0; i < 9; i++) g.fillRect(24 + i * 24, 290, 13, 188);
      g.strokeStyle = '#55524b'; g.lineWidth = 4; g.strokeRect(14, 270, 228, 228);
      rust(0, 256, 12, 500);
      g.restore();
    }
    // 4. tấm ghi gốc cây: gang vuông, lỗ gốc tròn, các vòng khe cung (khe thủng -> thấy đất lòng ô)
    {
      const cx = 384, cy = 384;
      g.save(); g.beginPath(); g.rect(266, 266, 236, 236); g.clip();
      g.fillStyle = '#34322e'; g.fillRect(266, 266, 236, 236);
      rust(256, 256, 12, 700);
      g.strokeStyle = '#4a4740'; g.lineWidth = 3; g.strokeRect(270, 270, 228, 228);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000'; g.strokeStyle = '#000';
      g.beginPath(); g.arc(cx, cy, 56, 0, 6.2832); g.fill();
      g.lineWidth = 7;
      for (let r = 72; r < 112; r += 14) for (let i = 0; i < 24; i++) { const a = i * 6.2832 / 24; g.beginPath(); g.arc(cx, cy, r, a + 0.05, a + 6.2832 / 24 - 0.07); g.stroke(); }
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx + sx * (86 + k * 9), cy + sy * 112); g.lineTo(cx + sx * 112, cy + sy * (86 + k * 9)); g.stroke(); }
      g.restore();
    }
  });
  // đá bó vỉa / bê tông kè: xám có hạt, đốm bẩn; nửa dưới (sát lòng đường / mặt nước) bẩn tối hơn
  const stoneTex = (key, base) => canvasTex(key + '2', 256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = hash(i * 5) < 0.55 ? 'rgba(30,30,30,0.12)' : 'rgba(255,255,255,0.07)';
      g.fillRect(hash(i * 5 + 1) * w, hash(i * 5 + 2) * h, 1 + hash(i * 5 + 3) * 1.5, 1 + hash(i * 5 + 4) * 1.5);
    }
    for (let i = 0; i < 18; i++) { const x = hash(i * 13) * w, y = hash(i * 13 + 1) * h, r = 6 + hash(i * 13 + 2) * 20, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,38,32,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(30,28,24,0.4)'; g.fillRect(x, 0, 1.5, h); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 1.5, 0, 1, h); }   // mạch nối đoạn bó vỉa / tấm kè
    const gr = g.createLinearGradient(0, h, 0, h * 0.4); gr.addColorStop(0, 'rgba(40,42,34,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, h * 0.4, w, h * 0.6);   // rêu / bụi bẩn chân bó vỉa, chân kè
  });
  // bẩn loang theo vùng rộng (toạ độ thế giới): vỉa hè / bó vỉa chỗ sạch chỗ bám bụi, phá ô texture lặp
  // paint: lớp sơn kẻ đường (vạch qua đường): hạt sơn lấm tấm, tróc mảng lộ nhựa sẫm, mép mòn
  function grime(m, k, paint) {
    // mức bẩn k là uniform (không nhúng vào mã shader): vỉa hè / bó vỉa / rãnh / hố cây dùng chung 1 chương trình
    const uK = { value: k };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGrK = uK;
      sh.vertexShader = 'varying vec3 vGrW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vGrW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vGrW;
uniform float uGrK;
float grH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float grN(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(grH(i), grH(i + vec2(1.0, 0.0)), u.x), mix(grH(i + vec2(0.0, 1.0)), grH(i + vec2(1.0, 1.0)), u.x), u.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 gp = vGrW.xz;
    float gn = grN(gp * 0.018) * 0.55 + grN(gp * 0.07 + 7.0) * 0.3 + grN(gp * 0.31 + 3.0) * 0.15;
    diffuseColor.rgb *= mix(vec3(1.0, 0.99, 0.96), vec3(0.62, 0.6, 0.55), smoothstep(0.3, 0.8, gn) * uGrK);
    // bỏ hoang: mạch gạch (chỗ tối trên texture) mọc rêu / cỏ theo vùng; vệt nước ố đen loang
    float lumG = dot(diffuseColor.rgb, vec3(0.333)), moss = smoothstep(0.5, 0.75, grN(gp * 0.05 + 40.0) * 0.7 + grN(gp * 0.4) * 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.21, 0.1), moss * (0.25 + 0.6 * (1.0 - smoothstep(0.2, 0.4, lumG))) * uGrK);
    diffuseColor.rgb *= 1.0 - 0.25 * smoothstep(0.62, 0.8, grN(gp * 0.09 + 90.0)) * uGrK;${paint ? `
    // (sơn mòn theo mảng lớn ~0,5-1 m, mép mềm, lộ nhựa sẫm chứ không đen kịt; hạt lấm tấm nhẹ — trước đây mảng tróc nhỏ
    // tần số cao đen đặc: vạch qua đường lốm đốm như da báo)
    diffuseColor.rgb *= 0.88 + 0.18 * (grH(floor(gp * 9.0)) * 0.6 + grN(gp * 2.0 + 5.0) * 0.4);
    float chip = smoothstep(0.6, 0.7, grN(gp * 0.55 + 31.0) * 0.6 + grN(gp * 2.1 + 2.0) * 0.3 + grN(gp * 7.0) * 0.1);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.128, 0.122) * (0.8 + 0.4 * grN(gp * 3.0)), chip * 0.85);` : ''}
  }`);
    };
    m.customProgramCacheKey = () => 'grime2' + (paint ? 'p' : '');
    return m;
  }

  // VỈA HÈ: viên lát dựng thủ tục theo toạ độ lát (uv = mét, trục theo cạnh 0 ô phố). Thuộc tính đỉnh wA = (cách mép trong
  // bó vỉa, cách mép đất lô, mức hạ dốc qua đường), wB = (kiểu lát, mức cỏ lấn). 4 kiểu: 0 gạch vuông 40 cm so le, 1 gạch
  // nem 24x12 so le, 2 tấm bê tông 1,25 m, 3 đá tấm 60 cm. Phong hoá thành phố bỏ hoang: mỗi viên tông riêng, viên lún /
  // chênh, nứt, mất viên lộ đất mọc cỏ (dày theo vùng xuống cấp); mạch vữa bụi mọc rêu; dải viền bê tông giáp đất lô; cát lá
  // mục dồn chân bó vỉa; cỏ lấn từ mép đất lô (mép không đều); lá rụng; gạch xúc giác vàng ở đáy dốc qua đường. Mạch, vát
  // mép, viên chênh tạo khối qua pháp tuyến tính giải tích từ độ dốc (wT: trục lát trong thế giới), nhoà dần ở xa
  function walkShader(m) {
    m.extensions = { derivatives: true };   // fwidth (WebGL1)
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec3 wA;\nattribute vec2 wB;\nattribute vec4 wT;\nvarying vec3 vWw;\nvarying vec3 vWA;\nvarying vec2 vWB;\nvarying vec4 vWT;\n' +
        sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWw = (modelMatrix * vec4(transformed, 1.0)).xyz; vWA = wA; vWB = wB; vWT = wT;');
      sh.fragmentShader = `varying vec3 vWw;
varying vec3 vWA;
varying vec2 vWB;
varying vec4 vWT;
vec3 wNw;
float wh1(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wn(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(wh1(i), wh1(i + vec2(1.0, 0.0)), u.x), mix(wh1(i + vec2(0.0, 1.0)), wh1(i + vec2(1.0, 1.0)), u.x), u.y); }
float wds(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return 6.0 * t * (1.0 - t) / (b - a); }   // đạo hàm smoothstep
` + sh.fragmentShader.replace('#include <map_fragment>', `
  {
    vec2 uv = vUv;
    float pat = vWB.x, green = vWB.y, dC = vWA.x * 0.125, dL = vWA.y * 0.125, ramp = vWA.z;   // khoảng cách theo mét
    vec2 sz = vec2(0.4); float stag = 0.5, jw = 0.006, slab = 0.0; vec3 base = vec3(0.44, 0.425, 0.4);
    if (pat > 0.5 && pat < 1.5) { sz = vec2(0.24, 0.12); jw = 0.004; base = vec3(0.45, 0.3, 0.24); }
    else if (pat > 1.5 && pat < 2.5) { sz = vec2(1.25); stag = 0.0; jw = 0.009; base = vec3(0.43, 0.42, 0.395); slab = 1.0; }
    else if (pat > 2.5) { sz = vec2(0.6); stag = 0.0; jw = 0.004; base = vec3(0.4, 0.4, 0.39); }
    vec2 q = uv / sz; float row = floor(q.y); q.x += stag * mod(row, 2.0);
    vec2 cell = floor(q), f = fract(q), em = min(f, 1.0 - f) * sz;
    float e = min(em.x, em.y);
    vec2 ne = em.x < em.y ? vec2(f.x < 0.5 ? 1.0 : -1.0, 0.0) : vec2(0.0, f.y < 0.5 ? 1.0 : -1.0);   // hướng e tăng (vào lòng viên)
    float fw = max(length(fwidth(uv)), 0.0005);                 // mét / điểm ảnh
    float nr = 1.0 - smoothstep(sz.y * 0.1, sz.y * 0.4, fw);     // gần: thấy rõ viên, xa: nhoà
    float fj = max(fw * 0.7, 0.002);
    vec2 wp = vWw.xz;
    float h1 = wh1(cell * 1.31 + 0.7), h2 = wh1(cell * 0.77 + 3.1), h3 = wh1(cell * 1.93 + 9.4), h4 = wh1(cell + 17.3);
    float zone = wn(wp * 0.012) * 0.6 + wn(wp * 0.05 + 4.0) * 0.4;   // vùng xuống cấp nặng
    float gr = texture2D(map, uv * 0.9).r;
    // dải viền bê tông 20 cm giáp đất lô (tấm bê tông không có)
    float edg = (1.0 - slab) * (1.0 - step(0.2, dL));
    vec3 col = base * (0.88 + 0.18 * h1) * vec3(1.0 + (h2 - 0.5) * 0.05, 1.0, 1.0 - (h2 - 0.5) * 0.05);
    col = mix(col, vec3(0.45, 0.44, 0.41) * (0.9 + 0.12 * h1), edg);
    col *= 0.8 + 0.4 * gr;
    float jt = (1.0 - smoothstep(jw, jw + fj, e)) * (1.0 - edg);
    jt = max(jt, (1.0 - slab) * (1.0 - smoothstep(0.004, 0.004 + fj, abs(dL - 0.2))));
    // khối: mạch lõm + vát mép viên -> độ dốc (theo mét lát) dọc hướng ne
    float jb = max(0.004, fw * 1.5), bw = max(0.02, fw * 2.0);
    vec2 gH = (0.05 * wds(jw, jw + jb, e) + 0.025 * wds(0.0, bw, e)) * ne * (1.0 - edg);
    // viên lún / chênh (nghiêng lệch)
    float sunk = step(h3, 0.06 + 0.25 * smoothstep(0.45, 0.85, zone)) * (1.0 - edg);
    vec2 tl = (vec2(wh1(cell + 5.5), wh1(cell + 8.8)) - 0.5) * 0.2;
    gH += sunk * tl / sz;
    col *= 1.0 - sunk * (0.06 + 0.1 * h2);
    // nứt chéo viên (tấm bê tông nứt nhiều, gạch nhỏ ít)
    if (h2 < (0.1 + 0.25 * zone + 0.3 * slab) * (sz.x > 0.3 ? 1.0 : 0.35)) {
      vec2 cd = normalize(vec2(wh1(cell + 2.2), wh1(cell + 6.1)) - 0.5 + 0.001);
      float d = abs(dot((f - 0.5 - (vec2(h1, h3) - 0.5) * 0.5) * sz, vec2(-cd.y, cd.x)) + (wn(q * 7.0) - 0.5) * 0.05 * sz.x);
      col *= 1.0 - (1.0 - smoothstep(0.0015, 0.0015 + fj, d)) * 0.5 * nr;
    }
    // mạch: vữa bụi, rêu lan ra mép viên (dày ở vùng ẩm, sát mép đất lô)
    float moss = smoothstep(0.35, 0.8, wn(wp * 0.07 + 20.0) * 0.7 + wn(wp * 0.45) * 0.3 + (1.0 - smoothstep(0.0, 1.0, dL)) * 0.35);
    float jm = (1.0 - smoothstep(jw, jw + 0.015 * moss + fj, e)) * (1.0 - edg);
    col = mix(col, mix(vec3(0.22, 0.2, 0.17), vec3(0.18, 0.21, 0.11), moss), max(jt, jm * moss) * mix(0.25, 0.8, nr));
    // mất viên: hố lộ đất / cát, cỏ mọc
    float miss = step(h4, 0.01 + 0.07 * smoothstep(0.55, 0.9, zone)) * (1.0 - edg) * step(0.1, dC);
    vec3 soilc = mix(vec3(0.24, 0.2, 0.15), vec3(0.2, 0.24, 0.11), smoothstep(0.4, 0.7, wn(wp * 0.8)));
    col = mix(col, soilc * (0.8 + 0.4 * gr), miss);
    gH *= 1.0 - miss;
    // gạch xúc giác (đáy dốc qua đường): vàng phai bám bẩn, chấm nổi
    float tac = step(0.62, ramp) * step(0.06, dC) * step(dC, 0.66);
    vec2 dq = fract(uv / 0.06) - 0.5; float dr = length(dq);
    col = mix(col, vec3(0.52, 0.45, 0.25) * (0.75 + 0.4 * gr) * (0.85 + 0.15 * h1) * mix(1.0, 0.72, wn(wp * 0.4 + 3.0)), tac);
    gH -= tac * 0.03 * wds(0.16, 0.24, dr) * dq / max(dr, 0.001) / 0.06;
    // cát + lá mục dồn chân bó vỉa (mép dải không đều)
    float cb = 1.0 - smoothstep(0.0, 0.18 + 0.5 * wn(wp * 0.1 + 7.0), dC);
    col = mix(col, mix(vec3(0.38, 0.33, 0.26), vec3(0.28, 0.24, 0.16), wn(wp * 0.9)) * (0.85 + 0.3 * gr), cb * 0.85);
    // cỏ lấn từ mép đất lô
    float ge = (0.15 + 0.7 * wn(wp * 0.05 + 13.0) + 0.3 * wn(wp * 0.35)) * (0.3 + 0.9 * green);
    float gk = 1.0 - smoothstep(ge * 0.35, ge, dL + (wn(wp * 0.6) - 0.5) * 0.2);
    col = mix(col, mix(vec3(0.18, 0.23, 0.1), vec3(0.29, 0.3, 0.15), wn(wp * 0.5 + 9.0)) * (0.8 + 0.4 * gr), gk * 0.92);
    gH *= 1.0 - gk;
    // lá rụng lác đác, to nhỏ khác nhau (dày ở chân bó vỉa / từng vùng)
    vec2 lc = floor(wp * 0.8), lp = fract(wp * 0.8) - 0.5 - (vec2(wh1(lc + 1.0), wh1(lc + 2.0)) - 0.5) * 0.5;
    float la = wh1(lc + 3.0) * 6.283, ls = 0.6 + 0.7 * wh1(lc + 6.0);
    vec2 lr = vec2(cos(la) * lp.x + sin(la) * lp.y, -sin(la) * lp.x + cos(la) * lp.y);
    float leaf = (1.0 - smoothstep(0.9, 1.0, length(lr / (vec2(0.26, 0.11) * ls)))) * step(wh1(lc + 4.0), 0.03 + 0.35 * cb + 0.2 * smoothstep(0.55, 0.85, wn(wp * 0.03 + 30.0)));
    col = mix(col, mix(vec3(0.32, 0.22, 0.12), vec3(0.25, 0.21, 0.12), wh1(lc + 5.0)), leaf * 0.8 * nr);
    // bẩn loang diện rộng, vệt nước ố, sẫm sát chân tường / mép lô
    float gn = wn(wp * 0.018) * 0.55 + wn(wp * 0.07 + 7.0) * 0.3 + wn(wp * 0.31 + 3.0) * 0.15;
    col *= mix(vec3(1.0), vec3(0.66, 0.63, 0.57), smoothstep(0.35, 0.85, gn));
    col *= 1.0 - 0.28 * smoothstep(0.62, 0.82, wn(wp * 0.09 + 90.0));
    col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.5, dL)) * (1.0 - gk);
    diffuseColor.rgb *= col;
    // pháp tuyến thế giới: mặt lát nằm ngang (đỉnh đều hướng lên), nghiêng theo độ dốc gH (mét lát -> 8 đv / m), nhoà ở xa
    gH *= nr * 0.125;
    wNw = normalize(vec3(0.0, 1.0, 0.0) - gH.x * vec3(vWT.x, 0.0, vWT.y) - gH.y * vec3(vWT.z, 0.0, vWT.w));
  }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize((viewMatrix * vec4(wNw, 0.0)).xyz);`);
    };
    m.customProgramCacheKey = () => 'walk2';
    return m;
  }

  // ---- lưới hình gom dần (vị trí, pháp tuyến, uv, màu) rồi đóng thành 1 mesh
  function Builder() {
    // mảng số thực cấp phát gấp đôi khi đầy (đỡ push mảng thường + chép đổi kiểu lúc đóng mesh: vỉa hè / bó vỉa vài trăm nghìn đỉnh)
    let cap = 1024, nv = 0, P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), UV = new Float32Array(cap * 2), C = new Float32Array(cap * 3);
    const I = [];
    const grow = () => {
      cap *= 2;
      const g = (a, k) => { const b = new Float32Array(cap * k); b.set(a); return b; };
      P = g(P, 3); N = g(N, 3); UV = g(UV, 2); C = g(C, 3);
    };
    return {
      v(x, y, z, u, w, nx, ny, nz, col) {
        if (nv === cap) grow();
        const i3 = nv * 3, i2 = nv * 2;
        P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z; N[i3] = nx; N[i3 + 1] = ny; N[i3 + 2] = nz;
        UV[i2] = u; UV[i2 + 1] = w; C[i3] = col[0]; C[i3 + 1] = col[1]; C[i3 + 2] = col[2];
        return nv++;
      },
      // tam giác tự quay đúng chiều theo pháp tuyến đã đặt ở đỉnh a (vật liệu 2 mặt lật pháp tuyến mặt sau -> mặt quay
      // ngược sẽ tối sẫm dù pháp tuyến đỉnh đúng)
      tri(a, b, c) {
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
        const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * N[a * 3] + ny * N[a * 3 + 1] + nz * N[a * 3 + 2] < 0) I.push(a, c, b); else I.push(a, b, c);
      },
      quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); },
      mesh(mat, name) {
        if (!I.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P.slice(0, nv * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(N.slice(0, nv * 3), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(UV.slice(0, nv * 2), 2));
        g.setAttribute('color', new THREE.BufferAttribute(C.slice(0, nv * 3), 3));
        g.setIndex(I);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.name = name; m.receiveShadow = true;
        return m;
      }
    };
  }

  // Viền bó vỉa bo tròn của 1 ô: điểm theo chiều quanh ô + pháp tuyến hướng vào trong; mỗi điểm biết thuộc cạnh / góc nào
  function outline(B) {
    const Q = B.curb, cx = B.cx, cz = B.cz, out = [];
    const walkMax = Math.max(...B.walk);
    for (let k = 0; k < 4; k++) {
      const C = Q[k], A = Q[(k + 3) % 4], D = Q[(k + 1) % 4];
      let ax = A[0] - C[0], az = A[1] - C[1], dx = D[0] - C[0], dz = D[1] - C[1];
      const la = Math.hypot(ax, az), ld = Math.hypot(dx, dz);
      ax /= la; az /= la; dx /= ld; dz /= ld;
      const th = Math.acos(Math.max(-1, Math.min(1, ax * dx + az * dz)));
      const r = Math.min(Math.max(B.r[k], walkMax + 6), 0.3 * Math.min(la, ld));
      const t = r / Math.tan(th / 2), bx = ax + dx, bz = az + dz, bl = Math.hypot(bx, bz) || 1;
      const ox = C[0] + bx / bl * r / Math.sin(th / 2), oz = C[1] + bz / bl * r / Math.sin(th / 2);   // tâm cung bo
      const p0 = [C[0] + ax * t, C[1] + az * t], p1 = [C[0] + dx * t, C[1] + dz * t];
      let a0 = Math.atan2(p0[1] - oz, p0[0] - ox), a1 = Math.atan2(p1[1] - oz, p1[0] - ox);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const n = Math.max(3, Math.ceil(Math.abs(da) * r / 6));
      for (let i = 0; i <= n; i++) {
        const a = a0 + da * i / n, x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r;
        out.push({ x, z, nx: (ox - x) / r, nz: (oz - z) / r, corner: k, edge: i === n ? k : (k + 3) % 4 });
      }
      // cạnh thẳng k (từ p1 tới tiếp điểm của góc k+1): chia mỗi ~12 đơn vị để bám địa hình
      const E = Q[(k + 1) % 4], F = Q[(k + 2) % 4];
      let ex = F[0] - E[0], ez = F[1] - E[1]; const le = Math.hypot(ex, ez); ex /= le; ez /= le;
      const ln = ld;
      let nx = -dz, nz = dx; if ((cx - C[0]) * nx + (cz - C[1]) * nz < 0) { nx = -nx; nz = -nz; }
      // độ dài phần thẳng = cạnh - t (góc này) - t' (góc kế), t' ước theo góc kế (tính lại ở vòng sau nên lấy gần đúng)
      const th2 = Math.acos(Math.max(-1, Math.min(1, -dx * ex - dz * ez)));
      const r2 = Math.min(Math.max(B.r[(k + 1) % 4], walkMax + 6), 0.3 * Math.min(ln, le)), t2 = r2 / Math.tan(th2 / 2);
      const segs = Math.max(1, Math.ceil((ln - t - t2) / 12));
      for (let i = 1; i < segs; i++) {
        const s = t + (ln - t - t2) * i / segs;
        out.push({ x: C[0] + dx * s, z: C[1] + dz * s, nx, nz, edge: k, straight: true });
      }
    }
    return out;
  }

  // ===== RÁC / THÙNG RÁC / BAO RÁC TRÊN VỈA HÈ (thành phố bỏ hoang nhiều năm) — chỉ hình (không va chạm), gộp vài mesh.
  // Đặt theo dải vỉa hè từng cạnh ô phố (giữa mép bó vỉa và mép đất xây dựng), tránh đèn / cột / cây / trạm xe buýt; mọi
  // ngẫu nhiên băm theo toạ độ -> mọi máy như nhau
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _nm = new THREE.Matrix3();
  function xf(x, y, z, rx, ry, rz, sx, sy, sz) { _e.set(rx, ry, rz); _q.setFromEuler(_e); _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); _nm.getNormalMatrix(_m4); return _m4; }
  // Khối 6 mặt lồi (8 đỉnh đã biến đổi, thứ tự: 4 đáy rồi 4 trên) VÁT CẠNH: mỗi mặt thu vào b, cạnh = dải vát (pháp tuyến
  // chuyển dần giữa 2 mặt), góc = tam giác (3 pháp tuyến) -> cạnh bắt sáng mềm như đồ thật, không sắc như cắt giấy.
  // Màu đỉnh mang độ khuất sáng (mặt dưới tối) cho đồ vật không có bóng đổ chi tiết
  const HEXF = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  function hexInto(Bd, col, c, b) {
    const ctr = c.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / 8);
    const FN = HEXF.map(F => {
      const n = new THREE.Vector3().subVectors(c[F[1]], c[F[0]]).cross(new THREE.Vector3().subVectors(c[F[3]], c[F[0]])).normalize();
      const fc = new THREE.Vector3(); for (const i of F) fc.add(c[i]); fc.multiplyScalar(0.25);
      if (n.dot(fc.sub(ctr)) < 0) n.negate();
      return n;
    });
    const shade = (n) => { const k = n.y < -0.5 ? 0.55 : n.y > 0.5 ? 1 : 0.84 + 0.1 * n.y; return [col[0] * k, col[1] * k, col[2] * k]; };
    // đỉnh thu vào của mặt f tại góc i (lùi b dọc 2 cạnh mặt kề góc)
    const IN = HEXF.map((F, f) => F.map((i, k) => {
      const p = c[i], a = c[F[(k + 3) % 4]], d = c[F[(k + 1) % 4]];
      const q = p.clone().addScaledVector(new THREE.Vector3().subVectors(a, p).normalize(), b).addScaledVector(new THREE.Vector3().subVectors(d, p).normalize(), b);
      const n = FN[f], uv = [[0, 0], [1, 0], [1, 1], [0, 1]][k];
      return Bd.v(q.x, q.y, q.z, uv[0], uv[1], n.x, n.y, n.z, shade(n));
    }));
    const at = (f, i) => IN[f][HEXF[f].indexOf(i)];
    for (let f = 0; f < 6; f++) Bd.quad(IN[f][0], IN[f][1], IN[f][2], IN[f][3]);
    // dải vát ở 12 cạnh: 2 mặt chung 2 đỉnh
    for (let f = 0; f < 6; f++) for (let g = f + 1; g < 6; g++) {
      const sh = HEXF[f].filter(i => HEXF[g].includes(i));
      if (sh.length !== 2) continue;
      const [i, j] = sh;
      Bd.quad(at(f, i), at(f, j), at(g, j), at(g, i));
    }
    // tam giác góc: 3 mặt chung 1 đỉnh
    for (let i = 0; i < 8; i++) { const fs3 = []; for (let f = 0; f < 6; f++) if (HEXF[f].includes(i)) fs3.push(f); Bd.tri(at(fs3[0], i), at(fs3[1], i), at(fs3[2], i)); }
  }
  // hộp đơn vị (tâm gốc) biến đổi theo _m4 hiện tại; bv: độ vát (đv), mặc định ~12% cạnh ngắn nhất, tối đa 0,35
  function boxInto(Bd, col, bv) {
    const c = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]].map(p => _v.set(p[0] / 2, p[1] / 2, p[2] / 2).applyMatrix4(_m4).clone());
    const m = Math.min(c[0].distanceTo(c[1]), c[0].distanceTo(c[3]), c[0].distanceTo(c[4]));
    hexInto(Bd, col, c, bv !== undefined ? bv : Math.min(0.35, m * 0.12));
  }
  function taperInto(Bd, col, w0, d0, w1, d1, h, z1 = 0, bv = 0.3) {
    const c = [[-w0, 0, -d0], [w0, 0, -d0], [w0, 0, d0], [-w0, 0, d0], [-w1, h, -d1 + z1], [w1, h, -d1 + z1], [w1, h, d1 + z1], [-w1, h, d1 + z1]].map(p => _v.set(p[0] / 2, p[1], p[2] / 2).applyMatrix4(_m4).clone());
    hexInto(Bd, col, c, bv);
  }
  // trụ đơn vị (bán kính 1, cao 1, đáy tại y = 0), nắp trên tuỳ chọn
  function cylInto(Bd, col, sides, cap) {
    const ring = (y) => { const out = []; for (let i = 0; i < sides; i++) { const a = i / sides * 6.2832; out.push([Math.cos(a), y, Math.sin(a)]); } return out; };
    const r0 = ring(0), r1 = ring(1), P = (p) => _v.set(p[0], p[1], p[2]).applyMatrix4(_m4).clone();
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides, am = (i + 0.5) / sides * 6.2832, n = _n.set(Math.cos(am), 0, Math.sin(am)).applyMatrix3(_nm).normalize();
      const sh = 0.75 + 0.25 * Math.max(0, Math.cos(am - 0.8)), c = [col[0] * sh, col[1] * sh, col[2] * sh];
      const a = P(r0[i]), b = P(r0[j]), d = P(r1[j]), e = P(r1[i]);
      Bd.quad(Bd.v(a.x, a.y, a.z, 0, 0, n.x, n.y, n.z, c), Bd.v(b.x, b.y, b.z, 1, 0, n.x, n.y, n.z, c), Bd.v(d.x, d.y, d.z, 1, 1, n.x, n.y, n.z, c), Bd.v(e.x, e.y, e.z, 0, 1, n.x, n.y, n.z, c));
    }
    if (cap) {
      const n = _n.set(0, 1, 0).applyMatrix3(_nm).normalize(), cc = P([0, 1, 0]), c0 = Bd.v(cc.x, cc.y, cc.z, 0.5, 0.5, n.x, n.y, n.z, col);
      for (let i = 0; i < sides; i++) { const a = P(r1[i]), b = P(r1[(i + 1) % sides]); Bd.tri(c0, Bd.v(a.x, a.y, a.z, 0, 0, n.x, n.y, n.z, col), Bd.v(b.x, b.y, b.z, 1, 0, n.x, n.y, n.z, col)); }
    }
  }
  // TÚI RÁC NILON ĐÃ BUỘC (cao ~1,6, bụng Ø ~2 đv; gốc = tâm đáy):
  // - Đồ bên trong chân thực: hộp góc cạnh, chai lọ ống trụ đâm căng mặt nilon, khối phồng hữu cơ và khe lõm
  // - Trọng lực & đè nén: đáy bè phẳng tịt xuống đất có vành nilon tràn viền; bụng dưới phình xệ với ngấn nếp chùng ngang
  // - Cổ thắt xoắn ốc, nút buộc cuộn chặt, vành miệng túi thừa bung xòe bèo lượn sóng và 2 tai quai xách mềm rũ
  function bagGeo(seed) {
    const B = Builder(), NA = 32, NP = 22;
    const h = (k) => hash(seed * 89 + k * 31);
    // nhiễu trơn tuần hoàn quanh vòng túi (u 0..1, n nút) / theo 2 chiều (u quanh vòng, v dọc thân) -> nếp nhăn lộn xộn,
    // không lặp đều như các sóng sin (sóng sin đều làm túi vằn sọc như tôn sóng)
    const sm = (f) => f * f * (3 - 2 * f);
    const pn = (u, n, k) => { const x = (((u % 1) + 1) % 1) * n, i = Math.floor(x), f = sm(x - i); return hash(k * 977 + i) * (1 - f) + hash(k * 977 + ((i + 1) % n)) * f; };
    const pn2 = (u, v, n, m, k) => { const y = v * m, j = Math.floor(y), f = sm(y - j); return pn(u, n, k + j * 13) * (1 - f) + pn(u, n, k + (j + 1) * 13) * f; };

    // Đồ vật bên trong túi đẩy căng màng nilon
    const items = [];
    // 3 khối hộp góc cạnh (vỏ hộp các tông, hộp xốp, sách báo chèn căng tạo góc cạnh sắc)
    for (let k = 0; k < 3; k++) {
      const a = h(k * 7 + 1) * 6.283, pY = 0.25 + 0.45 * h(k * 7 + 2);
      const rad = 0.55 + 0.3 * h(k * 7 + 3);
      items.push({
        type: 'box',
        cx: Math.cos(a) * rad, cy: pY * 1.5, cz: Math.sin(a) * rad,
        yaw: h(k * 7 + 4) * 3.14,
        sx: 0.24 + 0.18 * h(k * 7 + 5), sy: 0.22 + 0.16 * h(k * 7 + 6), sz: 0.25 + 0.18 * h(k * 7 + 7),
        str: 0.13 + 0.13 * h(k * 7 + 8)
      });
    }
    // 2 chai lọ / que dài hình trụ chọc xiên vào thành túi
    for (let k = 0; k < 2; k++) {
      const a = h(k * 5 + 30) * 6.283, pY = 0.3 + 0.4 * h(k * 5 + 31);
      items.push({
        type: 'cyl',
        cx: Math.cos(a) * 0.7, cy: pY * 1.5, cz: Math.sin(a) * 0.7,
        dir: [Math.cos(a + 0.5), 0.5, Math.sin(a + 0.5)],
        rad: 0.14 + 0.08 * h(k * 5 + 32),
        len: 0.45 + 0.25 * h(k * 5 + 33),
        str: 0.14 + 0.12 * h(k * 5 + 34)
      });
    }
    // 3 khối phồng mềm hữu cơ
    for (let k = 0; k < 3; k++) {
      const a = h(k * 4 + 50) * 6.283, pY = 0.2 + 0.6 * h(k * 4 + 51);
      items.push({
        type: 'lump',
        cx: Math.cos(a) * 0.75, cy: pY * 1.5, cz: Math.sin(a) * 0.75,
        rad: 0.35 + 0.2 * h(k * 4 + 52),
        str: 0.1 + 0.12 * h(k * 4 + 53)
      });
    }

    // Nghiêng lệch và độ lún tự nhiên do trọng lực
    const lean = [(h(40) - 0.5) * 0.32, (h(41) - 0.5) * 0.32];
    const sagMul = 0.88 + 0.24 * h(42);

    const G = [];
    for (let j = 0; j <= NP; j++) {
      const t = j / NP, row = [];
      let y = 0;
      if (t < 0.08) {
        y = 0.005 + 0.02 * (t / 0.08);
      } else {
        y = 0.025 + (t - 0.08) * 1.58 * sagMul;
      }

      // Biên dạng bán kính: đáy bè phẳng, vành đệm tràn viền, bụng dưới phình to, cổ thắt
      let baseR = 0;
      if (t < 0.08) {
        baseR = 0.82 + 0.15 * (1.0 - t / 0.08);
      } else if (t < 0.2) {
        const u = (t - 0.08) / 0.12;
        baseR = 0.82 + 0.26 * Math.sin(u * Math.PI * 0.5);
      } else if (t < 0.85) {
        const u = (t - 0.2) / 0.65;
        baseR = 1.08 * Math.cos(u * 1.35) ** 0.85;
      } else {
        const u = (t - 0.85) / 0.15;
        baseR = Math.max(0.085, 0.42 * (1.0 - u * 0.8));
      }

      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * 6.283185, ca = Math.cos(a), sa = Math.sin(a);
        let r = baseR;
        let pY = y;

        // 1. Tác động của đồ đạc bên trong đội lên thành túi
        const px = ca * r, pz = sa * r;
        for (const it of items) {
          if (it.type === 'box') {
            const dx = px - it.cx, dy = pY - it.cy, dz = pz - it.cz;
            const rx = dx * Math.cos(it.yaw) - dz * Math.sin(it.yaw);
            const rz = dx * Math.sin(it.yaw) + dz * Math.cos(it.yaw);
            const qx = Math.abs(rx) / it.sx, qy = Math.abs(dy) / it.sy, qz = Math.abs(rz) / it.sz;
            const dBox = Math.max(qx, qy, qz);
            if (dBox < 1.4) {
              const bWeight = Math.exp(-((dBox - 0.8) ** 2) * 4.0);
              r += it.str * bWeight;
            }
          } else if (it.type === 'cyl') {
            const dx = px - it.cx, dy = pY - it.cy, dz = pz - it.cz;
            const dot = dx * it.dir[0] + dy * it.dir[1] + dz * it.dir[2];
            const distSq = (dx * dx + dy * dy + dz * dz) - dot * dot;
            if (distSq < it.rad * it.rad * 2.5 && Math.abs(dot) < it.len) {
              r += it.str * Math.exp(-distSq / (it.rad * it.rad));
            }
          } else {
            const dSq = (px - it.cx) ** 2 + (pY - it.cy) ** 2 + (pz - it.cz) ** 2;
            if (dSq < it.rad * it.rad * 2.5) {
              r += it.str * Math.exp(-dSq / (it.rad * it.rad));
            }
          }
        }

        // 2. Ngấn nếp chùng ngang ở bụng dưới do tải trọng đè nén
        if (t > 0.12 && t < 0.55) {
          const sagT = Math.sin((t - 0.12) / 0.43 * Math.PI);
          const sagRoll = 0.045 * Math.sin(t * 26.0 + a * 2.0 + seed);
          r += sagRoll * sagT;
          pY -= 0.035 * Math.abs(sagRoll) * sagT;
        }

        // 3. Gân nếp kéo căng tụ dồn về cổ túi: nếp to nhỏ, dài ngắn không đều (nhiễu quanh vòng, xoắn nhẹ theo chiều cao)
        if (t > 0.45) {
          const gath = Math.min(1.0, (t - 0.45) / 0.42), u = i / NA + t * 0.08 * (h(52) - 0.5);
          const pl = pn(u, 7 + Math.floor(h(50) * 4), seed + 500) * 0.65 + pn(u, 17, seed + 600) * 0.35;
          r += (pl - 0.5) * 0.26 * gath * gath;
        }

        // 4. Nếp nhăn nhỏ lộn xộn khắp thân túi (nhiễu 2 chiều, 2 tầng)
        const microWrinkle = (pn2(i / NA, t, 9, 6, seed + 700) - 0.5) * 0.07 + (pn2(i / NA, t, 19, 13, seed + 800) - 0.5) * 0.035;
        r += microWrinkle * (t > 0.08 && t < 0.9 ? 1.0 : 0.3);

        // 5. Trọng lực làm nghiêng lệch thân túi
        const lx = lean[0] * pY * 0.45, lz = lean[1] * pY * 0.45;
        row.push(new THREE.Vector3(ca * r + lx, Math.max(0, pY), sa * r + lz));
      }
      G.push(row);
    }

    const top = G[NP][0].y;
    const nx = lean[0] * top * 0.45, nz = lean[1] * top * 0.45;

    // Tính pháp tuyến cho thân túi
    const V = G.map((row, j) => row.map((p, i) => {
      const pu = row[i === NA ? 1 : i + 1], pd = row[i === 0 ? NA - 1 : i - 1];
      const ru = G[Math.min(NP, j + 1)][i], rd = G[Math.max(0, j - 1)][i];
      const n = new THREE.Vector3().subVectors(pu, pd).cross(new THREE.Vector3().subVectors(ru, rd)).normalize();
      const out = new THREE.Vector3(p.x - nx, j === 0 ? -1 : (p.y - 0.7) * 0.35, p.z - nz);
      if (n.lengthSq() < 0.5) n.copy(out.normalize()); else if (n.dot(out) < 0) n.negate();
      const k = 0.82 + 0.18 * (j / NP) - 0.12 * Math.max(0, -n.y);
      return B.v(p.x, p.y, p.z, i / NA, j / NP, n.x, n.y, n.z, [k, k, k]);
    }));

    for (let j = 0; j < NP; j++) {
      for (let i = 0; i < NA; i++) {
        B.quad(V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]);
      }
    }

    // Đáy kín áp sàn
    const c0 = B.v(0, 0, 0, 0.5, 0.5, 0, -1, 0, [0.5, 0.5, 0.5]);
    for (let i = 0; i < NA; i++) B.tri(c0, V[0][i + 1], V[0][i]);

    // Cổ xoắn nghẹt: các vòng nilon túm lại và xoắn ốc
    const NN = 4, T0 = G[NP], tw = (h(60) < 0.5 ? 1 : -1) * (1.2 + 0.8 * h(61));
    let prev = T0.map(p => p);
    let neckTopY = top;
    for (let k = 1; k <= NN; k++) {
      const t = k / NN, rr = 1.0 - t * 0.65, ang = tw * t, ca = Math.cos(ang), sa = Math.sin(ang);
      neckTopY = top + t * 0.16;
      const ring = T0.map((p, i) => {
        const dx = p.x - nx, dz = p.z - nz;
        const pl = 1.0 + 0.45 * (pn(i / NA + t * 0.3, 7, seed + 900 + k) - 0.5) * t;
        return new THREE.Vector3(nx + (dx * ca - dz * sa) * rr * pl, neckTopY, nz + (dx * sa + dz * ca) * rr * pl);
      });
      const vv = (row, j) => row.map((p) => {
        const n = new THREE.Vector3(p.x - nx, 0.12, p.z - nz).normalize();
        const kk = 0.76 + 0.12 * j;
        return B.v(p.x, p.y, p.z, 0, 0, n.x, n.y, n.z, [kk, kk, kk]);
      });
      const A = vv(prev, 0), C = vv(ring, 1);
      for (let i = 0; i < NA; i++) B.quad(A[i], A[i + 1], C[i + 1], C[i]);
      prev = ring;
    }

    // Nút buộc: khối nilon xoắn tròn méo gập cuộn chặt
    const kr = 0.11 + 0.03 * h(62), ky = neckTopY + 0.08, NK = 10, KS = [];
    for (let j = 0; j <= 5; j++) {
      const ph = (j / 5) * Math.PI, row = [];
      for (let i = 0; i <= NK; i++) {
        const a = (i / NK) * 6.283185;
        const w = 1.0 + 0.22 * Math.sin(a * 3.0 + ph * 4.0 + seed) + 0.12 * Math.sin(a * 5.0 - seed);
        row.push(new THREE.Vector3(
          nx + Math.cos(a) * Math.sin(ph) * kr * 1.28 * w,
          ky - Math.cos(ph) * kr * 0.9 * w,
          nz + Math.sin(a) * Math.sin(ph) * kr * w
        ));
      }
      KS.push(row);
    }
    const KV = KS.map(row => row.map(p => {
      const n = new THREE.Vector3(p.x - nx, (p.y - ky) * 1.5, p.z - nz).normalize();
      return B.v(p.x, p.y, p.z, 0, 0, n.x, n.y, n.z, [0.85, 0.85, 0.85]);
    }));
    for (let j = 0; j < 5; j++) for (let i = 0; i < NK; i++) B.quad(KV[j][i], KV[j][i + 1], KV[j + 1][i + 1], KV[j + 1][i]);

    // Vành miệng nilon thừa bung xòe trên nút thắt: lượn sóng nhăn nheo tự nhiên
    if (h(65) < 0.75) {
      // (nhỏ, lệch về 1 phía, mép rách lởm chởm không đều — vành xòe tròn lượn sóng đều trông như bông hoa)
      const NF = 18, frillRings = [];
      const frillH = 0.08 + 0.06 * h(66), fa = h(68) * 6.283, fl = 0.45 + 0.4 * h(69);
      for (let j = 0; j <= 2; j++) {
        const t = j / 2, row = [];
        const fY = ky + kr * 0.5 + t * frillH;
        const fRad = 0.05 + t * (0.1 + 0.07 * h(67));
        for (let i = 0; i <= NF; i++) {
          const a = (i / NF) * 6.283185;
          const side = 1 + fl * Math.cos(a - fa);
          const ruffle = side * (1.0 + t * 0.7 * (pn(i / NF, 9, seed + 1000) - 0.5));
          const waveY = t * 0.06 * (pn(i / NF, 6, seed + 1100) - 0.5) - t * t * 0.05 * Math.max(0, Math.cos(a - fa));
          row.push(new THREE.Vector3(nx + Math.cos(a) * fRad * ruffle, fY + waveY, nz + Math.sin(a) * fRad * ruffle));
        }
        frillRings.push(row);
      }
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < NF; i++) {
          const p1 = frillRings[j][i], p2 = frillRings[j][i + 1], p3 = frillRings[j + 1][i + 1], p4 = frillRings[j + 1][i];
          const n = new THREE.Vector3().subVectors(p2, p1).cross(new THREE.Vector3().subVectors(p4, p1)).normalize();
          if (n.y < 0) n.negate();
          const cl = [0.92, 0.92, 0.92];
          B.quad(B.v(p1.x, p1.y, p1.z, 0, 0, n.x, n.y, n.z, cl), B.v(p2.x, p2.y, p2.z, 1, 0, n.x, n.y, n.z, cl), B.v(p3.x, p3.y, p3.z, 1, 1, n.x, n.y, n.z, cl), B.v(p4.x, p4.y, p4.z, 0, 1, n.x, n.y, n.z, cl));
          B.quad(B.v(p1.x, p1.y, p1.z, 0, 0, -n.x, -n.y, -n.z, cl), B.v(p4.x, p4.y, p4.z, 0, 1, -n.x, -n.y, -n.z, cl), B.v(p3.x, p3.y, p3.z, 1, 1, -n.x, -n.y, -n.z, cl), B.v(p2.x, p2.y, p2.z, 1, 0, -n.x, -n.y, -n.z, cl));
        }
      }
    }

    // 2 quai xách (tai túi): dải nilon mềm thắt nút rũ xuống sườn túi theo trọng lực
    for (const sd of [-1, 1]) {
      const ang = h(70 + sd) * 0.7 + (sd > 0 ? 0.35 : 3.0), L = 0.16 + 0.1 * h(71 + sd), Wb = 0.13;
      const ux = Math.cos(ang), uz = Math.sin(ang), Q = [];
      const nSeg = 5;
      for (let k = 0; k <= nSeg; k++) {
        const t = k / nSeg;
        const w = Wb * (1.0 - t * 0.42) * (k === nSeg ? 0.6 : 1.0);
        // tai buộc dựng chếch lên khỏi nút rồi gập rủ đầu (chìa ngang như 2 chân thì nút buộc trông như con bọ)
        const droop = t * L * 1.15 - t * t * 0.2;
        const out = t * L;
        const wr = 0.035 * Math.sin(t * 8.0 + sd * 3.5 + seed);
        const twistAng = t * 1.3 * sd;
        const tx = -uz * Math.cos(twistAng), tz = ux * Math.cos(twistAng), ty = Math.sin(twistAng) * 0.35;
        const cx = nx + ux * out, cy = ky + kr * 0.4 + droop, cz = nz + uz * out;
        Q.push([
          new THREE.Vector3(cx + tx * w, cy + ty * w + wr, cz + tz * w),
          new THREE.Vector3(cx - tx * w, cy - ty * w - wr, cz - tz * w)
        ]);
      }
      for (let k = 0; k < nSeg; k++) {
        const a = Q[k][0], b = Q[k][1], c = Q[k + 1][1], d = Q[k + 1][0];
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
        if (n.y < 0) n.negate();
        const cl = [0.88, 0.88, 0.88];
        B.quad(B.v(a.x, a.y, a.z, 0, 0, n.x, n.y, n.z, cl), B.v(b.x, b.y, b.z, 1, 0, n.x, n.y, n.z, cl), B.v(c.x, c.y, c.z, 1, 1, n.x, n.y, n.z, cl), B.v(d.x, d.y, d.z, 0, 1, n.x, n.y, n.z, cl));
        B.quad(B.v(a.x, a.y, a.z, 0, 0, -n.x, -n.y, -n.z, cl), B.v(d.x, d.y, d.z, 0, 1, -n.x, -n.y, -n.z, cl), B.v(c.x, c.y, c.z, 1, 1, -n.x, -n.y, -n.z, cl), B.v(b.x, b.y, b.z, 1, 0, -n.x, -n.y, -n.z, cl));
      }
    }
    return B.mesh(new THREE.MeshBasicMaterial(), '').geometry;
  }
  // bao rác (cũ, giữ cho tương thích): khối 20 mặt méo theo băm, đáy bẹt nằm trên mặt đất
  let ICO = null;
  function bagInto(Bd, col, seed) {
    if (!ICO) ICO = new THREE.IcosahedronGeometry(1, 2).toNonIndexed().attributes.position;
    const P = [], NN = [];
    for (let i = 0; i < ICO.count; i++) {
      const x = ICO.getX(i), y = ICO.getY(i), z = ICO.getZ(i), k = 0.88 + 0.22 * hash(Math.round((x * 3 + y * 5 + z * 7) * 10) + seed);
      // nilon xệ: phình ở dưới, thắt lại ở trên (túm buộc miệng), đáy bẹt
      const yy = Math.max(-0.6, y), bulge = 1.08 - 0.28 * Math.max(0, yy), neck = yy > 0.8 ? 0.35 : 1;
      _v.set(x * k * bulge * neck, yy * k + (yy > 0.8 ? 0.25 : 0), z * k * bulge * neck).applyMatrix4(_m4); P.push(_v.clone());
      // nếp nhăn nilon: pháp tuyến lệch theo vân nhiễu tần số cao (nếp gấp dọc, căng ở bụng túi)
      const wr = Math.sin(x * 9 + z * 4 + seed) * 0.22 + Math.sin(z * 11 - y * 6 + seed * 2) * 0.16;
      NN.push(_n.set(x * (0.85 + 0.3 * k) + wr, y < -0.55 ? -1 : y + wr * 0.3, z * (0.85 + 0.3 * k) - wr * 0.6).applyMatrix3(_nm).normalize().clone());
    }
    for (let i = 0; i < P.length; i += 3) {
      const a = P[i], b = P[i + 1], c = P[i + 2], na = NN[i], nb = NN[i + 1], nc = NN[i + 2];
      const sh = (n) => { const k = 0.7 + 0.3 * Math.max(0, n.y); return [col[0] * k, col[1] * k, col[2] * k]; };
      Bd.tri(Bd.v(a.x, a.y, a.z, 0, 0, na.x, na.y, na.z, sh(na)), Bd.v(b.x, b.y, b.z, 1, 0, nb.x, nb.y, nb.z, sh(nb)), Bd.v(c.x, c.y, c.z, 0, 1, nc.x, nc.y, nc.z, sh(nc)));
    }
  }
  // THÙNG NGẤM SŨNG NƯỚC, NÁT RỮA: 4 thành là lưới mềm (bìa ướt mất cứng): phần dưới phình xệ ra, mép trên võng sụp, vài
  // vết lõm, 1 thành thủng rách (lỗ mép lởm chởm); nắp sụp lún vào lòng thùng; màu đỉnh sẫm dần xuống chân (ngấm từ đáy)
  function soggyCarton(B, seed) {
    const L = 0.5, Wd = 0.36, H = 0.55, NU = 8, NV = 6;
    const h = (k) => hash(seed * 71 + k * 13);
    const base = [[-L, -Wd], [L, -Wd], [L, Wd], [-L, Wd]];
    const holeW = Math.floor(h(1) * 4), hu = 0.35 + 0.3 * h(2), hv = 0.3 + 0.25 * h(3);
    for (let k = 0; k < 4; k++) {
      const a = base[k], b = base[(k + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez), nx = ez / el, nz = -ex / el;
      const G = [];
      for (let j = 0; j <= NV; j++) {
        const row = [];
        for (let i = 0; i <= NU; i++) {
          const u = i / NU, v = j / NV, su = Math.sin(Math.PI * u);
          // mép trên võng giữa (ướt sụp), phần dưới phình ra (bìa nhão xệ), lõm ngẫu nhiên
          const top = H * (1 - 0.2 * su - 0.08 * h(10 + k));
          const bul = su * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (0.05 + 0.04 * h(20 + k)) * (1.2 - v * 0.6)
            - 0.04 * su * Math.exp(-((u - h(30 + k)) ** 2) * 30 - ((v - 0.6) ** 2) * 12);
          const x = a[0] + ex * u + nx * bul, z = a[1] + ez * u + nz * bul, y = top * v;
          row.push(new THREE.Vector3(x, y, z));
        }
        G.push(row);
      }
      // pháp tuyến theo lưới đã biến dạng, quay ra ngoài
      const V = G.map((row, j) => row.map((p, i) => {
        const pu = row[Math.min(NU, i + 1)], pd = row[Math.max(0, i - 1)], ru = G[Math.min(NV, j + 1)][i], rd = G[Math.max(0, j - 1)][i];
        const n = new THREE.Vector3().subVectors(pu, pd).cross(new THREE.Vector3().subVectors(ru, rd)).normalize();
        if (n.x * nx + n.z * nz < 0) n.negate();
        const v = j / NV, wet = 0.5 + 0.5 * v;   // ngấm từ đáy: chân sẫm
        return B.v(p.x, p.y, p.z, i / NU, v, n.x, n.y, n.z, [wet, wet * 0.98, wet * 0.95]);
      }));
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        // lỗ thủng rách trên 1 thành: bỏ ô trong vùng elip mép lởm chởm
        if (k === holeW) { const du = (i + 0.5) / NU - hu, dv = (j + 0.5) / NV - hv; if (du * du / 0.03 + dv * dv / 0.05 < 1 + (hash(seed + i * 7 + j * 3) - 0.5) * 0.9) continue; }
        B.quad(V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]);
      }
    }
    // đáy tối (thấy qua lỗ thủng)
    xf(0, 0.01, 0, 0, 0, 0, 2 * L - 0.02, 0.01, 2 * Wd - 0.02); boxInto(B, [0.2, 0.16, 0.12], 0.001);
    // 2 nắp dài sụp lún vào lòng (võng hình V), 1 nắp ngắn rũ xuống ngoài
    const tY = H * (1 - 0.2) - 0.02;
    for (const sz of [-1, 1]) { xf(0, tY - 0.06, sz * Wd * 0.5, sz * 0.32, 0, (h(40 + sz) - 0.5) * 0.15, 2 * L - 0.06, 0.012, Wd * 0.95); boxInto(B, [0.78, 0.74, 0.68], 0.002); }
    xf(L + 0.05, tY - 0.12, 0, 0, 0, -1.2, 0.3, 0.012, 2 * Wd - 0.06); boxInto(B, [0.7, 0.66, 0.6], 0.002);
  }
  // thùng các-tông theo kiểu (0 đóng, 1 mở nắp, 2 bẹp) — toạ độ gốc tâm đáy, cạnh dài theo x
  function carton(B, kind) {
    const L = 0.5, Wd = 0.36, H = kind === 2 ? 0.44 : 0.62, BV = 0.006, W = [1, 1, 1];
    const pt = (x, y, z) => { _v.set(x, y, z).applyMatrix4(_m4); return _v.clone(); };
    xf(0, 0, 0, 0, 0, 0, 1, 1, 1);
    // thân: 8 đỉnh, mặt trên võng giữa / sụp lệch (bẹp), thành bên phình nhẹ
    const sag = kind === 2 ? [0.0, -0.12, -0.2, -0.04] : [0, -0.015, -0.01, -0.02];
    const bul = kind === 2 ? 0.04 : 0.012;
    const c = [pt(-L, 0, -Wd), pt(L, 0, -Wd), pt(L, 0, Wd), pt(-L, 0, Wd),
      pt(-L - bul, H + sag[0], -Wd - bul), pt(L + bul, H + sag[1], -Wd - bul), pt(L + bul, H + sag[2], Wd + bul * (kind === 2 ? -3 : 1)), pt(-L - bul, H + sag[3], Wd + bul)];
    hexInto(B, W, c, BV);
    const topY = (x, z) => H + (kind === 2 ? -0.09 : -0.012) + (x > 0 ? (z > 0 ? sag[2] : sag[1]) : (z > 0 ? sag[3] : sag[0])) * 0.5;
    // nắp gập: tấm mỏng 0,012, bản lề ở mép miệng; ang: góc mở (0 = đóng phẳng)
    const flap = (cx, cz, along, len, wid, outX, outZ, ang, shade) => {
      const hy = topY(cx, cz);
      // tâm nắp lệch ra ngoài từ bản lề theo hướng mở; bản lề chạy theo trục 'along' (x hoặc z)
      const ox = outX * wid / 2 * Math.cos(ang), oz = outZ * wid / 2 * Math.cos(ang), oy = wid / 2 * Math.sin(ang);
      if (along === 'x') xf(cx + ox, hy + oy, cz + oz, -outZ * ang, 0, 0, len, 0.012, wid);
      else xf(cx + ox, hy + oy, cz + oz, 0, 0, outX * ang, wid, 0.012, len);
      boxInto(B, [shade, shade * 0.97, shade * 0.93], 0.002);
    };
    if (kind === 0) {
      // đóng: 2 nắp dài úp khít giữa (khe dọc x), băng keo dọc khe + vắt xuống 2 đầu
      flap(0, -Wd, 'x', 2 * L, Wd, 0, -1, Math.PI - 0.03, 0.96);
      flap(0, Wd, 'x', 2 * L, Wd, 0, 1, Math.PI - 0.05, 0.98);
      xf(0, topY(0, 0) + 0.014, 0, 0, 0, 0, 2 * L + 0.02, 0.006, 0.1); boxInto(B, [0.78, 0.6, 0.36], 0.001);
      for (const sx of [-1, 1]) { xf(sx * (L + 0.006), H * 0.82, 0, 0, 0, 0, 0.006, H * 0.36, 0.1); boxInto(B, [0.78, 0.6, 0.36], 0.001); }
    } else if (kind === 1) {
      // mở: nắp dài vểnh ra 2 bên lệch góc, nắp ngắn: 1 đứng, 1 rủ xuống; lòng thùng tối
      xf(0, H - 0.02, 0, 0, 0, 0, 2 * L - 0.03, 0.004, 2 * Wd - 0.03); boxInto(B, [0.18, 0.15, 0.11], 0.001);
      // nắp dài: 1 vểnh xiên ~65°, 1 mở rộng ~40°; nắp ngắn: 1 gần đứng, 1 rủ xuống ngoài (gãy nếp) — hình chữ V không đè nhau
      flap(0, -Wd, 'x', 2 * L - 0.02, Wd * 0.97, 0, -1, 1.13, 0.92);
      flap(0, Wd, 'x', 2 * L - 0.02, Wd * 0.97, 0, 1, 0.72, 0.95);
      flap(-L, 0, 'z', 2 * Wd - 0.04, Wd * 0.9, -1, 0, 1.45, 0.9);
      flap(L, 0, 'z', 2 * Wd - 0.04, Wd * 0.9, 1, 0, -1.05, 0.86);
      // băng keo đứt còn dính 1 đoạn trên nắp
      xf(0.2, H + 0.01, -Wd - 0.12, 0.35, 0, 0, 0.3, 0.006, 0.1); boxInto(B, [0.78, 0.6, 0.36], 0.001);
    } else {
      // bẹp: nắp dài sụp vào trong theo mặt trên lệch, 1 nắp ngắn bung vểnh
      // bẹp: 2 nắp dài sụp lõm vào lòng thùng theo mặt trên lệch, 1 nắp ngắn bung vểnh lên
      flap(0, -Wd, 'x', 2 * L, Wd, 0, -1, Math.PI + 0.16, 0.9);
      flap(0, Wd, 'x', 2 * L, Wd, 0, 1, Math.PI + 0.3, 0.86);
      flap(L, 0, 'z', 2 * Wd - 0.04, Wd * 0.9, 1, 0, 0.85, 0.84);
    }
  }
  // LON / CHAI: tiện tròn theo biên dạng (r, y) rồi biến dạng từng đỉnh: lõm cục bộ (bị bóp / đá), nén dọc thành nếp gấp
  // (bị giẫm), dẹt (bị cán); pháp tuyến tính lại theo lưới sau biến dạng -> nếp móp bắt sáng thật. col(y, a): màu theo
  // độ cao / góc (nhãn in, viền bạc, nắp). Đơn vị 8 đv = 1 m; gốc = tâm đáy, trục y
  function latheGeo(prof, segs, col, dent) {
    const B = Builder(), rings = prof.length, P = [];
    for (let i = 0; i < rings; i++) {
      const row = [];
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * 6.2832;
        let [r, y] = prof[i];
        if (dent) [r, y] = dent(r, y, a);
        row.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      P.push(row);
    }
    if (dent && dent.flat) for (const row of P) for (const p of row) { p.x *= dent.flat; p.z *= 1 + (1 - dent.flat) * 0.45; }
    const ctrY = prof.reduce((m, p) => m + p[1], 0) / rings;
    const V = P.map((row, i) => row.map((p, j) => {
      const pu = row[Math.min(segs, j + 1)], pd = row[Math.max(0, j - 1)], ru = P[Math.min(rings - 1, i + 1)][j], rd = P[Math.max(0, i - 1)][j];
      const n = new THREE.Vector3().subVectors(pu, pd).cross(new THREE.Vector3().subVectors(ru, rd)).normalize();
      const out = new THREE.Vector3(p.x, (p.y - ctrY) * 0.3, p.z);
      if (n.lengthSq() < 0.5) n.copy(out.lengthSq() > 1e-6 ? out.normalize() : new THREE.Vector3(0, Math.sign(p.y - ctrY) || 1, 0));
      else if (n.dot(out) < 0) n.negate();
      const c = col(prof[i][1], j / segs * 6.2832, i);
      return B.v(p.x, p.y, p.z, j / segs, i / (rings - 1), n.x, n.y, n.z, c);
    }));
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segs; j++) B.quad(V[i][j], V[i][j + 1], V[i + 1][j + 1], V[i + 1][j]);
    return B.mesh(new THREE.MeshBasicMaterial(), '').geometry;
  }
  // lon nhôm 330 ml (Ø 6,6 cm x 12,2 cm): đáy vòm lõm, thân, vai thắt, viền miệng, nắp lõm (khoen mở dựng riêng)
  const CAN_PROF = [[0, 0.06], [0.17, 0.035], [0.215, 0], [0.255, 0.04], [0.265, 0.1], [0.265, 0.3], [0.265, 0.5], [0.265, 0.7], [0.265, 0.86], [0.245, 0.92], [0.22, 0.955], [0.222, 0.975], [0.205, 0.968], [0, 0.955]];
  const PET_PROF = [[0, 0.02], [0.2, 0], [0.265, 0.05], [0.27, 0.2], [0.262, 0.45], [0.27, 0.7], [0.27, 0.95], [0.235, 1.12], [0.16, 1.3], [0.105, 1.42], [0.1, 1.5], [0.125, 1.51], [0.125, 1.62], [0.11, 1.65], [0, 1.65]];
  const GLASS_PROF = [[0, 0.04], [0.26, 0], [0.3, 0.06], [0.3, 0.5], [0.3, 1.0], [0.27, 1.16], [0.17, 1.34], [0.125, 1.46], [0.12, 1.72], [0.14, 1.75], [0.135, 1.85], [0, 1.85]];
  const CAN_BRAND = [[0.62, 0.06, 0.06], [0.08, 0.16, 0.5], [0.06, 0.3, 0.12], [0.75, 0.55, 0.06], [0.08, 0.08, 0.09], [0.55, 0.55, 0.58]];
  function bottleProtos() {
    const out = [];
    const silver = [0.66, 0.66, 0.68];
    for (let v = 0; v < 24; v++) {
      const h = (k) => hash(v * 97 + k * 13 + 5), brand = CAN_BRAND[v % CAN_BRAND.length], fade = 0.7 + 0.3 * h(1);
      const stripe = h(2);
      // kiểu móp: 0 lõm 1-2 chỗ, 1 nén dọc (giẫm) thành nếp, 2 dẹt (cán), 3 gần nguyên
      const mode = v < 6 ? 0 : v < 12 ? 1 : v < 18 ? 2 : 3;
      const dents = [0, 1].map(k => ({ a: h(3 + k) * 6.28, y: 0.25 + 0.5 * h(5 + k), d: 0.06 + 0.1 * h(7 + k), w: 0.12 + 0.12 * h(9 + k) })).slice(0, h(11) < 0.5 ? 1 : 2);
      const crush = mode === 1 ? 0.25 + 0.3 * h(12) : 0;
      const dent = (r, y, a) => {
        if (r < 0.1) return [r, y * (1 - crush)];
        let rr = r;
        if (mode === 0 || mode === 2) for (const D of dents) { const da = Math.atan2(Math.sin(a - D.a), Math.cos(a - D.a)); rr -= D.d * Math.exp(-(da * da) / (D.w * 3) - ((y - D.y) * (y - D.y)) / (D.w * D.w * 0.6)); }
        if (mode === 1) rr *= 1 + crush * 0.5 * (0.5 + 0.5 * Math.sin(a * 6 + y * 26 + v)) * Math.sin(Math.PI * Math.min(1, y / 0.96));   // nếp gấp nén dọc
        rr *= 1 + 0.015 * Math.sin(a * 3 + y * 9 + v);   // vỏ nhôm không tròn đều
        return [rr, y * (1 - crush)];
      };
      if (mode === 2) dent.flat = 0.32 + 0.15 * h(13);
      const col = (y, a, i) => {
        if (y < 0.1 || y > 0.88) return silver;
        const band = stripe < 0.5 ? (Math.abs(y - 0.5) < 0.06 ? 1 : 0) : (Math.sin(a * 2 + y * 6) > 0.6 ? 1 : 0);
        const c = band ? [0.85, 0.83, 0.78] : brand;
        // sơn trầy lộ nhôm + bẩn
        const sc = hash(Math.round(a * 40) + Math.round(y * 60) * 7 + v) < 0.12 ? 1 : 0;
        return sc ? silver : c.map(x => x * fade);
      };
      out.push({ kind: 'can', geo: latheGeo(CAN_PROF, 14, col, dent), r: mode === 2 ? 0.1 : 0.26, flat: mode === 2 });
    }
    for (let v = 0; v < 6; v++) {
      const h = (k) => hash(v * 131 + k * 17 + 9), cap = [[0.1, 0.25, 0.6], [0.85, 0.85, 0.85], [0.6, 0.1, 0.1], [0.1, 0.45, 0.15]][v % 4];
      const lab = [[0.8, 0.2, 0.15], [0.15, 0.35, 0.7], [0.9, 0.9, 0.85], [0.2, 0.55, 0.25]][(v + 1) % 4];
      const crush = h(1) < 0.6, da = h(2) * 6.28;
      const dent = (r, y, a) => { if (!crush || r < 0.12) return [r, y]; const d = Math.atan2(Math.sin(a - da), Math.cos(a - da)); return [r * (1 - 0.45 * Math.exp(-d * d * 1.6 - (y - 0.6) * (y - 0.6) * 4)) * (1 + 0.04 * Math.sin(a * 5 + y * 20)), y]; };
      out.push({ kind: 'pet', geo: latheGeo(PET_PROF, 14, (y) => y > 1.48 ? cap : (y > 0.45 && y < 0.85 ? lab : [0.72, 0.8, 0.84]), dent), r: 0.26 });
    }
    for (let v = 0; v < 4; v++) {
      const glass = v % 2 ? [0.28, 0.16, 0.06] : [0.1, 0.3, 0.12], lab = [0.82, 0.76, 0.6];
      out.push({ kind: 'glass', geo: latheGeo(GLASS_PROF, 14, (y) => y > 0.35 && y < 0.75 ? lab : y > 1.76 ? [0.6, 0.55, 0.3] : glass), r: 0.29 });
    }
    return out;
  }
  // mẫu hình đồ vật (toạ độ gốc: tâm đáy, y lên); màu thật đặt theo từng bản (instanceColor), mẫu chỉ mang độ sáng tối
  function junkProtos() {
    const mk = (fn) => { const B = Builder(); fn(B); const m = B.mesh(new THREE.MeshBasicMaterial(), ''); return m.geometry; };
    const W = [1, 1, 1];
    return {
      // thùng rác nhựa có bánh xe 240 L (0,58 x 0,73 x 1,07 m — 8 đv = 1 m): thân thuôn nhỏ xuống đáy, gân dọc 2 sườn,
      // viền miệng dày, lòng thùng tối (thấy khi mất / bật nắp), bản lề + tay kéo ngang phía sau (-z), 2 bánh xe sau có
      // trục & vè che bánh, chân đế nhựa phía trước. Nắp là mẫu riêng (bật mở / văng khi trúng nổ)
      bin: mk(B => {
        xf(0, 0.6, 0, 0, 0, 0, 1, 1, 1); taperInto(B, W, 4.0, 4.9, 4.6, 5.8, 7.8, -0.25);
        xf(0, 8.1, -0.15, 0, 0, 0, 1, 1, 1); taperInto(B, [0.85, 0.85, 0.85], 4.75, 5.95, 4.8, 6.0, 0.35);    // viền miệng
        xf(0, 8.4, -0.15, 0, 0, 0, 1, 1, 1); taperInto(B, [0.08, 0.08, 0.08], 4.4, 5.6, 4.4, 5.6, 0.02);      // lòng thùng
        for (const sx of [-1, 1]) for (const zz of [-1.6, 0, 1.6]) { xf(sx * 2.2, 4.6, zz - 0.1, 0, 0, 0, 0.25, 6.4, 0.5); boxInto(B, [0.82, 0.82, 0.82]); }   // gân sườn
        xf(0, 7.1, -3.15, 0, 0, 0, 4.2, 1.2, 0.7); boxInto(B, [0.8, 0.8, 0.8]);                               // khối bản lề
        xf(0, 7.6, -3.65, 0, 0, Math.PI / 2, 0.35, 4.6, 0.35); _m4.multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)); cylInto(B, [0.7, 0.7, 0.7], 6, false);   // tay kéo
        for (const sx of [-1, 1]) {
          xf(sx * 2.2, 1.0, -2.3, 0, 0, Math.PI / 2, 1.0, 0.6, 1.0); _m4.multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)); cylInto(B, [0.07, 0.07, 0.07], 10, true);   // bánh xe
          xf(sx * 2.2, 1.0, -2.3, 0, 0, Math.PI / 2, 0.45, 0.66, 0.45); _m4.multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)); cylInto(B, [0.35, 0.35, 0.35], 6, true);   // mâm
          xf(sx * 2.05, 2.0, -2.3, 0, 0, 0, 0.5, 1.4, 2.6); boxInto(B, [0.8, 0.8, 0.8]);                      // vè
        }
        xf(0, 1.0, -2.3, 0, 0, Math.PI / 2, 0.22, 4.4, 0.22); _m4.multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)); cylInto(B, [0.2, 0.2, 0.2], 6, false);   // trục
        xf(0, 0.3, 1.9, 0, 0, 0, 3.2, 0.6, 0.9); boxInto(B, [0.75, 0.75, 0.75]);                              // chân đế trước
      }),
      // nắp: tấm phẳng phủ hết miệng, gờ trước cầm tay, 2 gân trên mặt; gốc = tâm mặt dưới
      binLid: mk(B => {
        xf(0, 0.18, 0, 0, 0, 0, 5.0, 0.36, 6.2); boxInto(B, W);
        xf(0, -0.15, 3.05, 0, 0, 0, 4.6, 0.7, 0.3); boxInto(B, [0.85, 0.85, 0.85]);
        for (const xx of [-1.2, 1.2]) { xf(xx, 0.42, 0, 0, 0, 0, 0.4, 0.14, 5.4); boxInto(B, [0.9, 0.9, 0.9]); }
      }),
      // thùng rác lớn (container 1,8 x 1,2 x 1,3 m): thân + gân thép 2 sườn + thanh móc nâng + 4 bánh; nắp (đóng / bật mở)
      dump: mk(B => {
        xf(0, 5.2, 0, 0, 0, 0, 14, 9, 9); boxInto(B, W);
        for (const sg of [-1, 1]) for (let q = -2; q <= 2; q++) { xf(q * 2.6, 5.2, sg * 4.65, 0, 0, 0, 0.5, 8.6, 0.4); boxInto(B, [0.8, 0.8, 0.8]); }
        for (const sg of [-1, 1]) { xf(sg * 7.2, 7, 0, 0, 0, 0, 0.5, 1, 7); boxInto(B, [0.15, 0.15, 0.15]); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { xf(sx * 5.5, 0, sz * 3.4, Math.PI / 2, 0, 0, 0.9, 0.6, 0.9); cylInto(B, [0.1, 0.1, 0.1], 8, true); }
        xf(0, 0.6, 0, 0, 0, 0, 13, 1.2, 8); boxInto(B, [0.15, 0.15, 0.15]);
        xf(0, 9.9, 0, 0.05, 0, 0, 14.4, 0.5, 9.4); boxInto(B, [0.18, 0.19, 0.18]);
      }),
      // bao rác nilon: 3 dạng méo khác nhau (bán kính ~1, cao ~1.6)
      bag0: bagGeo(3), bag1: bagGeo(17), bag2: bagGeo(41), bag3: bagGeo(58),
      // thùng các-tông (cạnh 1): nắp gập hé
      // THÙNG CÁC-TÔNG (cạnh dài 1, rộng 0,72, cao 0,62): bìa sóng cạnh gần sắc (chỉ vát 0,006), thân méo nhẹ (mặt trên võng,
      // thành phình), 4 nắp gập (2 nắp dài theo cạnh dài, 2 nắp ngắn), mép nắp nhạt (lộ lớp sóng), băng keo nâu dọc khe nắp
      // vắt xuống 2 đầu. box: đóng kín dán keo · boxOpen: nắp vểnh lệch, lộ lòng thùng tối · boxCrushed: bị giẫm / ngấm
      // nước sụp lệch, 1 thành lõm
      box: mk(B => carton(B, 0)),
      boxOpen: mk(B => carton(B, 1)),
      boxCrushed: mk(B => soggyCarton(B, 7)),
      // mảnh rác (giấy / nilon) văng ra khi túi rách: tấm phẳng 1 x 1
      scrap: mk(B => { const up = [0, 1, 0]; const p = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, w]) => B.v(u, 0, w, 0, 0, ...up, W)); B.quad(p[0], p[1], p[2], p[3]); })
    };
  }
  // thùng nhựa: xanh lá, xám, xanh dương, đen, nâu (bạc màu); nắp có khi khác màu (vàng tái chế, xanh)
  const BIN_COL = [[0.16, 0.3, 0.18], [0.16, 0.3, 0.18], [0.3, 0.31, 0.32], [0.12, 0.2, 0.36], [0.07, 0.07, 0.08], [0.3, 0.2, 0.12]];
  const LID_ALT = [[0.6, 0.48, 0.1], [0.12, 0.2, 0.36], [0.07, 0.07, 0.08]];
  // túi rác: đen tuyền bóng sâu, đen than chì, xanh rác đô thị dày, xanh đen công nghiệp, vàng tái chế, xám trắng đục
  const BAG_COL = [[0.015, 0.016, 0.018], [0.024, 0.025, 0.028], [0.018, 0.048, 0.052], [0.022, 0.038, 0.068], [0.24, 0.21, 0.08], [0.15, 0.16, 0.17]];
  const DUMP_COL = [[0.14, 0.3, 0.2], [0.18, 0.28, 0.42], [0.36, 0.2, 0.12]];
  // rác cũ: giấy ố vàng / bạc màu, bìa ngấm nước, nilon bạc màu (không còn màu tươi)
  const LIT = [[0.5, 0.48, 0.42], [0.46, 0.42, 0.33], [0.36, 0.28, 0.18], [0.36, 0.25, 0.21], [0.24, 0.27, 0.31], [0.26, 0.2, 0.13], [0.22, 0.2, 0.15]];
  // sức nổ tác động đồ vật nhẹ: [bán kính, sức đẩy] (cùng thang với EnvDamage AMMO)
  const JUNK_BLAST = { NORMAL: [20, 1.0], HE: [28, 1.6], RPG: [12, 0.7], ANTI_TANK_MISSILE: [17, 1.3], CLUSTER: [18, 0.6], CLUSTER_SUBMUNITION: [9, 0.35], AP: [3, 0.25], INCENDIARY: [4, 0.08], GATLING_BULLET: [3, 0.06], INCENDIARY_HMG: [2, 0.04], SCOUT_BULLET: [1.5, 0.03], MG762: [1.2, 0.01] };
  // khối lượng tương đối (đẩy nhẹ bay xa) & thông số rơi
  // ht: chiều cao vật đứng (đv, nhân it.s) cho phép thử đạn bắn thẳng
  const JK = { bin: { m: 1, half: 2.4, ht: 9.5 }, binLid: { m: 0.3, half: 0.3, ht: 1 }, dump: { m: 9, half: 5, ht: 11 }, bag0: { m: 0.5, half: 0.6, ht: 1.4 }, bag1: { m: 0.5, half: 0.6, ht: 1.4 }, bag2: { m: 0.5, half: 0.6, ht: 1.4 }, bag3: { m: 0.5, half: 0.6, ht: 1.4 }, box: { m: 0.25, half: 0.4, ht: 1 }, boxOpen: { m: 0.2, half: 0.4, ht: 1 }, boxCrushed: { m: 0.2, half: 0.3, ht: 0.4 }, scrap: { m: 0.05, half: 0.02, ht: 0.05 } };
  // đạn bắn thẳng (không nổ): mức hư hại mỗi viên trúng vật
  const BULLET_HIT = { AP: 1, GATLING_BULLET: 0.35, INCENDIARY_HMG: 0.3, SCOUT_BULLET: 0.15, MG762: 0.05 };

  // CẮT RÁC THEO KHOẢNG CÁCH: rác vẽ theo ô JUNK_CH x JUNK_CH (mỗi loại một InstancedMesh / ô), ô cách camera quá tầm
  // của loại đó (đơn vị game, 8 = 1 m) thì ẩn — bao rác / lon cao < 1 m, ngoài ~130 m còn 1-2 điểm ảnh
  const JUNK_CH = 600;
  const JUNK_LOD = { bag0: 1100, bag1: 1100, bag2: 1100, bag3: 1100, box: 1100, boxOpen: 1100, boxCrushed: 1100, bin: 1700, binLid: 1700, dump: 2600, can: 800 };
  // list: [{ im, x, z, R2 }] — key 'cx:cz' của ô, R: tầm nhìn thấy của loại đồ vật
  // + CẮT THEO KHUNG NHÌN (mỗi khung): InstancedMesh của ô để frustumCulled = false (khối bao r128 sai) -> trước đây ô sau
  // lưng camera vẫn vẽ (~600 lượt vẽ + lượt bóng). Hộp ô nới CULL_PAD mỗi phía (bóng thùng rác ngay sau lưng vẫn đổ vào
  // khung hình), cao -1000..3000 (ô trên đồi / dốc). Tầm xa giữ nguyên
  const CULL_PAD = 80;
  function lodCell(list, im, key, R) {
    const [cx, cz] = key.split(':').map(Number), r = R + JUNK_CH * 0.71;
    const box = new THREE.Box3(new THREE.Vector3(cx * JUNK_CH - CULL_PAD, -1000, cz * JUNK_CH - CULL_PAD), new THREE.Vector3((cx + 1) * JUNK_CH + CULL_PAD, 3000, (cz + 1) * JUNK_CH + CULL_PAD));
    list.push({ im, x: (cx + 0.5) * JUNK_CH, z: (cz + 0.5) * JUNK_CH, R2: r * r, near: true, box });
  }
  function lodUpdate(list, p) {
    for (const L of list) {
      const dx = p.x - L.x, dz = p.z - L.z, dy = p.y - 20;
      L.near = dx * dx + dz * dz + dy * dy < L.R2;
    }
  }
  const _cullFr = new THREE.Frustum(), _cullM = new THREE.Matrix4();
  function frustumOf(cam) {
    cam.updateMatrixWorld();
    return _cullFr.setFromProjectionMatrix(_cullM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  }
  function viewUpdate(list, fr) {
    for (const L of list) L.im.visible = L.near && fr.intersectsBox(L.box);
  }

  // ===== RÁC / THÙNG RÁC / BAO RÁC TRÊN VỈA HÈ (thành phố bỏ hoang nhiều năm). Thùng rác, container, bao rác, thùng các-tông
  // là vật riêng (InstancedMesh theo mẫu): sóng nổ hất văng / lật đổ / đẩy trượt, bao rác rách tung toé giấy nilon, rơi
  // theo trọng lực, nảy, lăn rồi nằm lại. Giấy vụn / lon chai mỏng gộp tĩnh. Mọi ngẫu nhiên băm theo toạ độ -> mọi máy
  // như nhau (nổ ở cùng chỗ -> cùng kết quả)
  function junk(T, M, G, add, WH) {
    const flat = Builder(), canList = [];
    const up = [0, 1, 0];
    // vật đã có trên vỉa hè -> tránh
    const OB = new Map(), oc = 24, okey = (x, z) => Math.floor(x / oc) * 65536 + Math.floor(z / oc);
    const P = M.props || {};
    for (const L of [P.lamps, P.signals, P.poles, P.busStops, P.cars, M.trees]) for (const o of L || []) { const k = okey(o.x, o.z); (OB.get(k) || OB.set(k, []).get(k)).push(o); }
    // cầu vượt bộ hành: né 2 vế cầu thang + chiếu nghỉ (dải dọc vỉa hè ở 2 đầu) & chân trụ — trước đây thùng rác / container
    // đặt xuyên qua cầu thang
    const FB = (P.footbridges || []).map(f => ({ x: f.x, z: f.z, ca: Math.cos(f.angle), sa: Math.sin(f.angle), h: f.span / 2 }));
    const underFB = (x, z, r) => FB.some(f => {
      const dx = x - f.x, dz = z - f.z, lx = f.ca * dx - f.sa * dz, lz = f.sa * dx + f.ca * dz;
      for (const sx of [1, -1]) if (Math.abs(lx - sx * f.h) < 9 + r && lz * sx > -14 - r && lz * sx < 76 + r) return true;
      return false;
    });
    const free = (x, z, r) => { if (underFB(x, z, r)) return false; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of OB.get(okey(x + i * oc, z + j * oc)) || []) if (Math.hypot(o.x - x, o.z - z) < r + (o.kind ? 5 : 4)) return false; return true; };
    const mark = (x, z) => { const k = okey(x, z); (OB.get(k) || OB.set(k, []).get(k)).push({ x, z }); };
    const top = (x, z) => G(x, z) + (WH ? WH(x, z) : CURB_H) + 0.04;   // WH: độ cao vỉa hè (hạ ở dốc qua đường)
    const items = [];
    const inQ = (Q, x, z) => { let sg = 0; for (let k = 0; k < 4; k++) { const a = Q[k], b = Q[(k + 1) % 4], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c !== 0) { if (sg && Math.sign(c) !== sg) return false; sg = Math.sign(c); } } return true; };
    let curB = null;
    // trong dải vỉa hè (giữa mép bó vỉa và mép đất xây dựng, chừa 2 đv sát tường rào)
    const onBand = (x, z, pad) => !curB || (inQ(curB.curb, x, z) && !inQ(curB.lot, x, z) && [0, 1, 2, 3].every(k => { const L = curB.lot, a = L[k], b = L[(k + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1, d = ((x - a[0]) * ez - (z - a[1]) * ex) / l; return Math.abs(d) > pad || ((x - a[0]) * ex + (z - a[1]) * ez) < 0 || ((x - a[0]) * ex + (z - a[1]) * ez) > l * l; }));
    const put = (type, x, y, z, rx, ry, rz, s, col) => { if (type !== 'binLid' && !onBand(x, z, type === 'dump' ? 4.6 : 2.5)) return; items.push({ type, x, y, z, rx, ry, rz, s, col, v: null }); };
    const bagPile = (x, z, n, sd) => {
      for (let i = 0; i < n; i++) {
        const h = (k) => hash(sd * 31 + i * 7 + k), a = h(2) * 6.28, d = i ? 2 + h(3) * 3 : 0;
        const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, sc = 1.6 + h(1) * 1.3;
        put('bag' + Math.floor(h(9) * 4), bx, top(bx, bz) + (i > 3 ? sc * 0.8 : 0), bz, (h(5) - 0.5) * 0.5, h(6) * 6.28, (h(7) - 0.5) * 0.5, sc, BAG_COL[Math.floor(h(8) * BAG_COL.length)]);
      }
    };
    const litter = (x, z, rad, n, sd) => {
      for (let i = 0; i < n; i++) {
        const h = (k) => hash(sd * 17 + i * 13 + k), a = h(1) * 6.28, d = Math.sqrt(h(2)) * rad, lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
        const kind = h(3), col = LIT[Math.floor(h(4) * LIT.length)];
        if (kind < 0.55) {   // giấy / bìa nát: mảnh phẳng
          const w = 0.4 + h(5) * 1.1, l = 0.3 + h(6) * 0.9, an = h(7) * 6.28, ca = Math.cos(an), sa = Math.sin(an), y = top(lx, lz) + 0.03 + h(8) * 0.04;
          const pts = [[-w, -l], [w, -l], [w, l], [-w, l]].map(([u, v]) => flat.v(lx + u * ca - v * sa, y, lz + u * sa + v * ca, 0, 0, ...up, col));
          flat.quad(pts[0], pts[1], pts[2], pts[3]);
        } else if (kind < 0.85) {   // lon / chai nằm lăn
          const r9 = h(10), vi = r9 < 0.72 ? Math.floor(h(9) * 24) : r9 < 0.9 ? 24 + Math.floor(h(9) * 6) : 30 + Math.floor(h(9) * 4);
          const stand = h(18) < 0.1 && vi < 24;
          canList.push({ v: vi, x: lx, z: lz, y: top(lx, lz), ry: h(19) * 6.28, stand });
        } else {   // thùng các-tông móp, bìa ngấm nước sẫm màu
          const s = 2.8 + h(11) * 2.8;
          const bt = h(17) < 0.35 ? 'box' : h(17) < 0.7 ? 'boxOpen' : 'boxCrushed';
          const wetK = bt === 'boxCrushed' ? 0.55 + 0.15 * h(20) : 0.7 + 0.3 * h(20);   // mức ướt: sũng nước sẫm hẳn
          put(bt, lx, top(lx, lz), lz, (h(12) - 0.5) * 0.08, h(13) * 6.28, (h(14) - 0.5) * 0.08, s, [0.7, 0.62, 0.5].map(c => c * wetK * (0.85 + 0.15 * h(16))));
        }
      }
    };
    for (const B of M.blocks) {
      if (B.spawn) continue;   // Khu vực xuất phát: không rải rác để tránh xe vừa xuất hiện đã đè trúng
      const C = B.curb, Lq = B.lot;
      curB = B;
      for (let k = 0; k < 4; k++) {
        if (B.side[k] === 'canal') continue;
        const c0 = C[k], c1 = C[(k + 1) % 4], l0 = Lq[k], l1 = Lq[(k + 1) % 4];
        const len = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
        const at = (t, d) => { const cx = c0[0] + (c1[0] - c0[0]) * t, cz = c0[1] + (c1[1] - c0[1]) * t, lx = l0[0] + (l1[0] - l0[0]) * t, lz = l0[1] + (l1[1] - l0[1]) * t; return [cx + (lx - cx) * d, cz + (lz - cz) * d]; };
        const ex = (c1[0] - c0[0]) / len, ez = (c1[1] - c0[1]) / len, ang = Math.atan2(ex, ez);
        const [ix, iz] = at(0.5, 1), [ox, oz] = at(0.5, 0), nl = Math.hypot(ix - ox, iz - oz) || 1, inx = (ix - ox) / nl, inz = (iz - oz) / nl;   // hướng từ bó vỉa vào trong
        const sd = Math.round(c0[0] * 3 + c0[1] * 7);
        for (let s = 30; s < len - 30; s += 36) {
          const t = s / len, h = (q) => hash(sd + Math.round(s) * 13 + q);
          const r = h(1);
          if (r < 0.32) {
            // thùng rác công cộng sát bó vỉa: đổ nghiêng / mất nắp, rác tràn ra quanh chân
            const [x, z] = at(t, 0.18);
            if (!free(x, z, 4)) continue;
            mark(x, z);
            const col = BIN_COL[Math.floor(h(3) * BIN_COL.length)].map(c => c * (0.75 + 0.3 * h(4)));
            const sc = h(13) < 0.3 ? 0.82 : 1, lidCol = h(14) < 0.2 ? LID_ALT[Math.floor(h(15) * LID_ALT.length)] : col;
            const ya = Math.atan2(-inx, -inz) + (h(11) - 0.5) * 0.9;   // lưng (tay kéo) quay ra lòng đường như lúc kéo ra đổ rác
            if (h(2) < 0.3) {
              const ta = h(5) * 6.28;
              put('bin', x, top(x, z) + 2.4 * sc, z, 0, ta, Math.PI / 2, sc, col);
              put('binLid', x + Math.cos(ta + 1.2) * 7, top(x, z), z + Math.sin(ta + 1.2) * 7, 0, ta + 0.7, (h(16) < 0.5 ? Math.PI : 0), sc, lidCol);
              litter(x + Math.cos(ta) * 6, z + Math.sin(ta) * 6, 6, 10, sd + s);
            } else {
              put('bin', x, top(x, z), z, (h(6) - 0.5) * 0.05, ya, (h(7) - 0.5) * 0.05, sc, col);
              const ls = h(8);
              if (ls < 0.55) put('binLid', x, top(x, z) + 8.5 * sc, z, 0, ya, 0, sc, lidCol);   // nắp đóng
              else if (ls < 0.85) {
                // nắp bật ngửa ra sau quanh bản lề (lưng thùng, cao 8,5): tâm nắp lệch (0, 2,7, -1,4) theo hướng thùng
                const th = -2.0, ox = 0, oy = 0.17 * Math.cos(th) - 3.05 * Math.sin(th), oz = 0.17 * Math.sin(th) + 3.05 * Math.cos(th) - 3.0;
                put('binLid', x + (Math.sin(ya) * oz) * sc, top(x, z) + (8.5 + oy) * sc, z + (Math.cos(ya) * oz) * sc, th, ya, 0, sc, lidCol);
              }
              if (h(9) < 0.7) bagPile(x + inx * 2 + ex * 4, z + inz * 2 + ez * 4, 2 + Math.floor(h(10) * 4), sd + s);
              litter(x, z, 7, 6, sd + s * 3);
            }
          } else if (r < 0.48 && (B.use === 'mixed' || B.use === 'industrial' || B.use === 'cbd' || B.use === 'market')) {
            // thùng rác lớn (container) sát mép đất xây dựng, bao rác chất quanh
            const [x, z] = at(t, 0.78);
            if (!free(x, z, 9)) continue;
            mark(x, z);
            const col = DUMP_COL[Math.floor(h(2) * DUMP_COL.length)].map(c => c * (0.7 + 0.3 * h(3)));
            put('dump', x, top(x, z), z, 0, ang + (h(4) - 0.5) * 0.4, 0, 1, col);
            bagPile(x + inx * 6, z + inz * 6, 3 + Math.floor(h(6) * 6), sd + s * 5);
            litter(x + inx * 4, z + inz * 4, 10, 14, sd + s * 7);
          } else if (r < 0.62) {
            // đống bao rác vứt dọc tường / gốc cây
            const [x, z] = at(t, 0.6 + 0.3 * h(2));
            if (!free(x, z, 3)) continue;
            mark(x, z);
            bagPile(x, z, 2 + Math.floor(h(3) * 7), sd + s * 11);
            litter(x, z, 8, 8, sd + s * 13);
          } else if (r < 0.85) {
            // rác vụn rải rác
            const [x, z] = at(t, 0.2 + 0.6 * h(2));
            litter(x, z, 10, 5 + Math.floor(h(3) * 8), sd + s * 17);
          }
        }
      }
    }
    const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    add(flat.mesh(flatMat, 'litter'));
    const js = new JunkSet(T, G, items, add);
    js.cans = buildCans(canList, add); js.cans.parent = js;
    return js;
  }

  // lon / chai: dựng sẵn 34 mẫu (24 lon méo khác nhau, 6 chai nhựa, 4 chai thuỷ tinh), vẽ hàng loạt theo mẫu
  // canList: [{ v: mẫu, x, y, z, ry, stand }] -> CanSet (xe cán bẹp, sóng nổ hất văng)
  function buildCans(canList, add) {
    const PR = bottleProtos(), groups = PR.map(() => []);
    for (const c of canList) groups[c.v].push(c);
    // vỏ lon / chai nằm lâu ngày: bụi đất bám, ố, sơn lon tróc lộ nhôm (hoa văn mịn theo cỡ lon)
    const M = {
      can: WX(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.75, normalMap: junkNormal('metal'), normalScale: new THREE.Vector2(0.25, 0.25) }), 'paint', { grimeH: 0.35, rust: 0.15, chip: 0.4, streak: 0.2, scale: 5 }),
      pet: WX(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62, depthWrite: false }), 'plastic', { grimeH: 0.35, fade: 0.1, streak: 0, scale: 5 }),
      glass: WX(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 }), 'plastic', { grimeH: 0.35, fade: 0, streak: 0, stain: 0.6, scale: 5 })
    };
    const cl = new THREE.Color(), set = new CanSet();
    set.lod = [];
    PR.forEach((p, k) => {
      // mỗi mẫu x mỗi ô JUNK_CH một InstancedMesh (cắt theo khoảng cách, xem lodUpdate)
      const cells = new Map();
      for (const c of groups[k]) { const key = Math.floor(c.x / JUNK_CH) + ':' + Math.floor(c.z / JUNK_CH); (cells.get(key) || cells.set(key, []).get(key)).push(c); }
      for (const [key, L] of cells) {
        const im = new THREE.InstancedMesh(p.geo, M[p.kind], L.length);
        im.name = 'litter_' + p.kind; im.castShadow = p.kind !== 'pet'; im.receiveShadow = true;
        im.frustumCulled = false;   // khối bao InstancedMesh của r128 chỉ là mẫu lon ở gốc toạ độ -> bị cắt nhầm khi gốc ra khỏi khung nhìn
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        L.forEach((c, i) => {
          // nằm lăn: trục lon nằm ngang (quay z 90°); vài lon còn đứng
          set.add({ im, i, r: p.r, kind: p.kind, x: c.x, y: c.stand ? c.y : c.y + p.r, z: c.z, rx: 0, ry: c.ry, rz: c.stand ? 0 : Math.PI / 2, flat: false, v: null });
          const d = 0.65 + 0.35 * hash(i * 7 + k + Math.round(c.x));   // bụi bẩn bám
          im.setColorAt(i, cl.setRGB(d, d * 0.97, d * 0.92));
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        lodCell(set.lod, im, key, JUNK_LOD.can);
        add(im);
      }
    });
    return set;
  }

  // Lon / chai rời trên vỉa hè: xích / bánh xe đè lên thì bẹp lép (lon nhôm, chai nhựa) hoặc vỡ vụn (chai thuỷ tinh),
  // mép xe gạt văng ra; sóng nổ hất tung, nảy, lăn rồi nằm lại. Thuộc JunkSet (parent): dùng chung mặt vỉa hè + mảnh vụn
  // đếm phiên bản trạng thái rác / lon: tăng mỗi lần một vật được ghi lại (bị đè, hất, đang bay / lăn)
  let JUNK_VER = 0;
  // hộp bao các điểm mẫu trên nòng (barrel_sweep.js S.pts), tính 1 lần / lượt quét: vật ngoài hộp (nới bán kính) chắc chắn
  // không điểm nào chạm -> bỏ qua trước vòng 24 điểm (kết quả y hệt)
  function sweepBox(S) {
    if (S._bb) return S._bb;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of S.pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    return (S._bb = { x0, x1, z0, z1, y0, y1 });
  }
  class CanSet {
    constructor() { this.items = []; this.cell = 32; this.grid = new Map(); this.moving = new Set(); this.dirty = new Set(); this.parent = null; }
    key(x, z) { return Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell); }
    add(it) { this.items.push(it); this.regrid(it); this.write(it); }
    regrid(it) {
      if (it.gk !== undefined) { const L = this.grid.get(it.gk), ix = L ? L.indexOf(it) : -1; if (ix >= 0) L.splice(ix, 1); }
      const k = it.gk = this.key(it.x, it.z); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(it);
    }
    each(x, z, R, fn) {
      const c0 = Math.floor((x - R) / this.cell), c1 = Math.floor((x + R) / this.cell), r0 = Math.floor((z - R) / this.cell), r1 = Math.floor((z + R) / this.cell);
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const it of this.grid.get(i * 65536 + j) || []) if (!it.gone) fn(it);
    }
    // lon nằm: trục đứng là trục x cục bộ (quay z 90°); bẹp = ép theo phương đứng, bè ra ngang
    write(it) {
      JUNK_VER++;
      const lying = Math.abs(it.rz) > 0.8, f = it.flat;
      if (it.gone) xf(it.x, -999, it.z, 0, 0, 0, 0, 0, 0);
      else if (lying) xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, f ? 0.24 : 1, f ? 1.06 : 1, f ? 1.32 : 1);
      else xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, f ? 1.28 : 1, f ? 0.22 : 1, f ? 1.28 : 1);
      it.im.setMatrixAt(it.i, _m4); this.dirty.add(it.im);
    }
    flush() { for (const im of this.dirty) im.instanceMatrix.needsUpdate = true; this.dirty.clear(); }
    rest(x, z) { return this.parent ? this.parent.rest(x, z) : 0; }
    flatten(it, h) {
      if (it.kind === 'glass') {
        // chai thuỷ tinh vỡ vụn: mảnh xanh / nâu toé quanh chỗ cán
        it.gone = true;
        if (this.parent) this.parent.debris(it.x, it.y, it.z, [[0.16, 0.3, 0.2], [0.32, 0.2, 0.08]], 4, 0, 0, 0.25, 0.25);
      } else {
        it.flat = true; it.ry += (h(1) - 0.5) * 0.6;
        const g = this.rest(it.x, it.z);
        it.y = Math.abs(it.rz) > 0.8 ? g + it.r * 0.24 : g;
      }
      this.write(it);
    }
    kick(it, dx, dz, sp, up, h) {
      const s = sp * (0.8 + 0.4 * h(3)), a = (h(4) - 0.5) * 0.9, ca = Math.cos(a), sa = Math.sin(a);
      it.v = [(dx * ca - dz * sa) * s, up * (0.6 + 0.6 * h(5)), (dx * sa + dz * ca) * s];
      it.w = [(h(6) - 0.5) * 18, (h(7) - 0.5) * 10, (h(8) - 0.5) * 18];
      it.bounce = 0; this.moving.add(it);
    }
    // hộp thân xe (tâm cx, cz; trục ngang (ux, uz), nửa rộng hu x nửa dài hv), hướng chạy (fx, fz), tốc độ v
    crush(cx, cz, ux, uz, hu, hv, fx, fz, v) {
      this.each(cx, cz, Math.hypot(hu, hv) + 2, it => {
        if (it.v) return;
        const tx = it.x - cx, tz = it.z - cz, lu = tx * ux + tz * uz, lv = -tx * uz + tz * ux;
        if (Math.abs(lu) > hu + 0.6 || Math.abs(lv) > hv + 0.6) return;
        const h = q => hash(Math.round(it.x * 13 + it.z * 7) + q);
        if (Math.abs(lu) < hu - 0.4 && Math.abs(lv) < hv - 0.4) { if (!it.flat) this.flatten(it, h); }
        else if (v > 3 && !it.flat && Math.abs(lu) > hu - 0.4) {
          // mép bên xích gạt văng ngang (lon phía trước mũi xe thì nằm chờ bị cán, không bị ủi chạy trước xe)
          const sd = Math.sign(lu) || 1;
          this.kick(it, ux * sd + fx * 0.3, uz * sd + fz * 0.3, 6 + v * 0.4, 5, h);
        }
      });
      this.flush();
    }
    // nòng pháo quét sát đất (barrel_sweep.js): lon / chai bị gạt văng theo chiều quét
    barrelSweep(S) {
      const bb = sweepBox(S);
      this.each(S.cx, S.cz, S.R + 2, it => {
        if (it.v) return;
        const rr = it.r + S.rb;
        if (it.x + rr < bb.x0 || it.x - rr > bb.x1 || it.z + rr < bb.z0 || it.z - rr > bb.z1 || bb.y0 > it.y + rr) return;
        for (const p of S.pts) {
          if (p.y > it.y + it.r + S.rb || Math.hypot(p.x - it.x, p.z - it.z) > it.r + S.rb) continue;
          const l = p.s || 1, h = q => hash(Math.round(it.x * 13 + it.z * 7 + p.x) + q);
          this.kick(it, p.vx / l, p.vz / l, p.s * 1.2 + 4, 6 + p.s * 0.2, h);
          return;
        }
      });
      this.flush();
    }
    blast(x, y, z, R, F) {
      this.each(x, z, R, it => {
        const dx = it.x - x, dz = it.z - z, d = Math.hypot(dx, it.y + 0.5 - y, dz);
        if (d > R) return;
        const k = F * Math.pow(1 - d / R, 1.5), h = q => hash(Math.round(it.x * 13 + it.z * 7 + x * 3) + q);
        if (k < 0.02) return;
        if (it.kind === 'glass' && k > 0.3) { this.flatten(it, h); return; }
        const hl = Math.hypot(dx, dz) || 1;
        this.kick(it, dx / hl, dz / hl, Math.min(90, 70 * k), Math.min(60, 50 * k), h);
      });
      this.flush();
    }
    update(dt) {
      if (!this.moving.size) return;
      const G = 78.4;
      for (const it of this.moving) {
        it.v[1] -= G * dt;
        it.x += it.v[0] * dt; it.y += it.v[1] * dt; it.z += it.v[2] * dt;
        it.rx += it.w[0] * dt; it.ry += it.w[1] * dt; it.rz += it.w[2] * dt;
        const g = this.rest(it.x, it.z) + it.r;
        if (it.y <= g) {
          const spd = Math.hypot(it.v[0], it.v[1], it.v[2]);
          if (it.bounce < 2 && spd > 14) { it.bounce++; it.y = g; it.v = [it.v[0] * 0.5, -it.v[1] * 0.3, it.v[2] * 0.5]; it.w = it.w.map(a => a * 0.6); }
          else {
            // nằm lại: lăn ngang (lon bẹp nằm dẹt)
            it.rx = 0; it.rz = Math.PI / 2; it.y = g - it.r + it.r * (it.flat ? 0.24 : 1);
            it.v = null; this.moving.delete(it); this.regrid(it);
          }
        }
        this.write(it);
      }
      this.flush();
    }
  }

  // vỏ đồ vật bỏ hoang: thép sơn bạc màu tróc gỉ, vệt nước bẩn chảy dọc, bụi bám chân; card: bìa các-tông ngấm nước ố loang
  const JTEX = {};
  function junkTex(card) {
    const key = card === 'plastic' ? 'plastic' : card ? 'card' : 'metal';
    if (key === 'plastic' && !JTEX.plastic) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      let q = 313; const rnd = () => hash(q++ * 7717);
      const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#f2f0ea'); gr.addColorStop(1, '#d6d4ce'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);   // trên bạc màu nắng
      for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(40,38,34,0.08)' : 'rgba(255,255,255,0.08)'; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1 + rnd()); }
      g.strokeStyle = 'rgba(255,255,250,0.35)'; g.lineWidth = 0.7;
      for (let i = 0; i < 40; i++) { const x = rnd() * 128, y = rnd() * 128, a = rnd() * 3.14, l = 3 + rnd() * 14; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }   // trầy xước
      // vết trắng do nhựa bị uốn / va (stress whitening): chùm xước mảnh song song
      g.strokeStyle = 'rgba(255,255,250,0.22)'; g.lineWidth = 0.5;
      for (let k = 0; k < 6; k++) { const x = rnd() * 128, y = rnd() * 128, a = rnd() * 3.14; for (let i = 0; i < 6; i++) { const o = (rnd() - 0.5) * 6, l = 4 + rnd() * 9; g.beginPath(); g.moveTo(x + o * Math.sin(a), y - o * Math.cos(a)); g.lineTo(x + o * Math.sin(a) + Math.cos(a) * l, y - o * Math.cos(a) + Math.sin(a) * l); g.stroke(); } }
      // (vệt bẩn chảy / bùn bám chân: weathering.js trong shader, mịn hơn ảnh 128 px)
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
      JTEX.plastic = t;
    }
    if (JTEX[key]) return JTEX[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    let q = card ? 77 : 7; const rnd = () => hash(q++ * 9173);
    g.fillStyle = card ? '#d8d2c4' : '#e4e4e0'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(40,36,30,0.12)' : 'rgba(255,255,250,0.1)'; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2); }
    if (card) {
      // bìa kraft: giấy vàng nâu đều màu, sợi giấy li ti (không sọc vân gỗ)
      g.fillStyle = '#e2cfae'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2200; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(120,90,50,0.07)' : 'rgba(255,245,225,0.08)'; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1); }
      // in 1 màu (đen / đỏ sẫm / xanh): mũi tên "đặt hướng lên", khối chữ / logo, ô ký hiệu dễ vỡ / tránh mưa
      const ink = rnd() < 0.6 ? 'rgba(30,28,26,0.42)' : rnd() < 0.5 ? 'rgba(120,30,24,0.4)' : 'rgba(30,50,90,0.4)';   // mực phai nắng mưa
      g.fillStyle = ink;
      for (const ax of [14, 30]) { g.fillRect(ax, 18, 4, 18); g.beginPath(); g.moveTo(ax - 5, 20); g.lineTo(ax + 2, 10); g.lineTo(ax + 9, 20); g.fill(); }
      for (let i = 0; i < 4; i++) g.fillRect(52, 14 + i * 7, 26 + rnd() * 40, 3.5);          // dòng chữ in
      g.fillRect(52, 48, 22, 22); g.fillStyle = '#e2cfae'; g.fillRect(56, 52, 14, 14); g.fillStyle = ink; g.beginPath(); g.arc(63, 59, 4, 0, 6.3); g.fill();   // ô ký hiệu
      // nhãn dán trắng (bong 1 góc) + mã vạch
      g.fillStyle = 'rgba(236,234,226,0.95)'; g.fillRect(84, 80, 34, 24);
      g.fillStyle = 'rgba(30,30,30,0.8)'; for (let x = 87; x < 114; x += 1 + Math.floor(rnd() * 3)) g.fillRect(x, 92, 1, 9);
      for (let i = 0; i < 2; i++) g.fillRect(87, 83 + i * 4, 20, 2);
      // ố nước loang từ đáy lên + vết bẩn, mép ố đậm hơn (vệt khô)
      const gw = g.createLinearGradient(0, 128, 0, 70); gw.addColorStop(0, 'rgba(90,64,34,0.55)'); gw.addColorStop(0.75, 'rgba(90,64,34,0.2)'); gw.addColorStop(1, 'rgba(90,64,34,0)'); g.fillStyle = gw; g.fillRect(0, 70, 128, 58);
      g.strokeStyle = 'rgba(80,56,30,0.35)'; g.lineWidth = 1.2; g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, 84 + Math.sin(x * 0.2 + rnd()) * 5); g.stroke();
      for (let i = 0; i < 4; i++) { const x = rnd() * 128, y = rnd() * 128, r = 6 + rnd() * 14, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(70,52,32,0.22)'); gr.addColorStop(1, 'rgba(70,52,32,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
      // ƯỚT: bìa ngấm nước sẫm tới ~3/4 chiều cao (mép vệt khô lượn sóng), vệt nước chảy dọc từ mép trên
      const gw2 = g.createLinearGradient(0, 128, 0, 30); gw2.addColorStop(0, 'rgba(70,48,24,0.55)'); gw2.addColorStop(0.7, 'rgba(70,48,24,0.32)'); gw2.addColorStop(1, 'rgba(70,48,24,0)'); g.fillStyle = gw2; g.fillRect(0, 30, 128, 98);
      g.strokeStyle = 'rgba(60,40,20,0.4)'; g.lineWidth = 1.5; g.beginPath(); for (let x = 0; x <= 128; x += 6) g.lineTo(x, 40 + Math.sin(x * 0.15 + rnd() * 2) * 7); g.stroke();
      for (let i = 0; i < 12; i++) { const x = rnd() * 128, L2 = 30 + rnd() * 80, gd = g.createLinearGradient(0, 0, 0, L2); gd.addColorStop(0, 'rgba(60,40,20,0.35)'); gd.addColorStop(1, 'rgba(60,40,20,0)'); g.fillStyle = gd; g.fillRect(x, 0, 2 + rnd() * 5, L2); }
      // bong lớp giấy ngoài (bìa ướt tách lớp): mảng sáng lộ sóng bìa (sọc mảnh), mép giấy rách lởm chởm
      for (let i = 0; i < 3; i++) {
        const x = rnd() * 100, y = 50 + rnd() * 60, w = 12 + rnd() * 22, hh = 8 + rnd() * 14;
        g.fillStyle = 'rgba(196,166,118,0.95)'; g.beginPath(); for (let k = 0; k <= 10; k++) { const t = k / 10 * 6.283; g.lineTo(x + w / 2 + Math.cos(t) * w / 2 * (0.7 + 0.3 * rnd()), y + Math.sin(t) * hh / 2 * (0.7 + 0.3 * rnd())); } g.fill();
        g.fillStyle = 'rgba(120,92,56,0.5)'; for (let sx = x + 2; sx < x + w - 2; sx += 2.2) g.fillRect(sx, y - hh * 0.35, 0.9, hh * 0.7);
      }
      // BỎ HOANG: nếp nhàu (vệt sáng + vệt tối song song), mốc xanh xám lấm tấm, bùn bắn chân, rách / sờn góc lộ lớp sóng
      for (let i = 0; i < 6; i++) { const x0 = rnd() * 128, y0 = rnd() * 128, a = rnd() * 3.14, l = 25 + rnd() * 60, dx = Math.cos(a) * l, dy = Math.sin(a) * l;
        g.strokeStyle = 'rgba(255,240,215,0.22)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + dx, y0 + dy); g.stroke();
        g.strokeStyle = 'rgba(70,50,28,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + 1.5, y0 + 1.5); g.lineTo(x0 + dx + 1.5, y0 + dy + 1.5); g.stroke(); }
      for (let i = 0; i < 70; i++) { const x = rnd() * 128, y = 50 + rnd() * 78; g.fillStyle = rnd() < 0.5 ? 'rgba(70,80,62,0.3)' : 'rgba(40,46,36,0.28)'; g.beginPath(); g.arc(x, y, 0.8 + rnd() * 2.2, 0, 6.3); g.fill(); }
      for (let i = 0; i < 40; i++) { const x = rnd() * 128, y = 110 + rnd() * 18; g.fillStyle = 'rgba(60,44,28,' + (0.25 + rnd() * 0.35) + ')'; g.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 2); }
      for (const [cx, cy] of [[0, 0], [128, 0], [0, 128], [128, 128]]) { if (rnd() < 0.4) continue; g.fillStyle = 'rgba(150,120,80,0.75)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (cx ? -1 : 1) * (6 + rnd() * 10), cy); g.lineTo(cx, cy + (cy ? -1 : 1) * (6 + rnd() * 10)); g.fill();
        g.strokeStyle = 'rgba(110,84,50,0.6)'; g.lineWidth = 0.8; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(cx + (cx ? -1 : 1) * k * 2, cy); g.lineTo(cx, cy + (cy ? -1 : 1) * k * 2); g.stroke(); } }
    } else {
      for (let i = 0; i < 22; i++) {   // mảng gỉ lởm chởm (sơn phồng rộp bong), nhạt dần ra mép
        const x = rnd() * 128, y = rnd() * 128, r = 1.5 + rnd() * 5;
        g.fillStyle = 'rgba(138,78,40,0.55)'; g.beginPath(); for (let k = 0; k <= 9; k++) { const a = k / 9 * 6.283, rr = r * (0.5 + rnd()); g.lineTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr); } g.fill();
        g.fillStyle = 'rgba(90,50,28,0.5)'; g.fillRect(x - r * 0.3, y - r * 0.2, r * 0.6, r * 0.4);
      }
      for (let i = 0; i < 26; i++) { const x = rnd() * 128, y = rnd() * 80, L = 20 + rnd() * 60, gr = g.createLinearGradient(0, y, 0, y + L); gr.addColorStop(0, 'rgba(110,60,30,0.5)'); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(x, y, 1.5 + rnd() * 3, L); }
      const gb = g.createLinearGradient(0, 128, 0, 80); gb.addColorStop(0, 'rgba(70,60,45,0.55)'); gb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gb; g.fillRect(0, 80, 128, 48);   // bụi bùn bám chân
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (JTEX[key] = t);
  }

  // normal map từ bản đồ độ cao vẽ bằng code: plastic = nhựa sần mịn + vết trầy; metal = vân sơn sần + vết lõm móp;
  // card = sóng bìa các-tông + nếp gấp
  const JNRM = {};
  function junkNormal(kind) {
    if (JNRM[kind]) return JNRM[kind];
    const N = 128, H = new Float32Array(N * N);
    let q = kind.length * 101; const rnd = () => hash(q++ * 6151);
    const add = (cx, cy, r, a) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r; if (d < 1) { const i = ((cy + y + N) % N) * N + (cx + x + N) % N; H[i] += a * (1 - d * d); } } };
    for (let i = 0; i < N * N; i++) H[i] = (rnd() - 0.5) * (kind === 'plastic' ? 0.25 : kind === 'metal' ? 0.35 : 0.15);
    if (kind === 'metal') for (let i = 0; i < 14; i++) add(Math.floor(rnd() * N), Math.floor(rnd() * N), 4 + Math.floor(rnd() * 10), -(1 + rnd() * 2));   // vết lõm móp
    if (kind === 'plastic') for (let i = 0; i < 30; i++) { const x0 = rnd() * N, y0 = rnd() * N, a = rnd() * 3.14, l = 4 + rnd() * 16; for (let t = 0; t < l; t++) { const i2 = (Math.floor(y0 + Math.sin(a) * t + N) % N) * N + Math.floor(x0 + Math.cos(a) * t + N) % N; H[i2] -= 1.2; } }   // trầy xước
    if (kind === 'card') { for (let i = 0; i < 6; i++) { const y0 = Math.floor(rnd() * N), a = (rnd() - 0.5) * 1.2; for (let x = 0; x < N; x++) { const y = (y0 + Math.round(x * Math.tan(a)) + N * 4) % N; H[y * N + x] -= 1.4; } } }   // mặt giấy phẳng (sóng bìa nằm trong, không lộ) + vài nếp nhàu
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], hy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
      const v = new THREE.Vector3(-hx, -hy, 2).normalize(), i = (y * N + x) * 4;
      d[i] = (v.x * 0.5 + 0.5) * 255; d[i + 1] = (v.y * 0.5 + 0.5) * 255; d[i + 2] = (v.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return (JNRM[kind] = t);
  }
  // bóng tiếp xúc: vệt tối mềm dưới chân đồ vật (tâm đậm, mờ dần ra mép)
  let AO_TEX = null;
  function aoTex() {
    if (AO_TEX) return AO_TEX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (AO_TEX = new THREE.CanvasTexture(c));
  }
  // dấu chân bóng tiếp xúc theo loại (rộng x sâu, đv)
  const AO_FP = { bin: [6.5, 8], binLid: [0, 0], dump: [17, 12], bag0: [3.2, 3.2], bag1: [3.2, 3.2], bag2: [3.2, 3.2], bag3: [3.2, 3.2], box: [1.25, 0.95], boxOpen: [1.25, 0.95], boxCrushed: [1.3, 1.0] };

  // NHĂN NILON RIÊNG TỪNG TÚI (tính trên GPU, không thêm hình): hạt giống lấy từ vị trí bản vẽ (instanceMatrix) -> mỗi túi
  // một kiểu nhăn, mọi máy như nhau. Nếp gấp gãy sắc (1 - |sin|: gân sắc, không lượn sóng mềm), kết hợp phản xạ góc xiên
  // Fresnel đặc trưng của màng nilon bóng, độ bóng thay đổi theo độ căng và bụi đất đọng ở chân và khe nếp.
  function bagCrumple(m) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = `varying vec3 vBagP;
varying float vBagS;
float bagSeed() {
#ifdef USE_INSTANCING
  return fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
  return 0.37;
#endif
}
float bvH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float bvN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bvH(i), bvH(i + vec3(1, 0, 0)), f.x), mix(bvH(i + vec3(0, 1, 0)), bvH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bvH(i + vec3(0, 0, 1)), bvH(i + vec3(1, 0, 1)), f.x), mix(bvH(i + vec3(0, 1, 1)), bvH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float bvF(vec3 p, float s) { vec3 q = p + s * 17.0; return bvN(q * 3.1) * 0.65 + bvN(q * 7.3 + 5.1) * 0.35; }
// gồ ghề mềm lộn xộn của túi căng đồ (nhiễu 3D 2 tầng — sóng sin cũ tạo gân song song đều như tôn sóng):
// w = độ đẩy ra, xyz = đạo hàm (lệch pháp tuyến)
vec4 bagWr(vec3 p, float s) {
  float e = 0.06, f0 = bvF(p, s);
  vec3 g = vec3(bvF(p + vec3(e, 0.0, 0.0), s) - f0, bvF(p + vec3(0.0, e, 0.0), s) - f0, bvF(p + vec3(0.0, 0.0, e), s) - f0) / e;
  return vec4(g * 0.045, f0 * 0.09);
}
` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float bgS = bagSeed();
  float bgM = smoothstep(0.02, 0.18, position.y) * (1.0 - smoothstep(1.28, 1.55, position.y));
  vec4 bgW = bagWr(position, bgS);
  objectNormal = normalize(objectNormal - (bgW.xyz - dot(bgW.xyz, objectNormal) * objectNormal) * bgM * 0.85);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed += objectNormal * (bgW.w - 0.04) * bgM;
  // xệ / bè / nghiêng riêng từng túi theo vị trí đặt
  transformed.xz *= 1.0 + (bgS - 0.5) * 0.22 * smoothstep(0.0, 0.6, position.y);
  transformed.y *= 1.0 - fract(bgS * 7.31) * 0.12;
  transformed.x += transformed.y * (fract(bgS * 3.7) - 0.5) * 0.18;
  transformed.z += transformed.y * (fract(bgS * 5.3) - 0.5) * 0.18;
  vBagP = position;
  vBagS = bgS;`);

      sh.fragmentShader = `varying vec3 vBagP;
varying float vBagS;
float bgH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float bgN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bgH(i), bgH(i + vec3(1, 0, 0)), f.x), mix(bgH(i + vec3(0, 1, 0)), bgH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bgH(i + vec3(0, 0, 1)), bgH(i + vec3(1, 0, 1)), f.x), mix(bgH(i + vec3(0, 1, 1)), bgH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float bagDust;
// Nilon vò: ô Voronoi 3D — mỗi ô 1 mặt phẳng nghiêng riêng (mặt gãy), nếp gấp sắc ở mép giữa 2 ô.
// x = độ gần nếp (1 = trên nếp), yzw = độ nghiêng mặt của ô (lệch pháp tuyến)
vec4 bagFacet(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec3 id = vec3(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = vec3(float(x), float(y), float(z));
    vec3 o = vec3(bgH(i + c), bgH(i + c + 17.3), bgH(i + c + 41.7));
    vec3 r = c + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = i + c; } else if (d < d2) d2 = d;
  }
  float edge = 1.0 - smoothstep(0.0, 0.12, sqrt(d2) - sqrt(d1));
  vec3 tilt = vec3(bgH(id + 3.1), bgH(id + 7.7), bgH(id + 11.3)) - 0.5;
  return vec4(edge, tilt);
}
float bagCrinkle(vec3 p, float s) { return bagFacet(p * 9.0 + s * 13.0).x; }
` + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
  {
    // Bụi đất bám chân túi và đọng vào các kẽ rãnh sâu
    vec3 q = vBagP * 3.2 + vBagS * 40.0;
    float n = bgN(q) * 0.6 + bgN(q * 2.8) * 0.4;
    float baseDust = (1.0 - smoothstep(0.02, 0.45, vBagP.y)) * 0.95;
    float creviceDust = smoothstep(0.5, 0.82, n) * 0.65;
    bagDust = clamp(baseDust + creviceDust * (1.0 - baseDust * 0.5), 0.0, 1.0);

    // Màu bụi đất nâu xám ấm
    vec3 dustCol = vec3(0.32, 0.28, 0.22) * (0.85 + 0.3 * bgN(vBagP * 8.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, dustCol, bagDust * 0.68);
    diffuseColor.rgb *= 0.92 + 0.16 * bgN(vBagP * 12.0 + vBagS * 9.0);

    // Phản xạ góc xiên của màng nilon mỏng (sáng viền bóng lướt)
    // (color_fragment chạy trước normal_fragment_begin: chưa có biến normal, lấy pháp tuyến nội suy)
    vec3 viewDir = normalize(vViewPosition);
#ifdef FLAT_SHADED
    vec3 bagN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
#else
    vec3 bagN = normalize(vNormal);
#endif
    float fresnel = pow(clamp(1.0 - max(0.0, dot(bagN, viewDir)), 0.0, 1.0), 3.0);
    vec3 rimCol = mix(vec3(0.07, 0.075, 0.085), vec3(0.02, 0.02, 0.02), bagDust);
    diffuseColor.rgb += rimCol * fresnel * (1.0 - bagDust * 0.6);
  }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  {
    float cr = bagCrinkle(vBagP, vBagS);
    float tightSheen = smoothstep(0.4, 0.85, cr) * 0.1;
    roughnessFactor = mix(clamp(0.24 - tightSheen, 0.15, 0.38), 0.88, bagDust);
  }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // mặt gãy của nilon vò: 2 tầng ô (to ~11 cm / nhỏ ~4 cm), mỗi ô nghiêng 1 hướng -> ánh bóng vỡ thành từng mảng
    // phẳng sáng tối như túi nilon thật; nhìn xa mờ dần (tránh lấp lánh nhiễu)
    vec4 fA = bagFacet(vBagP * 9.0 + vBagS * 13.0), fB = bagFacet(vBagP * 23.0 + vBagS * 29.0);
    float far = 1.0 - smoothstep(0.0, 0.03, length(fwidth(vBagP)));
    vec3 tl = (fA.yzw * 0.55 + fB.yzw * 0.3 * far) * (1.0 - bagDust * 0.7);
    normal = normalize(normal + (viewMatrix * vec4(tl, 0.0)).xyz);
  }`);
    };
    m.customProgramCacheKey = () => 'bagCrumple4';
    return m;
  }

  class JunkSet {
    constructor(T, G, items, add) {
      this.T = T; this.G = G;
      const PR = junkProtos();
      // phong hoá (weathering.js): bùn bám chân, bạc nắng, loang ố, vệt mưa; container thép sơn thêm gỉ + tróc sơn
      const MAT = {
        metal: WX(new THREE.MeshStandardMaterial({ map: junkTex(false), normalMap: junkNormal('metal'), normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true, roughness: 0.68, metalness: 0.35 }), 'paint'),
        bag: WX(bagCrumple(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.04 })), 'plastic', { grime: 0.55, grimeH: 1.2, fade: 0.15, streak: 0, stain: 0.2, dust: 0.3 }),
        card: WX(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: junkTex(true), normalMap: junkNormal('card'), normalScale: new THREE.Vector2(0.18, 0.18), vertexColors: true, roughness: 0.82, metalness: 0 }), 'card'),
        scrap: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
        plastic: WX(new THREE.MeshStandardMaterial({ map: junkTex('plastic'), normalMap: junkNormal('plastic'), normalScale: new THREE.Vector2(0.45, 0.45), vertexColors: true, roughness: 0.6, metalness: 0 }), 'plastic')
      };
      const matOf = (t) => t.startsWith('bag') ? MAT.bag : t.startsWith('box') ? MAT.card : t === 'scrap' ? MAT.scrap : t === 'bin' || t === 'binLid' ? MAT.plastic : MAT.metal;
      // mảnh rác văng (túi rách): bể chứa có hạn, dùng vòng
      this.SCRAP = 900;
      // VẼ THEO Ô + CẮT THEO KHOẢNG CÁCH: rác vỉa hè có hàng nghìn món (bao rác ~1400 tam giác / cái) rải khắp thành phố
      // — trước đây vẽ hết mọi khung (~18 triệu tam giác ở map đô thị). Mỗi loại x mỗi ô JUNK_CH một InstancedMesh (it.ek);
      // ô xa camera quá tầm của loại đó thì ẩn (lodUpdate). Mảnh rác văng: 1 bể chung, luôn vẽ
      const ck = (x, z) => Math.floor(x / JUNK_CH) + ':' + Math.floor(z / JUNK_CH);
      const count = {};
      for (const it of items) { it.ek = it.type + '#' + ck(it.x, it.z); count[it.ek] = (count[it.ek] || 0) + 1; }
      count.scrap = this.SCRAP;
      this.ims = {}; this.lod = [];
      for (const k in count) {
        const t = k.split('#')[0];
        const im = new THREE.InstancedMesh(PR[t], matOf(t), count[k]);
        im.name = 'junk_' + t; im.castShadow = t !== 'scrap'; im.receiveShadow = true; im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ims[k] = { im, n: 0 };
        if (k !== 'scrap') lodCell(this.lod, im, k.split('#')[1], JUNK_LOD[t] || 1200);
        add(im);
      }
      this.items = items;
      const aoGeo = new THREE.PlaneGeometry(1, 1); aoGeo.rotateX(-Math.PI / 2);
      this.ao = new THREE.InstancedMesh(aoGeo, new THREE.MeshBasicMaterial({ map: aoTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), items.length);
      this.ao.name = 'junk_ao'; this.ao.frustumCulled = false; this.ao.renderOrder = 1; this.ao.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      add(this.ao);
      items.forEach((it, k) => { it.ai = k; });
      this.moving = new Set();
      this.cell = 64; this.grid = new Map();
      const c = new THREE.Color();
      for (const it of items) {
        const e = this.ims[it.ek];
        it.i = e.n++;
        e.im.setColorAt(it.i, c.setRGB(it.col[0], it.col[1], it.col[2]));
        this.write(it);
        const k = it.gk = this.key(it.x, it.z); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(it);
      }
      // mảnh rác văng: ẩn sẵn
      const S = this.ims.scrap;
      this.scraps = [];
      for (let i = 0; i < this.SCRAP; i++) { const it = { type: 'scrap', i, x: 0, y: -999, z: 0, rx: 0, ry: 0, rz: 0, s: 0, v: null }; S.im.setColorAt(i, c.setRGB(0.5, 0.48, 0.42)); this.write(it); this.scraps.push(it); }
      S.n = 0;
      for (const t in this.ims) { this.ims[t].im.instanceMatrix.needsUpdate = true; if (this.ims[t].im.instanceColor) this.ims[t].im.instanceColor.needsUpdate = true; }
      this.ao.instanceMatrix.needsUpdate = true;
    }
    key(x, z) { return Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell); }
    write(it) {
      JUNK_VER++;
      // dent: vỏ thép móp bẹp 1 phía (thu 1 trục ngang), squash: thùng các-tông bẹp xuống (thấp + bè ra)
      const sc = it.s, lyingBin = it.type === 'bin' && (Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8);
      if (it.type === 'scrap') xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, it.s, 1, it.s * 0.7);
      // thùng nằm bị xích cán: ép dẹt theo phương đứng (trục x cục bộ khi quay z 90°), bè ra hai bên
      else if (lyingBin && it.flat) xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, sc * 0.4, sc * 1.04, sc * 1.3);
      else xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, sc * (it.squash ? 1.12 : 1), sc * (it.squash || 1), sc * (it.dent || 1));
      const e = this.ims[it.ek || it.type];   // (mảnh rác văng: bể chung 'scrap')
      e.im.setMatrixAt(it.i, _m4);
      if (!e.dirty) { e.dirty = true; (this.dirtyIms || (this.dirtyIms = new Set())).add(e); }
      if (it.ai !== undefined) {
        // bóng tiếp xúc: chỉ khi vật nằm trên mặt đất (bay lên -> ẩn), dấu chân theo hướng & tư thế (thùng đổ nằm: dài ra)
        const fp = AO_FP[it.type] || [0, 0], lying = Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8, sc = it.s || 1;
        const up = !it.v && !it.gone, g = it.type === 'bin' && lying ? it.y - 2.4 * sc : it.y;   // vật nằm yên: chân vật = mặt đất
        xf(it.x, g + 0.05, it.z, 0, it.ry, 0, up ? fp[0] * sc * (lying ? 1.3 : 1) : 0, 1, up ? fp[1] * sc * (lying ? 1.25 : 1) : 0);
        this.ao.setMatrixAt(it.ai, _m4); this.aoDirty = true;
      }
    }
    rest(x, z) { const g = this.T.groundAtRaw(x, z), s = this.G(x, z); return Math.max(g, this.onWalk && this.onWalk(x, z) ? s + (this.walkH ? this.walkH(x, z) : CURB_H) + 0.04 : g); }
    // sóng nổ tại (x, y, z): đồ vật trong tầm bị hất văng (nhẹ bay xa, container chỉ trượt / nghiêng), túi rác rách tung
    blast(x, y, z, ammo, heavy) {
      const B = JUNK_BLAST[ammo] || JUNK_BLAST.NORMAL, R = B[0] * (heavy ? 1.45 : 1), F = B[1] * (heavy ? 2.1 : 1);
      if (y - this.T.groundAtRaw(x, z) > R + 12) return;
      if (this.cans) this.cans.blast(x, y, z, R, F);
      // đạn bắn thẳng (đạn xuyên / đạn súng máy): trúng vật nào thì thủng lỗ, rung lật; trúng đủ nhiều thì vỡ nát
      const HIT = BULLET_HIT[ammo];
      const c0 = Math.floor((x - R) / this.cell), c1 = Math.floor((x + R) / this.cell), r0 = Math.floor((z - R) / this.cell), r1 = Math.floor((z + R) / this.cell);
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const it of this.grid.get(i * 65536 + j) || []) {
        if (it.gone) continue;
        const J = JK[it.type], h = (q) => hash(Math.round(it.x * 7 + it.z * 3 + x * 11 + z * 5) + q);
        if (HIT && J && this.shot(it, x, y, z, HIT, J, h)) continue;
        const dx = it.x - x, dz = it.z - z, dy = it.y + 1 - y, d = Math.hypot(dx, dy, dz);
        if (d > R) continue;
        const k = F * Math.pow(1 - d / R, 1.5);
        if (k < 0.02) continue;
        // túi rác: sóng nổ đủ mạnh xé rách -> túi biến mất, giấy / nilon / rác văng tung toé
        if (it.type.startsWith('bag') && k > 0.25) { this.burstBag(it, dx, dz, d, k); continue; }
        const sp = Math.min(140, 42 * k / Math.sqrt(J.m)) * (0.8 + 0.4 * h(1)), hl = Math.hypot(dx, dz) || 1;   // HE 120 nổ cách 4 m: thùng rác văng ~4-6 m
        it.v = [dx / hl * sp, sp * (0.35 + 0.4 * h(2)) / (it.type === 'dump' ? 3 : 1), dz / hl * sp];
        const spin = (it.type === 'dump' ? 0.4 : 6) * k / Math.sqrt(J.m);
        it.w = [(h(3) - 0.5) * spin, (h(4) - 0.5) * spin, (h(5) - 0.5) * spin];
        // vỏ thép móp (thùng rác / container), bìa các-tông bẹp
        if (it.type === 'bin' || it.type === 'dump') it.dent = Math.max(0.82, (it.dent || 1) - 0.08 * k);
        if (it.type.startsWith('box') && k > 0.4) it.squash = 0.55;
        it.bounce = 0;
        this.moving.add(it);
      }
    }
    // Đạn bắn thẳng trúng vật (điểm chạm nằm trong khối vật): thùng nhựa thủng lỗ rung lật, trúng nhiều thì vỡ toác văng
    // mảnh nhựa; thùng các-tông bị xé tung thành mảnh bìa; túi rác rách; container thép chỉ móp. Trả true nếu trúng.
    shot(it, x, y, z, w, J, h) {
      const s = it.s || 1, lying = Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8;
      const ht = (lying ? J.half * 2 : J.ht) * s, rad = (lying ? Math.max(J.half, J.ht * 0.5) : J.half) * s + 0.8;
      const base = lying && it.type === 'bin' ? it.y - 2.4 * s : it.y;
      if (Math.hypot(it.x - x, it.z - z) > rad || y < base - 1 || y > base + ht + 1) return false;
      const dx = it.x - x, dz = it.z - z, hl = Math.hypot(dx, dz) || 1, fx = dx / hl, fz = dz / hl;
      it.hits = (it.hits || 0) + w;
      if (it.type.startsWith('bag')) { if (w >= 0.3 || it.hits > 0.6) this.burstBag(it, fx, fz, 1, 0.45); return true; }
      if (it.type.startsWith('box')) {
        if (it.hits > 1) { it.gone = true; it.s = 0; this.write(it); this.debris(it.x, it.y + 1, it.z, [it.col, it.col.map(c => c * 0.8), [0.5, 0.45, 0.36]], 7, fx, fz, 0.5, 1.1); return true; }
        it.squash = Math.min(it.squash || 1, 0.8);
        if (!it.v) this.kick(it, fx, fz, 6 + 10 * w, 4 * w, h);
        return true;
      }
      if (it.type === 'bin' || it.type === 'binLid') {
        it.dent = Math.max(0.6, (it.dent || 1) - 0.035 * w);
        if (it.type === 'bin' && it.hits > 2.2 && !it.shred) {
          // vỡ toác: mảnh nhựa cùng màu văng ra, thùng bẹp méo đổ nằm
          it.shred = true; it.squash = 0.72; it.topple = true;
          this.debris(it.x, base + ht * 0.6, it.z, [it.col, it.col.map(c => c * 0.7)], 6, fx, fz, 0.6, 0.9);
        }
        if (!it.v && !it.flat) { it.topple = it.topple || h(21) < 0.25 * w; this.kick(it, fx, fz, (it.type === 'binLid' ? 18 : 3) + 9 * w, 3 + 4 * w, h, 0.6); }
        return true;
      }
      if (it.type === 'dump') { it.dent = Math.max(0.78, (it.dent || 1) - 0.012 * w); this.write(it); return true; }
      return false;
    }
    // NÒNG PHÁO QUÉT / ĐẬP (barrel_sweep.js): điểm mẫu dọc nòng S.pts lọt vào thùng rác / thùng các-tông / túi / container:
    // vật nhẹ bị hất văng theo chiều quét (nhanh theo tốc độ nòng), thùng nhựa móp + đổ lăn, thùng các-tông bẹp, túi rác
    // quét mạnh thì rách tung; container ~200 kg móp vỏ, đủ đà mới xê dịch. Lon / chai nằm đất bị gạt văng
    barrelSweep(S) {
      if (this.cans) this.cans.barrelSweep(S);
      let hit = null;
      const R = S.R + 8, c0 = Math.floor((S.cx - R) / this.cell), c1 = Math.floor((S.cx + R) / this.cell), r0 = Math.floor((S.cz - R) / this.cell), r1 = Math.floor((S.cz + R) / this.cell);
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const it of this.grid.get(i * 65536 + j) || []) {
        if (it.gone || it.v || it.type === 'scrap') continue;
        const J = JK[it.type];
        if (!J) continue;
        const s = it.s || 1, lying = Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8;
        const ht = (lying ? J.half * 2 : J.ht) * s * (it.flat ? 0.35 : 1), rad = (lying ? Math.max(J.half, J.ht * 0.5) : J.half) * s;
        const base = lying && it.type === 'bin' ? it.y - 2.4 * s : it.y, rr = rad + S.rb, bb = sweepBox(S);
        if (it.x + rr < bb.x0 || it.x - rr > bb.x1 || it.z + rr < bb.z0 || it.z - rr > bb.z1 || bb.y1 < base - 0.5 || bb.y0 > base + ht + S.rb) continue;
        for (const p of S.pts) {
          if (p.y < base - 0.5 || p.y > base + ht + S.rb || Math.hypot(p.x - it.x, p.z - it.z) > rad + S.rb) continue;
          const l = p.s || 1, dx = p.vx / l, dz = p.vz / l, h = (q) => hash(Math.round(it.x * 7 + it.z * 3 + p.x * 5) + q);
          if (it.type === 'dump') {
            it.dent = Math.max(0.6, (it.dent || 1) - 0.04);
            if (p.E > 20000) this.kick(it, dx, dz, Math.min(40, p.s * 0.6), 0.5, h, 0.4); else this.write(it);
          } else if (it.type.startsWith('bag')) {
            if (p.s > 24) this.burstBag(it, dx, dz, 1, 0.5); else this.kick(it, dx, dz, p.s * 0.9 + 4, 3, h);
          } else {
            if (it.type === 'bin') { it.dent = Math.max(0.65, (it.dent || 1) - 0.08); if (p.s > 8) it.topple = true; }
            if (it.type.startsWith('box')) it.squash = Math.min(it.squash || 1, 0.7);
            this.kick(it, dx, dz, p.s * 1.05 + 5, 4 + p.s * 0.15, h, 0.8);
          }
          hit = hit || { x: p.x, y: p.y, z: p.z, mat: it.type === 'dump' ? 'metal' : 'wood', mB: it.type === 'dump' ? 2 : 0.1 };
          break;
        }
      }
      this.flushIms();
      if (this.aoDirty) { this.ao.instanceMatrix.needsUpdate = true; this.aoDirty = false; }
      return hit;
    }
    // mảnh vụn (nhựa, bìa, thuỷ tinh) văng theo hướng (dx, dz) (0, 0: toả đều), lấy từ bể mảnh rác dùng vòng
    debris(x, y, z, cols, n, dx, dz, k, size = 1) {
      const S = this.ims.scrap, c = new THREE.Color(), base = Math.atan2(dz, dx), spread = !dx && !dz ? 6.283 : 2.4;
      for (let q = 0; q < n; q++) {
        const h = (zz) => hash(Math.round(x * 13 + z * 7) + q * 31 + zz + S.n * 3);
        const p = this.scraps[S.n % this.SCRAP]; S.n++;
        const col = cols[q % cols.length];
        S.im.setColorAt(p.i, c.setRGB(col[0], col[1], col[2]));
        const a = base + (h(2) - 0.5) * spread, sp = (8 + 18 * h(3)) * Math.min(1.0, k + 0.2);
        Object.assign(p, {
          x: x + (h(4) - 0.5) * 1.5, y: y + 0.3, z: z + (h(5) - 0.5) * 1.5,
          rx: h(6) * 6, ry: h(7) * 6, rz: 0, s: size * (0.4 + h(8) * 0.6),
          v: [Math.cos(a) * sp, 2 + 6 * h(9) * Math.min(1.0, k + 0.2), Math.sin(a) * sp],
          w: [(h(10) - 0.5) * 8, (h(11) - 0.5) * 6, (h(12) - 0.5) * 8], flutter: true, bounce: 0
        });
        this.moving.add(p);
      }
      if (S.im.instanceColor) S.im.instanceColor.needsUpdate = true;
    }
    burstBag(it, dx, dz, d, k) {
      it.gone = true; it.s = 0; this.write(it);
      const S = this.ims.scrap, c = new THREE.Color(), hl = Math.hypot(dx, dz) || 1;
      const count = Math.min(6, this.SCRAP);   // giảm mảnh vụn xuống 6 mảnh để tránh lag
      for (let q = 0; q < count; q++) {
        const h = (z) => hash(Math.round(it.x * 13 + it.z * 7) + q * 31 + z);
        const p = this.scraps[S.n % this.SCRAP]; S.n++;
        const col = q < 2 ? it.col : LIT[Math.floor(h(1) * LIT.length)];
        S.im.setColorAt(p.i, c.setRGB(col[0], col[1], col[2])); if (S.im.instanceColor) S.im.instanceColor.needsUpdate = true;
        const a = Math.atan2(dz, dx) + (h(2) - 0.5) * 2.4, sp = (10 + 20 * h(3)) * Math.min(1.0, k);
        // Mảnh rác chỉ văng nhẹ sát mặt đường (cao 1 - 2.5 m), không phóng vọt lên trời
        Object.assign(p, {
          x: it.x + (h(4) - 0.5) * 1.5, y: it.y + 0.3, z: it.z + (h(5) - 0.5) * 1.5,
          rx: h(6) * 6, ry: h(7) * 6, rz: 0, s: q < 2 ? 0.9 + h(8) * 0.7 : 0.4 + h(8) * 0.5,
          v: [Math.cos(a) * sp, 1.2 + 3.2 * h(9) * Math.min(1.0, k), Math.sin(a) * sp],
          w: [(h(10) - 0.5) * 8, (h(11) - 0.5) * 6, (h(12) - 0.5) * 8], flutter: true, bounce: 0
        });
        this.moving.add(p);
      }
    }
    // Xe chạy qua / húc vào đồ vật trên vỉa hè (gọi mỗi khung từ spg.js): túi rác bị xích / bánh đè thì rách tung, thùng
    // các-tông bẹp dí, thùng rác nhựa bị húc văng (xe xích đè lên thùng đang nằm thì bẹp hẳn), container nặng chỉ bị ủi
    // trượt + móp. Hộp thân xe như va chạm ô tô (VehicleCollision.hullBox); đồ vật đang bay thì bỏ qua
    crush(unit, x, z, dt) {
      if (!unit || unit.isDead || !dt || (!this.items.length && !this.cans)) return;
      // XE GẦN NHƯ ĐỨNG YÊN, cùng tư thế lần trước, không vật nào đổi từ lần trước: mọi nhánh hất văng cần tốc độ > 1,5;
      // ở tốc độ thấp chỉ có đè bẹp (làm lại không đổi gì) -> bỏ qua, kết quả y hệt. Trước đây 20 xe chạy hết hàm này
      // mỗi khung (~2-4 ms / khung ở phố)
      const sig = unit._jkSig, vNow = Math.abs(unit.speed || 0);
      if (sig && vNow <= 1.5 && sig.x === x && sig.z === z && sig.a === unit.bodyAngle && sig.ver === JUNK_VER) return;
      try { this.crushIn(unit, x, z, dt); } finally {
        unit._jkSig = { x, z, a: unit.bodyAngle, ver: JUNK_VER };
      }
    }
    crushIn(unit, x, z, dt) {
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      const a = unit.bodyAngle || 0, ca = Math.cos(a), sa = Math.sin(a);
      let cx = x, cz = z, hu = 14, hv = 22;
      if (VC && VC.hullBox) {
        const B = VC.hullBox(unit);
        if (B && isFinite(B.maxX - B.minX)) {
          const lcx = (B.minX + B.maxX) / 2, lcz = (B.minZ + B.maxZ) / 2;
          cx = x + lcx * ca + lcz * sa; cz = z - lcx * sa + lcz * ca; hu = (B.maxX - B.minX) / 2; hv = (B.maxZ - B.minZ) / 2;
        }
      }
      const R = Math.hypot(hu, hv) + 6, ux = ca, uz = -sa;
      const sp = unit.speed || 0, v = Math.abs(sp), fx = -Math.sin(a) * Math.sign(sp || 1), fz = -Math.cos(a) * Math.sign(sp || 1);
      const tracked = !unit.isWheeled, mU = unit.mass || 40;
      if (this.cans) this.cans.crush(cx, cz, ux, uz, hu, hv, fx, fz, v);
      const c0 = Math.floor((cx - R) / this.cell), c1 = Math.floor((cx + R) / this.cell), r0 = Math.floor((cz - R) / this.cell), r1 = Math.floor((cz + R) / this.cell);
      let hit = null;
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const it of this.grid.get(i * 65536 + j) || []) {
        if (it.gone || it.v || it.type === 'scrap') continue;
        const J = JK[it.type], half = (J && J.half ? J.half : 1) * (it.s || 1);
        const tx = it.x - cx, tz = it.z - cz, lu = tx * ux + tz * uz, lv = -tx * uz + tz * ux;
        if (Math.abs(lu) > hu + half || Math.abs(lv) > hv + half) continue;
        // (tra độ cao mặt đất sau phép thử hộp: mỗi xe mỗi khung trước đây tra cho mọi đồ vật trong các ô quanh xe)
        if (Math.abs(it.y - this.T.groundAtRaw(it.x, it.z)) > 30) continue;   // đồ vật trên cao (không cùng tầng với xe)
        const under = Math.abs(lu) < hu - half * 0.3 && Math.abs(lv) < hv - half * 0.3;   // nằm hẳn dưới gầm / dưới xích
        const h = (q) => hash(Math.round(it.x * 7 + it.z * 3) + q);
        if (it.type.startsWith('bag')) {
          // túi rác: xe đè khi đứng yên hoặc chạy chậm thì bẹp dí; chỉ khi húc mạnh ở tốc độ cao (v > 20) mới rách văng
          if (under && !it.flat && v <= 20) {
            it.flat = true; it.squash = 0.16; it.ry += (h(1) - 0.5) * 0.5; this.write(it); hit = hit || it; continue;
          }
          if (v > 20) { this.burstBag(it, fx, fz, 1, Math.min(1.0, 0.25 + v / 70)); hit = hit || it; continue; }
          // ủi nhẹ một lần rồi xích leo lên đè bẹp (không đẩy túi chạy trước mũi xe)
          if (!it.pushed && !it.flat && v > 2) { it.pushed = true; this.kick(it, fx, fz, 2 + v * 0.5, 3, h); }
        } else if (it.type.startsWith('box')) {
          // thùng các-tông: bị đè là bẹp dí, húc thì văng nhẹ
          if (under && !it.flat) { it.flat = true; it.squash = 0.18; it.ry += (h(1) - 0.5) * 0.6; it.y = this.rest(it.x, it.z); this.write(it); hit = hit || it; continue; }
          // xe chạy chậm: mũi xe ủi thùng trượt / lật một đoạn ngắn rồi xích leo lên cán bẹp; chạy nhanh thì hất văng
          // (ủi một lần: lần chạm sau xe đã đuổi kịp -> lọt xuống xích, không bị đẩy chạy trước mũi xe mãi)
          if (!it.flat && v > 3 && !(v < 16 && it.pushed)) { it.squash = Math.min(it.squash || 1, 0.6); if (v < 16) { it.pushed = true; this.kick(it, fx, fz, 2 + v * 0.55, 3, h); } else this.kick(it, fx, fz, 18 + v * 1.1, 10, h); hit = hit || it; }
        } else if (it.type === 'bin' || it.type === 'binLid') {
          // thùng rác nhựa: xe xích đè lên thùng đang nằm (hoặc đè thẳng từ trên) thì bẹp hẳn; xe chạy chậm húc thì
          // thùng đổ ngã về phía trước rồi bị xích cán; chạy nhanh thì hất văng lăn đi
          const lying = Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8;
          if (under && tracked && (lying || v < 6 || it.type === 'binLid') && !it.flat) {
            it.flat = true; it.dent = 0.45; it.squash = 0.35; it.lidOff = true;
            if (lying && it.type === 'bin') it.y = this.rest(it.x, it.z) + 2.4 * (it.s || 1) * 0.4;   // nằm bẹp: tâm hạ theo bề dày còn lại
            this.write(it); hit = hit || it; continue;
          }
          if (!it.flat && v > 2 && !(tracked && v < 16 && it.pushed)) {
            it.dent = Math.max(0.7, (it.dent || 1) - 0.06 - v * 0.002);
            if (tracked && v < 16 && it.type === 'bin' && !lying) { it.topple = true; it.pushed = true; this.kick(it, fx, fz, 3 + v * 0.5, 4, h, 0.3); }
            else if (tracked && v < 16) { it.pushed = true; this.kick(it, fx, fz, 2 + v * 0.4, 1.5, h, 0.2); }   // đang nằm: lăn nhích rồi bị cán
            else this.kick(it, fx, fz, 20 + v * 1.3, 14, h);
            hit = hit || it;
          }
        } else if (it.type === 'dump') {
          // container rác ~ 200 kg: bị ủi trượt theo xe, móp vỏ; xe khựng nhẹ theo khối lượng
          if (v > 1.5) {
            const k = mU / (mU + J.m);
            it.dent = Math.max(0.6, (it.dent || 1) - 0.03 * Math.min(3, v / 15));
            this.kick(it, fx, fz, Math.min(90, v * k * 1.05), 0.6, h, 0.6);
            if (!unit._netProxy) unit.speed *= Math.pow(0.97, dt * 60);
            hit = hit || it;
          }
        }
      }
      if (hit && (!this._crushSnd || hit !== this._crushSnd.it || performance.now() - this._crushSnd.t > 350)) {
        this._crushSnd = { it: hit, t: performance.now() };
        const kind = hit.type === 'dump' ? 'sheetMetal' : hit.type.startsWith('bag') ? 'leafStrip' : hit.type.startsWith('box') ? 'woodBreak' : 'sheetMetal';
        if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt)
          window.soundEngine.secondaryAt(kind, { x: hit.x, y: hit.y + 2, z: hit.z }, hit.type === 'dump' ? 0.6 : 0.3, { h: 3 });
      }
      this.flushIms();
      if (this.aoDirty) { this.ao.instanceMatrix.needsUpdate = true; this.aoDirty = false; }
    }
    // bể instance vừa ghi (write) -> gửi lên GPU. Phố có ~1.400 bể (loại x ô); trước đây mỗi xe mỗi khung duyệt cả 1.400
    // bể để tìm vài bể bẩn (~70 µs / xe / khung) — giờ chỉ duyệt tập bể bẩn
    flushIms() {
      const D = this.dirtyIms;
      if (!D || !D.size) return;
      for (const e of D) { e.im.instanceMatrix.needsUpdate = true; e.dirty = false; }
      D.clear();
    }
    // hất đồ vật theo hướng (dx, dz) với tốc độ sp, nảy lên up; spin: hệ số xoay
    kick(it, dx, dz, sp, up, h, spin = 1) {
      const J = JK[it.type], m = Math.sqrt(J ? J.m : 1), s = Math.min(140, sp / m) * (0.85 + 0.3 * h(11));
      const side = (h(12) - 0.5) * 0.6;
      it.v = [(dx - dz * side) * s, up * (0.6 + 0.6 * h(13)) / m, (dz + dx * side) * s];
      const w = 5 * spin / m;
      it.w = [(h(14) - 0.5) * w, (h(15) - 0.5) * w, (h(16) - 0.5) * w];
      it.bounce = 0;
      this.moving.add(it);
    }
    update(dt) {
      // ẩn / hiện ô rác theo khoảng cách tới camera (~7 lần / giây)
      this._lodT = (this._lodT || 0) - dt;
      const cam = typeof window !== 'undefined' && window.game && window.game.camera;
      if (cam && this._lodT <= 0) {
        this._lodT = 0.15;
        lodUpdate(this.lod, cam.position);
        if (this.cans && this.cans.lod) lodUpdate(this.cans.lod, cam.position);
      }
      if (cam) {
        const fr = frustumOf(cam);
        viewUpdate(this.lod, fr);
        if (this.cans && this.cans.lod) viewUpdate(this.cans.lod, fr);
      }
      if (this.cans) this.cans.update(dt);
      if (!this.moving.size) return;
      const G = 78.4;
      for (const it of this.moving) {
        // giấy / nilon: rơi tự nhiên, không tính toán vỉa hè đa giác để tránh đứng hình
        if (it.flutter) {
          it.v[1] -= G * 0.6 * dt;
          const dr = Math.exp(-2.5 * dt);
          it.v[0] *= dr; it.v[2] *= dr;
          it.x += it.v[0] * dt; it.y += it.v[1] * dt; it.z += it.v[2] * dt;
          it.rx += it.w[0] * dt; it.ry += it.w[1] * dt; it.rz += it.w[2] * dt;
          const g = this.T.groundAtRaw(it.x, it.z) + 0.12;
          if (it.y <= g) {
            it.y = g; it.rx = 0; it.rz = 0; it.v = null;
            this.moving.delete(it);
          }
        } else {
          it.v[1] -= G * dt;
          it.x += it.v[0] * dt; it.y += it.v[1] * dt; it.z += it.v[2] * dt;
          it.rx += it.w[0] * dt; it.ry += it.w[1] * dt; it.rz += it.w[2] * dt;
          const J = JK[it.type], g = this.rest(it.x, it.z), lie = it.type === 'bin' ? 2.4 : 0;
          if (it.y <= g + lie * 0.3) {
            const spd = Math.hypot(it.v[0], it.v[1], it.v[2]);
            if (it.bounce < 2 && spd > 18) {
              it.bounce++; it.y = g + lie * 0.3; it.v = [it.v[0] * 0.45, -it.v[1] * 0.25, it.v[2] * 0.45]; it.w = it.w.map(a => a * 0.5);
            } else {
              // nằm lại: thùng rác lăn nằm ngang, thùng các-tông / container dựng lại trên đáy
              it.y = g + (lie * 0.3);
              if (it.type === 'bin') { const up = Math.abs(Math.cos(it.rx) * Math.cos(it.rz)); if (up < 0.8 || it.v[1] < -30 || it.topple) { it.rx = 0; it.rz = Math.PI / 2; it.y = g + 2.4 * (it.s || 1) * (it.flat ? 0.4 : 1); } else { it.rx = 0; it.rz = 0; } it.topple = false; }
              else if (it.type === 'binLid') { it.rx = (hash(it.i) - 0.5) * 0.2; it.rz = 0; }
              else { it.rx *= 0.1; it.rz *= 0.1; }
              it.v = null; this.moving.delete(it);
              // ô lưới mới (đồ vật lăn sang ô khác)
              if (it.gk !== undefined) { const L = this.grid.get(it.gk), ix = L ? L.indexOf(it) : -1; if (ix >= 0) L.splice(ix, 1); }
              const k = it.gk = this.key(it.x, it.z); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(it);
            }
          }
        }
        this.write(it);
      }
      this.flushIms();
      if (this.aoDirty) { this.ao.instanceMatrix.needsUpdate = true; this.aoDirty = false; }
    }
  }

  function build(T) {
    const M = T.map;
    if (!M.blocks || !M.blocks.length) return null;
    // dải bờ kênh: sườn đất lòng kênh nằm sau tường kè -> vỉa hè / kè bám cao độ bờ (terrain.canalQuayAt), không võng theo sườn
    const G = (x, z) => { const g = T.groundAtRaw(x, z), q = T.canalQuayAt ? T.canalQuayAt(x, z) : null; return q !== null && q > g ? q : g; };
    // điểm nằm dưới / sát mặt cầu bắc qua kênh (lan can bờ kênh ngắt ở đây, không chắn ngang đường lên cầu)
    const underBridge = (x, z) => (M.bridges || []).some(b => {
      const fx = Math.sin(b.angle), fz = Math.cos(b.angle), dx = x - b.x, dz = z - b.z;
      return Math.abs(dx * fx + dz * fz) < b.length / 2 + 4 && Math.abs(-dx * fz + dz * fx) < b.width / 2 + 6;
    });
    const group = new THREE.Group(); group.name = 'streetscape';
    const pave = Builder(), curb = Builder(), quay = Builder(), rail = Builder(), deco = Builder();
    const gut = Builder(), metal = Builder(), soil = Builder();
    const up = [0, 1, 0], MP = M.props || {};
    const lerp = (a, b, t) => a + (b - a) * t;

    // tra nhanh điểm nằm trên vỉa hè (trong mép bó vỉa, ngoài mép đất xây dựng): cỏ 3D không mọc xuyên vỉa hè, ô gốc cây
    const BH = 512, hashB = new Map();
    for (const B of M.blocks) {
      const xs = B.curb.map(p => p[0]), zs = B.curb.map(p => p[1]);
      for (let j = Math.floor(Math.min(...zs) / BH); j <= Math.floor(Math.max(...zs) / BH); j++)
        for (let i = Math.floor(Math.min(...xs) / BH); i <= Math.floor(Math.max(...xs) / BH); i++) {
          const k = i * 4096 + j; if (!hashB.has(k)) hashB.set(k, []); hashB.get(k).push(B);
        }
    }
    const inQuad = (Q, x, z) => {
      let sg = 0;
      for (let k = 0; k < 4; k++) {
        const a = Q[k], b = Q[(k + 1) % 4], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
        if (c !== 0) { if (sg && Math.sign(c) !== sg) return false; sg = Math.sign(c); }
      }
      return true;
    };
    const blockAt = (x, z) => (hashB.get(Math.floor(x / BH) * 4096 + Math.floor(z / BH)) || []).find(B => inQuad(B.curb, x, z) && !inQuad(B.lot, x, z));
    const covers = (x, z) => !!blockAt(x, z);

    // ===== DỐC VỈA HÈ Ở 2 ĐẦU VẠCH QUA ĐƯỜNG: vỉa hè + bó vỉa hạ dần xuống sát mặt máng (đáy dốc rộng bằng vạch + 2 cánh vát
    // 1,5 m, dốc sâu 2 m vào trong vỉa hè); đáy dốc lát gạch xúc giác (walkShader)
    const RAMP_IN = 2, RAMP_D = 16, FLARE = 12, XB = 128, xHash = new Map();
    const XS = (MP.crossings || []).filter(c => !c.stop).map(c => { const dx = Math.sin(c.angle), dz = Math.cos(c.angle); return { x: c.x, z: c.z, dx, dz, ax: dz, az: -dx, hw: c.w / 2, hd: c.d / 2 + 1 }; });
    for (const c of XS) {
      const r = c.hw + RAMP_D + 40;
      for (let i = Math.floor((c.x - r) / XB); i <= Math.floor((c.x + r) / XB); i++)
        for (let j = Math.floor((c.z - r) / XB); j <= Math.floor((c.z + r) / XB); j++) { const k = i * 4096 + j; if (!xHash.has(k)) xHash.set(k, []); xHash.get(k).push(c); }
    }
    const xNear = (x, z) => xHash.get(Math.floor(x / XB) * 4096 + Math.floor(z / XB)) || [];
    // [t: cách tâm vạch dọc phố, D: cách mép bó vỉa vào trong vỉa hè]
    const xFrame = (c, x, z) => { const ox = x - c.x, oz = z - c.z; return [Math.abs(ox * c.dx + oz * c.dz), Math.abs(ox * c.ax + oz * c.az) - c.hw]; };
    // mức hạ dốc: 0 = vỉa hè cao nguyên, 1 = đáy dốc
    const rampLow = (x, z) => {
      let low = 0;
      for (const c of xNear(x, z)) {
        const [t, D] = xFrame(c, x, z);
        if (D < -6 || D > RAMP_D || t > c.hd + FLARE) continue;
        const k = Math.min(1, (c.hd + FLARE - t) / FLARE) * Math.min(1, (RAMP_D - D) / (RAMP_D - RAMP_IN));
        if (k > low) low = k;
      }
      return low;
    };
    const rampNear = (x, z) => xNear(x, z).some(c => { const [t, D] = xFrame(c, x, z); return D > -10 && D < RAMP_D + 8 && t < c.hd + FLARE + 8; });
    // mặt nhựa lòng đường (terrain.buildRoads: nền + bù gờ nền + nâng 0,3-0,45): máng bê tông, nắp ga lòng đường nằm trên
    const roadY = (x, z) => {
      const g = T.groundAtRaw(x, z); let b = 0;
      for (const [ux, uz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) b = Math.max(b, T.groundAtRaw(x + ux, z + uz) - (g + T.groundAtRaw(x + ux * 2, z + uz * 2)) / 2);
      return g + Math.min(b, 1.2) + 0.5;
    };
    // độ cao mặt vỉa hè trên nền G: bậc 15 cm, ở dốc qua đường hạ dần tới sát mặt máng
    const WH = (x, z) => { const low = rampLow(x, z); if (!low) return CURB_H; const fl = Math.min(CURB_H, roadY(x, z) - G(x, z) + 0.07); return CURB_H - low * (CURB_H - fl); };
    const top = (x, z) => G(x, z) + WH(x, z);

    // đồ gang dán phẳng (nắp ga, song chắn rác, tấm ghi gốc cây): hình chữ nhật tâm (cx, cz), trục e, nửa cạnh hu x hv
    const AR = (qx, qy) => [(qx * 256 + 10) / 512, 1 - (qy * 256 + 246) / 512, (qx * 256 + 246) / 512, 1 - (qy * 256 + 10) / 512];
    const AT = { round: AR(0, 0), square: AR(1, 0), grate: AR(0, 1), tree: AR(1, 1) };
    const decal = (cx, cz, ex, ez, hu, hv, y, r, col) => {
      const nx = -ez, nz = ex;
      const p = [[-hu, -hv, r[0], r[1]], [hu, -hv, r[2], r[1]], [hu, hv, r[2], r[3]], [-hu, hv, r[0], r[3]]]
        .map(([u, v, tu, tv]) => metal.v(cx + ex * u + nx * v, y, cz + ez * u + nz * v, tu, tv, ...up, col || [1, 1, 1]));
      metal.quad(p[0], p[1], p[2], p[3]);
    };
    // vật đã có trên vỉa hè (cây, cột đèn / điện, đèn tín hiệu, nhà chờ) -> nắp ga tránh
    const OBS = [];
    for (const t of M.trees || []) OBS.push([t.x, t.z, 10]);
    for (const L of [MP.lamps, MP.signals, MP.poles, MP.busStops]) for (const o of L || []) OBS.push([o.x, o.z, 6]);
    const freeAt = (x, z, r) => !OBS.some(o => Math.abs(o[0] - x) < o[2] + r && Math.abs(o[1] - z) < o[2] + r && Math.hypot(o[0] - x, o[1] - z) < o[2] + r);

    // ===== VỈA HÈ + BÓ VỈA + MÁNG (mỗi ô phố)
    const wA = [], wB = [], wT = [];   // thuộc tính đỉnh của mặt lát (walkShader), cùng thứ tự đỉnh với pave
    const pv = (x, z, y, uv, dC, dL, low, wb, ax, col) => { wA.push(dC, dL, low); wB.push(wb[0], wb[1]); wT.push(ax[0], ax[1], ax[2], ax[3]); return pave.v(x, y, z, uv[0], uv[1], ...up, col); };
    for (const B of M.blocks) {
      const O = outline(B), n = O.length, L = B.lot;
      // kiểu lát theo công năng ô phố + tông riêng từng ô
      const hk = hash(Math.round(B.cx) * 7 + Math.round(B.cz) * 13), hk2 = hash(Math.round(B.cx) * 11 + Math.round(B.cz) * 5 + 3);
      const use = B.use || 'mixed', soft = /park|suburb|school|church|hospital/.test(use);
      const pat = use === 'industrial' || use === 'parking' ? (hk < 0.75 ? 2 : 0)
        : soft ? (hk < 0.5 ? 2 : hk < 0.8 ? 0 : 1)
        : use === 'cbd' || use === 'plaza' ? (hk < 0.55 ? 3 : hk < 0.85 ? 0 : 1) : (hk < 0.45 ? 0 : hk < 0.75 ? 1 : 3);
      const wb = [pat, soft ? 1 : 0.4], tn = 0.93 + 0.14 * hk2, pc = [tn, tn, tn * (0.97 + 0.04 * hk)];
      // hệ trục lát: hàng viên song song cạnh 0, gốc ở mép trong bó vỉa cạnh 0 (mét); lệch gốc dọc theo ô -> viên hỏng khác chỗ
      const C0 = B.curb[0], C1 = B.curb[1], e0 = Math.hypot(C1[0] - C0[0], C1[1] - C0[1]) || 1, tx = (C1[0] - C0[0]) / e0, tz = (C1[1] - C0[1]) / e0;
      let vx = -tz, vz = tx; if ((B.cx - C0[0]) * vx + (B.cz - C0[1]) * vz < 0) { vx = -vx; vz = -vz; }
      const su = Math.floor(hk2 * 400) * 3, ax = [tx, tz, vx, vz];
      const UV = (x, z) => [((x - C0[0]) * tx + (z - C0[1]) * tz) / 8 + su, ((x - C0[0]) * vx + (z - C0[1]) * vz - CURB_W) / 8];
      // điểm mép trong vỉa hè (giáp đất xây dựng) cho từng điểm viền
      const inner = O.map(o => {
        if (o.straight) { const w = B.walk[o.edge]; return [o.x + o.nx * w, o.z + o.nz * w]; }
        return L[o.corner];   // điểm trên cung bo: quạt về góc đất xây dựng
      });
      // viền tinh: quanh dốc qua đường chia mỗi ~3 đv để mặt dốc / bó vỉa hạ bám đúng hình
      const Rr = [];
      for (let i = 0; i < n; i++) {
        const a = O[i], b = O[(i + 1) % n], ia = inner[i], ib = inner[(i + 1) % n];
        const sub = rampNear(a.x, a.z) || rampNear(b.x, b.z) || rampNear((a.x + b.x) / 2, (a.z + b.z) / 2) ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3)) : 1;
        for (let k = 0; k < sub; k++) {
          const t = k / sub, nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t), nl = Math.hypot(nx, nz) || 1;
          Rr.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), nx: nx / nl, nz: nz / nl, edge: a.edge, e2: b.edge, fine: sub > 1, inn: ia === ib ? ia : [lerp(ia[0], ib[0], t), lerp(ia[1], ib[1], t)] });
        }
      }
      const m = Rr.length, S = [0], GW = 2.4;
      for (let i = 0; i < m; i++) { const a = Rr[i], b = Rr[(i + 1) % m]; S.push(S[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
      // mặt máng tại mép bó vỉa / mép ngoài máng của từng điểm viền
      const ryI = Rr.map(p => roadY(p.x, p.z) + 0.03), ryO = Rr.map(p => roadY(p.x - p.nx * GW, p.z - p.nz * GW) + 0.03);
      for (let i = 0; i < m; i++) {
        const a = Rr[i], b = Rr[(i + 1) % m];
        // gạch lát: từ mép trong bó vỉa tới mép đất xây dựng; cạnh dốc thêm 1 hàng đỉnh ở chân dốc (mặt dốc phẳng)
        const rowOf = (p) => { const sx = p.x + p.nx * CURB_W, sz = p.z + p.nz * CURB_W; return { sx, sz, q: p.inn, Lw: Math.hypot(p.inn[0] - sx, p.inn[1] - sz) }; };
        const ra = rowOf(a), rb = rowOf(b), mid = (a.fine || b.fine) && Math.min(ra.Lw, rb.Lw) > RAMP_D + 1;
        const verts = (r) => {
          const pts = [[r.sx, r.sz, 0, r.Lw]];
          if (mid) { const f = (RAMP_D - CURB_W) / r.Lw; pts.push([lerp(r.sx, r.q[0], f), lerp(r.sz, r.q[1], f), RAMP_D - CURB_W, r.Lw - RAMP_D + CURB_W]); }
          pts.push([r.q[0], r.q[1], r.Lw, 0]);
          return pts.map(([x, z, dC, dL]) => pv(x, z, top(x, z) + 0.02, UV(x, z), dC, dL, rampLow(x, z), wb, ax, pc));
        };
        const A = verts(ra), Bv = verts(rb);
        for (let j = 0; j < A.length - 1; j++) {
          if (a.inn === b.inn && j === A.length - 2) pave.tri(A[j], Bv[j], A[j + 1]);   // quạt về góc đất xây dựng
          else pave.quad(A[j], A[j + 1], Bv[j + 1], Bv[j]);
        }
        // máng bê tông 30 cm sát chân bó vỉa, trên mặt nhựa (bờ kênh không có)
        if (B.side[a.edge] !== 'canal' && B.side[a.e2] !== 'canal' && B.side[b.edge] !== 'canal') {
          const i1 = (i + 1) % m, cI = [0.74, 0.73, 0.7], cO = [1, 1, 1];
          const g0 = gut.v(a.x, ryI[i], a.z, S[i] / 32, 0, ...up, cI), g1 = gut.v(b.x, ryI[i1], b.z, S[i + 1] / 32, 0, ...up, cI);
          const g2 = gut.v(b.x - b.nx * GW, ryO[i1], b.z - b.nz * GW, S[i + 1] / 32, 0.3, ...up, cO), g3 = gut.v(a.x - a.nx * GW, ryO[i], a.z - a.nz * GW, S[i] / 32, 0.3, ...up, cO);
          gut.quad(g0, g1, g2, g3);
        }
      }
      // bó vỉa: từng viên đá ~1,5 m (mạch texture trùng mép viên), mỗi viên tông riêng, nhô cao thấp chút ít, vài viên chúc / sụt
      // hẳn mép ngoài; chỗ 2 viên kề chênh nhau có mặt cắt che khe; mặt trên (dải 20 cm) + mặt đứng ra lòng đường. Đoạn thẳng /
      // cung chỉ lấy 2 đầu viên, quanh dốc qua đường giữ mọi điểm viền tinh (bám mặt dốc)
      const tot = S[m], nSt = Math.max(1, Math.round(tot / 12)), SL = tot / nSt, sd = Math.round(B.cx) * 31 + Math.round(B.cz) * 17;
      const ptAt = (i, s) => {
        const a = Rr[i % m], b = Rr[(i + 1) % m], t = (s - S[i]) / ((S[i + 1] - S[i]) || 1), nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t), nl = Math.hypot(nx, nz) || 1;
        return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), nx: nx / nl, nz: nz / nl, s };
      };
      const stP = [];
      for (let j = 0; j < nSt; j++) {
        const h = (q) => hash(sd + j * 13 + q * 7919);
        stP.push({ rise: h(1) * 0.03, drop: h(2) < 0.1 ? 0.1 + h(3) * 0.22 : 0, ts: 0.8 + 0.28 * h(4) });
      }
      let si = 0;
      for (let j = 0; j < nSt; j++) {
        const s0 = j * SL, s1 = j === nSt - 1 ? tot : (j + 1) * SL;
        while (si < m - 1 && S[si + 1] <= s0) si++;
        const pts = [ptAt(si, s0)];
        let k = si;
        while (k < m - 1 && S[k + 1] < s1) { k++; if (Rr[k].fine && k % 2 === 0) pts.push({ x: Rr[k].x, z: Rr[k].z, nx: Rr[k].nx, nz: Rr[k].nz, s: S[k] }); }
        pts.push(ptAt(k, s1));
        const { rise, drop, ts } = stP[j], cT = [ts, ts, ts * 0.98], cF = cT.map(c => c * 0.92), cB = cT.map(c => c * 0.7);
        const yo = p => top(p.x, p.z) + rise - drop, yi = p => top(p.x + p.nx * CURB_W, p.z + p.nz * CURB_W) + 0.02 + rise;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (b.s - a.s < 1e-3) continue;
          const a2 = [a.x + a.nx * CURB_W, a.z + a.nz * CURB_W], b2 = [b.x + b.nx * CURB_W, b.z + b.nz * CURB_W], ya = yo(a), yb = yo(b);
          const c0 = curb.v(a.x, ya, a.z, a.s / 48, 0, ...up, cT), c1 = curb.v(b.x, yb, b.z, b.s / 48, 0, ...up, cT);
          const c2 = curb.v(b2[0], yi(b), b2[1], b.s / 48, 0.12, ...up, cT), c3 = curb.v(a2[0], yi(a), a2[1], a.s / 48, 0.12, ...up, cT);
          curb.quad(c0, c3, c2, c1);
          const fx = -(a.nx + b.nx) / 2, fz = -(a.nz + b.nz) / 2;
          const d0 = curb.v(a.x, ya, a.z, a.s / 48, 0.2, fx, 0, fz, cF), d1 = curb.v(b.x, yb, b.z, b.s / 48, 0.2, fx, 0, fz, cF);
          const d2 = curb.v(b.x, G(b.x, b.z) - 0.4, b.z, b.s / 48, 0.35, fx, 0, fz, cB), d3 = curb.v(a.x, G(a.x, a.z) - 0.4, a.z, a.s / 48, 0.35, fx, 0, fz, cB);
          curb.quad(d0, d1, d2, d3);
        }
        // mặt cắt ở đầu cuối viên, quay về phía viên kề thấp hơn
        const nb = stP[(j + 1) % nSt], dh = (rise - drop) - (nb.rise - nb.drop);
        if (Math.abs(dh) > 0.025 || Math.abs(rise - nb.rise) > 0.025) {
          const p = pts[pts.length - 1], q = pts[pts.length - 2];
          let ex = p.x - q.x, ez = p.z - q.z; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
          if (dh < 0) { ex = -ex; ez = -ez; }
          const hi = dh >= 0 ? stP[j] : nb, p2 = [p.x + p.nx * CURB_W, p.z + p.nz * CURB_W], y0 = top(p.x, p.z) + hi.rise - hi.drop, y1 = top(p2[0], p2[1]) + 0.02 + hi.rise;
          const k0 = curb.v(p.x, y0, p.z, 0, 0.2, ex, 0, ez, cF), k1 = curb.v(p2[0], y1, p2[1], 0.05, 0.2, ex, 0, ez, cF);
          const k2 = curb.v(p2[0], y1 - 0.5, p2[1], 0.05, 0.3, ex, 0, ez, cB), k3 = curb.v(p.x, y0 - 0.5, p.z, 0, 0.3, ex, 0, ez, cB);
          curb.quad(k0, k1, k2, k3);
        }
      }
      // mép trong vỉa hè giáp sân / nhà: gờ đứng thấp xuống mặt đất lô (lô thấp hơn vỉa hè 15 cm)
      for (let i = 0; i < n; i++) {
        const ia = inner[i], ib = inner[(i + 1) % n];
        if (ia === ib) continue;
        const yA = top(ia[0], ia[1]) + 0.02, yB = top(ib[0], ib[1]) + 0.02, ex = ib[0] - ia[0], ez = ib[1] - ia[1], el = Math.hypot(ex, ez) || 1;
        const nx = ez / el, nz = -ex / el;
        const e0 = curb.v(ia[0], yA, ia[1], 0, 0.5, nx, 0, nz, [0.8, 0.8, 0.8]), e1 = curb.v(ib[0], yB, ib[1], el / 16, 0.5, nx, 0, nz, [0.8, 0.8, 0.8]);
        const e2 = curb.v(ib[0], G(ib[0], ib[1]) - 0.3, ib[1], el / 16, 0.6, nx, 0, nz, [0.6, 0.6, 0.6]), e3 = curb.v(ia[0], G(ia[0], ia[1]) - 0.3, ia[1], 0, 0.6, nx, 0, nz, [0.6, 0.6, 0.6]);
        curb.quad(e0, e1, e2, e3);
      }
      // miệng thu nước mưa (song chắn rác trên máng + khe hàm ếch tối ở mặt bó vỉa), nắp ga / nắp bể cáp trên vỉa hè, nắp ga
      // giữa lòng đường — theo phần thẳng từng cạnh, tránh dốc qua đường / cây / cột
      for (let k = 0; k < 4; k++) {
        if (B.side[k] === 'canal') continue;
        const st = O.filter(o => o.straight && o.edge === k);
        if (!st.length) continue;
        const Ck = B.curb[k], Ck1 = B.curb[(k + 1) % 4], len = Math.hypot(Ck1[0] - Ck[0], Ck1[1] - Ck[1]) || 1, ex = (Ck1[0] - Ck[0]) / len, ez = (Ck1[1] - Ck[1]) / len;
        const nx = st[0].nx, nz = st[0].nz, w = B.walk[k];
        const ss = st.map(o => (o.x - Ck[0]) * ex + (o.z - Ck[1]) * ez), sMin = Math.min(...ss), sMax = Math.max(...ss);
        const at = (s, d) => [Ck[0] + ex * s + nx * d, Ck[1] + ez * s + nz * d];
        const hs = (q) => hash(sd + k * 1013 + q * 7);
        for (let s = sMin + 14 + hs(1) * 60, q = 0; s < sMax - 14; s += 150 + hs(q + 2) * 110, q++) {
          const [x, z] = at(s, 0);
          if (rampNear(x, z)) continue;
          const ry = roadY(x, z);
          decal(x - nx * 1.25, z - nz * 1.25, ex, ez, 3.2, 1.05, ry + 0.06, AT.grate);
          const ty = Math.min(top(x, z) - 0.3, ry + 0.75), o = 0.07;
          const p = [[-3.4, ry], [3.4, ry], [3.4, ty], [-3.4, ty]].map(([u, yy]) => deco.v(x + ex * u - nx * o, yy, z + ez * u - nz * o, 0, 0, -nx, 0, -nz, [0.5, 0.5, 0.5]));
          deco.quad(p[0], p[1], p[2], p[3]);
        }
        if (w >= 12) for (let s = sMin + 10 + hs(40) * 50, q = 0; s < sMax - 10; s += 70 + hs(q + 41) * 90, q++) {
          if (hs(q + 80) > 0.6) continue;
          const [x, z] = at(s, 3.5 + hs(q + 81) * (w - 7));
          if (rampNear(x, z) || !freeAt(x, z, 4)) continue;
          const round = hs(q + 82) < 0.65, r = round ? 2.5 : 2.7, tc = 0.8 + 0.3 * hs(q + 83);
          decal(x, z, ex, ez, r, r, top(x, z) + 0.06, round ? AT.round : AT.square, [tc, tc, tc]);
          OBS.push([x, z, r]);
        }
        for (let s = sMin + 30 + hs(60) * 120, q = 0; s < sMax - 30; s += 200 + hs(q + 61) * 160, q++) {
          if (hs(q + 90) > 0.55) continue;
          const [x, z] = at(s, -(14 + hs(q + 91) * 10));
          if (xNear(x, z).some(c => xFrame(c, x, z)[0] < c.hd + 16)) continue;
          decal(x, z, ex, ez, 2.5, 2.5, roadY(x, z) + 0.1, AT.round);
        }
      }
    }

    // ===== Ô GỐC CÂY trên vỉa hè: khung bó bê tông nổi 1,5 cm, lòng đất phủ lá mục / cỏ dại, 1/3 có tấm ghi gang
    for (const t of M.trees || []) {
      const B = blockAt(t.x, t.z);
      if (!B) continue;
      let best = 1e9, ex = 1, ez = 0, dLot = 1e9;
      for (let k = 0; k < 4; k++) {
        const a = B.curb[k], b = B.curb[(k + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
        const d = Math.abs((t.x - a[0]) * uz - (t.z - a[1]) * ux);
        if (d < best) {
          best = d; ex = ux; ez = uz;
          const p = B.lot[k], q = B.lot[(k + 1) % 4], ll = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          dLot = Math.abs((t.x - p[0]) * (q[1] - p[1]) - (t.z - p[1]) * (q[0] - p[0])) / ll;
        }
      }
      const hs = Math.min(4.8, best - CURB_W - 0.6, dLot - 0.4);
      if (hs < 2.6) continue;
      const nx = -ez, nz = ex, y = top(t.x, t.z) + 0.02, ys = y + 0.04, yf = y + 0.14, hi = hs - 0.8;
      const P4 = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]].map(([u, v]) => [t.x + ex * u + nx * v, t.z + ez * u + nz * v]);
      const Po = P4(hs), Pi = P4(hi);
      const ht = hash(Math.round(t.x) * 3 + Math.round(t.z) * 7), cc = [0.86 + 0.12 * ht, 0.86 + 0.12 * ht, 0.84 + 0.12 * ht], cd = cc.map(v => v * 0.6);
      for (let k = 0; k < 4; k++) {
        const a = Po[k], b = Po[(k + 1) % 4], c = Pi[(k + 1) % 4], d = Pi[k];
        const q0 = curb.v(a[0], yf, a[1], 0, 0, ...up, cc), q1 = curb.v(b[0], yf, b[1], hs / 16, 0, ...up, cc), q2 = curb.v(c[0], yf, c[1], hs / 16, 0.1, ...up, cc), q3 = curb.v(d[0], yf, d[1], 0, 0.1, ...up, cc);
        curb.quad(q0, q1, q2, q3);
        const mx = (a[0] + b[0]) / 2 - t.x, mz = (a[1] + b[1]) / 2 - t.z, ml = Math.hypot(mx, mz) || 1, ox = mx / ml, oz = mz / ml;
        const f0 = curb.v(a[0], yf, a[1], 0, 0.2, ox, 0, oz, cc), f1 = curb.v(b[0], yf, b[1], hs / 16, 0.2, ox, 0, oz, cc);
        const f2 = curb.v(b[0], y - 0.15, b[1], hs / 16, 0.3, ox, 0, oz, cc), f3 = curb.v(a[0], y - 0.15, a[1], 0, 0.3, ox, 0, oz, cc);
        curb.quad(f0, f1, f2, f3);
        const i0 = curb.v(d[0], yf, d[1], 0, 0.2, -ox, 0, -oz, cc), i1 = curb.v(c[0], yf, c[1], hs / 16, 0.2, -ox, 0, -oz, cc);
        const i2 = curb.v(c[0], ys - 0.1, c[1], hs / 16, 0.3, -ox, 0, -oz, cd), i3 = curb.v(d[0], ys - 0.1, d[1], 0, 0.3, -ox, 0, -oz, cd);
        curb.quad(i0, i1, i2, i3);
      }
      const sc = 0.85 + 0.25 * ht, s4 = Pi.map(([x, z]) => soil.v(x, ys, z, x / 10, z / 10, ...up, [sc, sc, sc]));
      soil.quad(s4[0], s4[1], s4[2], s4[3]);
      if (ht < 0.35 && hi >= 3.2) decal(t.x, t.z, ex, ez, hi, hi, ys + 0.04, AT.tree);
    }

    // ===== KÈ KÊNH + LAN CAN + TƯỜNG ĐẦU CỐNG
    for (const c of M.canals || []) {
      const ca = Math.cos(c.rot), sa = Math.sin(c.rot), W = (u, v) => [u * ca - v * sa, u * sa + v * ca];
      const bed = -12.5;
      for (const sg of [1, -1]) {
        const u = c.a + sg * c.hw, uo = c.a + sg * (c.hw + 10);
        const nx = -sg * ca, nz = -sg * sa;   // mặt kè quay vào lòng kênh
        for (let v = -c.vEnd; v < c.vEnd; v += 16) {
          const v1 = Math.min(c.vEnd, v + 16), [x0, z0] = W(u, v), [x1, z1] = W(u, v1);
          const t0 = G(...W(uo, v)) + CURB_H, t1 = G(...W(uo, v1)) + CURB_H;
          const a = quay.v(x0, t0, z0, v / 32, 0, nx, 0, nz, [1, 1, 1]), b = quay.v(x1, t1, z1, v1 / 32, 0, nx, 0, nz, [1, 1, 1]);
          const d = quay.v(x0, bed, z0, v / 32, 1, nx, 0, nz, [0.7, 0.72, 0.68]), e = quay.v(x1, bed, z1, v1 / 32, 1, nx, 0, nz, [0.7, 0.72, 0.68]);
          quay.quad(a, b, e, d);
          // lan can sắt: tay vịn cao 1 m + cọc mỗi 2 m, lùi 0,5 m khỏi mép kè; ngắt ở chân cầu
          const ux = W(u + sg * 4, v), uy = W(u + sg * 4, v1);
          if (underBridge(ux[0], ux[1]) || underBridge(uy[0], uy[1])) continue;
          const r0 = rail.v(ux[0], t0 + 8, ux[1], 0, 0, ...up, [1, 1, 1]), r1 = rail.v(uy[0], t1 + 8, uy[1], 0, 0, ...up, [1, 1, 1]);
          const r2 = rail.v(uy[0], t1 + 7.2, uy[1], 0, 0, nx, 0, nz, [0.7, 0.7, 0.7]), r3 = rail.v(ux[0], t0 + 7.2, ux[1], 0, 0, nx, 0, nz, [0.7, 0.7, 0.7]);
          rail.quad(r0, r1, r2, r3);
          const q0 = rail.v(ux[0] - 0.3 * ca, t0, ux[1] - 0.3 * sa, 0, 0, nx, 0, nz, [0.8, 0.8, 0.8]), q1 = rail.v(ux[0] + 0.3 * ca, t0, ux[1] + 0.3 * sa, 0, 0, nx, 0, nz, [0.8, 0.8, 0.8]);
          const q2 = rail.v(ux[0] + 0.3 * ca, t0 + 8, ux[1] + 0.3 * sa, 0, 0, nx, 0, nz, [0.8, 0.8, 0.8]), q3 = rail.v(ux[0] - 0.3 * ca, t0 + 8, ux[1] - 0.3 * sa, 0, 0, nx, 0, nz, [0.8, 0.8, 0.8]);
          rail.quad(q0, q1, q2, q3);
        }
      }
      // tường đầu cống ngầm: chắn ngang 2 đầu kênh, miệng cống tối
      for (const sv of [1, -1]) {
        const v = sv * c.vEnd, nx = sv * sa, nz = -sv * ca;
        const [x0, z0] = W(c.a - c.hw, v), [x1, z1] = W(c.a + c.hw, v), th = Math.max(G(...W(c.a - c.hw - 10, v)), G(...W(c.a + c.hw + 10, v))) + CURB_H;
        const a = quay.v(x0, th, z0, 0, 0, nx, 0, nz, [1, 1, 1]), b = quay.v(x1, th, z1, c.hw / 16, 0, nx, 0, nz, [1, 1, 1]);
        const d = quay.v(x0, bed, z0, 0, 1, nx, 0, nz, [0.7, 0.72, 0.68]), e = quay.v(x1, bed, z1, c.hw / 16, 1, nx, 0, nz, [0.7, 0.72, 0.68]);
        quay.quad(a, b, e, d);
        // miệng cống: 2 ô vòm chữ nhật tối sát mặt nước
        for (const k of [-0.5, 0.5]) {
          const [mx, mz] = W(c.a + k * c.hw, v), w = c.hw * 0.38, ex = ca * w, ez = sa * w, o = 0.4;
          const y0 = -2, y1 = 8;
          const p = [[mx - ex, y0, mz - ez], [mx + ex, y0, mz + ez], [mx + ex, y1, mz + ez], [mx - ex, y1, mz - ez]].map(([x, y, z]) => deco.v(x + nx * o, y, z + nz * o, 0, 0, nx, 0, nz, [0.08, 0.08, 0.08]));
          deco.quad(p[0], p[1], p[2], p[3]);
        }
      }
    }

    // ===== MẢNG NHỰA LÒNG NGÃ TƯ (nhựa trơn, nằm dưới dải đường có vạch; vỉa hè cao hơn che phần thừa ở góc)
    const J = Builder(), plain = [1, 1, 1];
    for (const j of (M.props && M.props.junctions) || []) {
      const d1x = Math.sin(j.a1), d1z = Math.cos(j.a1), d2x = Math.sin(j.a2), d2z = Math.cos(j.a2), S = 6;
      const idx = [];
      for (let a = 0; a <= S; a++) for (let b = 0; b <= S; b++) {
        let s1 = (a / S - 0.5) * j.l1, s2 = (b / S - 0.5) * j.l2;
        // vát 4 góc: phần góc ô vuông nằm trong góc lô (thấp hơn vỉa hè) bị kéo về đường chéo nằm giữa cung bó vỉa và góc lô
        if (j.h1 !== undefined) {
          const e1 = Math.abs(s1) - j.h1, e2 = Math.abs(s2) - j.h2, cut = j.w1 + j.w2 - 2;
          if (e1 > 0 && e2 > 0 && e1 + e2 > cut) { const k = (e1 + e2 - cut) / 2; s1 = Math.sign(s1) * (Math.abs(s1) - k); s2 = Math.sign(s2) * (Math.abs(s2) - k); }
        }
        const x = j.x + d1x * s1 + d2x * s2, z = j.z + d1z * s1 + d2z * s2;
        idx.push(J.v(x, G(x, z) + 0.26, z, x / 64, z / 64, ...up, plain));
      }
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
        const i0 = a * (S + 1) + b, i1 = i0 + 1, i2 = i0 + S + 1, i3 = i2 + 1;
        J.quad(idx[i0], idx[i1], idx[i3], idx[i2]);
      }
    }

    // ===== VẠCH QUA ĐƯỜNG (sọc 50 cm dọc chiều xe, cách 50 cm) + VẠCH DỪNG
    const Z = Builder(), white = [1, 1, 1];
    const rect = (cx, cz, ax, az, bx, bz, hu, hv, col) => {
      // hình chữ nhật tâm (cx, cz), nửa cạnh hu theo trục a, hv theo trục b, chia 2 x 2 bám địa hình
      const pts = [];
      for (let i = 0; i <= 2; i++) for (let k = 0; k <= 2; k++) {
        const s = (i - 1) * hu, t = (k - 1) * hv, x = cx + ax * s + bx * t, z = cz + az * s + bz * t;
        pts.push(Z.v(x, G(x, z) + 0.62, z, 0, 0, ...up, col));
      }
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) { const a = i * 3 + k; Z.quad(pts[a], pts[a + 3], pts[a + 4], pts[a + 1]); }
    };
    for (const c of (M.props && M.props.crossings) || []) {
      const dx = Math.sin(c.angle), dz = Math.cos(c.angle), ax = dz, az = -dx;   // a: ngang đường, d: dọc đường
      const wear = 0.82 + hash(Math.round(c.x) * 3 + Math.round(c.z)) * 0.18, col = [wear, wear, wear * 0.97];
      if (c.stop) { rect(c.x, c.z, ax, az, dx, dz, c.w / 2, c.d / 2, col); continue; }
      for (let s = -c.w / 2 + 6; s <= c.w / 2 - 6; s += 8) rect(c.x + ax * s, c.z + az * s, ax, az, dx, dz, 2, c.d / 2, col);
    }

    const add = (m) => { if (m) group.add(m); };
    const paveMat = walkShader(new THREE.MeshStandardMaterial({ map: grainTex(), vertexColors: true, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }));
    const gutMat = grime(new THREE.MeshStandardMaterial({ map: stoneTex('gutter', '#8b8880'), vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }), 1.3);
    const metalTex = metalAtlas();
    const metalMat = new THREE.MeshStandardMaterial({ map: metalTex, bumpMap: metalTex, bumpScale: 0.5, alphaTest: 0.5, vertexColors: true, roughness: 0.72, metalness: 0.3,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, side: THREE.DoubleSide });
    const soilMat = grime(new THREE.MeshStandardMaterial({ map: soilTex(), vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }), 0.5);
    const curbMat = grime(new THREE.MeshStandardMaterial({ map: stoneTex('curb', '#9d9a92'), vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), 0.8);
    const quayMat = new THREE.MeshStandardMaterial({ map: stoneTex('quay', '#9c9a90'), vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3c4a44, vertexColors: true, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
    const decoMat = new THREE.MeshStandardMaterial({ color: 0x111111, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    // lòng ngã tư: cùng texture + shader mặt đường (terrain.roadShader) -> không lộ đường nối khác hạt / khác tông ở mép
    const jMat = new THREE.MeshStandardMaterial({ map: T.roadTexture ? T.roadTexture('asphalt', true) : null, color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    if (T.roadShader) T.roadShader(jMat, 'asphalt', true); else grime(jMat, 1);
    const zMat = grime(new THREE.MeshStandardMaterial({ color: 0xbebcb4, vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, side: THREE.DoubleSide }), 1.4, true);
    {
      const pm = pave.mesh(paveMat, 'sidewalk');
      if (pm) { pm.geometry.setAttribute('wA', new THREE.Float32BufferAttribute(wA, 3)); pm.geometry.setAttribute('wB', new THREE.Float32BufferAttribute(wB, 2)); pm.geometry.setAttribute('wT', new THREE.Float32BufferAttribute(wT, 4)); add(pm); }
    }
    add(curb.mesh(curbMat, 'curb'));
    add(gut.mesh(gutMat, 'gutter'));
    add(metal.mesh(metalMat, 'street_metal'));
    add(soil.mesh(soilMat, 'tree_pit_soil'));
    add(quay.mesh(quayMat, 'quay_wall'));
    add(rail.mesh(railMat, 'quay_rail'));
    add(deco.mesh(decoMat, 'culvert'));
    { const jm = J.mesh(jMat, 'junction_asphalt'); if (jm) { jm.geometry.setAttribute('rdJ', new THREE.Float32BufferAttribute(new Float32Array(jm.geometry.attributes.position.count), 1)); add(jm); } }
    add(Z.mesh(zMat, 'road_paint'));
    const junkSet = junk(T, M, G, add, WH);
    for (const m of group.children) if (m.name === 'curb' || m.name === 'quay_wall' || m.name === 'quay_rail') m.castShadow = true;
    T.group.add(group);
    junkSet.onWalk = covers; junkSet.walkH = WH;
    return { group, covers, junk: junkSet };
  }

  // JunkSet / buildCans / LID_ALT: phòng thử cảnh vật dựng đúng đồ rác của game theo danh sách tự chọn
  return { build, CURB_H, junkProtos, bottleProtos, BAG_COL, BIN_COL, DUMP_COL, LID_ALT, bagCrumple, junkTex, junkNormal, JunkSet, buildCans };
})();
if (typeof window !== 'undefined') window.Streetscape = Streetscape;
