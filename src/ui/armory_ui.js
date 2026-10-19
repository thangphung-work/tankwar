/**
 * KHO VŨ KHÍ trong phòng xem xe (tank_inspector.js): các tab bên trái
 *   THÔNG TIN  — bảng thông số có sẵn
 *   NÂNG CẤP   — cửa hàng: trang bị cho xe, đạn cao cấp, đạn mang thêm (trả bằng Bạc)
 *   TRANG BỊ   — lắp / tháo trang bị vào 3 ô, chọn số đạn mua thêm mang theo mỗi lần xuất kích
 *   LỊCH SỬ    — các trận gần đây của tài khoản
 * Mô hình 3D trong phòng xem luôn hiện đúng bộ trang bị đang lắp của xe.
 */
const ArmoryUI = (() => {
  let insp = null, pane = 'info', saveTimer = null, busy = false, msg = '';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const E = () => (typeof Equipment !== 'undefined' ? Equipment : null);
  const A = () => window.Account || null;
  const prof = () => (A() && A().profile) || null;
  const fmt = (n) => Math.round(n || 0).toLocaleString('vi-VN');
  const TANK_NAMES = { ALL_ROUNDER: 'HALBERD MK.3', GATLING: 'HAILSTORM R6', ARTILLERY: 'ARBALEST 155', SCOUT: 'MARTEN R4' };
  const MAP_NAMES = { DESERT: 'Sa mạc lửa', URBAN: 'Đô thị đổ nát', JUNGLE: 'Rừng rậm', HIGHLAND: 'Cao nguyên', RIVER_LAKE: 'Sông hồ' };

  // ---------------------------------------------------------------------------
  // GẮN VÀO PHÒNG XEM XE
  // ---------------------------------------------------------------------------
  function attach(inspector) {
    insp = inspector;
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay || overlay._armory) return;
    overlay._armory = true;
    // Ví Bạc thật thay cho 2 ô tiền minh họa
    const acts = $('.ti-header-actions', overlay);
    if (acts) {
      acts.querySelectorAll('.ti-currency').forEach(el => el.remove());
      const w = document.createElement('div');
      w.className = 'ti-currency gold arm-wallet';
      w.title = 'Bạc: nhận sau mỗi trận, dùng mua trang bị & đạn';
      w.innerHTML = '<span><i class="ti ti-coins" aria-hidden="true"></i></span><b class="arm-silver">—</b>';
      acts.insertBefore(w, acts.firstChild);
    }
    // Tab bên trái: gán tên, bỏ SƠN / SKIN (chưa có)
    const nav = $('.ti-side-nav', overlay);
    if (nav) {
      const keys = ['info', 'shop', 'skin', 'loadout', 'history'];
      Array.from(nav.querySelectorAll('button')).forEach((b, i) => {
        const k = keys[i];
        if (k === 'skin') { b.remove(); return; }
        b.dataset.pane = k;
        b.addEventListener('click', () => show(k));
      });
    }
    // Bọc nội dung thông số cũ thành 1 "trang"; thêm trang cửa hàng / trang bị / lịch sử
    const aside = $('.ti-spec-panel', overlay);
    if (aside) {
      const info = document.createElement('div');
      info.className = 'arm-pane'; info.dataset.pane = 'info';
      while (aside.firstChild) info.appendChild(aside.firstChild);
      aside.appendChild(info);
      const other = document.createElement('div');
      other.className = 'arm-pane arm-body hidden'; other.dataset.pane = 'other';
      aside.appendChild(other);
      other.addEventListener('click', onClick);
    }
    window.addEventListener('armory-changed', () => { if (insp && insp.isOpen) { refreshWallet(); render(); } });
  }

  function show(k) {
    pane = k;
    msg = '';
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.ti-side-nav button').forEach(b => b.classList.toggle('active', b.dataset.pane === k));
    const info = overlay.querySelector('.arm-pane[data-pane="info"]'), other = overlay.querySelector('.arm-pane[data-pane="other"]');
    if (info) info.classList.toggle('hidden', k !== 'info');
    if (other) other.classList.toggle('hidden', k === 'info');
    const title = overlay.querySelector('.ti-main-title');
    if (title) title.textContent = { info: 'THÔNG TIN XE TĂNG', shop: 'NÂNG CẤP — CỬA HÀNG', loadout: 'TRANG BỊ CHO XE', history: 'LỊCH SỬ TRẬN ĐẤU' }[k] || 'THÔNG TIN XE TĂNG';
    render();
  }

  // Phòng xem vừa dựng xe mới: lắp bộ trang bị đang dùng để xem trước, vẽ lại trang hiện tại
  function onTankLoaded(inspector, tank) {
    insp = inspector;
    const u = inspector.activeUnit, Eq = E();
    if (u && Eq) {
      const k = A() && A().kitFor ? A().kitFor(tank).kit : null;
      if (k && k.m.length) {
        Eq.equip(u, k, null);
        u.apAmmoCount = u.heAmmoCount = u.clusterAmmoCount = u.incendiaryAmmoCount = u.missileAmmoCount = u.rpgAmmoCount = 9999;
      }
    }
    refreshWallet();
    render();
  }
  // Dựng lại mô hình xem trước (sau khi đổi trang bị)
  function rebuildPreview() {
    if (insp && insp.isOpen && insp.loadTankModel) insp.loadTankModel(insp.currentTankType, insp.currentTeam);
  }

  function refreshWallet() {
    const el = $('#tank-inspector-overlay .arm-silver');
    const p = prof();
    if (el) el.textContent = p ? fmt(p.silver) : '—';
  }

  // ---------------------------------------------------------------------------
  // VẼ TRANG
  // ---------------------------------------------------------------------------
  function render() {
    const root = $('#tank-inspector-overlay .arm-pane[data-pane="other"]');
    if (!root || pane === 'info' || !insp) return;
    const tank = insp.currentTankType || 'ALL_ROUNDER';
    const Eq = E(), Acc = A(), p = prof();
    let html = `<div class="arm-tank">${esc(TANK_NAMES[tank] || tank)}</div>`;
    if (!Eq) { root.innerHTML = html + '<p class="arm-note">Thiếu dữ liệu trang bị.</p>'; return; }
    if (pane !== 'history' && !p) {
      root.innerHTML = html + (Acc && Acc.online
        ? '<div class="arm-login"><p>Đăng nhập để nhận Bạc sau mỗi trận và mua trang bị cho xe.</p><button class="arm-btn primary" data-act="login"><i class="ti ti-login"></i> ĐĂNG NHẬP</button></div>'
        : '<div class="arm-login"><p>Cửa hàng cần mở trò chơi qua máy chủ (chạy start.bat), không mở trực tiếp tệp index.html.</p></div>');
      return;
    }
    if (pane === 'shop') html += renderShop(tank, p, Eq);
    else if (pane === 'loadout') html += renderLoadout(tank, p, Eq);
    else if (pane === 'history') html += renderHistory(p);
    root.innerHTML = html;
  }

  function moduleCard(id, M, owned, equipped, silver, mode) {
    let action;
    if (mode === 'shop') {
      if (owned) action = `<span class="arm-tag ok"><i class="ti ti-check"></i> ${equipped ? 'ĐANG LẮP' : 'ĐÃ CÓ'}</span>`;
      else if (silver < M.price) action = `<button class="arm-btn" disabled title="Thiếu ${fmt(M.price - silver)} Bạc"><i class="ti ti-coins"></i> ${fmt(M.price)}</button>`;
      else action = `<button class="arm-btn buy" data-act="buy" data-item="${id}"><i class="ti ti-coins"></i> ${fmt(M.price)}</button>`;
    } else {
      action = equipped
        ? `<button class="arm-btn" data-act="unequip" data-item="${id}"><i class="ti ti-minus"></i> THÁO</button>`
        : `<button class="arm-btn primary" data-act="equip" data-item="${id}"><i class="ti ti-plus"></i> LẮP</button>`;
    }
    return `<div class="arm-card${equipped ? ' on' : ''}"><span class="arm-ico"><i class="ti ti-${M.icon || 'box'}"></i></span>
      <div class="arm-info"><b>${esc(M.name)}</b><p>${esc(M.desc)}</p></div><div class="arm-act">${action}</div></div>`;
  }

  function renderShop(tank, p, Eq) {
    const kit = A().kitFor(tank).kit || { m: [] };
    const owned = (p.armory.owned && p.armory.owned[tank]) || [];
    const stock = (p.armory.stock && p.armory.stock[tank]) || {};
    let h = `<div class="arm-wallet-line"><i class="ti ti-coins"></i> Bạn có <b>${fmt(p.silver)} Bạc</b> · nhận thêm sau mỗi trận (thắng, hạ gục, gây sát thương càng nhiều càng được nhiều)</div>`;
    if (msg) h += `<div class="arm-msg">${msg}</div>`;
    h += '<h4 class="arm-sec"><i class="ti ti-shield"></i> TRANG BỊ CHO XE</h4>';
    for (const id in Eq.MODULES) {
      if (!Eq.compatible(id, tank)) continue;
      h += moduleCard(id, Eq.MODULES[id], owned.includes(id), kit.m.includes(id), p.silver, 'shop');
    }
    const prem = Object.keys(Eq.PREMIUM).filter(id => Eq.PREMIUM[id].tank === tank);
    if (prem.length) {
      h += '<h4 class="arm-sec"><i class="ti ti-star"></i> ĐẠN CAO CẤP <small>mua 1 lần, luôn dùng</small></h4>';
      for (const id of prem) h += moduleCard(id, Eq.PREMIUM[id], owned.includes(id), owned.includes(id), p.silver, 'shop');
    }
    const shop = Eq.AMMO_SHOP[tank] || {};
    if (Object.keys(shop).length) {
      h += '<h4 class="arm-sec"><i class="ti ti-box"></i> ĐẠN MANG THÊM <small>bắn hết đạn miễn phí mới dùng tới đạn mua</small></h4>';
      for (const k in shop) {
        const S = shop[k], cost = S.price * S.pack;
        h += `<div class="arm-card"><span class="arm-ico"><i class="ti ti-bullet"></i></span>
          <div class="arm-info"><b>${esc(S.name)}</b><p>Trong kho: <b>${fmt(stock[k] || 0)}</b> viên · mang thêm tối đa ${S.max} viên mỗi lần xuất kích</p></div>
          <div class="arm-act">${p.silver >= cost
            ? `<button class="arm-btn buy" data-act="ammo" data-item="${k}">+${S.pack} viên · ${fmt(cost)}</button>`
            : `<button class="arm-btn" disabled title="Thiếu ${fmt(cost - p.silver)} Bạc">+${S.pack} viên · ${fmt(cost)}</button>`}</div></div>`;
      }
    }
    return h;
  }

  function renderLoadout(tank, p, Eq) {
    const lo = (p.armory.loadouts && p.armory.loadouts[tank]) || { m: [], a: {} };
    const owned = (p.armory.owned && p.armory.owned[tank]) || [];
    const stock = (p.armory.stock && p.armory.stock[tank]) || {};
    const mods = owned.filter(id => Eq.MODULES[id]);
    let h = msg ? `<div class="arm-msg">${msg}</div>` : '';
    h += `<h4 class="arm-sec"><i class="ti ti-layout-grid"></i> Ô TRANG BỊ <small>${lo.m.length}/${Eq.SLOTS}</small></h4><div class="arm-slots">`;
    for (let i = 0; i < Eq.SLOTS; i++) {
      const id = lo.m[i], M = id && Eq.MODULES[id];
      h += M ? `<button class="arm-slot on" data-act="unequip" data-item="${id}" title="Bấm để tháo"><i class="ti ti-${M.icon}"></i><span>${esc(M.name)}</span></button>`
        : '<div class="arm-slot"><i class="ti ti-plus"></i><span>Ô trống</span></div>';
    }
    h += '</div>';
    h += '<h4 class="arm-sec"><i class="ti ti-package"></i> ĐỒ ĐÃ CÓ</h4>';
    if (!mods.length) h += '<p class="arm-note">Chưa có trang bị nào cho xe này — mua ở mục <b>NÂNG CẤP</b>.</p>';
    for (const id of mods) h += moduleCard(id, Eq.MODULES[id], true, lo.m.includes(id), p.silver, 'loadout');
    const prem = owned.filter(id => Eq.PREMIUM[id]);
    if (prem.length) h += `<p class="arm-note"><i class="ti ti-star"></i> Đạn cao cấp luôn dùng: ${prem.map(id => esc(Eq.PREMIUM[id].name)).join(', ')}</p>`;
    const shop = Eq.AMMO_SHOP[tank] || {}, base = Eq.BASE_AMMO[tank] || {};
    if (Object.keys(shop).length) {
      h += '<h4 class="arm-sec"><i class="ti ti-box"></i> ĐẠN MANG THEO MỖI LẦN XUẤT KÍCH</h4>';
      for (const k in shop) {
        const S = shop[k], have = stock[k] || 0, cap = Math.min(S.max, have), n = Math.min(lo.a[k] || 0, cap);
        h += `<div class="arm-ammo-row"><div><b>${esc(S.name)}</b><small>${base[k] || 0} viên miễn phí + mua thêm (kho còn ${fmt(have)})</small></div>
          <div class="arm-stepper"><button class="arm-btn" data-act="dec" data-item="${k}" ${n <= 0 ? 'disabled' : ''}>−</button><b>${n}</b>
          <button class="arm-btn" data-act="inc" data-item="${k}" ${n >= cap ? 'disabled' : ''}>+</button></div></div>`;
      }
    }
    h += '<p class="arm-note">Lắp xong là dùng luôn ở trận tới. Giáp nặng làm xe chậm đi một chút. Phím <b>G</b> trong trận: phóng lựu đạn khói.</p>';
    return h;
  }

  function renderHistory(p) {
    if (!p) return '<p class="arm-note">Đăng nhập để lưu và xem lại các trận đã chơi.</p>';
    const hist = (p.history || []).slice().reverse();
    if (!hist.length) return '<p class="arm-note">Chưa có trận nào — xuất trận thôi!</p>';
    const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
    let h = '<table class="arm-hist"><tr><th>Kết quả</th><th>Xe</th><th>Bản đồ</th><th>Hạ / Chết</th><th>Kinh nghiệm</th><th></th></tr>';
    for (const r of hist) {
      h += `<tr class="r-${r.result}"><td>${r.result === 'win' ? 'Thắng' : r.result === 'draw' ? 'Hòa' : 'Thua'}</td><td>${esc(TANK_NAMES[r.tank] || r.tank)}</td>
        <td>${esc(MAP_NAMES[r.map] || '—')}</td><td>${r.kills} / ${r.deaths || 0}</td><td>+${r.xp}</td><td class="t">${ago(r.t)}</td></tr>`;
    }
    return h + '</table>';
  }

  // ---------------------------------------------------------------------------
  // HÀNH ĐỘNG
  // ---------------------------------------------------------------------------
  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || busy) return;
    const act = b.dataset.act, id = b.dataset.item, tank = insp.currentTankType, Acc = A(), Eq = E();
    if (act === 'login') { if (Acc && Acc.showLogin) Acc.showLogin(); return; }
    const p = prof();
    if (!p || !Eq) return;
    if (act === 'buy' || act === 'ammo') {
      const name = act === 'buy' ? (Eq.MODULES[id] || Eq.PREMIUM[id]).name : `${Eq.AMMO_SHOP[tank][id].pack} viên ${Eq.AMMO_SHOP[tank][id].name.toLowerCase()}`;
      busy = true; b.disabled = true;
      try {
        await Acc.buy(tank, act === 'buy' ? { item: id } : { ammo: id, packs: 1 });
        msg = `<i class="ti ti-circle-check"></i> Đã mua ${esc(name)}${act === 'buy' && Eq.MODULES[id] ? ' — đã tự lắp nếu còn ô trống' : ''}`;
        if (window.soundEngine && window.soundEngine.playReloadDone) window.soundEngine.playReloadDone();
        if (act === 'buy' && Eq.MODULES[id]) rebuildPreview();
      } catch (err) { msg = `<i class="ti ti-alert-triangle"></i> ${esc(err.message)}`; }
      finally { busy = false; }
      refreshWallet(); render();
      return;
    }
    // Lắp / tháo / số đạn: đổi ngay trên giao diện, lưu sau 300 ms
    const lo = JSON.parse(JSON.stringify((p.armory.loadouts && p.armory.loadouts[tank]) || { m: [], a: {} }));
    lo.m = lo.m || []; lo.a = lo.a || {};
    if (act === 'equip') {
      if (lo.m.length >= Eq.SLOTS) { msg = '<i class="ti ti-alert-triangle"></i> Đã đủ 3 ô — tháo bớt một món trước'; render(); return; }
      if (!lo.m.includes(id)) lo.m.push(id);
    } else if (act === 'unequip') lo.m = lo.m.filter(x => x !== id);
    else if (act === 'inc' || act === 'dec') lo.a[id] = Math.max(0, (lo.a[id] || 0) + (act === 'inc' ? 1 : -1));
    else return;
    msg = '';
    p.armory.loadouts = p.armory.loadouts || {};
    p.armory.loadouts[tank] = lo;
    render();
    if (act === 'equip' || act === 'unequip') rebuildPreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Acc.setLoadout(tank, lo.m, lo.a); }
      catch (err) { msg = `<i class="ti ti-alert-triangle"></i> Không lưu được: ${esc(err.message)}`; render(); }
    }, 300);
  }

  return { attach, onTankLoaded, show, render };
})();
window.ArmoryUI = ArmoryUI;
