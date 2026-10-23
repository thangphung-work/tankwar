/**
 * Cân bằng người chơi thật giữa 2 phe — dùng chung cho chủ phòng (matchmaking.js) và máy chủ (server_auth.js).
 * - rating: điểm xếp phe = lợi thế so với 1 bot (0.3 .. 2.5; 1 = cấp 10 thắng 50%), từ cấp + tỉ lệ thắng
 *   (tỉ lệ thắng co về 50% khi ít trận: cộng 10 trận ảo 5 thắng 5 thua)
 * - improve: chủ phòng chia phe bằng tìm kiếm cục bộ từ cách ngồi hiện tại (đổi chỗ 1 cặp / chuyển 1 người, mỗi bước
 *   phải giảm chênh lệch tổng điểm > MIN_GAIN) -> ít người phải đổi phe, rẻ (n <= 20 -> vài trăm phép tính / bước)
 * - check: máy chủ chỉ KIỂM TRA kết quả chủ phòng gửi (không tự tìm cách chia tốt nhất): đúng số người mỗi phe
 *   (chênh <= 1) và không còn cặp đổi chỗ / người chuyển nào giảm chênh lệch quá TOL. Sai -> máy chủ chạy improve sửa lại
 * - applySplit: đổi chỗ dữ liệu slot theo cách chia mới (người <-> người, hoặc người <-> bot bên phe kia)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeamBalance = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_W = 0.3, MAX_W = 2.5;
  const MIN_GAIN = 0.15;   // chủ phòng: chỉ đổi khi giảm chênh lệch > 0.15 điểm (không xáo phòng vì chênh vặt)
  const TOL = 0.2;         // máy chủ: còn bước giảm được > 0.2 điểm -> coi là chia lệch (chủ phòng chuẩn luôn <= MIN_GAIN)
  // Trường của slot đi theo NGƯỜI / BOT khi đổi chỗ (id, title, team thuộc về ô)
  const SLOT_KEYS = ['name', 'isHuman', 'isMe', 'peerId', 'tankType', 'kit', 'ready', 'ping', 'botId', 'rating'];

  function clean(v) {
    return (typeof v === 'number' && isFinite(v)) ? Math.max(MIN_W, Math.min(MAX_W, v)) : rating(1, 0, 0);
  }
  function rating(level, wins, matches) {
    const wr = ((wins || 0) + 5) / ((matches || 0) + 10);
    const eff = (level || 1) + (wr - 0.5) * 20;   // thắng 70% sau nhiều trận ~ +4 cấp
    return Math.max(MIN_W, Math.min(MAX_W, 0.4 + 0.06 * eff));
  }
  // Số liệu máy chủ đọc từ tài khoản { lv, w, m } | null (khách = người mới)
  function ratingOfSkill(k) { return k ? rating(k.lv, k.w, k.m) : rating(1, 0, 0); }

  // Bước tốt nhất từ cách chia blue[] (true = phe Xanh): { gain, a, b } (b = -1: chuyển a sang phe kia)
  function bestStep(w, blue) {
    let sb = 0, sr = 0, nb = 0, nr = 0;
    for (let i = 0; i < w.length; i++) { if (blue[i]) { sb += w[i]; nb++; } else { sr += w[i]; nr++; } }
    const diff = sb - sr, cur = Math.abs(diff);
    let best = { gain: 0, a: -1, b: -1 };
    for (let i = 0; i < w.length; i++) {
      // chuyển 1 người: chỉ khi phe đó đang hơn đúng 1 người (sau khi chuyển vẫn chênh <= 1)
      if ((blue[i] && nb - nr === 1) || (!blue[i] && nr - nb === 1)) {
        const g = cur - Math.abs(diff + (blue[i] ? -2 : 2) * w[i]);
        if (g > best.gain) best = { gain: g, a: i, b: -1 };
      }
      if (!blue[i]) continue;
      for (let j = 0; j < w.length; j++) {
        if (blue[j]) continue;
        const g = cur - Math.abs(diff - 2 * (w[i] - w[j]));
        if (g > best.gain) best = { gain: g, a: i, b: j };
      }
    }
    return best;
  }

  // Đưa số người 2 phe về chênh <= 1 (chuyển người làm chênh lệch điểm nhỏ nhất), rồi tìm kiếm cục bộ
  function improve(w, blue0, minGain = MIN_GAIN) {
    const blue = blue0.slice();
    for (let guard = 0; guard < w.length; guard++) {
      const nb = blue.filter(Boolean).length, nr = blue.length - nb;
      if (Math.abs(nb - nr) <= 1) break;
      const fromBlue = nb > nr;
      let sb = 0, sr = 0;
      w.forEach((x, i) => { if (blue[i]) sb += x; else sr += x; });
      let pick = -1, bestAbs = Infinity;
      for (let i = 0; i < w.length; i++) {
        if (blue[i] !== fromBlue) continue;
        const d = Math.abs((sb - sr) + (fromBlue ? -2 : 2) * w[i]);
        if (d < bestAbs) { bestAbs = d; pick = i; }
      }
      blue[pick] = !fromBlue;
    }
    for (let guard = 0; guard < 4 * w.length + 8; guard++) {
      const s = bestStep(w, blue);
      if (s.gain <= minGain) break;
      blue[s.a] = !blue[s.a];
      if (s.b >= 0) blue[s.b] = !blue[s.b];
    }
    return blue;
  }

  // Cách chia có hợp lệ không (máy chủ): { ok, reason }
  function check(w, blue) {
    const nb = blue.filter(Boolean).length, nr = blue.length - nb;
    if (Math.abs(nb - nr) > 1) return { ok: false, reason: `lệch người ${nb}-${nr}` };
    const s = bestStep(w, blue);
    if (s.gain > TOL) return { ok: false, reason: `chia lệch điểm (còn giảm được ${s.gain.toFixed(2)})` };
    return { ok: true };
  }

  // Ghi cách chia mới vào slots. humans: các slot người (cùng thứ tự với blue0 / blue1). Trả số ô đã đổi
  function applySplit(slots, humans, blue0, blue1, rnd = Math.random) {
    const swap = (a, b) => SLOT_KEYS.forEach(k => { const v = a[k]; a[k] = b[k]; b[k] = v; });
    const toRed = humans.filter((s, i) => blue0[i] && !blue1[i]);
    const toBlue = humans.filter((s, i) => !blue0[i] && blue1[i]);
    let n = 0;
    while (toRed.length && toBlue.length) { swap(toRed.pop(), toBlue.pop()); n += 2; }
    for (const [list, team] of [[toRed, 'RED'], [toBlue, 'BLUE']]) {
      for (const a of list) {
        const bots = slots.filter(s => s.team === team && !s.isHuman);
        if (bots.length) { swap(a, bots[Math.floor(rnd() * bots.length)]); n++; }
      }
    }
    return n;
  }

  return { MIN_GAIN, TOL, SLOT_KEYS, rating, clean, ratingOfSkill, improve, check, applySplit };
});
