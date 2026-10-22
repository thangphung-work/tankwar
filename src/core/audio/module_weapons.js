/**
 * TRANG BỊ MÔ-ĐUN (chân đế dùng chung — roof_mounts.js): tiếng súng phóng lựu 40mm, máy phá khóa radar, UAV cảm tử.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 *
 * - Súng phóng lựu tự động 40mm (kiểu Mk19 / AGS): sơ tốc thấp nên không có tiếng nổ đầu nòng sắc như súng — chỉ "BỤP"
 *   trầm, đục của liều phóng áp suất thấp, kèm tiếng khóa nòng nặng lùi về đập "cạch" (khối khóa ~10 kg, nhịp chậm
 *   ~6 phát/giây) và tiếng dây đạn mắt xích kéo qua khe nạp.
 * - Máy phá khóa radar: rơ-le đóng "tách" + tiếng rít quét tần số lên (bật) / xuống (tắt); lúc phát: ù rè điện từ khe
 *   tản nhiệt bộ khuếch đại công suất (nền 100 Hz méo + nhiễu dải hẹp nhấp nháy theo nhịp quét).
 * - UAV cảm tử (kiểu Switchblade): ống phóng khí nén "phụt" + cánh bật mở "tạch", mô-tơ cánh quạt đẩy khởi động; bổ
 *   nhào: tiếng gió rít qua thân + mô-tơ gào lên, cao độ tăng theo tốc độ.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // SÚNG PHÓNG LỰU 40MM
  // ===========================================================================
  playGrenadeLauncher(distance = 0, pos = null, shooterId = null) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.35, delay: 0, pan: 0 };
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain * (remote ? 1 : 0.85), lowpass: sp.lowpass, wet: Math.max(0.3, sp.wet), pan: sp.pan });
    if (this.playSample('grenade_launcher', out, t, { gain: 1 })) return;
    const v = 0.9 + Math.random() * 0.2;
    // liều phóng áp suất thấp: "bụp" trầm đục
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320 * v, drive: 1.8, gain: 1.5, attack: 0.002, dur: 0.14 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 160 * v, Q: 1.1, drive: 1.4, gain: 1.1, attack: 0.002, dur: 0.1 });
    this.tone(out, t, { freq: 95 * v, freqEnd: 52, sweep: 0.09, gain: 0.7, attack: 0.002, dur: 0.12 });
    this.snap(out, t, 0.28, 2600, 1.6);
    if (remote && distance > 900) return;   // xa: chỉ còn tiếng bụp
    // khóa nòng nặng lùi về rồi đập lên: hai tiếng kim loại "cạch – cạch"
    const tb = t + 0.045 + Math.random() * 0.01;
    this.metal(out, tb, { f0: 620 * v, ratios: [1, 2.31, 3.9, 6.1], decay: 0.09, gain: 0.22, click: 0.5 });
    this.metal(out, tb + 0.07, { f0: 840 * v, ratios: [1, 2.6, 4.4], decay: 0.06, gain: 0.16, click: 0.4 });
    // mắt xích dây đạn kéo qua khe nạp
    this.burst(out, tb + 0.02, { filter: 'bandpass', freq: 3200, Q: 2, gain: 0.08, attack: 0.004, dur: 0.06 });
    if (!remote && this.interior && this.interiorShot) this.interiorShot('mg', t);
  }

  // ===========================================================================
  // MÁY PHÁ KHÓA RADAR
  // ===========================================================================
  playLockJamToggle(on) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ gain: 0.55, wet: 0.08 });
    // rơ-le công suất đóng / ngắt
    this.metal(out, t, { f0: 1800, ratios: [1, 2.2, 3.7], decay: 0.03, gain: 0.25, click: 0.8 });
    // bộ tổng hợp tần số quét lên (bật) / xuống (tắt)
    this.tone(out, t + 0.03, { type: 'square', freq: on ? 420 : 1300, freqEnd: on ? 1500 : 380, sweep: 0.22, gain: 0.07, attack: 0.01, dur: 0.26, filter: 'lowpass', filterFreq: 3000 });
    if (on) this.tone(out, t + 0.3, { freq: 1760, gain: 0.06, attack: 0.004, dur: 0.07 });
  }

  // ù rè lúc đang phát nhiễu (level 0..1, gọi mỗi khung hình từ lock_jammer.js)
  updateLockJamHum(level = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (!this._ljHum) {
      if (level <= 0.001) return;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.masterGain);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
      const ws = ctx.createWaveShaper(); ws.curve = this.getShaper(3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const og = ctx.createGain(); og.gain.value = 0.35;
      o.connect(ws); ws.connect(lp); lp.connect(og); og.connect(out);
      // nhiễu dải hẹp quét qua lại như máy phát nhiễu quét tần
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuffer; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 6;
      const ng = ctx.createGain(); ng.gain.value = 0.5;
      const sw = ctx.createOscillator(); sw.frequency.value = 7.3;
      const swd = ctx.createGain(); swd.gain.value = 1100;
      sw.connect(swd); swd.connect(bp.frequency);
      const flick = ctx.createOscillator(); flick.type = 'square'; flick.frequency.value = 23;
      const fd = ctx.createGain(); fd.gain.value = 0.35;
      flick.connect(fd); fd.connect(ng.gain);
      n.connect(bp); bp.connect(ng); ng.connect(out);
      for (const s of [o, n, sw, flick]) s.start(now);
      this._ljHum = { out, nodes: [o, n, sw, flick], off: 0 };
    }
    const H = this._ljHum;
    H.out.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.07, now, 0.08);
    if (level <= 0.001) {
      if ((H.off += 1) > 90) {   // im hẳn ~1,5 s thì giải phóng nút
        for (const s of H.nodes) { try { s.stop(); } catch (e) { /* đã dừng */ } }
        H.out.disconnect(); this._ljHum = null;
      }
    } else H.off = 0;
  }

  // ===========================================================================
  // UAV CẢM TỬ
  // ===========================================================================
  playKamiLaunch(distance = 0, pos = null) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.3, delay: 0, pan: 0 };
    if (sp.gain < 0.05) return;
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain * 0.9, lowpass: sp.lowpass, wet: Math.max(0.3, sp.wet), pan: sp.pan });
    // ống khí nén đẩy drone ra: "phụt" + nắp ống bật
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, freqEnd: 260, sweep: 0.25, Q: 0.8, drive: 1.3, gain: 1.1, attack: 0.003, dur: 0.3 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: 0.9, attack: 0.002, dur: 0.12 });
    this.metal(out, t + 0.01, { f0: 520, ratios: [1, 2.4, 4.1], decay: 0.08, gain: 0.18, click: 0.6 });
    // cánh gập bật mở + động cơ tên lửa đẩy đánh lửa: "bụp" mồi lửa rồi xì gào
    this.metal(out, t + 0.22, { f0: 1500, ratios: [1, 2.7], decay: 0.04, gain: 0.12, click: 0.7 });
    this.burst(out, t + 0.32, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: 0.8, attack: 0.004, dur: 0.18 });
    this.burst(out, t + 0.33, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 1400, sweep: 0.5, Q: 0.7, gain: 0.5, attack: 0.02, dur: 0.7 });
  }

  // tiếng động cơ tên lửa đẩy tốc độ thấp đang cháy: ầm trầm + xì rít (x 0..1 = lực đẩy; 0 = tắt)
  updateKamiRocket(x = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (!this._kamiRk) {
      if (x <= 0.001) return;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.masterGain);
      const rum = ctx.createBufferSource(); rum.buffer = this.brownNoiseBuffer; rum.loop = true;
      const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 320;
      const rg = ctx.createGain(); rg.gain.value = 1.0;
      rum.connect(rlp); rlp.connect(rg); rg.connect(out);
      const his = ctx.createBufferSource(); his.buffer = this.pinkNoiseBuffer; his.loop = true;
      const hbp = ctx.createBiquadFilter(); hbp.type = 'bandpass'; hbp.Q.value = 0.6; hbp.frequency.value = 1900;
      const hg = ctx.createGain(); hg.gain.value = 0.35;
      his.connect(hbp); hbp.connect(hg); hg.connect(out);
      for (const s of [rum, his]) s.start(now);
      this._kamiRk = { out, rlp, hbp, nodes: [rum, his] };
    }
    const K = this._kamiRk, k = Math.max(0, Math.min(1, x));
    K.out.gain.setTargetAtTime(k > 0 ? 0.12 + k * 0.22 : 0, now, k > 0 ? 0.08 : 0.05);
    K.rlp.frequency.setTargetAtTime(240 + k * 260, now, 0.1);
    K.hbp.frequency.setTargetAtTime(1500 + k * 900, now, 0.1);
    if (k <= 0) {
      const D = this._kamiRk; this._kamiRk = null;
      setTimeout(() => { for (const s of D.nodes) { try { s.stop(); } catch (e) { /* đã dừng */ } } D.out.disconnect(); }, 400);
    }
  }

  playKamiDive() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ gain: 0.6, wet: 0.1 });
    // mô-tơ vọt ga khi chúc mũi
    this.tone(out, t, { type: 'sawtooth', freq: 220, freqEnd: 420, sweep: 0.35, gain: 0.12, attack: 0.02, dur: 0.4, filter: 'lowpass', filterFreq: 2200 });
    this.tone(out, t, { freq: 1200, freqEnd: 1800, sweep: 0.3, gain: 0.05, attack: 0.01, dur: 0.15 });   // bíp xác nhận bổ nhào
  }

  // tiếng gió rít + mô-tơ gào theo tốc độ bổ nhào (x 0..1; 0 = dừng)
  updateKamiDive(x = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (!this._kamiDive) {
      if (x <= 0.001) return;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.masterGain);
      const wind = ctx.createBufferSource(); wind.buffer = this.pinkNoiseBuffer; wind.loop = true;
      const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.Q.value = 1.4; wbp.frequency.value = 600;
      const wg = ctx.createGain(); wg.gain.value = 0.8;
      wind.connect(wbp); wbp.connect(wg); wg.connect(out);
      const mot = ctx.createOscillator(); mot.type = 'sawtooth'; mot.frequency.value = 260;
      const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 2400;
      const mg = ctx.createGain(); mg.gain.value = 0.18;
      mot.connect(mlp); mlp.connect(mg); mg.connect(out);
      const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 900;
      const wh = ctx.createGain(); wh.gain.value = 0.08;
      whine.connect(wh); wh.connect(out);
      for (const s of [wind, mot, whine]) s.start(now);
      this._kamiDive = { out, wbp, mot, whine, nodes: [wind, mot, whine] };
    }
    const K = this._kamiDive, k = Math.max(0, Math.min(1, x));
    K.out.gain.setTargetAtTime(k > 0 ? 0.18 + k * 0.35 : 0, now, k > 0 ? 0.06 : 0.04);
    K.wbp.frequency.setTargetAtTime(500 + k * 2600, now, 0.08);
    K.mot.frequency.setTargetAtTime(240 + k * 260, now, 0.08);
    K.whine.frequency.setTargetAtTime(800 + k * 1500, now, 0.08);
    if (k <= 0) {
      const D = this._kamiDive; this._kamiDive = null;
      setTimeout(() => { for (const s of D.nodes) { try { s.stop(); } catch (e) { /* đã dừng */ } } D.out.disconnect(); }, 300);
    }
  }
});
