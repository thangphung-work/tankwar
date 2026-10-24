/**
 * BẢNG ĐO HIỆU NĂNG (bật / tắt bằng phím F9, hoặc mở trang với ?perf=1)
 * Đo bằng thời gian thật của trình duyệt: FPS, thời gian mỗi khung (logic / vẽ GPU), số lượt vẽ, tam giác,
 * shader, bộ nhớ hình học, và chi tiết từng hệ thống (xe, bot, đạn, hiệu ứng nổ, tình báo, HUD...).
 * Không đo gì khi đang tắt (chi phí ~0).
 */
(function () {
  const S = { on: false, el: null, T: {}, frames: 0, fps: 0, lastT: 0, acc: 0, frameMs: [], wrapped: false };
  const now = () => performance.now();

  function wrap(obj, name, label) {
    if (!obj || typeof obj[name] !== 'function' || obj[name].__perf) return;
    const f = obj[name];
    const w = function () {
      if (!S.on) return f.apply(this, arguments);
      const t0 = now();
      try { return f.apply(this, arguments); } finally {
        const r = S.T[label] || (S.T[label] = { ms: 0, n: 0, max: 0 });
        const d = now() - t0;
        r.ms += d; r.n++; if (d > r.max) r.max = d;   // lần chạy lâu nhất: thấy được cú khựng đơn lẻ (trung bình làm chìm mất)
      }
    };
    w.__perf = true;
    obj[name] = w;
  }

  function install(g) {
    if (S.wrapped) return;
    S.wrapped = true;
    wrap(g, 'update', 'Logic (tổng)');
    wrap(g, 'render', 'Vẽ khung hình (tổng)');
    wrap(g.renderer, 'render', '  · renderer.render (GPU submit)');
    wrap(g, 'updateChaseCamera', '  - Camera + occlusion');
    wrap(g, 'updateSightCamera', '  - Sight camera');
    wrap(g, 'updateUnitLOD', '  - Unit / structure LOD');
    wrap(g, 'updateDetailLOD', '  - Scene detail LOD');
    wrap(g, 'updateShadowLOD', '  - Shadow LOD');
    if (typeof SPGUnit3D !== 'undefined') {
      wrap(SPGUnit3D.prototype, 'update', '  · Xe: update');
      wrap(SPGUnit3D.prototype, 'updateFXParticles', '    - khói / bụi xe');
      wrap(SPGUnit3D.prototype, 'updateTrackMarks', '    - vệt xích');
      wrap(SPGUnit3D.prototype, 'updateStealthVisual', '    - ngụy trang');
    }
    if (typeof BotAIController !== 'undefined') wrap(BotAIController.prototype, 'update', '  · Bot AI');
    if (g.ballistics) {
      wrap(g.ballistics, 'updateShells3D', '  · Đạn bay + va chạm');
      wrap(g.ballistics, 'solveAimingForTarget', '    - giải đường ngắm');
      wrap(g.ballistics, 'calculateTrajectoryPoints', '    - vạch đường đạn');
    }
    const fx = g.effectsManager && g.effectsManager.fx;
    if (fx) wrap(fx, 'update', '  · Hiệu ứng nổ / khói');
    if (g.effectsManager) wrap(g.effectsManager, 'update', '  · EffectsManager');
    if (typeof TeamIntel !== 'undefined') wrap(TeamIntel, 'update', '  · Tình báo / radar');
    if (typeof VehicleDamage !== 'undefined') wrap(VehicleDamage, 'update', '  · Hư hại xe');
    if (g.terrain) wrap(g.terrain, 'update', '  · Địa hình (cây cháy, nước)');
    if (g.terrain) wrap(g.terrain, 'updateBuildingView', '    - camera building cutaway');
    const T = g.terrain || {};
    if (T.buildingSet) wrap(T.buildingSet, 'update', '    - nhà: sập / cháy / dựng hình');
    if (T.trees) wrap(T.trees, 'update', '    - cây: cháy / đổ');
    if (T.envDamage) wrap(T.envDamage, 'update', '    - đá / cầu / vết đạn');
    if (T.landmarkSet) wrap(T.landmarkSet, 'update', '    - công trình đặc biệt');
    if (T.propSet) wrap(T.propSet, 'update', '    - rào / bao cát / xác xe');
    if (g.terrain) wrap(g.terrain, 'damageAt', '  · Phá hủy cảnh vật (mỗi vụ nổ)');
    wrap(g, 'handleShellImpact', '  · Xử lý trúng đạn');
    wrap(g, 'updateHUDValues', '  · HUD');
    wrap(g, 'renderAOWMinimap', '  · Bản đồ nhỏ');
    if (g.tacticalMap) wrap(g.tacticalMap, 'update', '  · Bản đồ chiến thuật');
  }

  function sceneStats(g) {
    let obj = 0, meshes = 0, lights = 0, casters = 0, transp = 0;
    g.scene.traverseVisible(o => {
      obj++;
      if (o.isLight) lights++;
      if (o.isMesh || o.isPoints || o.isSprite) {
        meshes++;
        if (o.castShadow) casters++;
        const m = o.material;
        if (m && (Array.isArray(m) ? m.some(x => x.transparent) : m.transparent)) transp++;
      }
    });
    return { obj, meshes, lights, casters, transp };
  }

  // HIỆU ỨNG & PHÁ HỦY: hạt đang sống từng lớp, mức chi tiết (vẽ đủ / bớt / bỏ mỗi giây, số hạt đã lược), đám cháy, nhà chờ
  // dựng hình. F10: tắt / bật mức chi tiết để so trước - sau ngay trong trận
  let lodPrev = null;
  function fxStats(g) {
    const fx = g.effectsManager && g.effectsManager.fx;
    if (!fx) return '';
    const n = (L, k) => (L && L[k] ? L[k].length : 0);
    const parts = `khói ${n(fx.smoke, 'parts')} · lửa ${n(fx.fire, 'parts')} · màn khói ${n(fx.screen, 'parts')} · đá vụn ${n(fx.rocks, 'rocks') + n(fx.hardRocks, 'rocks')} · kính ${n(fx.glass, 'parts')} · vệt mảnh ${n(fx.streaks, 'items')}`;
    let lod = '';
    if (fx.lodStats) {
      const st = fx.lodStats(), p = lodPrev || st;
      lod = `Chi tiết ${fx.lodOff ? 'TẮT (vẽ đủ mọi nơi)' : 'BẬT'} — hiệu ứng/s: đủ ${st.full - p.full} · bớt ${st.part - p.part} · bỏ ${st.skip - p.skip} · hạt đã lược ${st.drop - p.drop}\n`;
      lodPrev = { full: st.full, part: st.part, skip: st.skip, drop: st.drop };
    }
    const B = g.terrain && g.terrain.buildingSet, tr = g.terrain && g.terrain.trees;
    const fires = B && B.fires ? B.fires.length : 0, pend = B && B.items ? B.items.filter(b => b.dmgPending).length : 0;
    return `--- hiệu ứng & phá hủy (F10 bật/tắt chi tiết) ---\n` + `Hạt: ${parts}\n` + lod +
      `Lửa âm ỉ ${fx.emitters ? fx.emitters.length : 0} · nhà cháy ${fires} · cây cháy ${tr && tr.burning ? tr.burning.length : 0} · nhà chờ dựng hình ${pend}\n`;
  }

  // ÂM THANH: tiếng chiến trường đã phát / bị bỏ vì dưới ngưỡng ngân sách / bị che khuất (mỗi giây)
  let audPrev = null;
  function audioStats() {
    const SE = window.soundEngine, st = SE && SE.audioStats;
    if (!st) return '';
    const p = audPrev || st;
    audPrev = { made: st.made, culled: st.culled, occl: st.occl };
    return `Âm thanh/s: phát ${st.made - p.made} · bỏ (nhỏ, dồn dập) ${st.culled - p.culled} · bị che ${st.occl - p.occl}
`;
  }

  // MẠNG (trận nhiều người): ping, lưu lượng / giây (chênh từ lần hiện trước, ~1 s), trễ hiển thị xe người khác
  // (bộ đệm nội suy thích ứng theo độ giật gói), số xe đang nội suy / đoán tiếp vị trí (gói trễ) / đứng chờ (mất gói lâu)
  const N = { last: null, at: 0 };
  function netStats() {
    const net = window.netTransport, sync = window.netSync;
    if (!net || !net.isOnline) return '';
    const st = net.stats || {}, t = now();
    let rate = '';
    if (N.last && t > N.at) {
      const k = 1000 / (t - N.at);
      rate = `vào ${((st.recv - N.last.recv) * k).toFixed(0)} gói · ${((st.bytesIn - N.last.bytesIn) * k / 1024).toFixed(1)} KB/s   ` +
        `ra ${((st.sent - N.last.sent) * k).toFixed(0)} gói · ${((st.bytesOut - N.last.bytesOut) * k / 1024).toFixed(1)} KB/s`;
    }
    N.last = { recv: st.recv || 0, sent: st.sent || 0, bytesIn: st.bytesIn || 0, bytesOut: st.bytesOut || 0 }; N.at = t;
    let bufLine = '';
    if (sync && !sync.detached && Array.isArray(sync.buffers)) {
      const m = { interp: 0, extrap: 0, hold: 0 };
      let dl = 0, dmax = 0, jit = 0, nb = 0;
      sync.buffers.forEach((b, i) => {
        const u = sync.byNetId[i];
        if (!b || !u || u.isDead || (sync.owns && sync.owns(u))) return;   // chỉ xe máy khác điều khiển
        if (m[b.mode] !== undefined) m[b.mode]++;
        dl += b.delay || 0; dmax = Math.max(dmax, b.delay || 0); jit = Math.max(jit, b.jitter || 0); nb++;
      });
      if (nb) bufLine = `Trễ hiển thị TB ${(dl / nb).toFixed(0)} ms · tối đa ${dmax.toFixed(0)} ms · giật gói ${jit.toFixed(0)} ms\n` +
        `Xe từ xa ${nb}: nội suy ${m.interp} · đoán tiếp ${m.extrap} · đứng chờ ${m.hold}\n`;
    }
    return `--- mạng (${net.mode}${net.isHost ? ', chủ phòng' : ''}) ---\n` +
      `Ping ${Math.round(net.rtt || 0)} ms   người trong phòng ${(net.peers ? net.peers.size : 0) + 1}\n` +
      (rate ? rate + '\n' : '') + bufLine;
  }

  function show() {
    const g = window.game;
    if (!g || !S.el) return;
    const i = g.renderer.info;
    const st = sceneStats(g);
    const fr = S.frameMs.slice().sort((a, b) => a - b);
    const p50 = fr.length ? fr[Math.floor(fr.length * 0.5)] : 0, p95 = fr.length ? fr[Math.floor(fr.length * 0.95)] : 0;
    const n = Math.max(1, S.frames);
    const rows = Object.entries(S.T).sort((a, b) => b[1].ms - a[1].ms)
      .map(([k, v]) => `${k.padEnd(34)} ${(v.ms / n).toFixed(2).padStart(6)} ms/khung · lâu nhất ${(v.max || 0).toFixed(1).padStart(5)} ms`);
    S.el.textContent =
      `HIỆU NĂNG (F9 tắt)\n` +
      `FPS ${S.fps.toFixed(0)}   khung p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms\n` +
      `Lượt vẽ ${i.render.calls}   Tam giác ${(i.render.triangles / 1000).toFixed(0)}k   Shader ${(i.programs || []).length}\n` +
      `Hình học ${i.memory.geometries}   Texture ${i.memory.textures}   Đèn ${st.lights}\n` +
      `Vật thể hiện ${st.obj} · mesh ${st.meshes} · đổ bóng ${st.casters} · trong suốt ${st.transp}\n` +
      `Đạn bay ${g.ballistics ? g.ballistics.activeShells.length : 0}   Xe ${g.units ? g.units.length : 0}   DPR ${g.renderer.getPixelRatio().toFixed(2)}\n` +
      (typeof GfxQuality !== 'undefined'
        ? `GPU ${GfxQuality.gpuMs === null ? (GfxQuality.timerSupported ? '...' : 'không đo được') : GfxQuality.gpuMs.toFixed(1) + ' ms'} · nhịp màn hình ${GfxQuality.refreshMs.toFixed(1)} ms · độ nét ${g.renderer.getPixelRatio().toFixed(2)} (tối đa ${GfxQuality.maxRatio.toFixed(2)})\n`
        : '') +
      (window.RaycastBVH ? (b => `Dò tia BVH: ${b.built} lưới · ${(b.tris / 1000).toFixed(0)}k tam giác · chờ dựng ${b.queued}
`)(RaycastBVH.stats()) : '') +
      netStats() + fxStats(g) + audioStats() +
      `--- thời gian CPU trung bình mỗi khung ---\n` + rows.join('\n');
    for (const k in S.T) { S.T[k].ms = 0; S.T[k].n = 0; S.T[k].max = 0; }
    S.frames = 0;
    S.frameMs.length = 0;
  }

  function tick(t) {
    if (S.on) {
      if (S.lastT) {
        const d = t - S.lastT;
        S.frameMs.push(d);
        S.acc += d;
        S.frames++;
        if (S.acc >= 1000) { S.fps = S.frames * 1000 / S.acc; S.acc = 0; show(); }
      }
      S.lastT = t;
      requestAnimationFrame(tick);
    }
  }

  function toggle(force) {
    const g = window.game;
    if (!g) return;
    S.on = force === undefined ? !S.on : force;
    if (S.on) {
      install(g);
      if (!S.el) {
        S.el = document.createElement('pre');
        S.el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9500;margin:0;padding:8px 10px;max-height:70vh;overflow:auto;' +
          'background:rgba(6,10,16,.86);color:#cfe8ff;font:11px/1.35 Consolas,monospace;border:1px solid rgba(120,200,255,.35);border-radius:6px;pointer-events:none;white-space:pre';
        document.body.appendChild(S.el);
      }
      S.el.style.display = 'block';
      S.el.textContent = 'HIỆU NĂNG: đang đo...';
      S.lastT = 0; S.acc = 0; S.frames = 0; S.T = {};
      requestAnimationFrame(tick);
    } else if (S.el) {
      S.el.style.display = 'none';
    }
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'F9') { e.preventDefault(); toggle(); }
    // F10: tắt mức chi tiết hiệu ứng (vẽ đủ mọi vụ nổ ở mọi nơi như trước) để so sánh — chỉ khi bảng đo đang mở
    if (e.code === 'F10' && S.on) {
      e.preventDefault();
      const fx = window.game && window.game.effectsManager && window.game.effectsManager.fx;
      if (fx) fx.lodOff = !fx.lodOff;
    }
  });
  if (new URLSearchParams(location.search).get('perf') === '1') {
    const wait = () => { if (window.game && window.game.renderer) toggle(true); else setTimeout(wait, 300); };
    wait();
  }
  window.perfOverlay = { toggle };
})();
