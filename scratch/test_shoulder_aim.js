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
        save: () => {},
        restore: () => {},
        translate: () => {},
        createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4) }),
        putImageData: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8Array(256) })
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

// Chạy tư thế aim
sandbox.SoldierModel.animateMotion(figure, 'aim', 0, 1);
figure.root.updateMatrixWorld(true);

// Kiểm tra xương đòn clav và xương cánh tay up
console.log('--- Bones in AIM mode ---');
const arms = figure.arms;
for (let i = 0; i < arms.length; i++) {
  const a = arms[i];
  console.log('Arm', i, 's:', a.s);
  console.log('  clav pos:', a.clav.position, 'rot:', a.clav.rotation);
  console.log('  up pos:', a.up.position, 'rot:', a.up.rotation);
}

// Kiểm tra các mesh SkinnedMesh của vai/tay sau khi animate
console.log('--- Meshes attached to chest ---');
figure.chest.traverse(o => {
  if (o.isMesh) {
    console.log('Mesh under chest:', o.name || 'unnamed', 'vtx:', o.geometry.attributes.position.count, 'mat:', o.material.name);
  }
});
