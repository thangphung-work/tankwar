/**
 * GIỌNG LÍNH BỘ BINH khi bị thương: gắn thêm phương thức vào SoundEngine. Nạp sau cockpit_cues.js (dùng this.vox) và sound_engine.js.
 *
 * Mặc định tổng hợp bằng vox. Có file thu thật thì dùng file: khai trong assets/sfx/manifest.json khoá vox_<loại>_<số>
 * (vd "vox_hit_1": "voice/hit1.ogg"), thiếu loại nào thì loại đó vẫn tổng hợp. k: hệ số cao độ giọng riêng từng lính.
 * Tiếng người nhỏ hơn hẳn tiếng súng, ngoài ~40 m (320 đv) không nghe được.
 */
SoundEngine.mixin(class {
  // kind: hit | hitBad | moan | breath | pant | pantHard | hiss | death. distance: đv, 0 = chính mình / sát camera. pan: -1..1
  playSoldierVox(kind, distance = 0, pan = 0, k = 1) {
    if (!this.ready() || distance > 320) return;
    // trần chung: cả tổ cùng trúng một quả nổ thì nghe vài tiếng, không thành dàn đồng ca
    const now = this.ctx.currentTime;
    this._voxAt = (this._voxAt || []).filter(x => now - x < 2);
    if (this._voxAt.length >= 4 && distance > 0) return;
    this._voxAt.push(now);
    const fade = 1 - distance / 320, sp = distance > 0 ? this.spatial(distance, null) : { gain: 1, lowpass: 20000, wet: 0.1 };
    // sát camera đi thẳng bus (bỏ qua ngân sách tiếng): tiếng kêu của chính lính mình không được phép mất
    const out = this.voice({ bus: distance > 0 ? null : this.weaponBus, gain: sp.gain * (0.16 + 0.84 * fade * fade) * 0.24, lowpass: Math.min(sp.lowpass, 7000), wet: Math.max(0.1, sp.wet), pan });
    const t = now + distance / (343 * 8);
    if (this.playVoxSample(kind, out, t, k)) return;
    const S = this.voxKinds(out, t, k);
    if (S[kind]) S[kind]();
  }

  // BƯỚC CHÂN BỘ BINH: gót giày nện đất (trầm) + đất / cỏ lạo xạo; chạy mạnh hơn và đồ đeo (băng đạn, khoá dây) lách cách theo
  // nhịp; mệt thì mũi giày lê trên đất trước khi đặt chân; lội nước thì bì bõm. o: { run 0..1, tired 0..1, wet đv, load kg, surf, distance, pan, k }
  // surf: hard (nhựa, bê tông) | rock (đá sỏi) | sand | grass | mud | soil
  playSoldierStep(o) {
    if (!this.ready() || o.distance > 290) return;
    const now = this.ctx.currentTime;
    this._stepAt = (this._stepAt || []).filter(x => now - x < 0.25);
    if (this._stepAt.length >= 3 && o.distance > 0) return;   // nhiều lính cùng bước: giữ vài tiếng gần nhất
    this._stepAt.push(now);
    const R = Math.random, r = (a, b) => a + R() * (b - a);
    const fade = 1 - o.distance / 290, sp = o.distance > 0 ? this.spatial(o.distance, null) : { gain: 1, lowpass: 20000, wet: 0.08 };
    const heavy = Math.min(1.3, 0.8 + (o.load || 8) / 40), force = (0.55 + 0.6 * o.run) * heavy;
    const out = this.voice({ bus: o.distance > 0 ? null : this.weaponBus, gain: sp.gain * fade * fade * 0.2, lowpass: Math.min(sp.lowpass, 9000), wet: Math.max(0.06, sp.wet), pan: o.pan });
    let t = now + o.distance / (343 * 8);
    // lê chân khi mệt (đi bộ, kiệt sức): vệt cọ dài, nhỏ
    if (o.tired > 0.55 && o.run < 0.3 && R() < 0.75) {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(900, 1300), freqEnd: r(600, 800), sweep: 0.16, Q: 1.1, gain: 0.35 * o.tired, attack: 0.04, dur: r(0.12, 0.2) });
      t += r(0.08, 0.12);
    }
    if (o.wet > 0.4) {   // lội nước: tõm + tia nước rơi lại
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(500, 700), freqEnd: 260, sweep: 0.12, Q: 1.4, gain: 0.9 * force, attack: 0.008, dur: 0.14 });
      this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 2400, gain: 0.25 * force, attack: 0.02, dur: r(0.18, 0.3) });
      return;
    }
    const heel = { hard: [260, 340, 1.25, 0.035, 0.055], rock: [190, 250, 1, 0.05, 0.07], sand: [110, 150, 0.75, 0.07, 0.1], grass: [130, 175, 0.9, 0.06, 0.09], mud: [100, 140, 1, 0.08, 0.12] }[o.surf] || [150, 210, 1.1, 0.05, 0.08];
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: r(heel[0], heel[1]) * (1 + 0.2 * o.run), gain: heel[2] * force, attack: 0.004, dur: r(heel[3], heel[4]) });   // gót nện
    if (o.surf === 'hard') this.burst(out, t + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(3200, 4400), Q: 1.4, gain: 0.34 * force, attack: 0.002, dur: r(0.02, 0.035) });   // đế giày gõ mặt cứng, không lạo xạo
    else if (o.surf === 'rock') for (let i = 0; i < 3; i++) this.burst(out, t + 0.01 + i * r(0.018, 0.032), { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(1700, 3300), Q: 1.6, gain: r(0.3, 0.5) * force, attack: 0.002, dur: r(0.02, 0.045) });   // sỏi lạo xạo từng hạt
    else if (o.surf === 'sand') this.burst(out, t + 0.015, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: r(2600, 3400), gain: 0.16 * force, attack: 0.03, dur: r(0.12, 0.18) });   // cát trượt
    else if (o.surf === 'grass') this.burst(out, t + 0.008, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(3800, 5600), Q: 0.6, gain: 0.3 * force, attack: 0.018, dur: r(0.11, 0.17) });   // cỏ quét ống quần
    else if (o.surf === 'mud') this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(800, 1050), freqEnd: 340, sweep: 0.11, Q: 2.2, gain: 0.75 * force, attack: 0.012, dur: 0.13 });   // bùn mút đế giày
    else this.burst(out, t + 0.012, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(2100, 3200), Q: 0.8, gain: 0.32 * force, attack: 0.006, dur: r(0.05, 0.09) });   // đất lạo xạo
    if (o.run > 0.4) for (let i = 0; i < 2; i++)                                                                                                                     // đồ đeo lách cách
      this.burst(out, t + r(0.03, 0.09), { filter: 'bandpass', freq: r(3800, 5600), Q: 6, gain: 0.07 * o.run * heavy, attack: 0.002, dur: r(0.02, 0.04) });
  }

  // ĐẠN CỦA MÌNH TRÚNG: tiếng khô ngắn, không theo cự ly (đi bus giao diện), mỗi kết quả một giọng; hạ gục dùng playKillConfirm (battle_drama)
  playHitMark(kind) {
    if (!this.ready() || kind === 'kill') return;
    const now = this.ctx.currentTime;
    if (now - (this._markAt || -1) < 0.04) return;   // đạn nổ lan trúng nhiều người cùng khung: một tiếng
    this._markAt = now;
    const t = now + 0.005, out = this.voice({ bus: this.uiBus || this.masterGain, gain: 0.8, wet: 0 });
    if (kind === 'head') {
      this.metal(out, t, { f0: 1750, ratios: [1, 1.51, 2.27], decay: 0.16, gain: 0.5, click: 0.3 });
      this.burst(out, t, { filter: 'bandpass', freq: 3000, Q: 1.2, gain: 0.5, attack: 0.001, dur: 0.03 });
    } else if (kind === 'pen') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 520, gain: 1.1, attack: 0.002, dur: 0.11 });
      this.burst(out, t, { filter: 'bandpass', freq: 2300, Q: 1, gain: 0.55, attack: 0.001, dur: 0.035 });
    } else if (kind === 'armor' || kind === 'plate') {
      this.metal(out, t, { f0: kind === 'plate' ? 1180 : 860, ratios: [1, 1.34, 2.13], decay: 0.1, gain: 0.8, click: 0.5 });
    } else {
      this.burst(out, t, { filter: 'bandpass', freq: kind === 'splash' ? 1500 : 2300, Q: 1.3, gain: kind === 'splash' ? 0.4 : 0.7, attack: 0.001, dur: 0.028 });
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 420, gain: 0.5, attack: 0.002, dur: 0.045 });
    }
  }

  // BẢN THÂN TRÚNG ĐẠN: flesh = cú đập thịt, plate = đạn dội tấm giáp (nổ lan đã có tiếng nổ)
  playSelfHit(kind) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.003, out = this.voice({ bus: this.weaponBus, gain: 0.55, wet: 0.04 });
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 240, gain: 1.3, attack: 0.002, dur: 0.1 });
    if (kind === 'plate') this.metal(out, t, { f0: 720, ratios: [1, 1.42, 2.31], decay: 0.12, gain: 0.2, click: 0.35 });
    else this.burst(out, t, { filter: 'bandpass', freq: 1100, Q: 0.9, gain: 0.35, attack: 0.001, dur: 0.035 });
  }

  // ĐẠN BAY SƯỢT QUA: kind crack = đạn súng siêu âm (tiếng roi quất, tới trước tiếng súng), shell = đạn pháo siêu âm, whoosh = rocket / lựu dưới âm tốc.
  // near 1 = sát tai, 0 = rìa vùng nghe; pan: bên đạn bay qua
  playBulletNear(kind, near, pan = 0) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    this._nearAt = (this._nearAt || []).filter(x => now - x < 0.5);
    if (this._nearAt.length >= 4) return;   // súng máy quét ngang: không dồn thành tiếng rè
    this._nearAt.push(now);
    const g = 0.25 + 0.75 * near, t = now + 0.003, out = this.voice({ bus: this.weaponBus, gain: 0.6 * g, wet: 0.22, pan });
    if (kind === 'whoosh') {
      this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1250, freqEnd: 330, sweep: 0.42, Q: 1.1, gain: 1.5, attack: 0.09, dur: 0.42 });
      return;
    }
    const big = kind === 'shell';
    this.burst(out, t, { filter: 'highpass', freq: big ? 1400 : 2600, gain: big ? 1 : 0.85, attack: 0.0006, dur: big ? 0.05 : 0.022 });
    this.burst(out, t + 0.001, { filter: 'bandpass', freq: big ? 900 : 1700, Q: 0.8, gain: big ? 0.8 : 0.45, attack: 0.001, dur: big ? 0.09 : 0.04 });
    if (big) this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, gain: 1.1, attack: 0.004, dur: 0.24 });
    else this.burst(out, t + 0.014, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3400, freqEnd: 1500, sweep: 0.08, Q: 2, gain: 0.3, attack: 0.004, dur: 0.08 });   // vệt xé không khí sau tiếng quất
  }

  // file thu thật: chọn ngẫu nhiên trong các khoá vox_<loại>_*, không lặp ngay file vừa phát
  playVoxSample(kind, out, t, k) {
    const pre = 'vox_' + kind + '_', keys = this.samples ? Object.keys(this.samples).filter(n => n.startsWith(pre)) : [];
    if (!keys.length) return false;
    const pick = keys.length > 1 ? keys.filter(n => n !== this._voxLast) : keys, key = pick[Math.floor(Math.random() * pick.length)];
    this._voxLast = key;
    return this.playSample(key, out, t, { gain: 3, rate: k, vary: 0.02 });
  }

  voxKinds(out, t, k) {
    const R = Math.random, r = (a, b) => a + R() * (b - a);
    // nhịp thở: hắt ra + hít vào (không cao độ), nhịp lệch nhau như người đang đau
    const breathe = (t0, n, g0) => {
      const g = g0 * 12;   // nhiễu qua lọc hẹp còn rất nhỏ so với vox: đo đỉnh ở đầu ra
      let q = t0;
      for (let i = 0; i < n; i++) {
        const out1 = r(0.3, 0.46), in1 = r(0.2, 0.3);
        this.burst(out, q, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(620, 780) * k, freqEnd: 430, sweep: out1, Q: 2.2, gain: g, attack: 0.05, dur: out1 });
        q += out1 + r(0.03, 0.1);
        this.burst(out, q, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(1400, 1700) * k, freqEnd: 2100, sweep: in1, Q: 1.8, gain: g * 0.6, attack: 0.06, dur: in1 });
        q += in1 + r(0.04, 0.16);
      }
    };
    const pant = (t0, n, g0, cyc) => {
      const g = g0 * 12;
      let q = t0;
      for (let i = 0; i < n; i++) {
        const o = cyc * r(0.9, 1.15), h = cyc * r(0.75, 0.95);
        this.burst(out, q, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(700, 860) * k, freqEnd: 480, sweep: o, Q: 1.9, gain: g, attack: 0.025, dur: o });
        q += o + r(0.02, 0.05);
        this.burst(out, q, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: r(1500, 1850) * k, freqEnd: 2300, sweep: h, Q: 1.6, gain: g * 0.7, attack: 0.03, dur: h });
        q += h + r(0.02, 0.06);
      }
    };
    // "hự": hơi bị ép bật khỏi ngực, ngắn, tắc cổ họng
    const grunt = (t0, g = 1) => this.vox(out, t0, {
      dur: r(0.14, 0.22), f0: [[0, r(165, 195) * k], [0.3, r(215, 250) * k], [1, r(135, 160) * k]], vowel: [[0, 640, 1190, 2390], [1, 420, 1300, 2400]],
      amp: [[0.06, 0.9 * g], [0.55, 0.75 * g], [0.8, 0.5 * g], [0.86, 0.0001]], breath: 0.42, rough: r(0.25, 0.45)
    });
    return {
      hit: () => { grunt(t); breathe(t + 0.3, 1, 0.06); },
      // trúng nặng: hự, gào ngắn nghẹn lại, rồi hít giật
      hitBad: () => {
        grunt(t);
        const d = r(0.55, 0.85), f = r(0.92, 1.1);
        this.vox(out, t + 0.2, {
          dur: d, f0: [[0, 270 * k * f], [0.16, 385 * k * f], [0.6, 340 * k * f], [1, 205 * k * f]], vowel: [[0, 700, 1150, 2450], [0.7, 730, 1100, 2450], [1, 560, 1250, 2400]],
          amp: [[0.05, 1], [0.6, 0.82], [0.9, 0.3], [1, 0.0001]], breath: 0.3, rough: r(0.6, 0.85), gain: 0.85
        });
        this.burst(out, t + 0.28 + d, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500 * k, freqEnd: 2300, sweep: 0.26, Q: 1.8, gain: 0.08, attack: 0.03, dur: 0.26 });
        breathe(t + 0.65 + d, 1, 0.07);
      },
      // rên nghẹn trong họng, môi khép, tắt dần; đôi lúc hai hơi
      moan: () => {
        const one = (t0, d, g) => this.vox(out, t0, {
          dur: d, f0: [[0, r(128, 148) * k], [0.3, r(145, 165) * k], [1, r(92, 108) * k]], vowel: [[0, 310, 1050, 2350], [0.55, 480, 1200, 2400], [1, 400, 1300, 2400]],
          amp: [[0.22, 0.28 * g], [0.6, 0.23 * g], [1, 0.0001]], breath: 0.58, rough: r(0.25, 0.45)
        });
        const d = r(0.8, 1.35);
        one(t, d, 1);
        if (R() < 0.45) one(t + d + r(0.3, 0.6), d * 0.7, 0.65);
      },
      breath: () => breathe(t, Math.round(r(2, 3)), 0.07),
      // thở dốc sau khi chạy: hổn hển nhanh, hơi ngắn, có tiếng khò nhẹ trong họng; kiệt sức thì dồn dập, há miệng hít mạnh
      pant: () => pant(t, Math.round(r(3, 4)), 0.055, 0.27),
      pantHard: () => pant(t, Math.round(r(4, 5)), 0.08, 0.2),
      // rít qua kẽ răng (kim đâm, siết băng) rồi nén tiếng trong họng
      hiss: () => {
        this.burst(out, t, { filter: 'bandpass', freq: r(3900, 4700), Q: 1.5, gain: 0.05, attack: 0.05, dur: r(0.32, 0.48) });
        this.vox(out, t + r(0.32, 0.42), {
          dur: r(0.26, 0.4), f0: [[0, r(150, 170) * k], [1, r(115, 130) * k]], vowel: [[0, 330, 1250, 2400], [1, 400, 1250, 2400]],
          amp: [[0.2, 0.28], [0.7, 0.2], [1, 0.0001]], breath: 0.5, rough: 0.4
        });
      },
      // chết: tiếng nghẹn tắt ngang, hơi hắt ra hết, không gào
      death: () => {
        const d = r(0.22, 0.36);
        this.vox(out, t, { dur: d, f0: [[0, r(165, 190) * k], [0.35, r(170, 200) * k], [1, r(100, 118) * k]], vowel: [[0, 620, 1150, 2400], [1, 380, 1250, 2400]], amp: [[0.1, 0.8], [0.7, 0.55], [0.88, 0.0001]], breath: 0.5, rough: 0.55 });
        const b = r(0.5, 0.8);
        this.burst(out, t + d + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 640 * k, freqEnd: 300, sweep: b, Q: 2.4, gain: 0.08, attack: 0.03, dur: b });
      }
    };
  }
});
