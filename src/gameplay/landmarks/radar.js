/**
 * ĐÀI ĐIỀU KHIỂN RADAR VỆ TINH (bản đồ cao nguyên)
 *
 * Đăng ký vào window.LandmarkKinds (landmarks.js gọi build khi dựng bản đồ). Mặt bằng / ụ đất: MapGen (map_gen.js:
 * detailRadar / moundRadar). (Bản tạm — đang dựng)
 */
(function () {
  const KINDS = window.LandmarkKinds = window.LandmarkKinds || {};
  KINDS.radar = {
    name: 'ĐÀI ĐIỀU KHIỂN RADAR VỆ TINH', icon: '📡', color: '#8fe3c8',
    site: {
      roads: [[[[320, 0], [120, 0]], 30]],
      junctions: [],
      gravel: (hu) => [[hu - 150, -70, hu, 70]],
      slabs: [], noGrow: []
    },
    build(K, group, anim, api) {
      const { apron, roadNet, secKit, perimeter } = api;
      const L = K.L, SI = KINDS.radar.site;
      apron(group, L, -L.hu, L.hu, -L.hv, L.hv, 'radar');
      roadNet(group, SI.roads, SI.junctions, { bars: [], words: [] });
      perimeter(K, secKit(K, anim));
    }
  };
})();
