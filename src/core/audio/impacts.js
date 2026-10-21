/**
 * ĐẠN TRÚNG MỤC TIÊU: mũi tên APFSDS, đạn 30mm / 12.7mm, va chạm xe, trúng giáp xe mình, đạn bay sượt qua.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // Mũi tên APFSDS: trúng giáp -> tiếng "KHÁNG" chát của thép bị đâm thủng + rít xé + mảnh vỡ lách cách bên trong;
  // trúng đất / tường -> tiếng đập trầm + đất đá / bê tông vỡ
  playKineticImpact(distance, hitType = 'GROUND', pos = null) {
    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    // Đạn động năng không có thuốc nổ: tiếng va đanh, gắt nhưng nhỏ hơn hẳn một vụ nổ đạn HE
    const out = this.voice({ gain: sp.gain * 0.4, lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    const play = (kind, g) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer(kind);
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.08;
      const gg = this.ctx.createGain();
      gg.gain.value = g;
      src.connect(gg);
      gg.connect(out);
      src.start(t);
    };
    if (hitType === 'DIRECT_HIT') {
      // mũi tên xuyên giáp ~1,6 km/s đập vào giáp thép dày: cú va cực lớn gõ vào khối thép (mẫu dựng theo vật lý)
      play('hitSteelHeavy', 1.6);
      // xé thủng: tiếng rít kim loại tụt tần nhanh
      this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 700, sweep: 0.14, Q: 2.5, drive: 3, gain: 0.5, attack: 0.002, dur: 0.18 });
      // mảnh vỡ văng trong khoang lách cách
      this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3800, Q: 0.9, gain: 0.5, attack: 0.01, dur: 0.35 });
      this.tone(out, t, { freq: 95, freqEnd: 45, sweep: 0.1, drive: 2, gain: 0.7, attack: 0.001, dur: 0.16 });
      // góc chạm xiên / giáp quá dày: mũi tên nảy bật đi rít
      if (Math.random() < 0.15) this.playRicochet(out, t + 0.01);
    } else if (hitType === 'WATER') {
      this.snap(out, t, 0.6, 5000, 4);
      // Mũi tên xuyên cắm xuống nước: "tõm" nặng + cột nước nhỏ đổ xuống
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 0.9, attack: 0.002, dur: 0.18 });
      this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, freqEnd: 3000, sweep: 0.15, Q: 0.8, gain: 0.6, attack: 0.01, dur: 0.3 });
      this.burst(out, t + 0.3, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3200, Q: 0.7, gain: 0.5, attack: 0.1, dur: 0.7 });
    } else if (hitType === 'GROUND' || !hitType) {
      play('hitDirt', 1.2);
      // cắm xuống đất: "huỵch" trầm + đất cát bắn tung
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, freqEnd: 120, sweep: 0.15, drive: 4, gain: 1.0, attack: 0.001, dur: 0.3 });
      this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200, Q: 0.8, gain: 0.7, attack: 0.02, dur: 0.5 });
    } else {
      play('hitDirt', 0.9);
      // bê tông / nhà gạch / gỗ / đá / bao cát: tiếng vật liệu riêng
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 900, freqEnd: 180, sweep: 0.12, drive: 3, gain: 0.8, attack: 0.001, dur: 0.22 });
      this.surfaceHit(out, t, hitType, 'kinetic', 1);
    }
  }

  // Đạn liên thanh 30mm (đầu đạn nổ mạnh) / đạn súng máy 12.7mm găm đất / giáp / tường
  playGatlingImpact(distance, hitType = 'GROUND', isIncendiary = false, pos = null, isMG = false) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastGatlingImpactTime < 0.038) return;
    this.lastGatlingImpactTime = now;

    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.06) return;
    const t = now + sp.delay;
    // Đầu đạn 30mm chỉ vài chục gam thuốc nổ (đạn pháo 120mm: vài kg) -> mỗi phát nhỏ hơn hẳn; bắn 30 phát/giây cộng dồn đã đủ ồn
    const out = this.voice({ gain: sp.gain * (isMG ? 0.9 : 0.3), lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });

    if (this.playSample('bullet_impact', out, t, { gain: 1.0, vary: 0.1 })) return;

    // Mẫu dựng theo vật lý (synthGunshot): 30mm = xung nổ nhỏ của đầu đạn; 12.7mm = cú va (thép: "chát", đất: "phập")
    const play = (kind, g, rate = 1) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.gunshotBuffer(kind);
      src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.12);
      const gg = this.ctx.createGain();
      gg.gain.value = g;
      src.connect(gg);
      gg.connect(out);
      src.start(t);
    };
    const steel = hitType === 'DIRECT_HIT';
    if (!isMG) play('blast30', 1.6);
    if (steel) play('hitSteel', isMG ? 0.55 : 1.3, isMG ? 1.1 : 0.85);
    else if (isMG && hitType !== 'WATER') play('hitDirt', hitType === 'WALL' || hitType === 'BOULDER' ? 0.35 : 0.45, hitType === 'WALL' || hitType === 'BOULDER' ? 1.4 : 1);

    if (steel) {
      if (!isMG) this.burst(out, t + 0.005, { filter: 'highpass', freq: 3500, gain: 0.25, attack: 0.002, dur: 0.12 });   // mảnh thép tóe tia lửa
      // Đạn 12.7mm không xuyên nổi giáp: thỉnh thoảng nảy bật đi kêu rít
      if (isMG && Math.random() < 0.3) this.playRicochet(out, t + 0.008);
    } else if (hitType === 'WATER') {
      // Đạn găm mặt nước: tiếng "xẹt / tõm" ngắn + tia nước rơi lộp độp (30mm: cột nước lớn hơn, át tiếng nổ bị nước nuốt)
      const wk = isMG ? 1 : 2.5;
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, freqEnd: 3800, sweep: 0.06, Q: 1.2, gain: 0.45 * wk, attack: 0.002, dur: 0.09 });
      this.burst(out, t + 0.12, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3500, Q: 0.8, gain: 0.35 * wk, attack: 0.03, dur: 0.3 });
    }
    // tiếng vật liệu riêng (bê tông / nhà / gỗ / đá / bao cát / đất) + lớp đạn cháy
    this.surfaceHit(out, t, hitType, isMG ? 'b127' : 'b30', 1, isIncendiary);
  }

  /**
   * Xe mình va chạm. kind: 'obstacle' (tường, nhà, công sự, cây) | 'vehicle' (xe khác).
   * intensity 0..1 theo tốc độ lúc đâm. Đâm mạnh: "RẦM" thép nặng + tường / cây vỡ lạo xạo; cọ nhẹ: thép cạ ken két.
   */
  playCollision(intensity = 0.5, kind = 'obstacle') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    if (t - (this._lastBump || 0) < 0.35) return;
    this._lastBump = t;
    const k = Math.max(0.15, Math.min(1, intensity));
    const out = this.voice({ gain: 0.6 + 0.6 * k, wet: 0.12 });
    // khối thép hàng chục tấn đập vào vật cản: "huỵch" trầm
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200 + 120 * k, drive: 3, gain: 1.2 * k, attack: 0.003, dur: 0.25 + 0.2 * k });
    this.tone(out, t, { freq: 55, freqEnd: 30, sweep: 0.2, drive: 2, gain: 0.8 * k, attack: 0.003, dur: 0.3 });
    if (kind === 'vehicle') {
      // thép đâm thép: tiếng "KENG" lớn ngân trầm + cạ xước
      this.metal(out, t, { f0: 95 + Math.random() * 40, ratios: [1, 1.8, 2.9, 4.2], decay: 0.9, gain: 0.45 * k, click: 0.8 });
      this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1900, freqEnd: 900, sweep: 0.35, Q: 4, gain: 0.3 * k, attack: 0.01, dur: 0.4 });
    } else {
      // vật cản vỡ: gạch, bê tông, gỗ vỡ lạo xạo + giáp trước va cạ
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 2600, gain: 1.0 * k, attack: 0.005, dur: 0.5 });
      this.metal(out, t, { f0: 160 + Math.random() * 60, ratios: [1, 2.3, 3.7], decay: 0.35, gain: 0.25 * k, click: 0.5 });
    }
    // đồ đạc trong khoang xô lệch
    for (let i = 0; i < 3; i++) this.metal(out, t + 0.05 + Math.random() * 0.25, { f0: 700 + Math.random() * 800, ratios: [1, 2.4], decay: 0.05, gain: 0.05 * k, click: 0.3 });
  }

  /**
   * Tiếng của VẬT LIỆU bị trúng — dùng chung cho mọi loại đạn, mỗi cặp đạn × vật liệu ra tiếng riêng.
   * cls: 'blast' (đạn nổ) | 'heat' (đầu đạn lõm: tên lửa, RPG) | 'kinetic' (đạn xuyên giáp, không thuốc nổ)
   *      | 'b30' (đạn 30mm nổ mạnh) | 'b127' (đạn 12.7mm thường); k: cỡ; inc: đạn cháy
   * hitType -> vật liệu: DIRECT_HIT giáp thép · WALL bê tông · BUILDING nhà gạch vữa · TREE thân gỗ · BOULDER đá ·
   *   SANDBAG bao cát · WATER nước · còn lại đất
   */
  surfaceHit(out, t, hitType, cls, k = 1, inc = false) {
    const big = cls === 'blast' || cls === 'heat';
    const bullet = cls === 'b30' || cls === 'b127';
    const R = Math.random;
    // đạn nổ lớn / đầu đạn 30mm có thân tiếng nổ rất to -> lớp vật liệu phải đủ mạnh mới nghe ra
    k *= big ? 2.6 : cls === 'b30' ? 2.4 : 1;
    const stones = (t0, n, fLo, fHi, g, spread) => {
      for (let i = 0; i < n; i++) this.burst(out, t0 + Math.pow(R(), 0.8) * spread, { filter: 'bandpass', freq: fLo + R() * (fHi - fLo), Q: 6, gain: g * (0.4 + R() * 0.6), attack: 0.0005, dur: 0.012 + R() * 0.02 });
    };
    switch (hitType) {
      case 'DIRECT_HIT': {
        if (cls === 'heat') {
          // đầu đạn lõm: luồng kim loại nóng chảy xuyên giáp — "CHÍT" cực gắt, rồi mảnh giáp vụn phun "xèèè" vào trong
          this.burst(out, t, { filter: 'bandpass', freq: 3600, Q: 1.2, drive: 4, gain: 1.4 * k, attack: 0.0003, dur: 0.025 });
          this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 4200, freqEnd: 1400, sweep: 0.3, Q: 1.5, drive: 2, gain: 1.0 * k, attack: 0.003, dur: 0.35 });
          this.metal(out, t, { f0: 130 + R() * 40, ratios: [1, 1.8, 2.9, 4.3], decay: 0.6, gain: 0.35 * k, click: 0.6 });
        } else if (big) {
          // đạn nổ trên vỏ thép: thép cộng hưởng chát chúa + tiếng xé kim loại + thân xe "BOONG" trầm
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 1.2, drive: 3, gain: 0.9 * k, attack: 0.001, dur: 0.18 });
          this.burst(out, t, { filter: 'bandpass', freq: 2400, freqEnd: 900, Q: 0.9, drive: 2, gain: 0.4 * k, attack: 0.001, dur: 0.25 });
          this.metal(out, t + 0.005, { f0: 105 + R() * 35, ratios: [1, 1.7, 2.6, 3.9], decay: 0.8, gain: 0.4 * k, click: 0.5 });
        }
        break;   // đạn xuyên giáp / đạn nhỏ trúng giáp: hàm riêng đã tạo tiếng thép (kèm nảy rít)
      }
      case 'WALL': {
        // BÊ TÔNG: cứng, giòn — tiếng va "CHÁT" gắt, vụn bê tông bắn tung lạo xạo, tảng lớn rơi "bịch", bụi xi măng xì
        this.burst(out, t, { filter: 'bandpass', freq: 2200, Q: 0.9, drive: 3, gain: (bullet ? 0.5 : 0.9) * k, attack: 0.0004, dur: 0.04 });
        this.burst(out, t + 0.005, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.6, gain: (bullet ? 1.2 : 2.2) * k, attack: 0.004, dur: bullet ? 0.25 : 0.8 });
        if (!bullet) {
          // Đạn xuyên động năng chỉ khoét lỗ nhỏ, không có tiếng nổ che phía sau: vụn rơi phải dồn sát cú va.
          // Rải tới ~1 s thì tiếng "bịch" lẻ loi tách hẳn ra, nghe như một tiếng nổ nhỏ thứ hai sau phát bắn
          const kin = cls === 'kinetic';
          for (let i = 0; i < (big ? 6 : 3); i++) this.burst(out, t + (kin ? 0.04 + R() * 0.22 : 0.15 + R() * 0.8), { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: (kin ? 0.35 : 0.5) * k, attack: 0.002, dur: 0.07 });
          this.burst(out, t + 0.1, { filter: 'highpass', freq: 2600, gain: 0.12 * k, attack: 0.2, dur: 1.0 });
        }
        if (bullet && R() < (cls === 'b127' ? 0.35 : 0.15)) this.playRicochet(out, t + 0.006);
        break;
      }
      case 'BUILDING': {
        // NHÀ GẠCH VỮA: xốp hơn bê tông — tiếng "bộp / ầm" đục, gạch vữa vỡ vụn rào rào, bụi; đạn nổ làm kính vỡ, khung gỗ gãy
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: bullet ? 900 : 700, drive: 2, gain: (bullet ? 0.6 : 1.0) * k, attack: 0.001, dur: bullet ? 0.07 : 0.35 });
        this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1800, gain: (bullet ? 1.0 : 2.0) * k, attack: 0.008, dur: bullet ? 0.3 : 1.2 });
        if (!bullet) {
          this.burst(out, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 450, drive: 2, gain: 0.7 * k, attack: 0.08, dur: 1.6 });
          if (big) { stones(t + 0.05, 8, 3500, 7500, 0.12 * k, 0.6); this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1100, Q: 1, gain: 0.8 * k, attack: 0.002, dur: 0.2 }); }
        }
        break;
      }
      case 'TREE': {
        // THÂN GỖ: "cộc" (đạn nhỏ găm) / "RẮC" (đạn lớn làm nứt toác), dăm gỗ văng, lá cành xào xạc
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: bullet ? 650 : 500, Q: 3, drive: 2, gain: (bullet ? 0.8 : 1.2) * k, attack: 0.0006, dur: bullet ? 0.045 : 0.08 });
        this.burst(out, t + 0.004, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1500, Q: 0.7, gain: (bullet ? 0.8 : 2.0) * k, attack: 0.003, dur: bullet ? 0.18 : 0.5 });
        if (!bullet) {
          this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 900, Q: 1.2, gain: 1.4 * k, attack: 0.002, dur: 0.3 });
          this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 2800, gain: 0.25 * k, attack: 0.2, dur: 1.1 });
        }
        break;
      }
      case 'BOULDER': {
        // ĐÁ TẢNG: cứng nhất — "CHÁT" rất gắt, đá vụn văng lách cách, đạn nảy rít rất hay gặp
        this.burst(out, t, { filter: 'bandpass', freq: 3000, Q: 1.3, drive: 4, gain: (bullet ? 0.6 : 1.1) * k, attack: 0.0003, dur: 0.03 });
        stones(t + 0.01, bullet ? 3 : 12, 1800, 5000, (bullet ? 0.15 : 0.3) * k, bullet ? 0.25 : 0.9);
        if (!bullet && !big) this.burst(out, t + 0.005, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.7, gain: 1.2 * k, attack: 0.004, dur: 0.4 });
        if ((bullet && R() < 0.5) || (cls === 'kinetic' && R() < 0.4)) this.playRicochet(out, t + 0.005);
        break;
      }
      case 'SANDBAG': {
        // BAO CÁT: hút năng lượng — "phập" nghẹt, không vang; cát chảy rào rào từ bao rách
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: bullet ? 280 : 220, drive: 2, gain: (bullet ? 0.7 : 0.6) * k, attack: 0.001, dur: bullet ? 0.06 : 0.18 });
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 0.6, gain: (bullet ? 0.12 : 0.06) * k, attack: 0.08, dur: bullet ? 0.4 : 1.2 });
        if (!bullet) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, gain: 0.5 * k, attack: 0.002, dur: 0.35 });
        break;
      }
      case 'WATER': case 'AIRBURST': break;   // nước / nổ trên không: hàm gọi tự xử lý
      default: {
        // ĐẤT: tiếng "phụt" của đất bị xới (đạn nhỏ) — đạn lớn có lớp đất đá rơi riêng
        if (bullet) {
          this.burst(out, t + 0.005, { filter: 'bandpass', freq: 3000, Q: 0.7, gain: 0.25, attack: 0.008, dur: 0.2 });
          this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.7, attack: 0.03, dur: 0.35 });
        }
      }
    }
    // ĐẠN CHÁY: thuốc cháy bùng "phựt" + trên thép tóe tia lửa xèo xèo; trên gỗ / nhà bắt lửa lách tách
    // (lớp phụ: dùng cỡ gốc, không nhân hệ số tăng cường để không che tiếng vật liệu)
    if (cls === 'b30') k /= 2.4;
    if (inc) {
      this.burst(out, t + 0.003, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2200, Q: 0.8, gain: 0.35 * k, attack: 0.002, dur: 0.12 });
      if (hitType === 'DIRECT_HIT' || hitType === 'WALL' || hitType === 'BOULDER') this.burst(out, t + 0.01, { filter: 'highpass', freq: 4500, gain: 0.07 * k, attack: 0.01, dur: 0.4 });
      else if (hitType === 'TREE' || hitType === 'BUILDING') this.burst(out, t + 0.05, { buffer: this.crackleBuffer, filter: 'highpass', freq: 1200, gain: 0.5 * k, attack: 0.05, dur: 0.6 });
    }
  }

  // Tiếng đạn nảy rít vút đi: đầu đạn méo xoay lộn -> tiếng xé gió dải hẹp tụt tần (Doppler khi bay xa), hơi rung
  playRicochet(dest, t) {
    const f = 2400 + Math.random() * 1600;
    const d = 0.25 + Math.random() * 0.2;
    this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, freqEnd: f * 0.42, sweep: d, Q: 14, gain: 0.5, attack: 0.003, dur: d });
    this.tone(dest, t, { freq: f, freqEnd: f * 0.4, sweep: d, gain: 0.035, attack: 0.004, dur: d, vibrato: 30 + Math.random() * 20, vibratoDepth: f * 0.03 });
  }

  /**
   * Xe của mình trúng đạn — nghe từ trong khoang: thép thân xe truyền âm trực tiếp vào tai kíp lái.
   * Đạn nhỏ: tiếng "tạch / keng" khô như mưa đá đập mái tôn; đạn lớn: "BOONG" thép dày ngân trầm, rồi ù tai.
   */
  playHullHit(ammoType = 'NORMAL') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const small = ammoType === 'GATLING_BULLET' || ammoType === 'INCENDIARY' || ammoType === 'SCOUT_BULLET';
    if (small) {
      if (t - (this._lastHullTick || 0) < 0.035) return;
      this._lastHullTick = t;
      const out = this.voice({ gain: 0.35, wet: 0.02 });
      const mg = ammoType === 'SCOUT_BULLET';
      const f0 = (mg ? 700 : 480) * (0.8 + Math.random() * 0.45);
      this.burst(out, t, { filter: 'bandpass', freq: f0 * 3, Q: 1.2, drive: 3, gain: mg ? 0.5 : 0.6, attack: 0.0003, dur: 0.018 });
      this.metal(out, t, { f0, ratios: [1, 1.83, 2.95, 4.4], decay: mg ? 0.22 : 0.3, gain: mg ? 0.28 : 0.36, click: 0.5 });
      if (!mg) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2, gain: 0.7, attack: 0.001, dur: 0.12 });   // đầu đạn 30mm nổ ngoài vỏ
      return;
    }
    // mức đưa vào thấp có chủ đích để giữ cú "BOONG" gắt (không bị tầng cuối ép bẹt)
    const out = this.voice({ gain: 0.32, wet: 0.04 });
    const heavy = ammoType === 'HE' || ammoType === 'CLUSTER' || ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
    const f0 = 82 + Math.random() * 40;
    // va đập: xung gắt + khối thép dày ngân (mode bất hòa thấp, tắt chậm)
    this.snap(out, t, 1.4, 4500, 5);
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2.5, gain: 2.0, attack: 0.001, dur: heavy ? 0.45 : 0.3 });
    this.tone(out, t, { freq: 95, freqEnd: 45, sweep: 0.2, drive: 2, gain: 1.4, attack: 0.001, dur: 0.35 });
    this.metal(out, t, { f0, ratios: [1, 1.71, 2.63, 3.9, 5.3], decay: 1.4, gain: 0.55, click: 1 });
    // Giáp dày hàng chục mm, bắt chặt vào khung và đầy thiết bị bên trong: rung tắt rất nhanh, nghe "BỊCH / THỤP" nặng
    // chứ không ngân như chuông (trước đây 2 sóng sin ngân 1-1,6 s -> nghe như gõ chuông chùa)
    this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0 * 2, Q: 2.5, drive: 1.5, gain: 0.5, attack: 0.002, dur: 0.22 });
    // mảnh vỡ & sơn tróc lả tả bên trong khoang, đồ đạc trong xe xô lệch lách cách
    this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.8, gain: 0.55, attack: 0.01, dur: 0.6 });
    for (let i = 0; i < 4; i++) this.metal(out, t + 0.12 + Math.random() * 0.5, { f0: 600 + Math.random() * 900, ratios: [1, 2.4], decay: 0.06, gain: 0.06, click: 0.3 });
    this.shellShock(heavy ? 0.85 : ammoType === 'AP' ? 0.6 : 0.7);
  }

  /**
   * Đạn bay sượt qua gần xe mình (không trúng). kind: 'mg' | 'cannon30' | 'shell' | 'missile'.
   * Đạn siêu thanh: tiếng "CHÁT" của sóng xung kích tới trước, rồi tiếng xé gió; tên lửa: động cơ gầm vụt qua (Doppler).
   */
  playFlyby(kind = 'shell', missDist = 30, pos = null) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const small = kind === 'mg' || kind === 'cannon30';
    if (small) {
      if (now - (this._lastFlybySmall || 0) < 0.06) return;
      this._lastFlybySmall = now;
    }
    const R = kind === 'mg' ? 45 : kind === 'cannon30' ? 55 : kind === 'missile' ? 110 : 90;
    const near = Math.max(0, 1 - missDist / R);
    const sp = this.spatial(0, pos);
    const out = this.voice({ gain: 0.3 + 0.7 * near, wet: 0.2, pan: sp.pan * 0.7 });
    const t = now;
    if (kind === 'missile') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 3200, freqEnd: 700, sweep: 0.7, gain: 0.9, attack: 0.18, dur: 0.6 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, gain: 0.9, attack: 0.15, dur: 0.7 });
      this.burst(out, t + 0.1, { filter: 'bandpass', freq: 1800, freqEnd: 600, sweep: 0.5, Q: 3, gain: 0.25, attack: 0.05, dur: 0.5 });
      return;
    }
    if (kind === 'mg') {
      this.snap(out, t, 0.55, 9000, 3);
      this.burst(out, t + 0.004, { filter: 'bandpass', freq: 3800, freqEnd: 1800, sweep: 0.06, Q: 2, gain: 0.25, attack: 0.002, dur: 0.06 });
      return;
    }
    if (kind === 'cannon30') {
      this.snap(out, t, 0.8, 8000, 4);
      this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2200, freqEnd: 700, sweep: 0.12, Q: 1.6, gain: 0.5, attack: 0.004, dur: 0.12 });
      return;
    }
    // Đạn pháo 120mm: "CHÁT" cực gắt + tiếng xé gió dày, trầm dần + luồng gió đẩy "phựt"
    this.snap(out, t, 1.3, 7000, 6);
    this.burst(out, t, { filter: 'bandpass', freq: 2600, Q: 0.8, drive: 3, gain: 0.5, attack: 0.0004, dur: 0.03 });
    this.burst(out, t + 0.005, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, freqEnd: 320, sweep: 0.35, Q: 1.4, drive: 2, gain: 0.9, attack: 0.02, dur: 0.38 });
    this.burst(out, t + 0.01, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, gain: 0.8 * near + 0.2, attack: 0.01, dur: 0.25 });
  }
});
