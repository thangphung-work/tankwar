/**
 * ENGINE CHIẾN SĨ (SoldierEngine) — lớp nền chung cho mọi đơn vị bộ binh (súng trường, SWAT, chống tăng, bắn tỉa,
 * công binh mìn, phóng lựu, súng cối...). Tách bạch theo lớp:
 *   - Hình (SoldierModel.buildFigure: lưới skinned ~20 lượt vẽ)       - Động tác (SoldierModel.animateMotion)
 *   - Bộ máy di chuyển (Motor): tăng/giảm tốc, quay người (chân bước theo), dốc, nước, va chạm, bám đất,
 *     men tường + tìm đường lưới mịn riêng cho bộ binh khi bị chặn
 *   - Ý định (intent): AI hay người chơi chỉ ra lệnh "đi tới / dừng / ngắm / tư thế / hướng canh"
 *   - Tổ (Squad): đội hình, mỗi người canh một hướng khi đi, dừng thì quỳ cảnh giới vòng tròn, phản ứng lệnh lệch nhau
 *   - Thế giới (World): danh sách lính, tránh nhau, cập nhật thưa cho lính xa / ngoài khung nhìn, bóng đổ theo cự ly
 * Đơn vị: 8 đv = 1 m (như xe & địa hình). Hướng: heading = góc quay root quanh Y, mặt trước = (-sin h, 0, -cos h).
 */
const SoldierEngine = (() => {
  const RADIUS = 2.4;                  // bán kính thân khi va chạm (~30 cm: vai + áo giáp)
  const CFG = {
    accel: 34, decel: 52,              // đv/s² (~4,2 / 6,5 m/s²): người mang trang bị không bứt / dừng tức thì
    turnWalk: 4.5, turnRun: 3.2, turnIdle: 5.0, turnAccel: 18, turnAccelRun: 12,   // vận tốc + gia tốc góc: tránh root bật ngay lên tốc độ quay cực đại
    calmAfter: 3,                      // không giao chiến bấy nhiêu giây thì hạ súng thả lỏng
    climbMax: 1.0,                     // dốc tối đa đi được (tan góc ~45°)
    stepUp: 1.7,                       // bậc bước lên được (bó vỉa, bậc thềm ~21 cm)
    wadeMax: 9.6,                      // nước sâu tối đa lội được (~1,2 m)
    crawl: 4.4,                        // bò khi nằm sấp (~0,55 m/s)
    arrive: 3.5,                       // bán kính coi như tới điểm
    stuckTime: 0.8,                    // tiến < 40% dự kiến trong khoảng này -> tìm đường vòng
    navCell: 6, navMargin: 160, navMaxCells: 26000,
    sight: 1600,                       // tầm nhìn phát hiện ~200 m (giảm khi mục tiêu trong bụi / rừng)
    fovGuard: 220 * Math.PI / 180,     // canh gác: góc quan sát rộng (đảo mắt quanh hướng canh)
    fovMove: 140 * Math.PI / 180,
    perceive: 0.25,                    // giây giữa 2 lần quét
    lostAfter: 3.0                     // mất dấu bao lâu thì thôi giao chiến, quay lại lệnh cũ
  };
  // thông số vũ khí cho giao chiến tự động (game nối đường đạn thật qua World.onFire)
  // Lựu 40 mm: sơ tốc 76 m/s (608 đv/s), đạn chỉ kích hoạt ngòi sau ~14 m bay; tầm tối đa 400 m ứng với góc ~21 độ
  const GL40 = { v: 608, g: 78.4, arm: 112, range: 3200, maxElev: 0.373 };
  // Đạn bắn tỉa hạng nặng: sơ tốc ~850 m/s (6800 đv/s), tầm 800 m; đạn rơi thật theo trọng lực, sát thương nhân theo vùng trúng
  // Đạn phản lực RPG: rời ống ~120 m/s rồi động cơ đẩy lên ~290 m/s (game tính gộp 2320 đv/s), bay gần thẳng; ngòi mở sau ~5 m
  // zero: cự ly kính chỉnh sẵn (đv), xa hơn đạn rơi dưới tâm. RPG chịu trọng lực thật (lực đẩy không nâng đạn): rơi ~7 m ở 300 m, người bắn nâng theo vạch
  const RPG_B = { v: 2320, g: 78.4, arm: 40, range: 2800, maxElev: 0.12, zero: 800 };
  // Bắn tỉa tầm xa (2 km = 16000 đv): sức cản không khí thật (k, dv/dt = -k·v², 1/đv) -> ở 2 km còn ~55% sơ tốc, đạn rơi ~50 m,
  // bay ~3,2 s; gió đẩy lệch theo vận tốc tương đối với không khí (wind: hệ số đổi gió m/s sang đv/s mô phỏng, xem ballistics
  // integrateFlight: 8 đv/m x bulletSpeedMultiplier 3,2) -> gió ngang 5 m/s lệch ~1 m ở 1 km, ~4,5 m ở 2 km
  const ATR_B = { v: 6800, g: 78.4, k: 3.74e-5, wind: 25.6, range: 16000, maxElev: 0.08, dmg: 3, zero: 1600 };
  // độ cao đạn (so với nòng) khi đã bay ngang được D đv, bắn ở góc el, có sức cản, lặng gió
  function dragY(B, el, D) {
    let x = 0, y = 0, vx = Math.cos(el) * B.v, vy = Math.sin(el) * B.v;
    const h = 0.006;
    while (x < D) {
      const sp = Math.hypot(vx, vy), d = B.k * sp, nx = x + vx * h;
      if (nx >= D) { const f = (D - x) / (vx * h); return y + vy * h * f; }
      vx -= d * vx * h; vy -= (d * vy + B.g) * h; x = nx; y += vy * h;
      if (vx < 50) return -1e6;
    }
    return y;
  }
  // Góc bắn thấp để đạn từ a rơi trúng b. ok = false: ngoài tầm, trả góc tối đa (đạn rơi ngắn). Trả cả vận tốc đầu.
  function lob(a, b, B = GL40) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, D = Math.hypot(dx, dz) || 1e-3, v2 = B.v * B.v, g = B.g;
    if (B.k) {
      // có sức cản: dò góc bằng cát tuyến trên quỹ đạo số (bắt đầu từ nghiệm không cản)
      const ok = D <= B.range;
      let e0 = Math.atan2(dy, D), e1 = e0 + g * D / (2 * v2) * 1.3, f0 = dragY(B, e0, D) - dy, f1 = dragY(B, e1, D) - dy;
      for (let i = 0; i < 8 && Math.abs(f1) > 0.05 && f1 !== f0; i++) { const e2 = e1 - f1 * (e1 - e0) / (f1 - f0); e0 = e1; f0 = f1; e1 = Math.min(B.maxElev * 3, e2); f1 = dragY(B, e1, D) - dy; }
      const elev = ok ? e1 : B.maxElev, c = Math.cos(elev) * B.v;
      return { ok, elev, vx: dx / D * c, vy: Math.sin(elev) * B.v, vz: dz / D * c };
    }
    const disc = v2 * v2 - g * (g * D * D + 2 * dy * v2);
    const ok = disc >= 0 && D <= B.range;
    const elev = ok ? Math.atan((v2 - Math.sqrt(disc)) / (g * D)) : B.maxElev, c = Math.cos(elev) * B.v;
    return { ok, elev, vx: dx / D * c, vy: Math.sin(elev) * B.v, vz: dz / D * c };
  }
  // vùng trúng người: bán kính (đv), sát thương gốc
  const _aimV = new THREE.Vector3();
  // BẢNG SÁT THƯƠNG BỘ BINH (một chỗ cho trận thật, phòng thử, trang thử). Đơn vị: phần máu tối đa, từ 1 trở lên là chết.
  const WOUND = {
    // SÚNG MÁY 7,62 THEO VÙNG TRÚNG (SoldierModel.segHit -> shell._infZone), máu tối đa 1. Theo thực tế người mặc áo giáp tấm:
    // đầu: mũ thường không chặn đạn súng trường -> chết; tấm giáp trước / sau chặn đạn thường -> bầm, khựng; thân ngoài tấm (sườn, nách, vai, cổ)
    // -> trọng thương; bụng, hông dưới mép tấm -> nặng, chảy máu nhiều; chân / tay -> nhẹ hơn nhưng khập khiễng / run tay, chảy máu (BLEED_K)
    // Đạn 12,7 mm trở lên, 30 mm, lựu 40 mm: tấm không đỡ, trúng đâu cũng chết (giữ như cũ)
    MG762: { head: 1.2, plate: 0.1, chest: 0.8, belly: 0.5, leg: 0.25, arm: 0.2 },
    // chảy máu theo vùng (nhân với máu tụt): động mạch đùi, bụng chảy nhiều; tấm giáp đỡ thì không chảy
    BLEED_K: { plate: 0, chest: 1.5, belly: 1.8, leg: 1.8, arm: 1.2 },
    // đạn nặng (12,7 / 14,5 mm của súng bắn tỉa chống tăng, phòng thử): tấm giáp không đỡ; trúng tay / chân là dập nát chi, mất máu cực nhanh (x dmg 3 của đạn)
    HEAVY: { head: 1, plate: 1, chest: 1, belly: 1, leg: 0.3, arm: 0.3 },
    // trúng thẳng: người không có giáp chống đạn lớn; 12,7 mm và 30 mm trúng thân là chết
    direct(ammo, shell = {}) {
      if (shell.aaMG) { const z = WOUND.MG762[shell._infZone]; return z != null ? z : 0.34; }   // súng 7,62: theo vùng trúng (không rõ vùng: như cũ)
      if (shell.gl40) return 1.2;
      if (ammo === 'SCOUT_BULLET' || ammo === 'SCOUT_INCENDIARY') return 1.2;
      if (ammo === 'GATLING_BULLET' || ammo === 'GATLING_HE' || ammo === 'INCENDIARY') return 1.6;
      return 9;
    },
    // hình thức chết khi trúng thẳng: đạn súng gục tại chỗ, đạn xuyên giáp xuyên qua và đẩy ngã, đạn nổ thì không còn xác
    deathMode(ammo, shell = {}) {
      if (shell.aaMG || ammo === 'SCOUT_BULLET' || ammo === 'SCOUT_INCENDIARY' || ammo === 'GATLING_BULLET' || ammo === 'GATLING_HE' || ammo === 'INCENDIARY') return 'fall';
      if (shell.gl40) return 'blast';
      if (ammo === 'AP') return 'pierce';
      return 'direct';
    },
    // nổ lan vào người: mảnh văng vào người không giáp nặng hơn vào xe; quỳ / nằm ít trúng hơn; lựu 40 mm là đạn sát thương sinh lực
    blastMul(low, shell = {}) { return (shell.gl40 ? 4.5 : 1.5) * (low ? 0.65 : 1); },
    // sức nổ gốc sát điểm nổ (cùng số với bảng nổ lan của game.js, nhân sẵn blastMul khi không quỳ)
    blastBase(ammo, shell = {}) {
      if (shell.gl40) return 2.25;
      if (shell.isHeavyArty) return 3.3;
      const t = { HE: 2.4, RPG: 1.95, ANTI_TANK_MISSILE: 1.95, CLUSTER_SUBMUNITION: 0.195, AP: 0.225, INCENDIARY: 0.12, GATLING_HE: 0.045, GATLING_BULLET: 0.0225, SCOUT_BULLET: 0 };
      return ammo in t ? t[ammo] : 1.5;
    },
    falloff(dist, core, radius) { return dist >= radius ? 0 : Math.min(1, core / Math.max(1, dist)) * (1 - Math.pow(dist / radius, 3)); },
    GL40: { base: 2.25, radius: 26, core: 6 }
  };
  // Nổ lan vào một lính: spec { base, radius, core }. Trả true nếu chết
  function applyBlast(o, x, y, z, spec, src) {
    const dist = Math.hypot(o.x - x, (o.y + 8) - y, o.z - z);
    if (!o.alive || dist >= spec.radius) return false;
    const low = o.intent.stance === 'kneel' || (o.figure._proneK || 0) > 0.5;
    const f = spec.base * WOUND.falloff(dist, spec.core, spec.radius) * (low ? 0.65 : 1);
    return o.damage(f * 100, src || 'FRAG', { mode: 'blast', x, y, z, power: f });
  }
  const ZONES = [['head', 0.95, 100], ['chest', 1.75, 45], ['hips', 1.6, 30]];
  // Trình tự nạp súng ổ quay (giây): hạ súng, gạt lẫy, xoay khung lộ đáy buồng, dốc nòng lên cho vỏ rơi, hạ nòng,
  // nhét từng viên (tay vừa đẩy xong thì vặn ổ sang buồng kế), lên dây cót ổ đạn, khép khung, đưa lên vai. Không còn vỏ thì bỏ qua đoạn dốc nòng.
  // eject: giây cho mỗi vỏ, cộng ejectBase; wind: giây mỗi nhát vặn, windMax chặn tổng
  const GL_RELOAD = { lower: 0.5, unlatch: 0.22, open: 0.34, tip: 0.42, eject: 0.085, ejectBase: 0.28, back: 0.38, turn: 0.42, load: 1.05, belt: 1.25, wind: 0.34, windMax: 1.5, close: 0.3, raise: 0.46 };
  const GL_BELT_PULL = 0.55;   // một lần kéo băng dời đạn sau lưng ra đúng chỗ phía trước (phần vòng dây)
  const CHAMBER = Math.PI / 3, GL_LOAD_ANG = Math.PI / 3;   // góc giữa 2 buồng; ổ xoay để buồng đang nạp nằm phía trên - trái, sát tay
  const BACK_STUCK = 1.2;
  const _yUp = new THREE.Vector3(0, 1, 0);
  const _atrQ = new THREE.Quaternion(), _atrX = new THREE.Vector3(1, 0, 0);
  const sm01 = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  // TẢI TRỌNG: 8 kg (súng trường + băng) = tốc độ chuẩn; mỗi kg thêm / bớt đổi 1,6% tốc độ, chặn 0,75 .. 1,08
  const LOAD = { base: 8, perKg: 0.016, min: 0.75, max: 1.08, ghillie: 2.5, medkit: 1.5 };
  // THỂ LỰC: mang 8 kg chạy liền ~75 s thì kiệt, nặng hơn thì ngắn đi nhanh hơn tỉ lệ (14 kg ~40 s, 17,5 kg ~32 s); chạy lên dốc
  // tốn gấp bội. Kiệt sức thì chỉ đi bộ được tới khi hồi lại 35%. Hồi: đứng yên ~24 s, quỳ / nằm ~18 s, đi bộ ~60 s (từ 0 lên
  // đầy), mang nặng hồi chậm hơn. Đi bộ lên dốc gắt với tải nặng vẫn mất sức.
  // MẶT ĐI ĐƯỢC cho người đi bộ: độ cao THẬT của các mặt ngửa đã vẽ (đường nhựa, vỉa hè, đỉnh bó vỉa, rãnh, mặt giao lộ, đất gốc cây).
  // Các mặt này nằm trên lưới địa hình 5-15 cm (xe lăn qua nên dữ liệu đất của xe không có) và công thức độ cao vỉa hè lệch lưới vẽ
  // tới gần 1 m ở dốc qua đường / bờ kênh -> người chìm chân hoặc lơ lửng. Tam giác ngửa xếp vào ô băm 16 đv, hỏi điểm thì nội suy
  const WALK_RE = /^(road_asphalt\d*|sidewalk|curb|gutter|junction_asphalt|tree_pit_soil)$/, WALK_B = 16;
  function walkIndex(T) {
    if (T.detailsReady === false || !T.group) return null;   // lưới chi tiết chưa dựng xong: hỏi lại lần sau
    const key = T.mapType + ':' + T.seed;
    if (T._walkIdx && T._walkIdx.key === key) return T._walkIdx;
    const t0 = performance.now(), meshes = [];
    T.group.updateMatrixWorld(true);
    T.group.traverse(m => { if (m.isMesh && !m.isInstancedMesh && WALK_RE.test(m.name)) meshes.push(m); });
    let cap = 0;
    for (const m of meshes) cap += Math.floor((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), N = new THREE.Vector3(), full = new Float32Array(cap * 9);
    let nt = 0;
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count, M4 = m.matrixWorld;
      for (let i = 0; i + 2 < n; i += 3) {
        A.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M4);
        B.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(M4);
        C.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(M4);
        N.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A));
        const L = N.length();
        if (L < 1e-6 || Math.abs(N.y) / L < 0.6) continue;   // chỉ mặt ngửa; thành đứng bỏ qua
        const o = nt++ * 9;
        full[o] = A.x; full[o + 1] = A.y; full[o + 2] = A.z; full[o + 3] = B.x; full[o + 4] = B.y; full[o + 5] = B.z; full[o + 6] = C.x; full[o + 7] = C.y; full[o + 8] = C.z;
      }
    }
    const tri = full.slice(0, nt * 9), cells = new Map();   // ô -> [đầu, cuối) trong refs
    const eachCell = (o, fn) => {
      const x0 = Math.floor(Math.min(tri[o], tri[o + 3], tri[o + 6]) / WALK_B), x1 = Math.floor(Math.max(tri[o], tri[o + 3], tri[o + 6]) / WALK_B);
      const z0 = Math.floor(Math.min(tri[o + 2], tri[o + 5], tri[o + 8]) / WALK_B), z1 = Math.floor(Math.max(tri[o + 2], tri[o + 5], tri[o + 8]) / WALK_B);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) fn(gx * 65536 + gz);
    };
    const count = new Map();
    let total = 0;
    for (let o = 0; o < tri.length; o += 9) eachCell(o, k => { count.set(k, (count.get(k) || 0) + 1); total++; });
    const refs = new Int32Array(total), fill = new Map();
    let at = 0;
    for (const [k, c] of count) { cells.set(k, at); fill.set(k, at); at += c; }
    for (let o = 0; o < tri.length; o += 9) eachCell(o, k => { const p = fill.get(k); refs[p] = o; fill.set(k, p + 1); });
    return (T._walkIdx = { key, tri, cells, ends: fill, refs, ms: Math.round(performance.now() - t0) });
  }
  // mặt đi được cao nhất tại (x, z); refY: bỏ mặt cao quá tầm bước -> người dưới gầm cầu không bị nhấc lên mặt cầu. null = không có
  function walkTop(I, x, z, refY) {
    const k = Math.floor(x / WALK_B) * 65536 + Math.floor(z / WALK_B), i0 = I.cells.get(k), t = I.tri, R = I.refs;
    if (i0 === undefined) return null;
    const i1 = I.ends.get(k);
    let best = null;
    for (let i = i0; i < i1; i++) {
      const o = R[i], cx = t[o + 6], cz = t[o + 8], ez = t[o + 5] - cz, ex = cx - t[o + 3], d = ez * (t[o] - cx) + ex * (t[o + 2] - cz);
      if (d === 0) continue;
      const w1 = (ez * (x - cx) + ex * (z - cz)) / d, w2 = ((cz - t[o + 2]) * (x - cx) + (t[o] - cx) * (z - cz)) / d, w3 = 1 - w1 - w2;
      if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
      const y = w1 * t[o + 1] + w2 * t[o + 4] + w3 * t[o + 7];
      if (refY != null && y > refY + 2.2) continue;
      if (best === null || y > best) best = y;   // lớp phủ chồng nhau: lấy mặt cao nhất
    }
    return best;
  }
  const FOOT_Z = [0.45, -0.6, -1.45];   // gót, bàn, mũi giày
  const STAM = { endure: 75, pow: 1.1, uphill: 3, rest: 24, low: 18, walk: 60, recPow: 0.4, tired: 0.02, back: 0.35 };
  const WEAPON_KG = {
    rifle: () => 8,
    gl: A => 6.5 + 0.25 * (A.mag + (A.front || 0) + (A.back || 0)),   // súng + đạn trong ổ + đạn trên băng
    rpg: A => 7 + 2.6 * (A.mag + (A.res !== undefined ? A.res : 3)),   // ống + quả đang nạp + quả trong ba lô
    atr: A => 22.5 + 0.22 * (A.mag + (A.res !== undefined ? A.res : 15)),   // súng + băng đang lắp + băng dự phòng
    kami: A => 3 + 4 * A.mag                                          // máy điều khiển + mỗi ống ~4 kg
  };
  // đạn mang theo trong trận (ngoài phát / băng đang lắp); không đặt = vô hạn (súng trường, phóng lựu dùng băng riêng)
  const RESERVE = { rpg: 3, atr: 15 };
  const ARMS = {
    // spread: độ tản (phần của cự ly) phát chỉnh bắn; first: lệch thêm ở phát đầu (chưa ước đúng cự ly); acquire: giây ngắm / ước cự ly trước phát đầu
    gl: { mag: 6, rof: 0.85, semi: true, ball: GL40, seq: GL_RELOAD, range: 3200, minRange: GL40.arm + 8, kneelBeyond: 160, spread: 0.022, first: 0.06, acquire: [0.9, 1.6] },
    // UAV cảm tử: mỗi người mang 3 ống, dùng một lần, hết là hết; lính canh gác không tự phóng (cần người lái)
    kami: { mag: 3, rof: 0, reload: 0, range: 0, minRange: 0, kneelBeyond: 0, spread: 0, first: 0, acquire: [0, 0], kami: true },
    // súng bắn tỉa hạng nặng: nằm sấp mới bắn (prone), đạn bay thật và tự bù góc theo cự ly (ball); thấy xa hơn lính thường; vác ~25 kg + bao đạn nên không chạy được (maxSpeed đv/s, ~0,9 m/s)
    atr: { mag: 5, rof: 1.8, reload: 5.5, atrMag: true, semi: true, prone: true, maxSpeed: 7, ball: ATR_B, muzzle: [0, 0.36, -12.5], sight: 4800, range: ATR_B.range, minRange: 0, kneelBeyond: 0, spread: 0.0005, first: 0.0012, acquire: [1.6, 2.8] },
    rpg: { mag: 1, rof: 1.2, reload: 4.7, rpgSeq: true, semi: true, rocket: true, ball: RPG_B, muzzle: [0, 0.86, -2.9], range: 2800, minRange: 60, kneelBeyond: 0, spread: 0.004, first: 0.012, acquire: [1.2, 2.2] },
    rifle: { mag: 30, rof: 0.18, reload: 2.8, swap: true, range: 2400, minRange: 0, kneelBeyond: 240, spread: 0.006, first: 0.01, acquire: [0.4, 0.8] }
  };
  const GS = () => SoldierModel.GAIT_SPEED;
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const rnd = (a, b) => a + Math.random() * (b - a);
  let uid = 0;

  class Soldier {
    /**
     * @param {World} world
     * @param {Object} o - { team, x, z, heading, weapon, role, size }
     */
    constructor(world, o = {}) {
      this.world = world;
      this.id = ++uid;
      this.team = o.team || 'BLUE';
      this.role = o.role || 'rifleman';
      this.gear = o.gear || null;
      this.figure = SoldierModel.buildFigure(this.team, { role: 'infantry', weapon: o.weapon, renderOrder: 2, ...(o.gear ? { gear: o.gear } : {}) });
      this.root = this.figure.root;
      // khác biệt từng người: cỡ người ±5% (sải chân & tốc độ theo cỡ -> chân vẫn không trượt), phản xạ, kiểu đảo mắt
      this.k = o.size || rnd(0.95, 1.05);
      this.root.scale.setScalar(this.k);
      this.react = rnd(0.1, 0.7);
      this.scanFreq = rnd(0.35, 0.65); this.scanPh = rnd(0, 6.28); this.scanAmp = rnd(0.28, 0.42);
      world.scene.add(this.root);
      this.x = o.x || 0; this.z = o.z || 0;
      this.heading = o.heading || 0;
      this.y = world.groundAt(this.x, this.z, null);
      this.speed = 0;                    // tốc độ thực (đv/s) theo hướng mặt
      this.turnNow = 0; this.turnSigned = 0; this._turnVel = 0;   // tốc độ quay thực (rad/s), có quán tính góc ngắn
      this.alive = true;
      this.intent = { gait: 'walk', target: null, path: null, aim: null, stance: 'stand', sector: 0, scan: false, face: null };
      this.motion = 'idle';
      this.lookYaw = 0;
      this.animT = Math.random() * 10;
      this._prog = { t: 0, d: 0 };
      this._orders = [];
      this._wall = 0; this._wallT = 0;
      // canh gác & giao chiến
      this.guard = !!o.guard;
      this._sight0 = o.sight;
      this.weapon = this.figure.weapon;
      this.initArms();
      this.enemy = null; this._seen = 0; this._percT = Math.random() * CFG.perceive; this._resume = null;
      this.hp = 100;
      // bị thương: bleed = máu mất (phần trăm/s), cầm dần theo thời gian; lame = không chạy được (0 lành .. 1 nặng).
      // bleedOwned: bộ máy tự trừ máu (phòng thử); trận thật để infantry_match trừ qua đơn vị mạng
      this.bleed = 0; this.lame = 0; this.armHurt = 0; this.bleedOwned = true; this._hpPrev = 100; this._dripT = 0;
      this.voiceK = rnd(0.88, 1.14); this._voxT = 0; this._voxHit = -1e9;   // cao độ giọng riêng; hẹn giờ tiếng rên / thở
      this.stam = 1; this.tired = false; this._grade = 0; this._pantT = 0;      // thể lực (stepStamina)
      this.squad = null;
      this.applyTransform();
    }

    // ----- Ý ĐỊNH (API cho AI / người chơi / tổ) -----
    // delay: giây trễ trước khi thực hiện (phản xạ người thật; tổ dùng để không ai xuất phát cùng lúc)
    order(fn, delay = 0) { if (delay > 0) this._orders.push({ t: delay, fn }); else fn(); }
    moveTo(x, z, gait, delay = 0) {
      this.order(() => {
        const I = this.intent;
        const same = I.target && I.path && Math.hypot(I.target.x - x, I.target.z - z) < 12;
        I.target = { x, z }; if (!same) I.path = null; I.aim = null; I.face = null;
        if (gait) I.gait = gait;
        if (I.stance === 'kneel') I.stance = 'stand';
        this._prog.t = 0; this._prog.d = 0; this._wallT = 0;
        // đường thẳng bị nhà / tường / cây chặn: tính đường vòng ngay (người thật nhìn thấy tường, không húc vào rồi mới tính)
        if (!same && !this.world.lineFree(this.x, this.z, x, z)) this.replan();
      }, delay);
    }
    stop() { this.intent.target = null; this.intent.path = null; }
    aimAt(x, y, z) { this.intent.aim = { x, y, z }; }
    clearAim() { this.intent.aim = null; }
    setStance(s) { this.intent.stance = s; }          // 'stand' | 'kneel' | 'prone'
    faceTo(h) { this.intent.face = h; }               // hướng đứng / quỳ khi không di chuyển (rad)
    setSector(a, scan = true) { this.intent.sector = a; this.intent.scan = scan; }   // hướng canh (rad so với mặt trước, + = trái)
    get forwardX() { return -Math.sin(this.heading); }
    get forwardZ() { return -Math.cos(this.heading); }
    hitboxes() { return SoldierModel.getHitboxes(this.figure); }
    // đổi trang bị / vũ khí / phe: dựng lại hình, giữ nguyên vị trí và trạng thái
    reequip(o = {}) {
      if (o.team) this.team = o.team;
      if ('gear' in o) this.gear = o.gear;
      const weapon = o.weapon || this.weapon;
      if (this.figure._bloodPool && this.figure._bloodPool.parent) this.figure._bloodPool.parent.remove(this.figure._bloodPool);
      this._death = null; this._gone = false;
      this.world.scene.remove(this.root);
      this.root.traverse(c => { if (c.isSkinnedMesh && !c.geometry.userData.shared) c.geometry.dispose(); });
      this.figure = SoldierModel.buildFigure(this.team, { role: 'infantry', weapon, renderOrder: 2, ...(this.gear ? { gear: this.gear } : {}) });
      this.root = this.figure.root; this.root.scale.setScalar(this.k);
      this.world.scene.add(this.root);
      this.weapon = this.figure.weapon;
      if (this._wounds) this._wounds.forEach(w => { SoldierModel.markWound(this.figure, w); if (w[0] === 'l') this.figure.limpSx = w === 'legL' ? -1 : 1; });   // đổi đồ không làm lành vết thương
      this.initArms();
      this._shadow = undefined;
      this.applyTransform();
    }
    initArms() {
      const D = ARMS[this.weapon] || ARMS.rifle, A = this.arms = { def: D, mag: D.mag, cd: 0, reload: 0 };
      this.sight = this._sight0 || D.sight || CFG.sight;
      this._recoil = 0;
      A.ms = this.figure.magState = D.swap ? { t: null, T: 0, empty: false, k: 0 } : null;
      A.ar = this.figure.atrState = D.atrMag ? { t: null, T: 0, empty: false } : null;
      A.cy = this.figure.atrCycle = D.atrMag ? { t: null, empty: false, reload: false } : null;   // lên đạn tay sau mỗi phát (SoldierModel.ATR_CYCLE)
      A.rp = this.figure.rpgState = D.rpgSeq ? { t: null, T: 0, k: 0, left: 3 } : null;
      this.figure.atrOpen = false;
      if (!D.seq) { this.figure.glState = null; return; }
      // ổ đạn: 0 trống, 1 đạn, 2 vỏ đã bắn. idx: buồng đang thẳng nòng; đạn luôn nằm liền nhau từ idx
      A.cham = new Array(D.mag).fill(1); A.idx = 0; A.drumTo = 0; A.rl = null;
      // băng đạn: A.front viên trong tầm tay trước ngực, A.back viên sau lưng; lấy theo thứ tự slot trên dây
      const B = this.figure.chest.userData.glBelt, side = B ? B.slots.length / 2 : 12;
      A.front = side; A.back = side; A.taken = 0;
      A.st = this.figure.glState = { k: 0, tip: 0, gate: 0, drum: 0, ej: new Array(D.mag).fill(0), stage: null, f: 0, load: 0, first: true, turned: false, afterBelt: false, slot: 0, belt: 0, taken: 0, draw: 0, jp: 0, jv: 0, flick: 0, look: 0, meet: 0, stroke: 0, strokeA: 0, cham: A.cham };
    }
    setGuard(on) { this.guard = !!on; if (!on) this.disengage(false); }

    // ----- CANH GÁC & GIAO CHIẾN -----
    // phát hiện địch (quét thưa) -> sau thời gian phản xạ: dừng, quỳ (xa) / đứng (gần), quay & ngắm, bắn theo nhịp vũ khí,
    // hết đạn thì nạp; mất dấu > lostAfter giây thì quay lại lệnh đang làm dở. Cả tổ được báo vị trí địch ngay.
    combat(dt) {
      const W = this.world, A = this.arms;
      A.cd -= dt;
      if (A.def.seq) this.stepReload(dt);
      else if (A.ms) this.stepMagSwap(dt);
      else if (A.ar) { this.stepAtrCycle(dt); this.stepAtrReload(dt); }
      else if (A.rp) this.stepRpgReload(dt);
      else if (A.reload > 0 && (A.reload -= dt) <= 0) A.mag = A.def.mag;
      // hết địch mà ổ đạn còn ít: tranh thủ nạp thêm
      if (this.guard && !this.enemy && A.def.seq && A.reload <= 0 && A.mag <= 2) this.startReload();
      if ((this._percT -= dt) <= 0) {
        this._percT = CFG.perceive;
        if (this.enemy && (!this.enemy.alive || !W.isEnemy(this, this.enemy))) this.disengage(true);   // địch chết: bỏ hướng ngắm (kẻo ngắm mãi vào xác), đi tiếp lệnh dở
        if (this.enemy) {
          if (W.canSee(this, this.enemy)) this._seen = 0; else this._seen += CFG.perceive;
          if (this._seen > CFG.lostAfter) this.disengage(true);
        } else if (this.guard && !this._pendingEnemy) {
          const t = W.spot(this);
          if (t) {
            this._pendingEnemy = t;
            this.order(() => { this._pendingEnemy = null; this.engage(t); if (this.squad) this.squad.contact(t, this); }, this.react + 0.25);
          }
        }
      }
      const E = this.enemy;
      if (!E) { if (this._back) this.endBackoff(); return; }
      // ngắm vào ngực mục tiêu (xe: giữa thân); đứng / quỳ theo cự ly
      const tx = E.x, tz = E.z, ty = E.y + (E.aimH || 9);
      this.aimAt(tx, ty, tz);
      const d = Math.hypot(tx - this.x, tz - this.z);
      this.setStance(d > A.def.kneelBeyond ? 'kneel' : 'stand');
      const dh = Math.abs(angDiff(this.heading, Math.atan2(-(tx - this.x), -(tz - this.z))));
      if (A.def.seq && this.backoff(dt, tx, tz, d)) return;
      if (A.def.prone && (this.figure._proneK || 0) < 0.95) return;   // chưa nằm xuống hẳn thì chưa bắn
      if (this._seen === 0 && dh < 0.08 && this.speed < 0.6 && A.cd <= 0 && A.reload <= 0 && !this.cycling && d <= A.def.range && d >= A.def.minRange) {
        if (A.mag > 0) {
          this.fireRound(); A.cd = A.def.rof * rnd(0.9, 1.25);
          // độ tản: phát đầu lệch nhiều (ước sai cự ly), các phát sau chỉnh dần theo điểm nổ
          const e = d * (A.def.spread + A.def.first * Math.max(0, 1 - (this._shots || 0) / 3)) * (1 + 1.2 * (this.armHurt || 0)), ea = Math.random() * Math.PI * 2, er = e * Math.sqrt(Math.random());   // tay bị thương: bắn tản
          this._shots = (this._shots || 0) + 1;
          const aimP = { x: tx + Math.cos(ea) * er, y: ty, z: tz + Math.sin(ea) * er, dist: d, weapon: this.weapon };
          if (A.def.muzzle && !A.def.rocket) W.fireBullet({ shooter: this, from: this.muzzlePos(), to: aimP });
          if (W.onFire) W.onFire(this, E, aimP);
        }
        if (A.mag <= 0) this.startReload();
      }
    }
    // lùi khỏi địch quá gần, mặt vẫn hướng địch. Lùi mà không xa thêm được trong BACK_STUCK giây (vướng tường, bị đuổi sát) thì chịu, nghỉ một lúc rồi mới thử lại
    backoff(dt, tx, tz, d) {
      const A = this.arms, I = this.intent, min = A.def.minRange;
      this._backCd = Math.max(0, (this._backCd || 0) - dt);
      if (this._back) {
        this._back -= dt;
        if (d > this._backBest + 2) { this._backBest = d; this._back = BACK_STUCK; }
        if (d >= min + 24 || this._back <= 0) { if (d < min) this._backCd = 3; this.endBackoff(); return false; }
      } else {
        if (d >= min || this._backCd > 0 || A.reload > 0 || I.target) return false;
        this._back = BACK_STUCK; this._backBest = d;
      }
      const l = d || 1, x = (this.x - tx) / l, z = (this.z - tz) / l;
      I.drive = { x, z, gait: 'walk', mul: 1.5, face: Math.atan2(tx - this.x, tz - this.z) + Math.PI };
      this.setStance('stand');
      return true;
    }
    endBackoff() { this._back = 0; this.intent.drive = null; }
    // độ cao ngắm: đúng tâm vùng ngực hiện tại (đứng, quỳ, nằm đều khác); số cố định dễ rơi vào khe giữa ngực và đầu
    get aimH() { this.figure.chest.localToWorld(_aimV.set(0, 1.9, 0)); return _aimV.y - this.y; }
    muzzlePos() { const m = this.arms.def.muzzle; return this.figure.rifle.localToWorld(new THREE.Vector3(m[0], m[1], m[2])); }
    // một phát rời nòng: trừ đạn, giật súng; súng ổ quay thì lò xo đẩy ổ sang buồng kế
    fireRound() {
      const A = this.arms;
      A.mag--; this._recoil = 1;
      if (A.def.rocket) this.world.sfx(this, 'rpgShot');
      if (A.cy) { A.cy.t = 0; A.cy.empty = A.mag <= 0; A.cy.reload = false; }   // súng lên đạn tay: kéo khoá xong mới bắn tiếp
      if (!A.def.seq) return;
      A.cham[A.idx] = 2; A.idx = (A.idx + 1) % A.def.mag; A.drumTo -= CHAMBER;
      this.world.sfx(this, 'shot');
    }
    // tải đang mang (kg) và hệ số tốc độ tương ứng
    get loadKg() { return (WEAPON_KG[this.weapon] || WEAPON_KG.rifle)(this.arms) + (this.gearKg || 0); }
    get loadMul() { return Math.max(LOAD.min, Math.min(LOAD.max, 1 - (this.loadKg - LOAD.base) * LOAD.perKg)); }
    get reserve() { const A = this.arms; return A.res !== undefined ? A.res : A.front === undefined ? null : A.front + A.back; }
    get cycling() { const C = this.arms.cy; return !!C && C.t != null; }
    startReload() {
      const A = this.arms;
      if (A.reload > 0 || A.mag >= A.def.mag || this.reserve === 0) return false;
      if (this.cycling) { A.cy.reload = true; return false; }   // tay đang ở khoá nòng: kéo khoá xong mới thay băng
      if (A.ms) {
        const M = SoldierModel.MAG_SWAP; A.ms.empty = A.mag <= 0; A.ms.T = A.ms.empty ? M.empty : M.tac; A.ms.t = 0; A.reload = A.ms.T;
        this.world.sfx(this, 'cloth');
        return true;
      }
      if (A.ar) {
        const M = SoldierModel.ATR_RELOAD; A.ar.empty = A.mag <= 0; A.ar.T = A.ar.empty ? M.empty : M.tac; A.ar.t = 0; A.reload = A.ar.T;
        this.world.sfx(this, 'cloth');
        return true;
      }
      if (A.rp) {
        A.rp.T = SoldierModel.RPG_RELOAD.T; A.rp.t = 0; A.reload = A.rp.T;
        A.rp.left = A.res !== undefined ? Math.min(3, A.res) : 3;
        return true;
      }
      if (!A.def.seq) { A.reload = A.def.reload; return true; }
      A.reload = 1; A.rl = { stage: 'lower', t: 0, n: Math.min(A.def.mag - A.mag, this.reserve), done: 0, stop: false, from: 0, to: 0, slot: 0, afterBelt: false };
      this.world.sfx(this, 'cloth');
      return true;
    }
    // thay băng súng trường: giờ giấc chung với hình trong SoldierModel.MAG_SWAP. Đạn vào khi băng khít ổ, nhưng phải xong động tác mới bắn được.
    // A.res: số viên dự trữ (chỉ khi được đặt; lính AI không đặt nên không hết đạn)
    stepMagSwap(dt) {
      const A = this.arms, S = A.ms, W = this.world;
      if (S.t == null) return;
      const t0 = S.t, M = SoldierModel.MAG_SWAP, at = x => t0 < x && S.t >= x;
      S.t += dt; A.reload = Math.max(0, S.T - S.t);
      if (at(M.pull[0] + 0.04)) W.sfx(this, 'magOut');
      if (at(M.pull[1]) && S.empty) W.dropMag(this);
      if (at(M.stow[1] - 0.1) && !S.empty) W.sfx(this, 'magPouch');
      if (at(M.grab[0] + 0.08)) W.sfx(this, 'magPouch');
      if (at(M.seat[1] - 0.05)) {
        W.sfx(this, 'magIn');
        const n = A.res !== undefined ? Math.min(A.def.mag - A.mag, A.res) : A.def.mag - A.mag;
        A.mag += n; if (A.res !== undefined) A.res -= n;
      }
      if (at(M.slap[0] + 0.08)) W.sfx(this, 'magSlap');
      if (S.empty && at(M.chgPull[1] - 0.04)) W.sfx(this, 'boltBack');
      if (S.empty && at(M.chgRel[1])) W.sfx(this, 'boltFwd');
      if (S.t >= S.T) { S.t = null; S.k = 0; A.reload = 0; }
    }
    // lên đạn tay sau phát bắn: giờ giấc chung với hình trong SoldierModel.ATR_CYCLE
    stepAtrCycle(dt) {
      const A = this.arms, C = A.cy, W = this.world;
      if (!C || C.t == null) return;
      const t0 = C.t, M = SoldierModel.ATR_CYCLE, at = x => t0 < x && C.t >= x;
      C.t += dt;
      if (at(M.lift[0])) W.sfx(this, 'atrBoltUp');
      if (at(M.pull[0])) W.sfx(this, 'atrBoltBack');
      if (at(M.eject)) W.ejectAtrCase(this);
      if (C.empty) { if (at(M.pull[1])) this.figure.atrOpen = true; }
      else {
        if (at(M.push[0])) W.sfx(this, 'atrBoltFwd');
        if (at(M.lock[0])) W.sfx(this, 'atrBoltLock');
      }
      if (C.t >= (C.empty ? M.Te : M.T)) { C.t = null; if (C.reload || A.mag <= 0) { C.reload = false; this.startReload(); } }
    }
    // thay băng súng bắn tỉa: giờ giấc chung với hình trong SoldierModel.ATR_RELOAD
    stepAtrReload(dt) {
      const A = this.arms, S = A.ar, W = this.world;
      if (S.t == null) return;
      const t0 = S.t, M = SoldierModel.ATR_RELOAD, at = x => t0 < x && S.t >= x;
      S.t += dt; A.reload = Math.max(0, S.T - S.t);
      if (at(M.reach[0] + 0.06)) W.sfx(this, 'atrBody');
      if (at(M.press[0] + 0.03)) W.sfx(this, 'atrLatch');
      if (at(M.pull[0] + 0.02)) W.sfx(this, 'atrMagOut');
      if (at(M.pull[1]) && S.empty) W.dropMag(this);
      if (at(M.stow[0] + 0.1)) W.sfx(this, 'atrBody');
      if (at(M.stow[1] - 0.12) && !S.empty) W.sfx(this, 'atrPouch');
      if (at(M.grab[0] + 0.1)) W.sfx(this, 'atrPouch');
      if (at(M.bring[0] + 0.2)) W.sfx(this, 'atrBody');
      if (at(M.seat[0] + 0.02)) W.sfx(this, 'atrRock');
      if (at(M.seat[1] - 0.1)) W.sfx(this, 'atrMagIn');
      if (at(M.seat[1] - 0.05)) {
        const n = A.res !== undefined ? Math.min(A.def.mag - A.mag, A.res) : A.def.mag - A.mag;
        A.mag += n; if (A.res !== undefined) A.res -= n;
      }
      if (at(M.slap[0] + 0.08)) W.sfx(this, 'atrSlap');
      if (at(M.tug[0] + 0.1)) W.sfx(this, 'atrTug');
      if (at(M.back[1] - 0.05)) W.sfx(this, 'atrGrip');
      if (S.empty && at(M.bReach[1] - 0.04)) W.sfx(this, 'atrGrip');
      if (S.empty && at(M.bPull[1] - 0.15)) W.sfx(this, 'atrBoltFwd');   // tiếng đóng khoá rơi đúng lúc khoá tới đuôi nòng
      if (S.empty && at(M.bBack[1] - 0.05)) W.sfx(this, 'atrGrip');
      if (S.empty && at(M.bRel[0])) { W.sfx(this, 'atrBoltLock'); this.figure.atrOpen = false; }
      if (S.t >= S.T) { S.t = null; A.reload = 0; }
    }
    // nạp ống phóng: giờ giấc chung với hình trong SoldierModel.RPG_RELOAD. Đạn tính vào khi chốt khớp, nhưng phải đưa ống lên vai xong mới bắn được.
    stepRpgReload(dt) {
      const A = this.arms, S = A.rp, W = this.world;
      if (S.t == null) return;
      const t0 = S.t, M = SoldierModel.RPG_RELOAD, at = x => t0 < x && S.t >= x;
      S.t += dt; A.reload = Math.max(0, S.T - S.t);
      if (at(M.lower[0] + 0.03)) W.sfx(this, 'cloth');
      if (at(M.flap)) W.sfx(this, 'rpgFlap');
      if (at(M.grab[0] + 0.05)) W.sfx(this, 'rpgStrap');
      if (at(M.lift[0] + 0.03)) W.sfx(this, 'rpgDraw');
      if (at(M.over[0] + 0.15)) W.sfx(this, 'cloth');
      if (at(M.insert[0] + 0.01)) W.sfx(this, 'rpgTip');
      if (at(M.insert[0] + 0.05)) W.sfx(this, 'rpgSlide');
      if (at(M.seat[1] - 0.04)) {
        W.sfx(this, 'rpgSeat');
        A.mag = A.def.mag; if (A.res !== undefined) A.res = Math.max(0, A.res - 1);
      }
      if (at(M.twist[0] + 0.02)) W.sfx(this, 'rpgTwist');
      if (at(M.capPull[0] + 0.05)) W.sfx(this, 'rpgCap');
      if (at(M.capToss)) W.dropRpgCap(this);
      if (at(M.cock[0])) W.sfx(this, 'rpgCock');
      if (at(M.raise[0] + 0.12)) W.sfx(this, 'cloth');
      if (at(M.land)) W.sfx(this, 'rpgShoulder');
      if (S.t >= S.T) { S.t = null; A.reload = 0; if (A.res !== undefined) S.left = Math.min(3, A.res); }
    }
    // bóp cò giữa chừng: nhét xong viên đang cầm rồi khép khung bắn ngay
    interruptReload() { const R = this.arms.rl; if (R) R.stop = true; }
    stepReload(dt) {
      const A = this.arms, St = A.st, W = this.world, R = A.rl;
      // súng rung sau mỗi cú va (khung đập cữ, đạn vào buồng, khung sập): lò xo tắt dần, mô hình cộng vào tư thế súng
      const h = Math.min(dt, 0.04);
      St.jv += (-676 * St.jp - 18 * St.jv) * h; St.jp += St.jv * h;
      if (!R) { St.drum += (A.drumTo - St.drum) * Math.min(1, dt * 34); return; }   // lò xo quay ổ rất nhanh
      const dur = () => (R.stage === 'wind' ? R.windT : R.stage === 'eject' ? R.ejT : A.def.seq[R.stage]), T0 = R.t / dur();
      R.t += dt;
      const f = R.t / dur(), cross = x => T0 < x && f >= x;
      // ổ đạn đi qua một buồng thì chốt định vị kêu một tiếng; k: lò xo căng tới đâu
      const turnTo = (a, k) => { if (Math.floor(St.drum / CHAMBER + 0.5) !== Math.floor(a / CHAMBER + 0.5)) W.sfx(this, 'index', k); St.drum = A.drumTo = a; };
      switch (R.stage) {
        case 'unlatch': if (cross(0.05)) W.sfx(this, 'latch'); break;
        case 'open':
          if (cross(0.02)) W.sfx(this, 'open', A.cham.includes(2) ? 1 : 0);
          if (cross(0.72)) St.jv += 1.1;   // cụm trước đập cữ
          break;
        case 'tip': if (cross(0.55)) W.sfx(this, 'caseShift'); break;
        case 'eject': {
          // giật súng hai nhịp cho vỏ tụt; vỏ rời từng cái, trượt hết lòng buồng mới rơi
          // hất: cổ tay giật súng lên + kéo về sau thật nhanh rồi hạ chậm, hai lần; vỏ rời buồng theo đà của cú giật
          if (cross(0.03)) W.sfx(this, 'cloth');
          if (cross(0.45)) W.sfx(this, 'caseShift');
          const pulse = t0 => { const u = R.t - t0 * R.ejT; return u < 0 ? 0 : sm01(u / 0.07) * (1 - sm01((u - 0.09) / 0.22)); };
          St.flick = Math.max(pulse(0.03), 0.75 * pulse(0.45));
          const L = R.ejList, gap = 0.82 / Math.max(1, L.length), slide = 0.09 / R.ejT;
          L.forEach((c, n) => {
            if (A.cham[c] !== 2) return;
            const a = 0.1 + n * gap;
            if (cross(a)) W.sfx(this, 'caseSlide');
            St.ej[c] = sm01((f - a) / slide);
            if (f >= a + slide) { W.dropCasing(this, c); A.cham[c] = 0; St.ej[c] = 0; }
          });
          break;
        }
        case 'turn':
          // ổ đang lệch buồng cần nạp: tay đặt lên đáy ổ rồi vặn tới đúng buồng
          if (cross(0.36)) W.sfx(this, 'glove');
          turnTo(R.from + (R.to - R.from) * sm01((f - 0.38) / 0.62), 0);
          break;
        case 'load':
          St.draw = sm01((f - 0.3) / 0.12);                             // nắm được rồi thì rút khỏi vòng vải
          if (cross(0.27)) W.sfx(this, 'glove');
          if (cross(0.3)) W.sfx(this, 'pouch');
          if (cross(0.42)) { A.front--; St.taken = ++A.taken; }          // viên rời băng, sang tay
          if (cross(0.7)) W.sfx(this, 'seat');
          if (cross(0.8)) St.jv += 0.45;                                 // vành đuôi chạm miệng buồng
          if (cross(0.84)) {
            A.cham[R.k] = 1; A.mag++; R.done++;
            // còn nạp tiếp thì tay vẫn trên đuôi viên vừa vào, vặn luôn sang buồng kế (ổ không tự quay khi tay ở chỗ khác)
            R.ixTo = null;
            if (R.done < R.n && !R.stop) { const k = (A.idx + A.mag) % A.def.mag, to = GL_LOAD_ANG - k * CHAMBER; R.ixFrom = St.drum; R.ixTo = to + Math.round((St.drum - to) / (Math.PI * 2)) * Math.PI * 2; }
          }
          if (R.ixTo != null && f > 0.86) turnTo(R.ixFrom + (R.ixTo - R.ixFrom) * sm01((f - 0.86) / 0.14), 0);
          break;
        case 'belt': {
          // kéo 3 nhịp; đạn sau lưng trườn qua vai ra trước, dây rỗng tụt ra sau
          for (const x of [0.02, 0.35, 0.68]) if (cross(x)) W.sfx(this, 'belt');
          const ph = Math.min(1, f) * 3, q = ph - Math.floor(ph);
          St.belt = R.bFrom + GL_BELT_PULL * (Math.floor(ph) + sm01(q / 0.7)) / 3;
          break;
        }
        case 'wind': {
          // lên dây bằng cổ tay: mỗi nhát vặn được một đoạn, nhả tay về rồi vặn tiếp; ổ đứng yên lúc đổi tay, lò xo căng dần nên nhát sau nặng hơn
          const n = R.strokes, ph = Math.min(0.9999, f) * n, i = Math.floor(ph), q = ph - i, push = sm01(q / 0.72);
          turnTo(R.from + (R.to - R.from) * (i + push) / n, (i + push) / n);
          for (let j = 0; j < n; j++) { if (cross((j + 0.01) / n)) W.sfx(this, 'windCreak', j / n); if (j < n - 1 && cross((j + 0.72) / n)) W.sfx(this, 'glove'); }
          St.stroke = q < 0.72 ? push : i < n - 1 ? 1 - sm01((q - 0.72) / 0.28) : 1; St.strokeA = (R.to - R.from) / n;
          if (cross(0.74 + 0.26 * (n - 1) / n)) { W.sfx(this, 'windEnd'); St.jv += 0.4; }
          break;
        }
        case 'close': if (cross(0.02)) W.sfx(this, 'close'); break;
        case 'raise': if (cross(0.12)) W.sfx(this, 'glove'); break;
      }
      if (R.stage !== 'eject') St.flick = 0;
      if (f >= 1) this.nextStage(R);
      if (!A.rl) { St.k = 0; St.flick = 0; return; }
      const g = Math.min(1, R.t / dur());
      St.stage = R.stage; St.f = g; St.load = R.k || 0; St.first = R.done === 0; St.afterBelt = !!R.afterBelt; St.slot = R.slot;
      St.k = R.stage === 'lower' ? sm01(g) : R.stage === 'raise' ? 1 - sm01(g) : 1;
      St.tip = R.stage === 'tip' ? sm01(g) : R.stage === 'eject' ? 1 : R.stage === 'back' ? 1 - sm01(g) : 0;
      // mở: tay đẩy tới cữ thì nảy lại một chút; khép: nhanh dần rồi sập
      St.gate = R.stage === 'open' ? (g < 0.72 ? sm01(g / 0.72) : 1 - 0.07 * Math.sin((g - 0.72) / 0.28 * Math.PI)) : R.stage === 'close' ? 1 - Math.pow(g, 2.4) : R.stage === 'lower' || R.stage === 'unlatch' || R.stage === 'raise' ? 0 : 1;
    }
    nextStage(R) {
      const A = this.arms, St = A.st;
      const set = s => { R.stage = s; R.t = 0; };
      const beginLoad = () => {
        // hết đạn phía trước: kéo băng trước đã
        if (A.front <= 0 && A.back > 0) { R.bFrom = St.belt; set('belt'); return; }
        R.slot = A.taken;
        R.k = (A.idx + A.mag) % A.def.mag;                             // đạn liền nhau: nối tiếp sau viên cuối
        R.from = St.drum; R.to = GL_LOAD_ANG - R.k * CHAMBER;
        R.to += Math.round((R.from - R.to) / (Math.PI * 2)) * Math.PI * 2;   // quay đường ngắn
        if (Math.abs(R.to - R.from) > 0.02) { St.turned = true; set('turn'); return; }
        set('load');
      };
      switch (R.stage) {
        case 'lower': St.turned = false; set('unlatch'); break;
        case 'unlatch': set('open'); break;
        case 'open': if (A.cham.includes(2)) set('tip'); else beginLoad(); break;
        case 'tip':
          R.ejList = []; for (let i = 0; i < A.cham.length; i++) if (A.cham[i] === 2) R.ejList.push(i);
          R.ejT = GL_RELOAD.ejectBase + GL_RELOAD.eject * R.ejList.length;
          set('eject'); break;
        case 'eject':
          for (let i = 0; i < A.cham.length; i++) if (A.cham[i] === 2) { this.world.dropCasing(this, i); A.cham[i] = 0; }
          St.ej.fill(0); set('back'); break;
        case 'back': beginLoad(); break;
        case 'turn': St.drum = A.drumTo = R.to; set('load'); break;
        case 'belt': St.belt = R.bFrom + GL_BELT_PULL; A.front = A.back; A.back = 0; R.afterBelt = true; beginLoad(); return;
        case 'load':
          if (R.ixTo != null) St.drum = A.drumTo = R.ixTo;
          R.ixTo = null; R.afterBelt = false;
          if (R.done < R.n && !R.stop) beginLoad();
          else {
            // lên dây: quay ngược chiều bắn ít nhất một vòng tới khi buồng đầu tiên thẳng nòng
            R.from = St.drum; const top = -A.idx * CHAMBER, turn = Math.PI * 2;
            R.to = top + Math.ceil((R.from + turn - top) / turn) * turn;
            R.strokes = Math.max(2, Math.round((R.to - R.from) / (turn / 3)));
            R.windT = Math.min(GL_RELOAD.windMax, R.strokes * GL_RELOAD.wind);
            set('wind');
          }
          break;
        case 'wind': St.drum = A.drumTo = R.to; set('close'); break;
        case 'close': St.jv += 1.9; this.world.sfx(this, 'slam'); set('raise'); this.world.sfx(this, 'cloth'); break;
        case 'raise': A.rl = null; A.reload = 0; A.drumTo = St.drum; break;
      }
    }
    // ----- UAV CẢM TỬ: phóng theo trình tự trong model (SoldierModel.KAMI_SEQ); 'launch' là lúc UAV rời ống -----
    // World.onKami(lính, 'grab' | 'set' | 'arm' | 'launch' | 'end', { pos, dir }) — trận / phòng thử phóng UAV thật ở 'launch'
    startKami() {
      const A = this.arms, F = this.figure;
      if (!this.alive || !A.def.kami || A.mag <= 0 || F.kamiSeq != null || F.kamiCtl || this.speed > 0.6) return false;
      F.kamiSeq = 0; F.kamiLeft = A.mag;
      this.setStance('kneel');
      return true;
    }
    stepKami(dt) {
      const F = this.figure, A = this.arms, W = this.world;
      if (F.kamiLeft === undefined) F.kamiLeft = A.mag;
      SoldierModel.stepKamiSeq(F, dt, ev => {
        if (ev === 'grab') { A.mag--; F.kamiLeft = A.mag; }
        const T = ev === 'launch' || ev === 'end' ? SoldierModel.kamiTubeWorld(F) : null;
        if (ev === 'end') W.dropKamiTube(T);
        if (W.onKami) W.onKami(this, ev, T);
      });
    }

    engage(t) {
      if (!t || !t.alive || this.enemy === t) return;
      if (!this.enemy) {
        // nhớ lệnh đang làm dở để quay lại sau khi hết địch
        const I = this.intent;
        this._resume = I.target ? { x: I.target.x, z: I.target.z, gait: I.gait } : null;
        this._resumeStance = I.stance;
        this.stop();
      }
      this.enemy = t; this._seen = this.world.canSee(this, t) ? 0 : CFG.perceive;
      this._shots = 0;
      const q = this.arms.def.acquire; this.arms.cd = Math.max(this.arms.cd, rnd(q[0], q[1]));   // ngắm & ước cự ly trước phát đầu
    }
    disengage(resume) {
      this.enemy = null; this._pendingEnemy = null; this.clearAim();
      const R = resume ? this._resume : null;
      this._resume = null;
      if (this.intent.target) return;   // có lệnh mới trong lúc giao chiến: giữ lệnh mới, không quay lại lệnh cũ
      if (R) this.order(() => {
        if (this.enemy) this._resume = this._resume || R;   // đang phản ứng thì gặp địch khác: đánh xong mới đi tiếp
        else if (!this.intent.target) this.moveTo(R.x, R.z, R.gait);
      }, this.react);
      else if (this._resumeStance) this.setStance(this._resumeStance);
    }
    // trúng đạn / mảnh / sóng nổ (game gọi): hết máu thì ngã
    damage(amount, src, info) {
      if (!this.alive) return false;
      this.hp -= amount;
      if (this.hp <= 0) { this.kill(src, info); return true; }
      this._woundFrom = info || null;
      this.stepWound(0);
      return false;
    }
    // vết thương mới tính theo máu tụt (trúng đạn ở phòng thử, hay máu đồng bộ từ đơn vị trận thật): chảy máu, đi khập khiễng
    stepWound(dt) {
      const F = this.figure, drop = this._hpPrev - this.hp;
      // Small blast and fragment hits still get a brief directional body reaction;
      // keep it visual only, with the existing damage and movement rules unchanged.
      if (drop > 0.35 && this._woundFrom) {
        const I = this._woundFrom, fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
        const front = I.x != null ? (I.x - this.x) * fx + (I.z - this.z) * fz
          : I.vel ? -(I.vel.x * fx + I.vel.z * fz) : 1;
        F.flinch = Math.max(F.flinch || 0, Math.min(0.8, 0.28 + drop * 0.035));
        F.flinchDir = front >= 0 ? 1 : -1;
      }
      if (this.hp >= 100 && F.aidT == null && !F._aidK) {   // đang băng dở (bộ y tế vừa hồi đầy): làm nốt động tác, đứng dậy hẳn rồi mới lành
        if (this.lame > 0 || this._medDone) SoldierModel.aidReset(F, true);   // được cứu thương đầy máu: lành
        this._medDone = false;
        this._wounds = []; F.limpSx = 0;
        this.bleed = 0; this.lame = 0; this.armHurt = 0;
      } else if (drop > (this.bleedOwned ? 0.5 : 3) && this._woundFrom && this._woundFrom.zone === 'plate') {
        // tấm giáp đỡ đạn: bầm dập, khựng người, không có vết thương / không chảy máu
        this._woundFrom = null;
        this._plateHit = true;
        const nowS = performance.now() / 1000;
        if (nowS - this._voxHit > 0.5) { this._voxHit = nowS; this.world.vox(this, 'hit'); }
      } else if (drop > (this.bleedOwned ? 0.5 : 3)) {   // máu đồng bộ từ đơn vị: nhịp chảy máu tụt tối đa 1,25 mỗi 0,5 s, mạng gộp hoặc khung chậm có thể cộng vài nhịp; không tính là vết mới
        const Z = this._woundFrom && this._woundFrom.zone, BK = WOUND.BLEED_K[Z];
        this.bleed = Math.min(2.5, this.bleed + drop * 0.022 * (BK != null ? BK : 1));   // trúng 30 máu: ~0,66%/s, cầm sau ~1 phút (mất thêm ~20); theo vùng (BLEED_K)
        // chân trúng đạn: gãy xương / rách cơ đùi -> không chạy được; bụng, hông: đau gập người, đi chậm
        this.lame = Math.min(1, Math.max(this.lame, 0.35 + (100 - this.hp) / 100, Z === 'leg' ? 0.85 : Z === 'belly' ? 0.6 : 0));
        if (Z === 'arm') this.armHurt = 1;   // tay trúng đạn: cầm súng run (soldier_player: tâm ngắm; lính máy: độ tản)
        // nhiều mảnh trúng cùng lúc chỉ kêu một tiếng
        const nowS = performance.now() / 1000;
        if (nowS - this._voxHit > 0.5) { this._voxHit = nowS; this.world.vox(this, drop >= 25 ? 'hitBad' : 'hit'); this._voxT = rnd(3, 6); }
        const site = this.woundSite();
        SoldierModel.markWound(F, site);
        if (!this._wounds) this._wounds = [];
        if (!this._wounds.includes(site)) this._wounds.push(site);   // trúng thêm chỗ chưa băng: một lượt băng là đủ
        if (site[0] === 'l') F.limpSx = site === 'legL' ? -1 : 1;
      }
      if (dt > 0 && this.bleed > 0) {
        if (this.bleedOwned) {
          this.hp -= this.bleed * dt;
          if (this.hp <= 0) { this._hpPrev = this.hp; this.kill('bleed', { mode: 'fall' }); return; }
        }
        this.bleed = this.bleed > 0.04 ? this.bleed * Math.exp(-dt / 28) : 0;
        // nhỏ giọt xuống đất: chảy càng mạnh càng dày; dừng chân thì đọng thành vệt to hơn
        if ((this._dripT -= dt * (0.4 + this.bleed)) <= 0 && SoldierModel.bloodDrop) {
          this._dripT = 0.5 + Math.random() * 0.7;
          const s = (0.5 + Math.random() * 0.5) * (this.speed < 1 ? 1.6 : 1) * Math.min(1.5, 0.6 + this.bleed * 0.5) * this.k;
          const a = Math.random() * 6.28, r = Math.random() * 1.2 * this.k;
          const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
          SoldierModel.bloodDrop(this.world.scene, x, this.world.groundAt(x, z, this.y), z, s);
        }
      }
      F.limp = F.limpSx ? this.lame : 0;   // đau chân thì đi khập khiễng theo mức nặng
      // đang chảy máu: rên, thở dốc khá dày, nặng thì dày hơn; đã băng: thỉnh thoảng thở nặng
      if (dt > 0 && this.lame > 0 && (this._voxT -= dt) <= 0) {
        const bleeding = this.bleed > 0.04, bad = this.hp < 40;
        this.world.vox(this, bleeding && Math.random() < (bad ? 0.75 : 0.45) ? 'moan' : 'breath');
        this._voxT = bleeding ? rnd(bad ? 4 : 7, bad ? 8 : 14) : rnd(20, 40);
      }
      this._hpPrev = this.hp;
      this.stepAid(dt);
    }
    // chỗ bị thương: trúng ngực (đạn né được tấm giáp) coi là bắp tay, còn lại là đùi; bên nào theo điểm trúng / điểm nổ / hướng đạn, không rõ thì ngẫu nhiên
    woundSite() {
      const I = this._woundFrom; this._woundFrom = null;
      let d = 0, zone = I && I.zone;
      // đạn xe / mảnh nổ không báo vùng trúng: đạn trúng thẳng tính theo độ cao điểm chạm, mảnh nổ văng khắp người
      if (I && !zone) zone = I.mode === 'blast' ? (Math.random() < 0.3 ? 'chest' : 'hips') : I.y != null ? (I.y - this.y > 9 ? 'chest' : 'hips') : null;
      if (I) {
        const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
        if (I.x != null) d = (I.x - this.x) * rx + (I.z - this.z) * rz;
        else if (I.vel) d = -(I.vel.x * rx + I.vel.z * rz);
      }
      const side = (d || Math.random() - 0.5) < 0 ? 'L' : 'R';
      return (zone === 'chest' || zone === 'arm' ? 'arm' : 'leg') + side;   // vùng trúng thật (segHit): tay -> tay, chân / bụng / hông -> đùi, thân -> bắp tay (chưa có động tác băng ngực)
    }
    // bộ y tế (phím của người chơi): một lượt sơ cứu, băng xong mới hồi máu (stepAid). Đang tự băng dở thì nối vào luôn; bỏ dở thì chưa mất lượt
    useMedkit() {
      const F = this.figure;
      if (!this.alive || !this.canAid()) return false;
      if (F.aidT == null || F.aidT >= SoldierModel.AID_SEQ.wrap) {
        F.aidT = 0;
        F.aidSite = (this._wounds && this._wounds[this._wounds.length - 1]) || F.aidSite || 'legR';
      }
      this._medUse = true; this._aidWait = 0;
      return true;
    }
    // rảnh tay, không ai giục: tự sơ cứu. Không có bộ y tế thì chỉ dừng được chảy máu, máu đã mất không hồi. Có lệnh đi / ngắm / địch là bỏ dở ngay
    canAid() {
      const F = this.figure, I = this.intent, D = I.drive;
      return this.speed < 0.6 && !this.enemy && !this._pendingEnemy && !I.target && !I.aim && !(D && (D.x || D.z)) && !(F.aimBlend > 0.02)
        && !(this.arms.reload > 0) && F.kamiSeq == null && !F.kamiCtl && !F.seated && !F.isDead && this.world.waterDepth(this.x, this.z) < 4;
    }
    stepAid(dt) {
      const F = this.figure, S = SoldierModel.AID_SEQ;
      if (F.aidT != null) {
        if (!this.canAid()) { F.aidT = null; this._aidWait = 0; this._medUse = false; return; }
        const t0 = F.aidT, t1 = F.aidT = t0 + dt;
        if (t0 < S.jab && t1 >= S.jab) { this.bleed *= 0.5; this.world.vox(this, 'hiss'); }     // thuốc cầm máu
        if (t0 < S.tie && t1 >= S.tie) this.world.vox(this, 'hiss');                            // siết nút băng
        if (t0 < S.wrap && t1 >= S.wrap && this._medUse) {                                      // bộ y tế: cầm hẳn máu, bớt khập khiễng, hồi máu (trận thật hồi vào đơn vị mạng)
          this._medUse = false;
          this._wounds = []; this.bleed = 0; this._medDone = true; this.armHurt = 0;
          if (this.world.onMedkit) this.world.onMedkit(this);
          else this.hp = 100;
          this._hpPrev = this.hp;
        } else if (t0 < S.wrap && t1 >= S.wrap) {                                               // băng xong: còn vết khác thì giảm theo số vết, hết vết thì hết chảy
          const W = this._wounds, i = W.indexOf(F.aidSite); if (i >= 0) W.splice(i, 1);
          if (F.aidSite && F.aidSite[0] === 'a') this.armHurt = (this.armHurt || 0) * 0.5;   // băng tay: bớt run
          this.bleed *= W.length / (W.length + 1);
        }
        for (const e of SoldierModel.AID_SFX) if (t0 < e[0] && t1 >= e[0]) this.world.sfx(this, e[1]);
        if (t1 >= S.end) F.aidT = null;
        return;
      }
      if (!this._wounds || !this._wounds.length || dt <= 0) return;
      this._aidWait = this.canAid() ? (this._aidWait || 0) + dt : 0;
      if (this._aidWait >= 1.5) { F.aidT = 0; F.aidSite = this._wounds[this._wounds.length - 1]; this._aidWait = 0; }
    }
    revive(x, z, heading) {
      this.alive = true;
      this.hp = 100; this._hpPrev = 100; this.bleed = 0; this.lame = 0; this._medUse = false;
      SoldierModel.setCasualty(this.figure, false);
      this._wounds = []; this._aidWait = 0; this.figure.limpSx = 0; SoldierModel.aidReset(this.figure, true);
      this._death = null; this._gone = false; this.root.visible = true;
      if (x != null) this.x = x;
      if (z != null) this.z = z;
      if (heading != null) this.heading = heading;
      this.y = this.world.groundAt(this.x, this.z, null);
      this.speed = 0;
      this.turnNow = 0; this.turnSigned = 0; this._turnVel = 0;
      this.enemy = null;
      this._seen = 0;
      this.initArms();
      this.root.rotation.set(0, this.heading, 0);
      this.applyTransform();
    }
    // info: { mode: 'fall' gục tại chỗ | 'blast' bị sức nổ hất | 'pierce' đạn xuyên đẩy ngã | 'direct' trúng thẳng đạn nổ, không còn xác | 'crush' xe cán,
    //         x, y, z điểm nổ, power sức nổ tới người (phần máu), vel hướng đạn }
    kill(src, info = {}) {
      this.alive = false; this.enemy = null;
      this.figure.kamiSeq = null; this.figure.kamiCtl = false;
      SoldierModel.aidReset(this.figure, false);
      if (info.mode !== 'direct') this.world.vox(this, 'death');   // trúng thẳng đạn nổ: không kịp phát ra tiếng
      if (this.squad) this.squad.onDeath(this);
      this.speed = 0;
      this.startDeath(info);
    }
    startDeath(info) {
      const F = this.figure, g = 78.4, off = info.rideFall;
      if (off) { this.x = off.x; this.y = off.y; this.z = off.z; }
      let mode = info.mode || 'fall', vx = 0, vz = 0, vy = 0;
      if (mode === 'blast') {
        const dx = this.x - info.x, dz = this.z - info.z, d = Math.hypot(dx, dz) || 1, p = Math.min(3.5, info.power || 1);
        if (p < 0.45) mode = 'fall';            // mảnh văng xa, sức ép không đủ hất: gục tại chỗ
        else { const h = Math.min(100, 14 + 22 * p); vx = dx / d * h; vz = dz / d * h; vy = Math.min(70, 16 + 15 * p); }
      } else if (mode === 'direct') {
        const dx = info.vel ? info.vel.x : -Math.sin(this.heading), dz = info.vel ? info.vel.z : -Math.cos(this.heading), d = Math.hypot(dx, dz) || 1;
        vx = dx / d * 110; vz = dz / d * 110; vy = 70;
      } else if (mode === 'pierce') {
        const dx = info.vel ? info.vel.x : -Math.sin(this.heading), dz = info.vel ? info.vel.z : -Math.cos(this.heading), d = Math.hypot(dx, dz) || 1;
        vx = dx / d * 34; vz = dz / d * 34; vy = 12;
      }
      const gy0 = off ? this.world.groundAt(this.x, this.z, null) : 0;
      if (off && mode === 'fall' && this.y - gy0 > 2) mode = 'topple';   // gục trên xe: đổ khỏi xe, không gục lơ lửng
      if (mode === 'fall' || mode === 'crush') {
        // tư thế nằm cuối đặt ngay, thân đổ từ đứng xuống trong ~0,5 s (xe cán thì nằm luôn)
        const R = this.root, yaw = this.heading;
        R.rotation.set(0, yaw, 0); R.position.set(this.x, this.y - SoldierModel.FOOT_Y * this.k, this.z);
        SoldierModel.setCasualty(F, true);
        if (mode === 'crush') return;
        if (F._bloodPool) F._bloodPool.visible = false;
        this._death = { mode, t: 0, p1: R.position.clone(), rx: R.rotation.x, rz: R.rotation.z, p0: new THREE.Vector3(this.x, this.y - SoldierModel.FOOT_Y * this.k, this.z), yaw, T: 0.5 + Math.random() * 0.15 };
        this.stepDeath(0);
        return;
      }
      // bay: mặt quay theo hướng bị hất, lộn đúng góc để chạm đất ở tư thế sấp
      const up = off ? Math.max(8 * this.k, this.y - (SoldierModel.FOOT_Y + 2.2) * this.k - gy0) : 8 * this.k, T = (vy + Math.sqrt(vy * vy + 2 * g * up)) / g;
      if (off) {
        // rơi từ xe: điểm tiếp đất còn trong thân xe thì đẩy ra mép gần nhất (tính trong hệ thân xe, chưa cộng đà xe)
        const O = off.ob, tx = this.x - O.cx, tz = this.z - O.cz, lu = tx * O.ux + tz * O.uz, lv = -tx * O.uz + tz * O.ux;
        const vv = -vx * O.uz + vz * O.ux, eu = lu + (vx * O.ux + vz * O.uz) * T, ev = lv + vv * T, edge = O.hu + 4;
        if (Math.abs(eu) < edge && Math.abs(ev) < O.hv + 4) {
          const vu = ((eu < 0 ? -edge : edge) - lu) / T;
          vx = vu * O.ux - vv * O.uz; vz = vu * O.uz + vv * O.ux;
        }
      }
      const yaw = vx || vz ? Math.atan2(-vx, -vz) : this.heading;
      if (off) { vx += off.vx; vz += off.vz; }
      const turns = mode === 'pierce' ? 0 : vy > 45 ? 1 : 0;
      this.heading = yaw;
      this._death = { mode, t: 0, vx, vy, vz, g, yaw, spin: -(Math.PI / 2 + turns * Math.PI * 2) / T, roll: (Math.random() - 0.5) * 2.4, cy: this.y - SoldierModel.FOOT_Y * this.k, hideAt: mode === 'direct' ? 0.22 : Infinity };
      this.stepDeath(0);
    }
    stepDeath(dt) {
      const D = this._death, R = this.root, F = this.figure;
      if (!D) return;
      D.t += dt;
      if (D.p1) {
        const k = Math.min(1, D.t / D.T), e = k * k;
        R.position.lerpVectors(D.p0, D.p1, e);
        R.rotation.set(D.rx * e, D.yaw, D.rz * e, 'YXZ');
        if (k >= 1) { if (F._bloodPool) F._bloodPool.visible = true; this._death = null; }
        return;
      }
      // đang bay: tay chân vung theo đà
      D.vy -= D.g * dt;
      const nx = this.x + D.vx * dt, nz = this.z + D.vz * dt, T = this.world.terrain;
      const wall = dt > 0 && T && T.resolveVehicleCollision && D.cy < this.world.groundAt(nx, nz, null) + 40 && T.resolveVehicleCollision(this.x, this.z, nx, nz, 1, null).hit;
      if (wall) { D.vx *= -0.15; D.vz *= -0.15; } else { this.x = nx; this.z = nz; }
      D.cy += D.vy * dt;
      R.position.set(this.x, D.cy, this.z);
      R.rotation.set(D.spin * D.t, D.yaw, D.roll * Math.sin(D.t * 2.2), 'YXZ');
      if (F.legs) F.legs.forEach((L, i) => { L.leg.rotation.x = 0.5 * Math.sin(D.t * 9 + i * 2.4); L.knee.rotation.x = -0.5 - 0.4 * Math.sin(D.t * 7 + i); });
      if (F.torso) F.torso.rotation.x = -0.25 * Math.sin(D.t * 5);
      if (D.t >= D.hideAt) { this._gone = true; R.visible = false; }   // trúng thẳng đạn nổ: khuất trong quầng lửa, không còn xác
      const gy = this.world.groundAt(this.x, this.z, null);
      if (D.vy < 0 && D.cy - 2.2 * this.k <= gy) {
        this._death = null;
        this.y = gy;
        if (this._gone) return;
        R.rotation.set(0, this.heading, 0); R.position.set(this.x, this.y - SoldierModel.FOOT_Y * this.k, this.z);
        if (F.legs) F.legs.forEach(L => { L.leg.rotation.set(0, 0, 0); L.knee.rotation.set(0, 0, 0); });
        SoldierModel.setCasualty(F, true);
      }
    }

    // ----- BỘ MÁY DI CHUYỂN -----
    update(dt, animate = true) {
      if (!this.alive) return;
      this.stepWound(dt);
      if (!this.alive) return;
      if (this.arms.def.rocket) this.figure.rpgEmpty = this.arms.mag <= 0;
      if (this.ride) { this.stepRide(dt, animate); return; }
      this.combat(dt);
      for (let i = this._orders.length - 1; i >= 0; i--) { const o = this._orders[i]; if ((o.t -= dt) <= 0) { this._orders.splice(i, 1); o.fn(); } }
      const W = this.world, I = this.intent;
      // 1. điểm cần tới lúc này
      let goal = null;
      if (I.path && I.path.length) {
        goal = I.path[0];
        if (Math.hypot(goal.x - this.x, goal.z - this.z) < CFG.arrive * 1.6 && I.path.length > 1) { I.path.shift(); goal = I.path[0]; }
      } else if (I.target) goal = I.target;
      let wantSpeed = 0, wantHeading = this.heading, mvX = null, mvZ = null;
      const D = I.drive;
      if (D) {
        if (D.x || D.z) { mvX = D.x; mvZ = D.z; wantSpeed = (GS()[D.gait] || GS().walk) * this.k * (D.mul || 1); wantHeading = Math.atan2(-D.x, -D.z); }
        if (D.face != null) wantHeading = D.face;
      } else if (goal) {
        const dx = goal.x - this.x, dz = goal.z - this.z, d = Math.hypot(dx, dz);
        const last = !I.path || I.path.length <= 1;
        if (last && d < CFG.arrive) { this.stop(); }
        else {
          wantHeading = Math.atan2(-dx, -dz);
          wantSpeed = (GS()[I.gait] || GS().walk) * this.k * (I.speedMul || 1);
          if (last) wantSpeed *= Math.max(0.4, Math.min(1, d / 20));      // giảm tốc khi gần đích
          // men tường: đang bị chặn thẳng hướng -> lệch sang một bên tới khi thoát
          if (this._wallT > 0) { this._wallT -= dt; wantHeading += this._wall; }
        }
      } else if (I.aim) wantHeading = Math.atan2(-(I.aim.x - this.x), -(I.aim.z - this.z));
      else if (I.face != null) wantHeading = I.face;
      // 2. quay người có giới hạn; lệch nhiều thì chậm lại để xoay trước rồi mới bước tiếp
      const runTurn = wantSpeed > 14, maxTurn = runTurn ? CFG.turnRun : wantSpeed > 0 ? CFG.turnWalk : CFG.turnIdle;
      const dh = angDiff(this.heading, wantHeading), turnAccel = runTurn ? CFG.turnAccelRun : CFG.turnAccel;
      // Vận tốc hãm theo quãng góc còn lại: root giảm tốc trước đích thay vì tới đúng góc
      // rồi đặt omega = 0 trong một khung.
      const stopRate = 0.85 * Math.sqrt(2 * turnAccel * Math.abs(dh)), wantTurn = Math.sign(dh) * Math.min(maxTurn, Math.abs(dh) * 8, stopRate);
      const turnA = turnAccel * dt, dv = wantTurn - (this._turnVel || 0);
      this._turnVel = (this._turnVel || 0) + Math.max(-turnA, Math.min(turnA, dv));
      let applied = this._turnVel * dt;
      if (applied * dh < 0) applied = 0;   // đổi ý quay ngược bên: hãm vận tốc cũ trước, tuyệt đối không giật thẳng tới góc mới
      else if (Math.abs(applied) >= Math.abs(dh)) { applied = dh; this._turnVel = 0; }
      this.heading += applied;
      this.turnSigned = applied / Math.max(1e-4, dt);   // nghiêng cua theo góc đã quay thật, không theo omega còn đang bị hãm nội bộ
      this.turnNow = Math.abs(this.turnSigned);
      if (mvX === null || (D && D.face == null)) wantSpeed *= Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(dh) * 1.3)));
      if (mvX === null) { mvX = this.forwardX; mvZ = this.forwardZ; }
      // 3. địa hình: dốc lên chậm, xuống hơi chậm, nước lội chậm
      if (wantSpeed > 0) {
        const fx = mvX, fz = mvZ;
        const h0 = W.groundAt(this.x, this.z, this.y), h1 = W.groundAt(this.x + fx * 4, this.z + fz * 4, this.y);
        const grade = this._grade = (h1 - h0) / 4;
        wantSpeed *= grade > 0 ? Math.max(0.3, 1 - grade * 0.85) : Math.max(0.7, 1 + grade * 0.35);
        const wd = W.waterDepth(this.x, this.z);
        if (wd > 0) wantSpeed *= Math.max(0.35, 1 - wd / 12);
      }
      if (this.figure.kamiSeq != null || this.figure.kamiCtl) wantSpeed = 0;
      // đang nằm bắn: đứng dậy xong mới đi được
      if (this.arms.def.prone && (this.figure._proneK || 0) > 0.05) wantSpeed = 0;
      // súng khác: đang nằm xuống / đứng dậy thì đứng yên, nằm hẳn rồi thì bò
      else if ((this.figure._proneK || 0) > 0.05) wantSpeed = this.intent.stance === 'prone' && this.figure._proneK > 0.95 ? Math.min(wantSpeed, CFG.crawl * this.k) : 0;
      const lm = this.loadMul;
      wantSpeed *= lm;
      this.figure.gaitRate = lm;   // sải chân nhanh / chậm theo tốc độ, chân khỏi trượt trên đất
      if (this.arms.def.maxSpeed) wantSpeed = Math.min(wantSpeed, this.arms.def.maxSpeed * this.k);
      // bị thương: không chạy được, chỉ lê bước (nặng thì càng chậm)
      if (this.lame > 0) wantSpeed = Math.min(wantSpeed, GS().walk * (1.05 - 0.45 * this.lame) * this.k);
      // thể lực: kiệt sức thì chỉ đi bộ; đuối dần (dưới 50%) thì chạy chậm lại
      if (wantSpeed > 0) {
        const walkV = GS().walk * this.k * lm;
        if (this.tired) wantSpeed = Math.min(wantSpeed, walkV);
        else if (this.stam < 0.5 && wantSpeed > walkV) wantSpeed = walkV + (wantSpeed - walkV) * (0.55 + 0.9 * this.stam);
      }
      // 4. tăng / giảm tốc
      const a = wantSpeed > this.speed ? CFG.accel : CFG.decel, v0 = this.speed;
      this.speed += Math.max(-a * dt, Math.min(a * dt, wantSpeed - this.speed));
      if (this.speed < 0.05 && wantSpeed === 0) this.speed = 0;
      const px0 = this.x, pz0 = this.z;
      // 5. bước + va chạm
      if (this.speed > 0) {
        const step = this.speed * dt * (this.figure.limp ? this.figure._lpWarp || 1 : 1);
        let nx = this.x + mvX * step, nz = this.z + mvZ * step;
        const p = W.collide(this, this.x, this.z, nx, nz);
        nx = p.x; nz = p.z;
        const gN = W.groundAt(nx, nz, this.y), gC = W.groundAt(this.x, this.z, this.y);
        const moved = Math.hypot(nx - this.x, nz - this.z);
        const ok = !(moved > 1e-3 && (gN - gC) / moved > CFG.climbMax && gN - gC > CFG.stepUp) && W.waterDepth(nx, nz) <= CFG.wadeMax;
        if (ok) { this.x = nx; this.z = nz; }
        const real = (ok ? moved : 0) / Math.max(1e-4, dt);
        // bị chặn thẳng: chọn phía men theo tường (phía vật cản đẩy ra) trong ~0,9 s
        if (goal && real < 0.4 * this.speed && this._wallT <= 0) {
          const sx = p.x - (this.x + this.forwardX * step), sz = p.z - (this.z + this.forwardZ * step);
          const side = (-this.forwardZ * sx + this.forwardX * sz) >= 0 ? -1 : 1;
          this._wall = side * 1.1; this._wallT = 0.9;
        }
        this.speed = Math.min(this.speed, real + 0.5);
        // 6. kẹt lâu: dựng đường vòng trên lưới mịn bộ binh
        this._prog.t += dt; this._prog.d += real * dt;
        if (this._prog.t > CFG.stuckTime) {
          if (goal && this._prog.d < 0.4 * Math.min(GS()[I.gait] || 9, this.arms.def.maxSpeed || 99) * this._prog.t) this.replan();
          this._prog.t = 0; this._prog.d = 0;
        }
      } else { this._prog.t = 0; this._prog.d = 0; }
      // độ hãm cho động tác phanh (0..1): theo mức giảm tốc, nhân đà sẵn có (hãm từ chạy mạnh hơn từ đi bộ). Tính sau va chạm để đâm tường cũng tính;
      // cú đâm chỉ mất tốc độ trong 1 khung nên giữ tín hiệu thêm một lúc, kẻo động tác chưa kịp hiện đã hết
      const lost = v0 - this.speed, runV = GS().run * this.k, dec = dt > 0 ? lost / dt : 0;
      if (lost > CFG.decel * dt * 1.5) { this._bkAmt = Math.min(1, (this._bkHold > 0 ? this._bkAmt : 0) + lost / runV); this._bkHold = 0.3 * this._bkAmt; }   // cộng dồn: cú đâm thường trải 2 khung
      else this._bkHold = Math.max(0, (this._bkHold || 0) - dt);
      const F_ = this.figure, fwd = mvX * this.forwardX + mvZ * this.forwardZ;
      F_.brake = Math.max(dec > 1 ? Math.min(1, dec / CFG.decel) * Math.min(1, v0 / runV) : 0, this._bkHold > 0 ? this._bkAmt : 0);
      F_.surge = this.speed > v0 + 1e-4 ? Math.min(1, (this.speed - v0) / Math.max(1e-4, dt) / CFG.accel) * Math.min(1, wantSpeed / runV) : 0;
      F_.bank = Math.max(-1, Math.min(1, this.speed * (this.turnSigned || 0) / 40));   // v.omega / 40 đv/s^2 ~ lực văng so với trọng lực
      // dữ liệu cho bước dừng: chỉ khi tiến về trước, không áp dụng lúc quỳ; moveV theo quãng đường thật (this.speed sát tường vẫn còn 0,5 dù đứng yên)
      F_.wantStop = I.stance !== 'kneel' && (wantSpeed === 0 || this._bkHold > 0);
      F_.moveV = dt > 0 ? ((this.x - px0) * this.forwardX + (this.z - pz0) * this.forwardZ) / dt / this.k : 0; F_.stopFrom = v0 * fwd / this.k; F_.stopA = CFG.decel / this.k; F_.stopTo = I.aim ? 'aim' : 'idle';
      // 7. bám mặt đất
      const g = W.groundAt(this.x, this.z, this.y);
      this.y += (g - this.y) * Math.min(1, dt * 18);
      this.applyTransform();
      // 8. hướng canh: thân + đầu + súng đảo quanh hướng được giao (đi tuần mạnh, đi bộ vừa, chạy thì nhìn thẳng)
      const scanK = !I.scan || this.figure.aidT != null ? 0 : this.motion === 'patrol' ? 1 : this.motion === 'walk' ? 0.6 : this.motion === 'run' ? 0 : 0.8;
      const t = this.animT;
      const ly = scanK * (I.sector * 0.75 + this.scanAmp * Math.sin(t * this.scanFreq + this.scanPh) * (0.6 + 0.4 * Math.sin(t * 0.21 + this.id)));
      this.lookYaw += (Math.max(-1.1, Math.min(1.1, ly)) - this.lookYaw) * Math.min(1, dt * 2.5);
      this.figure.lookYaw = this.lookYaw;
      if (this.figure.grime) SoldierModel.updateGrime(this.figure, dt, { depth: W.waterDepth(this.x, this.z), speed: this.speed });   // lội nước, nằm, quỳ, đi lâu -> ướt, bẩn dần
      // 9. động tác: nhịp bước chạy theo tốc độ thực (chia cỡ người) -> bàn chân không trượt
      // hướng bước so với mặt (+ = sang phải) theo quãng đường thật: model xoay hông, đặt bàn chân đi ngang / chéo / lùi
      { const ex = this.x - px0, ez = this.z - pz0, h = this.heading + (F_._bodyB || 0);   // gốc còn xoay do đứng chờ thì chân vẫn bước đúng hướng đi
        F_.moveDir = this.speed / this.k > 0.6 && Math.hypot(ex, ez) > 1e-5 ? Math.atan2(ex * Math.cos(h) - ez * Math.sin(h), -ex * Math.sin(h) - ez * Math.cos(h)) : null; }
      F_.footLock = true; F_.idleTurn = !D && !I.target && !I.path && !I.aim && !this.enemy;   // chỉ khi rảnh thật; lính người chơi điều khiển không tự xoay người
      this.pickMotion();
      F_.inPlace = this._turnStep;
      const base = GS()[this.motion];
      const rate = this._turnStep ? 0.85 : base ? Math.max(0.35, this.speed / (base * this.k)) : 1;
      this.animT += dt * rate;
      if (!D) this.stepGunAI(dt);
      F_.prone = I.stance === 'prone' && !this.ride;
      // súng bắn tỉa nặng và dài: ngoài lúc ngắm / nạp thì đeo sau lưng, không vác trên vai suốt
      if (this.arms.def.prone) { const St = F_.atrState; F_.stow = !(I.aim || (D && (F_.aimBlend || 0) > 0.02) || (F_._proneK || 0) > 0.05 || this._death || (St && St.t != null) || this.cycling); }
      // không có địch một lúc: hạ súng thả lỏng (chạy thì vẫn ôm súng chéo ngực)
      else if (!this.arms.def.kami) {
        const A = this.arms, busy = I.aim || this.enemy || (D && (F_.aimBlend || 0) > 0.02) || A.reload > 0 || (F_.glState && F_.glState.k > 0) || (F_.magState && F_.magState.t != null);
        this._calmT = busy ? 0 : (this._calmT || 0) + dt;
        F_.relax = this._calmT > CFG.calmAfter && this.motion !== 'run';
        F_.kneelRest = F_.relax && I.stance === 'kneel';   // quỳ canh mà yên ắng: hạ súng thế sẵn sàng, ngó quanh
      }
      this.stepStamina(dt);
      this.stepGroundIK(dt);   // trước khi dựng dáng: cùng khung với độ cao gốc người mới, không trễ một khung
      {
        const F = this.figure, fat = 1 - this.stam;
        const rest = fat > 0.6 && this.speed < 0.6 && !I.aim && (F.aimBlend || 0) < 0.3 && !(this.arms.reload > 0) && I.stance !== 'kneel'
          && !((F._proneK || 0) > 0.05) && F.kamiSeq == null && !F.kamiCtl && !this.ride;
        F.slump = (F.slump || 0) + ((rest ? Math.min(1, (fat - 0.6) / 0.3) : 0) - (F.slump || 0)) * Math.min(1, dt * (rest ? 2 : 6));
        if (F.slump < 0.005) F.slump = 0;
      }
      if (animate) {
        SoldierModel.animateMotion(this.figure, this.motion, this.animT, 1);
        // thở dốc: ngực phập phồng nhanh và sâu theo mức mệt
        const fat = 1 - this.stam;
        if (fat > 0.2 && this.alive) SoldierModel.applyBreathing(this.figure, this.animT, 4 + 4 * fat, 0.025 + 0.09 * (fat - 0.2));
        if (I.aim && this.speed < 0.6 && this.motion !== 'aim' && this.motion !== 'crouch') SoldierModel.lookAt(this.figure, new THREE.Vector3(I.aim.x, I.aim.y, I.aim.z));
      }
      if (this.arms.def.kami) this.stepKami(dt);
      // bước chân: mỗi nửa chu kỳ sải là một lần chạm đất
      const ph = Math.floor((this.figure._ph || 0) * 2);
      if (ph !== this._stepPh) { if (this._stepPh != null && this.speed > 1 && this.alive && !this.ride && !((this.figure._proneK || 0) > 0.3)) this.world.step(this); this._stepPh = ph; }
    }

    stepStamina(dt) {
      if (!(dt > 0) || !this.alive) return;
      const G = GS(), v = this.speed / this.k, kg = this.loadKg, heavy = LOAD.base / Math.max(4, kg);
      const runK = Math.max(0, Math.min(1, (v - G.walk * 1.05) / (G.run - G.walk)));
      const up = Math.max(0, this._grade || 0);
      let d;
      if (runK > 0.02) d = -runK * (1 + up * STAM.uphill) / (STAM.endure * Math.pow(heavy, STAM.pow));
      else if (v > 0.6 && up > 0.15 && kg > 14) d = -up * (kg - 14) / 400;
      else {
        const low = this.intent.stance === 'kneel' || (this.figure._proneK || 0) > 0.5;
        d = Math.pow(heavy, STAM.recPow) / (v > 0.6 ? STAM.walk : low ? STAM.low : STAM.rest);
        if (this.bleed > 0.04) d *= 0.5;   // mất máu hồi sức chậm
      }
      this.stam = Math.max(0, Math.min(1, this.stam + d * dt));
      if (this.stam <= STAM.tired) this.tired = true; else if (this.tired && this.stam > STAM.back) this.tired = false;
      // tiếng thở dốc (chỉ người ở gần mới nghe: vox tự cắt ngoài ~40 m); vết thương đã có tiếng rên / thở riêng
      const fat = 1 - this.stam;
      if (fat > 0.35 && !(this.lame > 0) && (this._pantT -= dt) <= 0) {
        this.world.vox(this, fat > 0.75 ? 'pantHard' : 'pant');
        this._pantT = fat > 0.75 ? rnd(1.9, 2.3) : rnd(2.6, 3.6);
      }
    }
    // mặt đất dưới từng bàn chân (mép vỉa hè, bậc, sườn dốc) cho SoldierModel.groundFeet; chỉ lính gần camera
    stepGroundIK(dt) {
      const F = this.figure, C = this.world.camera;
      const near = this.alive && !this.ride && (!F.lod || F.lod.cur === 0) && (!C || Math.hypot(this.x - C.position.x, this.z - C.position.z) < 480);
      if (!near) { F.groundIK = null; return; }
      const g = F.groundIK || (F.groundIK = [0, 0]), k = Math.min(1, dt * 14);
      F.legs.forEach((L, i) => {
        // dò gót, bàn, mũi giày (hệ cổ chân, mũi về -z): phần nào của bàn chân nằm trên bậc thì chân đặt theo phần đó, không xuyên qua
        const m = L.ankle.matrixWorld.elements, refY = this.y + 4 * this.k;
        let top = -Infinity;
        for (const fz of FOOT_Z) top = Math.max(top, this.world.groundAt(m[12] + m[8] * fz, m[14] + m[10] * fz, refY));
        // cao / thấp hơn ~40 cm thì là tường / hẫng, không gập hay với chân tới được
        const off = Math.max(-3.4, Math.min(2.6, (top - this.y) / this.k));
        // Nâng trong ~45 ms và giới hạn bước sửa mỗi frame: đủ nhanh để không xuyên bậc rõ,
        // nhưng không teleport cả hông khi đúng một mẫu gót/mũi vừa chạm mép cao.
        const rise = 1 - Math.exp(-dt / 0.045), gain = F._snap ? 1 : off > g[i] ? rise : k;
        let dg = (off - g[i]) * gain;
        if (!F._snap && dg > 0) dg = Math.min(dg, Math.max(0.18, dt * 22));
        g[i] += dg;
      });
    }
    restStamina() { this.stam = 1; this.tired = false; this._pantT = 0; }

    // lính AI: tự giật súng, nòng ngóc theo cự ly (người chơi do Controller đặt)
    stepGunAI(dt) {
      const I = this.intent;
      this._recoil = Math.max(0, (this._recoil || 0) - dt * (this.arms.def.seq ? 2.2 : 7));
      this.figure.recoil = this._recoil;
      let el = 0;
      if (I.aim && this.speed < 0.6) {
        const ey = this.y + 11 * this.k;
        el = this.arms.def.ball ? lob({ x: this.x, y: ey, z: this.z }, I.aim, this.arms.def.ball).elev : Math.atan2(I.aim.y - ey, Math.hypot(I.aim.x - this.x, I.aim.z - this.z));
      }
      this.figure.aimPitch = (this.figure.aimPitch || 0) + (el - (this.figure.aimPitch || 0)) * Math.min(1, dt * 5);
    }

    // đi nhờ xe (this.ride do InfantryMatch quản, vị trí + hướng đặt ở placeRider): ngồi yên; ngắm / bắn thì quỳ trên sàn xe và xoay theo hướng bắn
    stepRide(dt, animate) {
      const R = this.ride, I = this.intent, D = I.drive, F = this.figure, A = this.arms;
      this.combat(dt);
      for (let i = this._orders.length - 1; i >= 0; i--) { const o = this._orders[i]; if ((o.t -= dt) <= 0) { this._orders.splice(i, 1); o.fn(); } }
      const on = !R.inside && R.k >= 1 && R.dir > 0 && !(R.duck > 0.05), aiming = on && !!(I.aim || (D && (F.aimBlend || 0) > 0.02));
      const vh = R.v.bodyAngle || 0;
      const want = R.face != null ? R.face : aiming ? (I.aim ? Math.atan2(-(I.aim.x - this.x), -(I.aim.z - this.z)) : D.face != null ? D.face : this.heading) - vh : R.seat.h;
      const turn = (on || R.duck > 0 ? CFG.turnIdle : 11) * dt, dh = angDiff(R.rel, want), applied = Math.max(-turn, Math.min(turn, dh));
      R.rel += applied;
      this.turnNow = Math.abs(applied) / Math.max(1e-4, dt); this.turnSigned = 0;
      this.speed = 0;
      F.seated = !!R.sit && !aiming;
      F.stow = !aiming;   // ngồi / trèo: súng đeo sau lưng, tay rảnh
      // quán tính theo xe (quy về hướng lính đang ngồi): xe tăng tốc thì ngả ngược, phanh thì đổ tới, ôm cua thì văng ra ngoài
      const vs = R.v.speed || 0, ka = dt > 0 ? (vs - (R.pv === undefined ? vs : R.pv)) / dt : 0, kl = dt > 0 ? vs * angDiff(R.pa === undefined ? vh : R.pa, vh) / dt : 0, sm = Math.min(1, dt * 4);
      R.pv = vs; R.pa = vh;
      R.fa = (R.fa || 0) + (ka * Math.cos(R.rel) + kl * Math.sin(R.rel) - (R.fa || 0)) * sm;
      R.fl = (R.fl || 0) + (-ka * Math.sin(R.rel) + kl * Math.cos(R.rel) - (R.fl || 0)) * sm;
      const lean = F.seated ? 1 : 0;
      F.brake = lean * Math.max(0, Math.min(0.25, R.fa / 150)); F.surge = lean * Math.max(0, Math.min(0.6, -R.fa / 150)); F.bank = lean * Math.max(-0.6, Math.min(0.6, -R.fl / 80));
      F.wantStop = false; F.moveV = 0; F.stopFrom = 0; F.moveDir = null; F.footLock = false; F.inPlace = false; F.kneelRest = false;
      this.motion = R.walk ? 'walk' : aiming ? 'crouch' : 'idle';
      this._turnStep = false;
      this.animT += dt;
      if (!D) this.stepGunAI(dt);
      if (animate) {
        SoldierModel.animateMotion(F, this.motion, this.animT, 1);
        if (I.aim && this.motion !== 'crouch') SoldierModel.lookAt(F, new THREE.Vector3(I.aim.x, I.aim.y, I.aim.z));
      }
    }

    pickMotion() {
      const I = this.intent, s = this.speed / this.k, G = GS();
      // quay tại chỗ: chân dậm theo (không xoay như bàn xoay) khi quay nhanh hoặc hông đã lệch xa thân trên; dậm tới khi chân gần bắt kịp
      const lag = Math.abs(this.figure._legLag || 0);
      this._turnStep = s < 0.6 && I.stance !== 'kneel' && (this.turnNow > 0.9 || lag > 0.45 || (this._turnStep && lag > 0.08));
      if (this._turnStep) this.motion = I.gait === 'patrol' ? 'patrol' : 'walk';
      else if (s < 0.6) this.motion = I.stance === 'kneel' ? 'crouch' : I.aim ? 'aim' : 'idle';
      else {
        const mid = (G.walk + G.run) * 0.5, on = mid + 0.7, off = mid - 0.7;
        this._runMotion = this._runMotion ? s > off : s > on;   // hysteresis: tốc độ dao động quanh ngưỡng không đổi walk/run mỗi khung
        if (this._runMotion) this.motion = 'run';
        else this.motion = I.gait === 'patrol' ? 'patrol' : 'walk';
      }
    }

    replan() {
      const I = this.intent, dst = I.target;
      if (!dst) return;
      const path = this.world.findPath(this.x, this.z, dst.x, dst.z);
      if (path && path.length) { I.path = path; this._wallT = 0; }
    }

    applyTransform() {
      if (!this.alive) return;   // xác: giữ tư thế ngã
      this.root.position.set(this.x, this.y - SoldierModel.FOOT_Y * this.k, this.z);
      this.root.rotation.y = this.heading + (this.figure._bodyB || 0);   // _bodyB: đứng chờ xoay người nhìn quanh (scanIdle), chỉ là hình
    }

    dispose() {
      this.alive = false;
      this._death = null;
      if (this.figure._bloodPool && this.figure._bloodPool.parent) this.figure._bloodPool.parent.remove(this.figure._bloodPool);
      this.world.scene.remove(this.root);
      this.root.traverse(o => { if (o.isSkinnedMesh && !o.geometry.userData.shared) o.geometry.dispose(); });   // lưới mẫu dùng chung giữa các lính
    }
  }

  // ---------- TỔ: đội hình, hướng canh, dừng thì quỳ cảnh giới ----------
  // vị trí (mét, hệ người dẫn: x phải, z sau) + hướng canh (độ, + = trái) — tổ bộ binh thật mỗi người một khu vực quan sát
  const FORMATIONS = {
    wedge: [[0, 0, 0], [-4, 4, 55], [4, 4, -55], [-8, 8, 95], [8, 8, -95], [-12, 12, 130], [12, 12, -130], [0, 10, 180]],
    column: [[0, 0, 0], [0, 5, 60], [0, 10, -60], [0, 15, 90], [0, 20, -90], [0, 25, 120], [0, 30, -120], [0, 35, 180]],
    line: [[0, 0, 0], [-5, 0, 25], [5, 0, -25], [-10, 0, 45], [10, 0, -45], [-15, 0, 60], [15, 0, -60], [-20, 0, 75]]
  };
  class Squad {
    constructor(world, members, formation = 'wedge') {
      this.world = world; this.members = members; this.formation = formation;
      this.leader = members[0]; this._t = 0; this.halted = true; this._haltT = 0; this.gait = 'walk';
      this.selected = new Set(members);          // đang chọn để ra lệnh (mặc định cả tổ)
      for (const m of members) { m.squad = this; m.detached = false; }
      this.assignSectors();
    }
    // ----- CHỌN & RA LỆNH: cả tổ hoặc từng người -----
    alive() { return this.members.filter(m => m.alive); }
    select(which) {
      // 'all' | chỉ số (0-based) | mảng chỉ số
      const A = this.members;
      this.selected = new Set(which === 'all' ? A.filter(m => m.alive) : [].concat(which).map(i => A[i]).filter(m => m && m.alive));
      return [...this.selected];
    }
    get allSelected() { return this.alive().every(m => this.selected.has(m)); }
    // đi tới điểm: chọn cả tổ -> đi theo đội hình; chọn từng người -> những người đó tách ra đi riêng, toả quanh điểm đích
    cmdMove(x, z, gait = this.gait) {
      if (this.allSelected) { for (const m of this.members) m.detached = false; return this.moveTo(x, z, gait); }
      const L = [...this.selected], n = L.length;
      L.forEach((m, i) => {
        m.detached = true; m.disengage(false);
        const a = n > 1 ? i / n * Math.PI * 2 : 0, r = n > 1 ? 14 : 0;
        m.moveTo(x + Math.cos(a) * r, z + Math.sin(a) * r, gait, m.react * 0.5);
      });
    }
    cmdHold() { for (const m of this.selected) { m.stop(); m.detached = true; } }
    cmdRejoin() { for (const m of this.selected) m.detached = false; this.follow(true); }
    cmdGuard(on) { for (const m of this.selected) m.setGuard(on); }
    cmdStance(st) { for (const m of this.selected) m.setStance(st); }
    // một người thấy địch -> báo cả tổ (đồng đội biết vị trí địch & của nhau)
    contact(t, from) {
      for (const m of this.members) if (m !== from && m.alive && m.guard && !m.enemy) m.order(() => m.engage(t), m.react * 0.6 + 0.2);
    }
    onDeath(m) {
      this.selected.delete(m);
      if (m === this.leader) { const a = this.alive(); if (a.length) this.leader = a[0]; }
    }
    slot(i) { const S = FORMATIONS[this.formation] || FORMATIONS.wedge; return S[i % S.length]; }
    assignSectors() { this.members.forEach((m, i) => m.setSector(this.slot(i)[2] * Math.PI / 180, true)); }
    moveTo(x, z, gait = 'walk') {
      this.gait = gait; this.halted = false; this._haltT = 0; this._secured = false;
      this.leader.moveTo(x, z, gait, 0.05);
      for (const m of this.members) { m.setStance('stand'); m.clearAim(); m.faceTo(null); }
      this._t = 0; this.follow(true);
    }
    setFormation(f) { this.formation = f; this.assignSectors(); this.follow(true); }
    stop() { for (const m of this.members) m.stop(); }
    // Thành viên giữ chỗ trong đội hình: khi người dẫn đang đi, mỗi người đuổi theo điểm phía trước chỗ của mình (không tới
    // nơi rồi đứng chờ -> không đi-dừng-đi giật cục); tụt sau thì bước nhanh hơn / chạy, vượt lên thì bước chậm lại
    follow(force) {
      const L = this.leader, moving = !!L.intent.target;
      const c = Math.cos(L.heading), s = Math.sin(L.heading), fx = L.forwardX, fz = L.forwardZ;
      for (let i = 1; i < this.members.length; i++) {
        const m = this.members[i], o = this.slot(i);
        if (!m.alive || m.detached || m.enemy || m === L) continue;   // đang giao chiến / được lệnh riêng: không kéo về đội hình
        const ox = o[0] * 8, oz = o[1] * 8;
        const px = L.x + ox * c + oz * s, pz = L.z - ox * s + oz * c;     // chỗ trong đội hình lúc này
        if (moving) {
          const behind = (px - m.x) * fx + (pz - m.z) * fz;                // > 0: đang tụt sau chỗ của mình
          const lead = Math.max(24, L.speed * 2.2);
          const tx = px + fx * lead, tz = pz + fz * lead;
          const gait = behind > 70 ? 'run' : this.gait;
          const mul = Math.max(0.55, Math.min(1.4, 1 + behind / 45));
          if (force || !m.intent.target || Math.hypot(m.intent.target.x - tx, m.intent.target.z - tz) > 6 || m.intent.gait !== gait) m.moveTo(tx, tz, gait, force ? m.react : 0);
          m.intent.speedMul = gait === 'run' ? 1 : mul;
        } else {
          m.intent.speedMul = 1;
          const d = Math.hypot(px - m.x, pz - m.z);
          if (force || (!this.halted && d > CFG.arrive && !m.intent.target)) m.moveTo(px, pz, d > 70 ? 'run' : this.gait, force ? m.react : 0);
          else if (m.intent.target && Math.hypot(m.intent.target.x - px, m.intent.target.z - pz) > 6) m.moveTo(px, pz, m.intent.gait, 0);
        }
      }
    }
    update(dt) {
      this._t += dt;
      if (this._t > 0.25 && !this.halted) { this._t = 0; this.follow(false); }
      // cả tổ đã đứng yên -> lần lượt quỳ xuống, quay mặt ra hướng canh của mình (cảnh giới vòng tròn quanh tổ)
      // (lệnh còn đang chờ phản xạ = chưa đứng yên: trước đây cờ dừng bật ngay lúc vừa ra lệnh -> tổ thôi giữ đội hình)
      const still = this.members.every(m => !m.alive || m.detached || m.enemy || (!m.intent.target && m.speed < 0.6 && !m._orders.length));
      if (still && !this._secured) {
        this._haltT += dt;
        if (this._haltT > 0.6) {
          this.halted = true;
          this._secured = true;
          const H = this.leader.heading;
          this.members.forEach((m, i) => {
            if (!m.alive || m.detached || m.enemy) return;
            const sec = this.slot(i)[2] * Math.PI / 180;
            m.order(() => { m.faceTo(H + sec); m.setStance('kneel'); m.setSector(0, true); }, m.react * 2.2 + 0.2 * i);
          });
        }
      } else if (!still) this._haltT = 0;
    }
  }

  // ---------- THẾ GIỚI ----------
  class World {
    /**
     * @param {THREE.Scene} scene
     * @param {BattleTerrain3D} terrain
     * @param {Object} o - { vehicles: () => units[] }
     */
    constructor(scene, terrain, o = {}) {
      this.scene = scene; this.terrain = terrain;
      this.vehicles = o.vehicles || (() => (typeof window !== 'undefined' && window.game && window.game.units) || []);
      // trận đấu nối đường đạn / sát thương thật vào đây: onFire(lính, mục tiêu, { x, y, z, dist, weapon })
      this.onFire = o.onFire || null;
      this.onKami = o.onKami || null;
      this.onMedkit = o.onMedkit || null;   // bộ y tế băng xong: trận thật hồi máu qua đơn vị; không có thì lính tự hồi
      this._kamiTubes = [];
      // phe đối địch (mặc định: khác team); game có thể thay bằng luật riêng
      this.isEnemy = o.isEnemy || ((a, b) => a.team !== b.team);
      this.soldiers = []; this.squads = [];
      this.frame = 0;
      this.animNear = 320;     // < 40 m (cự ly biểu kiến): động tác mỗi khung
      this.animMid = 640;      // 40-80 m: 1/2 khung
      this.animFar = 4000;     // 80-500 m: 1/4 khung; xa hơn / ngoài khung nhìn: 1/8 khung
      this.shadowNear = 700;   // chỉ lính trong ~90 m đổ bóng
      this.lodNear = 200;      // < 25 m (cự ly biểu kiến): đủ chi tiết
      this.lodFar = 640;       // 25-80 m: lưới giản lược; xa hơn: lưới rất nhẹ một lượt vẽ
      this._frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
      this._ob = {};
      this._blk = new Map();   // đệm ô lưới bộ binh bị chặn (vật cản tĩnh)
      this.camera = null; this.casings = [];
    }
    // tiếng súng phóng lựu tại vị trí lính; pan theo camera, người được camera bám coi như tai ở ngay đó
    sfx(s, name, k) { this.sfxAt(s.x, s.z, name, k); }
    sfxAt(x, z, name, k) {
      const SE = typeof window !== 'undefined' && window.soundEngine, C = this.camera;
      if (!SE || !SE.playGL || !C) return;
      const dx = x - C.position.x, dz = z - C.position.z, d = Math.hypot(dx, dz);
      const e = C.matrixWorld.elements, pan = d > 1 ? Math.max(-0.85, Math.min(0.85, (dx * e[0] + dz * e[2]) / d * 0.85)) : 0;
      SE.playGL(name, d < 60 ? 0 : d - 60, d < 60 ? pan * 0.3 : pan, k);
    }
    // giọng lính bị thương: tính cự ly + pan như sfxAt
    // tiếng bước chân (chỉ lính trong ~25 m camera): chạy nặng tiếng + đồ đeo lách cách, mệt thì lê chân, lội nước thì bì bõm
    step(s) {
      const SE = typeof window !== 'undefined' && window.soundEngine, C = this.camera;
      if (!SE || !SE.playSoldierStep || !C) return;
      const dx = s.x - C.position.x, dz = s.z - C.position.z, d = Math.hypot(dx, dz);
      if (d > 320) return;
      const e = C.matrixWorld.elements, pan = d > 1 ? Math.max(-0.85, Math.min(0.85, (dx * e[0] + dz * e[2]) / d * 0.85)) : 0;
      const G = GS(), run = Math.max(0, Math.min(1, (s.speed / s.k - G.walk) / (G.run - G.walk)));
      SE.playSoldierStep({ run, tired: 1 - s.stam, wet: this.waterDepth ? this.waterDepth(s.x, s.z) : 0, surf: this.stepSurface(s), load: s.loadKg, distance: d < 30 ? 0 : d - 30, pan: d < 30 ? pan * 0.3 : pan, k: s.voiceK || 1 });
    }
    // mặt đất dưới chân để chọn tiếng bước: đường / vỉa hè theo bảng mặt đi được, rồi cỏ, còn lại theo loại đất của game (dozerSoil)
    stepSurface(s) {
      const T = this.terrain;
      if (!T) return 'soil';
      if (T._walkIdx && walkTop(T._walkIdx, s.x, s.z, s.y) !== null) return 'hard';
      if (this.grassAt(s.x, s.z) > 0.3) return 'grass';
      const k = T.dozerSoil ? T.dozerSoil(s.x, s.z) : 'soil';
      return k === 'wsand' ? 'sand' : k === 'slurry' ? 'mud' : k;
    }
    vox(s, kind) {
      const SE = typeof window !== 'undefined' && window.soundEngine, C = this.camera;
      if (!SE || !SE.playSoldierVox || !C) return;
      const dx = s.x - C.position.x, dz = s.z - C.position.z, d = Math.hypot(dx, dz);
      const e = C.matrixWorld.elements, pan = d > 1 ? Math.max(-0.85, Math.min(0.85, (dx * e[0] + dz * e[2]) / d * 0.85)) : 0;
      SE.playSoldierVox(kind, d < 60 ? 0 : d - 60, d < 60 ? pan * 0.3 : pan, s.voiceK || 1);
    }
    // vỏ đạn nhôm rơi khỏi buồng i, nảy trên đất; nằm lại một lúc rồi biến mất
    dropCasing(s, i) {
      const P = s.figure.rifle && s.figure.rifle.userData.gl;
      if (!P || this.casings.length > 36) return;
      // vỏ rỗng thật: vành đuôi, miệng hở (+y); dài bằng phần vỏ của viên đạn trong model. Mặt cắt đi từ dưới lên kẻo lưới lộn trái
      const m = new THREE.Mesh(World.caseGeo || (World.caseGeo = new THREE.LatheGeometry([[0, -0.19], [0.162, -0.19], [0.162, -0.15], [0.15, -0.14], [0.15, 0.19], [0.128, 0.19], [0.128, -0.12], [0, -0.12]].map(p => new THREE.Vector2(p[0], p[1])), 14)), World.caseMat || (World.caseMat = new THREE.MeshStandardMaterial({ color: 0x8c8875, roughness: 0.42, metalness: 0.6 })));
      // vỏ trượt ra theo trục buồng, đuôi ra trước
      const back = new THREE.Vector3(0, 0, 1).transformDirection(P.drum.matrixWorld), out = rnd(5, 9);
      P.rounds[i].getWorldPosition(m.position).addScaledVector(back, 0.19);
      m.quaternion.setFromUnitVectors(_yUp, back.clone().negate());
      m.castShadow = true;
      this.scene.add(m);
      this.casings.push({ m, vx: back.x * out + rnd(-1.6, 1.6), vy: back.y * out + rnd(-1, 1), vz: back.z * out + rnd(-1.6, 1.6), spin: rnd(4, 12), life: 18, hops: 0 });
    }
    // vỏ rơi xuống gì: 0 nền cứng (đường, cầu, đá), 1 đất / cỏ / cát, 2 nước
    dropSurface(x, z) {
      if (this.waterDepth(x, z) > 0.1) return 2;
      try { const I = this.terrain.getTerrainInfoAt && this.terrain.getTerrainInfoAt(x, z); return !I || I.type === 'MOUNTAIN' || I.dustMult < 0.3 ? 0 : 1; } catch (e) { return 0; }   // địa hình chưa dựng xong
    }
    // băng rỗng tuột khỏi ổ, rơi xuống đất, nảy nhẹ rồi nằm lại một lúc
    dropMag(s) {
      const P = s.figure.rifle && (s.figure.rifle.userData.rifle || s.figure.rifle.userData.atr);
      if (!P || this.casings.length > 36) return;
      const big = !!s.figure.rifle.userData.atr;
      const m = big ? SoldierModel.atrMagProp(SoldierModel.getMaterials(s.team)) : new THREE.Mesh(World.magGeo || (World.magGeo = new THREE.BoxGeometry(0.22, 1.05, 0.5)), World.magMat || (World.magMat = new THREE.MeshStandardMaterial({ color: 0x75664a, roughness: 0.85 })));
      s.figure.rifle.updateMatrixWorld(true);
      s.figure.rifle.localToWorld(big ? m.position.set(0, -0.66, -1.52).add(P.mag.position) : m.position.set(0, -1.1, -1.25).add(P.mag.position));
      s.figure.rifle.getWorldQuaternion(m.quaternion);
      m.castShadow = true;
      this.scene.add(m);
      // băng súng bắn tỉa: tay trái hất văng sang bên
      let vx = rnd(-2, 2), vz = rnd(-2, 2), vy = -3;
      if (big) {
        // tay trái hất băng rỗng sang trái, chếch về phía người: nằm bắn thì ổ băng sát đất, thả rơi thẳng là băng nằm ngay dưới súng như hai băng chồng nhau
        const M = s.figure.rifle.matrixWorld, left = new THREE.Vector3(-1, 0, 0).transformDirection(M), back = new THREE.Vector3(0, 0, 1).transformDirection(M);
        vx += left.x * rnd(15, 19) + back.x * rnd(4, 7); vz += left.z * rnd(15, 19) + back.z * rnd(4, 7); vy = rnd(3, 5);
      }
      this.casings.push({ m, vx, vy, vz, spin: rnd(2, 5), life: 25, hops: 0, snd: big ? 'atrMagDrop' : null });
    }
    // vỏ đạn 20 mm bị móc kéo ra khi kéo khoá: văng qua cửa bên phải, đáy vỏ ra trước, rơi nảy trên đất rồi nằm lại một lúc
    ejectAtrCase(s) {
      const R = s.figure.rifle;
      if (!R || !R.userData.atr || this.casings.length > 36) return;
      // vỏ rỗng cổ chai, miệng hở (+y), mặt cắt đi từ dưới lên kẻo lưới lộn trái
      const m = new THREE.Mesh(World.atrCaseGeo || (World.atrCaseGeo = new THREE.LatheGeometry([[0, -0.31], [0.105, -0.31], [0.105, -0.28], [0.088, -0.26], [0.088, -0.24], [0.105, -0.22], [0.1, 0.19], [0.085, 0.24], [0.085, 0.31], [0.07, 0.31], [0.07, 0.25], [0, 0.25]].map(p => new THREE.Vector2(p[0], p[1])), 14)),
        World.atrCaseMat || (World.atrCaseMat = new THREE.MeshStandardMaterial({ color: 0x8a7340, roughness: 0.38, metalness: 0.75 })));
      R.updateMatrixWorld(true);
      R.localToWorld(m.position.set(0.34, 0.46, -0.3));
      R.getWorldScale(m.scale);
      R.getWorldQuaternion(m.quaternion).multiply(_atrQ.setFromAxisAngle(_atrX, -Math.PI / 2));
      m.castShadow = true;
      this.scene.add(m);
      const e = R.matrixWorld.elements, rt = new THREE.Vector3(e[0], e[1], e[2]).normalize(), bk = new THREE.Vector3(e[8], e[9], e[10]).normalize(), out = rnd(7, 10);
      this.casings.push({ m, vx: rt.x * out + bk.x * rnd(1, 3), vy: rnd(4, 6.5), vz: rt.z * out + bk.z * rnd(1, 3), spin: rnd(6, 11), life: 22, hops: 0, snd: 'atrCaseDrop', surf: true });
    }
    // nắp ngòi RPG bị hất đi: bay chếch sang trái, rơi xuống đất nằm lại một lúc
    dropRpgCap(s) {
      const R = s.figure.rifle, rk = R && R.userData.rocket, cap = rk && rk.userData.cap;
      if (!cap || this.casings.length > 36) return;
      const m = new THREE.Mesh(World.capGeo || (World.capGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.42, 12)), World.capMat || (World.capMat = new THREE.MeshStandardMaterial({ color: 0x5c5d42, roughness: 0.78 })));
      R.updateMatrixWorld(true);
      R.localToWorld(m.position.set(0, 0.86, -4.9).add(cap.position));
      m.castShadow = true;
      this.scene.add(m);
      const left = new THREE.Vector3(s.figure._rpgRH ? 1 : -1, 0, -0.25).transformDirection(R.matrixWorld);   // hất ra phía tay vừa rút nắp
      this.casings.push({ m, vx: left.x * 13 + rnd(-2, 2), vy: 7 + rnd(0, 3), vz: left.z * 13 + rnd(-2, 2), spin: rnd(9, 15), life: 16, hops: 0, snd: 'rpgCapDrop' });
    }
    stepCasings(dt) {
      for (let i = this.casings.length - 1; i >= 0; i--) {
        const C = this.casings[i], m = C.m;
        if ((C.life -= dt) <= 0) { this.scene.remove(m); this.casings.splice(i, 1); continue; }
        if (C.hops > 2) continue;
        C.vy -= GL40.g * dt;
        m.position.x += C.vx * dt; m.position.y += C.vy * dt; m.position.z += C.vz * dt;
        m.rotation.x += C.spin * dt; m.rotation.z += C.spin * 0.6 * dt;
        const g = this.groundAt(m.position.x, m.position.z, null) + 0.16;
        if (m.position.y < g) {
          m.position.y = g;
          if (C.hops++ === 0) this.sfxAt(m.position.x, m.position.z, C.snd || 'caseDrop', C.snd && !C.surf ? 0 : this.dropSurface(m.position.x, m.position.z));
          C.vy *= -0.32; C.vx *= 0.5; C.vz *= 0.5; C.spin *= 0.4;
          if (C.hops > 2) { if (C.snd) { m.rotation.set(0, m.rotation.y, Math.PI / 2); m.position.y += 0.1; } else m.rotation.set(Math.PI / 2, m.rotation.y, 0); }   // băng lớn nằm nghiêng
        }
      }
    }
    spawn(o) {
      const s = new Soldier(this, o), g = o.gear || {};
      s.gearKg0 = s.gearKg = (g.ghillie ? LOAD.ghillie : 0) + (g.medkit ? LOAD.medkit : 0);
      this.soldiers.push(s);
      return s;
    }

    // mục tiêu có thể giao chiến: lính phe khác + xe phe khác (chuẩn hoá {x, y, z, team, alive, aimH, kind, ref})
    targetsFor(viewer) {
      const out = [];
      for (const s of this.soldiers) if (s.alive && s !== viewer && this.isEnemy(viewer, s)) out.push(s);
      for (const v of this.vehicles()) {
        if (!v || v.isDead || !this.isEnemy(viewer, v)) continue;
        const T = v._infT || (v._infT = { kind: 'vehicle', ref: v, aimH: 12 });
        T.x = v.x; T.y = v.y; T.z = v.z; T.team = v.team; T.alive = !v.isDead;
        out.push(T);
      }
      return out;
    }
    // mức lộ: trong bụi / rừng khó thấy hơn (lính dễ ẩn trong rừng)
    concealment(t) {
      const T = this.terrain;
      let k = 1;
      if (t.kind !== 'vehicle') {
        if (T && T.isPositionInBush && T.isPositionInBush(t.x, t.z)) k *= 0.3;
        if (T && T.forestDensityAt) k *= 1 - 0.65 * Math.min(1, T.forestDensityAt(t.x, t.z) || 0);
        if (t.intent && t.intent.stance === 'kneel') k *= 0.75;
        if (t.intent && t.intent.stance === 'prone') k *= 0.45;
      } else if (t.ref && t.ref.isInBush) k *= 0.5;
      return k;
    }
    // nhìn thấy: trong tầm (theo mức lộ), trong góc nhìn, không bị đồi / nhà / cây chắn
    canSee(v, t) {
      const dx = t.x - v.x, dz = t.z - v.z, d = Math.hypot(dx, dz);
      if (d > v.sight * this.concealment(t)) return false;
      const fov = v.guard ? CFG.fovGuard : CFG.fovMove;
      if (d > 24 && Math.abs(angDiff(v.heading, Math.atan2(-dx, -dz))) > fov / 2) return false;
      const ey = v.y + 12.5 * (v.k || 1), ty = t.y + (t.aimH || 9);
      const n = Math.ceil(d / 12);
      for (let i = 1; i < n; i++) {
        const f = i / n, x = v.x + dx * f, z = v.z + dz * f, h = ey + (ty - ey) * f;
        if (this.groundAt(x, z, null) > h - 0.5) return false;           // đồi / mép đất chắn
        if (h - this.groundAt(x, z, null) < 30 && this.blocked(Math.floor(x / CFG.navCell), Math.floor(z / CFG.navCell)) && f > 0.04 && f < 0.96) return false;   // nhà / tường / thân cây
      }
      return true;
    }
    // chọn mục tiêu gần nhất nhìn thấy được (ưu tiên lính địch trong tầm phóng lựu tối thiểu trở lên)
    spot(v) {
      let best = null, bd = Infinity;
      for (const t of this.targetsFor(v)) {
        const d = Math.hypot(t.x - v.x, t.z - v.z);
        if (d >= bd || d > v.sight) continue;
        if (this.canSee(v, t)) { best = t; bd = d; }
      }
      return best;
    }
    squad(members, formation) { const q = new Squad(this, members, formation); this.squads.push(q); return q; }
    // ----- ĐẠN BAY THẬT (súng bắn tỉa) -----
    // o: { shooter, from, to | vel, onHit(kết quả) }. Không có vel thì tự tính góc bù tới điểm to theo đường đạn của súng.
    fireBullet(o) {
      const B = o.shooter.arms.def.ball;
      const v = o.vel ? o.vel.clone() : (L => new THREE.Vector3(L.vx, L.vy, L.vz))(lob(o.from, o.to, B));
      (this.bullets || (this.bullets = [])).push({ p: o.from.clone(), v, B, shooter: o.shooter, onHit: o.onHit || null, trav: 0 });
    }
    stepBullets(dt) {
      const list = this.bullets;
      if (!list || !list.length) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i], n = Math.max(1, Math.ceil(b.v.length() * dt / 48)), h = dt / n;
        let end = false;
        for (let k = 0; k < n && !end; k++) {
          const a = b.p.clone();
          b.v.y -= b.B.g * h;
          b.p.addScaledVector(b.v, h);
          b.trav += b.v.length() * h;
          const hit = this.bulletHit(b, a, b.p);
          if (this.onBulletStep) this.onBulletStep(a, hit ? hit.point : b.p, b);
          if (hit) {
            if (hit.target && hit.target.damage) hit.killed = hit.target.damage(hit.zone[2] * b.B.dmg * (0.85 + Math.random() * 0.3), 'BULLET', { mode: 'pierce', vel: b.v, zone: hit.zone[0] });
            if (b.onHit) b.onHit(hit);
            if (this.onBulletHit) this.onBulletHit(hit, b);
            end = true;
          }
          else if (b.trav > b.B.range * 1.25) end = true;
        }
        if (end) list.splice(i, 1);
      }
    }
    // đoạn a -> b trúng gì: người (3 vùng), xe, đất, nhà; lấy chỗ gần nhất
    bulletHit(blt, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz) || 1e-3, ux = dx / L, uy = dy / L, uz = dz / L, T = this.terrain;
      let bestT = Infinity, res = null;
      for (let t = 8; t <= L + 7.9; t += 8) {
        const q = Math.min(t, L), x = a.x + ux * q, y = a.y + uy * q, z = a.z + uz * q;
        if (y < this.groundAt(x, z, null)) { bestT = q; res = { kind: 'ground' }; break; }
      }
      if (!res && T.resolveVehicleCollision && Math.min(a.y, b.y) < this.groundAt(b.x, b.z, null) + 90 && T.resolveVehicleCollision(a.x, a.z, b.x, b.z, 0.5, null).hit) { bestT = L; res = { kind: 'wall' }; }
      for (const o of this.soldiers) {
        if (o === blt.shooter || !o.alive || !this.isEnemy(blt.shooter, o) || Math.abs(o.x - a.x) > L + 30 || Math.abs(o.z - a.z) > L + 30) continue;
        // lọc nhanh theo khoảng cách tới đoạn đạn, rồi dò các viên thuốc bám xương (SoldierModel.segHit): đúng tư thế, có vùng tấm giáp
        const cx = o.x - a.x, cy = o.y + 6 * o.k - a.y, cz = o.z - a.z, tq = Math.max(0, Math.min(L, cx * ux + cy * uy + cz * uz));
        if ((cx - ux * tq) ** 2 + (cy - uy * tq) ** 2 + (cz - uz * tq) ** 2 > (14 * o.k) ** 2) continue;
        const h = SoldierModel.segHit(o.figure, a.x, a.y, a.z, b.x, b.y, b.z);
        if (h && h.t * L < bestT) { bestT = h.t * L; res = { kind: 'soldier', target: o, zone: [h.zone, 0, (blt.B && blt.B.dmg >= 2 ? WOUND.HEAVY : WOUND.MG762)[h.zone] * 100] }; }
      }
      for (const u of (this.vehicles ? this.vehicles() : [])) {
        if (u.team === blt.shooter.team) continue;
        const ox = u.x - a.x, oz = u.z - a.z, tc = ox * ux + oz * uz, y = a.y + uy * tc;
        if (tc < 0 || tc > L || tc >= bestT || y < (u.y || 0) || y > (u.y || 0) + 22) continue;
        if (Math.hypot(ox - ux * tc, oz - uz * tc) < 16) { bestT = tc; res = { kind: 'vehicle', vehicle: u }; }
      }
      if (!res) return null;
      res.point = new THREE.Vector3(a.x + ux * bestT, a.y + uy * bestT, a.z + uz * bestT);
      return res;
    }
    remove(s) { const i = this.soldiers.indexOf(s); if (i >= 0) this.soldiers.splice(i, 1); s.dispose(); }
    // nhà sập / vật cản đổi: xoá đệm ô chặn
    invalidateNav() { this._blk.clear(); }

    // độ phủ cỏ tại (x, z) 0..1 (lớp cỏ 3D: không tính đất trống, sỏi đá, sân lát, sa mạc thưa)
    grassAt(x, z) {
      const GC = this.terrain && this.terrain.groundCover;
      if (!GC || !GC.masks) return 0;
      const m = GC.masks(x, z), bare = GC.bareAt ? GC.bareAt(x, z) : 0, city = GC.B && GC.B.city && GC.cityAt ? GC.cityAt(x, z) : 0;
      return Math.max(0, m.grass * Math.min(1, (GC.B && GC.B.density) || 1) * (1 - bare) * (city > 0.12 ? 0 : 1));
    }
    // rạp cỏ trong dải chữ nhật: tâm (x, z), hướng dọc (fx, fz), nửa rộng hw, nửa dài hl (người nằm đè, luồng hơi đầu nòng)
    flattenGrass(x, z, fx, fz, hw, hl) {
      const GC = this.terrain && this.terrain.groundCover;
      if (!GC || !GC.trample) return;
      const L = Math.hypot(fx, fz) || 1;
      GC.trample({ cx: x, cz: z, ux: -fz / L, uz: fx / L, hu: hw, hv: hl, dx: fx / L, dz: fz / L, lane: hw });
    }
    groundAt(x, z, refY) {
      const T = this.terrain;
      if (!T) return 0;
      const g = T.vehicleSurfaceAt && refY != null ? T.vehicleSurfaceAt(x, z, refY) : T.getElevationAt(x, z);
      // hố bom / sàn hầm: mặt đào xuống thấp hơn đất -> đứng trong hố, kể cả hố trên đường
      if (refY != null && g < T.getElevationAt(x, z) - 0.1) return g;
      const I = walkIndex(T), w = I ? walkTop(I, x, z, refY) : null;
      // dải bờ kênh: độ cao đất của xe lấy theo bờ phía ngoài (che sườn lòng kênh), mặt vẽ thấp hơn tới ~1 m -> người đi trên mặt thật
      if (T.canalQuayAt && T.groundAtRaw && T.map && T.map.canals && T.map.canals.length && g > (w !== null ? w : T.groundAtRaw(x, z)) + 0.3
        && T.canalQuayAt(x, z) !== null && !(T.strongholdSet && T.strongholdSet.surfaceAt(x, z) !== null) && !(T.bridges.length && T.bridgeAt(x, z))) return w !== null ? w : T.groundAtRaw(x, z);
      // mặt cầu trên đầu quá tầm bước mà dưới chân có mặt đi được: đang ở gầm cầu
      if (w !== null && refY != null && g > refY + 2.2) return w;
      // mặt thấp hơn đất hẳn (dưới hầm) thì không phải chỗ người đứng
      return w !== null && w > g - 0.3 ? w : g;
    }
    // chỗ này đứng được không: không vướng nhà / cây, nước không quá sâu
    canStand(x, z) { return !this.blocked(Math.floor(x / CFG.navCell), Math.floor(z / CFG.navCell)) && this.waterDepth(x, z) <= CFG.wadeMax; }
    waterDepth(x, z) {
      const T = this.terrain;
      if (!T || !T.waterSurfaceAt) return 0;
      const ws = T.waterSurfaceAt(x, z);
      return ws == null ? 0 : Math.max(0, ws - T.getElevationAt(x, z));
    }

    // va chạm hình tròn thân người: nhà / đá / tường (địa hình) -> thân cây -> xe
    collide(self, x0, z0, x1, z1) {
      const T = this.terrain;
      let x = x1, z = z1;
      if (T && T.resolveVehicleCollision) { const r = T.resolveVehicleCollision(x0, z0, x, z, RADIUS, null); x = r.x; z = r.z; }
      if (T && T.trees && T.trees.near) {
        for (const it of T.trees.near(x, z, RADIUS + 8)) {
          if (it.fallen || it.shattered || it.down) continue;
          const m = RADIUS + (it.trunkR || 1), dx = x - it.x, dz = z - it.z, d = Math.hypot(dx, dz);
          if (d < m && d > 1e-4) { x = it.x + dx * m / d; z = it.z + dz * m / d; }
        }
      }
      const VC = typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
      for (const v of this.vehicles()) {
        if (!v || v.isDead && !v.group) continue;
        const dx = x - v.x, dz = z - v.z;
        if (dx * dx + dz * dz > 50 * 50) continue;
        if (VC && VC.vehObb && VC.circleGap) {
          const ob = VC.vehObb(v, v.x, v.z, v.bodyAngle, this._ob), g = VC.circleGap(ob, x, z, RADIUS, this._gap || (this._gap = {}));
          if (g && g.gap < 0) { x -= g.nx * g.gap; z -= g.nz * g.gap; }
        } else {
          const m = 16 + RADIUS, d = Math.hypot(dx, dz);
          if (d < m && d > 1e-4) { x = v.x + dx * m / d; z = v.z + dz * m / d; }
        }
      }
      return { x, z };
    }

    // ô lưới bộ binh (6 đv ~ 0,75 m) có đi qua được không: thử va chạm thật tại tâm ô (đệm lại)
    blocked(i, j) {
      const k = i * 100003 + j;
      let b = this._blk.get(k);
      if (b !== undefined) return b;
      const C = CFG.navCell, x = (i + 0.5) * C, z = (j + 0.5) * C, T = this.terrain;
      b = false;
      if (T && T.resolveVehicleCollision) { const r = T.resolveVehicleCollision(x, z, x + 1e-3, z, RADIUS + 0.6, null); if (Math.hypot(r.x - x - 1e-3, r.z - z) > 0.3) b = true; }
      if (!b && T && T.trees && T.trees.near) for (const it of T.trees.near(x, z, RADIUS + 6)) { if (!it.fallen && !it.shattered && Math.hypot(it.x - x, it.z - z) < RADIUS + (it.trunkR || 1)) { b = true; break; } }
      if (!b && this.waterDepth(x, z) > CFG.wadeMax) b = true;
      this._blk.set(k, b);
      return b;
    }
    lineFree(ax, az, bx, bz) {
      const C = CFG.navCell, n = Math.ceil(Math.hypot(bx - ax, bz - az) / (C * 0.5));
      for (let s = 0; s <= n; s++) { const t = s / Math.max(1, n); if (this.blocked(Math.floor((ax + (bx - ax) * t) / C), Math.floor((az + (bz - az) * t) / C))) return false; }
      return true;
    }
    // A* 8 hướng trên lưới mịn trong khung bao quanh tuyến đi, rồi kéo thẳng đường (bỏ điểm thừa)
    findPath(x0, z0, x1, z1) {
      const C = CFG.navCell, M = CFG.navMargin;
      const i0 = Math.floor((Math.min(x0, x1) - M) / C), j0 = Math.floor((Math.min(z0, z1) - M) / C);
      const nx = Math.floor((Math.max(x0, x1) + M) / C) - i0 + 1, nz = Math.floor((Math.max(z0, z1) + M) / C) - j0 + 1;
      if (nx * nz > CFG.navMaxCells) return null;
      const idx = (i, j) => (j - j0) * nx + (i - i0);
      const si = Math.floor(x0 / C), sj = Math.floor(z0 / C);
      let gi = Math.floor(x1 / C), gj = Math.floor(z1 / C);
      if (this.blocked(gi, gj)) {    // đích nằm trong vật cản: lấy ô trống gần nhất
        let best = null;
        for (let r = 1; r < 12 && !best; r++) for (let di = -r; di <= r && !best; di++) for (let dj = -r; dj <= r; dj++) if (!this.blocked(gi + di, gj + dj)) { best = [gi + di, gj + dj]; break; }
        if (!best) return null; [gi, gj] = best;
      }
      const N = nx * nz, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const open = [];   // đống nhị phân [f, k]
      const push = (f, k) => { open.push([f, k]); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
      const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; } } return top; };
      const h = (i, j) => { const a = Math.abs(i - gi), b = Math.abs(j - gj); return Math.max(a, b) + 0.414 * Math.min(a, b); };
      const s0 = idx(si, sj), goal = idx(gi, gj);
      g[s0] = 0; push(h(si, sj), s0);
      let found = false, it = 0;
      while (open.length && it++ < 40000) {
        const [, k] = pop();
        if (closed[k]) continue;
        closed[k] = 1;
        if (k === goal) { found = true; break; }
        const ci = k % nx + i0, cj = ((k / nx) | 0) + j0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < i0 || nj < j0 || ni >= i0 + nx || nj >= j0 + nz) continue;
          if (this.blocked(ni, nj)) continue;
          if (di && dj && (this.blocked(ci + di, cj) || this.blocked(ci, cj + dj))) continue;   // không lách chéo qua góc
          const nk = idx(ni, nj), ng = g[k] + (di && dj ? 1.414 : 1);
          if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(ng + h(ni, nj), nk); }
        }
      }
      if (!found) return null;
      const pts = [];
      for (let k = goal; k !== -1; k = from[k]) pts.push({ x: (k % nx + i0 + 0.5) * C, z: (((k / nx) | 0) + j0 + 0.5) * C });
      pts.reverse();
      pts[pts.length - 1] = { x: x1, z: z1 };
      // kéo thẳng: giữ điểm xa nhất còn nhìn thấy thẳng
      const out = []; let cx = x0, cz = z0, a = 0;
      while (a < pts.length - 1) {
        let b = pts.length - 1;
        while (b > a + 1 && !this.lineFree(cx, cz, pts[b].x, pts[b].z)) b--;
        out.push(pts[b]); cx = pts[b].x; cz = pts[b].z; a = b;
      }
      if (!out.length) out.push({ x: x1, z: z1 });
      return out;
    }

    // lính không chồng lên nhau: đẩy mềm theo cặp trong ô lưới 16 đv
    separate() {
      const cell = 16, grid = new Map(), L = this.soldiers;
      for (const s of L) { if (!s.alive) continue; const k = Math.floor(s.x / cell) * 73856093 ^ Math.floor(s.z / cell) * 19349663; (grid.get(k) || grid.set(k, []).get(k)).push(s); }
      const min = RADIUS * 2.1;
      for (const s of L) {
        if (!s.alive) continue;
        const ci = Math.floor(s.x / cell), cj = Math.floor(s.z / cell);
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
          const l = grid.get(i * 73856093 ^ j * 19349663); if (!l) continue;
          for (const o of l) {
            if (o.id <= s.id) continue;
            const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
            if (d < min && d > 1e-4) {
              const push = (min - d) * 0.5, ux = dx / d, uz = dz / d;
              s.x -= ux * push; s.z -= uz * push; o.x += ux * push; o.z += uz * push;
            }
          }
        }
      }
    }

    /**
     * Gọi mỗi khung từ vòng lặp game. camera: để cập nhật thưa lính xa / ngoài khung nhìn & bật tắt bóng đổ.
     */
    // ống phóng UAV rỗng bỏ lại tại chỗ phóng (dùng một lần), tự dọn sau ~40 s
    dropKamiTube(T) {
      if (!T) return;
      const geo = SoldierModel.kamiEmptyGeo();
      const mat = World._kamiMat || (World._kamiMat = new THREE.MeshStandardMaterial({ color: 0x3d4030, roughness: 0.74, metalness: 0.06 }));
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(T.dropBase); m.quaternion.copy(T.dropQuat); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this._kamiTubes.push({ m, t: 40 });
      if (this._kamiTubes.length > 24) this.scene.remove(this._kamiTubes.shift().m);
    }
    stepKamiTubes(dt) {
      for (let i = this._kamiTubes.length - 1; i >= 0; i--) if ((this._kamiTubes[i].t -= dt) <= 0) { this.scene.remove(this._kamiTubes[i].m); this._kamiTubes.splice(i, 1); }
    }
    update(dt, camera) {
      if (this._kamiTubes.length) this.stepKamiTubes(dt);
      this.frame++;
      if (camera) this.camera = camera;
      if (this.casings.length) this.stepCasings(dt);
      this.stepBullets(dt);
      for (const q of this.squads) q.update(dt);
      let fr = null, cx = 0, cz = 0;
      if (camera) {
        camera.updateMatrixWorld();
        this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._pm);
        fr = this._frustum; cx = camera.position.x; cz = camera.position.z;
      }
      for (const s of this.soldiers) {
        let every = 1;
        if (fr) {
          const d = Math.hypot(s.x - cx, s.z - cz);
          this._sph.center.set(s.x, s.y + 7, s.z); this._sph.radius = 9;
          const seen = fr.intersectsSphere(this._sph);
          // cự ly biểu kiến: soi kính (fov hẹp) thì lính xa to lên, động tác phải mượt và giữ chi tiết
          const ap = d * Math.min(1, (camera.fov || 55) / 55);
          // Giữ animation của mọi lính đang hiện trên màn hình ở full frame-rate.
          // Root vẫn di chuyển mỗi khung, nên giữ pose 2-8 khung làm chân/thân nhảy nấc
          // trong khi cả người tiếp tục trượt tới trước. LOD hình học đã giảm đủ tải vẽ;
          // chỉ hạ tần suất animation khi lính thực sự nằm ngoài khung nhìn.
          every = seen ? 1 : 8;
          const shadow = seen && d < this.shadowNear;
          if (s._shadow !== shadow) { s._shadow = shadow; SoldierModel.setShadow(s.figure, shadow); }
          // nới 8% khi hạ bậc để không nhấp nháy ở ngưỡng
          const cur = s.figure.lod ? s.figure.lod.cur : 0, up = 1.08;
          const lvl = ap < this.lodNear * (cur > 0 ? 1 : up) ? 0 : ap < this.lodFar * (cur > 1 ? 1 : up) ? 1 : 2;
          if (lvl !== cur) SoldierModel.setLod(s.figure, lvl);
        }
        // Lính ngoài khung nhìn mới cập nhật animation thưa; di chuyển vẫn chạy mỗi khung để va chạm chính xác.
        if (s._death) s.stepDeath(dt);
        s.update(dt, (this.frame + s.id) % every === 0);
      }
      this.separate();
      for (const s of this.soldiers) s.applyTransform();
    }
  }

  return { walkIndex, RESERVE, WOUND, applyBlast, World, Soldier, Squad, FORMATIONS, CFG, RADIUS, ARMS, GL40, RPG_B, ATR_B, ZONES, lob, dragY };
})();

if (typeof window !== 'undefined') window.SoldierEngine = SoldierEngine;
