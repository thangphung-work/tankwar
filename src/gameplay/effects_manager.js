/**
 * Module Quản Lý Hiệu Ứng Nổ & Tác Động Chiến Trường 3D (VFX & Combat Impacts)
 * - Quả cầu lửa nổ 3D, sóng xung kích tỏa tròn, mảnh văng đất đá có trọng lực
 * - Vết xước cháy sém mặt đất mờ dần theo thời gian
 * - Chớp sáng môi trường PointLight và hiệu ứng rung chấn camera
 */
class EffectsManager {
  constructor(game) {
    this.game = game;
    this.explosions3D = [];
    // Hệ thống nổ chân thực mới (src/gameplay/explosion_fx.js)
    this.fx = (typeof ExplosionFX !== 'undefined' && game && game.scene)
      ? new ExplosionFX(game.scene, () => this.game.terrain)
      : null;
    if (this.fx) {
      this.fx.unitsProvider = () => (this.game && this.game.units) || [];
      this.fx.onSound = (pos, hitType, ammo) => {
        const p = this.game && this.game.player;
        if (!p || !window.soundEngine) return;
        window.soundEngine.playExplosionAtDistance(Math.hypot(p.x - pos.x, p.z - pos.z), hitType, ammo, { x: pos.x, z: pos.z });
      };
    }
  }

  createImpactEffects(x, y, z, ammoType = 'NORMAL', hitType = 'GROUND', opts = {}) {
    if (this.fx) {
      this.fx.spawn(x, y, z, ammoType, hitType, opts);
      return;
    }
    const groundY = this.game.terrain.getElevationAt(x, z);
    const impactY = Math.max(y, groundY + 0.5);

    // =========================================================================
    // 1. ĐẠN SÚNG MÁY LIÊN THANH (GATLING_BULLET): Nổ vi mô nhỏ gọn, không che khuất
    // =========================================================================
    if (ammoType === 'GATLING_BULLET') {
      const gFireGeo = new THREE.SphereGeometry(3.5, 8, 8);
      const gFireMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, depthWrite: false });
      const gFireMesh = new THREE.Mesh(gFireGeo, gFireMat);
      gFireMesh.position.set(x, impactY + 1.2, z);
      this.game.scene.add(gFireMesh);

      this.explosions3D.push({ mesh: gFireMesh, scale: 1.0, alpha: 0.9, life: 0.18, growSpeed: 6.0 });

      // Vài tia lửa nhỏ bắn tung tóe
      for (let i = 0; i < 5; i++) {
        const spGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const spMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.95, depthWrite: false });
        const spMesh = new THREE.Mesh(spGeo, spMat);
        spMesh.position.set(x, impactY + 1, z);
        this.game.scene.add(spMesh);

        const ang = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 45;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: spMesh,
          groundY: groundY,
          vx: Math.cos(ang) * spd,
          vy: 15 + Math.random() * 25,
          vz: Math.sin(ang) * spd,
          rotSpeedX: 0,
          rotSpeedY: 0,
          life: 0.16 + Math.random() * 0.1,
          alpha: 0.95
        });
      }
      return;
    }

    // =========================================================================
    // 2. ĐẠN XUYÊN PHÁ (AP): NỔ TẬP TRUNG NĂNG LƯỢNG CAO, CHỚP PLASMA XANH CYAN & TIA VONFRAM XÉ GIÓ
    // =========================================================================
    if (ammoType === 'AP') {
      // Chớp sáng Plasma xanh lơ chói lòa
      const apCoreGeo = new THREE.SphereGeometry(18, 12, 12);
      const apCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.98, depthWrite: false });
      const apCoreMesh = new THREE.Mesh(apCoreGeo, apCoreMat);
      apCoreMesh.position.set(x, impactY + 3.5, z);
      this.game.scene.add(apCoreMesh);

      this.explosions3D.push({ mesh: apCoreMesh, scale: 1.0, alpha: 0.98, life: 0.28, growSpeed: 8.5 });

      // Lõi năng lượng trắng sáng lóa mắt ở tâm
      const apWhiteGeo = new THREE.SphereGeometry(9, 10, 10);
      const apWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false });
      const apWhiteMesh = new THREE.Mesh(apWhiteGeo, apWhiteMat);
      apWhiteMesh.position.set(x, impactY + 3.5, z);
      this.game.scene.add(apWhiteMesh);
      this.explosions3D.push({ mesh: apWhiteMesh, scale: 1.0, alpha: 1.0, life: 0.16, growSpeed: 10.0 });

      // Sóng xung kích siêu thanh mỏng dẹt màu xanh neon quét cực nhanh
      const apRingGeo = new THREE.RingGeometry(2, 5, 24);
      apRingGeo.rotateX(-Math.PI / 2);
      const apRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const apRingMesh = new THREE.Mesh(apRingGeo, apRingMat);
      apRingMesh.position.set(x, groundY + 0.6, z);
      this.game.scene.add(apRingMesh);

      this.explosions3D.push({ type: 'SHOCKWAVE', mesh: apRingMesh, scale: 1.0, alpha: 0.9, life: 0.32, expandSpeed: 160.0 });

      // Hàng chục tia kim loại Vonfram nóng chảy bắn xé gió với vận tốc cực lớn (200+ m/s)
      for (let i = 0; i < 28; i++) {
        const rayLen = 1.2 + Math.random() * 2.5;
        const pGeo = new THREE.BoxGeometry(0.4, 0.4, rayLen);
        const pMat = new THREE.MeshBasicMaterial({
          color: Math.random() > 0.3 ? 0x00ffff : 0xffffff,
          transparent: true,
          opacity: 1.0,
          depthWrite: false
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(x, impactY + 2, z);
        this.game.scene.add(pMesh);

        const angle = Math.random() * Math.PI * 2;
        const spd = 120 + Math.random() * 140;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: pMesh,
          groundY: groundY,
          vx: Math.cos(angle) * spd,
          vy: 20 + Math.random() * 65,
          vz: Math.sin(angle) * spd,
          rotSpeedX: 0,
          rotSpeedY: 0,
          life: 0.45 + Math.random() * 0.25,
          alpha: 1.0
        });
      }

      // Vết nứt sém đất sẫm màu có ánh xanh neon ở giữa
      const scorchGeo = new THREE.RingGeometry(2, 16, 20);
      scorchGeo.rotateX(-Math.PI / 2);
      const scorchMat = new THREE.MeshBasicMaterial({ color: 0x122438, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide });
      const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
      scorchMesh.position.set(x, groundY + 0.35, z);
      this.game.scene.add(scorchMesh);
      this.explosions3D.push({ type: 'SCORCH', mesh: scorchMesh, timer: 0, fadeStart: 6.0, totalLife: 12.0, alpha: 0.65, maxAlpha: 0.65 });
      return;
    }

    // =========================================================================
    // 3. ĐẠN NỔ MẠNH (HE): VỤ NỔ NẤM KHỔNG LỒ RỰC LỬA, KHÓI ĐEN CUỒN CUỘN LAN 120M
    // =========================================================================
    if (ammoType === 'HE') {
      // Quả cầu lửa chính khổng lồ bành trướng cực đại
      const heFireGeo = new THREE.SphereGeometry(46, 16, 16);
      const heFireMat = new THREE.MeshBasicMaterial({ color: 0xff2600, transparent: true, opacity: 0.95, depthWrite: false });
      const heFireMesh = new THREE.Mesh(heFireGeo, heFireMat);
      heFireMesh.position.set(x, impactY + 12, z);
      this.game.scene.add(heFireMesh);
      this.explosions3D.push({ mesh: heFireMesh, scale: 1.0, alpha: 0.95, life: 0.85, growSpeed: 5.5 });

      // 3 Quả cầu lửa phụ bốc nở lệch tâm tạo hình vòm mây nấm cuồn cuộn
      const subOffsets = [[12, 18, 8], [-14, 22, -10], [6, 26, -14]];
      subOffsets.forEach(([ox, oy, oz]) => {
        const subGeo = new THREE.SphereGeometry(26, 12, 12);
        const subMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.88, depthWrite: false });
        const subMesh = new THREE.Mesh(subGeo, subMat);
        subMesh.position.set(x + ox, impactY + oy, z + oz);
        this.game.scene.add(subMesh);
        this.explosions3D.push({ mesh: subMesh, scale: 1.0, alpha: 0.88, life: 0.72, growSpeed: 4.8 });
      });

      // 2 Vòng sóng xung kích đất quét bạt sa mạc cực rộng
      [1.0, 1.35].forEach((mult, idx) => {
        const ringGeo = new THREE.RingGeometry(3, 10, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: idx === 0 ? 0xff4400 : 0xffaa33,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(x, groundY + 0.8 + idx * 0.2, z);
        this.game.scene.add(ringMesh);
        this.explosions3D.push({ type: 'SHOCKWAVE', mesh: ringMesh, scale: 1.0, alpha: 0.85, life: 0.55 * mult, expandSpeed: 210.0 * mult });
      });

      // Vết cháy sém khổng lồ đen thui trên mặt đất
      const scorchGeo = new THREE.RingGeometry(6, 46, 28);
      scorchGeo.rotateX(-Math.PI / 2);
      const scorchMat = new THREE.MeshBasicMaterial({ color: 0x1f140d, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
      const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
      scorchMesh.position.set(x, groundY + 0.35, z);
      this.game.scene.add(scorchMesh);
      this.explosions3D.push({ type: 'SCORCH', mesh: scorchMesh, timer: 0, fadeStart: 10.0, totalLife: 20.0, alpha: 0.75, maxAlpha: 0.75 });

      // Cột khói đen than kịt 22 đám cuộn bốc lên cao
      const darkSmokes = [0x1a1614, 0x2d241e, 0x42352b, 0x120f0e];
      for (let i = 0; i < 22; i++) {
        const sRadius = 7.0 + Math.random() * 8.0;
        const sGeo = new THREE.SphereGeometry(sRadius, 7, 7);
        const sMat = new THREE.MeshBasicMaterial({
          color: darkSmokes[Math.floor(Math.random() * darkSmokes.length)],
          transparent: true,
          opacity: 0.8,
          depthWrite: false
        });
        const sMesh = new THREE.Mesh(sGeo, sMat);
        sMesh.position.set(x + (Math.random() - 0.5) * 22, impactY + 4 + Math.random() * 12, z + (Math.random() - 0.5) * 22);
        this.game.scene.add(sMesh);

        this.explosions3D.push({
          type: 'SMOKE',
          mesh: sMesh,
          vx: (Math.random() - 0.5) * 16,
          vy: 24 + Math.random() * 38,
          vz: (Math.random() - 0.5) * 16,
          scale: 1.0,
          growSpeed: 2.4 + Math.random() * 2.2,
          alpha: 0.8,
          life: 2.6 + Math.random() * 1.4
        });
      }

      // Hàng chục mảnh đất đá và tàn lửa đỏ rực bắn tung tóe lên trời
      for (let i = 0; i < 35; i++) {
        const size = 1.4 + Math.random() * 2.8;
        const dGeo = new THREE.BoxGeometry(size, size, size);
        const isFireDebris = Math.random() > 0.4;
        const dMat = new THREE.MeshLambertMaterial({
          color: isFireDebris ? 0xff4400 : 0x3d2716,
          transparent: true,
          opacity: 0.95
        });
        const dMesh = new THREE.Mesh(dGeo, dMat);
        dMesh.position.set(x, impactY + 3, z);
        this.game.scene.add(dMesh);

        const angle = Math.random() * Math.PI * 2;
        const spd = 45 + Math.random() * 110;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: dMesh,
          groundY: groundY,
          vx: Math.cos(angle) * spd,
          vy: 65 + Math.random() * 120,
          vz: Math.sin(angle) * spd,
          rotSpeedX: (Math.random() - 0.5) * 16,
          rotSpeedY: (Math.random() - 0.5) * 16,
          life: 2.4 + Math.random() * 1.0,
          alpha: 0.95
        });
      }
      return;
    }

    // =========================================================================
    // 4. ĐẠN CHỐNG TĂNG (ANTI_TANK_MISSILE): NỔ NẠP LÕM XUYÊN GIÁP, LUỒNG LỬA NHIỆT PHỤT MẠNH
    // =========================================================================
    if (ammoType === 'ANTI_TANK_MISSILE') {
      const atCoreGeo = new THREE.SphereGeometry(24, 12, 12);
      const atCoreMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.95, depthWrite: false });
      const atCoreMesh = new THREE.Mesh(atCoreGeo, atCoreMat);
      atCoreMesh.position.set(x, impactY + 4, z);
      this.game.scene.add(atCoreMesh);
      this.explosions3D.push({ mesh: atCoreMesh, scale: 1.0, alpha: 0.95, life: 0.42, growSpeed: 6.5 });

      // Luồng lửa nạp lõm phụt thẳng lên cao
      const jetGeo = new THREE.CylinderGeometry(1.5, 6.5, 28, 8);
      const jetMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, depthWrite: false });
      const jetMesh = new THREE.Mesh(jetGeo, jetMat);
      jetMesh.position.set(x, impactY + 14, z);
      this.game.scene.add(jetMesh);
      this.explosions3D.push({ mesh: jetMesh, scale: 1.0, alpha: 0.9, life: 0.28, growSpeed: 4.0 });

      // Sóng nón xung kích
      const atRingGeo = new THREE.RingGeometry(2, 8, 24);
      atRingGeo.rotateX(-Math.PI / 2);
      const atRingMat = new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const atRingMesh = new THREE.Mesh(atRingGeo, atRingMat);
      atRingMesh.position.set(x, groundY + 0.6, z);
      this.game.scene.add(atRingMesh);
      this.explosions3D.push({ type: 'SHOCKWAVE', mesh: atRingMesh, scale: 1.0, alpha: 0.85, life: 0.38, expandSpeed: 140.0 });

      // Mảnh vỡ kim loại phản lực bắn tóe
      for (let i = 0; i < 20; i++) {
        const pGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const pMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xffcc00 : 0xff3b00, transparent: true, opacity: 1.0, depthWrite: false });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(x, impactY + 2, z);
        this.game.scene.add(pMesh);

        const angle = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 95;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: pMesh,
          groundY: groundY,
          vx: Math.cos(angle) * spd,
          vy: 40 + Math.random() * 75,
          vz: Math.sin(angle) * spd,
          rotSpeedX: 0,
          rotSpeedY: 0,
          life: 0.5 + Math.random() * 0.3,
          alpha: 1.0
        });
      }
      return;
    }

    // =========================================================================
    // 5. ĐẠN THƯỜNG TIÊU CHUẨN (NORMAL): VỤ NỔ 155MM ĐẤT CÁT SA MẠC CÂN BẰNG
    // =========================================================================
    const fireGeo = new THREE.SphereGeometry(24, 12, 12);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.95, depthWrite: false });
    const fireMesh = new THREE.Mesh(fireGeo, fireMat);
    fireMesh.position.set(x, impactY + 4, z);
    this.game.scene.add(fireMesh);
    this.explosions3D.push({ mesh: fireMesh, scale: 1.0, alpha: 0.95, life: 0.45, growSpeed: 4.5 });

    // Vòng sóng xung kích bụi cát quét rạt mặt đất
    const ringGeo = new THREE.RingGeometry(2, 6, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xeed2a2, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(x, groundY + 0.8, z);
    this.game.scene.add(ringMesh);
    this.explosions3D.push({ type: 'SHOCKWAVE', mesh: ringMesh, scale: 1.0, alpha: 0.8, life: 0.45, expandSpeed: 110.0 });

    // Vết sém đất cát
    const scorchGeo = new THREE.RingGeometry(3, 24, 24);
    scorchGeo.rotateX(-Math.PI / 2);
    const scorchMat = new THREE.MeshBasicMaterial({ color: 0x3d2716, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
    const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
    scorchMesh.position.set(x, groundY + 0.35, z);
    this.game.scene.add(scorchMesh);
    this.explosions3D.push({ type: 'SCORCH', mesh: scorchMesh, timer: 0, fadeStart: 8.0, totalLife: 15.0, alpha: 0.48, maxAlpha: 0.48 });

    // Cột đất cát văng tung tóe
    const dirtColors = [0x4a3219, 0x6e4a25, 0x9c7442, 0xd4a559, 0x321e0e];
    for (let i = 0; i < 18; i++) {
      const size = 1.0 + Math.random() * 2.2;
      const dGeo = new THREE.BoxGeometry(size, size, size);
      const dMat = new THREE.MeshLambertMaterial({
        color: dirtColors[Math.floor(Math.random() * dirtColors.length)],
        transparent: true,
        opacity: 0.95
      });
      const dMesh = new THREE.Mesh(dGeo, dMat);
      dMesh.position.set(x + (Math.random() - 0.5) * 6, impactY + 1.5, z + (Math.random() - 0.5) * 6);
      this.game.scene.add(dMesh);

      const angle = Math.random() * Math.PI * 2;
      const horizSpeed = 18 + Math.random() * 60;
      this.explosions3D.push({
        type: 'DEBRIS',
        mesh: dMesh,
        groundY: groundY,
        vx: Math.cos(angle) * horizSpeed,
        vy: 45 + Math.random() * 80,
        vz: Math.sin(angle) * horizSpeed,
        rotSpeedX: (Math.random() - 0.5) * 12,
        rotSpeedY: (Math.random() - 0.5) * 12,
        life: 1.8 + Math.random() * 0.8,
        alpha: 0.95
      });
    }

    // Khói bụi sa mạc bốc lên
    for (let i = 0; i < 8; i++) {
      const sRadius = 4.0 + Math.random() * 4.5;
      const sGeo = new THREE.SphereGeometry(sRadius, 7, 7);
      const sMat = new THREE.MeshBasicMaterial({ color: 0x8f7d67, transparent: true, opacity: 0.65, depthWrite: false });
      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.position.set(x + (Math.random() - 0.5) * 10, impactY + 2 + Math.random() * 6, z + (Math.random() - 0.5) * 10);
      this.game.scene.add(sMesh);

      this.explosions3D.push({
        type: 'SMOKE',
        mesh: sMesh,
        vx: (Math.random() - 0.5) * 8,
        vy: 16 + Math.random() * 22,
        vz: (Math.random() - 0.5) * 8,
        scale: 1.0,
        growSpeed: 1.8 + Math.random() * 1.5,
        alpha: 0.65,
        life: 1.8 + Math.random() * 0.9
      });
    }
  }

  // ==========================================
  // HỆ THỐNG HÒM TIẾP TẾ HỎA LỰC THẢ DÙ CHIẾN THUẬT (TACTICAL AIRDROP)
  // ==========================================


  update(dt) {
    if (this.fx) this.fx.update(dt);
    for (let i = this.explosions3D.length - 1; i >= 0; i--) {
      const exp = this.explosions3D[i];
      let dead = false;

      if (exp.type === 'DEBRIS') {
        exp.vy -= 190 * dt;
        exp.mesh.position.x += exp.vx * dt;
        exp.mesh.position.y += exp.vy * dt;
        exp.mesh.position.z += exp.vz * dt;
        exp.mesh.rotation.x += exp.rotX * dt;
        exp.mesh.rotation.z += exp.rotZ * dt;
        exp.life -= dt;
        if (exp.life <= 0) dead = true;
      } else if (exp.type === 'SCORCH') {
        exp.life -= dt;
        if (exp.mesh.material) {
          exp.mesh.material.opacity = (exp.life / exp.maxLife) * 0.75;
        }
        if (exp.life <= 0) dead = true;
      } else if (exp.type === 'FLASH_LIGHT') {
        exp.life -= dt;
        if (exp.light) {
          exp.light.intensity = Math.max(0, exp.light.intensity - dt * 25);
        }
        if (exp.life <= 0) dead = true;
      } else {
        exp.life -= dt;
        const progress = 1 - (exp.life / exp.maxLife);
        const curScale = 1 + progress * (exp.targetScale - 1);
        exp.mesh.scale.set(curScale, curScale, curScale);

        if (exp.type === 'BLAST_RING') {
          exp.mesh.position.y += dt * 3.5;
        } else if (exp.type === 'FIREBALL') {
          exp.mesh.position.y += dt * 6.5;
        } else if (exp.type === 'SMOKE') {
          exp.mesh.position.y += dt * 11.0;
        }

        if (exp.mesh.material) {
          exp.mesh.material.opacity = Math.max(0, (exp.life / exp.maxLife) * (exp.type === 'FIREBALL' ? 0.95 : 0.75));
        }
        if (exp.life <= 0) dead = true;
      }

      if (dead) {
        this.game.scene.remove(exp.mesh);
        if (exp.mesh && exp.mesh.geometry) exp.mesh.geometry.dispose();
        if (exp.mesh && exp.mesh.material) exp.mesh.material.dispose();
        if (exp.light) this.game.scene.remove(exp.light);
        this.explosions3D.splice(i, 1);
      }
    }
  }
}
