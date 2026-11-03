/**
 * SÚNG PHÓNG LỰU 40MM Ổ QUAY VÁC VAI (bộ binh, kiểu MGL): gắn thêm phương thức vào SoundEngine. Nạp sau sound_engine.js.
 *
 * Khác súng phóng lựu tự động trên bệ (module_weapons.js: khoá nòng + dây đạn): đạn áp suất thấp bay ~76 m/s nên không có
 * tiếng nổ đầu nòng sắc, chỉ có "PỐC" rỗng của ống nòng, cú thúc vai, rồi lò xo xoay ổ đạn sang buồng kế. Nạp đạn là chuỗi
 * tiếng cơ khí nhỏ: lẫy, bản lề, vỏ nhôm rơi, túi đạn, đạn trượt vào buồng, cót ổ đạn lách tách, khép khung "cạch".
 * Tiếng cơ khí chỉ nghe được ở gần: ngoài ~60 m bị bỏ; tiếng bắn và tiếng nổ đi xa theo spatial().
 */
SoundEngine.mixin(class {
  // name: xem bảng dưới. distance: đv, 0 = chính mình (không suy hao). pan: -1..1 (bên gọi tính theo camera)
  playGL(name, distance = 0, pan = 0, k = 0) {   // k: tham số riêng của từng tiếng
    if (!this.ready()) return;
    const far = name === 'shot' || name === 'rifle' || name === 'blast' || name === 'dud' || name === 'atrShot' || name === 'rpgShot';
    if (!far && distance > 480) return;
    const near = distance <= 0;
    const sp = near ? { gain: 1, lowpass: 20000, wet: 0.14, delay: 0 } : this.spatial(distance, null);
    if (sp.gain < 0.04) return;
    const t = this.ctx.currentTime + distance / (343 * 8);   // không dùng sp.delay: trễ chung của xe theo tỉ lệ bản đồ khác, 150 m tới tai sau 2,8 s
    const wet = name === 'blast' ? Math.min(0.9, sp.wet + 0.25) : name === 'rpgShot' ? Math.max(0.5, sp.wet) : name === 'atrShot' ? Math.max(0.42, sp.wet) : name === 'shot' || name === 'rifle' ? Math.max(0.28, sp.wet) : sp.wet;
    const out = this.voice({ gain: sp.gain, lowpass: sp.lowpass, wet, pan });
    const v = 0.95 + Math.random() * 0.1;   // không phát nào giống hệt phát nào
    const S = {
      // Đạn áp suất thấp: thuốc cháy trong buồng cao áp kín rồi mới xả sang ống nòng, nên không có mặt sóng đanh như súng trường mà là "PỐC" rỗng.
      // Lớp theo thời gian: búa -> xung kíp ngắn -> khối khí trầm -> cộng hưởng ống ~30 cm miệng hở (1/4 sóng ~280 Hz, tụt cao độ khi đạn rời nòng)
      // -> hơi thoát -> tiếng dội. Ở gần thêm: thúc vai, lò xo quay ổ, chốt chặn buồng kế, khung thép ngân, vỏ rỗng trong ổ va nhau, quả lựu xoay bay xa dần.
      shot: () => {
        this.metal(out, t, { f0: 1900 * v, ratios: [1, 2.5], decay: 0.018, gain: 0.07, click: 0.5 });
        const b = t + 0.006;
        this.snap(out, b, 0.26, 3400, 1.8);
        this.burst(out, b, { filter: 'bandpass', freq: 1500 * v, Q: 0.8, drive: 1.6, gain: 0.4, attack: 0.0006, dur: 0.018 });
        this.burst(out, b + 0.002, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300 * v, drive: 2, gain: 1.2, attack: 0.002, dur: 0.13 });
        this.tone(out, b + 0.003, { freq: 470 * v, freqEnd: 235 * v, sweep: 0.045, gain: 0.44, attack: 0.0015, dur: 0.075 });
        this.tone(out, b + 0.003, { freq: 880 * v, freqEnd: 610 * v, sweep: 0.04, gain: 0.12, attack: 0.001, dur: 0.045 });
        this.burst(out, b + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 540 * v, freqEnd: 330, sweep: 0.07, Q: 2.2, drive: 1.5, gain: 1.25, attack: 0.0015, dur: 0.095 });
        this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, freqEnd: 340, sweep: 0.3, Q: 0.7, gain: 0.17, attack: 0.008, dur: 0.34 });
        if (this.playTerrainEchoes) this.playTerrainEchoes(t, 0.09 * Math.sqrt(sp.gain), sp.lowpass);
        if (distance > 800) return;
        this.burst(out, t + 0.05, { filter: 'bandpass', freq: 2600, freqEnd: 3400, sweep: 0.03, Q: 3, gain: 0.05, attack: 0.003, dur: 0.035 });
        this.metal(out, t + 0.082, { f0: 1250 * v, ratios: [1, 2.3, 3.8], decay: 0.05, gain: 0.14, click: 0.5 });
        this.modal(out, t + 0.082, { f0: 640 * v, ratios: [1, 2.76, 5.4], T: 0.17, gain: 0.012, hard: 0.4 });
        if (!near) return;
        this.tone(out, b, { freq: 72 * v, freqEnd: 46, sweep: 0.1, gain: 0.5, attack: 0.003, dur: 0.14 });
        this.duck(0.72, 0.28);
        for (const d of [0.1, 0.122]) this.modal(out, t + d + Math.random() * 0.012, { f0: 1500 + Math.random() * 700, ratios: [1, 1.71, 2.74], T: 0.04, gain: 0.006, hard: 0.4 });
        // quả lựu xoay nên tiếng gió phập phồng theo nhịp, nhỏ và trầm dần khi bay xa
        for (let i = 0; i < 11; i++) this.burst(out, t + 0.13 + i * 0.05, { filter: 'bandpass', freq: 1250 - i * 62, Q: 1.8, gain: 0.03 * (1 - i / 12), attack: 0.008, dur: 0.032 });
      },
      // súng trường 5,56: nổ đầu nòng sắc, đuôi dội ngắn; ở gần nghe thêm khoá nòng lùi
      rifle: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 2400 * v, Q: 0.7, drive: 2.2, gain: 1.05, attack: 0.001, dur: 0.05 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 620 * v, drive: 1.8, gain: 1.1, attack: 0.001, dur: 0.12 });
        this.snap(out, t, 0.3, 3200, 1.8);
        this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, freqEnd: 380, sweep: 0.22, Q: 0.7, gain: 0.14, attack: 0.008, dur: 0.24 });
        if (near) { this.metal(out, t + 0.03, { f0: 2300 * v, ratios: [1, 2.4], decay: 0.02, gain: 0.05, click: 0.4 }); this.tone(out, t, { freq: 90 * v, freqEnd: 52, sweep: 0.07, gain: 0.32, attack: 0.002, dur: 0.09 }); this.duck(0.82, 0.16); }
      },
      // SÚNG BẮN TỈA CHỐNG TĂNG, LÊN ĐẠN TAY. Tiếng thật nghe theo lớp: mặt sóng đanh rất ngắn, to hẳn -> hai nhịp hơi phụt ngang ở hãm nòng xé "tách-tách" ->
      // khối khí trầm -> tiếng dội đất + vọng địa hình lăn rền ra xa. Khoá nòng không tự chạy nên sau tiếng nổ chỉ còn nòng dày ngân và báng thúc vai; tiếng kéo
      // khoá + vỏ đạn văng là các tiếng atrBolt* / atrCaseDrop riêng theo tay xạ thủ (Soldier.stepAtrCycle). Ở gần thêm: thúc vai, ù tai.
      atrShot: () => {
        // ĐANH: xung áp suất đầu tiên rất ngắn, nhiều 1,5-5 kHz, nổi hẳn trên phần thân (giòn = xung vượt thân ~8 dB, không phải to đều)
        this.snap(out, t, 1.0, 9500, 2.4);
        this.burst(out, t, { filter: 'bandpass', freq: 2700 * v, Q: 0.7, drive: 2.6, gain: 1.3, attack: 0.0003, dur: 0.014 });
        this.burst(out, t + 0.001, { filter: 'bandpass', freq: 4300 * v, Q: 0.9, drive: 1.4, gain: 0.6, attack: 0.0003, dur: 0.009 });
        // hai luồng xả hãm nòng tới tai trễ nhau vài ms: nhịp "tách-tách" xé
        this.burst(out, t + 0.0045, { filter: 'bandpass', freq: 1800 * v, Q: 0.8, drive: 1.8, gain: 0.75, attack: 0.0003, dur: 0.014 });
        this.burst(out, t + 0.0085, { filter: 'bandpass', freq: 3000 * v, Q: 1, gain: 0.4, attack: 0.0003, dur: 0.01 });
        // THÂN: khối khí nặng nhưng thấp hơn xung đầu, giữ dải giữa cho tiếng khỏi đục
        this.burst(out, t + 0.002, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 950 * v, Q: 0.6, drive: 1.6, gain: 0.55, attack: 0.002, dur: 0.12 });
        this.burst(out, t + 0.003, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240 * v, drive: 1.5, gain: 0.38, attack: 0.004, dur: 0.18 });
        this.tone(out, t + 0.003, { freq: 120 * v, freqEnd: 60, sweep: 0.12, gain: 0.17, attack: 0.004, dur: 0.16 });
        // đuôi sáng: không khí quanh hãm nòng xé ra rồi tắt dần, cho tiếng "ròn" chứ không cụt
        this.burst(out, t + 0.012, { filter: 'bandpass', freq: 3600, freqEnd: 1400, sweep: 0.16, Q: 0.7, gain: 0.16, attack: 0.002, dur: 0.2 });
        this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 300, sweep: 0.55, Q: 0.6, gain: 0.19, attack: 0.01, dur: 0.6 });
        // vọng rời từ đồi / dãy nhà, mỗi lần một thấp và tối hơn, rồi rền dài
        [[0.17, 0.15], [0.33, 0.1], [0.56, 0.07], [0.88, 0.045]].forEach(([d, g], i) => {
          this.snap(out, t + d, g * 0.9, 5200 - i * 900, 1.6);
          this.burst(out, t + d, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 820 - i * 90, freqEnd: 320, sweep: 0.24, Q: 0.8, gain: g, attack: 0.008, dur: 0.28 });
        });
        this.burst(out, t + 0.12, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 200, gain: 0.16, attack: 0.15, dur: 1.8 });
        if (this.playTerrainEchoes) this.playTerrainEchoes(t, 0.12 * Math.sqrt(sp.gain), sp.lowpass);
        if (distance > 800) return;
        // nòng 20 mm dày + hãm nòng thép ngân ngắn
        this.metal(out, t + 0.02, { f0: 430 * v, ratios: [1, 1.52, 2.37], decay: 0.2, gain: 0.06, click: 0.2 });
        this.modal(out, t + 0.03, { f0: 1650 * v, ratios: [1, 2.21, 3.9], T: 0.12, gain: 0.012, hard: 0.3 });
        if (!near) return;
        this.tone(out, t + 0.004, { freq: 86 * v, freqEnd: 52, sweep: 0.14, gain: 0.26, attack: 0.004, dur: 0.18 });
        this.burst(out, t + 0.06, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, gain: 0.08, attack: 0.002, dur: 0.06 });   // báng lùi đập đệm vai, áo
        this.modal(out, t + 0.07, { f0: 260 * v, ratios: [1, 2.9, 5.1], T: 0.22, gain: 0.01, hard: 0.3 });
        this.duck(0.55, 0.4);
      },
      // ỐNG PHÓNG RPG. Hai liều nối nhau như đạn PG-7 thật: búa + hạt lửa "tách" -> liều đẩy nổ trong ống (mặt sóng đanh rồi khối khí trầm, ống hở hai đầu nên
      // rỗng và rộng hơn tiếng súng) -> khí phụt ngược xé gió sau loa -> động cơ hành trình bắt lửa cách ~11 m "XOẠC" rồi gầm xa dần -> vọng địa hình.
      // Ở gần thêm: thép ống ngân, sỏi đất bị thổi rơi lộp độp, ù tai.
      rpgShot: () => {
        this.metal(out, t, { f0: 1500 * v, ratios: [1, 2.3, 3.6], decay: 0.02, gain: 0.1, click: 0.7 });
        const b = t + 0.008;
        this.snap(out, b, 0.85, 7500, 3);
        this.burst(out, b, { filter: 'bandpass', freq: 1900 * v, Q: 0.5, drive: 3.2, gain: 1.05, attack: 0.0005, dur: 0.028 });
        this.burst(out, b + 0.001, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 420 * v, Q: 0.6, drive: 2.6, gain: 1.35, attack: 0.001, dur: 0.17 });
        this.burst(out, b + 0.002, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 300 * v, drive: 2.6, gain: 1.25, attack: 0.002, dur: 0.34 });
        this.tone(out, b + 0.002, { freq: 104 * v, freqEnd: 44, sweep: 0.2, gain: 0.5, attack: 0.002, dur: 0.3 });
        this.burst(out, b + 0.012, { filter: 'bandpass', freq: 3000, freqEnd: 650, sweep: 0.42, Q: 0.6, gain: 0.34, attack: 0.004, dur: 0.46 });
        const ti = t + 0.1 + Math.random() * 0.03;
        this.snap(out, ti, 0.42, 8000, 2.4);
        this.burst(out, ti, { filter: 'bandpass', freq: 2300 * v, Q: 0.7, drive: 2, gain: 0.62, attack: 0.001, dur: 0.05 });
        this.burst(out, ti + 0.004, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 980 * v, Q: 0.6, drive: 1.6, gain: 0.55, attack: 0.002, dur: 0.13 });
        // trong trận tiếng động cơ bám viên đạn thật (sight_audio.js); phòng thử không có kênh đó nên phát đoạn xa dần dựng sẵn
        if (!this.trackMissiles) {
          this.burst(out, ti + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1250, freqEnd: 480, sweep: 1.5, Q: 0.55, gain: 0.34, attack: 0.02, dur: 1.6 });
          this.burst(out, ti + 0.03, { filter: 'highpass', freq: 3000, freqEnd: 1500, sweep: 1.1, gain: 0.07, attack: 0.02, dur: 1.15 });
        }
        [[0.21, 0.13], [0.43, 0.08], [0.78, 0.05]].forEach(([d, g]) => this.burst(out, t + d, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 640, freqEnd: 300, sweep: 0.26, Q: 0.8, gain: g, attack: 0.012, dur: 0.3 }));
        this.burst(out, t + 0.14, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 170, gain: 0.16, attack: 0.16, dur: 1.7 });
        if (this.playTerrainEchoes) this.playTerrainEchoes(t, 0.13 * Math.sqrt(sp.gain), sp.lowpass);
        if (distance > 480) return;
        this.burst(out, t + 0.3, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'bandpass', freq: 2700, Q: 0.6, gain: 0.05, attack: 0.1, dur: 0.75 });
        for (let i = 0; i < 6; i++) this.modal(out, t + 0.36 + Math.random() * 0.85, { f0: 1300 + Math.random() * 1700, ratios: [1, 1.8, 2.9], T: 0.03, gain: 0.0035 + Math.random() * 0.004, hard: 0.5 });
        if (!near) return;
        this.modal(out, b + 0.004, { f0: 610 * v, ratios: [1, 2.76, 5.4], T: 0.42, gain: 0.012, hard: 0.5 });
        this.tone(out, b + 0.002, { freq: 62 * v, freqEnd: 38, sweep: 0.16, gain: 0.45, attack: 0.002, dur: 0.22 });
        if (this.shellShock) this.shellShock(0.34); else this.duck(0.4, 0.8);
      },
      // xé nắp ba lô: khoá dán + vải dày bung ra
      rpgFlap: () => {
        for (let i = 0; i < 5; i++) this.burst(out, t + i * 0.028 * v, { filter: 'bandpass', freq: 2300 + 800 * Math.random(), Q: 1.2, gain: 0.08, attack: 0.002, dur: 0.03 });
        this.burst(out, t + 0.11, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 950, Q: 0.8, gain: 0.1, attack: 0.012, dur: 0.14 });
      },
      // găng nắm chặt thân đạn: vải cọ, gõ khẽ đầu đạn thép dày
      rpgStrap: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 800, gain: 0.1, attack: 0.002, dur: 0.035 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.9, gain: 0.08, attack: 0.012, dur: 0.1 });
        this.modal(out, t + 0.012, { f0: 880 * v, ratios: [1, 2.3, 3.8], T: 0.05, gain: 0.014, hard: 0.5 });
      },
      // kéo đạn dài khỏi túi: thân cọ vải thành tiếng rít dài, cổ túi rút bật lại, đuôi cánh chạm khẽ khoá ba lô
      rpgDraw: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1050, freqEnd: 1700, sweep: 0.42, Q: 1.1, gain: 0.15, attack: 0.05, dur: 0.46 });
        this.burst(out, t + 0.04, { filter: 'highpass', freq: 3300, gain: 0.018, attack: 0.05, dur: 0.34 });
        this.burst(out, t + 0.44, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 680, gain: 0.08, attack: 0.002, dur: 0.05 });
        this.modal(out, t + 0.45, { f0: 2500 * v, ratios: [1, 1.8, 3], T: 0.03, gain: 0.008, hard: 0.5 });
      },
      // đuôi đạn chạm vành miệng ống: "keng" nhỏ của thép dày
      rpgTip: () => this.modal(out, t, { f0: 1380 * v, ratios: [1, 2.45, 4.1, 5.9], T: 0.11, gain: 0.018, hard: 0.65 }),
      // động cơ trượt trong ống: cọ thép rỗng, cột khí ngắn dần nên cao độ lên, cánh đuôi gõ lòng ống đều đều
      rpgSlide: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 780, freqEnd: 1650, sweep: 0.62, Q: 2.4, gain: 0.08, attack: 0.03, dur: 0.66 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 460, freqEnd: 880, sweep: 0.62, Q: 2.6, gain: 0.11, attack: 0.05, dur: 0.66 });
        this.tone(out, t + 0.04, { type: 'sawtooth', freq: 140, freqEnd: 300, sweep: 0.58, gain: 0.006, attack: 0.05, dur: 0.6, filter: 'bandpass', filterFreq: 1100, Q: 2 });
        for (let i = 0; i < 5; i++) this.metal(out, t + 0.07 + i * 0.112 + Math.random() * 0.02, { f0: (1500 + i * 120) * v, ratios: [1, 2.3], decay: 0.014, gain: 0.018, click: 0.4 });
      },
      // đạn chạm đáy ống: tiếng cộp nặng, ống rỗng ngân theo
      rpgSeat: () => {
        this.modal(out, t, { f0: 520 * v, ratios: [1, 2.05, 3.3, 4.8], T: 0.13, gain: 0.038, hard: 0.85 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520, gain: 0.2, attack: 0.001, dur: 0.06 });
        this.tone(out, t, { freq: 138 * v, freqEnd: 88, sweep: 0.06, gain: 0.08, dur: 0.09 });
        this.modal(out, t + 0.005, { f0: 305 * v, ratios: [1, 2.76, 5.4], T: 0.3, gain: 0.012, hard: 0.3 });
      },
      // xoay đạn cho gờ định vị lọt ngàm miệng ống: cọ ngắn rồi "cách" đanh
      rpgTwist: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1500, Q: 2.6, gain: 0.03, attack: 0.01, dur: 0.11 });
        this.metal(out, t + 0.105, { f0: 1650 * v, ratios: [1, 2.5, 3.9], decay: 0.028, gain: 0.13, click: 0.85 });
      },
      // rút chốt + nắp ngòi: lẫy nhựa bật "póc", chốt thép ngân nhỏ
      rpgCap: () => {
        this.metal(out, t, { f0: 2700 * v, ratios: [1, 1.9], decay: 0.016, gain: 0.05, click: 0.5 });
        this.burst(out, t + 0.026, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1750, Q: 1.6, gain: 0.1, attack: 0.001, dur: 0.025 });
        this.tone(out, t + 0.026, { freq: 680 * v, freqEnd: 340, sweep: 0.03, gain: 0.03, dur: 0.04 });
      },
      // nắp nhựa rơi đất: hai nhịp rỗng, nhẹ
      rpgCapDrop: () => {
        const f = 900 + Math.random() * 300;
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f, Q: 1.2, gain: 0.24, attack: 0.001, dur: 0.022 });
        this.burst(out, t + 0.09 + Math.random() * 0.04, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f * 1.1, Q: 1.2, gain: 0.1, attack: 0.001, dur: 0.016 });
      },
      // ngón cái kéo búa: lò xo căng dần, qua lẫy thứ nhất "tách", khớp lẫy thứ hai "CẠCH"; cuối cùng gạt an toàn
      rpgCock: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1150, freqEnd: 1500, sweep: 0.13, Q: 2.8, gain: 0.04, attack: 0.03, dur: 0.14 });
        this.tone(out, t + 0.01, { type: 'sawtooth', freq: 260, freqEnd: 440, sweep: 0.12, gain: 0.006, attack: 0.03, dur: 0.13 });
        this.metal(out, t + 0.09, { f0: 1950 * v, ratios: [1, 2.4], decay: 0.016, gain: 0.07, click: 0.6 });
        this.metal(out, t + 0.15, { f0: 1020 * v, ratios: [1, 2.35, 3.7], decay: 0.05, gain: 0.155, click: 0.95 });
        this.burst(out, t + 0.15, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 640, gain: 0.08, attack: 0.001, dur: 0.035 });
        this.metal(out, t + 0.34, { f0: 2500 * v, ratios: [1, 2.5], decay: 0.014, gain: 0.05, click: 0.5 });
      },
      // ống tì lên đỉnh vai: đệm dội nhẹ vào giáp, khoen dây đeo leng keng
      rpgShoulder: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 460, gain: 0.16, attack: 0.002, dur: 0.06 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1200, Q: 0.8, gain: 0.05, attack: 0.008, dur: 0.1 });
        for (const d of [0.05, 0.11]) this.metal(out, t + d + Math.random() * 0.02, { f0: (3100 + Math.random() * 500) * v, ratios: [1, 1.8], decay: 0.018, gain: 0.018, click: 0.2 });
      },
      // bóp lẫy cứng: lò xo nén rồi chốt nhả
      atrLatch: () => {
        this.modal(out, t, { f0: 2900 * v, ratios: [1, 1.8, 3.1], T: 0.018, gain: 0.03, hard: 0.7 });
        this.metal(out, t + 0.038, { f0: 1350 * v, ratios: [1, 2.2], decay: 0.028, gain: 0.1, click: 0.6 });
      },
      // băng tuột khỏi ổ: thép cọ thép, đạn còn trong băng va nhau, rời ổ "cộc"
      atrMagOut: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1150, freqEnd: 620, sweep: 0.18, Q: 1.7, gain: 0.08, attack: 0.012, dur: 0.2 });
        for (let i = 0; i < 3; i++) this.modal(out, t + 0.04 + i * 0.05 + Math.random() * 0.02, { f0: 1500 + Math.random() * 900, ratios: [1, 1.71, 2.74], T: 0.03, gain: 0.006, hard: 0.5 });
        this.metal(out, t + 0.2, { f0: 580 * v, ratios: [1, 2.3, 3.5], decay: 0.045, gain: 0.1, click: 0.5 });
      },
      // băng thép ~1,5 kg rơi xuống đất: tiếng đục, vang thép ngắn, nảy một nhịp
      atrMagDrop: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 460, gain: 0.18, attack: 0.001, dur: 0.06 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 0.7, gain: 0.05, attack: 0.002, dur: 0.05 });
        this.modal(out, t, { f0: 480 * v, ratios: [1, 1.9, 3.1, 4.7], T: 0.1, gain: 0.03, hard: 0.6 });
        this.modal(out, t + 0.14, { f0: 505 * v, ratios: [1, 1.9, 3.1], T: 0.06, gain: 0.012, hard: 0.4 });
      },
      // bao vải dày: mở khoá dán rồi vải cọ, băng trong bao chạm nhau
      atrPouch: () => {
        this.burst(out, t, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'highpass', freq: 2100, gain: 0.07, attack: 0.012, dur: 0.11 });
        this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1000, Q: 0.8, gain: 0.12, attack: 0.03, dur: 0.2 });
        this.modal(out, t + 0.14, { f0: 860 * v, ratios: [1, 2.1, 3.4], T: 0.05, gain: 0.012, hard: 0.5 });
      },
      // khuỷu tay / áo giáp cọ đất khi người xoay
      atrBody: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 850, Q: 0.7, gain: 0.08, attack: 0.05, dur: 0.3 });
        this.burst(out, t + 0.03, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'highpass', freq: 3200, gain: 0.018, attack: 0.03, dur: 0.2 });
      },
      // móc mũi băng vào ổ
      atrRock: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1800, Q: 2.4, gain: 0.04, attack: 0.004, dur: 0.05 });
        this.metal(out, t + 0.035, { f0: 1380 * v, ratios: [1, 2.4], decay: 0.022, gain: 0.08, click: 0.5 });
      },
      // đẩy băng khít: cọ thép ngắn, lẫy sập "CẠCH" trầm, đạn trong băng dồn lại
      atrMagIn: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1450, freqEnd: 800, sweep: 0.06, Q: 1.8, gain: 0.05, attack: 0.005, dur: 0.07 });
        this.metal(out, t + 0.05, { f0: 860 * v, ratios: [1, 2.5, 3.9], decay: 0.05, gain: 0.16, click: 0.9 });
        this.burst(out, t + 0.05, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 600, gain: 0.12, attack: 0.001, dur: 0.05 });
        for (let i = 0; i < 2; i++) this.modal(out, t + 0.07 + i * 0.035, { f0: 1700 + Math.random() * 600, ratios: [1, 1.71, 2.74], T: 0.03, gain: 0.006, hard: 0.5 });
      },
      // gót bàn tay vỗ đế băng: tiếng thịt + găng, thân súng ngân nhẹ
      atrSlap: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 560, gain: 0.26, attack: 0.001, dur: 0.035 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.8, gain: 0.08, attack: 0.001, dur: 0.025 });
        this.metal(out, t + 0.004, { f0: 420 * v, ratios: [1, 2.2, 3.4], decay: 0.08, gain: 0.05, click: 0.2 });
      },
      // giật thử băng xem khoá chưa
      atrTug: () => this.metal(out, t, { f0: 1150 * v, ratios: [1, 2.3], decay: 0.02, gain: 0.05, click: 0.4 }),
      // găng tay nắm lại báng / chân sau
      atrGrip: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 850, gain: 0.08, attack: 0.002, dur: 0.03 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 1, gain: 0.03, attack: 0.008, dur: 0.06 });
      },
      // nâng tay khoá: vấu khoá nhả khỏi hộp khoá "cắc", núm gõ khẽ mép khe
      atrBoltUp: () => {
        this.metal(out, t, { f0: 1350 * v, ratios: [1, 2.3, 3.7], decay: 0.03, gain: 0.16, click: 0.8 });
        this.burst(out, t + 0.012, { filter: 'bandpass', freq: 1900, freqEnd: 1300, sweep: 0.06, Q: 2, gain: 0.04, attack: 0.004, dur: 0.06 });
        this.metal(out, t + 0.075, { f0: 980 * v, ratios: [1, 2.4], decay: 0.025, gain: 0.07, click: 0.5 });
      },
      // kéo khoá hết về sau: móc kéo giật vỏ khỏi buồng "bựt", thép cọ dọc ray, vỏ đồng lớn bật ra cửa văng va mép "keng", khoá chạm chốt chặn sau
      atrBoltBack: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 650, gain: 0.08, attack: 0.002, dur: 0.03 });
        this.metal(out, t + 0.008, { f0: 1600 * v, ratios: [1, 2.4], decay: 0.018, gain: 0.07, click: 0.5 });
        this.burst(out, t + 0.02, { filter: 'bandpass', freq: 1250, freqEnd: 1750, sweep: 0.16, Q: 2.2, gain: 0.07, attack: 0.02, dur: 0.17 });
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 3200, Q: 1.2, gain: 0.025, attack: 0.02, dur: 0.15 });
        this.modal(out, t + 0.14, { f0: 2150 * v, ratios: [1, 1.62, 2.7, 3.9], T: 0.22, gain: 0.02, hard: 0.5 });
        this.metal(out, t + 0.195, { f0: 760 * v, ratios: [1, 2.3, 3.6], decay: 0.05, gain: 0.17, click: 0.8 });
        this.burst(out, t + 0.195, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520, gain: 0.09, attack: 0.001, dur: 0.05 });
      },
      // hạ tay khoá: vấu xoay vào khấc khoá "cạch" gọn, thân súng nặng hấp thụ, nòng ngân nhẹ
      atrBoltLock: () => {
        this.metal(out, t, { f0: 1100 * v, ratios: [1, 2.4, 3.8], decay: 0.035, gain: 0.2, click: 1 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 560, gain: 0.1, attack: 0.001, dur: 0.045 });
        this.modal(out, t + 0.004, { f0: 420 * v, ratios: [1, 2.76, 5.4], T: 0.2, gain: 0.008, hard: 0.35 });
      },
      // vỏ đồng 20 mm rơi: nền cứng "keng" trầm nảy vài nhịp, đất / cỏ "bịch" đục, nước "tõm"
      atrCaseDrop: () => {
        if (k === 2) { this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, freqEnd: 1700, sweep: 0.07, Q: 1.6, gain: 0.08, attack: 0.002, dur: 0.1 }); return; }
        if (k === 1) {
          this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 520, gain: 0.13, attack: 0.001, dur: 0.05 });
          this.modal(out, t, { f0: 780 + Math.random() * 160, ratios: [1, 1.71, 2.74], T: 0.06, gain: 0.01, hard: 0.25 });
          return;
        }
        const f = 820 + Math.random() * 220;
        this.modal(out, t, { f0: f, ratios: [1, 1.71, 2.74, 3.9], T: 0.28, gain: 0.045, hard: 0.55 });
        this.modal(out, t + 0.16, { f0: f * 1.02, ratios: [1, 1.71, 2.74], T: 0.16, gain: 0.02, hard: 0.4 });
        this.modal(out, t + 0.27, { f0: f * 1.04, ratios: [1, 1.71], T: 0.08, gain: 0.008, hard: 0.3 });
      },
      // đẩy khoá tới: thép trượt, mặt khoá tước viên trên cùng khỏi môi băng "lụp", đạn lớn trượt vào buồng rồi khoá chạm đuôi nòng "cộp" chắc
      atrBoltFwd: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1700, freqEnd: 1150, sweep: 0.13, Q: 2, gain: 0.06, attack: 0.012, dur: 0.13 });
        this.metal(out, t + 0.05, { f0: 1250 * v, ratios: [1, 2.2], decay: 0.02, gain: 0.07, click: 0.5 });
        this.burst(out, t + 0.05, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 600, gain: 0.06, attack: 0.002, dur: 0.04 });
        this.metal(out, t + 0.15, { f0: 690 * v, ratios: [1, 2.3, 3.7, 5.1], decay: 0.06, gain: 0.15, click: 0.9 });
        this.burst(out, t + 0.15, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 480, gain: 0.12, attack: 0.001, dur: 0.06 });
        this.modal(out, t + 0.155, { f0: 355 * v, ratios: [1, 2.76, 5.4], T: 0.26, gain: 0.01, hard: 0.35 });
      },
      // bấm lẫy nhả băng, băng trượt khỏi ổ
      magOut: () => {
        this.metal(out, t, { f0: 2500 * v, ratios: [1, 2.3], decay: 0.02, gain: 0.12, click: 0.6 });
        this.burst(out, t + 0.03, { filter: 'bandpass', freq: 1700, freqEnd: 900, sweep: 0.12, Q: 1.4, gain: 0.07, attack: 0.01, dur: 0.14 });
      },
      // băng cọ vải túi
      magPouch: () => { this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 0.9, gain: 0.1, attack: 0.02, dur: 0.16 }); },
      // băng khít ổ, lẫy khoá "cách"
      magIn: () => {
        this.metal(out, t, { f0: 1500 * v, ratios: [1, 2.5, 3.9], decay: 0.035, gain: 0.2, click: 0.8 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 700, gain: 0.14, dur: 0.05 });
      },
      // lòng bàn tay vỗ đáy băng
      magSlap: () => { this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 900, gain: 0.24, attack: 0.001, dur: 0.05 }); this.metal(out, t, { f0: 900 * v, ratios: [1, 2.2], decay: 0.03, gain: 0.05, click: 0.3 }); },
      // kéo khoá nòng về sau / nhả cho lò xo đóng mạnh, đưa đạn lên nòng
      boltBack: () => { this.burst(out, t, { filter: 'bandpass', freq: 2100, freqEnd: 1300, sweep: 0.12, Q: 2, gain: 0.08, attack: 0.02, dur: 0.14 }); this.metal(out, t + 0.12, { f0: 1100 * v, ratios: [1, 2.4], decay: 0.03, gain: 0.12, click: 0.6 }); },
      boltFwd: () => { this.metal(out, t, { f0: 1300 * v, ratios: [1, 2.3, 3.7], decay: 0.05, gain: 0.26, click: 0.9 }); this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 650, gain: 0.16, dur: 0.06 }); },
      // bóp cò vào buồng rỗng: chỉ còn búa đập "tách"
      dry: () => {
        this.metal(out, t, { f0: 2150 * v, ratios: [1, 2.6, 4.2], decay: 0.03, gain: 0.17, click: 0.8 });
        this.burst(out, t + 0.002, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, gain: 0.08, dur: 0.03 });
      },
      // hạ súng / đưa lên vai: vải cọ giáp, khoen dây leng keng
      cloth: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, Q: 0.8, gain: 0.1, attack: 0.05, dur: 0.26 });
        this.metal(out, t + 0.1 + Math.random() * 0.08, { f0: 3100 * v, ratios: [1, 1.8], decay: 0.02, gain: 0.025, click: 0.2 });
      },
      // gạt lẫy khung: hai tiếng thép nhỏ
      // SƠ CỨU: khoá dán túi ngực xé ra
      aidRip: () => {
        for (let i = 0; i < 7; i++) this.burst(out, t + i * 0.024 * v, { filter: 'bandpass', freq: 2400 + 700 * Math.random(), Q: 1.3, gain: 0.17, attack: 0.002, dur: 0.028 });
      },
      // ống tiêm tự động: lẫy lò xo bật, thuốc xì qua kim
      aidJab: () => {
        this.metal(out, t, { f0: 2500 * v, ratios: [1, 2.3], decay: 0.022, gain: 0.06, click: 0.5 });
        this.snap(out, t, 0.07, 2400, 1.4);
        this.burst(out, t + 0.03, { filter: 'bandpass', freq: 3300, Q: 1.2, gain: 0.035, attack: 0.02, dur: 0.32 });
      },
      // xé bao băng
      aidPack: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 3800 * v, freqEnd: 5200, sweep: 0.2, Q: 0.8, gain: 0.085, attack: 0.012, dur: 0.24 });
        this.burst(out, t + 0.02, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 0.8, gain: 0.07, attack: 0.02, dur: 0.2 });
      },
      // vải băng kéo căng, quấn một vòng
      aidWrap: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1250 * v, freqEnd: 1900, sweep: 0.42, Q: 0.9, gain: 0.14, attack: 0.09, dur: 0.46 });
      },
      // nút băng: giật dây vải
      aidTie: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100 * v, Q: 1.1, gain: 0.17, attack: 0.008, dur: 0.1 });
        this.burst(out, t + 0.11, { filter: 'bandpass', freq: 1800 * v, Q: 1.1, gain: 0.1, attack: 0.005, dur: 0.07 });
      },
      latch: () => {
        this.modal(out, t, { f0: 2500 * v, ratios: [1, 1.9, 3.2], T: 0.02, gain: 0.018, hard: 0.6 });   // ngón cái đè lò xo lẫy
        this.metal(out, t + 0.055, { f0: 1750 * v, ratios: [1, 2.4, 3.9], decay: 0.04, gain: 0.15, click: 0.7 });
        this.metal(out, t + 0.09, { f0: 950 * v, ratios: [1, 2.2], decay: 0.04, gain: 0.1, click: 0.5 });
      },
      // bản lề rít nhẹ khi cụm trước xoay, đập vào cữ rồi nảy lại. k = 1: còn vỏ đã bắn lỏng trong buồng thì chúng va nhau theo
      open: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1150, freqEnd: 720, sweep: 0.2, Q: 3, gain: 0.05, attack: 0.04, dur: 0.22 });
        this.metal(out, t + 0.235, { f0: 540 * v, ratios: [1, 2.31, 3.9], decay: 0.1, gain: 0.085, click: 0.5 });
        this.tone(out, t + 0.235, { freq: 135, freqEnd: 90, sweep: 0.05, gain: 0.035, dur: 0.07 });
        this.metal(out, t + 0.3, { f0: 560 * v, ratios: [1, 2.31], decay: 0.03, gain: 0.025, click: 0.3 });
        if (k) for (let i = 0; i < 3; i++) this.modal(out, t + 0.245 + i * 0.03 + Math.random() * 0.015, { f0: 1400 + Math.random() * 800, ratios: [1, 1.71, 2.74], T: 0.04, gain: 0.007, hard: 0.4 });
      },
      // dốc nòng / giật súng: các vỏ rỗng xô dịch trong buồng
      caseShift: () => {
        this.burst(out, t, { filter: 'bandpass', freq: 1700, freqEnd: 1100, sweep: 0.08, Q: 2.4, gain: 0.03, attack: 0.008, dur: 0.09 });
        for (let i = 0; i < 4; i++) this.modal(out, t + 0.012 + i * 0.024 + Math.random() * 0.012, { f0: 1350 + Math.random() * 900, ratios: [1, 1.71, 2.74], T: 0.035, gain: 0.008, hard: 0.45 });
      },
      // một vỏ nhôm trượt theo lòng buồng thép rồi rời miệng buồng
      caseSlide: () => {
        this.burst(out, t, { filter: 'bandpass', freq: (1800 + Math.random() * 400) * v, freqEnd: 950, sweep: 0.07, Q: 2.4, gain: 0.07, attack: 0.006, dur: 0.08 });
        this.modal(out, t + 0.075, { f0: 1500 + Math.random() * 500, ratios: [1, 1.71, 2.74, 3.9], T: 0.05, gain: 0.011, hard: 0.5 });
      },
      // một vỏ nhôm rỗng chạm đất. k: 0 nền cứng (ngân, nảy), 1 đất / cỏ (đục, gần như không nảy), 2 nước
      caseDrop: () => {
        if (k === 2) { this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1300, freqEnd: 2300, sweep: 0.05, Q: 1.8, gain: 0.05, attack: 0.002, dur: 0.07 }); return; }
        if (k === 1) {
          this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 620, gain: 0.09, attack: 0.001, dur: 0.035 });
          this.modal(out, t, { f0: 1000 + Math.random() * 300, ratios: [1, 1.71, 2.74], T: 0.035, gain: 0.006, hard: 0.2 });
          return;
        }
        const f = (1250 + Math.random() * 600);
        this.modal(out, t, { f0: f, ratios: [1, 1.71, 2.74, 3.9], T: 0.16, gain: 0.03, hard: 0.5 });
        this.modal(out, t + 0.1 + Math.random() * 0.06, { f0: f * 1.03, ratios: [1, 1.71, 2.74], T: 0.08, gain: 0.012, hard: 0.35 });
        this.modal(out, t + 0.2 + Math.random() * 0.06, { f0: f * 1.05, ratios: [1, 1.71], T: 0.05, gain: 0.005, hard: 0.25 });
      },
      // rút đạn khỏi vòng giữ trên băng đeo: vải + chun bật lại, viên kế bên khẽ chạm
      pouch: () => {
        this.burst(out, t, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'highpass', freq: 2200, gain: 0.07, attack: 0.008, dur: 0.09 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1450, Q: 0.9, gain: 0.1, attack: 0.015, dur: 0.14 });
        this.burst(out, t + 0.1, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1000, Q: 1.4, gain: 0.05, attack: 0.002, dur: 0.03 });
        this.modal(out, t + 0.115, { f0: 1600 * v, ratios: [1, 1.71, 2.74], T: 0.035, gain: 0.008, hard: 0.4 });
      },
      // găng tay nắm vào thép
      glove: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 850, gain: 0.07, attack: 0.002, dur: 0.03 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1500, Q: 1, gain: 0.025, attack: 0.008, dur: 0.05 });
      },
      // giật dây băng đạn: vải cọ giáp, các viên nhôm va nhau khẽ
      belt: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1100, Q: 0.8, gain: 0.16, attack: 0.03, dur: 0.24 });
        this.burst(out, t + 0.02, { filter: 'highpass', freq: 3000, gain: 0.025, attack: 0.03, dur: 0.18 });
        for (let i = 0; i < 3; i++) this.modal(out, t + 0.05 + i * 0.05 + Math.random() * 0.03, { f0: 1500 + Math.random() * 700, ratios: [1, 1.71, 2.74], T: 0.05, gain: 0.025, hard: 0.4 });
      },
      // đạn trượt theo lòng buồng, vành đuôi chạm miệng buồng "cộp" (đạn nặng ~230 g nên có khối, nhưng vẫn là tiếng nhỏ)
      seat: () => {
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1550, freqEnd: 820, sweep: 0.1, Q: 1.6, gain: 0.08, attack: 0.012, dur: 0.11 });
        this.tone(out, t + 0.1, { freq: 245 * v, freqEnd: 150, sweep: 0.04, gain: 0.05, dur: 0.05 });
        this.modal(out, t + 0.1, { f0: 650 * v, ratios: [1, 2.1, 3.3, 4.6], T: 0.09, gain: 0.03, hard: 0.6 });
      },
      // chốt định vị ổ đạn nhảy qua một buồng. k 0..1: lò xo càng căng, tiếng càng cao và chắc
      index: () => {
        this.metal(out, t, { f0: (2150 + 650 * k) * v, ratios: [1, 2.7], decay: 0.022, gain: 0.07 + 0.035 * k, click: 0.6 });
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 900, gain: 0.025 + 0.03 * k, attack: 0.001, dur: 0.018 });
      },
      // lò xo xoắn trong ổ rên theo mỗi lần vặn, căng dần theo k
      windCreak: () => {
        this.tone(out, t, { type: 'sawtooth', freq: 300 + 240 * k, freqEnd: 390 + 280 * k, sweep: 0.22, gain: 0.009 + 0.009 * k, attack: 0.03, dur: 0.22, filter: 'bandpass', filterFreq: 1700, Q: 3 });
        this.burst(out, t, { filter: 'bandpass', freq: 1250 + 400 * k, Q: 3, gain: 0.018, attack: 0.03, dur: 0.2 });
      },
      // ổ đạn lên hết dây: cữ cuối
      windEnd: () => this.metal(out, t, { f0: 1150 * v, ratios: [1, 2.3, 3.7], decay: 0.05, gain: 0.13, click: 0.6 }),
      // đẩy cụm trước về: bản lề cọ
      close: () => this.burst(out, t, { filter: 'bandpass', freq: 860, freqEnd: 1250, sweep: 0.3, Q: 2.4, gain: 0.04, attack: 0.05, dur: 0.3 }),
      // khung sập vào khối sau: thép đập thép "CẠCH" nặng, lẫy bật khoá ngay sau, đạn trong ổ rung
      slam: () => {
        this.modal(out, t, { f0: 480 * v, ratios: [1, 1.9, 2.8, 4.1], T: 0.13, gain: 0.038, hard: 0.85 });
        this.tone(out, t, { freq: 112, freqEnd: 72, sweep: 0.05, gain: 0.045, dur: 0.07 });
        this.metal(out, t + 0.026, { f0: 1550 * v, ratios: [1, 2.5, 4], decay: 0.03, gain: 0.08, click: 0.8 });
        this.modal(out, t + 0.03, { f0: 1500 + Math.random() * 500, ratios: [1, 1.71, 2.74], T: 0.04, gain: 0.006, hard: 0.4 });
      },
      // lựu 40 mm nổ: lượng nổ nhỏ nên đanh, ngắn hơn hẳn đạn pháo; mảnh + đất rơi lào xào theo sau
      blast: () => {
        this.snap(out, t, 0.85, 5200, 2.4);
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 560 * v, drive: 2, gain: 1.5, attack: 0.002, dur: 0.3 });
        this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400 * v, Q: 0.7, drive: 1.6, gain: 0.6, attack: 0.001, dur: 0.12 });
        this.tone(out, t, { freq: 92 * v, freqEnd: 44, sweep: 0.22, gain: 0.6, attack: 0.002, dur: 0.28 });
        if (distance < 1200) this.burst(out, t + 0.07, { buffer: this.crackleBuffer || this.noiseBuffer, filter: 'bandpass', freq: 2500, Q: 0.6, gain: 0.14, attack: 0.05, dur: 0.55 });
        if (this.playTerrainEchoes) this.playTerrainEchoes(t, 0.16 * Math.sqrt(sp.gain), sp.lowpass);
      },
      // chưa đủ khoảng cách kích hoạt ngòi: chỉ là cục kim loại đập đất, không nổ
      dud: () => {
        this.burst(out, t, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, gain: 0.5, attack: 0.002, dur: 0.09 });
        this.modal(out, t, { f0: 720 * v, ratios: [1, 1.9, 3.1], T: 0.1, gain: 0.1, hard: 0.4 });
      }
    };
    if (S[name]) S[name]();
  }
});
