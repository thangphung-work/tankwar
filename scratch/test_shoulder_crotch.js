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

const figure = sandbox.SoldierModel.buildFigure('BLUE', { role: 'infantry', inHatch: false, bake: false });

console.log('--- Checking meshes with bake: false ---');
let meshList = [];
figure.root.traverse(o => {
  if (o.isMesh) {
    meshList.push({
      parent: o.parent ? o.parent.name || o.parent.type : 'none',
      vtx: o.geometry.attributes.position.count,
      uv: o.geometry.attributes.uv ? o.geometry.attributes.uv.count : 0
    });
  }
});
console.log('Total meshes:', meshList.length);
figure.root.traverse(o => {
  if (o.isMesh && o.geometry.attributes.position.count > 1000) {
    let p = o.geometry.attributes.position;
    let minX=99, maxX=-99, minY=99, maxY=-99, minZ=99, maxZ=-99;
    for(let i=0; i<p.count; i++){
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if(x < minX) minX = x; if(x > maxX) maxX = x;
      if(y < minY) minY = y; if(y > maxY) maxY = y;
      if(z < minZ) minZ = z; if(z > maxZ) maxZ = z;
    }
    console.log('Mesh > 1000 vtx:', o.name, 'count:', p.count, 'X:', minX.toFixed(2), maxX.toFixed(2), 'Y:', minY.toFixed(2), maxY.toFixed(2), 'Z:', minZ.toFixed(2), maxZ.toFixed(2));
  }
});
