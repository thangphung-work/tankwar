/**
 * LƯỚI LÁ NGỤY TRANG BẮT LỬA (trang bị 'camo', lá dựng ở Equipment.buildFoliage)
 *
 * - Mỗi bụi lá / tấm lá rủ là một "ô cháy" (cell). Lúc bắt lửa tính TRƯỚC thời điểm bén lửa của mọi ô
 *   (Dijkstra trên đồ thị các ô gần nhau): lửa lan theo khoảng cách, bốc lên nhanh hơn lan xuống, xuôi gió nhanh,
 *   ngược gió chậm, nhiễu theo hạt giống -> ghi MỘT LẦN vào thuộc tính đỉnh aBurn (bén lúc, thời gian cháy, lúc tắt).
 *   Shader lá (Equipment.swayLeafMat -> patchShader) tự diễn hoạt theo đồng hồ đám cháy uFT: héo vàng -> cháy xém đen,
 *   quăn co lại -> tàn rụi thành tro (viền than hồng lan dần) -> lộ dần thân xe. Không tạo mesh mới, không cập nhật
 *   thuộc tính mỗi khung hình. Bóng đổ dùng vật liệu chiều sâu riêng có cùng phép "ăn mòn".
 * - Lửa nhỏ, tàn lửa, lá cháy rơi, khói trắng xám (lá tươi) dùng chung bể hạt explosion_fx (fx.fire / fx.smoke).
 * - Lá trên tháp / nòng / hộp pháo: ô cháy tính theo hệ tọa độ nhóm cha -> lửa, khói bám đúng khi xoay tháp, nâng nòng.
 * - Lối chơi: đang cháy (cả lúc khói còn bốc) -> mất tác dụng ngụy trang ngay; cháy quá nửa lưới -> coi như mất lưới.
 *   Cháy lâu có thể bén sang xe (VehicleDamage.addFire + ignite). Có bình chữa cháy (fireext): kíp xe dập sau 3-4,5 s.
 * - Nhiều người chơi: mỗi lần bắt lửa là một bản ghi [hạt giống, ô, gió, lúc] trong bản tóm tắt hư hại (VehicleDamage.digest
 *   trường C, gói PARTS) -> mọi máy dựng cùng một lịch cháy, cùng lúc mất ngụy trang. Bắt lửa do đứng gần đám cháy / cây
 *   cháy / xe khác cháy: chỉ máy chủ quyền của xe quyết định rồi gửi đi.
 */
(function () {
  'use strict';
  const ENC = 5;              // aBurn.x = lúc bén + ENC (giá trị mặc định 0 / 1 của thuộc tính thiếu = không cháy)
  const NO_STOP = 1e6;
  const NEIGH_R = 7.5;        // ô cách nhau < 7,5 đv (~0,9 m) mới bén trực tiếp sang nhau
  // tốc độ lửa lan (đv/s, 8 đv = 1 m) và thời gian một ô cháy từ bén tới tàn
  const SPEC = {
    green: { v: 8.8, dur: [3.0, 4.4], toVeh: 0.05, smoke: [1.0, 1.0, 0.97], smoke1: [1.32, 1.31, 1.28] },
    dry: { v: 8.2, dur: [2.4, 3.4], toVeh: 0.08, smoke: [0.84, 0.78, 0.7], smoke1: [1.12, 1.07, 0.98] }
  };
  // xác suất bắt lửa của một phát trúng vào chỗ có lá (lá xanh / lá khô)
  const P_HIT = {
    INCENDIARY: [0.34, 0.6],        // 30 mm nổ-cháy: thuốc cháy zirconi văng tung tóe
    SCOUT_INCENDIARY: [0.14, 0.3],  // 12,7 mm xuyên-cháy: chấm cháy nhỏ
    GATLING_BULLET: [0.04, 0.1],
    HE: [0.16, 0.36], NORMAL: [0.1, 0.24],
    CLUSTER_SUBMUNITION: [0.22, 0.42],   // bom con có lớp lót gây cháy
    RPG: [0.24, 0.44], ANTI_TANK_MISSILE: [0.3, 0.52]   // tia nổ lõm + lửa động cơ đạn
  };
  const LOST_FRAC = 0.45;     // cháy quá ngần này lưới -> mất tác dụng hẳn

  const nowS = () => performance.now() / 1000;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function hash3(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  const _v2 = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;

  // ---------------------------------------------------------------------------
  // SHADER
  // ---------------------------------------------------------------------------
  const GLSL_COMMON_V = `
attribute vec4 aBurn;
attribute vec3 aCurl;
uniform float uFT;
varying float vCfP;
varying float vCfG;
varying float vCfK;`;
  const GLSL_VERT = `
    vCfP = -1.0; vCfG = 0.0; vCfK = aBurn.w;
    if (aBurn.x > 4.0) {
      float cfT0 = aBurn.x - 5.0;
      float cfH = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      vCfP = (min(uFT, aBurn.z) - cfT0) / aBurn.y - cfH * 0.14;
      vCfG = 1.0 - clamp((uFT - aBurn.z) / 1.6, 0.0, 1.0);      // dập lửa: than hồng tắt dần trong ~1,6 s
      float cfC = clamp((vCfP - 0.1) / 0.8, 0.0, 1.0);
      transformed += aCurl * cfC * 0.55;                        // lá quăn, co rúm về cuống
      transformed.y -= cfC * cfC * 0.5;                          // rũ xuống khi cháy thành than
      float cfF = clamp(vCfP * 6.0, 0.0, 1.0) * (1.0 - clamp((vCfP - 0.45) * 4.0, 0.0, 1.0)) * vCfG;
      transformed.y += sin(uFT * 17.0 + cfH * 40.0) * 0.18 * cfF; // khí nóng làm lá run rẩy
      transformed.x += cos(uFT * 13.0 + cfH * 31.0) * 0.12 * cfF;
    }`;
  const GLSL_COMMON_F = `
uniform float uFT;
varying float vCfP;
varying float vCfG;
varying float vCfK;
float cfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cfHash(i), cfHash(i + vec2(1.0, 0.0)), f.x), mix(cfHash(i + vec2(0.0, 1.0)), cfHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
  // màu lá: héo vàng nâu -> cháy xém đen (không đều, theo nhiễu) ; tàn rụi: mép cháy ăn dần vào lá, viền than hồng
  const GLSL_FRAG_COLOR = `
    float cfE = 0.0, cfFl = 0.0;
    if (vCfP > 0.0) {
      float cfN = cfNoise(vUv * 30.0) * 0.6 + cfNoise(vUv * 9.0 + 3.1) * 0.4;
      float cfEat = min(clamp((vCfP - 0.36) / 0.6, 0.0, 1.0) * 1.05, 1.0 - vCfK);   // vCfK: phần mẩu lá cháy đen còn sót
      if (cfN < cfEat) discard;
      float cfS = clamp(vCfP / 0.16, 0.0, 1.0);
      float cfL = dot(diffuseColor.rgb, vec3(0.5, 0.4, 0.1));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(cfL) * vec3(1.3, 0.98, 0.55), cfS * 0.85);
      // vệt cháy đen loang không đều trên lá (theo nhiễu): ranh giới cháy / chưa cháy là "mặt lửa" đỏ rực đang bò qua lá
      float cfCh = clamp((vCfP - 0.08 - cfN * 0.3) / 0.12, 0.0, 1.0);   // chỗ cháy đen trước cũng là chỗ tàn rụi trước
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.026, 0.022), cfCh);
      cfFl = smoothstep(0.0, 0.3, cfCh) * (1.0 - smoothstep(0.55, 1.0, cfCh)) * (1.0 - smoothstep(0.5, 0.75, vCfP));
      cfE = cfEat > 0.0 ? (1.0 - smoothstep(0.0, 0.025, cfN - cfEat)) * (1.0 - smoothstep(0.7, 1.0, vCfP)) : 0.0;
    }`;
  const GLSL_FRAG_EMIT = `
    if (vCfP > 0.0) totalEmissiveRadiance += (vec3(1.0, 0.42, 0.08) * cfFl * (0.7 + 0.8 * cfNoise(vUv * 14.0 + uFT * 4.0)) + vec3(0.9, 0.22, 0.02) * cfE * 0.9) * vCfG;`;
  const GLSL_FRAG_DEPTH = `
    if (vCfP > 0.0) {
      float cfN = cfNoise(vUv * 30.0) * 0.6 + cfNoise(vUv * 9.0 + 3.1) * 0.4;
      if (cfN < min(clamp((vCfP - 0.36) / 0.6, 0.0, 1.0) * 1.05, 1.0 - vCfK)) discard;
    }`;

  // Vá shader lá (gọi từ onBeforeCompile của vật liệu lá rung). U: uniforms của xe (có uFT)
  function patchShader(sh, U) {
    if (!U.uFT) U.uFT = { value: 0 };
    sh.uniforms.uFT = U.uFT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + GLSL_COMMON_V)
      .replace('#include <project_vertex>', GLSL_VERT + '\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + GLSL_COMMON_F)
      .replace('#include <color_fragment>', '#include <color_fragment>' + GLSL_FRAG_COLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + GLSL_FRAG_EMIT);
  }
  // Vật liệu bóng đổ: lá đã cháy thành tro không còn đổ bóng
  function depthMat(st) {
    if (st.depth) return st.depth;
    const U = st.leaf.userData.sway || (st.leaf.userData.sway = {});
    if (!U.uFT) U.uFT = { value: 0 };
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: st.leaf.map, alphaTest: st.leaf.alphaTest || 0.45, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = U.uFT;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>' + GLSL_COMMON_V)
        .replace('#include <project_vertex>', GLSL_VERT + '\n#include <project_vertex>');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>' + GLSL_COMMON_F)
        .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>' + GLSL_FRAG_DEPTH);
    };
    m.customProgramCacheKey = () => 'vkLeafBurnDepth1';
    return (st.depth = m);
  }

  // ---------------------------------------------------------------------------
  // DỰNG: nhận danh sách ô cháy từ Equipment.buildFoliage
  // info: { kind, leaf, twig, cells: [{x,y,z,r,p}], parts: [{ parent, tag, mesh, rec: [cell, nVert, ...] }], panel: {mesh, cell} }
  // ---------------------------------------------------------------------------
  function prepare(u, info) {
    if (!info || !info.cells || !info.cells.length) return;
    const parts = info.parts.filter(p => p.mesh);
    // tọa độ "chuẩn" trong hệ thân xe, bỏ qua góc xoay tháp / nòng (mọi máy giống nhau dù tháp đang quay hướng nào)
    for (const p of parts) {
      p.twigs = p.parent ? p.parent.children.filter(m => m.material === info.twig) : [];
      let ox = 0, oy = 0, oz = 0, o = p.parent;
      while (o && o !== u.chassisGroup && o !== u.group) { ox += o.position.x; oy += o.position.y; oz += o.position.z; o = o.parent; }
      p.off = [ox, oy, oz];
    }
    const cells = info.cells;
    for (const c of cells) {
      const p = info.parts[c.p];
      const off = p && p.off ? p.off : [0, 0, 0];
      c.hx = c.x + off[0]; c.hy = c.y + off[1]; c.hz = c.z + off[2];
      c.part = p;
    }
    u._cfStatic = { kind: info.kind || 'green', leaf: info.leaf, twig: info.twig, cells, parts, panel: info.panel || null, adj: null, depth: null };
    u.camoFire = null;
  }

  function buildAdj(st) {
    if (st.adj) return st.adj;
    const C = st.cells, n = C.length, adj = Array.from({ length: n }, () => []);
    const d2 = (i, j) => { const a = C[i], b = C[j]; return (a.hx - b.hx) ** 2 + (a.hy - b.hy) ** 2 + (a.hz - b.hz) ** 2; };
    const R2 = NEIGH_R * NEIGH_R;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d2(i, j) < R2) { adj[i].push(j); adj[j].push(i); }
    // nối các cụm rời (vd lá trên nòng cách xa nóc tháp): cặp ô gần nhau nhất giữa cụm chính và cụm còn lại
    const comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const q = [s]; comp[s] = nc;
      while (q.length) { const i = q.pop(); for (const j of adj[i]) if (comp[j] < 0) { comp[j] = nc; q.push(j); } }
      nc++;
    }
    for (let guard = 0; nc > 1 && guard < 40; guard++) {
      let best = null, bd = Infinity;
      for (let i = 0; i < n; i++) if (comp[i] === 0) for (let j = 0; j < n; j++) if (comp[j] !== 0) { const d = d2(i, j); if (d < bd) { bd = d; best = [i, j]; } }
      if (!best) break;
      const [i, j] = best, cj = comp[j];
      adj[i].push(j); adj[j].push(i);
      for (let k = 0; k < n; k++) if (comp[k] === cj) comp[k] = 0;
      nc--;
    }
    return (st.adj = adj);
  }

  // Thuộc tính đỉnh aBurn / aCurl: chỉ tạo khi lưới bén lửa lần đầu (xe chưa cháy không tốn bộ nhớ)
  function ensureAttrs(st) {
    for (const p of st.parts) {
      const g = p.mesh.geometry;
      if (g.attributes.aBurn) continue;
      const pos = g.attributes.position;
      let total = 0;
      for (let k = 1; k < p.rec.length; k += 2) total += p.rec[k];
      if (total !== pos.count) { p.bad = true; continue; }   // hình học đã bị thay (không khớp): bỏ qua phần này
      const burn = new Float32Array(pos.count * 4), curl = new Float32Array(pos.count * 3);
      p.range = [];
      let o = 0;
      for (let k = 0; k < p.rec.length; k += 2) {
        const c = st.cells[p.rec[k]], n = p.rec[k + 1];
        p.range.push(p.rec[k], o, n);
        for (let i = o; i < o + n; i++) {
          curl[i * 3] = c.x - pos.array[i * 3];
          curl[i * 3 + 1] = c.y - pos.array[i * 3 + 1];
          curl[i * 3 + 2] = c.z - pos.array[i * 3 + 2];
        }
        o += n;
      }
      g.setAttribute('aBurn', new THREE.BufferAttribute(burn, 4));
      g.setAttribute('aCurl', new THREE.BufferAttribute(curl, 3));
      p.mesh.customDepthMaterial = depthMat(st);
    }
  }
  function writeAttrs(st, S) {
    for (const p of st.parts) {
      if (p.bad || !p.range) continue;
      const at = p.mesh.geometry.attributes.aBurn;
      if (!at) continue;
      const a = at.array;
      for (let k = 0; k < p.range.length; k += 3) {
        const c = p.range[k], o = p.range[k + 1], n = p.range[k + 2];
        const ig = S.ign[c];
        const x = ig >= 0 ? ig + ENC : 0, y = S.dur[c] || 1, z = ig >= 0 ? S.stop[c] : NO_STOP, w = S.keep[c] || 0;
        for (let i = o; i < o + n; i++) { a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = z; a[i * 4 + 3] = w; }
      }
      at.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // BẮT LỬA + LỊCH CHÁY
  // ---------------------------------------------------------------------------
  function newState(st) {
    const n = st.cells.length;
    return {
      t0: nowS(), H: [], ign: new Float32Array(n).fill(-1), dur: new Float32Array(n), keep: new Float32Array(n), marks: [], stop: new Float32Array(n).fill(NO_STOP),
      order: [], lo: 0, frac: 0, flameEnd: 0, smokeEnd: 0, extAt: Infinity, acc: [0, 0, 0, 0, 0], sndT: 0, vehT: 0, vehN: 0,
      logged: {}, twigCharAt: Infinity, twigCharred: false, idle: false
    };
  }
  function clock(S) { return nowS() - S.t0; }
  function lostTag(u, tag) { return !!(u.dmg && u.dmg.lost && u.dmg.lost.has(tag)); }

  // rec: { s: hạt giống, c: ô bắt lửa, w: gió (hướng 0-15 theo hệ thân xe + 16 × mức 0-3), at: lúc (giây, theo đồng hồ đám cháy) }
  function applyIgnition(u, rec) {
    const st = u._cfStatic;
    if (!st || !(rec.c >= 0 && rec.c < st.cells.length)) return false;
    let S = u.camoFire;
    if (!S) S = u.camoFire = newState(st);
    if (S.H.some(h => h.s === rec.s)) return false;
    S.H.push(rec);
    S.idle = false;
    const C = st.cells, n = C.length, adj = buildAdj(st), spec = SPEC[st.kind] || SPEC.green;
    const blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (S.ign[i] >= 0 || lostTag(u, C[i].part ? C[i].part.tag : '')) blocked[i] = 1;
    // ô trúng đã cháy rồi (không còn lá): bén sang ô còn lá gần nhất
    let c0 = rec.c;
    if (blocked[c0]) {
      let bd = 12 * 12; c0 = -1;
      for (let i = 0; i < n; i++) {
        if (blocked[i]) continue;
        const d = (C[i].hx - C[rec.c].hx) ** 2 + (C[i].hy - C[rec.c].hy) ** 2 + (C[i].hz - C[rec.c].hz) ** 2;
        if (d < bd) { bd = d; c0 = i; }
      }
      if (c0 < 0) return false;
    }
    // gió theo hệ thân xe
    const wa = ((rec.w & 15) / 16) * Math.PI * 2, ws = ((rec.w >> 4) & 3) / 3;
    const wx = Math.sin(wa) * ws, wz = Math.cos(wa) * ws;
    const t = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
    t[c0] = rec.at;
    for (;;) {
      let i = -1, best = Infinity;
      for (let k = 0; k < n; k++) if (!done[k] && !blocked[k] && t[k] < best) { best = t[k]; i = k; }
      if (i < 0) break;
      done[i] = 1;
      const a = C[i];
      for (const j of adj[i]) {
        if (done[j] || blocked[j]) continue;
        const b = C[j], dx = b.hx - a.hx, dy = b.hy - a.hy, dz = b.hz - a.hz, d = Math.hypot(dx, dy, dz) || 0.1;
        const up = dy >= 0 ? 1 + 0.9 * dy / d : Math.max(0.4, 1 + 0.6 * dy / d);   // lửa bốc lên nhanh, lan xuống chậm
        const wind = Math.max(0.35, 1 + 0.8 * (dx * wx + dz * wz) / d);
        const noise = 0.65 + 0.8 * hash3(rec.s, Math.min(i, j), Math.max(i, j));
        const tt = t[i] + d / (spec.v * up * wind * noise);
        if (tt < t[j]) t[j] = tt;
      }
    }
    // bình chữa cháy: kíp xe dập lửa sau 3-4,5 s kể từ lần bén đầu tiên
    if (S.extAt === Infinity && typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'fireext')) S.extAt = rec.at + 3.0 + 1.5 * hash3(rec.s, 77, 5);
    else if (S.extAt < rec.at && typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'fireext')) S.extAt = rec.at + 3.0 + 1.5 * hash3(rec.s, 77, 5);
    for (let i = 0; i < n; i++) {
      if (!done[i] || t[i] === Infinity) continue;
      if (t[i] >= S.extAt) continue;
      S.ign[i] = t[i];
      S.dur[i] = spec.dur[0] + (spec.dur[1] - spec.dur[0]) * hash3(rec.s, i, 7);
      // ~1/3 số bụi lá không cháy hết: còn mẩu lá quăn đen bám trên lưới (lá tươi sót nhiều hơn lá khô)
      const hk = hash3(rec.s, i, 13);
      S.keep[i] = hk < (st.kind === 'dry' ? 0.22 : 0.36) ? 0.2 + 0.4 * hash3(rec.s, i, 17) : 0;
      S.stop[i] = S.extAt < Infinity ? S.extAt : NO_STOP;
    }
    summarize(st, S);
    ensureAttrs(st);
    writeAttrs(st, S);
    return true;
  }
  function summarize(st, S) {
    const n = st.cells.length;
    S.order = [];
    let flameEnd = 0, consumed = 0;
    const ends = [];
    for (let i = 0; i < n; i++) {
      if (S.ign[i] < 0) continue;
      S.order.push(i);
      const end = Math.min(S.stop[i], S.ign[i] + S.dur[i] * 0.6);
      if (end > flameEnd) flameEnd = end;
      if (Math.min(S.stop[i], S.ign[i] + S.dur[i]) - S.ign[i] >= S.dur[i] * 0.55) { consumed++; ends.push(S.ign[i] + S.dur[i] * 0.5); }
    }
    S.order.sort((a, b) => S.ign[a] - S.ign[b]);
    S.lo = 0;
    // cành buộc lá của từng bộ phận gãy rụng khi gần hết lá bộ phận đó đã cháy thành tro
    S.partEnd = st.parts.map(p => {
      let tot = 0, gone = 0, end = 0;
      for (let i = 0; i < n; i++) {
        if (st.cells[i].part !== p) continue;
        tot++;
        if (S.ign[i] < 0 || S.stop[i] < S.ign[i] + S.dur[i]) continue;
        gone++;
        end = Math.max(end, S.ign[i] + S.dur[i]);
      }
      return tot && gone / tot > 0.8 ? end : Infinity;
    });
    S.frac = consumed / Math.max(1, n);
    S.flameEnd = flameEnd;
    S.smokeEnd = flameEnd + 2.5;
    ends.sort((a, b) => a - b);
    // vệt muội khói bám vỏ xe ở vài chỗ lá cháy to (tối đa 7 vệt, cách nhau >= 14 đv)
    const old = new Set(S.marks.map(m => m.i));
    for (const i of S.order) {
      if (S.marks.length >= 9) break;
      if (old.has(i) || Math.min(S.stop[i], S.ign[i] + S.dur[i]) - S.ign[i] < S.dur[i] * 0.6) continue;
      const c = st.cells[i];
      if (S.marks.some(m => (st.cells[m.i].hx - c.hx) ** 2 + (st.cells[m.i].hy - c.hy) ** 2 + (st.cells[m.i].hz - c.hz) ** 2 < 196)) continue;
      S.marks.push({ i, at: S.ign[i] + S.dur[i] * 0.6, done: false });
    }
    S.twigCharAt = S.frac > 0.3 ? ends[Math.floor(ends.length * 0.5)] : Infinity;
  }

  // Ô cháy gần điểm (thế giới) nhất; trả { i, d }
  function nearestCell(u, pt, maxD) {
    const st = u._cfStatic;
    if (!st || !pt) return null;
    let best = -1, bd = (maxD || 1e9) ** 2;
    for (let i = 0; i < st.cells.length; i++) {
      const c = st.cells[i], p = c.part;
      if (!p || !p.parent || lostTag(u, p.tag)) continue;
      _v.set(c.x, c.y, c.z).applyMatrix4(p.parent.matrixWorld);
      const d = _v.distanceToSquared(pt);
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? { i: best, d: Math.sqrt(bd) } : null;
  }
  function windRec(u) {
    const g = window.game, W = g && g.ballistics && g.ballistics.wind;
    if (!W || !u.group) return 0;
    const sp = Math.hypot(W.vx || 0, W.vz || 0);
    if (sp < 0.5) return 0;
    // hướng gió đổi sang hệ thân xe (thân xe quay quanh trục đứng)
    const yaw = u.group.rotation ? u.group.rotation.y + ((u.chassisGroup && u.chassisGroup.rotation) ? u.chassisGroup.rotation.y : 0) : 0;
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const lx = W.vx * c + W.vz * s, lz = -W.vx * s + W.vz * c;
    const a = Math.atan2(lx, lz);
    const sector = ((Math.round(a / (Math.PI * 2) * 16) % 16) + 16) % 16;
    const lvl = Math.min(3, Math.round(sp / 6));
    return sector + 16 * lvl;
  }

  // Bắt lửa tại ô gần điểm pt nhất. opts: { quiet, why }. Trả true nếu lưới bén lửa.
  function ignite(u, pt, opts) {
    const st = u && u._cfStatic;
    if (!st || !pt || !_v) return false;
    if (u.group) u.group.updateMatrixWorld(true);
    const nc = nearestCell(u, pt, (opts && opts.maxD) || 14);
    if (!nc) return false;
    const S = u.camoFire;
    const at = S ? clock(S) : 0;
    const rec = { s: (Math.random() * 1e9) | 0, c: nc.i, w: windRec(u), at: Math.round(at * 10) / 10 };
    if (S) rec.at = Math.max(rec.at, at);
    const ok = applyIgnition(u, rec);
    if (ok) onIgnited(u, nc.i, opts);
    return ok;
  }
  function onIgnited(u, cell, opts) {
    const st = u._cfStatic, c = st.cells[cell], p = c.part;
    if (p && p.parent) {
      _v.set(c.x, c.y, c.z).applyMatrix4(p.parent.matrixWorld);
      const se = window.soundEngine;
      if (se && se.camoIgnite) se.camoIgnite({ x: _v.x, y: _v.y, z: _v.z }, st.kind === 'dry');
    }
    const g = window.game;
    if (opts && opts.log && g && u.isPlayer && g.addCombatLog) g.addCombatLog('[[flame]] Lưới ngụy trang đang cháy — xe bị lộ', 'alert');
  }

  // Phát trúng (gọi từ VehicleDamage.onDirectHit / onSplash trên máy có quyền với phát bắn). Trả true nếu bắt lửa.
  function onHit(u, o) {
    const st = u && u._cfStatic;
    if (!st || !o || !o.point || u.isDead) return false;
    let ammo = o.ammo;
    if (ammo === 'INCENDIARY' && o.shooter && o.shooter.tankType === 'SCOUT') ammo = 'SCOUT_INCENDIARY';
    const P = P_HIT[ammo];
    if (!P) return false;
    const dry = st.kind === 'dry' ? 1 : 0;
    let p = P[dry] * (o.heavy ? 1.8 : 1);
    // phát nổ gần (không trúng thẳng): nhiệt & mảnh nóng yếu dần theo khoảng cách
    let maxD = 9;
    if (o.splash) {
      const k = Math.max(0, 1 - (o.dist || 0) / Math.max(1, o.radius || 30));
      if (ammo !== 'HE' && ammo !== 'NORMAL' && ammo !== 'CLUSTER_SUBMUNITION' && !o.heavy) return false;
      p *= k * k * 0.8;
      maxD = Math.max(12, (o.radius || 30) * 0.5);
    }
    // lưới vừa cháy một phần: lá quanh đó đã khô quắt vì nhiệt -> dễ bén lại hơn
    const S = u.camoFire;
    if (S && S.frac > 0) p *= 1.4;
    if (!(Math.random() < Math.min(0.95, p))) return false;
    return ignite(u, o.point, { maxD });
  }

  // ---------------------------------------------------------------------------
  // TRẠNG THÁI CHO LỐI CHƠI / GIAO DIỆN
  // ---------------------------------------------------------------------------
  // 'none' | 'burning' (lửa / khói còn bốc) | 'gone' (đã cháy hết) | 'scorched' (cháy xém một phần, đã tắt)
  function status(u) {
    const S = u && u.camoFire;
    if (!S || !S.order.length) return 'none';
    const c = clock(S);
    if (c < S.smokeEnd) return 'burning';
    return S.frac >= LOST_FRAC ? 'gone' : 'scorched';
  }
  function blocks(u) { const s = status(u); return s === 'burning' || s === 'gone'; }
  function leafless(u) { return status(u) !== 'none'; }

  // Bản ghi gửi mạng: [[hạt giống, ô, gió, lúc×10], ...]
  function netState(u) {
    const S = u && u.camoFire;
    if (!S || !S.H.length) return 0;
    return S.H.slice(-6).map(h => [h.s, h.c, h.w, Math.round(h.at * 10)]);
  }
  // Áp bản ghi nhận từ máy khác; trả true nếu lưới vừa bắt lửa trên máy này
  function applyNet(u, C) {
    if (!Array.isArray(C) || !u || !u._cfStatic) return false;
    let fresh = false;
    for (const r of C) {
      if (!Array.isArray(r) || r.length < 4) continue;
      const S = u.camoFire;
      if (S && S.H.some(h => h.s === r[0])) continue;
      const wasNone = !S || !S.order.length;
      const at = Math.max(r[3] / 10, S ? Math.min(clock(S), r[3] / 10 + 1) : 0);
      if (applyIgnition(u, { s: r[0] | 0, c: r[1] | 0, w: r[2] | 0, at: S ? at : 0 })) { onIgnited(u, r[1] | 0, null); if (wasNone) fresh = true; }
    }
    return fresh;
  }

  function reset(u) {
    if (!u) return;
    const st = u._cfStatic;
    u.camoFire = null;
    if (!st) return;
    for (const p of st.parts) {
      const g = p.mesh && p.mesh.geometry;
      if (g && g.attributes.aBurn) {
        g.attributes.aBurn.array.fill(0);
        g.attributes.aBurn.needsUpdate = true;
      }
    }
    if (st.twigCharred) setTwigs(st, false);
    for (const p of st.parts) for (const m of p.twigs || []) { m.visible = !u._camoFar; m.userData.cfGone = false; }
    if (st.panel && st.panel.mesh) st.panel.mesh.visible = true;
    if (st.leaf && st.leaf.userData.sway && st.leaf.userData.sway.uFT) st.leaf.userData.sway.uFT.value = 0;
  }

  // Cành buộc lá cháy thành que than đen (đổi vật liệu, không tạo mesh)
  let charTwig = null;
  function setTwigs(st, on) {
    if (!charTwig) charTwig = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1, metalness: 0 });
    for (const p of st.parts) {
      const par = p.parent;
      if (!par) continue;
      for (const m of par.children) {
        if (on && m.material === st.twig) { m.userData.cfTwig = st.twig; m.material = charTwig; }
        else if (!on && m.userData.cfTwig) { m.material = m.userData.cfTwig; delete m.userData.cfTwig; }
      }
    }
    st.twigCharred = on;
  }

  // ---------------------------------------------------------------------------
  // CẬP NHẬT MỖI KHUNG HÌNH
  // ---------------------------------------------------------------------------
  const R = (a, b) => a + Math.random() * (b - a);
  function cellWorld(c, out) {
    return out.set(c.x, c.y, c.z).applyMatrix4(c.part.parent.matrixWorld);
  }
  function isAuth(u, game) {
    const ns = game && game.netSync;
    if (!ns || typeof ns.owns !== 'function') return true;
    try { return !!ns.owns(u); } catch (e) { return true; }
  }
  function queue(u, game) {
    const ns = game && game.netSync;
    if (ns && ns.queueParts) ns.queueParts(u);
  }

  let proxT = 0;
  // ctx: { units, fx, game }
  function update(dt, ctx) {
    if (!_v || !ctx || !ctx.units) return;
    const fx = ctx.fx, game = ctx.game || window.game || null;
    proxT += dt;
    const doProx = proxT >= 0.5;
    if (doProx) proxT = 0;
    const W = game && game.ballistics && game.ballistics.wind;
    const wx = W ? W.vx || 0 : 0, wz = W ? W.vz || 0 : 0;
    for (const u of ctx.units) {
      const st = u && u._cfStatic;
      if (!st || !u.group) continue;
      if (doProx) checkProximity(u, st, ctx, game);
      const S = u.camoFire;
      if (!S || S.idle || !S.order.length) continue;
      const c = clock(S);
      const U = st.leaf && st.leaf.userData.sway;
      if (U && U.uFT) U.uFT.value = c;
      // than hồng tắt hẳn, lá cháy xong: dừng xử lý (giữ trạng thái cho lối chơi)
      if (c > S.smokeEnd + 2 && c > S.flameEnd + 3) {
        S.idle = true;
        finishLog(u, S, game);
        if (U && U.uFT) U.uFT.value = c;
        continue;
      }
      if (!S.twigCharred && c >= S.twigCharAt) setTwigs(st, true);
      if (S.partEnd) st.parts.forEach((p, k) => { if (c >= S.partEnd[k] && p.twigs && p.twigs.length && !p.twigs[0].userData.cfGone) for (const m of p.twigs) { m.visible = false; m.userData.cfGone = true; } });
      if (st.panel && st.panel.mesh && st.panel.mesh.visible) {
        const pc = st.panel.cell;
        if (pc >= 0 && S.ign[pc] >= 0 && (Math.min(c, S.stop[pc]) - S.ign[pc]) / S.dur[pc] > 0.55) st.panel.mesh.visible = false;
      }
      if (fx && fx.addSurfaceMark && fx.hitUnitSurface) for (const m of S.marks) if (!m.done && c >= m.at) { m.done = true; sootMark(u, st, m.i, fx); }
      if (c >= S.extAt && !S.logged.ext) {
        S.logged.ext = true;
        if (u.isPlayer && game && game.addCombatLog) game.addCombatLog('[[flame-off]] Đã dập lửa lưới ngụy trang', 'tip');
        if (fx && fx.smoke) extinguishPuff(u, st, S, fx);
      }
      if (u.waterY !== null && u.waterY !== undefined && (u.waterDepth || 0) > 2) douseWet(u, st, S, c, fx, game, dt);
      // các ô đang cháy (lửa ngọn) / đang tàn (tro, than)
      while (S.lo < S.order.length) {
        const i = S.order[S.lo];
        if (Math.min(c, S.stop[i]) - S.ign[i] > S.dur[i] * 1.0 || c > S.stop[i] + 1.6) S.lo++;
        else break;
      }
      const flaming = [], glowing = [];
      for (let k = S.lo; k < S.order.length; k++) {
        const i = S.order[k];
        if (S.ign[i] > c) break;
        if (c >= S.stop[i]) continue;
        const p = (c - S.ign[i]) / S.dur[i];
        if (p < 0.6) flaming.push(i);
        else if (p < 1) glowing.push(i);
      }
      const vis = u.group.visible !== false && (u._lodD || 0) < 1800 && !u._camoFar;
      if (fx && vis && (flaming.length || glowing.length)) emit(u, st, S, fx, flaming, glowing, dt, wx, wz);
      // tiếng lá cháy lép bép
      S.sndT -= dt;
      if (S.sndT <= 0 && flaming.length) {
        S.sndT = 0.5;
        const se = window.soundEngine;
        if (se && se.fireSource) {
          cellWorld(st.cells[flaming[flaming.length >> 1]], _v2);
          se.fireSource(S, { x: _v2.x, y: _v2.y, z: _v2.z }, Math.min(1.1, 0.35 + flaming.length * 0.05), { leaf: true, dry: st.kind === 'dry' });
        }
      }
      // cháy lâu bén sang xe (máy chủ quyền của xe quyết định)
      if (!u.isDead && flaming.length >= 4 && isAuth(u, game)) {
        S.vehT += dt;
        if (S.vehT >= 1) {
          S.vehT = 0;
          const spec = SPEC[st.kind] || SPEC.green;
          if (S.vehN < 2 && Math.random() < spec.toVeh * Math.min(1, flaming.length / 10)) {
            S.vehN++;
            const cw = cellWorld(st.cells[flaming[(Math.random() * flaming.length) | 0]], _v2).clone();
            if (typeof VehicleDamage !== 'undefined' && VehicleDamage.addFire) VehicleDamage.addFire(u, cw, 0.5, R(5, 9));
            if (typeof u.ignite === 'function') u.ignite(R(2.5, 4));
            queue(u, game);
            if (u.isPlayer && game && game.addCombatLog) game.addCombatLog('[[flame]] Lửa từ lưới ngụy trang bén vào xe!', 'alert');
          }
        }
      }
    }
  }
  function finishLog(u, S, game) {
    if (S.logged.end || !u.isPlayer || !game || !game.addCombatLog || u.isDead) return;
    S.logged.end = true;
    if (S.frac >= LOST_FRAC) game.addCombatLog('[[leaf-off]] Lưới ngụy trang đã cháy hết', 'alert');
    else if (!S.logged.ext) game.addCombatLog('[[flame-off]] Lửa trên lưới ngụy trang đã tắt', 'tip');
  }

  // Muội khói đen bám vỏ xe dưới chỗ bụi lá đã cháy (tia dò từ ô lá vào thân / xuống dưới)
  function sootMark(u, st, i, fx) {
    const c = st.cells[i];
    if (!c.part || !c.part.parent) return;
    cellWorld(c, _v);
    u.group.updateMatrixWorld(true);
    const ctr = u.group.localToWorld(new THREE.Vector3(0, 8, 0));
    const dir = ctr.sub(_v).setY(0);
    if (dir.lengthSq() < 1) dir.set(0, 0, 0);
    dir.normalize().multiplyScalar(0.5).add(new THREE.Vector3(0, -1, 0)).normalize();
    const o = _v.clone().addScaledVector(dir, -2);
    const h = fx.hitUnitSurface(u, o, dir, 14);
    if (!h) return;
    fx.addSurfaceMark(h.point, h.normal, h.object, 'scorch', R(6, 10), { unit: u });
  }

  // Hạt: ngọn lửa nhỏ, tàn lửa bay, lá cháy rơi, tro, khói trắng xám
  function emit(u, st, S, fx, flaming, glowing, dt, wx, wz) {
    const A = S.acc, nF = flaming.length, nG = glowing.length, dry = st.kind === 'dry';
    A[0] += dt * Math.min(60, nF * 4.5);           // lưỡi lửa
    A[1] += dt * Math.min(16, nF * 1.3);           // khói
    A[2] += dt * Math.min(30, nF * 1.8 + nG * 0.8); // tàn lửa
    A[3] += dt * Math.min(5, nF * 0.35);           // lá cháy rơi
    A[4] += dt * Math.min(8, nG * 0.9);            // tro đen bay
    const pick = (L) => st.cells[L[(Math.random() * L.length) | 0]];
    const sm = SPEC[st.kind] || SPEC.green;
    let guard = 0;
    while (A[0] >= 1 && fx.fire && guard++ < 12) {
      A[0] -= 1;
      const c = pick(flaming), r = c.r || 2.5;
      cellWorld(c, _v);
      fx.fire.add({
        x: _v.x + R(-0.5, 0.5) * r, y: _v.y + R(-0.2, 0.6) * r * 0.5, z: _v.z + R(-0.5, 0.5) * r,
        vx: R(-2, 2) + wx * 0.15, vy: R(14, 28), vz: R(-2, 2) + wz * 0.15,
        size: R(4.0, 7.5) * (dry ? 1.2 : 1), grow: -6, drag: 1.2, grav: -16, life: R(0.35, 0.7), alpha: 0.95, fadeIn: 0.03,
        c0: [1, 0.8, 0.4], c1: [0.85, 0.24, 0.04], cell: 1, floor: false
      });
    }
    guard = 0;
    while (A[1] >= 1 && fx.smoke && guard++ < 6) {
      A[1] -= 1;
      const c = pick(flaming);
      cellWorld(c, _v);
      const k = R(0.85, 1.1);
      // lá tươi cháy bốc khói trắng xám dày (hơi nước + nhựa lá); lá khô khói mỏng, ngả nâu
      fx.smoke.add({
        x: _v.x + R(-1, 1), y: _v.y + R(1, 2.5), z: _v.z + R(-1, 1),
        vx: R(-2, 2) + wx * 0.25, vy: R(9, 16), vz: R(-2, 2) + wz * 0.25, ax: wx * 0.45, az: wz * 0.45,
        size: R(4.5, 7.5) * (dry ? 0.8 : 1), grow: dry ? 4.5 : 6.5, drag: 0.5, grav: -2.2, life: R(3.2, 5.2), alpha: dry ? 0.42 : 0.62, fadeIn: 0.18, fadePow: 1.5,
        c0: [sm.smoke[0] * k, sm.smoke[1] * k, sm.smoke[2] * k], c1: sm.smoke1, colorRate: 1.4, cell: 0, floor: false
      });
    }
    guard = 0;
    while (A[2] >= 1 && fx.fire && guard++ < 10) {
      A[2] -= 1;
      const c = pick(nF && Math.random() < 0.75 ? flaming : (nG ? glowing : flaming));
      cellWorld(c, _v);
      fx.fire.add({
        x: _v.x + R(-1.5, 1.5), y: _v.y + R(0, 1.5), z: _v.z + R(-1.5, 1.5),
        vx: R(-4, 4), vy: R(8, 22), vz: R(-4, 4), ax: wx * 0.6, az: wz * 0.6,
        size: R(0.3, 0.6), grow: -0.2, drag: 1.4, grav: 8, life: R(0.7, 1.5), alpha: 0.9, fadeIn: 0.01,
        c0: [1, 0.5, 0.12], c1: [0.6, 0.1, 0.01], cell: 3, floor: false
      });
    }
    guard = 0;
    while (A[3] >= 1 && fx.fire && guard++ < 4) {
      A[3] -= 1;
      const c = pick(flaming);
      cellWorld(c, _v);
      fx.fire.add({
        x: _v.x + R(-1.5, 1.5), y: _v.y, z: _v.z + R(-1.5, 1.5),
        vx: R(-3, 3) + wx * 0.2, vy: R(-2, 4), vz: R(-3, 3) + wz * 0.2,
        size: R(0.8, 1.4), grow: -0.5, drag: 1.6, grav: 26, life: R(0.7, 1.3), alpha: 0.95, fadeIn: 0.02,
        c0: [1, 0.6, 0.2], c1: [0.5, 0.1, 0.02], cell: 3, floor: true
      });
    }
    guard = 0;
    while (A[4] >= 1 && fx.smoke && guard++ < 4) {
      A[4] -= 1;
      const c = pick(glowing);
      cellWorld(c, _v);
      fx.smoke.add({
        x: _v.x + R(-1.5, 1.5), y: _v.y + R(0, 1), z: _v.z + R(-1.5, 1.5),
        vx: R(-3, 3), vy: R(5, 12), vz: R(-3, 3), ax: wx * 0.6, az: wz * 0.6,
        size: R(0.5, 0.95), grow: 0, drag: 1.4, grav: 5, life: R(1.6, 2.8), alpha: 0.9, fadeIn: 0.05,
        c0: [0.07, 0.065, 0.06], c1: [0.16, 0.15, 0.14], cell: 3, floor: true
      });
    }
  }
  // Kíp xe xịt bình chữa cháy: mây bột trắng phủ chỗ đang cháy
  // Xe lội sâu: bụi lá ngập dưới mặt nước tắt ngay (xèo hơi nước), lửa không lan xuống phần lưới đã ngập.
  // Chỉ là hình ảnh cục bộ theo vị trí xe (giống nhau trên mọi máy), lịch cháy phần còn khô giữ nguyên
  function douseWet(u, st, S, c, fx, game, dt) {
    S.wetT = (S.wetT || 0) - dt;
    if (S.wetT > 0) return;
    S.wetT = 0.2;
    const wy = u.waterY;
    let n = 0, lit = 0;
    for (let k = S.lo; k < S.order.length; k++) {
      const i = S.order[k];
      if (S.stop[i] <= c) continue;
      if (cellWorld(st.cells[i], _v).y >= wy + 0.3) continue;
      if (S.ign[i] <= c && (c - S.ign[i]) / S.dur[i] < 1) { lit++; if (fx && fx.douseSteam && lit <= 3) fx.douseSteam(_v, wy, 0.5, lit === 1); }
      S.stop[i] = c;
      n++;
    }
    if (!n) return;
    summarize(st, S);
    writeAttrs(st, S);
    if (lit && u.isPlayer && game && game.addCombatLog && !S.logged.wet) { S.logged.wet = true; game.addCombatLog('[[flame-off]] Lưới ngụy trang ngập nước — phần lá chìm đã tắt lửa', 'tip'); }
  }
  function extinguishPuff(u, st, S, fx) {
    const c = clock(S);
    let n = 0;
    for (let k = S.lo; k < S.order.length && n < 10; k++) {
      const i = S.order[k];
      if (S.ign[i] > c) break;
      if ((c - S.ign[i]) / S.dur[i] > 0.9) continue;
      cellWorld(st.cells[i], _v);
      for (let j = 0; j < 2; j++) {
        fx.smoke.add({
          x: _v.x + R(-2, 2), y: _v.y + R(0, 2), z: _v.z + R(-2, 2), vx: R(-8, 8), vy: R(2, 8), vz: R(-8, 8),
          size: R(4, 7), grow: 5, drag: 1.4, grav: 1.5, life: R(1.6, 2.6), alpha: 0.7, fadeIn: 0.05,
          c0: [1.15, 1.15, 1.13], c1: [1.25, 1.25, 1.23], cell: 0, floor: true
        });
      }
      n++;
    }
  }

  // ---------------------------------------------------------------------------
  // BẮT LỬA DO ĐỨNG GẦN ĐÁM CHÁY (máy chủ quyền của xe quyết định rồi gửi đi), XÁC XE CHÁY (chỉ hình ảnh)
  // ---------------------------------------------------------------------------
  function checkProximity(u, st, ctx, game) {
    const S = u.camoFire, burning = S && S.order.length && clock(S) < S.flameEnd;
    if (burning) return;
    const dry = st.kind === 'dry' ? 1 : 0;
    const fx = ctx.fx;
    // xác xe cháy: lưới trên xác bén lửa (mỗi máy tự diễn, không ảnh hưởng lối chơi)
    if (u.isDead) {
      if (S && S.order.length) return;
      const Wk = u.fxWreck;
      if (!Wk || !fx || !fx.wreckFireLevels) return;
      const L = fx.wreckFireLevels(u, Wk);
      if (Math.max(L.ring || 0, L.eng || 0) < 0.3 || Math.random() > 0.35) return;
      u.group.updateMatrixWorld(true);
      const src = (L.ring || 0) >= (L.eng || 0) && u.turretGroup ? u.turretGroup.getWorldPosition(new THREE.Vector3()) : u.group.localToWorld(new THREE.Vector3(0, 12, 20));
      ignite(u, src, { maxD: 30 });
      return;
    }
    if (!isAuth(u, game)) return;
    const pos = u.group.position;
    let pt = null, p = 0;
    // 1. lửa trên chính xe (lỗ xuyên, khoang máy, đạn cháy)
    const d = u.dmg;
    if (d && d.fires && d.fires.length) {
      const f = d.fires[d.fires.length - 1];
      pt = u.group.localToWorld(new THREE.Vector3(f.x, f.y, f.z));
      p = (dry ? 0.24 : 0.12) * Math.min(1.3, f.k || 1);
    } else if ((u.burnTimer || 0) > 0) {
      pt = u.group.localToWorld(new THREE.Vector3(0, 13, 0));
      p = dry ? 0.14 : 0.07;
    }
    // 2. cây đang cháy sát xe
    const T = game && game.terrain && game.terrain.trees;
    if (!pt && T && T.burning && T.burning.length) {
      for (const it of T.burning) {
        const dd = Math.hypot(it.x - pos.x, it.z - pos.z);
        if (dd < 34 && !it.crownGone) { pt = new THREE.Vector3(it.x, (it.y || pos.y) + 14, it.z); p = (dry ? 0.2 : 0.1) * (1 - dd / 34); break; }
      }
    }
    // 3. xe khác (hoặc xác xe) đang cháy sát bên
    if (!pt) {
      for (const o of ctx.units) {
        if (!o || o === u || !o.group) continue;
        const dd = Math.hypot(o.group.position.x - pos.x, o.group.position.z - pos.z);
        if (dd > 30) continue;
        let lv = 0;
        if (o.isDead && o.fxWreck && fx && fx.wreckFireLevels) { const L = fx.wreckFireLevels(o, o.fxWreck); lv = Math.max(L.ring || 0, L.eng || 0); }
        else if (o.camoFire && o.camoFire.order.length && clock(o.camoFire) < o.camoFire.flameEnd) lv = 0.5;
        if (lv < 0.3) continue;
        pt = o.group.position.clone().setY(o.group.position.y + 12);
        p = (dry ? 0.12 : 0.06) * lv * (1 - dd / 30);
        break;
      }
    }
    if (!pt || !(Math.random() < p)) return;
    if (ignite(u, pt, { maxD: 40, log: true })) queue(u, game);
  }

  const CamoFire = { prepare, patchShader, onHit, ignite, update, status, blocks, leafless, netState, applyNet, reset, SPEC, P_HIT };
  if (typeof window !== 'undefined') window.CamoFire = CamoFire;
})();
