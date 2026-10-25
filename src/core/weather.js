/**
 * THỜI TIẾT: MƯA (đồng bộ mọi máy theo hạt giống bản đồ — không cần gửi gì qua mạng)
 *
 * - Mỗi bản đồ (loại + hạt giống) có thời tiết cố định: forMap(type, seed). Xác suất mưa theo chiến địa (sa mạc hiếm,
 *   rừng nhiệt đới hay mưa). Sảnh chọn "Ngẫu nhiên / Nắng / Mưa" = chủ phòng chọn hạt giống khớp ý (seedFor).
 * - Trời âm u kín mây, sương mù dày (tầm nhìn hạn chế: sương + tầm phát hiện địch giảm — TeamIntel.sightRange)
 * - Mọi bề mặt ngoài trời ướt (vá chunk chiếu sáng dùng chung như bóng mây — SkySystem): sẫm màu, bóng nước, phản chiếu
 *   trời xám, lấm tấm giọt mưa đập trên mặt ngửa. Mặt đất / đường / mặt nước có vũng, vòng sóng giọt mưa riêng.
 * - BẢN ĐỒ HỨNG MƯA: vẽ một lần từ trên cao xuống (camera trực giao) độ cao mặt CAO NHẤT tại mỗi điểm (địa hình, mái nhà,
 *   mái hầm, mặt cầu...). Điểm thấp hơn mặt đó = có mái che: không ướt, hạt mưa không rơi xuyên vào lòng hầm / trong nhà,
 *   giọt mưa bắn tung tóe đúng trên mặt hứng (đất, mái, nắp hầm)
 * - Hạt mưa: vệt mưa nặng hạt 2 lớp (gần dày, xa thưa) + giọt bắn — toàn bộ chuyển động tính trên GPU (CPU không cập nhật
 *   từng hạt), số hạt theo mức đồ họa
 * - Sấm chớp ngẫu nhiên: chớp lóe sáng cả cảnh + tia sét, tiếng sấm trễ theo khoảng cách (âm thanh 343 m/s)
 * - Hầm cứ điểm (sàn hạ thấp) ngập nước, hố bom đọng nước dần khi mưa
 * Tỉ lệ: 8 đơn vị = 1 m.
 */
const Weather = (() => {
  // Xác suất mưa & đặc trưng mưa từng chiến địa. zen / hor / fog: màu trời mây mưa; dens: mật độ sương (FogExp2);
  // puddle: lượng vũng; flood: mực nước ngập lòng hầm (đơn vị); sight: hệ số tầm phát hiện địch
  // (dens đã giảm ~40%: sương cũ che ~63% cảnh ở 60 m -> cả bản đồ xám đặc như sương mù, mất màu; mưa thật vẫn nhìn rõ
  //  vài trăm mét. Tầm phát hiện địch khi mưa do sight quyết định, không đổi)
  // (giảm từ URBAN 0.3 / JUNGLE 0.5 / HIGHLAND 0.35 / RIVER_LAKE 0.4: mưa quá thường xuyên, đa số trận xám u ám)
  const CHANCE = { DESERT: 0.08, URBAN: 0.2, JUNGLE: 0.35, HIGHLAND: 0.25, RIVER_LAKE: 0.25 };
  const KIND = {
    DESERT: { zen: 0x6c6a66, hor: 0xa29e96, fog: 0x99958c, ground: 0x6a5840, dens: 0.0010, puddle: 0.35, flood: 1.6, sight: 0.72 },
    URBAN: { zen: 0x5c636a, hor: 0x969ca1, fog: 0x8a9095, ground: 0x45464a, dens: 0.00115, puddle: 1.0, flood: 3.0, sight: 0.7 },
    JUNGLE: { zen: 0x56605a, hor: 0x8e9990, fog: 0x838e86, ground: 0x3a3a2a, dens: 0.0015, puddle: 1.0, flood: 4.2, sight: 0.62 },
    HIGHLAND: { zen: 0x5d6770, hor: 0x9aa3aa, fog: 0x8d969e, ground: 0x4c4a40, dens: 0.0014, puddle: 0.7, flood: 2.8, sight: 0.64 },
    RIVER_LAKE: { zen: 0x5a656b, hor: 0x98a2a6, fog: 0x89949a, ground: 0x404634, dens: 0.0012, puddle: 0.9, flood: 3.6, sight: 0.68 }
  };
  const PREF_KEY = 'tw_weather_pref';

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Thời tiết của bản đồ (cùng loại + hạt giống -> giống hệt nhau trên mọi máy)
  function forMap(type, seed) {
    const r = rng(((seed >>> 0) ^ 0x7a1e5b3d) >>> 0);
    const roll = r(), k = r(), s = r();
    if (roll >= (CHANCE[type] !== undefined ? CHANCE[type] : 0.3)) return { rain: false, intensity: 0 };
    const K = KIND[type] || KIND.HIGHLAND;
    // mưa nặng hạt: 0.82..1; storm: độ đen mây giông 0.55 (âm u nặng) .. 1 (đen kịt, sét dày hơn)
    return Object.assign({ rain: true, intensity: 0.82 + 0.18 * k, storm: 0.55 + 0.45 * s, wet: 1 }, K);
  }
  function pref() {
    try { const v = localStorage.getItem(PREF_KEY); return v === 'rain' || v === 'clear' ? v : 'random'; } catch (e) { return 'random'; }
  }
  function setPref(v) { try { localStorage.setItem(PREF_KEY, v); } catch (e) { /* trình duyệt chặn lưu trữ */ } }
  const matches = (type, seed, p) => p === 'random' || (forMap(type, seed).rain === (p === 'rain'));
  // Hạt giống bản đồ khớp lựa chọn thời tiết ở sảnh (chủ phòng chọn; khách nhận hạt giống nên thấy cùng thời tiết)
  function seedFor(type, p) {
    p = p || pref();
    const R = () => (typeof NetUtil !== 'undefined' ? NetUtil.randomSeed() : (Math.random() * 4294967296) >>> 0);
    let s = R();
    for (let i = 0; i < 500 && !matches(type, s, p); i++) s = R();
    return s >>> 0;
  }

  // ===========================================================================
  // UNIFORM DÙNG CHUNG (object thường -> cloneUniforms của Three.js không nhân bản, mọi vật liệu cùng đọc 1 chỗ)
  // WET: x = độ ướt (0 = tắt: sảnh, phòng xem xe), y = thời gian, z = mật độ giọt (tỉ lệ ô có giọt), w = có bản đồ hứng mưa
  // ===========================================================================
  const WET = { x: 0, y: 0, z: 0.6, w: 0 };
  // 4 vụ nổ / phát bắn gần nhất (x, z, thời điểm, độ mạnh) — mảng Vector4 dùng chung (cloneUniforms chỉ chép nông mảng)
  const BLAST = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
  let blastI = 0;
  const SKYH = { r: 0.55, g: 0.57, b: 0.6 }, SKYZ = { r: 0.42, g: 0.45, b: 0.48 };
  const MAPW = 3600, ZMIN = -80, ZRANGE = 1200;
  const MAPM = { x: MAPW, y: 1 / MAPW, z: ZMIN, w: ZRANGE };
  const MAP_RES = 1024;
  const RT = new THREE.WebGLRenderTarget(MAP_RES, MAP_RES, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false, generateMipmaps: false
  });
  // cloneUniforms nhân bản texture -> mỗi vật liệu một bản sao không gắn với khung vẽ: trả về chính nó
  RT.texture.clone = function () { return this; };

  // GLSL dùng chung (chèn trước lights_pars_begin): tra bản đồ hứng mưa, màu trời phản chiếu, giọt mưa rơi
  const PARS = `uniform vec4 skyWetU;
uniform vec3 skyWetH;
uniform vec3 skyWetZ;
uniform vec4 skyWetM;
uniform sampler2D skyWetMap;
// 4 vụ nổ / phát bắn gần nhất: x, z, thời điểm (theo skyWetU.y), độ mạnh
uniform vec4 skyBlast[ 4 ];
float skyFlowH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float skyFlowN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skyFlowH( i ), skyFlowH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( skyFlowH( i + vec2( 0.0, 1.0 ) ), skyFlowH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
// Sóng xung kích của vụ nổ / luồng khí đầu nòng lan trên mặt nước (vũng, nước ngập, sông): vòng gợn chạy ra ~14 m/s rồi
// tắt dần trong ~2 s. Trả về độ dốc mặt nước (x, z) + z: bọt nước sủi trắng theo vòng sóng đầu
vec3 skyBlastRip( vec2 p ) {
  vec3 g = vec3( 0.0 );
  for ( int i = 0; i < 4; i ++ ) {
    vec4 b = skyBlast[ i ];
    float age = skyWetU.y - b.z;
    if ( b.w <= 0.0 || age < 0.0 || age > 2.5 ) continue;
    vec2 d = p - b.xy;
    float r = length( d );
    float x = r - age * 110.0;
    float env = b.w * exp( - age * 1.4 ) * exp( - x * x / ( 60.0 + age * 260.0 ) ) * ( 1.0 - smoothstep( 120.0, 420.0 * b.w, r ) );
    g.xy += d / max( r, 1e-3 ) * sin( x * 0.55 ) * env * 0.5;
    g.z += env * ( 1.0 - smoothstep( 0.0, 7.0, abs( x ) ) ) * exp( - age * 1.6 ) * ( 0.6 + 0.4 * skyFlowN( p * 0.35 ) );
  }
  return g;
}
// độ cao mặt hứng mưa cao nhất tại (x, z) thế giới (-1e4 = chưa có bản đồ / ngoài bản đồ)
float skyWetTop( vec2 p ) {
  vec4 e = texture2D( skyWetMap, vec2( p.x * skyWetM.y + 0.5, 0.5 - p.y * skyWetM.y ) );
  return e.b > 0.5 ? skyWetM.z + ( e.r * 255.0 + e.g ) / 255.0 * skyWetM.w : -1e4;
}
// màu trời mây mưa phản chiếu theo thành phần đứng (thế giới) của tia phản xạ
vec3 skyWetSky( float ry ) {
  return ry < 0.0 ? skyWetH * ( 0.25 + 0.25 * ( 1.0 + ry ) ) : mix( skyWetH, skyWetZ, sqrt( clamp( ry, 0.0, 1.0 ) ) );
}
vec2 skyRH( vec2 p ) { vec3 q = fract( p.xyx * vec3( 0.1031, 0.1030, 0.0973 ) ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.xx + q.yz ) * q.zy ); }
// Giọt mưa đập xuống mặt phẳng ngang (p: toạ độ thế giới x, z): mỗi ô ~0,3-0,4 m một giọt mỗi chu kỳ ~1 s, vị trí đổi
// theo chu kỳ. xy = độ dốc vòng sóng loang (mặt nước / vũng), z = đốm giọt vừa chạm (lấm tấm). rate: tỉ lệ ô có giọt
vec3 skyRainDrops( vec2 p, float t, float rate ) {
  vec3 acc = vec3( 0.0 );
  for ( int L = 0; L < 2; L ++ ) {
    float cs = L == 0 ? 2.2 : 3.4;
    vec2 q = p / cs + float( L ) * 17.3;
    vec2 b = floor( q );
    for ( int j = - 1; j <= 1; j ++ ) for ( int i = - 1; i <= 1; i ++ ) {
      vec2 id = b + vec2( float( i ), float( j ) );
      vec2 h = skyRH( id + 5.1 );
      if ( h.x > rate ) continue;
      float tt = t * ( 0.9 + 0.5 * h.y ) + h.x * 7.0;
      float ph = fract( tt );
      vec2 o = skyRH( id + floor( tt ) * 7.31 );
      vec2 d = ( q - id - o ) * cs;
      float r = length( d );
      float x = r - ph * 1.7;
      float env = ( 1.0 - ph ) * ( 1.0 - ph );
      acc.xy += d / max( r, 1e-3 ) * sin( x * 10.0 ) * exp( - x * x * 7.0 ) * env * 0.4;
      acc.z = max( acc.z, ( 1.0 - smoothstep( 0.1, 0.26, r ) ) * ( 1.0 - smoothstep( 0.0, 0.32, ph ) ) );
    }
  }
  return acc;
}
`;
  // Đầu chunk chiếu sáng: vật liệu PBR / Phong ngoài trời ướt (SKY_DRY: vật liệu tự lo — mặt đất, mặt nước)
  const BEGIN = `float skyWetK = 0.0;
#if ( defined( STANDARD ) || defined( PHONG ) ) && ! defined( SKY_DRY )
if ( skyWetU.x > 0.0 ) {
  vec3 swV = - vViewPosition - viewMatrix[ 3 ].xyz;
  vec3 swW = vec3( dot( viewMatrix[ 0 ].xyz, swV ), dot( viewMatrix[ 1 ].xyz, swV ), dot( viewMatrix[ 2 ].xyz, swV ) );
  vec3 swN = vec3( dot( viewMatrix[ 0 ].xyz, normal ), dot( viewMatrix[ 1 ].xyz, normal ), dot( viewMatrix[ 2 ].xyz, normal ) );
  // có mái che cao hơn ~1,3 m phía trên (lòng hầm, trong nhà, gầm cầu): khô — ngưỡng lớn hơn độ sâu hố bom (bản đồ hứng
  // mưa không thấy lòng hố). Tra lệch ra ngoài theo pháp tuyến ~0,5 m -> tường ngoài vẫn ướt
  float swOpen = skyWetU.w > 0.0 ? 1.0 - smoothstep( 10.0, 16.0, skyWetTop( swW.xz + swN.xz * 4.0 ) - swW.y ) : 1.0;
  float swUp = clamp( swN.y, - 1.0, 1.0 );
  // mặt ngửa ướt đẫm, tường đứng ướt vệt, mặt úp gần như khô
  skyWetK = skyWetU.x * swOpen * ( 0.45 + 0.55 * clamp( swUp * 1.5, 0.0, 1.0 ) ) * ( 1.0 - 0.75 * clamp( - swUp, 0.0, 1.0 ) );
  float swDot = 0.0;
  if ( swUp > 0.6 && skyWetK > 0.0 ) {
    float swD = length( vViewPosition );
    if ( swD < 160.0 ) swDot = skyRainDrops( swW.xz, skyWetU.y, skyWetU.z ).z * ( 1.0 - swD / 160.0 ) * skyWetK;
  }
  // NƯỚC CHẢY: mặt dốc (dốc bê tông, mái, giáp nghiêng) có màng nước chảy xuôi dốc thành dòng gợn, dốc càng đứng chảy
  // càng nhanh; tường đứng có vệt nước chảy dọc thành dòng mảnh, gợn chạy xuống. Chỉ gần máy quay (xa thì mờ hết)
  float swFlow = 0.0;
  {
    float swD2 = length( vViewPosition );
    vec2 swHz = swN.xz;
    float swHl = length( swHz );
    if ( skyWetK > 0.05 && swD2 < 260.0 && swHl > 1e-3 ) {
      float swFd = 1.0 - swD2 / 260.0, swT = skyWetU.y;
      vec2 swDn = swHz / swHl, swPr = vec2( - swDn.y, swDn.x );
      float swAc = dot( swW.xz, swPr );
      if ( swUp > 0.35 ) {
        float swAl = dot( swW.xz, swDn );
        float swSp = 5.0 + 40.0 * ( 1.0 - swUp );
        float swN1 = skyFlowN( vec2( swAc * 0.9, swAl * 0.22 - swT * swSp * 0.22 ) );
        float swN2 = skyFlowN( vec2( swAc * 2.3 + 7.1, swAl * 0.6 - swT * swSp * 0.6 ) );
        swFlow = smoothstep( 0.9995, 0.985, swUp ) * swFd;
        vec3 swPw = vec3( swDn.x, 0.0, swDn.y ) * ( swN1 * 0.65 + swN2 * 0.35 - 0.5 ) * 0.4 + vec3( swPr.x, 0.0, swPr.y ) * ( swN2 - 0.5 ) * 0.2;
        normal = normalize( normal + mat3( viewMatrix ) * swPw * swFlow * skyWetK );
      } else if ( abs( swUp ) < 0.3 ) {
        float swLane = smoothstep( 0.6, 0.74, skyFlowN( vec2( swAc * 0.7, 3.3 ) ) );
        float swMv = skyFlowN( vec2( swAc * 2.0, swW.y * 0.35 + swT * 9.0 ) );
        swFlow = swLane * swFd * ( 0.5 + 0.5 * swMv );
        normal = normalize( normal + mat3( viewMatrix ) * vec3( 0.0, ( swMv - 0.5 ) * 0.6, 0.0 ) * swFlow * skyWetK );
      }
    }
  }
  #ifdef STANDARD
    // vật liệu xốp / nhám (đất, bê tông, gỗ, vải) thấm nước sẫm hẳn; sơn / kim loại nhẵn chỉ phủ màng nước bóng
    float swPor = clamp( ( material.specularRoughness - 0.3 ) / 0.6, 0.0, 1.0 );
    material.diffuseColor *= 1.0 - skyWetK * ( 0.1 + 0.32 * swPor ) - swDot * 0.15;
    material.specularRoughness = mix( material.specularRoughness, mix( 0.36, 0.14, clamp( swUp, 0.0, 1.0 ) ), skyWetK * 0.85 );
    material.specularRoughness = mix( material.specularRoughness, 0.08, swDot );
    material.diffuseColor *= 1.0 - 0.15 * swFlow * skyWetK;
    material.specularRoughness = mix( material.specularRoughness, 0.06, swFlow * skyWetK * 0.75 );
  #else
    material.diffuseColor *= 1.0 - skyWetK * 0.3;
    material.specularShininess = mix( material.specularShininess, max( material.specularShininess, 90.0 ), skyWetK );
    material.specularColor = max( material.specularColor, vec3( 0.06 * skyWetK ) );
  #endif
}
#endif
`;
  // Cuối chunk chiếu sáng: màng nước phản chiếu trời mây xám (không có envMap thì Three.js không có phản xạ ánh trời)
  const END = `
#if defined( STANDARD ) && ! defined( SKY_DRY )
if ( skyWetK > 0.0 ) {
  vec3 swR = reflect( - geometry.viewDir, geometry.normal );
  float swF = 0.02 + 0.98 * pow( 1.0 - clamp( dot( geometry.normal, geometry.viewDir ), 0.0, 1.0 ), 5.0 );
  float swG = 1.0 - clamp( ( material.specularRoughness - 0.05 ) * 1.8, 0.0, 1.0 );
  #ifdef USE_ENVMAP
  swG *= 0.35;
  #endif
  reflectedLight.indirectSpecular += skyWetSky( dot( viewMatrix[ 1 ].xyz, swR ) ) * swF * swG * skyWetK;
}
#endif
`;
  // MÀN MƯA & SƯƠNG MÙ LOANG LỔ (vá chunk sương FogExp2 dùng chung mọi vật liệu, kể cả shader tự viết có sương):
  // mật độ sương đổi theo từng mảng vài trăm mét trôi theo gió (chỗ mù đặc, chỗ loãng hơn), đọng dày hơn ở chỗ thấp
  // (thung lũng, lòng sông) so với chỗ đứng của camera. MIST: x = độ mạnh (0 = tắt), y / z = độ trôi, w = cao độ mặt đất
  // dưới camera
  const MIST = { x: 0, y: 0, z: 0, w: 0 };
  function installMist() {
    const C = THREE.ShaderChunk;
    if (C.fog_fragment.indexOf('skyMistU') >= 0) return;
    C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float fogDepth;', 'varying float fogDepth;\n\tvarying vec3 vFogW;');
    C.fog_vertex = C.fog_vertex.replace('fogDepth = - mvPosition.z;', `fogDepth = - mvPosition.z;
\tvec3 fogQ = mvPosition.xyz - viewMatrix[ 3 ].xyz;
\tvFogW = vec3( dot( viewMatrix[ 0 ].xyz, fogQ ), dot( viewMatrix[ 1 ].xyz, fogQ ), dot( viewMatrix[ 2 ].xyz, fogQ ) );`);
    C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float fogDepth;', `varying float fogDepth;
\tvarying vec3 vFogW;
\tuniform vec4 skyMistU;
\tfloat skyMistH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
\tfloat skyMistN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
\t\treturn mix( mix( skyMistH( i ), skyMistH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( skyMistH( i + vec2( 0.0, 1.0 ) ), skyMistH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`);
    C.fog_fragment = C.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );', `float fogD = fogDensity;
\t\tif ( skyMistU.x > 0.0 ) {
\t\t\tvec2 mp = vFogW.xz / 650.0 + skyMistU.yz;
\t\t\tfloat mn = skyMistN( mp ) * 0.6 + skyMistN( mp * 2.7 + 5.3 ) * 0.4;
\t\t\tfloat low = clamp( ( skyMistU.w - vFogW.y ) / 90.0, - 1.0, 1.0 );
\t\t\tfogD *= 1.0 + skyMistU.x * ( ( mn - 0.45 ) * 1.1 + low * 0.35 );
\t\t}
\t\tfloat fogFactor = 1.0 - exp( - fogD * fogD * fogDepth * fogDepth );`);
    const add = (U) => { if (U && U.fogDensity && !U.skyMistU) U.skyMistU = { value: MIST }; };
    add(THREE.UniformsLib.fog);
    for (const k in THREE.ShaderLib) add(THREE.ShaderLib[k].uniforms);
  }

  let glsl = false;
  function installChunks() {
    const C = THREE.ShaderChunk;
    if (C.lights_pars_begin.indexOf('skyWetU') >= 0) { glsl = true; return; }
    C.lights_pars_begin = PARS + C.lights_pars_begin;
    C.lights_fragment_begin = BEGIN + C.lights_fragment_begin;
    C.lights_fragment_end = C.lights_fragment_end + END;
    for (const k of ['standard', 'physical', 'phong', 'toon']) {
      if (!THREE.ShaderLib[k]) continue;
      Object.assign(THREE.ShaderLib[k].uniforms, {
        skyWetU: { value: WET }, skyWetH: { value: SKYH }, skyWetZ: { value: SKYZ }, skyWetM: { value: MAPM }, skyWetMap: { value: RT.texture },
        skyBlast: { value: BLAST }
      });
    }
    glsl = true;
  }
  // Vật liệu tự xử lý ướt (mặt đất, đường riêng, mặt nước): bỏ qua lớp ướt chung
  function markDry(mat) { mat.defines = Object.assign({}, mat.defines || {}, { SKY_DRY: '' }); return mat; }

  // ===========================================================================
  // BẢN ĐỒ HỨNG MƯA
  // ===========================================================================
  const shelterMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uM: { value: new THREE.Vector2(ZMIN, ZRANGE) } },
    vertexShader: `varying float vY;
void main() {
  vec4 p = vec4( position, 1.0 );
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p;
  vY = w.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `uniform vec2 uM;
varying float vY;
void main() {
  float h = clamp( ( vY - uM.x ) / uM.y, 0.0, 1.0 ) * 255.0;
  gl_FragColor = vec4( floor( h ) / 255.0, fract( h ), 1.0, 1.0 );
}`
  });
  const shelterCam = new THREE.OrthographicCamera(-MAPW / 2, MAPW / 2, MAPW / 2, -MAPW / 2, 10, 3600);
  shelterCam.position.set(0, 1800, 0);
  shelterCam.up.set(0, 0, -1);
  shelterCam.lookAt(0, 0, 0);
  shelterCam.updateMatrixWorld(true);
  const shelterScene = new THREE.Scene();
  shelterScene.autoUpdate = false;
  shelterScene.overrideMaterial = shelterMat;
  // không hứng mưa: cây (mưa lọt qua tán), cỏ, bụi, vòm trời, cảnh nền ngoài bản đồ
  const SKIP = new Set(['sky', 'backdrop', 'trees', 'groundCover', 'bushes']);
  function buildShelter(renderer, T) {
    if (!renderer || !T || !T.group) return;
    const W = T.width || MAPW;
    if (Math.abs(W - MAPM.x) > 1) {
      MAPM.x = W; MAPM.y = 1 / W;
      shelterCam.left = shelterCam.bottom = -W / 2; shelterCam.right = shelterCam.top = W / 2;
      shelterCam.updateProjectionMatrix();
    }
    const hidden = [];
    for (const c of T.group.children) if (c.visible && SKIP.has(c.name)) { c.visible = false; hidden.push(c); }
    if (T.sky && T.sky.mesh && T.sky.mesh.visible) { T.sky.mesh.visible = false; hidden.push(T.sky.mesh); }
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate;
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.shadowMap.autoUpdate = false;
    // Three.js chỉ áp overrideMaterial cho Scene: mượn tạm nhóm địa hình sang cảnh riêng (ma trận đã tính sẵn, giữ nguyên)
    const parent = T.group.parent, at = parent ? parent.children.indexOf(T.group) : -1;
    shelterScene.add(T.group);
    try {
      renderer.setRenderTarget(RT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(shelterScene, shelterCam);
    } finally {
      if (parent) {
        parent.add(T.group);
        parent.children.splice(parent.children.indexOf(T.group), 1);
        parent.children.splice(at, 0, T.group);
      } else shelterScene.remove(T.group);
      renderer.setRenderTarget(prevRT);
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.shadowMap.autoUpdate = prevAuto;
      for (const o of hidden) o.visible = true;
    }
    WET.w = 1;
  }

  // GLSL tra bản đồ hứng mưa cho hạt mưa / giọt bắn (đỉnh shader)
  const TOP_GLSL = `uniform sampler2D uTop;
uniform vec4 uTopM;
float topAt( vec2 p ) {
  vec4 e = texture2D( uTop, vec2( p.x * uTopM.y + 0.5, 0.5 - p.y * uTopM.y ) );
  return e.b > 0.5 ? uTopM.z + ( e.r * 255.0 + e.g ) / 255.0 * uTopM.w : -1e4;
}`;

  // ===========================================================================
  // HẠT MƯA: vệt mưa (quad kéo dài theo hướng rơi, quay về camera), hộp lặp quanh camera, cố định theo thế giới
  // ===========================================================================
  function makeRainLayer(count, box) {
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const a = new Float32Array(count * 4);
    for (let i = 0; i < a.length; i++) a[i] = Math.random();
    geo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(a, 4));
    geo.instanceCount = count;
    const U = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(box[0], box[1], box[0]) }, uWind: { value: new THREE.Vector3(12, 0, 5) },
      uSpeed: { value: 76 }, uLen: { value: box[2] }, uK: { value: 0 }, uCol: { value: new THREE.Color(0.45, 0.49, 0.53) },
      uDrift: { value: new THREE.Vector2() }, uFade: { value: new THREE.Vector2(3, 14) },
      uTop: { value: RT.texture }, uTopM: { value: MAPM }, uTopOn: { value: 0 }, uBlast: { value: BLAST }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      vertexShader: TOP_GLSL + `
attribute vec4 aDrop;
uniform float uTime, uSpeed, uLen, uK, uTopOn;
uniform vec3 uCam, uCenter, uBox, uWind;
uniform vec2 uDrift, uFade;
uniform vec4 uBlast[ 4 ];
varying float vA, vLit;
varying vec2 vQ;
void main() {
  float sp = uSpeed * ( 0.82 + 0.36 * aDrop.w );
  vec3 vel = vec3( uWind.x * ( 0.9 + 0.2 * aDrop.w ), - sp, uWind.z * ( 0.9 + 0.2 * aDrop.w ) );
  vec3 lo = uCenter - uBox * 0.5;
  // dạt ngang = tích phân gió theo thời gian (uDrift, tính trên CPU): gió giật đổi hướng / độ nghiêng vệt mưa mượt,
  // không làm cả màn mưa nhảy chỗ như khi nhân thẳng vận tốc gió hiện tại với thời gian
  vec3 off = vec3( uDrift.x * ( 0.9 + 0.2 * aDrop.w ), - sp * uTime, uDrift.y * ( 0.9 + 0.2 * aDrop.w ) );
  vec3 p = lo + mod( aDrop.xyz * uBox + off - lo, uBox );
  // vụ nổ / phát bắn gần: sóng xung kích thổi dạt màn mưa ra ngoài, giọt mưa quanh đó loé sáng màu lửa
  vLit = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    vec4 b = uBlast[ i ];
    float age = uTime - b.z;
    if ( b.w <= 0.0 || age < 0.0 || age > 1.5 ) continue;
    vec2 d = p.xz - b.xy;
    float r = length( d );
    float R = 40.0 + 300.0 * age;
    p.xz += d / max( r, 1.0 ) * b.w * exp( - age * 2.5 ) * ( 1.0 - smoothstep( R * 0.5, R, r ) ) * 22.0;
    vLit += b.w * exp( - age * 9.0 ) * ( 1.0 - smoothstep( 30.0, 200.0 * b.w, r ) );
  }
  // giọt đã chạm mặt hứng mưa (đất, mái, nắp hầm) -> không vẽ (không rơi xuyên vào lòng hầm / trong nhà)
  float alive = uTopOn > 0.5 ? step( topAt( p.xz ), p.y ) : 1.0;
  vec3 ax = normalize( vel );
  vec3 toC = uCam - p;
  float dist = length( toC );
  vec3 side = normalize( cross( ax, toC / max( dist, 1e-3 ) ) + vec3( 1e-4, 0.0, 0.0 ) );
  // vệt mảnh ~4 mm nhưng không mỏng hơn ~1 điểm ảnh; vệt bị nong rộng thì nhạt đi tương ứng
  float w = max( 0.035, dist * 0.0016 );
  float L = uLen * ( 0.7 + 0.6 * aDrop.w );
  vec3 wp = p - ax * ( position.y * L ) + side * ( position.x * w );
  vQ = vec2( position.x * 2.0, position.y );
  float r = length( p.xz - uCenter.xz );
  vA = alive * uK * smoothstep( uFade.x, uFade.y, dist ) * ( 1.0 - smoothstep( uBox.x * 0.36, uBox.x * 0.5, r ) ) * clamp( 0.06 / w, 0.4, 1.0 );
  gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}`,
      fragmentShader: `uniform vec3 uCol;
varying float vA, vLit;
varying vec2 vQ;
void main() {
  float l = clamp( vLit, 0.0, 1.0 );
  float a = vA * ( 1.0 + 1.5 * l ) * ( 1.0 - abs( vQ.x ) ) * smoothstep( 0.0, 0.25, vQ.y ) * ( 1.0 - 0.5 * vQ.y );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( mix( uCol, vec3( 1.0, 0.72, 0.42 ) * 1.4, l ), min( a, 1.0 ) );
}`
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.name = 'rain';
    return { mesh, U, geo };
  }

  // Giọt mưa bắn trên mặt hứng (vương miện nước nhỏ bật lên rồi tắt), quanh camera
  function makeSplashLayer(count) {
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const a = new Float32Array(count * 4);
    for (let i = 0; i < a.length; i++) a[i] = Math.random();
    geo.setAttribute('aSp', new THREE.InstancedBufferAttribute(a, 4));
    geo.instanceCount = count;
    const U = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uR: { value: 150 },
      uK: { value: 0 }, uCol: { value: new THREE.Color(0.48, 0.51, 0.54) }, uTop: { value: RT.texture }, uTopM: { value: MAPM }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      vertexShader: TOP_GLSL + `
attribute vec4 aSp;
uniform float uTime, uR, uK;
uniform vec3 uCam, uCenter;
varying float vA, vPh;
varying vec2 vQ;
float hs( float n ) { return fract( sin( n ) * 43758.5453 ); }
void main() {
  float rate = 3.2 + 1.6 * aSp.w;                 // mỗi ô ~3-5 giọt bắn / giây
  float tt = uTime * rate + aSp.z * 13.0;
  float cyc = floor( tt ), ph = fract( tt );
  vec2 o = vec2( hs( cyc * 1.37 + aSp.x * 91.7 ), hs( cyc * 2.11 + aSp.y * 57.3 ) );
  vec2 lo = uCenter.xz - uR;
  vec2 xz = lo + mod( ( aSp.xy + o ) * uR * 2.0 - lo, vec2( uR * 2.0 ) );
  float y = topAt( xz );
  vec3 p = vec3( xz.x, y + 0.05, xz.y );
  vec3 toC = uCam - p;
  float dist = length( toC );
  vec3 side = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toC ) + vec3( 1e-4, 0.0, 0.0 ) );
  float s = 0.9 + 0.7 * aSp.w;
  vec3 wp = p + side * position.x * s * 1.6 + vec3( 0.0, position.y * s, 0.0 );
  vQ = vec2( position.x * 2.0, position.y );
  vPh = ph;
  vA = uK * step( - 9e3, y ) * ( 1.0 - smoothstep( uR * 0.55, uR, dist ) ) * smoothstep( 2.0, 8.0, dist );
  gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}`,
      fragmentShader: `uniform vec3 uCol;
varying float vA, vPh;
varying vec2 vQ;
void main() {
  if ( vPh > 0.3 || vA < 0.01 ) discard;
  float f = vPh / 0.3;
  // giọt bắn: 2 tia nước mảnh xoè chữ V bật lên từ chỗ giọt chạm + vài hạt li ti văng theo đường parabol rồi rơi
  vec2 q = vec2( vQ.x, vQ.y );
  float a = 0.0;
  for ( int k = 0; k < 2; k ++ ) {
    float sgn = k == 0 ? - 1.0 : 1.0;
    vec2 d = vec2( sgn * 0.45, 0.9 );
    float L = 0.1 + 0.35 * f;
    float t = clamp( dot( q, d ) / dot( d, d ), 0.0, L );
    a = max( a, ( 1.0 - smoothstep( 0.015, 0.05, length( q - d * t ) ) ) * ( 1.0 - 0.7 * t / max( L, 1e-3 ) ) * 0.6 );
  }
  for ( int k = 0; k < 3; k ++ ) {
    float fk = float( k );
    vec2 c = vec2( ( fk - 1.0 ) * 0.7 * f, ( 1.6 - 0.25 * fk ) * f - 2.2 * f * f );
    a = max( a, 1.0 - smoothstep( 0.02, 0.07, length( q - c ) ) );
  }
  a *= vA * ( 1.0 - f ) * 0.6;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( uCol, a );
}`
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.name = 'rainSplash';
    return { mesh, U, geo };
  }

  // ===========================================================================
  // NƯỚC ĐỌNG: lòng hầm ngập, hố bom đọng nước (nước đục phù sa, gợn giọt mưa nơi không có mái, phản chiếu trời xám)
  // edge: có thuộc tính aS (độ cao mặt đáy) -> mép nước mờ dần theo độ sâu, mực nước dâng dần theo uFill
  // tun: thông số khoang hầm (Strongholds.S) -> phản chiếu đúng lòng hầm: tia phản xạ từ mặt nước được dò theo hình khối
  //   khoang (trần, dầm, đèn trần, tường bên, miệng hầm, mặt tiền) — mặt nước như tấm gương đục soi lại trần tối, hàng đèn
  //   ấm và khung miệng hầm sáng loá phía cuối, vỡ ra theo gợn sóng
  // ===========================================================================
  // (đặt ngay trước main(): cần skyWetSky / skyWetH của chunk chiếu sáng dùng chung)
  const FLOOD_TUN_GLSL = `#ifdef FLOOD_TUN
// tia phản xạ (toạ độ cục bộ khoang: x = dọc trục, z = ngang, y = cao độ so với cốt nền) từ điểm P trên mặt nước
vec3 flTun( vec3 P, vec3 R ) {
  vec3 sky = skyWetSky( R.y );
  vec3 conc = skyWetH * vec3( 0.5, 0.49, 0.46 );
  float sx = R.x >= 0.0 ? 1.0 : - 1.0, sz = R.z >= 0.0 ? 1.0 : - 1.0;
  float tC = R.y > 1e-4 ? ( T_CEIL - P.y ) / R.y : 1e6;
  float tW = abs( R.z ) > 1e-4 ? ( sz * T_WI - P.z ) / R.z : 1e6;
  float tP = abs( R.x ) > 1e-4 ? ( sx * T_HB - P.x ) / R.x : 1e6;
  if ( abs( P.x ) < T_HB ) {
    // tia lọt ra miệng hầm: trời mây sáng loá (tia thấp: sân bê tông / dốc bên ngoài)
    // (tia thấp: sân bê tông gần rồi cảnh ngoài chìm trong màn mưa / sương — màu sương; tia cao: trời mây)
    if ( tP < min( tC, tW ) ) return mix( mix( conc * 0.55, skyWetH * 0.8, smoothstep( 0.0, 0.05, R.y ) ), sky, smoothstep( 0.08, 0.3, R.y ) );
    if ( tW < tC ) {
      vec3 H = P + R * tW;
      float lit = mix( 0.1, 0.5, smoothstep( T_HB * 0.15, T_HB, abs( H.x ) ) );
      lit *= mix( 0.6, 1.0, smoothstep( P.y + 0.5, P.y + 6.0, H.y ) );   // chân tường ẩm sẫm sát mặt nước
      return conc * lit;
    }
    vec3 H = P + R * tC;
    float af = abs( H.x );
    vec3 c = conc * mix( 0.08, 0.42, smoothstep( T_HB * 0.15, T_HB, af ) );
    // dầm trần ngang mỗi 4 m: dải sẫm khuất sáng
    float bm = abs( mod( H.x + 16.0, 32.0 ) - 16.0 );
    if ( af < 70.0 ) c *= mix( 0.5, 1.0, smoothstep( 2.0, 3.6, bm ) );
    // đèn trần (6 hàng x 4 dãy): vệt đèn ấm sắc nét + quầng sáng loang trên trần
    if ( af < 84.0 ) {
      float dfx = abs( mod( H.x, 32.0 ) - 16.0 );
      float drr = min( abs( abs( H.z ) - T_LR1 ), abs( abs( H.z ) - T_LR2 ) );
      float lamp = ( 1.0 - smoothstep( 2.6, 3.3, dfx ) ) * ( 1.0 - smoothstep( 0.5, 0.9, drr ) );
      c += vec3( 1.0, 0.92, 0.76 ) * ( lamp * 1.8 + exp( - ( dfx * dfx + drr * drr ) / 60.0 ) * 0.2 );
    }
    return c;
  }
  // đoạn ngập trên dốc (lộ thiên): trời; tia quay về phía hầm thấy lòng hầm tối / mặt tiền & ụ đất
  if ( sx * sign( P.x ) < 0.0 && tP < 1e5 ) {
    vec3 M = P + R * tP;
    if ( abs( M.z ) < T_WI && M.y < T_CEIL ) return conc * 0.1;
    if ( M.y < T_TOP + 30.0 ) return conc * 0.5;
  }
  return sky;
}
#endif
`;
  const floodMats = {};
  function floodMaterial(edge, tun) {
    const key = (edge ? 'edge' : 'flat') + (tun ? ':tun' : '');
    if (floodMats[key] && !edge) return floodMats[key];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a3426, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    markDry(mat);
    if (tun) {
      const f = v => (+v).toFixed(2);
      mat.defines.FLOOD_TUN = '';
      Object.assign(mat.defines, { T_HB: f(tun.HB), T_WI: f(tun.WI), T_CEIL: f(tun.CEIL), T_TOP: f(tun.TOP), T_LR1: f(tun.SLOT_R * 0.5), T_LR2: f(tun.SLOT_R * 1.5) });
    }
    mat.userData.fill = { value: 1 };
    mat.userData.lvl = { value: new THREE.Vector2(0, 0) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFill = mat.userData.fill;
      sh.uniforms.uLvl = mat.userData.lvl;
      sh.vertexShader = 'varying vec3 vFW;\nvarying vec3 vFL;\nvarying vec3 vFAx;\nvarying vec3 vFAz;\nvarying float vFD;\nuniform float uFill;\nuniform vec2 uLvl;\n' + (edge ? 'attribute float aS;\n' : '') +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
${edge ? `  // mực nước dâng dần từ đáy (uLvl.x) tới mức đầy (uLvl.y)
  transformed.y = mix( uLvl.x, uLvl.y, uFill );` : ''}`).replace('#include <project_vertex>', `#include <project_vertex>
  vFW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vFL = transformed;
  vFAx = normalize( mat3( modelMatrix ) * vec3( 1.0, 0.0, 0.0 ) );
  vFAz = normalize( mat3( modelMatrix ) * vec3( 0.0, 0.0, 1.0 ) );
  vFD = ${edge ? 'vFW.y - aS' : '9.0'};`);
      sh.fragmentShader = `varying vec3 vFW;
varying vec3 vFL;
varying vec3 vFAx;
varying vec3 vFAz;
varying float vFD;
float flH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float flN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( flH( i ), flH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( flH( i + vec2( 0.0, 1.0 ) ), flH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
` + sh.fragmentShader.replace('void main() {', FLOOD_TUN_GLSL + 'void main() {').replace('#include <color_fragment>', `#include <color_fragment>
  // nước nông sát mép trong hơn (thấy đáy bùn), sâu thì đục sẫm
  diffuseColor.a *= smoothstep( 0.0, 1.6, vFD ) * mix( 0.6, 1.0, smoothstep( 1.6, 4.0, vFD ) );
  float flOpen = skyWetU.w > 0.0 ? 1.0 - smoothstep( 10.0, 16.0, skyWetTop( vFW.xz ) - vFW.y ) : 1.0;
  vec2 fp = vFW.xz;
  // váng bọt bẩn, rác lá dạt vào mép nước & sát chân tường hầm, trôi rất chậm
  float scN = flN( fp / 7.0 + vec2( skyWetU.y * 0.015, skyWetU.y * 0.006 ) ) * 0.6 + flN( fp / 2.3 + 3.7 ) * 0.4;
  float edgeK = 1.0 - smoothstep( 0.0, 3.0, vFD );
#ifdef FLOOD_TUN
  edgeK = max( edgeK, 1.0 - smoothstep( 2.0, 14.0, T_WI - abs( vFL.z ) ) );
  // lòng hầm: càng xa miệng hầm càng tối (chỉ ánh sáng lọt từ 2 đầu + đèn trần)
  float flLit = mix( 0.22, 1.0, smoothstep( T_HB * 0.15, T_HB * 1.05, abs( vFL.x ) ) );
#else
  float flLit = mix( 0.35, 1.0, flOpen );
#endif
  float scum = smoothstep( 0.56, 0.78, scN ) * edgeK;
  // sóng xung kích vụ nổ / đầu nòng: vòng bọt sủi trắng chạy ra
  vec3 flBl = skyBlastRip( fp );
  scum = max( scum, clamp( flBl.z, 0.0, 1.0 ) * 0.8 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.4, 0.38, 0.32 ), scum * 0.75 );
  diffuseColor.a = max( diffuseColor.a, scum * 0.85 * smoothstep( 0.0, 0.4, vFD ) );`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // mặt nước lặng gợn nhẹ trôi chậm; ngoài trời: vòng sóng giọt mưa dày đặc; dưới mái: giọt nhỏ từ mạch trần thưa thớt
    float fDist = length( vViewPosition );
    vec2 fg = ( vec2( flN( fp / 3.1 + skyWetU.y * 0.07 ), flN( fp / 3.1 + 7.3 - skyWetU.y * 0.05 ) ) - 0.5 ) * 0.05;
    if ( fDist < 420.0 ) {
      float nk = 1.0 - fDist / 420.0;
      if ( flOpen > 0.01 ) fg += skyRainDrops( fp, skyWetU.y, skyWetU.z ).xy * flOpen * nk;
      if ( flOpen < 0.99 ) fg += skyRainDrops( fp * 0.6 + 11.0, skyWetU.y * 0.55 + 3.0, 0.05 ).xy * ( 1.0 - flOpen ) * nk * 1.3;
    }
    fg += flBl.xy;
    fg *= 1.0 - scum * 0.8;
    normal = normalize( ( viewMatrix * vec4( normalize( vec3( - fg.x, 1.0, - fg.y ) ), 0.0 ) ).xyz );
  }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    vec3 flR = reflect( - geometry.viewDir, geometry.normal );
    vec3 flRw = vec3( dot( viewMatrix[ 0 ].xyz, flR ), dot( viewMatrix[ 1 ].xyz, flR ), dot( viewMatrix[ 2 ].xyz, flR ) );
    float flF = 0.02 + 0.98 * pow( 1.0 - clamp( dot( geometry.normal, geometry.viewDir ), 0.0, 1.0 ), 5.0 );
    reflectedLight.indirectDiffuse *= flLit;
    reflectedLight.directDiffuse *= mix( 0.4, 1.0, flLit );
#ifdef FLOOD_TUN
    vec3 flRl = vec3( dot( flRw, vFAx ), flRw.y, dot( flRw, vFAz ) );
    vec3 flC = flTun( vFL, normalize( flRl ) );
#else
    vec3 flC = skyWetSky( flRw.y ) * mix( 0.22, 0.9, flOpen );
#endif
    reflectedLight.indirectSpecular += flC * flF * ( 1.0 - scum * 0.85 );
  }`);
    };
    mat.customProgramCacheKey = () => 'floodW2:' + key;
    if (!edge) floodMats[key] = mat;
    return mat;
  }

  // Hố bom mới khi trời mưa: nước đọng dâng dần ở đáy hố (tối đa ~1/2 độ sâu lòng hố dưới mặt đất cũ -> không tràn gờ)
  // g: { Hgrid, M, S, ox, oz, fromG, base } — lưới cao độ hố của ExplosionFX.buildCraterCluster
  // o: { frac, fillT } — mực nước tối đa (phần độ sâu hố) & thời gian đọng đầy riêng (hào xe ủi: vũng bùn nông, đọng chậm)
  function addCraterPool(rec, g, o) {
    const W = curW();
    if (!W || !W.rain || !rec || !rec.group || !g) return;
    const { Hgrid, M, S, ox, oz, fromG, base } = g, N1 = M + 1;
    let bot = Infinity, dmax = 0, bi = 0;
    const surf = new Float32Array(N1 * N1);
    for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
      const k = j * N1 + i, w = fromG(ox + i / M * S, oz + j / M * S), b0 = base(w[0], w[1]);
      const y = b0 + Hgrid[k];
      surf[k] = y;
      if (y < bot) { bot = y; bi = k; }
      if (-Hgrid[k] > dmax) dmax = -Hgrid[k];
    }
    if (!(dmax > 1.2)) return;   // hố quá nông: chỉ còn mặt đất ướt
    const top = bot + dmax * (o && o.frac ? o.frac : 0.3 + 0.2 * W.intensity);
    // chỉ dựng phần lưới quanh chỗ trũng (ô có đáy thấp hơn mực nước đầy)
    let i0 = M, i1 = 0, j0 = M, j1 = 0;
    for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) if (surf[j * N1 + i] < top) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(M, i1 + 1); j1 = Math.min(M, j1 + 1);
    const nx = i1 - i0, nz = j1 - j0;
    if (nx < 1 || nz < 1) return;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), aS = new Float32Array((nx + 1) * (nz + 1)), idx = [];
    const gp = rec.group.position;
    let v = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++, v++) {
      const w = fromG(ox + i / M * S, oz + j / M * S);
      pos[v * 3] = w[0] - gp.x; pos[v * 3 + 1] = top; pos[v * 3 + 2] = w[1] - gp.z;
      aS[v] = surf[j * N1 + i];
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = floodMaterial(true);
    mat.userData.lvl.value.set(bot + 0.2, top);
    mat.userData.fill.value = 0.05;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    mesh.name = 'craterPool';
    rec.group.add(mesh);
    rec.geos.push(geo);
    rec.mats.push(mat);
    // trọng tâm chỗ trũng & mực nước (tra cho xe lội: craterWaterAt)
    rec.pool = { mat, bot, top, surf: g, i0, i1, j0, j1, fillT: o && o.fillT ? o.fillT : 40 };
    pools.push(rec);
  }
  const pools = [];
  function tickPools(dt) {
    for (let i = pools.length - 1; i >= 0; i--) {
      const P = pools[i].pool;
      if (!pools[i].group.parent) { pools.splice(i, 1); continue; }
      // ~40 s đọng đầy (mưa nặng hạt + nước mặt chảy dồn vào hố)
      if (P.mat.userData.fill.value < 1) P.mat.userData.fill.value = Math.min(1, P.mat.userData.fill.value + dt / P.fillT);
    }
  }
  // Mực nước đọng trong hố bom tại (x, z) (null = không có / đáy cao hơn mực nước)
  function craterWaterAt(fx, x, z) {
    if (!pools.length || !fx || !fx.craterSurfaceAt) return null;
    for (const rec of pools) {
      const P = rec.pool, s = rec.surf;
      if (!s || x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const lvl = P.bot + 0.2 + (P.top - P.bot - 0.2) * P.mat.userData.fill.value;
      const g = fx.craterSurfaceAt(x, z);
      if (g !== null && g < lvl - 0.2) return lvl;
    }
    return null;
  }

  // ===========================================================================
  // SẤM CHỚP
  // ===========================================================================
  const bolt = { mesh: null, glow: null, mat: null, gmat: null };
  let flash = 0, flashDir = new THREE.Vector3(0, 1, 0), pulses = [], nextStrike = 6 + Math.random() * 10, strikeT = 0;
  function boltMesh(scene, cam, sx, sy, sz, gy) {
    if (!bolt.mat) {
      bolt.mat = new THREE.MeshBasicMaterial({ color: 0xe8eeff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      bolt.gmat = new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    }
    // đường sét gấp khúc từ chân mây xuống đất + 1-2 nhánh rẽ ngắn
    const paths = [];
    const main = [[sx, sy, sz]];
    let x = sx, z = sz;
    const n = 16;
    for (let i = 1; i <= n; i++) {
      x += (Math.random() - 0.5) * 70; z += (Math.random() - 0.5) * 70;
      main.push([x, sy + (gy - sy) * i / n, z]);
    }
    paths.push({ p: main, w: 1 });
    for (let b = 0; b < 1 + (Math.random() < 0.6 ? 1 : 0); b++) {
      const s = 3 + Math.floor(Math.random() * 7), br = [main[s].slice()];
      let [bx, by, bz] = main[s];
      for (let i = 0; i < 5; i++) { bx += (Math.random() - 0.5) * 90; bz += (Math.random() - 0.5) * 90; by -= (sy - gy) / n * (0.8 + Math.random()); br.push([bx, by, bz]); }
      paths.push({ p: br, w: 0.5 });
    }
    const build = (wk) => {
      const P = [], I = [];
      for (const path of paths) {
        const p = path.p, w = wk * path.w;
        const o = P.length / 3;
        for (let i = 0; i < p.length; i++) {
          const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
          const tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
          const cx = cam.x - p[i][0], cy = cam.y - p[i][1], cz = cam.z - p[i][2];
          let sxv = ty * cz - tz * cy, syv = tz * cx - tx * cz, szv = tx * cy - ty * cx;
          const l = Math.hypot(sxv, syv, szv) || 1, ww = w * (1 - 0.5 * i / p.length);
          sxv *= ww / l; syv *= ww / l; szv *= ww / l;
          P.push(p[i][0] - sxv, p[i][1] - syv, p[i][2] - szv, p[i][0] + sxv, p[i][1] + syv, p[i][2] + szv);
          if (i) { const q = o + i * 2; I.push(q - 2, q - 1, q, q - 1, q + 1, q); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setIndex(I);
      return g;
    };
    for (const k of ['mesh', 'glow']) if (bolt[k]) { scene.remove(bolt[k]); bolt[k].geometry.dispose(); bolt[k] = null; }
    const d = Math.hypot(cam.x - sx, cam.z - sz);
    bolt.mesh = new THREE.Mesh(build(Math.max(2.5, d * 0.0022)), bolt.mat);
    bolt.glow = new THREE.Mesh(build(Math.max(14, d * 0.012)), bolt.gmat);
    for (const m of [bolt.mesh, bolt.glow]) { m.frustumCulled = false; m.renderOrder = 9; scene.add(m); }
  }
  function strike(G, W) {
    const cam = G.camera.position, T = G.terrain;
    // phần lớn sét đánh xa (sấm rền), thỉnh thoảng sát bên (chớp loá + tiếng nổ xé trời)
    const near = Math.random() < 0.12;
    const d = near ? 260 + Math.random() * 500 : 900 + Math.random() * 3200;
    const a = Math.random() * Math.PI * 2;
    const sx = cam.x + Math.cos(a) * d, sz = cam.z + Math.sin(a) * d;
    const gy = T && T.groundAtRaw ? T.groundAtRaw(Math.max(-1700, Math.min(1700, sx)), Math.max(-1700, Math.min(1700, sz))) : 0;
    flashDir.set(sx - cam.x, 900 - cam.y, sz - cam.z).normalize();
    // 2-4 nhịp loé (dòng điện chạy lại theo kênh sét)
    pulses = [];
    let t = 0;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { pulses.push({ t, amp: (i === 0 ? 1 : 0.5 + Math.random() * 0.5) * (near ? 1 : 0.35 + 0.5 * (1 - d / 4100)) }); t += 0.05 + Math.random() * 0.12; }
    strikeT = 0;
    if (d < 3800) boltMesh(G.scene, cam, sx, 850 + Math.random() * 150, sz, gy); else hideBolt(G.scene);
    const se = window.soundEngine;
    if (se && se.thunder) se.thunder(d, { x: sx, z: sz });
  }
  function hideBolt(scene) { for (const k of ['mesh', 'glow']) if (bolt[k]) { scene.remove(bolt[k]); bolt[k].geometry.dispose(); bolt[k] = null; } }
  function tickLightning(dt, G, W) {
    nextStrike -= dt;
    if (nextStrike <= 0) { strike(G, W); nextStrike = (7 + Math.random() * 22) / ((0.6 + 0.4 * W.intensity) * (0.75 + 0.45 * (W.storm || 0))); }
    strikeT += dt;
    let f = 0;
    for (const p of pulses) { const u = strikeT - p.t; if (u >= 0) f = Math.max(f, p.amp * Math.exp(-u * 22) * (u < 0.02 ? u / 0.02 : 1)); }
    flash = f;
    const vis = f > 0.04;
    if (bolt.mesh) {
      bolt.mesh.visible = bolt.glow.visible = vis;
      bolt.mat.opacity = Math.min(1, f * 1.6); bolt.gmat.opacity = Math.min(0.5, f * 0.5);
      if (strikeT > 1.2) hideBolt(G.scene);
    }
  }

  // ===========================================================================
  // CẬP NHẬT / VẼ
  // ===========================================================================
  // shelterDirtyAt: lúc cảnh vật bị phá gần nhất (terrain.damageAt) — mái che có thể đã đổi
  let near = null, far = null, col = null, splash = null, tier = null, scene = null, time = 0, shelterFor = null, shelterT = 0, shelterDirtyAt = -1e9;
  let driftX = 0, driftZ = 0;
  const curW = () => { const g = window.game, T = g && g.terrain; return T && T.weather; };
  const COUNTS = { low: [3500, 2500, 400], medium: [6000, 5000, 700], high: [9000, 9000, 1100], ultra: [12000, 12000, 1500] };
  function ensureLayers(G) {
    const t = G.gfxTier || 'high';
    if (scene === G.scene && tier === t && near) return;
    for (const L of [near, far, col, splash]) if (L) { L.mesh.parent && L.mesh.parent.remove(L.mesh); L.geo.dispose(); L.mesh.material.dispose(); }
    const C = COUNTS[t] || COUNTS.high;
    // lớp gần: vệt ngắn dày đặc quanh xe; lớp xa: vệt dài hơn phủ tới ~35 m
    near = makeRainLayer(C[0], [150, 130, 5.5]);
    far = makeRainLayer(C[1], [560, 300, 9]);
    // cột mưa cho camera trên cao (drone, UAV cảm tử): phủ từ mặt đất lên quá camera, vệt dài, chỉ hiện khi camera cao
    col = makeRainLayer(C[1], [900, 900, 16]);
    col.U.uFade.value.set(60, 160);
    splash = makeSplashLayer(C[2]);
    for (const L of [near, far, col, splash]) G.scene.add(L.mesh);
    scene = G.scene; tier = t;
  }
  function setVisible(v) { for (const L of [near, far, col, splash]) if (L) L.mesh.visible = v; }

  // ===========================================================================
  // GIÓ & GIÓ GIẬT dùng chung: cây, cỏ lay theo (WINDV), vệt mưa xiên theo cơn giật, drone / UAV bị đẩy dạt (gust()).
  // Trời quang: gió nhẹ, thỉnh thoảng một cơn yếu. Mưa giông: gió nền mạnh hơn, cơn giật dồn dập & mạnh (theo độ đen mây).
  // Chỉ là hiệu ứng / nhiễu điều khiển cục bộ (drone đồng bộ vị trí qua mạng như thường) -> không cần giống nhau mọi máy.
  // WINDV: x, y = hướng gió (thế giới x, z), z = độ mạnh lay (1 = gió thường trời quang), w = cơn giật hiện tại (0..1)
  // ===========================================================================
  const WINDV = { value: new THREE.Vector4(0.8, 0.6, 1, 0) };
  const GUST = { wait: 4, dur: 0, len: 1, peak: 0, turn: 0, g: 0, x: 0, z: 0, rain: false, st: 0 };
  function tickWind(dt, G) {
    const T = G && G.terrain, W = T && T.weather, w = G && G.ballistics && G.ballistics.wind;
    const rain = !!(W && W.rain), st = rain ? (W.storm || 0.7) : 0;
    let dx = w ? w.vx : 0.8, dz = w ? w.vz : 0.6;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (GUST.dur <= 0 && (GUST.wait -= dt) <= 0) {
      GUST.len = GUST.dur = rain ? 1.5 + Math.random() * 3.5 : 1.5 + Math.random() * 2;
      GUST.peak = rain ? (0.5 + 0.5 * Math.random()) * (0.7 + 0.3 * st) : 0.15 + 0.25 * Math.random();
      GUST.turn = (Math.random() - 0.5) * 0.7;
      GUST.wait = rain ? 1.5 + Math.random() * 5 : 6 + Math.random() * 14;
    }
    let tgt = 0;
    if (GUST.dur > 0) {
      GUST.dur -= dt;
      const u = 1 - Math.max(0, GUST.dur) / GUST.len;
      // ập tới nhanh, tắt chậm; lao xao trong cơn
      tgt = GUST.peak * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 1.4) * (0.85 + 0.15 * Math.sin(time * 9.0 + u * 20));
    }
    GUST.g += (tgt - GUST.g) * Math.min(1, dt * 5);
    // cơn giật bẻ lệch hướng gió một chút
    const a = GUST.turn * GUST.g, ca = Math.cos(a), sa = Math.sin(a);
    const rx = dx * ca - dz * sa, rz = dx * sa + dz * ca;
    const sp = w ? w.speed : 8;
    const k = (0.75 + 0.35 * Math.min(1, sp / 18)) * (rain ? 1.5 + 0.5 * st : 1) + GUST.g * (rain ? 2.4 : 0.8);
    WINDV.value.set(rx, rz, k, GUST.g);
    // vận tốc đẩy dạt của cơn giật (đv/s, 8 đv = 1 m): drone giữ vị trí được với gió đều, chỉ bị cơn giật xô đi
    const v = GUST.g * (rain ? 75 : 18);
    GUST.x = rx * v; GUST.z = rz * v; GUST.rain = rain; GUST.st = st;
  }
  // drone / UAV hỏi gió giật: x, z = vận tốc đẩy dạt (đv/s), g = cơn giật 0..1, turb = biên độ nhiễu loạn (đv/s)
  function gust() { return { x: GUST.x, z: GUST.z, g: GUST.g, turb: GUST.rain ? 8 + 22 * GUST.g + 8 * GUST.st : 2 + 5 * GUST.g, rain: GUST.rain }; }
  let rainSoundT = 0;
  function update(dt, G) {
    const T = G && G.terrain, W = T && T.weather;
    tickWind(dt, G);
    if (!W || !W.rain || !T.built || !G.camera) {
      setVisible(false);
      flash = 0; pulses = [];
      if (G && G.scene) hideBolt(G.scene);
      WET.w = 0;
      if (window.soundEngine && window.soundEngine.updateRain && (rainSoundT -= dt) <= 0) { rainSoundT = 0.5; window.soundEngine.updateRain(0); }
      return;
    }
    ensureLayers(G);
    setVisible(true);
    time += dt;
    // bản đồ hứng mưa: dựng khi đổi bản đồ; làm lại vài giây một lần CHỈ trong ~25 s sau khi cảnh vật bị phá (nhà sập,
    // mái thủng — sập kéo dài vài giây sau phát nổ). Mỗi lần dựng vẽ lại cả địa hình + nhà cửa toàn bản đồ (không lọc theo
    // camera) -> trước đây cứ 8 s khựng một nhịp suốt trận mưa dù không có gì đổi
    shelterT += dt;
    if (shelterFor !== T.map || (shelterT > 8 && performance.now() - shelterDirtyAt < 25000)) { buildShelter(G.renderer, T); shelterFor = T.map; shelterT = 0; }
    const cam = G.camera.position;
    const dir = G.camera.getWorldDirection(new THREE.Vector3());
    const hl = Math.hypot(dir.x, dir.z) || 1;
    const wind = G.ballistics && G.ballistics.wind;
    // gió nền + cơn giật: vệt mưa xiên hẳn theo cơn giật
    const wx = (wind ? wind.vx * 1.6 : 12) + GUST.x * 0.9, wz = (wind ? wind.vz * 1.6 : 5) + GUST.z * 0.9;
    driftX += wx * dt; driftZ += wz * dt;
    const fog = G.scene.fog && G.scene.fog.color;
    const k = W.intensity;
    // camera trên cao (drone): cột mưa phủ từ mặt đất lên tới camera, tâm dời về phía trước theo hướng gimbal nhìn xuống
    const gyC = T.groundAtRaw ? T.groundAtRaw(Math.max(-1750, Math.min(1750, cam.x)), Math.max(-1750, Math.min(1750, cam.z))) : 0;
    const up = cam.y - gyC, colK = Math.min(1, Math.max(0, (up - 120) / 140));
    col.mesh.visible = colK > 0;
    // Vệt nước xám trong: bớt phủ trắng cảnh xa, giữ nguyên mật độ và tốc độ rơi.
    for (const [L, ahead, alpha] of [[near, 0.25, 0.45], [far, 0.38, 0.32], [col, 0, 0.38 * colK]]) {
      const U = L.U;
      if (!L.mesh.visible) continue;
      U.uTime.value = time;
      U.uCam.value.copy(cam);
      const R = U.uBox.value.x * 0.5;
      if (L === col) U.uCenter.value.set(cam.x + dir.x / hl * Math.min(450, up * 0.7), gyC + 430, cam.z + dir.z / hl * Math.min(450, up * 0.7));
      else U.uCenter.value.set(cam.x + dir.x / hl * R * ahead, cam.y + U.uBox.value.y * 0.12, cam.z + dir.z / hl * R * ahead);
      U.uWind.value.set(wx, 0, wz);
      U.uDrift.value.set(driftX, driftZ);
      U.uK.value = alpha * k * (1 + flash * 1.5);
      U.uTopOn.value = WET.w;
      if (fog) U.uCol.value.copy(fog).lerp(new THREE.Color(1, 1, 1), 0.18 + 0.22 * flash);
    }
    {
      const U = splash.U;
      U.uTime.value = time; U.uCam.value.copy(cam);
      U.uCenter.value.set(cam.x + dir.x / hl * 40, 0, cam.z + dir.z / hl * 40);
      U.uK.value = WET.w ? k * 0.75 : 0;
      if (fog) U.uCol.value.copy(fog).lerp(new THREE.Color(1, 1, 1), 0.18);
    }
    WET.y = time;
    WET.z = 0.45 + 0.5 * k;
    tickLightning(dt, G, W);
    tickPools(dt);
    // tiếng mưa: trong lòng hầm / nhìn qua kính ngắm (ngồi trong xe) nghe bùm bụp trên vỏ thép, bên ngoài rào rào
    if ((rainSoundT -= dt) <= 0) {
      rainSoundT = 0.25;
      const se = window.soundEngine, p = G.player;
      let cover = 0;
      if (p && T.strongholdSet && T.strongholdSet.surfaceInfo) { const si = T.strongholdSet.surfaceInfo(p.x, p.z); if (si && si.inside) cover = 1; }
      if (se && se.updateRain) se.updateRain(k, cover);
    }
  }
  // Trước / sau khi vẽ cảnh trận: bật độ ướt (sảnh, phòng xem xe dùng chung chunk chiếu sáng nhưng phải khô ráo),
  // áp ánh chớp lên đèn trời / sương / vòm trời
  let hemiBase = null, fogBase = null, fogRef = null;
  function beforeRender(G) {
    const T = G && G.terrain, W = T && T.weather;
    if (!W || !W.rain) { WET.x = 0; MIST.x = 0; return; }
    WET.x = W.wet;
    const fog = G.scene.fog, atm = T.atmosphere;
    // mảng mù trôi theo gió; camera pháo binh / nhìn toàn cảnh trên cao: nhìn xuyên lớp mù mỏng hơn (vẫn chơi được)
    const cam = G.camera.position, gw = G.ballistics && G.ballistics.wind;
    const gy = T.groundAtRaw ? T.groundAtRaw(Math.max(-1750, Math.min(1750, cam.x)), Math.max(-1750, Math.min(1750, cam.z))) : 0;
    MIST.x = 1; MIST.w = gy;
    MIST.y = -time * (gw ? gw.vx : 8) * 0.6 / 650; MIST.z = -time * (gw ? gw.vz : 3) * 0.6 / 650;
    if (fog && fog.density !== undefined) {
      fogDensSaved = fog.density;
      const up = cam.y - gy;
      fog.density *= 1 - 0.6 * Math.min(1, Math.max(0, (up - 140) / 700));
    }
    const h = G.hemiLight;
    if (h) { if (hemiBase === null || flash <= 0.001) hemiBase = h.intensity; h.intensity = hemiBase * (1 + 2.6 * flash); }
    if (fog) {
      if (fogRef !== fog) { fogRef = fog; fogBase = fog.color.clone(); }
      if (flash <= 0.001) fogBase.copy(fog.color);
      fog.color.copy(fogBase).lerp(new THREE.Color(0.85, 0.88, 0.95), 0.35 * flash);
    }
    // màu trời phản chiếu trên mặt ướt: theo màu chân trời / thiên đỉnh mây mưa, nhân độ sáng ánh trời
    if (atm) {
      const s = (atm.skyIntensity || 0.8) * 0.95 * (1 + 2 * flash);
      // mây đen giông: mặt ướt soi lại đỉnh trời sẫm (chân trời vẫn sáng)
      const ch = new THREE.Color(atm.horizon), cz = new THREE.Color(atm.zenith).multiplyScalar(1 - 0.45 * (atm.storm || 0));
      SKYH.r = ch.r * s; SKYH.g = ch.g * s; SKYH.b = ch.b * s;
      SKYZ.r = cz.r * s; SKYZ.g = cz.g * s; SKYZ.b = cz.b * s;
    }
    const sky = T.sky && T.sky.mesh && T.sky.mesh.material.uniforms;
    if (sky) {
      if (sky.time) sky.time.value = time;
      if (sky.flash) sky.flash.value = flash;
      if (sky.flashDir) sky.flashDir.value.copy(flashDir);
    }
  }
  let fogDensSaved = null;
  function afterRender(G) {
    WET.x = 0;
    MIST.x = 0;
    const fog = G && G.scene && G.scene.fog;
    if (fog && fogDensSaved !== null) fog.density = fogDensSaved;
    fogDensSaved = null;
    if (G && G.hemiLight && hemiBase !== null && flash > 0.001) G.hemiLight.intensity = hemiBase;
  }
  // Vụ nổ / phát bắn tại (x, z), k: độ mạnh (đạn 120 ~1, lựu pháo 155 ~2, luồng khí đầu nòng ~0,5) — chỉ khi trời mưa
  function blast(x, z, k = 1) {
    const W = curW();
    if (!W || !W.rain || !(k > 0)) return;
    BLAST[blastI++ % 4].set(x, z, time, Math.min(2.5, k));
  }
  // VŨNG NƯỚC trên mặt đất tại (x, z): 0..1 — bản sao CPU công thức gPud của ground_shader.js (cùng ảnh nhiễu, cùng độ
  // lõm địa hình nướng sẵn) để xe lăn qua vũng thì tóe nước đúng chỗ thấy vũng. Lớp đất / đá lấy gần đúng theo mặt nạ
  // tầng lớn; mép vũng có thể lệch chút ít. Đường (vũng ổ gà riêng của shader đường), mặt nước, ngoài bản đồ: 0
  const PUD_G = { DESERT: 0.35, URBAN: 0.85, JUNGLE: 1.0, HIGHLAND: 0.7, RIVER_LAKE: 0.9 };
  let pudS = null;
  function puddleAt(T, x, z) {
    const W = T && T.weather;
    if (!W || !W.rain || !glsl || typeof GroundShader === 'undefined') return 0;
    const B = T._gBake;
    if (!B || !B.tex || !B.tex.image || !B.tex.image.data) return 0;
    if (!pudS || pudS.B !== B) pudS = { B, n: GroundShader.noiseSampler(), G: PUD_G[T.mapType] !== undefined ? PUD_G[T.mapType] : 0.7, desert: T.mapType === 'DESERT' };
    if (Math.max(Math.abs(x), Math.abs(z)) > B.half) return 0;
    if (T.map && T.map.roadAt && T.map.roadAt(x, z)) return 0;
    if (T.groundAtRaw && T.groundAtRaw(x, z) < 0.1) return 0;
    const S = pudS, n = S.n;
    const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    // độ lõm (kênh alpha ảnh pháp tuyến nướng sẵn, DataTexture không lật trục)
    const img = B.tex.image, N = img.width, D = img.data;
    const fx = Math.max(0, Math.min(N - 1.001, (x + B.half) / B.size * N - 0.5)), fz = Math.max(0, Math.min(N - 1.001, (z + B.half) / B.size * N - 0.5));
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, o = (j * N + i) * 4 + 3;
    const al = ((D[o] * (1 - tx) + D[o + 4] * tx) * (1 - tz) + (D[o + N * 4] * (1 - tx) + D[o + N * 4 + 4] * tx) * tz) / 255;
    const cav = al * 2 - 1, slope = B.slopeAt(x, z);
    const w1x = 0.866 * x + 0.5 * z, w1z = -0.5 * x + 0.866 * z;
    const w2x = 0.423 * x + 0.906 * z, w2z = -0.906 * x + 0.423 * z;
    const w3x = 0.94 * x - 0.342 * z, w3z = 0.342 * x + 0.94 * z;
    const nz = n(w1x / 1100, w1z / 1100), nz2 = n(w2x / 260 + 0.5, w2z / 260 + 0.5);
    const t2 = Math.max(ss(0.5, 0.82, nz[0] * 0.55 + nz2[1] * 0.45 + (nz2[2] - 0.5) * 0.2) * 0.85, ss(0.1, 0.3, slope) * 0.75);
    const t3 = S.desert ? ss(0.3, 0.52, slope + (nz2[0] - 0.5) * 0.14) : ss(0.2, 0.42, slope + (nz2[0] - 0.5) * 0.14);
    const pn = n(w1x / 41 + 0.23, w1z / 41 + 0.23)[0] * 0.6 + n(w2x / 12 + 0.61, w2z / 12 + 0.61)[1] * 0.4;
    const lvl = cav * 1.3 + (pn - 0.5) * 1.3 + (n(w3x / 4.3 + 0.71, w3z / 4.3 + 0.71)[2] - 0.5) * 0.45 + t2 * 0.18 - slope * 3 - t3;
    return ss(0.36 - 0.22 * S.G, 0.5 - 0.22 * S.G, lvl) * (W.wet !== undefined ? W.wet : 1) * (1 - t3);
  }
  // tầm phát hiện địch (mắt thường / kính ngắm) khi mưa
  function sightK() { const W = curW(); return W && W.rain ? W.sight || 0.8 : 1; }
  // độ nặng hạt mưa hiện tại (0 = không mưa) — giọt bám ống kính drone (lens_rain.js)
  function rainK() { const W = curW(); return W && W.rain ? W.intensity : 0; }

  if (typeof THREE !== 'undefined') { installChunks(); installMist(); }
  return {
    shelterDirty() { shelterDirtyAt = performance.now(); },
    forMap, pref, setPref, seedFor, matches, markDry, floodMaterial, addCraterPool, craterWaterAt, update, beforeRender, afterRender, sightK, buildShelter, blast,
    WINDV, gust, rainK, puddleAt, SKYH, SKYZ,
    U: WET, get glsl() { return glsl; }, get flash() { return flash; },
    // gỡ lỗi: đọc độ cao mặt hứng mưa tại (x, z) từ GPU (chậm — chỉ dùng khi thử nghiệm)
    debugTop(renderer, x, z) {
      const px = new Uint8Array(4), u = Math.floor((x * MAPM.y + 0.5) * MAP_RES), v = Math.floor((0.5 - z * MAPM.y) * MAP_RES);
      renderer.readRenderTargetPixels(RT, u, v, 1, 1, px);
      return px[2] > 127 ? ZMIN + (px[0] + px[1] / 255) / 255 * ZRANGE : null;
    },
    get layers() { return { near, far, col, splash }; }
  };
})();
if (typeof window !== 'undefined') window.Weather = Weather;
