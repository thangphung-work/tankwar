/**
 * Module Ghép Trận Tác Chiến Nhiều Người Chơi (Multiplayer Matchmaking & Sync)
 * - Tự động ghép trận qua NetTransport (src/core/netcode.js): WebSocket /ws của server.js,
 *   dự phòng BroadcastChannel (nhiều tab cùng trình duyệt), dự phòng chơi độc lập khi mở file://
 * - Chủ phòng sinh hạt giống bản đồ 32-bit (mapSeed) cùng loại bản đồ; mọi máy dựng sẵn bản đồ
 *   giống hệt nhau ngay trong lúc chờ ghép trận để vào trận mượt mà
 * - Bấm "TÌM TRẬN ĐẤU" mới vào phòng chờ; sảnh ẩn đi để thấy bản đồ trận đấu quay toàn cảnh bên dưới
 * - Chờ người chơi thực 8 giây, thiếu người thì lấp dần máy (Bot) — giao diện chỉ hiện số chiến binh, không phân biệt người / máy;
 *   đủ 20/20 -> đếm ngược 3 giây -> vào trận
 * - Đồng bộ hành động di chuyển, ngắm bắn và khai hỏa giữa các người chơi thực
 */
/**
 * RadarSweepWidget: Hiệu ứng radar quét tác chiến chiến thuật
 * - Mỗi chấm trên radar TƯƠNG ĐƯƠNG 1 NGƯỜI CHƠI / CHIẾN BINH THỰC TẾ trong phòng
 * - Người chơi thoát -> chấm của người đó biến mất ngay lập tức
 * - Xe của mình: chấm vàng hổ phách có vòng sáng nổi bật ở tâm
 * - Phe Xanh: chấm xanh cyan, Phe Đỏ: chấm đỏ
 * - Người thật có vòng hào quang lớn hơn máy (bot)
 * - Khi kim quét quay lướt qua, chấm bừng sáng rồi mờ dần
 */
class RadarSweepWidget {
  constructor(canvas) {
    this.canvas = canvas;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.w = this.canvas.width;  // 104
    this.h = this.canvas.height; // 104
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.radius = this.w / 2 - 4; // 48
    this.angle = 0;
    this.speed = Math.PI * 1.25; // ~1.6 giây một vòng quay
    this.animId = null;
    this.lastTime = 0;
    this.blips = new Map(); // slotId -> blip object
  }

  // Vị trí ngẫu nhiên rải đều trên đĩa radar, chọn một lần khi chấm xuất hiện (không nhảy về sau).
  // Góc + bán kính tuyến tính theo id cũ xếp các chấm thành hình xoắn ốc -> nay rút ngẫu nhiên,
  // thử vài lần để chấm mới cách các chấm đang có >= 9px, khỏi chồng lên nhau.
  slotPosition() {
    let best = null, bestGap = -1;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 10 + Math.sqrt(Math.random()) * 32; // 10..42px, sqrt -> mật độ đều theo diện tích
      const x = this.cx + Math.cos(a) * dist, y = this.cy + Math.sin(a) * dist;
      let gap = Infinity;
      for (const b of this.blips.values()) gap = Math.min(gap, Math.hypot(b.x - x, b.y - y));
      if (gap > bestGap) { best = { dist, x, y }; bestGap = gap; }
      if (gap >= 9) break;
    }
    return best;
  }

  // Đồng bộ 1-1 với danh sách slot người chơi thực tế
  syncSlots(slots) {
    if (!slots || !Array.isArray(slots)) return;
    const activeIds = new Set();

    slots.forEach(slot => {
      if (!slot.ready) return; // Chưa sẵn sàng / chỗ trống -> không hiện
      activeIds.add(slot.id);

      let b = this.blips.get(slot.id);
      if (!b) {
        // Người chơi mới vào: tạo chấm mới và bừng sáng ngay
        const pos = this.slotPosition();
        const col = slot.isMe
          ? { r: 245, g: 196, b: 107 } // vàng kim hổ phách cho xe của mình
          : slot.team === 'BLUE'
            ? { r: 56, g: 189, b: 248 } // xanh cyan cho phe ta
            : { r: 248, g: 113, b: 113 }; // đỏ cho phe địch
        b = {
          slotId: slot.id,
          isMe: !!slot.isMe,
          isHuman: !!slot.isHuman,
          team: slot.team,
          x: pos.x,
          y: pos.y,
          angle: (Math.atan2(pos.y - this.cy, pos.x - this.cx) + Math.PI * 2) % (Math.PI * 2),
          r: pos.dist,
          size: slot.isMe ? 3.6 : (slot.isHuman ? 3.0 : 2.2),
          alpha: 1.0, // bừng sáng khi vừa vào
          color: col,
          jitterX: 0,
          jitterY: 0,
          phase: Math.random() * Math.PI * 2
        };
        this.blips.set(slot.id, b);
      } else {
        b.isHuman = !!slot.isHuman;
        b.isMe = !!slot.isMe;
      }
    });

    // Nếu người chơi thoát -> XOÁ CHẤM NGAY LẬP TỨC
    for (const id of Array.from(this.blips.keys())) {
      if (!activeIds.has(id)) {
        this.blips.delete(id);
      }
    }
  }

  start() {
    if (this.animId) return;
    this.lastTime = performance.now();
    const loop = (t) => {
      // Chi tiết HUD nhỏ chỉ cần 30 FPS, tránh tranh tài nguyên với video và bản đồ 3D.
      if (t - this.lastTime < 1000 / 30) {
        this.animId = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.08, (t - this.lastTime) / 1000);
      this.lastTime = t;
      this.update(dt);
      this.draw();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  update(dt) {
    const prevAngle = this.angle;
    this.angle = (this.angle + this.speed * dt) % (Math.PI * 2);

    for (const b of this.blips.values()) {
      b.phase += dt * 2.2;
      b.jitterX = Math.sin(b.phase) * 0.7;
      b.jitterY = Math.cos(b.phase * 0.8) * 0.7;

      // Tia quét đi qua vị trí góc của chấm mục tiêu
      let swept = false;
      if (prevAngle <= this.angle) {
        swept = (b.angle >= prevAngle && b.angle <= this.angle);
      } else {
        swept = (b.angle >= prevAngle || b.angle <= this.angle);
      }
      if (swept) {
        b.alpha = 1.0;
      } else {
        b.alpha = Math.max(0.2, b.alpha - dt * 0.65);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);

    const cx = this.cx, cy = this.cy, R = this.radius;

    ctx.save();

    // 1. Vòng cự ly nét đứt
    ctx.strokeStyle = 'rgba(231, 166, 58, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.38, 0, Math.PI * 2);
    ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Vòng ngoài cùng
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(231, 166, 58, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Trục chữ thập mảnh
    ctx.strokeStyle = 'rgba(231, 166, 58, 0.18)';
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // 2. Vệt quét rẻ quạt (Phosphor trail)
    const trailAngle = Math.PI * 0.42;
    const startAngle = this.angle - trailAngle;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
    grad.addColorStop(0, 'rgba(231, 166, 58, 0.25)');
    grad.addColorStop(1, 'rgba(231, 166, 58, 0.04)');

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, startAngle, this.angle, false);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 3. Tia quét phát sáng
    const lx = cx + Math.cos(this.angle) * R;
    const ly = cy + Math.sin(this.angle) * R;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(lx, ly);
    ctx.strokeStyle = 'rgba(255, 230, 160, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255, 220, 120, 0.8)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Vẽ từng người chơi / chiến binh thực tế
    for (const b of this.blips.values()) {
      const px = b.x + b.jitterX;
      const py = b.y + b.jitterY;
      const col = b.color;

      // Xe của mình: có vòng sáng bao quanh nổi bật
      if (b.isMe) {
        ctx.beginPath();
        ctx.arc(px, py, 6.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${Math.max(0.35, b.alpha * 0.85)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Người chơi thật: có vòng hào quang
      if (b.isHuman && b.alpha > 0.3) {
        ctx.beginPath();
        ctx.arc(px, py, b.size * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${b.alpha * 0.28})`;
        ctx.fill();
      }

      // Nhân sáng trung tâm
      ctx.beginPath();
      ctx.arc(px, py, b.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${b.alpha})`;
      ctx.shadowColor = `rgba(${col.r}, ${col.g}, ${col.b}, ${b.alpha})`;
      ctx.shadowBlur = b.alpha > 0.5 ? (b.isMe ? 10 : 7) : 2;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Tâm radar
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
    ctx.fill();

    ctx.restore();
  }
}

// Kho Kịch Bản Nhiệm Vụ Chiến Thuật Phong Phú Theo Từng Bản Đồ
const MISSION_BRIEFINGS = {
  DESERT: [
    {
      code: 'MÃ HIỆU: BÃO CÁT #21',
      text: 'Chỉ huy trưởng gửi các phân đội thiết giáp: Vệ tinh phát hiện đoàn tiếp vận của địch đang tìm cách chuyển kho tên lửa chiến thuật qua vành đai cát. Cứ điểm A là nút thắt tiếp vận duy nhất. Cứ điểm B chứa trạm tiếp dầu mật. Chiếm giữ A và bảo vệ B bằng mọi giá, tiêu diệt mọi lực lượng đối kháng!'
    },
    {
      code: 'MÃ HIỆU: PHƯỢNG HOÀNG LỬA #07',
      text: 'Mệnh lệnh tác chiến khẩn cấp: Lực lượng phản kích của địch đang tập kết quy mô lớn ở phía Bắc hoang mạc. Toàn đội phải lập tức triển khai đội hình mũi nhọn. Chiếm cứ điểm C để khống chế tầm nhìn pháo binh và chốt chặn cứ điểm B ngăn mũi thọc sâu của thiết giáp địch!'
    },
    {
      code: 'MÃ HIỆU: HẮC BÁO #44',
      text: 'Mệnh lệnh tác chiến số 104: Tình báo chiến trường xác nhận cứ điểm B là boong-ke chỉ huy ngầm của đối phương. Yêu cầu toàn phân đội phối hợp hỏa lực: mũi cơ động đánh tạt sườn chiếm A, mũi chủ lực thọc thẳng vào cứ điểm B bẻ gãy đài chỉ huy!'
    },
    {
      code: 'MÃ HIỆU: CÁT VÀNG #92',
      text: 'Thông điệp mã hóa từ tiền tuyến: Bão cát sắp nổi lên làm hạn chế tầm nhìn. Địch đang tranh thủ thời cơ di chuyển cụm pháo tự hành vào cứ điểm A. Toàn đội lập tức xuất kích, chiếm lĩnh các cao điểm cát và dập tắt hỏa lực đối phương!'
    }
  ],
  URBAN: [
    {
      code: 'MÃ HIỆU: PHƯỢNG HOÀNG #07',
      text: 'Đội hình, mục tiêu của chúng ta là chiếm đóng căn cứ hạt nhân. Đây là vị trí chiến lược, địch sẽ phản ứng mạnh. Giữ đội hình, tiến vào qua hướng Bắc. Có thắc mắc gì không?'
    },
    {
      code: 'MÃ HIỆU: BÌNH MINH ĐEN #77',
      text: 'Gửi các chiến binh: Thành phố đã bị phong tỏa hoàn toàn. Địch đã rải các cụm hỏa điểm bắn tỉa và pháo kích dọc các đại lộ chính. Căn cứ mật tại cứ điểm B đang giải mã tài liệu tác chiến tối mật. Cần chiếm cứ điểm A và C để khóa chặt hai đầu cầu vượt, bảo vệ tuyệt đối căn cứ mật!'
    },
    {
      code: 'MÃ HIỆU: BỨC TƯỜNG THÉP #15',
      text: 'Phòng tác chiến quân khu ban bố tình trạng đặc biệt: Đô thị đã thành chiến địa đổ nát. Địch sử dụng các tòa nhà cao tầng làm trận địa phục kích. Nhiệm vụ tối thượng: Thọc sâu chiếm lĩnh cứ điểm B, biến quảng trường trung tâm thành pháo đài thép và quét sạch tàn quân đối phương!'
    },
    {
      code: 'MÃ HIỆU: CẮT NẮP HẦM #33',
      text: 'Lệnh từ Tổng hành dinh: Các đơn vị trinh sát ghi nhận địch đang vận chuyển đầu đạn xuyên phá vào ga tàu điện ngầm dưới cứ điểm B. Mũi thiết giáp nhanh chóng đánh chiếm cứ điểm A mở đường, đồng thời chốt giữ cứ điểm C cắt đứt viện binh!'
    },
    {
      code: 'MÃ HIỆU: ĐÔ THỊ THÉP #81',
      text: 'Mệnh lệnh tác chiến nội đô: Tận dụng các dãy phố đổ nát làm vật che chắn. Chia làm hai mũi kẹp chặt đại lộ trung tâm, tiến đánh cứ điểm B trước khi máy bay trinh sát của đối phương phát hiện vị trí xuất kích của chúng ta!'
    }
  ],
  JUNGLE: [
    {
      code: 'MÃ HIỆU: LƯỚI RỪNG XANH #08',
      text: 'Mệnh lệnh hành quân: Tầm nhìn trong rừng hạn chế nghiêm trọng dưới tán cây rậm rạp. Địch đã bố trí các trận địa mìn và phục kích chống tăng. Cứ điểm B là đài tiếp sóng viễn thông mật của Bộ tư lệnh. Giữ vững liên lạc tại B và kiểm soát hành lang A - C!'
    },
    {
      code: 'MÃ HIỆU: MẮT THẦN RỪNG GIÀ #52',
      text: 'Chỉ huy trưởng gửi toàn đơn vị: Vệ tinh hồng ngoại phát hiện căn cứ tiếp tế bí mật của địch giấu dưới thung lũng rừng. Đột kích đánh chiếm cứ điểm B, làm chủ các cao điểm xung quanh để bẻ gãy đợt phản công của bộ binh cơ giới địch!'
    },
    {
      code: 'MÃ HIỆU: BÁO ĐEN RỪNG THẲM #19',
      text: 'Thông báo tác chiến khẩn: Lực lượng trinh sát địch đang lùng sục kho đạn dã chiến của chúng ta gần cứ điểm C. Toàn đội khẩn trương cơ động qua rừng thưa, dàn hỏa lực phục kích và bảo vệ bằng được tuyến phòng thủ!'
    }
  ],
  HIGHLAND: [
    {
      code: 'MÃ HIỆU: ĐỈNH GIÓ #12',
      text: 'Mệnh lệnh tác chiến: Địa hình cao nguyên hiểm trở dốc đứng. Bên nào khống chế được mỏm cao tại cứ điểm B sẽ kiểm soát toàn bộ hỏa lực pháo tầm xa. Toàn đội bằng mọi giá phải cơ động chiếm đỉnh cao B trước khi thiết giáp địch kịp dàn hàng ngang!'
    },
    {
      code: 'MÃ HIỆU: LANG TRẮNG #88',
      text: 'Bộ tham mưu chỉ đạo: Cứ điểm B là pháo đài phòng không chiến lược. Chiếm giữ B sẽ vô hiệu hóa hoàn toàn máy bay do thám của địch. Hãy chia mũi kẹp ép đối phương từ hai hướng A và C!'
    },
    {
      code: 'MÃ HIỆU: MÂY ĐEN CAO NGUYÊN #63',
      text: 'Cảnh báo tác chiến: Địch đang dồn thê đội thiết giáp vượt qua hẻm núi tiến về cao nguyên. Cứ điểm A và B là chốt chặn huyết mạch. Giữ vững trận địa, tập trung hỏa lực hạ gục những xe đi đầu!'
    }
  ],
  RIVER_LAKE: [
    {
      code: 'MÃ HIỆU: BẾN NƯỚC SÂU #66',
      text: 'Mệnh lệnh vượt sông: Cây cầu duy nhất nối đôi bờ nằm ngay cạnh cứ điểm B. Lực lượng thủy bộ và thiết giáp của địch đang tiến về ngã ba sông. Chiếm giữ bàn đạp B, chốt chặn hai đầu ngạn A và C để bảo toàn vành đai phòng thủ!'
    },
    {
      code: 'MÃ HIỆU: CÁ MẬP THÉP #03',
      text: 'Thông báo tác chiến: Địch đang dồn hỏa lực vào cù lao trung tâm cứ điểm B. Toàn đội dàn hàng ngang vượt bùn cạn, thiết lập lá chắn hỏa lực chiếm lĩnh cứ điểm B và đè bẹp mũi thọc sâu của đối phương!'
    },
    {
      code: 'MÃ HIỆU: SÓNG THẦN #75',
      text: 'Chỉ thị từ hạm đội yểm trợ: Địch đã thiết lập hệ thống radar quét ven bờ sông. Chiếm cứ điểm A để vô hiệu hóa trạm điều hành hỏa lực, sau đó toàn lực thọc sâu bảo vệ căn cứ chỉ huy tại B!'
    }
  ]
};

class MatchmakingController {
  constructor(game) {
    this.game = game;
    this.channelName = 'spg_tactical_matchmaking_v1';
    this.channel = null;

    // Danh tính người chơi hiện tại
    this.myPeerId = 'pilot_' + Math.random().toString(36).substring(2, 8);
    // Chưa đăng nhập: chỉ là khách (account.js thay bằng tên hiển thị khi đăng nhập)
    this.guestName = 'GUEST ' + (1000 + Math.floor(Math.random() * 9000));
    this.myName = this.guestName;

    this.selectedTankType = 'ALL_ROUNDER'; // 'ALL_ROUNDER' | 'GATLING' | 'ARTILLERY'
    this.selectedMapType = 'URBAN'; // 'DESERT' | 'URBAN' | 'JUNGLE' | 'HIGHLAND' | 'RIVER_LAKE'

    // Danh sách 20 vị trí chiến đấu (10 Phe Xanh vs 10 Phe Đỏ)
    this.slots = [
      // PHE XANH (10 XE LIÊN MINH)
      { id: 0, team: 'BLUE', title: 'CHỦ LỰC 01', name: this.myName, isHuman: true, isMe: true, peerId: this.myPeerId, tankType: this.selectedTankType, ready: true, ping: 12 },
      { id: 1, team: 'BLUE', title: 'CÁNH TRÁI 02', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'SCOUT', ready: false, ping: 0 },
      { id: 2, team: 'BLUE', title: 'CÁNH PHẢI 03', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ARTILLERY', ready: false, ping: 0 },
      { id: 3, team: 'BLUE', title: 'TIÊN PHONG 04', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'GATLING', ready: false, ping: 0 },
      { id: 4, team: 'BLUE', title: 'ĐỘT KÍCH 05', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ALL_ROUNDER', ready: false, ping: 0 },
      { id: 5, team: 'BLUE', title: 'CHI VIỆN 06', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ARTILLERY', ready: false, ping: 0 },
      { id: 6, team: 'BLUE', title: 'PHÒNG NGỰ 07', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ALL_ROUNDER', ready: false, ping: 0 },
      { id: 7, team: 'BLUE', title: 'BẮN TỈA 08', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ARTILLERY', ready: false, ping: 0 },
      { id: 8, team: 'BLUE', title: 'TRINH SÁT 09', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'SCOUT', ready: false, ping: 0 },
      { id: 9, team: 'BLUE', title: 'TRUNG TÂM 10', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'GATLING', ready: false, ping: 0 },

      // PHE ĐỎ (10 XE KHÁNG CHIẾN)
      { id: 10, team: 'RED', title: 'CHỦ LỰC 11', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ALL_ROUNDER', ready: false, ping: 0 },
      { id: 11, team: 'RED', title: 'CÁNH TRÁI 12', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'GATLING', ready: false, ping: 0 },
      { id: 12, team: 'RED', title: 'CÁNH PHẢI 13', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'SCOUT', ready: false, ping: 0 },
      { id: 13, team: 'RED', title: 'TIÊN PHONG 14', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ARTILLERY', ready: false, ping: 0 },
      { id: 14, team: 'RED', title: 'ĐỘT KÍCH 15', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'GATLING', ready: false, ping: 0 },
      { id: 15, team: 'RED', title: 'CHI VIỆN 16', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ALL_ROUNDER', ready: false, ping: 0 },
      { id: 16, team: 'RED', title: 'PHÒNG NGỰ 17', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ARTILLERY', ready: false, ping: 0 },
      { id: 17, team: 'RED', title: 'BẮN TỈA 18', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'ALL_ROUNDER', ready: false, ping: 0 },
      { id: 18, team: 'RED', title: 'TRINH SÁT 19', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'SCOUT', ready: false, ping: 0 },
      { id: 19, team: 'RED', title: 'TRUNG TÂM 20', name: 'ĐANG TÌM KIẾM...', isHuman: false, isMe: false, peerId: null, tankType: 'GATLING', ready: false, ping: 0 }
    ];

    this.botNamesPool = [
      'BLACK PANTHER', 'LONG-RANGE REAPER', 'IRON VANGUARD', 'HELLFIRE LEOPARD',
      'SANDSTORM', 'FEDERAL HUNTER', 'HAWKEYE GUNNER', 'PHANTOM BOLT',
      'FIRE EAGLE', 'ARCTIC CRUSADER', 'IRON SCORPION', 'SWIFT BATTERY',
      'JUNGLE SHARPSHOOTER', 'FACELESS RIDER', 'FROST LIGHTNING', 'HIGHLAND GREY WOLF',
      'SIEGE INFERNO', 'URBAN BEAST', 'LAKE THUNDER', 'PUNISHER 01',
      'ARES 02', 'WHITE STALLION', 'DESERT LION', 'FOREST GUNNER',
      'BROKEN WING', 'IRON DRAGON', 'STEEL WARRIOR', 'PEAK MARKSMAN',
      'FAR-SIGHT FALCON', 'STEALTH JAGUAR', 'DOOM CANNON', 'SNOW YETI'
    ];   // dự phòng khi thiếu bot_profiles.js

    // Bản mẫu để làm mới sảnh khi quay lại sau trận (chế độ nhiều người chơi)
    this.slotTemplate = JSON.parse(JSON.stringify(this.slots));
    this.botNamesTemplate = this.botNamesPool.slice();

    // Hạt giống bản đồ: chế độ độc lập tự sinh cục bộ, chế độ mạng do chủ phòng quyết định
    this.mapSeed = this.newMapSeed(this.selectedMapType);
    this.preparedMapKey = null;
    this.net = null;

    // Ở sảnh (chưa bấm tìm trận) máy này tự quyết bản đồ; vào phòng mạng rồi mới biết ai là chủ phòng
    this.isHost = true;
    this.netPending = false; // Đang kết nối / chờ chủ phòng nhận vào: chưa được tự lấp bot hay xuất trận
    this.searchTime = 0; // Đếm số giây tìm kiếm
    this.maxWaitTime = 2.5; // Chờ người chơi thực 2.5 giây rồi lấp máy để vào trận nhanh
    this.tickMs = 250;
    this.state = 'IDLE'; // IDLE -> SEARCHING -> FILLING_BOTS -> PREPARING -> COUNTDOWN -> IN_GAME
    this.countdown = 3;
    this.introFinished = false;
    this.localGameReady = false;
    this.readyPeers = new Set();

    this.initElements();
    this.music('lobby');   // nhạc sảnh chờ (phát ngay khi người chơi chạm / bấm phím lần đầu)
  }

  // Nhạc nền theo bước ghép trận: 'lobby' | 'search' | 'countdown' | 'battle' (xem src/core/audio/music.js)
  music(mode) {
    const se = window.soundEngine;
    if (se && typeof se.setMusicMode === 'function') {
      try { se.setMusicMode(mode); } catch (e) {}
    }
  }

  // Đưa danh sách 20 vị trí về ban đầu (chỉ còn mình ở ô 0)
  resetRoster() {
    this.slots = JSON.parse(JSON.stringify(this.slotTemplate));
    this.botNamesPool = this.botNamesTemplate.slice();
    this.slots.forEach(s => {
      s.isMe = (s.id === 0);
      if (s.isMe) {
        s.name = this.myName;
        s.peerId = this.myPeerId;
        s.tankType = this.selectedTankType;
      }
    });
  }

  // Nút vàng "TÌM TRẬN ĐẤU": ẩn sảnh, hiện bản đồ bên dưới, vào phòng chờ mạng và bắt đầu đếm giờ
  startSearch() {
    if (this.state !== 'IDLE') return;
    if (window.soundEngine && typeof window.soundEngine.init === 'function') {
      try { window.soundEngine.init(); } catch (e) {}
    }
    // không phát tiếng bộ đàm ở đây: cú "CHẮC" của nút (playUiDeploy) + còi điện khẩn của bản tin đã đủ,
    // chồng thêm thì ba lớp tiếng trầm / xẹt dồn vào cùng một khoảnh khắc thành một cục ù
    this.music('search');
    this.state = 'SEARCHING';
    this.searchTime = 0;
    this.introFinished = false;
    this.localGameReady = false;
    this.readyPeers.clear();
    this.isHost = true;
    this.roomHops = 0;
    this.resetRoster();
    this.setSearchView(true);
    // còi điện khẩn chờ cú "CHẮC" của nút tìm trận tắt hẳn (~0,7 s) rồi mới vang, không đè lên nhau
    this.startBriefingTypewriter(this.selectedMapType, 700);

    // Chưa dựng bản đồ ở đây: vào được phòng có sẵn thì dựng bản đồ của chủ phòng (DISCOVER_ROOM_ACK),
    // không có phòng / mất mạng thì máy này làm chủ phòng và dựng bản đồ mình đã chọn (becomeHost)
    if (typeof NetTransport !== 'undefined') {
      this.netPending = true;
      if (!this.net) this.initNetwork();
      else { this.net.prefMap = this.selectedMapType; this.net.rejoin(); }
    } else {
      this.netPending = false;
      this.schedulePrepareMap();
    }
    this.renderLobby();
    this.startSearchingLoop();
  }

  // Nút "HỦY": rời phòng chờ, quay lại sảnh (không hủy được khi đã đếm ngược)
  cancelSearch() {
    this.stopBriefingTypewriter();
    const reconVideoEl = document.getElementById('mm-recon-video');
    if (reconVideoEl) {
      reconVideoEl.pause();
      reconVideoEl.classList.add('hidden');
    }

    if (this.state !== 'SEARCHING' && this.state !== 'FILLING_BOTS') return;
    clearInterval(this.searchInterval);
    clearTimeout(this.discoverTimer);
    clearTimeout(this._prepareTimer);
    clearTimeout(this._readyPollTimer);
    this._prepareTimer = null;
    this.buildingMap = false;
    if (this.net) this.net.leave();
    this.state = 'IDLE';
    this.netPending = false;
    this.isHost = true;
    this.searchTime = 0;
    this.resetRoster();
    if (this.statusTextEl) this.statusTextEl.classList.remove('highlight-amber');
    this.setSearchView(false);
    this.renderLobby();
    this.music('lobby');
  }

  // Bật / tắt màn chờ ghép trận (sảnh ẩn, bản đồ 3D quay toàn cảnh bên dưới)
  setSearchView(on) {
    if (this.overlay) this.overlay.classList.toggle('mm-searching', !!on);
    document.body.classList.toggle('mm-searching', !!on);
    if (this.searchHudEl) {
      this.searchHudEl.classList.toggle('hidden', !on);
      this.searchHudEl.classList.remove('is-counting');
      const T = this.game && this.game.terrain;
      this.searchHudEl.classList.toggle('mm-3d-ready', !!(on && T && T.previewReady && this.preparedMapKey === this.selectedMapType + ':' + (this.mapSeed >>> 0)));
    }
    if (this.countdownEl) this.countdownEl.classList.add('hidden');
    this.setReconVideo(on);
    if (on) this.startSignalFx(); else this.stopSignalFx();

    if (this.radarWidget) {
      if (on) {
        this.radarWidget.syncSlots(this.slots);
        this.radarWidget.start();
      } else {
        this.radarWidget.stop();
      }
    }
  }

  // Cập nhật bảng trạng thái ghép trận
  onPreviewReady() {
    if (this.searchHudEl && this.state !== 'IDLE') this.searchHudEl.classList.add('mm-3d-ready');
    this.updateSearchHUD();
  }
  // âm thanh kênh chỉ huy (ui_sounds.js); máy chưa bật âm thanh thì im, không làm hỏng màn chờ
  briefingSfx(fn, ...a) {
    const se = window.soundEngine;
    if (se && typeof se[fn] === 'function') { try { se[fn](...a); } catch (e) { /* bỏ qua */ } }
  }

  // LỆNH TỪ CHỈ HUY qua bộ đàm thời chiến: bắt sóng (mã hiệu giải mã dần) -> máy điện báo gõ từng chữ, ngập ngừng ở
  // dấu câu, thỉnh thoảng nhiễu sóng chen ký tự rác rồi tự sửa -> thả phím bộ đàm, tổ lái đáp "Rõ!"
  // delayMs: chờ trước khi bắt đầu (còi điện khẩn) — dùng khi vừa có tiếng nút bấm lớn
  startBriefingTypewriter(mapType, delayMs = 0) {
    this.stopBriefingTypewriter();
    const list = (typeof MISSION_BRIEFINGS !== 'undefined' && MISSION_BRIEFINGS[mapType]) || (typeof MISSION_BRIEFINGS !== 'undefined' && MISSION_BRIEFINGS.DESERT) || [];
    if (!list.length) return;
    const briefing = (mapType === "URBAN" && list[0]) ? list[0] : list[Math.floor(Math.random() * list.length)];
    const box = document.getElementById('mm-briefing-box');
    const codeEl = document.getElementById('mm-briefing-code');
    const textEl = document.getElementById('mm-briefing-text');
    const replyEl = document.getElementById('mm-briefing-reply');
    const statusEl = document.getElementById('mm-briefing-status');
    const statusTxt = statusEl && statusEl.querySelector('.mm-comm-status-text');
    if (replyEl) replyEl.classList.add('hidden');
    if (!textEl) return;

    // Nhận diện phe người chơi để cập nhật màu sắc mệnh lệnh, chức vụ và avatar chỉ huy tương ứng
    const mySlot = this.slots && this.slots.find(s => s.isMe);
    const isRed = mySlot && mySlot.team === 'RED';
    if (box) {
      box.classList.remove('team-red', 'team-blue');
      box.classList.add(isRed ? 'team-red' : 'team-blue');
    }
    const avatarImg = document.getElementById('mm-briefing-avatar-img');
    if (avatarImg) {
      avatarImg.src = isRed ? 'assets/commander_red.webp' : 'assets/commander_blue.webp';
      avatarImg.onerror = () => { avatarImg.src = isRed ? 'assets/commander_red.jpg' : 'assets/commander_blue.jpg'; };
    }
    const kickerEl = document.getElementById('mm-briefing-kicker');
    if (kickerEl) {
      kickerEl.textContent = isRed ? 'BỘ CHỈ HUY KHÁNG CHIẾN' : 'BỘ TƯ LỆNH LIÊN ĐOÀN';
    }
    const replySpeakerEl = document.getElementById('mm-briefing-reply-speaker');
    if (replySpeakerEl) {
      replySpeakerEl.textContent = isRed ? 'KHÁNG CHIẾN-01 // RÕ' : 'LIÊN ĐOÀN-01 // RÕ';
    }

    const run = this._briefRun = { alive: true, timer: null };
    const later = (fn, ms) => { run.timer = setTimeout(() => { if (run.alive) fn(); }, ms); };
    const setStatus = (txt, st) => {
      if (statusTxt) statusTxt.textContent = txt;
      if (statusEl) statusEl.dataset.state = st;
    };
    const boxFlag = (cls, on) => { if (box) box.classList.toggle(cls, on); };

    // chữ đã gõ là một text node + con trỏ: mỗi phím chỉ đổi dữ liệu node, không dựng lại HTML
    textEl.textContent = '';
    const typed = document.createTextNode('');
    const noise = document.createElement('span');
    noise.className = 'mm-briefing-noise';
    const cursor = document.createElement('span');
    cursor.className = 'mm-briefing-cursor';
    cursor.textContent = '█';
    textEl.append(typed, noise, cursor);

    const GLYPH = '▓▒░#%&@$*/\\<>=+?0123456789ABCDEFX';
    const junk = (n) => { let s = ''; for (let i = 0; i < n; i++) s += GLYPH[Math.floor(Math.random() * GLYPH.length)]; return s; };

    // 0. ĐIỆN KHẨN: còi ưu tiên, nhạc nền lùi ra sau, mã hiệu còn là ký tự rác
    const code = briefing.code || '';
    const scramble = (n) => junk(code.length - n).replace(/./g, (c, i) => (code[n + i] === ' ' ? ' ' : c));
    if (codeEl) codeEl.textContent = scramble(0);
    boxFlag('is-linking', true);
    setStatus('ĐIỆN KHẨN · ƯU TIÊN HỎA TỐC', 'flash');
    const flash = () => {
      this.briefingSfx('playCommandFlash');
      later(link, 720);
    };

    // 1. BẮT SÓNG: mã hiệu hiện ra từ chuỗi ký tự rác, giải mã dần từ trái sang phải
    const LINK_MS = 950;
    let t0 = 0;
    const link = () => {
      setStatus(isRed ? 'ĐANG BẮT SÓNG CHỈ HUY KHÁNG CHIẾN' : 'ĐANG BẮT SÓNG CHỈ HUY LIÊN ĐOÀN', 'link');
      this.briefingSfx('playCommandLinkUp');
      t0 = performance.now();
      decode();
    };
    const decode = () => {
      const k = Math.min(1, (performance.now() - t0) / LINK_MS);
      const n = Math.floor(code.length * k);
      if (codeEl) codeEl.textContent = code.slice(0, n) + scramble(n);
      if (k < 1) { later(decode, 45); return; }
      boxFlag('is-linking', false);
      setStatus('đang nhận lệnh', 'typing');
      this.briefingSfx('startCommandChannel');
      later(typeNext, 260);
    };

    // 2. GÕ LỆNH: nhịp người gõ điện báo — chữ thường nhanh, dấu câu dừng lại, nhiễu sóng thỉnh thoảng chen ngang
    const text = briefing.text;
    let idx = 0, nextGlitch = 40 + Math.floor(Math.random() * 60);
    const typeNext = () => {
      if (idx >= text.length) { finish(); return; }
      if (idx >= nextGlitch && text.length - idx > 12) {
        nextGlitch = idx + 70 + Math.floor(Math.random() * 110);
        noise.textContent = junk(2 + Math.floor(Math.random() * 4));
        boxFlag('is-static', true);
        this.briefingSfx('playRadioGlitch', 0.7);
        later(() => { noise.textContent = ''; boxFlag('is-static', false); later(typeNext, 60); }, 110 + Math.random() * 140);
        return;
      }
      const ch = text[idx++];
      typed.data = text.slice(0, idx);
      // hết câu: đập trục + chuông; vừa gõ xong tên cứ điểm: píng đánh dấu mục tiêu
      if (/[.!?]/.test(ch)) this.briefingSfx('playBriefingStamp');
      else if (/[ABC]/.test(ch) && /cứ điểm [ABC]$/i.test(text.slice(Math.max(0, idx - 10), idx)) && !/[\p{L}\d]/u.test(text[idx] || ''))this.briefingSfx('playBriefingMark');
      else if (ch !== ' ') this.briefingSfx('playBriefingKey', /[,:;]/.test(ch) ? 1.3 : 1);
      const pause = /[.!?]/.test(ch) ? 360 : /[,:;]/.test(ch) ? 170 : ch === ' ' ? 34 : 0;
      later(typeNext, 20 + Math.random() * 22 + pause);
    };

    // 3. HẾT LỆNH: thả phím bộ đàm, con trỏ nháy chờ, tổ lái xác nhận
    const finish = () => {
      setStatus(isRed ? 'HẾT · ĐÃ NHẬN LỆNH KHÁNG CHIẾN' : 'HẾT · ĐÃ NHẬN LỆNH LIÊN ĐOÀN', 'done');
      this.briefingSfx('stopCommandChannel', 0.35, false);
      this.briefingSfx('playCommandOver');
      later(() => {
        if (replyEl) replyEl.classList.remove('hidden');
        this.briefingSfx('playCommandAck');
        run.alive = false;
      }, 650);
    };

    if (delayMs > 0) later(flash, delayMs); else flash();
  }

  stopBriefingTypewriter() {
    const run = this._briefRun;
    if (run) {
      run.alive = false; clearTimeout(run.timer); this._briefRun = null;
      // kênh đang mở / nhạc đang lùi -> đóng kênh, trả nhạc nền về mức thường
      this.briefingSfx('stopCommandChannel', 0.2, true);
    }
    const box = document.getElementById('mm-briefing-box');
    if (box) box.classList.remove('is-linking', 'is-static');
  }

  // NHIỄU ĐƯỜNG TRUYỀN trên hình trinh sát: mỗi vài giây hình giật ngang / xé sọc, đôi khi mất tín hiệu thoáng qua
  startSignalFx() {
    this.stopSignalFx();
    const hud = this.searchHudEl;
    if (!hud) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      const drop = Math.random() < 0.22;
      hud.style.setProperty('--mm-gx', ((Math.random() - 0.5) * (drop ? 26 : 14)).toFixed(1) + 'px');
      if (!reduce) hud.classList.add('mm-sig-glitch');
      if (drop) hud.classList.add('mm-sig-drop');
      // đang gõ lệnh thì tiếng nhiễu đã có trong kênh chỉ huy -> chỉ thêm tiếng khi mất tín hiệu
      if (drop || !this._briefRun) this.briefingSfx('playRadioGlitch', drop ? 0.6 : 0.3);
      this._sigFxOff = setTimeout(() => hud.classList.remove('mm-sig-glitch', 'mm-sig-drop'), drop ? 380 : 120 + Math.random() * 140);
      this._sigFxTimer = setTimeout(tick, 2600 + Math.random() * 4800);
    };
    this._sigFxTimer = setTimeout(tick, 1800);
  }

  stopSignalFx() {
    clearTimeout(this._sigFxTimer);
    clearTimeout(this._sigFxOff);
    if (this.searchHudEl) this.searchHudEl.classList.remove('mm-sig-glitch', 'mm-sig-drop');
  }

  // Video trinh sát cứ điểm của bản đồ đang chọn (flycam 360 quay sẵn — recon_recorder.js); thiếu file thì dùng bản chung
  setReconVideo(on) {
    const briefingBg = {
      DESERT: 'assets/lobby_desert.jpg', URBAN: 'assets/lobby_urban.jpg',
      JUNGLE: 'assets/lobby_jungle.jpg', HIGHLAND: 'assets/lobby_highland.jpg',
      RIVER_LAKE: 'assets/lobby_river_lake.jpg'
    }[this.selectedMapType] || 'assets/lobby_urban.jpg';
    document.documentElement.style.setProperty('--briefing-bg', `url("${briefingBg}")`);
    const reconVideo = document.getElementById('mm-recon-video');
    clearTimeout(this._introCap);
    if (!reconVideo) return;
    if (on) {
      this.introFinished = false;
      // Phim trinh sát là CỔNG vào trận (checkLocalGameReady chờ introFinished) nhưng chỉ có onended / lỗi tải mới mở cổng:
      // trình duyệt chặn tự phát (Edge "Chặn"), play() bị từ chối, trình phát khựng vì luồng chính bận dựng bản đồ /
      // biên dịch shader (đo 2026-10-28 trên Edge: phim 45 s chạy hết ở giây 75) -> kẹt "ĐANG TRUYỀN NHIỆM VỤ" mãi.
      // Mở cổng muộn nhất sau INTRO_MAX_MS tính theo đồng hồ thật, dù phim ở đâu
      const finishIntro = () => {
        clearTimeout(this._introCap);
        if (this.introFinished) return;
        this.introFinished = true;
        this.checkLocalGameReady();
      };
      this._introCap = setTimeout(finishIntro, 48000);
      const mapLower = (this.selectedMapType || 'urban').toLowerCase();
      const primarySrc = 'assets/recon_' + mapLower + '.webm?v=20261026high';
      const fallbackSrc = 'assets/recon_briefing.webm?v=20261026high';
      if (reconVideo.src && reconVideo.src.endsWith(primarySrc) && !reconVideo.paused) return;   // đang chiếu đúng bản đồ
      const hideVideo = () => {
        reconVideo.classList.add('hidden');
        if (this.searchHudEl) this.searchHudEl.classList.remove('mm-video-playing');
      };
      hideVideo();
      reconVideo.onplaying = () => {
        reconVideo.classList.remove('hidden');
        if (this.searchHudEl) this.searchHudEl.classList.add('mm-video-playing');
      };
      reconVideo.onended = finishIntro;
      // bị từ chối phát (không phải bị ngắt vì đổi nguồn / tạm dừng): phim sẽ không chạy -> không bắt người chơi chờ
      const playFail = (e) => { hideVideo(); if (!e || e.name !== 'AbortError') finishIntro(); };
      reconVideo.oncanplay = () => { reconVideo.play().catch(playFail); };
      reconVideo.onerror = () => {
        hideVideo();
        if (reconVideo.src && !reconVideo.src.endsWith(fallbackSrc)) {
          reconVideo.src = fallbackSrc;
          reconVideo.play().catch(playFail);
        } else {
          reconVideo.classList.add('hidden');
          // A missing briefing clip must not leave the room locked forever.
          finishIntro();
        }
      };
      reconVideo.src = primarySrc;
      reconVideo.play().catch(playFail);
    } else {
      // gỡ onerror trước: bỏ nguồn cũng là một lỗi tải -> trước đây lại nhảy sang bản chung, video chạy ngầm trong trận
      reconVideo.onerror = null;
      reconVideo.oncanplay = null;
      reconVideo.onplaying = null;
      reconVideo.onended = null;
      if (this.searchHudEl) this.searchHudEl.classList.remove('mm-video-playing');
      reconVideo.pause();
      reconVideo.classList.add('hidden');
      reconVideo.removeAttribute('src');
      reconVideo.load();
    }
  }

  // Vào phòng chủ khác / chủ phòng đổi bản đồ trong lúc chờ: video trinh sát và lệnh chỉ huy phải theo bản đồ mới
  refreshBriefingForMap() {
    if (this.state !== 'SEARCHING' && this.state !== 'FILLING_BOTS' && this.state !== 'COUNTDOWN') return;
    this.setReconVideo(true);
    this.startBriefingTypewriter(this.selectedMapType);
  }

  updateSatelliteCoords() {
    const coordsEl = document.getElementById('mm-sh-sat-coords');
    if (!coordsEl) return;
    const t = performance.now() * 0.001;
    const latSec = (4 + Math.sin(t * 0.2) * 2).toFixed(1);
    const lonSec = (12 + Math.cos(t * 0.15) * 3).toFixed(1);
    const alt = Math.floor(1450 + Math.sin(t * 0.3) * 15);
    coordsEl.textContent = `TỌA ĐỘ: 16°28'${latSec}"B 107°34'${lonSec}"Đ · ĐỘ CAO: ${alt}M · KÊNH MÃ HÓA`;
  }

  updateDroneTelemetry() {
    const t = performance.now() * 0.001;
    const altEl = document.getElementById('mm-tele-alt');
    const spdEl = document.getElementById('mm-tele-spd');
    const recTimerEl = document.getElementById('mm-rec-timer');
    const targetNameEl = document.getElementById('mm-target-name');
    if (altEl) altEl.textContent = Math.floor(1240 + Math.sin(t * 0.3) * 6) + 'm';
    if (spdEl) spdEl.textContent = Math.floor(220 + Math.cos(t * 0.25) * 4) + 'kph';
    if (recTimerEl) {
      const sec = Math.floor(this.searchTime || 0);
      recTimerEl.textContent = `00:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }
    if (targetNameEl) {
      const names = { URBAN: 'NUCLEAR BASE', DESERT: 'RADAR SITE B', JUNGLE: 'BIO LAB ZERO', HIGHLAND: 'HIGHLAND RADAR', RIVER_LAKE: 'RIVER DAM' };
      targetNameEl.textContent = names[this.selectedMapType] || 'TACTICAL BASE';
    }
  }

  updateSearchHUD() {
    this.updateSatelliteCoords();
    this.updateDroneTelemetry();
    if (!this.searchHudEl || this.state === 'IDLE' || this.state === 'IN_GAME') return;
    const filled = this.slots.filter(s => s.ready).length;
    const total = this.slots.length;
    if (this.countEl) this.countEl.textContent = `${filled}/${total}`;
    if (this.progressBarEl) this.progressBarEl.style.width = `${Math.max(5, filled / total * 100)}%`;
    const t = Math.floor(this.searchTime);
    if (this.timerEl) this.timerEl.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    if (this.mapNameEl) this.mapNameEl.textContent = this.mapName(this.selectedMapType);
    if (this.radarWidget) this.radarWidget.syncSlots(this.slots);
    if (!this.statusTextEl) return;
    let text;
    if (this.state === 'COUNTDOWN') text = 'ĐÃ SẴN SÀNG · TRẬN ĐẤU SẮP BẮT ĐẦU';
    else if (this.state === 'PREPARING') text = this.introFinished ? 'ĐANG CHỜ TOÀN ĐỘI SẴN SÀNG...' : 'ĐANG TRUYỀN NHIỆM VỤ...';
    else if (this.netPending) text = 'ĐANG KẾT NỐI...';
    else if (this.buildingMap) text = 'ĐANG DỰNG BẢN ĐỒ...';
    else text = 'ĐANG TÌM TRẬN ĐẤU...';
    this.statusTextEl.textContent = text;
  }

  mapName(mapType) {
    return { DESERT: 'SA MẠC LỬA', URBAN: 'ĐÔ THỊ ĐỔ NÁT', JUNGLE: 'RỪNG RẬM', HIGHLAND: 'CAO NGUYÊN', RIVER_LAKE: 'SÔNG HỒ' }[mapType] || 'SA MẠC LỬA';
  }

  initElements() {
    this.setWeatherUI();
    this.overlay = document.getElementById('matchmaking-overlay');
    this.timerEl = document.getElementById('mm-timer-val');
    this.statusTextEl = document.getElementById('mm-status-text');
    this.progressBarEl = document.getElementById('mm-search-progress');
    this.nameInput = document.getElementById('mm-player-name-input');
    this.searchHudEl = document.getElementById('mm-search-hud');
    this.countdownEl = document.getElementById('mm-countdown');
    this.countdownNumEl = document.getElementById('mm-cd-num');
    this.countEl = document.getElementById('mm-sh-count');
    this.mapNameEl = document.getElementById('mm-sh-map-name');
    const radarCanvas = document.getElementById('mm-radar-canvas');
    if (radarCanvas) {
      this.radarWidget = new RadarSweepWidget(radarCanvas);
    }

    if (this.nameInput) {
      this.nameInput.value = this.myName;
      this.nameInput.addEventListener('input', (e) => {
        this.myName = e.target.value.trim() || this.guestName;
        const mySlot = this.slots.find(s => s.isMe);
        if (mySlot) mySlot.name = this.myName;
        if (this.net) this.net.name = this.myName;
        this.renderLobby();
        this.broadcastRoomUpdate();
        this.sendMySlotUpdate();
      });
    }

    // Lắng nghe click toàn cục để đảm bảo bấm là kích hoạt ngay (Event Delegation)
    document.addEventListener('click', (e) => {
      // 1. Nút vàng tìm trận / hủy tìm
      if (e.target.closest('#mm-find-match-btn')) {
        e.preventDefault();
        this.startSearch();
        return;
      }
      if (e.target.closest('#mm-cancel-search-btn')) {
        e.preventDefault();
        this.cancelSearch();
        return;
      }
      if (this.state !== 'IDLE') return;

      // 2. Thẻ chọn xe tăng (không kích hoạt nếu bấm vào nút xem 3D bên trong)
      const classCard = e.target.closest('.mm-class-card');
      if (classCard && !e.target.closest('.btn-inspect-tank-3d')) {
        document.querySelectorAll('.mm-class-card').forEach(c => c.classList.remove('active'));
        classCard.classList.add('active');
        const tankType = classCard.getAttribute('data-tank-type') || 'ALL_ROUNDER';
        this.selectedTankType = tankType;

        const mySlot = this.slots.find(s => s.isMe);
        if (mySlot) {
          mySlot.tankType = tankType;
          this.renderLobby();
          this.broadcastRoomUpdate();
          this.sendMySlotUpdate();
        }
        return;
      }

      // 3.b. Chọn thời tiết
      const wxBtn = e.target.closest('.mm-wx-btn');
      if (wxBtn) {
        this.selectWeather(wxBtn.getAttribute('data-wx') || 'random');
        return;
      }

      // 3. Thẻ chọn bản đồ chiến địa
      const mapCard = e.target.closest('.mm-map-card');
      if (mapCard) {
        document.querySelectorAll('.mm-map-card').forEach(c => c.classList.remove('active'));
        mapCard.classList.add('active');
        const mapType = mapCard.getAttribute('data-map-type') || 'DESERT';
        this.selectMap(mapType);
        return;
      }
    });

    // Các nút chọn nhanh biệt hiệu tác chiến
    const quickTagBtns = document.querySelectorAll('.mm-quick-tag');
    quickTagBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-tag');
        if (val && this.nameInput) {
          this.nameInput.value = val;
          this.nameInput.dispatchEvent(new Event('input'));
        }
      });
    });

    this.updateLobbyBackground(this.selectedMapType);
    this.renderLobby();
  }

  // Khởi tạo lớp truyền tin mạng (WebSocket -> BroadcastChannel -> chơi độc lập an toàn cho file://)
  initNetwork() {
    this.channel = null; // Tương thích ngược: không còn dùng BroadcastChannel trực tiếp
    if (typeof NetTransport === 'undefined') {
      console.warn('Không tìm thấy NetTransport (src/core/netcode.js). Kích hoạt chế độ chơi độc lập an toàn.');
      this.isHost = true;
      this.prepareSelectedMap();
      return;
    }

    this.net = new NetTransport({ room: 'spg_tactical_lobby_v2', name: this.myName });
    this.net.prefMap = this.selectedMapType;
    window.netTransport = this.net;

    const lobbyTypes = ['DISCOVER_ROOM', 'DISCOVER_ROOM_ACK', 'ROOM_FULL', 'ROOM_UPDATE', 'MAP_CHANGE', 'MAP_REQUEST',
      'SLOT_UPDATE', 'REQUEST_LAUNCH', 'PREPARE_GAME', 'CLIENT_GAME_READY', 'START_COUNTDOWN', 'LAUNCH_GAME_NOW'];
    lobbyTypes.forEach(type => {
      this.net.on(type, (data, from) => this.handleChannelMessage(Object.assign({}, data || {}, { type, _from: from })));
    });
    this.net.on('@slots', (d, from) => this.onServerSlots(d, from));
    this.net.on('@receipt', (d, from) => this.onMatchReceipt(d, from));
    this.net.on('$ready', () => this.onNetReady());
    this.net.on('$peer_leave', (d, id) => this.onPeerLeave(id));
    this.net.on('$host', () => this.onHostChange());
    // Mất kết nối máy chủ: báo người chơi (trận vẫn chạy tiếp với máy điều khiển các xe khác)
    this.net.on('$close', () => { if (window.GameMenu && GameMenu.onConnectionLost) GameMenu.onConnectionLost(); });

    this.net.connect();
  }

  // Bộ trang bị mua thêm của mình cho xe đang chọn (null nếu chưa đăng nhập / chưa mua gì)
  myKit(tankType) {
    if (!window.Account || !Account.kitFor) return null;
    return Account.kitFor(tankType || this.selectedTankType).kit;
  }
  // Ghi bộ trang bị của mình vào slot của mình (chủ phòng gửi đi cùng ROOM_UPDATE / lệnh xuất trận)
  refreshMyKit() {
    const me = this.slots && this.slots.find(s => s.isMe);
    if (me) {
      me.kit = this.myKit(me.tankType || this.selectedTankType);
      me.rating = this.myRating();   // điểm xếp phe (cấp + tỉ lệ thắng) đi kèm slot
    }
  }
  // Tài khoản vừa đổi trang bị (mua / lắp): báo phòng
  onArmoryChanged() {
    if (this.state === 'IN_GAME') return;
    this.refreshMyKit();
    if (this.isHost) this.broadcastRoomUpdate();
    else this.sendMySlotUpdate();
  }
  cleanKit(kit, tankType) {
    return (typeof Equipment !== 'undefined' && kit) ? Equipment.sanitize(kit, tankType) : null;
  }

  // Đang là khách trong một phòng mạng (không phải chủ phòng)
  isNetGuest() {
    return !!(this.net && this.net.isOnline && this.net.ready && !this.isHost);
  }

  getMapSeed() {
    return this.mapSeed >>> 0;
  }

  // Đã kết nối & vào phòng: chủ phòng tự mở sảnh, khách xin vào slot
  onNetReady() {
    if (this.state === 'IN_GAME') return;
    if (this.state === 'IDLE') {
      // Đã hủy tìm trận trong lúc đang kết nối: rời phòng ngay, không làm "phòng ma" cho người khác
      this.isHost = true;
      this.netPending = false;
      if (this.net) this.net.leave();
      return;
    }
    const oldId = this.myPeerId;
    this.myPeerId = this.net.myId;
    this.slots.forEach(s => {
      if (s.peerId === oldId || s.isMe) s.peerId = this.myPeerId;
      s.isMe = (s.peerId === this.myPeerId);
    });

    if (this.net.isHost) {
      this.becomeHost();
      return;
    }

    this.isHost = false;
    this.hasReceivedHostAck = false;
    let attempts = 0;
    const discover = () => {
      if (this.hasReceivedHostAck || this.isHost || this.state === 'IN_GAME' || !this.net.isOnline) return;
      // Thử 1 lần x 1,0 giây: chủ phòng không phản hồi thì tự làm chủ phòng ngay
      if (attempts >= 1) {
        this.tryNextRoom('host did not answer DISCOVER_ROOM');
        return;
      }
      attempts++;
      const mySlot = this.slots.find(s => s.isMe);
      this.net.sendTo(this.net.hostId, 'DISCOVER_ROOM', {
        peerId: this.myPeerId,
        name: this.myName,
        tankType: mySlot ? mySlot.tankType : this.selectedTankType,
        kit: this.myKit(mySlot ? mySlot.tankType : this.selectedTankType),
        rating: this.myRating()
      });
      clearTimeout(this.discoverTimer);
      this.discoverTimer = setTimeout(discover, 1000);
    };
    discover();
  }

  // Phòng hiện tại không nhận (đầy / sắp vào trận / chủ phòng im lặng): sang phòng chờ khác thay vì chơi một mình
  tryNextRoom(reason) {
    clearTimeout(this.discoverTimer);
    // Chủ phòng không phản hồi: tự làm chủ phòng độc lập để lấp bot vào trận ngay
    this.becomeHost();
  }

  // Trở thành chủ phòng (mở phòng mới, hoặc được bầu lại khi chủ phòng cũ rời đi)
  becomeHost() {
    this.isHost = true;
    this.netPending = false;
    this.hasReceivedHostAck = true;
    clearTimeout(this.discoverTimer);
    // Chủ phòng cũ có thể đã khóa phòng (rời mạng đúng lúc đếm ngược) -> mở lại cho người mới vào
    if (this.net && this.net.isOnline) this.net.lockRoom(false);
    // Giải phóng các slot của người chơi không còn trong phòng
    const present = (id) => id === this.myPeerId || (this.net && this.net.peers.has(id));
    this.slots.forEach(s => {
      s.isMe = (s.peerId === this.myPeerId);
      if (s.isHuman && s.peerId && !present(s.peerId)) this.freeSlot(s);
    });
    // Giữ nguyên loại bản đồ + hạt giống đã có (thừa kế từ chủ phòng cũ hoặc tự sinh khi mở phòng)
    this.applyMapSelection(this.selectedMapType, this.mapSeed);
    this.renderLobby();
    this.broadcastRoomUpdate();
  }

  /**
   * Cân bằng đội hình 2 phe (chỉ chủ phòng / chơi đơn): bot được chia lại loại xe để HAI PHE CÓ CÙNG TỈ LỆ XE.
   * Xe người chơi tự chọn được giữ nguyên và tính vào tỉ lệ; phần còn lại lấp theo tỉ lệ chuẩn mỗi 10 xe:
   * 3 xe tăng · 3 xe 6 nòng · 2 pháo tự hành · 2 trinh sát. Pháo tự hành của bot đứng hàng sau, xe tăng hàng đầu.
   */
  balanceRoster() {
    const TYPES = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
    const BASE = { ALL_ROUNDER: 3, GATLING: 3, ARTILLERY: 2, SCOUT: 2 };
    const teams = ['BLUE', 'RED'].map(team => {
      const list = this.slots.filter(s => s.team === team);
      const human = {};
      TYPES.forEach(t => { human[t] = 0; });
      list.filter(s => s.isHuman).forEach(s => { human[s.tankType] = (human[s.tankType] || 0) + 1; });
      return { team, list, human, bots: list.filter(s => !s.isHuman) };
    });
    // Tỉ lệ chung cho cả 2 phe: đủ chỗ cho xe người chơi của phe nào chọn nhiều hơn, rồi lấp theo tỉ lệ chuẩn
    const fill = (target, size) => {
      let sum = TYPES.reduce((a, t) => a + target[t], 0);
      while (sum < size) {
        let best = TYPES[0], gap = -Infinity;
        for (const t of TYPES) { const g = BASE[t] * size / 10 - target[t]; if (g > gap) { gap = g; best = t; } }
        target[best]++; sum++;
      }
      return target;
    };
    const size = Math.min(teams[0].list.length, teams[1].list.length);
    const shared = {};
    TYPES.forEach(t => { shared[t] = Math.max(teams[0].human[t], teams[1].human[t]); });
    const mirror = TYPES.reduce((a, t) => a + shared[t], 0) <= size;
    if (mirror) fill(shared, size);
    for (const T of teams) {
      const target = mirror ? shared : fill(Object.assign({}, T.human), T.list.length);
      // Danh sách loại xe cho bot của phe này (pháo trước để xếp vào ô hàng sau)
      const need = [];
      for (const t of ['ARTILLERY', 'SCOUT', 'GATLING', 'ALL_ROUNDER']) {
        for (let k = Math.max(0, target[t] - T.human[t]); k > 0; k--) need.push(t);
      }
      // Ô hàng sau trước (ô 9 / 19 xa nhất, rồi 5-8 / 15-18, cuối cùng hàng đầu 0-4 / 10-14)
      const row = s => { const i = s.id % 10; return i === 9 ? 0 : i >= 5 ? 1 : 2; };
      const bots = T.bots.slice().sort((a, b) => row(a) - row(b) || a.id - b.id);
      bots.forEach((s, i) => { s.tankType = need[i] || TYPES[i % TYPES.length]; });
    }
  }

  /**
   * Điểm xếp phe (src/core/team_balance.js — máy chủ dùng cùng công thức để kiểm tra):
   * lợi thế so với 1 bot (0.3 .. 2.5; 1 = cấp 10 thắng 50%), từ cấp + tỉ lệ thắng. Khách = người mới (cấp 1).
   * game.balanceBotSkill dùng cùng thang này để bù bot.
   */
  static rating(level, wins, matches) { return TeamBalance.rating(level, wins, matches); }
  static cleanRating(v) { return TeamBalance.clean(v); }
  myRating() {
    const k = this.net && this.net.getPeerSkill ? this.net.getPeerSkill(this.myPeerId) : undefined;
    if (k !== undefined) return TeamBalance.ratingOfSkill(k);
    const p = window.Account && Account.profile, st = (p && p.stats) || {};
    return TeamBalance.rating(p && p.level, st.wins, st.matches);
  }
  // Điểm của người chơi khác (chủ phòng gọi): chạy qua máy chủ thì lấy số liệu máy chủ đọc từ tài khoản (khách = người mới),
  // bỏ qua số máy khách tự khai; chỉ khi không có máy chủ xác nhận (nhiều tab / máy chủ cũ) mới dùng số tự khai
  peerRating(peerId, claimed) {
    const k = this.net && this.net.getPeerSkill ? this.net.getPeerSkill(peerId) : undefined;
    return k !== undefined ? TeamBalance.ratingOfSkill(k) : TeamBalance.clean(claimed);
  }

  /**
   * Chia lại người chơi thật ngay trước đếm ngược (chủ phòng / chơi đơn), TeamBalance.improve:
   * - hai phe chênh nhau tối đa 1 người thật
   * - từ cách ngồi hiện tại, đổi chỗ từng cặp / chuyển từng người miễn giảm chênh lệch tổng điểm (cấp + tỉ lệ thắng)
   *   hơn 0.15 điểm -> ít người phải đổi phe; máy chủ kiểm tra lại đúng tiêu chí này (TeamBalance.check)
   * - người đổi phe đổi chỗ với người đổi theo chiều ngược lại, hoặc với 1 bot bên phe kia (loại xe bot chia lại ở balanceRoster)
   */
  rebalanceHumans(seed) {
    let st = seed >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let t = Math.imul(st ^ (st >>> 15), st | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const H = this.slots.filter(s => s.isHuman);
    if (!H.length) return;
    const w = H.map(s => TeamBalance.clean(s.rating));
    const blue0 = H.map(s => s.team === 'BLUE');
    TeamBalance.applySplit(this.slots, H, blue0, TeamBalance.improve(w, blue0), rnd);
  }

  // Máy chủ sửa cách chia phe / trang bị chủ phòng gửi (tin '@slots' do chính máy chủ phát, không có người gửi)
  onServerSlots(d, from) {
    if (from || !d || !Array.isArray(d.slots) || this.state === 'IN_GAME' || this.state === 'IDLE') return;
    const oldTeam = (this.slots.find(s => s.isMe) || {}).team;
    this.slots = NetUtil.cleanSlots(d.slots);
    this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
    const newTeam = (this.slots.find(s => s.isMe) || {}).team;
    if (oldTeam && newTeam && oldTeam !== newTeam) {
      this.refreshBriefingForMap();
    }
    this.renderLobby();
  }

  // Biên nhận trận do máy chủ phát lúc hết trận (mã cuối chuỗi băm sự kiện, server_auth.js chainAdd): giữ 30 trận gần nhất
  // trong máy -> khi khiếu nại / tra soát, đối chiếu với nhật ký matches.log của máy chủ (sửa nhật ký là lệch mã)
  onMatchReceipt(d, from) {
    if (from || !d || typeof d.h !== 'string') return;
    try {
      const K = 'tankwar_match_receipts', list = JSON.parse(localStorage.getItem(K) || '[]');
      list.push({ t: Date.now(), m: String(d.m).slice(0, 24), n: d.n | 0, h: d.h.slice(0, 64), w: String(d.w).slice(0, 8), k: d.k });
      localStorage.setItem(K, JSON.stringify(list.slice(-30)));
    } catch (e) {}
  }

  // Người mới vào phòng: xếp vào phe đang ít người thật hơn (hòa thì bốc ngẫu nhiên), ưu tiên ô còn trống rồi mới thay bot
  // (chỉ là chỗ ngồi tạm trong lúc chờ: rebalanceHumans chia lại lần cuối khi bắt đầu đếm ngược)
  pickSlotForNewHuman() {
    const humans = team => this.slots.filter(s => s.team === team && s.isHuman).length;
    const hb = humans('BLUE'), hr = humans('RED');
    const order = (hr < hb || (hr === hb && Math.random() < 0.5)) ? ['RED', 'BLUE'] : ['BLUE', 'RED'];
    for (const team of order) {
      const s = this.slots.find(x => x.team === team && !x.peerId && !x.isHuman && !x.ready)
        || this.slots.find(x => x.team === team && !x.peerId && !x.isHuman);
      if (s) return s;
    }
    return null;
  }

  freeSlot(slot) {
    slot.isHuman = false;
    slot.peerId = null;
    slot.isMe = false;
    slot.name = 'ĐANG TÌM KIẾM...';
    slot.ready = false;
    slot.ping = 0;
    slot.kit = null;
    slot.botId = null;
    slot.rating = null;
  }

  onPeerLeave(peerId) {
    if (this.state === 'IN_GAME' || this.state === 'IDLE' || !this.isHost) return;
    const slot = this.slots.find(s => s.peerId === peerId);
    if (slot) {
      this.freeSlot(slot);
      if (this.state === 'PREPARING') this.fillBotSlot(slot);
      this.renderLobby();
      this.broadcastRoomUpdate();
      if (this.state === 'PREPARING') this.tryStartSynchronizedCountdown();
    }
  }

  onHostChange() {
    if (!this.net) return;
    if (this.state === 'IDLE') return;
    if (this.net.isHost && !this.isHost) {
      if (this.state === 'IN_GAME' || this.state === 'COUNTDOWN') this.isHost = true;
      else if (this.state === 'PREPARING') {
        this.isHost = true;
        this.readyPeers.clear();
        if (this.localGameReady) this.readyPeers.add(this.myPeerId);
        this.net.send('PREPARE_GAME', {
          slots: this.slots,
          mapType: this.selectedMapType,
          mapSeed: this.mapSeed >>> 0,
          spawnSeed: this.spawnSeed
        });
        this.tryStartSynchronizedCountdown();
      }
      else this.becomeHost();
    } else if (!this.net.isHost) {
      this.isHost = false;
    }
  }

  // Khách gửi tên / loại xe đã chọn cho chủ phòng
  sendMySlotUpdate() {
    if (!this.isNetGuest()) return;
    const mySlot = this.slots.find(s => s.isMe);
    this.net.sendTo(this.net.hostId, 'SLOT_UPDATE', {
      name: this.myName,
      tankType: mySlot ? mySlot.tankType : this.selectedTankType,
      kit: this.myKit(mySlot ? mySlot.tankType : this.selectedTankType),
      rating: this.myRating()
    });
  }

  // Người chơi bấm chọn bản đồ: khách gửi yêu cầu cho chủ phòng; ở sảnh chỉ ghi nhận lựa chọn (chưa dựng gì)
  selectMap(mapType) {
    if (this.isNetGuest()) {
      this.net.sendTo(this.net.hostId, 'MAP_REQUEST', { mapType });
      return;
    }
    if (this.state === 'IDLE') {
      // Chưa biết sẽ vào phòng của ai: bấm "TÌM TRẬN ĐẤU" mới chốt bản đồ (phòng có sẵn -> bản đồ chủ phòng).
      // Chọn lại đúng loại đang dựng sẵn thì giữ hạt giống đó để khỏi dựng lại.
      const t = mapType || 'DESERT', T = this.game && this.game.terrain;
      this.selectedMapType = t;
      this.mapSeed = (T && T.built && T.mapType === t && this.seedFitsWeather(t, T.seed)) ? (T.seed >>> 0) : this.newMapSeed(t);
      this.setMapSelectionUI(t);
      return;
    }
    this.selectMapAsHost(mapType);
  }

  // Hạt giống bản đồ mới khớp lựa chọn thời tiết ở sảnh (thời tiết suy ra từ hạt giống -> mọi máy cùng mưa / nắng)
  newMapSeed(mapType) {
    if (typeof Weather !== 'undefined') return Weather.seedFor(mapType || 'DESERT');
    return (typeof NetUtil !== 'undefined') ? NetUtil.randomSeed() : (Math.floor(Math.random() * 0x100000000) >>> 0);
  }
  seedFitsWeather(mapType, seed) {
    return typeof Weather === 'undefined' || Weather.matches(mapType, seed >>> 0, Weather.pref());
  }
  // Nút thời tiết ở sảnh: ghi nhớ lựa chọn; bản đồ đang chọn không khớp thì đổi hạt giống (khách: chủ phòng quyết định)
  selectWeather(pref) {
    if (typeof Weather === 'undefined') return;
    Weather.setPref(pref);
    this.setWeatherUI();
    if (this.isNetGuest() || this.seedFitsWeather(this.selectedMapType, this.mapSeed)) return;
    if (this.state === 'IDLE') { this.mapSeed = this.newMapSeed(this.selectedMapType); return; }
    this.selectMapAsHost(this.selectedMapType);
  }
  setWeatherUI() {
    const p = typeof Weather !== 'undefined' ? Weather.pref() : 'random';
    document.querySelectorAll('.mm-wx-btn').forEach(b => {
      const on = b.getAttribute('data-wx') === p;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  selectMapAsHost(mapType) {
    const seed = this.newMapSeed(mapType || 'DESERT');
    this.applyMapSelection(mapType || 'DESERT', seed);
    if (this.net && this.net.isOnline) {
      this.net.send('MAP_CHANGE', { mapType: this.selectedMapType, mapSeed: this.mapSeed });
    }
    this.broadcastRoomUpdate();
  }

  // Ghi nhận loại bản đồ + hạt giống và dựng sẵn bản đồ ngay (trong lúc chờ ghép trận)
  applyMapSelection(mapType, mapSeed) {
    if (!mapType) return;
    const seed = (typeof mapSeed === 'number' && isFinite(mapSeed)) ? (mapSeed >>> 0) : this.mapSeed;
    const changed = mapType !== this.selectedMapType;
    if (changed) {
      this.selectedMapType = mapType;
    }
    this.mapSeed = seed;
    if (this.net && this.isHost && !this.netPending) this.net.setMap(this.selectedMapType);
    this.setMapSelectionUI(this.selectedMapType);
    this.schedulePrepareMap();
    if (changed) this.refreshBriefingForMap();
  }

  // Dựng bản đồ 3D mất vài giây và chặn luồng chính -> chỉ dựng khi đã chốt phòng (vào phòng có sẵn / tự mở phòng),
  // trước đó hiện "ĐANG DỰNG BẢN ĐỒ..." cho kịp vẽ. Ở sảnh không dựng gì.
  // Đếm ngược / xuất trận gọi prepareSelectedMap() trực tiếp -> dựng ngay nếu còn chờ.
  schedulePrepareMap() {
    clearTimeout(this._prepareTimer);
    this._prepareTimer = null;
    this.buildingMap = false;
    if (this.state === 'IDLE' || this.preparedMapKey === this.selectedMapType + ':' + (this.mapSeed >>> 0)) return;
    this.buildingMap = true;
    this.updateSearchHUD();
    // Sinh dữ liệu bản đồ (MapGen) trong luồng phụ trước, xong mới dựng 3D: luồng chính chỉ còn khựng phần dựng hình.
    // Đổi bản đồ / đã dựng thẳng (đếm ngược) trong lúc chờ thì bỏ qua kết quả cũ
    const key = this.selectedMapType + ':' + (this.mapSeed >>> 0);
    this._prepareKey = key;
    const build = () => {
      if (this._prepareKey !== key || !this.buildingMap) return;
      clearTimeout(this._prepareTimer);
      this._prepareTimer = setTimeout(() => {
        this._prepareTimer = null;
        this.prepareSelectedMap();
      }, 60);
    };
    if (typeof MapGen !== 'undefined' && MapGen.prefetch) MapGen.prefetch(this.selectedMapType, this.mapSeed >>> 0).then(build, build);
    else build();
  }

  setMapSelectionUI(mapType) {
    const mapCards = document.querySelectorAll('.mm-map-card');
    mapCards.forEach(c => c.classList.toggle('active', c.getAttribute('data-map-type') === mapType));
    this.updateLobbyBackground(mapType);
  }

  // Dựng bản đồ theo (loại, hạt giống) — chỉ dựng lại khi cặp này thay đổi
  prepareSelectedMap(force) {
    clearTimeout(this._prepareTimer);
    this._prepareTimer = null;
    if (this.buildingMap) { this.buildingMap = false; this.updateSearchHUD(); }
    const key = this.selectedMapType + ':' + (this.mapSeed >>> 0);
    const game = this.game;
    if (!game) return false; // Game chưa khởi tạo: onGameAttached() sẽ dựng sau
    if (!force && this.preparedMapKey === key) return true;
    // Tuyệt đối không để MapGen.get() rơi về generate() đồng bộ trên main thread.
    // Briefing/cinemagraph tiếp tục chạy trong khi worker sinh dữ liệu map.
    if (!force && typeof MapGen !== 'undefined' && MapGen.has && !MapGen.has(this.selectedMapType, this.mapSeed >>> 0)) {
      this.buildingMap = true;
      this.updateSearchHUD();
      const waitKey = key;
      if (this._waitingMapKey !== waitKey) {
        this._waitingMapKey = waitKey;
        MapGen.prefetch(this.selectedMapType, this.mapSeed >>> 0).then(ok => {
          if (this._waitingMapKey !== waitKey) return;
          this._waitingMapKey = null;
          if (ok) this.prepareSelectedMap(true);
        });
      }
      return false;
    }
    this.preparedMapKey = key;
    try {
      if (typeof game.prepareMap === 'function') {
        game.prepareMap(this.selectedMapType, this.mapSeed >>> 0);
        // Dùng chính cảnh 3D vừa dựng làm phim briefing, che phần làm nóng còn lại.
        // Cảnh 3D nhẹ sẽ quay quanh căn cứ chính dưới lớp #mm-search-hud; tour A-B-C chạy khi vào trận.
      } else if (typeof game.changeMap === 'function') {
        game.changeMap(this.selectedMapType);
      }
    } catch (err) {
      console.warn('Lỗi khi dựng sẵn bản đồ:', err);
    }
    return true;
  }

  // Được game.js gọi khi ArtilleryGame3D liên kết với sảnh chờ
  onGameAttached(game) {
    this.game = game || this.game;
    if (this.state === 'IN_GAME') return;
    // Ở sảnh: nhận luôn bản đồ game vừa dựng lúc khởi động (cùng loại thì lấy hạt giống của nó), không dựng lại
    const T = this.game && this.game.terrain;
    if (this.state === 'IDLE') {
      if (T && T.built && T.mapType === this.selectedMapType && this.seedFitsWeather(T.mapType, T.seed)) {
        this.mapSeed = T.seed >>> 0;
        this.preparedMapKey = this.selectedMapType + ':' + this.mapSeed;
      }
      return;
    }
    this.prepareSelectedMap();
  }

  // Được game.js gọi khi quay về sảnh sau trận (restartMatch)
  onReturnToLobby() {
    if (this.game && this.game.netSync && typeof this.game.netSync.detach === 'function') {
      this.game.netSync.detach();
    }
    this.preparedMapKey = null;
    clearInterval(this.searchInterval);
    clearInterval(this.countdownTimer);
    clearTimeout(this._readyPollTimer);
    // Rời phòng của trận cũ (đã khóa); bấm "TÌM TRẬN ĐẤU" sẽ vào phòng chờ mới
    if (this.net) this.net.leave();
    this.state = 'IDLE';
    this.netPending = false;
    this.isHost = true;
    this.hasReceivedHostAck = false;
    this.searchTime = 0;
    this.resetRoster();
    this.setSearchView(false);
    if (this.overlay) this.overlay.classList.remove('hidden');
    this.music('lobby');
    this.renderLobby();
    // Không dựng bản đồ ở sảnh: vào phòng của người khác sẽ phải dựng lại -> dựng khi đã chốt phòng
  }

  // Chủ phòng phát lệnh xuất trận cho mọi máy
  sendLaunch() {
    if (!this.net || !this.net.isOnline || !this.isHost) return;
    this.refreshMyKit();
    this.net.send('LAUNCH_GAME_NOW', {
      slots: this.slots,
      mapType: this.selectedMapType,
      mapSeed: this.mapSeed >>> 0,
      spawnSeed: this.spawnSeed >>> 0
    });
  }

  handleChannelMessage(msg) {
    if (!msg || !msg.type) return;
    const from = msg._from;
    const fromHost = !!(this.net && from && from === this.net.hostId);

    // 1. Khách mới xin vào phòng
    if (msg.type === 'DISCOVER_ROOM') {
      if (this.isHost && from && (this.state === 'PREPARING' || this.state === 'COUNTDOWN' || this.state === 'IN_GAME' || this.state === 'IDLE')) {
        // Trận sắp bắt đầu hoặc chủ phòng đang ở sảnh: báo đầy để máy kia tự chơi hoặc sang phòng mới
        this.net.sendTo(from, 'ROOM_FULL', {});
        return;
      }
      if (this.isHost && (this.state === 'SEARCHING' || this.state === 'FILLING_BOTS') && from) {
        // Khách hỏi lại (gói trước bị chậm): giữ nguyên slot cũ của khách đó
        let slot = this.slots.find(s => s.peerId === from);
        if (!slot) slot = this.pickSlotForNewHuman();   // phe ít người thật hơn; thay chỗ 1 bot nếu đã lấp bot
        if (!slot) {
          this.net.sendTo(from, 'ROOM_FULL', {});
          return;
        }
        slot.isHuman = true;
        slot.peerId = from;
        slot.isMe = false;
        slot.botId = null;   // thay chỗ bot: bỏ hồ sơ bot của ô này
        slot.name = NetUtil.cleanName(msg.name, 'NEW RECRUIT');
        if (msg.tankType) slot.tankType = msg.tankType;
        slot.kit = this.cleanKit(msg.kit, slot.tankType);
        slot.rating = this.peerRating(from, msg.rating);
        slot.ready = true;
        slot.ping = Math.round(this.net.getPeerRtt(from)) || Math.floor(12 + Math.random() * 25);
        this.renderLobby();

        // Gửi phản hồi chào đón cho máy vừa vào (kèm bản đồ + hạt giống để dựng sẵn ngay)
        this.net.sendTo(from, 'DISCOVER_ROOM_ACK', {
          targetPeerId: from,
          assignedSlotId: slot.id,
          slots: this.slots,
          searchTime: this.searchTime,
          mapType: this.selectedMapType,
          mapSeed: this.mapSeed >>> 0
        });

        // Thông báo cập nhật phòng cho tất cả
        this.broadcastRoomUpdate();
      }
    }

    // 2. Khách nhận được thông tin phòng từ chủ phòng
    else if (msg.type === 'DISCOVER_ROOM_ACK') {
      if (this.isHost || this.state === 'IN_GAME' || this.state === 'IDLE') return;
      this.hasReceivedHostAck = true;
      this.netPending = false;
      clearTimeout(this.discoverTimer);
      this.searchTime = msg.searchTime || this.searchTime;
      if (Array.isArray(msg.slots)) {
        this.slots = NetUtil.cleanSlots(msg.slots);
        this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
      }
      this.applyMapSelection(msg.mapType, msg.mapSeed);
      this.renderLobby();
    }

    // 2.b. Phòng đã đủ 20 người thật
    else if (msg.type === 'ROOM_FULL') {
      if (!this.isHost && this.net && fromHost && this.state !== 'IN_GAME' && this.state !== 'IDLE') this.tryNextRoom('room full');
    }

    // 3. Đồng bộ danh sách slot, loại bản đồ và hạt giống từ chủ phòng
    else if (msg.type === 'ROOM_UPDATE') {
      if (!this.isHost && fromHost && this.state !== 'IN_GAME' && this.state !== 'IDLE') {
        if (Array.isArray(msg.slots)) {
          this.slots = NetUtil.cleanSlots(msg.slots);
          this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
        }
        this.searchTime = msg.searchTime || this.searchTime;
        if (msg.mapType) this.applyMapSelection(msg.mapType, msg.mapSeed);
        this.renderLobby();
      }
    }

    // 3.b. Chủ phòng đổi bản đồ (kèm hạt giống mới)
    else if (msg.type === 'MAP_CHANGE') {
      if (!this.isHost && fromHost && this.state !== 'IN_GAME') {
        this.applyMapSelection(msg.mapType || 'DESERT', msg.mapSeed);
      }
    }

    // 3.c. Khách xin đổi bản đồ: chủ phòng sinh hạt giống và phát cho cả phòng
    else if (msg.type === 'MAP_REQUEST') {
      if (this.isHost && this.state !== 'IN_GAME' && msg.mapType) {
        this.selectMapAsHost(msg.mapType);
      }
    }

    // 3.d. Khách đổi tên / loại xe
    else if (msg.type === 'SLOT_UPDATE') {
      if (this.isHost && this.state !== 'IN_GAME') {
        const slot = this.slots.find(s => s.peerId === from);
        if (slot) {
          if (typeof msg.name === 'string' && msg.name.trim()) slot.name = NetUtil.cleanName(msg.name, slot.name);
          if (msg.tankType) slot.tankType = msg.tankType;
          slot.kit = this.cleanKit(msg.kit, slot.tankType);
          if (msg.rating !== undefined) slot.rating = this.peerRating(from, msg.rating);
          this.renderLobby();
          this.broadcastRoomUpdate();
        }
      }
    }

    // 3.e. Khách bấm "xuất trận ngay"
    else if (msg.type === 'REQUEST_LAUNCH') {
      if (this.isHost && (this.state === 'SEARCHING' || this.state === 'FILLING_BOTS')) this.forceFillAllBotsNow();
    }

    // 4. Chủ phòng báo đã đủ người: mọi máy cùng đếm ngược 3 giây rồi vào trận
    else if (msg.type === 'PREPARE_GAME') {
      if (!this.isHost && fromHost && this.state !== 'IN_GAME' && this.state !== 'IDLE') {
        if (Array.isArray(msg.slots)) {
          this.slots = NetUtil.cleanSlots(msg.slots);
          this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
        }
        this.selectedMapType = msg.mapType || this.selectedMapType;
        if (typeof msg.mapSeed === 'number') this.mapSeed = msg.mapSeed >>> 0;
        if (typeof msg.spawnSeed === 'number') this.spawnSeed = msg.spawnSeed >>> 0;
        this.state = 'PREPARING';
        this.localGameReady = false;
        this._unitsPrebuilt = false;
        this.prepareSelectedMap();
        this.updateSearchHUD();
        this.checkLocalGameReady();
      }
    }
    else if (msg.type === 'CLIENT_GAME_READY') {
      if (this.isHost && this.state === 'PREPARING' && from) {
        const sameMap = msg.mapType === this.selectedMapType && (msg.mapSeed >>> 0) === (this.mapSeed >>> 0);
        const isPlayer = this.slots.some(s => s.isHuman && s.peerId === from);
        if (sameMap && isPlayer) {
          this.readyPeers.add(from);
          this.tryStartSynchronizedCountdown();
        }
      }
    }
    else if (msg.type === 'START_COUNTDOWN' || msg.type === 'LAUNCH_GAME_NOW') {
      if (!this.isHost && fromHost && this.state !== 'IN_GAME' && this.state !== 'IDLE') {
        if (Array.isArray(msg.slots)) {
          this.slots = NetUtil.cleanSlots(msg.slots);
          this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
        }
        if (msg.mapType) {
          const changed = msg.mapType !== this.selectedMapType;
          this.selectedMapType = msg.mapType;
          if (typeof msg.mapSeed === 'number') this.mapSeed = msg.mapSeed >>> 0;
          if (changed) this.refreshBriefingForMap();
        }
        if (typeof msg.spawnSeed === 'number') this.spawnSeed = msg.spawnSeed >>> 0;
        if (msg.type === 'LAUNCH_GAME_NOW') this.launchGame();
        else if (this.state !== 'COUNTDOWN') this.runCountdown();
      }
    }
    // Trạng thái xe / bắn / sát thương trong trận do NetGameSync (src/core/netcode.js) xử lý
  }

  broadcastRoomUpdate() {
    if (this.net && this.net.isOnline && this.isHost) {
      this.refreshMyKit();
      this.net.send('ROOM_UPDATE', {
        slots: this.slots,
        searchTime: this.searchTime,
        mapType: this.selectedMapType,
        mapSeed: this.mapSeed >>> 0
      });
    }
  }

  // Vòng lặp cập nhật màn chờ ghép trận (4 nhịp / giây)
  startSearchingLoop() {
    clearInterval(this.searchInterval);
    const step = this.tickMs / 1000;
    this.searchInterval = setInterval(() => {
      if (this.state !== 'SEARCHING' && this.state !== 'FILLING_BOTS') return;
      if (this.netPending) { this.updateSearchHUD(); return; }
      this.searchTime += step;

      if (this.isHost) {
        // Nếu không có người chơi nào khác đã sẵn sàng trong phòng -> lấp máy vào luôn lập tức
        const hasOtherReadyHumans = this.slots.some(s => s.isHuman && !s.isMe && s.ready);

        if (this.state === 'SEARCHING' && !hasOtherReadyHumans) {
          this.state = 'FILLING_BOTS';
        }

        if (this.state === 'FILLING_BOTS') {
          // Lấp nhanh: tối đa 10 bot mỗi nhịp
          const empty = this.slots.filter(slot => !slot.isHuman && !slot.peerId && !slot.ready).slice(0, 10);
          if (empty.length) {
            empty.forEach(slot => {
              this.fillBotSlot(slot);
            });
            if (this.radarWidget) this.radarWidget.syncSlots(this.slots);
            this.renderLobby();
            this.broadcastRoomUpdate();
          }
        }
        // Đủ 20/20 (người thật hoặc máy) -> đếm ngược vào trận
        if (this.slots.every(s => s.ready)) {
          this.beginCountdown();
          return;
        }
      }
      this.updateSearchHUD();
    }, this.tickMs);
  }

  fillBotSlot(slot) {
    // Hồ sơ bot (src/ai/bot_profiles.js): ưu tiên xe sở trường đúng loại xe của ô, không trùng trong phòng
    const used = new Set(this.slots.map(s => s.botId).filter(Boolean));
    const prof = (typeof BotProfiles !== 'undefined') ? BotProfiles.pick(slot.tankType, used) : null;
    slot.botId = prof ? prof.id : null;
    slot.name = prof ? prof.name : (this.botNamesPool.shift() || `WARRIOR #${slot.id + 1}`);
    slot.isHuman = false;
    slot.ready = true;
    slot.ping = Math.floor(6 + Math.random() * 12);
  }

  // Lấp máy vào mọi chỗ trống rồi đếm ngược (khách nhờ chủ phòng qua REQUEST_LAUNCH)
  forceFillAllBotsNow() {
    if (this.state !== 'SEARCHING' && this.state !== 'FILLING_BOTS') return;
    // Khách trong phòng: nhờ chủ phòng lấp bot (chủ phòng nắm danh sách slot)
    if (this.isNetGuest()) {
      this.net.sendTo(this.net.hostId, 'REQUEST_LAUNCH', {});
      return;
    }
    if (this.netPending) return;
    this.slots.forEach((slot) => {
      if (!slot.isHuman && !slot.peerId && !slot.ready) this.fillBotSlot(slot);
    });
    this.renderLobby();
    this.broadcastRoomUpdate();
    this.beginCountdown();
  }

  // Chủ phòng / chơi đơn: đã đủ người -> khóa phòng, báo mọi máy cùng đếm ngược
  beginCountdown() {
    if (this.state === 'PREPARING' || this.state === 'COUNTDOWN' || this.state === 'IN_GAME') return;
    clearInterval(this.searchInterval);
    // Hạt giống vị trí xuất phát ngẫu nhiên của trận này (mọi máy dùng chung -> cùng vị trí)
    this.spawnSeed = (typeof NetUtil !== 'undefined') ? NetUtil.randomSeed() : (Math.floor(Math.random() * 0x100000000) >>> 0);
    this.refreshMyKit();   // điểm xếp phe của chính mình (tài khoản có thể vừa nạp xong)
    // điểm người khác: lấy lại theo số liệu máy chủ (nếu có) ngay trước khi chia, không dùng số còn sót từ lúc chờ
    this.slots.forEach(s => { if (s.isHuman && !s.isMe && s.peerId) s.rating = this.peerRating(s.peerId, s.rating); });
    this.rebalanceHumans(this.spawnSeed);
    this.renderLobby(); // cân bằng đội hình lần cuối trước khi gửi
    this.state = 'PREPARING';
    this.localGameReady = false;
    this._unitsPrebuilt = false;
    this.readyPeers.clear();
    if (this.net && this.net.isOnline && this.isHost) {
      this.net.lockRoom(true);
      this.refreshMyKit();
      this.net.send('PREPARE_GAME', {
        slots: this.slots,
        mapType: this.selectedMapType,
        mapSeed: this.mapSeed >>> 0,
        spawnSeed: this.spawnSeed
      });
    }
    this.prepareSelectedMap();
    this.updateSearchHUD();
    this.checkLocalGameReady();
  }

  // A client is ready only after both expensive map work and the mission intro are complete.
  checkLocalGameReady() {
    if (this.state !== 'PREPARING' || this.localGameReady) return;
    const terrain = this.game && this.game.terrain;
    const mapReady = !!(this.prepareSelectedMap() && terrain && terrain.detailsReady);
    const warm = this.game && this.game._matchWarm;
    // bản đồ xong, phim trinh sát còn chiếu: dựng sẵn xe của trận song song với lượt làm nóng (trước đây dựng một mạch lúc
    // hết đếm ngược). Không chờ làm nóng xong: bản đồ phố làm nóng tới ~70 s, xong là đếm ngược luôn -> không kịp dựng xe
    if (mapReady && !this._unitsPrebuilt && this.game && this.game.prebuildMatchUnits) {
      this._unitsPrebuilt = true;
      this.game.prebuildMatchUnits(this.slots, this.myPeerId);
    }
    // chờ dựng sẵn xe xong (có trần — game.matchUnitsPending) rồi mới báo sẵn sàng
    const unitsPending = !!(this.game && this.game.matchUnitsPending && this.game.matchUnitsPending());
    const gameplayReady = (!warm || warm.done === true) && !unitsPending;
    if (!mapReady || !gameplayReady || !this.introFinished) {
      clearTimeout(this._readyPollTimer);
      this._readyPollTimer = setTimeout(() => this.checkLocalGameReady(), 120);
      return;
    }
    this.localGameReady = true;
    if (this.isHost) {
      this.readyPeers.add(this.myPeerId);
      this.tryStartSynchronizedCountdown();
    } else if (this.net && this.net.hostId) {
      this.net.sendTo(this.net.hostId, 'CLIENT_GAME_READY', {
        mapType: this.selectedMapType,
        mapSeed: this.mapSeed >>> 0
      });
    }
    this.updateSearchHUD();
  }

  tryStartSynchronizedCountdown() {
    if (!this.isHost || this.state !== 'PREPARING' || !this.localGameReady) return;
    const humans = this.slots.filter(s => s.isHuman && s.peerId).map(s => s.peerId);
    if (!humans.every(id => this.readyPeers.has(id))) return;
    if (this.net && this.net.isOnline) {
      this.net.send('START_COUNTDOWN', {
        slots: this.slots,
        mapType: this.selectedMapType,
        mapSeed: this.mapSeed >>> 0,
        spawnSeed: this.spawnSeed
      });
    }
    this.runCountdown();
  }

  // Tương thích ngược
  startCountdown() { this.beginCountdown(); }

  // Đếm ngược 3 - 2 - 1 (kèm tiếng bíp) rồi tự vào trận
  runCountdown() {
    clearInterval(this.searchInterval);
    clearInterval(this.countdownTimer);
    this.state = 'COUNTDOWN';
    this.music('countdown');
    this.prepareSelectedMap();
    // slot chốt lần cuối (START_COUNTDOWN của chủ phòng): dựng nốt / thay xe dựng sẵn lệch cấu hình
    if (this.game && this.game.prebuildMatchUnits) this.game.prebuildMatchUnits(this.slots, this.myPeerId);
    this.updateSearchHUD();
    if (this.searchHudEl) this.searchHudEl.classList.add('is-counting');
    if (this.countdownEl) this.countdownEl.classList.remove('hidden');
    const snd = window.soundEngine;
    let n = this.countdown || 3;
    const show = () => {
      if (this.countdownNumEl) {
        this.countdownNumEl.textContent = String(n);
        this.countdownNumEl.classList.remove('pop');
        void this.countdownNumEl.offsetWidth; // chạy lại hiệu ứng
        this.countdownNumEl.classList.add('pop');
      }
      if (snd && snd.playCountdownTick) { try { snd.playCountdownTick(n); } catch (e) {} }
    };
    show();
    this.countdownTimer = setInterval(() => {
      if (this.state !== 'COUNTDOWN') { clearInterval(this.countdownTimer); return; }
      n--;
      if (n > 0) { show(); return; }
      clearInterval(this.countdownTimer);
      if (snd && snd.playCountdownTick) { try { snd.playCountdownTick(0); } catch (e) {} }
      if (this.isHost) this.sendLaunch();
      this.launchGame();
    }, 1000);
  }

  // Kích hoạt trận đấu
  launchGame() {
    // Countdown có thể kết thúc trước worker map. Giữ màn briefing hoạt động và chỉ
    // chuyển vào trận khi dữ liệu đã sẵn, tránh sinh map đồng bộ làm treo tab.
    if (!this.prepareSelectedMap() || (this.game && this.game.terrain && !this.game.terrain.detailsReady)) {
      this.buildingMap = true;
      this.updateSearchHUD();
      clearTimeout(this._launchWaitTimer);
      this._launchWaitTimer = setTimeout(() => this.launchGame(), 120);
      return;
    }
    this.stopBriefingTypewriter();
    clearTimeout(this._readyPollTimer);
    this.state = 'IN_GAME';
    clearInterval(this.searchInterval);
    clearInterval(this.countdownTimer);
    this.netPending = false;
    this.setSearchView(false);
    // Khóa phòng: người mới vào sẽ được xếp sang phòng chờ khác
    if (this.net && this.isHost) this.net.lockRoom(true);

    if (this.overlay) {
      this.overlay.classList.add('hidden');
    }

    if (window.soundEngine && typeof window.soundEngine.init === 'function') {
      try { window.soundEngine.init(); } catch (e) {}
    }
    this.stopBriefingTypewriter();   // lệnh chưa gõ xong thì thôi, không để tiếng máy điện báo lọt vào trận
    this.music('battle');

    // Đảm bảo liên kết với đối tượng game chính
    if (!this.game) {
      this.game = window.artilleryGame || window.game;
      if (!this.game && typeof startArtilleryGameInstance === 'function') {
        try {
          startArtilleryGameInstance();
          this.game = window.artilleryGame || window.game;
        } catch (e) {}
      }
    }

    // Bản đồ đã được dựng sẵn trong lúc chờ (prepareMap); chỉ dựng lại nếu loại/hạt giống chưa khớp
    this.prepareSelectedMap();

    // Chuyển danh sách slot đã ghép sang cho game điều phối
    if (this.game && typeof this.game.startMatchWithSlots === 'function') {
      try {
        this.game.startMatchWithSlots(this.slots, this.myPeerId);
      } catch (err) {
        console.error('Lỗi khi xuất trận:', err);
      }
    }
  }

  // Cập nhật giao diện phòng chờ ghép trận
  renderLobby() {
    // Chủ phòng / chơi đơn: luôn giữ đội hình 2 phe cân bằng trước khi hiển thị & gửi cho cả phòng
    if (!this.isNetGuest() && this.state !== 'IN_GAME') this.balanceRoster();
    const blueList = document.getElementById('mm-blue-slots');
    const redList = document.getElementById('mm-red-slots');
    const humanCountEl = document.getElementById('mm-human-count');

    if (humanCountEl) {
      humanCountEl.textContent = '10 VS 10';
    }

    if (blueList) {
      blueList.innerHTML = this.slots.filter(s => s.team === 'BLUE').map(s => this.renderSlotHTML(s)).join('');
    }

    if (redList) {
      redList.innerHTML = this.slots.filter(s => s.team === 'RED').map(s => this.renderSlotHTML(s)).join('');
    }
    this.updateSearchHUD();
  }

  renderSlotHTML(slot) {
    const isMe = slot.isMe;
    const isOccupied = slot.ready;
    const isBlue = slot.team === 'BLUE';

    const tType = slot.tankType || 'ALL_ROUNDER';
    let tankIcon = '<i class="ti ti-shield" aria-hidden="true"></i>';
    let tankShortName = 'Chủ lực';
    if (tType === 'GATLING') {
      tankIcon = '<i class="ti ti-bolt" aria-hidden="true"></i>';
      tankShortName = '6 nòng';
    } else if (tType === 'ARTILLERY') {
      tankIcon = '<i class="ti ti-crosshair" aria-hidden="true"></i>';
      tankShortName = 'Pháo';
    } else if (tType === 'SCOUT') {
      tankIcon = '<i class="ti ti-radar-2" aria-hidden="true"></i>';
      tankShortName = 'Trinh sát';
    }

    let statusPill = '';
    if (isMe) {
      statusPill = '<span class="slot-badge badge-me"><i class="ti ti-star" aria-hidden="true"></i> BẠN</span>';
    } else if (isOccupied) {
      statusPill = '<span class="slot-badge badge-human">SẴN SÀNG</span>';
    } else {
      statusPill = '<span class="slot-badge badge-waiting">TÌM...</span>';
    }

    const dotClass = isOccupied ? 'dot-ready' : 'dot-waiting';

    return `
      <div class="mm-slot-card ${isOccupied ? 'occupied' : 'empty'} ${isMe ? 'is-me' : ''}">
        <span class="slot-status-dot ${dotClass}" title="${isOccupied ? 'Đã vào phòng' : 'Đang tìm kiếm...'}"></span>
        <span class="slot-tank-icon" title="${tankShortName}">${tankIcon}</span>
        <div class="slot-text-group">
          <span class="slot-name">${slot.name}</span>
        </div>
        ${statusPill}
      </div>
    `;
  }

  // Tương thích ngược: trạng thái xe giờ được NetGameSync gộp lô + lượng tử hóa và gửi ~20Hz
  broadcastMyUnitState(unit) {}

  // Đồng bộ sự kiện nổ súng (NetGameSync đã tự bắt mọi phát bắn qua fireShell3D; hàm này chỉ là lưới an toàn, có chống trùng)
  broadcastMyFire(shell) {
    const sync = this.game && this.game.netSync;
    if (!sync || !shell || shell._netQueued) return;
    const shooter = this.game.player;
    if (shooter) sync.noteLocalFire(shell, shooter, shell.shooterAzimuth || shooter.azimuth, shooter.elevation, shooter.charge);
  }

  // Cập nhật ảnh nền sảnh chờ và tiêu đề chiến dịch tương ứng theo loại bản đồ
  updateLobbyBackground(mapType) {
    const mapConfig = {
      DESERT: {
        bg: 'assets/lobby_desert.jpg',
        campaign: 'CHIẾN DỊCH SA MẠC LỬA // MÙA GIẢI I',
        sub: 'ĐẤU TRƯỜNG THIẾT GIÁP 10V10'
      },
      URBAN: {
        bg: 'assets/lobby_urban.jpg',
        campaign: 'CHIẾN DỊCH VÂY HÃM ĐÔ THỊ // KHÓI LỬA NỘI ĐÔ',
        sub: 'ĐẤU TRƯỜNG TÁC CHIẾN ĐÔ THỊ 10V10'
      },
      JUNGLE: {
        bg: 'assets/lobby_jungle.jpg',
        campaign: 'CHIẾN DỊCH RỪNG XANH // MẬT ĐẠO RỪNG RẬM',
        sub: 'ĐẤU TRƯỜNG PHỤC KÍCH RỪNG RẬM 10V10'
      },
      HIGHLAND: {
        bg: 'assets/lobby_highland.jpg',
        campaign: 'CHIẾN DỊCH CAO NGUYÊN BĂNG GIÁ // ĐỈNH NÚI TỬ THẦN',
        sub: 'ĐẤU TRƯỜNG CAO ĐIỂM ĐỒI NÚI 10V10'
      },
      RIVER_LAKE: {
        bg: 'assets/lobby_river_lake.jpg',
        campaign: 'CHIẾN DỊCH SÔNG HỒ // THỦY CHIẾN BÁN ĐẢO',
        sub: 'ĐẤU TRƯỜNG ĐỒNG BẰNG CHÂU THỔ 10V10'
      }
    };

    const cfg = mapConfig[mapType] || mapConfig.DESERT;
    const overlay = this.overlay || document.getElementById('matchmaking-overlay');
    if (overlay) {
      overlay.style.background = `linear-gradient(180deg, rgba(8, 11, 10, 0.80) 0%, rgba(6, 8, 7, 0.88) 55%, rgba(4, 5, 5, 0.95) 100%), url('${cfg.bg}') center/cover no-repeat`;
    }

    const campaignEl = document.querySelector('.campaign-title');
    if (campaignEl) {
      campaignEl.textContent = cfg.campaign;
    }

    const modePill = document.querySelector('.mm-mode-pill span');
    if (modePill) {
      modePill.textContent = cfg.sub;
    }
  }
}

window.MatchmakingController = MatchmakingController;

// Khởi tạo sảnh chờ độc lập an toàn ngay khi trang tải xong (không bị phụ thuộc tuần tự)
if (typeof document !== 'undefined') {
  const initLobbySafely = () => {
    if (!window.matchmakingController && document.getElementById('matchmaking-overlay')) {
      try {
        window.matchmakingController = new MatchmakingController(window.artilleryGame || null);
        console.log('Sảnh chờ ghép trận đã khởi tạo và sẵn sàng tương tác!');
      } catch (err) {
        console.warn('Lỗi khi tự động khởi tạo MatchmakingController:', err);
      }
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLobbySafely);
  } else {
    initLobbySafely();
  }
}
