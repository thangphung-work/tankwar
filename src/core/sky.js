/**
 * BẦU TRỜI: vòm trời gradient (thiên đỉnh -> chân trời), đĩa mặt trời + quầng sáng, mây tầng cao mờ
 * Hướng mặt trời trùng với đèn chiếu sáng chính để bóng đổ khớp vị trí mặt trời nhìn thấy.
 */
const SkySystem = (() => {
  function create(parent, atm) {
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
        flashDir: { value: new THREE.Vector3(0, 1, 0) }
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
        uniform float time, overcast, storm, flash;
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
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky';
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return { mesh, atm };
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
  function tickClouds(dt) { CLOUD.x += dt; }
  // độ đậm bóng mây theo chiến địa (sa mạc nắng gắt ít mây; rừng / sông hồ nhiều mây hơn); 0 = tắt
  function setClouds(strength, coverage) { CLOUD.y = strength; if (coverage !== undefined) CLOUD.w = coverage; }
  function cloudStrength() { return CLOUD.y; }

  return { create, applyLights, installToneCurve, installCloudShadows, tickClouds, setClouds, cloudStrength };
})();

// vá chunk chiếu sáng ngay khi tải (trước khi bất kỳ shader nào được biên dịch: sảnh, phòng xem xe, trận)
if (typeof THREE !== 'undefined') SkySystem.installCloudShadows();
if (typeof window !== 'undefined') window.SkySystem = SkySystem;
