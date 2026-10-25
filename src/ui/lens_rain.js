/**
 * GIỌT MƯA BÁM ỐNG KÍNH camera drone trinh sát / UAV cảm tử (lớp canvas 2D phủ trong khung #gun-sight)
 * - Trời mưa, ống kính hứng mưa (không ở dưới mái hầm): giọt đập lên kính rải rác, to nhỏ khác nhau, ngoài vùng nét nên
 *   nhòe tròn — viền tối, đốm sáng phản chiếu, lõi khúc xạ sáng nhẹ; giọt to nặng trượt dần xuống rồi tan
 * - Bay nhanh (UAV cảm tử, drone bay tốc độ cao): luồng khí thổi giọt dạt từ giữa ra mép khung, kéo dài thành vệt
 * - Hết mưa / vào hầm: giọt khô dần rồi mất
 * update(dt, host, o): host = phần tử khung kính (#gun-sight), o = { rain: 0..1, flow: 0..1 luồng khí, cover: có mái che }
 */
const LensRain = (() => {
  const MAX = 70;
  let cv = null, ctx = null, sprite = null, drops = [], acc = 0, W = 0, H = 0;

  function makeSprite() {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const c = s.getContext('2d');
    // thân giọt: lõi trong suốt sáng nhẹ, viền tối (khúc xạ cảnh tối quanh mép giọt)
    let g = c.createRadialGradient(32, 34, 2, 32, 33, 30);
    g.addColorStop(0, 'rgba(235,240,245,0.16)');
    g.addColorStop(0.62, 'rgba(190,200,210,0.10)');
    g.addColorStop(0.86, 'rgba(18,22,28,0.38)');
    g.addColorStop(1, 'rgba(10,12,16,0)');
    c.fillStyle = g; c.beginPath(); c.arc(32, 32, 30, 0, Math.PI * 2); c.fill();
    // đốm sáng phản chiếu phía trên-trái
    g = c.createRadialGradient(23, 21, 0, 23, 21, 9);
    g.addColorStop(0, 'rgba(210,220,230,0.38)'); g.addColorStop(1, 'rgba(210,220,230,0)');
    c.fillStyle = g; c.beginPath(); c.arc(23, 21, 9, 0, Math.PI * 2); c.fill();
    // vành sáng mảnh phía dưới (ánh trời hội tụ qua giọt)
    c.strokeStyle = 'rgba(210,220,230,0.12)'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(32, 32, 22, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
    return s;
  }

  function ensure(host) {
    if (cv && cv.parentNode === host) return true;
    if (!host) return false;
    cv = document.createElement('canvas');
    cv.className = 'gs-lens-rain';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    host.insertBefore(cv, host.firstChild);   // dưới chữ / vạch HUD của khung kính
    ctx = cv.getContext('2d');
    if (!sprite) sprite = makeSprite();
    drops = []; W = H = 0;
    return true;
  }

  function spawn(flow) {
    const big = Math.random() < 0.18;
    drops.push({
      x: Math.random() * W, y: Math.random() * H,
      r: (big ? 14 + Math.random() * 12 : 5 + Math.random() * 7) * (W / 960),
      a: 0, life: 2.5 + Math.random() * 4, t: 0,
      slide: big ? 0.6 + Math.random() * 1.2 : 0, sx: (Math.random() - 0.5) * 0.3,
      big
    });
    if (drops.length > MAX) drops.shift();
  }

  function update(dt, host, o) {
    if (!ensure(host)) return;
    // độ phân giải nửa màn hình là đủ (giọt nhòe, không cần nét)
    const w = Math.max(2, Math.round(host.clientWidth / 2)), h = Math.max(2, Math.round(host.clientHeight / 2));
    if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; drops = []; }
    const rain = o && !o.cover ? o.rain || 0 : 0, flow = (o && o.flow) || 0;
    // tốc độ đập giọt: mưa nặng hạt ~8 giọt / s; bay nhanh hứng nhiều hơn
    acc += dt * rain * (8 + 10 * flow);
    while (acc >= 1) { acc -= 1; spawn(flow); }
    if (!drops.length) { if (cv.dataset.on) { ctx.clearRect(0, 0, W, H); delete cv.dataset.on; } return; }
    cv.dataset.on = '1';
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, dry = rain > 0 ? 1 : 2.5;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt * dry;
      d.a = Math.min(1, d.t / 0.08) * (1 - Math.max(0, (d.t - d.life * 0.7) / (d.life * 0.3)));
      if (d.t >= d.life) { drops.splice(i, 1); continue; }
      // giọt to trượt xuống; luồng khí thổi dạt từ giữa ra mép
      let vx = d.sx * d.slide * 40, vy = d.slide * 40 * (0.5 + 0.5 * Math.min(1, d.t));
      if (flow > 0) {
        const ox = d.x - cx, oy = d.y - cy, ol = Math.hypot(ox, oy) || 1;
        const v = flow * W * 0.6 * (0.4 + ol / W);
        vx += ox / ol * v; vy += oy / ol * v;
      }
      d.x += vx * dt; d.y += vy * dt;
      if (d.x < -40 || d.x > W + 40 || d.y < -40 || d.y > H + 40) { drops.splice(i, 1); continue; }
      const sp = Math.hypot(vx, vy), st = Math.min(2.2, 1 + sp / (W * 0.4));
      ctx.globalAlpha = d.a;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (st > 1.05) ctx.rotate(Math.atan2(vy, vx) - Math.PI / 2);
      ctx.drawImage(sprite, -d.r, -d.r * st, d.r * 2, d.r * 2 * st);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  return { update };
})();
if (typeof window !== 'undefined') window.LensRain = LensRain;
