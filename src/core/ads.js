/**
 * QUẢNG CÁO CÓ THƯỞNG (rewarded ads) — một chỗ duy nhất cắm mạng quảng cáo.
 *
 * Cấu hình trong index.html (đặt TRƯỚC thẻ <script> nạp file này):
 *   window.ADS_CONFIG = {
 *     provider: 'auto',      // 'auto' (có h5Client thì dùng Google, không thì khung mẫu) | 'h5' | 'mock' | 'none'
 *     h5Client: '',          // mã nhà xuất bản AdSense, vd 'ca-pub-1234567890123456' (cần đăng ký H5 Games Ads)
 *     h5Test: true,          // true: Google phát quảng cáo THỬ (không tính tiền) — đổi false khi chạy thật
 *     allowMock: true        // không có quảng cáo thật: phát khung quảng cáo mẫu đếm ngược (để thử luồng nhận thưởng)
 *   };
 *
 * Google H5 Games Ads (Ad Placement API): https://developers.google.com/ad-placement
 *   adBreak({ type: 'reward', beforeReward(showAdFn), adViewed, adDismissed, adBreakDone })
 *   beforeReward chỉ được gọi khi CÓ quảng cáo sẵn sàng -> gọi showAdFn() ngay (nút bấm của game đã là lời mời xem)
 *   (Google yêu cầu quảng cáo có thưởng chỉ phát khi người chơi chủ động bấm).
 *
 * Dùng: AdProvider.showRewarded({ name, label, sec }) -> Promise<'done' | 'skip' | 'unavailable'>
 *   done: xem hết (được thưởng) · skip: bỏ ngang · unavailable: hiện không có quảng cáo
 * Máy chủ (server_accounts.js /api/ad/*) mới là nơi cấp thưởng: giới hạn lượt / ngày, giãn cách, thời lượng tối thiểu.
 */
const AdProvider = (() => {
  const C = Object.assign({ provider: 'auto', h5Client: '', h5Test: false, allowMock: true }, window.ADS_CONFIG || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const useH5 = () => !!C.h5Client && (C.provider === 'h5' || C.provider === 'auto');
  const useMock = () => C.provider === 'mock' || (C.provider === 'auto' && !C.h5Client && C.allowMock !== false);
  let busy = false;

  // ---------- Âm thanh game: tắt trong lúc phát quảng cáo ----------
  let audioWasRunning = false;
  function muteGame() {
    const ctx = window.soundEngine && window.soundEngine.ctx;
    audioWasRunning = !!(ctx && ctx.state === 'running');
    if (audioWasRunning) { try { ctx.suspend(); } catch (e) {} }
  }
  function unmuteGame() {
    const ctx = window.soundEngine && window.soundEngine.ctx;
    if (audioWasRunning && ctx) { try { ctx.resume(); } catch (e) {} }
    audioWasRunning = false;
  }

  // ---------- Google H5 Games Ads ----------
  let h5Loading = null;
  function loadH5() {
    if (h5Loading) return h5Loading;
    h5Loading = new Promise((resolve) => {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adBreak || function (o) { window.adsbygoogle.push(o); };
      window.adConfig = window.adConfig || function (o) { window.adsbygoogle.push(o); };

      const existing = document.querySelector('script[src*="adsbygoogle.js"]');
      if (existing) {
        try { window.adConfig({ preloadAdBreaks: 'on', sound: 'on' }); } catch (e) { /* bỏ qua */ }
        if (window.adsbygoogle && window.adsbygoogle.loaded) return resolve(true);

        let done = false;
        const finish = (ok) => { if (done) return; done = true; resolve(ok); };
        existing.addEventListener('load', () => {
          try { window.adConfig({ preloadAdBreaks: 'on', sound: 'on' }); } catch (e) {}
          finish(true);
        }, { once: true });
        existing.addEventListener('error', () => finish(false), { once: true });
        // Thời gian chờ tối đa 4 giây để tệp mã tải về
        setTimeout(() => finish(!!(window.adsbygoogle && window.adsbygoogle.loaded)), 4000);
        return;
      }

      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(C.h5Client);
      if (C.h5Test) s.setAttribute('data-adbreak-test', 'on');
      let done = false;
      const finish = (ok) => { if (done) return; done = true; resolve(ok); };
      s.onload = () => {
        try { window.adConfig({ preloadAdBreaks: 'on', sound: 'on' }); } catch (e) { /* bỏ qua */ }
        finish(true);
      };
      s.onerror = () => finish(false);
      setTimeout(() => finish(false), 5000);
      document.head.appendChild(s);
    });
    return h5Loading;
  }

  // Hộp xác nhận (Google: người chơi phải tự bấm mới phát quảng cáo có thưởng)
  function confirmBox(label) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'eqp-ad';
      el.innerHTML = `<div class="eqp-ad-box"><div class="eqp-ad-top"><span><i class="ti ti-ad-2"></i> QUẢNG CÁO CÓ THƯỞNG</span></div>
        <div class="eqp-ad-stage"><i class="ti ti-gift"></i><p>Xem 1 quảng cáo ngắn</p><small>Phần thưởng: ${esc(label)}</small></div>
        <div class="eqp-ad-actions"><button class="eqp-btn" data-ad="no">ĐỂ SAU</button><button class="eqp-btn ad" data-ad="yes"><i class="ti ti-player-play-filled"></i> XEM NGAY</button></div></div>`;
      document.body.appendChild(el);
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ad]');
        if (!b) return;
        el.remove();
        resolve(b.dataset.ad === 'yes');
      });
    });
  }

  async function showH5(o) {
    const ok = await loadH5();
    if (!ok && !(window.adsbygoogle && window.adsbygoogle.loaded)) {
      console.warn('[ADS] Tệp mã Google Ads không thể nạp hoặc bị chặn.');
      return 'unavailable';
    }
    return new Promise((resolve) => {
      let result = null, offered = false, settled = false;
      let adTimer = null;

      const finish = (status) => {
        if (settled) return;
        settled = true;
        if (adTimer) clearTimeout(adTimer);
        unmuteGame();
        resolve(status);
      };

      // Hẹn giờ bảo vệ: 7 giây không có phản hồi từ Google thì kết thúc để tránh quay hoài
      adTimer = setTimeout(() => {
        console.warn('[ADS] Quá thời gian chờ phản hồi từ Google (7 giây)');
        finish('unavailable');
      }, 7000);

      try {
        window.adBreak({
          type: 'reward',
          name: o.name || 'reward',
          beforeAd: () => {
            muteGame();
            // Đang phát video thật: kéo dài thời gian tối đa để người chơi xem hết
            if (adTimer) clearTimeout(adTimer);
            adTimer = setTimeout(() => {
              console.warn('[ADS] Quá thời gian tối đa phát video quảng cáo (90 giây)');
              finish(result || 'unavailable');
            }, 90000);
          },
          afterAd: () => {
            unmuteGame();
          },
          // Nút gọi tới đây (kho vũ khí / tiếp tế) đã ghi rõ "xem quảng cáo nhận ..." = người chơi đã chủ động chọn
          // -> phát ngay, không hỏi lại. Cần hộp xác nhận riêng thì truyền o.confirm = true.
          beforeReward: (showAdFn) => {
            offered = true;
            if (adTimer) clearTimeout(adTimer);
            adTimer = setTimeout(() => {
              console.warn('[ADS] Quá thời gian chờ sau khi sẵn sàng phát (60 giây)');
              finish(result || 'unavailable');
            }, 60000);

            if (!o.confirm) {
              showAdFn();
              return;
            }
            confirmBox(o.label).then((yes) => {
              if (yes) {
                showAdFn();
              } else {
                result = 'skip';
                finish('skip');
              }
            });
          },
          adDismissed: () => {
            result = 'skip';
          },
          adViewed: () => {
            result = 'done';
          },
          adBreakDone: (info) => {
            console.log('[ADS] Kết quả từ Google adBreakDone:', info && info.breakStatus);
            if (result) {
              finish(result);
            } else if (info && info.breakStatus === 'viewed') {
              finish('done');
            } else if (info && info.breakStatus === 'dismissed') {
              finish('skip');
            } else {
              // Bất kỳ trường hợp nào khác (notReady, error, timeout, noAdPreloaded, other)
              finish('unavailable');
            }
          }
        });
      } catch (e) {
        console.warn('[ADS] Ngoại lệ khi gọi adBreak:', e);
        finish('unavailable');
      }
    });
  }

  // ---------- Khung quảng cáo mẫu (chưa gắn mạng quảng cáo) ----------
  function showMock(o) {
    const sec = Math.max(1, o.sec || 15);
    return new Promise((resolve) => {
      muteGame();
      const el = document.createElement('div');
      el.className = 'eqp-ad';
      el.innerHTML = `<div class="eqp-ad-box"><div class="eqp-ad-top"><span><i class="ti ti-ad-2"></i> QUẢNG CÁO</span><b class="eqp-ad-left">${sec}</b></div>
        <div class="eqp-ad-stage"><i class="ti ti-tank"></i><p>Không gian quảng cáo</p><small>Xem hết để nhận: ${esc(o.label)}</small></div>
        <div class="eqp-ad-bar"><i></i></div>
        <div class="eqp-ad-actions"><button class="eqp-btn" data-ad="skip">BỎ QUA</button><button class="eqp-btn ad" data-ad="done" disabled><i class="ti ti-gift"></i> NHẬN</button></div></div>`;
      document.body.appendChild(el);
      const t0 = performance.now(), bar = el.querySelector('.eqp-ad-bar i'), left = el.querySelector('.eqp-ad-left'), done = el.querySelector('[data-ad="done"]');
      const tick = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        bar.style.width = (k * 100).toFixed(1) + '%';
        left.textContent = Math.max(0, Math.ceil(sec * (1 - k)));
        if (k >= 1) { clearInterval(tick); done.disabled = false; left.innerHTML = '<i class="ti ti-check"></i>'; }
      }, 100);
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ad]');
        if (!b || b.disabled) return;
        clearInterval(tick);
        el.remove();
        unmuteGame();
        resolve(b.dataset.ad === 'done' ? 'done' : 'skip');
      });
    });
  }

  async function showRewarded(o = {}) {
    if (busy) return 'unavailable';
    busy = true;
    try {
      if (useH5()) {
        const r = await showH5(o);
        if (r === 'done' || r === 'skip') return r;
        // Nếu Google không có quảng cáo hoặc bị lỗi/chặn mà cấu hình cho phép khung mẫu thì dự phòng
        if (C.allowMock) {
          console.warn('[ADS] Quảng cáo Google không sẵn sàng, tự động chuyển sang khung mẫu dự phòng');
          return await showMock(o);
        }
        return 'unavailable';
      }
      if (useMock()) return await showMock(o);
      return 'unavailable';
    } finally { busy = false; }
  }

  // Kiểm tra trạng thái hiện tại của hệ thống quảng cáo
  function checkStatus() {
    const script = document.querySelector('script[src*="adsbygoogle.js"]');
    const isLoaded = !!(window.adsbygoogle && window.adsbygoogle.loaded);
    const info = {
      h5Client: C.h5Client || '(trống)',
      h5Test: !!C.h5Test,
      allowMock: !!C.allowMock,
      scriptInDom: !!script,
      sdkLoaded: isLoaded,
      adBreakFunctionReady: typeof window.adBreak === 'function'
    };
    console.table(info);
    return info;
  }

  // Thử gọi quảng cáo trực tiếp để kiểm tra phản hồi
  async function test() {
    console.log('[ADS TEST] Bắt đầu gọi thử quảng cáo...');
    checkStatus();
    const res = await showRewarded({ name: 'test_ad', label: 'Thử nghiệm', sec: 5 });
    console.log('[ADS TEST] Kết quả kiểm tra:', res);
    return res;
  }

  // Có thể phát quảng cáo không (để ẩn nút khi đã tắt quảng cáo)
  const available = () => useH5() || useMock();
  if (useH5()) loadH5();   // nạp sẵn để quảng cáo đầu tiên có ngay

  // Giao diện cũ: show({ onDone, onFail })
  function show(o) { showRewarded(o).then(r => (r === 'done' ? o.onDone && o.onDone() : o.onFail && o.onFail())); }

  return { showRewarded, show, available, config: C, checkStatus, test };
})();
window.AdProvider = AdProvider;
