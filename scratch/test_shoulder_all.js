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
figure.root.traverse(o => { if (o.isSkinnedMesh) skinnedMeshes.push(o); });
const torsoMesh = skinnedMeshes[0];
const pT = torsoMesh.geometry.attributes.position;
const skeleton = torsoMesh.skeleton;
const si = torsoMesh.geometry.attributes.skinIndex;
const sw = torsoMesh.geometry.attributes.skinWeight;

// Quét toàn bộ các đỉnh ở vai trái (x từ -2.2 đến -1.3, y từ 2.3 đến 3.5, z từ -1.5 đến 0.5)
let shoulderPts = [];
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
  if (wPos.x < -1.25 && wPos.y > 2.4 && wPos.z < 0) {
    shoulderPts.push({ idx: i, x: wPos.x, y: wPos.y, z: wPos.z, orig: v });
  }
}

shoulderPts.sort((a, b) => b.y - a.y);
console.log('Top 15 shoulder points on left side (front/outer):');
shoulderPts.slice(0, 15).forEach(p => {
  console.log('  wPos:', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'orig:', p.orig.x.toFixed(2), p.orig.y.toFixed(2), p.orig.z.toFixed(2));
});
