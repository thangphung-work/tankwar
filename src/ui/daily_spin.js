/**
 * QUAY THƯỞNG HẰNG NGÀY (sảnh)
 * - Nút "QUÀ HẰNG NGÀY" cạnh thẻ chỉ huy: chấm sáng khi còn lượt, hết lượt thì đếm ngược tới 0 giờ (giờ VN).
 * - Cửa sổ quay: dải thẻ phần thưởng (Bạc / vật tư / trang bị nâng cao) trượt ngang qua kim chỉ giữa rồi chậm dần,
 *   dừng đúng thẻ máy chủ đã bốc (POST /api/daily/spin — máy chủ quyết định, máy khách chỉ diễn).
 * - Chuỗi ngày quay liên tiếp: 7 ô, thưởng Bạc +10% / ngày (bảng thưởng: Equipment.DAILY_SPIN).
 * Cần đăng nhập (tài khoản lưu ở máy chủ); khách / chạy file:// thì nút mở bảng nhắc đăng nhập.
 */
(() => {
  if (typeof document === 'undefined' || typeof Equipment === 'undefined') return;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.Account;
  const se = () => window.soundEngine;
  const sfx = (fn, ...a) => { const s = se(); if (s && s[fn]) { try { s[fn](...a); } catch (e) { /* âm thanh không làm hỏng giao diện */ } } };
  const fmt = (n) => Math.round(n || 0).toLocaleString('vi-VN');
  const RAR = ['THƯỜNG', 'KHÁ', 'HIẾM', 'SỬ THI', 'HUYỀN THOẠI'];
  const CARD_W = 128, GAP = 10, STEP = CARD_W + GAP;
  const N_CARDS = 84, WIN_AT = 74, SPIN_MS = 10000;   // quay ~10 s: lao nhanh, chậm dần, vài thẻ cuối nhích từng chút
  const IMG_V = '16';
  const TANK_SHORT = { ALL_ROUNDER: 'HALBERD', GATLING: 'HAILSTORM', ARTILLERY: 'ARBALEST', SCOUT: 'MARTEN' };

  let btn, overlay, reel, track, spinning = false, timer = 0;

  // ---------------------------------------------------------------------------
  // THẺ PHẦN THƯỞNG
  // ---------------------------------------------------------------------------
  function imgOf(rw) {
    if (rw.kind === 'item') return Equipment.PREMIUM[rw.id] ? 'prem_' + rw.id : rw.id;
    if (rw.kind === 'ammo') return rw.ammo === 'SMOKE' ? 'smoke' : rw.ammo === 'KAMIKAZE' ? 'kami' : `ammo_${rw.tank}_${rw.ammo}`;
    return null;
  }
  function info(rw) {
    if (rw.kind === 'silver') return { title: `${fmt(rw.n)} Bạc`, sub: 'Tiền thưởng', icon: 'coins' };
    if (rw.kind === 'ammo') {
      const S = (Equipment.AMMO_SHOP[rw.tank] || {})[rw.ammo] || { name: rw.ammo };
      return { title: `+${rw.n} ${S.name}`, sub: TANK_SHORT[rw.tank] || rw.tank, icon: 'package' };
    }
    const it = Equipment.MODULES[rw.id] || Equipment.PREMIUM[rw.id] || { name: rw.id, icon: 'gift' };
    return { title: it.name, sub: `Mở khóa · ${TANK_SHORT[rw.tank] || rw.tank}`, icon: it.icon || 'gift' };
  }
  // CHỒNG THỎI BẠC (SVG): số thỏi theo giá trị — 300: 1 … 8.000: 6 (kim tự tháp 3-2-1)
  const STACKS = [[300, [1]], [500, [2]], [800, [2, 1]], [1500, [3, 1]], [3000, [3, 2]], [Infinity, [3, 2, 1]]];
  const INGOT_W = 34, INGOT_STEP = 31, ROW_H = 11, INGOT_H = 16;
  function ingot(x, y) {
    // mặt trên (sáng) + mặt trước (đậm dần) + cạnh vát hai đầu + vệt bóng
    return `<g transform="translate(${x} ${y})">
      <polygon points="0,15 34,15 31,5 3,5" fill="url(#dsIngFront)"/>
      <polygon points="3,5 31,5 28,0 6,0" fill="url(#dsIngTop)"/>
      <polygon points="0,15 3,5 6,5 3,15" fill="#000" opacity=".18"/>
      <polygon points="34,15 31,5 28,5 31,15" fill="#fff" opacity=".12"/>
      <polyline points="3,5 31,5" stroke="#fff" stroke-opacity=".75" stroke-width=".8" fill="none"/>
      <polygon points="0,15 34,15 31,5 28,0 6,0 3,5" fill="none" stroke="#4d545c" stroke-width=".8" stroke-linejoin="round"/>
      <line x1="9" y1="9.5" x2="20" y2="9.5" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
    </g>`;
  }
  function ingotStack(n) {
    const rows = STACKS.find(([v]) => n <= v)[1];
    const w = (rows[0] - 1) * INGOT_STEP + INGOT_W, h = (rows.length - 1) * ROW_H + INGOT_H;
    let g = '';
    rows.forEach((cnt, r) => {
      const x0 = (w - ((cnt - 1) * INGOT_STEP + INGOT_W)) / 2, y = h - INGOT_H - r * ROW_H;
      for (let i = 0; i < cnt; i++) g += ingot(x0 + i * INGOT_STEP, y);
    });
    const scale = Math.min(104 / w, 66 / h, 2.2);
    return `<svg class="ds-ingots" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="-1 -1 ${w + 2} ${h + 2}" aria-hidden="true">
      <defs>
        <linearGradient id="dsIngTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset="1" stop-color="#cfd5db"/></linearGradient>
        <linearGradient id="dsIngFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3cad1"/><stop offset=".55" stop-color="#9aa2ab"/><stop offset="1" stop-color="#727a83"/></linearGradient>
      </defs>${g}</svg>`;
  }

  function cardHtml(rw, cls) {
    const i = info(rw), img = imgOf(rw);
    const art = img
      ? `<img src="assets/equipment/${img}.webp?v=${IMG_V}" alt="" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'ti ti-${i.icon} ds-fallback'}))">`
      : ingotStack(rw.base || rw.n);
    return `<div class="ds-card r${rw.rar | 0} k-${rw.kind}${cls ? ' ' + cls : ''}">
      <div class="ds-art">${art}</div>
      <div class="ds-title">${esc(i.title)}</div>
      <div class="ds-sub">${esc(i.sub)}</div>
      <div class="ds-rar">${RAR[rw.rar | 0]}</div>
    </div>`;
  }
  // thẻ lót cho dải quay: bốc theo bảng thưởng thật (không lọc đồ đã có) -> người chơi thấy đúng tỉ lệ
  // lượt sắp quay là QUÀ NGÀY 7 (lượt miễn phí ngày cuối chu kỳ) -> dải lót chỉ toàn thẻ Sử thi / Huyền thoại, khớp máy chủ
  const cycDay = (streak) => Equipment.spinCycleDay(streak);
  const isSpecial = (st) => !!(st && st.free && cycDay(st.nextStreak) === Equipment.DAILY_SPIN.STREAK_MAX);
  const filler = () => Equipment.spinRoll(Math.random, null, null, isSpecial(status()));
  const pctTxt = (v) => (v < 1 ? v.toFixed(1) : Math.round(v)) + '%';

  // ---------------------------------------------------------------------------
  // GIAO DIỆN
  // ---------------------------------------------------------------------------
  function build() {
    const bar = $('.mm-top-bar'), prof = $('.mm-commander-profile');
    if (!bar || !prof) return false;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ds-open-btn';
    btn.innerHTML = '<i class="ti ti-gift"></i><span class="ds-open-txt"><b>QUÀ HẰNG NGÀY</b><small>Quay ngay</small></span><span class="ds-dot"></span>';
    bar.insertBefore(btn, prof);
    bar.classList.add('has-spin');
    btn.addEventListener('click', open);

    overlay = document.createElement('div');
    overlay.id = 'ds-overlay';
    overlay.className = 'ds-overlay hidden';
    overlay.innerHTML = `
      <div class="ds-panel" role="dialog" aria-label="Quay thưởng hằng ngày">
        <button type="button" class="ds-close acc-close" title="Đóng"><i class="ti ti-x"></i></button>
        <div class="ds-head">
          <i class="ti ti-gift"></i>
          <div><h2>QUAY THƯỞNG HẰNG NGÀY</h2><p>Mỗi ngày 1 lượt miễn phí — Bạc, vật tư hoặc trang bị nâng cao</p></div>
        </div>
        <div class="ds-streak"></div>
        <div class="ds-reel"><div class="ds-track"></div><span class="ds-needle"></span><span class="ds-fade l"></span><span class="ds-fade r"></span></div>
        <div class="ds-reveal hidden"><span class="ds-rv-rays"></span><span class="ds-rv-flash"></span><div class="ds-rv-gift"></div><div class="ds-rv-card"></div><div class="ds-rv-cap"></div></div>
        <div class="ds-result"></div>
        <div class="ds-actions"><button type="button" class="ds-spin-btn"></button><button type="button" class="ds-ad-btn hidden"></button></div>
        <div class="ds-odds"></div>
      </div>`;
    document.body.appendChild(overlay);
    reel = $('.ds-reel', overlay);
    track = $('.ds-track', overlay);
    $('.ds-close', overlay).addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
    overlay.addEventListener('keydown', (e) => e.stopPropagation());
    $('.ds-spin-btn', overlay).addEventListener('click', spin);
    $('.ds-ad-btn', overlay).addEventListener('click', watchForSpin);
    return true;
  }

  function oddsHtml(special) {
    const D = Equipment.DAILY_SPIN, P = D.POOL, W = Equipment.spinWeights(special), tot = W.reduce((s, w) => s + w, 0);
    const pct = (w) => pctTxt(100 * w / tot);
    const lab = (p) => p.kind === 'silver' ? `${fmt(p.n)} Bạc` : p.kind === 'ammo' ? 'Gói vật tư' : p.kind === 'item' ? 'Trang bị nâng cao' : 'Động cơ tăng tốc';
    return `<b>Tỉ lệ${special ? ' — QUÀ NGÀY ' + D.STREAK_MAX : ''}:</b> ` + P.map((p, i) => W[i] ? `<span class="r${p.rar}">${lab(p)} ${pct(W[i])}</span>` : '').filter(Boolean).join(' · ')
      + `<br>Chuỗi ngày: quay ${D.STREAK_MAX} ngày liên tiếp -> <b>ngày ${D.STREAK_MAX} nhận quà lớn</b> (chắc chắn Sử thi hoặc Huyền thoại), rồi chuỗi bắt đầu lại từ ngày 1. Đã có trang bị trúng -> đổi thành Bạc.`;
  }

  const status = () => { const p = A() && A().profile; return p && p.daily ? p.daily : null; };

  function countdown(next) {
    const s = Math.max(0, Math.round((next - Date.now()) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  // nút ở sảnh + nút quay trong bảng (gọi mỗi giây)
  function refresh() {
    if (!btn) return;
    const st = status(), small = $('small', btn);
    btn.classList.toggle('ready', !!(st && st.ready));
    if (!A() || !A().profile) small.textContent = 'Đăng nhập để nhận';
    else if (!st) small.textContent = '—';
    else if (st.ready) small.textContent = st.free ? (st.dev ? 'Quay ngay (dev)' : 'Quay ngay') : (st.extra || 0) + (st.bought || 0) > 0 ? `Còn ${(st.extra || 0) + (st.bought || 0)} lượt thêm` : 'Quay ngay (dev)';
    else small.textContent = 'Lượt mới sau ' + countdown(st.next);
    if (overlay && !overlay.classList.contains('hidden') && !spinning) drawControls();
    if (st && !st.ready && Date.now() > st.next + 1500 && !refresh.busy) {
      // qua 0 giờ: lấy lại hồ sơ để mở lượt mới
      refresh.busy = true;
      A().api('me').then(r => applyProfile(r.profile)).catch(() => {}).finally(() => { refresh.busy = false; });
    }
  }
  function applyProfile(p) { if (A() && A().applyProfile) A().applyProfile(p); refresh(); }

  function drawStreak(override) {
    const st = status(), box = $('.ds-streak', overlay), D = Equipment.DAILY_SPIN;
    // ô sáng = số ngày đã quay trong chu kỳ 7 ngày hiện tại; ô "cur" = ngày của lượt miễn phí sắp quay
    const freeNext = override == null && st && st.free;
    const have = override != null ? cycDay(override) : !st || !st.streak ? 0 : freeNext ? cycDay(st.nextStreak) - 1 : cycDay(st.streak);
    const nextN = freeNext ? cycDay(st.nextStreak) : 0;
    let h = '<span class="ds-streak-lab"><i class="ti ti-flame"></i> CHUỖI NGÀY</span>';
    for (let d = 1; d <= D.STREAK_MAX; d++) {
      const on = d <= have, cur = d === nextN, big = d === D.STREAK_MAX;
      h += big
        ? `<span class="ds-day big${on ? ' on' : ''}${cur ? ' cur' : ''}" title="Ngày ${d}: quà đặc biệt — chắc chắn Sử thi / Huyền thoại"><i class="ti ti-gift"></i><small>QUÀ LỚN</small></span>`
        : `<span class="ds-day${on ? ' on' : ''}${cur ? ' cur' : ''}" title="Ngày ${d}"><b>${d}</b><small>${on ? '<i class="ti ti-check"></i>' : 'NGÀY'}</small></span>`;
    }
    box.innerHTML = h;
    $('.ds-odds', overlay).innerHTML = oddsHtml(isSpecial(st) && override == null);
  }

  // nút quay: tiêu đề lớn + dòng phụ + biểu tượng phải (cùng kiểu nút TÌM TRẬN ĐẤU ở sảnh)
  const btnHtml = (title, sub, icon, spinIco) =>
    `<span class="ds-btn-txt"><b>${title}</b><small>${sub}</small></span><i class="ti ti-${icon} ds-btn-ico${spinIco ? ' ds-spin-ico' : ''}"></i>`;
  function setBtn(state, html) {
    const b = $('.ds-spin-btn', overlay);
    b.className = 'ds-spin-btn ' + state;
    b.innerHTML = html;
    return b;
  }

  function drawControls() {
    const st = status(), logged = !!(A() && A().profile);
    if (!logged) {
      setBtn('login', btnHtml('ĐĂNG NHẬP ĐỂ QUAY', 'Phần thưởng lưu vào tài khoản', 'login-2')).disabled = !(A() && A().online);
    } else if (st && st.ready) {
      const what = st.free ? 'Lượt miễn phí hôm nay' : st.extra > 0 ? `Lượt thêm từ quảng cáo (còn ${st.extra})`
        : st.bought > 0 ? `Lượt tặng từ gói nạp (còn ${st.bought})` : 'Quay lại';
      const sp = isSpecial(st);
      const sub = sp ? `Quà ngày ${Equipment.DAILY_SPIN.STREAK_MAX} · chắc chắn Sử thi / Huyền thoại${st.dev ? ' · DEV' : ''}`
        : `${what} · ngày ${cycDay(st.nextStreak)}/${Equipment.DAILY_SPIN.STREAK_MAX}${st.dev ? ' · DEV' : ''}`;
      setBtn('ready' + (sp ? ' special' : ''), btnHtml(sp ? 'MỞ QUÀ NGÀY 7' : st.free ? 'QUAY THƯỞNG' : 'QUAY THÊM', sub, sp ? 'gift' : 'chevrons-right')).disabled = false;
    } else {
      setBtn('wait', btnHtml(st ? countdown(st.next) : '--:--:--', 'Lượt mới lúc 0 giờ', 'clock')).disabled = true;
    }
    drawAdBtn();
  }

  // ---- XEM QUẢNG CÁO -> +1 LƯỢT QUAY (sau khi đã dùng lượt miễn phí; máy chủ giới hạn DAILY_SPIN.AD_SPINS / ngày) ----
  let adNote = '';
  function drawAdBtn() {
    const st = status(), b = $('.ds-ad-btn', overlay);
    const adsOn = !!(window.AdProvider && AdProvider.available());
    const show = !!(A() && A().profile && st && !st.free && st.extra <= 0 && !(st.bought > 0) && adsOn && (st.adLeft > 0 || adNote));
    b.classList.toggle('hidden', !show);
    if (!show) return;
    const used = st.adMax - st.adLeft;
    b.disabled = st.adLeft <= 0 || adBusy;
    b.innerHTML = `<i class="ti ti-${adBusy ? 'loader-2 ds-spin-ico' : 'player-play-filled'}"></i><span><b>${adBusy ? 'ĐANG MỞ QUẢNG CÁO…' : 'XEM QUẢNG CÁO · +1 LƯỢT'}</b>`
      + `<small>${adNote ? esc(adNote) : st.adLeft > 0 ? `Còn ${st.adLeft}/${st.adMax} lượt quay thêm hôm nay` : 'Đã nhận đủ lượt quay thêm hôm nay'}</small></span>`
      + `<span class="ds-ad-pips">${Array.from({ length: st.adMax }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('')}</span>`;
  }
  let adBusy = false;
  async function watchForSpin() {
    const acc = A();
    if (adBusy || spinning || !acc || !acc.watchAd) return;
    adBusy = true; adNote = '';
    drawAdBtn();
    let r;
    try { r = await acc.watchAd('-', { spin: true }, '+1 lượt quay thưởng'); }
    catch (e) { r = { status: 'error', msg: e.message }; }
    adBusy = false;
    if (r.status === 'done') {
      refresh();
      drawControls();
      spin();   // nhận lượt xong quay luôn
      return;
    }
    adNote = r.status === 'unavailable' ? 'Hiện chưa có quảng cáo, thử lại sau ít phút'
      : r.status === 'error' ? r.msg : 'Chưa xem hết quảng cáo nên chưa nhận lượt';
    sfx('playUiDenied');
    drawAdBtn();
    setTimeout(() => { adNote = ''; if (!overlay.classList.contains('hidden')) drawAdBtn(); }, 6000);
  }

  function fillTrack(win) {
    const cards = [];
    for (let i = 0; i < N_CARDS; i++) cards.push(i === WIN_AT && win ? win : filler());
    // "suýt trúng": thường đặt 1 thẻ quý ngay cạnh thẻ trúng
    if (win && win.rar < 3 && Math.random() < 0.6) {
      const near = Equipment.spinRoll(() => 0.999, null, null, false);   // ô cuối bảng = quý nhất
      cards[WIN_AT + (Math.random() < 0.5 ? -1 : 1)] = near.kind === 'silver' ? { kind: 'silver', n: 8000, rar: 4 } : near;
    }
    track.innerHTML = cards.map((c, i) => cardHtml(c, i === WIN_AT && win ? 'win' : '')).join('');
    track.style.transition = 'none';
    track.style.transform = `translate3d(${offsetFor(4, 0)}px,0,0)`;
  }
  // vị trí dải để tâm thẻ idx nằm dưới kim (jitter: lệch trong thẻ, px)
  const offsetFor = (idx, jitter) => reel.clientWidth / 2 - (idx * STEP + CARD_W / 2 + jitter);

  function open() {
    if (!overlay) return;
    const wasHidden = overlay.classList.contains('hidden');
    overlay.classList.remove('hidden');
    if (wasHidden) sfx('playUiOpen');
    if (spinning) { sfx('playSpinMusic', true); return; }   // đóng giữa lúc quay rồi mở lại: dải vẫn đang chạy, không dựng lại
    $('.ds-result', overlay).innerHTML = '';
    reel.classList.remove('done');
    drawStreak();
    drawControls();
    fillTrack(null);
    setReveal(isSpecial(status()));
  }
  // NGÀY 7: thay dải thẻ bằng hộp quà lớn (rung -> bật nắp -> lóe sáng -> thẻ thưởng cỡ lớn)
  function setReveal(on) {
    const rv = $('.ds-reveal', overlay);
    reel.classList.toggle('hidden', on);
    rv.classList.toggle('hidden', !on);
    overlay.classList.toggle('special', on);
    if (!on) return;
    rv.className = 'ds-reveal';
    $('.ds-rv-gift', rv).innerHTML = giftSvg('dsr');
    $('.ds-rv-card', rv).innerHTML = '';
    $('.ds-rv-cap', rv).innerHTML = `<b>QUÀ LỚN NGÀY ${Equipment.DAILY_SPIN.STREAK_MAX}</b><small>Chắc chắn Sử thi hoặc Huyền thoại</small>`;
  }
  async function revealSpecial(win) {
    const rv = $('.ds-reveal', overlay);
    setReveal(true);
    void rv.offsetWidth;
    const SHAKE = 2.2;
    rv.classList.add('shake');
    if (shown()) sfx('playSpinRiser', SHAKE);
    await new Promise(ok => setTimeout(ok, SHAKE * 1000));
    if (shown()) sfx('playGiftReceived', true);   // bật nắp
    $('.ds-rv-card', rv).innerHTML = cardHtml(win, 'win');
    $('.ds-rv-cap', rv).innerHTML = `<b class="r${win.rar | 0}">${RAR[win.rar | 0]}!</b><small>Quà lớn ngày ${Equipment.DAILY_SPIN.STREAK_MAX}</small>`;
    rv.classList.remove('shake');
    rv.classList.add('open', 'r' + (win.rar | 0));
    await new Promise(ok => setTimeout(ok, 700));
  }
  // đóng được cả lúc đang quay: máy chủ đã bốc thưởng, dải chạy tiếp ngầm (im tiếng) và thưởng vẫn vào tài khoản
  function close() {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    sfx('playUiClose');
    if (spinning) sfx('playSpinMusic', false);   // dải chạy ngầm, im tiếng -> trả nhạc nền
  }
  const shown = () => overlay && !overlay.classList.contains('hidden');

  async function spin() {
    if (spinning) return;
    const acc = A();
    if (!acc || !acc.profile) { if (acc && acc.online) { close(); acc.showLogin(); } return; }
    const st = status();
    if (!st || !st.ready) return;
    spinning = true;
    const res = $('.ds-result', overlay);
    setBtn('busy', btnHtml('ĐANG QUAY…', 'Chờ dải thẻ dừng lại', 'loader-2', true)).disabled = true;
    res.innerHTML = '';
    reel.classList.remove('done');
    overlay.classList.add('spinning');
    sfx('playSpinMusic', true);   // nhạc nền lùi ra sau suốt lúc quay
    let r;
    try { r = await acc.api('daily/spin', {}); }
    catch (e) {
      spinning = false; overlay.classList.remove('spinning');
      sfx('playSpinMusic', false);
      res.innerHTML = `<div class="ds-err"><i class="ti ti-alert-triangle"></i> ${esc(e.message)}</div>`;
      sfx('playUiDenied');
      if (e.status === 429) acc.api('me').then(x => applyProfile(x.profile)).catch(() => {});
      drawControls();
      return;
    }
    const win = r.reward;
    if (win.special) {
      setBtn('busy', btnHtml('ĐANG MỞ QUÀ…', 'Quà lớn ngày ' + Equipment.DAILY_SPIN.STREAK_MAX, 'loader-2', true));
      await revealSpecial(win);
    } else await runReel(win);
    spinning = false;
    overlay.classList.remove('spinning');
    if (shown()) { sfx('playSpinWin', win.rar | 0); sfx('playSpinMusic', false); }
    applyProfile(r.profile);
    drawStreak(win.streak);
    drawControls();
    showWon(win);
  }

  // NGÀY THƯỜNG: dải thẻ trượt ngang rồi dừng đúng thẻ trúng
  async function runReel(win) {
    setReveal(false);
    fillTrack(win);
    void track.offsetWidth;
    const jitter = (Math.random() - 0.5) * (CARD_W - 24);
    const from = offsetFor(4, 0), to = offsetFor(WIN_AT, jitter);
    // trượt: lao nhanh rồi chậm dần (đường cong ease-out mạnh), tiếng lẫy cóc mỗi khi 1 thẻ qua kim
    // âm thanh: "vút" lúc giật dải -> lẫy cóc từng thẻ (thưa & to dần khi chậm lại) -> trống dồn ~2,8 s cuối -> tiếng trúng
    track.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.06, 0.55, 0.08, 1)`;
    track.style.transform = `translate3d(${to}px,0,0)`;
    sfx('playSpinStart');
    const RISER = 2.8;
    const riserT = setTimeout(() => { if (spinning) { if (shown()) sfx('playSpinRiser', RISER); reel.classList.add('tense'); } }, SPIN_MS - RISER * 1000);
    let last = Math.floor((reel.clientWidth / 2 - from) / STEP), lastAt = performance.now();
    const tick = () => {
      if (!spinning) return;
      const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
      const idx = Math.floor((reel.clientWidth / 2 - m.m41 + GAP / 2) / STEP);
      if (idx !== last) {
        const now = performance.now(), gap = now - lastAt;   // khoảng cách giữa 2 thẻ: dài = chậm
        last = idx; lastAt = now;
        if (shown()) sfx('playSpinTick', Math.max(0, Math.min(1, 1 - gap / 400)));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise(ok => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        // ghim đúng vị trí cuối (khung ẩn / máy lag: hiệu ứng có thể chưa chạy xong) -> thẻ dưới kim luôn khớp kết quả
        track.style.transition = 'none';
        track.style.transform = `translate3d(${to}px,0,0)`;
        ok();
      };
      track.addEventListener('transitionend', (e) => { if (e.target === track) fin(); });
      setTimeout(fin, SPIN_MS + 1500);   // khung ẩn: không có transitionend
    });
    clearTimeout(riserT);
    reel.classList.remove('tense');
    reel.classList.add('done');
  }

  function showWon(win) {
    const res = $('.ds-result', overlay);
    const i = info(win);
    const extra = win.kind === 'item' ? (!Equipment.MODULES[win.id] ? ' <small>— đạn đã mở khóa, tự dùng mỗi trận</small>' : win.equipped ? ' <small>— đã lắp lên xe, dùng ngay trận sau</small>' : ' <small>— đã vào kho (nhóm đã đủ ô), lắp ở phòng xem xe</small>')
      : win.kind === 'ammo' ? ' <small>— đã vào kho vật tư</small>' : '';
    res.innerHTML = `<div class="ds-won r${win.rar | 0}">${win.special ? `<span class="ds-won-special"><i class="ti ti-gift"></i> QUÀ NGÀY ${Equipment.DAILY_SPIN.STREAK_MAX}</span> ` : ''}<span class="ds-won-rar">${RAR[win.rar | 0]}</span> <b>${esc(i.title)}</b>${win.kind !== 'silver' ? ` · ${esc(i.sub)}` : ''}${extra}</div>`;
    try { window.dispatchEvent(new CustomEvent('armory-changed')); } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // MODAL CHÚC MỪNG NGÀY MỚI: có lượt quay miễn phí mới -> tự hiện 1 lần / ngày / tài khoản khi đang ở sảnh
  // ---------------------------------------------------------------------------
  let greet = null, lobbySince = 0;
  const GREET_KEY = 'ds-greet:';
  const vnDay = (next) => new Date(next - 86400e3 + 7 * 3600e3).toISOString().slice(0, 10);   // next = 0 giờ VN hôm sau
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* chế độ riêng tư: bỏ qua */ } }
  };
  function lobbyIdle() {
    const mm = document.getElementById('matchmaking-overlay');
    if (!mm || mm.classList.contains('hidden')) return false;
    const cs = getComputedStyle(mm);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    // không chen lên cửa sổ khác đang mở (quay thưởng, đăng nhập, nạp, quảng cáo…)
    if (overlay && !overlay.classList.contains('hidden')) return false;
    const auth = document.getElementById('acc-auth');
    if (auth && auth.offsetParent) return false;
    if (document.querySelector('.eqp-ad:not(.hidden), .tp-overlay:not(.hidden)')) return false;
    return true;
  }
  // HỘP QUÀ (SVG tô màu): thân + nắp + ruy băng đỏ + nơ + lấp lánh
  function giftSvg(pre) {
    pre = pre || 'dsg';
    const star = (x, y, s, d) => `<path class="ds-gs" style="animation-delay:${d}s" transform="translate(${x} ${y}) scale(${s})" d="M0,-6 C.6,-1 1,-.6 6,0 C1,.6 .6,1 0,6 C-.6,1 -1,.6 -6,0 C-1,-.6 -.6,-1 0,-6Z" fill="#ffe7a8"/>`;
    return `<svg class="ds-gift" viewBox="0 0 96 96" width="92" height="92" aria-hidden="true">
      <defs>
        <linearGradient id="${pre}Body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9a840"/><stop offset="1" stop-color="#a8681a"/></linearGradient>
        <linearGradient id="${pre}Lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#d9952f"/></linearGradient>
        <linearGradient id="${pre}Rib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8e2a1c"/><stop offset=".45" stop-color="#d4523a"/><stop offset="1" stop-color="#8e2a1c"/></linearGradient>
        <linearGradient id="${pre}Bow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2654a"/><stop offset="1" stop-color="#9c3020"/></linearGradient>
      </defs>
      <ellipse cx="48" cy="88" rx="30" ry="4" fill="#000" opacity=".45"/>
      <g class="ds-gift-box">
        <rect x="18" y="46" width="60" height="40" rx="2" fill="url(#${pre}Body)"/>
        <rect x="18" y="46" width="60" height="6" fill="#000" opacity=".18"/>
        <rect x="18" y="46" width="30" height="40" fill="#fff" opacity=".06"/>
        <rect x="42" y="46" width="12" height="40" fill="url(#${pre}Rib)"/>
        <g class="ds-gift-lid">
          <rect x="13" y="34" width="70" height="14" rx="2.5" fill="url(#${pre}Lid)"/>
          <rect x="13" y="34" width="70" height="3" rx="1.5" fill="#fff" opacity=".4"/>
          <rect x="41" y="34" width="14" height="14" fill="url(#${pre}Rib)"/>
          <path d="M48,34 C40,18 22,16 25,27 C27,33 38,34 48,34Z" fill="url(#${pre}Bow)"/>
          <path d="M48,34 C56,18 74,16 71,27 C69,33 58,34 48,34Z" fill="url(#${pre}Bow)"/>
          <path d="M46,33 C40,25 31,22 30,26" stroke="#ff9a7e" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
          <path d="M50,33 C56,25 65,22 66,26" stroke="#ff9a7e" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
          <rect x="43.5" y="28" width="9" height="8" rx="2.5" fill="#b83c27"/>
          <rect x="45" y="29" width="4" height="2" rx="1" fill="#ff9a7e" opacity=".7"/>
        </g>
      </g>
      ${star(12, 20, 1, 0)}${star(84, 14, .8, .7)}${star(88, 50, .6, 1.3)}${star(8, 56, .55, 1.9)}
    </svg>`;
  }
  function buildGreet() {
    greet = document.createElement('div');
    greet.className = 'ds-greet hidden';
    greet.innerHTML = `
      <div class="ds-greet-panel" role="dialog" aria-label="Chúc mừng nhận lượt quay may mắn">
        <span class="ds-greet-rays" aria-hidden="true"></span>
        <div class="ds-greet-ico">${giftSvg()}</div>
        <h2>CHÚC MỪNG CHỈ HUY!</h2>
        <p class="ds-greet-msg">Ngày mới đã tới — bạn nhận được <b>1 lượt quay may mắn</b> miễn phí.</p>
        <div class="ds-greet-streak"></div>
        <div class="ds-greet-actions">
          <button type="button" class="ds-greet-go"><i class="ti ti-chevrons-right"></i> QUAY NGAY</button>
          <button type="button" class="ds-greet-later">Để sau</button>
        </div>
      </div>`;
    document.body.appendChild(greet);
    $('.ds-greet-go', greet).addEventListener('click', () => { hideGreet(); open(); spin(); });
    $('.ds-greet-later', greet).addEventListener('click', hideGreet);
    greet.addEventListener('click', (e) => { if (e.target === greet) hideGreet(); });
    greet.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') hideGreet(); });
  }
  function hideGreet() { if (greet) greet.classList.add('hidden'); }
  function showGreet(st) {
    if (!greet) buildGreet();
    const D = Equipment.DAILY_SPIN, day = cycDay(st.nextStreak), sp = isSpecial(st), left = D.STREAK_MAX - day;
    greet.classList.toggle('special', sp);
    $('h2', greet).textContent = sp ? 'QUÀ LỚN NGÀY 7!' : 'CHÚC MỪNG CHỈ HUY!';
    $('.ds-greet-msg', greet).innerHTML = sp
      ? `Bạn đã quay đủ <b>${D.STREAK_MAX} ngày liên tiếp</b> — lượt quay hôm nay <b>chắc chắn ra đồ Sử thi hoặc Huyền thoại</b>.`
      : 'Ngày mới đã tới — bạn nhận được <b>1 lượt quay may mắn</b> miễn phí.';
    $('.ds-greet-go', greet).innerHTML = sp ? '<i class="ti ti-gift"></i> MỞ QUÀ NGAY' : '<i class="ti ti-chevrons-right"></i> QUAY NGAY';
    $('.ds-greet-streak', greet).innerHTML = sp
      ? '<i class="ti ti-flame"></i> Sau hôm nay chuỗi bắt đầu lại từ ngày 1'
      : `<i class="ti ti-flame"></i> Chuỗi ngày <b>${day}</b>/${D.STREAK_MAX}`
        + `<br><i class="ti ti-gift"></i> Còn <b>${left} ngày</b> nữa tới quà lớn ngày ${D.STREAK_MAX} (chắc chắn Sử thi / Huyền thoại)`;
    greet.classList.remove('hidden');
    sfx('playGiftReceived', sp);
    setTimeout(() => { const b = $('.ds-greet-go', greet); if (b && !greet.classList.contains('hidden')) b.focus(); }, 50);
  }
  function checkGreet() {
    const acc = A(), p = acc && acc.profile, st = status();
    if (!p || !st || !st.free || spinning || (greet && !greet.classList.contains('hidden'))) { lobbySince = 0; return; }
    if (!lobbyIdle()) { lobbySince = 0; return; }
    const key = GREET_KEY + (p.username || '?'), day = vnDay(st.next);
    if (store.get(key) === day) return;
    if (!lobbySince) { lobbySince = Date.now(); return; }
    if (Date.now() - lobbySince < 1200) return;   // để sảnh hiện hẳn rồi mới chúc mừng
    store.set(key, day);
    showGreet(st);
  }

  function init() {
    if (!build()) return;
    refresh();
    timer = setInterval(() => { refresh(); checkGreet(); }, 1000);
    // hồ sơ đổi (đăng nhập / hết trận): Account gọi renderHeader -> ta chỉ cần làm mới định kỳ (1 s)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // xem thử modal chúc mừng (console): DailySpin.greet() — ngày thường, DailySpin.greet(true) — quà ngày 7
  function previewGreet(special) {
    const st = Object.assign({}, status() || { next: Date.now() + 3600e3 }, { free: true, nextStreak: special ? Equipment.DAILY_SPIN.STREAK_MAX : 2 });
    showGreet(st);
  }
  // xem thử cảnh mở quà ngày 7 (không gọi máy chủ, không nhận thưởng): DailySpin.reveal() / DailySpin.reveal(4)
  async function previewReveal(rar) {
    if (!overlay || spinning) return;
    const win = rar === 4 ? { kind: 'silver', n: 8000, rar: 4, special: true } : Equipment.spinRoll(Math.random, null, null, true);
    win.special = true;
    overlay.classList.remove('hidden');
    $('.ds-result', overlay).innerHTML = '';
    drawStreak();
    spinning = true;
    sfx('playSpinMusic', true);
    await revealSpecial(win);
    spinning = false;
    sfx('playSpinWin', win.rar | 0);
    sfx('playSpinMusic', false);
    showWon(win);
  }
  window.DailySpin = { open, refresh, greet: previewGreet, reveal: previewReveal };
})();
