/**
 * Module Quản Lý Hòm Tiếp Tế Chiến Thuật & Tiếp Tế Thả Dù (Supply & Airdrop System)
 * - Hòm thả dù máy bay vận tải C-130 định kỳ mỗi 60 giây rơi vào trung tâm chiến trường
 * - 6 Hòm tiếp tế rải rác mặt đất (hồi máu, đạn đặc biệt, tăng tốc độ)
 * - Mô hình 3D rực rỡ, dù lượn bạt dù quân sự, hiệu ứng khói màu định vị
 */
class SupplyManager {
  constructor(game) {
    this.game = game;
    this.airdrop = null;
    this.airdropTimer = 35.0; // Thả dù đầu tiên sau 35s
    this.supplyCrates = [];
  }

  init() {
    this.initSupplyCrates();
  }

  // ĐỒNG BỘ NHIỀU NGƯỜI: chủ phòng là nơi DUY NHẤT quyết định thả dù, ai nhặt được hòm, phần thưởng, hòm xuất hiện lại;
  // phần thưởng chỉ áp trên máy điều khiển xe nhặt được (máu / đạn / giáp của xe đó tự đồng bộ đi các máy khác)
  get netSync() { const ns = this.game.netSync; return ns && !ns.detached ? ns : null; }
  isAuthority() { const ns = this.netSync; return !ns || ns.net.isHost; }
  ownsUnit(u) { const ns = this.netSync; return !ns || ns.owns(u); }
  broadcast(d) { const ns = this.netSync; if (ns && ns.sendSupply) ns.sendSupply(d); }

  // Tin từ chủ phòng
  onNet(d) {
    if (!d) return;
    const unitOf = (i) => (this.netSync ? this.netSync.byNetId[i] : null);
    if (d.e === 'drop') this.spawnAirdrop(d.x, d.z);
    else if (d.e === 'loot') { const u = unitOf(d.u); if (u) this.collectAirdrop(u, d.r); }
    else if (d.e === 'take') { const c = this.supplyCrates[d.c], u = unitOf(d.u); if (c && u) this.takeCrate(c, u); }
    else if (d.e === 'respawn') { const c = this.supplyCrates[d.c]; if (c) this.respawnCrate(c); }
  }

  spawnAirdrop(px, pz) {
    if (this.airdrop) {
      if (this.airdrop.mesh) this.game.scene.remove(this.airdrop.mesh);
      this.airdrop = null;
    }

    let dropX = px, dropZ = pz;
    if (typeof dropX !== 'number' || typeof dropZ !== 'number') {
      const zoneCenterX = this.game.zone.current.x - 1800;
      const zoneCenterZ = this.game.zone.current.y - 1800;
      const r = Math.random() * (this.game.zone.current.radius * 0.65);
      const angle = Math.random() * Math.PI * 2;
      dropX = zoneCenterX + Math.cos(angle) * r;
      dropZ = zoneCenterZ + Math.sin(angle) * r;
      this.broadcast({ e: 'drop', x: Math.round(dropX * 10) / 10, z: Math.round(dropZ * 10) / 10 });
    }
    const groundY = this.game.terrain.getElevationAt(dropX, dropZ);

    const airdropGroup = new THREE.Group();

    // 1. Khối thùng hàng quân sự
    const crateGeo = new THREE.BoxGeometry(22, 18, 22);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x2e6b3c });
    const crateMesh = new THREE.Mesh(crateGeo, crateMat);
    crateMesh.castShadow = true;
    airdropGroup.add(crateMesh);

    const stripeGeo = new THREE.BoxGeometry(22.4, 4, 22.4);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    airdropGroup.add(stripeMesh);

    // 2. Chiếc dù quân sự
    const parachuteGroup = new THREE.Group();
    parachuteGroup.position.y = 35;

    const canopyGeo = new THREE.ConeGeometry(26, 20, 16, 1, true);
    canopyGeo.rotateX(Math.PI);
    const canopyMat = new THREE.MeshBasicMaterial({ color: 0xfffae6, side: THREE.DoubleSide });
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
    parachuteGroup.add(canopyMesh);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x888888 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -25, 0),
        new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24)
      ]);
      const line = new THREE.Line(lineGeo, lineMat);
      parachuteGroup.add(line);
    }
    airdropGroup.add(parachuteGroup);

    // 3. Cột sáng phát quang định vị từ xa
    const beaconGeo = new THREE.CylinderGeometry(2, 2, 450, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.y = 225;
    airdropGroup.add(beaconMesh);

    airdropGroup.position.set(dropX, groundY + 650, dropZ);
    this.game.scene.add(airdropGroup);

    this.airdrop = {
      mesh: airdropGroup,
      parachuteGroup: parachuteGroup,
      beaconMesh: beaconMesh,
      x: dropX,
      z: dropZ,
      y: groundY + 650,
      groundY: groundY,
      landed: false,
      collected: false,
      smokeTimer: 0
    };

    if (window.soundEngine) {
      window.soundEngine.playRadioChirp();
    }
    this.game.addCombatLog('[[package]] MÁY BAY ĐANG THẢ DÙ HÒM TIẾP TẾ HỎA LỰC! HÃY TRANH ĐOẠT NGAY!', 'tip');
  }

  updateAirdrop(dt) {
    if (!this.airdrop) {
      if (!this.isAuthority()) return;   // máy khác chờ chủ phòng báo thả dù
      this.airdropTimer -= dt;
      if (this.airdropTimer <= 0) {
        this.spawnAirdrop();
        this.airdropTimer = 60;
      }
      return;
    }

    const drop = this.airdrop;
    if (drop.collected) return;

    if (!drop.landed) {
      drop.y -= 75 * dt;
      drop.mesh.position.y = drop.y;

      if (drop.y <= drop.groundY + 9) {
        drop.y = drop.groundY + 9;
        drop.mesh.position.y = drop.y;
        drop.landed = true;
        drop.mesh.remove(drop.parachuteGroup);
        if (drop.beaconMesh) drop.beaconMesh.material.color.setHex(0xffaa00);
        this.game.addCombatLog('[[package]] HÒM TIẾP TẾ ĐÃ TIẾP ĐẤT! TRANH ĐOẠT HỎA LỰC NGAY!', 'tip');
      }
    } else {
      // Đã tiếp đất: Tỏa khói tín hiệu cam
      drop.smokeTimer += dt;
      if (drop.smokeTimer > 0.18) {
        drop.smokeTimer = 0;
        this.spawnAirdropSmoke(drop.x, drop.groundY + 9, drop.z);
      }

      // Kiểm tra xe nào nhặt được hòm (chỉ chủ phòng xét; phần thưởng bốc thăm tại chủ phòng rồi báo đi)
      if (!this.isAuthority()) return;
      for (const unit of this.game.units) {
        if (!unit.isDead) {
          const dist = Math.hypot(unit.x - drop.x, unit.z - drop.z);
          if (dist < 32) {
            // 0: Đạn Xuyên Phá (AP), 1: Đạn Nổ Mạnh (HE), 2: Giáp Phản Ứng Nổ, 3: Nâng cấp tăng máu 1 đơn vị, 4: Động cơ tăng áp tốc độ
            const lootRoll = Math.floor(Math.random() * 5);
            if (unit.netId !== undefined) this.broadcast({ e: 'loot', u: unit.netId, r: lootRoll });
            this.collectAirdrop(unit, lootRoll);
            break;
          }
        }
      }
    }
  }

  // Hòm thả dù đã có chủ: gỡ khỏi bản đồ; phần thưởng chỉ áp trên máy điều khiển xe đó
  collectAirdrop(unit, lootRoll) {
    const drop = this.airdrop;
    if (!drop || drop.collected) return;
    drop.collected = true;
    this.game.scene.remove(drop.mesh);
    const labels = ['2 VIÊN ĐẠN XUYÊN PHÁ (BẮN PHÁT CHẾT LUÔN)!', '2 VIÊN ĐẠN NỔ MẠNH (BÁN KÍNH NỔ 120M)!', 'GIÁP PHẢN ỨNG NỔ (CHỊU ĐƯỢC 1 VIÊN KHÔNG MẤT MÁU)!',
      'HỘP SINH LỰC CHIẾN ĐẤU (TĂNG THANH MÁU VÀ HỒI ĐẦY MÁU)!', 'ĐỘNG CƠ TĂNG ÁP TỐC ĐỘ (+65% TỐC ĐỘ DI CHUYỂN TRONG 20S)!'];
    let lootMsg = labels[lootRoll] || labels[0];
    if (this.ownsUnit(unit)) {
      if (lootRoll === 0) {
        unit.apAmmoCount = (unit.apAmmoCount || 0) + 2;
        if (unit.isPlayer) unit.selectedAmmo = 'AP';
      } else if (lootRoll === 1) {
        unit.heAmmoCount = (unit.heAmmoCount || 0) + 2;
        if (unit.isPlayer) unit.selectedAmmo = 'HE';
      } else if (lootRoll === 2) {
        unit.hasReactiveArmor = true;
      } else if (lootRoll === 3) {
        unit.maxHp += 1;
        unit.hp = unit.maxHp;
        lootMsg = `HỘP SINH LỰC CHIẾN ĐẤU (TĂNG THANH MÁU LÊN ${unit.maxHp} VÀ HỒI ĐẦY MÁU)!`;
      } else {
        unit.speedBoostTimer = 20.0; // Tăng tốc độ di chuyển cực bốc trong 20 giây
      }
    }
    if (unit.isPlayer) {
      this.game.addCombatLog(`[[gift]] BẠN ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}`, 'tip');
      if (window.soundEngine) window.soundEngine.playReloadDone();
      this.game.updateAmmoUI();
    } else if ((typeof TeamIntel === 'undefined' || !this.game.player || unit.team === this.game.player.team || TeamIntel.knows(this.game.player, unit))) {
      this.game.addCombatLog(`[[alert-triangle]] ${unit.name} ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}`, 'alert');
    }
    this.airdrop = null;
    this.airdropTimer = 22; // 22 giây sau tiếp tục thả thùng mới
  }

  spawnAirdropSmoke(x, y, z) {
    const sGeo = new THREE.SphereGeometry(3.5 + Math.random() * 2, 6, 6);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const sMesh = new THREE.Mesh(sGeo, sMat);
    sMesh.position.set(x + (Math.random() - 0.5) * 4, y, z + (Math.random() - 0.5) * 4);
    this.game.scene.add(sMesh);

    (this.game.explosions3D || (this.game.explosions3D = [])).push({
      mesh: sMesh,
      scale: 1.0,
      alpha: 0.7,
      life: 1.5,
      vy: 12 + Math.random() * 6
    });
  }

  // =========================================================================
  // HỆ THỐNG CÁC HÒM TIẾP TẾ RẢI RÁC TRÊN BẢN ĐỒ CHIẾN TRƯỜNG
  // =========================================================================
  initSupplyCrates() {
    if (this.supplyCrates && this.supplyCrates.length > 0) {
      this.supplyCrates.forEach(c => {
        if (c.mesh) this.game.scene.remove(c.mesh);
      });
    }
    this.supplyCrates = [];

    // Danh sách 11 vị trí rải rác chiến lược trên chiến trường 3600 x 3600
    const crateLocations = [
      { x: 0, z: 0, type: 'ALL', name: 'TRUNG TÂM CHIẾN ĐỊA' },
      { x: -360, z: 520, type: 'REPAIR', name: 'CÔNG SỰ TÂY PHE XANH' },
      { x: 360, z: 520, type: 'AMMO', name: 'CÔNG SỰ ĐÔNG PHE XANH' },
      { x: -360, z: -520, type: 'AMMO', name: 'CÔNG SỰ TÂY PHE ĐỎ' },
      { x: 360, z: -520, type: 'REPAIR', name: 'CÔNG SỰ ĐÔNG PHE ĐỎ' },
      { x: -950, z: -400, type: 'SPEED', name: 'THUNG LŨNG TÂY BẮC' },
      { x: 950, z: -400, type: 'AMMO', name: 'THUNG LŨNG ĐÔNG BẮC' },
      { x: -950, z: 400, type: 'REPAIR', name: 'THUNG LŨNG TÂY NAM' },
      { x: 950, z: 400, type: 'SPEED', name: 'THUNG LŨNG ĐÔNG NAM' },
      { x: -650, z: 0, type: 'ALL', name: 'ĐÈO CÁT PHÍA TÂY' },
      { x: 650, z: 0, type: 'ALL', name: 'ĐÈO CÁT PHÍA ĐÔNG' }
    ];

    crateLocations.forEach((loc, idx) => {
      const groundY = this.game.terrain.getElevationAt(loc.x, loc.z);
      const crateMesh = this.createSupplyCrateMesh(loc.type);
      crateMesh.position.set(loc.x, groundY + 7, loc.z);
      this.game.scene.add(crateMesh);

      this.supplyCrates.push({
        id: `crate_${idx}`,
        x: loc.x,
        z: loc.z,
        baseY: groundY + 7,
        type: loc.type,
        name: loc.name,
        active: true,
        respawnTimer: 0,
        mesh: crateMesh
      });
    });
  }

  createSupplyCrateMesh(type = 'ALL') {
    const group = new THREE.Group();

    const crateW = 18;
    const crateH = 14;
    const crateD = 18;

    let bodyColor = 0x1e3a1e;
    let glowColor = 0x00ff9d;
    let stripeColor = 0x00e5ff;
    if (type === 'AMMO') {
      bodyColor = 0x3d2806;
      glowColor = 0xf59e0b;
      stripeColor = 0xfbbf24;
    } else if (type === 'REPAIR') {
      bodyColor = 0x1e293b;
      glowColor = 0x10b981;
      stripeColor = 0x34d399;
    } else if (type === 'SPEED') {
      bodyColor = 0x1e1e38;
      glowColor = 0x00e5ff;
      stripeColor = 0x38bdf8;
    } else {
      bodyColor = 0x3b1c1c;
      glowColor = 0xffd700;
      stripeColor = 0xfacc15;
    }

    const crateGeo = new THREE.BoxGeometry(crateW, crateH, crateD);
    const crateMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const crateMesh = new THREE.Mesh(crateGeo, crateMat);
    crateMesh.castShadow = true;
    group.add(crateMesh);

    const edgeGeo = new THREE.BoxGeometry(crateW + 0.6, 2.5, crateD + 0.6);
    const edgeMat = new THREE.MeshBasicMaterial({ color: stripeColor });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    group.add(edgeMesh);

    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const cross1Geo = new THREE.PlaneGeometry(8, 2.2);
    cross1Geo.rotateX(-Math.PI / 2);
    const cross1 = new THREE.Mesh(cross1Geo, crossMat);
    cross1.position.y = crateH / 2 + 0.1;
    group.add(cross1);

    const cross2Geo = new THREE.PlaneGeometry(2.2, 8);
    cross2Geo.rotateX(-Math.PI / 2);
    const cross2 = new THREE.Mesh(cross2Geo, crossMat);
    cross2.position.y = crateH / 2 + 0.1;
    group.add(cross2);

    const beamGeo = new THREE.CylinderGeometry(5, 9, 65, 12, 1, true);
    beamGeo.translate(0, 32.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    group.add(beamMesh);

    const haloGeo = new THREE.RingGeometry(11, 14, 16);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.y = -crateH / 2 + 0.2;
    group.add(haloMesh);

    return group;
  }

  updateSupplyCrates(dt) {
    if (!this.supplyCrates || this.supplyCrates.length === 0) return;

    for (const crate of this.supplyCrates) {
      if (crate.active) {
        crate.mesh.rotation.y += dt * 1.0;
        crate.mesh.position.y = crate.baseY + Math.sin(Date.now() * 0.003 + crate.x) * 1.5;

        if (!this.isAuthority()) continue;   // chỉ chủ phòng xét ai nhặt được
        for (const unit of this.game.units) {
          if (!unit.isDead) {
            const dist = Math.hypot(unit.x - crate.x, unit.z - crate.z);
            if (dist < 28) {
              const ci = this.supplyCrates.indexOf(crate);
              if (unit.netId !== undefined) this.broadcast({ e: 'take', c: ci, u: unit.netId });
              this.takeCrate(crate, unit);
              break;
            }
          }
        }
      } else if (this.isAuthority()) {
        crate.respawnTimer -= dt;
        if (crate.respawnTimer <= 0) {
          this.broadcast({ e: 'respawn', c: this.supplyCrates.indexOf(crate) });
          this.respawnCrate(crate);
        }
      }
    }
  }

  respawnCrate(crate) {
    if (crate.active) return;
    crate.active = true;
    crate.mesh.visible = true;
    this.game.addCombatLog(`[[package]] Hòm tiếp tế tại [${crate.name}] đã xuất hiện trở lại!`, 'system');
  }

  // Hòm mặt đất đã có chủ: ẩn & hẹn giờ xuất hiện lại; phần thưởng chỉ áp trên máy điều khiển xe đó
  takeCrate(crate, unit) {
    if (!crate.active) return;
    crate.active = false;
    crate.mesh.visible = false;
    crate.respawnTimer = 35.0;
    let rewardMsg = '';
    const own = this.ownsUnit(unit);
    if (crate.type === 'REPAIR') {
      if (own) { unit.hp = unit.maxHp; unit.hasReactiveArmor = true; }
      rewardMsg = 'HỒI ĐẦY 100% MÁU & TRANG BỊ GIÁP PHẢN ỨNG NỔ!';
    } else if (crate.type === 'AMMO' || crate.type === 'ALL') {
      if (crate.type === 'ALL' && own) { unit.hp = unit.maxHp; unit.hasReactiveArmor = true; }
      if (unit.tankType === 'ARTILLERY') {
        if (own) { unit.heAmmoCount = (unit.heAmmoCount || 0) + 3; unit.clusterAmmoCount = (unit.clusterAmmoCount || 0) + 2; unit.apAmmoCount = (unit.apAmmoCount || 0) + 2; }
        rewardMsg = 'NẠP ĐẦY ĐẠN NỔ MẠNH, ĐẠN CHÙM VÀ ĐẠN XUYÊN PHÁ!';
      } else if (unit.tankType === 'GATLING') {
        if (own) unit.incendiaryAmmoCount = (unit.incendiaryAmmoCount || 0) + 60;
        rewardMsg = '+60 VIÊN ĐẠN CHÁY NÂNG CAO!';
      } else if (unit.tankType === 'SCOUT') {
        if (own) { unit.incendiaryAmmoCount = (unit.incendiaryAmmoCount || 0) + 40; unit.missileAmmoCount = (unit.missileAmmoCount || 0) + 3; }
        rewardMsg = '+40 ĐẠN CHÁY VÀ +3 TÊN LỬA CHỐNG TĂNG!';
      } else {
        if (own) { unit.apAmmoCount = (unit.apAmmoCount || 0) + 2; unit.heAmmoCount = (unit.heAmmoCount || 0) + 2; }
        rewardMsg = '+2 ĐẠN XUYÊN PHÁ VÀ +2 ĐẠN NỔ PHÁ!';
      }
    } else if (crate.type === 'SPEED') {
      if (own) unit.speedBoostTimer = 20.0;
      rewardMsg = 'TĂNG TỐC ĐỘ DI CHUYỂN +65% TRONG 20S!';
    }
    if (unit.isPlayer) {
      this.game.addCombatLog(`[[gift]] BẠN ĐÃ CHIẾM HÒM TIẾP TẾ [${crate.name}]: +${rewardMsg}`, 'tip');
      if (window.soundEngine && typeof window.soundEngine.playReloadDone === 'function') window.soundEngine.playReloadDone();
      this.game.updateAmmoUI();
    } else if ((typeof TeamIntel === 'undefined' || !this.game.player || unit.team === this.game.player.team || TeamIntel.knows(this.game.player, unit))) {
      this.game.addCombatLog(`[[alert-triangle]] ${unit.name} đã nhặt hòm tiếp tế tại [${crate.name}]`, 'alert');
    }
  }


}
