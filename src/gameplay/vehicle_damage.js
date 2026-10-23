/**
 * HỆ THỐNG HƯ HẠI THIẾT GIÁP THEO TỪNG DÒNG XE
 * - Giáp theo cấp (nặng / trung / nhẹ / xe tải) + giáp theo hướng (mũi dày, đuôi & nóc mỏng)
 * - Bộ phận rời bị bắn văng thành mảnh vỡ có vật lý: váy xích, module giáp, gạch ERA, lồng chống RPG,
 *   đèn, gương, thùng đồ, ống khói, kính ngắm, ăng-ten, radar, ống phóng tên lửa...
 * - Hỏng hóc cơ khí làm giảm chỉ số: xịt lốp (xe bánh lốp), đứt xích (xe xích), hỏng động cơ,
 *   kẹt vòng quay tháp, hư pháo, đứt máng tiếp đạn, vỡ kính ngắm, mất radar trinh sát, hỏng thủy lực càng...
 * Mỗi dòng xe một kiểu hỏng riêng theo cấu tạo của nó.
 */
const VehicleDamage = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);

  // Cấp giáp + hệ số sát thương theo mặt bị bắn
  const ARMOR = {
    ALL_ROUNDER: { cls: 'heavy', drive: 'tracks', face: { front: 0.7, side: 1.0, rear: 1.35, top: 1.25 } },
    GATLING: { cls: 'medium', drive: 'tracks', face: { front: 0.8, side: 1.0, rear: 1.25, top: 1.2 } },
    ARTILLERY: { cls: 'soft', drive: 'wheels', face: { front: 1.0, side: 1.05, rear: 1.1, top: 1.1 } },
    SCOUT: { cls: 'light', drive: 'wheels', face: { front: 0.95, side: 1.0, rear: 1.1, top: 1.05 } }
  };

  // Khoang động cơ (hệ tọa độ group xe)
  const ENGINE = {
    ALL_ROUNDER: [0, 13.6, 21], GATLING: [4, 13, -10], ARTILLERY: [0, 15, -15], SCOUT: [0, 10.5, -14]
  };

  // Loại đạn -> nhóm xuyên phá
  // Khóa tra độ xuyên / nhóm đạn của 1 phát: cùng mã đạn nhưng khác súng thì khác đạn thật
  //  - 'INCENDIARY' của xe trinh sát là đạn xuyên-cháy 12.7mm (không phải đạn cháy 30mm của xe 6 nòng)
  //  - quả lựu 40mm (gl40) bay theo hệ đạn 30mm nhưng là lựu nổ lõm-mảnh, không phải đạn 30mm xuyên giáp
  //  - đạn nổ lõm 2 tầng của pháo tăng (đạn cao cấp heat_tandem, mã 'NORMAL'): là đầu nổ lõm thật -> 'HEAT120' (nhóm 'heat':
  //    khiên chữ V cách quãng, lồng / gạch nổ tính như đầu nổ lõm; độ xuyên vẫn lấy PEN_HEAT_TANDEM trong armorOutcome)
  function penKey(opts) {
    if (opts.gl40) return 'GL40';
    if (opts.ammo === 'NORMAL' && !opts.heavy && typeof Equipment !== 'undefined' && Equipment.isTandem && Equipment.isTandem(opts.shooter, 'NORMAL')) return 'HEAT120';
    if (opts.ammo === 'INCENDIARY' && opts.shooter && opts.shooter.tankType === 'SCOUT') return 'SCOUT_INCENDIARY';
    return opts.ammo;
  }
  function ammoClass(ammo) {
    if (ammo === 'SCOUT_BULLET' || ammo === 'SCOUT_INCENDIARY') return 'small';
    if (ammo === 'GL40') return 'cannon';
    if (ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY') return 'cannon';
    if (ammo === 'AP') return 'kinetic';
    if (ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE' || ammo === 'HEAT120') return 'heat';
    return 'blast';
  }
  // Mũi tên lõi urani nghèo xuyên vào khoang: hệ số khả năng gây cháy so với lõi vonfram
  const DU_FIRE = 1.5;

  // Hệ số sát thương: nhóm đạn x cấp giáp (đạn súng máy gần như vô hại với xe tăng chủ lực)
  const VS = {
    small: { heavy: 0.15, medium: 0.35, light: 1.0, soft: 1.15 },
    cannon: { heavy: 0.2, medium: 0.6, light: 1.15, soft: 1.25 },   // 30mm gần như không xuyên giáp chính diện xe tăng
    kinetic: { heavy: 1.0, medium: 1.05, light: 1.0, soft: 1.0 },
    heat: { heavy: 1.0, medium: 1.0, light: 1.05, soft: 1.1 },
    // sức ép / mảnh nổ gần: giáp dày gần như miễn nhiễm (nổ lan HE 120mm sát xe tăng ~0.16 máu — không hơn 1 phát trúng
    // thẳng không xuyên vào sườn, trượt không được lợi hơn trúng)
    blast: { heavy: 0.1, medium: 0.25, light: 1.1, soft: 1.25 },
    // lựu pháo 155mm (~7-11 kg thuốc nổ) nổ sát xe giáp dày: sức ép & mảnh lớn vẫn phá xích, kính, hệ treo
    blast155: { heavy: 0.3, medium: 0.5, light: 1.1, soft: 1.25 }
  };

  // Phân loại bộ phận theo tên tag (đặt trong file model)
  function partKind(tag) {
    if (/^camoKit/.test(tag)) return 'camo';
    if (/^hatch/.test(tag)) return 'hatch';   // nắp tháp / nắp lái: thép dày, chỉ bị nổ trong khoang thổi bật (blowHatches)   // lưới lá ngụy trang: khó bị hất văng cả mảng
    if (/^(skirt|cheek|applique|cage|sandbag)/.test(tag)) return 'armor';
    if (/^era/.test(tag)) return 'era';
    if (/^optic/.test(tag)) return 'optic';
    if (/^feed/.test(tag)) return 'feed';
    if (tag === 'sensor' || tag === 'aaRadar') return 'sensor';
    if (tag === 'atgm') return 'atgm';
    if (tag === 'fuelTank') return 'fuel';
    if (tag === 'ammoBoxes') return 'ammo';
    if (tag === 'dozer' || tag === 'spareTrack' || tag === 'rcws' || tag === 'jammer' || tag === 'agl' || tag === 'rocketPod' || tag === 'sradar' || tag === 'rjam' || tag === 'kamiRack') return 'heavyAcc';
    return 'acc';
  }

  // Xác suất văng khi trúng TRỰC TIẾP vào bộ phận
  const DETACH_DIRECT = {
    // phụ kiện ngoài (đèn, thùng, hộp, lan can, ống phóng khói...): bắt vít / hàn mỏng -> trúng là văng / nát
    acc: { small: 0.6, cannon: 0.9, kinetic: 1, heat: 1, blast: 1 },
    // váy xích / lồng thép (tấm hàn, gạch ERA: xem segmentsOf). Đạn xuyên giáp chủ yếu khoét lỗ qua tấm váy mỏng; nổ lõm /
    // nổ phá mới hay xé cả tấm khỏi giá treo
    armor: { small: 0, cannon: 0.08, kinetic: 0.25, heat: 0.6, blast: 0.75 },
    era: { small: 0, cannon: 0.2, kinetic: 1, heat: 1, blast: 0.8 },
    // trạm súng máy / lưỡi ủi / mắt xích dự phòng: đạn pháo trúng là gãy bật khỏi giá
    heavyAcc: { small: 0.1, cannon: 0.4, kinetic: 1, heat: 1, blast: 0.8 },
    optic: { small: 0.5, cannon: 0.85, kinetic: 1, heat: 1, blast: 1 },
    feed: { small: 0.2, cannon: 0.6, kinetic: 1, heat: 1, blast: 0.9 },
    sensor: { small: 0.5, cannon: 0.9, kinetic: 1, heat: 1, blast: 1 },
    atgm: { small: 0.2, cannon: 0.6, kinetic: 1, heat: 1, blast: 0.9 },
    fuel: { small: 0.3, cannon: 0.7, kinetic: 1, heat: 1, blast: 1 },
    ammo: { small: 0.15, cannon: 0.6, kinetic: 1, heat: 1, blast: 1 },
    camo: { small: 0, cannon: 0.1, kinetic: 0.2, heat: 0.3, blast: 0.4 },
    hatch: { small: 0, cannon: 0, kinetic: 0, heat: 0, blast: 0 }
  };
  // Hệ số văng do sóng nổ gần (nhân với độ gần tâm nổ)
  const DETACH_BLAST = { acc: 1, armor: 0.5, era: 0.55, heavyAcc: 0.3, optic: 0.75, feed: 0.4, sensor: 0.8, atgm: 0.5, fuel: 0.35, ammo: 0.35, camo: 0.12, hatch: 0 };

  const PART_NAME = {
    skirt: 'VÁY XÍCH', cheek: 'MODULE GIÁP MÁ THÁP', applique: 'GIÁP TĂNG CƯỜNG MŨI', appliqueF: 'TẤM GIÁP TĂNG CƯỜNG MŨI', cageRear: 'LỒNG CHỐNG RPG ĐUÔI XE', sandbag: 'BAO CÁT ĐUÔI XE',
    cageTurret: 'LỒNG CHỐNG RPG ĐUÔI THÁP', era: 'GẠCH GIÁP PHẢN ỨNG NỔ', opticGunner: 'KÍNH NGẮM PHÁO THỦ', opticCdr: 'KÍNH TOÀN CẢNH CHỈ HUY',
    feed: 'MÁNG TIẾP ĐẠN', sensor: 'RADAR TRINH SÁT', aaRadar: 'RADAR PHÒNG KHÔNG', atgm: 'ỐNG PHÓNG TÊN LỬA', fuelTank: 'BÌNH NHIÊN LIỆU', ammoBoxes: 'THÙNG ĐẠN TRÊN SÀN',
    dozer: 'LƯỠI ỦI', spareTrack: 'MẮT XÍCH DỰ PHÒNG', rcws: 'TRẠM SÚNG MÁY ĐIỀU KHIỂN TỪ XA', jammer: 'MÁY PHÁ SÓNG CHỐNG UAV', agl: 'SÚNG PHÓNG LỰU NÓC THÁP', rocketPod: 'BỆ TÊN LỬA ĐỘT NÓC', sradar: 'RADAR TRÊN CHÂN ĐẾ', rjam: 'MÁY PHÁ KHÓA RADAR', kamiRack: 'ỐNG PHÓNG UAV CẢM TỬ', vshield: 'KHIÊN GIÁP CHỮ V', mirror: 'GƯƠNG CHIẾU HẬU', lamp: 'CỤM ĐÈN PHA',
    smoke: 'ỐNG PHÓNG LỰU ĐẠN KHÓI', bin: 'THÙNG ĐỒ', box: 'HỘP DỤNG CỤ', can: 'CAN NHIÊN LIỆU', cans: 'CAN NHIÊN LIỆU', rail: 'LAN CAN NÓC',
    railRear: 'LAN CAN NÓC', stowage: 'GIỎ ĐỒ ĐUÔI THÁP', tool: 'DỤNG CỤ DÃ CHIẾN', flap: 'TẤM CHẮN BÙN', shield: 'TẤM CHẮN SÚNG MÁY',
    travelLock: 'GIÁ KHÓA NÒNG', spare: 'BÁNH DỰ PHÒNG', generator: 'MÁY PHÁT ĐIỆN', tarpRoll: 'CUỘN BẠT', searchlight: 'ĐÈN CHIẾU', meteo: 'CỘT KHÍ TƯỢNG',
    hatchDrv: 'NẮP LÁI XE', hatchCdr: 'NẮP CHỈ HUY', hatchLdr: 'NẮP NẠP ĐẠN', hatchCrew: 'NẮP KHOANG TỔ LÁI',
    camoKit: 'LƯỚI NGỤY TRANG', camoKitT: 'LƯỚI NGỤY TRANG THÁP', camoKitB: 'LÁ NGỤY TRANG TRÊN NÒNG', camoKitP: 'LÁ NGỤY TRANG HỘP PHÁO', camoKitH: 'LÁ NGỤY TRANG NẮP LỖ NÓC', camoKitM: 'LÁ NGỤY TRANG TẤM CHẮN SÚNG'
  };
  function partName(tag) {
    if (PART_NAME[tag]) return PART_NAME[tag];
    const base = tag.replace(/[LR]?\d*$/, '').replace(/[LR]$/, '');
    // gạch giáp nổ mua thêm (eraKitL / eraKitTF...): cùng tên gọi với gạch có sẵn
    let n = PART_NAME[base] || (/^era/.test(tag) ? PART_NAME.era : tag.toUpperCase());
    if (/L\d*$/.test(tag)) n += ' TRÁI';
    else if (/R\d*$/.test(tag)) n += ' PHẢI';
    return n;
  }

  // Âm thanh thứ cấp (nổ kho đạn, giáp bong, nổ lốp, kính vỡ...)
  function sfx(kind, pos, k, o) {
    if (pos && typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(kind, pos, k || 1, o || null);
  }
  let FX = null;   // hệ hiệu ứng đang dùng trong lượt xử lý va chạm hiện tại
  // ĐỒNG BỘ NHIỀU NGƯỜI: máy không có quyền với viên đạn chỉ chạy phần HÌNH ẢNH (móp, tia lửa, kính rạn...);
  // hư hại ảnh hưởng lối chơi (đứt xích, xịt lốp, mất bộ phận, hỏng máy...) do máy có quyền tính rồi gửi bản tóm tắt
  // (digest) -> các máy khác áp vào bằng applyDigest -> mọi máy cùng một trạng thái.
  let VIS_ONLY = false;
  function visualOnly(fn) { const prev = VIS_ONLY; VIS_ONLY = true; try { return fn(); } finally { VIS_ONLY = prev; } }
  function sparksAt(p, n) {
    if (!FX || !FX.fire || !p) return;
    for (let i = 0; i < (n || 14); i++) {
      const sp = rand(40, 140);
      const a = Math.random() * 6.283;
      FX.fire.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rand(10, 90), vz: Math.sin(a) * sp, size: rand(0.8, 1.8), grow: -0.5, drag: 0.8, grav: 110, life: rand(0.3, 0.8), alpha: 1, fadeIn: 0.005, c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.12], cell: 3 });
    }
  }

  // ---------------------------------------------------------------------------
  // TRẠNG THÁI
  // ---------------------------------------------------------------------------
  function state(u) {
    if (u.dmg) return u.dmg;
    u.dmg = {
      speed: 1, accel: 1, turn: 1, reload: 1, traverse: 1, recon: 1, spin: 1, rofInterval: 1, deploy: 1,
      tiltP: 0, tiltR: 0, pull: 0, rpgDisabled: false,
      lost: new Set(), flat: {}, flatAnim: {}, track: [0, 0], trackTimer: [0, 0],
      trackWear: [0, 0], trackBreaks: [0, 0], tireWear: {}, shred: {},
      engine: 0, ring: false, gun: false, hydraulics: false,
      // mức mỏng giáp theo mặt (bộ phận giáp gốc đã mất): thân xe & tháp pháo tách riêng
      faceLoss: { front: 1, rear: 1, sideL: 1, sideR: 1, top: 1 },
      faceLossT: { front: 1, rear: 1, sideL: 1, sideR: 1, top: 1 },
      base: null, saved: [], hiddenGroups: [], hiddenAnt: [],
      gone: {}, bent: new Set(), fires: [], frame: 0, glassHits: 0, gunBent: null
    };
    const d = u.dmg;
    d.base = {
      baseMaxSpeed: u.baseMaxSpeed, acceleration: u.acceleration, turnRate: u.turnRate,
      reloadDuration: u.reloadDuration, reconRadius: u.reconRadius, spinRequired: u.spinRequired,
      antiTankCooldownMax: u.antiTankCooldownMax
    };
    return d;
  }

  // Tính lại chỉ số thực tế từ các hư hại hiện có
  function recompute(u) {
    const d = state(u), b = d.base, A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    let speed = 1, accel = 1, turn = 1;
    // khoang máy bị xuyên hỏng nặng (két dầu, hộp số, bơm nhiên liệu thủng): xe gần như nằm im, chỉ lết được chút ít
    // (trước 45% tốc độ — vẫn chạy như xe hư nhẹ)
    if (d.engine === 1) { speed *= 0.72; accel *= 0.6; } else if (d.engine >= 2) { speed *= 0.1; accel *= 0.1; }
    // lái xe bị thương (mảnh xuyên khoang lái): xe khựng lại tới khi người khác vào thay lái
    if (d.crewD > 0) { speed *= 0.05; accel *= 0.05; }
    // Xích: đứt hẳn -> gần như bất động; nối tạm -> chạy chậm
    for (let s = 0; s < 2; s++) {
      if (d.trackTimer[s] > 0) { speed *= 0.1; turn *= 0.45; }
      else if (d.track[s] > 0) { speed *= 0.8; turn *= 0.9; }
      // Mắt xích / bánh tì bị đạn xả liên tục làm hư, lỏng: xe ì & lệch hướng dần
      if (d.trackTimer[s] <= 0 && d.trackWear && d.trackWear[s] >= 1) { speed *= 0.86; turn *= 0.92; }
    }
    // Lốp xẹp: mỗi bánh xẹp kéo tụt tốc độ, xe lệch & kéo lái về phía bánh xẹp
    let tiltP = 0, tiltR = 0, pull = 0;
    const ws = u.wheelSet;
    if (ws && A.drive === 'wheels') {
      const n = ws.positions.length;
      let lostL = 0, lostR = 0, lostN = 0;
      for (const k in d.flat) {
        const p = ws.positions[k];
        const lost = !!d.gone[k];
        const shred = !lost && d.shred && d.shred[k];
        if (lost) { lostN++; if (p.x < 0) lostL++; else lostR++; }
        // Lốp xẹp: lốp bẹp cọ sát, xe ì hẳn, khó lái; lốp nát chạy trên vành; bánh văng mất: moay-ơ cày đất
        speed *= lost ? (n > 4 ? 0.5 : 0.32) : shred ? (n > 4 ? 0.6 : 0.42) : (n > 4 ? 0.76 : 0.62);
        accel *= lost ? 0.55 : 0.75;
        turn *= lost ? 0.7 : 0.85;
        pull += Math.sign(p.x) * 0.1 * (lost ? 2 : 1);
      }
      void lostL; void lostR; void lostN;
      // Độ tụt từng bánh: văng mất -> moay-ơ / gầm chạm đất (~0.85R), xẹp lốp -> ~0.22R
      const drop = ws.positions.map((p, i) => d.gone[i] ? ws.radius * 0.85 : (d.shred && d.shred[i]) ? ws.radius * 0.4 : d.flat[i] ? ws.radius * 0.22 : 0);
      let sL = 0, nL = 0, sR = 0, nR = 0, sF = 0, nF = 0, sB = 0, nB = 0, halfX = 1, zF = 0, zB = 0;
      ws.positions.forEach((p, i) => {
        if (p.x < 0) { sL += drop[i]; nL++; } else { sR += drop[i]; nR++; }
        halfX = Math.max(halfX, Math.abs(p.x));
      });
      const zs = ws.positions.map(p => p.z), zMin = Math.min(...zs), zMax = Math.max(...zs);
      ws.positions.forEach((p, i) => {
        if (p.z < (zMin + zMax) / 2) { sF += drop[i]; nF++; zF += p.z; } else { sB += drop[i]; nB++; zB += p.z; }
      });
      const dL = nL ? sL / nL : 0, dR = nR ? sR / nR : 0, dF = nF ? sF / nF : 0, dB = nB ? sB / nB : 0;
      const wb = Math.max(4, (nB ? zB / nB : 0) - (nF ? zF / nF : 0));
      tiltR = -Math.atan((dR - dL) / (2 * halfX));
      tiltP = -Math.atan((dF - dB) / wb);
      d.sink = (dL + dR) / 2 * 0.5 + (dF + dB) / 2 * 0.5;
    } else {
      d.sink = 0;
    }
    // Mất 2 bánh cùng một bên (xe 4x4) hoặc mất >= 3 bánh: xe nằm ì, chỉ còn nhích được
    if (ws && A.drive === 'wheels') {
      const n = ws.positions.length;
      let lostL = 0, lostR = 0, lostN = 0;
      for (const k in d.gone) { lostN++; if (ws.positions[k].x < 0) lostL++; else lostR++; }
      // lốp nát chạy vành tính ~60% một bánh mất
      if (d.shred) for (const k in d.shred) if (!d.gone[k]) { lostN += 0.6; if (ws.positions[k].x < 0) lostL += 0.6; else lostR += 0.6; }
      if ((n <= 4 && (lostL >= 1.6 || lostR >= 1.6)) || lostN >= 2.6) { speed = Math.min(speed, 0.06); turn = Math.min(turn, 0.3); d.immobile = true; }
    }
    // Khung gầm bị sóng nổ vặn méo: xe vẹo hẳn một bên, chạy chậm, khó lái
    if (d.frame) { speed *= 0.85; turn *= 0.88; tiltR += d.frame * 0.035; tiltP += d.frame * 0.012; }
    d.speed = Math.max(0.08, speed);
    d.accel = Math.max(0.2, accel);
    d.turn = Math.max(0.3, turn);
    d.tiltP = tiltP; d.tiltR = tiltR; d.pull = pull;
    d.traverse = d.ring ? 0.35 : 1;

    let reload = 1, spin = 1, rofI = 1, recon = 1;
    if (d.gun) {
      if (u.tankType === 'GATLING') spin *= 1.9;
      else if (u.tankType === 'SCOUT') rofI *= 1.5;
      else reload *= 1.4;
    }
    if (d.lost.has('opticGunner')) reload *= 1.15;
    if (d.lost.has('feedL')) rofI *= 1.35;
    if (d.lost.has('feedR')) rofI *= 1.35;
    if (d.lost.has('sensor')) recon *= 0.45;
    // pháo thủ / nạp đạn bị thương: trưởng xe kiêm thay -> nạp đạn, bắn chậm hẳn một lúc
    if (d.crewG > 0) { reload *= 1.6; spin *= 1.4; rofI *= 1.4; }
    d.reload = reload; d.spin = spin; d.rofInterval = rofI; d.recon = recon;
    d.deploy = d.hydraulics ? 0.45 : 1;
    d.rpgDisabled = d.lost.has('atgm');

    if (b.baseMaxSpeed !== undefined) u.baseMaxSpeed = b.baseMaxSpeed * d.speed;
    if (b.acceleration !== undefined) u.acceleration = b.acceleration * d.accel;
    if (b.turnRate !== undefined) u.turnRate = b.turnRate * d.turn;
    if (b.reloadDuration !== undefined) u.reloadDuration = b.reloadDuration * d.reload;
    if (b.reconRadius !== undefined) u.reconRadius = b.reconRadius * d.recon;
    if (b.spinRequired !== undefined) u.spinRequired = b.spinRequired * d.spin;
    if (d.rpgDisabled) u.missileAmmoCount = 0;
    u.trackBroken = [d.trackTimer[0] > 0, d.trackTimer[1] > 0];
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC BỘ PHẬN
  // ---------------------------------------------------------------------------
  function partCenter(u, tag) {
    u._partCenters = u._partCenters || {};
    if (u._partCenters[tag]) return u._partCenters[tag];
    let res = null;
    const entries = u.partRegistry && u.partRegistry[tag];
    if (entries && entries.length) {
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      const e0 = entries[0];
      for (const e of entries) {
        const pos = e.mesh.geometry.attributes.position;
        for (const [st, n] of e.ranges) {
          for (let i = st; i < st + n; i++) box.expandByPoint(v.fromBufferAttribute(pos, i));
        }
      }
      res = { mesh: e0.mesh, local: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()).length() };
    } else if (u.partGroups && u.partGroups[tag]) {
      const g = u.partGroups[tag];
      res = { group: g, local: new THREE.Vector3(), size: 4 };
    }
    u._partCenters[tag] = res;
    return res;
  }

  function partWorld(u, tag) {
    const c = partCenter(u, tag);
    if (!c) return null;
    if (c.group) return c.group.getWorldPosition(new THREE.Vector3());
    return c.mesh.localToWorld(c.local.clone());
  }

  // Tag của bộ phận chứa tam giác bị tia chạm
  function tagAtHit(hit) {
    if (!hit || !hit.object) return null;
    let o = hit.object;
    const ranges = o.userData && o.userData.partRanges;
    if (ranges && hit.faceIndex !== undefined && hit.faceIndex !== null) {
      const vi = hit.faceIndex * 3;
      for (const tag in ranges) {
        for (const [st, n] of ranges[tag]) if (vi >= st && vi < st + n) return tag;
      }
    }
    // Trúng group rời (đầu kính, radar, ống phóng...)
    while (o) {
      if (o.userData && o.userData.partGroupTag) return o.userData.partGroupTag;
      o = o.parent;
    }
    return null;
  }

  function markGroups(u) {
    if (u._groupsMarked || !u.partGroups) return;
    u._groupsMarked = true;
    for (const name in u.partGroups) u.partGroups[name].userData.partGroupTag = name;
  }

  // ---------------------------------------------------------------------------
  // MẢNH VỠ CÓ VẬT LÝ
  // ---------------------------------------------------------------------------
  const debrisList = [];
  let groundProvider = null;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

  // Trọng trường của mảnh vỡ: khớp thế giới game (~8 đơn vị = 1 m, như Ballistics.gunGravity) -> rơi đúng nhịp thật
  const DEBRIS_G = 78.5;
  // Vật liệu mảnh: hệ số nảy (e), ma sát (mu), cản không khí (air) + kiểu tiếng va
  const DEBRIS_MAT = {
    plate: { e: 0.18, mu: 0.65, air: 0.02 },   // tấm giáp / váy xích / gạch ERA: thép dày, nặng
    metal: { e: 0.28, mu: 0.55, air: 0.04 },   // phụ kiện thép nhỏ: hộp đồ, đèn, lan can, giá súng...
    can: { e: 0.3, mu: 0.5, air: 0.05 },       // vỏ rỗng: bình nhiên liệu, ống phóng tên lửa
    rubber: { e: 0.42, mu: 0.95, air: 0.02 },  // bánh xe cao su
    glass: { e: 0.2, mu: 0.5, air: 0.05 },     // kính ngắm / radar
    link: { e: 0.2, mu: 0.7, air: 0.02 },      // mắt xích
    net: { e: 0.04, mu: 0.95, air: 0.9 },      // lưới ngụy trang / giỏ vải: rơi lả, không nảy
    bag: { e: 0.02, mu: 0.98, air: 0.02 },     // bao cát: nặng, rơi "huỵch" nằm ì, không nảy không lăn
    whip: { e: 0.3, mu: 0.5, air: 0.35 }       // roi ăng-ten mảnh
  };
  function debrisMatOf(tag) {
    if (/^(stowage|camoKit)/.test(tag)) return 'net';
    if (/^sandbag/.test(tag)) return 'bag';
    if (/^(lamp|mirror|searchlight)/.test(tag)) return 'glass';
    const k = partKind(tag);
    if (k === 'armor' || k === 'era' || k === 'heavyAcc' || k === 'hatch') return 'plate';
    if (k === 'optic' || k === 'sensor') return 'glass';
    if (k === 'fuel' || k === 'atgm') return 'can';
    if (k === 'camo') return 'net';
    return 'metal';
  }
  const _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _iq = new THREE.Quaternion();
  // Nhân vector (hệ thế giới) với nghịch đảo tensor quán tính của mảnh ở tư thế hiện tại
  function invInertia(D, vec, out) {
    _iq.copy(D.obj.quaternion).invert();
    out.copy(vec).applyQuaternion(_iq).multiply(D.invI).applyQuaternion(D.obj.quaternion);
    return out;
  }

  // opt: { mat: kiểu vật liệu (DEBRIS_MAT), round: mảnh tròn (bánh xe) -> lăn được }
  function spawnDebris(u, obj, impulse, opt) {
    const scene = u.scene || (u.group && u.group.parent);
    if (!scene) return;
    opt = opt || {};
    // Kích thước mảnh trong hệ của chính nó -> khi nằm yên, mặt mỏng nhất úp xuống đất
    const q0 = obj.quaternion.clone(), p0 = obj.position.clone(), s0 = obj.scale.clone();
    obj.position.set(0, 0, 0); obj.quaternion.identity();
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const dims = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
    const com = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());   // trọng tâm (đã nhân scale)
    // Điểm tiếp xúc (hệ của mảnh, chưa nhân scale): 8 góc khối bao; mảnh tròn (bánh xe) dùng 2 vành 12 điểm -> lăn được
    const corners = [];
    if (!box.isEmpty()) {
      if (opt.round) {
        const ax = dims.x <= dims.y && dims.x <= dims.z ? 'x' : dims.y <= dims.z ? 'y' : 'z';
        const o1 = ax === 'x' ? 'y' : 'x', o2 = ax === 'z' ? 'y' : 'z';
        const R = 0.5 * Math.max(dims[o1], dims[o2]), hw = 0.5 * dims[ax];
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          for (const sd of [-1, 1]) {
            const c = com.clone();
            c[ax] += sd * hw; c[o1] += Math.cos(a) * R; c[o2] += Math.sin(a) * R;
            corners.push(c.divide(s0));
          }
        }
      } else {
        for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).divide(s0));
      }
    }
    obj.position.copy(p0); obj.quaternion.copy(q0); obj.scale.copy(s0);
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const r = obj.userData.radius || 2;
    // Mảnh nặng (tấm giáp, bánh xe) bị hất đi rất gần, rơi cạnh xe; mảnh nhỏ nhẹ văng xa hơn — như thật
    const vol = Math.max(0.3, dims.x * dims.y * dims.z);
    const light = Math.max(0.22, Math.min(1, 2.4 / Math.cbrt(vol)));
    const mass = 1 / light;
    const kick = impulse.clone().multiplyScalar(0.45 * light);
    const v = kick.clone().add(new THREE.Vector3(rand(-6, 6), rand(14, 30), rand(-6, 6)).multiplyScalar(0.5 + 0.5 * light));
    const mat = DEBRIS_MAT[opt.mat] ? opt.mat : 'metal';
    // Tensor quán tính (hệ của mảnh): khối hộp đặc, bánh xe là trụ
    const ix = dims.y * dims.y + dims.z * dims.z, iy = dims.x * dims.x + dims.z * dims.z, iz = dims.x * dims.x + dims.y * dims.y;
    const invI = new THREE.Vector3(12 / (mass * Math.max(0.05, ix)), 12 / (mass * Math.max(0.05, iy)), 12 / (mass * Math.max(0.05, iz)));
    const comL = com.clone();                                  // trọng tâm trong hệ mảnh (đã nhân scale)
    const cr = corners.map(c => c.clone().multiply(s0).sub(comL));   // điểm tiếp xúc tính từ trọng tâm
    if (!cr.length) cr.push(new THREE.Vector3(0, -r * 0.45, 0));
    let reach = 0;
    for (const c of cr) reach = Math.max(reach, c.length());
    const x = comL.clone().applyQuaternion(obj.quaternion).add(obj.position);   // vị trí trọng tâm (thế giới)
    const D = {
      u, obj, r, dims, corners, mass, mat, round: !!opt.round, invI, comL, cr, reach: Math.max(reach, 0.3), x,
      // mảnh tách từ dưới mặt vỏ? — xét ở bước vật lý đầu (mặt đỡ dựng lại một lần dù nhiều bộ phận bung cùng lúc)
      under: null, p0: p0.clone(),
      v, w: new THREE.Vector3(),
      t: 0, rest: false, bounces: 0, calm: 0, sndCd: 0, scrCd: 0
    };
    // Mảnh bị giật khỏi chân giá / bu-lông: chân gắn (phía thân xe, phía dưới) níu lại trong tích tắc -> lực đánh tạo
    // mô-men lật mảnh (tấm giáp lộn nhào chậm, phụ kiện nhỏ nhẹ xoay tít), không xoay ngẫu nhiên vô cớ
    const toHull = u.group ? u.group.position.clone().sub(x).setY(0) : new THREE.Vector3();
    if (toHull.lengthSq() > 1e-6) toHull.normalize();
    const lever = toHull.multiplyScalar(0.35 * Math.max(dims.x, dims.z)).add(new THREE.Vector3(rand(-0.3, 0.3) * dims.x, -0.4 * dims.y, rand(-0.3, 0.3) * dims.z));
    const J = kick.clone().multiplyScalar(-0.7 * mass);
    invInertia(D, lever.cross(J), D.w);
    D.w.add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5)).multiplyScalar(light));
    const wMax = 6 + 10 * light;
    if (D.w.length() > wMax) D.w.setLength(wMax);
    debrisList.push(D);
    while (debrisList.length > 160) removeDebris(0);
  }

  function removeDebris(i) {
    const d = debrisList[i];
    if (d.obj.parent) d.obj.parent.remove(d.obj);
    d.obj.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    debrisList.splice(i, 1);
  }

  // Tách một bộ phận gộp trong mesh thành mảnh rời, xóa khỏi mesh gốc
  function detachTag(u, tag, impulse) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.lost.has(tag)) return false;
    const entries = u.partRegistry && u.partRegistry[tag];
    const grp = u.partGroups && u.partGroups[tag];
    if (!entries && !grp) return false;
    d.lost.add(tag);
    u.group.updateMatrixWorld(true);

    if (entries && entries.length) {
      // váy xích bung thì gạch ERA / tấm composite bắt trên nó đi theo (không treo lơ lửng giữa không trung)
      const parts = /^skirt/.test(tag) ? entries.concat(mountedSegParts(u, entries)) : entries;
      const holder = cutParts(u, parts, partCenter(u, tag));
      fieldChanged(u, true);
      spawnDebris(u, holder, impulse, { mat: debrisMatOf(tag) });
    } else if (grp) {
      grp.updateMatrixWorld(true);
      const copy = grp.clone(true);
      grp.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      copy.userData.radius = 1.6;
      grp.visible = false;
      d.hiddenGroups.push(grp);
      fieldChanged(u, true);
      spawnDebris(u, copy, impulse, { mat: debrisMatOf(tag) });
    }
    return true;
  }

  // Xe còn bộ phận `tag` (có trên mô hình & chưa bị bắn văng / dùng mất)
  function hasPart(u, tag) {
    const d = state(u);
    return !d.lost.has(tag) && !!((u.partRegistry && u.partRegistry[tag]) || (u.partGroups && u.partGroups[tag]));
  }

  // Gỡ bộ phận khỏi xe KHÔNG văng mảnh (kíp xe tháo ra dùng: lốp dự phòng lắp vào bánh hỏng, đoạn xích dự phòng nối xích)
  function stowTag(u, tag) {
    if (VIS_ONLY || !hasPart(u, tag)) return false;
    const d = state(u);
    const entries = u.partRegistry && u.partRegistry[tag], grp = u.partGroups && u.partGroups[tag];
    d.lost.add(tag);
    u.group.updateMatrixWorld(true);
    if (entries && entries.length) cutParts(u, entries, partCenter(u, tag));
    else if (grp) { grp.visible = false; d.hiddenGroups.push(grp); }
    fieldChanged(u, true);
    return true;
  }

  // Các khối (gạch ERA, tấm ghép) còn nguyên chồng lên bộ phận entries -> đánh dấu đã mất, trả về khoảng đỉnh để cắt cùng
  function mountedSegParts(u, entries) {
    const d = state(u), box = new THREE.Box3(), v = new THREE.Vector3(), M = new THREE.Matrix4();
    u.group.updateMatrixWorld(true);
    const gInv = new THREE.Matrix4().copy(u.group.matrixWorld).invert();
    for (const e of entries) {
      M.multiplyMatrices(gInv, e.mesh.matrixWorld);
      const pa = e.mesh.geometry.attributes.position;
      for (const [st, n] of e.ranges) for (let i = st; i < st + n; i++) box.expandByPoint(v.fromBufferAttribute(pa, i).applyMatrix4(M));
    }
    if (box.isEmpty()) return [];
    box.expandByScalar(0.6);
    const out = [];
    for (const t of Object.keys(u.partRegistry || {})) {
      if (!segmented(t) || d.lost.has(t)) continue;
      const segs = segmentsOf(u, t);
      for (const sg of segs) {
        if (sg.gone || !box.intersectsBox(sg.box)) continue;
        // khối phải nằm phần lớn trong vùng váy (không kéo theo tấm bắt trên thân phía trên)
        const ov = box.clone().intersect(sg.box).getSize(v), sz = sg.box.getSize(new THREE.Vector3());
        if (ov.x * ov.y * ov.z < 0.5 * Math.max(1e-3, sz.x * sz.y * sz.z)) continue;
        sg.gone = true; sg.hp = 0;
        out.push(...sg.parts);
      }
      if (segs.length && segs.every(sg => sg.gone)) d.lost.add(t);
    }
    return out;
  }

  // Cắt các khoảng đỉnh (parts: [{ mesh, ranges }], cùng hệ tọa độ) khỏi lưới gốc thành một mảnh rời (holder, chưa thả).
  // Lưới gốc: thu các đỉnh về một điểm (tam giác suy biến, tia dò đạn không trúng nữa), lưu lại để hồi sinh.
  // c: { mesh, local, size } tâm bộ phận; bỏ trống thì tính theo hộp bao các khoảng đỉnh
  function cutParts(u, parts, c) {
    const d = state(u);
    if (!c) {
      const box = new THREE.Box3(), v = new THREE.Vector3();
      for (const e of parts) for (const [st, n] of e.ranges) for (let i = st; i < st + n; i++) box.expandByPoint(v.fromBufferAttribute(e.mesh.geometry.attributes.position, i));
      c = { mesh: parts[0].mesh, local: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()).length() };
    }
    u.group.updateMatrixWorld(true);
    const holder = new THREE.Group();
    // Đặt holder đúng tư thế thế giới của mesh gốc tại tâm bộ phận
    c.mesh.matrixWorld.decompose(_p, _q, _s);
    holder.position.copy(c.mesh.localToWorld(c.local.clone()));
    holder.quaternion.copy(_q);
    holder.scale.copy(_s);
    for (const e of parts) {
      const src = e.mesh.geometry;
      let total = 0;
      for (const [, n] of e.ranges) total += n;
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv', 'color', 'aBurn', 'aCurl']) {   // aBurn/aCurl: lá đang cháy (CamoFire)
        const at = src.attributes[name];
        if (!at) continue;
        const isz = at.itemSize;
        const arr = new Float32Array(total * isz);
        let o = 0;
        for (const [st, n] of e.ranges) { arr.set(at.array.subarray(st * isz, (st + n) * isz), o); o += n * isz; }
        g.setAttribute(name, new THREE.BufferAttribute(arr, isz));
      }
      // khối nằm ở lưới khác (vd gạch ERA mua thêm bắt trên váy xích): đưa về hệ của lưới chính trước
      if (e.mesh !== c.mesh) g.applyMatrix4(new THREE.Matrix4().copy(c.mesh.matrixWorld).invert().multiply(e.mesh.matrixWorld));
      g.translate(-c.local.x, -c.local.y, -c.local.z);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, e.mesh.material);
      m.castShadow = true;
      m.userData.ownGeo = true;
      holder.add(m);
      // Xóa khỏi mesh gốc: thu các đỉnh về một điểm (tam giác suy biến), lưu lại để hồi sinh
      const pos = src.attributes.position;
      const dbox = new THREE.Box3();
      for (const [st, n] of e.ranges) {
        d.saved.push({ attr: pos, start: st, data: pos.array.slice(st * 3, (st + n) * 3) });
        // thu về tâm bộ phận (lưới khác hệ: về đỉnh đầu của khoảng)
        const cx = e.mesh === c.mesh ? c.local.x : pos.getX(st), cy = e.mesh === c.mesh ? c.local.y : pos.getY(st), cz = e.mesh === c.mesh ? c.local.z : pos.getZ(st);
        for (let i = st; i < st + n; i++) { dbox.expandByPoint(_rg.fromBufferAttribute(pos, i)); pos.setXYZ(i, cx, cy, cz); }
      }
      pos.needsUpdate = true;
      // Vết đạn / vết cháy đang dán trên bộ phận vừa văng: không còn mặt thép bên dưới -> gỡ (thay vì lơ lửng tại chỗ cũ)
      dbox.expandByScalar(0.5);
      refitDecals(u, e.mesh, (p, out) => dbox.containsPoint(p) && !!out.copy(p));
    }
    holder.userData.radius = Math.max(0.6, c.size * 0.35);
    return holder;
  }

  // ---------------------------------------------------------------------------
  // NẮP THÁP / NẮP LÁI: kho đạn / thuốc phóng nổ trong khoang -> áp suất thổi bật nắp (giật đứt khỏi bản lề văng lên, hoặc
  // quật mở toang), lửa & khói phụt ra từ lỗ nắp (ExplosionFX đọc hatchHoles). Kíp lái thoát ra -> nắp mở dựng.
  // ---------------------------------------------------------------------------
  function hatchTags(u) { return Object.keys(u.partRegistry || {}).filter(t => partKind(t) === 'hatch'); }
  // Quật nắp mở quanh bản lề: bản lề ở mép đối diện tay nắm (tay nắm là chi tiết cao nhất trên nắp)
  function swingHatch(u, tag, ang) {
    const d = state(u);
    const entries = u.partRegistry[tag];
    if (!entries || d.lost.has(tag) || d.bent.has(tag)) return null;
    const v = new THREE.Vector3(), box = new THREE.Box3();
    let topY = -Infinity;
    for (const e of entries) for (const [st, n] of e.ranges) for (let i = st; i < st + n; i++) { v.fromBufferAttribute(e.mesh.geometry.attributes.position, i); box.expandByPoint(v); topY = Math.max(topY, v.y); }
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3()), hz = new THREE.Vector3();
    let nh = 0;
    for (const e of entries) for (const [st, n] of e.ranges) for (let i = st; i < st + n; i++) { v.fromBufferAttribute(e.mesh.geometry.attributes.position, i); if (v.y > topY - 0.12) { hz.add(v); nh++; } }
    hz.multiplyScalar(1 / Math.max(1, nh));
    const toHandle = new THREE.Vector3(hz.x - c.x, 0, hz.z - c.z);
    if (toHandle.lengthSq() < 1e-4) toHandle.set(0, 0, 1);
    toHandle.normalize();
    const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    const pivot = new THREE.Vector3(c.x - toHandle.x * r, box.min.y, c.z - toHandle.z * r);
    const axis = new THREE.Vector3(0, 1, 0).cross(toHandle).normalize();
    const R = new THREE.Matrix4().makeRotationAxis(axis, ang);
    const T = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    const nm = new THREE.Matrix3().getNormalMatrix(R);
    d.bent.add(tag);
    for (const e of entries) {
      const pos = e.mesh.geometry.attributes.position, nor = e.mesh.geometry.attributes.normal;
      for (const [st, n] of e.ranges) {
        d.saved.push({ attr: pos, start: st, data: pos.array.slice(st * 3, (st + n) * 3) });
        if (nor) d.saved.push({ attr: nor, start: st, data: nor.array.slice(st * 3, (st + n) * 3) });
        for (let i = st; i < st + n; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(T); pos.setXYZ(i, v.x, v.y, v.z);
          if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
        }
      }
      pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
    }
    fieldChanged(u, true);
    return { mesh: entries[0].mesh, local: c };
  }
  // strength 1: nổ kho đạn (nắp bị giật văng hoặc quật toang); 0.3: kíp lái mở nắp thoát ra (mở dựng 1 nắp)
  function blowHatches(u, strength, events) {
    if (VIS_ONLY) return;
    const d = state(u);
    d.hatchHoles = d.hatchHoles || [];
    u.group.updateMatrixWorld(true);
    let tags = hatchTags(u).filter(t => !d.lost.has(t) && !d.bent.has(t));
    // tháp đã văng khỏi xe: nắp trên tháp đi theo tháp, không phụt lửa từ đó nữa
    if (u.fxWreck && u.fxWreck.turret) tags = tags.filter(t => !isOnTurret(u, u.partRegistry[t][0].mesh));
    if (strength < 0.5) tags = tags.length ? [tags[Math.floor(Math.random() * tags.length)]] : [];
    let flung = 0;
    for (const tag of tags) {
      const c = partCenter(u, tag);
      if (!c || !c.mesh) continue;
      const hole = { mesh: c.mesh, local: c.local.clone(), k: strength };
      if (strength >= 0.5 && Math.random() < 0.45) {
        // giật đứt bản lề: nắp thép dày bay vọt lên, lộn vòng, rơi cách xe vài mét
        const up = new THREE.Vector3(rand(-25, 25), rand(150, 230), rand(-25, 25));
        if (detachTag(u, tag, up)) { flung++; d.hatchHoles.push(hole); }
      } else {
        // quật mở toang (nổ) / mở dựng (kíp lái thoát)
        if (swingHatch(u, tag, strength >= 0.5 ? -rand(2.0, 2.6) : -rand(1.5, 1.75))) d.hatchHoles.push(hole);
      }
    }
    if (strength >= 0.5 && tags.length) {
      const wp = u.group.position.clone().add(new THREE.Vector3(0, 14, 0));
      sfx('armorPlate', wp, 1.2);
      events.push({ type: 'hatch', text: flung ? 'NỔ TRONG KHOANG — NẮP THÁP BỊ THỔI BAY' : 'NỔ TRONG KHOANG — NẮP THÁP BỊ QUẬT TUNG' });
    }
  }
  // Lỗ nắp đang hở (thế giới) để ExplosionFX phụt lửa / khói: [{ p, k }]
  function hatchHoles(u) {
    const d = u && u.dmg;
    if (!d || !d.hatchHoles || !d.hatchHoles.length) return [];
    const out = [];
    for (const h of d.hatchHoles) {
      if (!h.mesh.parent || (u.fxWreck && u.fxWreck.turret && isOnTurret(u, h.mesh))) continue;
      out.push({ p: h.mesh.localToWorld(h.local.clone()), k: h.k });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // BỘ PHẬN GHÉP TỪNG KHỐI: gạch giáp phản ứng nổ (mỗi viên nổ riêng), tấm giáp hàn / bắt bu-lông (giáp mũi, module
  // má tháp, tấm composite gắn thêm). Trúng đạn không làm cả cụm văng đi: tấm giáp thủng lỗ, nứt dần rồi mới bung;
  // gạch ERA trúng đạn thì đúng viên đó kích nổ, phá đầu đạn, các viên bên cạnh vẫn còn.
  // ---------------------------------------------------------------------------
  const SEG_RE = /^(era|applique|cheek|sandbag)/;
  function segmented(tag) { return !!tag && SEG_RE.test(tag); }
  // Tách bộ phận thành từng khối liền (đỉnh trùng vị trí); bu-lông / chi tiết nhỏ gộp vào khối lớn gần nhất.
  // Khối: { i, parts: [{ mesh, ranges }], box (hệ u.group), hp, cracked, gone }
  function segmentsOf(u, tag) {
    const d = state(u);
    d.segs = d.segs || {};
    if (d.segs[tag]) return d.segs[tag];
    const entries = u.partRegistry && u.partRegistry[tag];
    if (!entries || !entries.length) return (d.segs[tag] = []);
    u.group.updateMatrixWorld(true);
    const gInv = new THREE.Matrix4().copy(u.group.matrixWorld).invert(), M = new THREE.Matrix4(), v = new THREE.Vector3();
    const comps = [];
    for (const e of entries) {
      const pa = e.mesh.geometry.attributes.position.array;
      M.multiplyMatrices(gInv, e.mesh.matrixWorld);
      const tris = [];
      for (const [st, n] of e.ranges) for (let t = st; t + 2 < st + n; t += 3) tris.push(t);
      const par = new Int32Array(tris.length);
      for (let k = 0; k < par.length; k++) par[k] = k;
      const find = (k) => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
      const own = new Map();
      for (let k = 0; k < tris.length; k++) {
        for (let j = 0; j < 3; j++) {
          const o = (tris[k] + j) * 3;
          const h = (Math.round(pa[o] * 64) * 73856093) ^ (Math.round(pa[o + 1] * 64) * 19349663) ^ (Math.round(pa[o + 2] * 64) * 83492791);
          const f = own.get(h);
          if (f === undefined) own.set(h, k);
          else { const a = find(k), b = find(f); if (a !== b) par[a] = b; }
        }
      }
      const byRoot = new Map();
      for (let k = 0; k < tris.length; k++) {
        const r = find(k);
        let c = byRoot.get(r);
        if (!c) byRoot.set(r, c = { mesh: e.mesh, tris: [], box: new THREE.Box3() });
        c.tris.push(tris[k]);
        for (let j = 0; j < 3; j++) c.box.expandByPoint(v.fromArray(pa, (tris[k] + j) * 3).applyMatrix4(M));
      }
      for (const c of byRoot.values()) comps.push(c);
    }
    const vol = c => { const z = c.box.getSize(v); return Math.max(z.x, 0.05) * Math.max(z.y, 0.05) * Math.max(z.z, 0.05); };
    const vmax = comps.reduce((m, c) => Math.max(m, vol(c)), 0);
    const big = comps.filter(c => vol(c) >= vmax * 0.12), small = comps.filter(c => vol(c) < vmax * 0.12);
    const segs = big.map((c, i) => ({ i, comps: [c], box: c.box.clone(), hp: 1, cracked: false, gone: false }));
    for (const c of small) {
      const ctr = c.box.getCenter(new THREE.Vector3());
      let best = segs[0], bd = Infinity;
      for (const sg of segs) { const dd = sg.box.distanceToPoint(ctr); if (dd < bd) { bd = dd; best = sg; } }
      best.comps.push(c);
      best.box.union(c.box);
    }
    d.segMeshes = d.segMeshes || new Set();
    for (const sg of segs) {
      const byMesh = new Map();
      for (const c of sg.comps) { let l = byMesh.get(c.mesh); if (!l) byMesh.set(c.mesh, l = []); l.push(...c.tris); }
      sg.parts = [];
      for (const [mesh, tl] of byMesh) {
        tl.sort((a, b) => a - b);
        const ranges = [];
        for (const t of tl) { const L = ranges[ranges.length - 1]; if (L && L[0] + L[1] === t) L[1] += 3; else ranges.push([t, 3]); }
        sg.parts.push({ mesh, ranges });
        (mesh.userData.segRanges || (mesh.userData.segRanges = [])).push(ranges);   // tessellate() ánh xạ lại tại chỗ
        d.segMeshes.add(mesh);
      }
      delete sg.comps;
      segFrame(sg);
    }
    return (d.segs[tag] = segs);
  }
  // Tâm, hộp bao & pháp tuyến mặt chính của khối trong hệ lưới chứa nó (parts[0].mesh): bám theo lưới nên vẫn đúng khi tháp
  // pháo đã xoay (sg.box ở hệ u.group chụp lúc chia khối). Pháp tuyến: hướng có tổng diện tích mặt lớn nhất (nắp gạch / mặt
  // tấm), chưa định chiều — segNormal quay nó ra phía ngoài xe
  function segFrame(sg) {
    const p0 = sg.parts[0], pa = p0.mesh.geometry.attributes.position.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    const box = new THREE.Box3(), acc = new Map();
    for (const [st, cnt] of p0.ranges) for (let t = st; t + 2 < st + cnt; t += 3) {
      a.fromArray(pa, t * 3); b.fromArray(pa, t * 3 + 3); c.fromArray(pa, t * 3 + 6);
      box.expandByPoint(a); box.expandByPoint(b); box.expandByPoint(c);
      n.subVectors(b, a).cross(c.sub(a));
      const ar = n.length();
      if (ar < 1e-8) continue;
      n.multiplyScalar(1 / ar);
      // gộp n và -n (nắp ngoài & mặt áp vỏ xe cùng một hướng)
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if ((ax >= ay && ax >= az ? n.x : ay >= az ? n.y : n.z) < 0) n.negate();
      const key = Math.round(n.x * 4) + ',' + Math.round(n.y * 4) + ',' + Math.round(n.z * 4);
      let e = acc.get(key);
      if (!e) acc.set(key, e = { w: 0, v: new THREE.Vector3() });
      e.w += ar; e.v.addScaledVector(n, ar);
    }
    let best = null;
    for (const e of acc.values()) if (!best || e.w > best.w) best = e;
    sg.lbox = box;
    sg.lc = box.getCenter(new THREE.Vector3());
    sg.nL = best ? best.v.normalize() : null;
  }
  function segWorld(u, sg) {
    if (sg.lc) return sg.parts[0].mesh.localToWorld(sg.lc.clone());
    return sg.box.getCenter(new THREE.Vector3()).applyMatrix4(u.group.matrixWorld);
  }
  // Khối chứa tam giác bị tia chạm (không dò được thì khối còn nguyên gần điểm trúng nhất)
  function segAtHit(u, tag, hit, point) {
    const segs = segmentsOf(u, tag);
    if (hit && hit.object && hit.faceIndex !== undefined && hit.faceIndex !== null) {
      const vi = hit.faceIndex * 3;
      for (const sg of segs) for (const p of sg.parts) if (p.mesh === hit.object) for (const [st, n] of p.ranges) if (vi >= st && vi < st + n) return sg;
    }
    let best = null, bd = 4;
    if (point) for (const sg of segs) { if (sg.gone) continue; const dd = segWorld(u, sg).distanceTo(point); if (dd < bd) { bd = dd; best = sg; } }
    return best;
  }
  function chunkMat() {
    if (!CHAR_MAT) CHAR_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.85, metalness: 0.45 });
    return CHAR_MAT;
  }
  // Mảnh thép nhỏ vỡ ra (miểng giáp, nắp gạch ERA): khối dẹt méo mó văng theo hướng out
  function spawnChunks(u, point, out, n, size, speed, mat) {
    for (let i = 0; i < n; i++) {
      const sz = size * rand(0.5, 1.1);
      const g = new THREE.BoxGeometry(sz * rand(0.7, 1.3), Math.max(0.08, sz * rand(0.08, 0.18)), sz * rand(0.5, 1.0));
      const pa = g.attributes.position;
      for (let k = 0; k < pa.count; k++) pa.setXYZ(k, pa.getX(k) * rand(0.7, 1.15), pa.getY(k), pa.getZ(k) * rand(0.7, 1.15));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat || chunkMat());
      m.castShadow = true; m.userData.ownGeo = true;
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.copy(point).add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4)));
      holder.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      holder.userData.radius = sz * 0.5;
      const dir = out.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(0, 0.6), rand(-0.5, 0.5))).normalize();
      spawnDebris(u, holder, dir.multiplyScalar(speed * rand(0.6, 1.2)), { mat: 'plate' });
    }
  }
  // Hướng "ra ngoài" tại khối: từ trục xe ra (ngang) + hơi ngóc lên
  function segOut(u, sg) {
    const w = segWorld(u, sg), c = u.group.position;
    const o = new THREE.Vector3(w.x - c.x, 0, w.z - c.z);
    if (o.lengthSq() < 1e-6) o.set(0, 1, 0);
    return o.normalize().add(new THREE.Vector3(0, 0.25, 0)).normalize();
  }
  // Pháp tuyến mặt ngoài của khối (thế giới): tấm thép trong gạch ERA văng vuông góc mặt gạch, không theo hướng tâm xe
  function segNormal(u, sg) {
    const o = segOut(u, sg);
    if (!sg.nL) return o;
    const n = sg.nL.clone().transformDirection(sg.parts[0].mesh.matrixWorld);
    return n.dot(o) < 0 ? n.negate() : n;
  }
  // Pháp tuyến ngoài trong hệ lưới chứa khối (parts[0].mesh) + bề dày khối theo pháp tuyến
  function segLocalNormal(u, sg) {
    const m0 = sg.parts[0].mesh;
    const nl = segNormal(u, sg).transformDirection(new THREE.Matrix4().copy(m0.matrixWorld).invert());
    const sz = sg.lbox.getSize(new THREE.Vector3());
    return { nl, thick: Math.abs(sz.x * nl.x) + Math.abs(sz.y * nl.y) + Math.abs(sz.z * nl.z), span: Math.max(sz.x, sz.y, sz.z) };
  }
  // Biến dạng tại chỗ một khối (nắp gạch móp vênh, gạch xệ trên giá): f(v) sửa v (hệ parts[0].mesh) tại chỗ, trả true nếu
  // có dời. Tam giác bị dời tính lại pháp tuyến mặt (khối là hộp phẳng) — keepN: chỉ tịnh tiến, giữ pháp tuyến cũ; vết đạn
  // dán trên khối dời theo. Lưu ảnh chụp để hồi sinh
  function warpSeg(u, sg, f, keepN) {
    const d = state(u), m0 = sg.parts[0].mesh;
    u.group.updateMatrixWorld(true);
    const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
    const area = sg.lbox.clone().expandByScalar(0.5);
    for (const p of sg.parts) {
      // khối nằm ở lưới khác (gạch bắt trên váy xích): quy về hệ parts[0].mesh để dùng chung tâm / pháp tuyến
      const K = p.mesh === m0 ? null : new THREE.Matrix4().copy(m0.matrixWorld).invert().multiply(p.mesh.matrixWorld);
      const Ki = K ? K.clone().invert() : null;
      const fx = (q) => { if (K) q.applyMatrix4(K); const r = f(q); if (Ki) q.applyMatrix4(Ki); return r; };
      const g = p.mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal;
      for (const [st, cnt] of p.ranges) {
        d.saved.push({ attr: pos, start: st, data: pos.array.slice(st * 3, (st + cnt) * 3) });
        if (nor) d.saved.push({ attr: nor, start: st, data: nor.array.slice(st * 3, (st + cnt) * 3) });
        for (let t = st; t + 2 < st + cnt; t += 3) {
          let moved = false;
          for (let j = 0; j < 3; j++) {
            if (!fx(v.fromBufferAttribute(pos, t + j))) continue;
            pos.setXYZ(t + j, v.x, v.y, v.z);
            moved = true;
          }
          if (!moved || !nor || keepN) continue;
          v.fromBufferAttribute(pos, t); a.fromBufferAttribute(pos, t + 1).sub(v); b.fromBufferAttribute(pos, t + 2).sub(v);
          n.crossVectors(a, b);
          if (n.lengthSq() < 1e-12) continue;
          n.normalize();
          for (let j = 0; j < 3; j++) nor.setXYZ(t + j, n.x, n.y, n.z);
        }
      }
      pos.needsUpdate = true;
      if (nor) nor.needsUpdate = true;
      refitDecals(u, p.mesh, (q, out) => {
        out.copy(q);
        if (K) out.applyMatrix4(K);
        if (!area.containsPoint(out) || !f(out)) return false;
        if (Ki) out.applyMatrix4(Ki);
        return true;
      });
    }
    fieldChanged(u, true);
  }
  // Nắp gạch ERA trúng đạn súng máy / 30mm (không kích nổ): nắp thép mỏng móp, vênh quanh chỗ trúng — nửa ngoài của hộp bị
  // ép lõm theo pháp tuyến (mép quanh điểm trúng lõm nhiều nhất), mặt áp vỏ xe giữ nguyên
  function bendLid(u, sg, point) {
    const m0 = sg.parts[0].mesh;
    u.group.updateMatrixWorld(true);
    const { nl, thick, span } = segLocalNormal(u, sg);
    let P = point ? m0.worldToLocal(point.clone()) : null;
    if (!P) {
      // máy nhận bản tóm tắt: không có điểm trúng -> một góc ngẫu nhiên của nắp
      P = sg.lc.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(span * 0.4));
    }
    const r = span * 0.9, depth = thick * rand(0.22, 0.4), half = Math.max(1e-3, thick * 0.5);
    const w = new THREE.Vector3();
    warpSeg(u, sg, (v) => {
      const h = w.subVectors(v, sg.lc).dot(nl);
      if (h <= 0) return false;
      w.subVectors(v, P);
      const L = w.addScaledVector(nl, -w.dot(nl)).length();
      if (L >= r) return false;
      v.addScaledVector(nl, -depth * (1 - L / r) * Math.min(1, h / half));
      return true;
    });
  }
  // Bao cát (sandbagL / sandbagR) bị bắn rách: cát chảy ra, bao xẹp bè xuống quanh đáy (bao đè bên trên tụt theo)
  function slumpBag(u, tag, sg) {
    if (sg.sag || sg.gone) return;
    sg.sag = true;
    const B = sg.lbox, c = sg.lc, y0 = B.min.y, hb = B.max.y - y0, ky = rand(0.62, 0.75), kx = rand(1.04, 1.08);
    dropBagsAbove(u, tag, sg, hb * (1 - ky));
    warpSeg(u, sg, (v) => {
      v.set(c.x + (v.x - c.x) * kx, y0 + (v.y - y0) * ky, c.z + (v.z - c.z) * kx);
      return true;
    });
    B.max.y = y0 + hb * ky; B.getCenter(c);
  }
  // Bao sg0 xẹp / bung khỏi chồng: các bao xếp đè bên trên (đáy cao hơn, chồng phần lớn bề ngang) tụt xuống h
  function dropBagsAbove(u, tag, sg0, h) {
    const B0 = sg0.lbox, y1 = B0.min.y + (B0.max.y - B0.min.y) * 0.4, off = new THREE.Vector3(0, -h, 0);
    // bao chồng lệch qua giữa đuôi xe có thể thuộc nửa bên kia (sandbagL / sandbagR) -> xét cả hai
    for (const sg of segmentsOf(u, 'sandbagL').concat(segmentsOf(u, 'sandbagR'))) {
      if (sg === sg0 || sg.gone) continue;
      const B = sg.lbox, ov = Math.min(B.max.x, B0.max.x) - Math.max(B.min.x, B0.min.x);
      if (B.min.y < y1 || ov < 0.3 * (B.max.x - B.min.x)) continue;
      warpSeg(u, sg, (v) => { v.y -= h; return true; }, true);
      B.translate(off); sg.lc.y -= h; sg.box.translate(off);
    }
  }
  let SAND_MAT = null;
  function sandMat() {
    if (!SAND_MAT) SAND_MAT = new THREE.MeshStandardMaterial({ color: 0x9a8762, roughness: 1, metalness: 0 });
    return SAND_MAT;
  }
  // Gạch ERA bị đạn bắn nát bu-lông / giá bắt: hộp gạch xệ, treo lệch trên một bu-lông góc trên còn lại (xoay quanh pháp
  // tuyến cho mép dưới tụt xuống) và mép dưới hơi chõe ra khỏi vỏ xe
  function sagSeg(u, sg) {
    if (sg.sag || sg.gone) return;
    sg.sag = true;
    const m0 = sg.parts[0].mesh;
    u.group.updateMatrixWorld(true);
    const { nl } = segLocalNormal(u, sg);
    const upL = new THREE.Vector3(0, 1, 0).transformDirection(new THREE.Matrix4().copy(m0.matrixWorld).invert());
    let t = upL.clone().addScaledVector(nl, -upL.dot(nl));
    // gạch nằm ngang (nóc tháp): không có "mép trên" -> xoay lệch quanh một góc bất kỳ
    if (t.lengthSq() < 0.04) t = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(nl);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0).cross(nl);
    t.normalize();
    const s = nl.clone().cross(t).normalize();
    const B = sg.lbox, c = sg.lc, k = new THREE.Vector3();
    const ext = (dir) => {
      let m = -Infinity;
      for (let i = 0; i < 8; i++) {
        k.set(i & 1 ? B.max.x : B.min.x, i & 2 ? B.max.y : B.min.y, i & 4 ? B.max.z : B.min.z).sub(c);
        m = Math.max(m, k.dot(dir));
      }
      return m;
    };
    const sd = Math.random() < 0.5 ? 1 : -1;
    const pivot = c.clone().addScaledVector(t, ext(t)).addScaledVector(s, sd * ext(s.clone().multiplyScalar(sd))).addScaledVector(nl, -ext(nl.clone().negate()));
    const arm = c.clone().sub(pivot);
    // chiều xoay: tâm khối tụt xuống (theo -t); mép dưới chõe ra ngoài (theo +nl)
    const a1 = rand(0.14, 0.28) * (k.crossVectors(nl, arm).dot(t) > 0 ? -1 : 1);
    const a2 = rand(0.05, 0.12) * (k.crossVectors(s, arm).dot(nl) > 0 ? 1 : -1);
    const R = new THREE.Matrix4().makeRotationAxis(s, a2).multiply(new THREE.Matrix4().makeRotationAxis(nl, a1));
    const T = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    warpSeg(u, sg, (v) => { v.applyMatrix4(T); return true; });
    const wp = segWorld(u, sg);
    sparksAt(wp, 5); sfx('armorPlate', wp, 0.45);
  }
  // Tấm giáp gốc (giáp mũi, module má tháp): mất / nứt thì mặt giáp đó mỏng đi. Tấm composite mua thêm (appliqueKit)
  // tính qua Equipment.appliqueCovers (mất từ nửa số tấm một bên là coi như hết tác dụng)
  function segFace(tag) { return /^appliqueKit/.test(tag) ? null : armorPartFace(tag); }
  // Tấm giáp nứt: vài miểng thép vỡ bung ra, mép nứt
  function crackSeg(u, tag, sg, point, events, remote) {
    if (sg.cracked || sg.gone) return;
    sg.cracked = true;
    u.group.updateMatrixWorld(true);
    const wp = point || segWorld(u, sg);
    if (/^sandbag/.test(tag)) {
      // bao cát: vải rách, cát chảy, bao xẹp — không tóe lửa, không làm mỏng giáp vỏ
      slumpBag(u, tag, sg);
      spawnChunks(u, wp, segOut(u, sg), 2, 0.5, 8, sandMat());
      sfx('debrisHit', wp, 0.45, { mat: 'bag' });
      events.push({ type: 'armor', text: `${partName(tag)} BỊ BẮN RÁCH — cát chảy, trúng thêm sẽ bung` });
      return;
    }
    if (partKind(tag) === 'era') {
      // gạch ERA: nắp thép mỏng móp vênh, vài mẩu sơn / vụn nắp văng — thuốc nổ bên trong không kích nổ
      bendLid(u, sg, point);
      spawnChunks(u, wp, segNormal(u, sg), 1, 0.35, 18, chunkMat());
      sparksAt(wp, 8); sfx('armorPlate', wp, 0.55);
    } else {
      spawnChunks(u, wp, segOut(u, sg), 2, 0.7, 30, chunkMat());
      sparksAt(wp, 14); sfx('armorPlate', wp, 0.8);
    }
    const P = segFace(tag);
    if (P && !remote) thinFace(state(u), P, Math.pow(1.08, 1 / Math.max(1, segmentsOf(u, tag).length)));
    if (partKind(tag) !== 'era') events.push({ type: 'armor', text: `${partName(tag)} BỊ NỨT VỠ — trúng thêm sẽ bung ra` });
  }
  // Khối bị phá: 'era' — viên gạch kích nổ (chớp nổ, nắp thép văng, để lại đế cháy sém); 'plate' — tấm giáp gãy bu-lông /
  // bung mối hàn, rơi khỏi xe (va chạm đúng mặt vỏ: dốc mũi, nóc, đất). Gạch ERA rời giá mà KHÔNG kích nổ: 'loose' — bị đạn
  // súng máy / 30mm bắn nát bu-lông, tuột khỏi giá rơi xuống; 'blown' — sức nổ gần (viên bên cạnh nổ, đạn nổ phá) giật đứt
  // bu-lông hất văng cả hộp
  function breakSeg(u, tag, sg, mode, point, events, remote) {
    if (VIS_ONLY || sg.gone) return false;
    const d = state(u), segs = segmentsOf(u, tag);
    sg.gone = true; sg.hp = 0; sg.how = mode;
    u.group.updateMatrixWorld(true);
    const wp = segWorld(u, sg), out = segOut(u, sg);
    const era = partKind(tag) === 'era', nW = era ? segNormal(u, sg) : out;
    if (FX && FX.removeUnitMarksIn) {
      const mb = sg.lbox ? sg.lbox.clone().expandByScalar(0.4).applyMatrix4(sg.parts[0].mesh.matrixWorld) : sg.box.clone().expandByScalar(0.4).applyMatrix4(u.group.matrixWorld);
      FX.removeUnitMarksIn(u, mb);
    }
    const holder = cutParts(u, sg.parts);
    u._partCenters = null;
    fieldChanged(u, true);
    const size = sg.box.getSize(new THREE.Vector3());
    const big = Math.max(size.x, size.y, size.z);
    if (/^sandbag/.test(tag)) {
      // bao cát bung khỏi giá: bao rách rơi "huỵch" xuống đất, cát đổ tung; các bao đè bên trên tụt xuống chỗ trống
      spawnDebris(u, holder, out.clone().multiplyScalar(rand(6, 12)), { mat: 'bag' });
      spawnChunks(u, wp, out, 4, 0.7, 14, sandMat());
      sfx('debrisHit', wp, 0.8, { mat: 'bag' });
      dropBagsAbove(u, tag, sg, (sg.lbox.max.y - sg.lbox.min.y) * 0.85);
      const left = segs.filter(x => !x.gone).length;
      if (!left) d.lost.add(tag);
      events.push({ type: 'armor', text: left ? 'BUNG MỘT BAO CÁT ĐUÔI XE — đuôi xe hở dần' : `${partName(tag)}: HẾT BAO — bên đó hở giáp đuôi` });
      return true;
    }
    if (mode === 'era') {
      // nắp thép + vỏ hộp gạch bị thổi tung thành mảnh (tấm thép ngoài văng vuông góc mặt gạch), hộp không bay nguyên viên
      holder.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
      const mat = sg.parts[0].mesh.material;
      spawnChunks(u, wp, nW, 2, big * 0.6, 85, Array.isArray(mat) ? mat[0] : mat);
      spawnChunks(u, wp, nW, 3, big * 0.3, 60, chunkMat());
      if (FX && FX.eraBurst) FX.eraBurst(wp, nW, big);
      else if (FX && FX.spawn) FX.spawn(wp.x, wp.y, wp.z, 'CLUSTER_SUBMUNITION', 'DIRECT_HIT', {});
      sparksAt(wp, 20); sfx('era', wp);
      // đế gạch cháy sém trên vỏ phía sau (tấm thép trong bị ép đập vào vỏ)
      if (FX && FX.hitUnitSurface && FX.addSurfaceMark) {
        const h = FX.hitUnitSurface(u, wp.clone().addScaledVector(nW, 4), nW.clone().negate(), 10);
        if (h && h.object) FX.addSurfaceMark(h.point, h.normal, h.object, 'scorch', Math.max(2.2, big * 1.4), { unit: u });
      }
      if (!remote) eraKnock(u, sg, wp, big, events);
    } else if (era) {
      // cả hộp gạch (đã móp) rời giá; bên dưới chỉ lộ giá bắt + vỏ xe — không có hố xuyên
      const blown = mode !== 'loose';
      const imp = nW.clone().multiplyScalar(blown ? rand(20, 32) : rand(5, 9)).add(new THREE.Vector3(0, blown ? 12 : -26, 0));
      spawnDebris(u, holder, imp, { mat: 'plate' });
      spawnChunks(u, wp, nW, blown ? 2 : 1, 0.35, blown ? 30 : 12, chunkMat());
      sparksAt(wp, blown ? 12 : 6); sfx('armorPlate', wp, blown ? 0.8 : 0.5);
    } else {
      // giáp gốc lộ ra chỗ tấm vừa bung: hố cày của phát đạn vừa xuyên qua tấm
      if (point && FX && FX.hitUnitSurface && FX.addSurfaceMark) {
        const h = FX.hitUnitSurface(u, point.clone().addScaledVector(out, 5), out.clone().negate(), 10);
        if (h && h.object) FX.addSurfaceMark(h.point, h.normal, h.object, 'armorCrater', 3.4, { unit: u });
      }
      spawnDebris(u, holder, out.clone().multiplyScalar(18), { mat: 'plate' });
      spawnChunks(u, wp, out, 2, 0.6, 28, chunkMat());
      sparksAt(wp, 18); sfx('armorPlate', wp);
    }
    const left = segs.filter(x => !x.gone).length;
    const name = partName(tag);
    if (mode === 'era') {
      if (!left) { d.lost.add(tag); events.push({ type: 'era', text: `${name}: đã nổ hết` }); }
    } else if (era) {
      if (!left) d.lost.add(tag);
      events.push({ type: 'era', text: mode !== 'loose' ? `SỨC NỔ HẤT BUNG MỘT VIÊN ${name} — viên đó không kích nổ, chỗ đó hở giáp nổ`
        : `MỘT VIÊN ${name} BỊ ĐẠN BẮN RƠI KHỎI GIÁ — chỗ đó hết giáp nổ` });
    } else {
      const P = segFace(tag);
      if (P && !remote) thinFace(d, P, Math.pow(tag.startsWith('cheek') || tag.startsWith('applique') ? 1.22 : 1.12, 1 / Math.max(1, segs.length)));
      // tấm ghép mua thêm: bung từ nửa số tấm một bên -> mặt đó coi như hết lớp tăng cường
      if (!left || (/^appliqueKit/.test(tag) && left <= segs.length / 2)) d.lost.add(tag);
      events.push({ type: 'armor', text: segs.length > 1 ? `BUNG MỘT TẤM ${name} — chỗ đó lộ giáp gốc` : `BUNG ${name} — mặt giáp đó mỏng hơn` });
    }
    return true;
  }
  // Độ bền mất mỗi phát trúng THẲNG vào tấm giáp hàn / bắt bu-lông (đạn xuyên khoét lỗ, nổ lõm cháy thủng, nổ phá làm nứt)
  const PLATE_DMG = { small: 0, cannon: 0.025, kinetic: 0.34, heat: 0.28, blast: 0.18 };
  // Bao cát: vải bố rách được cả bằng đạn súng máy — 12.7mm ~20 viên một bao, 30mm ~7, đạn pháo / nổ lõm / nổ phá ~2 phát
  const BAG_DMG = { small: 0.05, cannon: 0.14, kinetic: 0.5, heat: 0.6, blast: 0.5 };
  // Gạch ERA trúng đạn không kích nổ (12.7mm, 30mm): vỏ hộp thép mỏng bị bắn thủng, móp nắp, gãy bu-lông. Xe 6 nòng: 12.7mm
  // ~6 viên nắp móp, ~10 viên xệ, ~14 viên rơi; 30mm ~4 / 7 / 9. Gạch trên xe tăng chủ lực nặng & vỏ dày hơn (x0,6)
  const ERA_DMG = { small: 0.075, cannon: 0.12 };
  const ERA_CLS = { heavy: 0.6, medium: 1, light: 1, soft: 1 };
  // how (chỉ gạch ERA): 'loose' — đạn bắn rơi khỏi giá, 'blown' — sức nổ hất bung
  function damageSeg(u, tag, sg, amt, point, events, how) {
    if (VIS_ONLY || !sg || sg.gone || !(amt > 0)) return;
    sg.hp -= amt;
    const era = partKind(tag) === 'era';
    if (sg.hp <= 0) breakSeg(u, tag, sg, era ? (how || 'blown') : 'plate', point, events);
    else {
      if (sg.hp <= 0.55) crackSeg(u, tag, sg, point, events);
      if (era && sg.hp <= 0.25) sagSeg(u, sg);
    }
  }
  // Viên gạch kích nổ: các viên kề bên không nổ theo (thuốc nổ kém nhạy) nhưng sức nổ làm móp nắp, xô lệch, đôi khi giật
  // đứt bu-lông hất bung cả hộp
  function eraKnock(u, sg0, wp, big, events) {
    const d = state(u), R = big * 2.2, ev = [];
    for (const t of Object.keys(u.partRegistry || {})) {
      if (partKind(t) !== 'era' || !segmented(t) || d.lost.has(t)) continue;
      for (const sg of segmentsOf(u, t)) {
        if (sg === sg0 || sg.gone) continue;
        const k = 1 - segWorld(u, sg).distanceTo(wp) / R;
        if (k <= 0) continue;
        damageSeg(u, t, sg, Math.random() < 0.22 * k ? 2 : rand(0.4, 1.1) * k, wp, ev, 'blown');
      }
    }
    const seen = new Set();
    for (const e of ev) if (!seen.has(e.text)) { seen.add(e.text); events.push(e); }
  }
  // Sức nổ gần: các khối trong bán kính R mất độ bền (gạch ERA không kích nổ vì mảnh / sóng nổ — chỉ bị hất bung khi hết bền)
  function damageSegsNear(u, point, R, amt, events) {
    if (VIS_ONLY || !u.partRegistry || !(amt > 0)) return;
    const d = state(u), ev = [];
    u.group.updateMatrixWorld(true);
    for (const tag of Object.keys(u.partRegistry)) {
      if (!segmented(tag) || d.lost.has(tag)) continue;
      for (const sg of segmentsOf(u, tag)) {
        if (sg.gone) continue;
        const dist = segWorld(u, sg).distanceTo(point);
        if (dist < R) damageSeg(u, tag, sg, amt * (1 - dist / R), point, ev);
      }
    }
    // một vụ nổ: mỗi loại thông báo một lần
    const seen = new Set();
    for (const e of ev) if (!seen.has(e.text)) { seen.add(e.text); events.push(e); }
  }

  // Uốn cong bộ phận quanh mép gắn vào thân xe theo hướng lực đánh (méo vè, váy xích oằn, gương bẻ quặt)
  function bendTag(u, tag, impulse) {
    const d = state(u);
    if (d.bent.has(tag) || d.lost.has(tag)) return false;
    const entries = u.partRegistry && u.partRegistry[tag];
    if (!entries || !entries.length) return false;
    const c = partCenter(u, tag);
    if (!c) return false;
    d.bent.add(tag);
    // Hướng lực trong hệ của mesh
    const mesh = c.mesh;
    mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const dirL = impulse.clone().normalize().transformDirection(inv);
    // Mép gắn: phía gần thân xe (tâm xe ~ gốc hệ mesh theo phương ngang); váy xích / chắn bùn treo từ mép trên
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for (const e of entries) for (const [st, n] of e.ranges) for (let i = st; i < st + n; i++) box.expandByPoint(v.fromBufferAttribute(e.mesh.geometry.attributes.position, i));
    const hang = /^(skirt|flap|cage|mirror)/.test(tag);
    const pivot = new THREE.Vector3(
      hang ? (c.local.x) : (Math.abs(box.min.x) < Math.abs(box.max.x) ? box.min.x : box.max.x),
      hang ? box.max.y : box.min.y,
      c.local.z
    );
    let axis = new THREE.Vector3(0, 1, 0).cross(dirL);
    if (axis.lengthSq() < 1e-4) axis.set(0, 0, 1);
    axis.normalize();
    const ang = (hang ? rand(0.25, 0.55) : rand(0.12, 0.3)) * (Math.random() < 0.85 ? 1 : -1);
    const R = new THREE.Matrix4().makeRotationAxis(axis, ang);
    const T = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    const nm = new THREE.Matrix3().getNormalMatrix(R);
    for (const e of entries) {
      const pos = e.mesh.geometry.attributes.position, nor = e.mesh.geometry.attributes.normal;
      for (const [st, n] of e.ranges) {
        d.saved.push({ attr: pos, start: st, data: pos.array.slice(st * 3, (st + n) * 3) });
        if (nor) d.saved.push({ attr: nor, start: st, data: nor.array.slice(st * 3, (st + n) * 3) });
        for (let i = st; i < st + n; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(T); pos.setXYZ(i, v.x, v.y, v.z);
          if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
        }
      }
      pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
    }
    const wp = mesh.localToWorld(c.local.clone());
    sparksAt(wp, 6); sfx('armorPlate', wp, 0.5);
    return true;
  }

  // Lồng thép bị bắn: móp / xé TẠI CHỖ trúng thay vì cả mảng lồng oằn theo một khối. Nan lồng dựng thành từng khúc ngắn
  // (equipment.js segBar) nên uốn được giữa thanh: các đỉnh trong bán kính R bị đẩy lõm theo hướng đạn (giảm dần ra mép,
  // gợn không đều như thép bị bóp), power >= 0.8 (RPG, tên lửa, đạn nổ, đạn xuyên) xé thủng: khúc nan nằm trong lõi hố
  // co về một điểm (mất hẳn) -> lỗ toác với đầu nan gãy vểnh vào trong quanh mép. Mảng lồng hứng đủ CAGE_SHRED phát nặng thì nát, cả
  // mảng bung khỏi xe (detachTag). Trả về số "phát nặng" mảng đã hứng
  function dentCage(u, tag, point, dir, power) {
    const d = state(u);
    const entries = u.partRegistry && u.partRegistry[tag];
    if (!entries || !entries.length || d.lost.has(tag)) return 0;
    const R = 1.6 + power * 2.2, depth = 0.25 + power * 1.5, tearR = power >= 0.8 ? 0.6 + power * 0.9 : 0;
    const R2 = R * R, T2 = tearR * tearR;
    const saved = d.cageSaved || (d.cageSaved = new Set());
    const inv = new THREE.Matrix4(), pL = new THREE.Vector3(), dL = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Vector3();
    const seed = Math.random() * 10;
    let touched = false;
    for (const e of entries) {
      const mesh = e.mesh, pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
      mesh.updateMatrixWorld(true);
      inv.copy(mesh.matrixWorld).invert();
      pL.copy(point).applyMatrix4(inv);
      dL.copy(dir).transformDirection(inv).normalize();
      let hitMesh = false;
      for (const [st, n] of e.ranges) {
        // ảnh chụp gốc của khoảng đỉnh (trả lại khi hồi sinh) — chụp 1 lần, ngay trước lần biến dạng đầu tiên
        const key = mesh.uuid + ':' + st;
        const keep = () => {
          if (saved.has(key)) return;
          saved.add(key);
          d.saved.push({ attr: pos, start: st, data: pos.array.slice(st * 3, (st + n) * 3) });
          if (nor) d.saved.push({ attr: nor, start: st, data: nor.array.slice(st * 3, (st + n) * 3) });
        };
        for (let t = st; t + 2 < st + n; t += 3) {
          // tâm tam giác: trong lõi hố xé -> co cả tam giác về tâm (khúc nan đứt mất)
          c.set(0, 0, 0);
          for (let j = 0; j < 3; j++) c.add(v.fromBufferAttribute(pos, t + j));
          c.multiplyScalar(1 / 3);
          const cr2 = c.distanceToSquared(pL);
          if (cr2 >= (R + 1.5) * (R + 1.5)) continue;
          if (T2 && cr2 < T2) { keep(); hitMesh = true; for (let j = 0; j < 3; j++) pos.setXYZ(t + j, c.x, c.y, c.z); continue; }
          for (let j = 0; j < 3; j++) {
            v.fromBufferAttribute(pos, t + j);
            const r2 = v.distanceToSquared(pL);
            if (r2 >= R2) continue;
            keep(); hitMesh = true;
            const k = (1 - r2 / R2) * (1 - r2 / R2);
            const w = 0.75 + 0.5 * Math.sin(v.x * 2.3 + seed) * Math.cos(v.y * 1.9 - seed);   // thép bóp không đều
            pos.setXYZ(t + j, v.x + dL.x * depth * k * w, v.y + dL.y * depth * k * w - depth * 0.15 * k, v.z + dL.z * depth * k * w);
          }
        }
      }
      if (!hitMesh) continue;
      touched = true;
      pos.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }
    d.cageHits = d.cageHits || {};
    if (!touched) return d.cageHits[tag] || 0;   // nổ xa, không nan nào trong vùng: không tính
    sparksAt(point, power >= 0.8 ? 14 : 5);
    sfx('armorPlate', point, Math.min(1, 0.3 + power * 0.5));
    if (power >= 0.8) d.cageHits[tag] = (d.cageHits[tag] || 0) + 1;
    return d.cageHits[tag] || 0;
  }
  const CAGE_POWER = { small: 0.12, cannon: 0.35, kinetic: 0.8, heat: 1.0, blast: 0.9 };
  const CAGE_SHRED = 6;   // mảng lồng (cả một mặt sườn / nóc) hứng chừng ấy phát nặng thì nát, bung khỏi xe

  // Đám cháy bám theo xe tại điểm trúng (hệ tọa độ group của xe): lỗ xuyên giáp, bình xăng, kho đạn
  function addFire(u, worldPt, strength, life) {
    const d = state(u);
    extinguisherSound(u, worldPt);
    if (d.fires.length >= 4) d.fires.shift();
    const l = u.group.worldToLocal(worldPt.clone());
    d.fires.push({ x: l.x, y: l.y, z: l.z, k: strength || 1, life: life || 20, t: 0, wet: 0, douseAt: rand(0.45, 0.9) });
    return d.fires[d.fires.length - 1];
  }

  // Xe lội nước: đám cháy nằm dưới mặt nước thì tắt sau ~0,5-0,9 s ngập (nước tràn vào lỗ thủng / khoang máy),
  // xèo hơi nước trắng; đám cháy cao hơn mặt nước (nóc tháp, khoang kíp lái) vẫn cháy như thường.
  // Mỗi máy tự tính theo vị trí xe (đã đồng bộ) — đám cháy trên xe chỉ là hình ảnh cục bộ, không gửi mạng
  const _wp = new THREE.Vector3();
  function douseFires(u, d, dt, fx) {
    const wy = u.waterY;
    if (wy === null || wy === undefined || !(u.waterDepth > 0.5) || !d.fires.length) return;
    let n = 0;
    for (let i = d.fires.length - 1; i >= 0; i--) {
      const f = d.fires[i];
      u.group.localToWorld(_wp.set(f.x, f.y, f.z));
      if (_wp.y >= wy + 0.6) { f.wet = 0; continue; }
      f.wet = (f.wet || 0) + dt;
      if (f.wet < (f.douseAt || 0.6)) continue;
      d.fires.splice(i, 1);
      if (fx && fx.douseSteam) fx.douseSteam(_wp, wy, f.k, n === 0);
      n++;
    }
    if (n) logDoused(u);
  }
  function logDoused(u) {
    const g = typeof window !== 'undefined' ? window.game : null;
    if (!u.isPlayer || !g || !g.addCombatLog) return;
    const now = Date.now();
    if (u._douseLogAt && now - u._douseLogAt < 5000) return;
    u._douseLogAt = now;
    g.addCombatLog('[[flame-off]] Nước tràn lên dập tắt đám cháy trên xe', 'tip');
  }

  // Bình chữa cháy tự động (trang bị): cảm biến thấy lửa -> xả khí dập lửa ngay (nghe "PSSSHH"; trong xe mình to & rõ)
  function extinguisherSound(u, p) {
    if (!u || u.isDead || typeof Equipment === 'undefined' || !Equipment.has || !Equipment.has(u, 'fireext')) return;
    const now = Date.now();
    if (u._extSndAt && now - u._extSndAt < 4000) return;
    u._extSndAt = now;
    sfx('fireExt', p || u.group.position, 1, { inside: !!u.isPlayer });
  }

  // Kính cabin bị sóng nổ / mảnh văng đánh vỡ: nứt mạng nhện cả ô kính + mảnh kính văng
  function shatterGlass(u, origin, maxRays) {
    if (!FX || !FX.hitUnitSurface || !FX.addSurfaceMark) return 0;
    let n = 0;
    const c = u.group.position.clone().add(new THREE.Vector3(0, 14, 0));
    for (let i = 0; i < (maxRays || 6); i++) {
      const target = c.clone().add(new THREE.Vector3(rand(-12, 12), rand(-4, 6), rand(-20, 20)).applyQuaternion(u.group.quaternion));
      const dir = target.clone().sub(origin);
      const len = dir.length();
      dir.normalize();
      const h = FX.hitUnitSurface(u, origin, dir, len + 30);
      if (!h || !h.object.material || !h.object.material.userData || h.object.material.userData.surface !== 'glass') continue;
      shatterAllGlass(u);
      if (FX.fire) for (let k = 0; k < 10; k++) FX.fire.add({ x: h.point.x, y: h.point.y, z: h.point.z, vx: rand(-40, 40), vy: rand(0, 40), vz: rand(-40, 40), size: rand(0.4, 0.9), grow: 0, drag: 0.5, grav: 120, life: rand(0.5, 1.1), alpha: 0.9, fadeIn: 0.005, c0: [0.85, 0.92, 0.95], c1: [0.6, 0.7, 0.75], cell: 3 });
      sfx('glass', h.point);
      n++;
    }
    return n;
  }

  // Ăng-ten gần điểm nổ bị gãy văng
  function breakAntennas(u, point, radius, prob, impulse) {
    if (!u.antennaSets) return;
    const d = state(u);
    for (const set of u.antennaSets) {
      set.whips.forEach((w, i) => {
        if (w.hidden) return;
        const wp = w.base.clone().applyMatrix4(set.parent.matrixWorld);
        const dist = point ? wp.distanceTo(point) : 0;
        if (point && dist > radius) return;
        if (Math.random() > prob * (point ? (1 - dist / radius) * 0.6 + 0.4 : 1)) return;
        set.setHidden(i, true);
        d.hiddenAnt.push([set, i]);
        // Mảnh ăng-ten: roi mảnh gãy văng ra
        const g = new THREE.CylinderGeometry(w.r1, w.r0, w.len * 0.8, 4);
        const m = new THREE.Mesh(g, set.material);
        m.userData.ownGeo = true;
        const holder = new THREE.Group();
        holder.add(m);
        holder.position.copy(wp).add(new THREE.Vector3(0, w.len * 0.4, 0));
        holder.userData.radius = 0.3;
        spawnDebris(u, holder, impulse.clone().multiplyScalar(0.6), { mat: 'whip' });
      });
    }
    // Liên lạc vô tuyến: gãy 1 cần -> mất liên lạc đồng đội (radioLost); gãy HẾT -> mất cả bản đồ số trên xe (mapLost:
    // minimap tắt, không mở được bản đồ chiến thuật). Xem TeamIntel / game.js
    if (!VIS_ONLY && d.hiddenAnt.length) {
      d.radioLost = true;
      if (u.antennaSets.every(set => set.whips.every(w => w.hidden))) d.mapLost = true;
    }
  }

  // MẶT ĐỠ CỦA VỎ XE: bản đồ độ cao thật của vỏ — thân trong hệ chassisGroup, tháp trong hệ turretGroup (xoay / gục theo
  // tháp) — lấy mẫu trên từng tam giác. Mảnh vỡ tì / nảy / trượt đúng trên dốc giáp mũi, nóc, chắn bùn, nóc tháp; xe còn
  // sống cũng đỡ mảnh (trước đây chỉ xác xe có một "hộp phẳng" cao bằng điểm cao nhất của thân: mảnh lơ lửng trên dốc mũi,
  // còn mảnh văng từ xe đang sống rơi xuyên qua thân xuống đất)
  const HF_CELL = 0.8;
  function visibleIn(o, root) {
    for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return false;
    return true;
  }
  function buildField(meshes, space) {
    space.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(space.matrixWorld).invert(), M = new THREE.Matrix4();
    const box = new THREE.Box3(), v = new THREE.Vector3();
    const pts = [];
    for (const m of meshes) {
      M.multiplyMatrices(inv, m.matrixWorld);
      const pa = m.geometry.attributes.position, n = pa.count - pa.count % 3;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(M);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
        box.expandByPoint(v);
      }
      pts.push(arr);
    }
    if (box.isEmpty()) return null;
    const x0 = box.min.x - HF_CELL, z0 = box.min.z - HF_CELL;
    const nx = Math.ceil((box.max.x - x0) / HF_CELL) + 2, nz = Math.ceil((box.max.z - z0) / HF_CELL) + 2;
    const h = new Float32Array(nx * nz).fill(-Infinity);
    const put = (x, z, y) => {
      const i = Math.floor((x - x0) / HF_CELL), k = Math.floor((z - z0) / HF_CELL);
      if (i < 0 || k < 0 || i >= nx || k >= nz) return;
      const c = k * nx + i;
      if (y > h[c]) h[c] = y;
    };
    for (const a of pts) {
      for (let t = 0; t + 8 < a.length; t += 9) {
        const ax = a[t], ay = a[t + 1], az = a[t + 2], bx = a[t + 3], by = a[t + 4], bz = a[t + 5], cx = a[t + 6], cy = a[t + 7], cz = a[t + 8];
        if (ax === bx && ay === by && az === bz && ax === cx && ay === cy && az === cz) continue;   // bộ phận đã tách (thu về 1 điểm)
        // cạnh tam giác (gồm cả mép trên của vách đứng)
        for (const [px, py, pz, qx, qy, qz] of [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]]) {
          const L = Math.hypot(qx - px, qz - pz), ns = Math.max(1, Math.ceil(L / (HF_CELL * 0.5)));
          for (let j = 0; j <= ns; j++) { const f = j / ns; put(px + (qx - px) * f, pz + (qz - pz) * f, py + (qy - py) * f); }
        }
        // lòng tam giác: tâm từng ô nằm trong hình chiếu xz
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-6) continue;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / HF_CELL)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / HF_CELL));
        const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / HF_CELL)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / HF_CELL));
        for (let k = k0; k <= k1; k++) {
          const pz = z0 + (k + 0.5) * HF_CELL;
          for (let i = i0; i <= i1; i++) {
            const px = x0 + (i + 0.5) * HF_CELL;
            const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det, l3 = 1 - l1 - l2;
            if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
            const y = l1 * ay + l2 * by + l3 * cy, c = k * nx + i;
            if (y > h[c]) h[c] = y;
          }
        }
      }
    }
    return { space, x0, z0, nx, nz, h, box, inv: new THREE.Matrix4(), key: new Float32Array(16).fill(NaN) };
  }
  function supportField(u) {
    const d = state(u);
    if (d.hf && !(d.hfDirty && performance.now() - d.hfAt > 400)) return d.hf;
    const cg = u.chassisGroup || u.group, tg = u.turretGroup;
    const hull = [], tur = [];
    cg.traverse(o => {
      if (!deformableMesh(u, o) || isOnGun(u, o) || !visibleIn(o, u.group)) return;
      (tg && isOnTurret(u, o) ? tur : hull).push(o);
    });
    const H = buildField(hull, cg), T = tg && tur.length ? buildField(tur, tg) : null;
    d.hf = { hull: H, tur: T };
    d.hfDirty = false; d.hfAt = performance.now();
    // hộp thân (hệ chassisGroup) cho slideOffHullEdge
    d.hullBoxC = H ? H.box.clone() : null;
    return d.hf;
  }
  // vỏ vừa đổi: force = bộ phận vừa tách (dựng lại ngay), không thì dựng lại tối đa 2,5 lần / giây (móp lõm liên tục)
  function fieldChanged(u, force) {
    const d = state(u);
    if (force) d.hf = null; else d.hfDirty = true;
  }
  const _fl = new THREE.Vector3();
  function fieldTop(F, x, z) {
    const sp = F.space, e = sp.matrixWorld.elements, K = F.key;
    let same = true;
    for (let i = 0; i < 16; i++) if (K[i] !== e[i]) { same = false; break; }
    if (!same) { F.inv.copy(sp.matrixWorld).invert(); K.set(e); }
    _fl.set(x, e[13], z).applyMatrix4(F.inv);
    const i = Math.floor((_fl.x - F.x0) / HF_CELL), k = Math.floor((_fl.z - F.z0) / HF_CELL);
    if (i < 0 || k < 0 || i >= F.nx || k >= F.nz) return -Infinity;
    const y = F.h[k * F.nx + i];
    if (y === -Infinity) return -Infinity;
    _fl.y = y;
    return _fl.applyMatrix4(sp.matrixWorld).y;
  }
  // Mặt đỡ của vỏ xe tại (x, z) (thế giới), -Infinity nếu ngoài hình chiếu xe
  function hullTopAt(u, x, z) {
    if (!u || !u.group) return -Infinity;
    const F = supportField(u);
    let top = F.hull ? fieldTop(F.hull, x, z) : -Infinity;
    if (F.tur && !(u.fxWreck && u.fxWreck.turret) && u.turretGroup.visible && u.turretGroup.parent) top = Math.max(top, fieldTop(F.tur, x, z));
    return top;
  }
  // pháp tuyến mặt vỏ tại (x, z) theo độ dốc bản đồ độ cao (dốc giáp mũi, sườn tháp...)
  function hullNormalAt(u, x, z, out) {
    const e = HF_CELL, t = hullTopAt(u, x, z);
    const g = (dx, dz) => { const y = hullTopAt(u, x + dx, z + dz); return y === -Infinity || Math.abs(y - t) > 2.5 ? t : y; };
    return out.set(-(g(e, 0) - g(-e, 0)) / (2 * e), 1, -(g(0, e) - g(0, -e)) / (2 * e)).normalize();
  }
  function debrisFloor(D, x, z) {
    const gy = groundProvider ? groundProvider(x, z) : 0;
    // Mảnh tách ra từ dưới nóc (bánh xe, đèn, hộp đồ sườn) chưa bay cao quá nóc thì không "đậu" lên nóc:
    // trước đây bánh văng sinh ở tâm bánh (trong hình chiếu thân) bị dịch tức thì lên nằm trên nóc xe
    if (D.under) return gy;
    return Math.max(gy, hullTopAt(D.u, x, z));
  }
  // Khoảng hở thấp nhất giữa mảnh (tư thế q, vị trí pos) và mặt đỡ; âm = đang ngập
  const _dc = new THREE.Vector3();
  function debrisClearance(D, q, pos) {
    if (!D.corners || !D.corners.length) return pos.y - (debrisFloor(D, pos.x, pos.z) + D.r * 0.45);
    let mn = Infinity;
    for (const c of D.corners) {
      _dc.copy(c).multiply(D.obj.scale).applyQuaternion(q).add(pos);
      mn = Math.min(mn, _dc.y - debrisFloor(D, _dc.x, _dc.z));
    }
    return mn;
  }
  // Mảnh có tâm ở ngoài mép thân xác xe mà một góc gác lên nóc: trọng tâm không có chỗ tựa -> trượt khỏi mép rơi xuống đất
  // (không nằm chênh vênh treo một góc trên nóc thân)
  // Trả về vị trí nằm yên mới (bản sao)
  function slideOffHullEdge(D, q) {
    const u = D.u, pos = D.obj.position.clone();
    if (!D.corners || !D.corners.length || hullTopAt(u, pos.x, pos.z) > -Infinity) return pos;
    const d = u && u.dmg, B = d && d.hullBoxC, cg = u && u.chassisGroup;
    if (!B || !cg) return pos;
    const inv = new THREE.Matrix4().copy(cg.matrixWorld).invert();
    const lc = pos.clone().applyMatrix4(inv);
    const cx = (B.min.x + B.max.x) / 2, cz = (B.min.z + B.max.z) / 2;
    const alongX = Math.abs(lc.x - cx) / (B.max.x - B.min.x) > Math.abs(lc.z - cz) / (B.max.z - B.min.z);
    const sg = alongX ? Math.sign(lc.x - cx) || 1 : Math.sign(lc.z - cz) || 1;
    let push = 0;
    for (const c of D.corners) {
      const l = c.clone().multiply(D.obj.scale).applyQuaternion(q).add(pos).applyMatrix4(inv);
      if (l.x < B.min.x || l.x > B.max.x || l.z < B.min.z || l.z > B.max.z) continue;
      push = Math.max(push, alongX ? (sg > 0 ? B.max.x - l.x : l.x - B.min.x) : (sg > 0 ? B.max.z - l.z : l.z - B.min.z));
    }
    if (push <= 0) return pos;
    const dir = new THREE.Vector3(alongX ? sg : 0, 0, alongX ? 0 : sg).transformDirection(cg.matrixWorld).setY(0).normalize();
    return pos.addScaledVector(dir, push + 0.3);
  }
  function debrisFloorNormal(D, pos) {
    const ht = hullTopAt(D.u, pos.x, pos.z);
    if (ht > -Infinity && ht >= (groundProvider ? groundProvider(pos.x, pos.z) : 0)) return hullNormalAt(D.u, pos.x, pos.z, new THREE.Vector3());
    if (!groundProvider) return new THREE.Vector3(0, 1, 0);
    const e = 2, g = groundProvider;
    return new THREE.Vector3(-(g(pos.x + e, pos.z) - g(pos.x - e, pos.z)) / (2 * e), 1, -(g(pos.x, pos.z + e) - g(pos.x, pos.z - e)) / (2 * e)).normalize();
  }

  // Một bước vật lý vật rắn: trọng lực, cản không khí, xoay theo vận tốc góc (quaternion — không lắc lư kiểu góc Euler),
  // va chạm tại từng góc với mặt đất / nóc xác xe bằng xung lực (nảy + ma sát) -> mảnh lộn, trượt, lăn, đổ nằm tự nhiên
  function stepDebris(D, h) {
    const M = DEBRIS_MAT[D.mat];
    D.v.y -= DEBRIS_G * h;
    const ka = Math.exp(-M.air * h);
    D.v.multiplyScalar(ka);
    D.w.multiplyScalar(Math.exp(-(0.05 + M.air) * h));
    D.x.addScaledVector(D.v, h);
    const q = D.obj.quaternion, w = D.w, hh = 0.5 * h;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    q.set(qx + hh * (w.x * qw + w.y * qz - w.z * qy), qy + hh * (w.y * qw + w.z * qx - w.x * qz),
      qz + hh * (w.z * qw + w.x * qy - w.y * qx), qw + hh * (-w.x * qx - w.y * qy - w.z * qz)).normalize();
    if (D.under === null) { const t0 = hullTopAt(D.u, D.p0.x, D.p0.z); D.under = t0 > -Infinity && D.p0.y < t0; }
    if (D.under) {
      // ra khỏi hình chiếu thân, hoặc bay cao hơn nóc -> từ đây mới được tì lên nóc xác xe
      const ht = hullTopAt(D.u, D.x.x, D.x.z);
      if (ht === -Infinity || D.x.y - D.reach * 0.5 > ht) D.under = false;
    }
    // còn cao hơn mặt đỡ cả một tầm với -> chưa thể chạm
    if (D.x.y - debrisFloor(D, D.x.x, D.x.z) > D.reach + 1) return null;
    let deep = 0, hit = 0, impact = 0, onHull = false;
    const invM = 1 / D.mass;
    for (const c of D.cr) {
      _r.copy(c).applyQuaternion(q);
      const px = D.x.x + _r.x, py = D.x.y + _r.y, pz = D.x.z + _r.z;
      const gy = groundProvider ? groundProvider(px, pz) : 0;
      const ht = D.under ? -Infinity : hullTopAt(D.u, px, pz);
      let fy = Math.max(gy, ht), pen = fy - py;
      if (pen <= 0) continue;
      if (ht > gy && pen > 1.5) {
        // góc mảnh lọt vào hình chiếu thân ở thấp hơn hẳn mặt vỏ: đó là vách sườn / mũi, không phải mặt để đỡ ->
        // dội ra ngoài theo phương ngang (không "dịch tức thì" lên nằm trên nóc)
        const cx = D.u.group.position.x, cz = D.u.group.position.z;
        _a.set(px - cx, 0, pz - cz);
        if (_a.lengthSq() > 1e-6) {
          _a.normalize();
          const vin = D.v.x * _a.x + D.v.z * _a.z;
          if (vin < 0) { D.v.x -= 1.4 * vin * _a.x; D.v.z -= 1.4 * vin * _a.z; }
          D.x.x += _a.x * 0.15; D.x.z += _a.z * 0.15;
        }
        fy = gy; pen = fy - py;
        if (pen <= 0) continue;
      }
      if (!hit) {
        // pháp tuyến mặt đỡ (dốc địa hình / dốc vỏ xe)
        if (fy > gy + 0.01) { hullNormalAt(D.u, px, pz, _n); onHull = true; }
        else if (!groundProvider) _n.set(0, 1, 0);
        else { const e = 2, g = groundProvider; _n.set(-(g(px + e, pz) - g(px - e, pz)) / (2 * e), 1, -(g(px, pz + e) - g(px, pz - e)) / (2 * e)).normalize(); }
      }
      hit++;
      if (pen > deep) deep = pen;
      // vận tốc của chính điểm chạm = v + w × r
      _a.copy(D.w).cross(_r).add(D.v);
      const vn = _a.dot(_n);
      if (vn >= 0) continue;
      const e = -vn > 16 ? M.e * (onHull ? 1.4 : 1) : 0;   // chạm nhẹ thì không nảy (khỏi rung giật)
      invInertia(D, _b.copy(_r).cross(_n), _b);
      const kn = invM + _n.dot(_b.cross(_r));
      const jn = -(1 + e) * vn / kn;
      D.v.addScaledVector(_n, jn * invM);
      D.w.add(invInertia(D, _b.copy(_r).cross(_n).multiplyScalar(jn), _b));
      if (-vn > impact) impact = -vn;
      // ma sát Coulomb tại điểm chạm: mảnh cày / trượt trên đất, bánh xe lăn
      _a.copy(D.w).cross(_r).add(D.v);
      _t.copy(_a).addScaledVector(_n, -_a.dot(_n));
      const vt = _t.length();
      if (vt > 1e-4) {
        _t.multiplyScalar(1 / vt);
        invInertia(D, _b.copy(_r).cross(_t), _b);
        const kt = invM + _t.dot(_b.cross(_r));
        const jt = Math.min(vt / kt, (onHull ? 0.6 : 1) * M.mu * jn);
        D.v.addScaledVector(_t, -jt * invM);
        D.w.add(invInertia(D, _b.copy(_r).cross(_t).multiplyScalar(-jt), _b));
      }
    }
    if (!hit) return null;
    D.x.y += deep * 0.9;
    // lực cản lăn / đất lún: bánh xe lăn chậm dần, mảnh thép đang lắc thì dừng hẳn
    D.w.multiplyScalar(Math.exp(-(D.round ? 0.5 : 0.9) * h));
    return { impact, onHull, hits: hit };
  }

  function updateDebris(dt) {
    for (let i = debrisList.length - 1; i >= 0; i--) {
      const D = debrisList[i];
      D.t += dt;
      if (D.t > 60) { removeDebris(i); continue; }
      if (D.rest) {
        if (D.settle && D.settle.t < 1) {
          D.settle.t = Math.min(1, D.settle.t + dt / 0.3);
          const k = D.settle.t * D.settle.t * (3 - 2 * D.settle.t);
          D.obj.quaternion.copy(D.settle.q0).slerp(D.settle.q1, k);
          D.obj.position.lerpVectors(D.settle.p0, D.settle.p1, k);
          // đang ngả xuống: đầu mảnh dài không được quét xuyên đất
          if (D.settle.t < 1) { const c = debrisClearance(D, D.obj.quaternion, D.obj.position); if (c < 0) D.obj.position.y -= c; }
        } else if (D.hullRest && !D.u.isDead) {
          // mảnh nằm trên vỏ xe còn sống: xe chạy đi / xoay tháp -> mặt đỡ đổi -> mảnh lại rơi, trượt khỏi xe
          D.chk = (D.chk || 0) - dt;
          if (D.chk <= 0) {
            D.chk = 0.1;
            const c = debrisClearance(D, D.obj.quaternion, D.obj.position);
            if (c > 0.35 || c < -0.35) {
              D.rest = false; D.calm = 0; D.settle = null; D.hullRest = false; D.t = Math.min(D.t, 5);
              D.x.copy(D.comL).applyQuaternion(D.obj.quaternion).add(D.obj.position);
              D.v.set(0, c < 0 ? 4 : 0, 0); D.w.set(0, 0, 0);
            }
          }
        }
        continue;
      }
      // chia bước nhỏ (≤ 1/120 s) để va chạm góc ổn định, không xuyên đất khi rơi nhanh
      const n = Math.min(6, Math.ceil(dt / (1 / 120)));
      const h = dt / n;
      let impact = 0, onHull = false, touching = false, hits = 0;
      for (let s = 0; s < n; s++) {
        const c = stepDebris(D, h);
        if (!c) continue;
        touching = true;
        if (c.hits > hits) hits = c.hits;
        if (c.impact > impact) { impact = c.impact; onHull = c.onHull; }
      }
      D.obj.position.copy(D.comL).applyQuaternion(D.obj.quaternion).negate().add(D.x);
      D.sndCd -= dt; D.scrCd -= dt;
      // Tiếng va ở đúng lúc / đúng chỗ từng lần chạm (lần nảy sau nhỏ dần theo tốc độ va), theo vật liệu mảnh
      if (impact > 7 && D.sndCd <= 0) {
        const k = Math.min(1.6, Math.pow(impact / 45, 1.1) * (0.55 + 0.3 * D.mass));
        if (k > 0.06) sfx('debrisHit', D.obj.position.clone(), k, { mat: D.mat, hull: onHull, m: D.mass, first: D.bounces === 0 });
        D.sndCd = 0.07;
        D.bounces++;
      }
      // Mảnh cày / trượt lê trên đất (bánh xe lăn thì không rít)
      const vh = Math.hypot(D.v.x, D.v.z);
      if (touching && !D.round && vh > 9 && D.scrCd <= 0 && impact <= 7) {
        sfx('debrisScrape', D.obj.position.clone(), Math.min(1.2, vh / 50) * (0.5 + 0.25 * D.mass), { mat: D.mat, hull: onHull });
        D.scrCd = 0.18;
      }
      // Ngủ: tì vững trên ≥ 3 điểm, gần như đứng yên một lúc -> nằm yên (vật lý đã đặt mảnh nằm đúng tư thế);
      // đang chênh vênh trên một cạnh / đầu mút thì để nó tự đổ tiếp
      if (touching && hits >= 3 && D.v.length() < 2.5 && D.w.length() < 0.9) D.calm += dt; else D.calm = 0;
      if (D.calm > 0.25) { D.rest = true; D.hullRest = onHull || hullTopAt(D.u, D.x.x, D.x.z) > (groundProvider ? groundProvider(D.x.x, D.x.z) : 0) + 0.5; continue; }
      if (D.t > 9) {
        // chống kẹt (trường hợp hiếm): ép nằm xuống mặt rộng gần nhất, mượt 0.3 s
        D.rest = true;
        const dm = D.dims;
        const ax = (dm.x <= dm.y && dm.x <= dm.z) ? new THREE.Vector3(1, 0, 0) : (dm.z <= dm.y ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
        const q0 = D.obj.quaternion.clone();
        const aw = ax.clone().applyQuaternion(q0);
        const nn = debrisFloorNormal(D, D.obj.position);
        const up = aw.dot(nn) >= 0 ? nn : nn.clone().negate();
        const q1 = D.round ? q0.clone() : new THREE.Quaternion().setFromUnitVectors(aw.normalize(), up).multiply(q0);
        const p0 = D.obj.position.clone(), p1 = slideOffHullEdge(D, q1);
        p1.y -= debrisClearance(D, q1, p1) + 0.05;
        D.settle = { q0, q1, p0, p1, t: 0 };
        D.hullRest = hullTopAt(D.u, p1.x, p1.z) > (groundProvider ? groundProvider(p1.x, p1.z) : 0) + 0.5;
      }
    }
    // Lốp xẹp dần (xì hơi ~1.2 giây)
    for (const u of animUnits) {
      const d = u.dmg;
      if (!d || !u.wheelSet) { animUnits.delete(u); continue; }
      let busy = false;
      for (const k in d.flatAnim) {
        const target = d.shred && d.shred[k] ? 1.9 : 1;
        const f = Math.min(target, d.flatAnim[k] + dt / 1.2);
        d.flatAnim[k] = f;
        u.wheelSet.setFlat(+k, f);
        if (f < target) busy = true;
      }
      if (!busy) animUnits.delete(u);
    }
  }
  const animUnits = new Set();

  // ---------------------------------------------------------------------------
  // HỎNG HÓC CƠ KHÍ
  // ---------------------------------------------------------------------------
  const WHEEL_NAMES_4 = ['TRƯỚC TRÁI', 'TRƯỚC PHẢI', 'SAU TRÁI', 'SAU PHẢI'];
  const WHEEL_NAMES_6 = ['TRƯỚC TRÁI', 'TRƯỚC PHẢI', 'GIỮA TRÁI', 'GIỮA PHẢI', 'SAU TRÁI', 'SAU PHẢI'];

  // Văng hẳn bánh xe (đạn nổ lõm / xuyên / nổ mạnh sát bánh): bánh bay khỏi trục, góc xe sụt xuống
  function blowWheel(u, i, events, fx, impulse) {
    if (VIS_ONLY) return false;
    const d = state(u);
    const ws = u.wheelSet;
    if (!ws || d.gone[i] || i < 0 || i >= ws.positions.length) return false;
    if (!d.flat[i]) flatTire(u, i, [], fx, true);
    d.gone[i] = true;
    ws.gone[i] = 1;
    ws.update();
    const p = ws.positions[i];
    const wp = (u.chassisGroup || u.group).localToWorld(new THREE.Vector3(p.x, p.y, p.z));
    // Mảnh bánh xe nguyên khối văng ra (lấy đúng hình học bánh của xe)
    const holder = new THREE.Group();
    for (const im of ws.meshes) {
      const m = new THREE.Mesh(im.geometry, im.material);
      m.castShadow = true;
      holder.add(m);
    }
    holder.position.copy(wp);
    holder.rotation.y = (u.group.rotation.y || 0) + (p.x < 0 ? Math.PI : 0);
    holder.userData.radius = ws.radius * 0.9;
    const side = new THREE.Vector3(Math.sign(p.x), 0, 0).applyQuaternion(u.group.quaternion);
    spawnDebris(u, holder, side.multiplyScalar(rand(40, 80)).add(impulse ? impulse.clone().multiplyScalar(0.4) : new THREE.Vector3()), { mat: 'rubber', round: true });
    sparksAt(wp, 20);
    sfx('tire', wp, 1.3);
    const names = ws.positions.length > 4 ? WHEEL_NAMES_6 : WHEEL_NAMES_4;
    events.push({ type: 'wheel', text: `VĂNG BÁNH ${names[i] || ''} — moay-ơ cày đất, xe sụt góc, chạy rất chậm` });
    return true;
  }

  function flatTire(u, i, events, fx, silent) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.flat[i] || !u.wheelSet || i < 0 || i >= u.wheelSet.positions.length) return false;
    d.flat[i] = true;
    d.flatAnim[i] = d.flatAnim[i] || 0;
    animUnits.add(u);
    const names = u.wheelSet.positions.length > 4 ? WHEEL_NAMES_6 : WHEEL_NAMES_4;
    // Thứ tự bánh trong model: theo trục (trước -> sau), mỗi trục trái rồi phải
    if (!silent) events.push({ type: 'tire', text: `XỊT LỐP ${names[i] || ''} — xe lệch, kéo lái, tốc độ giảm` });
    { const pp = u.wheelSet.positions[i]; if (!silent) sfx('tireHiss', (u.chassisGroup || u.group).localToWorld(new THREE.Vector3(pp.x, pp.y, pp.z))); }
    if (fx && fx.smoke) {
      const p = u.wheelSet.positions[i];
      const wp = new THREE.Vector3(p.x, p.y, p.z);
      (u.chassisGroup || u.group).localToWorld(wp);
      for (let k = 0; k < 8; k++) {
        fx.smoke.add({ x: wp.x, y: wp.y, z: wp.z, vx: rand(-14, 14), vy: rand(2, 12), vz: rand(-14, 14), size: rand(2, 3.5), grow: 6, drag: 3, life: rand(0.6, 1.2), alpha: 0.45, fadeIn: 0.02, c0: [0.75, 0.72, 0.66], cell: 2 });
      }
    }
    return true;
  }

  // Dải xích nằm ngay tại / sát điểm trúng (hệ khung gầm): trả bên xích (0 trái, 1 phải) hoặc -1.
  // over > 0: tính cả chắn bùn / váy xích / mép thân ngay trên đỉnh xích — đạn nổ ở đó oằn tấm thép đè xuống xích,
  // mảnh văng & sóng nổ gãy chốt mắt xích
  function trackSideAt(u, local, over = 0) {
    const T = u.trackSystem;
    if (!T || !T.sidesX || !T.path || !T.path.segs) return -1;
    if (!T._dmgBox) {
      let u0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      for (const s of T.path.segs) {
        if (s.type === 'arc') { u0 = Math.min(u0, s.C.u - s.C.r); u1 = Math.max(u1, s.C.u + s.C.r); v1 = Math.max(v1, s.C.v + s.C.r); }
        else for (const p of [s.p0, s.p1]) { u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u); v1 = Math.max(v1, p.v); }
      }
      T._dmgBox = { u0, u1, v1 };
    }
    const B = T._dmgBox;
    if (local.y > B.v1 + 1 + over || local.z < B.u0 - 2 || local.z > B.u1 + 2) return -1;
    let best = -1, bd = 4.5 + over * 0.5;
    T.sidesX.forEach((x, s) => { const dx = Math.abs(local.x - x); if (dx < bd) { bd = dx; best = s; } });
    return best;
  }

  function breakTrack(u, side, events, fx, point) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.trackTimer[side] > 0) return false;
    d.track[side] = 1;
    // Kíp xe nối xích tạm: lần đầu ~9 s, xích đứt lại nhiều lần thì càng lâu (thiếu mắt xích dự phòng)
    d.trackBreaks[side] = (d.trackBreaks[side] || 0) + 1;
    // gốc: kíp xe nối xích ~18 s, mỗi lần đứt lại thêm 8 s (thiếu mắt xích dự phòng) — nhân hệ số nhịp game
    const ts = typeof GameTiming !== 'undefined' ? GameTiming.timerScale : 0.5;
    d.trackTimer[side] = (18 + 8 * (d.trackBreaks[side] - 1)) * ts;
    // còn đoạn xích dự phòng trên xe: thay nguyên đoạn thay vì chắp mắt xích cũ -> nhanh hơn ~40%, dùng xong là hết
    if (hasPart(u, 'spareTrack')) { d.trackTimer[side] *= 0.6; d.useSpareTrack = true; }
    d.trackTime0 = d.trackTime0 || [0, 0];
    d.trackTime0[side] = d.trackTimer[side];
    d.trackWear[side] = 0.6;
    if (u.trackSystem && u.trackSystem.breakSide) {
      const lz = point ? (u.chassisGroup || u.group).worldToLocal(point.clone()).z : 0;
      u.trackSystem.breakSide(side, lz < 0);
    }
    if (point) sfx('trackSnap', point);
    events.push({ type: 'track', text: `ĐỨT XÍCH ${side ? 'PHẢI' : 'TRÁI'} — xe gần như bất động ~${Math.round(d.trackTimer[side])} giây để nối xích` });
    if (fx && point) {
      if (fx.spawnSparks) fx.spawnSparks(point.x, point.y, point.z, 1.1, { sparks: 1.3 }, true, 0, 0);
      // Vài mắt xích văng ra
      const mat = u.hullMainMesh ? u.hullMainMesh.material : null;
      for (let k = 0; k < 1; k++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x3e3b35, roughness: 0.8, metalness: 0.5 }));
        m.userData.ownGeo = true;
        const holder = new THREE.Group();
        holder.add(m);
        holder.position.copy(point).add(new THREE.Vector3(rand(-2, 2), 1, rand(-3, 3)));
        holder.userData.radius = 0.8;
        spawnDebris(u, holder, new THREE.Vector3(rand(-30, 30), 10, rand(-30, 30)), { mat: 'link' });
      }
      void mat;
    }
    return true;
  }

  function damageEngine(u, events, severe) {
    if (VIS_ONLY) return false;
    const d = state(u);
    const before = d.engine;
    d.engine = Math.min(2, d.engine + (severe ? 2 : 1));
    if (d.engine === before) return false;
    events.push({ type: 'engine', text: d.engine >= 2 ? 'ĐỘNG CƠ HỎNG NẶNG — bốc khói đen, xe gần như nằm im' : 'ĐỘNG CƠ TRÚNG ĐẠN — mất công suất, tăng tốc kém' });
    return true;
  }

  function damageRing(u, events) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.ring || !u.turretGroup) return false;
    d.ring = true;
    events.push({ type: 'ring', text: 'KẸT VÒNG QUAY THÁP — tháp xoay rất chậm' });
    return true;
  }

  // Hư CƠ CẤU PHÁO bên trong tháp (khóa nòng, bộ hãm lùi, mô-tơ quay nòng): bắn chậm hơn; trúng lần nữa có thể phá hẳn
  function damageGun(u, events) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.gun) {
      // trúng pháo / súng lần nữa khi đã hư: khóa nòng kẹt -> không bắn được nữa
      if (d.gunDead || Math.random() > 0.5) return false;
      return destroyGun(u, events);
    }
    d.gun = true;
    const t = u.tankType === 'GATLING' ? 'CỤM 6 NÒNG HƯ HẠI — mô-tơ quay nòng khởi động chậm'
      : u.tankType === 'SCOUT' ? 'SÚNG MÁY HƯ HẠI — tốc độ bắn giảm'
        : u.tankType === 'ARTILLERY' ? 'BỘ HÃM LÙI LỰU PHÁO HƯ — nạp đạn chậm' : 'PHÁO CHÍNH HƯ HẠI — nạp đạn chậm';
    events.push({ type: 'gun', text: t });
    return true;
  }

  // Tư thế nhóm nòng theo hư hại, tính từ tư thế gốc lưu lần đầu (d.gunBent): cụm 6 nòng (quay quanh trục, không uốn lưới
  // được) nghiêng cả cụm theo hướng nòng cong (d.bendRot); nòng bị phá thì gục xuống
  function poseBarrel(u) {
    const d = state(u), bg = u.barrelGroup || u.gatlingCluster;
    if (!bg) return;
    if (!d.gunBent) d.gunBent = { obj: bg, rot: bg.rotation.clone() };
    const r = d.gunBent.rot, b = d.bendRot || { x: 0, y: 0 };
    bg.rotation.x = r.x + b.x - (d.gunDead ? 0.11 : 0);
    bg.rotation.y = r.y + b.y;
  }

  // Chiều dài ống nòng (hệ nhóm nòng, nòng chạy theo -z từ gốc nhóm)
  function tubeLen(u) {
    const d = state(u), bg = u.barrelGroup || u.gatlingCluster;
    if (d.barrelLen || !bg) return d.barrelLen || 40;
    bg.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(bg.matrixWorld).invert();
    let zMin = 0;
    bg.traverse(o => {
      if (!deformableMesh(u, o)) return;
      o.geometry.computeBoundingBox();
      zMin = Math.min(zMin, o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)).min.z);
    });
    return (d.barrelLen = Math.max(4, -zMin));
  }
  // Vị trí trúng dọc ống nòng: f = 0 gốc nòng (buồng đạn, sát tấm chắn) .. 1 miệng nòng
  function tubeFrac(u, point) {
    const bg = u.barrelGroup || u.gatlingCluster;
    if (!bg || !point) return 0.5;
    bg.updateMatrixWorld(true);
    const s = -bg.worldToLocal(point.clone()).z;
    return Math.max(0, Math.min(1, s / tubeLen(u)));
  }
  // Thành ống nòng dày dần về phía buồng đạn (chịu áp suất thuốc phóng lớn nhất): gốc ~1,35 lần, giữa ~0,93, miệng ~0,5
  // (pháo tăng 120: ~95 / 65 / 35 mm). Nhân vào ARMOR_MM.gun
  const tubeWall = (f) => 1.35 - 0.85 * f;

  /**
   * Áp một chỗ cong lên nòng (cả máy có quyền lẫn máy nhận bản tóm tắt — B do máy có quyền gieo, gửi qua mạng):
   * B = { s: khoảng cách từ gốc nhóm nòng tới chỗ cong, bx / by: hướng đạn đẩy (mặt cắt ngang nòng), a: góc cong (rad) }.
   * Đoạn nòng từ chỗ cong ra tới miệng xoay về phía đạn đẩy góc a -> hướng ống nòng (d.bore, hệ nhóm nòng) dời theo; đạn bay
   * theo hướng này (spg.getMuzzleWorldTransform boreDir) chứ không theo kính ngắm. Chỗ cong càng sát miệng nòng: đạn rời
   * đoạn cong sớm, chao đầu nhiều -> tản mát thêm lớn hơn (d.boreSpread)
   */
  function applyBend(u, B) {
    const d = state(u);
    (d.bends = d.bends || []).push(B);
    const L = tubeLen(u), f = Math.min(1, B.s / L);
    const bore = d.bore || new THREE.Vector3(0, 0, -1), side = new THREE.Vector3(B.bx, B.by, 0);
    // đoạn nòng sau chỗ cong quá ngắn (cong sát miệng nòng) không đủ dẫn đạn theo hướng mới: lệch ít hơn góc cong, bù lại
    // đạn chao nhiều (boreSpread)
    const steer = B.a * Math.min(1, Math.max(0, L - B.s) / (0.15 * L));
    d.bore = bore.multiplyScalar(Math.cos(steer)).addScaledVector(side, Math.sin(steer)).normalize();
    d.boreSpread = Math.min(2.2, Math.max(d.boreSpread || 1, 1.3 + 0.7 * f) + (d.bends.length > 1 ? 0.1 : 0));
    if (u.gatlingCluster) {
      // cụm 6 nòng quay: nghiêng cả cụm thay vì uốn lưới (lưới uốn sẽ quay vòng theo cụm)
      d.bendRot = { x: Math.atan2(d.bore.y, -d.bore.z), y: Math.atan2(-d.bore.x, -d.bore.z) };
      poseBarrel(u);
    } else {
      // uốn lưới nòng thật tại chỗ trúng; miệng nòng dời theo (chỗ đạn ra khỏi nòng: d.tipOff)
      bendBarrelAt(u, B.a, B.s, side);
      d.tipOff = (d.tipOff || new THREE.Vector3()).addScaledVector(side, Math.max(0, L - B.s) * Math.sin(B.a));
    }
  }

  // Góc cong theo cỡ đạn & chỗ trúng: thành nòng mỏng ở đầu nòng cong nhiều, gốc nòng dày gần như không cong (độ cứng chống
  // uốn tăng theo bề dày thành)
  const BEND_IMPULSE = { blast: 0.035, heat: 0.022, kinetic: 0.025, cannon: 0.012, small: 0.005 };
  function bendGun(u, events, cls, point, dir) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.gunDead) return false;
    const bg = u.barrelGroup || u.gatlingCluster;
    if (!bg) return false;
    const L = tubeLen(u), f = tubeFrac(u, point);
    const total = (d.bends || []).reduce((t, b) => t + b.a, 0);
    const a = Math.min(0.12 - total, (BEND_IMPULSE[cls] || 0.02) * Math.min(2, Math.pow(tubeWall(0.5) / tubeWall(f), 2)) * rand(0.75, 1.25));
    if (!(a > 0.003)) return false;
    // hướng cong: thành phần ngang nòng của hướng đạn bay (đạn đẩy nòng về phía nó đang bay tới)
    bg.updateMatrixWorld(true);
    const b = dir && dir.lengthSq() > 1e-6 ? dir.clone().transformDirection(new THREE.Matrix4().copy(bg.matrixWorld).invert()) : new THREE.Vector3(0, -1, 0);
    b.z = 0;
    if (b.lengthSq() < 1e-4) b.set(0, -1, 0);
    b.normalize();
    const r3 = (v, k) => Math.round(v * k) / k;
    const B = { s: r3(Math.max(L * 0.08, Math.min(L * 0.94, f * L)), 10), bx: r3(b.x, 1000), by: r3(b.y, 1000), a: r3(a, 10000) };
    const first = !(d.bends && d.bends.length);
    applyBend(u, B);
    const wp = point || bg.getWorldPosition(new THREE.Vector3());
    sparksAt(wp, 14); sfx('armorPlate', wp, 0.8);
    const where = f > 0.7 ? 'ĐOẠN ĐẦU NÒNG' : f > 0.35 ? 'GIỮA NÒNG' : 'GỐC NÒNG';
    const deg = (Math.acos(Math.max(-1, Math.min(1, -d.bore.z))) * 180 / Math.PI).toFixed(1);
    events.push({ type: 'gun', text: (u.tankType === 'GATLING' ? 'CỤM 6 NÒNG' : u.tankType === 'SCOUT' ? 'NÒNG SÚNG MÁY' : 'NÒNG PHÁO')
      + (first ? ` BỊ ĐẬP CONG Ở ${where}` : ` CONG THÊM Ở ${where}`) + ` — lệch ${deg}° khỏi tâm ngắm, phải ngắm bù` });
    return true;
  }

  // THỦNG / GÃY NÒNG (đạn pháo, đầu nổ lõm xuyên ống nòng): bắn tiếp sẽ nổ nòng -> vũ khí chính hết dùng được, nòng gục xuống
  function destroyGun(u, events, f) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.gunDead) return false;
    d.gunDead = true;
    poseBarrel(u);
    const where = f === undefined ? '' : f > 0.7 ? ' ĐOẠN ĐẦU NÒNG' : f > 0.35 ? ' GIỮA NÒNG' : ' GỐC NÒNG';
    events.push({ type: 'gunDead', text: u.tankType === 'SCOUT' ? 'SÚNG MÁY BỊ PHÁ HỦY — không bắn được' : u.tankType === 'GATLING' ? 'CỤM 6 NÒNG BỊ PHÁ HỦY — không bắn được'
      : u.tankType === 'ARTILLERY' ? `NÒNG LỰU PHÁO BỊ XUYÊN THỦNG${where} — không bắn được` : `NÒNG PHÁO BỊ XUYÊN THỦNG${where} — bắn tiếp sẽ nổ nòng, không bắn được` });
    return true;
  }

  /**
   * Phát trúng thẳng vào ỐNG NÒNG / cụm nòng (giáp theo thành ống nòng ARMOR_MM.gun x tubeWall(f), không phải giáp tháp),
   * theo đúng chỗ trúng dọc nòng:
   *  - đạn pháo / tên lửa / RPG xuyên thành ống: thủng nòng, phá hủy ngay (đầu nòng mỏng dễ thủng, gốc nòng dày khó hơn)
   *  - không xuyên (HE đập) / đạn sượt: nòng cong tại chỗ trúng về phía đạn đẩy; gốc nòng quá cứng không cong -> lực đập
   *    dồn vào giá pháo / bộ hãm lùi (hư cơ cấu pháo)
   *  - 30mm / 12.7mm: móp ống, vỡ đầu đo miệng nòng — nhiều viên mới làm cong (đầu nòng dễ hơn); cong rồi trúng tiếp mới
   *    có thể phá hẳn
   */
  function gunHit(u, cls, AO, ric, events, point, dir) {
    const d = state(u), f = tubeFrac(u, point), bent = !!(d.bends && d.bends.length);
    if (cls === 'kinetic' || cls === 'heat' || cls === 'blast') {
      if (AO.pen && !ric) return destroyGun(u, events, f);
      if (Math.random() >= (ric ? 0.5 : 0.85)) return false;
      if (f < 0.15 && !ric) return damageGun(u, events);
      return bent && Math.random() < 0.3 + 0.3 * f ? destroyGun(u, events, f) : bendGun(u, events, cls, point, dir);
    }
    const p = (cls === 'cannon' ? (AO.pen ? 0.3 : 0.08) : (AO.pen ? 0.12 : 0.03)) * (ric ? 0.3 : 1) * (0.5 + f);
    if (Math.random() >= p) return false;
    if (bent && Math.random() < (cls === 'cannon' ? 0.3 : 0.15)) return destroyGun(u, events, f);
    return bendGun(u, events, cls, point, dir);
  }

  // Hiệu ứng riêng khi một bộ phận đặc biệt bị phá
  // remote: áp từ bản tóm tắt của máy khác -> không châm lửa (cháy do máy có quyền tính & gửi riêng);
  // own: xe của chính máy này -> trừ đạn dự trữ / sát thương nổ kho đạn ở đây (máy chủ quyền của xe)
  // Mặt giáp mà bộ phận giáp GỐC của xe che: váy xích L/R -> sườn trái / phải thân xe; tấm giáp mũi -> mặt trước thân
  // xe; module má tháp -> mặt trước THÁP. Đồ mua thêm (appliqueKit: hết tác dụng qua Equipment.armorMul) & lồng thép
  // (không phải giáp vỏ) -> null. Trả { face, turret }
  function armorPartFace(tag) {
    if (/Kit/.test(tag) || /^cage/.test(tag)) return null;
    const m = /^skirt([LR])/.exec(tag);
    if (m) return { face: m[1] === 'L' ? 'sideL' : 'sideR', turret: false };
    if (/^cheek/.test(tag)) return { face: 'front', turret: true };
    if (/^appliqueKit/.test(tag)) return null;   // tấm composite mua thêm: Equipment.appliqueCovers
    // khiên chữ V (xe 6 nòng): giáp cách quãng bắt ngoài mũi — mất tấm thì hết lớp khiên (Equipment.vshieldUp), giáp mũi gốc
    // phía sau vẫn nguyên (trước đây bung tấm khiên lại làm mỏng cả giáp mũi gốc -> khiên nát còn yếu hơn không lắp)
    if (/^appliqueVS/.test(tag)) return null;
    if (/^applique/.test(tag)) return { face: 'front', turret: false };
    return null;
  }
  function thinFace(d, P, k) {
    const L = P.turret ? (d.faceLossT || (d.faceLossT = { front: 1, rear: 1, sideL: 1, sideR: 1, top: 1 })) : d.faceLoss;
    L[P.face] = Math.min(1.5, (L[P.face] || 1) * k);
  }

  function onPartLost(u, tag, kind, events, fx, point, remote, own) {
    const name = partName(tag);
    // Mất bộ phận giáp gốc (bị bắn trúng thẳng hay bị sức nổ lan hất văng): mặt giáp đó mỏng đi.
    // remote: lấy từ bản tóm tắt của máy có quyền — mức mỏng (FL) đã có sẵn trong bản tóm tắt
    if (kind === 'armor' && !remote) {
      const P = armorPartFace(tag);
      if (P) thinFace(state(u), P, tag.startsWith('skirt') ? 1.12 : 1.22);
    }
    const sp = point || partWorld(u, tag);
    if (kind === 'armor' || kind === 'heavyAcc') { sparksAt(sp, 18); sfx('armorPlate', sp); }
    else if (kind === 'era') sfx('era', sp);
    else if (kind === 'fuel') sfx('fuel', sp);
    else if (kind === 'ammo') sfx('cookoff', sp);
    else if (kind === 'optic' || kind === 'sensor') { sfx('glass', sp, 0.6); sfx('snap', sp); sparksAt(sp, 8); }
    else { sfx('snap', sp); sparksAt(sp, 6); }
    // Đám cháy tại đúng chỗ: bình xăng thủng, kho đạn nổ
    if ((kind === 'fuel' || kind === 'ammo') && sp) addFire(u, sp, kind === 'fuel' ? 1.3 : 1.0, kind === 'fuel' ? 40 : 18);
    if (kind === 'era') {
      events.push({ type: 'era', text: `${name} KÍCH NỔ` });
      if (fx && point) fx.spawn(point.x, point.y, point.z, 'CLUSTER_SUBMUNITION', 'DIRECT_HIT', {});
    } else if (kind === 'armor') {
      events.push({ type: 'armor', text: `BONG ${name} — mặt giáp đó mỏng hơn` });
    } else if (kind === 'fuel') {
      events.push({ type: 'fuel', text: `THỦNG ${name} — xe bốc cháy` });
      if (!remote && typeof u.ignite === 'function') u.ignite(5.0);
    } else if (kind === 'ammo') {
      events.push({ type: 'ammo', text: `${name} NỔ — mất đạn dự trữ` });
      if (fx && point) fx.spawn(point.x, point.y, point.z, 'HE', 'DIRECT_HIT', {});
      if (!remote || own) {
        if (u.heAmmoCount) u.heAmmoCount = Math.max(0, u.heAmmoCount - 2);
        if (u.clusterAmmoCount) u.clusterAmmoCount = Math.max(0, u.clusterAmmoCount - 1);
        u.takeDamage && u.takeDamage(0.25, null, 'ZONE');
      }
    } else if (kind === 'optic') {
      events.push({ type: 'optic', text: tag === 'opticGunner' ? `VỠ ${name} — ngắm bắn chậm hơn` : `${name} BỊ BẮN BAY` });
    } else if (kind === 'feed') {
      events.push({ type: 'feed', text: `ĐỨT ${name} — tốc độ bắn giảm` });
    } else if (kind === 'sensor') {
      events.push({ type: 'sensor', text: tag === 'aaRadar'
        ? `${name} BỊ PHÁ — mất cảnh báo drone, tầm phát hiện drone địch về mức mắt thường`
        : `${name} BỊ PHÁ — mất radar: hết phát hiện xe núp bụi & hết báo vị trí cho đồng đội` });
    } else if (kind === 'atgm') {
      events.push({ type: 'atgm', text: `${name} BỊ PHÁ — mất tên lửa chống tăng` });
    } else if (kind === 'heavyAcc') {
      events.push({ type: 'acc', text: tag === 'rcws' ? `VĂNG ${name} — mất súng máy nóc tháp`
        : tag === 'jammer' ? `VĂNG ${name} — hết phá sóng drone`
        : tag === 'agl' || tag === 'rocketPod' ? `VĂNG ${name} — mất vũ khí nóc tháp`
        : tag === 'sradar' ? `VĂNG ${name} — mất radar dò tìm`
        : tag === 'rjam' ? `VĂNG ${name} — hết phá khóa radar`
        : tag === 'kamiRack' ? `VĂNG ${name} — không phóng được UAV cảm tử`
        : tag === 'spareTrack' ? `VĂNG ${name} — đứt xích sẽ nối lâu hơn` : `VĂNG ${name}` });
    } else if (tag === 'spare') {
      sfx('tire', sp, 1.1);
      events.push({ type: 'acc', text: 'NỔ LỐP DỰ PHÒNG — không còn lốp để thay' });
    } else if (tag === 'meteo') {
      events.push({ type: 'acc', text: 'HỎNG CỘT KHÍ TƯỢNG — mất số liệu gió, lựu pháo kém chụm hơn' });
    } else if (tag === 'generator') {
      events.push({ type: 'acc', text: 'HỎNG MÁY PHÁT ĐIỆN — drone sạc pin chậm gấp đôi' });
    }
  }

  // Mặt giáp bị bắn (hệ tháp nếu trúng tháp)
  // dir: hướng bay của đạn (thế giới). Tấm giáp mũi / đuôi rất nghiêng (gần nằm ngang) bị đạn bắn thẳng trúng vẫn
  // là giáp mặt đó (đạn gặp tấm nghiêng ở góc sượt -> dày lên theo góc / dễ nảy); chỉ nóc phẳng, hoặc đạn rơi dốc từ
  // trên xuống (lựu pháo, bom con) mới tính là nóc
  function faceOf(u, hit, onTurret, dir) {
    const frame = onTurret && u.turretGroup ? u.turretGroup : u.group;
    const q = frame.getWorldQuaternion(new THREE.Quaternion()).invert();
    const n = hit.normal.clone().normalize().applyQuaternion(q);
    const plunging = !dir || dir.y < -0.5;
    if (n.y > 0.97 || (n.y > 0.65 && plunging)) return 'top';
    // tấm nghiêng (mũi / đuôi dốc) & mặt vát trong cung trước / sau: số giáp của mặt đã là độ dày quy đổi cho cả cung
    // -> armorOutcome không nhân thêm trọn độ nghiêng (tránh tính trùng)
    if (n.y > 0.65) hit.sloped = true;
    // Đạn tới trong cung ±30° quanh trục dọc xe / tháp: tính giáp mặt trước / đuôi (giáp trước được thiết kế cho cả cung
    // này) — kể cả khi trúng mặt vát hình nêm của tháp hay góc mũi, vốn có pháp tuyến chĩa sang ngang.
    // Trừ tấm SƯỜN THÂN XE (pháp tuyến chĩa ngang trong ~±30°): giáp composite trước mũi không che sườn thân — đạn chéo từ
    // cung trước gặp tấm sườn ở góc xiên thật (vd lệch 25° so với trục xe: sườn 140mm xiên 65° ~ 330mm, không phải 780mm
    // của mũi), armorOutcome tính theo góc chạm thật; sượt quá dốc thì đạn nảy (ExplosionFX.impactSurface). Sườn tháp vẫn
    // tính giáp trước trong cung này (má tháp composite được thiết kế che cả cung ±30°)
    if (dir) {
      const dl = dir.clone().normalize().applyQuaternion(q), hz = Math.hypot(dl.x, dl.z);
      const hullSide = !onTurret && Math.abs(n.x) > 0.85;
      if (hz > 0.2 && Math.abs(dl.z) > 0.866 * hz && !hullSide) { hit.sloped = true; return dl.z > 0 ? 'front' : 'rear'; }
    }
    if (Math.abs(n.z) >= Math.abs(n.x)) return n.z < 0 ? 'front' : 'rear';
    return n.x < 0 ? 'sideL' : 'sideR';
  }

  // Mặt vỏ xe mà đạn bay tới (theo hướng bay, không theo pháp tuyến chỗ chạm) — dùng khi đạn trúng lồng thép:
  // nan thép không phải giáp, giáp tính là mặt vỏ nằm sau lồng
  function faceFromDir(u, dir, onTurret, hit) {
    const frame = onTurret && u.turretGroup ? u.turretGroup : u.group;
    const q = frame.getWorldQuaternion(new THREE.Quaternion()).invert();
    const dl = dir.clone().normalize().applyQuaternion(q), hz = Math.hypot(dl.x, dl.z);
    // góc chạm với mặt vỏ đó (armorOutcome dùng thay cho pháp tuyến thanh nan)
    if (dl.y < -0.5 || hz < 0.2) { if (hit) hit.faceCos = Math.abs(dl.y); return 'top'; }
    if (Math.abs(dl.z) > 0.866 * hz) { if (hit) hit.faceCos = Math.abs(dl.z); return dl.z > 0 ? 'front' : 'rear'; }
    if (hit) hit.faceCos = Math.abs(dl.x);
    return dl.x > 0 ? 'sideL' : 'sideR';
  }

  // Tấm vỏ nằm sau lồng thép theo hướng bay của đạn (bỏ qua nan lồng & vết đạn dán): giáp tính theo tấm này
  const _rcCage = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  // ma trận pháp tuyến (nghịch đảo chuyển vị): đúng cả khi mesh co giãn không đều (transformDirection làm lệch pháp tuyến)
  const _nmCage = typeof THREE !== 'undefined' ? new THREE.Matrix3() : null;
  function plateBehindCage(u, hit, dir) {
    if (!_rcCage || !hit || !hit.point) return null;
    const d = dir.clone().normalize();
    _rcCage.set(hit.point.clone().addScaledVector(d, -0.5), d);
    _rcCage.far = 40;
    const meshes = [];
    u.group.traverse(o => { if (o.isMesh && o.visible && !(o.userData && o.userData.isFxDecal)) meshes.push(o); });
    for (const h of _rcCage.intersectObjects(meshes, false)) {
      if (!h.face || /^cage/.test(tagAtHit(h) || '')) continue;
      return { point: h.point, normal: h.face.normal.clone().applyMatrix3(_nmCage.getNormalMatrix(h.object.matrixWorld)).normalize(), object: h.object, faceIndex: h.faceIndex };
    }
    return null;
  }

  function isOnTurret(u, obj) {
    let o = obj;
    while (o && o !== u.group) {
      if (o === u.turretGroup) return true;
      o = o.parent;
    }
    return false;
  }
  // Ống nòng / cụm nòng (không gồm tấm chắn nòng, piston, súng đồng trục trên chốt nòng — những thứ đó là giáp tháp)
  function isOnTube(u, obj) {
    let o = obj;
    while (o && o !== u.group) {
      if (o === u.barrelGroup || o === u.gatlingCluster) return true;
      o = o.parent;
    }
    return false;
  }
  function isOnGun(u, obj) {
    let o = obj;
    while (o && o !== u.group) {
      if (o === u.barrelPivot || o === u.barrelGroup || o === u.gatlingCluster) return true;
      o = o.parent;
    }
    return false;
  }

  function wheelIndexAt(u, hit, local) {
    const ws = u.wheelSet;
    if (!ws) return -1;
    if (hit && hit.object && hit.object.isInstancedMesh && ws.meshes.includes(hit.object) && hit.instanceId !== undefined) return hit.instanceId;
    let best = -1, bd = Infinity;
    ws.positions.forEach((p, i) => {
      const dd = Math.hypot(p.x - local.x, p.y - local.y, p.z - local.z);
      if (dd < bd) { bd = dd; best = i; }
    });
    return bd < ws.radius + 1.6 ? best : -1;
  }

  // ---------------------------------------------------------------------------
  // API CHÍNH
  // ---------------------------------------------------------------------------
  /**
   * Trúng trực tiếp. Trả { mul, events }: mul nhân vào sát thương gốc (giáp + hướng + ERA).
   * hit: { point, normal, object, faceIndex, instanceId } (có thể null nếu không dò được tia)
   */
  // Vết lõm / rách 3D thật trên vỏ thép: miếng lưới lòng chảo dùng đúng vật liệu sơn của xe, áp sát bề mặt tại điểm trúng
  // (lưới thân xe ít đỉnh nên không bóp méo cả tấm giáp); bắn tiếp vào cùng chỗ -> lõm sâu dần, đục thủng -> mép rách lởm chởm
  const DENT_GEO = {};
  function dentGeo(tear) {
    const key = tear ? 'tear' : 'dent';
    if (DENT_GEO[key]) return DENT_GEO[key];
    const g = new THREE.RingGeometry(0.02, 1, 20, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      let r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      if (tear) {
        // mép rách: bán kính lởm chởm, vành thép bị lật ngược ra ngoài
        const j = 1 + 0.18 * Math.sin(a * 5 + 1.3) * Math.sin(a * 3 - 0.4);
        p.setXY(i, x * j, y * j);
        r = Math.min(1, r);
      }
      // Lòng hố nằm sát mặt vỏ, vành thép bị đẩy trồi lên quanh miệng (như vết đạn thật trên giáp):
      // độ dốc lòng hố cho bóng sáng tối của chỗ lõm; rách thì vành lật cao & lởm chởm
      const lip = r < 0.78 ? Math.pow(r / 0.78, 2.2) : Math.max(0, 1 - Math.pow((r - 0.78) / 0.22, 2));
      const jag = tear ? 0.35 * Math.abs(Math.sin(a * 7 + 0.6)) * (r > 0.6 ? 1 : 0) : 0;
      p.setZ(i, lip * (tear ? 0.55 : 0.3) + jag * lip);
    }
    g.computeVertexNormals();
    return (DENT_GEO[key] = g);
  }
  // UV trung bình của tam giác bị trúng (hit.faceIndex) trên lưới vỏ xe
  function faceUV(mesh, hit) {
    const g = mesh && mesh.geometry, uv = g && g.attributes.uv;
    if (!uv || !hit || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    const I = g.index, f = hit.faceIndex * 3;
    if ((I ? I.count : uv.count) < f + 3) return null;
    let x = 0, y = 0;
    for (let k = 0; k < 3; k++) { const vi = I ? I.getX(f + k) : f + k; x += uv.getX(vi); y += uv.getY(vi); }
    return { x: x / 3, y: y / 3 };
  }
  function dentAt(u, mesh, point, normal, R, depth, tear, hit = null) {
    if (!mesh || !mesh.isMesh || mesh.isInstancedMesh || !normal || mesh.userData.isFxDecal) return;
    const d = state(u);
    d.dents = d.dents || [];
    const key = Math.round(point.x / 2.5) + ',' + Math.round(point.y / 2.5) + ',' + Math.round(point.z / 2.5) + (tear ? 't' : '');
    const om = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // chỉ vỏ thép mới lõm; kính / cao su / bạt không có vết lõm kim loại
    if (!om || (om.userData && (om.userData.surface === 'glass' || om.userData.surface === 'rubber' || om.userData.surface === 'cloth'))) return;
    // giáp dày: vết lõm / rách nhỏ & nông hơn tôn mỏng
    const S = softness(u);
    R *= 0.6 + 0.4 * S; depth *= 0.5 + 0.5 * S;
    let D = d.dents.find(o => o.key === key);
    if (!D) {
      if (d.dents.length >= 36) return;
      const orig = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      d.dentMats = d.dentMats || new Map();
      let mat = d.dentMats.get(orig);
      if (!mat) {
        // cùng sơn / texture với vỏ xe, màu dùng chung đối tượng Color -> xe cháy đen thì vết lõm cũng đen theo
        mat = orig.clone();
        mat.color = orig.color;
        // Vỏ xe tô màu đỉnh (R = che khuất, G = độ cao, B = mặt ngửa) nhưng lưới vết lõm không có màu đỉnh ->
        // shader đọc màu 0 và vết lõm hiện thành đốm đen kịt. Tắt màu đỉnh, giữ shader sơn / bụi / mòn của vỏ.
        mat.vertexColors = false;
        if (orig.onBeforeCompile) { mat.onBeforeCompile = orig.onBeforeCompile; mat.customProgramCacheKey = orig.customProgramCacheKey; }
        mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
        d.dentMats.set(orig, mat);
      }
      // UV của miếng lõm: toàn bộ lấy đúng 1 điểm UV của mặt vỏ bị trúng -> miếng lõm mang đúng màu sơn tại chỗ đó
      // (UV vòng tròn mặc định trải cả texture lên miếng lõm -> lộ hoa văn ngụy trang / ký hiệu bị bóp méo)
      let geo = dentGeo(tear);
      const uv0 = faceUV(mesh, hit);
      if (uv0) {
        geo = geo.clone();
        const U = geo.attributes.uv;
        for (let i = 0; i < U.count; i++) U.setXY(i, uv0.x, uv0.y);
      }
      const m = new THREE.Mesh(geo, mat);
      m.userData.isFxDecal = true;   // tia dò đạn bỏ qua
      m.userData.lift = 0.02;        // độ nhô khỏi vỏ khi dán lại sau biến dạng (refitDecals)
      m.castShadow = false; m.receiveShadow = true;
      mesh.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      m.position.copy(point.clone().addScaledVector(normal, 0.02).applyMatrix4(inv));
      const ln = normal.clone().transformDirection(inv).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ln);
      m.rotateZ(Math.random() * 6.28);
      const sc = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
      m.userData.inv = 1 / Math.max(1e-3, sc.x);
      mesh.add(m);
      D = { key, m, R, depth: 0 };
      d.dents.push(D);
    }
    D.depth = Math.min(tear ? 2.6 : 1.8, D.depth + depth);
    D.R = Math.max(D.R, R);
    const k = D.m.userData.inv;
    D.m.scale.set(D.R * k, D.R * k, Math.max(0.05, D.depth) * k);
  }

  // ---------------------------------------------------------------------------
  // BIẾN DẠNG THẬT CỦA VỎ XE: chỉnh trực tiếp đỉnh lưới (móp sâu, oằn tấm thép, bẹp nóc, xoắn khung, cong nòng)
  // Lưới thân xe vốn ít đỉnh (tấm phẳng lớn) -> lần đầu biến dạng sẽ chia nhỏ tam giác để thép "uốn" được.
  // Lưu hình học gốc để hồi sinh trả nguyên trạng.
  // ---------------------------------------------------------------------------
  const TESS_EDGE = 2.6;          // cạnh tam giác dài hơn mức này thì chia đôi (đơn vị game)
  const TESS_MAX_TRIS = 26000;    // trần số tam giác mỗi mesh sau khi chia
  const _dv = new THREE.Vector3(), _dp = new THREE.Vector3(), _dn = new THREE.Vector3();
  const _ea = new THREE.Vector3(), _eb = new THREE.Vector3(), _ec = new THREE.Vector3();

  // Băm vị trí -> nhiễu giả ngẫu nhiên ổn định (nếp nhăn tôn thép không đổi giữa các lần cập nhật)
  function hash3(x, y, z) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
  }
  // Nhiễu trơn (nội suy giữa các nút lưới băm): nếp oằn tấm thép uốn lượn liền mạch. Nhiễu băm theo từng ô nhỏ
  // trước đây làm mỗi đỉnh lệch một kiểu -> vỏ nổi gai nhọn lởm chởm như giấy vò, không giống thép bị móp
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const sm = t => t * t * (3 - 2 * t);
    const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
    const L = (a, b, t) => a + (b - a) * t;
    const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    return L(L(L(h(0, 0, 0), h(1, 0, 0), fx), L(h(0, 1, 0), h(1, 1, 0), fx), fy),
      L(L(h(0, 0, 1), h(1, 0, 1), fx), L(h(0, 1, 1), h(1, 1, 1), fx), fy), fz) * 2 - 1;
  }
  function wrinkle(x, y, z, f) {
    return vnoise(x * f * 0.5 + 3.1, y * f * 0.5, z * f * 0.5 - 1.7) * 0.7 + vnoise(x * f + 11.3, y * f + 5.2, z * f) * 0.3;
  }
  // Độ cứng vỏ theo cấp giáp: giáp chủ lực dày hàng chục cm chỉ móp nông / oằn ít; xe giáp mỏng, xe tải bẹp nhiều
  const STIFF = { heavy: 0.3, medium: 0.42, light: 0.65, soft: 1 };
  function softness(u) { return STIFF[(ARMOR[u.tankType] || ARMOR.ALL_ROUNDER).cls] || 0.5; }

  function deformableMesh(u, o) {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return false;
    if (o.userData.isFxDecal || o.userData.noDeform) return false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.isMeshBasicMaterial || m.blending === THREE.AdditiveBlending || (m.transparent && !m.depthWrite)) return false;
    if (u.antennaSets && u.antennaSets.some(s => s.geo === o.geometry)) return false;
    return true;
  }

  function deformMeshList(u) {
    const root = u.chassisGroup || u.group;
    const out = [];
    root.traverse(o => { if (deformableMesh(u, o)) out.push(o); });
    return out;
  }

  // Chia tam giác (cạnh dài nhất chia đôi) cho lưới không chỉ mục; khoảng đỉnh các bộ phận được ánh xạ lại tại chỗ
  function tessellate(mesh) {
    const geo = mesh.geometry;
    const names = Object.keys(geo.attributes);
    const at = names.map(n => geo.attributes[n]);
    const isz = at.map(a => a.itemSize);
    const pIdx = names.indexOf('position'), nIdx = names.indexOf('normal');
    const triCount = Math.floor(geo.attributes.position.count / 3);
    const newStart = new Int32Array(triCount + 1);
    let outTris = 0;
    // Đỉnh lưu phẳng trong mảng số (mọi thuộc tính nối tiếp, mỗi đỉnh `stride` số); tam giác = 3 chỉ số đỉnh; kết quả
    // ghi thẳng vào Float32Array. Cùng phép tính, cùng thứ tự xuất như bản dùng mảng lồng nhau trước đây (lưới ra giống
    // hệt từng bit) nhưng gần như không tạo rác bộ nhớ -> lần đầu xe bị móp không còn khựng
    const K = names.length, off = [];
    let stride = 0;
    for (let k = 0; k < K; k++) { off.push(stride); stride += isz[k]; }
    const pO = off[pIdx], nO = nIdx >= 0 ? off[nIdx] : -1;
    const out = isz.map(s => ({ a: new Float32Array(Math.max(16, triCount * 3 * s * 2)), n: 0 }));
    let V = new Float64Array(stride * 64), vn = 0;   // vùng đỉnh (dùng lại cho từng tam giác gốc), vn = số đỉnh
    const grow = () => { const b = new Float64Array(V.length * 2); b.set(V); V = b; };
    const vert = (i) => {
      if ((vn + 1) * stride > V.length) grow();
      let w = vn * stride;
      for (let k = 0; k < K; k++) { const s = isz[k], arr = at[k].array; for (let c = 0; c < s; c++) V[w++] = arr[i * s + c]; }
      return vn++;
    };
    const mid = (a, b) => {
      if ((vn + 1) * stride > V.length) grow();
      const q0 = vn * stride, ao = a * stride, bo = b * stride;
      for (let j = 0; j < stride; j++) V[q0 + j] = (V[ao + j] + V[bo + j]) * 0.5;
      if (nO >= 0) {
        const q = q0 + nO;
        const l = Math.hypot(V[q], V[q + 1], V[q + 2]) || 1;
        V[q] /= l; V[q + 1] /= l; V[q + 2] /= l;
      }
      return vn++;
    };
    const d2 = (a, b) => { const p = a * stride + pO, q = b * stride + pO; return (V[p] - V[q]) ** 2 + (V[p + 1] - V[q + 1]) ** 2 + (V[p + 2] - V[q + 2]) ** 2; };
    const L2 = TESS_EDGE * TESS_EDGE;
    const emitV = (v) => {
      const vo = v * stride;
      for (let k = 0; k < K; k++) {
        const o = out[k], s0 = vo + off[k], s = isz[k];
        if (o.n + s > o.a.length) { const b = new Float32Array(o.a.length * 2); b.set(o.a); o.a = b; }
        for (let c = 0; c < s; c++) o.a[o.n++] = V[s0 + c];
      }
    };
    const stack = [];   // 3 chỉ số đỉnh / tam giác
    for (let t = 0; t < triCount; t++) {
      newStart[t] = outTris;
      vn = 0;
      stack.push(vert(t * 3), vert(t * 3 + 1), vert(t * 3 + 2));
      while (stack.length) {
        const c = stack.pop(), b = stack.pop(), a = stack.pop();
        const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a);
        const mx = Math.max(ab, bc, ca);
        if (mx <= L2 || outTris + stack.length / 3 > TESS_MAX_TRIS) { emitV(a); emitV(b); emitV(c); outTris++; continue; }
        if (mx === ab) { const m = mid(a, b); stack.push(a, m, c, m, b, c); }
        else if (mx === bc) { const m = mid(b, c); stack.push(a, b, m, a, m, c); }
        else { const m = mid(c, a); stack.push(a, b, m, m, b, c); }
      }
    }
    newStart[triCount] = outTris;
    const g = new THREE.BufferGeometry();
    names.forEach((n, k) => g.setAttribute(n, new THREE.BufferAttribute(out[k].a.slice(0, out[k].n), isz[k])));
    for (const gr of geo.groups || []) g.addGroup(newStart[gr.start / 3] * 3, (newStart[Math.min(triCount, (gr.start + gr.count) / 3)] - newStart[gr.start / 3]) * 3, gr.materialIndex);
    const remap = (arr) => {
      const mapped = arr.map(([st, n]) => { const s0 = newStart[Math.floor(st / 3)] * 3, s1 = newStart[Math.min(triCount, Math.floor((st + n) / 3))] * 3; return [s0, s1 - s0]; });
      arr.length = 0;
      for (const r of mapped) arr.push(r);   // sửa tại chỗ: partRegistry / từng khối (segmentsOf) dùng chung mảng này
    };
    const ranges = mesh.userData.partRanges;
    if (ranges) for (const tag in ranges) remap(ranges[tag]);
    if (mesh.userData.segRanges) for (const arr of mesh.userData.segRanges) remap(arr);
    return g;
  }

  const PREPPED = new WeakMap();   // mesh -> xe đã có lưới biến dạng riêng
  // Chuẩn bị lưới riêng cho xe này trước lần biến dạng đầu tiên (chia nhỏ tấm lớn, lưu bản gốc để hồi sinh)
  function prepMesh(u, mesh) {
    const d = state(u);
    d.geoSwaps = d.geoSwaps || [];
    if (PREPPED.get(mesh) === u) return mesh.geometry;
    const orig = mesh.geometry;
    const ranges = mesh.userData.partRanges;
    const saved = { mesh, orig, ranges: ranges ? Object.fromEntries(Object.keys(ranges).map(t => [t, ranges[t].map(r => r.slice())])) : null };
    let g;
    if (!orig.index) {
      orig.computeBoundingSphere();
      g = orig.boundingSphere && orig.boundingSphere.radius > 3.5 ? tessellate(mesh) : orig.clone();
    } else {
      g = orig.clone();
    }
    g.computeBoundingSphere();
    if (!g.index && g.attributes.normal) g.userData.n0 = g.attributes.normal.array.slice();   // pháp tuyến gốc: nhận biết cạnh gấp
    mesh.geometry = g;
    PREPPED.set(mesh, u);
    d.geoSwaps.push(saved);
    return g;
  }

  // Pháp tuyến các tam giác bị dịch: cộng pháp tuyến mặt (theo diện tích) của mọi tam giác chung đỉnh -> lòng chỗ lõm
  // đổ bóng tròn trịa như thép bị uốn (pháp tuyến phẳng từng tam giác làm vỏ lộ mặt cắt góc cạnh như giấy gấp);
  // chỉ gộp các đỉnh có pháp tuyến GỐC gần nhau nên cạnh gấp giữa hai tấm giáp vẫn sắc
  const CREASE = Math.cos(40 * Math.PI / 180);
  // Vòng nối các đỉnh trùng vị trí (ring[i] = đỉnh kế tiếp cùng chỗ, vòng tròn). Đỉnh trùng nhau luôn dịch giống nhau
  // nên vòng dựng một lần cho mỗi lưới là dùng mãi; va chạm băm được loại bằng so tọa độ lúc duyệt
  function weldRing(g) {
    if (g.userData.ring) return g.userData.ring;
    const pa = g.attributes.position.array, n = g.attributes.position.count;
    const ring = new Int32Array(n), head = new Map();
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const h = (Math.round(pa[o] * 64) * 73856093) ^ (Math.round(pa[o + 1] * 64) * 19349663) ^ (Math.round(pa[o + 2] * 64) * 83492791);
      const f = head.get(h);
      if (f === undefined) { ring[i] = i; head.set(h, i); } else { ring[i] = ring[f]; ring[f] = i; }
    }
    return (g.userData.ring = ring);
  }
  function smoothMovedNormals(g, moved) {
    const pos = g.attributes.position, nor = g.attributes.normal, pa = pos.array, n = pos.count;
    const n0 = g.userData.n0 || nor.array, ring = weldRing(g);
    const face = new Float32Array(n), done = new Uint8Array(n / 3 | 0);
    // pháp tuyến mặt (c - b) x (a - b), chưa chuẩn hóa: tam giác lớn góp nhiều hơn
    const faceOf = (t) => {
      if (done[t]) return;
      done[t] = 1;
      const a = t * 9, b = a + 3, c = a + 6, o = t * 3;
      const ex = pa[a] - pa[b], ey = pa[a + 1] - pa[b + 1], ez = pa[a + 2] - pa[b + 2];
      const fx = pa[c] - pa[b], fy = pa[c + 1] - pa[b + 1], fz = pa[c + 2] - pa[b + 2];
      face[o] = fy * ez - fz * ey; face[o + 1] = fz * ex - fx * ez; face[o + 2] = fx * ey - fy * ex;
    };
    for (let i = 0, nv = n - n % 3; i < nv; i++) {
      const t = i / 3 | 0;
      if (!moved[t * 3] && !moved[t * 3 + 1] && !moved[t * 3 + 2]) { i = t * 3 + 2; continue; }
      const o = i * 3;
      let x = 0, y = 0, z = 0, j = i;
      do {
        const p = j * 3;
        if (Math.abs(pa[p] - pa[o]) + Math.abs(pa[p + 1] - pa[o + 1]) + Math.abs(pa[p + 2] - pa[o + 2]) < 1e-3 &&
          n0[o] * n0[p] + n0[o + 1] * n0[p + 1] + n0[o + 2] * n0[p + 2] >= CREASE) {
          const tj = j / 3 | 0;
          faceOf(tj);
          x += face[tj * 3]; y += face[tj * 3 + 1]; z += face[tj * 3 + 2];
        }
        j = ring[j];
      } while (j !== i);
      const l = Math.hypot(x, y, z);
      if (l > 1e-10) nor.setXYZ(i, x / l, y / l, z / l);
    }
  }

  // ---------------------------------------------------------------------------
  // VẾT DÁN TRÊN VỎ (con isFxDecal của mesh: vết đạn, vết cháy, vết lõm; vết đạn nhỏ gộp trong InstancedMesh)
  // Lưới đổi hình (móp, bẹp nóc, mất bộ phận) thì vết phải theo mặt thép mới: dò lại mặt ngay dưới vết, đặt vết
  // sát mặt và xoay theo pháp tuyến mới. Chỗ đó không còn mặt thép (bộ phận đã văng) -> bỏ vết, không để lơ lửng.
  // ---------------------------------------------------------------------------
  const _fp = new THREE.Vector3(), _fv = new THREE.Vector3();
  const _rp = new THREE.Vector3(), _rn = new THREE.Vector3(), _rg = new THREE.Vector3(), _rs = new THREE.Vector3();
  const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rm = new THREE.Matrix4(), _rInv = new THREE.Matrix4();
  const _rRay = new THREE.Raycaster(), _rZ = new THREE.Vector3(0, 0, 1), _rHit = new THREE.Vector3(), _rHn = new THREE.Vector3();
  const DECAL_REACH = 2;   // tầm dò mặt thép quanh vết (đơn vị, cả phía ngoài lẫn phía trong vỏ)

  // Mặt thép gần nhất dưới điểm p theo pháp tuyến n (hệ mesh). Trả điểm chạm + pháp tuyến mặt (hệ mesh) vào _rHit/_rHn
  function surfaceUnder(mesh, p, n) {
    const o = _rp.copy(p).addScaledVector(n, DECAL_REACH).applyMatrix4(mesh.matrixWorld);
    const dir = _rn.copy(n).transformDirection(mesh.matrixWorld).negate();
    _rRay.set(o, dir);
    _rRay.far = DECAL_REACH * 2 * (_rs.setFromMatrixScale(mesh.matrixWorld).x || 1);
    const h = _rRay.intersectObject(mesh, false).find(x => x.face);
    if (!h) return false;
    _rHit.copy(h.point).applyMatrix4(_rInv.copy(mesh.matrixWorld).invert());
    _rHn.copy(h.face.normal).normalize();
    if (_rHn.dot(n) < 0) _rHn.negate();
    return true;
  }

  // Gỡ một vết khỏi vỏ (kèm sổ vết của hệ hiệu ứng để ô InstancedMesh / vật liệu được giải phóng)
  function dropDecal(u, mesh, ch, slot, batch) {
    const fx = FX || (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(u.scene) : null);
    const list = fx && fx.surfaceMarks;
    if (batch) {
      const i = list ? list.indexOf(batch.owner[slot]) : -1;
      if (i >= 0) fx.removeSurfaceMark(i);
      else { ch.setMatrixAt(slot, _rm.makeScale(0, 0, 0)); ch.instanceMatrix.needsUpdate = true; }
      return;
    }
    const i = list ? list.findIndex(r => r.mesh === ch) : -1;
    if (i >= 0) { fx.removeSurfaceMark(i); return; }
    mesh.remove(ch);
    const d = state(u);
    if (d.dents) d.dents = d.dents.filter(D => D.m !== ch);
  }

  // move(p, out): vị trí gợi ý (hệ mesh) cho vết đang ở p; false = vết không bị ảnh hưởng, giữ nguyên
  function refitDecals(u, mesh, move) {
    mesh.updateMatrixWorld(true);
    const batches = mesh.userData.pitBatches ? Object.values(mesh.userData.pitBatches) : [];
    for (const ch of mesh.children.slice()) {
      if (!ch.userData || !ch.userData.isFxDecal) continue;
      const lift = ch.userData.lift !== undefined ? ch.userData.lift : 0.15;
      if (ch.isInstancedMesh) {
        const B = batches.find(b => b.im === ch);
        if (!B) continue;
        let dirty = false;
        for (const slot of B.order.slice()) {
          ch.getMatrixAt(slot, _rm);
          _rm.decompose(_rg, _rq, _rs);
          const n = _rZ.clone().applyQuaternion(_rq);
          const guess = new THREE.Vector3();
          if (!move(_rg, guess)) continue;
          const sc = _rs.clone();
          if (!surfaceUnder(mesh, guess, n)) { dropDecal(u, mesh, ch, slot, B); continue; }
          _rq2.setFromUnitVectors(n, _rHn).multiply(_rq);
          ch.setMatrixAt(slot, _rm.compose(_rHit.addScaledVector(_rHn, lift), _rq2, sc));
          dirty = true;
        }
        if (dirty) ch.instanceMatrix.needsUpdate = true;
        continue;
      }
      const n = _rZ.clone().applyQuaternion(ch.quaternion);
      const guess = new THREE.Vector3();
      if (!move(ch.position, guess)) continue;
      if (!surfaceUnder(mesh, guess, n)) { dropDecal(u, mesh, ch); continue; }
      ch.quaternion.premultiply(_rq2.setFromUnitVectors(n, _rHn));
      ch.position.copy(_rHit).addScaledVector(_rHn, lift);
    }
  }

  /**
   * Áp trường dịch chuyển lên lưới. space: hệ tọa độ mà field làm việc (u.group / nòng pháo).
   * field(p, out) -> true nếu điểm p bị dịch (out = vector dịch trong hệ space). sphere: {c, r} (hệ space) để bỏ qua mesh ở xa.
   */
  function deformField(u, meshes, space, field, sphere) {
    space.updateMatrixWorld(true);
    const spaceInv = new THREE.Matrix4().copy(space.matrixWorld).invert();
    const M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), Mn = new THREE.Matrix3();
    let any = false;
    for (const mesh of meshes) {
      if (!mesh.parent) continue;
      mesh.updateMatrixWorld(true);
      M.multiplyMatrices(spaceInv, mesh.matrixWorld);
      if (sphere) {
        const gs = mesh.geometry.boundingSphere || (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
        const c = gs.center.clone().applyMatrix4(M);
        const sc = new THREE.Vector3().setFromMatrixScale(M).x || 1;
        if (c.distanceTo(sphere.c) > sphere.r + gs.radius * sc) continue;
      }
      const g = prepMesh(u, mesh);
      Mi.copy(M).invert();
      Mn.getNormalMatrix(Mi);
      const pos = g.attributes.position;
      const n = pos.count;
      const moved = new Uint8Array(n);
      let touched = false;
      for (let i = 0; i < n; i++) {
        _dp.fromBufferAttribute(pos, i).applyMatrix4(M);
        if (!field(_dp, _dv)) continue;
        if (_dv.lengthSq() < 1e-8) continue;
        _dp.add(_dv).applyMatrix4(Mi);
        pos.setXYZ(i, _dp.x, _dp.y, _dp.z);
        moved[i] = 1; touched = true;
      }
      if (!touched) continue;
      any = true;
      pos.needsUpdate = true;
      const nor = g.attributes.normal;
      if (nor) {
        if (g.index) g.computeVertexNormals();
        else {
          smoothMovedNormals(g, moved);
          nor.needsUpdate = true;
        }
      }
      g.computeBoundingSphere();
      g.boundingBox = null;
      // Vết đạn / vết cháy / vết lõm dán trên mesh: dò lại mặt thép mới ngay dưới vết (không lơ lửng / chìm vào vỏ)
      refitDecals(u, mesh, (p, out) => {
        _fp.copy(p).applyMatrix4(M);
        if (!field(_fp, _fv) || _fv.lengthSq() < 1e-8) return false;
        out.copy(_fp.add(_fv).applyMatrix4(Mi));
        return true;
      });
    }
    if (any) { u._partCenters = null; fieldChanged(u); }   // vỏ móp: mặt đỡ (hullTopAt) tính lại theo lưới mới
    return any;
  }

  // Hố móp sâu tại điểm trúng: tấm thép bị đẩy lõm vào trong theo hướng đạn, có nếp nhăn
  function crumpleAt(u, worldPoint, worldDir, R, depth) {
    if (!u || !u.group || !worldPoint || depth <= 0.01) return false;
    const d = state(u);
    // giáp dày móp nông & hẹp hơn tôn mỏng (đạn nổ trên giáp chủ lực chỉ để lại vết lõm vài cm)
    const S = softness(u);
    depth *= S; R *= 0.45 + 0.55 * S;
    if (depth <= 0.01) return false;
    const space = u.group;
    space.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
    const c = worldPoint.clone().applyMatrix4(inv);
    let dir = worldDir && worldDir.lengthSq() > 1e-6 ? worldDir.clone().normalize() : c.clone().setY(c.y - 8).normalize().negate();
    dir.transformDirection(inv).normalize();
    // Đạn bắn gần như song song bề mặt: vẫn lõm vào lòng xe (về trục giữa)
    const toCore = new THREE.Vector3(-c.x, 9 - c.y, -c.z * 0.4).normalize();
    dir.lerp(toCore, 0.25).normalize();
    // Giới hạn tổng độ lõm tích lũy theo vùng (không cho vỏ xuyên qua nhau)
    d.crushAcc = d.crushAcc || {};
    const key = Math.round(c.x / 6) + ',' + Math.round(c.y / 6) + ',' + Math.round(c.z / 6);
    const cap = (u.isDead ? 7 : 3) * S;
    const room = Math.max(0, cap - (d.crushAcc[key] || 0));
    const dep = Math.min(depth, room);
    if (dep <= 0.02) return false;
    d.crushAcc[key] = (d.crushAcc[key] || 0) + dep;
    const R2 = R * R;
    // Nòng + tấm chắn nòng là thép đúc dày: không bị ép lõm theo hệ thân xe (lõm sâu vài đơn vị làm ống nòng gãy gập)
    const ok = deformField(u, deformMeshList(u).filter(m => !isOnGun(u, m)), space, (p, out) => {
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 >= R2) return false;
      const t = 1 - r2 / R2;
      const k = t * t;
      const w = 1 + 0.35 * wrinkle(p.x, p.y, p.z, 1.9) * t;
      out.copy(dir).multiplyScalar(dep * k * w);
      // mép hố bị kéo xệ về tâm (tấm thép co rút quanh chỗ lõm)
      out.x -= dx * 0.08 * k * dep / R; out.y -= dy * 0.08 * k * dep / R; out.z -= dz * 0.08 * k * dep / R;
      return true;
    }, { c, r: R });
    return ok;
  }

  // Khung xe biến dạng tổng thể (hệ u.group): bẹp nóc, sụp lưng, oằn sườn, xoắn khung. amt: lượng tăng thêm (0..1)
  function crushHull(u, amt, opts) {
    if (!u || !u.group || amt <= 0) return false;
    const d = state(u);
    // Chỉ khung thân bị oằn: tháp đúc / hàn giáp dày + nòng là khối cứng, không bẹp theo khung (ép theo hệ thân làm tháp
    // dẹp như lon, nòng méo xệch rồi bị nâng ngóc lên). Tháp hư thì lệch khỏi vòng bi / bị hất văng (slumpTurret, tossTurret)
    const meshes = deformMeshList(u).filter(m => !isOnTurret(u, m) && !isOnGun(u, m));
    const S = softness(u);
    if (!d.hullBox) {
      const box = new THREE.Box3();
      u.group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(u.group.matrixWorld).invert();
      const hm = u.hullMainMesh || meshes[0];
      if (hm) {
        hm.geometry.computeBoundingBox();
        box.copy(hm.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, hm.matrixWorld));
      } else box.set(new THREE.Vector3(-12, 0, -25), new THREE.Vector3(12, 16, 25));
      d.hullBox = { x0: box.min.x, x1: box.max.x, y0: box.min.y, y1: Math.max(box.max.y, box.min.y + 6), z0: box.min.z, z1: box.max.z };
      d.crushSeed = { twist: Math.random() < 0.5 ? -1 : 1, zc: rand(-0.35, 0.35) };
    }
    const B = d.hullBox, S0 = d.crushSeed;
    const hx = Math.max(4, (B.x1 - B.x0) / 2), hz = Math.max(6, (B.z1 - B.z0) / 2), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2 + S0.zc * hz * 0.5;
    const yF = B.y0, hY = Math.max(4, B.y1 - B.y0);
    const o = Object.assign({ roof: 1, sag: 1, sides: 1, twist: 1, bulge: 0 }, opts || {});
    const a = amt * S;   // biến dạng khung theo độ cứng vỏ (nổ bên trong - bulge - không giảm: áp lực nổ xé cả giáp dày)
    return deformField(u, meshes, u.group, (p, out) => {
      const ny = Math.min(1.6, Math.max(0, (p.y - yF) / hY));   // 0 sàn -> 1 nóc
      const nz = Math.max(-1.3, Math.min(1.3, (p.z - cz) / hz)), nx = Math.max(-1.3, Math.min(1.3, (p.x - cx) / hx));
      const midZ = Math.max(0, 1 - nz * nz);                 // giữa thân võng nhiều nhất
      const midX = Math.max(0, 1 - nx * nx * 0.7);
      const wr = wrinkle(p.x, p.y, p.z, 0.9);
      out.set(0, 0, 0);
      // 1. Tấm nóc võng xuống giữa các gân / vách (lõm lòng chảo giữa tấm, mép tấm hàn vào sườn gần như giữ nguyên)
      if (o.roof) out.y -= a * o.roof * hY * 0.3 * Math.pow(ny, 1.5) * midX * (0.5 + 0.5 * midZ) * (0.85 + 0.25 * wr);
      // 2. Khung võng nhẹ ở giữa (hộp thép hàn không gãy lưng, chỉ chùng xuống chút ít)
      if (o.sag) out.y -= a * o.sag * hY * 0.06 * midZ * (0.4 + 0.6 * Math.min(1, ny + 0.3));
      // 3. Tấm sườn oằn vào trong ở khoảng giữa tấm, chân sườn hơi phình ra
      if (o.sides) {
        const sx = Math.sign(p.x - cx) || 1;
        const band = Math.sin(Math.min(1, ny) * Math.PI);
        out.x += -sx * a * o.sides * hx * 0.12 * band * (0.3 + 0.7 * midZ) * (1 + 0.4 * wr);
        out.x += sx * a * o.sides * hx * 0.04 * Math.max(0, 0.35 - ny) * 3;
      }
      // 4. Khung vặn rất ít theo chiều dọc
      if (o.twist) {
        const ang = a * o.twist * 0.025 * S0.twist * nz;
        const ry = p.y - yF;
        out.x += (p.x - cx) * (Math.cos(ang) - 1) - ry * Math.sin(ang);
        out.y += (p.x - cx) * Math.sin(ang) + ry * (Math.cos(ang) - 1);
      }
      // 5. Nổ bên trong (kho đạn / nhiên liệu): nóc & sườn bị phồng bung ra ngoài
      if (o.bulge) {
        const sx = Math.sign(p.x - cx) || 1;
        const k = Math.max(0, ny - 0.45) * midZ;
        out.y += amt * o.bulge * 2.2 * k * (0.7 + 0.5 * wr);
        out.x += sx * amt * o.bulge * 1.4 * Math.sin(Math.min(1, ny) * Math.PI) * midZ * (0.7 + 0.5 * wr);
      }
      return out.lengthSq() > 1e-8;
    });
  }

  // Nòng trúng đạn bị uốn cong từ chỗ trúng ra tới đầu nòng. Mỗi lát cắt nòng xoay cứng quanh điểm bắt đầu uốn -> ống nòng
  // giữ tiết diện tròn (dời đỉnh theo parabol làm ống bị xô lệch, phình dẹt khi uốn mạnh). Nòng thép dày chỉ cong vài độ;
  // nòng gục xuống trên xác xe là do mất áp thủy lực (xoay chốt nòng, ExplosionFX), không phải do uốn
  const BEND_MAX = 0.16;   // tổng góc uốn tối đa (~9°)
  function bendBarrel(u, ang, point, dir) {
    const bg = u.barrelGroup || u.gatlingCluster;
    if (!bg || !(ang > 0)) return false;
    const d = state(u);
    ang = Math.min(ang, BEND_MAX - (d.barrelBend || 0));
    if (ang <= 0.003) return false;
    const meshes = [];
    bg.traverse(o => { if (deformableMesh(u, o)) meshes.push(o); });
    if (!meshes.length) return false;
    bg.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(bg.matrixWorld).invert();
    const L = tubeLen(u);
    // chỗ bắt đầu uốn: điểm trúng trên nòng (không sát tấm chắn, không tận đầu nòng)
    const s0 = point ? Math.max(L * 0.25, Math.min(L * 0.85, -point.clone().applyMatrix4(inv).z)) : L * 0.45;
    // hướng uốn: theo hướng đạn chiếu lên mặt cắt ngang nòng, hơi thiên xuống (đầu nòng nặng)
    const b = dir && dir.lengthSq() > 1e-6 ? dir.clone().transformDirection(inv) : new THREE.Vector3(0, -1, 0);
    b.z = 0;
    if (b.lengthSq() < 1e-4) b.set(0, -1, 0);
    b.normalize(); b.y -= 0.35; b.normalize();
    return bendBarrelAt(u, ang, s0, b, meshes);
  }
  // Uốn lưới nòng: đoạn từ s0 (khoảng cách dọc nòng từ gốc nhóm nòng) ra tới miệng xoay góc ang về phía b (hệ nhóm nòng,
  // vuông góc trục nòng)
  function bendBarrelAt(u, ang, s0, b, meshes) {
    const bg = u.barrelGroup || u.gatlingCluster, d = state(u);
    if (!bg || !(ang > 0)) return false;
    if (!meshes) { meshes = []; bg.traverse(o => { if (deformableMesh(u, o)) meshes.push(o); }); }
    if (!meshes.length) return false;
    const L = tubeLen(u);
    d.barrelBend = (d.barrelBend || 0) + ang;
    const zone = Math.max(3, L * 0.12), rel = new THREE.Vector3();
    return deformField(u, meshes, bg, (p, out) => {
      const s = -p.z - s0;
      if (s <= 0) return false;
      const t = Math.min(1, s / zone), th = ang * t * t * (3 - 2 * t);
      rel.set(p.x, p.y, p.z + s0);
      const ra = -rel.z, rb = rel.x * b.x + rel.y * b.y;
      const c = Math.cos(th), sn = Math.sin(th);
      const da = ra * c - rb * sn - ra, db = ra * sn + rb * c - rb;
      out.set(b.x * db, b.y * db, -da);
      return true;
    });
  }

  // Các nấc biến dạng của xác xe theo lượng đạn đã hứng
  const WRECK_STAGES = [
    { at: 2.5, text: 'XÁC XE HƯ HẠI NẶNG — vỏ móp nhiều chỗ, chắn bùn / hộp đồ bị xé toạc' },
    { at: 6, text: 'XÁC XE BIẾN DẠNG NẶNG — tấm nóc võng, sườn oằn, tháp lệch khỏi vòng bi' },
    { at: 12, text: 'XÁC XE NÁT BÉT — xích đứt, bánh văng, thân sụp xuống' }
  ];
  // Độ sụt thêm của xác xe (ngoài phần do bánh): xích / bánh vẫn tì đất nên khung chỉ lún rất ít (đất mềm) —
  // sụt nhiều hơn thì xích / lốp ngập xuống đất. Xe bánh muốn "đổ sát đất" phải do mất bánh (recompute)
  function sinkCapOf(u) {
    return (ARMOR[u.tankType] || ARMOR.ALL_ROUNDER).drive === 'tracks' ? 0.3 : 0.4;
  }
  // Mất bánh trên xác xe: tính lại độ tụt / nghiêng theo bánh còn lại (giữ trạng thái xích đã đứt của xác)
  function wheelRepose(u) {
    const tb = u.trackBroken;
    recompute(u);
    if (u.isDead && tb) u.trackBroken = tb;
  }
  // Tháp còn trên xe thì mới uốn / gục nòng (tháp đã văng nằm dưới đất: nòng uốn thêm sẽ cắm xuống đất)
  function barrelOnHull(u) {
    return !!(u.barrelPivot && !(u.fxWreck && u.fxWreck.turret));
  }
  // Nòng (tháp còn trên xe) bị uốn cong / ép / gục: không cắm xuống đất hay vào nóc thân — nâng chốt nòng lên vừa đủ để
  // điểm thấp nhất của nòng tựa trên mặt đỡ. Ghi lại góc gục tối thiểu (minElev) cho nòng gục dần do mất áp thủy lực
  const _gv = new THREE.Vector3(), _gp = new THREE.Vector3(), _gM = new THREE.Matrix4();
  function guardBarrel(u) {
    if (!barrelOnHull(u)) return;
    const bp = u.barrelPivot, meshes = [];
    bp.traverse(o => { if (deformableMesh(u, o)) meshes.push(o); });
    if (!meshes.length) return;
    if (!bp.userData.fxBaseRot) bp.userData.fxBaseRot = bp.rotation.clone();
    const margin = 0.5;
    // Điểm sát chốt (tấm chắn, gốc nòng nằm trong tháp) có cánh tay đòn ngắn: chạm mặt đỡ một chút đã đòi góc ngóc rất
    // lớn -> nòng dựng đứng. Chỉ xét đoạn nòng xa chốt, và không ngóc quá MAX_LIFT so với góc lúc xe chết
    const MAX_LIFT = 0.35;
    u.group.updateMatrixWorld(true);
    _gM.copy(bp.matrixWorld).invert();
    let rMax = 0;
    for (const m of meshes) {
      const pa = m.geometry.attributes.position, step = Math.max(1, Math.floor(pa.count / 400));
      for (let i = 0; i < pa.count; i += step) { _gp.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld).applyMatrix4(_gM); rMax = Math.max(rMax, Math.hypot(_gp.y, _gp.z)); }
    }
    const rMin = Math.max(2, rMax * 0.35), maxX = bp.userData.fxBaseRot.x + MAX_LIFT;
    let lim = 0, settled = false;
    for (let it = 0; it < 4; it++) {
      u.group.updateMatrixWorld(true);
      _gM.copy(bp.matrixWorld).invert();
      let need = 0;
      lim = Infinity;
      for (const m of meshes) {
        const pa = m.geometry.attributes.position, step = Math.max(1, Math.floor(pa.count / 400));
        for (let i = 0; i < pa.count; i += step) {
          _gv.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
          const fl = Math.max(groundProvider ? groundProvider(_gv.x, _gv.z) : -Infinity, u.isDead ? hullTopAt(u, _gv.x, _gv.z) : -Infinity);
          if (!isFinite(fl)) continue;
          _gp.copy(_gv).applyMatrix4(_gM);
          const r = Math.hypot(_gp.y, _gp.z);   // khoảng cách tới trục chốt nòng (trục X của chốt)
          if (r < rMin) continue;
          const c = _gv.y - fl;
          if (c < margin) need = Math.max(need, (margin - c) / r);
          lim = Math.min(lim, (c - margin) / r);
        }
      }
      if (need <= 1e-4) { settled = true; break; }
      if (bp.rotation.x >= maxX) break;
      bp.rotation.x = Math.min(maxX, bp.rotation.x + need * 1.05);   // góc dương = ngóc lên
    }
    bp.userData.minElev = settled && isFinite(lim) ? bp.rotation.x - Math.max(0, lim) : bp.rotation.x;
  }

  // Xác xe rã: tháp lệch khỏi vòng bi, gục nghiêng tựa mép đế lên sàn (xoay quanh mép tựa chứ không quanh tâm -> mép thấp
  // không ngập vào sàn, mép cao kênh lên)
  function slumpTurret(u, tg) {
    if (!tg.userData.fxBasePos) { tg.userData.fxBasePos = tg.position.clone(); tg.userData.fxBaseRot = tg.rotation.clone(); }
    const rz = rand(-0.12, 0.12), rx = rand(-0.06, 0.06);
    tg.rotation.y += rand(-0.4, 0.4);
    tg.rotation.z += rz;
    tg.rotation.x += rx;
    const box = FX && FX.turretBodyBox ? FX.turretBodyBox(u, tg) : null;
    const rr = box && !box.isEmpty() ? Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.4 : 8;
    tg.position.y += rr * (Math.abs(Math.sin(rz)) + Math.abs(Math.sin(rx))) - 0.4;
    guardBarrel(u);
  }

  function wreckStageUp(u, stage, events, point) {
    const d = state(u);
    let lostWheel = false;
    if (stage === 1) {
      crushHull(u, 0.35, { roof: 0.6, sag: 1, sides: 0.6, twist: 0.5 });
    } else if (stage === 2) {
      crushHull(u, 0.65, { roof: 1, sag: 1, sides: 1, twist: 1 });
    } else if (stage === 3) {
      crushHull(u, 0.9, { roof: 1.3, sag: 1.2, sides: 1.2, twist: 0.8 });
      // thân sụp sát đất, bánh / xích hết đỡ
      // (xe chết đã đặt u.trackBroken = [true, true] cho cả 2 bên dù xích còn nguyên -> xét theo dải xích thật;
      // breakSide tự bỏ qua bên đã đứt)
      if (u.trackSystem && u.trackSystem.breakSide) { for (let s = 0; s < 2; s++) u.trackSystem.breakSide(s, Math.random() < 0.5); u.trackBroken = [true, true]; }
      if (u.wheelSet) u.wheelSet.positions.forEach((p, i) => { if (!d.gone[i] && Math.random() < 0.5 && blowWheel(u, i, [], FX, new THREE.Vector3(rand(-30, 30), 20, rand(-30, 30)))) lostWheel = true; });
    }
    if (lostWheel) wheelRepose(u);
    d.wSink = Math.min((d.wSink || 0) + [0, 0.1, 0.1, 0.1][stage], sinkCapOf(u));
    applyPose(u);
    guardBarrel(u);
    if (point) { sparksAt(point, 24); sfx('metalCrush', point, 0.6 + stage * 0.3); }
    events.push({ type: 'wreck', text: WRECK_STAGES[stage - 1].text, stage });
  }

  // Bắn tiếp vào xác xe: rã dần — bung nốt phụ kiện / váy xích / bánh, mảng vỏ cháy bị xé ra, khung sụp thấp dần
  let CHAR_MAT = null;
  function onWreckHit(u, opts) {
    const events = [];
    markGroups(u);
    const d = state(u);
    if (opts.fx) FX = opts.fx;
    const cls = ammoClass(opts.ammo);
    const point = opts.point || (opts.hit && opts.hit.point) || (opts.x !== undefined ? new THREE.Vector3(opts.x, opts.y, opts.z) : null);
    if (!point) return { mul: 0, events };
    let pw = { small: 0.035, cannon: 0.22, kinetic: 0.5, heat: 0.7, blast: opts.heavy ? 1.6 : 1 }[cls] || 0.3;
    if (opts.splash) pw *= Math.max(0.15, 1 - (opts.dist || 0) / Math.max(1, opts.radius || 40)) * 0.7;
    d.wreck = (d.wreck || 0) + pw;
    u.group.updateMatrixWorld(true);
    // Đạn nhỏ xả vào một chỗ: cộng dồn theo ô 4x4 rồi mới xé được mảng vỏ
    const key = Math.round(point.x / 4) + ',' + Math.round(point.y / 4) + ',' + Math.round(point.z / 4);
    d.wreckSpots = d.wreckSpots || {};
    d.wreckSpots[key] = (d.wreckSpots[key] || 0) + pw;
    // Vỏ xác xe lõm / rách thêm tại chỗ trúng (đạn nhỏ cũng đục dần)
    const hitN = opts.hit && opts.hit.normal ? opts.hit.normal : null;
    if (opts.hit && opts.hit.object && hitN) dentAt(u, opts.hit.object, point, hitN, 1.6 + pw * 2, Math.min(1.6, 0.05 + pw * 0.9), pw >= 0.5, opts.hit);
    const tear = pw >= 0.2 || d.wreckSpots[key] > 1.2;
    // Vỏ thép xác xe bị đẩy lõm thật (biến dạng lưới): đạn lớn móp sâu, đạn nhỏ dồn đủ một chỗ mới oằn
    {
      const inDir = opts.dir && opts.dir.lengthSq() > 1 ? opts.dir.clone() : (hitN ? hitN.clone().negate() : point.clone().sub(u.group.position).setY(0).negate());
      if (opts.splash && !opts.dir) inDir.copy(u.group.position).add(new THREE.Vector3(0, 8, 0)).sub(point);
      // trúng nòng (tháp còn trên xe): nòng cong từ chỗ trúng (crumpleAt không đụng nòng)
      if (pw >= 0.2 && opts.hit && opts.hit.object && isOnGun(u, opts.hit.object) && barrelOnHull(u)) bendBarrel(u, Math.min(0.08, 0.02 + pw * 0.035), point, inDir);
      if (pw >= 0.2) crumpleAt(u, point, inDir, 5 + Math.min(1.5, pw) * 7, Math.min(3.2, 0.5 + pw * 1.6));
      else if (tear) crumpleAt(u, point, inDir, 4.5, 0.7);
    }
    // Chắn bùn / mép thân ngay trên xích bị đánh móp, nổ sát xích: xích xác xe đứt tại chỗ (nhánh trên sụp, đầu đứt rũ
    // xuống đất). Trước đây xác xe chỉ đứt xích ở nấc rã cuối, móp nát cả mạn mà xích vẫn căng nguyên
    const TS = u.trackSystem;
    if (pw >= 0.5 && TS && TS.breakSide) {
      const lp = (u.chassisGroup || u.group).worldToLocal(point.clone());
      const s = trackSideAt(u, lp, 5);
      if (s >= 0 && !(TS.broken && TS.broken[s]) && Math.random() < Math.min(1, 0.35 + pw * 0.4)) {
        TS.breakSide(s, lp.z < 0);
        u.trackBroken = u.trackBroken || [true, true];
        u.trackBroken[s] = true;
        sfx('trackSnap', point);
        events.push({ type: 'wreck', text: `Xích ${s ? 'phải' : 'trái'} của xác xe bị đánh đứt` });
      }
    }
    // Lũy tiến các nấc biến dạng toàn thân
    d.wreckStage = d.wreckStage || 0;
    while (d.wreckStage < WRECK_STAGES.length && d.wreck >= WRECK_STAGES[d.wreckStage].at) {
      d.wreckStage++;
      wreckStageUp(u, d.wreckStage, events, point);
    }
    if (tear && d.wreckSpots[key] > 1.2) d.wreckSpots[key] = 0;
    if (!tear) return { mul: 0, events };
    // Xác xe đang cháy còn kho đạn chưa nổ: phát trúng mạnh kích nổ / xả áp sớm
    if (pw >= 0.5 && u.fxWreck && !u.fxWreck.detonated && !u.fxWreck.cookFired && isFinite(u.fxWreck.cookAt)) u.fxWreck.cookAt = Math.min(u.fxWreck.cookAt, u.fxWreck.t + rand(0.1, 0.6));
    // Phát trúng mạnh vào xác còn tháp: hất văng tháp
    if (pw >= 1 && FX && FX.tossTurret && u.fxWreck && !u.fxWreck.turret && Math.random() < (opts.heavy ? 0.8 : 0.45)) {
      const dirV = opts.dir ? opts.dir.clone().normalize().multiplyScalar(40) : null;
      if (FX.tossTurret(u, dirV, point, 0.7)) events.push({ type: 'wreck', text: 'XÁC XE TRÚNG ĐẠN NỔ MẠNH — THÁP PHÁO BỊ HẤT VĂNG' });
    }
    // 1. Phụ kiện / tấm giáp còn sót gần điểm trúng bị hất bay
    const tags = Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {})).filter(t => !d.lost.has(t) && !segmented(t) && partKind(t) !== 'hatch');
    const R = 7 + pw * 14;
    damageSegsNear(u, point, R * 0.5, pw * 0.6, events);
    const near = tags.map(t => ({ t, p: partWorld(u, t) })).filter(o => o.p && o.p.distanceTo(point) < R).sort((a, b) => a.p.distanceTo(point) - b.p.distanceTo(point));
    const maxN = pw >= 1 ? 4 : pw >= 0.5 ? 2 : 1;
    for (let i = 0; i < Math.min(maxN, near.length); i++) {
      const o = near[i];
      const away = o.p.clone().sub(point).normalize().multiplyScalar(30 + pw * 50).add(new THREE.Vector3(0, 15 + pw * 25, 0));
      if (detachTag(u, o.t, away)) onPartLost(u, o.t, partKind(o.t), events, FX, o.p);
    }
    // 2. Bánh xe gần điểm nổ (đạn nổ / nổ lõm) văng khỏi trục
    if (u.wheelSet && (cls === 'blast' || cls === 'heat')) {
      const cg = u.chassisGroup || u.group;
      let lostWheel = false;
      u.wheelSet.positions.forEach((p, i) => {
        if (d.gone[i]) return;
        const wp = cg.localToWorld(new THREE.Vector3(p.x, p.y, p.z));
        if (wp.distanceTo(point) < 10 + pw * 6 && Math.random() < 0.35 + pw * 0.3 && blowWheel(u, i, events, FX, wp.clone().sub(point).normalize().multiplyScalar(45))) lostWheel = true;
      });
      // góc mất bánh sụt xuống (không để thân nằm ngang lơ lửng trên chỗ trống)
      if (lostWheel) { wheelRepose(u); applyPose(u); }
    }
    // 3. Mảng vỏ thép cháy sém bị xé khỏi thân (kích thước theo uy lực)
    const scene = u.scene || u.group.parent;
    d.wreckPlates = d.wreckPlates || 0;
    if (scene && d.wreckPlates < 10 && (pw >= 0.2 || Math.random() < 0.35)) {
      if (!CHAR_MAT) CHAR_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.85, metalness: 0.45 });
      const n = Math.min(10 - d.wreckPlates, pw >= 1 ? 2 : 1);
      d.wreckPlates += n;
      for (let i = 0; i < n; i++) {
        const sz = 0.6 + Math.min(1, pw) * 1.6;
        const g = new THREE.BoxGeometry(sz * rand(0.7, 1.3), rand(0.12, 0.3), sz * rand(0.5, 1.0));
        const pa = g.attributes.position;
        for (let k = 0; k < pa.count; k++) pa.setXYZ(k, pa.getX(k) * rand(0.7, 1.15), pa.getY(k), pa.getZ(k) * rand(0.7, 1.15));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, CHAR_MAT);
        m.castShadow = true; m.userData.ownGeo = true;
        const holder = new THREE.Group();
        holder.add(m);
        holder.position.copy(point);
        holder.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
        holder.userData.radius = sz * 0.5;
        // văng ra từ đúng chỗ bị xé, hướng ngược vào trong thân xe -> ra ngoài theo pháp tuyến mặt trúng
        const away = (hitN ? hitN.clone().setY(Math.max(0.2, hitN.y)) : point.clone().sub(u.group.position).setY(0)).normalize().multiplyScalar(15 + pw * 35);
        spawnDebris(u, holder, away, { mat: 'plate' });
      }
      sfx('armorPlate', point, Math.min(1.5, 0.6 + pw));
    }
    // 4. Khung xác xe sụp thấp dần, vặn vẹo thêm
    if (pw >= 0.2) {
      d.wSink = Math.min((d.wSink || 0) + 0.03 * pw, sinkCapOf(u));
      // xích / bánh vẫn tì đất: khung chỉ vặn rất ít, nghiêng nhiều thì một bên xích ngập đất
      d.wTiltR = Math.max(-0.03, Math.min(0.03, (d.wTiltR || 0) + rand(-0.012, 0.012) * pw));
      d.wTiltP = Math.max(-0.02, Math.min(0.02, (d.wTiltP || 0) + rand(-0.008, 0.008) * pw));
      applyPose(u);
    }
    // 5. Tích lũy đủ lớn: xác xe rã hẳn — bung hết phụ kiện, tháp lệch khỏi vòng bi
    if (d.wreck > 6 && !d.gutted) {
      d.gutted = true;
      for (const t of tags) if (!d.lost.has(t)) { const wp = partWorld(u, t); if (wp && detachTag(u, t, wp.clone().sub(u.group.position).setY(0).normalize().multiplyScalar(40).add(new THREE.Vector3(0, 30, 0)))) onPartLost(u, t, partKind(t), [], FX, wp); }
      for (const t of Object.keys(u.partRegistry || {})) if (segmented(t)) for (const sg of segmentsOf(u, t)) if (!sg.gone && Math.random() < 0.5) breakSeg(u, t, sg, 'plate', null, []);
      const tg = u.turretGroup;
      const tossed = FX && FX.tossTurret && u.fxWreck && !u.fxWreck.turret && FX.tossTurret(u, null, point, 0.6);
      if (!tossed && tg && tg.parent && tg.visible && !(u.fxWreck && u.fxWreck.turret)) slumpTurret(u, tg);
      // Thân xe móp méo nát bét: vài mảng vỏ lớn bị ép bẹp / xé toạc
      if (FX && FX.hitUnitSurface) {
        for (let k = 0; k < 5; k++) {
          const ang = Math.random() * Math.PI * 2;
          const dirR = new THREE.Vector3(Math.cos(ang), rand(-0.5, -0.1), Math.sin(ang)).normalize();
          const from = u.group.position.clone().add(new THREE.Vector3(0, 9, 0)).addScaledVector(dirR, -60);
          const h = FX.hitUnitSurface(u, from, dirR, 120);
          if (h && h.object && h.normal) {
            dentAt(u, h.object, h.point, h.normal, rand(3, 5), rand(1.2, 2.2), true, h);
            crumpleAt(u, h.point, dirR, rand(8, 12), rand(1.8, 3));
          }
        }
      }
      d.wSink = Math.min((d.wSink || 0) + 0.15, sinkCapOf(u));
      applyPose(u);
      sfx('metalCrush', point, 0.8);
    } else if (pw >= 0.5 && !events.length) {
      events.push({ type: 'wreck', text: 'Xác xe bị xé thêm mảng vỏ, phụ kiện còn sót văng ra' });
    }
    // vỏ bị ép / khung lún có thể đẩy nòng xuống đất / vào nóc thân: nâng nòng lên vừa đủ tựa
    if (pw >= 0.2) guardBarrel(u);
    return { mul: 0, events };
  }

  // ---------------------------------------------------------------------------
  // MÔ HÌNH XUYÊN GIÁP: độ xuyên đạn (mm) vs giáp quy đổi (mm RHA) theo mặt, nghiêng theo góc chạm
  // ---------------------------------------------------------------------------
  // Giáp quy đổi từng mặt: [chống đạn động năng KE, chống nổ lõm CE] (giáp composite chống nổ lõm tốt hơn)
  const ARMOR_MM = {
    // gun: thành ống nòng / cụm nòng (thép nòng pháo, không phải giáp) — trúng nòng tính theo đây chứ không theo giáp tháp
    // giáp mũi tháp xe tăng chủ lực hiện đại ~700 mm trước đạn động năng, ~1300-1600 mm trước đầu nổ lõm (giáp nhiều lớp);
    // thân trước ~500 / ~950. Tên lửa chống tăng cỡ Kornet (1300 mm) xuyên thân / sườn, không xuyên mũi tháp (trước 900)
    ALL_ROUNDER: { turretFront: [700, 1450], hullFront: [500, 950], side: [90, 140], turretSide: [120, 180], rear: [45, 45], top: [40, 40], gun: [70, 70] },
    // Hailstorm: xe hỏa lực trên khung thân xe tăng chủ lực (kiểu BMPT) + giáp gắn thêm — thân giáp gần xe tăng, tháp vũ khí
    // không người lái nhẹ hơn (trước đây giáp cỡ xe chiến đấu bộ binh nhưng 4 máu, cao nhất game)
    GATLING: { turretFront: [220, 320], hullFront: [420, 680], side: [80, 120], turretSide: [50, 70], rear: [40, 40], top: [30, 30], gun: [20, 20] },
    SCOUT: { turretFront: [12, 12], hullFront: [22, 22], side: [14, 14], turretSide: [10, 10], rear: [11, 11], top: [8, 8], gun: [10, 10] },
    ARTILLERY: { turretFront: [16, 16], hullFront: [12, 12], side: [8, 8], turretSide: [10, 10], rear: [8, 8], top: [6, 6], gun: [60, 60] }
  };
  // Độ xuyên ở cự ly 0 (mm), mất xuyên theo cự ly (tỉ lệ / 1000 đơn vị bay) và kiểu tác động.
  // Cự ly game nén 0,5 đv/m (GameTiming.rangeScale): 1000 đv bay = ~2 km thật -> các mức dưới ứng với số liệu bắn thật:
  // APFSDS 120mm ~3% / km, 30mm xuyên dưới cỡ ~17% / km, 12.7mm xuyên giáp ~25% / km (tầm hiệu quả ~1,5-2 km)
  const PEN = {
    AP: { mm: 650, loss: 0.06, kind: 'KE', big: true },            // đạn mũi tên APFSDS 120mm
    // đạn nổ phá tiêu chuẩn 120mm. Cân bằng game: xé giáp sườn / đuôi xe tăng (~3 phát hạ); giáp trước chặn được, chỉ chịu
    // chấn động / mảnh bong mặt trong (NONPEN_FLOOR, ~9 phát hạ — ngang đạn nổ lõm / mũi tên không xuyên)
    NORMAL: { mm: 240, loss: 0, kind: 'HE', big: true, postK: { heavy: 0.85 } },
    HE: { mm: 45, loss: 0, kind: 'HE', big: true },                // nổ phá: xé giáp mỏng, gần như vô hại với giáp dày
    CLUSTER: { mm: 90, loss: 0, kind: 'CE', big: true },
    CLUSTER_SUBMUNITION: { mm: 90, loss: 0, kind: 'CE', big: false },  // bom con nổ lõm: đánh nóc xe
    RPG: { mm: 600, loss: 0, kind: 'CE', big: true },
    // đầu nổ kép xuyên cả gạch ERA. Luồng phụt ~5 kg thuốc nổ lọt vào khoang kíp lái / tháp: hạ gọn xe tăng chủ lực & xe 6
    // nòng trong 1 phát (postK đưa 3.0 lên trên 3.2 / 4.0 máu); trúng khoang máy / xích / nòng thì chỉ hỏng nặng bộ phận
    ANTI_TANK_MISSILE: { mm: 1300, loss: 0, kind: 'CE', big: true, tandem: true, postK: { heavy: 1.1, medium: 1.4 } },   // cỡ Kornet-EM
    GATLING_BULLET: { mm: 110, loss: 0.35, kind: 'KE', big: false }, // 30mm xuyên dưới cỡ / nổ-cháy: thủng sườn tăng ở cự ly gần
    INCENDIARY: { mm: 40, loss: 0.35, kind: 'KE', big: false },
    // 12.7mm xuyên giáp (lõi thép cứng): không xuyên vẫn gây chút chấn động / mảnh bong mặt trong (nonpen, đạn nhỏ khác 0.02)
    SCOUT_BULLET: { mm: 32, loss: 0.5, kind: 'KE', big: false, nonpen: 0.05 },
    // 12.7mm xuyên-cháy (lõi thép mềm hơn + thuốc cháy): xuyên kém đạn xuyên giáp. Trước đây dùng chỉ số đạn cháy 30mm
    // (40mm + luật đục giáp của pháo 30mm) -> 39 viên dồn một chỗ hạ được xe tăng
    SCOUT_INCENDIARY: { mm: 22, loss: 0.5, kind: 'KE', big: false, nonpen: 0.03 },
    // lựu 40mm nổ lõm-mảnh (kiểu M430 HEDP ~50-76mm): không mất xuyên theo cự ly. Trước đây tính như đạn 30mm xuyên
    // giáp 110mm -> 16-22 quả vào sườn hạ được xe tăng; nay xe tăng chỉ sợ khi bị bắn đuôi / nóc
    GL40: { mm: 60, loss: 0, kind: 'CE', big: false }
  };
  const PEN_HEAVY = { HE: { mm: 70, loss: 0, kind: 'HE', big: true }, AP: { mm: 300, loss: 0.03, kind: 'KE', big: true }, NORMAL: { mm: 70, loss: 0, kind: 'HE', big: true } };
  // Đạn cao cấp "nổ lõm 2 tầng" (Equipment.PREMIUM.heat_tandem) thay đạn thường bằng đạn nổ lõm thật của pháo tăng
  const PEN_HEAT_TANDEM = { mm: 480, loss: 0, kind: 'CE', big: true, tandem: true };
  // Hiệu quả sau khi xuyên theo cỡ đạn & cỡ xe: mảnh đạn nhỏ trong khoang rộng xe tăng gây ít thiệt hại hơn
  const POSTPEN = { small: { heavy: 0.35, medium: 0.6, light: 1.0, soft: 1.1 }, big: { heavy: 1.0, medium: 1.0, light: 1.2, soft: 1.25 } };
  // Đạn cỡ lớn (pháo tăng, tên lửa, lựu pháo) không xuyên vẫn gây thiệt hại thật: sóng chấn động làm kíp xe choáng / bị
  // thương, mảnh vỡ mặt trong giáp, phá thiết bị ngoài (kính ngắm, thùng đồ, đèn), dồn chấn động vào hệ thống bên trong.
  // Hệ số tối thiểu nhân thêm theo mặt giáp (ARMOR.face: trước 0.7 · sườn 1 · đuôi 1.35 · nóc 1.25).
  // BÁN THỰC TẾ: không xuyên giáp dày thì kíp xe gần như an toàn — thiệt hại chủ yếu là bộ phận ngoài (kính ngắm, xích,
  // phụ kiện: DETACH_DIRECT / hỏng hóc bên dưới), máu chỉ mất chút ít vì chấn động / mảnh bong. Xe tăng chủ lực: mũi ~25
  // phát không xuyên mới hạ, sườn ~18 (mũi tên, đầu nổ lõm, đạn nổ phá như nhau); xe 6 nòng trúng HE không xuyên ~15 phát
  const NONPEN_FLOOR = { HE: { heavy: 0.11, medium: 0.2, light: 0.9, soft: 0.95 }, KE: 0.08, CE: 0.08 };
  // Đạn cỡ lớn trượt nảy trên giáp nghiêng: phần lớn động năng đi theo đạn, chỉ rung chấn & bẻ gãy thiết bị ngoài (~27 phát)
  const RICOCHET_BIG = 0.05;

  /**
   * Kết quả 1 phát trúng: { mul, ratio, pen, zone }
   * mul nhân vào sát thương gốc (sát thương khi xuyên thủng). ratio = độ xuyên / giáp hiệu dụng.
   */
  function armorOutcome(u, opts, ctx) {
    const A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    const T = ARMOR_MM[u.tankType] || ARMOR_MM.ALL_ROUNDER;
    const EQ = typeof Equipment !== 'undefined' && Equipment.armorMul ? Equipment : null;
    const heatTandem = !opts.heavy && opts.ammo === 'NORMAL' && EQ && EQ.isTandem(opts.shooter, 'NORMAL');
    const P = heatTandem ? PEN_HEAT_TANDEM : (opts.heavy && PEN_HEAVY[opts.ammo]) || PEN[penKey(opts)] || PEN.NORMAL;
    const { face, onTurret, hit, dir, d } = ctx;
    // Mặt giáp
    const key = ctx.onTube && T.gun ? 'gun' : face === 'top' ? 'top' : face === 'rear' ? 'rear' : face === 'front' ? (onTurret ? 'turretFront' : 'hullFront') : (onTurret ? 'turretSide' : 'side');
    const base = T[key] || T.side;
    let armor = P.kind === 'KE' ? base[0] : base[1];
    // ống nòng: thành dày ở gốc (buồng đạn), mỏng dần ra miệng nòng
    if (key === 'gun') armor *= tubeWall(ctx.tubeF || 0);
    // Góc chạm: giáp nghiêng dày thêm 1/cos (tối đa x3.5; đầu nổ lõm x5.9)
    let cosI = 0.85;
    if (hit && hit.faceCos !== undefined) cosI = hit.faceCos;
    else if (hit && hit.normal && dir) cosI = Math.abs(hit.normal.clone().normalize().dot(dir));
    if (hit && hit.sloped) cosI = Math.max(cosI, 0.75);
    // đầu nổ lõm chạm quá xiên (> ~80°, vd bắn gần chính diện sượt mép tấm sườn): ngòi kích nổ trễ / luồng phụt trượt dọc mặt
    // giáp -> giáp quy đổi tới x5.9 (đạn động năng góc đó thì nảy hẳn: ExplosionFX.impactSurface)
    armor /= Math.max(P.kind === 'CE' ? 0.17 : 0.285, cosI);
    // Mặt giáp đã mất tấm giáp / váy xích: mỏng đi
    armor /= ((onTurret && d.faceLossT ? d.faceLossT : d.faceLoss)[face] || 1);
    // Trang bị mua thêm: tấm giáp tăng cường còn trên mặt này (gạch giáp nổ tính riêng ở onDirectHit — Equipment.eraEffect)
    if (EQ) armor *= EQ.armorMul(u, face, onTurret);
    // Đạn xả liên tục vào một chỗ làm giáp mỏi / rạn (giảm tối đa 45%)
    if (ctx.fatigue) armor *= 1 - 0.45 * Math.min(1, ctx.fatigue);
    // Độ xuyên giảm theo cự ly bay (đạn động năng)
    let pen = P.mm * (EQ ? EQ.penMul(opts.shooter, opts.ammo) : 1);
    if (P.loss && ctx.range) pen *= Math.max(0.2, 1 - P.loss * (EQ && EQ.penLossMul ? EQ.penLossMul(opts.shooter, opts.ammo) : 1) * ctx.range / 1000);
    const ratio = pen / Math.max(1, armor);
    const sizeK = POSTPEN[P.big ? 'big' : 'small'][A.cls] || 1;
    let mul, penetrated = false;
    const faceK = Math.min(1.3, A.face[face] || 1);
    const floor = !P.big ? 0 : P.kind === 'HE' ? Math.min(0.9, (NONPEN_FLOOR.HE[A.cls] || 0.8) * faceK) : NONPEN_FLOOR[P.kind] * faceK;
    if (hit && hit.ricochet) {
      mul = P.big ? RICOCHET_BIG : 0.02;                            // đạn sượt nảy khỏi giáp nghiêng
    } else if (P.kind === 'HE') {
      // Nổ phá trúng thẳng: giáp mỏng bị xé (đủ uy lực = xuyên), giáp dày chỉ chịu sức ép / mảnh vỡ trong
      if (ratio >= 1) { mul = 1; penetrated = true; } else mul = Math.max(floor, 0.5 * ratio * ratio * ratio);   // gần đủ sức xé (vd sườn xiên) mới bong mảng lớn mặt trong
      mul *= sizeK;
    } else if (ratio >= 1) {
      penetrated = true;
      mul = sizeK;
      // Đạn mũi tên xuyên qua xe giáp mỏng (xuyên thấu, ít mảnh vỡ hơn)
      if (P.kind === 'KE' && P.big && ratio > 8) mul *= 0.9;
    } else if (ratio >= 0.8) {
      // xuyên một phần: mảnh bong mặt trong giáp. Không thấp hơn mức không xuyên (trước đây sát ngưỡng 0,8 gần bằng 0 — đạn gần
      // xuyên được lại kém đạn dội hẳn ra: xe 6 nòng bắn mũi xe 6 nòng ở ~190 m gần như không mất máu)
      mul = Math.max(floor, P.kind === 'CE' ? 0.04 : (P.nonpen || 0.02), sizeK * (ratio - 0.8) / 0.2 * 0.2);
    } else {
      mul = Math.max(floor, P.kind === 'CE' ? 0.04 : (P.nonpen || 0.02));        // không xuyên: chấn động / mảnh vỡ trong
    }
    // đạn súng (12.7 / 30 mm / lựu 40 mm) không thủng giáp xe tăng / xe giáp dày: kíp xe an toàn tuyệt đối, chỉ phá bộ phận ngoài
    // (kính ngắm, đèn, ăng-ten... — xử lý riêng ở onDirectHit), máu gần như không suy suyển
    if (!P.big && !penetrated && (A.cls === 'heavy' || A.cls === 'medium')) mul = Math.min(mul, A.cls === 'heavy' ? 0.002 : 0.006);
    // Hệ số cân bằng sau khi xuyên theo cấp giáp xe (vd đạn thường / tên lửa vào xe tăng chủ lực)
    if (penetrated && P.postK) mul *= P.postK[A.cls] || 1;
    // Vùng trúng (chỉ có ý nghĩa khi đạn lọt vào trong)
    let zone = 'crew';
    if (penetrated || ratio >= 0.8) {
      const tag = ctx.tag;
      // lựu pháo 155mm nổ trên nòng / xích / phụ kiện vẫn chỉ cách nóc khoang ~1 m: sức nổ vẫn phá nát xe
      const hb = opts.heavy && P.kind === 'HE';
      if (ctx.onGun) { zone = 'gun'; mul *= hb ? 0.8 : 0.15; }   // xuyên ống nòng: hỏng pháo (gunHit), kíp xe chỉ chịu chấn động
      else if (ctx.trackOrWheel) { zone = 'running'; mul *= hb ? 0.8 : 0.35; }
      else if (tag && partKind(tag) === 'ammo') { zone = 'ammo'; mul *= 1.8; }
      else if (onTurret && face === 'rear' && (u.tankType === 'ALL_ROUNDER' || u.tankType === 'ARTILLERY')) { zone = 'ammo'; mul *= u.tankType === 'ALL_ROUNDER' ? 1.6 : 1.8; }
      else if (ctx.nearEngine) { zone = 'engine'; mul *= 0.55; }   // khoang máy ngăn với kíp lái: chết máy / cháy hơn là mất kíp
      else if (tag && (partKind(tag) === 'acc' || partKind(tag) === 'heavyAcc')) { zone = 'acc'; mul *= hb ? 0.8 : 0.5; }
      else if (onTurret) { zone = 'crew'; mul *= 1.1; }
      if (EQ) mul *= EQ.spallMul(u, zone);   // lớp lót chống mảnh
      if (EQ && EQ.extHitMul) mul *= EQ.extHitMul(u, opts.ammo, penetrated && P.kind === 'KE' && P.big, zone, !!opts.du);   // bình chữa cháy tự động
    } else if (ctx.onGun || ctx.trackOrWheel) {
      zone = ctx.onGun ? 'gun' : 'running';
      mul *= 0.5;                            // không xuyên trúng nòng / xích: chấn động ít truyền vào khoang
    }
    return { mul, ratio, pen: penetrated, zone, armor: Math.round(armor), penMm: Math.round(pen), key };
  }

  /**
   * Phát trúng đúng tấm KHIÊN CHỮ V (xe 6 nòng) còn nguyên, đạn bay tới trong cung trước ±30° quanh trục xe -> nhóm đạn
   * ('small' | 'cannon' | 'blast' | 'heat' | 'kinetic') để tra xác suất chệch (Equipment.vshieldDeflectP); không thì null.
   * Tên lửa đột nóc bổ nhào (topMsl) không tính — đánh vào nóc
   */
  function vshieldFront(u, hit, dir, opts) {
    if (!u || !hit || !dir || opts.topMsl || typeof Equipment === 'undefined' || !Equipment.has || !Equipment.has(u, 'vshield')) return null;
    const tag = tagAtHit(hit);
    if (!tag || !/^appliqueVS/.test(tag)) return null;
    const d = state(u);
    if (d.lost.has(tag)) return null;
    const sg = segAtHit(u, tag, hit, hit.point);
    if (sg && sg.gone) return null;
    const dl = dir.clone().normalize().applyQuaternion(u.group.getWorldQuaternion(new THREE.Quaternion()).invert()), hz = Math.hypot(dl.x, dl.z);
    if (!(hz > 0.2 && dl.z > 0.866 * hz)) return null;
    return ammoClass(penKey(opts));
  }

  function onDirectHit(u, opts) {
    const events = [];
    if (u && u.group && u.isDead && u.dmg) return onWreckHit(u, opts);
    if (!u || !u.group || u.isDead) return { mul: 1, events };
    // khiên hồi sinh: không đứt xích / hỏng pháo / văng phụ kiện (takeDamage cũng không trừ máu)
    if (u.invulnerableTimer > 0) return { mul: 1, events, shielded: true };
    markGroups(u);
    const d = state(u);
    const A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    const cls = ammoClass(penKey(opts));   // 12.7 xuyên-cháy -> nhóm đạn nhỏ, không theo luật pháo 30mm
    const fx = opts.fx || null;
    FX = fx;
    const hit = opts.hit;
    const dir = opts.dir ? opts.dir.clone().normalize() : new THREE.Vector3(0, -1, 0);
    let mul = 1;

    const point = hit ? hit.point.clone() : u.group.position.clone().add(new THREE.Vector3(0, 10, 0));
    u.group.updateMatrixWorld(true);
    const local = (u.chassisGroup || u.group).worldToLocal(point.clone());
    const onTurret = hit ? isOnTurret(u, hit.object) : false;
    const onGun = hit ? isOnGun(u, hit.object) : false;
    const onTube = onGun && isOnTube(u, hit.object);
    // Trúng lồng thép: nan lồng không phải giáp -> mặt giáp & góc chạm lấy theo tấm vỏ phía sau lồng
    const cageHit = !!hit && /^cage/.test(tagAtHit(hit) || '');
    const plate = cageHit ? plateBehindCage(u, hit, dir) : null;
    if (plate) plate.ricochet = hit.ricochet;
    const armorHit = plate || hit;
    const armorOnTurret = plate ? isOnTurret(u, plate.object) : onTurret;
    let face = !hit ? 'side' : plate ? faceOf(u, plate, armorOnTurret, dir) : cageHit ? faceFromDir(u, dir, onTurret, hit) : faceOf(u, hit, onTurret, dir);
    // tên lửa tấn công đỉnh đang bổ nhào: đầu nổ lõm kích nổ ngay trên nóc (giáp mỏng nhất) dù chạm mép tháp / mũi
    if (opts.topAttack && hit && !cageHit) { face = 'top'; hit.faceCos = Math.max(hit.faceCos || 0, 0.8); hit.sloped = false; }

    // Xuyên giáp: độ xuyên của đạn vs giáp mặt bị trúng (nghiêng theo góc chạm), vùng trúng, cỡ đạn vs cỡ xe
    const tag0 = tagAtHit(hit);
    // (hệ thống đánh chặn APS bắn hạ đạn / UAV giữa đường bay, trước khi tới được xe: game.js onApsThreat / kamiApsCheck)
    const EQ = typeof Equipment !== 'undefined' && Equipment.slatHit ? Equipment : null;
    // Trúng lồng thép còn nguyên (Equipment.slatHit): chặn hẳn một số loại đạn, các loại khác bị giảm sát thương bên dưới
    // (tên lửa đột nóc bổ nhào: mái lồng chỉ giảm bớt — game.js tính theo Equipment.roofCage, không gieo chặn hẳn ở đây)
    const SH = EQ && EQ.slatHit && tag0 && !d.lost.has(tag0) && !opts.topMsl ? EQ.slatHit(tag0, opts.gl40 ? 'GL40' : opts.kami ? 'KAMI' : penKey(opts) === 'HEAT120' ? 'HEAT120' : opts.ammo, !!opts.heavy, !VIS_ONLY) : null;
    if (SH && SH.defeated) {
      // Lồng thép bóp méo đầu đạn nổ lõm / kích nổ sớm bom con: đầu nổ không tạo được luồng xuyên, chỉ xé toác lồng
      // tại chỗ trúng; mảng lồng hứng đủ CAGE_SHRED phát như vậy thì nát bung khỏi xe
      if (dentCage(u, tag0, point, dir, 1.3) >= CAGE_SHRED && detachTag(u, tag0, dir.clone().multiplyScalar(40))) onPartLost(u, tag0, partKind(tag0), events, fx, point);
      sparksAt(point, 14);
      sfx('slat', point, 1, { dud: true });
      events.push({ type: 'slat', text: 'LỒNG THÉP BÓP MÉO ĐẦU ĐẠN — không xuyên được vỏ xe' });
      FX = null;
      return { mul: 0.03, events, dud: true, cls };
    }
    // KHIÊN CHỮ V (xe 6 nòng — giáp cách quãng trước mũi): trúng đúng tấm còn nguyên, đạn bay tới trong cung trước ±30°.
    // Tấm xiên làm chệch đạn (Equipment.vshieldDeflectP) -> tính như đạn nảy (armorOutcome: đạn lớn còn RICOCHET_BIG);
    // không chệch mà là đầu nổ lõm: kích nổ trên tấm, luồng phụt tản qua khoảng hở tới vỏ (vshieldHeatMul). Máy chỉ vẽ hình
    // (VIS_ONLY) không gieo chệch — kết quả do máy có quyền tính
    // Chệch hay không do game.js quyết TRƯỚC khi vẽ hình phát trúng (vshieldFront + hạt giống của viên đạn — mọi máy cùng
    // kết quả, cùng thấy vệt sượt / nổ lệch) và gắn vào hit.vsDeflect; ở đây chỉ báo & tính đầu nổ lõm kích nổ trên tấm
    let vsHeat = 1;
    if (hit && hit.vsDeflect) {
      events.push({ type: 'vshield', text: cls === 'blast' ? 'ĐẠN TRƯỢT TRÊN KHIÊN CHỮ V, NỔ LỆCH RA NGOÀI — chỉ xây xát'
        : cls === 'heat' ? 'ĐẦU NỔ LÕM CHẠM XIÊN KHIÊN CHỮ V, KÍCH NỔ SAI — luồng phụt không vào vỏ'
          : 'KHIÊN CHỮ V LÀM CHỆCH ĐẠN — đạn sượt khỏi tấm xiên' });
    } else if (cls === 'heat' && EQ && EQ.vshieldHeatMul && vshieldFront(u, hit, dir, opts)) {
      vsHeat = EQ.vshieldHeatMul(opts.shooter, opts.ammo);
      events.push({ type: 'vshield', text: `ĐẦU NỔ LÕM KÍCH NỔ TRÊN KHIÊN CHỮ V CÁCH QUÃNG — luồng phụt tản qua khoảng hở (còn ~${Math.round(vsHeat * 100)}%)` });
    }
    const lp0 = u.group.worldToLocal(point.clone());
    const eng0 = ENGINE[u.tankType] || ENGINE.ALL_ROUNDER;
    const nearEngine = !onTurret && Math.hypot(lp0.x - eng0[0], lp0.y - eng0[1], lp0.z - eng0[2]) < 11;
    const trackOrWheel = !onTurret && (A.drive === 'wheels' ? wheelIndexAt(u, hit, local) >= 0 : (local.y < 9.6 && Math.abs(local.x) > 8));
    const range = opts.shooter ? Math.hypot(point.x - opts.shooter.x, point.z - opts.shooter.z) : (opts.range || 0);
    const spotKey0 = Math.round(lp0.x / 4) + ',' + Math.round(lp0.y / 4) + ',' + Math.round(lp0.z / 4);
    const fatigue = cls === 'cannon' && d.spots ? (d.spots[spotKey0] || 0) / 20 : 0;   // 12.7mm không làm mỏi được giáp nó không xuyên nổi
    const AO = armorOutcome(u, opts, { face, onTurret: armorOnTurret, onGun, onTube, tubeF: onTube ? tubeFrac(u, point) : 0, hit: armorHit, dir, point, d, tag: tag0, nearEngine, trackOrWheel, range, fatigue });
    mul = AO.mul * vsHeat;
    d.lastOutcome = AO;
    if (SH && !(hit && hit.ricochet)) {
      mul *= SH.mul;
      if (SH.mul < 1) sfx('slat', point, 0.6);
      if (SH.mul < 1) events.push({ type: 'slatHit', text: SH.noFire ? 'LỒNG THÉP HỨNG ĐẠN CHÁY — vỏ xe không bén lửa' : `LỒNG THÉP HỨNG ĐẠN — giảm ${Math.round((1 - SH.mul) * 100)}% sát thương` });
    }
    // Trúng gạch giáp phản ứng nổ còn nguyên: gạch kích nổ phá đầu đạn (xem Equipment.eraEffect)
    const EQR = typeof Equipment !== 'undefined' && Equipment.eraEffect ? Equipment : null;
    // Chỉ đúng viên gạch bị trúng kích nổ (viên đã nổ thì chỗ đó hết tác dụng, các viên bên cạnh vẫn còn)
    const eraSeg = EQR && tag0 && partKind(tag0) === 'era' && !(hit && hit.ricochet) ? segAtHit(u, tag0, hit, point) : null;
    if (eraSeg && !eraSeg.gone) {
      const eff = EQR.eraEffect(opts.ammo, !!opts.heavy, opts.shooter);
      if (eff.trigger) {
        // Gạch chỉ cắt mất phần lớn luồng kim loại của đầu nổ lõm đơn (~50-70%), không triệt hẳn: phía sau là giáp xe tăng thì
        // phần luồng còn lại không xuyên nổi, vỏ mỏng của xe 6 nòng / xe bánh lốp vẫn bị khoét thủng
        const resid = eff.why === 'defeat' ? ({ heavy: 0, medium: 0.15, light: 0.3, soft: 0.3 }[A.cls] || 0) : 0;
        mul *= resid || eff.mul;
        breakSeg(u, tag0, eraSeg, 'era', point, events);
        events.push({ type: 'eraStop', text: resid ? `GẠCH GIÁP NỔ CẮT PHẦN LỚN LUỒNG NỔ LÕM — phần còn lại vẫn khoét thủng vỏ mỏng (còn ${Math.round(resid * 100)}% sát thương)`
          : eff.mul === 0 ? 'GẠCH GIÁP NỔ ĐÃ PHÁ HỦY ĐẦU ĐẠN — không mất máu'
          : eff.why === 'tandem' ? 'Đầu nổ mồi kích nổ gạch giáp — đầu chính vẫn xuyên vào'
          : eff.why === 'kinetic' ? 'Gạch giáp nổ chém lệch mũi tên xuyên giáp — giảm 40% sát thương'
          : eff.why === 'blast' ? 'Đạn nổ phá làm gạch giáp nổ — gạch chỉ đỡ được chút sức ép (giảm 20%)'
          : 'Lựu pháo 155mm quá mạnh — gạch giáp nổ chỉ đỡ được chút ít (giảm 15%)' });
      }
    }
    if (AO.zone === 'ammo' && AO.pen && opts.ammo !== 'SCOUT_BULLET') events.push({ type: 'ammoRack', text: 'TRÚNG KHO ĐẠN — sát thương cực lớn' });
    // Lớp lót chống mảnh (trang bị): phát xuyên vào khoang bị lớp sợi aramid giữ bớt mảnh vỡ -> báo cho người chơi biết
    if (AO.pen && (cls === 'kinetic' || cls === 'heat' || cls === 'cannon') && typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'spall')) {
      if (AO.zone !== 'ammo') events.push({ type: 'spall', text: `LỚP LÓT CHỐNG MẢNH đã chặn bớt mảnh vỡ trong khoang (sát thương -${AO.zone === 'crew' ? 20 : 10}%)` });
    }
    // Bình chữa cháy (trang bị) dập chớp lửa khi đạn xuyên giáp lọt vào khoang (đạn cháy không báo từng viên: bắn liên thanh)
    if (AO.pen && cls === 'kinetic' && typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'fireext')) {
      events.push(opts.du
        ? { type: 'fireext', text: 'BÌNH CHỮA CHÁY KHÔNG DẬP NỔI — mảnh urani nghèo tự bốc cháy trong khoang' }
        : { type: 'fireext', text: `BÌNH CHỮA CHÁY dập chớp lửa trong khoang (sát thương -${AO.zone === 'ammo' ? 15 : 8}%, ít bốc cháy)` });
    }
    if (!AO.pen && AO.ratio < 0.8 && !(hit && hit.ricochet) && (cls === 'kinetic' || cls === 'heat')) events.push({ type: 'nopen', text: `KHÔNG XUYÊN GIÁP (${AO.penMm}mm < ${AO.armor}mm) — nhắm chỗ giáp mỏng hơn: sườn / đuôi / nóc` });

    const impulse = dir.clone().multiplyScalar(cls === 'small' ? 25 : cls === 'cannon' ? 40 : 70);
    const tag = tagAtHit(hit);
    // Phát trúng gần nhất: hiệu ứng phá hủy (explosion_fx.killInfo) dựa vào vùng trúng / hướng đạn để chọn kiểu xe chết
    d.last = { cls, heavy: !!opts.heavy, point: point.clone(), zone: AO.zone, pen: !!AO.pen, onTurret, onGun, face, tag: tag0, dir: dir.clone(), ammo: opts.ammo, seed: opts.seed, at: Date.now(), armorMm: AO.armor, penMm: AO.penMm, ratio: AO.ratio, events };

    // Xả đạn liên thanh dồn vào cùng một chỗ: giáp bị đục dần tới khi thủng (giáp càng dày càng lâu)
    let boredThrough = false;
    if ((cls === 'cannon' || cls === 'small') && hit) {
      const gl = u.group.worldToLocal(point.clone());
      const key = Math.round(gl.x / 4) + ',' + Math.round(gl.y / 4) + ',' + Math.round(gl.z / 4);
      d.spots = d.spots || {};
      const n = (d.spots[key] = (d.spots[key] || 0) + 1);
      let need = cls === 'cannon' ? { heavy: 16, medium: 7, light: 3, soft: 2 }[A.cls] : { heavy: 9999, medium: 30, light: 5, soft: 3 }[A.cls];
      // Giáp quá dày so với cỡ đạn (vd 30mm vào giáp trước xe tăng): xả bao nhiêu cũng không đục thủng được
      // (12.7mm: giáp dày hơn ~1,7 lần độ xuyên — vd giáp 45mm của xe Gatling — cũng không đục nổi)
      if (AO.ratio < (cls === 'small' ? 0.6 : 0.35)) need = 9999;
      // lựu 40mm nổ lõm: phát nào không thủng thì luồng phụt tan trên mặt giáp — nổ chồng bao nhiêu cũng không "khoan" thủng
      if (opts.gl40 && AO.ratio < 0.8) need = 9999;
      // Tấm giáp tăng cường: phải đục qua lớp gốm ngoài trước -> lâu thủng hơn
      else if (EQ && EQ.appliqueCovers && EQ.appliqueCovers(u, face, onTurret)) need = Math.ceil(need * 1.6);
      // Vỏ thép bị đạn xả liên tục: lõm dần (giáp dày lõm ít), đục thủng rồi thì mảng vỏ quanh đó oằn, rách, móp cả khung
      if (hit && hit.object && hit.normal) {
        const per = { heavy: 0.025, medium: 0.06, light: 0.12, soft: 0.16 }[A.cls] * (cls === 'cannon' ? 1 : 0.4);
        const cap = { heavy: 0.6, medium: 1.2, light: 1.8, soft: 2.2 }[A.cls];
        d.dentDepth = d.dentDepth || {};
        const cur = d.dentDepth[key] || 0;
        // Đạn 12.7mm / 30mm không làm oằn / rách cả mảng vỏ thép: chỉ để lỗ / hõm / muội cỡ thật (vết dán trên mặt vỏ, do
        // ExplosionFX.impactSurface đặt). Miếng lõm 3D chỉ dành cho đạn pháo. Vẫn tính độ lõm tích luỹ cho logic đục thủng.
        if (cur < cap) d.dentDepth[key] = cur + Math.min(per, cap - cur);
      }
      // Giai đoạn 1: vết lõm chồng chéo lan rộng, sứt mẻ lớp giáp ngoài
      if (n === Math.ceil(need * 0.4) && need > 2 && fx && fx.addSurfaceMark && hit.object) {
        fx.addSurfaceMark(point, hit.normal, hit.object, cls === 'cannon' ? 'heiSplash' : 'steelDent', cls === 'cannon' ? 3.6 : 1.8, { unit: u });
        sparksAt(point, 10);
      }
      // Giai đoạn 3: mảng giáp quanh chỗ bị đục vỡ bung ra (váy xích, module giáp, gạch ERA, phụ kiện gần nhất)
      if (n === Math.ceil(need * 1.7)) {
        let best = null, bd = 14;
        for (const tg of Object.keys(u.partRegistry || {})) {
          if (d.lost.has(tg)) continue;
          const k = partKind(tg);
          if (k !== 'armor' && k !== 'era' && k !== 'acc' && k !== 'heavyAcc') continue;
          if (/^cage/.test(tg)) continue;   // lồng thép: móp tại chỗ (dentCage), không bung cả mảng

          const wp = partWorld(u, tg);
          const dd = wp ? wp.distanceTo(point) : 1e9;
          if (dd < bd) { bd = dd; best = tg; }
        }
        // tấm hàn / gạch ERA: khối gần nhất nứt vỡ (không cả cụm văng); phụ kiện, váy xích: bung ra
        if (best && segmented(best)) damageSeg(u, best, segAtHit(u, best, null, point), 0.6, point, events, 'loose');
        else if (best && detachTag(u, best, impulse.clone().multiplyScalar(1.5))) onPartLost(u, best, partKind(best), events, fx, point);
        else if (fx && fx.addSurfaceMark && hit.object) fx.addSurfaceMark(point, hit.normal, hit.object, 'penetration', 3.6, { unit: u });
        mul = Math.max(mul, (POSTPEN.small[A.cls] || 1) * 0.5);
        if (A.cls !== 'heavy') addFire(u, point, 0.7, rand(8, 16));
        events.push({ type: 'spall', text: 'MẢNG GIÁP BỊ ĐẠN LIÊN THANH ĐỤC VỠ BUNG RA' });
      }
      // SẤY DỒN MỘT CHỖ (ô ~1 m): mỗi viên trúng lại vùng đó làm lớp giáp / thiết bị quanh đó yếu dần -> sát thương mỗi viên
      // tăng dần (tối đa x2,5 sau ~25 viên); rải đạn khắp xe thì không được cộng dồn
      const key2 = Math.round(gl.x / 8) + ',' + Math.round(gl.y / 8) + ',' + Math.round(gl.z / 8);
      d.zone8 = d.zone8 || {};
      const n8 = (d.zone8[key2] = (d.zone8[key2] || 0) + 1);
      // (giáp dày đạn không xuyên nổi: dồn bao nhiêu viên cũng không làm khoang bên trong hư thêm — chỉ phụ kiện ngoài)
      if (AO.pen || (A.cls !== 'heavy' && A.cls !== 'medium')) mul *= 1 + Math.min(1.5, 0.06 * (n8 - 1));
      // ... và phụ kiện ngoài nằm trong vùng đó (đèn, hộp, kính, radar, ăng-ten trạm súng...) cứ ~5 viên lại có cơ hội bị
      // băm nát / bắn văng dù viên đạn không trúng thẳng vào nó
      if (n8 % 5 === 0 && Math.random() < (cls === 'cannon' ? 0.7 : 0.5)) {
        let best = null, bd = 9;
        for (const tg of Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {}))) {
          if (d.lost.has(tg)) continue;
          const k = partKind(tg);
          if (k !== 'acc' && k !== 'optic' && k !== 'sensor' && k !== 'feed' && k !== 'atgm' && !(k === 'heavyAcc' && cls === 'cannon')) continue;
          const wp = partWorld(u, tg);
          const dd = wp ? wp.distanceTo(point) : 1e9;
          if (dd < bd) { bd = dd; best = tg; }
        }
        if (best && detachTag(u, best, impulse.clone().multiplyScalar(0.8))) onPartLost(u, best, partKind(best), events, fx, point);
        if (Math.random() < 0.3) breakAntennas(u, point, 10, 0.6, impulse);
      }
      if (n >= need) {
        boredThrough = true;
        // Lọt vào trong: đạn nổ-cháy 30mm dễ gây cháy (xe giáp mỏng cháy ngay)
        if (n === need && cls === 'cannon' && Math.random() < { heavy: 0.15, medium: 0.35, light: 0.6, soft: 0.7 }[A.cls]) addFire(u, point, 0.6, rand(6, 14));
        // đục thủng: tính như đạn xuyên vào trong (theo cỡ đạn vs cỡ xe)
        mul = Math.max(mul, POSTPEN.small[A.cls] || 1);
        if (n === need) {
          if (fx && fx.addSurfaceMark && hit.object) fx.addSurfaceMark(point, hit.normal, hit.object, cls === 'cannon' ? 'heiHole' : 'steelHole', cls === 'cannon' ? 3.0 : 1.8, { unit: u });
          sparksAt(point, 16);
          sfx('armorPlate', point, 0.7);
          events.push({ type: 'bored', text: face === 'front' ? 'GIÁP MŨI BỊ ĐẠN XẢ LIÊN TỤC ĐỤC THỦNG' : 'GIÁP BỊ ĐẠN XẢ LIÊN TỤC ĐỤC THỦNG — đạn lọt vào bên trong' });
        }
      }
    }

    // 1. Bộ phận bị trúng trực tiếp
    // Trúng kính: nặng thì vỡ toác cả ô kính
    const hm = hit && hit.object && hit.object.material;
    if (hm && hm.userData && hm.userData.windowGlass) {
      // Kính cabin: đạn nhỏ thủng lỗ + rạn, trúng nhiều phát thì cả ô kính nát vụn rồi rơi hẳn; đạn lớn phá bay kính ngay
      d.glassHits = (d.glassHits || 0) + (cls === 'small' ? 1 : cls === 'cannon' ? 2 : 6);
      if (d.glassHits >= 6) breakOutGlass(u, fx);
      else if (d.glassHits >= 2) shatterAllGlass(u);
    }
    const bendable = tag && /^(skirt|flap|rail|mirror|lamp|bin|box|smoke|shield|cage|travelLock|tool|can|cans|stowage)/.test(tag);
    if (segmented(tag)) {
      // Tấm giáp hàn / bắt bu-lông: không văng cả tấm — đạn khoét lỗ (vết thủng do ExplosionFX dán), tấm hấp thụ một phần,
      // mất độ bền -> nứt -> bung. Gạch ERA không kích nổ (đạn nhỏ, đạn nảy): nắp móp vênh -> hộp xệ trên giá -> rơi khỏi giá
      const sg = segAtHit(u, tag, hit, point);
      if (sg && !sg.gone) {
        const ric = hit && hit.ricochet;
        const eraSmall = partKind(tag) === 'era' && ERA_DMG[cls] !== undefined;
        const amt = eraSmall ? ERA_DMG[cls] * (ERA_CLS[A.cls] || 1) : ((/^sandbag/.test(tag) ? BAG_DMG : PLATE_DMG)[cls] || 0) * (cls === 'blast' && opts.heavy ? 2 : 1);
        damageSeg(u, tag, sg, amt * (ric ? 0.3 : 1), point, events, eraSmall ? 'loose' : 'blown');
        if (!ric && !/^(appliqueKit|era)/.test(tag)) mul *= { kinetic: 0.9, heat: 0.85, blast: 0.85 }[cls] || 1;
      }
    } else if (tag && /^cage/.test(tag) && !d.lost.has(tag)) {
      // Lồng thép: móp / xé tại chỗ trúng (đạn nhỏ chỉ thỉnh thoảng làm cong nan); nát hẳn sau CAGE_SHRED phát nặng mới bung cả mảng
      if (cls !== 'small' || Math.random() < 0.35) {
        const n = dentCage(u, tag, point, dir, CAGE_POWER[cls] || 0.5);
        if (n >= CAGE_SHRED && detachTag(u, tag, impulse)) onPartLost(u, tag, partKind(tag), events, fx, point);
      }
    } else if (tag && partKind(tag) === 'fuel' && cls !== 'blast') {
      // Bình nhiên liệu bắt chặt vào thân: trúng đạn thì thủng, rò dầu và bốc cháy tại chỗ — không bay khỏi xe
      if (!VIS_ONLY && !d.lost.has(tag) && Math.random() < DETACH_DIRECT.fuel[cls]) { d.lost.add(tag); onPartLost(u, tag, 'fuel', events, fx, point); }
    } else if (tag && !d.lost.has(tag) && bendable && !d.bent.has(tag) && (cls === 'cannon' || (cls === 'small' && Math.random() < 0.3) || (cls !== 'small' && Math.random() < 0.45))) {
      // Lần trúng đầu: oằn / vặn méo, lần sau mới bị xé bay
      if (bendTag(u, tag, impulse)) { const bf = armorPartFace(tag); if (bf && /^skirt/.test(tag) && !VIS_ONLY) thinFace(d, bf, 1.05); }
    } else if (tag && !d.lost.has(tag)) {
      const kind = partKind(tag);
      const p = (DETACH_DIRECT[kind] || DETACH_DIRECT.acc)[cls];
      if (Math.random() < p && detachTag(u, tag, impulse)) {
        onPartLost(u, tag, kind, events, fx, point);
        // tấm giáp bị xé văng hấp thụ một phần phát này (lồng thép đã tính ở SH); mặt giáp mỏng đi: xem onPartLost
        if (kind === 'armor' && !SH) mul *= cls === 'heat' ? 0.6 : 0.85;
      }
    }
    // Vỏ thép bị đạn lớn đánh móp thật (biến dạng lưới): giáp dày lõm ít, xe nhẹ / xe tải móp sâu
    if (hit && (cls === 'kinetic' || cls === 'heat' || cls === 'blast') && !(hit.ricochet && cls === 'kinetic')) {
      const depthBy = { heavy: 0.35, medium: 0.6, light: 1.0, soft: 1.3 }[A.cls] * (cls === 'blast' ? (opts.heavy ? 1.8 : 1.1) : cls === 'heat' ? 0.9 : 1);
      crumpleAt(u, point, dir, cls === 'blast' ? (opts.heavy ? 9 : 6.5) : 5, depthBy);
    } else if (boredThrough && hit && Math.random() < 0.25) {
      crumpleAt(u, point, dir, 3.5, { heavy: 0.1, medium: 0.2, light: 0.35, soft: 0.45 }[A.cls]);
    }
    // Ăng-ten trúng đạn / sóng nổ gần
    if (cls !== 'small' || Math.random() < 0.15) breakAntennas(u, point, cls === 'small' ? 4 : cls === 'cannon' ? 7 : 16, cls === 'small' ? 0.5 : 0.9, impulse);
    // Gãy ăng-ten: mất liên lạc vô tuyến — đồng đội không còn thấy vị trí xe trên bản đồ, xe không báo vị trí địch được (TeamIntel)
    { const dd = state(u);
      if (dd.radioLost && !dd._radioEv) { dd._radioEv = true; events.push({ type: 'radio', text: 'GÃY ĂNG-TEN — mất liên lạc: đồng đội không thấy vị trí xe, không báo được vị trí địch' }); }
      if (dd.mapLost && !dd._mapEv) { dd._mapEv = true; events.push({ type: 'map', text: 'MẤT HẾT ĂNG-TEN — mất bản đồ số: tắt minimap, không mở được bản đồ chiến thuật' }); } }

    // 2. Sóng nổ (đạn nổ / nổ lõm) bóc phụ kiện quanh điểm chạm
    if (cls === 'blast' || cls === 'heat') {
      const R = opts.ammo === 'HE' ? (opts.heavy ? 40 : 26) : opts.ammo === 'CLUSTER_SUBMUNITION' ? 10 : cls === 'heat' ? 14 : 18;
      stripAround(u, point, R, impulse, events, fx, 0.8);
    }

    // 3. Hỏng hóc cơ khí theo vùng trúng
    const pen = { small: { heavy: 0, medium: 0.01, light: 0.06, soft: 0.08 }, cannon: { heavy: 0.02, medium: 0.06, light: 0.18, soft: 0.22 }, kinetic: 0.55, heat: 0.6, blast: 0.3 }[cls];
    // hỏng hóc bên trong (động cơ, vòng tháp...) chủ yếu khi đạn thật sự lọt vào; xích / bánh / nòng ở ngoài vẫn hỏng được
    const penK = boredThrough || AO.pen ? 1.25 : AO.ratio >= 0.8 ? 0.6 : 0.12;
    const pPen = (typeof pen === 'number' ? pen : pen[A.cls]) * penK + (boredThrough ? 0.2 : 0);
    if (onTube) {
      gunHit(u, cls, AO, !!(hit && hit.ricochet), events, point, dir);
    } else if (onGun) {
      // tấm chắn nòng / giá pháo: không làm cong ống nòng, đạn xuyên / chấn động làm hư giá pháo, bộ hãm lùi
      if (Math.random() < pPen * 1.4) damageGun(u, events);
    } else if (onTurret) {
      if (local.y < (u.turretGroup.position.y + 2.6) && Math.random() < pPen * 0.8) damageRing(u, events);
      else if (Math.random() < pPen * 0.35) damageGun(u, events);
    } else {
      const eng = ENGINE[u.tankType] || ENGINE.ALL_ROUNDER;
      const gl = u.group.worldToLocal(point.clone());
      const dEng = Math.hypot(gl.x - eng[0], gl.y - eng[1], gl.z - eng[2]);
      if (dEng < 11 && Math.random() < pPen * (face === 'rear' || face === 'top' ? 1.3 : 1)) damageEngine(u, events, cls === 'heat' || cls === 'kinetic');
      if (A.drive === 'wheels') {
        const wi = wheelIndexAt(u, hit, local);
        // Lốp: đạn súng máy cũng đủ làm thủng lốp (lốp có lõi chạy xẹp nhưng vẫn mất áp suất)
        const pTire = { small: 0.35, cannon: 0.7, kinetic: 0.9, heat: 1, blast: 0.9 }[cls];
        // Đạn nổ lõm / xuyên / nổ mạnh trúng bánh: văng hẳn bánh; đạn nhỏ chỉ thủng xẹp
        const pBlow = { small: 0, cannon: 0.03, kinetic: 0.15, heat: 0.6, blast: opts.heavy ? 0.75 : 0.3 }[cls];
        if (wi >= 0 && Math.random() < pBlow) blowWheel(u, wi, events, fx, impulse);
        else if (wi >= 0 && !d.gone[wi] && !VIS_ONLY) {
          // Bắn liên tục vào một lốp: xịt -> rách nát, chạy trên vành (mất gần hết khả năng cơ động)
          d.tireWear[wi] = (d.tireWear[wi] || 0) + { small: 0.14, cannon: 0.5, kinetic: 0.8, heat: 1, blast: 0.8 }[cls];
          if (!d.flat[wi] && (Math.random() < pTire || d.tireWear[wi] >= 0.3)) flatTire(u, wi, events, fx);
          else if (d.flat[wi] && !d.shred[wi] && d.tireWear[wi] >= 1.6) {
            d.shred[wi] = true;
            animUnits.add(u);
            const names = u.wheelSet.positions.length > 4 ? WHEEL_NAMES_6 : WHEEL_NAMES_4;
            events.push({ type: 'tire', text: `LỐP ${names[wi] || ''} BỊ BẮN NÁT — xe chạy trên vành, gần như không cơ động nổi` });
            sfx('tire', point, 0.8);
          }
        }
        // Lựu pháo: thủy lực càng ở đuôi
        if (!VIS_ONLY && u.tankType === 'ARTILLERY' && local.z > 28 && local.y < 14 && Math.random() < pPen) {
          if (!d.hydraulics) { d.hydraulics = true; events.push({ type: 'hyd', text: 'HỆ THỦY LỰC CÀNG CHỐNG HỎNG — hạ / thu càng chậm' }); }
        }
      } else if ((local.y < 9.6 && Math.abs(local.x) > 8) || trackSideAt(u, local, { kinetic: 2, heat: 3, blast: opts.heavy ? 6 : 5 }[cls] || 0) >= 0) {
        // Xích: đạn lớn có thể đứt ngay; đạn 30mm xả liên tục làm mòn gãy chốt mắt xích rồi đứt; 12.7mm gần như vô hại.
        // Đạn lớn nổ / xuyên ở chắn bùn, váy xích, mép thân ngay trên xích: tấm thép oằn đè xuống + mảnh văng gãy chốt
        // (đạn nổ phá với xa nhất; mũi tên xuyên giáp chỉ đục lỗ nhỏ, phải trúng sát xích)
        const onRun = (local.y < 9.6 && Math.abs(local.x) > 8) || trackSideAt(u, local, 0) >= 0;
        const ts = trackSideAt(u, local, 6);
        const side = ts >= 0 ? ts : local.x < 0 ? 0 : 1;
        const near = onRun ? 1 : 0.6;
        const pTrack = { small: 0.01, cannon: 0.02, kinetic: 0.45, heat: 0.55, blast: opts.heavy ? 0.75 : 0.5 }[cls] * near;
        if (d.trackTimer[side] <= 0 && !VIS_ONLY) {
          const wBefore = d.trackWear[side] || 0;
          d.trackWear[side] = wBefore + { small: 0.012, cannon: 0.34, kinetic: 1, heat: 1, blast: 0.8 }[cls] * near;
          if (wBefore < 1 && d.trackWear[side] >= 1) events.push({ type: 'track', text: `XÍCH ${side ? 'PHẢI' : 'TRÁI'} HƯ — gãy chốt, lỏng mắt xích: xe chậm & lệch` });
          if (Math.random() < pTrack || d.trackWear[side] >= 2.2) breakTrack(u, side, events, fx, point);
        }
      }
    }

    // Lỗ xuyên giáp bốc cháy tại chỗ (xăng dầu, dây điện, đạn dự trữ bên trong)
    // mũi tên lõi urani nghèo: mảnh urani tự bốc cháy văng khắp khoang -> dễ bén lửa hơn (DU_FIRE lần), lửa mạnh hơn,
    // bình chữa cháy trong khoang không làm gì được
    const du = cls === 'kinetic' && !!opts.du;
    const extF = typeof Equipment !== 'undefined' && Equipment.extFireChance ? Equipment.extFireChance(u, opts.ammo, cls, du) : 1;   // bình chữa cháy tự động
    if ((cls === 'heat' || cls === 'kinetic') && !onGun && AO.pen && Math.random() < Math.min(0.95, (A.cls === 'heavy' ? 0.35 : 0.6) * extF * (du ? DU_FIRE : 1))) {
      const life = rand(10, 22), f = addFire(u, point, cls === 'heat' ? 1.1 : du ? 1.0 : 0.8, life);
      if (du) f.du = true;
      // lửa trong khoang (dầu thủy lực, dây điện, đạn dự trữ): cháy thật, trừ máu (trước đây chỉ là hình)
      if (!VIS_ONLY && u.ignite) u.ignite(life * 0.6);
    }
    // Đạn nổ phá cỡ lớn xé thủng vỏ: dầu thủy lực / dây điện / đồ đạc trong khoang bén lửa
    else if (cls === 'blast' && !onGun && AO.pen && Math.random() < (A.cls === 'heavy' ? 0.35 : 0.55) * extF) addFire(u, point, 0.9, rand(10, 20));
    // Đạn lớn không xuyên (kể cả trúng giáp mũi): chớp nổ đốt thùng đồ, can dầu, dầu mỡ bám vỏ ngoài -> cháy nhỏ tại chỗ
    else if ((cls === 'blast' || cls === 'heat' || cls === 'kinetic') && !onGun && !AO.pen && !(hit && hit.ricochet)
      && Math.random() < (cls === 'kinetic' ? 0.15 : 0.3) * extF) addFire(u, point, 0.55, rand(6, 12));
    // Xe đã hư nặng (máu < ~45%) còn trúng đạn lớn: lửa bén hẳn tại chỗ trúng, cháy lâu (không chỉ ở khoang máy)
    if ((cls === 'blast' || cls === 'heat' || cls === 'kinetic') && !onGun && u.maxHp && u.hp / u.maxHp < 0.45
      && !d.fires.some(f => f.lasting) && Math.random() < 0.6 * extF) {
      addFire(u, point, 0.9, 45);
      d.fires[d.fires.length - 1].lasting = true;
    }
    // 12.7 xuyên-cháy không thủng giáp (vd vỏ xe tăng): thuốc cháy tóe trên mặt thép rồi tắt, không bén vào xe
    const incNoFire = !AO.pen && (penKey(opts) === 'SCOUT_INCENDIARY' || A.cls === 'heavy' || A.cls === 'medium');
    if (opts.ammo === 'INCENDIARY' && !incNoFire && !(SH && SH.noFire) && Math.random() < 0.3 * extF) addFire(u, point, 0.5, rand(4, 8));
    // Lưới lá ngụy trang bén lửa tại chỗ trúng (đạn cháy, nổ, nổ lõm) — máy có quyền quyết định rồi gửi trong digest
    if (!VIS_ONLY && typeof CamoFire !== 'undefined' && u._cfStatic && CamoFire.onHit(u, { point, ammo: opts.ammo, heavy: !!opts.heavy, shooter: opts.shooter })) {
      events.push({ type: 'camoFire', text: 'LƯỚI NGỤY TRANG BỐC CHÁY — xe bị lộ' });
    }
    if (d.engine >= 2 && !d.fires.some(f => f.engine)) {
      const e = ENGINE[u.tankType] || ENGINE.ALL_ROUNDER; const wp = u.group.localToWorld(new THREE.Vector3(e[0], e[1], e[2])); addFire(u, wp, 1.2, 60); d.fires[d.fires.length - 1].engine = true;
      // khoang máy hỏng nặng: ~40% bén cháy nhiên liệu / dầu thật (hệ dập lửa tự động giảm khả năng)
      if (!VIS_ONLY && u.ignite && Math.random() < 0.4 * extF) u.ignite(rand(8, 15));
    }
    // Đạn nổ mạnh đánh vào gầm / sườn xe bánh lốp: vặn méo khung gầm
    if (!VIS_ONLY && (cls === 'blast' || cls === 'heat') && A.drive === 'wheels' && !onTurret && local.y < 11 && Math.random() < (opts.heavy ? 0.5 : 0.2)) {
      d.frame = Math.max(-1, Math.min(1, d.frame + (local.x < 0 ? -1 : 1) * rand(0.5, 1)));
      if (!d.frameEv) { d.frameEv = true; events.push({ type: 'frame', text: 'KHUNG GẦM BỊ VẶN MÉO — xe vẹo, khó lái, chậm' }); }
      sfx('armorPlate', point);
    }

    // Tấm giáp tăng cường trên mặt bị trúng hấp thụ đạn nhỏ & sức nổ (Equipment.appliqueDamageMul)
    if (EQ && EQ.appliqueDamageMul) mul *= EQ.appliqueDamageMul(u, face, onTurret, cls);

    // KÍP XE BÊN TRONG (xe tăng, xe 6 nòng, xe pháo): phát xuyên vào khoang kíp — mảnh giáp / luồng phụt có thể làm bị thương
    // pháo thủ (trúng tháp) hoặc lái xe (trúng thân trước / sườn). Xe trinh sát có kíp lộ người riêng (vehicle_crew.js)
    if (!VIS_ONLY && AO.pen && AO.zone === 'crew' && !(u.crew && u.crew.kind === 'scout') && mul > 0.2) {
      const pk = cls === 'small' || cls === 'cannon' ? 0.5 : 1;
      if (Math.random() < (onTurret ? 0.35 : 0.12) * pk) {
        d.crewG = Math.max(d.crewG || 0, 15);
        events.push({ type: 'crew', text: 'PHÁO THỦ BỊ THƯƠNG — trưởng xe kiêm thay, nạp đạn & bắn chậm ~15 s' });
      }
      if (!onTurret && face !== 'rear' && face !== 'top' && Math.random() < 0.25 * pk) {
        d.crewD = Math.max(d.crewD || 0, 8);
        events.push({ type: 'crew', text: 'LÁI XE BỊ THƯƠNG — xe khựng lại ~8 s chờ người thay lái' });
      }
    }
    recompute(u);
    FX = null;
    if (d.last) d.last.mul = mul;   // phòng thử đạn (range_lab.js) đọc lại phát trúng gần nhất
    // pen / cls / zone / ratio: kết quả xuyên giáp cho lớp âm thanh "xuyên vào trong" (game.js armorHitSound)
    return { mul, events, noFire: !!(SH && SH.noFire) || incNoFire, pen: !!AO.pen, ratio: AO.ratio, zone: AO.zone, cls, vsHeat: vsHeat < 1 };
  }

  // Bóc các bộ phận trong bán kính R quanh điểm nổ
  function stripAround(u, point, R, impulse, events, fx, strength) {
    if (!u.partRegistry && !u.partGroups) return;
    markGroups(u);
    const d = state(u);
    const tags = Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {}));
    let n = 0;
    // tấm hàn / gạch ERA: sức nổ chỉ làm nứt / bung từng khối gần tâm nổ
    damageSegsNear(u, point, R * 0.5, 0.35 * strength, events);
    for (const tag of tags) {
      if (d.lost.has(tag) || n >= 4 || segmented(tag)) continue;
      if (/^cage/.test(tag) && u.partRegistry && u.partRegistry[tag]) {
        // lồng thép: mảng lồng trải dài cả mặt xe -> sức nổ chỉ móp / xé phần nan gần tâm nổ, không giật bay cả mảng;
        // mảng hứng đủ CAGE_SHRED phát nặng (trúng thẳng + nổ sát) mới nát bung
        const k = dentCage(u, tag, point, impulse.clone().normalize(), Math.min(1.2, 0.9 * (strength || 1)));
        if (k >= CAGE_SHRED && detachTag(u, tag, impulse)) { onPartLost(u, tag, partKind(tag), events, fx, point); n++; }
        continue;
      }
      const wp = partWorld(u, tag);
      if (!wp) continue;
      const dist = wp.distanceTo(point);
      if (dist > R) continue;
      const kind = partKind(tag);
      const p = Math.pow(1 - dist / R, 1.2) * (kind in DETACH_BLAST ? DETACH_BLAST[kind] : 1) * strength;
      if (Math.random() < p) {
        const away = wp.clone().sub(point).normalize().multiplyScalar(60 * (1 - dist / R) + 15).add(impulse.clone().multiplyScalar(0.3));
        if (detachTag(u, tag, away)) {
          onPartLost(u, tag, kind, events, fx, wp);
          n++;
        }
      }
    }
  }

  /**
   * Trúng sóng nổ / mảnh văng (không trực tiếp). Trả { mul, events }.
   */
  function onSplash(u, opts) {
    const events = [];
    if (u && u.group && u.isDead && u.dmg) return onWreckHit(u, Object.assign({ splash: true }, opts));
    if (!u || !u.group || u.isDead) return { mul: 1, events };
    if (u.invulnerableTimer > 0) return { mul: 1, events, shielded: true };
    const d = state(u);
    const A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    const cls = ammoClass(opts.ammo);
    const fx = opts.fx || null;
    FX = fx;
    const point = new THREE.Vector3(opts.x, opts.y, opts.z);
    d.last = { cls, heavy: !!opts.heavy, point: point.clone(), splash: true, ammo: opts.ammo, seed: opts.seed, at: Date.now() };
    // Sóng nổ / mảnh văng: giáp dày chặn tốt, xe nhẹ & xe tải bị mảnh văng xé nát
    let mul = opts.heavy && cls !== 'small' && cls !== 'cannon' ? VS.blast155[A.cls] : cls === 'heat' || cls === 'kinetic' ? VS.blast[A.cls] : VS[cls][A.cls];
    // Nổ ngay dưới gầm / trên nóc (đạn chùm, lựu pháo, mọi quả nổ cao hơn nóc thân ~2 m — nổ trên tán cây, trên mái nhà)
    // đánh vào chỗ giáp mỏng
    if (opts.ammo === 'CLUSTER_SUBMUNITION' || opts.heavy || point.y > u.group.position.y + 16) mul *= A.face.top;
    // Tấm giáp tăng cường che sườn / tháp: chặn bớt mảnh văng
    if (typeof Equipment !== 'undefined' && Equipment.appliqueSplashMul) mul *= Equipment.appliqueSplashMul(u, cls);
    // Lồng thép quanh xe đỡ mảnh văng: ít sát thương hơn, ít hỏng lốp / xích / phụ kiện hơn (partK)
    const SL = typeof Equipment !== 'undefined' && Equipment.slatSplash ? Equipment.slatSplash(u, cls) : { mul: 1, partK: 1, noFire: false };
    mul *= SL.mul;
    // khiên chữ V (xe 6 nòng): quả nổ phía trước mũi -> hai tấm thép hứng mảnh & sóng nổ
    if (typeof Equipment !== 'undefined' && Equipment.vshieldSplashMul) mul *= Equipment.vshieldSplashMul(u, point);
    // ... và bao cát đối trọng sau đuôi: quả nổ phía sau -> lớp cát hứng mảnh
    if (typeof Equipment !== 'undefined' && Equipment.sandbagSplashMul) mul *= Equipment.sandbagSplashMul(u, point);
    // sk: phần mảnh văng / sức ép còn lại sau vật che giữa điểm nổ và xe (game.js blastShield: tường, gò đất, cây, ụ đất,
    // nước, mái cứ điểm) — giảm cả hư hại bộ phận như giảm máu. Lựu 40mm: đầu nổ nhỏ, xé phụ kiện / lốp yếu hơn đạn pháo
    const sk = opts.shieldK === undefined ? 1 : Math.max(0, Math.min(1, opts.shieldK));
    const pk = SL.partK * sk * (opts.gl40 ? 0.5 : 1);
    const k = Math.max(0, 1 - opts.dist / Math.max(1, opts.radius)) * sk;
    const impulse = point.clone().sub(u.group.position).normalize().multiplyScalar(-40 * k);
    u.group.updateMatrixWorld(true);

    if ((cls !== 'small' && cls !== 'cannon') || opts.gl40) {
      stripAround(u, point, opts.radius * 0.75, impulse, events, fx, 0.6 * pk);
      breakAntennas(u, point, opts.radius * 0.8, 0.7 * sk, impulse);
      // Lốp bị mảnh văng xé / xích bị sóng nổ đánh đứt
      if (A.drive === 'wheels' && u.wheelSet) {
        u.wheelSet.positions.forEach((p, i) => {
          const wp = (u.chassisGroup || u.group).localToWorld(new THREE.Vector3(p.x, p.y, p.z));
          const dd = wp.distanceTo(point);
          const kk = 1 - dd / (opts.radius * 0.6);
          if (kk <= 0) return;
          if (opts.heavy && dd < 22 && Math.random() < kk * 0.6 * pk) blowWheel(u, i, events, fx, wp.clone().sub(point).normalize().multiplyScalar(60));
          else if (Math.random() < kk * 0.55 * pk) flatTire(u, i, events, fx);
        });
        // Kính cabin vỡ do sóng nổ & mảnh văng
        if (k > 0.25) { if (shatterGlass(u, point.clone().add(new THREE.Vector3(0, 4, 0)), Math.round(2 + 4 * k)) && (k > 0.6 || opts.heavy)) breakOutGlass(u, fx); }
        if (!VIS_ONLY && opts.heavy && k > 0.55 && Math.random() < 0.4) {
          const lp = u.group.worldToLocal(point.clone());
          d.frame = Math.max(-1, Math.min(1, d.frame + (lp.x < 0 ? 1 : -1) * rand(0.4, 0.9)));
          if (!d.frameEv) { d.frameEv = true; events.push({ type: 'frame', text: 'KHUNG GẦM BỊ SÓNG NỔ VẶN MÉO — xe vẹo, khó lái' }); }
        }
      } else if (A.drive === 'tracks' && opts.dist < 22 && Math.random() < (opts.heavy ? 0.4 : 0.18) * k * pk) {
        const lp = u.group.worldToLocal(point.clone());
        breakTrack(u, lp.x < 0 ? 0 : 1, events, fx, point);
      }
      // Mảnh văng xuyên khoang máy xe nhẹ
      if ((A.cls === 'light' || A.cls === 'soft') && Math.random() < 0.12 * k * pk) damageEngine(u, events, false);
    } else if (A.drive === 'wheels' && u.wheelSet && opts.dist < 14 && Math.random() < 0.15 * sk) {
      // Loạt đạn 30mm / súng máy rải quanh bánh
      const lp = (u.chassisGroup || u.group).worldToLocal(point.clone());
      const wi = wheelIndexAt(u, null, lp);
      if (wi >= 0) flatTire(u, wi, events, fx);
    }
    // Quả nổ sát xe: cầu lửa / mảnh nóng làm lưới lá bén lửa
    if (!VIS_ONLY && sk > 0.3 && typeof CamoFire !== 'undefined' && u._cfStatic && CamoFire.onHit(u, { point, ammo: opts.ammo, heavy: !!opts.heavy, shooter: opts.shooter, splash: true, dist: opts.dist, radius: opts.radius })) {
      events.push({ type: 'camoFire', text: 'LƯỚI NGỤY TRANG BỐC CHÁY — xe bị lộ' });
    }
    recompute(u);
    FX = null;
    // tóe chất cháy 12.7 sát xe giáp dày (xe tăng, xe xích 6 nòng): không bén vào vỏ thép
    const incSplashNoFire = penKey(opts) === 'SCOUT_INCENDIARY' && (A.cls === 'heavy' || A.cls === 'medium');
    return { mul, events, noFire: SL.noFire || incSplashNoFire };
  }

  // Xe bị phá hủy. K = explosion_fx.killInfo(u): kiểu chết theo phát kết liễu.
  // Ngoài đời: xe chết vì 1 phát xuyên vào khoang kíp lái / khoang máy thì VỎ XE CÒN NGUYÊN (chỉ lỗ xuyên + cháy);
  // chỉ khi kho đạn / nhiên liệu kích nổ (K.instant === 'det', hoặc trễ -> onDetonate) thân mới phồng bung, phụ kiện bay
  function onDestroyed(u, fx, K) {
    if (!u || !u.group) return;
    markGroups(u);
    const d = state(u);
    if (d.destroyedDone) return;
    d.destroyedDone = true;
    FX = fx;
    const events = [];
    const L = d.last;
    const det = !K || K.instant === 'det';
    const blastKill = K && K.mode === 'blast';
    const center = u.group.position.clone().add(new THREE.Vector3(0, 10, 0));
    // Xác xe cháy cả ở đúng chỗ trúng phát kết liễu (vd mũi xe), không chỉ khoang máy / vòng tháp; lửa xác không tắt
    if (L && L.point && L.cls !== 'small' && (!L.at || Date.now() - L.at < 8000) && !L.onGun) addFire(u, L.point, 1, 1e9);
    // Phụ kiện: nổ (kho đạn / đạn nổ phá) mới bóc tung; cháy thì chỉ vài món lỏng lẻo rơi
    if (det || blastKill) stripAll(u, det ? 1 : 0.6);
    breakAntennas(u, null, 0, det ? 0.7 : 0.25, new THREE.Vector3(rand(-30, 30), 40, rand(-30, 30)));
    // Bánh xe: chỉ văng khi đòn chí mạng là nổ mạnh / nổ lõm / xuyên sát bánh; còn lại lốp xẹp (lửa cháy lốp)
    if (u.wheelSet) {
      const strong = L && (L.cls === 'heat' || L.cls === 'kinetic' || (L.cls === 'blast' && (L.heavy || !L.splash)));
      u.wheelSet.positions.forEach((p, i) => {
        const wp = (u.chassisGroup || u.group).localToWorld(new THREE.Vector3(p.x, p.y, p.z));
        const dist = L ? wp.distanceTo(L.point) : 1e9;
        if (strong && dist < 20 && Math.random() < (L.cls === 'heat' || L.heavy ? 0.75 : 0.45)) blowWheel(u, i, events, fx, wp.clone().sub(L.point).normalize().multiplyScalar(50));
        else if (dist < 26 || Math.random() < (det ? 0.3 : 0.1)) flatTire(u, i, events, fx, true);
      });
    }
    // Xích: phát kết liễu trúng xích / nổ mạnh sát xích mới đứt (xe chết vì xuyên tháp vẫn nằm trên xích)
    if (u.trackSystem && u.trackSystem.breakSide) {
      let side = Math.random() < 0.5 ? 0 : 1, fwd = Math.random() < 0.5, overTrack = false;
      if (L && L.point) {
        const lp = (u.chassisGroup || u.group).worldToLocal(L.point.clone());
        side = lp.x < 0 ? 0 : 1; fwd = lp.z < 0;
        // phát kết liễu là đạn lớn trúng chắn bùn / váy xích / mép thân ngay trên xích
        const ts = L.cls === 'small' || L.cls === 'cannon' || L.onTurret ? -1 : trackSideAt(u, lp, 5);
        if (ts >= 0) { side = ts; overTrack = true; }
      }
      const nearTrack = L && (L.zone === 'running' || overTrack || (L.cls === 'blast' && !L.onTurret));
      if ((det || nearTrack) && !(u.trackBroken && u.trackBroken[side])) u.trackSystem.breakSide(side, fwd);
      const strongKill = L && (L.heavy || L.cls === 'blast' || L.cls === 'heat');
      if (det && strongKill && Math.random() < 0.55) u.trackSystem.breakSide(1 - side, Math.random() < 0.5);
      u.trackBroken = [true, true];
    }
    // Kính: nổ thổi bay cả ô kính; xuyên / cháy chỉ làm rạn (lửa nung vỡ dần)
    if (!det || !breakOutGlass(u, fx)) crackAllGlass(u, 2);
    d.frame = (Math.random() < 0.5 ? -1 : 1) * (det ? rand(0.3, 0.6) : rand(0.05, 0.15));
    // Hố móp tại điểm trúng chí mạng (nổ lõm / xuyên móp ít, nổ phá móp sâu)
    if (L && L.point) {
      const dirIn = u.group.position.clone().add(new THREE.Vector3(0, 9, 0)).sub(L.point);
      crumpleAt(u, L.point, dirIn, L.heavy ? 13 : 9, L.heavy ? 2.6 : L.cls === 'heat' || L.cls === 'kinetic' ? (det ? 1.6 : 0.8) : 1.2);
    }
    // Đạn nổ phá / lựu pháo đánh nóc: nóc khoang bị ép lõm
    if (blastKill && !det) crushHull(u, rand(0.15, 0.25), { roof: 0.8, sag: 0.2, sides: 0, twist: 0.1 });
    if (det) { detonateHull(u); blowHatches(u, 1, events); }
    // không nổ ngay: kíp lái còn sống mở nắp thoát ra (xả áp hốc đạn: kíp lái được vách ngăn che, cũng thoát)
    else if (Math.random() < 0.55) blowHatches(u, 0.3, events);
    recompute(u);
    applyPose(u);
    FX = null;
  }

  function stripAll(u, k) {
    const d = state(u);
    const center = u.group.position.clone().add(new THREE.Vector3(0, 10, 0));
    const tags = Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {}));
    for (const tag of tags) {
      if (d.lost.has(tag)) continue;
      if (segmented(tag)) {
        // tấm hàn / gạch ERA bắt chặt bên ngoài: nổ trong khoang chỉ làm bung lác đác vài khối
        for (const sg of segmentsOf(u, tag)) if (!sg.gone && Math.random() < k * 0.12) breakSeg(u, tag, sg, 'plate', null, []);
        continue;
      }
      const kind = partKind(tag);
      if (kind === 'hatch') continue;   // nắp: blowHatches
      if (Math.random() < k * (kind === 'acc' ? 0.55 : 0.3)) {
        const wp = partWorld(u, tag) || center;
        detachTag(u, tag, wp.clone().sub(center).setY(0).normalize().multiplyScalar(rand(40, 90) * k).add(new THREE.Vector3(0, rand(20, 50) * k, 0)));
      }
    }
  }

  // Kho đạn / nhiên liệu kích nổ bên trong: nóc & sườn phồng bung, khung vặn, xe ngồi sụp
  function detonateHull(u) {
    const internal = u.tankType !== 'SCOUT' || Math.random() < 0.4;
    crushHull(u, rand(0.25, 0.4), { roof: 0, sag: 0.4, sides: 0, twist: 0.3, bulge: internal ? 1 : 0.4 });
  }

  // Kho đạn kích nổ TRỄ (lửa cháy lan tới kho đạn vài giây sau khi xe bị hạ)
  function onDetonate(u, fx) {
    if (!u || !u.group || !u.dmg) return;
    const d = state(u);
    if (d.detonated) return;
    d.detonated = true;
    FX = fx;
    stripAll(u, 0.8);
    breakAntennas(u, null, 0, 0.7, new THREE.Vector3(rand(-30, 30), 40, rand(-30, 30)));
    breakOutGlass(u, fx);
    d.frame = (d.frame < 0 ? -1 : 1) * Math.max(Math.abs(d.frame || 0), rand(0.3, 0.5));
    if (u.trackSystem && u.trackSystem.breakSide && Math.random() < 0.6) u.trackSystem.breakSide(Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5);
    detonateHull(u);
    blowHatches(u, 1, []);
    recompute(u);
    applyPose(u);
    guardBarrel(u);
    FX = null;
  }

  // Đặt tư thế thân xe trực tiếp (xác xe / phòng thử không chạy vòng cập nhật động lực học)
  function applyPose(u) {
    const d = state(u), cg = u.chassisGroup;
    if (!cg) return;
    if (!d.chassis0) d.chassis0 = { p: cg.position.clone(), r: cg.rotation.clone() };
    // Bỏ phần nghiêng / sụt đã áp ở khung trước (xe đang chạy cập nhật mỗi khung) rồi áp giá trị mới.
    // Tổng = phần do bánh xẹp / mất bánh / khung vặn (recompute) + phần do xác xe bị bắn nát dồn (w*) — tách riêng để
    // recompute (vd. lúc kho đạn nổ) không xóa mất độ sụt của xác làm xác bật ngược lên
    const tR = d.tiltR + (d.wTiltR || 0), tP = d.tiltP + (d.wTiltP || 0), sk = (d.sink || 0) + (d.wSink || 0);
    cg.rotation.z += tR - (d.tiltRApplied || 0);
    cg.rotation.x += tP - (d.tiltPApplied || 0);
    cg.position.y += (d.sinkApplied || 0) - sk;
    d.tiltRApplied = tR; d.tiltPApplied = tP; d.sinkApplied = sk;
  }

  // Kính vỡ: mặt kính chuyển sang kính an toàn rạn vỡ (nứt mạng nhện trắng mờ toàn ô kính) + mảnh kính văng
  let SHATTER_TEX = null;
  function shatterTex() {
    if (SHATTER_TEX || typeof document === 'undefined') return SHATTER_TEX;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    // nền: kính sẫm (giữ nguyên độ trong / phản chiếu của kính lành)
    g.fillStyle = '#1a2125'; g.fillRect(0, 0, 256, 256);
    const cx0 = 70 + Math.random() * 116, cy0 = 60 + Math.random() * 120;
    // vùng rạn vụn trắng đục quanh tâm vỡ (lớp kính an toàn vỡ thành hạt nhỏ)
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * 6.283, r = Math.pow(Math.random(), 1.8) * 70;
      const x = cx0 + Math.cos(a) * r, y = cy0 + Math.sin(a) * r;
      g.fillStyle = `rgba(200,212,218,${(0.35 - r / 240) * Math.random()})`;
      g.fillRect(x, y, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
    // 1 tâm vỡ chính + 1 tâm phụ nhỏ: vết nứt tỏa tia + vòng nứt gấp khúc
    for (let cIdx = 0; cIdx < 2; cIdx++) {
      const cx = cIdx ? 40 + Math.random() * 176 : cx0, cy = cIdx ? 40 + Math.random() * 176 : cy0;
      g.strokeStyle = cIdx ? 'rgba(225,232,236,0.45)' : 'rgba(232,238,242,0.8)'; g.lineWidth = cIdx ? 0.8 : 1.1;
      const rays = cIdx ? 8 : 15 + Math.floor(Math.random() * 6);
      const ang = [];
      for (let r = 0; r < rays; r++) {
        let a = (r / rays) * 6.283 + Math.random() * 0.3, x = cx, y = cy;
        ang.push(a);
        g.beginPath(); g.moveTo(x, y);
        const steps = (cIdx ? 3 : 7) + Math.floor(Math.random() * 6);
        for (let k = 0; k < steps; k++) { a += (Math.random() - 0.5) * 0.35; x += Math.cos(a) * 15; y += Math.sin(a) * 15; g.lineTo(x, y); }
        g.stroke();
      }
      g.lineWidth = 0.7; g.strokeStyle = 'rgba(220,230,236,0.4)';
      for (let ring = 1; ring < (cIdx ? 3 : 5); ring++) {
        g.beginPath();
        for (let r = 0; r <= rays; r++) { const a = ang[r % rays], rr = ring * 17 * (0.85 + Math.random() * 0.3); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; r ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      g.fillStyle = 'rgba(240,245,248,0.85)'; g.beginPath(); g.arc(cx, cy, 5, 0, 6.3); g.fill();
    }
    SHATTER_TEX = new THREE.CanvasTexture(c);
    return SHATTER_TEX;
  }
  function shatterAllGlass(u) {
    const d = state(u);
    if (d.glassShattered) return;
    d.glassShattered = true;
    d.glassSaved = [];
    const seen = new Set();
    u.group.traverse(o => {
      const m = o.isMesh && o.material;
      if (!m || seen.has(m) || !m.userData || m.userData.surface !== 'glass') return;
      if (m.color && m.color.r > 0.4) return;   // kính đèn pha / đèn hậu giữ nguyên
      seen.add(m);
      d.glassSaved.push({ m, map: m.map, color: m.color.clone(), rough: m.roughness, metal: m.metalness, em: m.emissive ? m.emissive.clone() : null, emI: m.emissiveIntensity });
      m.map = shatterTex(); m.color.setHex(u.isDead ? 0x555a5c : 0xffffff); m.roughness = 0.3; m.metalness = 0.45;
      if (m.emissive) { m.emissive.setHex(0x05090b); m.emissiveIntensity = 0.3; }
      m.needsUpdate = true;
      // mảnh kính văng
      if (FX && FX.fire && o.geometry) {
        o.geometry.computeBoundingSphere();
        const c0 = o.localToWorld(o.geometry.boundingSphere.center.clone());
        for (let q = 0; q < 14; q++) FX.fire.add({ x: c0.x + rand(-4, 4), y: c0.y + rand(-2, 2), z: c0.z + rand(-4, 4), vx: rand(-35, 35), vy: rand(0, 35), vz: rand(-35, 35), size: rand(0.4, 0.9), grow: 0, drag: 0.5, grav: 120, life: rand(0.5, 1.1), alpha: 0.9, fadeIn: 0.005, c0: [0.85, 0.92, 0.95], c1: [0.6, 0.7, 0.75], cell: 3 });
      }
    });
    sfx('glass', u.group.position.clone().add(new THREE.Vector3(0, 14, 0)));
  }

  // ---------------------------------------------------------------------------
  // KÍNH VỠ HẲN: ô kính rơi mất -> nhìn thấu vào khoang lái (nội thất tối + ghế + kíp lái)
  // Thân cabin là khối đặc nên dùng stencil: hình ô kính ghi mặt nạ, nội thất chỉ vẽ trong mặt nạ đó.
  // ---------------------------------------------------------------------------
  let STENCIL_REF = 0;
  function cabinGlass(u) {
    const cg = u.chassisGroup || u.group;
    return cg.children.filter(o => o.isMesh && !o.isInstancedMesh && o.material && o.material.userData && o.material.userData.windowGlass);
  }
  function breakOutGlass(u, fx) {
    const d = state(u);
    if (d.glassOut) return false;
    // chỉ xe có cabin kính (xe bánh lốp); khối kính quan sát của xe tăng chỉ rạn
    if ((ARMOR[u.tankType] || {}).drive !== 'wheels') return false;
    const meshes = cabinGlass(u);
    if (!meshes.length) return false;
    d.glassOut = true;
    shatterAllGlass(u);
    const ref = (STENCIL_REF = STENCIL_REF % 250 + 1);
    const box = new THREE.Box3();
    d.glassOutObjs = [];
    for (const o of meshes) {
      const pos = o.geometry.attributes.position;
      // bỏ kính gương chiếu hậu (gắn ngoài cabin)
      const skip = [];
      const pr = o.userData.partRanges || {};
      for (const t in pr) if (/^mirror/.test(t)) for (const [st, n] of pr[t]) skip.push([st, st + n]);
      const inSkip = i => skip.some(([a, b]) => i >= a && i < b);
      const pts = [];
      for (let i = 0; i < pos.count; i += 3) {
        if (inSkip(i)) continue;
        for (let k = 0; k < 3; k++) pts.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      }
      if (!pts.length) continue;
      // mặt nạ ô cửa
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mask = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: ref, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
      mask.position.copy(o.position); mask.quaternion.copy(o.quaternion); mask.scale.copy(o.scale);
      mask.renderOrder = 50; mask.userData.isFxDecal = true; mask.castShadow = false;
      o.parent.add(mask);
      d.glassOutObjs.push(mask);
      // khung kính trống: tam giác kính bị thu về một điểm (lưu bản gốc để hồi sinh)
      d.saved.push({ attr: pos, data: pos.array.slice(0), start: 0 });
      for (let i = 0; i < pos.count; i += 3) {
        if (inSkip(i)) continue;
        for (let k = 1; k < 3; k++) pos.setXYZ(i + k, pos.getX(i), pos.getY(i), pos.getZ(i));
      }
      pos.needsUpdate = true;
      mg.computeBoundingBox();
      box.union(mg.boundingBox.clone().translate(o.position));
    }
    if (box.isEmpty()) return true;
    // Nội thất: chỉ vẽ trong mặt nạ ô cửa, vẽ đè (không xét độ sâu) theo thứ tự xa -> gần
    const cg = u.chassisGroup || u.group;
    const g = new THREE.Group();
    g.userData.isFxDecal = true;
    const mat = (color, order, side) => {
      const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), side: side || THREE.FrontSide,
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.EqualStencilFunc,
        stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
        depthFunc: THREE.AlwaysDepth });
      return [m, order];
    };
    const add = (geo, [m, order], x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
      mesh.renderOrder = order; mesh.castShadow = false; mesh.userData.isFxDecal = true;
      g.add(mesh);
      return mesh;
    };
    const hw = Math.max(2.5, Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) - 0.7);
    const yTop = box.max.y + 0.6, yBot = box.min.y - 5;
    const zF = box.min.z + 0.4, zB = Math.max(box.max.z, box.min.z + 10) + 1;
    // vỏ khoang (mặt trong tối, nhìn thấy vách sau / sàn / trần)
    add(new THREE.BoxGeometry(hw * 2, yTop - yBot, zB - zF), mat(0x141516, 51, THREE.BackSide), 0, (yTop + yBot) / 2, (zF + zB) / 2);
    const midY = (box.min.y + box.max.y) / 2;
    // bảng táp-lô dưới kính chắn gió
    add(new THREE.BoxGeometry(hw * 2 - 0.4, 1.4, 2.4), mat(0x262624, 52), 0, box.min.y - 0.4, zF + 1.3);
    const headY = midY + 0.4, torsoY = headY - 2.5, seatY = torsoY - 1.9;
    const zHead = zF + Math.min(5.5, (zB - zF) * 0.35);
    const crewCol = u.team === 'RED' ? 0x4a3d2a : 0x3a422b;
    for (const s of [-1, 1]) {
      const x = s * hw * 0.48;
      add(new THREE.BoxGeometry(2.8, 4.2, 0.6), mat(0x202020, 52), x, seatY + 2.4, zHead + 1.8);          // lưng ghế
      add(new THREE.BoxGeometry(2.8, 0.6, 2.6), mat(0x202020, 52), x, seatY, zHead + 0.6);                // đệm ghế
      add(new THREE.BoxGeometry(2.6, 3.2, 1.6), mat(crewCol, 53), x, torsoY, zHead + 0.4);                // thân
      add(new THREE.SphereGeometry(0.82, 12, 10), mat(0xb48866, 54), x, headY, zHead);                    // đầu
      add(new THREE.SphereGeometry(0.98, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x3a402c, 55), x, headY + 0.15, zHead + 0.05); // mũ
      for (const a of [-1, 1]) add(new THREE.BoxGeometry(0.55, 0.55, 2.8), mat(crewCol, 54), x + a * 1.15, torsoY + 0.6, zHead - 1.0, -0.45, 0, 0); // tay
      if (s < 0) add(new THREE.TorusGeometry(1.05, 0.13, 6, 18), mat(0x111111, 56), x, torsoY + 1.1, zHead - 2.4, -0.5, 0, 0); // vô-lăng
    }
    cg.add(g);
    d.glassOutObjs.push(g);
    // mảnh kính vỡ rơi lả tả
    if (FX && FX.fire) {
      for (const o of meshes) {
        const c0 = cg.localToWorld(box.getCenter(new THREE.Vector3()));
        for (let q = 0; q < 28; q++) FX.fire.add({ x: c0.x + rand(-hw, hw), y: c0.y + rand(-1, 2), z: c0.z + rand(-5, 5), vx: rand(-20, 20), vy: rand(-5, 20), vz: rand(-20, 20), size: rand(0.3, 0.7), grow: 0, drag: 0.6, grav: 140, life: rand(0.5, 1.2), alpha: 0.9, fadeIn: 0.005, c0: [0.85, 0.92, 0.95], c1: [0.55, 0.62, 0.66], cell: 3 });
        void o;
      }
    }
    sfx('glass', cg.localToWorld(box.getCenter(new THREE.Vector3())), 1.2);
    void fx;
    return true;
  }

  // Vỡ toàn bộ kính: nứt mạng nhện trên từng ô kính (lấy tâm các tam giác mặt kính) + mảnh kính văng
  function crackAllGlass(u, perPane) {
    shatterAllGlass(u);
    return;
    if (!FX || !FX.addSurfaceMark) return;
    u.group.updateMatrixWorld(true);
    const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    u.group.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || !o.material || !o.material.userData || o.material.userData.surface !== 'glass') return;
      if (o.material.emissiveIntensity !== undefined && o.material.color && o.material.color.r > 0.4) return; // bỏ kính đèn pha sáng màu
      const pos = o.geometry.attributes.position;
      const tris = pos.count / 3;
      const picks = Math.min(tris, 6 * perPane);
      for (let k = 0; k < picks; k++) {
        const t = Math.floor(Math.random() * tris) * 3;
        a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
        const area = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
        if (area.length() < 0.6) continue;     // tam giác mép kính quá nhỏ
        v.copy(a).add(b).add(c).divideScalar(3);
        const n = area.normalize().transformDirection(o.matrixWorld);
        const wp = o.localToWorld(v.clone());
        FX.addSurfaceMark(wp, n, o, 'glassCrack', rand(4, 7), { unit: u });
        if (FX.fire && Math.random() < 0.5) for (let q = 0; q < 6; q++) FX.fire.add({ x: wp.x, y: wp.y, z: wp.z, vx: rand(-40, 40), vy: rand(0, 40), vz: rand(-40, 40), size: rand(0.4, 0.9), grow: 0, drag: 0.5, grav: 120, life: rand(0.5, 1.1), alpha: 0.9, fadeIn: 0.005, c0: [0.85, 0.92, 0.95], c1: [0.6, 0.7, 0.75], cell: 3 });
      }
    });
    sfx('glass', u.group.position.clone().add(new THREE.Vector3(0, 14, 0)));
  }

  // Hồi sinh: trả xe về nguyên vẹn
  function reset(u) {
    if (typeof CamoFire !== 'undefined' && u) CamoFire.reset(u);   // lưới lá cháy: trả lá xanh khi hồi sinh
    const d = u.dmg;
    if (!d) return;
    // Trả hình dạng vỏ trước (ảnh chụp lúc lõm lần đầu), rồi mới trả các bộ phận đã tách
    if (d.dents) for (const D of d.dents) if (D.m.parent) D.m.parent.remove(D.m);
    if (d.glassOutObjs) for (const o of d.glassOutObjs) if (o.parent) o.parent.remove(o);
    // trả theo thứ tự ngược (ảnh chụp sau cùng trả trước) để bộ phận tách trước đó cũng về đúng
    for (let i = d.saved.length - 1; i >= 0; i--) {
      const s = d.saved[i];
      s.attr.array.set(s.data, s.start * 3);
      s.attr.needsUpdate = true;
    }
    // Trả lưới gốc (trước khi chia nhỏ / biến dạng) + khoảng đỉnh bộ phận ban đầu
    if (d.geoSwaps) {
      for (let i = d.geoSwaps.length - 1; i >= 0; i--) {
        const s = d.geoSwaps[i];
        const cur = s.mesh.geometry;
        s.mesh.geometry = s.orig;
        if (cur && cur !== s.orig) cur.dispose();
        if (s.ranges && s.mesh.userData.partRanges) {
          for (const tag in s.ranges) {
            const arr = s.mesh.userData.partRanges[tag];
            if (!arr) continue;
            arr.length = 0;
            for (const r of s.ranges[tag]) arr.push(r.slice());
          }
        }
        PREPPED.delete(s.mesh);
      }
    }
    u._partCenters = null;
    if (d.segMeshes) for (const m of d.segMeshes) delete m.userData.segRanges;
    for (const g of d.hiddenGroups) g.visible = true;
    for (const [set, i] of d.hiddenAnt) set.setHidden(i, false);
    if (u.wheelSet) u.wheelSet.resetDamage();
    if (u.chassisGroup) { const cg = u.chassisGroup; cg.rotation.z -= d.tiltRApplied || 0; cg.rotation.x -= d.tiltPApplied || 0; cg.position.y += d.sinkApplied || 0; }
    if (d.glassSaved) for (const g of d.glassSaved) { g.m.map = g.map; g.m.color.copy(g.color); g.m.roughness = g.rough; g.m.metalness = g.metal; if (g.em) { g.m.emissive.copy(g.em); g.m.emissiveIntensity = g.emI; } g.m.needsUpdate = true; }
    if (d.gunBent) d.gunBent.obj.rotation.copy(d.gunBent.rot);
    if (u.trackSystem && u.trackSystem.repairSide) { u.trackSystem.repairSide(0); u.trackSystem.repairSide(1); }
    const b = d.base;
    for (const k in b) if (b[k] !== undefined) u[k] = b[k];
    u.trackBroken = [false, false];
    u._turretYaw = undefined;
    for (let i = debrisList.length - 1; i >= 0; i--) if (debrisList[i].u === u) removeDebris(i);
    animUnits.delete(u);
    u.dmg = null;
  }

  // Cập nhật mỗi khung hình: mảnh vỡ, hẹn giờ nối xích, lửa bị nước dập
  // fx: hệ hiệu ứng (hơi nước khi lửa tắt); bỏ trống thì lấy của trận đang chơi
  function update(dt, units, fx) {
    if (!fx && typeof window !== 'undefined' && window.game && window.game.effectsManager) fx = window.game.effectsManager.fx;
    updateDebris(dt);
    if (units) {
      for (const u of units) {
        const d = u.dmg;
        if (!d || u.isDead) continue;
        let changed = false;
        for (let s = 0; s < 2; s++) {
          if (d.trackTimer[s] > 0) {
            d.trackTimer[s] = Math.max(0, d.trackTimer[s] - dt);
            if (d.trackTimer[s] === 0) {
              changed = true;
              if (u.trackSystem && u.trackSystem.repairSide) u.trackSystem.repairSide(s);
              if (d.useSpareTrack) { d.useSpareTrack = false; stowTag(u, 'spareTrack'); }
            }
          }
        }
        if (tireChange(u, d, dt)) changed = true;
        for (const k of ['crewG', 'crewD']) if (d[k] > 0) { d[k] = Math.max(0, d[k] - dt); if (d[k] === 0) changed = true; }
        const fk = (typeof Equipment !== 'undefined' && Equipment.fireMul) ? Equipment.fireMul(u) : 1;
        // lửa urani nghèo (f.du) quá nóng: bình chữa cháy trong khoang không dập nhanh hơn được
        for (let i = d.fires.length - 1; i >= 0; i--) { const f = d.fires[i]; f.t += dt * (f.du ? 1 : fk); if (f.t > f.life) d.fires.splice(i, 1); }
        douseFires(u, d, dt, fx);
        // Tiếng lửa đang cháy trên xe (động cơ, khoang): nguồn âm liên tục, báo "còn cháy" 2 lần/giây,
        // to theo đám cháy lớn nhất; hết lửa thì tự tắt dần
        if (d.fires.length) {
          d.fireSndT = (d.fireSndT || 0) - dt;
          if (d.fireSndT <= 0) {
            d.fireSndT = 0.5;
            const f = d.fires.reduce((a, b) => (b.k > a.k ? b : a));
            const fp = u.group.localToWorld(new THREE.Vector3(f.x, f.y, f.z));
            const k = Math.min(1.3, 0.45 + 0.4 * f.k);
            if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.fireSource) window.soundEngine.fireSource(u, fp, k);
            else sfx('vehFire', fp, k);
          }
        }
        if (changed) recompute(u);
      }
    }
  }

  // THAY LỐP DỰ PHÒNG: xe bánh lốp còn lốp dự phòng ('spare') có bánh xịt / nát / văng -> dừng xe (không bắn) đủ lâu thì kíp
  // xe thay lốp: thanh sửa chữa đầy dần (d.tireFix 0..1, chạy thì dừng lại, không mất tiến độ); xong -> bánh hỏng nặng nhất
  // lành lại, lốp dự phòng biến mất khỏi chỗ gắn trên xe. Lốp dự phòng bị bắn nổ / văng mất thì không thay được nữa
  const TIRE_FIX_S = 10;
  function tireChange(u, d, dt) {
    const ws = u.wheelSet;
    if (!ws || !hasPart(u, 'spare')) { d.tireFix = 0; d.tireFixOn = false; return false; }
    let worst = -1, ws0 = 0;
    for (let i = 0; i < ws.positions.length; i++) {
      const w = d.gone[i] ? 3 : (d.shred && d.shred[i]) ? 2 : d.flat[i] ? 1 : 0;
      if (w > ws0) { ws0 = w; worst = i; }
    }
    if (worst < 0) { d.tireFix = 0; d.tireFixOn = false; return false; }
    const still = Math.abs(u.speed || 0) < 2 && !u.isFiringGatling && !(u.reloadTimer > (u.reloadDuration || 0) - 0.3);
    d.tireFixOn = still;
    if (!still) return false;
    d.tireFix = Math.min(1, (d.tireFix || 0) + dt / (TIRE_FIX_S * (typeof GameTiming !== 'undefined' ? GameTiming.timerScale * 2 : 1)));
    if (d.tireFix < 1 || VIS_ONLY) return false;
    d.tireFix = 0; d.tireFixOn = false;
    delete d.flat[worst]; delete d.flatAnim[worst];
    if (d.shred) delete d.shred[worst];
    if (d.gone[worst]) { delete d.gone[worst]; ws.gone[worst] = 0; ws.update(); }
    if (ws.setFlat) ws.setFlat(worst, 0);
    stowTag(u, 'spare');
    const names = ws.positions.length > 4 ? WHEEL_NAMES_6 : WHEEL_NAMES_4;
    if (u.isPlayer && typeof window !== 'undefined' && window.game && window.game.addCombatLog) {
      window.game.addCombatLog(`[[tire]] Đã thay lốp dự phòng vào bánh ${names[worst] || ''} — hết lốp dự phòng`, 'tip');
    }
    return true;
  }

  // Tia dò từ một hướng ngẫu nhiên phía trên / bên sườn vào thân xe (phòng thử)
  function randomSurfaceHit(u) {
    const meshes = deformMeshList(u);
    if (!meshes.length) return null;
    u.group.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), rand(-0.8, -0.15), Math.sin(a)).normalize();
      const target = u.group.localToWorld(new THREE.Vector3(rand(-6, 6), rand(6, 12), rand(-14, 14)));
      rc.set(target.clone().addScaledVector(dir, -80), dir);
      const hits = rc.intersectObjects(meshes, false);
      if (hits.length && hits[0].face) {
        const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);
        return { point: hits[0].point, normal: n, object: hits[0].object, dir };
      }
    }
    return null;
  }

  // Thao tác hư hại có chủ đích theo bộ phận (phòng thử xe): trả danh sách sự kiện
  function debugAction(u, action, fx) {
    if (!u || !u.group) return [];
    markGroups(u);
    const d = state(u);
    const events = [];
    FX = fx;
    u.group.updateMatrixWorld(true);
    const tags = Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {}));
    const pickTag = (re) => {
      const list = tags.filter(t => re.test(t) && !d.lost.has(t));
      return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    };
    const lose = (re) => {
      const t = pickTag(re);
      if (!t) { events.push({ type: 'none', text: 'Không còn bộ phận này để phá' }); return; }
      const wp = partWorld(u, t) || u.group.position.clone();
      const away = wp.clone().sub(u.group.position).setY(0).normalize().multiplyScalar(60).add(new THREE.Vector3(0, 30, 0));
      if (detachTag(u, t, away)) onPartLost(u, t, partKind(t), events, fx, wp);
    };
    const wheelIdx = (filter) => {
      const ws = u.wheelSet;
      if (!ws) return -1;
      const list = ws.positions.map((p, i) => i).filter(filter);
      return list.length ? list[Math.floor(Math.random() * list.length)] : -1;
    };
    switch (action) {
      case 'skirt': lose(/^skirt/); break;
      case 'era': {
        // một viên gạch ngẫu nhiên kích nổ (như bị RPG trúng)
        const list = tags.filter(t => /^era/.test(t)).flatMap(t => segmentsOf(u, t).filter(sg => !sg.gone).map(sg => [t, sg]));
        if (!list.length) { events.push({ type: 'none', text: 'Không còn gạch ERA để kích nổ' }); break; }
        const [t, sg] = list[Math.floor(Math.random() * list.length)];
        breakSeg(u, t, sg, 'era', segWorld(u, sg), events);
        events.push({ type: 'eraStop', text: 'GẠCH GIÁP NỔ ĐÃ PHÁ HỦY ĐẦU ĐẠN — chỉ viên bị trúng nổ, các viên khác còn nguyên' });
        break;
      }
      case 'cage': lose(/^cage/); break;
      case 'applique': {
        // một phát đạn xuyên giáp trúng tấm giáp hàn: thủng, nứt dần (bấm 3 lần mới bung)
        const list = tags.filter(t => /^(applique|cheek)/.test(t)).flatMap(t => segmentsOf(u, t).filter(sg => !sg.gone).map(sg => [t, sg]));
        if (!list.length) { events.push({ type: 'none', text: 'Không còn tấm giáp hàn để bắn' }); break; }
        const [t, sg] = list.find(([tt]) => tt === 'appliqueF') || list[Math.floor(Math.random() * list.length)];
        const wp = segWorld(u, sg), out = segOut(u, sg);
        // vết thủng như phát đạn thật (ExplosionFX.impactSurface): lỗ đỏ rực + hố cày quanh lỗ
        const h = fx && fx.hitUnitSurface ? fx.hitUnitSurface(u, wp.clone().addScaledVector(out, 6), out.clone().negate(), 12) : null;
        if (h && h.object && fx.addSurfaceMark) {
          fx.addSurfaceMark(h.point, h.normal, h.object, 'penetration', 3.0, { unit: u });
          fx.addSurfaceMark(h.point, h.normal, h.object, 'armorCrater', 3.8, { unit: u });
          sparksAt(h.point, 16);
        }
        damageSeg(u, t, sg, PLATE_DMG.kinetic, h ? h.point : wp, events);
        if (!sg.gone) events.push({ type: 'armor', text: `${partName(t)} trúng đạn — thủng lỗ, còn ${Math.round(sg.hp * 100)}% độ bền` });
        break;
      }
      case 'feed': lose(/^feed/); break;
      case 'optic': lose(/^optic/); break;
      case 'sensor': lose(/^(sensor|aaRadar)$/); break;
      case 'atgm': lose(/^atgm$/); break;
      case 'fuel': lose(/^fuelTank$/); break;
      case 'ammo': lose(/^ammoBoxes$/); break;
      case 'acc': lose(/^(mirror|lamp|bin|box|can|cans|rail|railRear|smoke|tool|flap|stowage|shield|travelLock|spare|generator|tarpRoll|searchlight|meteo|rcws|jammer|agl|rocketPod|sradar|rjam|kamiRack)/); break;
      case 'antenna': breakAntennas(u, null, 0, 0.6, new THREE.Vector3(0, 30, 0)); events.push({ type: 'acc', text: 'Gãy văng cần ăng-ten' }); break;
      case 'track': {
        const side = Math.random() < 0.5 ? 0 : 1;
        const p = (u.chassisGroup || u.group).localToWorld(new THREE.Vector3(side ? 12 : -12, 4, rand(-15, 15)));
        breakTrack(u, side, events, fx, p);
        break;
      }
      case 'tire': { const i = wheelIdx(i => !d.flat[i]); if (i >= 0) flatTire(u, i, events, fx); break; }
      case 'wheel': { const i = wheelIdx(i => !d.gone[i]); if (i >= 0) blowWheel(u, i, events, fx); break; }
      case 'glass':
        if (!d.glassShattered) { crackAllGlass(u, 1); events.push({ type: 'glass', text: 'Kính cabin vỡ rạn (bấm lần nữa: kính rơi hẳn)' }); }
        else if (breakOutGlass(u, fx)) events.push({ type: 'glass', text: 'KÍNH CABIN VỠ RƠI HẲN — lộ khoang lái & kíp lái' });
        break;
      case 'gun': {
        // bấm: nòng cong ở một chỗ ngẫu nhiên dọc nòng, đạn đập từ một phía ngẫu nhiên; cong quá giới hạn thì thủng nòng
        const bg = u.barrelGroup || u.gatlingCluster;
        if (!bg) break;
        bg.updateMatrixWorld(true);
        const pt = bg.localToWorld(new THREE.Vector3(0, 0, -tubeLen(u) * rand(0.3, 0.9)));
        const a = rand(0, Math.PI * 2), dw = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6, 0).transformDirection(bg.matrixWorld);
        if (!bendGun(u, events, 'blast', pt, dw)) destroyGun(u, events);
        break;
      }
      case 'ring': damageRing(u, events); break;
      case 'engine': {
        damageEngine(u, events, true);
        const e = ENGINE[u.tankType] || ENGINE.ALL_ROUNDER;
        addFire(u, u.group.localToWorld(new THREE.Vector3(e[0], e[1], e[2])), 1.2, 60);
        break;
      }
      case 'hyd': if (!d.hydraulics) { d.hydraulics = true; events.push({ type: 'hyd', text: 'HỆ THỦY LỰC CÀNG CHỐNG HỎNG — hạ / thu càng chậm' }); } break;
      case 'frame': d.frame = Math.max(-1, Math.min(1, d.frame + (Math.random() < 0.5 ? -1 : 1) * 0.8)); events.push({ type: 'frame', text: 'KHUNG GẦM BỊ VẶN MÉO — xe vẹo, khó lái' }); break;
      case 'dent': {
        // Một phát đạn xuyên vào điểm ngẫu nhiên trên vỏ: móp lõm thật
        const h = randomSurfaceHit(u);
        if (h) { crumpleAt(u, h.point, h.dir, 6, 1.4); events.push({ type: 'dent', text: 'Vỏ thép bị đánh móp lõm' }); }
        break;
      }
      case 'wreck': {
        // Bắn liên tục vào xác: mỗi lần như một phát lựu pháo nổ trên vỏ -> lên dần các nấc biến dạng
        if (!u.isDead) { events.push({ type: 'none', text: 'Xe chưa bị phá hủy' }); break; }
        for (let k = 0; k < 3; k++) {
          const h = randomSurfaceHit(u);
          if (!h) break;
          const r = onWreckHit(u, { ammo: 'HE', heavy: true, point: h.point, hit: { point: h.point, normal: h.normal, object: h.object }, dir: h.dir.clone().multiplyScalar(300), fx });
          for (const e of r.events) events.push(e);
        }
        FX = fx;
        break;
      }
    }
    if (action !== 'wreck') recompute(u);   // xác xe: giữ độ sụp do biến dạng (không tính lại theo bánh)
    // Phòng thử không chạy vòng cập nhật xe: áp độ nghiêng thân xe trực tiếp
    applyPose(u);
    FX = null;
    return events;
  }

  // Danh sách hư hại hiện có (hiển thị trên HUD / kiểm định xe)
  function summary(u) {
    const d = u.dmg;
    if (!d) return [];
    const out = [];
    if (d.engine) out.push(d.engine >= 2 ? 'Động cơ hỏng nặng' : 'Động cơ hư');
    for (let s = 0; s < 2; s++) if (d.track[s]) out.push(`Xích ${s ? 'phải' : 'trái'} ${d.trackTimer[s] > 0 ? 'đứt' : 'nối tạm'}`);
      else if (d.trackWear && d.trackWear[s] >= 1) out.push(`Xích ${s ? 'phải' : 'trái'} hư`);
    if (d.shred) { const nS = Object.keys(d.shred).filter(k => !d.gone[k]).length; if (nS) out.push(`${nS} lốp nát (chạy vành)`); }
    const nFlat = Object.keys(d.flat).length;
    if (nFlat) out.push(`${nFlat} lốp xẹp`);
    if (d.ring) out.push('Kẹt vòng tháp');
    if (d.gunDead) out.push('Vũ khí chính bị phá hủy');
    else {
      if (d.bends && d.bends.length) out.push('Nòng cong — đạn lệch, ngắm bù');
      if (d.gun) out.push('Vũ khí chính hư');
    }
    if (d.hydraulics) out.push('Thủy lực càng hỏng');
    const cnt = new Map();
    for (const t of d.lost) {
      if (partKind(t) === 'acc') continue;
      const n = 'Mất ' + partName(t).toLowerCase();
      cnt.set(n, (cnt.get(n) || 0) + 1);
    }
    for (const [n, c] of cnt) out.push(c > 1 ? `${n} ×${c}` : n);
    return out;
  }

  // ---------------------------------------------------------------------------
  // ĐỒNG BỘ: BẢN TÓM TẮT HƯ HẠI ẢNH HƯỞNG LỐI CHƠI
  // ---------------------------------------------------------------------------
  const r2 = (v) => Math.round((v || 0) * 100) / 100;
  /** Trạng thái hư hại ảnh hưởng lối chơi của xe, gọn để gửi mạng */
  function digest(u) {
    const d = state(u);
    const idx = (o) => Object.keys(o || {}).filter(k => o[k]).map(Number).sort((a, b) => a - b);
    return {
      L: [...d.lost].sort(), F: idx(d.flat), G: idx(d.gone), S: idx(d.shred),
      TB: [d.trackBreaks[0] || 0, d.trackBreaks[1] || 0], TW: [r2(d.trackWear[0]), r2(d.trackWear[1])],
      E: d.engine || 0, R: d.ring ? 1 : 0, N: d.gun ? 1 : 0, NB: (d.bends || []).map(b => [b.s, b.bx, b.by, b.a]), ND: d.gunDead ? 1 : 0, H: d.hydraulics ? 1 : 0, Fr: r2(d.frame),
      FL: ['front', 'rear', 'sideL', 'sideR', 'top'].map(f => r2(d.faceLoss[f] || 1)),
      FT: ['front', 'rear', 'sideL', 'sideR', 'top'].map(f => r2((d.faceLossT && d.faceLossT[f]) || 1)),
      B: u.burnAuth && u.burnTimer > 0 ? Math.round(u.burnTimer * 10) : 0,
      K: d.apsUsed || 0,
      CG: Math.round((d.crewG || 0) * 10), CD: Math.round((d.crewD || 0) * 10),   // kíp xe bị thương: còn bao lâu (x0,1 s)
      // khối đã phá / đã nứt của tấm hàn & gạch ERA: "tag#chỉ số khối" (thứ tự khối giống nhau trên mọi máy)
      SG: segList(u, sg => sg.gone), SK: segList(u, sg => sg.cracked && !sg.gone),
      // gạch ERA rời giá mà không kích nổ (bị đạn bắn rơi 'l' / sức nổ hất bung 'b'), gạch đang xệ trên giá
      SX: segList(u, sg => sg.gone && (sg.how === 'loose' || sg.how === 'blown'), sg => (sg.how === 'loose' ? 'l' : 'b')), SV: segList(u, sg => sg.sag && !sg.gone),
      C: typeof CamoFire !== 'undefined' ? CamoFire.netState(u) : 0   // lưới lá bắt lửa: [hạt giống, ô, gió, lúc]
    };
  }
  function segList(u, pred, suffix) {
    const d = state(u), out = [];
    for (const tag in d.segs || {}) for (const sg of d.segs[tag]) if (pred(sg)) out.push(tag + '#' + sg.i + (suffix ? suffix(sg) : ''));
    return out.sort();
  }
  /**
   * Áp bản tóm tắt nhận từ máy có quyền: chỉ CỘNG DỒN hư hại (không bao giờ "lành lại"), nên nhiều máy bắn cùng lúc
   * vẫn hội tụ về cùng một trạng thái. Hiệu ứng hình ảnh (bộ phận văng, lốp xẹp, xích đứt) chạy lúc áp.
   * own: xe này do máy hiện tại điều khiển. Trả về danh sách sự kiện (thông báo).
   */
  function applyDigest(u, s, fx, own) {
    const events = [];
    if (!u || !u.group || u.isDead || !s) return events;
    markGroups(u);
    const d = state(u);
    FX = fx || null;
    u.group.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 30, 0);
    // gạch ERA rời giá không kích nổ: "tag#i" + 'l' (đạn bắn rơi) / 'b' (sức nổ hất bung)
    const how = {};
    for (const key of s.SX || []) how[key.slice(0, -1)] = key.slice(-1) === 'l' ? 'loose' : 'blown';
    for (const key of s.SK || []) {
      const j = key.lastIndexOf('#'), tag = key.slice(0, j), sg = segmentsOf(u, tag)[+key.slice(j + 1)];
      if (sg && !sg.cracked) crackSeg(u, tag, sg, null, events, true);
    }
    for (const key of s.SV || []) {
      const j = key.lastIndexOf('#'), tag = key.slice(0, j), sg = segmentsOf(u, tag)[+key.slice(j + 1)];
      if (sg && !sg.sag && !sg.gone) sagSeg(u, sg);
    }
    for (const key of s.SG || []) {
      const j = key.lastIndexOf('#'), tag = key.slice(0, j), sg = segmentsOf(u, tag)[+key.slice(j + 1)];
      if (sg && !sg.gone) breakSeg(u, tag, sg, partKind(tag) === 'era' ? (how[key] || 'era') : 'plate', null, events, true);
    }
    for (const tag of s.L || []) {
      if (d.lost.has(tag)) continue;
      // tấm hàn / gạch ERA: từng khối đã áp ở trên (SG); bình nhiên liệu thủng vẫn nằm trên xe
      if (segmented(tag) || partKind(tag) === 'fuel') { d.lost.add(tag); if (partKind(tag) === 'fuel') onPartLost(u, tag, 'fuel', events, fx, partWorld(u, tag), true, own); continue; }
      const wp = partWorld(u, tag);
      if (detachTag(u, tag, up.clone().add(new THREE.Vector3(rand(-20, 20), 0, rand(-20, 20))))) onPartLost(u, tag, partKind(tag), events, fx, wp, true, own);
      else d.lost.add(tag);   // bộ phận không có hình (đã ẩn) vẫn ghi nhận đã mất
    }
    for (const i of s.G || []) if (!d.gone[i]) blowWheel(u, i, events, fx, null);
    for (const i of s.F || []) if (!d.flat[i]) flatTire(u, i, events, fx);
    for (const i of s.S || []) if (!d.shred[i]) { d.shred[i] = true; animUnits.add(u); }
    for (let side = 0; side < 2; side++) {
      const tb = (s.TB || [])[side] || 0;
      if (tb > (d.trackBreaks[side] || 0)) {
        if (d.trackTimer[side] > 0) d.trackBreaks[side] = tb;
        else { d.trackBreaks[side] = tb - 1; breakTrack(u, side, events, fx, null); }
      }
      const tw = (s.TW || [])[side] || 0;
      if (tw > (d.trackWear[side] || 0)) d.trackWear[side] = tw;
    }
    if ((s.CG || 0) / 10 > (d.crewG || 0) + 1) { d.crewG = s.CG / 10; events.push({ type: 'crew', text: 'PHÁO THỦ BỊ THƯƠNG — nạp đạn & bắn chậm' }); }
    if ((s.CD || 0) / 10 > (d.crewD || 0) + 1) { d.crewD = s.CD / 10; events.push({ type: 'crew', text: 'LÁI XE BỊ THƯƠNG — xe khựng lại' }); }
    if ((s.E || 0) > (d.engine || 0)) { const sev = s.E - (d.engine || 0) >= 2; damageEngine(u, events, sev); d.engine = Math.max(d.engine, s.E); }
    if (s.R && !d.ring) damageRing(u, events);
    if (s.N && !d.gun) damageGun(u, events);
    // chỗ cong nòng: áp đúng các chỗ cong máy có quyền đã gieo (vị trí, hướng, góc) -> nòng & đường đạn giống hệt
    const nb = Array.isArray(s.NB) ? s.NB : [];
    for (let i = (d.bends || []).length; i < nb.length; i++) {
      const [bs, bx, by, ba] = nb[i];
      applyBend(u, { s: bs, bx, by, a: ba });
      if (i === nb.length - 1) events.push({ type: 'gun', text: 'NÒNG BỊ ĐẬP CONG — đạn lệch khỏi tâm ngắm, phải ngắm bù' });
    }
    if (s.ND && !d.gunDead) destroyGun(u, events);   // (trước đây không gửi: máy của xe bị bắn không biết pháo đã bị phá)
    if (s.H && !d.hydraulics) { d.hydraulics = true; events.push({ type: 'hyd', text: 'HỆ THỦY LỰC CÀNG CHỐNG HỎNG — hạ / thu càng chậm' }); }
    if (Math.abs(s.Fr || 0) > Math.abs(d.frame || 0)) {
      d.frame = s.Fr;
      if (!d.frameEv) { d.frameEv = true; events.push({ type: 'frame', text: 'KHUNG GẦM BỊ VẶN MÉO — xe vẹo, khó lái, chậm' }); }
    }
    ['front', 'rear', 'sideL', 'sideR', 'top'].forEach((f, k) => { const v = (s.FL || [])[k] || 1; if (v > (d.faceLoss[f] || 1)) d.faceLoss[f] = v; });
    if (!d.faceLossT) d.faceLossT = { front: 1, rear: 1, sideL: 1, sideR: 1, top: 1 };
    ['front', 'rear', 'sideL', 'sideR', 'top'].forEach((f, k) => { const v = (s.FT || [])[k] || 1; if (v > (d.faceLossT[f] || 1)) d.faceLossT[f] = v; });
    if ((s.K || 0) > (d.apsUsed || 0)) d.apsUsed = s.K;
    // xe đang cháy (lửa do máy có quyền tính sát thương): máy này chỉ hiện khói lửa
    if (s.B > 0 && typeof u.igniteVisual === 'function') u.igniteVisual(s.B / 10);
    // lưới lá bắt lửa: mọi máy dựng cùng lịch cháy từ cùng bản ghi
    if (s.C && typeof CamoFire !== 'undefined' && CamoFire.applyNet(u, s.C)) events.push({ type: 'camoFire', text: 'LƯỚI NGỤY TRANG BỐC CHÁY — xe bị lộ' });
    recompute(u);
    FX = null;
    return events;
  }

  // ---------------------------------------------------------------------------
  // GIÁP MUA THÊM HỎNG GIỮ SANG TRẬN SAU (account.js / máy chủ armor_cond): mỗi món giáp chia thành "đơn vị" sửa được —
  // gạch ERA / tấm ghép / tấm khiên chữ V: từng khối (segmentsOf, chỉ số ổn định vì mọi máy dựng cùng hình); tấm lồng
  // thép, bệ APS: cả bộ phận. Khóa đơn vị: 'tag#i' (khối) hoặc 'tag' (cả bộ phận)
  // ---------------------------------------------------------------------------
  const ARMOR_ITEM_TAGS = { era: /^eraKit/, applique: /^appliqueKit/, vshield: /^appliqueVS/, slat: /^cageKit/, aps: /^apsKit$/ };
  function armorTagsOf(u, item) {
    const re = ARMOR_ITEM_TAGS[item];
    if (!re) return [];
    const all = new Set([...Object.keys(u.partRegistry || {}), ...Object.keys(u.partGroups || {})]);
    return [...all].filter(t => re.test(t)).sort();
  }
  /** { món: { total: số đơn vị, gone: [khóa đơn vị đã mất] } } — chỉ món đang có trên xe */
  function armorUnits(u) {
    const out = {};
    if (!u || !u.group) return out;
    const d = state(u);
    for (const item in ARMOR_ITEM_TAGS) {
      const tags = armorTagsOf(u, item);
      if (!tags.length) continue;
      const R = { total: 0, gone: [] };
      for (const tag of tags) {
        if (segmented(tag) && u.partRegistry && u.partRegistry[tag]) {
          const segs = segmentsOf(u, tag);
          R.total += segs.length;
          for (const sg of segs) if (sg.gone) R.gone.push(tag + '#' + sg.i);
        } else {
          R.total += 1;
          if (d.lost.has(tag)) R.gone.push(tag);
        }
      }
      if (R.total) out[item] = R;
    }
    return out;
  }
  // Khối thiếu sẵn khi xuất kích (chưa sửa từ trận trước): gỡ im lặng — không mảnh văng, không tiếng, không thông báo
  function quietBreakSeg(u, tag, sg) {
    if (sg.gone) return;
    const d = state(u), segs = segmentsOf(u, tag);
    sg.gone = true; sg.hp = 0;
    u.group.updateMatrixWorld(true);
    const holder = cutParts(u, sg.parts);
    holder.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    u._partCenters = null;
    fieldChanged(u, true);
    const left = segs.filter(x => !x.gone).length;
    if (!left || (/^appliqueKit/.test(tag) && left <= segs.length / 2)) d.lost.add(tag);
  }
  /** Áp danh sách đơn vị giáp đang thiếu (kit.d: { món: [khóa] }) lên xe vừa dựng / vừa hồi sinh */
  function applyArmorMissing(u, miss) {
    if (!u || !miss || typeof miss !== 'object' || !u.group) return;
    for (const item in miss) {
      if (!ARMOR_ITEM_TAGS[item] || !Array.isArray(miss[item])) continue;
      for (const key of miss[item]) {
        const k = String(key), h = k.indexOf('#'), tag = h < 0 ? k : k.slice(0, h);
        if (!ARMOR_ITEM_TAGS[item].test(tag)) continue;
        if (h >= 0) {
          if (!u.partRegistry || !u.partRegistry[tag]) continue;
          const sg = segmentsOf(u, tag)[+k.slice(h + 1)];
          if (sg) quietBreakSeg(u, tag, sg);
        } else stowTag(u, tag);
      }
    }
  }

  return {
    ARMOR_ITEM_TAGS, armorUnits, applyArmorMissing, tagAtHit,
    ARMOR, ammoClass, extinguisherSound, onDirectHit, vshieldFront, onSplash, onDestroyed, onDetonate, reset, update, recompute, summary, state,
    visualOnly, digest, applyDigest, addFire, logDoused,
    detachTag, stowTag, hasPart, flatTire, blowWheel, breakTrack, bendTag, sfx, debugAction,
    crumpleAt, crushHull, bendBarrel, guardBarrel, segmentsOf, hullTopAt, spawnChunks, hatchHoles, armorOutcome, ARMOR_MM, PEN,
    setGroundProvider(fn) { groundProvider = fn; },
    get debrisCount() { return debrisList.length; }
  };
})();

if (typeof window !== 'undefined') window.VehicleDamage = VehicleDamage;
