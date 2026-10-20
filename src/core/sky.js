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
        time: { value: 0 }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        uniform vec3 zenith, horizon, ground, sunDir, sunColor, fogC;
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
          // Sát / dưới chân trời: đúng màu sương -> cảnh nền xa (đã hòa vào sương) liền với bầu trời, không lộ mép cắt
          // dải mù chân trời: núi / đảo xa đã chìm trong sương nổi lên như bóng mờ chứ không thành mảng màu phẳng
          col = mix(col, fogC, pow(smoothstep(0.16, -0.015, h), 1.6));
          // Tán xạ quanh mặt trời (Mie) + đĩa mặt trời
          float cs = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(cs, 8.0) * 0.28 + pow(cs, 64.0) * 0.45);
          col = mix(col, vec3(1.0, 0.98, 0.92) * 1.6, smoothstep(0.99955, 0.99975, cs));
          // Mây ti tầng cao mỏng
          if (h > 0.02) {
            vec2 uv = d.xz / (h + 0.25) * 2.2;
            float c = noise(uv) * 0.6 + noise(uv * 2.7) * 0.3 + noise(uv * 6.1) * 0.1;
            c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.25, h) * 0.55;
            col = mix(col, mix(vec3(1.0), sunColor, 0.25) * (0.85 + 0.25 * cs), c);
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
      hemi.color.setHex(atm.zenith).lerp(new THREE.Color(0xffffff), 0.45);
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

  return { create, applyLights, installToneCurve };
})();

if (typeof window !== 'undefined') window.SkySystem = SkySystem;
