/**
 * CẢNH NỀN NGOÀI BẢN ĐỒ: địa hình nối liền mép bản đồ kéo dài tới chân trời (độ cao từ MapGen: map.outer)
 * - Vành núi bao quanh chiến trường, sườn ngoài đổ xuống bờ biển (đảo giữa biển: sông hồ / rừng rậm / đô thị),
 *   biển cát có núi bàn (sa mạc) hoặc các dãy núi nối tiếp (cao nguyên); xa nữa là đảo, núi đá vôi giữa biển
 * - Lưới không đều: sát mép bản đồ dày đúng bằng ô lưới địa hình (đỉnh ở mép trùng khít -> không hở, không gờ),
 *   ra xa thưa dần; mặt biển dùng chung shader mặt nước sông hồ
 * - Chỉ để nhìn: không va chạm, không tia dò, không đổ bóng; xa dần hòa hẳn vào sương / bầu trời trước mặt phẳng
 *   cắt xa của camera nên không lộ mép cắt
 */
const Backdrop = (() => {
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // PHỐI CẢNH KHÔNG KHÍ cho đồi núi ngoài bản đồ (xem HAZE_GLSL)
  const HAZE_GLSL = `#ifdef USE_FOG
  {
    // sương giữa chừng: chunk sương chung (sky.js — không khí xa sẫm ngả lam), y như địa hình trong bản đồ cùng cự ly
    // (sương riêng dày hơn làm rừng nền thành cục xám lam như mây). Mép tầm nhìn: mờ hẳn về màu không khí xa sẫm, khớp
    // chân dãy núi chân trời phía sau (không thành dải sáng)
    float gD = length(vViewPosition);
    vec3 gFar = fogColor * farAir;
    #ifdef FOG_EXP2
    gFar = mix(gFar, fogColor, smoothstep(0.0003, 0.0007, fogDensity));   // sương mù dày: mờ về đúng màu sương (không thành dải sẫm)
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gFar, smoothstep(farFade.x, farFade.y, gD));
  }
  #endif`;
  function hazeFog(sh) {
    sh.uniforms.farFade = BattleTerrain3D.FAR_FADE;
    sh.uniforms.farAir = BattleTerrain3D.FAR_AIR;
    sh.fragmentShader = 'uniform vec2 farFade;\nuniform vec3 farAir;\n' +sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n' + HAZE_GLSL);
  }

  // Toạ độ một trục: [-ext, -half) thưa dần ra xa, [-half, half] đúng theo ô lưới bản đồ, (half, ext] thưa dần
  function axis(half, cell, segs, ext) {
    const outer = [];
    let p = half, st = cell;
    while (p < ext) {
      st = Math.min(p > half + 4200 ? 460 : 185, st * 1.055);   // vùng núi gần mép dày hơn để dáng núi tròn trịa
      p = ext - (p + st) < st * 0.4 ? ext : p + st;
      outer.push(p);
    }
    const a = [];
    for (let i = outer.length - 1; i >= 0; i--) a.push(-outer[i]);
    for (let i = 0; i <= segs; i++) a.push(i === segs ? half : -half + i * cell);
    for (const v of outer) a.push(v);
    return { a, n0: outer.length };
  }

  // Độ cao lấy mẫu theo bước st dọc trục dày (alongX: trục x), nội suy tuyến tính giữa 2 mẫu
  function isoSample(fn, x, z, half, st, cell, alongX) {
    if (st < cell * 1.5) return fn(x, z);
    // bước làm tròn về lũy thừa 2 của ô bản đồ: các cột cùng bậc dùng chung mạng điểm mẫu, mạng bậc thô nằm gọn
    // trong mạng bậc mịn -> các cột cạnh nhau khớp nhau (không lệch thành vệt)
    st = cell * Math.pow(2, Math.round(Math.log2(st / cell)));
    const u = alongX ? x : z, u0 = -half + Math.floor((u + half) / st) * st, t = (u - u0) / st;
    const a = alongX ? fn(u0, z) : fn(x, u0), b = alongX ? fn(u0 + st, z) : fn(x, u0 + st);
    return a + (b - a) * t;
  }

  // Sắc vertex color phủ lên shader mặt đất: rừng xa (mảng xanh đậm), vân đá núi bàn, đỉnh núi đá sáng
  const TINT = {
    DESERT: null,
    URBAN: { forest: [0.56, 0.64, 0.5], density: 0.9 },   // (đồi ngoài phố ngả xanh cỏ: GroundShader, nền đô thị)
    JUNGLE: { forest: [0.42, 0.55, 0.38], density: 1.0 },
    HIGHLAND: { forest: [0.46, 0.53, 0.42], density: 0.8, treeline: 430 },
    RIVER_LAKE: { forest: [0.5, 0.6, 0.42], density: 0.9 }
  };

  // RỪNG XA TRANG TRÍ phủ vành núi & đồi ngoài bản đồ (cây thật của bản đồ chỉ mọc trong vùng chiến đấu):
  // mỗi khóm là một khối tán cây đơn giản (cây lá rộng) hoặc chóp thông, rải theo đúng mặt nạ mảng rừng
  // của vertex color cảnh nền; chỉ mọc ngoài tầm xe chạy tới, không va chạm / không chặn đạn / không đổ bóng.
  const FOREST = {
    // rừng rậm: cây thật của bản đồ leo lên sườn tới ~chân núi + 330 (MapGen 5g) -> rừng nền bắt đầu từ đó, không lùi
    // thành dải sườn trọc (rừng mưa phủ kín núi)
    JUNGLE: { pow: 0.3, r: [18, 28], squash: 0.75, inner: 300, back: 0.12 },
    RIVER_LAKE: { pow: 1.0, r: [13, 21], squash: 0.8, conif: 0.3 },
    URBAN: { pow: 0.7, r: [12, 19], squash: 0.8, conif: 0.22 },
    HIGHLAND: { pow: 1.1, pine: true, r: [8, 12], hgt: [26, 40], treeline: 430 }
  };
  const SP = 50;   // bước lưới rải khóm cây
  // cây xa giả trong vùng chơi: ẩn khi camera cách gốc < FAR_TREE_NEAR + (0..450, ngẫu nhiên theo cây)
  const FAR_TREE_NEAR = 950;
  // Tán lá rộng nhìn xa: 9 búp lá nhỏ lồi lõm mạnh (kiểu súp lơ) xếp thành vòm méo lệch, búp trên nhỏ dần -> viền tán lởm
  // chởm, không thành quả cầu nhẵn; gốc tán tối (bóng tán)
  // detail: 1 = khóm gần vành núi, 0 = búp 20 mặt (khóm xa > ~300 m ngoài mép: vài điểm ảnh, 1/4 tam giác)
  // detail 1: ~25 chùm lá nhỏ (20 mặt) rải trên vỏ vòm tán + lõi tán, đáy tán nhấc khỏi đất, thân sẫm lộ dưới tán -> nhìn gần
  // ra cây (tán thưa có kẽ, viền lởm chởm), không còn 9 búp to tròn đặt sát đất như khối đá / cục bông (~520 mặt, < 720 cũ)
  function clumpGeometry(detail = 1) {
    const rng = MapGen.mulberry32(0x51ab), pos = [], nrm = [], col = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    let lobes = [[0, 0.25, 0, 0.62], [0.5, -0.05, 0.2, 0.5], [-0.45, 0, 0.35, 0.5], [0.05, -0.08, -0.55, 0.52], [-0.4, 0.02, -0.35, 0.45],
      [0.45, 0.05, -0.38, 0.44], [0.2, 0.5, 0.15, 0.42], [-0.22, 0.48, -0.12, 0.4], [0.05, 0.75, 0.02, 0.3]];
    if (detail) {
      // gốc toạ độ khóm: mặt đất ở y ≈ -0.3 (buildForest đặt tâm cao h + 0.3·cỡ)
      const R = MapGen.mulberry32(0x7c31);
      lobes = [[0.04, 0.5, -0.03, 0.42]];
      for (let i = 0; i < 13; i++) {
        const u = R() * 1.7 - 0.7, a = R() * 6.283, s = Math.sqrt(1 - u * u), rad = 0.5 + 0.28 * R();
        lobes.push([Math.cos(a) * s * rad, 0.5 + u * rad * 0.62, Math.sin(a) * s * rad, 0.21 + 0.17 * R()]);
      }
      // thân + 2 cành chạc: lăng trụ 5 cạnh sẫm từ dưới đất lên lõi tán
      const prism = (x0, y0, z0, x1, y1, z1, r0, r1) => {
        for (let k = 0; k < 5; k++) {
          const a0 = k / 5 * 6.283, a1 = (k + 1) / 5 * 6.283;
          const q = [[a0, 0], [a1, 1], [a1, 0], [a0, 0], [a0, 1], [a1, 1]];   // mặt hướng ra ngoài
          for (const [a, t] of q) {
            const r = t ? r1 : r0;
            pos.push((t ? x1 : x0) + Math.cos(a) * r, t ? y1 : y0, (t ? z1 : z0) + Math.sin(a) * r);
            nrm.push(Math.cos(a), 0, Math.sin(a));
            col.push(0.22, 0.2, 0.18);
          }
        }
      };
      prism(0, -0.45, 0, 0.02, 0.35, -0.01, 0.075, 0.05);
      prism(0.02, 0.1, -0.01, 0.28, 0.45, 0.12, 0.04, 0.025);
      prism(0.01, 0.15, 0, -0.22, 0.5, -0.18, 0.035, 0.022);
    }
    for (const [ox, oy, oz, r] of lobes) {
      const g = new THREE.IcosahedronGeometry(1, 0), P = g.attributes.position;
      // cùng một đỉnh (trùng toạ độ) nhận cùng độ lồi lõm -> khối kín, không nứt
      // CHÙM LÁ: pháp tuyến mỗi đỉnh lệch ngẫu nhiên mạnh (chùm lá xoay đủ hướng) + đỉnh lõm vào tối hẳn (kẽ lá khuất
      // sáng). Pháp tuyến cầu mượt thì mỗi búp sáng tối dần đều như quả bóng bay; vân lá trong shader tắt ở xa nên
      // độ lốm đốm phải nằm ở mức đỉnh lưới mới còn khi nhìn xa
      const bump = new Map();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
        if (!bump.has(key)) bump.set(key, [0.62 + rng() * 0.62, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng()]);
        const [k, jx, jy, jz, jc] = bump.get(key);
        n.copy(v).normalize();
        n.set(n.x + jx * 0.75, n.y + jy * 0.75, n.z + jz * 0.75).normalize();
        const y = oy + v.y * r * k * 0.9;
        pos.push(ox + v.x * r * k, y, oz + v.z * r * k);
        nrm.push(n.x, n.y, n.z);
        const ao = (0.4 + 0.6 * Math.max(0, Math.min(1, (y + 0.6) / 1.4))) * (0.45 + 0.55 * Math.min(1, (k - 0.62) / 0.45)) * (0.85 + 0.3 * jc);
        col.push(ao, ao, ao);
      }
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  // Cây thông: 3 tầng chóp 5 cạnh chồng lên nhau thon dần (viền răng cưa), gốc tầng dưới tối. Nhìn từ >1 km chỉ còn vài
  // điểm ảnh -> ít đỉnh (36) là đủ; hàng chục nghìn cây mỗi khung
  // detail 1 (cây gần mép bản đồ / cây xa giả trong vùng chơi — nhìn rõ dáng): 4 tầng tán, mép mỗi tầng lởm chởm — đầu
  // cành chĩa ra & rủ xuống xen kẽ kẽ lõm vào sát thân (kẽ tối, đầu cành sáng), chóp mỗi tầng lệch nhẹ, cỡ cành không đều
  // -> bóng cây răng cưa như thông thật, không còn chồng nón tròn trơn kiểu cây thông Noel đồ chơi.
  // detail 2: 4 tầng × 5 cành (40 tam giác) — thông vành núi sát mép bản đồ, xe tới gần nhìn rõ
  // detail 1: 3 tầng × 4 cành (24 tam giác) — cây xa giả trong vùng chơi (chỉ hiện ngoài ~1 km, hàng chục nghìn cây)
  // detail 0 (rừng xa vành núi, vài điểm ảnh): 3 chóp 5 cạnh, 15 tam giác
  function pineGeometry(detail = 0) {
    if (detail > 0) return pineGeometryRagged(detail > 1 ? 4 : 3, detail > 1 ? 5 : 4);
    const parts = [[0.1, 0.5, 1.0], [0.42, 0.42, 0.7], [0.7, 0.34, 0.4]];
    const pos = [], nrm = [], col = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    // (dựng tay từng tam giác: ConeGeometry có bảng chỉ mục — đọc đỉnh theo thứ tự thô thì tam giác ghép sai thành
    // mảnh dẹt nằm sát đất, cả rừng thông nền thành vụn mảnh)
    const S = 5;
    for (const [y0, hgt, r] of parts) {
      const ny = r / hgt, top = y0 + hgt;
      for (let k = 0; k < S; k++) {
        const a0 = k / S * Math.PI * 2, a1 = (k + 1) / S * Math.PI * 2, am = (a0 + a1) / 2;
        for (const [x, y, z, a] of [[0, top, 0, am], [Math.cos(a1) * r, y0, Math.sin(a1) * r, a1], [Math.cos(a0) * r, y0, Math.sin(a0) * r, a0]]) {
          n.set(Math.cos(a), ny, Math.sin(a)).normalize();
          pos.push(x, y, z); nrm.push(n.x, n.y, n.z);
          const ao = 0.5 + 0.5 * Math.min(1, y);
          col.push(ao, ao, ao);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  // THÔNG SOI KÍNH (cây xa giả, chỉ khi kính ngắm phóng to nhìn rõ từng cây): 7 tầng cành thưa dần lên ngọn, mỗi tầng
  // 6 cành, mỗi cành là một lá dài có sống gờ (2 mặt nghiêng -> một mặt đón nắng, một mặt khuất) + mặt dưới tối; cành
  // chĩa ngang chỉ chúc nhẹ (không xoè váy rủ chồng lên nhau), mặt phẳng từng mảnh (không bóng trơn như chóp nhựa),
  // thân nâu lộ rõ dưới tầng cành thấp nhất. ~140 tam giác — cùng vật liệu rừng nền nên không biên dịch shader mới khi soi kính
  function pineGeometryNear() {
    const rng = MapGen.mulberry32(0x7a11e5), pos = [], nrm = [], col = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const tri = (p0, p1, p2, s0, s1, s2, up) => {
      a.set(...p0); b.set(...p1); c.set(...p2);
      const n = e1.subVectors(b, a).cross(e2.subVectors(c, a)).normalize();
      // mặt trên quay lên, mặt dưới quay xuống (đảo chiều tam giác nếu ngược)
      if ((n.y < 0) === up) { n.negate(); pos.push(...p0, ...p2, ...p1); col.push(s0, s0, s0, s2, s2, s2, s1, s1, s1); }
      else { pos.push(...p0, ...p1, ...p2); col.push(s0, s0, s0, s1, s1, s1, s2, s2, s2); }
      for (let k = 0; k < 3; k++) nrm.push(n.x, n.y, n.z);
    };
    // thân: lăng trụ 5 cạnh, gốc tới giữa cây (phần trên khuất trong tán). Toạ độ ngang nhân cỡ tán (~10) còn dọc nhân chiều
    // cao (~33): bán kính 0,075 -> đường kính ~1/22 chiều cao như thông thật. Màu đỉnh nghiêng đỏ để sau khi nhân màu lá
    // (instanceColor xanh sẫm) còn ra nâu vỏ cây, không tiệp vào tán
    const TR = 0.075;
    for (let k = 0; k < 5; k++) {
      const a0 = k / 5 * 6.2832, a1 = (k + 1) / 5 * 6.2832;
      const q0 = [Math.cos(a0) * TR, 0, Math.sin(a0) * TR], q1 = [Math.cos(a1) * TR, 0, Math.sin(a1) * TR];
      const r0 = [q0[0] * 0.3, 0.92, q0[2] * 0.3], r1 = [q1[0] * 0.3, 0.92, q1[2] * 0.3];
      for (const [p0, p1, p2] of [[q0, r1, q1], [q0, r0, r1]]) {
        a.set(...p0); b.set(...p1); c.set(...p2);
        const n = e1.set((p0[0] + p1[0] + p2[0]) / 3, 0, (p0[2] + p1[2] + p2[2]) / 3).normalize();
        pos.push(...p0, ...p1, ...p2); nrm.push(n.x, 0, n.z, n.x, 0, n.z, n.x, 0, n.z); col.push(1.1, 0.62, 0.5, 1.1, 0.62, 0.5, 1.1, 0.62, 0.5);
      }
    }
    // tầng thấp nhất cách gốc ~1/5 chiều cao (đầu cành chúc xuống vẫn chừa khúc thân trần)
    // LÕI TÁN: nón 5 cạnh sẫm quanh thân từ tầng cành thấp nhất tới gần ngọn (cành trong khuất sáng của thông thật) — lấp
    // khe giữa các tầng, nhìn ngang tán liền một khối thay vì từng khúc cành rời lơ lửng
    for (let k = 0; k < 5; k++) {
      const a0 = k / 5 * 6.2832 + 0.3, a1 = (k + 1) / 5 * 6.2832 + 0.3, rc = 0.34, y0 = 0.2;
      tri([0, 0.97, 0], [Math.cos(a0) * rc, y0, Math.sin(a0) * rc], [Math.cos(a1) * rc, y0, Math.sin(a1) * rc], 0.6, 0.4, 0.4, true);
    }
    const NT = 7, B = 8;
    for (let t = 0; t < NT; t++) {
      const f = t / (NT - 1), y = 0.24 + f * 0.62 + (rng() - 0.5) * 0.03;
      const R = (1 - f) * 0.92 + 0.12, ph = t * 2.4 + rng();
      const shade = 0.55 + 0.35 * f;   // tầng dưới khuất trong rừng tối hơn
      for (let k = 0; k < B; k++) {
        const ang = ph + k / B * 6.2832 + (rng() - 0.5) * 0.6, L = R * (0.6 + 0.5 * rng());
        const ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, pz = ca;
        // cành chúc xuống & bản rộng: mép tầng trên phủ xuống chân tầng dưới (tán liền, không hở khe ngang)
        const droop = L * (0.16 + 0.14 * rng()), w = L * (0.36 + 0.14 * rng());
        // đầu cành tầng dưới không chạm đất: chừa khúc thân trần dưới gốc
        const base = [ca * TR, y + 0.03, sa * TR], tip = [ca * L, Math.max(0.13, y - droop), sa * L];
        // sống cành = đường gốc -> đầu cành; hai mép ở 40% chiều dài thấp hơn sống -> 2 mặt nghiêng + 1 mặt dưới
        const mx = ca * L * 0.42, my = y - droop * 0.35, mz = sa * L * 0.42;
        const lft = [mx + px * w * 0.5, my - w * 0.3, mz + pz * w * 0.5], rgt = [mx - px * w * 0.5, my - w * 0.3, mz - pz * w * 0.5];
        // (màu instance rừng giả rất sẫm — chỉnh cho cây xa vài điểm ảnh; bản soi kính sáng hơn để thấy mặt cành)
        const v = shade * 1.7 * (0.85 + 0.3 * rng()), vt = v * 1.2, vb = v * 0.5;
        tri(base, lft, tip, vb, v, vt, true); tri(base, tip, rgt, vb, vt, v, true);
        tri(lft, tip, rgt, vb * 0.7, vb, vb * 0.7, false);
      }
    }
    // ngọn: chóp 4 cạnh mảnh
    for (let k = 0; k < 4; k++) {
      const a0 = k / 4 * 6.2832 + 0.4, a1 = (k + 1) / 4 * 6.2832 + 0.4, r = 0.07;
      tri([0, 1.0, 0], [Math.cos(a0) * r, 0.84, Math.sin(a0) * r], [Math.cos(a1) * r, 0.84, Math.sin(a1) * r], 1.0, 0.8, 0.8, true);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  // nT: số tầng tán, S: số cành mỗi tầng (mép tầng: 2S điểm — đầu cành / kẽ lõm xen kẽ)
  function pineGeometryRagged(nT, S) {
    // [chân tầng, cao tầng, bán kính] — tầng dưới rộng, chồng lên nhau sâu (không hở thân giữa các tầng)
    const parts = nT > 3 ? [[0.04, 0.36, 1.0], [0.25, 0.33, 0.8], [0.45, 0.3, 0.6], [0.64, 0.36, 0.38]]
      : [[0.05, 0.45, 1.0], [0.35, 0.38, 0.72], [0.6, 0.4, 0.42]];
    const rng = MapGen.mulberry32(0x9e17a5), pos = [], nrm = [], col = [];
    const n = new THREE.Vector3();
    parts.forEach(([y0, hgt, r], ti) => {
      const ph = rng() * 6.2832, top = y0 + hgt;
      // chóp tầng lệch khỏi trục một chút (tầng trên cùng thẳng: ngọn cây không gãy)
      const ox = ti < nT - 1 ? (rng() - 0.5) * 0.06 : 0, oz = ti < nT - 1 ? (rng() - 0.5) * 0.06 : 0;
      const ring = [];
      for (let k = 0; k < 2 * S; k++) {
        const tip = k % 2 === 0, a = ph + k / (2 * S) * 6.2832 + (rng() - 0.5) * 0.25;
        // đầu cành: chĩa xa, rủ xuống dưới chân tầng; kẽ lõm: sát thân & nhô lên (khoảng tối giữa 2 cành)
        const rr = tip ? r * (0.9 + 0.25 * rng()) : r * (0.5 + 0.12 * rng());
        const y = tip ? y0 - r * (0.04 + 0.06 * rng()) : y0 + hgt * (0.12 + 0.08 * rng());
        ring.push([Math.cos(a) * rr, y, Math.sin(a) * rr, a, tip]);
      }
      const ny = r / hgt;
      for (let k = 0; k < 2 * S; k++) {
        const p0 = ring[k], p1 = ring[(k + 1) % (2 * S)];
        let a1 = p1[3]; if (a1 < p0[3]) a1 += 6.2832;
        const am = (p0[3] + a1) / 2;
        for (const [x, y, z, a, tip] of [[ox, top, oz, am, null], [p1[0], p1[1], p1[2], p1[3], p1[4]], [p0[0], p0[1], p0[2], p0[3], p0[4]]]) {
          n.set(Math.cos(a), ny, Math.sin(a)).normalize();
          pos.push(x, y, z); nrm.push(n.x, n.y, n.z);
          // tối dần xuống gốc; kẽ lõm khuất sáng sẫm, đầu cành đón sáng
          const ao = (0.42 + 0.58 * Math.min(1, Math.max(0, y))) * (tip === null ? 1.05 : tip ? 1.12 : 0.62);
          col.push(ao, ao, ao);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }

  function buildForest(T, O, nz, seaLvl, meshH) {
    const isLab = (T.map && T.map.testField) || (typeof window !== 'undefined' && (window.RANGE_LAB || window.STRONGHOLD_LAB || window.FREECAM_LAB || (window.location && window.location.search && window.location.search.includes('lab='))));
    if (isLab) return null;
    const F = FOREST[T.mapType];
    if (!F) return null;
    const rnd = MapGen.mulberry32((T.seed ^ 0x3a7f11) >>> 0);
    const ext = T.width / 2 + 5200, mats = [], cols = [], matsC = [], colsC = [], matsN = [], colsN = [];
    const leaf = T.leafColors ? T.leafColors() : [0x4a5632, 0x58643a];
    const c0 = new THREE.Color(leaf[0]), c1 = new THREE.Color(leaf[1]), c = new THREE.Color();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const H = meshH;
    // MẶT NẠ RỪNG (GroundShader.cover.forest): mỗi cây chấm vào lưới FN² phủ [-ext, ext] -> mặt đất dưới đám rừng vẽ nền
    // rừng sẫm + lốm đốm ngọn cây nổi khối: đám rừng xa liền tán như thật mà không cần đủ từng cây
    const FN = 512, fac = new Float32Array(FN * FN), fk = FN / (2 * ext);
    const splat = (x, z, w) => {
      const i = Math.floor((x + ext) * fk), j = Math.floor((z + ext) * fk);
      if (i >= 0 && j >= 0 && i < FN && j < FN) fac[j * FN + i] += w;
    };
    for (let z = -ext; z <= ext; z += SP) for (let x = -ext; x <= ext; x += SP) {
      const px = x + (rnd() - 0.5) * SP * 0.9, pz = z + (rnd() - 0.5) * SP * 0.9, r1 = rnd(), r2 = rnd(), r3 = rnd();
      // ngoài tầm xe (xe bị giữ trong ±(nửa bản đồ - 60), lòng thung lũng kết thúc ở chân vành núi MapGen rimFoot)
      // bìa rừng theo chân vành núi, lượn sóng; từng đoạn dài lùi hẳn lên sườn (trảng cỏ, sườn trọc) -> bìa rừng không
      // thành một vành tròn đều ôm quanh lòng thung lũng
      const fb = MapGen.fbm(nz, px * 0.0004 - 7, pz * 0.0004 + 3, 2), back = 700 * (F.back === undefined ? 1 : F.back) * Math.max(0, Math.min(1, (fb + 0.05) / 0.3));
      if (Math.hypot(px, pz) < O.rimFoot(px, pz) - 50 + (F.inner || 0) + 90 * nz(px * 0.0016 + 4, pz * 0.0016) + back) continue;
      let fm = smooth(-0.08, 0.28, MapGen.fbm(nz, px * 0.0024, pz * 0.0024, 3));
      // rừng thông: mọc thành từng đám rừng kín (lõi dày đặc, bìa thưa dần) xen trảng cỏ trống, không rắc đều từng cây
      if (F.pine) fm = smooth(-0.05, 0.25, MapGen.fbm(nz, px * 0.0016 + 2.2, pz * 0.0016 - 4.4, 3) + 0.35 * (nz(px * 0.006, pz * 0.006 + 9) - 0.2));
      if (r1 > Math.pow(fm, F.pow)) continue;
      const h = H(px, pz);
      if (seaLvl !== null && h < seaLvl + 7) continue;
      if (F.treeline && h > F.treeline + (r2 - 0.5) * 120) continue;
      const e = 8, gx = (H(px + e, pz) - H(px - e, pz)) / (2 * e), gz = (H(px, pz + e) - H(px, pz - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 0.9) continue;
      // cây thật dồn về sườn vành gần bản đồ (thấy rõ dáng); càng xa càng thưa — ở đó tán rừng liền do mặt đất vẽ
      // (bản đồ mặt nạ rừng splat bên dưới), từng cây chỉ còn 1-2 điểm ảnh
      const dOut = Math.max(Math.abs(px), Math.abs(pz)) - T.width / 2;
      if (rnd() > 1 - 0.85 * smooth(1200, 4500, dOut)) { splat(px, pz, 0.5 * fm); continue; }
      // cỡ cây chênh nhau nhiều (cây non / cây cổ thụ), không đều tăm tắp
      const rr = (F.r[0] + (F.r[1] - F.r[0]) * r2) * (0.65 + 0.7 * rnd());
      // rừng hỗn giao: một phần là cây lá kim nhọn vượt lên trên tán lá rộng
      const conif = F.pine || (F.conif && rnd() < F.conif);
      if (F.pine) { sc.set(rr, F.hgt[0] + (F.hgt[1] - F.hgt[0]) * r3, rr); p.set(px, h - 1, pz); }
      else if (conif) { sc.set(rr * 0.55, rr * (2.2 + 0.8 * r3), rr * 0.55); p.set(px, h - 1, pz); }
      else {
        // lõi mảng rừng: tán to chồng lên nhau thành mảng rừng liền tán; bìa rừng: khóm nhỏ rời
        const big = rr * (0.75 + 0.95 * fm);
        sc.set(big, big * F.squash * (0.85 + 0.3 * r3), big * (0.85 + 0.3 * r1)); p.set(px, h + sc.y * 0.3, pz);
      }
      q.setFromAxisAngle(up, r3 * 6.283);
      m4.compose(p, q, sc);
      splat(px, pz, 0.45);
      // tán lá dày tự che khuất nhau: tối hơn màu lá gốc; lá kim sẫm & ngả lam hơn
      c.copy(c0).lerp(c1, r2).multiplyScalar(0.5 + 0.25 * r3);
      if (F.pine) { c.multiplyScalar(0.68); c.b *= 1.08; }   // lá kim sẫm ngả lam (rừng thông xa đen sẫm như ảnh thật)
      if (conif && !F.pine) { c.multiplyScalar(0.72); c.b *= 1.12; matsC.push(m4.clone()); colsC.push(c.r, c.g, c.b); }
      else { mats.push(m4.clone()); cols.push(c.r, c.g, c.b); }
      // lõi đám thông: thêm 1-4 cây sát quanh (tán khép kín, cây cao thấp chen nhau), bìa đám chỉ cây lẻ
      if (F.pine) for (let t = 0, nt = Math.floor(fm * fm * 4.5); t < nt; t++) {
        const a = rnd() * 6.283, dd = 9 + rnd() * SP * 0.45, qx = px + Math.cos(a) * dd, qz = pz + Math.sin(a) * dd, qh = H(qx, qz);
        if (F.treeline && qh > F.treeline + (r2 - 0.5) * 120) continue;
        const rq = (F.r[0] + (F.r[1] - F.r[0]) * rnd()) * (0.6 + 0.6 * rnd());
        sc.set(rq, (F.hgt[0] + (F.hgt[1] - F.hgt[0]) * rnd()) * (0.6 + 0.5 * rnd()), rq); p.set(qx, qh - 1, qz);
        q.setFromAxisAngle(up, rnd() * 6.283);
        m4.compose(p, q, sc);
        mats.push(m4.clone());
        splat(qx, qz, 0.3);
        c.copy(c0).lerp(c1, rnd()).multiplyScalar(0.3 + 0.2 * rnd());
        cols.push(c.r, c.g * 1.02, c.b * 1.08);
      }
    }
    if (!mats.length && !matsC.length) return null;
    if (typeof GroundShader !== 'undefined' && GroundShader.cover.forest) {
      // cây thật trong bản đồ cũng chấm vào mặt nạ: đám rừng trên đồi trong vùng chơi nhìn từ xa liền tán, sần sùi
      for (const t of (T.map && T.map.trees) || []) if (t.kind !== 'deadTree' && t.kind !== 'cactus') splat(t.x, t.z, 0.4);
      // ĐỒI TRONG VÙNG CHƠI: mảng rừng phủ sườn đồi (chỉ hình ảnh ở xa — shader tắt dần khi lại gần, cây thật mới chặn đạn):
      // ưa sườn dốc, giữa đồi; lòng thung lũng phẳng & đỉnh trọc thưa
      if (F.pine || F.conif) {
        const half = T.width / 2, st = 2 * ext / FN, wet = T.hasWater && T.hasWater();
        for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
          const x = -ext + (i + 0.5) * st, z = -ext + (j + 0.5) * st;
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          const h = H(x, z);
          if (wet && T.getElevationAt(x, z) < T.waterLevel + 1.5) continue;
          if (seaLvl !== null && h < seaLvl + 7) continue;
          if (F.treeline && h > F.treeline) continue;
          const g = Math.hypot(H(x + st, z) - H(x - st, z), H(x, z + st) - H(x, z - st)) / (2 * st);
          const m = MapGen.fbm(nz, x * 0.0011 + 5.1, z * 0.0011 - 2.3, 3) + 0.3 * (nz(x * 0.004, z * 0.004 + 3) - 0.5) + Math.min(0.35, g * 1.4);
          const fw = smooth(0.12, 0.38, m);
          fac[j * FN + i] += 0.9 * fw;
          // CÂY XA GIẢ (chỉ rừng thông): 2-5 cây mỗi ô (lõi mảng rừng) theo độ đậm mảng rừng -> sống đồi xa có răng cưa ngọn thông.
          // Không va chạm; vertex shader thu nhỏ về 0 khi camera trong ~1 km (lại gần chỉ còn cây thật)
          if (F.pine && fw > 0.35) {
            const gh = T.getElevationAt ? (px, pz) => T.getElevationAt(px, pz) : H;
            // đám cây chụm quanh 1 tâm trong ô (không rắc lẻ tẻ khắp ô); bìa mảng rừng (mật độ thấp) bỏ hẳn, không cây lẻ
            const nt = Math.round(fw * fw * 4.5 + rnd() * 0.5);
            const gx0 = x + (rnd() - 0.5) * st * 0.5, gz0 = z + (rnd() - 0.5) * st * 0.5;
            for (let t = 0; nt >= 2 && t < nt; t++) {
              const qx = gx0 + (rnd() - 0.5) * st * 0.55, qz = gz0 + (rnd() - 0.5) * st * 0.55, qh = gh(qx, qz);
              if (F.treeline && qh > F.treeline + (rnd() - 0.5) * 120) continue;
              if (wet && qh < T.waterLevel + 1.5) continue;   // không mọc giữa hồ / suối
              const rq = (F.r[0] + (F.r[1] - F.r[0]) * rnd()) * (0.75 + 0.6 * rnd());
              sc.set(rq, (F.hgt[0] + (F.hgt[1] - F.hgt[0]) * rnd()) * (0.75 + 0.5 * rnd()), rq); p.set(qx, qh - 1, qz);
              q.setFromAxisAngle(up, rnd() * 6.283);
              m4.compose(p, q, sc);
              matsN.push(m4.clone());
              c.copy(c0).lerp(c1, rnd()).multiplyScalar(0.3 + 0.2 * rnd());
              colsN.push(c.r, c.g * 1.02, c.b * 1.08);
            }
          }
        }
      }
      // làm mềm 2 lượt 3x3 -> mép đám rừng lượn tự nhiên, không lộ ô lưới
      let a = fac, b = new Float32Array(FN * FN);
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
          let sum = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = Math.min(FN - 1, Math.max(0, i + di)), jj = Math.min(FN - 1, Math.max(0, j + dj));
            sum += a[jj * FN + ii];
          }
          b[j * FN + i] = sum / 9;
        }
        const t = a; a = b; b = t;
      }
      const px8 = new Uint8Array(FN * FN);
      for (let k = 0; k < FN * FN; k++) px8[k] = Math.min(255, a[k] * 1.6 * 255);
      const tex = new THREE.DataTexture(px8, FN, FN, THREE.LuminanceFormat);
      tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
      const U = GroundShader.cover.forest;
      if (U.map.value && U.map.value.dispose) U.map.value.dispose();
      U.map.value = tex; U.xf.value.set(ext, 1 / (2 * ext), 1, 0);
    }
    // vân chùm lá trên tán: đốm sáng (chùm lá đón nắng) / tối (kẽ lá) theo toạ độ thế giới, mờ dần khi nhỏ hơn điểm ảnh
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      // pháp tuyến tán ngả lên trời: khối tán xa đổ bóng như mặt rừng gồ ghề, không thành từng cục bông tròn sáng viền
      sh.vertexShader = 'varying vec3 vFw;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.5));`).replace('#include <begin_vertex>', `#include <begin_vertex>
        vFw =(modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = `varying vec3 vFw;
float fHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fHash(i), fHash(i + vec3(1, 0, 0)), f.x), mix(fHash(i + vec3(0, 1, 0)), fHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fHash(i + vec3(0, 0, 1)), fHash(i + vec3(1, 0, 1)), f.x), mix(fHash(i + vec3(0, 1, 1)), fHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float pw = length(fwidth(vFw));
          float lv = fNoise(vFw * 0.32) * 0.6 + fNoise(vFw * 0.8 + 3.1) * 0.4;
          diffuseColor.rgb *= mix(1.0, 0.68 + 0.6 * lv, 1.0 - smoothstep(1.5, 5.0, pw));
        }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        if (gSunXf.w > 0.0) {
          // rừng trong bóng sống núi tối theo mặt đất dưới gốc (bóng nắng + AO nướng sẵn, bakeSun)
          vec2 sv = texture2D(gSunMap, (vFw.xz - gSunXf.xy) * gSunXf.z).rg;
          reflectedLight.directDiffuse *= sv.r;
          reflectedLight.indirectDiffuse *= sv.g;
        }`);
      sh.fragmentShader = 'uniform sampler2D gSunMap;\nuniform vec4 gSunXf;\n' + sh.fragmentShader;
      const SU = typeof GroundShader !== 'undefined' && GroundShader.sun;
      sh.uniforms.gSunMap = SU ? SU.map : { value: null };
      sh.uniforms.gSunXf = SU ? SU.xf : { value: new THREE.Vector4(0, 0, 1, 0) };
      hazeFog(sh);
    };
    mat.customProgramCacheKey = () => 'backdropForest5';
    const mk = (geo, list, cl, name) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cl), 3);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = name;
      mesh.frustumCulled = false;
      return mesh;
    };
    const grp = new THREE.Group();
    grp.name = 'backdropForest';
    // RỪNG NỀN THEO Ô: vành rừng chia ô lưới CELL x CELL, mỗi ô 1 InstancedMesh có khối bao riêng -> camera chỉ vẽ ô trong
    // khung nhìn (cũ: 1 mesh tắt kiểm tra khuất, cả vòng 360° ~15 triệu tam giác mỗi khung dù sau lưng / chìm sương).
    // Mỗi ô 2 bản dùng chung bộ đệm ma trận + màu: bản gần (búp 80 mặt / thông răng cưa) khi camera cách khối bao ô < nearD,
    // xa hơn bản đơn giản (búp 20 mặt / chóp nón) — đổi theo camera mỗi khung (forest.userData.lod, gọi từ game.render).
    // Bản trước chia gần / xa theo cự ly tới MÉP bản đồ: rừng dồn dày sát mép (JUNGLE ~33 nghìn khóm trong 600 đv) nên từ
    // giữa bản đồ nhìn sang mép bên kia (> 8 km) vẫn vẽ bản 720 tg / khóm — đo 2026-10-29: rừng nền JUNGLE 13 triệu tg / khung
    const CELL = 2000, BD_NEAR = 950, BD_ZOOM = 780, BD_HYST = 120, cells = [];
    const geoOf = (src, sphere) => {
      const g = new THREE.BufferGeometry();
      for (const a in src.attributes) g.setAttribute(a, src.attributes[a]);
      if (src.index) g.setIndex(src.index);
      g.boundingSphere = sphere;
      return g;
    };
    // geoZoom: bậc thứ ba khi kính ngắm phóng to (>= ~2,2×) mà ô trông gần — dáng thông chi tiết pineGeometryNear; chơi
    // thường (1×) không bao giờ dùng nên không thêm tam giác. Cả 3 bản dùng chung bộ đệm ma trận + màu, cùng vật liệu
    const mkSectors = (geoNear, geoFar, list, cl, name, nearD = BD_NEAR, geoZoom = null) => {
      const B = new Map();
      list.forEach((m4, i) => {
        const e = m4.elements, k = Math.floor(e[12] / CELL) * 65536 + Math.floor(e[14] / CELL);
        let b = B.get(k);
        if (!b) B.set(k, b = { m: [], c: [] });
        b.m.push(m4);
        b.c.push(cl[i * 3], cl[i * 3 + 1], cl[i * 3 + 2]);
      });
      const out = [];
      for (const b of B.values()) {
        // khối bao cả ô: tâm trung bình các gốc cây, bán kính tới gốc xa nhất + tầm cao / tán cây lớn nhất
        let cx = 0, cy = 0, cz = 0;
        for (const m4 of b.m) { cx += m4.elements[12]; cy += m4.elements[13]; cz += m4.elements[14]; }
        cx /= b.m.length; cy /= b.m.length; cz /= b.m.length;
        let r = 0;
        for (const m4 of b.m) r = Math.max(r, Math.hypot(m4.elements[12] - cx, m4.elements[13] - cy, m4.elements[14] - cz));
        const sphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), r + 160);
        const near = mk(geoOf(geoNear, sphere), b.m, b.c, name);
        near.frustumCulled = true;
        out.push(near);
        const twin = (geo) => {
          if (!geo) return null;
          const t = new THREE.InstancedMesh(geoOf(geo, sphere), near.material, b.m.length);
          t.instanceMatrix = near.instanceMatrix;
          t.instanceColor = near.instanceColor;
          t.name = name;
          t.frustumCulled = true;
          t.visible = false;
          out.push(t);
          return t;
        };
        const far = twin(geoFar), zoom = twin(geoZoom);
        if (far || zoom) cells.push({ sphere, near, far, zoom, nearD, lvl: 1 });
      }
      return out;
    };
    // thông vành núi: lại gần (xe chạy sát mép nhìn rõ từng cây) dùng dáng răng cưa, xa hơn chóp nón đơn giản
    const pineZ = F.pine ? pineGeometryNear() : null;
    if (mats.length) for (const m of mkSectors(F.pine ? pineGeometry(2) : clumpGeometry(1), F.pine ? pineGeometry(0) : clumpGeometry(0), mats, cols, 'backdropForestA', F.pine ? 1600 : BD_NEAR, pineZ)) grp.add(m);
    if (matsC.length) for (const m of mkSectors(pineGeometry(2), pineGeometry(0), matsC, colsC, 'backdropForestC', 1600, pineGeometryNear())) grp.add(m);
    // chọn bản xa / gần / soi kính từng ô theo camera (cự ly tới mép khối bao ô, có khoảng đệm chống nhấp nháy)
    grp.userData.lod = (cam) => {
      const p = cam.position;
      // cự ly biểu kiến: kính ngắm phóng 10× (fov 4,5°) thì ô cách 8 km trông như 800 m -> dùng bản chi tiết (khung nhìn hẹp
      // nên số ô phải vẽ ít hẳn đi, tổng tam giác không tăng)
      const zk = Math.tan((cam.fov || 45) * Math.PI / 360) / Math.tan(Math.PI / 8);
      for (const C of cells) {
        const d = (p.distanceTo(C.sphere.center) - C.sphere.radius) * zk;
        const nearOK = C.lvl >= 1 ? d < C.nearD + BD_HYST : d < C.nearD - BD_HYST;
        // bậc soi kính hẹp hơn bậc gần (ô trông cách < ~900): mỗi cây ~140 tg, chỉ nơi thấy rõ từng cây
        const zOK = C.lvl === 2 ? d < BD_ZOOM + BD_HYST : d < BD_ZOOM - BD_HYST;
        const lvl = C.zoom && zk < 0.45 && zOK ? 2 : nearOK || !C.far ? 1 : 0;
        if (lvl === C.lvl) continue;
        C.lvl = lvl; C.near.visible = lvl === 1;
        if (C.far) C.far.visible = lvl === 0;
        if (C.zoom) C.zoom.visible = lvl === 2;
      }
    };
    if (matsN.length) {
      // cây xa giả trong vùng chơi: cùng vật liệu + thu nhỏ theo khoảng cách ngang tới camera (gốc cây đứng yên)
      const matN = mat.clone();
      matN.onBeforeCompile = (sh, r) => {
        mat.onBeforeCompile(sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // mỗi cây một ngưỡng ẩn riêng (950-1400) & tắt gọn trong 40 đv: không còn dải cây co nhỏ trông như cây non lẻ tẻ
          vec3 tIp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float tTh = ${FAR_TREE_NEAR.toFixed(1)} + 450.0 * fract(sin(dot(tIp.xz, vec2(12.9898, 78.233))) * 43758.5453);
          transformed *= smoothstep(tTh, tTh + 40.0, length(tIp.xz - cameraPosition.xz));
        }`);
      };
      matN.customProgramCacheKey = () => 'backdropForestFar2';
      // chia múi như rừng vành núi (cũ: 1 mesh tắt kiểm tra khuất, ~85 nghìn cây vẽ mọi khung kể cả sau lưng)
      for (const mN of mkSectors(pineGeometry(1), null, matsN, colsN, 'backdropForestFar', BD_NEAR, pineZ || pineGeometryNear())) { mN.material = matN; grp.add(mN); }
    }
    return grp;
  }

  // ĐẢO XA: mỗi đảo một ô lưới vuông riêng ô 14-40 (lưới cảnh nền ở đó ô 460 -> đỉnh nhọn hình nón, không dựng nổi vách
  // đá / bãi cát / khe suối), gộp chung một lưới; bỏ ô chìm sâu dưới đáy biển
  function buildIsles(T, O, isles, seaLvl, tint, forestN) {
    const pos = [], nrm = [], uv = [], col = [], tri = [];
    const hAt = (x, z) => O.isleAt(x, z);
    for (const I of isles) {
      const ext = I.ext, cell = Math.max(14, Math.min(40, I.r / 28)), n = Math.ceil(2 * ext / cell), st = 2 * ext / n;
      const x0 = I.x - ext, z0 = I.z - ext, N1 = n + 1, H = new Float32Array(N1 * N1);
      for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) H[j * N1 + i] = hAt(x0 + i * st, z0 + j * st);
      const base = pos.length / 3, ix = new Int32Array(N1 * N1).fill(-1);
      const deep = seaLvl - 14;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        if (Math.max(H[a], H[b], H[c], H[d]) < deep) continue;
        for (const q of [a, b, c, d]) if (ix[q] < 0) {
          ix[q] = pos.length / 3;
          const qi = q % N1, qj = (q - qi) / N1, x = x0 + qi * st, z = z0 + qj * st, h = H[q];
          // pháp tuyến: sai phân trung tâm (mép ô lấy thẳng hàm độ cao)
          const hl = qi > 0 ? H[q - 1] : hAt(x - st, z), hr = qi < n ? H[q + 1] : hAt(x + st, z);
          const hd = qj > 0 ? H[q - N1] : hAt(x, z - st), hu = qj < n ? H[q + N1] : hAt(x, z + st);
          const gx = (hr - hl) / (2 * st), gz = (hu - hd) / (2 * st), l = Math.hypot(gx, 1, gz);
          pos.push(x, h, z); nrm.push(-gx / l, 1 / l, -gz / l);
          uv.push(0.5 + x / T.width, 0.5 - z / T.depth);
          const slope = 1 - 1 / l, e = h - seaLvl;
          let r = 1, g = 1, bl = 1;
          if (tint) {
            // rừng phủ sườn thoải trên mép nước; vách dốc trọc
            const f = smooth(-0.15, 0.2, forestN(x, z)) * (1 - smooth(0.38, 0.62, slope)) * smooth(4, 16, e) * tint.density;
            r += (tint.forest[0] - 1) * f; g += (tint.forest[1] - 1) * f; bl += (tint.forest[2] - 1) * f;
          }
          // vách đá lộ: xám nâu sáng, chân vách sẫm ẩm (vệt muối / rêu ngấn sóng)
          const rk = smooth(0.42, 0.7, slope);
          r = r * (1 - rk) + 1.08 * rk; g = g * (1 - rk) + 1.02 * rk; bl = bl * (1 - rk) + 0.94 * rk;
          const wet = (1 - smooth(1.5, 5, e)) * rk;
          r *= 1 - 0.3 * wet; g *= 1 - 0.28 * wet; bl *= 1 - 0.22 * wet;
          // bãi cát
          const bc = smooth(-2, 0.5, e) * (1 - smooth(3, 6, e)) * (1 - rk);
          r *= 1 + 0.34 * bc; g *= 1 + 0.3 * bc; bl *= 1 + 0.2 * bc;
          if (e < 0) { const w = smooth(0, 10, -e); r *= 1 - 0.25 * w; g *= 1 - 0.2 * w; bl *= 1 - 0.15 * w; }
          col.push(r, g, bl);
        }
        tri.push(ix[a], ix[c], ix[b], ix[b], ix[c], ix[d]);
      }
    }
    if (!tri.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // BÓNG NẮNG + AO NƯỚNG SẴN cho cả lòng bản đồ lẫn cảnh nền (GroundShader.sun): lưới N² phủ [-ext, ext], ô ~34 đv.
  // Bóng: quét từng hàng theo hướng nắng, mỗi ô mang "độ cao tia nắng" của ô phía mặt trời trừ đi độ rơi một bước
  // (S = max(H, S_trước - bước·tan góc nắng)) -> ô nằm dưới tia = trong bóng; một lượt O(N²), không dò tia từng ô.
  // AO: chênh với độ cao trung bình tầm ~350 đv (lòng thung / khe núi khuất bớt bầu trời)
  function bakeSun(T, ext, H, ax, NA, O, isles) {
    const U = typeof GroundShader !== 'undefined' && GroundShader.sun;
    const sd = T.atmosphere && T.atmosphere.sunDir;
    if (!U || !sd) return;
    const N = 1024, px = 2 * ext / N;
    // ô lưới cảnh nền chứa mỗi cột / hàng điểm ảnh (trục tăng dần -> quét một lượt) + tỉ lệ trong ô
    const cellOf = (out, frac) => {
      let c = 0;
      for (let i = 0; i < N; i++) {
        const v = -ext + (i + 0.5) * px;
        while (c < NA - 2 && ax[c + 1] <= v) c++;
        out[i] = c; frac[i] = Math.max(0, Math.min(1, (v - ax[c]) / (ax[c + 1] - ax[c])));
      }
    };
    const ci = new Int32Array(N), tf = new Float32Array(N);
    cellOf(ci, tf);
    const Hm = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const cj = ci[j], tz = tf[j];
      for (let i = 0; i < N; i++) {
        const c = ci[i], tx = tf[i];
        const a = H[cj * NA + c], b = H[cj * NA + c + 1], cc = H[(cj + 1) * NA + c], d = H[(cj + 1) * NA + c + 1];
        // (kẹp đáy: vài bản đồ có nút lưới sâu bất thường hàng chục nghìn đv, đừng để nó loang bóng / AO ra xung quanh)
        Hm[j * N + i] = Math.max(-300, tx + tz <= 1 ? a + (b - a) * tx + (cc - a) * tz : d + (cc - d) * (1 - tx) + (b - d) * (1 - tz));
      }
    }
    if (isles) for (const I of isles) {
      const r = (I.ext || I.r || 0) + px, i0 = Math.max(0, Math.floor((I.x - r + ext) / px)), i1 = Math.min(N - 1, Math.ceil((I.x + r + ext) / px));
      const j0 = Math.max(0, Math.floor((I.z - r + ext) / px)), j1 = Math.min(N - 1, Math.ceil((I.z + r + ext) / px));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * N + i, h = O.isleAt(-ext + (i + 0.5) * px, -ext + (j + 0.5) * px);
        if (h > Hm[k]) Hm[k] = h;
      }
    }
    // a) bóng: trục chính = trục ngang của hướng nắng dài hơn, trục phụ lệch |dm| <= 1 ô mỗi bước (nội suy tuyến tính)
    const sl = Math.hypot(sd.x, sd.z), out = new Uint8Array(N * N * 4);
    const S = new Float32Array(Hm);
    if (sl > 1e-3) {
      const alongX = Math.abs(sd.x) >= Math.abs(sd.z);
      const dM = alongX ? Math.sign(sd.x) : Math.sign(sd.z), dm = alongX ? sd.z / Math.abs(sd.x) : sd.x / Math.abs(sd.z);
      const drop = px * Math.hypot(1, dm) * Math.max(0.02, sd.y) / sl;
      const at = (M, m) => alongX ? m * N + M : M * N + m;
      for (let s = 1; s < N; s++) {
        const M = dM > 0 ? N - 1 - s : s, Mp = M + dM;   // ô phía mặt trời đã tính ở bước trước
        for (let m = 0; m < N; m++) {
          const mm = m + dm;
          if (mm < 0 || mm > N - 1) continue;
          const m0 = Math.min(N - 2, Math.floor(mm)), f = mm - m0;
          const up = S[at(Mp, m0)] * (1 - f) + S[at(Mp, m0 + 1)] * f - drop, k = at(M, m);
          if (up > S[k]) S[k] = up;
        }
      }
    }
    // b) AO: trung bình hộp 2 lượt tách trục (gần Gauss), bán kính 10 ô
    const R = 10, tmp = new Float32Array(N * N), Hb = new Float32Array(N * N);
    const boxPass = (src, dst, stepI) => {
      for (let L = 0; L < N; L++) {
        let sum = 0;
        const base = (k) => stepI ? L * N + k : k * N + L;
        for (let k = -R; k <= R; k++) sum += src[base(Math.max(0, Math.min(N - 1, k)))];
        for (let k = 0; k < N; k++) {
          dst[base(k)] = sum / (2 * R + 1);
          sum += src[base(Math.min(N - 1, k + R + 1))] - src[base(Math.max(0, k - R))];
        }
      }
    };
    boxPass(Hm, tmp, true); boxPass(tmp, Hb, false); boxPass(Hb, tmp, true); boxPass(tmp, Hb, false);
    const soft = 2 + 1.5 * Math.max(4, sl > 1e-3 ? px * Math.max(0.02, sd.y) / sl : 0);
    for (let k = 0; k < N * N; k++) {
      const vis = 1 - smooth(2, 2 + soft, S[k] - Hm[k]);
      const ao = 1 - 0.3 * smooth(0, 130, Hb[k] - Hm[k]);
      out[k * 4] = Math.round(vis * 255); out[k * 4 + 1] = Math.round(ao * 255); out[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    if (U.map.value && U.map.value.dispose) U.map.value.dispose();
    U.map.value = tex;
    U.xf.value.set(-ext, -ext, 1 / (2 * ext), 1);
  }

  function build(T) {
    const O = T.map && T.map.outer;
    // bản đồ không có cảnh nền: tắt bóng nướng của bản đồ trước (không đè bóng núi cũ lên địa hình mới)
    if (typeof GroundShader !== 'undefined' && GroundShader.sun) GroundShader.sun.xf.value.w = 0;
    if (!O || typeof THREE === 'undefined') return null;
    const half = T.width / 2, S = T.segments, NG = S + 1, cell = T.width / S;
    const { a: ax, n0 } = axis(half, cell, S, O.ext);
    const NA = ax.length;
    const inner = i => i >= n0 && i <= n0 + S;
    const seaLvl = O.sea ? O.seaLevel : null;
    // đảo xa dựng lưới mịn riêng (buildIsles): lưới thưa chỉ lấy đáy biển dưới đảo
    const isles = O.isleAt && O.islands && O.islands.length ? O.islands : null;
    const baseH = isles ? (x, z) => O.heightAt(x, z, true) : O.heightAt;

    // lấy mẫu một hàm (độ cao, mặt nạ rừng...) tại nút (i, j): ở dải lưới dọc cạnh bản đồ (một chiều dày, chiều kia thưa)
    // lấy theo bước thưa ở cả hai chiều rồi nội suy -> không thành vệt sọc dọc trục
    const iso = (fn, i, j) => {
      const x = ax[i], z = ax[j];
      if (inner(i) && !inner(j) && j > 0 && j < NA - 1) return isoSample(fn, x, z, half, Math.max(ax[j + 1] - ax[j], ax[j] - ax[j - 1]), cell, true);
      if (inner(j) && !inner(i) && i > 0 && i < NA - 1) return isoSample(fn, x, z, half, Math.max(ax[i + 1] - ax[i], ax[i] - ax[i - 1]), cell, false);
      return fn(x, z);
    };
    // số ô bản đồ trong một bước lấy mẫu thưa của dải có nút thưa idx (khớp isoSample)
    const isoK = (idx) => {
      if (idx <= 0 || idx >= NA - 1) return 1;
      const st = Math.max(ax[idx + 1] - ax[idx], ax[idx] - ax[idx - 1]);
      return st < cell * 1.5 ? 1 : Math.pow(2, Math.round(Math.log2(st / cell)));
    };
    // 1. ĐỘ CAO mọi nút lưới (trong bản đồ lấy đúng lưới địa hình -> pháp tuyến ở mép tính liền mạch)
    const H = new Float32Array(NA * NA);
    const edgeDelta = new Map();
    for (let j = 0; j < NA; j++) {
      const z = ax[j];
      for (let i = 0; i < NA; i++) {
        const x = ax[i];
        if (inner(i) && inner(j)) { H[j * NA + i] = T.heightData[(j - n0) * NG + (i - n0)]; continue; }
        // chỗ lưới địa hình đã bị sửa sát mép (nếu có): chênh lệch ở mép mờ dần ra ngoài
        const ci = Math.max(n0, Math.min(n0 + S, i)), cj = Math.max(n0, Math.min(n0 + S, j));
        const key = cj * NA + ci;
        let dl = edgeDelta.get(key);
        if (dl === undefined) { dl = T.heightData[(cj - n0) * NG + (ci - n0)] - baseH(ax[ci], ax[cj]); edgeDelta.set(key, dl); }
        const dOut = Math.hypot(x - ax[ci], z - ax[cj]);
        // dải lưới thẳng ra từ cạnh bản đồ: một chiều dày (theo ô bản đồ), chiều kia thưa -> lấy mẫu độ cao theo
        // bước thưa ở cả hai chiều rồi nội suy (không thành vệt sọc dọc trục)
        H[j * NA + i] = iso(baseH, i, j) + dl * (1 - smooth(0, 400, dOut));
      }
    }

    // 2. ĐỈNH: chỉ các nút trên mép hoặc ngoài bản đồ
    const idx = new Int32Array(NA * NA).fill(-1);
    let nv = 0;
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) {
      if (inner(i) && inner(j) && i > n0 && i < n0 + S && j > n0 && j < n0 + S) continue;
      idx[j * NA + i] = nv++;
    }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const dep = O.sea ? new Float32Array(nv) : null;
    const rng = MapGen.mulberry32((T.seed ^ 0x7f0e57) >>> 0), nz = MapGen.makeNoise(rng);
    const tint = TINT[T.mapType] || null;
    const forestN = (x, z) => MapGen.fbm(nz, x * 0.0024, z * 0.0024, 3);
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) {
      const v = idx[j * NA + i];
      if (v < 0) continue;
      const x = ax[i], z = ax[j], h = H[j * NA + i];
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      // pháp tuyến: sai phân trung tâm trên lưới không đều
      // dải dọc cạnh bản đồ: độ cao tuyến tính từng khúc theo bước thưa -> sai phân trên cùng bước đó cho pháp tuyến mượt
      // (sai phân 1 ô làm sáng tối đổi đột ngột ở mỗi điểm mẫu thành vệt sọc)
      const kx = inner(i) && !inner(j) ? isoK(j) : 1, kz = inner(j) && !inner(i) ? isoK(i) : 1;
      const i0 = Math.max(0, i - kx), i1 = Math.min(NA - 1, i + kx), j0 = Math.max(0, j - kz), j1 = Math.min(NA - 1, j + kz);
      const dx = (H[j * NA + i1] - H[j * NA + i0]) / (ax[i1] - ax[i0]), dz = (H[j1 * NA + i] - H[j0 * NA + i]) / (ax[j1] - ax[j0]);
      const l = Math.hypot(dx, 1, dz);
      nrm[v * 3] = -dx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -dz / l;
      // uv bám mép bản đồ: sắc tầng lớn ở mép kéo dài ra (shader tự làm trung tính dần ngoài bản đồ)
      uv[v * 2] = 0.5 + x / T.width;
      uv[v * 2 + 1] = 0.5 - z / T.depth;
      const dOut = Math.hypot(x - Math.max(-half, Math.min(half, x)), z - Math.max(-half, Math.min(half, z)));
      const k = smooth(150, 700, dOut);   // sát mép giữ đúng màu mặt đất trong bản đồ
      let r = 1, g = 1, b = 1;
      const slope = 1 - 1 / l;
      if (tint) {
        let f = smooth(-0.08, 0.28, iso(forestN, i, j)) * (1 - smooth(0.42, 0.7, slope)) * tint.density * k;
        if (seaLvl !== null) f *= smooth(seaLvl + 4, seaLvl + 14, h);
        if (tint.treeline) f *= 1 - smooth(tint.treeline - 80, tint.treeline + 60, h);
        r = 1 + (tint.forest[0] - 1) * f; g = 1 + (tint.forest[1] - 1) * f; b = 1 + (tint.forest[2] - 1) * f;
      }
      if (T.mapType === 'DESERT') {
        // vách núi bàn: vân đá trầm tích theo độ cao, đỉnh cao ngả đỏ gạch
        const band = 1 + 0.1 * Math.sin(h * 0.11 + nz(x * 0.003, z * 0.003) * 1.5) * smooth(0.3, 0.6, slope);
        // (vành núi đá vàng nâu: GroundShader tự tô theo chân vành núi — chỉ ngả ấm rất nhẹ, không nhuộm đỏ hồng)
        const red = smooth(70, 190, h) * k * 0.4;
        r = (1 + 0.05 * red) * (1 + (band - 1) * k * 0.5); g = (1 - 0.02 * red) * (1 + (band - 1) * k * 0.5); b = (1 - 0.08 * red) * (1 + (band - 1) * k * 0.5);
      }
      if (T.mapType === 'HIGHLAND') {
        // sườn dốc lộ đá granite xám sáng, đỉnh cao có vệt đá sáng / tuyết đọng lốm đốm
        const rockK = smooth(0.3, 0.6, slope) * k;
        r = r * (1 - 0.15 * rockK) + 0.12 * rockK; g = g * (1 - 0.15 * rockK) + 0.12 * rockK; b = b * (1 - 0.1 * rockK) + 0.14 * rockK;
        const sn = smooth(500, 720, h + nz(x * 0.004, z * 0.004) * 60) * (1 - smooth(0.55, 0.85, slope) * 0.5);
        r += (1.45 - r) * sn; g += (1.45 - g) * sn; b += (1.55 - b) * sn;
      }
      if (seaLvl !== null) {
        // bãi biển: cát sáng, ấm hơn cát phù sa ven sông
        const bc = smooth(-2, 0.5, h - seaLvl) * (1 - smooth(3.5, 6, h - seaLvl)) * k;
        r *= 1 + 0.34 * bc; g *= 1 + 0.3 * bc; b *= 1 + 0.2 * bc;
      }
      if (seaLvl !== null && h < seaLvl) { const w = smooth(0, 10, seaLvl - h); r *= 1 - 0.25 * w; g *= 1 - 0.2 * w; b *= 1 - 0.15 * w; }
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b;
      // quanh đảo xa: độ sâu theo đáy thật có đảo (vùng nước nông sáng màu ven đảo), không âm (mặt biển phủ kín dưới đảo)
      if (dep) dep[v] = isles && h < seaLvl ? Math.max(0.6, seaLvl - Math.max(h, O.isleAt(x, z))) : seaLvl - h;
    }

    // 3. TAM GIÁC: bỏ các ô nằm trong bản đồ; mặt biển chỉ ở ô có nước
    const tri = [], triSea = [];
    for (let j = 0; j < NA - 1; j++) for (let i = 0; i < NA - 1; i++) {
      if (i >= n0 && i + 1 <= n0 + S && j >= n0 && j + 1 <= n0 + S) continue;
      const a = idx[j * NA + i], b = idx[j * NA + i + 1], c = idx[(j + 1) * NA + i], d = idx[(j + 1) * NA + i + 1];
      tri.push(a, c, b, b, c, d);
      if (dep && Math.max(dep[a], dep[b], dep[c], dep[d]) > -3) triSea.push(a, c, b, b, c, d);
    }

    const group = new THREE.Group();
    group.name = 'backdrop';
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({ map: T.groundTexture, vertexColors: true, roughness: T.mapType === 'URBAN' ? 0.82 : 0.95, metalness: 0.0 });
    if (typeof GroundShader !== 'undefined') {
      // biển: dải cát rộng hơn ven sông (bãi biển cao tới ~4 đơn vị trên mặt nước)
      GroundShader.apply(mat, { mapType: T.mapType, macroCanvas: T.groundCanvas, water: O.sea || (T.hasWater ? T.hasWater() : !!(T.map.river || T.map.lakes.length)), waterLvl: O.sea ? 3.0 : undefined, terrain: T, ownNormals: true });
      const base = mat.onBeforeCompile, key = mat.customProgramCacheKey;
      mat.onBeforeCompile = (sh, r) => {
        base(sh, r);
        hazeFog(sh);
      };
      mat.customProgramCacheKey = () => key() + ':haze';
    } else {
      mat.map = null;
      mat.color.setHex(T.atmosphere ? T.atmosphere.ground : 0x806a50);
    }
    const land = new THREE.Mesh(geo, mat);
    land.name = 'backdropLand';
    land.receiveShadow = true;
    group.add(land);
    // đảo xa: cùng vật liệu mặt đất cảnh nền
    const isleGeo = isles ? buildIsles(T, O, isles, seaLvl, tint, forestN) : null;
    if (isleGeo) {
      const im = new THREE.Mesh(isleGeo, mat);
      im.name = 'backdropIsles';
      im.receiveShadow = true;
      group.add(im);
    }

    let sea = null;
    if (dep && triSea.length) {
      const sg = new THREE.BufferGeometry();
      const sp = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) { sp[v * 3] = pos[v * 3]; sp[v * 3 + 2] = pos[v * 3 + 2]; }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const up = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) up[v * 3 + 1] = 1;
      sg.setAttribute('normal', new THREE.BufferAttribute(up, 3));
      sg.setAttribute('aDep', new THREE.BufferAttribute(dep, 1));
      sg.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(triSea, 1) : new THREE.Uint16BufferAttribute(triSea, 1));
      sg.computeBoundingSphere();
      sea = new THREE.Mesh(sg, T.waterMaterial(true).mat);
      sea.name = 'backdropSea';
      sea.position.y = seaLvl;
      sea.renderOrder = 2;
      group.add(sea);
    }
    // độ cao đúng mặt lưới cảnh nền -> cây đứng sát mặt đất nhìn thấy. Nội suy theo đúng 2 tam giác của ô (a,c,b) / (b,c,d)
    // như lưới dựng ở trên: ô xa rộng 185-460, nội suy song tuyến trên sống núi cao hơn mặt tam giác hàng chục đv -> gốc cây
    // lơ lửng trên không
    const findCell = (v) => { let lo = 0, hi = NA - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ax[m] <= v) lo = m; else hi = m; } return lo; };
    const meshH0 = (x, z) => {
      const i = findCell(x), j = findCell(z), tx = (x - ax[i]) / (ax[i + 1] - ax[i]), tz = (z - ax[j]) / (ax[j + 1] - ax[j]);
      const a = H[j * NA + i], b = H[j * NA + i + 1], c = H[(j + 1) * NA + i], d = H[(j + 1) * NA + i + 1];
      return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    };
    // cây trên đảo xa đứng theo mặt đảo (lưới mịn ~ hàm độ cao đảo)
    const meshH = isles ? (x, z) => Math.max(meshH0(x, z), O.isleAt(x, z)) : meshH0;
    bakeSun(T, O.ext, H, ax, NA, O, isles);
    const forest = buildForest(T, O, nz, seaLvl, meshH);
    if (forest) group.add(forest);
    group.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    return { group, land, sea, forest, verts: nv };
  }

  return { build };
})();

if (typeof window !== 'undefined') window.Backdrop = Backdrop;
