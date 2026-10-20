/**
 * ĐỘNG CƠ XE MÌNH: máy diesel, turbo, xích sắt / lốp, khởi động, sang số.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 6. ĐỘNG CƠ DIESEL, TURBO, XÍCH SẮT / LỐP XE
  // ===========================================================================
  setupEngineAndTrackSound() {
    try {
      const ctx = this.ctx;
      const e = {};

      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(this.vehicleBus);

      // Kênh riêng của tiếng máy: cắt siêu trầm dưới ~55 Hz (2 tầng) — phần dưới đó loa / tai nghe chỉ phát thành
      // tiếng "ù ù" đè nén, không làm tiếng máy dày hơn
      const eout = ctx.createGain();
      eout.gain.value = 1;
      e.habit = eout;   // giảm dần khi đứng chờ lâu (tai quen tiếng máy)
      const hp1 = ctx.createBiquadFilter();
      hp1.type = 'highpass';
      hp1.frequency.value = 55;
      hp1.Q.value = 0.6;
      const hp2 = ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = 45;
      hp2.Q.value = 0.6;
      // Cắt dải trên ~2 kHz: máy diesel nghe qua thân xe là tiếng gầm trầm-trung; để nguyên dải 1-4 kHz rung theo nhịp nổ
      // (55-180 Hz, đúng cao độ giọng người) thì tai nghe thành tiếng "è è" kèn kazoo / còi rè
      const lpOut = ctx.createBiquadFilter();
      lpOut.type = 'lowpass';
      lpOut.frequency.value = 1800;
      lpOut.Q.value = 0.5;
      // "ngực" của tiếng máy: nhấn dải 90-160 Hz — vùng loa / tai nghe thường vẫn phát được, nghe ra sức nặng khối máy
      const chest = ctx.createBiquadFilter();
      chest.type = 'peaking';
      chest.frequency.value = 120;
      chest.Q.value = 0.8;
      chest.gain.value = 5;
      eout.connect(hp1);
      hp1.connect(hp2);
      hp2.connect(chest);
      chest.connect(lpOut);
      // Gằn máy khi đạp ga (bão hòa song song): một nhánh tiếng máy được ép méo tanh rồi trộn lại — xung nổ dày, đặc, "gầm"
      // như máy đang gồng hết công suất; nhả ga thì nhánh này tắt, máy về tiếng tròn. Cắt trên ~1 kHz để phần méo
      // không thành tiếng rè ở dải trên
      e.satIn = ctx.createGain();
      e.satIn.gain.value = 0;
      const sat = ctx.createWaveShaper();
      sat.curve = this.getShaper(3);
      const satLp = ctx.createBiquadFilter();
      satLp.type = 'lowpass';
      satLp.frequency.value = 950;
      satLp.Q.value = 0.5;
      e.satOut = ctx.createGain();
      e.satOut.gain.value = 0;
      chest.connect(e.satIn);
      e.satIn.connect(sat);
      // bỏ phần siêu trầm của nhánh méo: chỉ lấy tiếng gằn 120-900 Hz (loa nhỏ vẫn phát được), không thêm ù
      const satHp = ctx.createBiquadFilter();
      satHp.type = 'highpass';
      satHp.frequency.value = 120;
      satHp.Q.value = 0.6;
      sat.connect(satHp);
      satHp.connect(satLp);
      satLp.connect(e.satOut);
      e.satOut.connect(lpOut);
      // Cộng hưởng ống xả: khối khí trong ống xả dài cộng hưởng ở ~70-110 Hz -> tiếng "ùm" đầy, nặng khi gầm máy
      e.pipe = ctx.createBiquadFilter();
      e.pipe.type = 'peaking';
      e.pipe.frequency.value = 90;
      e.pipe.Q.value = 1.4;
      e.pipe.gain.value = 0;
      lpOut.connect(e.pipe);
      e.pipe.connect(out);
      e.hp1 = hp1;
      e.hp2 = hp2;

      // Đồng hồ nhịp nổ xi-lanh (răng cưa): KHÔNG phát trực tiếp — chỉ tạo xung phụt ống xả / gõ kim phun.
      // Phát thẳng răng cưa (đủ mọi họa âm, đều tăm tắp) nghe thành tiếng "è è" như kèn
      e.fire = ctx.createOscillator();
      e.fire.type = 'sawtooth';
      e.fire.frequency.value = 28;
      e.crank = ctx.createOscillator();
      e.crank.type = 'sine';
      e.crank.frequency.value = 27;
      // 2 tầng thông thấp không cộng hưởng cho thân tiếng máy (bậc trục khuỷu bên dưới)
      e.engineFilter = ctx.createBiquadFilter();
      e.engineFilter.type = 'lowpass';
      e.engineFilter.frequency.value = 380;
      e.engineFilter.Q.value = 0.7;
      e.engineFilter2 = ctx.createBiquadFilter();
      e.engineFilter2.type = 'lowpass';
      e.engineFilter2.frequency.value = 380;
      e.engineFilter2.Q.value = 0.5;
      e.engineFilter.connect(e.engineFilter2);
      e.engineGain = ctx.createGain();
      e.engineGain.gain.value = 0.0;

      // Máy thật không nổ đều tuyệt đối: mỗi xi-lanh, mỗi lần phun hơi khác nhau -> vòng tua chao nhẹ ngẫu nhiên
      // và biên độ từng nhát nổ dao động. Dùng nhiễu lọc chậm (không tuần hoàn, nên không thành tiếng "phạch phạch" trực thăng)
      const jit = ctx.createBufferSource();
      jit.buffer = this.pinkNoiseBuffer;
      jit.loop = true;
      const jitF = ctx.createBiquadFilter();
      jitF.type = 'lowpass';
      jitF.frequency.value = 7;
      e.jitterDepth = ctx.createGain();
      e.jitterDepth.gain.value = 0;
      jit.connect(jitF);
      jitF.connect(e.jitterDepth);
      e.jitterDepth.connect(e.fire.frequency);
      const jitHalf = ctx.createGain();
      jitHalf.gain.value = 0.5;
      e.jitterDepth.connect(jitHalf);
      jitHalf.connect(e.crank.frequency);
      const rough = ctx.createBufferSource();
      rough.buffer = this.pinkNoiseBuffer;
      rough.loop = true;
      const roughF = ctx.createBiquadFilter();
      roughF.type = 'lowpass';
      roughF.frequency.value = 22;
      const roughDepth = ctx.createGain();
      roughDepth.gain.value = 3.5;
      e.roughDepth = roughDepth;
      const engAm = ctx.createGain();
      engAm.gain.value = 1;
      rough.connect(roughF);
      roughF.connect(roughDepth);
      roughDepth.connect(engAm.gain);
      // Thân tiếng máy: các BẬC của trục khuỷu (0.5, 1, 1.5, 2, 3, 4 × tần số nổ) bằng sóng sin tròn, mỗi bậc to nhỏ
      // chậm ngẫu nhiên. Răng cưa (đủ mọi họa âm, đều tăm tắp) nghe thành tiếng "è è" kèn; nhiễu dải hẹp điều biên theo
      // nhịp nổ nghe thành "rè rè" loa rè. Bậc nửa (0.5) cho tiếng "lục bục" lệch nhịp đặc trưng của máy nhiều xi-lanh
      const ORD = [[0.5, 0.3], [1, 1], [1.5, 0.35], [2, 0.6], [3, 0.3], [4, 0.14]];
      e.orders = [];
      const bank = ctx.createGain();
      bank.gain.value = 0.5;
      ORD.forEach(([k, a], i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 60 * k;
        const jg = ctx.createGain();
        jg.gain.value = k;
        e.jitterDepth.connect(jg);
        jg.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = a;
        const n = ctx.createBufferSource();
        n.buffer = this.pinkNoiseBuffer;
        n.loop = true;
        n.playbackRate.value = 0.71 + i * 0.13;
        const nf = ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = 3 + i * 1.3;
        const nd = ctx.createGain();
        nd.gain.value = a * 7;
        n.connect(nf);
        nf.connect(nd);
        nd.connect(g.gain);
        o.connect(g);
        g.connect(bank);
        o.start();
        n.start(0, i * 0.37);
        e.orders.push({ o, k, g });
      });
      bank.connect(e.engineFilter);
      e.engineFilter2.connect(engAm);
      engAm.connect(e.engineGain);
      e.engineGain.connect(eout);

      // Xung theo nhịp nổ (răng cưa -> xung hẹp) dùng để "phụt" ống xả & gõ kim phun đúng từng nhát nổ
      const pulseShape = ctx.createWaveShaper();
      const pc = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; pc[i] = x > 0.55 ? Math.pow((x - 0.55) / 0.45, 1.5) : 0; }
      pulseShape.curve = pc;
      e.fire.connect(pulseShape);

      // Tiếng cháy nổ thô ráp: nhiễu hồng điều biên theo nhịp nổ
      const comb = ctx.createBufferSource();
      comb.buffer = this.pinkNoiseBuffer;
      comb.loop = true;
      const combF = ctx.createBiquadFilter();
      combF.type = 'bandpass';
      combF.frequency.value = 450;
      combF.Q.value = 0.5;
      e.combFilter = combF;
      e.combAm = ctx.createGain();
      e.combAm.gain.value = 0.5;
      e.combLfoDepth = ctx.createGain();
      e.combLfoDepth.gain.value = 0.08;
      e.fire.connect(e.combLfoDepth);
      e.combLfoDepth.connect(e.combAm.gain);
      e.combGain = ctx.createGain();
      e.combGain.gain.value = 0;
      comb.connect(combF);
      combF.connect(e.combAm);
      e.combAm.connect(e.combGain);
      e.combGain.connect(eout);

      // Tiếng gõ "lạch cạch" của máy diesel (kim phun, xu-páp): vài tiếng tách RỜI RẠC, ngẫu nhiên mỗi giây (lên lịch
      // trong updateEngine). Không gõ theo từng nhát nổ: 75-180 nhát/giây ở dải 1-2 kHz tai không nghe ra "lạch cạch"
      // mà nghe thành một nốt rè "è è" ở dải trên
      e.clatterOut = ctx.createGain();
      e.clatterOut.gain.value = 1;
      e.clatterOut.connect(eout);

      // Turbo rít nhẹ theo vòng tua
      e.turbo = ctx.createOscillator();
      e.turbo.type = 'sine';
      e.turbo.frequency.value = 1800;
      e.turboGain = ctx.createGain();
      e.turboGain.gain.value = 0;
      e.turbo.connect(e.turboGain);
      e.turboGain.connect(out);

      // Lớp dải trên KHÔNG đi qua bộ cắt 1.8 kHz của tiếng máy (vẫn chịu "quen tai" khi đứng chờ lâu)
      e.habitHi = ctx.createGain();
      e.habitHi.gain.value = 1;
      e.habitHi.connect(out);
      // Quạt làm mát khoang máy + bánh răng, bơm, dây đai: luồng gió / tiếng cơ khí băng rộng theo vòng tua. Xe tăng thật
      // nghe rõ tiếng quạt "vù vù" lẫn trong tiếng máy. Không điều biên theo nhịp nổ (chỉ chao chậm ngẫu nhiên) nên không
      // thành tiếng "è è" ở dải trên, mà làm tiếng máy bớt "tròn trịa" như đàn điện tử
      const mech = ctx.createBufferSource();
      mech.buffer = this.pinkNoiseBuffer;
      mech.loop = true;
      e.mechFilter = ctx.createBiquadFilter();
      e.mechFilter.type = 'bandpass';
      e.mechFilter.frequency.value = 700;
      e.mechFilter.Q.value = 0.45;
      const mechAm = ctx.createGain();
      mechAm.gain.value = 1;
      const mechRnd = ctx.createGain();
      mechRnd.gain.value = 3;
      jitF.connect(mechRnd);
      mechRnd.connect(mechAm.gain);
      e.mechGain = ctx.createGain();
      e.mechGain.gain.value = 0;
      mech.connect(e.mechFilter);
      e.mechFilter.connect(mechAm);
      mechAm.connect(e.mechGain);
      e.mechGain.connect(e.habitHi);
      // Cửa hút gió / máy nén turbo: tiếng "hút xì" băng rộng theo tốc độ quay của turbo (turbo có quán tính: gằn ga
      // thì vọt lên sau ~0.5 s, nhả ga vẫn quay trớn rít nhỏ dần)
      const air = ctx.createBufferSource();
      air.buffer = this.noiseBuffer;
      air.loop = true;
      e.airFilter = ctx.createBiquadFilter();
      e.airFilter.type = 'bandpass';
      e.airFilter.frequency.value = 2400;
      e.airFilter.Q.value = 0.9;
      e.airGain = ctx.createGain();
      e.airGain.gain.value = 0;
      air.connect(e.airFilter);
      e.airFilter.connect(e.airGain);
      e.airGain.connect(e.habitHi);
      mech.start(0, 0.83);
      air.start(0, 1.7);

      // Ống xả: luồng khí phụt từng nhát theo nhịp nổ ("phụt phụt" trầm), không phải tiếng ù liên tục
      const exh = ctx.createBufferSource();
      exh.buffer = this.brownNoiseBuffer;
      exh.loop = true;
      const exhF = ctx.createBiquadFilter();
      exhF.type = 'lowpass';
      exhF.frequency.value = 340;
      exhF.Q.value = 0.6;
      e.exhaustFilter = exhF;
      const exhAm = ctx.createGain();
      exhAm.gain.value = 0.6;
      // Xung nổ được LÀM MỀM (lọc thông thấp theo nhịp nổ) trước khi điều biên: đóng/mở nhiễu gần 100% bằng xung cạnh sắc
      // ở 50-150 Hz đúng là vùng tai nghe thành độ "nhám / rè rè" mạnh nhất; nhịp mềm thì thành tiếng gầm "ùng ục"
      e.pulseSmooth = ctx.createBiquadFilter();
      e.pulseSmooth.type = 'lowpass';
      e.pulseSmooth.frequency.value = 90;
      e.pulseSmooth.Q.value = 0.5;
      const pulseAmt = ctx.createGain();
      pulseAmt.gain.value = 1.2;
      pulseShape.connect(e.pulseSmooth);
      e.pulseSmooth.connect(pulseAmt);
      pulseAmt.connect(exhAm.gain);
      // mỗi nhát phụt mạnh yếu khác nhau -> tiếng gầm "ùng ục" thô ráp chứ không thành một nốt nhạc đều
      const exhRnd = ctx.createGain();
      exhRnd.gain.value = 0.6;
      const exhRndDepth = ctx.createGain();
      exhRndDepth.gain.value = 3;
      roughF.connect(exhRndDepth);
      exhRndDepth.connect(exhRnd.gain);
      e.exhaustGain = ctx.createGain();
      e.exhaustGain.gain.value = 0;
      exh.connect(exhF);
      exhF.connect(exhAm);
      exhAm.connect(exhRnd);
      exhRnd.connect(e.exhaustGain);
      e.exhaustGain.connect(eout);

      // Xích sắt lách cách: nhiễu dải cao điều biên bằng 2 nhịp lệch nhau (2 dải xích)
      const trk = ctx.createBufferSource();
      trk.buffer = this.noiseBuffer;
      trk.loop = true;
      e.trackFilter = ctx.createBiquadFilter();
      e.trackFilter.type = 'bandpass';
      e.trackFilter.frequency.value = 1100;
      e.trackFilter.Q.value = 1.1;
      e.trackAm = ctx.createGain();
      e.trackAm.gain.value = 0.3;
      e.trackLfoA = ctx.createOscillator();
      e.trackLfoA.type = 'triangle';   // sóng vuông bật / tắt nhiễu đột ngột -> nghe thành "xẹt xẹt" như nhiễu radio
      e.trackLfoB = ctx.createOscillator();
      e.trackLfoB.type = 'triangle';
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.3;
      e.trackLfoA.connect(lfoDepth);
      e.trackLfoB.connect(lfoDepth);
      lfoDepth.connect(e.trackAm.gain);
      this.trackGain = ctx.createGain();
      this.trackGain.gain.value = 0;
      trk.connect(e.trackFilter);
      e.trackFilter.connect(e.trackAm);
      e.trackAm.connect(this.trackGain);
      this.trackGain.connect(out);

      // Rung nặng của khối xe nghiến trên đất / tiếng lốp lăn
      const rum = ctx.createBufferSource();
      rum.buffer = this.brownNoiseBuffer;
      rum.loop = true;
      e.rumbleFilter = ctx.createBiquadFilter();
      e.rumbleFilter.type = 'lowpass';
      e.rumbleFilter.frequency.value = 140;
      e.rumbleGain = ctx.createGain();
      e.rumbleGain.gain.value = 0;
      rum.connect(e.rumbleFilter);
      e.rumbleFilter.connect(e.rumbleGain);
      e.rumbleGain.connect(out);

      // Xích rít khi xe quay gắt / lốp miết đường
      const sq = ctx.createBufferSource();
      sq.buffer = this.noiseBuffer;
      sq.loop = true;
      e.squealFilter = ctx.createBiquadFilter();
      e.squealFilter.type = 'bandpass';
      e.squealFilter.frequency.value = 2500;
      e.squealFilter.Q.value = 7;
      const sqAm = ctx.createGain();
      sqAm.gain.value = 0.7;
      const sqLfo = ctx.createOscillator();
      sqLfo.frequency.value = 7.3;
      const sqDepth = ctx.createGain();
      sqDepth.gain.value = 0.3;
      sqLfo.connect(sqDepth);
      sqDepth.connect(sqAm.gain);
      e.squealGain = ctx.createGain();
      e.squealGain.gain.value = 0;
      sq.connect(e.squealFilter);
      e.squealFilter.connect(sqAm);
      sqAm.connect(e.squealGain);
      e.squealGain.connect(out);

      [e.fire, e.crank, comb, e.turbo, exh, trk, e.trackLfoA, e.trackLfoB, rum, sq, sqLfo, jit, rough].forEach(n => n.start());
      this.engine = e;
      // Tương thích tên cũ
      this.engineLowOsc = e.fire;
      this.engineGain = e.engineGain;
      this.trackFilter = e.trackFilter;
    } catch (err) {
      console.warn('Lỗi thiết lập âm thanh động cơ:', err);
    }
  }

  /**
   * opts (tùy chọn): { tankType, engineDmg: 0 lành | 1 hư | 2 hỏng nặng, dead, tracksBroken: số dải xích đứt 0..2,
   *   flatTires: số lốp xịt / nát }
   */
  updateEngine(speedRatio, isBoost = false, engineLoad = 1.0, opts = null) {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const tc = 0.12;
    const o = opts || {};
    const me = window.game && window.game.player;
    const type = o.tankType || (me && me.tankType) || 'ALL_ROUNDER';
    this.updateAmbience(t);
    this.sweepFires(t);
    const allGains = [e.engineGain, e.combGain, e.turboGain, e.exhaustGain, e.rumbleGain, e.squealGain, e.mechGain, e.airGain];
    if (o.dead) {
      // Xe đã bị hạ: máy tắt lịm
      allGains.forEach(g => g && g.gain.setTargetAtTime(0, t, 0.4));
      this.trackGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._mv) this._mv.crunch.gain.setTargetAtTime(0, t, 0.2);
      this._engWasDead = true;
      return;
    }
    const sr = Math.max(0, Math.min(1.2, speedRatio || 0));
    // Xe trinh sát 4x4 và pháo tự hành 6x6 (xe tải) chạy bánh lốp; xe tăng & xe hỏa lực chạy xích
    const wheeled = type === 'SCOUT' || type === 'ARTILLERY';
    const truck = type === 'ARTILLERY';
    const dmg = o.engineDmg || 0;
    // tốc độ xoay thân xe (rad/s), làm mượt để tiếng xích không bật / tắt giật cục theo từng khung hình
    const dtT = this._engLastT ? Math.min(0.1, Math.max(0.001, this.ctx.currentTime - this._engLastT)) : 0.016;
    this._turnS = (this._turnS || 0) + (Math.min(3, Math.abs(o.turn || 0)) - (this._turnS || 0)) * Math.min(1, dtT * 5);
    const turn = Math.min(2, this._turnS);

    // Vào trận / hồi sinh: đề máy -> nổ máy rồi mới có tiếng máy chạy đều
    if (this._engWasDead !== false) {
      this._engWasDead = false;
      this._engStartT = t;
      this._gear = 0;
      this.playEngineStart(type);
    }
    if (t - (this._engStartT || -9) < 1.05) {
      allGains.forEach(g => g && g.gain.setTargetAtTime(0, t, 0.05));
      this.trackGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }

    // Vòng tua: theo tốc độ + tải động cơ (xe tăng tốc thì máy gằn lên, chạy đều thì lắng xuống — như xe dùng biến mô
    // thủy lực). Không mô phỏng sang số từng cấp: xe trong game tăng tốc từ 0 lên tối đa chỉ ~1.7 s, sang số thật sẽ
    // thành chuỗi "rồ-khục-rồ-khục" mỗi 0.35 s nghe rất giả
    const dtE = this._engLastT ? Math.min(0.1, Math.max(0.001, t - this._engLastT)) : 0.016;
    const dsr = (sr - (this._srPrev === undefined ? sr : this._srPrev)) / dtE;
    const accel = Math.max(0, dsr);
    this._srPrev = sr;
    this._dsr = (this._dsr || 0) + (dsr - (this._dsr || 0)) * Math.min(1, dtE * 8);
    this._load = (this._load || 0) + (Math.min(1, accel * 1.6) - (this._load || 0)) * Math.min(1, dtE * (accel > 0.05 ? 6 : 2.5));
    // xe xích quay đầu / bẻ lái: hai dải xích kéo ngược nhau rất tốn sức -> máy gằn lên dù xe gần như đứng yên
    const pivot = wheeled ? 0 : Math.min(1, turn * 0.6) * Math.max(0, 1 - sr);
    // Leo dốc / lội bùn, cát, nước (engineLoad > 1): máy bị ghì — đạp lút ga mà vòng tua tụt xuống, lên vòng chậm chạp,
    // gằn nặng, ục ịch "ì ạch"; vòng tua chao chậm (bộ điều tốc gồng theo tải). Chỉ khi xe đang chạy (đứng trên dốc thì không)
    const climbT = Math.min(1, Math.max(0, (engineLoad - 1) / 0.8) * Math.min(1, sr * 4) + (o.stall ? 0.6 : 0));
    this._climb = (this._climb || 0) + (climbT - (this._climb || 0)) * Math.min(1, dtE * (climbT > (this._climb || 0) ? 1.5 : 2.5));
    const climb = this._climb;
    if (!(this._surgeNext > t - 2)) this._surgeNext = t;
    if (t >= this._surgeNext) { this._surgeTgt = Math.random() * 2 - 1; this._surgeNext = t + 0.45 + Math.random() * 0.7; }
    const surge = climb * (this._surgeTgt || 0);
    let rpm = Math.min(1, 0.15 + sr * 0.6 + this._load * 0.25 + pivot * 0.18 + (isBoost ? 0.1 : 0));
    rpm = 0.15 + (rpm - 0.15) * (1 - 0.3 * climb);
    // Máy hỏng nặng: không lên nổi vòng tua cao, vòng tua dao động ì ạch
    if (dmg >= 2) rpm = Math.min(rpm, 0.62) * (0.9 + Math.random() * 0.12);
    // Độ đạp ga: tăng tốc = đạp lút ga (máy gằn, ống xả gầm to, nhiều họa âm cao); giữ tốc độ = ga vừa đủ thắng sức cản
    // (chạy càng nhanh càng cần nhiều công suất); nhả ga / phanh = máy ghìm lại (nhỏ, tối hẳn, chỉ còn tiếng cơ khí và
    // turbo quay trớn) dù vòng tua còn cao. Máy thật to nhỏ theo GA nhiều hơn theo vòng tua
    const coasting = this._dsr < -0.08;
    const thrT = coasting ? 0.03 : Math.min(1, 0.1 + sr * 0.5 + this._load * 0.9 + pivot * 0.45 + (isBoost ? 0.15 : 0) + climb * 0.45);
    this._thr = (this._thr === undefined ? thrT : this._thr) + (thrT - (this._thr === undefined ? thrT : this._thr)) * Math.min(1, dtE * (thrT > (this._thr || 0) ? 9 : 5));
    const thr = this._thr;
    // Turbo có quán tính: vọt lên theo khí xả (vòng tua × ga) sau ~0.5 s, nhả ga vẫn quay trớn rồi rít nhỏ dần
    const boostT = Math.min(1, rpm * (0.25 + thr * 0.85));
    this._turboS = (this._turboS || 0) + (boostT - (this._turboS || 0)) * Math.min(1, dtE * (boostT > (this._turboS || 0) ? 1.8 : 0.7));
    const tb = this._turboS;
    // Tần số nổ thật: V12 (xích) ~55 Hz không tải -> ~180 Hz; diesel 6 máy xe tải 6x6 ~32 -> 112 Hz; xe 4x4 ~38 -> 130 Hz
    const fireHz = (truck ? 32 + rpm * 80 : wheeled ? 38 + rpm * 92 : 55 + rpm * 125) * (1 + surge * 0.02);
    // máy bị ghì: vòng tua đổi chậm hẳn (lên dốc nhấn ga máy chỉ gầm lên từ từ)
    const tcF = tc + climb * 0.4;
    e.fire.frequency.setTargetAtTime(fireHz, t, tcF);
    if (e.orders) e.orders.forEach(r => r.o.frequency.setTargetAtTime(fireHz * r.k, t, tcF));
    e.crank.frequency.setTargetAtTime(fireHz * 0.5, t, tcF);
    // Giọng máy theo loại: V12 xe xích nổ dày, đều (bậc lẻ nhỏ, bậc cao rõ); diesel 6 máy xe tải "lục bục" ục ịch (bậc
    // nửa & 1.5 lớn); máy 4x4 nhỏ quay nhanh, đanh hơn
    if (e.orders && this._engVoice !== type) {
      this._engVoice = type;
      const A = truck ? [0.45, 1, 0.5, 0.5, 0.26, 0.1] : wheeled ? [0.3, 1, 0.38, 0.62, 0.36, 0.2] : [0.16, 1, 0.22, 0.7, 0.4, 0.2];
      e.orders.forEach((r, i) => r.g.gain.setTargetAtTime(A[i], t, 0.05));
    }
    // Máy hư: mất tiếng gằn cao (nghẹt), tiếng cháy nổ thô và ống xả to hơn (khói đen phụt)
    const choke = dmg >= 2 ? 0.55 : dmg === 1 ? 0.8 : 1;
    // đạp ga mạnh: cháy nổ mạnh -> nhiều họa âm cao (máy "gằn"); nhả ga: tiếng máy tròn, tối
    const engLp = fireHz * (2.3 + thr * 1.6) * (1 + climb * 0.1) * choke;
    e.engineFilter.frequency.setTargetAtTime(engLp, t, tc);
    if (e.engineFilter2) e.engineFilter2.frequency.setTargetAtTime(engLp * 1.2, t, tc);
    // Cắt luôn tần số nổ gốc (và mọi thứ dưới nó): loa chỉ phát nó thành tiếng ù, còn tai vẫn "nghe ra" nhịp máy trầm
    // qua các họa âm phía trên (âm gốc ảo) — máy nghe dày, chắc mà không ù
    if (e.hp1) {
      e.hp1.frequency.setTargetAtTime(Math.max(42, fireHz * (0.8 - thr * 0.3)), t, tc);
      e.hp2.frequency.setTargetAtTime(38, t, tc);
    }
    const tk = (1 + climb * 0.06) * (1 + surge * 0.1) * (truck ? 1.15 : 1);
    // máy đang gồng (đạp ga): to, đặc, gằn hẳn lên; nhả ga / không tải giữ nguyên tiếng tròn, nhỏ
    const grunt = Math.max(0, thr - 0.25) / 0.75;
    const eg = (0.012 + rpm * 0.014 + thr * 0.018 + grunt * 0.022) * tk;
    // nhánh gằn máy + cộng hưởng ống xả chỉ mở khi đạp ga; nhả ga / không tải: tắt
    if (e.satIn) {
      e.satIn.gain.setTargetAtTime(6 * grunt, t, tc);
      e.satOut.gain.setTargetAtTime(0.05 * grunt * tk, t, tc);
      e.pipe.frequency.setTargetAtTime(Math.min(115, Math.max(70, fireHz * 0.75)), t, tc);
      e.pipe.gain.setTargetAtTime(4 * grunt + 1.5 * climb, t, tc);
    }
    e.engineGain.gain.setTargetAtTime(eg, t, tc);
    e.combGain.gain.setTargetAtTime((0.06 + rpm * 0.12 + thr * 0.24) * (1 + dmg * 0.35) * tk, t, tc);
    if (e.combFilter) e.combFilter.frequency.setTargetAtTime(200 + rpm * 300 + thr * 260, t, tc);
    e.turbo.frequency.setTargetAtTime(1500 + tb * 2600, t, 0.08);
    // Turbo hỏng: tiếng rít mất hẳn
    e.turboGain.gain.setTargetAtTime(dmg >= 2 ? 0 : Math.max(0, tb - 0.2) * (isBoost ? 0.009 : 0.0055), t, 0.1);
    if (e.airGain) {
      e.airGain.gain.setTargetAtTime(dmg >= 2 ? 0.002 : (0.002 + tb * 0.016) * (wheeled ? 0.8 : 1), t, 0.1);
      e.airFilter.frequency.setTargetAtTime(1700 + tb * 2300, t, 0.1);
    }
    // quạt làm mát + cơ khí: theo vòng tua (quạt dẫn động từ trục máy), không theo ga
    if (e.mechGain) {
      e.mechGain.gain.setTargetAtTime((0.006 + rpm * 0.026) * (wheeled ? 0.75 : 1), t, tc);
      e.mechFilter.frequency.setTargetAtTime(450 + rpm * 900, t, tc);
    }
    e.exhaustGain.gain.setTargetAtTime((0.04 + rpm * 0.07 + thr * 0.15 + grunt * 0.1) * (1 + dmg * 0.3) * tk, t, tc);
    if (e.exhaustFilter) e.exhaustFilter.frequency.setTargetAtTime((200 + rpm * 260 + thr * 320) * choke, t, tc);
    if (e.pulseSmooth) e.pulseSmooth.frequency.setTargetAtTime(fireHz * 1.1, t, tc);
    // Độ lệch nhịp nổ: không tải chao rõ (máy "lục bục"), vòng tua cao đều hơn; máy hư chao mạnh
    // cao độ máy chỉ chao rất nhẹ (~±1% lúc không tải); chao mạnh nghe như băng cát-xét nhão / còi méo
    if (e.jitterDepth) e.jitterDepth.gain.setTargetAtTime(fireHz * 0.15 * Math.max(0, 1 - (rpm - 0.15) * 2.2) + (dmg ? fireHz * 0.12 * dmg : 0), t, tc);
    if (e.roughDepth) e.roughDepth.gain.setTargetAtTime(3.5 * Math.max(0.3, 1 - (rpm - 0.15) * 1.6) * (1 + dmg * 0.5) * (1 + climb * 0.4), t, tc);
    // Tiếng gõ kim phun / xu-páp: vài tiếng tách lẻ, nhịp ngẫu nhiên; rõ khi không tải, chìm dần khi máy gầm lên
    if (e.clatterOut && !this.isMapMuted) {
      if (!(this._clkNext > t - 0.5)) this._clkNext = t + Math.random() * 0.2;
      while (this._clkNext < t + 0.12) {
        const tt = this._clkNext;
        const g = (0.05 - rpm * 0.025) * (truck ? 1.2 : 1) * (0.4 + Math.random() * 0.9);
        this.burst(e.clatterOut, tt, { filter: 'bandpass', freq: 1100 + Math.random() * 700, Q: 1.4, gain: g, attack: 0.001, dur: 0.012 + Math.random() * 0.01 });
        this._clkNext = tt + (0.06 + Math.random() * 0.22) / (1 + rpm);
      }
    }
    // Đứng chờ lâu: tiếng máy lùi dần về nền (tai quen tiếng máy, như kíp lái ngồi trong xe); nhấn ga là trở lại ngay
    if (e.habit) {
      const dtI = this._engLastT ? Math.min(0.1, t - this._engLastT) : 0.016;
      this._idleT = (sr < 0.03 && !isBoost && turn < 0.1) ? (this._idleT || 0) + dtI : 0;
      const hab = 1 - 0.4 * Math.min(1, Math.max(0, (this._idleT - 3) / 5));
      e.habit.gain.setTargetAtTime(hab, t, this._idleT > 0 ? 0.8 : 0.08);
      if (e.habitHi) e.habitHi.gain.setTargetAtTime(hab, t, this._idleT > 0 ? 0.8 : 0.08);
    }

    // Máy trúng đạn: xi-lanh bỏ nổ -> hụt tiếng "khục" từng nhịp, thỉnh thoảng ống xả nổ ngược "bụp"
    if (dmg > 0) {
      const dt = this._engLastT ? Math.min(0.1, t - this._engLastT) : 0.016;
      if (Math.random() < dt * (dmg >= 2 ? 7 : 2.5)) {
        const depth = dmg >= 2 ? 0.15 : 0.45;
        e.engineGain.gain.setValueAtTime(eg * depth, t);
        e.engineGain.gain.setTargetAtTime(eg, t + 0.05 + Math.random() * 0.08, 0.06);
        e.combGain.gain.setValueAtTime(0.02, t);
        if (Math.random() < (dmg >= 2 ? 0.35 : 0.15)) {
          const pop = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.15 });
          this.burst(pop, t + 0.04, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 420, drive: 3, gain: 0.8, attack: 0.001, dur: 0.07 });
          this.burst(pop, t + 0.04, { filter: 'bandpass', freq: 900, Q: 1, gain: 0.15, attack: 0.001, dur: 0.03 });
        }
      }
    }
    this._engLastT = t;

    if (wheeled) {
      // Xe bánh lốp: tiếng lốp lăn rào rào, không có xích; lốp xịt / chạy trên vành: tiếng nghiến kim loại đục, phành phạch
      const flat = Math.min(3, o.flatTires || 0);
      this.trackGain.gain.setTargetAtTime(flat > 0 ? Math.min(0.12, sr * 0.06 * flat) : 0, t, tc);
      if (flat > 0) {
        const flapHz = 2 + sr * 10;
        e.trackLfoA.frequency.setTargetAtTime(flapHz, t, tc);
        e.trackLfoB.frequency.setTargetAtTime(flapHz * 1.31, t, tc);
        e.trackFilter.frequency.setTargetAtTime(700 + sr * 400, t, tc);
      }
      e.rumbleFilter.frequency.setTargetAtTime((truck ? 380 : 500) + sr * (truck ? 380 : 500), t, tc);
      e.rumbleGain.gain.setTargetAtTime(sr * (truck ? 0.14 : 0.1) * (1 + flat * 0.25), t, tc);
    } else {
      const linkHz = 3 + sr * 24;
      // Dải xích đứt: bên đó không còn lách cách
      const trackK = Math.max(0, 1 - (o.tracksBroken || 0) * 0.5);
      e.trackLfoA.frequency.setTargetAtTime(linkHz, t, tc);
      e.trackLfoB.frequency.setTargetAtTime(linkHz * 1.07, t, tc);
      e.trackFilter.frequency.setTargetAtTime(800 + sr * 500, t, tc);   // dải 1.3-2.2 kHz nghe như nhiễu rè
      // Quay đầu tại chỗ: hai dải xích vẫn chạy ngược chiều nhau nên vẫn lách cách
      const trackSpeed = Math.min(1.2, sr + turn * 0.35);
      this.trackGain.gain.setTargetAtTime(Math.min(0.07, trackSpeed * 0.06 * (isBoost ? 1.25 : 1)) * trackK, t, tc);
      e.rumbleFilter.frequency.setTargetAtTime(140, t, tc);
      e.rumbleGain.gain.setTargetAtTime(trackSpeed * 0.22, t, tc);
    }

    // Xích xe quay gắt: guốc xích trượt ngang trên đất, bánh tì nghiến -> tiếng rít ken két (rõ nhất khi quay đầu tại chỗ);
    // xe bánh lốp cua gắt ở tốc độ cao: lốp miết đường rít khàn
    if (e.squealGain) {
      let sq = 0;
      // xích chỉ rít rõ khi quay đầu tại chỗ / bẻ lái lúc chạy chậm (guốc xích trượt ngang); chạy nhanh rẽ chỉ rít khẽ
      if (!wheeled) sq = Math.min(0.016, Math.max(0, turn - 0.3) * (sr < 0.3 ? 0.008 : 0.003)) * Math.max(0, 1 - (o.tracksBroken || 0) * 0.5);
      else sq = sr > 0.5 ? Math.min(0.012, Math.max(0, turn - 1.0) * sr * 0.01) : 0;
      // cao độ trôi chậm ngẫu nhiên (không nhảy theo từng khung hình)
      this._sqF = Math.max(2000, Math.min(2900, (this._sqF || 2400) + (Math.random() - 0.5) * 30));
      e.squealFilter.frequency.setTargetAtTime(wheeled ? 900 : this._sqF, t, 0.3);
      e.squealFilter.Q.value = wheeled ? 1.5 : 6;
      e.squealGain.gain.setTargetAtTime(sq, t, 0.25);
    }

    this.updateMovement(t, wheeled ? sr : Math.min(1.2, sr + turn * 0.35), wheeled, type, o);

    // Xe tải 6x6 dừng hẳn: phanh hơi xả "xììì"
    if (truck && (this._engPrevSr || 0) > 0.2 && sr < 0.04) {
      const v = this.voice({ bus: this.vehicleBus, gain: 0.5, wet: 0.12 });
      this.burst(v, t + 0.15, { filter: 'highpass', freq: 2800, gain: 0.35, attack: 0.01, dur: 0.75 });
      this.burst(v, t + 0.15, { filter: 'bandpass', freq: 5200, Q: 2, gain: 0.12, attack: 0.01, dur: 0.6 });
    }
    this._engPrevSr = sr;
  }

  /**
   * Tiếng chuyển động của gầm xe (lên lịch trước ~0.12 s mỗi khung hình):
   * - Xe xích: từng mắt xích thép đập vào bánh răng chủ động / bánh tì: "cạch, keng" rời rạc có cộng hưởng kim loại,
   *   cao độ & nhịp lệch ngẫu nhiên (không đều như máy); 2 dải xích trái / phải lệch nhau
   * - Mọi xe: đất sỏi lạo xạo dưới xích / lốp, cú "thịch" khi gầm chồm qua mô đất, ổ gà; xe bánh có thêm tiếng nhíp kêu
   */
  updateMovement(t, speed, wheeled, type, o = {}) {
    const ctx = this.ctx;
    if (!this._mv) {
      const mk = pan => { const g = ctx.createGain(); g.gain.value = 1; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.vehicleBus); } else g.connect(this.vehicleBus); return g; };
      // Đất sỏi bị xích / lốp nghiến: tiếng "rào rào" trầm, dày, to nhỏ chậm ngẫu nhiên theo mặt đất. Chuỗi tiếng tách
      // sắc dưới 1 ms ở dải 1.3-2.2 kHz (bản cũ) nghe thành tiếng nhiễu "lẹt xẹt" như radio rè, không ra tiếng sỏi
      const cg = ctx.createGain();
      cg.gain.value = 0;
      cg.connect(this.vehicleBus);
      const gr = ctx.createBufferSource();
      gr.buffer = this.pinkNoiseBuffer;
      gr.loop = true;
      const gf = ctx.createBiquadFilter();
      gf.type = 'bandpass';
      gf.frequency.value = 400;
      gf.Q.value = 1.0;
      const gAm = ctx.createGain();
      gAm.gain.value = 1;
      const gm = ctx.createBufferSource();
      gm.buffer = this.pinkNoiseBuffer;
      gm.loop = true;
      gm.playbackRate.value = 0.63;
      const gmF = ctx.createBiquadFilter();
      gmF.type = 'lowpass';
      gmF.frequency.value = 9;
      const gmD = ctx.createGain();
      gmD.gain.value = 5;
      gm.connect(gmF);
      gmF.connect(gmD);
      gmD.connect(gAm.gain);
      const gk = ctx.createGain();
      gk.gain.value = 0.08;   // to hơn thì dải 1-4 kHz của tiếng sỏi ngang cả tiếng máy -> "lẹt xẹt"
      gr.connect(gf);
      gf.connect(gAm);
      gAm.connect(gk);
      gk.connect(cg);
      // vài hòn sỏi lộp cộp lẫn vào: tiếng tách thưa nhưng đã làm mềm (cắt dải cao) và nhỏ
      const cr = ctx.createBufferSource();
      cr.buffer = this.crackleBuffer;
      cr.loop = true;
      const cf = ctx.createBiquadFilter();
      cf.type = 'lowpass';
      cf.frequency.value = 800;
      cf.Q.value = 0.5;
      const ck = ctx.createGain();
      ck.gain.value = 0.35;
      cr.connect(cf);
      cf.connect(ck);
      ck.connect(cg);
      gr.start(0, 2.3);
      gm.start(0, 0.9);
      cr.start();
      this._mv = { next: [0, 0], thump: 0, bus: [mk(-0.35), mk(0.35)], mid: mk(0), crunch: cg, crunchF: cf, grindF: gf, crunchSrc: cr };
    }
    const M = this._mv;
    const v = Math.max(0, Math.min(1.2, speed));
    M.crunch.gain.setTargetAtTime(Math.min(1.4, v * 1.3) * (wheeled ? 0.8 : 1) * (1 - 0.85 * (this._wadeK || 0)), t, 0.1);   // gầm ngập nước: không còn tiếng sỏi (xem wading.js)
    M.crunchF.frequency.setTargetAtTime(600 + v * 400, t, 0.1);
    if (M.grindF) M.grindF.frequency.setTargetAtTime((wheeled ? 300 : 340) + v * 240, t, 0.1);
    M.crunchSrc.playbackRate.setTargetAtTime(0.7 + v * 0.5, t, 0.3);
    if (this.isMapMuted) return;
    const look = 0.12;
    if (!wheeled && v > 0.02) {
      const heavy = type === 'ALL_ROUNDER' || type === 'GATLING';
      const rate = 3 + v * 26;   // số tiếng va mỗi giây trên một dải xích
      for (let s = 0; s < 2; s++) {
        if (o.tracksBroken && s < o.tracksBroken) continue;   // dải xích đứt: không còn chạy
        if (M.next[s] < t) M.next[s] = t + Math.random() * 0.04;
        while (M.next[s] < t + look) {
          const tt = M.next[s];
          const g = (0.012 + 0.03 * Math.min(1, v)) * (0.5 + Math.random());
          this.metal(M.bus[s], tt, { f0: (heavy ? 240 : 320) * (0.75 + Math.random() * 0.6), ratios: [1, 2.31, 3.92], decay: 0.04 + Math.random() * 0.05, gain: g, click: 0.3 });
          if (Math.random() < 0.3) this.burst(M.bus[s], tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 240, gain: g * 4, attack: 0.001, dur: 0.05 });
          M.next[s] = tt + (1 / rate) * (0.6 + Math.random() * 0.8);
        }
      }
    }
    // cú xóc gầm: thời điểm ngẫu nhiên, dày hơn khi chạy nhanh
    if (v > 0.15 && t > M.thump) {
      M.thump = t + 0.35 + Math.random() * Math.max(0.3, 1.8 - v * 1.2);
      const g = 0.18 + v * 0.3;
      const tt = t + 0.02 + Math.random() * 0.08;
      this.burst(M.mid, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 170, drive: 2, gain: g, attack: 0.002, dur: 0.12 });
      if (wheeled) this.metal(M.mid, tt + 0.03, { f0: 160 + Math.random() * 60, ratios: [1, 2.1], decay: 0.18, gain: 0.02 + v * 0.02, click: 0.2 });   // nhíp / giảm xóc kêu
      else this.metal(M.mid, tt, { f0: 140 + Math.random() * 50, ratios: [1, 2.4, 3.6], decay: 0.12, gain: 0.03 + v * 0.03, click: 0.5 });  // xích võng đập thân
    }
  }

  // Đề máy: củ đề quay nặng nề kéo trục khuỷu (nhịp nén xi-lanh), máy nổ bắt "bùm" rồi gầm lên vòng tua cao và hạ về không tải
  playEngineStart(tankType = 'ALL_ROUNDER') {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const out = this.voice({ bus: this.vehicleBus, gain: 0.7, wet: 0.1 });
    const big = tankType === 'ALL_ROUNDER' || tankType === 'GATLING' || tankType === 'ARTILLERY';
    // mô-tơ đề rít điện
    this.tone(out, t, { type: 'sawtooth', freq: 140, freqEnd: 210, sweep: 0.6, gain: 0.05, attack: 0.05, hold: 0.55, dur: 0.1, filter: 'bandpass', filterFreq: 600, Q: 3 });
    // nhịp nén xi-lanh khi trục quay chậm: "ục ục ục" nhanh dần
    let tt = t + 0.05;
    for (let i = 0; i < 7; i++) {
      this.burst(out, tt, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 220, drive: 2, gain: 0.35, attack: 0.01, dur: 0.07 });
      tt += 0.13 - i * 0.008;
    }
    // máy nổ bắt: phát nổ đầu tiên + gầm vọt vòng tua
    const tc = t + 0.85;
    this.burst(out, tc, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 400, drive: 3, gain: 0.9, attack: 0.003, dur: 0.18 });
    this.tone(out, tc, { type: 'sawtooth', freq: big ? 50 : 40, freqEnd: big ? 120 : 100, sweep: 0.3, drive: 3, gain: 0.08, attack: 0.05, hold: 0.15, dur: 0.4, filter: 'lowpass', filterFreq: 700 });
    this.burst(out, tc + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'lowpass', freq: 900, freqEnd: 400, sweep: 0.5, gain: 0.25, attack: 0.08, dur: 0.5 });
    if (big) this.burst(out, tc + 0.1, { filter: 'bandpass', freq: 1800, freqEnd: 2600, sweep: 0.4, Q: 4, gain: 0.04, attack: 0.1, dur: 0.6 });   // turbo quay lên
  }

  // Hộp số sang số: nhả ga thoáng chốc + tiếng "cạch" cơ khí khẽ trong hộp số (vào số thấp có thêm "ục" ăn số)
  playGearShift(tankType = 'ALL_ROUNDER', up = true) {
    if (!this.ready() || !this.engine) return;
    const t = this.ctx.currentTime;
    if (t - (this._lastShift || 0) < 0.6) return;
    this._lastShift = t;
    const e = this.engine;
    const g = e.engineGain.gain.value;
    e.engineGain.gain.setValueAtTime(g * 0.55, t);
    e.engineGain.gain.setTargetAtTime(g, t + 0.18, 0.08);
    const out = this.voice({ bus: this.vehicleBus, gain: 0.45, wet: 0.03 });
    this.burst(out, t + 0.05, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 900, Q: 2.5, gain: 0.07, attack: 0.001, dur: 0.035 });
    this.burst(out, t + 0.05, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 260, gain: up ? 0.1 : 0.18, attack: 0.002, dur: 0.08 });
    if (tankType === 'ARTILLERY' && up) this.burst(out, t + 0.02, { filter: 'highpass', freq: 3000, gain: 0.05, attack: 0.01, dur: 0.18 });   // xe tải: xả hơi bộ ly hợp
  }
});
