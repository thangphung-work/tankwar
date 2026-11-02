// scratch/apply_casualty_fix.js
const fs = require('fs');

// 1. Cập nhật soldier_model.js
let smCode = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

const casualtyFunc = `  /**
   * Đặt trạng thái hy sinh (tử trận) chân thực cho người lính
   * @param {Object} F - Thực thể binh sĩ (từ buildFigure)
   * @param {boolean} isDead - true nếu hy sinh, false nếu phục hồi khỏe mạnh
   */
  function setCasualty(F, isDead) {
    if (!F || !F.root) return;
    F.isDead = isDead;
    for (const s of F.soak || []) s.visible = isDead;

    // Vũng máu dã chiến loang trên mặt đất xung quanh ngực và thân
    if (!F._bloodPool && F.root.parent) {
      const bGeo = new THREE.PlaneGeometry(5.4, 4.4, 12, 12);
      const bp = bGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i), y = bp.getY(i), r = Math.hypot(x, y);
        if (r > 0.35) {
          const a = Math.atan2(y, x);
          const noise = 1 + 0.22 * Math.sin(a * 5 + 1.2) + 0.14 * Math.cos(a * 3 - 0.6);
          bp.setXY(i, x * noise, y * noise);
        }
      }
      bGeo.computeVertexNormals();
      const bMat = new THREE.MeshStandardMaterial({
        color: 0x1f0303,
        roughness: 0.35,
        metalness: 0.12,
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
      // Phục hồi tư thế đứng thẳng, nhặt lại súng
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

    // TƯ THẾ HY SINH CHÂN THỰC: Ngã nằm nghiêng sấp người trên mặt đất dã chiến
    // 1. Thân người ngã xuống mặt sàn
    F.root.rotation.set(-Math.PI / 2 * 0.95, 0.25, -0.15, 'YXZ');

    // 2. Hai chân buông lỏng tự nhiên (chân dưới co nhẹ gối, chân trên duỗi xuôi theo thân)
    F.legs[0].leg.rotation.set(0.25, 0.2, 0.2);
    F.legs[0].knee.rotation.set(0.55, 0, 0);
    F.legs[0].ankle.rotation.set(-0.2, 0, -0.15);

    F.legs[1].leg.rotation.set(0.1, -0.3, -0.25);
    F.legs[1].knee.rotation.set(0.75, 0, 0);
    F.legs[1].ankle.rotation.set(-0.15, 0, 0.1);

    // 3. Đầu gục áp má xuống cát
    F.head.rotation.set(0.35, 0.45, -0.2);

    // 4. Hai tay buông xuôi, súng rơi khỏi tay nằm nghiêng trên mặt đất
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

    // 5. Căn chỉnh chuẩn xác độ cao để cơ thể nằm áp mặt sàn FOOT_Y
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
  }`;

// Chuẩn hóa CRLF để chèn vào cuối SoldierModel
smCode = smCode.replace(/\r\n/g, '\n');

if (!smCode.includes('function setCasualty')) {
  const insertMarker = '  return {\n    buildFigure,';
  if (!smCode.includes(insertMarker)) throw new Error('Cannot find insertMarker in soldier_model.js');
  smCode = smCode.replace(
    insertMarker,
    casualtyFunc + '\n\n  return {\n    buildFigure,\n    setCasualty,'
  );
  fs.writeFileSync('src/entities/soldier_model.js', smCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added setCasualty to soldier_model.js');
}

// 2. Cập nhật soldier_lab.html
let labCode = fs.readFileSync('soldier_lab.html', 'utf8').replace(/\r\n/g, '\n');

// Cập nhật rebuildFigure để dọn dẹp _bloodPool
const oldRebuild = `  function rebuildFigure() {
    if (figure && figure.root) {
      scene.remove(figure.root);
    }
    figure = SoldierModel.buildFigure(S.team, { role: 'infantry', inHatch: false, renderOrder: 2 });
    figure.root.position.set(0, 0, 0);
    scene.add(figure.root);
    applyStatus();
    rebuildHitboxes();
  }`;

const newRebuild = `  function rebuildFigure() {
    if (figure) {
      if (figure._bloodPool) scene.remove(figure._bloodPool);
      if (figure.root) scene.remove(figure.root);
    }
    figure = SoldierModel.buildFigure(S.team, { role: 'infantry', inHatch: false, renderOrder: 2 });
    figure.root.position.set(0, 0, 0);
    scene.add(figure.root);
    applyStatus();
    rebuildHitboxes();
  }`;

// Cập nhật applyStatus
const oldApplyStatus = `  function applyStatus() {
    if (!figure) return;
    const isDead = S.status === 'dead';
    for (const s of figure.soak || []) {
      s.visible = isDead;
    }
    if (isDead) {
      figure.head.rotation.x = 0.6;
      figure.head.rotation.z = 0.3;
      figure.torso.rotation.x = 0.4;
    } else {
      figure.head.rotation.set(0, 0, 0);
      figure.torso.rotation.set(0, 0, 0);
    }
  }`;

const newApplyStatus = `  let targetCamY = -1.4;
  function applyStatus() {
    if (!figure) return;
    const isDead = S.status === 'dead';
    SoldierModel.setCasualty(figure, isDead);
    targetCamY = isDead ? FLOOR_Y + 1.8 : -1.4;
  }`;

// Cập nhật animate để camera lướt mượt theo targetCamY
const oldCamPos = `    const cp = Math.cos(view.pitch);
    const tx = view.tx || 0, tz = view.tz || 0;
    cam.position.set(
      tx + Math.sin(view.yaw) * cp * view.dist,
      view.y + Math.sin(view.pitch) * view.dist,
      tz - Math.cos(view.yaw) * cp * view.dist
    );
    cam.lookAt(tx, view.y, tz);`;

const newCamPos = `    view.y += (targetCamY - view.y) * 0.08;
    const cp = Math.cos(view.pitch);
    const tx = view.tx || 0, tz = view.tz || 0;
    cam.position.set(
      tx + Math.sin(view.yaw) * cp * view.dist,
      view.y + Math.sin(view.pitch) * view.dist,
      tz - Math.cos(view.yaw) * cp * view.dist
    );
    cam.lookAt(tx, view.y, tz);`;

if (labCode.includes(oldRebuild)) labCode = labCode.replace(oldRebuild, newRebuild);
if (labCode.includes(oldApplyStatus)) labCode = labCode.replace(oldApplyStatus, newApplyStatus);
if (labCode.includes(oldCamPos)) labCode = labCode.replace(oldCamPos, newCamPos);

fs.writeFileSync('soldier_lab.html', labCode.replace(/\n/g, '\r\n'), 'utf8');
console.log('Updated soldier_lab.html with realistic casualty pose and smooth camera focus!');
