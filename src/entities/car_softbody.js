/**
 * THÂN Ô TÔ MỀM BIẾN DẠNG DẺO (XPBD) — khung thô ~130 điểm nối bằng thanh, chạy trong hệ toạ độ xe con (đv, mũi +z).
 *
 * - Mỗi mặt cắt dọc thân có vòng điểm: sàn, ngưỡng cửa, vai (mép nóc thân), tim capô / cốp, và trong khoang kính thêm
 *   mép mui + tim mui. Thanh nối mọi cặp điểm trong vòng và giữa 2 vòng kề nhau (giàn không gian) -> chịu uốn / xoắn.
 * - Độ cứng theo loại: sàn / dầm dọc cứng, sườn / capô vừa, cột + mui mềm. Mỗi thanh có ngưỡng chảy dẻo: biến dạng vượt
 *   ngưỡng thì độ dài nghỉ dời theo (móp vĩnh viễn, không bật lại) -> nếp gập, cột gãy, sườn bè ra tự phát sinh.
 * - 4 điểm bánh xe đỡ thân (lốp bị đè thì xẹp tới vành). Trọng lực, mặt đất có ma sát.
 * - Xe tăng: 2 dải xích + bụng là các hộp động học trong hệ xe con, đáy là đường dốc (xe tăng ngóc / chúc), 2 đầu dải
 *   xích cong lên (bánh dẫn / bánh căng) -> tôn bị ép dần khi xích bò lên, không bị "dịch chuyển tức thời".
 * - Hiển thị: mỗi đỉnh mô hình bám theo ~6 điểm khung gần nhất (nội suy nghịch đảo khoảng cách) -> chi tiết giữ nguyên.
 */
const CarSoftBody = (() => {
  const G = 78;                 // trọng lực (đv/s², 8 đv = 1 m)
  const SUB = 10;               // bước con mỗi lần step
  // loại thanh: độ mềm XPBD (càng lớn càng mềm), ngưỡng chảy dẻo (tỉ lệ biến dạng)
  const KIND = {
    frame: { a: 2e-6, y: 0.06 },   // sàn, dầm dọc, khung máy
    side: { a: 2e-5, y: 0.022 },   // sườn, vai, capô / cốp
    pillar: { a: 8e-5, y: 0.012 },  // cột A / B / C, mui
    wheel: { a: 1e-6, y: 0.2 }
  };

  function create(S, top, roof, plan, cabin) {
    const z0 = S.plan[0][0] + 0.7, z1 = S.plan[S.plan.length - 1][0] - 0.7, NS = 15;
    const P = [], R = [], role = [];   // vị trí hiện tại, vị trí nghỉ, vai trò (0 sàn, 1 sườn, 2 mui, 3 bánh)
    const ring = [];
    const add = (x, y, z, r) => { P.push(x, y, z); R.push(x, y, z); role.push(r); return role.length - 1; };
    for (let i = 0; i < NS; i++) {
      const z = z0 + (z1 - z0) * i / (NS - 1), w = plan(z), t = top(z), ids = [];
      for (const sx of [1, -1]) ids.push(add(sx * (w - 1.2), 1.7, z, 0));
      for (const sx of [1, -1]) ids.push(add(sx * w, 3.6, z, 1));
      for (const sx of [1, -1]) ids.push(add(sx * (w - 0.35), t - 0.35, z, 1));
      ids.push(add(0, t + 0.15, z, 1));
      if (z > cabin[0] + 0.5 && z < cabin[1] - 0.5 && roof(z) > t + 1) {
        const rf = roof(z);
        for (const sx of [1, -1]) ids.push(add(sx * (w - 2.0), rf - 0.35, z, 2));
        ids.push(add(0, rf + 0.05, z, 2));
      }
      ring.push(ids);
    }
    // điểm bánh xe (tâm trục)
    const wheelIds = [];
    for (const az of [S.axleF, S.axleR]) for (const sx of [1, -1]) wheelIds.push(add(sx * S.trackHalf, S.r, az, 3));
    const N = role.length;
    // thanh nối
    const C = [];   // [i, j, rest, rest0, a, yield]
    const link = (i, j, kind) => {
      const dx = R[3 * i] - R[3 * j], dy = R[3 * i + 1] - R[3 * j + 1], dz = R[3 * i + 2] - R[3 * j + 2], L = Math.hypot(dx, dy, dz);
      if (L < 1e-3) return;
      const K = KIND[kind]; C.push([i, j, L, L, K.a, K.y]);
    };
    const kindOf = (a, b) => (role[a] === 2 || role[b] === 2) ? 'pillar' : (role[a] === 0 && role[b] === 0) ? 'frame' : (role[a] === 0 || role[b] === 0) && Math.abs(R[3 * a + 1] - R[3 * b + 1]) < 2.5 ? 'frame' : 'side';
    for (let i = 0; i < NS; i++) {
      const A = ring[i];
      for (let a = 0; a < A.length; a++) for (let b = a + 1; b < A.length; b++) link(A[a], A[b], kindOf(A[a], A[b]));
      if (i + 1 < NS) { const B = ring[i + 1]; for (const a of A) for (const b of B) { const d = Math.hypot(R[3 * a] - R[3 * b], R[3 * a + 1] - R[3 * b + 1]); if (d < 8.5) link(a, b, kindOf(a, b)); } }
      if (i + 2 < NS) { const B = ring[i + 2]; for (let k = 0; k < Math.min(A.length, B.length, 7); k++) link(A[k], B[k], role[A[k]] === 0 ? 'frame' : 'side'); }
    }
    for (const w of wheelIds) {
      // bánh nối cứng vào các điểm sàn / sườn gần nhất
      const near = [];
      for (let i = 0; i < N; i++) if (role[i] < 2) near.push([Math.hypot(R[3 * i] - R[3 * w], R[3 * i + 1] - R[3 * w + 1], R[3 * i + 2] - R[3 * w + 2]), i]);
      near.sort((a, b) => a[0] - b[0]);
      for (const [, i] of near.slice(0, 6)) link(w, i, 'wheel');
    }
    const V = new Float32Array(N * 3), Pp = new Float32Array(N * 3), lam = new Float32Array(C.length);
    // độ dày tối thiểu của đống xác xe bị nghiền nát (phần không thể ép dẹt thành giấy):
    // sàn + khung dầm thép hộp ~15 cm (1.15 đv), sườn + giàn ghế kim loại nén ~23 cm (1.85 đv),
    // mui tôn nẹp gập nhiều lớp ~31 cm (2.45 đv); khoang máy có khối động cơ gang thép đặc + hộp số (~48-53 cm, ~3.8-4.25 đv),
    // quanh cầu sau + bình xăng + cụm giảm xóc (~35-41 cm, ~2.8-3.3 đv)
    const engineBlock = (z) => z > S.axleF - 5.5 ? 1.8 * Math.min(1.0, Math.max(0.0, (z - (S.axleF - 5.5)) / 2.5)) : 0;
    const rearBlock = (z) => Math.abs(z - S.axleR) < 3.5 ? 0.85 * Math.max(0.0, 1.0 - Math.abs(z - S.axleR) / 3.5) : 0;
    const extraBlock = (z) => engineBlock(z) + rearBlock(z);
    const baseThickness = [1.15, 1.85, 2.45, S.r];
    const minY = role.map((r, i) => {
      if (r === 3) return S.r;
      const eb = extraBlock(R[3 * i + 2]);
      return baseThickness[r] + eb * (r === 0 ? 0.5 : r === 1 ? 0.75 : 1.0);
    });
    const tireFlat = new Float32Array(4);          // độ xẹp lốp (0..1) từng bánh
    let colliders = [], awake = 0, tankV = [0, 0];
    // hộp xích: tâm (cx, cz), trục dọc (fx, fz), nửa dài hl, nửa rộng hw, đáy h(al) = b0 + slope*al, 2 đầu cong lên
    // D: kích thước gầm xe tăng (đv) — tc tâm dải xích, tw nửa bề rộng xích, flat nửa đoạn xích chạm đất, hl nửa dài cả dải
    // (2 đầu cong lên với độ dốc rise), belly gầm giữa 2 xích (nửa rộng bw), bEnd / bEndH: tấm thân dưới mũi / đuôi thấp hơn.
    // Không truyền -> hộp chung cũ của game (xích ±11,2, dài 37, gầm 3,4)
    const DEF_DIM = { tc: 11.2, tw: 2.6, flat: 14, hl: 18.5, rise: 1.6, belly: 3.4, bw: 8.6 };
    // c0: đáy xích tại tâm, slope: dốc dọc (đv / đv, + mũi cao), roll: dốc ngang (+ bên phải cao)
    const setTank = (tx, tz, hd, c0 = 0, slope = 0, vx = 0, vz = 0, D = DEF_DIM, roll = 0) => {
      const fx = Math.sin(hd), fz = Math.cos(hd), rx = fz, rz = -fx;
      colliders = [
        { cx: tx + rx * D.tc, cz: tz + rz * D.tc, fx, fz, hl: D.hl, hw: D.tw, b0: c0 + roll * D.tc, s: slope, flat: D.flat, rise: D.rise },
        { cx: tx - rx * D.tc, cz: tz - rz * D.tc, fx, fz, hl: D.hl, hw: D.tw, b0: c0 - roll * D.tc, s: slope, flat: D.flat, rise: D.rise },
        D.bEnd === undefined
          ? { cx: tx, cz: tz, fx, fz, hl: D.hl + 0.5, hw: D.bw, b0: c0 + D.belly, s: slope, flat: D.hl - 4, rise: 0.8 }
          : { cx: tx, cz: tz, fx, fz, hl: D.hl, hw: D.bw, b0: c0 + D.belly, s: slope, flat: D.bEnd, endH: D.bEndH - D.belly }
      ];
      tankV = [vx, vz]; awake = 1.5; realDim = D !== DEF_DIM;
    };
    // điểm khung bị đè xuống tới đâu thì thôi (sàn / khối máy không ép dẹt hết; bánh xe: lốp xẹp + vành bẹp sát đất)
    // (hộp chung cũ của game: tâm bánh giữ ở bán kính lốp như trước)
    let realDim = false;
    const floorOf = i => role[i] === 3 && realDim ? Math.max(0.6, S.r * 0.3) : minY[i];
    // độ cao đỡ dưới 4 góc gầm xe tăng [trái-trước, trái-sau, phải-trước, phải-sau]: điểm khung cứng nhất nằm dưới mỗi nửa
    // dải xích -> xe tăng phải nằm trên đống xác cao chừng đó (không nghiền xác xuyên qua xích)
    const support = (tx, tz, hd, D = DEF_DIM, out = [0, 0, 0, 0]) => {
      const fx = Math.sin(hd), fz = Math.cos(hd);
      realDim = D !== DEF_DIM;
      out[0] = out[1] = out[2] = out[3] = 0;
      for (let i = 0; i < N; i++) {
        const dx = P[3 * i] - tx, dz = P[3 * i + 2] - tz, al = dx * fx + dz * fz, lt = dx * fz - dz * fx;
        if (Math.abs(al) > D.hl || Math.abs(Math.abs(lt) - D.tc) > D.tw) continue;
        const k = (lt > 0 ? 2 : 0) + (al > 0 ? 0 : 1), h = floorOf(i) - Math.max(0, Math.abs(al) - D.flat) * D.rise;
        if (h > out[k]) out[k] = h;
      }
      return out;
    };
    let hStep = 1 / 300, fric = 0;
    const collide = (i) => {
      let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      for (const c of colliders) {
        const dx = x - c.cx, dz = z - c.cz, al = dx * c.fx + dz * c.fz, lt = -dx * c.fz + dz * c.fx;
        if (Math.abs(lt) > c.hw || Math.abs(al) > c.hl) continue;
        // đầu xích cong lên (bánh dẫn / bánh căng); gầm: tấm thân dưới mũi / đuôi thấp hơn giữa gầm
        const end = c.endH !== undefined ? (Math.abs(al) > c.flat ? c.endH : 0) : Math.max(0, Math.abs(al) - c.flat) * c.rise;
        const hb = c.b0 + c.s * al + end, fl = floorOf(i);
        if (y > hb) {
          // đè xuống + miết kéo theo xe tăng (ma sát xích - tôn)
          const drop = y - Math.max(fl, hb);
          y = Math.max(fl, hb);
          if (role[i] === 1 || role[i] === 2) { const sx = Math.sign(R[3 * i]) || 0; x += sx * Math.min(1.4, drop * 0.35); }
          // mặt xích chạm đất đứng yên so với mặt đường (xích lăn, không trượt) -> chỉ xô nhẹ xác xe
          x += tankV[0] * hStep * 0.02 * fric; z += tankV[1] * hStep * 0.02 * fric;
          if (role[i] === 3) { const w = wheelIds.indexOf(i); if (w >= 0) tireFlat[w] = Math.max(tireFlat[w], Math.min(1, (S.r - hb) / (S.r * 0.65))); }
        }
      }
      // mặt đất + ma sát (lốp xẹp: tâm bánh hạ xuống sát đất, triệt tiêu bật nảy)
      let my = minY[i];
      if (role[i] === 3) { const w = wheelIds.indexOf(i); my = Math.max(0.48, S.r * (1 - 0.72 * tireFlat[w])); }
      if (y < my) {
        y = my;
        const px = Pp[3 * i], pz = Pp[3 * i + 2];
        x = px + (x - px) * 0.4; z = pz + (z - pz) * 0.4;
        Pp[3 * i + 1] = my;   // triệt tiêu vận tốc ảo đập sàn bật ngược lên
      }
      P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
    };
    let maxK = 0, moved = false;
    const step = (dt) => {
      if (awake <= 0 || dt <= 0) return false;
      awake -= dt;
      const h = Math.min(dt, 1 / 30) / SUB; hStep = h;
      let mv = 0;
      for (let s = 0; s < SUB; s++) {
        for (let i = 0; i < N; i++) {
          Pp[3 * i] = P[3 * i]; Pp[3 * i + 1] = P[3 * i + 1]; Pp[3 * i + 2] = P[3 * i + 2];
          V[3 * i + 1] -= G * h;
          P[3 * i] += V[3 * i] * h; P[3 * i + 1] += V[3 * i + 1] * h; P[3 * i + 2] += V[3 * i + 2] * h;
        }
        lam.fill(0);
        for (let it = 0; it < 2; it++) {
          for (let c = 0; c < C.length; c++) {
            const K = C[c], a = K[0], b = K[1];
            const dx = P[3 * a] - P[3 * b], dy = P[3 * a + 1] - P[3 * b + 1], dz = P[3 * a + 2] - P[3 * b + 2], L = Math.hypot(dx, dy, dz) || 1e-6;
            const Cv = L - K[2], at = K[4] / (h * h), dl = (-Cv - at * lam[c]) / (2 + at);
            lam[c] += dl;
            const k = dl / L * 0.5;
            P[3 * a] += dx * k; P[3 * a + 1] += dy * k; P[3 * a + 2] += dz * k;
            P[3 * b] -= dx * k; P[3 * b + 1] -= dy * k; P[3 * b + 2] -= dz * k;
          }
          fric = it === 0 ? 1 : 0;
          for (let i = 0; i < N; i++) collide(i);
        }
        // biến dạng dẻo: thanh bị kéo / nén quá ngưỡng -> độ dài nghỉ dời theo (móp vĩnh viễn)
        for (const K of C) {
          const a = K[0], b = K[1], L = Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
          const e = (L - K[2]) / K[3];
          if (Math.abs(e) > K[5]) K[2] += (L - K[2] - Math.sign(e) * K[5] * K[3]) * 0.95;
          K[2] = Math.max(K[3] * 0.08, K[2]);
        }
        for (let i = 0; i < N; i++) {
          V[3 * i] = (P[3 * i] - Pp[3 * i]) / h; V[3 * i + 1] = (P[3 * i + 1] - Pp[3 * i + 1]) / h; V[3 * i + 2] = (P[3 * i + 2] - Pp[3 * i + 2]) / h;
          // Kim loại biến dạng dẻo: dập tắt dao động cực nhanh, không rung nhún đàn hồi như đệm lò xo
          const damp = 0.88;
          V[3 * i] *= damp; V[3 * i + 1] *= damp; V[3 * i + 2] *= damp;
          mv = Math.max(mv, Math.abs(P[3 * i] - Pp[3 * i]) + Math.abs(P[3 * i + 1] - Pp[3 * i + 1]) + Math.abs(P[3 * i + 2] - Pp[3 * i + 2]));
        }
      }
      colliders = [];
      if (mv > 0.05) awake = Math.max(awake, 0.18);
      maxK = 0;
      for (let i = 0; i < N; i++) maxK = Math.max(maxK, nodeK(i));
      moved = moved || mv > 0.002;
      return true;
    };
    // mức bị ép của 1 điểm khung (0 nguyên .. 1 bẹp sát đất)
    const nodeK = i => role[i] === 3 ? tireFlat[wheelIds.indexOf(i)] : Math.max(0, Math.min(1, (R[3 * i + 1] - P[3 * i + 1]) / Math.max(1, R[3 * i + 1] - minY[i])));
    // nhúng đỉnh hiển thị: 6 điểm khung gần nhất (nghịch đảo bình phương khoảng cách)
    const KN = 6;
    const bind = (arr) => {
      const n = arr.length / 3, idx = new Uint16Array(n * KN), wt = new Float32Array(n * KN), best = new Float32Array(KN), bi = new Int32Array(KN);
      for (let v = 0; v < n; v++) {
        const x = arr[3 * v], y = arr[3 * v + 1], z = arr[3 * v + 2];
        best.fill(1e9); bi.fill(0);
        for (let i = 0; i < N; i++) {
          if (role[i] === 3) continue;
          const d = (R[3 * i] - x) ** 2 + (R[3 * i + 1] - y) ** 2 * 1.5 + (R[3 * i + 2] - z) ** 2;
          if (d < best[KN - 1]) { let k = KN - 1; while (k > 0 && best[k - 1] > d) { best[k] = best[k - 1]; bi[k] = bi[k - 1]; k--; } best[k] = d; bi[k] = i; }
        }
        let s = 0; for (let k = 0; k < KN; k++) s += (wt[v * KN + k] = 1 / (best[k] + 2));
        for (let k = 0; k < KN; k++) { wt[v * KN + k] /= s; idx[v * KN + k] = bi[k]; }
      }
      return { idx, wt };
    };
    // dời 1 điểm theo khung: -> [dx, dy, dz, k]
    const dispOf = (B, v, out) => {
      let dx = 0, dy = 0, dz = 0, k = 0;
      for (let q = 0; q < KN; q++) { const i = B.idx[v * KN + q], w = B.wt[v * KN + q]; dx += w * (P[3 * i] - R[3 * i]); dy += w * (P[3 * i + 1] - R[3 * i + 1]); dz += w * (P[3 * i + 2] - R[3 * i + 2]); k += w * nodeK(i); }
      out[0] = dx; out[1] = dy; out[2] = dz; out[3] = k; return out;
    };
    // dời 1 điểm bất kỳ (không nhúng sẵn)
    const dispAt = (x, y, z, out = [0, 0, 0, 0]) => { const B = bind([x, y, z]); return dispOf(B, 0, out); };
    const wheelPos = w => [P[3 * wheelIds[w]], P[3 * wheelIds[w] + 1], P[3 * wheelIds[w] + 2]];
    // trúng đạn / sóng nổ vào xác: các điểm khung trong bán kính R bị hất theo hướng từ tâm nổ ra (mạnh v đv/s, giảm theo
    // khoảng cách) -> tôn móp / bung tiếp theo biến dạng dẻo, xác đang bẹp vẫn nát thêm được
    const impulse = (x, y, z, Rr, v) => {
      for (let i = 0; i < N; i++) {
        const dx = P[3 * i] - x, dy = P[3 * i + 1] - y, dz = P[3 * i + 2] - z, d = Math.hypot(dx, dy, dz);
        if (d > Rr) continue;
        const k = v * (1 - d / Rr) / (d + 0.5);
        V[3 * i] += dx * k * 0.6;
        V[3 * i + 1] += Math.max(-50, Math.min(25, dy * k * 0.2)) - v * 0.12 * (1 - d / Rr);
        V[3 * i + 2] += dz * k * 0.6;
      }
      awake = Math.max(awake, 0.6);
    };
    return {
      setTank, support, step, impulse, bind, dispOf, dispAt, wheelPos, nodeK,
      get maxK() { return maxK; }, get awake() { return awake > 0; },
      consumeMoved() { const m = moved; moved = false; return m; },
      tireFlat, nodes: N, links: C.length
    };
  }
  return { create };
})();
if (typeof window !== 'undefined') window.CarSoftBody = CarSoftBody;
