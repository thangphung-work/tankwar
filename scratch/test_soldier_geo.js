// scratch/test_soldier_geo.js
const fs = require('fs');
const vm = require('vm');

// Mock browser environment for Three.js and SoldierModel
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
  Set,
  Map,
  window: {},
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

console.log('SoldierModel loaded successfully:', typeof sandbox.SoldierModel);
const figure = sandbox.SoldierModel.buildFigure('BLUE', { role: 'infantry' });
console.log('Figure built successfully. Total meshes:', figure.meshes.length);
let triCount = 0;
figure.root.traverse(o => {
  if (o.isMesh && o.geometry) {
    const cnt = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    triCount += cnt;
  }
});
console.log('Total triangles in root:', triCount);

const scene = new sandbox.THREE.Scene();
scene.add(figure.root);
console.log('Testing setCasualty(figure, true)...');
sandbox.SoldierModel.setCasualty(figure, true);
console.log('Casualty root position:', figure.root.position);
console.log('Casualty root rotation:', figure.root.rotation);
console.log('Bloodpool visible:', figure._bloodPool ? figure._bloodPool.visible : false);

console.log('Testing setCasualty(figure, false)...');
sandbox.SoldierModel.setCasualty(figure, false);
console.log('Recovered root position:', figure.root.position);
console.log('Bloodpool visible:', figure._bloodPool ? figure._bloodPool.visible : false);
