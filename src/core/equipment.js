/**
 * TRANG BỊ & ĐẠN MUA THÊM (dùng chung máy chủ Node + trình duyệt)
 * - Danh mục, giá (Bạc), xe nào lắp được, kiểm tra hợp lệ bộ trang bị (sanitize) — máy chủ dùng để bán / lưu.
 * - Trong trận (chỉ trình duyệt): áp chỉ số, gắn hình bộ phận lên xe (gạch giáp nổ, lồng chống RPG, tấm giáp...),
 *   các bộ phận gắn tag như bộ phận gốc nên hệ thống hư hại tự xử lý: trúng thì kích nổ / văng ra, đồng bộ mạng.
 * - Hệ thống đánh chặn chủ động, màn khói (phím G), lưới ngụy trang, bình chữa cháy, đạn cao cấp, đạn mang thêm.
 *
 * Bộ trang bị 1 xe (gửi kèm slot khi ghép trận): { m: ['era','slat'], p: ['ap_du'], a: { AP: 4 } }
 *   m = mô-đun đang lắp (tối đa SLOTS), p = đạn cao cấp đã sở hữu (luôn dùng), a = số viên mua thêm mang theo mỗi lần xuất kích
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Equipment = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TANKS = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
  const ALL = TANKS;
  // Chế độ mở hết: mọi trang bị dùng được ngay. TẮT (false): đồ cơ bản miễn phí; đồ NÂNG CAO (adv) phải mở khóa cho
  // từng xe — mua bằng Bạc hoặc xem đủ số quảng cáo (adsToUnlock) -> tạo cảm giác khan hiếm, có mục tiêu để cày.
  const ALL_FREE = false;
  // Không giới hạn ô (lắp được mọi món cùng lúc): tắt -> mỗi nhóm GIÁP / PHỤ KIỆN chỉ 2 ô, phải chọn món hợp lối chơi
  // (lắp được hết thì không còn đánh đổi, ai cũng lắp đủ mọi món). Vẫn miễn phí khi ALL_FREE.
  const UNLIMITED_SLOTS = false;
  const START_SILVER = 4000;   // đủ mua ngay 1 món nâng cao đầu tiên (rẻ nhất mỗi xe 2.600–3.400)

  // ---------------------------------------------------------------------------
  // DANH MỤC
  // ---------------------------------------------------------------------------
  // speed / accel: hệ số nhân tốc độ tối đa / gia tốc (giáp nặng làm xe chậm đi)
  const MODULES = {
    era: {
      name: 'Giáp phản ứng nổ', icon: 'bolt', cat: 'armor', adv: true, price: 3200, tanks: ['ALL_ROUNDER', 'GATLING', 'SCOUT'], speed: 0.97,
      desc: 'Gạch nổ phủ mũi, sườn và tháp — khắc tinh của đạn nổ lõm. Trúng gạch: phá hủy hẳn RPG, bom con đạn chùm (xe tăng không mất máu; vỏ mỏng phía sau gạch vẫn bị phần luồng phụt còn lại khoét thủng: xe 6 nòng còn ~15%, xe trinh sát ~30% sát thương); tên lửa đầu nổ kép chỉ giảm 15%, đạn xuyên giáp giảm 40%. Đạn nổ phá 120mm (không phải nổ lõm) làm gạch nổ nhưng chỉ giảm 20%, lựu pháo 155mm giảm 15%. Đạn súng máy / 30mm không làm gạch nổ. Mảng gạch đã nổ thì mất.'
    },
    slat: {
      name: 'Giáp lồng chống RPG', icon: 'grid-dots', cat: 'armor', price: 1800, tanks: ['ALL_ROUNDER', 'GATLING', 'ARTILLERY'], speed: 0.98,
      desc: 'Lồng thép bắt bằng tay đỡ quanh sườn và đuôi xe (xe pháo: che cả cabin), thêm mái lồng trùm nóc chống UAV cảm tử bổ nhào; mái lồng đỡ được chút ít tên lửa đột nóc (mất 80–85% máu thay vì 90–95%). Trúng lồng: chặn hẳn ~6/10 RPG / UAV cảm tử (UAV lọt qua còn 65% sát thương), ~1/4 tên lửa và đạn nổ lõm 2 tầng của pháo tăng, ~6/10 bom con đạn chùm, ~1/2 lựu đạn 40mm của súng phóng lựu (lọt qua còn 50%); đạn nổ phá còn 75% sát thương, đạn 30mm 70%, đạn cháy 60% và không làm xe bén lửa; đạn xuyên giáp xuyên qua. Nổ gần: mảnh văng -15%, ít thủng lốp / đứt xích / văng phụ kiện hơn một nửa, đạn cháy không bén vào vỏ.'
    },
    applique: {
      name: 'Tấm giáp tăng cường', icon: 'shield', cat: 'armor', adv: true, price: 3800, tanks: ALL, speed: 0.94, accel: 0.94,
      desc: 'Giáp composite gắn thêm ở sườn và má tháp: sườn dày thêm ~45%, mũi ~20%. Trúng mặt có tấm giáp: súng máy chỉ còn 40% sát thương, đạn 30mm 60%, đạn nổ phá 70% và lâu bị đục thủng hơn; mảnh nổ lan giảm 15%. Xe nặng hơn, chậm hơn một chút.'
    },
    spall: {
      name: 'Lớp lót chống mảnh', icon: 'layers-subtract', cat: 'armor', price: 2800, tanks: ALL,
      desc: 'Lớp sợi aramid lót bên trong khoang (không nhìn thấy từ ngoài): khi bị bắn thủng, giữ lại mảnh vỡ bong từ mặt trong giáp, thu hẹp nón mảnh văng -> kíp xe trong khoang chịu ít sát thương hơn (-20%), máy móc / động cơ -10%; mảnh ít bắn vào cơ số đạn nên xe bị hạ ít khi nổ kho đạn lây hơn. Trúng thẳng kho đạn thì thuốc phóng vẫn bén lửa / nổ (gần như không đỡ).'
    },
    aps: {
      name: 'Hệ thống đánh chặn chủ động', icon: 'shield-bolt', cat: 'gear', adv: true, price: 7000, tanks: ['ALL_ROUNDER', 'GATLING'],
      desc: 'Radar + đạn đánh chặn trên nóc tháp tự bắn hạ mối đe dọa giữa đường bay, cách xe ~70M (2 lượt mỗi lần xuất kích, trượt vẫn mất lượt): RPG ~9/10, UAV cảm tử ~85%, tên lửa chống tăng ~3/4; lao bổ nhào gần thẳng đứng từ trên đầu khó chặn hơn (RPG 65%, UAV 60%, tên lửa 55%); tên lửa đột nóc vừa nhanh vừa bổ nhào nên chỉ chặn được ~30%. Đạn pháo tăng tốc độ cao chỉ ~30% và chỉ khi còn đủ 2 lượt (giữ lượt cuối cho RPG / tên lửa / UAV), chặn được thì mảnh vỡ vẫn gây chút sát thương. Không chặn được đạn xuyên giáp và lựu pháo. Radar bị bắn hỏng thì ngừng hoạt động.'
    },
    smoke: {
      // xe tăng đa dụng có sẵn ống phóng khói (BUILTIN, không chiếm ô), xe pháo không lắp được (đứng xa phía sau, không cần khói)
      name: 'Ống phóng lựu khói', icon: 'cloud', cat: 'gear', price: 1500, tanks: ['GATLING', 'SCOUT'],
      desc: 'Phím G: bắn 1 loạt lựu đạn khói (mỗi bên tháp 1 quả) bay ra nổ trên không trước mũi tháp, dựng tường khói dày che khuất tầm nhìn của địch ~15 giây. Mỗi ống chứa 1 quả: mang tối đa bằng số ống (xe 6 nòng / trinh sát 2×3 = 6 quả; xe tăng đa dụng có sẵn 2×4 = 8 ống, mỗi lần xuất kích được 2 quả miễn phí), lấy từ kho lựu đạn khói (mua hoặc xem quảng cáo tiếp tế ở mục ĐẠN), bắn quả nào trừ kho quả đó. Khói đa phổ: đang bị khóa mà phóng khói thì địch mất khóa và không khóa lại được tới khi khói tan. Cụm ống bị bắn hỏng thì bên đó hết bắn được.'
    },
    camo: {
      name: 'Lưới ngụy trang', icon: 'leaf', cat: 'gear', price: 1600, tanks: ['ALL_ROUNDER', 'GATLING', 'SCOUT'],   // xe pháo không ngụy trang được
      desc: 'Phủ kín lá cây & cành lên xe, nhìn như một bụi cây. Khi đứng yên: địch phải tới gần hơn ~35% mới thấy và khóa được, radar chỉ bắt được ở ~60% tầm. Chạy hoặc nổ súng là lộ.'
    },
    fireext: {
      name: 'Bình chữa cháy tự động', icon: 'fire-extinguisher', cat: 'gear', price: 1200, tanks: ALL,
      desc: 'Cảm biến lửa + bình khí dập lửa trong khoang: dập lửa trên xe nhanh gấp 2,5 lần, cháy gây sát thương giảm một nửa. Đạn cháy: sát thương -20%, khó bén lửa hơn hẳn (còn ~40%), bén thì cháy ngắn hơn. Đạn xuyên giáp lọt vào khoang: dập ngay chớp lửa thuốc phóng / dầu -> sát thương -8% (trúng kho đạn -15%), ít bốc cháy hơn một nửa. Không dập nổi mảnh urani nghèo tự bốc cháy (đạn xuyên lõi urani nghèo).'
    },
    radar: {
      name: 'Radar dò tìm', icon: 'radar-2', cat: 'gear', adv: true, price: 5000, tanks: ['ALL_ROUNDER', 'GATLING', 'ARTILLERY'],
      desc: 'Radar nhỏ trên cột ống lồng nóc tháp quét quanh xe: bắt được xe địch trong bán kính ~600M (xe núp bụi: ~420M), hiện chấm trên bản đồ, báo vị trí cho đồng đội. Xe trinh sát đã có radar riêng; radar phòng không của xe 6 nòng chỉ bắt drone.'
    },
    jammer: {
      name: 'Máy gây nhiễu', icon: 'antenna-bars-off', cat: 'gear', adv: true, price: 5000, tanks: ALL,
      desc: 'Tổ hợp gây nhiễu quang - điện tử (kiểu Shtora): 2 đèn hồng ngoại nhấp nháy làm rối máy bám tên lửa của xe phóng + phát nhiễu radar. Đầu dò tên lửa địch mất gấp đôi thời gian mới khóa được bạn, tên lửa đang bay bị dẫn chập chờn (lắc chệch cỡ nửa thân xe, chỉ bám lại ở đoạn cuối), radar địch cứ 2 vòng quét mới bắt được bạn 1 lần. Thêm vòm nhiễu liên lạc drone vô hướng quanh xe (bán kính ~300M, tự động): drone địch lọt vào bị nhiễu hình, lệnh chập chờn; UAV cảm tử nằm trong vùng ~0,7 s là mất điều khiển, chao lệch rồi đâm xuống cạnh xe. Không tác dụng với đạn pháo / đạn súng thường (không có dẫn hướng).'
    },
    // --- Ô NÓC THÁP xe tăng (1 món, chỗ phía nạp đạn): chọn [4] trong trận. Để trống = máy phá sóng (ROOF_DEFAULT) ---
    ewjam: {
      name: 'Máy phá sóng chống UAV', icon: 'drone-off', cat: 'roof', price: 0, tanks: ['ALL_ROUNDER'],
      desc: 'Mảng ăng-ten phát chùm định hướng trên bệ xoay. Phím [4], ngắm tâm kính vào drone rồi GIỮ Space: drone trong chùm (~550, hẹp ±8°, đầu phát bám drone khóa nhưng quay chậm) nhiễu hình rồi mất liên lạc, bị ép bay về; chiếu trúng xe có radar khóa mục tiêu thì radar đó mù vài giây. Pin phát ~12 s, sạc đầy ~30 s. Đang phát thì địch dò ra vị trí xe. Không bắn hạ được gì. Mặc định khi ô nóc để trống.'
    },
    rcws: {
      name: 'Trạm súng máy 7.62mm', icon: 'crosshair', cat: 'roof', price: 2200, tanks: ['ALL_ROUNDER'],
      desc: 'Súng máy điều khiển từ xa có camera ngày / nhiệt, quay độc lập với tháp. Phím [4], giữ Space xả ~11 phát/giây, dây 200 viên, thay hộp 5 s. Bắn rơi drone (~7 phát trúng), quét xe giáp mỏng / phụ kiện ngoài; gần như vô hại với xe tăng. Chọn xong tự ngóc lên trời phòng không, nhấp vào drone để khóa & đón đầu.'
    },
    agl: {
      name: 'Súng phóng lựu tự động 40mm', icon: 'bomb', cat: 'roof', adv: true, price: 3400, tanks: ['ALL_ROUNDER', 'GATLING'],
      desc: 'Súng phóng lựu liên thanh trên bệ điều khiển từ xa. Phím [4], giữ Space bắn ~5 quả/giây theo đường cầu vồng thấp (tầm ~1.500), dây 32 quả, thay hộp 7 s. Mỗi quả nổ mảnh bán kính nhỏ: phá xe giáp mỏng, xe đứng sau vật cản thấp, làm hỏng phụ kiện ngoài; yếu với giáp xe tăng.'
    },
    // mã 'rocket' giữ nguyên cho đồ đã mua: trước là giàn rocket 4 ống không điều khiển, nay là bệ tên lửa đột nóc 2 ống
    rocket: {
      name: 'Bệ tên lửa đột nóc 2 ống', icon: 'arrow-big-down-lines', cat: 'roof', adv: true, price: 6500, tanks: ['ALL_ROUNDER'],
      desc: 'Hai ống tên lửa chống tăng tấn công đỉnh trên bệ xoay kiểu Javelin (bắn-và-quên): đầu dò ảnh nhiệt tự bám mục tiêu sau khi phóng, xe phóng rút được ngay. Phím [4], chọn xe địch (nhấp chuột / Tab) và giữ tâm ngắm trên xe ~2,5 s để đầu dò khóa (lệch tâm thanh khóa tụt về 0; không khóa được khi địch trong khói hoặc bụi), bấm Space phóng: khí nén đẩy tên lửa ra khỏi ống, động cơ đánh lửa vút lên cao rồi bổ nhào xuống NÓC xe — xe tăng / xe 6 nòng mất 90–95% máu (có mái lồng: 80–85%), xe trinh sát / pháo tự hành hạ gọn. Chỉ 2 quả mỗi lần xuất kích, không nạp lại. Cự ly 300–1.600; mất dấu nếu địch thả khói hoặc lẩn vào bụi rậm / rừng.'
    },
    // --- Ô NÓC THÁP xe 6 nòng (chân đế mô-đun sau nắp tháp; để trống = không mang gì) ---
    rjam: {
      name: 'Máy phá khóa radar tầm gần', icon: 'radar-off', cat: 'roof', adv: true, price: 4800, tanks: ['GATLING'],
      desc: 'Bó ăng-ten phát nhiễu đa hướng trên chân đế nóc tháp. Phím [4] bật / tắt (pin ~10 s, sạc ~25 s). Đang phát: xe địch trong ~650 không khóa được xe bạn (khóa đang có bị bẻ gãy), tên lửa dẫn đường đang lao tới mất dẫn hướng, radar địch nhiễu hạt. Đổi lại địch dò phương thấy vị trí xe bạn.'
    },
    // --- Ô MŨI XE xe 6 nòng: lưỡi ủi (mặc định) hoặc khiên chữ V ---
    dozer: {
      name: 'Lưỡi ủi thủy lực', icon: 'shovel', cat: 'front', price: 0, tanks: ['GATLING'],
      desc: 'Lưỡi ủi bắt trên 2 tay đẩy trước mũi xe. Giữ X để đào: xe ủi đất đắp ụ chắn trước mặt và hạ mình xuống hố (đất hút phần lớn mảnh văng, đạn phải xuyên qua ụ). Mặc định khi ô mũi xe để trống.'
    },
    vshield: {
      name: 'Khiên giáp chữ V', icon: 'shield-chevron', cat: 'front', adv: true, price: 3600, tanks: ['GATLING'], speed: 0.9, accel: 0.8,
      desc: 'Hai tấm thép dày ghép mũi nhọn, đặt CÁCH mũi xe một khoảng (giáp cách quãng), tay đỡ bắt vào thân: giáp mặt trước dày thêm ~40%. Đạn bắn tới từ phía trước dễ bị tấm xiên làm chệch: đạn súng máy ~3/4, 30mm ~60%, đạn nổ phá ~1/3, đầu nổ lõm ~1/4, xuyên giáp ~15% — phát chệch chỉ còn chút sát thương. Đầu nổ lõm kích nổ trên tấm, luồng phụt tản qua khoảng hở: RPG / UAV cảm tử còn ~35%, tên lửa đầu nổ kép ~60%. Quả nổ trước mũi giảm 25% sức nổ. Không che nóc (tên lửa đột nóc, lựu pháo). Tấm bị bắn mòn dần rồi bung. Kèm bao cát đối trọng chất kín đuôi xe (trong lồng chống RPG, chặn luôn cửa sau): giáp đuôi dày thêm ~30%, đạn súng máy vào đuôi còn ~1/3, 30mm ~1/2, đạn nổ ~70%, nổ lõm ~75%, mảnh nổ phía sau giảm 20% — bao bị bắn rách, bung dần thì tác dụng giảm theo, xuất kích sau chất lại đủ. Nặng: tốc độ -10%, tăng tốc -20%. Mất khả năng đào ụ đất.'
    },
    // --- Ô HỘP ĐẠN xe 6 nòng: 2 hòm đạn hai bên tháp (fsv_hailstorm.js mountMag) — hòm 300 viên (mặc định), 450, 650 ---
    mag300: {
      name: 'Hòm đạn 300 viên', icon: 'box', cat: 'mag', price: 0, tanks: ['GATLING'],
      desc: 'Hai hòm đạn 30mm gọn hai bên tháp: băng 300 viên (~10 s xả liên tục, xả hết băng nòng mới ấm lên), thay hòm ~6 s. Mặc định khi ô hộp đạn để trống.'
    },
    mag450: {
      name: 'Hòm đạn 450 viên', icon: 'box', cat: 'mag', adv: true, price: 3200, tanks: ['GATLING'],
      desc: 'Hòm đạn dài hơn, kéo ra sau tới gần ống phóng khói: băng 450 viên (~15 s xả liên tục, hết băng nòng đỏ sẫm), thay hòm ~8 s.'
    },
    mag650: {
      name: 'Hòm đạn 650 viên', icon: 'box', cat: 'mag', adv: true, price: 6400, tanks: ['GATLING'],
      desc: 'Hòm đạn cỡ lớn vừa dài vừa cao nhô quá nóc tháp: băng 650 viên (~21 s xả liên tục — hết băng là nòng nóng đỏ rực, vừa chạm ngưỡng quá nhiệt), nhưng hòm nặng, thay hòm ~10,5 s.'
    },
    // --- Ô VŨ KHÍ CHÍNH xe trinh sát (vòng tháp): súng máy 12.7mm (mặc định) hoặc trạm vũ khí trên chân đế mô-đun ---
    hmg: {
      name: 'Súng máy 12.7mm', icon: 'crosshair', cat: 'weapon', price: 0, tanks: ['SCOUT'],
      desc: 'Súng máy hạng nặng trên vòng tháp có tấm chắn: giữ Space xả đạn, dây 100 viên. Thủng lốp, phá phụ kiện, xuyên giáp nhẹ, bắn rơi drone. Mặc định khi ô vũ khí chính để trống.'
    },
    sagl: {
      name: 'Súng phóng lựu tự động 40mm HV', icon: 'bomb', cat: 'weapon', adv: true, price: 4600, tanks: ['SCOUT'],
      desc: 'Trạm súng phóng lựu sơ tốc cao trên chân đế mô-đun thay súng máy: giữ Space ~4 quả/giây, dây 48 quả, nạp 8 s. Lựu nổ mạnh hơn bản xe tăng (~1,3×). Ngóc được tới 45°: bắn cầu vồng tầm trung vào xe núp sau đồi / nhà. Không bắn drone.'
    },
    srocket: {
      name: 'Giàn rocket 8 ống', icon: 'rocket', cat: 'weapon', adv: true, price: 4000, tanks: ['SCOUT'],
      desc: 'Giàn 8 ống rocket không điều khiển đầu nổ lõm trên chân đế mô-đun thay súng máy: giữ Space phóng lần lượt (~1 quả / 0,6 s), hết giàn nạp lại ~25 s. Xuyên giáp như RPG — đủ đánh sườn / đuôi xe tăng; bay chậm, khó trúng xa. Rocket có ngòi nổ cận đích: khóa drone địch (máy tính hỏa lực tự đón đầu) rồi phóng loạt — nổ sát drone là hạ.'
    },
    // --- Ô UAV lựu pháo: UAV trinh sát (mặc định) hoặc UAV cảm tử ---
    recon: {
      name: 'UAV trinh sát', icon: 'drone', cat: 'uav', price: 0, tanks: ['ARTILLERY'],
      desc: 'Drone 4 cánh đậu trên nóc cabin: Ctrl để phóng, bay quan sát và chỉ điểm cho pháo bắn cầu vồng tới hết tầm. Pin ~90 s, sạc lại khi đậu. Mặc định khi ô UAV để trống.'
    },
    // --- Ô ĐỘNG CƠ: máy nguyên bản (mặc định) không tăng tốc được; lắp động cơ mới giữ Shift tăng tốc. boost: spd / acc —
    // hệ số tốc độ tối đa / gia tốc khi tăng tốc hết cỡ, heat — số giây giữ Shift liên tục tới quá nhiệt (nhả nguội nhanh
    // gấp đôi), spool — thời gian lên công suất (tuabin trễ, mô-tơ điện tức thì). Rất đắt, chỉ mua bằng Bạc (noAd) ---
    stock: {
      name: 'Động cơ diesel nguyên bản', icon: 'engine', cat: 'engine', price: 0, tanks: ALL,
      desc: 'Máy zin của xe: chạy đúng tốc độ thiết kế, KHÔNG có chế độ tăng tốc (giữ Shift không nhanh hơn). Mặc định khi ô động cơ để trống.'
    },
    tdiesel: {
      name: 'Diesel tăng áp', icon: 'engine', cat: 'engine', adv: true, noAd: true, price: 12000, tanks: ALL,
      boost: { spd: 1.25, acc: 1.3, heat: 14, spool: 0.35 },
      desc: 'Bộ tăng áp khí xả + bơm cao áp chỉnh lại: giữ Shift vượt tốc +25%, gia tốc +30%. Gằn hết ga ~14 s là nóng máy, quá nhiệt phải nhả ga chờ nguội. Rít turbo, nhả ga xì van xả áp.'
    },
    twinturbo: {
      name: 'Diesel tăng áp kép + làm mát phun nước', icon: 'engine', cat: 'engine', adv: true, noAd: true, price: 20000, tanks: ALL,
      boost: { spd: 1.38, acc: 1.45, heat: 20, spool: 0.45 },
      desc: 'Hai bộ tăng áp nối tầng + két làm mát khí nạp phun nước: tăng tốc +38%, gia tốc +45%, chịu được ~20 s hết ga. Rít hai tầng, gầm dày hơn hẳn.'
    },
    turbine: {
      name: 'Tuabin khí 1.500 mã lực', icon: 'engine', cat: 'engine', adv: true, noAd: true, price: 32000, tanks: ['ALL_ROUNDER', 'GATLING'],
      boost: { spd: 1.5, acc: 1.7, heat: 28, spool: 0.6 },
      desc: 'Thay khối diesel bằng tuabin khí (kiểu AGT-1500 xe tăng chủ lực): tăng tốc +50%, gia tốc +70%, chạy hết ga ~28 s mới nóng. Lên công suất trễ ~0,6 s; tiếng rít phản lực cao vút, gần như không còn tiếng nổ piston.'
    },
    hybrid: {
      name: 'Diesel-điện hybrid', icon: 'engine', cat: 'engine', adv: true, noAd: true, price: 28000, tanks: ['SCOUT', 'ARTILLERY'],
      boost: { spd: 1.45, acc: 1.8, heat: 26, spool: 0.05 },
      desc: 'Máy phát diesel + mô-tơ điện ở từng cụm bánh, pin đệm: mô-men tức thì (gia tốc +80%), tăng tốc +45%, ~26 s mới nóng. Rít mô-tơ điện & biến tần, diesel chạy êm phía sau.'
    },
    kami: {
      name: 'UAV cảm tử', icon: 'drone-off', cat: 'uav', adv: true, price: 4400, tanks: ['ARTILLERY'],
      desc: 'Đạn bay lảng vảng cánh gập phóng từ ống trên chân đế mô-đun (thay drone trinh sát). Ctrl phóng, bay như drone, Space để bổ nhào vào điểm giữa màn hình / xe đang khóa: trúng nóc / sườn xe tăng mất ~70–80% máu, xe nhẹ (trinh sát, pháo) thì hạ gọn. Mỗi drone dùng 1 lần (vật tư UAV cảm tử). Mất drone trinh sát: pháo chỉ bắn được trong tầm nhìn thẳng.'
    }
  };
  // Ô 1 món để trống: xe mang món mặc định của ô đó (như trước khi có ô): xe tăng — máy phá sóng, xe 6 nòng — lưỡi ủi,
  // xe trinh sát — súng máy 12.7mm, lựu pháo — UAV trinh sát. Xe 6 nòng để trống nóc tháp = không mang gì
  const SLOT_DEFAULT = { roof: { ALL_ROUNDER: 'ewjam' }, front: { GATLING: 'dozer' }, mag: { GATLING: 'mag300' }, weapon: { SCOUT: 'hmg' }, uav: { ARTILLERY: 'recon' },
    engine: { ALL_ROUNDER: 'stock', GATLING: 'stock', ARTILLERY: 'stock', SCOUT: 'stock' } };
  // Món đã thôi bán: máy chủ hoàn Bạc cho ai đã mua (server_accounts.js) — 'turbo' (tăng áp +8%) thay bằng ô ĐỘNG CƠ
  // giá trị: số = thôi bán cho mọi xe; { price, tanks } = chỉ thôi bán cho các xe đó (giáp lồng bỏ khỏi xe trinh sát)
  // sradar: radar dò tìm trên chân đế nóc tháp xe 6 nòng — thừa (xe 6 nòng đã có radar phòng không riêng + lắp được Radar dò
  // tìm ở ô phụ kiện, hai món không cộng dồn) -> thôi bán, hoàn đúng giá đã mua
  const RETIRED_ITEMS = { turbo: 3000, slat: { price: 1800, tanks: ['SCOUT'] }, sradar: 4200 };
  const ROOF_DEFAULT = SLOT_DEFAULT.roof;
  // Nhóm trong bảng chọn trang bị & số ô tối đa mỗi nhóm (đạn cao cấp không chiếm ô)
  const catSize = (c) => Object.keys(MODULES).filter(id => MODULES[id].cat === c).length;
  const CATS = {
    armor: { name: 'GIÁP', icon: 'shield-half-filled', slots: UNLIMITED_SLOTS ? catSize('armor') : 2 },
    ammo: { name: 'ĐẠN', icon: 'rocket', slots: 0 },
    gear: { name: 'PHỤ KIỆN', icon: 'cpu', slots: UNLIMITED_SLOTS ? catSize('gear') : 2 },
    roof: { name: 'NÓC THÁP', icon: 'arrow-bar-to-up', slots: 1 },   // chỉ 1 bệ gắn trên nóc, kể cả khi mở hết ô
    front: { name: 'MŨI XE', icon: 'shield-chevron', slots: 1 },
    mag: { name: 'HỘP ĐẠN', icon: 'box', slots: 1 },
    weapon: { name: 'VŨ KHÍ CHÍNH', icon: 'crosshair', slots: 1 },
    uav: { name: 'UAV', icon: 'drone', slots: 1 },
    engine: { name: 'ĐỘNG CƠ', icon: 'engine', slots: 1 }
  };
  // Nhóm 1 bệ gắn (chọn món khác là thay món cũ): nóc tháp, mũi xe, hộp đạn, vũ khí chính, UAV, động cơ
  const MOUNT_CATS = ['roof', 'front', 'mag', 'weapon', 'uav', 'engine'];
  const SLOTS = Object.keys(CATS).reduce((n, c) => n + CATS[c].slots, 0);   // tổng số ô các nhóm
  /** Món đang gắn ở ô 1 bệ `cat` của bộ đồ (để trống -> mặc định theo xe; xe không có ô đó -> null) */
  function slotOf(kit, tank, cat) {
    const m = kit && Array.isArray(kit.m) ? kit.m.find(id => MODULES[id] && MODULES[id].cat === cat && MODULES[id].tanks.includes(tank)) : null;
    return m || (SLOT_DEFAULT[cat] && SLOT_DEFAULT[cat][tank]) || null;
  }
  function roofOf(kit, tank) { return slotOf(kit, tank, 'roof'); }
  // Trang bị có sẵn theo xe (không chiếm ô, không cần mua): xe tăng đa dụng luôn có ống phóng lựu khói
  const BUILTIN = { ALL_ROUNDER: ['smoke'] };
  const builtin = (tank, id) => !!(BUILTIN[tank] && BUILTIN[tank].includes(id));
  const EQ_RADAR_RANGE = 600;   // radar lắp thêm (xe trinh sát: 950)

  // Đạn cao cấp: mua 1 lần cho 1 xe, luôn dùng. pen: hệ số độ xuyên; splash: hệ số sát thương nổ lan; tandem: đầu nổ kép
  const PREMIUM = {
    // du: lõi urani nghèo — hiệu ứng trúng riêng (mảnh tự bốc cháy, khói oxit trắng: explosion_fx), xuyên vào khoang dễ gây
    // cháy hơn (VehicleDamage, DU_FIRE). Đạn xuyên giáp thường là lõi hợp kim vonfram
    ap_du: { tank: 'ALL_ROUNDER', cat: 'ammo', adv: true, ammo: 'AP', du: true, name: 'Đạn xuyên lõi urani nghèo', icon: 'arrow-big-right-lines', price: 4500, pen: 1.22, loss: 0.6, desc: 'Thay lõi hợp kim vonfram bằng lõi urani nghèo: mũi tên tự mài nhọn khi xuyên (không nở nấm như vonfram) nên xuyên sâu hơn 22%, nặng hơn nên giữ tốc độ tốt — bắn xa chỉ mất ~60% sức xuyên so với đạn thường. Mảnh urani tự bốc cháy khi va chạm: chớp trắng gắt, mảnh cháy rực, xuyên vào khoang dễ làm xe bén lửa hơn ~1,5 lần.' },
    heat_tandem: { tank: 'ALL_ROUNDER', cat: 'ammo', adv: true, ammo: 'NORMAL', name: 'Đạn nổ lõm 2 tầng', icon: 'flame', price: 3500, pen: 1.1, tandem: true, splash: 0.6, desc: 'Thay đạn nổ phá thường bằng đạn nổ lõm có đầu nổ mồi: xuyên ~530mm, phá gạch giáp nổ trước. Đổi lại sức ép / mảnh nổ lan yếu hơn đạn nổ phá (~60%).' },
    apds30: { tank: 'GATLING', cat: 'ammo', adv: true, ammo: 'GATLING_BULLET', name: 'Đạn 30mm xuyên dưới cỡ', icon: 'arrow-big-right-lines', price: 3800, pen: 1.36, splash: 0, desc: 'Đạn 30mm lõi tungsten: xuyên sâu hơn 36%, đục thủng sườn xe tăng nhanh hơn. Lõi đặc không có thuốc nổ: hết mảnh nổ lan khi bắn trượt sát xe.' },
    // ammo: khóa riêng (không thay đạn nổ - mảnh / xuyên dưới cỡ đã mua): chỉ thêm ngòi lập trình cho đạn 30mm thường
    ahead30: { tank: 'GATLING', cat: 'ammo', adv: true, ammo: 'GATLING_ABM', name: 'Đạn 30mm nổ trên không', icon: 'drone-off', price: 4200, desc: 'Ngòi lập trình theo cự ly radar đo được: khi khóa drone, mỗi viên tự nổ ngay trước drone, phóng chùm bi vonfram hình nón — bắn drone hiệu quả hơn hẳn. Cần radar phòng không còn hoạt động; bắn xe như đạn thường.' },
    // tên lửa tấn công đỉnh (kiểu Javelin): vồng cao rồi bổ nhào trúng nóc xe — ballistics.guideMissile đọc .top
    topatk: { tank: 'SCOUT', cat: 'ammo', adv: true, ammo: 'ANTI_TANK_MISSILE', top: true, name: 'Tên lửa chống tăng tấn công đỉnh', icon: 'arrow-big-down-lines', price: 7500, desc: 'Thay tên lửa chống tăng thường bằng loại tấn công đỉnh (bắn-và-quên kiểu Javelin): ống phóng có khối ngắm nhiệt CLU — khóa xong phóng là xạ thủ thụp xuống / xe rút ngay được, đầu dò ảnh nhiệt trên tên lửa tự bám mục tiêu (mất dấu khi mục tiêu thả khói hoặc lẩn vào bụi rậm / rừng), tên lửa vồng lên cao rồi bổ nhào gần thẳng đứng xuống NÓC xe — nơi giáp mỏng nhất: xe tăng / xe 6 nòng mất 90–95% máu (có mái lồng: 80–85%), xe trinh sát / pháo tự hành hạ gọn; hệ thống đánh chặn chủ động chỉ chặn được ~30%. Bắn được qua vật cản thấp; bay lâu hơn nên địch có thời gian né / thả khói.' },
    // ammo: khóa riêng (như ahead30) -> mua cả SLAP thì dây đạn trộn xen kẽ 1:1 SLAP / Mk211 (dây đạn trộn như ngoài đời)
    mk211: { tank: 'SCOUT', cat: 'ammo', adv: true, ammo: 'HMG_HEIAP', heiap: true, name: 'Đạn 12.7mm nổ-cháy-xuyên Mk211', icon: 'drone-off', price: 3200, desc: 'Đạn đa năng kiểu Raufoss Mk211 thay đạn 12.7mm thường: ngòi chạm nổ ngay trên vỏ mỏng, nổ-cháy kèm lõi xuyên. Trúng drone: 1 phát vào thân là rơi, trúng cánh / cần quạt 2 phát (đạn thường 3). Xuyên được vỏ xe trinh sát / pháo tự hành thì nổ-cháy bên trong: sát thương mạnh hơn ~40%. Xuyên giáp gần ngang đạn thường (lõi các-bua vonfram), vẫn không thủng nổi giáp xe tăng / xe 6 nòng. Vẫn phải bắn trúng — không có ngòi cận đích. Mua cả đạn SLAP: dây đạn trộn xen kẽ.' },
    slap127: { tank: 'SCOUT', cat: 'ammo', adv: true, ammo: 'SCOUT_BULLET', name: 'Đạn 12.7mm SLAP', icon: 'arrow-big-right-lines', price: 2600, pen: 1.6, desc: 'Đạn 12.7mm xuyên dưới cỡ có đai nhựa: xuyên sâu gấp 1,6 lần.' },
    he_frag: { tank: 'ARTILLERY', cat: 'ammo', adv: true, ammo: 'HE', name: 'Lựu đạn mảnh định sẵn', icon: 'atom-2', price: 3500, splash: 1.15, desc: 'Vỏ đạn 155mm khía rãnh tạo mảnh đều: sát thương nổ lan +15%.' }
  };

  // VẬT TƯ TIÊU HAO (đạn đặc chủng + lựu đạn khói): giá 1 viên (Bạc), bán theo gói `pack` viên, tối đa `max` viên mang
  // theo mỗi lần xuất kích, `ad` = số viên nhận được khi xem 1 quảng cáo tiếp tế (= `max`: 1 lượt xem nạp đủ 1 lần xuất kích —
  // trước đây chỉ ~60–180 Bạc / lượt, kém xa 1.000 Bạc / lượt khi xem để mở khóa nên không ai xem tiếp tế).
  // CÂN BẰNG (2026-10): mang đủ 1 lần xuất kích tốn ~250–400 Bạc; trận 10 phút xài vừa phải ~300–500, xài hết cỡ ~600–900,
  // mua lại giáp bị phá (~300–1.300 / trận bị đánh nhiều). Thu nhập trận: xem silverFor — chơi bình thường đủ đồ thì hụt,
  // phải săn xe / hòm thả dù / vào top hoặc xem quảng cáo tiếp tế mới dư để mở khóa trang bị.
  // gear: chỉ nạp khi xe có lắp mô-đun đó (lựu đạn khói cần Ống phóng lựu khói).
  // Lựu đạn khói: mỗi ống phóng chứa 1 quả -> mang tối đa = tổng số ống 2 bên (SMOKE_TUBES), 1 loạt = mỗi bên 1 quả
  const SMOKE_TUBES = { ALL_ROUNDER: 4, GATLING: 3, ARTILLERY: 3, SCOUT: 3 };
  const smokeItem = (tank) => ({ name: 'Lựu đạn khói', price: 15, pack: 2, max: 2 * SMOKE_TUBES[tank], ad: 2 * SMOKE_TUBES[tank], gear: 'smoke' });
  const AMMO_SHOP = {
    ALL_ROUNDER: { AP: { name: 'Đạn xuyên giáp', price: 30, pack: 5, max: 6, ad: 6 }, HE: { name: 'Đạn nổ mạnh', price: 20, pack: 5, max: 6, ad: 6 }, SMOKE: smokeItem('ALL_ROUNDER') },
    ARTILLERY: { HE: { name: 'Lựu đạn nổ mạnh 155', price: 25, pack: 5, max: 6, ad: 6 }, CLUSTER: { name: 'Đạn chùm 155', price: 45, pack: 2, max: 4, ad: 4 }, KAMIKAZE: { name: 'UAV cảm tử', price: 150, pack: 1, max: 2, ad: 2, gear: 'kami' } },
    // đạn 30mm nổ mảnh ngòi cận đích (phòng không): không có sẵn khi xuất kích — phải mua (đắt hơn đạn cháy: ngòi vô tuyến)
    GATLING: { INCENDIARY: { name: 'Đạn cháy 30mm', price: 2, pack: 50, max: 150, ad: 150 }, GATLING_HE: { name: 'Đạn 30mm nổ mảnh ngòi cận đích', price: 5, pack: 40, max: 100, ad: 100 }, SMOKE: smokeItem('GATLING') },
    SCOUT: { INCENDIARY: { name: 'Đạn cháy 12.7mm', price: 1, pack: 50, max: 90, ad: 90 }, ANTI_TANK_MISSILE: { name: 'Tên lửa chống tăng', price: 60, pack: 1, max: 3, ad: 3 }, SMOKE: smokeItem('SCOUT') }
  };
  // Đạn đã ngừng bán (xe không còn ô bắn loại này): máy chủ tự hoàn đúng giá cho số còn trong kho rồi xóa khỏi kho
  // (RPG của xe trinh sát: đã thay bằng tên lửa chống tăng). Chỉ hoàn phần mua bằng Bạc, không hoàn phần nhận từ quảng cáo
  // (lựu đạn khói của xe pháo: xe pháo không còn lắp ống phóng khói)
  const RETIRED_AMMO = { SCOUT: { RPG: { price: 45 } }, ARTILLERY: { SMOKE: { price: smokeItem('ARTILLERY').price } } };

  // QUẢNG CÁO CÓ THƯỞNG (máy chủ kiểm tra): tối đa DAILY lượt / ngày / tài khoản, mỗi lượt cách nhau COOLDOWN_SEC,
  // phải xem ít nhất MIN_SEC giây (mạng quảng cáo thật có quảng cáo ngắn); khung quảng cáo mẫu dài MOCK_SEC giây.
  // Quá DAILY lượt: thêm BONUS lượt "thưởng nửa" (chỉ vật tư, được ceil(ad * BONUS_MUL)) -> xem thêm vẫn có lợi
  // nhưng giảm dần; tổng trần cứng DAILY + BONUS / ngày chặn cày thưởng bằng cách gọi API liên tục.
  const AD = { DAILY: 10, BONUS: 10, BONUS_MUL: 0.5, MIN_SEC: 5, COOLDOWN_SEC: 45, MOCK_SEC: 15 };
  const adAmmoN = (A, used) => used < AD.DAILY ? A.ad : Math.max(1, Math.ceil(A.ad * AD.BONUS_MUL));

  // QUAY THƯỞNG HẰNG NGÀY (máy chủ quay, máy khách chỉ diễn hoạt cảnh): 1 lượt / ngày (giờ VN), đổi thưởng theo bảng
  // trọng số dưới. Quay liên tiếp nhiều ngày (streak, chu kỳ 7 ngày): ngày 1-6 như nhau, ngày 7 có quà đặc biệt.
  // Đồ nâng cao: chỉ rơi món người chơi CHƯA có cho xe đó; có hết rồi -> đổi thành Bạc = nửa giá món.
  // Vật tư: vào kho phần "free" (như quà quảng cáo, không bán lại lấy Bạc), không vượt trần kho.
  // rar: độ hiếm để tô màu thẻ (0 thường · 1 khá · 2 hiếm · 3 sử thi · 4 huyền thoại)
  const DAILY_SPIN = {
    STREAK_MAX: 7,
    // CHU KỲ 7 NGÀY: ngày 1..6 quay tỉ lệ như nhau; lượt MIỄN PHÍ ngày 7 là QUÀ ĐẶC BIỆT — chỉ bốc trong các ô
    //   rar >= SPECIAL_RAR (Sử thi / Huyền thoại). Quay tiếp ngày 8 -> chuỗi về ngày 1 của chu kỳ mới.
    SPECIAL_RAR: 3,
    AD_SPINS: 3,   // xem quảng cáo có thưởng -> +1 lượt quay, tối đa AD_SPINS lượt / ngày (sau khi đã dùng lượt miễn phí)
    POOL: [
      { kind: 'silver', n: 300, w: 26, rar: 0 },
      { kind: 'silver', n: 500, w: 22, rar: 0 },
      { kind: 'silver', n: 800, w: 15, rar: 1 },
      { kind: 'silver', n: 1500, w: 8, rar: 2 },
      { kind: 'silver', n: 3000, w: 2.5, rar: 3 },
      { kind: 'silver', n: 8000, w: 0.6, rar: 4 },
      { kind: 'ammo', packs: 2, w: 16, rar: 1 },
      { kind: 'item', w: 4.5, rar: 3 },        // đồ nâng cao / đạn cao cấp (không kể động cơ)
      { kind: 'engine', w: 0.4, rar: 4 }       // động cơ tăng tốc (chỉ mua bằng Bạc được — quà quý nhất)
    ]
  };
  // NẠP BẠC (tiền thật qua PayPal — server_accounts.js /api/pay/*). Giá USD, Bạc cộng khi PayPal chốt đơn (capture) xong.
  // TỈ GIÁ: 1 trận ~800 (thua) – 1.500 (thắng) Bạc, ~10 phút -> gốc ~1.000 Bạc / $ (≈ 1 trận thắng / $). Gói to lời dần
  //   (bonus) tới ~1.600 Bạc / $: 1 món nâng cao (~4.400) ≈ gói $4.99, động cơ rẻ nhất (12.000) ≈ gói $9.99.
  // TÂM LÝ (đều là ưu đãi THẬT, không đếm ngược giả / khan hiếm giả):
  //   - giá đuôi .99; gói Tân binh $0.99 chỉ 1 lần, lời gấp đôi -> hạ rào cản lần nạp đầu
  //   - x2 Bạc gốc cho lần mua ĐẦU TIÊN mỗi gói (trừ Tân binh) -> mỗi gói đều có "lần đầu" đáng mua
  //   - gói $1.99 cố ý kém lời nhất (mồi so sánh) -> $4.99 trông hời hẳn
  //   - nhãn PHỔ BIẾN NHẤT ở gói giữa ($9.99), LỜI NHẤT ở $19.99; gói $49.99 làm mỏ neo giá
  //   - hiện Bạc / $ và quy ra món trong game (≈ N trang bị nâng cao, đủ mua động cơ X) cho người chơi tự so
  // spins: lượt quay thưởng tặng kèm (không hết hạn, dùng sau lượt miễn phí & lượt quảng cáo)
  const TOPUP = {
    CURRENCY: 'usd',
    FIRST_X2: true,
    PACKS: [
      { id: 'starter', name: 'Gói Tân binh', icon: 'rosette', usd: 0.99, silver: 2000, spins: 3, once: true, tag: 'CHỈ 1 LẦN' },
      { id: 'p2', name: 'Túi Bạc', icon: 'coin', usd: 1.99, silver: 1800 },
      { id: 'p5', name: 'Hòm Bạc', icon: 'box', usd: 4.99, silver: 5000, bonus: 500 },
      { id: 'p10', name: 'Rương Chỉ huy', icon: 'briefcase', usd: 9.99, silver: 10000, bonus: 2500, spins: 2, tag: 'PHỔ BIẾN NHẤT' },
      { id: 'p20', name: 'Kho Chiến dịch', icon: 'building-warehouse', usd: 19.99, silver: 20000, bonus: 8000, spins: 5, tag: 'LỜI NHẤT' },
      { id: 'p50', name: 'Kho Quân đoàn', icon: 'crown', usd: 49.99, silver: 50000, bonus: 30000, spins: 15 }
    ]
  };
  const topupPack = (id) => TOPUP.PACKS.find(p => p.id === id) || null;
  /** Bạc nhận được khi mua gói (first: lần mua đầu gói này -> x2 Bạc gốc) */
  function topupGrant(pack, first) {
    const x2 = !!(first && TOPUP.FIRST_X2 && !pack.once);
    return { silver: pack.silver * (x2 ? 2 : 1) + (pack.bonus || 0), spins: pack.spins || 0, x2 };
  }

  /** Mọi món đồ nâng cao rơi được từ vòng quay: [{ id, tank, engine }] */
  function spinItems() {
    const out = [];
    for (const id in MODULES) { const m = MODULES[id]; if (m.adv) for (const t of m.tanks) if (compatible(id, t)) out.push({ id, tank: t, engine: m.cat === 'engine' }); }
    for (const id in PREMIUM) if (PREMIUM[id].adv) out.push({ id, tank: PREMIUM[id].tank, engine: false });
    return out;
  }
  /** Mọi gói vật tư rơi được: [{ tank, ammo, n }] (bỏ món cần mô-đun riêng như UAV cảm tử — vẫn rơi, vì có kho riêng) */
  function spinAmmo(packs) {
    const out = [];
    for (const t in AMMO_SHOP) for (const k in AMMO_SHOP[t]) out.push({ tank: t, ammo: k, n: AMMO_SHOP[t][k].pack * packs });
    return out;
  }
  /** Bốc 1 phần thưởng. rnd(): số ngẫu nhiên [0,1); owns(tank, id): đã có món đó chưa; room(tank, ammo): còn chứa được bao nhiêu viên.
   *  Trả { kind: 'silver'|'ammo'|'item', rar, n?, tank?, id?, ammo? } — chưa nhân streak */
  /** Ngày trong chu kỳ 7 ngày (1..STREAK_MAX) của chuỗi streak */
  const spinCycleDay = (streak) => ((Math.max(1, streak | 0) - 1) % DAILY_SPIN.STREAK_MAX) + 1;
  /** Trọng số bảng thưởng: special (quà ngày 7) -> chỉ giữ ô Sử thi trở lên */
  const spinWeights = (special) => DAILY_SPIN.POOL.map(p => special && p.rar < DAILY_SPIN.SPECIAL_RAR ? 0 : p.w);
  /** Tỉ lệ (%) theo độ hiếm [rar0..rar4] */
  function spinOdds(special) {
    const w = spinWeights(special), tot = w.reduce((s, x) => s + x, 0), out = [0, 0, 0, 0, 0];
    DAILY_SPIN.POOL.forEach((p, i) => { out[p.rar] += 100 * w[i] / tot; });
    return out;
  }
  function spinRoll(rnd, owns, room, special) {
    const P = DAILY_SPIN.POOL, W = spinWeights(special), total = W.reduce((s, x) => s + x, 0);
    let x = rnd() * total, e = P[P.length - 1];
    for (let i = 0; i < P.length; i++) { if ((x -= W[i]) < 0) { e = P[i]; break; } }
    if (e.kind === 'silver') return { kind: 'silver', n: e.n, rar: e.rar };
    if (e.kind === 'ammo') {
      const list = spinAmmo(e.packs).map(a => Object.assign(a, { n: Math.min(a.n, room ? room(a.tank, a.ammo) : a.n) })).filter(a => a.n > 0);
      if (!list.length) return { kind: 'silver', n: 500, rar: 0 };
      const a = list[Math.floor(rnd() * list.length)];
      return { kind: 'ammo', tank: a.tank, ammo: a.ammo, n: a.n, rar: e.rar };
    }
    const all = spinItems().filter(it => it.engine === (e.kind === 'engine'));
    const left = all.filter(it => !owns || !owns(it.tank, it.id));
    if (!left.length) {
      const it = all[Math.floor(rnd() * all.length)];
      return { kind: 'silver', n: Math.round(priceOf(it.id) / 2 / 100) * 100, rar: e.rar };
    }
    const it = left[Math.floor(rnd() * left.length)];
    return { kind: 'item', tank: it.tank, id: it.id, rar: e.rar };
  }
  /** Số quảng cáo phải xem để mở khóa 1 món nâng cao cho 1 xe: ~1 quảng cáo / AD_SILVER Bạc giá trị, tối đa AD.DAILY lượt / ngày
   *  (2026-10-27: trước 1 / 1.000 Bạc + 20 lượt / ngày -> xem quảng cáo lời gấp ~6 lần chơi trận, 2 ngày mở gần hết đồ) */
  const AD_SILVER = 600;
  function adsToUnlock(id) {
    const it = MODULES[id] || PREMIUM[id];
    if (it && it.noAd) return 0;   // động cơ: chỉ mua bằng Bạc
    return it ? Math.max(1, Math.round((it.price || 0) / AD_SILVER)) : 0;
  }
  // Đạn đặc chủng miễn phí mỗi lần xuất kích: KHÔNG CÒN — ngoài đạn chính (không giới hạn), mọi loại đạn khác phải
  // mua bằng Bạc (đạn đã mua tự mang theo tới mức tối đa mỗi lần xuất kích). Giữ đủ khóa để startLife đặt lại số đạn.
  // Đạn miễn phí mỗi lần xuất kích (cộng thêm số mua): xe trinh sát luôn có 2 tên lửa để còn đánh được xe giáp;
  // xe tăng đa dụng luôn có 2 đạn xuyên giáp + 2 đạn nổ mạnh + 2 lựu đạn khói (đổi loại đạn theo mục tiêu là sở trường)
  const BASE_AMMO = { ALL_ROUNDER: { AP: 2, HE: 2, SMOKE: 2 }, ARTILLERY: { HE: 0, CLUSTER: 0, KAMIKAZE: 1 }, GATLING: { INCENDIARY: 0, GATLING_HE: 0, SMOKE: 0 }, SCOUT: { INCENDIARY: 0, ANTI_TANK_MISSILE: 2, SMOKE: 0 } };
  // Xe do máy điều khiển không mua sắm: mang cơ số như trước khi có cửa hàng để trận không dễ đi
  const BOT_AMMO = { ALL_ROUNDER: { AP: 1, HE: 1, SMOKE: 6 }, ARTILLERY: { HE: 4, CLUSTER: 3, KAMIKAZE: 0 }, GATLING: { INCENDIARY: 80, GATLING_HE: 60, SMOKE: 6 }, SCOUT: { INCENDIARY: 45, ANTI_TANK_MISSILE: 1, SMOKE: 6 } };   // + đạn miễn phí (BASE_AMMO): trinh sát 3 tên lửa (tối đa 3), xe tăng 3 AP / 3 HE / 8 khói
  const AMMO_PROP = { AP: 'apAmmoCount', HE: 'heAmmoCount', CLUSTER: 'clusterAmmoCount', INCENDIARY: 'incendiaryAmmoCount', GATLING_HE: 'heFragAmmoCount', RPG: 'rpgAmmoCount', ANTI_TANK_MISSILE: 'missileAmmoCount', SMOKE: 'smokeLeft', KAMIKAZE: 'kamikazeCount' };

  function compatible(id, tank) {
    const m = MODULES[id];
    if (m) return m.tanks.includes(tank) && !builtin(tank, id);
    const p = PREMIUM[id];
    return !!(p && p.tank === tank);
  }
  // Đồ cơ bản: chọn lắp miễn phí; đồ nâng cao (adv): phải nhận trước (xem quảng cáo), máy chủ lưu vào kho 'owned'
  // Chế độ mở hết chỉ áp cho trang bị (mô-đun); đạn cao cấp vẫn phải mua
  function isFree(id) { const it = MODULES[id] || PREMIUM[id]; return !!it && ((ALL_FREE && !!MODULES[id]) || !it.adv); }
  function catOf(id) { const it = MODULES[id] || PREMIUM[id]; return it ? it.cat : null; }
  function priceOf(id) {
    return (MODULES[id] && MODULES[id].price) || (PREMIUM[id] && PREMIUM[id].price) || 0;
  }

  /** Bộ trang bị hợp lệ cho xe `tank` (lọc mã lạ / không lắp được, giới hạn số ô & số đạn) */
  function sanitize(kit, tank) {
    const out = { m: [], p: [], a: {} };
    if (!kit || typeof kit !== 'object' || !TANKS.includes(tank)) return out;
    for (const id of Array.isArray(kit.m) ? kit.m : []) {
      if (out.m.length >= SLOTS) break;
      if (!MODULES[id] || !compatible(id, tank) || out.m.includes(id)) continue;
      const c = MODULES[id].cat;
      if (out.m.filter(x => MODULES[x].cat === c).length >= ((CATS[c] && CATS[c].slots) || 0)) continue;   // nhóm đã đủ ô
      out.m.push(id);
    }
    for (const id of Array.isArray(kit.p) ? kit.p : []) if (PREMIUM[id] && PREMIUM[id].tank === tank && !out.p.includes(id)) out.p.push(id);
    const shop = AMMO_SHOP[tank] || {};
    for (const k in shop) {
      const n = Math.floor(Number(kit.a && kit.a[k]) || 0);
      if (n > 0) out.a[k] = Math.min(shop[k].max, n);
    }
    // d: đơn vị giáp đang thiếu (hỏng từ trận trước, chưa sửa) của các món giáp đang lắp — { món: ['eraKitL#3', 'cageKitB'] }
    const dd = sanitizeGone(kit.d, out.m);
    if (dd) out.d = dd;
    return out;
  }
  // TRANG BỊ HỎNG HÓC giữ sang trận sau & khóa đơn vị hợp lệ (vehicle_damage.js ARMOR_ITEM_TAGS): giáp hỏng theo từng
  // khối, đồ nâng cao gắn ngoài hỏng cả món. Trong trận hồi sinh là xe như lúc đầu trận; sau trận món nào bị phá (dù 1 khối)
  // là HỎNG — chưa sửa thì KHÔNG mang ra trận sau (dropDamaged), sửa xong mới lắp lại được.
  const ARMOR_REPAIR = { era: 'gạch', applique: 'tấm', vshield: 'khối', slat: 'tấm lồng', aps: 'bệ phóng',
    radar: 'bộ radar', jammer: 'máy phá sóng', agl: 'bệ súng', rocket: 'bệ tên lửa', rjam: 'máy phá khóa' };
  /** Bộ đồ ra trận: bỏ các món đang hỏng chưa sửa (cond: { món: [khóa đơn vị đã mất] }) — máy chủ (verifyKit) & máy khách */
  function dropDamaged(kit, cond) {
    if (!kit || !Array.isArray(kit.m) || !cond) return kit;
    kit.m = kit.m.filter(id => !(ARMOR_REPAIR[id] && Array.isArray(cond[id]) && cond[id].length));
    delete kit.d;
    return kit;
  }
  const UNIT_KEY = /^[A-Za-z]{3,16}(#\d{1,3})?$/;
  function sanitizeGone(d, items) {
    if (!d || typeof d !== 'object') return null;
    let out = null;
    for (const item in d) {
      if (!ARMOR_REPAIR[item] || (items && !items.includes(item)) || !Array.isArray(d[item])) continue;
      const keys = [...new Set(d[item].map(String).filter(k => UNIT_KEY.test(k)))].slice(0, 300);
      if (keys.length) (out || (out = {}))[item] = keys;
    }
    return out;
  }
  /**
   * Giá mua lại 1 đơn vị giáp đã bị phá: giáp là vật tư tiêu hao — vỡ hết cả món = REPAIR_K giá mua (trước đây đủ giá:
   * xe hay bị bắn lỗ Bạc mỗi trận — giáp phản ứng nổ 3.200 trong khi 1 trận kiếm ~1.000-1.500), tối thiểu 15 Bạc / đơn vị
   */
  const REPAIR_K = 0.35;
  // đồ gắn ngoài hỏng cả món (1 đơn vị): sửa 20% giá (bệ APS 7.000 -> 1.400; trước 35% = 2.450, trúng 1 phát là trắng tay)
  const REPAIR_K_ITEM = { aps: 0.2, radar: 0.2, jammer: 0.2, agl: 0.2, rocket: 0.2, rjam: 0.2 };
  function repairUnitPrice(item, total) {
    const p = (MODULES[item] && MODULES[item].price) || 0;
    return Math.max(15, Math.round(p * (REPAIR_K_ITEM[item] || REPAIR_K) / Math.max(1, total || 1)));
  }

  // Xe do máy điều khiển: 2-4 mô-đun ngẫu nhiên theo hạt giống chung (mọi máy trong phòng ra cùng kết quả),
  // cùng giới hạn ô như người chơi -> trang bị bot ngang ngửa người chơi
  function botKit(tank, rnd) {
    const pool = Object.keys(MODULES).filter(id => compatible(id, tank) && id !== 'aps' && id !== 'kami' && MODULES[id].cat !== 'engine');   // UAV cảm tử chọn riêng bên dưới
    const n = 2 + Math.floor(rnd() * 3);
    const m = [];
    while (m.length < n && pool.length) {
      const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const c = MODULES[id].cat;
      if (m.filter(x => MODULES[x].cat === c).length < ((CATS[c] && CATS[c].slots) || 0)) m.push(id);
    }
    // động cơ: phần lớn bot dùng máy nguyên bản như người chơi mới, ít bot có máy độ (trước đây 75% bot có máy độ -> chạy
    // nhanh hơn người chơi chưa đủ 12.000-32.000 Bạc mua động cơ)
    const er = rnd();
    const top = tank === 'SCOUT' || tank === 'ARTILLERY' ? 'hybrid' : 'turbine';
    const eng = er < 0.7 ? null : er < 0.9 ? 'tdiesel' : er < 0.97 ? 'twinturbo' : top;
    if (eng && compatible(eng, tank)) m.push(eng);
    // lựu pháo: ~1/3 bot mang UAV cảm tử thay UAV trinh sát (bot_drones.js tự lái: chỉ phóng khi phe đã thấy xe địch trong
    // tầm, bay tới rồi bổ nhào) — 2 quả mỗi lần xuất kích. Còn lại: UAV trinh sát bay quan sát, chỉ điểm cho cả phe
    const a = Object.assign({}, BOT_AMMO[tank] || {});
    if (tank === 'ARTILLERY' && rnd() < 0.35) {
      for (let i = m.length - 1; i >= 0; i--) if (MODULES[m[i]] && MODULES[m[i]].cat === 'uav') m.splice(i, 1);
      m.push('kami');
      a.KAMIKAZE = 2;
    }
    return { m, p: [], a };
  }

  // Bạc nhận được sau trận (máy chủ tính)
  // KINH TẾ (2026-10, siết lại): chơi bình thường mà lắp đủ đồ + mang đủ đạn đặc chủng thì hơi hụt (trận ~500–1.200 Bạc,
  // chi đạn + sửa giáp ~600–1.500) -> trận có trận không đủ đồ. Muốn dư: săn xe địch, chiếm hòm thả dù, vào top K/D,
  // hoặc xem quảng cáo (tiếp tế / mở khóa). Phần nền (tham gia, thắng, thời gian) nhỏ — tiền nằm ở thành tích.
  const AIRDROP_SILVER = 250;   // mỗi hòm thả dù chiếm được
  const LOSS_AMMO_REFUND = 0.5; // thua: hoàn 50% tiền đạn đặc chủng (phần mua bằng Bạc) đã bắn trong trận
  function silverFor(result, kills, damage, durSec, airdrops) {
    // 300 cơ bản + thắng 250 / hòa 100 + 150 / hạ + 35 / máu gây ra + 10 / phút trận (tối đa 15 phút) + 250 / hòm thả dù
    // (2026-10-27: nền 150 -> 300 cho người chơi yếu đỡ lỗ; hạ 180 -> 150, sát thương 25 -> 35: góp sát thương cũng được
    //  thưởng dù đồng đội hạ — thu hẹp chênh lệch giỏi / yếu)
    return Math.round(300 + (result === 'win' ? 250 : result === 'draw' ? 100 : 0) + kills * 150 + damage * 35 + Math.min(durSec, 900) / 6
      + (airdrops || 0) * AIRDROP_SILVER);
  }

  // Thưởng top 3 hạ gục / bị hạ (K/D) cả trận, cộng thêm vào thưởng trận: [hạng 1, hạng 2, hạng 3]
  const KD_BONUS = [{ xp: 120, silver: 1000 }, { xp: 80, silver: 600 }, { xp: 50, silver: 350 }];
  /**
   * Xếp hạng K/D: list = [{ key, kills, deaths, damage }] -> 3 phần tử đứng đầu (đã sắp xếp).
   * Phải hạ được ít nhất 1 xe; bằng K/D thì xét số hạ gục, rồi sát thương.
   */
  function rankKD(list) {
    const kd = (u) => u.kills / Math.max(1, u.deaths);
    return list.filter(u => u.kills >= 1)
      .sort((a, b) => kd(b) - kd(a) || b.kills - a.kills || b.damage - a.damage)
      .slice(0, 3);
  }

  const API = { TANKS, ALL_FREE, UNLIMITED_SLOTS, SLOTS, CATS, EQ_RADAR_RANGE, START_SILVER, MODULES, PREMIUM, AMMO_SHOP, RETIRED_AMMO, RETIRED_ITEMS, SMOKE_TUBES, BUILTIN, builtin, BASE_AMMO, BOT_AMMO, AMMO_PROP, KD_BONUS, AIRDROP_SILVER, LOSS_AMMO_REFUND, AD, adAmmoN, DAILY_SPIN, spinItems, spinAmmo, spinRoll, spinCycleDay, spinWeights, spinOdds, TOPUP, topupPack, topupGrant, adsToUnlock, compatible, isFree, catOf, priceOf, sanitize, botKit, silverFor, rankKD, ROOF_DEFAULT, SLOT_DEFAULT, MOUNT_CATS, roofOf, slotOf, ARMOR_REPAIR, dropDamaged, sanitizeGone, repairUnitPrice, noteArmor };
  if (typeof window === 'undefined' || typeof THREE === 'undefined') return API;

  // ===========================================================================
  // PHẦN TRONG TRẬN (TRÌNH DUYỆT)
  // ===========================================================================
  const has = (u, id) => !!(u && ((u.kit && u.kit.m && u.kit.m.indexOf(id) >= 0) || builtin(u.tankType, id)));
  const lost = (u, tag) => !!(u && u.dmg && u.dmg.lost && u.dmg.lost.has(tag));
  const APS_CHARGES = 2;

  /**
   * Lắp bộ trang bị cho xe (gọi 1 lần lúc tạo xe trong trận). opts.local: xe của người chơi máy này;
   * opts.stock: số đạn mua thêm còn trong kho (chỉ người chơi) -> không mang quá số đã mua.
   */
  function equip(u, kit, opts) {
    if (!u) return;
    u.kit = sanitize(kit, u.tankType);
    u._eq = { local: !!(opts && opts.local), stock: Object.assign({}, (opts && opts.stock) || {}), used: {}, loaded: {}, reported: {} };
    // Đạn cao cấp
    u.ammoMods = {};
    for (const id of u.kit.p) { const P = PREMIUM[id]; u.ammoMods[P.ammo] = P; }
    // tên lửa tấn công đỉnh: ống phóng kiểu Javelin trên mô hình xe trinh sát
    if (u.setTopAttack) { try { u.setTopAttack(!!(u.ammoMods.ANTI_TANK_MISSILE && u.ammoMods.ANTI_TANK_MISSILE.top)); } catch (e) { console.warn('[EQ] ống tấn công đỉnh', e); } }
    // Chỉ số (tốc độ / gia tốc) — áp trước khi hệ thống hư hại chụp chỉ số gốc
    let sp = 1, ac = 1;
    for (const id of u.kit.m) { sp *= MODULES[id].speed || 1; ac *= MODULES[id].accel || 1; }
    if (u.baseMaxSpeed) u.baseMaxSpeed *= sp;
    if (u.acceleration) u.acceleration *= ac;
    if (u.dmg && u.dmg.base) { if (u.dmg.base.baseMaxSpeed) u.dmg.base.baseMaxSpeed *= sp; if (u.dmg.base.acceleration) u.dmg.base.acceleration *= ac; }
    // Ống phóng lựu khói có sẵn trên mô hình chỉ hiện khi đã lắp trang bị khói (bật / tắt thấy ngay trên xe)
    try { setStockSmoke(u, has(u, 'smoke')); } catch (e) { console.warn('[EQ] Không ẩn được ống khói', e); }
    // hộp đạn thay cỡ hòm trên tháp -> gắn TRƯỚC giáp lắp thêm (tấm ốp / lồng tháp đo theo hòm mới)
    if (typeof u.mountMag === 'function') { try { u.mountMag(slotOf(u.kit, u.tankType, 'mag') || 'none'); } catch (e) { console.warn('[EQ] Không gắn được hộp đạn', e); } }
    try { buildVisuals(u); } catch (e) { console.warn('[EQ] Không gắn được hình trang bị', e); }
    // Ô 1 bệ (nóc tháp / mũi xe / vũ khí chính / UAV): mô hình xe dựng sẵn món mặc định, bộ đồ chọn món khác thì thay
    // (u.mountRoof / mountFront / mountWeapon / mountUav do file mô hình xe cung cấp; 'none' = gỡ trống)
    for (const c of MOUNT_CATS) {
      if (c === 'mag') continue;
      const fn = u['mount' + c[0].toUpperCase() + c.slice(1)];
      if (typeof fn !== 'function') continue;
      try { fn(slotOf(u.kit, u.tankType, c) || 'none'); } catch (e) { console.warn('[EQ] Không gắn được món ô ' + c, e); }
    }
    // Động cơ: thông số tăng tốc + nhiệt (spg.js engineBoost), giọng máy (vehicle_engine.js / other_engines.js)
    u.engineId = slotOf(u.kit, u.tankType, 'engine') || 'stock';
    u.engineSpec = (MODULES[u.engineId] && MODULES[u.engineId].boost) || null;
    u._eng = { heat: 0, lock: false, lvl: 0 };
    // Giáp hỏng từ trận trước chưa sửa: xe ra trận thiếu đúng các khối đó (mọi máy cùng áp theo kit.d)
    applyGone(u);
    startLife(u);
  }

  // Mô hình xe vừa dựng lại (xác cũ tách ra nằm lại chiến trường — SPG.detachWreck): gắn lại phần HÌNH của bộ trang bị
  // (ống phóng, hòm đạn, giáp lắp thêm, món ở các ô bệ). Chỉ số / kho đạn giữ nguyên; giáp thiếu do onRespawn áp
  function refit(u) { for (const _ of refitSteps(u)); }
  // refit chia bước (xe chờ hồi sinh dựng sẵn trang bị qua nhiều khung — game.js prepRespawn): mỗi lần next() làm một
  // phần (giáp, từng mặt lồng, đồ nóc...), cùng thứ tự & cùng chuỗi số ngẫu nhiên như chạy liền một mạch
  function* refitSteps(u) {
    if (!u || !u.kit) return;
    if (u.setTopAttack) { try { u.setTopAttack(!!(u.ammoMods && u.ammoMods.ANTI_TANK_MISSILE && u.ammoMods.ANTI_TANK_MISSILE.top)); } catch (e) { console.warn('[EQ] ống tấn công đỉnh', e); } }
    try { setStockSmoke(u, has(u, 'smoke')); } catch (e) { console.warn('[EQ] Không ẩn được ống khói', e); }
    if (typeof u.mountMag === 'function') { try { u.mountMag(slotOf(u.kit, u.tankType, 'mag') || 'none'); } catch (e) { console.warn('[EQ] Không gắn được hộp đạn', e); } }
    yield;
    try { yield* buildVisualsSteps(u); } catch (e) { console.warn('[EQ] Không gắn được hình trang bị', e); }
    for (const c of MOUNT_CATS) {
      if (c === 'mag') continue;
      const fn = u['mount' + c[0].toUpperCase() + c.slice(1)];
      if (typeof fn !== 'function') continue;
      try { fn(slotOf(u.kit, u.tankType, c) || 'none'); } catch (e) { console.warn('[EQ] Không gắn được món ô ' + c, e); }
    }
  }

  // Mỗi lần xuất kích: nạp lại đạn đặc chủng (miễn phí + mua thêm), khói, đánh chặn
  function startLife(u) {
    const E = u._eq;
    if (!E) return;
    const base = BASE_AMMO[u.tankType] || {};
    const shop = AMMO_SHOP[u.tankType] || {};
    for (const k in base) {
      let extra = u.kit.a[k] || 0;
      if (E.local) extra = Math.max(0, Math.min(extra, (E.stock[k] || 0) - (E.used[k] || 0)));
      // vật tư của mô-đun (lựu đạn khói): chỉ nạp khi có lắp mô-đun đó
      if (shop[k] && shop[k].gear && !has(u, shop[k].gear)) extra = 0;
      // lựu đạn khói: tổng (miễn phí + mua) không vượt số ống phóng 2 bên
      if (k === 'SMOKE') extra = Math.min(extra, Math.max(0, 2 * smokeMax(u) - (base[k] || 0)));
      // tên lửa trinh sát: ống phóng trên nóc chứa tối đa 3 quả mỗi lần xuất kích (miễn phí + mua)
      if (k === 'ANTI_TANK_MISSILE') extra = Math.min(extra, Math.max(0, 3 - (base[k] || 0)));
      E.loaded[k] = extra;
      u[AMMO_PROP[k]] = base[k] + extra;
    }
    // lựu đạn khói nạp vào ống từ trước ra sau; đếm số ống đã bắn mỗi bên (miệng ống phóng tiếp theo)
    u._smokeTube = [0, 0];
    u._smokeAt = 0;
    u._smokeCloak = null;
  }
  // Số ống MỖI BÊN (mang tối đa 2 × số này quả lựu đạn khói)
  function smokeMax(u) { return (u && SMOKE_TUBES[u.tankType]) || 3; }
  // Đạn mua thêm đã bắn trong lần xuất kích này (bắn đạn miễn phí trước, hết mới tới đạn mua)
  function lifeUsed(u, k) {
    const E = u._eq, n = E.loaded[k] || 0;
    if (!n) return 0;
    return Math.max(0, Math.min(n, n - (u[AMMO_PROP[k]] || 0)));
  }
  function applyGone(u) {
    if (!u || !u.kit || !u.kit.d || typeof VehicleDamage === 'undefined' || !VehicleDamage.applyArmorMissing) return;
    try { VehicleDamage.applyArmorMissing(u, u.kit.d); } catch (e) { console.warn('[EQ] Không áp được giáp thiếu', e); }
  }
  /**
   * Gom đơn vị giáp đã mất trong trận (hợp các lần xuất kích + phần thiếu sẵn): gọi trước VehicleDamage.reset khi hồi sinh
   * và lúc báo kết quả trận. Trả về { món: { total, gone: [...] } } để gửi máy chủ (account.js reportMatch)
   */
  function noteArmor(u) {
    if (!u || !u._eq || typeof VehicleDamage === 'undefined' || !VehicleDamage.armorUnits) return null;
    const A = u._eq.armor || (u._eq.armor = {});
    if (!u._eq.armorInit) {
      u._eq.armorInit = true;
      const d0 = (u.kit && u.kit.d) || {};
      for (const it in d0) (A[it] || (A[it] = { total: 0, gone: new Set() })).gone = new Set(d0[it]);
    }
    let cur = {};
    try { cur = VehicleDamage.armorUnits(u); } catch (e) { cur = {}; }
    for (const it in cur) {
      if (!ARMOR_REPAIR[it] || !has(u, it)) continue;
      const R = A[it] || (A[it] = { total: 0, gone: new Set() });
      R.total = Math.max(R.total, cur[it].total);
      for (const k of cur[it].gone) R.gone.add(k);
    }
    const out = {};
    for (const it in A) if (A[it].gone.size) out[it] = { total: A[it].total, gone: [...A[it].gone] };
    return out;
  }
  function onRespawn(u) {
    const E = u && u._eq;
    if (!E) return;
    for (const k in E.loaded) E.used[k] = (E.used[k] || 0) + lifeUsed(u, k);
    if (u._eng) { u._eng.heat = 0; u._eng.lock = false; u._eng.lvl = 0; }   // xe mới: máy nguội
    applyGone(u);   // xe hồi sinh về đúng tình trạng giáp lúc xuất kích (không phải nguyên vẹn)
    startLife(u);
    // đạn mua đã bắn ở lần xuất kích trước: báo máy chủ trừ kho ngay, không đợi hết trận
    if (E.local && typeof window !== 'undefined' && window.Account && Account.flushAmmo) Account.flushAmmo(u);
  }
  /**
   * Câu nhắc khi xe người chơi bắn hết 1 loại vật tư: kho tài khoản còn -> "nạp lại khi xuất kích lần sau";
   * kho đã cạn -> chỉ chỗ mua / xem quảng cáo tiếp tế (tạo vòng lặp khan hiếm -> tiếp tế)
   */
  function outOfStockNote(u, k) {
    const E = u && u._eq;
    if (!E || !E.local || !(AMMO_SHOP[u.tankType] || {})[k]) return '';
    const rem = (E.stock[k] || 0) - (E.used[k] || 0) - (E.loaded[k] || 0);
    return rem > 0 ? ` (kho còn ${rem} — nạp khi xuất kích lần sau)` : ' — KHO ĐÃ CẠN: mua thêm hoặc xem quảng cáo tiếp tế ở Kho vũ khí';
  }
  /** Tổng đạn mua thêm đã tiêu trong trận (gửi máy chủ để trừ kho) */
  function paidUsed(u) {
    const E = u && u._eq, out = {};
    if (!E) return out;
    for (const k in E.loaded) { const n = (E.used[k] || 0) + lifeUsed(u, k); if (n > 0) out[k] = n; }
    for (const k in E.used) if (!(k in out) && E.used[k] > 0) out[k] = E.used[k];
    return out;
  }

  /**
   * Phần đạn mua thêm đã bắn nhưng chưa báo máy chủ trừ kho (chỉ xe người chơi); gọi là đánh dấu đã báo.
   * giveBack: gửi thất bại -> trả lại phần đó để lần sau gửi tiếp.
   */
  function ammoDelta(u, giveBack) {
    const E = u && u._eq, out = {};
    if (!E || !E.local) return out;
    if (giveBack) { for (const k in giveBack) E.reported[k] = Math.max(0, (E.reported[k] || 0) - giveBack[k]); return out; }
    const all = paidUsed(u);
    for (const k in all) { const n = all[k] - (E.reported[k] || 0); if (n > 0) { out[k] = n; E.reported[k] = all[k]; } }
    return out;
  }

  // ---------- Hệ số dùng trong mô hình xuyên giáp (vehicle_damage.js) ----------
  // Giáp quy đổi: tấm giáp tăng cường còn trên mặt bị trúng
  // ---------------------------------------------------------------------------
  // QUY TẮC GIÁP THEO LOẠI ĐẠN (dùng chung cho mọi xe / mọi máy)
  // ---------------------------------------------------------------------------
  // Tấm giáp tăng cường (composite gắn ngoài) có còn che mặt bị trúng không
  function appliqueCovers(u, face, onTurret) {
    if (!has(u, 'applique')) return false;
    if (onTurret) return (face === 'front' || face === 'sideL' || face === 'sideR') && !lost(u, 'appliqueKitT');
    if (face === 'sideL') return !lost(u, 'appliqueKitL');
    if (face === 'sideR') return !lost(u, 'appliqueKitR');
    if (face === 'front') return !(lost(u, 'appliqueKitL') && lost(u, 'appliqueKitR'));
    return false;
  }
  // Giáp dày thêm trên mặt được che: sườn +45%, mũi / tháp +20% (tác dụng với mọi loại đạn qua độ xuyên)
  function armorMul(u, face, onTurret) {
    let k = !appliqueCovers(u, face, onTurret) ? 1 : !onTurret && (face === 'sideL' || face === 'sideR') ? 1.45 : 1.2;
    if (!onTurret && face === 'front' && vshieldUp(u)) k *= 1.4;   // khiên chữ V trước mũi (xe 6 nòng)
    if (!onTurret && face === 'rear') k *= 1 + 0.3 * sandbagLeft(u);   // bao cát đối trọng sau đuôi (đi kèm khiên chữ V)
    return k;
  }
  // Khiên giáp chữ V trước mũi xe 6 nòng (ô MŨI XE): còn ít nhất một tấm thì che mặt trước thân xe
  function vshieldUp(u) { return has(u, 'vshield') && !(lost(u, 'appliqueVSL') && lost(u, 'appliqueVSR')); }
  // ngoài độ dày: tấm thép xiên chữ V làm đạn nhỏ vỡ, hứng mảnh & sức nổ phía trước (đầu nổ lõm: vshieldHeatMul khi
  // trúng đúng tấm — giáp cách quãng; đạn chệch hẳn: vshieldDeflectP)
  const VSHIELD_DIRECT = { small: 0.35, cannon: 0.55, blast: 0.75, kinetic: 0.9, heat: 1 };
  // Phát trúng tấm chữ V còn nguyên, bay tới trong cung trước ±30°: xác suất bị tấm xiên làm chệch — đạn nhỏ / 30mm / lựu
  // 40mm nảy đi, đạn nổ phá trượt trên mặt tấm nổ lệch ra ngoài, ngòi đầu nổ lõm chạm xiên kích nổ sai (luồng phụt không
  // vào vỏ), lõi mũi tên xuyên giáp rất khó bị bẻ hướng. Phát chệch tính như đạn nảy (VehicleDamage: còn ~15% / 2%)
  const VSHIELD_DEFLECT = { small: 0.75, cannon: 0.6, blast: 0.35, heat: 0.25, kinetic: 0.15 };
  function vshieldDeflectP(cls) { return VSHIELD_DEFLECT[cls] || 0; }
  // Đầu nổ lõm kích nổ trên tấm chữ V (giáp CÁCH QUÃNG, tách khỏi vỏ xe): luồng kim loại phải vượt khoảng hở mới tới vỏ
  // nên tản & yếu đi — đầu nổ đơn (RPG, UAV cảm tử) còn 35%; đầu nổ kép (tên lửa chống tăng, đạn nổ lõm 2 tầng: đầu mồi
  // phá tấm, đầu chính nổ sát vỏ) còn 60%
  function vshieldHeatMul(shooter, ammo) { return ammo === 'ANTI_TANK_MISSILE' || isTandem(shooter, ammo) ? 0.6 : 0.35; }
  // Quả nổ phía trước mũi (trong nón trước khiên): hai tấm thép hứng mảnh & sóng nổ -> sát thương nổ lan còn 75%
  function vshieldSplashMul(u, point) {
    if (!vshieldUp(u) || !u.group || !point) return 1;
    const lp = u.group.worldToLocal(point.clone());
    return lp.z < -22 && Math.abs(lp.x) < -lp.z ? 0.75 : 1;
  }
  // Bao cát đối trọng sau đuôi xe 6 nòng (dựng kèm khiên chữ V, fsv_hailstorm.js buildSandbags): phần bao còn trên giá
  // (0..1, mỗi bao một khối — VehicleDamage bắn rách / bung từng bao). Lớp cát ~0,4 m kẹp giữa tấm đuôi & lồng chống RPG:
  // giáp đuôi dày thêm tới 30%, hứng đạn nhỏ / mảnh rất tốt, làm luồng nổ lõm tản bớt, gần như không cản đạn xuyên giáp
  function sandbagLeft(u) {
    if (!has(u, 'vshield') || !u.partRegistry || !u.partRegistry.sandbagL) return 0;
    // trung bình hai nửa đuôi (số bao hai nửa xấp xỉ nhau); nửa chưa bị bắn lần nào chưa chia khối -> coi như đủ bao
    const S = u.dmg && u.dmg.segs;
    let f = 0;
    for (const t of ['sandbagL', 'sandbagR']) {
      const sg = S && S[t];
      if (sg && sg.length) f += sg.filter(b => !b.gone).length / sg.length / 2;
      else if (!lost(u, t)) f += 0.5;
    }
    return f;
  }
  const SANDBAG_DIRECT = { small: 0.35, cannon: 0.5, blast: 0.7, heat: 0.75, kinetic: 0.9 };
  // Quả nổ phía sau đuôi (trong nón sau): lớp cát hứng mảnh & sóng nổ -> sát thương nổ lan còn tới 80%
  function sandbagSplashMul(u, point) {
    if (!u.group || !point) return 1;
    const f = sandbagLeft(u);
    if (!f) return 1;
    const lp = u.group.worldToLocal(point.clone());
    return lp.z > 22 && Math.abs(lp.x) < lp.z ? 1 - 0.2 * f : 1;
  }
  // Ngoài độ dày, tấm giáp còn hấp thụ: đạn súng máy / 30mm vỡ vụn trên lớp gốm, sức nổ & mảnh của đạn nổ phá dồn
  // vào tấm ngoài. Đạn xuyên giáp & nổ lõm chỉ bị cản bằng độ dày (đã tính ở armorMul)
  const APPLIQUE_DIRECT = { small: 0.4, cannon: 0.6, blast: 0.7, kinetic: 1, heat: 1 };
  const APPLIQUE_SPLASH = { small: 0.6, cannon: 0.6, blast: 0.85, kinetic: 0.85, heat: 0.85 };
  function appliqueDamageMul(u, face, onTurret, cls) {
    let k = appliqueCovers(u, face, onTurret) ? (APPLIQUE_DIRECT[cls] || 1) : 1;
    if (!onTurret && face === 'rear') { const f = sandbagLeft(u); if (f) k *= 1 - (1 - (SANDBAG_DIRECT[cls] || 1)) * f; }
    return !onTurret && face === 'front' && vshieldUp(u) ? k * (VSHIELD_DIRECT[cls] || 1) : k;
  }
  function appliqueSplashMul(u, cls) {
    return has(u, 'applique') ? (APPLIQUE_SPLASH[cls] || 1) : 1;
  }
  // Giáp phản ứng nổ (gạch mua thêm, gạch có sẵn trên xe, giáp nổ nhặt ở thùng tiếp tế) khi bị trúng thẳng:
  //  - đạn súng máy / 30mm / đạn cháy: gạch được thiết kế KHÔNG kích nổ với đạn nhỏ -> không tác dụng, không mất
  //  - RPG, bom con, đạn chùm (đầu nổ lõm): gạch kích nổ, tấm thép văng ra cắt đứt luồng kim loại -> 0 sát thương
  //    (gạch mua thêm trên xe vỏ mỏng: phần luồng còn lại vẫn khoét thủng vỏ — VehicleDamage.onDirectHit giữ lại 15-30%)
  //  - tên lửa đầu nổ kép / đạn nổ lõm 2 tầng: đầu mồi kích nổ gạch, đầu chính vẫn xuyên -> còn 85%
  //  - đạn xuyên giáp mũi tên: tấm thép văng chém lệch / gãy mũi tên -> còn 60%
  //  - đạn nổ phá 120mm: không có luồng kim loại để cắt -> gạch nổ theo nhưng chỉ đỡ chút sức ép / mảnh -> còn 80%
  //  - lựu pháo 155mm: sức nổ quá lớn, gạch gần như vô dụng -> còn 85%
  // Trả { trigger: gạch có kích nổ (và mất) không, mul: phần sát thương còn lại }
  function eraEffect(ammo, heavy, shooter) {
    if (ammo === 'SCOUT_BULLET' || ammo === 'GATLING_BULLET' || ammo === 'GATLING_HE' || ammo === 'INCENDIARY') return { trigger: false, mul: 1, why: 'small' };
    if (heavy) return { trigger: true, mul: 0.85, why: 'heavy' };
    if (ammo === 'ANTI_TANK_MISSILE' || isTandem(shooter, ammo)) return { trigger: true, mul: 0.85, why: 'tandem' };
    if (ammo === 'AP') return { trigger: true, mul: 0.6, why: 'kinetic' };
    if (ammo === 'NORMAL' || ammo === 'HE') return { trigger: true, mul: 0.8, why: 'blast' };
    return { trigger: true, mul: 0, why: 'defeat' };
  }
  function penMul(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return P && P.pen ? P.pen : 1;
  }
  // Hệ số mất sức xuyên theo cự ly (đạn cao cấp giữ tốc độ tốt hơn)
  function penLossMul(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return P && P.loss !== undefined ? P.loss : 1;
  }
  function isTandem(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return !!(P && P.tandem);
  }
  function splashMul(shooter, ammo) {
    const P = shooter && shooter.ammoMods && shooter.ammoMods[ammo];
    return P && P.splash !== undefined ? P.splash : 1;
  }
  // Lớp lót chống mảnh: chặn mảnh vỡ bay vào kíp xe; trúng kho đạn thì thuốc phóng vẫn bén lửa / nổ (gần như không đỡ)
  function spallMul(u, zone) {
    if (!has(u, 'spall')) return 1;
    return zone === 'crew' ? 0.8 : zone === 'ammo' ? 0.97 : 0.9;
  }
  // Lồng thép bị trúng bởi RPG / tên lửa: xác suất đầu đạn bị bóp méo, không nổ đúng cách
  // Lồng thép (nan thép cách vỏ ~0,3 m, mua thêm hoặc có sẵn trên xe) khi bị trúng thẳng:
  //  defeat: xác suất chặn hẳn (bóp méo đầu nổ lõm / kích nổ sớm), mul: phần sát thương còn lại nếu không bị chặn hẳn,
  //  noFire: chất cháy bắn tung trên nan, không bám được vào vỏ -> xe không bén lửa
  const SLAT_HIT = {
    RPG: { defeat: 0.6, mul: 1 },
    // UAV cảm tử: thân + cánh vướng nan, đầu nổ lõm lọt qua vẫn kích nổ lệch / chạm xiên -> luồng phụt yếu đi, xe tăng
    // chịu được 1 phát lọt lồng (4.4 x 0.65 ≈ 2.9 < 4.0 máu)
    KAMI: { defeat: 0.6, mul: 0.65 },
    ANTI_TANK_MISSILE: { defeat: 0.25, mul: 1 },
    HEAT120: { defeat: 0.25, mul: 1 },                  // đạn nổ lõm 2 tầng của pháo tăng (đầu nổ mồi): như tên lửa đầu nổ kép
    CLUSTER_SUBMUNITION: { defeat: 0.6, mul: 0.5 },    // bom con nổ lõm nhỏ
    NORMAL: { mul: 0.75 }, HE: { mul: 0.75 }, CLUSTER: { mul: 0.75 },   // đạn nổ trên lồng, cách vỏ -> sức ép & mảnh yếu đi
    GATLING_BULLET: { mul: 0.7 },                     // đạn 30mm nổ-mảnh kích nổ trên nan
    GL40: { defeat: 0.5, mul: 0.5 },                  // quả lựu 40mm nổ lõm-mảnh (HEDP): nan bóp méo / kích nổ sớm cách vỏ
    INCENDIARY: { mul: 0.6, noFire: true },
    SCOUT_BULLET: { mul: 0.9 },
    AP: { mul: 1 }                                    // mũi tên xuyên giáp xuyên thẳng qua nan
  };
  const isCage = (tag) => !!tag && /^cage/.test(tag);
  // roll = false: chỉ tra hệ số, không gieo xác suất chặn (máy chỉ vẽ hình — kết quả do máy có quyền quyết định)
  function slatHit(tag, ammo, heavy, roll = true) {
    if (!isCage(tag)) return null;
    const S = SLAT_HIT[ammo] || { mul: 1 };
    const defeated = roll && !!S.defeat && Math.random() < S.defeat;
    return { defeated, mul: heavy ? Math.max(S.mul, 0.85) : S.mul, noFire: !!S.noFire };
  }
  function slatDefeats(tag, ammo) { const r = slatHit(tag, ammo, false); return !!(r && r.defeated); }
  // Lồng thép quanh xe đỡ mảnh văng & sức ép của quả nổ gần: sát thương -15%, ít hỏng lốp / xích / phụ kiện hơn,
  // chất cháy không bám được vào vỏ
  function slatSplash(u, cls) {
    if (!has(u, 'slat')) return { mul: 1, partK: 1, noFire: false };
    return { mul: cls === 'small' || cls === 'cannon' ? 0.9 : 0.85, partK: 0.5, noFire: true };
  }
  // Mái lồng chống UAV (nóc tháp / nóc thân 'cageKitT', sàn máy 'cageKitD') còn ít nhất một tấm chưa bị bắn văng:
  // tên lửa đột nóc bổ nhào phải xuyên qua lồng trước (game.js handleShellImpact giảm sát thương)
  function roofCage(u) {
    const onCar = t => !!((u.partRegistry && u.partRegistry[t]) || (u.partGroups && u.partGroups[t]));
    return has(u, 'slat') && ['cageKitT', 'cageKitD'].some(t => onCar(t) && !lost(u, t));
  }
  // Hệ thống đánh chặn: còn lượt + radar chưa bị bắn hỏng
  function apsLeft(u) {
    if (!has(u, 'aps') || lost(u, 'apsKit')) return 0;
    return Math.max(0, APS_CHARGES - ((u.dmg && u.dmg.apsUsed) || 0));
  }
  // Xác suất đạn đánh chặn phá được mối đe dọa (null = radar không giao chiến, không tốn lượt). t: { ammo, kami, steep }
  // steep: đang lao gần thẳng đứng (> ~60° dưới phương ngang) — radar quét chủ yếu quanh phương ngang, góc trên đầu kém.
  // Đạn chậm (UAV, RPG ~290 m/s, tên lửa ~300 m/s) dễ chặn; đạn pháo tăng ~950-1140 m/s chỉ ~30% và chỉ khi còn >= 2 lượt
  // (giữ lượt cuối cho RPG / tên lửa / UAV); đạn xuyên giáp ~1650 m/s, lựu pháo bắn cầu vồng: không chặn
  function apsEngageP(u, t) {
    const n = apsLeft(u);
    if (n <= 0) return null;
    if (t.kami) return t.steep ? 0.6 : 0.85;
    // tên lửa đột nóc (bệ nóc tháp xe tăng): nhanh gấp ~2 lần UAV, bổ nhào gần thẳng đứng vào góc trên đầu radar quét kém
    if (t.top) return t.steep ? 0.3 : 0.55;
    if (t.ammo === 'RPG') return t.steep ? 0.65 : 0.9;
    if (t.ammo === 'ANTI_TANK_MISSILE') return t.steep ? 0.55 : 0.75;
    if (t.ammo === 'NORMAL' || t.ammo === 'HE') return n >= 2 ? 0.3 : null;
    return null;
  }
  // Giao chiến một mối đe dọa: tốn 1 lượt, r: số ngẫu nhiên [0, 1) (mọi máy cùng hạt giống -> cùng kết quả)
  // -> { ok, p } hoặc null nếu radar không giao chiến
  function apsEngage(u, t, r) {
    const p = apsEngageP(u, t);
    if (p === null) return null;
    const d = (typeof VehicleDamage !== 'undefined') ? VehicleDamage.state(u) : (u.dmg || (u.dmg = {}));
    d.apsUsed = (d.apsUsed || 0) + 1;
    return { ok: r < p, p };
  }
  // Lưới lá ngụy trang chỉ có tác dụng khi xe ĐỨNG YÊN (dưới ~6% tốc độ tối đa) và chưa vừa nổ súng:
  // chạy là cành lá rung, lộ hình xe -> mất tác dụng hoàn toàn. Lưới rách / cháy (mất cụm 'camoKit') cũng mất.
  function camoHidden(t) {
    if (!has(t, 'camo') || lost(t, 'camoKit')) return false;
    // lưới đang cháy (lửa, khói lộ vị trí) hoặc đã cháy quá nửa: hết tác dụng (CamoFire)
    if (typeof CamoFire !== 'undefined' && CamoFire.blocks(t)) return false;
    if ((t.revealTimer || 0) > 0) return false;
    return Math.abs(t.speed || 0) < (t.baseMaxSpeed || 120) * 0.06;
  }
  // Hệ số tầm nhìn của địch tới xe này: phải vào gần hơn ~35% mới thấy / mới khóa được
  // Lá cây rơi đọng trên xe trinh sát khi húc cây (LeafCover): ngụy trang tự nhiên, yếu hơn lưới — lấy cái mạnh hơn
  const leafK = (t, k) => typeof LeafCover !== 'undefined' ? LeafCover.factor(t, k) : 1;
  function camoFactor(t) { return Math.min(camoHidden(t) ? 0.65 : 1, leafK(t, 0.25)); }
  // Lưới ngụy trang + xe ĐỨNG YÊN (chưa vừa nổ súng): radar địch chỉ bắt được trong ~60% tầm quét
  // (lá cây & lưới tản sóng làm vết radar yếu, lẫn vào nền cây cối). Chạy là mất tác dụng.
  function camoRadarFactor(t) { return Math.min(camoHidden(t) ? 0.6 : 1, leafK(t, 0.2)); }
  function fireMul(u) { return has(u, 'fireext') ? 2.5 : 1; }
  function burnDamageMul(u) { return has(u, 'fireext') ? 0.5 : 1; }
  // Bình chữa cháy tự động phun ngay khi cảm biến thấy chớp lửa trong khoang:
  // đạn cháy -> chất cháy bị dập, ít sát thương hơn; đạn xuyên giáp (động năng cỡ lớn) xuyên vào -> dập chớp lửa thuốc phóng
  // / dầu thủy lực trước khi lan, bớt chút sát thương (trúng kho đạn đỡ nhiều hơn).
  // du: mũi tên lõi urani nghèo — mảnh urani tự bốc cháy quá nóng, bình khí dập lửa không ăn thua
  function extHitMul(u, ammo, ap, zone, du) {
    if (!has(u, 'fireext') || du) return 1;
    if (ammo === 'INCENDIARY') return 0.8;
    if (ap) return zone === 'ammo' ? 0.85 : 0.92;
    return 1;
  }
  // Hệ số xác suất bén lửa khi trúng: cls = lớp đạn (vehicle_damage ammoClass)
  function extFireChance(u, ammo, cls, du) {
    if (!has(u, 'fireext') || du) return 1;
    return ammo === 'INCENDIARY' ? 0.4 : cls === 'kinetic' ? 0.5 : 1;
  }
  // Thời gian cháy do đạn cháy / châm lửa
  function extIgniteMul(u) { return has(u, 'fireext') ? 0.6 : 1; }

  // ---------------------------------------------------------------------------
  // HÌNH BỘ PHẬN GẮN THÊM
  // ---------------------------------------------------------------------------
  // Kích thước khung từng xe (đo từ mô hình: hệ tọa độ thân xe, mũi xe hướng -z; tháp theo hệ tọa độ tháp)
  const FIT = {
    // netY: độ cao nóc thân để phủ lưới ngụy trang; tur.roof: nóc tháp
    ALL_ROUNDER: { hw: 15.8, y0: 6.4, y1: 11.6, zF: -31, zR: 30.8, eraZ1: 4, netY: 12.9, tur: { hw: 12.8, h: 9.7, roof: 9.4, zF: -19.2, zR: 20.7 } },
    GATLING: { hw: 17.2, y0: 7.6, y1: 13.4, zF: -37, zR: 33.2, eraZ1: 2, netY: 14.3, tur: { hw: 13.6, h: 8.8, roof: 8.6, zF: -16.7, zR: 14.8 } },
    ARTILLERY: { hw: 13.4, y0: 9.5, y1: 15.5, zF: -40.1, zR: 41.2, eraZ1: 0, netY: 12.6, tur: { hw: 11.4, h: 16.6, roof: 10.8, zF: -11, zR: 14.9 } },
    SCOUT: { hw: 8.7, y0: 7.2, y1: 13, zF: -20, zR: 19.5, eraZ1: 6, netY: 15.5, tur: null }
  };
  // Nóc thật (tháp: hệ tọa độ tháp; Marten không tháp: nóc thân) — FIT.tur.roof đo cả kính ngắm / hộp pháo nên cao hơn
  const REAL_ROOF = { ALL_ROUNDER: 7.0, GATLING: 5.6, ARTILLERY: 9.6, SCOUT: 15.4 };
  // Chỗ trống trên nóc để gắn radar dò tìm / máy gây nhiễu [x, z] (tránh nắp, kính, ăng-ten, tấm nhận diện).
  // Xe 6 nòng: radar ở nóc trái giữa — nóc sau có chảo radar cảnh giới quay (bán kính ~4.2 quanh x 0.6 / z 10.5) & ăng-ten
  // trái sau, đầu radar mảng pha quay sẽ quét trúng
  const ROOF_SPOT = { ALL_ROUNDER: { radar: [-3.0, 16.0], jam: [3.2, 16.0] }, GATLING: { radar: [-5.8, -1.6], jam: [4.6, 10.8] }, ARTILLERY: { radar: [-2.8, 12.9], jam: [-7.0, 2.0] }, SCOUT: { jam: [3.8, 12.6] } };
  const matCache = {};
  // ngẫu nhiên theo hạt giống vẻ ngoài của xe đang dựng đồ (buildVisuals đặt) -> lồng cong / đồ chằng / gạch lệch cố định
  let kitRnd = Math.random;
  // Vật liệu đồ lắp thêm. Có xe (u): bộ RIÊNG của xe đó, cùng hạt giống vẻ ngoài với thân (lookSeed) -> lớp vết chiến trường
  // (muội, xước, vệt bùn) của gạch nổ / tấm giáp liền mạch với vỏ bên dưới, không đồ nào sạch hơn xe. Không có xe (trang
  // render ảnh trang bị): bộ dùng chung theo phe
  function kitMats(team, u) {
    const key = team === 'RED' ? 'RED' : 'BLUE';
    if (!u && matCache[key]) return matCache[key];
    const K = window.VehicleKit;
    const M = K ? K.createMaterials(key, { battle: 1, seed: u ? K.lookSeed(u) : 0x2c1b3c }) : {};
    const net = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x4d5a34 : 0x9a8659, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const net2 = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x36402a : 0x7d6a45, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const era = M.paint || new THREE.MeshStandardMaterial({ color: 0x5c6450, roughness: 0.8, metalness: 0.2 });
    const steel = M.dark || new THREE.MeshStandardMaterial({ color: 0x2b2c27, roughness: 0.7, metalness: 0.4 });
    // mặt anten mảng pha / radome: nhựa composite sơn xỉn hơi ngả màu, bụi bám, không tự phát sáng (đồ điện tử thật không
    // phát quang — ánh xanh trước đây trông như đồ chơi)
    const sensor = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x4a5044 : 0x7a705c, roughness: 0.72, metalness: 0.08 });
    // mắt kính đầu phát hồng ngoại máy gây nhiễu: kính lọc hồng ngọc sẫm, ánh đỏ mờ nhấp nháy (riêng từng xe — update đổi độ sáng)
    const lamp = new THREE.MeshStandardMaterial({ color: 0x2a0b08, roughness: 0.18, metalness: 0.35, emissive: 0xff2c14, emissiveIntensity: 0.12 });
    lamp.userData.surface = 'glass';
    // lồng thép: thép dẹt sơn 1 màu nền (không vân ngụy trang), sơn tróc lộ lớp lót / gỉ, vệt gỉ chảy, bùn bắn ở chân
    // lồng tháp: cùng sơn, gốc mesh là vòng tháp -> nâng độ cao (lift) để bùn bắn chỉ bám lồng thân thấp, không bám lồng tháp
    const cageMat = (lift) => {
      const m = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x3d4130 : 0x7d6c4e, roughness: 0.82, metalness: 0.3 });
      if (typeof Weathering !== 'undefined') Weathering.apply(m, 'paint', { grime: 0.6, grimeH: 9, streak: 0.5, dust: 0.35, fade: 0.12, stain: 0.65, rust: 0.32, chip: 0.6, moss: 0, vary: 0, scale: 2.4, lift });
      if (M.dark && M.dark.envMap) { m.envMap = M.dark.envMap; m.envMapIntensity = 0.3; }
      m.userData.surface = 'metal';
      return m;
    };
    let tLift = 11;
    if (u && u.turretGroup && u.chassisGroup) {
      u.chassisGroup.updateMatrixWorld(true);
      tLift = u.chassisGroup.worldToLocal(new THREE.Vector3().setFromMatrixPosition(u.turretGroup.matrixWorld)).y;
    }
    const cage = cageMat(0), cageT = cageMat(tLift);
    if (typeof Weathering !== 'undefined') Weathering.apply(sensor, 'plastic', { grime: 0, fade: 0.55, stain: 0.6, dust: 0.65, streak: 0.55, vary: 0, scale: 2.2 });
    const set = {
      era, plate: era, steel, net, net2, sensor, lamp, cage, cageT, rubber: M.rubber || steel, metal: M.steel || steel,
      // gạch nổ thay sau trận (lô khác: bạc nắng / sơn lót sẫm chưa kịp sơn lại), bạt / dây chằng đồ đạc buộc lồng
      eraFaded: M.paintDusty || era, eraPrimer: steel, canvas: M.canvas || steel, canvasDark: M.canvasDark || steel, soot: M.soot || steel
    };
    if (!u) {
      // dùng chung mọi xe cùng phe: xác cháy lấy bản riêng trước khi sém (explosion_fx _onVehicleDestroyed)
      for (const k in set) set[k].userData.sharedKit = true;
      matCache[key] = set;
    }
    return set;
  }

  // ---------------------------------------------------------------------------
  // GIÁP LỒNG ÔM THÂN XE (tự đo bằng tia quét trên đúng mô hình đang dựng)
  // ---------------------------------------------------------------------------
  // Mỗi mặt (sườn, đuôi, mũi cabin, sàn máy, sườn / đuôi / nóc tháp) quét lưới tia từ ngoài vào để lấy bề mặt vỏ, rồi dựng
  // tấm lồng cách vỏ CAGE_GAP: mép trên / dưới đi theo đúng đường viền thân, tấm chia khúc ~7 đơn vị (mỗi khúc một mặt phẳng
  // bám chỗ nhô nhất của khúc đó), tay đỡ bắt bu-lông vào vỏ. Chỗ nào có phụ kiện nhô ra (đèn, hộp đồ, ống khói, bình chữa
  // cháy, kính ngắm, nắp, bệ vũ khí...) thì khoét ô chừa lại. Không tấm nào lọt vào vòng quay của tháp.
  // plan.hull: dải cao [y0, y1] mặt thân; sides / rear / front: mặt cần che (front: [y0, y1] riêng — mũi cabin xe pháo);
  // deck: mái lồng sàn máy (ngoài vòng quay tháp); roofHull: xe không tháp — mái lồng trên nóc thân.
  // plan.tur: sides / rear / roof của tháp; front: phần trước tháp để trống (má tháp, nòng pháo)
  const CAGE_GAP = 1.8;   // ~0,22 m — khoảng cách nan tới vỏ như lồng RPG thật
  const CAGE_SEG = 1.5;   // nan / thanh lồng dài chia khúc ≤ bấy nhiêu (móp / gãy tại chỗ bị bắn)
  // Thanh lồng thẳng theo trục 'x' | 'z' từ a0 tới a1 (tâm c, mặt cắt h cao × t dày), chia khúc ≤ CAGE_SEG
  function segRun(b, mat, axis, a0, a1, c, h, t) {
    const len = a1 - a0, n = Math.max(1, Math.ceil(len / CAGE_SEG)), st = len / n;
    for (let i = 0; i < n; i++) {
      const m = a0 + st * (i + 0.5);
      if (axis === 'x') b.box(st + 0.002, h, t, mat, [m, c[1], c[2]]);
      else b.box(t, h, st + 0.002, mat, [c[0], c[1], m]);
    }
  }
  const CAGE_PLAN = {
    ALL_ROUNDER: { hull: { y0: 5.0, y1: 14.5, sides: true, rear: true, deck: true }, tur: { sides: true, rear: true, roof: true, front: 0.32 } },
    // Hailstorm có sẵn lồng đuôi + 2 cánh lồng sau trên mô hình; mái lồng sàn sau mép trước cong theo vòng quét tháp (cageDeckArc)
    GATLING: { hull: { y0: 4.6, y1: 15.5, sides: true, rear: false, deck: 'arc' }, tur: { sides: true, rear: true, roof: true, front: 0.3 } },
    // xe pháo: đuôi xe để trống cho lưỡi càng; mũi cabin che dưới kính
    // arch: hốc bánh lái trước (spg_arbalest.js trục z -26, lốp R 5.55) — đánh lái lốp quét ra ngoài, lồng sườn chừa trống
    // doors: cửa cabin (khung cửa z -32.5..-23.9) — đoạn lồng trước cửa là cửa lồng bản lề riêng
    ARTILLERY: { hull: { y0: 6.6, y1: 23, sides: true, rear: false, front: [10.7, 15.2], deck: false, arch: [{ z: -26, r: 7.4, top: 12.4 }], doors: [{ a0: -32.6, a1: -23.8 }] }, tur: { sides: true, rear: true, roof: true, front: 0.25 } },
  };
  // Ô chừa bệ vũ khí trên nóc (bệ xoay nằm ngoài mô hình gốc nên tia quét không thấy): [x, z, nửa cạnh]
  const CAGE_HOLE = { ALL_ROUNDER: [6.2, 9.0, 3.8], GATLING: [6.6, 5.8, 3.8] };

  // Bộ quét tia trong hệ tọa độ `host` (bỏ các nhánh trong `skip`, kíp xe, phần đang ẩn)
  function cageCaster(host, skip) {
    host.updateMatrixWorld(true);
    const meshes = [];
    host.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      for (let p = o; p; p = p.parent) {
        if (skip.has(p) || p.visible === false || (p.userData && p.userData.crewRole)) return;
        if (p === host) break;
      }
      meshes.push(o);
    });
    // mô hình vừa dựng (xe hồi sinh) chưa có cây bao dò tia: lồng quét hàng nghìn tia -> dựng cây ngay (vài ms / lưới)
    // thay vì dò từng tam giác (~1 s khựng mỗi lần xe có lồng xuất kích lại)
    if (typeof RaycastBVH !== 'undefined' && RaycastBVH.prebuild) for (const m of meshes) RaycastBVH.prebuild(m);
    // hộp bao thế giới từng lưới (chứa mọi đỉnh): tia trượt hộp thì chắc chắn không trúng lưới đó -> bỏ khỏi lượt dò
    // (kết quả y hệt dò cả danh sách; lưới bản sao / có xương / morph luôn dò). Hàng trăm lưới nhỏ × hàng nghìn tia
    const boxes = meshes.map(o => {
      const g = o.geometry;
      if (o.isInstancedMesh || o.isSkinnedMesh || (g.morphAttributes && g.morphAttributes.position && g.morphAttributes.position.length)) return null;
      if (!g.boundingBox) g.computeBoundingBox();
      return g.boundingBox.isEmpty() ? null : g.boundingBox.clone().applyMatrix4(o.matrixWorld).expandByScalar(1e-3);
    });
    const rc = new THREE.Raycaster(), O = new THREE.Vector3(), E = new THREE.Vector3(), list = [];
    return (o, d) => {
      host.localToWorld(O.set(o[0], o[1], o[2]));
      host.localToWorld(E.set(o[0] + d[0], o[1] + d[1], o[2] + d[2]));
      rc.set(O, E.sub(O).normalize()); rc.far = 400;
      list.length = 0;
      for (let i = 0; i < meshes.length; i++) if (!boxes[i] || rc.ray.intersectsBox(boxes[i])) list.push(meshes[i]);
      const h = rc.intersectObjects(list, false);
      return h.length ? host.worldToLocal(h[0].point.clone()) : null;
    };
  }

  const median = (v) => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
  const nearest = (arr, key, val) => arr.reduce((q, w) => Math.abs(w[key] - val) < Math.abs(q[key] - val) ? w : q);

  // Tấm lồng đứng. f = { axis: 'x' (mặt sườn, chạy dọc z) | 'z' (mặt mũi / đuôi, chạy ngang x), s: ±1 hướng ra ngoài,
  // a0, a1, y0, y1, extra (bề dày giáp gắn thêm phải chừa), keep(a, y, c) -> false nếu ô lọt vào vòng quay tháp }
  // Đồ đạc kíp xe chằng ngoài lồng (kiểu xe chiến trường thật: lồng thành giá treo đồ): cuộn bạt / túi ngủ buộc 2 dây,
  // ba lô, can nước, hòm đạn rỗng đựng đồ, túi cát vá. Mỗi tấm lồng ~1/3 khả năng có 1 món; món nào cũng có dây chằng
  // vắt qua nan. Cùng tag tấm lồng (bị bắn thì móp / văng theo lồng)
  function stowOnCage(b, M, X, s, pos, a0, a1, lo, hi, plane) {
    if (a1 - a0 < 4.5 || hi - lo < 3 || kitRnd() > 0.36) return;
    const along = (w, h, d, p, rot) => X ? b.box(d, h, w, M.canvas, p, rot) : b.box(w, h, d, M.canvas, p, rot);
    const strap = (a, y, h, c, d) => X ? b.box(d + 0.1, h, 0.22, M.canvasDark, pos(a, y, c)) : b.box(0.22, h, d + 0.1, M.canvasDark, pos(a, y, c));
    const kind = kitRnd(), H = hi - lo;
    if (kind < 0.38) {
      // cuộn bạt / túi ngủ nằm ngang trên mép trên tấm lồng, 2 dây chằng
      const L = Math.min(a1 - a0 - 1, 4 + kitRnd() * 2.5), am = a0 + (a1 - a0) / 2 + (kitRnd() - 0.5) * (a1 - a0 - L - 1), r = 0.7 + kitRnd() * 0.25;
      const y = hi - r * 0.6, c = plane + 0.35 + r;
      const mat = kitRnd() < 0.5 ? M.canvas : M.canvasDark;
      b.cyl(r, r * 0.94, L, 9, mat, pos(am, y, c), X ? 'z' : 'x', [0, 0, 0]);
      for (const k of [-0.32, 0.32]) {
        const ak = am + k * L;
        X ? b.box(2 * r + 0.16, 2 * r + 0.16, 0.24, M.canvasDark, pos(ak, y, c)) : b.box(0.24, 2 * r + 0.16, 2 * r + 0.16, M.canvasDark, pos(ak, y, c));
        strap(ak, y - r - (y - r - lo) * 0.25, (y - r - lo) * 0.5, plane + 0.12, 0.08);   // đuôi dây buộc xuống nan
      }
    } else if (kind < 0.62) {
      // ba lô / túi đồ treo móc lên khung trên, hơi xệ
      const w = 2.2 + kitRnd() * 0.6, h = Math.min(H * 0.6, 2.6 + kitRnd() * 0.6), d = 1.2 + kitRnd() * 0.4;
      const am = a0 + 1.5 + kitRnd() * (a1 - a0 - 3), y = hi - 0.3 - h / 2, c = plane + 0.3 + d / 2, tilt = (kitRnd() - 0.5) * 0.12;
      along(w, h, d, pos(am, y, c), X ? [tilt, 0, 0] : [0, 0, tilt]);
      along(w * 0.92, 0.5, d * 1.08, pos(am, y + h / 2 - 0.1, c + 0.05), X ? [tilt, 0, 0] : [0, 0, tilt]);   // nắp túi
      along(w * 0.55, h * 0.35, 0.4, pos(am, y - h * 0.15, c + d / 2 + 0.15));                              // túi ngoài
      for (const k of [-0.3, 0.3]) strap(am + k * w, y + h / 2 + 0.3, 0.9, plane + 0.2, 0.12);
    } else if (kind < 0.8) {
      // can nước / nhiên liệu buộc dây vào nan
      const am = a0 + 1.5 + kitRnd() * (a1 - a0 - 3), y = lo + Math.min(H, 4) * 0.5 + 0.2, c = plane + 0.3 + 0.75;
      const p = pos(am, y, c);
      b.jerrycan(p, X ? 0 : Math.PI / 2, 1.3, 3.6, 2.6, kitRnd() < 0.5 ? M.era : M.eraPrimer, M.steel);
      strap(am, y + 0.4, 0.24, c + 0.7, 1.6);
    } else {
      // hòm đạn rỗng tái dùng đựng đồ, chằng dây ngang
      const am = a0 + 1.5 + kitRnd() * (a1 - a0 - 3), y = lo + 1.4, c = plane + 0.3 + 0.8;
      X ? b.box(1.6, 2.0, 3.0, M.eraPrimer, pos(am, y, c)) : b.box(3.0, 2.0, 1.6, M.eraPrimer, pos(am, y, c));
      X ? b.box(1.7, 0.2, 2.2, M.steel, pos(am, y + 1.05, c)) : b.box(2.2, 0.2, 1.7, M.steel, pos(am, y + 1.05, c));   // quai xách
      X ? b.box(1.8, 0.24, 3.2, M.canvasDark, pos(am, y + 0.2, c)) : b.box(3.2, 0.24, 1.8, M.canvasDark, pos(am, y + 0.2, c));
    }
  }

  function cageWall(b, M, cast, f) {
    const st = M.cage || M.steel, X = f.axis === 'x', s = f.s, gap = CAGE_GAP + (f.extra || 0);
    const pos = (a, y, c) => X ? [s * c, y, a] : [a, y, s * c];
    const box = (along, h, nrm, p) => X ? b.box(nrm, h, along, st, p) : b.box(along, h, nrm, st, p);
    const DA = 1.2, DY = 0.7, cols = [];
    // cửa (f.doors: [{ a0, a1 }]): bỏ trống 1 cột ở 2 mép cửa -> đoạn lồng trước cửa thành tấm riêng (cửa lồng bản lề)
    const doorEdge = (a) => (f.doors || []).some(d => Math.abs(a - d.a0) < DA * 0.5 || Math.abs(a - d.a1) < DA * 0.5);
    for (let a = f.a0; a <= f.a1 + 1e-6; a += DA) {
      if (doorEdge(a)) { cols.push(null); continue; }
      const cells = [];
      for (let y = f.y0; y <= f.y1 + 1e-6; y += DY) {
        const h = cast(X ? [s * 90, y, a] : [a, y, s * 130], X ? [-s, 0, 0] : [0, 0, -s]);
        cells.push({ y, v: h ? s * (X ? h.x : h.z) : null });
      }
      const vals = cells.map(c => c.v).filter(v => v !== null);
      if (vals.length < 3) { cols.push(null); continue; }
      const m = median(vals);
      for (const c of cells) if (c.v !== null && c.v < m - 2.5) c.v = null;   // tia lọt qua mép, chạm sâu bên trong
      const body = cells.filter(c => c.v !== null && c.v <= m + 1.4);       // vỏ (bỏ phụ kiện nhô ra)
      if (body.length < 3) { cols.push(null); continue; }
      const bv = body.map(c => c.v).sort((x, y) => x - y);   // mặt vỏ: phân vị 75% (tay nắm, bản lề nhỏ nhô ra -> khoét, không đẩy cả tấm ra xa)
      cols.push({ a, cells, base: bv[Math.floor(bv.length * 0.75)], lo: body[0].y, hi: body[body.length - 1].y });
    }
    // chia khúc liền nhau, mỗi khúc dài ~7
    const runs = [];
    let cur = [];
    for (const c of cols) { if (c) cur.push(c); else { if (cur.length > 2) runs.push(cur); cur = []; } }
    if (cur.length > 2) runs.push(cur);
    for (const run of runs) {
      // cả dãy tấm liền nhau cao bằng nhau (mép trên / dưới thẳng một đường)
      const rLo = median(run.map(c => c.lo)) - 0.2, rHi = Math.min(f.y1, median(run.map(c => c.hi))) + 0.3;
      const k = Math.max(1, Math.round((run.length - 1) * DA / 7));
      for (let i = 0; i < k; i++) {
        const seg = run.slice(Math.floor(i * (run.length - 1) / k), Math.floor((i + 1) * (run.length - 1) / k) + 1);
        if (seg.length < 2) continue;
        const plane = panel(seg, rLo, rHi);
        if (f.stow && !(f.doors || []).length) stowOnCage(b, M, X, s, pos, seg[0].a, seg[seg.length - 1].a, rLo, rHi, plane);
        // tấm lồng trước cửa cabin: bản lề 3 khớp ở mép trước + tay nắm mép sau -> mở cùng cửa cho kíp xe ra / vào
        const door = (f.doors || []).find(d => seg[0].a >= d.a0 - 0.1 && seg[seg.length - 1].a <= d.a1 + 0.1);
        if (door) {
          const a0 = seg[0].a - 0.35, a1 = seg[seg.length - 1].a - 0.45, H = rHi - rLo;
          for (const k of [0.15, 0.5, 0.85]) {
            const y = rLo + H * k;
            b.cyl(0.24, 0.24, 0.9, 8, st, pos(a0, y, plane), 'y');
            box(0.5, 0.3, 0.12, pos(a0 + 0.3, y, plane));
          }
          const ym = rLo + H * 0.55;
          box(0.12, 1.8, 0.12, pos(a1, ym, plane + 0.4));
          for (const dy of [-0.8, 0.8]) box(0.12, 0.12, 0.45, pos(a1, ym + dy, plane + 0.2));
        }
      }
    }
    function panel(seg, pLo, pHi) {
      const plane = Math.max(...seg.map(c => c.base)) + gap;
      // phụ kiện nhô qua mặt lồng / ô lọt vào vòng quay tháp -> khoét
      const blocked = (c, y) => c.cells.some(e => e.v !== null && e.v > plane - 0.45 && Math.abs(e.y - y) < DY * 0.9)
        || (f.keep && !f.keep(c.a, y, plane));
      // nan dẹt (bản rộng theo pháp tuyến) cách ~1,2, mép theo đường viền thân, cắt khúc quanh chỗ khoét. Mỗi nan dựng
      // thành nhiều khúc ngắn nối nhau để bị bắn thì móp / gãy được giữa thanh (vehicle_damage.js dentCage)
      // Lồng đã qua chiến trường (theo hạt giống vẻ ngoài của xe, dựng lại không đổi): vài nan rụng mất (mối hàn đứt), vài
      // nan xô lệch, vài nan bị quệt cong chìa ra ở đoạn dưới — không tấm nào thẳng tăm tắp như mới xuất xưởng
      const vbar = (a, y0, y1) => {
        const r = kitRnd();
        if (r < 0.035) return;
        const lean = r < 0.12 ? (kitRnd() - 0.5) * 0.1 : 0, bend = r > 0.93 ? 0.25 + kitRnd() * 0.35 : 0;
        const n = Math.max(1, Math.ceil((y1 - y0) / CAGE_SEG)), h = (y1 - y0) / n, ym = (y0 + y1) / 2, half = (y1 - y0) / 2;
        for (let i = 0; i < n; i++) {
          const y = y0 + h * (i + 0.5), k = bend ? Math.max(0, (ym - y) / half) : 0;
          const da = (y - ym) * Math.sin(lean), dn = k * k * bend * 1.8, rb = k * bend * 0.9;
          const p = pos(a + da, y, plane + dn);
          if (!lean && !rb) { box(0.16, h + 0.002, 0.6, p); continue; }
          if (X) b.box(0.6, h + 0.002, 0.16, st, p, [lean, 0, s * rb]);
          else b.box(0.16, h + 0.002, 0.6, st, p, [-s * rb, 0, -lean]);
        }
      };
      const tops = [];
      for (const c of seg) {
        const lo = pLo, hi = pHi;
        let start = null;
        for (let y = lo; y <= hi + 1e-6; y += DY / 2) {
          const bad = blocked(c, y);
          if (!bad && start === null) start = y;
          if (bad && start !== null) { if (y - start > 0.6) vbar(c.a, start, y); start = null; }
        }
        if (start !== null && hi - start > 0.6) vbar(c.a, start, hi);
        tops.push({ c, lo, hi });
      }
      // thanh khung trên / giữa / dưới đi theo đường viền (bỏ đoạn đi qua chỗ khoét)
      for (let i = 0; i + 1 < tops.length; i++) {
        const A = tops[i], B = tops[i + 1];
        for (const t of [0.04, 0.5, 0.96]) {
          const ya = A.lo + (A.hi - A.lo) * t, yb = B.lo + (B.hi - B.lo) * t;
          if (blocked(A.c, ya) || blocked(B.c, yb)) continue;
          const th = t === 0.5 ? 0.22 : 0.3;   // thép dẹt khung: mép trên / dưới dày, thanh giữa mảnh
          box(Math.abs(B.c.a - A.c.a) + 0.02, th, th, pos((A.c.a + B.c.a) / 2, (ya + yb) / 2, plane));
        }
      }
      // cột 2 đầu khúc + tay đỡ bắt vào vỏ (trên & dưới) ở 2 đầu và giữa khúc
      for (const c of [seg[0], seg[seg.length - 1]]) {
        // cột chỉ dựng ở đoạn không bị khoét (hốc bánh lái, phụ kiện nhô ra), chia khúc như nan
        let s0 = null;
        const post = (y0, y1) => { const n = Math.max(1, Math.ceil((y1 - y0) / CAGE_SEG)), h = (y1 - y0) / n; for (let i = 0; i < n; i++) box(0.36, h + 0.002, 0.36, pos(c.a, y0 + h * (i + 0.5), plane)); };
        for (let y = pLo - 0.05; y <= pHi + 0.05 + 1e-6; y += DY / 2) {
          const bad = blocked(c, y);
          if (!bad && s0 === null) s0 = y;
          if (bad && s0 !== null) { if (y - s0 > 0.6) post(s0, y); s0 = null; }
        }
        if (s0 !== null && pHi + 0.05 - s0 > 0.6) post(s0, pHi + 0.05);
      }
      for (const c of [seg[0], seg[seg.length >> 1], seg[seg.length - 1]]) {
        for (const y of [pHi - 0.6, pLo + 0.6]) {
          if (blocked(c, y)) continue;
          const e = nearest(c.cells.filter(q => q.v !== null), 'y', y);
          const shell = e ? e.v : c.base, len = plane - shell;
          if (len < 0.1) continue;
          box(0.26, 0.26, len, pos(c.a, y, (plane + shell) / 2));
          box(0.9, 0.9, 0.18, pos(c.a, y, shell + 0.09));
        }
      }
      return plane;
    }
  }

  // Mái lồng nằm ngang (nóc tháp / nóc thân / sàn máy) — khung chữ nhật gọn kiểu lồng chống UAV thật:
  // quét tia từ trên xuống tìm mặt nóc phẳng (độ cao phổ biến), lấy hình chữ nhật lớn nhất nằm gọn trên mặt đó, cách nóc
  // ~0,2 m. Khung viền thép hộp, nan dẹt chạy ngang đều 1 đơn vị, 2 thanh dọc đỡ; chỗ nhô lên (kính ngắm, nắp, ăng-ten),
  // bệ vũ khí (holes) và vùng keep() = false thành ô vuông khoét có viền. Chân chống thẳng ở góc + giữa cạnh dài
  function cageRoof(b, M, cast, x0, x1, z0, z1, holes, keep) {
    const st = M.cage || M.steel, D = 0.5, G = [];
    const nx = Math.round((x1 - x0) / D), nz = Math.round((z1 - z0) / D), all = [];
    for (let j = 0; j <= nz; j++) {
      const row = [], z = z0 + j * D;
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * D, h = cast([x, 120, z], [0, -1, 0]);
        row.push(h ? h.y : null);
        if (h) all.push(h.y);
      }
      G.push(row);
    }
    if (all.length < 20) return;
    const mAll = median(all), ref = median(all.filter(y => y >= mAll)), yt = ref + 1.7;
    const flat = (i, j) => { const y = G[j][i]; return y !== null && y > ref - 0.6; };
    // hình chữ nhật: hàng nào có đoạn nóc phẳng liền -> mép trái / phải; lấy dải hàng liền nhau dài nhất có bề rộng >= 60%
    const span = G.map((row, j) => {
      let best = null, a = null;
      for (let i = 0; i <= nx + 1; i++) {
        const ok = i <= nx && flat(i, j);
        if (ok && a === null) a = i;
        if (!ok && a !== null) { if (!best || i - 1 - a > best[1] - best[0]) best = [a, i - 1]; a = null; }
      }
      return best;
    });
    const wMax = Math.max(0, ...span.map(s => (s ? s[1] - s[0] : 0)));
    let run = null, cur = null;
    span.forEach((s, j) => {
      const ok = s && s[1] - s[0] >= wMax * 0.6;
      if (ok && !cur) cur = [j, j];
      else if (ok) cur[1] = j;
      if ((!ok || j === span.length - 1) && cur) { if (!run || cur[1] - cur[0] > run[1] - run[0]) run = cur; cur = null; }
    });
    if (!run || run[1] - run[0] < 4) return;
    const rows = span.slice(run[0], run[1] + 1);
    const iL = median(rows.map(s => s[0])), iR = median(rows.map(s => s[1]));
    const X0 = x0 + iL * D + 0.3, X1 = x0 + iR * D - 0.3, Z0 = z0 + run[0] * D + 0.3, Z1 = z0 + run[1] * D - 0.3;
    if (X1 - X0 < 3 || Z1 - Z0 < 3) return;
    // ô khoét: chỗ nhô qua mặt lồng / không phải nóc phẳng / lỗ cho trước / ngoài keep -> gom thành hình chữ nhật có viền
    const cut = [];
    const bad = (x, z) => {
      const i = Math.round((x - x0) / D), j = Math.round((z - z0) / D), y = G[j] && G[j][i];
      return y === null || y === undefined || y < ref - 0.6 || y > yt - 0.35 || (keep && !keep(x, z, yt));
    };
    const seen = new Set();
    for (let z = Z0; z <= Z1; z += D) for (let x = X0; x <= X1; x += D) {
      const k = Math.round(x / D) + ',' + Math.round(z / D);
      if (seen.has(k) || !bad(x, z)) continue;
      // lan ra các ô xấu liền kề (4 hướng) -> hình bao
      const st2 = [[x, z]], box = [x, x, z, z];
      seen.add(k);
      while (st2.length) {
        const [cx, cz] = st2.pop();
        box[0] = Math.min(box[0], cx); box[1] = Math.max(box[1], cx); box[2] = Math.min(box[2], cz); box[3] = Math.max(box[3], cz);
        for (const [dx, dz] of [[D, 0], [-D, 0], [0, D], [0, -D]]) {
          const nx2 = cx + dx, nz2 = cz + dz, kk = Math.round(nx2 / D) + ',' + Math.round(nz2 / D);
          if (nx2 < X0 - 1e-6 || nx2 > X1 + 1e-6 || nz2 < Z0 - 1e-6 || nz2 > Z1 + 1e-6 || seen.has(kk) || !bad(nx2, nz2)) continue;
          seen.add(kk); st2.push([nx2, nz2]);
        }
      }
      cut.push([box[0] - 0.5, box[1] + 0.5, box[2] - 0.5, box[3] + 0.5]);
    }
    for (const [hx, hz, r] of holes) cut.push([hx - r, hx + r, hz - r, hz + r]);
    const inCut = (x, z) => cut.some(c => x > c[0] && x < c[1] && z > c[2] && z < c[3]);
    // đoạn thẳng [a, b] theo trục x ở độ sâu z (hoặc theo z ở x) trừ các ô khoét
    const pieces = (a, bb, fixed, alongX) => {
      const out = [];
      let s = null;
      for (let t = a; t <= bb + 1e-6; t += 0.1) {
        const free = !(alongX ? inCut(t, fixed) : inCut(fixed, t));
        if (free && s === null) s = t;
        if ((!free || t + 0.1 > bb + 1e-6) && s !== null) { const e = free ? t : t - 0.1; if (e - s > 0.4) out.push([s, e]); s = null; }
      }
      return out;
    };
    const W = X1 - X0, L = Z1 - Z0, xm = (X0 + X1) / 2, zm = (Z0 + Z1) / 2;
    // khung viền (thanh dài chia khúc: móp / gãy tại chỗ bị bắn)
    for (const z of [Z0, Z1]) for (const [a, c] of pieces(X0, X1, z, true)) segRun(b, st, 'x', a - 0.15, c + 0.15, [0, yt, z], 0.3, 0.3);
    for (const x of [X0, X1]) for (const [a, c] of pieces(Z0, Z1, x, false)) segRun(b, st, 'z', a - 0.15, c + 0.15, [x, yt, 0], 0.3, 0.3);
    // nan ngang đều
    const n = Math.round(L / 1.0);
    for (let k = 1; k < n; k++) {
      const z = Z0 + L * k / n;
      for (const [a, c] of pieces(X0, X1, z, true)) segRun(b, st, 'x', a, c, [0, yt, z], 0.36, 0.12);
    }
    // 2 thanh dọc đỡ nan (nằm dưới nan)
    for (const x of [X0 + W / 3, X0 + W * 2 / 3]) for (const [a, c] of pieces(Z0, Z1, x, false)) segRun(b, st, 'z', a, c, [x, yt - 0.28, 0], 0.22, 0.22);
    // viền ô khoét
    for (const c of cut) {
      const a0 = Math.max(X0, c[0]), a1 = Math.min(X1, c[1]), b0 = Math.max(Z0, c[2]), b1 = Math.min(Z1, c[3]);
      if (a1 - a0 < 0.3 || b1 - b0 < 0.3) continue;
      for (const z of [b0, b1]) if (z > Z0 + 0.2 && z < Z1 - 0.2) b.box(a1 - a0 + 0.24, 0.24, 0.24, st, [(a0 + a1) / 2, yt, z]);
      for (const x of [a0, a1]) if (x > X0 + 0.2 && x < X1 - 0.2) b.box(0.24, 0.24, b1 - b0 + 0.24, st, [x, yt, (b0 + b1) / 2]);
    }
    // chân chống thẳng xuống nóc: 4 góc + giữa 2 cạnh dài (+ thêm nếu dài)
    const legs = [];
    const kz = Math.max(1, Math.round(L / 7));
    for (let k = 0; k <= kz; k++) for (const x of [X0, X1]) legs.push([x, Z0 + L * k / kz]);
    for (const x of [xm]) for (const z of [Z0, Z1]) legs.push([x, z]);
    for (const [x, z] of legs) {
      if (inCut(x, z)) continue;
      const i = Math.round((x - x0) / D), j = Math.round((z - z0) / D), y = G[j] && G[j][i];
      if (y === null || y === undefined || yt - y < 0.3) continue;
      b.box(0.26, yt - y, 0.26, st, [x, (yt + y) / 2, z]);
      b.box(0.8, 0.12, 0.8, st, [x, y + 0.06, z]);
    }
  }

  // Nắp chui của kíp xe (bộ phận tag 'hatch...' trên mô hình) nằm trên host -> ô chừa trên mái lồng [x, z, nửa cạnh]:
  // kíp xe phải chui ra / vào được, lồng chống UAV thật luôn chừa ô có khung (hoặc nắp lật) ngay trên nắp
  function hatchHoles(u, host) {
    const out = [], R = u.partRegistry || {}, v = new THREE.Vector3(), inv = new THREE.Matrix4();
    host.updateMatrixWorld(true);
    inv.copy(host.matrixWorld).invert();
    for (const tag in R) {
      if (!/^hatch/.test(tag)) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const e of R[tag]) {
        let onHost = false;
        for (let p = e.mesh; p; p = p.parent) {
          if (p === host) { onHost = true; break; }
          if (p === u.turretGroup) break;   // nắp trên tháp không tính cho mái lồng thân xe
        }
        if (!onHost) continue;
        const pos = e.mesh.geometry.attributes.position;
        for (const [st, n] of e.ranges) for (let i = st; i < st + n; i += 3) {
          v.fromBufferAttribute(pos, i).applyMatrix4(e.mesh.matrixWorld).applyMatrix4(inv);
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
        }
      }
      if (x0 < x1) out.push([(x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 0.7]);
    }
    return out;
  }

  // Vòng quay của tháp trong hệ tọa độ thân: tâm, bán kính quét (bỏ nòng) và mép dưới tháp
  function turretSweep(u) {
    const tg = u.turretGroup, ch = u.chassisGroup;
    if (!tg || !ch) return null;
    ch.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(ch.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(tg.matrixWorld).invert();
    const c = new THREE.Vector3().setFromMatrixPosition(tg.matrixWorld).applyMatrix4(inv);
    let R = 0, bot = Infinity;
    const v = new THREE.Vector3(), l = new THREE.Vector3();
    tg.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      for (let p = o; p && p !== tg; p = p.parent) if (p === u.barrelGroup || p === u.barrelPivot) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld);
        l.copy(v).applyMatrix4(tInv);
        R = Math.max(R, Math.hypot(l.x, l.z));
        bot = Math.min(bot, v.applyMatrix4(inv).y);
      }
    });
    return { x: c.x, z: c.z, R: R + 1.5, bot: bot - 0.6 };
  }

  // Dựng cả bộ giáp lồng của xe (buildVisuals, khi có món 'slat')
  function* cageSteps(u, hull, tur, M, F, T) {
    const plan = CAGE_PLAN[u.tankType];
    if (!plan || !u.chassisGroup) return;
    const skipH = new Set(), skipT = new Set();
    if (u.turretGroup) skipH.add(u.turretGroup);
    for (const k in (u._mounts || {})) if (u._mounts[k].group) { skipH.add(u._mounts[k].group); skipT.add(u._mounts[k].group); }
    if (u.barrelGroup) skipT.add(u.barrelGroup);
    const H = plan.hull, castH = cageCaster(u.chassisGroup, skipH);
    yield;
    // giáp lắp thêm chưa có trong lưới quét (hull batch dựng sau) -> lùi mặt lồng ra thêm. Xe 6 nòng: giáp ốp dải sườn
    // trên váy xích, không nhô quá mặt gạch váy có sẵn -> không cần lùi
    const GT = u.tankType === 'GATLING';
    const extraH = GT ? 0 : (has(u, 'applique') ? 1.9 : 0) + (has(u, 'era') ? 1.2 : 0);
    const sw = T && u.turretGroup ? turretSweep(u) : null;
    // ô thân nằm trong vòng quay của tháp mà cao hơn mép dưới tháp -> bỏ
    const keepH = (x, y, z) => !sw || y < sw.bot || Math.hypot(x - sw.x, z - sw.z) > sw.R;
    const zA = F.zF - 4, zB = F.zR + 4, xW = F.hw + 4;
    if (H.sides) for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'cageKitL' : 'cageKitR');
      const inArch = (z, y) => (H.arch || []).some(w => Math.abs(z - w.z) < w.r && y < w.top);
      cageWall(hull, M, castH, { axis: 'x', s, a0: zA, a1: zB, y0: H.y0, y1: H.y1, extra: extraH, doors: H.doors, stow: true, keep: (a, y, c) => keepH(s * c, y, a) && !inArch(a, y) });
      yield;
    }
    if (H.rear) {
      hull.setTag('cageKitB');
      cageWall(hull, M, castH, { axis: 'z', s: 1, a0: -xW, a1: xW, y0: H.y0, y1: H.y1, stow: true, keep: (a, y, c) => keepH(a, y, c) });
      yield;
    }
    if (H.front) {
      hull.setTag('cageKitF');
      cageWall(hull, M, castH, { axis: 'z', s: -1, a0: -xW, a1: xW, y0: H.front[0], y1: H.front[1], keep: (a, y, c) => keepH(a, y, -c) });
    }
    if (H.deck && H.deck !== 'arc' && sw) {
      // mái lồng sàn máy phía sau, ngoài vòng quay tháp (UAV hay nhắm sàn máy)
      hull.setTag('cageKitD');
      cageRoof(hull, M, castH, -F.hw + 0.8, F.hw - 0.8, sw.z + sw.R * 0.5, F.zR - 0.8, hatchHoles(u, u.chassisGroup), (x, z, y) => keepH(x, y, z));
      yield;
    }
    if (H.roofHull) {
      hull.setTag('cageKitT');
      const hole = CAGE_HOLE[u.tankType];
      cageRoof(hull, M, castH, -F.hw + 0.8, F.hw - 0.8, F.zF + 4, F.zR - 1, (hole ? [hole] : []).concat(hatchHoles(u, u.chassisGroup)));
      yield;
    }
    if (!plan.tur || !T || !u.turretGroup) return;
    const P = plan.tur, castT = cageCaster(u.turretGroup, skipT);
    yield;
    M = Object.assign({}, M, { cage: M.cageT || M.cage });
    // Cụm ống phóng lựu đạn khói trên hông tháp: lồng chừa ô trống trước & phía trên miệng ống (lựu bay ra ngoài - chếch lên),
    // không nan / thanh khung nào chắn đường bay — trước đây vách lồng chạy thẳng ngang qua miệng ống
    const smk = smokeBoxes(u, u.turretGroup);
    const clearSmoke = (s, a, y) => !smk.some(b => b.s === s && a > b.box.min.z - 0.9 && a < b.box.max.z + 0.9 && y > b.box.min.y - 0.8);
    const len = T.zR - T.zF, zf = T.zF + len * P.front, extraT = (has(u, 'era') ? 1.2 : 0) + (GT && has(u, 'applique') ? 1.5 : 0);
    const ry = REAL_ROOF[u.tankType] || T.h;   // lồng sườn / đuôi tháp dừng ở mép nóc, mái lồng phủ bên trên
    if (P.sides) for (const s of [-1, 1]) {
      tur.setTag(s < 0 ? 'cageKitTL' : 'cageKitTR');
      cageWall(tur, M, castT, { axis: 'x', s, a0: zf, a1: T.zR + 3, y0: -1, y1: ry, extra: extraT, keep: (a, y) => clearSmoke(s, a, y) });
      yield;
    }
    if (P.rear) {
      tur.setTag('cageKitTB');
      cageWall(tur, M, castT, { axis: 'z', s: 1, a0: -T.hw - 2, a1: T.hw + 2, y0: -1, y1: ry });
      yield;
    }
    if (P.roof) {
      tur.setTag('cageKitT');
      const holes = (CAGE_HOLE[u.tankType] ? [CAGE_HOLE[u.tankType]] : []).concat(hatchHoles(u, u.turretGroup));
      if (has(u, 'aps')) {   // 2 cụm radar + ống đánh chặn ở 2 góc nóc tháp
        const A = apsSpot(u, null, T);
        for (const s of [-1, 1]) holes.push([s * A.tx, A.tz, 3.0], [s * A.lx, A.lz, 2.2]);
      }
      const spot = ROOF_SPOT[u.tankType] || {};
      if (has(u, 'radar') && spot.radar) holes.push([spot.radar[0], spot.radar[1], 2.4]);
      if (has(u, 'jammer') && spot.jam) holes.push([spot.jam[0], spot.jam[1], 2.2]);
      for (const b of smk) holes.push([b.s * (T.hw + 1), (b.box.min.z + b.box.max.z) / 2, (b.box.max.z - b.box.min.z) / 2 + 1.2]);   // mép mái trên cụm ống khói
      cageRoof(tur, M, castT, -T.hw - 1, T.hw + 1, zf, T.zR + 2, holes);
    }
  }

  // Hộp bao cụm ống phóng lựu khói đang hiện (bộ phận smokeL / smokeR của mô hình, smokeKitL / R mua thêm) trong hệ `host`
  // -> [{ s: bên (-1 trái / 1 phải), box }]. Ống có sẵn bị ẩn (chưa lắp trang bị khói) đã rời danh sách bộ phận nên không tính
  function smokeBoxes(u, host) {
    const out = [], R = u.partRegistry || {}, v = new THREE.Vector3(), K = new THREE.Matrix4();
    host.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(host.matrixWorld).invert();
    for (const tag of ['smokeL', 'smokeR', 'smokeKitL', 'smokeKitR']) {
      const box = new THREE.Box3();
      for (const e of R[tag] || []) {
        let o = e.mesh;
        while (o && o !== host) o = o.parent;
        if (!o) continue;
        K.multiplyMatrices(inv, e.mesh.matrixWorld);
        const pa = e.mesh.geometry.attributes.position;
        for (const [st, n] of e.ranges) for (let i = st; i < st + n; i++) box.expandByPoint(v.fromBufferAttribute(pa, i).applyMatrix4(K));
      }
      if (!box.isEmpty()) out.push({ s: tag.endsWith('L') ? -1 : 1, box });
    }
    return out;
  }

  // Mái lồng sàn sau (CAGE_PLAN hull.deck = 'arc', xe 6 nòng): tháp chỉ quay nửa trước nên cụm nòng không gạt qua sàn sau,
  // nhưng đuôi tháp + lồng tháp vẫn quét tròn -> mái phủ phần sàn sau nằm ngoài vòng quét, mép trước cong theo vòng quét.
  // Gọi SAU khi lồng tháp đã gắn vào tháp: vòng quét đo từ đỉnh lưới thật của tháp (bỏ nòng), không phải hộp bao.
  // Cao hơn đồ chằng trên sàn (thùng đồ, can) ~0,1 m; nan ngang đều 1 đơn vị, khung viền, 2 thanh dọc đỡ, chân chống xuống sàn
  function cageDeckArc(u, M, F) {
    const ch = u.chassisGroup, tg = u.turretGroup;
    if (!ch || !tg) return;
    ch.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(ch.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(tg.matrixWorld).invert();
    const c = new THREE.Vector3().setFromMatrixPosition(tg.matrixWorld).applyMatrix4(inv);
    let R = 0;
    const v = new THREE.Vector3();
    tg.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      for (let p = o; p && p !== tg; p = p.parent) if (p === u.barrelGroup || p === u.barrelPivot || p.visible === false) return;
      const pa = o.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).applyMatrix4(tInv);
        R = Math.max(R, Math.hypot(v.x, v.z));
      }
    });
    R += 1.0;
    const skip = new Set([tg]);
    for (const k in (u._mounts || {})) if (u._mounts[k].group) skip.add(u._mounts[k].group);
    const cast = cageCaster(ch, skip);
    const X = F.hw - 0.8, zB = F.zR - 0.8;
    const inner = (z) => { const dz = z - c.z; return dz >= R ? 0 : Math.sqrt(R * R - dz * dz); };   // nửa bề rộng vòng quét ở z
    // các hàng nan từ mép sau ra trước, tới khi phần ngoài vòng quét còn hẹp quá
    const rows = [];
    for (let z = zB; z > c.z; z -= 1.0) {
      const xa = inner(z);
      if (X - xa < 0.8) break;
      rows.push({ z, xa });
    }
    if (rows.length < 3) return;
    // độ cao mái: vật cao nhất trên phần sàn được phủ (bỏ 2% điểm cao lẻ: tay nắm, ăng-ten nhỏ)
    const hs = [];
    for (const r of rows) for (let x = -X; x <= X + 1e-6; x += 0.5) {
      if (Math.abs(x) < r.xa) continue;
      const h = cast([x, 120, r.z], [0, -1, 0]);
      if (h) hs.push(h.y);
    }
    if (hs.length < 20) return;
    hs.sort((a, b) => a - b);
    const yt = hs[Math.floor(hs.length * 0.98)] + 0.8;
    const b = batch(u), st = M.cage || M.steel;
    b.setTag('cageKitD');
    // ô chừa trên nắp tổ lái (kíp xe chui ra / vào): nan cắt quanh ô, ô có khung viền
    const holes = hatchHoles(u, ch).filter(([hx, hz, hr]) => hz + hr > rows[rows.length - 1].z && Math.abs(hx) - hr < X);
    const inHole = (x, z) => holes.some(([hx, hz, hr]) => Math.abs(x - hx) < hr && Math.abs(z - hz) < hr);
    const cutX = (segs, z) => {
      let out = segs;
      for (const [hx, hz, hr] of holes) {
        if (Math.abs(z - hz) >= hr) continue;
        out = out.flatMap(([p, q]) => (hx + hr <= p || hx - hr >= q) ? [[p, q]] : [[p, hx - hr], [hx + hr, q]].filter(([a, c]) => c - a > 0.4));
      }
      return out;
    };
    const pieces = (r) => cutX(r.xa <= 0 ? [[-X, X]] : [[-X, -r.xa], [r.xa, X]], r.z);
    // khung sau + nan ngang
    rows.forEach((r, k) => {
      for (const [a, e] of pieces(r)) {
        if (k === 0) segRun(b, st, 'x', a - 0.15, e + 0.15, [0, yt, r.z], 0.3, 0.3);
        else segRun(b, st, 'x', a, e, [0, yt, r.z], 0.36, 0.12);
      }
    });
    const zF = rows[rows.length - 1].z;
    // khung sườn
    for (const s of [-1, 1]) segRun(b, st, 'z', zF - 0.15, zB + 0.15, [s * X, yt, 0], 0.3, 0.3);
    // mép trước cong: nối đầu trong các hàng nan
    for (const s of [-1, 1]) {
      for (let k = 0; k + 1 < rows.length; k++) {
        const A = rows[k], B = rows[k + 1];
        if (A.xa <= 0 && B.xa <= 0) continue;
        b.beam([s * A.xa, yt, A.z], [s * B.xa, yt, B.z], 0.3, 0.3, st);
      }
      const L = rows[rows.length - 1];
      b.box(X - L.xa + 0.3, 0.3, 0.3, st, [s * (X + L.xa) / 2, yt, L.z]);
    }
    // 2 thanh dọc đỡ nan mỗi bên (nằm dưới nan), từ mép cong tới khung sau
    for (const s of [-1, 1]) for (const f of [0.45, 0.78]) {
      const x = X * f, zs = rows.filter(r => r.xa < x - 0.2);
      if (zs.length < 2) continue;
      const z0 = zs[zs.length - 1].z;
      let runs = [[z0, zB]];
      for (const [hx, hz, hr] of holes) {
        if (Math.abs(s * x - hx) >= hr) continue;
        runs = runs.flatMap(([p, q]) => (hz + hr <= p || hz - hr >= q) ? [[p, q]] : [[p, hz - hr], [hz + hr, q]].filter(([a, c]) => c - a > 0.4));
      }
      for (const [p, q] of runs) segRun(b, st, 'z', p, q, [s * x, yt - 0.28, 0], 0.22, 0.22);
    }
    // khung viền ô chừa nắp
    for (const [hx, hz, hr] of holes) {
      const xa = Math.max(-X, hx - hr), xb = Math.min(X, hx + hr), za = Math.max(zF, hz - hr), zb = Math.min(zB, hz + hr);
      for (const z of [za, zb]) segRun(b, st, 'x', xa - 0.12, xb + 0.12, [0, yt, z], 0.24, 0.24);
      for (const x of [xa, xb]) segRun(b, st, 'z', za, zb, [x, yt, 0], 0.24, 0.24);
    }
    // chân chống thẳng xuống sàn: góc, dọc 2 sườn, giữa khung sau, vài điểm trên mép cong
    const legs = [];
    const nz = Math.max(1, Math.round((zB - zF) / 6));
    for (let k = 0; k <= nz; k++) for (const s of [-1, 1]) legs.push([s * X, zB - (zB - zF) * k / nz]);
    if (rows[0].xa <= 0) legs.push([0, zB]);
    for (let k = 3; k < rows.length - 1; k += 4) if (rows[k].xa > 0) for (const s of [-1, 1]) legs.push([s * rows[k].xa, rows[k].z]);
    for (const [x0, z] of legs) {
      if (inHole(x0, z)) continue;
      // khung sườn chìa ra ngoài mép nóc: dịch chân vào trong tới chỗ có mặt sàn (không thả xuống tận váy xích)
      for (let k = 0, x = x0; k < 8; k++, x -= Math.sign(x0) * 0.5) {
        const h = cast([x, yt - 0.2, z], [0, -1, 0]);
        if (!h || yt - h.y > 6) { if (x0 === 0) break; continue; }
        if (yt - h.y < 0.3) break;
        b.box(0.26, yt - h.y, 0.26, st, [x, (yt + h.y) / 2, z]);
        b.box(0.8, 0.12, 0.8, st, [x, h.y + 0.06, z]);
        if (Math.abs(x - x0) > 0.2) b.box(Math.abs(x - x0) + 0.26, 0.22, 0.22, st, [(x + x0) / 2, yt - 0.28, z]);   // tay đỡ nối khung sườn
        break;
      }
    }
    buildBatch(u, b, ch);
    return { y: yt, x: X, z0: zF, z1: zB, inner };   // mái lồng sàn sau (inner(z): nửa bề rộng chỗ khuyết): lưới lá phủ lên trên (buildFoliage)
  }

  // Ống phóng lựu khói có sẵn trên mô hình (tag smokeL / smokeR): chưa lắp trang bị "Ống phóng lựu khói" thì gỡ đi
  // (thu gọn các đỉnh về 1 điểm + bỏ khỏi danh sách bộ phận để hệ thống hư hại không nhắm tới)
  function setStockSmoke(u, on) {
    const R = u.partRegistry;
    if (!R) return;
    const H = u._stockSmokeHidden || (u._stockSmokeHidden = {});
    for (const tag of ['smokeL', 'smokeR']) {
      if (on) {
        // lắp lại: trả các đỉnh về chỗ cũ
        const hid = H[tag];
        if (!hid) continue;
        for (const e of hid) {
          const pos = e.mesh.geometry.attributes.position;
          e.ranges.forEach(([st], k) => pos.array.set(e.saved[k], st * 3));
          pos.needsUpdate = true;
          e.mesh.geometry.computeBoundingSphere();
        }
        R[tag] = hid;
        delete H[tag];
        continue;
      }
      const list = R[tag];
      if (!list) continue;
      H[tag] = list;
      for (const e of list) {
        const pos = e.mesh.geometry.attributes.position;
        e.saved = e.ranges.map(([st, n]) => pos.array.slice(st * 3, (st + n) * 3));
        for (const [st, n] of e.ranges) {
          const x = pos.getX(st), y = pos.getY(st), z = pos.getZ(st);
          for (let i = st; i < st + n; i++) pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
        e.mesh.geometry.computeBoundingSphere();
      }
      delete R[tag];
    }
    if (u._partCenters) { delete u._partCenters.smokeL; delete u._partCenters.smokeR; }
  }
  function batch(u) {
    const PB = window.VehicleKit && VehicleKit.PartBatch;
    if (!PB) return null;
    const b = new PB(0);
    return b;
  }
  // Hộp bao các chi tiết đã thêm vào batch có nhãn bắt đầu bằng `prefix`: { nhãn: Box3 } (hệ tọa độ của batch)
  function tagBoxes(b, prefix) {
    const out = {};
    if (!b) return out;
    for (const geos of b.buckets.values()) for (const g of geos) {
      const t = g.userData.partTag;
      if (!t || !t.startsWith(prefix)) continue;
      g.computeBoundingBox();
      (out[t] || (out[t] = new THREE.Box3())).union(g.boundingBox);
    }
    return out;
  }
  function buildBatch(u, b, parent) {
    const PB = VehicleKit.PartBatch;
    const prev = PB.registry;
    PB.registry = u.partRegistry || (u.partRegistry = {});
    try { b.build(parent, null, { castShadow: true }); } finally { PB.registry = prev; }
  }

  // ---- Lá ngụy trang ----
  // Kiểu lưới theo bản đồ (màu lấy từ bảng màu địa hình, src/core/terrain.js / ground_shader.js) để xe lẫn vào nền:
  // rừng rậm lá to xanh đậm; sông hồ lá xanh tươi + cỏ lau; cao nguyên ô-liu + lá kim + đá xám;
  // sa mạc lưới mảnh vải cắt màu cát / đất / đá, ụ thấp như mô đất đá; đô thị mảnh xám bê tông / gạch vụn.
  // shapes: tỉ lệ [lá nhọn, lá tròn, cỏ, mảnh cắt, lá kim, sỏi]; sprig / twig: tỉ lệ ngọn lá nhô / cành; flat: độ bẹt bụi;
  // fire: loại cháy (CamoFire: 'green' lá tươi khói trắng, 'dry' khô cháy nhanh)
  const CAMO_STYLE = {
    JUNGLE: {
      pal: [[38, 58, 26], [50, 72, 30], [30, 46, 22], [60, 80, 34], [72, 88, 40], [70, 60, 36]],
      shapes: [0.62, 0.24, 0.1, 0, 0, 0.04], scale: 1.25, stem: 'rgba(50,44,30,0.95)', twig: 0x3b3223,
      tints: [[1, 1, 1], [0.82, 0.98, 0.74], [1.2, 1.06, 0.76], [0.72, 0.84, 0.62]], sprig: 0.22, twigP: 0.3, flat: 1, fire: 'green', seed: 7, shade: [0.6, 0.9, 1.12], edge: 0.7
    },
    RIVER_LAKE: {
      pal: [[62, 84, 36], [80, 100, 44], [48, 66, 30], [96, 108, 56], [110, 106, 66], [76, 70, 46]],
      shapes: [0.46, 0.18, 0.3, 0, 0, 0.06], scale: 1.05, stem: 'rgba(70,62,40,0.95)', twig: 0x4a3f2c,
      tints: [[1, 1, 1], [0.86, 1.0, 0.78], [1.16, 1.08, 0.82], [0.8, 0.86, 0.7]], sprig: 0.26, twigP: 0.22, flat: 0.95, fire: 'green', seed: 21, shade: [0.62, 0.9, 1.12], edge: 0.7
    },
    HIGHLAND: {
      pal: [[70, 80, 46], [88, 94, 56], [56, 64, 38], [104, 98, 70], [120, 116, 104], [84, 74, 56]],
      shapes: [0.34, 0.14, 0.16, 0.08, 0.22, 0.06], scale: 1, stem: 'rgba(66,56,40,0.95)', twig: 0x4a3e2c,
      tints: [[1, 1, 1], [0.88, 0.96, 0.8], [1.12, 1.04, 0.86], [0.94, 0.94, 0.94]], sprig: 0.18, twigP: 0.24, flat: 0.9, fire: 'green', seed: 13, shade: [0.64, 0.9, 1.1], edge: 0.6
    },
    DESERT: {
      pal: [[214, 184, 138], [196, 160, 112], [176, 140, 98], [154, 122, 90], [206, 190, 156], [184, 162, 120]],
      shapes: [0.04, 0.08, 0.12, 0.6, 0, 0.16], scale: 1, stem: 'rgba(120,98,70,0.95)', twig: 0x7a6650,
      tints: [[1.06, 1.04, 1.02], [0.96, 0.92, 0.86], [1.12, 1.06, 0.96], [0.86, 0.82, 0.78]], sprig: 0.08, twigP: 0.1, flat: 0.68, fire: 'dry', seed: 11, shade: [0.8, 0.95, 1.06], edge: 0.3
    },
    URBAN: {
      pal: [[138, 136, 130], [120, 118, 112], [104, 102, 98], [146, 138, 124], [124, 114, 100], [92, 92, 90]],
      shapes: [0.06, 0.04, 0.08, 0.66, 0, 0.16], scale: 1, stem: 'rgba(70,66,60,0.95)', twig: 0x55504a,
      tints: [[1, 1, 1], [0.86, 0.86, 0.86], [1.08, 1.02, 0.94], [0.74, 0.74, 0.76]], sprig: 0.06, twigP: 0.08, flat: 0.74, fire: 'dry', seed: 51, shade: [0.78, 0.94, 1.06], edge: 0.3
    }
  };
  const CAMO_ALIAS = { green: 'JUNGLE', dry: 'DESERT' };   // tên cũ (fx_lab ?leaf=green|dry)
  function foliageKind(u) {
    const f = u._foliageKind && (CAMO_STYLE[u._foliageKind] ? u._foliageKind : CAMO_ALIAS[u._foliageKind]);
    if (f) return f;   // phòng thử ép kiểu lưới
    const g = window.game;
    if (g && u.scene && u.scene === g.scene && g.currentMapType) return CAMO_STYLE[g.currentMapType] ? g.currentMapType : 'HIGHLAND';
    return u.team === 'RED' ? 'DESERT' : 'JUNGLE';
  }
  const foliageCache = {};
  function foliageMats(kind) {
    kind = CAMO_STYLE[kind] ? kind : CAMO_ALIAS[kind] || 'JUNGLE';
    if (foliageCache[kind]) return foliageCache[kind];
    const ST = CAMO_STYLE[kind];
    // Atlas 768 x 256: ô trái = lá dày (lõi bụi lá), ô giữa = chùm lá thưa dần ra mép (tấm lá rủ có viền lởm chởm),
    // ô phải = chùm lá tròn dày ở tâm, thưa dần ra viền (tấm lá xếp quanh bụi xù)
    // Vẽ 3 lớp: lá sẫm (bóng trong lòng bụi) -> lá giữa -> lá sáng trên cùng => có chiều sâu, không phẳng như tấm dán
    const c = document.createElement('canvas');
    c.width = 768; c.height = 256;
    const g = c.getContext('2d');
    const pal = ST.pal, cum = [];
    ST.shapes.reduce((a, v, i) => (cum[i] = a + v), 0);
    let seed = ST.seed;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Mảng màu loang lớn (như vải lưới in rằn ri thật): nhiễu giá trị tần số thấp chọn tông sáng / giữa / sẫm theo vị trí
    // -> lá cùng vùng cùng tông, thành từng đám ~1/3 ô; trước đây mỗi lá một màu ngẫu nhiên = nhiễu hạt li ti
    const hN = (ix, iy) => { let h = (ix * 374761393 + iy * 668265263 + ST.seed * 1013) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const vN = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hN(ix, iy), b = hN(ix + 1, iy), c = hN(ix, iy + 1), d = hN(ix + 1, iy + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
    const palL = pal.slice().sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));   // sẫm -> sáng
    const pick = (x, y) => {
      const t = Math.max(0, Math.min(0.999, (vN(x / 64, y / 64) * 0.7 + vN(x / 23 + 9.3, y / 23 + 4.1) * 0.3 - 0.22) / 0.56));
      return palL[Math.max(0, Math.min(palL.length - 1, Math.floor(t * palL.length + (r() - 0.5) * 1.3)))];
    };
    // lá nhọn (có gân giữa) / lá tròn / ngọn cỏ mảnh / mảnh vải cắt (lưới sa mạc, đô thị) / chùm lá kim / sỏi; sh = độ sáng của lớp
    const leafAt = (x, y, i, sc, sh) => {
      const p = pick(x, y), k = sh * (0.84 + r() * 0.32);
      const col = `rgba(${Math.min(255, p[0] * k) | 0},${Math.min(255, p[1] * k) | 0},${Math.min(255, p[2] * k) | 0},0.98)`;
      const dark = `rgba(${p[0] * k * 0.6 | 0},${p[1] * k * 0.6 | 0},${p[2] * k * 0.55 | 0},${ST.edge})`;
      const t = r() * cum[cum.length - 1], a = r() * 6.3;
      sc *= ST.scale;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col;
      g.beginPath();
      if (t < cum[0]) {
        const L = (7 + r() * 8) * sc, W = (2.6 + r() * 3) * sc;
        g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -W, L / 2, 0); g.quadraticCurveTo(0, W, -L / 2, 0); g.fill();
        g.strokeStyle = dark; g.lineWidth = 0.7 * sc;
        g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
      } else if (t < cum[1]) {
        g.ellipse(0, 0, (3.5 + r() * 4) * sc, (2.4 + r() * 2.6) * sc, 0, 0, 6.3); g.fill();
      } else if (t < cum[2]) {
        const L = (10 + r() * 10) * sc;
        g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, 1.6 * sc, L, (r() - 0.5) * 3 * sc); g.quadraticCurveTo(L * 0.5, -0.6 * sc, 0, 0); g.fill();
      } else if (t < cum[3]) {
        // mảnh vải cắt hình đa giác méo, mép sẫm (bóng của mảnh chồng lên nhau) -> mặt lưới lổn nhổn như đất đá
        const n = 5 + (r() * 4 | 0), R0 = (4 + r() * 5) * sc, el = 0.55 + r() * 0.45;
        for (let j = 0; j < n; j++) {
          const an = (j / n) * 6.283 + r() * 0.6, rr = R0 * (0.6 + r() * 0.5);
          j ? g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * el) : g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr * el);
        }
        g.closePath(); g.fill();
        g.strokeStyle = dark; g.lineWidth = 0.9 * sc; g.stroke();
      } else if (t < cum[4]) {
        g.strokeStyle = col; g.lineWidth = 1.1 * sc;
        const m = 6 + (r() * 5 | 0);
        for (let j = 0; j < m; j++) { const an = (j / m) * 2.6 - 1.3 + r() * 0.3, L = (5 + r() * 4) * sc; g.moveTo(0, 0); g.lineTo(Math.cos(an) * L, Math.sin(an) * L); }
        g.stroke();
      } else {
        g.ellipse(0, 0, (1.4 + r() * 1.8) * sc, (1.1 + r() * 1.4) * sc, 0, 0, 6.3); g.fill();
      }
      g.restore();
    };
    g.save(); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
    const [s0, s1, s2] = ST.shade;
    for (const [n, sh] of [[900, s0], [800, s1], [520, s2]]) for (let i = 0; i < n; i++) leafAt(r() * 256, r() * 256, i, 1, sh);
    g.restore();
    g.save(); g.beginPath(); g.rect(258, 0, 254, 256); g.clip();
    // cuống / cành nhỏ (dây buộc) treo lá
    g.strokeStyle = ST.stem; g.lineWidth = 2.6;
    for (let i = 0; i < 14; i++) {
      const x = 276 + r() * 216, x1 = x + (r() - 0.5) * 60, y1 = 80 + r() * 150;
      g.beginPath(); g.moveTo(x, 6); g.quadraticCurveTo((x + x1) / 2 + (r() - 0.5) * 30, y1 * 0.5, x1, y1); g.stroke();
    }
    // lưới sợi mắt cáo (khung buộc mảnh vải / lá): lộ ra ở chỗ lá thưa gần mép; đứt dần ra mép như lá -> không lộ cạnh tấm
    g.strokeStyle = ST.stem; g.lineWidth = 1.7;
    const MS = 26;
    for (let a = -256; a < 512; a += MS) for (let b = 0; b < 256; b += MS) for (const s of [1, -1]) {
      const x0 = 258 + a + (s > 0 ? b : 256 - b), y0 = b, x1 = x0 + s * MS, y1 = b + MS;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      if (mx < 258 || mx > 512) continue;
      if (r() < 0.12 || 1.3 - Math.abs(mx - 385) / 127 * 0.72 - my / 256 * 0.78 < 0.55 + r() * 0.25) continue;
      g.beginPath(); g.moveTo(x0 + (r() - 0.5) * 3, y0); g.quadraticCurveTo(mx + (r() - 0.5) * 4, my + 2, x1, y1); g.stroke();
    }
    // dày ở giữa & mép trên (chỗ buộc vào lưới), thưa dần xuống dưới và ra hai bên -> viền lởm chởm
    for (const [n, sh] of [[1100, s0], [1000, s1], [600, s2]]) for (let i = 0; i < n; i++) {
      const x = 258 + r() * 254, y = r() * 256;
      const dx = Math.abs(x - 385) / 127, dy = y / 256;
      if (r() > 1.18 - dx * 0.72 - dy * 0.78) continue;
      leafAt(x, y, i, 1.1, sh);
    }
    g.restore();
    // chùm lá tròn: tâm (640, 128), kín đặc trong bán kính ~0,55, thưa dần tới mép 118 px -> viền là từng lá rời
    g.save(); g.beginPath(); g.rect(514, 0, 254, 256); g.clip();
    for (const [n, sh] of [[700, s0], [650, s1], [460, s2]]) for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()), dd = d * 112;
      if (r() < (d - 0.55) * 2.2) continue;
      leafAt(640 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, i, 1.05, sh);
    }
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    // alphaToCoverage (có MSAA): viền lá mịn thay vì răng cưa lấm tấm như điểm ảnh (như thẻ lá cây, destructibles.js)
    const leaf = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    const twig = new THREE.MeshStandardMaterial({ color: ST.twig, roughness: 0.95, metalness: 0 });
    leaf.userData.surface = twig.userData.surface = 'cloth';
    // dùng chung mọi xe: xác cháy lấy bản riêng trước khi sém (explosion_fx _onVehicleDestroyed)
    leaf.userData.sharedKit = twig.userData.sharedKit = true;
    return (foliageCache[kind] = { leaf, twig });
  }
  // Ô atlas lá (foliageMats): [u đầu, bề rộng u]
  const ATLAS_DENSE = [0, 255 / 768], ATLAS_CARD = [258 / 768, 254 / 768], ATLAS_BALL = [514 / 768, 254 / 768];
  // Khối tán lá "bụi xù": lõi sẫm (cầu đa diện thô, che vỏ xe lộ qua kẽ lá) + các tấm chùm lá tròn xếp quanh mặt cầu,
  // nghiêng lệch mặt cầu để viền bụi là từng lá rời (không còn mặt cắt góc cạnh như khối đa diện đặc).
  // Pháp tuyến hướng ra từ tâm bụi -> cả bụi sáng tối mượt như một tán lá; màu đỉnh tối dần xuống đáy (bóng trong lòng
  // bụi). Đáy bẹt áp lên vỏ xe. Mỗi kiểu có 3 biến thể (hướng tấm lá khác nhau), cùng số đỉnh (ô cháy CamoFire).
  function leafBallGeo(nCards, seed) {
    let s = seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pos = [], nrm = [], uvs = [], col = [];
    const flat = (y) => y * (y < 0 ? 0.55 : 1);
    const push = (x, y, z, nx, ny, nz, u, v, c) => { pos.push(x, flat(y), z); nrm.push(nx, ny, nz); uvs.push(u, v); col.push(c, c, c); };
    // lõi: icosahedron thô thu nhỏ, pháp tuyến cầu, sẫm
    const core = new THREE.IcosahedronGeometry(0.74, 0), cp = core.attributes.position, cu = core.attributes.uv;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), l = Math.hypot(x, y, z) || 1;
      push(x, y, z, x / l, y / l, z / l, ATLAS_DENSE[0] + cu.getX(i) * ATLAS_DENSE[1], cu.getY(i), 0.55 + 0.2 * (y / l + 1) * 0.5);
    }
    core.dispose();
    const d = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    for (let k = 0; k < nCards; k++) {
      // điểm phân bố đều trên chỏm cầu (y từ 1 xuống -0,45: đáy áp vỏ xe không cần lá) + nhiễu
      const y = 1 - (k + 0.5) / nCards * 1.45, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996 + r() * 0.6;
      d.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
      n.set(d.x + (r() - 0.5) * 1.1, d.y + (r() - 0.5) * 1.1, d.z + (r() - 0.5) * 1.1).normalize();   // mặt tấm lá nghiêng lệch
      t.set(0, 1, 0); if (Math.abs(n.y) > 0.9) t.set(1, 0, 0);
      b.crossVectors(n, t).normalize(); t.crossVectors(b, n).normalize();
      const ro = r() * 6.283, cr = Math.cos(ro), sr = Math.sin(ro);
      const hs = 0.6 + r() * 0.22, cen = d.clone().multiplyScalar(0.5 + r() * 0.14);
      const sh = 0.74 + 0.32 * (d.y + 1) * 0.5;   // tấm phía dưới tối hơn
      const corner = (cx, cy) => {
        const ex = cx * cr - cy * sr, ey = cx * sr + cy * cr;
        q.copy(cen).addScaledVector(b, ex * hs).addScaledVector(t, ey * hs);
        const l = q.length() || 1;
        const nx = q.x / l + d.x, ny = q.y / l + d.y, nz = q.z / l + d.z, nl = Math.hypot(nx, ny, nz) || 1;
        push(q.x, q.y, q.z, nx / nl, ny / nl, nz / nl, ATLAS_BALL[0] + (cx + 1) * 0.5 * ATLAS_BALL[1], (cy + 1) * 0.5, sh);
      };
      corner(-1, -1); corner(1, -1); corner(1, 1);
      corner(-1, -1); corner(1, 1); corner(-1, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  const clumpGeos = { hi: null, lo: null };
  let clumpPick = 0;
  function foliageClump() {
    if (!clumpGeos.hi) clumpGeos.hi = [11, 23, 37].map(sd => leafBallGeo(14, sd));
    return clumpGeos.hi[clumpPick++ % 3].clone();
  }

  // ---------------------------------------------------------------------------
  // LƯỚI LÁ NGỤY TRANG: "bụi cây di động"
  // - nhiều lớp bụi lá chồng nhau (lá cắt viền alpha), mép lởm chởm rủ xuống che bánh / xích, cành nhô phá đường viền
  // - lá nhiều sắc độ (ô-liu, xanh rêu, nâu khô) bằng vertex color -> vẫn 1 vật liệu, 1 draw call mỗi nhóm
  // - lá quấn dọc nòng (gắn barrelGroup: xoay tháp, nâng hạ, giật nòng đều theo), chừa bầu hút khói & đầu nòng
  // - lá đung đưa (vertex shader): gió nhẹ, rung mạnh khi xe chạy / bắn / trúng đạn; trúng đạn rơi vài lá
  // - tấm vải màu phe đặt trên lớp lá: vẫn nhận ra phe từ trên cao
  // ---------------------------------------------------------------------------
  // Dải lá trên nòng (hệ tọa độ barrelGroup: trục nòng = -Z): đoạn [z đầu, z cuối] chừa bầu hút khói & 1/3 đầu nòng
  // [z đầu, z cuối, bán kính nòng đoạn đó] (đo từ mô hình). Quấn kín cả bầu hút khói, chỉ chừa miệng nòng / hãm lùi
  // (lửa đầu nòng thổi bay lá); Arbalest chừa chỗ nòng gác lên giá khóa.
  const BARREL_LEAF = {
    ALL_ROUNDER: { segs: [[-6.2, -20.4, 1.42], [-20.4, -27.8, 1.8], [-27.8, -54.6, 1.42]] },
    ARTILLERY: { segs: [[-4.6, -29.6, 1.5], [-38.4, -64.8, 1.5]] }
  };
  function foliageClumpLo() {   // bụi lá ít tấm cho lớp phụ & nòng
    if (!clumpGeos.lo) clumpGeos.lo = [5, 17, 29].map(sd => leafBallGeo(9, sd));
    return clumpGeos.lo[clumpPick++ % 3].clone();
  }
  // Tấm lá rủ: mặt phẳng lấy ô giữa atlas (chùm lá dày ở trên, thưa dần ra mép -> viền lởm chởm)
  // (cell = ATLAS_BALL: tấm chùm lá tròn, viền thưa đều mọi phía)
  // w > 0: tấm lưới rủ rộng w (đv) — chia lưới, gấp nếp như vải treo: nếp sâu dần xuống mép dưới, mép trên túm lại
  // (chỗ buộc), mép dưới loe & gợn -> không còn là tấm phẳng như vách rào. Nếp tính theo đv thật (trục z không bị co giãn)
  function leafCardGeo(cell = ATLAS_CARD, w = 0, rnd = Math.random) {
    const nx = w ? Math.max(3, Math.min(6, Math.round(w * 1.2))) : 1;
    const g = new THREE.PlaneGeometry(1, 1, nx, w ? 3 : 1);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setX(i, cell[0] + uv.getX(i) * cell[1]);
    if (w) {
      const k = Math.max(1, w / 1.8) + rnd() * 0.6, ph = rnd() * 6.283, ph2 = rnd() * 6.283, A = Math.min(0.55, 0.09 * w);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), t = x + 0.5, d = 0.5 - y;   // d: 0 mép trên -> 1 mép dưới
        const z = A * (0.3 + 0.7 * d) * Math.sin(t * k * 6.283 + ph) + A * 0.35 * d * Math.sin(t * k * 13.2 + ph2);
        p.setXYZ(i, x * (0.9 + 0.16 * d), y - d * d * 0.08 * (1 + Math.sin(t * 9.4 + ph2)), z);
      }
      g.computeVertexNormals();
    }
    return g;
  }
  // Nhuộm màu lá (nhân với màu đỉnh sẵn có — độ tối trong lòng bụi lá)
  function tinted(geo, c) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, old = g.attributes.color, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) a[i * 3 + j] = c[j] * (old ? old.array[i * 3 + j] : 1);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  // Vật liệu lá riêng từng xe (độ rung riêng), dùng chung chương trình shader
  function swayLeafMat(kind) {
    const base = foliageMats(kind).leaf;
    const m = base.clone();
    m.vertexColors = true;
    const U = { uTime: { value: Math.random() * 20 }, uAmp: { value: 0.12 }, uShake: { value: 0 }, uFT: { value: 0 } };
    m.userData.sway = U;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.uniforms.uAmp = U.uAmp;
      sh.uniforms.uShake = U.uShake;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uShake;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float vkPh = position.x * 0.37 + position.z * 0.29 + position.y * 0.53;
          float vkW = 0.55 + 0.45 * sin(position.y * 1.7 + position.x * 0.9);
          transformed.x += sin(uTime * 2.1 + vkPh) * uAmp * vkW;
          transformed.z += cos(uTime * 1.7 + vkPh * 1.3) * uAmp * vkW;
          transformed.y += sin(uTime * 2.9 + vkPh * 0.7) * uAmp * 0.3 * vkW;
          // sóng nổ đầu nòng / trúng đạn: cả lớp lá giật rung nhanh rồi tắt dần (uShake 1 -> 0)
          transformed.x += sin(uTime * 37.0 + vkPh * 3.1) * uShake * 0.55 * vkW;
          transformed.y += sin(uTime * 43.0 + vkPh * 2.3) * uShake * 0.35 * vkW;
          transformed.z += cos(uTime * 41.0 + vkPh * 2.7) * uShake * 0.55 * vkW;`);
      // bụi xù (lõi + chùm lá tròn: ô trái / phải atlas): nhìn mặt sau tấm lá vẫn giữ pháp tuyến hướng ra ngoài bụi
      // (không lật như mặt phẳng 2 mặt) -> cả bụi sáng mượt, không lốm đốm tấm tối; tấm lá rủ (ô giữa) vẫn lật như cũ
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          if (vUv.x < ${ATLAS_CARD[0].toFixed(4)} || vUv.x > ${(ATLAS_CARD[0] + ATLAS_CARD[1]).toFixed(4)}) { normal *= faceDirection; geometryNormal = normal; }`);
      // lá bắt lửa: héo, cháy xém, quăn, tàn thành tro (src/gameplay/camo_fire.js)
      if (window.CamoFire) CamoFire.patchShader(sh, U);
    };
    m.customProgramCacheKey = () => (window.CamoFire ? 'vkLeafSway3' : 'vkLeafSway2');
    return m;
  }
  const PANEL_MAT = {};
  function factionPanelMat(team) {
    const k = team === 'RED' ? 'RED' : 'BLUE';
    return PANEL_MAT[k] || (PANEL_MAT[k] = new THREE.MeshStandardMaterial({
      color: k === 'BLUE' ? 0x2f62a6 : 0xb4422b, emissive: k === 'BLUE' ? 0x0b2a5c : 0x5c140b, emissiveIntensity: 0.22, roughness: 0.95, metalness: 0, side: THREE.DoubleSide
    }));
  }

  function buildFoliage(u, F, T, len, cage) {
    const kind = foliageKind(u), ST = CAMO_STYLE[kind], Lm = foliageMats(kind), leaf = swayLeafMat(kind), tw = Lm.twig, tints = ST.tints;
    const rnd = (window.VehicleKit && VehicleKit.mulberry32) ? VehicleKit.mulberry32(977 + u.tankType.length * 31 + (u.team === 'RED' ? 7 : 0)) : Math.random;
    const R = (a, b) => a + rnd() * (b - a);
    const tint = () => { const r = rnd(); return tints[r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.88 ? 2 : 3]; };
    // Ô cháy (CamoFire): mỗi bụi lá / tấm lá rủ là một ô; ghi thứ tự & số đỉnh từng mảnh lá trong mesh gộp của batch
    const cfCells = [], cfRec = new Map();
    let cfCur = -1;
    const cfCell = (b, x, y, z, r) => { cfCells.push({ b, x, y, z, r }); return cfCells.length - 1; };
    const cfAdd = (b, g, x, y, z, r) => {
      const c = cfCur >= 0 ? cfCur : cfCell(b, x, y, z, r);
      let L = cfRec.get(b);
      if (!L) cfRec.set(b, (L = []));
      L.push(c, g.attributes.position.count);
      return g;
    };
    const BULK = 1.12;   // bụi lá phồng to hơn khung đặt -> lớp lá dày, chồng kín nhau
    const clump = (b, x, y, z, sx, sy, sz, lo) => b.add(cfAdd(b, tinted(lo ? foliageClumpLo() : foliageClump(), tint()), x, y, z, Math.max(sx, sz) * BULK), leaf, [x, y, z], [R(-0.3, 0.3), R(0, 6.28), R(-0.3, 0.3)], [sx * BULK, sy * BULK, sz * BULK]);
    const card = (b, pos, rot, sc, cell) => b.add(cfAdd(b, tinted(leafCardGeo(cell, cell ? 0 : sc[0], rnd), tint()), pos[0], pos[1], pos[2], Math.max(sc[0], sc[1]) * 0.5), leaf, pos, rot, sc);
    const twig = (b, x, y, z, h) => b.strut([x, y, z], [x + R(-1.6, 1.6), y + h, z + R(-1.6, 1.6)], 0.12, tw, 4, 0.04);
    // ngọn lá / nhánh cỏ cắm ngược lên (2 tấm lá chéo nhau, lật ngược: dày ở gốc, lởm chởm ở ngọn) -> phá đường viền xe
    const sprig = (b, x, y, z, h) => {
      const a = R(0, 3.14), w = h * R(0.7, 1.0), lean = R(-0.25, 0.25);
      for (const d of [0, Math.PI / 2]) card(b, [x, y + h * 0.42, z], [lean, a + d, Math.PI + R(-0.2, 0.2)], [w, h, 1]);
    };
    // rèm lá rủ dài (2 lớp so le, lớp ngoài lệch ra) — phủ sườn, bánh, xích
    const curtain = (b, x, z, ry, yTop, yBot, out, w) => {
      const h = yTop - yBot;
      card(b, [x, yTop - h * 0.5, z], [R(-0.06, 0.06), ry + R(-0.14, 0.14), R(-0.1, 0.1)], [w * R(0.95, 1.2), h * R(1.0, 1.1), 1]);
      if (rnd() < 0.8) card(b, [x + out[0], yTop - h * 0.42 - R(0, 0.8), z + out[1] + R(-0.8, 0.8)], [R(-0.08, 0.08), ry + R(-0.18, 0.18), R(-0.12, 0.12)], [w * R(0.8, 1.05), h * R(0.75, 0.95), 1]);
    };
    const bushSide = (b, s, x, y, z) => {
      cfCur = cfCell(b, s * x, y, z, 2.4);
      try {
        clump(b, s * x, y, z, R(1.4, 2.0), R(1.8, 2.6), R(2.2, 3.2), true);
        if (rnd() < 0.6) clump(b, s * (x + 0.5), y + R(-1.2, 0.6), z + R(-1.2, 1.2), R(1.0, 1.4), R(1.2, 1.8), R(1.4, 2.0), true);
      } finally { cfCur = -1; }
    };
    const bush = (b, x, y, z, sx, sy, sz) => {
      cfCur = cfCell(b, x, y + sy * 0.3, z, Math.max(sx, sz));
      try { bushParts(b, x, y, z, sx, sy * ST.flat, sz); } finally { cfCur = -1; }   // sa mạc / đô thị: ụ bẹt như mô đất đá
    };
    const bushParts = (b, x, y, z, sx, sy, sz) => {
      clump(b, x, y, z, sx, sy, sz);
      // lớp lá thứ 2, 3 nhỏ hơn chồng lệch lên trên / sang bên -> dày, nhiều lớp, mặt bụi gồ ghề
      if (rnd() < 0.85) clump(b, x + R(-0.5, 0.5) * sx, y + sy * R(0.35, 0.6), z + R(-0.5, 0.5) * sz, sx * R(0.5, 0.7), sy * R(0.55, 0.75), sz * R(0.5, 0.7), true);
      if (rnd() < 0.5) clump(b, x + R(-0.7, 0.7) * sx, y + sy * R(0.1, 0.3), z + R(-0.7, 0.7) * sz, sx * R(0.45, 0.6), sy * R(0.5, 0.7), sz * R(0.45, 0.6), true);
      // chùm lá tròn nằm nghiêng phủ ngọn bụi (tấm lá rủ hình nêm ở đây thành gai nhọn chĩa lên)
      card(b, [x + R(-0.4, 0.4) * sx, y + sy * 0.55, z + R(-0.4, 0.4) * sz], [-Math.PI / 2 + R(-0.45, 0.45), R(0, 6.28), R(-0.45, 0.45), 'YXZ'], [sx * 1.6, sz * 1.6, 1], ATLAS_BALL);
      if (rnd() < ST.sprig) sprig(b, x + R(-0.3, 0.3) * sx, y + sy * 0.4, z + R(-0.3, 0.3) * sz, sy * R(0.9, 1.4));
      if (rnd() < ST.twigP) twig(b, x, y, z, sy * R(1.0, 1.7));
    };
    // Mỗi nhóm lá một nhãn bộ phận riêng: khi bị hất văng, mỗi phần giữ đúng hệ tọa độ của nhóm cha
    // (trước đây chung 1 nhãn -> lá trên nòng bị đặt theo hệ thân xe, rơi thành khối nằm ngang dưới đất)
    // Giáp lồng (cage: hộp bao từng mặt lồng, buildVisuals): lá phủ RA NGOÀI lồng — rèm lá rủ ngoài mặt lồng sườn / đuôi,
    // bụi lá trùm qua thanh mép trên lồng, bụi trên nóc / sàn sau đặt lên mái lồng (như kíp xe giắt cành lên lồng thật)
    const CH = cage ? cage.h : {}, CT = cage ? cage.t : {};
    const hL = CH.cageKitL, hR = CH.cageKitR, hB = CH.cageKitB, hD = CH.cageKitD, arc = cage && cage.arc;
    const cHX = hL && hR ? Math.max(-hL.min.x, hR.max.x) : 0, cHTop = hL && hR ? Math.max(hL.max.y, hR.max.y) : 0;
    const hwO = cHX ? Math.max(F.hw, cHX - 0.4) : F.hw;   // mặt ngoài để treo rèm lá sườn
    const deckY = (x, z) => {   // nóc sàn sau / mái lồng sàn sau tại (x, z)
      let y = F.netY;
      if (hD && x >= hD.min.x - 0.5 && x <= hD.max.x + 0.5 && z >= hD.min.z - 1 && z <= hD.max.z + 1) y = Math.max(y, hD.max.y);
      if (arc && Math.abs(x) <= arc.x + 0.5 && Math.abs(x) >= arc.inner(z) - 1 && z >= arc.z0 - 1 && z <= arc.z1 + 1) y = Math.max(y, arc.y);
      return y;
    };
    const fh = batch(u), ft = batch(u), fb = batch(u), fp = batch(u);
    let fl = null, fm = null;   // xe trinh sát: lá trên nắp lỗ nóc (u.hatchLid) / trên tấm chắn súng (u._hmg.mount)
    fh.setTag('camoKit'); ft.setTag('camoKitT'); fb.setTag('camoKitB'); fp.setTag('camoKitP');

    // ---- THÂN XE ----
    const top = F.y1 + 0.6, z0 = F.zF + len * 0.1, z1 = F.zR - 1.2;
    const ringZ = u.turretGroup ? u.turretGroup.position.z : 1.6;
    const ringClear = (x, z) => u.tankType === 'SCOUT' && Math.hypot(x, z - ringZ) < 4.6;   // chừa vòng xoay súng Marten
    const drape = (b, x, y, z, ry, w, h) => card(b, [x, y, z], [R(-0.12, 0.12), ry + R(-0.3, 0.3), R(-0.15, 0.15)], [w, h, 1]);
    // xe bánh lốp: rèm lá rủ từ dưới mép cửa / sàn xuống sát đất, trùm kín các bánh; bánh lái phía trước đánh lái
    // quét rộng ra ngoài -> rèm chỗ đó lệch ra xa hơn
    const wheelCurtain = (xs, yTop, za, zb) => {
      const W = u.wheelSet, wr = W ? W.radius : 4;
      const steerZ = W ? W.positions.filter(p => p.steer).map(p => p.z) : [];
      for (const s of [-1, 1]) for (let z = za; z <= zb; z += R(2.3, 2.9)) {
        const nearSteer = steerZ.some(sz => Math.abs(z - sz) < wr + 1.5);
        curtain(fh, s * (xs + (nearSteer ? wr * 0.3 : 0)), z, Math.PI / 2, yTop + R(-0.4, 0.4), 0.9 + (rnd() < 0.35 ? R(0.8, 2.0) : R(0, 0.5)), [s * 0.5, 0], R(4.4, 5.6));
      }
      for (const s of [-1, 1]) for (const zz of [za - 0.6, zb + 0.6]) curtain(fh, s * (xs - 2.4), zz, s * (zz < 0 ? -0.6 : 0.6), yTop - 1, 1.4, [0, zz < 0 ? -0.5 : 0.5], R(3.6, 4.4));
      // mép trên rèm: lưới cuộn buộc dọc gờ sàn (kíp xe cuộn phần lưới thừa để chừa cửa & kính) — che mép thẳng tắp của rèm
      for (const s of [-1, 1]) for (let z = za - 0.6; z <= zb + 0.6; z += R(1.5, 1.9)) {
        const x = s * (xs + R(0.1, 0.5)), y = yTop + R(-0.1, 0.4);
        cfCur = cfCell(fh, x, y, z, 1.4);
        try { clump(fh, x, y, z, R(1.1, 1.4), R(0.8, 1.1), R(1.1, 1.4), true); } finally { cfCur = -1; }
      }
    };
    if (u.tankType === 'SCOUT') {
      // Marten: phủ nóc + phần sau thân; CHỪA kính chắn gió, ô kính cửa, đèn pha, gương (lái xe & trưởng xe vẫn nhìn được)
      const RY = 15.4;
      for (let z = -5.4; z <= 17.2; z += R(2.6, 3.2)) {
        for (const s of [-1, 1]) {
          const x = s * R(5.6, 6.6);
          if (!ringClear(x, z) && !(z < -3.2 && Math.abs(x) > 5.4)) bush(fh, x, RY + 0.3, z, R(3.0, 3.8), R(1.6, 2.3), R(3.0, 3.8));
          if (!ringClear(s * 2.2, z)) bush(fh, s * R(1.6, 2.8), RY + 0.4, z, R(2.8, 3.6), R(1.4, 2.1), R(2.8, 3.6));
          // viền lá ngắn rủ mép nóc: chỉ tới trên mép ô kính cửa (y ~14.6)
          drape(fh, s * 7.9, RY - 0.2, z, Math.PI / 2, R(3.2, 4.2), R(1.2, 1.6));
        }
      }
      // mép nóc trước: diềm lá rất ngắn trên mép kính chắn gió (không rủ xuống kính)
      for (let x = -6; x <= 6.01; x += 3) drape(fh, x, RY + 0.2, -6.6, 0, R(3, 3.8), R(0.9, 1.2));
      // khoang sau cửa sau (không có kính): lá rủ phủ kín sườn tới vè sau
      for (const s of [-1, 1]) for (let z = 8.6; z <= 17.4; z += R(2.4, 3.0)) {
        drape(fh, s * 8.4, 12.4, z, Math.PI / 2, R(3.6, 4.6), R(3.4, 4.2));
        drape(fh, s * 8.6, 9.0, z + 1, Math.PI / 2, R(3.2, 4.2), R(2.6, 3.4));
      }
      // 4 cửa hông (recon_marten.js: cửa z -6.6..0.4 / 0.8..7.8, y 9.85..14.55, ô kính y 12.65..14.55): lưới phủ kín tấm
      // cửa, khoét chừa ô kính nhỏ (kíp xe vẫn nhìn ra) — dải dưới kính từ gờ sàn tới mép dưới ô kính + dải đứng giữa các
      // ô kính nối lên diềm lá mép nóc. Áp sát mặt sườn cabin (nghiêng vào trong khi lên cao)
      const wallX = (y) => 8.0 - (y - 9.7) * 0.105 + 0.45;
      const doorCard = (s, y, z, w, h) => card(fh, [s * wallX(y), y, z], [R(-0.05, 0.05), Math.PI / 2 + R(-0.07, 0.07), R(-0.06, 0.06)], [w, h, 1]);
      for (const s of [-1, 1]) {
        for (let z = -6.0; z <= 7.4; z += R(2.2, 2.6)) doorCard(s, 11.05 + R(-0.3, 0.1), z, R(2.8, 3.4), R(2.8, 3.1));
        for (const [z, w] of [[-5.25, 2.7], [0.6, 3.2], [6.45, 2.7]]) doorCard(s, 13.7, z + R(-0.1, 0.1), w, R(2.7, 3.0));
      }
      // đuôi xe: lá rủ kín cửa sau (cửa sau không có kính)
      for (let x = -6.6; x <= 6.61; x += R(2.8, 3.4)) { drape(fh, x, 13.4, 18.6, 0, R(3.4, 4.2), R(3.2, 4)); drape(fh, x + 1, 9.6, 18.8, 0, R(3, 3.8), R(2.6, 3.2)); }
      wheelCurtain(9.3, 9.4, -16.4, 16.6);
      // khoang máy phía trước: bụi lá thấp trên nắp máy (đỉnh lá < mép dưới kính chắn gió y ~13.2, không có ngọn / cành
      // nhô lên che tầm nhìn lái xe), phủ vè trước; chừa đèn pha (x ±6.6, z -17.2) và gương chiếu hậu
      const hoodY = (z) => 10.6 + (z + 17.6) * 0.105;   // nắp máy dốc lên về phía kính
      const lowBush = (x, y, z, sx, sy, sz) => {
        cfCur = cfCell(fh, x, y + sy * 0.3, z, Math.max(sx, sz));
        try {
          clump(fh, x, y, z, sx, sy, sz);
          if (rnd() < 0.7) clump(fh, x + R(-0.5, 0.5) * sx, y + sy * 0.25, z + R(-0.4, 0.4) * sz, sx * R(0.5, 0.7), sy * 0.6, sz * R(0.5, 0.7), true);
        } finally { cfCur = -1; }
      };
      for (let z = -17.0; z <= -10.2; z += R(1.9, 2.4)) {
        for (let x = -4.4; x <= 4.41; x += R(2.6, 3.1)) lowBush(x + R(-0.4, 0.4), hoodY(z) - 0.1, z, R(2.2, 2.8), R(0.9, 1.3), R(2.0, 2.6));
        if (z > -15.2) for (const s of [-1, 1]) lowBush(s * R(7.2, 7.8), 10.2, z, R(2.0, 2.6), R(1.0, 1.4), R(2.0, 2.6));
      }
      // lá rủ trùm lưới tản nhiệt & cản trước (giữa 2 đèn pha)
      for (let x = -3.8; x <= 3.81; x += R(1.8, 2.2)) curtain(fh, x, -19.1, 0, 11.0, 4.6 + R(0, 0.8), [R(-0.4, 0.4), -0.45], R(2.6, 3.1));
      for (let x = -4.4; x <= 4.41; x += R(2.4, 2.9)) curtain(fh, x, -19.8, 0, 6.6, 1.6 + R(0, 0.8), [R(-0.4, 0.4), -0.4], R(3.0, 3.6));
      // trước 2 bánh lái (dưới đèn pha): rèm lá tới sát đất
      for (const s of [-1, 1]) curtain(fh, s * 6.9, -19.5, 0, 9.4, 1.0 + R(0, 0.5), [s * 0.3, -0.4], R(3.4, 4.0));
      for (const s of [-1, 1]) curtain(fh, s * 5.0, -19.3, 0, 9.8, 3.4 + R(0, 0.8), [s * 0.3, -0.4], R(2.0, 2.4));
    } else if (u.tankType === 'ARTILLERY') {
      // Arbalest: nóc + diềm cabin (chừa kính chắn gió, kính cửa, đèn và hành lang nòng gác trên giá khóa),
      // lưới tản nhiệt mặt trước, nóc khoang máy (tránh ống xả nóng), sàn trước tháp, sườn sàn rủ trùm bánh
      const CR = 22.5;
      for (let z = -33.0; z <= -19.6; z += R(2.6, 3.2)) {
        for (const s of [-1, 1]) {
          bush(fh, s * R(7.4, 8.8), CR + 0.3, z, R(3.0, 3.8), R(1.6, 2.3), R(3.0, 3.8));
          if (Math.abs(z + 21.6) > 2.2) bush(fh, s * R(4.4, 5.6), CR + 0.3, z, R(2.6, 3.2), R(1.4, 2.0), R(2.6, 3.2));
          drape(fh, s * 11.0, CR - 0.4, z, Math.PI / 2, R(3.4, 4.2), R(1.2, 1.6));          // diềm sườn trên mép kính cửa
          drape(fh, s * 11.0, 11.4, z + R(-0.5, 0.5), Math.PI / 2, R(3.2, 4.0), R(2.0, 2.6));   // ốp lá dưới cửa, trên hốc bánh
        }
      }
      for (let x = -9.6; x <= 9.61; x += 2.4) drape(fh, x, CR, -34.4, 0, R(2.8, 3.4), R(1.0, 1.4));      // diềm trên kính chắn gió
      for (let x = -6.4; x <= 6.41; x += R(2.6, 3.2)) drape(fh, x, 13.2, -38.2, 0, R(3.2, 4.0), R(2.8, 3.4));   // lưới tản nhiệt
      for (const s of [-1, 1]) drape(fh, s * 9.8, 13.6, -38.0, 0, R(2.4, 3.0), R(2.4, 3.0));
      for (let z = -18.0; z <= -11.6; z += R(2.6, 3.0)) for (const x of [-6.5, -2.2, 2.2, 6.0]) {
        if (Math.hypot(x - 9.6, z + 12) < 3.2) continue;
        bush(fh, x + R(-0.6, 0.6), 17.4, z, R(2.8, 3.4), R(1.4, 2.0), R(2.8, 3.4));
      }
      for (const s of [-1, 1]) for (let z = -18.0; z <= -11.8; z += 3.2) drape(fh, s * 9.9, 15.0, z, Math.PI / 2, R(3.2, 3.8), R(3.2, 4.0));
      // sàn trước tháp (ngoài vòng quay của tháp) + sườn sàn: lá rủ trùm nửa trên bánh
      for (let z = -10.2; z <= -2.4; z += R(2.6, 3.2)) for (const s of [-1, 1]) bush(fh, s * R(7.6, 9.2), 13.0, z, R(3.0, 3.6), R(1.5, 2.2), R(3.0, 3.6));
      for (const s of [-1, 1]) for (let z = -10.2; z <= 36.6; z += R(2.6, 3.4)) drape(fh, s * 10.9, 10.4, z, Math.PI / 2, R(3.6, 4.6), R(3.2, 4.2));
      wheelCurtain(11.6, 11.2, -32.6, 30.4);
    } else {
    // Giáp mũi xe xích: lá phủ dọc mép trên & sườn giáp mũi, chừa giữa (kính tiềm vọng lái xe)
    const gl = u.tankType === 'ALL_ROUNDER' ? (z) => Math.min(12.8, 9.4 + (z + 31) * 0.34) : (z) => Math.min(14.2, 12.2 + (z + 31.6) * 0.117);   // xe 6 nòng: khối mũi đúc cao (fsv_hailstorm.js NOSE_Y)
    for (let z = F.zF + 1.5; z < z0 + 1; z += R(2.0, 2.5)) {
      for (let x = -F.hw + 2.6; x <= F.hw - 2.6; x += R(2.7, 3.3)) {
        if (Math.abs(x) < 3.4) continue;
        bush(fh, x, gl(z) + 0.2, z, R(3.0, 3.8), R(1.5, 2.2), R(3.0, 3.6));
      }
    }
    for (let x = -F.hw + 1.5; x <= F.hw - 1.4; x += R(2.6, 3.2)) if (Math.abs(x) > 3.2) drape(fh, x, gl(F.zF) - 0.6, F.zF - 0.6, 0, R(3.4, 4.4), R(2.6, 3.4));
    // dải xích (đo từ đường chạy xích): đầu / cuối xích, mép ngoài xích
    let tF = F.zF + 2, tR = F.zR - 1;
    const TS = u.trackSystem, tx = TS && TS.sidesX ? Math.abs(TS.sidesX[1]) : F.hw - 3.6;
    if (TS && TS.path && TS.path.segs) {
      let lo = Infinity, hi = -Infinity;
      for (const sg of TS.path.segs) {
        if (sg.C) { lo = Math.min(lo, sg.C.u - sg.C.r); hi = Math.max(hi, sg.C.u + sg.C.r); }
        for (const q of [sg.p0, sg.p1]) if (q) { lo = Math.min(lo, q.u); hi = Math.max(hi, q.u); }
      }
      if (isFinite(lo)) { tF = lo; tR = hi; }
    }
    const yBot = 0.9;   // mép dưới rèm lá: sát mặt đất nhưng không quệt đất
    for (const s of [-1, 1]) {
      for (let z = z0; z <= z1; z += R(2.0, 2.5)) bush(fh, s * (F.hw - R(0.4, 1.8)), top - R(0, 0.8), z, R(3.8, 4.8), R(2.3, 3.3), R(3.6, 4.6));
      // có lồng: hàng bụi trùm qua thanh mép trên lồng sườn, xù ra ngoài
      if (cHX) for (let z = Math.max(z0, hL.min.z + 1); z <= Math.min(z1 + 2, hL.max.z - 1); z += R(2.0, 2.6)) bush(fh, s * (cHX - R(0.2, 1.4)), Math.max(top, cHTop + 0.4) - R(0, 0.6), z, R(3.4, 4.4), R(2.2, 3.0), R(3.4, 4.4));
      for (let z = z0 + 1.5; z <= z1; z += R(2.6, 3.2)) { const x = s * (F.hw - R(4, 5.5)); if (!ringClear(x, z)) bush(fh, x, top - R(0.2, 0.6), z, R(3.2, 4.2), R(1.6, 2.4), R(3.2, 4.2)); }
      // mép lá lởm chởm rủ xuống sườn: tầng trên phủ sườn thân, rèm dài phủ kín váy xích, bánh chịu lực & xích tới sát đất
      for (let z = z0; z <= z1; z += R(2.2, 2.9)) card(fh, [s * (hwO + 0.9), Math.max(top, cHTop) - 2.0, z], [0, Math.PI / 2 + R(-0.3, 0.3), R(-0.15, 0.15)], [R(4.5, 6.5), R(3.2, 4.6), 1]);
      for (let z = Math.min(z0, tF + 2); z <= (cHX ? Math.max(tR - 1.5, hL.max.z - 1) : tR - 1.5); z += R(2.3, 2.9)) curtain(fh, s * (hwO + R(0.8, 1.5)), z, Math.PI / 2, cHX ? cHTop - R(0.4, 1.4) : F.y0 + R(1.2, 2.2), yBot + (rnd() < 0.35 ? R(0.8, 2.2) : R(0, 0.5)), [s * 0.55, 0], R(4.6, 5.8));
      // chùm lá phồng ra ngoài rèm (mặt rèm gồ ghề, không phẳng như tường rào)
      for (let z = tF + 2; z <= tR - 2; z += R(2.4, 3.4)) bushSide(fh, s, hwO + R(1.4, 2.0), F.y0 + R(-1.6, 1.4), z);
      if (cHX) for (let z = tF + 3; z <= tR - 3; z += R(3.0, 4.0)) bushSide(fh, s, hwO + R(1.2, 1.8), (F.y0 + cHTop) * 0.5 + R(0, 2), z);   // tầng giữa lồng
      // đầu & đuôi dải xích: lá rủ trùm bánh sao chủ động / bánh dẫn hướng
      for (const [zz, dz] of [[tF - 0.9, -0.5], [tR + 0.9, 0.5]]) {
        curtain(fh, s * tx, zz, 0, F.y0 + R(1.4, 2.4), yBot + R(0.3, 0.9), [0, dz], R(5.4, 6.6));
        card(fh, [s * (tx + 2.0), F.y0 - 0.6, zz - dz * 2], [0, s * (dz < 0 ? -0.7 : 0.7) + R(-0.2, 0.2), R(-0.1, 0.1)], [R(3.6, 4.4), R(5.0, 6.0), 1]);
      }
      // đầu trước lồng sườn: rèm chéo ở góc (nối rèm sườn với lá giáp mũi)
      if (cHX) curtain(fh, s * (cHX - 1.2), hL.min.z - 0.4, -s * 0.75, cHTop - R(0.3, 1.0), yBot + R(0, 0.5), [s * 0.4, -0.4], R(4.0, 4.8));
    }
    // đuôi xe: lá rủ (2 tầng). Có lồng đuôi (giáp lồng mua thêm / lồng đuôi sẵn có của xe 6 nòng, fsv_hailstorm.js
    // slatZ 33, cao 5.8..13.8): rèm lá treo từ thanh trên lồng rủ kín xuống sát đất + bụi trùm thanh mép trên lồng
    const RC = hB ? { z: hB.max.z, y: hB.max.y } : u.tankType === 'GATLING' ? { z: 33.2, y: 13.8 } : null;
    const rZ = RC ? Math.max(F.zR, RC.z - 0.4) : F.zR;
    const rX = RC ? Math.max(F.hw * 0.86, cHX || (u.tankType === 'GATLING' ? 16.4 : 0)) - 1 : F.hw * 0.86;   // lồng đuôi: phủ tới mép lồng
    if (RC) for (const s of [-1, 1]) curtain(fh, s * (rX + 1.2), rZ + 0.6, s * 0.75, RC.y - R(0.3, 1.0), yBot + R(0, 0.5), [s * 0.4, 0.4], R(4.4, 5.2));   // góc đuôi: rèm chéo nối rèm sườn
    for (let x = -rX; x <= rX + 0.01; x += R(2.8, 3.6)) {
      card(fh, [x, top - 2.2, rZ + 0.8], [R(-0.2, 0.2), R(-0.3, 0.3), R(-0.2, 0.2)], [R(4, 5.5), R(3, 4.4), 1]);
      if (RC) {
        curtain(fh, x + R(-0.4, 0.4), rZ + R(1.0, 1.5), 0, RC.y - R(0.3, 1.2), yBot + (rnd() < 0.35 ? R(0.8, 2.2) : R(0, 0.5)), [R(-0.4, 0.4), 0.55], R(4.4, 5.4));
        bush(fh, x + R(-0.5, 0.5), Math.max(top, RC.y + 0.4) - R(0, 0.5), RC.z - R(0.4, 1.4), R(3.2, 4.0), R(2.0, 2.8), R(3.0, 3.8));
      } else if (Math.abs(x) < tx - 3) card(fh, [x + R(-0.6, 0.6), F.y0 + 0.2, rZ + 1.1], [R(-0.1, 0.1), R(-0.25, 0.25), R(-0.15, 0.15)], [R(3.8, 4.8), R(3.6, 4.6), 1]);
    }
    // sàn sau (sau tháp) / nóc xe không tháp
    const rz0 = T ? Math.min(F.zR - 4, T.zR + 3) : F.zF + len * 0.35;
    for (let z = rz0; z <= z1; z += R(2.5, 3.1)) {
      for (let x = -F.hw * 0.62; x <= F.hw * 0.63; x += R(2.9, 3.6)) { const xx = x + R(-1, 1); if (!ringClear(xx, z)) bush(fh, xx, deckY(xx, z) + 0.4, z, R(3.6, 4.6), R(1.8, 2.8), R(3.6, 4.6)); }
    }
    }
    let panelHost = null, panelPos = null;
    // ---- THÁP ----
    if (T && u.turretGroup) {
      const ty = (REAL_ROOF[u.tankType] || T.roof) + 0.4, tl = T.zR - T.zF, tzc = (T.zF + T.zR) / 2;
      // lồng tháp: sườn / đuôi / mái -> vòng lá nới ra ngoài mặt lồng, bụi nóc đặt lên mái lồng
      const tL = CT.cageKitTL, tR = CT.cageKitTR, tB = CT.cageKitTB, tM = CT.cageKitT;
      const cTX = tL && tR ? Math.max(-tL.min.x, tR.max.x) : 0;
      // điểm trên vòng lá ở góc a: không lồng -> elip ôm tháp (rộng T.hw + k, dài tl * f); có lồng -> chữ nhật bo góc
      // (siêu elip) ôm hộp lồng: rộng cTX + k, đuôi tới mặt lồng đuôi (elip thu hẹp ở đuôi sẽ lọt vào trong lồng)
      const sp = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.4);
      const ring = (a, k, f) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        if (!cTX) return [sa * (T.hw + k), tzc - ca * tl * f];
        const L = ca < 0 && tB ? tB.max.z - tzc + 0.6 + k * 0.5 : tl * f;
        return [sp(sa) * (cTX + k), tzc - sp(ca) * L];
      };
      // n điểm trên vòng lá [x, z, góc hướng ra ngoài]: không lồng -> chia đều góc như cũ; có lồng -> chia đều theo chiều
      // dài vòng (chia theo góc thì siêu elip dồn điểm vào 4 góc, 2 sườn dài bị thưa)
      const ringPts = (n, k, f, off) => {
        const out = [];
        if (!cTX) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; out.push([...ring(a, k, f), a]); } return out; }
        const M = 360, P = [], acc = [0];
        for (let j = 0; j <= M; j++) P.push(ring((j / M) * Math.PI * 2, k, f));
        for (let j = 1; j <= M; j++) acc.push(acc[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]));
        for (let i = 0, j = 1; i < n; i++) {
          const d = ((i / n + off / (Math.PI * 2)) % 1) * acc[M];
          while (j < M && acc[j] < d) j++;
          if (acc[j] < d) j = 1;
          const q = P[j], pr = P[j - 1], tx = q[0] - pr[0], tz = q[1] - pr[1];
          let nx = -tz, nz = tx;   // pháp tuyến hướng ra ngoài vòng
          if (nx * q[0] + nz * (q[1] - tzc) < 0) { nx = -nx; nz = -nz; }
          out.push([q[0], q[1], Math.atan2(nx, -nz)]);
        }
        return out;
      };
      const roofY = (x, z) => (tM && Math.abs(x) <= Math.max(-tM.min.x, tM.max.x) + 0.6 && z >= tM.min.z - 0.6 && z <= tM.max.z + 0.6 ? Math.max(ty, tM.max.y + 0.4) : ty);
      for (const [x, z, a] of ringPts(cTX ? 36 : 26, 0.4, 0.5, 0.3)) {   // lá rủ quanh sườn tháp: tầng trên + tầng dưới phủ kín vách tháp
        if (z < T.zF + tl * 0.3 && Math.abs(x) < T.hw * 0.5) continue;
        card(ft, [x, roofY(x * 0.9, z) - 2.4, z], [0, a + R(-0.25, 0.25), R(-0.15, 0.15)], [R(4.2, 6), R(3, 4.4), 1]);
        if (rnd() < 0.85) card(ft, [x * 1.04, ty - 5.2, z + R(-0.6, 0.6)], [0, a + R(-0.3, 0.3), R(-0.15, 0.15)], [R(4.0, 5.4), R(3.6, 4.6), 1]);
      }
      // viền nóc tháp (trừ giữa phía trước: nòng + kính ngắm)
      for (const [x, z] of cTX ? ringPts(44, -0.8, 0.46, 0) : ringPts(40, 0, 0.46, 0).map(([x, z, a]) => [Math.sin(a) * T.hw * 0.92, z])) {
        if (z < T.zF + tl * 0.3 && Math.abs(x) < T.hw * 0.45) continue;
        bush(ft, x, roofY(x * 0.85, z) - R(0, 1.2), z, R(3.0, 4.0), R(1.9, 2.8), R(3.0, 4.0));
      }
      for (let i = 0; i < 30; i++) {   // giữa-sau nóc tháp
        const x = R(-T.hw * 0.65, T.hw * 0.65), z = T.zF + tl * R(0.4, 0.95);
        if (u.tankType === 'ARTILLERY' && Math.abs(x) < 5.4 && z < 6.5) continue;   // chừa hộp bệ nòng 155
        bush(ft, x, roofY(x, z) + 0.2, z, R(3.2, 4.2), R(1.5, 2.2), R(3.2, 4.2));
      }
      panelHost = ft; panelPos = [T.hw * 0.25, roofY(T.hw * 0.25, T.zF + tl * 0.7) + 3.0, T.zF + tl * 0.7];
    } else if (u.turretGroup && u.tankType === 'SCOUT') {
      // Marten: lá giắt trên mép trên 2 cánh tấm chắn súng (không che khe súng / đường đạn). Vị trí đo từ hình tấm chắn
      // thật (nhãn 'shield' trong cụm trụ súng u._hmg.mount) và gắn vào cụm đó: dời súng / đổi vũ khí không để lá lơ lửng,
      // cụm trụ ẩn (lắp giàn rocket) thì lá ẩn theo
      const H = u._hmg, reg = u.partRegistry && u.partRegistry.shield;
      if (H && H.mount && reg) {
        const box = new THREE.Box3(), v = new THREE.Vector3();
        for (const e of reg) {
          if (e.mesh.parent !== H.mount) continue;
          const p = e.mesh.geometry.attributes.position;
          for (const [o, n] of e.ranges) for (let i = o; i < o + n; i++) box.expandByPoint(v.fromBufferAttribute(p, i).add(e.mesh.position));
        }
        if (!box.isEmpty()) {
          fm = batch(u); fm.setTag('camoKitM');
          const hx = Math.max(-box.min.x, box.max.x), dz = box.max.z - box.min.z;
          for (const s of [-1, 1]) for (const k of [0.62, 0.9]) {
            clump(fm, s * hx * k, box.max.y - 0.35, box.max.z - dz * (k > 0.8 ? 0.15 : 0.45), R(1.2, 1.5), R(0.7, 0.9), R(1.0, 1.3), true);
          }
        }
      }
      // viền lá rủ ngoài mép vòng xoay (bán kính lỗ ~3.15, vòng đế ~3.75): không lọt vào lòng lỗ chỗ xạ thủ đứng
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4; if (Math.cos(a) > 0.6) continue; card(ft, [Math.sin(a) * 4.2, 0.5, Math.cos(a) * 4.2], [0, a, 0], [2.6, 1.1, 1]); }
      // nắp lỗ nóc: viền lá buộc quanh mép (phá dáng đĩa thép tròn khi nắp dựng lên) + bụi lá bẹt trên mặt ngoài; gắn theo
      // nắp nên mở / đóng đều mang theo. Hệ nắp: gốc ở trục bản lề, tâm nắp lùi -z; chừa phía bản lề & quai nắm ngoài
      if (u.hatchLid) {
        fl = batch(u); fl.setTag('camoKitH');
        const lz = -u.hatchLid.position.z, lr = 3.3;
        // dải lá quấn qua mép sang cả mặt trong (nắp dựng lên lộ mặt trong ra trước): chừa giữa nắp (tay quay khóa)
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + R(-0.1, 0.1), rr = lr + R(-0.3, 0.1);
          if (Math.cos(a) > 0.6) continue;
          clump(fl, Math.sin(a) * rr, R(-0.15, 0.15), lz + Math.cos(a) * rr, R(1.4, 1.9), R(1.0, 1.3), R(1.4, 1.9), true);
        }
        for (const [x, z] of [[0.9, -0.6], [-0.3, 1.0], [0.8, 1.4], [1.1, -1.7]]) clump(fl, x, 0.5, lz + z, R(1.3, 1.7), R(0.5, 0.7), R(1.3, 1.7), true);
      }
      panelHost = fh; panelPos = [0, F.netY + 3.2, F.zR - 7];
    }
    // ---- NÒNG / HỘP PHÁO ----
    const BL = BARREL_LEAF[u.tankType];
    if (BL && u.barrelGroup) {
      // quấn kín quanh nòng: bụi lá trên lưng + hai bên hông, tấm lá rủ dưới bụng nòng, ngọn lá nhô lên phá dáng nòng
      for (const [a, b, r] of BL.segs) {
        for (let z = a; z >= b; z -= R(1.1, 1.4)) {
          clump(fb, R(-0.3, 0.3), r * 0.55, z, R(1.6, 2.2), R(0.9, 1.3), R(1.6, 2.2), true);
          for (const s of [-1, 1]) {
            if (rnd() < 0.75) clump(fb, s * r * R(0.65, 0.85), R(-0.3, 0.1), z + R(-0.4, 0.4), R(1.0, 1.4), R(1.2, 1.6), R(1.2, 1.6), true);
            if (rnd() < 0.7) card(fb, [s * (r + 0.25), -r * 0.45, z], [0, Math.PI / 2 + R(-0.3, 0.3), s * R(0.1, 0.3)], [R(2.2, 3.0), R(2.0, 2.8), 1]);
          }
          if (rnd() < 0.5) clump(fb, R(-0.3, 0.3), -r * 0.7, z + R(-0.4, 0.4), R(1.1, 1.5), R(0.7, 1.0), R(1.2, 1.6), true);
          if (rnd() < ST.sprig * 0.3) sprig(fb, R(-0.4, 0.4), r * 0.8, z, R(1.8, 2.8));
        }
      }
    } else if (u.tankType === 'GATLING' && u.barrelPivot) {
      // pháo 6 nòng: lá trên hộp giáp bao khối pháo, không che cụm nòng xoay
      for (let z = -5.2; z <= 1.6; z += R(1.8, 2.4)) for (const x of [-2.2, 0, 2.2]) clump(fp, x + R(-0.4, 0.4), 2.9, z, R(1.6, 2.1), R(0.9, 1.3), R(1.6, 2.1), true);
      for (const s of [-1, 1]) for (let z = -4.6; z <= 1.2; z += 2.6) card(fp, [s * 3.9, 0.6, z], [0, Math.PI / 2 + R(-0.3, 0.3), R(-0.2, 0.2)], [2.8, 3.2, 1]);
    }
    // tấm vải màu phe nằm trên lớp lá (nhận ra phe từ trên cao)
    if (panelHost) panelHost.box(4.6, 0.08, 3.2, factionPanelMat(u.team), panelPos, [R(-0.08, 0.08), R(-0.3, 0.3), R(-0.08, 0.08)]);

    const meshes = [], cfParts = [];
    const grab = (b, parent, tag) => {
      const kids = parent.children.length;
      buildBatch(u, b, parent);
      const mine = [];
      for (let i = kids; i < parent.children.length; i++) { meshes.push(parent.children[i]); mine.push(parent.children[i]); }
      if (cfRec.has(b)) cfParts.push({ b, parent, tag, mesh: mine.find(m => m.material === leaf) || null, rec: cfRec.get(b), panel: mine.find(m => m.material === factionPanelMat(u.team)) || null });
    };
    grab(fh, u.chassisGroup, 'camoKit');
    if (u.turretGroup) grab(ft, u.turretGroup, 'camoKitT');
    if (u.barrelGroup && fb.buckets.size) grab(fb, u.barrelGroup, 'camoKitB');
    if (u.barrelPivot && fp.buckets.size) grab(fp, u.barrelPivot, 'camoKitP');
    if (fl && fl.buckets.size) grab(fl, u.hatchLid, 'camoKitH');
    if (fm && fm.buckets.size) grab(fm, u._hmg.mount, 'camoKitM');
    if (window.CamoFire && cfCells.length) {
      const pi = new Map(cfParts.map((p, i) => [p.b, i]));
      for (const c of cfCells) { c.p = pi.has(c.b) ? pi.get(c.b) : -1; delete c.b; }
      let panel = null;
      const pp = cfParts.find(p => p.panel);
      if (pp && panelPos) {
        let best = -1, bd = Infinity;
        const k = cfParts.indexOf(pp);
        cfCells.forEach((c, i) => { if (c.p !== k) return; const d = (c.x - panelPos[0]) ** 2 + (c.y - panelPos[1]) ** 2 + (c.z - panelPos[2]) ** 2; if (d < bd) { bd = d; best = i; } });
        panel = { mesh: pp.panel, cell: best };
      }
      CamoFire.prepare(u, { kind: ST.fire, leaf, twig: tw, cells: cfCells, parts: cfParts.map(p => ({ parent: p.parent, tag: p.tag, mesh: p.mesh, rec: p.rec })), panel });
    }
    // Lá không chặn đạn (tia dò đạn đi xuyên, như lá thật) và không bị bóp méo khi xe thành xác
    for (const m of meshes) { m.userData.isFxDecal = true; m.userData.noDeform = true; }
    // cành & lá trên nòng là chi tiết nhỏ: ẩn khi xe ở xa (Equipment.update)
    u._camoDetail = meshes.filter(m => m.material === tw || m.parent === u.barrelGroup || m.parent === u.barrelPivot);
    u._camoLeaf = leaf;
    u._camoMeshes = meshes;
    u._camoHp = u.hp;
    // Rung lá + lá rơi chạy theo khung hình vẽ (cả phòng xem xe lẫn trong trận)
    const host = meshes.find(m => m.material === leaf);
    if (host) {
      let last = performance.now();
      host.onBeforeRender = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        stepFoliage(u, dt);
      };
    }
  }

  // Lá rơi khi trúng đạn (mỗi xe tối đa ~24 lá đang bay)
  let leafPlane = null;
  function dropLeaves(u, n) {
    if (!u.scene || !u.chassisGroup) return;
    if (window.CamoFire && CamoFire.leafless(u)) return;   // lưới đã / đang cháy: không còn lá xanh để rụng
    const F = FIT[u.tankType];
    if (!F) return;
    const kind = foliageKind(u), mat = foliageMats(kind).leaf;
    if (!leafPlane) { leafPlane = leafCardGeo(); leafPlane.scale(1.4, 1.4, 1); }
    u._leafFx = u._leafFx || [];
    u.chassisGroup.updateMatrixWorld(true);
    for (let i = 0; i < n && u._leafFx.length < 24; i++) {
      const m = new THREE.Mesh(leafPlane, mat);
      m.position.set((Math.random() - 0.5) * F.hw * 1.8, F.y1 + 2 + Math.random() * 4, F.zF + Math.random() * (F.zR - F.zF)).applyMatrix4(u.chassisGroup.matrixWorld);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      u.scene.add(m);
      u._leafFx.push({ m, vx: (Math.random() - 0.5) * 10, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 10, life: 2.4 + Math.random() * 1.6, spin: (Math.random() - 0.5) * 6, y0: (u.y || 0) + 0.5 });
    }
  }
  function stepFoliage(u, dt) {
    const L = u._camoLeaf;
    if (!L || !(dt > 0)) return;
    u._camoT = performance.now();
    const U = L.userData.sway;
    U.uTime.value += dt;
    const vmax = u.baseMaxSpeed || 120, v = Math.min(1, Math.abs(u.speed || 0) / vmax);
    let kick = u._camoKick || 0, shake = u._camoShake || 0;
    // Khai hỏa: sóng nổ đầu nòng giật cả lưới lá (rung mạnh tức thì rồi tắt dần), pháo lớn làm rụng vài lá
    const rec = u.barrelRecoil || 0;
    if (rec > (u._camoRec || 0) + 0.5) {
      const big = u.tankType === 'ARTILLERY' || u.tankType === 'ALL_ROUNDER';
      shake = Math.max(shake, big ? 1 : 0.6); kick = Math.max(kick, 0.9);
      if (big) dropLeaves(u, 3 + Math.floor(Math.random() * 4));
    }
    u._camoRec = rec;
    if ((u.gatlingShotFlash || 0) > 0.5 || u.isFiringGatling) { shake = Math.max(shake, 0.35); kick = Math.max(kick, 0.55); }
    if (rec > 0.5) kick = Math.max(kick, 0.55);
    if (u._camoHp !== undefined && u.hp < u._camoHp - 1e-6) { kick = 1; shake = Math.max(shake, 0.8); dropLeaves(u, 6 + Math.floor(Math.random() * 5)); }
    u._camoHp = u.hp;
    kick *= Math.exp(-dt * 2.5);
    shake *= Math.exp(-dt * 4.5);
    u._camoKick = kick; u._camoShake = shake;
    const target = u.isDead ? 0 : 0.12 + v * 0.38 + kick * 0.7;
    U.uAmp.value += (target - U.uAmp.value) * Math.min(1, dt * 4);
    U.uShake.value = u.isDead ? 0 : shake;
    if (u._leafFx && u._leafFx.length) {
      for (let i = u._leafFx.length - 1; i >= 0; i--) {
        const p = u._leafFx[i];
        p.life -= dt;
        p.vy = Math.max(p.vy - 16 * dt, -7);
        p.vx *= Math.exp(-dt * 1.5); p.vz *= Math.exp(-dt * 1.5);
        p.m.position.x += (p.vx + Math.sin(p.life * 5) * 2.5) * dt;
        p.m.position.y = Math.max(p.y0, p.m.position.y + p.vy * dt);
        p.m.position.z += p.vz * dt;
        p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
        if (p.life < 0.6) p.m.scale.setScalar(Math.max(0.01, p.life / 0.6));
        if (p.life <= 0) { if (p.m.parent) p.m.parent.remove(p.m); u._leafFx.splice(i, 1); }
      }
    }
  }

  // Một viên gạch nổ lắp tay: hộp thép (sơn theo xe) + nắp thép mỏng ép bằng 2 bu-lông chéo góc. Mặt ngoài = trục `fa`
  // ('x' | 'y' | 'z', hệ tọa độ trước khi xoay rot) phía `fs` (±1). Lắp ngoài chiến trường: viên nào cũng lệch chút ít (xoay
  // quanh pháp tuyến, nhô / lún), ~1/10 viên là gạch thay sau trận (lô khác bạc nắng hoặc còn sơn lót sẫm), vài viên mất
  // 1 bu-lông nắp
  let _tq, _tq2, _te, _tv;   // tạo lười: file này còn chạy trên máy chủ Node (không có THREE)
  function eraTile(b, M, w, h, d, p, rot, fa, fs) {
    if (!_tq) { _tq = new THREE.Quaternion(); _tq2 = new THREE.Quaternion(); _te = new THREE.Euler(); _tv = new THREE.Vector3(); }
    const r = kitRnd(), mat = r < 0.045 ? M.eraPrimer : r < 0.13 ? M.eraFaded : M.era;
    _te.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, (rot && rot[3]) || 'XYZ');
    _tq.setFromEuler(_te);
    _tv.set(fa === 'x' ? 1 : 0, fa === 'y' ? 1 : 0, fa === 'z' ? 1 : 0);
    _tq.multiply(_tq2.setFromAxisAngle(_tv, (kitRnd() - 0.5) * 0.08));
    _te.setFromQuaternion(_tq, 'XYZ');
    const R = [_te.x, _te.y, _te.z];
    const ax = { x: 0, y: 1, z: 2 }[fa], t = [w, h, d][ax], uv = [0, 1, 2].filter(k => k !== ax);
    const L = (n, a, c) => {
      const o = [0, 0, 0];
      o[ax] = fs * n; o[uv[0]] = a; o[uv[1]] = c;
      _tv.set(o[0], o[1], o[2]).applyQuaternion(_tq);
      return [p[0] + _tv.x, p[1] + _tv.y, p[2] + _tv.z];
    };
    const sz = (n, a, c) => { const o = [0, 0, 0]; o[ax] = n; o[uv[0]] = a; o[uv[1]] = c; return o; };
    const dims = [w, h, d], A = dims[uv[0]], C = dims[uv[1]], out = (kitRnd() - 0.4) * 0.07;
    b.box(...sz(t, A, C), mat, L(out, 0, 0), R);
    // nắp thép mặt ngoài. Gạch ốp mặt nghiêng: chỉ dựng viền nắp (4 nẹp mảnh) — tấm nắp liền xoay nghiêng có hộp bao phình
    // to, hệ thống hư hại (VehicleDamage.segmentsOf) sẽ tưởng là 1 viên gạch riêng
    const ln = out + t / 2 + 0.03;
    if (!rot) b.box(...sz(0.07, A - 0.34, C - 0.34), mat, L(ln, 0, 0), R);
    else {
      for (const j of [-1, 1]) b.box(...sz(0.07, A - 0.34, 0.14), mat, L(ln, 0, j * (C / 2 - 0.24)), R);
      for (const i of [-1, 1]) b.box(...sz(0.07, 0.14, C - 0.72), mat, L(ln, i * (A / 2 - 0.24), 0), R);   // hở góc: nẹp không chung đỉnh -> không gộp thành 1 khối
    }
    const miss = kitRnd() < 0.18 ? (kitRnd() < 0.5 ? 0 : 1) : -1;
    [[-1, -1], [1, 1]].forEach(([i, j], k) => {
      if (k === miss) return;
      b.cyl(0.11, 0.12, 0.12, 6, M.steel, L(out + t / 2 + 0.1, i * (A / 2 - 0.32), j * (C / 2 - 0.32)), fa, R);
    });
  }

  // ---- Giáp lắp thêm xe trinh sát 4x4 (Marten, recon_marten.js): sườn cabin là 4 CÁNH CỬA (z -6.6..0.4 / 0.8..7.8, mép dưới
  // y 9.85, ô kính y 12.65..14.55), bản lề ở mép trước (y 11 / 13.8), tay nắm ở mép sau (z1 - 1.6..z1 - 0.4, y ~12.2); sườn
  // ngả vào trong 0.6 / 5.7 đv. Dưới cửa là tấm thoát lầy kẹp sườn, sau cửa sau là nắp bình xăng + hộp đồ -> giáp chỉ lắp
  // ĐƯỢC LÊN TỪNG CÁNH CỬA (kiểu bộ giáp cửa của xe bọc thép bánh lốp): mỗi cửa 1 khay riêng ở nửa dưới, chừa dải bản lề phía
  // trước + tay nắm phía sau, hở đúng khe giữa 2 cửa -> cửa vẫn mở được, khay mở theo cửa
  const MT = { doors: [[-6.6, 0.4], [0.8, 7.8]], x0: 7.95, y0: 9.7, lean: 0.6 / 5.7, yLo: 9.95, yMid: 11.2, yHi: 12.45, hinge: 0.95, handle: 1.75, tail: 0.25, appT: 0.8 };
  const MT_A = Math.atan(MT.lean);
  // điểm trên mặt cửa bên s ở độ cao y, lùi ra ngoài n theo pháp tuyến (mặt cửa ngả vào trong theo độ cao)
  const mtAt = (s, y, n, z) => [s * (MT.x0 - (y - MT.y0) * MT.lean + n * Math.cos(MT_A)), y + n * Math.sin(MT_A), z];
  // khung tấm trên 1 cánh cửa: hình chữ L — nửa trên dừng trước tay nắm (b), nửa dưới luồn xuống dưới tay nắm tới sát mép
  // sau cửa (e); phía trước chừa dải bản lề (a)
  const mtSpan = ([z0, z1]) => ({ a: z0 + MT.hinge, b: z1 - MT.handle, e: z1 - MT.tail });
  // tấm chữ L dày t (mặt cắt theo z / y quanh tâm zc / yc), đặt sát mặt cửa
  function mtPlate(hull, mat, s, k, t, n) {
    const zc = (k.a + k.e) / 2, yc = (MT.yLo + MT.yHi) / 2, Y = (y) => y - yc, Z = (z) => z - zc;
    const g = VehicleKit.sideProfile([[Z(k.a), Y(MT.yHi)], [Z(k.a), Y(MT.yLo)], [Z(k.e), Y(MT.yLo)], [Z(k.e), Y(MT.yMid)], [Z(k.b), Y(MT.yMid)], [Z(k.b), Y(MT.yHi)]], t, Math.min(0.08, t * 0.3));
    hull.add(g, mat, mtAt(s, yc, n + t / 2, zc), [0, 0, s * MT_A]);
  }
  function martenApplique(hull, M) {
    const t = MT.appT;
    for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
      const rot = [0, 0, s * MT_A];
      for (const d of MT.doors) {
        const k = mtSpan(d);
        mtPlate(hull, M.plate, s, k, t, 0.02);
        // bu-lông bắt xuyên cánh cửa: hàng dưới chạy hết chữ L, hàng trên tới trước tay nắm
        const bolt = (y, z) => hull.cyl(0.12, 0.13, 0.14, 6, M.steel, mtAt(s, y, t + 0.08, z), 'x', rot);
        for (let i = 0; i < 5; i++) bolt(MT.yLo + 0.32, k.a + 0.35 + i * (k.e - k.a - 0.7) / 4);
        for (let i = 0; i < 3; i++) bolt(MT.yHi - 0.32, k.a + 0.35 + i * (k.b - k.a - 0.7) / 2);
      }
    }
  }
  function martenEra(hull, M, app) {
    const base = (app ? MT.appT : 0) + 0.02, w = 1.75, gap = 0.1, h = MT.yMid - MT.yLo - 0.17;
    for (const s of [-1, 1]) {
      const rot = [0, 0, s * MT_A];
      for (const d of MT.doors) {
        const k = mtSpan(d), yc = (MT.yLo + MT.yHi) / 2;
        // khay giữ gạch hàn sẵn (tấm đáy chữ L, gờ chặn dưới, nẹp đứng 2 đầu + chỗ gãy chữ L, nẹp chặn trên) — không gắn
        // tag: gạch nổ / văng hết vẫn còn khay rỗng trên cửa
        hull.setTag(null);
        mtPlate(hull, M.plate, s, k, 0.1, base);
        const bar = (len, y, z, hy) => hull.box(0.62, hy, len, M.plate, mtAt(s, y, base + 0.38, z), rot);
        bar(k.e - k.a, MT.yLo + 0.08, (k.a + k.e) / 2, 0.16);
        bar(k.b - k.a - 0.3, MT.yHi - 0.05, (k.a + k.b) / 2, 0.1);
        bar(k.e - k.b - 0.2, MT.yMid + 0.02, (k.b + k.e) / 2 + 0.1, 0.1);
        hull.box(0.62, MT.yHi - MT.yLo, 0.12, M.plate, mtAt(s, yc, base + 0.38, k.a + 0.06), rot);
        hull.box(0.62, MT.yMid - MT.yLo, 0.12, M.plate, mtAt(s, (MT.yLo + MT.yMid) / 2, base + 0.38, k.e - 0.06), rot);
        hull.box(0.62, MT.yHi - MT.yMid, 0.12, M.plate, mtAt(s, (MT.yMid + MT.yHi) / 2, base + 0.38, k.b - 0.06), rot);
        // gạch nổ: hàng dưới chạy hết chữ L, hàng trên ngắn hơn (dừng trước tay nắm), căn giữa trong khay
        hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
        const row = (z0, z1, y) => {
          const n = Math.floor((z1 - z0 - 0.3 + gap) / (w + gap)), m = (z1 - z0 - n * w - (n - 1) * gap) / 2;
          for (let c = 0; c < n; c++) eraTile(hull, M, 0.5, h, w, mtAt(s, y, base + 0.35, z0 + m + w / 2 + c * (w + gap)), rot, 'x', s);
        };
        row(k.a, k.e, MT.yLo + 0.12 + h / 2);
        row(k.a, k.b, MT.yMid + 0.05 + h / 2);
      }
    }
  }

  // ---- Giáp lắp thêm xe 6 nòng (Hailstorm, fsv_hailstorm.js): bám đúng vỏ thật thay vì hộp FIT chung ----
  // Váy xích đã có sẵn 2 hàng gạch nổ (của mô hình) -> đồ mua thêm ốp dải sườn thân TRÊN váy (y 10.85..13.75, mặt vỏ
  // x ±15.2), mặt mũi đúc và tháp. Mép trên dải sườn phía trước thấp dần theo giáp mũi trên (mũi z -31.6 / y 12.2 ->
  // nóc y 14.2 tại z -14.5); sườn phải chừa cửa xả khí động cơ (z -21.2..-13.6)
  const HS = {
    side: 15.2, bandY0: 10.85, bandY1: 13.75, z0: -29.0, z1: 25.4,
    top: (z) => Math.min(13.75, 12.2 + (z + 31.6) * (2.0 / 17.1) - 0.45),
    exhaust: [-21.2, -13.6],
    // tháp (hệ tọa độ tháp): mặt trước khối giáp má tháp (từ góc ngoài -> góc trong), mặt trước & mặt ngoài hòm đạn
    cheek: [[9.0, -11.3, 4.6], [4.6, -12.6, 3.9]], box: [[10.1, -7.5], [13.4, -6.8]], boxSide: { x: 13.4, z0: -6.3, z1: 4.9, y0: 1.1, y1: 4.6 }
  };
  const HS_APP_T = 1.3;   // bề dày tấm composite dải sườn
  // Chia [a, b] thành các đoạn dài ~len, chừa khe 0.4 và tránh các khoảng cấm
  function spans(a, b, len, holes) {
    let segs = [[a, b]];
    for (const [h0, h1] of holes || []) segs = segs.flatMap(([p, q]) => (h1 <= p || h0 >= q) ? [[p, q]] : [[p, h0 - 0.3], [h1 + 0.3, q]].filter(([x, y]) => y - x > 1.5));
    const out = [];
    for (const [p, q] of segs) {
      const n = Math.max(1, Math.round((q - p) / len)), st = (q - p) / n;
      for (let i = 0; i < n; i++) out.push([p + i * st + (i ? 0.2 : 0), p + (i + 1) * st - (i < n - 1 ? 0.2 : 0)]);
    }
    return out;
  }
  // điểm & góc xoay Y của mặt đứng chạy từ A tới B (hệ tọa độ x/z, s đã nhân), lùi ra ngoài 'out' theo pháp tuyến phía trước
  function faceAt(A, B, t, out) {
    const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1;
    let nx = dz / L, nz = -dx / L;
    if (nz > 0) { nx = -nx; nz = -nz; }   // pháp tuyến hướng ra trước (-z)
    return { p: [A[0] + dx * t + nx * out, A[1] + dz * t + nz * out], yaw: Math.atan2(-dz, dx), len: L };
  }
  function gatlingApplique(u, hull, tur, M) {
    const VK = VehicleKit;
    for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
      const x = s * (HS.side + HS_APP_T / 2);
      for (const [a, b] of spans(HS.z0, HS.z1, 13, s > 0 ? [HS.exhaust] : [])) {
        // tấm composite theo mép trên dải sườn (phía trước thấp dần theo giáp mũi), bắt bu-lông 2 hàng
        const g = VK.sideProfile([[a, HS.top(a)], [a, HS.bandY0], [b, HS.bandY0], [b, HS.top(b)]], HS_APP_T, 0.12);
        hull.add(g, M.plate, [x, 0, 0]);
        const n = Math.max(2, Math.round((b - a) / 2.6));
        hull.boltRow([s * (HS.side + HS_APP_T), HS.bandY0 + 0.4, a + 0.6], [s * (HS.side + HS_APP_T), HS.bandY0 + 0.4, b - 0.6], n, 'x', M.steel, 0.14, s);
        hull.boltRow([s * (HS.side + HS_APP_T), HS.top(a) - 0.4, a + 0.6], [s * (HS.side + HS_APP_T), HS.top(b) - 0.4, b - 0.6], n, 'x', M.steel, 0.14, s);
      }
    }
    if (!u.turretGroup) return;
    tur.setTag('appliqueKitT');
    for (const s of [-1, 1]) {
      // khối composite ốp mặt trước khối giáp má tháp
      const A = [s * HS.cheek[0][0], HS.cheek[0][1]], B = [s * HS.cheek[1][0], HS.cheek[1][1]];
      const f = faceAt(A, B, 0.5, 0.65);
      tur.box(f.len - 0.2, 3.0, 1.3, M.plate, [f.p[0], 2.3, f.p[1]], [0, f.yaw, 0]);
      // tấm ốp mặt ngoài hòm đạn (2 tấm, đệm cách mặt hòm để chừa gân / chốt khóa) — dài / cao theo cỡ hòm đang lắp
      const mb = u.magBox, S = mb ? Object.assign({}, HS.boxSide, { z1: mb.zR - 0.6, y1: mb.top - 0.3 }) : HS.boxSide, mid = (S.z0 + S.z1) / 2;
      for (const [a, b] of [[S.z0, mid - 0.2], [mid + 0.2, S.z1]]) {
        tur.box(1.0, S.y1 - S.y0, b - a, M.plate, [s * (S.x + 0.8), (S.y0 + S.y1) / 2, (a + b) / 2]);
        tur.boltRow([s * (S.x + 1.3), S.y1 - 0.4, a + 0.5], [s * (S.x + 1.3), S.y1 - 0.4, b - 0.5], 3, 'x', M.steel, 0.13, s);
      }
    }
  }
  function gatlingEra(u, hull, tur, M) {
    const app = has(u, 'applique');
    const tile = (b, w, h, pos, yaw) => eraTile(b, M, w, h, 0.5, pos, [0, yaw, 0], 'z', 1);   // gạch trên mặt đứng xoay theo yaw
    // dải sườn thân: 1-2 hàng tùy chỗ (phía trước dải thấp, chỉ đủ 1 hàng)
    for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
      const x = s * (HS.side + (app ? HS_APP_T : 0) + 0.3);
      for (const [a, b] of spans(HS.z0 + 0.4, HS.z1, 30, s > 0 ? [HS.exhaust] : [])) {
        const n = Math.floor((b - a + 0.25) / 2.25);
        for (let k = 0; k < n; k++) {
          const z = a + 1.0 + k * 2.25, room = HS.top(z - 1.0) - HS.bandY0;
          const rows = room >= 2.85 ? 2 : room >= 1.4 ? 1 : 0;
          for (let r = 0; r < rows; r++) {
            const h = rows === 2 ? 1.35 : Math.min(1.6, room - 0.1), y = HS.bandY0 + 0.05 + r * 1.45 + h / 2;
            eraTile(hull, M, 0.5, h, 2.0, [x, y, z], null, 'x', s);
          }
        }
      }
    }
    // mặt mũi đúc gần đứng (z ~ -32.1): 1 hàng gạch ngang mũi, sau lưỡi ủi / khiên chữ V
    hull.setTag('eraKitF');
    for (let k = 0; k < 11; k++) {
      const x = -11.25 + k * 2.25;
      eraTile(hull, M, 2.0, 1.8, 0.5, [x, 10.5, -32.45], [0.12, 0, 0], 'z', -1);
    }
    if (!u.turretGroup) return;
    for (const s of [-1, 1]) {
      // mặt trước khối giáp má tháp: 2 cột x 2 hàng (cùng tag mặt trước tháp)
      tur.setTag('eraKitTF');
      const A = [s * HS.cheek[0][0], HS.cheek[0][1]], B = [s * HS.cheek[1][0], HS.cheek[1][1]];
      for (const t of [0.27, 0.73]) {
        const f = faceAt(A, B, t, (app ? 1.3 : 0) + 0.3);
        for (const y of [1.6, 3.05]) tile(tur, f.len * 0.44, 1.35, [f.p[0], y, f.p[1]], f.yaw);
      }
      // mặt trước hòm đạn hai bên: 2 cột x 2 hàng
      tur.setTag(s < 0 ? 'eraKitTL' : 'eraKitTR');
      const C = [s * HS.box[0][0], HS.box[0][1]], D = [s * HS.box[1][0], HS.box[1][1]];
      for (const t of [0.26, 0.74]) {
        const f = faceAt(C, D, t, 0.3);
        for (const y of [1.8, 3.4]) tile(tur, f.len * 0.44, 1.45, [f.p[0], y, f.p[1]], f.yaw);
      }
    }
  }

  // ---- Giáp lắp thêm xe tăng (Halberd, mbt_halberd.js): kiểu bộ TUSK — sườn ốp lên VÁY XÍCH (thân trên chỉ cao ~3 đv
  // trên váy), mũi ốp lên tấm giáp có sẵn trên giáp mũi, tháp ốp mặt trước khối giáp mũi tên & đè lên module má tháp ----
  const HB = {
    // váy xích: đoạn trước dày (mặt ngoài x 16.3, cắt vát góc dưới trước), 5 đoạn mỏng sau (mặt ngoài x 15.55)
    skirtF: { a: -30.2, b: -15.6, x: 16.3 }, skirtR: { z0: -15.3, seg: 8.5, n: 5, x: 15.55 }, y0: 5.0, y1: 9.6,
    glacisY: (z) => 9.4 + (z + 31.0) * 0.34, GLACIS_A: Math.atan(0.34),
    // tháp (hệ tọa độ tháp): mặt trước khối giáp mũi tên (góc ngoài -> mũi trong) ở gờ sống y 3.2, ngả về sau 2.4 tới nóc;
    // tấm hông trên ngả vào trong (gờ sống x 11.6 ở y 3.2, vào 1.1 ở y 6.0) — module má tháp dày 0.55, z -11.6..-1.2
    wedge: [[11.6, -14.0], [3.1, -19.8]], ridgeY: 3.2, wedgeLean: 0.64,
    upTilt: Math.atan2(1.1, 2.8), upX: (y) => 11.6 - (y - 3.2) * (1.1 / 2.8), cheek: { yc: 4.55, z0: -11.4, z1: -1.4, out: 0.55 }
  };
  // các đoạn váy xích còn trên xe (đoạn bị giật mất từ trước — wear.lostSkirt — không dựng nên không có tag)
  function halberdSkirts(u, s) {
    const side = s < 0 ? 'L' : 'R', R = u.partRegistry || {};
    const known = Object.keys(R).some(k => /^skirt[LR]\d$/.test(k));
    const out = [{ a: HB.skirtF.a, b: HB.skirtF.b, x: HB.skirtF.x, front: true }];
    for (let i = 0; i < HB.skirtR.n; i++) {
      if (known && !R['skirt' + side + (i + 1)]) continue;
      const a = HB.skirtR.z0 + i * HB.skirtR.seg + 0.1;
      out.push({ a, b: a + HB.skirtR.seg - 0.2, x: HB.skirtR.x, last: i === HB.skirtR.n - 1 });
    }
    return out;
  }
  const HB_APP_X = HB.skirtF.x, HB_APP_T = 1.1;   // tấm composite ốp váy: một mặt phẳng chung ngoài đoạn váy dày nhất
  function halberdApplique(u, hull, tur, M) {
    const VK = VehicleKit;
    for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
      for (const k of halberdSkirts(u, s)) {
        const a = k.a + 0.15, b = k.b - (k.last ? 1.8 : 0.15);
        const pts = k.front ? [[a, HB.y1], [a, 7.7], [a + 2.1, HB.y0], [b, HB.y0], [b, HB.y1]] : [[a, HB.y1], [a, HB.y0], [b, HB.y0], [b, HB.y1]];
        hull.add(VK.sideProfile(pts, HB_APP_T, 0.1), M.plate, [s * (HB_APP_X + HB_APP_T / 2), 0, 0]);
        const xo = s * (HB_APP_X + HB_APP_T), n = Math.max(2, Math.round((b - a) / 2.4));
        hull.boltRow([xo, HB.y1 - 0.4, a + 0.5], [xo, HB.y1 - 0.4, b - 0.5], n, 'x', M.steel, 0.14, s);
        hull.boltRow([xo, HB.y0 + 0.5, (k.front ? a + 2.4 : a + 0.5)], [xo, HB.y0 + 0.5, b - 0.5], n, 'x', M.steel, 0.14, s);
        // đoạn váy mỏng lùi vào trong: khối đệm cách giữa tấm & váy
        if (k.x < HB_APP_X) for (const z of [a + 1.0, (a + b) / 2, b - 1.0]) for (const y of [HB.y0 + 0.8, HB.y1 - 0.8]) hull.box(HB_APP_X - k.x + 0.05, 0.6, 0.6, M.steel, [s * (k.x + HB_APP_X) / 2, y, z]);
      }
    }
    if (!u.turretGroup) return;
    tur.setTag('appliqueKitT');
    for (const s of [-1, 1]) {
      // tấm composite đè lên module má tháp (nghiêng theo tấm hông trên)
      const C = HB.cheek, t = HB.upTilt, nx = Math.cos(t), ny = Math.sin(t), xc = HB.upX(C.yc), out = C.out + 0.55;
      const zc = (C.z0 + C.z1) / 2;
      tur.box(1.1, 2.9, C.z1 - C.z0, M.plate, [s * (xc + nx * out), C.yc + ny * out, zc], [0, 0, s * t]);
      for (const z of [C.z0 + 0.8, zc, C.z1 - 0.8]) for (const up of [-1.1, 1.1]) {
        tur.cyl(0.15, 0.15, 0.18, 6, M.steel, [s * (xc + nx * (out + 0.58) - ny * up), C.yc + ny * (out + 0.58) + nx * up, z], 'x', [0, 0, s * t]);
      }
      // khối composite ốp phần đứng dưới gờ sống của mặt trước khối giáp mũi tên
      const A = [s * HB.wedge[0][0], HB.wedge[0][1]], B = [s * HB.wedge[1][0], HB.wedge[1][1]];
      const f = faceAt(A, B, 0.5, 0.55);
      tur.box(f.len - 0.6, 2.4, 1.1, M.plate, [f.p[0], 1.95, f.p[1]], [0, f.yaw, 0]);
    }
  }
  function halberdEra(u, hull, tur, M) {
    const app = has(u, 'applique');
    // sườn: 2 hàng gạch trên váy xích (trên tấm composite nếu có)
    for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
      for (const k of halberdSkirts(u, s)) {
        const x = s * ((app ? HB_APP_X + HB_APP_T : k.x) + 0.28);
        const b = k.b - (k.last ? 1.9 : 0.1);
        for (let z = k.a + 1.15; z + 1.0 <= b; z += 2.25) {
          for (const [y, h] of [[6.25, 1.85], [8.35, 1.85]]) {
            if (k.front && y < 7 && z - 1.0 < k.a + 2.4) continue;   // góc dưới trước đoạn váy dày bị cắt vát
            eraTile(hull, M, 0.5, h, 2.0, [x, y, z], null, 'x', s);
          }
        }
      }
    }
    // mũi: 2 hàng gạch nằm trên tấm giáp có sẵn của giáp mũi (z -30.6..-21.4), chừa kính lái
    hull.setTag('eraKitF');
    for (const z of [-28.3, -24.5]) for (let i = 0; i < 8; i++) {
      const x = -8.05 + i * 2.3;
      eraTile(hull, M, 2.1, 0.5, 3.5, [x, HB.glacisY(z) + 1.05, z], [-HB.GLACIS_A, 0, 0], 'y', 1);
    }
    if (!u.turretGroup) return;
    for (const s of [-1, 1]) {
      // mặt trước khối giáp má tháp: 2 hàng gạch nổ ốp phẳng sát mặt vát nghiêng
      tur.setTag('eraKitTF');
      const lean = HB.wedgeLean;
      const yaw = s * 2.5428088;
      const rot = [-lean, yaw, 0, 'YXZ'];
      const sinL = Math.sin(lean), cosL = Math.cos(lean);
      const L = Math.hypot(8.5, 5.8);
      const nhx = s * 5.8 / L, nhz = -8.5 / L;
      const v_up = { x: -sinL * nhx, y: cosL, z: -sinL * nhz };
      const N = { x: cosL * nhx, y: sinL, z: cosL * nhz };
      const thick = 0.48;
      const eraOut = thick / 2 + 0.05;

      const rows = [
        { dup: 0.95, tList: [0.18, 0.48, 0.78], w: 2.7, h: 1.45 },
        { dup: 2.65, tList: [0.18, 0.48, 0.78], w: 2.7, h: 1.45 }
      ];
      for (const row of rows) {
        for (const t of row.tList) {
          const x0 = s * (3.1 + 8.5 * t);
          const y0 = HB.ridgeY;
          const z0 = -19.8 + 5.8 * t;
          const px = x0 + row.dup * v_up.x + eraOut * N.x;
          const py = y0 + row.dup * v_up.y + eraOut * N.y;
          const pz = z0 + row.dup * v_up.z + eraOut * N.z;
          eraTile(tur, M, row.w, row.h, thick, [px, py, pz], rot, 'z', 1);
        }
      }
      // hông tháp: 1 hàng gạch dọc module má tháp (trên tấm composite nếu có)
      tur.setTag(s < 0 ? 'eraKitTL' : 'eraKitTR');
      const C = HB.cheek, t = HB.upTilt, nx = Math.cos(t), ny = Math.sin(t), xc = HB.upX(C.yc), out = C.out + (app ? 1.1 : 0) + 0.27;
      for (let z = C.z0 + 1.1; z + 1.0 <= C.z1 + 0.01; z += 2.3) eraTile(tur, M, 0.5, 2.2, 2.05, [s * (xc + nx * out), C.yc + ny * out, z], [0, 0, s * t], 'x', s);
    }
  }

  // ---- Hệ thống đánh chặn chủ động (kiểu Trophy / Iron Fist): mỗi bên tháp 1 cụm radar mảng pha 2 mặt (chéo trước +
  // chéo sau, phủ 180° bên đó) và 1 bệ phóng đạn đánh chặn xoay. Đặt lên đúng mặt tháp thật: dò tia từ trên xuống lấy
  // độ cao mặt đỡ (nóc / nắp hòm đạn...), chân đế + giá chống bắt bu-lông xuống mặt đó — không lơ lửng theo hộp FIT
  function buildAps(u, host, M, F, T) {
    const onTur = !!(T && u.turretGroup);
    const skip = new Set();
    if (u.barrelGroup) skip.add(u.barrelGroup);
    if (u.barrelPivot) skip.add(u.barrelPivot);
    for (const k in (u._mounts || {})) if (u._mounts[k].group) skip.add(u._mounts[k].group);
    if (!onTur && u.turretGroup) skip.add(u.turretGroup);
    const cast = cageCaster(onTur ? u.turretGroup : u.chassisGroup, skip);
    const fallback = onTur ? (REAL_ROOF[u.tankType] || T.h) : F.y1;
    // mặt đỡ cao nhất dưới khung đế (dò 5 điểm), bỏ vật mảnh vọt cao (ăng-ten) bằng giới hạn trên
    const seat = (x, z, hw, hd) => {
      let y = -Infinity;
      for (const [dx, dz] of [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
        const h = cast([x + dx, fallback + 6, z + dz], [0, -1, 0]);
        if (h && h.y < fallback + 2.5) y = Math.max(y, h.y);
      }
      return y > -Infinity ? y : fallback;
    };
    const A = apsSpot(u, F, T);
    host.setTag('apsKit');
    // miệng 2 ống phóng mỗi bên (hệ tọa độ group mang cụm) -> hiệu ứng phóng đạn chặn ra đúng ống phía mối đe dọa (apsMuzzle)
    u._apsLaunch = { host: onTur ? u.turretGroup : u.chassisGroup, pts: [] };
    for (const s of [-1, 1]) {
      apsPod(host, M, [s * A.tx, seat(s * A.tx, A.tz, 1.4, 1.6), A.tz], s);
      const ly = seat(s * A.lx, A.lz, 0.8, 1.7);
      apsLauncher(host, M, [s * A.lx, ly, A.lz], s);
      for (const dz of [-0.75, 0.75]) u._apsLaunch.pts.push([s * (A.lx + 1.1), ly + 1.2, A.lz + dz]);
    }
  }
  // Chỗ đặt cụm radar (tx, tz) & bệ phóng (lx, lz) mỗi bên (hệ tọa độ tháp, x lấy |x|). Xe tăng: dải nóc giữa kính ngắm
  // pháo thủ / kính chỉ huy (phía trước) và nắp chỉ huy / nắp nạp đạn (phía sau), cụm radar trên mép vát nóc
  const APS_SPOT = { ALL_ROUNDER: { tx: 10.3, tz: -2.4, lx: 7.3, lz: -2.4 } };
  function apsSpot(u, F, T) {
    if (APS_SPOT[u.tankType]) return APS_SPOT[u.tankType];
    const tz = T ? T.zF + (T.zR - T.zF) * 0.55 : 0, tx = T ? T.hw - 2.2 : F.hw - 3;
    return { tx, tz, lx: tx - 3, lz: tz + 0.2 };
  }
  // Miệng ống phóng đạn chặn gần mối đe dọa nhất (tọa độ thế giới), null nếu xe không có / mất cụm APS
  function apsMuzzle(u, at) {
    const A = u && u._apsLaunch;
    if (!A || !A.host || !A.host.parent || lost(u, 'apsKit')) return null;
    A.host.updateMatrixWorld(true);
    let best = null, bd = Infinity;
    for (const p of A.pts) {
      const w = A.host.localToWorld(new THREE.Vector3(p[0], p[1], p[2])), d = at ? w.distanceToSquared(at) : 0;
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }
  // cụm radar APS (p = điểm giữa chân đế trên mặt đỡ, s = bên): đế thép trên 4 chân chống, hộp điện tử, 2 mặt anten
  // mảng pha chéo trước / chéo sau có vỏ & mái che mưa, ống luồn cáp
  function apsPod(b, M, p, s) {
    const [x, y0, z] = p, yb = y0 + 0.7, st = M.steel, P = M.plate;
    b.box(2.9, 0.22, 3.4, st, [x, yb, z]);
    for (const dx of [-1.15, 1.15]) for (const dz of [-1.35, 1.35]) b.box(0.26, yb - y0, 0.26, st, [x + dx, (y0 + yb) / 2, z + dz]);
    b.box(2.2, 0.8, 1.6, P, [x, yb + 0.5, z]);
    // bản đế chân bắt bu-lông, lá tản nhiệt sườn ngoài hộp điện tử, 3 giắc cáp sườn trong
    for (const dx of [-1.15, 1.15]) for (const dz of [-1.35, 1.35]) {
      b.box(0.5, 0.06, 0.5, st, [x + dx, y0 + 0.03, z + dz]);
      b.cyl(0.06, 0.06, 0.08, 6, st, [x + dx + 0.16, y0 + 0.09, z + dz + 0.16]);
    }
    for (let i = 0; i < 6; i++) b.box(0.22, 0.6, 0.05, st, [x + s * 1.18, yb + 0.5, z - 0.6 + i * 0.24]);
    for (let k = 0; k < 3; k++) b.cyl(0.09, 0.09, 0.14, 8, st, [x - s * 1.15, yb + 0.45, z - 0.4 + k * 0.4], 'x');
    for (const dz of [-0.95, 0.95]) {
      const yaw = dz < 0 ? s * 0.55 : Math.PI - s * 0.55;
      const c = [x, yb + 1.75, z + dz];
      const e = new THREE.Euler(0, yaw, 0);
      const f = new THREE.Vector3(0, 0, -0.3).applyEuler(e), r = new THREE.Vector3(1, 0, 0).applyEuler(e);
      const at = (u, v, d) => [c[0] + r.x * u + f.x * d / 0.3, c[1] + v, c[2] + r.z * u + f.z * d / 0.3];
      b.box(2.6, 2.1, 0.55, P, c, [0, yaw, 0]);                                         // vỏ mặt anten
      b.box(2.2, 1.7, 0.08, M.sensor, [c[0] + f.x, c[1], c[2] + f.z], [0, yaw, 0]);     // mặt mảng pha
      // lưới chia phần tử mảng pha (4 x 3 ô) + vành ép radome bắt bu-lông
      for (let i = 1; i < 4; i++) b.box(0.03, 1.66, 0.02, st, at(-1.1 + i * 0.55, 0, 0.35), [0, yaw, 0]);
      for (let j = 1; j < 3; j++) b.box(2.16, 0.03, 0.02, st, at(0, -0.85 + j * 0.567, 0.35), [0, yaw, 0]);
      for (let i = 0; i < 6; i++) for (const v of [-0.95, 0.95]) b.cyl(0.045, 0.045, 0.05, 6, st, at(-1.15 + i * 0.46, v, 0.3), 'y', [Math.PI / 2, yaw, 0, 'YXZ']);
      b.box(2.8, 0.12, 0.8, st, [c[0] + f.x * 0.5, c[1] + 1.12, c[2] + f.z * 0.5], [0, yaw, 0]);   // mái che mưa
    }
    b.cyl(0.16, 0.16, 1.0, 6, st, [x + s * 1.0, yb + 0.6, z + 1.6], 'z');
    b.strut([x + s * 1.0, yb + 0.6, z + 2.1], [x + s * 1.2, y0 + 0.1, z + 2.4], 0.1, M.rubber, 6);   // ống cáp mềm xuống thân
  }
  // bệ phóng đạn đánh chặn: vành xoay + hộp phóng 2 ống chĩa ra ngoài, miệng ống bịt nắp cao su
  function apsLauncher(b, M, p, s) {
    const [x, y0, z] = p, y = y0 + 0.45, st = M.steel;
    b.cyl(1.05, 1.15, y - y0 + 0.2, 16, st, [x, (y0 + y) / 2, z]);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; b.cyl(0.05, 0.05, 0.08, 6, st, [x + Math.cos(a) * 0.95, y + 0.12, z + Math.sin(a) * 0.95]); }   // vành bu-lông mâm xoay
    b.box(1.7, 1.3, 3.2, M.plate, [x, y + 0.75, z]);
    b.box(1.8, 0.14, 3.3, st, [x, y + 1.45, z]);
    for (let i = 0; i < 5; i++) b.box(1.3, 0.05, 0.22, st, [x, y + 1.55, z - 1.0 + i * 0.5], [0.45, 0, 0]);   // lá chớp thoát khí phóng
    b.cyl(0.36, 0.36, 0.14, 14, st, [x - s * 0.9, y + 0.75, z], 'x');                 // ổ trục ngóc
    // 2 x 2 ống phóng đạn đánh chặn: vành miệng thép + nắp cao su; mắt cảm biến nhỏ trên mặt phóng
    for (const dz of [-0.75, 0.75]) for (const dy of [-0.3, 0.3]) {
      b.cyl(0.27, 0.27, 0.16, 12, st, [x + s * 0.9, y + 0.75 + dy, z + dz], 'x');
      b.cyl(0.21, 0.21, 0.05, 12, M.rubber, [x + s * 0.99, y + 0.75 + dy, z + dz], 'x');
    }
    b.cyl(0.1, 0.1, 0.06, 10, M.sensor, [x + s * 0.88, y + 1.25, z], 'x');
    b.strut([x - s * 0.6, y + 0.3, z + 1.5], [x - s * 0.9, y0 + 0.1, z + 1.9], 0.09, M.rubber, 6);
  }

  // ---- Radar dò tìm (mô-đun mua thêm): xịn hơn radar cảnh giới có sẵn của xe — mảng pha chủ động 2 mặt quay lưng nhau
  // (kiểu Giraffe 1X / RPS-42): mặt chính lớn ngửa nhẹ, mặt phụ phía sau, khoang điện tử có cánh tản nhiệt, thanh IFF trên
  // đỉnh. Cột: hộp nối bọc giáp bắt bu-lông + ống lồng 2 tầng có cổ khóa. Gốc đầu radar = đỉnh cột (RADAR_MAST_H)
  const RADAR_MAST_H = 4.6;
  function radarMast(b, M, p) {
    const [x, y, z] = p, st = M.steel;
    b.box(2.2, 0.9, 2.0, M.plate, [x, y + 0.45, z]);
    for (const dx of [-0.85, 0.85]) for (const dz of [-0.75, 0.75]) b.cyl(0.12, 0.12, 0.14, 6, st, [x + dx, y + 0.94, z + dz]);
    b.cyl(0.2, 0.2, 1.4, 6, M.rubber, [x + 1.2, y + 0.4, z + 0.3], 'z');           // ống cáp xuống tháp
    b.cyl(0.46, 0.52, 2.0, 12, st, [x, y + 1.9, z]);                               // ống dưới
    b.cyl(0.58, 0.58, 0.3, 12, st, [x, y + 2.95, z]);                              // cổ khóa ống lồng
    b.cyl(0.34, 0.36, 1.6, 12, st, [x, y + 3.85, z]);                              // ống trên
    // mặt bích chân cột 8 bu-lông, tay vặn khóa cổ ống lồng, cáp xoắn ốc ôm cột (giãn theo ống lồng), vạch đo cao
    b.cyl(0.72, 0.72, 0.12, 14, st, [x, y + 0.96, z]);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.cyl(0.05, 0.05, 0.08, 6, st, [x + Math.cos(a) * 0.62, y + 1.05, z + Math.sin(a) * 0.62]); }
    for (const a of [0, Math.PI]) b.box(0.5, 0.08, 0.08, st, [x + Math.cos(a) * 0.75, y + 2.95, z + Math.sin(a) * 0.75]);
    for (let i = 0; i < 9; i++) {
      const a0 = i * 1.1, a1 = a0 + 1.1, r0 = i < 5 ? 0.6 : 0.46, y0c = y + 1.1 + i * 0.36;
      b.strut([x + Math.cos(a0) * r0, y0c, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r0, y0c + 0.36, z + Math.sin(a1) * r0], 0.05, M.rubber, 5);
    }
    for (let i = 0; i < 4; i++) b.box(0.02, 0.06, 0.14, M.sensor, [x + 0.36, y + 3.3 + i * 0.3, z]);
  }
  function radarHead(b, M) {
    const st = M.steel, P = M.plate, S = M.sensor, TILT = -0.18;
    b.cyl(0.62, 0.7, 0.55, 14, st, [0, 0.28, 0]);                                  // khớp quay + vành trượt điện
    b.box(1.0, 0.5, 1.0, P, [0, 0.8, 0]);
    const F = (x, y, z) => { const c = Math.cos(TILT), s = Math.sin(TILT); return [x, 2.3 + y * c - z * s, z * c + y * s]; };
    // mặt chính (trước): khung vỏ, 4x2 ô mảng pha, viền
    b.box(4.6, 2.4, 0.7, P, F(0, 0, -0.35), [TILT, 0, 0]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.box(1.02, 1.02, 0.08, S, F(-1.62 + i * 1.08, -0.54 + j * 1.08, -0.74), [TILT, 0, 0]);
    // khoang điện tử phía sau + cánh tản nhiệt
    b.box(3.4, 1.8, 1.0, P, F(0, 0, 0.5), [TILT, 0, 0]);
    for (let i = 0; i < 7; i++) b.box(0.08, 1.5, 0.5, st, F(-1.5 + i * 0.5, 0, 1.2), [TILT, 0, 0]);
    // mặt phụ phía sau (nhỏ, thấp hơn)
    b.box(2.4, 1.1, 0.12, S, F(0, -0.25, 1.52), [TILT, 0, 0]);
    // thanh IFF trên đỉnh trên 2 cọc + đĩa GPS
    for (const x of [-1.6, 1.6]) b.box(0.12, 0.5, 0.12, st, F(x, 1.45, -0.2), [TILT, 0, 0]);
    b.box(4.4, 0.22, 0.35, S, F(0, 1.75, -0.2), [TILT, 0, 0]);
    b.cyl(0.28, 0.32, 0.18, 12, P, F(1.2, 1.3, 0.6), 'y', [TILT, 0, 0]);
    // vành ép mặt mảng pha bắt bu-lông, 2 tai cẩu đỉnh khung, cửa thăm khoang điện tử có khóa lẫy, giắc cáp quay
    for (let i = 0; i < 9; i++) for (const y of [-1.15, 1.15]) b.cyl(0.05, 0.05, 0.06, 6, st, F(-2.2 + i * 0.55, y, -0.72), 'z', [TILT, 0, 0]);
    for (const x of [-2.2, 2.2]) for (let j = 0; j < 4; j++) b.cyl(0.05, 0.05, 0.06, 6, st, F(x, -0.9 + j * 0.6, -0.72), 'z', [TILT, 0, 0]);
    for (const x of [-1.9, 1.9]) b.add(new THREE.TorusGeometry(0.16, 0.05, 6, 12), st, F(x, 1.25, 0.3), [TILT, Math.PI / 2, 0]);
    b.box(1.4, 1.0, 0.05, P, F(-0.5, 0, 1.02), [TILT, 0, 0]);
    for (const x of [-1.1, 0.1]) b.box(0.12, 0.2, 0.08, st, F(x, 0, 1.07), [TILT, 0, 0]);
    b.cyl(0.12, 0.12, 0.2, 8, st, [0.75, 0.75, 0.45], 'z');
    b.strut([0.75, 0.75, 0.6], [0.55, 0.15, 0.75], 0.07, M.rubber, 5);
  }

  function buildVisuals(u) { for (const _ of buildVisualsSteps(u)); }
  function* buildVisualsSteps(u) {
    if (u._eqBuilt || !u.kit || !u.kit.m.length || !u.chassisGroup || !window.VehicleKit) return;
    u._eqBuilt = true;
    const F = FIT[u.tankType];
    if (!F) return;
    const M = kitMats(u.team, u);
    const rng = VehicleKit.lookRng ? VehicleKit.lookRng(u, 0x4b17) : Math.random;
    // kitRnd dùng chung cả mô-đun: chỉ trỏ vào chuỗi số của xe này trong lúc chạy bước của nó (giữa 2 bước xe khác có thể dựng)
    const it = kitSteps(u, F, M);
    for (;;) {
      let r;
      kitRnd = rng;
      try { r = it.next(); } finally { kitRnd = Math.random; }
      if (r.done) return;
      yield;
    }
  }
  function* kitSteps(u, F, M) {
    const hull = batch(u), tur = batch(u);
    const T = F.tur;
    const len = F.zR - F.zF;

    const SC = u.tankType === 'SCOUT', AR = u.tankType === 'ARTILLERY';
    if (has(u, 'applique') && SC) martenApplique(hull, M);
    else if (has(u, 'applique') && AR) {
      // Xe pháo: tấm composite ốp cửa cabin dưới ô kính (trên hốc bánh trước) + má tháp, sát vỏ thật
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        for (const [z0, z1] of [[-33.8, -26.9], [-26.6, -19.4]]) {
          hull.box(1.2, 2.6, z1 - z0, M.plate, [s * 11.3, 13.6, (z0 + z1) / 2]);
          for (const y of [12.75, 14.45]) hull.boltRow([s * 11.9, y, z0 + 0.5], [s * 11.9, y, z1 - 0.5], 3, 'x', M.steel, 0.13, s);
        }
      }
      if (u.turretGroup) {
        tur.setTag('appliqueKitT');
        for (const s of [-1, 1]) {
          tur.box(1.4, 7.8, 7.6, M.plate, [s * 10.4, 5.1, -6.4]);
          for (const y of [1.7, 8.5]) tur.boltRow([s * 11.1, y, -9.6], [s * 11.1, y, -3.2], 4, 'x', M.steel, 0.14, s);
          tur.boltRow([s * 11.1, 2.6, -9.6], [s * 11.1, 7.6, -9.6], 3, 'x', M.steel, 0.14, s);
        }
      }
    } else if (has(u, 'applique') && u.tankType === 'GATLING') {
      gatlingApplique(u, hull, tur, M);
    } else if (has(u, 'applique') && u.tankType === 'ALL_ROUNDER') {
      halberdApplique(u, hull, tur, M);
    } else if (has(u, 'applique')) {
      // Tấm composite dày ở 2/3 trước sườn thân + má tháp
      const z0 = F.zF + 3, z1 = F.zF + len * 0.68;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        const n = 4, step = (z1 - z0) / n;
        for (let i = 0; i < n; i++) hull.box(1.4, F.y1 - F.y0 + 0.6, step - 0.4, M.plate, [s * (F.hw + 0.75), (F.y0 + F.y1) / 2, z0 + step * (i + 0.5)]);
      }
      if (T && u.turretGroup) {
        tur.setTag('appliqueKitT');
        for (const s of [-1, 1]) tur.box(1.6, T.h * 0.62, (T.zR - T.zF) * 0.38, M.plate, [s * (T.hw + 0.8), T.h * 0.42, T.zF + (T.zR - T.zF) * 0.22]);
      }
    }
    yield;
    if (has(u, 'era') && SC) martenEra(hull, M, has(u, 'applique'));
    else if (has(u, 'era') && u.tankType === 'GATLING') {
      gatlingEra(u, hull, tur, M);
    } else if (has(u, 'era') && u.tankType === 'ALL_ROUNDER') {
      halberdEra(u, hull, tur, M);
    } else if (has(u, 'era')) {
      // Gạch nổ: 2 hàng trên sườn phía trước, 1 hàng ở mũi dưới, má tháp
      const off = has(u, 'applique') ? 1.6 : 0;
      const bw = 3.3, gap = 0.3, z0 = F.zF + 2.5, z1 = F.zF + len * 0.5 + F.eraZ1;
      const rows = F.y1 - F.y0 > 5 ? 2 : 1, bh = (F.y1 - F.y0) / rows - 0.3;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
        for (let z = z0; z + bw <= z1; z += bw + gap) {
          for (let r = 0; r < rows; r++) eraTile(hull, M, 0.9, bh, bw, [s * (F.hw + 0.55 + off), F.y0 + (bh + 0.3) * (r + 0.5), z + bw / 2], null, 'x', s);
        }
      }
      hull.setTag('eraKitF');
      const fw = F.hw - 3;
      for (let x = -fw; x + bw <= fw + 0.01; x += bw + gap) eraTile(hull, M, bw, 2.6, 0.9, [x + bw / 2, F.y0 + 0.6, F.zF - 0.5], null, 'z', -1);
      if (T && u.turretGroup && u.tankType !== 'ARTILLERY') {
        for (const s of [-1, 1]) {
          tur.setTag(s < 0 ? 'eraKitTL' : 'eraKitTR');
          const tz0 = T.zF + 1, tz1 = T.zF + (T.zR - T.zF) * 0.45;
          for (let z = tz0; z + 2.8 <= tz1; z += 3.1) eraTile(tur, M, 0.9, T.h * 0.42, 2.8, [s * (T.hw + 0.55 + (has(u, 'applique') ? 1.7 : 0)), T.h * 0.5, z + 1.4], null, 'x', s);
        }
        tur.setTag('eraKitTF');
        for (let x = -T.hw * 0.62; x + 2.9 <= T.hw * 0.62 + 0.01; x += 3.2) eraTile(tur, M, 2.9, T.h * 0.36, 0.9, [x + 1.45, T.h * 0.36, T.zF - 0.5], null, 'z', -1);
      }
    }
    // Giáp lồng ôm thân xe + mái lồng chống UAV (tự đo bề mặt mô hình — xem buildCage)
    yield;
    if (has(u, 'slat')) yield* cageSteps(u, hull, tur, M, F, T);
    // Bình chữa cháy: toàn bộ nằm trong khoang (cảm biến + bình khí dập lửa), không có hình gắn ngoài
    if (has(u, 'aps')) buildAps(u, T ? tur : hull, M, F, T);
    if (has(u, 'smoke') && !(u.partRegistry && (u.partRegistry.smokeL || u.partRegistry.smokeR))) {
      const host = T && u.turretGroup ? tur : hull;
      for (const s of [-1, 1]) {
        host.setTag(s < 0 ? 'smokeKitL' : 'smokeKitR');
        const bx = T ? s * (T.hw - 1) : s * (F.hw - 2), by = T ? T.h * 0.7 : F.y1 + 1, bz = T ? T.zF + 4 : F.zF + 6;
        for (let i = 0; i < smokeMax(u); i++) host.cyl(0.55, 0.55, 2.4, 8, M.steel, [bx, by + i * 1.1, bz], 'z', [0.35, s * 0.4, 0]);
      }
    }
    const spot = ROOF_SPOT[u.tankType] || {}, roofY = REAL_ROOF[u.tankType] || F.netY;
    if (has(u, 'radar') && spot.radar && T && u.turretGroup) {
      // Radar dò tìm: cột ống lồng trên hộp nối bọc giáp + đầu radar mảng pha quay tròn (quay trong Equipment.update)
      const [rx, rz] = spot.radar;
      tur.setTag('radarKit');
      radarMast(tur, M, [rx, roofY, rz]);
      const head = new THREE.Group();
      head.position.set(rx, roofY + RADAR_MAST_H, rz);
      const hb = batch(u);
      hb.setTag('radarKit');
      radarHead(hb, M);
      buildBatch(u, hb, head);
      u.turretGroup.add(head);
      u._eqRadarHead = head;
    }
    if (has(u, 'jammer') && spot.jam) {
      // Máy gây nhiễu kiểu Shtora: tấm đế bắt bu-lông, hộp điện tử có cánh tản nhiệt sau lưng + ống cáp luồn xuống nóc,
      // 2 đầu phát hồng ngoại (vỏ hộp, mắt kính hồng ngọc sẫm, mái che mưa) trên chạc chĩa ra trước lệch 2 bên,
      // 3 ăng-ten phát nhiễu ngắn. Mắt kính nhấp nháy đỏ mờ khi làm việc (Equipment.update)
      const host = T && u.turretGroup ? tur : hull, [jx, jz] = spot.jam, y = roofY;
      host.setTag('jammerKit');
      host.box(2.8, 0.14, 2.2, M.steel, [jx, y + 0.07, jz]);
      host.boltRow([jx - 1.2, y + 0.16, jz - 0.9], [jx + 1.2, y + 0.16, jz - 0.9], 3, 'y', M.steel, 0.1);
      host.boltRow([jx - 1.2, y + 0.16, jz + 0.9], [jx + 1.2, y + 0.16, jz + 0.9], 3, 'y', M.steel, 0.1);
      host.box(2.2, 1.0, 1.5, M.plate, [jx, y + 0.65, jz]);
      for (let i = 0; i < 6; i++) host.box(0.07, 0.8, 0.32, M.steel, [jx - 0.9 + i * 0.36, y + 0.62, jz + 0.88]);   // cánh tản nhiệt
      host.cyl(0.15, 0.15, 1.5, 6, M.rubber, [jx + 1.25, y + 0.35, jz + 0.25], 'z', [0.25, 0, 0]);                   // ống cáp
      for (const sx of [-1, 1]) {
        const hx = jx + sx * 0.62, hy = y + 1.75, hz = jz - 0.35, yaw = -sx * 0.22;
        host.box(0.24, 0.62, 0.5, M.steel, [hx, y + 1.3, hz + 0.2]);                                                  // chạc đỡ
        host.box(0.95, 0.9, 0.85, M.plate, [hx, hy, hz], [0, yaw, 0]);                                                // vỏ đầu phát
        host.cyl(0.32, 0.36, 0.12, 12, M.lamp || M.sensor, [hx - Math.sin(yaw) * 0.46, hy - 0.02, hz - Math.cos(yaw) * 0.46], 'z', [0, yaw, 0]);
        host.box(1.05, 0.07, 0.42, M.plate, [hx - Math.sin(yaw) * 0.55, hy + 0.48, hz - Math.cos(yaw) * 0.55], [-0.18, yaw, 0]);   // mái che
      }
      for (const k of [-0.7, 0, 0.7]) host.strut([jx + k * 0.6, y + 1.15, jz + 0.45], [jx + k * 1.4, y + 3.1, jz + 0.8], 0.07, M.steel, 5, 0.035);
      u._eqJamLamp = M.lamp || null;
    }
    yield;
    // giáp lồng đã dựng: đo hộp bao từng mặt lồng (trước khi gộp mesh) để lưới lá phủ ra ngoài lồng
    const cage = has(u, 'slat') && has(u, 'camo') ? { h: tagBoxes(hull, 'cageKit'), t: tagBoxes(tur, 'cageKit') } : null;
    buildBatch(u, hull, u.chassisGroup);
    if (u.turretGroup) buildBatch(u, tur, u.turretGroup);
    yield;
    // mái lồng sàn sau đo vòng quét từ tháp đã gắn đủ đồ (lồng tháp, bệ nóc) -> dựng sau cùng
    const cp = CAGE_PLAN[u.tankType];
    if (has(u, 'slat') && cp && cp.hull.deck === 'arc') { const arc = cageDeckArc(u, M, F); if (cage) cage.arc = arc; yield; }
    if (has(u, 'camo')) buildFoliage(u, F, T, len, cage);   // lưới lá: dựng & gắn riêng, sau giáp lồng (xem buildFoliage)
  }

  // ---------------------------------------------------------------------------
  // MÀN KHÓI (ống phóng lựu đạn khói)
  // ---------------------------------------------------------------------------
  // Mỗi loạt: mỗi bên tháp bắn 1 quả (bên phải trễ ~0,1 s), bay vòng cung xòe ±26° về phía mũi tháp, nổ trên không
  // ~2 m trên mặt đất cách xe ~10 m: phụt bông khói trắng + chùm viên phốt-pho đỏ cháy văng xòe rơi xuống kéo vệt khói,
  // rồi 2 đám khói nở to dần thành bức tường dày. Khói đa phổ: chắn cả kính ngắm nhiệt và tia laser đo xa.
  const SMOKE_LIFE = 17, SMOKE_FADE = 4, SMOKE_R = 50;             // đời đám khói (s) · thời gian tan cuối đời · bán kính khi nở hết
  const SMOKE_RANGE = 80, SMOKE_FAN = 0.46, SMOKE_BURST_H = 16;    // tầm nổ · góc xòe mỗi bên (rad) · độ cao nổ trên mặt đất
  const SMOKE_FLIGHT = 0.75, SMOKE_GAP = 2600;                     // thời gian bay của lựu đạn (s) · tối thiểu giữa 2 loạt (ms, máy chủ chặn 2,5 s)
  // đang bị khóa mà phóng khói: địch mất khóa từ lúc khói nở tới khi khói tan gần hết
  const CLOAK_FROM = SMOKE_FLIGHT + 0.5, CLOAK_UNTIL = SMOKE_FLIGHT + SMOKE_LIFE - SMOKE_FADE / 2;
  const WIND_X = 0.9, WIND_Z = 0.5;                                // gió nhẹ đẩy hạt khói trôi chầm chậm
  // Vị trí cụm ống phóng trên mô hình (tag smokeL / smokeR, tọa độ trong tháp hoặc thân xe): ống đầu tiên + khoảng cách ống
  const TUBE_SPOT = {
    ALL_ROUNDER: { host: 'turret', x: 11.95, y: 6.25, z: 0.8, dz: 1.05 },
    GATLING: { host: 'turret', x: 10.5, y: 5.0, z: 7.7, dz: 1.05 },
    ARTILLERY: { host: 'turret', x: 10.5, y: 8.1, z: -8.0, dz: 0.95 },
    SCOUT: { host: 'hull', x: 6.5, y: 15.85, z: -5.6, dz: 0.8 }
  };
  const sideLost = (u, s) => lost(u, s < 0 ? 'smokeL' : 'smokeR') || lost(u, s < 0 ? 'smokeKitL' : 'smokeKitR');
  /** Bên còn bắn được (cụm ống chưa bị bắn bay): bit 1 = trái, 2 = phải; 0 = hỏng cả hai */
  function smokeSides(u) { return (sideLost(u, -1) ? 0 : 1) | (sideLost(u, 1) ? 0 : 2); }
  const _sv = new THREE.Vector3();
  // Hướng bắn (cùng quy ước bodyAngle): ống trên tháp bắn theo mũi tháp, ống trên nóc thân (xe trinh sát) theo mũi xe
  function smokeYaw(u) {
    const sp = TUBE_SPOT[u.tankType];
    const host = sp && sp.host === 'hull' ? null : u.turretGroup;
    if (host && host.getWorldDirection) {
      host.updateWorldMatrix(true, false);
      host.getWorldDirection(_sv);   // trục +z của tháp hướng ra đuôi -> mũi tháp là -z
      if (Math.hypot(_sv.x, _sv.z) > 1e-3) return Math.atan2(_sv.x, _sv.z);
    }
    return u.bodyAngle || 0;
  }
  // Miệng ống thứ k (bắn lần lượt từ ống trước ra sau) bên s của xe u, tọa độ thế giới
  function tubeMuzzle(u, s, k, a) {
    const sp = TUBE_SPOT[u.tankType];
    const host = sp && (sp.host === 'hull' ? u.chassisGroup : u.turretGroup);
    if (host && host.localToWorld && u.partRegistry && u.partRegistry[s < 0 ? 'smokeL' : 'smokeR']) {
      _sv.set(s * (sp.x + 0.6), sp.y + 0.7, sp.z + Math.min(k, smokeMax(u) - 1) * sp.dz - 0.3);
      host.updateWorldMatrix(true, false);
      host.localToWorld(_sv);
      return { x: _sv.x, y: _sv.y, z: _sv.z };
    }
    const rx = Math.cos(a), rz = -Math.sin(a);
    return { x: u.x + rx * s * 9, y: (u.y || 0) + 11, z: u.z + rz * s * 9 };
  }
  const soundOf = () => (typeof window !== 'undefined' && window.soundEngine) || null;

  /**
   * Một "bãi khói" độc lập: lựu đạn đang bay, viên phốt-pho đang cháy, các đám khói + vẽ hạt + chặn tầm nhìn.
   * Trận đấu dùng bãi chung (MAIN_SMOKE); phòng xem xe tự tạo bãi riêng để thử khói mà không lọt vào trận đang chơi.
   */
  function SmokeField() {
    const smokes = [], shots = [], pellets = [];
    const R = Math.random;
    function radius(s) {
      if (s.t < 0) return 0;
      const g = Math.min(1, s.t / 2.5), grow = 1 - (1 - g) * (1 - g);
      const fade = s.t > SMOKE_LIFE - SMOKE_FADE ? Math.max(0, (SMOKE_LIFE - s.t) / SMOKE_FADE) : 1;
      return SMOKE_R * (0.35 + 0.65 * grow) * (0.6 + 0.4 * fade);
    }
    // 1 loạt lựu đạn từ xe u (hoặc theo at = { x, z, a, m } nhận từ mạng: tâm giữa 2 điểm nổ, hướng bắn, bên bắn).
    // game (tùy chọn): để tính khoảng cách tới người chơi cho tiếng phóng; sides: bên bắn (mặc định mọi bên còn ống).
    // Trả về { x, z, a, m } để gửi mạng
    function deploy(u, at, game, sides) {
      const a = at ? at.a : smokeYaw(u);
      const m = (at ? at.m : sides || smokeSides(u)) || 3;
      const fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
      const fwd = SMOKE_RANGE * Math.cos(SMOKE_FAN), side = SMOKE_RANGE * Math.sin(SMOKE_FAN);
      const cx = at ? at.x : u.x + fx * fwd, cz = at ? at.z : u.z + fz * fwd;
      const T = u._smokeTube || (u._smokeTube = [0, 0]);
      let n = 0;
      for (const s of [-1, 1]) {
        if (!(m & (s < 0 ? 1 : 2))) continue;
        const p0 = tubeMuzzle(u, s, T[s < 0 ? 0 : 1]++ % smokeMax(u), a);
        shots.push({ x0: p0.x, y0: p0.y, z0: p0.z, x1: cx + rx * s * side, z1: cz + rz * s * side, y1: null,
          x: p0.x, y: p0.y, z: p0.z, dx: rx * s, dz: rz * s, fx, fz, t: n ? -0.09 - R() * 0.05 : 0, live: false, trail: 0, src: u });
        n++;
      }
      const S = soundOf();
      if (S && typeof S.playSmokeLaunch === 'function') {
        // nghe theo khoảng cách từ xe phóng tới người chơi (xe mình: 0)
        const me = game && game.player;
        const d = !me || me === u ? 0 : Math.max(1, Math.hypot(u.x - me.x, u.z - me.z));
        if (d < 2400) S.playSmokeLaunch(d, { x: u.x, z: u.z }, n);
      }
      return { x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10, a: Math.round(a * 1000) / 1000, m };
    }
    // Đường ngắm (x1,z1)-(x2,z2) xuyên qua đám khói dày
    function blocks(x1, z1, x2, z2) {
      if (!smokes.length) return false;
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
      for (const s of smokes) {
        if (s.t < 0.6 || s.t > SMOKE_LIFE - 1) continue;
        const r = radius(s);
        let k = ((s.x - x1) * dx + (s.z - z1) * dz) / L2;
        k = Math.max(0, Math.min(1, k));
        const px = x1 + dx * k - s.x, pz = z1 + dz * k - s.z;
        if (px * px + pz * pz < r * r * 0.8) return true;
      }
      return false;
    }

    // Miệng ống: chớp lửa liều phóng + phụt khói thuốc phóng xám
    function muzzleFx(g, L, F) {
      if (F) F.add({ x: g.x0, y: g.y0, z: g.z0, vx: 0, vy: 0, vz: 0, size: 3.2, grow: 14, life: 0.06, alpha: 1, fadeIn: 0.003, c0: [1, 0.9, 0.7], c1: [1, 0.5, 0.15], cell: 3, floor: false });
      if (!L) return;
      for (let i = 0; i < 6; i++) {
        const sp = 6 + R() * 10, gr = 0.5 + R() * 0.12;
        L.add({ x: g.x0, y: g.y0, z: g.z0, vx: (g.dx * 0.7 + g.fx * 0.4) * sp + (R() - 0.5) * 3, vy: sp * 0.6 + R() * 2, vz: (g.dz * 0.7 + g.fz * 0.4) * sp + (R() - 0.5) * 3,
          size: 1.6 + R() * 1.4, grow: 5, drag: 2.4, grav: -1, life: 1.2 + R() * 0.9, alpha: 0.6, fadeIn: 0.02, c0: [gr, gr, gr * 0.97], c1: [gr + 0.15, gr + 0.15, gr + 0.13], cell: 0, floor: false });
      }
    }
    // Lựu đạn nổ trên không: chớp sáng, bông khói phụt tròn, chùm viên phốt-pho cháy văng ra; đám khói bắt đầu nở
    function burst(g, L, F, ear) {
      const bx = g.x1, by = g.y1, bz = g.z1;
      smokes.push({ x: bx, z: bz, y: by - SMOKE_BURST_H, t: 0, acc: 0, team: g.src.team, src: g.src });
      const S = soundOf();
      if (S && typeof S.playSmokeBurst === 'function') {
        const o = ear || g.src, d = Math.max(1, Math.hypot(bx - o.x, bz - o.z));
        if (d < 2400) S.playSmokeBurst(d, { x: bx, z: bz });
      }
      if (F) F.add({ x: bx, y: by, z: bz, vx: 0, vy: 0, vz: 0, size: 7, grow: 40, life: 0.12, alpha: 1, fadeIn: 0.004, c0: [1, 0.97, 0.9], c1: [1, 0.6, 0.25], cell: 3, floor: false });
      if (L) for (let i = 0; i < 16; i++) {
        const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), sp = 26 + R() * 30;
        const ux = Math.sin(ph) * Math.cos(th), uy = Math.cos(ph) * 0.6, uz = Math.sin(ph) * Math.sin(th);
        L.add({ x: bx, y: by, z: bz, vx: ux * sp, vy: uy * sp + 2, vz: uz * sp, size: 6 + R() * 5, grow: 13, drag: 3, grav: -0.6, life: 4 + R() * 2.5, alpha: 0.95, fadeIn: 0.02, fadePow: 0.8,
          c0: [0.97, 0.97, 0.96], c1: [0.85, 0.85, 0.84], cell: 0, floor: false, ax: WIND_X, az: WIND_Z });
      }
      for (let i = 0; i < 7; i++) {
        const th = R() * Math.PI * 2, sp = 16 + R() * 22;
        pellets.push({ x: bx, y: by, z: bz, vx: Math.cos(th) * sp + g.fx * 6, vy: -4 + R() * 16, vz: Math.sin(th) * sp + g.fz * 6, t: 0, life: 2.4 + R() * 1.6, trail: 0, ground: false });
      }
    }
    // Đám khói nhả hạt theo 3 lớp: thảm sát đất (tối hơn — nằm trong bóng khối khói), thân tường khói, ngọn cuộn lên sáng hơn
    function emit(s, r, L, gy) {
      const band = R(), a = R() * Math.PI * 2, rr = Math.sqrt(R()) * r * (band < 0.4 ? 0.95 : 0.75);
      const ca = Math.cos(a), sa = Math.sin(a), x = s.x + ca * rr, z = s.z + sa * rr, g0 = gy(x, z, s.y);
      if (band < 0.4) {
        const c = 0.64 + R() * 0.06;
        L.add({ x, y: g0 + 3 + R() * 4, z, vx: ca * (2 + R() * 3), vy: 0.4 + R(), vz: sa * (2 + R() * 3), size: 24 + R() * 12, grow: 3.2, drag: 0.6, grav: -0.15,
          life: 7 + R() * 3, alpha: 0.92, fadeIn: 0.5, fadePow: 0.7, c0: [c, c, c * 0.98], c1: [c + 0.12, c + 0.12, c + 0.1], cell: 0, ax: WIND_X, az: WIND_Z });
      } else if (band < 0.85) {
        const c = 0.74 + R() * 0.06;
        L.add({ x, y: g0 + 8 + R() * 16, z, vx: ca * (1 + R() * 2), vy: 1 + R() * 2, vz: sa * (1 + R() * 2), size: 22 + R() * 10, grow: 4, drag: 0.7, grav: -0.5,
          life: 6.5 + R() * 3, alpha: 0.88, fadeIn: 0.4, fadePow: 0.75, c0: [c, c, c * 0.98], c1: [c + 0.1, c + 0.1, c + 0.08], cell: 0, floor: false, ax: WIND_X, az: WIND_Z });
      } else {
        const c = 0.84 + R() * 0.05;
        L.add({ x, y: g0 + 20 + R() * 12, z, vx: ca * R() * 2, vy: 2 + R() * 2.5, vz: sa * R() * 2, size: 18 + R() * 10, grow: 5, drag: 0.6, grav: -0.8,
          life: 5.5 + R() * 2.5, alpha: 0.78, fadeIn: 0.35, fadePow: 0.85, c0: [c, c, c * 0.99], c1: [c + 0.07, c + 0.07, c + 0.06], cell: 0, floor: false, ax: WIND_X, az: WIND_Z });
      }
    }
    // fx = ExplosionFX (lớp hạt riêng cho màn khói: fx.screen, chớp lửa: fx.fire) hoặc 1 lớp hạt; T = địa hình (độ cao mặt đất);
    // ear = { x, z } người nghe (tiếng lựu đạn nổ)
    function step(dt, fx, T, ear) {
      if (!smokes.length && !shots.length && !pellets.length) return;
      const L = fx ? (fx.screen || fx.smoke || (fx.add ? fx : null)) : null;
      const F = fx && fx.fire && fx.fire.add ? fx.fire : null;
      const gy = (x, z, d) => (T ? T.getElevationAt(x, z) : d);
      // lựu đạn đang bay: vòng cung từ miệng ống tới điểm nổ, ngòi chậm kéo vệt khói mảnh
      for (let i = shots.length - 1; i >= 0; i--) {
        const g = shots[i];
        g.t += dt;
        if (g.t < 0) continue;
        if (!g.live) { g.live = true; muzzleFx(g, L, F); }
        if (g.y1 === null) g.y1 = gy(g.x1, g.z1, g.y0 - 10) + SMOKE_BURST_H;
        const p = Math.min(1, g.t / SMOKE_FLIGHT);
        g.x = g.x0 + (g.x1 - g.x0) * p; g.z = g.z0 + (g.z1 - g.z0) * p;
        g.y = g.y0 + (g.y1 - g.y0) * p + 72 * p * (1 - p);
        if (L && (g.trail -= dt) <= 0) {
          g.trail = 0.018;
          const c = 0.7 + R() * 0.08;
          L.add({ x: g.x, y: g.y, z: g.z, vx: (R() - 0.5) * 1.2, vy: 0.4, vz: (R() - 0.5) * 1.2, size: 1.2 + R() * 0.8, grow: 2.6, drag: 1, grav: -0.5, life: 0.9 + R() * 0.6, alpha: 0.5, fadeIn: 0.03, c0: [c, c, c], c1: [c + 0.12, c + 0.12, c + 0.11], cell: 0, floor: false });
        }
        if (F) F.add({ x: g.x, y: g.y, z: g.z, vx: 0, vy: 0, vz: 0, size: 0.9, grow: 0, life: 0.05, alpha: 0.8, fadeIn: 0.005, c0: [1, 0.75, 0.45], cell: 3, floor: false });
        if (p >= 1) { burst(g, L, F, ear); shots.splice(i, 1); }
      }
      // viên phốt-pho đỏ: văng xòe, rơi xuống kéo vệt khói trắng ("con bạch tuộc"), nằm cháy âm ỉ trên đất tỏa khói
      for (let i = pellets.length - 1; i >= 0; i--) {
        const q = pellets[i];
        q.t += dt;
        if (q.t > q.life) { pellets.splice(i, 1); continue; }
        if (!q.ground) {
          const dr = Math.exp(-0.9 * dt);
          q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr - 34 * dt;
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          const g0 = gy(q.x, q.z, -1e9);
          if (q.y <= g0 + 0.5) { q.y = g0 + 0.5; q.ground = true; }
        }
        if (F) F.add({ x: q.x, y: q.y, z: q.z, vx: 0, vy: 0, vz: 0, size: q.ground ? 1.3 : 1.8, grow: 0, life: 0.05, alpha: 1, fadeIn: 0.005, c0: [1, 0.85, 0.6], c1: [1, 0.45, 0.15], cell: 3, floor: false });
        if (L && (q.trail -= dt) <= 0) {
          q.trail = q.ground ? 0.12 : 0.045;
          const c = 0.9 + R() * 0.06;
          L.add({ x: q.x, y: q.y, z: q.z, vx: (R() - 0.5) * 1.5, vy: q.ground ? 2 + R() * 2 : 0.5, vz: (R() - 0.5) * 1.5, size: q.ground ? 4 + R() * 2 : 2.4 + R(), grow: q.ground ? 5 : 4,
            drag: 0.8, grav: -0.8, life: 3 + R() * 1.8, alpha: 0.75, fadeIn: 0.04, c0: [c, c, c * 0.99], c1: [c - 0.08, c - 0.08, c - 0.09], cell: 0, floor: false, ax: WIND_X, az: WIND_Z });
        }
      }
      // đám khói: nở mạnh lúc đầu, nhả đều khi dựng tường, ngừng nhả trước khi tan để hạt kịp mờ hết
      const stop = SMOKE_LIFE - SMOKE_FADE - 2.5;
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.t += dt;
        if (s.t > SMOKE_LIFE) { smokes.splice(i, 1); continue; }
        if (!L || s.t < 0.15) continue;
        const rate = s.t < 2.5 ? 34 : s.t < stop ? 24 : 24 * Math.max(0, 1 - (s.t - stop) / 2);
        s.acc += rate * dt;
        const r = radius(s);
        while (s.acc >= 1) { s.acc -= 1; emit(s, r, L, gy); }
      }
    }
    return { deploy, blocks, step, radius, clear() { smokes.length = shots.length = pellets.length = 0; },
      get count() { return smokes.length + shots.length + pellets.length; }, LIFE: SMOKE_LIFE };
  }
  const MAIN_SMOKE = SmokeField();

  // Xe u đang bị địch khóa: tia laser đo xa / dẫn tên lửa đang chiếu vào, hoặc tên lửa dẫn đường đang bay tới
  function beingLocked(game, u) {
    if (!game || !u) return false;
    const now = Date.now();
    for (const v of game.units || []) {
      const L = v && !v.isDead && v.team !== u.team && v._lockOn;
      if (L && L.id === u.id && now - L.at < 3500) return true;
    }
    for (const s of (game.ballistics && game.ballistics.activeShells) || []) {
      if (s.guide && !s.guide.lost && s.guide.targetId === u.id && s.shooterTeam !== u.team) return true;
    }
    return false;
  }
  // Bị tên lửa khóa / tên lửa đang lao tới (xe máy điều khiển phản xạ phóng khói)
  function missileThreat(game, u) {
    const now = Date.now();
    for (const v of game.units || []) {
      const L = v && !v.isDead && v.team !== u.team && v._lockOn;
      if (L && L.m === 2 && L.id === u.id && now - L.at < 3500) return true;
    }
    for (const s of (game.ballistics && game.ballistics.activeShells) || []) {
      if (s.guide && !s.guide.lost && s.guide.targetId === u.id && Math.hypot(s.x - u.x, s.z - u.z) < 900) return true;
    }
    return false;
  }
  /**
   * Khói đa phổ che xe t: xe phe khác (team) không khóa được t (kính ngắm nhiệt / laser đo xa / đầu dò tên lửa đều mù).
   * Chỉ có khi t đang bị khóa lúc phóng khói; kéo dài tới khi khói gần tan.
   */
  function lockBlocked(t, team) {
    const c = t && t._smokeCloak;
    if (!c || t.isDead || t.team === team) return false;
    const now = performance.now();
    return now >= c.from && now < c.until;
  }

  /**
   * Phóng 1 loạt lựu đạn khói từ xe u: mỗi bên còn ống 1 quả (còn 1 quả: chỉ 1 bên), hoặc theo at nhận từ mạng.
   * Mỗi quả bắn ra trừ 1 vào u.smokeLeft (phần mua thêm được trừ kho tài khoản, xem ammoDelta). Xe đang bị khóa ->
   * khói đa phổ cắt khóa. Trả về { x, z, a, m, k } để gửi mạng; null = không phóng được (hết lựu đạn, hỏng cả 2 cụm
   * ống, chưa đủ nhịp giữa 2 loạt).
   */
  function deploySmoke(game, u, at) {
    if (!u || u.isDead) return null;
    let r, k;
    if (at) {
      r = MAIN_SMOKE.deploy(u, at, game);
      k = !!at.k;
    } else {
      const now = performance.now();
      let m = smokeSides(u);
      if (!(u.smokeLeft > 0) || !m || (u._smokeAt && now - u._smokeAt < SMOKE_GAP)) return null;
      if (m === 3 && u.smokeLeft < 2) m = 1;
      u._smokeAt = now;
      u.smokeLeft -= smokeCount(m);
      k = beingLocked(game, u);
      r = MAIN_SMOKE.deploy(u, null, game, m);
    }
    if (k) {
      const now = performance.now();
      u._smokeCloak = { from: now + CLOAK_FROM * 1000, until: now + CLOAK_UNTIL * 1000, told: 0 };
      r.k = 1;
    }
    return r;
  }
  // Số quả trong 1 loạt theo bên bắn (bit 1 trái, 2 phải)
  function smokeCount(m) { return (m & 1 ? 1 : 0) + (m & 2 ? 1 : 0); }
  // Đường ngắm (x1,z1)-(x2,z2) xuyên qua đám khói dày
  function smokeBlocks(x1, z1, x2, z2) { return MAIN_SMOKE.blocks(x1, z1, x2, z2); }
  function clearSmoke() { MAIN_SMOKE.clear(); }

  function update(dt, game) {
    // ăng-ten radar dò tìm quay tròn (~2.4 s một vòng)
    if (game && game.units) for (const u of game.units) {
      if (u.isDead) { if (u._eqJamLamp) u._eqJamLamp.emissiveIntensity = 0; continue; }
      if (u._eqRadarHead) u._eqRadarHead.rotation.y += dt * 2.6;
      if (u.roofRadarHead && !lost(u, 'sradar')) u.roofRadarHead.rotation.y += dt * 2.2;   // radar trên chân đế nóc tháp
      // máy gây nhiễu: 2 mắt phát hồng ngoại chớp theo chuỗi mã (cụm chớp nhanh xen quãng nghỉ), ánh đỏ mờ; hỏng thì tắt
      const L = u._eqJamLamp;
      if (L) {
        if (lost(u, 'jammerKit')) { L.emissiveIntensity = 0; u._eqJamLamp = null; continue; }
        const t = performance.now() * 0.001 + (u.id || 0) * 0.37, burst = Math.sin(t * 1.9) > -0.2 ? 1 : 0.15;
        L.emissiveIntensity = 0.06 + burst * Math.pow(Math.max(0, Math.sin(t * 31)), 6) * 0.9;
      }
    }
    // lưới lá: ẩn cành / lá trên nòng khi xe ở xa; xe đang bị ẩn (sương mù chiến tranh) vẫn cho lá rơi xong
    if (game && game.units) for (const u of game.units) {
      if (!u._camoLeaf) continue;
      const far = (u._lodD || 0) > 1400;
      if (u._camoFar !== far) { u._camoFar = far; for (const m of u._camoDetail || []) m.visible = !far && !m.userData.cfGone; }   // cfGone: cành đã cháy rụng (CamoFire)
      if (u._leafFx && u._leafFx.length && performance.now() - (u._camoT || 0) > 150) stepFoliage(u, dt);
    }
    // lưới lá bắt lửa / cháy lan (src/gameplay/camo_fire.js)
    if (game && game.units && window.CamoFire) CamoFire.update(dt, { units: game.units, fx: game.effectsManager && game.effectsManager.fx, game });
    if (!MAIN_SMOKE.count && !game) return;
    // khói: lựu đạn bay, nổ, đám khói nở & nhả hạt
    const fx = game && game.effectsManager && game.effectsManager.fx;
    MAIN_SMOKE.step(dt, fx, game && game.terrain, game && game.player);
    if (!game || !game.units) return;
    const now = performance.now();
    // khói đa phổ của xe mình: báo lúc bắt đầu cắt khóa và lúc khói tan
    const P = game.player, C = P && P._smokeCloak;
    if (C && !P.isDead && game.addCombatLog) {
      if (!C.told && now >= C.from) {
        C.told = 1;
        game.addCombatLog(`[[lock-off]] Khói đa phổ đã cắt tia khóa của địch — địch không khóa được xe bạn cho tới khi khói tan (~${Math.round((C.until - now) / 1000)} giây)`, 'tip');
      } else if (C.told === 1 && now >= C.until) {
        C.told = 2;
        game.addCombatLog('[[cloud]] Khói đã tan — địch khóa lại được xe bạn', 'alert');
      }
    }
    // lưới ngụy trang trên xe mình: chạy thì cành lá + lưới phần phật, xào xạc (nhanh dày hơn khi chạy nhanh)
    if (P && !P.isDead && has(P, 'camo') && !lost(P, 'camoKit') && !(window.CamoFire && CamoFire.status(P) === 'gone')) {
      const sp = Math.min(1.2, Math.abs(P.speed || 0) / (P.baseMaxSpeed || 120));
      const S = soundOf();
      if (sp > 0.1 && now >= (P._camoSndT || 0) && S && S.secondaryAt) {
        P._camoSndT = now + 220 + Math.random() * 480 * (1.3 - sp);
        S.secondaryAt('camoRustle', { x: P.x, z: P.z }, 0.35 + 0.65 * Math.min(1, sp));
      }
    }
    // xe do máy điều khiển (máy này có quyền): vừa trúng đạn & máu thấp -> phóng khói che rút lui;
    // bị tên lửa khóa / tên lửa đang lao tới -> phản xạ phóng khói cắt đường dẫn (có trễ, không phải lần nào cũng kịp)
    for (const u of game.units) {
      if (!u || u.isDead || u.isPlayer || u.isRemotePlayer || !(u.smokeLeft > 0)) continue;
      if (u._smokeAt && now - u._smokeAt < 6000) continue;
      let want = !!u._lastHitAt && now - u._lastHitAt <= 1200 && u.hp <= u.maxHp * 0.6;
      if (!want) {
        if (missileThreat(game, u)) {
          if (u._smokeReact === undefined) u._smokeReact = Math.random() < 0.65 ? now + 350 + Math.random() * 900 : Infinity;
          want = now >= u._smokeReact;
        } else u._smokeReact = undefined;
      }
      if (!want) continue;
      u._smokeReact = undefined;
      if (!triggerSmoke(game, u)) u._smokeAt = now;   // không phóng được (hỏng ống...): thôi thử lại liên tục
    }
  }
  // Phóng khói (xe của máy này) + báo các máy khác
  function triggerSmoke(game, u) {
    const r = deploySmoke(game, u, null);
    if (r && game && game.netSync && game.netSync.sendSmoke) game.netSync.sendSmoke(u, r);
    return r;
  }

  return Object.assign(API, {
    has, equip, refit, refitSteps, onRespawn, paidUsed, ammoDelta, startLife,
    armorMul, appliqueCovers, appliqueDamageMul, appliqueSplashMul, vshieldDeflectP, vshieldHeatMul, vshieldSplashMul, sandbagLeft, sandbagSplashMul, eraEffect, penMul, penLossMul, isTandem, splashMul, spallMul, slatDefeats, slatHit, slatSplash, roofCage, apsLeft, apsEngageP, apsEngage, apsMuzzle, camoHidden, camoFactor, camoRadarFactor, fireMul, burnDamageMul, extHitMul, extFireChance, extIgniteMul,
    deploySmoke, triggerSmoke, smokeBlocks, clearSmoke, SmokeField, smokeSides, smokeMax, smokeCount, lockBlocked, SMOKE_GAP, SMOKE_LIFE, update, buildVisuals, FIT,
    kitMats, foliageMats, foliageClump, apsPod, apsLauncher, radarMast, radarHead, RADAR_MAST_H,   // dùng lại ở trang render ảnh trang bị (equipment_thumbs.html)
    APS_CHARGES, outOfStockNote
  });
});
