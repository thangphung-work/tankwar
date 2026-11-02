const fs = require('fs');
const vm = require('vm');

const sandbox = {
  console,
  Math,
  Float32Array,
  Uint16Array,
  Uint8Array,
  Uint32Array,
  Int32Array,
  Array,
  Object,
  document: {
    createElement: () => ({
      width: 512,
      height: 512,
      getContext: () => ({
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
moveTo: () => {},
lineTo: () => {},
closePath: () => {},
drawImage: () => {},
getImageData: () => ({ data: new Uint8Array(256) }),
        save: () => {},
        restore: () => {},
        translate: () => {},
        createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4) }),
        putImageData: () => {},
createRadialGradient: () => ({ addColorStop: () => {} }),
createLinearGradient: () => ({ addColorStop: () => {} })
      })
    })
  }
};
sandbox.ImageData = function(d, w, h){ this.data = d; this.width = w; this.height = h; };
sandbox.window = sandbox;

const threeCode = fs.readFileSync('three.min.js', 'utf8');
vm.runInNewContext(threeCode, sandbox);

const soldierCode = fs.readFileSync('src/entities/soldier_model.js', 'utf8');
vm.runInNewContext(soldierCode, sandbox);

const figure = sandbox.SoldierModel.buildFigure('BLUE', { role: 'infantry', inHatch: false, renderOrder: 2 });

console.log('--- Inspecting figure meshes ---');
figure.root.traverse(o => {
  if (o.isMesh && o.geometry) {
    const p = o.geometry.attributes.position;
    const uv = o.geometry.attributes.uv;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
    }
    console.log('Mesh:', o.name || 'unnamed', 'Vtx:', p.count, 'UV bounds: U[' + minU.toFixed(2) + '..' + maxU.toFixed(2) + '] V[' + minV.toFixed(2) + '..' + maxV.toFixed(2) + ']');
  }
});
