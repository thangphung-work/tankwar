// scratch/debug_walk_smooth.js
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

console.log('Testing original walk curve:');
let minHipsY = Infinity, maxHipsY = -Infinity;
for (let frame = 0; frame <= 40; frame++) {
  const t = frame * (1.02 / 40);
  SM.animateMotion(F, 'walk', t, 1);
  if (F.hips.position.y < minHipsY) minHipsY = F.hips.position.y;
  if (F.hips.position.y > maxHipsY) maxHipsY = F.hips.position.y;
}
console.log(`Original hips.y range: min=${minHipsY.toFixed(3)}, max=${maxHipsY.toFixed(3)}, bounceRange=${(maxHipsY - minHipsY).toFixed(3)}`);
