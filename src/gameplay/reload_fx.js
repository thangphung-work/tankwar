/**
 * HIỆU ỨNG NẠP ĐẠN DÙNG CHUNG
 *  - toss(): vỏ / vật rời văng ra khỏi xe (đế liều phóng xe tăng, ống phóng tên lửa rỗng) — rơi theo trọng lực, nảy & lăn
 *    trên mặt đất / nóc xe rồi nằm lại vài giây, mờ dần biến mất
 *  - puff(): khói thuốc phóng xì ra ở cửa hất vỏ / khóa nòng (dùng chung pool khói của xe, SpgFXPool)
 *  - KÍP XE BÁO SẴN SÀNG (xe người chơi): nạp xong là nghe tiếng bộ đàm nội bộ + giọng kíp xe (giọng tiếng Việt của
 *    trình duyệt nếu có) + dòng báo ngắn dưới tâm ngắm — như pháo thủ / nạp đạn hô "SẴN SÀNG!" sau mỗi phát
 * Mô hình xe (mbt_halberd.js, recon_marten.js) gọi toss / puff từ modelAnimator; vòng lặp game gọi update qua ArtilleryGame3D.update
 */
const ReloadFX = (() => {
  const G = 78;            // trọng lực (đv/s², 8 đv = 1 m)
  const items = [];
  const MAX = 40;

  /** mesh: vật văng (sẽ được thêm vào scene), pos / vel: Vector3-like thế giới, spin: {x,y,z} rad/s, life: giây nằm lại */
  function toss(scene, mesh, pos, vel, spin, life = 8) {
    if (!scene || !mesh) return;
    if (items.length >= MAX) kill(0);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh);
    items.push({ mesh, vx: vel.x, vy: vel.y, vz: vel.z, sx: spin.x || 0, sy: spin.y || 0, sz: spin.z || 0, life, t: 0, half: mesh.userData.half || 0.5, rest: false });
  }

  function kill(i) {
    const it = items[i];
    if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
    it.mesh.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && o.material.userData && o.material.userData.own) o.material.dispose();
    });
    items.splice(i, 1);
  }

  // mặt đỡ dưới vật: nóc / sàn xe gần đó (hộp thân xe) hoặc mặt đất
  function supportY(x, y, z, terrain, units) {
    let g = terrain ? terrain.getElevationAt(x, z) : 0;
    if (units && typeof Strongholds !== 'undefined' && Strongholds.unitBox) {
      for (const u of units) {
        if (Math.abs(u.x - x) > 40 || Math.abs(u.z - z) > 40) continue;
        const B = Strongholds.unitBox(u), c = Math.cos(u.bodyAngle || 0), s = Math.sin(u.bodyAngle || 0);
        const dx = x - u.x, dz = z - u.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (lx < B.minX || lx > B.maxX || lz < B.minZ || lz > B.maxZ) continue;
        // chỉ đỡ phần sàn động cơ thấp (không đỡ trên nóc tháp — vật trượt khỏi tháp rơi xuống sàn)
        const top = (u.y || 0) + Math.min(B.maxY, 7);
        if (y >= top - 2 && top > g) g = top;
      }
    }
    return g;
  }

  function update(dt, terrain, units) {
    if (!(dt > 0)) return;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], m = it.mesh;
      it.t += dt;
      if (!it.rest) {
        it.vy -= G * dt;
        m.position.x += it.vx * dt; m.position.y += it.vy * dt; m.position.z += it.vz * dt;
        m.rotation.x += it.sx * dt; m.rotation.y += it.sy * dt; m.rotation.z += it.sz * dt;
        const gy = supportY(m.position.x, m.position.y - it.half, m.position.z, terrain, units) + it.half;
        if (m.position.y <= gy) {
          m.position.y = gy;
          if (it.vy < -8) {
            // nảy: mất phần lớn vận tốc, lăn chậm lại
            it.vy = -it.vy * 0.28; it.vx *= 0.55; it.vz *= 0.55;
            it.sx *= 0.5; it.sy *= 0.6; it.sz *= 0.5;
          } else {
            it.rest = true;
            // nằm xuống: trục vật song song mặt đất (ống / đế nằm nghiêng như rơi thật)
            m.rotation.x = Math.round(m.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
            m.rotation.z = Math.round(m.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
      // mờ dần lúc hết thời gian nằm lại
      const fade = it.life - it.t;
      if (fade < 1.2) m.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, fade / 1.2); } });
      if (it.t >= it.life) kill(i);
    }
  }

  /** khói thuốc phóng xì ra tại pos (thế giới), hướng dir */
  function puff(unit, pos, dir, n = 3) {
    if (!unit || typeof SpgFXPool === 'undefined' || !unit.fxParticles) return;
    if (!unit.alwaysFX && SpgFXPool.isNearView && !SpgFXPool.isNearView(unit.x, unit.z)) return;
    for (let k = 0; k < n; k++) {
      const p = SpgFXPool.acquire(unit.scene, 'smoke', 0xb9bdc2, 0.3);
      p.position.set(pos.x, pos.y, pos.z);
      unit.fxParticles.push({
        mesh: p, base: 1.2 + k * 0.4,
        vx: dir.x * (6 + k * 3) + (Math.random() - 0.5) * 2, vy: 3 + dir.y * 4 + Math.random() * 2, vz: dir.z * (6 + k * 3) + (Math.random() - 0.5) * 2,
        scale: 0.8, alpha: 0.32, growSpeed: 2.4, rotSpeed: (Math.random() - 0.5), drag: 2.2, life: 1.3 + k * 0.3
      });
    }
  }

  // ---------- KÍP XE BÁO SẴN SÀNG ----------
  let viVoice, voiceChecked = false;
  function pickVoice() {
    if (voiceChecked) return viVoice;
    const S = window.speechSynthesis;
    if (!S || !S.getVoices) { voiceChecked = true; return null; }
    const vs = S.getVoices();
    if (!vs.length) return null;   // danh sách giọng nạp chậm: hỏi lại lần sau
    voiceChecked = true;
    viVoice = vs.find(v => /^vi/i.test(v.lang)) || null;
    return viVoice;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', () => { voiceChecked = false; pickVoice(); });
  }

  // tiếng bộ đàm nội bộ: bấm nút nói (tách), xì nhiễu ngắn, nhả nút (tách)
  function intercom() {
    const SE = window.soundEngine;
    if (!SE || !SE.ctx || !SE.tone || (SE.ready && !SE.ready())) return;
    const bus = SE.uiBus || SE.masterGain, t = SE.ctx.currentTime + 0.01;
    SE.tone(bus, t, { type: 'square', freq: 2200, gain: 0.012, attack: 0.001, hold: 0.008, dur: 0.02, filter: 'bandpass', filterFreq: 2400 });
    SE.tone(bus, t + 0.03, { type: 'sawtooth', freq: 900, freqEnd: 700, gain: 0.006, attack: 0.004, hold: 0.06, dur: 0.05, filter: 'bandpass', filterFreq: 1500 });
    SE.tone(bus, t + 0.62, { type: 'square', freq: 1700, gain: 0.01, attack: 0.001, hold: 0.008, dur: 0.02, filter: 'bandpass', filterFreq: 2000 });
  }

  let callEl = null, callT = 0;
  function showCall(text) {
    if (!callEl) {
      if (!document.getElementById('crew-call-style')) {
        const st = document.createElement('style');
        st.id = 'crew-call-style';
        st.textContent = '#crew-call{position:fixed;left:50%;top:64%;transform:translate(-50%,0);z-index:7;pointer-events:none;font-family:"Chakra Petch",system-ui,sans-serif;'
          + 'font-size:13px;font-weight:600;letter-spacing:.1em;color:#9ff0b0;text-shadow:0 0 3px #000,0 0 8px #000;opacity:0;transition:opacity .18s;white-space:nowrap}'
          + '#crew-call.on{opacity:1}#crew-call i{font-style:normal;color:#dff5d8;opacity:.7;margin-right:6px;font-weight:500}';
        document.head.appendChild(st);
      }
      callEl = document.createElement('div');
      callEl.id = 'crew-call';
      document.body.appendChild(callEl);
    }
    callEl.innerHTML = text;
    callEl.classList.add('on');
    callT = 1.6;
  }

  /** who: 'NẠP ĐẠN' / 'PHÁO THỦ'..., text: chữ trên màn hình, say: câu nói (giọng tiếng Việt nếu trình duyệt có) */
  function crewCall(who, text, say) {
    intercom();
    showCall('<i>' + who + ':</i>' + text);
    const S = window.speechSynthesis, v = pickVoice();
    if (S && v && say) {
      try {
        S.cancel();
        const u = new SpeechSynthesisUtterance(say);
        u.voice = v; u.lang = v.lang; u.rate = 1.25; u.pitch = 0.9; u.volume = 0.85;
        setTimeout(() => S.speak(u), 60);
      } catch (e) { /* trình duyệt chặn đọc */ }
    }
  }

  // Theo dõi xe người chơi: hết thời gian nạp (pháo chính / tên lửa / băng đạn) -> kíp xe báo sẵn sàng
  function watchPlayer(game, dt) {
    if (callT > 0) { callT -= dt; if (callT <= 0 && callEl) callEl.classList.remove('on'); }
    const P = game && game.player;
    if (!P || P.isDead) { if (game) game._rfx = null; return; }
    const W = game._rfx && game._rfx.u === P ? game._rfx : (game._rfx = { u: P, rl: P.reloadTimer || 0, at: P.antiTankCooldown || 0 });
    const rl = P.reloadTimer || 0, at = P.antiTankCooldown || 0;
    if (W.rl > 0 && rl <= 0) {
      const T = P.tankType;
      if (T === 'ALL_ROUNDER') {
        const a = P.selectedAmmo;
        const nm = a === 'AP' ? 'XUYÊN GIÁP' : a === 'HE' ? 'NỔ MẠNH' : 'ĐẠN THƯỜNG';
        crewCall('NẠP ĐẠN', nm + ' — SẴN SÀNG!', (a === 'AP' ? 'Xuyên giáp' : a === 'HE' ? 'Nổ mạnh' : 'Đạn thường') + ', sẵn sàng!');
      } else if (T === 'ARTILLERY') crewCall('PHÁO THỦ', 'ĐÃ NẠP ĐẠN & LIỀU — PHÁO SẴN SÀNG!', 'Pháo sẵn sàng!');
      else if (T === 'GATLING') crewCall('PHÁO THỦ', 'ĐÃ THAY BĂNG — SẴN SÀNG!', 'Đã thay băng, sẵn sàng!');
      else if (T === 'SCOUT') crewCall('XẠ THỦ', 'ĐÃ THAY HỘP ĐẠN — SẴN SÀNG!', 'Đã thay hộp, sẵn sàng!');
    }
    if (W.at > 0 && at <= 0 && P.tankType === 'SCOUT' && (P.missileAmmoCount || 0) > 0) crewCall('XẠ THỦ', 'ĐÃ NẠP ỐNG PHÓNG — TÊN LỬA SẴN SÀNG!', 'Tên lửa sẵn sàng!');
    W.rl = rl; W.at = at;
  }

  // ---------- gắn vào vòng lặp game ----------
  if (typeof ArtilleryGame3D !== 'undefined' && ArtilleryGame3D.prototype && !ArtilleryGame3D.prototype.update.__rfx) {
    const orig = ArtilleryGame3D.prototype.update;
    ArtilleryGame3D.prototype.update = function (dt) {
      const r = orig.apply(this, arguments);
      try {
        update(dt, this.terrain, this.units);
        watchPlayer(this, dt);
      } catch (e) { if (!this._rfxErr) { this._rfxErr = true; console.error('[ReloadFX]', e); } }
      return r;
    };
    ArtilleryGame3D.prototype.update.__rfx = true;
  }

  return { toss, puff, update, crewCall };
})();

if (typeof window !== 'undefined') window.ReloadFX = ReloadFX;
