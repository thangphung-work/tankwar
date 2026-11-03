/**
 * Module Quản Lý Hòm Tiếp Tế Chiến Thuật & Tiếp Tế Thả Dù (Supply & Airdrop System)
 * - Máy bay vận tải bay thẳng ngang chiến trường theo hướng ngẫu nhiên, tiếng ù từ xa, đường bay hiện trên bản đồ; bay tới
 *   điểm thả thì mở cửa dốc, hòm văng ra đuôi rồi bung dù. Mỗi lúc chỉ 1 hòm dù trên bản đồ
 * - 11 hòm tiếp tế cố định trên mặt đất (hồi máu, đạn, tăng tốc độ), nhặt xong xuất hiện lại
 * - Mô hình 3D, dù bạt quân sự, hiệu ứng khói màu định vị
 */
class SupplyManager {
  constructor(game) {
    this.game = game;
    this.airdrop = null;
    this.flights = [];        // máy bay đang trên trời (chiếc vừa thả hòm vẫn bay nốt ra khỏi bản đồ)
    this.airdropTimer = SupplyManager.firstGap();
    this.supplyCrates = [];
    this.matchT = 0;          // thời gian trận (s) — trần số hòm tiền (Equipment.AIRDROP_CASH)
    this.cashDrops = 0;
  }

  // Hàng máy bay chở (Equipment.airdropCargo bốc lúc máy bay bay vào): màu + tên trên bản đồ, la bàn, nhật ký
  static get CARGO() {
    return {
      AMMO: { name: 'ĐẠN DƯỢC', col: '#e0675c' },
      GEAR: { name: 'TRANG BỊ', col: '#79b8e0' },
      CASH: { name: 'TIỀN', col: '#f2c94c' }
    };
  }
  static cargoLabel(k, n) {
    const C = SupplyManager.CARGO[k];
    return C ? (k === 'CASH' ? `${C.name} ${n} BẠC` : C.name) : 'HÒM THẢ DÙ';
  }

  // NHỊP THẢ DÙ (chống lạm phát Bạc, giữ cảm giác khan hiếm): giờ máy bay bay vào ngẫu nhiên để không canh giờ được.
  // Chiếc đầu 30–50 s sau khi vào trận (máy chủ chặn < 25 s: AIRDROP_FIRST_MS); hòm có chủ thì chờ 35–60 s mới có
  // chiếc kế. 1 vòng ~ chờ 47 + bay tới điểm thả 18–37 + rơi 8 + tranh hòm ~20 s ≈ 100 s -> trận 10 phút ~6 hòm cho
  // cả 2 phe (trước: 6 s chờ, ~10 hòm). Mỗi lúc chỉ 1 hòm trên bản đồ
  static firstGap() { return 30 + Math.random() * 20; }
  static nextGap() { return 35 + Math.random() * 25; }

  static get PLANE_SPEED() { return 420; }  // ~52 m/s theo tỉ lệ tốc độ xe trong game: máy bay vận tải bay chậm lúc thả hàng
  static get CRATE_DRAG() { return 1.4; }   // hằng số thời gian (s): hòm mất đà ngang sau khi rời máy bay
  static get PLANE_TAIL() { return 100; }   // cửa dốc cách giữa thân

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
    if (d.e === 'drop') this.spawnAirdrop(d.x, d.z, d.a, d.k, d.n);
    else if (d.e === 'loot') {
      // máy này chạy chậm hơn chủ phòng, máy bay chưa kịp thả mà hòm đã có chủ: thả ngay để không sót hòm trên bản đồ
      for (const f of this.flights) if (!f.released) this.releaseCrate(f);
      const u = unitOf(d.u); if (u) this.collectAirdrop(u, d.r);
    }
    else if (d.e === 'take') { const c = this.supplyCrates[d.c], u = unitOf(d.u); if (c && u) this.takeCrate(c, u); }
    else if (d.e === 'respawn') { const c = this.supplyCrates[d.c]; if (c) this.respawnCrate(c); }
  }

  // Chọn điểm thả + hướng bay + hàng chở, cho máy bay vào (chủ phòng chốt rồi báo đi, các máy khác bay đúng đường đó)
  spawnAirdrop(px, pz, heading, kind, cash) {
    if (this.airdrop) {
      if (this.airdrop.mesh) this.game.scene.remove(this.airdrop.mesh);
      this.airdrop = null;
    }

    let dropX = px, dropZ = pz;
    if (typeof heading !== 'number') heading = Math.random() * Math.PI * 2;
    if (typeof dropX !== 'number' || typeof dropZ !== 'number') {
      const A = this.game.battleArea();
      const r = Math.random() * (A.r * 0.65);
      const angle = Math.random() * Math.PI * 2;
      dropX = A.x + Math.cos(angle) * r;
      dropZ = A.z + Math.sin(angle) * r;
      // không thả dù vào khu căn cứ vùng cấm bắn giữa 3 cứ điểm
      const LS = this.game.terrain && this.game.terrain.landmarkSet;
      if (LS && LS.outside) [dropX, dropZ] = LS.outside(dropX, dropZ, 60);
      // hàng chở: bốc theo tỉ lệ; chạm trần hòm tiền của trận thì chỉ còn đạn / trang bị (máy chủ cũng chặn)
      if (typeof Equipment !== 'undefined' && Equipment.airdropCargo) {
        const CA = Equipment.AIRDROP_CASH;
        const c = Equipment.airdropCargo(this.cashDrops >= 1 + Math.floor(this.matchT * 1000 / CA.everyMs));
        kind = c.k; cash = c.n;
      }
      this.broadcast({ e: 'drop', x: Math.round(dropX * 10) / 10, z: Math.round(dropZ * 10) / 10, a: Math.round(heading * 1000) / 1000, k: kind, n: cash || 0 });
    }
    if (kind === 'CASH') this.cashDrops++;
    this.startFlight(dropX, dropZ, heading, kind, kind === 'CASH' ? cash : 0);

    if (window.soundEngine) {
      window.soundEngine.playRadioChirp();
    }
    const what = SupplyManager.CARGO[kind] ? ` CHỞ ${SupplyManager.cargoLabel(kind, cash)}` : '';
    this.game.addCombatLog(`[[package]] MÁY BAY TIẾP TẾ${what} ĐANG BAY VÀO CHIẾN TRƯỜNG! XEM ĐƯỜNG BAY TRÊN BẢN ĐỒ!`, 'tip');
  }

  // Đường bay thẳng đi qua điểm thả, 2 đầu ở ngoài rìa bản đồ. s = quãng bay tính từ điểm thả (âm = chưa tới).
  // Bay ở 1 độ cao không đổi: trên điểm cao nhất dọc đường bay (không xuyên núi), đủ cao so với điểm thả
  startFlight(dropX, dropZ, heading, kind, cash) {
    const T = this.game.terrain, ux = Math.cos(heading), uz = Math.sin(heading), Rf = this.game.worldWidth * 0.72;
    const b = dropX * ux + dropZ * uz, disc = Math.sqrt(Math.max(0, b * b - (dropX * dropX + dropZ * dropZ - Rf * Rf)));
    const s0 = -b - disc, s1 = -b + disc, groundY = T.getElevationAt(dropX, dropZ);
    let top = -Infinity;
    for (let i = 0; i <= 48; i++) {
      const s = s0 + (s1 - s0) * i / 48;
      top = Math.max(top, T.getElevationAt(dropX + ux * s, dropZ + uz * s));
    }
    const y = Math.max(groundY + 900, top + 350);
    const P = CargoPlaneModel.build();
    P.group.rotation.y = -heading;   // mũi máy bay hướng +x
    P.group.position.set(dropX + ux * s0, y, dropZ + uz * s0);
    this.game.scene.add(P.group);
    this.flights.push({ plane: P, dropX, dropZ, ux, uz, s: s0, s0, s1, y, groundY, released: false, kind, cash,
      sRelease: SupplyManager.PLANE_TAIL - SupplyManager.PLANE_SPEED * SupplyManager.CRATE_DRAG });
  }

  // Hòm rời cửa dốc: giữ đà máy bay rồi mất dần, dừng đúng trên điểm thả; dù bung sau khoảng 1 s
  releaseCrate(f) {
    f.released = true;
    const V = SupplyManager.PLANE_SPEED, D = SupplyManager.CRATE_DRAG;
    // Túi hàng bạt kiểu A-22 trên đế gỗ + dù tròn ô liu (src/gameplay/supply_crate_model.js); đáy hòm ở y = -9
    const { group: airdropGroup, chute: parachuteGroup } = SupplyCrateModel.airdrop();
    airdropGroup.rotation.y = Math.random() * Math.PI * 2;
    parachuteGroup.scale.setScalar(0.12);

    // Định vị: không dùng cột sáng; tiếp đất thì ống khói đỏ bung cạnh hòm (emitSignalSmoke)
    const startY = f.y - 10;
    airdropGroup.position.set(f.dropX - f.ux * V * D, startY, f.dropZ - f.uz * V * D);
    this.game.scene.add(airdropGroup);

    this.airdrop = {
      mesh: airdropGroup,
      parachuteGroup: parachuteGroup,
      x: f.dropX,
      z: f.dropZ,
      ux: f.ux,
      uz: f.uz,
      y: startY,
      groundY: f.groundY,
      kind: f.kind,
      cash: f.cash || 0,
      fallT: 0,
      landed: false,
      collected: false,
      smokeAcc: 0,
      t: Math.random() * 10
    };
    this.game.addCombatLog(`[[package]] MÁY BAY ĐÃ THẢ HÒM ${SupplyManager.cargoLabel(f.kind, f.cash)}! HÃY TRANH ĐOẠT NGAY!`, 'tip');
  }

  updateFlights(dt) {
    const V = SupplyManager.PLANE_SPEED;
    let nearest = null, best = Infinity;
    const me = this.game.audioListener ? this.game.audioListener() : this.game.player;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i], P = f.plane;
      f.s += V * dt;
      const x = f.dropX + f.ux * f.s, z = f.dropZ + f.uz * f.s;
      P.group.position.set(x, f.y, z);
      for (const p of P.props) p.rotation.x += dt * 13;
      // cửa dốc mở trước khi tới điểm thả ~6 s, đóng lại sau khi thả ~4 s
      const R = f.sRelease, open = Math.min(Math.max(0, (f.s - (R - V * 6)) / (V * 2.5)), Math.max(0, ((R + V * 4) - f.s) / (V * 2.5)), 1);
      P.openRamp(open);
      if (!f.released && f.s >= R) this.releaseCrate(f);
      if (f.s >= f.s1) { this.removeFlight(i); continue; }
      const d = me ? Math.hypot(x - me.x, z - me.z) : 0;
      if (d < best) { best = d; nearest = { x, y: f.y, z, vx: f.ux * V, vz: f.uz * V, fade: Math.min(1, (f.s - f.s0) / (V * 5), (f.s1 - f.s) / (V * 5)) }; }
    }
    const SE = window.soundEngine;
    if (SE && SE.updateCargoPlane && (nearest || this._planeSound)) SE.updateCargoPlane(nearest);
    this._planeSound = !!nearest;
  }

  removeFlight(i) {
    const [f] = this.flights.splice(i, 1);
    if (f && f.plane.group.parent) f.plane.group.parent.remove(f.plane.group);
  }

  // Vẽ đường bay + máy bay lên bản đồ (hud_controller, radar_minimap, tactical_map). toScreen(x, z) -> { x, y }.
  // Quãng còn lại nét đứt kèm mũi tên hướng bay, quãng đã bay mờ; điểm thả chỉ biết khi hòm rời máy bay
  drawFlightsOnMap(ctx, toScreen, opts = {}) {
    const H = this.game.worldWidth / 2, col = opts.color || '#e7a63a', sz = opts.size || 6;
    for (const f of this.flights) {
      // cắt đường bay theo khung bản đồ
      let a = -Infinity, b = Infinity;
      for (const [o, u] of [[f.dropX, f.ux], [f.dropZ, f.uz]]) {
        if (Math.abs(u) < 1e-6) continue;
        const p = (-H - o) / u, q = (H - o) / u;
        a = Math.max(a, Math.min(p, q)); b = Math.min(b, Math.max(p, q));
      }
      if (!(a < b) || f.s > b) continue;
      const at = s => toScreen(f.dropX + f.ux * s, f.dropZ + f.uz * s);
      const cur = Math.max(a, Math.min(b, f.s)), pa = at(a), pc = at(cur), pb = at(b);
      ctx.save();
      ctx.lineWidth = opts.width || 1.4;
      if (cur > a) {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pc.x, pc.y); ctx.stroke();
      }
      ctx.globalAlpha = f.released ? 0.45 : 0.9;
      ctx.strokeStyle = col; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(pc.x, pc.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.setLineDash([]);
      // mũi tên chỉ hướng bay dọc quãng còn lại
      const e = at(f.s + 100), dl = Math.hypot(e.x - pc.x, e.y - pc.y) || 1, ex = (e.x - pc.x) / dl, ey = (e.y - pc.y) / dl;
      for (let s = cur + 1600; s < b; s += 1600) {
        const c = at(s), w = sz * 0.6;
        ctx.beginPath();
        ctx.moveTo(c.x - ex * w - ey * w, c.y - ey * w + ex * w);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(c.x - ex * w + ey * w, c.y - ey * w - ex * w);
        ctx.stroke();
      }
      if (f.s >= a) {
        // dáng máy bay nhìn từ trên: thân, cánh, đuôi; viền tối cho nổi trên nền bản đồ
        ctx.globalAlpha = 1;
        ctx.translate(pc.x, pc.y);
        ctx.transform(ex, ey, -ey, ex, 0, 0);
        const shape = () => {
          ctx.beginPath();
          ctx.moveTo(-sz, 0); ctx.lineTo(sz * 1.1, 0);
          ctx.moveTo(sz * 0.25, -sz * 1.1); ctx.lineTo(sz * 0.25, sz * 1.1);
          ctx.moveTo(-sz, -sz * 0.45); ctx.lineTo(-sz, sz * 0.45);
          ctx.stroke();
        };
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3.6; shape();
        ctx.strokeStyle = '#fff2d2'; ctx.lineWidth = 1.7; shape();
      }
      ctx.restore();
      // hàng đang chở: ký hiệu bám cạnh máy bay tới lúc thả (rồi chuyển sang chỗ hòm)
      if (f.s >= a && !f.released && f.kind) this.drawCargoIcon(ctx, pc.x + sz * 1.7, pc.y - sz * 1.7, f.kind, sz * 0.85);
    }
  }

  // Ký hiệu hàng thả dù trên bản đồ: đĩa màu theo loại (SupplyManager.CARGO) + hình đầu đạn / khiên / chữ $.
  // label: chữ tên hàng phía trên (bản đồ lớn, minimap góc)
  drawCargoIcon(ctx, x, y, kind, r, label) {
    const C = SupplyManager.CARGO[kind], col = C ? C.col : '#e7a63a', ink = '#1d1a14';
    ctx.save();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    if (kind === 'AMMO') {
      // 2 viên đạn đứng: thân chữ nhật + đầu nhọn
      for (const dx of [-0.32, 0.32]) {
        const bx = x + dx * r, w = r * 0.2;
        ctx.beginPath();
        ctx.moveTo(bx - w, y + r * 0.55); ctx.lineTo(bx - w, y - r * 0.1);
        ctx.quadraticCurveTo(bx - w, y - r * 0.55, bx, y - r * 0.62);
        ctx.quadraticCurveTo(bx + w, y - r * 0.55, bx + w, y - r * 0.1);
        ctx.lineTo(bx + w, y + r * 0.55); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'GEAR') {
      // khiên
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.62); ctx.lineTo(x + r * 0.5, y - r * 0.42); ctx.lineTo(x + r * 0.46, y + r * 0.05);
      ctx.quadraticCurveTo(x + r * 0.36, y + r * 0.45, x, y + r * 0.66);
      ctx.quadraticCurveTo(x - r * 0.36, y + r * 0.45, x - r * 0.46, y + r * 0.05);
      ctx.lineTo(x - r * 0.5, y - r * 0.42); ctx.closePath(); ctx.fill();
    } else if (kind === 'CASH') {
      ctx.font = `bold ${Math.round(r * 1.5)}px Chakra Petch, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', x, y + r * 0.08);
    } else {
      ctx.fillRect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8);
    }
    if (label) {
      ctx.font = `bold ${Math.max(8, Math.round(r * 1.1))}px Chakra Petch, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(label, x, y - r - 3);
      ctx.fillStyle = col; ctx.fillText(label, x, y - r - 3);
    }
    ctx.restore();
  }

  updateAirdrop(dt) {
    this.matchT += dt;
    this.updateFlights(dt);
    if (!this.airdrop) {
      if (this.flights.some(f => !f.released)) return;   // máy bay đang bay tới điểm thả
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
      const D = SupplyManager.CRATE_DRAG, V = SupplyManager.PLANE_SPEED, ft = (drop.fallT += dt);
      // rơi nhanh dần tới tốc độ dù ~9 m/s; đà ngang của máy bay mất dần, hòm dừng trên điểm thả
      drop.y -= 75 * (1 - Math.exp(-ft / 1.1)) * dt;
      const back = V * D * Math.exp(-ft / D);
      drop.mesh.position.set(drop.x - drop.ux * back, drop.y, drop.z - drop.uz * back);
      // dù bó gọn lúc đầu, căng phồng trong khoảng 1 s
      const chuteK = Math.min(1, Math.max(0, (ft - 0.7) / 1.1));
      drop.parachuteGroup.scale.setScalar(0.12 + 0.88 * chuteK * chuteK * (3 - 2 * chuteK));
      drop.t += dt;
      drop.mesh.rotation.x = Math.sin(drop.t * 0.9) * 0.05;
      drop.mesh.rotation.z = Math.sin(drop.t * 0.7 + 1.3) * 0.06;

      if (drop.y <= drop.groundY + 9) {
        drop.y = drop.groundY + 9;
        drop.mesh.position.set(drop.x, drop.y, drop.z);
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
        this.game.addCombatLog(`[[package]] HÒM ${SupplyManager.cargoLabel(drop.kind, drop.cash)} ĐÃ TIẾP ĐẤT! TRANH ĐOẠT NGAY!`, 'tip');
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
            // 0: Nạp đầy mọi ô đạn, 1: Đạn Nổ Mạnh (HE, chỉ còn từ chủ phòng bản cũ), 2: Giáp Phản Ứng Nổ, 3: Nâng cấp tăng máu
            // 1 đơn vị, 4: Động cơ tăng áp tốc độ, 5: bao tiền — theo hàng máy bay chở (đạn dược 0, trang bị 2-4, tiền 5)
            const R = Math.random(), K = drop.kind;
            const lootRoll = K === 'AMMO' ? 0 : K === 'GEAR' ? 2 + Math.floor(R * 3) : K === 'CASH' ? 5 : Math.floor(R * 5);
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
    const labels = ['NẠP ĐẦY MỌI Ô ĐẠN!', '2 VIÊN ĐẠN NỔ MẠNH (BÁN KÍNH NỔ 120M)!', 'GIÁP PHẢN ỨNG NỔ (PHÁ HỦY 1 PHÁT RPG / ĐẠN PHÁO TRÚNG THẲNG)!',
      'HỘP SINH LỰC CHIẾN ĐẤU (TĂNG THANH MÁU VÀ HỒI ĐẦY MÁU)!', 'ĐỘNG CƠ TĂNG ÁP TỐC ĐỘ (+65% TỐC ĐỘ DI CHUYỂN TRONG 20S)!',
      `BAO TIỀN ${drop.cash} BẠC (CỘNG CUỐI TRẬN)!`];
    let lootMsg = labels[lootRoll] || labels[0], ammoTail = '';
    // hòm thả dù luôn kèm kiện đạn: nạp đầy cơ số đạn mang theo (AmmoLoad)
    if (this.ownsUnit(unit) && typeof AmmoLoad !== 'undefined') {
      const add = AmmoLoad.resupply(unit, 1);
      if (add && unit.isPlayer) ammoTail = ` · NẠP ĐẦY CƠ SỐ (${add.toUpperCase()})`;
    }
    if (this.ownsUnit(unit)) {
      if (lootRoll === 0) {
        // hòm ĐẠN DƯỢC: mọi ô đạn đặc chủng / khói về đúng số lúc xuất kích (Equipment.refillLife), lính bộ binh nạp đủ
        // cơ số vũ khí đang mang (InfantryMatch.onCrate) — cơ số đạn thường đã nạp đầy ở trên
        if (unit.tankType === 'INFANTRY') {
          if (this.game.infantry && this.game.infantry.onCrate) this.game.infantry.onCrate(unit, { type: 'AMMO' });
        } else if (typeof Equipment !== 'undefined' && Equipment.refillLife) {
          const got = Equipment.refillLife(unit), parts = [];
          for (const k in got) parts.push(`+${got[k]} ${k === 'SMOKE' ? 'KHÓI' : k.replace(/_/g, ' ')}`);
          if (parts.length) lootMsg = `NẠP ĐẦY MỌI Ô ĐẠN (${parts.join(', ')})!`;
        }
      } else if (lootRoll === 1) {
        unit.heAmmoCount = (unit.heAmmoCount || 0) + 2;
        if (unit.isPlayer) unit.selectedAmmo = 'HE';
      } else if (lootRoll === 2) {
        unit.hasReactiveArmor = true;
      } else if (lootRoll === 3) {
        unit.maxHp += 1;
        unit.hp = unit.maxHp;
        lootMsg = `HỘP SINH LỰC CHIẾN ĐẤU (TĂNG THANH MÁU LÊN ${unit.maxHp} VÀ HỒI ĐẦY MÁU)!`;
      } else if (lootRoll === 4) {
        unit.speedBoostTimer = 20.0; // Tăng tốc độ di chuyển cực bốc trong 20 giây
      }
    }
    lootMsg += ammoTail;
    if (unit.isPlayer) {
      this.game._playerAirdrops = (this.game._playerAirdrops || 0) + 1;   // thưởng Bạc cuối trận (Equipment.silverFor)
      if (lootRoll === 5) this.game._playerAirdropCash = (this.game._playerAirdropCash || 0) + drop.cash;   // máy chủ đối chiếu (noteAirdrop)
      const bonus = typeof Equipment !== 'undefined' && Equipment.AIRDROP_SILVER ? ` · +${Equipment.AIRDROP_SILVER} BẠC CUỐI TRẬN` : '';
      this.game.addCombatLog(`[[gift]] BẠN ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}${bonus}`, 'tip');
      if (window.soundEngine) (window.soundEngine.playSupplyPickup || window.soundEngine.playReloadDone).call(window.soundEngine);
      this.game.updateAmmoUI();
    } else if ((typeof TeamIntel === 'undefined' || !this.game.player || unit.team === this.game.player.team || TeamIntel.knows(this.game.player, unit))) {
      this.game.addCombatLog(`[[alert-triangle]] ${unit.name} ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}`, 'alert');
    }
    this.airdrop = null;
    this.airdropTimer = SupplyManager.nextGap();
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
    // trận mới: dọn máy bay trận trước
    while (this.flights.length) this.removeFlight(this.flights.length - 1);
    this.matchT = 0; this.cashDrops = 0;
    this.airdropTimer = SupplyManager.firstGap();

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
      } else if (unit.tankType === 'INFANTRY') {
        // lính bộ binh: nạp lại đủ cơ số vũ khí đang mang (InfantryMatch.onCrate; chỉ máy có quyền với lính)
        if (own && this.game.infantry && this.game.infantry.onCrate) this.game.infantry.onCrate(unit, crate);
        rewardMsg = 'NẠP ĐỦ CƠ SỐ ĐẠN CHO LÍNH!';
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
