/** Đường bay dùng riêng khi xuất video: căn cứ -> A -> B -> C -> căn cứ.
 * Video minh họa chiến địa theo seed quay sẵn, không phải tọa độ trực tiếp của trận.
 */
const ReconTour = (() => {
  function create(terrain, points) {
    const map = terrain.map || {};
    const cps = points || map.strongholds || [];
    const base = (map.landmarks || [])[0] || cps.find(p => p.id === 'B') || { x: 0, z: 0 };
    const nodes = [base, ...['A', 'B', 'C'].map(id => cps.find(p => p.id === id) || base)];
    const targets = nodes.map(p => new THREE.Vector3(p.x, terrain.getElevationAt(p.x, p.z) + 20, p.z));
    const look = new THREE.Vector3();
    // Keep the reconnaissance aircraft above terrain and roofs throughout transitions,
    // not just above the point it is looking at. This prevents a high hill or city block
    // on the outside of the orbit from swallowing the camera.
    const safeAltitude = (x, z, wanted) => {
      let top = terrain.getElevationAt(x, z);
      const bs = terrain.buildingSet;
      if (bs && bs.items && bs.toLocal) {
        for (const B of bs.items) {
          if (!B || B.removed || B.collapsed) continue;
          if (Math.abs(x - B.x) > (B.radius || 180) || Math.abs(z - B.z) > (B.radius || 180)) continue;
          const L = bs.toLocal(B, x, 0, z);
          if (Math.abs(L.x) <= B.halfW + 18 && Math.abs(L.z) <= B.halfD + 18) {
            top = Math.max(top, (B.y || 0) - 1.5 + (B.topY || B.height || 80) + 35);
          }
        }
      }
      return Math.max(wanted, top + 300);
    };
    return (camera, progress, light) => {
      const t = Math.max(0, Math.min(1, progress)) * 4;
      const i = Math.min(3, Math.floor(t)), local = t - i;
      // Nửa đầu mỗi chặng quan sát mục tiêu; nửa sau chuyển sang chặng kế.
      const k = Math.max(0, (local - 0.5) * 2), ease = k * k * (3 - 2 * k);
      look.copy(targets[i]).lerp(targets[(i + 1) % 4], ease);
      const radius = (i === 0 ? 940 : 520) * (1 - ease) + ((i + 1) % 4 === 0 ? 940 : 520) * ease;
      // Góc chúc ~50° ở căn cứ, ~55° ở cứ điểm: nhìn rõ bố cục từ trên cao.
      const height = (i === 0 ? 1100 : 750) * (1 - ease) + ((i + 1) % 4 === 0 ? 1100 : 750) * ease;
      const angle = progress * Math.PI * 2 - Math.PI / 2;
      const cx = look.x + Math.cos(angle) * radius, cz = look.z + Math.sin(angle) * radius;
      camera.position.set(cx, safeAltitude(cx, cz, look.y + height), cz);
      camera.lookAt(look);
      if (light) light.target.position.copy(look);
    };
  }
  return { create };
})();
