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
        const r = S.T[label] || (S.T[label] = { ms: 0, n: 0 });
        r.ms += now() - t0; r.n++;
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

  function show() {
    const g = window.game;
    if (!g || !S.el) return;
    const i = g.renderer.info;
    const st = sceneStats(g);
    const fr = S.frameMs.slice().sort((a, b) => a - b);
    const p50 = fr.length ? fr[Math.floor(fr.length * 0.5)] : 0, p95 = fr.length ? fr[Math.floor(fr.length * 0.95)] : 0;
    const n = Math.max(1, S.frames);
    const rows = Object.entries(S.T).sort((a, b) => b[1].ms - a[1].ms)
      .map(([k, v]) => `${k.padEnd(34)} ${(v.ms / n).toFixed(2).padStart(6)} ms/khung`);
    S.el.textContent =
      `HIỆU NĂNG (F9 tắt)\n` +
      `FPS ${S.fps.toFixed(0)}   khung p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms\n` +
      `Lượt vẽ ${i.render.calls}   Tam giác ${(i.render.triangles / 1000).toFixed(0)}k   Shader ${(i.programs || []).length}\n` +
      `Hình học ${i.memory.geometries}   Texture ${i.memory.textures}   Đèn ${st.lights}\n` +
      `Vật thể hiện ${st.obj} · mesh ${st.meshes} · đổ bóng ${st.casters} · trong suốt ${st.transp}\n` +
      `Đạn bay ${g.ballistics ? g.ballistics.activeShells.length : 0}   Xe ${g.units ? g.units.length : 0}   DPR ${g.renderer.getPixelRatio().toFixed(2)}\n` +
      `--- thời gian CPU trung bình mỗi khung ---\n` + rows.join('\n');
    for (const k in S.T) { S.T[k].ms = 0; S.T[k].n = 0; }
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

  window.addEventListener('keydown', e => { if (e.code === 'F9') { e.preventDefault(); toggle(); } });
  if (new URLSearchParams(location.search).get('perf') === '1') {
    const wait = () => { if (window.game && window.game.renderer) toggle(true); else setTimeout(wait, 300); };
    wait();
  }
  window.perfOverlay = { toggle };
})();
