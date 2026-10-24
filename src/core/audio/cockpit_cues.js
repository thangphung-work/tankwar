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
   * - GATLING (băng đạn 450 viên không mắt xích) 'magOut' / 'magIn'. Xe trinh sát (SCOUT) KHÔNG dùng hàm này: xem playScoutReload
   * - MG762 (trạm súng máy 7.62mm điều khiển từ xa trên nóc tháp xe tăng): kíp xe phải mở nắp tháp, với tay ra thay hộp
   *   'magOut' nắp tháp bật mở + gió / tiếng ngoài trời tràn vào, nắp hộp tiếp đạn bật, hộp rỗng rút ra
   *   'magIn'  hộp mới cài khay, dây đạn nhỏ lách tách, đóng nắp, mô-tơ lên đạn điện "rè-cạch", nắp tháp đóng sập
   * - Ống phóng tên lửa trên nóc xe trinh sát: xem playAtgmReload (từng bước theo hoạt cảnh)
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
   * Xe trinh sát: xạ thủ đứng ở lỗ nóc thay đạn bằng tay ngoài trời — không phải khối khóa nòng thép nặng trong khoang
   * xe tăng (clunk của playReloadPhase), mà là đồ thép nhỏ: nắp khóa nòng lò xo, hộp đạn thép rỗng ruột, dây mắt xích,
   * tay kéo lên đạn. spg.js gọi từng bước đúng lúc hoạt cảnh (recon_marten / vehicle_crew MG_KEYS) tới mốc đó, nên tiếng
   * luôn khớp hình kể cả khi nạp bị dừng (xạ thủ hy sinh) hay đổi thời gian nạp.
   * step: 'coverOpen' | 'boxOut' | 'boxDrop' | 'boxGrab' | 'boxSeat' | 'lidOpen' | 'belt' | 'coverClose' | 'pull' | 'release'
   *       | 'chamber' (lần buông thứ 2: đẩy viên vào buồng) | giàn rocket: 'rLift' | 'rPush' | 'rSeat'
   * kind: 'hmg' (12.7 mặc định) | 'agl' (phóng lựu 40mm: nắp, hộp, mắt xích to & nặng hơn -> trầm hơn) | 'rocket'
   * dur: thời gian còn lại của bước (s) để kéo dài / co tiếng trượt cho khớp hình
   */
  /**
   * Nạp ống phóng tên lửa trên nóc xe trinh sát — từng bước đúng lúc hoạt cảnh (vehicle_crew AT) tới mốc, spg.js gọi.
   * Toàn tiếng cơ khí ngoài trời: chốt, ống composite rỗng, thép đập thép. Không còn tiếng "con quay rít cao dần + bíp"
   * (sóng sin quét 600 -> 2600 Hz nghe thành tiếng huýt giả, đầu dò thật không rít to tới mức nghe được ngoài xe)
   * step: 'capOpen' | 'yank' (giật vỏ rỗng ra) | 'toss' (vứt vỏ) | 'lift' (nhấc quả mới qua lỗ nóc) | 'push' (tống vào ống)
   *       | 'seat' (đập vào chốt hãm) | 'capClose' | 'ready' (giắc điện / rơ-le hệ điều khiển)
   */
  playAtgmReload(step) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.weaponBus, gain: 0.55, wet: 0.1 });
    const R = Math.random;
    const click = (tt, f, g) => {
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f * 2.2, Q: 1.4, gain: g * 0.9, attack: 0.0004, dur: 0.018 });
      this.metal(out, tt, { f0: f, ratios: [1, 2.3, 4.1], decay: 0.06, gain: g * 0.35, click: 0.6 });
    };
    // ống composite / vỏ chứa rỗng: "bộp" rỗng, khô (không ngân như thép)
    const tube = (tt, rate, g, lp = 0) => this.playCaseHit(out, tt, 'debrisCan', rate, g, lp);
    // vật dài trượt trong ống: xẹt nhanh, cao độ đi theo tốc độ
    const rush = (tt, f0, f1, d, g) => this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0, freqEnd: f1, sweep: d, Q: 1.6, gain: g, attack: d * 0.15, dur: d });
    // cú đập nặng (thân người + quả 30 kg dồn vào): "THỤC" trầm khô
    const thud = (tt, f, g) => this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: f, drive: 2, gain: g, attack: 0.001, dur: 0.09 });
    switch (step) {
      case 'capOpen':
        click(t, 1600, 0.35);                                        // gạt lẫy nắp đuôi
        this.playCaseHit(out, t + 0.12, 'debrisMetal', 0.9, 0.12);   // nắp bật hết bản lề
        break;
      case 'yank':
        click(t, 1300, 0.3);                                         // nhả chốt giữ vỏ
        rush(t + 0.01, 900, 450, 0.3, 0.16);                         // vỏ rỗng vọt ra khỏi ống
        tube(t + 0.02, 1.25, 0.14);
        thud(t + 0.3, 300, 0.25);                                    // tay hãm lại cuối tầm
        break;
      case 'toss':
        tube(t + 0.32, 1.0, 0.3, 6000);                              // vỏ rỗng rơi xuống đất / nóc xe "bộp"
        tube(t + 0.5 + R() * 0.05, 1.12, 0.1, 5000);                 // nảy lăn
        break;
      case 'lift':
        tube(t, 1.3, 0.08, 4500);                                    // ống chứa quả mới cạ mép lỗ nóc
        rush(t + 0.05, 500, 380, 0.25, 0.04);
        break;
      case 'push':
        rush(t, 380, 1000, 0.32, 0.18);                              // quả mới tống vào ống, tăng tốc
        break;
      case 'seat':
        thud(t, 260, 1.0);                                           // đập vào chốt hãm: "THỤC"
        this.playCaseHit(out, t, 'debrisMetalHull', 0.75, 0.35);     // giá phóng thép rung theo
        tube(t + 0.004, 0.9, 0.25);
        click(t + 0.03, 1800, 0.55);                                 // chốt hãm sập "CẠCH"
        if (this.duck) this.duck(0.85, 0.15);
        break;
      case 'capClose':
        this.playCaseHit(out, t, 'debrisMetal', 0.85, 0.2);          // đóng sập nắp đuôi
        click(t + 0.015, 1500, 0.4);
        break;
      case 'ready':
        click(t, 3200, 0.14);                                        // giắc điện cắm
        // rơ-le hệ điều khiển đóng: 2 tiếng "tách" khô trong hộp điện (không còn bíp / rít)
        this.burst(out, t + 0.18, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 4200, Q: 2, gain: 0.12, attack: 0.0003, dur: 0.008 });
        this.burst(out, t + 0.26, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3800, Q: 2, gain: 0.1, attack: 0.0003, dur: 0.008 });
        break;
    }
  }

  /**
   * Xạ thủ trên nóc trúng đạn / mảnh hy sinh — khớp hoạt cảnh vehicle_crew (giật ngửa 0.25 s -> gục lên súng -> 2.4 s đổ
   * sụp xuống lòng xe):
   *  (1) đạn / mảnh vào người qua áo giáp: "phập" đục ướt + tiếng tấm giáp bị đập; (2) GIỌNG NGƯỜI (vox — tổng hợp formant,
   *  không phải sóng quét): "hự!" bật hơi lúc trúng, rồi tùy phát: chết ngay (chỉ còn hơi thở hắt ra) / gào đau "áaa!" rồi
   *  rên "ựa…" / rên ư ử gục xuống; giọng nhỏ & tắt nhanh theo khoảng cách hơn tiếng súng (tai người ngoài ~30 m khó nghe
   *  rõ); (3) mũ sắt / súng cá nhân va vào súng 12.7 & tấm chắn "cộp-keng", dây đạn lách cách;
   *  (4) thân người trượt xuống lòng xe: sột soạt vải + đồ trên áo giáp, rơi "huỵch" đục vào sàn thép.
   * own: xe mình — nghe rõ trong khoang + tín hiệu bộ đàm báo thương vong (2 tiếng bíp trầm, rè sóng)
   */
  playGunnerDown(distance = 0, pos = null, own = false) {
    if (!this.ready()) return;
    const sp = own ? { gain: 1, lowpass: 20000, wet: 0.1, delay: 0, pan: 0 } : this.spatial(distance, pos);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + (sp.delay || 0);
    const out = this.voice({ bus: own ? this.weaponBus : null, gain: sp.gain * (own ? 0.8 : 0.6), lowpass: sp.lowpass, wet: Math.max(0.1, sp.wet || 0), pan: sp.pan || 0 });
    const R = Math.random;
    // (1) trúng người: thụp đục ướt (dải trầm, tắt rất nhanh) + giáp mềm / tấm gốm bị đập "bộp"
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520, drive: 1.8, gain: 0.9, attack: 0.0008, dur: 0.06 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 1.2, gain: 0.35, attack: 0.0005, dur: 0.035 });
    this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3200, Q: 2, gain: 0.12, attack: 0.0003, dur: 0.012 });
    // (2) GIỌNG: chỉ nghe được ở gần (xe mình / trong ~280 đv) — tiếng người nhỏ hơn hẳn tiếng súng, tắt nhanh theo khoảng cách
    if (own || distance < 280) {
      const vg = own ? 1 : Math.max(0, 1 - distance / 280) * 0.9;
      const vo = this.voice({ bus: own ? this.weaponBus : null, gain: sp.gain * 0.22 * vg, lowpass: own ? 9000 : Math.min(sp.lowpass, 6500), wet: Math.max(0.12, sp.wet || 0), pan: sp.pan || 0 });
      const k = 0.92 + R() * 0.16;   // mỗi người một giọng (cao / trầm chút)
      // "hự!": hơi bị ép bật khỏi ngực khi trúng — ngắn, gắng, tắc cổ họng (dừng đột ngột)
      this.vox(vo, t + 0.03, { dur: 0.17, f0: [[0, 185 * k], [0.3, 230 * k], [1, 150 * k]], vowel: [[0, 640, 1190, 2390], [1, 420, 1300, 2400]],
        amp: [[0.06, 0.9], [0.55, 0.75], [0.8, 0.5], [0.86, 0.0001]], breath: 0.4, rough: 0.35 });
      const r = R();
      if (r < 0.35) {
        // gào đau "áaa-ạ!": cao, căng, rè cổ — rồi rên hắt "ựa…" khi gục lên súng
        this.vox(vo, t + 0.24, { dur: 0.75, f0: [[0, 290 * k], [0.15, 410 * k], [0.6, 370 * k], [1, 240 * k]], vowel: [[0, 700, 1150, 2450], [0.7, 730, 1100, 2450], [1, 600, 1200, 2400]],
          amp: [[0.05, 1], [0.6, 0.85], [1, 0.0001]], breath: 0.3, rough: 0.7, gain: 0.9 });
        this.vox(vo, t + 1.15, { dur: 1.1, f0: [[0, 150 * k], [0.25, 165 * k], [1, 92 * k]], vowel: [[0, 330, 1350, 2400], [0.4, 520, 1450, 2450], [1, 640, 1190, 2390]],
          amp: [[0.15, 0.55], [0.5, 0.45], [1, 0.0001]], breath: 0.55, rough: 0.45 });
      } else if (r < 0.75) {
        // rên "ư… ựa": trầm, đứt quãng, hơi thở nặng — yếu dần trong lúc đổ người
        this.vox(vo, t + 0.45, { dur: 0.9, f0: [[0, 160 * k], [0.3, 175 * k], [1, 105 * k]], vowel: [[0, 330, 1350, 2400], [1, 560, 1300, 2420]],
          amp: [[0.2, 0.6], [0.55, 0.5], [1, 0.0001]], breath: 0.5, rough: 0.4 });
        this.vox(vo, t + 1.75, { dur: 0.75, f0: [[0, 140 * k], [1, 88 * k]], vowel: [[0, 360, 1300, 2400], [1, 600, 1200, 2400]],
          amp: [[0.25, 0.35], [1, 0.0001]], breath: 0.65, rough: 0.35 });
      } else {
        // chết ngay: chỉ còn hơi thở hắt ra (không cao độ)
        this.burst(vo, t + 0.3, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, freqEnd: 420, sweep: 0.45, Q: 2.5, gain: 0.12, attack: 0.03, dur: 0.45 });
      }
    }
    // (3) gục lên súng: mũ sắt / súng cá nhân đập vào thân súng & tấm chắn, dây đạn rung
    const tg = t + 0.32 + R() * 0.06;
    this.playCaseHit(out, tg, 'debrisMetal', 0.85, 0.35);
    this.burst(out, tg, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, gain: 0.35, attack: 0.002, dur: 0.07 });
    this.playCaseHit(out, tg + 0.09 + R() * 0.04, 'debrisMetal', 1.4, 0.14);
    for (let i = 0; i < 4; i++) this.playCaseHit(out, tg + 0.03 + i * 0.05 + R() * 0.02, 'debrisLink', 1.7 + R() * 0.5, 0.04, 9000);
    // (4) ~2.4 s: thân người trượt khỏi vòng súng xuống lòng xe
    const tf = t + 2.35;
    this.burst(out, tf, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 0.8, gain: 0.08, attack: 0.08, dur: 0.35 });   // vải sột soạt
    for (let i = 0; i < 3; i++) this.playCaseHit(out, tf + 0.1 + i * 0.09 + R() * 0.03, 'debrisLink', 1.2 + R() * 0.4, 0.05, 7000);    // đồ trên áo giáp
    this.burst(out, tf + 0.42, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200, drive: 1.6, gain: own ? 0.9 : 0.6, attack: 0.003, dur: 0.14 });   // rơi xuống sàn
    this.playCaseHit(out, tf + 0.43, 'debrisMetalHull', 0.7, own ? 0.3 : 0.2);
    if (own) {
      // bộ đàm trong mũ: rè sóng + 2 tiếng bíp trầm báo thương vong
      const rv = this.voice({ bus: this.uiBus || this.weaponBus, gain: 0.45, wet: 0.02 });
      const tr = t + 0.55;
      this.burst(rv, tr, { buffer: this.crackleBuffer || this.pinkNoiseBuffer, filter: 'bandpass', freq: 1800, Q: 0.8, gain: 0.12, attack: 0.005, dur: 0.18 });
      this.tone(rv, tr + 0.2, { type: 'square', freq: 520, gain: 0.025, attack: 0.004, dur: 0.12, filter: 'lowpass', filterFreq: 1800 });
      this.tone(rv, tr + 0.42, { type: 'square', freq: 390, gain: 0.025, attack: 0.004, dur: 0.18, filter: 'lowpass', filterFreq: 1800 });
      if (this.duck) this.duck(0.7, 0.5);
    }
  }

  /**
   * CƠ CẤU SÚNG MÁY ĐẬP THÉP (nắp sập, khối khóa nòng đập chốt): khối thép dày ăn khớp với thân hộp khóa nòng — tiếng
   * đặc, ngắn, dày ở dải trung cao, gần như không ngân (mặt tiếp xúc ép chặt hãm rung ngay). Trước đây có lớp modal ngân
   * 0,2-0,3 s -> nghe như nắp nồi / chuông "keng". Lớp: xung đanh | "chát" 2-4 kHz | "cạch" thân ~1 kHz | thụp trầm | ngân
   * cực ngắn của hộp khóa nòng (50-90 ms). o: { gain, mass (0..1: nặng -> trầm, thụp to), bright (0..1: đanh) }
   */
  gunMech(H, t, { gain = 1, mass = 0.5, bright = 0.6, p = 1 } = {}) {
    const R = Math.random;
    this.snap(H, t, 0.3 * gain * (0.6 + bright), 6000 + 3000 * bright, 1.8);
    this.burst(H, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (2600 + 1200 * bright) * p, Q: 1.1, gain: 0.5 * gain * (0.5 + bright), attack: 0.0002, dur: 0.014 });
    this.burst(H, t + 0.001, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (950 + R() * 250) * p, Q: 2.2, drive: 1.4, gain: 0.55 * gain, attack: 0.0004, dur: 0.028 });
    this.burst(H, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: (170 + 140 * (1 - mass)) * p, drive: 1.8, gain: (0.35 + 0.55 * mass) * gain, attack: 0.0008, dur: 0.05 + 0.03 * mass });
    this.modal(H, t, { f0: (1250 + R() * 200 - 350 * mass) * p, ratios: [1, 2.31, 3.86, 5.62], T: 0.05 + 0.04 * mass, gain: 0.07 * gain, hard: 1, tilt: 0.8, fall: 0.6 });
  }

  /**
   * MA SÁT THÉP TRƯỢT TRÊN THÉP (khối khóa nòng / tay kéo chạy trong rãnh): chuỗi hạt cọ vụn rời rạc, mật độ & cao độ theo
   * tốc độ trượt, nền nhám dải trung thấp — nghe "rrrạch" nhám như cơ khí thật, không phải tiếng "vút" quét nhiễu mượt.
   * d: thời gian trượt; speed: 'up' (tăng tốc: kéo tay) | 'fast' (lò xo phóng về); n: số hạt
   */
  gunRasp(H, t, d, { gain = 1, speed = 'up', n = 0, p = 1 } = {}) {
    const R = Math.random, N = n || Math.max(6, Math.round(d * (speed === 'fast' ? 260 : 120)));
    for (let i = 0; i < N; i++) {
      const u = speed === 'up' ? Math.sqrt((i + R() * 0.8) / N) : (i + R() * 0.8) / N;   // kéo: hạt dày dần
      const tt = t + u * d, k = speed === 'up' ? 0.5 + 0.5 * u : 1;
      this.burst(H, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: (2200 + R() * 3600) * p * (0.85 + 0.3 * k), Q: 3 + R() * 3, gain: (0.05 + R() * 0.07) * gain * k, attack: 0.0003, dur: 0.003 + R() * 0.006 });
    }
    // nền nhám: thân hộp khóa nòng cộng hưởng theo ma sát
    this.burst(H, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 700 * p, freqEnd: (speed === 'up' ? 1100 : 900) * p, sweep: d, Q: 1.6, gain: 0.05 * gain, attack: d * 0.3, dur: d });
  }

  /**
   * GIỌNG NGƯỜI tổng hợp formant: nguồn rung thanh quản (răng cưa, run giọng chậm + rung nhanh, rè dưới bội khi gào) trộn
   * hơi thở (nhiễu hồng), lọc qua 3 cộng hưởng khoang miệng F1-F3 theo nguyên âm, đi theo đường cao độ / nguyên âm / âm
   * lượng. Không dùng sóng quét đơn (nghe như còi). Giọng nam trưởng thành.
   * o: { dur, f0: [[tỉ lệ 0..1, Hz], ...], vowel: [[tỉ lệ, F1, F2, F3], ...], amp: [[tỉ lệ, mức], ...], breath, rough, gain }
   */
  vox(dest, t, o) {
    const ctx = this.ctx, D = o.dur, R = Math.random, end = t + D + 0.05;
    const at = (list, i) => list.forEach(([k, ...v], j) => { if (j) i(t + k * D, v); });
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(o.f0[0][1], t);
    at(o.f0, (tt, [hz]) => src.frequency.linearRampToValueAtTime(hz, tt));
    // run giọng (vibrato chậm 5-7 Hz) + rung nhanh không đều (đau / gắng sức)
    const lfo = (type, f, depth) => { const l = ctx.createOscillator(); l.type = type; l.frequency.value = f; const g = ctx.createGain(); g.gain.value = depth; l.connect(g); g.connect(src.frequency); l.start(t); l.stop(end); };
    lfo('sine', 5 + R() * 2, o.f0[0][1] * 0.03);
    lfo('triangle', 13 + R() * 11, o.f0[0][1] * (0.012 + 0.04 * (o.rough || 0)));
    const mix = ctx.createGain();
    const sg = ctx.createGain(); sg.gain.value = 1;
    src.connect(sg); sg.connect(mix);
    if (o.rough) {
      // rè thanh quản khi gào: dưới bội (nửa tần số) + méo nhẹ
      const sub = ctx.createOscillator(); sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(o.f0[0][1] / 2, t);
      at(o.f0, (tt, [hz]) => sub.frequency.linearRampToValueAtTime(hz / 2, tt));
      const sgg = ctx.createGain(); sgg.gain.value = 0.35 * o.rough;
      const ws = ctx.createWaveShaper(); ws.curve = this.getShaper(1.5 + o.rough);
      sub.connect(sgg); sgg.connect(ws); ws.connect(mix);
      sub.start(t); sub.stop(end);
    }
    const nz = ctx.createBufferSource(); nz.buffer = this.pinkNoiseBuffer; nz.loop = true;
    const ng = ctx.createGain(); ng.gain.value = (o.breath || 0.2) * 2.2;
    nz.connect(ng); ng.connect(mix);
    // độ dốc phổ giọng: bớt chói răng cưa
    const tilt = ctx.createBiquadFilter(); tilt.type = 'lowpass'; tilt.frequency.value = 3800; tilt.Q.value = 0.5;
    mix.connect(tilt);
    const env = ctx.createGain(); env.gain.value = 0;
    [[1, 1.0, 70], [2, 0.5, 100], [3, 0.22, 150]].forEach(([fi, amp, bw]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(o.vowel[0][fi], t);
      at(o.vowel, (tt, v) => bp.frequency.linearRampToValueAtTime(v[fi - 1], tt));
      bp.Q.value = o.vowel[0][fi] / bw;
      const g = ctx.createGain(); g.gain.value = amp * 3.2;
      tilt.connect(bp); bp.connect(g); g.connect(env);
    });
    const G = o.gain || 1;
    env.gain.setValueAtTime(0.0001, t);
    o.amp.forEach(([k, a]) => env.gain.linearRampToValueAtTime(Math.max(0.0001, a * G), t + k * D));
    env.connect(dest);
    src.start(t); src.stop(end); nz.start(t, R() * 2); nz.stop(end);
  }

  playScoutReload(step, kind = 'hmg', dur = 0.3) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    // ngoài trời, cách cabin một lớp nóc mở: ít ù khoang, có chút vang không gian
    const out = this.voice({ bus: this.weaponBus, gain: 0.5, wet: 0.1 });
    const R = Math.random;
    const p = kind === 'agl' ? 0.78 : 1;      // độ cao tiếng theo cỡ súng
    // chốt / lẫy thép nhỏ: "tách" khô
    const click = (tt, f, g) => {
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f * 2.2, Q: 1.4, gain: g * 0.9, attack: 0.0004, dur: 0.018 });
      this.metal(out, tt, { f0: f, ratios: [1, 2.3, 4.1], decay: 0.06, gain: g * 0.35, click: 0.6 });
    };
    // thép đập thép (nắp sập, khối khóa nòng bật về): "cạch" đanh, có tí ngân của thân súng
    const snapSteel = (tt, rate, g) => {
      this.playCaseHit(out, tt, 'debrisMetal', rate * p, g);
      this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 2600 * p, Q: 1, gain: g * 0.5, attack: 0.0003, dur: 0.02 });
    };
    // hộp đạn thép (vỏ mỏng, rỗng ruột khi hết đạn -> "boong"; đầy đạn -> đục hơn)
    const can = (tt, rate, g, hull = false, lp = 0) => this.playCaseHit(out, tt, hull ? 'debrisCanHull' : 'debrisCan', rate * p, g, lp);
    // mắt xích dây đạn lách cách
    const links = (tt, n, span, g) => {
      for (let i = 0; i < n; i++) this.playCaseHit(out, tt + (i + R() * 0.6) * span / n, 'debrisLink', (1.5 + R() * 0.6) * p, g * (0.6 + R() * 0.5), 9000);
    };
    // kim loại trượt trên kim loại
    const scrape = (tt, f0, f1, d, g) => this.burst(out, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0 * p, freqEnd: f1 * p, sweep: d, Q: 2.2, gain: g, attack: d * 0.25, dur: d });
    const D = Math.max(0.05, dur);
    switch (step) {
      case 'coverOpen':
        click(t, 2100, 0.35);                         // ấn lẫy nắp
        scrape(t + 0.02, 1300, 900, 0.1, 0.05);       // bản lề
        snapSteel(t + Math.min(0.2, D * 0.7), 1.3, 0.12);   // nắp dựng hết cỡ, chạm chốt chặn
        break;
      case 'beltOut': {
        // Nhấc dây cũ khỏi khay rồi kéo phần đuôi rỗng về hộp: ít mắt xích hơn dây mới, nhịp rời rạc và có cú viên
        // cuối / lẫy giữ bật khỏi khay. Tách riêng khỏi `belt` để không nghe như đang lắp dây hai lần.
        const d = Math.min(0.42, D);
        click(t, 1850, 0.16);
        links(t + 0.025, 6, d * 0.82, 0.045);
        scrape(t + 0.035, 2100, 1150, d * 0.72, 0.022);
        click(t + d * 0.86, 2700, 0.13);
        break;
      }
      case 'boxOut':
        click(t, 1700, 0.3);                          // nhả kẹp hộp khỏi khay
        scrape(t + 0.05, 800, 550, Math.min(0.35, D), 0.06);
        can(t + 0.06, 1.25, 0.06);
        links(t + 0.1, 3, 0.25, 0.05);                // đuôi dây rỗng lủng lẳng
        break;
      case 'boxDrop':
        // Xạ thủ vẫn đỡ hộp tới sát sàn: cú chạm đầu nặng vừa phải, sau đó cạnh hộp nghiêng chạm sàn một lần.
        // Không còn tiếng "ném hộp" quá lớn so với chuyển động hình.
        can(t + 0.11, 0.92, 0.30, true, 4300);
        can(t + 0.25 + R() * 0.035, 1.12, 0.09, true, 3500);
        break;
      case 'boxGrab':
        click(t, 1300, 0.18);                         // quai hộp bật lên
        can(t + 0.08, 0.72, 0.075, false, 4200);       // hộp đầy chỉ xê nhẹ trước khi được nhấc
        links(t + 0.12, 4, 0.22, 0.026);               // khối dây đạn nặng xô đục, không leng keng lớn
        break;
      case 'boxSeat':
        can(t, 0.76, 0.25);                           // đáy hộp đầy đặt lên khay: trầm, ngắn
        links(t + 0.02, 2, 0.06, 0.04);
        click(t + Math.min(0.14, D * 0.6), 1800, 0.35);   // kẹp hộp khóa vào khay
        break;
      case 'lidOpen':
        click(t, 2000, 0.3);                          // lẫy nắp hộp
        this.burst(out, t + 0.03, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: 0.25, attack: 0.002, dur: 0.05 });   // gioăng cao su bật "bụp"
        this.playCaseHit(out, t + 0.12, 'debrisMetal', 1.6 * p, 0.05);   // nắp lật ngửa chạm thành hộp
        break;
      case 'belt': {
        // bốc đầu dây, kéo dây qua miệng hộp đặt vào khay nạp: mắt xích lách cách dày rồi thưa
        const d = Math.min(0.6, D);
        links(t, 11, d, 0.06);
        scrape(t + 0.02, 1500, 2200, d * 0.9, 0.035);
        click(t + d, 2400, 0.2);                      // viên đầu tì vào lẫy giữ đạn
        break;
      }
      // ---- 3 tiếng "đinh" của lượt thay đạn: cơ cấu thép dày đập nhau (gunMech — đặc, ngắn, không ngân như nồi), ma sát
      //      trượt nhám (gunRasp), lẫy / lò xo ăn khớp tích-tách. Kênh to hơn, vang nhẹ hơn các tiếng lặt vặt khác
      case 'coverClose': {
        const H = this.voice({ bus: this.weaponBus, gain: 0.8, wet: 0.12 });
        const ti = t + 0.06;
        // tay ấn nắp xuống: bản lề cọ khô ngắn (nắp M2 nặng ~1 kg, đóng bằng cú ấn dứt khoát)
        this.gunRasp(H, t, 0.05, { gain: 0.5, speed: 'fast', n: 6, p });
        // SẬP: nắp thép đập lên mép hộp khóa nòng — "CẠCH" đặc, thụp vừa
        this.gunMech(H, ti, { gain: 0.85, mass: 0.35, bright: 0.7, p });
        // lẫy khóa nắp trượt vào khấc lò xo: "tách" kép ngay sau cú sập
        click(ti + 0.016, 2400, 0.3);
        click(ti + 0.03, 1800, 0.18);
        links(ti + 0.008, 2, 0.05, 0.03);             // dây đạn dưới nắp bị ép lách cách
        break;
      }
      case 'pull': {
        // KÉO KHÓA NÒNG: găng tay chộp tay kéo -> giật lùi: khối khóa nòng ~10 kg trượt trong rãnh, ma sát nhám dày dần theo
        // tốc độ (lò xo đẩy về bị nén cứng dần) -> cuối hành trình khối khóa nòng chạm đệm đuôi "thục" đục (có đệm giảm chấn,
        // không đanh như lúc phóng về)
        const H = this.voice({ bus: this.weaponBus, gain: 0.75, wet: 0.1 });
        const d = Math.max(0.08, Math.min(0.35, D));
        this.burst(H, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 900, gain: 0.12, attack: 0.001, dur: 0.03 });   // tay chộp tay kéo
        click(t + 0.004, 1500, 0.16);
        this.gunRasp(H, t + 0.012, d, { gain: 1, speed: 'up', p });
        // cuối hành trình: chạm đệm đuôi — đục, nặng, ít chói
        this.gunMech(H, t + d + 0.012, { gain: 0.55, mass: 0.8, bright: 0.25, p });
        if (kind !== 'agl') links(t + d * 0.7, 1, 0.01, 0.06);   // viên đầu bị rút khỏi dây
        break;
      }
      case 'release':
      case 'chamber': {
        // BUÔNG: lò xo phóng khối khóa nòng về trước (~0,03 s rít nhám rất nhanh) đập khóa "CHÁT" — cú to nhất của lượt thay
        // đạn, cả giá súng rung theo; lần 2 (chamber) khối khóa nòng đẩy viên đạn đồng vào buồng ngay trước cú đập, đập chắc
        // hơn, rồi lẫy khóa nòng ăn khớp — tiếng "đã tai" báo súng sẵn sàng
        const ch = step === 'chamber';
        const H = this.voice({ bus: this.weaponBus, gain: ch ? 0.95 : 0.85, wet: 0.14 });
        this.gunRasp(H, t, 0.026, { gain: 0.7, speed: 'fast', p });
        const ti = t + 0.028;
        if (ch) this.playCaseHit(H, ti - 0.01, 'debrisLink', 2.4 * p, 0.1, 9000);   // đầu đạn đồng trượt vào buồng
        this.gunMech(H, ti, { gain: ch ? 1.15 : 1, mass: 0.75, bright: 0.9, p });
        this.playCaseHit(H, ti, 'debrisMetalHull', 0.95 * p, ch ? 0.22 : 0.16);   // giá súng / vòng súng rung theo
        click(ti + 0.007, 1300, 0.22);                 // tay kéo đập đầu rãnh phía trước
        if (ch) {
          click(ti + 0.022, 2100, 0.3);                // lẫy khóa nòng ăn khớp
          if (this.duck) this.duck(0.82, 0.18);        // khoảnh khắc "súng sẵn sàng" nổi lên trên các tiếng khác
        }
        break;
      }
      // giàn rocket: mỗi quả cúi xuống lòng xe nhấc lên -> bê ra đuôi ống -> đẩy vào ống, chốt hãm ăn khớp
      case 'rOpen':
        click(t, 1750, 0.2);                           // bóp / giật lẫy nắp đuôi
        this.gunRasp(out, t + 0.025, Math.min(0.16, D), { gain: 0.32, speed: 'fast', p: 0.8 });
        this.playCaseHit(out, t + Math.min(0.18, D * 0.8), 'debrisMetal', 1.05, 0.1); // nắp chạm cữ mở
        break;
      case 'rLift':
        can(t, 1.35, 0.055, true, 4200);              // đệm thân quả chạm nhẹ mép lỗ nóc
        scrape(t + 0.05, 520, 360, 0.2, 0.028);
        break;
      case 'rPush':
        can(t, 1.2, 0.06);                            // vành quả tì vào miệng ống
        scrape(t + 0.03, 420, 760, Math.min(0.48, D), 0.065); // đai dẫn hướng trượt trong ống
        break;
      case 'rSeat':
        this.playCaseHit(out, t, 'debrisMetal', 0.82, 0.14);  // đai chặn quả chạm vai trong ống
        click(t + 0.045, 1850, 0.24);                 // chốt giữ quả bật vào rãnh
        click(t + 0.11, 3000, 0.1);                   // tiếp điểm điện đánh lửa ăn khớp
        break;
      case 'rLock':
        this.gunRasp(out, t, 0.055, { gain: 0.28, speed: 'fast', p: 0.9 });
        this.playCaseHit(out, t + 0.045, 'debrisMetalHull', 1.0, 0.12); // nắp đuôi ép sát vành ống
        click(t + 0.07, 2200, 0.25);                  // lẫy khóa nắp
        break;
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
