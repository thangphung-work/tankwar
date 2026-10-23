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
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _nm = new THREE.Matrix3();
  function xf(x, y, z, rx, ry, rz, sx, sy, sz) { _e.set(rx, ry, rz); _q.setFromEuler(_e); _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); _nm.getNormalMatrix(_m4); return _m4; }
  // hộp đơn vị (tâm gốc) biến đổi theo _m4 hiện tại
  function boxInto(Bd, col) {
    const F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    for (const [a, b, c] of F) {
      const n = _n.set(a, b, c).applyMatrix3(_nm).normalize(), nx = n.x, ny = n.y, nz = n.z;
      const ax = b ? [1, 0, 0] : c ? [1, 0, 0] : [0, 0, 1], ay = b ? [0, 0, 1] : [0, 1, 0];
      const idx = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => {
        _v.set(a * 0.5 + (ax[0] * u + ay[0] * w) * 0.5, b * 0.5 + (ax[1] * u + ay[1] * w) * 0.5, c * 0.5 + (ax[2] * u + ay[2] * w) * 0.5).applyMatrix4(_m4);
        const shade = ny < -0.5 ? 0.55 : ny > 0.5 ? 1 : 0.82;
        return Bd.v(_v.x, _v.y, _v.z, u * 0.5 + 0.5, w * 0.5 + 0.5, nx, ny, nz, [col[0] * shade, col[1] * shade, col[2] * shade]);
      });
      Bd.quad(idx[0], idx[1], idx[2], idx[3]);
    }
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
  // bao rác: khối 20 mặt méo theo băm, mặt phẳng (nếp gấp nilon), đáy bẹt nằm trên mặt đất
  let ICO = null;
  function bagInto(Bd, col, seed) {
    if (!ICO) ICO = new THREE.IcosahedronGeometry(1, 1).toNonIndexed().attributes.position;
    const P = [];
    for (let i = 0; i < ICO.count; i++) {
      const x = ICO.getX(i), y = ICO.getY(i), z = ICO.getZ(i), k = 0.88 + 0.22 * hash(Math.round((x * 3 + y * 5 + z * 7) * 10) + seed);
      // nilon xệ: phình ở dưới, thắt lại ở trên (túm buộc miệng), đáy bẹt
      const yy = Math.max(-0.6, y), bulge = 1.08 - 0.28 * Math.max(0, yy), neck = yy > 0.8 ? 0.35 : 1;
      _v.set(x * k * bulge * neck, yy * k + (yy > 0.8 ? 0.25 : 0), z * k * bulge * neck).applyMatrix4(_m4); P.push(_v.clone());
    }
    for (let i = 0; i < P.length; i += 3) {
      const a = P[i], b = P[i + 1], c = P[i + 2], n = _n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      if (n.y < 0) n.negate();
      const sh = 0.6 + 0.4 * Math.max(0, n.y * 0.8 + n.x * 0.3), cc = [col[0] * sh, col[1] * sh, col[2] * sh];
      Bd.tri(Bd.v(a.x, a.y, a.z, 0, 0, n.x, n.y, n.z, cc), Bd.v(b.x, b.y, b.z, 1, 0, n.x, n.y, n.z, cc), Bd.v(c.x, c.y, c.z, 0, 1, n.x, n.y, n.z, cc));
    }
  }
  // mẫu hình đồ vật (toạ độ gốc: tâm đáy, y lên); màu thật đặt theo từng bản (instanceColor), mẫu chỉ mang độ sáng tối
  function junkProtos() {
    const mk = (fn) => { const B = Builder(); fn(B); const m = B.mesh(new THREE.MeshBasicMaterial(), ''); return m.geometry; };
    const W = [1, 1, 1];
    return {
      // thùng rác công cộng: thân trụ thép sơn, đáy lòng thùng tối (thấy khi mất nắp), đai viền miệng
      bin: mk(B => {
        xf(0, 0, 0, 0, 0, 0, 2.4, 7.5, 2.4); cylInto(B, W, 12, false);
        xf(0, 6.6, 0, 0, 0, 0, 2.3, 0.01, 2.3); cylInto(B, [0.12, 0.12, 0.12], 12, true);
        xf(0, 7.1, 0, 0, 0, 0, 2.55, 0.4, 2.55); cylInto(B, [0.8, 0.8, 0.8], 12, false);
        xf(0, 2.2, 0, 0, 0, 0, 2.5, 0.35, 2.5); cylInto(B, [0.8, 0.8, 0.8], 12, false);
      }),
      binLid: mk(B => { xf(0, 0, 0, 0, 0, 0, 2.6, 0.45, 2.6); cylInto(B, [0.85, 0.85, 0.85], 12, true); xf(0, 0.45, 0, 0, 0, 0, 1.2, 0.3, 1.2); cylInto(B, [0.7, 0.7, 0.7], 8, true); }),
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
      bag0: mk(B => { xf(0, 0.55, 0, 0, 0, 0, 1.1, 0.75, 1); bagInto(B, W, 3); }),
      bag1: mk(B => { xf(0, 0.55, 0, 0.2, 0, 0, 1, 0.8, 1.15); bagInto(B, W, 17); }),
      bag2: mk(B => { xf(0, 0.5, 0, 0, 0, 0.3, 1.25, 0.7, 0.95); bagInto(B, W, 41); }),
      // thùng các-tông (cạnh 1): nắp gập hé
      box: mk(B => { xf(0, 0.35, 0, 0, 0, 0, 1, 0.7, 1); boxInto(B, W); xf(0.25, 0.72, 0, 0, 0, -0.5, 0.5, 0.03, 1); boxInto(B, [0.9, 0.9, 0.9]); }),
      // mảnh rác (giấy / nilon) văng ra khi túi rách: tấm phẳng 1 x 1
      scrap: mk(B => { const up = [0, 1, 0]; const p = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, w]) => B.v(u, 0, w, 0, 0, ...up, W)); B.quad(p[0], p[1], p[2], p[3]); })
    };
  }
  const BIN_COL = [[0.16, 0.26, 0.2], [0.18, 0.2, 0.22], [0.36, 0.28, 0.18], [0.2, 0.22, 0.3]];
  const BAG_COL = [[0.05, 0.05, 0.055], [0.06, 0.06, 0.07], [0.045, 0.05, 0.05], [0.1, 0.15, 0.22], [0.34, 0.34, 0.32], [0.07, 0.09, 0.07]];
  const DUMP_COL = [[0.14, 0.3, 0.2], [0.18, 0.28, 0.42], [0.36, 0.2, 0.12]];
  // rác cũ: giấy ố vàng / bạc màu, bìa ngấm nước, nilon bạc màu (không còn màu tươi)
  const LIT = [[0.5, 0.48, 0.42], [0.46, 0.42, 0.33], [0.36, 0.28, 0.18], [0.4, 0.2, 0.16], [0.2, 0.26, 0.34], [0.26, 0.2, 0.13], [0.22, 0.2, 0.15]];
  // sức nổ tác động đồ vật nhẹ: [bán kính, sức đẩy] (cùng thang với EnvDamage AMMO)
  const JUNK_BLAST = { NORMAL: [20, 1.0], HE: [28, 1.6], RPG: [12, 0.7], ANTI_TANK_MISSILE: [17, 1.3], CLUSTER: [18, 0.6], CLUSTER_SUBMUNITION: [9, 0.35], AP: [3, 0.25], INCENDIARY: [4, 0.08], GATLING_BULLET: [3, 0.06], INCENDIARY_HMG: [2, 0.04], SCOUT_BULLET: [1.5, 0.03] };
  // khối lượng tương đối (đẩy nhẹ bay xa) & thông số rơi
  const JK = { bin: { m: 1, half: 2.4 }, binLid: { m: 0.3, half: 0.3 }, dump: { m: 9, half: 5 }, bag0: { m: 0.5, half: 0.6 }, bag1: { m: 0.5, half: 0.6 }, bag2: { m: 0.5, half: 0.6 }, box: { m: 0.25, half: 0.4 }, scrap: { m: 0.05, half: 0.02 } };

  // ===== RÁC / THÙNG RÁC / BAO RÁC TRÊN VỈA HÈ (thành phố bỏ hoang nhiều năm). Thùng rác, container, bao rác, thùng các-tông
  // là vật riêng (InstancedMesh theo mẫu): sóng nổ hất văng / lật đổ / đẩy trượt, bao rác rách tung toé giấy nilon, rơi
  // theo trọng lực, nảy, lăn rồi nằm lại. Giấy vụn / lon chai mỏng gộp tĩnh. Mọi ngẫu nhiên băm theo toạ độ -> mọi máy
  // như nhau (nổ ở cùng chỗ -> cùng kết quả)
  function junk(T, M, G, add) {
    const flat = Builder(), cans = Builder();
    const up = [0, 1, 0];
    // vật đã có trên vỉa hè -> tránh
    const OB = new Map(), oc = 24, okey = (x, z) => Math.floor(x / oc) * 65536 + Math.floor(z / oc);
    const P = M.props || {};
    for (const L of [P.lamps, P.signals, P.poles, P.busStops, P.cars, M.trees]) for (const o of L || []) { const k = okey(o.x, o.z); (OB.get(k) || OB.set(k, []).get(k)).push(o); }
    const free = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of OB.get(okey(x + i * oc, z + j * oc)) || []) if (Math.hypot(o.x - x, o.z - z) < r + (o.kind ? 5 : 4)) return false; return true; };
    const mark = (x, z) => { const k = okey(x, z); (OB.get(k) || OB.set(k, []).get(k)).push({ x, z }); };
    const top = (x, z) => G(x, z) + CURB_H + 0.04;
    const items = [];
    const put = (type, x, y, z, rx, ry, rz, s, col) => items.push({ type, x, y, z, rx, ry, rz, s, col, v: null });
    const bagPile = (x, z, n, sd) => {
      for (let i = 0; i < n; i++) {
        const h = (k) => hash(sd * 31 + i * 7 + k), a = h(2) * 6.28, d = i ? 2 + h(3) * 3 : 0;
        const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, sc = 1.5 + h(1) * 1.2;
        put('bag' + Math.floor(h(9) * 3), bx, top(bx, bz) + (i > 3 ? sc * 0.8 : 0), bz, (h(5) - 0.5) * 0.5, h(6) * 6.28, (h(7) - 0.5) * 0.5, sc, BAG_COL[Math.floor(h(8) * BAG_COL.length)]);
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
          xf(lx, top(lx, lz) + 0.3, lz, 0, h(9) * 6.28, Math.PI / 2, 0.3, 1 + h(10) * 1.2, 0.3);
          cylInto(cans, kind < 0.7 ? [0.6, 0.6, 0.62] : [0.3, 0.5, 0.3], 6, false);
        } else {   // thùng các-tông móp, bìa ngấm nước sẫm màu
          const s = 1.6 + h(11) * 2.4;
          put('box', lx, top(lx, lz), lz, (h(12) - 0.5) * 0.3, h(13) * 6.28, (h(14) - 0.5) * 0.3, s, [0.34, 0.27, 0.18].map(c => c * (0.8 + 0.3 * h(16))));
        }
      }
    };
    for (const B of M.blocks) {
      const C = B.curb, Lq = B.lot;
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
            if (h(2) < 0.35) { const ta = h(5) * 6.28; put('bin', x, top(x, z) + 2.4, z, 0, ta, Math.PI / 2, 1, col); litter(x + Math.cos(ta) * 6, z + Math.sin(ta) * 6, 6, 10, sd + s); }
            else {
              put('bin', x, top(x, z), z, (h(6) - 0.5) * 0.06, h(11) * 6.28, (h(7) - 0.5) * 0.06, 1, col);
              if (h(8) >= 0.5) put('binLid', x, top(x, z) + 7.5, z, 0, h(12) * 6.28, 0, 1, col.map(c => c * 0.8));
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
    add(cans.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), 'cans'));
    return new JunkSet(T, G, items, add);
  }

  class JunkSet {
    constructor(T, G, items, add) {
      this.T = T; this.G = G;
      const PR = junkProtos();
      const MAT = {
        metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.3 }),
        bag: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 }),
        card: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
        scrap: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
      };
      const matOf = (t) => t.startsWith('bag') ? MAT.bag : t === 'box' ? MAT.card : t === 'scrap' ? MAT.scrap : MAT.metal;
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
    }
    key(x, z) { return Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell); }
    write(it) {
      // dent: vỏ thép móp bẹp 1 phía (thu 1 trục ngang), squash: thùng các-tông bẹp xuống (thấp + bè ra)
      const sc = it.s;
      xf(it.x, it.y, it.z, it.rx, it.ry, it.rz, it.type === 'scrap' ? it.s : sc * (it.squash ? 1.12 : 1), it.type === 'scrap' ? 1 : sc * (it.squash || 1), it.type === 'scrap' ? it.s * 0.7 : sc * (it.dent || 1));
      this.ims[it.type].im.setMatrixAt(it.i, _m4);
      this.ims[it.type].dirty = true;
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
        const sp = Math.min(220, 70 * k / Math.sqrt(J.m)) * (0.8 + 0.4 * h(1)), hl = Math.hypot(dx, dz) || 1;
        it.v = [dx / hl * sp, sp * (0.35 + 0.4 * h(2)) / (it.type === 'dump' ? 3 : 1), dz / hl * sp];
        const spin = (it.type === 'dump' ? 0.4 : 6) * k / Math.sqrt(J.m);
        it.w = [(h(3) - 0.5) * spin, (h(4) - 0.5) * spin, (h(5) - 0.5) * spin];
        // vỏ thép móp (thùng rác / container), bìa các-tông bẹp
        if (it.type === 'bin' || it.type === 'dump') it.dent = Math.max(0.82, (it.dent || 1) - 0.08 * k);
        if (it.type === 'box' && k > 0.4) it.squash = 0.55;
        it.bounce = 0;
        this.moving.add(it);
      }
    }
    burstBag(it, dx, dz, d, k) {
      it.gone = true; it.s = 0; this.write(it);
      const S = this.ims.scrap, c = new THREE.Color(), hl = Math.hypot(dx, dz) || 1;
      for (let q = 0; q < 14; q++) {
        const h = (z) => hash(Math.round(it.x * 13 + it.z * 7) + q * 31 + z);
        const p = this.scraps[S.n % this.SCRAP]; S.n++;
        const col = q < 4 ? it.col : LIT[Math.floor(h(1) * LIT.length)];
        S.im.setColorAt(p.i, c.setRGB(col[0], col[1], col[2])); if (S.im.instanceColor) S.im.instanceColor.needsUpdate = true;
        const a = Math.atan2(dz, dx) + (h(2) - 0.5) * 2.4, sp = (30 + 90 * h(3)) * Math.min(1.5, k);
        Object.assign(p, { x: it.x + (h(4) - 0.5) * 2, y: it.y + 1, z: it.z + (h(5) - 0.5) * 2, rx: h(6) * 6, ry: h(7) * 6, rz: 0, s: q < 4 ? 1.2 + h(8) * 1.4 : 0.5 + h(8) * 1.2,
          v: [Math.cos(a) * sp, 20 + 50 * h(9) * Math.min(1.5, k), Math.sin(a) * sp], w: [(h(10) - 0.5) * 14, (h(11) - 0.5) * 10, (h(12) - 0.5) * 14], flutter: true, bounce: 1 });
        this.moving.add(p);
      }
    }
    update(dt) {
      if (!this.moving.size) return;
      const G = 78.4;
      for (const it of this.moving) {
        // giấy / nilon: rơi chậm, bị không khí hãm, chao lượn; vật nặng rơi theo trọng lực
        if (it.flutter) { it.v[1] -= G * 0.35 * dt; const dr = Math.exp(-2.5 * dt); it.v[0] *= dr; it.v[2] *= dr; it.v[1] = Math.max(it.v[1], -14); it.v[0] += Math.sin(it.y * 0.7 + it.i) * 6 * dt; }
        else it.v[1] -= G * dt;
        it.x += it.v[0] * dt; it.y += it.v[1] * dt; it.z += it.v[2] * dt;
        it.rx += it.w[0] * dt; it.ry += it.w[1] * dt; it.rz += it.w[2] * dt;
        const J = JK[it.type], g = this.rest(it.x, it.z), lie = it.type === 'bin' ? 2.4 : 0;
        if (it.y <= g + (it.flutter ? 0.03 : lie * 0.3)) {
          const spd = Math.hypot(it.v[0], it.v[1], it.v[2]);
          if (!it.flutter && it.bounce < 2 && spd > 18) {
            it.bounce++; it.y = g + lie * 0.3; it.v = [it.v[0] * 0.45, -it.v[1] * 0.25, it.v[2] * 0.45]; it.w = it.w.map(a => a * 0.5);
          } else {
            // nằm lại: thùng rác lăn nằm ngang, thùng các-tông / container dựng lại trên đáy, mảnh rác nằm phẳng
            it.y = g + (it.flutter ? 0.04 : 0);
            if (it.type === 'bin') { const up = Math.abs(Math.cos(it.rx) * Math.cos(it.rz)); if (up < 0.8 || it.v[1] < -30) { it.rx = 0; it.rz = Math.PI / 2; it.y = g + 2.4; } else { it.rx = 0; it.rz = 0; } }
            else if (it.type === 'binLid') { it.rx = (hash(it.i) - 0.5) * 0.2; it.rz = 0; }
            else if (it.type === 'scrap') { it.rx = 0; it.rz = 0; }
            else { it.rx *= 0.1; it.rz *= 0.1; }
            it.v = null; this.moving.delete(it);
            // ô lưới mới (đồ vật lăn sang ô khác)
            if (it.gk !== undefined) { const L = this.grid.get(it.gk), ix = L ? L.indexOf(it) : -1; if (ix >= 0) L.splice(ix, 1); }
            if (it.type !== 'scrap') { const k = it.gk = this.key(it.x, it.z); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(it); }
          }
        }
        this.write(it);
      }
      for (const t in this.ims) if (this.ims[t].dirty) { this.ims[t].im.instanceMatrix.needsUpdate = true; this.ims[t].dirty = false; }
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

  return { build, CURB_H };
})();
if (typeof window !== 'undefined') window.Streetscape = Streetscape;
