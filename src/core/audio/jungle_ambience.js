/**
 * TIẾNG RỪNG NHIỆT ĐỚI (map Rừng rậm) — tổng hợp thủ tục, không dùng file ghi âm. Gắn vào SoundEngine; nạp SAU các file
 * tiếng súng / nổ (weapon_fire, impacts, gatling, module_weapons) để bọc được các hàm đó.
 *
 * - Nền liên tục: gió lùa qua tán (ào ào dải trung, lên xuống theo cơn), lá xào xạc dải cao theo cơn gió, côn trùng rỉ rả.
 * - Sự kiện ngẫu nhiên quanh người nghe (hướng, khoảng cách, cao độ, nhịp, số nốt đều ngẫu nhiên -> không bao giờ lặp
 *   y hệt): chim hót luyến, chim kêu "tuk tuk", tu hú, cu gáy, vẹt / hồng hoàng kêu khàn, chim lách chách, vượn hú,
 *   khỉ ré, gõ kiến, sóng ve sầu, ếch nhái (gần nước), cành khô gãy rơi. Loài vừa kêu thì ít được chọn lại ngay.
 * - MUÔNG THÚ SỢ TIẾNG SÚNG: phát bắn / nổ / đạn trúng gần người nghe -> chim vỗ cánh bay tán loạn, cả rừng im bặt (gió
 *   vẫn thổi, côn trùng nhỏ hẳn). Yên tiếng súng một lúc (25-50 s, ngẫu nhiên) thì côn trùng rỉ rả lại trước, chim thú
 *   kêu thưa rồi dày dần. Mưa to: chim thú ít kêu.
 */
(function () {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = A => A[(Math.random() * A.length) | 0];
  // Loài: trọng số chọn, cự ly (đơn vị game, 8 = 1 m), có cần gần nước không
  const SPECIES = {
    whistler: { w: 1.3, d: [120, 900] },
    barbet: { w: 1.0, d: [200, 1400] },
    koel: { w: 0.7, d: [300, 1600] },
    dove: { w: 0.6, d: [150, 900] },
    squawk: { w: 0.7, d: [150, 1200] },
    trill: { w: 1.0, d: [80, 700] },
    gibbon: { w: 0.45, d: [900, 2600] },
    monkey: { w: 0.4, d: [400, 1800] },
    woodpecker: { w: 0.5, d: [150, 1100] },
    cicada: { w: 0.6, d: [100, 900] },
    frog: { w: 1.4, d: [100, 700], water: true },
    branch: { w: 0.15, d: [100, 600] }
  };

  SoundEngine.mixin(class {
    // Gọi mỗi khung trong trận. on: đang ở map rừng & còn trong trận; o: { x, z, nearWater (0..1), rain (0..1) }
    updateWildlife(on, o = {}) {
      if (!this.ctx || !this.masterGain || !this.pinkNoiseBuffer) return;
      const ctx = this.ctx, t = ctx.currentTime;
      if (!this.wild) {
        if (!on) return;
        this.wild = this.buildWildlife();
      }
      const W = this.wild;
      W.lastCall = t;
      W.on = !!on;
      W.water = o.nearWater || 0;
      W.rain = o.rain !== undefined ? o.rain : (this.rainAmb ? this.rainAmb.k || 0 : 0);
      const dt = W.prevT ? Math.min(0.5, t - W.prevT) : 0;
      W.prevT = t;
      // nỗi sợ nguôi dần khi im tiếng súng (thời gian hồi chọn ngẫu nhiên mỗi lần bị động)
      if (W.fear > 0) W.fear = Math.max(0, W.fear - dt / W.recover);
      const calm = 1 - W.fear;
      const vol = on && !this.isMuted ? 1 : 0;
      W.out.gain.setTargetAtTime(vol, t, on ? 1.5 : 0.4);
      W.lp.frequency.setTargetAtTime(this.interior ? 1600 : 16000, t, 0.2);
      // côn trùng: nhỏ hẳn khi có súng, rỉ rả lại trước chim; mưa to át tiếng côn trùng
      W.insG.gain.setTargetAtTime(0.03 * Math.pow(calm, 1.5) * (1 - 0.7 * W.rain), t, W.fear > 0.5 ? 0.3 : 3);
      // cơn gió: đổi mục tiêu mỗi vài giây (mưa: gió mạnh hơn)
      if (t >= W.nextGust) {
        const g = Math.pow(Math.random(), 1.6) * (0.75 + 0.5 * W.rain) + 0.12;
        const tc = rnd(0.8, 3);
        W.windG.gain.setTargetAtTime(0.05 * (0.35 + g), t, tc);
        W.leafG.gain.setTargetAtTime(0.03 * Math.pow(g, 1.6), t, tc * 0.7);
        W.windF.frequency.setTargetAtTime(rnd(320, 520) + 380 * g, t, tc);
        W.nextGust = t + rnd(1.5, 7);
      }
      if (!on || this.isMuted || this.isPageHidden) return;
      // sự kiện: nhịp trung bình ~1 tiếng / 1,6 s khi rừng yên, thưa đi theo nỗi sợ & mưa
      if (t >= W.nextEvent) {
        const k = Math.pow(calm, 2.5) * (1 - 0.75 * W.rain);
        if (Math.random() < k) this.wildEvent(t + rnd(0, 0.3));
        // đồ họa "Thấp" (máy yếu): thưa tiếng hơn -> ít nút âm thanh chạy cùng lúc
        const lowK = window.game && window.game.gfxTier === 'low' ? 1.7 : 1;
        W.nextEvent = t + ((-Math.log(1 - Math.random() * 0.98)) * 1.6 + 0.15) * lowK;
      }
    }

    buildWildlife() {
      const ctx = this.ctx, t = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = 0.5;
      out.connect(lp); lp.connect(this.masterGain);
      const loop = (buf, rate) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * 2); return s; };
      // gió lùa tán: nhiễu nâu / hồng qua dải trung
      const wS = loop(this.brownNoiseBuffer || this.pinkNoiseBuffer, rnd(0.85, 1.1));
      const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 420; windF.Q.value = 0.55;
      const windG = ctx.createGain(); windG.gain.value = 0.02;
      wS.connect(windF); windF.connect(windG); windG.connect(out);
      // lá xào xạc: nhiễu trắng thông cao, gai gai theo cơn gió
      const lS = loop(this.noiseBuffer, 1);
      const leafF = ctx.createBiquadFilter(); leafF.type = 'highpass'; leafF.frequency.value = 2600; leafF.Q.value = 0.4;
      const leafF2 = ctx.createBiquadFilter(); leafF2.type = 'lowpass'; leafF2.frequency.value = 9000;
      const leafG = ctx.createGain(); leafG.gain.value = 0.005;
      lS.connect(leafF); leafF.connect(leafF2); leafF2.connect(leafG); leafG.connect(out);
      // côn trùng nền: vài "con dế" xa — dao động hình sin cao tần, ngắt nhịp bằng LFO vuông (rỉ rả)
      const insG = ctx.createGain(); insG.gain.value = 0;
      const insLp = ctx.createBiquadFilter(); insLp.type = 'lowpass'; insLp.frequency.value = 7000;
      insG.connect(insLp); insLp.connect(out);
      for (let i = 0; i < 4; i++) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = rnd(3800, 6200);
        const am = ctx.createGain(); am.gain.value = 0;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rnd(2.5, 9);
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
        const bias = ctx.createConstantSource ? ctx.createConstantSource() : null;
        lfo.connect(lfoG); lfoG.connect(am.gain);
        if (bias) { bias.offset.value = 0.5; bias.connect(am.gain); bias.start(t); }
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const lev = ctx.createGain(); lev.gain.value = rnd(0.25, 0.6);
        o.connect(am); am.connect(lev);
        if (pan) { pan.pan.value = rnd(-0.8, 0.8); lev.connect(pan); pan.connect(insG); } else lev.connect(insG);
        o.start(t); lfo.start(t);
      }
      // gửi hồi âm rừng chung cho các tiếng sự kiện
      const ev = ctx.createGain(); ev.gain.value = 1; ev.connect(out);
      const wet = ctx.createGain(); wet.gain.value = 0.55; ev.connect(wet);
      if (this.reverb) wet.connect(this.reverb);
      const W = { out, lp, windF, windG, leafG, insG, ev, fear: 0, recover: 30, nextGust: 0, nextEvent: t + rnd(2, 5), recent: [], lastCall: t, on: true, water: 0, rain: 0, prevT: 0, individuals: {} };
      // không còn ai gọi update (rời trận / về sảnh): tắt dần
      W.watch = setInterval(() => {
        if (!this.ctx || !W.out) return;
        if (this.ctx.currentTime - W.lastCall > 1.2) W.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      }, 1000);
      return W;
    }

    // Tiếng súng / nổ / đạn trúng: d = khoảng cách tới tai (đơn vị game), R = tầm làm thú hoảng
    startleWildlife(d, R = 3000) {
      const W = this.wild;
      if (!W || !W.on) return;
      const k = Math.max(0, 1 - (Number.isFinite(d) ? d : 0) / R);
      if (k <= 0) return;
      const was = W.fear;
      W.fear = Math.max(W.fear, Math.min(1, 0.55 + 0.6 * k));
      W.recover = rnd(25, 50);
      // đang yên ả mà bị động lớn: đàn chim vỗ cánh bay tán loạn + vài tiếng kêu báo động, rồi im
      if (was < 0.35 && W.fear > 0.6 && this.ctx && !this.isMuted) this.wildFlush(this.ctx.currentTime + rnd(0.15, 0.6));
      W.nextEvent = Math.max(W.nextEvent, this.ctx.currentTime + 4);
    }

    // kênh phát 1 sự kiện ở hướng & cự ly ngẫu nhiên
    wildVoice(t, dmin, dmax) {
      const ctx = this.ctx, W = this.wild;
      const d = rnd(dmin, dmax), m = d / 8;
      const g = ctx.createGain(); g.gain.value = 1 / (1 + m / 30);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(1200, Math.min(16000, 12000 * Math.pow(30 / Math.max(5, m), 0.55)));
      g.connect(lp);
      let node = lp;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = rnd(-0.9, 0.9); lp.connect(p); node = p; }
      node.connect(W.ev);
      // tràng dài nhất (vượn hú, ve sầu) < ~15 s: ngắt khỏi đồ thị sau đó (tránh rò nút)
      setTimeout(() => { try { node.disconnect(); } catch (e) { /* đã ngắt */ } }, (t - ctx.currentTime + 22) * 1000);
      return g;
    }

    // một nốt hót: tần số đi qua chuỗi điểm (luyến), bao biên mềm, thêm hoạ âm bậc 2 nhỏ
    wildNote(dest, t, freqs, dur, gain, o = {}) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freqs[0], t);
      for (let i = 1; i < freqs.length; i++) osc.frequency.exponentialRampToValueAtTime(freqs[i], t + dur * i / (freqs.length - 1));
      const g = ctx.createGain();
      const a = o.attack !== undefined ? o.attack : Math.min(0.02, dur * 0.2);
      g.gain.value = 0; g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + a);
      g.gain.setValueAtTime(gain, t + Math.max(a, dur * 0.6));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (o.bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.bpQ || 1.5; osc.connect(f); node = f; }
      node.connect(g); g.connect(dest);
      if (o.vib) {
        const l = ctx.createOscillator(); l.frequency.value = o.vib; const lg = ctx.createGain(); lg.gain.value = freqs[0] * (o.vibDepth || 0.04);
        l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05);
      }
      if (o.h2) {
        const o2 = ctx.createOscillator(); o2.type = 'sine';
        o2.frequency.setValueAtTime(freqs[0] * 2, t);
        for (let i = 1; i < freqs.length; i++) o2.frequency.exponentialRampToValueAtTime(freqs[i] * 2, t + dur * i / (freqs.length - 1));
        const g2 = ctx.createGain(); g2.gain.value = o.h2; o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + dur + 0.05);
      }
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    // "cá thể": mỗi loài có vài con quanh đây, mỗi con giữ giọng riêng (cao độ, nhịp) nhưng mỗi lần hót biến tấu khác
    wildIndividual(sp) {
      const W = this.wild, L = W.individuals[sp] || (W.individuals[sp] = []);
      if (L.length < 3 || Math.random() < 0.15) {
        const ind = { pitch: rnd(0.82, 1.22), tempo: rnd(0.8, 1.25), seed: Math.random(), side: rnd(-1, 1) };
        if (L.length >= 3) L.shift();
        L.push(ind);
      }
      return pick(L);
    }

    wildEvent(t) {
      const W = this.wild;
      // chọn loài theo trọng số, bớt loài vừa kêu (không lặp đều đều), ếch chỉ gần nước
      let tot = 0;
      const ws = [];
      for (const k in SPECIES) {
        const S = SPECIES[k];
        let w = S.w * (S.water ? W.water : 1);
        const rc = W.recent.indexOf(k);
        if (rc >= 0) w *= 0.15 + 0.2 * rc;
        ws.push([k, w]); tot += w;
      }
      let r = Math.random() * tot, sp = ws[0][0];
      for (const [k, w] of ws) { if ((r -= w) <= 0) { sp = k; break; } }
      W.recent.unshift(sp); if (W.recent.length > 3) W.recent.pop();
      const S = SPECIES[sp], ind = this.wildIndividual(sp), v = this.wildVoice(t, S.d[0], S.d[1]);
      this['wild_' + sp](v, t, ind);
      // thỉnh thoảng một con khác cùng loài đáp lời
      if (sp !== 'branch' && sp !== 'cicada' && Math.random() < 0.25) {
        const ind2 = this.wildIndividual(sp), t2 = t + rnd(1.2, 4);
        this['wild_' + sp](this.wildVoice(t2, S.d[0], S.d[1]), t2, ind2);
      }
    }

    // ---- các loài ----
    wild_whistler(v, t, I) {
      // chim hót luyến (khướu / chào mào / vàng anh): 3-7 nốt, mỗi nốt một kiểu luyến lên / xuống / vòng
      const n = 3 + ((Math.random() * 5) | 0), base = 1700 * I.pitch;
      let tt = t;
      for (let i = 0; i < n; i++) {
        const f = base * rnd(0.75, 1.6), dur = rnd(0.06, 0.24) / I.tempo, s = Math.random();
        const fr = s < 0.3 ? [f, f * rnd(1.2, 1.6)] : s < 0.6 ? [f * rnd(1.2, 1.5), f] : s < 0.85 ? [f, f * rnd(1.25, 1.5), f * rnd(0.85, 1.05)] : [f, f * 1.02];
        this.wildNote(v, tt, fr, dur, rnd(0.05, 0.11), { h2: 0.12, vib: Math.random() < 0.3 ? rnd(25, 45) : 0 });
        tt += dur + rnd(0.02, 0.12) / I.tempo;
      }
    }
    wild_trill(v, t, I) {
      // chim nhỏ lách chách: chuỗi tiếng "chíp" nhanh, cao, hơi trôi xuống
      const n = 6 + ((Math.random() * 18) | 0), rate = rnd(12, 24) * I.tempo, f0 = rnd(3600, 6200) * I.pitch, drift = rnd(0.75, 1.1);
      for (let i = 0; i < n; i++) {
        const f = f0 * Math.pow(drift, i / n) * rnd(0.97, 1.03);
        this.wildNote(v, t + i / rate, [f * 1.15, f * 0.85], rnd(0.018, 0.035), rnd(0.03, 0.06));
      }
    }
    wild_barbet(v, t, I) {
      // cu rốc / thầy chùa: "tuk-tuk-tuk..." trầm đều, có khi đôi "tuk-trrr"
      const n = 6 + ((Math.random() * 22) | 0), rate = rnd(2.6, 5) * I.tempo, f = rnd(480, 820) * I.pitch, dbl = Math.random() < 0.35;
      for (let i = 0; i < n; i++) {
        const tt = t + i / rate + rnd(-0.01, 0.01);
        this.wildNote(v, tt, [f * 1.08, f * 0.94], 0.07, rnd(0.09, 0.14), { h2: 0.25, bp: f * 1.4, bpQ: 1.2 });
        if (dbl) this.wildNote(v, tt + 0.1, [f * 1.06, f * 0.92], 0.06, 0.08, { h2: 0.25 });
      }
    }
    wild_koel(v, t, I) {
      // tu hú: "ku-uu" hai nốt đi lên, lặp 3-7 lần, mỗi lần cao & dồn dập hơn
      const n = 3 + ((Math.random() * 5) | 0), f = rnd(650, 1000) * I.pitch;
      let tt = t, k = 1, gap = rnd(0.55, 0.9) / I.tempo;
      for (let i = 0; i < n; i++) {
        this.wildNote(v, tt, [f * k, f * k * 1.04], 0.22, 0.1, { h2: 0.08 });
        this.wildNote(v, tt + 0.27, [f * k * 1.2, f * k * 1.42], 0.42, 0.12, { h2: 0.08 });
        tt += 0.7 + gap; gap *= rnd(0.8, 0.95); k *= rnd(1.02, 1.06);
      }
    }
    wild_dove(v, t, I) {
      // cu gáy: "cúc-cu-cuuu" trầm, mềm
      const f = rnd(340, 520) * I.pitch, pattern = pick([[0.12, 0.12, 0.45], [0.18, 0.5], [0.1, 0.1, 0.1, 0.5], [0.2, 0.2, 0.55]]);
      let tt = t;
      for (const [i, d] of pattern.entries()) {
        const fr = i === pattern.length - 1 ? [f * 1.05, f * 0.92] : [f, f * 1.05];
        this.wildNote(v, tt, fr, d, 0.13, { bp: f * 1.2, bpQ: 0.8, vib: 9, vibDepth: 0.015 });
        tt += d + rnd(0.05, 0.14);
      }
    }
    wild_squawk(v, t, I) {
      // vẹt / hồng hoàng: tiếng khàn chói ngắn (sóng răng cưa qua dải cộng hưởng, điều tần nhanh)
      const n = 1 + ((Math.random() * 4) | 0), f = rnd(520, 1100) * I.pitch, form = rnd(1500, 2600);
      for (let i = 0; i < n; i++) {
        const tt = t + i * rnd(0.25, 0.6), d = rnd(0.09, 0.3);
        this.wildNote(v, tt, [f, f * rnd(1.1, 1.4), f * rnd(0.7, 0.95)], d, rnd(0.05, 0.09), { type: 'sawtooth', bp: form, bpQ: 2.5, vib: rnd(40, 80), vibDepth: 0.12 });
      }
    }
    wild_gibbon(v, t, I) {
      // vượn hú xa: chuỗi tiếng "hú" vút lên rồi hạ, nhanh & cao dần (bản hát lớn), vọng rừng
      const n = 4 + ((Math.random() * 8) | 0), f = rnd(480, 700) * I.pitch;
      let tt = t, dur = rnd(0.7, 1.0), k = 1;
      for (let i = 0; i < n; i++) {
        this.wildNote(v, tt, [f * k, f * k * rnd(1.9, 2.4), f * k * rnd(1.3, 1.6)], dur, rnd(0.12, 0.18), { h2: 0.1, attack: 0.08 });
        tt += dur + rnd(0.08, 0.25); dur *= rnd(0.8, 0.92); k *= rnd(1.01, 1.05);
      }
    }
    wild_monkey(v, t, I) {
      // khỉ ré / chí chóe: vài tiếng nhiễu dải quét nhanh
      const n = 3 + ((Math.random() * 6) | 0);
      for (let i = 0; i < n; i++) {
        const tt = t + i * rnd(0.12, 0.35), f = rnd(900, 2400) * I.pitch;
        this.burst(v, tt, { buffer: this.noiseBuffer, filter: 'bandpass', freq: f, freqEnd: f * rnd(1.3, 2), sweep: 0.12, Q: rnd(6, 12), gain: rnd(0.25, 0.5), attack: 0.01, dur: rnd(0.08, 0.2) });
        if (Math.random() < 0.5) this.wildNote(v, tt, [f * 0.8, f * 1.3, f], rnd(0.1, 0.2), 0.05, { type: 'triangle' });
      }
    }
    wild_woodpecker(v, t, I) {
      // gõ kiến: tràng gõ nhanh, chậm & nhỏ dần cuối tràng
      const n = 10 + ((Math.random() * 18) | 0), rate = rnd(13, 22) * I.tempo, f = rnd(900, 1800);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        this.burst(v, t + i / rate * (1 + u * 0.3), { buffer: this.noiseBuffer, filter: 'bandpass', freq: f, Q: 4, gain: 0.5 * (1 - u * 0.6), attack: 0.001, dur: 0.02 });
      }
    }
    wild_cicada(v, t, I) {
      // sóng ve sầu: dải nhiễu cao Q lớn, điều biên rất nhanh, dâng lên rồi lắng (4-11 s)
      const ctx = this.ctx, dur = rnd(4, 11), f = rnd(4200, 7200) * I.pitch;
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuffer; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = rnd(8, 18);
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(35, 90); const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain);
      const env = ctx.createGain(); env.gain.value = 0;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(rnd(0.25, 0.45), t + dur * rnd(0.25, 0.45));
      env.gain.setValueAtTime(rnd(0.2, 0.4), t + dur * 0.7);
      env.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(am); am.connect(env); env.connect(v);
      s.start(t, Math.random()); s.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    wild_frog(v, t, I) {
      // ếch nhái ven nước: "ộp ộp" xung trầm, vài con kêu so le
      const n = 2 + ((Math.random() * 6) | 0), f = rnd(220, 480) * I.pitch;
      for (let i = 0; i < n; i++) {
        const tt = t + i * rnd(0.35, 0.8);
        this.wildNote(v, tt, [f * 0.9, f * 1.1, f], rnd(0.12, 0.3), 0.14, { type: 'square', bp: f * 2.5, bpQ: 2, vib: rnd(25, 50), vibDepth: 0.2 });
      }
    }
    wild_branch(v, t) {
      // cành khô gãy rơi lộp độp qua tán
      this.burst(v, t, { buffer: this.noiseBuffer, filter: 'bandpass', freq: rnd(1500, 3000), Q: 2, gain: 0.5, attack: 0.001, dur: 0.05 });
      for (let i = 0, n = 2 + ((Math.random() * 5) | 0); i < n; i++) {
        this.burst(v, t + 0.2 + i * rnd(0.12, 0.3), { buffer: this.noiseBuffer, filter: 'bandpass', freq: rnd(600, 2200), Q: 1.5, gain: rnd(0.15, 0.35), attack: 0.002, dur: rnd(0.04, 0.12) });
      }
    }
    // đàn chim hoảng: tiếng vỗ cánh phành phạch (nhiễu xung dồn dập nhỏ dần) + vài tiếng kêu báo động, rồi rừng im
    wildFlush(t) {
      for (let k = 0; k < 2 + ((Math.random() * 3) | 0); k++) {
        const v = this.wildVoice(t, 120, 700), t0 = t + rnd(0, 0.5), n = 10 + ((Math.random() * 14) | 0), rate = rnd(10, 16);
        for (let i = 0; i < n; i++) {
          const u = i / n;
          this.burst(v, t0 + i / rate, { buffer: this.noiseBuffer, filter: 'bandpass', freq: rnd(500, 1300), Q: 0.9, gain: 0.35 * (1 - u * 0.8), attack: 0.004, dur: 0.05 });
        }
        for (let i = 0; i < 1 + ((Math.random() * 3) | 0); i++) {
          const f = rnd(2200, 4200);
          this.wildNote(v, t0 + rnd(0, 0.6), [f, f * 1.3, f * 0.9], rnd(0.06, 0.12), 0.08, { h2: 0.2 });
        }
      }
    }
  });

  // Bọc các tiếng súng / nổ / đạn trúng: phát gần tai thì muông thú hoảng (đối số khoảng cách ở vị trí khác nhau)
  const WRAP = [['playCannonFire', 2, 4200], ['playExplosionAtDistance', 0, 4500], ['playMissileLaunch', 0, 3000],
    ['playGatlingShot', 1, 2600], ['playKineticImpact', 0, 2400], ['playGatlingImpact', 0, 1600], ['playHullHit', -1, 1], ['playHullBlast', -1, 1]];
  for (const [name, ai, R] of WRAP) {
    const f = SoundEngine.prototype[name];
    if (typeof f !== 'function') continue;
    SoundEngine.prototype[name] = function (...a) {
      try { if (this.wild) this.startleWildlife(ai < 0 ? 0 : a[ai] || 0, R); } catch (e) { /* tiếng chính vẫn phát */ }
      return f.apply(this, a);
    };
  }
})();
