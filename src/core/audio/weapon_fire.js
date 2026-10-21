/**
 * ÂM THANH VŨ KHÍ: khai hỏa pháo chính, vụ nổ đạn pháo / tên lửa / đạn chùm, tên lửa chống tăng.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 1. KHAI HỎA PHÁO CHÍNH (120mm xe tăng / 155mm pháo tự hành)
  // ===========================================================================
  // opts.chargeMul: hệ số sơ tốc theo liều phóng lựu pháo (1 = liều đầy ... 0,34 = liều nhỏ nhất)
  playCannonFire(tankType = 'ALL_ROUNDER', ammoType = 'NORMAL', distance = 0, pos = null, opts = {}) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.45, delay: 0, pan: 0 };
    const arty = tankType === 'ARTILLERY';
    // Liều phóng nhỏ = ít thuốc phóng hơn hẳn (liều 5 chỉ ~1/5 lượng thuốc của liều đầy): tiếng nổ đầu nòng nhỏ,
    // ít trầm, rền ngắn hơn. Trước đây liều nào cũng nổ to y như liều đầy
    const cm = arty ? Math.max(0.3, Math.min(1, (opts && opts.chargeMul) || 1)) : 1;
    sp.gain *= 0.5 + 0.5 * cm;
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + sp.delay;
    const s = arty ? 1.7 * (0.55 + 0.45 * cm) : 1.15;
    // Mức đưa vào thấp có chủ đích (xem playExplosionAtDistance): giữ cú đấm, không bị ép bẹt ở đầu ra.
    // Phát bắn của chính mình đi qua "blastBus" (bão hòa nhẹ cả cụm): các lớp quyện vào nhau thành một khối đặc, dày
    // Ngắm qua kính (trong xe): tiếng nổ đầu nòng vọng vào qua vỏ thép bớt chói, lớp tiếng trong khoang gánh cú đấm
    const inside = !remote && this.interior;
    const out = this.voice({ bus: remote ? null : this.blastBus(arty), gain: sp.gain * (remote ? 0.2 : arty ? 0.2 : 0.22), lowpass: inside ? 8000 : sp.lowpass, wet: Math.max(inside ? 0.25 : 0.45, sp.wet), pan: sp.pan });
    if (inside && this.interiorShot) this.interiorShot(arty ? 'arty' : 'cannon', t);

    if (!this.playSample(arty ? 'artillery_fire' : 'cannon_fire', out, t, { gain: 1.3 })) {
      // Pháo khai hỏa: xung nén đầu nòng cực gắt (đỉnh ngay ms đầu) -> khí thuốc phóng phụt "ĐÙNG" trầm dày
      // -> rền cuộn. Pháo 155 có hãm nòng: sóng nổ hắt ngang dữ dội, thân tiếng dài và nặng hơn
      const W = this.stereoSpread(out, arty ? 0.7 : 0.5);
      this.snap(out, t, 1.9 * s, 7500, 5);
      this.burst(out, t, { filter: 'bandpass', freq: arty ? 1900 : 2500, Q: 0.6, drive: 3, gain: 0.9 * s, attack: 0.0004, dur: 0.045 });
      // Sức ép nổ thuốc phóng (2 kênh lệch nhau)
      for (const ch of [W.L, W.R]) {
        this.burst(ch, t, { filter: 'lowpass', freq: 6000, freqEnd: 280, sweep: 0.09, drive: 3, gain: 1.1 * s, attack: 0.0005, dur: arty ? 0.32 : 0.24 });
        this.burst(ch, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 1500, freqEnd: 90, sweep: 0.55, drive: 2.5, gain: (arty ? 0.9 : 1.5) * s, attack: 0.001, dur: arty ? 0.8 : 0.62 });
      }
      // Cú đấm ngực 40-130 Hz
      this.tone(out, t, { freq: arty ? 115 : 130, freqEnd: arty ? 42 : 48, sweep: 0.17, drive: 3, gain: (arty ? 0.95 : 1.4) * s, attack: 0.0008, dur: arty ? 0.48 : 0.36 });
      this.tone(out, t, { freq: arty ? 62 : 70, freqEnd: arty ? 34 : 38, sweep: 0.4, drive: 2, gain: (arty ? 0.4 : 1.0) * s, attack: 0.002, dur: arty ? 0.75 : 0.55 });
      // Thân "ĐÙM" 110-160 Hz: dải trầm mà loa laptop / điện thoại vẫn phát được -> sức nặng
      this.burst(out, t + 0.001, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 125 : 155, freqEnd: arty ? 90 : 110, sweep: 0.4, Q: 0.9, drive: 1.8, gain: 4.0 * s, attack: 0.002, dur: arty ? 0.75 : 0.5 });
      // Sóng nổ dội từ mặt đất + thân xe "hự" theo sau ~18 ms: thành 2 lớp đập liền nhau, dày như vụ nổ
      this.burst(out, t + 0.018, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 200 : 240, Q: 0.8, drive: 1.8, gain: 2.4 * s, attack: 0.002, dur: arty ? 0.35 : 0.25 });
      // Khí thuốc phóng xé không khí: dải trung "rầm" + lớp trầm và phản xạ mặt đất trễ ~28 ms
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: arty ? 520 : 650, Q: 0.6, drive: 2, gain: 3.6 * s, attack: 0.001, dur: arty ? 0.42 : 0.32 });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 2.5, gain: (arty ? 0.8 : 1.1) * s, attack: 0.002, dur: arty ? 0.85 : 0.55 });
      this.burst(out, t + 0.028, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300, drive: 2, gain: 0.6 * s, attack: 0.003, dur: arty ? 0.75 : 0.5 });
      if (arty) {
        // Hãm nòng 155mm: khí thuốc phóng bị hắt NGANG sang 2 bên thành 2 luồng nổ cực gắt ngay cạnh xe
        // ("ĐOÀNG" xé tai, dải 0,8-3 kHz) — chính là cái làm tiếng pháo tự hành dữ hơn hẳn pháo tăng
        for (const [ch, d] of [[W.L, 0], [W.R, 0.0015]]) {
          this.burst(ch, t + d, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.5, drive: 3.5, gain: 6.0, attack: 0.0004, dur: 0.16 });
          this.burst(ch, t + d, { filter: 'bandpass', freq: 3200, Q: 0.7, drive: 3, gain: 1.6, attack: 0.0003, dur: 0.05 });
          this.burst(ch, t + d + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 650, Q: 0.6, drive: 2.5, gain: 4.5, attack: 0.001, dur: 0.26 });
        }
        // Nhịp đập thứ 2: sóng nổ dội từ mặt đất + cả khối xe 50 tấn giật lùi "hự" ~55 ms sau
        this.burst(out, t + 0.055, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 190, Q: 0.8, drive: 2, gain: 3.0 * s, attack: 0.003, dur: 0.4 });
        this.burst(out, t + 0.055, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 0.6, drive: 1.8, gain: 1.6 * s, attack: 0.003, dur: 0.25 });
      }
      // Tiếng xé gió gắt + bụi đất trước đầu nòng bị thổi tung, xích / thân xe rung lách cách
      this.burst(out, t + 0.01, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1800, Q: 0.5, gain: 3.0 * s, attack: 0.004, dur: 0.45 });
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1600, Q: 0.6, drive: 1.5, gain: 3.8 * s, attack: 0.001, dur: 0.2 });
    }
    if (!remote) this.duck(arty ? 0.2 : 0.3, arty ? 1.6 : 1.1);
    this.noteBlast(distance, remote ? 1 : 1.5);
    // Rền sấm cuộn dài + tiếng dội từ đồi núi, công trình xung quanh
    const ik = inside ? 0.6 : 1;   // trong xe: rền & tiếng dội ngoài trời nghe qua vỏ thép, nhỏ hơn
    const roll = this.voice({ gain: sp.gain * 0.9 * ik, lowpass: Math.min(sp.lowpass, 600), wet: 0.9, pan: sp.pan * 0.5 });
    this.burst(roll, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 280, gain: 0.48 * s, attack: 0.15, dur: arty ? 3.4 : 2.3 });
    this.playTerrainEchoes(t, s * 0.55 * ik * Math.sqrt(sp.gain), inside ? Math.min(sp.lowpass, 700) : sp.lowpass);
  }

  // Kênh gộp cho phát bắn của chính người chơi: bão hòa mềm cả cụm (như micro / màng nhĩ bị sóng nổ ép),
  // các lớp quyện thành một khối "ĐÙNG" đặc thay vì nghe rời từng lớp.
  // Pháo 155 (heavy): tiếng to tới mức chạm trần, nên cắt bớt siêu trầm <60 Hz (loa thường không phát, tai kém nhạy,
  // chỉ ăn hết headroom làm limiter ép cả tiếng) và nhấn dải "ĐÙM" 160 Hz -> cùng mức đỉnh mà nghe to, dày hơn hẳn
  blastBus(heavy = false) {
    const key = heavy ? '_blastBusHeavy' : '_blastBus';
    if (this[key]) return this[key];
    const ctx = this.ctx;
    const input = ctx.createGain();
    let node = input;
    if (heavy) {
      for (const f of [75, 70]) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = f;
        hp.Q.value = 0.7;
        node.connect(hp);
        node = hp;
      }
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = 160;
      pk.Q.value = 0.9;
      pk.gain.value = 3;
      node.connect(pk);
      node = pk;
    }
    const ws = ctx.createWaveShaper();
    ws.curve = this.getShaper(1.8);
    ws.oversample = '2x';
    const g = ctx.createGain();
    g.gain.value = 0.9;
    node.connect(ws);
    ws.connect(g);
    g.connect(this.weaponBus);
    this[key] = input;
    return input;
  }

  // Tiếng nổ dội lại từ địa hình: các phản xạ rời rạc trái/phải, càng muộn càng nhỏ và trầm
  playTerrainEchoes(t, k = 1, lowpass = 20000) {
    const taps = [[0.16, 0.5, -0.6], [0.38, 0.38, 0.7], [0.74, 0.26, -0.3], [1.25, 0.16, 0.5]];
    for (const [d, g, pan] of taps) {
      const v = this.voice({ gain: g * k, lowpass: Math.min(1100, lowpass), wet: 0.85, pan: pan + (Math.random() - 0.5) * 0.3 });
      const tt = t + d + Math.random() * 0.08;
      this.burst(v, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, gain: 0.9, attack: 0.008, dur: 0.5 });
      this.burst(v, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600, Q: 0.7, gain: 0.6, attack: 0.004, dur: 0.3 });
    }
  }

  // ===========================================================================
  // 2. VỤ NỔ ĐẠN PHÁO / TÊN LỬA / ĐẠN CHÙM
  // ===========================================================================
  // opts.heavy: đạn pháo 155mm (~6.6 kg thuốc nổ, gấp ~2.5 lần đạn HE 120mm của xe tăng) -> nổ to, trầm, dài hơn hẳn
  playExplosionAtDistance(distance, hitType = 'GROUND', ammoType = 'NORMAL', pos = null, opts = {}) {
    if (!this.ready()) return;
    if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY') {
      this.playGatlingImpact(distance, hitType, ammoType === 'INCENDIARY', pos, ammoType === 'SCOUT_BULLET');
      return;
    }
    // Đạn xuyên động năng không có thuốc nổ: không có tiếng nổ, chỉ có tiếng va chạm
    if (ammoType === 'AP') { this.noteBlast(distance, 0.6); this.playKineticImpact(distance, hitType, pos); return; }

    const sp = this.spatial(distance, pos);
    const t = this.ctx.currentTime + sp.delay;

    // đạn tiêu chuẩn 120mm (nổ phá đa năng) mang ~2 kg thuốc nổ -> không nhỏ hơn tiếng khai hỏa quá nhiều
    let k = ammoType === 'NORMAL' ? 1.2 : 1.0;
    if (ammoType === 'HE') k = 1.5;
    else if (ammoType === 'RPG') k = 1.25;
    else if (ammoType === 'ANTI_TANK_MISSILE') k = 1.45;   // đầu nổ lõm kép cỡ 152mm: ~4-5 kg thuốc nổ (RPG-7 chỉ ~0,7 kg)
    // Đạn chùm tách vỏ trên không: chỉ là liều đẩy nhỏ thổi bật đáy đạn cho bom con văng ra — "BỤP" đanh, nhỏ hơn hẳn
    // một quả đạn nổ phá (trước đây to ngang đạn 120mm); tiếng nổ lớn là chuỗi bom con chạm đất ngay sau đó
    else if (ammoType === 'CLUSTER') k = hitType === 'AIRBURST' ? 0.6 : 1.1;
    else if (ammoType === 'CLUSTER_SUBMUNITION') k = 0.45;
    const air = hitType === 'AIRBURST';
    const near = Math.max(0, 1 - distance / 900);
    // Cỡ vụ nổ (thời lượng, độ trầm) tách khỏi mức to: đạn 155 dài & trầm hơn, thêm tầng đất rung — mức to chỉ nhích
    // vừa phải vì đỉnh đã sát trần, tăng nữa chỉ làm méo
    const heavy = !!(opts && opts.heavy) && ammoType === 'HE';
    const heat = ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
    const Z = heavy ? 1.45 : 1;
    const lvl = heavy ? 1.3 : ammoType === 'HE' ? 1.2 : ammoType === 'NORMAL' ? 1.0 : 1;
    this.noteBlast(distance, Math.min(1.3, k * lvl));

    // Mức đưa vào thấp có chủ đích: nếu để to, tầng cắt đỉnh / giới hạn ở đầu ra ép tiếng nổ thành một khối ồn bẹt;
    // để thấp thì xung đầu vẫn chạm đỉnh còn thân nổ tụt nhanh phía sau -> có "cú đấm" như tiếng nổ thật
    const out = this.voice({ gain: sp.gain * 0.2 * lvl, lowpass: sp.lowpass, wet: Math.min(0.95, sp.wet + 0.1), pan: sp.pan });

    if (!this.playSample('explosion', out, t, { gain: 1.4 * Math.min(1.3, k) })) {
      // Cấu trúc tiếng nổ thật: (1) sóng xung kích "ĐOÀNG" gắt nhất ngay ms đầu -> (2) thân nổ "BÙM" trầm dày
      // tắt trong ~1 s -> (3) đất đá, không khí xé "rào rào" -> (4) rền cuộn & tiếng dội nhỏ hơn hẳn phát nổ
      // Bề mặt chạm đổi cả thân tiếng nổ: nổ trên thép / đá gắt hơn; trong bao cát / dưới nước bị nghẹt mất âm cao;
      // trên đất / bao cát / đá có đất đá hất tung, trên vỏ xe & mặt nước thì không
      const MAT = {
        DIRECT_HIT: [1.35, 0.85, 0, 1400], WALL: [1.2, 0.9, 0.35, 1400], BUILDING: [0.9, 1.0, 0.35, 1100], TREE: [1.0, 0.9, 0.3, 1300],
        BOULDER: [1.35, 0.9, 0.5, 1500], SANDBAG: [0.4, 1.1, 0.6, 650], WATER: [0.35, 0.8, 0, 600], AIRBURST: [1.1, 0.7, 0, 1600]
      }[hitType] || [1, 1, 1, 1400];
      const [bright, bodyK, dirtK, bodyF] = MAT;
      const W = this.stereoSpread(out, 0.6);
      // Sóng xung kích + quả cầu lửa dựng theo vật lý (synthGunshot 'blast…'): hai biến thể khác nhau cho 2 kênh trái/phải
      // lệch 0,6 ms -> vụ nổ có bề rộng. Bề mặt mềm (bao cát, nước) nuốt âm cao: lọc bớt
      const bk = heavy ? 'blast155' : ammoType === 'HE' ? 'blast120' : ammoType === 'ANTI_TANK_MISSILE' ? 'blastATGM' : (heat || (ammoType === 'CLUSTER' && air)) ? 'blastRPG' : ammoType === 'CLUSTER_SUBMUNITION' ? 'blast30' : 'blastN';
      let bDest = [W.L, W.R];
      // Bề mặt mềm (bao cát, nước) nuốt một phần năng lượng nổ, không chỉ mất âm cao: hạ cả mức. Chỉ lọc tối mà giữ nguyên
      // mức thì sau tầng giới hạn đỉnh tiếng nổ nghẹt lại TO hơn nổ trên đất (đỉnh tròn bị ép ít hơn) — đo được +4..6 dB
      const soak = bright < 0.8 ? 0.22 + 0.5 * bright : 1;
      if (bright < 0.8) {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700 + 2600 * bright;
        lp.connect(out);
        bDest = [lp, lp];
      }
      bDest.forEach((d, c) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.gunshotBuffer(bk);
        src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 6.5 * k * Math.max(0.7, bodyK) * soak;
        src.connect(g);
        g.connect(d);
        src.start(t + c * 0.0006);
      });
      // Khối khí & đất bị hất tung: dải trung "rầm" đục, rồi phản xạ mặt đất trễ ~30 ms làm dày tiếng
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 0.6, drive: 1.5, gain: 2.8 * k * Math.min(1, bright + 0.2), attack: 0.002, dur: 0.26 * Z });
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, drive: 1.5, gain: 0.6 * k, attack: 0.004, dur: 0.5 * k * Z });
      this.burst(out, t + 0.03, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 320, drive: 2, gain: 0.5 * k, attack: 0.004, dur: 0.45 * k * Z });
      // đất đá, mảnh vỡ bị hất tung ngay sau sóng nổ: "rắc rào" dải trung-cao
      if (!air && dirtK > 0) this.burst(out, t + 0.006, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 2200, Q: 0.5, gain: 5.0 * k * dirtK, attack: 0.003, dur: 0.45 * Z });
      // không khí bị xé + đất cát phụt: nhiễu dày dải 1-3 kHz tắt nhanh — làm tiếng nổ "rõ mặt", không chỉ ục ục
      this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1700, Q: 0.6, drive: 1.2, gain: 2.4 * k * bright, attack: 0.002, dur: 0.16 * Z });
      if (heavy) {
        // 155mm: khối đất hàng tấn bị hất tung -> cú "HỰ" thứ hai trễ ~60 ms (phản xạ nền + đất đổ), đất rung trầm kéo dài
        this.burst(out, t + 0.06, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 480, Q: 0.7, drive: 2, gain: 2.4 * k, attack: 0.004, dur: 0.45 });
        this.burst(out, t + 0.02, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 170, drive: 2, gain: 1.1 * k, attack: 0.03, dur: 1.3 });
      }
    }
    if (distance < 700 * Z) this.duck(0.3 + 0.5 * (distance / (700 * Z)), heavy ? 1.6 : 1.0);

    // Rền cuộn lan xa + tiếng dội địa hình (nhỏ hơn hẳn phát nổ chính, kéo dài)
    const roll = this.voice({ gain: sp.gain * 0.8 * lvl, lowpass: Math.min(sp.lowpass, 500), wet: 0.95, pan: sp.pan * 0.5 });
    this.burst(roll, t + 0.08, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: heavy ? 220 : 260, gain: 0.32 * k * Z, attack: 0.15, dur: (1.8 + 0.6 * k) * Z });
    if (k >= 0.9) this.playTerrainEchoes(t, k * 0.45 * Z * Math.sqrt(sp.gain), sp.lowpass);

    if (hitType === 'WATER') {
      // Nổ dưới nước: tiếng nổ bị nước nuốt thành "ụp" đục, cột nước vọt lên rồi đổ ào xuống như mưa rào
      this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 160, drive: 3, gain: 1.4 * k, attack: 0.004, dur: 0.5 });
      this.burst(out, t + 0.04, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, freqEnd: 2600, sweep: 0.3, Q: 0.7, gain: 0.8 * k, attack: 0.03, dur: 0.5 });
      this.burst(out, t + 0.5, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 1400, gain: 0.55 * k, attack: 0.25, dur: 1.6 });
      this.burst(out, t + 0.55, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 3000, Q: 0.6, gain: 0.9 * k, attack: 0.2, dur: 1.8 });
      return;
    }
    // Tiếng riêng của vật liệu bị trúng (giáp / bê tông / nhà gạch / gỗ / đá / bao cát / đất); tên lửa & RPG là đầu đạn lõm
    // bom con DPICM trúng xe: đầu nổ lõm nhỏ khoan qua nóc -> tiếng "chít" xé thép của luồng phụt, không phải "BOONG"
    // của đạn nổ phá cỡ lớn đập lên vỏ xe
    const bombOnArmor = ammoType === 'CLUSTER_SUBMUNITION' && hitType === 'DIRECT_HIT';
    this.surfaceHit(out, t, hitType, heat || bombOnArmor ? 'heat' : 'blast', k);

    // Đất đá, mảnh vụn rơi rào rào + các cục đất rơi bịch bịch sau vụ nổ gần (không có khi nổ trên vỏ xe)
    if (!air && near > 0 && hitType !== 'DIRECT_HIT' && hitType !== 'WATER') {
      this.burst(out, t + 0.25, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 2200, gain: 0.3 * near * k * Z, attack: 0.35, dur: 1.4 * Z });
      this.burst(out, t + 0.25, { buffer: this.crackleBuffer, filter: 'lowpass', freq: 1400, gain: 0.9 * near * k * Z, attack: 0.3, dur: 1.5 * Z });
      for (let i = 0; i < (heavy ? 8 : 4); i++) {
        this.burst(out, t + 0.35 + Math.random() * 0.9 * Z * Z, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 380, gain: 0.45 * near * k * (0.6 + Math.random() * 0.6), attack: 0.002, dur: 0.08 });
      }
    }
  }

  // ===========================================================================
  // 8. TÊN LỬA CHỐNG TĂNG CỦA XE TRINH SÁT
  // ===========================================================================
  playMissileLaunch(distance = 0, pos = null) {
    if (!this.ready()) return;
    const remote = distance > 0;
    const sp = remote ? this.spatial(distance, pos) : { gain: 1, lowpass: 20000, wet: 0.45, delay: 0, pan: 0 };
    if (sp.gain < 0.05) return;
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain, lowpass: sp.lowpass, wet: Math.max(0.45, sp.wet), pan: sp.pan });
    if (this.playSample('missile_launch', out, t, { gain: 1.1 })) return;
    const ctx = this.ctx;
    // Tên lửa cỡ 152mm phóng từ ống như ngoài đời:
    //  (1) liều phóng đẩy tên lửa khỏi ống: "BỤP" trầm đục + khí phụt ngược khỏi đuôi ống;
    //  (2) ~0,1 s sau động cơ hành trình bắt lửa "XOẠC": tiếng gầm phản lực dải rộng của nhiên liệu rắn, biên độ dao động
    //      ngẫu nhiên (không theo chu kỳ — rung đều nghe thành "phành phạch" giả);
    //  (3) tên lửa lao đi ~300 m/s: nhỏ dần theo 1/r, mất âm cao dần (không khí hấp thụ), cao độ tụt gần một quãng tám
    //      do Doppler của nguồn đang ra xa (× c / (c + v) ≈ 0,53), kéo dài ~2,5 s rồi chìm hẳn.
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 230, Q: 0.7, drive: 2, gain: 1.7, attack: 0.002, dur: 0.16 });
    this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 480, drive: 1.6, gain: 1.0, attack: 0.002, dur: 0.22 });
    this.snap(out, t, 0.55, 5000, 2);
    this.burst(out, t + 0.004, { filter: 'bandpass', freq: 1700, Q: 0.6, gain: 0.55, attack: 0.002, dur: 0.12 });
    const ti = t + 0.09 + Math.random() * 0.03;
    this.snap(out, ti, 0.4, 7000, 2);
    this.burst(out, ti, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.6, drive: 1.5, gain: 0.8, attack: 0.002, dur: 0.1 });
    if (!remote && this.interior && this.interiorShot) this.interiorShot('missile', t);
    // Game đang cho tiếng động cơ bám theo viên tên lửa thật (sight_audio.js startMissileTrack): không phát đoạn
    // tiếng bay dựng sẵn 2,6 s (bắn gần thì kéo dài sau tiếng nổ, bắn xa thì tên lửa bay im lặng nửa sau)
    if (this.trackMissiles) return;
    const D = 2.6, N = 80, c = 343;
    const r0 = remote ? Math.max(8, distance / 8) : 5, vr = remote ? 150 : 300;   // xe khác: hướng bay không thẳng ra xa mình
    const gC = new Float32Array(N), bpC = new Float32Array(N), hpC = new Float32Array(N), lpC = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // thời điểm nghe τ -> thời điểm phát te (âm đi chậm dần vì nguồn mỗi lúc một xa): te + r(te)/c = τ
      const tau = (i / (N - 1)) * D;
      let te = tau;
      for (let it = 0; it < 4; it++) te = Math.max(0, tau - vr * Math.max(0, te - 0.125) / c);
      const v = vr * Math.min(1, te / 0.25), r = r0 + vr * Math.max(0, te - 0.125);
      const dop = c / (c + v);
      gC[i] = Math.min(1, te / 0.04) * (r0 / r) * (i === N - 1 ? 0 : 1);
      bpC[i] = 1150 * dop; hpC[i] = 2600 * dop;
      lpC[i] = Math.max(700, Math.min(16000, 4200 * Math.pow(100 / Math.max(1, r), 0.9)));
    }
    const env = ctx.createGain(); env.gain.value = 0;
    const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.Q.value = 0.5;
    const am = ctx.createGain(); am.gain.value = 1;
    const roar = ctx.createBufferSource(); roar.buffer = this.pinkNoiseBuffer; roar.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.5;
    const rg = ctx.createGain(); rg.gain.value = 1.5;
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noiseBuffer; hiss.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    const hg = ctx.createGain(); hg.gain.value = 0.2;
    const low = ctx.createBufferSource(); low.buffer = this.brownNoiseBuffer; low.loop = true;
    const lowF = ctx.createBiquadFilter(); lowF.type = 'lowpass'; lowF.frequency.value = 260;
    const lg = ctx.createGain(); lg.gain.value = 0.7;
    // ngọn lửa phản lực cháy không đều: nhiễu lọc thấp ~30 Hz điều biên (độ sâu ~35 %), lách tách nhẹ dải thấp
    const rough = ctx.createBufferSource(); rough.buffer = this.pinkNoiseBuffer; rough.loop = true;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 30;
    const rd = ctx.createGain(); rd.gain.value = 3;
    const crk = ctx.createBufferSource(); crk.buffer = this.crackleBuffer; crk.loop = true;
    const crkF = ctx.createBiquadFilter(); crkF.type = 'lowpass'; crkF.frequency.value = 1500;
    const cg = ctx.createGain(); cg.gain.value = 0.18;
    roar.connect(bp); bp.connect(rg); rg.connect(am);
    hiss.connect(hp); hp.connect(hg); hg.connect(am);
    low.connect(lowF); lowF.connect(lg); lg.connect(am);
    crk.connect(crkF); crkF.connect(cg); cg.connect(am);
    rough.connect(rlp); rlp.connect(rd); rd.connect(am.gain);
    am.connect(air); air.connect(env); env.connect(out);
    env.gain.setValueCurveAtTime(gC, ti, D);
    bp.frequency.setValueCurveAtTime(bpC, ti, D);
    hp.frequency.setValueCurveAtTime(hpC, ti, D);
    air.frequency.setValueCurveAtTime(lpC, ti, D);
    const off = () => Math.random() * 2;
    for (const n of [roar, hiss, low, rough, crk]) { n.start(ti, off()); n.stop(ti + D + 0.05); }
  }

  playRocketLaunch(distance = 0, pos = null) { this.playMissileLaunch(distance, pos); }
});
