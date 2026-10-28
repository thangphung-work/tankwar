/**
 * XEM BẢN ĐỒ BẰNG CAMERA BAY TỰ DO (index.html?lab=freecam)
 *
 * - Dựng bản đồ thật như trong trận, không có xe / HUD; camera bay tự do để ngắm toàn cảnh từ trên cao
 * - Nhấp trái: bay tới chỗ đó · kéo chuột trái / giữ chuột phải: xoay hướng nhìn · WASD bay · Q/E xuống/lên · Shift bay nhanh ·
 *   cuộn: zoom vào/ra · Alt+cuộn: đổi tốc độ
 * - Xe người chơi vẫn tồn tại (engine cần) nhưng ẩn và luôn đi theo camera để vùng cỏ / chi tiết bám đúng chỗ đang xem
 *
 * Tham số URL: map=HIGHLAND|RIVER_LAKE|JUNGLE|DESERT|URBAN, seed=<số>
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('lab') !== 'freecam') return;
  window.FREECAM_LAB = true;
  try { window.NetTransport = undefined; } catch (e) { /* bỏ qua */ }

  const MAPS = [['HIGHLAND', 'Đồng cỏ'], ['RIVER_LAKE', 'Sông hồ'], ['JUNGLE', 'Rừng'], ['DESERT', 'Sa mạc'], ['URBAN', 'Đô thị']];
  let BIOME = (q.get('map') || 'HIGHLAND').toUpperCase();
  if (!MAPS.some(m => m[0] === BIOME)) BIOME = 'HIGHLAND';
  const SEED = (parseInt(q.get('seed'), 10) || 20261022) >>> 0;

  const cam = { x: 0, y: 600, z: 900, yaw: 0, pitch: -0.6, speed: 400, keys: {}, locked: false, goal: null };
  let g = null, speedEl = null, posEl = null;
  // Không dựng bản đồ đồng bộ ngay trong constructor game (chặn luồng chính, màn chờ đứng im) — như ?lab=range
  window.BOOT_MAP = null;

  // MÀN CHỜ: index.html phủ sẵn #range-lab-loading ngay đầu trang (dùng chung với phòng thử đạn). Trước đây không có màn
  // chờ, và vào trận ngay khi chi tiết bản đồ chưa dựng xong -> startMatchWithSlots dựng nốt đồng bộ: trang đứng hình
  // hàng chục giây (trình duyệt báo "không phản hồi")
  const loader = {
    stage(t) { const el = document.getElementById('range-lab-stage'); if (el) el.textContent = t; },
    done() {
      const el = document.getElementById('range-lab-loading');
      if (el) requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }));
    }
  };

  function boot() {
    g = window.game;
    if (!g || !g.terrain || !g.matchmaking) { setTimeout(boot, 60); return; }
    const mm = g.matchmaking;
    mm.selectedMapType = BIOME; mm.mapSeed = SEED; mm.state = 'IN_GAME';
    mm.preparedMapKey = BIOME + ':' + SEED;
    clearInterval(mm.searchInterval);
    loader.stage('ĐANG SINH ĐỊA HÌNH NỀN…');
    // dữ liệu bản đồ sinh trong Worker (giao diện không treo); không hỗ trợ Worker thì prepareMap tự làm đồng bộ
    const prep = window.MapGen && MapGen.prefetch ? MapGen.prefetch(BIOME, SEED) : Promise.resolve(false);
    prep.catch(() => false).then(() => {
      loader.stage('ĐANG DỰNG CẢNH 3D…');
      requestAnimationFrame(() => setTimeout(build, 20));
    });
  }

  // dựng lưới bản đồ, rồi chờ phần chi tiết (cây, nhà, đồ vật) dựng xong dưới nền từng bước nhỏ mới vào trận
  function build() {
    try { g.prepareMap(BIOME, SEED); } catch (err) { console.error('[FREECAM]', err); loader.stage('LỖI: ' + (err && err.message || err)); return; }
    const T = g.terrain;
    const wait = () => {
      if (T && !T.detailsReady && g.terrain === T) {
        const left = T._pendingDetailSteps ? T._pendingDetailSteps.length : 0;
        loader.stage('ĐANG DỰNG CẢNH 3D…' + (left ? ' (' + left + ')' : ''));
        setTimeout(wait, 24);
        return;
      }
      try { start(); } catch (err) { console.error('[FREECAM]', err); loader.stage('LỖI: ' + (err && err.message || err)); return; }
      loader.done();
    };
    wait();
  }

  function start() {
    const ov = document.getElementById('matchmaking-overlay');
    if (ov) ov.classList.add('hidden');
    g.matchmaking.selectedTankType = 'SCOUT';
    g.startMatchWithSlots([{ id: 0, team: 'BLUE', title: 'FREE CAM', name: 'FREE CAM', isHuman: true, isMe: true, peerId: 'cam-me', tankType: 'SCOUT', ready: true }], 'cam-me');
    g._intro = null;
    const introHud = document.getElementById('tactical-intro-hud');
    if (introHud) introHud.classList.add('hidden');
    document.body.classList.remove('intro-active');
    // không có luật trận
    g.matchDuration = 1e9;
    g.airdropTimer = 1e9;
    if (g.supplyManager) g.supplyManager.airdropTimer = 1e9;
    const P = g.player;
    if (P) {
      P.takeDamage = function () { return { blocked: false, killed: false, prevHp: this.hp, currentHp: this.hp }; };
      if (P.group) P.group.visible = false;
      cam.x = P.x; cam.z = P.z + 500;
      cam.y = g.terrain.getElevationAt(cam.x, cam.z) + 400;
      cam.yaw = 0;
    }
    const hud = document.getElementById('hud-overlay');
    if (hud) hud.style.display = 'none';
    function hideAim() {
      if (g.reticle3D) g.reticle3D.visible = false;
      if (g.lockReticle3D) g.lockReticle3D.visible = false;
      if (g.spreadRing) g.spreadRing.visible = false;
      if (g._blastZone) g._blastZone.visible = false;
      if (g.trajectoryLine) g.trajectoryLine.visible = false;
      if (g._aimAnchor) g._aimAnchor.visible = false;
      if (g._driveMarker) g._driveMarker.visible = false;
    }
    const origUpdate = g.update;
    g.update = function (dt) {
      const mapOpen = !!(g.tacticalMap && g.tacticalMap.isOpen);
      const pEl = document.getElementById('fc-panel');
      if (pEl) pEl.style.display = mapOpen ? 'none' : '';
      if (!mapOpen) fly(dt);
      origUpdate.call(this, dt);
      followPlayer();
      hideAim();
    };
    const origRender = g.render;
    g.render = function () { applyCam(); hideAim(); origRender.call(this); };
    g.camera.far = Math.max(g.camera.far, 20000);
    g.camera.updateProjectionMatrix();
    buildUI();
    bindInput();
    window.freeCam = cam;   // gỡ lỗi / chụp ảnh: đặt x, y, z, yaw, pitch trực tiếp
  }

  function fly(dt) {
    dt = Math.min(dt || 0.016, 0.1);
    const k = cam.keys, v = cam.speed * (k.ShiftLeft || k.ShiftRight ? 4 : 1) * dt;
    const fx = -Math.sin(cam.yaw) * Math.cos(cam.pitch), fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let f = 0, r = 0, u = 0;
    if (k.KeyW) f++; if (k.KeyS) f--;
    if (k.KeyD) r++; if (k.KeyA) r--;
    if (k.KeyE) u++; if (k.KeyQ) u--;
    if (f || r || u) cam.goal = null;
    if (cam.goal) {   // bay tới điểm vừa nhấp: chậm dần khi gần đến
      const G = cam.goal, a = 1 - Math.exp(-dt * 3);
      cam.x += (G.x - cam.x) * a; cam.y += (G.y - cam.y) * a; cam.z += (G.z - cam.z) * a;
      if (Math.hypot(G.x - cam.x, G.y - cam.y, G.z - cam.z) < 1) cam.goal = null;
    }
    cam.x += (fx * f + rx * r) * v;
    cam.y += (fy * f + u) * v;
    cam.z += (fz * f + rz * r) * v;
    const half = g.terrain.width ? g.terrain.width / 2 + 2000 : 1e9;
    cam.x = Math.max(-half, Math.min(half, cam.x));
    cam.z = Math.max(-half, Math.min(half, cam.z));
    const ground = g.terrain.getElevationAt(cam.x, cam.z);
    cam.y = Math.max(ground + 3, Math.min(6000, cam.y));
  }

  // xe ẩn đi theo dưới camera: cỏ / chunk chi tiết / che khuất tính quanh xe người chơi
  function followPlayer() {
    const P = g.player;
    if (!P || !P.group) return;
    const T = g.terrain, half = T.width ? T.width / 2 - 50 : 1e9;
    const x = Math.max(-half, Math.min(half, cam.x)), z = Math.max(-half, Math.min(half, cam.z));
    P.x = x; P.z = z; P.speed = 0;
    P.y = T.getElevationAt(x, z);
    P.group.position.set(x, P.y, z);
    P.group.visible = false;
  }

  function applyCam() {
    const c = g.camera;
    c.position.set(cam.x, cam.y, cam.z);
    c.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
    c.updateMatrixWorld();
    if (g) g._camYaw = cam.yaw;
    if (g && g.player) g.player.azimuth = -cam.yaw * 180 / Math.PI;
    if (posEl) posEl.textContent = `X ${Math.round(cam.x)} · Z ${Math.round(cam.z)} · CAO ${Math.round(cam.y - g.terrain.getElevationAt(cam.x, cam.z))} M`;
  }

  // Dịch chuyển tức thời tới tọa độ thế giới (wx, wz) từ bản đồ tác chiến
  function teleport(wx, wz) {
    if (!g || !g.terrain) return;
    const T = g.terrain;
    const half = T.width ? T.width / 2 - 50 : 1e9;
    wx = Math.max(-half, Math.min(half, wx));
    wz = Math.max(-half, Math.min(half, wz));
    const ground = T.getElevationAt(wx, wz);
    const prevGround = T.getElevationAt(cam.x, cam.z);
    const curRel = isFinite(cam.y) ? (cam.y - prevGround) : 350;
    const wantedRel = Math.max(150, Math.min(1200, curRel));
    cam.x = wx;
    cam.z = wz;
    cam.y = ground + wantedRel;
    cam.goal = null;
    followPlayer();
    applyCam();
  }
  window.freeCamTeleport = teleport;

  // tia từ con trỏ chạm mặt đất (dò bước rồi chia đôi) -> đích bay: lùi lại dọc tia, cao hơn điểm chạm
  function flyTo(sx, sy) {
    const c = g.camera, T = g.terrain;
    const v = new THREE.Vector3((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    const o = c.position;
    let prev = 0, hit = -1;
    for (let t = 5; t < 20000; t *= 1.03, t += 2) {
      if (o.y + v.y * t <= T.getElevationAt(o.x + v.x * t, o.z + v.z * t)) { hit = t; break; }
      prev = t;
    }
    if (hit < 0) return;
    for (let i = 0; i < 20; i++) {
      const m = (prev + hit) / 2;
      if (o.y + v.y * m <= T.getElevationAt(o.x + v.x * m, o.z + v.z * m)) hit = m; else prev = m;
    }
    const px = o.x + v.x * hit, pz = o.z + v.z * hit, py = T.getElevationAt(px, pz);
    const back = Math.min(hit * 0.5, 160);
    cam.goal = { x: px - v.x * back, y: Math.max(py + 60, o.y + v.y * (hit - back)), z: pz - v.z * back };
  }

  function bindInput() {
    const canvas = g.renderer.domElement;
    const isUIEvent = e => {
      if (!e.target || !e.target.closest) return false;
      if (e.target.closest('#fc-panel')) return true;
      if (g && g.tacticalMap && g.tacticalMap.isOpen && e.target.closest('#tactical-map-modal')) return true;
      return false;
    };

    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;

      // Phím M: bật / tắt bản đồ
      if (e.code === 'KeyM' && !e.repeat) {
        if (g && g.tacticalMap) {
          e.stopImmediatePropagation();
          e.preventDefault();
          cam.keys = {};
          g.tacticalMap.toggle();
          return;
        }
      }

      // Phím Escape: đóng bản đồ nếu đang mở
      if (e.key === 'Escape' && g && g.tacticalMap && g.tacticalMap.isOpen) {
        e.stopImmediatePropagation();
        e.preventDefault();
        g.tacticalMap.toggle(false);
        return;
      }

      // Khi bản đồ tác chiến đang mở: nhường phím cho bản đồ, dừng phím bay camera
      if (g && g.tacticalMap && g.tacticalMap.isOpen) {
        cam.keys = {};
        return;
      }

      if (isUIEvent(e)) return;
      cam.keys[e.code] = true;
      e.stopImmediatePropagation();
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    }, true);

    window.addEventListener('keyup', e => {
      cam.keys[e.code] = false;
      if (!isUIEvent(e)) e.stopImmediatePropagation();
    }, true);

    window.addEventListener('blur', () => { cam.keys = {}; });

    const swallow = e => {
      if (isUIEvent(e)) return;
      e.stopImmediatePropagation();
      if (e.type === 'contextmenu') e.preventDefault();
    };
    ['click', 'contextmenu', 'pointerdown', 'pointerup'].forEach(t => window.addEventListener(t, swallow, true));

    // kéo chuột trái hoặc giữ chuột phải: xoay hướng nhìn · nhấp chuột trái (không kéo): bay tới chỗ đó
    let drag = null;
    window.addEventListener('mousedown', e => {
      if (isUIEvent(e)) return;
      e.stopImmediatePropagation();
      if (e.button === 2) { cam.looking = true; if (canvas.requestPointerLock) canvas.requestPointerLock(); }
      else if (e.button === 0) drag = { x: e.clientX, y: e.clientY, moved: false };
    }, true);

    window.addEventListener('mouseup', e => {
      if (isUIEvent(e)) return;
      e.stopImmediatePropagation();
      if (e.button === 2) { cam.looking = false; if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
      if (e.button === 0 && drag) { if (!drag.moved) flyTo(e.clientX, e.clientY); drag = null; }
    }, true);

    document.addEventListener('pointerlockchange', () => { cam.locked = document.pointerLockElement === canvas; });

    window.addEventListener('mousemove', e => {
      if (isUIEvent(e)) return;
      e.stopImmediatePropagation();
      if (drag && !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
      if (!cam.locked && !cam.looking && !(drag && drag.moved)) return;
      cam.goal = null;
      cam.yaw -= e.movementX * 0.0025;
      cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch - e.movementY * 0.0025));
    }, true);

    window.addEventListener('wheel', e => {
      if (isUIEvent(e)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.altKey) {   // Alt + cuộn: đổi tốc độ bay
        cam.speed = Math.max(5, Math.min(3000, cam.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
        if (speedEl) speedEl.textContent = Math.round(cam.speed) + ' M/S';
        return;
      }
      // cuộn: tiến / lùi theo hướng nhìn (lùi = zoom out), bước theo độ cao so với mặt đất
      const h = Math.max(10, cam.y - g.terrain.getElevationAt(cam.x, cam.z));
      const s = (e.deltaY > 0 ? -1 : 1) * Math.max(10, h * 0.2);
      cam.goal = null;
      cam.x += -Math.sin(cam.yaw) * Math.cos(cam.pitch) * s;
      cam.y += Math.sin(cam.pitch) * s;
      cam.z += -Math.cos(cam.yaw) * Math.cos(cam.pitch) * s;
    }, { capture: true, passive: false });
  }

  function buildUI() {
    const root = document.createElement('div');
    root.id = 'fc-panel';
    root.style.cssText = 'position:fixed;top:12px;left:12px;z-index:9999;background:rgba(11,15,12,.86);color:#d6e2c8;font:600 12px/1.5 system-ui,sans-serif;letter-spacing:.06em;padding:10px 12px;border-radius:8px;max-width:calc(100vw - 24px);box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    root.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">'
      + '<div style="color:#ffb700;font-weight:700">FREE CAM · BẢN ĐỒ 3D</div>'
      + '<button id="fc-toggle-map-btn" style="cursor:pointer;border:1px solid #7fe3f5;border-radius:4px;padding:3px 10px;font:inherit;font-weight:700;background:rgba(34,211,240,0.2);color:#7fe3f5;display:inline-flex;align-items:center;gap:4px;" title="Bật bản đồ để xem toàn cảnh và nhấp chuột dịch chuyển tức thời"><i class="ti ti-map" aria-hidden="true"></i> BẢN ĐỒ [M]</button>'
      + '</div>'
      + '<div id="fc-maps" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px"></div>'
      + '<div>Tốc độ: <span id="fc-speed"></span> · <span id="fc-pos"></span></div>'
      + '<div style="opacity:.8;font-weight:500;font-size:11.5px;margin-top:2px">Nhấp trái: bay tới đó · <b style="color:#7fe3f5">M: Bật bản đồ (nhấp để dịch chuyển)</b> · kéo chuột: xoay nhìn · WASD: bay · Q/E: xuống/lên · Shift: nhanh · cuộn: zoom · Alt+cuộn: đổi tốc độ</div>';
    document.body.appendChild(root);

    const mapBtn = root.querySelector('#fc-toggle-map-btn');
    if (mapBtn) {
      mapBtn.onclick = (e) => {
        e.stopPropagation();
        if (g && g.tacticalMap) g.tacticalMap.toggle();
      };
    }

    const maps = root.querySelector('#fc-maps');
    for (const [id, name] of MAPS) {
      const b = document.createElement('button');
      b.textContent = name;
      b.style.cssText = 'cursor:pointer;border:1px solid #4a5a44;border-radius:4px;padding:3px 8px;font:inherit;' + (id === BIOME ? 'background:#ffb700;color:#111' : 'background:#1b231c;color:#d6e2c8');
      b.onclick = () => { if (id === BIOME) return; const u = new URL(location.href); u.searchParams.set('map', id); location.href = u.toString(); };
      maps.appendChild(b);
    }
    speedEl = root.querySelector('#fc-speed'); posEl = root.querySelector('#fc-pos');
    speedEl.textContent = Math.round(cam.speed) + ' M/S';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
