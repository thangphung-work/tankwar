/**
 * ÂM THANH TRONG XE: nạp đạn, bíp cảnh báo radar, khóa mục tiêu, bộ đàm, kèn chiến thắng.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 4. NẠP ĐẠN TỰ ĐỘNG / NHẬN TIẾP TẾ
  // ===========================================================================
  playReloadDone() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.7, wet: 0.04 });
    // Đẩy đạn vào buồng nòng (trượt) rồi khối khóa nòng đóng (tiếng đục nặng)
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 1.0, gain: 0.18, attack: 0.03, dur: 0.16 });
    this.burst(out, t + 0.22, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2.5, gain: 0.9, attack: 0.001, dur: 0.12 });
    this.burst(out, t + 0.22, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1200, Q: 1.2, gain: 0.25, attack: 0.001, dur: 0.05 });
  }

  /**
   * Chu trình nạp đạn nghe từ trong xe mình, theo cơ cấu từng xe:
   * - ALL_ROUNDER (pháo 120mm nạp tay, đạn để trong hộc sau tháp có cửa chắn chống cháy):
   *   'open'  khóa nòng trượt đứng tự mở cuối hành trình lùi "KẠNG", đáy vỏ đạn thép văng vào túi hứng "cộp", khí thuốc xì
   *   'fetch' pháo thủ nạp đạn gạt cửa hộc đạn: cửa thủy lực trượt "xèèè-cạch", rút viên đạn, cửa đóng sập
   *   'ram'   đẩy tay viên đạn vào nòng "sột" -> đạn ngồi khít buồng "cộc" -> khóa nòng nhả, đóng sập "KẠNG"
   * - ARTILLERY (lựu pháo 155mm, nạp tự động, liều phóng module):
   *   'open'  khóa nòng mở, ống dẫn hướng khí xả xì
   *   'fetch' băng chuyền ổ đạn xoay chọn đạn: mô-tơ servo rít + các nấc khóa "cạch" đều
   *   'ram'   tay đẩy xích nạp đạn rít, đầu đạn đóng chặt vào đai dẫn hướng "KENG" -> đẩy các module liều phóng -> khóa nòng đóng
   * - GATLING (băng đạn 450 viên không mắt xích) 'magOut' / 'magIn'; SCOUT (hộp đạn 12.7mm có dây đạn) 'magOut' / 'magIn'
   * - MG762 (trạm súng máy 7.62mm điều khiển từ xa trên nóc tháp xe tăng): kíp xe phải mở nắp tháp, với tay ra thay hộp
   *   'magOut' nắp tháp bật mở + gió / tiếng ngoài trời tràn vào, nắp hộp tiếp đạn bật, hộp rỗng rút ra
   *   'magIn'  hộp mới cài khay, dây đạn nhỏ lách tách, đóng nắp, mô-tơ lên đạn điện "rè-cạch", nắp tháp đóng sập
   * - ATGM (ống phóng tên lửa trên nóc xe trinh sát) 'out' ống phóng rỗng nhả chốt, bật ra / 'in' ống mới trượt vào giá,
   *   chốt khóa, giắc điện cắm, con quay đầu dò quay lên (rít cao dần) rồi bíp sẵn sàng
   * ammo (xe tăng): đạn mũi tên AP nhẹ & dài (tiếng trượt dài, cao) / đạn nổ HE nặng (cộc trầm hơn)
   * charge (lựu pháo): số module liều phóng đẩy vào buồng theo liều đang chọn (liều 1 nhiều module -> nhiều tiếng đẩy)
   * lead: số giây còn lại tới lúc nạp xong — các tiếng cuối được dồn vào đúng khoảng đó.
   */
  playReloadPhase(tankType = 'ALL_ROUNDER', phase = 'ram', lead = 0.6, opt = null) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.55, wet: 0.03 });
    const R = Math.random;
    // khối thép nặng đập vào nhau trong khoang: tiếng "cộc / kạng" đục, tắt nhanh (thép dày, bôi mỡ)
    const clunk = (tt, f, g, ring = 0.08) => {
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: f * 0.6, drive: 2, gain: g, attack: 0.001, dur: 0.09 });
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, Q: 1.6, drive: 1.6, gain: g * 0.55, attack: 0.0006, dur: 0.05 });
      // khối thép đúc va nhau: mẫu va chạm thép dựng theo vật lý (bảng STEEL) thay cho dải nhiễu hẹp có cao độ ("tưng")
      if (ring) this.playCaseHit(out, tt, ring > 0.3 ? 'debrisLinkHull' : 'debrisLink', f / 520, g * 0.2, 7000);
    };
    // vật trượt trên rãnh / ray: nhiễu dải trung ngắn
    const slide = (tt, f0, f1, dur, g) => this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0, freqEnd: f1, sweep: dur, Q: 2, gain: g, attack: dur * 0.3, dur });
    // mô-tơ điện / bơm thủy lực: tiếng rít có cao độ, dựng lên rồi tắt
    const motor = (tt, f, dur, g) => {
      this.tone(out, tt, { type: 'sawtooth', freq: f * 0.7, freqEnd: f, sweep: dur * 0.3, gain: g, attack: dur * 0.2, hold: dur * 0.5, dur: dur * 0.3, filter: 'lowpass', filterFreq: f * 3 });
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f * 4, Q: 3, gain: g * 2.5, attack: dur * 0.2, dur });
    };
    const L = Math.max(0.2, lead);
    if (tankType === 'ARTILLERY') {
      if (phase === 'open') {
        clunk(t + 0.55, 520, 0.9);
        this.burst(out, t + 0.6, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 2500, gain: 0.08, attack: 0.05, dur: 0.6 });
      } else if (phase === 'fetch') {
        motor(t, 260, 0.9, 0.035);
        for (let i = 0; i < 3; i++) clunk(t + 0.25 + i * 0.22 + R() * 0.03, 900, 0.25, 0.04);
      } else if (phase === 'ram') {
        const k = L / 1.05;
        motor(t, 340, 0.45 * k, 0.04);
        slide(t + 0.02, 500, 1100, 0.35 * k, 0.12);
        clunk(t + 0.4 * k, 700, 1.0, 0.12);            // đai dẫn hướng đầu đạn cắm vào rãnh xoắn
        // đẩy các module liều phóng: liều mạnh (1) nhiều module, liều nhỏ ít — mỗi module một tiếng trượt + chạm
        const nMod = Math.max(1, Math.min(5, opt && opt.modules ? opt.modules : 3));
        for (let i = 0; i < nMod; i++) {
          const tm = t + (0.5 + i * 0.12 / Math.max(1, nMod / 3)) * k;
          slide(tm, 400, 700, 0.09 * k, 0.08);
          clunk(tm + 0.08 * k, 380 + i * 25, 0.28, 0);
        }
        clunk(t + Math.max(0.75 * k, L - 0.08), 450, 1.1, 0.1);   // khóa nòng đóng
      }
      return;
    }
    if (tankType === 'GATLING') {
      if (phase === 'magOut') {
        // mô-tơ quay nòng hãm hẳn, nhả chốt băng đạn rỗng, kéo băng cũ ra
        clunk(t + 0.35, 650, 0.6);
        slide(t + 0.5, 700, 400, 0.6, 0.1);
        clunk(t + 1.15, 300, 0.7, 0);
      } else if (phase === 'magIn') {
        // đẩy băng mới vào ray, khóa chốt, mô-tơ tiếp đạn chạy thử kéo đạn vào máng (lạch xạch dày)
        slide(t, 350, 650, 0.45, 0.12);
        clunk(t + 0.45, 380, 0.9, 0.05);
        motor(t + 0.6, 300, Math.max(0.15, Math.min(0.7, L - 0.7)), 0.03);
        for (let i = 0; i < 10; i++) clunk(t + 0.65 + i * 0.055 + R() * 0.01, 1200 + R() * 400, 0.12, 0);
        clunk(t + Math.max(0.9, L - 0.1), 600, 0.8, 0.06);
      }
      return;
    }
    if (tankType === 'MG762') {
      if (phase === 'magOut') {
        // nắp tháp bật mở (thép dày, bản lề lò xo) + tiếng ngoài trời tràn vào khoang
        clunk(t + 0.15, 380, 0.8, 0.2);
        this.burst(out, t + 0.2, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, Q: 0.5, gain: 0.07, attack: 0.25, dur: 1.4 });
        clunk(t + 0.7, 1700, 0.3, 0.03);              // nắp hộp tiếp đạn bật
        slide(t + 0.85, 1200, 800, 0.2, 0.06);        // rút hộp rỗng
        clunk(t + 1.1, 900, 0.3, 0);
      } else if (phase === 'magIn') {
        clunk(t, 800, 0.35, 0);                       // hộp mới cài khay
        for (let i = 0; i < 8; i++) clunk(t + 0.12 + i * 0.03 + R() * 0.01, 2800 + R() * 700, 0.05, 0);   // dây đạn 7.62 nhỏ
        clunk(t + 0.45, 1800, 0.45, 0.04);            // đóng nắp hộp tiếp đạn
        motor(t + 0.6, 520, 0.35, 0.035);             // mô-tơ lên đạn điện của trạm vũ khí
        clunk(t + 0.95, 1500, 0.5, 0.04);
        clunk(t + Math.max(1.05, L - 0.05), 360, 0.95, 0.25);   // nắp tháp đóng sập
      }
      return;
    }
    if (tankType === 'ATGM') {
      if (phase === 'out') {
        // ống phóng rỗng (composite nhẹ) nhả chốt, bật khỏi giá: "cạch" + tiếng ống rỗng "boong" nhẹ
        clunk(t + 0.2, 1500, 0.45, 0.05);
        this.burst(out, t + 0.45, { buffer: this.brownNoiseBuffer, filter: 'bandpass', freq: 240, Q: 3, gain: 0.25, attack: 0.002, dur: 0.18 });
        slide(t + 0.5, 700, 400, 0.4, 0.07);
      } else if (phase === 'in') {
        // ống mới trượt vào giá, chốt khóa, giắc điện cắm "tách", con quay đầu dò quay lên, bíp sẵn sàng
        slide(t, 400, 800, 0.5, 0.1);
        clunk(t + 0.55, 900, 0.7, 0.06);
        clunk(t + 0.8, 3000, 0.12, 0);
        this.tone(out, t + 0.9, { freq: 600, freqEnd: 2600, sweep: Math.max(0.3, L - 1.2), gain: 0.03, attack: 0.1, hold: Math.max(0.2, L - 1.2), dur: 0.15 });
        this.tone(out, t + Math.max(1.3, L - 0.15), { freq: 1900, gain: 0.05, attack: 0.005, dur: 0.07 });
        this.tone(out, t + Math.max(1.42, L - 0.03), { freq: 1900, gain: 0.05, attack: 0.005, dur: 0.07 });
      }
      return;
    }
    if (tankType === 'SCOUT') {
      if (phase === 'magOut') {
        // lật nắp khóa nòng "cạch", tháo hộp đạn rỗng
        clunk(t + 0.3, 1400, 0.4, 0.05);
        this.burst(out, t + 0.31, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 1.5, gain: 0.08, attack: 0.02, dur: 0.12 });
        clunk(t + 0.9, 500, 0.5, 0);
      } else if (phase === 'magIn') {
        // lắp hộp đạn mới, đặt dây đạn lên khay (mắt xích lách cách), đóng nắp "CẠCH", kéo tay kéo lên đạn 2 lần
        clunk(t, 450, 0.5, 0);
        for (let i = 0; i < 6; i++) clunk(t + 0.15 + i * 0.04 + R() * 0.015, 2200 + R() * 600, 0.08, 0);
        clunk(t + 0.5, 1300, 0.7, 0.06);
        const rack = Math.max(0.75, L - 0.45);
        slide(rack, 900, 1500, 0.12, 0.12);
        clunk(rack + 0.13, 1100, 0.8, 0.05);
        slide(rack + 0.25, 900, 1500, 0.1, 0.1);
        clunk(rack + 0.36, 1100, 0.7, 0.05);
      }
      return;
    }
    // ALL_ROUNDER: pháo 120mm nạp tay
    if (phase === 'open') {
      clunk(t + 0.32, 480, 1.0, 0.1);
      clunk(t + 0.5 + R() * 0.05, 700, 0.35, 0.03);   // đáy vỏ đạn rơi vào túi hứng
      this.burst(out, t + 0.36, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 2200, gain: 0.07, attack: 0.04, dur: 0.5 });
    } else if (phase === 'fetch') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, Q: 1.2, gain: 0.06, attack: 0.02, dur: 0.35 });   // xì van thủy lực
      slide(t + 0.05, 500, 800, 0.35, 0.1);
      clunk(t + 0.42, 600, 0.45, 0.04);
      slide(t + 0.6, 800, 500, 0.4, 0.07);            // rút viên đạn khỏi ống chứa
      slide(t + 1.05, 800, 500, 0.3, 0.09);
      clunk(t + 1.35, 420, 0.8, 0.06);                // cửa hộc đạn đóng sập
    } else if (phase === 'ram') {
      const k = L / 0.6;
      // đạn mũi tên AP: dài & nhẹ hơn -> trượt dài, tiếng chạm cao; đạn nổ HE nặng đầu -> chạm trầm, đục
      const am = opt && opt.ammo, ap = am === 'AP', he = am === 'HE';
      slide(t, ap ? 750 : 600, ap ? 1300 : 1000, (ap ? 0.32 : 0.25) * k, 0.12);
      clunk(t + (ap ? 0.33 : 0.28) * k, ap ? 680 : he ? 420 : 520, he ? 0.8 : 0.6, 0.04);   // đạn ngồi khít buồng
      clunk(t + Math.max(0.36 * k, L - 0.05), 430, 1.15, 0.12);   // khóa nòng đóng sập
    }
  }

  /**
   * Phóng 1 loạt lựu đạn khói (n quả, mỗi bên tháp 1 quả): trong xe nghe rơ-le bắn điện "tách" trên bảng điều khiển,
   * rồi mỗi ống một tiếng "THỤP" rỗng của liều phóng nhỏ trong ống ngắn (cộng hưởng ống ~180 Hz, khác hẳn tiếng nổ
   * đanh của pháo), lệch nhau ~0,1 s; thân xe rung nhẹ, lựu đạn xé gió "vút" bay đi. Tiếng nổ trên không ở điểm rơi:
   * playSmokeBurst (Equipment.SmokeField gọi đúng lúc lựu đạn nổ). distance > 0: xe khác phóng (nhỏ, tối dần theo
   * khoảng cách, không có tiếng trong khoang).
   */
  playSmokeLaunch(distance = 0, pos = null, n = 2) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.25, delay: 0, pan: 0 };
    if (sp.gain < 0.05) return;
    const t = this.ctx.currentTime + sp.delay;
    const R = Math.random;
    if (!remote) {
      // rơ-le / công tắc bắn điện trong khoang + tiếng ù điện ngắn
      const cab = this.voice({ bus: this.weaponBus, gain: 0.5, wet: 0.02 });
      this.burst(cab, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3200, Q: 3, gain: 0.25, attack: 0.0005, dur: 0.015 });
      this.metal(cab, t + 0.008, { f0: 1900, ratios: [1, 2.4], decay: 0.05, gain: 0.05, click: 0.5 });
      this.tone(cab, t + 0.01, { type: 'square', freq: 120, gain: 0.012, attack: 0.004, dur: 0.06, filter: 'lowpass', filterFreq: 900 });
    }
    for (let i = 0; i < Math.max(1, n); i++) {
      const ti = t + 0.03 + i * (0.09 + R() * 0.05);
      const pp = this.voice({ bus: remote ? null : this.weaponBus, gain: sp.gain * 0.55, lowpass: sp.lowpass, wet: Math.max(0.25, sp.wet), pan: remote ? sp.pan : (i === 0 ? -0.35 : 0.35) });
      // xung áp liều phóng (ngắn, không đanh như đầu nòng pháo)
      this.snap(pp, ti, 0.45, remote ? Math.min(sp.lowpass, 2500) : 3800, 2.2);
      // tiếng "thụp" rỗng: cộng hưởng ống phóng ngắn, tụt cao độ khi khí thoát
      this.tone(pp, ti, { type: 'sine', freq: 190 + R() * 25, freqEnd: 85, sweep: 0.09, gain: 0.55, attack: 0.002, dur: 0.16 });
      this.burst(pp, ti, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 1.8, gain: 1.1, attack: 0.001, dur: 0.14 });
      this.burst(pp, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650 + R() * 200, Q: 1.1, drive: 1.5, gain: 0.8, attack: 0.001, dur: 0.07 });
      // khí phụt khỏi miệng ống
      this.burst(pp, ti + 0.005, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1500, gain: 0.18, attack: 0.002, dur: 0.12 });
      // lựu đạn xé gió bay đi (nhỏ dần, cao độ tụt — hiệu ứng Doppler khi bay xa)
      if (!remote || distance < 900) this.burst(pp, ti + 0.04, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2400, freqEnd: 900, sweep: 0.5, Q: 2.2, gain: 0.09, attack: 0.04, dur: 0.45 });
      if (!remote) this.metal(pp, ti + 0.004, { f0: 260, ratios: [1, 2.1, 3.3], decay: 0.12, gain: 0.05, click: 0.2 });   // cụm ống rung trên vỏ tháp
    }
    if (!remote && this.duck) this.duck(0.75, 0.4);
  }

  /**
   * Lựu đạn khói nổ trên không: liều nổ tung nhỏ "bụp" đục (không phải tiếng nổ phá), vỏ lựu đạn tách "tạch",
   * rồi khói phụt "phù" và các viên phốt-pho đỏ văng ra cháy xèo xèo / lách tách rơi xuống đất.
   */
  playSmokeBurst(distance = 80, pos = null) {
    if (!this.ready()) return;
    const sp = this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain * 0.5, lowpass: sp.lowpass, wet: Math.max(0.35, sp.wet), pan: sp.pan });
    const R = Math.random;
    this.snap(out, t, 0.35, Math.min(sp.lowpass, 3200), 2);
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 2, gain: 1.2, attack: 0.001, dur: 0.18 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.8, gain: 0.45, attack: 0.001, dur: 0.05 });
    this.tone(out, t, { type: 'sine', freq: 110, freqEnd: 55, sweep: 0.15, gain: 0.3, attack: 0.002, dur: 0.2 });
    // khói phụt ra: tiếng "phù" trắng dài
    this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, freqEnd: 500, sweep: 1.0, Q: 0.6, gain: 0.22, attack: 0.05, dur: 1.2 });
    // phốt-pho cháy: xèo xèo + vài tiếng lách tách lúc rơi
    if (distance < 1200) {
      this.burst(out, t + 0.08, { buffer: this.crackleBuffer || this.pinkNoiseBuffer, filter: 'highpass', freq: 2200, gain: 0.1, attack: 0.15, dur: 2.2 });
      for (let i = 0; i < 5; i++) this.burst(out, t + 0.15 + R() * 1.2, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2500 + R() * 2000, Q: 2, gain: 0.08, attack: 0.0005, dur: 0.02 });
    }
  }

  /**
   * Radar của xe mình bắt được vết mới: tiếng "píp" điện tử ngắn trên màn hình radar, gần thì cao hơn một chút.
   * Giãn cách ≥ 0,8 s để nhiều vết cùng lúc không thành chuỗi bíp liên hồi
   */
  playRadarContact(k = 0.5) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    if (this._radarPipT !== undefined && t - this._radarPipT < 0.8) return;
    this._radarPipT = t;
    const out = this.voice({ bus: this.uiBus || this.weaponBus, gain: 0.35, wet: 0.02 });
    const f = 1500 + (1 - Math.min(1, Math.max(0, k))) * 500;
    this.tone(out, t, { type: 'sine', freq: f, gain: 0.03, attack: 0.002, dur: 0.12 });
    this.tone(out, t + 0.003, { type: 'sine', freq: f * 2, gain: 0.006, attack: 0.002, dur: 0.06 });
  }

  /**
   * Hệ thống đánh chặn chủ động trên xe mình vừa khai hỏa: còi báo trong tai nghe — bíp kép cao (đã chặn được)
   * hoặc bíp trầm dài (bắn trượt, đầu đạn vẫn lao vào)
   */
  playApsAlert(ok = true) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.12;
    const out = this.voice({ bus: this.uiBus || this.weaponBus, gain: 0.5, wet: 0.02 });
    if (ok) {
      this.tone(out, t, { type: 'square', freq: 1760, gain: 0.03, attack: 0.002, dur: 0.07, filter: 'lowpass', filterFreq: 4000 });
      this.tone(out, t + 0.12, { type: 'square', freq: 2350, gain: 0.03, attack: 0.002, dur: 0.1, filter: 'lowpass', filterFreq: 4000 });
    } else {
      this.tone(out, t, { type: 'square', freq: 520, gain: 0.04, attack: 0.002, hold: 0.25, dur: 0.12, filter: 'lowpass', filterFreq: 2500 });
    }
  }

  /**
   * Pháo tự hành hạ / thu chân chống thủy lực (xe mình). dir: +1 đang hạ, -1 đang thu, 0 đứng yên.
   * Bơm thủy lực gầm trầm + dầu rít qua van khi xi-lanh chạy; hạ xong: lưỡi càng cắm đất "RẦM", cả xe nhún;
   * thu xong: chốt khóa hành trình "cạch". (Trước đây 2 giây hạ càng hoàn toàn im lặng.)
   */
  updateArtyLegs(dir = 0, event = null) {
    if (!this.ctx || this.isMuted || !this.pinkNoiseBuffer) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this._legs) {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.vehicleBus);
      const n = ctx.createBufferSource(); n.buffer = this.pinkNoiseBuffer; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 200; bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 1.4;
      n.connect(bp); bp.connect(ng); ng.connect(out);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 95;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
      const og = ctx.createGain(); og.gain.value = 0.35;
      o.connect(lp); lp.connect(og); og.connect(out);
      const h = ctx.createBufferSource(); h.buffer = this.noiseBuffer; h.loop = true;
      const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2600; hf.Q.value = 2;
      const hg = ctx.createGain(); hg.gain.value = 0.12;
      h.connect(hf); hf.connect(hg); hg.connect(out);
      n.start(); o.start(); h.start(0, 0.7);
      this._legs = { out, o, dir: 0 };
    }
    const L = this._legs;
    if (dir !== L.dir) {
      // van chuyển hướng dầu "cạch" khẽ lúc bắt đầu chạy
      if (dir !== 0) {
        const v = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.03 });
        this.burst(v, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 2, gain: 0.12, attack: 0.0006, dur: 0.03 });
      }
      L.dir = dir;
    }
    L.out.gain.setTargetAtTime(dir !== 0 ? 0.05 : 0, t, dir !== 0 ? 0.08 : 0.15);
    L.o.frequency.setTargetAtTime(dir > 0 ? 95 : 110, t, 0.1);   // thu càng: tải nhẹ hơn, bơm quay nhanh hơn chút
    if (event === 'set') {
      const v = this.voice({ bus: this.vehicleBus, gain: 0.7, wet: 0.08 });
      this.burst(v, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200, drive: 2, gain: 1.0, attack: 0.002, dur: 0.25 });
      this.burst(v, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1400, Q: 0.7, gain: 0.35, attack: 0.005, dur: 0.3 });   // đất sỏi bị lưỡi càng xới
      this.metal(v, t + 0.01, { f0: 180, ratios: [1, 2.3, 3.7], decay: 0.15, gain: 0.06, click: 0.4 });
    } else if (event === 'stowed') {
      const v = this.voice({ bus: this.vehicleBus, gain: 0.6, wet: 0.03 });
      this.burst(v, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 1.6, gain: 0.5, attack: 0.001, dur: 0.08 });
      this.burst(v, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 2, gain: 0.15, attack: 0.0005, dur: 0.03 });
    }
  }

  /**
   * Nhặt hòm tiếp tế: chốt hòm bật, nắp hòm mở, kíp xe chuyền thùng đạn / đồ tiếp tế vào xe (trước đây dùng tiếng
   * khóa nòng đóng — nghe như nạp đạn pháo, kể cả với xe không có pháo chính).
   */
  playSupplyPickup() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.5, wet: 0.08 });
    const R = Math.random;
    for (let i = 0; i < 2; i++) {
      this.burst(out, t + i * 0.09, { filter: 'bandpass', freq: 2400 + R() * 400, Q: 2, gain: 0.25, attack: 0.0005, dur: 0.02 });
      this.metal(out, t + i * 0.09, { f0: 1500 + R() * 300, ratios: [1, 2.6], decay: 0.06, gain: 0.05, click: 0.2 });
    }
    this.burst(out, t + 0.25, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700, Q: 1.2, gain: 0.12, attack: 0.05, dur: 0.25 });
    this.burst(out, t + 0.48, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 350, drive: 1.8, gain: 0.7, attack: 0.002, dur: 0.12 });
    for (let i = 0; i < 3; i++) {
      const tt = t + 0.75 + i * (0.28 + R() * 0.1);
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 1.6, gain: 0.55 + R() * 0.2, attack: 0.002, dur: 0.1 });
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900 + R() * 300, Q: 1.4, gain: 0.15, attack: 0.001, dur: 0.05 });
    }
  }

  // Nòng 6 nòng nguội lại: chỉ còn tiếng rơ-le điện khẽ + xì hơi nóng tắt dần (không có tiếng nạp đạn)
  playGatlingCooled() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.3, wet: 0.03 });
    this.metal(out, t, { f0: 1800, ratios: [1, 2.1], decay: 0.04, gain: 0.03, click: 0.15 });
    this.burst(out, t, { filter: 'highpass', freq: 4000, gain: 0.03, attack: 0.05, dur: 0.6 });
  }

  // Va chạm kim loại tổng quát (giữ tương thích API cũ)
  playMetalClank(delay = 0, volume = 0.5, freq = 440) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const out = this.voice({ bus: this.weaponBus, gain: 1, wet: 0.05 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: Math.max(300, Math.min(2000, freq * 2)), Q: 1.1, drive: 2, gain: volume * 0.8, attack: 0.001, dur: 0.07 });
  }

  // ===========================================================================
  // 5. ĐIỆN TỬ TRONG XE (cảnh báo, khóa mục tiêu, bộ đàm) — qua dải tần tai nghe nội bộ
  // ===========================================================================
  headset(gain = 1) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = gain;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    input.connect(hp);
    hp.connect(lp);
    lp.connect(this.uiBus);
    return input;
  }

  // Chống loạn tiếng điện tử trong xe: mỗi loại tiếng có khoảng nghỉ tối thiểu; tiếng quan trọng (tên lửa lao tới,
  // bị chiếu laser) vừa kêu thì các tiếng phụ (ping báo vị trí, địch đến gần...) im trong ~1.5 s thay vì chồng lên nhau.
  // Xe tăng thật chỉ có vài tiếng báo trong tai nghe, mỗi tiếng một ý nghĩa rõ ràng.
  // prio: 5 tên lửa lao tới · 4 bị khóa / chiếu laser · 3 đầu dò tên lửa của mình · 2 thao tác khóa mục tiêu · 1 thông tin
  beepOk(kind, gap = 0, prio = 1) {
    const t = this.ctx.currentTime;
    const B = this._beep || (this._beep = { last: {}, hiT: -99, hiP: 0 });
    const last = B.last[kind] === undefined ? -99 : B.last[kind];
    if (t - last < gap) return false;
    if (prio < B.hiP && t - B.hiT < 1.5) return false;
    B.last[kind] = t;
    if (prio >= B.hiP || t - B.hiT >= 1.5) { B.hiP = prio; B.hiT = t; }
    return true;
  }

  // Cảnh báo radar (giữ cứ điểm sắp thua...): 4 tiếng trầm-cao xen kẽ, dịu (tam giác, không phải sóng vuông chói)
  playRadarAlert() {
    if (!this.ready() || !this.beepOk('radar', 6, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    for (let i = 0; i < 4; i++) {
      this.tone(out, t + i * 0.11, { type: 'triangle', freq: i % 2 ? 1250 : 950, gain: 0.08, attack: 0.004, hold: 0.07, dur: 0.02 });
    }
  }

  // Địch (đã biết vị trí) vừa áp sát: 1 (hoặc 2 khi rất gần) tiếng báo khẽ, không lặp liên tục
  playRadarProximityBeep(urgency = 1) {
    if (!this.ready() || !this.beepOk('prox', 6, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    const f = urgency > 1.5 ? 1320 : 1050;
    this.tone(out, t, { freq: f, gain: 0.1, attack: 0.006, hold: 0.06, dur: 0.05 });
    if (urgency > 1.5) this.tone(out, t + 0.14, { freq: f, gain: 0.1, attack: 0.006, hold: 0.06, dur: 0.05 });
  }

  // Đếm ngược vào trận: n = 3/2/1 bíp ngắn, n = 0 tiếng xuất kích dài + trầm
  playCountdownTick(n) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.8, wet: 0.3 });
    if (n > 0) {
      this.tone(out, t, { freq: 880, gain: 0.16, attack: 0.003, hold: 0.11, dur: 0.08 });
      return;
    }
    this.tone(out, t, { freq: 1320, gain: 0.15, attack: 0.003, hold: 0.42, dur: 0.3 });
    this.tone(out, t, { freq: 660, gain: 0.1, attack: 0.003, hold: 0.42, dur: 0.3 });
    this.tone(out, t, { type: 'triangle', freq: 110, gain: 0.22, attack: 0.005, hold: 0.25, dur: 0.4 });
  }

  // Khóa mục tiêu (TAB): 2 tiếng "tích" ngắn của máy ngắm
  playTargetLockSound() {
    if (!this.ready() || !this.beepOk('lock', 0.3, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    for (let i = 0; i < 2; i++) {
      this.tone(out, t + i * 0.08, { type: 'triangle', freq: 1000, gain: 0.06, attack: 0.003, hold: 0.035, dur: 0.02 });
    }
  }

  // Xác nhận (hạ càng xong, chiếm được cứ điểm): một tiếng liền ngắn
  playTargetLockAcquired() {
    if (!this.ready() || !this.beepOk('ack', 0.5, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    this.tone(out, t, { type: 'triangle', freq: 1480, gain: 0.06, attack: 0.006, hold: 0.22, dur: 0.05 });
  }

  playTargetLost() {
    if (!this.ready() || !this.beepOk('lost', 1, 2)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    this.tone(out, t, { freq: 1100, gain: 0.09, attack: 0.005, hold: 0.08, dur: 0.03 });
    this.tone(out, t + 0.13, { freq: 740, gain: 0.09, attack: 0.005, hold: 0.1, dur: 0.04 });
  }

  // Đổi loại đạn: cơ cấu thật của từng loại (âm thanh cơ khí từ nhiễu lọc)
  //  pháo chính: khay chọn đạn trượt + chốt; súng máy: gạt bộ chọn băng; tên lửa: mô-tơ mở nắp ống phóng + chốt
  playAmmoSwitch(ammoType = 'NORMAL') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    // đủ to để nghe được trên nền tiếng máy không tải (trước đây nhỏ hơn tiếng máy ~3 dB: gần như không nghe thấy)
    const out = this.voice({ bus: this.weaponBus, gain: 3, wet: 0.04 });
    const clack = (tt, f, g) => {
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, Q: 1.8, gain: g, attack: 0.0006, dur: 0.03 });
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: g * 1.2, attack: 0.001, dur: 0.05 });
    };
    if (ammoType === 'ANTI_TANK_MISSILE') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 380, freqEnd: 1300, sweep: 0.32, Q: 8, gain: 0.07, attack: 0.08, dur: 0.32 });
      clack(t + 0.34, 1300, 0.16);
      // đầu dò bật nguồn: tiếng rít điện tử khẽ qua tai nghe
      this.tone(this.headset(0.6), t + 0.42, { type: 'sine', freq: 2400, freqEnd: 3100, sweep: 0.18, gain: 0.025, attack: 0.02, hold: 0.12, dur: 0.06 });
    } else if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY') {
      clack(t, 2100, 0.12);
      clack(t + 0.07, 1500, 0.1);
    } else {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, freqEnd: 950, sweep: 0.16, Q: 2.4, gain: 0.07, attack: 0.01, dur: 0.16 });
      clack(t + 0.18, 1100, 0.16);
    }
  }

  // Đầu dò tên lửa đang bám mục tiêu: tiếng "gừ" ngắt quãng, cao dần khi gần khóa xong (progress 0..1)
  playMissileSeek(progress = 0) {
    if (!this.ready() || !this.beepOk('seek', 0, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.7);
    const f = 420 + progress * 380;
    this.tone(out, t, { type: 'triangle', freq: f, gain: 0.05, attack: 0.006, hold: 0.07, dur: 0.02, vibrato: 38, vibratoDepth: f * 0.06 });
  }

  // Đầu dò đã khóa chắc mục tiêu: tiếng "tít" liền, cao và sạch
  playMissileLock() {
    if (!this.ready() || !this.beepOk('mlock', 0.3, 3)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.75);
    this.tone(out, t, { type: 'triangle', freq: 1760, gain: 0.06, attack: 0.005, hold: 0.36, dur: 0.05 });
  }

  // Đã khóa, chờ phóng: nhắc rất khẽ để biết vẫn đang giữ khóa
  playMissileLockHold() {
    if (!this.ready() || !this.beepOk('mhold', 1.5, 1)) return;
    const t = this.ctx.currentTime;
    this.tone(this.headset(0.5), t, { freq: 1760, gain: 0.035, attack: 0.004, hold: 0.05, dur: 0.03 });
  }

  // Máy báo bị chiếu laser: m = 1 khóa súng (2 tiếng trầm-cao), m = 2 tia dẫn tên lửa (3 tiếng nhanh, cao hơn)
  playLockWarning(m = 1) {
    if (!this.ready() || !this.beepOk('lw' + m, m === 2 ? 0.8 : 2.5, 4)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.85);
    if (m === 2) {
      for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.1, { type: 'triangle', freq: 1500, gain: 0.08, attack: 0.003, hold: 0.05, dur: 0.02 });
    } else {
      this.tone(out, t, { type: 'triangle', freq: 880, gain: 0.07, attack: 0.003, hold: 0.08, dur: 0.02 });
      this.tone(out, t + 0.13, { type: 'triangle', freq: 1175, gain: 0.07, attack: 0.003, hold: 0.08, dur: 0.02 });
    }
  }

  // Tên lửa đang lao tới: cặp tiếng trầm-cao luân phiên "bíp-bốp" của máy báo động trong xe, dồn nhanh dần khi tên
  // lửa tới gần (urgency 0..1; game.js gọi mỗi 0.7 -> 0.3 s). Bản cũ là sóng vuông 1.7-2.2 kHz trượt giọng, gọi tới
  // 11 lần/giây -> nghe như còi rè chói tai. Âm tam giác cho tiếng tròn mà vẫn nổi rõ hơn mọi tiếng báo khác
  playMissileWarning(urgency = 0) {
    if (!this.ready() || !this.beepOk('mwarn', 0.25, 5)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.9);
    const u = Math.max(0, Math.min(1, urgency));
    const lo = 880 + u * 160, hi = lo * 1.335;   // quãng 4 đúng: rõ, không chát như quãng 2 / quãng 7
    const len = 0.085 - u * 0.025;
    this.tone(out, t, { type: 'triangle', freq: hi, gain: 0.085, attack: 0.004, hold: len, dur: 0.025 });
    this.tone(out, t + len + 0.03, { type: 'triangle', freq: lo, gain: 0.085, attack: 0.004, hold: len, dur: 0.03 });
  }

  // Bộ đàm: tiếng xẹt mở kênh + tiếng bíp xác nhận + xẹt đóng kênh
  playRadioChirp() {
    if (!this.ready() || !this.beepOk('radio', 3, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.headset(0.8);
    this.burst(out, t, { filter: 'bandpass', freq: 1900, Q: 0.8, gain: 0.1, dur: 0.07 });
    this.tone(out, t + 0.07, { freq: 1450, gain: 0.07, attack: 0.004, hold: 0.06, dur: 0.03 });
    this.burst(out, t + 0.16, { filter: 'bandpass', freq: 2300, Q: 0.8, gain: 0.06, dur: 0.12 });
  }

  // Báo vị trí địch (radar trinh sát / đồng đội báo qua bộ đàm): 1 tiếng ping khẽ, tối đa ~1 lần mỗi 8 s —
  // đồng đội báo dồn dập thì chỉ kêu lần đầu, phần còn lại đọc trên bảng tin
  playReconPing() {
    if (!this.ready() || !this.beepOk('ping', 8, 1)) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.6, wet: 0.5 });
    this.tone(out, t, { freq: 1480, gain: 0.1, attack: 0.004, hold: 0.04, dur: 0.25 });
    this.tone(out, t + 0.32, { freq: 1480, gain: 0.03, attack: 0.004, hold: 0.03, dur: 0.2 });
  }

  // Kèn đồng chiến thắng: hợp âm trưởng phồng dần, âm sắc kèn đồng
  playVictoryFanfare() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.uiBus, gain: 0.5, wet: 0.5 });
    const notes = [[261.6, 0], [329.6, 0.18], [392.0, 0.36], [523.3, 0.54]];
    for (const [f, d] of notes) {
      for (const det of [-4, 4]) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(600, t + d);
        lp.frequency.linearRampToValueAtTime(2600, t + d + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.linearRampToValueAtTime(0.09, t + d + 0.08);
        g.gain.setValueAtTime(0.09, t + 1.6);
        g.gain.setTargetAtTime(0.0001, t + 1.6, 0.25);
        osc.connect(lp);
        lp.connect(g);
        g.connect(out);
        osc.start(t + d);
        osc.stop(t + 2.8);
      }
    }
  }

  // Lá cây, cành nhỏ cọ xát khi xe lách vào bụi rậm
  playBushRustle() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.vehicleBus, gain: 0.9, wet: 0.1 });
    this.burst(out, t, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3600, Q: 0.6, gain: 1.6, attack: 0.06, dur: 0.5 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 700, Q: 0.9, gain: 0.16, attack: 0.08, dur: 0.38 });
    if (Math.random() < 0.5) this.snap(out, t + 0.05 + Math.random() * 0.2, 0.12, 5000, 1.5);
  }
});
