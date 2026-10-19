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
        uniform vec3 zenith, horizon, ground, sunDir, sunColor;
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
          // Dưới chân trời: hòa vào màu mặt đất xa (bị sương che)
          col = mix(col, mix(horizon, ground, 0.35), smoothstep(0.0, -0.08, h));
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
    if (ambient) ambient.intensity = 0.22;
  }

  return { create, applyLights };
})();

if (typeof window !== 'undefined') window.SkySystem = SkySystem;
