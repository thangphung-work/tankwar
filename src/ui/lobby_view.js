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
      { icon: 'stack-2', name: 'Đa dạng đạn', desc: 'Đạn thường, xuyên giáp, nổ mạnh — đổi theo mục tiêu', key: '1·2·3' },
      { icon: 'cloud', name: 'Thả khói', desc: 'Màn khói che mắt địch ~15 giây', key: 'G' },
      { icon: 'leaf', name: 'Núp bụi giảm radar', desc: 'Radar địch phải vào gần mới bắt được' }
    ],
    GATLING: [
      { icon: 'drone-off', name: 'Phòng không', desc: 'Khóa và bắn hạ drone trinh sát địch', key: 'F' },
      { icon: 'crosshair', name: 'Máy tính hỏa lực', desc: 'Nòng tự nâng, đón đầu mục tiêu kể cả trên trời', key: 'Tab' },
      { icon: 'flame', name: 'Đạn cháy 30mm', desc: 'Xe địch trúng đạn bốc cháy', key: '2' }
    ],
    ARTILLERY: [
      { icon: 'drone', name: 'Drone trinh sát', desc: 'Soi địch cho cả đội, ngắm bắn qua camera drone', key: 'Ctrl' },
      { icon: 'chart-arcs', name: 'Tầm bắn xa nhất', desc: 'Bắn cầu vồng qua đồi, xa tới 3.300 m' },
      { icon: 'grain', name: 'Hỏa lực hạng nặng', desc: 'Lựu pháo 155mm, đạn chùm phủ cả vùng', key: '2' }
    ],
    SCOUT: [
      { icon: 'leaf', name: 'Núp bụi', desc: 'Trong bụi, địch chỉ thấy khi tới thật gần' },
      { icon: 'rocket', name: 'Tên lửa chống tăng', desc: 'Tự bay tới xe địch xa 2 km', key: '3' },
      { icon: 'gauge', name: 'Nhanh & nhìn xa', desc: '85 km/h, tầm nhìn xa nhất trận, có radar' }
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

    // Trang bị đang lắp của xe này (có sẵn theo xe + món đã lắp + đạn cao cấp đã sở hữu): hàng ô biểu tượng
    const gearEl = $('#mm-hero-gear');
    if (gearEl) {
      const Eq = window.Equipment, Acc = window.Account;
      const items = [];
      if (Eq) {
        for (const id in Eq.MODULES) if (Eq.builtin && Eq.builtin(type, id)) items.push({ icon: Eq.MODULES[id].icon, name: Eq.MODULES[id].name, built: true });
        const lo = Acc && Acc.loadoutOf ? Acc.loadoutOf(type) : { m: [] };
        for (const id of lo.m || []) {
          const M = Eq.MODULES[id];
          if (M && !(Eq.builtin && Eq.builtin(type, id))) items.push({ icon: M.icon, name: M.name });
        }
        const kit = Acc && Acc.kitFor ? Acc.kitFor(type).kit : null;
        for (const id of (kit && kit.p) || []) { const P = Eq.PREMIUM[id]; if (P) items.push({ icon: P.icon, name: P.name, ammo: true }); }
      }
      const sig = type + '|' + items.map(i => i.name).join(',');
      if (gearEl.dataset.sig !== sig) {
        gearEl.dataset.sig = sig;
        gearEl.innerHTML = items.length
          ? items.map(i => `<li class="${i.built ? 'built' : i.ammo ? 'ammo' : ''}" title="${i.name}${i.built ? ' (có sẵn theo xe)' : ''}"><i class="ti ti-${i.icon}" aria-hidden="true"></i><span>${i.name}${i.built ? ' <em>có sẵn</em>' : ''}</span></li>`).join('')
          : '<li class="empty">Chưa lắp — bấm XEM MÔ HÌNH 3D để lắp trang bị</li>';
      }
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
  // 0 đầy đủ · 1 bỏ mô tả · 2 kỹ năng thành hàng chip · 3 ẩn kỹ năng
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
    // lắp / tháo / mua trang bị, đăng nhập / đăng xuất -> cập nhật hàng trang bị
    window.addEventListener('armory-changed', () => { renderHero(); fitHero(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
