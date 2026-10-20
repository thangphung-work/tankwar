/**
 * ÂM THANH GIAO DIỆN (sảnh, bảng chọn, cài đặt) — tổng hợp, kiểu bảng điều khiển quân sự:
 * - Rê chuột qua thẻ / nút: tiếng "tích" rất khẽ
 * - Bấm nút: công tắc gạt "cạch"; chuyển tab: "tách" nhẹ
 * - Chọn xe: chốt khóa thép "cộp" + tiếng máy riêng từng loại xe (tăng: diesel gầm; 6 nòng: mô-tơ rít vòng tua;
 *   pháo tự hành: xi-lanh thủy lực xì + khóa nòng đóng; trinh sát: máy nhẹ rồ nhanh) + kèn đồng chớp khi nhạc bật
 * - Chọn bản đồ: tiếng giấy bản đồ phẩy + bíp radar xác nhận + trầm xa
 * - TÌM TRẬN: cú "CHẮC" nặng như khóa nòng; HỦY: hai bíp đi xuống
 * - Mở / đóng bảng: tiếng gió lướt lên / xuống
 * Gắn bằng lắng nghe chung cả trang (event delegation) — không cần sửa từng file giao diện.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau music.js.
 */
(function () {
  if (typeof SoundEngine === 'undefined') return;

  SoundEngine.mixin(class {
    uiOut(gain = 1, wet = 0.06) {
      return this.voice({ bus: this.uiBus || this.masterGain, gain, wet });
    }

    playUiHover() {
      if (!this.ready()) return;
      const now = this.ctx.currentTime;
      if (now - (this._uiHoverT || 0) < 0.05) return;
      this._uiHoverT = now;
      const out = this.uiOut(0.45, 0);
      this.burst(out, now, { filter: 'highpass', freq: 4500, gain: 0.035, attack: 0.0005, dur: 0.012 });
      this.tone(out, now, { freq: 2350, gain: 0.012, attack: 0.001, dur: 0.025 });
    }

    // công tắc gạt: tiếng "cạch" kim loại + thân bảng điều khiển "cộc"
    playUiClick(k = 1) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.9 * k);
      this.burst(out, t, { filter: 'bandpass', freq: 2300, Q: 2, gain: 0.14, attack: 0.0005, dur: 0.022 });
      this.tone(out, t, { type: 'triangle', freq: 1150, freqEnd: 880, sweep: 0.03, gain: 0.05, attack: 0.001, dur: 0.04 });
      this.tone(out, t, { freq: 140, freqEnd: 90, sweep: 0.05, gain: 0.12, attack: 0.001, dur: 0.07 });
    }

    playUiTab() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.8);
      this.burst(out, t, { filter: 'bandpass', freq: 3200, Q: 3, gain: 0.1, attack: 0.0005, dur: 0.015 });
      this.tone(out, t, { freq: 1560, gain: 0.03, attack: 0.001, dur: 0.05 });
    }

    // mở bảng: gió lướt lên + cạch; đóng: gió lướt xuống
    playUiOpen() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.8, 0.15);
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 500, freqEnd: 2600, sweep: 0.2, Q: 1.2, gain: 0.16, attack: 0.09, dur: 0.2 });
      this.playUiClick(0.7);
    }

    playUiClose() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.8, 0.15);
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400, freqEnd: 420, sweep: 0.18, Q: 1.2, gain: 0.13, attack: 0.03, dur: 0.18 });
      this.tone(out, t + 0.03, { freq: 120, freqEnd: 80, sweep: 0.06, gain: 0.1, attack: 0.001, dur: 0.08 });
    }

    // lắp / tháo trang bị: tiếng ngàm thép khớp vào
    playUiEquip(on = true) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.8, 0.08);
      this.metal(out, t, { f0: on ? 760 : 560, ratios: [1, 2.31, 3.9], decay: 0.18, gain: 0.08, click: 0.4 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2, gain: 0.35, attack: 0.001, dur: 0.07 });
    }

    // chốt khóa thép "cộp" (dùng chung khi chọn xe / xuất trận)
    _uiLatch(out, t, k = 1) {
      this.metal(out, t, { f0: 420, ratios: [1, 2.76, 5.4], decay: 0.25, gain: 0.16 * k, click: 0.5 });
      this.tone(out, t, { freq: 90, freqEnd: 48, sweep: 0.12, gain: 0.4 * k, attack: 0.001, dur: 0.25 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2.2, gain: 0.45 * k, attack: 0.001, dur: 0.09 });
    }

    // tiếng máy rồ ngắn: răng cưa ở tần số nổ xi-lanh, điều biên theo nhịp nổ, vòng tua vọt lên rồi hạ
    _uiRev(out, t, { f0, f1, up = 0.3, len = 0.9, lp = 500, gain = 0.3, pulse = 0.5 }) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f1, t + up);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.05, t + len);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(lp * 0.6, t);
      f.frequency.linearRampToValueAtTime(lp * 1.6, t + up);
      f.frequency.linearRampToValueAtTime(lp * 0.7, t + len);
      // nhịp nổ: điều biên vuông theo tần số máy / 2
      const am = ctx.createGain();
      am.gain.value = 1 - pulse * 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(f0 * 0.5, t);
      lfo.frequency.linearRampToValueAtTime(f1 * 0.5, t + up);
      lfo.frequency.exponentialRampToValueAtTime(f0 * 0.52, t + len);
      const ld = ctx.createGain();
      ld.gain.value = pulse * 0.5;
      lfo.connect(ld);
      ld.connect(am.gain);
      const ws = ctx.createWaveShaper();
      ws.curve = this.getShaper(2.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.05);
      g.gain.setValueAtTime(gain, t + up + 0.1);
      g.gain.setTargetAtTime(0.0001, t + up + 0.1, (len - up) / 3);
      o.connect(f);
      f.connect(am);
      am.connect(ws);
      ws.connect(g);
      g.connect(out);
      for (const n of [o, lfo]) { n.start(t); n.stop(t + len + 0.6); }
      // khí xả rào rào theo vòng tua
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: lp * 0.8, freqEnd: lp * 1.8, sweep: up, Q: 0.8, gain: gain * 0.35, attack: 0.05, dur: len * 0.8 });
    }

    playUiSelectTank(type = 'ALL_ROUNDER') {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.65, 0.12);
      this._uiLatch(out, t, 1);
      const te = t + 0.06;
      if (type === 'GATLING') {
        // mô-tơ điện rít lên vòng tua + cụm nòng lạch cạch
        this.tone(out, te, { type: 'sawtooth', freq: 110, freqEnd: 820, sweep: 0.55, gain: 0.05, attack: 0.04, hold: 0.25, dur: 0.6, filter: 'bandpass', filterFreq: 1400, Q: 1.5 });
        this.tone(out, te, { freq: 220, freqEnd: 1640, sweep: 0.55, gain: 0.03, attack: 0.04, hold: 0.25, dur: 0.5 });
        for (let i = 0; i < 7; i++) this.burst(out, te + 0.08 + i * 0.07 * Math.pow(0.85, i), { filter: 'bandpass', freq: 3000, Q: 4, gain: 0.05, attack: 0.0005, dur: 0.015 });
        this._uiRev(out, te, { f0: 40, f1: 62, up: 0.3, len: 0.8, lp: 450, gain: 0.18 });
      } else if (type === 'ARTILLERY') {
        // xi-lanh thủy lực xì + khối khóa nòng 155mm đóng sầm + máy xe tải
        this.burst(out, te, { filter: 'bandpass', freq: 3600, freqEnd: 1500, sweep: 0.4, Q: 1.5, gain: 0.09, attack: 0.03, dur: 0.4 });
        this.metal(out, te + 0.38, { f0: 210, ratios: [1, 2.4, 3.9, 5.6], decay: 0.55, gain: 0.2, click: 0.6 });
        this.tone(out, te + 0.38, { freq: 75, freqEnd: 40, sweep: 0.15, gain: 0.45, attack: 0.001, dur: 0.3 });
        this._uiRev(out, te, { f0: 36, f1: 52, up: 0.35, len: 1.0, lp: 420, gain: 0.22 });
      } else if (type === 'SCOUT') {
        // máy nhẹ rồ vọt nhanh hai lần
        this._uiRev(out, te, { f0: 62, f1: 120, up: 0.18, len: 0.5, lp: 900, gain: 0.36, pulse: 0.4 });
        this._uiRev(out, te + 0.42, { f0: 66, f1: 135, up: 0.16, len: 0.55, lp: 950, gain: 0.4, pulse: 0.4 });
      } else {
        // xe tăng chủ lực: diesel gầm trầm, nặng + turbo rít
        this._uiRev(out, te, { f0: 32, f1: 56, up: 0.35, len: 1.1, lp: 520, gain: 0.32, pulse: 0.6 });
        this.tone(out, te + 0.1, { freq: 1700, freqEnd: 2700, sweep: 0.35, gain: 0.012, attack: 0.1, dur: 0.6 });
      }
      this._uiBrassHit(t + 0.02, 0.7);
    }

    playUiSelectMap() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.85, 0.2);
      // giấy bản đồ phẩy ra
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 2600, sweep: 0.15, Q: 0.8, gain: 0.14, attack: 0.04, dur: 0.22 });
      this.burst(out, t + 0.05, { filter: 'highpass', freq: 5000, gain: 0.04, attack: 0.01, dur: 0.12 });
      // trầm xa + bíp radar xác nhận (tiếng vọng nhỏ)
      this.tone(out, t + 0.04, { freq: 70, freqEnd: 46, sweep: 0.3, gain: 0.28, attack: 0.004, dur: 0.6 });
      this.tone(out, t + 0.1, { freq: 1320, gain: 0.05, attack: 0.002, dur: 0.12 });
      this.tone(out, t + 0.22, { freq: 1760, gain: 0.05, attack: 0.002, dur: 0.18 });
      this.tone(out, t + 0.42, { freq: 1760, gain: 0.015, attack: 0.002, dur: 0.15 });
      this._uiBrassHit(t + 0.04, 0.45);
    }

    // TÌM TRẬN: cú "CHẮC" nặng như khóa nòng đóng + rung sàn
    playUiDeploy() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.7, 0.2);
      this._uiLatch(out, t, 1.3);
      this.metal(out, t + 0.12, { f0: 300, ratios: [1, 2.2, 3.7, 5.1], decay: 0.5, gain: 0.16, click: 0.6 });
      this.burst(out, t + 0.12, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2.5, gain: 0.6, attack: 0.001, dur: 0.2 });
      this.tone(out, t + 0.12, { freq: 64, freqEnd: 36, sweep: 0.4, gain: 0.5, attack: 0.002, dur: 0.7 });
      this._uiBrassHit(t + 0.12, 1);
    }

    playUiCancel() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.8, 0.08);
      this.tone(out, t, { type: 'square', freq: 880, gain: 0.03, attack: 0.002, dur: 0.07, filter: 'lowpass', filterFreq: 2500 });
      this.tone(out, t + 0.1, { type: 'square', freq: 587, gain: 0.03, attack: 0.002, dur: 0.12, filter: 'lowpass', filterFreq: 2000 });
      this.playUiClose();
    }

    // kèn đồng chớp đúng giọng nhạc nền (chỉ khi nhạc đang bật): chọn là thấy "hào hùng"
    _uiBrassHit(t, k) {
      const M = this._mz;
      if (!M || !this._mzBrass || !this.musicEnabled || !this.musicEnabled()) return;
      const o = this.ctx.createGain();
      o.gain.value = 0.5 * k;
      o.connect(M.bus);
      setTimeout(() => { try { o.disconnect(); } catch (e) { /* đã ngắt */ } }, 4000);
      for (const m of [38, 45, 50]) this._mzBrass(o, t, m, 0.45, 0.9, false, 0.012);
      if (this._mzTaiko) this._mzTaiko(o, t, 0.8 * k, 1);
    }
  });

  // ---------------------------------------------------------------------------
  // GẮN VÀO GIAO DIỆN (lắng nghe chung cả trang)
  // ---------------------------------------------------------------------------
  if (typeof document === 'undefined') return;
  const se = () => window.soundEngine;
  const call = (fn, ...a) => { const s = se(); if (s && s[fn]) { try { s[fn](...a); } catch (e) { /* không để âm thanh làm hỏng giao diện */ } } };
  const mmIdle = () => { const m = window.matchmakingController || (window.game && window.game.matchmaking); return !m || m.state === 'IDLE'; };
  const inGame = () => { const g = window.game || window.artilleryGame; return !!(g && g.isGameStarted && !g.isGameOver); };

  // thứ tự ưu tiên: [bộ chọn, hàm phát] — phần tử khớp đầu tiên (từ trong ra ngoài) quyết định
  const CLICK = [
    ['#mm-find-match-btn', () => { if (mmIdle()) call('playUiDeploy'); }],
    ['#mm-cancel-search-btn', () => call('playUiCancel')],
    ['.btn-inspect-tank-3d, .mm-gear-btn, #mm-open-tank-inspector-btn', () => call('playUiOpen')],
    // bấm lại thẻ đang chọn: chỉ "cạch" nhẹ
    ['.mm-class-card', el => { if (!mmIdle()) return; if (el.classList.contains('active')) call('playUiClick'); else call('playUiSelectTank', el.getAttribute('data-tank-type') || 'ALL_ROUNDER'); }],
    ['.mm-map-card', el => { if (!mmIdle()) return; if (el.classList.contains('active')) call('playUiClick'); else call('playUiSelectMap'); }],
    ['#ti-select-this-tank-btn', () => { const i = window.tankInspector; call('playUiSelectTank', (i && i.currentTankType) || 'ALL_ROUNDER'); }],
    ['#ti-close-btn, .ti-backdrop, .acc-close, .gm-close, [data-act="close"], [data-act="resume"]', () => call('playUiClose')],
    ['.acc-tab, .ti-tab-btn, .eqd-tab, .gm-tab, [role="tab"]', () => call('playUiTab')],
    // kho trang bị: mua / bán đã có tiếng nạp đạn riêng
    ['[data-act="buyAmmo"], [data-act="buyItem"], [data-act="sellAmmo"], [data-act="claim"]', () => {}],
    ['[data-act="equip"], [data-act="equipAll"]', () => call('playUiEquip', true)],
    ['[data-act="unequip"], [data-act="unequipAll"]', () => call('playUiEquip', false)],
    ['button, [role="button"], .mm-quick-tag, .ti-camo-btn, a.btn, label.gm-toggle', el => { if (!el.disabled) call('playUiClick'); }]
  ];
  const HOVER = '.mm-class-card, .mm-map-card, #mm-find-match-btn, button, [role="button"], [role="tab"], .mm-quick-tag';

  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    for (const [sel, fn] of CLICK) {
      const el = e.target.closest(sel);
      if (el) { fn(el); return; }
    }
  }, true);

  let hovered = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || !(e.target instanceof Element)) return;
    const el = e.target.closest(HOVER);
    if (el === hovered) return;
    hovered = el;
    if (el && !el.disabled && !inGame()) call('playUiHover');
  }, true);

  // thanh trượt (âm lượng...): tích nhẹ mỗi nấc 5 %
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'range') return;
    const v = Math.round(Number(el.value) / 5);
    if (v !== el._uiTick) { el._uiTick = v; call('playUiTab'); }
  }, true);
})();
