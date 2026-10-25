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
    return (camera, progress, light) => {
      const t = Math.max(0, Math.min(1, progress)) * 4;
      const i = Math.min(3, Math.floor(t)), local = t - i;
      // Nửa đầu mỗi chặng quan sát mục tiêu; nửa sau chuyển sang chặng kế.
      const k = Math.max(0, (local - 0.5) * 2), ease = k * k * (3 - 2 * k);
      look.copy(targets[i]).lerp(targets[(i + 1) % 4], ease);
      const radius = (i === 0 ? 860 : 420) * (1 - ease) + ((i + 1) % 4 === 0 ? 860 : 420) * ease;
      const height = (i === 0 ? 420 : 250) * (1 - ease) + ((i + 1) % 4 === 0 ? 420 : 250) * ease;
      const angle = progress * Math.PI * 2 - Math.PI / 2;
      camera.position.set(look.x + Math.cos(angle) * radius, look.y + height, look.z + Math.sin(angle) * radius);
      camera.lookAt(look);
      if (light) light.target.position.copy(look);
    };
  }
  return { create };
})();
