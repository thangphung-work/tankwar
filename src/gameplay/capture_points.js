/**
 * Module Quản Lý Cứ Điểm Chiến Lược 3D (Capture Points A, B, C)
 * - 3 Cứ điểm chiến thuật A (Phía Tây), B (Trung Tâm), C (Phía Đông)
 * - Cơ chế kéo cờ và chiếm giữ liên tục 60 giây để giành chiến thắng tuyệt đối
 * - Hiệu ứng đồ họa 3D Three.js: Cột cờ hợp kim, cờ tam giác động, vòng quét laser năng lượng
 */
class CapturePointsManager {
  constructor(game) {
    this.game = game;
    this.points = [];
    this.set = null;   // bản đồ cứ điểm bê tông (terrain.strongholdSet): cờ & tiến độ chiếm do StrongholdSet tính
  }

  // Khởi tạo 3 cứ điểm chiến lược
  init() {
    // Dọn dẹp đồ họa cũ
    (this.points || []).forEach(cp => { if (cp.group && cp.group.parent) cp.group.parent.remove(cp.group); });
    this.remote = false;
    const T = this.game.terrain;
    const set = T && T.strongholdSet && T.strongholdSet.items && T.strongholdSet.items.length ? T.strongholdSet : null;
    this.set = set;
    const mk = (id, x, z, extra) => Object.assign({
      id, name: `CỨ ĐIỂM ${id}`, shortName: `CỨ ĐIỂM ${id}`, x, z, radius: 85,
      owner: null,            // 'BLUE' | 'RED' | null
      capTeam: null,          // phe đang kéo cờ dở (khi chưa có chủ)
      captureProgress: 0, holdTimer: 0, holdGoal: 60, isDisputed: false, alert45Played: false
    }, extra || {});

    if (set) {
      // 3 cứ điểm bê tông trên 3 đồi: vùng chiếm = khoang + dốc ra vào (StrongholdSet.inCaptureZone), cờ thật trên nắp hầm
      const S = (typeof Strongholds !== 'undefined' && Strongholds.S) || {};
      const r = (S.HB || 96) + (S.RUN || 40) * 0.7;
      this.points = set.items.map(K => mk(K.id, K.x, K.z, { K, radius: r }));
    } else {
      this.points = [mk('A', -800, 0), mk('B', 0, 0), mk('C', 800, 0)];
      this.points.forEach(cp => {
        cp.y = T ? T.getElevationAt(cp.x, cp.z) : 0;
        this.createMesh(cp);
      });
    }
    this.updateCapturePointsUI();
    return this.points;
  }

  getPoints() {
    return this.points;
  }

  // Thông báo chiếm cứ điểm theo góc nhìn đội của người chơi trên máy này
  announce(cp, kind, team) {
    const g = this.game;
    const mine = team === (g.myTeam ? g.myTeam() : 'BLUE');
    const n = cp.shortName;
    const sfx = (name) => { if (window.soundEngine && typeof window.soundEngine[name] === 'function') window.soundEngine[name](); };
    if (kind === 'taken') {
      if (mine) { g.addCombatLog(`[[flag]] Đội bạn đã chiếm ${n} — giữ 60 giây để thắng`, 'victory'); sfx('playTargetLockAcquired'); }
      else { g.addCombatLog(`[[flag]] Địch đã chiếm ${n} — tới giành lại ngay!`, 'defeat'); sfx('playRadarAlert'); }
    } else if (kind === 'lost') {
      // team = phe vừa mất cứ điểm
      g.addCombatLog(mine ? `[[flag-off]] Đội bạn đã mất ${n}` : `[[flag-off]] Đã hạ cờ địch tại ${n}`, mine ? 'defeat' : 'system');
    } else if (kind === 'urgent') {
      const left = Math.max(1, Math.ceil(cp.holdGoal - cp.holdTimer));
      if (mine) g.addCombatLog(`[[hourglass]] Giữ ${n} thêm ${left} giây nữa là THẮNG!`, 'victory');
      else { g.addCombatLog(`[[alert-triangle]] Địch còn ${left} giây nữa là thắng nhờ giữ ${n}!`, 'defeat'); sfx('playRadarAlert'); }
    }
  }

  // Chủ phòng gửi đồng hồ giữ cờ cho các máy khác: [[id, giây giữ, chủ, tiến độ, phe kéo dở, tranh chấp]]
  netState() {
    return this.points.map(cp => [cp.id, Math.round(cp.holdTimer * 10) / 10, cp.owner || '', Math.round(cp.captureProgress), cp.capTeam || '', cp.isDisputed ? 1 : 0]);
  }
  applyNetState(list) {
    if (!Array.isArray(list)) return;
    this.remote = true;
    for (const [id, hold, owner, prog, capTeam, disp] of list) {
      const cp = this.points.find(p => p.id === id);
      if (!cp) continue;
      const own = owner || null;
      if (own !== cp.owner) {
        if (cp.owner) this.announce(cp, 'lost', cp.owner);
        if (own) this.announce(cp, 'taken', own);
        cp.alert45Played = false;
      }
      cp.owner = own;
      cp.holdTimer = Number(hold) || 0;
      cp.captureProgress = Number(prog) || 0;
      cp.capTeam = capTeam || null;
      cp.isDisputed = !!disp;
    }
  }

  createMesh(cp) {
    const group = new THREE.Group();
    group.position.set(cp.x, cp.y, cp.z);

    // 1. Vòng tròn ranh giới chiếm cứ điểm trên mặt đất (Bán kính 85 mét)
    const ringGeo = new THREE.RingGeometry(cp.radius - 2.5, cp.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.4;
    group.add(ringMesh);
    cp.ringMat = ringMat;

    // 2. Vùng phát sáng mờ bên trong cứ điểm
    const zoneAreaGeo = new THREE.CircleGeometry(cp.radius - 2.6, 48);
    zoneAreaGeo.rotateX(-Math.PI / 2);
    const zoneAreaMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide
    });
    const zoneAreaMesh = new THREE.Mesh(zoneAreaGeo, zoneAreaMat);
    zoneAreaMesh.position.y = 0.2;
    group.add(zoneAreaMesh);
    cp.zoneAreaMat = zoneAreaMat;

    // 3. Bệ bê tông cứ điểm trung tâm
    const baseGeo = new THREE.CylinderGeometry(8, 10, 2.5, 16);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.8,
      metalness: 0.2
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 1.25;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 4. Cột cờ trung tâm vươn cao 22 mét
    const poleGeo = new THREE.CylinderGeometry(0.4, 0.6, 22, 12);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.8,
      roughness: 0.3
    });
    const poleMesh = new THREE.Mesh(poleGeo, poleMat);
    poleMesh.position.y = 12.25;
    poleMesh.castShadow = true;
    group.add(poleMesh);

    // 5. Quả cầu đỉnh cột cờ
    const orbGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.1
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.position.y = 23.5;
    group.add(orbMesh);

    // 6. Lá cờ hiệu cứ điểm tung bay (Hiển thị màu phe)
    const flagGeo = new THREE.PlaneGeometry(9, 5);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      side: THREE.DoubleSide,
      roughness: 0.6
    });
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.position.set(4.8, 19.5, 0);
    flagMesh.castShadow = true;
    group.add(flagMesh);
    cp.flagMesh = flagMesh;
    cp.flagMat = flagMat;

    // 7. Khối ký hiệu chữ cái A, B, C xoay nhẹ trên không
    const markerGeo = new THREE.BoxGeometry(3.5, 3.5, 3.5);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x64748b,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.3
    });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);
    markerMesh.position.y = 26.5;
    group.add(markerMesh);
    cp.markerMesh = markerMesh;

    this.game.scene.add(group);
    cp.group = group;
  }

  updateCapturePoints(dt, units = this.game.units) {
    if (!this.points || this.points.length === 0 || this.game.isGameOver) return;
    const activeUnits = Array.isArray(units) ? units : [];
    const captureRate = 14.0; // Tốc độ chiếm (% mỗi giây với 1 xe) — bản đồ cũ
    // Chơi mạng: máy khách hiển thị theo chủ phòng (applyNetState), không tự quyết đổi chủ / thắng
    const ns = this.game.netSync;
    const follower = !!(ns && !ns.detached && ns.net && !ns.net.isHost);

    this.points.forEach(cp => {
      const prevOwner = cp.owner;
      if (cp.K) {
        // Cứ điểm bê tông: tiến độ cờ & chủ do StrongholdSet tính (khoang + dốc, có đồng bộ mạng)
        const K = cp.K;
        cp.isDisputed = !!K.contested;
        cp.captureProgress = Math.abs(K.capture || 0);
        cp.capTeam = (K.capture || 0) > 0.5 ? 'BLUE' : (K.capture || 0) < -0.5 ? 'RED' : null;
        if (!follower) {
          cp.owner = K.owner || null;
          const enemyIn = cp.owner === 'BLUE' ? K.redIn : cp.owner === 'RED' ? K.blueIn : 0;
          const ownIn = cp.owner === 'BLUE' ? K.blueIn : cp.owner === 'RED' ? K.redIn : 0;
          if (!cp.owner) cp.holdTimer = 0;
          else if (enemyIn && !ownIn) { cp.holdTimer = 0; cp.alert45Played = false; }   // địch đang hạ cờ
          else if (!cp.isDisputed) cp.holdTimer += dt;                                     // tranh chấp: đóng băng
        } else if (cp.owner && !cp.isDisputed) cp.holdTimer += dt;                       // nội suy giữa 2 gói của chủ phòng
      } else {
        // Bản đồ cũ: vòng tròn bán kính 85
        let blueIn = 0, redIn = 0;
        for (const u of activeUnits) {
          if (!u || u.isDead) continue;
          if (Math.hypot(u.x - cp.x, u.z - cp.z) > cp.radius) continue;
          if (u.team === 'BLUE') blueIn++; else if (u.team === 'RED') redIn++;
        }
        if (follower) {
          if (cp.owner && !cp.isDisputed) cp.holdTimer += dt;
        } else if (blueIn && redIn) {
          cp.isDisputed = true;   // tranh chấp: đóng băng tiến trình và thời gian giữ
        } else if (blueIn || redIn) {
          cp.isDisputed = false;
          const team = blueIn ? 'BLUE' : 'RED', n = blueIn || redIn;
          const speed = captureRate * (1 + 0.4 * (n - 1));
          if (cp.owner === team) { cp.captureProgress = 100; cp.holdTimer += dt; }
          else if (cp.owner) {
            // hạ cờ đối phương
            cp.captureProgress -= speed * dt; cp.holdTimer = 0; cp.alert45Played = false;
            if (cp.captureProgress <= 0) { cp.owner = null; cp.captureProgress = 0; cp.capTeam = null; }
          } else {
            if (cp.capTeam && cp.capTeam !== team) { cp.captureProgress -= speed * dt; if (cp.captureProgress <= 0) { cp.captureProgress = 0; cp.capTeam = team; } }
            else { cp.capTeam = team; cp.captureProgress += speed * dt; }
            if (cp.captureProgress >= 100) { cp.captureProgress = 100; cp.owner = team; cp.holdTimer = 0; cp.alert45Played = false; }
          }
        } else {
          cp.isDisputed = false;
          if (cp.owner) cp.holdTimer += dt;
          else if (cp.captureProgress > 0) { cp.captureProgress = Math.max(0, cp.captureProgress - 8.0 * dt); if (!cp.captureProgress) cp.capTeam = null; }
        }
      }

      if (!follower && cp.owner !== prevOwner) {
        if (prevOwner) this.announce(cp, 'lost', prevOwner);
        if (cp.owner) this.announce(cp, 'taken', cp.owner);
        cp.holdTimer = 0;
        cp.alert45Played = false;
      }

      // Cảnh báo khi phe nào giữ được 45s (còn 15s là thắng trận)
      if (cp.owner && cp.holdTimer >= 45.0 && !cp.alert45Played) {
        cp.alert45Played = true;
        this.announce(cp, 'urgent', cp.owner);
      }

      // Giữ đủ 60 giây: thắng trận (chơi mạng: chỉ chủ phòng quyết định)
      if (!follower && cp.owner && cp.holdTimer >= cp.holdGoal && !this.game.isGameOver) {
        this.game.finishMatchByCapture(cp.owner, cp.shortName);
        return;
      }
      if (!cp.group) return;   // cứ điểm bê tông: không có cột cờ / vòng tròn kiểu cũ

      // 5. Cập nhật hiệu ứng hình ảnh 3D
      if (cp.markerMesh) {
        cp.markerMesh.rotation.y += dt * 0.8;
      }
      if (cp.flagMesh) {
        cp.flagMesh.rotation.y = Math.sin(Date.now() * 0.003) * 0.25;
      }

      // Đổi màu sắc 3D theo chủ sở hữu và trạng thái
      let targetHex = 0xffffff;
      let areaHex = 0xffffff;
      let areaOpacity = 0.08;

      if (cp.owner === 'BLUE') {
        targetHex = 0x38bdf8;
        areaHex = 0x0284c7;
        areaOpacity = 0.16;
      } else if (cp.owner === 'RED') {
        targetHex = 0xef4444;
        areaHex = 0xdc2626;
        areaOpacity = 0.16;
      } else if (cp.captureProgress > 0) {
        targetHex = 0xfacc15; // Vàng nhạt khi đang kéo cờ
      }

      // Nhấp nháy khẩn cấp khi sắp thắng (>45s)
      if (cp.owner && cp.holdTimer >= 45.0) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.012);
        areaOpacity = 0.2 + 0.25 * pulse;
      }

      if (cp.ringMat) {
        cp.ringMat.color.setHex(targetHex);
      }
      if (cp.zoneAreaMat) {
        cp.zoneAreaMat.color.setHex(areaHex);
        cp.zoneAreaMat.opacity = areaOpacity;
      }
      if (cp.flagMat) {
        cp.flagMat.color.setHex(targetHex);
      }
    });

    // 6. Cập nhật giao diện HUD của các cứ điểm
    this.updateCapturePointsUI();
  }

  updateCapturePointsUI() {
    if (!this.points) return;

    this.points.forEach(cp => {
      const lowerId = cp.id.toLowerCase();
      const cardEl = document.getElementById(`cp-card-${lowerId}`);
      const flagEl = document.getElementById(`cp-flag-${lowerId}`);
      const statusEl = document.getElementById(`cp-status-${lowerId}`);
      const barEl = document.getElementById(`cp-bar-${lowerId}`);
      const timerEl = document.getElementById(`cp-timer-${lowerId}`);

      if (!cardEl) return;

      // Xóa class trạng thái cũ
      cardEl.classList.remove('neutral', 'blue-owned', 'red-owned', 'disputed', 'winning-soon');

      if (cp.isDisputed) {
        cardEl.classList.add('disputed');
        if (flagEl) UIIcons.set(flagEl, '[[swords]]');
        if (statusEl) statusEl.textContent = 'TRANH CHẤP';
        if (timerEl) {
          const secs = Math.floor(cp.holdTimer);
          timerEl.textContent = cp.owner ? `GIỮ: ${secs}s/60s (ĐÓNG BĂNG)` : 'Đang tranh chấp';
        }
      } else if (cp.owner === 'BLUE') {
        cardEl.classList.add('blue-owned');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-blue]]');
        if (statusEl) statusEl.textContent = 'PHE XANH';
        const secs = Math.floor(cp.holdTimer);
        if (timerEl) timerEl.textContent = `GIỮ: ${secs}s / 60s`;
        if (cp.holdTimer >= 45.0) cardEl.classList.add('winning-soon');
      } else if (cp.owner === 'RED') {
        cardEl.classList.add('red-owned');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-red]]');
        if (statusEl) statusEl.textContent = 'PHE ĐỎ';
        const secs = Math.floor(cp.holdTimer);
        if (timerEl) timerEl.textContent = `GIỮ: ${secs}s / 60s`;
        if (cp.holdTimer >= 45.0) cardEl.classList.add('winning-soon');
      } else {
        cardEl.classList.add('neutral');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-neutral]]');
        if (statusEl) statusEl.textContent = cp.captureProgress > 0 ? 'ĐANG CHIẾM' : 'TRUNG LẬP';
        if (timerEl) timerEl.textContent = cp.captureProgress > 0 ? `Tiến trình: ${Math.round(cp.captureProgress)}%` : 'Chưa chiếm';
      }

      if (barEl) {
        if (cp.owner) {
          // Nếu đã chiếm được, thanh tiến trình hiển thị tỷ lệ thời gian giữ vững (0s -> 60s)
          const holdPct = Math.min(100, (cp.holdTimer / cp.holdGoal) * 100);
          barEl.style.width = `${holdPct}%`;
          barEl.style.backgroundColor = cp.owner === 'BLUE' ? '#38bdf8' : '#ef4444';
        } else {
          // Khi đang trung lập hoặc đang kéo cờ
          barEl.style.width = `${cp.captureProgress}%`;
          barEl.style.backgroundColor = cp.capTeam === 'BLUE' ? '#7dd3fc' : cp.capTeam === 'RED' ? '#fca5a5' : '#facc15';
        }
      }
    });
  }

  // Chuyển đổi loại map chiến trường thời gian thực

}
