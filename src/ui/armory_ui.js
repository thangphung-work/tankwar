/**
 * BẢNG CHỌN TRANG BỊ (cột trái phòng xem xe, tank_inspector.js) — thay cho menu THÔNG TIN / NÂNG CẤP / SƠN / TRANG BỊ / LỊCH SỬ.
 *   3 nhóm: GIÁP (giáp phản ứng nổ, giáp lồng...) · ĐẠN (đạn có sẵn + đạn cao cấp) · PHỤ KIỆN (radar, máy gây nhiễu, khói...)
 *   Đồ cơ bản: bấm là lắp (miễn phí). Đồ nâng cao (ổ khóa): xem 1 quảng cáo để nhận vĩnh viễn cho xe đó (máy chủ lưu).
 *   Mỗi nhóm có số ô giới hạn (Equipment.CATS). Mô hình 3D luôn hiện đúng bộ trang bị đang lắp.
 * Quảng cáo: nếu trang có window.AdProvider.show({ onDone, onFail }) (mạng quảng cáo thật) thì dùng, không thì phát
 * khung quảng cáo mẫu đếm ngược đủ thời lượng máy chủ yêu cầu.
 */
const ArmoryUI = (() => {
  let insp = null, cat = 'armor', saveTimer = null, busy = false, msg = '';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const E = () => (typeof Equipment !== 'undefined' ? Equipment : null);
  const A = () => window.Account || null;
  const prof = () => (A() && A().profile) || null;
  const TANK_NAMES = { ALL_ROUNDER: 'HALBERD MK.3', GATLING: 'HAILSTORM R6', ARTILLERY: 'ARBALEST 155', SCOUT: 'MARTEN R4' };
  // Đạn có sẵn của từng xe (không cần nhận)
  const STOCK_AMMO = {
    ALL_ROUNDER: [['NORMAL', 'Đạn pháo 120mm thường', 'circle-dot', 'Không giới hạn'], ['AP', 'Đạn xuyên giáp', 'arrow-big-right-lines'], ['HE', 'Đạn nổ mạnh', 'flame']],
    GATLING: [['GATLING_BULLET', 'Đạn 30mm nổ mảnh', 'circle-dot', 'Không giới hạn'], ['INCENDIARY', 'Đạn cháy 30mm', 'flame']],
    ARTILLERY: [['NORMAL', 'Lựu đạn 155mm', 'circle-dot', 'Không giới hạn'], ['HE', 'Lựu đạn nổ mạnh 155', 'flame'], ['CLUSTER', 'Đạn chùm 155', 'atom-2']],
    SCOUT: [['SCOUT_BULLET', 'Đạn 12.7mm', 'circle-dot', 'Không giới hạn'], ['INCENDIARY', 'Đạn cháy 12.7mm', 'flame'], ['RPG', 'Đạn RPG', 'rocket'], ['ANTI_TANK_MISSILE', 'Tên lửa chống tăng', 'rocket', '4 quả']]
  };

  // ---------------------------------------------------------------------------
  // GẮN VÀO PHÒNG XEM XE
  // ---------------------------------------------------------------------------
  function attach(inspector) {
    insp = inspector;
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay || overlay._armory) return;
    overlay._armory = true;
    // tiền minh họa cũ trên đầu trang (không còn dùng)
    overlay.querySelectorAll('.ti-header-actions .ti-currency').forEach(el => el.remove());
    const nav = $('.ti-side-nav', overlay);
    if (nav) {
      nav.classList.add('eqp');
      nav.innerHTML = '';
      nav.addEventListener('click', onClick);
    }
    window.addEventListener('armory-changed', () => { if (insp && insp.isOpen) render(); });
  }

  // Phòng xem vừa dựng xe mới: lắp bộ trang bị đang dùng để xem trước, vẽ lại bảng
  function onTankLoaded(inspector, tank) {
    insp = inspector;
    const u = inspector.activeUnit, Eq = E();
    if (u && Eq && A() && A().kitFor) {
      const k = A().kitFor(tank).kit;
      if (k && k.m.length) {
        Eq.equip(u, k, null);
        u.apAmmoCount = u.heAmmoCount = u.clusterAmmoCount = u.incendiaryAmmoCount = u.missileAmmoCount = u.rpgAmmoCount = 9999;
      }
    }
    render();
  }
  function rebuildPreview() {
    if (insp && insp.isOpen && insp.loadTankModel) insp.loadTankModel(insp.currentTankType, insp.currentTeam);
  }
  function show() { render(); }   // giữ tương thích nơi gọi cũ

  // ---------------------------------------------------------------------------
  // VẼ BẢNG
  // ---------------------------------------------------------------------------
  const loadout = (tank) => (A() && A().loadoutOf ? A().loadoutOf(tank) : { m: [], a: {} });
  const owns = (tank, id) => !!(A() && A().owns && A().owns(tank, id));
  const itemOf = (id) => { const Eq = E(); return Eq && (Eq.MODULES[id] || Eq.PREMIUM[id]); };

  function render() {
    const root = $('#tank-inspector-overlay .ti-side-nav.eqp');
    if (!root || !insp) return;
    const tank = insp.currentTankType || 'ALL_ROUNDER', Eq = E();
    if (!Eq) { root.innerHTML = '<p class="eqp-note">Thiếu dữ liệu trang bị.</p>'; return; }
    const lo = loadout(tank);
    const count = (c) => lo.m.filter(id => Eq.MODULES[id] && Eq.MODULES[id].cat === c).length;
    let h = `<div class="eqp-head"><span><i class="ti ti-tool"></i> TRANG BỊ</span><small>${esc(TANK_NAMES[tank] || tank)}</small></div>`;
    h += '<div class="eqp-tabs">';
    for (const c in Eq.CATS) {
      const C = Eq.CATS[c];
      const badge = C.slots ? `<em>${count(c)}/${C.slots}</em>` : '';
      h += `<button class="eqp-tab${c === cat ? ' on' : ''}" data-act="cat" data-item="${c}"><i class="ti ti-${C.icon}"></i><span>${C.name}</span>${badge}</button>`;
    }
    h += '</div>';
    // Ô đang lắp của nhóm
    const C = Eq.CATS[cat];
    if (C.slots) {
      h += '<div class="eqp-slots">';
      const on = lo.m.filter(id => Eq.MODULES[id] && Eq.MODULES[id].cat === cat);
      for (let i = 0; i < C.slots; i++) {
        const id = on[i], M = id && Eq.MODULES[id];
        h += M ? `<button class="eqp-slot on" data-act="unequip" data-item="${id}" title="Bấm để tháo"><i class="ti ti-${M.icon}"></i><span>${esc(M.name)}</span><i class="ti ti-x eqp-x"></i></button>`
          : '<div class="eqp-slot"><i class="ti ti-plus"></i><span>Ô trống</span></div>';
      }
      h += '</div>';
    }
    if (msg) h += `<div class="eqp-msg">${msg}</div>`;
    h += '<div class="eqp-list">';
    if (cat === 'ammo') {
      h += '<div class="eqp-sub">CÓ SẴN</div>';
      const base = Eq.BASE_AMMO[tank] || {};
      for (const [k, name, icon, note] of STOCK_AMMO[tank] || []) {
        const n = note || (base[k] ? `${base[k]} viên mỗi lần xuất kích` : 'Có sẵn');
        h += `<div class="eqp-item std"><span class="eqp-ico"><i class="ti ti-${icon}"></i></span><div class="eqp-info"><b>${esc(name)}</b><p>${esc(n)}</p></div><span class="eqp-state ok"><i class="ti ti-check"></i></span></div>`;
      }
      const prem = Object.keys(Eq.PREMIUM).filter(id => Eq.PREMIUM[id].tank === tank);
      if (prem.length) {
        h += '<div class="eqp-sub">ĐẠN CAO CẤP <small>nhận rồi là luôn dùng thay đạn thường cùng loại</small></div>';
        for (const id of prem) h += itemCard(tank, id, Eq.PREMIUM[id], lo);
      }
    } else {
      for (const id in Eq.MODULES) {
        const M = Eq.MODULES[id];
        if (M.cat !== cat || !Eq.compatible(id, tank)) continue;
        h += itemCard(tank, id, M, lo);
      }
    }
    h += '</div>';
    h += `<div class="eqp-foot"><i class="ti ti-lock"></i> Đồ có ổ khóa là đồ nâng cao: xem 1 quảng cáo ngắn để nhận vĩnh viễn cho xe này.${cat === 'gear' ? ' Phím <b>G</b> trong trận: phóng khói.' : ''}</div>`;
    root.innerHTML = h;
  }

  function itemCard(tank, id, M, lo) {
    const Eq = E(), isMod = !!Eq.MODULES[id];
    const locked = M.adv && !owns(tank, id);
    const equipped = isMod ? lo.m.includes(id) : !locked;
    let action;
    if (locked) action = `<button class="eqp-btn ad" data-act="claim" data-item="${id}"><i class="ti ti-player-play"></i> XEM QC</button>`;
    else if (!isMod) action = '<span class="eqp-state ok"><i class="ti ti-check"></i> ĐANG DÙNG</span>';
    else if (equipped) action = `<button class="eqp-btn on" data-act="unequip" data-item="${id}"><i class="ti ti-check"></i> ĐANG LẮP</button>`;
    else action = `<button class="eqp-btn" data-act="equip" data-item="${id}"><i class="ti ti-plus"></i> LẮP</button>`;
    return `<div class="eqp-item${equipped && isMod ? ' on' : ''}${locked ? ' locked' : ''}">
      <span class="eqp-ico"><i class="ti ti-${M.icon || 'box'}"></i>${locked ? '<i class="ti ti-lock eqp-lock"></i>' : ''}</span>
      <div class="eqp-info"><b>${esc(M.name)}${M.adv ? ' <span class="eqp-tag">NÂNG CAO</span>' : ''}</b><p>${esc(M.desc)}</p></div>
      <div class="eqp-act">${action}</div></div>`;
  }

  // ---------------------------------------------------------------------------
  // HÀNH ĐỘNG
  // ---------------------------------------------------------------------------
  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || busy || !insp) return;
    const act = b.dataset.act, id = b.dataset.item, tank = insp.currentTankType, Acc = A(), Eq = E();
    if (act === 'cat') { cat = id; msg = ''; render(); return; }
    if (act === 'login') { if (Acc && Acc.showLogin) Acc.showLogin(); return; }
    if (!Eq || !Acc) return;
    if (act === 'claim') { await claimFlow(tank, id); return; }
    const lo = JSON.parse(JSON.stringify(loadout(tank)));
    lo.m = lo.m || []; lo.a = lo.a || {};
    if (act === 'equip') {
      const M = Eq.MODULES[id], C = M && Eq.CATS[M.cat];
      if (!M) return;
      if (lo.m.filter(x => Eq.MODULES[x] && Eq.MODULES[x].cat === M.cat).length >= C.slots) {
        msg = `<i class="ti ti-alert-triangle"></i> Nhóm ${C.name.toLowerCase()} đã đủ ${C.slots} ô — tháo bớt một món trước`;
        render(); return;
      }
      if (!lo.m.includes(id)) lo.m.push(id);
    } else if (act === 'unequip') lo.m = lo.m.filter(x => x !== id);
    else return;
    msg = '';
    if (Acc.profile) { const p = Acc.profile; p.armory.loadouts = p.armory.loadouts || {}; p.armory.loadouts[tank] = lo; }
    render();
    rebuildPreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Acc.setLoadout(tank, lo.m, lo.a); }
      catch (err) { msg = `<i class="ti ti-alert-triangle"></i> Không lưu được: ${esc(err.message)}`; render(); }
    }, 250);
  }

  // Nhận đồ nâng cao: cần tài khoản (máy chủ lưu đồ đã nhận) -> bắt đầu phiên -> xem quảng cáo -> nhận
  async function claimFlow(tank, id) {
    const Acc = A(), M = itemOf(id);
    if (!Acc.profile) {
      msg = Acc.online
        ? '<i class="ti ti-user"></i> Đăng nhập để nhận đồ nâng cao (đồ đã nhận lưu theo tài khoản). <button class="eqp-btn" data-act="login"><i class="ti ti-login"></i> ĐĂNG NHẬP</button>'
        : '<i class="ti ti-wifi-off"></i> Nhận đồ nâng cao cần mở trò chơi qua máy chủ (chạy start.bat) và đăng nhập.';
      render(); return;
    }
    busy = true;
    try {
      const s = await Acc.adStart(tank, id);
      const ok = await playAd(s.sec || 15, M.name);
      if (!ok) { msg = '<i class="ti ti-info-circle"></i> Chưa xem hết quảng cáo nên chưa nhận được.'; return; }
      await Acc.claim(tank, id, s.token);
      msg = `<i class="ti ti-circle-check"></i> Đã nhận <b>${esc(M.name)}</b>${E().MODULES[id] ? ' — đã tự lắp nếu nhóm còn ô' : ' — luôn dùng từ trận tới'}`;
      if (window.soundEngine && window.soundEngine.playReloadDone) window.soundEngine.playReloadDone();
      if (E().MODULES[id]) rebuildPreview();
    } catch (err) { msg = `<i class="ti ti-alert-triangle"></i> ${esc(err.message)}`; }
    finally { busy = false; render(); }
  }

  // Phát quảng cáo: mạng quảng cáo thật nếu có, không thì khung mẫu đếm ngược. Trả về true nếu xem hết.
  function playAd(sec, itemName) {
    if (window.AdProvider && typeof window.AdProvider.show === 'function') {
      return new Promise(res => window.AdProvider.show({ onDone: () => res(true), onFail: () => res(false) }));
    }
    return new Promise(res => {
      const el = document.createElement('div');
      el.className = 'eqp-ad';
      el.innerHTML = `<div class="eqp-ad-box"><div class="eqp-ad-top"><span><i class="ti ti-ad-2"></i> QUẢNG CÁO</span><b class="eqp-ad-left">${sec}</b></div>
        <div class="eqp-ad-stage"><i class="ti ti-tank"></i><p>Không gian quảng cáo</p><small>Xem hết để nhận: ${esc(itemName)}</small></div>
        <div class="eqp-ad-bar"><i></i></div>
        <div class="eqp-ad-actions"><button class="eqp-btn" data-ad="skip">BỎ QUA</button><button class="eqp-btn ad" data-ad="done" disabled><i class="ti ti-gift"></i> NHẬN</button></div></div>`;
      document.body.appendChild(el);
      const t0 = performance.now(), bar = $('.eqp-ad-bar i', el), left = $('.eqp-ad-left', el), done = $('[data-ad="done"]', el);
      const tick = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        bar.style.width = (k * 100).toFixed(1) + '%';
        left.textContent = Math.max(0, Math.ceil(sec * (1 - k)));
        if (k >= 1) { clearInterval(tick); done.disabled = false; left.innerHTML = '<i class="ti ti-check"></i>'; }
      }, 100);
      el.addEventListener('click', ev => {
        const b = ev.target.closest('[data-ad]');
        if (!b || b.disabled) return;
        clearInterval(tick);
        el.remove();
        res(b.dataset.ad === 'done');
      });
    });
  }

  return { attach, onTankLoaded, show, render };
})();
window.ArmoryUI = ArmoryUI;
