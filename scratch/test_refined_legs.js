// scratch/test_refined_legs.js
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
const THREE = sandbox.THREE;

function sm(v) { return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v); }

function createHipGeo() {
  const rows = 28, cols = 56;
  const pos = [], uv = [], idx = [];
  const C1 = cols + 1;

  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    for (let j = 0; j <= cols; j++) {
      const ph = (j / cols) * Math.PI * 2;
      const c = Math.cos(ph);
      const s = Math.sin(ph);

      // Đường viền mép đáy: phía trước đũng quần và sau nếp mông phủ xuống -1.95,
      // hai bên bẹn uốn cong hình vòm lên -1.50 để đón đùi to khỏe
      const yBot = -1.95 + 0.45 * (s * s) + (c > 0 ? 0.02 * c : -0.03 * Math.abs(c));
      const yTop = -0.44;
      const y = yTop + v * (yBot - yTop);

      // Bề ngang hông: thắt lưng 1.44, nở rộng 1.50 ở ngang khớp chậu
      const rx = 1.44 + 0.08 * Math.sin(Math.PI * v) - 0.04 * v * v;
      let x = rx * s;

      let z = 0;
      if (c < 0) {
        // Phía trước: phẳng phiu, đứng form quân trang dã chiến dày dặn
        const frontRz = 0.96 * (1.0 - 0.05 * v);
        z = c * frontRz;
        if (Math.abs(x) < 0.24) {
          const flyPlacket = Math.cos((x / 0.24) * (Math.PI / 2));
          z -= 0.03 * flyPlacket * sm((0.85 - v) / 0.3);
        }
      } else {
        // Phía sau: hai múi cơ mông nở nang, cong tròn đều đặn
        const baseRz = 0.98;
        const peakV = 0.60;
        const uy = (v - peakV) / (v < peakV ? 0.55 : 0.38);
        const bumpY = Math.sqrt(Math.max(0, 1 - uy * uy));

        const ux = (Math.abs(x) - 0.50) / 0.58;
        const bumpX = Math.sqrt(Math.max(0, 1 - ux * ux));

        const cleft = Math.exp(-Math.pow(x / 0.13, 2));
        const sideFalloff = sm((c - 0.15) / 0.6);

        const gluteBulge = (0.30 * bumpX * bumpY - 0.08 * cleft * bumpY) * sideFalloff;
        z = c * (baseRz + gluteBulge);

        if (v > 0.8) {
          const tuck = sm((v - 0.8) / 0.2);
          z -= 0.06 * tuck * c;
        }
      }

      pos.push(x, y, z);
      uv.push((j / cols) * (2.0 / 2.2), y * 0.14);
    }
  }

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * C1 + j;
      const b = a + C1;
      idx.push(a, b, a + 1);
      idx.push(a + 1, b, b + 1);
    }
  }

  const botRow = rows * C1;
  const jFront = Math.round(cols / 2);
  const bridgeWidth = 3;
  for (let k = 1; k <= bridgeWidth; k++) {
    const fR = botRow + jFront - k;
    const fL = botRow + jFront + k;
    const bR = botRow + k;
    const bL = botRow + cols - k;

    idx.push(fR, bR, botRow + jFront - k + 1);
    idx.push(fL, botRow + jFront + k - 1, bL);
  }
  idx.push(botRow + jFront, botRow, botRow + 1);
  idx.push(botRow + jFront, botRow + cols - 1, botRow);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const g = createHipGeo();
g.computeBoundingBox();
console.log('New Hip Bounding Box:');
console.log('x:', g.boundingBox.min.x.toFixed(2), 'to', g.boundingBox.max.x.toFixed(2));
console.log('y:', g.boundingBox.min.y.toFixed(2), 'to', g.boundingBox.max.y.toFixed(2));
console.log('z:', g.boundingBox.min.z.toFixed(2), 'to', g.boundingBox.max.z.toFixed(2));
