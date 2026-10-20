/**
 * LỬA CHÁY LIÊN TỤC & GIÓ NỀN CHIẾN TRƯỜNG.
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // LỬA CHÁY LIÊN TỤC (xe cháy, xác xe, cây cháy): mỗi đám cháy là một nguồn âm chạy liên tục.
  // Bên gọi chỉ cần "báo còn cháy" ~2 lần/giây: fireSource(key, pos, k). Không được báo nữa -> lửa tắt dần.
  // Âm sắc lửa thật: tiếng gầm dải trung của luồng khí nóng (cao độ, độ lớn chao ngẫu nhiên — không theo nhịp đều),
  // lách tách dày của vật liệu cháy, tí tách trầm của mảnh lớn, xì khí nóng, thỉnh thoảng "bụp".
  // ===========================================================================
  listenerXZ() {
    const g = window.game, lab = window.__fxLab;
    if (g && g.player) return { x: g.player.x, z: g.player.z };
    if (lab && lab.camera) return { x: lab.camera.position.x, z: lab.camera.position.z };
    return { x: 0, z: 0 };
  }

  // opts.leaf: lá ngụy trang / cành lá cháy — lép bép giòn dày, xì hơi nước (lá tươi), ít tiếng gầm; opts.dry: lá khô
  fireSource(key, pos, k = 1, opts = null) {
    if (!this.ready() || !pos || key == null) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.fireLoops = this.fireLoops || new Map();
    this.sweepFires(t);
    const L = this.listenerXZ();
    const d = Math.hypot(pos.x - L.x, pos.z - L.z);
    let F = this.fireLoops.get(key);
    if (!F) {
      if (d > 1400) return;
      // tối đa 5 đám cháy cùng kêu: bỏ đám xa nhất nếu đám mới gần hơn
      if (this.fireLoops.size >= 5) {
        let far = null;
        for (const [kk, f] of this.fireLoops) if (!far || f.d > far[1].d) far = [kk, f];
        if (far && far[1].d > d) this.stopFire(far[0], 0.3); else return;
      }
      F = this.makeFireLoop(t, opts);
      this.fireLoops.set(key, F);
      // Tự dọn lửa hết được báo: sweepFires vốn chỉ chạy trong fireSource / updateEngine — trang không có tiếng máy
      // (fx_lab...) hoặc đám cháy cuối cùng vừa tắt thì không ai gọi nữa -> vòng lặp lửa kêu "ù ù" mãi
      if (!this._fireSweepId) {
        this._fireSweepId = setInterval(() => {
          if (this.ctx) this.sweepFires(this.ctx.currentTime);
          if (!this.fireLoops.size) { clearInterval(this._fireSweepId); this._fireSweepId = 0; }
        }, 500);
      }
    }
    F.seen = t;
    F.d = d;
    const sp = this.spatial(d, pos);
    const kk = Math.max(0.2, Math.min(1.5, k));
    F.out.gain.setTargetAtTime(sp.gain * 0.5 * kk, t, F.fresh ? 0.25 : 0.4);
    F.lp.frequency.setTargetAtTime(Math.max(500, sp.lowpass), t, 0.3);
    if (F.pan) F.pan.pan.setTargetAtTime(sp.pan, t, 0.3);
    F.send.gain.setTargetAtTime(Math.min(0.8, sp.wet), t, 0.3);
    F.fresh = false;
    this.scheduleFireSnaps(F, t, kk);
    // "bụp": túi khí / bình dầu / lốp nổ trong đám cháy, thỉnh thoảng
    if (Math.random() < (F.leaf ? 0.04 : 0.18) * kk) {
      const tp = t + Math.random() * 0.4;
      this.burst(F.mix, tp, { buffer: this.brownNoiseBuffer, filter: 'lowpass', freq: 500, drive: 2, gain: 0.9, attack: 0.002, dur: 0.12 });
      this.burst(F.mix, tp, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 1400, Q: 0.8, gain: 0.5, attack: 0.001, dur: 0.05 });
    }
  }

  // Bộ đệm riêng cho lửa: các bộ đệm nhiễu chung chỉ dài 3 s, phát lặp liên tục thì cứ 3 s chuỗi lách tách lặp lại y hệt
  // -> nghe ra "vòng lặp có cấu trúc". Lửa dùng bộ đệm dài, độ dài lệch nhau (không bội số của nhau), tạo một lần khi cần.
  ensureFireBuffers() {
    if (this.fireBufs) return this.fireBufs;
    const ctx = this.ctx, sr = ctx.sampleRate;
    // nhiễu hồng 11.7 s (tiếng gầm, nhịp thở, lớp trầm, xì)
    const plen = Math.floor(sr * 11.7);
    const pink = ctx.createBuffer(1, plen, sr);
    const pd = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < plen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // lách tách 15.1 s: mật độ không đều (từng cụm dày / thưa như vật liệu cháy nứt), biên độ lệch (đa số nhỏ, ít tiếng to)
    const clen = Math.floor(sr * 15.1);
    const crk = ctx.createBuffer(1, clen, sr);
    const cd = crk.getChannelData(0);
    let dens = 1, densT = 0;
    for (let i = 0; i < clen; i++) {
      if (i >= densT) { dens = 0.35 + Math.random() * 1.6; densT = i + Math.floor(sr * (0.08 + Math.random() * 0.5)); }
      if (Math.random() < 0.0016 * dens) {
        const amp = (0.12 + 0.88 * Math.pow(Math.random(), 2.2)) * (Math.random() < 0.5 ? -1 : 1);
        const n = 6 + Math.floor(Math.random() * 44);
        for (let k = 0; k < n && i + k < clen; k++) cd[i + k] += amp * Math.exp(-k / (n * 0.3)) * (Math.random() * 2 - 1);
      }
    }
    // nhiễu điều khiển chậm (độ "phừng", tâm tần chao): 3 kHz, 97 s, phổ ~1/f vùng 0.5-15 Hz; chuẩn hóa để sau lọc thấp 3 Hz
    // có rms ≈ 0.046 như nhiễu hồng cũ (giữ nguyên các độ sâu chao đã chỉnh)
    const ssr = 3000, slen = ssr * 97;
    const slow = ctx.createBuffer(1, slen, ssr);
    const sd = slow.getChannelData(0);
    let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
    for (let i = 0; i < slen; i++) {
      const w = Math.random() * 2 - 1;
      c0 = 0.99886 * c0 + w * 0.0555; c1 = 0.99332 * c1 + w * 0.0751; c2 = 0.969 * c2 + w * 0.1539; c3 = 0.8665 * c3 + w * 0.3105;
      sd[i] = c0 + c1 + c2 + c3 + w * 0.3;
    }
    const al = 1 - Math.exp(-2 * Math.PI * 3 / ssr);
    let y1 = 0, y2 = 0, m = 0, q = 0;
    for (let i = 0; i < slen; i++) { y1 += al * (sd[i] - y1); y2 += al * (y1 - y2); m += y2; q += y2 * y2; }
    m /= slen;
    const sc = 0.046 / Math.sqrt(Math.max(1e-12, q / slen - m * m));
    for (let i = 0; i < slen; i++) sd[i] = (sd[i] - m) * sc;
    // tiếng "tách" rời: 64 ô 30 ms, mỗi ô một tiếng nứt sắc (vào tức thì, tắt trong 0,2-1,5 ms), đôi khi 2-3 tiếng nứt
    // dính nhau "crk"; lẫn chút cộng hưởng tắt nhanh 2-6 kHz cho chất "tách" giòn của thớ lá / cành. Lấy từ bộ đệm nhiễu
    // chung (cửa sổ 8-33 ms ngẫu nhiên) thì mỗi tiếng là một nhúm nhiễu lọc dải -> dày lên nghe "rè rè" như sóng radio
    const snapLen = 0.03, snapN = 64, sl = Math.floor(sr * snapLen);
    const snap = ctx.createBuffer(1, sl * snapN, sr);
    const nd = snap.getChannelData(0);
    for (let s = 0; s < snapN; s++) {
      const o = s * sl;
      const nc = Math.random() < 0.6 ? 1 : Math.random() < 0.75 ? 2 : 3;
      let at = Math.floor(sr * 0.0005), amp = 1, pk = 0;
      for (let c = 0; c < nc && at < sl; c++) {
        const tau = sr * (0.0002 + Math.random() * 0.0013);
        const rf = 2000 + Math.random() * 4000, rm = Math.random() * 0.35, ph = Math.random() * 6.28;
        for (let k = 0; at + k < sl && k < tau * 7; k++) {
          const e = Math.exp(-k / tau);
          nd[o + at + k] += amp * e * ((Math.random() * 2 - 1) * (1 - rm) + rm * Math.sin(ph + 2 * Math.PI * rf * k / sr));
        }
        at += Math.floor(sr * (0.0015 + Math.random() * 0.0065));
        amp *= 0.35 + Math.random() * 0.5;
      }
      for (let i = 0; i < sl; i++) pk = Math.max(pk, Math.abs(nd[o + i]));
      for (let i = 0; i < sl; i++) nd[o + i] *= 0.9 / Math.max(1e-6, pk);
    }
    this.fireBufs = { pink, crk, slow, snap, snapLen, snapN };
    return this.fireBufs;
  }

  // Một tiếng "tách" sắc của vật liệu cháy nứt (bright: lá / cành nhỏ, sáng tiếng; không: mảnh lớn, đục hơn)
  fireSnap(dest, t, gain, bright) {
    const B = this.ensureFireBuffers();
    const s = (Math.random() * B.snapN) | 0;
    this.burst(dest, t, { buffer: B.snap, offset: s * B.snapLen, filter: 'highpass', freq: bright ? 900 + Math.random() * 2200 : 300 + Math.random() * 700, Q: 0.5, gain, attack: 0.0003, dur: B.snapLen * 0.9 });
  }

  makeFireLoop(t, opts) {
    const ctx = this.ctx;
    const leaf = !!(opts && opts.leaf), dry = !!(opts && opts.dry);
    const B = this.ensureFireBuffers();
    const rnd = (a, b) => a + Math.random() * (b - a);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12000;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    mix.connect(lp);
    lp.connect(out);
    let node = out, pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); out.connect(pan); node = pan; }
    node.connect(this.weaponBus);
    const send = ctx.createGain();
    send.gain.value = 0.2;
    node.connect(send);
    if (this.reverb) send.connect(this.reverb);
    const srcs = [];
    // mỗi lớp: tốc độ phát & điểm bắt đầu ngẫu nhiên riêng -> các lớp không trùng nhịp lặp, mỗi đám cháy một kiểu
    const loop = (buf, r0, r1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rnd(r0, r1); srcs.push(s); return s; };
    // nhiễu chậm điều khiển độ "phừng" của lửa (không tuần hoàn, mỗi bộ chao một đoạn khác nhau của bộ đệm 97 s)
    const flick = (hz, depth, target) => {
      const n = loop(B.slow, 0.8, 1.25);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = depth;
      n.connect(f);
      f.connect(g);
      g.connect(target);
    };
    const size = leaf ? rnd(0.55, 0.7) : rnd(0.85, 1.15);   // đám cháy to hơn: gầm trầm hơn; lá cháy: ngọn nhỏ, sáng tiếng
    // 1. tiếng gầm của luồng khí nóng: nhiễu hồng dải trung, độ lớn & tâm tần chao ngẫu nhiên
    const roar = loop(B.pink, 0.92, 1.08);
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 420 / size;
    rf.Q.value = rnd(0.45, 0.65);
    flick(3, 4000, rf.frequency);   // tâm tần chao ±~200 Hz
    const ra = ctx.createGain();
    ra.gain.value = leaf ? 0.6 : 1.4;
    flick(4, 9, ra.gain);           // độ lớn chao ±~40%
    roar.connect(rf);
    rf.connect(ra);
    ra.connect(mix);
    // nhịp "thở" của đám cháy lớn: khối lửa cuộn lên từng đợt (dải 180-400 Hz, độ lớn chao chậm & sâu, không tuần hoàn)
    const br = loop(B.pink, 0.82, 0.97);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 260 / size;
    bf.Q.value = 0.6;
    flick(1.5, 1500, bf.frequency);
    const ba = ctx.createGain();
    ba.gain.value = leaf ? 0.3 : 1.0;
    flick(rnd(0.9, 1.4), 14, ba.gain);
    br.connect(bf);
    bf.connect(ba);
    ba.connect(mix);
    // lớp trầm "ù ù" của đám cháy lớn — nhỏ thôi (nhiễu hồng ×1.7 ≈ mức nhiễu nâu cũ ở dải 160 Hz)
    const low = loop(B.pink, 0.7, 0.9);
    const lf = ctx.createBiquadFilter();
    lf.type = 'bandpass';
    lf.frequency.value = 160;
    lf.Q.value = 0.7;
    const lg = ctx.createGain();
    lg.gain.value = leaf ? 0.04 : 0.3;
    low.connect(lf);
    lf.connect(lg);
    lg.connect(mix);
    // 2. lách tách dày (vật liệu cháy nứt nổ) — 2 lớp lệch tốc độ phát, mật độ dâng / lắng chậm ngẫu nhiên
    // lá cháy: lách tách giòn, dải cao, dày hơn (lá & cành nhỏ quăn nổ liên tục)
    // (lá: chỉ còn là lớp nền nhỏ — tiếng tách chính do fireSnap rời rạc lo, lớp lặp dày to quá nghe thành "rè rè")
    for (const [r0, r1, fq, g] of (leaf ? [[1.1, 1.35, 4200, 1.4], [0.9, 1.1, 2600, 1.1]] : [[0.9, 1.12, 2600, 3.2], [0.66, 0.8, 1500, 2.4]])) {
      const c = loop(B.crk, r0, r1);
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = fq * rnd(0.85, 1.15);
      cf.Q.value = 0.5;
      const cg = ctx.createGain();
      cg.gain.value = g * rnd(0.8, 1.2);
      flick(0.7, g * 9, cg.gain);   // ±~40% theo đợt cháy bùng / lắng
      c.connect(cf);
      cf.connect(cg);
      cg.connect(mix);
    }
    // 3. tí tách trầm của mảnh lớn (than hồng, kim loại nóng co giãn)
    const pop = loop(B.crk, 0.36, 0.45);
    const pf = ctx.createBiquadFilter();
    pf.type = 'lowpass';
    pf.frequency.value = 700;
    const pg = ctx.createGain();
    pg.gain.value = leaf ? 0.5 : 2.2;
    pop.connect(pf);
    pf.connect(pg);
    pg.connect(mix);
    // 4. khí nóng xì (nhiễu hồng dải cao ×6 ≈ mức nhiễu trắng cũ)
    const hiss = loop(B.pink, 1.0, 1.2);
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = leaf ? 3600 : 4500;
    const hg = ctx.createGain();
    // lá: chỉ xì rất nhỏ — xì cao liên tục chao nhanh nghe như sóng radio "rè rè"; tiếng xèo xèo hơi nước của lá tươi
    // đến từng đợt ngắn (scheduleFireSnaps)
    hg.gain.value = leaf ? (dry ? 0.06 : 0.12) : 0.2;
    flick(leaf ? 1.5 : 2, leaf ? (dry ? 0.55 : 1.1) : 2.4, hg.gain);
    hiss.connect(hf);
    hf.connect(hg);
    hg.connect(mix);
    srcs.forEach(s => s.start(t, Math.random() * s.buffer.duration));
    // tiếng "lép bép" to rời rạc: quá trình Poisson (khoảng cách ngẫu nhiên theo phân bố mũ), mỗi đám cháy một mật độ
    return { mix, lp, out, pan, send, srcs, seen: t, d: 0, fresh: true, leaf, snapRate: leaf ? rnd(dry ? 22 : 14, dry ? 30 : 20) : rnd(1.5, 4), nextSnap: t + Math.random() * 0.3, dry, nextSizzle: t + rnd(0.3, 1.5) };
  }

  // Lên lịch các tiếng "lép bép" rời rạc cho ~0.7 s tới (gọi mỗi lần đám cháy được báo, ~2 lần/giây)
  scheduleFireSnaps(F, t, kk) {
    const rate = F.snapRate * (0.5 + 0.5 * kk);
    if (F.nextSnap < t) F.nextSnap = t + 0.01;
    let guard = 0;
    while (F.nextSnap < t + 0.7 && guard++ < 40) {
      const ts = F.nextSnap;
      const loud = Math.pow(Math.random(), 2.5);   // đa số nhỏ, thỉnh thoảng một tiếng to
      if (F.leaf) {
        // lá / cành nhỏ nứt "tách" sắc, giòn; thỉnh thoảng một chùm 2-4 tiếng sát nhau (cuống lá quăn nổ), ít khi
        // một tiếng "cạch" đục hơn của cành to
        const nb = Math.random() < 0.22 ? 2 + ((Math.random() * 3) | 0) : 1;
        const lv = Math.pow(Math.random(), 3);
        for (let b = 0; b < nb; b++) this.fireSnap(F.mix, ts + b * (0.01 + Math.random() * 0.035), (0.25 + 2.2 * lv) * (b ? 0.5 + Math.random() * 0.5 : 1), Math.random() > 0.12);
        F.nextSnap = ts - Math.log(1 - Math.random()) / rate;
        continue;
      }
      this.burst(F.mix, ts, { buffer: this.crackleBuffer, filter: 'bandpass', freq: 1100 + Math.random() * 3400, Q: 0.7 + Math.random() * 0.9, gain: 0.5 + 2.4 * loud, attack: 0.0008, dur: 0.02 + Math.random() * 0.05 });
      if (loud > 0.5) this.burst(F.mix, ts, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 600 + Math.random() * 500, Q: 1, gain: 0.5 * loud, attack: 0.001, dur: 0.04 });
      F.nextSnap = ts - Math.log(1 - Math.random()) / rate;
    }
    // lá tươi: hơi nước & nhựa sôi phụt ra "xèèè" từng đợt ngắn, lúc có lúc không (lá khô hiếm khi)
    if (F.leaf && F.nextSizzle < t + 0.7) {
      const ts = Math.max(t, F.nextSizzle);
      const dur = 0.25 + Math.random() * 0.7;
      this.burst(F.mix, ts, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: 4500 + Math.random() * 3500, Q: 0.9, gain: (F.dry ? 0.15 : 0.35) * (0.5 + Math.random()), attack: 0.08 + Math.random() * 0.15, dur });
      F.nextSizzle = ts + dur + (F.dry ? 2 : 0.6) + Math.random() * (F.dry ? 5 : 2.5);
    }
  }

  // Lưới lá ngụy trang bén lửa: "phừng" nhẹ của lá bắt lửa (luồng khí nóng dải trung bùng lên rồi lắng) + chùm lách tách
  camoIgnite(pos, dry = false) {
    if (!this.ready() || !pos) return;
    const L = this.listenerXZ();
    const d = Math.hypot(pos.x - L.x, pos.z - L.z);
    if (d > 1200) return;
    const sp = this.spatial(d, pos);
    const t = this.ctx.currentTime + sp.delay;
    const out = this.voice({ gain: sp.gain * 0.32, lowpass: sp.lowpass, wet: Math.min(0.9, sp.wet + 0.05), pan: sp.pan });
    const rise = 0.08 + Math.random() * 0.1;
    this.burst(out, t, { buffer: this.pinkNoiseBuffer, filter: 'bandpass', freq: dry ? 700 : 520, freqEnd: dry ? 1300 : 950, sweep: rise + 0.3, Q: 0.6, gain: dry ? 1.3 : 1.0, attack: rise, dur: 0.7 + Math.random() * 0.4 });
    this.burst(out, t + 0.03, { buffer: this.pinkNoiseBuffer, filter: 'highpass', freq: 3800, gain: dry ? 0.35 : 0.55, attack: 0.12, dur: 0.9 });
    for (let i = 0, n = 6 + Math.floor(Math.random() * 6); i < n; i++) this.fireSnap(out, t + 0.05 + Math.random() * 0.6, 0.4 + 1.2 * Math.pow(Math.random(), 2), true);
  }

  stopFire(key, fade = 0.6) {
    const F = this.fireLoops && this.fireLoops.get(key);
    if (!F) return;
    const t = this.ctx.currentTime;
    F.out.gain.cancelScheduledValues(t);
    F.out.gain.setValueAtTime(F.out.gain.value, t);
    F.out.gain.setTargetAtTime(0.0001, t, fade);
    F.srcs.forEach(s => { try { s.stop(t + fade * 6); } catch (e) { /* đã dừng */ } });
    this.fireLoops.delete(key);
  }

  // Lửa không còn được báo ~1.5 s -> tắt dần
  sweepFires(t) {
    if (!this.fireLoops || !this.fireLoops.size) return;
    for (const [key, F] of this.fireLoops) if (t - F.seen > 1.5) this.stopFire(key, 0.7);
  }

  // Gió chiến trường: nền rì rào trầm + từng cơn gió mạnh lên rồi lặng; luôn rất nhỏ, chỉ để không gian không "chết"
  updateAmbience(t) {
    if (!this.ctx || !this.brownNoiseBuffer) return;
    if (!this.ambience) {
      const ctx = this.ctx;
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.masterGain);
      // nền gió rì rào dải trung (tai người nghe gió là tiếng xào xạc, không phải tiếng ù trầm như gió thổi vào micro)
      const base = ctx.createBufferSource();
      base.buffer = this.pinkNoiseBuffer;
      base.loop = true;
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = 650;
      bf.Q.value = 0.5;
      const bg = ctx.createGain();
      bg.gain.value = 0.5;
      base.connect(bf);
      bf.connect(bg);
      bg.connect(out);
      const gust = ctx.createBufferSource();
      gust.buffer = this.pinkNoiseBuffer;
      gust.loop = true;
      const gf = ctx.createBiquadFilter();
      gf.type = 'bandpass';
      gf.frequency.value = 700;
      gf.Q.value = 0.8;
      const gg = ctx.createGain();
      gg.gain.value = 0;
      gust.connect(gf);
      gf.connect(gg);
      gg.connect(out);
      base.start();
      gust.start(0, Math.random() * 2);
      this.ambience = { out, gf, gg, next: 0 };
      out.gain.setTargetAtTime(0.04, t, 2);
    }
    const A = this.ambience;
    if (t >= A.next) {
      // cơn gió mới: mạnh / nhẹ ngẫu nhiên, gió mạnh thì "hú" cao hơn
      const s = Math.random();
      A.gg.gain.setTargetAtTime(0.02 + s * 0.12, t, 0.8 + Math.random() * 1.2);
      A.gf.frequency.setTargetAtTime(450 + s * 700, t, 1.5);
      A.next = t + 2.5 + Math.random() * 4;
    }
  }
});
