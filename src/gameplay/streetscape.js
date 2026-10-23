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
  // gạch lát vỉa hè: ô vuông 40 cm xếp so le, mạch vữa sẫm, viên đậm nhạt khác nhau, vết bẩn
  const pavingTex = () => canvasTex('paving', 256, 256, (g, w, h) => {
    g.fillStyle = '#5c5a55'; g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const k = 0.82 + hash(r * 31 + c * 7) * 0.3, off = (r % 2) * s / 2;
      g.fillStyle = `rgb(${158 * k | 0},${152 * k | 0},${142 * k | 0})`;
      g.fillRect(c * s + off + 1, r * s + 1, s - 2, s - 2);
      if (c === 0 && off) g.fillRect(off - s + 1, r * s + 1, s - 2, s - 2);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = hash(i * 3) < 0.5 ? 'rgba(40,38,34,0.18)' : 'rgba(220,214,200,0.12)';
      g.fillRect(hash(i * 3 + 1) * w, hash(i * 3 + 2) * h, 1 + hash(i) * 2, 1 + hash(i + 5) * 2);
    }
    for (let i = 0; i < 14; i++) {
      const x = hash(i * 11) * w, y = hash(i * 11 + 1) * h, r = 8 + hash(i * 11 + 2) * 22, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(30,28,24,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  // đá bó vỉa / bê tông kè: xám sáng có hạt, đốm bẩn
  const stoneTex = (key, base) => canvasTex(key, 128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = hash(i * 5) < 0.5 ? 'rgba(30,30,30,0.16)' : 'rgba(255,255,255,0.1)';
      g.fillRect(hash(i * 5 + 1) * w, hash(i * 5 + 2) * h, 1 + hash(i * 5 + 3) * 2, 1 + hash(i * 5 + 4) * 2);
    }
    for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(20,20,20,0.35)'; g.fillRect(x, 0, 1, h); }   // mạch nối đoạn bó vỉa / tấm kè
    const gr = g.createLinearGradient(0, h, 0, h * 0.55); gr.addColorStop(0, 'rgba(40,46,36,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, h * 0.55, w, h * 0.45);   // rêu / vệt nước chân kè
  });

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

  function build(T) {
    const M = T.map;
    if (!M.blocks || !M.blocks.length) return null;
    const G = (x, z) => T.groundAtRaw(x, z);
    const group = new THREE.Group(); group.name = 'streetscape';
    const pave = Builder(), curb = Builder(), quay = Builder(), rail = Builder(), deco = Builder();
    const up = [0, 1, 0];

    // ===== VỈA HÈ + BÓ VỈA (mỗi ô phố)
    for (const B of M.blocks) {
      const O = outline(B), n = O.length, L = B.lot;
      // màu gạch theo ô (xám / đỏ gạch / be) để các ô không đồng loạt một màu
      const hk = hash(Math.round(B.cx) * 7 + Math.round(B.cz) * 13);
      const pc = hk < 0.45 ? [1, 1, 1] : hk < 0.75 ? [1.08, 0.86, 0.76] : [1.06, 1.0, 0.88];
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
          // lan can sắt: tay vịn cao 1 m + cọc mỗi 2 m, lùi 0,5 m khỏi mép kè
          const ux = W(u + sg * 4, v), uy = W(u + sg * 4, v1);
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
    const J = Builder(), plain = [0.92, 0.92, 0.92];
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
    const paveMat = new THREE.MeshStandardMaterial({ map: pavingTex(), vertexColors: true, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
    const curbMat = new THREE.MeshStandardMaterial({ map: stoneTex('curb', '#b8b6ae'), vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
    const quayMat = new THREE.MeshStandardMaterial({ map: stoneTex('quay', '#9c9a90'), vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3c4a44, vertexColors: true, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
    const decoMat = new THREE.MeshStandardMaterial({ color: 0x111111, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const jMat = new THREE.MeshStandardMaterial({ map: T.roadTexture ? T.roadTexture('asphalt', true) : null, color: 0xcccccc, vertexColors: true, roughness: 0.82, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    const zMat = new THREE.MeshStandardMaterial({ color: 0xe4e2da, vertexColors: true, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, side: THREE.DoubleSide });
    add(pave.mesh(paveMat, 'sidewalk'));
    add(curb.mesh(curbMat, 'curb'));
    add(quay.mesh(quayMat, 'quay_wall'));
    add(rail.mesh(railMat, 'quay_rail'));
    add(deco.mesh(decoMat, 'culvert'));
    add(J.mesh(jMat, 'junction_asphalt'));
    add(Z.mesh(zMat, 'road_paint'));
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
    return { group, covers };
  }

  return { build, CURB_H };
})();
if (typeof window !== 'undefined') window.Streetscape = Streetscape;
