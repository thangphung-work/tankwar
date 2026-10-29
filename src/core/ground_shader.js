/**
 * SHADER MẶT ĐẤT CHÂN THỰC (thay cho 1 ảnh màu phủ toàn bản đồ)
 * - 4 lớp vật liệu sinh thủ tục theo từng loại chiến địa: nền chính (cỏ / cát / bê tông), đất, đá, sỏi
 * - Trộn theo độ dốc thật của mặt đất (sườn dốc lộ đá), nhiễu tầng lớn (mảng đất trống, bãi sỏi), độ ẩm ven nước (bùn)
 * - Mỗi lớp lấy mẫu ở 2 tỉ lệ & lệch hướng (không lộ ô lặp); đá chiếu 3 phía (vách dốc không bị kéo giãn)
 * - Gồ ghề bề mặt (bump) theo độ cao của chính lớp vật liệu đang hiện
 * - Ảnh màu cũ của bản đồ (paintGround) chỉ còn dùng pha màu tầng lớn: vệt ẩm, thảm thực vật, nền đường
 * - Bóng mây trôi: dùng chung cho mọi vật (SkySystem.installCloudShadows), không còn riêng mặt đất
 */
const GroundShader = (() => {
  const TEX = {};
  const uTime = { value: 0 };
  // Che khuất ánh trời dưới gầm / sát quanh xe (contact AO): tối đa 16 xe gần camera; A = (x, z, cos, -sin) góc thân xe,
  // B = (nửa rộng, nửa dài, lõi tối vào trong, tán ra ngoài). Không có thì gầm xe sáng như bãi trống -> xe như đặt nổi
  const VEH_N = 16;
  const uVehA = { value: Array.from({ length: VEH_N }, () => new THREE.Vector4(0, 0, 1, 0)) };
  const uVehB = { value: Array.from({ length: VEH_N }, () => new THREE.Vector4(0, 0, 1, 1)) };
  const uVehN = { value: 0 };
  // Bóng khóm cỏ 3D quanh tâm nhìn (GroundCover.splatCover vẽ ra): ô vuông tâm (x, z) cạnh 1/z; w = độ đậm (0 = tắt).
  // Đất dưới / sát khóm cỏ khuất ánh trời, ngả màu gốc cỏ -> khóm "cắm rễ" xuống đất thay vì như dán trên thảm nỉ
  const uCovMap = { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) };
  uCovMap.value.needsUpdate = true;
  const uCovXf = { value: new THREE.Vector4(0, 0, 1, 0) };
  // vùng thảm cỏ ngắn (GroundCover): tâm (x, y), bán kính z (0 = tắt), dải mờ viền w -> đất dưới thảm sẫm như gốc cỏ
  const uCarpet = { value: new THREE.Vector4(0, 0, 0, 1) };
  // mặt nạ rừng nền (Backdrop.buildForest chấm từng cây): x = nửa cạnh vùng phủ, y = 1 / cạnh, z = độ đậm (0 = tắt)
  const uForMap = { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) };
  uForMap.value.needsUpdate = true;
  const uForXf = { value: new THREE.Vector4(0, 1, 0, 0) };
  // độ phóng kính ngắm (game đặt mỗi khung): các lớp chi tiết mờ dần theo cự ly BIỂU KIẾN (cự ly / độ phóng) — soi 10× đỉnh
  // núi 3 km phải vẽ chi tiết như ở 300 m, không phải bản trơn láng của 3 km
  const uLodMag = { value: 1 };
  // BÓNG NẮNG + AO NƯỚNG SẴN toàn thế giới (Backdrop.build bakeSun): R = độ lộ nắng (bóng sống núi đổ xuống thung),
  // G = độ hở bầu trời tầm lớn (lòng thung tối hơn). xf: (x0, z0, 1/cạnh, bật). Khung bóng đổ thật chỉ phủ ±900 quanh xe
  // -> ngoài khung đó đồi núi chỉ có sáng tối theo pháp tuyến, nhìn như đất sét
  const uSunMap = { value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) };
  uSunMap.value.needsUpdate = true;
  const uSunXf = { value: new THREE.Vector4(0, 0, 1, 0) };
  // khung bóng đổ thật đang phủ (game.placeSunShadow): tâm (x, z), nửa cạnh z (0 = tắt bóng đổ) -> trong khung dùng bóng thật
  const uShadowBox = { value: new THREE.Vector4(0, 0, 0, 0) };
  const VEH_SIZE = { ALL_ROUNDER: [15, 24], GATLING: [15.5, 21], ARTILLERY: [10, 24], SCOUT: [8.5, 14] };
  const _vehTmp = [];
  /** Cập nhật mỗi khung: units (xe sống & xác), cam (vị trí camera) */
  function setVehicles(units, cam, groundAt) {
    _vehTmp.length = 0;
    for (const u of units || []) {
      if (!u || !u.group || u.group.visible === false || u.airborne) continue;
      const d = cam ? Math.hypot(u.x - cam.x, u.z - cam.z) : 0;
      if (d > 1600) continue;
      if (groundAt && (u.y || 0) - groundAt(u.x, u.z) > 14) continue;   // đang bay / rơi: không đè bóng xuống đất
      _vehTmp.push([d, u]);
    }
    _vehTmp.sort((a, b) => a[0] - b[0]);
    const n = Math.min(VEH_N, _vehTmp.length);
    for (let i = 0; i < n; i++) {
      const u = _vehTmp[i][1], sz = VEH_SIZE[u.tankType] || VEH_SIZE.ALL_ROUNDER, a = u.bodyAngle || 0;
      uVehA.value[i].set(u.x, u.z, Math.cos(a), -Math.sin(a));
      uVehB.value[i].set(sz[0], sz[1], 3, u.isDead ? 6 : 7.5);
    }
    uVehN.value = n;
  }

  // ---------------------------------------------------------------------------
  // TIỆN ÍCH VẼ TEXTURE LẶP LIỀN MẠCH
  // ---------------------------------------------------------------------------
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const N = 512;
  function canvas() { const c = document.createElement('canvas'); c.width = c.height = N; return c; }
  // canvas vẽ xong rồi đọc lại từng điểm ảnh (grain, noiseTex): vẽ bằng CPU luôn — canvas GPU phải chờ đọc ngược
  const RD = { willReadFrequently: true };
  // vẽ lặp quanh mép để texture nối liền khi lặp lại
  function wrapDraw(g, x, y, r, fn) {
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      if (x + ox + r < 0 || x + ox - r > N || y + oy + r < 0 || y + oy - r > N) continue;
      fn(x + ox, y + oy);
    }
  }
  const rgb = (c, k = 1, a = 1) => `rgba(${Math.max(0, Math.min(255, c[0] * k)) | 0},${Math.max(0, Math.min(255, c[1] * k)) | 0},${Math.max(0, Math.min(255, c[2] * k)) | 0},${a})`;
  function blotches(g, rnd, n, col, r0, r1, a0, a1, kMin = 0.75, kMax = 1.2) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * N, y = rnd() * N, r = r0 + rnd() * (r1 - r0), k = kMin + rnd() * (kMax - kMin), a = a0 + rnd() * (a1 - a0);
      wrapDraw(g, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, rgb(col, k, a)); gr.addColorStop(1, rgb(col, k, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fill();
      });
    }
  }
  // nhiễu hạt từng điểm ảnh
  function grain(g, rnd, amt, sat = 0) {
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * amt, c = (rnd() - 0.5) * sat;
      d[i] += n + c; d[i + 1] += n; d[i + 2] += n - c;
    }
    g.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // CÁC LỚP VẬT LIỆU
  // ---------------------------------------------------------------------------
  function grassTex(base, dry, seed) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 70, base, 20, 90, 0.25, 0.55, 0.7, 1.25);
    blotches(g, rnd, 26, dry, 24, 80, 0.2, 0.45);
    blotches(g, rnd, 40, [base[0] * 0.55, base[1] * 0.5, base[2] * 0.45], 6, 22, 0.35, 0.6);   // hõm tối giữa các khóm cỏ
    grain(g, rnd, 26, 10);
    // ngọn cỏ: nét ngắn nhiều sắc độ, nghiêng ngẫu nhiên; ngọn sáng phía trên, chân tối
    for (let i = 0; i < 16000; i++) {
      const x = rnd() * N, y = rnd() * N, L = 2.5 + rnd() * 6, a = -1.57 + (rnd() - 0.5) * 1.3;
      const isDry = rnd() < 0.16, k = 0.7 + rnd() * 0.65;
      const col = isDry ? dry : base;
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      wrapDraw(g, x, y, L, (px, py) => {
        g.strokeStyle = rgb(col, k * 0.6, 0.55); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + (x2 - x) * 0.5, py + (y2 - y) * 0.5); g.stroke();
        g.strokeStyle = rgb(col, k * 1.15, 0.8); g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(px + (x2 - x) * 0.35, py + (y2 - y) * 0.35); g.lineTo(px + (x2 - x), py + (y2 - y)); g.stroke();
      });
    }
    // vài bông cỏ dại / hoa nhỏ
    for (let i = 0; i < 90; i++) {
      const x = rnd() * N, y = rnd() * N;
      g.fillStyle = rnd() < 0.5 ? 'rgba(220,210,150,0.4)' : 'rgba(230,228,215,0.3)';
      g.fillRect(x, y, 1.6, 1.6);
    }
    return c;
  }
  function dirtTex(base, seed) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 80, base, 14, 70, 0.3, 0.6, 0.72, 1.22);
    grain(g, rnd, 30, 8);
    // cục đất: sáng phía trên (nắng), tối phía dưới (bóng)
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * N, y = rnd() * N, r = 1.2 + rnd() * 4.2, k = 0.8 + rnd() * 0.4;
      wrapDraw(g, x, y, r + 2, (px, py) => {
        g.fillStyle = rgb(base, 0.55, 0.55); g.beginPath(); g.ellipse(px + 0.8, py + 1.2, r, r * 0.75, 0, 0, 6.2832); g.fill();
        g.fillStyle = rgb(base, k * 1.12, 0.9); g.beginPath(); g.ellipse(px, py, r, r * 0.72, 0, 0, 6.2832); g.fill();
      });
    }
    // sỏi nhỏ
    for (let i = 0; i < 700; i++) {
      const x = rnd() * N, y = rnd() * N, r = 0.8 + rnd() * 2;
      g.fillStyle = rgb([150, 145, 135], 0.7 + rnd() * 0.5, 0.8); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    // vết nứt khô
    g.strokeStyle = rgb(base, 0.45, 0.5); g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let x = rnd() * N, y = rnd() * N;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }
  function rockTex(base, lichen, seed) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 60, base, 30, 130, 0.35, 0.7, 0.65, 1.3);
    // vân lớp đá trầm tích
    for (let i = 0; i < 22; i++) {
      const y0 = rnd() * N, amp = 6 + rnd() * 16, m = 1 + Math.floor(rnd() * 3), w = 2 + rnd() * 8, k = 0.7 + rnd() * 0.5;
      g.strokeStyle = rgb(base, k, 0.35); g.lineWidth = w;
      for (const oy of [-N, 0, N]) {
        g.beginPath();
        for (let x = 0; x <= N; x += 8) { const y = y0 + oy + Math.sin(x / N * 6.2832 * m + i) * amp; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.stroke();
      }
    }
    grain(g, rnd, 36, 4);
    // khe nứt sâu
    for (let i = 0; i < 40; i++) {
      let x = rnd() * N, y = rnd() * N;
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; pts.push([x, y]); }
      for (const [ox, oy] of [[0, 0], [1.2, 1.2]]) {
        g.strokeStyle = ox ? rgb(base, 1.3, 0.35) : rgb(base, 0.35, 0.75); g.lineWidth = ox ? 0.8 : 1.4;
        g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p[0] + ox, p[1] + oy) : g.moveTo(p[0] + ox, p[1] + oy)); g.stroke();
      }
    }
    // địa y / rêu bám
    blotches(g, rnd, 50, lichen, 3, 14, 0.3, 0.6);
    return c;
  }
  function fineTex(base, seed, sandy) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 50, base, 12, 60, 0.3, 0.55, 0.8, 1.18);
    if (sandy) {
      // gợn cát theo gió
      for (let y = 0; y < N; y += 5 + rnd() * 3) {
        g.strokeStyle = rgb(base, 0.82, 0.35); g.lineWidth = 1.4;
        g.beginPath();
        for (let x = 0; x <= N; x += 8) { const yy = y + Math.sin(x * 0.045 + y * 0.3) * 2.2; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
        g.stroke();
      }
      grain(g, rnd, 22, 6);
    } else {
      grain(g, rnd, 20, 6);
      for (let i = 0; i < 5200; i++) {
        const x = rnd() * N, y = rnd() * N, r = 0.6 + rnd() * 1.9, k = 0.6 + rnd() * 0.7;
        g.fillStyle = rgb(base, 0.5, 0.5); g.beginPath(); g.arc(x + 0.6, y + 0.7, r, 0, 6.2832); g.fill();
        g.fillStyle = rgb(base, k * 1.1, 0.95); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
    }
    return c;
  }
  // Hạt cát mịn đẳng hướng (không vân, không nét vẽ): nhiễu gradient nhiều tầng biên độ nhỏ + hạt khoáng sẫm / thạch anh sáng
  // lấm tấm. Độ tương phản thấp -> lặp lại không lộ khuôn; gợn cát & mô cát do shader dựng thành hình khối (nhận nắng)
  function sandGrainTex(base, seed) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    const img = g.createImageData(N, N), d = img.data;
    const noise = octaves(rnd, [[4, 0.35], [16, 0.3], [64, 0.22], [256, 0.13]]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = noise(x, y);
      const k = (y * N + x) * 4, f = 1 + n * 0.22 + (rnd() - 0.5) * 0.07;
      d[k] = base[0] * f; d[k + 1] = base[1] * f; d[k + 2] = base[2] * (f * 0.98 + 0.02); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // hạt khoáng sẫm (magnetit, mảnh đá) và thạch anh sáng: 1-2 điểm ảnh, thưa
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * N, y = rnd() * N, dark = rnd() < 0.55, k = dark ? 0.55 + rnd() * 0.25 : 1.12 + rnd() * 0.12;
      g.fillStyle = rgb(base, k, 0.55 + rnd() * 0.35); g.fillRect(x, y, rnd() < 0.7 ? 1 : 1.6, 1);
    }
    return c;
  }
  // Nhiễu gradient nhiều tầng lặp tuần hoàn theo ô N (đẳng hướng, không lộ sọc lưới như nhiễu giá trị)
  function octaves(rnd, specs) {
    const L = specs.map(([cells, amp]) => {
      const gx = new Float32Array(cells * cells), gy = new Float32Array(cells * cells);
      for (let i = 0; i < gx.length; i++) {
        const a = rnd() * Math.PI * 2;
        gx[i] = Math.cos(a); gy[i] = Math.sin(a);
      }
      return { cells, amp, gx, gy };
    });
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
      let n = 0;
      for (const o of L) {
        const fx0 = x / N * o.cells, fy0 = y / N * o.cells;
        const ix = Math.floor(fx0), iy = Math.floor(fy0);
        const fx = fx0 - ix, fy = fy0 - iy;
        const dot = (i, j, dx, dy) => {
          const k = (((j % o.cells) + o.cells) % o.cells) * o.cells + (((i % o.cells) + o.cells) % o.cells);
          return o.gx[k] * dx + o.gy[k] * dy;
        };
        const u = fade(fx), v = fade(fy);
        const n00 = dot(ix, iy, fx, fy), n10 = dot(ix + 1, iy, fx - 1, fy);
        const n01 = dot(ix, iy + 1, fx, fy - 1), n11 = dot(ix + 1, iy + 1, fx - 1, fy - 1);
        const val = (n00 + (n10 - n00) * u) * (1 - v) + (n01 + (n11 - n01) * u) * v;
        n += val * 1.414 * o.amp;
      }
      return n;
    };
  }
  // Nền cỏ nhìn từ xa vài chục mét: hạt mịn đẳng hướng ít tương phản, pha xanh <-> khô / lá mục theo mảng nhỏ, lấm tấm
  // đất lộ kẽ cỏ & ngọn cỏ khô. Không vẽ nét cỏ (nét vẽ lặp lại thành "thảm nỉ"); khóm cỏ nổi khối do shader dựng
  function grassGrainTex(base, alt, soil, seed, altAmt = 0.45) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    const img = g.createImageData(N, N), d = img.data;
    const lumN = octaves(rnd, [[4, 0.3], [16, 0.3], [64, 0.25], [256, 0.15]]), hueN = octaves(rnd, [[8, 0.5], [32, 0.35], [128, 0.15]]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const m = Math.max(0, Math.min(1, 0.5 + hueN(x, y) * 1.6)) * altAmt, f = 1 + lumN(x, y) * 0.26 + (rnd() - 0.5) * 0.06;
      const k = (y * N + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[k + ch] = (base[ch] + (alt[ch] - base[ch]) * m) * f;
      d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 3400; i++) { g.fillStyle = rgb(soil, 0.55 + rnd() * 0.3, 0.45 + rnd() * 0.35); g.fillRect(rnd() * N, rnd() * N, 1, 1); }
    for (let i = 0; i < 2200; i++) { g.fillStyle = rgb(alt, 1.05 + rnd() * 0.15, 0.4 + rnd() * 0.3); g.fillRect(rnd() * N, rnd() * N, 1, rnd() < 0.5 ? 1 : 2); }
    return c;
  }
  // Thảm lá cỏ nhìn từ trên xuống (chi tiết gần, ô lặp ~0,5-1,4 m): kẽ đất / gốc cỏ sẫm, lá cỏ chồng nhiều lớp — lớp dưới
  // khuất sáng, lớp trên đón nắng; mật độ lá theo cụm (khóm dày / kẽ thưa) -> mặt đất có cấu trúc lá thật thay vì nhiễu mịn
  // như nỉ. Vẽ thẳng vào bộ đệm điểm ảnh (nhanh hơn ~40 nghìn nét canvas). Shader chỉ dùng tỉ lệ so với màu trung bình
  function turfTex(base, alt, soil, seed) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    const buf = new Float32Array(N * N * 3), dens = octaves(rnd, [[8, 0.6], [32, 0.4]]);
    // (tương phản vừa phải: lá sáng nhất / kẽ đất ~1,6 lần. Trước đây ~3 lần + lá vàng khô -> nhân lên mặt đất thành mạng
    // vân vàng chanh trên nền hốc sẫm như vải rằn ri, nhìn là biết ảnh vẽ)
    for (let i = 0; i < N * N; i++) { const k = 0.58 + rnd() * 0.08; buf[i * 3] = soil[0] * k; buf[i * 3 + 1] = soil[1] * k; buf[i * 3 + 2] = soil[2] * k; }
    const LAYERS = [[0.66, 12000], [0.76, 13000], [0.86, 11000], [0.95, 8000], [1.03, 3500]];
    for (const [bright, n] of LAYERS) {
      for (let b = 0; b < n; b++) {
        const x0 = rnd() * N, y0 = rnd() * N;
        if (rnd() > 0.55 + 0.45 * Math.max(0, Math.min(1, 0.5 + dens(x0, y0) * 1.4))) continue;   // kẽ giữa các khóm thưa lá
        const a = rnd() * 6.2832, L = 4 + rnd() * 8, cv = (rnd() - 0.5) * 0.12;   // lá hơi cong
        const dead = rnd() < 0.05, dry = dead ? 1 : rnd() < 0.1 ? 0.3 + rnd() * 0.35 : rnd() * 0.12;
        const col = dead ? [soil[0] * 1.3, soil[1] * 1.25, soil[2] * 1.15] : [base[0] + (alt[0] - base[0]) * dry, base[1] + (alt[1] - base[1]) * dry, base[2] + (alt[2] - base[2]) * dry];
        const k0 = bright * (0.88 + rnd() * 0.24), w = rnd() < 0.3 ? 1 : 0.6;
        for (let s = 0; s <= L; s++) {
          const t = s / L, k = k0 * (0.85 + 0.25 * t), aa = a + cv * s, px = ((Math.round(x0 + Math.cos(aa) * s) % N) + N) % N, py = ((Math.round(y0 + Math.sin(aa) * s) % N) + N) % N;
          const o = (py * N + px) * 3, al = w * (1 - 0.5 * t);   // lá thon nhọn: ngọn mảnh, phủ mờ hơn gốc
          buf[o] += (col[0] * k - buf[o]) * al; buf[o + 1] += (col[1] * k - buf[o + 1]) * al; buf[o + 2] += (col[2] * k - buf[o + 2]) * al;
        }
      }
    }
    const img = g.createImageData(N, N), d = img.data;
    for (let i = 0; i < N * N; i++) { d[i * 4] = buf[i * 3]; d[i * 4 + 1] = buf[i * 3 + 1]; d[i * 4 + 2] = buf[i * 3 + 2]; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c;
  }
  // màu trung bình của ảnh lớp (shader chia cho nó để lấy tỉ lệ chi tiết). Không đọc mip 1×1 trong shader: texture2D tại toạ
  // độ hằng có đạo hàm 0 -> bias không đẩy lên mip thô, lấy đúng 1 điểm ảnh giữa ảnh (lệch sáng / tối cả bản đồ)
  function meanOf(cv) {
    const d = cv.getContext('2d', RD).getImageData(0, 0, cv.width, cv.height).data, m = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
    const n = d.length / 4 * 255;
    return new THREE.Vector3(m[0] / n, m[1] / n, m[2] / n);
  }
  function concreteTex(base, seed) {
    const c = canvas(), g = c.getContext('2d', RD), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 70, base, 16, 80, 0.25, 0.55, 0.72, 1.2);
    grain(g, rnd, 24, 3);
    // không vẽ khe tấm bê tông thẳng hàng trong ô lặp (in thành lưới đều khắp bản đồ) — vá / nứt / nắp cống do shader rải theo vị trí
    for (let i = 0; i < 30; i++) {
      let x = rnd() * N, y = rnd() * N; g.strokeStyle = rgb(base, 0.45, 0.6); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 28; y += (rnd() - 0.5) * 28; g.lineTo(x, y); } g.stroke();
    }
    blotches(g, rnd, 30, [70, 90, 50], 3, 10, 0.25, 0.5);   // rêu cỏ mọc khe
    return c;
  }

  const BIOMES = {
    HIGHLAND: { base: () => grassTex([86, 94, 58], [138, 126, 82], 11), dirt: () => dirtTex([98, 86, 70], 12), rock: () => rockTex([102, 99, 93], [136, 136, 84], 13), fine: () => fineTex([104, 98, 86], 14, false) },
    RIVER_LAKE: { base: () => grassTex([80, 96, 50], [132, 126, 76], 21), dirt: () => dirtTex([96, 84, 64], 22), rock: () => rockTex([104, 100, 90], [104, 122, 66], 23), fine: () => fineTex([134, 125, 100], 24, true) },
    JUNGLE: { base: () => grassTex([56, 72, 38], [96, 90, 50], 31), dirt: () => dirtTex([84, 70, 52], 32), rock: () => rockTex([100, 96, 84], [80, 110, 60], 33), fine: () => fineTex([82, 72, 50], 34, false) },
    DESERT: { base: () => fineTex([206, 172, 124], 41, true), dirt: () => dirtTex([178, 140, 98], 42), rock: () => rockTex([164, 128, 96], [190, 160, 110], 43), fine: () => grassTex([150, 140, 92], [176, 160, 110], 44) },
    URBAN: { base: () => concreteTex([106, 105, 100], 51), dirt: () => dirtTex([110, 100, 84], 52), rock: () => rockTex([112, 108, 102], [90, 100, 70], 53), fine: () => grassTex([88, 98, 60], [140, 130, 84], 54) }
  };

  function layers(mapType) {
    const key = BIOMES[mapType] ? mapType : 'HIGHLAND';
    if (TEX[key]) return TEX[key];
    const mk = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
    const B = BIOMES[key];
    TEX[key] = { base: mk(B.base()), dirt: mk(B.dirt()), rock: mk(B.rock()), fine: mk(B.fine()) };
    TEX[key].dirtMean = meanOf(TEX[key].dirt.image);
    if (key === 'DESERT') TEX[key].grain = mk(sandGrainTex([206, 172, 124], 45));
    // cỏ: hạt mịn (xanh <-> khô / lá mục); đất: hạt đất mịn — sỏi, cục đất nổi khối do shader dựng
    const GRASS = {
      HIGHLAND: [[84, 92, 58], [136, 124, 82], 0.45],
      RIVER_LAKE: [[80, 90, 54], [128, 122, 78], 0.4],
      JUNGLE: [[58, 68, 40], [92, 76, 50], 0.55]
    }[key];
    const SOIL = { HIGHLAND: [98, 86, 70], RIVER_LAKE: [96, 84, 64], JUNGLE: [76, 63, 47], DESERT: [178, 140, 98], URBAN: [110, 100, 84] }[key];
    if (GRASS) TEX[key].grain = mk(grassGrainTex(GRASS[0], GRASS[1], SOIL, 61, GRASS[2]));
    if (GRASS) { TEX[key].turf = mk(turfTex(GRASS[0], GRASS[1], SOIL, 63)); TEX[key].turfMean = meanOf(TEX[key].turf.image); }
    TEX[key].soil = mk(sandGrainTex(SOIL, 62));
    return TEX[key];
  }

  // Nhiễu tầng lớn lặp liền (R, G, B: 3 kênh nhiễu độc lập) cho mặt nạ trộn lớp & bóng mây
  function noiseTex() {
    if (TEX.noise) return TEX.noise;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', RD), img = g.createImageData(S, S), d = img.data;
    // Nhiễu gradient tuần hoàn (chu kỳ = số ô), 4 tầng — không lộ lưới vuông như nhiễu giá trị
    const perlin = (seed, cells) => {
      const rnd = rngOf(seed), gx = new Float32Array(cells * cells), gy = new Float32Array(cells * cells);
      for (let i = 0; i < gx.length; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
      const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
      return (x, y) => {
        const fx0 = x / S * cells, fy0 = y / S * cells, ix = Math.floor(fx0), iy = Math.floor(fy0), fx = fx0 - ix, fy = fy0 - iy;
        const dot = (i, j, dx, dy) => { const k = (((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells); return gx[k] * dx + gy[k] * dy; };
        const u = fade(fx), v = fade(fy);
        const n00 = dot(ix, iy, fx, fy), n10 = dot(ix + 1, iy, fx - 1, fy), n01 = dot(ix, iy + 1, fx, fy - 1), n11 = dot(ix + 1, iy + 1, fx - 1, fy - 1);
        return (n00 + (n10 - n00) * u) * (1 - v) + (n01 + (n11 - n01) * u) * v;   // ~[-0.7, 0.7]
      };
    };
    const ch = [0, 1, 2].map(c3 => [perlin(11 + c3 * 7, 4), perlin(12 + c3 * 7, 8), perlin(13 + c3 * 7, 16), perlin(14 + c3 * 7, 32)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      for (let c3 = 0; c3 < 3; c3++) {
        const f = ch[c3];
        const n = f[0](x, y) * 0.5 + f[1](x, y) * 0.27 + f[2](x, y) * 0.15 + f[3](x, y) * 0.08;
        d[k + c3] = Math.max(0, Math.min(255, (0.5 + n * 0.95) * 255));
      }
      d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (TEX.noise = t);
  }

  // Màu trung bình của ảnh nền cũ -> dùng để lấy "độ lệch màu" tầng lớn
  function averageColor(cv) {
    if (cv._gAvg) return cv._gAvg.clone();
    // Thu nhỏ trên GPU về 48² (lấy điểm gần nhất = đúng các điểm mẫu cũ) rồi chỉ đọc 48² điểm ảnh: đọc cả ảnh nền 2048²
    // (16 MB) từ canvas GPU chỉ để lấy 2304 điểm tốn ~0,35 s mỗi lần dựng bản đồ (đo 2026-10-28)
    const S = 48, sc = document.createElement('canvas');
    sc.width = sc.height = S;
    const sg = sc.getContext('2d');
    sg.imageSmoothingEnabled = false;
    sg.drawImage(cv, 0, 0, S, S);
    const img = sg.getImageData(0, 0, S, S).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let k = 0; k < S * S * 4; k += 4) { r += img[k]; gg += img[k + 1]; b += img[k + 2]; n++; }
    cv._gAvg = new THREE.Vector3(r / n / 255, gg / n / 255, b / n / 255);
    return cv._gAvg.clone();
  }

  // Mặt nạ khu phố đô thị (1 = trong ô phố, 0 = ngoại ô) theo lưới mặt đất của map (surface 3: sân / vỉa hè trong ô
  // phố), nới + làm mờ ~2 ô lưới cho mép chuyển dần. null nếu map không có lưới mặt đất
  function cityMask(T) {
    const M = T.map;
    if (T._gCity && T._gCity.map === M) return T._gCity.tex;
    if (!M || !M.surface || !M.res) return null;
    const N = M.res + 1;
    let a = new Float32Array(N * N), b = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) a[i] = M.surface[i] === 3 ? 1 : 0;
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const x = i + di, z = j + dj;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          s += a[z * N + x]; n++;
        }
        b[j * N + i] = pass === 0 ? Math.min(1, s / n * 2) : s / n;   // lượt đầu nới mép ra ~1 ô
      }
      [a, b] = [b, a];
    }
    const d = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { const v = Math.round(a[i] * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    T._gCity = { map: M, tex };
    return tex;
  }

  /**
   * Bản đồ pháp tuyến mượt của địa hình (1024², ~3.5 đơn vị/điểm) dựng từ lưới độ cao bằng nội suy bậc ba.
   * Dùng cho ánh sáng & độ dốc thay cho pháp tuyến nội suy theo tam giác (vốn in hình lưới ô vuông lên mặt đất).
   */
  function bakeNormals(T) {
    if (T._gBake && T._gBake.map === T.map) return T._gBake;
    // tính sẵn trong luồng phụ (terrain.js TerrainBake, cùng hàm bakeNormalsData) thì dùng luôn
    const pre = T._gBakeData && T._gBakeData.map === T.map && T._gBakeData.H === T.heightData ? T._gBakeData : null;
    const { data, ny, N } = pre || bakeNormalsData(T.heightData, T.segments, T.width);
    T._gBakeData = null;
    const size = T.width, half = size / 2, px = size / N;
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    // độ dốc (1 - ny) tại điểm thế giới, nội suy song tuyến — dùng cho lớp cỏ / đá 3D cho khớp với shader
    const slopeAt = (x, z) => {
      const fx = Math.max(0, Math.min(N - 1.001, (x + half) / px - 0.5)), fz = Math.max(0, Math.min(N - 1.001, (z + half) / px - 0.5));
      const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = j * N + i;
      return 1 - ((ny[a] * (1 - tx) + ny[a + 1] * tx) * (1 - tz) + (ny[a + N] * (1 - tx) + ny[a + N + 1] * tx) * tz);
    };
    T._gBake = { map: T.map, tex, slopeAt, size, half };
    return T._gBake;
  }
  // Phần tính thuần của bakeNormals: lưới độ cao H ((S+1)² đỉnh, cạnh size) -> ảnh pháp tuyến + độ lõm N² (RGBA) và ny.
  // Hàm tự chứa (chỉ dùng Math) -> terrain.js chép nguyên mã nguồn vào Web Worker
  function bakeNormalsData(H, S, size) {
    const N = Math.min(2048, Math.round(size / 3600 * 4) * 256), NN = S + 1, cell = size / S, px = size / N;
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const hv = (i, j) => H[Math.max(0, Math.min(S, j)) * NN + Math.max(0, Math.min(S, i))];
    const W = N + 2, hb = new Float32Array(W * W);
    // Nội suy bậc ba tách 2 chiều: nội suy theo x cho từng HÀNG LƯỚI một lần (rowX[hàng][cột ảnh]) rồi mỗi điểm ảnh chỉ còn
    // nội suy theo z giữa 4 hàng — cùng phép tính, cùng thứ tự với nội suy 16 điểm trước đây (kết quả y hệt) nhưng ít
    // đọc lưới hơn ~4 lần (bản đồ 16200: 2048² điểm ảnh, trước đây ~1 s riêng bước này)
    const z0 = Math.floor(-0.5 * px / cell) - 1, z1 = Math.floor((N + 0.5) * px / cell) + 2, rowX = new Map();
    const colIx = new Int32Array(W), colFx = new Float64Array(W);
    for (let i = -1; i <= N; i++) { const gx = (i + 0.5) * px / cell, ix = Math.floor(gx); colIx[i + 1] = ix; colFx[i + 1] = gx - ix; }
    for (let r = z0; r <= z1; r++) {
      const R = new Float64Array(W);
      for (let c = 0; c < W; c++) { const ix = colIx[c]; R[c] = cr(hv(ix - 1, r), hv(ix, r), hv(ix + 1, r), hv(ix + 2, r), colFx[c]); }
      rowX.set(r, R);
    }
    for (let j = -1; j <= N; j++) {
      const gz = (j + 0.5) * px / cell, iz = Math.floor(gz), fz = gz - iz;
      const A = rowX.get(iz - 1), B = rowX.get(iz), C = rowX.get(iz + 1), D = rowX.get(iz + 2), o = (j + 1) * W;
      for (let c = 0; c < W; c++) hb[o + c] = cr(A[c], B[c], C[c], D[c], fz);
    }
    const data = new Uint8Array(N * N * 4), ny = new Float32Array(N * N);
    // Độ lõm / lồi của địa hình (kênh alpha): hõm trũng giữ ẩm -> cỏ xanh đậm, tối hơn; gờ lồi khô -> vàng nhạt hơn.
    // Đo ở 2 tầm (~18 m và ~6 m) -> mặt đất có "địa mạo" thật thay vì phủ một màu đều như thảm.
    const hAt = (i, j) => hb[(Math.max(-1, Math.min(N, j)) + 1) * W + Math.max(-1, Math.min(N, i)) + 1];
    const cavOf = (i, j, r) => ((hAt(i - r, j) + hAt(i + r, j) + hAt(i, j - r) + hAt(i, j + r)) * 0.25 - hAt(i, j)) / (r * px);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (hb[(j + 1) * W + i + 2] - hb[(j + 1) * W + i]) / (2 * px), dz = (hb[(j + 2) * W + i + 1] - hb[j * W + i + 1]) / (2 * px);
      const l = Math.hypot(dx, 1, dz), nx = -dx / l, nyy = 1 / l, nz = -dz / l, k = (j * N + i) * 4;
      data[k] = (nx * 0.5 + 0.5) * 255; data[k + 1] = (nyy * 0.5 + 0.5) * 255; data[k + 2] = (nz * 0.5 + 0.5) * 255;
      // điểm ảnh cách mép > 40: đọc thẳng (khỏi kẹp chỉ số) — cùng kết quả với cavOf
      let cav;
      if (i >= 40 && j >= 40 && i < N - 40 && j < N - 40) {
        const o = (j + 1) * W + i + 1, c = hb[o], w40 = 40 * W, w14 = 14 * W;
        cav = ((hb[o - 40] + hb[o + 40] + hb[o - w40] + hb[o + w40]) * 0.25 - c) / (40 * px) * 0.6
          + ((hb[o - 14] + hb[o + 14] + hb[o - w14] + hb[o + w14]) * 0.25 - c) / (14 * px) * 0.4;
      } else cav = cavOf(i, j, 40) * 0.6 + cavOf(i, j, 14) * 0.4;
      data[k + 3] = Math.max(0, Math.min(255, 128 + cav * 420));
      ny[j * N + i] = nyy;
    }
    return { data, ny, N };
  }

  /**
   * Gắn shader lên vật liệu mặt đất (MeshStandardMaterial có map = ảnh màu bản đồ cũ)
   * opts: { mapType, macroCanvas, water, ownNormals }
   * ownNormals: dùng pháp tuyến của chính lưới (công trình đắp đất nằm trên địa hình, vd ụ đất cứ điểm)
   *   thay cho pháp tuyến nướng sẵn của địa hình -> cùng màu / vật liệu với mặt đất nhưng sáng tối theo hình khối riêng
   */
  // CHÂN VÀNH NÚI theo hướng (MapGen outer.rimFoot chỉ phụ thuộc hướng nhìn từ tâm, trừ gợn nhỏ ±18): bảng RIM_N góc,
  // mỗi ô 16 bit (R cao, G thấp) = độ xa chân núi / RIM_SC -> shader nội suy 2 ô (NearestFilter, không lọc lẫn byte)
  const RIM_N = 2048, RIM_MAX = 16000, RIM_SC = (RIM_MAX / 65535).toFixed(8);
  function rimFootTex(T) {
    const O = T.map && T.map.outer;
    if (!O || !O.rimFoot) return null;
    if (T._rimTex && T._rimTex.map === T.map) return T._rimTex.tex;
    const data = new Uint8Array(RIM_N * 4);
    for (let i = 0; i < RIM_N; i++) {
      const a = (i + 0.5) / RIM_N * Math.PI * 2, v = Math.round(Math.max(0, Math.min(65535, O.rimFoot(Math.cos(a) * 6000, Math.sin(a) * 6000) / RIM_MAX * 65535)));
      // B: mức đá của ranh giới theo hướng (MapGen outer.rockTab; 0 = biển cát -> không quạt sỏi / đá núi)
      data[i * 4] = v >> 8; data[i * 4 + 1] = v & 255; data[i * 4 + 2] = Math.round(rimRock(O, a) * 255); data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, RIM_N, 1, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    T._rimTex = { map: T.map, tex };
    return tex;
  }
  // mức đá ranh giới theo góc a (rad), nội suy bảng outer.rockTab; không có bảng = đá mọi hướng
  function rimRock(O, a) {
    const tb = O.rockTab;
    if (!tb || !tb.length) return 1;
    const u = ((a / (Math.PI * 2)) % 1 + 1) % 1 * tb.length, i = Math.floor(u) % tb.length;
    return tb[i] + (tb[(i + 1) % tb.length] - tb[i]) * (u - Math.floor(u));
  }
  // Mặt nạ núi sa mạc (khớp shader, bỏ phần nhiễu mép): { fan: quạt sỏi -> núi, rock: đá lộ } tại (x, z), slope = 1 - ny
  function desertMtn(T, x, z, slope) {
    const O = T.map && T.map.outer;
    if (T.mapType !== 'DESERT' || !O || !O.rimFoot) return { fan: 0, rock: 0 };
    const sR = Math.hypot(x, z) - O.rimFoot(x, z), sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const rk = rimRock(O, Math.atan2(z, x));
    return { fan: sm(-80, 100, sR) * rk, rock: Math.max(sm(120, 360, sR) * sm(0.02, 0.06, slope), sm(380, 650, sR) * 0.9) * rk };
  }

  function apply(mat, opts) {
    const L = layers(opts.mapType);
    const noise = noiseTex();
    const avg = opts.macroCanvas ? averageColor(opts.macroCanvas) : new THREE.Vector3(0.5, 0.5, 0.5);
    mat.extensions = Object.assign({}, mat.extensions || {}, { derivatives: true });
    const desert = opts.mapType === 'DESERT', urban = opts.mapType === 'URBAN';
    const bake = opts.terrain ? bakeNormals(opts.terrain) : null;
    // Hướng gió (vuông góc với đỉnh gợn cát): lấy hướng gió của bản đồ (map.wind) -> gợn cát song song đỉnh đụn cát địa
    // hình; MapGen đặt nắng sa mạc xiên 15-30° so với gió nên gợn luôn có mặt sáng / mặt khuất. Bản đồ cũ không có wind:
    // lệch ~20° so với hướng nắng như trước
    const sunD = opts.terrain && opts.terrain.atmosphere && opts.terrain.atmosphere.sunDir;
    const mapWind = opts.terrain && opts.terrain.map && opts.terrain.map.wind;
    const windA = typeof mapWind === 'number' ? mapWind : sunD ? Math.atan2(sunD.z, sunD.x) + 0.35 : 0.65;
    // Trời mưa (Weather): mặt đất tự lo độ ướt (vũng ở chỗ trũng, thấm sẫm theo loại đất), bỏ lớp ướt chung.
    // G_PUD: lượng vũng; G_WETC: màu sẫm khi thấm nước; G_WETR: độ nhám khi ướt (cát vẫn mờ, bê tông / đất bóng hơn)
    const rain = typeof Weather !== 'undefined' && Weather.glsl;
    if (rain) Weather.markDry(mat);
    // đô thị: mặt nạ khu phố (lưới mặt đất của map: 3 = sân / vỉa hè trong ô phố) -> ngoài thành phố là đất cỏ ngoại ô,
    // không lát bê tông tới tận chân núi
    const city = urban && opts.terrain ? cityMask(opts.terrain) : null;
    // sa mạc: chân vành núi theo hướng (MapGen rimFoot) -> shader biết đâu là quạt sỏi / sườn núi đá
    const rimF = desert && opts.terrain ? rimFootTex(opts.terrain) : null;
    const RW = { DESERT: [0.35, '0.52, 0.5, 0.48', 0.72], URBAN: [0.85, '0.6, 0.6, 0.62', 0.4], JUNGLE: [1.0, '0.66, 0.7, 0.64', 0.5],
      HIGHLAND: [0.7, '0.68, 0.7, 0.68', 0.52], RIVER_LAKE: [0.9, '0.66, 0.69, 0.64', 0.5] }[opts.mapType] || [0.7, '0.68, 0.7, 0.68', 0.52];
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        gBase: { value: L.base }, gDirt: { value: L.dirt }, gRock: { value: L.rock }, gFine: { value: L.fine },
        gNoise: { value: noise }, gMacroAvg: { value: avg }, gTime: uTime, gWaterLvl: { value: opts.waterLvl !== undefined ? opts.waterLvl : opts.water ? 2.5 : -999 },
        gNrm: { value: bake ? bake.tex : null }, gTerr: { value: new THREE.Vector2(bake ? bake.half : 1800, bake ? bake.size : 3600) },
        gGrain: { value: L.grain || null }, gTurf: { value: L.turf || null }, gTurfMean: { value: L.turfMean || new THREE.Vector3(1, 1, 1) }, gDirtMean: { value: L.dirtMean }, gWindA: { value: windA }, gSoil: { value: L.soil || null }, gCity: { value: city },
        gVehA: uVehA, gVehB: uVehB, gVehN: uVehN, gCovMap: uCovMap, gCovXf: uCovXf, gCarpet: uCarpet, gForMap: uForMap, gForXf: uForXf,
        gLodMag: uLodMag, gSunMap: uSunMap, gSunXf: uSunXf, gShBox: uShadowBox
      });
      if (rimF) sh.uniforms.gRimF = { value: rimF };
      // độ che khuất quanh chân nhà (Destructibles.buildingInfo, cùng object -> cập nhật khi dựng nhà xong)
      const BI = typeof Destructibles !== 'undefined' && Destructibles.buildingInfo;
      sh.uniforms.gBldOcc = BI ? BI.uBldOcc : { value: null };
      sh.uniforms.gBldGrid = BI ? BI.uBldGrid : { value: new THREE.Vector4(0, 0, 0, 0) };
      sh.vertexShader = 'varying vec3 vGW;\nvarying vec3 vGN;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vGN = normalize(mat3(modelMatrix) * objectNormal);'
      );
      sh.fragmentShader = `uniform sampler2D gBase, gDirt, gRock, gFine, gNoise, gNrm, gBldOcc, gSunMap;${city ? '\nuniform sampler2D gCity;' : ''}${rimF ? '\nuniform sampler2D gRimF;' : ''}
uniform vec2 gTerr;
uniform float gLodMag;
uniform vec4 gSunXf, gShBox;
// cự ly biểu kiến qua kính ngắm (cự ly thật / độ phóng): cho các chi tiết mờ dần vì nhỏ hơn điểm ảnh. Lớp vẽ THAY cỏ / bụi
// 3D ở xa (gDv, mô đất fH) vẫn theo cự ly thật: soi kính không làm cỏ 3D mọc ra ở đó
#define G_VDIST (length(vViewPosition) / gLodMag)
#define G_PUD ${RW[0].toFixed(3)}
#define G_WETC vec3(${RW[1]})
#define G_WETR ${RW[2].toFixed(3)}
uniform vec4 gBldGrid;
#if __VERSION__ >= 300
#define GTEXG(s, uv, dx, dy) textureGrad(s, uv, dx, dy)
#else
#define GTEXG(s, uv, dx, dy) texture2D(s, uv)
#endif
// Phá lặp texture triệt để: mỗi vùng lấy ảnh với góc xoay và độ lệch ngẫu nhiên riêng (triệt tiêu hoàn toàn sọc lưới và chu kỳ)
vec4 noTile(sampler2D samp, vec2 uv, float seed) {
  float k = texture2D(gNoise, 0.035 * uv + seed).r;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float l = k * 7.0, f = fract(l), ia = floor(l), ib = ia + 1.0;
  float aA = fract(sin(ia * 12.9898 + seed * 7.1) * 43758.5453) * 6.28318;
  float aB = fract(sin(ib * 12.9898 + seed * 7.1) * 43758.5453) * 6.28318;
  mat2 rA = mat2(cos(aA), -sin(aA), sin(aA), cos(aA));
  mat2 rB = mat2(cos(aB), -sin(aB), sin(aB), cos(aB));
  vec2 offa = sin(vec2(3.1, 7.3) * ia + seed * 11.0);
  vec2 offb = sin(vec2(3.1, 7.3) * ib + seed * 11.0);
  vec4 ca = GTEXG(samp, rA * uv + offa, rA * dx, rA * dy);
  vec4 cb = GTEXG(samp, rB * uv + offb, rB * dx, rB * dy);
  float dd = dot(ca.rgb - cb.rgb, vec3(1.0));
  return mix(ca, cb, smoothstep(0.25, 0.75, f - 0.08 * dd));
}
// loang lổ mô đất cỡ vừa (dùng cả cho màu lẫn độ lồi lõm)
float gMotF(vec2 p) {
  vec2 a = mat2(0.94, 0.342, -0.342, 0.94) * p, b = mat2(0.866, -0.5, 0.5, 0.866) * p;
  return noTile(gNoise, a / 26.0 + 0.13, 0.31).g * 0.6 + noTile(gNoise, b / 9.0 + 0.71, 0.77).r * 0.4;
}
// Nhiễu loang KHÔNG LẶP cho mảng màu tầng lớn: gNoise là ảnh 256 px tuần hoàn (tầng thô nhất chỉ 4 ô) -> lấy 1 mẫu ở tỉ
// lệ s thì cứ mỗi s đơn vị lặp y hệt: đồng cỏ thành bàn cờ đốm vàng / xanh to đều tăm tắp, đều như in. Cộng 3 mẫu lệch tỉ
// lệ (1 : 1,618 : 2,618 — không bội số nhau) + xoay khác góc: mảng to nhỏ không đều, chu kỳ chung không bao giờ trùng lại.
// Thu tổng về độ tương phản như 1 mẫu (3 mẫu độc lập trọng số 0,45 / 0,33 / 0,22 -> độ lệch còn ~0,6)
// bias: lấy ở mức mip thô hơn -> bỏ các tầng chi tiết mịn của ảnh nhiễu (mảng màu lớn mà qua ngưỡng smoothstep hẹp thì
// tầng mịn ~1/32 chu kỳ thành viền lấm tấm đều khắp nơi — chính cái "hoa văn lặp" nhìn từ trên cao)
vec3 gNMb(vec2 p, float s, float o, float bias) {
  vec3 a = texture2D(gNoise, p / s + o, bias).rgb;
  vec3 b = texture2D(gNoise, mat2(0.8, -0.6, 0.6, 0.8) * p / (s * 1.618) + o + 0.37, bias).rgb;
  vec3 c = texture2D(gNoise, mat2(-0.28, -0.96, 0.96, -0.28) * p / (s * 2.618) + o + 0.71, bias).rgb;
  return clamp((a * 0.45 + b * 0.33 + c * 0.22 - 0.5) * 1.6 + 0.5, 0.0, 1.0);
}
vec3 gNM(vec2 p, float s, float o) { return gNMb(p, s, o, 0.0); }
// Địa tầng vách đá tự nhiên (strata) và rãnh xói mòn (gullies) cho sườn núi
float gCliffStrata(vec3 pos) {
  float stWarp = (texture2D(gNoise, pos.xz * 0.00045 + 0.17).r - 0.5) * 32.0;
  float stH = pos.y + stWarp;
  float stL = sin(stH * 0.08) * 0.5 + 0.5;
  float stM = sin(stH * 0.26 + sin(stH * 0.13) * 1.5) * 0.5 + 0.5;
  return mix(0.9, 1.1, stL * 0.65 + stM * 0.35);   // (địa tầng nhẹ: tương phản mạnh thành sọc chéo như tấm ảnh dán)
}
float gCliffGully(vec3 pos, vec3 norm) {
  vec2 gP = vec2(dot(pos.xz, vec2(-norm.z, norm.x)) * 0.016, pos.y * 0.005);
  return smoothstep(0.38, 0.72, texture2D(gNoise, gP + 0.38).g);
}
uniform vec3 gMacroAvg;
uniform float gTime, gWaterLvl;
uniform vec4 gVehA[${VEH_N}]; uniform vec4 gVehB[${VEH_N}]; uniform int gVehN;
// ánh trời bị thân xe che: tối hẳn dưới gầm, nhạt dần ra ~1 m quanh thân (khoảng cách tới hình chữ nhật thân xe)
float gVehAO(vec2 p) {
  float ao = 1.0;
  for (int i = 0; i < ${VEH_N}; i++) {
    if (i >= gVehN) break;
    vec4 A = gVehA[i], B = gVehB[i];
    vec2 d = p - A.xy;
    vec2 q = abs(vec2(dot(d, A.zw), dot(d, vec2(-A.w, A.z)))) - B.xy;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    ao *= 1.0 - 0.72 * (1.0 - smoothstep(-B.z, B.w, sd));
  }
  return ao;
}
uniform sampler2D gCovMap, gForMap; uniform vec4 gCovXf, gCarpet, gForXf;
float gCovOcc(vec2 p) {
  if (gCovXf.w <= 0.0) return 0.0;
  vec2 uv = (p - gCovXf.xy) * gCovXf.z + 0.5;
  return texture2D(gCovMap, uv).r * gCovXf.w;
}
varying vec3 vGW;
varying vec3 vGN;
vec3 g2(sampler2D t, vec2 p, float s) {
  // 2 tỉ lệ + lệch hướng: phá vỡ ô lặp
  vec3 a = noTile(t, p / s, 0.0).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
  vec3 b = noTile(t, q / (s * 3.7) + 0.37, 0.53).rgb;
  return mix(a, b, 0.38) * vec3(1.0);
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
uniform sampler2D gSoil;
vec2 gHs2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// Ụ nổi khối tự nhiên (khóm cỏ, sỏi, cục đất): xoay trục lệch và uốn cong miền tọa độ để triệt tiêu sọc lưới ô vuông
float gBumps(vec2 p, float cell, float dens) {
  vec2 pRot = mat2(0.832, -0.555, 0.555, 0.832) * p;
  vec2 warp = (texture2D(gNoise, pRot / 14.0 + 0.17).rg - 0.5) * 1.6;
  vec2 q = (pRot + warp) / cell, b = floor(q), f = fract(q);
  float h = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)), r = gHs2(b + o);
    if (fract(r.x * 13.7 + r.y * 3.1) > dens) continue;
    vec2 d = o + 0.15 + r * 0.7 - f;
    float rad = 0.6 + 0.42 * fract(r.x * 7.13);
    float distSq = dot(d, d);
    float k = max(0.0, 1.0 - distSq / (rad * rad));
    h = max(h, k * k * (0.55 + 0.45 * r.y));
  }
  return h * (1.0 - smoothstep(0.1, 0.25, max(fwidth(q.x), fwidth(q.y))));
}
// LÙM BỤI / CÂY NHỎ trên đồi xa (chỉ shader, không thêm hình học): đồi cỏ thật lốm đốm bụi rậm, lùm cây -> mặt đồi sần sùi
// thay vì nhẵn như nỉ. Mật độ theo mảng lớn (bãi bụi / trảng trống), dày lên trên sườn dốc
// 2 cỡ lùm chồng nhau (bụi nhỏ ô 4,5 m + lùm to ô 11 m, lệch pha) -> cỡ & dáng lùm không đều như con dấu
float gBushH(vec2 p, float k) {
  return max(gBumps(p, 11.0, k * 0.55), gBumps(p * 1.03 + 31.7, 4.5, k) * 0.6);
}
float gBushD(vec2 p, float slope) {
  float m = texture2D(gNoise, p / 700.0 + vec2(0.13, 0.71)).g * 0.65 + texture2D(gNoise, p / 190.0 + 0.4).r * 0.35;
  return smoothstep(0.42, 0.75, m + slope * 0.6) * 0.85;
}
${desert ? `// ---- CÁT SA MẠC: nền gần như một màu (hạt mịn, đổi sắc nhẹ theo mảng lớn); cái mắt thấy là ÁNH SÁNG trên gợn cát
uniform sampler2D gGrain;
// NỔI KHỐI ĐÁ NÚI (vành núi sa mạc, nhỏ hơn ô lưới địa hình 84): mỏm / gờ đá gãy khúc 3 cỡ, toạ độ uốn méo, mỗi cỡ xoay
// một góc. (Không dùng rãnh kéo dài theo hướng dốc: một tỉ lệ đều -> nhìn xa thành vạch song song như răng lược.)
// Trả độ cao (đv); tầng nhỏ hơn điểm ảnh tắt dần (fw: cỡ điểm ảnh trên mặt đất)
float gMtnB(vec2 p, float fw) {
  vec2 w = p + (vec2(texture2D(gNoise, p / 610.0 + 0.19).r, texture2D(gNoise, p / 610.0 + 0.63).g) - 0.5) * 140.0;
  float c0 = abs(texture2D(gNoise, mat2(0.8, -0.6, 0.6, 0.8) * w / 230.0 + 0.41).g - 0.5);
  float c1 = abs(texture2D(gNoise, mat2(0.28, 0.96, -0.96, 0.28) * w / 83.0 + 0.11).b - 0.5);
  float c2 = abs(texture2D(gNoise, w / 29.0 + 0.83).r - 0.5);
  return -c0 * 16.0 - c1 * 8.0 * (1.0 - smoothstep(6.0, 16.0, fw)) - c2 * 4.0 * (1.0 - smoothstep(2.0, 6.0, fw));
}
uniform float gWindA;
// Pha gợn cát: một hướng gió chính, đỉnh gợn gần song song, chỉ uốn nhẹ. Méo miền phải êm (độ dốc của độ lệch << 1),
// nếu không đỉnh gợn gập ngược thành vòng khép kín như vân tay / vân gỗ. Nhiễu lấy ở mip thô (bias) để bỏ tầng tần số cao.
// Độ cao mặt đất quanh điểm đang tô (đặt trong main): gợn cát uốn theo sườn đụn — đỉnh gợn xoay dần theo đường đồng mức
vec2 gRipP0, gRipHG; float gRipH0;
// Nhiễu KHÔNG LẶP cho gợn cát: một ảnh nhiễu tuần hoàn lấy ở một tỉ lệ thì cứ mỗi chu kỳ (vài chục mét) lặp lại y hệt
// -> mắt bắt được "khuôn". Cộng hai lần lấy mẫu lệch tỉ lệ theo tỉ lệ vàng & xoay ~37°: hai chu kỳ không bao giờ trùng lại
const mat2 gRotA = mat2(0.8, -0.6, 0.6, 0.8);
vec3 gN2(vec2 p, float s, float o, float bias) {
  vec3 a = texture2D(gNoise, p / s + o, bias).rgb;
  vec3 b = texture2D(gNoise, gRotA * p / (s * 1.618) + o + 0.37, bias).rgb;
  return clamp((a + b - 1.0) * 0.72 + 0.5, 0.0, 1.0);   // tổng 2 mẫu độc lập: thu lại để độ tương phản như 1 mẫu
}
float gRipPh(vec2 p) {
  vec2 d = vec2(cos(gWindA), sin(gWindA));
  vec2 w1 = texture2D(gNoise, p / 1200.0 + 0.11, 2.0).rg - 0.5;     // hướng gió đổi chậm theo vùng (~±6°)
  vec3 w2 = gN2(p, 260.0, 0.57, 2.0) - 0.5;                          // đỉnh gợn lượn nhẹ + bước gợn dãn / nén ~10%
  // đỉnh gợn uốn khúc ngắn (mỗi vài mét một khúc lượn, lệch ~±0,5 đv) như gợn cát thật, không thẳng như kẻ chỉ;
  // độ dốc của độ lệch vẫn << 1 nên đỉnh gợn không gập thành vòng
  vec2 w3 = gN2(p, 60.0, 0.13, 1.0).rg - 0.5;
  vec2 q = p + w1 * 16.0 + w2.rg * 5.0 + w3 * 1.1;
  float hgt = gRipH0 + dot(p - gRipP0, gRipHG);
  // bước gợn ~2 đơn vị (~25 cm, như gợn cát gió thật); độ cao địa hình lệch pha -> gợn bẻ theo sườn đụn (độ dốc pha luôn > 0, không gập)
  return dot(q, d) / 2.0 + w2.b * 1.8 + hgt * 0.3;
}
// hệ gợn thứ 2 (đợt gió khác, lệch ~30°, bước dài hơn ~35%) — mỗi vùng cát mang một hệ gợn riêng, không phủ một kiểu khắp bản đồ
float gRipPh2(vec2 p) {
  vec2 d = vec2(cos(gWindA + 0.52), sin(gWindA + 0.52));
  vec3 w2 = gN2(p, 230.0, 0.29, 2.0) - 0.5;
  vec2 q = p + w2.rg * 5.0 + (gN2(p, 70.0, 0.47, 1.0).rg - 0.5) * 1.2;
  return dot(q, d) / 2.7 + w2.b * 1.6 + (gRipH0 + dot(p - gRipP0, gRipHG)) * 0.3;
}
// gợn đứt đoạn / rẽ nhánh chữ Y dày (mỗi 1-3 m): dọc đường lệch, đỉnh gợn chuyển sang hàng lệch nửa bước; đỉnh cao thấp dọc chiều dài
float gRipAsym(float t) { return smoothstep(0.0, 0.72, t) * (1.0 - smoothstep(0.72, 1.0, t)); }
float gRipY(vec3 jm, float ph) {
  float y = mix(gRipAsym(fract(ph)), gRipAsym(fract(ph + 0.5)), smoothstep(0.46, 0.54, jm.r));
  return y * (0.35 + 0.65 * smoothstep(0.28, 0.62, jm.g)) * (0.7 + 0.3 * jm.b);
}
// một hệ gợn: gần = sóng bất đối xứng có chữ Y; xa dần = sóng sin mượt rồi tắt sớm (gợn < ~16 điểm ảnh thì không còn vẽ),
// ở tầm camera trận mặt cát xa trông mịn như thật thay vì phủ sọc li ti đều tăm tắp.
// Bản sóng sin ở xa GIỮ NGUYÊN các chỗ gợn đứt / rẽ chữ Y (hai sóng lệch nửa bước hoà vào nhau -> đỉnh gợn tắt rồi nối
// sang hàng bên cạnh) và độ cao đỉnh gợn thay đổi dọc chiều dài — trước đây bản xa là sóng sin đều tuyệt đối, nên ở tầm
// nhìn thường (gợn 15-50 điểm ảnh) sườn cát thành những sọc song song đều như kẻ chỉ
float gRipOne(vec3 jm, float ph) {
  float fw = fwidth(ph);
  float sw = smoothstep(0.46, 0.54, jm.r);
  float sn = mix(0.5 - 0.5 * cos(6.2832 * ph), 0.5 + 0.5 * cos(6.2832 * ph), sw);
  float amp = (0.5 + 0.5 * smoothstep(0.28, 0.62, jm.g)) * (0.8 + 0.2 * jm.b) * (1.0 - 0.8 * sw * (1.0 - sw) * 4.0);
  return mix(gRipY(jm, ph), sn * amp, smoothstep(0.02, 0.06, fw)) * (1.0 - smoothstep(0.05, 0.11, fw));
}
// Độ cao gợn 0..1: sườn đón gió thoải (70%), sườn khuất gió dốc (30%); có vạt cát phẳng không gợn; mờ dần khi
// một gợn nhỏ hơn ~3-5 điểm ảnh (ở xa) để không sinh vân nhiễu / răng cưa
float gRip(vec2 p) {
  vec3 jm = gN2(p, 46.0, 0.37, 0.5);
  vec3 zn = gN2(p, 380.0, 0.83, 1.0);
  // vùng hệ gợn 1 / hệ gợn 2 (ranh giới uốn lượn vài chục mét)
  float reg = smoothstep(0.42, 0.58, zn.b);
  float h = mix(gRipOne(jm, gRipPh(p)), gRipOne(jm.gbr, gRipPh2(p)), reg);
  // vạt cát phẳng (cát nén / vừa bị gió san) xen vạt gợn rõ, 2 tầng cỡ -> mỗi chỗ một khác
  float field = smoothstep(0.36, 0.6, zn.g * 0.65 + gN2(p, 95.0, 0.21, 1.0).r * 0.35);
  return h * (0.25 + 0.75 * field);
}
` : ''}${urban ? `// ---- NỀN PHỐ: lát ngẫu nhiên theo ô (mỗi ô ~23 m lấy một mảnh ảnh lệch + xoay bất kỳ, biên ô uốn lượn, giữ độ tương phản)
vec2 gH2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec3 gStoch(sampler2D t, vec2 wp, float cellM, float texM) {
  vec2 p = wp / cellM + (texture2D(gNoise, wp / 610.0 + 0.19).rg - 0.5) * 0.9;
  vec2 b = floor(p - 0.5), f = fract(p - 0.5);
  vec2 w = smoothstep(0.22, 0.78, f);
  vec2 uv = wp / texM, dx = dFdx(uv), dy = dFdy(uv);
  vec3 mean = texture2D(t, vec2(0.5), 12.0).rgb, acc = vec3(0.0); float ws = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 c = b + vec2(float(i), float(j)), h = gH2(c);
    float a = h.x * 6.2832, cs = cos(a), sn = sin(a);
    mat2 R = mat2(cs, -sn, sn, cs);
    float wi = (i == 0 ? 1.0 - w.x : w.x) * (j == 0 ? 1.0 - w.y : w.y);
    acc += (GTEXG(t, R * uv + h * 7.31, R * dx, R * dy).rgb - mean) * wi; ws += wi * wi;
  }
  return mean + acc / sqrt(max(ws, 1e-3));
}
// vá nhựa / vết dầu / nắp cống: rải theo lưới ô có hash (mỗi ô một vị trí, cỡ, góc riêng; phần lớn ô bỏ trống)
float gBoxM(vec2 q, vec2 hs, float aa) { vec2 d = abs(q) - hs; return 1.0 - smoothstep(-aa, aa, max(d.x, d.y)); }
vec3 gUrbanDetail(vec2 wp, vec3 col) {
  float aa = max(fwidth(wp.x), 0.02) * 1.2;
  // mảng vá nhựa chữ nhật (2 lưới khác cỡ, lệch nhau)
  for (int k = 0; k < 2; k++) {
    float S = k == 0 ? 17.0 : 29.0;
    vec2 q0 = wp + (k == 0 ? vec2(3.1, 7.7) : vec2(-11.3, 5.2));
    vec2 id = floor(q0 / S), h = gH2(id + float(k) * 17.0), h2 = gH2(id + 41.7 + float(k));
    if (h.x < (k == 0 ? 0.16 : 0.2)) {
      float a = (h2.x - 0.5) * 0.5 + (h.y < 0.5 ? 0.0 : 1.5708), cs = cos(a), sn = sin(a);
      vec2 q = mat2(cs, -sn, sn, cs) * (q0 - (id + 0.3 + h2 * 0.4) * S);
      vec2 hs = vec2(1.6, 0.9) + h2.yx * vec2(k == 0 ? 4.5 : 8.0, k == 0 ? 1.6 : 2.6);
      float m = gBoxM(q, hs, aa), e = gBoxM(q, hs + 0.12, aa) - m;
      float fresh = h.y;                                  // vá mới: sẫm, mịn; vá cũ: gần màu nền
      col = mix(col, col * mix(0.93, 0.76, fresh) * vec3(0.98, 0.99, 1.02), m);
      col *= 1.0 - e * 0.25;                              // mạch nhựa đường quanh mép vá
    }
  }
  // vết dầu / vệt bẩn loang
  {
    vec2 id = floor(wp / 11.0), h = gH2(id + 7.3);
    float n = texture2D(gNoise, wp / 7.0).r;
    if (h.x < 0.22) {
      vec2 d = wp - (id + 0.2 + gH2(id + 3.1) * 0.6) * 11.0;
      float r = 0.7 + h.y * 1.8;
      float m = 1.0 - smoothstep(r * 0.4, r * (1.1 + n * 0.6), length(d * vec2(1.0, 0.7 + h.y * 0.6)));
      col *= 1.0 - m * 0.32;
    }
  }
  // nắp cống / hố ga gang tròn (Ø ~1 m) có viền bê tông
  {
    vec2 id = floor(wp / 37.0), h = gH2(id + 91.1);
    if (h.x < 0.3) {
      float d = length(wp - (id + 0.25 + gH2(id + 5.9) * 0.5) * 37.0);
      float lid = 1.0 - smoothstep(0.5 - aa, 0.5 + aa, d), ring = (1.0 - smoothstep(0.75 - aa, 0.75 + aa, d)) - lid;
      col = mix(col, vec3(0.2, 0.2, 0.21) * (0.9 + 0.2 * fract(d * 9.0)), lid);
      col = mix(col, col * 1.12, ring);
    }
  }
  return col;
}
` : ''}${desert || urban ? '' : `uniform sampler2D gGrain, gTurf;
uniform vec3 gTurfMean, gDirtMean;
// Mặt thảm cỏ: ụ khóm cỏ uốn lượn tự nhiên + gợn lăn tăn xoay góc lệch, không còn sọc song song
float gTuftH(vec2 p) {
  vec2 pW = p + (texture2D(gNoise, p / 17.0 + 0.35).rg - 0.5) * 1.5;
  float b = gBumps(pW, 2.3, 0.72) * (0.55 + 0.75 * texture2D(gNoise, pW / 3.9 + 0.5).r);
  vec2 pFine = mat2(0.707, -0.707, 0.707, 0.707) * pW;
  float fine = (texture2D(gNoise, pFine / 2.3 + 0.2).g - 0.5) * 0.32;
  return b + fine;
}
`}` + sh.fragmentShader
        .replace('#include <map_fragment>', `
  vec2 wp = vGW.xz;
  // pháp tuyến mượt nướng sẵn (không theo tam giác lưới địa hình)
  vec4 nTex = texture2D(gNrm, (vGW.xz + gTerr.x) / gTerr.y);
  vec3 nrm = ${opts.ownNormals ? 'normalize(vGN)' : 'normalize(nTex.xyz * 2.0 - 1.0)'};
  // độ lõm (+) / lồi (-) của địa hình
  // ngoài mép bản đồ (cảnh nền Backdrop) không còn ảnh nướng sẵn: độ lõm / sắc tầng lớn trung tính dần
  float gInMap = 1.0 - smoothstep(gTerr.x, gTerr.x + 260.0, max(abs(vGW.x), abs(vGW.z)));
  // lưới có pháp tuyến riêng (khối đắp đất / nắp đất phủ chỗ lưới địa hình bị hạ): độ lõm nướng từ lưới địa hình bên
  // dưới không phải của mặt này (chỗ hạ nền thành hõm ướt, mép chỗ hạ thành gờ khô vàng — sai màu) -> trung tính
  float cav = ${opts.ownNormals ? '0.0' : '(nTex.a * 2.0 - 1.0) * gInMap'};
  float gWet = smoothstep(0.0, 0.45, cav), gDryR = smoothstep(0.0, 0.45, -cav);
  float slope = 1.0 - clamp(nrm.y, 0.0, 1.0);
  vec2 wr1 = mat2(0.866, -0.5, 0.5, 0.866) * wp, wr2 = mat2(0.423, -0.906, 0.906, 0.423) * wp, wr3 = mat2(0.94, 0.342, -0.342, 0.94) * wp;
  vec3 nz = gNM(wr1, 1100.0, 0.0);
  vec3 nz2 = gNM(wr2, 260.0, 0.5);
  // đất: hạt đất mịn ít tương phản 2 tỉ lệ (cục đất / sỏi nổi khối dựng ở pháp tuyến, không vẽ sẵn sáng tối)
  vec3 soMean = texture2D(gSoil, vec2(0.5), 12.0).rgb;
  vec3 cSoil = soMean + (noTile(gSoil, wr1 / 8.0, 0.29).rgb - soMean) + (noTile(gSoil, wr2 / 35.0 + 0.4, 0.71).rgb - soMean) * 0.6;
  cSoil *= 0.94 + 0.12 * gNM(wr3, 60.0, 0.15).g;
  ${desert || urban ? '' : `// đất trơ đồng cỏ: cục đất, sỏi, vụn lá (lớp gDirt) theo tỉ lệ so với màu trung bình -> không còn mảng nâu phẳng nhoè
  {
    vec3 dD = (noTile(gDirt, wr3 / 22.0, 0.57).rgb * 0.65 + noTile(gDirt, wr2 / 51.0 + 0.3, 0.19).rgb * 0.35) / max(gDirtMean, vec3(0.02));
    cSoil *= mix(vec3(1.0), clamp(1.0 + (dD - 1.0) * 1.2, 0.1, 2.5), 0.85);
  }`}
  float gTuft0 = 0.0, wBare = 0.0, gBush0 = 0.0, gBushK = 0.0;
  vec3 gTurfD = vec3(1.0);
  ${urban ? `// nền phố: lát ngẫu nhiên 2 tỉ lệ (ô 23 m / 140 m, góc khác nhau) -> không còn khuôn 46 m in đi in lại
  vec3 cBase = mix(gStoch(gBase, wp, 23.0, 46.0), gStoch(gBase, mat2(0.8, -0.6, 0.6, 0.8) * wp + 517.0, 140.0, 170.0), 0.34);
  // ngoài khu phố (cùng mặt nạ gCity như lớp cỏ ngoại ô bên dưới): nền là đất, không có vết nứt / vá nhựa / vết dầu / nắp
  // cống của mặt đường — trước đây cỏ chỉ nhuộm màu lên trên nên bãi cỏ ngoại ô còn hằn vệt nứt nhựa và ô vá chữ nhật sẫm
  float gOutE = ${city ? '1.0 - smoothstep(0.25, 0.75, texture2D(gCity, (vGW.xz + gTerr.x) / gTerr.y).r + (texture2D(gNoise, wp / 300.0 + 0.4).r - 0.5) * 0.35)' : '0.0'};
  {
    // mảng nhựa sẫm / bê tông bạc màu cỡ 60-200 m + độ mòn tầng vừa (không đều như sơn một lớp)
    vec3 uz = gNM(wr3, 520.0, 0.61);
    float asph = smoothstep(0.36, 0.66, uz.r * 0.7 + nz2.g * 0.3);
    cBase *= mix(vec3(1.1, 1.09, 1.07), vec3(0.83, 0.84, 0.86), asph);
    cBase *= 0.9 + 0.2 * smoothstep(0.25, 0.75, uz.b);
    // vết nứt ngoằn ngoèo theo đường đồng mức của nhiễu (không theo lưới), chỉ ở vùng mặt đường cũ
    float cn = gNM(wr2, 95.0, 0.33).g;
    float crk = 1.0 - smoothstep(0.0, fwidth(cn) * 1.3 + 0.0015, abs(cn - 0.5));
    cBase *= 1.0 - crk * 0.4 * smoothstep(0.45, 0.7, uz.g) * (1.0 - gOutE);
    // Mặt đất đô thị chiến trường: đất cày xới, mảng bụi đất loang tự nhiên (không kẻ ô vuông lặp lại)
    {
      vec3 mudN = gNM(wr2, 70.0, 0.41);
      float mud = smoothstep(0.35, 0.72, mudN.r * 0.6 + mudN.g * 0.4);
      cBase = mix(cBase, cSoil * 0.92, mud * 0.55);
    }
    if (gOutE < 0.995) cBase = mix(gUrbanDetail(wp, cBase), cBase, gOutE);
    cBase = mix(cBase, cSoil * 0.9, gOutE * 0.8);   // ngoại ô: đất (cỏ dại phủ lên ở dưới), không còn khuôn tấm lát
  }` : desert ? `// cát: màu trung bình + hạt mịn 2 tỉ lệ (độ tương phản thấp), sắc cát đổi rất nhẹ theo mảng trăm mét
  vec3 sMean = texture2D(gGrain, vec2(0.5), 12.0).rgb;
  vec3 cBase = sMean + (noTile(gGrain, wr1 / 7.0, 0.41).rgb - sMean) + (noTile(gGrain, wr2 / 37.0 + 0.2, 0.63).rgb - sMean) * 0.5;
  cBase *= mix(vec3(1.035, 1.0, 0.95), vec3(0.965, 0.985, 1.03), smoothstep(0.3, 0.7, texture2D(gNoise, wr3 / 900.0 + 0.4).r));
  cBase *= 0.94 + 0.12 * texture2D(gNoise, wr1 / 170.0 + 0.2).g;   // mảng cát sáng (mới bồi) / sẫm (hạt thô đọng) vài chục mét
  // gợn cát: đỉnh gợn hạt thô sáng hơn chút, rãnh gợn đọng hạt mịn sẫm hơn (phần chính là bóng / nắng ở pháp tuyến)
  gRipP0 = wp; gRipH0 = vGW.y; gRipHG = -nrm.xz / max(nrm.y, 0.35);
  float gRip0 = gRip(wp);
  cBase *= 0.98 + 0.045 * gRip0;
  {
    // vệt cát dài xuôi gió (cát bay đọng thành dải sáng / sẫm dài vài chục mét) — chi tiết còn đọc được khi gợn đã mờ ở xa
    vec2 dW = vec2(cos(gWindA), sin(gWindA));
    float st = texture2D(gNoise, vec2(dot(wp, dW) / 700.0, dot(wp, vec2(-dW.y, dW.x)) / 60.0) + 0.71).b;
    cBase *= 0.95 + 0.1 * smoothstep(0.3, 0.7, st);
  }` : `// cỏ: hạt mịn ít tương phản 2 tỉ lệ; khóm cỏ nổi khối (kẽ khóm lộ đất sẫm); vạt đất trụi nhỏ lấm tấm
  vec3 gMean = texture2D(gGrain, vec2(0.5), 12.0).rgb;
  vec3 cBase = gMean + (noTile(gGrain, wr1 / 9.0, 0.41).rgb - gMean) + (noTile(gGrain, wr2 / 43.0 + 0.2, 0.63).rgb - gMean) * 0.6;
  gTuft0 = gTuftH(wp);
  cBase = mix(cSoil * ${opts.mapType === 'JUNGLE' ? '0.8' : '0.9'}, cBase, 0.86 + 0.14 * smoothstep(-0.1, 0.35, gTuft0));
  cBase *= 1.0 + 0.05 * clamp(gTuft0, 0.0, 1.0) * vec3(1.0, 1.0, 0.85);
  wBare = smoothstep(0.6, 0.8, gNM(wr1, 13.0, 0.37).r * 0.65 + texture2D(gNoise, wr2 / 4.5 + 0.1).g * 0.35) * ${opts.mapType === 'JUNGLE' ? '0.85' : '0.5'};
  cBase = mix(cBase, cSoil, wBare);
  // THẢM LÁ CỎ: lá cỏ chồng lớp & kẽ gốc sẫm (2 tỉ lệ, xoay lệch, phá lặp); tỉ lệ so với màu trung bình nên giữ nguyên mọi
  // mảng màu tầng lớn bên dưới, ở xa mip tự trung bình hoá về 1 (không nhấp nháy)
  {
    vec3 tD = (noTile(gTurf, wr3 / 38.0, 0.17).rgb * 0.62 + noTile(gTurf, wr1 / 71.0 + 0.3, 0.83).rgb * 0.38) / max(gTurfMean, vec3(0.02));
    // chủ yếu lấy sáng / tối (bóng giữa các lá), sắc lá chỉ pha nhẹ: tỉ lệ màu đủ 3 kênh nhuộm lá vàng chanh / kẽ tím nâu
    // lên mọi mảng màu tầng lớn -> đồng cỏ loang hoa văn
    tD = mix(vec3(lum(tD)), tD, 0.35);
    // ngoài vùng cỏ 3D (xa ~250+): vân thảm lá cùng một cỡ đốm (~38 đv) lát kín cả cánh đồng -> nhìn từ trên cao / ống
    // kính dài thành hoa văn lặp đều như vải. Ở xa nhạt dần, để các mảng màu tầng lớn (khô / tươi, đất trống) dẫn dắt
    float tK = 1.3 * mix(1.0, 0.3, smoothstep(220.0, 800.0, G_VDIST));
    gTurfD = clamp(1.0 + (tD - 1.0) * tK, 0.35, 1.8);
    cBase *= mix(vec3(1.0), gTurfD, 1.0 - 0.75 * wBare);
  }`}
  ${desert || urban ? '' : `// cỏ khô / cỏ xanh xen kẽ theo mảng lớn (đồng cỏ thật không đều màu)
  // vùng khô / tươi do tầng lớn (~1 km, gNM 1100) quyết định -> mảng to nhỏ không đều; tầng ~260 chỉ làm mép vùng lượn
  // khúc khuỷu + vài đốm lẻ. Trước đây tầng 260 chiếm 60%: đốm vàng cùng một cỡ rải đều khắp đồng như hoa văn in lặp
  float dryM = smoothstep(0.4, 0.76, nz.g * 0.68 + gNMb(wr2, 260.0, 0.5, 2.0).b * 0.32);
  cBase *= mix(vec3(1.0), vec3(1.12, 1.03, 0.8), dryM * 0.7);`}
  vec3 cDirt = cSoil;
  float gPeb0 = gBumps(wp, 1.3, 0.45);   // sỏi / cục đất trên lớp đất
  vec3 cFine = g2(gFine, wr2, 34.0);
  // đá: chiếu 3 phía theo pháp tuyến (vách dốc không bị kéo giãn)
  vec3 bw = pow(abs(nrm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec3 cRock = noTile(gRock, vGW.zy / 48.0, 0.21).rgb * bw.x + g2(gRock, wr1, 48.0) * bw.y + noTile(gRock, vGW.xy / 48.0, 0.67).rgb * bw.z;
  float gRockL = lum(cRock);   // vân đá gốc (trước địa tầng / sắc núi bàn)
  // Địa tầng vách đá tự nhiên & rãnh xói mòn sườn núi:
  float cStrata = ${opts.mapType === 'HIGHLAND' || desert ? 'gCliffStrata(vGW)' : '1.0'};   // (khí hậu ẩm: không vân địa tầng theo độ cao)
  float cGully = gCliffGully(vGW, nrm);
  cRock *= cStrata;
  cRock = mix(cRock, cRock * vec3(0.78, 0.76, 0.76), cGully * 0.3);
  ${opts.mapType === 'RIVER_LAKE' || opts.mapType === 'JUNGLE' || opts.mapType === 'URBAN' ? `// khí hậu ẩm: vách đá loang rêu / cỏ bám (không thành tấm đá xám trọc dán lên đồi cỏ)
  cRock = mix(cRock * vec3(0.78, 0.74, 0.68), cBase * 0.62, 0.5 * smoothstep(0.3, 0.7, texture2D(gNoise, wr1 / 70.0 + 0.3).g));` : ''}
  float cMacroCliff = texture2D(gNoise, (vGW.xz + vec2(vGW.y * 0.35, -vGW.y * 0.25)) / 220.0).r;
  cRock *= mix(vec3(0.9, 0.91, 0.95), vec3(1.12, 1.1, 1.05), cMacroCliff);
  ${opts.mapType === 'HIGHLAND' ? `// Vách đá cao nguyên: đá granite xám hoa cương sáng, đỉnh cao có vệt đá sáng đón nắng
  cRock = mix(cRock, vec3(0.52, 0.51, 0.53) * cStrata, 0.38);
  float cPeakH = smoothstep(260.0, 560.0, vGW.y) * (1.0 - cGully * 0.45);
  cRock = mix(cRock, vec3(1.12, 1.14, 1.18) * cStrata, cPeakH * 0.3 * smoothstep(0.35, 0.65, texture2D(gNoise, wr2 / 140.0 + 0.17).g));` : ''}
  ${desert ? `// Núi bàn sa mạc: địa tầng sa thạch nhiều màu sắc sảo
  vec3 cMesa = mix(vec3(0.82, 0.46, 0.32), vec3(0.72, 0.55, 0.4), sin(vGW.y * 0.08) * 0.5 + 0.5);
  cRock = mix(cRock, cMesa * cStrata, 0.52);` : ''}
  float gMtnR = 0.0, gMtnF = 0.0;
  ${rimF ? `// NÚI SA MẠC vành ngoài (MapGen desertRange; cùng công thức GroundShader.desertMtn cho lớp cỏ): sR = khoảng cách từ
  // chân vành núi. gMtnF: quạt sỏi -> núi (không còn cát gợn), gMtnR: đá lộ trên mặt núi (khe thoải giữa các sống giữ sỏi)
  {
    float ua = fract(atan(vGW.z, vGW.x) / 6.2831853 + 1.0) * ${RIM_N}.0 - 0.5, i0 = floor(ua);
    vec2 e0 = texture2D(gRimF, vec2((i0 + 0.5) / ${RIM_N}.0, 0.5)).rg, e1 = texture2D(gRimF, vec2((i0 + 1.5) / ${RIM_N}.0, 0.5)).rg;
    float foot = mix(dot(e0, vec2(65280.0, 255.0)), dot(e1, vec2(65280.0, 255.0)), ua - i0) * ${RIM_SC};
    float sR = length(vGW.xz) - foot + (texture2D(gNoise, wp / 230.0 + 0.13).r - 0.5) * 110.0;
    float rimRk = mix(texture2D(gRimF, vec2((i0 + 0.5) / ${RIM_N}.0, 0.5)).b, texture2D(gRimF, vec2((i0 + 1.5) / ${RIM_N}.0, 0.5)).b, ua - i0);
    gMtnF = smoothstep(-80.0, 100.0, sR) * rimRk;
    gMtnR = max(smoothstep(120.0, 360.0, sR) * smoothstep(0.02, 0.06, slope + (nz2.r - 0.5) * 0.03), smoothstep(380.0, 650.0, sR) * 0.9) * rimRk;
  }
  if (gMtnF > 0.0) {
    // đá núi sa mạc: vàng nâu tự nhiên (sa thạch / đá vôi phong hoá), sáng tối theo vân đá, mảng ngả cam / mảng xám tro;
    // mảng "sơn sa mạc" nâu sẫm (desert varnish) loang trên mặt đá dốc — mảng méo không đều (vệt kéo dọc một bước cố định
    // nhìn xa thành các vạch ngắn lặp đều)
    float rl = gRockL * 1.9;
    float pv = texture2D(gNoise, wr2 / 520.0 + 0.37).g, pg = texture2D(gNoise, wr3 / 950.0 + 0.71).r;
    vec3 tone = mix(vec3(0.68, 0.59, 0.46), vec3(0.7, 0.57, 0.42), smoothstep(0.45, 0.78, pv));
    tone = mix(tone, vec3(0.6, 0.57, 0.52), smoothstep(0.55, 0.85, pg) * 0.6);
    vec2 vw = wr1 + (texture2D(gNoise, wr3 / 700.0 + 0.27).rg - 0.5) * 260.0;
    float vrn = smoothstep(0.58, 0.8, texture2D(gNoise, vw / 330.0 + 0.21).b * 0.7 + texture2D(gNoise, vw / 95.0 + 0.6).g * 0.3)
      * smoothstep(0.08, 0.25, slope);
    vec3 cM = tone * (0.62 + 0.42 * rl) * mix(1.0, cStrata, 0.2);
    cM = mix(cM, cM * vec3(0.6, 0.53, 0.48), vrn * 0.6);
    cRock = mix(cRock, cM, gMtnF);
    // quạt sỏi / lòng khe: sỏi đá vụn nâu xám nhạt (mặt sỏi sa mạc), lấm tấm sỏi sẫm
    cDirt = mix(cDirt, tone * vec3(1.02, 1.0, 0.98) * (0.86 + 0.2 * gPeb0), gMtnF * 0.75);
  }` : ''}
  // mặt nạ trộn: độ dốc -> đá; nhiễu tầng lớn -> mảng đất trống / bãi sỏi; ven nước -> bùn đất
  float wDirt = smoothstep(0.5, 0.82, nz.r * 0.55 + nz2.g * 0.45 + (nz2.b - 0.5) * 0.2) * 0.85;
  wDirt = max(wDirt, smoothstep(gWaterLvl + 6.0, gWaterLvl, vGW.y) * 0.85);
  wDirt = max(wDirt, smoothstep(0.1, 0.3, slope) * ${opts.mapType === 'RIVER_LAKE' || opts.mapType === 'JUNGLE' || opts.mapType === 'URBAN' ? '0.2' : opts.mapType === 'HIGHLAND' ? '0.35' : '0.75'});   // sườn vừa dốc: đất trơ trước khi lộ đá (khí hậu ẩm: bụi cây phủ kín)
  float wFine = smoothstep(0.6, 0.78, nz.g + (nz2.b - 0.5) * 0.3) * ${desert || urban ? '0.75' : '0.6'};
  float wRock = smoothstep(${desert ? '0.3, 0.52' : opts.mapType === 'HIGHLAND' ? '0.3, 0.52' : '0.3, 0.55'}, slope + (nz2.r - 0.5) * 0.14);   // (khí hậu ẩm: sườn dốc vừa vẫn giữ cỏ)
  ${rimF ? 'wRock = max(wRock, gMtnR); wDirt = max(wDirt, gMtnF * 0.92); wFine *= 1.0 - gMtnF;' : ''}
  ${opts.mapType === 'RIVER_LAKE' || opts.mapType === 'JUNGLE' || opts.mapType === 'URBAN' ? `// khí hậu ẩm: sườn dốc phủ bụi cỏ, đá chỉ lộ thành từng mỏm rời (cả mặt sườn một tấm đá xám như vải phủ có nếp gấp)
  wRock *= smoothstep(0.52, 0.68, texture2D(gNoise, wr2 / 95.0 + 0.61).r * 0.7 + texture2D(gNoise, wr1 / 23.0 + 0.2).b * 0.3);` : ''}
  ${opts.mapType === 'HIGHLAND' ? `// cao nguyên: đá lộ thành mỏm / bãi đá rời theo vệt (không chỏm đá sáng đều tăm tắp trên mọi gò)
  wRock *= mix(0.25, 1.0, smoothstep(0.42, 0.62, texture2D(gNoise, wr2 / 95.0 + 0.61).r * 0.7 + texture2D(gNoise, wr1 / 23.0 + 0.2).b * 0.3)) + smoothstep(0.55, 0.8, slope);` : ''}
  // trộn theo "độ cao" của từng lớp: chỗ chuyển tiếp lởm chởm tự nhiên thay vì mờ đều
  float hB = lum(cBase), hD = lum(cDirt), hF = lum(cFine), hR = lum(cRock);
  vec3 col = cBase; float hh = hB;
  float t1 = clamp((wFine - 0.5) * 1.8 + (hF - hh) * 1.6 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.15, wFine); col = mix(col, cFine, t1); hh = mix(hh, hF, t1);
  float t2 = clamp((wDirt - 0.5) * 1.8 + (hD - hh) * 1.6 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.15, wDirt); col = mix(col, cDirt, t2); hh = mix(hh, hD, t2);
  float t3 = clamp((wRock - 0.5) * 2.2 + (hR - hh) * 2.0 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.12, wRock); col = mix(col, cRock, t3); hh = mix(hh, hR, t3);
  col *= 1.0 + 0.07 * gPeb0 * t2 * (1.0 - t3);
  ${opts.mapType === 'RIVER_LAKE' || opts.mapType === 'JUNGLE' || opts.mapType === 'URBAN' ? `// khí hậu ẩm: sườn dốc phủ bụi cây rậm — xanh sẫm lốm đốm tán bụi (không thành sườn đất trọc / tấm đá xám)
  {
    float scrub = smoothstep(0.14, 0.4, slope) * (1.0 - t3);
    float sp = texture2D(gNoise, wr1 / 6.0 + 0.3).g * 0.6 + texture2D(gNoise, wr2 / 2.3 + 0.7).r * 0.4;
    col = mix(col, cBase * vec3(0.55, 0.66, 0.48) * (0.75 + 0.5 * sp), scrub * 0.85);
  }` : ''}
  // bãi cát / cồn cát sát mặt nước (map sông hồ): dải thấp sát nước; phủ ở CUỐI (sau mọi lớp loang của cỏ) cho mịn
  // bờ thật không viền cát đều quanh cả sông: bãi bồi rộng từng đoạn (mảng ~200 m), xen đoạn cỏ mọc sát nước chỉ chừa dải
  // bùn sẫm ướt hẹp ở mép (trước: một dải cát sáng cùng độ cao chạy quanh mọi bờ -> nhìn từ cao như nét viền vẽ)
  float sK = smoothstep(0.3, 0.7, texture2D(gNoise, wr3 / 1600.0 + 0.37).r * 0.75 + texture2D(gNoise, wr1 / 430.0 + 0.13).g * 0.25);
  float sTop = gWaterLvl + mix(-2.0, 1.8, sK);
  float gSand = smoothstep(sTop, sTop - 2.4, vGW.y) * smoothstep(gWaterLvl - 6.0, gWaterLvl - 3.6, vGW.y) * (1.0 - t3);
  float gBank = (1.0 - sK) * smoothstep(gWaterLvl + 0.6, gWaterLvl - 1.6, vGW.y) * smoothstep(gWaterLvl - 6.0, gWaterLvl - 3.6, vGW.y) * (1.0 - t3);
  // pha màu tầng lớn từ ảnh nền cũ (thảm thực vật, vệt ẩm, nền đường, đáy sông)
  vec3 macro = texture2D(map, vUv, 3.0).rgb;   // bản mờ: chỉ lấy sắc độ tầng lớn, không lộ điểm ảnh
  vec3 tint = clamp(macro / max(gMacroAvg, vec3(0.05)), vec3(0.5), vec3(1.7));
  col *= mix(vec3(1.0), tint, 0.35 * gInMap);
  // thay đổi sắc độ nhẹ tầng rất lớn (đồng cỏ không đều màu)
  col *= 0.9 + 0.2 * nz.b;
  // ĐỊA MẠO: hõm trũng giữ ẩm (xanh đậm / tối), gờ lồi khô nắng (vàng nhạt) — như ảnh chụp thật từ trên cao
  col *= mix(vec3(1.0), ${desert ? 'vec3(0.9, 0.87, 0.82)' : urban ? 'vec3(0.88, 0.88, 0.86)' : 'vec3(0.74, 0.85, 0.7)'}, gWet)
       * mix(vec3(1.0), ${desert ? 'vec3(1.06, 1.05, 1.02)' : urban ? 'vec3(1.04, 1.04, 1.03)' : 'vec3(1.12, 1.02, 0.82)'}, gDryR);
  ${desert || urban ? '' : `// mảng cỏ tốt / cỏ úa cỡ ~50 m (đổi cả sắc độ, không chỉ độ sáng) — còn đọc được từ camera trên cao
  // (mip thô + ngưỡng rộng: mép vùng mềm, to nhỏ không đều; trước đây ngưỡng hẹp trên nhiễu đủ 4 tầng -> lấm tấm đều khắp đồng)
  float pv = smoothstep(0.3, 0.7, gNMb(wr3, 420.0, 0.27, 3.0).g * 0.75 + nz.r * 0.25);
  col *= mix(vec3(0.84, 0.93, 0.8), vec3(1.09, 1.0, 0.84), pv);`}
  // loang lổ cỡ vừa (khóm cỏ / vạt đất 2-6 m) — chi tiết còn đọc được từ camera trên cao
  float mot = gMotF(wp);
  col *= ${desert ? '0.95 + 0.1 * mot' : urban ? '0.95 + 0.1 * mot' : '0.88 + 0.24 * mot'};   // cát / bê tông: chỉ loang rất nhẹ
  ${desert || urban ? '' : `// đồng cỏ thật nhìn từ xa ngả xanh ô-liu dịu, không xanh chói như sân golf (bản đồ sáng nắng dễ bị chói màu nhất)
  col = mix(vec3(lum(col)), col, ${opts.mapType === 'RIVER_LAKE' ? '0.74' : opts.mapType === 'JUNGLE' ? '0.88' : '0.92'});`}
  ${urban ? `// đồi quanh thành phố (vành núi + cảnh nền ngoài bản đồ) phủ cỏ: chuyển dần theo đường vuông bo góc lượn sóng
  // (bám chân vành núi: theo trục gần, theo đường chéo xa), không thành vòng tròn
  float gRd = mix(length(vGW.xz), max(abs(vGW.x), abs(vGW.z)), 0.5) + 420.0 * (texture2D(gNoise, wp / 1700.0 + 0.21).g - 0.5);
  // ngoài khu phố (mặt nạ ô phố, mép lượn theo nhiễu) cũng là đất cỏ ngoại ô
  float gOut = ${city ? '1.0 - smoothstep(0.25, 0.75, texture2D(gCity, (vGW.xz + gTerr.x) / gTerr.y).r + (texture2D(gNoise, wp / 300.0 + 0.4).r - 0.5) * 0.35)' : '0.0'};
  col *= mix(vec3(1.0), vec3(0.8, 0.97, 0.68), max(gOut * 0.85, smoothstep(gTerr.x * 0.8, gTerr.x * 0.8 + 650.0, gRd)));
  // THÀNH PHỐ MA: đất trống / sân bãi bỏ hoang nhiều năm — cỏ dại mọc um tùm thành từng đám (xanh lẫn úa vàng), xen
  // chỗ trơ cát sỏi; trên nền bê tông cỏ mọc qua kẽ nứt nên thưa hơn
  float ovN = gNM(wp, 60.0, 0.53).g * 0.6 + texture2D(gNoise, wp / 17.0 + 0.11).r * 0.4;
  float ov = max(smoothstep(0.3, 0.58, ovN), gOut * 0.9) * (1.0 - t3) * mix(0.7, 1.0, t2);
  // chỗ chưa có cỏ: không còn nền lát xám bạc sạch (loang thành mảng trắng giả) — đất nện nâu xám lẫn sỏi, gạch vụn, rác
  // mục; chỉ thỉnh thoảng lộ tấm bê tông nứt cũ (mảng lớn ~25 m)
  {
    float slab = smoothstep(0.62, 0.7, gNM(wp, 90.0, 0.31).r);
    float gv = texture2D(gNoise, wp / 0.9 + 0.3).r, gv2 = texture2D(gNoise, wp / 2.7 + 0.6).g;
    vec3 cDirtU = cSoil * vec3(0.78, 0.74, 0.68) * (0.8 + 0.35 * gv2);
    cDirtU = mix(cDirtU, vec3(0.42, 0.4, 0.37) * (0.75 + 0.5 * gv), smoothstep(0.62, 0.8, gv) * 0.7);               // sỏi / gạch vụn
    cDirtU = mix(cDirtU, vec3(0.38, 0.22, 0.16) * (0.8 + 0.3 * gv2), smoothstep(0.82, 0.92, gv2) * 0.55);           // mảnh gạch đỏ
    col = mix(col, cDirtU, (1.0 - slab) * (1.0 - t3) * (1.0 - gOut) * 0.85);
  }
  float fresh = smoothstep(0.35, 0.7, gNM(wp, 140.0, 0.77).b);
  // cỏ dại thành bụi: lõi bụi sẫm (bóng lá dày), mép bụi sáng úa; sắc xanh / úa vàng loang theo mảng
  float clump = texture2D(gNoise, wp / 4.3 + 0.27).g * 0.6 + texture2D(gNoise, wp / 1.6 + 0.9).r * 0.4;
  vec3 cWeed = cFine * mix(vec3(0.86, 0.8, 0.58), vec3(0.56, 0.7, 0.4), fresh) * (0.5 + 0.55 * clump);
  cWeed = mix(vec3(dot(cWeed, vec3(0.333))), cWeed, 0.9);
  col = mix(col, cWeed, ov * mix(0.75, 0.95, smoothstep(0.3, 0.6, clump)));` : ''}
  if (gSand > 0.001) {
    // cát bồi mịn: một sắc cát, hạt li ti tương phản rất thấp (mờ dần ở xa), đổi sắc nhẹ theo mảng vài chục mét;
    // mép nước / phần ngập nông sẫm ướt dần, bờ cao khô sáng hơn; không vệt, không đốm
    float gD = max(fwidth(wp.x), fwidth(wp.y));
    float sg = (texture2D(gNoise, wr1 / 2.3 + 0.17).r - 0.5) * (1.0 - smoothstep(0.08, 0.3, gD))
             + (texture2D(gNoise, wr2 / 7.5 + 0.61).g - 0.5) * 0.6 * (1.0 - smoothstep(0.3, 1.0, gD));
    // loang nhẹ cỡ vài chục mét (chỗ cát mịn sáng, chỗ lẫn phù sa sẫm hơn) — tương phản thấp, không thành đốm
    float sv = texture2D(gNoise, wr3 / 95.0 + 0.4).b * 0.6 + texture2D(gNoise, wr1 / 31.0 + 0.8).g * 0.4;
    vec3 cSand = mix(vec3(0.47, 0.43, 0.35), vec3(0.55, 0.5, 0.4), smoothstep(0.25, 0.75, sv)) * (1.0 + sg * 0.06);
    float yW = vGW.y - (gWaterLvl - 2.3);                                                     // độ cao so với mặt nước
    cSand *= mix(vec3(0.62, 0.62, 0.64), vec3(1.0), smoothstep(-0.6, 0.15, yW));              // ngập: ướt sẫm
    cSand *= mix(0.84, 1.0, smoothstep(0.15, 1.5, yW));                                        // sát mép nước: cát ẩm
    cSand *= mix(1.0, 1.06, smoothstep(1.2, 3.0, yW));                                         // bờ cao: khô sáng hơn
    col = mix(col, cSand, smoothstep(0.0, 0.6, gSand));
  }
  // mép bùn ướt (đoạn bờ không có bãi cát): nâu sẫm, loang theo nhiễu nhỏ
  if (gBank > 0.001) col = mix(col, vec3(0.2, 0.18, 0.13) * (0.8 + 0.4 * texture2D(gNoise, wr2 / 9.0 + 0.53).b), gBank * 0.75);
  float gRainW = 0.0, gPud = 0.0;
  vec3 gDrops = vec3(0.0);${rain ? `
  if (skyWetU.x > 0.0) {
    // có mái che (gầm cầu, lòng hầm): khô; ngoài bản đồ (cảnh nền) luôn ướt
    float gOpen = skyWetU.w > 0.0 ? 1.0 - smoothstep(10.0, 16.0, skyWetTop(wp) - vGW.y) * gInMap : 1.0;
    gRainW = skyWetU.x * gOpen;
    // VŨNG NƯỚC: đọng ở hõm trũng & chỗ bằng (mép vũng lượn theo nhiễu), đất trống đọng nhiều hơn cỏ; không đọng trên dốc / đá
    float pn = texture2D(gNoise, wr1 / 41.0 + 0.23).r * 0.6 + texture2D(gNoise, wr2 / 12.0 + 0.61).g * 0.4;
    // (hõm lớn không thành một tấm gương liền: nhiễu nhỏ cắt vụn thành nhiều vũng, chừa gờ đất / khóm cỏ nhô lên)
    float lvl = cav * 1.3 + (pn - 0.5) * 1.3 + (texture2D(gNoise, wr3 / 4.3 + 0.71).b - 0.5) * 0.45 + t2 * 0.18 - slope * 3.0 - t3;
    gPud = smoothstep(0.36 - 0.22 * G_PUD, 0.5 - 0.22 * G_PUD, lvl) * gRainW * gInMap * (1.0 - t3);
    // THẤM ƯỚT: đất / cát sẫm hẳn, cỏ sẫm ít hơn; lấm tấm vệt mưa (đốm ướt đậm nhạt li ti chỗ thấm nhiều chỗ ít)
    float spk = smoothstep(0.55, 0.75, texture2D(gNoise, wp / 1.7 + 0.37).r * 0.6 + texture2D(gNoise, wp / 0.6 + 0.11).g * 0.4);
    col *= mix(vec3(1.0), G_WETC * (1.0 - 0.12 * spk), gRainW);
    col *= 1.0 - 0.12 * t2 * gRainW;
    // giọt mưa vừa đập xuống: đốm sẫm lấm tấm trên đất, vòng sóng loang trên vũng (pháp tuyến bên dưới)
    float gRd = length(vViewPosition);
    if (gRd < 300.0) gDrops = skyRainDrops(wp, skyWetU.y, skyWetU.z) * (1.0 - gRd / 300.0) * gRainW;
    col *= 1.0 - 0.2 * gDrops.z * (1.0 - gPud);
    // nước vũng đục phù sa: thân nước sẫm (cái mắt thấy chủ yếu là trời phản chiếu, xem lights_fragment_end)
    col = mix(col, col * 0.45 + vec3(0.018, 0.017, 0.013), gPud * 0.85);
  }` : ''}
  // VẠT ĐẤT TRƠ giữa đồng cỏ (đồng cỏ thật không phủ kín hoàn hảo): đất trần lấm sỏi, chỗ thấp nhất đọng bùn ướt. Cùng công
  // thức với GroundCover.bareAt (thảm cỏ / khóm cỏ tránh ra, đá vụn dày hơn); 3 thang nhiễu lệch chu kỳ -> không lặp
  float gBareP = 0.0, gMud = 0.0;
  ${desert ? '' : `{
    float bn = texture2D(gNoise, wr2 / 520.0 + vec2(0.19, 0.83)).g * 0.6 + texture2D(gNoise, vGW.xz / 1900.0 + vec2(0.61, 0.27)).r * 0.4
             + (texture2D(gNoise, wr1 / 37.0 + vec2(0.47, 0.09)).b - 0.5) * 0.15;
    float gG0 = (1.0 - t1) * (1.0 - t2) * (1.0 - t3)${urban ? ' * gOutE' : ''};
    // ở xa vạt đất nhạt dần (không thành chấm sẫm như vết dập trên sườn đồi)
    gBareP = smoothstep(0.64, 0.67, bn) * gG0 * mix(1.0, 0.4, smoothstep(500.0, 1600.0, G_VDIST));
    // lõi vạt: đất ẩm sẫm dần về giữa (chuyển rất mềm, không có mép mảng bùn)
    gMud = smoothstep(0.67, 0.76, bn) * gBareP * (1.0 - gPud);
    col = mix(col, cSoil * vec3(0.8, 0.76, 0.68) * (0.9 + 0.14 * gPeb0), gBareP * 0.93);
    col *= mix(vec3(1.0), vec3(0.74, 0.7, 0.62), gMud);
  }`}
  ${desert ? '' : `{
    // ĐỒNG CỎ XA (không thêm hình học): khóm cỏ 3D thưa dần / hết ở xa -> shader vẽ tiếp chúng thành vệt màu
    float gGr = (1.0 - t1) * (1.0 - t2) * (1.0 - t3) * (1.0 - gPud) * (1.0 - gBareP)${urban ? ' * gOutE' : ''};
    float gDv = length(vViewPosition), gFarK = smoothstep(200.0, 900.0, gDv) * gGr;
    // cụm khóm: cùng nhiễu mật độ cụm GroundCover dùng rải khóm cỏ 3D (thang 170, kênh b) -> chỗ khóm dày ở gần, ra xa vẫn
    // là mảng sẫm đúng chỗ đó; trong cụm loang lổ 2-5 m như bóng các khóm (mip tự trung bình hoá ở rất xa, không nhấp nháy)
    float gCl = smoothstep(0.3, 0.66, texture2D(gNoise, vGW.xz / 170.0 + vec2(0.37, 0.11)).b);
    float gTf = smoothstep(0.45, 0.75, texture2D(gNoise, wr1 / 4.1 + 0.33).g * 0.6 + texture2D(gNoise, wr2 / 1.7 + 0.71).r * 0.4);
    col *= mix(vec3(1.0), vec3(0.7, 0.78, 0.6), gTf * (0.3 + 0.7 * gCl) * gFarK);
    col *= 1.0 - 0.08 * gCl * gFarK;
    // ánh cỏ khi nhìn xiên: thấy thân & ngọn lá phản chiếu trời -> sáng bạc, ngả vàng nhạt (đồi xa có chiều sâu, không phẳng như nỉ)
    float gNdv = clamp(dot(normalize(cameraPosition - vGW), nrm), 0.0, 1.0);
    float gSh = pow(1.0 - gNdv, 3.0) * smoothstep(120.0, 600.0, gDv) * gGr;
    // (nhẹ & không cộng trắng: đồi xa giữ màu xanh no, không bạc phếch)
    col = mix(col, col * vec3(1.08, 1.08, 0.96), gSh * 0.35);
    // đồng cỏ xa: mắt thấy tán lá & bóng giữa các ngọn cỏ hơn là đất / lá khô -> sẫm hơn nền gần (đồi không nhạt nhoà).
    // Sẫm gần đều 3 kênh: hệ số cũ (0.86, 0.97, 0.74) giữ kênh lục, cắt đỏ / lam -> càng xa cỏ càng xanh chanh rực như nỉ
    col *= mix(vec3(1.0), vec3(0.8, 0.85, 0.76), smoothstep(400.0, 2200.0, gDv) * gGr);
    // MẢNG SẮC CỎ LỚN (đồng cỏ thật không một màu): bãi cỏ khô ngả vàng rơm / cỏ tươi xanh lam / cỏ ô liu, loang 60-400 m;
    // sườn đón nắng gắt khô hơn, sườn khuất (hướng bắc) ẩm xanh sẫm
    {
      float mA = texture2D(gNoise, wr3 / 380.0 + vec2(0.31, 0.77)).r * 0.65 + texture2D(gNoise, wr1 / 95.0 + 0.53).g * 0.35;
      float mB = texture2D(gNoise, wr2 / 210.0 + vec2(0.71, 0.13)).b;
      float aspect = clamp(-nrm.z * 2.5, -1.0, 1.0) * smoothstep(0.04, 0.2, slope);
      vec3 tone = mix(vec3(0.9, 1.0, 0.94), vec3(1.12, 1.05, 0.78), smoothstep(0.3, 0.75, mA + aspect * 0.18));
      tone *= mix(vec3(1.0), vec3(0.9, 0.92, 0.8), smoothstep(0.55, 0.8, mB));
      col *= mix(vec3(1.0), tone, gGr * (0.55 + 0.45 * smoothstep(150.0, 800.0, gDv)));
    }
    // lùm bụi / cây nhỏ: tán sẫm, mỗi lùm một tông (bụi xanh lam, bụi ô liu, bụi ngả vàng); mép tán tơi, không viền cứng
    gBushK = gBushD(wp, slope) * smoothstep(350.0, 900.0, gDv) * gGr;
    // RỪNG NỀN (mặt nạ từ Backdrop): nền rừng sẫm dưới đám cây + ngọn cây san sát nổi khối (cùng lớp lùm bụi, dày đặc)
    // -> đám rừng xa liền tán, sần sùi như rừng thông thật; cây 3D thưa hơn ở xa vẫn thấy cả mảng rừng
    float gFor = gForXf.z > 0.0 ? texture2D(gForMap, (vGW.xz + gForXf.x) * gForXf.y).r * gGr * smoothstep(500.0, 1300.0, gDv) : 0.0;
    if (gFor > 0.01) {
      col = mix(col, cBase * vec3(0.3, 0.38, 0.3), smoothstep(0.05, 0.6, gFor) * 0.9);
      #ifdef GFOR_DBG
      col = vec3(gFor * 3.0, 0.0, 0.0);
      #endif
      gBushK = max(gBushK, smoothstep(0.05, 0.5, gFor) * 0.95);
    }
    if (gBushK > 0.01) {
      gBush0 = gBushH(wp, gBushK);
      float bt = texture2D(gNoise, wp / 13.0 + 0.6).b, bt2 = texture2D(gNoise, wp / 3.1 + 0.2).r;
      vec3 cB = cBase * mix(vec3(0.42, 0.52, 0.42), vec3(0.62, 0.6, 0.36), bt) * (0.8 + 0.4 * bt2);
      cB = mix(cB, cBase * vec3(0.36, 0.46, 0.4) * (0.75 + 0.5 * bt2), smoothstep(0.05, 0.5, gFor));
      col = mix(col, cB, smoothstep(0.0, 0.3, gBush0 - (bt2 - 0.5) * 0.12));
    }
  }`}
  // dưới / sát khóm cỏ 3D: đất khuất nắng & trời, lớp lá rụng / gốc cỏ sẫm ngả ô-liu (mờ hết trên đá, vũng nước)
  float gCov = gCovOcc(vGW.xz) * (1.0 - t3) * (1.0 - gPud) * (1.0 - 0.7 * gBareP);
  // (bản đồ bóng thô 4 đv/điểm: chỉ làm sẫm kẽ lá, ngọn lá vẫn sáng -> không thành đốm đen nhoè tròn quanh khóm)
  // (vệt bóng gọn 2 đv/điểm, đậm dồn về gốc: đất sát gốc khuất sáng, ngả màu gốc cỏ / lá mục -> khóm cắm rễ vào đất)
  gCov *= clamp(1.0 + 0.6 * (1.0 - lum(gTurfD)), 0.55, 1.0);
  col *= mix(vec3(1.0), vec3(0.52, 0.6, 0.44), gCov);
  // dưới thảm cỏ ngắn: kẽ giữa các đám lá là gốc cỏ khuất sáng (cùng mức mờ viền với thảm -> không lộ ranh giới vùng thảm)
  // (ngoài vùng thảm còn 85%: đồng cỏ xa cùng tông với thảm cỏ & khóm cỏ, không sáng bừng lên thành vạch ngang ở mép thảm)
  float gCar = gCarpet.z > 0.0 ? mix(0.85, 1.0, smoothstep(0.0, gCarpet.w, gCarpet.z - length(vGW.xz - gCarpet.xy))) * (1.0 - t1) * (1.0 - t2) * (1.0 - t3) * (1.0 - gPud) * (1.0 - gBareP) : 0.0;
  col *= mix(vec3(1.0), vec3(0.72, 0.77, 0.62), gCar);
  diffuseColor.rgb *= col;

`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // pháp tuyến mượt + mô đất lồi lõm tính bằng hiệu số trên mặt phẳng thế giới (không phụ thuộc tam giác / điểm ảnh)
    float m0 = gMotF(wp), mx = gMotF(wp + vec2(1.8, 0.0)), mz = gMotF(wp + vec2(0.0, 1.8));
    float fadeB = clamp(1.0 - G_VDIST / 4500.0, 0.35, 1.0);
    // Gờ đá địa tầng nổi khối: chỉ vách đá trọc (lớp đá t3) của cao nguyên / sa mạc, đứt quãng theo nhiễu. Trước đây phủ mọi
    // sườn dốc: gờ chạy đúng theo đường đồng mức -> quả đồi hình nón hằn sọc chéo song song như vân sóng
    float stHN = vGW.y + (texture2D(gNoise, wp * 0.00045 + 0.17).r - 0.5) * 32.0;
    float dStrata = ${opts.mapType === 'HIGHLAND' || desert ? '1.0' : '0.0'} * (cos(stHN * 0.26) * 0.24 + cos(stHN * 0.08) * 0.16) * smoothstep(0.22, 0.55, slope)
      * t3 * smoothstep(0.35, 0.65, texture2D(gNoise, wp / 140.0 + 0.27).g) * (1.0 - gMtnF);
    vec3 nW = normalize(nrm - vec3(mx - m0, 0.0, mz - m0) * ${desert ? '0.9' : urban ? '0.25' : '1.8'} * fadeB * (1.0 - 0.92 * smoothstep(0.0, 0.6, gSand)));
    {
      // khóm cỏ (cao ~0.55 đơn vị) và sỏi / cục đất (~0.25) nổi khối: bước sai phân >= cỡ 1 điểm ảnh trên mặt đất
      float e = max(0.35, max(fwidth(wp.x), fwidth(wp.y)));
      ${desert || urban ? '' : `float tx = gTuftH(wp + vec2(e, 0.0)), tz = gTuftH(wp + vec2(0.0, e));
      nW = normalize(nW - vec3(tx - gTuft0, 0.0, tz - gTuft0) * (0.22 / e) * (1.0 - wBare) * (1.0 - max(t2, t3)) * (1.0 - smoothstep(0.0, 0.6, gSand)));`}
      if (gBushK > 0.01) {
        float eb = max(1.0, e), bx = gBushH(wp + vec2(eb, 0.0), gBushK), bz = gBushH(wp + vec2(0.0, eb), gBushK);
        nW = normalize(nW + vec3(bx - gBush0, 0.0, bz - gBush0) * (4.0 / eb));
      }
      // MÔ ĐẤT NHẤP NHÔ ở xa (ô ~90 m, lưới địa hình không có): sườn đồi bắt sáng / tối lượn sóng nhẹ, không phẳng như nỉ
      {
        float fH = smoothstep(300.0, 900.0, length(vViewPosition)) * (1.0 - t3);
        if (fH > 0.0) {
          float eh = max(6.0, e * 2.0);
          float h0 = texture2D(gNoise, wr2 / 90.0 + 0.41).g;
          float hx = texture2D(gNoise, (wr2 + mat2(0.423, -0.906, 0.906, 0.423) * vec2(eh, 0.0)) / 90.0 + 0.41).g;
          float hz = texture2D(gNoise, (wr2 + mat2(0.423, -0.906, 0.906, 0.423) * vec2(0.0, eh)) / 90.0 + 0.41).g;
          nW = normalize(nW - vec3(hx - h0, 0.0, hz - h0) * (6.0 / eh) * fH);
        }
      }
      float px = gBumps(wp + vec2(e, 0.0), 1.3, 0.45), pz = gBumps(wp + vec2(0.0, e), 1.3, 0.45);
      nW = normalize(nW - vec3(px - gPeb0, 0.0, pz - gPeb0) * (0.25 / e) * t2 * (1.0 - t3) * (1.0 - smoothstep(0.0, 0.6, gSand)));
    }
    ${rimF ? `// vành núi sa mạc: rãnh xói / mỏm đá nổi khối + hốc tối, gờ sáng (đá trọc, ánh nắng gắt lộ rõ hình khối)
    if (gMtnF > 0.01) {
      float fw = max(fwidth(wp.x), fwidth(wp.y)), e = max(3.0, fw * 1.5);
      float b0 = gMtnB(wp, fw), bx = gMtnB(wp + vec2(e, 0.0), fw), bz = gMtnB(wp + vec2(0.0, e), fw);
      float kM = gMtnF * (0.35 + 0.65 * gMtnR);
      nW = normalize(nW - vec3(bx - b0, 0.0, bz - b0) / e * 0.7 * kM);
      col *= mix(1.0, 1.06 + 0.02 * b0, kM * 0.7);   // hốc / kẽ đá tối hơn
    }` : ''}
    ${desert ? `// gợn cát nổi khối: cao ~0.3 đơn vị (~4 cm), sườn đón gió ~8°, sườn khuất ~18°; chỉ trên lớp cát nền,
    // nhạt dần trên sườn cồn dốc (cát trượt phẳng) và nơi lộ đất / đá
    {
      // bước sai phân không nhỏ hơn cỡ 1 điểm ảnh trên mặt đất: ở xa là đạo hàm đã làm mượt, không lấy mẫu thưa
      float e = max(0.45, max(fwidth(wp.x), fwidth(wp.y))), rx = gRip(wp + vec2(e, 0.0)), rz = gRip(wp + vec2(0.0, e));
      float k = 0.2 / e * (1.0 - smoothstep(0.18, 0.4, slope)) * (1.0 - max(t2, t3));
      nW = normalize(nW - vec3(rx - gRip0, 0.0, rz - gRip0) * k);
    }` : ''}
${rain ? `    if (gRainW > 0.0) {
      nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), clamp(gPud * 1.2, 0.0, 1.0)));     // mặt vũng phẳng lặng
      nW = normalize(nW + vec3(-gDrops.x, 0.0, -gDrops.y) * (0.15 + 0.85 * gPud));   // vòng sóng giọt mưa
      vec2 gBl = skyBlastRip(wp).xy;                                                       // sóng xung kích vụ nổ / đầu nòng
      nW = normalize(nW + vec3(-gBl.x, 0.0, -gBl.y) * (0.2 + 0.8 * gPud));
    }
` : ''}    nW = normalize(nW + vec3(nrm.x * dStrata * 0.32, dStrata * 0.42, nrm.z * dStrata * 0.32));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, ${rain ? 'G_WETR' : 'roughnessFactor'}, gRainW);
  roughnessFactor = mix(roughnessFactor, 0.04, gPud);
  roughnessFactor = mix(roughnessFactor, 0.6, gMud);   // bùn ướt bóng loáng`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${rain ? `
  if (gRainW > 0.0) {
    // mặt đất ướt / vũng nước phản chiếu trời mây xám (nhìn xiên sáng loáng, nhìn thẳng xuống tối)
    vec3 gR = reflect(-geometry.viewDir, geometry.normal);
    float gF = 0.02 + 0.98 * pow(1.0 - clamp(dot(geometry.normal, geometry.viewDir), 0.0, 1.0), 5.0);
    reflectedLight.indirectSpecular += skyWetSky(dot(viewMatrix[1].xyz, gR)) * gF * (gPud * 1.05 + gRainW * 0.22);
  }` : ''}
  // (bóng mây trôi: tính chung cho mọi vật liệu trong chunk chiếu sáng, xem SkySystem.installCloudShadows)
  if (gSunXf.w > 0.0) {
    // bóng núi / AO nướng sẵn: trong khung bóng đổ thật nhường cho bóng thật (sắc nét, có cả xe / nhà), ra mép khung mới hiện
    vec2 su = (vGW.xz - gSunXf.xy) * gSunXf.z;
    vec2 sv = texture2D(gSunMap, su).rg;
    float sIn = step(0.0, su.x) * step(0.0, su.y) * step(su.x, 1.0) * step(su.y, 1.0);
    float sK = gShBox.z > 0.0 ? smoothstep(gShBox.z * 0.6, gShBox.z * 0.92, length(vGW.xz - gShBox.xy)) : 1.0;
    reflectedLight.directDiffuse *= mix(1.0, sv.r, sK * sIn);
    reflectedLight.directSpecular *= mix(1.0, sv.r, sK * sIn);
    reflectedLight.indirectDiffuse *= mix(1.0, sv.g, sIn);
  }
  {
    float vao = gVehAO(vGW.xz);
    reflectedLight.indirectDiffuse *= vao;
    reflectedLight.directDiffuse *= mix(1.0, vao, 0.3);   // mép bóng đổ dưới gầm (bóng nắng mềm hở sáng) cũng sẫm theo
    reflectedLight.indirectDiffuse *= 1.0 - 0.45 * gCov;   // lá cỏ che bầu trời
    reflectedLight.directDiffuse *= 1.0 - 0.3 * gCov;      // lá cỏ lốm đốm che nắng
  }
  reflectedLight.indirectDiffuse *= 1.0 - gWet * 0.3;   // hõm khuất ánh trời
  // sát chân tường nhà: ánh trời bị tường che một nửa bầu trời -> mặt đất tối dần vào chân tường (bóng tiếp xúc)
  if (gBldGrid.z > 0.0) {
    vec2 bu = (vGW.xz - gBldGrid.xy) * gBldGrid.zw;
    if (bu.x > 0.0 && bu.y > 0.0 && bu.x < 1.0 && bu.y < 1.0) {
      float gOcc = texture2D(gBldOcc, bu).r;
      reflectedLight.indirectDiffuse *= 1.0 - 0.6 * gOcc;
      reflectedLight.directDiffuse *= 1.0 - 0.15 * gOcc;
    }
  }`);
    };
    mat.customProgramCacheKey = () => 'groundPBR21:' + (opts.mapType || '') + (opts.ownNormals ? ':own' : '') + (rain ? ':rain' : '') + (rimF ? ':rim' : '');
    mat.needsUpdate = true;
    return mat;
  }

  function tick(dt) { uTime.value += dt; }

  // Đọc nhiễu trên CPU (khớp texture2D(gNoise, uv) trong shader, kể cả lật trục V của CanvasTexture) -> rải cỏ / đá đúng mặt nạ
  function noiseSampler() {
    const t = noiseTex(), c = t.image, S = c.width, d = c.getContext('2d').getImageData(0, 0, S, S).data;
    return (u, v) => {
      const fx = (((u % 1) + 1) % 1) * S - 0.5, fy = (1 - (((v % 1) + 1) % 1)) * S - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const at = (x, y, ch) => d[((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4 + ch] / 255;
      const out = [0, 0, 0];
      for (let ch = 0; ch < 3; ch++) {
        out[ch] = (at(x0, y0, ch) * (1 - tx) + at(x0 + 1, y0, ch) * tx) * (1 - ty) + (at(x0, y0 + 1, ch) * (1 - tx) + at(x0 + 1, y0 + 1, ch) * tx) * ty;
      }
      return out;
    };
  }

  return { apply, tick, layers, noiseSampler, desertMtn, bakeNormals, bakeNormalsData, setVehicles, time: uTime,
    lodMag: uLodMag, sun: { map: uSunMap, xf: uSunXf, shadowBox: uShadowBox }, cover: { map: uCovMap, xf: uCovXf, carpet: uCarpet, forest: { map: uForMap, xf: uForXf } } };
})();

if (typeof window !== 'undefined') window.GroundShader = GroundShader;
