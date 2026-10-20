/**
 * ĐẠN PHÁO RÍT LAO XUỐNG GẦN XE (cảnh báo bằng tai).
 * Gắn thêm phương thức vào SoundEngine (xem sound_engine.js). Nạp sau sound_engine.js.
 */

SoundEngine.mixin(class {
  // ===========================================================================
  // 3. ĐẠN PHÁO RÍT LAO XUỐNG GẦN XE
  // ===========================================================================
  /**
   * Đạn pháo cầu vồng đang lao xuống gần xe mình: mỗi viên một kênh âm liên tục, game cập nhật mỗi khung hình
   * theo thời gian còn lại tới lúc chạm đất -> tiếng rít tụt cao độ (Doppler) + xé gió to dần, tắt đúng lúc nổ.
   * heavy: đạn 155mm (thêm tiếng gầm trầm "như tàu hỏa lao tới"); lead: số giây trước khi chạm đất thì bắt đầu nghe.
   */
  startIncoming(heavy = false, lead = 2) {
    if (!this.ready()) return null;
    this._incCount = this._incCount || 0;
    if (this._incCount >= 4) return null;   // mưa pháo: chỉ giữ vài viên gần nhất cho khỏi rối tai
    this._incCount++;
    const ctx = this.ctx, t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 1;
    let tail = master;
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); master.connect(pan); tail = pan; }
    tail.connect(this.weaponBus);
    if (this.reverb) { const send = ctx.createGain(); send.gain.value = 0.3; tail.connect(send); send.connect(this.reverb); }
    const loopSrc = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * 2); s.stop(t + lead + 6); return s; };
    const mkGain = (dest) => { const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(dest); return g; };
    // 1. Tiếng rít: dải rất hẹp, chao nhẹ theo nhịp đạn lắc khi bay (tiến động)
    const wSrc = loopSrc(this.pinkNoiseBuffer);
    const wF = ctx.createBiquadFilter(); wF.type = 'bandpass'; wF.Q.value = 16;
    const wF2 = ctx.createBiquadFilter(); wF2.type = 'bandpass'; wF2.Q.value = 6;
    const wG = mkGain(master);
    wSrc.connect(wF); wF.connect(wF2); wF2.connect(wG);
    const flut = ctx.createOscillator(); flut.frequency.value = 9 + Math.random() * 6;
    const flutD = ctx.createGain(); flutD.gain.value = 0;
    flut.connect(flutD); flutD.connect(wF.frequency); flutD.connect(wF2.frequency);
    flut.start(t); flut.stop(t + lead + 6);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const oG = mkGain(master);
    osc.connect(oG); flutD.connect(osc.frequency); osc.start(t); osc.stop(t + lead + 6);
    // 2. Xé gió: dải rộng, trầm dần
    const rSrc = loopSrc(this.pinkNoiseBuffer);
    const rF = ctx.createBiquadFilter(); rF.type = 'bandpass'; rF.Q.value = 0.9;
    const rG = mkGain(master);
    rSrc.connect(rF); rF.connect(rG);
    // 3. Đạn 155mm: tiếng gầm trầm cuộn tới
    let bG = null;
    if (heavy) {
      const bSrc = loopSrc(this.brownNoiseBuffer);
      const bF = ctx.createBiquadFilter(); bF.type = 'lowpass'; bF.frequency.value = 320;
      bG = mkGain(master);
      bSrc.connect(bF); bF.connect(bG);
    }
    const h = { heavy, lead, master, pan, wF, wF2, wG, osc, oG, flutD, rF, rG, bG, alive: true };
    this.updateIncoming(h, lead, 400, null);
    return h;
  }

  updateIncoming(h, timeLeft, impactDist, impactPos = null) {
    if (!h || !h.alive || !this.ctx) return;
    const t = this.ctx.currentTime, tc = 0.03;
    const x = Math.max(0, Math.min(1, 1 - timeLeft / h.lead));        // 0 lúc bắt đầu nghe -> 1 lúc chạm đất
    const near = Math.max(0, Math.min(1, 1 - impactDist / 520));      // rơi càng sát mình càng to, tụt cao độ càng mạnh
    const drop = 0.62 * Math.pow(x, 1.3) * (0.45 + 0.55 * near);
    const fw = (h.heavy ? 1650 : 2350) * (1 - drop);
    h.wF.frequency.setTargetAtTime(fw, t, tc);
    h.wF2.frequency.setTargetAtTime(fw * 1.02, t, tc);
    h.osc.frequency.setTargetAtTime(fw, t, tc);
    h.flutD.gain.setTargetAtTime(fw * 0.025, t, tc);
    h.rF.frequency.setTargetAtTime((h.heavy ? 1000 : 1500) * (1 - 0.6 * x), t, tc);
    const L = (0.12 + 0.88 * x * x) * (0.3 + 0.7 * near);
    h.wG.gain.setTargetAtTime(Math.max(0.0001, L * 3.2), t, tc);
    h.oG.gain.setTargetAtTime(Math.max(0.0001, L * 0.035), t, tc);
    h.rG.gain.setTargetAtTime(Math.max(0.0001, L * (h.heavy ? 1.3 : 0.9) * (0.25 + 0.75 * x)), t, tc);
    if (h.bG) h.bG.gain.setTargetAtTime(Math.max(0.0001, L * 2.2 * x * x), t, tc);
    if (h.pan && impactPos) {
      const me = window.game && window.game.player;
      if (me) {
        h.pan.pan.setTargetAtTime(viewPan(impactPos.x - me.x, impactPos.z - me.z, 0.8), t, 0.05);
      }
    }
  }

  // Đạn chạm đất / nổ trên không / biến mất: cắt tiếng ngay (tiếng nổ thay thế)
  stopIncoming(h) {
    if (!h || !h.alive || !this.ctx) return;
    h.alive = false;
    this._incCount = Math.max(0, (this._incCount || 1) - 1);
    const t = this.ctx.currentTime;
    h.master.gain.cancelScheduledValues(t);
    h.master.gain.setValueAtTime(h.master.gain.value, t);
    h.master.gain.linearRampToValueAtTime(0.0001, t + 0.03);
    setTimeout(() => { try { h.master.disconnect(); } catch (e) { /* đã ngắt */ } }, 200);
  }

  // Bản cũ: một tiếng rít ngắn cố định (giữ tương thích)
  /**
   * Đạn pháo đang lao xuống gần xe mình. distImpact: khoảng cách từ xe tới điểm rơi dự đoán;
   * timeToImpact: số giây còn lại tới lúc chạm đất — tiếng được canh để lên đỉnh và tắt ĐÚNG lúc nổ;
   * opts: { heavy (155mm), pos (điểm rơi, để nghe trái/phải) }.
   * Trả về handle { stop() } để cắt ngay khi đạn nổ (phòng điểm rơi thực khác dự đoán).
   * Tiếng thật: tiếng xé gió "xèèè" dày dần (không phải tiếng huýt sáo trong phim), cao độ tụt dần khi đạn tới gần;
   * đạn cỡ lớn có thêm tiếng gầm trầm như tàu hỏa lao tới; vài phần mười giây cuối dồn dập to vọt.
   */
  playIncomingWhistle(distImpact, timeToImpact = 0.8, opts = {}) {
    if (!this.ready() || distImpact > 520) return null;
    const now = this.ctx.currentTime;
    if (now - this.lastWhistleTime < 0.15) return null;
    this.lastWhistleTime = now;
    const ctx = this.ctx;
    const heavy = !!opts.heavy;
    const T = Math.max(0.35, Math.min(3, timeToImpact));
    const t0 = now, t1 = now + T;
    const near = Math.max(0, 1 - distImpact / 520);
    const sp = this.spatial(0, opts.pos || null);
    const out = this.voice({ bus: this.weaponBus, gain: 0.35 + 0.65 * near, wet: 0.2, pan: sp.pan * 0.8 });
    const nodes = [];
    const gains = [];
    // Luồng khí xoáy sau đuôi đạn: biên độ chập chờn ngẫu nhiên 30-80 lần/giây -> tiếng "xé vải" lởm chởm của đạn thật,
    // không phải nhiễu lọc trơn tru (nghe như tiếng gió máy). Một nguồn điều biên dùng chung cho các lớp
    const turb = ctx.createBufferSource();
    turb.buffer = this.noiseBuffer;
    turb.loop = true;
    const turbF = ctx.createBiquadFilter();
    turbF.type = 'lowpass';
    turbF.frequency.value = 70;
    turbF.Q.value = 0.5;
    turb.connect(turbF);
    turb.start(t0, Math.random() * 1.5);
    turb.stop(t1 + 0.1);
    nodes.push(turb);
    // lớp nhiễu quét tần: to dần theo hàm mũ (đạn mỗi lúc một gần), tụt cao độ, tắt cụt ở thời điểm nổ.
    // rough: độ "rách" (0..1); wob: chao cao độ theo nhịp đạn lắc khi bay (tỉ lệ)
    const swell = (buf, type, f0, f1, Q, peak, startK = 0, rough = 0, wob = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(f0, t0);
      f.frequency.exponentialRampToValueAtTime(f1, t1);
      f.Q.value = Q;
      if (wob) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 7 + Math.random() * 6;
        const lg = ctx.createGain();
        lg.gain.value = (f0 + f1) * 0.5 * wob;
        lfo.connect(lg);
        lg.connect(f.frequency);
        lfo.start(t0);
        lfo.stop(t1 + 0.1);
        nodes.push(lfo);
      }
      let head = f;
      if (rough) {
        const am = ctx.createGain();
        am.gain.value = 1 - rough * 0.5;
        const depth = ctx.createGain();
        depth.gain.value = rough * 6;   // nhiễu lọc 70 Hz có biên độ nhỏ (~0,08) -> nhân lên cho đủ độ sâu
        turbF.connect(depth);
        depth.connect(am.gain);
        f.connect(am);
        head = am;
      }
      const g = ctx.createGain();
      const ts = t0 + T * startK;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(peak * 0.12, ts + (t1 - ts) * 0.6);
      g.gain.exponentialRampToValueAtTime(peak, t1 - 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
      src.connect(f);
      head.connect(g);
      g.connect(out);
      src.start(t0, Math.random() * 1.5);
      src.stop(t1 + 0.1);
      nodes.push(src);
      gains.push(g);
    };
    // Càng rơi sát xe, cao độ tụt càng sâu (Doppler rõ hơn)
    const drop = 0.5 - near * 0.2;
    // 1. Tiếng xé gió dải trung — thành phần chính, "rách" lởm chởm theo luồng khí xoáy
    swell(this.pinkNoiseBuffer, 'bandpass', heavy ? 1300 : 1800, (heavy ? 1300 : 1800) * drop, 1.4, heavy ? 1.7 : 1.4, 0, 0.75);
    // 2. Tiếng rít của đạn xoay: dải hẹp, cao độ tụt dần và chao nhẹ theo nhịp đạn lắc (tiến động)
    swell(this.pinkNoiseBuffer, 'bandpass', heavy ? 2200 : 2900, (heavy ? 2200 : 2900) * drop, 13, heavy ? 4.5 : 4.2, 0.1, 0.25, 0.025);
    // 3. Đạn cỡ lớn: tiếng gầm trầm cuồn cuộn như tàu hỏa lao tới — cũng rách, không ù đều
    if (heavy) swell(this.brownNoiseBuffer, 'lowpass', 520, 220, 0.7, 1.5, 0.1, 0.6);
    // 4. Vài phần mười giây cuối: luồng gió ép "vụt" dải cao bùng lên ngay trước tiếng nổ
    swell(this.noiseBuffer, 'highpass', 2600, 1800, 0.7, 0.35 * (0.4 + near), 0.75, 0.5);
    return {
      stop: () => {
        const t = ctx.currentTime;
        for (const g of gains) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.02); }
        for (const n of nodes) { try { n.stop(t + 0.05); } catch (e) { /* đã dừng */ } }
      }
    };
  }
});
