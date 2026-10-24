/**
 * BỘ QUAY VIDEO FLYCAM 360 TRINH SÁT CỨ ĐIỂM CHIẾN THUẬT (recon_recorder.js)
 * 
 * - Mở tự động qua: index.html?lab=recon_record&map=URBAN|DESERT|JUNGLE|HIGHLAND|RIVER_LAKE
 * - Quay 360 độ quanh cứ điểm chiến lược
 * - Sử dụng MediaRecorder xuất tệp WebM lưu vào assets/recon_<map>.webm
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('lab') !== 'recon_record') return;

  // Bật chế độ thử nghiệm phòng lab để bỏ qua mạng và intro mặc định
  window.FREECAM_LAB = true;
  window.RECON_RECORDER_ACTIVE = true;
  window.__RECON_RECORD_DONE__ = false;
  try { window.NetTransport = undefined; } catch (e) { }

  const MAP_LIST = ['URBAN', 'DESERT', 'JUNGLE', 'HIGHLAND', 'RIVER_LAKE'];
  let BIOME = (q.get('map') || 'URBAN').toUpperCase();
  if (!MAP_LIST.includes(BIOME)) BIOME = 'URBAN';

  const SEED = (parseInt(q.get('seed'), 10) || 20261024) >>> 0;
  const RECORD_DUR = Math.max(5, parseFloat(q.get('dur') || 8.0));
  const FPS = 30;
  const IS_AUTO = q.get('auto') === '1';
  const RECORD_ALL = q.get('all') === '1';

  let uiPanel = null;
  let statusText = null;
  let progressBar = null;

  function createOverlay() {
    const box = document.createElement('div');
    box.id = 'recon-recorder-ui';
    box.style.cssText = `
      position: fixed; top: 16px; left: 16px; z-index: 9999999;
      background: rgba(11, 17, 24, 0.94); border: 1px solid rgba(56, 189, 248, 0.5);
      padding: 12px 18px; border-radius: 4px; font-family: Chakra Petch, monospace, sans-serif;
      color: #cfe3f5; min-width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.7);
    `;
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; color:#38bdf8; font-size:13px; letter-spacing:1px;">DRONE FLYCAM 360 RECORDER</span>
        <span style="font-size:11px; color:#94a3b8; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:2px;">${BIOME}</span>
      </div>
      <div id="rr-status" style="font-size:12px; color:#e2e8f0; margin-bottom:8px;">Đang khởi tạo chiến trường...</div>
      <div style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden;">
        <div id="rr-progress" style="width:0%; height:100%; background:#38bdf8; transition:width 0.1s linear;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:11px; color:#64748b;">
        <span>Chu kỳ 360°: ${RECORD_DUR.toFixed(1)}s</span>
        <span id="rr-time">0.0s</span>
      </div>
    `;
    document.body.appendChild(box);
    uiPanel = box;
    statusText = document.getElementById('rr-status');
    progressBar = document.getElementById('rr-progress');
  }

  function setStatus(text, progress = null) {
    if (statusText) statusText.textContent = text;
    if (progress !== null && progressBar) {
      progressBar.style.width = Math.min(100, Math.max(0, progress * 100)) + '%';
    }
  }

  function boot() {
    createOverlay();
    const g = window.game;
    if (!g || !g.terrain || !g.matchmaking || !g.renderer) {
      setTimeout(boot, 60);
      return;
    }

    setStatus('Đang tải cấu hình bản đồ ' + BIOME + '...');
    const mm = g.matchmaking;
    mm.selectedMapType = BIOME;
    mm.mapSeed = SEED;
    mm.state = 'IN_GAME';
    mm.preparedMapKey = BIOME + ':' + SEED;
    clearInterval(mm.searchInterval);

    setTimeout(() => setup(g), 50);
  }

  function setup(g) {
    setStatus('Đang dựng địa hình & cứ điểm...');
    g.prepareMap(BIOME, SEED);

    const ov = document.getElementById('matchmaking-overlay');
    if (ov) ov.classList.add('hidden');

    g.matchmaking.selectedTankType = 'SCOUT';
    g.startMatchWithSlots([{
      id: 0, team: 'BLUE', title: 'RECORDER', name: 'RECORDER',
      isHuman: true, isMe: true, peerId: 'rec-me', tankType: 'SCOUT', ready: true
    }], 'rec-me');

    // Tắt hoàn toàn intro và âm thanh
    g._intro = null;
    document.body.classList.remove('intro-active');
    const introHud = document.getElementById('tactical-intro-hud');
    if (introHud) introHud.classList.add('hidden');
    const hud = document.getElementById('hud-overlay');
    if (hud) hud.style.display = 'none';

    try {
      if (window.soundEngine) {
        window.soundEngine.muted = true;
        if (window.soundEngine.masterGain) window.soundEngine.masterGain.gain.value = 0;
      }
    } catch (e) { }

    if (g.player && g.player.group) g.player.group.visible = false;

    // Vô hiệu hoá ngắm bắn
    function hideAim() {
      if (g.player && g.player.group) g.player.group.visible = false;
      if (g.reticle3D) g.reticle3D.visible = false;
      if (g.lockReticle3D) g.lockReticle3D.visible = false;
      if (g.spreadRing) g.spreadRing.visible = false;
      if (g._blastZone) g._blastZone.visible = false;
      if (g.trajectoryLine) g.trajectoryLine.visible = false;
      if (g._aimAnchor) g._aimAnchor.visible = false;
      if (g._driveMarker) g._driveMarker.visible = false;
    }

    // Tâm xoay: Cứ điểm B hoặc Landmark trung tâm
    const cps = g.capturePoints || [];
    const cpB = cps.find(p => p.id === 'B') || { x: 0, z: 0 };
    const landmark = g.terrain && g.terrain.map && (g.terrain.map.landmarks || [])[0];
    const center = landmark || cpB;
    const elev = g.terrain ? g.terrain.getElevationAt(center.x, center.z) : 0;

    const R = 520;
    const H = 260;
    const lookTarget = new THREE.Vector3(center.x, elev + 20, center.z);

    let recorder = null;
    let chunks = [];
    let state = 'WARMUP';
    let timer = 0;
    const WARMUP_TIME = 1.0;

    function applyCam(rotT) {
      const angle = rotT * Math.PI * 2 - Math.PI * 0.5;
      const camX = center.x + Math.cos(angle) * R;
      const camZ = center.z + Math.sin(angle) * R;
      const camY = elev + H + Math.sin(angle * 2) * 20;

      g.camera.position.set(camX, camY, camZ);
      g.camera.lookAt(lookTarget);
    }

    const origUpdate = g.update;
    g.update = function (dt) {
      dt = Math.min(dt || 0.016, 0.05);

      let rotT = 0;
      if (state === 'RECORDING') {
        rotT = timer / RECORD_DUR;
      }

      applyCam(rotT);

      if (state === 'WARMUP') {
        timer += dt;
        setStatus('Đang làm nóng khung cảnh...', timer / WARMUP_TIME);
        if (timer >= WARMUP_TIME) {
          timer = 0;
          state = 'RECORDING';
          startMediaRecorder();
        }
      } else if (state === 'RECORDING') {
        timer += dt;
        const timeEl = document.getElementById('rr-time');
        if (timeEl) timeEl.textContent = timer.toFixed(1) + 's / ' + RECORD_DUR.toFixed(1) + 's';
        setStatus('Đang ghi Flycam 360° cứ điểm...', timer / RECORD_DUR);

        if (timer >= RECORD_DUR) {
          state = 'FINISHED';
          stopMediaRecorder();
        }
      }

      origUpdate.call(this, dt);
      hideAim();
    };

    const origRender = g.render;
    g.render = function () {
      let rotT = 0;
      if (state === 'RECORDING') rotT = timer / RECORD_DUR;
      applyCam(rotT);
      hideAim();
      origRender.call(this);
    };

    function startMediaRecorder() {
      const canvas = g.renderer.domElement;
      const stream = canvas.captureStream(FPS);

      let mime = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
        mime = 'video/webm; codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
        mime = 'video/webm; codecs=vp8';
      }

      chunks = [];
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 });
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        finishAndSaveVideo();
      };

      recorder.start(100);
    }

    function stopMediaRecorder() {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    }

    function finishAndSaveVideo() {
      setStatus('Đang lưu tệp video...', 1.0);
      const blob = new Blob(chunks, { type: 'video/webm' });
      const fileName = 'recon_' + BIOME.toLowerCase() + '.webm';

      fetch('/api/save-video', {
        method: 'POST',
        headers: {
          'x-file-name': fileName,
          'Content-Type': 'application/octet-stream'
        },
        body: blob
      }).then(res => res.json())
        .then(() => {
          setStatus('✓ ĐÃ XUẤT VIDEO: ' + fileName + ' (' + (blob.size / 1024 / 1024).toFixed(2) + ' MB)', 1.0);
          window.__RECON_RECORD_DONE__ = true;

          // Tạo thêm bản sao mặc định recon_briefing.webm
          if (BIOME === 'URBAN') {
            fetch('/api/save-video', {
              method: 'POST',
              headers: { 'x-file-name': 'recon_briefing.webm' },
              body: blob
            });
          }

          if (RECORD_ALL) {
            handleNextMap();
          } else if (IS_AUTO) {
            setTimeout(() => { if (window.close) window.close(); }, 1200);
          }
        }).catch(err => {
          console.error('[RECORDER] Lỗi lưu:', err);
          setStatus('Lỗi lưu: ' + err.message);
        });
    }

    function handleNextMap() {
      const curIdx = MAP_LIST.indexOf(BIOME);
      if (curIdx >= 0 && curIdx < MAP_LIST.length - 1) {
        const nextBiome = MAP_LIST[curIdx + 1];
        setStatus('Bản đồ kế tiếp: ' + nextBiome + '...', 1.0);
        setTimeout(() => {
          location.search = '?lab=recon_record&map=' + nextBiome + '&all=1&auto=1';
        }, 1000);
      } else {
        setStatus('✓ ĐÃ HOÀN TẤT TOÀN BỘ 5 BẢN ĐỒ!', 1.0);
        window.__ALL_RECON_RECORD_DONE__ = true;
      }
    }
  }

  boot();
})();
