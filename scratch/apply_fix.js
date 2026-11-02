// scratch/apply_fix.js
const fs = require('fs');

let code = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

// 1. Thay thế hipGeo()
const oldHipGeo = `  function hipGeo() {
    if (GEO.hip) return GEO.hip;
    // lưới dày để nặn mông liền một khối với hông (không gắn khối cầu rời)
    // kéo xuống tới nếp lằn mông (~ -2,2): mông bám khung chậu, không xoay theo đùi (gắn trên đùi thì đứng ngắm chìa mũi nhọn,
    // quỳ thành túi xệ dưới đùi); phần kéo dài phía trước / giữa hai đùi nâng lên & nằm chìm trong đùi
    const prof = [[0.0, 0.25], [1.34, 0.25], [1.37, 0.1], [1.38, -0.05], [1.37, -0.2], [1.35, -0.35], [1.31, -0.5], [1.25, -0.62], [1.17, -0.74], [1.07, -0.86], [0.95, -0.97], [0.8, -1.07], [0.6, -1.15], [0.35, -1.21], [0.0, -1.24]];
    const g = new THREE.LatheGeometry(prof.slice().reverse().map(q => new THREE.Vector2(q[0], q[1] - 0.95)), 56), p = g.attributes.position;   // dưới lên: mặt quay ra ngoài
    const G2 = (v, s) => Math.exp(-(v / s) * (v / s));
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z) || 1, zn = z / r;
      z = z * 0.67 * (zn > 0 ? 1 : 0.94) * (1 - 0.18 * sm((-y - 1.3) / 0.45));
      // mặt trước & giữa hai đùi: phần dưới nâng lên (đáy quần), không thòng xuống thành váy
      if (y < -1.95 && zn < 0.2) { const f = sm((0.2 - zn) / 0.6); y = y + (-1.95 - y) * 0.75 * f; }
      if (zn > 0) {
        // cơ mông: mặt cắt ELIP cả dọc lẫn ngang (đường chuông gauss cũ cho đỉnh nhọn + đáy dẹt như cái kệ):
        // từ thắt lưng phồng tròn tới đỉnh ngang khớp hông rồi cong gọn vào trong thành nếp lằn sát mặt sau đùi
        // mặt mông đích (tuyệt đối, không cộng lên đáy hông đang thu nhỏ — cộng thì đỉnh bị đẩy lên cao ~ -1,4):
        // mặt phẳng lưng z0 + chỏm elip, đỉnh ngang khớp hông (-1,75), đáy cong vào dưới mặt sau đùi -> đùi tạo nếp lằn
        const yc = -1.75, u = (y - yc) / (y > yc ? 0.66 : 0.38);
        const vy = Math.sqrt(Math.max(0, 1 - u * u));
        const lx = (Math.abs(x) - 0.52) / 0.66, vx = Math.sqrt(Math.max(0, 1 - lx * lx));
        const side = sm(zn / 0.55), cleft = G2(x, 0.11);
        const zt = (0.84 + 0.34 * vx * vy - 0.11 * cleft * vy) * side;
        if (zt > z) z = z + (zt - z) * Math.min(1, vy * 3) ;
        // lõm thắt lưng nhẹ phía trên mông
        z -= 0.04 * G2(y + 1.0, 0.14) * side;
      }
      p.setXYZ(i, x, y, z);
      g.attributes.uv.setXY(i, g.attributes.uv.getX(i) * 2 / 2.2, y * 0.14);
    }
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.hip = g);
  }`;

const newHipGeo = `  function hipGeo() {
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

// 2. Thay thế thighGeo & shinGeo
const oldLegGeos = `  // (đầu trên ống đùi chỉ nhô ~0,5 đv trên khớp: quỳ / gập đùi 90° vẫn nằm gọn trong hông, không lòi nắp tròn sau mông)
  const thighGeo = () => hangGeo('thigh',
    [[0, -0.15], [0.56, -0.13], [0.76, -0.04], [0.8, 0.08], [0.79, 0.2], [0.73, 0.42], [0.64, 0.65], [0.55, 0.85], [0.5, 0.96], [0.47, 1.0], [0.0, 1.04]], THIGH_L,
    // mặt sau đỉnh đùi đầy lên nối tiếp khối mông xuống tới nếp lằn mông (~ -2,2), mặt trước đùi phẳng hơn
    (t, c) => (c < 0 ? -0.06 : 0.02) * Math.sin(Math.PI * Math.min(1, Math.max(0, t) * 1.1)),
    (t, a) => 0.022 * Math.sin(t * 24 + Math.sin(a * 2) * 1.6) * (0.35 + 0.9 * Math.exp(-Math.pow((t - 0.93) / 0.1, 2)) * (0.5 + 0.5 * Math.sin(a)))
      + 0.03 * Math.exp(-Math.pow((t - 0.12) / 0.12, 2)) * Math.sin(a * 3 + t * 14) + 0.012 * Math.sin(a * 5 + t * 9), 1);   // số ô hoa văn nguyên quanh ống (repeat 2.2) -> không sọc ở đường nối

  const shinGeo = () => hangGeo('shin',
    [[0, -0.1], [0.44, -0.08], [0.48, 0.04], [0.5, 0.22], [0.47, 0.4], [0.41, 0.56], [0.37, 0.68], [0.36, 0.8], [0.0, 0.82]], SHIN_L,
    (t, c) => c > 0 ? 0.12 * c * Math.exp(-Math.pow((t - 0.28) / 0.18, 2)) : 0.03 * c * Math.exp(-Math.pow((t - 0.1) / 0.1, 2)),
    (t, a) => 0.018 * Math.sin(t * 28 + Math.sin(a * 3) * 1.5) * (0.3 + 0.8 * Math.exp(-Math.pow((t - 0.72) / 0.1, 2))) + 0.03 * Math.exp(-Math.pow((t - 0.05) / 0.08, 2)) * Math.sin(a * 2 + 1), 1);`;

const newLegGeos = `  // Đùi: đầu trên là chỏm cầu vòm tròn đồng tâm quanh khớp hông (0, 0, 0), lồng trọn trong hốc bẹn
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

// 3. Trong buildFigure: tắt skinPants, dùng hệ thống 3 khối chuẩn
const oldBuildFigureLegs = `    // bộ binh (lưới skinned): quần liền mảnh pantsGeo thay 3 khối rời hông / đùi / ống chân; kíp lái giữ khối rời (ít lộ thân dưới)
    const skinPants = !crew && !isHatch && options.bake !== false && options.bake !== 'group';
    if (!skinPants) add(hips, hipGeo(), pantsMat, 0, 0, 0.04);
    // đường may đũng + túi sau
    add(hips, new THREE.TorusGeometry(1.0, 0.025, 4, 24, Math.PI), M.strap, 0, -1.2, 0.04, 0, Math.PI / 2, Math.PI / 2).scale.set(1, 0.55, 0.62);
    for (const sx of [-1, 1]) {
    }

    const legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * HIP_X, HIP_Y, 0.06);
      leg.rotation.set(0, 0, sx * 0.035);
      hips.add(leg);

      const thigh = skinPants ? null : add(leg, thighGeo(), pantsMat, 0, 0, 0);
      if (thigh) thigh.scale.set(1.08, 1, 1.18);   // đùi người lính trưởng thành (~19-20 cm ngang kể cả quần)
      // túi hộp bên đùi (quần chiến đấu) + nắp + khuy
      // túi cong ôm theo mặt ngoài đùi (không còn hộp phẳng dán bên cạnh)
      add(leg, patchGeo(0.8, sx * Math.PI / 2, 1.05, 0.95, 0.08), pocketMat, 0, -1.55, 0.02);
      add(leg, patchGeo(0.85, sx * Math.PI / 2, 1.12, 0.26, 0.03), pocketMat, 0, -1.08, 0.02);
      add(leg, rbox(0.04, 0.07, 0.14), M.knuck, sx * 0.89, -1.13, 0.02, 0, 0, 0);
      // dây buộc ống quần đùi + túi trước đùi
      add(leg, patchGeo(0.86, Math.PI + sx * 0.35, 0.75, 0.5, 0.03), pocketMat, 0, -0.75, 0);

      const knee = new THREE.Group();
      knee.position.set(0, -THIGH_L, -0.03);
      leg.add(knee);
      // gối: mảng vải gối may khối (quần chiến đấu có túi đệm gối trong) — gồ nhẹ, cùng vải, viền chỉ may; đệm lộ mép dưới
      add(knee, kneePanelGeo(), pocketMat, 0, 0, 0);
      add(knee, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), padMat, 0, -0.3, -0.5, -Math.PI / 2, 0, 0).scale.set(0.28, 0.05, 0.14);

      if (!skinPants) add(knee, shinGeo(), shinMat, 0, 0, 0).scale.set(1.06, 1, 1.06);`;

const newBuildFigureLegs = `    // Phần dưới chiến sĩ: Hông, đùi, cẳng chân đồng bộ chuẩn mực giải phẫu
    // Khung chậu bám hips, đùi bám leg, cẳng chân bám knee; gộp qua bakeSkinned thành 1 draw call siêu mượt
    add(hips, hipGeo(), pantsMat, 0, 0, 0);

    const legs = [];
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

      add(knee, shinGeo(), shinMat, 0, 0, 0);`;

// 4. Bỏ lệnh gọi pantsGeo ở sau vòng lặp legs
const oldPantsCall = `      legs.push({ sx, leg, knee, ankle, thigh, boot });
    }
    if (skinPants) for (const L of legs) add(root, pantsGeo(root, hips, L), pantsMat, 0, 0, 0);`;

const newPantsCall = `      legs.push({ sx, leg, knee, ankle, thigh, boot });
    }`;

// Chuyển đổi chuẩn hóa CRLF / LF để replace
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
code = normalizeAndReplace(code, oldPantsCall, newPantsCall);

fs.writeFileSync('src/entities/soldier_model.js', code, 'utf8');
console.log('Successfully updated soldier_model.js!');
