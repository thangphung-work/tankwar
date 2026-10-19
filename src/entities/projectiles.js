/**
 * MÔ HÌNH ĐẠN CHÂN THỰC (Projectile Models)
 * Quy ước: trục +Y là hướng bay (mũi đạn ở +Y), gốc ở giữa thân đạn.
 *
 * - Đạn pháo 120mm / 155mm: thân tròn xoay có đuôi thon, dải đồng dẫn hướng, mũi ogive, ngòi nổ thép,
 *   vạch màu nhận dạng chuẩn NATO (xanh ô-liu + vạch vàng = nổ phá), ống vạch đường phát sáng ở đáy
 * - Đạn xuyên giáp dưới cỡ APFSDS: mũi tên vonfram dài mảnh + 6 cánh đuôi nhôm
 * - Đạn chùm DPICM: vỏ mang 155mm có hình thoi vàng + bộ tăng tầm đáy; bom con có dải dù ổn định
 * - Tên lửa chống tăng: thân ô-liu, đầu dò + cần kích nổ, 4 cánh giữa + 4 cánh đuôi, lửa động cơ
 * - Đạn 30mm / súng máy: đầu đạn nhỏ + vệt vạch đường sáng kéo dài (thứ mắt người thực sự nhìn thấy)
 *
 * Không gắn đèn PointLight vào đạn (thêm/xóa đèn liên tục làm Three.js biên dịch lại shader -> giật).
 * Hình học & vật liệu dùng chung (userData.sharedAsset) -> không tạo mới, không hủy theo từng viên.
 */

(function () {
  const CACHE = {};
  const MAT = {};

  function mat(key, make) {
    if (!MAT[key]) {
      MAT[key] = make();
      MAT[key].userData.sharedAsset = true;
    }
    return MAT[key];
  }

  const M = {
    olive: () => mat('olive', () => new THREE.MeshStandardMaterial({ color: 0x4b5232, roughness: 0.55, metalness: 0.25 })),
    oliveDark: () => mat('oliveDark', () => new THREE.MeshStandardMaterial({ color: 0x353a24, roughness: 0.6, metalness: 0.2 })),
    yellow: () => mat('yellow', () => new THREE.MeshStandardMaterial({ color: 0xd6ad2b, roughness: 0.5, metalness: 0.1 })),
    red: () => mat('red', () => new THREE.MeshStandardMaterial({ color: 0x9a1d16, roughness: 0.5, metalness: 0.1 })),
    black: () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.6, metalness: 0.3 })),
    steel: () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0x8e9194, roughness: 0.32, metalness: 0.85 })),
    copper: () => mat('copper', () => new THREE.MeshStandardMaterial({ color: 0xb4693b, roughness: 0.3, metalness: 0.9 })),
    tungsten: () => mat('tungsten', () => new THREE.MeshStandardMaterial({ color: 0x3f423a, roughness: 0.38, metalness: 0.85 })), // lõi urani nghèo
    alu: () => mat('alu', () => new THREE.MeshStandardMaterial({ color: 0xb9bdc1, roughness: 0.35, metalness: 0.8 })),
    brass: () => mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xc09a45, roughness: 0.35, metalness: 0.85 })),
    ribbon: () => mat('ribbon', () => new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })),
    glass: () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.1, metalness: 0.9 }))
  };

  // Texture vệt sáng: lõi trắng nóng, viền cam, mờ dần về đuôi
  let STREAK = null;
  function streakTexture() {
    if (STREAK || typeof document === 'undefined') return STREAK;
    const w = 64, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x / (w - 1)) * 2 - 1;
        const v = y / (h - 1); // 0 = đầu (sáng), 1 = đuôi
        const across = Math.exp(-u * u * 9);
        const along = Math.pow(1 - v, 1.6) * Math.min(1, (v + 0.02) * 12);
        const core = Math.exp(-u * u * 60) * (1 - v);
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = Math.min(255, (0.55 + 0.45 * core) * 255);
        img.data[i + 2] = Math.min(255, (0.2 + 0.8 * core) * 255);
        img.data[i + 3] = Math.min(255, across * along * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    STREAK = new THREE.CanvasTexture(c);
    return STREAK;
  }

  function glowMat(key, color) {
    return mat('glow_' + key, () => new THREE.MeshBasicMaterial({
      map: streakTexture(), color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
  }

  function shared(geoKey, make) {
    if (!CACHE[geoKey]) CACHE[geoKey] = make();
    return CACHE[geoKey];
  }

  function mesh(geo, material, group, pos, rot) {
    const m = new THREE.Mesh(geo, material);
    m.userData.sharedAsset = true;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    group.add(m);
    return m;
  }

  // Vệt vạch đường: 2 mặt phẳng chéo kéo dài về phía đuôi (-Y)
  function addTracer(group, length, width, color, key, baseY) {
    const geo = shared('tracer', () => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.translate(0, -0.5, 0); // đầu ở gốc, kéo dài về -Y
      return g;
    });
    for (const ry of [0, Math.PI / 2]) {
      const m = mesh(geo, glowMat(key, color), group, [0, baseY, 0], [0, ry, 0]);
      m.scale.set(width, length, 1);
      m.userData.tracer = true;
    }
  }

  // Tỉ lệ để đường kính đạn khớp lòng nòng của xe bắn ra nó (đạn không được to hơn nòng)
  const CALIBER_SCALE = {
    NORMAL: 0.55, HE: 0.55, AP: 0.55,           // 120mm (lòng nòng Halberd ~0.62)
    HEAVY: 0.7, CLUSTER: 0.7,                   // 155mm (lòng nòng Arbalest ~1.0)
    CLUSTER_SUBMUNITION: 0.65,
    RPG: 0.6, ANTI_TANK_MISSILE: 0.6,
    GATLING_BULLET: 0.42, INCENDIARY: 0.42,     // 30mm (lòng nòng Hailstorm ~0.2)
    SCOUT_BULLET: 0.4
  };

  // Thân đạn pháo tròn xoay: r = bán kính thân, L = dài tổng
  function shellBodyGeo(key, r, L) {
    return shared('shell_' + key, () => {
      const y0 = -L / 2;
      const pts = [
        [0.0, y0], [r * 0.8, y0], [r * 0.86, y0 + L * 0.03], [r, y0 + L * 0.1],     // đuôi thon
        [r, y0 + L * 0.62]                                                              // thân trụ
      ];
      // Mũi ogive cong
      for (let i = 1; i <= 8; i++) {
        const k = i / 8;
        pts.push([r * Math.cos(k * Math.PI / 2) * 0.62 + r * 0.38 * (1 - k), y0 + L * (0.62 + 0.3 * Math.sin(k * Math.PI / 2))]);
      }
      return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1])), 22);
    });
  }

  function ring(key, r, h) {
    return shared('ring_' + key, () => new THREE.CylinderGeometry(r, r, h, 22, 1, true));
  }

  // ---------------------------------------------------------------------------
  // CÁC LOẠI ĐẠN
  // ---------------------------------------------------------------------------
  function artilleryShell(group, opts, kind) {
    const heavy = !!opts.heavy || kind === 'CLUSTER';
    const r = heavy ? 1.3 : 1.0;
    const L = heavy ? 13.5 : 10;
    const key = heavy ? 'h' : 'l';
    const y0 = -L / 2;
    mesh(shellBodyGeo(key, r, L), kind === 'NORMAL' ? M.oliveDark() : M.olive(), group);
    // Dải đồng dẫn hướng (ăn khớp rãnh xoắn nòng)
    mesh(ring(key + 'band', r * 1.04, L * 0.07), M.copper(), group, [0, y0 + L * 0.17, 0]);
    // Ngòi nổ thép ở mũi
    mesh(shared('fuze' + key, () => new THREE.CylinderGeometry(r * 0.07, r * 0.32, L * 0.1, 14)), M.steel(), group, [0, y0 + L * 0.96, 0]);
    // Vạch nhận dạng: vàng = thuốc nổ mạnh
    if (kind === 'HE' || kind === 'CLUSTER') {
      mesh(ring(key + 'y1', r * 1.003, L * 0.035), M.yellow(), group, [0, y0 + L * 0.55, 0]);
    }
    if (kind === 'HE') mesh(ring(key + 'y2', r * 1.003, L * 0.035), M.yellow(), group, [0, y0 + L * 0.47, 0]);
    if (kind === 'NORMAL') mesh(ring(key + 'y3', r * 1.003, L * 0.03), M.yellow(), group, [0, y0 + L * 0.55, 0]);
    if (kind === 'CLUSTER') {
      // Hình thoi vàng của đạn chùm + bộ tăng tầm đáy màu đen
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        mesh(shared('diamond', () => new THREE.BoxGeometry(0.55, 0.55, 0.05)), M.yellow(), group,
          [Math.cos(a) * r * 1.01, y0 + L * 0.42, Math.sin(a) * r * 1.01], [0, -a + Math.PI / 2, Math.PI / 4]);
      }
      mesh(shared('basebleed', () => new THREE.CylinderGeometry(r * 0.86, r * 0.8, L * 0.06, 20)), M.black(), group, [0, y0 - L * 0.02, 0]);
    }
    // Ống vạch đường ở đáy
    addTracer(group, heavy ? 9 : 7, heavy ? 2.4 : 2.0, 0xffb060, 'shell', y0);
    return L;
  }

  function apfsds(group) {
    const L = 12;
    const y0 = -L / 2;
    mesh(shared('dart', () => new THREE.CylinderGeometry(0.3, 0.3, L * 0.86, 12)), M.tungsten(), group, [0, y0 + L * 0.47, 0]);
    mesh(shared('darttip', () => new THREE.ConeGeometry(0.3, L * 0.1, 12)), M.steel(), group, [0, y0 + L * 0.95, 0]);
    // Rãnh khóa guốc đạn (sabot) trên thân
    for (let i = 0; i < 5; i++) mesh(ring('groove', 0.32, 0.12), M.black(), group, [0, y0 + L * (0.45 + i * 0.05), 0]);
    // 6 cánh đuôi
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(shared('apfin', () => {
        const g = new THREE.BoxGeometry(0.06, 1.9, 1.0);
        g.translate(0, 0, 0.75);
        return g;
      }), M.alu(), group, [0, y0 + 1.0, 0], [0, a, 0]);
    }
    addTracer(group, 9, 1.6, 0xffa050, 'ap', y0);
    return L;
  }

  function bomblet(group) {
    mesh(shared('bomb', () => new THREE.CylinderGeometry(0.6, 0.6, 1.5, 14)), M.olive(), group, [0, 0, 0]);
    mesh(shared('bombcap', () => new THREE.CylinderGeometry(0.3, 0.6, 0.5, 14)), M.brass(), group, [0, 1.0, 0]);
    mesh(shared('bombfuze', () => new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8)), M.steel(), group, [0, 1.45, 0]);
    // Dải dù ổn định màu trắng kéo phía sau
    mesh(shared('ribbon', () => {
      const g = new THREE.PlaneGeometry(0.5, 2.6);
      g.translate(0, -1.3, 0);
      return g;
    }), M.ribbon(), group, [0, -0.75, 0], [0.15, 0, 0]);
    return 3;
  }

  function missile(group) {
    const L = 10;
    const y0 = -L / 2;
    mesh(shared('mbody', () => new THREE.CylinderGeometry(0.72, 0.72, L * 0.72, 18)), M.olive(), group, [0, y0 + L * 0.44, 0]);
    mesh(shared('mnose', () => new THREE.SphereGeometry(0.72, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.oliveDark(), group, [0, y0 + L * 0.8, 0]);
    // Cần kích nổ (standoff probe) của đầu nổ lõm
    mesh(shared('mprobe', () => new THREE.CylinderGeometry(0.16, 0.22, L * 0.16, 10)), M.steel(), group, [0, y0 + L * 0.94, 0]);
    mesh(ring('mband', 0.73, 0.35), M.yellow(), group, [0, y0 + L * 0.68, 0]);
    mesh(shared('mnozzle', () => new THREE.CylinderGeometry(0.55, 0.4, 0.6, 14, 1, true)), M.black(), group, [0, y0 + 0.1, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      mesh(shared('mwing', () => {
        const g = new THREE.BoxGeometry(0.06, 2.4, 1.2);
        g.translate(0, 0, 1.25);
        return g;
      }), M.oliveDark(), group, [0, y0 + L * 0.48, 0], [0, a, 0]);
      mesh(shared('mfin', () => {
        const g = new THREE.BoxGeometry(0.06, 1.3, 0.8);
        g.translate(0, 0, 1.05);
        return g;
      }), M.alu(), group, [0, y0 + 1.0, 0], [0, a + Math.PI / 4, 0]);
    }
    // Lửa động cơ tên lửa
    addTracer(group, 7, 2.6, 0xffc070, 'rocket', y0);
    addTracer(group, 3.5, 1.4, 0xffffff, 'rocketcore', y0);
    return L;
  }

  // tracer = false: viên thường trong băng đạn (không có vệt sáng; băng đạn thật cứ vài viên mới có 1 viên vạch đường)
  function smallRound(group, kind, tracer = true) {
    const scout = kind === 'SCOUT_BULLET';
    const r = scout ? 0.32 : 0.42;
    const L = scout ? 2.4 : 3.2;
    const key = scout ? 's' : 'g';
    mesh(shellBodyGeo('round' + key, r, L), kind === 'INCENDIARY' ? M.red() : M.yellow(), group);
    mesh(ring('roundband' + key, r * 1.05, L * 0.1), M.copper(), group, [0, -L * 0.3, 0]);
    if (!tracer) return L;
    if (kind === 'INCENDIARY') {
      // Đạn cháy: hỗn hợp cháy + vạch đường cháy mạnh -> vệt dài hơn, đỏ rực, lõi sáng gắt
      addTracer(group, 26, 2.8, 0xff3414, 'incendiary', -L / 2);
      addTracer(group, 14, 1.1, 0xffd8a0, 'incendiaryCore', -L / 2);
    } else {
      addTracer(group, scout ? 11 : 15, scout ? 1.3 : 1.7, 0xffb050, 'bullet' + key, -L / 2);
    }
    return L;
  }

  const INFO = {
    NORMAL: { name: 'Đạn pháo tiêu chuẩn 120mm', desc: 'Đạn nổ phá đa năng: thân ô-liu sẫm có vạch vàng, ngòi nổ chạm. Nổ vừa, tung đất và mảnh văng.' },
    HE: { name: 'Đạn nổ mạnh (HE)', desc: 'Lượng nổ lớn: 2 vạch vàng. Cầu lửa to, cột đất cao, sóng xung kích quét bụi, hố sâu, lửa cháy âm ỉ.' },
    AP: { name: 'Đạn xuyên giáp APFSDS lõi urani nghèo', desc: 'Chỉ xe tăng bắn được. Mũi tên urani nghèo có cánh, không thuốc nổ nhưng tự bốc cháy khi va chạm: chớp trắng gắt, mảnh kim loại cháy sáng văng theo hướng bay, mây bụi oxit trắng xám, xé đất thành rãnh dài.' },
    CLUSTER: { name: 'Đạn chùm 155mm', desc: 'Kích nổ trên không tầm cao: bung tỏa 18 bom con dù rơi rải thảm, gây chuỗi vụ nổ thứ cấp dồn dập khắp diện rộng.' },
    CLUSTER_SUBMUNITION: { name: 'Bom con đạn chùm', desc: 'Bom con nhỏ có dải dù định hướng: rơi từ trên trời xuống, phát nổ đanh gọn, chớp lửa và mảnh văng.' },
    RPG: { name: 'Tên lửa chống tăng (HEAT)', desc: 'Đầu nổ lõm có cần kích nổ: luồng kim loại nóng chảy phụt thẳng, chớp trắng chói, khói đen đặc.' },
    ANTI_TANK_MISSILE: { name: 'Tên lửa chống tăng có điều khiển', desc: 'Đầu nổ lõm: luồng phụt nóng chảy, chớp trắng chói, khói đen đặc, tia lửa nhiều.' },
    GATLING_BULLET: { name: 'Đạn 30mm nổ - cháy - vạch đường', desc: 'Mỗi phát nổ một chớp nhỏ, tia đất tóe theo hướng bay, để lại lỗ đạn trên đất / tường.' },
    SCOUT_BULLET: { name: 'Đạn súng máy hạng nặng', desc: 'Đạn nhỏ có vạch đường: tóe đất, bụi mỏng.' },
    INCENDIARY: { name: 'Đạn cháy', desc: 'Mũi đỏ, vạch đường cam đậm: bùng lửa, văng tàn cháy, lửa bám cháy thêm một lúc.' }
  };

  const ProjectileModels = {
    /** Tạo mô hình đạn; opts: { heavy, scale } */
    create(ammoType = 'NORMAL', opts = {}) {
      const g = new THREE.Group();
      let L;
      switch (ammoType) {
        case 'AP': L = apfsds(g); break;
        case 'CLUSTER_SUBMUNITION': L = bomblet(g); break;
        case 'RPG':
        case 'ANTI_TANK_MISSILE': L = missile(g); break;
        case 'GATLING_BULLET':
        case 'SCOUT_BULLET':
        case 'INCENDIARY': L = smallRound(g, ammoType, opts.tracer !== false); break;
        case 'HE':
        case 'CLUSTER': L = artilleryShell(g, opts, ammoType); break;
        default: L = artilleryShell(g, opts, 'NORMAL');
      }
      // Mặc định: đúng cỡ nòng; scale tùy chỉnh (vd khung xem cận cảnh = 1)
      const sc = opts.scale !== undefined ? opts.scale
        : (CALIBER_SCALE[(opts.heavy && (ammoType === 'HE' || ammoType === 'NORMAL')) ? 'HEAVY' : ammoType] || 0.55);
      g.scale.setScalar(sc);
      // Vệt vạch đường không thu nhỏ theo cỡ đạn (thứ mắt người thấy được khi đạn bay)
      if (opts.scale === undefined) {
        const boost = 1.25 / sc;
        g.traverse(o => { if (o.userData.tracer) { o.scale.x *= boost * 0.8; o.scale.y *= boost; } });
      }
      g.userData.length = L * sc;
      g.userData.sharedAsset = true;
      return g;
    },
    info(ammoType) {
      return INFO[ammoType] || INFO.NORMAL;
    },
    types: Object.keys(INFO)
  };

  if (typeof window !== 'undefined') window.ProjectileModels = ProjectileModels;
})();
