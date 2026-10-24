/**
 * XE BỊ PHÁ HỦY: nổ thứ cấp theo loại xe, xác xe cháy, tổ lái thoát, bình xăng.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  /**
   * Xe bị phá hủy — tiếng nổ thứ cấp riêng theo cấu tạo từng loại xe (đi sau phát bắn trúng ~0.1-0.25 s):
   * - Xe tăng (kho đạn 120mm trong tháp): kho đạn kích nổ "ẦM" cực lớn, sâu, chấn động lồng ngực, thân thép bị xé toạc
   * - Pháo tự hành 155 (đạn + liều phóng): kích nổ lớn nhất, rồi liều phóng cháy phụt như mỏ hàn khổng lồ "phừừừ" 2-3 s
   * - Xe 6 nòng (đạn 30mm + dầu): nổ vừa + "phừng" dầu bốc cháy, sau đó đạn 30mm nổ lụp bụp trầm đục trong hốc
   * - Xe trinh sát (không có kho đạn pháo): bình xăng nổ "ĐÙNG-PHỪNG" uy lực, không có tiếng leng keng
   */
  playVehicleDestroyed(tankType = 'ALL_ROUNDER', pos = null, kind = 'det', dur = 5) {
    if (!this.ready()) return;
    const L = this.listenerXZ();
    const d = pos ? Math.hypot(pos.x - L.x, pos.z - L.z) : 0;
    if (d > 3200) return;
    const sp = this.spatial(d, pos);
    if (kind === 'vent' || kind === 'crew' || kind === 'fuel') { this.playWreckEvent(tankType, kind, d, sp, dur); return; }
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = tankType === 'ARTILLERY' ? 2.0 : tankType === 'ALL_ROUNDER' ? 1.75 : tankType === 'GATLING' ? 1.15 : 0.75;
    const t = this.ctx.currentTime + sp.delay + (big ? 0.12 + Math.random() * 0.12 : 0.05);

    // Tăng âm lượng vụ nổ xe tương xứng với tầm vóc vụ nổ trên chiến trường
    const out = this.voice({ gain: sp.gain * (big ? 1.25 : 1.05), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.15), pan: sp.pan });

    // 1. Cú đấm siêu trầm (Sub-bass Shock Punch): áp suất nổ nén không khí rung chuyển lồng ngực (28 - 82 Hz)
    this.tone(out, t, { type: 'triangle', freq: 78, freqEnd: 26, sweep: 0.38, drive: 2.8, gain: 3.5 * k, attack: 0.001, dur: 0.55 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 110, drive: 3.2, gain: 2.8 * k, attack: 0.002, dur: 0.65 });

    if (tankType !== 'SCOUT') {
      // 2. Kích nổ kho đạn dựng theo vật lý ('blastAmmo' / 'blast120'): âm thanh dày, uy lực
      const W = this.stereoSpread(out, 0.75);
      const bk = tankType === 'GATLING' ? 'blast120' : 'blastAmmo';
      [W.L, W.R].forEach((dst, c) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer(bk);
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.05;
        const g = this.ctx.createGain();
        g.gain.value = 7.5 * Math.min(1.3, k);
        src.connect(g);
        g.connect(dst);
        src.start(t + c * 0.0007);
      });

      // Dải trung dày của vụ nổ (độ đặc của khí nổ giãn nở)
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 620, Q: 0.6, drive: 1.8, gain: 2.6 * k, attack: 0.002, dur: 0.4 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 0.6, drive: 1.4, gain: 1.6 * k, attack: 0.002, dur: 0.25 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 280, drive: 2.0, gain: 1.4 * k, attack: 0.003, dur: 0.7 });

      // 3. Vỏ thép xe bị xé toạc: tiếng nứt vỡ kim loại nặng dải thấp, cắt sạch tần số cao leng keng
      this.playCaseHit(out, t + 0.008, 'hullBlast', 0.65 + Math.random() * 0.1, 0.85 * k, 1200);
      this.burst(out, t + 0.015, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420, freqEnd: 180, sweep: 0.25, Q: 0.9, drive: 3.5, gain: 1.8 * k, attack: 0.005, dur: 0.3 });

      // Cú làm ù tai (Acoustic Shock): giảm mạnh âm thanh môi trường xung quanh trong 1.8 s
      if (d < 850) {
        this.duck(0.12, 1.8);
        if (d < 300 && big && this.shellShock) this.shellShock(0.65);
      }

      // Rền cuộn lan toả qua địa hình đồi núi
      const roll = this.voice({ gain: sp.gain * 0.85, lowpass: Math.min(sp.lowpass, 450), wet: 0.95, pan: sp.pan * 0.5 });
      this.burst(roll, t + 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, gain: 0.45 * k, attack: 0.12, dur: 2.6 });
      this.playTerrainEchoes(t, 0.65 * k * Math.sqrt(sp.gain), sp.lowpass);
    } else {
      // Xe trinh sát: nổ thùng đạn 12.7 + bình nhiên liệu đanh gọn, uy lực
      [0, 1].forEach(c => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('blastN');
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 3.2;
        src.connect(g);
        g.connect(out);
        src.start(t + c * 0.0007);
      });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 1.8, gain: 1.8, attack: 0.002, dur: 0.45 });
      if (d < 500) this.duck(0.25, 1.2);
    }

    // 4. Khối thuốc phóng / nhiên liệu bùng cháy: gầm "PHỪỪỪNG" dày, cuộn lửa áp suất cao
    this.sustainNoise(out, t + 0.06, { buffer: this.pinkNoiseBuffer, freq: 480, Q: 0.45, drive: 1.6, gain: (big ? 2.8 : 1.9) * Math.min(1.2, k), attack: 0.15, hold: big ? 1.2 : 0.6, release: 1.8, flicker: 0.4 });
    this.sustainNoise(out, t + 0.06, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, gain: (big ? 1.6 : 1.1), attack: 0.18, hold: big ? 1.3 : 0.7, release: 2.0, flicker: 0.3 });

    // Nhiên liệu bốc cháy gầm gừ
    this.burst(out, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, freqEnd: 750, sweep: 0.4, drive: 2.2, gain: (big ? 2.4 : 3.2), attack: 0.08, dur: 1.2 });
    this.burst(out, t + 0.12, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, Q: 0.5, gain: 2.2, attack: 0.22, dur: 1.9 });

    if (tankType === 'ARTILLERY') {
      // Liều phóng pháo 155mm cháy phụt thành luồng lửa: tiếng gầm cuộn áp suất cao 3 s
      this.burst(out, t + 0.25, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 850, Q: 0.5, drive: 2.2, gain: 3.8, attack: 0.15, dur: 3.0 });
      this.burst(out, t + 0.25, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 340, gain: 2.4, attack: 0.2, dur: 3.0 });
    }
  }

  // Tiếng lửa / áp suất kéo dài có bao "giữ": vào attack, giữ hold có chập chờn ngẫu nhiên, nhả release
  sustainNoise(dest, t, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.buffer || this.pinkNoiseBuffer;
    src.loop = true;
    let node = src;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.value = o.freq || 900;
    f.Q.value = o.Q !== undefined ? o.Q : 0.5;
    node.connect(f); node = f;
    if (o.drive) { const ws = ctx.createWaveShaper(); ws.curve = this.getShaper(o.drive); node.connect(ws); node = ws; }
    const g = ctx.createGain();
    const G = o.gain || 1, a = o.attack || 0.1, h = o.hold || 1, r = o.release || 1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(G, t + a);
    for (let ti = t + a + 0.08; ti < t + a + h; ti += 0.08 + Math.random() * 0.12) g.gain.linearRampToValueAtTime(G * (1 - (o.flicker || 0.35) * Math.random()), ti);
    g.gain.linearRampToValueAtTime(G * 0.8, t + a + h);
    g.gain.setTargetAtTime(0.0001, t + a + h, r / 3.5);
    node.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * Math.max(0, src.buffer.duration - 0.5));
    src.stop(t + a + h + r + 0.3);
  }

  /**
   * Các kiểu xe chết KHÔNG nổ tung ngay (explosion_fx.killInfo):
   * - 'crew': đạn xuyên khoang kíp lái — cú "THỤP" nặng trịch bị vỏ thép nuốt, thân xe ngân trầm, mảnh văng lạch cạch đục
   * - 'fuel': dầu / nhiên liệu bốc cháy "PHỪNG" trầm dày + lửa cuộn
   * - 'vent': hốc đạn sau tháp xả áp — tấm xả áp bật "BỤP-KHOẶNG", luồng lửa phụt thẳng lên gầm rít
   */
  playWreckEvent(tankType, kind, d, sp, dur) {
    const t = this.ctx.currentTime + sp.delay + 0.03;
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = big ? 1 : tankType === 'GATLING' ? 0.85 : 0.65;
    const out = this.voice({ gain: sp.gain * (big ? 0.95 : 0.8), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.12), pan: sp.pan });

    if (kind === 'crew') {
      // Nổ / áp suất bên trong khoang kín: dải trầm-trung lọt ra ngoài vỏ thép, cú thụp nghẹt
      const thud = this.ctx.createBiquadFilter();
      thud.type = 'lowpass'; thud.frequency.value = big ? 750 : 1100;
      thud.connect(out);
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer('blastRPG');
      src.playbackRate.value = 0.75 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 3.6 * k;
      src.connect(g); g.connect(thud);
      src.start(t);
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 280, drive: 1.8, gain: 1.5 * k, attack: 0.003, dur: 0.4 });
      // Thân xe rung "THỤP" nặng trịch, không ngân chuông
      this.playCaseHit(out, t + 0.005, 'hullBlast', (big ? 0.65 : 0.95) + Math.random() * 0.15, 0.6 * k, 900);
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1200, Q: 0.6, gain: 0.35 * k, attack: 0.002, dur: 0.25 });
      // Lửa bén "phừừ" nhỏ dần to
      this.sustainNoise(out, t + 0.35, { buffer: this.pinkNoiseBuffer, freq: 620, Q: 0.5, gain: 0.65 * k, attack: 1.4, hold: 1.2, release: 1.2, flicker: 0.4 });
      return;
    }
    if (kind === 'fuel') {
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200, freqEnd: 750, sweep: 0.35, drive: 2.2, gain: 3.5 * k, attack: 0.07, dur: 1.2 });
      this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, Q: 0.6, drive: 1.6, gain: 2.4 * k, attack: 0.05, dur: 0.7 });
      this.sustainNoise(out, t + 0.1, { buffer: this.pinkNoiseBuffer, freq: 580, Q: 0.5, gain: 1.6 * k, attack: 0.3, hold: 1.2, release: 1.5, flicker: 0.45 });
      this.burst(out, t + 0.2, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 750, gain: 0.45 * k, attack: 0.2, dur: 2 });
      return;
    }
    // 'vent': Tấm xả áp bật tung — cú nổ bật nắp "BỤP-KHOẶNG", không leng keng
    [0, 1].forEach(c => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer('blastRPG');
      src.playbackRate.value = 0.85 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 4.0;
      src.connect(g); g.connect(out);
      src.start(t + c * 0.0006);
    });
    this.playCaseHit(out, t + 0.01, 'debrisPlateHull', 0.85 + Math.random() * 0.15, 0.65, 1100);
    if (d < 500) this.duck(0.4, 0.9);
    // Luồng lửa đạn cháy phụt thẳng lên gầm rú
    const h = Math.max(1, dur - 1.6);
    this.sustainNoise(out, t + 0.04, { buffer: this.pinkNoiseBuffer, freq: 780, Q: 0.45, drive: 1.6, gain: 3.4, attack: 0.12, hold: h, release: 1.5, flicker: 0.4 });
    this.sustainNoise(out, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, gain: 1.9, attack: 0.18, hold: h, release: 1.6, flicker: 0.3 });
    for (let i = 0; i < 4; i++) {
      this.burst(out, t + 0.3 + Math.random() * h * 0.85, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 500 + Math.random() * 500, Q: 0.6, drive: 1.4, gain: 1.8, attack: 0.04, dur: 0.5 + Math.random() * 0.5 });
    }
    this.playTerrainEchoes(t, 0.35 * Math.sqrt(sp.gain), sp.lowpass);
  }
});
