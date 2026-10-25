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
      const A = this.game.battleArea();
      const r = Math.random() * (A.r * 0.65);
      const angle = Math.random() * Math.PI * 2;
      dropX = A.x + Math.cos(angle) * r;
      dropZ = A.z + Math.sin(angle) * r;
      // không thả dù vào khu căn cứ vùng cấm bắn giữa 3 cứ điểm
      const LS = this.game.terrain && this.game.terrain.landmarkSet;
      if (LS && LS.outside) [dropX, dropZ] = LS.outside(dropX, dropZ, 60);
      this.broadcast({ e: 'drop', x: Math.round(dropX * 10) / 10, z: Math.round(dropZ * 10) / 10 });
    }
    const groundY = this.game.terrain.getElevationAt(dropX, dropZ);

    // Túi hàng bạt kiểu A-22 trên đế gỗ + dù tròn ô liu (src/gameplay/supply_crate_model.js); đáy hòm ở y = -9
    const { group: airdropGroup, chute: parachuteGroup } = SupplyCrateModel.airdrop();
    airdropGroup.rotation.y = Math.random() * Math.PI * 2;

    // Định vị: không dùng cột sáng; tiếp đất thì ống khói đỏ bung cạnh hòm (emitSignalSmoke)

    airdropGroup.position.set(dropX, groundY + 650, dropZ);
    this.game.scene.add(airdropGroup);

    this.airdrop = {
      mesh: airdropGroup,
      parachuteGroup: parachuteGroup,
      x: dropX,
      z: dropZ,
      y: groundY + 650,
      groundY: groundY,
      landed: false,
      collected: false,
      smokeAcc: 0,
      t: Math.random() * 10
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
      drop.t += dt;
      drop.mesh.rotation.x = Math.sin(drop.t * 0.9) * 0.05;
      drop.mesh.rotation.z = Math.sin(drop.t * 0.7 + 1.3) * 0.06;

      if (drop.y <= drop.groundY + 9) {
        drop.y = drop.groundY + 9;
        drop.mesh.position.y = drop.y;
        drop.landed = true;
        drop.mesh.remove(drop.parachuteGroup);
        drop.mesh.rotation.x = drop.mesh.rotation.z = 0;
        // dù xẹp đổ xuôi chiều gió, nằm trên đất cạnh hòm (toạ độ trong nhóm hòm: đáy hòm y = -9)
        const W = this.game.ballistics && this.game.ballistics.wind, wl = W ? Math.hypot(W.vx, W.vz) : 0;
        const wa = wl > 0.1 ? Math.atan2(W.vz, W.vx) : Math.random() * Math.PI * 2;
        const yaw = drop.mesh.rotation.y, c = Math.cos(yaw), sn = Math.sin(yaw), wx = Math.cos(wa) * 19, wz = Math.sin(wa) * 19;
        const lx = wx * c - wz * sn, lz = wx * sn + wz * c;   // hướng gió đổi sang toạ độ trong nhóm hòm
        const heap = SupplyCrateModel.collapsedChute({ x: -19, y: 16.4, z: 0 });   // dây dù vắt về móc trên nóc hòm
        heap.position.set(lx, -9, lz);
        heap.rotation.y = -Math.atan2(lz, lx);
        drop.mesh.add(heap);
        // ống khói đỏ phía đầu gió: khói bạt qua hòm, dễ nhận từ xa; đầu phụt quay ra ngoài
        const cn = SupplyCrateModel.canister(0xa8392a), d = Math.hypot(lx, lz) || 1, cx = -lx / d * 11, cz = -lz / d * 11;
        cn.position.set(cx, -9, cz); cn.rotation.y = -Math.atan2(cz, cx);
        drop.mesh.add(cn);
        drop.mesh.updateMatrixWorld(true);
        const sp = drop.mesh.localToWorld(new THREE.Vector3(cx + cx / 11 * 0.6, -9 + 0.36, cz + cz / 11 * 0.6));
        drop.smoke = { x: sp.x, y: sp.y, z: sp.z };
        this.game.addCombatLog('[[package]] HÒM TIẾP TẾ ĐÃ TIẾP ĐẤT! TRANH ĐOẠT HỎA LỰC NGAY!', 'tip');
      }
    } else {
      // Đã tiếp đất: ống khói đỏ cạnh hòm xịt khói cho tới khi có xe nhặt
      const sp = drop.smoke || { x: drop.x, y: drop.groundY, z: drop.z };
      this.emitSignalSmoke(drop, sp.x, sp.y, sp.z, dt, true, 'red');

      // Kiểm tra xe nào nhặt được hòm (chỉ chủ phòng xét; phần thưởng bốc thăm tại chủ phòng rồi báo đi)
      if (!this.isAuthority()) return;
      for (const unit of this.game.units) {
        if (!unit.isDead) {
          const dx = unit.x - drop.x, dz = unit.z - drop.z;
          if (dx * dx + dz * dz < 32 * 32) {
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
    const labels = ['2 VIÊN ĐẠN XUYÊN PHÁ (BẮN PHÁT CHẾT LUÔN)!', '2 VIÊN ĐẠN NỔ MẠNH (BÁN KÍNH NỔ 120M)!', 'GIÁP PHẢN ỨNG NỔ (PHÁ HỦY 1 PHÁT RPG / ĐẠN PHÁO TRÚNG THẲNG)!',
      'HỘP SINH LỰC CHIẾN ĐẤU (TĂNG THANH MÁU VÀ HỒI ĐẦY MÁU)!', 'ĐỘNG CƠ TĂNG ÁP TỐC ĐỘ (+65% TỐC ĐỘ DI CHUYỂN TRONG 20S)!'];
    let lootMsg = labels[lootRoll] || labels[0];
    // hòm thả dù luôn kèm kiện đạn: nạp đầy cơ số đạn mang theo (AmmoLoad)
    if (this.ownsUnit(unit) && typeof AmmoLoad !== 'undefined') {
      const add = AmmoLoad.resupply(unit, 1);
      if (add && unit.isPlayer) lootMsg += ` · NẠP ĐẦY CƠ SỐ (${add.toUpperCase()})`;
    }
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
      if (window.soundEngine) (window.soundEngine.playSupplyPickup || window.soundEngine.playReloadDone).call(window.soundEngine);
      this.game.updateAmmoUI();
    } else if ((typeof TeamIntel === 'undefined' || !this.game.player || unit.team === this.game.player.team || TeamIntel.knows(this.game.player, unit))) {
      this.game.addCombatLog(`[[alert-triangle]] ${unit.name} ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}`, 'alert');
    }
    this.airdrop = null;
    this.airdropTimer = 22; // 22 giây sau tiếp tục thả thùng mới
  }

  /**
   * Khói tín hiệu như lựu đạn khói màu thật (kiểu M18, 8 đv = 1 m) phụt từ đầu ống nằm trên đất cạnh hòm:
   * - khói màu nặng, ấm ít: phụt ra đặc, sát gốc màu đậm; bốc lên chậm (~0.5 m/s), bạt mạnh theo gió
   *   (game.ballistics.wind), nở rộng, loãng và nhạt / ngả xám dần khi tan
   * - một phần khói nặng tràn sát đất xuôi gió
   * - màu tính sẵn như đã được chiếu sáng (hạt không nhận đèn): không vượt 1 -> không tự phát sáng thành quả cầu
   * Hạt nhỏ, phát dày -> cột khói liền mạch (không thành chuỗi cục tròn). Lớp hạt instanced fx.signal của ExplosionFX
   * (1 lần vẽ, không tạo mesh mới); ở xa / ngoài khung nhìn chỉ phát một phần (fx.withLod).
   * em: đối tượng giữ nhịp phát ({ smokeAcc }); big: hòm thả dù (khói dày, cao hơn); col: 'yellow' | 'red'
   */
  emitSignalSmoke(em, x, y, z, dt, big, col) {
    const fx = this.game.effectsManager && this.game.effectsManager.fx;
    const layer = fx && (fx.signal || fx.smoke);
    if (!layer) return;
    const rate = big ? 13 : 7;                       // hạt / giây
    em.smokeAcc = (em.smokeAcc || 0) + dt * rate;
    if (em.smokeAcc < 1) return;
    const W = this.game.ballistics && this.game.ballistics.wind;
    const wx = W ? W.vx : 0, wz = W ? W.vz : 0, wl = Math.hypot(wx, wz);
    const ux = wl > 0.1 ? wx / wl : 0, uz = wl > 0.1 ? wz / wl : 0;
    const R = Math.random, k = big ? 1.25 : 1;
    // màu khói M18 dưới ánh ngày: đậm ở gốc -> nhạt, ngả xám khi loãng
    const C0 = col === 'red' ? [0.74, 0.27, 0.21] : [0.88, 0.71, 0.26], C1 = col === 'red' ? [0.72, 0.6, 0.57] : [0.78, 0.75, 0.62];
    const emit = () => {
      let n = 0;
      while (em.smokeAcc >= 1 && n < 4) {
        em.smokeAcc -= 1; n++;
        const age = (em.smokeAcc / rate) || 0, j = 0.9 + R() * 0.1;
        // luồng phụt: bắn ra khỏi miệng ống + lên, rồi gió cuốn đi
        const out = 1.2 + R() * 2, vx = ux * out + (R() - 0.5) * 2.2, vz = uz * out + (R() - 0.5) * 2.2, vy = (4.5 + R() * 3) * k;
        layer.add({
          x: x + vx * age, y: y + 0.2 + vy * age, z: z + vz * age, vx, vy, vz, ax: wx * 0.4, az: wz * 0.4,
          size: (1.5 + R() * 1.1) * k, grow: (2.8 + R() * 1.4) * k, drag: 0.5, grav: -1.8,
          life: (6.5 + R() * 2.5) * (big ? 1.35 : 1), alpha: 0.72, fadeIn: 0.1, fadePow: 1.5,
          c0: [C0[0] * j, C0[1] * j, C0[2] * j], c1: C1, colorRate: 0.55, cell: 0, floor: false
        });
        // khói nặng loang sát đất xuôi gió (1/5 số hạt, mỏng)
        if (R() < 0.2) {
          const a = R() * Math.PI * 2, sp = 1 + R() * 2;
          layer.add({
            x: x + Math.cos(a) * 0.6, y: y + 0.3, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * sp + ux * 2, vy: 0.4 + R() * 0.6, vz: Math.sin(a) * sp + uz * 2,
            ax: wx * 0.7, az: wz * 0.7, size: (2 + R()) * k, grow: 2.6 * k, drag: 0.7, grav: -0.12,
            life: 3 + R() * 1.5, alpha: 0.35, fadeIn: 0.15, fadePow: 1.2, c0: [C0[0] * 0.95, C0[1] * 0.95, C0[2] * 0.95], c1: C1, colorRate: 0.7, cell: 0, floor: false
          });
        }
      }
      if (em.smokeAcc > 1) em.smokeAcc = 0;
    };
    if (fx.withLod) fx.withLod(x, y, z, big ? 40 : 28, emit); else emit();
  }

  // Vị trí đầu ống khói (thế giới) của hòm mặt đất — ống M18 nằm cạnh pallet (SupplyCrateModel.SMOKE.crate)
  placeCrateExtras(crate) {
    const m = crate.mesh, o = typeof SupplyCrateModel !== 'undefined' && SupplyCrateModel.SMOKE ? SupplyCrateModel.SMOKE.crate : { x: 0, y: 8, z: 0 };
    m.updateMatrixWorld(true);
    const p = m.localToWorld(new THREE.Vector3(o.x, o.y, o.z));
    crate.smoke = { x: p.x, y: p.y, z: p.z };
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

    // Danh sách 11 vị trí rải rác chiến lược (bố cục gốc cho bản đồ 3600, giãn theo kích thước bản đồ)
    const K = this.game.worldWidth / 3600;
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

    crateLocations.forEach((loc0, idx) => {
      const loc = Object.assign({}, loc0, { x: loc0.x * K, z: loc0.z * K });
      // hòm rơi vào khu căn cứ (vùng cấm bắn) -> dời ra ngoài hàng rào
      const LS = this.game.terrain && this.game.terrain.landmarkSet;
      if (LS && LS.outside) [loc.x, loc.z] = LS.outside(loc.x, loc.z, 40);
      const T = this.game.terrain, groundY = T.getElevationAt(loc.x, loc.z);
      const crateMesh = this.createSupplyCrateMesh(loc.type);
      // pallet đặt sát đất (gốc hình = mặt đất), mỗi hòm một hướng (cố định theo thứ tự -> mọi máy như nhau), nghiêng theo dốc
      const dx = (T.getElevationAt(loc.x + 7, loc.z) - T.getElevationAt(loc.x - 7, loc.z)) / 14;
      const dz = (T.getElevationAt(loc.x, loc.z + 7) - T.getElevationAt(loc.x, loc.z - 7)) / 14;
      crateMesh.rotation.order = 'XZY';
      const tilt = (v) => Math.max(-0.25, Math.min(0.25, Math.atan(v)));   // dốc đứng: nghiêng tối đa ~14° (pallet không dựng ngược)
      crateMesh.rotation.set(-tilt(dz), (idx * 2.399) % (Math.PI * 2), tilt(dx));
      crateMesh.position.set(loc.x, groundY - 0.2, loc.z);
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
        smokeAcc: Math.random() * 0.2,
        mesh: crateMesh
      });
      this.placeCrateExtras(this.supplyCrates[this.supplyCrates.length - 1]);
    });
    // điểm tiếp tế hậu phương mỗi phe (xe hậu cần + kho đạn sau khu xuất kích): đứng trong vùng nạp đạn nhanh
    if (typeof SupplyDepot !== 'undefined') { try { SupplyDepot.init(this.game); } catch (e) { console.warn('[DEPOT]', e); } }
  }

  // Hình hòm theo loại: pallet hàng tiếp tế quân sự (src/gameplay/supply_crate_model.js), gốc = mặt đất giữa pallet.
  // Không cột sáng / vòng neon: hòm đánh dấu bằng khói tín hiệu vàng từ ống M18 nằm cạnh pallet (emitSignalSmoke)
  createSupplyCrateMesh(type = 'ALL') {
    return SupplyCrateModel.crate(type);
  }

  updateSupplyCrates(dt) {
    if (!this.supplyCrates || this.supplyCrates.length === 0) return;

    for (const crate of this.supplyCrates) {
      if (crate.active) {
        // Hòm nằm yên trên đất (không xoay / nhấp nhô); ống khói vàng cạnh pallet xịt khói tín hiệu
        const sp = crate.smoke || { x: crate.x, y: crate.baseY, z: crate.z };
        this.emitSignalSmoke(crate, sp.x, sp.y, sp.z, dt, false, 'yellow');

        if (!this.isAuthority()) continue;   // chỉ chủ phòng xét ai nhặt được
        for (const unit of this.game.units) {
          if (!unit.isDead) {
            const dx = unit.x - crate.x, dz = unit.z - crate.z;
            if (dx * dx + dz * dz < 28 * 28) {
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
    // hòm ĐẠN / TỔNG HỢP: nạp bù cơ số đạn mang theo (đạn pháo / băng / hộp vũ khí nóc) — AmmoLoad
    if (own && (crate.type === 'AMMO' || crate.type === 'ALL') && typeof AmmoLoad !== 'undefined') {
      const add = AmmoLoad.resupply(unit, crate.type === 'AMMO' ? 0.6 : 0.4);
      if (add && unit.isPlayer) rewardMsg += ` CƠ SỐ: ${add.toUpperCase()}`;
    }
    if (unit.isPlayer) {
      this.game.addCombatLog(`[[gift]] BẠN ĐÃ CHIẾM HÒM TIẾP TẾ [${crate.name}]: +${rewardMsg}`, 'tip');
      if (window.soundEngine) (window.soundEngine.playSupplyPickup || window.soundEngine.playReloadDone).call(window.soundEngine);
      this.game.updateAmmoUI();
    } else if ((typeof TeamIntel === 'undefined' || !this.game.player || unit.team === this.game.player.team || TeamIntel.knows(this.game.player, unit))) {
      this.game.addCombatLog(`[[alert-triangle]] ${unit.name} đã nhặt hòm tiếp tế tại [${crate.name}]`, 'alert');
    }
  }


}
