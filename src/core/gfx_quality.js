/**
 * CHẤT LƯỢNG ĐỒ HỌA THEO SỨC MÁY
 * - Nhận diện card đồ họa (lần đầu chơi) để chọn mức mặc định: card rời -> "Cao", máy văn phòng -> "Vừa"...
 *   ("Siêu cao" chỉ bật khi người chơi tự chọn)
 * - Đo thời gian GPU vẽ mỗi khung (EXT_disjoint_timer_query_webgl2). Độ phân giải động: GPU không kịp vẽ trong
 *   nhịp màn hình -> hạ nhẹ độ phân giải để giữ mượt; dư sức -> nâng dần trở lại mức tối đa của mức chất lượng.
 *   Chỉ phản ứng theo thời gian GPU: khung chậm vì CPU (logic) thì không hạ độ phân giải vô ích.
 * - Mức "Siêu cao": vẽ ở độ phân giải gấp đôi rồi thu nhỏ (siêu lấy mẫu, cạnh mịn hơn hẳn khử răng cưa thường),
 *   bóng đổ 4096, lọc dị hướng tối đa cho mặt đất / tường nhìn nghiêng.
 */
const GfxQuality = (() => {
  const MAX_PIXELS = 3840 * 2160;   // trần số điểm ảnh vẽ (màn 4K không scale -> không vẽ 8K)
  const MIN_RATIO = 0.6;            // độ phân giải thấp nhất khi GPU quá tải (tỉ lệ so với điểm ảnh CSS)
  const STEP = 0.125;

  let renderer = null, gl = null, ext = null;
  let maxRatio = 1, ratio = 1, dynamic = true, minRatio = MIN_RATIO;
  const queries = [];               // truy vấn đang chờ kết quả
  let active = null;
  let gpuMs = 0, gpuOk = false;     // EMA thời gian GPU / khung
  // Đồng hồ GPU đo từ lúc GPU nhận lệnh đầu tới lệnh cuối: CPU gửi lệnh vẽ chậm (máy bận / khung logic nặng) thì GPU
  // ngồi chờ và thời gian chờ cũng bị tính vào. Chỉ coi là GPU quá tải khi GPU bận LÂU HƠN hẳn thời gian CPU gửi lệnh.
  let cpuMs = 0, cpuT0 = 0;
  let overT = 0, underT = 0, holdT = 0, lastChange = 0;
  let frameMsEma = 0;              // dự phòng khi driver không có GPU timer query
  let raiseWait = 3, raisedAt = -1e9;   // giây dư sức liên tục trước khi thử nâng độ nét (tăng dần nếu nâng hỏng)
  const deltas = [];                // khoảng cách khung (ms) gần đây -> ước lượng tần số quét màn hình
  let refreshMs = 1000 / 60;

  // ---------------------------------------------------------------- nhận diện card
  // nhớ theo context: getParameter là lệnh đồng bộ với GPU — hỏi lúc GPU đang biên dịch shader phải chờ hàng giây
  const gpuNames = new WeakMap();
  function gpuName(r) {
    try {
      const g = r.getContext();
      if (gpuNames.has(g)) return gpuNames.get(g);
      const e = g.getExtension('WEBGL_debug_renderer_info');
      const n = String(e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) || '');
      gpuNames.set(g, n);
      return n;
    } catch (err) { return ''; }
  }
  /** Mức chất lượng đề xuất theo tên card: 'ultra' | 'high' | 'medium' | 'low' */
  function tierFromName(name) {
    const n = String(name || '').toLowerCase();
    // Trình duyệt thường che tên GPU vì quyền riêng tư. Không có thông tin thì
    // chọn mức an toàn; người chơi vẫn có thể nâng Cao/Siêu cao trong cài đặt.
    if (!n) return 'medium';
    if (/swiftshader|llvmpipe|software|basic render|softpipe/.test(n)) return 'low';
    if (/mali|adreno|powervr|videocore|apple gpu/.test(n)) return 'medium';            // điện thoại / máy tính bảng
    // card rời đời cũ / dòng phổ thông của laptop (MX, GT, GTX 9xx, GTX 1050 trở xuống, RX 4xx-5xx nhỏ): sức ngang card
    // tích hợp đời mới -> "Vừa"
    if (/geforce (mx|gt )|gtx (6|7|8|9)\d\d|gtx 10[1-5]0|quadro (k|m|p[1-6]\d\d\b|t[456]\d\d\b)|radeon (r[5-9] |hd )|radeon rx (4[1-6]|5[1-5])0|radeon (530|540|550|610|620|625|630)\b/.test(n)) return 'medium';
    // card rời (kể cả RTX mạnh): mặc định "Cao" = vẽ đúng độ phân giải màn hình. "Siêu cao" vẽ gấp đôi (gấp 4 số điểm ảnh:
    // RTX 4070 trên bản đồ thành phố ~26 ms / khung so với ~10 ms) -> chỉ bật khi người chơi tự chọn trong cài đặt
    // Intel Arc rời có số mẫu (A380, A770, B580); "Arc Graphics" không số của Core Ultra là card tích hợp
    if (/geforce|nvidia|quadro|radeon rx|radeon pro|\barc\(tm\) [ab]\d{3}|\barc [ab]\d{3}|apple m\d+ (pro|max|ultra)/.test(n)) return 'high';
    // card tích hợp đời mới (Iris Xe, Arc tích hợp, Radeon 680M/780M, Apple M thường): "Vừa"
    if (/iris|\barc\b|radeon\(tm\) graphics|radeon graphics|radeon \d{3}m|vega \d|apple m\d/.test(n)) return 'medium';
    // Intel HD / UHD (laptop văn phòng phổ thông): "Thấp" — tắt bóng đổ, cỏ, khử răng cưa để đủ mượt
    if (/intel|uhd|hd graphics/.test(n)) return 'low';
    return 'medium';
  }
  function detectTier(r) { return tierFromName(gpuName(r)); }
  // Dò card khi renderer chính CHƯA tạo (khử răng cưa phải chọn lúc tạo context): context tạm, xong trả ngay
  function probeTier() {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return 'low';
      const e = g.getExtension('WEBGL_debug_renderer_info');
      const n = String(e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) || '');
      const lose = g.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return tierFromName(n);
    } catch (err) { return 'medium'; }
  }

  // ---------------------------------------------------------------- cấu hình
  function screenRatioCap(want) {
    const px = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.min(want, Math.sqrt(MAX_PIXELS / px));
  }
  /** maxScale: tỉ lệ điểm ảnh tối đa của mức chất lượng; ssaa: cho phép vẽ cao hơn tỉ lệ màn hình (siêu lấy mẫu);
   *  minScale: độ nét thấp nhất khi quá tải (mức Thấp cho xuống sâu hơn: máy yếu cần mượt hơn cần nét) */
  function configure(r, opts) {
    renderer = r;
    if (!gl) {
      gl = r.getContext();
      try { ext = (r.capabilities && r.capabilities.isWebGL2) ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; } catch (e) { ext = null; }
    }
    const dpr = window.devicePixelRatio || 1;
    maxRatio = screenRatioCap(opts.ssaa ? Math.max(dpr, opts.maxScale) : Math.min(dpr, opts.maxScale));
    minRatio = Math.min(MIN_RATIO, opts.minScale || MIN_RATIO);
    maxRatio = Math.max(minRatio, Math.round(maxRatio / STEP) * STEP);
    dynamic = opts.dynamic !== false;
    ratio = maxRatio;   // mỗi lần đổi cài đặt: bắt đầu lại từ mức đẹp nhất
    overT = underT = 0; holdT = 3;   // vài giây đầu (biên dịch shader, nạp kết cấu) không tính
    frameMsEma = 0;
    raiseWait = 3; raisedAt = -1e9;
    setRatio(ratio, true);
  }
  function setRatio(v, force) {
    if (!renderer) return;
    if (!force && Math.abs(renderer.getPixelRatio() - v) < 0.01) return;
    renderer.setPixelRatio(v);
    renderer.setSize(window.innerWidth, window.innerHeight);
    lastChange = performance.now();
  }
  // Cửa sổ đổi cỡ: tính lại trần điểm ảnh
  window.addEventListener('resize', () => {
    if (!renderer) return;
    const cap = screenRatioCap(maxRatio);
    if (ratio > cap) { ratio = Math.max(minRatio, Math.floor(cap / STEP) * STEP); setRatio(ratio); }
  });

  // ---------------------------------------------------------------- đo GPU
  function beginFrame() {
    if (!ext || active) return;
    // kết quả các khung trước (GPU trả về trễ 1-3 khung)
    for (let i = queries.length - 1; i >= 0; i--) {
      const q = queries[i];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (!disjoint) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gpuMs = gpuOk ? gpuMs + (ms - gpuMs) * 0.15 : ms;
        gpuOk = true;
      }
      gl.deleteQuery(q);
      queries.splice(i, 1);
    }
    if (queries.length > 6) return;   // GPU tụt quá xa: tạm không đo thêm
    active = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
    cpuT0 = performance.now();
  }
  function endFrame() {
    if (!active) return;
    const c = performance.now() - cpuT0;
    cpuMs = cpuMs ? cpuMs + (c - cpuMs) * 0.15 : c;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    queries.push(active);
    active = null;
  }

  // ---------------------------------------------------------------- độ phân giải động
  /** gọi mỗi khung với khoảng cách khung thật (ms); inMatch = false: chỉ đo nhịp màn hình (sảnh chờ) */
  function update(frameMs, inMatch = true) {
    if (!renderer || !(frameMs > 0) || frameMs > 250) return;
    deltas.push(frameMs);
    if (deltas.length > 120) deltas.shift();
    if (deltas.length >= 30) {
      // nhịp màn hình ~ khoảng cách khung ngắn nhất thường gặp (bỏ nhiễu): phân vị 10%. Giữ mức NHANH NHẤT từng thấy
      // (đo được cả lúc ở sảnh, khi máy nhẹ) và không quá 16.7 ms: khi cả trận đều chậm vì GPU, khung chậm không được
      // làm nới ngân sách theo (sẽ không bao giờ hạ độ nét)
      const s = deltas.slice().sort((a, b) => a - b);
      refreshMs = Math.max(4, Math.min(refreshMs, 1000 / 60, s[Math.floor(s.length * 0.1)]));
    }
    if (!dynamic || !inMatch) return;
    const dt = frameMs / 1000;
    holdT -= dt;
    const budget = refreshMs * 0.85;   // chừa chỗ cho trình duyệt ghép hình
    // Driver thiếu EXT_disjoint_timer_query trước đây không thể tự cứu FPS. Dùng
    // nhịp khung làm van an toàn, với ngưỡng trễ để không phản ứng vì một cú giật.
    if (!ext || !gpuOk) {
      frameMsEma = frameMsEma ? frameMsEma + (frameMs - frameMsEma) * 0.08 : frameMs;
      if (frameMsEma > refreshMs * 1.35) { overT += dt; underT = 0; }
      else if (frameMsEma < refreshMs * 0.92) { underT += dt; overT = 0; }
      else { overT = 0; underT = 0; }
      if (holdT > 0) return;
      if (overT > 1 && ratio > minRatio) {
        ratio = Math.max(minRatio, ratio - STEP);
        setRatio(ratio); overT = 0; holdT = 2;
      } else if (underT > 12 && ratio < maxRatio) {
        ratio = Math.min(maxRatio, ratio + STEP);
        setRatio(ratio); underT = 0; holdT = 4;
      }
      return;
    }
    const gpuBound = gpuMs > cpuMs * 1.25 + 2;   // GPU thật sự là phần chậm (không phải đang chờ CPU)
    // Một số driver/WebGL đồng bộ hàng đợi khi GPU tụt rất sâu: thời gian JS gửi lệnh khi đó
    // cũng phình lên, khiến phép so với cpuMs kết luận nhầm là nghẽn CPU. GPU vượt ngân sách
    // hơn 60% là bằng chứng đủ mạnh để hạ độ nét dù renderer.submit đang bị block theo.
    const severeGpu = gpuMs > budget * 1.6;
    // dư sức: GPU xong sớm hẳn, hoặc GPU chỉ đang chờ CPU gửi lệnh mà vẫn trong ngân sách
    const spare = gpuMs < budget * 0.55 || (!gpuBound && gpuMs < budget);
    if (gpuMs > budget && (gpuBound || severeGpu)) { overT += dt; underT = 0; }
    else if (spare) { underT += dt; overT = 0; }
    else { overT = 0; underT = 0; }
    const now = performance.now();
    if (holdT > 0) return;
    if (overT > 0.6 && ratio > minRatio) {
      // chi phí vẽ ~ số điểm ảnh ~ ratio²: hạ theo mức quá tải, 1-2 nấc mỗi lần (không tụt một mạch vì một cú giật)
      const want = ratio * Math.sqrt(budget * 0.9 / gpuMs);
      ratio = Math.max(minRatio, ratio - 2 * STEP, Math.min(ratio - STEP, Math.floor(want / STEP) * STEP));
      // vừa nâng lên đã quá tải -> lần sau chờ lâu hơn mới thử nâng (tránh nhấp nháy độ nét)
      if (now - raisedAt < 6000) raiseWait = Math.min(60, raiseWait * 2);
      setRatio(ratio); overT = 0; holdT = 1.5;
    } else if (underT > raiseWait && ratio < maxRatio) {
      // GPU dư nhiều (vừa vào kính ngắm: khung nhìn hẹp cắt bớt phần lớn cảnh) -> nâng tới 3 nấc một lần, khỏi để hình
      // trong kính mờ cả chục giây đúng lúc cần nhìn rõ nhất. Dư ít thì vẫn nhích từng nấc như cũ
      const want = ratio * Math.sqrt(budget * 0.7 / Math.max(1, gpuMs));
      ratio = Math.min(maxRatio, ratio + 3 * STEP, Math.max(ratio + STEP, Math.floor(want / STEP) * STEP));
      setRatio(ratio); underT = 0; holdT = 2.5; raisedAt = now;
    } else if (raiseWait > 3 && now - raisedAt > 20000 && underT > 10) raiseWait = 3;
  }

  return {
    detectTier, tierFromName, probeTier, gpuName, configure, beginFrame, endFrame, update,
    get gpuMs() { return gpuOk ? gpuMs : null; },
    get ratio() { return ratio; },
    get maxRatio() { return maxRatio; },
    get refreshMs() { return refreshMs; },
    get timerSupported() { return !!ext; }
  };
})();
if (typeof window !== 'undefined') window.GfxQuality = GfxQuality;
