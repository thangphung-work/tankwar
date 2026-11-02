// scratch/test_new_gait_curve.js
function periodic(pts) {
  return function(ph) {
    const p = ((ph % 1) + 1) % 1 * 100;
    if (p <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (p <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        const f = (p - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * f;
      }
    }
    const a = pts[pts.length - 1], b = pts[0];
    const f = (p - a[0]) / (100 - a[0] + b[0]);
    return a[1] + (b[1] - a[1]) * f;
  };
}

// Bảng góc khớp mới cho bước đi dã chiến:
// hip: sải bước đầm chắc từ -8° (sau) đến +20° (trước)
const newWalkHip = periodic([[0, 20], [10, 17], [20, 12], [30, 6], [40, 0], [50, -5], [58, -8], [66, -4], [75, 4], [85, 14], [92, 19], [98, 20]]);
// knee: chân trụ chùng gối 13°-15° triệt tiêu cú nảy, chân lăng gập 44°
const newWalkKnee = periodic([[0, 14], [10, 16], [20, 16], [30, 15], [40, 14], [50, 16], [58, 24], [66, 36], [74, 44], [82, 36], [90, 22], [96, 15]]);
// ankle: tiếp đất bằng gót êm (+4°), lăn bàn chân (0°), kiễng nhẹ khi đẩy (-6°)
const newWalkAnkle = periodic([[0, 3], [10, 1], [20, 0], [30, 2], [40, 3], [50, 1], [58, -4], [66, -7], [74, -5], [82, -1], [90, 2], [96, 3]]);

console.log('Angles defined successfully');
for (let i = 0; i <= 10; i++) {
  const ph = i / 10;
  console.log(`ph=${ph.toFixed(1)} hip=${newWalkHip(ph).toFixed(1)}° knee=${newWalkKnee(ph).toFixed(1)}° ankle=${newWalkAnkle(ph).toFixed(1)}°`);
}
