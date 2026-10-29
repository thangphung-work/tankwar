/**
 * BẦU TRỜI: vòm trời gradient (thiên đỉnh -> chân trời), đĩa mặt trời + quầng sáng, mây tầng cao mờ
 * Hướng mặt trời trùng với đèn chiếu sáng chính để bóng đổ khớp vị trí mặt trời nhìn thấy.
 */
const SkySystem = (() => {
  // PHỐI CẢNH KHÔNG KHÍ (vá chunk sương dùng chung mọi vật liệu): ở cự ly vừa (vài km) không khí phủ lên vật màu lam xám
  // SẪM hơn màu sương chân trời — đồi xa thật sẫm & ngả lam, không bạc trắng thành dải đục giữa bãi cỏ và dãy núi.
  // Sương dày (mưa, mù) giữ màu sương xám trắng
  if (typeof THREE !== 'undefined' && THREE.ShaderChunk.fog_fragment.indexOf('fogAerial') < 0) {
    THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', `#ifdef FOG_EXP2
		// trời quang: sương ở cự ly vừa nhẹ đi ~45% & chỉ ngả lam rất nhẹ (đồi 3-5 km vẫn xanh, chỉ nhạt bớt như ảnh thật);
		// mép tầm nhìn vẫn mờ hẳn vào màu sương
		// càng xa lớp không khí phủ lên đồi càng sẫm ngả lam (khớp cảnh nền & chân dãy núi chân trời): đồi 3-6 km lam xám
		// chứ không trắng sữa nổi hơn cả dãy núi phía sau
		float fogAerial = 1.0 - smoothstep( 0.0003, 0.0007, fogDensity );
		vec3 fogAir = mix( vec3( 0.86, 0.9, 0.96 ), vec3( 0.58, 0.63, 0.71 ), smoothstep( 1200.0, 4500.0, fogDepth ) );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * mix( vec3( 1.0 ), fogAir, fogAerial ), fogFactor * ( 1.0 - 0.45 * fogAerial ) );
	#else
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif`);
  }
  // mapType, seed (tuỳ chọn): dựng thêm dãy núi chân trời theo chiến địa (RANGES), dáng núi theo seed bản đồ
  function create(parent, atm, mapType, seed, outer) {
    const geo = new THREE.SphereGeometry(5200, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(atm.zenith) },
        horizon: { value: new THREE.Color(atm.horizon) },
        ground: { value: new THREE.Color(atm.ground || 0x806a50) },
        fogC: { value: new THREE.Color(atm.fog || atm.horizon) },
        sunDir: { value: atm.sunDir.clone() },
        sunColor: { value: new THREE.Color(atm.sunColor) },
        time: { value: 0 },
        // trời mưa: tầng mây xám kín trời (0..1), ánh chớp (0..1) & hướng tia sét
        overcast: { value: atm.overcast || 0 },
        storm: { value: atm.storm || 0 },   // độ đen mây giông (0..1)
        flash: { value: 0 },
        flashDir: { value: new THREE.Vector3(0, 1, 0) },
        uFogD: { value: 0 }   // mật độ sương của scene (onBeforeRender)
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        uniform vec3 zenith, horizon, ground, sunDir, sunColor, fogC, flashDir;
        uniform float time, overcast, storm, flash, uFogD;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
          // Sát / dưới chân trời: đúng màu sương -> cảnh nền xa (đã hòa vào sương) liền với bầu trời, không lộ mép cắt;
          // dải mù mỏng sát chân trời, phía trên là trời xanh trong
          col = mix(col, fogC, pow(smoothstep(0.06, -0.01, h), 1.4));
          // Tán xạ quanh mặt trời (Mie) + đĩa mặt trời
          float cs = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(cs, 8.0) * 0.28 + pow(cs, 64.0) * 0.45);
          col = mix(col, vec3(1.0, 0.98, 0.92) * 1.6, smoothstep(0.99955, 0.99975, cs));
          if (h > 0.0) {
            // Mây tích trắng xốp tầng thấp: từng đám rời, đỉnh sáng, đáy hơi xám; thưa dần sát chân trời
            vec2 uc = d.xz / (h + 0.12) * 1.3;
            float c1 = noise(uc) * 0.5 + noise(uc * 2.3 + 7.1) * 0.28 + noise(uc * 5.1 + 3.3) * 0.14 + noise(uc * 11.0) * 0.08;
            float cov = smoothstep(0.5, 0.68, c1) * smoothstep(0.0, 0.1, h);
            vec3 cc = mix(vec3(0.78, 0.81, 0.86), vec3(1.0), smoothstep(0.55, 0.8, c1)) * (0.92 + 0.2 * cs);
            col = mix(col, mix(cc, sunColor * 1.05, 0.15), cov * 0.9);
            // Mây ti tầng cao mỏng
            vec2 uv = d.xz / (h + 0.25) * 2.2;
            float c = noise(uv + 13.7) * 0.6 + noise(uv * 2.7) * 0.3 + noise(uv * 6.1) * 0.1;
            c = smoothstep(0.58, 0.85, c) * smoothstep(0.05, 0.3, h) * 0.4 * (1.0 - cov);
            col = mix(col, mix(vec3(1.0), sunColor, 0.25) * (0.85 + 0.25 * cs), c);
          }
          if (overcast > 0.0) {
            // Mây mưa kín trời: chân mây thấp xám cuộn trôi theo gió, chỗ mây dày sẫm hơn, sát chân trời tan vào màn mưa;
            // chớp: cả tầng mây loé sáng, sáng nhất phía tia sét
            vec2 uo = d.xz / (max(h, 0.0) + 0.1) * 0.8 + vec2(time * 0.006, time * 0.0035);
            float n = noise(uo) * 0.5 + noise(uo * 2.3 + 3.1) * 0.3 + noise(uo * 5.2 + 1.7) * 0.2;
            vec3 oc = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6)) * (0.82 + 0.34 * n);
            if (storm > 0.0) {
              // MÂY ĐEN GIÔNG: khối mây lớn trôi chậm — lõi dày sẫm gần đen, khe mây mỏng sáng hơn; chân mây thấp phía xa
              // cuộn thành dải sẫm; sát chân trời vẫn sáng (màn mưa xa) để cảnh nền & xe đứng xa còn tách khỏi trời
              vec2 ub = d.xz / (max(h, 0.0) + 0.15) * 0.3 + vec2(time * 0.004, time * 0.0024);
              float m = noise(ub) * 0.55 + noise(ub * 2.2 + 5.3) * 0.3 + noise(ub * 4.7 + 2.1) * 0.15;
              float core = smoothstep(0.38, 0.72, m), up = smoothstep(0.02, 0.4, h);
              oc *= mix(1.0, 0.62 + 0.38 * n, storm * 0.8);
              oc *= 1.0 - storm * up * (0.3 + 0.42 * core);
              vec2 ur = normalize(d.xz + 1e-4) * 5.0 + vec2(h * 11.0 + time * 0.003, h * 23.0);
              float band = smoothstep(0.03, 0.1, h) * (1.0 - smoothstep(0.16, 0.34, h));
              oc *= 1.0 - storm * band * 0.32 * smoothstep(0.4, 0.75, noise(ur) * 0.65 + noise(ur * 2.6) * 0.35);
              oc = mix(oc, oc * vec3(0.9, 0.95, 1.08), storm * up);   // mây giông ngả xanh chàm
            }
            oc = mix(oc, fogC, pow(smoothstep(0.3, -0.02, h), 1.3));
            float fl = flash * (0.3 + 0.7 * pow(max(dot(d, normalize(flashDir)), 0.0), 3.0));
            oc += vec3(0.85, 0.88, 1.0) * fl * (0.6 + 0.9 * n);
            col = mix(col, oc, overcast);
          }
          // SƯƠNG MÙ DÀY: phần trời thấp tan liền vào màu sương (cảnh vật & núi đã chìm hẳn trong sương) -> không thành các
          // dải tách lớp sương / bóng núi / trời mây với mép ngang rõ
          col = mix(col, fogC, smoothstep(0.0004, 0.0014, uFogD) * pow(smoothstep(0.38, -0.02, h), 0.8));
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky';
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    mesh.onBeforeRender = (r, sc) => { mat.uniforms.uFogD.value = sc.fog && sc.fog.density !== undefined ? sc.fog.density : 0; };
    parent.add(mesh);
    const ring = mapType && RANGES[mapType] ? mountainRing(RANGES[mapType], mat.uniforms, seed || 1, outer) : null;
    if (ring) mesh.add(ring);
    return { mesh, atm, ring };
  }

  // DÃY NÚI CHÂN TRỜI: dải núi 3D bám theo camera như vòm trời (giả ở xa ~25 km), vẽ ngay sau trời, không ghi độ sâu
  // -> mọi địa hình thật luôn đè lên trên, núi chỉ lộ ra sau đường chân trời của cảnh nền.
  // amp: độ cao đỉnh (đv cục bộ, dải bán kính 3000-5000); soft: tỉ lệ dáng tròn thoải; tree: bìa rừng (tỉ lệ amp, < 0: không
  // rừng); snow: đường tuyết (> 1: không tuyết); rock / forest: màu đá / tán rừng; haze: sương xa cơ bản
  const RANGES = {
    HIGHLAND: { amp: 720, soft: 0, tree: 0.5, snow: 0.68, rock: [0.32, 0.32, 0.33], forest: [0.06, 0.12, 0.05], haze: 0.16 },
    RIVER_LAKE: { amp: 600, soft: 0, tree: 0.82, snow: 0.7, snowK: 1, rock: [0.3, 0.3, 0.3], forest: [0.06, 0.13, 0.04], haze: 0.18 },
    JUNGLE: { amp: 580, soft: 0.05, tree: 0.92, snow: 0.84, snowK: 0.85, rock: [0.3, 0.31, 0.29], forest: [0.05, 0.13, 0.04], haze: 0.24 },
    URBAN: { amp: 520, soft: 0, tree: 0.82, snow: 0.7, snowK: 1, rock: [0.3, 0.3, 0.3], forest: [0.06, 0.13, 0.05], haze: 0.22 },
    DESERT: { amp: 540, soft: 0, tree: -1, snow: 9, rock: [0.64, 0.5, 0.36], forest: [0.3, 0.27, 0.18], haze: 0.32, strata: 1 }
  };
  // Dải địa hình hình vành khuyên quanh camera: núi sống lưng uốn méo, sườn bất đối xứng, mỏm đá. Tính sẵn lúc dựng (1 lần /
  // bản đồ): bóng núi đổ lên núi theo hướng nắng (dò tia trên lưới độ cao), độ lồi lõm (sống núi / khe). Shader: rừng phủ
  // sườn (hạt tán cây), đồng cỏ núi trên bìa rừng, đá lộ ở sống núi & vách dốc, đá vụn ở lòng khe, tuyết đọng trong khe
  // thành vệt; sương xa ngả màu trời. Vẽ từ vòng xa vào vòng gần (vẽ đè kiểu hoạ sĩ, không cần bộ đệm sâu)
  function mountainRing(cfg, su, seed, outer) {
    if (typeof MapGen === 'undefined') return null;
    // map đảo (outer.spineA): dãy núi chân trời chỉ ở một cung sau dãy sống lưng của đảo (đất liền / đảo lớn phía xa), các
    // hướng khác chân trời là biển — vòng núi 360° quanh một hòn đảo là vô lý (như đảo nằm giữa miệng núi lửa)
    // sa mạc (outer.arcA): núi xa chỉ sau cao nguyên, phía biển cát / đồi thấp chân trời là cồn cát
    const arcA = !outer ? null : outer.sea && typeof outer.spineA === 'number' ? outer.spineA : typeof outer.arcA === 'number' ? outer.arcA : null;
    const R0 = 3000, R1 = 5000, N = 1200, NR = 64, TAU = Math.PI * 2;
    const on = MapGen.makeNoise(MapGen.mulberry32(((seed ^ 0x51f3a9) >>> 0) || 1));
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // băm theo seed bản đồ: vị trí / độ cao / số mặt / sống núi của từng đỉnh đổi theo từng trận (cùng seed -> mọi máy như nhau)
    const so = Math.floor(MapGen.mulberry32(((seed ^ 0x2c9e17) >>> 0) || 7)() * 997) + 1;
    const hs = (a, b, k) => { const v = Math.sin((a + so * 13.17) * 127.1 + b * 311.7 + (k + so * 0.731) * 74.7) * 43758.5453; return v - Math.floor(v); };
    // ĐỈNH CHÓP NHIỀU MẶT PHẲNG (kiểu Matterhorn / ảnh núi thật): vài đỉnh chính thưa (~1,7 km một đỉnh dọc chân trời),
    // mỗi đỉnh là chóp 3-4 mặt phẳng lớn, mỗi mặt dốc một kiểu, gặp nhau ở sống sắc. Mặt phẳng lớn -> cả mảng đón nắng
    // sáng đều / cả mảng khuất tối (tương phản theo mặt như núi thật), thay cho muôn mỏm nhiễu lởm chởm đều khắp nơi.
    // Giữa 2 đỉnh: chỗ các mặt giao nhau tự thành yên ngựa / rãnh chữ V. Ô đỉnh lặp vòng theo chu vi (không vết nối)
    const SPK = 1700, L = TAU * 4000, NC = Math.round(L / SPK), CW = L / NC;
    // + SỐNG NÚI: mỗi đỉnh toả 2-3 sống chạy chéo xuống thung lũng (dài 0,9-2,2 km), hạ dần, có mấu lồi lõm dọc sống,
    // hai bên dốc -> sống của các đỉnh cạnh nhau cắt / đan cài vào nhau. 2 LỚP DÃY: hàng đỉnh thấp phía trước, hàng đỉnh
    // cao phía sau, so le (lớp xa mờ hơn theo sương sẵn có)
    const peaks = [];
    const mkPeak = (c, k, a, r, hp, big) => {
      const nf = hs(c, 4 + k, 9) < 0.5 ? 3 : 4, ph = hs(c, 5 + k, 9) * TAU, faces = [], spurs = [];
      for (let j = 0; j < nf; j++) {
        const an = ph + j * TAU / nf + (hs(c, 6 + j + k, 9) - 0.5) * 0.8;
        // độ dốc mặt (cao / ngang): 0.7-1.4 -> sườn 35-54°
        faces.push([Math.cos(an), Math.sin(an), (0.7 + 0.7 * hs(c, 12 + j + k, 9)) * (big ? 1.08 : 0.92)]);
      }
      const ns = 2 + (hs(c, 50 + k, 9) < 0.5 ? 1 : 0);
      for (let j = 0; j < ns; j++) {
        // hướng sống: toả quanh đỉnh, lệch chéo (thiên về phía thung lũng / hai bên, ít chạy thẳng ra sau)
        const an = -Math.PI / 2 + (j - (ns - 1) / 2) * (1.9 + 0.5 * hs(c, 51 + j + k, 9)) + (hs(c, 55 + j + k, 9) - 0.5) * 0.9;
        spurs.push({ ux: Math.cos(an), ur: Math.sin(an), len: hp * (1.5 + 1.6 * hs(c, 60 + j + k, 9)),
          ks: 0.75 + 0.55 * hs(c, 65 + j + k, 9), ph: hs(c, 70 + j + k, 9) * 6.28, fq: 0.004 + 0.003 * hs(c, 75 + j + k, 9) });
      }
      return { a, r, hp, faces, spurs };
    };
    for (let c = 0; c < NC; c++) {
      const big = hs(c, 1, 9) < 0.35;
      // hàng sau: đỉnh cao
      peaks.push([mkPeak(c, 0, (c + 0.2 + 0.6 * hs(c, 20, 9)) * CW, R1 - 1300 + 700 * hs(c, 21, 9),
        cfg.amp * (big ? 0.75 + 0.25 * hs(c, 2, 9) : 0.55 + 0.25 * hs(c, 3, 9)), big),
      // hàng trước: đỉnh thấp so le (lệch nửa ô)
        mkPeak(c, 100, (c + 0.7 + 0.5 * (hs(c, 22, 9) - 0.5)) * CW, R0 + 750 + 550 * hs(c, 23, 9), cfg.amp * (0.32 + 0.25 * hs(c, 24, 9)), false),
      // hàng giữa: đỉnh phụ chen vai đỉnh chính (đỉnh chính không đứng trơ một mình)
        mkPeak(c, 200, (c + 0.45 + 0.5 * (hs(c, 25, 9) - 0.5)) * CW, (R0 + R1) / 2 + 300 * (hs(c, 26, 9) - 0.5), cfg.amp * (0.45 + 0.25 * hs(c, 27, 9)), false)]);
    }
    const pyr = (a, r) => {
      const c0 = Math.floor(a / CW);
      let best = -1e9;
      for (let k = -2; k <= 2; k++) for (const P of peaks[((c0 + k) % NC + NC) % NC]) {
        let da = a - P.a; da -= L * Math.round(da / L);
        const dr = r - P.r;
        if (Math.abs(da) > P.hp * 4.5) continue;
        let m = 0;
        for (const f of P.faces) m = Math.max(m, f[2] * (f[0] * da + f[1] * dr));
        // MẶT CẮT LÕM như núi thật: rất dốc sát ngọn, thoải dần xuống chân, nối liền vào sườn (không ghép chóp thẳng
        // tắp lên thân núi -> gãy góc, vọt lên bất thường). Mặt cắt theo "khoảng cách đa giác" m -> vẫn giữ 3-4 mặt & sống sắc
        const tq = m / (P.hp * 1.6);
        if (tq < 1) best = Math.max(best, P.hp * (1 - Math.pow(tq, 0.72)));
        for (const S of P.spurs) {
          const sAl = da * S.ux + dr * S.ur, perp = Math.abs(da * S.ur - dr * S.ux);
          if (sAl <= 0) continue;
          const u = Math.min(1, sAl / S.len);
          // đỉnh sống hạ dần từ ~0.8 chiều cao đỉnh, mấu nhô / yên ngựa dọc sống; dốc hai bên ks
          const crest = P.hp * (0.82 * (1 - Math.pow(u, 0.85)) + 0.07 * Math.sin(sAl * S.fq + S.ph) * (1 - u));
          best = Math.max(best, crest - S.ks * perp);
        }
      }
      return best;
    };
    const H = (x, z, r) => {
      // uốn méo toạ độ (domain warp): sống núi cong queo, đỉnh lệch, sườn hai bên không đối xứng
      const wx = x + 380 * MapGen.fbm(on, x * 0.0008 + 7.3, z * 0.0008, 3), wz = z + 380 * MapGen.fbm(on, x * 0.0008, z * 0.0008 - 5.9, 3);
      const mass = smooth(-0.6, 0.4, MapGen.fbm(on, x * 0.00042 + 3.1, z * 0.00042 - 1.7, 3));
      // DÃY NÚI DÀI: sống núi kéo dài theo phương ngang (dọc vòng tròn chân trời) trên toạ độ (cung, bán kính) uốn méo;
      // nối vòng ở góc 0 / 2π (trộn 2 mẫu lệch một chu vi) -> không có vết nối
      let t = Math.atan2(z, x) / TAU; if (t < 0) t += 1;
      const ru = r + 260 * MapGen.fbm(on, x * 0.0011 - 3, z * 0.0011 + 8, 2);
      const lr = (a) => MapGen.ridged(on, a * 0.0003 + 1.7, ru * 0.0012 - 3.3, 3);
      const along = lr(t * L) * (1 - smooth(0.9, 1, t)) + lr(t * L - L) * smooth(0.9, 1, t);
      // nhánh núi / khe đâm ngang (nhiễu gợn đẳng hướng) xen vào sống chính
      const rg = 0.62 * along + 0.38 * MapGen.ridged(on, wx * 0.0008 - 4.2, wz * 0.0008 + 2.6, 3);
      const hill = 0.5 + 0.5 * MapGen.fbm(on, x * 0.004 + 9, z * 0.004, 3);
      const soft = smooth(-0.45, 0.55, MapGen.fbm(on, wx * 0.0012 + 1.3, wz * 0.0012 - 6.1, 4));
      // gần (R0) thấp dần về 0 (nằm dưới cảnh nền thật), xa cùng (R1) hạ bớt -> không lộ mép cắt
      const rad = smooth(R0, R0 + 700, r) * (1 - 0.5 * smooth(R1 - 500, R1, r));
      // (sườn trung bình ~30-40° như núi thật nhìn xa; mũ cao hơn thì sống núi thành chông nhọn)
      const shape = Math.pow(rg, 1.1) * 1.05 * (1 - cfg.soft) + soft * cfg.soft;
      // nền dãy núi (vai núi / chân núi liền dải) thấp hơn; các đỉnh chóp mặt phẳng nhô lên trên (lấy max: giao tuyến sắc)
      const h0 = cfg.amp * rad * (0.1 * hill + (0.48 + 0.3 * mass) * shape);
      // uốn nhẹ toạ độ chóp (~180 đv): sống núi & mép mặt hơi cong gãy, mặt lớn vênh nhẹ — không thẳng tắp như kim tự tháp
      const pw = 180 * MapGen.fbm(on, x * 0.0014 + 2.7, z * 0.0014 - 9.2, 2), pv = 180 * MapGen.fbm(on, x * 0.0014 - 6.1, z * 0.0014 + 4.4, 2);
      const h = Math.max(h0, pyr(t * L + pw, r + pv) * rad * (0.85 + 0.3 * mass));
      // gồ ghề trên mặt (bước sóng ~450 / ~170 đv): mặt núi vênh, sống phụ & rãnh nhỏ; mạnh dần lên cao (đỉnh đá
      // lởm chởm, không trơn láng như nón)
      // + tầng ~85 đv (lưới ~21-31 đv/ô vẫn dựng được): mỏm đá nhọn, đường đỉnh răng cưa thay cho nét viền mượt
      const crag = MapGen.ridged(on, wx * 0.0022 + 3.3, wz * 0.0022 - 8.1, 2) + 0.55 * MapGen.ridged(on, wx * 0.0058 - 2.2, wz * 0.0058 + 5.5, 2)
        + 0.3 * MapGen.ridged(on, wx * 0.012 + 6.4, wz * 0.012 - 1.9, 2);
      const up = smooth(0.15, 0.7, h / cfg.amp);
      let hr = h + cfg.amp * rad * 0.075 * crag * up;
      // BẬC VÁCH: mặt đá trên cao gãy thành từng bậc (vách dựng + gờ thoải), cao mỗi bậc ~55-75 đv, mép bậc uốn theo nhiễu
      // (không thành vạch đồng mức thẳng tắp) -> sườn cứng cáp gãy khúc thay vì một mặt nghiêng trơn
      const st = 64 + 12 * MapGen.fbm(on, wx * 0.002 - 4.4, wz * 0.002 + 1.1, 2), sw = hr + 40 * MapGen.fbm(on, wx * 0.003 + 8.8, wz * 0.003 - 3.6, 2);
      const sq = sw / st, sf = sq - Math.floor(sq);
      hr += ((Math.floor(sq) + smooth(0.6, 1, sf)) * st - sw) * 0.4 * up * smooth(0.2, 0.6, MapGen.fbm(on, wx * 0.0011 + 2.2, wz * 0.0011, 2) + 0.5);
      if (arcA === null) return hr;
      // cung núi: rộng ~±75° quanh hướng sống lưng, mép cung hạ dần xuống dưới chân trời (dãy núi chìm dần vào biển)
      let da = Math.abs(Math.atan2(z, x) - arcA - 0.2 * MapGen.fbm(on, x * 0.0004, z * 0.0004 + 3, 2)) % TAU;
      da = Math.min(da, TAU - da);
      // ngoài cung: dìm hẳn xuống (~15° dưới tầm mắt) -> biển / cảnh nền thật vẽ đè lên; chỉ hạ về 0 thì chân vòng núi
      // thành dải sẫm lơ lửng ngang tầm mắt khi camera lên cao (pháo binh, drone)
      return hr * (1 - smooth(0.85, 1.45, da)) - 900 * smooth(1.0, 1.6, da);
    };
    const NV = N * (NR + 1), pos = new Float32Array(NV * 3), hh = new Float32Array(NV), rr = new Float32Array(NV);
    // vòng k = 0 xa nhất (R1) -> k = NR gần nhất (R0); góc lặp vòng (i = N trùng i = 0)
    for (let k = 0; k <= NR; k++) {
      const r = R1 - (R1 - R0) * Math.pow(k / NR, 1.15);
      for (let i = 0; i < N; i++) {
        const th = i / N * TAU, x = Math.cos(th) * r, z = Math.sin(th) * r, h = H(x, z, r), v = k * N + i;
        pos[v * 3] = x; pos[v * 3 + 1] = h - r * 0.017; pos[v * 3 + 2] = z;   // gốc hơi dưới chân trời (khuất sau cảnh nền)
        hh[v] = h; rr[v] = r;
      }
    }
    // độ cao lưới tại (x, z) bất kỳ (nội suy trên lưới cực); ngoài dải: không che
    const gridH = (x, z) => {
      const r = Math.hypot(x, z);
      if (r <= R0 || r >= R1) return -1e9;
      const kf = NR * Math.pow((R1 - r) / (R1 - R0), 1 / 1.15), k0 = Math.min(NR - 1, Math.floor(kf)), tk = kf - k0;
      let fi = Math.atan2(z, x) / TAU * N; if (fi < 0) fi += N;
      const i0 = Math.floor(fi) % N, i1 = (i0 + 1) % N, ti = fi - Math.floor(fi);
      const a = hh[k0 * N + i0] * (1 - ti) + hh[k0 * N + i1] * ti, b = hh[(k0 + 1) * N + i0] * (1 - ti) + hh[(k0 + 1) * N + i1] * ti;
      return a * (1 - tk) + b * tk;
    };
    // pháp tuyến từ hàm độ cao (sai phân 18 đv): lấy từ đỉnh lưới lân cận thì tam giác hẹp trên sườn dốc thành vân zíc-zắc
    const nrm = new Float32Array(NV * 3), E = 18;
    for (let v = 0; v < NV; v++) {
      const x = pos[v * 3], z = pos[v * 3 + 2], r = rr[v];
      const gx = (H(x + E, z, r) - H(x - E, z, r)) / (2 * E), gz = (H(x, z + E, r) - H(x, z - E, r)) / (2 * E), l = Math.hypot(gx, 1, gz);
      nrm[v * 3] = -gx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -gz / l;
    }
    // bóng núi theo nắng: dò tia từ từng đỉnh về phía mặt trời trên lưới độ cao (bước dãn dần), bóng mềm theo độ ngập.
    // Lồi lõm: chênh với trung bình các đỉnh quanh ±3 ô -> > 0 sống núi, < 0 khe / lòng chảo
    const sd = su.sunDir.value, sl = Math.hypot(sd.x, sd.z) || 1e-4, sdx = sd.x / sl, sdz = sd.z / sl, tanS = Math.max(0.02, sd.y) / sl;
    const aux = new Float32Array(NV * 4);
    for (let k = 0; k <= NR; k++) for (let i = 0; i < N; i++) {
      const v = k * N + i, x = pos[v * 3], z = pos[v * 3 + 2], h0 = hh[v];
      let occ = 0;
      for (let t = 12; t < 2600; t *= 1.12) {
        const g = gridH(x + sdx * t, z + sdz * t);
        if (g > -1e8) { occ = Math.max(occ, (g - (h0 + t * tanS)) / 25); if (occ >= 1) break; }
      }
      let s = 0, n = 0;
      for (let dk = -3; dk <= 3; dk += 3) for (let di = -3; di <= 3; di += 3) {
        const kk = k + dk;
        if ((!dk && !di) || kk < 0 || kk > NR) continue;
        s += hh[kk * N + ((i + di) % N + N) % N]; n++;
      }
      // độ cao BIỂU KIẾN (theo góc nhìn, quy về bán kính giữa dải): dãy núi giả ở xa ~25 km nên độ cao thật của núi tỉ lệ
      // với góc nhìn, không phải h lưới — hàng gần (R0) trông cao hơn đỉnh xa (R1) cùng h. Tuyết / bìa rừng / sương theo h
      // thô thì sống núi gần cao vút không tuyết mà đỉnh thấp hơn phía sau lại trắng xoá (đường tuyết lệch nhau)
      aux[v * 4] = h0 * ((R0 + R1) / 2 / rr[v]) / cfg.amp; aux[v * 4 + 1] = (rr[v] - R0) / (R1 - R0);
      aux[v * 4 + 2] = 1 - Math.min(1, occ); aux[v * 4 + 3] = Math.max(-1, Math.min(1, (h0 - s / n) / (cfg.amp * 0.06)));
    }
    const idx = new Uint32Array(NR * N * 6);
    let q = 0;
    for (let k = 0; k < NR; k++) for (let i = 0; i < N; i++) {
      const a = k * N + i, b = k * N + (i + 1) % N, c = a + N, d = b + N;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('aM', new THREE.BufferAttribute(aux, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const f3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: false,
      extensions: { derivatives: true },
      uniforms: {
        fogC: su.fogC, horizon: su.horizon, zenith: su.zenith, sunDir: su.sunDir, sunColor: su.sunColor, overcast: su.overcast,
        rockC: { value: f3(cfg.rock) }, forestC: { value: f3(cfg.forest) },
        uFogD: { value: 0 }, uHor: { value: 0 }, snowH: { value: cfg.snow }, snowK: { value: cfg.snowK || 1 }, treeH: { value: cfg.tree }, hazeB: { value: cfg.haze },
        strataK: { value: cfg.strata || 0 }, farAir: typeof BattleTerrain3D !== 'undefined' ? BattleTerrain3D.FAR_AIR : { value: f3([0.58, 0.63, 0.71]) }
      },
      vertexShader: `
        attribute vec4 aM;
        varying vec3 vN, vP, vRel; varying vec4 vM;
        void main() {
          vN = normal; vP = position; vM = aM;
          vRel = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 fogC, horizon, zenith, sunDir, sunColor, rockC, forestC, farAir;
        uniform float overcast, snowH, snowK, treeH, hazeB, uFogD, uHor, strataK;
        varying vec3 vN, vP, vRel; varying vec4 vM;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        // nhiễu giá trị 3D kèm đạo hàm (giá trị, gradient)
        vec4 noised(vec3 x) {
          vec3 p = floor(x), w = fract(x);
          vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0), du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
          float a = h3(p), b = h3(p + vec3(1, 0, 0)), c = h3(p + vec3(0, 1, 0)), d = h3(p + vec3(1, 1, 0));
          float e = h3(p + vec3(0, 0, 1)), f = h3(p + vec3(1, 0, 1)), g = h3(p + vec3(0, 1, 1)), hh = h3(p + vec3(1, 1, 1));
          float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f, k7 = -a + b + c - d + e - f - g + hh;
          return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
            du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
        }
        // Voronoi 2D: (khoảng cách tới mép ô F2-F1, băm ô x, băm ô y)
        vec3 vor(vec2 p) {
          vec2 ip = floor(p), fp = fract(p);
          float d1 = 9.0, d2 = 9.0; vec2 bc = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)), c = ip + o;
            vec2 r = o + 0.15 + 0.7 * vec2(hash(c), hash(c + 19.7)) - fp;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; bc = c; } else if (d < d2) d2 = d;
          }
          return vec3(sqrt(d2) - sqrt(d1), hash(bc + 3.1), hash(bc + 7.9));
        }
        void main() {
          vec3 n0 = normalize(vN);
          // NỔI KHỐI CHI TIẾT: gờ đá / khe / hốc ở mọi hướng (cả vách đứng) — gradient nhiễu 3D 4 tầng chiếu lên mặt phẳng
          // tiếp tuyến; tầng nhỏ hơn cỡ điểm ảnh tắt dần (không nhấp nháy). rough: độ lồi (hốc tối, gờ sáng)
          float pxw = max(fwidth(vP.x), fwidth(vP.z)) + fwidth(vP.y);
          // nhiễu "nếp gãy" (|n - 0.5|): gradient đổi dấu đột ngột -> gờ sắc cạnh & khe gãy góc thay cho u lồi mượt; 6 tầng
          // tới cỡ vài đv -> mặt đá sần sùi khi soi ống kính
          // (tầng thô ~33-11 đv bỏ: nhiễu giá trị đẳng hướng ở cỡ đó thành các u tròn phủ kín sườn như bọt xà phòng —
          // hình khối lớn của sườn do RÃNH XÓI bên dưới đảm nhận)
          vec3 gsum = vec3(0.0); float rough = 0.0, fq = 0.19, am = 0.5;
          for (int o = 0; o < 4; o++) {
            float fade = 1.0 - smoothstep(0.25, 0.7, pxw * fq);
            vec4 nd = noised(vec3(vP.x, vP.y * 0.4, vP.z) * fq + float(o) * 17.3);   // kéo dài theo chiều đứng: thớ nứt dọc, không hạt tròn
            float sg = nd.x > 0.5 ? 1.0 : -1.0;
            gsum += sg * nd.yzw * am * fade; rough += (abs(nd.x - 0.5) - 0.25) * am * fade;
            fq *= 2.11; am *= 0.6;
          }
          float rockK = smoothstep(0.25, 0.55, 1.0 - n0.y);   // đá dốc nổi khối mạnh, sườn rừng nhẹ hơn
          // GÓC CẠNH: vùng đá lấy một phần pháp tuyến phẳng của từng mặt tam giác -> mặt vách phẳng gãy góc như đá thật
          vec3 nf = normalize(cross(dFdx(vP), dFdy(vP)));
          if (nf.y < 0.0) nf = -nf;
          n0 = normalize(mix(n0, nf, 0.75 * rockK));
          // KHE NỨT (2 cỡ ~140 m / ~45 m, ô kéo dài theo chiều đứng của vách): nét sẫm mảnh trên mặt đá, chỉ là màu —
          // không bẻ pháp tuyến (mặt núi lớn giữ phẳng, sáng / tối cả mảng); nét tối thiểu ~1,5 điểm ảnh, tắt khi ô nhỏ hơn điểm ảnh
          float crack = 0.0;
          {
            vec2 sp = vec2(vP.x * 0.8 + vP.z * 0.6, vP.y * 1.6 + (vP.z * 0.8 - vP.x * 0.6) * 0.35);
            vec3 v1 = vor(sp / 140.0), v2 = vor(sp / 45.0 + 11.3);
            float w1 = max(0.03, fwidth(sp.x / 140.0) * 1.5), w2 = max(0.03, fwidth(sp.x / 45.0) * 1.5);
            float f1 = 1.0 - smoothstep(0.08, 0.3, pxw / 140.0 * 6.0), f2 = 1.0 - smoothstep(0.08, 0.3, pxw / 45.0 * 6.0);
            crack = max((1.0 - smoothstep(0.0, w1, v1.x)) * f1, (1.0 - smoothstep(0.0, w2, v2.x)) * 0.7 * f2) * rockK;
          }
          // RÃNH XÓI / SỐNG ĐÁ chạy thẳng xuống dốc (núi thật: nước xẻ sườn thành khe chữ V xen sống đá sắc, không có u gò
          // tròn). Mặt cắt ngang sườn = sóng tam giác (đỉnh sống & đáy khe gãy góc), 3 cỡ ~240 / 86 / 31 đv; khe uốn lượn,
          // bề rộng lệch, chỗ sâu chỗ nông dọc sườn (khe mở ra rồi tắt). Toạ độ ngang sườn theo pháp tuyến mượt: mặt chóp lớn
          // phẳng nên khe song song thẳng hàng xuống chân, qua sống núi thì đổi hướng theo mặt bên kia
          // Hướng ngang sườn KHÔNG lấy thẳng từ pháp tuyến (toạ độ thế giới ~4000 đv: pháp tuyến lệch chút xíu là pha khe nhảy
          // cả chục chu kỳ -> vân xoáy như vân tay): 4 hướng cố định, trộn theo độ khớp với hướng dốc (kiểu chiếu 3 phía)
          vec2 dn = n0.xz; float dnl = length(dn); dn = dnl > 1e-3 ? dn / dnl : vec2(1.0, 0.0);
          float gK = smoothstep(0.08, 0.3, dnl), gH = 0.0, gAm = 0.0, gWs = 0.0; vec3 gT = vec3(0.0);
          for (int d = 0; d < 4; d++) {
            float an = float(d) * 0.7853982;
            vec2 dd = vec2(cos(an), sin(an));
            float wd = pow(abs(dot(dn, dd)), 10.0);
            if (wd < 0.02) continue;
            vec2 tq = vec2(-dd.y, dd.x);
            float acr = dot(vP.xz, tq), hD = 0.0, dD = 0.0, aD = 0.0, gW = 240.0, gA = 0.8;
            for (int o = 0; o < 3; o++) {
              float fw = 1.0 - smoothstep(0.12, 0.35, pxw / gW);
              float uu = acr / gW + (noise(vec2(acr / gW * 0.35 + float(o + d * 3) * 7.1, vP.y / (gW * 2.2))) - 0.5) * 1.3;
              float dep = smoothstep(0.28, 0.62, noise(vec2(floor(uu) * 1.37 + float(o + d * 3) * 3.3, vP.y / (gW * 3.5))));
              float f = fract(uu) - 0.5, k = gA * dep * fw;
              hD += (0.25 - abs(f)) * 4.0 * k; aD += k;
              dD += -clamp(f / max(0.03, pxw / gW * 1.5), -1.0, 1.0) * k;
              gW *= 0.36; gA *= 0.65;
            }
            // tiếp tuyến ngang sườn chiếu lên mặt (khớp dấu với hướng dốc thật)
            vec3 t3 = vec3(tq.x, 0.0, tq.y);
            gT += (t3 - dot(t3, n0) * n0) * dD * wd; gH += hD * wd; gAm += aD * wd; gWs += wd;
          }
          gH = gWs > 0.0 ? gH / gWs * gK : 0.0;
          gT = gWs > 0.0 ? gT / gWs * gK : vec3(0.0);
          gAm = gWs > 0.0 ? gAm / gWs : 0.0;
          float gC = gAm > 0.0 ? gH / gAm : 0.0;   // +1 sống đá, -1 lòng khe
          n0 = normalize(n0 - gT * mix(0.55, 1.0, rockK));
          vec3 n = normalize(n0 - (gsum - dot(gsum, n0) * n0) * mix(0.14, 0.2, rockK));
          float h = vM.x, far = vM.y, lit0 = vM.z, cv = vM.w, slope = 1.0 - n0.y;
          // chi tiết nhỏ mờ dần khi nhỏ hơn cỡ điểm ảnh (không lấm tấm răng cưa khi ở xa / lia camera)
          float px = max(fwidth(vP.x), fwidth(vP.z));
          float dF = 1.0 - smoothstep(4.0, 12.0, px), dM = 1.0 - smoothstep(14.0, 40.0, px);
          float n1 = noise(vP.xz * 0.011), n2 = noise(vP.xz * 0.045 + 3.7);
          float rill = clamp(0.5 + rough * 0.9 + gC * 0.3, 0.0, 1.0);   // gờ sáng / hốc tối theo nổi khối (sống đá sáng, lòng khe tối)
          // RỪNG: sườn thoải dưới bìa rừng, lấn lên theo khe (giữ ẩm), lùi khỏi sống núi; bìa rừng lởm chởm
          // bìa rừng không chạy ngang theo độ cao: lên cao theo khe ẩm, tụt xuống trên sống / mỏm, lượn mạnh theo nhiễu
          float tl = treeH + (n1 - 0.5) * 0.35 + (noise(vP.xz * 0.004 + 7.0) - 0.5) * 0.3 - cv * 0.3 - gC * 0.07;   // rừng leo theo lòng khe, tụt trên sống đá
          float fo = treeH > 0.0 ? (1.0 - smoothstep(tl - 0.015, tl + 0.015, h)) * (1.0 - smoothstep(0.66, 0.86, slope + max(cv, 0.0) * 0.35 + (n2 - 0.5) * 0.2)) : 0.0;
          // hạt tán cây: đốm sáng (ngọn cây đón nắng) / tối (kẽ cây) cỡ vài điểm ảnh
          float crown = mix(0.5, noise(vP.xz * 0.16) * 0.65 + noise(vP.xz * 0.37 + 1.3) * 0.35, dF);
          vec3 cFor = forestC * (0.7 + 0.6 * crown) * (0.85 + 0.3 * n1);
          // đồng cỏ núi cao: sườn thoải ngay trên bìa rừng
          float al = treeH > 0.0 ? (1.0 - fo) * (1.0 - smoothstep(0.4, 0.6, slope)) * (1.0 - smoothstep(tl + 0.05, tl + 0.22, h + (n2 - 0.5) * 0.2 + max(cv, 0.0) * 0.2 + gC * 0.09)) : 0.0;
          // đồng cỏ núi: xanh vàng chanh tươi (tương phản mạnh với rừng lá kim sẫm), lốm đốm đá / cỏ úa
          vec3 cAlp = mix(vec3(0.15, 0.27, 0.07), vec3(0.24, 0.3, 0.14), smoothstep(0.5, 0.85, n2));
          // ĐÁ: sáng tối theo vệt xói, sống núi đá sạch sáng hơn; lòng khe / chân vách: đá vụn xám nhạt
          vec3 cRock = rockC * (0.72 + 0.4 * rill + 0.2 * (n2 - 0.5)) * (1.0 + 0.12 * cv);
          float scree = smoothstep(0.1, 0.4, -cv) * (1.0 - smoothstep(0.35, 0.65, slope)) * 0.7;
          cRock = mix(cRock, rockC * vec3(1.12, 1.1, 1.08) * (0.9 + 0.2 * n2), scree);
          // VẾT NỨT: khe nứt mảnh sẫm trên mặt đá (2 hệ khe lệch hướng, kéo dài theo chiều đứng), tắt khi nhỏ hơn điểm ảnh
          // (không vẽ đường nứt: đường đồng mức của nhiễu thành nét nguệch ngoạc. Khe nứt = hốc tối của nổi khối gãy góc ở trên)
          cRock *= 1.0 - 0.4 * crack;
          // mặt đá không đều màu: mảng đá ấm / lạnh, vệt sẫm phong hoá, hạt lấm tấm nhỏ
          // (mảng màu kéo dài theo chiều đứng thành vệt phong hoá / vệt nước chảy trên vách, không thành đốm tròn)
          vec3 pq = vec3(vP.x, vP.y * 0.3, vP.z);
          float pt = noised(pq * 0.012 + 5.5).x, pt2 = noised(pq * 0.05 + 1.9).x;
          cRock *= mix(vec3(0.78, 0.8, 0.86), vec3(1.15, 1.08, 0.98), pt) * (0.75 + 0.5 * pt2);
          cRock *= 0.85 + 0.3 * noised(vP * 0.4).x * (1.0 - smoothstep(1.5, 4.0, pxw));
          // ĐÁ NÚI SA MẠC: vàng nâu như vành núi gần (GroundShader), vân tầng ngang nhạt lượn theo nhiễu, lên cao nhạt dần
          float stB = sin(h * 46.0 + n1 * 3.0 + (n2 - 0.5) * 1.5) * 0.5 + 0.5;
          float stUp = smoothstep(0.42, 0.8, h + (n1 - 0.5) * 0.25);
          cRock = mix(cRock, cRock * vec3(1.1, 1.14, 1.2), strataK * clamp(smoothstep(0.55, 0.85, stB) * 0.4 + stUp * 0.5, 0.0, 1.0));
          // rêu / cỏ bám gờ đá chỗ bớt dốc -> sườn đá vẫn loang xanh (sa mạc: không có, sườn thoải là đá vụn khô)
          // (rêu cỏ mọc theo lòng khe giữ ẩm -> thành dải xanh chạy dọc sườn, sống đá trơ)
          cRock = mix(cRock, cAlp * 0.75, (1.0 - smoothstep(0.42, 0.68, slope)) * smoothstep(0.35, 0.65, n2 * 0.5 + 0.25 - gC * 0.45) * 0.7 * (1.0 - strataK));
          vec3 col = mix(cRock, cAlp, al);
          col = mix(col, cFor, fo);
          // TUYẾT: trên đường tuyết đọng chỗ thoải & trong khe thành vệt chảy dọc sườn; vách dốc trơ đá
          float sl = snowH + (n1 - 0.5) * 0.12;
          float sn = smoothstep(sl - 0.03, sl + 0.04, h + max(0.0, -cv) * 0.2 - slope * 0.25 + (rill - 0.5) * 0.12 * slope - gC * 0.08 * slope);   // tuyết đọng lòng khe thành vệt, sống đá lộ
          sn *= 1.0 - smoothstep(0.55, 0.75, (1.0 - n.y) - max(0.0, -cv) * 0.3 - crack * 0.5);   // tuyết chỉ bám mặt đá hướng lên & lấp khe nứt -> loang lổ
          // (snowK < 1: vệt băng mỏng loang trên đỉnh, đá sẫm lộ qua)
          // băng trắng ngả lam nhẹ; khe nứt vẫn lộ đá sẫm qua lớp băng
          col = mix(col, vec3(0.93, 0.95, 1.0), sn * snowK);
          // CHIẾU SÁNG: nắng (bóng núi đổ tính sẵn) + ánh trời bán cầu (mặt khuất ngả xanh lam) + lòng khe khuất trời
          float ndl = max(dot(n, normalize(sunDir)), 0.0) * lit0 * (1.0 - overcast * 0.75);
          // tương phản mạnh như ảnh thật: mặt nắng sáng ấm, mặt khuất / bóng núi xanh lam sẫm
          vec3 amb = mix(zenith * 0.3, zenith * 0.42, 0.5 + 0.5 * n.y) * vec3(0.85, 0.95, 1.15) * (0.75 + 0.25 * clamp(cv + 0.5, 0.0, 1.0));
          // (nắng ×1.7 + màu lá nguyên độ bão hoà: núi cách vài km xanh rực như cỏ dưới chân, trông như tự phát sáng)
          col *= sunColor * ndl * 1.5 + amb;
          // không khí dày vài km ăn bớt độ bão hoà trước khi phủ sương: lá ngả xám lục, đá sa mạc giữ sắc vàng hơn
          col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))), 0.22 * (1.0 - 0.6 * strataK));
          // PHỐI CẢNH KHÔNG KHÍ: xa nhạt ngả màu trời; thung lũng thấp chìm sương; trời âm u: núi tan vào mây
          // Núi ở ~25 km phải mờ HƠN cảnh nền thật ở 3-6 km (cảnh nền hoà vào màu sương fogC): chân núi chìm đúng màu sương
          // với độ đậm như dải đồi xa, lên cao không khí loãng -> đỉnh rõ dần; dải xa của vành mờ thêm
          float hz = mix(0.92, hazeB + 0.2, pow(smoothstep(0.02, 0.6, h), 0.8)) + 0.22 * far;
          // không bao giờ rõ hơn cảnh nền thật phía trước: tối thiểu bằng sương của game (FogExp2) ở ~4 km, lên cao không
          // khí loãng nên đỉnh tính như gần hơn
          float fd = uFogD * 3000.0 * (1.0 - 0.45 * smoothstep(0.0, 0.9, h));
          float fogK = 1.0 - exp(-fd * fd);
          // trời âm u: núi chìm trong không khí xám nhưng vẫn là khối sẫm (không tan hẳn thành màu mây sáng)
          // (trước khi lấy max với sương game: sương dày vẫn phủ kín 100%, không còn bóng núi mờ sẫm hơn màn sương)
          hz = mix(hz, 0.9, overcast * 0.6);
          hz = max(hz, fogK);
          // chân núi chìm vào cùng màu không khí xa sẫm ngả lam như đồi cảnh nền (backdrop.js HAZE_GLSL), đỉnh ngả màu sương sáng
          // (trời âm u: đỉnh không ngả màu sương sáng — dưới mây, cả dãy núi là khối xám lam sẫm hơn bầu trời, đều từ chân lên đỉnh)
          vec3 hzC = mix(fogC * farAir, fogC * mix(1.0, 0.58, overcast), smoothstep(0.25, 0.85, h) * (1.0 - 0.6 * overcast));
          // sương mù dày (fog của game đặc): núi tan hẳn vào đúng màu sương như cảnh vật gần hơn (không lộ bóng núi sẫm sau màn sương)
          hzC = mix(hzC, fogC, smoothstep(0.55, 0.95, fogK));
          // LỚP MÙ SÁT CHÂN TRỜI: camera càng cao, chân dãy núi càng tụt sâu dưới mép đất xa (cảnh nền ở mặt phẳng cắt xa đã
          // hoà hẳn màu không khí xa) -> ngay trên mép đất lộ ra sườn giữa núi xanh đậm ít sương: dải đất xa thành tấm lam xám
          // phẳng sáng hơn cả núi phía sau, mép trên thẳng tắp. Sương theo góc nhìn trên mép đất: sát mép đúng màu dải đất xa,
          // núi nhô dần lên khỏi lớp mù như ảnh chụp từ trên cao
          float aE = vRel.y / max(1.0, length(vRel.xz)) - uHor;
          float lowH = 1.0 - smoothstep(0.0, 0.026, aE);
          hzC = mix(hzC, fogC * farAir, lowH * (1.0 - smoothstep(0.55, 0.95, fogK)));
          hz = max(hz, lowH * 0.97);
          col = mix(col, hzC, clamp(hz, 0.0, fogK > 0.95 ? 1.0 : 0.97));
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'skyRange';
    m.renderOrder = -9;
    m.frustumCulled = false;
    m.raycast = () => {};   // chỉ để nhìn: tia ngắm / va chạm bỏ qua
    // núi ở xa ~25 km: camera lên cao thì chân trời núi hạ xuống chút ít (thị sai dọc theo khoảng cách ảo)
    m.onBeforeRender = (r, sc, cam) => {
      mat.uniforms.uFogD.value = sc.fog && sc.fog.density !== undefined ? sc.fog.density : 0;
      // góc mép đất xa dưới tầm mắt (đất / cảnh nền chỉ vẽ tới mặt phẳng cắt xa) — lớp mù sát chân trời bám theo
      mat.uniforms.uHor.value = -Math.max(0, cam.position.y) / (cam.far || 9000);
      // (khoảng cách ảo không xa hơn mặt phẳng cắt xa: cảnh nền / biển thật chỉ vẽ tới đó -> chân trời thật tụt theo góc
      // độ cao camera / far; tính như 25 km thì từ camera pháo binh / drone chân núi lơ lửng trên đường chân trời biển)
      m.position.y = -cam.position.y * (R1 / Math.min(25000, cam.far || 25000));
      m.updateMatrix();
      if (m.parent) m.matrixWorld.multiplyMatrices(m.parent.matrixWorld, m.matrix);
    };
    return m;
  }

  // Ánh sáng khớp bầu trời: mặt trời (đổ bóng), ánh trời bán cầu (trời xanh / đất phản xạ), ambient nhẹ
  function applyLights(scene, sunLight, hemi, ambient, atm) {
    if (!atm) return;
    if (sunLight) {
      sunLight.color.setHex(atm.sunColor);
      sunLight.intensity = atm.sunIntensity;
      sunLight.userData.sunDir = atm.sunDir.clone();
    }
    if (hemi) {
      // ánh trời ngả xanh rõ hơn (vùng bóng lạnh màu, vùng nắng ấm -> tương phản nóng / lạnh như ảnh chụp ngoài trời)
      hemi.color.setHex(atm.zenith).lerp(new THREE.Color(0xffffff), 0.32);
      hemi.groundColor.setHex(atm.ground || 0x806a50);
      hemi.intensity = atm.skyIntensity;
    }
    if (ambient) ambient.intensity = atm.ambientIntensity !== undefined ? atm.ambientIntensity : 0.15;
  }

  /**
   * Đường cong tông màu "vai mềm" cho cảnh trận (thay cho cắt cứng ở 1.0):
   * - Dưới ngưỡng gối (0.6) giữ nguyên -> trung tông, màu sơn xe, giao diện 3D không đổi
   * - Phần sáng hơn được nén mượt về 1.0 theo kênh sáng nhất (giữ sắc độ) -> bê tông / cát / ngọn cỏ dưới nắng
   *   không còn cháy trắng, lá cây không bị đẩy thành xanh neon do kênh G bị cắt
   * - Vùng rất sáng nhạt màu nhẹ như phim thật
   */
  function installToneCurve(renderer, exposure) {
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    if (chunk.indexOf('SOFT_SHOULDER_TONE') < 0) {
      THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(/vec3 CustomToneMapping\( vec3 color \) \{ return color; \}/, `// SOFT_SHOULDER_TONE
vec3 CustomToneMapping( vec3 color ) {
  color *= toneMappingExposure;
  float m = max( max( color.r, color.g ), color.b );
  const float K = 0.6;
  if ( m > K ) {
    float t = m - K;
    color *= ( K + ( 1.0 - K ) * ( 1.0 - exp( - t / ( 1.0 - K ) ) ) ) / m;
    float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = mix( color, vec3( l ), clamp( t * 0.35, 0.0, 0.35 ) );
  }
  return color;
}`);
    }
    if (renderer) {
      renderer.toneMapping = THREE.CustomToneMapping;
      renderer.toneMappingExposure = exposure || 1.0;
    }
  }

  /**
   * BÓNG MÂY TRÔI DÙNG CHUNG: mây che nắng thì MỌI vật trong vùng đó cùng tối (mặt đất, nhà, xe, cây) — trước đây chỉ
   * mặt đất tối, nhà / xe đứng trong bóng mây vẫn sáng chói như có đèn rọi riêng.
   * Vá chunk chiếu sáng của Three.js: nhân ánh nắng trực tiếp (đèn hướng) với độ che của mây tại điểm đang tô (toạ độ
   * thế giới dựng lại từ vViewPosition + viewMatrix), ánh trời tán xạ giữ nguyên.
   * CLOUD dùng chung cho mọi vật liệu (object thường không bị cloneUniforms nhân bản): x = thời gian, y = độ đậm bóng
   * (0 = tắt: sảnh / phòng xem xe không có mây), z = 1 / cỡ đám mây, w = ngưỡng độ phủ
   */
  const CLOUD = { x: 0, y: 0, z: 1 / 1100, w: 0.56 };
  function installCloudShadows() {
    const C = THREE.ShaderChunk;
    if (C.lights_pars_begin.indexOf('skyCloudShade') >= 0) return;
    C.lights_pars_begin = `uniform vec4 skyCloudU;
float skyCH( vec2 p ) { vec3 q = fract( p.xyx * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float skyCN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skyCH( i ), skyCH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( skyCH( i + vec2( 0.0, 1.0 ) ), skyCH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float skyCloudShade( vec3 viewPos ) {
  if ( skyCloudU.y <= 0.0 ) return 1.0;
  vec3 v = viewPos - viewMatrix[ 3 ].xyz;
  vec2 w = vec2( dot( viewMatrix[ 0 ].xyz, v ), dot( viewMatrix[ 2 ].xyz, v ) );
  // gió trôi chậm (~2 m/s ở độ cao mây), đám mây vài trăm mét, mép mềm, trong đám có chỗ dày chỗ mỏng
  vec2 p = ( w + skyCloudU.x * vec2( 16.0, 7.0 ) ) * skyCloudU.z;
  float n = skyCN( p ) * 0.55 + skyCN( p * 2.13 + 3.7 ) * 0.3 + skyCN( p * 4.7 + 9.1 ) * 0.15;
  float c = smoothstep( skyCloudU.w, skyCloudU.w + 0.2, n ) * ( 0.75 + 0.25 * smoothstep( skyCloudU.w + 0.1, skyCloudU.w + 0.3, n ) );
  return 1.0 - skyCloudU.y * c;
}
` + C.lights_pars_begin;
    const A = 'DirectionalLight directionalLight;';
    const B = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
    if (C.lights_fragment_begin.indexOf(A) < 0 || C.lights_fragment_begin.indexOf(B) < 0) return;
    C.lights_fragment_begin = C.lights_fragment_begin
      .replace(A, A + '\n\tfloat skyCloud = skyCloudShade( - vViewPosition );')
      .replace(B, B + '\n\t\tdirectLight.color *= skyCloud;');
    // mọi loại vật liệu có chiếu sáng từng điểm ảnh mang uniform này (cùng một object CLOUD)
    for (const k of ['standard', 'physical', 'phong', 'toon']) if (THREE.ShaderLib[k]) THREE.ShaderLib[k].uniforms.skyCloudU = { value: CLOUD };
  }
  /**
   * BÓNG NẮNG 2 TẦNG: khung bóng mặt trời phủ ±1200+ quanh vùng nhìn -> 1 texel ~1,2 đơn vị (xe dài ~48) + normalBias 0,8:
   * bóng tháp pháo xuống sàn xe, khối ERA, nắp, ống khói... bị xoá sạch, xe trông phẳng như đồ chơi. Game thêm đèn hướng
   * thứ 2 (cường độ 0, chỉ để có bản đồ bóng) phủ khung hẹp quanh xe mình; cảnh có ĐÚNG 2 đèn hướng đổ bóng thì đèn 0 lấy
   * bóng tầng gần (nét) trong khung đó, ra gần mép khung pha dần về bóng tầng xa. Phòng xem xe chỉ 1 đèn đổ bóng -> như cũ
   */
  function installNearShadow() {
    const C = THREE.ShaderChunk;
    if (C.shadowmap_pars_fragment.indexOf('skySunShadow') >= 0) return;
    const LF = 'directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
    const SM = 'shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
    if (C.lights_fragment_begin.indexOf(LF) < 0 || C.shadowmask_pars_fragment.indexOf(SM) < 0) return;
    C.shadowmap_pars_fragment += `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2
float skySunShadow() {
	vec4 nc = vDirectionalShadowCoord[ 1 ];
	float e = max( abs( nc.x - 0.5 ), abs( nc.y - 0.5 ) );
	float k = ( 1.0 - smoothstep( 0.36, 0.47, e ) ) * step( nc.z, 1.0 );
	float n = k > 0.0 ? getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, nc ) : 1.0;
	if ( k >= 1.0 ) return n;
	float f = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
	return mix( f, n, k );
}
#endif
`;
    // đèn 1 (cường độ 0) không cần đọc bóng; đèn 0 lấy bóng 2 tầng
    C.lights_fragment_begin = C.lights_fragment_begin.replace(LF, `#if NUM_DIR_LIGHT_SHADOWS == 2
		#if UNROLLED_LOOP_INDEX == 0
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? skySunShadow() : 1.0;
		#endif
		#else
		${LF}
		#endif`);
    C.shadowmask_pars_fragment = C.shadowmask_pars_fragment.replace(SM, `#if NUM_DIR_LIGHT_SHADOWS == 2
		#if UNROLLED_LOOP_INDEX == 0
		shadow *= receiveShadow ? skySunShadow() : 1.0;
		#endif
		#else
		${SM}
		#endif`);
  }
  function tickClouds(dt) { CLOUD.x += dt; }
  // độ đậm bóng mây theo chiến địa (sa mạc nắng gắt ít mây; rừng / sông hồ nhiều mây hơn); 0 = tắt
  function setClouds(strength, coverage) { CLOUD.y = strength; if (coverage !== undefined) CLOUD.w = coverage; }
  function cloudStrength() { return CLOUD.y; }

  return { create, applyLights, installToneCurve, installCloudShadows, installNearShadow, tickClouds, setClouds, cloudStrength };
})();

// vá chunk chiếu sáng ngay khi tải (trước khi bất kỳ shader nào được biên dịch: sảnh, phòng xem xe, trận)
if (typeof THREE !== 'undefined') { SkySystem.installCloudShadows(); SkySystem.installNearShadow(); }
if (typeof window !== 'undefined') window.SkySystem = SkySystem;
