// scratch/test_plant_feet_fix.js
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
let soldierCode = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

// Thay đổi SOLE và góc ankle đạp sau
const V = (x, y, z) => new sandbox.THREE.Vector3(x, y, z);

// Thử nghiệm góc walk mới đầm chắc:
soldierCode = soldierCode.replace(
  /ankle:\s*periodic\(\[\[0,\s*0\],\s*\[5,\s*-6\].*?\]\)/s,
  `ankle: periodic([[0, 2], [10, 0], [20, 1], [35, 4], [45, 5], [52, 2], [58, -3], [64, -7], [70, -5], [78, -1], [86, 1], [94, 2]])`
);

soldierCode = soldierCode.replace(
  /hip:\s*periodic\(\[\[0,\s*30\].*?\]\)/s,
  `hip: periodic([[0, 22], [10, 19], [20, 14], [30, 7], [40, 1], [50, -5], [58, -8], [66, -4], [75, 4], [85, 15], [92, 21], [98, 22]])`
);

soldierCode = soldierCode.replace(
  /knee:\s*periodic\(\[\[0,\s*5\].*?\]\)/s,
  `knee: periodic([[0, 10], [10, 13], [20, 13], [30, 12], [40, 11], [50, 14], [58, 24], [66, 36], [74, 44], [82, 34], [90, 19], [96, 11]])`
);

// Thay đổi SOLE điểm tiếp xúc: gót, giữa bàn chân và đệm ngón (không lấy đầu chóp mũi -1.66 chúc thẳng đứng)
soldierCode = soldierCode.replace(
  /const SOLE = \[.*?\];/s,
  `const SOLE = [V(0, -ANKLE_H, 0.45), V(0, -ANKLE_H, -0.4), V(0, -ANKLE_H, -1.05), V(0, -ANKLE_H + 0.04, -1.35)];`
);

vm.runInNewContext(soldierCode, sandbox);

const SM = sandbox.SoldierModel;
const F = SM.buildFigure('BLUE', { role: 'infantry' });

let minHipsY = Infinity, maxHipsY = -Infinity;
for (let frame = 0; frame <= 40; frame++) {
  const t = frame * (1.02 / 40);
  SM.animateMotion(F, 'walk', t, 1);
  if (F.hips.position.y < minHipsY) minHipsY = F.hips.position.y;
  if (F.hips.position.y > maxHipsY) maxHipsY = F.hips.position.y;
}
console.log(`Refined walk hips.y: min=${minHipsY.toFixed(3)}, max=${maxHipsY.toFixed(3)}, bounceRange=${(maxHipsY - minHipsY).toFixed(3)}`);
