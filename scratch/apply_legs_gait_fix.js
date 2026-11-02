// scratch/apply_legs_gait_fix.js
const fs = require('fs');

let code = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

// 1. Cập nhật hipGeo: khung chậu nở rộng 1.44 -> 1.50, hốc bẹn rộng hơn
const oldHipGeo = `  function hipGeo() {
    if (GEO.hip) return GEO.hip;
    // Khung chậu & đũng quần: lưới tham số chuẩn giải phẫu học
    // Thắt lưng trên vừa vặn dưới đai, mặt trước phẳng phiu có nẹp khóa quần,
    // hai bên hông khoét vòm bẹn tròn ôm trọn đầu đùi, phía sau có cơ mông nở nang tròn trịa
    const rows = 28, cols = 56;
    const pos = [], uv = [], idx = [];
    const C1 = cols + 1;

    for (let i = 0; i <= rows; i++) {
      const v = i / rows;
      for (let j = 0; j <= cols; j++) {
        const ph = (j / cols) * Math.PI * 2;
        const c = Math.cos(ph); // 1 = sau (+z), -1 = trước (-z)
        const s = Math.sin(ph); // 1 = phải (+x), -1 = trái (-x)

        // Đường viền mép đáy: phía trước đũng quần và sau nếp mông phủ xuống -1.92,
        // hai bên bẹn uốn cong hình vòm lên -1.52 để đầu đùi lọt vào
        const yBot = -1.92 + 0.40 * (s * s) + (c > 0 ? 0.02 * c : -0.03 * Math.abs(c));
        const yTop = -0.46; // ăn sâu dưới đai thắt lưng (-0.38)
        const y = yTop + v * (yBot - yTop);

        // Bề ngang hông: thắt lưng 1.36, nở nhẹ ở giữa hông 1.40 rồi ôm gọn
        const rx = 1.36 + 0.06 * Math.sin(Math.PI * v) - 0.04 * v * v;
        let x = rx * s;

        // Bề sâu trước - sau:
        let z = 0;
        if (c < 0) {
          // Phía trước: phẳng phiu, đứng form quân trang dã chiến, nẹp khóa quần phẳng gọn
          const frontRz = 0.90 * (1.0 - 0.05 * v);
          z = c * frontRz;
          if (Math.abs(x) < 0.22) {
            const flyPlacket = Math.cos((x / 0.22) * (Math.PI / 2));
            z -= 0.025 * flyPlacket * sm((0.85 - v) / 0.3);
          }
        } else {
          // Phía sau: hai múi cơ mông nở nang, cong tròn đều đặn
          const baseRz = 0.92;
          const peakV = 0.60;
          const uy = (v - peakV) / (v < peakV ? 0.55 : 0.38);
          const bumpY = Math.sqrt(Math.max(0, 1 - uy * uy));

          const ux = (Math.abs(x) - 0.48) / 0.55;
          const bumpX = Math.sqrt(Math.max(0, 1 - ux * ux));

          const cleft = Math.exp(-Math.pow(x / 0.12, 2));
          const sideFalloff = sm((c - 0.15) / 0.6);

          const gluteBulge = (0.26 * bumpX * bumpY - 0.08 * cleft * bumpY) * sideFalloff;
          z = c * (baseRz + gluteBulge);

          if (v > 0.8) {
            const tuck = sm((v - 0.8) / 0.2);
            z -= 0.06 * tuck * c;
          }
        }

        pos.push(x, y, z);
        uv.push((j / cols) * (2.0 / 2.2), y * 0.14);
      }
    }

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * C1 + j;
        const b = a + C1;
        idx.push(a, b, a + 1);
        idx.push(a + 1, b, b + 1);
      }
    }

    // Dải đáy quần khép kín giữa hai chân nối từ trước ra sau
    const botRow = rows * C1;
    const jFront = Math.round(cols / 2);
    const bridgeWidth = 3;
    for (let k = 1; k <= bridgeWidth; k++) {
      const fR = botRow + jFront - k;
      const fL = botRow + jFront + k;
      const bR = botRow + k;
      const bL = botRow + cols - k;

      idx.push(fR, bR, botRow + jFront - k + 1);
      idx.push(fL, botRow + jFront + k - 1, bL);
    }
    idx.push(botRow + jFront, botRow, botRow + 1);
    idx.push(botRow + jFront, botRow + cols - 1, botRow);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.hip = g);
  }`;

const newHipGeo = `  function hipGeo() {
    if (GEO.hip) return GEO.hip;
    // Khung chậu & đũng quần: lưới tham số chuẩn giải phẫu học, bề ngang nở rộng cân đối với giáp ngực
    // Mặt trước phẳng phiu có nẹp khóa quần, hai bên hông khoét vòm bẹn rộng đón bắp đùi to khỏe,
    // phía sau có cơ mông nở nang tròn trịa
    const rows = 28, cols = 56;
    const pos = [], uv = [], idx = [];
    const C1 = cols + 1;

    for (let i = 0; i <= rows; i++) {
      const v = i / rows;
      for (let j = 0; j <= cols; j++) {
        const ph = (j / cols) * Math.PI * 2;
        const c = Math.cos(ph); // 1 = sau (+z), -1 = trước (-z)
        const s = Math.sin(ph); // 1 = phải (+x), -1 = trái (-x)

        // Đường viền mép đáy: phía trước đũng quần và sau nếp mông phủ xuống -1.95,
        // hai bên bẹn uốn cong hình vòm lên -1.48 để đón bắp đùi to
        const yBot = -1.95 + 0.47 * (s * s) + (c > 0 ? 0.02 * c : -0.03 * Math.abs(c));
        const yTop = -0.44;
        const y = yTop + v * (yBot - yTop);

        // Bề ngang hông: thắt lưng 1.44, nở rộng 1.50 ở ngang khớp chậu
        const rx = 1.44 + 0.08 * Math.sin(Math.PI * v) - 0.04 * v * v;
        let x = rx * s;

        let z = 0;
        if (c < 0) {
          // Phía trước: phẳng phiu, đứng form quân trang dã chiến dày dặn
          const frontRz = 0.96 * (1.0 - 0.05 * v);
          z = c * frontRz;
          if (Math.abs(x) < 0.24) {
            const flyPlacket = Math.cos((x / 0.24) * (Math.PI / 2));
            z -= 0.03 * flyPlacket * sm((0.85 - v) / 0.3);
          }
        } else {
          // Phía sau: hai múi cơ mông nở nang, cong tròn đều đặn
          const baseRz = 0.98;
          const peakV = 0.60;
          const uy = (v - peakV) / (v < peakV ? 0.55 : 0.38);
          const bumpY = Math.sqrt(Math.max(0, 1 - uy * uy));

          const ux = (Math.abs(x) - 0.50) / 0.58;
          const bumpX = Math.sqrt(Math.max(0, 1 - ux * ux));

          const cleft = Math.exp(-Math.pow(x / 0.13, 2));
          const sideFalloff = sm((c - 0.15) / 0.6);

          const gluteBulge = (0.30 * bumpX * bumpY - 0.08 * cleft * bumpY) * sideFalloff;
          z = c * (baseRz + gluteBulge);

          if (v > 0.8) {
            const tuck = sm((v - 0.8) / 0.2);
            z -= 0.06 * tuck * c;
          }
        }

        pos.push(x, y, z);
        uv.push((j / cols) * (2.0 / 2.2), y * 0.14);
      }
    }

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * C1 + j;
        const b = a + C1;
        idx.push(a, b, a + 1);
        idx.push(a + 1, b, b + 1);
      }
    }

    const botRow = rows * C1;
    const jFront = Math.round(cols / 2);
    const bridgeWidth = 3;
    for (let k = 1; k <= bridgeWidth; k++) {
      const fR = botRow + jFront - k;
      const fL = botRow + jFront + k;
      const bR = botRow + k;
      const bL = botRow + cols - k;

      idx.push(fR, bR, botRow + jFront - k + 1);
      idx.push(fL, botRow + jFront + k - 1, bL);
    }
    idx.push(botRow + jFront, botRow, botRow + 1);
    idx.push(botRow + jFront, botRow + cols - 1, botRow);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.hip = g);
  }`;

// 2. Cập nhật thighGeo & shinGeo: tăng bán kính, dày dặn, bắp đùi cơ bắp, quần dã chiến thụng
const oldLegGeos = `  // Đùi: đầu trên là chỏm cầu vòm tròn đồng tâm quanh khớp hông (0, 0, 0), lồng trọn trong hốc bẹn
  // Khi quỳ 90° hay chạy nhảy, chỏm cầu xoay tròn tại chỗ mà không hở khe, không cộm, không xẹp bẹp
  const thighGeo = () => hangGeo('thigh',
    [[0, -0.145], [0.30, -0.12], [0.50, -0.08], [0.60, -0.04], [0.65, 0.0], [0.64, 0.15], [0.61, 0.35], [0.57, 0.55], [0.52, 0.75], [0.48, 0.92], [0.47, 1.0], [0.0, 1.02]], THIGH_L,
    (t, c) => (c < 0 ? -0.04 : 0.01) * Math.sin(Math.PI * Math.min(1, Math.max(0, t) * 1.1)),
    (t, a) => 0.008 * Math.sin(t * 18 + Math.sin(a * 2)), 1);

  // Cẳng chân: đầu trên có chỏm vòm gối lồng trong ống đùi, bắp chân sau phồng nhẹ, cổ chân thon gọn
  const shinGeo = () => hangGeo('shin',
    [[0, -0.11], [0.32, -0.08], [0.42, -0.04], [0.46, 0.0], [0.45, 0.20], [0.42, 0.40], [0.38, 0.65], [0.35, 0.85], [0.0, 0.90]], SHIN_L,
    (t, c) => c > 0 ? 0.08 * c * Math.exp(-Math.pow((t - 0.28) / 0.16, 2)) : 0,
    (t, a) => 0.006 * Math.sin(t * 20 + Math.sin(a * 2)), 1);`;

const newLegGeos = `  // Đùi dã chiến to khỏe, cơ bắp: đầu trên là chỏm cầu vòm tròn đồng tâm quanh khớp hông (0, 0, 0), lồng trọn trong hốc bẹn
  // Phom quần dã chiến thụng dày dặn, bắp đùi nở nang cân đối hoàn hảo với áo giáp ngực
  const thighGeo = () => hangGeo('thigh',
    [[0, -0.145], [0.36, -0.12], [0.62, -0.08], [0.74, -0.04], [0.80, 0.0], [0.78, 0.18], [0.74, 0.40], [0.69, 0.60], [0.64, 0.80], [0.59, 0.94], [0.58, 1.0], [0.0, 1.02]], THIGH_L,
    (t, c) => (c < 0 ? -0.05 : 0.02) * Math.sin(Math.PI * Math.min(1, Math.max(0, t) * 1.1)),
    (t, a) => 0.012 * Math.sin(t * 16 + Math.sin(a * 2)), 1);

  // Cẳng chân dã chiến to khỏe: đầu trên có chỏm gối lồng trong ống đùi, bắp chân sau nở nang, cổ chân dày dặn
  const shinGeo = () => hangGeo('shin',
    [[0, -0.11], [0.38, -0.08], [0.50, -0.04], [0.56, 0.0], [0.54, 0.22], [0.50, 0.45], [0.46, 0.68], [0.42, 0.86], [0.0, 0.90]], SHIN_L,
    (t, c) => c > 0 ? 0.11 * c * Math.exp(-Math.pow((t - 0.28) / 0.16, 2)) : 0,
    (t, a) => 0.008 * Math.sin(t * 18 + Math.sin(a * 2)), 1);`;

// 3. Trong buildFigure: đùi scale hình elip dày dặn theo trục Z, túi hộp to ôm đùi, vải túm phồng bọc cổ giày
const oldBuildFigureLegs = `    const legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * HIP_X, HIP_Y, 0.06);
      leg.rotation.set(0, 0, sx * 0.035);
      hips.add(leg);

      const thigh = add(leg, thighGeo(), pantsMat, 0, 0, 0);
      // túi hộp bên đùi (quần chiến đấu) + nắp + khuy cong ôm sát đùi
      add(leg, patchGeo(0.66, sx * Math.PI / 2, 1.05, 0.95, 0.07), pocketMat, 0, -1.55, 0.02);
      add(leg, patchGeo(0.69, sx * Math.PI / 2, 1.12, 0.26, 0.03), pocketMat, 0, -1.08, 0.02);
      add(leg, rbox(0.04, 0.07, 0.14), M.knuck, sx * 0.73, -1.13, 0.02, 0, 0, 0);
      // túi nhỏ trước đùi
      add(leg, patchGeo(0.68, Math.PI + sx * 0.35, 0.75, 0.5, 0.03), pocketMat, 0, -0.75, 0);

      const knee = new THREE.Group();
      knee.position.set(0, -THIGH_L, -0.03);
      leg.add(knee);
      // gối: mảng đệm gối chiến thuật bảo vệ che kín khe khớp khi gập
      add(knee, kneePanelGeo(), pocketMat, 0, 0, 0);
      add(knee, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), padMat, 0, -0.3, -0.5, -Math.PI / 2, 0, 0).scale.set(0.28, 0.05, 0.14);

      add(knee, shinGeo(), shinMat, 0, 0, 0);
      // ống quần túm phồng trên cổ giày
      add(knee, new THREE.SphereGeometry(1, 18, 10), shinMat, 0, -SHIN_L + 1.1, 0.02).scale.set(0.385, 0.13, 0.42);`;

const newBuildFigureLegs = `    const legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * HIP_X, HIP_Y, 0.06);
      leg.rotation.set(0, 0, sx * 0.035);
      hips.add(leg);

      const thigh = add(leg, thighGeo(), pantsMat, 0, 0, 0);
      thigh.scale.set(0.96, 1, 1.16); // mặt cắt elip: ngang vừa khít bẹn, sâu dầy dặn cơ bắp nhìn từ góc nghiêng
      // túi hộp bên đùi dã chiến + nắp + khuy ôm sát sườn đùi to
      add(leg, patchGeo(0.80, sx * Math.PI / 2, 1.05, 0.95, 0.08), pocketMat, 0, -1.55, 0.02);
      add(leg, patchGeo(0.83, sx * Math.PI / 2, 1.12, 0.26, 0.03), pocketMat, 0, -1.08, 0.02);
      add(leg, rbox(0.04, 0.07, 0.14), M.knuck, sx * 0.86, -1.13, 0.02, 0, 0, 0);
      // túi trước đùi
      add(leg, patchGeo(0.82, Math.PI + sx * 0.35, 0.75, 0.5, 0.03), pocketMat, 0, -0.75, 0);

      const knee = new THREE.Group();
      knee.position.set(0, -THIGH_L, -0.03);
      leg.add(knee);
      // gối: mảng đệm gối chiến thuật bảo vệ che kín khe khớp khi gập
      add(knee, kneePanelGeo(), pocketMat, 0, 0, 0);
      add(knee, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), padMat, 0, -0.3, -0.5, -Math.PI / 2, 0, 0).scale.set(0.32, 0.06, 0.16);

      const shin = add(knee, shinGeo(), shinMat, 0, 0, 0);
      shin.scale.set(1.02, 1, 1.10);
      // ống quần túm phồng trùm phủ cổ giày bốt: loại bỏ cảm giác que tăm cắm vào giày
      add(knee, new THREE.SphereGeometry(1, 18, 10), shinMat, 0, -SHIN_L + 1.1, 0.02).scale.set(0.48, 0.16, 0.52);`;

// 4. SOLE và plantFeet: cập nhật điểm tiếp xúc và đồng bộ ma trận
const oldPlantFeet = `  const SOLE = [V(0, -ANKLE_H, 0.45), V(0, -ANKLE_H, -1.1), V(0, -ANKLE_H + 0.1, -1.66), V(0, 0.15, 0.5)];

  function setLeg(L, hip, knee, foot, splay = 0.035) {
    L.leg.rotation.set(hip, 0, L.sx * splay);
    L.knee.rotation.set(knee, 0, 0);
    L.ankle.rotation.set(foot - hip - knee, 0, 0);
  }

  // hạ / nâng cả thân để đế giày thấp nhất chạm đúng FOOT_Y (hệ root) — chân luôn bám đất ở mọi tư thế
  function plantFeet(F, lift = 0) {
    F.root.updateMatrixWorld(true);
    let minY = Infinity;
    for (const L of F.legs) {
      for (const s of SOLE) {
        _p.copy(s); L.ankle.localToWorld(_p); F.root.worldToLocal(_p);
        if (_p.y < minY) minY = _p.y;
      }
      _p.set(0, -0.1, -0.62); L.knee.localToWorld(_p); F.root.worldToLocal(_p);   // gối quỳ chạm đất
      if (_p.y < minY) minY = _p.y;
    }
    const dy = FOOT_Y - minY + lift;
    F.hips.position.y += dy; F.torso.position.y += dy;
  }`;

const newPlantFeet = `  const SOLE = [V(0, -ANKLE_H, 0.45), V(0, -ANKLE_H, -0.3), V(0, -ANKLE_H, -1.05), V(0, -ANKLE_H + 0.06, -1.45)];

  function setLeg(L, hip, knee, foot, splay = 0.035) {
    L.leg.rotation.set(hip, 0, L.sx * splay);
    L.knee.rotation.set(knee, 0, 0);
    L.ankle.rotation.set(foot - hip - knee, 0, 0);
  }

  // hạ / nâng cả thân để đế giày thấp nhất chạm đúng FOOT_Y (hệ root) — chân luôn bám đất ở mọi tư thế
  function plantFeet(F, lift = 0) {
    F.root.updateMatrixWorld(true);
    let minY = Infinity;
    for (const L of F.legs) {
      for (const s of SOLE) {
        _p.copy(s); L.ankle.localToWorld(_p); F.root.worldToLocal(_p);
        if (_p.y < minY) minY = _p.y;
      }
      _p.set(0, -0.1, -0.62); L.knee.localToWorld(_p); F.root.worldToLocal(_p);   // gối quỳ chạm đất
      if (_p.y < minY) minY = _p.y;
    }
    const dy = FOOT_Y - minY + lift;
    F.hips.position.y += dy; F.torso.position.y += dy;
    F.root.updateMatrixWorld(true);
  }`;

// 5. Cập nhật GAITS.walk: sải bước đầm chắc, chùng gối giảm xóc, không kiễng nhọn mũi giày
const oldGaitWalk = `    walk: {
      cycle: 1.02, lean: -0.04, yaw: 4, roll: 4, shift: 0.13, adduct: 0.035, toeOut: 0.09, arm: 1, armBend: 0.15, lift: 0, gun: 'low',
      hip: periodic([[0, 30], [10, 27], [20, 19], [30, 10], [40, 1], [50, -7], [56, -10], [62, -6], [70, 8], [80, 23], [88, 31], [95, 31]]),
      knee: periodic([[0, 5], [7, 13], [15, 18], [25, 12], [35, 6], [43, 5], [50, 10], [57, 26], [63, 40], [69, 56], [74, 62], [80, 52], [87, 30], [93, 11]]),
      ankle: periodic([[0, 0], [5, -6], [10, -3], [20, 4], [35, 9], [45, 10], [52, 4], [57, -8], [62, -17], [67, -12], [75, -3], [85, 0], [93, 1]])
    },`;

const newGaitWalk = `    walk: {
      cycle: 1.05, lean: -0.04, yaw: 3.5, roll: 3, shift: 0.12, adduct: 0.03, toeOut: 0.08, arm: 0.9, armBend: 0.15, lift: 0, gun: 'low',
      hip: periodic([[0, 20], [10, 17], [20, 12], [30, 6], [40, 0], [50, -5], [58, -7], [66, -4], [75, 4], [85, 14], [92, 19], [98, 20]]),
      knee: periodic([[0, 12], [10, 15], [20, 15], [30, 14], [40, 13], [50, 15], [58, 24], [66, 36], [74, 44], [82, 34], [90, 20], [96, 12]]),
      ankle: periodic([[0, 3], [10, 1], [20, 0], [30, 1], [40, 2], [50, 1], [58, -2], [64, -4], [70, -2], [78, 0], [86, 2], [94, 3]])
    },`;

// Hàm normalize CRLF
function normalizeAndReplace(source, target, replacement) {
  const normSource = source.replace(/\r\n/g, '\n');
  const normTarget = target.replace(/\r\n/g, '\n');
  const normRepl = replacement.replace(/\r\n/g, '\n');

  if (!normSource.includes(normTarget)) {
    throw new Error('Target not found:\n' + normTarget.substring(0, 100) + '...');
  }
  const replaced = normSource.replace(normTarget, normRepl);
  return replaced.replace(/\n/g, '\r\n');
}

code = normalizeAndReplace(code, oldHipGeo, newHipGeo);
code = normalizeAndReplace(code, oldLegGeos, newLegGeos);
code = normalizeAndReplace(code, oldBuildFigureLegs, newBuildFigureLegs);
code = normalizeAndReplace(code, oldPlantFeet, newPlantFeet);
code = normalizeAndReplace(code, oldGaitWalk, newGaitWalk);

fs.writeFileSync('src/entities/soldier_model.js', code, 'utf8');
console.log('Successfully updated soldier_model.js with beefy legs and smooth gait!');
