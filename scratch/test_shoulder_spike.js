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

let pts = [];
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
  // Khảo sát các điểm ở chỏm vai ngoài: x < -1.4, y > 2.4
  if (wPos.x < -1.4 && wPos.y > 2.4) {
    pts.push({ idx: i, x: wPos.x, y: wPos.y, z: wPos.z, origY: v.y, origZ: v.z });
  }
}

// Tìm điểm cao nhất của chỏm vai
pts.sort((a, b) => b.y - a.y);
console.log('Highest 10 points in shoulder:');
pts.slice(0, 10).forEach(p => {
  console.log('  wPos:', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'orig:', p.origY.toFixed(2), p.origZ.toFixed(2));
});

console.log('--- Inspecting deformation at highest point ---');
const topPt = pts[0];
const idx = topPt.idx;
console.log('Pt idx:', idx, 'pos:', pT.getX(idx).toFixed(2), pT.getY(idx).toFixed(2), pT.getZ(idx).toFixed(2));
for (let j = 0; j < 4; j++) {
  const w = sw.array[idx * 4 + j];
  const bIdx = si.array[idx * 4 + j];
  const bone = skeleton.bones[bIdx];
  console.log('Bone', j, 'idx:', bIdx, 'weight:', w.toFixed(3), 'pos:', bone.position, 'rot:', bone.rotation);
}
