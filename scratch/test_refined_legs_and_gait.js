// scratch/test_refined_legs_and_gait.js
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

// Đo đạc các thông số mới:
// Đùi dã chiến: dày dặn, cơ bắp
// Đầu đùi: r = 0.78 (đường kính 1.56, gần gấp rưỡi bản cũ)
// Giữa đùi: r = 0.72
// Trên gối: r = 0.62
// Cẳng chân:
// Gối: r = 0.58
// Bắp chân: r = 0.56 (bắp sau phồng +0.12)
// Cổ chân: r = 0.46
// Túm phồng trên cổ giày: r = 0.52 (che phủ cổ giày, không bị lộ cổ giày khẳng khiu)

console.log('Script loaded successfully');
