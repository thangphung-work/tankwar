/**
 * DẢI CHỌN TRANG BỊ (dưới khung 3D phòng xem xe, tank_inspector.js #ti-equip-dock) — thay chỗ dãy chọn xe cũ.
 *   Hàng trên: 3 nhóm + các ô đang lắp + lời nhắn. Hàng dưới: thẻ đồ cuộn ngang (bấm cả thẻ để lắp / tháo / xem QC).
 *   3 nhóm: GIÁP (giáp phản ứng nổ, giáp lồng...) · ĐẠN (đạn có sẵn + đạn cao cấp) · PHỤ KIỆN (radar, máy gây nhiễu, khói...)
 *   Đồ cơ bản: bấm là lắp (miễn phí). Đồ nâng cao (ổ khóa): mở khóa vĩnh viễn cho xe đó bằng Bạc hoặc xem đủ số
 *   quảng cáo (Equipment.adsToUnlock, máy chủ lưu tiến độ). Mỗi nhóm có số ô giới hạn (Equipment.CATS).
 *   Vật tư tiêu hao (đạn đặc chủng, lựu đạn khói): mua bằng Bạc, hoặc xem quảng cáo tiếp tế (+AMMO_SHOP[..].ad viên).
 * Quảng cáo: src/core/ads.js (AdProvider) — Google H5 Games Ads khi đã cấu hình, không thì khung quảng cáo mẫu.
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
    GATLING: [['GATLING_BULLET', 'Đạn 30mm thường', 'circle-dot', 'Không giới hạn'], ['GATLING_HE', 'Đạn 30mm nổ mảnh ngòi cận đích', 'drone-off'], ['INCENDIARY', 'Đạn cháy 30mm', 'flame']],
    ARTILLERY: [['NORMAL', 'Lựu đạn 155mm', 'circle-dot', 'Không giới hạn'], ['HE', 'Lựu đạn nổ mạnh 155', 'flame'], ['CLUSTER', 'Đạn chùm 155', 'atom-2'], ['KAMIKAZE', 'UAV cảm tử', 'drone-off']],
    SCOUT: [['SCOUT_BULLET', 'Đạn xuyên giáp 12.7mm', 'circle-dot', 'Không giới hạn'], ['INCENDIARY', 'Đạn cháy 12.7mm', 'flame'], ['ANTI_TANK_MISSILE', 'Tên lửa chống tăng', 'rocket']]
  };
  for (const t in STOCK_AMMO) if (t !== 'ARTILLERY') STOCK_AMMO[t].push(['SMOKE', 'Lựu đạn khói', 'cloud']);   // vật tư của Ống phóng lựu khói (xe pháo không lắp)
  const adsLeft = () => (A() && A().adsLeft ? A().adsLeft() : 0);
  const adsBonus = () => (A() && A().adsBonus ? A().adsBonus() : 0);
  const adAmmoN = (S) => (A() && A().adAmmoN ? A().adAmmoN(S) : S.ad);
  const adsOn = () => !!(window.AdProvider && AdProvider.available());

  // ---------------------------------------------------------------------------
  // ẢNH TRANG BỊ: render sẵn từ mô hình 3D thật (equipment_thumbs.html) -> assets/equipment/<id>.webp
  // ---------------------------------------------------------------------------
  const IMG_V = '16';   // đổi khi render lại ảnh (máy chủ cache ảnh)
  const imgUrl = (id) => `assets/equipment/${id}.webp?v=${IMG_V}`;
  const imgTag = (id, alt) => `<img class="eqd-img" src="${imgUrl(id)}" alt="${esc(alt || '')}" loading="lazy" decoding="async" draggable="false">`;
  // Tác dụng chính 1 dòng (mô tả đầy đủ xem ở tooltip khi rê chuột)
  const SHORT = {
    era: 'Chặn đạn nổ lõm / RPG, giảm xuyên; đạn nổ phá chỉ −20%', slat: 'Chặn ~1/4 tên lửa, ~6/10 bom con; giảm nổ, mảnh văng, chống bén lửa', applique: 'Giáp sườn +45%, mũi +20%, nặng hơn',
    spall: 'Mảnh vỡ vào kíp xe −20%, máy móc −10%; không đỡ trúng thẳng kho đạn', aps: 'Tự bắn hạ RPG / UAV cảm tử / tên lửa giữa đường bay (2 lượt)', smoke: 'Phím G: tường khói ~15 giây, cắt khóa của địch (cần lựu đạn khói, 1 ống 1 quả)',
    camo: 'Đứng yên: khó bị thấy & bị radar bắt', fireext: 'Trong khoang: dập lửa ×2,5, cháy ½; đạn cháy -20%, xuyên giáp -8% (trừ lõi urani)', turbo: 'Tốc độ +8%, tăng tốc +15%',
    radar: 'Thấy xe địch quanh ~600M, kể cả núp bụi', jammer: 'Tên lửa địch khóa chậm gấp đôi; UAV cảm tử lao gần (~300M) mất điều khiển',
    // ô NÓC THÁP (phím [4] trong trận)
    ewjam: 'Phím [4]: chùm phá sóng ép drone địch bay về (mặc định)', rcws: 'Phím [4]: súng máy bắn rơi drone, quét xe giáp mỏng',
    agl: 'Phím [4]: lựu đạn 40mm cầu vồng, nổ mảnh xe giáp mỏng', rocket: 'Phím [4]: khóa laser, 2 tên lửa bổ nhào xuống nóc (-90% máu)',
    rjam: 'Phím [4]: ~10 s cắt khóa radar & tên lửa dẫn đường địch quanh ~650M, lộ hướng',
    // ô MŨI XE / VŨ KHÍ CHÍNH / UAV
    dozer: 'Phím X: ủi ụ đất che thân (mặc định)', vshield: 'Khiên thép chữ V cách quãng: làm chệch đạn, nổ lõm yếu hẳn; bao cát đối trọng sau đuôi đỡ đạn vào đuôi; xe chậm ~10%, không ủi đất',
    mag300: 'Băng 300 viên, thay hòm ~6 s (mặc định)', mag450: 'Băng 450 viên, thay hòm ~8 s',
    mag650: 'Băng 650 viên, hòm to nhô cao, thay hòm ~10,5 s',
    hmg: 'Súng máy 12.7mm có tấm chắn (mặc định)', sagl: 'Lựu 40mm HV tự động 48 quả, ngóc 45° bắn cầu vồng tầm trung',
    srocket: 'Giàn 8 rocket nổ lõm phóng lần lượt, nạp cả giàn ~25 s',
    recon: 'Drone trinh sát Ctrl: mắt cho phát bắn cầu vồng (mặc định)', kami: 'Ctrl phóng, Space bổ nhào: trúng nóc là hạ / gần hạ xe tăng (vật tư UAV cảm tử)',
    topatk: 'Tên lửa vồng cao rồi bổ nhào xuống nóc xe — giáp mỏng nhất',
    // ô ĐỘNG CƠ: giữ Shift tăng tốc, máy nóng dần
    stock: 'Máy zin: KHÔNG tăng tốc được (mặc định)', tdiesel: 'Shift: +25% tốc độ, ~14 s nóng máy · rít turbo',
    twinturbo: 'Shift: +38% tốc độ, ~20 s nóng máy · rít 2 tầng', turbine: 'Shift: +50% tốc độ, ~28 s nóng máy · rít phản lực',
    hybrid: 'Shift: +45% tốc độ, gia tốc tức thì, ~26 s nóng máy · rít mô-tơ điện'
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
        const bar = e.target.closest('.eqd-bar');
        if (bar) {
          if (bar.scrollWidth > bar.clientWidth) {
            const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
            const dx = e.deltaMode === 1 ? e.deltaX * 33 : e.deltaX;
            const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
            if (Math.abs(delta) > 0) {
              e.preventDefault();
              bar.scrollLeft += delta;
            }
          }
          return;
        }
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
  // Lắp bộ trang bị đang dùng lên xe xem trước — gọi 1 lần lúc dựng xe (tank_inspector.js createPreviewUnit, kể cả xe
  // dựng sẵn ở nền); equip nhân dồn chỉ số tốc độ nên không gọi lại trên cùng một xe
  function equipPreview(u, tank) {
    const Eq = E();
    if (!u || !Eq) return;
    // Luôn lắp (kể cả bộ rỗng): xe xem trước phải khớp đúng bộ đang chọn — vd. chưa lắp ống phóng khói thì
    // ống khói có sẵn trên mô hình được gỡ đi
    const k = (A() && A().kitFor) ? A().kitFor(tank).kit : null;
    Eq.equip(u, k || { m: [], p: [], a: {} }, null);
    u.apAmmoCount = u.heAmmoCount = u.clusterAmmoCount = u.incendiaryAmmoCount = u.heFragAmmoCount = u.missileAmmoCount = u.rpgAmmoCount = 9999;
  }
  function onTankLoaded(inspector, tank) {
    insp = inspector;
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
  // Giáp mua thêm đã hỏng chưa sửa (máy chủ armor_cond): { total, gone: [...], unit: giá 1 đơn vị }
  const condOf = (tank, id) => { const P = prof(), c = P && P.armory && P.armory.cond && P.armory.cond[tank]; return (c && c[id] && c[id].gone && c[id].gone.length) ? c[id] : null; };
  const repairAllCost = (tank) => { const P = prof(), c = (P && P.armory && P.armory.cond && P.armory.cond[tank]) || {}; let n = 0, cost = 0; for (const id in c) { if (!c[id].gone) continue; n += c[id].gone.length; cost += c[id].gone.length * (c[id].unit || 0); } return { n, cost }; };

  function render() {
    const root = $('#ti-equip-dock');
    if (!root || !insp) return;
    const tank = insp.currentTankType || 'ALL_ROUNDER', Eq = E();
    if (!Eq) { root.innerHTML = '<div class="eqd-bar"><div class="eqd-note">Thiếu dữ liệu trang bị.</div></div>'; return; }
    const lo = loadout(tank);
    // ô NÓC THÁP chỉ có ở xe có bệ gắn (xe tăng)
    // ô 1 bệ (nóc tháp / mũi xe / vũ khí chính / UAV) chỉ hiện ở xe có món cho ô đó
    const MOUNT = Eq.MOUNT_CATS || ['roof'];
    const isMount = (c) => MOUNT.includes(c);
    const hasCat = (c) => !isMount(c) || Object.keys(Eq.MODULES).some(id => Eq.MODULES[id].cat === c && (Eq.compatible(id, tank) || (Eq.SLOT_DEFAULT && Eq.SLOT_DEFAULT[c] && Eq.SLOT_DEFAULT[c][tank] === id)));
    if (!hasCat(cat)) cat = 'armor';
    const inCat = (c) => lo.m.filter(id => Eq.MODULES[id] && Eq.MODULES[id].cat === c);
    // Số ô mỗi nhóm; chế độ không giới hạn ô (Equipment.UNLIMITED_SLOTS) = số món hợp với xe này
    const capOf = (c) => Eq.UNLIMITED_SLOTS ? Object.keys(Eq.MODULES).filter(id => Eq.MODULES[id].cat === c && Eq.compatible(id, tank)).length : Eq.CATS[c].slots;
    const C = Eq.CATS[cat], cap = capOf(cat), on = inCat(cat), full = cap && on.length >= cap;
    const keepScroll = ($('.eqd-strip', root) || {}).scrollLeft || 0;
    const keepBarScroll = ($('.eqd-bar', root) || {}).scrollLeft || 0;
    const sameCat = root.dataset.cat === cat && root.dataset.tank === tank;

    // Hàng trên: nhóm tab cuộn ngang · lời nhắn
    let h = '<div class="eqd-bar"><div class="eqd-tabs" role="tablist">';
    for (const c in Eq.CATS) {
      const K = Eq.CATS[c];
      if (!hasCat(c)) continue;
      const hurt = c !== 'ammo' && Object.keys(Eq.MODULES).some(id => Eq.MODULES[id].cat === c && condOf(tank, id));
      const badge = (K.slots ? `<em>${inCat(c).length}/${capOf(c)}</em>` : '') + (hurt ? '<em class="eqd-hurt" title="Có giáp bị hỏng chưa sửa"><i class="ti ti-tool"></i></em>' : '');
      h += `<button class="eqd-tab${c === cat ? ' on' : ''}" role="tab" aria-selected="${c === cat}" data-act="cat" data-item="${c}"><i class="ti ti-${K.icon}"></i><span>${K.name}</span>${badge}</button>`;
    }
    h += '</div>';
    const note = msg || (flash && flash.cost ? `<span class="eqd-float${flash.cost < 0 ? ' up' : ''}">${flash.cost > 0 ? '−' : '+'}${fmt(Math.abs(flash.cost))} Bạc</span>` : '');
    const RA = repairAllCost(tank);
    const fix = RA.n && !msg ? `<span class="eqd-fixall"><i class="ti ti-alert-triangle"></i> Trang bị hỏng từ trận trước — chưa sửa thì không mang ra trận <button class="eqp-btn" data-act="repairAll"><i class="ti ti-tool"></i> SỬA TẤT CẢ · ${fmt(RA.cost)} Bạc</button></span> ` : '';
    // thông báo dài (vd tên trang bị vừa mở khóa) giữ 1 dòng, cắt "…"; rê chuột xem đủ
    const tip = msg ? ` title="${esc(msg.replace(/<[^>]+>/g, '').trim())}"` : '';
    h += `<div class="eqd-note${msg ? ' msg' : ''}"${tip}>${fix}${msg ? `<span class="eqd-note-txt">${note}</span>` : note}</div></div>`;

    // Hàng dưới: thẻ đồ
    h += '<div class="eqd-strip">';
    if (cat === 'ammo') {
      const shop = Eq.AMMO_SHOP[tank] || {}, P = prof(), stock = (P && P.armory && P.armory.stock && P.armory.stock[tank]) || {};
      const loginBtn = '<div class="eqd-qty"><button class="eqd-q wide" data-act="login"><i class="ti ti-login"></i> Đăng nhập để mua</button></div>';
      const left = adsLeft() + adsBonus();
      for (const [k, name] of STOCK_AMMO[tank] || []) {
        const S = shop[k], img = k === 'SMOKE' ? 'smoke' : k === 'KAMIKAZE' ? 'uav_kami' : 'ammo_' + tank + '_' + k;
        const gearName = S && S.gear && Eq.MODULES[S.gear] ? Eq.MODULES[S.gear].name : '';
        if (!S) { h += card({ img, name, line: 'Đạn chính · không giới hạn', cls: ' on std', tip: `${name}: đạn chính, mang theo không giới hạn` }); continue; }
        const have = stock[k] || 0, free = A() && A().freeOf ? A().freeOf(tank, k) : 0, paid = Math.max(0, have - free);
        const carry = Math.min(have, S.max), bump = flash && flash.k === k ? ' bump' : '';
        const needGear = S.gear && !lo.m.includes(S.gear) && !(Eq.builtin && Eq.builtin(tank, S.gear));
        const full = have >= S.max * 10;
        const adBtn = adsOn() ? `
            <button class="eqd-q ad" data-act="adAmmo" data-item="${k}"${left > 0 && !full ? '' : ' disabled'} title="${full ? 'Kho đã đầy' : left > 0 ? `Xem 1 quảng cáo: +${adAmmoN(S)} viên miễn phí (còn ${left} lượt hôm nay)` : 'Hết lượt quảng cáo hôm nay'}"><i class="ti ti-player-play-filled"></i>+${adAmmoN(S)}</button>` : '';
        const base = (Eq.BASE_AMMO[tank] || {})[k] || 0;   // miễn phí mỗi lần xuất kích (bắn trước đạn trong kho)
        const ctl = P ? `<div class="eqd-qty">
            <button class="eqd-q" data-act="sellAmmo" data-item="${k}"${paid ? '' : ' disabled'} title="${paid ? `Trả lại 1 viên, hoàn ${fmt(S.price)} Bạc` : 'Đạn nhận từ quảng cáo không trả lại được'}">−</button>
            <button class="eqd-q add" data-act="buyAmmo" data-item="${k}" data-n="1" title="Mua 1 viên · ${fmt(S.price)} Bạc">+1</button>${S.max >= 50 ? `
            <button class="eqd-q add" data-act="buyAmmo" data-item="${k}" data-n="10" title="Mua 10 viên · ${fmt(S.price * 10)} Bạc">+10</button>` : ''}${adBtn}
            <span class="eqd-price">${fmt(S.price)} Bạc/viên</span></div>` : loginBtn;
        // cảnh báo sắp hết: kho không đủ mang đầy 1 lần xuất kích
        const lowCls = have <= 0 ? ' out' : have < S.max ? ' low' : '';
        const lowTxt = have <= 0 ? ' · <span class="eqd-warn">HẾT</span>' : have < S.max ? ' · <span class="eqd-warn">SẮP HẾT</span>' : '';
        h += card({ img, name, cls: (have ? ' has' : '') + lowCls, extra: ctl,
          line: needGear ? `<span class="eqd-stock${bump}">Kho <b>${have}</b></span> · cần lắp ${esc(gearName)}`
            : `<span class="eqd-stock${bump}">Kho <b>${have}</b></span> · mang <b>${base ? base + ' + ' : ''}${carry}</b>/trận${lowTxt}`,
          tip: `${name}: ${base ? `mỗi lần xuất kích có sẵn ${base} viên miễn phí (bắn trước), cộng thêm` : 'mỗi lần xuất kích tự mang'} tối đa ${S.max} viên (không quá số trong kho). Giá ${fmt(S.price)} Bạc / viên, trả lại được phần mua bằng Bạc.`
            + (adsOn() ? ` Xem 1 quảng cáo: +${S.ad} viên miễn phí.` : '') + (S.gear ? ` Cần lắp ${gearName}${Eq.MODULES[S.gear] && Eq.CATS[Eq.MODULES[S.gear].cat] ? ' (nhóm ' + Eq.CATS[Eq.MODULES[S.gear].cat].name + ')' : ''}.` : '') });
      }
      const prem = Object.keys(Eq.PREMIUM).filter(id => Eq.PREMIUM[id].tank === tank);
      if (prem.length) {
        h += '<div class="eqd-sep"><span>CAO CẤP</span></div>';
        for (const id of prem) {
          const M = Eq.PREMIUM[id], got = owns(tank, id);
          const ctl = got ? '' : P ? unlockCtl(tank, id, M) : loginBtn;
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
    // Đổi nhóm / đổi xe: thẻ trượt vào lần lượt; dựng lại cùng nhóm (mua, đổi số lượng) thì không
    if (!sameCat) { if (window.tcSwap) tcSwap(root); }
    else if (window.tcSwapStop) tcSwapStop(root);
    flash = null;   // hiệu ứng chỉ chạy 1 lần ngay sau giao dịch
    root.dataset.cat = cat; root.dataset.tank = tank;
    if (sameCat && keepScroll) $('.eqd-strip', root).scrollLeft = keepScroll;
    if (keepBarScroll) $('.eqd-bar', root).scrollLeft = keepBarScroll;
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
    // ô nóc tháp để trống = đang mang món mặc định
    const isDefault = (Eq.MOUNT_CATS || ['roof']).includes(M.cat) && !lo.m.includes(id) && Eq.slotOf && Eq.slotOf(lo, tank, M.cat) === id;
    const equipped = lo.m.includes(id) || isDefault;
    if (locked) {
      // đồ nâng cao chưa mở khóa: mua bằng Bạc hoặc xem đủ số quảng cáo
      const ctl = prof() ? unlockCtl(tank, id, M) : '<div class="eqd-qty"><button class="eqd-q wide" data-act="login"><i class="ti ti-login"></i> Đăng nhập để mở khóa</button></div>';
      return card({ img: id, name: M.name, line: esc(SHORT[id] || M.desc), cls: ' locked', lock: true, tag: 'NÂNG CAO', extra: ctl,
        tip: `${M.name} — ${M.desc}\nMở khóa vĩnh viễn cho xe này: ${fmt(M.price)} Bạc${adsOn() && Eq.adsToUnlock(id) ? ` hoặc xem ${Eq.adsToUnlock(id)} quảng cáo` : ' (chỉ mua bằng Bạc)'}` });
    }
    let act, cls = '';
    const swap = (Eq.MOUNT_CATS || ['roof']).includes(M.cat);   // ô 1 bệ: chọn món khác là thay luôn món đang gắn
    if (equipped) { act = isDefault ? 'none' : 'unequip'; cls = ' on'; }
    else { act = 'equip'; if (full && !swap) cls = ' full'; }
    // trang bị hỏng từ trận trước (bị phá dù chỉ 1 khối): chưa sửa thì KHÔNG mang ra trận + nút Sửa (giá theo số đơn vị mất)
    const CD = condOf(tank, id);
    if (CD) {
      const unitName = (Eq.ARMOR_REPAIR && Eq.ARMOR_REPAIR[id]) || 'khối', cost = CD.gone.length * (CD.unit || 0);
      const left = Math.max(0, CD.total - CD.gone.length), whole = CD.total <= 1;
      return card({ img: id, name: M.name, cls: cls + ' hurt', tag: M.adv ? 'NÂNG CAO' : '',
        line: `<span class="eqd-warn">HỎNG${whole ? '' : ` · CÒN ${left}/${CD.total} ${unitName}`} — KHÔNG MANG RA TRẬN</span>`,
        extra: `<div class="eqd-qty"><button class="eqd-q add wide" data-act="repair" data-item="${id}" title="Sửa ${whole ? unitName : CD.gone.length + ' ' + unitName + ' bị phá'} (${fmt(CD.unit)} Bạc / ${unitName})"><i class="ti ti-tool"></i> Sửa${whole ? '' : ' ' + CD.gone.length + ' ' + unitName} · ${fmt(cost)} Bạc</button></div>`,
        attrs: ` role="button" tabindex="0" aria-pressed="${equipped}" data-act="${act}" data-item="${id}"`,
        tip: `${M.name}: bị phá ở trận trước${whole ? '' : ` (${CD.gone.length}/${CD.total} ${unitName})`} — chưa sửa thì xe ra trận KHÔNG có món này. Sửa: ${fmt(cost)} Bạc` });
    }
    const hint = isDefault ? 'Món mặc định khi ô nóc tháp để trống' : equipped ? 'Bấm để gỡ' : full && !swap ? 'Nhóm đã đủ ô — gỡ bớt một món trước' : swap && full ? 'Bấm để thay món đang gắn trên nóc tháp' : 'Bấm để trang bị';
    return card({ img: id, name: M.name, line: esc(SHORT[id] || M.desc), cls, tag: M.adv ? 'NÂNG CAO' : '',
      attrs: ` role="button" tabindex="0" aria-pressed="${equipped}" data-act="${act}" data-item="${id}"`, tip: `${M.name} — ${M.desc}\n${hint}` });
  }
  // Nút mở khóa đồ nâng cao / đạn cao cấp: [Mua · giá Bạc] [▶ quảng cáo đã xem / cần]
  function unlockCtl(tank, id, M) {
    const Eq = E(), need = Eq.adsToUnlock(id), got = A() && A().adProgressOf ? A().adProgressOf(tank, id) : 0, left = adsLeft();
    const ad = adsOn() && need > 0 ? `<button class="eqd-q ad wide" data-act="claim" data-item="${id}"${left > 0 ? '' : ' disabled'} title="${left > 0 ? `Xem quảng cáo để mở khóa (${got}/${need}) — còn ${left} lượt hôm nay` : 'Hết lượt quảng cáo hôm nay'}"><i class="ti ti-player-play-filled"></i> ${got}/${need}</button>` : '';
    return `<div class="eqd-qty"><button class="eqd-q add wide" data-act="buyItem" data-item="${id}" title="Mở khóa vĩnh viễn cho xe này"><i class="ti ti-shopping-cart"></i> ${fmt(M.price)} Bạc</button>${ad}</div>`;
  }

  // ---------------------------------------------------------------------------
  // HÀNH ĐỘNG
  // ---------------------------------------------------------------------------
  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || busy || !insp) return;
    const act = b.dataset.act, id = b.dataset.item, tank = insp.currentTankType, Acc = A(), Eq = E();
    if (act === 'cat') {
      cat = id; msg = ''; render();
      const tabEl = $(`[data-act="cat"][data-item="${id}"]`, $('#ti-equip-dock'));
      if (tabEl && tabEl.scrollIntoView) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      return;
    }
    if (act === 'login') { if (Acc && Acc.showLogin) Acc.showLogin(); return; }
    if (!Eq || !Acc) return;
    if (act === 'claim') { await adFlow(tank, { item: id }); return; }
    if (act === 'adAmmo') { await adFlow(tank, { ammo: id }); return; }
    if (act === 'buyAmmo' || act === 'buyItem' || act === 'sellAmmo') { await buyFlow(tank, act, id, Math.max(1, +b.dataset.n || 1)); return; }
    if (act === 'repair' || act === 'repairAll') { e.stopPropagation(); await repairFlow(tank, act === 'repairAll' ? null : id); return; }
    const lo = JSON.parse(JSON.stringify(loadout(tank)));
    lo.m = lo.m || []; lo.a = lo.a || {};
    if (act === 'equip') {
      const M = Eq.MODULES[id], C = M && Eq.CATS[M.cat];
      if (!M) return;
      if ((Eq.MOUNT_CATS || ['roof']).includes(M.cat)) lo.m = lo.m.filter(x => !(Eq.MODULES[x] && Eq.MODULES[x].cat === M.cat));   // chỉ 1 bệ: thay món cũ
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
        const M = itemOf(id);
        await Acc.buy(tank, { item: id });
        flash = { k: id, cost: M.price };
        msg = `<i class="ti ti-circle-check"></i> Đã mở khóa <b>${esc(M.name)}</b>${Eq.MODULES[id] ? ' — đã tự trang bị nếu nhóm còn ô' : ' — luôn dùng từ trận tới'}`;
        if (Eq.MODULES[id]) rebuildPreview();
      }
      const se = window.soundEngine;
      if (se && se.playUiPurchase) se.playUiPurchase(act === 'sellAmmo');
      else if (act !== 'sellAmmo' && se && se.playReloadDone) se.playReloadDone();
    } catch (err) {
      flash = null; msg = `<i class="ti ti-alert-triangle"></i> ${esc(err.message)}`;
      if (window.soundEngine && window.soundEngine.playUiDenied) window.soundEngine.playUiDenied();
    }
    finally { busy = false; render(); }
  }

  // Sửa giáp hỏng (một món hoặc tất cả): máy chủ trừ Bạc theo số khối thiếu
  async function repairFlow(tank, id) {
    const Acc = A(), Eq = E();
    if (!Acc.profile || !Acc.repair) return;
    busy = true;
    try {
      const r = await Acc.repair(tank, id ? { item: id } : { all: true });
      flash = { k: id || 'repair', cost: r.cost };
      msg = `<i class="ti ti-circle-check"></i> Đã mua lại <b>${r.units}</b> khối giáp${id && Eq.MODULES[id] ? ` (${esc(Eq.MODULES[id].name)})` : ''} — trừ ${fmt(r.cost)} Bạc`;
      rebuildPreview();
      const se = window.soundEngine;
      if (se && se.playUiPurchase) se.playUiPurchase(false);
    } catch (err) {
      flash = null; msg = `<i class="ti ti-alert-triangle"></i> ${esc(err.message)}`;
      if (window.soundEngine && window.soundEngine.playUiDenied) window.soundEngine.playUiDenied();
    } finally { busy = false; render(); }
  }

  // Xem quảng cáo có thưởng: what = { ammo } (tiếp tế vật tư) | { item } (+1 tiến độ mở khóa đồ nâng cao)
  async function adFlow(tank, what) {
    const Acc = A(), Eq = E();
    if (!Acc.profile) {
      msg = Acc.online
        ? '<i class="ti ti-user"></i> Đăng nhập để nhận thưởng quảng cáo (lưu theo tài khoản). <button class="eqp-btn" data-act="login"><i class="ti ti-login"></i> ĐĂNG NHẬP</button>'
        : '<i class="ti ti-wifi-off"></i> Quảng cáo có thưởng cần mở trò chơi qua máy chủ (chạy start.bat) và đăng nhập.';
      render(); return;
    }
    const S = what.ammo ? (Eq.AMMO_SHOP[tank] || {})[what.ammo] : null, M = what.item ? itemOf(what.item) : null;
    const label = S ? `+${S.ad} ${S.name}` : `Tiến độ mở khóa ${M.name}`;
    busy = true;
    try {
      const r = await Acc.watchAd(tank, what, label);
      if (r.status === 'unavailable') msg = '<i class="ti ti-info-circle"></i> Hiện chưa có quảng cáo, thử lại sau ít phút.';
      else if (r.status !== 'done') msg = '<i class="ti ti-info-circle"></i> Chưa xem hết quảng cáo nên chưa nhận được.';
      else {
        const R = r.reward || {};
        if (R.kind === 'ammo') { flash = { k: R.ammo, cost: 0 }; msg = `<i class="ti ti-circle-check"></i> Tiếp tế: <b>+${R.n} ${esc(S.name.toLowerCase())}</b> vào kho`; }
        else if (R.unlocked) { msg = `<i class="ti ti-circle-check"></i> Đã mở khóa <b>${esc(M.name)}</b>${Eq.MODULES[what.item] ? ' — đã tự trang bị nếu nhóm còn ô' : ' — luôn dùng từ trận tới'}`; if (Eq.MODULES[what.item]) rebuildPreview(); }
        else msg = `<i class="ti ti-player-play"></i> ${esc(M.name)}: đã xem <b>${R.progress}/${R.need}</b> quảng cáo — xem thêm ${R.need - R.progress} để mở khóa`;
        const se = window.soundEngine;
        if (se && se.playUiPurchase) se.playUiPurchase(false);
        else if (se && se.playReloadDone) se.playReloadDone();
      }
    } catch (err) { msg = `<i class="ti ti-alert-triangle"></i> ${esc(err.message)}`; }
    finally { busy = false; render(); }
  }

  return { attach, onTankLoaded, equipPreview, show, render };
})();
window.ArmoryUI = ArmoryUI;
