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
  function ammoClass(ammo) {
    if (ammo === 'SCOUT_BULLET') return 'small';
    if (ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY') return 'cannon';
    if (ammo === 'AP') return 'kinetic';
    if (ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE') return 'heat';
    return 'blast';
  }

  // Hệ số sát thương: nhóm đạn x cấp giáp (đạn súng máy gần như vô hại với xe tăng chủ lực)
  const VS = {
    small: { heavy: 0.15, medium: 0.35, light: 1.0, soft: 1.15 },
    cannon: { heavy: 0.2, medium: 0.6, light: 1.15, soft: 1.25 },   // 30mm gần như không xuyên giáp chính diện xe tăng
    kinetic: { heavy: 1.0, medium: 1.05, light: 1.0, soft: 1.0 },
    heat: { heavy: 1.0, medium: 1.0, light: 1.05, soft: 1.1 },
    blast: { heavy: 0.3, medium: 0.5, light: 1.1, soft: 1.25 }   // sức ép / mảnh nổ gần: giáp dày gần như miễn nhiễm
  };

  // Phân loại bộ phận theo tên tag (đặt trong file model)
  function partKind(tag) {
    if (/^camoKit/.test(tag)) return 'camo';   // lưới lá ngụy trang: khó bị hất văng cả mảng
    if (/^(skirt|cheek|applique|cage)/.test(tag)) return 'armor';
    if (/^era/.test(tag)) return 'era';
    if (/^optic/.test(tag)) return 'optic';
    if (/^feed/.test(tag)) return 'feed';
    if (tag === 'sensor') return 'sensor';
    if (tag === 'atgm') return 'atgm';
    if (tag === 'fuelTank') return 'fuel';
    if (tag === 'ammoBoxes') return 'ammo';
    if (tag === 'dozer' || tag === 'spareTrack' || tag === 'rcws') return 'heavyAcc';
    return 'acc';
  }

  // Xác suất văng khi trúng TRỰC TIẾP vào bộ phận
  const DETACH_DIRECT = {
    acc: { small: 0.35, cannon: 0.75, kinetic: 1, heat: 1, blast: 1 },
    armor: { small: 0, cannon: 0.12, kinetic: 0.5, heat: 0.85, blast: 0.6 },
    era: { small: 0, cannon: 0.15, kinetic: 1, heat: 1, blast: 0.7 },
    heavyAcc: { small: 0, cannon: 0.05, kinetic: 0.35, heat: 0.5, blast: 0.4 },
    optic: { small: 0.25, cannon: 0.6, kinetic: 0.9, heat: 0.9, blast: 0.9 },
    feed: { small: 0.05, cannon: 0.35, kinetic: 0.9, heat: 0.9, blast: 0.8 },
    sensor: { small: 0.3, cannon: 0.7, kinetic: 0.9, heat: 0.9, blast: 0.9 },
    atgm: { small: 0.08, cannon: 0.4, kinetic: 0.9, heat: 0.9, blast: 0.8 },
    fuel: { small: 0.15, cannon: 0.45, kinetic: 1, heat: 1, blast: 1 },
    ammo: { small: 0.05, cannon: 0.35, kinetic: 1, heat: 1, blast: 1 },
    camo: { small: 0, cannon: 0.03, kinetic: 0.05, heat: 0.08, blast: 0.15 }
  };
  // Hệ số văng do sóng nổ gần (nhân với độ gần tâm nổ)
  const DETACH_BLAST = { acc: 1, armor: 0.5, era: 0.55, heavyAcc: 0.3, optic: 0.75, feed: 0.4, sensor: 0.8, atgm: 0.5, fuel: 0.35, ammo: 0.35, camo: 0.12 };

  const PART_NAME = {
    skirt: 'VÁY XÍCH', cheek: 'MODULE GIÁP MÁ THÁP', applique: 'GIÁP TĂNG CƯỜNG MŨI', appliqueF: 'TẤM GIÁP TĂNG CƯỜNG MŨI', cageRear: 'LỒNG CHỐNG RPG ĐUÔI XE',
    cageTurret: 'LỒNG CHỐNG RPG ĐUÔI THÁP', era: 'GẠCH GIÁP PHẢN ỨNG NỔ', opticGunner: 'KÍNH NGẮM PHÁO THỦ', opticCdr: 'KÍNH TOÀN CẢNH CHỈ HUY',
    feed: 'MÁNG TIẾP ĐẠN', sensor: 'RADAR TRINH SÁT', atgm: 'ỐNG PHÓNG TÊN LỬA', fuelTank: 'BÌNH NHIÊN LIỆU', ammoBoxes: 'THÙNG ĐẠN TRÊN SÀN',
    dozer: 'LƯỠI ỦI', spareTrack: 'MẮT XÍCH DỰ PHÒNG', rcws: 'TRẠM SÚNG MÁY ĐIỀU KHIỂN TỪ XA', mirror: 'GƯƠNG CHIẾU HẬU', lamp: 'CỤM ĐÈN PHA',
    smoke: 'ỐNG PHÓNG LỰU ĐẠN KHÓI', bin: 'THÙNG ĐỒ', box: 'HỘP DỤNG CỤ', can: 'CAN NHIÊN LIỆU', cans: 'CAN NHIÊN LIỆU', rail: 'LAN CAN NÓC',
    railRear: 'LAN CAN NÓC', stowage: 'GIỎ ĐỒ ĐUÔI THÁP', tool: 'DỤNG CỤ DÃ CHIẾN', flap: 'TẤM CHẮN BÙN', shield: 'TẤM CHẮN SÚNG MÁY',
    travelLock: 'GIÁ KHÓA NÒNG', spare: 'BÁNH DỰ PHÒNG', generator: 'MÁY PHÁT ĐIỆN', searchlight: 'ĐÈN CHIẾU', meteo: 'CỘT KHÍ TƯỢNG',
    camoKit: 'LƯỚI NGỤY TRANG', camoKitT: 'LƯỚI NGỤY TRANG THÁP', camoKitB: 'LÁ NGỤY TRANG TRÊN NÒNG', camoKitP: 'LÁ NGỤY TRANG HỘP PHÁO'
  };
  function partName(tag) {
    if (PART_NAME[tag]) return PART_NAME[tag];
    const base = tag.replace(/[LR]?\d*$/, '').replace(/[LR]$/, '');
    let n = PART_NAME[base] || tag.toUpperCase();
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
    if (d.engine === 1) { speed *= 0.72; accel *= 0.6; } else if (d.engine >= 2) { speed *= 0.45; accel *= 0.35; }
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
    whip: { e: 0.3, mu: 0.5, air: 0.35 }       // roi ăng-ten mảnh
  };
  function debrisMatOf(tag) {
    if (/^(stowage|camoKit)/.test(tag)) return 'net';
    if (/^(lamp|mirror|searchlight)/.test(tag)) return 'glass';
    const k = partKind(tag);
    if (k === 'armor' || k === 'era' || k === 'heavyAcc') return 'plate';
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
    const top0 = hullTopAt(u, p0.x, p0.z, true);
    const D = {
      u, obj, r, dims, corners, mass, mat, round: !!opt.round, invI, comL, cr, reach: Math.max(reach, 0.3), x,
      under: top0 > -Infinity && p0.y < top0,
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
      const c = partCenter(u, tag);
      const holder = new THREE.Group();
      // Đặt holder đúng tư thế thế giới của mesh gốc tại tâm bộ phận
      c.mesh.matrixWorld.decompose(_p, _q, _s);
      holder.position.copy(c.mesh.localToWorld(c.local.clone()));
      holder.quaternion.copy(_q);
      holder.scale.copy(_s);
      for (const e of entries) {
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
        g.translate(-c.local.x, -c.local.y, -c.local.z);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, e.mesh.material);
        m.castShadow = true;
        m.userData.ownGeo = true;
        holder.add(m);
        // Xóa khỏi mesh gốc: thu các đỉnh về một điểm (tam giác suy biến), lưu lại để hồi sinh
        const pos = src.attributes.position;
        const box = new THREE.Box3();
        for (const [st, n] of e.ranges) {
          d.saved.push({ attr: pos, start: st, data: pos.array.slice(st * 3, (st + n) * 3) });
          for (let i = st; i < st + n; i++) { box.expandByPoint(_rg.fromBufferAttribute(pos, i)); pos.setXYZ(i, c.local.x, c.local.y, c.local.z); }
        }
        pos.needsUpdate = true;
        // Vết đạn / vết cháy đang dán trên bộ phận vừa văng: không còn mặt thép bên dưới -> gỡ (thay vì lơ lửng tại chỗ cũ)
        box.expandByScalar(0.5);
        refitDecals(u, e.mesh, (p, out) => box.containsPoint(p) && !!out.copy(p));
      }
      holder.userData.radius = Math.max(0.6, c.size * 0.35);
      spawnDebris(u, holder, impulse, { mat: debrisMatOf(tag) });
    } else if (grp) {
      grp.updateMatrixWorld(true);
      const copy = grp.clone(true);
      grp.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      copy.userData.radius = 1.6;
      grp.visible = false;
      d.hiddenGroups.push(grp);
      spawnDebris(u, copy, impulse, { mat: debrisMatOf(tag) });
    }
    return true;
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

  // Đám cháy bám theo xe tại điểm trúng (hệ tọa độ group của xe): lỗ xuyên giáp, bình xăng, kho đạn
  function addFire(u, worldPt, strength, life) {
    const d = state(u);
    if (d.fires.length >= 4) d.fires.shift();
    const l = u.group.worldToLocal(worldPt.clone());
    d.fires.push({ x: l.x, y: l.y, z: l.z, k: strength || 1, life: life || 20, t: 0 });
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
  }

  // Mặt đỡ tại (x, z): mặt đất, hoặc nóc thân xác xe nếu điểm nằm trong hình chiếu thân (xe còn sống thì bỏ qua:
  // xe chạy đi để lại mảnh lơ lửng)
  const _fl = new THREE.Vector3(), _flM = new THREE.Matrix4();
  function hullTopAt(u, x, z, anyState) {
    if (!u || (!u.isDead && !anyState) || !u.hullMainMesh || !u.chassisGroup) return -Infinity;
    const d = state(u), cg = u.chassisGroup;
    if (!d.hullBoxC) {
      cg.updateMatrixWorld(true);
      const g = u.hullMainMesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      d.hullBoxC = g.boundingBox.clone().applyMatrix4(_flM.copy(cg.matrixWorld).invert().multiply(u.hullMainMesh.matrixWorld));
    }
    const B = d.hullBoxC;
    _fl.set(x, cg.matrixWorld.elements[13], z).applyMatrix4(_flM.copy(cg.matrixWorld).invert());
    if (_fl.x < B.min.x || _fl.x > B.max.x || _fl.z < B.min.z || _fl.z > B.max.z) return -Infinity;
    _fl.y = B.max.y;
    return _fl.applyMatrix4(cg.matrixWorld).y;
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
    if (hullTopAt(D.u, pos.x, pos.z) > -Infinity || !groundProvider) return new THREE.Vector3(0, 1, 0);
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
    if (D.under) {
      // ra khỏi hình chiếu thân, hoặc bay cao hơn nóc -> từ đây mới được tì lên nóc xác xe
      const ht = hullTopAt(D.u, D.x.x, D.x.z, true);
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
      const fy = D.under ? gy : Math.max(gy, hullTopAt(D.u, px, pz));
      const pen = fy - py;
      if (pen <= 0) continue;
      if (!hit) {
        // pháp tuyến mặt đỡ (dốc địa hình / nóc xác xe phẳng)
        if (fy > gy + 0.01 || !groundProvider) { _n.set(0, 1, 0); onHull = true; }
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
      if (D.calm > 0.25) { D.rest = true; continue; }
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
    events.push({ type: 'engine', text: d.engine >= 2 ? 'ĐỘNG CƠ HỎNG NẶNG — bốc khói đen, xe bò chậm' : 'ĐỘNG CƠ TRÚNG ĐẠN — mất công suất, tăng tốc kém' });
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

  function damageGun(u, events) {
    if (VIS_ONLY) return false;
    const d = state(u);
    if (d.gun) return false;
    d.gun = true;
    const bg = u.barrelGroup || u.gatlingCluster;
    if (bg && !d.gunBent) {
      d.gunBent = { obj: bg, rot: bg.rotation.clone() };
      bg.rotation.x += rand(0.025, 0.06) * (Math.random() < 0.7 ? 1 : -1);
      bg.rotation.y += rand(-0.04, 0.04);
      const wp = bg.getWorldPosition(new THREE.Vector3());
      sparksAt(wp, 14); sfx('armorPlate', wp, 0.8);
    }
    const t = u.tankType === 'GATLING' ? 'CỤM 6 NÒNG HƯ HẠI — mô-tơ quay nòng khởi động chậm'
      : u.tankType === 'SCOUT' ? 'SÚNG MÁY HƯ HẠI — tốc độ bắn giảm'
        : u.tankType === 'ARTILLERY' ? 'BỘ HÃM LÙI LỰU PHÁO HƯ — nạp đạn chậm' : 'PHÁO CHÍNH HƯ HẠI — nạp đạn chậm';
    events.push({ type: 'gun', text: t });
    return true;
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
      events.push({ type: 'sensor', text: `${name} BỊ PHÁ — mất radar: hết phát hiện xe núp bụi & hết báo vị trí cho đồng đội` });
    } else if (kind === 'atgm') {
      events.push({ type: 'atgm', text: `${name} BỊ PHÁ — mất tên lửa chống tăng` });
    } else if (kind === 'heavyAcc') {
      events.push({ type: 'acc', text: `VĂNG ${name}` });
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
    // này) — kể cả khi trúng mặt vát hình nêm của tháp hay góc mũi, vốn có pháp tuyến chĩa sang ngang
    if (dir) {
      const dl = dir.clone().normalize().applyQuaternion(q), hz = Math.hypot(dl.x, dl.z);
      if (hz > 0.2 && Math.abs(dl.z) > 0.866 * hz) { hit.sloped = true; return dl.z > 0 ? 'front' : 'rear'; }
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
  function plateBehindCage(u, hit, dir) {
    if (!_rcCage || !hit || !hit.point) return null;
    const d = dir.clone().normalize();
    _rcCage.set(hit.point.clone().addScaledVector(d, -0.5), d);
    _rcCage.far = 40;
    const meshes = [];
    u.group.traverse(o => { if (o.isMesh && o.visible && !(o.userData && o.userData.isFxDecal)) meshes.push(o); });
    for (const h of _rcCage.intersectObjects(meshes, false)) {
      if (!h.face || /^cage/.test(tagAtHit(h) || '')) continue;
      return { point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld), object: h.object, faceIndex: h.faceIndex };
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
  function wrinkle(x, y, z, f) {
    return Math.sin(x * f + 1.7) * Math.sin(z * f * 1.3 - 0.4) * 0.6 + (hash3(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2)) - 0.5) * 0.8;
  }

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
    const ranges = mesh.userData.partRanges;
    if (ranges) {
      for (const tag in ranges) {
        const arr = ranges[tag];
        const mapped = arr.map(([st, n]) => { const s0 = newStart[Math.floor(st / 3)] * 3, s1 = newStart[Math.min(triCount, Math.floor((st + n) / 3))] * 3; return [s0, s1 - s0]; });
        arr.length = 0;
        for (const r of mapped) arr.push(r);   // sửa tại chỗ: partRegistry dùng chung mảng này
      }
    }
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
    mesh.geometry = g;
    PREPPED.set(mesh, u);
    d.geoSwaps.push(saved);
    return g;
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
          // Tam giác bị biến dạng: pháp tuyến phẳng theo mặt mới (tôn thép nhăn gãy góc)
          for (let t = 0; t + 2 < n; t += 3) {
            if (!moved[t] && !moved[t + 1] && !moved[t + 2]) continue;
            _ea.fromBufferAttribute(pos, t); _eb.fromBufferAttribute(pos, t + 1); _ec.fromBufferAttribute(pos, t + 2);
            _dn.subVectors(_ec, _eb).cross(_ea.clone().sub(_eb));
            if (_dn.lengthSq() < 1e-10) continue;
            _dn.normalize();
            for (let k = 0; k < 3; k++) nor.setXYZ(t + k, _dn.x, _dn.y, _dn.z);
          }
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
    if (any) u._partCenters = null;
    return any;
  }

  // Hố móp sâu tại điểm trúng: tấm thép bị đẩy lõm vào trong theo hướng đạn, có nếp nhăn
  function crumpleAt(u, worldPoint, worldDir, R, depth) {
    if (!u || !u.group || !worldPoint || depth <= 0.01) return false;
    const d = state(u);
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
    const cap = u.isDead ? 7 : 3;
    const room = Math.max(0, cap - (d.crushAcc[key] || 0));
    const dep = Math.min(depth, room);
    if (dep <= 0.02) return false;
    d.crushAcc[key] = (d.crushAcc[key] || 0) + dep;
    const R2 = R * R;
    const ok = deformField(u, deformMeshList(u), space, (p, out) => {
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
    let meshes = deformMeshList(u);
    // Tháp đã bị hất văng khỏi xe: không thuộc khung thân nữa
    if (u.fxWreck && u.fxWreck.turret && u.turretGroup) meshes = meshes.filter(m => !isOnTurret(u, m));
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
      d.crushSeed = { twist: Math.random() < 0.5 ? -1 : 1, lean: Math.random() < 0.5 ? -1 : 1, zc: rand(-0.35, 0.35) };
    }
    const B = d.hullBox, S = d.crushSeed;
    const hx = Math.max(4, (B.x1 - B.x0) / 2), hz = Math.max(6, (B.z1 - B.z0) / 2), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2 + S.zc * hz * 0.5;
    const yF = B.y0, hY = Math.max(4, B.y1 - B.y0);
    const o = Object.assign({ roof: 1, sag: 1, sides: 1, twist: 1, bulge: 0 }, opts || {});
    return deformField(u, meshes, u.group, (p, out) => {
      const ny = Math.min(1.6, Math.max(0, (p.y - yF) / hY));   // 0 sàn -> 1 nóc
      const nz = Math.max(-1.3, Math.min(1.3, (p.z - cz) / hz)), nx = Math.max(-1.3, Math.min(1.3, (p.x - cx) / hx));
      const midZ = Math.max(0, 1 - nz * nz);                 // giữa thân võng nhiều nhất
      const midX = Math.max(0, 1 - nx * nx * 0.7);
      const wr = wrinkle(p.x, p.y, p.z, 0.9);
      out.set(0, 0, 0);
      // 1. Nóc bị ép bẹp xuống (tháp / nóc khoang lún sâu, tấm nóc nhăn nhúm)
      if (o.roof) out.y -= amt * o.roof * hY * 0.32 * Math.pow(ny, 1.5) * (0.55 + 0.45 * midX) * (0.8 + 0.25 * wr);
      // 2. Lưng khung gãy võng ở giữa (cả xe sụp xuống ở đoạn giữa)
      if (o.sag) out.y -= amt * o.sag * hY * 0.18 * midZ * (0.4 + 0.6 * Math.min(1, ny + 0.3));
      // 3. Hai sườn oằn vào trong ở phần trên, phình ra ở chân (tấm sườn gập)
      if (o.sides) {
        const sx = Math.sign(p.x - cx) || 1;
        const band = Math.sin(Math.min(1, ny) * Math.PI);
        out.x += -sx * amt * o.sides * hx * 0.16 * band * (0.6 + 0.4 * midZ) * (1 + 0.4 * wr);
        out.x += sx * amt * o.sides * hx * 0.05 * Math.max(0, 0.35 - ny) * 3;
      }
      // 4. Khung xoắn vặn theo chiều dọc (mũi lệch một bên, đuôi lệch bên kia)
      if (o.twist) {
        const ang = amt * o.twist * 0.09 * S.twist * nz;
        const ry = p.y - yF;
        out.x += (p.x - cx) * (Math.cos(ang) - 1) - ry * Math.sin(ang);
        out.y += (p.x - cx) * Math.sin(ang) + ry * (Math.cos(ang) - 1);
        out.x += amt * o.twist * 0.6 * S.lean * ny;   // cả khối trên đổ nghiêng
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

  // Nòng pháo bị cong gục: uốn hình học dọc theo chiều dài nòng (không chỉ xoay chốt)
  function bendBarrel(u, amt) {
    const bg = u.barrelGroup || u.gatlingCluster;
    if (!bg || amt <= 0) return false;
    const d = state(u);
    const meshes = [];
    bg.traverse(o => { if (deformableMesh(u, o)) meshes.push(o); });
    if (!meshes.length) return false;
    if (!d.barrelLen) {
      let zMin = 0;
      bg.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(bg.matrixWorld).invert();
      for (const m of meshes) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); zMin = Math.min(zMin, b.min.z); }
      d.barrelLen = Math.max(4, -zMin);
      d.barrelBendDir = new THREE.Vector3(rand(-0.45, 0.45), -1, 0).normalize();
    }
    const L = d.barrelLen, s0 = Math.min(5, L * 0.2), bd = d.barrelBendDir;
    const c = amt * L * 0.22 / ((L - s0) * (L - s0));
    return deformField(u, meshes, bg, (p, out) => {
      const s = -p.z - s0;
      if (s <= 0) return false;
      out.copy(bd).multiplyScalar(c * s * s);
      out.z += c * s * s * 0.25;   // nòng cong thì đầu nòng co ngắn lại
      return true;
    });
  }

  // Các nấc biến dạng của xác xe theo lượng đạn đã hứng
  const WRECK_STAGES = [
    { at: 2.5, text: 'XÁC XE HƯ HẠI NẶNG — vỏ móp lõm nhiều chỗ, nòng pháo bị cong gục, khung bắt đầu võng' },
    { at: 6, text: 'XÁC XE BIẾN DẠNG CỰC NẶNG — nóc bị ép bẹp, sườn oằn, khung xoắn vặn, tháp lệch khỏi vòng bi' },
    { at: 12, text: 'XÁC XE BẸP DÚM — thân xe nát vụn, gần như dẹp lép xuống đất' }
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
          if (r < 2) continue;
          const c = _gv.y - fl;
          if (c < margin) need = Math.max(need, (margin - c) / r);
          lim = Math.min(lim, (c - margin) / r);
        }
      }
      if (need <= 1e-4) { settled = true; break; }
      bp.rotation.x += need * 1.05;   // góc dương = ngóc lên
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
    const onHull = barrelOnHull(u);
    let lostWheel = false;
    if (stage === 1) {
      crushHull(u, 0.35, { roof: 0.6, sag: 1, sides: 0.6, twist: 0.5 });
      if (onHull) bendBarrel(u, 0.5);
    } else if (stage === 2) {
      crushHull(u, 0.65, { roof: 1, sag: 1, sides: 1, twist: 1 });
      if (onHull) bendBarrel(u, 0.7);
    } else if (stage === 3) {
      crushHull(u, 0.9, { roof: 1.3, sag: 1.2, sides: 1.2, twist: 0.8 });
      if (onHull) bendBarrel(u, 0.6);
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
    if (opts.hit && opts.hit.object && hitN) dentAt(u, opts.hit.object, point, hitN, 2.6 + pw * 6, Math.min(1.6, 0.05 + pw * 0.9), pw >= 0.5, opts.hit);
    const tear = pw >= 0.2 || d.wreckSpots[key] > 1.2;
    // Vỏ thép xác xe bị đẩy lõm thật (biến dạng lưới): đạn lớn móp sâu, đạn nhỏ dồn đủ một chỗ mới oằn
    {
      const inDir = opts.dir && opts.dir.lengthSq() > 1 ? opts.dir.clone() : (hitN ? hitN.clone().negate() : point.clone().sub(u.group.position).setY(0).negate());
      if (opts.splash && !opts.dir) inDir.copy(u.group.position).add(new THREE.Vector3(0, 8, 0)).sub(point);
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
    const tags = Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {})).filter(t => !d.lost.has(t));
    const R = 7 + pw * 14;
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
            dentAt(u, h.object, h.point, h.normal, rand(5, 8), rand(1.2, 2.2), true, h);
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
    ALL_ROUNDER: { turretFront: [600, 900], hullFront: [500, 780], side: [90, 140], turretSide: [120, 180], rear: [45, 45], top: [40, 40] },
    GATLING: { turretFront: [180, 230], hullFront: [200, 260], side: [45, 60], turretSide: [45, 60], rear: [30, 30], top: [25, 25] },
    SCOUT: { turretFront: [12, 12], hullFront: [22, 22], side: [14, 14], turretSide: [10, 10], rear: [11, 11], top: [8, 8] },
    ARTILLERY: { turretFront: [16, 16], hullFront: [12, 12], side: [8, 8], turretSide: [10, 10], rear: [8, 8], top: [6, 6] }
  };
  // Độ xuyên ở cự ly 0 (mm), mất xuyên theo cự ly (tỉ lệ / 1000 đơn vị bay) và kiểu tác động
  const PEN = {
    AP: { mm: 650, loss: 0.06, kind: 'KE', big: true },            // đạn mũi tên APFSDS 120mm
    // đạn nổ phá tiêu chuẩn 120mm. Cân bằng game: xé giáp sườn / đuôi xe tăng (~3 phát hạ); giáp trước chặn được nhưng
    // vẫn chịu chấn động / mảnh vỡ trong (NONPEN_FLOOR, ~5 phát hạ)
    NORMAL: { mm: 240, loss: 0, kind: 'HE', big: true, postK: { heavy: 0.85 } },
    HE: { mm: 45, loss: 0, kind: 'HE', big: true },                // nổ phá: xé giáp mỏng, gần như vô hại với giáp dày
    CLUSTER: { mm: 90, loss: 0, kind: 'CE', big: true },
    CLUSTER_SUBMUNITION: { mm: 90, loss: 0, kind: 'CE', big: false },  // bom con nổ lõm: đánh nóc xe
    RPG: { mm: 600, loss: 0, kind: 'CE', big: true },
    // đầu nổ kép xuyên cả gạch ERA. Cân bằng game: xe tăng chủ lực chịu ~3 phát (postK), xe khác giữ nguyên
    ANTI_TANK_MISSILE: { mm: 1300, loss: 0, kind: 'CE', big: true, tandem: true, postK: { heavy: 0.5 } },   // cỡ Kornet-EM
    GATLING_BULLET: { mm: 110, loss: 0.35, kind: 'KE', big: false }, // 30mm xuyên dưới cỡ / nổ-cháy: thủng sườn tăng ở cự ly gần
    INCENDIARY: { mm: 40, loss: 0.35, kind: 'KE', big: false },
    SCOUT_BULLET: { mm: 28, loss: 0.5, kind: 'KE', big: false }     // 12.7mm xuyên giáp
  };
  const PEN_HEAVY = { HE: { mm: 70, loss: 0, kind: 'HE', big: true }, AP: { mm: 300, loss: 0.03, kind: 'KE', big: true }, NORMAL: { mm: 70, loss: 0, kind: 'HE', big: true } };
  // Đạn cao cấp "nổ lõm 2 tầng" (Equipment.PREMIUM.heat_tandem) thay đạn thường bằng đạn nổ lõm thật của pháo tăng
  const PEN_HEAT_TANDEM = { mm: 480, loss: 0, kind: 'CE', big: true, tandem: true };
  // Hiệu quả sau khi xuyên theo cỡ đạn & cỡ xe: mảnh đạn nhỏ trong khoang rộng xe tăng gây ít thiệt hại hơn
  const POSTPEN = { small: { heavy: 0.35, medium: 0.6, light: 1.0, soft: 1.1 }, big: { heavy: 1.0, medium: 1.0, light: 1.2, soft: 1.25 } };
  // Đạn cỡ lớn (pháo tăng, tên lửa, lựu pháo) không xuyên vẫn gây thiệt hại thật: sóng chấn động làm kíp xe choáng / bị
  // thương, mảnh vỡ mặt trong giáp, phá thiết bị ngoài (kính ngắm, thùng đồ, đèn), dồn chấn động vào hệ thống bên trong.
  // Hệ số tối thiểu nhân thêm theo mặt giáp (ARMOR.face: trước 0.7 · sườn 1 · đuôi 1.35 · nóc 1.25).
  // Xe tăng chủ lực trúng đạn thường vào mũi: ~5 phát hạ (trước đây ~17 phát, đạn HE ~36 phát)
  const NONPEN_FLOOR = { HE: { heavy: 0.75, medium: 0.8, light: 0.9, soft: 0.95 }, KE: 0.22, CE: 0.3 };
  // Đạn cỡ lớn trượt nảy trên giáp nghiêng: va đập hàng chục kg thép vẫn làm rung chấn, bẻ gãy thiết bị ngoài
  const RICOCHET_BIG = 0.15;

  /**
   * Kết quả 1 phát trúng: { mul, ratio, pen, zone }
   * mul nhân vào sát thương gốc (sát thương khi xuyên thủng). ratio = độ xuyên / giáp hiệu dụng.
   */
  function armorOutcome(u, opts, ctx) {
    const A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    const T = ARMOR_MM[u.tankType] || ARMOR_MM.ALL_ROUNDER;
    const EQ = typeof Equipment !== 'undefined' && Equipment.armorMul ? Equipment : null;
    const heatTandem = !opts.heavy && opts.ammo === 'NORMAL' && EQ && EQ.isTandem(opts.shooter, 'NORMAL');
    const P = heatTandem ? PEN_HEAT_TANDEM : (opts.heavy && PEN_HEAVY[opts.ammo]) || PEN[opts.ammo] || PEN.NORMAL;
    const { face, onTurret, hit, dir, d } = ctx;
    // Mặt giáp
    const key = face === 'top' ? 'top' : face === 'rear' ? 'rear' : face === 'front' ? (onTurret ? 'turretFront' : 'hullFront') : (onTurret ? 'turretSide' : 'side');
    const base = T[key] || T.side;
    let armor = P.kind === 'KE' ? base[0] : base[1];
    // Góc chạm: giáp nghiêng dày thêm 1/cos (tối đa x3.5)
    let cosI = 0.85;
    if (hit && hit.faceCos !== undefined) cosI = hit.faceCos;
    else if (hit && hit.normal && dir) cosI = Math.abs(hit.normal.clone().normalize().dot(dir));
    if (hit && hit.sloped) cosI = Math.max(cosI, 0.75);
    armor /= Math.max(0.285, cosI);
    // Mặt giáp đã mất tấm giáp / váy xích: mỏng đi
    armor /= ((onTurret && d.faceLossT ? d.faceLossT : d.faceLoss)[face] || 1);
    // Trang bị mua thêm: tấm giáp tăng cường còn trên mặt này (gạch giáp nổ tính riêng ở onDirectHit — Equipment.eraEffect)
    if (EQ) armor *= EQ.armorMul(u, face, onTurret);
    // Đạn xả liên tục vào một chỗ làm giáp mỏi / rạn (giảm tối đa 45%)
    if (ctx.fatigue) armor *= 1 - 0.45 * Math.min(1, ctx.fatigue);
    // Độ xuyên giảm theo cự ly bay (đạn động năng)
    let pen = P.mm * (EQ ? EQ.penMul(opts.shooter, opts.ammo) : 1);
    if (P.loss && ctx.range) pen *= Math.max(0.2, 1 - P.loss * ctx.range / 1000);
    const ratio = pen / Math.max(1, armor);
    const sizeK = POSTPEN[P.big ? 'big' : 'small'][A.cls] || 1;
    let mul, penetrated = false;
    const faceK = Math.min(1.3, A.face[face] || 1);
    const floor = !P.big ? 0 : P.kind === 'HE' ? Math.min(0.9, (NONPEN_FLOOR.HE[A.cls] || 0.8) * faceK) : NONPEN_FLOOR[P.kind] * faceK;
    if (hit && hit.ricochet) {
      mul = P.big ? RICOCHET_BIG : 0.02;                            // đạn sượt nảy khỏi giáp nghiêng
    } else if (P.kind === 'HE') {
      // Nổ phá trúng thẳng: giáp mỏng bị xé (đủ uy lực = xuyên), giáp dày chỉ chịu sức ép / mảnh vỡ trong
      if (ratio >= 1) { mul = 1; penetrated = true; } else mul = Math.max(0.06, floor, ratio * 0.5);
      mul *= sizeK;
    } else if (ratio >= 1) {
      penetrated = true;
      mul = sizeK;
      // Đạn mũi tên xuyên qua xe giáp mỏng (xuyên thấu, ít mảnh vỡ hơn)
      if (P.kind === 'KE' && P.big && ratio > 8) mul *= 0.9;
    } else if (ratio >= 0.8) {
      mul = Math.max(floor, sizeK * (ratio - 0.8) / 0.2 * 0.35);  // xuyên một phần: mảnh bong mặt trong giáp
    } else {
      mul = Math.max(floor, P.kind === 'CE' ? 0.04 : 0.02);        // không xuyên: chấn động / mảnh vỡ trong
    }
    // Hệ số cân bằng sau khi xuyên theo cấp giáp xe (vd đạn thường / tên lửa vào xe tăng chủ lực)
    if (penetrated && P.postK) mul *= P.postK[A.cls] || 1;
    // Vùng trúng (chỉ có ý nghĩa khi đạn lọt vào trong)
    let zone = 'crew';
    if (penetrated || ratio >= 0.8) {
      const tag = ctx.tag;
      if (ctx.onGun) { zone = 'gun'; mul *= 0.3; }
      else if (ctx.trackOrWheel) { zone = 'running'; mul *= 0.35; }
      else if (tag && partKind(tag) === 'ammo') { zone = 'ammo'; mul *= 1.8; }
      else if (onTurret && face === 'rear' && (u.tankType === 'ALL_ROUNDER' || u.tankType === 'ARTILLERY')) { zone = 'ammo'; mul *= u.tankType === 'ALL_ROUNDER' ? 1.6 : 1.8; }
      else if (ctx.nearEngine) { zone = 'engine'; mul *= 0.8; }
      else if (tag && (partKind(tag) === 'acc' || partKind(tag) === 'heavyAcc')) { zone = 'acc'; mul *= 0.5; }
      else if (onTurret) { zone = 'crew'; mul *= 1.1; }
      if (EQ) mul *= EQ.spallMul(u, zone);   // lớp lót chống mảnh
    } else if (ctx.onGun || ctx.trackOrWheel) {
      zone = ctx.onGun ? 'gun' : 'running';
      mul *= 0.5;                            // không xuyên trúng nòng / xích: chấn động ít truyền vào khoang
    }
    return { mul, ratio, pen: penetrated, zone, armor: Math.round(armor), penMm: Math.round(pen), key };
  }

  function onDirectHit(u, opts) {
    const events = [];
    if (u && u.group && u.isDead && u.dmg) return onWreckHit(u, opts);
    if (!u || !u.group || u.isDead) return { mul: 1, events };
    markGroups(u);
    const d = state(u);
    const A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    const cls = ammoClass(opts.ammo);
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
    // Trúng lồng thép: nan lồng không phải giáp -> mặt giáp & góc chạm lấy theo tấm vỏ phía sau lồng
    const cageHit = !!hit && /^cage/.test(tagAtHit(hit) || '');
    const plate = cageHit ? plateBehindCage(u, hit, dir) : null;
    if (plate) plate.ricochet = hit.ricochet;
    const armorHit = plate || hit;
    const armorOnTurret = plate ? isOnTurret(u, plate.object) : onTurret;
    const face = !hit ? 'side' : plate ? faceOf(u, plate, armorOnTurret, dir) : cageHit ? faceFromDir(u, dir, onTurret, hit) : faceOf(u, hit, onTurret, dir);

    // Xuyên giáp: độ xuyên của đạn vs giáp mặt bị trúng (nghiêng theo góc chạm), vùng trúng, cỡ đạn vs cỡ xe
    const tag0 = tagAtHit(hit);
    const EQ = typeof Equipment !== 'undefined' && Equipment.apsTry ? Equipment : null;
    if (EQ && !VIS_ONLY && (opts.ammo === 'RPG' || opts.ammo === 'ANTI_TANK_MISSILE') && EQ.apsLeft(u) > 0) {
      // Radar trên nóc tháp phát hiện đạn bay tới, phóng đạn đánh chặn nổ cách xe vài mét
      const intercepted = EQ.apsTry(u, opts.ammo);
      const ip = point.clone().addScaledVector(dir, -16);
      sparksAt(ip, 22); sfx('era', ip, 0.9);
      if (intercepted) {
        events.push({ type: 'aps', text: `HỆ THỐNG ĐÁNH CHẶN ĐÃ BẮN HẠ ${opts.ammo === 'RPG' ? 'ĐẠN RPG' : 'TÊN LỬA'} (còn ${EQ.apsLeft(u)} lần)` });
        FX = null;
        return { mul: 0, events, intercepted: true };
      }
      events.push({ type: 'apsMiss', text: 'Hệ thống đánh chặn bắn trượt!' });
    }
    // Trúng lồng thép còn nguyên (Equipment.slatHit): chặn hẳn một số loại đạn, các loại khác bị giảm sát thương bên dưới
    const SH = EQ && EQ.slatHit && tag0 && !d.lost.has(tag0) ? EQ.slatHit(tag0, opts.ammo, !!opts.heavy, !VIS_ONLY) : null;
    if (SH && SH.defeated) {
      // Lồng thép bóp méo đầu đạn nổ lõm / kích nổ sớm bom con: đầu nổ không tạo được luồng xuyên, chỉ xé lồng
      if (detachTag(u, tag0, dir.clone().multiplyScalar(40))) onPartLost(u, tag0, partKind(tag0), events, fx, point);
      sparksAt(point, 14);
      events.push({ type: 'slat', text: 'LỒNG THÉP BÓP MÉO ĐẦU ĐẠN — không xuyên được vỏ xe' });
      FX = null;
      return { mul: 0.03, events };
    }
    const lp0 = u.group.worldToLocal(point.clone());
    const eng0 = ENGINE[u.tankType] || ENGINE.ALL_ROUNDER;
    const nearEngine = !onTurret && Math.hypot(lp0.x - eng0[0], lp0.y - eng0[1], lp0.z - eng0[2]) < 11;
    const trackOrWheel = !onTurret && (A.drive === 'wheels' ? wheelIndexAt(u, hit, local) >= 0 : (local.y < 9.6 && Math.abs(local.x) > 8));
    const range = opts.shooter ? Math.hypot(point.x - opts.shooter.x, point.z - opts.shooter.z) : (opts.range || 0);
    const spotKey0 = Math.round(lp0.x / 4) + ',' + Math.round(lp0.y / 4) + ',' + Math.round(lp0.z / 4);
    const fatigue = cls === 'cannon' && d.spots ? (d.spots[spotKey0] || 0) / 20 : 0;   // 12.7mm không làm mỏi được giáp nó không xuyên nổi
    const AO = armorOutcome(u, opts, { face, onTurret: armorOnTurret, onGun, hit: armorHit, dir, point, d, tag: tag0, nearEngine, trackOrWheel, range, fatigue });
    mul = AO.mul;
    d.lastOutcome = AO;
    if (SH && !(hit && hit.ricochet)) {
      mul *= SH.mul;
      if (SH.mul < 1) events.push({ type: 'slatHit', text: SH.noFire ? 'LỒNG THÉP HỨNG ĐẠN CHÁY — vỏ xe không bén lửa' : `LỒNG THÉP HỨNG ĐẠN — giảm ${Math.round((1 - SH.mul) * 100)}% sát thương` });
    }
    // Trúng gạch giáp phản ứng nổ còn nguyên: gạch kích nổ phá đầu đạn (xem Equipment.eraEffect)
    const EQR = typeof Equipment !== 'undefined' && Equipment.eraEffect ? Equipment : null;
    if (EQR && tag0 && partKind(tag0) === 'era' && !d.lost.has(tag0) && !(hit && hit.ricochet)) {
      const eff = EQR.eraEffect(opts.ammo, !!opts.heavy, opts.shooter);
      if (eff.trigger) {
        mul *= eff.mul;
        if (detachTag(u, tag0, dir.clone().multiplyScalar(30))) onPartLost(u, tag0, 'era', events, fx, point);
        events.push({ type: 'eraStop', text: eff.mul === 0 ? 'GẠCH GIÁP NỔ ĐÃ PHÁ HỦY ĐẦU ĐẠN — không mất máu'
          : eff.why === 'tandem' ? 'Đầu nổ mồi kích nổ gạch giáp — đầu chính vẫn xuyên vào'
          : eff.why === 'kinetic' ? 'Gạch giáp nổ chém lệch mũi tên xuyên giáp — giảm 40% sát thương'
          : 'Gạch giáp nổ đỡ được một nửa sức nổ lựu pháo' });
      }
    }
    if (AO.zone === 'ammo' && AO.pen && opts.ammo !== 'SCOUT_BULLET') events.push({ type: 'ammoRack', text: 'TRÚNG KHO ĐẠN — sát thương cực lớn' });
    // Lớp lót chống mảnh (trang bị): phát xuyên vào khoang bị lớp sợi aramid giữ bớt mảnh vỡ -> báo cho người chơi biết
    if (AO.pen && (cls === 'kinetic' || cls === 'heat' || cls === 'cannon') && typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'spall')) {
      events.push({ type: 'spall', text: `LỚP LÓT CHỐNG MẢNH đã chặn bớt mảnh vỡ trong khoang (sát thương -${AO.zone === 'ammo' ? 25 : 15}%)` });
    }
    else if (!AO.pen && AO.ratio < 0.8 && !(hit && hit.ricochet) && (cls === 'kinetic' || cls === 'heat')) events.push({ type: 'nopen', text: `KHÔNG XUYÊN GIÁP (${AO.penMm}mm < ${AO.armor}mm) — nhắm chỗ giáp mỏng hơn: sườn / đuôi / nóc` });

    const impulse = dir.clone().multiplyScalar(cls === 'small' ? 25 : cls === 'cannon' ? 40 : 70);
    const tag = tagAtHit(hit);
    // Phát trúng gần nhất: hiệu ứng phá hủy (explosion_fx.killInfo) dựa vào vùng trúng / hướng đạn để chọn kiểu xe chết
    d.last = { cls, heavy: !!opts.heavy, point: point.clone(), zone: AO.zone, pen: !!AO.pen, onTurret, onGun, face, tag: tag0, dir: dir.clone(), ammo: opts.ammo, at: Date.now() };

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
          const wp = partWorld(u, tg);
          const dd = wp ? wp.distanceTo(point) : 1e9;
          if (dd < bd) { bd = dd; best = tg; }
        }
        if (best && detachTag(u, best, impulse.clone().multiplyScalar(1.5))) onPartLost(u, best, partKind(best), events, fx, point);
        else if (fx && fx.addSurfaceMark && hit.object) fx.addSurfaceMark(point, hit.normal, hit.object, 'penetration', 3.6, { unit: u });
        mul = Math.max(mul, (POSTPEN.small[A.cls] || 1) * 0.5);
        if (A.cls !== 'heavy') addFire(u, point, 0.7, rand(8, 16));
        events.push({ type: 'spall', text: 'MẢNG GIÁP BỊ ĐẠN LIÊN THANH ĐỤC VỠ BUNG RA' });
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
    if (tag && !d.lost.has(tag) && bendable && !d.bent.has(tag) && (cls === 'cannon' || (cls === 'small' && Math.random() < 0.3) || (cls !== 'small' && Math.random() < 0.45))) {
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
    if (onGun) {
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
        const pTrack = { small: 0, cannon: 0, kinetic: 0.45, heat: 0.55, blast: opts.heavy ? 0.75 : 0.5 }[cls] * near;
        if (d.trackTimer[side] <= 0 && !VIS_ONLY) {
          const wBefore = d.trackWear[side] || 0;
          d.trackWear[side] = wBefore + { small: 0.012, cannon: 0.34, kinetic: 1, heat: 1, blast: 0.8 }[cls] * near;
          if (wBefore < 1 && d.trackWear[side] >= 1) events.push({ type: 'track', text: `XÍCH ${side ? 'PHẢI' : 'TRÁI'} HƯ — gãy chốt, lỏng mắt xích: xe chậm & lệch` });
          if (Math.random() < pTrack || d.trackWear[side] >= 2.2) breakTrack(u, side, events, fx, point);
        }
      }
    }

    // Lỗ xuyên giáp bốc cháy tại chỗ (xăng dầu, dây điện, đạn dự trữ bên trong)
    if ((cls === 'heat' || cls === 'kinetic') && !onGun && AO.pen && Math.random() < (A.cls === 'heavy' ? 0.35 : 0.6)) addFire(u, point, cls === 'heat' ? 1.1 : 0.8, rand(10, 22));
    // Đạn nổ phá cỡ lớn xé thủng vỏ: dầu thủy lực / dây điện / đồ đạc trong khoang bén lửa
    else if (cls === 'blast' && !onGun && AO.pen && Math.random() < (A.cls === 'heavy' ? 0.35 : 0.55)) addFire(u, point, 0.9, rand(10, 20));
    // Đạn lớn không xuyên (kể cả trúng giáp mũi): chớp nổ đốt thùng đồ, can dầu, dầu mỡ bám vỏ ngoài -> cháy nhỏ tại chỗ
    else if ((cls === 'blast' || cls === 'heat' || cls === 'kinetic') && !onGun && !AO.pen && !(hit && hit.ricochet)
      && Math.random() < (cls === 'kinetic' ? 0.15 : 0.3)) addFire(u, point, 0.55, rand(6, 12));
    // Xe đã hư nặng (máu < ~45%) còn trúng đạn lớn: lửa bén hẳn tại chỗ trúng, cháy lâu (không chỉ ở khoang máy)
    if ((cls === 'blast' || cls === 'heat' || cls === 'kinetic') && !onGun && u.maxHp && u.hp / u.maxHp < 0.45
      && !d.fires.some(f => f.lasting) && Math.random() < 0.6) {
      addFire(u, point, 0.9, 45);
      d.fires[d.fires.length - 1].lasting = true;
    }
    if (opts.ammo === 'INCENDIARY' && !(SH && SH.noFire) && Math.random() < 0.3) addFire(u, point, 0.5, rand(4, 8));
    // Lưới lá ngụy trang bén lửa tại chỗ trúng (đạn cháy, nổ, nổ lõm) — máy có quyền quyết định rồi gửi trong digest
    if (!VIS_ONLY && typeof CamoFire !== 'undefined' && u._cfStatic && CamoFire.onHit(u, { point, ammo: opts.ammo, heavy: !!opts.heavy, shooter: opts.shooter })) {
      events.push({ type: 'camoFire', text: 'LƯỚI NGỤY TRANG BỐC CHÁY — xe bị lộ' });
    }
    if (d.engine >= 2 && !d.fires.some(f => f.engine)) { const e = ENGINE[u.tankType] || ENGINE.ALL_ROUNDER; const wp = u.group.localToWorld(new THREE.Vector3(e[0], e[1], e[2])); addFire(u, wp, 1.2, 60); d.fires[d.fires.length - 1].engine = true; }
    // Đạn nổ mạnh đánh vào gầm / sườn xe bánh lốp: vặn méo khung gầm
    if (!VIS_ONLY && (cls === 'blast' || cls === 'heat') && A.drive === 'wheels' && !onTurret && local.y < 11 && Math.random() < (opts.heavy ? 0.5 : 0.2)) {
      d.frame = Math.max(-1, Math.min(1, d.frame + (local.x < 0 ? -1 : 1) * rand(0.5, 1)));
      if (!d.frameEv) { d.frameEv = true; events.push({ type: 'frame', text: 'KHUNG GẦM BỊ VẶN MÉO — xe vẹo, khó lái, chậm' }); }
      sfx('armorPlate', point);
    }

    // Tấm giáp tăng cường trên mặt bị trúng hấp thụ đạn nhỏ & sức nổ (Equipment.appliqueDamageMul)
    if (EQ && EQ.appliqueDamageMul) mul *= EQ.appliqueDamageMul(u, face, onTurret, cls);

    recompute(u);
    FX = null;
    return { mul, events, noFire: !!(SH && SH.noFire) };
  }

  // Bóc các bộ phận trong bán kính R quanh điểm nổ
  function stripAround(u, point, R, impulse, events, fx, strength) {
    if (!u.partRegistry && !u.partGroups) return;
    markGroups(u);
    const d = state(u);
    const tags = Object.keys(u.partRegistry || {}).concat(Object.keys(u.partGroups || {}));
    let n = 0;
    for (const tag of tags) {
      if (d.lost.has(tag) || n >= 4) continue;
      const wp = partWorld(u, tag);
      if (!wp) continue;
      const dist = wp.distanceTo(point);
      if (dist > R) continue;
      const kind = partKind(tag);
      const p = Math.pow(1 - dist / R, 1.2) * (DETACH_BLAST[kind] || 1) * strength;
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
    const d = state(u);
    const A = ARMOR[u.tankType] || ARMOR.ALL_ROUNDER;
    const cls = ammoClass(opts.ammo);
    const fx = opts.fx || null;
    FX = fx;
    const point = new THREE.Vector3(opts.x, opts.y, opts.z);
    d.last = { cls, heavy: !!opts.heavy, point: point.clone(), splash: true, ammo: opts.ammo, at: Date.now() };
    // Sóng nổ / mảnh văng: giáp dày chặn tốt, xe nhẹ & xe tải bị mảnh văng xé nát
    let mul = cls === 'heat' || cls === 'kinetic' ? VS.blast[A.cls] : VS[cls][A.cls];
    // Nổ ngay dưới gầm / trên nóc (đạn chùm, lựu pháo) đánh vào chỗ giáp mỏng
    if (opts.ammo === 'CLUSTER_SUBMUNITION' || opts.heavy) mul *= A.face.top;
    // Tấm giáp tăng cường che sườn / tháp: chặn bớt mảnh văng
    if (typeof Equipment !== 'undefined' && Equipment.appliqueSplashMul) mul *= Equipment.appliqueSplashMul(u, cls);
    // Lồng thép quanh xe đỡ mảnh văng: ít sát thương hơn, ít hỏng lốp / xích / phụ kiện hơn (partK)
    const SL = typeof Equipment !== 'undefined' && Equipment.slatSplash ? Equipment.slatSplash(u, cls) : { mul: 1, partK: 1, noFire: false };
    mul *= SL.mul;
    const pk = SL.partK;
    const k = Math.max(0, 1 - opts.dist / Math.max(1, opts.radius));
    const impulse = point.clone().sub(u.group.position).normalize().multiplyScalar(-40 * k);
    u.group.updateMatrixWorld(true);

    if (cls !== 'small' && cls !== 'cannon') {
      stripAround(u, point, opts.radius * 0.75, impulse, events, fx, 0.6 * pk);
      breakAntennas(u, point, opts.radius * 0.8, 0.7, impulse);
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
    } else if (A.drive === 'wheels' && u.wheelSet && opts.dist < 14 && Math.random() < 0.15) {
      // Loạt đạn 30mm / súng máy rải quanh bánh
      const lp = (u.chassisGroup || u.group).worldToLocal(point.clone());
      const wi = wheelIndexAt(u, null, lp);
      if (wi >= 0) flatTire(u, wi, events, fx);
    }
    // Quả nổ sát xe: cầu lửa / mảnh nóng làm lưới lá bén lửa
    if (!VIS_ONLY && typeof CamoFire !== 'undefined' && u._cfStatic && CamoFire.onHit(u, { point, ammo: opts.ammo, heavy: !!opts.heavy, shooter: opts.shooter, splash: true, dist: opts.dist, radius: opts.radius })) {
      events.push({ type: 'camoFire', text: 'LƯỚI NGỤY TRANG BỐC CHÁY — xe bị lộ' });
    }
    recompute(u);
    FX = null;
    return { mul, events, noFire: SL.noFire };
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
    if (det) detonateHull(u);
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
      const kind = partKind(tag);
      if (Math.random() < k * (kind === 'era' ? 0.7 : kind === 'acc' ? 0.55 : 0.3)) {
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

  // Cập nhật mỗi khung hình: mảnh vỡ, hẹn giờ nối xích
  function update(dt, units) {
    updateDebris(dt);
    if (units) {
      for (const u of units) {
        const d = u.dmg;
        if (!d || u.isDead) continue;
        let changed = false;
        for (let s = 0; s < 2; s++) {
          if (d.trackTimer[s] > 0) {
            d.trackTimer[s] = Math.max(0, d.trackTimer[s] - dt);
            if (d.trackTimer[s] === 0) { changed = true; if (u.trackSystem && u.trackSystem.repairSide) u.trackSystem.repairSide(s); }
          }
        }
        const fk = (typeof Equipment !== 'undefined' && Equipment.fireMul) ? Equipment.fireMul(u) : 1;
        for (let i = d.fires.length - 1; i >= 0; i--) { const f = d.fires[i]; f.t += dt * fk; if (f.t > f.life) d.fires.splice(i, 1); }
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
      case 'era': lose(/^era/); break;
      case 'cage': lose(/^cage/); break;
      case 'applique': lose(/^applique/); break;
      case 'feed': lose(/^feed/); break;
      case 'optic': lose(/^optic/); break;
      case 'sensor': lose(/^sensor$/); break;
      case 'atgm': lose(/^atgm$/); break;
      case 'fuel': lose(/^fuelTank$/); break;
      case 'ammo': lose(/^ammoBoxes$/); break;
      case 'acc': lose(/^(mirror|lamp|bin|box|can|cans|rail|railRear|smoke|tool|flap|stowage|shield|travelLock|spare|generator|searchlight|meteo|rcws)/); break;
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
      case 'gun': damageGun(u, events); break;
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
    if (d.gun) out.push('Vũ khí chính hư');
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
      E: d.engine || 0, R: d.ring ? 1 : 0, N: d.gun ? 1 : 0, H: d.hydraulics ? 1 : 0, Fr: r2(d.frame),
      FL: ['front', 'rear', 'sideL', 'sideR', 'top'].map(f => r2(d.faceLoss[f] || 1)),
      FT: ['front', 'rear', 'sideL', 'sideR', 'top'].map(f => r2((d.faceLossT && d.faceLossT[f]) || 1)),
      B: u.burnAuth && u.burnTimer > 0 ? Math.round(u.burnTimer * 10) : 0,
      K: d.apsUsed || 0,
      C: typeof CamoFire !== 'undefined' ? CamoFire.netState(u) : 0   // lưới lá bắt lửa: [hạt giống, ô, gió, lúc]
    };
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
    for (const tag of s.L || []) {
      if (d.lost.has(tag)) continue;
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
    if ((s.E || 0) > (d.engine || 0)) { const sev = s.E - (d.engine || 0) >= 2; damageEngine(u, events, sev); d.engine = Math.max(d.engine, s.E); }
    if (s.R && !d.ring) damageRing(u, events);
    if (s.N && !d.gun) damageGun(u, events);
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

  return {
    ARMOR, ammoClass, onDirectHit, onSplash, onDestroyed, onDetonate, reset, update, recompute, summary, state,
    visualOnly, digest, applyDigest, addFire,
    detachTag, flatTire, blowWheel, breakTrack, bendTag, sfx, debugAction,
    crumpleAt, crushHull, bendBarrel, guardBarrel, armorOutcome, ARMOR_MM, PEN,
    setGroundProvider(fn) { groundProvider = fn; },
    get debrisCount() { return debrisList.length; }
  };
})();

if (typeof window !== 'undefined') window.VehicleDamage = VehicleDamage;
