/**
 * THƯỚC LA BÀN (trên cùng giữa màn hình): dải vạch chia độ trượt theo hướng camera — vạch mỗi 5°, số mỗi 15°, chữ hướng
 * B / ĐB / Đ / ĐN / N / TN / T / TB mỗi 45°, ô số hướng hiện tại ở giữa. Dưới dải: dấu cứ điểm A/B/C (màu phe giữ, nằm
 * ngoài tầm thước thì ghim ở mép), xe địch đang khóa, hòm thả dù, đích lái tự động; mép dưới dải: tam giác hướng nòng
 * (khi camera nhìn lệch nòng) và vệt đỏ hướng kẻ bắn vừa bắn trúng mình (RadarMinimap.threats).
 * Hướng: 0° = Bắc (-z), tăng theo chiều kim đồng hồ — cùng cách tính với game.bearingFromPlayer / số hướng kính ngắm.
 */
const CompassTape = (() => {
  const SPAN = 150;            // độ phủ cả chiều ngang thước
  const H = 40;                // chiều cao canvas (điểm ảnh CSS)
  const BAND = [4, 26];        // dải vạch: trên / dưới
  const MARK_Y = 33.5;         // hàng dấu mục tiêu dưới dải
  const DIRS = ['B', 'ĐB', 'Đ', 'ĐN', 'N', 'TN', 'T', 'TB'];
  const MONO = '"JetBrains Mono", "Share Tech Mono", monospace', TECH = '"Chakra Petch", sans-serif';
  const C = { amber: '#e7a63a', blue: '#5fb0dc', red: '#e0675c', ink: 'rgba(223,228,217,', threat: '255,77,61' };
  let cv = null, ctx = null;

  const norm = (d) => ((d % 360) + 540) % 360 - 180;   // lệch góc về [-180, 180)
  const bearing = (P, x, z) => Math.atan2(x - P.x, -(z - P.z)) * 180 / Math.PI;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function fit() {
    if (!cv) { cv = document.getElementById('hx-compass-canvas'); ctx = cv && cv.getContext('2d'); }
    if (!cv || !cv.offsetParent) return 0;   // HUD đang ẩn
    const W = Math.round(cv.clientWidth), dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.setTransform(pw / W, 0, 0, pw / W, 0, 0);
    return W;
  }

  function render(g) {
    const P = g && g.player;
    if (!P) return;
    const W = fit();
    if (!W) return;
    const cx = W / 2, k = W / SPAN, hdg = ((-(g._camYaw || 0) * 180 / Math.PI) % 360 + 360) % 360;
    const X = (deg) => cx + norm(deg - hdg) * k;                       // hướng -> toạ độ ngang
    const fade = (x) => 1 - smooth(0.62, 1, Math.abs(x - cx) / cx);    // mờ dần về hai mép
    const [b0, b1] = BAND;

    // nền dải: tối giữa, trong suốt hai mép
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, 'rgba(8,11,10,0)'); bg.addColorStop(0.2, 'rgba(8,11,10,0.5)');
    bg.addColorStop(0.8, 'rgba(8,11,10,0.5)'); bg.addColorStop(1, 'rgba(8,11,10,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, b0, W, b1 - b0);
    const ln = ctx.createLinearGradient(0, 0, W, 0);
    ln.addColorStop(0, C.ink + '0)'); ln.addColorStop(0.25, C.ink + '0.35)'); ln.addColorStop(0.75, C.ink + '0.35)'); ln.addColorStop(1, C.ink + '0)');
    ctx.fillStyle = ln; ctx.fillRect(0, b1 - 0.5, W, 0.75);

    // vạch + số + chữ hướng
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const start = Math.ceil((hdg - SPAN / 2) / 5) * 5;
    for (let d = start; d <= hdg + SPAN / 2; d += 5) {
      const x = X(d), a = fade(x), dd = ((d % 360) + 360) % 360;
      if (a <= 0.01) continue;
      const card = dd % 45 === 0, num = dd % 15 === 0;
      const near = Math.abs(x - cx) < 24;                              // dưới ô số hướng giữa
      ctx.globalAlpha = a * (near ? 0.25 : 1);
      ctx.strokeStyle = card ? C.ink + '0.95)' : num ? C.ink + '0.7)' : C.ink + '0.38)';
      ctx.lineWidth = card ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(x, b0 + 1); ctx.lineTo(x, b0 + 1 + (card ? 7 : num ? 5 : 3)); ctx.stroke();
      if (near) continue;
      if (card) {
        ctx.font = `700 ${dd % 90 === 0 ? 12 : 10}px ${TECH}`;
        ctx.fillStyle = dd === 0 ? C.amber : C.ink + '0.95)';
        ctx.fillText(DIRS[dd / 45], x, 19);
      } else if (num) {
        ctx.font = `500 9px ${MONO}`;
        ctx.fillStyle = C.ink + '0.62)';
        ctx.fillText(String(dd), x, 19);
      }
    }
    ctx.globalAlpha = 1;

    // vệt kẻ bắn vừa bắn trúng mình: đoạn đỏ nhấp nháy trên mép dưới dải, phủ đúng góc của vùng nghi vấn
    if (typeof RadarMinimap !== 'undefined' && RadarMinimap.threats && !P.isDead) {
      const tn = performance.now() / 1000, TTL = RadarMinimap.THREAT_TTL || 10, pulse = 0.5 + 0.5 * Math.sin(tn * 7);
      for (const T of RadarMinimap.threats().values()) {
        const age = tn - T.t, f = Math.min(1, (TTL - age) / 3);
        if (f <= 0) continue;
        const d = Math.max(1, Math.hypot(T.x - P.x, T.z - P.z));
        const hw = Math.max(4, Math.min(30, Math.asin(Math.min(1, T.r / d)) * 180 / Math.PI));
        const c = norm(bearing(P, T.x, T.z) - hdg);
        const l = Math.max(-SPAN / 2, c - hw), r = Math.min(SPAN / 2, c + hw);
        const col = `rgba(${C.threat},${(0.55 + 0.45 * pulse) * f})`;
        if (r > l) {
          ctx.fillStyle = col;
          ctx.fillRect(cx + l * k, b1 - 3, (r - l) * k, 3);
        }
        // ngoài tầm thước: mũi tên đỏ ở mép phía kẻ bắn
        if (Math.abs(c) > SPAN / 2 - 4) {
          const sx = c > 0 ? W - 7 : 7, dir = c > 0 ? 1 : -1;
          ctx.fillStyle = `rgba(${C.threat},${f})`;
          ctx.beginPath(); ctx.moveTo(sx + dir * 5, 15); ctx.lineTo(sx - dir * 2, 10); ctx.lineTo(sx - dir * 2, 20); ctx.closePath(); ctx.fill();
        }
      }
    }

    // dấu dưới dải. pin: ngoài tầm thước thì ghim ở mép, nhiều dấu cùng mép xếp lần vào trong (chỉ dấu ngoài cùng có mũi
    // tên chỉ ra mép); không pin thì bỏ
    const pinned = { l: 0, r: 0 };
    const mark = (x0, z0, draw, pin) => {
      const c = norm(bearing(P, x0, z0) - hdg), out = Math.abs(c * k) > cx - 24;   // sát mép cũng ghim: khỏi đè dấu đã ghim
      if (out && !pin) return;
      let x = cx + c * k, s = 0;
      if (out) {
        const side = c > 0 ? 'r' : 'l', n = pinned[side]++;
        x = side === 'r' ? W - 14 - n * 15 : 14 + n * 15;
        s = n === 0 ? Math.sign(c) : 0;
      }
      ctx.globalAlpha = out ? 0.8 : Math.max(0.35, fade(x));
      draw(x, MARK_Y, s, out);
      ctx.globalAlpha = 1;
    };
    const edgeArrow = (x, y, s, col) => {   // tam giác nhỏ chỉ ra ngoài mép
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x + s * 11, y); ctx.lineTo(x + s * 7.5, y - 3); ctx.lineTo(x + s * 7.5, y + 3); ctx.closePath(); ctx.fill();
    };

    // đích lái tự động
    const AD = g.autoDrive;
    if (AD && !P.isDead) mark(AD.x, AD.z, (x, y) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#eef5ea'; ctx.lineWidth = 1.3; ctx.stroke();
    }, false);
    // hòm thả dù
    const AIR = g.airdrop && !g.airdrop.collected ? g.airdrop : null;
    if (AIR) mark(AIR.x, AIR.z, (x, y, s) => {
      ctx.fillStyle = C.amber; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y); ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 4.5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (s) edgeArrow(x, y, s, C.amber);
    }, true);
    // cứ điểm: ô thoi chữ cái, tô màu phe giữ; đang tranh chấp nhấp nháy hổ phách
    const blink = Math.sin(performance.now() / 130) > 0;
    for (const cp of g.capturePoints || []) {
      const o = String(cp.owner || '').toUpperCase();
      const col = cp.isDisputed && blink ? C.amber : o === 'BLUE' ? C.blue : o === 'RED' ? C.red : '#cfd3c8';
      const filled = o === 'BLUE' || o === 'RED';
      mark(cp.x, cp.z, (x, y, s) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = filled ? col : 'rgba(10,13,12,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 1.3;
        ctx.fillRect(-4.6, -4.6, 9.2, 9.2); ctx.strokeRect(-4.6, -4.6, 9.2, 9.2);
        ctx.restore();
        ctx.font = `700 8px ${TECH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = filled ? '#0e100d' : col; ctx.fillText(cp.id, x, y + 0.5);
        if (s) edgeArrow(x, y, s, col);
      }, true);
    }
    // xe địch đang khóa: thoi rỗng đỏ (vàng khi ngắm tay) + cự ly
    const LT = g.lockedTarget, lp = LT && !LT.isDead && g.tacticalMap && g.tacticalMap.shownPos ? g.tacticalMap.shownPos(LT) : null;
    if (lp && !P.isDead) mark(lp.x, lp.z, (x, y, s, out) => {
      const col = g._manualAim ? C.amber : '#ff4d4d';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
      const dia = () => { ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.stroke(); };
      dia(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; dia();
      if (s) edgeArrow(x, y, s, col);
      if (!out) {
        const d = Math.hypot(lp.x - P.x, lp.z - P.z), t = d >= 1000 ? (d / 1000).toFixed(1) + 'K' : Math.round(d) + '';
        ctx.font = `600 8px ${MONO}`; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = col;
        ctx.strokeText(t, x + 8, y + 0.5); ctx.fillText(t, x + 8, y + 0.5);
      }
    }, true);

    // hướng nòng: tam giác xanh trên mép dưới dải (chỉ khi lệch hướng camera đủ thấy)
    if (!P.isDead && P.azimuth !== undefined) {
      const c = norm(P.azimuth - hdg);
      if (Math.abs(c) > 1.5 && Math.abs(c) < SPAN / 2) {
        const x = cx + c * k;
        ctx.globalAlpha = fade(x);
        ctx.fillStyle = P.team === 'RED' ? '#ff5a4a' : '#22d3f0'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, b1 - 5); ctx.lineTo(x + 4, b1 + 1); ctx.lineTo(x - 4, b1 + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ô số hướng giữa + mũi chỉ hổ phách phía trên
    {
      const t = String(Math.round(hdg) % 360).padStart(3, '0');
      const w = 34, y0 = 10, h = 15;
      ctx.fillStyle = 'rgba(10,13,12,0.92)'; ctx.strokeStyle = 'rgba(231,166,58,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - w / 2, y0, w, h, 2); else ctx.rect(cx - w / 2, y0, w, h);
      ctx.fill(); ctx.stroke();
      ctx.font = `700 11px ${MONO}`; ctx.fillStyle = '#f2f5ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t, cx, y0 + h / 2 + 0.5);
      ctx.fillStyle = C.amber;
      ctx.beginPath(); ctx.moveTo(cx - 4.5, 1); ctx.lineTo(cx + 4.5, 1); ctx.lineTo(cx, 7); ctx.closePath(); ctx.fill();
    }
  }

  return { render };
})();

if (typeof window !== 'undefined') window.CompassTape = CompassTape;
