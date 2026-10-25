// =====================================================================================================================
// ĐIỂM TIẾP TẾ HẬU PHƯƠNG (SupplyDepot) — mỗi phe 1 điểm sau khu xuất kích của mình
// Xe tải 6x6 thùng lửng đang dỡ đạn (Landmarks milTruck 'cargo'), 2 pallet hòm đạn + 1 pallet can xăng dưới lưới nguỵ
// trang, ụ bao cát thấp quay về phía địch, vài phuy, biển "AMMO POINT" (chữ tiếng Anh), cọc sọc đánh dấu ranh vùng nạp.
// Xe phe mình dừng hẳn trong vùng (bán kính R) -> nạp cơ số đạn nhanh (AmmoLoad, nhanh hơn chuyền đạn với đồng đội ~4 lần).
// Vị trí chọn tất định từ địa hình + thế xuất phát (không dùng số ngẫu nhiên) -> mọi máy trong phòng ra cùng một chỗ.
// Xe tải / đống pallet là khối đặc (xe húc không qua, đạn nổ vào như vào tường) nhưng không bị phá — hậu cần luôn có.
// =====================================================================================================================
const SupplyDepot = (() => {
  const R = 70;                 // bán kính vùng nạp đạn (từ tâm điểm)
  const RATE = 4;               // nạp nhanh gấp mấy lần chuyền đạn cạnh đồng đội
  const STILL = 3;

  // điểm mong muốn: giữa mép sau khu xuất kích của phe (xa địch), đô thị: rìa ngoại ô phía phe như pickRandomSpawn
  function preferred(game, team) {
    const T = game.terrain, S = typeof MapGen !== 'undefined' && MapGen.SPAWN, side = team === 'BLUE' ? 1 : -1;
    const A = game.battleArea ? game.battleArea() : { x: 0, z: 0, r: game.worldWidth * 0.48 };
    if (T && T.mapType === 'URBAN' || !S) {
      const H = game.worldWidth / 2, lim = H - 220, zr = Math.max(150, A.r - 160);
      const minR = Math.max(540, zr * 0.65), maxR = Math.min(lim - 80, zr * 0.95);
      return { x: A.x, z: A.z + side * (minR * 0.35 + maxR * 0.65) };
    }
    const blue = { z0: S.blue.z0, z1: S.blue.z1 }, zc = blue.z0 + (blue.z1 - blue.z0) * 0.78;
    return { x: 0, z: side * zc };
  }

  // chỗ đặt được: đất phẳng, không nước / nhà / cứ điểm, cả vòng quanh ~45 đều đặt xe được, không đè xe đang đỗ
  function siteOk(game, x, z, units, trees) {
    if (!game.isSpawnGroundClear(x, z)) return false;
    for (const t of trees || []) if (Math.hypot(t.x - x, t.z - z) < R + 6) return false;   // cây mọc xuyên xe tải / lưới
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      if (!game.isSpawnGroundClear(x + Math.cos(a) * 42, z + Math.sin(a) * 42)) return false;
    }
    const T = game.terrain;
    if (T && T.groundAtRaw) {
      const e = 30, s = Math.hypot(T.groundAtRaw(x + e, z) - T.groundAtRaw(x - e, z), T.groundAtRaw(x, z + e) - T.groundAtRaw(x, z - e)) / (2 * e);
      if (s > 0.14) return false;
    }
    for (const u of units || []) if (u && Math.hypot(u.x - x, u.z - z) < 55) return false;
    return true;
  }
  function pickSite(game, team) {
    const p = preferred(game, team), lim = game.worldWidth / 2 - 240;
    // cây quanh vùng tìm chỗ (lọc 1 lần — bản đồ có hàng chục nghìn cây)
    const M = game.terrain && game.terrain.map, trees = ((M && M.trees) || []).filter(t => Math.abs(t.x - p.x) < 700 && Math.abs(t.z - p.z) < 700);
    // xoắn ốc tất định quanh điểm mong muốn
    for (let ring = 0; ring <= 14; ring++) {
      const n = ring ? ring * 8 : 1;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + ring * 0.37, r = ring * 38;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        if (siteOk(game, x, z, game.units, trees)) return { x, z };
      }
    }
    return p;
  }

  // ------------------------------------------------------------------ hình
  const flagMat = {};
  function teamFlag(team) {
    return flagMat[team] || (flagMat[team] = new THREE.MeshStandardMaterial({ color: team === 'BLUE' ? 0x3a4f6c : 0x74392f, roughness: 0.97, side: THREE.DoubleSide }));
  }
  let signMat = null;
  function signMaterial(api) {
    if (signMat) return signMat;
    const tex = api.signTex('depot_ammo_point', ['AMMO POINT', 'STOP INSIDE MARKERS TO REARM'], { w: 1024, h: 256, bg: '#dcd8c8', fg: '#1d1d1d', fg2: '#7a1d14' });
    signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    return signMat;
  }

  /**
   * Dựng điểm tiếp tế tại d = { x, z, team, rot } (rot: góc quay nhóm — trục -z cục bộ quay về phía địch).
   * Trả về nhóm THREE + hộp va chạm thế giới
   */
  function build(game, d) {
    const L = typeof Landmarks !== 'undefined' && Landmarks.api;
    const T = game.terrain, G = T.getElevationAt(d.x, d.z);
    const grp = new THREE.Group();
    grp.position.set(d.x, G, d.z);
    grp.rotation.y = d.rot;
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    const W = (f, r) => [d.x + f * c + r * s, d.z - f * s + r * c];
    const yAt = (f, r) => { const [x, z] = W(f, r); return T.getElevationAt(x, z) - G; };
    const boxes = [];
    const solid = (f, r, hf, hr, y1, mat) => { const [cx, cz] = W(f, r); boxes.push({ cx, cz, ux: c, uz: -s, hu: hf, hv: hr, y0: G - 6, y1: G + y1, mat: mat || 'metal' }); };
    if (!L) return { grp, boxes };
    const M4 = L.M4;

    // xe tải: đậu dọc theo trục f, nghiêng theo mặt đất dưới 3 cầu
    {
      const K = new L.Kit({ x: 0, z: 0, fx: 1, fz: 0, G: 0 }, () => 0);
      L.milTruck(K, M4(0, 0, 0), 'cargo', { intact: true });
      const tg = new THREE.Group();
      K.build(tg);
      const yF = (yAt(20, -7) + yAt(20, 7)) / 2, yB = (yAt(-21, -7) + yAt(-21, 7)) / 2;
      const yL = (yAt(20, -7.6) + yAt(-21, -7.6)) / 2, yR = (yAt(20, 7.6) + yAt(-21, 7.6)) / 2;
      tg.position.set(2, (yF + yB) / 2 - 0.3, 0);
      tg.rotation.order = 'YXZ';
      tg.rotation.z = Math.atan2(yF - yB, 41);
      tg.rotation.x = -Math.atan2(yR - yL, 15.2);
      grp.add(tg);
      solid(0, 0, 31, 10, 28);
    }

    // đồ dưới đất (khung cục bộ nhóm, độ cao theo mặt đất từng chỗ)
    const K = new L.Kit({ x: 0, z: 0, fx: 1, fz: 0, G: 0 }, () => 0);
    // lưới nguỵ trang trùm đống pallet phía sau xe (xe che phía địch)
    L.camoNet(K, M4(-6, yAt(-6, 30), 30), 58, 26, 15, 2.6);
    // ụ bao cát thấp chạy dọc mạn xe phía địch + 1 khúc gập đầu xe
    L.sandbags(K, -40, -19, 30, -19, 2, yAt(-5, -19));
    L.sandbags(K, 30, -19, 40, -9, 2, yAt(35, -14));
    // phuy xăng / dầu cạnh đuôi xe, 1 phuy đổ nằm
    for (const [f, r, m] of [[-40, 6, 'olive'], [-40, 11.5, 'oliveDark'], [-45, 8.6, 'olive']]) L.drum(K, f, r, m, yAt(f, r));
    {
      const f = -44, r = 17, y = yAt(f, r);
      K.add('olive', new THREE.CylinderGeometry(2.4, 2.4, 7.2, 14), M4(f, y + 2.4, r, Math.PI / 2, 0.6, 0));
    }
    // biển AMMO POINT trên 2 cột ở lối vào (mặt quay về phía địch / hướng xe chạy tới)
    {
      const f = 46, r = -26, y = yAt(f, r);
      for (const dx of [-7, 7]) K.add('steelDark', new THREE.CylinderGeometry(0.35, 0.4, 12, 6), M4(f + dx, y + 6, r));
      K.add('wood', new THREE.BoxGeometry(17, 4.8, 0.4), M4(f, y + 10, r + 0.25));
      K.add(signMaterial(L), new THREE.PlaneGeometry(16.4, 4.1), M4(f, y + 10, r - 0.02, 0, Math.PI, 0));
    }
    // cọc đánh dấu ranh vùng nạp: cọc thép sơn sọc vàng đen, cắm lệch đều quanh vòng tròn
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + 0.2, f = Math.cos(a) * (R - 4), r = Math.sin(a) * (R - 4), y = yAt(f, r);
      K.add('hazard', new THREE.CylinderGeometry(0.45, 0.5, 6.5, 6), M4(f, y + 3.1, r, (i % 3 - 1) * 0.06, 0, (i % 2 - 0.5) * 0.08));
    }
    // cột cờ phe cạnh lưới nguỵ trang
    {
      const f = 26, r = 18, y = yAt(f, r);
      K.add('steelGray', new THREE.CylinderGeometry(0.25, 0.32, 26, 6), M4(f, y + 13, r));
      const fg = new THREE.PlaneGeometry(9, 5.4, 6, 2), P = fg.attributes.position;
      for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin((P.getX(i) + 4.5) * 0.7) * 0.6 * (P.getX(i) + 4.5) / 9);
      fg.computeVertexNormals();
      K.add(teamFlag(d.team), fg, M4(f + 4.6, y + 23, r));
    }
    K.build(grp);

    // pallet hòm đạn / can xăng dưới lưới (mô hình hòm tiếp tế dùng chung)
    if (typeof SupplyCrateModel !== 'undefined') {
      for (const [f, r, ry, type] of [[-22, 29, 0.08, 'AMMO'], [-3, 31, -0.05, 'AMMO'], [16, 28, 0.14, 'SPEED']]) {
        const m = SupplyCrateModel.crate(type);
        m.position.set(f, yAt(f, r) - 0.2, r);
        m.rotation.y = ry;
        grp.add(m);
      }
      solid(-3, 29.5, 28, 8.5, 12, 'wood');
    }
    grp.traverse(o => { if (o.isMesh) o.matrixAutoUpdate = true; });
    return { grp, boxes };
  }

  // ------------------------------------------------------------------ vòng đời trong trận
  function clear(game) {
    for (const d of game.supplyDepots || []) if (d.grp && d.grp.parent) d.grp.parent.remove(d.grp);
    game.supplyDepots = [];
    if (game.terrain) game.terrain.depotSet = null;
  }

  /** Trận mới: dựng điểm tiếp tế 2 phe (gọi sau khi xe đã xếp chỗ xuất phát) */
  function init(game) {
    clear(game);
    // lúc khởi động game (constructor gọi initSupplyCrates) địa hình chưa có map -> chưa dựng; trận thật gọi lại sau khi
    // xếp xe. Lỗi gì ở đây cũng không được chặn khởi động game
    const T = game.terrain;
    if (!T || !T.map || !game.scene || typeof THREE === 'undefined' || typeof game.isSpawnGroundClear !== 'function') return;
    let A;
    try { A = game.battleArea ? game.battleArea() : { x: 0, z: 0 }; } catch (e) { A = { x: 0, z: 0 }; }
    for (const team of ['BLUE', 'RED']) {
      let p;
      try { p = pickSite(game, team); } catch (e) { console.warn('[DEPOT] Không chọn được chỗ đặt điểm tiếp tế', e); continue; }
      // trục -z cục bộ hướng về giữa trận (phía địch): xe tải nằm ngang che đống pallet phía sau
      const dx = A.x - p.x, dz = A.z - p.z, rot = Math.atan2(-dx, -dz);
      const d = { team, x: p.x, z: p.z, rot, R };
      try {
        const b = build(game, d);
        d.grp = b.grp; d.boxes = b.boxes;
        game.scene.add(d.grp);
      } catch (e) { console.warn('[DEPOT] Không dựng được điểm tiếp tế', e); d.boxes = []; }
      game.supplyDepots.push(d);
      // bot tìm đường né xe tải / pallet
      if (typeof Navigator !== 'undefined' && Navigator.invalidate) Navigator.invalidate(game.terrain, { x0: p.x - 60, z0: p.z - 60, x1: p.x + 60, z1: p.z + 60 });
    }
    game.terrain.depotSet = depotSet(game.supplyDepots);
  }

  // giao diện va chạm cho địa hình (terrain.js vehicleBoxes / checkHorseshoeCollision, navigator.js)
  function depotSet(list) {
    return {
      list,
      near(x, z, r) { return list.some(d => Math.hypot(d.x - x, d.z - z) < (r || 0) + d.R); },
      vehicleBoxes(x, z, reach, out) {
        for (const d of list) {
          if (Math.abs(x - d.x) > d.R + reach || Math.abs(z - d.z) > d.R + reach) continue;
          for (const q of d.boxes) out.push(q);
        }
        return out;
      },
      navBoxes() { const o = []; for (const d of list) o.push(...d.boxes); return o; },
      hitTest(x, y, z) {
        for (const d of list) {
          if (Math.abs(x - d.x) > d.R || Math.abs(z - d.z) > d.R) continue;
          for (const q of d.boxes) {
            if (y < q.y0 || y > q.y1) continue;
            const dx = x - q.cx, dz = z - q.cz, u = dx * q.ux + dz * q.uz, v = -dx * q.uz + dz * q.ux;
            if (u > q.hu || u < -q.hu || v > q.hv || v < -q.hv) continue;
            const du = q.hu - Math.abs(u), dv = q.hv - Math.abs(v), dy = q.y1 - y;
            let normal;
            if (dy < du && dy < dv) normal = { x: 0, y: 1, z: 0 };
            else if (du < dv) { const sg = Math.sign(u) || 1; normal = { x: q.ux * sg, y: 0, z: q.uz * sg }; }
            else { const sg = Math.sign(v) || 1; normal = { x: -q.uz * sg, y: 0, z: q.ux * sg }; }
            return { hit: true, type: 'WALL', depot: d, normal, x, y, z };
          }
        }
        return null;
      }
    };
  }

  /** Điểm tiếp tế phe mình mà xe đang đứng trong vùng (null nếu không) */
  function at(game, u) {
    for (const d of (game && game.supplyDepots) || []) if (d.team === u.team && Math.hypot(u.x - d.x, u.z - d.z) < d.R) return d;
    return null;
  }
  /** Điểm tiếp tế của phe (bot tìm về) */
  function of(game, team) { return ((game && game.supplyDepots) || []).find(d => d.team === team) || null; }

  // đánh dấu trên bản đồ / radar: ô vuông màu phe + chữ AMMO, vòng nét đứt vùng nạp
  function drawOnMap(ctx, game, toScreen, scale, opts = {}) {
    for (const d of (game && game.supplyDepots) || []) {
      const p = toScreen(d.x, d.z);
      if (opts.inside && !opts.inside(d.x, d.z)) continue;
      const mine = game.player && game.player.team === d.team;
      const col = d.team === 'BLUE' ? '#5aa0ff' : '#ff6a5a';
      ctx.save();
      ctx.globalAlpha = mine ? 1 : 0.55;
      if (scale) {
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(5, d.R * scale), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      const sz = opts.size || 7;
      ctx.fillStyle = 'rgba(12,16,20,0.85)'; ctx.fillRect(p.x - sz, p.y - sz * 0.7, sz * 2, sz * 1.4);
      ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.strokeRect(p.x - sz, p.y - sz * 0.7, sz * 2, sz * 1.4);
      // 3 viên đạn đứng
      ctx.fillStyle = col;
      for (const k of [-1, 0, 1]) {
        const x = p.x + k * sz * 0.55;
        ctx.fillRect(x - sz * 0.14, p.y - sz * 0.15, sz * 0.28, sz * 0.62);
        ctx.beginPath(); ctx.moveTo(x - sz * 0.14, p.y - sz * 0.15); ctx.lineTo(x, p.y - sz * 0.5); ctx.lineTo(x + sz * 0.14, p.y - sz * 0.15); ctx.fill();
      }
      if (opts.labels) {
        ctx.font = `bold ${Math.round(sz * 1.25)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = col; ctx.fillText('AMMO', p.x, p.y + sz * 0.9);
      }
      ctx.restore();
    }
  }

  return { R, RATE, STILL, init, clear, at, of, drawOnMap, pickSite, build };
})();
if (typeof window !== 'undefined') window.SupplyDepot = SupplyDepot;
