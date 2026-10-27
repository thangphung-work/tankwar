/**
 * NẠP BẠC (tiền thật qua PayPal)
 * - Nút "+ NẠP" cạnh số Bạc (thẻ chỉ huy góc sảnh + bảng hồ sơ) -> cửa sổ chọn gói (Equipment.TOPUP).
 * - Bấm giá: máy chủ tạo đơn PayPal (POST /api/pay/checkout) -> chuyển sang trang duyệt thanh toán của PayPal.
 * - Quay về ?pay=success&token=<mã đơn>: máy chủ chốt đơn (POST /api/pay/verify) -> cộng Bạc, hiện thông báo; ?pay=cancel: báo đã hủy.
 * Máy chủ mới là nơi cộng Bạc (webhook PayPal / chốt đơn), máy khách chỉ hiển thị.
 */
(() => {
  if (typeof document === 'undefined' || typeof Equipment === 'undefined' || !Equipment.TOPUP) return;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.Account;
  const fmt = (n) => Math.round(n || 0).toLocaleString('vi-VN');
  const usd = (v) => '$' + v.toFixed(2);
  const sfx = (fn, ...a) => { const s = window.soundEngine; if (s && s[fn]) { try { s[fn](...a); } catch (e) { /* bỏ qua */ } } };
  const T = Equipment.TOPUP;
  const BASE_RATE = T.PACKS.filter(p => !p.once).reduce((m, p) => Math.min(m, Equipment.topupGrant(p, false).silver / p.usd), Infinity);

  let overlay, busy = false;
  const prof = () => A() && A().profile;
  const bought = (id) => { const p = prof(); return (p && p.pay && p.pay.bought && p.pay.bought[id]) || 0; };

  // quy Bạc ra món trong game cho dễ hình dung
  const ADV = (() => {
    const a = Equipment.spinItems().filter(i => !i.engine).map(i => Equipment.priceOf(i.id));
    return a.reduce((s, v) => s + v, 0) / a.length;
  })();
  const ENGINES = Object.keys(Equipment.MODULES).filter(id => Equipment.MODULES[id].cat === 'engine' && Equipment.MODULES[id].price > 0)
    .map(id => ({ id, name: Equipment.MODULES[id].name, price: Equipment.MODULES[id].price })).sort((a, b) => b.price - a.price);
  function worth(silver) {
    const eng = ENGINES.find(e => e.price <= silver);
    if (eng) return `Đủ mua ${eng.name.toLowerCase()}`;
    const n = Math.floor(silver / ADV);
    return n >= 1 ? `≈ ${n} trang bị nâng cao` : `≈ ${Math.max(1, Math.round(silver / 1100))} trận đấu`;
  }

  function cardHtml(p) {
    const first = !bought(p.id), g = Equipment.topupGrant(p, first), base = Equipment.topupGrant(p, false);
    const rate = g.silver / p.usd, bonusPct = Math.round((base.silver / p.usd / BASE_RATE - 1) * 100);
    const cls = ['tp-card', p.tag === 'PHỔ BIẾN NHẤT' ? 'hot' : '', p.tag === 'LỜI NHẤT' ? 'best' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-pack="${p.id}">
      ${p.tag ? `<span class="tp-tag">${esc(p.tag)}</span>` : ''}
      <div class="tp-ico"><i class="ti ti-${p.icon}"></i></div>
      <div class="tp-name">${esc(p.name)}</div>
      <div class="tp-amount">${g.x2 ? `<s>${fmt(base.silver)}</s>` : ''}<b>${fmt(g.silver)}</b><span>Bạc</span></div>
      <div class="tp-perks">
        ${g.x2 ? `<span class="x2"><i class="ti ti-gift"></i> x2 Bạc lần mua đầu</span>` : ''}
        ${bonusPct > 0 ? `<span class="bonus"><i class="ti ti-trending-up"></i> +${bonusPct}% so với gói nhỏ</span>` : ''}
        ${g.spins ? `<span class="spins"><i class="ti ti-rotate-clockwise-2"></i> +${g.spins} lượt quay thưởng</span>` : ''}
      </div>
      <div class="tp-worth">${esc(worth(g.silver))}</div>
      <div class="tp-rate"><i style="width:${Math.min(100, Math.round(rate / 2700 * 100))}%"></i><span>${fmt(rate)} Bạc / $</span></div>
      <button type="button" class="tp-buy" data-buy="${p.id}">${usd(p.usd)}</button>
    </div>`;
  }

  function starterHtml(p) {
    const g = Equipment.topupGrant(p, true);
    const value = (g.silver + g.spins * 900) / BASE_RATE;   // ~900 Bạc / lượt quay (giá trị kỳ vọng)
    return `<div class="tp-starter" data-pack="${p.id}">
      <span class="tp-tag">${esc(p.tag || 'CHỈ 1 LẦN')}</span>
      <div class="tp-ico"><i class="ti ti-${p.icon}"></i></div>
      <div class="tp-st-txt">
        <b>${esc(p.name)}</b>
        <span><i class="ti ti-coins"></i> ${fmt(g.silver)} Bạc · <i class="ti ti-rotate-clockwise-2"></i> ${g.spins} lượt quay thưởng</span>
        <small>Giá trị ~${usd(value)} — gấp ${Math.round(value / p.usd)} lần giá, mỗi tài khoản chỉ mua được 1 lần</small>
      </div>
      <button type="button" class="tp-buy" data-buy="${p.id}">${usd(p.usd)}</button>
    </div>`;
  }

  function render(note) {
    const p = prof(), packs = T.PACKS.filter(x => !x.once), st = T.PACKS.find(x => x.once && !bought(x.id));
    $('.tp-body', overlay).innerHTML = `
      ${p ? '' : '<div class="tp-note warn"><i class="ti ti-user"></i> Đăng nhập để nạp Bạc vào tài khoản</div>'}
      ${note ? `<div class="tp-note ${note.ok ? 'ok' : 'warn'}">${note.html}</div>` : ''}
      ${st ? starterHtml(st) : ''}
      <div class="tp-grid">${packs.map(cardHtml).join('')}</div>
      <div class="tp-foot">
        <span><i class="ti ti-lock"></i> Thanh toán an toàn qua <b>PayPal</b> — tài khoản PayPal hoặc thẻ Visa / Mastercard. Trò chơi không lưu thông tin thẻ.</span>
        <span>Bạc cộng ngay khi thanh toán xong. Bạc là tiền trong trò chơi, không đổi lại thành tiền thật.${p && p.pay && p.pay.mock ? ' <b class="mock">CHẾ ĐỘ THỬ: thanh toán giả lập, không trừ tiền.</b>' : ''}${p && p.pay && p.pay.sandbox ? ' <b class="mock">CHẾ ĐỘ THỬ: PayPal Sandbox, không trừ tiền thật.</b>' : ''}</span>
      </div>`;
    overlay.querySelectorAll('[data-buy]').forEach(b => { b.disabled = !p || busy; });
  }

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'tp-overlay';
    overlay.className = 'tp-overlay hidden';
    overlay.innerHTML = `<div class="tp-panel" role="dialog" aria-label="Nạp Bạc">
      <button type="button" class="tp-close acc-close" title="Đóng"><i class="ti ti-x"></i></button>
      <div class="tp-head"><i class="ti ti-coins"></i><div><h2>NẠP BẠC</h2><p>Bạc dùng mở khóa trang bị, động cơ, mua đạn đặc chủng và sửa giáp</p></div>
        <span class="tp-wallet"></span></div>
      <div class="tp-body"></div>
    </div>`;
    document.body.appendChild(overlay);
    $('.tp-close', overlay).addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
    overlay.addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b && !b.disabled) buy(b.dataset.buy, b); });
    // nút "+ NẠP": bảng hồ sơ (account.js vẽ) + thẻ chỉ huy góc sảnh
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="topup"]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      open();
    }, true);
    const meta = $('#mm-cmd-meta');
    if (meta) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tp-add-mini'; b.dataset.act = 'topup'; b.title = 'Nạp Bạc';
      b.innerHTML = '<i class="ti ti-plus"></i>';
      const silver = $('.acc-silver', meta);
      if (silver) silver.after(b); else meta.appendChild(b);
    }
  }
  function wallet() {
    const p = prof(), w = $('.tp-wallet', overlay);
    w.innerHTML = p ? `<i class="ti ti-wallet"></i> ${fmt(p.silver)} Bạc` : '';
  }
  function open(note) {
    if (!overlay) return;
    const panel = $('#acc-panel');
    if (panel) panel.classList.add('hidden');
    overlay.classList.remove('hidden');
    sfx('playUiOpen');
    wallet();
    render(note);
  }
  function close() { overlay.classList.add('hidden'); }

  async function buy(id, btn) {
    const acc = A();
    if (!acc || !acc.profile) { close(); if (acc && acc.online) acc.showLogin(); return; }
    busy = true;
    overlay.querySelectorAll('[data-buy]').forEach(b => { b.disabled = true; });
    btn.innerHTML = '<i class="ti ti-loader-2 tp-spin"></i>';
    try {
      const r = await acc.api('pay/checkout', { pack: id });
      location.href = r.url;   // sang trang thanh toán PayPal (giả lập: quay về ngay với ?pay=success)
    } catch (e) {
      busy = false;
      sfx('playUiDenied');
      render({ ok: false, html: `<i class="ti ti-alert-triangle"></i> ${esc(e.message)}` });
    }
  }

  // quay về từ PayPal (?pay=success&token=<mã đơn>&PayerID=...)
  async function handleReturn() {
    const q = new URLSearchParams(location.search), st = q.get('pay');
    if (!st) return;
    const sid = q.get('token') || q.get('session_id');
    ['pay', 'session_id', 'token', 'PayerID'].forEach(k => q.delete(k));
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    if (st === 'cancel') { open({ ok: false, html: '<i class="ti ti-circle-x"></i> Đã hủy thanh toán — chưa trừ tiền.' }); return; }
    if (st !== 'success' || !sid) return;
    // chờ đăng nhập xong (Account tự lấy hồ sơ khi tải trang)
    for (let i = 0; i < 40 && !(A() && A().profile); i++) await new Promise(r => setTimeout(r, 250));
    const acc = A();
    if (!acc || !acc.profile) return;
    for (let tries = 0; tries < 6; tries++) {
      try {
        const r = await acc.api('pay/verify', { session_id: sid });
        if (r.profile) acc.applyProfile(r.profile);
        if (r.status === 'paid') {
          const pack = Equipment.topupPack(r.pack);
          sfx('playUiPurchase', false);
          if (window.DailySpin) DailySpin.refresh();
          open({ ok: true, html: `<i class="ti ti-circle-check"></i> Nạp thành công <b>${esc(pack ? pack.name : '')}</b>: +${fmt(r.silver)} Bạc${r.spins ? ` · +${r.spins} lượt quay thưởng` : ''}. Cảm ơn bạn đã ủng hộ!` });
          return;
        }
      } catch (e) {
        if (e.status === 404 || e.status === 402) { open({ ok: false, html: `<i class="ti ti-alert-triangle"></i> ${esc(e.message)}` }); return; }
      }
      await new Promise(r => setTimeout(r, 2000));   // thanh toán đang xử lý (vd ví điện tử chậm)
    }
    open({ ok: false, html: '<i class="ti ti-clock"></i> Thanh toán đang được xử lý — Bạc sẽ tự cộng khi PayPal xác nhận (tải lại trang sau ít phút).' });
  }

  function init() {
    build();
    handleReturn();
    // ẩn nút mini khi chưa đăng nhập / máy chủ chưa bật nạp
    setInterval(() => {
      const p = prof(), on = !!(p && p.pay && p.pay.enabled);
      document.querySelectorAll('.tp-add-mini').forEach(b => { b.hidden = !on; });
      if (overlay && !overlay.classList.contains('hidden')) wallet();
    }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TopUp = { open };
})();
