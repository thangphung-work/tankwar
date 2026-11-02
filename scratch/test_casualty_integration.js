// scratch/test_casualty_integration.js
const fs = require('fs');
const vm = require('vm');

const sandbox = {
  console, Math, Float32Array, Uint16Array, Uint8Array, Uint32Array, Int32Array, Array, Object, Set, Map, window: {},
  document: { createElement: () => ({ getContext: () => ({ createImageData: () => ({ data: new Uint8Array(128 * 128 * 4) }), putImageData: () => {}, fillStyle: '', fillRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }), createLinearGradient: () => ({ addColorStop: () => {} }), beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, save: () => {}, restore: () => {}, translate: () => {} }) }) }
};
sandbox.window = sandbox;

const threeCode = fs.readFileSync('three.min.js', 'utf8');
vm.runInNewContext(threeCode, sandbox);
let code = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

// Thêm hàm setCasualty vào code
const casualtyFunc = `
  /**
   * Đặt trạng thái hy sinh (tử trận) chân thực cho người lính
   * @param {Object} F - Thực thể binh sĩ (từ buildFigure)
   * @param {boolean} isDead - true nếu hy sinh, false nếu phục hồi khỏe mạnh
   */
  function setCasualty(F, isDead) {
    if (!F || !F.root) return;
    F.isDead = isDead;
    for (const s of F.soak || []) s.visible = isDead;

    if (!F._bloodPool && F.root.parent) {
      const bGeo = new THREE.PlaneGeometry(5.2, 4.2, 8, 8);
      const bp = bGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i), y = bp.getY(i), r = Math.hypot(x, y);
        if (r > 0.4) {
          const a = Math.atan2(y, x);
          const noise = 1 + 0.18 * Math.sin(a * 5 + 1.2) + 0.12 * Math.cos(a * 3);
          bp.setXY(i, x * noise, y * noise);
        }
      }
      bGeo.computeVertexNormals();
      const bMat = new THREE.MeshStandardMaterial({
        color: 0x220404,
        roughness: 0.42,
        metalness: 0.1,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4
      });
      F._bloodPool = new THREE.Mesh(bGeo, bMat);
      F._bloodPool.rotation.x = -Math.PI / 2;
      F._bloodPool.position.set(0.2, FOOT_Y + 0.02, 0.4);
      F.root.parent.add(F._bloodPool);
    }
    if (F._bloodPool) F._bloodPool.visible = isDead;

    if (!isDead) {
      F.root.rotation.set(0, 0, 0);
      F.root.position.set(0, 0, 0);
      F.hips.position.set(0, 0, 0);
      F.hips.rotation.set(0, 0, 0);
      F.torso.position.set(0, 0, 0);
      F.torso.rotation.set(0, 0, 0);
      F.head.rotation.set(0, 0, 0);
      if (F.rifle) {
        F.rifle.position.set(0, 0, 0);
        F.rifle.rotation.set(0, 0, 0);
        F.rifle.visible = true;
      }
      for (const L of F.legs) {
        L.leg.rotation.set(0, 0, 0);
        L.knee.rotation.set(0, 0, 0);
        L.ankle.rotation.set(0, 0, 0);
      }
      for (const A of F.arms) {
        A.up.rotation.set(0, 0, 0);
        A.fore.rotation.set(0, 0, 0);
        A.hand.rotation.set(0, 0, 0);
      }
      F.root.updateMatrixWorld(true);
      return;
    }

    // TƯ THẾ HY SINH: Ngã nằm nghiêng sấp trên mặt đất
    F.root.rotation.set(-Math.PI / 2 * 0.95, 0.25, -0.15, 'YXZ');

    F.legs[0].leg.rotation.set(0.25, 0.2, 0.2);
    F.legs[0].knee.rotation.set(0.55, 0, 0);
    F.legs[0].ankle.rotation.set(-0.2, 0, -0.15);

    F.legs[1].leg.rotation.set(0.1, -0.3, -0.25);
    F.legs[1].knee.rotation.set(0.75, 0, 0);
    F.legs[1].ankle.rotation.set(-0.15, 0, 0.1);

    F.head.rotation.set(0.35, 0.45, -0.2);

    if (F.rifle) {
      F.rifle.position.set(1.5, 0.3, -1.2);
      F.rifle.rotation.set(-0.3, 0.5, -1.4);
      F.rifle.visible = true;
    }
    if (F.arms[1]) {
      F.arms[1].up.rotation.set(0.2, 0.3, -0.5);
      F.arms[1].fore.rotation.set(0.4, 0.1, 0);
      F.arms[1].hand.rotation.set(0.1, 0, -0.2);
    }
    if (F.arms[0]) {
      F.arms[0].up.rotation.set(-0.1, -0.3, 0.6);
      F.arms[0].fore.rotation.set(0.8, -0.2, 0);
      F.arms[0].hand.rotation.set(0.2, 0, 0.1);
    }

    F.root.position.set(0, 0, 0);
    F.root.updateMatrixWorld(true);

    let curMinY = Infinity;
    F.root.traverse(o => {
      if (o.isMesh && o.geometry && o.geometry.attributes.position) {
        const p = o.geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i += 15) {
          v.fromBufferAttribute(p, i);
          o.localToWorld(v);
          if (v.y < curMinY) curMinY = v.y;
        }
      }
    });

    const shiftY = FOOT_Y - curMinY;
    F.root.position.set(0, shiftY, 0.3);
    F.root.updateMatrixWorld(true);
  }
`;

code = code.replace(
  '  return {\n    buildFigure,',
  casualtyFunc + '\n  return {\n    buildFigure,\n    setCasualty,'
);

vm.runInNewContext(code, sandbox);

const SM = sandbox.SoldierModel;
const scene = new sandbox.THREE.Scene();
const figure = SM.buildFigure('BLUE', { role: 'infantry' });
scene.add(figure.root);

console.log('Testing setCasualty true:');
SM.setCasualty(figure, true);
console.log('Fallen root.pos.y =', figure.root.position.y);
console.log('Rifle pos =', figure.rifle.position);
console.log('BloodPool created =', !!figure._bloodPool);

console.log('Testing setCasualty false:');
SM.setCasualty(figure, false);
console.log('Revived root.pos.y =', figure.root.position.y);
