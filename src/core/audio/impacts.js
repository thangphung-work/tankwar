/**
 * ĐẠN TRÚNG MỤC TIÊU: mũi tên APFSDS, đạn 30mm / 12.7mm, va chạm xe, trúng giáp xe mình, đạn bay sượt qua.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // Mũi tên APFSDS: trúng giáp -> tiếng "KHÁNG" chát của thép bị đâm thủng + rít xé + mảnh vỡ lách cách bên trong;
  // trúng đất / tường -> tiếng đập trầm + đất đá / bê tông vỡ
  // opts.du: lõi urani nghèo — mảnh urani tự bốc cháy: thêm tiếng "xèo" lách tách của mảnh đang cháy (trên giáp ngắn, rơi
  // đất / tường kéo dài). Lõi vonfram (thường): lõi vỡ vụn "tạch" đanh tóe tia lửa, không có tiếng cháy
  playKineticImpact(distance, hitType = 'GROUND', pos = null, opts = null) {
    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    const du = !!(opts && opts.du);
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
      // mũi tên xuyên giáp ~1,6 km/s đập vào giáp thép dày: cú va cực lớn gõ vào khối thép (mẫu dựng theo vật lý).
      // Phần "xé thủng + mảnh vỡ trong khoang" chỉ phát khi đạn THỰC SỰ xuyên (playArmorOutcome, sau khi tính giáp);
      // đạn nảy / bị khiên làm chệch: game.js gọi playArmorGlance thay cho hàm này
      play('hitSteelHeavy', 1.6);
      this.tone(out, t, { freq: 95, freqEnd: 45, sweep: 0.1, drive: 2, gain: 0.7, attack: 0.001, dur: 0.16 });
      if (du) this.burst(out, t + 0.02, { buffer: this.crackleBuffer, filter: 'highpass', freq: 2400, gain: 0.35, attack: 0.03, dur: 0.5 });   // mảnh urani cháy xèo trên mặt giáp
      else this.burst(out, t + 0.002, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 4500, Q: 0.9, gain: 0.45, attack: 0.001, dur: 0.07 });   // lõi vonfram vỡ vụn "tạch"
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
    // urani: mảnh văng ra vẫn cháy lập lòe trên đất / tường — "xèo" lách tách thưa dần
    if (du && hitType !== 'DIRECT_HIT' && hitType !== 'WATER') this.burst(out, t + 0.08, { buffer: this.crackleBuffer, filter: 'highpass', freq: 2000, gain: 0.3, attack: 0.08, dur: 1.4 });
  }

  // Đạn liên thanh 30mm (đầu đạn nổ mạnh) / đạn súng máy 12.7mm găm đất / giáp / tường
  // opts.thin: trúng xe vỏ mỏng (trinh sát, xe pháo bánh lốp) — đạn xuyên thủng tấm thép mỏng: "pạch" đanh + tôn rung
  // "oang" ngắn, không phải tiếng "CHÁT" của đạn vỡ trên giáp dày; không nảy
  playGatlingImpact(distance, hitType = 'GROUND', isIncendiary = false, pos = null, isMG = false, opts = null) {
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
    const thin = steel && !!(opts && opts.thin);
    this._gMat = hitType === 'GROUND' || !hitType ? this.groundMatAt(pos) : null;
    if (!isMG) play('blast30', 1.6);
    if (thin) {
      // vỏ mỏng bị xuyên: cú va gọn nhẹ hơn + tấm thép rung "oang" ngắn + tiếng xé thủng "phập", mảnh lọt vào trong lạo xạo
      play(isMG ? 'hitSteel127' : 'hitSteel', isMG ? 0.55 : 0.8, isMG ? 1.25 : 1.05);
      this.metal(out, t + 0.002, { f0: (isMG ? 950 : 760) * (0.85 + Math.random() * 0.3), ratios: [1, 2.32, 4.25], decay: 0.12, gain: isMG ? 0.22 : 0.3, click: 0.6 });
      this.burst(out, t + 0.001, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 1.2, drive: 2, gain: isMG ? 0.35 : 0.5, attack: 0.0005, dur: 0.03 });
      this.burst(out, t + 0.02, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.8, gain: isMG ? 0.15 : 0.25, attack: 0.005, dur: 0.15 });
      this.surfaceHit(out, t, hitType, isMG ? 'b127' : 'b30', 1, isIncendiary);
      return;
    }
    if (steel) play(isMG ? 'hitSteel127' : 'hitSteel', isMG ? 0.95 : 1.3, isMG ? 1 : 0.85);
    else if (isMG && hitType !== 'WATER') {
      const hardG = hitType === 'WALL' || hitType === 'BOULDER' || this._gMat === 'rock' || this._gMat === 'hard' || this._gMat === 'asphalt';
      play('hitDirt', hardG ? 0.35 : this._gMat === 'sand' ? 0.3 : 0.45, hardG ? 1.4 : this._gMat === 'sand' ? 0.8 : 1);
    }

    if (steel) {
      // mảnh thép tóe tia lửa (12.7mm: lõi thép + vỏ đồng vỡ vụn tóe chùm tia lửa rộng, ngắn hơn)
      this.burst(out, t + 0.005, { filter: 'highpass', freq: 3500, gain: isMG ? 0.18 : 0.25, attack: 0.002, dur: isMG ? 0.08 : 0.12 });
      // 12.7mm: cú "CHÁT" gắt dải trung — phần làm cú va nghe nặng, đanh như búa tạ quai vào thép
      if (isMG) this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700 + Math.random() * 600, Q: 1.1, drive: 3, gain: 0.45, attack: 0.0004, dur: 0.035 });
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

  // Loại mặt đất tại pos theo đúng bảng vật liệu hiệu ứng hình (ExplosionFX.surfacePalette): 'sand' | 'soil' | 'mud' |
  // 'rock' | 'asphalt' ... -> tiếng đạn găm đất khớp với cái thấy (cát / bùn / sườn đá / đường nhựa)
  groundMatAt(pos) {
    const g = typeof window !== 'undefined' && window.game;
    if (!pos || !g || !g.scene || typeof ExplosionFX === 'undefined' || !ExplosionFX.forScene) return null;
    const fx = ExplosionFX.forScene(g.scene);
    const pal = fx && fx.surfacePalette ? fx.surfacePalette(pos.x, pos.z, 'GROUND') : null;
    return pal ? (pal.wet ? 'mud' : pal.mat || 'soil') : null;
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
    if (kind === 'vehicle') {
      // thép đâm thép: tiếng "KENG" lớn ngân trầm + cạ xước
      this.playCaseHit(out, t, 'hullBlast', 0.85 + Math.random() * 0.2, 0.9 * k);
      this.playCaseHit(out, t + 0.003, 'debrisPlateHull', 0.8 + Math.random() * 0.2, 0.3 * k);
      this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1900, freqEnd: 900, sweep: 0.35, Q: 4, gain: 0.3 * k, attack: 0.01, dur: 0.4 });
    } else {
      // vật cản vỡ: gạch, bê tông, gỗ vỡ lạo xạo + giáp trước va cạ
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 2600, gain: 1.0 * k, attack: 0.005, dur: 0.5 });
      this.playCaseHit(out, t, 'hullBlast', 1.0 + Math.random() * 0.2, 0.5 * k, 3500);
    }
    // đồ đạc trong khoang xô lệch
    for (let i = 0; i < 3; i++) this.playCaseHit(out, t + 0.05 + Math.random() * 0.25, 'debrisMetal', 1.2 + Math.random() * 0.6, 0.08 * k);
  }

  /**
   * VA CHẠM CÓ LỰC tại pos (mọi xe, có vị trí / hướng / khoảng cách như tiếng thứ cấp):
   * o = { J: xung lực (tấn x đv/s), vn: tốc độ áp sát, mA: khối lượng xe va (tấn), mB: vật kia (Infinity = cố định),
   *       mat: 'vehicle' | 'wreck' | 'car' | 'concrete' | 'stone' | 'adobe' | 'metal' | 'wood' | 'tree' | 'rock' | 'pole',
   *       self: có xe người chơi trong cuộc (to, gần), key: cặp va chạm (chống lặp) }
   * Lớp tiếng: (1) cú "huỵch" trầm của thân xe — xe càng nặng càng trầm & dài, (2) vỏ thép xe ngân (cao độ theo khối
   * lượng: xe trinh sát 10 tấn "keng" cao, xe tăng 60 tấn "boong" trầm), (3) tiếng vật liệu bên kia, (4) đồ trong khoang
   * xô lệch (xe người chơi). Độ to theo log xung lực: xe tăng đâm tường ở 36 km/h ~ tối đa, 4x4 cạ ô tô nhẹ ~ khẽ
   */
  collideAt(pos, o) {
    if (!this.ready() || !pos) return;
    const g = window.game;
    const lx = g && g.player ? g.player.x : pos.x, lz = g && g.player ? g.player.z : pos.z;
    const d = o.self ? 0 : Math.hypot(pos.x - lx, pos.z - lz);
    if (d > 1800) return;
    const now = this.ctx.currentTime;
    this._colT = this._colT || new Map();
    const last = this._colT.get(o.key);
    if (last !== undefined && now - last < 0.28) return;
    this._colT.set(o.key, now);
    if (this._colT.size > 64) for (const [k, v] of this._colT) if (now - v > 2) this._colT.delete(k);
    const k = Math.max(0.06, Math.min(1, (Math.log10(Math.max(1, o.J)) - 1.1) / 2.5));
    const heavy = Math.max(0, Math.min(1, ((o.mA || 40) - 8) / 55));      // 0 = xe 4x4 10 tấn, 1 = xe tăng 60+ tấn
    const sp = this.spatial(d, pos), t = now + sp.delay, R = Math.random;
    const out = this.voice({ gain: sp.gain * (o.self ? 1.05 : 0.9) * (0.3 + 0.95 * k), lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.1), pan: sp.pan });
    // (1) thân xe nặng dồn vào vật cản: "HUỴCH" — dưới 120 Hz với xe tăng, dài theo khối lượng
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 75 + 140 * (1 - heavy) + 70 * k, drive: 3, gain: 1.4 * k, attack: 0.002, dur: 0.16 + 0.34 * heavy + 0.2 * k });
    this.burst(out, t + 0.004, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 45 + 25 * (1 - heavy), gain: 0.9 * k * (0.4 + heavy), attack: 0.006, dur: 0.3 + 0.3 * heavy });
    // (2) vỏ thép xe ngân: cao độ theo khối lượng
    const rate = 0.68 + 0.5 * (1 - heavy) + R() * 0.08;
    this.playCaseHit(out, t, 'hullBlast', rate, (0.35 + 0.4 * k) * (o.mat === 'tree' || o.mat === 'wood' ? 0.5 : 1), 5200);
    // (3) vật liệu bên kia
    const crackle = (f, q, gn, dur) => this.burst(out, t + 0.008, { buffer: this.crackleBuffer, filter: 'bandpass', freq: f, Q: q, gain: gn * k, attack: 0.004, dur });
    const ticks = (n, fLo, fHi, gn, spread) => { for (let i = 0; i < n; i++) this.burst(out, t + 0.02 + Math.pow(R(), 0.8) * spread, { filter: 'bandpass', freq: fLo + R() * (fHi - fLo), Q: 6, gain: gn * k * (0.4 + R() * 0.6), attack: 0.0005, dur: 0.012 + R() * 0.025 }); };
    switch (o.mat) {
      case 'vehicle': case 'wreck': {
        // thép đâm thép: 2 vỏ giáp ngân lệch cao độ (vật kia nặng / nhẹ), tiếng nghiến xé ngắn, bu-lông / mắt xích lạch cạch
        const hb = Math.max(0, Math.min(1, ((isFinite(o.mB) ? o.mB : 60) - 8) / 55));
        this.playCaseHit(out, t + 0.006, 'hullBlast', 0.7 + 0.5 * (1 - hb) + R() * 0.06, 0.6 * k);
        this.playCaseHit(out, t + 0.01, 'debrisPlateHull', 0.8 + R() * 0.2, 0.35 * k);
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, freqEnd: 700, sweep: 0.3, Q: 5, drive: 2, gain: 0.35 * k, attack: 0.01, dur: 0.35 });
        ticks(4, 2200, 5200, o.mat === 'wreck' ? 0.25 : 0.15, 0.3);
        break;
      }
      case 'car': {
        // tôn ô tô móp: "rắc - oằn" tôn mỏng (cao, giòn), nhựa cản vỡ lách tách, kính vụn
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 520, sweep: 0.25, Q: 2.2, drive: 2.5, gain: 0.8 * k + 0.15, attack: 0.002, dur: 0.32 });
        this.playCaseHit(out, t + 0.004, 'sheetMetal', 1.15 + R() * 0.2, 0.5 * k + 0.1);
        crackle(2600, 0.8, 0.6, 0.25);
        ticks(5, 3500, 8000, 0.18, 0.25);
        break;
      }
      case 'concrete': case 'stone': case 'rubble': {
        // bê tông / đá: "CHÁT" giòn, vụn bê tông bắn lạo xạo, tảng nhỏ rơi "bịch"
        this.burst(out, t, { filter: 'bandpass', freq: 1900, Q: 0.9, drive: 3, gain: 0.7 * k, attack: 0.0005, dur: 0.05 });
        crackle(2800, 0.6, 1.4, 0.4 + 0.5 * k);
        for (let i = 0; i < 2 + Math.round(3 * k); i++) this.burst(out, t + 0.12 + R() * 0.6, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, gain: 0.4 * k, attack: 0.002, dur: 0.07 });
        if (k > 0.55 && this.secondaryAt) this.secondaryAt('masonry', pos, (k - 0.4) * 0.8, { h: 10 });
        break;
      }
      case 'adobe': {
        // gạch mộc / gạch vữa: "bộp" đục, gạch vữa vỡ rào rào
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 650, drive: 2, gain: 0.9 * k, attack: 0.001, dur: 0.28 });
        crackle(1700, 0.7, 1.6, 0.6 + 0.6 * k);
        if (k > 0.5 && this.secondaryAt) this.secondaryAt('adobe', pos, (k - 0.35) * 0.8, { h: 8 });
        break;
      }
      case 'metal': {
        // vách tôn kho xưởng / lan can cầu / cột mái che: tôn rung "boong" dài, lạch cạch
        this.burst(out, t, { filter: 'bandpass', freq: 520 + R() * 120, Q: 9, drive: 2, gain: 1.0 * k, attack: 0.0006, dur: 0.9 });
        this.burst(out, t + 0.003, { filter: 'bandpass', freq: 1700 + R() * 300, Q: 6, gain: 0.45 * k, attack: 0.0006, dur: 0.5 });
        ticks(5, 2500, 6000, 0.2, 0.6);
        break;
      }
      case 'pole': {
        // cột đèn thép rỗng: "BOONG" ngân dài cao độ cao, đèn trên đỉnh rung lách cách
        this.burst(out, t, { filter: 'bandpass', freq: 860 + R() * 160, Q: 14, drive: 2, gain: 0.9 * k + 0.12, attack: 0.0005, dur: 1.3 });
        this.burst(out, t + 0.002, { filter: 'bandpass', freq: 2300 + R() * 300, Q: 10, gain: 0.35 * k + 0.05, attack: 0.0005, dur: 0.7 });
        ticks(3, 4000, 7000, 0.15, 0.4);
        break;
      }
      case 'wood': case 'tree': {
        // thân gỗ: "CỘC" + nứt toác, cành lá xào xạc
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 3, drive: 2, gain: 1.0 * k, attack: 0.0006, dur: 0.09 });
        crackle(1400, 0.7, 1.2, 0.45);
        if (o.mat === 'tree') this.burst(out, t + 0.05, { filter: 'highpass', freq: 2600, gain: 0.35 * k, attack: 0.08, dur: 0.9 });
        break;
      }
      default: {
        // đá tảng: "cộp" đá + vụn đá
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 480, drive: 2, gain: 0.9 * k, attack: 0.001, dur: 0.2 });
        ticks(6, 2800, 6500, 0.22, 0.35);
      }
    }
    // (4) đồ đạc trong khoang xô lệch (xe người chơi)
    if (o.self) for (let i = 0; i < 2 + Math.round(3 * k); i++) this.playCaseHit(out, t + 0.05 + R() * 0.3, 'debrisMetal', 1.1 + R() * 0.7, 0.07 + 0.06 * k);
  }

  /**
   * Cạ nghiến khi thân xe tì trượt dọc vật cản / xe khác (gọi liên tục mỗi khung lúc trượt, tự giãn nhịp ~0,12 s, mỗi nhịp
   * một đoạn ngắn đè lên nhau thành tiếng liên tục). o = { vt: tốc độ trượt (đv/s), mA, mat, self, key }
   */
  scrapeAt(pos, o) {
    if (!this.ready() || !pos) return;
    const g = window.game;
    const lx = g && g.player ? g.player.x : pos.x, lz = g && g.player ? g.player.z : pos.z;
    const d = o.self ? 0 : Math.hypot(pos.x - lx, pos.z - lz);
    if (d > 900) return;
    const now = this.ctx.currentTime;
    this._scrT = this._scrT || new Map();
    const last = this._scrT.get(o.key);
    if (last !== undefined && now - last < 0.12) return;
    this._scrT.set(o.key, now);
    if (this._scrT.size > 64) for (const [k, v] of this._scrT) if (now - v > 2) this._scrT.delete(k);
    const k = Math.max(0.1, Math.min(1, o.vt / 70)) * (0.6 + 0.4 * Math.min(1, (o.mA || 40) / 60));
    const sp = this.spatial(d, pos), t = now + sp.delay, R = Math.random;
    const out = this.voice({ gain: sp.gain * (o.self ? 0.75 : 0.6) * k, lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    const metal = o.mat === 'vehicle' || o.mat === 'wreck' || o.mat === 'metal' || o.mat === 'pole' || o.mat === 'car';
    if (metal) {
      // thép miết thép: rít the thé dao động + lớp nghiến trầm
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700 + R() * 900, freqEnd: 1300 + R() * 900, sweep: 0.2, Q: 9, drive: 2, gain: 0.5, attack: 0.03, dur: 0.24 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 2, gain: 0.5, attack: 0.03, dur: 0.24 });
    } else {
      // giáp cà tường bê tông / gạch / đá: rè rè sạn + vụn rơi
      this.burst(out, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 900 + o.vt * 6, Q: 0.9, gain: 0.8, attack: 0.03, dur: 0.24 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: 0.45, attack: 0.03, dur: 0.24 });
    }
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
    // Nhà theo vật liệu tường (game.js truyền opts.mat qua playExplosionAtDistance): bê tông / đá -> tiếng bê tông "chát";
    // nhà gỗ -> tiếng gỗ "cộc / rắc"; kho tôn -> tấm tôn rung "boong" + lạch cạch; gạch mộc giữ tiếng nhà gạch vữa đục
    if (hitType === 'BUILDING' && this._hitMat) {
      const m = this._hitMat;
      if (m === 'concrete' || m === 'stone') hitType = 'WALL';
      else if (m === 'wood') hitType = 'TREE';
      else if (m === 'metal') {
        this.burst(out, t, { filter: 'bandpass', freq: bullet ? 1500 : 700, Q: 8, drive: 2, gain: (bullet ? 0.7 : 1.1) * k, attack: 0.0004, dur: bullet ? 0.25 : 0.7 });
        this.burst(out, t + 0.003, { filter: 'bandpass', freq: bullet ? 3100 : 2200, Q: 5, gain: (bullet ? 0.35 : 0.5) * k, attack: 0.0004, dur: bullet ? 0.15 : 0.4 });
        stones(t + 0.02, bullet ? 2 : 6, 2500, 6000, (bullet ? 0.1 : 0.2) * k, bullet ? 0.2 : 0.6);
        return;
      }
    }
    switch (hitType) {
      case 'DIRECT_HIT': {
        if (cls === 'heat') {
          // đầu đạn lõm kích nổ trên vỏ thép: "CHÍT" cực gắt của luồng kim loại đập vào giáp + thân xe "boong". Tiếng mảnh
          // giáp vụn phun "xèèè" vào khoang chỉ có khi luồng phụt xuyên được (playArmorOutcome)
          this.burst(out, t, { filter: 'bandpass', freq: 3600, Q: 1.2, drive: 4, gain: 1.4 * k, attack: 0.0003, dur: 0.025 });
          this.playCaseHit(out, t, 'hullBlast', 1.1 + R() * 0.2, 0.5 * k);
        } else if (big) {
          // đạn nổ trên vỏ thép: thép cộng hưởng chát chúa + tiếng xé kim loại + thân xe "BOONG" trầm
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 1.2, drive: 3, gain: 0.9 * k, attack: 0.001, dur: 0.18 });
          this.burst(out, t, { filter: 'bandpass', freq: 2400, freqEnd: 900, Q: 0.9, drive: 2, gain: 0.4 * k, attack: 0.001, dur: 0.25 });
          this.playCaseHit(out, t + 0.002, 'hullBlast', 0.9 + R() * 0.2, 0.6 * k);
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
        // ĐẤT theo loại mặt đất chỗ trúng (groundMatAt): đạn nhỏ mỗi loại một tiếng — đạn lớn có lớp đất đá rơi riêng
        const gm = bullet ? this._gMat : null;
        if (gm === 'sand') {
          // cát khô hút đạn: "phụt" nghẹt, trầm, không có tiếng vụn lạo xạo — chỉ tiếng cát rơi rào rào mảnh
          this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 1.5, gain: 0.5, attack: 0.001, dur: 0.06 });
          this.burst(out, t + 0.06, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, Q: 0.6, gain: 0.12, attack: 0.08, dur: 0.45 });
        } else if (gm === 'mud') {
          // bùn ướt: "chạch" ướt dải trung + bùn rơi lộp độp
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 750, freqEnd: 420, sweep: 0.05, Q: 1.6, drive: 2, gain: 0.55, attack: 0.001, dur: 0.07 });
          for (let i = 0; i < 3; i++) this.burst(out, t + 0.12 + R() * 0.35, { buffer: this.brownNoiseBuffer, filter: 'bandpass', freq: 500 + R() * 300, Q: 3, gain: 0.12, attack: 0.002, dur: 0.04 });
        } else if (gm === 'rock' || gm === 'hard') {
          // sườn đá: "chát" đanh, đá vụn lách cách, đạn hay nảy rít
          this.burst(out, t, { filter: 'bandpass', freq: 2800, Q: 1.2, drive: 3, gain: 0.45, attack: 0.0003, dur: 0.03 });
          stones(t + 0.01, 3, 2000, 5500, 0.12, 0.25);
          if (R() < (cls === 'b127' ? 0.4 : 0.15)) this.playRicochet(out, t + 0.005);
        } else if (gm === 'asphalt') {
          // mặt nhựa đường: "cạch" khô, vụn nhựa đá dăm tung lách tách
          this.burst(out, t, { filter: 'bandpass', freq: 2100, Q: 1, drive: 2, gain: 0.35, attack: 0.0004, dur: 0.035 });
          this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3200, Q: 0.7, gain: 0.45, attack: 0.004, dur: 0.18 });
          if (cls === 'b127' && R() < 0.25) this.playRicochet(out, t + 0.005);
        } else if (bullet) {
          // đất thường: "phập" + đất vụn rơi lạo xạo
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

  // Tiếng đạn nảy rít vút đi: đầu đạn méo xoay lộn -> tiếng xé gió dải hẹp tụt tần (Doppler khi bay xa), hơi rung.
  // size: 0 đạn súng (rít cao, ngắn) .. 1 đầu đạn pháo / mũi tên xuyên giáp (rít trầm, dày, kéo dài hơn, to hơn)
  playRicochet(dest, t, size = 0) {
    const f = (2400 + Math.random() * 1600) * (1 - 0.6 * size);
    const d = (0.25 + Math.random() * 0.2) * (1 + 1.2 * size);
    this.burst(dest, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, freqEnd: f * 0.42, sweep: d, Q: 14 - 6 * size, gain: 0.5 + 0.5 * size, attack: 0.003, dur: d });
    this.tone(dest, t, { freq: f, freqEnd: f * 0.4, sweep: d, gain: 0.035 * (1 + size), attack: 0.004, dur: d, vibrato: (30 + Math.random() * 20) * (1 - 0.5 * size), vibratoDepth: f * 0.03 });
  }

  /**
   * Đạn SƯỢT trên giáp (nảy khỏi tấm nghiêng / bị khiên chữ V làm chệch). cls: 'small' 12.7 | 'cannon' 30mm / lựu 40 |
   * 'kinetic' mũi tên xuyên giáp | 'blast' đạn nổ phá | 'heat' đầu nổ lõm.
   *  (1) cú gõ xiên lên thép "KENG": đanh, cao độ theo cỡ đạn (tấm thép bị gõ lệch tâm nên ngân hơn cú va thẳng)
   *  (2) đầu đạn cày dọc mặt thép "xoẹt" (tróc sơn) — dải nhiễu hẹp tụt tần trong vài chục ms
   *  (3) đạn súng / 30mm / mũi tên bật đi rít vút (Doppler); đạn nổ / đầu nổ lõm thì không — nó nổ lệch ra ngoài
   *      (game.js phát tiếng nổ không có lớp "BOONG" thân xe)
   */
  playArmorGlance(distance, pos = null, cls = 'kinetic') {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const small = cls === 'small' || cls === 'cannon';
    if (small) { if (now - (this._lastGlance || 0) < 0.05) return; this._lastGlance = now; }
    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = now + sp.delay;
    const big = cls === 'kinetic' || cls === 'blast' || cls === 'heat';
    const out = this.voice({ gain: sp.gain * (cls === 'small' ? 0.55 : cls === 'cannon' ? 0.5 : 0.75), lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    const f0 = (cls === 'small' ? 1900 : cls === 'cannon' ? 1350 : cls === 'kinetic' ? 820 : 620) * (0.88 + Math.random() * 0.24);
    this.burst(out, t, { filter: 'bandpass', freq: f0 * 2.2, Q: 1.1, drive: 3, gain: big ? 0.9 : 0.6, attack: 0.0003, dur: 0.012 });
    this.metal(out, t + 0.001, { f0, ratios: [1, 2.41, 4.07, 6.3], decay: big ? 0.35 : 0.18, gain: big ? 0.45 : 0.3, click: 0.7 });
    if (big) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2.5, gain: cls === 'kinetic' ? 1.1 : 0.7, attack: 0.001, dur: 0.12 });
    const sd = big ? 0.12 : 0.06;
    this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: big ? 2600 : 4200, freqEnd: big ? 1100 : 2200, sweep: sd, Q: 3, drive: 1.5, gain: big ? 0.55 : 0.35, attack: 0.002, dur: sd + 0.02 });
    if (!(cls === 'blast' || cls === 'heat')) this.playRicochet(out, t + 0.012, cls === 'kinetic' ? 1 : cls === 'cannon' ? 0.4 : 0);
  }

  /**
   * Lớp âm thanh SAU KHI tính giáp (VehicleDamage.onDirectHit) cho phát trúng thẳng xe — tiếng va chạm ban đầu đã phát
   * trước đó (playExplosionAtDistance / playKineticImpact / playGatlingImpact). o = { cls, pen, dud, vsHeat }:
   *  - mũi tên xuyên giáp XUYÊN: thép bị xé rít tụt tần + mảnh giáp vụn văng lách cách trong khoang; KHÔNG xuyên: khối
   *    thép dày rung "ừm" trầm tắt nhanh, vảy sơn / thép tróc lả tả bên ngoài
   *  - đầu nổ lõm XUYÊN: mảnh giáp vụn phun "xèèè" vào khoang; bị chặn (giáp dày, khiên cách quãng, gạch nổ): luồng
   *    phụt tóe ra ngoài mặt giáp "xoẹt" ngắn, không có tiếng phun vào trong
   *  - đạn nổ phá XUYÊN vỏ mỏng: tấm thép mỏng toạc "RẮC" + mảnh lọt vào trong
   *  - đầu nổ bị lồng thép bóp méo (dud): tiếng lồng riêng đã phát (sfx 'slat') — không thêm
   */
  playArmorOutcome(distance, pos = null, o = {}) {
    if (!this.ready() || !o || o.dud) return;
    const cls = o.cls;
    if (cls !== 'kinetic' && cls !== 'heat' && cls !== 'blast') return;
    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay + 0.004;
    const out = this.voice({ gain: sp.gain * 0.4, lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    if (cls === 'kinetic') {
      if (o.pen) {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 700, sweep: 0.14, Q: 2.5, drive: 3, gain: 0.5, attack: 0.002, dur: 0.18 });
        this.burst(out, t + 0.026, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3800, Q: 0.9, gain: 0.5, attack: 0.01, dur: 0.35 });
        // lõi urani nghèo: mảnh urani bốc cháy văng khắp khoang — "phừng" ngắn + xèo lách tách
        if (o.du) {
          this.burst(out, t + 0.03, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 600, gain: 0.45, attack: 0.02, dur: 0.3 });
          this.burst(out, t + 0.05, { buffer: this.crackleBuffer, filter: 'highpass', freq: 2200, gain: 0.4, attack: 0.04, dur: 0.8 });
        }
      } else {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 210, drive: 2, gain: 0.6, attack: 0.002, dur: 0.22 });
        this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.18, attack: 0.005, dur: 0.18 });
      }
    } else if (cls === 'heat') {
      if (o.pen && !o.vsHeat) {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 4200, freqEnd: 1400, sweep: 0.3, Q: 1.5, drive: 2, gain: 1.4, attack: 0.003, dur: 0.35 });
        this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3400, Q: 0.9, gain: 0.45, attack: 0.01, dur: 0.4 });
      } else {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3200, freqEnd: 2000, sweep: 0.08, Q: 1.2, gain: 0.6, attack: 0.002, dur: 0.1 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 2, gain: 0.5, attack: 0.002, dur: 0.18 });
      }
    } else if (o.pen && o.thin) {
      this.burst(out, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1500, Q: 0.9, drive: 2, gain: 0.8, attack: 0.002, dur: 0.12 });
      this.playCaseHit(out, t, 'sheetMetal', 0.9 + Math.random() * 0.25, 0.35);
    }
  }

  /**
   * Xe của mình trúng đạn — nghe từ trong khoang: thép thân xe truyền âm trực tiếp vào tai kíp lái.
   * Đạn nhỏ: tiếng "tạch / keng" khô như mưa đá đập mái tôn; đạn lớn: "BOONG" thép dày ngân trầm, rồi ù tai.
   */
  // o (kết quả tính giáp, game.js armorHitSound): { pen: xuyên vào khoang, ric: đạn sượt / bị khiên làm chệch, dud: đầu nổ
  // bị lồng thép bóp méo }. Không có o: như phát trúng không xuyên
  playHullHit(ammoType = 'NORMAL', o = null) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const small = ammoType === 'GATLING_BULLET' || ammoType === 'INCENDIARY' || ammoType === 'SCOUT_BULLET';
    const ric = !!(o && o.ric), pen = !!(o && o.pen);
    if (small && ric) {
      // đạn nhỏ sượt trên vỏ: "kéng" mảnh cao + vệt cào ngắn, không có cú búa đập thẳng
      if (t - (this._lastHullTick || 0) < 0.035) return;
      this._lastHullTick = t;
      const out = this.voice({ gain: 0.3, wet: 0.02 });
      this.metal(out, t, { f0: 1500 + Math.random() * 600, ratios: [1, 2.41, 4.07], decay: 0.12, gain: 0.25, click: 0.8 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3800, freqEnd: 2200, sweep: 0.05, Q: 3, gain: 0.3, attack: 0.001, dur: 0.06 });
      return;
    }
    if (small) {
      if (t - (this._lastHullTick || 0) < 0.035) return;
      this._lastHullTick = t;
      const mg = ammoType === 'SCOUT_BULLET';
      const out = this.voice({ gain: mg ? 0.5 : 0.35, wet: 0.02 });
      const f0 = (mg ? 700 : 480) * (0.8 + Math.random() * 0.45);
      this.burst(out, t, { filter: 'bandpass', freq: f0 * 3, Q: 1.2, drive: 3, gain: mg ? 0.5 : 0.6, attack: 0.0003, dur: 0.018 });
      this.playCaseHit(out, t, 'hullTick', f0 / 560, mg ? 0.4 : 0.5);
      if (!mg) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2, gain: 0.7, attack: 0.001, dur: 0.12 });   // đầu đạn 30mm nổ ngoài vỏ
      else {
        // Đạn 12.7mm không xuyên nhưng đập vào vỏ xe như búa tạ: kíp xe nghe "BẢNG!" gắt ngay sát tai (mặt trong tấm giáp
        // phát thẳng vào khoang) + cả thân xe "thụp", chứ không phải tiếng "tách" lách tách như mưa đá
        this.snap(out, t, 0.7, 6000, 4);
        this.playCaseHit(out, t, 'hitSteel127', 0.82 + Math.random() * 0.16, 0.85, 7000);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 280, drive: 2.5, gain: 1.0, attack: 0.001, dur: 0.09 });
        // sơn / vảy thép mặt trong tróc ra rào rào, đồ đạc trong khoang rung lách cách
        if (Math.random() < 0.35) this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3200, Q: 0.8, gain: 0.2, attack: 0.006, dur: 0.22 });
        if (Math.random() < 0.2) this.playCaseHit(out, t + 0.04 + Math.random() * 0.12, 'debrisMetal', 1.3 + Math.random() * 0.6, 0.08);
      }
      return;
    }
    // mức đưa vào thấp có chủ đích để giữ cú "BOONG" gắt (không bị tầng cuối ép bẹt)
    const out = this.voice({ gain: 0.32, wet: 0.04 });
    const heavy = ammoType === 'HE' || ammoType === 'CLUSTER' || ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE' || !!(o && o.heavy);
    if (ric) {
      // đạn lớn SƯỢT trên giáp / bị khiên chữ V làm chệch: "KENG" thép ngân gắt sát tai + đầu đạn cày dọc vỏ "xoẹt";
      // không có cú búa tạ đập thẳng làm cả khoang rung. Đạn nổ sượt nổ ngay ngoài vỏ: thêm sóng nổ đục truyền qua thép
      this.snap(out, t, 0.9, 6000, 4);
      this.metal(out, t, { f0: 520 + Math.random() * 200, ratios: [1, 2.41, 4.07, 6.3], decay: 0.4, gain: 0.9, click: 0.9 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600, freqEnd: 1000, sweep: 0.12, Q: 2.5, drive: 2, gain: 0.9, attack: 0.002, dur: 0.15 });
      if (heavy || ammoType === 'NORMAL') this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 1.2, attack: 0.002, dur: 0.25 });
      this.shellShock(heavy || ammoType === 'NORMAL' ? 0.45 : 0.3);
      return;
    }
    const f0 = 82 + Math.random() * 40;
    // va đập: xung gắt + khối thép dày ngân (mode bất hòa thấp, tắt chậm)
    this.snap(out, t, 1.4, 4500, 5);
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2.5, gain: 2.0, attack: 0.001, dur: heavy ? 0.45 : 0.3 });
    // Giáp dày hàng chục mm, bắt chặt vào khung và đầy thiết bị bên trong: rung tắt rất nhanh, nghe "BỊCH / THỤP" nặng
    // chứ không ngân như chuông (trước đây sóng sin trượt + dải nhiễu hẹp có cao độ -> nghe như gõ chuông / trống điện tử)
    this.playCaseHit(out, t, 'hullBlast', f0 / 100, 2.8);
    // Không xuyên: mặt trong tấm giáp vẫn "KOONG" thép một nhịp ngắn — nghe qua lớp lót chống mảnh & tai nghe kíp xe nên
    // đục, trầm (lọc thấp), tắt trong ~0,2 s chứ không ngân như chuông
    if (!pen) {
      const cl = this.voice({ gain: 0.24, wet: 0.03, lowpass: heavy ? 1300 : 1700 });
      this.metal(cl, t + 0.002, { f0: (heavy ? 210 : 260) + Math.random() * 80, ratios: [1, 1.93, 2.87, 4.1], decay: heavy ? 0.5 : 0.38, gain: 0.85, click: 0.5 });
    }
    // mảnh vỡ & sơn tróc lả tả bên trong khoang, đồ đạc trong xe xô lệch lách cách
    this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.8, gain: pen ? 0.55 : 0.3, attack: 0.01, dur: pen ? 0.6 : 0.35 });
    for (let i = 0; i < (pen ? 5 : 2); i++) this.playCaseHit(out, t + 0.12 + Math.random() * 0.5, 'debrisMetal', 1.2 + Math.random() * 0.8, 0.1);
    if (pen) {
      // XUYÊN vào khoang: mảnh giáp vụn / luồng kim loại phun qua khoang "xèèè" rít chói, khí nóng ù ù
      this.burst(out, t + 0.006, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 4400, freqEnd: 1500, sweep: 0.3, Q: 1.4, drive: 2, gain: 1.1, attack: 0.002, dur: 0.38 });
      this.burst(out, t + 0.02, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, gain: 0.7, attack: 0.02, dur: 0.5 });
      // tiếng "RẮC" gắt của tấm giáp bị xé thủng (cao hơn cú đập), rồi mảnh vụn nảy lanh canh khắp vách khoang trong ~0,5 s
      this.snap(out, t + 0.003, 1.1, 9000, 6);
      for (let i = 0; i < 4; i++) this.playCaseHit(out, t + 0.03 + Math.random() * 0.45, 'debrisLink', 1.2 + Math.random() * 0.9, 0.09);
      // mũi tên lõi urani nghèo: mảnh urani bốc cháy văng trong khoang — 'phừng' + xèo lách tách sát tai
      if (o && o.du) this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'highpass', freq: 2000, gain: 0.6, attack: 0.03, dur: 1.0 });
    }
    // không xuyên: giáp dày đỡ trọn — kíp xe vẫn bị chấn động nhưng nhẹ hơn hẳn phát xuyên vào trong. Xuyên: áp suất
    // trong khoang vọt lên -> ù tai nặng, mọi tiếng bị bóp nghẹt ~1,5-2 s kèm tiếng ù cao
    this.shellShock(pen ? (heavy ? 1 : ammoType === 'AP' ? 0.8 : 0.85) : (heavy ? 0.85 : ammoType === 'AP' ? 0.6 : 0.7) * (o ? 0.7 : 1));
  }

  /**
   * Sóng nổ gần quét qua xe mình (không trúng thẳng) — nghe từ trong khoang (ExplosionFX.playerBlastJolt, đúng lúc mặt
   * sóng tới). a 0..1 theo khối nổ & khoảng cách. Áp suất đập vào cả mặt vỏ: "THỤP" trầm đục (không có cú gõ thép gắt
   * như đạn trúng), đồ đạc trong khoang rung lách cách; o.debris: đất đá / mảnh văng rơi lộp độp trên nóc vài trăm ms sau
   */
  playHullBlast(a = 0.5, o = null) {
    if (!this.ready()) return;
    a = Math.max(0, Math.min(1, a));
    if (a < 0.08) return;
    const t = this.ctx.currentTime;
    if (t - (this._lastHullBlast || 0) < 0.12) return;   // loạt bom con / nhiều quả cùng lúc: một cú là đủ
    this._lastHullBlast = t;
    const out = this.voice({ gain: 0.3 * (0.35 + 0.65 * a), wet: 0.03, lowpass: 2600 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160 + 120 * a, drive: 2, gain: 1.8, attack: 0.004, dur: 0.25 + 0.3 * a });
    this.playCaseHit(out, t + 0.002, 'hullBlast', 0.6 + Math.random() * 0.15, 1.2 * a, 900);
    if (a > 0.3) this.burst(out, t + 0.03, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.25 * a, attack: 0.01, dur: 0.3 });
    if (o && o.debris) {
      // đất cục, đá vụn, mảnh vỏ đạn rơi xuống nóc: lộp độp thưa rồi dày, tắt dần (bay lên rồi rơi ~0,3-1,5 s)
      const n = 3 + Math.round(8 * a);
      for (let i = 0; i < n; i++) {
        const dt = 0.25 + Math.pow(Math.random(), 0.7) * 1.2;
        this.playCaseHit(out, t + dt, Math.random() < 0.25 ? 'debrisMetal' : 'hullTick', 0.9 + Math.random() * 0.8, (0.06 + 0.1 * a) * (1 - dt / 2), 2400);
      }
      this.burst(out, t + 0.35, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1800, Q: 0.7, gain: 0.18 * a, attack: 0.15, dur: 0.9 });
    }
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
