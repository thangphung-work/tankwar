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
      { icon: 'stack-2', name: 'Đa dạng đạn', desc: 'Đạn đa năng, xuyên giáp, nổ mạnh — đổi theo mục tiêu', key: '1·2·3' },
      { icon: 'tool', name: 'Đa dạng trang bị', desc: 'Lắp thêm nóc tháp, động cơ, giáp — tùy lối chơi' },
      { icon: 'leaf', name: 'Núp bụi giảm radar', desc: 'Radar địch phải vào gần mới bắt được' }
    ],
    GATLING: [
      { icon: 'drone-off', name: 'Phòng không', desc: 'Khóa và bắn hạ drone địch', key: 'F' },
      { icon: 'bulldozer', name: 'Ủi đất che chắn', desc: 'Đắp ụ đất làm công sự chắn đạn cho đội' },
      { icon: 'flame', name: 'Sát thương tích lũy', desc: 'Xả đạn liên tục, càng bắn lâu địch càng nát', key: '2' }
    ],
    ARTILLERY: [
      { icon: 'drone', name: 'Phóng drone', desc: 'Soi địch cho cả đội, ngắm bắn qua camera drone', key: 'Ctrl' },
      { icon: 'chart-arcs', name: 'Tầm bắn xa nhất', desc: 'Bắn cầu vồng qua đồi, xa tới 3.300 m' },
      { icon: 'grain', name: 'Hỏa lực hạng nặng', desc: 'Lựu pháo 155mm, đạn chùm phủ cả vùng', key: '2' }
    ],
    SCOUT: [
      { icon: 'eye', name: 'Trinh sát, du kích', desc: 'Soi địch cho cả đội, đánh nhanh rút gọn' },
      { icon: 'rocket', name: 'Hỏa lực chống tăng', desc: 'Tên lửa tự bay tới xe địch xa 2 km', key: '3' },
      { icon: 'gauge', name: 'Tầm nhìn xa, tốc độ cao', desc: '85 km/h, tầm nhìn xa nhất trận, có radar' }
    ]
  };

  function $(sel) { return document.querySelector(sel); }

  const decoded = {};   // ảnh xe lớn đã giải mã sẵn theo src (giữ tham chiếu để trình duyệt không bỏ bản giải mã)

  function renderHero() {
    const card = $('.mm-class-card.active') || $('.mm-class-card');
    if (!card) return;
    const img = $('#mm-hero-img');
    const photo = card.querySelector('.card-tank-photo');
    const name = card.querySelector('.card-tank-name');
    const desc = card.querySelector('.card-tank-desc');
    const type = card.getAttribute('data-tank-type');

    const src = photo && photo.getAttribute('src');
    if (img && photo && img.getAttribute('src') !== src && img.dataset.want !== src) {
      img.dataset.want = src;
      const alt = photo.getAttribute('alt') || '';
      const swap = () => {
        if (img.dataset.want !== src) return;   // đã bấm sang xe khác trong lúc chờ giải mã
        img.setAttribute('src', src);
        img.setAttribute('alt', alt);
        // chạy lại hiệu ứng hiện ảnh
        img.style.animation = 'none';
        void img.offsetWidth;
        img.style.animation = '';
      };
      // giải mã ảnh lớn ở luồng phụ trước rồi mới đổi (đổi thẳng src = giải mã đồng bộ lúc vẽ -> khựng khi bấm đổi xe)
      const pre = decoded[src] || (decoded[src] = new Image());
      if (!pre.src) pre.src = src;
      if (pre.decode) pre.decode().then(swap, swap); else swap();
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
          : '<li class="empty">Chưa lắp — bấm TRANG BỊ để lắp trang bị</li>';
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
    // giải mã sẵn ảnh lớn của cả 4 xe lúc rảnh -> lần đầu bấm đổi xe cũng hiện ngay
    const warm = () => document.querySelectorAll('.mm-class-card .card-tank-photo').forEach(p => {
      const s = p.getAttribute('src');
      if (!s || decoded[s]) return;
      const im = decoded[s] = new Image();
      im.src = s;
      if (im.decode) im.decode().catch(() => {});
    });
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1000);
    // lắp / tháo / mua trang bị, đăng nhập / đăng xuất -> cập nhật hàng trang bị
    window.addEventListener('armory-changed', () => { renderHero(); fitHero(); });
  }

  // Script nạp sớm (ngay sau phần HTML sảnh) nên vẽ luôn, không chờ cả đống script game phía sau;
  // tới DOMContentLoaded vẽ lại để hàng trang bị có dữ liệu tài khoản
  if ($('.hero-info')) {
    init();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { renderHero(); fitHero(); });
  } else document.addEventListener('DOMContentLoaded', init);
})();
