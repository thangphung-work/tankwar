// scratch/apply_crotch_shoulder_fix.js
const fs = require('fs');

let code = fs.readFileSync('src/entities/soldier_model.js', 'utf8');

// 1. Cập nhật backSlope: Không gọt xẹp vai sau và lưng trên
const oldBackSlope = `  const backSlope = (x, y) => 1 - 0.24 * sm((y - 2.7) / 1.0) * (0.6 + 0.4 * sm((1.2 - Math.abs(x)) / 0.7));`;
const newBackSlope = `  // LƯNG TRÊN & BẢ VAI SAU: Dày dặn, nở nang khỏe mạnh tự nhiên của người lính mang giáp
  // Giữ nguyên độ dày bả vai sau, không gọt xẹp tạo vết lõm yên ngựa trước ăng-ten
  const backSlope = (x, y) => 1 - 0.06 * sm((y - 3.4) / 0.5) * sm((1.0 - Math.abs(x)) / 0.6);`;

if (!code.includes(oldBackSlope)) throw new Error('Cannot find oldBackSlope');
code = code.replace(oldBackSlope, newBackSlope);

// 2. Cập nhật torsoDepth: Bổ sung độ dày bả vai sau và cơ lưng trên
const torsoDepthRegex = /const torsoDepth = \(z, y\) => \{[\s\S]*?return Math\.sign\(z\) \* \(a \+ \(Z0 \+ 0\.07 \* \(1 - Math\.exp\(-\(a - Z0\) \/ 0\.07\)\) - a\) \* k\);\s*\};/;
const newTorsoDepth = `const torsoDepth = (z, y) => {
    // Thân trên và lưng người lính dày dặn, cơ bả vai nở nang
    const a = Math.abs(z);
    // Vùng bả vai sau (y > 2.1, z > 0): tăng độ dày cơ lưng sau thay vì ép xẹp
    const shoulderBackPad = (z > 0 && y > 2.1) ? 0.14 * sm((y - 2.1) / 0.6) * sm((3.7 - y) / 0.4) : 0;
    const Z0 = 0.78 + 0.1 * sm((y + 0.3) / 0.6) + 0.08 * sm((y - 0.9) / 1.0) * sm((2.75 - y) / 0.45) + shoulderBackPad;
    if (a <= Z0) return z;
    const k = 0.96;
    return Math.sign(z) * (a + (Z0 + 0.08 * (1 - Math.exp(-(a - Z0) / 0.08)) - a) * k);
  };`;

if (!torsoDepthRegex.test(code)) throw new Error('Cannot match torsoDepthRegex');
code = code.replace(torsoDepthRegex, newTorsoDepth);

// 3. Cập nhật anat: Bổ sung khối cơ bả vai sau (scapula bulge)
const oldAnatTrapezius = `    return 0.035 * Gn(ax - 0.45, 0.5) * sm((y - 2.2) / 1.1) * sm((3.85 - y) / 0.35);`;
const newAnatTrapezius = `    // Lưng trên và bả vai sau: khối cơ bả vai và cơ thang nở nang đầy đặn, dày dặn
    const scapula = 0.08 * Gn(ax - 0.92, 0.45) * Gn(y - 2.8, 0.55);
    const trap = 0.05 * Gn(ax - 0.45, 0.4) * sm((y - 2.2) / 1.0) * sm((3.85 - y) / 0.35);
    return scapula + trap;`;

if (!code.includes(oldAnatTrapezius)) throw new Error('Cannot find oldAnatTrapezius');
code = code.replace(oldAnatTrapezius, newAnatTrapezius);

// 4. Cập nhật Skinned blend của torsoGeo: Mặt sau vai không bị kéo giật theo xương đòn
const oldTorsoBlend = `        for (let i = 0; i < n; i++) {
          const x = P.getX(i), y = P.getY(i), k = sm((Math.abs(x) - 1.05) / 0.55) * sm((y - 1.95) / 0.65);
          if (k > 0.01 && B.w[i] > 0.98) { a[i] = 1; b[i] = x < 0 ? 2 : 3; w[i] = 0.55 * k; }
          else { a[i] = B.a[i]; b[i] = B.b[i]; w[i] = B.w[i]; }
        }`;
const newTorsoBlend = `        for (let i = 0; i < n; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          // Chỉ các đỉnh mặt trước (z < 0) theo xương đòn khi giơ tay.
          // Mặt sau lưng (z > 0) bám chắc vào khung lưng chest để bả vai sau không bị kéo lõm hóp vào trong!
          const frontK = sm(-z / 0.22);
          const k = sm((Math.abs(x) - 1.05) / 0.55) * sm((y - 1.95) / 0.65) * frontK;
          if (k > 0.01 && B.w[i] > 0.98) { a[i] = 1; b[i] = x < 0 ? 2 : 3; w[i] = 0.55 * k; }
          else { a[i] = B.a[i]; b[i] = B.b[i]; w[i] = B.w[i]; }
        }`;

if (!code.includes(oldTorsoBlend)) throw new Error('Cannot find oldTorsoBlend');
code = code.replace(oldTorsoBlend, newTorsoBlend);

// 5. Cập nhật sleeveGeo: Bo tròn đều chỏm vai, loại bỏ khoảng phẳng và vát cong nhọn
const oldCapIn = `  const CAP_IN = 0.16;`;
const newCapIn = `  const CAP_IN = 0.05; // Giữ chỏm vai tròn đều tự nhiên`;
if (code.includes(oldCapIn)) code = code.replace(oldCapIn, newCapIn);

const oldEz = `      const ez = (0.94 + 0.16 * sm((0.7 - y) / 0.9)) * (1 - 0.06 * sm((y - 2.9) / 0.6));   // c?ng tay d?t d?n v? c? tay`;
const newEz = `      const ez = (1.0 + 0.03 * sm((0.7 - y) / 0.9)) * (1 - 0.05 * sm((y - 2.9) / 0.6));   // chỏm vai tròn đều, không bẹp phẳng`;
if (code.includes(oldEz)) code = code.replace(oldEz, newEz);

// 6. Cập nhật ll.sh.z: Giảm độ giật khớp vai khi ngắm bắn
const oldShZ = `const kA = o.gAim / W; const kR = o.gReady / W; ll.sh.z -= 0.45 * kA + 0.08 * ka + 0.32 * kR; ll.sh.x += 0.1 * kA; rr.sh.y += 0.1 * kA;`;
const newShZ = `const kA = o.gAim / W; const kR = o.gReady / W; ll.sh.z -= 0.18 * kA + 0.06 * ka + 0.18 * kR; ll.sh.x += 0.06 * kA; rr.sh.y += 0.08 * kA;`;
if (!code.includes(oldShZ)) throw new Error('Cannot find oldShZ');
code = code.replace(oldShZ, newShZ);

// 7. Cập nhật pantsGeo: Tính toán UV theo chu vi hình học thực tế (Arc-length Parameterization)
const oldPantsUVLoop = `    for (let i = 0; i <= rows; i++) {
      const y = yTop - (yTop - yBot) * i / rows;
      for (let j = 0; j <= SEG; j++) {
        const ph = j / SEG * Math.PI * 2, P = surf(y, ph);
        pos.push(P.x, P.y, P.z);
        uv.push(j / SEG / 2.2, y * 0.14);
        skinW(y, Math.cos(ph), Math.abs(P.x), A, Bn, Wt);
      }
    }`;

const newPantsUVLoop = `    for (let i = 0; i <= rows; i++) {
      const y = yTop - (yTop - yBot) * i / rows;
      // 1. Tính toán trước toạ độ 3D của toàn bộ vòng cắt
      const ringPts = [];
      for (let j = 0; j <= SEG; j++) {
        const ph = (j / SEG) * Math.PI * 2;
        ringPts.push(surf(y, ph));
      }
      // 2. Tính chiều dài cung thực tế giữa các điểm kế tiếp (Arc-length Parameterization)
      const arcLengths = [0];
      let totalLen = 0;
      for (let j = 1; j <= SEG; j++) {
        const d = ringPts[j].distanceTo(ringPts[j - 1]);
        totalLen += d;
        arcLengths.push(totalLen);
      }
      // Tỷ lệ chuẩn hoá UV theo chu vi vải thực tế -> hoa văn đều tăm tắp, không bị co kéo ở đũng quần
      const uFactor = (1.0 / 2.2) / Math.max(1e-4, totalLen);
      for (let j = 0; j <= SEG; j++) {
        const P = ringPts[j];
        pos.push(P.x, P.y, P.z);
        uv.push(arcLengths[j] * uFactor, y * 0.14);
        skinW(y, Math.cos((j / SEG) * Math.PI * 2), Math.abs(P.x), A, Bn, Wt);
      }
    }`;

if (!code.includes(oldPantsUVLoop)) throw new Error('Cannot find oldPantsUVLoop');
code = code.replace(oldPantsUVLoop, newPantsUVLoop);

fs.writeFileSync('src/entities/soldier_model.js', code, 'utf8');
console.log('Successfully applied crotch texture and shoulder fixes to soldier_model.js!');
