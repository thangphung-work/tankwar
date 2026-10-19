/**
 * Module Dựng Hình Khí Tài Thiết Giáp Quân Sự 3D Đỉnh Cao (Tactical Realistic Military Tank 3D Models Builder)
 * - Thiết kế khí tài quân sự chân thực chuẩn phong cách AAA (World of Tanks / War Thunder)
 * - Skin ngụy trang quân sự Splinter & Polygonal Digital Camo thế hệ mới cực sắc nét
 * - Kết hợp Bump Map mô phỏng bề mặt thép cán thô, đường hàn vẩy cá, đinh tán bu-lông 3D dập nổi
 * - Hình khối giáp vát đa diện sắc cạnh (Faceted Sloped Armor), gạch ERA, lồng chống đạn RPG, váy giáp module
 * - 4 Dòng xe chiến đấu riêng biệt:
 *   1. ALL_ROUNDER: Xe tăng chủ lực HALBERD MK.3 -> model riêng tại src/entities/tanks/mbt_halberd.js
 *   2. GATLING: Xe chi viện hỏa lực HAILSTORM R6 -> model riêng tại src/entities/tanks/fsv_hailstorm.js
 *   3. ARTILLERY: Pháo tự hành bánh lốp ARBALEST 155 -> model riêng tại src/entities/tanks/spg_arbalest.js
 *   4. SCOUT: Xe trinh sát 4x4 MARTEN R4 -> model riêng tại src/entities/tanks/recon_marten.js
 */

class TankModelBuilder {
  static camoTextures = {};
  static bumpTextures = {};
  static models = {};

  static createBeveledBox(width, height, depth, bevel = 0.9) {
    const r = Math.min(bevel, width * 0.12, height * 0.22);
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: r * 0.55,
      bevelThickness: r * 0.55,
      curveSegments: 2
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  // =========================================================================
  // 1. SINH TEXTURE NGỤY TRANG QUÂN SỰ CHIẾN THUẬT SIÊU SẮC NÉT (1024x1024)
  // =========================================================================
  static getCamouflageTexture(team = 'BLUE') {
    if (this.camoTextures[team]) {
      return this.camoTextures[team];
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const isBlue = team === 'BLUE';

    // A. BẢNG MÀU CHIẾN THUẬT QUÂN ĐỘI CHÂN THỰC
    // - Phe Xanh Liên Minh (NATO Urban / Woodland Camo):
    //   Xám súng thép sẫm chủ đạo, mảng rêu ô-liu chiến thuật tối, xám titan, đen khói bồ hóng
    // - Phe Đỏ Kháng Chiến (CARC Scorched Desert Camo):
    //   Vàng cát sa mạc CARC tiêu chuẩn, nâu đất nướng cháy, vàng cát khô, đen bồ hóng, vạch đỏ bầm dã chiến
    const baseColor = isBlue ? '#2b333e' : '#8b6e4e';
    const camoPalette = isBlue
      ? ['#202b23', '#3a4754', '#141a21', '#4b5966', '#2a3b2f', '#526270']
      : ['#543825', '#b0936e', '#241f1c', '#6d4c33', '#c4a67e', '#7a2222'];

    // 1. Tô màu sơn lót quân sự nền tảng
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 1024, 1024);

    // 2. Vẽ các mảng ngụy trang đa giác góc nhọn chiến thuật (Tactical Splinter & Organic Camouflage)
    for (let i = 0; i < 75; i++) {
      const color = camoPalette[i % camoPalette.length];
      ctx.fillStyle = color;
      ctx.beginPath();

      const centerX = ((i * 137 + 73) % 960) + 32;
      const centerY = ((i * 193 + 47) % 960) + 32;
      const baseRadius = 45 + ((i * 23) % 65);
      const points = 5 + (i % 4);

      for (let p = 0; p < points; p++) {
        const angle = (p / points) * Math.PI * 2 + ((i * 0.4) % 1.5);
        const r = baseRadius * (0.55 + ((p * 7 + i * 3) % 10) * 0.08);
        const px = centerX + Math.cos(angle) * r;
        const py = centerY + Math.sin(angle) * r;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Đốm phụ góc cạnh kéo dài tạo vệt dập góc
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + baseRadius * 0.8, centerY - baseRadius * 0.9);
        ctx.lineTo(centerX + baseRadius * 1.3, centerY - baseRadius * 0.4);
        ctx.lineTo(centerX + baseRadius * 0.5, centerY + baseRadius * 0.2);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 3. Hiệu ứng hạt vi mô thép cán thô (Cast Homogeneous Steel Texture Grain)
    const imgData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imgData.data;
    for (let idx = 0; idx < data.length; idx += 4) {
      // Hạt noise nhẹ nhàng tự nhiên mô phỏng bề mặt kim loại thô
      const noise = (Math.random() - 0.5) * 16;
      data[idx] = Math.min(255, Math.max(0, data[idx] + noise));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + noise));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // 4. Các đường nối ghép tấm giáp thép đúc (Armor Plate Seams) & Mối hàn vẩy cá
    const seamInterval = 256;
    for (let s = seamInterval; s < 1024; s += seamInterval) {
      // Khe rãnh tối sâu
      ctx.strokeStyle = 'rgba(10, 15, 22, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, s); ctx.lineTo(1024, s);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(s, 0); ctx.lineTo(s, 1024);
      ctx.stroke();

      // Gờ sáng bắt nắng phản chiếu dọc mép khe rãnh
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, s + 3); ctx.lineTo(1024, s + 3);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(s + 3, 0); ctx.lineTo(s + 3, 1024);
      ctx.stroke();

      // Vẩy hàn kim loại hồ quang (Welding beads)
      ctx.fillStyle = isBlue ? 'rgba(148, 163, 184, 0.6)' : 'rgba(217, 119, 6, 0.6)';
      for (let w = 8; w < 1024; w += 20) {
        ctx.beginPath();
        ctx.arc(w, s, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s, w, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Hàng đinh tán bu-lông lục giác kim loại 3D (Heavy Industrial Hex Rivets)
    for (let gx = 32; gx < 1024; gx += 64) {
      for (let gy = 32; gy < 1024; gy += 64) {
        if ((gx % 256 === 32 || gx % 256 === 224) || (gy % 256 === 32 || gy % 256 === 224)) {
          // Đầu bu-lông
          ctx.fillStyle = isBlue ? '#94a3b8' : '#d97706';
          ctx.beginPath();
          ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
          ctx.fill();

          // Bóng đổ phía dưới đầu bu-lông
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.beginPath();
          ctx.arc(gx + 1.6, gy + 1.6, 2.0, 0, Math.PI * 2);
          ctx.fill();

          // Điểm sáng phản quang kim loại phía trên
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(gx - 1.2, gy - 1.2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 6. Vết xước mài mòn kim loại dã chiến lộ lớp thép trắng bóng (Edge Wear & Battle Scratches)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.lineWidth = 1.2;
    for (let sc = 0; sc < 65; sc++) {
      const sx = (sc * 157) % 1000;
      const sy = (sc * 211) % 1000;
      const len = 12 + (sc % 28);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len, sy + (sc % 9) - 4);
      ctx.stroke();

      // Chấm tróc sơn lộ kim loại
      if (sc % 3 === 0) {
        ctx.fillStyle = 'rgba(241, 245, 249, 0.55)';
        ctx.fillRect(sx + 3, sy - 1, 2.5, 2);
      }
    }

    // 7. Huy hiệu và số hiệu tác chiến dập stencil quân sự (Tactical Stencils & Markings)
    ctx.save();
    ctx.fillStyle = isBlue ? 'rgba(248, 250, 252, 0.35)' : 'rgba(254, 240, 138, 0.38)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(isBlue ? 'BLUE-01' : 'WAR-07', 80, 180);
    ctx.fillText(isBlue ? 'NATO-IX' : 'DESERT-V', 580, 440);
    ctx.font = 'bold 20px monospace';
    ctx.fillText('ARMOR BATTALION', 80, 720);

    // Ngôi sao quân sự hoặc chevron nhận diện
    ctx.strokeStyle = isBlue ? 'rgba(56, 189, 248, 0.45)' : 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(80, 200, 120, 24);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    this.camoTextures[team] = texture;
    return texture;
  }

  // =========================================================================
  // 2. SINH BUMP MAP BỀ MẶT THÉP & ĐINH TÁN NỔI KHỐI 3D (1024x1024)
  // =========================================================================
  static getBumpTexture(team = 'BLUE') {
    if (this.bumpTextures[team]) {
      return this.bumpTextures[team];
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Nền xám trung tính (độ cao bằng 0)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 1024, 1024);

    // Rãnh nối các tấm giáp thép đúc (Lõm sâu -> màu đen)
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 4;
    for (let s = 256; s < 1024; s += 256) {
      ctx.beginPath();
      ctx.moveTo(0, s); ctx.lineTo(1024, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s, 0); ctx.lineTo(s, 1024);
      ctx.stroke();

      // Gờ mép nổi bên cạnh rãnh -> màu trắng
      ctx.strokeStyle = '#b0b0b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, s + 3); ctx.lineTo(1024, s + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s + 3, 0); ctx.lineTo(s + 3, 1024);
      ctx.stroke();
      ctx.strokeStyle = '#202020';
      ctx.lineWidth = 4;
    }

    // Các bu-lông đinh tán dập nổi (Lồi lên -> màu trắng sáng #ffffff)
    for (let gx = 32; gx < 1024; gx += 64) {
      for (let gy = 32; gy < 1024; gy += 64) {
        if ((gx % 256 === 32 || gx % 256 === 224) || (gy % 256 === 32 || gy % 256 === 224)) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Vành lõm quanh chân đinh tán
          ctx.strokeStyle = '#404040';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(gx, gy, 5.0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Vết xước dập rãnh
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1.2;
    for (let sc = 0; sc < 45; sc++) {
      const sx = (sc * 157) % 1000;
      const sy = (sc * 211) % 1000;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 15, sy + (sc % 7) - 3);
      ctx.stroke();
    }

    const bumpTex = new THREE.CanvasTexture(canvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(2, 2);
    this.bumpTextures[team] = bumpTex;
    return bumpTex;
  }

  static buildModel(unit) {
    const builder = new TankModelBuilder(unit);
    return builder.build();
  }

  constructor(unit) {
    this.unit = unit;
    this.scene = unit.scene;
  }

  // Registry model riêng cho từng dòng xe (mỗi xe một file trong src/entities/tanks/)
  static registerModel(tankType, buildFn) {
    this.models[tankType] = buildFn;
  }

  build() {
    this.unit.group = new THREE.Group();
    const custom = TankModelBuilder.models[this.unit.tankType];
    // Sổ bộ phận có thể hư hại / rơi ra của xe (PartBatch.setTag ghi vào đây)
    this.unit.partRegistry = {};
    const PB = (typeof VehicleKit !== 'undefined') ? VehicleKit.PartBatch : null;
    if (PB) PB.registry = this.unit.partRegistry;
    let hullW;
    try {
      hullW = custom ? custom(this).hullW : this.buildLegacy();
    } finally {
      if (PB) PB.registry = null;
    }
    this.finalize(hullW);
  }

  // Model cũ cho các dòng xe chưa được làm lại thành file riêng
  buildLegacy() {
    // Nạp Texture ngụy trang & Bump map quân sự
    const isBlue = this.unit.team === 'BLUE';
    const camoTex = TankModelBuilder.getCamouflageTexture(this.unit.team);
    const bumpTex = TankModelBuilder.getBumpTexture(this.unit.team);

    // =========================================================================
    // 3. HỆ THỐNG VẬT LIỆU PBR KIM LOẠI QUÂN ĐỘI CHIẾN TRƯỜNG CHÂN THỰC
    // =========================================================================
    const armorBaseColor = isBlue ? 0x465144 : 0x806346;
    const secondaryArmorColor = isBlue ? 0x29332c : 0x503724;
    const stripeColor = isBlue ? 0x0284c7 : 0xb91c1c;
    const darkMetalColor = 0x161c24; // Thép súng tôi đen
    const steelAccentColor = 0x748398;
    const rubberColor = 0x0f141a;
    const ledColor = isBlue ? 0x00d2ff : 0xff3b30;
    const opticColor = isBlue ? 0x38bdf8 : 0xf59e0b;

    // Giáp chính: Phản xạ ánh sáng mặt trời cực đẹp, bắt khối gồ ghề từ bump map
    const matArmor = new THREE.MeshStandardMaterial({
      color: armorBaseColor,
      map: camoTex || null,
      bumpMap: bumpTex || null,
      bumpScale: 0.32,
      roughness: 0.52,
      metalness: 0.48
    });

    const matSecArmor = new THREE.MeshStandardMaterial({
      color: secondaryArmorColor,
      map: camoTex || null,
      bumpMap: bumpTex || null,
      bumpScale: 0.28,
      roughness: 0.56,
      metalness: 0.44
    });

    const matStripe = new THREE.MeshStandardMaterial({
      color: stripeColor,
      roughness: 0.38,
      metalness: 0.68
    });

    const matDarkMetal = new THREE.MeshStandardMaterial({
      color: darkMetalColor,
      roughness: 0.32,
      metalness: 0.88
    });

    const matSteelAccent = new THREE.MeshStandardMaterial({
      color: steelAccentColor,
      roughness: 0.30,
      metalness: 0.85
    });

    const matRubber = new THREE.MeshStandardMaterial({
      color: rubberColor,
      roughness: 0.92,
      metalness: 0.08
    });

    const matChrome = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.12,
      metalness: 0.98
    });

    const matGlowLed = new THREE.MeshBasicMaterial({ color: ledColor });
    const matOptic = new THREE.MeshStandardMaterial({
      color: opticColor,
      roughness: 0.1,
      metalness: 0.9,
      emissive: opticColor,
      emissiveIntensity: 0.35
    });
    const matSmokeTube = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.8 });
    const matChevron = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const matSearchlight = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
    const matCanvasTarp = new THREE.MeshStandardMaterial({ color: isBlue ? 0x334155 : 0x785638, roughness: 0.85, metalness: 0.05 });

    // Khối thân xe chính có thể nhún giật theo địa hình gồ ghề (Chassis group)
    this.chassisGroup = new THREE.Group();
    this.chassisGroup.position.y = 8;
    this.unit.chassisGroup = this.chassisGroup;
    this.unit.group.add(this.chassisGroup);

    // =========================================================================
    // 4. KÍCH THƯỚC HÌNH THỂ THÂN XE CHUYÊN BIỆT THEO TỪNG BINH CHỦNG
    // =========================================================================
    let hullW = 28, hullH = 11, hullL = 48;
    let noseL = 14, noseRot = 0.28;
    let skirtW = 6.2, skirtH = 8.5, skirtL = 50;
    let wheelCountPerSide = 6;
    let wheelSpacing = 5.4;
    let trackX = 17.2;

    if (this.unit.tankType === 'SCOUT') {
      // XE TRINH SÁT BÁNH LỐP 8X8: Thân thon dài, gầm chữ V chống mìn, lướt gió
      hullW = 22; hullH = 9.8; hullL = 46;
      noseL = 15; noseRot = 0.38;
      wheelCountPerSide = 4; // 8 Bánh lốp độc lập 8x8
      wheelSpacing = 8.2;
      trackX = 14.8;
    } else if (this.unit.tankType === 'GATLING') {
      // XE CHI VIỆN HỎA LỰC 6 NÒNG: Cơ bắp, lưỡi ủi thép đúc, lồng chống RPG
      hullW = 30; hullH = 12.0; hullL = 48;
      noseL = 14; noseRot = 0.25;
      skirtW = 7.0; skirtH = 9.5; skirtL = 50;
      wheelCountPerSide = 6;
      wheelSpacing = 5.2;
      trackX = 18.5;
    } else if (this.unit.tankType === 'ARTILLERY') {
      // PHÁO TỰ HÀNH HẠNG NẶNG: Khung gầm siêu dài 7 cặp bánh chịu tải, sàn chịu lực
      hullW = 32; hullH = 12.5; hullL = 58;
      noseL = 15; noseRot = 0.22;
      skirtW = 7.0; skirtH = 9.5; skirtL = 60;
      wheelCountPerSide = 7;
      wheelSpacing = 4.8;
      trackX = 19.5;
    }

    // 4.1. Khối thân xe chính (Main Hull Box)
    const hullMainGeo = TankModelBuilder.createBeveledBox(hullW, hullH, hullL, 1.35);
    this.hullMainMesh = new THREE.Mesh(hullMainGeo, matArmor);
    this.hullMainMesh.position.y = hullH / 2 - 1.5;
    this.hullMainMesh.castShadow = true;
    this.hullMainMesh.receiveShadow = true;
    this.unit.hullMainMesh = this.hullMainMesh;
    this.chassisGroup.add(this.hullMainMesh);

    // 4.2. Mũi xe giáp nghiêng vát chống đạn sắc cạnh (Upper Glacis Plate)
    const noseGeo = TankModelBuilder.createBeveledBox(hullW - 2, hullH * 0.72, noseL, 1.1);
    const noseMesh = new THREE.Mesh(noseGeo, matSecArmor);
    noseMesh.position.set(0, 1.8, -(hullL / 2 + noseL / 2 - 2));
    noseMesh.rotation.x = noseRot;
    noseMesh.castShadow = true;
    this.chassisGroup.add(noseMesh);

    // Hai gờ vát cạnh sườn mũi xe (Chiseled Glacis Bevels)
    const bevelGeo = new THREE.BoxGeometry(3.5, hullH * 0.6, noseL * 0.85);
    for (let side of [-1, 1]) {
      const bevel = new THREE.Mesh(bevelGeo, matDarkMetal);
      bevel.position.set(side * (hullW / 2 - 2.5), 1.6, -(hullL / 2 + noseL / 2 - 2));
      bevel.rotation.x = noseRot;
      bevel.rotation.z = side * 0.35;
      this.chassisGroup.add(bevel);
    }

    // 4.3. Vát đáy mũi xe (Lower Front Plate) tạo góc chữ V chống mìn
    const lowerGlacisGeo = new THREE.BoxGeometry(hullW - 2.5, hullH * 0.55, 9);
    const lowerGlacis = new THREE.Mesh(lowerGlacisGeo, matDarkMetal);
    lowerGlacis.position.set(0, -2.5, -(hullL / 2 + 3.5));
    lowerGlacis.rotation.x = -0.42;
    this.chassisGroup.add(lowerGlacis);

    // Hai móc kéo cứu hộ hình móng ngựa (Tow Shackles) ở mũi xe
    const shackleGeo = new THREE.TorusGeometry(1.6, 0.5, 6, 12, Math.PI * 1.5);
    for (let side of [-(hullW / 2 - 4.5), (hullW / 2 - 4.5)]) {
      const shackle = new THREE.Mesh(shackleGeo, matSteelAccent);
      shackle.position.set(side, -2.2, -(hullL / 2 + 7.5));
      shackle.rotation.y = Math.PI / 2;
      this.chassisGroup.add(shackle);
    }

    // 4.4. Dải sơn nhận diện quân đội tác chiến trên nóc thân xe
    const stripeTopGeo = new THREE.BoxGeometry(hullW + 0.4, 1.8, hullL * 0.72);
    const stripeTopMesh = new THREE.Mesh(stripeTopGeo, matStripe);
    stripeTopMesh.position.set(0, hullH - 2.4, -2);
    this.chassisGroup.add(stripeTopMesh);

    // 4.5. Vạch sơn nhận diện chiến thuật hình chữ V (Tactical Chevron Marks) trên mũi xe
    const chevronGeo = new THREE.BoxGeometry(hullW * 0.42, 0.6, 2.5);
    const chevronMesh = new THREE.Mesh(chevronGeo, matChevron);
    chevronMesh.position.set(0, hullH - 1.0, -(hullL / 2 - 6));
    this.chassisGroup.add(chevronMesh);

    // 4.6. CHI TIẾT ĐẶC THÙ MŨI XE THEO TỪNG LOẠI KHÍ TÀI
    if (this.unit.tankType === 'ALL_ROUNDER') {
      // Tank đa dụng: Mũi xe bọc gạch giáp phản ứng nổ ERA xếp 2 tầng so le
      const eraCount = Math.floor(hullW / 4.4);
      const eraGeo = new THREE.BoxGeometry(3.8, 2.0, 4.6);
      for (let row = 0; row < 2; row++) {
        for (let i = -Math.floor(eraCount / 2); i <= Math.floor(eraCount / 2); i++) {
          const eraBlock = new THREE.Mesh(eraGeo, matDarkMetal);
          eraBlock.position.set(i * 4.2 + (row % 2 ? 2.1 : 0), 2.8 + row * 2.2, -(hullL / 2 + noseL / 2 - 2 + row * 3.2));
          eraBlock.rotation.x = noseRot;
          eraBlock.castShadow = true;
          this.chassisGroup.add(eraBlock);
        }
      }

      // Xích phụ dã chiến gắn trên mũi xe (Spare Track Links on Lower Glacis)
      const spareTrackGeo = new THREE.BoxGeometry(4.5, 3.2, 1.8);
      for (let st = -2; st <= 2; st++) {
        const spareTrack = new THREE.Mesh(spareTrackGeo, matRubber);
        spareTrack.position.set(st * 4.8, -2.6, -(hullL / 2 + 5.5));
        spareTrack.rotation.x = -0.42;
        this.chassisGroup.add(spareTrack);
      }

    } else if (this.unit.tankType === 'GATLING') {
      // Xe 6 nòng: Lưỡi ủi dọn chướng ngại vật bằng thép đúc với 6 răng cào đất sắc nhọn
      const dozerGeo = new THREE.BoxGeometry(hullW + 4, 7.5, 3.2);
      const dozerMesh = new THREE.Mesh(dozerGeo, matDarkMetal);
      dozerMesh.position.set(0, -0.5, -(hullL / 2 + noseL - 2));
      dozerMesh.rotation.x = -0.15;
      this.chassisGroup.add(dozerMesh);

      // 6 Răng cào xới đất bằng thép titan đúc
      const toothGeo = new THREE.ConeGeometry(1.4, 4.5, 4);
      toothGeo.rotateX(-Math.PI / 2);
      for (let t = -2.5; t <= 2.5; t += 1.0) {
        const tooth = new THREE.Mesh(toothGeo, matSteelAccent);
        tooth.position.set(t * ((hullW + 2) / 6), -3.6, -(hullL / 2 + noseL));
        this.chassisGroup.add(tooth);
      }

      // Hai xi-lanh thủy lực đẩy lưỡi ủi mạ crom sáng bóng
      for (let side of [-8.5, 8.5]) {
        const armGeo = new THREE.CylinderGeometry(1.3, 1.3, 11, 8);
        armGeo.rotateX(Math.PI / 2);
        const armMesh = new THREE.Mesh(armGeo, matChrome);
        armMesh.position.set(side, 0.2, -(hullL / 2 + noseL / 2));
        this.chassisGroup.add(armMesh);
      }

    } else if (this.unit.tankType === 'ARTILLERY') {
      // Pháo tự hành: Giá đỡ khóa nòng hành quân hình chữ A (Gun Travel Lock)
      const lockGroup = new THREE.Group();
      lockGroup.position.set(0, hullH - 1.0, -(hullL / 2 - 4));
      const legGeo = new THREE.CylinderGeometry(0.9, 1.1, 10, 6);
      const legL = new THREE.Mesh(legGeo, matDarkMetal);
      legL.position.set(-4, 4.5, 0); legL.rotation.z = -0.35;
      lockGroup.add(legL);
      const legR = new THREE.Mesh(legGeo, matDarkMetal);
      legR.position.set(4, 4.5, 0); legR.rotation.z = 0.35;
      lockGroup.add(legR);
      const clampGeo = new THREE.CylinderGeometry(3.6, 3.6, 4.0, 12, 1, false, 0, Math.PI);
      clampGeo.rotateZ(Math.PI / 2);
      const clampMesh = new THREE.Mesh(clampGeo, matSecArmor);
      clampMesh.position.set(0, 9, 0);
      lockGroup.add(clampMesh);
      this.chassisGroup.add(lockGroup);
    }

    // 4.7. Hai đèn pha LED tác chiến siêu sáng tích hợp lồng bảo vệ chống cành cây (Brush Guards)
    const ledGeo = new THREE.BoxGeometry(3.8, 2.4, 2);
    for (let side of [-(hullW / 2 - 3.5), (hullW / 2 - 3.5)]) {
      const ledMesh = new THREE.Mesh(ledGeo, matGlowLed);
      ledMesh.position.set(side, 3.2, -(hullL / 2 + noseL - 4));
      this.chassisGroup.add(ledMesh);

      // Lồng thép bảo vệ đèn hình chữ U
      const cageGeo = new THREE.TorusGeometry(2.4, 0.35, 6, 10, Math.PI);
      cageGeo.rotateY(Math.PI / 2);
      const cageMesh = new THREE.Mesh(cageGeo, matDarkMetal);
      cageMesh.position.set(side, 3.2, -(hullL / 2 + noseL - 3));
      this.chassisGroup.add(cageMesh);
    }

    // 4.8. Dây cáp kéo thép cứu hộ bện chạy dọc 2 bên hông mũi xe
    const cableGeo = new THREE.CylinderGeometry(0.6, 0.6, hullL * 0.6, 6);
    cableGeo.rotateX(Math.PI / 2);
    for (let side of [-(hullW / 2 + 0.4), (hullW / 2 + 0.4)]) {
      const cable = new THREE.Mesh(cableGeo, matDarkMetal);
      cable.position.set(side, hullH - 3.5, 0);
      this.chassisGroup.add(cable);
    }

    // 4.9. Hộp chứa phụ tùng dã chiến dập rãnh nổi (Stowage Toolboxes) trên sườn xe
    const boxGeo = new THREE.BoxGeometry(3.2, 3.5, 12);
    for (let side of [-(hullW / 2 - 1.2), (hullW / 2 - 1.2)]) {
      const tBox = new THREE.Mesh(boxGeo, matDarkMetal);
      tBox.position.set(side, hullH - 2.0, 6);
      this.chassisGroup.add(tBox);
    }

    // 4.10. Đèn hậu cảnh báo màu đỏ ở đuôi xe & lưới nan gió tản nhiệt động cơ tuốc-bin
    const tailLedMat = new THREE.MeshBasicMaterial({ color: 0xff1100 });
    for (let side of [-(hullW / 2 - 3), (hullW / 2 - 3)]) {
      const tailLed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.2), tailLedMat);
      tailLed.position.set(side, 4, hullL / 2 + 0.5);
      this.chassisGroup.add(tailLed);
    }

    // Khung lưới tản nhiệt động cơ có các nan gió song song
    const grillMesh = new THREE.Mesh(new THREE.BoxGeometry(hullW * 0.68, 5.2, 2.2), matDarkMetal);
    grillMesh.position.set(0, 6.2, hullL / 2 + 0.5);
    this.chassisGroup.add(grillMesh);

    // Nan gió tản nhiệt dập nổi
    for (let g = 0; g < 4; g++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(hullW * 0.62, 0.55, 2.6), matSteelAccent);
      slat.position.set(0, 4.5 + g * 1.1, hullL / 2 + 0.6);
      this.chassisGroup.add(slat);
    }

    // 4.11. Hai thùng nhiên liệu phụ bọc thép gắn sau đuôi xe & ống xả kép
    const fuelDrumGeo = new THREE.CylinderGeometry(3.2, 3.2, 8.8, 12);
    fuelDrumGeo.rotateZ(Math.PI / 2);
    for (let side of [-(hullW * 0.28), (hullW * 0.28)]) {
      const fuelDrum = new THREE.Mesh(fuelDrumGeo, matStripe);
      fuelDrum.position.set(side, 7.2, hullL / 2 + 3.8);
      this.chassisGroup.add(fuelDrum);

      // Đai kim loại kẹp giữ thùng nhiên liệu
      for (let band of [-3, 3]) {
        const bandMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.8, 12), matDarkMetal);
        bandMesh.rotateZ(Math.PI / 2);
        bandMesh.position.set(side + band, 7.2, hullL / 2 + 3.8);
        this.chassisGroup.add(bandMesh);
      }
    }

    // Ống xả kép vát chéo có tấm chắn nhiệt
    const exhaustGeo = new THREE.CylinderGeometry(1.6, 2.2, 7.0, 8);
    exhaustGeo.rotateX(Math.PI / 3.8);
    this.exhaustLeft = new THREE.Mesh(exhaustGeo, matDarkMetal);
    this.exhaustLeft.position.set(-(hullW / 2 - 3.5), hullH - 1, hullL / 2 - 2);
    this.chassisGroup.add(this.exhaustLeft);
    this.unit.exhaustLeft = this.exhaustLeft;

    this.exhaustRight = this.exhaustLeft.clone();
    this.exhaustRight.position.set(hullW / 2 - 3.5, hullH - 1, hullL / 2 - 2);
    this.chassisGroup.add(this.exhaustRight);
    this.unit.exhaustRight = this.exhaustRight;

    // 4.12. LỒNG THÉP CHỐNG ĐẠN PHẢN LỰC (SLAT / BAR ARMOR CAGE) CHO XE 6 NÒNG
    if (this.unit.tankType === 'GATLING') {
      const cageGroup = new THREE.Group();
      const cageBarGeo = new THREE.CylinderGeometry(0.35, 0.35, 8.5, 6);
      // Song sắt hai bên sườn
      for (let side of [-(hullW / 2 + 6.2), hullW / 2 + 6.2]) {
        for (let z = -hullL / 2 + 10; z <= hullL / 2 + 2; z += 4.5) {
          const bar = new THREE.Mesh(cageBarGeo, matDarkMetal);
          bar.position.set(side, 5, z);
          cageGroup.add(bar);
        }
        const horizBar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, hullL * 0.75, 6), matDarkMetal);
        horizBar.rotateX(Math.PI / 2);
        horizBar.position.set(side, 8, 0);
        cageGroup.add(horizBar);
      }
      // Song sắt bảo vệ đuôi xe
      for (let x = -hullW / 2 + 2; x <= hullW / 2 - 2; x += 4.2) {
        const barB = new THREE.Mesh(cageBarGeo, matDarkMetal);
        barB.position.set(x, 5, hullL / 2 + 6.5);
        cageGroup.add(barB);
      }
      this.chassisGroup.add(cageGroup);
    }

    // 4.13. CƠ CẤU CÀNG CHỐNG THỦY LỰC CHO PHÁO TỰ HÀNH HẠNG NẶNG
    if (this.unit.tankType === 'ARTILLERY') {
      this.unit.artySpadeGroup = new THREE.Group();
      this.unit.artySpadeGroup.position.set(0, 0, hullL / 2);

      const artySpadeGeo = new THREE.BoxGeometry(hullW + 2, 8.5, 6.2);
      const artySpade = new THREE.Mesh(artySpadeGeo, matDarkMetal);
      artySpade.position.set(0, -1, 3.2);
      this.unit.artySpadeGroup.add(artySpade);

      // 2 Pít-tông thủy lực mạ crom cắm xuống đất
      const spadePistonGeo = new THREE.CylinderGeometry(1.5, 1.5, 11, 8);
      spadePistonGeo.rotateX(Math.PI / 4);
      for (let side of [-9.5, 9.5]) {
        const spPiston = new THREE.Mesh(spadePistonGeo, matChrome);
        spPiston.position.set(side, 3.2, 1.6);
        this.unit.artySpadeGroup.add(spPiston);
      }

      this.chassisGroup.add(this.unit.artySpadeGroup);

      // 2 Càng thủy lực mở rộng sườn xe
      const outriggerGeo = new THREE.CylinderGeometry(1.3, 1.5, 15, 8);
      outriggerGeo.rotateZ(Math.PI / 2);
      const padGeo = new THREE.BoxGeometry(6.5, 2.2, 7.5);

      this.unit.outriggerLeft = new THREE.Group();
      this.unit.outriggerLeft.position.set(-(hullW / 2 + 1), 2, hullL / 2 - 6);
      const legL = new THREE.Mesh(outriggerGeo, matDarkMetal);
      legL.position.x = -7.5;
      this.unit.outriggerLeft.add(legL);
      const padL = new THREE.Mesh(padGeo, matSecArmor);
      padL.position.set(-15, -1, 0);
      this.unit.outriggerLeft.add(padL);
      this.chassisGroup.add(this.unit.outriggerLeft);

      this.unit.outriggerRight = new THREE.Group();
      this.unit.outriggerRight.position.set(hullW / 2 + 1, 2, hullL / 2 - 6);
      const legR = new THREE.Mesh(outriggerGeo, matDarkMetal);
      legR.position.x = 7.5;
      this.unit.outriggerRight.add(legR);
      const padR = new THREE.Mesh(padGeo, matSecArmor);
      padR.position.set(15, -1, 0);
      this.unit.outriggerRight.add(padR);
      this.chassisGroup.add(this.unit.outriggerRight);
    } else {
      const spadeGeo = new THREE.BoxGeometry(hullW - 2, 5.5, 4.0);
      const spadeMesh = new THREE.Mesh(spadeGeo, matDarkMetal);
      spadeMesh.position.set(0, 0, hullL / 2 + 1.5);
      this.chassisGroup.add(spadeMesh);
    }

    // =========================================================================
    // 5. HỆ THỐNG DI CHUYỂN: BÁNH LỐP 8X8 (SCOUT) VÀ BÁNH XÍCH HẠNG NẶNG (TANK/PHÁO)
    // =========================================================================
    this.unit.roadWheels = [];

    if (this.unit.tankType === 'SCOUT') {
      // ----------------------------------------------------
      // A. HỆ THỐNG 8 BÁNH LỐP ĐỘC LẬP 8X8 CHO XE TRINH SÁT (EBRC JAGUAR / BOXER)
      // ----------------------------------------------------
      const tireRadius = 5.2; // Lốp cao su đường kính lớn
      const tireWidth = 4.2;
      const tireGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 18);
      tireGeo.rotateZ(Math.PI / 2);

      // Gai lốp địa hình quân sự dập nổi viền
      const treadRibGeo = new THREE.TorusGeometry(tireRadius, 0.45, 6, 18);
      treadRibGeo.rotateY(Math.PI / 2);

      // Đĩa vành thép đúc có đinh tán bu-lông
      const rimGeo = new THREE.CylinderGeometry(3.0, 3.0, tireWidth + 0.4, 12);
      rimGeo.rotateZ(Math.PI / 2);
      const hubcapGeo = new THREE.CylinderGeometry(1.6, 1.6, tireWidth + 0.8, 8);
      hubcapGeo.rotateZ(Math.PI / 2);

      for (let side of [-trackX, trackX]) {
        for (let i = 0; i < wheelCountPerSide; i++) {
          const zPos = (i - (wheelCountPerSide - 1) / 2) * wheelSpacing;

          // Càng giảm xóc treo độc lập tay đòn kép
          const suspArm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.2), matDarkMetal);
          suspArm.position.set(side > 0 ? side - 2.2 : side + 2.2, 0.7, zPos);
          this.chassisGroup.add(suspArm);

          // Cụm bánh xe có khả năng bẻ lái góc Y và xoay tròn
          const wheelGroup = new THREE.Group();
          wheelGroup.position.set(side, -0.8, zPos);

          const roller = new THREE.Group();
          wheelGroup.add(roller);

          const tireMesh = new THREE.Mesh(tireGeo, matRubber);
          tireMesh.castShadow = true;
          roller.add(tireMesh);

          const ribMesh = new THREE.Mesh(treadRibGeo, matDarkMetal);
          roller.add(ribMesh);

          const rimMesh = new THREE.Mesh(rimGeo, matSecArmor);
          roller.add(rimMesh);

          const hubMesh = new THREE.Mesh(hubcapGeo, matChrome);
          roller.add(hubMesh);

          const steerFactor = (i === 3 ? 1.0 : (i === 2 ? 0.55 : 0));
          wheelGroup.userData = { roller: roller, steerFactor: steerFactor };

          this.chassisGroup.add(wheelGroup);
          this.unit.roadWheels.push(wheelGroup);
        }
      }
    } else {
      // ----------------------------------------------------
      // B. HỆ THỐNG BÁNH XÍCH & VÈ BỌC GIÁP SƯỜN (CHASSIS SKIRTS & ROAD WHEELS)
      // ----------------------------------------------------
      // Váy giáp sườn xe phân đoạn kiểu module hiện đại (Modular Side Skirts)
      const skirtSegmentL = skirtL / 5;
      for (let side of [-trackX, trackX]) {
        for (let seg = 0; seg < 5; seg++) {
          const segZ = -skirtL / 2 + skirtSegmentL * (seg + 0.5);
          const segMesh = new THREE.Mesh(new THREE.BoxGeometry(skirtW, skirtH, skirtSegmentL - 0.4), matSecArmor);
          segMesh.position.set(side, 4, segZ);
          segMesh.castShadow = true;
          this.chassisGroup.add(segMesh);

          // Bậc thang giáp chân dập nổi
          if (seg === 2) {
            const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(skirtW + 1.2, 0.8, 4), matDarkMetal);
            stepMesh.position.set(side, 2.5, segZ);
            this.chassisGroup.add(stepMesh);
          }
        }
      }

      // Dải xích thép hợp kim chịu lực
      const treadGeo = new THREE.BoxGeometry(skirtW + 0.6, 9.5, skirtL + 2);
      for (let side of [-trackX, trackX]) {
        const treadMesh = new THREE.Mesh(treadGeo, matRubber);
        treadMesh.position.set(side, 0, 0);
        treadMesh.castShadow = true;
        this.chassisGroup.add(treadMesh);
      }

      // Bánh chịu tải kép có viền cao su đen
      const wheelRadius = (this.unit.tankType === 'ARTILLERY') ? 4.2 : 4.4;
      const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, skirtW + 0.6, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const tireBandGeo = new THREE.TorusGeometry(wheelRadius, 0.45, 6, 18);
      tireBandGeo.rotateY(Math.PI / 2);
      const hubcapGeo = new THREE.CylinderGeometry(1.8, 1.8, skirtW + 1.2, 8);
      hubcapGeo.rotateZ(Math.PI / 2);

      const halfWheels = Math.floor(wheelCountPerSide / 2);
      for (let side of [-trackX, trackX]) {
        for (let i = -halfWheels; i <= halfWheels; i++) {
          const wheelGroup = new THREE.Group();
          wheelGroup.position.set(side, -0.6, i * wheelSpacing);

          const wheel = new THREE.Mesh(wheelGeo, matSecArmor);
          const tireBand = new THREE.Mesh(tireBandGeo, matRubber);
          const hubcap = new THREE.Mesh(hubcapGeo, matChrome);
          wheelGroup.add(wheel);
          wheelGroup.add(tireBand);
          wheelGroup.add(hubcap);

          wheelGroup.userData = { roller: wheelGroup, steerFactor: 0 };

          this.chassisGroup.add(wheelGroup);
          this.unit.roadWheels.push(wheelGroup);
        }
      }
    }

    // =========================================================================
    // 6. THÁP PHÁO CHIẾN THUẬT ĐA DẠNG HÓA CHUYÊN BIỆT (TACTICAL TURRETS)
    // =========================================================================
    this.unit.turretGroup = new THREE.Group();
    const turretPosZ = (this.unit.tankType === 'ARTILLERY') ? 6 : ((this.unit.tankType === 'SCOUT') ? -1 : -2);
    this.unit.turretGroup.position.set(0, hullH - 1.5, turretPosZ);
    this.chassisGroup.add(this.unit.turretGroup);

    let turretW = 24, turretH = 11, turretL = 28;

    if (this.unit.tankType === 'SCOUT') {
      // ----------------------------------------------------
      // THÁP PHÁO XE TRINH SÁT: KHÔNG NGƯỜI LÁI, VÁT GÓC TÀNG HÌNH, CỘT BUỒM TRINH SÁT
      // ----------------------------------------------------
      turretW = 16; turretH = 7.8; turretL = 20;
      const scoutTurretMesh = new THREE.Mesh(TankModelBuilder.createBeveledBox(turretW, turretH, turretL, 1.25), matArmor);
      scoutTurretMesh.position.y = turretH / 2;
      scoutTurretMesh.castShadow = true;
      this.unit.turretGroup.add(scoutTurretMesh);

      // Chảo radar trinh sát vòm cầu xoay 360 độ (Radome)
      this.unit.radarDish = new THREE.Group();
      this.unit.radarDish.position.set(0, turretH + 2.5, 0);
      const radomeBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.2, 2.2, 12), matDarkMetal);
      this.unit.radarDish.add(radomeBase);

      const radomeDome = new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), matStripe);
      radomeDome.position.y = 1.1;
      this.unit.radarDish.add(radomeDome);

      const radomeRing = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.4, 6, 20), matGlowLed);
      radomeRing.rotateX(Math.PI / 2);
      radomeRing.position.y = 1.1;
      this.unit.radarDish.add(radomeRing);
      this.unit.turretGroup.add(this.unit.radarDish);

      // Cột buồm trinh sát quang điện tử ảnh nhiệt (Telescopic Sensor Mast)
      const mastGroup = new THREE.Group();
      mastGroup.position.set(-5.5, turretH + 1.2, 4);
      const mastPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 14, 8), matDarkMetal);
      mastPillar.position.y = 7;
      mastGroup.add(mastPillar);
      const sensorHead = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), matSecArmor);
      sensorHead.position.y = 14;
      const opticLens = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), matOptic);
      opticLens.position.set(0, 14, -2.25);
      mastGroup.add(sensorHead);
      mastGroup.add(opticLens);
      this.unit.turretGroup.add(mastGroup);

      this.addSmokeDischargers(this.unit.turretGroup, 3, turretW / 2 + 0.8, turretH - 2, 0, matSmokeTube);

    } else if (this.unit.tankType === 'GATLING') {
      // ----------------------------------------------------
      // THÁP PHÁO 6 NÒNG: BỆ SÚNG KÉP CƠ BẮP, 2 THÙNG ĐẠN KHỔNG LỒ, BĂNG CHUYỀN KIM LOẠI
      // ----------------------------------------------------
      turretW = 26; turretH = 12.0; turretL = 28;
      const gatTurretMesh = new THREE.Mesh(TankModelBuilder.createBeveledBox(turretW, turretH, turretL, 1.35), matArmor);
      gatTurretMesh.position.y = turretH / 2;
      gatTurretMesh.castShadow = true;
      this.unit.turretGroup.add(gatTurretMesh);

      // Tấm giáp góc cạnh gia cường 2 bên má tháp pháo
      const cheekMesh = new THREE.Mesh(new THREE.BoxGeometry(turretW + 2, 7.5, 18), matSecArmor);
      cheekMesh.position.set(0, turretH * 0.6, 1);
      this.unit.turretGroup.add(cheekMesh);

      // Hai hòm tiếp đạn đại liên bọc thép khổng lồ 2 bên sườn có gờ dập nổi chữ X
      for (let side of [-(turretW / 2 + 3.5), turretW / 2 + 3.5]) {
        const binMesh = new THREE.Mesh(new THREE.BoxGeometry(6.5, 9.5, 16), matDarkMetal);
        binMesh.position.set(side, 6.5, 2);
        this.unit.turretGroup.add(binMesh);

        // Băng chuyền kim loại uốn cong nối vào súng
        const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 14), matChrome);
        beltMesh.position.set(side > 0 ? side - 2.8 : side + 2.8, 5.5, -3);
        beltMesh.rotation.y = side > 0 ? -0.22 : 0.22;
        this.unit.turretGroup.add(beltMesh);
      }

      // Hai đèn rọi chiến thuật siêu sáng cạnh nòng
      const lightGeo = new THREE.CylinderGeometry(2.2, 2.6, 4.5, 12);
      lightGeo.rotateX(Math.PI / 2);
      for (let side of [-10, 10]) {
        const lightMesh = new THREE.Mesh(lightGeo, matDarkMetal);
        lightMesh.position.set(side, 8.5, -11);
        const glow = new THREE.Mesh(new THREE.CircleGeometry(2.1, 12), matSearchlight);
        glow.position.set(0, 0, -2.3);
        lightMesh.add(glow);
        this.unit.turretGroup.add(lightMesh);
      }

      this.addSmokeDischargers(this.unit.turretGroup, 4, turretW / 2 + 1.2, turretH - 2, 2, matSmokeTube);

    } else if (this.unit.tankType === 'ARTILLERY') {
      // ----------------------------------------------------
      // THÁP PHÁO PHÁO TỰ HÀNH: CABIN HỘP KHỔNG LỒ CHỨA AUTOLOADER, CỘT KHÍ TƯỢNG
      // ----------------------------------------------------
      turretW = 28; turretH = 13.0; turretL = 36;
      const artyTurretMesh = new THREE.Mesh(TankModelBuilder.createBeveledBox(turretW, turretH, turretL, 1.5), matArmor);
      artyTurretMesh.position.y = turretH / 2;
      artyTurretMesh.castShadow = true;
      this.unit.turretGroup.add(artyTurretMesh);

      // Cột khí tượng đo gió và sơ tốc đầu nòng
      const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 18, 6), matDarkMetal);
      mastMesh.position.set(-9, turretH + 9, 8);
      this.unit.turretGroup.add(mastMesh);

      const vaneMesh = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 0.6), matStripe);
      vaneMesh.position.set(-9, turretH + 18, 8);
      this.unit.turretGroup.add(vaneMesh);

      // Radar đo sơ tốc đầu nòng (MVR) gắn sát gốc nòng pháo
      const mvrMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.5, 4.2), matDarkMetal);
      mvrMesh.position.set(8, turretH + 1.5, -12);
      this.unit.turretGroup.add(mvrMesh);

      // Hòm chứa đạn đại bác bọc giáp khổng lồ phía sau đuôi tháp
      const bigBustle = new THREE.Mesh(new THREE.BoxGeometry(turretW - 2, 10, 12), matDarkMetal);
      bigBustle.position.set(0, 6, turretL / 2 + 6);
      this.unit.turretGroup.add(bigBustle);

      // Cửa mở nạp đạn đại bác thủy lực và thoát vỏ đạn
      const hatchMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 1), matSecArmor);
      hatchMesh.position.set(0, 6, turretL / 2 + 12.2);
      this.unit.turretGroup.add(hatchMesh);

      this.addSmokeDischargers(this.unit.turretGroup, 4, turretW / 2 + 1.0, turretH - 2, 0, matSmokeTube);

    } else {
      // ----------------------------------------------------
      // THÁP PHÁO TANK ĐA DỤNG (ALL_ROUNDER): GIÁP NÊM VÁT DỐC LEOPARD 2A7 & KÍNH NHIỆT CITV
      // ----------------------------------------------------
      turretW = 24; turretH = 11.0; turretL = 29;
      const allTurretMesh = new THREE.Mesh(TankModelBuilder.createBeveledBox(turretW, turretH, turretL, 1.5), matArmor);
      allTurretMesh.position.y = turretH / 2;
      allTurretMesh.castShadow = true;
      this.unit.turretGroup.add(allTurretMesh);

      // Giáp nêm góc nhọn vát dốc khí động học (Angular Wedge Turret) phía trước kiểu Leopard 2A7
      const wedgeGeo = new THREE.BoxGeometry(turretW * 0.48, 8.5, 17);
      for (let side of [-1, 1]) {
        const wedgeMesh = new THREE.Mesh(wedgeGeo, matSecArmor);
        wedgeMesh.position.set(side * (turretW * 0.28), 6.5, -3.5);
        wedgeMesh.rotation.y = side * 0.15; // Vát nghiêng hai bên nhọn về phía trước
        this.unit.turretGroup.add(wedgeMesh);
      }

      // Kính ngắm nhiệt độc lập toàn cảnh trưởng xe (CITV)
      const citvGroup = new THREE.Group();
      citvGroup.position.set(-6, turretH + 2.5, 2);
      const citvBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.0, 3, 10), matDarkMetal);
      citvGroup.add(citvBase);
      const citvHead = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), matSecArmor);
      citvHead.position.y = 2.5;
      const citvLens = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.8), matOptic);
      citvLens.position.set(0, 2.5, -2.62);
      citvGroup.add(citvHead);
      citvGroup.add(citvLens);
      this.unit.turretGroup.add(citvGroup);

      // Khung giỏ thép đựng đồ sau tháp (Turret Bustle Basket) với cuộn bạt ngụy trang
      const bustleMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 9), matDarkMetal);
      bustleMesh.position.set(0, 5.5, 17.5);
      this.unit.turretGroup.add(bustleMesh);

      const tarpRoll = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 16, 10), matCanvasTarp);
      tarpRoll.rotateZ(Math.PI / 2);
      tarpRoll.position.set(0, 8.5, 17.5);
      this.unit.turretGroup.add(tarpRoll);

      // Giáp phản ứng nổ ERA sườn tháp pháo
      for (let side of [-(turretW / 2 + 0.6), turretW / 2 + 0.6]) {
        for (let z = -6; z <= 6; z += 4) {
          const eraCheek = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 3.4), matDarkMetal);
          eraCheek.position.set(side, 6.5, z);
          this.unit.turretGroup.add(eraCheek);
        }
      }

      this.addSmokeDischargers(this.unit.turretGroup, 4, turretW / 2 + 1.2, turretH - 2, 2, matSmokeTube);
    }

    // Vòm chỉ huy tròn (Cupola) & Trạm vũ khí điều khiển từ xa RCWS 12.7mm trên nóc
    const cupolaMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.8, 3.5, 12), matStripe);
    cupolaMesh.position.set(4.5, turretH + 1.8, 1);
    this.unit.turretGroup.add(cupolaMesh);

    const periscopeMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1.4, 12), matOptic);
    periscopeMesh.position.set(4.5, turretH + 3.8, 1);
    this.unit.turretGroup.add(periscopeMesh);

    this.unit.rcwsTurret = new THREE.Group();
    this.unit.rcwsTurret.position.set(4.5, turretH + 4.8, 1);
    const rcwsBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 3), matDarkMetal);
    const rcwsGun = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 6), matDarkMetal);
    rcwsGun.rotateX(Math.PI / 2);
    rcwsGun.position.set(0, 0.4, 4);
    this.unit.rcwsTurret.add(rcwsBase);
    this.unit.rcwsTurret.add(rcwsGun);
    this.unit.turretGroup.add(this.unit.rcwsTurret);

    // Cần ăng-ten liên lạc dài uốn đàn hồi
    const antennaGeo = new THREE.CylinderGeometry(0.25, 0.45, 24, 6);
    const ant1 = new THREE.Mesh(antennaGeo, matDarkMetal);
    ant1.position.set(-7.5, turretH + 12, turretL / 2 - 2);
    ant1.rotation.z = -0.12;
    this.unit.turretGroup.add(ant1);

    const ant2 = new THREE.Mesh(antennaGeo, matDarkMetal);
    ant2.position.set(7.5, turretH + 12, turretL / 2 - 2);
    ant2.rotation.z = 0.12;
    this.unit.turretGroup.add(ant2);

    const strobeGeo = new THREE.SphereGeometry(0.8, 6, 6);
    this.unit.strobeLight = new THREE.Mesh(strobeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.unit.strobeLight.position.set(-8.8, turretH + 24, turretL / 2 - 2);
    this.unit.turretGroup.add(this.unit.strobeLight);

    // =========================================================================
    // 7. KHỐI NÒNG PHÁO 3D & PISTON THỦY LỰC NÂNG HẠ CHUYÊN BIỆT
    // =========================================================================
    this.barrelPivot = new THREE.Group();
    this.barrelPivot.position.set(0, turretH * 0.52, -(turretL / 2));
    this.unit.barrelPivot = this.barrelPivot;
    this.unit.turretGroup.add(this.barrelPivot);

    const mantletW = (this.unit.tankType === 'SCOUT') ? 10 : ((this.unit.tankType === 'ARTILLERY') ? 16 : 13);
    const mantletMesh = new THREE.Mesh(new THREE.BoxGeometry(mantletW, 9.0, 7.5), matStripe);
    mantletMesh.position.set(0, 0, -3.5);
    this.barrelPivot.add(mantletMesh);

    const pistonGeo = new THREE.CylinderGeometry(1.2, 1.2, 10, 8);
    pistonGeo.rotateX(Math.PI / 2);
    for (let side of [-(mantletW / 2 - 1.2), (mantletW / 2 - 1.2)]) {
      const piston = new THREE.Mesh(pistonGeo, matChrome);
      piston.position.set(side, -2.0, -5.5);
      this.barrelPivot.add(piston);
    }

    this.unit.barrelGroup = new THREE.Group();
    this.barrelPivot.add(this.unit.barrelGroup);

    // CỤM NÒNG VŨ KHÍ TÙY BIẾN CHO TỪNG LOẠI XE TĂNG
    if (this.unit.tankType === 'GATLING') {
      // ----------------------------------------
      // A. CỤM 6 NÒNG XOAY CẬN CHIẾN (GATLING ROTARY CANNON)
      // ----------------------------------------
      this.unit.gatlingCluster = new THREE.Group();
      this.unit.barrelGroup.add(this.unit.gatlingCluster);

      const gatlingLength = 36;
      const barrelRadius = 0.95;
      const clusterRadius = 3.6;

      this.unit.gatlingHeatMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.45,
        metalness: 0.85,
        emissive: 0x000000,
        emissiveIntensity: 0
      });

      // 6 nòng súng máy xếp vòng tròn đối xứng
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const bGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, gatlingLength, 8);
        bGeo.rotateX(Math.PI / 2);
        const bMesh = new THREE.Mesh(bGeo, this.unit.gatlingHeatMat);
        bMesh.position.set(Math.cos(ang) * clusterRadius, Math.sin(ang) * clusterRadius, -(gatlingLength / 2 + 5));
        bMesh.castShadow = true;
        this.unit.gatlingCluster.add(bMesh);

        const tipGeo = new THREE.CylinderGeometry(barrelRadius + 0.4, barrelRadius, 3.2, 8);
        tipGeo.rotateX(Math.PI / 2);
        const tipMesh = new THREE.Mesh(tipGeo, this.unit.gatlingHeatMat);
        tipMesh.position.set(Math.cos(ang) * clusterRadius, Math.sin(ang) * clusterRadius, -(gatlingLength + 5.5));
        this.unit.gatlingCluster.add(tipMesh);
      }

      // 3 Vòng đai thép kẹp nòng
      for (let rz of [-14, -25, -(gatlingLength + 3.5)]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(clusterRadius, 0.9, 8, 20), matSecArmor);
        ring.position.set(0, 0, rz);
        this.unit.gatlingCluster.add(ring);
      }

      // Lồng chụp bảo vệ xẻ rãnh làm mát cho cụm nòng
      const shroudGeo = new THREE.CylinderGeometry(clusterRadius + 1.8, clusterRadius + 1.8, 16, 12, 1, true);
      shroudGeo.rotateX(Math.PI / 2);
      const shroudMesh = new THREE.Mesh(shroudGeo, matDarkMetal);
      shroudMesh.position.set(0, 0, -14);
      this.unit.barrelGroup.add(shroudMesh);

      // Trục xoay trung tâm
      const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, gatlingLength, 8), matDarkMetal);
      coreMesh.rotateX(Math.PI / 2);
      coreMesh.position.set(0, 0, -(gatlingLength / 2 + 5));
      this.unit.gatlingCluster.add(coreMesh);

      this.unit.muzzleTipLocal = new THREE.Vector3(0, 0, -(gatlingLength + 9));

    } else if (this.unit.tankType === 'ARTILLERY') {
      // ----------------------------------------
      // B. PHÁO TỰ HÀNH HẠNG NẶNG (NÒNG SIÊU DÀI 68M - BẦU HÚT KHÓI - LOA HÃM LÙI 2 TẦNG)
      // ----------------------------------------
      const barrelLength = 68;
      const barrelGeo = new THREE.CylinderGeometry(2.6, 4.0, barrelLength, 16);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, matDarkMetal);
      barrelMesh.position.set(0, 0, -(barrelLength / 2 + 6));
      barrelMesh.castShadow = true;
      this.unit.barrelGroup.add(barrelMesh);

      // Bầu hút khói kép lớn (Bore Evacuator)
      const evacMesh1 = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 16, 14), matSecArmor);
      evacMesh1.rotateX(Math.PI / 2);
      evacMesh1.position.set(0, 0, -30);
      this.unit.barrelGroup.add(evacMesh1);

      // Loa che lửa hãm lùi 2 tầng xẻ rãnh mang cá hầm hố (Double-Baffle Muzzle Brake)
      const brakeGeo = new THREE.BoxGeometry(11.2, 8.2, 14);
      const brakeMesh = new THREE.Mesh(brakeGeo, matStripe);
      brakeMesh.position.set(0, 0, -(barrelLength + 8));
      this.unit.barrelGroup.add(brakeMesh);

      // Các đai thép gia cố chịu áp lực cao trên nòng pháo
      for (let bz of [-16, -44, -58]) {
        const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 2.0, 12), matDarkMetal);
        ringMesh.rotateX(Math.PI / 2);
        ringMesh.position.set(0, 0, bz);
        this.unit.barrelGroup.add(ringMesh);
      }

      this.unit.muzzleTipLocal = new THREE.Vector3(0, 0, -(barrelLength + 15));

    } else if (this.unit.tankType === 'SCOUT') {
      // ----------------------------------------
      // C. XE TRINH SÁT: PHÁO BẮN NHANH 30MM + BỆ PHÓNG ĐẠN CHỐNG TĂNG CÓ CÁNH
      // ----------------------------------------
      const barrelLength = 28;
      const barrelGeo = new THREE.CylinderGeometry(1.0, 1.4, barrelLength, 10);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, matDarkMetal);
      barrelMesh.position.set(-2.5, 0, -(barrelLength / 2 + 5));
      barrelMesh.castShadow = true;
      this.unit.barrelGroup.add(barrelMesh);

      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 3.8, 8), matStripe);
      muzzleBrake.rotateX(Math.PI / 2);
      muzzleBrake.position.set(-2.5, 0, -(barrelLength + 5.5));
      this.unit.barrelGroup.add(muzzleBrake);

      // Cụm bệ phóng tên lửa chống tăng điều khiển bên sườn phải
      this.unit.antiTankLauncherMesh = new THREE.Group();
      this.unit.antiTankLauncherMesh.position.set(5.8, 2.0, -4);

      const launcherBox = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.2, 16), matSecArmor);
      this.unit.antiTankLauncherMesh.add(launcherBox);

      // 2 Đầu đạn chống tăng nhô ra trước ống phóng
      const matMissileTip = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.3, metalness: 0.8 });
      for (let mx of [-1.2, 1.2]) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.6, 8), matMissileTip);
        tip.rotateX(Math.PI / 2);
        tip.position.set(mx, 0, -9.2);
        this.unit.antiTankLauncherMesh.add(tip);
      }

      this.unit.barrelGroup.add(this.unit.antiTankLauncherMesh);
      this.unit.muzzleTipLocal = new THREE.Vector3(-2.5, 0, -(barrelLength + 8));

    } else {
      // ----------------------------------------
      // D. TANK ĐA DỤNG: NÒNG PHÁO 125MM CÓ VỎ BỌC CÁCH NHIỆT VÀ BỘ HÚT KHÓI
      // ----------------------------------------
      const barrelLength = 44;
      const barrelGeo = new THREE.CylinderGeometry(2.0, 3.0, barrelLength, 14);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, matDarkMetal);
      barrelMesh.position.set(0, 0, -(barrelLength / 2 + 6));
      barrelMesh.castShadow = true;
      this.unit.barrelGroup.add(barrelMesh);

      // Ốp bọc cách nhiệt từng đoạn chống cong vênh nòng (Thermal Sleeve)
      for (let sz of [-14, -32]) {
        const sleeveMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 12), matSecArmor);
        sleeveMesh.rotateX(Math.PI / 2);
        sleeveMesh.position.set(0, 0, sz);
        this.unit.barrelGroup.add(sleeveMesh);
      }

      // Bộ hút khói pháo (Bore Evacuator)
      const evacuatorMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 12, 12), matSecArmor);
      evacuatorMesh.rotateX(Math.PI / 2);
      evacuatorMesh.position.set(0, 0, -22);
      this.unit.barrelGroup.add(evacuatorMesh);

      // Loa che lửa đầu nòng
      const brakeMesh = new THREE.Mesh(new THREE.BoxGeometry(7.5, 5.5, 8.5), matStripe);
      brakeMesh.position.set(0, 0, -(barrelLength + 7));
      this.unit.barrelGroup.add(brakeMesh);

      this.unit.muzzleTipLocal = new THREE.Vector3(0, 0, -(barrelLength + 12));
    }

    return hullW;
  }

  // Phần dùng chung cho mọi dòng xe: thanh máu, khiên giáp phản ứng, vật liệu tàng hình
  finalize(hullW) {
    const isBlue = this.unit.team === 'BLUE';

    // =========================================================================
    // 8. THANH MÁU 3D TRÊN ĐẦU XE (BILLBOARD GROUP CỐ ĐỊNH HƯỚNG CAMERA)
    // =========================================================================
    this.hpGroup = new THREE.Group();
    this.hpGroup.position.set(0, 36, 0);

    const hpBgGeo = new THREE.PlaneGeometry(32, 3.8);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0a0e14, side: THREE.DoubleSide });
    this.hpBgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    this.hpBgMesh.position.set(0, 0, 0);
    this.hpGroup.add(this.hpBgMesh);
    this.unit.hpBgMesh = this.hpBgMesh;

    const hpFgGeo = new THREE.PlaneGeometry(30, 2.8);
    const hpFgMat = new THREE.MeshBasicMaterial({
      color: isBlue ? 0x00e5ff : 0xff3b30,
      side: THREE.DoubleSide
    });
    this.hpBarMesh = new THREE.Mesh(hpFgGeo, hpFgMat);
    this.hpBarMesh.position.set(0, 0, 0.2);
    this.hpGroup.add(this.hpBarMesh);
    this.unit.hpBarMesh = this.hpBarMesh;

    this.unit.hpGroup = this.hpGroup;
    this.unit.group.add(this.hpGroup);

    // 9. KHỐI GIÁP PHẢN ỨNG NỔ 3D
    const shieldGeo = new THREE.CylinderGeometry(hullW * 0.9, hullW * 1.05, 12, 12, 1, true);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.unit.reactiveArmorMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.unit.reactiveArmorMesh.position.set(0, 11, 0);
    this.unit.reactiveArmorMesh.visible = false;
    this.unit.group.add(this.unit.reactiveArmorMesh);

    // Thu thập danh sách vật liệu để tạo hiệu ứng mờ bán trong suốt khi núp bụi
    this.stealthMaterials = [];
    this.stealthAlpha = 1.0;
    this.targetStealthAlpha = 1.0;

    this.unit.group.traverse((child) => {
      if (child.isMesh && child !== this.unit.reactiveArmorMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (mat && !this.stealthMaterials.includes(mat)) {
            mat.userData = mat.userData || {};
            mat.userData.origOpacity = (mat.opacity !== undefined) ? mat.opacity : 1.0;
            mat.userData.origTransparent = !!mat.transparent;
            this.stealthMaterials.push(mat);
          }
        });
      }
    });

    this.unit.stealthMaterials = this.stealthMaterials;
    this.unit.stealthAlpha = 1.0;
    this.unit.targetStealthAlpha = 1.0;

    this.scene.add(this.unit.group);
  }

  // Phương thức phụ trợ: Cụm ống phóng lựu đạn khói ngụy trang chiến thuật
  addSmokeDischargers(parentGroup, tubeCount, posX, posY, posZ, mat) {
    const tubeGeo = new THREE.CylinderGeometry(0.5, 0.65, 3.2, 6);
    tubeGeo.rotateX(Math.PI / 3);

    for (let side of [-posX, posX]) {
      const cluster = new THREE.Group();
      cluster.position.set(side, posY, posZ);

      for (let i = 0; i < tubeCount; i++) {
        const tube = new THREE.Mesh(tubeGeo, mat);
        tube.position.set((side > 0 ? 1 : -1) * (i * 0.7), i * 0.5, i * 1.1);
        tube.rotation.y = (side > 0 ? -1 : 1) * 0.35;
        cluster.add(tube);
      }
      parentGroup.add(cluster);
    }
  }
}

if (typeof window !== 'undefined') {
  window.TankModelBuilder = TankModelBuilder;
}
