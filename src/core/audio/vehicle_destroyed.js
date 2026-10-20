/**
 * XE BỊ PHÁ HỦY: nổ thứ cấp theo loại xe, xác xe cháy, tổ lái thoát, bình xăng.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  /**
   * Xe bị phá hủy — tiếng nổ thứ cấp riêng theo cấu tạo từng loại xe (đi sau phát bắn trúng ~0.1-0.25 s):
   * - Xe tăng (kho đạn 120mm trong tháp): kho đạn kích nổ "ẦM" cực lớn, sâu, hất tháp bay rít gió, thân thép ngân
   * - Pháo tự hành 155 (đạn + liều phóng): kích nổ lớn nhất, rồi liều phóng cháy phụt như mỏ hàn khổng lồ "phừừừ" 2-3 s
   * - Xe 6 nòng (đạn 30mm + dầu): nổ vừa + "phừng" dầu bốc cháy, sau đó đạn 30mm nổ lụp bụp dồn dập (cookoffSmall)
   * - Xe trinh sát (không có kho đạn pháo): bình xăng "phừng" + kính vỡ + đạn 12.7 tí tách
   */
  playVehicleDestroyed(tankType = 'ALL_ROUNDER', pos = null, kind = 'det', dur = 5) {
    if (!this.ready()) return;
    const L = this.listenerXZ();
    const d = pos ? Math.hypot(pos.x - L.x, pos.z - L.z) : 0;
    if (d > 3200) return;
    const sp = this.spatial(d, pos);
    if (kind === 'vent' || kind === 'crew' || kind === 'fuel') { this.playWreckEvent(tankType, kind, d, sp, dur); return; }
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = tankType === 'ARTILLERY' ? 1.9 : tankType === 'ALL_ROUNDER' ? 1.6 : tankType === 'GATLING' ? 1.0 : 0.6;
    const t = this.ctx.currentTime + sp.delay + (big ? 0.12 + Math.random() * 0.12 : 0.05);
    const out = this.voice({ gain: sp.gain * 0.2 * (big ? 1.3 : 1.15), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.12), pan: sp.pan });
    if (tankType !== 'SCOUT') {
      // Kích nổ kho đạn dựng theo vật lý (như đạn nổ, xem synthGunshot 'blastAmmo'): sóng xung kích dài hơn đạn 155
      // (hàng chục kg thuốc phóng + thuốc nổ), vài viên kích nổ dây chuyền nối nhau trong ~0,1 s -> "ẦM-ẦM" dày, rồi
      // khối lửa thuốc phóng bùng cháy. Thay cho nhiễu lọc thấp + sóng sin trầm cũ (nghe "ục" đục, bé hơn 1 quả 155)
      const W = this.stereoSpread(out, 0.7);
      const bk = tankType === 'GATLING' ? 'blast120' : 'blastAmmo';
      [W.L, W.R].forEach((dst, c) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer(bk);
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 6.5 * Math.min(1.25, k);
        src.connect(g);
        g.connect(dst);
        src.start(t + c * 0.0007);
      });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 800, Q: 0.6, drive: 1.5, gain: 2.4 * k, attack: 0.002, dur: 0.35 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700, Q: 0.6, drive: 1.2, gain: 1.8 * k, attack: 0.002, dur: 0.2 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 1.5, gain: 0.6 * k, attack: 0.004, dur: 0.6 });
      // thân thép xe bị xé toạc: tiếng thép ngân trầm lẫn trong tiếng nổ + mảnh thép văng rít
      this.metal(out, t + 0.01, { f0: 90 + Math.random() * 30, ratios: [1, 1.7, 2.6, 3.9], decay: 1.2, gain: 0.5 * k, click: 0.5 });
      this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 900, sweep: 0.5, Q: 3, gain: 0.5 * k, attack: 0.01, dur: 0.5 });
      if (d < 700) this.duck(0.25, 1.4);
      // rền cuộn + tiếng dội
      const roll = this.voice({ gain: sp.gain * 0.8, lowpass: Math.min(sp.lowpass, 500), wet: 0.95, pan: sp.pan * 0.5 });
      this.burst(roll, t + 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: 0.35 * k, attack: 0.15, dur: 2.4 });
      this.playTerrainEchoes(t, 0.45 * k * Math.sqrt(sp.gain), sp.lowpass);
    }
    // khối thuốc phóng / nhiên liệu bùng cháy thành quả cầu lửa sau tiếng nổ: gầm "PHỪỪNG" dày, phồng lên rồi lụi dần
    this.sustainNoise(out, t + 0.06, { buffer: this.pinkNoiseBuffer, freq: 520, Q: 0.45, drive: 1.5, gain: (big ? 2.6 : 1.8) * Math.min(1.2, k), attack: 0.16, hold: big ? 1.1 : 0.6, release: 1.8, flicker: 0.4 });
    this.sustainNoise(out, t + 0.06, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: (big ? 1.4 : 1.0), attack: 0.2, hold: big ? 1.2 : 0.7, release: 2, flicker: 0.3 });
    // nhiên liệu bốc cháy "phừng" (xe nào cũng có)
    this.burst(out, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, freqEnd: 900, sweep: 0.4, drive: 2, gain: (big ? 2.0 : 3.0), attack: 0.08, dur: 1.1 });
    this.burst(out, t + 0.12, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 0.5, gain: 2.0, attack: 0.25, dur: 1.8 });
    if (tankType === 'ARTILLERY') {
      // liều phóng thuốc súng cháy phụt thành luồng lửa: tiếng "phừừừ" gầm như mỏ hàn khổng lồ
      this.burst(out, t + 0.3, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 0.5, drive: 2, gain: 3.5, attack: 0.15, dur: 2.8 });
      this.burst(out, t + 0.3, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 400, gain: 2.0, attack: 0.2, dur: 2.8 });
      this.burst(out, t + 0.3, { filter: 'highpass', freq: 3500, gain: 0.6, attack: 0.2, dur: 2.5 });
    }
    if (tankType === 'SCOUT') {
      // Thùng đạn 12.7 + bình nhiên liệu: tiếng nổ vừa (vật lý 'blastN') rồi "phừng"
      [0, 1].forEach(c => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('blastN');
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 2.0;
        src.connect(g);
        g.connect(out);
        src.start(t + c * 0.0007);
      });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 1.5, gain: 1.2, attack: 0.002, dur: 0.4 });
    }
  }

  // Tiếng lửa / áp suất kéo dài có bao "giữ" (burst() chỉ tắt dần): vào attack, giữ hold có chập chờn ngẫu nhiên, nhả release
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
    // chập chờn: mức đổi ngẫu nhiên mỗi 80-200 ms (lửa phụt không đều), không theo chu kỳ
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
   * - 'crew': đạn xuyên khoang kíp lái — nghe từ ngoài là cú "THỤP" đục bị vỏ thép nuốt, thân xe ngân trầm, mảnh văng lạch
   *           cạch bên trong, rồi lửa bén "phừ" nhỏ dần to (tiếng lửa cháy liên tục do fireSource lo)
   * - 'fuel': dầu / nhiên liệu bốc cháy "PHỪNG" trầm + lửa cuộn
   * - 'vent': hốc đạn sau tháp xả áp — tấm xả áp bật "BỤP-KENG", rồi đạn cháy phụt lửa thẳng lên gầm rít như động cơ
   *           phản lực / mỏ hàn khổng lồ suốt dur giây, lúc bùng lúc dịu (tiếng đạn nổ lách tách là 'cookoff' riêng)
   */
  playWreckEvent(tankType, kind, d, sp, dur) {
    const t = this.ctx.currentTime + sp.delay + 0.03;
    const big = tankType === 'ALL_ROUNDER' || tankType === 'ARTILLERY';
    const k = big ? 1 : tankType === 'GATLING' ? 0.85 : 0.65;
    const out = this.voice({ gain: sp.gain * 0.2, lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.12), pan: sp.pan });
    if (kind === 'crew') {
      // nổ / áp suất bên trong khoang kín: chỉ dải trầm-trung lọt ra ngoài vỏ thép
      const thud = this.ctx.createBiquadFilter();
      thud.type = 'lowpass'; thud.frequency.value = big ? 900 : 1500;
      thud.connect(out);
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer('blastRPG');
      src.playbackRate.value = 0.8 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 3.4 * k;
      src.connect(g); g.connect(thud);
      src.start(t);
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 1.5, gain: 1.2 * k, attack: 0.003, dur: 0.35 });
      // thân xe ngân trầm (cả khối thép bị đánh từ trong), mảnh văng lạch cạch
      this.metal(out, t + 0.005, { f0: (big ? 80 : 120) + Math.random() * 30, ratios: [1, 1.6, 2.5, 3.7], decay: big ? 1.0 : 0.7, gain: 0.32 * k, click: 0.3 });
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2300, Q: 0.7, gain: 0.5 * k, attack: 0.002, dur: 0.3 });
      // lửa bén: "phừ" nhỏ to dần trong ~1,5 s (sau đó tiếng lửa cháy liên tục tiếp nối)
      this.sustainNoise(out, t + 0.35, { buffer: this.pinkNoiseBuffer, freq: 750, Q: 0.5, gain: 0.55 * k, attack: 1.4, hold: 1.2, release: 1.2, flicker: 0.4 });
      if (!big) this.burst(out, t + 0.02, { filter: 'highpass', freq: 3500, gain: 0.25, attack: 0.002, dur: 0.25 });   // kính rạn vỡ
      return;
    }
    if (kind === 'fuel') {
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, freqEnd: 900, sweep: 0.35, drive: 2, gain: 3.0 * k, attack: 0.07, dur: 1.1 });
      this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420, Q: 0.6, drive: 1.5, gain: 2.2 * k, attack: 0.05, dur: 0.6 });
      this.sustainNoise(out, t + 0.1, { buffer: this.pinkNoiseBuffer, freq: 700, Q: 0.5, gain: 1.4 * k, attack: 0.3, hold: 1.2, release: 1.5, flicker: 0.45 });
      this.burst(out, t + 0.2, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 900, gain: 0.5 * k, attack: 0.2, dur: 2 });
      return;
    }
    // 'vent': tấm xả áp bật tung — cú nổ nhỏ gọn + thép "KENG"
    [0, 1].forEach(c => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer('blastRPG');
      src.playbackRate.value = 0.9 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 3.6;
      src.connect(g); g.connect(out);
      src.start(t + c * 0.0006);
    });
    this.metal(out, t + 0.01, { f0: 150 + Math.random() * 40, ratios: [1, 2.3, 3.7, 5.1], decay: 0.7, gain: 0.45, click: 0.6 });
    if (d < 500) this.duck(0.5, 0.8);
    // Luồng lửa đạn cháy phụt thẳng lên: gầm dày dải rộng (như mỏ hàn khổng lồ / động cơ phản lực), rít cao, rền trầm
    const h = Math.max(1, dur - 1.6);
    this.sustainNoise(out, t + 0.04, { buffer: this.pinkNoiseBuffer, freq: 950, Q: 0.45, drive: 1.6, gain: 3.2, attack: 0.12, hold: h, release: 1.5, flicker: 0.4 });
    this.sustainNoise(out, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 360, gain: 1.7, attack: 0.18, hold: h, release: 1.6, flicker: 0.3 });
    this.sustainNoise(out, t + 0.08, { buffer: this.noiseBuffer, filter: 'highpass', freq: 3200, gain: 0.5, attack: 0.2, hold: h * 0.9, release: 1.2, flicker: 0.5 });
    // vài đợt bùng mạnh khi từng cụm đạn bắt lửa
    for (let i = 0; i < 4; i++) {
      this.burst(out, t + 0.3 + Math.random() * h * 0.85, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600 + Math.random() * 600, Q: 0.6, drive: 1.4, gain: 1.8, attack: 0.04, dur: 0.5 + Math.random() * 0.5 });
    }
    // rền + dội địa hình nhỏ
    this.playTerrainEchoes(t, 0.25 * Math.sqrt(sp.gain), sp.lowpass);
  }
});
