/**
 * Bộ icon giao diện (Tabler Icons webfont, lưu sẵn tại assets/vendor/tabler-icons — chạy được cả offline / file://)
 * - Chuỗi trong code ghi icon bằng token [[tên-icon]] hoặc [[tên-icon.lớp-màu]], ví dụ '[[alert-triangle]] Hết đạn!'
 * - UIIcons.html(str): escape chữ rồi đổi token thành <i class="ti ti-…"> (an toàn với tên người chơi từ mạng)
 * - UIIcons.set(el, str): gán nội dung có icon cho phần tử (bỏ qua nếu không đổi)
 * - UIIcons.strip(str): bỏ token (dùng cho chỗ chỉ nhận chữ thuần)
 * - UIIcons.glyph(name): ký tự của icon để vẽ lên canvas bằng font 'tabler-icons'
 */
(function (global) {
  const TOKEN = /\[\[([a-z0-9-]+)(?:\.([a-z0-9-]+))?\]\]/g;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  // Mã ký tự của các icon được vẽ trên canvas (lấy từ tabler-icons.min.css)
  const GLYPHS = { check: '', x: '', 'radar-2': '', lock: '' };

  const UIIcons = {
    FONT: 'tabler-icons',
    tag(name, cls) {
      return `<i class="ti ti-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"></i>`;
    },
    html(str) {
      return String(str).replace(/[&<>"']/g, c => ESC[c]).replace(TOKEN, (m, n, c) => this.tag(n, c));
    },
    set(el, str) {
      if (!el) return;
      if (el._iconRaw === str) return;
      el._iconRaw = str;
      el.innerHTML = this.html(str);
    },
    strip(str) {
      return String(str).replace(TOKEN, '').replace(/^\s+/, '');
    },
    glyph(name) {
      return GLYPHS[name] || '';
    }
  };

  // Nạp sẵn font icon để canvas vẽ được ngay khung hình đầu
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    try { document.fonts.load('16px "tabler-icons"'); } catch (e) {}
  }

  global.UIIcons = UIIcons;
})(typeof window !== 'undefined' ? window : globalThis);
