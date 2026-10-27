// Hiệu ứng ĐÓNG bảng dùng chung (mở bảng đã có trong theme.css).
// Mọi bảng đóng bằng classList.add('hidden') -> theo dõi class, gắn thêm 'tc-closing' để bảng còn hiện thêm
// ~0.18 s chạy hiệu ứng thu lại rồi mới ẩn hẳn. 'hidden' vẫn có ngay lập tức nên mọi chỗ kiểm tra
// "bảng đã đóng chưa" (Esc, isOpen…) vẫn đúng; .tc-closing không nhận chuột.

// Đổi view bên trong 1 bảng (tab xe, nhóm trang bị…): gắn lại .tc-swap để nội dung mới trượt vào (CSS ở theme.css).
// Gỡ class sau khi chạy xong để những lần dựng lại nội dung về sau (mua, đổi số lượng…) không lặp hiệu ứng.
window.tcSwap = function (el, ms) {
  if (!el) return;
  el.classList.remove('tc-swap');
  void el.offsetWidth;   // ép trình duyệt nhận lần gỡ class, để animation chạy lại từ đầu
  el.classList.add('tc-swap');
  clearTimeout(el._tcSwapT);
  el._tcSwapT = setTimeout(() => el.classList.remove('tc-swap'), ms || 450);
};
window.tcSwapStop = function (el) {
  if (!el) return;
  clearTimeout(el._tcSwapT);
  el.classList.remove('tc-swap');
};

(function () {
  const SEL ='.acc-overlay, .gm-overlay, .tank-inspector-overlay, .tactical-map-overlay, .game-over-screen';
  const DUR = 190;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof MutationObserver === 'undefined') return;

  function onClass(el, wasHidden) {
    const isHidden = el.classList.contains('hidden');
    if (isHidden && !wasHidden) {
      el.classList.add('tc-closing');
      clearTimeout(el._tcCloseT);
      el._tcCloseT = setTimeout(() => el.classList.remove('tc-closing'), DUR);
    } else if (!isHidden && el.classList.contains('tc-closing')) {
      clearTimeout(el._tcCloseT);
      el.classList.remove('tc-closing');   // mở lại giữa chừng: thôi hiệu ứng đóng
    }
  }

  function init() {
    new MutationObserver(list => {
      for (const m of list) {
        const el = m.target;
        if (m.attributeName !== 'class' || !el.matches || !el.matches(SEL)) continue;
        const was = /(^|\s)hidden(\s|$)/.test(m.oldValue || '');
        // bỏ qua chính thay đổi tc-closing của mình
        if (was === el.classList.contains('hidden')) {
          if (!was && el.classList.contains('tc-closing')) onClass(el, was);
          continue;
        }
        onClass(el, was);
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
