const fs = require('fs');
const vm = require('vm');

const sandbox = {
  console, Math, Float32Array, Uint16Array, Uint8Array, Uint32Array, Int32Array, Array, Object,
  document: {
    createElement: () => ({
      width: 512, height: 512,
      getContext: () => ({
        fillRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
        save: () => {}, restore: () => {}, translate: () => {},
        createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4) }),
        putImageData: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        moveTo: () => {}, lineTo: () => {}, closePath: () => {}, drawImage: () => {},
        getImageData: () => ({ data: new Uint8Array(256) })
      })
    })
  }
};
sandbox.ImageData = function(d, w, h){ this.data = d; this.width = w; this.height = h; };
sandbox.window = sandbox;

const threeCode = fs.readFileSync('three.min.js', 'utf8');
vm.runInNewContext(threeCode, sandbox);
const THREE = sandbox.THREE;

const soldierCode = fs.readFileSync('src/entities/soldier_model.js', 'utf8');
vm.runInNewContext(soldierCode, sandbox);

const figure = sandbox.SoldierModel.buildFigure('BLUE', { role: 'infantry', inHatch: false, renderOrder: 2 });
sandbox.SoldierModel.animateMotion(figure, 'aim', 0, 1);
figure.root.updateMatrixWorld(true);

let skinnedMeshes = [];
figure.root.traverse(o => {
  if (o.isSkinnedMesh) {
    skinnedMeshes.push(o);
  }
});
console.log('Total SkinnedMeshes:', skinnedMeshes.length);
skinnedMeshes.forEach((sm, idx) => {
  const p = sm.geometry.attributes.position;
  let minY = 99, maxY = -99;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  console.log('SM', idx, 'vtx:', p.count, 'Y range:', minY.toFixed(2), maxY.toFixed(2));
});
const torsoMesh = skinnedMeshes[0];  // Thân áo + tay áo
const pantsMesh = skinnedMeshes[14]; // Quần

console.log('--- Inspecting Pants Mesh (SM 14) ---');
const pP = pantsMesh.geometry.attributes.position;
const uvP = pantsMesh.geometry.attributes.uv;
let crotchUVs = [];
for (let i = 0; i < pP.count; i++) {
  const x = pP.getX(i), y = pP.getY(i), z = pP.getZ(i);
  if (Math.abs(x) < 0.25 && y > -2.6 && y < -1.4) {
    crotchUVs.push({ x: x.toFixed(3), y: y.toFixed(2), z: z.toFixed(2), u: uvP.getX(i).toFixed(3), v: uvP.getY(i).toFixed(3) });
  }
}
console.log('Crotch points in pants mesh:', crotchUVs.length);
console.log('Sample crotch UVs:');
crotchUVs.slice(0, 12).forEach(pt => console.log(' ', pt));

console.log('--- Inspecting Shoulder Mesh (SM 0) ---');
const pT = torsoMesh.geometry.attributes.position;
const skeleton = torsoMesh.skeleton;
const si = torsoMesh.geometry.attributes.skinIndex;
const sw = torsoMesh.geometry.attributes.skinWeight;
let shoulderSlice = [];
for (let i = 0; i < pT.count; i++) {
  const v = new THREE.Vector3().fromBufferAttribute(pT, i);
  const res = new THREE.Vector3();
  for (let j = 0; j < 4; j++) {
    const w = sw.array[i * 4 + j];
    if (w > 0.001) {
      const bIdx = si.array[i * 4 + j];
      const skinMat = new THREE.Matrix4().multiplyMatrices(skeleton.bones[bIdx].matrixWorld, skeleton.boneInverses[bIdx]);
      res.addScaledVector(v.clone().applyMatrix4(skinMat), w);
    }
  }
  const wPos = res.applyMatrix4(torsoMesh.matrixWorld);
  if (wPos.x < -1.1 && wPos.y > 2.5 && wPos.y < 2.9) {
    shoulderSlice.push({ x: wPos.x.toFixed(2), y: wPos.y.toFixed(2), z: wPos.z.toFixed(2) });
  }
}
console.log('Shoulder points around y ~ 2.7 in SM 0:', shoulderSlice.length);
shoulderSlice.sort((a, b) => a.z - b.z);
console.log('Front-most shoulder pts (Z min):', shoulderSlice.slice(0, 5));
console.log('Rear-most shoulder pts (Z max - BẢ VAI SAU):', shoulderSlice.slice(-5));

