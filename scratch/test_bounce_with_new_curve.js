// scratch/test_bounce_with_new_curve.js
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

// Thay đường cong walk trong SM.GAITS.walk
function periodic(pts) {
  return function(ph) {
    const p = ((ph % 1) + 1) % 1 * 100;
    if (p <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (p <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        const f = (p - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * f;
      }
    }
    const a = pts[pts.length - 1], b = pts[0];
    const f = (p - a[0]) / (100 - a[0] + b[0]);
    return a[1] + (b[1] - a[1]) * f;
  };
}

SM.GAITS.walk.hip = periodic([[0, 20], [10, 17], [20, 12], [30, 6], [40, 0], [50, -5], [58, -8], [66, -4], [75, 4], [85, 14], [92, 19], [98, 20]]);
SM.GAITS.walk.knee = periodic([[0, 14], [10, 16], [20, 16], [30, 15], [40, 14], [50, 16], [58, 24], [66, 36], [74, 44], [82, 36], [90, 22], [96, 15]]);
SM.GAITS.walk.ankle = periodic([[0, 3], [10, 1], [20, 0], [30, 2], [40, 3], [50, 1], [58, -4], [66, -7], [74, -5], [82, -1], [90, 2], [96, 3]]);

const F = SM.buildFigure('BLUE', { role: 'infantry' });

let minHipsY = Infinity, maxHipsY = -Infinity;
for (let frame = 0; frame <= 40; frame++) {
  const t = frame * (1.02 / 40);
  SM.animateMotion(F, 'walk', t, 1);
  if (F.hips.position.y < minHipsY) minHipsY = F.hips.position.y;
  if (F.hips.position.y > maxHipsY) maxHipsY = F.hips.position.y;
}
console.log(`New walk hips.y range: min=${minHipsY.toFixed(3)}, max=${maxHipsY.toFixed(3)}, bounceRange=${(maxHipsY - minHipsY).toFixed(3)}`);
