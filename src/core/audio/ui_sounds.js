/**
 * ÂM THANH GIAO DIỆN (sảnh, bảng chọn, cài đặt) — tổng hợp, kiểu bảng điều khiển quân sự:
 * - Rê chuột qua thẻ / nút: tiếng "tích" rất khẽ
 * - Bấm nút: công tắc gạt "cạch"; chuyển tab: "tách" nhẹ
 * - Chọn xe: chốt khóa thép "cộp" + tiếng máy riêng từng loại xe (tăng: diesel gầm; 6 nòng: mô-tơ rít vòng tua;
 *   pháo tự hành: xi-lanh thủy lực xì + khóa nòng đóng; trinh sát: máy nhẹ rồ nhanh) + kèn đồng chớp khi nhạc bật
 * - Chọn bản đồ: tiếng giấy bản đồ phẩy + bíp radar xác nhận + âm đặc trưng chiến địa (gió cát, còi báo động,
 *   côn trùng & chim rừng, gió núi & chim ưng, nước vỗ)
 * - Trang bị: ngàm thép + tiếng riêng từng món (giáp nổ bắt bu lông, giáp lồng lạch cạch, tấm giáp nặng, vải kevlar,
 *   servo đánh chặn, ống khói rỗng, lưới lá, van khí nén, tua-bin tăng áp, radar, nhiễu sóng); đủ ô -> tiếng từ chối;
 *   mua thành công -> khóa nòng + xu bạc leng keng, thất bại -> tiếng từ chối
 * - TÌM TRẬN: cú "CHẮC" nặng như khóa nòng; HỦY: hai bíp đi xuống
 * - Mở / đóng bảng: tiếng gió lướt lên / xuống
 * Gắn bằng lắng nghe chung cả trang (event delegation) — không cần sửa từng file giao diện.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau music.js.
 */
(function () {
  if (typeof SoundEngine === 'undefined') return;

  const rnd = (a, b) => a + Math.random() * (b - a);

  // Âm đặc trưng từng chiến địa (phát sau tiếng xác nhận chọn bản đồ, ~1,5 s, nghe xa qua hồi âm)
  const MAP_FX = {
    // sa mạc: cơn gió nóng thổi cát rào rào
    DESERT(out, t) {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420, freqEnd: 1150, sweep: 0.9, Q: 1.8, gain: 0.22, attack: 0.45, dur: 1.4 });
      this.burst(out, t + 0.2, { filter: 'highpass', freq: 6000, gain: 0.05, attack: 0.4, dur: 1.2 });
    },
    // đô thị đổ nát: còi báo động phòng không vọng xa + gạch vụn lăn
    URBAN(out, t) {
      this.tone(out, t, { type: 'triangle', freq: 380, freqEnd: 720, sweep: 0.9, gain: 0.07, attack: 0.3, hold: 0.5, dur: 0.9, filter: 'lowpass', filterFreq: 1400 });
      this.tone(out, t, { type: 'triangle', freq: 385, freqEnd: 728, sweep: 0.9, gain: 0.05, attack: 0.3, hold: 0.5, dur: 0.9, filter: 'lowpass', filterFreq: 1400 });
      for (let i = 0; i < 5; i++) this.burst(out, t + 0.3 + i * rnd(0.08, 0.16), { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: rnd(700, 1600), Q: 2, gain: 0.05, attack: 0.001, dur: 0.04 });
    },
    // rừng rậm: ve sầu rỉ rả + chim hót hai tiếng
    JUNGLE(out, t) {
      this._uiNoiseAM(out, t, { filter: 'bandpass', freq: 4800, Q: 6, gain: 0.07, attack: 0.3, dur: 1.6, amHz: 38, amDepth: 0.9 });
      for (const [d, f0, f1] of [[0.25, 2600, 3700], [0.36, 2700, 3800], [0.75, 1900, 1250], [0.95, 2000, 1300]]) {
        this.tone(out, t + d, { freq: f0, freqEnd: f1, sweep: 0.08, gain: 0.03, attack: 0.005, dur: 0.1 });
      }
    },
    // cao nguyên: gió núi hú + tiếng chim ưng kêu xa
    HIGHLAND(out, t) {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, freqEnd: 980, sweep: 1.2, Q: 7, gain: 0.3, attack: 0.5, dur: 1.5 });
      this.tone(out, t + 0.35, { freq: 2700, freqEnd: 1850, sweep: 0.55, gain: 0.025, attack: 0.03, dur: 0.6, vibrato: 28, vibratoDepth: 60 });
    },
    // sông hồ: nước vỗ bờ óc ách + bọt nước lục bục
    RIVER_LAKE(out, t) {
      this._uiNoiseAM(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 900, Q: 0.7, gain: 0.2, attack: 0.25, dur: 1.5, amHz: 1.6, amDepth: 0.9 });
      for (let i = 0; i < 5; i++) { const f = rnd(500, 900); this.tone(out, t + 0.2 + i * rnd(0.12, 0.25), { freq: f, freqEnd: f * 2.1, sweep: 0.05, gain: 0.025, attack: 0.003, dur: 0.06 }); }
    }
  };

  // Âm riêng từng món trang bị (k = 1 khi lắp, ~0,45 khi tháo)
  const EQUIP_FX = {
    // giáp phản ứng nổ: từng khối gạch thép nặng bắt bu lông "cộp — cộp" + cờ lê siết
    era(out, t, k) {
      for (const d of [0, 0.16]) { this.metal(out, t + d, { f0: 330, ratios: [1, 2.2, 3.6], decay: 0.2, gain: 0.1 * k, click: 0.5 }); this.burst(out, t + d, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 0.35 * k, attack: 0.001, dur: 0.08 }); }
      for (let i = 0; i < 4; i++) this.burst(out, t + 0.34 + i * 0.045, { filter: 'bandpass', freq: 3400, Q: 5, gain: 0.04 * k, attack: 0.0005, dur: 0.012 });
    },
    // giáp lồng: khung thanh sắt rung lạch cạch
    slat(out, t, k) {
      for (let i = 0; i < 6; i++) this.metal(out, t + i * rnd(0.03, 0.06), { f0: rnd(900, 1500), ratios: [1, 2.9, 5.1], decay: 0.12, gain: 0.04 * k, click: 0.2 });
    },
    // tấm giáp tăng cường: tấm thép dày đặt xuống nặng trịch, ngân trầm
    applique(out, t, k) {
      this.metal(out, t, { f0: 160, ratios: [1, 2.4, 3.9, 5.6], decay: 0.7, gain: 0.1 * k, click: 0.6 });
      this.tone(out, t, { freq: 80, freqEnd: 45, sweep: 0.15, gain: 0.25 * k, attack: 0.001, dur: 0.3 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 2.5, gain: 0.3 * k, attack: 0.001, dur: 0.12 });
    },
    // lớp lót chống mảnh (sợi kevlar): vải sột soạt + dán khóa nhám "rẹt"
    spall(out, t, k) {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.1 * k, attack: 0.04, dur: 0.18 });
      this._uiNoiseAM(out, t + 0.16, { filter: 'bandpass', freq: 3200, Q: 1.2, gain: 0.12 * k, attack: 0.01, dur: 0.22, amHz: 70, amDepth: 1 });
    },
    // đánh chặn chủ động: mô-tơ servo xoay bệ phóng + hai bíp hệ thống sẵn sàng
    aps(out, t, k) {
      this.tone(out, t, { type: 'sawtooth', freq: 180, freqEnd: 420, sweep: 0.25, gain: 0.05 * k, attack: 0.02, hold: 0.12, dur: 0.12, filter: 'bandpass', filterFreq: 900, Q: 2 });
      this.tone(out, t + 0.32, { type: 'square', freq: 1400, gain: 0.04 * k, attack: 0.002, dur: 0.06, filter: 'lowpass', filterFreq: 3500 });
      this.tone(out, t + 0.42, { type: 'square', freq: 1870, gain: 0.04 * k, attack: 0.002, dur: 0.09, filter: 'lowpass', filterFreq: 3500 });
    },
    // ống phóng lựu khói: gõ vào dãy ống rỗng "tong tong tong"
    smoke(out, t, k) {
      [640, 600, 560, 520].forEach((f, i) => {
        this.tone(out, t + i * 0.07, { freq: f, freqEnd: f * 0.96, sweep: 0.1, gain: 0.12 * k, attack: 0.001, dur: 0.18 });
        this.burst(out, t + i * 0.07, { filter: 'bandpass', freq: f * 2.7, Q: 4, gain: 0.07 * k, attack: 0.0005, dur: 0.03 });
      });
    },
    // lưới ngụy trang: lưới + lá phủ lên xe sột soạt
    camo(out, t, k) {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3000, Q: 0.9, gain: 0.12 * k, attack: 0.08, dur: 0.5 });
      for (let i = 0; i < 6; i++) this.burst(out, t + rnd(0, 0.45), { filter: 'bandpass', freq: rnd(2500, 5000), Q: 3, gain: 0.035 * k, attack: 0.002, dur: 0.03 });
    },
    // bình chữa cháy tự động: mở van "tách" + khí nén xì + kim đồng hồ áp suất "ting"
    fireext(out, t, k) {
      this.burst(out, t, { filter: 'bandpass', freq: 3600, Q: 4, gain: 0.06 * k, attack: 0.0005, dur: 0.015 });
      this.burst(out, t + 0.03, { filter: 'highpass', freq: 3500, gain: 0.1 * k, attack: 0.01, dur: 0.35 });
      this.metal(out, t + 0.42, { f0: 2100, ratios: [1, 2.7], decay: 0.4, gain: 0.03 * k, click: 0.1 });
    },
    // động cơ tăng áp: tua-bin rít vút lên + xả van "pssh"
    turbo(out, t, k) {
      this.tone(out, t, { freq: 1100, freqEnd: 4200, sweep: 0.45, gain: 0.03 * k, attack: 0.05, hold: 0.25, dur: 0.25 });
      this.tone(out, t, { freq: 2210, freqEnd: 8400, sweep: 0.45, gain: 0.01 * k, attack: 0.05, hold: 0.25, dur: 0.2 });
      this.burst(out, t + 0.55, { filter: 'bandpass', freq: 2600, freqEnd: 1400, sweep: 0.2, Q: 0.9, gain: 0.12 * k, attack: 0.005, dur: 0.22 });
    },
    // radar dò tìm: khởi động điện tử quét lên + "píng" dội lại
    radar(out, t, k) {
      this.tone(out, t, { type: 'sine', freq: 300, freqEnd: 1500, sweep: 0.3, gain: 0.025 * k, attack: 0.02, dur: 0.3 });
      this.tone(out, t + 0.35, { freq: 1980, gain: 0.04 * k, attack: 0.002, dur: 0.5 });
      this.tone(out, t + 0.6, { freq: 1980, gain: 0.012 * k, attack: 0.002, dur: 0.4 });
    },
    // máy gây nhiễu: nhiễu sóng rè rè + tiếng hú vô tuyến lên xuống
    jammer(out, t, k) {
      this._uiNoiseAM(out, t, { filter: 'bandpass', freq: 1800, Q: 0.7, gain: 0.08 * k, attack: 0.02, dur: 0.5, amHz: 23, amDepth: 0.9 });
      this.tone(out, t, { type: 'square', freq: 700, freqEnd: 1300, sweep: 0.25, gain: 0.012 * k, attack: 0.02, hold: 0.1, dur: 0.2, vibrato: 14, vibratoDepth: 120, filter: 'lowpass', filterFreq: 2500 });
    }
  };

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

    // lắp / tháo trang bị: ngàm thép khớp vào (tháo: nhả chốt, trượt ra) + tiếng riêng của từng món
    playUiEquip(on = true, id = '') {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.8, 0.08);
      if (on) {
        this.metal(out, t, { f0: 760, ratios: [1, 2.31, 3.9], decay: 0.18, gain: 0.08, click: 0.4 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2, gain: 0.35, attack: 0.001, dur: 0.07 });
      } else {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, freqEnd: 700, sweep: 0.15, Q: 1.5, gain: 0.08, attack: 0.01, dur: 0.15 });
        this.metal(out, t + 0.02, { f0: 520, ratios: [1, 2.31, 3.9], decay: 0.14, gain: 0.06, click: 0.3 });
      }
      const fx = EQUIP_FX[id];
      if (fx) fx.call(this, out, t + (on ? 0.06 : 0.1), on ? 1 : 0.45);
    }

    // không làm được (nhóm đã đủ ô, thiếu Bạc...): hai tiếng "è" trầm
    playUiDenied() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.7, 0.02);
      for (const d of [0, 0.11]) this.tone(out, t + d, { type: 'square', freq: 155, gain: 0.08, attack: 0.003, hold: 0.06, dur: 0.05, filter: 'lowpass', filterFreq: 900 });
    }

    // mua thành công: khóa nòng nạp đạn (tiếng cũ) + xu bạc leng keng; bán lại: vài đồng xu rơi khẽ
    playUiPurchase(sell = false) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const out = this.uiOut(0.7, 0.1);
      if (!sell && this.playReloadDone) this.playReloadDone();
      const n = sell ? 2 : 5;
      for (let i = 0; i < n; i++) {
        this.metal(out, t + 0.03 + i * (0.045 + Math.random() * 0.03), { f0: 2300 + Math.random() * 1400, ratios: [1, 2.62, 4.1], decay: 0.22, gain: sell ? 0.08 : 0.12, click: 0.15 });
      }
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
      g.gain.value = 0;
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

    playUiSelectMap(type = '') {
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
      const fx = MAP_FX[type];
      if (fx) fx.call(this, this.uiOut(0.8, 0.35), t + 0.15);
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

    // nhiễu có lọc + điều biên theo sóng sin (côn trùng rỉ rả, nước vỗ, nhiễu sóng vô tuyến)
    _uiNoiseAM(out, t, { buffer, filter = 'bandpass', freq, Q = 1, gain, attack = 0.1, dur, amHz, amDepth = 0.8 }) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer || this.noiseBuffer;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = Q;
      const am = ctx.createGain();
      am.gain.value = 1 - amDepth / 2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = amHz;
      const ld = ctx.createGain();
      ld.gain.value = amDepth / 2;
      lfo.connect(ld);
      ld.connect(am.gain);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.setValueAtTime(gain, t + Math.max(attack, dur * 0.6));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(am);
      am.connect(g);
      g.connect(out);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.05);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
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
    ['.mm-map-card', el => { if (!mmIdle()) return; if (el.classList.contains('active')) call('playUiClick'); else call('playUiSelectMap', el.getAttribute('data-map-type') || ''); }],
    ['#ti-select-this-tank-btn', () => { const i = window.tankInspector; call('playUiSelectTank', (i && i.currentTankType) || 'ALL_ROUNDER'); }],
    ['#ti-close-btn, .ti-backdrop, .acc-close, .gm-close, [data-act="close"], [data-act="resume"]', () => call('playUiClose')],
    ['.acc-tab, .ti-tab-btn, .eqd-tab, .gm-tab, [role="tab"]', () => call('playUiTab')],
    // kho trang bị: mua / bán phát tiếng khi máy chủ trả kết quả (xem armory_ui.js); đồ khóa: mở quảng cáo
    ['[data-act="buyAmmo"], [data-act="buyItem"], [data-act="sellAmmo"]', () => {}],
    ['[data-act="claim"]', () => call('playUiOpen')],
    // nhóm đã đủ ô -> không lắp được
    ['[data-act="equip"]', el => { if (el.classList.contains('full')) call('playUiDenied'); else call('playUiEquip', true, el.getAttribute('data-item') || ''); }],
    ['[data-act="unequip"]', el => call('playUiEquip', false, el.getAttribute('data-item') || '')],
    ['[data-act="equipAll"]', () => call('playUiEquip', true)],
    ['[data-act="unequipAll"]', () => call('playUiEquip', false)],
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
