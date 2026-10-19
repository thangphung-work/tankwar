// Sảnh chờ: khối "xe đang chọn" luôn khớp thẻ xe đang .active.
// Theo dõi thay đổi class (matchmaking.js, account.js và tank_inspector.js đều đổi .active theo cách riêng).
(function () {
  const STATS = [
    { key: 'armor', label: 'GIÁP', icon: 'ti-shield' },
    { key: 'fire', label: 'HỎA LỰC', icon: 'ti-flame' },
    { key: 'range', label: 'TẦM BẮN', icon: 'ti-target' },
    { key: 'speed', label: 'CƠ ĐỘNG', icon: 'ti-bolt' }
  ];

  function $(sel) { return document.querySelector(sel); }

  function renderHero() {
    const card = $('.mm-class-card.active') || $('.mm-class-card');
    if (!card) return;
    const img = $('#mm-hero-img');
    const photo = card.querySelector('.card-tank-photo');
    const name = card.querySelector('.card-tank-name');
    const desc = card.querySelector('.card-tank-desc');
    const type = card.getAttribute('data-tank-type');

    if (img && photo && img.getAttribute('src') !== photo.getAttribute('src')) {
      img.setAttribute('src', photo.getAttribute('src'));
      img.setAttribute('alt', photo.getAttribute('alt') || '');
      // chạy lại hiệu ứng hiện ảnh
      img.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
    }
    const roleEl = $('#mm-hero-role'), nameEl = $('#mm-hero-name'), descEl = $('#mm-hero-desc');
    if (roleEl) roleEl.textContent = card.getAttribute('data-role') || '';
    if (nameEl && name) nameEl.textContent = name.textContent;
    if (descEl && desc) descEl.textContent = desc.textContent;

    const tipsEl = $('#mm-hero-tips');
    if (tipsEl) {
      tipsEl.innerHTML = '';
      (card.getAttribute('data-tips') || '').split('|').filter(Boolean).forEach(t => {
        const li = document.createElement('li');
        li.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';
        li.appendChild(document.createTextNode(t));
        tipsEl.appendChild(li);
      });
    }

    const statsEl = $('#mm-hero-stats');
    if (statsEl && statsEl.dataset.type !== type) {
      statsEl.dataset.type = type;
      statsEl.innerHTML = STATS.map(s => {
        const v = Math.max(0, Math.min(5, parseInt(card.getAttribute('data-' + s.key), 10) || 0));
        let pips = '';
        for (let i = 0; i < 5; i++) {
          const cls = i < v ? (v === 5 ? 'on max' : 'on') : '';
          pips += `<i class="${cls}" style="animation-delay:${i * 40}ms"></i>`;
        }
        return `<div class="hero-stat"><span class="hero-stat-lbl"><i class="ti ${s.icon}" aria-hidden="true"></i> ${s.label}</span><span class="hero-stat-pips">${pips}</span></div>`;
      }).join('');
    }
  }

  function init() {
    renderHero();

    const watch = (root, fn) => {
      if (!root) return;
      new MutationObserver(fn).observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
    };
    watch($('.mm-class-cards-grid'), renderHero);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
