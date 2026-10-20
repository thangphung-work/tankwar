/**
 * TIẾNG MÁY CỦA XE KHÁC (đồng đội, địch, bot, người chơi mạng).
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // TIẾNG MÁY CỦA XE KHÁC (đồng đội, địch, bot, người chơi mạng)
  // Ngoài đời nghe được xe tăng từ vài trăm mét: tiếng gầm máy trầm, ống xả, xích / lốp rào rào khi tới gần.
  // Giữ NHỎ và GỌN để không lấn tiếng xe mình: tối đa 3 xe gần nhất trong 400 m, xe gần nhất rõ nhất, xe sau nhỏ dần.
  // Mỗi giọng rẻ (3 dao động sin + 2 nguồn nhiễu, 3 bộ lọc; nhiễu chậm làm sống tiếng máy dùng chung), giọng được tái
  // sử dụng giữa các xe, tham số cập nhật ~10 lần/giây (không phải mỗi khung hình). Không có lớp nhiễu bị bật / tắt
  // bằng sóng vuông (nghe thành "lẹt xẹt").
  // Bên gọi (game.js) CHỈ đưa vào xe mà client thực sự có vị trí (đồng đội, địch đang bị phát hiện và không bị máy chủ
  // giấu) — tiếng máy không được làm lộ xe địch khuất tầm nhìn.
  // list: [{ id, x, z, type, sr: tốc độ / tốc độ tối đa, turn: tốc độ xoay thân (rad/s), dmg: 0 lành | 1 hư | 2 hỏng nặng }]
  // ===========================================================================
  updateOtherEngines(list) {
    if (!this.ctx || !this.vehicleBus || !this.brownNoiseBuffer) return;
    const t = this.ctx.currentTime;
    const OE_MAX = 3, OE_RANGE = 3200;   // 3 xe, 400 m
    const L = this.listenerXZ();
    const V = this.otherEngines || (this.otherEngines = []);
    const cand = [];
    for (const u of list || []) {
      if (!u || u.id == null || !isFinite(u.x) || !isFinite(u.z)) continue;
      const d = Math.hypot(u.x - L.x, u.z - L.z);
      if (d < OE_RANGE) cand.push({ u, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const want = new Map();
    for (let i = 0; i < cand.length && i < OE_MAX; i++) { cand[i].rank = i; want.set(cand[i].u.id, cand[i]); }
    // xe đi xa / bị hạ / khuất tầm / bị xe gần hơn chiếm chỗ: nhả giọng, tắt dần
    for (const v of V) {
      if (v.id != null && !want.has(v.id)) {
        v.id = null;
        v.freeAt = t;
        v.out.gain.cancelScheduledValues(t);
        v.out.gain.setTargetAtTime(0, t, 0.25);
      }
    }
    for (const [id, c] of want) {
      let v = V.find(x => x.id === id);
      if (!v) {
        // giọng rảnh đã tắt hẳn mới được gán cho xe khác (đổi xe giữa chừng nghe như tiếng máy nhảy chỗ)
        v = V.find(x => x.id == null && t - x.freeAt > 0.5);
        if (!v && V.length < OE_MAX) { v = this.makeOtherEngineVoice(t); if (v) V.push(v); }
        if (!v) continue;
        Object.assign(v, { id, fresh: true, srPrev: undefined, thr: undefined, dsr: 0, load: 0, lastT: 0, prevSr: 0, type: null, nextUpd: 0, rankW: undefined });
      }
      this.driveOtherEngine(v, c.u, c.d, t, c.rank);
    }
    // giọng rảnh lâu: dừng nguồn, giải phóng
    for (let i = V.length - 1; i >= 0; i--) {
      if (V[i].id == null && t - V[i].freeAt > 6) { this.releaseOtherEngineVoice(V[i]); V.splice(i, 1); }
    }
    // Bên gọi ngừng cập nhật (hết trận, về sảnh, tab bị ẩn): tự tắt sau ~2 s thay vì kêu mãi ở mức cuối
    if (typeof setTimeout === 'function') {
      clearTimeout(this._oeIdle);
      this._oeIdle = setTimeout(() => this.stopOtherEngines(), 2000);
    }
  }

  stopOtherEngines() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    (this.otherEngines || []).forEach(v => {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, 0.3);
      this.releaseOtherEngineVoice(v, 2);
    });
    this.otherEngines = [];
    if (this._oeMod) {
      this._oeMod.srcs.forEach(s => { try { s.stop(t + 2.2); } catch (e) { /* đã dừng */ } });
      this._oeMod = null;
    }
  }

  releaseOtherEngineVoice(v, after = 0.1) {
    const t = this.ctx.currentTime;
    v.srcs.forEach(s => { try { s.stop(t + after); } catch (e) { /* đã dừng */ } });
    if (typeof setTimeout === 'function') setTimeout(() => { try { (v.pan || v.out).disconnect(); } catch (e) { /* đã ngắt */ } }, (after + 0.2) * 1000);
  }

  // Nhiễu chậm (~8 Hz) dùng chung cho mọi giọng: 2 dòng lệch nhau để 2 xe cạnh nhau không chao cùng nhịp
  otherEngineMod(t) {
    if (this._oeMod) return this._oeMod;
    const ctx = this.ctx;
    const M = { srcs: [], outs: [] };
    for (let i = 0; i < 2; i++) {
      const s = ctx.createBufferSource();
      s.buffer = this.pinkNoiseBuffer;
      s.loop = true;
      s.playbackRate.value = i ? 0.83 : 1.11;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 8;
      f.Q.value = 0.5;
      s.connect(f);
      s.start(t, i * 1.3);
      M.srcs.push(s);
      M.outs.push(f);
    }
    return (this._oeMod = M);
  }

  // Một giọng: thân máy (2 bậc trục khuỷu) + ống xả phụt theo nhịp nổ + xích / lốp rào rào
  //  -> lọc không khí theo khoảng cách -> trễ âm (Doppler tự nhiên khi xe lao qua) -> pan -> bus xe
  makeOtherEngineVoice(t) {
    try {
      const ctx = this.ctx;
      const srcs = [];
      const gain = g => { const n = ctx.createGain(); n.gain.value = g; return n; };
      const filt = (type, f, Q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = Q; return n; };
      const osc = f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.start(t); srcs.push(o); return o; };
      const loop = (buf, rate) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * 2.5); srcs.push(s); return s; };
      const mod = this.otherEngineMod(t);
      const pick = (this._oePick = ((this._oePick || 0) + 1) % 2);
      const v = { srcs, freeAt: t, id: null };

      v.mix = gain(1);
      v.lp = filt('lowpass', 4000, 0.5);
      v.delay = ctx.createDelay(1.5);
      v.out = gain(0);
      v.mix.connect(v.lp);
      v.lp.connect(v.delay);
      v.delay.connect(v.out);
      let node = v.out;
      if (ctx.createStereoPanner) { v.pan = ctx.createStereoPanner(); v.out.connect(v.pan); node = v.pan; }
      node.connect(this.vehicleBus);
      v.send = gain(0.2);
      node.connect(v.send);
      if (this.reverb) v.send.connect(this.reverb);

      // Thân máy: 2 bậc trục khuỷu (sin tròn — răng cưa nghe thành "è è"), độ lớn chao chậm ngẫu nhiên
      v.bodyAm = gain(1);
      const bodyDepth = gain(4);
      mod.outs[pick].connect(bodyDepth);
      bodyDepth.connect(v.bodyAm.gain);
      v.orders = [0, 1].map(() => { const o = osc(60); const g = gain(0.5); o.connect(g); g.connect(v.bodyAm); return { o, g, k: 1, a: 0.5 }; });
      v.bodyAm.connect(v.mix);

      // Ống xả: nhiễu nâu dải 150-700 Hz (không có siêu trầm) phụt nhẹ theo nhịp nổ (điều biên sin nông — điều biên sâu
      // bằng xung sắc ở 50-150 Hz nghe thành "rè rè")
      v.pulse = osc(40);
      const pulseAmt = gain(0.45);
      v.pulse.connect(pulseAmt);
      const exhAm = gain(1);
      pulseAmt.connect(exhAm.gain);
      v.exhF = filt('bandpass', 300, 0.7);
      v.exhG = gain(0);
      loop(this.brownNoiseBuffer, 1).connect(v.exhF);
      v.exhF.connect(exhAm);
      exhAm.connect(v.exhG);
      v.exhG.connect(v.mix);

      // Gầm xe: xích lăn / lốp lăn — nhiễu hồng dải trung-thấp, to nhỏ chậm ngẫu nhiên theo mặt đất (KHÔNG bật / tắt)
      v.bedF = filt('bandpass', 500, 0.8);
      const bedAm = gain(1);
      const bedDepth = gain(3);
      mod.outs[1 - pick].connect(bedDepth);
      bedDepth.connect(bedAm.gain);
      v.bedG = gain(0);
      loop(this.pinkNoiseBuffer, 0.9 + Math.random() * 0.2).connect(v.bedF);
      v.bedF.connect(bedAm);
      bedAm.connect(v.bedG);
      v.bedG.connect(v.mix);
      v.nextClank = 0;
      return v;
    } catch (err) {
      console.warn('Lỗi tạo tiếng máy xe khác:', err);
      return null;
    }
  }

  driveOtherEngine(v, u, d, t, rank = 0) {
    const type = u.type || 'ALL_ROUNDER';
    const wheeled = type === 'SCOUT' || type === 'ARTILLERY';
    const truck = type === 'ARTILLERY';
    const sr = Math.max(0, Math.min(1.2, u.sr || 0));
    const turn = Math.min(2, Math.abs(u.turn || 0));
    const mv = wheeled ? sr : Math.min(1.2, sr + turn * 0.35);
    const m = d / 8;
    if (v.fresh || t >= v.nextUpd) {
      const fresh = v.fresh;
      const tc = fresh ? 0.01 : 0.15;
      const dt = v.lastT ? Math.min(0.3, Math.max(0.01, t - v.lastT)) : 0.1;
      v.lastT = t;
      v.nextUpd = t + 0.1;
      // Vòng tua & độ đạp ga như xe mình (gọn hơn): tăng tốc thì gằn, chạy đều lắng xuống, nhả ga thì ghìm
      const dsr = v.srPrev === undefined ? 0 : (sr - v.srPrev) / dt;
      v.srPrev = sr;
      v.dsr += (dsr - v.dsr) * Math.min(1, dt * 8);
      v.load += (Math.min(1, Math.max(0, dsr) * 1.6) - v.load) * Math.min(1, dt * (dsr > 0.05 ? 6 : 2.5));
      const pivot = wheeled ? 0 : Math.min(1, turn * 0.6) * Math.max(0, 1 - sr);
      const dmg = u.dmg || 0;
      let rpm = Math.min(1, 0.15 + sr * 0.6 + v.load * 0.25 + pivot * 0.18);
      if (dmg >= 2) rpm = Math.min(rpm, 0.62);
      const thrT = v.dsr < -0.08 ? 0.05 : Math.min(1, 0.1 + sr * 0.5 + v.load * 0.9 + pivot * 0.45);
      v.thr = v.thr === undefined ? thrT : v.thr + (thrT - v.thr) * Math.min(1, dt * (thrT > v.thr ? 9 : 5));
      const thr = v.thr;
      // Tần số nổ: V12 xe xích ~55 -> 180 Hz; diesel 6 máy xe tải 6x6 ~32 -> 112 Hz; xe 4x4 ~38 -> 130 Hz
      const fireHz = truck ? 32 + rpm * 80 : wheeled ? 38 + rpm * 92 : 55 + rpm * 125;
      // nhịp nổ trôi rất nhẹ ngẫu nhiên (≤ ~1%) để 2 xe cùng loại không kêu cùng một nốt
      v.wob = Math.max(-0.012, Math.min(0.012, (v.wob || 0) + (Math.random() - 0.5) * 0.006));
      const f = fireHz * (1 + v.wob);
      if (v.type !== type) {
        v.type = type;
        // Giọng theo loại: V12 dày, bậc 2 rõ; diesel 6 máy xe tải "lục bục" (bậc 1.5); máy 4x4 nhỏ, đanh
        const K = truck ? [1, 1.5] : [1, 2];
        const A = truck ? [1, 0.6] : wheeled ? [0.8, 1] : [0.7, 1];
        v.orders.forEach((r, i) => { r.k = K[i]; r.a = A[i]; });
        v.bedF.Q.value = wheeled ? 0.7 : 0.9;
      }
      // cao độ bậc 1 luôn trên ~50 Hz (thấp hơn loa chỉ phát thành tiếng ù), bậc trên sáng dần khi đạp ga
      v.orders.forEach(r => r.o.frequency.setTargetAtTime(f * r.k * (r.k * f < 50 ? 2 : 1), t, tc));
      v.pulse.frequency.setTargetAtTime(truck ? f * 0.5 : f, t, tc);
      const choke = dmg >= 2 ? 0.6 : dmg === 1 ? 0.85 : 1;
      // Độ lớn nguồn: xe tăng chủ lực to nhất, xe tải 6x6 vừa, xe 4x4 nhỏ
      const K = truck ? 0.8 : wheeled ? 0.55 : 1;
      const bodyLv = (0.04 + rpm * 0.04 + thr * 0.06) * K * (dmg >= 2 ? 0.7 : 1);
      v.orders.forEach((r, i) => r.g.gain.setTargetAtTime(bodyLv * r.a * (i ? 0.5 + thr * 0.8 : 1), t, tc));
      v.exhG.gain.setTargetAtTime((0.08 + rpm * 0.1 + thr * 0.24) * (1 + dmg * 0.3) * K * (truck ? 1.25 : 1), t, tc);
      v.exhF.frequency.setTargetAtTime((170 + rpm * 200 + thr * 220) * choke, t, tc);
      // xích lăn (cả khi quay đầu tại chỗ) / lốp lăn: dải trung-thấp, to theo tốc độ
      v.bedF.frequency.setTargetAtTime(wheeled ? (truck ? 320 : 400) + sr * 300 : 450 + mv * 350, t, tc);
      v.bedG.gain.setTargetAtTime(wheeled ? sr * (truck ? 0.05 : 0.035) : Math.min(0.07, mv * 0.06), t, tc);

      // Không gian: suy hao, lọc không khí, hồi âm, pan theo spatial(); trễ âm theo khoảng cách THẬT (d/343) để tiếng
      // máy tự có Doppler khi xe lao qua (spatial() bỏ trễ dưới 75 m cho tiếng nổ khớp hình — với tiếng máy liên tục
      // trễ đó không thấy lệch, còn cao độ chao đúng như ngoài đời)
      const sp = this.spatial(d, { x: u.x, z: u.z });
      const edge = Math.max(0, Math.min(1, (400 - m) / 80));   // mờ dần ở rìa 320-400 m, không bật / tắt đột ngột
      // xe gần nhất rõ nhất, xe thứ 2, 3 nhỏ hẳn: nhiều xe cùng gầm to như nhau nghe lộn xộn, át tiếng xe mình
      const rankW = [1, 0.55, 0.35][rank] || 0.35;
      const g = sp.gain * edge * rankW * 0.5;
      const delay = Math.min(1.4, m / 343);
      if (fresh) {
        v.delay.delayTime.setValueAtTime(delay, t);
        v.lp.frequency.setValueAtTime(Math.min(sp.lowpass, 3500), t);
        if (v.pan) v.pan.pan.setValueAtTime(sp.pan, t);
        v.out.gain.cancelScheduledValues(t);
        v.out.gain.setValueAtTime(0, t);
        v.out.gain.setTargetAtTime(g, t, 0.3);
      } else {
        v.delay.delayTime.setTargetAtTime(delay, t, 0.12);
        v.lp.frequency.setTargetAtTime(Math.min(sp.lowpass, 3500), t, 0.15);
        if (v.pan) v.pan.pan.setTargetAtTime(sp.pan, t, 0.15);
        v.out.gain.setTargetAtTime(g, t, 0.2);
      }
      v.send.gain.setTargetAtTime(Math.min(0.8, sp.wet * 0.7), t, 0.3);
      v.fresh = false;
    }

    if (this.isMapMuted || this.isMuted) { v.prevSr = sr; return; }
    // Mắt xích thép đập bánh răng / bánh tì: vài tiếng "cạch" kim loại trầm, chỉ xe xích GẦN NHẤT trong ~100 m
    if (rank === 0 && !wheeled && mv > 0.05 && m < 100) {
      const heavy = type === 'ALL_ROUNDER' || type === 'GATLING';
      const rate = Math.min(10, 2 + mv * 9);
      const near = 1 - m / 100;
      if (v.nextClank < t) v.nextClank = t + Math.random() * 0.05;
      while (v.nextClank < t + 0.12) {
        const tt = v.nextClank;
        const f0 = (heavy ? 230 : 300) * (0.8 + Math.random() * 0.5);
        this.burst(v.mix, tt, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: f0, Q: 7, gain: (0.06 + 0.08 * Math.min(1, mv)) * near * (0.4 + Math.random()), attack: 0.002, dur: 0.06 + Math.random() * 0.04 });
        v.nextClank = tt + (1 / rate) * (0.55 + Math.random() * 0.9);
      }
    }
    // Xe tải 6x6 dừng hẳn gần mình: phanh hơi xả "xììì"
    if (truck && m < 120 && v.prevSr > 0.2 && sr < 0.04) {
      this.burst(v.mix, t + 0.15, { filter: 'bandpass', freq: 3200, Q: 0.8, gain: 0.12, attack: 0.02, dur: 0.6 });
    }
    v.prevSr = sr;
  }
});
