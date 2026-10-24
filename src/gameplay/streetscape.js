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
  // gạch lát vỉa hè: ô vuông ~37 cm xếp so le, mạch vữa xám bụi (không đen kẻ ô), mỗi viên lệch tông + vân hạt riêng,
  // cạnh viên vát (mép trên sáng, mép dưới tối), vài viên nứt / sứt góc, bụi đất đọng theo mạch. Màu loang theo vùng
  // rộng (bẩn, mòn lối đi) rải bằng shader theo toạ độ thế giới (grime) -> không lộ ô texture lặp
  const pavingTex = () => canvasTex('paving2', 512, 512, (g, w, h) => {
    g.fillStyle = '#77736b'; g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    let q = 1;
    const rnd = () => hash(q++ * 7919);
    for (let r = 0; r < n; r++) for (let c = -1; c < n; c++) {
      const off = (r % 2) * s / 2, x0 = c * s + off + 1.5, y0 = r * s + 1.5, sz = s - 3;
      const k = 0.88 + rnd() * 0.16, warm = (rnd() - 0.5) * 8;
      g.fillStyle = `rgb(${(134 * k + warm) | 0},${(131 * k) | 0},${(125 * k - warm) | 0})`;
      g.fillRect(x0, y0, sz, sz);
      for (let i = 0; i < 160; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(50,48,44,0.18)' : 'rgba(225,220,210,0.16)'; g.fillRect(x0 + rnd() * sz, y0 + rnd() * sz, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
      g.fillStyle = 'rgba(255,250,240,0.10)'; g.fillRect(x0, y0, sz, 2); g.fillRect(x0, y0, 2, sz);
      g.fillStyle = 'rgba(30,28,24,0.16)'; g.fillRect(x0, y0 + sz - 2, sz, 2); g.fillRect(x0 + sz - 2, y0, 2, sz);
      if (rnd() < 0.3) { const x = x0 + rnd() * sz, y = y0 + rnd() * sz, rr = 6 + rnd() * 16, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(40,36,30,0.22)'); gr.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = gr; g.fillRect(x0, y0, sz, sz); }
      if (rnd() < 0.08) { g.strokeStyle = 'rgba(35,32,28,0.55)'; g.lineWidth = 1; g.beginPath(); let x = x0 + rnd() * sz, y = y0; g.moveTo(x, y); for (let k2 = 0; k2 < 5; k2++) { x += (rnd() - 0.5) * 18; y += sz / 5; g.lineTo(x, y); } g.stroke(); }
      if (rnd() < 0.1) { g.fillStyle = '#6c685f'; g.beginPath(); g.moveTo(x0 + sz, y0 + sz); g.lineTo(x0 + sz - 6 - rnd() * 8, y0 + sz); g.lineTo(x0 + sz, y0 + sz - 6 - rnd() * 8); g.fill(); }
    }
    // bụi đất đọng dọc mạch (mạch vữa nhoè ra mép viên)
    g.globalCompositeOperation = 'multiply';
    for (let r = 0; r <= n; r++) { const gr = g.createLinearGradient(0, r * s - 4, 0, r * s + 4); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(150,140,125,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, r * s - 4, w, 8); }
    g.globalCompositeOperation = 'source-over';
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
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vGrW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vGrW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vGrW;
float grH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float grN(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(grH(i), grH(i + vec2(1.0, 0.0)), u.x), mix(grH(i + vec2(0.0, 1.0)), grH(i + vec2(1.0, 1.0)), u.x), u.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 gp = vGrW.xz;
    float gn = grN(gp * 0.018) * 0.55 + grN(gp * 0.07 + 7.0) * 0.3 + grN(gp * 0.31 + 3.0) * 0.15;
    diffuseColor.rgb *= mix(vec3(1.0, 0.99, 0.96), vec3(0.62, 0.6, 0.55), smoothstep(0.3, 0.8, gn) * ${k.toFixed(2)});
    // bỏ hoang: mạch gạch (chỗ tối trên texture) mọc rêu / cỏ theo vùng; vệt nước ố đen loang
    float lumG = dot(diffuseColor.rgb, vec3(0.333)), moss = smoothstep(0.5, 0.75, grN(gp * 0.05 + 40.0) * 0.7 + grN(gp * 0.4) * 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.21, 0.1), moss * (0.25 + 0.6 * (1.0 - smoothstep(0.2, 0.4, lumG))) * ${k.toFixed(2)});
    diffuseColor.rgb *= 1.0 - 0.25 * smoothstep(0.62, 0.8, grN(gp * 0.09 + 90.0)) * ${k.toFixed(2)};${paint ? `
    diffuseColor.rgb *= 0.74 + 0.42 * (grH(floor(gp * 14.0)) * 0.6 + grH(floor(gp * 31.0) + 5.0) * 0.4);
    float chip = smoothstep(0.56, 0.64, grN(gp * 1.6 + 31.0) * 0.55 + grN(gp * 6.5 + 2.0) * 0.3 + grH(floor(gp * 9.0)) * 0.15);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.049, 0.047) * (0.8 + 0.4 * grN(gp * 3.0)), chip * 0.92);` : ''}
  }`);
    };
    m.customProgramCacheKey = () => 'grime' + k + (paint ? 'p' : '');
    return m;
  }

  // ---- lưới hình gom dần (vị trí, pháp tuyến, uv, màu) rồi đóng thành 1 mesh
  function Builder() {
    const P = [], N = [], UV = [], C = [], I = [];
    return {
      v(x, y, z, u, w, nx, ny, nz, col) { P.push(x, y, z); N.push(nx, ny, nz); UV.push(u, w); C.push(col[0], col[1], col[2]); return P.length / 3 - 1; },
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
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
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

        // 3. Gân nếp kéo căng hướng tâm tụ dồn về cổ túi
        if (t > 0.45) {
          const gath = Math.min(1.0, (t - 0.45) / 0.42);
          const nPleats = 9 + Math.floor(h(50) * 3);
          const pleatWave = (1.0 - Math.abs(Math.sin(a * nPleats * 0.5 + seed * 1.3 + t * 2.0))) ** 1.6 - 0.45;
          r += pleatWave * 0.28 * gath * (0.7 + 0.3 * Math.sin(a * 3.0 + h(51)));
        }

        // 4. Nếp nhăn nhỏ ngẫu nhiên khắp thân túi
        const microWrinkle = 0.028 * Math.sin(a * 11.0 + t * 19.0 + seed * 2.1) * Math.sin(a * 6.0 - t * 8.0)
          + 0.016 * Math.sin(a * 21.0 + t * 31.0 - seed);
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
        const pl = 1.0 + 0.3 * Math.sin((i / NA) * 6.283185 * 6.0 + t * 5.0 + seed) * t;
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
      const NF = 18, frillRings = [];
      const frillH = 0.14 + 0.09 * h(66);
      for (let j = 0; j <= 2; j++) {
        const t = j / 2, row = [];
        const fY = ky + kr * 0.5 + t * frillH;
        const fRad = 0.06 + t * (0.22 + 0.12 * h(67));
        for (let i = 0; i <= NF; i++) {
          const a = (i / NF) * 6.283185;
          const ruffle = 1.0 + t * (0.35 * Math.sin(a * 6.0 + seed * 2.0) + 0.18 * Math.sin(a * 11.0 - seed));
          const waveY = t * 0.035 * Math.sin(a * 5.0 + seed);
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
      const ang = h(70 + sd) * 0.7 + (sd > 0 ? 0.35 : 3.0), L = 0.28 + 0.16 * h(71 + sd), Wb = 0.15;
      const ux = Math.cos(ang), uz = Math.sin(ang), Q = [];
      const nSeg = 5;
      for (let k = 0; k <= nSeg; k++) {
        const t = k / nSeg;
        const w = Wb * (1.0 - t * 0.42) * (k === nSeg ? 0.6 : 1.0);
        const droop = Math.sin(t * Math.PI * 0.8) * 0.12 - t * t * 0.22;
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
  const JUNK_BLAST = { NORMAL: [20, 1.0], HE: [28, 1.6], RPG: [12, 0.7], ANTI_TANK_MISSILE: [17, 1.3], CLUSTER: [18, 0.6], CLUSTER_SUBMUNITION: [9, 0.35], AP: [3, 0.25], INCENDIARY: [4, 0.08], GATLING_BULLET: [3, 0.06], INCENDIARY_HMG: [2, 0.04], SCOUT_BULLET: [1.5, 0.03] };
  // khối lượng tương đối (đẩy nhẹ bay xa) & thông số rơi
  const JK = { bin: { m: 1, half: 2.4 }, binLid: { m: 0.3, half: 0.3 }, dump: { m: 9, half: 5 }, bag0: { m: 0.5, half: 0.6 }, bag1: { m: 0.5, half: 0.6 }, bag2: { m: 0.5, half: 0.6 }, bag3: { m: 0.5, half: 0.6 }, box: { m: 0.25, half: 0.4 }, boxOpen: { m: 0.2, half: 0.4 }, boxCrushed: { m: 0.2, half: 0.3 }, scrap: { m: 0.05, half: 0.02 } };

  // ===== RÁC / THÙNG RÁC / BAO RÁC TRÊN VỈA HÈ (thành phố bỏ hoang nhiều năm). Thùng rác, container, bao rác, thùng các-tông
  // là vật riêng (InstancedMesh theo mẫu): sóng nổ hất văng / lật đổ / đẩy trượt, bao rác rách tung toé giấy nilon, rơi
  // theo trọng lực, nảy, lăn rồi nằm lại. Giấy vụn / lon chai mỏng gộp tĩnh. Mọi ngẫu nhiên băm theo toạ độ -> mọi máy
  // như nhau (nổ ở cùng chỗ -> cùng kết quả)
  function junk(T, M, G, add) {
    const flat = Builder(), canList = [];
    const up = [0, 1, 0];
    // vật đã có trên vỉa hè -> tránh
    const OB = new Map(), oc = 24, okey = (x, z) => Math.floor(x / oc) * 65536 + Math.floor(z / oc);
    const P = M.props || {};
    for (const L of [P.lamps, P.signals, P.poles, P.busStops, P.cars, M.trees]) for (const o of L || []) { const k = okey(o.x, o.z); (OB.get(k) || OB.set(k, []).get(k)).push(o); }
    const free = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of OB.get(okey(x + i * oc, z + j * oc)) || []) if (Math.hypot(o.x - x, o.z - z) < r + (o.kind ? 5 : 4)) return false; return true; };
    const mark = (x, z) => { const k = okey(x, z); (OB.get(k) || OB.set(k, []).get(k)).push({ x, z }); };
    const top = (x, z) => G(x, z) + CURB_H + 0.04;
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
    // lon / chai: dựng sẵn 34 mẫu (24 lon méo khác nhau, 6 chai nhựa, 4 chai thuỷ tinh), vẽ hàng loạt theo mẫu
    {
      const PR = bottleProtos(), groups = PR.map(() => []);
      for (const c of canList) groups[c.v].push(c);
      const M = {
        can: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.75, normalMap: junkNormal('metal'), normalScale: new THREE.Vector2(0.25, 0.25) }),
        pet: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62, depthWrite: false }),
        glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 })
      };
      const cl = new THREE.Color();
      PR.forEach((p, k) => {
        const L = groups[k];
        if (!L.length) return;
        const im = new THREE.InstancedMesh(p.geo, M[p.kind], L.length);
        im.name = 'litter_' + p.kind; im.castShadow = p.kind !== 'pet'; im.receiveShadow = true;
        L.forEach((c, i) => {
          // nằm lăn: trục lon nằm ngang (quay z 90°), lon dẹt nằm bẹp; vài lon còn đứng
          if (c.stand) xf(c.x, c.y, c.z, 0, c.ry, 0, 1, 1, 1);
          else xf(c.x, c.y + p.r, c.z, 0, c.ry, Math.PI / 2, 1, 1, 1);
          im.setMatrixAt(i, _m4);
          const d = 0.65 + 0.35 * hash(i * 7 + k);   // bụi bẩn bám
          im.setColorAt(i, cl.setRGB(d, d * 0.97, d * 0.92));
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere && im.computeBoundingSphere();
        add(im);
      });
    }
    return new JunkSet(T, G, items, add);
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
      for (let i = 0; i < 16; i++) { const x = rnd() * 128, y = rnd() * 60, L = 20 + rnd() * 60, g2 = g.createLinearGradient(0, y, 0, y + L); g2.addColorStop(0, 'rgba(60,52,40,0.35)'); g2.addColorStop(1, 'rgba(60,52,40,0)'); g.fillStyle = g2; g.fillRect(x, y, 2 + rnd() * 4, L); }   // vệt bẩn chảy
      const gb = g.createLinearGradient(0, 128, 0, 90); gb.addColorStop(0, 'rgba(70,60,45,0.5)'); gb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gb; g.fillRect(0, 90, 128, 38);
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
vec4 bagWr(vec3 p, float s) {
  vec4 r = vec4(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec3 k = normalize(vec3(sin(s * 31.0 + fi * 1.7), cos(s * 17.0 + fi * 2.3) * 0.6, sin(s * 7.0 + fi * 3.1 + 1.0))) * (4.8 + fi * 3.5);
    float ph = s * 53.0 + fi * 11.0, a = 0.055 / (1.0 + fi * 0.6);
    float v = dot(k, p) + ph, sv = sin(v);
    r.w += a * (1.0 - abs(sv));
    r.xyz -= a * sign(sv) * cos(v) * k;
  }
  return r;
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
float bagCrinkle(vec3 p, float s) {
  // Nếp gấp gãy khúc sắc cạnh nhiều tầng của nilon vò
  vec3 p1 = p * 18.0 + s * 13.0;
  float c1 = 1.0 - abs(sin(p1.x * 0.8 + p1.y * 1.4 + p1.z * 0.6));
  vec3 p2 = p * 34.0 + s * 29.0;
  float c2 = 1.0 - abs(sin(p2.x * 1.3 - p2.y * 0.7 + p2.z * 1.1));
  vec3 p3 = p * 60.0 + s * 47.0;
  float c3 = 1.0 - abs(sin(p3.z * 1.6 + p3.x * 0.9 - p3.y * 1.2));
  return c1 * 0.55 + c2 * 0.3 + c3 * 0.15;
}
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
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(clamp(1.0 - max(0.0, dot(normal, viewDir)), 0.0, 1.0), 3.0);
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
    // Nếp nhăn gãy sắc li ti làm lệch pháp tuyến theo đạo hàm
    vec3 p = vBagP;
    float e = 0.025;
    float cr0 = bagCrinkle(p, vBagS);
    vec3 dCr = vec3(
      bagCrinkle(p + vec3(e, 0.0, 0.0), vBagS) - cr0,
      bagCrinkle(p + vec3(0.0, e, 0.0), vBagS) - cr0,
      bagCrinkle(p + vec3(0.0, 0.0, e), vBagS) - cr0
    ) / e;
    vec3 viewGrad = (viewMatrix * vec4(dCr, 0.0)).xyz;
    normal = normalize(normal - viewGrad * 0.04 * (1.0 - bagDust * 0.7));
  }`);
    };
    m.customProgramCacheKey = () => 'bagCrumple3';
    return m;
  }

  class JunkSet {
    constructor(T, G, items, add) {
      this.T = T; this.G = G;
      const PR = junkProtos();
      const MAT = {
        metal: new THREE.MeshStandardMaterial({ map: junkTex(false), normalMap: junkNormal('metal'), normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true, roughness: 0.68, metalness: 0.35 }),
        bag: bagCrumple(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.04 })),
        card: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: junkTex(true), normalMap: junkNormal('card'), normalScale: new THREE.Vector2(0.18, 0.18), vertexColors: true, roughness: 0.82, metalness: 0 }),
        scrap: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
        plastic: new THREE.MeshStandardMaterial({ map: junkTex('plastic'), normalMap: junkNormal('plastic'), normalScale: new THREE.Vector2(0.45, 0.45), vertexColors: true, roughness: 0.6, metalness: 0 })
      };
      const matOf = (t) => t.startsWith('bag') ? MAT.bag : t.startsWith('box') ? MAT.card : t === 'scrap' ? MAT.scrap : t === 'bin' || t === 'binLid' ? MAT.plastic : MAT.metal;
      // mảnh rác văng (túi rách): bể chứa có hạn, dùng vòng
      this.SCRAP = 900;
      const count = {}; for (const it of items) count[it.type] = (count[it.type] || 0) + 1;
      count.scrap = this.SCRAP;
      this.ims = {};
      for (const t in count) {
        const im = new THREE.InstancedMesh(PR[t], matOf(t), count[t]);
        im.name = 'junk_' + t; im.castShadow = t !== 'scrap'; im.receiveShadow = true; im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ims[t] = { im, n: 0 };
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
        const e = this.ims[it.type];
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
      // dent: vỏ thép móp bẹp 1 phía (thu 1 trục ngang), squash: thùng các-tông bẹp xuống (thấp + bè ra)
      const sc = it.s;
      xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, it.type === 'scrap' ? it.s : sc * (it.squash ? 1.12 : 1), it.type === 'scrap' ? 1 : sc * (it.squash || 1), it.type === 'scrap' ? it.s * 0.7 : sc * (it.dent || 1));
      this.ims[it.type].im.setMatrixAt(it.i, _m4);
      this.ims[it.type].dirty = true;
      if (it.ai !== undefined) {
        // bóng tiếp xúc: chỉ khi vật nằm trên mặt đất (bay lên -> ẩn), dấu chân theo hướng & tư thế (thùng đổ nằm: dài ra)
        const fp = AO_FP[it.type] || [0, 0], lying = Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8, sc = it.s || 1;
        const up = !it.v && !it.gone, g = it.type === 'bin' && lying ? it.y - 2.4 * sc : it.y;   // vật nằm yên: chân vật = mặt đất
        xf(it.x, g + 0.05, it.z, 0, it.ry, 0, up ? fp[0] * sc * (lying ? 1.3 : 1) : 0, 1, up ? fp[1] * sc * (lying ? 1.25 : 1) : 0);
        this.ao.setMatrixAt(it.ai, _m4); this.aoDirty = true;
      }
    }
    rest(x, z) { const g = this.T.groundAtRaw(x, z), s = this.G(x, z); return Math.max(g, this.onWalk && this.onWalk(x, z) ? s + CURB_H + 0.04 : g); }
    // sóng nổ tại (x, y, z): đồ vật trong tầm bị hất văng (nhẹ bay xa, container chỉ trượt / nghiêng), túi rác rách tung
    blast(x, y, z, ammo, heavy) {
      const B = JUNK_BLAST[ammo] || JUNK_BLAST.NORMAL, R = B[0] * (heavy ? 1.45 : 1), F = B[1] * (heavy ? 2.1 : 1);
      if (y - this.T.groundAtRaw(x, z) > R) return;
      const c0 = Math.floor((x - R) / this.cell), c1 = Math.floor((x + R) / this.cell), r0 = Math.floor((z - R) / this.cell), r1 = Math.floor((z + R) / this.cell);
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const it of this.grid.get(i * 65536 + j) || []) {
        if (it.gone) continue;
        const dx = it.x - x, dz = it.z - z, dy = it.y + 1 - y, d = Math.hypot(dx, dy, dz);
        if (d > R) continue;
        const k = F * Math.pow(1 - d / R, 1.5), J = JK[it.type], h = (q) => hash(Math.round(it.x * 7 + it.z * 3 + x * 11 + z * 5) + q);
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
      if (!unit || unit.isDead || !dt || !this.items.length) return;
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
      const c0 = Math.floor((cx - R) / this.cell), c1 = Math.floor((cx + R) / this.cell), r0 = Math.floor((cz - R) / this.cell), r1 = Math.floor((cz + R) / this.cell);
      let hit = null;
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) for (const it of this.grid.get(i * 65536 + j) || []) {
        if (it.gone || it.v || it.type === 'scrap') continue;
        if (Math.abs(it.y - this.T.groundAtRaw(it.x, it.z)) > 30) continue;   // đồ vật trên cao (không cùng tầng với xe)
        const J = JK[it.type], half = (J && J.half ? J.half : 1) * (it.s || 1);
        const tx = it.x - cx, tz = it.z - cz, lu = tx * ux + tz * uz, lv = -tx * uz + tz * ux;
        if (Math.abs(lu) > hu + half || Math.abs(lv) > hv + half) continue;
        const under = Math.abs(lu) < hu - half * 0.3 && Math.abs(lv) < hv - half * 0.3;   // nằm hẳn dưới gầm / dưới xích
        const h = (q) => hash(Math.round(it.x * 7 + it.z * 3) + q);
        if (it.type.startsWith('bag')) {
          // túi rác: xe đè khi đứng yên hoặc chạy chậm thì bẹp dí; chỉ khi húc mạnh ở tốc độ cao (v > 20) mới rách văng
          if (under && !it.flat && v <= 20) {
            it.flat = true; it.squash = 0.16; it.ry += (h(1) - 0.5) * 0.5; this.write(it); hit = hit || it; continue;
          }
          if (v > 20) { this.burstBag(it, fx, fz, 1, Math.min(1.0, 0.25 + v / 70)); hit = hit || it; continue; }
          this.kick(it, fx, fz, 10 + v * 0.6, 3, h);
        } else if (it.type.startsWith('box')) {
          // thùng các-tông: bị đè là bẹp dí, húc thì văng nhẹ
          if (under && !it.flat) { it.flat = true; it.squash = 0.18; it.ry += (h(1) - 0.5) * 0.6; this.write(it); hit = hit || it; continue; }
          if (!it.flat && v > 3) { it.squash = Math.min(it.squash || 1, 0.6); this.kick(it, fx, fz, 18 + v * 1.1, 10, h); hit = hit || it; }
        } else if (it.type === 'bin' || it.type === 'binLid') {
          // thùng rác nhựa: xe xích đè lên thùng đang nằm (hoặc đè thẳng từ trên) thì bẹp hẳn; còn lại bị húc văng lăn đi
          const lying = Math.abs(it.rz) > 0.8 || Math.abs(it.rx) > 0.8;
          if (under && tracked && (lying || v < 6) && !it.flat) {
            it.flat = true; it.dent = 0.45; it.squash = 0.35; it.lidOff = true; this.write(it); hit = hit || it; continue;
          }
          if (!it.flat && v > 2) {
            it.dent = Math.max(0.7, (it.dent || 1) - 0.06 - v * 0.002);
            this.kick(it, fx, fz, 20 + v * 1.3, 14, h); hit = hit || it;
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
      for (const t in this.ims) if (this.ims[t].dirty) { this.ims[t].im.instanceMatrix.needsUpdate = true; this.ims[t].dirty = false; }
      if (this.aoDirty) { this.ao.instanceMatrix.needsUpdate = true; this.aoDirty = false; }
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
              if (it.type === 'bin') { const up = Math.abs(Math.cos(it.rx) * Math.cos(it.rz)); if (up < 0.8 || it.v[1] < -30) { it.rx = 0; it.rz = Math.PI / 2; it.y = g + 2.4; } else { it.rx = 0; it.rz = 0; } }
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
      for (const t in this.ims) if (this.ims[t].dirty) { this.ims[t].im.instanceMatrix.needsUpdate = true; this.ims[t].dirty = false; }
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
    const up = [0, 1, 0];

    // ===== VỈA HÈ + BÓ VỈA (mỗi ô phố)
    for (const B of M.blocks) {
      const O = outline(B), n = O.length, L = B.lot;
      // màu gạch theo ô (xám / đỏ gạch / be) để các ô không đồng loạt một màu
      const hk = hash(Math.round(B.cx) * 7 + Math.round(B.cz) * 13);
      const pc = hk < 0.45 ? [1, 1, 1] : hk < 0.75 ? [1.0, 0.9, 0.84] : [0.98, 0.96, 0.92];
      const top = (x, z) => G(x, z) + CURB_H;
      // điểm mép trong bó vỉa (O') và điểm mép trong vỉa hè (giáp đất xây dựng) cho từng điểm viền
      const inner = O.map(o => {
        if (o.straight) { const w = B.walk[o.edge]; return [o.x + o.nx * w, o.z + o.nz * w]; }
        return L[o.corner];   // điểm trên cung bo: quạt về góc đất xây dựng
      });
      for (let i = 0; i < n; i++) {
        const a = O[i], b = O[(i + 1) % n];
        // bó vỉa: mặt trên (dải sáng rộng 20 cm) + mặt đứng ra phía lòng đường (phía canal: kè dựng riêng, ở đây vẫn có gờ)
        const a2 = [a.x + a.nx * CURB_W, a.z + a.nz * CURB_W], b2 = [b.x + b.nx * CURB_W, b.z + b.nz * CURB_W];
        const ya = top(a.x, a.z), yb = top(b.x, b.z);
        const sa = Math.hypot(b.x - a.x, b.z - a.z) / 16;
        const c0 = curb.v(a.x, ya, a.z, 0, 0, ...up, [1, 1, 1]), c1 = curb.v(b.x, yb, b.z, sa, 0, ...up, [1, 1, 1]);
        const c2 = curb.v(b2[0], top(b2[0], b2[1]), b2[1], sa, 0.12, ...up, [1, 1, 1]), c3 = curb.v(a2[0], top(a2[0], a2[1]), a2[1], 0, 0.12, ...up, [1, 1, 1]);
        curb.quad(c0, c3, c2, c1);
        const fx = -(a.nx + b.nx) / 2, fz = -(a.nz + b.nz) / 2;
        const d0 = curb.v(a.x, ya, a.z, 0, 0.2, fx, 0, fz, [0.92, 0.92, 0.92]), d1 = curb.v(b.x, yb, b.z, sa, 0.2, fx, 0, fz, [0.92, 0.92, 0.92]);
        const d2 = curb.v(b.x, G(b.x, b.z) - 0.4, b.z, sa, 0.35, fx, 0, fz, [0.7, 0.7, 0.7]), d3 = curb.v(a.x, G(a.x, a.z) - 0.4, a.z, 0, 0.35, fx, 0, fz, [0.7, 0.7, 0.7]);
        curb.quad(d0, d1, d2, d3);
        // gạch lát: từ mép trong bó vỉa tới mép đất xây dựng
        const ia = inner[i], ib = inner[(i + 1) % n];
        const U = (x) => x / 24;
        const p0 = pave.v(a2[0], top(a2[0], a2[1]) + 0.02, a2[1], U(a2[0]), U(a2[1]), ...up, pc);
        const p1 = pave.v(b2[0], top(b2[0], b2[1]) + 0.02, b2[1], U(b2[0]), U(b2[1]), ...up, pc);
        const q1 = pave.v(ib[0], top(ib[0], ib[1]) + 0.02, ib[1], U(ib[0]), U(ib[1]), ...up, pc);
        if (ia === ib) pave.tri(p0, q1, p1);
        else { const q0 = pave.v(ia[0], top(ia[0], ia[1]) + 0.02, ia[1], U(ia[0]), U(ia[1]), ...up, pc); pave.quad(p0, q0, q1, p1); }
        // mép trong vỉa hè giáp sân / nhà: gờ đứng thấp xuống mặt đất lô (lô thấp hơn vỉa hè 15 cm)
        if (ia !== ib) {
          const yA = top(ia[0], ia[1]) + 0.02, yB = top(ib[0], ib[1]) + 0.02, ex = ib[0] - ia[0], ez = ib[1] - ia[1], el = Math.hypot(ex, ez) || 1;
          const nx = ez / el, nz = -ex / el;
          const e0 = curb.v(ia[0], yA, ia[1], 0, 0.5, nx, 0, nz, [0.8, 0.8, 0.8]), e1 = curb.v(ib[0], yB, ib[1], el / 16, 0.5, nx, 0, nz, [0.8, 0.8, 0.8]);
          const e2 = curb.v(ib[0], G(ib[0], ib[1]) - 0.3, ib[1], el / 16, 0.6, nx, 0, nz, [0.6, 0.6, 0.6]), e3 = curb.v(ia[0], G(ia[0], ia[1]) - 0.3, ia[1], 0, 0.6, nx, 0, nz, [0.6, 0.6, 0.6]);
          curb.quad(e0, e1, e2, e3);
        }
      }
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
    const paveMat = grime(new THREE.MeshStandardMaterial({ map: pavingTex(), vertexColors: true, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }), 1);
    const curbMat = grime(new THREE.MeshStandardMaterial({ map: stoneTex('curb', '#9d9a92'), vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), 0.8);
    const quayMat = new THREE.MeshStandardMaterial({ map: stoneTex('quay', '#9c9a90'), vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3c4a44, vertexColors: true, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
    const decoMat = new THREE.MeshStandardMaterial({ color: 0x111111, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    // lòng ngã tư: cùng texture + shader mặt đường (terrain.roadShader) -> không lộ đường nối khác hạt / khác tông ở mép
    const jMat = new THREE.MeshStandardMaterial({ map: T.roadTexture ? T.roadTexture('asphalt', true) : null, color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    if (T.roadShader) T.roadShader(jMat, 'asphalt', true); else grime(jMat, 1);
    const zMat = grime(new THREE.MeshStandardMaterial({ color: 0xbebcb4, vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, side: THREE.DoubleSide }), 1.4, true);
    add(pave.mesh(paveMat, 'sidewalk'));
    add(curb.mesh(curbMat, 'curb'));
    add(quay.mesh(quayMat, 'quay_wall'));
    add(rail.mesh(railMat, 'quay_rail'));
    add(deco.mesh(decoMat, 'culvert'));
    { const jm = J.mesh(jMat, 'junction_asphalt'); if (jm) { jm.geometry.setAttribute('rdJ', new THREE.Float32BufferAttribute(new Float32Array(jm.geometry.attributes.position.count), 1)); add(jm); } }
    add(Z.mesh(zMat, 'road_paint'));
    const junkSet = junk(T, M, G, add);
    for (const m of group.children) if (m.name === 'curb' || m.name === 'quay_wall' || m.name === 'quay_rail') m.castShadow = true;
    T.group.add(group);
    // tra nhanh điểm nằm trên vỉa hè (trong mép bó vỉa, ngoài mép đất xây dựng): cỏ 3D không mọc xuyên vỉa hè
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
    const covers = (x, z) => (hashB.get(Math.floor(x / BH) * 4096 + Math.floor(z / BH)) || []).some(B => inQuad(B.curb, x, z) && !inQuad(B.lot, x, z));
    junkSet.onWalk = covers;
    return { group, covers, junk: junkSet };
  }

  return { build, CURB_H, junkProtos, bottleProtos, BAG_COL, BIN_COL, DUMP_COL, bagCrumple, junkTex, junkNormal };
})();
if (typeof window !== 'undefined') window.Streetscape = Streetscape;
