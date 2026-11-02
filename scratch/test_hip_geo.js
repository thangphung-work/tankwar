// scratch/test_hip_geo.js
const fs = require('fs');
const vm = require('vm');

const sandbox = {
  console, Math, Float32Array, Uint16Array, Uint8Array, Uint32Array, Int32Array, Array, Object, Set, Map, window: {}
};
sandbox.window = sandbox;

const threeCode = fs.readFileSync('three.min.js', 'utf8');
vm.runInNewContext(threeCode, sandbox);
const THREE = sandbox.THREE;

function sm(v) { return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v); }
function c01(v) { return v <= 0 ? 0 : v >= 1 ? 1 : v; }

function createHipGeo() {
  const rows = 28, cols = 56;
  const pos = [], uv = [], idx = [];
  const C1 = cols + 1;

  for (let i = 0; i <= rows; i++) {
    const v = i / rows; // 0 (top/waist) -> 1 (bottom/leg openings)
    for (let j = 0; j <= cols; j++) {
      const ph = (j / cols) * Math.PI * 2;
      const c = Math.cos(ph); // 1 = back (+z), -1 = front (-z)
      const s = Math.sin(ph); // 1 = right (+x), -1 = left (-x)

      // Bottom rim elevation curve:
      // Front crotch / fly: y = -1.95
      // Back gluteal fold: y = -1.90
      // Side hip sockets (around x = +-0.7, where s^2 = 1): arches up to y = -1.52
      const yBot = -1.92 + 0.40 * (s * s) + (c > 0 ? 0.02 * c : -0.03 * Math.abs(c));
      const yTop = -0.46; // tucks neatly under waist belt (-0.38)
      const y = yTop + v * (yBot - yTop);

      // Width Rx (horizontal spread):
      // Waist starts at rx = 1.36, hips swell slightly to 1.40 around v=0.5, then tucks at base
      const rx = 1.36 + 0.06 * Math.sin(Math.PI * v) - 0.04 * v * v;
      let x = rx * s;

      // Depth Rz (anterior-posterior profile):
      let z = 0;
      if (c < 0) {
        // FRONT (abdomen, pelvis, fly):
        // Clean, flat, tailored military BDU pants profile - NO bulge!
        const frontRz = 0.90 * (1.0 - 0.05 * v);
        z = c * frontRz;
        // Zipper fly placket: crisp, flat central ridge (+0.025)
        if (Math.abs(x) < 0.22) {
          const flyPlacket = Math.cos((x / 0.22) * (Math.PI / 2));
          z -= 0.025 * flyPlacket * sm((0.85 - v) / 0.3);
        }
      } else {
        // BACK (buttocks / gluteal curve):
        // Two athletic, firm gluteal lobes centered around x = +-0.48
        const baseRz = 0.92;
        const peakV = 0.60; // Peak buttock prominence around y = -1.55
        const uy = (v - peakV) / (v < peakV ? 0.55 : 0.38);
        const bumpY = Math.sqrt(Math.max(0, 1 - uy * uy));

        const ux = (Math.abs(x) - 0.48) / 0.55;
        const bumpX = Math.sqrt(Math.max(0, 1 - ux * ux));

        const cleft = Math.exp(-Math.pow(x / 0.12, 2)); // Intergluteal cleft at midline
        const sideFalloff = sm((c - 0.15) / 0.6); // smooth transition towards hip flanks

        const gluteBulge = (0.26 * bumpX * bumpY - 0.08 * cleft * bumpY) * sideFalloff;
        z = c * (baseRz + gluteBulge);

        // Lower gluteal crease/fold tucking inward cleanly at bottom
        if (v > 0.8) {
          const tuck = sm((v - 0.8) / 0.2);
          z -= 0.06 * tuck * c;
        }
      }

      pos.push(x, y, z);
      uv.push((j / cols) * (2.0 / 2.2), y * 0.14);
    }
  }

  // Indices for main hip mantle
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * C1 + j;
      const b = a + C1;
      idx.push(a, b, a + 1);
      idx.push(a + 1, b, b + 1);
    }
  }

  // Crotch Gusset (khép đáy quần giữa hai chân phẳng phiu, nối đáy trước ra đáy sau):
  // Tạo dải đáy chữ U khép kín khoảng giữa hai chân (|x| < 0.25)
  // Điểm đáy trước: quanh j = cols/2 (ph = pi, c = -1)
  // Điểm đáy sau: quanh j = 0 (ph = 0, c = 1)
  // Bằng cách nối các đỉnh ở hàng cuối cùng (i = rows) giữa trước và sau ở dải giữa
  const botRow = rows * C1;
  // Cột trước trung tâm: jFront = cols / 2 = 28
  // Cột sau trung tâm: jBack = 0 (hoặc cols = 56)
  const jFront = Math.round(cols / 2);
  const bridgeWidth = 3; // Nối 3 bước lưới mỗi bên quanh trục giữa
  for (let k = 1; k <= bridgeWidth; k++) {
    const fR = botRow + jFront - k;
    const fL = botRow + jFront + k;
    const bR = botRow + k;
    const bL = botRow + cols - k;

    // Gusset quad between front and back
    idx.push(fR, bR, botRow + jFront - k + 1);
    idx.push(fL, botRow + jFront + k - 1, bL);
  }
  // Quad chính giữa
  idx.push(botRow + jFront, botRow, botRow + 1);
  idx.push(botRow + jFront, botRow + cols - 1, botRow);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  console.log('Hip geometry created successfully:');
  console.log('Vertex count:', pos.length / 3);
  console.log('Triangle count:', idx.length / 3);
  geo.computeBoundingBox();
  console.log('Bounding Box min:', geo.boundingBox.min);
  console.log('Bounding Box max:', geo.boundingBox.max);
  return geo;
}

createHipGeo();
