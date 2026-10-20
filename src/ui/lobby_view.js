// Sảnh chờ: khối "xe đang chọn" luôn khớp thẻ xe đang .active.
// Theo dõi thay đổi class (matchmaking.js, account.js và tank_inspector.js đều đổi .active theo cách riêng).
(function () {
  const STATS = [
    { key: 'armor', label: 'GIÁP', icon: 'ti-shield' },
    { key: 'fire', label: 'HỎA LỰC', icon: 'ti-flame' },
    { key: 'range', label: 'TẦM BẮN', icon: 'ti-target' },
    { key: 'speed', label: 'CƠ ĐỘNG', icon: 'ti-bolt' }
  ];

  // Kỹ năng riêng của từng xe (đều là cơ chế có thật trong trận) — lời lẽ ngắn, dễ hiểu
  const SKILLS = {
    ALL_ROUNDER: [
      { icon: 'arrow-big-right-lines', name: 'Đạn xuyên giáp', desc: 'Xuyên được cả giáp dày nhất', key: '3' },
      { icon: 'shield-half', name: 'Giáp mũi dày', desc: 'Quay mũi xe về phía địch để chịu đòn' },
      { icon: 'crosshair', name: 'Bắn thẳng tầm xa', desc: 'Trúng mục tiêu cách tới khoảng 3,4 km' }
    ],
    GATLING: [
      { icon: 'bolt', name: 'Xả đạn liên hồi', desc: 'Giữ để xả 1.800 phát mỗi phút', key: 'Space' },
      { icon: 'temperature', name: 'Nòng nóng đỏ', desc: 'Bắn liền lâu phải nghỉ cho nguội' },
      { icon: 'shield-check', name: 'Gạch giáp phản ứng', desc: 'Kích nổ đạn trước khi chạm giáp' }
    ],
    ARTILLERY: [
      { icon: 'chart-arcs', name: 'Bắn cầu vồng', desc: 'Bay vòng qua đồi, tầm 440–3.300 m' },
      { icon: 'anchor', name: 'Hạ chân chống', desc: 'Đứng yên 2 giây để bắn vững hơn' },
      { icon: 'grain', name: 'Đạn chùm', desc: 'Nổ trên đầu, rải mảnh rộng', key: '2' }
    ],
    SCOUT: [
      { icon: 'radar-2', name: 'Radar dò tìm', desc: 'Lộ xe địch núp trong bụi cho cả đội' },
      { icon: 'rocket', name: 'Tên lửa chống tăng', desc: 'Tự bay tới xe địch xa 2 km', key: 'F' },
      { icon: 'gauge', name: 'Nhanh nhất trận', desc: '100 km/h, chiếm cứ điểm trống trước' }
    ]
  };

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

    const skillsEl = $('#mm-hero-skills');
    if (skillsEl && skillsEl.dataset.type !== type) {
      skillsEl.dataset.type = type;
      skillsEl.innerHTML = (SKILLS[type] || []).map(k =>
        `<li title="${k.name}: ${k.desc}"><i class="ti ti-${k.icon} hero-skill-ic" aria-hidden="true"></i>` +
        `<span class="hero-skill-txt"><b>${k.name}</b><small>${k.desc}</small></span>` +
        (k.key ? `<kbd title="Phím tắt">${k.key}</kbd>` : '') + '</li>').join('');
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

  // Cột thông tin cao cố định theo khung sảnh: màn thấp thì co khối kỹ năng dần cho vừa
  // 0 đầy đủ · 1 bỏ mô tả · 2 kỹ năng thành hàng chip, ẩn "cách chơi" · 3 ẩn kỹ năng
  function fitHero() {
    const info = $('.hero-info');
    if (!info) return;
    for (let lvl = 0; lvl <= 3; lvl++) {
      info.dataset.fit = lvl;
      if (info.scrollHeight <= info.clientHeight + 1) break;
    }
  }

  function init() {
    renderHero();
    fitHero();
    const info = $('.hero-info');
    if (info && window.ResizeObserver) new ResizeObserver(fitHero).observe(info);
    // phông chữ tải xong làm chữ cao lên -> tính lại mức co gọn
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHero);

    const watch = (root, fn) => {
      if (!root) return;
      new MutationObserver(fn).observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
    };
    watch($('.mm-class-cards-grid'), () => { renderHero(); fitHero(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
