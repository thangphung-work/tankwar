/**
 * PHONG HOÁ VẬT LIỆU — dấu vết thời gian cho cảnh vật rời (thùng rác, rào, cột đèn, xác xe, lô cốt, cây...)
 * Chèn vào shader MeshStandardMaterial (không tốn texture), mỗi chỗ trên vật một kiểu, không vật nào "mới tinh":
 *  · lệch sắc độ riêng từng vật (theo số thứ tự instance / vị trí gốc)
 *  · bạc màu nắng: mặt hướng lên phai, mất bão hoà, sáng phấn
 *  · loang ố / đốm bẩn mảng lớn
 *  · vệt nước mưa chảy dọc trên mặt đứng, đứt quãng
 *  · bụi / cát phủ mặt trên (màu theo bản đồ)
 *  · bùn đất bám chân vật: mép trên lượn sóng + lốm đốm bùn bắn lên cao hơn (màu theo bản đồ)
 *  · kim loại: gỉ sét loang (nhiều hơn ở chân, theo vệt nước) + tróc sơn lộ lớp lót sẫm
 *  · rêu / tảo chỗ ẩm sát đất, mặt hướng lên (mạnh yếu theo khí hậu bản đồ)
 * Toạ độ hoa văn: 'local' (theo vật, vật bị hất văng / cây đổ không trượt hoa văn) hoặc 'world' (vật đứng yên, liền
 * mạch qua các phần ghép). Độ cao tính từ gốc vật (gốc instance = chân vật), hoặc thuộc tính `wxBase` (cao độ chân
 * vật, đơn vị thế giới) khi gốc từng phần ghép không nằm ở chân (cột đèn ghép từ khối hộp / trụ đơn vị).
 * Đơn vị thế giới: 8 = 1 m. Dùng: Weathering.apply(mat, 'plastic', { grime: 0.9 }) — preset + ghi đè từng tham số.
 */
const Weathering = (() => {
  // khí hậu dùng chung mọi vật liệu (đổi theo bản đồ): màu bùn chân vật, màu bụi mặt trên, độ rêu
  const CLIMATE = {
    uWxMud: { value: new THREE.Color(0.27, 0.24, 0.2) },
    uWxDust: { value: new THREE.Color(0.55, 0.53, 0.48) },
    uWxMoss: { value: 0.5 }
  };
  const BIOME = {
    DESERT: { mud: [0.6, 0.5, 0.37], dust: [0.78, 0.69, 0.54], moss: 0 },
    URBAN: { mud: [0.25, 0.235, 0.21], dust: [0.56, 0.55, 0.51], moss: 0.3 },
    JUNGLE: { mud: [0.2, 0.15, 0.1], dust: [0.44, 0.41, 0.32], moss: 1 },
    HIGHLAND: { mud: [0.32, 0.29, 0.24], dust: [0.62, 0.6, 0.55], moss: 0.6 },
    RIVER_LAKE: { mud: [0.24, 0.19, 0.12], dust: [0.5, 0.47, 0.38], moss: 0.9 }
  };
  function setBiome(type) {
    const b = BIOME[type] || BIOME.URBAN;
    CLIMATE.uWxMud.value.setRGB(...b.mud);
    CLIMATE.uWxDust.value.setRGB(...b.dust);
    CLIMATE.uWxMoss.value = b.moss;
  }

  // grime: bùn chân · grimeH: cao vệt bùn (đv) · streak: vệt mưa · dust: bụi mặt trên · fade: bạc nắng · stain: loang ố
  // rust: gỉ · chip: tróc sơn · moss: rêu (nhân độ rêu bản đồ) · vary: lệch sắc từng vật · scale: tần số hoa văn · lift: chân thấp hơn gốc (đv)
  const BASE = { grime: 0.6, grimeH: 2.5, streak: 0.4, dust: 0.4, fade: 0.3, stain: 0.4, rust: 0, chip: 0, moss: 0.2, vary: 1, scale: 1, lift: 0, space: 'world', baseAttr: false };
  const PRESET = {
    plastic: { grime: 0.75, streak: 0.45, dust: 0.45, fade: 0.85, stain: 0.45, moss: 0.15, space: 'local' },
    card: { grime: 0.85, grimeH: 1.4, streak: 0.25, dust: 0.3, fade: 0.35, stain: 0.9, moss: 0.1, space: 'local', scale: 1.6 },
    paint: { grime: 0.8, streak: 0.75, dust: 0.4, fade: 0.45, stain: 0.5, rust: 0.45, chip: 0.55, moss: 0.1, space: 'local' },
    galv: { grime: 0.6, streak: 0.6, dust: 0.3, fade: 0.2, stain: 0.55, rust: 0.3, chip: 0.15, moss: 0.05 },
    wood: { grime: 0.7, grimeH: 3, streak: 0.45, dust: 0.3, fade: 0.65, stain: 0.55, moss: 0.55 },
    stone: { grime: 0.5, grimeH: 3, streak: 0.55, dust: 0.35, fade: 0.15, stain: 0.5, moss: 0.65 },
    concrete: { grime: 0.65, grimeH: 4, streak: 0.7, dust: 0.35, fade: 0.2, stain: 0.6, moss: 0.8 },
    bark: { grime: 0.55, grimeH: 3.5, streak: 0.2, dust: 0.1, fade: 0.1, stain: 0.3, moss: 0.9, space: 'local' },
    soil: { grime: 0.3, streak: 0.15, dust: 0.45, fade: 0.2, stain: 0.6, moss: 0.4 },
    burnt: { grime: 0.5, streak: 0.5, dust: 0.55, fade: 0.1, stain: 0.7, rust: 0.85, chip: 0.2, moss: 0.05 }
  };

  const GLSL = `
    uniform vec3 uWxMud, uWxDust; uniform float uWxMoss;
    uniform vec4 uWxA, uWxB, uWxC;
    varying vec3 vWxL; varying vec3 vWxN; varying float vWxH; varying float vWxS;
    float wxRoughAdd = 0.0, wxMetalK = 1.0;
    float wxH3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    float wxN3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(wxH3(i), wxH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(wxH3(i + vec3(0.0, 1.0, 0.0)), wxH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                 mix(mix(wxH3(i + vec3(0.0, 0.0, 1.0)), wxH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(wxH3(i + vec3(0.0, 1.0, 1.0)), wxH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
    float wxF3(vec3 p) { return wxN3(p) * 0.55 + wxN3(p * 2.03 + 5.1) * 0.3 + wxN3(p * 4.1 + 9.7) * 0.15; }`;

  const VERT = `#include <project_vertex>
    {
      mat4 wxM = modelMatrix;
      #ifdef USE_INSTANCING
        wxM = modelMatrix * instanceMatrix;
      #endif
      vec4 wxW = wxM * vec4(transformed, 1.0);
      vec3 wxO = (wxM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vWxN = normalize(mat3(wxM) * objectNormal);
      #ifdef WX_LOCAL
        vWxL = transformed * vec3(length(wxM[0].xyz), length(wxM[1].xyz), length(wxM[2].xyz));
      #else
        vWxL = wxW.xyz;
      #endif
      #ifdef WX_BASE_ATTR
        vWxH = wxW.y - wxBase;
      #else
        vWxH = wxW.y - wxO.y + uWxC.w;
      #endif
      #if defined( USE_INSTANCING ) && __VERSION__ >= 300
        vWxS = wxH3(vec3(float(gl_InstanceID) * 1.618 + 0.5, 3.1, 7.7));
      #else
        vWxS = wxH3(floor(wxO * 0.25) + 0.5);
      #endif
    }`;

  const FRAG = `#include <color_fragment>
    {
      vec3 N = normalize(vWxN);
      vec3 P = vWxL * uWxC.z;
      float up = N.y, wall = 1.0 - smoothstep(0.55, 0.9, abs(up));
      vec3 c = diffuseColor.rgb;
      float lum = dot(c, vec3(0.3, 0.59, 0.11));
      // 0) lệch sắc từng vật: sáng / tối, ngả ấm
      c *= 1.0 + (vWxS - 0.5) * 0.24 * uWxC.y;
      c = mix(c, c * vec3(1.06, 1.0, 0.88), fract(vWxS * 7.31) * 0.45 * uWxC.y);
      lum = dot(c, vec3(0.3, 0.59, 0.11));
      // 1) bạc màu nắng: mặt hướng lên phai nhiều, mặt đứng phai ít; mất bão hoà + sáng phấn
      float fadeK = uWxB.x * (0.3 + 0.7 * smoothstep(-0.2, 0.9, up)) * (0.65 + 0.7 * wxF3(P * 0.07));
      c = mix(c, vec3(lum) * 1.1 + 0.035, clamp(fadeK, 0.0, 1.0) * 0.55);
      // 2) loang ố mảng lớn (ẩm, dầu mỡ, nắng mưa)
      float st = smoothstep(0.52, 0.84, wxF3(P * 0.11 + 3.0));
      c *= 1.0 - uWxB.y * st * 0.32;
      c = mix(c, c * vec3(1.0, 0.88, 0.72), uWxB.y * st * 0.35);
      // 3) vệt nước mưa chảy dọc: tần số cao theo ngang, thấp theo dọc, đứt quãng
      float sk = smoothstep(0.56, 0.84, wxN3(vec3(P.x * 1.7, P.y * 0.06, P.z * 1.7) + 7.0))
               * smoothstep(0.25, 0.62, wxN3(P * vec3(0.35, 0.12, 0.35) + 1.0));
      c = mix(c, c * vec3(0.6, 0.58, 0.54), sk * wall * uWxA.z * 0.85);
      // 4) bụi / cát phủ mặt trên
      float du = smoothstep(0.35, 0.92, up) * (0.5 + 0.5 * wxF3(P * 0.3 + 11.0));
      c = mix(c, uWxDust * (0.82 + 0.3 * lum), clamp(du * uWxA.w, 0.0, 1.0) * 0.6);
      wxRoughAdd += du * uWxA.w * 0.25;
      // 5) bùn đất bám chân: mép trên lượn theo nhiễu, đậm dần xuống đất + lốm đốm bùn bắn cao hơn
      float gH = uWxA.y * (0.45 + 1.1 * wxF3(P * 0.22 + 17.0));
      float gr = (1.0 - smoothstep(gH * 0.35, gH, vWxH)) * (0.75 + 0.25 * wxN3(P * 2.1 + 8.0));
      float spl = smoothstep(0.64, 0.8, wxN3(P * 1.25 + 2.0)) * (1.0 - smoothstep(gH, gH * 2.6, vWxH));
      float gk = clamp(gr * 0.9 + spl * 0.55, 0.0, 1.0) * uWxA.x;
      // bùn khô: sắc bùn nhuộm lên màu gốc (vật sẫm sáng lên một chút, vật sáng sẫm đi), không phủ kín như sơn
      vec3 mud = uWxMud * (0.65 + 0.45 * wxN3(P * 0.9));
      c = mix(c, mix(mud, c * mud * 2.4, 0.35), gk * 0.85);
      wxRoughAdd += gk * 0.3; wxMetalK *= 1.0 - gk * 0.8;
      // 6) kim loại: gỉ loang (nhiều hơn ở chân, theo vệt nước), vệt gỉ chảy; tróc sơn lộ lớp lót / thép sẫm
      if (uWxB.z > 0.0) {
        float rn = wxF3(P * 0.17 + 21.0) + (1.0 - smoothstep(0.0, uWxA.y * 3.0, vWxH)) * 0.24 + sk * 0.22;
        float rust = smoothstep(0.6, 0.8, rn) * uWxB.z;
        float rRun = smoothstep(0.62, 0.86, wxN3(vec3(P.x * 2.4, P.y * 0.05, P.z * 2.4) + 19.0)) * smoothstep(0.45, 0.7, rn) * wall * uWxB.z;
        vec3 rc = mix(vec3(0.34, 0.19, 0.1), vec3(0.19, 0.11, 0.06), wxN3(P * 2.2 + 4.0));
        c = mix(c, rc, clamp(rust * 0.78 + rRun * 0.4, 0.0, 1.0));
        wxRoughAdd += rust * 0.35; wxMetalK *= 1.0 - clamp(rust, 0.0, 1.0) * 0.75;
      }
      if (uWxB.w > 0.0) {
        float ch = smoothstep(0.76, 0.82, wxN3(P * 2.4 + 13.0)) * smoothstep(0.35, 0.7, wxN3(P * 0.3 + 6.0));
        c = mix(c, vec3(0.19, 0.18, 0.17) * (0.8 + 0.4 * lum), ch * uWxB.w);
        wxRoughAdd += ch * 0.2 * uWxB.w;
      }
      // 7) rêu / tảo: chỗ ẩm sát đất, mặt hướng lên, theo khí hậu bản đồ
      float mk = uWxC.x * uWxMoss;
      if (mk > 0.0) {
        float mn = wxF3(P * 0.14 + 31.0) + (1.0 - smoothstep(0.0, uWxA.y * 2.5, vWxH)) * 0.18 + smoothstep(0.5, 1.0, up) * 0.1;
        float m = smoothstep(0.55, 0.75, mn) * mk;
        c = mix(c, vec3(0.19, 0.25, 0.1) * (0.7 + 0.5 * wxN3(P * 1.7)), clamp(m, 0.0, 1.0) * 0.72);
        wxRoughAdd += m * 0.3;
      }
      diffuseColor.rgb = c;
    }`;

  function apply(mat, preset, over) {
    if (!mat || mat.userData.wx) return mat;
    const o = Object.assign({}, BASE, PRESET[preset] || {}, over || {});
    const U = {
      uWxA: { value: new THREE.Vector4(o.grime, o.grimeH, o.streak, o.dust) },
      uWxB: { value: new THREE.Vector4(o.fade, o.stain, o.rust, o.chip) },
      uWxC: { value: new THREE.Vector4(o.moss, o.vary, o.scale, o.lift) }
    };
    mat.userData.wx = U;
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    const NL = String.fromCharCode(10);
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, CLIMATE, U);
      const defs = (o.space === 'local' ? '#define WX_LOCAL' + NL : '') + (o.baseAttr ? '#define WX_BASE_ATTR' + NL + 'attribute float wxBase;' + NL : '');
      sh.vertexShader = defs + GLSL + NL + sh.vertexShader.replace('#include <project_vertex>', VERT);
      sh.fragmentShader = GLSL + NL + sh.fragmentShader.replace('#include <color_fragment>', FRAG)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + NL + 'roughnessFactor = clamp(roughnessFactor + wxRoughAdd, 0.04, 1.0);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>' + NL + 'metalnessFactor *= wxMetalK;');
    };
    mat.customProgramCacheKey = () => (key ? key() : '') + '|wx1' + (o.space === 'local' ? 'L' : 'W') + (o.baseAttr ? 'A' : '');
    return mat;
  }

  return { apply, setBiome, PRESET, CLIMATE };
})();
