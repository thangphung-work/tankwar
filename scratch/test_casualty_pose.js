// scratch/test_casualty_pose.js
const fs = require('fs');
const vm = require('vm');

const sandbox = {
  console, Math, Float32Array, Uint16Array, Uint8Array, Uint32Array, Int32Array, Array, Object, Set, Map, window: {},
  document: {
    createElement: () => ({
      getContext: () => ({
        createImageData: () => ({ data: new Uint8Array(128 * 128 * 4) }),
        putImageData: () => {},
        fillStyle: '',
        fillRect: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {}
      })
    })
  }
};
sandbox.window = sandbox;

const threeCode = fs.readFileSync('three.min.js', 'utf8');
vm.runInNewContext(threeCode, sandbox);
const soldierCode = fs.readFileSync('src/entities/soldier_model.js', 'utf8');
vm.runInNewContext(soldierCode, sandbox);

const THREE = sandbox.THREE;
const SM = sandbox.SoldierModel;
const F = SM.buildFigure('BLUE', { role: 'infantry' });

console.log('FLOOR_Y =', SM.FOOT_Y); // -8.71

// Xây dựng tư thế ngã nằm trên mặt đất
function setCasualty(F, isDead) {
  F.isDead = isDead;
  for (const s of F.soak || []) s.visible = isDead;

  if (isDead) {
    // 1. Hạ thân người nằm xuống sát mặt sàn cát
    // Gốc root xoay nghiêng sấp người: người lính ngã nghiêng một bên
    F.root.rotation.set(-1.42, 0.25, -1.65, 'YXZ');
    F.root.position.set(0, SM.FOOT_Y + 1.25, 0.4);

    // 2. Đầu gục áp má xuống cát
    F.head.rotation.set(0.35, 0.55, -0.15);

    // 3. Thân trên và lưng thả lỏng
    F.torso.rotation.set(0.1, -0.15, 0.1);
    F.hips.rotation.set(0.05, 0.1, -0.05);

    // 4. Hai chân buông lỏng trên mặt đất (không đứng đơ)
    // Chân dưới (L): co gập tự nhiên ở gối
    F.legs[0].leg.rotation.set(0.35, 0.1, 0.15);
    F.legs[0].knee.rotation.set(0.65, 0, 0);
    F.legs[0].ankle.rotation.set(-0.2, 0, -0.15);

    // Chân trên (R): duỗi thả lỏng xuôi theo thân
    F.legs[1].leg.rotation.set(-0.1, -0.1, -0.1);
    F.legs[1].knee.rotation.set(0.25, 0, 0);
    F.legs[1].ankle.rotation.set(0.1, 0, 0.1);

    // 5. Cánh tay buông thõng, súng rơi ra khỏi tay nằm trên cát
    if (F.rifle) {
      F.rifle.visible = true;
      // Súng rơi nghiêng cạnh bàn tay trên đất
      F.rifle.position.set(1.4, 0.2, -1.6);
      F.rifle.rotation.set(-1.5, 0.4, -0.8);
    }

    // Tay phải buông thõng rời báng súng hướng về phía súng rơi
    if (F.arms[1]) {
      F.arms[1].up.rotation.set(0.3, 0.2, -0.6);
      F.arms[1].fore.rotation.set(0.5, 0.1, 0);
      F.arms[1].hand.rotation.set(0.2, 0, -0.3);
    }
    // Tay trái gập hờ trên ngực áp đất
    if (F.arms[0]) {
      F.arms[0].up.rotation.set(-0.2, -0.4, 0.5);
      F.arms[0].fore.rotation.set(1.2, -0.2, 0);
      F.arms[0].hand.rotation.set(0.3, 0, 0.2);
    }
  } else {
    // Khôi phục đứng dậy
    F.root.rotation.set(0, 0, 0);
    F.root.position.set(0, 0, 0);
    F.head.rotation.set(0, 0, 0);
    F.torso.rotation.set(0, 0, 0);
    F.hips.rotation.set(0, 0, 0);
    if (F.rifle) F.rifle.position.set(0, 0, 0);
  }
}

setCasualty(F, true);
F.root.updateMatrixWorld(true);

console.log('Casualty pose set successfully!');
let minY = Infinity, maxY = -Infinity;
F.root.traverse(o => {
  if (o.isMesh && o.geometry && o.geometry.attributes.position) {
    const p = o.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 20) {
      v.fromBufferAttribute(p, i);
      o.localToWorld(v);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  }
});
console.log(`World Y span of fallen soldier: min=${minY.toFixed(2)}, max=${maxY.toFixed(2)} (FLOOR_Y = ${SM.FOOT_Y})`);
