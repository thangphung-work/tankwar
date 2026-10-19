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
  }

  // Khởi tạo 3 cứ điểm chiến lược
  init() {
    // Dọn dẹp đồ họa cũ
    if (this.points && this.points.length > 0) {
      this.points.forEach(cp => {
        if (cp.group && cp.group.parent) {
          cp.group.parent.remove(cp.group);
        }
      });
    }

    this.points = [
      {
        id: 'A',
        name: 'CỨ ĐIỂM A (PHÍA TÂY)',
        shortName: 'CỨ ĐIỂM A',
        x: -800,
        z: 0,
        radius: 85,
        owner: null,
        captureProgress: 0,
        holdTimer: 0.0,
        holdGoal: 60.0,
        isDisputed: false,
        alert45Played: false
      },
      {
        id: 'B',
        name: 'CỨ ĐIỂM B (TRUNG TÂM)',
        shortName: 'CỨ ĐIỂM B',
        x: 0,
        z: 0,
        radius: 85,
        owner: null,
        captureProgress: 0,
        holdTimer: 0.0,
        holdGoal: 60.0,
        isDisputed: false,
        alert45Played: false
      },
      {
        id: 'C',
        name: 'CỨ ĐIỂM C (PHÍA ĐÔNG)',
        shortName: 'CỨ ĐIỂM C',
        x: 800,
        z: 0,
        radius: 85,
        owner: null,
        captureProgress: 0,
        holdTimer: 0.0,
        holdGoal: 60.0,
        isDisputed: false,
        alert45Played: false
      }
    ];

    this.points.forEach(cp => {
      const terrainHeight = this.game.terrain ? this.game.terrain.getElevationAt(cp.x, cp.z) : 0;
      cp.y = terrainHeight;
      this.createMesh(cp);
    });

    this.updateCapturePointsUI();
    return this.points;
  }

  getPoints() {
    return this.points;
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

    const captureRate = 14.0; // Tốc độ chiếm (% mỗi giây với 1 xe)

    this.points.forEach(cp => {
      // 1. Tìm các xe còn sống nằm trong ranh giới cứ điểm
      let blueInZone = 0;
      let redInZone = 0;

      activeUnits.forEach(u => {
        if (!u.isAlive) return;
        const dist = Math.hypot(u.x - cp.x, u.z - cp.z);
        if (dist <= cp.radius) {
          if (u.team === 'blue') blueInZone++;
          else if (u.team === 'red') redInZone++;
        }
      });

      // 2. Xử lý logic trạng thái cứ điểm
      if (blueInZone > 0 && redInZone > 0) {
        // Có xe cả 2 phe: Tranh chấp dữ dội, đóng băng tiến trình và thời gian giữ
        cp.isDisputed = true;
      } else if (blueInZone > 0) {
        // Chỉ có Phe Xanh hiện diện
        cp.isDisputed = false;
        const speed = captureRate * (1 + 0.4 * (blueInZone - 1));

        if (cp.owner === 'blue') {
          // Phe Xanh đang kiểm soát: Tiến trình đầy đủ, đếm thời gian giữ
          cp.captureProgress = 100;
          cp.holdTimer += dt;
        } else if (cp.owner === 'red') {
          // Phe Xanh hạ cờ Phe Đỏ
          cp.captureProgress -= speed * dt;
          cp.holdTimer = 0.0;
          cp.alert45Played = false;
          if (cp.captureProgress <= 0) {
            cp.owner = null;
            cp.captureProgress = 0;
            this.game.addCombatLog(`Phe Xanh đã vô hiệu hóa thành công ${cp.name}! Cứ điểm trở lại trạng thái Trung Lập!`, 'system');
          }
        } else {
          // Cứ điểm đang Trung Lập: Kéo cờ Phe Xanh
          cp.captureProgress += speed * dt;
          if (cp.captureProgress >= 100) {
            cp.captureProgress = 100;
            cp.owner = 'blue';
            cp.holdTimer = 0.0;
            cp.alert45Played = false;
            this.game.addCombatLog(`Phe Xanh đã làm chủ ${cp.name}! Cần giữ vững cứ điểm trong 1 phút để giành chiến thắng!`, 'victory');
            if (window.soundEngine && typeof window.soundEngine.playTargetLockAcquired === 'function') {
              window.soundEngine.playTargetLockAcquired();
            }
          }
        }
      } else if (redInZone > 0) {
        // Chỉ có Phe Đỏ hiện diện
        cp.isDisputed = false;
        const speed = captureRate * (1 + 0.4 * (redInZone - 1));

        if (cp.owner === 'red') {
          cp.captureProgress = 100;
          cp.holdTimer += dt;
        } else if (cp.owner === 'blue') {
          cp.captureProgress -= speed * dt;
          cp.holdTimer = 0.0;
          cp.alert45Played = false;
          if (cp.captureProgress <= 0) {
            cp.owner = null;
            cp.captureProgress = 0;
            this.game.addCombatLog(`Quân Địch đã vô hiệu hóa quyền kiểm soát của Phe Xanh tại ${cp.name}!`, 'defeat');
          }
        } else {
          cp.captureProgress += speed * dt;
          if (cp.captureProgress >= 100) {
            cp.captureProgress = 100;
            cp.owner = 'red';
            cp.holdTimer = 0.0;
            cp.alert45Played = false;
            this.game.addCombatLog(`CẢNH BÁO: Quân Địch đã làm chủ ${cp.name}! Mau tiến tới ngăn chặn!`, 'defeat');
          }
        }
      } else {
        // Không có xe nào trong vùng
        cp.isDisputed = false;
        if (cp.owner) {
          // Cứ điểm đã thuộc quyền sở hữu của một phe: Tiếp tục tích lũy thời gian giữ vững
          cp.holdTimer += dt;
        } else {
          // Chưa có phe nào làm chủ: Tiến trình chiếm dở giảm dần về 0
          if (cp.captureProgress > 0) {
            cp.captureProgress = Math.max(0, cp.captureProgress - 8.0 * dt);
          }
        }
      }

      // 3. Cảnh báo khẩn cấp khi phe nào giữ được 45s (còn 15s là thắng trận)
      if (cp.owner && cp.holdTimer >= 45.0 && !cp.alert45Played) {
        cp.alert45Played = true;
        const remainingToWin = Math.max(1, Math.ceil(cp.holdGoal - cp.holdTimer));
        const teamName = cp.owner === 'blue' ? 'PHE XANH' : 'PHE ĐỎ';
        this.game.addCombatLog(`[BÁO ĐỘNG KHẨN CẤP] ${teamName} chỉ còn ${remainingToWin} giây nữa là thắng trận nhờ chiếm giữ ${cp.name}! Mau ngăn chặn!`, 'system');
        if (window.soundEngine && typeof window.soundEngine.playRadarAlert === 'function') {
          window.soundEngine.playRadarAlert();
        }
      }

      // 4. KIỂM TRA ĐIỀU KIỆN THẮNG TRẬN KHI GIỮ QUÁ 1 PHÚT (60 GIÂY)
      if (cp.owner && cp.holdTimer >= cp.holdGoal && !this.isGameOver) {
        this.game.finishMatchByCapture(cp.owner, cp.name);
        return;
      }

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

      if (cp.owner === 'blue') {
        targetHex = 0x38bdf8;
        areaHex = 0x0284c7;
        areaOpacity = 0.16;
      } else if (cp.owner === 'red') {
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
      } else if (cp.owner === 'blue') {
        cardEl.classList.add('blue-owned');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-blue]]');
        if (statusEl) statusEl.textContent = 'PHE XANH';
        const secs = Math.floor(cp.holdTimer);
        if (timerEl) timerEl.textContent = `GIỮ: ${secs}s / 60s`;
        if (cp.holdTimer >= 45.0) cardEl.classList.add('winning-soon');
      } else if (cp.owner === 'red') {
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
          barEl.style.backgroundColor = cp.owner === 'blue' ? '#38bdf8' : '#ef4444';
        } else {
          // Khi đang trung lập hoặc đang kéo cờ
          barEl.style.width = `${cp.captureProgress}%`;
          barEl.style.backgroundColor = '#facc15';
        }
      }
    });
  }

  // Chuyển đổi loại map chiến trường thời gian thực

}
