/**
 * LỆNH NHANH QUA BỘ ĐÀM (giữ Z): vòng chọn 8 lệnh quanh con trỏ (trong kính ngắm: quanh tâm màn hình), rê chuột chọn,
 * thả Z (hoặc nhấp trái) để phát, Esc / chuột phải để hủy.
 * - Lệnh có vị trí lấy điểm dưới con trỏ LÚC BẤM Z (trỏ chỗ trước rồi mới mở vòng): ATTACK / DEFEND (gần cứ điểm thì đọc
 *   thêm "Objective Alpha…"), ENEMY SPOTTED (trỏ đúng xe địch thì ghim theo xe), FOCUS FIRE (xe đang khóa, không có thì xe
 *   địch dưới con trỏ), NEED BACKUP / FALL BACK (vị trí xe mình), AFFIRMATIVE / NEGATIVE (không vị trí)
 * - Chỉ đồng đội nhận: máy chủ chỉ chuyển gói QCMD cho máy cùng phe (server_auth.js), máy nhận lọc phe lần nữa
 * - Giọng chỉ huy tiếng Anh thu sẵn (assets/sfx/radio/*.wav, 16 kHz) phát qua chuỗi lọc bộ đàm: cắt dải 450-3300 Hz,
 *   bão hòa nhẹ, tiếng xẹt mở / đóng kênh, nền nhiễu khẽ; cao độ lệch chút theo từng người gửi. Có thể thay file bằng
 *   giọng thu âm thật cùng tên
 * - Xe gãy ăng-ten (dmg.radioLost) không phát được; spam bị chặn (3 lệnh / 6 s ở máy mình, máy chủ chặn thêm)
 * - Dấu ghim: nhãn 2D chiếu lên màn hình (ra ngoài khung thì bám mép), vòng nháy trên minimap & bản đồ lớn
 */
const QuickComms = (() => {
  // thứ tự theo chiều kim đồng hồ từ đỉnh vòng (AFFIRMATIVE bên phải, NEGATIVE bên trái)
  const CMDS = [
    { id: 'attack', label: 'ATTACK', short: 'ATK', icon: 'swords', col: '#ff6a4d', at: 'point', obj: true },
    { id: 'focus', label: 'FOCUS FIRE', short: 'FOC', icon: 'target-arrow', col: '#ff4d4d', at: 'target' },
    { id: 'yes', label: 'AFFIRMATIVE', short: 'YES', icon: 'circle-check', col: '#5cf08a', at: null },
    { id: 'backup', label: 'NEED BACKUP', short: 'SOS', icon: 'sos', col: '#ffb020', at: 'self' },
    { id: 'fallback', label: 'FALL BACK', short: 'RTB', icon: 'arrow-back-up', col: '#e7a63a', at: 'self' },
    { id: 'defend', label: 'DEFEND', short: 'DEF', icon: 'shield-half', col: '#5fb0dc', at: 'point', obj: true },
    { id: 'no', label: 'NEGATIVE', short: 'NO', icon: 'circle-x', col: '#e0675c', at: null },
    { id: 'spotted', label: 'ENEMY SPOTTED', short: 'SPT', icon: 'eye', col: '#ffd60a', at: 'enemy' }
  ];
  const CLIPS = ['attack', 'focus', 'yes', 'backup', 'fallback', 'defend', 'no', 'spotted', 'obj_a', 'obj_b', 'obj_c'];
  const PIN_TTL = 12;            // giây dấu ghim còn hiện (mờ dần 2 s cuối)
  const SPAM_N = 3, SPAM_WIN = 6000, SAME_MS = 1500;
  const DEAD_R = 26;             // px: con trỏ trong vòng này = chưa chọn lệnh
  const TWO_PI = Math.PI * 2;

  let game = null;
  const buffers = {};
  let loading = false, noise = null, busyUntil = 0;
  const pins = new Map();        // id xe gửi -> { cmd, x, z, target, unit, t0, mine }
  const sent = [];               // thời điểm các lệnh mình đã phát (chặn spam)
  let lastCmd = -1, lastAt = 0;
  let W = null;                  // trạng thái vòng chọn đang mở
  let wheelEl = null, pinLayer = null;
  const pinEls = [];
  const now = () => performance.now() / 1000;

  // ---------------------------------------------------------------------------
  // ÂM THANH
  // ---------------------------------------------------------------------------
  function load() {
    const se = window.soundEngine;
    if (loading || !se || !se.ctx || typeof fetch !== 'function') return;
    loading = true;
    for (const k of CLIPS) {
      fetch('assets/sfx/radio/' + k + '.wav')
        .then(r => (r.ok ? r.arrayBuffer() : null))
        .then(b => (b ? se.ctx.decodeAudioData(b) : null))
        .then(a => { if (a) buffers[k] = a; })
        .catch(() => {});
    }
  }

  function noiseBuf(ctx) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  let shaperCurve = null;
  function curve() {
    if (shaperCurve) return shaperCurve;
    const n = 1024, k = 2.6, c = new Float32Array(n), tk = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / tk; }
    return (shaperCurve = c);
  }

  // Cao độ riêng từng người gửi (±5%): nhiều đồng đội cùng gọi nghe vẫn phân biệt được
  function voiceRate(unit) {
    const s = String(unit && (unit.netId !== undefined ? unit.netId : unit.id) || 0);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 1 + ((Math.abs(h) % 9) - 4) * 0.012;
  }

  // Một lượt phát: xẹt mở kênh -> các câu nối tiếp -> xẹt đóng kênh. Lượt sau xếp hàng chờ lượt trước (tối đa ~4 s)
  function transmit(keys, unit) {
    const se = window.soundEngine;
    if (!se || !se.ready() || !se.uiBus) return;
    load();
    const bufs = keys.map(k => buffers[k]).filter(Boolean);
    if (!bufs.length) { se.playRadioChirp(); return; }
    const ctx = se.ctx, t0 = Math.max(ctx.currentTime + 0.02, busyUntil);
    if (t0 - ctx.currentTime > 4) return;
    const rate = voiceRate(unit);

    const out = se.headset(1.08);
    const pre = ctx.createGain(); pre.gain.value = 0.82;
    // Chất máy PRC/bộ đàm chiến thuật: bỏ trầm và cực cao, dồn năng lượng vào
    // vùng phụ âm 1–2,5 kHz để câu lệnh vẫn xuyên qua tiếng động cơ/pháo.
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 360; hp.Q.value = 0.85;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 1050; body.Q.value = 0.9; body.gain.value = 3.5;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2050; pk.Q.value = 1.15; pk.gain.value = 6.5;
    const sh = ctx.createWaveShaper(); sh.curve = curve(); sh.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26; comp.knee.value = 5; comp.ratio.value = 7;
    comp.attack.value = 0.002; comp.release.value = 0.11;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3050; lp.Q.value = 0.9;
    const post = ctx.createGain(); post.gain.value = 0.68;
    pre.connect(hp); hp.connect(body); body.connect(pk); pk.connect(sh); sh.connect(comp); comp.connect(lp); lp.connect(post); post.connect(out);

    // Mở squelch + tiếng tách cơ của nút PTT.
    se.burst(out, t0, { filter: 'bandpass', freq: 1750, Q: 0.55, gain: 0.16, dur: 0.085 });
    se.burst(out, t0 + 0.018, { filter: 'highpass', freq: 2850, Q: 0.5, gain: 0.055, dur: 0.035 });
    se.tone(out, t0 + 0.006, { type: 'square', freq: 1850, gain: 0.032, attack: 0.001, hold: 0.012, dur: 0.012 });
    let t = t0 + 0.105;
    for (const b of bufs) {
      const s = ctx.createBufferSource();
      s.buffer = b; s.playbackRate.value = rate;
      s.connect(pre); s.start(t);
      t += b.duration / rate + 0.06;
    }
    const tEnd = t - 0.04;
    // Nền sóng hẹp trong lúc giữ kênh: đủ nghe ra bộ đàm nhưng không lấn lời.
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(ctx); n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1650; nf.Q.value = 0.72;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t0); ng.gain.linearRampToValueAtTime(0.019, t0 + 0.045);
    ng.gain.setValueAtTime(0.019, tEnd); ng.gain.linearRampToValueAtTime(0, tEnd + 0.045);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    n.start(t0); n.stop(tEnd + 0.05);
    // Vài đốm nhiễu mất sóng cực ngắn, lệch nhau theo người gửi để không lặp máy móc.
    const seed = Math.abs(String(unit && (unit.netId ?? unit.id) || 0).split('').reduce((h, c) => (h * 33 + c.charCodeAt(0)) | 0, 5381));
    for (let q = t0 + 0.31 + (seed % 7) * 0.013, i = 0; q < tEnd - 0.12; q += 0.29 + ((seed >> (i++ % 12)) & 7) * 0.017) {
      se.burst(out, q, { filter: 'bandpass', freq: 2300 + (i % 3) * 280, Q: 1.1, gain: 0.012, dur: 0.012 + (i % 2) * 0.009 });
    }
    // Nhả PTT: đuôi squelch "kssh" rồi relay tách gọn.
    se.burst(out, tEnd, { filter: 'bandpass', freq: 2250, Q: 0.5, gain: 0.14, dur: 0.18 });
    se.burst(out, tEnd + 0.035, { filter: 'highpass', freq: 3200, Q: 0.45, gain: 0.045, dur: 0.085 });
    se.tone(out, tEnd + 0.145, { type: 'square', freq: 900, gain: 0.018, attack: 0.001, hold: 0.009, dur: 0.008 });
    busyUntil = tEnd + 0.3;
  }

  // ---------------------------------------------------------------------------
  // GỬI / NHẬN
  // ---------------------------------------------------------------------------
  const radioLost = u => !!(u && u.dmg && u.dmg.radioLost);

  function objectiveAt(x, z) {
    for (const cp of (game && game.capturePoints) || []) {
      if (Math.hypot(x - cp.x, z - cp.z) < (cp.radius || 85) + 30) return String(cp.id || '').toUpperCase().slice(0, 1);
    }
    return '';
  }

  function issue(c, anchor) {
    const P = game && game.player, C = CMDS[c];
    if (!P || P.isDead || !C) return;
    if (radioLost(P)) { game.addCombatLog('[[antenna-bars-off]] RADIO DAMAGED — ăng-ten gãy, không phát được lệnh', 'alert'); return; }
    const ms = performance.now();
    if (c === lastCmd && ms - lastAt < SAME_MS) return;
    while (sent.length && ms - sent[0] > SPAM_WIN) sent.shift();
    if (sent.length >= SPAM_N) {
      game.addCombatLog(`[[radio]] RADIO NET BUSY — chờ ${Math.ceil((SPAM_WIN - (ms - sent[0])) / 1000)} s`, 'alert');
      return;
    }
    const d = { c };
    let target = null;
    if (C.at === 'self') { d.x = P.x; d.z = P.z; }
    else if (C.at === 'point' || C.at === 'enemy') {
      if (C.at === 'enemy' && anchor && anchor.enemy) target = anchor.enemy;
      const p = target || (anchor && anchor.x !== undefined ? anchor : P);
      d.x = p.x; d.z = p.z;
    } else if (C.at === 'target') {
      const L = game.lockedTarget;
      target = L && !L.isDead && L.team !== P.team ? L : anchor && anchor.enemy;
      if (!target) { game.addCombatLog('[[target-arrow]] FOCUS FIRE: khóa (Tab / nhấp) hoặc trỏ vào xe địch trước', 'alert'); return; }
      d.x = target.x; d.z = target.z;
    }
    if (d.x !== undefined) { d.x = Math.round(d.x); d.z = Math.round(d.z); }
    if (C.obj) { const o = objectiveAt(d.x, d.z); if (o) d.o = o; }
    if (target && target.netId !== undefined) d.t = target.netId;
    sent.push(ms); lastCmd = c; lastAt = ms;
    receive(P, d, target);
    if (game.netSync && game.netSync.sendCommand) game.netSync.sendCommand(P, d);
  }

  /** Lệnh từ xe `unit` (mình hoặc đồng đội qua mạng). target: xe được ghim (nếu có) */
  function receive(unit, d, target) {
    const P = game && game.player, C = d && CMDS[d.c];
    if (!P || !unit || !C || unit.team !== P.team || radioLost(unit)) return;
    const mine = unit === P;
    let where = '';
    if (d.x !== undefined && Number.isFinite(d.x) && Number.isFinite(d.z)) {
      pins.set(unit.id, { cmd: C, x: d.x, z: d.z, target: target || null, unit, t0: now(), mine });
      if (!mine) where = ` — ${Math.round(Math.hypot(d.x - P.x, d.z - P.z))}M`;
    }
    const obj = d.o && /^[ABC]$/.test(d.o) ? d.o : '';
    game.addCombatLog(`[[${C.icon}]] ${mine ? 'YOU' : unit.name}: ${C.label}${obj ? ' · OBJECTIVE ' + obj : ''}${where}`, 'radio');
    transmit(obj ? [C.id, 'obj_' + obj.toLowerCase()] : [C.id], unit);
  }

  // ---------------------------------------------------------------------------
  // VÒNG CHỌN LỆNH
  // ---------------------------------------------------------------------------
  function buildWheel() {
    if (wheelEl) return;
    wheelEl = document.createElement('div');
    wheelEl.className = 'qc-wheel';
    const R = 128;
    wheelEl.innerHTML = CMDS.map((C, i) => {
      const a = i * Math.PI / 4, x = Math.sin(a) * R, y = -Math.cos(a) * R;
      return `<div class="qc-item" data-i="${i}" style="--c:${C.col};transform:translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)">`
        + `<i class="ti ti-${C.icon}" aria-hidden="true"></i><b>${C.label}</b></div>`;
    }).join('') + '<div class="qc-hub"><span class="qc-hub-k">RADIO</span><span class="qc-hub-l"></span></div><div class="qc-dir"></div>';
    document.body.appendChild(wheelEl);
  }

  function canOpen() {
    const g = game, P = g && g.player;
    if (!g || !g.isGameStarted || g.isGameOver || !P || P.isDead) return false;
    if ((window.GameMenu && GameMenu.isOpen && GameMenu.isOpen()) || (window.tankInspector && window.tankInspector.isOpen)) return false;
    return true;
  }

  let mouseX = -1, mouseY = -1;   // vị trí con trỏ thật (cả khi đang trên bản đồ lớn / minimap, không chỉ trên màn 3D)

  function open() {
    buildWheel();
    const g = game, cv = g.renderer.domElement, r = cv.getBoundingClientRect();
    const S = g._sight, M = g._mouse, locked = document.pointerLockElement === cv;
    // trỏ trên bản đồ lớn (M) hoặc trong vòng minimap: điểm chỉ định lấy theo tọa độ bản đồ — ghim được chỗ thật xa
    const onMap = !locked && mouseX >= 0 && g.tacticalMap && g.tacticalMap.pickAt ? g.tacticalMap.pickAt(mouseX, mouseY) : null;
    let cx, cy, anchor;
    if (onMap) { cx = mouseX; cy = mouseY; anchor = onMap; }
    else if (g.tacticalMap && g.tacticalMap.isOpen) return;   // bản đồ đang mở nhưng con trỏ ngoài khung bản đồ
    else {
      if (S || locked || !M || !M.on) { const o = (S && S.free && g._retOff) || { x: 0, y: 0 }; cx = r.left + r.width / 2 + o.x; cy = r.top + r.height / 2 + o.y; }
      else { cx = M.x; cy = M.y; }
      // điểm chỉ định = dưới con trỏ / tâm kính lúc bấm Z (màn drone pháo: tâm khung bản đồ hỏa lực)
      anchor = g.screenPick ? g.screenPick(cx, cy) : null;
      if (S && S.arty && S.cx !== undefined) anchor = { x: S.cx, z: S.cz, enemy: null };
    }
    // vòng luôn nằm trọn trong màn hình
    const m = 180, wx = Math.max(m, Math.min(window.innerWidth - m, cx)), wy = Math.max(m, Math.min(window.innerHeight - m, cy));
    W = { cx: wx, cy: wy, dx: cx - wx, dy: cy - wy, locked, sel: -1, anchor };
    wheelEl.style.left = wx + 'px'; wheelEl.style.top = wy + 'px';
    wheelEl.classList.add('on');
    select();
  }

  function select() {
    if (!W) return;
    const L = Math.hypot(W.dx, W.dy);
    let i = -1;
    if (L > DEAD_R) i = ((Math.round(Math.atan2(W.dx, -W.dy) / (Math.PI / 4)) % 8) + 8) % 8;
    if (L > 160) { W.dx *= 160 / L; W.dy *= 160 / L; }   // khóa chuột: không để độ lệch ảo trôi quá xa
    if (i === W.sel) return;
    W.sel = i;
    wheelEl.querySelectorAll('.qc-item').forEach((el, k) => el.classList.toggle('sel', k === i));
    const lbl = wheelEl.querySelector('.qc-hub-l'), dir = wheelEl.querySelector('.qc-dir');
    lbl.textContent = i < 0 ? 'SELECT' : CMDS[i].label;
    wheelEl.style.setProperty('--sel', i < 0 ? 'transparent' : CMDS[i].col);
    dir.style.transform = `translate(-50%,-50%) rotate(${i * 45}deg)`;
    dir.style.opacity = i < 0 ? 0 : 1;
  }

  function close(commit) {
    if (!W) return;
    const w = W;
    W = null;
    wheelEl.classList.remove('on');
    if (commit && w.sel >= 0) issue(w.sel, w.anchor);
  }

  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    const typing = (e) => { const t = e.target; return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && t.offsetParent !== null); };
    window.addEventListener('keydown', (e) => {
      if (W) {
        if (e.key === 'Escape') { close(false); e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      if (e.code !== 'KeyZ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e) || !canOpen()) return;
      e.preventDefault();
      open();
    }, true);
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyZ') close(true); }, true);
    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      if (!W) return;
      if (W.locked || document.pointerLockElement) { W.dx += e.movementX || 0; W.dy += e.movementY || 0; }
      else { W.dx = e.clientX - W.cx; W.dy = e.clientY - W.cy; }
      select();
    }, true);
    // vòng đang mở: chuột không bắn / ngắm / lái (chặn trước các bộ nghe của màn 3D). Nhấp để đóng vòng thì các sự kiện
    // theo sau của cùng cú nhấp (mousedown / mouseup / click / contextmenu) cũng bị nuốt — chuột phải không thành "lái tới"
    let eatUntil = 0;
    const eat = (e) => {
      if (!W && performance.now() > eatUntil) return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    window.addEventListener('pointerdown', (e) => {
      if (!W) return;
      eat(e);
      eatUntil = performance.now() + 400;
      close(e.button === 0);
    }, true);
    for (const ev of ['mousedown', 'mouseup', 'pointerup', 'click', 'contextmenu']) window.addEventListener(ev, eat, true);
    window.addEventListener('blur', () => close(false));
  }

  // ---------------------------------------------------------------------------
  // DẤU GHIM TRÊN MÀN HÌNH & BẢN ĐỒ
  // ---------------------------------------------------------------------------
  // vị trí hiện của dấu: ghim theo xe địch khi phe mình còn biết vị trí xe đó, không thì đứng ở điểm báo
  function pinPos(p) {
    const tg = p.target, P = game.player;
    if (tg && !tg.isDead && (typeof TeamIntel === 'undefined' || TeamIntel.knows(P, tg))) { p.x = tg.x; p.z = tg.z; return { x: tg.x, y: (tg.y || 0) + 16, z: tg.z }; }
    const y = game.terrain && game.terrain.getElevationAt ? game.terrain.getElevationAt(p.x, p.z) : 0;
    return { x: p.x, y: y + 10, z: p.z };
  }

  function alive(p, tn) {
    if (tn - p.t0 > PIN_TTL) return false;
    if (p.cmd.at === 'target' && p.target && p.target.isDead) return false;
    if (p.unit.isDead && p.cmd.at === 'self') return false;
    return true;
  }

  const fmtD = (d) => d >= 1000 ? (d / 1000).toFixed(1) + 'KM' : Math.round(d) + 'M';

  function update() {
    if (W && !canOpen()) close(false);
    const g = game, P = g && g.player, tn = now();
    for (const [id, p] of pins) if (!alive(p, tn)) pins.delete(id);
    if (!pinLayer) { pinLayer = document.createElement('div'); pinLayer.className = 'qc-pins'; document.body.appendChild(pinLayer); }
    const list = P && g.camera && g.isGameStarted ? [...pins.values()] : [];
    while (pinEls.length < list.length) {
      const el = document.createElement('div');
      el.className = 'qc-pin';
      el.innerHTML = '<i class="ti"></i><b></b><span></span>';
      pinLayer.appendChild(el);
      pinEls.push(el);
    }
    if (!list.length) { for (const el of pinEls) el.style.display = 'none'; return; }
    const cv = g.renderer.domElement, r = cv.getBoundingClientRect();
    const v = typeof THREE !== 'undefined' ? (update._v || (update._v = new THREE.Vector3())) : null;
    const hideForMap = g.tacticalMap && g.tacticalMap.isOpen;
    pinEls.forEach((el, i) => {
      const p = list[i];
      if (!p || hideForMap || !v) { el.style.display = 'none'; return; }
      const w = pinPos(p);
      v.set(w.x, w.y, w.z).project(g.camera);
      let x = v.x, y = v.y;
      const behind = v.z > 1;
      if (behind) { x = -x; y = -y; }
      const edge = behind || Math.abs(x) > 0.94 || Math.abs(y) > 0.9;
      if (edge) { const k = Math.max(Math.abs(x) / 0.94, Math.abs(y) / 0.9, 1e-6); x /= k; y /= k; }
      const sx = r.left + (x + 1) / 2 * r.width, sy = r.top + (1 - y) / 2 * r.height;
      const age = tn - p.t0, fade = Math.min(1, (PIN_TTL - age) / 2);
      el.style.display = '';
      el.style.opacity = fade.toFixed(2);
      el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
      el.style.setProperty('--c', p.cmd.col);
      el.classList.toggle('edge', edge);
      el.classList.toggle('fresh', age < 1.2);
      const ic = el.firstChild;
      if (ic._n !== p.cmd.icon) { ic.className = 'ti ti-' + p.cmd.icon; ic._n = p.cmd.icon; }
      const lb = p.cmd.short + (p.mine ? '' : ' · ' + String(p.unit.name || '').slice(0, 14));
      if (el.children[1].textContent !== lb) el.children[1].textContent = lb;
      const ds = fmtD(Math.hypot(p.x - P.x, p.z - P.z));
      if (el.children[2].textContent !== ds) el.children[2].textContent = ds;
    });
  }

  /**
   * Vẽ dấu lệnh lên minimap / bản đồ lớn. toScreen(x, z) -> {x, y}.
   * opt.inside(x, z): điểm có nằm trong vùng vẽ; opt.rim(x, z, draw, label, col): chấm chỉ hướng trên mép (minimap)
   */
  function drawOnMap(ctx, toScreen, opt = {}) {
    if (!pins.size || !game || !game.player) return;
    const tn = now();
    ctx.save();
    for (const p of pins.values()) {
      if (!alive(p, tn)) continue;
      const age = tn - p.t0, fade = Math.min(1, (PIN_TTL - age) / 2), col = p.cmd.col;
      const draw = (sx, sy, small) => {
        const rr = small ? 4 : 6.5;
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(10,13,12,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx, sy - rr); ctx.lineTo(sx + rr, sy); ctx.lineTo(sx, sy + rr); ctx.lineTo(sx - rr, sy); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, small ? 1.4 : 2, 0, TWO_PI); ctx.fill();
        if (!small) {
          // sóng vòng lan ra: 2 nhịp đầu sáng hơn
          const ph = (age * 0.9) % 1, a0 = age < 2 ? 0.9 : 0.45;
          ctx.globalAlpha = fade * a0 * (1 - ph); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(sx, sy, rr + 3 + ph * 16, 0, TWO_PI); ctx.stroke();
          ctx.globalAlpha = fade;
          ctx.font = 'bold 9px Chakra Petch, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(p.cmd.short, sx + rr + 3, sy);
          ctx.fillText(p.cmd.short, sx + rr + 3, sy);
        }
      };
      if (opt.inside && !opt.inside(p.x, p.z)) {
        if (opt.rim) opt.rim(p.x, p.z, (mx, my) => draw(mx, my, true), null, col);
        continue;
      }
      const s = toScreen(p.x, p.z);
      draw(s.x, s.y, false);
    }
    ctx.restore();
  }

  function bind(g) { game = g; install(); load(); }
  function reset() {
    pins.clear(); sent.length = 0; lastCmd = -1; close(false);
    for (const el of pinEls) el.style.display = 'none';
  }
  const isOpen = () => !!W;

  return { CMDS, bind, reset, update, issue, receive, drawOnMap, isOpen };
})();
window.QuickComms = QuickComms;
