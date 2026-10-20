/**
 * ÂM THANH THỨ CẤP / PHÁ HỦY: nổ kho đạn, gạch ERA, nhà sập, cây gãy đổ, vật liệu vỡ theo chất liệu.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

// Âm sắc phá hủy theo vật liệu (tiếng nứt vỡ đầu tiên + từng mảnh vụn rơi đập đất + lớp sỏi đổ rào rào).
// Bê tông: nứt đanh, mảnh "cộc" trung-cao; gạch đá: đục hơn; đất / gạch mộc: bở, "bịch" mềm, đất đổ rào;
// gỗ: thớ gãy rắc rắc, mảnh gõ rỗng; tôn thép: oàng rung, mảnh leng keng; đá tảng: nứt "CẮC" cực gắt, khối đá rơi nặng
const BREAK_MAT = {
  concrete: { snap: 0.55, snapLp: 7000, crackF: 2100, crackG: 0.8, crackD: 0.035, bodyF: 750, bodyG: 0.9, bodyD: 0.18, thudF: 380, thudG: 0.7,
    chunkF: [900, 3200], chunkQ: 0.9, chunkG: 0.45, pourF: 1100, pourG: 0.32 },
  masonry: { snap: 0.45, snapLp: 5000, crackF: 1600, crackG: 0.65, crackD: 0.04, bodyF: 600, bodyG: 0.9, bodyD: 0.2, thudF: 330, thudG: 0.75,
    chunkF: [700, 2500], chunkQ: 0.9, chunkG: 0.45, pourF: 900, pourG: 0.34 },
  adobe: { snap: 0.3, snapLp: 2500, crackF: 1100, crackG: 0.35, crackD: 0.04, bodyF: 420, bodyG: 0.8, bodyD: 0.25, thudF: 260, thudG: 0.9,
    chunkF: [350, 1200], chunkQ: 0.7, chunkG: 0.35, pourF: 650, pourG: 0.5 },
  woodBreak: { thudF: 300, thudG: 0.5, chunkF: [400, 1600], chunkQ: 2, chunkG: 0.4, pourF: 0, pourG: 0 },
  sheetMetal: { thudF: 320, thudG: 0.7, chunkF: [700, 2400], chunkQ: 9, chunkG: 0.4, ring: 900, pourF: 0, pourG: 0 },
  rockSplit: { snap: 0.75, snapLp: 10000, crackF: 3000, crackG: 0.9, crackD: 0.02, bodyF: 520, bodyG: 0.8, bodyD: 0.16, thudF: 280, thudG: 1.0,
    chunkF: [600, 2400], chunkQ: 1.1, chunkG: 0.48, pourF: 1300, pourG: 0.25 }
};
// Tiếng vỡ thường do chính một vụ nổ / phát bắn gây ra -> bị sóng nổ che (xem SoundEngine.blastMask)
const BLAST_MASKABLE = { concrete: 1, masonry: 1, adobe: 1, woodBreak: 1, sheetMetal: 1, rockSplit: 1, leafStrip: 1, treeFall: 1, collapse: 1, glass: 1 };


SoundEngine.mixin(class {
  // ===========================================================================
  // ÂM THANH THỨ CẤP: nổ kho đạn, gạch ERA, xăng bùng cháy, nổ lốp, vỡ kính, giáp bong, xích đứt,
  // bê tông vỡ, nhà sập, cây gãy đổ, lửa cháy lách tách, tháp pháo rơi đập đất
  // ===========================================================================
  // Tự tính khoảng cách tới người nghe (xe người chơi trong game / camera ở phòng thử)
  secondaryAt(kind, pos, scale = 1, opts = null) {
    if (!this.ready() || !pos) return;
    let lx = 0, lz = 0;
    const g = window.game, lab = window.__fxLab;
    if (g && g.player) { lx = g.player.x; lz = g.player.z; }
    else if (lab && lab.camera) { lx = lab.camera.position.x; lz = lab.camera.position.z; }
    const d = Math.hypot(pos.x - lx, pos.z - lz);
    if (d > 2600) return;
    // Giới hạn tần suất để không dồn dập khi nhiều sự kiện cùng lúc
    const now = this.ctx.currentTime;
    this._secLast = this._secLast || {};
    const gap = kind === 'flare' ? 0.5 : kind === 'cookoffSmall' ? 0.025 : kind === 'metalCrush' ? 0.35 : kind === 'armorPlate' ? 0.25 : (kind === 'debrisLand' || kind === 'snap') ? 0.07 : kind === 'debrisHit' ? 0.02 : kind === 'debrisScrape' ? 0.06 : kind === 'debris' ? 0.3 : BREAK_MAT[kind] || kind === 'glass' || kind === 'leafStrip' ? 0.12 : 0.15;
    // Cây đổ: một quả nổ quật đổ cả cụm cây cùng lúc, mỗi cây chạm đất một thời điểm riêng -> cho tối đa 3 cây / 0.3 s
    if (kind === 'treeFall') {
      this._treeT = (this._treeT || []).filter(x => now - x < 0.3);
      if (this._treeT.length >= 3) return;
      this._treeT.push(now);
    } else {
      if (this._secLast[kind] && now - this._secLast[kind] < gap) return;
      this._secLast[kind] = now;
    }
    // Tiếng vỡ do chính vụ nổ gây ra được gọi TRƯỚC tiếng nổ (game.js phá cảnh vật rồi mới phát nổ): nếu phát ngay,
    // tiếng nứt "tách" đến trước và tai coi nó là âm chính -> lấn cú nổ. Chờ hết lượt xử lý hiện tại để biết có
    // sóng nổ / phát bắn nào vừa xảy ra không rồi mới phát (lệch < 1 khung hình)
    if (BLAST_MASKABLE[kind] && typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        const m = this.blastMask(d);
        this.playSecondary(kind, d, pos, scale, m ? Object.assign({}, opts, { mask: m }) : opts);
      });
      return;
    }
    this.playSecondary(kind, d, pos, scale, opts);
  }

  // Ghi lại sóng nổ / phát bắn vừa xảy ra (mức tới tai người nghe) để che tiếng vỡ đi kèm
  noteBlast(distance, strength = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._blasts = (this._blasts || []).filter(b => now - b.t < 0.5);
    this._blasts.push({ t: now, g: this.spatial(distance).gain * strength });
  }

  // Độ che 0..1 của sóng nổ gần nhất lên một tiếng vỡ ở khoảng cách d: chỉ khi tiếng nổ tới tai không nhỏ hơn hẳn
  // (gần bằng hoặc gần hơn nguồn vỡ) và vừa xảy ra trong 0,4 s
  blastMask(distance) {
    if (!this._blasts || !this._blasts.length) return 0;
    const now = this.ctx.currentTime, g = this.spatial(distance).gain;
    let m = 0;
    for (const b of this._blasts) {
      const age = now - b.t, r = b.g / g;
      if (age > 0.4 || r < 0.6) continue;
      m = Math.max(m, Math.min(1, r) * (1 - age / 0.4));
    }
    return m > 0.05 ? m : 0;
  }

  // Mảnh vụn vỡ ra đổ xuống: phần lớn vụn đổ NGAY khi mảng tường vỡ (rào rào liền mạch 0,1-0,5 s, không có khoảng lặng),
  // chỉ vài mảnh bị hất cao rơi muộn tới ~√(2h/g) (h: độ cao điểm vỡ, đơn vị game). Mỗi cú va là một tiếng "cạch" ngắn dải
  // rộng (Q thấp — lọc cộng hưởng hẹp nghe thành "cốc cốc" gõ mõ có cao độ) + "bịch" trầm cho mảnh to; nền vụn / sỏi / đất đổ
  debrisRain(out, t, mat, k, { n = 6, h = 16, spread = 0.25, pour = 1 } = {}) {
    const P = BREAK_MAT[mat] || BREAK_MAT.concrete;
    const tf = Math.sqrt(2 * Math.max(0.3, h / 8) / 9.8);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const ti = t + 0.02 + (tf + spread) * Math.pow(u, 1.8) + i * 0.006;
      const big = (0.35 + 0.65 * Math.pow(1 - i / n, 1.3)) * (0.7 + 0.5 * Math.random()) * (1 - 0.5 * u);
      const f = P.chunkF[0] * Math.pow(P.chunkF[1] / P.chunkF[0], Math.random());
      this.burst(out, ti, { filter: 'bandpass', freq: f, Q: P.chunkQ, gain: P.chunkG * k * (0.35 + big), attack: 0.0004, dur: 0.008 + 0.014 * big });
      if (big > 0.6) this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: P.thudF, drive: 1.4, gain: P.thudG * k * big * 0.8, attack: 0.0015, dur: 0.05 + 0.06 * big });
      if (P.ring && Math.random() < 0.4) this.playCaseHit(out, ti, 'debrisMetal', 0.7 + Math.random() * 0.8, 0.12 * k * (0.5 + big));
    }
    if (pour > 0 && P.pourG) {
      // vụn vỡ đổ rào rào liền ngay sau tiếng vỡ, tắt dần theo thời gian rơi
      this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: P.pourF, Q: 0.5, filter2: 'lowpass', freq2: P.pourF * 2.4, gain: P.pourG * k * pour * 1.3, attack: 0.025, dur: 0.3 + 0.35 * tf + 0.3 * pour });
      this.burst(out, t + 0.01, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: P.thudF * 1.3, gain: P.thudG * 0.5 * k * pour, attack: 0.02, dur: 0.25 + 0.2 * pour });
    }
  }

  // Tiếng vật liệu gãy vỡ (bước đầu tiên khi một mảng tường / khối đá / cấu kiện bị phá): mỗi vật liệu một kiểu
  breakCrack(out, t, mat, k) {
    const P = BREAK_MAT[mat] || BREAK_MAT.concrete;
    if (mat === 'woodBreak') {
      // thớ gỗ đứt dần "rắc-rắc-RẮC": chuỗi tiếng nứt khô dồn dập + thân gỗ cộng hưởng "cộc" rỗng
      let ti = t;
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        this.burst(out, ti, { filter: 'bandpass', freq: 900 + Math.random() * 1300, Q: 0.9, drive: 1.5, gain: (last ? 0.7 : 0.3 + Math.random() * 0.25) * k, attack: 0.0004, dur: last ? 0.05 : 0.018 + Math.random() * 0.02 });
        if (last || Math.random() < 0.5) this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 180 + Math.random() * 220, Q: 3.5, drive: 1.4, gain: (last ? 1.5 : 0.6) * k, attack: 0.001, dur: last ? 0.16 : 0.08 });
        if (last) this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 1.6, gain: 0.8 * k, attack: 0.002, dur: 0.14 });
        ti += 0.012 + Math.random() * 0.05;
      }
      return ti - t;
    }
    if (mat === 'sheetMetal') {
      // tôn / khung thép: tấm thép oằn "oàng" trầm rung rinh + xé rít + đinh tán bật
      this.playCaseHit(out, t, 'sheetMetal', 0.85 + Math.random() * 0.3, 0.75 * k);
      this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2300, freqEnd: 1100, sweep: 0.25, Q: 6, gain: 0.35 * k, attack: 0.01, dur: 0.3 });
      for (let i = 0; i < 3; i++) this.burst(out, t + 0.02 + Math.random() * 0.15, { filter: 'highpass', freq: 3000, gain: 0.25 * k, attack: 0.0004, dur: 0.01 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 1.3 * k, attack: 0.002, dur: 0.25 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 0.8, drive: 1.5, gain: 0.7 * k, attack: 0.001, dur: 0.12 });
      return 0.05;
    }
    // vật liệu giòn (bê tông / gạch đá / đất / đá tảng): tiếng nứt toác đanh + khối vỡ "rầm" + tiếng vỡ vụn trung tần
    this.snap(out, t, P.snap * k, P.snapLp, 3);
    this.burst(out, t, { filter: 'bandpass', freq: P.crackF, Q: 0.8, drive: 1.8, gain: P.crackG * k, attack: 0.0004, dur: P.crackD });
    this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: P.bodyF, Q: 0.7, drive: 1.6, gain: P.bodyG * k, attack: 0.002, dur: P.bodyD });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: P.thudF, drive: 2, gain: P.thudG * 1.3 * k, attack: 0.003, dur: P.bodyD * 1.4 });
    return 0.03;
  }

  playSecondary(kind, distance = 0, pos = null, k = 1, opts = null) {
    if (!this.ready()) return;
    const sp = this.spatial(distance, pos);
    // Bị sóng nổ che (opts.mask 0..1, xem blastMask): kết cấu vỡ SAU khi sóng xung kích tới (~20-50 ms) -> tiếng nổ
    // giữ được cú mở đầu, tiếng nứt vỡ chìm dưới sóng nổ rồi mới nổi lên ở đoạn mảnh vụn rơi
    const mask = (opts && opts.mask) || 0;
    const t = this.ctx.currentTime + sp.delay + (mask ? 0.02 + 0.03 * mask : 0);
    // Thứ bậc độ to như ngoài đời (cùng khoảng cách): nổ đạn pháo > kho đạn / gạch ERA > nhà sập > tháp rơi, thép oằn
    // > nổ lốp > xích đứt > mảnh rơi. Thiếu bậc này thì nổ lốp to ngang đạn 155 và tiếng nổ chính mất uy lực
    const LEVEL = {
      cookoff: 0.25, cookoffSmall: 0.3, era: 0.3, fuel: 0.2, flare: 0.22, collapse: 0.11, turretLand: 0.08, metalCrush: 0.25,
      tire: 0.2, trackSnap: 0.35, concrete: 0.3, treeFall: 0.25, armorPlate: 0.35, snap: 0.5, debris: 0.45, debrisLand: 0.45, debrisHit: 0.42, debrisScrape: 0.3,
      masonry: 0.3, adobe: 0.3, woodBreak: 0.32, sheetMetal: 0.26, rockSplit: 0.25, leafStrip: 0.35, slabImpact: 0.14, splashBig: 0.12
    };
    const out = this.voice({ gain: sp.gain * (LEVEL[kind] || 1), lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.08), pan: sp.pan });
    if (mask) {
      // nửa giây đầu bị dìm (tối đa -12 dB), mảnh vụn rơi phía sau trở lại mức thường
      const g0 = out.gain.value;
      out.gain.setValueAtTime(g0 * (1 - 0.75 * mask), this.ctx.currentTime);
      out.gain.setValueAtTime(g0 * (1 - 0.75 * mask), t + 0.05);
      out.gain.linearRampToValueAtTime(g0, t + 0.5);
    }
    const near = Math.max(0, 1 - distance / 900);
    switch (kind) {
      case 'cookoff': {
        // Đạn pháo trong kho bắt lửa: từng viên / liều phóng bùng nổ "ĐÙNG" (mẫu vật lý, cỡ ngẫu nhiên: liều phóng
        // cháy bùng thì trầm & dài, đầu đạn kích nổ thì đanh), mảnh văng rít, lửa phụt "phừng" sau mỗi tiếng nổ
        const n = 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const ti = t + i * (0.05 + Math.random() * 0.2);
          const kk = (0.6 + Math.random() * 0.6) * k;
          const src = this.ctx.createBufferSource();
          src.buffer = this.gunshotBuffer(Math.random() < 0.35 ? 'blast120' : 'blastRPG');
          src.playbackRate.value = 0.75 + Math.random() * 0.45;
          const g = this.ctx.createGain();
          g.gain.value = 4.2 * kk;
          src.connect(g); g.connect(out);
          src.start(ti);
          this.burst(out, ti + 0.01, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 1.5, gain: 0.7 * kk, attack: 0.003, dur: 0.45 });
          if (Math.random() < 0.5) this.burst(out, ti + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400 + Math.random() * 1200, freqEnd: 900, sweep: 0.5, Q: 4, gain: 0.25 * kk, attack: 0.01, dur: 0.5 });
        }
        this.sustainNoise(out, t + 0.03, { buffer: this.pinkNoiseBuffer, freq: 650, Q: 0.5, drive: 1.3, gain: 0.9 * k, attack: 0.06, hold: 0.25 + Math.random() * 0.3, release: 0.7, flicker: 0.4 });
        break;
      }
      case 'cookoffSmall': {
        // Đạn nhỏ (30mm / 12.7mm) trong thùng đạn bị lửa nung nổ: "bụp / tạch" ngắn (xung nổ vật lý nhỏ, mỗi phát một
        // cỡ), thỉnh thoảng đầu đạn văng rít
        const kk = k * (0.7 + Math.random() * 0.6);
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer('blast30');
        src.playbackRate.value = 0.7 + Math.random() * 0.6;
        const g = this.ctx.createGain();
        g.gain.value = 3.0 * kk;
        src.connect(g); g.connect(out);
        src.start(t);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 600, drive: 1.5, gain: 0.4 * kk, attack: 0.001, dur: 0.1 });
        if (Math.random() < 0.3) this.burst(out, t + 0.02, { filter: 'bandpass', freq: 2600 + Math.random() * 1500, freqEnd: 1200, sweep: 0.25, Q: 3, gain: 0.12 * kk, attack: 0.002, dur: 0.25 });
        break;
      }
      case 'flare': {
        // Lửa bùng "PHỪNG": khối khí nóng / dầu bén lửa cuộn lên — trầm, dày, phồng lên rồi xẹp (không có xung nổ)
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, freqEnd: 700, sweep: 0.3, drive: 1.6, gain: 2.6 * k, attack: 0.09, dur: 0.9 });
        this.sustainNoise(out, t + 0.03, { buffer: this.pinkNoiseBuffer, freq: 480, Q: 0.5, drive: 1.3, gain: 1.6 * k, attack: 0.18, hold: 0.35 + Math.random() * 0.3, release: 0.9, flicker: 0.45 });
        this.burst(out, t + 0.08, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1200, gain: 0.6 * k, attack: 0.1, dur: 0.8 });
        break;
      }
      case 'era': {
        // Gạch giáp phản ứng nổ: tiếng nổ chát đanh, ngắn, kèm tiếng thép văng
        this.snap(out, t, 1.4 * k, 7000, 7);
        this.burst(out, t, { filter: 'bandpass', freq: 2600, Q: 0.8, drive: 5, gain: 0.9 * k, attack: 0.0004, dur: 0.06 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, drive: 5, gain: 1.4 * k, attack: 0.002, dur: 0.7 });
        this.playCaseHit(out, t + 0.002, 'debrisPlateHull', 1.3 + Math.random() * 0.2, 0.45 * k);
        break;
      }
      case 'fuel': {
        // Xăng dầu bắt lửa: "phừng" trầm + lửa gầm cuộn
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, freqEnd: 900, sweep: 0.4, drive: 3, gain: 1.6 * k, attack: 0.06, dur: 1.2 });
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 0.5, gain: 0.7 * k, attack: 0.25, dur: 2.6 });
        this.burst(out, t + 0.2, { buffer: this.crackleBuffer, filter: 'highpass', freq: 1200, gain: 0.8 * k, attack: 0.2, dur: 2.4 });
        break;
      }
      case 'tire': {
        // Nổ lốp / văng bánh: tiếng NỔ chát của khí nén thoát đột ngột + luồng hơi phụt + cao su rách phần phật
        this.snap(out, t, 1.1 * k, 2600, 4);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, freqEnd: 150, sweep: 0.1, drive: 4, gain: 1.1 * k, attack: 0.0008, dur: 0.16 });
        this.burst(out, t + 0.005, { filter: 'highpass', freq: 2200, gain: 0.45 * k, attack: 0.002, dur: 0.5 });
        this.burst(out, t + 0.04, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 900, gain: 0.5 * k, attack: 0.01, dur: 0.3 });
        break;
      }
      case 'tireHiss': {
        // Lốp bị đạn xuyên thủng: không nổ, chỉ xì hơi rít giảm dần
        this.burst(out, t, { filter: 'highpass', freq: 3200, gain: 0.32 * k, attack: 0.01, dur: 1.4 });
        this.burst(out, t, { filter: 'bandpass', freq: 5200, freqEnd: 2600, sweep: 1.2, Q: 2, gain: 0.18 * k, attack: 0.01, dur: 1.3 });
        break;
      }
      case 'glass': {
        // Kính chống đạn nhiều lớp: cú va "cộp" đục của tấm kính dày -> lớp kính dán vỡ vụn lạo xạo (không giòn tan như kính thường)
        // -> mảnh vụn rơi xuống sàn cabin / mặt đất lách tách thưa dần
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 650, drive: 2, gain: 0.45 * k, attack: 0.0008, dur: 0.06 });
        this.burst(out, t, { filter: 'highpass', freq: 3200, drive: 2, gain: 0.4 * k, attack: 0.0004, dur: 0.03 });
        this.burst(out, t + 0.008, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2600, Q: 0.8, gain: 0.9 * k, attack: 0.003, dur: 0.22 });
        this.burst(out, t + 0.02, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 5200, Q: 1.1, gain: 0.45 * k, attack: 0.004, dur: 0.3 });
        for (let i = 0; i < 12; i++) {
          const ti = t + 0.12 + Math.pow(Math.random(), 0.6) * 0.8;
          this.burst(out, ti, { filter: 'bandpass', freq: 3500 + Math.random() * 4500, Q: 8, gain: (0.05 + Math.random() * 0.08) * k, attack: 0.0005, dur: 0.012 + Math.random() * 0.025 });
        }
        break;
      }
      case 'metalCrush': {
        // Thân xe bị ép bẹp / khung gầm gãy sụp: "rầm" đục của khối thép, tấm thép oằn rên trầm, mối hàn bung "tạch",
        // cuối cùng là tiếng thép đổ dồn xuống
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, drive: 3, gain: 1.2 * k, attack: 0.004, dur: 0.45 });
        this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420, freqEnd: 250, sweep: 0.7, Q: 12, drive: 2, gain: 0.9 * k, attack: 0.08, dur: 0.7 });
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 980, freqEnd: 620, sweep: 0.5, Q: 14, gain: 0.4 * k, attack: 0.05, dur: 0.5 });
        for (let i = 0; i < 3; i++) this.burst(out, t + 0.05 + Math.random() * 0.4, { filter: 'highpass', freq: 2800, gain: 0.22 * k, attack: 0.0004, dur: 0.012 });
        this.playCaseHit(out, t, 'hullBlast', 0.75 + Math.random() * 0.15, 0.7 * k);
        this.playCaseHit(out, t + 0.35 + Math.random() * 0.1, 'debrisPlateHull', 0.8 + Math.random() * 0.2, 0.35 * k);
        break;
      }
      case 'armorPlate': {
        // Tấm giáp / váy xích bị xé khỏi thân: thép rít xé, bu-lông đứt "tạch tạch", khối thép nặng "huỵch"
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400, freqEnd: 800, sweep: 0.12, Q: 3, drive: 2, gain: 0.45 * k, attack: 0.002, dur: 0.14 });
        for (let i = 0; i < 3; i++) this.burst(out, t + 0.01 + i * (0.02 + Math.random() * 0.03), { filter: 'highpass', freq: 3000, gain: 0.3 * k, attack: 0.0004, dur: 0.012 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 3, gain: 0.9 * k, attack: 0.002, dur: 0.18 });
        this.playCaseHit(out, t + 0.005, 'debrisPlateHull', 1.0 + Math.random() * 0.25, 0.4 * k);
        break;
      }
      case 'snap': {
        // Giá đỡ phụ kiện nhỏ gãy bật: tiếng "tách" khô + lạch cạch
        this.burst(out, t, { filter: 'highpass', freq: 2600, drive: 2, gain: 0.4 * k, attack: 0.0004, dur: 0.015 });
        this.playCaseHit(out, t + 0.003, 'debrisMetalHull', 1.1 + Math.random() * 0.4, 0.04 * k, 6000);
        break;
      }
      case 'debris':
      case 'debrisLand': {
        // Mảnh / phụ kiện rơi đập đất: "bịch" trầm theo khối lượng + tiếng kim loại đục cụt, nảy nhẹ một lần
        const heavy = Math.min(1.6, k);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520 - heavy * 160, drive: 2, gain: 0.55 * heavy, attack: 0.002, dur: 0.06 + heavy * 0.06 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (900 - heavy * 300) * (0.8 + Math.random() * 0.4), Q: 5, gain: 0.25 * heavy, attack: 0.001, dur: 0.07 });
        const tb = t + 0.12 + Math.random() * 0.12;
        this.burst(out, tb, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 480, gain: 0.2 * heavy, attack: 0.002, dur: 0.05 });
        this.burst(out, tb + 0.05, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1800, gain: 0.15 * heavy, attack: 0.01, dur: 0.18 });
        break;
      }
      case 'debrisHit': {
        // Mảnh / phụ kiện văng ra đập xuống (mỗi lần chạm một tiếng, to theo tốc độ va, trầm theo khối lượng).
        // opts: { mat, hull (rơi trên thép xác xe), m (khối lượng 1..4.5), first }
        // Như ngoài đời: thép rơi đất = "cạch/choang" kim loại bị đất ăn ngân rất nhanh (~0,1-0,2 s) + "huỵch" đất
        // (năng lượng ~80-300 Hz, không dồn xuống < 80 Hz vì loa thường không phát được) + đất sỏi bắn lạo xạo;
        // thép đập thép xác xe = "CHOANG" sáng, to hơn hẳn, ngân dài 1-2 s.
        // Vật bằng thép dùng mẫu va chạm dựng theo vật lý (bảng STEEL, gatling.js); modal() có cao độ rõ chỉ còn cho
        // roi ăng-ten (thanh mảnh ngân ra nốt thật). Trước đây mỗi lần nảy kêu "tưng" như gảy đàn
        const o = opts || {}, mat = o.mat || 'metal', hull = !!o.hull;
        const heavy = Math.max(0, Math.min(1, ((o.m || 1) - 1) / 3.5));
        const kk = Math.min(1.6, k), pr = 0.9 + Math.random() * 0.2;
        const ringT = (dirtT, hullT) => hull ? hullT : dirtT;
        const dirt = (g, f) => {
          if (hull) return;
          // "huỵch" khối đất bị nện + đất sỏi bắn lạo xạo
          this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'bandpass', freq: f, Q: 0.9, drive: 1.4, gain: g * kk, attack: 0.002, dur: 0.06 + 0.07 * heavy });
          this.burst(out, t + 0.003, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500 + Math.random() * 900, Q: 0.6, gain: 0.25 * g * kk, attack: 0.002, dur: 0.05 + 0.04 * kk });
          if (kk > 0.5) for (let i = 0; i < 3; i++) this.burst(out, t + 0.03 + Math.random() * 0.15, { filter: 'bandpass', freq: 1800 + Math.random() * 2500, Q: 3, gain: (0.04 + 0.05 * Math.random()) * g * kk, attack: 0.0005, dur: 0.01 });
        };
        const BAR = [1, 2.756, 5.404, 8.933];
        switch (mat) {
          case 'plate':
            // tấm giáp / váy xích: thép dày, mode gốc thấp, nhiều mode dày đặc
            dirt(1.0, 150 + 80 * (1 - heavy));
            this.playCaseHit(out, t, hull ? 'debrisPlateHull' : 'debrisPlate', pr * (1.1 - 0.25 * heavy), (hull ? 1.1 : 0.6) * kk);
            if (hull) this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 300, Q: 1, drive: 1.5, gain: 0.35 * kk, attack: 0.001, dur: 0.1 });
            break;
          case 'can':
            // vỏ rỗng (bình nhiên liệu, ống phóng): khoang rỗng cộng hưởng "boong" + vỏ thép mỏng ngân
            dirt(0.55, 220);
            this.playCaseHit(out, t, hull ? 'debrisCanHull' : 'debrisCan', pr * (1.1 - 0.25 * heavy), (hull ? 0.6 : 0.5) * kk);
            break;
          case 'rubber':
            // bánh xe: lốp nện "bụp" (~100-180 Hz, có thân, không chìm dưới 80 Hz) + cao su đập "bạch" + vành thép cạch nhẹ
            dirt(0.7, 160);
            this.tone(out, t, { type: 'sine', freq: 150 * pr, freqEnd: 105, sweep: 0.09, gain: 0.35 * kk, attack: 0.002, dur: 0.12 });
            this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 520 * pr, Q: 1.2, gain: 0.5 * kk, attack: 0.001, dur: 0.045 });
            this.playCaseHit(out, t + 0.003, 'debrisMetal', 0.9 * pr, 0.08 * kk, 3000);   // vành thép
            break;
          case 'glass':
            // cụm kính / đèn / radar: vỏ thép nhỏ "cạch" + kính vụn lách cách
            dirt(0.4, 300);
            this.playCaseHit(out, t, hull ? 'debrisMetalHull' : 'debrisMetal', 1.3 * pr, (hull ? 0.25 : 0.22) * kk);
            for (let i = 0; i < 2 + Math.round(3 * Math.min(1, kk)); i++) this.burst(out, t + 0.005 + Math.random() * 0.12, { filter: 'bandpass', freq: 3500 + Math.random() * 4000, Q: 8, gain: (0.06 + Math.random() * 0.07) * kk, attack: 0.0005, dur: 0.015 + Math.random() * 0.02 });
            break;
          case 'link':
            // mắt xích thép đúc: khối đặc nặng -> "cạch" đanh, cao độ rõ, chốt xích lạch xạch
            dirt(0.65, 200);
            this.playCaseHit(out, t, hull ? 'debrisLinkHull' : 'debrisLink', pr, (hull ? 0.5 : 0.45) * kk);
            this.burst(out, t + 0.03 + Math.random() * 0.03, { filter: 'bandpass', freq: 2200, Q: 3, gain: 0.12 * kk, attack: 0.0005, dur: 0.012 });
            break;
          case 'net':
            // lưới lá / giỏ vải: "phịch" mềm + lá sột soạt, không có tiếng kim loại
            this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'bandpass', freq: 180, Q: 0.8, gain: 0.45 * kk, attack: 0.006, dur: 0.09 });
            this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2200, Q: 0.6, gain: 0.2 * kk, attack: 0.01, dur: 0.18 });
            break;
          case 'whip':
            // roi ăng-ten (thanh mảnh, nhẹ): "tinh" cao, ngân rung của thanh tự do
            this.modal(out, t, { f0: 900 * pr, ratios: BAR, T: ringT(0.35, 0.8), gain: 0.045 * kk, hard: 0.6, tilt: 0.3 });
            break;
          default:
            // phụ kiện thép nhỏ (hộp đồ, đèn, lan can, giá súng...): "cạch" kim loại, nhẹ thì cao hơn + "bịch" đất
            dirt(0.6, 200 + 100 * (1 - heavy));
            this.playCaseHit(out, t, hull ? 'debrisMetalHull' : 'debrisMetal', pr * (1.15 - 0.3 * heavy), (hull ? 0.7 : 0.4) * kk);
        }
        break;
      }
      case 'debrisScrape': {
        // Mảnh trượt / cày lê trên mặt đỡ: đất sỏi sột soạt (thép trên thép thì rít kim loại)
        const o = opts || {};
        if (o.hull) {
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2100 + Math.random() * 900, Q: 5, gain: 0.25 * k, attack: 0.015, dur: 0.2 });
        } else if (o.mat !== 'net') {
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700 + Math.random() * 400, Q: 0.8, filter2: 'lowpass', freq2: 2200, gain: 0.35 * k, attack: 0.02, dur: 0.2 });
          this.burst(out, t, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1600, gain: 0.2 * k, attack: 0.02, dur: 0.18 });
        } else {
          this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400, Q: 0.6, gain: 0.12 * k, attack: 0.03, dur: 0.18 });
        }
        break;
      }
      case 'trackSnap': {
        // Xích đứt: chốt mắt xích gãy "chát", dải xích thép nặng tuột khỏi bánh dẫn hướng đổ lạch xạch xuống đất
        // (mỗi mắt xích chạm nhau / chạm đất là một cú va thép đúc thật, không phải nhiễu lọc dải hẹp "cộc cộc" như gõ mõ)
        this.snap(out, t, 0.9 * k, 3600, 5);
        this.playCaseHit(out, t, 'debrisLinkHull', 0.8 + Math.random() * 0.2, 0.25 * k);
        let ti = t + 0.08;
        for (let i = 0; i < 8; i++) {
          ti += 0.05 + Math.random() * 0.05 + i * 0.008;
          this.playCaseHit(out, ti, Math.random() < 0.4 ? 'debrisLinkHull' : 'debrisLink', 0.75 + Math.random() * 0.35, (0.12 - i * 0.011) * k);
          this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.25 * k, attack: 0.001, dur: 0.05 });
        }
        this.burst(out, ti + 0.06, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, drive: 2, gain: 0.6 * k, attack: 0.003, dur: 0.25 });
        break;
      }
      case 'concrete': case 'masonry': case 'adobe': case 'woodBreak': case 'sheetMetal': case 'rockSplit': {
        // Mảng tường / khối bê tông / đá tảng vỡ: tiếng nứt vỡ theo vật liệu -> mảnh vụn văng ra rơi đập đất đúng
        // thời gian rơi (độ cao opts.h), mảnh to "cộc" nặng trước, vụn nhỏ lả tả sau, sỏi / đất đổ rào rào
        const h = opts && opts.h !== undefined ? opts.h : 14;
        // đạn nhỏ đục tường: tiếng đạn chạm đã có (surfaceHit) -> chỉ thêm ít vụn vữa / bê tông rơi lả tả
        if (k < 0.4) { this.debrisRain(out, t + 0.01, kind, k * 1.6, { n: 2, h: Math.min(h, 12), spread: 0.1, pour: 0.25 }); break; }
        const dt = this.breakCrack(out, t, kind, k);
        this.debrisRain(out, t + dt, kind, k, { n: Math.round(5 + 9 * Math.min(1.6, k)), h, spread: 0.1 + 0.15 * k, pour: Math.min(1.2, k) });
        break;
      }
      case 'collapse': {
        // Nhà / nhịp cầu sập. opts: { mat, h (chiều cao, đơn vị game), floors }.
        // Thứ tự như ngoài đời: kết cấu chịu lực gãy (bê tông nứt toác / cốt thép bật "tưng" / gỗ gãy rắc / thép oằn)
        // -> khối nhà rơi tự do ~√(2h/g) giây, tiếng ầm dâng dần -> các sàn đập xuống nối tiếp "ẦM ẦM" -> đá vụn, kính,
        // tôn đổ rào rào kéo dài rồi tắt dần. Không dùng âm < 40 Hz: loa thường không phát được mà ăn hết headroom.
        const mat = (opts && opts.mat) || 'concrete';
        const H = Math.max(16, (opts && opts.h) || 60);
        const floors = Math.max(1, Math.min(8, (opts && opts.floors) || Math.round(H / 25)));
        const tf = Math.sqrt(2 * (H / 8) / 9.8);       // thời gian rơi tự do của phần trên cùng
        const T = 0.15 + floors * 0.12 + tf;           // khớp hình sập: tầng dưới khuỵu trước, các tầng trên rơi theo
        const brittle = mat !== 'woodBreak' && mat !== 'sheetMetal';
        // 1) kết cấu gãy: vài tiếng nứt lớn cách nhau không đều
        for (let i = 0; i < 3; i++) this.breakCrack(out, t + i * (0.07 + Math.random() * 0.12), mat, k * (1 - i * 0.2));
        if (mat === 'concrete') for (let i = 0; i < 3; i++) this.playCaseHit(out, t + 0.05 + Math.random() * 0.5, 'rebar', 0.8 + Math.random() * 0.5, 0.12 * k); // cốt thép đứt
        if (mat === 'sheetMetal') this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 340, freqEnd: 190, sweep: T, Q: 9, gain: 0.5 * k, attack: 0.2, dur: T });   // khung thép oằn rên
        if (mat === 'woodBreak') for (let i = 0; i < 4; i++) this.breakCrack(out, t + 0.2 + Math.random() * T * 0.8, 'woodBreak', 0.6 * k);
        // 2) ầm ầm dâng lên trong lúc khối nhà đổ xuống (trung trầm 120-400 Hz: nghe được cả trên loa nhỏ)
        this.burst(out, t + 0.05, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2, gain: (brittle ? 1.3 : 0.9) * k, attack: T * 0.85, dur: 1.6 + floors * 0.2 });
        this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 220, Q: 0.6, gain: 0.9 * k, attack: T * 0.8, dur: 1.4 + floors * 0.2 });
        // 3) từng sàn / mảng lớn đập xuống: "ẦM" nối tiếp nhau
        for (let f = 0; f < floors; f++) {
          const ti = t + 0.15 + (f + 1) * 0.12 + tf * (0.55 + 0.45 * Math.sqrt((f + 1) / floors)) + Math.random() * 0.08;
          const g = k * (1 - f * 0.06);
          this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2.5, gain: 1.4 * g, attack: 0.004, dur: 0.45 });
          this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: brittle ? 520 : 380, Q: 0.8, drive: 1.5, gain: 0.9 * g, attack: 0.002, dur: 0.22 });
          if (mat === 'sheetMetal') this.playCaseHit(out, ti, 'sheetMetal', 0.7 + Math.random() * 0.3, 0.6 * g);
        }
        // 4) đá vụn / mảnh gỗ / tôn văng đổ rào rào, kính vỡ lả tả
        this.debrisRain(out, t + T * 0.6, mat, k, { n: 10 + floors * 2, h: 24, spread: 1.2 + floors * 0.15, pour: 0 });
        if (brittle) this.burst(out, t + T * 0.7, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (BREAK_MAT[mat] || BREAK_MAT.concrete).pourF || 900, Q: 0.5, filter2: 'lowpass', freq2: 2200, gain: 0.55 * k, attack: 0.5, dur: 2.4 + floors * 0.3 });
        if (mat === 'concrete') for (let i = 0; i < 10; i++) this.burst(out, t + 0.2 + Math.random() * (T + 1.2), { filter: 'bandpass', freq: 3500 + Math.random() * 4500, Q: 8, gain: (0.04 + Math.random() * 0.06) * k, attack: 0.0005, dur: 0.015 + Math.random() * 0.03 });
        if (near > 0.3) this.duck(0.4, 1.4 + tf);
        break;
      }
      case 'treeFall': {
        // Cây đổ. opts: { dur (s: từ lúc gãy tới lúc tán chạm đất, khớp hình), h (chiều cao cây, đơn vị game), crush }.
        // Thớ thân gãy "rắc… rắc-RẮC" -> gốc kẽo kẹt khi cây bắt đầu nghiêng -> tán lá xé gió "ào" mạnh dần theo tốc độ rơi
        // -> chạm đất: "rầm" trầm của thân + cành gãy răng rắc + lá xào xạc, nảy nhẹ một lần
        const dur = Math.max(0.6, (opts && opts.dur) || 1.6);
        const big = Math.min(1.5, Math.max(0.35, ((opts && opts.h) || 40) / 45));
        this.breakCrack(out, t, 'woodBreak', 0.9 * k);
        if (!(opts && opts.crush)) this.breakCrack(out, t + 0.12 + Math.random() * 0.15, 'woodBreak', 0.6 * k);
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420 / big, freqEnd: 300 / big, sweep: dur * 0.5, Q: 12, gain: 0.22 * k, attack: dur * 0.2, dur: dur * 0.4 });
        this.burst(out, t + dur * 0.15, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 900, filter2: 'lowpass', freq2: 5000, gain: 0.5 * k * big, attack: dur * 0.85, dur: 0.25 });
        const ti = t + dur;
        this.burst(out, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200 + 60 / big, drive: 2, gain: 1.1 * k * big, attack: 0.004, dur: 0.35 + 0.2 * big });
        this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 0.7, gain: 0.5 * k * big, attack: 0.003, dur: 0.18 });
        for (let i = 0; i < 6 + Math.round(4 * big); i++) this.burst(out, ti + Math.pow(Math.random(), 1.6) * 0.4, { filter: 'bandpass', freq: 1300 + Math.random() * 2400, Q: 1.3, gain: (0.12 + Math.random() * 0.2) * k, attack: 0.0004, dur: 0.012 + Math.random() * 0.025 });
        this.burst(out, ti + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1800, gain: 0.4 * k * big, attack: 0.01, dur: 0.9 });
        this.burst(out, ti + 0.22 + Math.random() * 0.1, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: 0.35 * k * big, attack: 0.003, dur: 0.18 });
        break;
      }
      case 'leafStrip': {
        // Tán lá / cành bị mảnh đạn, sóng nổ xé trụi: vài cành con gãy "tách" + lá rào rào rơi
        for (let i = 0; i < 4; i++) this.burst(out, t + Math.random() * 0.15, { filter: 'bandpass', freq: 1400 + Math.random() * 2000, Q: 1.2, gain: (0.5 + Math.random() * 0.5) * k, attack: 0.0004, dur: 0.015 });
        this.burst(out, t + 0.01, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, Q: 2, gain: 0.5 * k, attack: 0.001, dur: 0.06 });
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1500, gain: 0.9 * k, attack: 0.05, dur: 0.9 });
        break;
      }
      case 'slabImpact': {
        // Nhịp cầu / khối bê tông hàng chục tấn đập xuống lòng sông cạn / mặt đất
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 3, gain: 1.6 * k, attack: 0.003, dur: 0.7 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, Q: 0.8, drive: 1.6, gain: 1.0 * k, attack: 0.002, dur: 0.3 });
        this.breakCrack(out, t + 0.01, 'concrete', 0.8 * k);
        this.debrisRain(out, t + 0.05, 'concrete', k, { n: 12, h: 30, spread: 0.8, pour: 1.2 });
        if (near > 0.3) this.duck(0.5, 1.0);
        break;
      }
      case 'splashBig': {
        // Khối lớn rơi xuống sông: cú đập mặt nước "ÙM" trầm + cột nước tung xé gió -> nước đổ mưa rào xuống, bọt sủi
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 2.5, gain: 1.5 * k, attack: 0.004, dur: 0.6 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 500, Q: 0.7, gain: 0.9 * k, attack: 0.003, dur: 0.35 });
        this.burst(out, t + 0.02, { filter: 'bandpass', freq: 1700, Q: 0.4, gain: 0.6 * k, attack: 0.05, dur: 1.4 });
        this.burst(out, t + 0.7, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1500, gain: 0.45 * k, attack: 0.3, dur: 1.6 });
        for (let i = 0; i < 14; i++) this.burst(out, t + 0.6 + Math.random() * 1.6, { filter: 'bandpass', freq: 1800 + Math.random() * 4000, Q: 4, gain: (0.04 + Math.random() * 0.06) * k, attack: 0.001, dur: 0.03 });
        for (let i = 0; i < 5; i++) { const f = 250 + Math.random() * 400; this.tone(out, t + 0.3 + Math.random() * 1.5, { freq: f, freqEnd: f * 1.8, sweep: 0.05, gain: 0.05 * k, attack: 0.003, dur: 0.06 }); }
        if (near > 0.3) this.duck(0.5, 1.0);
        break;
      }
      case 'vehFire': {
        // Xe / xác xe đang cháy (một đợt ~2.2 s, gọi lặp chồng lên nhau): lửa dầu gầm cuộn "phừng phừng" theo nhịp thở,
        // vật liệu cháy nổ lách tách, thỉnh thoảng "bụp" của bình / ống dầu phụt hoặc "xì" của lốp, đường ống
        const dur = 2.2;
        const roar = this.ctx.createGain();
        roar.gain.value = 1;
        roar.connect(out);
        // nhịp thở của lửa lớn: biên độ dao động chậm ~1.5-3 Hz
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 1.5 + Math.random() * 1.5;
        const ld = this.ctx.createGain();
        ld.gain.value = 0.35;
        lfo.connect(ld);
        ld.connect(roar.gain);
        lfo.start(t);
        lfo.stop(t + dur + 0.6);
        this.burst(roar, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, drive: 2, gain: 1.1 * k, attack: 0.5, dur: dur });
        this.burst(roar, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, Q: 0.6, gain: 0.35 * k, attack: 0.5, dur: dur });
        this.burst(out, t + 0.1, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2400, Q: 0.6, gain: 0.8 * k, attack: 0.3, dur: dur });
        if (Math.random() < 0.25) this.burst(out, t + Math.random() * 1.5, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 3, gain: 0.7 * k, attack: 0.002, dur: 0.12 });
        if (Math.random() < 0.15) this.burst(out, t + Math.random() * 1.2, { filter: 'highpass', freq: 3500, gain: 0.12 * k, attack: 0.05, dur: 0.8 });
        break;
      }
      case 'fire': {
        // Lửa cháy lách tách
        this.burst(out, t, { buffer: this.crackleBuffer, filter: 'highpass', freq: 900, gain: 0.5 * k, attack: 0.15, dur: 1.8 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.4 * k, attack: 0.3, dur: 2.0 });
        break;
      }
      case 'turretLand': {
        // Khối tháp thép hàng chục tấn đập xuống đất
        // (trước đây: sóng sin trượt 60 -> 30 Hz + thép ngân 1,6 s -> nghe như trống điện tử + chuông)
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 180, drive: 4, gain: 2.0 * k, attack: 0.002, dur: 0.6 });
        this.playCaseHit(out, t, 'turretLand', 0.9 + Math.random() * 0.2, 3.6 * k);
        this.playCaseHit(out, t + 0.004, 'debrisPlate', 0.7, 0.5 * k);
        this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1800, Q: 0.6, gain: 0.5 * k, attack: 0.01, dur: 0.4 });   // đất sỏi bắn tung
        break;
      }
      default:
        this.playCaseHit(out, t, 'debrisMetal', 1, 0.3 * k);
    }
  }
});
