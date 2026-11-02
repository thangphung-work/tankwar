// scratch/find_best_casualty_pos.js
const fs = require('fs');
const vm = require('vm');

const sandbox = {
  console, Math, Float32Array, Uint16Array, Uint8Array, Uint32Array, Int32Array, Array, Object, Set, Map, window: {},
  document: { createElement: () => ({ getContext: () => ({ createImageData: () => ({ data: new Uint8Array(128 * 128 * 4) }), putImageData: () => {}, fillStyle: '', fillRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }), createLinearGradient: () => ({ addColorStop: () => {} }), beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, save: () => {}, restore: () => {}, translate: () => {} }) }) }
};
sandbox.window = sandbox;

const threeCode = fs.readFileSync('three.min.js', 'utf8');
vm.runInNewContext(threeCode, sandbox);
const soldierCode = fs.readFileSync('src/entities/soldier_model.js', 'utf8');
vm.runInNewContext(soldierCode, sandbox);

const THREE = sandbox.THREE;
const SM = sandbox.SoldierModel;
const F = SM.buildFigure('BLUE', { role: 'infantry' });

// Thử nghiệm tư thế nằm ngã ngửa / nghiêng tự nhiên:
// Người lính ngã ngửa hơi nghiêng (quân trang ba lô lưng đỡ lưng, đầu áp đất, hai chân gập thả lỏng)
function applyCasualty(F, isDead) {
  F.isDead = isDead;
  for (const s of F.soak || []) s.visible = isDead;
  if (!isDead) {
    F.root.rotation.set(0, 0, 0);
    F.root.position.set(0, 0, 0);
    F.hips.position.set(0, 0, 0);
    F.hips.rotation.set(0, 0, 0);
    F.torso.position.set(0, 0, 0);
    F.torso.rotation.set(0, 0, 0);
    F.head.rotation.set(0, 0, 0);
    if (F.rifle) { F.rifle.position.set(0, 0, 0); F.rifle.rotation.set(0, 0, 0); F.rifle.visible = true; }
    for (const L of F.legs) { L.leg.rotation.set(0, 0, 0); L.knee.rotation.set(0, 0, 0); L.ankle.rotation.set(0, 0, 0); }
    return;
  }

  // 1. Khớp hông & thân: ngã ngửa hơi nghiêng sang phải (~20° nghiêng)
  F.root.rotation.set(-Math.PI / 2 * 0.95, 0.25, -0.15, 'YXZ');
  
  // 2. Hai chân buông thõng, gối chùng đổ nghiêng trên đất
  F.legs[0].leg.rotation.set(0.25, 0.2, 0.2);
  F.legs[0].knee.rotation.set(0.55, 0, 0);
  F.legs[0].ankle.rotation.set(-0.2, 0, -0.15);

  F.legs[1].leg.rotation.set(0.1, -0.3, -0.25);
  F.legs[1].knee.rotation.set(0.75, 0, 0);
  F.legs[1].ankle.rotation.set(-0.15, 0, 0.1);

  // 3. Đầu gục ngoẹo nghiêng sang một bên
  F.head.rotation.set(0.35, 0.45, -0.2);

  // 4. Tay buông xuôi, súng rơi ra khỏi tay nằm trên mặt đất
  if (F.rifle) {
    F.rifle.position.set(1.5, 0.3, -1.2);
    F.rifle.rotation.set(-0.3, 0.5, -1.4);
  }
  if (F.arms[1]) {
    F.arms[1].up.rotation.set(0.2, 0.3, -0.5);
    F.arms[1].fore.rotation.set(0.4, 0.1, 0);
    F.arms[1].hand.rotation.set(0.1, 0, -0.2);
  }
  if (F.arms[0]) {
    F.arms[0].up.rotation.set(-0.1, -0.3, 0.6);
    F.arms[0].fore.rotation.set(0.8, -0.2, 0);
    F.arms[0].hand.rotation.set(0.2, 0, 0.1);
  }

  // Đo điểm thấp nhất thực tế và căn chỉnh đúng mặt sàn FLOOR_Y
  F.root.position.set(0, 0, 0);
  F.root.updateMatrixWorld(true);

  let curMinY = Infinity;
  F.root.traverse(o => {
    if (o.isMesh && o.geometry && o.geometry.attributes.position) {
      const p = o.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 10) {
        v.fromBufferAttribute(p, i);
        o.localToWorld(v);
        if (v.y < curMinY) curMinY = v.y;
      }
    }
  });

  const targetFloor = SM.FOOT_Y;
  const shiftY = targetFloor - curMinY;
  F.root.position.set(0, shiftY, 0);
  F.root.updateMatrixWorld(true);

  console.log(`curMinY at 0 was: ${curMinY.toFixed(2)}, adjusted root.y = ${shiftY.toFixed(2)}`);
}

applyCasualty(F, true);

let finalMinY = Infinity, finalMaxY = -Infinity;
F.root.traverse(o => {
  if (o.isMesh && o.geometry && o.geometry.attributes.position) {
    const p = o.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 10) {
      v.fromBufferAttribute(p, i);
      o.localToWorld(v);
      if (v.y < finalMinY) finalMinY = v.y;
      if (v.y > finalMaxY) finalMaxY = v.y;
    }
  }
});
console.log(`Final bounds on floor: min=${finalMinY.toFixed(2)}, max=${finalMaxY.toFixed(2)} (Target = ${SM.FOOT_Y})`);
