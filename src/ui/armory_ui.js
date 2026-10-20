/**
 * DẢI CHỌN TRANG BỊ (dưới khung 3D phòng xem xe, tank_inspector.js #ti-equip-dock) — thay chỗ dãy chọn xe cũ.
 *   Hàng trên: 3 nhóm + các ô đang lắp + lời nhắn. Hàng dưới: thẻ đồ cuộn ngang (bấm cả thẻ để lắp / tháo / xem QC).
 *   3 nhóm: GIÁP (giáp phản ứng nổ, giáp lồng...) · ĐẠN (đạn có sẵn + đạn cao cấp) · PHỤ KIỆN (radar, máy gây nhiễu, khói...)
 *   Đồ cơ bản: bấm là lắp (miễn phí). Đồ nâng cao (ổ khóa): xem 1 quảng cáo để nhận vĩnh viễn cho xe đó (máy chủ lưu).
 *   Mỗi nhóm có số ô giới hạn (Equipment.CATS). Mô hình 3D luôn hiện đúng bộ trang bị đang lắp.
 * Quảng cáo: nếu trang có window.AdProvider.show({ onDone, onFail }) (mạng quảng cáo thật) thì dùng, không thì phát
 * khung quảng cáo mẫu đếm ngược đủ thời lượng máy chủ yêu cầu.
 */
const ArmoryUI = (() => {
  let insp = null, cat = 'armor', saveTimer = null, busy = false, msg = '', flash = null;   // flash: hiệu ứng số nhảy sau khi mua / trả
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const E = () => (typeof Equipment !== 'undefined' ? Equipment : null);
  const A = () => window.Account || null;
  const prof = () => (A() && A().profile) || null;
  const fmt = (n) => (A() && A().fmtSilver ? A().fmtSilver(n) : n);
  const TANK_NAMES = { ALL_ROUNDER: 'HALBERD MK.3', GATLING: 'HAILSTORM R6', ARTILLERY: 'ARBALEST 155', SCOUT: 'MARTEN R4' };
  // Đạn có sẵn của từng xe (không cần nhận)
  const STOCK_AMMO = {
    ALL_ROUNDER: [['NORMAL', 'Đạn pháo 120mm thường', 'circle-dot', 'Không giới hạn'], ['AP', 'Đạn xuyên giáp', 'arrow-big-right-lines'], ['HE', 'Đạn nổ mạnh', 'flame']],
    GATLING: [['GATLING_BULLET', 'Đạn 30mm nổ mảnh', 'circle-dot', 'Không giới hạn'], ['INCENDIARY', 'Đạn cháy 30mm', 'flame']],
    ARTILLERY: [['NORMAL', 'Lựu đạn 155mm', 'circle-dot', 'Không giới hạn'], ['HE', 'Lựu đạn nổ mạnh 155', 'flame'], ['CLUSTER', 'Đạn chùm 155', 'atom-2']],
    SCOUT: [['SCOUT_BULLET', 'Đạn 12.7mm', 'circle-dot', 'Không giới hạn'], ['INCENDIARY', 'Đạn cháy 12.7mm', 'flame'], ['RPG', 'Đạn RPG', 'rocket'], ['ANTI_TANK_MISSILE', 'Tên lửa chống tăng', 'rocket']]
  };

  // ---------------------------------------------------------------------------
  // ẢNH TRANG BỊ: render sẵn từ mô hình 3D thật (equipment_thumbs.html) -> assets/equipment/<id>.webp
  // ---------------------------------------------------------------------------
  const IMG_V = '2';   // đổi khi render lại ảnh (máy chủ cache ảnh)
  const imgUrl = (id) => `assets/equipment/${id}.webp?v=${IMG_V}`;
  const imgTag = (id, alt) => `<img class="eqd-img" src="${imgUrl(id)}" alt="${esc(alt || '')}" loading="lazy" decoding="async" draggable="false">`;
  // Tác dụng chính 1 dòng (mô tả đầy đủ xem ở tooltip khi rê chuột)
  const SHORT = {
    era: 'Chặn đạn nổ lõm / RPG, giảm xuyên', slat: 'Chặn ~6/10 phát RPG ở sườn sau, đuôi', applique: 'Giáp sườn +45%, mũi +20%, nặng hơn',
    spall: 'Mảnh vỡ trong xe −15% sát thương', aps: 'Tự bắn hạ RPG / tên lửa (2 lần)', smoke: 'Phím G: màn khói ~14 giây (2 lần)',
    camo: 'Đứng yên: khó bị thấy & bị radar bắt', fireext: 'Dập lửa nhanh ×2,5, cháy chỉ còn ½', turbo: 'Tốc độ +8%, tăng tốc +15%',
    radar: 'Thấy xe địch quanh ~75 m, kể cả núp bụi', jammer: 'Tên lửa địch khóa chậm gấp đôi'
  };

  // ---------------------------------------------------------------------------
  // GẮN VÀO PHÒNG XEM XE
  // ---------------------------------------------------------------------------
  function attach(inspector) {
    insp = inspector;
    const overlay = document.getElementById('tank-inspector-overlay');
    if (!overlay || overlay._armory) return;
    overlay._armory = true;
    // tiền minh họa cũ trên đầu trang (không còn dùng) — giữ ô Bạc thật (#ti-silver)
    overlay.querySelectorAll('.ti-header-actions .ti-currency:not(.ti-silver)').forEach(el => el.remove());
    const dock = $('#ti-equip-dock', overlay);
    if (dock) {
      dock.addEventListener('click', onClick);
      dock.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); e.stopPropagation(); onClick(e); } });
      // con lăn chuột dọc -> cuộn ngang dải thẻ, mỗi nấc trượt đúng 1 thẻ (dải thẻ có scroll-snap: cộng thẳng
      // scrollLeft vài chục px thì trình duyệt kéo về thẻ cũ -> trông như cuộn không ăn). Rê ở đâu trên dải cũng được.
      let wheelAcc = 0;
      dock.addEventListener('wheel', e => {
        const strip = $('.eqd-strip', dock);
        if (!strip || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
        e.preventDefault();
        wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;   // chuột Firefox báo theo dòng
        if (Math.abs(wheelAcc) < 40) return;                          // touchpad: gom các nhịp nhỏ
        const card = $('.eqd-card', strip), step = card ? card.getBoundingClientRect().width + 10 : 240;
        const from = strip.scrollLeft, to = from + Math.sign(wheelAcc) * step;
        strip.scrollBy({ left: to - from, behavior: 'smooth' });
        // trình duyệt không chạy hoạt ảnh cuộn (tab nền, tắt hiệu ứng): nhảy thẳng tới thẻ kế
        setTimeout(() => { if (Math.abs(strip.scrollLeft - from) < 2) strip.scrollLeft = to; }, 350);
        wheelAcc = 0;
      }, { passive: false });
    }
    window.addEventListener('armory-changed', () => { if (insp && insp.isOpen) render(); });
  }

  // Phòng xem vừa dựng xe mới: lắp bộ trang bị đang dùng để xem trước, vẽ lại bảng
  function onTankLoaded(inspector, tank) {
    insp = inspector;
    const u = inspector.activeUnit, Eq = E();
    if (u && Eq) {
      // Luôn lắp (kể cả bộ rỗng): xe xem trước phải khớp đúng bộ đang chọn — vd. chưa lắp ống phóng khói thì
      // ống khói có sẵn trên mô hình được gỡ đi
      const k = (A() && A().kitFor) ? A().kitFor(tank).kit : null;
      Eq.equip(u, k || { m: [], p: [], a: {} }, null);
      u.apAmmoCount = u.heAmmoCount = u.clusterAmmoCount = u.incendiaryAmmoCount = u.missileAmmoCount = u.rpgAmmoCount = 9999;
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
    const root = $('#ti-equip-dock');
    if (!root || !insp) return;
    const tank = insp.currentTankType || 'ALL_ROUNDER', Eq = E();
    if (!Eq) { root.innerHTML = '<div class="eqd-bar"><div class="eqd-note">Thiếu dữ liệu trang bị.</div></div>'; return; }
    const lo = loadout(tank);
    const inCat = (c) => lo.m.filter(id => Eq.MODULES[id] && Eq.MODULES[id].cat === c);
    // Số ô mỗi nhóm; chế độ không giới hạn ô (Equipment.UNLIMITED_SLOTS) = số món hợp với xe này
    const capOf = (c) => Eq.UNLIMITED_SLOTS ? Object.keys(Eq.MODULES).filter(id => Eq.MODULES[id].cat === c && Eq.compatible(id, tank)).length : Eq.CATS[c].slots;
    const C = Eq.CATS[cat], cap = capOf(cat), on = inCat(cat), full = cap && on.length >= cap;
    const keepScroll = ($('.eqd-strip', root) || {}).scrollLeft || 0, sameCat = root.dataset.cat === cat && root.dataset.tank === tank;

    // Hàng trên: nhóm · ô đang lắp · lời nhắn
    let h = '<div class="eqd-bar"><div class="eqd-tabs" role="tablist">';
    for (const c in Eq.CATS) {
      const K = Eq.CATS[c];
      const badge = K.slots ? `<em>${inCat(c).length}/${capOf(c)}</em>` : '';
      h += `<button class="eqd-tab${c === cat ? ' on' : ''}" role="tab" aria-selected="${c === cat}" data-act="cat" data-item="${c}"><i class="ti ti-${K.icon}"></i><span>${K.name}</span>${badge}</button>`;
    }
    h += '</div><div class="eqd-slots">';
    if (C.slots && Eq.UNLIMITED_SLOTS) {
      // Không giới hạn ô -> đếm số món đang dùng + nút trang bị / tháo cả nhóm
      h += `<span class="eqd-lbl">ĐANG TRANG BỊ <b>${on.length}/${cap}</b></span>`;
      h += on.length < cap
        ? '<button class="eqp-btn" data-act="equipAll"><i class="ti ti-checks"></i> TRANG BỊ TẤT CẢ</button>'
        : '<button class="eqp-btn" data-act="unequipAll"><i class="ti ti-x"></i> THÁO TẤT CẢ</button>';
    } else if (C.slots) {
      h += '<span class="eqd-lbl">ĐANG TRANG BỊ</span>';
      for (let i = 0; i < C.slots; i++) {
        const id = on[i], M = id && Eq.MODULES[id];
        h += M ? `<button class="eqd-slot on" data-act="unequip" data-item="${id}" title="Bấm để tháo"><i class="ti ti-${M.icon}"></i><span>${esc(M.name)}</span><i class="ti ti-x eqd-x"></i></button>`
          : '<span class="eqd-slot"><i class="ti ti-plus"></i><span>Ô trống</span></span>';
      }
    } else h += '<span class="eqd-lbl">Đạn chính miễn phí · đạn khác mua lẻ từng viên</span>';
    h += '</div>';
    // số Bạc đã hiện ở góc trên màn xem xe (#ti-silver) -> ở đây chỉ nhắc cách dùng + số Bạc vừa trừ / hoàn bay lên
    const silver = prof() ? `<i class="ti ti-coins"></i> Đạn đã mua tự mang theo mỗi lần xuất kích${flash && flash.cost ? `<span class="eqd-float${flash.cost < 0 ? ' up' : ''}">${flash.cost > 0 ? '−' : '+'}${fmt(Math.abs(flash.cost))} Bạc</span>` : ''}` : '<i class="ti ti-user"></i> Đăng nhập để mua đạn bằng Bạc';
    const note = msg || (cat === 'gear' ? '<i class="ti ti-keyboard"></i> Trong trận bấm <b>G</b> để phóng khói'
      : cat === 'ammo' ? silver
      : Eq.ALL_FREE ? '<i class="ti ti-gift"></i> Mọi trang bị đều miễn phí' : '<i class="ti ti-lock"></i> Đồ có khóa: xem 1 quảng cáo ngắn để nhận vĩnh viễn');
    h += `<div class="eqd-note${msg ? ' msg' : ''}">${note}</div></div>`;

    // Hàng dưới: thẻ đồ
    h += '<div class="eqd-strip">';
    if (cat === 'ammo') {
      const shop = Eq.AMMO_SHOP[tank] || {}, P = prof(), stock = (P && P.armory && P.armory.stock && P.armory.stock[tank]) || {};
      const loginBtn = '<div class="eqd-qty"><button class="eqd-q wide" data-act="login"><i class="ti ti-login"></i> Đăng nhập để mua</button></div>';
      for (const [k, name] of STOCK_AMMO[tank] || []) {
        const S = shop[k], img = 'ammo_' + tank + '_' + k;
        if (!S) { h += card({ img, name, line: 'Đạn chính · không giới hạn', cls: ' on std', tip: `${name}: đạn chính, mang theo không giới hạn` }); continue; }
        const have = stock[k] || 0, carry = Math.min(have, S.max), bump = flash && flash.k === k ? ' bump' : '';
        const ctl = P ? `<div class="eqd-qty">
            <button class="eqd-q" data-act="sellAmmo" data-item="${k}"${have ? '' : ' disabled'} title="Trả lại 1 viên, hoàn ${fmt(S.price)} Bạc">−</button>
            <button class="eqd-q add" data-act="buyAmmo" data-item="${k}" data-n="1" title="Mua 1 viên · ${fmt(S.price)} Bạc">+1</button>${S.max >= 50 ? `
            <button class="eqd-q add" data-act="buyAmmo" data-item="${k}" data-n="10" title="Mua 10 viên · ${fmt(S.price * 10)} Bạc">+10</button>` : ''}
            <span class="eqd-price">${fmt(S.price)} Bạc/viên</span></div>` : loginBtn;
        h += card({ img, name, cls: have ? ' has' : '', extra: ctl,
          line: `<span class="eqd-stock${bump}">Kho <b>${have}</b></span> · mang <b>${carry}</b>/trận`,
          tip: `${name}: mỗi lần xuất kích tự mang tối đa ${S.max} viên (không quá số trong kho). Giá ${fmt(S.price)} Bạc / viên, trả lại được.` });
      }
      const prem = Object.keys(Eq.PREMIUM).filter(id => Eq.PREMIUM[id].tank === tank);
      if (prem.length) {
        h += '<div class="eqd-sep"><span>CAO CẤP</span></div>';
        for (const id of prem) {
          const M = Eq.PREMIUM[id], got = owns(tank, id);
          const ctl = got ? '' : P ? `<div class="eqd-qty"><button class="eqd-q add wide" data-act="buyItem" data-item="${id}"><i class="ti ti-shopping-cart"></i> Mua · ${fmt(M.price)} Bạc</button></div>` : loginBtn;
          h += card({ img: 'prem_' + id, name: M.name, cls: got ? ' on' : '', extra: ctl, tag: 'CAO CẤP',
            line: got ? 'Đã có · luôn dùng' : esc(M.desc.split(/[.:]/)[0]), tip: `${M.name} — ${M.desc}` });
        }
      }
    } else {
      for (const id in Eq.MODULES) {
        const M = Eq.MODULES[id];
        if (M.cat !== cat || !Eq.compatible(id, tank)) continue;
        h += itemCard(tank, id, M, lo, full);
      }
    }
    h += '</div>';
    root.innerHTML = h;
    flash = null;   // hiệu ứng chỉ chạy 1 lần ngay sau giao dịch
    root.dataset.cat = cat; root.dataset.tank = tank;
    if (sameCat && keepScroll) $('.eqd-strip', root).scrollLeft = keepScroll;
  }

  // Thẻ gọn: ảnh vuông bên trái, tên + 1 dòng tác dụng (+ nút số lượng cho đạn); mô tả đầy đủ ở tooltip
  function card(o) {
    return `<div class="eqd-card${o.cls || ''}${o.extra ? ' ctl' : ''}"${o.attrs || ''} title="${esc(o.tip || '')}">
      <div class="eqd-pic">${imgTag(o.img, o.name)}${o.lock ? '<i class="ti ti-lock eqd-lock"></i>' : ''}${o.tag ? `<span class="eqd-tag">${o.tag}</span>` : ''}</div>
      <div class="eqd-txt"><b>${esc(o.name)}</b><span class="eqd-line">${o.line || ''}</span>${o.extra || ''}</div>
      <i class="ti ti-check eqd-tick" aria-hidden="true"></i></div>`;
  }

  // Thẻ giáp / phụ kiện: bấm cả thẻ để trang bị / gỡ (đồ khóa: xem quảng cáo nhận)
  function itemCard(tank, id, M, lo, full) {
    const Eq = E();
    const locked = !Eq.isFree(id) && !owns(tank, id);
    const equipped = lo.m.includes(id);
    let act, cls = '', line = esc(SHORT[id] || M.desc);
    if (locked) { act = 'claim'; cls = ' locked'; line = '<i class="ti ti-player-play-filled"></i> Xem quảng cáo để nhận'; }
    else if (equipped) { act = 'unequip'; cls = ' on'; }
    else { act = 'equip'; if (full) cls = ' full'; }
    const hint = locked ? 'Bấm để xem quảng cáo nhận' : equipped ? 'Bấm để gỡ' : full ? 'Nhóm đã đủ ô — gỡ bớt một món trước' : 'Bấm để trang bị';
    return card({ img: id, name: M.name, line, cls, lock: locked, tag: M.adv ? 'NÂNG CAO' : '',
      attrs: ` role="button" tabindex="0" aria-pressed="${equipped}" data-act="${act}" data-item="${id}"`, tip: `${M.name} — ${M.desc}\n${hint}` });
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
    if (act === 'buyAmmo' || act === 'buyItem' || act === 'sellAmmo') { await buyFlow(tank, act, id, Math.max(1, +b.dataset.n || 1)); return; }
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
    else if (act === 'equipAll' || act === 'unequipAll') {
      const ids = Object.keys(Eq.MODULES).filter(x => Eq.MODULES[x].cat === cat && Eq.compatible(x, tank) && Eq.isFree(x));
      lo.m = lo.m.filter(x => !ids.includes(x));
      if (act === 'equipAll') lo.m.push(...ids);
    } else return;
    msg = '';
    if (Acc.profile) { const p = Acc.profile; p.armory.loadouts = p.armory.loadouts || {}; p.armory.loadouts[tank] = lo; }
    else { Acc.setLoadout(tank, lo.m, lo.a); render(); rebuildPreview(); return; }   // khách: lưu ngay trên máy -> mô hình xem trước cập nhật liền
    render();
    rebuildPreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Acc.setLoadout(tank, lo.m, lo.a); }
      catch (err) { msg = `<i class="ti ti-alert-triangle"></i> Không lưu được: ${esc(err.message)}`; render(); }
    }, 250);
  }

  // Mua lẻ / trả lại đạn bằng Bạc (máy chủ kiểm tra đủ Bạc, không âm kho, giới hạn kho) hoặc mua 1 loại đạn cao cấp
  async function buyFlow(tank, act, id, n) {
    const Acc = A(), Eq = E();
    if (!Acc.profile) { msg = '<i class="ti ti-user"></i> Đăng nhập để mua đạn. <button class="eqp-btn" data-act="login"><i class="ti ti-login"></i> ĐĂNG NHẬP</button>'; render(); return; }
    busy = true;
    try {
      if (act === 'buyAmmo' || act === 'sellAmmo') {
        const S = (Eq.AMMO_SHOP[tank] || {})[id];
        if (act === 'buyAmmo') await Acc.buy(tank, { ammo: id, n });
        else await Acc.sell(tank, id, n);
        flash = { k: id, cost: (act === 'buyAmmo' ? 1 : -1) * n * S.price };
        msg = '';
      } else {
        await Acc.buy(tank, { item: id });
        flash = { k: id, cost: Eq.PREMIUM[id].price };
        msg = `<i class="ti ti-circle-check"></i> Đã mua <b>${esc(Eq.PREMIUM[id].name)}</b> — luôn dùng từ trận tới`;
      }
      if (act !== 'sellAmmo' && window.soundEngine && window.soundEngine.playReloadDone) window.soundEngine.playReloadDone();
    } catch (err) { flash = null; msg = `<i class="ti ti-alert-triangle"></i> ${esc(err.message)}`; }
    finally { busy = false; render(); }
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
      msg = `<i class="ti ti-circle-check"></i> Đã nhận <b>${esc(M.name)}</b>${E().MODULES[id] ? ' — đã tự trang bị nếu nhóm còn ô' : ' — luôn dùng từ trận tới'}`;
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
