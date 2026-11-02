// scratch/test_ankle_tune.js
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
let code = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

// SOLE điểm tiếp xúc
code = code.replace(
  /const SOLE = \[.*?\];/s,
  `const SOLE = [V(0, -ANKLE_H, 0.45), V(0, -ANKLE_H, -0.3), V(0, -ANKLE_H, -1.05), V(0, -ANKLE_H + 0.08, -1.5)];`
);

// GAITS.walk với ankle phẳng, không kiễng gãy mũi
code = code.replace(
  /walk:\s*\{\s*cycle:\s*1\.02,\s*lean:\s*-0\.04,.*?ankle:\s*periodic\(.*?\)\s*\}/s,
  `walk: {
      cycle: 1.05, lean: -0.04, yaw: 3.5, roll: 3, shift: 0.12, adduct: 0.03, toeOut: 0.08, arm: 0.9, armBend: 0.15, lift: 0, gun: 'low',
      hip: periodic([[0, 20], [10, 17], [20, 12], [30, 6], [40, 0], [50, -5], [58, -7], [66, -4], [75, 4], [85, 14], [92, 19], [98, 20]]),
      knee: periodic([[0, 12], [10, 15], [20, 15], [30, 14], [40, 13], [50, 15], [58, 24], [66, 36], [74, 44], [82, 34], [90, 20], [96, 12]]),
      ankle: periodic([[0, 3], [10, 1], [20, 0], [30, 1], [40, 2], [50, 1], [58, -1], [64, -2], [70, 0], [78, 1], [86, 2], [94, 3]])
    }`
);

// plantFeet chuẩn xác không cần cap giả tạo
code = code.replace(
  /const dy = FOOT_Y - minY \+ lift;\s*F\.hips\.position\.y \+= dy;\s*F\.torso\.position\.y \+= dy;/s,
  `const dy = FOOT_Y - minY + lift;
    F.hips.position.y += dy; F.torso.position.y += dy;
    F.root.updateMatrixWorld(true);`
);

vm.runInNewContext(code, sandbox);

const SM = sandbox.SoldierModel;
const F = SM.buildFigure('BLUE', { role: 'infantry' });

let minHipsY = Infinity, maxHipsY = -Infinity;
let minSoleAcrossCycle = Infinity;
const V = (x, y, z) => new sandbox.THREE.Vector3(x, y, z);
const p = V(0, 0, 0);

for (let frame = 0; frame <= 40; frame++) {
  const t = frame * (1.05 / 40);
  SM.animateMotion(F, 'walk', t, 1);
  if (F.hips.position.y < minHipsY) minHipsY = F.hips.position.y;
  if (F.hips.position.y > maxHipsY) maxHipsY = F.hips.position.y;

  for (const L of F.legs) {
    for (let z = 0.45; z >= -1.66; z -= 0.1) {
      p.set(0, -0.72, z); L.ankle.localToWorld(p); F.root.worldToLocal(p);
      if (p.y < minSoleAcrossCycle) minSoleAcrossCycle = p.y;
    }
  }
}
console.log(`Natural hips.y range: min=${minHipsY.toFixed(3)}, max=${maxHipsY.toFixed(3)}, bounceRange=${(maxHipsY - minHipsY).toFixed(3)}`);
console.log(`Lowest sole point across entire walk cycle: ${minSoleAcrossCycle.toFixed(3)} (FLOOR_Y = ${SM.FOOT_Y})`);
