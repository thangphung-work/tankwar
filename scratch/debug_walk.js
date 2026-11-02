// scratch/debug_walk.js
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

console.log('SM.FOOT_Y =', SM.FOOT_Y);

// Test across 1 walk cycle (cycle = 1.02s)
for (let frame = 0; frame <= 20; frame++) {
  const t = frame * 0.05;
  SM.animateMotion(F, 'walk', t, 1);
  F.root.updateMatrixWorld(true);

  // Check actual lowest point of soles in root space
  let lowestSoleY = Infinity;
  const v = new THREE.Vector3();
  for (const L of F.legs) {
    // Check points along sole
    for (let z = 0.45; z >= -1.66; z -= 0.1) {
      v.set(0, -0.72, z);
      L.ankle.localToWorld(v);
      F.root.worldToLocal(v);
      if (v.y < lowestSoleY) lowestSoleY = v.y;
    }
  }
  console.log(`t=${t.toFixed(2)}s: hips.y=${F.hips.position.y.toFixed(3)}, lowestSoleY=${lowestSoleY.toFixed(3)}, diffFromFloor=${(lowestSoleY - SM.FOOT_Y).toFixed(3)}`);
}
