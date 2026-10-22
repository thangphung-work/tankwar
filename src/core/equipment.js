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
  const START_SILVER = 3000;

  // ---------------------------------------------------------------------------
  // DANH MỤC
  // ---------------------------------------------------------------------------
  // speed / accel: hệ số nhân tốc độ tối đa / gia tốc (giáp nặng làm xe chậm đi)
  const MODULES = {
    era: {
      name: 'Giáp phản ứng nổ', icon: 'bolt', cat: 'armor', adv: true, price: 3200, tanks: ['ALL_ROUNDER', 'GATLING', 'SCOUT'], speed: 0.97,
      desc: 'Gạch nổ phủ mũi, sườn và tháp — khắc tinh của đạn nổ lõm. Trúng gạch: phá hủy hẳn RPG, bom con đạn chùm (không mất máu); tên lửa đầu nổ kép chỉ giảm 15%, đạn xuyên giáp giảm 40%. Đạn nổ phá 120mm (không phải nổ lõm) làm gạch nổ nhưng chỉ giảm 20%, lựu pháo 155mm giảm 15%. Đạn súng máy / 30mm không làm gạch nổ. Mảng gạch đã nổ thì mất.'
    },
    slat: {
      name: 'Giáp lồng chống RPG', icon: 'grid-dots', cat: 'armor', price: 1800, tanks: ['ALL_ROUNDER', 'GATLING', 'ARTILLERY'], speed: 0.98,
      desc: 'Lồng thép bắt bằng tay đỡ quanh sườn và đuôi xe (xe pháo: che cả cabin), thêm mái lồng trùm nóc chống UAV cảm tử bổ nhào. Trúng lồng: chặn hẳn ~6/10 RPG / UAV cảm tử, ~1/4 tên lửa, ~6/10 bom con đạn chùm, ~1/2 lựu đạn 40mm của súng phóng lựu (lọt qua còn 50%); đạn nổ phá còn 75% sát thương, đạn 30mm 70%, đạn cháy 60% và không làm xe bén lửa; đạn xuyên giáp xuyên qua. Nổ gần: mảnh văng -15%, ít thủng lốp / đứt xích / văng phụ kiện hơn một nửa, đạn cháy không bén vào vỏ.'
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
      desc: 'Radar + đạn đánh chặn trên nóc tháp tự bắn hạ RPG và tên lửa chống tăng bay tới (2 lần mỗi lần xuất kích). Radar bị bắn hỏng thì ngừng hoạt động.'
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
      desc: 'Cảm biến lửa + bình khí dập lửa trong khoang: dập lửa trên xe nhanh gấp 2,5 lần, cháy gây sát thương giảm một nửa. Đạn cháy: sát thương -20%, khó bén lửa hơn hẳn (còn ~40%), bén thì cháy ngắn hơn. Đạn xuyên giáp lọt vào khoang: dập ngay chớp lửa thuốc phóng / dầu -> sát thương -8% (trúng kho đạn -15%), ít bốc cháy hơn một nửa.'
    },
    radar: {
      name: 'Radar dò tìm', icon: 'radar-2', cat: 'gear', adv: true, price: 5000, tanks: ['ALL_ROUNDER', 'GATLING', 'ARTILLERY'],
      desc: 'Radar nhỏ trên nóc tháp quét quanh xe: bắt được xe địch trong bán kính ~75 m kể cả khi núp bụi, hiện chấm trên bản đồ. Xe trinh sát đã có radar riêng.'
    },
    jammer: {
      name: 'Máy gây nhiễu', icon: 'antenna-bars-off', cat: 'gear', adv: true, price: 5000, tanks: ALL,
      desc: 'Tổ hợp gây nhiễu quang - điện tử (kiểu Shtora): 2 đèn hồng ngoại nhấp nháy làm rối máy bám tên lửa của xe phóng + phát nhiễu radar. Đầu dò tên lửa địch mất gấp đôi thời gian mới khóa được bạn, tên lửa đang bay bị dẫn chập chờn (lắc ~3 m quanh xe, chỉ bám lại ở đoạn cuối), radar địch cứ 2 vòng quét mới bắt được bạn 1 lần. Không tác dụng với đạn pháo / đạn súng thường (không có dẫn hướng).'
    },
    // --- Ô NÓC THÁP xe tăng (1 món, chỗ phía nạp đạn): chọn [4] trong trận. Để trống = máy phá sóng (ROOF_DEFAULT) ---
    ewjam: {
      name: 'Máy phá sóng chống UAV', icon: 'drone-off', cat: 'roof', price: 0, tanks: ['ALL_ROUNDER'],
      desc: 'Mảng ăng-ten phát chùm định hướng trên bệ xoay. Phím [4], ngắm tâm kính vào drone rồi GIỮ Space: drone trong chùm (~950, hẹp ±15°) nhiễu hình rồi mất liên lạc, bị ép bay về; chiếu trúng xe có radar khóa mục tiêu thì radar đó mù vài giây. Pin phát ~12 s, sạc đầy ~30 s. Đang phát thì địch dò ra vị trí xe. Không bắn hạ được gì. Mặc định khi ô nóc để trống.'
    },
    rcws: {
      name: 'Trạm súng máy 7.62mm', icon: 'crosshair', cat: 'roof', price: 2200, tanks: ['ALL_ROUNDER'],
      desc: 'Súng máy điều khiển từ xa có camera ngày / nhiệt, quay độc lập với tháp. Phím [4], giữ Space xả ~11 phát/giây, dây 200 viên, thay hộp 5 s. Bắn rơi drone (~7 phát trúng), quét xe giáp mỏng / phụ kiện ngoài; gần như vô hại với xe tăng. Chọn xong tự ngóc lên trời phòng không, nhấp vào drone để khóa & đón đầu.'
    },
    agl: {
      name: 'Súng phóng lựu tự động 40mm', icon: 'bomb', cat: 'roof', adv: true, price: 3400, tanks: ['ALL_ROUNDER', 'GATLING'],
      desc: 'Súng phóng lựu liên thanh trên bệ điều khiển từ xa. Phím [4], giữ Space bắn ~5 quả/giây theo đường cầu vồng thấp (tầm ~1.500), dây 32 quả, thay hộp 7 s. Mỗi quả nổ mảnh bán kính nhỏ: phá xe giáp mỏng, xe đứng sau vật cản thấp, làm hỏng phụ kiện ngoài; yếu với giáp xe tăng.'
    },
    rocket: {
      name: 'Giàn rocket 4 ống', icon: 'rocket', cat: 'roof', adv: true, price: 3800, tanks: ['ALL_ROUNDER'],
      desc: 'Hộp 4 ống rocket không điều khiển đầu nổ lõm gắn trên bệ xoay. Phím [4], bấm Space phóng 1 quả về chỗ đang ngắm; hết 4 quả nạp lại cả hộp ~20 s. Xuyên giáp tốt như RPG, bay chậm hơn đạn pháo nên khó trúng xa; hệ thống đánh chặn chủ động của địch bắn hạ được.'
    },
    // --- Ô NÓC THÁP xe 6 nòng (chân đế mô-đun sau nắp tháp; để trống = không mang gì) ---
    sradar: {
      name: 'Radar dò tìm trên chân đế', icon: 'radar-2', cat: 'roof', adv: true, price: 4200, tanks: ['GATLING'],
      desc: 'Ăng-ten mảng quay tròn trên chân đế nóc tháp, tác dụng như Radar dò tìm (nhóm PHỤ KIỆN) mà không chiếm ô phụ kiện: bắt được xe địch trong bán kính ~75 m kể cả khi núp bụi, báo vị trí cho đồng đội. Bị bắn văng thì mất radar.'
    },
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
      name: 'Khiên giáp chữ V', icon: 'shield-chevron', cat: 'front', adv: true, price: 3600, tanks: ['GATLING'], speed: 0.93, accel: 0.9,
      desc: 'Hai tấm thép dày ghép mũi nhọn trước mũi xe, tay đỡ bắt vào thân: giáp mặt trước dày thêm ~40%, đạn bắn thẳng dễ trượt / nảy, mảnh nổ trước mũi giảm mạnh. Tấm bị bắn mòn dần rồi bung. Nặng: tốc độ -7%, tăng tốc -10%. Mất khả năng đào ụ đất.'
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
      desc: 'Giàn 8 ống rocket không điều khiển đầu nổ lõm trên chân đế mô-đun thay súng máy: giữ Space phóng lần lượt (~1 quả / 0,6 s), hết giàn nạp lại ~25 s. Xuyên giáp như RPG — đủ đánh sườn / đuôi xe tăng; bay chậm, khó trúng xa.'
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
      desc: 'Đạn bay lảng vảng cánh gập phóng từ ống trên chân đế mô-đun (thay drone trinh sát). Ctrl phóng, bay như drone, Space để bổ nhào vào điểm giữa màn hình / xe đang khóa: trúng nóc là hạ hoặc gần hạ cả xe tăng. Mỗi drone dùng 1 lần (vật tư UAV cảm tử). Mất drone trinh sát: pháo chỉ bắn được trong tầm nhìn thẳng.'
    }
  };
  // Ô 1 món để trống: xe mang món mặc định của ô đó (như trước khi có ô): xe tăng — máy phá sóng, xe 6 nòng — lưỡi ủi,
  // xe trinh sát — súng máy 12.7mm, lựu pháo — UAV trinh sát. Xe 6 nòng để trống nóc tháp = không mang gì
  const SLOT_DEFAULT = { roof: { ALL_ROUNDER: 'ewjam' }, front: { GATLING: 'dozer' }, weapon: { SCOUT: 'hmg' }, uav: { ARTILLERY: 'recon' },
    engine: { ALL_ROUNDER: 'stock', GATLING: 'stock', ARTILLERY: 'stock', SCOUT: 'stock' } };
  // Món đã thôi bán: máy chủ hoàn Bạc cho ai đã mua (server_accounts.js) — 'turbo' (tăng áp +8%) thay bằng ô ĐỘNG CƠ
  // giá trị: số = thôi bán cho mọi xe; { price, tanks } = chỉ thôi bán cho các xe đó (giáp lồng bỏ khỏi xe trinh sát)
  const RETIRED_ITEMS = { turbo: 3000, slat: { price: 1800, tanks: ['SCOUT'] } };
  const ROOF_DEFAULT = SLOT_DEFAULT.roof;
  // Nhóm trong bảng chọn trang bị & số ô tối đa mỗi nhóm (đạn cao cấp không chiếm ô)
  const catSize = (c) => Object.keys(MODULES).filter(id => MODULES[id].cat === c).length;
  const CATS = {
    armor: { name: 'GIÁP', icon: 'shield-half-filled', slots: UNLIMITED_SLOTS ? catSize('armor') : 2 },
    ammo: { name: 'ĐẠN', icon: 'rocket', slots: 0 },
    gear: { name: 'PHỤ KIỆN', icon: 'cpu', slots: UNLIMITED_SLOTS ? catSize('gear') : 2 },
    roof: { name: 'NÓC THÁP', icon: 'arrow-bar-to-up', slots: 1 },   // chỉ 1 bệ gắn trên nóc, kể cả khi mở hết ô
    front: { name: 'MŨI XE', icon: 'shield-chevron', slots: 1 },
    weapon: { name: 'VŨ KHÍ CHÍNH', icon: 'crosshair', slots: 1 },
    uav: { name: 'UAV', icon: 'drone', slots: 1 },
    engine: { name: 'ĐỘNG CƠ', icon: 'engine', slots: 1 }
  };
  // Nhóm 1 bệ gắn (chọn món khác là thay món cũ): nóc tháp, mũi xe, vũ khí chính, UAV, động cơ
  const MOUNT_CATS = ['roof', 'front', 'weapon', 'uav', 'engine'];
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
    ap_du: { tank: 'ALL_ROUNDER', cat: 'ammo', adv: true, ammo: 'AP', name: 'Đạn xuyên lõi hợp kim nặng', icon: 'arrow-big-right-lines', price: 4500, pen: 1.22, loss: 0.6, desc: 'Đạn xuyên giáp xuyên sâu hơn 22%, mũi tên dài & nặng hơn nên giữ tốc độ tốt: bắn xa chỉ mất ~60% sức xuyên so với đạn thường.' },
    heat_tandem: { tank: 'ALL_ROUNDER', cat: 'ammo', adv: true, ammo: 'NORMAL', name: 'Đạn nổ lõm 2 tầng', icon: 'flame', price: 3500, pen: 1.1, tandem: true, splash: 0.6, desc: 'Thay đạn nổ phá thường bằng đạn nổ lõm có đầu nổ mồi: xuyên ~530mm, phá gạch giáp nổ trước. Đổi lại sức ép / mảnh nổ lan yếu hơn đạn nổ phá (~60%).' },
    apds30: { tank: 'GATLING', cat: 'ammo', adv: true, ammo: 'GATLING_BULLET', name: 'Đạn 30mm xuyên dưới cỡ', icon: 'arrow-big-right-lines', price: 3800, pen: 1.36, splash: 0, desc: 'Đạn 30mm lõi tungsten: xuyên sâu hơn 36%, đục thủng sườn xe tăng nhanh hơn. Lõi đặc không có thuốc nổ: hết mảnh nổ lan khi bắn trượt sát xe.' },
    // ammo: khóa riêng (không thay đạn nổ - mảnh / xuyên dưới cỡ đã mua): chỉ thêm ngòi lập trình cho đạn 30mm thường
    ahead30: { tank: 'GATLING', cat: 'ammo', adv: true, ammo: 'GATLING_ABM', name: 'Đạn 30mm nổ trên không', icon: 'drone-off', price: 4200, desc: 'Ngòi lập trình theo cự ly radar đo được: khi khóa drone, mỗi viên tự nổ ngay trước drone, phóng chùm bi vonfram hình nón — bắn drone hiệu quả hơn hẳn. Cần radar phòng không còn hoạt động; bắn xe như đạn thường.' },
    // tên lửa tấn công đỉnh (kiểu Javelin): vồng cao rồi bổ nhào trúng nóc xe — ballistics.guideMissile đọc .top
    topatk: { tank: 'SCOUT', cat: 'ammo', adv: true, ammo: 'ANTI_TANK_MISSILE', top: true, name: 'Tên lửa chống tăng tấn công đỉnh', icon: 'arrow-big-down-lines', price: 7500, desc: 'Thay tên lửa chống tăng thường bằng loại tấn công đỉnh (bắn-và-quên kiểu Javelin): ống phóng có khối ngắm nhiệt CLU, tên lửa vồng lên cao rồi bổ nhào gần thẳng đứng xuống NÓC xe — nơi giáp mỏng nhất, gần như chắc hạ xe tăng. Bắn được qua vật cản thấp; bay lâu hơn nên địch có thời gian né / thả khói.' },
    slap127: { tank: 'SCOUT', cat: 'ammo', adv: true, ammo: 'SCOUT_BULLET', name: 'Đạn 12.7mm SLAP', icon: 'arrow-big-right-lines', price: 2600, pen: 1.6, desc: 'Đạn 12.7mm xuyên dưới cỡ có đai nhựa: xuyên sâu gấp 1,6 lần.' },
    he_frag: { tank: 'ARTILLERY', cat: 'ammo', adv: true, ammo: 'HE', name: 'Lựu đạn mảnh định sẵn', icon: 'atom-2', price: 3500, splash: 1.15, desc: 'Vỏ đạn 155mm khía rãnh tạo mảnh đều: sát thương nổ lan +15%.' }
  };

  // VẬT TƯ TIÊU HAO (đạn đặc chủng + lựu đạn khói): giá 1 viên (Bạc), bán theo gói `pack` viên, tối đa `max` viên mang
  // theo mỗi lần xuất kích, `ad` = số viên nhận được khi xem 1 quảng cáo tiếp tế.
  // CÂN BẰNG (2026-10): mang đủ 1 lần xuất kích tốn ~250–400 Bạc; trận 10 phút xài vừa phải ~300–500, xài hết cỡ ~600–900,
  // trong khi 1 trận kiếm ~800 (thua) – 1.500 (thắng) – 2.500 (xuất sắc) -> chơi đều tay vẫn dư ~40–60% để dành mở khóa
  // trang bị (3–6 trận / món), động cơ (10–25 trận), sửa giáp (~100–400 / trận bị đánh nhiều). Quảng cáo tiếp tế vẫn có.
  // gear: chỉ nạp khi xe có lắp mô-đun đó (lựu đạn khói cần Ống phóng lựu khói).
  // Lựu đạn khói: mỗi ống phóng chứa 1 quả -> mang tối đa = tổng số ống 2 bên (SMOKE_TUBES), 1 loạt = mỗi bên 1 quả
  const SMOKE_TUBES = { ALL_ROUNDER: 4, GATLING: 3, ARTILLERY: 3, SCOUT: 3 };
  const smokeItem = (tank) => ({ name: 'Lựu đạn khói', price: 15, pack: 2, max: 2 * SMOKE_TUBES[tank], ad: 4, gear: 'smoke' });
  const AMMO_SHOP = {
    ALL_ROUNDER: { AP: { name: 'Đạn xuyên giáp', price: 30, pack: 5, max: 6, ad: 5 }, HE: { name: 'Đạn nổ mạnh', price: 20, pack: 5, max: 6, ad: 6 }, SMOKE: smokeItem('ALL_ROUNDER') },
    ARTILLERY: { HE: { name: 'Lựu đạn nổ mạnh 155', price: 25, pack: 5, max: 6, ad: 5 }, CLUSTER: { name: 'Đạn chùm 155', price: 45, pack: 2, max: 4, ad: 3 }, KAMIKAZE: { name: 'UAV cảm tử', price: 150, pack: 1, max: 2, ad: 1, gear: 'kami' } },
    GATLING: { INCENDIARY: { name: 'Đạn cháy 30mm', price: 2, pack: 50, max: 150, ad: 75 }, SMOKE: smokeItem('GATLING') },
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
  const AD = { DAILY: 20, BONUS: 20, BONUS_MUL: 0.5, MIN_SEC: 5, COOLDOWN_SEC: 45, MOCK_SEC: 15 };
  const adAmmoN = (A, used) => used < AD.DAILY ? A.ad : Math.max(1, Math.ceil(A.ad * AD.BONUS_MUL));
  /** Số quảng cáo phải xem để mở khóa 1 món nâng cao cho 1 xe (~1 quảng cáo / 1.500 Bạc giá trị) */
  function adsToUnlock(id) {
    const it = MODULES[id] || PREMIUM[id];
    if (it && it.noAd) return 0;   // động cơ: chỉ mua bằng Bạc
    return it ? Math.max(1, Math.round((it.price || 0) / 1500)) : 0;
  }
  // Đạn đặc chủng miễn phí mỗi lần xuất kích: KHÔNG CÒN — ngoài đạn chính (không giới hạn), mọi loại đạn khác phải
  // mua bằng Bạc (đạn đã mua tự mang theo tới mức tối đa mỗi lần xuất kích). Giữ đủ khóa để startLife đặt lại số đạn.
  // Đạn miễn phí mỗi lần xuất kích (cộng thêm số mua): xe trinh sát luôn có 2 tên lửa để còn đánh được xe giáp;
  // xe tăng đa dụng luôn có 2 đạn xuyên giáp + 2 đạn nổ mạnh + 2 lựu đạn khói (đổi loại đạn theo mục tiêu là sở trường)
  const BASE_AMMO = { ALL_ROUNDER: { AP: 2, HE: 2, SMOKE: 2 }, ARTILLERY: { HE: 0, CLUSTER: 0, KAMIKAZE: 1 }, GATLING: { INCENDIARY: 0, SMOKE: 0 }, SCOUT: { INCENDIARY: 0, ANTI_TANK_MISSILE: 2, SMOKE: 0 } };
  // Xe do máy điều khiển không mua sắm: mang cơ số như trước khi có cửa hàng để trận không dễ đi
  const BOT_AMMO = { ALL_ROUNDER: { AP: 1, HE: 1, SMOKE: 6 }, ARTILLERY: { HE: 4, CLUSTER: 3, KAMIKAZE: 0 }, GATLING: { INCENDIARY: 80, SMOKE: 6 }, SCOUT: { INCENDIARY: 45, ANTI_TANK_MISSILE: 1, SMOKE: 6 } };   // + đạn miễn phí (BASE_AMMO): trinh sát 3 tên lửa (tối đa 3), xe tăng 3 AP / 3 HE / 8 khói
  const AMMO_PROP = { AP: 'apAmmoCount', HE: 'heAmmoCount', CLUSTER: 'clusterAmmoCount', INCENDIARY: 'incendiaryAmmoCount', RPG: 'rpgAmmoCount', ANTI_TANK_MISSILE: 'missileAmmoCount', SMOKE: 'smokeLeft', KAMIKAZE: 'kamikazeCount' };

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
  // Món giáp hỏng giữ sang trận sau & khóa đơn vị hợp lệ (vehicle_damage.js ARMOR_ITEM_TAGS)
  const ARMOR_REPAIR = { era: 'gạch', applique: 'tấm', vshield: 'khối', slat: 'tấm lồng', aps: 'bệ phóng' };
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
  /** Giá sửa 1 đơn vị giáp: trọn món vỡ hết ≈ 30% giá mua, tối thiểu 15 Bạc / đơn vị */
  function repairUnitPrice(item, total) {
    const p = (MODULES[item] && MODULES[item].price) || 0;
    return Math.max(15, Math.round(p * 0.3 / Math.max(1, total || 1)));
  }

  // Xe do máy điều khiển: 2-4 mô-đun ngẫu nhiên theo hạt giống chung (mọi máy trong phòng ra cùng kết quả),
  // cùng giới hạn ô như người chơi -> trang bị bot ngang ngửa người chơi
  function botKit(tank, rnd) {
    const pool = Object.keys(MODULES).filter(id => compatible(id, tank) && id !== 'aps' && id !== 'kami' && MODULES[id].cat !== 'engine');   // bot không lái UAV cảm tử
    const n = 2 + Math.floor(rnd() * 3);
    const m = [];
    while (m.length < n && pool.length) {
      const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const c = MODULES[id].cat;
      if (m.filter(x => MODULES[x].cat === c).length < ((CATS[c] && CATS[c].slots) || 0)) m.push(id);
    }
    // động cơ: bot thường có máy tăng áp, ít bot có máy xịn nhất
    const er = rnd();
    const top = tank === 'SCOUT' || tank === 'ARTILLERY' ? 'hybrid' : 'turbine';
    const eng = er < 0.25 ? null : er < 0.7 ? 'tdiesel' : er < 0.9 ? 'twinturbo' : top;
    if (eng && compatible(eng, tank)) m.push(eng);
    return { m, p: [], a: Object.assign({}, BOT_AMMO[tank] || {}) };
  }

  // Bạc nhận được sau trận (máy chủ tính)
  function silverFor(result, kills, damage, durSec) {
    // 400 cơ bản + thắng 400 / hòa 200 + 120 / hạ + 40 / máu gây ra + 20 / phút trận (tối đa 15 phút)
    return Math.round(400 + (result === 'win' ? 400 : result === 'draw' ? 200 : 0) + kills * 120 + damage * 40 + Math.min(durSec, 900) / 3);
  }

  // Thưởng top 3 hạ gục / bị hạ (K/D) cả trận, cộng thêm vào thưởng trận: [hạng 1, hạng 2, hạng 3]
  const KD_BONUS = [{ xp: 120, silver: 800 }, { xp: 80, silver: 500 }, { xp: 50, silver: 300 }];
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

  const API = { TANKS, ALL_FREE, UNLIMITED_SLOTS, SLOTS, CATS, EQ_RADAR_RANGE, START_SILVER, MODULES, PREMIUM, AMMO_SHOP, RETIRED_AMMO, RETIRED_ITEMS, SMOKE_TUBES, BUILTIN, builtin, BASE_AMMO, BOT_AMMO, AMMO_PROP, KD_BONUS, AD, adAmmoN, adsToUnlock, compatible, isFree, catOf, priceOf, sanitize, botKit, silverFor, rankKD, ROOF_DEFAULT, SLOT_DEFAULT, MOUNT_CATS, roofOf, slotOf, ARMOR_REPAIR, sanitizeGone, repairUnitPrice, noteArmor };
  if (typeof window === 'undefined' || typeof THREE === 'undefined') return API;

  // ===========================================================================
  // PHẦN TRONG TRẬN (TRÌNH DUYỆT)
  // ===========================================================================
  // radar dò tìm trên chân đế nóc tháp (sradar) có tác dụng như radar phụ kiện (khi chưa bị bắn văng)
  const has = (u, id) => !!(u && ((u.kit && u.kit.m && (u.kit.m.indexOf(id) >= 0 || (id === 'radar' && u.kit.m.indexOf('sradar') >= 0 && !lost(u, 'sradar')))) || builtin(u.tankType, id)));
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
    try { buildVisuals(u); } catch (e) { console.warn('[EQ] Không gắn được hình trang bị', e); }
    // Ô 1 bệ (nóc tháp / mũi xe / vũ khí chính / UAV): mô hình xe dựng sẵn món mặc định, bộ đồ chọn món khác thì thay
    // (u.mountRoof / mountFront / mountWeapon / mountUav do file mô hình xe cung cấp; 'none' = gỡ trống)
    for (const c of MOUNT_CATS) {
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
    return k;
  }
  // Khiên giáp chữ V trước mũi xe 6 nòng (ô MŨI XE): còn ít nhất một tấm thì che mặt trước thân xe
  function vshieldUp(u) { return has(u, 'vshield') && !(lost(u, 'appliqueVSL') && lost(u, 'appliqueVSR')); }
  // ngoài độ dày: tấm thép xiên chữ V làm đạn nhỏ vỡ / nảy, hứng mảnh & sức nổ phía trước
  const VSHIELD_DIRECT = { small: 0.35, cannon: 0.55, blast: 0.6, kinetic: 0.9, heat: 0.9 };
  // Ngoài độ dày, tấm giáp còn hấp thụ: đạn súng máy / 30mm vỡ vụn trên lớp gốm, sức nổ & mảnh của đạn nổ phá dồn
  // vào tấm ngoài. Đạn xuyên giáp & nổ lõm chỉ bị cản bằng độ dày (đã tính ở armorMul)
  const APPLIQUE_DIRECT = { small: 0.4, cannon: 0.6, blast: 0.7, kinetic: 1, heat: 1 };
  const APPLIQUE_SPLASH = { small: 0.6, cannon: 0.6, blast: 0.85, kinetic: 0.85, heat: 0.85 };
  function appliqueDamageMul(u, face, onTurret, cls) {
    const k = appliqueCovers(u, face, onTurret) ? (APPLIQUE_DIRECT[cls] || 1) : 1;
    return !onTurret && face === 'front' && vshieldUp(u) ? k * (VSHIELD_DIRECT[cls] || 1) : k;
  }
  function appliqueSplashMul(u, cls) {
    return has(u, 'applique') ? (APPLIQUE_SPLASH[cls] || 1) : 1;
  }
  // Giáp phản ứng nổ (gạch mua thêm, gạch có sẵn trên xe, giáp nổ nhặt ở thùng tiếp tế) khi bị trúng thẳng:
  //  - đạn súng máy / 30mm / đạn cháy: gạch được thiết kế KHÔNG kích nổ với đạn nhỏ -> không tác dụng, không mất
  //  - RPG, bom con, đạn chùm (đầu nổ lõm): gạch kích nổ, tấm thép văng ra cắt đứt luồng kim loại -> 0 sát thương
  //  - tên lửa đầu nổ kép / đạn nổ lõm 2 tầng: đầu mồi kích nổ gạch, đầu chính vẫn xuyên -> còn 85%
  //  - đạn xuyên giáp mũi tên: tấm thép văng chém lệch / gãy mũi tên -> còn 60%
  //  - đạn nổ phá 120mm: không có luồng kim loại để cắt -> gạch nổ theo nhưng chỉ đỡ chút sức ép / mảnh -> còn 80%
  //  - lựu pháo 155mm: sức nổ quá lớn, gạch gần như vô dụng -> còn 85%
  // Trả { trigger: gạch có kích nổ (và mất) không, mul: phần sát thương còn lại }
  function eraEffect(ammo, heavy, shooter) {
    if (ammo === 'SCOUT_BULLET' || ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY') return { trigger: false, mul: 1, why: 'small' };
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
    ANTI_TANK_MISSILE: { defeat: 0.25, mul: 1 },
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
  // Hệ thống đánh chặn: còn lượt + radar chưa bị bắn hỏng
  function apsLeft(u) {
    if (!has(u, 'aps') || lost(u, 'apsKit')) return 0;
    return Math.max(0, APS_CHARGES - ((u.dmg && u.dmg.apsUsed) || 0));
  }
  function apsTry(u, ammo) {
    if (ammo !== 'RPG' && ammo !== 'ANTI_TANK_MISSILE') return false;
    if (apsLeft(u) <= 0) return false;
    const d = (typeof VehicleDamage !== 'undefined') ? VehicleDamage.state(u) : (u.dmg || (u.dmg = {}));
    d.apsUsed = (d.apsUsed || 0) + 1;
    return Math.random() < 0.85;
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
  // / dầu thủy lực trước khi lan, bớt chút sát thương (trúng kho đạn đỡ nhiều hơn)
  function extHitMul(u, ammo, ap, zone) {
    if (!has(u, 'fireext')) return 1;
    if (ammo === 'INCENDIARY') return 0.8;
    if (ap) return zone === 'ammo' ? 0.85 : 0.92;
    return 1;
  }
  // Hệ số xác suất bén lửa khi trúng: cls = lớp đạn (vehicle_damage ammoClass)
  function extFireChance(u, ammo, cls) {
    if (!has(u, 'fireext')) return 1;
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
  // Chỗ trống trên nóc để gắn radar dò tìm / máy gây nhiễu [x, z] (tránh nắp, kính, ăng-ten, tấm nhận diện)
  const ROOF_SPOT = { ALL_ROUNDER: { radar: [-3.0, 16.0], jam: [3.2, 16.0] }, GATLING: { radar: [-4.5, 9.6], jam: [4.6, 10.8] }, ARTILLERY: { radar: [-2.8, 12.9], jam: [-7.0, 2.0] }, SCOUT: { jam: [3.4, 12.8] } };
  // Bình chữa cháy gắn ngoài (bình đỏ trên giá kẹp): [x, y đáy, z, trục ('y' đứng | 'z' nằm dọc xe), hướng mặt giá (pháp tuyến tấm đỡ)]
  const EXT_SPOT = {
    ALL_ROUNDER: [[-9.0, 7.6, 30.9, 'y', [0, 0, -1]], [9.0, 7.6, 30.9, 'y', [0, 0, -1]]],
    GATLING: [[-11.2, 14.2, 25.5, 'z', [0, -1, 0]], [11.2, 14.2, 25.5, 'z', [0, -1, 0]]],
    ARTILLERY: [[-8.8, 12.4, -9.6, 'y', [0, 0, -1]], [8.6, 12.4, -9.4, 'y', [0, 0, -1]]],
    SCOUT: [[-1.7, 11.0, 18.45, 'y', [0, 0, -1]]]
  };
  const matCache = {};
  function kitMats(team) {
    const key = team === 'RED' ? 'RED' : 'BLUE';
    if (matCache[key]) return matCache[key];
    const K = window.VehicleKit;
    const M = K ? K.createMaterials(key) : {};
    const net = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x4d5a34 : 0x9a8659, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const net2 = new THREE.MeshStandardMaterial({ color: key === 'BLUE' ? 0x36402a : 0x7d6a45, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const era = M.paint || new THREE.MeshStandardMaterial({ color: 0x5c6450, roughness: 0.8, metalness: 0.2 });
    const steel = M.dark || new THREE.MeshStandardMaterial({ color: 0x2b2c27, roughness: 0.7, metalness: 0.4 });
    const sensor = new THREE.MeshStandardMaterial({ color: 0x2e3228, roughness: 0.5, metalness: 0.4, emissive: 0x0b1f14, emissiveIntensity: 0.4 });
    const ext = new THREE.MeshStandardMaterial({ color: 0x9a2219, roughness: 0.45, metalness: 0.25 });
    return (matCache[key] = { era, plate: era, steel, net, net2, sensor, ext, rubber: M.rubber || steel, metal: M.steel || steel });
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
  const CAGE_PLAN = {
    ALL_ROUNDER: { hull: { y0: 5.0, y1: 14.5, sides: true, rear: true, deck: true }, tur: { sides: true, rear: true, roof: true, front: 0.32 } },
    // Hailstorm có sẵn lồng đuôi + 2 cánh lồng sau trên mô hình
    GATLING: { hull: { y0: 4.6, y1: 15.5, sides: true, rear: false, deck: true }, tur: { sides: true, rear: true, roof: true, front: 0.3 } },
    // xe pháo: đuôi xe để trống cho lưỡi càng; mũi cabin che dưới kính
    ARTILLERY: { hull: { y0: 6.6, y1: 23, sides: true, rear: false, front: [10.7, 15.2], deck: false }, tur: { sides: true, rear: true, roof: true, front: 0.25 } },
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
    const rc = new THREE.Raycaster(), O = new THREE.Vector3(), E = new THREE.Vector3();
    return (o, d) => {
      host.localToWorld(O.set(o[0], o[1], o[2]));
      host.localToWorld(E.set(o[0] + d[0], o[1] + d[1], o[2] + d[2]));
      rc.set(O, E.sub(O).normalize()); rc.far = 400;
      const h = rc.intersectObjects(meshes, false);
      return h.length ? host.worldToLocal(h[0].point.clone()) : null;
    };
  }

  const median = (v) => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
  const nearest = (arr, key, val) => arr.reduce((q, w) => Math.abs(w[key] - val) < Math.abs(q[key] - val) ? w : q);

  // Tấm lồng đứng. f = { axis: 'x' (mặt sườn, chạy dọc z) | 'z' (mặt mũi / đuôi, chạy ngang x), s: ±1 hướng ra ngoài,
  // a0, a1, y0, y1, extra (bề dày giáp gắn thêm phải chừa), keep(a, y, c) -> false nếu ô lọt vào vòng quay tháp }
  function cageWall(b, M, cast, f) {
    const st = M.steel, X = f.axis === 'x', s = f.s, gap = CAGE_GAP + (f.extra || 0);
    const pos = (a, y, c) => X ? [s * c, y, a] : [a, y, s * c];
    const box = (along, h, nrm, p) => X ? b.box(nrm, h, along, st, p) : b.box(along, h, nrm, st, p);
    const DA = 1.2, DY = 0.7, cols = [];
    for (let a = f.a0; a <= f.a1 + 1e-6; a += DA) {
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
        if (seg.length > 1) panel(seg, rLo, rHi);
      }
    }
    function panel(seg, pLo, pHi) {
      const plane = Math.max(...seg.map(c => c.base)) + gap;
      // phụ kiện nhô qua mặt lồng / ô lọt vào vòng quay tháp -> khoét
      const blocked = (c, y) => c.cells.some(e => e.v !== null && e.v > plane - 0.45 && Math.abs(e.y - y) < DY * 0.9)
        || (f.keep && !f.keep(c.a, y, plane));
      // nan dẹt (bản rộng theo pháp tuyến) cách ~1,2, mép theo đường viền thân, cắt khúc quanh chỗ khoét
      const tops = [];
      for (const c of seg) {
        const lo = pLo, hi = pHi;
        let start = null;
        for (let y = lo; y <= hi + 1e-6; y += DY / 2) {
          const bad = blocked(c, y);
          if (!bad && start === null) start = y;
          if (bad && start !== null) { if (y - start > 0.6) box(0.16, y - start, 0.6, pos(c.a, (start + y) / 2, plane)); start = null; }
        }
        if (start !== null && hi - start > 0.6) box(0.16, hi - start, 0.6, pos(c.a, (start + hi) / 2, plane));
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
      for (const c of [seg[0], seg[seg.length - 1]]) if (!blocked(c, (pLo + pHi) / 2)) box(0.36, pHi - pLo + 0.1, 0.36, pos(c.a, (pLo + pHi) / 2, plane));
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
    }
  }

  // Mái lồng nằm ngang (nóc tháp / nóc thân / sàn máy) — khung chữ nhật gọn kiểu lồng chống UAV thật:
  // quét tia từ trên xuống tìm mặt nóc phẳng (độ cao phổ biến), lấy hình chữ nhật lớn nhất nằm gọn trên mặt đó, cách nóc
  // ~0,2 m. Khung viền thép hộp, nan dẹt chạy ngang đều 1 đơn vị, 2 thanh dọc đỡ; chỗ nhô lên (kính ngắm, nắp, ăng-ten),
  // bệ vũ khí (holes) và vùng keep() = false thành ô vuông khoét có viền. Chân chống thẳng ở góc + giữa cạnh dài
  function cageRoof(b, M, cast, x0, x1, z0, z1, holes, keep) {
    const st = M.steel, D = 0.5, G = [];
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
    const ref = median(all.filter(y => y >= median(all))), yt = ref + 1.7;
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
    // khung viền
    for (const z of [Z0, Z1]) for (const [a, c] of pieces(X0, X1, z, true)) b.box(c - a + 0.3, 0.3, 0.3, st, [(a + c) / 2, yt, z]);
    for (const x of [X0, X1]) for (const [a, c] of pieces(Z0, Z1, x, false)) b.box(0.3, 0.3, c - a + 0.3, st, [x, yt, (a + c) / 2]);
    // nan ngang đều
    const n = Math.round(L / 1.0);
    for (let k = 1; k < n; k++) {
      const z = Z0 + L * k / n;
      for (const [a, c] of pieces(X0, X1, z, true)) b.box(c - a, 0.36, 0.12, st, [(a + c) / 2, yt, z]);
    }
    // 2 thanh dọc đỡ nan (nằm dưới nan)
    for (const x of [X0 + W / 3, X0 + W * 2 / 3]) for (const [a, c] of pieces(Z0, Z1, x, false)) b.box(0.22, 0.22, c - a, st, [x, yt - 0.28, (a + c) / 2]);
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
  function buildCage(u, hull, tur, M, F, T) {
    const plan = CAGE_PLAN[u.tankType];
    if (!plan || !u.chassisGroup) return;
    const skipH = new Set(), skipT = new Set();
    if (u.turretGroup) skipH.add(u.turretGroup);
    for (const k in (u._mounts || {})) if (u._mounts[k].group) { skipH.add(u._mounts[k].group); skipT.add(u._mounts[k].group); }
    if (u.barrelGroup) skipT.add(u.barrelGroup);
    const H = plan.hull, castH = cageCaster(u.chassisGroup, skipH);
    const extraH = (has(u, 'applique') ? 1.9 : 0) + (has(u, 'era') ? 1.2 : 0);
    const sw = T && u.turretGroup ? turretSweep(u) : null;
    // ô thân nằm trong vòng quay của tháp mà cao hơn mép dưới tháp -> bỏ
    const keepH = (x, y, z) => !sw || y < sw.bot || Math.hypot(x - sw.x, z - sw.z) > sw.R;
    const zA = F.zF - 4, zB = F.zR + 4, xW = F.hw + 4;
    if (H.sides) for (const s of [-1, 1]) {
      hull.setTag(s < 0 ? 'cageKitL' : 'cageKitR');
      cageWall(hull, M, castH, { axis: 'x', s, a0: zA, a1: zB, y0: H.y0, y1: H.y1, extra: extraH, keep: (a, y, c) => keepH(s * c, y, a) });
    }
    if (H.rear) {
      hull.setTag('cageKitB');
      cageWall(hull, M, castH, { axis: 'z', s: 1, a0: -xW, a1: xW, y0: H.y0, y1: H.y1, keep: (a, y, c) => keepH(a, y, c) });
    }
    if (H.front) {
      hull.setTag('cageKitF');
      cageWall(hull, M, castH, { axis: 'z', s: -1, a0: -xW, a1: xW, y0: H.front[0], y1: H.front[1], keep: (a, y, c) => keepH(a, y, -c) });
    }
    if (H.deck && sw) {
      // mái lồng sàn máy phía sau, ngoài vòng quay tháp (UAV hay nhắm sàn máy)
      hull.setTag('cageKitD');
      cageRoof(hull, M, castH, -F.hw + 0.8, F.hw - 0.8, sw.z + sw.R * 0.5, F.zR - 0.8, [], (x, z, y) => keepH(x, y, z));
    }
    if (H.roofHull) {
      hull.setTag('cageKitT');
      const hole = CAGE_HOLE[u.tankType];
      cageRoof(hull, M, castH, -F.hw + 0.8, F.hw - 0.8, F.zF + 4, F.zR - 1, hole ? [hole] : []);
    }
    if (!plan.tur || !T || !u.turretGroup) return;
    const P = plan.tur, castT = cageCaster(u.turretGroup, skipT);
    const len = T.zR - T.zF, zf = T.zF + len * P.front, extraT = has(u, 'era') ? 1.2 : 0;
    const ry = REAL_ROOF[u.tankType] || T.h;   // lồng sườn / đuôi tháp dừng ở mép nóc, mái lồng phủ bên trên
    if (P.sides) for (const s of [-1, 1]) {
      tur.setTag(s < 0 ? 'cageKitTL' : 'cageKitTR');
      cageWall(tur, M, castT, { axis: 'x', s, a0: zf, a1: T.zR + 3, y0: -1, y1: ry, extra: extraT });
    }
    if (P.rear) {
      tur.setTag('cageKitTB');
      cageWall(tur, M, castT, { axis: 'z', s: 1, a0: -T.hw - 2, a1: T.hw + 2, y0: -1, y1: ry });
    }
    if (P.roof) {
      tur.setTag('cageKitT');
      const holes = CAGE_HOLE[u.tankType] ? [CAGE_HOLE[u.tankType]] : [];
      if (has(u, 'aps')) {   // 2 cụm radar + ống đánh chặn ở 2 góc nóc tháp
        const tx = T.hw - 2.2, tz = T.zF + len * 0.55;
        for (const s of [-1, 1]) holes.push([s * tx, tz, 3.0], [s * (tx - 3), tz, 2.2]);
      }
      const spot = ROOF_SPOT[u.tankType] || {};
      if (has(u, 'radar') && spot.radar) holes.push([spot.radar[0], spot.radar[1], 2.4]);
      if (has(u, 'jammer') && spot.jam) holes.push([spot.jam[0], spot.jam[1], 2.2]);
      cageRoof(tur, M, castT, -T.hw - 1, T.hw + 1, zf, T.zR + 2, holes);
    }
  }

  // Bình chữa cháy trên giá kẹp: thân đỏ, cổ van, tay bóp, vòi rủ, 2 đai kẹp + tấm đỡ
  function extinguisher(b, M, x, y0, z, axis, n) {
    const L = 2.7, R = 0.55;
    const c = axis === 'y' ? [x, y0 + L / 2, z] : [x, y0 + R + 0.25, z];
    const along = axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const p = (t, o = [0, 0, 0]) => [c[0] + along[0] * t + o[0], c[1] + along[1] * t + o[1], c[2] + along[2] * t + o[2]];
    b.cyl(R, R, L, 12, M.ext, c, axis);
    b.cyl(R * 0.98, R * 0.7, 0.35, 12, M.ext, p(L / 2 + 0.17), axis);          // vai bình
    b.cyl(0.17, 0.2, 0.45, 8, M.metal, p(L / 2 + 0.55), axis);                 // van
    b.box(axis === 'y' ? 0.9 : 0.22, 0.22, axis === 'y' ? 0.22 : 0.9, M.steel, p(L / 2 + 0.78));   // tay bóp
    b.strut(p(L / 2 + 0.6), p(L / 2 - 0.9, axis === 'y' ? [R + 0.12, 0, 0] : [R + 0.12, 0, 0]), 0.09, M.rubber, 5);   // vòi
    for (const t of [-L * 0.28, L * 0.28]) {
      b.add(new THREE.TorusGeometry(R + 0.06, 0.08, 5, 14), M.steel, p(t), axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]);
    }
    // tấm đỡ phía sau bình (nằm về phía vỏ xe)
    const back = [c[0] + n[0] * (R + 0.15), c[1] + n[1] * (R + 0.15), c[2] + n[2] * (R + 0.15)];
    if (axis === 'y') b.box(1.3, L * 0.85, 0.16, M.steel, back, [0, Math.abs(n[0]) > 0.5 ? Math.PI / 2 : 0, 0]);
    else b.box(1.3, 0.16, L * 0.85, M.steel, back);
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
      tints: [[1, 1, 1], [0.82, 0.98, 0.74], [1.2, 1.06, 0.76], [0.72, 0.84, 0.62]], sprig: 0.65, twigP: 0.75, flat: 1, fire: 'green', seed: 7, shade: [0.6, 0.9, 1.12], edge: 0.7
    },
    RIVER_LAKE: {
      pal: [[62, 84, 36], [80, 100, 44], [48, 66, 30], [96, 108, 56], [110, 106, 66], [76, 70, 46]],
      shapes: [0.46, 0.18, 0.3, 0, 0, 0.06], scale: 1.05, stem: 'rgba(70,62,40,0.95)', twig: 0x4a3f2c,
      tints: [[1, 1, 1], [0.86, 1.0, 0.78], [1.16, 1.08, 0.82], [0.8, 0.86, 0.7]], sprig: 0.7, twigP: 0.55, flat: 0.95, fire: 'green', seed: 21, shade: [0.62, 0.9, 1.12], edge: 0.7
    },
    HIGHLAND: {
      pal: [[70, 80, 46], [88, 94, 56], [56, 64, 38], [104, 98, 70], [120, 116, 104], [84, 74, 56]],
      shapes: [0.34, 0.14, 0.16, 0.08, 0.22, 0.06], scale: 1, stem: 'rgba(66,56,40,0.95)', twig: 0x4a3e2c,
      tints: [[1, 1, 1], [0.88, 0.96, 0.8], [1.12, 1.04, 0.86], [0.94, 0.94, 0.94]], sprig: 0.5, twigP: 0.6, flat: 0.9, fire: 'green', seed: 13, shade: [0.64, 0.9, 1.1], edge: 0.6
    },
    DESERT: {
      pal: [[214, 184, 138], [196, 160, 112], [176, 140, 98], [154, 122, 90], [206, 190, 156], [184, 162, 120]],
      shapes: [0.04, 0.08, 0.12, 0.6, 0, 0.16], scale: 1, stem: 'rgba(120,98,70,0.95)', twig: 0x7a6650,
      tints: [[1.06, 1.04, 1.02], [0.96, 0.92, 0.86], [1.12, 1.06, 0.96], [0.86, 0.82, 0.78]], sprig: 0.16, twigP: 0.18, flat: 0.68, fire: 'dry', seed: 11, shade: [0.8, 0.95, 1.06], edge: 0.3
    },
    URBAN: {
      pal: [[138, 136, 130], [120, 118, 112], [104, 102, 98], [146, 138, 124], [124, 114, 100], [92, 92, 90]],
      shapes: [0.06, 0.04, 0.08, 0.66, 0, 0.16], scale: 1, stem: 'rgba(70,66,60,0.95)', twig: 0x55504a,
      tints: [[1, 1, 1], [0.86, 0.86, 0.86], [1.08, 1.02, 0.94], [0.74, 0.74, 0.76]], sprig: 0.12, twigP: 0.12, flat: 0.74, fire: 'dry', seed: 51, shade: [0.78, 0.94, 1.06], edge: 0.3
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
    // Atlas 512 x 256: nửa trái = lá dày (khối bụi lá), nửa phải = chùm lá thưa dần ra mép (tấm lá rủ có viền lởm chởm)
    // Vẽ 3 lớp: lá sẫm (bóng trong lòng bụi) -> lá giữa -> lá sáng trên cùng => có chiều sâu, không phẳng như tấm dán
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const pal = ST.pal, cum = [];
    ST.shapes.reduce((a, v, i) => (cum[i] = a + v), 0);
    let seed = ST.seed;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // lá nhọn (có gân giữa) / lá tròn / ngọn cỏ mảnh / mảnh vải cắt (lưới sa mạc, đô thị) / chùm lá kim / sỏi; sh = độ sáng của lớp
    const leafAt = (x, y, i, sc, sh) => {
      const p = pal[i % pal.length], k = sh * (0.84 + r() * 0.32);
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
    // dày ở giữa & mép trên (chỗ buộc vào lưới), thưa dần xuống dưới và ra hai bên -> viền lởm chởm
    for (const [n, sh] of [[1100, s0], [1000, s1], [600, s2]]) for (let i = 0; i < n; i++) {
      const x = 258 + r() * 254, y = r() * 256;
      const dx = Math.abs(x - 385) / 127, dy = y / 256;
      if (r() > 1.18 - dx * 0.72 - dy * 0.78) continue;
      leafAt(x, y, i, 1.1, sh);
    }
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const leaf = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    const twig = new THREE.MeshStandardMaterial({ color: ST.twig, roughness: 0.95, metalness: 0 });
    leaf.userData.surface = twig.userData.surface = 'cloth';
    return (foliageCache[kind] = { leaf, twig });
  }
  // Khối tán lá: cầu đa diện méo ngẫu nhiên (đỉnh trùng nhau dời cùng một lượng -> không hở mặt)
  let clumpGeo = null;
  function foliageClump() {
    if (!clumpGeo) {
      clumpGeo = new THREE.IcosahedronGeometry(1, 1);
      const p = clumpGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        const k = 0.78 + (h - Math.floor(h)) * 0.4;
        p.setXYZ(i, x * k, y * k * (y < 0 ? 0.55 : 1), z * k);   // đáy bẹt áp lên vỏ xe
      }
      clumpGeo.computeVertexNormals();
      const uv = clumpGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.497);   // nửa trái atlas: lá dày
    }
    return clumpGeo.clone();
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
  let clumpLoGeo = null;
  function foliageClumpLo() {   // khối lá thô (20 tam giác) cho lớp phụ & nòng
    if (!clumpLoGeo) {
      clumpLoGeo = new THREE.IcosahedronGeometry(1, 0);
      const p = clumpLoGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (p.getY(i) < 0 ? 0.55 : 1));
      clumpLoGeo.computeVertexNormals();
      const uv = clumpLoGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.497);
    }
    return clumpLoGeo.clone();
  }
  // Tấm lá rủ: mặt phẳng lấy nửa phải atlas (chùm lá dày ở trên, thưa dần ra mép -> viền lởm chởm)
  function leafCardGeo() {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.503 + uv.getX(i) * 0.497);
    return g;
  }
  function tinted(geo, c) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
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

  function buildFoliage(u, F, T, len) {
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
    const clump = (b, x, y, z, sx, sy, sz, lo) => b.add(cfAdd(b, tinted(lo ? foliageClumpLo() : foliageClump(), tint()), x, y, z, Math.max(sx, sz)), leaf, [x, y, z], [R(-0.3, 0.3), R(0, 6.28), R(-0.3, 0.3)], [sx, sy, sz]);
    const card = (b, pos, rot, sc) => b.add(cfAdd(b, tinted(leafCardGeo(), tint()), pos[0], pos[1], pos[2], Math.max(sc[0], sc[1]) * 0.5), leaf, pos, rot, sc);
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
      card(b, [x + R(-0.4, 0.4) * sx, y + sy * 0.5, z + R(-0.4, 0.4) * sz], [R(-0.5, 0.5), R(0, 3.14), R(-0.4, 0.4)], [sx * 1.7, sy * 1.7, 1]);
      if (rnd() < ST.sprig) sprig(b, x + R(-0.3, 0.3) * sx, y + sy * 0.4, z + R(-0.3, 0.3) * sz, sy * R(1.2, 1.9));
      if (rnd() < ST.twigP) twig(b, x, y, z, sy * R(1.4, 2.6));
    };
    // Mỗi nhóm lá một nhãn bộ phận riêng: khi bị hất văng, mỗi phần giữ đúng hệ tọa độ của nhóm cha
    // (trước đây chung 1 nhãn -> lá trên nòng bị đặt theo hệ thân xe, rơi thành khối nằm ngang dưới đất)
    const fh = batch(u), ft = batch(u), fb = batch(u), fp = batch(u);
    fh.setTag('camoKit'); ft.setTag('camoKitT'); fb.setTag('camoKitB'); fp.setTag('camoKitP');

    // ---- THÂN XE ----
    const top = F.y1 + 0.6, z0 = F.zF + len * 0.1, z1 = F.zR - 1.2;
    const ringClear = (x, z) => u.tankType === 'SCOUT' && Math.hypot(x, z - 2.6) < 4.6;   // chừa vòng xoay súng Marten
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
      for (let z = z0 + 1.5; z <= z1; z += R(2.6, 3.2)) { const x = s * (F.hw - R(4, 5.5)); if (!ringClear(x, z)) bush(fh, x, top - R(0.2, 0.6), z, R(3.2, 4.2), R(1.6, 2.4), R(3.2, 4.2)); }
      // mép lá lởm chởm rủ xuống sườn: tầng trên phủ sườn thân, rèm dài phủ kín váy xích, bánh chịu lực & xích tới sát đất
      for (let z = z0; z <= z1; z += R(2.2, 2.9)) card(fh, [s * (F.hw + 0.7), top - 2.0, z], [0, Math.PI / 2 + R(-0.3, 0.3), R(-0.15, 0.15)], [R(4.5, 6.5), R(3.2, 4.6), 1]);
      for (let z = Math.min(z0, tF + 2); z <= tR - 1.5; z += R(2.3, 2.9)) curtain(fh, s * (F.hw + R(0.8, 1.5)), z, Math.PI / 2, F.y0 + R(1.2, 2.2), yBot + (rnd() < 0.35 ? R(0.8, 2.2) : R(0, 0.5)), [s * 0.55, 0], R(4.6, 5.8));
      // chùm lá phồng ra ngoài rèm (mặt rèm gồ ghề, không phẳng như tường rào)
      for (let z = tF + 2; z <= tR - 2; z += R(3.4, 5.0)) bushSide(fh, s, F.hw + R(1.4, 2.0), F.y0 + R(-1.6, 1.4), z);
      // đầu & đuôi dải xích: lá rủ trùm bánh sao chủ động / bánh dẫn hướng
      for (const [zz, dz] of [[tF - 0.9, -0.5], [tR + 0.9, 0.5]]) {
        curtain(fh, s * tx, zz, 0, F.y0 + R(1.4, 2.4), yBot + R(0.3, 0.9), [0, dz], R(5.4, 6.6));
        card(fh, [s * (tx + 2.0), F.y0 - 0.6, zz - dz * 2], [0, s * (dz < 0 ? -0.7 : 0.7) + R(-0.2, 0.2), R(-0.1, 0.1)], [R(3.6, 4.4), R(5.0, 6.0), 1]);
      }
    }
    // đuôi xe: lá rủ (2 tầng)
    for (let x = -F.hw * 0.85; x <= F.hw * 0.86; x += R(2.8, 3.6)) {
      card(fh, [x, top - 2.2, F.zR + 0.8], [R(-0.2, 0.2), R(-0.3, 0.3), R(-0.2, 0.2)], [R(4, 5.5), R(3, 4.4), 1]);
      if (Math.abs(x) < tx - 3) card(fh, [x + R(-0.6, 0.6), F.y0 + 0.2, F.zR + 1.1], [R(-0.1, 0.1), R(-0.25, 0.25), R(-0.15, 0.15)], [R(3.8, 4.8), R(3.6, 4.6), 1]);
    }
    // sàn sau (sau tháp) / nóc xe không tháp
    const rz0 = T ? Math.min(F.zR - 4, T.zR + 3) : F.zF + len * 0.35;
    for (let z = rz0; z <= z1; z += R(2.5, 3.1)) {
      for (let x = -F.hw * 0.62; x <= F.hw * 0.63; x += R(2.9, 3.6)) { const xx = x + R(-1, 1); if (!ringClear(xx, z)) bush(fh, xx, F.netY + 0.4, z, R(3.6, 4.6), R(1.8, 2.8), R(3.6, 4.6)); }
    }
    }
    let panelHost = null, panelPos = null;
    // ---- THÁP ----
    if (T && u.turretGroup) {
      const ty = (REAL_ROOF[u.tankType] || T.roof) + 0.4, tl = T.zR - T.zF;
      for (let i = 0; i < 26; i++) {   // lá rủ quanh sườn tháp: tầng trên + tầng dưới phủ kín vách tháp
        const a = (i / 26) * Math.PI * 2 + 0.3;
        const x = Math.sin(a) * (T.hw + 0.4), z = (T.zF + T.zR) / 2 - Math.cos(a) * tl * 0.5;
        if (z < T.zF + tl * 0.3 && Math.abs(x) < T.hw * 0.5) continue;
        card(ft, [x, ty - 2.4, z], [0, a + R(-0.25, 0.25), R(-0.15, 0.15)], [R(4.2, 6), R(3, 4.4), 1]);
        if (rnd() < 0.85) card(ft, [x * 1.04, ty - 5.2, z + R(-0.6, 0.6)], [0, a + R(-0.3, 0.3), R(-0.15, 0.15)], [R(4.0, 5.4), R(3.6, 4.6), 1]);
      }
      for (let i = 0; i < 36; i++) {   // viền nóc tháp (trừ giữa phía trước: nòng + kính ngắm)
        const a = (i / 36) * Math.PI * 2;
        const x = Math.sin(a) * T.hw * 0.92, z = (T.zF + T.zR) / 2 - Math.cos(a) * tl * 0.46;
        if (z < T.zF + tl * 0.3 && Math.abs(x) < T.hw * 0.45) continue;
        bush(ft, x, ty - R(0, 1.2), z, R(3.0, 4.0), R(1.9, 2.8), R(3.0, 4.0));
      }
      for (let i = 0; i < 22; i++) {   // giữa-sau nóc tháp
        const x = R(-T.hw * 0.65, T.hw * 0.65), z = T.zF + tl * R(0.4, 0.95);
        if (u.tankType === 'ARTILLERY' && Math.abs(x) < 5.4 && z < 6.5) continue;   // chừa hộp bệ nòng 155
        bush(ft, x, ty + 0.2, z, R(3.2, 4.2), R(1.5, 2.2), R(3.2, 4.2));
      }
      panelHost = ft; panelPos = [T.hw * 0.25, ty + 3.0, T.zF + tl * 0.7];
    } else if (u.turretGroup && u.tankType === 'SCOUT') {
      // Marten: lá cắm trên mép tấm chắn súng & quanh vòng xoay (không che đường đạn súng máy)
      for (const s of [-1, 1]) {
        clump(ft, s * 1.6, 4.55, -2.6, R(1.3, 1.7), R(0.8, 1.1), R(1.1, 1.4));
        card(ft, [s * 2.55, 3.2, -2.5], [0, Math.PI / 2 + s * 0.3, R(-0.2, 0.2)], [2.4, 2.6, 1]);
      }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4; if (Math.cos(a) > 0.6) continue; card(ft, [Math.sin(a) * 2.4, 0.9, Math.cos(a) * 2.4], [0, a, 0], [2.4, 1.6, 1]); }
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

  function buildVisuals(u) {
    if (u._eqBuilt || !u.kit || !u.kit.m.length || !u.chassisGroup || !window.VehicleKit) return;
    u._eqBuilt = true;
    const F = FIT[u.tankType];
    if (!F) return;
    const M = kitMats(u.team);
    const hull = batch(u), tur = batch(u);
    const T = F.tur;
    const len = F.zR - F.zF;

    const SC = u.tankType === 'SCOUT', AR = u.tankType === 'ARTILLERY';
    if (has(u, 'applique') && SC) {
      // Xe trinh sát 4x4: tấm composite ốp nửa dưới 2 cánh cửa + sườn giữa 2 hốc bánh (chừa ô kính cửa, không trùm hốc bánh)
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        for (const [z0, z1] of [[-6.2, -2.3], [-2.0, 1.9], [2.2, 6.0]]) {
          hull.box(0.9, 6.2, z1 - z0, M.plate, [s * 8.45, 9.1, (z0 + z1) / 2]);
          hull.boltRow([s * 8.92, 11.8, z0 + 0.4], [s * 8.92, 11.8, z1 - 0.4], 3, 'x', M.steel, 0.12, s);
          hull.boltRow([s * 8.92, 6.4, z0 + 0.4], [s * 8.92, 6.4, z1 - 0.4], 3, 'x', M.steel, 0.12, s);
        }
      }
    } else if (has(u, 'applique') && AR) {
      // Xe pháo: tấm composite ốp cửa cabin dưới ô kính (trên hốc bánh trước) + má tháp, sát vỏ thật
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'appliqueKitL' : 'appliqueKitR');
        for (const [z0, z1] of [[-33.8, -26.9], [-26.6, -19.4]]) hull.box(1.2, 2.6, z1 - z0, M.plate, [s * 11.3, 13.6, (z0 + z1) / 2]);
      }
      if (u.turretGroup) {
        tur.setTag('appliqueKitT');
        for (const s of [-1, 1]) tur.box(1.4, 7.8, 7.6, M.plate, [s * 10.4, 5.1, -6.4]);
      }
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
    if (has(u, 'era') && SC) {
      // Xe trinh sát: gạch nổ cỡ nhỏ, mỏng ốp lên nửa dưới cửa / sườn giữa 2 hốc bánh (5 cột x 3 hàng mỗi bên)
      const off = has(u, 'applique') ? 0.9 : 0;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
        for (let c = 0; c < 5; c++) {
          for (let r = 0; r < 3; r++) hull.box(0.6, 1.8, 2.2, M.era, [s * (8.0 + off + 0.32), 7.1 + r * 2.0, -4.9 + c * 2.45]);
        }
      }
    } else if (has(u, 'era')) {
      // Gạch nổ: 2 hàng trên sườn phía trước, 1 hàng ở mũi dưới, má tháp
      const off = has(u, 'applique') ? 1.6 : 0;
      const bw = 3.3, gap = 0.3, z0 = F.zF + 2.5, z1 = F.zF + len * 0.5 + F.eraZ1;
      const rows = F.y1 - F.y0 > 5 ? 2 : 1, bh = (F.y1 - F.y0) / rows - 0.3;
      for (const s of [-1, 1]) {
        hull.setTag(s < 0 ? 'eraKitL' : 'eraKitR');
        for (let z = z0; z + bw <= z1; z += bw + gap) {
          for (let r = 0; r < rows; r++) hull.box(0.9, bh, bw, M.era, [s * (F.hw + 0.55 + off), F.y0 + (bh + 0.3) * (r + 0.5), z + bw / 2]);
        }
      }
      hull.setTag('eraKitF');
      const fw = F.hw - 3;
      for (let x = -fw; x + bw <= fw + 0.01; x += bw + gap) hull.box(bw, 2.6, 0.9, M.era, [x + bw / 2, F.y0 + 0.6, F.zF - 0.5]);
      if (T && u.turretGroup && u.tankType !== 'ARTILLERY') {
        for (const s of [-1, 1]) {
          tur.setTag(s < 0 ? 'eraKitTL' : 'eraKitTR');
          const tz0 = T.zF + 1, tz1 = T.zF + (T.zR - T.zF) * 0.45;
          for (let z = tz0; z + 2.8 <= tz1; z += 3.1) tur.box(0.9, T.h * 0.42, 2.8, M.era, [s * (T.hw + 0.55 + (has(u, 'applique') ? 1.7 : 0)), T.h * 0.5, z + 1.4]);
        }
        tur.setTag('eraKitTF');
        for (let x = -T.hw * 0.62; x + 2.9 <= T.hw * 0.62 + 0.01; x += 3.2) tur.box(2.9, T.h * 0.36, 0.9, M.era, [x + 1.45, T.h * 0.36, T.zF - 0.5]);
      }
    }
    // Giáp lồng ôm thân xe + mái lồng chống UAV (tự đo bề mặt mô hình — xem buildCage)
    if (has(u, 'slat')) buildCage(u, hull, tur, M, F, T);
    if (has(u, 'fireext') && EXT_SPOT[u.tankType]) {
      // Bình chữa cháy xách tay gắn ngoài (hệ thống dập lửa tự động nằm trong khoang)
      hull.setTag('fireextKit');
      for (const [x, y, z, ax, n] of EXT_SPOT[u.tankType]) extinguisher(hull, M, x, y, z, ax, n);
    }
    if (has(u, 'aps')) {
      // 2 khối radar mảng pha ở góc nóc tháp + ống đánh chặn
      const host = T && u.turretGroup ? tur : hull;
      host.setTag('apsKit');
      const ty = T ? T.h : F.y1 + 2, tz = T ? T.zF + (T.zR - T.zF) * 0.55 : 0, tx = T ? T.hw - 2.2 : F.hw - 3;
      for (const s of [-1, 1]) {
        host.box(2.6, 2.2, 1.0, M.sensor, [s * tx, ty + 1.2, tz - 1.2], [0, s * 0.5, 0]);
        host.box(2.6, 2.2, 1.0, M.sensor, [s * tx, ty + 1.2, tz + 1.4], [0, Math.PI - s * 0.5, 0]);
        host.box(1.6, 1.2, 3.4, M.steel, [s * (tx - 3), ty + 0.7, tz + 0.2]);
      }
    }
    if (has(u, 'smoke') && !(u.partRegistry && (u.partRegistry.smokeL || u.partRegistry.smokeR))) {
      const host = T && u.turretGroup ? tur : hull;
      for (const s of [-1, 1]) {
        host.setTag(s < 0 ? 'smokeKitL' : 'smokeKitR');
        const bx = T ? s * (T.hw - 1) : s * (F.hw - 2), by = T ? T.h * 0.7 : F.y1 + 1, bz = T ? T.zF + 4 : F.zF + 6;
        for (let i = 0; i < smokeMax(u); i++) host.cyl(0.55, 0.55, 2.4, 8, M.steel, [bx, by + i * 1.1, bz], 'z', [0.35, s * 0.4, 0]);
      }
    }
    if (has(u, 'camo')) buildFoliage(u, F, T, len);   // lưới lá: dựng & gắn riêng (xem buildFoliage)
    const spot = ROOF_SPOT[u.tankType] || {}, roofY = REAL_ROOF[u.tankType] || F.netY;
    if (has(u, 'radar') && spot.radar && T && u.turretGroup) {
      // Radar dò tìm: cột thép + ăng-ten mảng phẳng quay tròn (quay trong Equipment.update)
      const [rx, rz] = spot.radar;
      tur.setTag('radarKit');
      tur.box(1.4, 0.6, 1.4, M.steel, [rx, roofY + 0.3, rz]);
      tur.cyl(0.32, 0.42, 3.0, 8, M.steel, [rx, roofY + 1.8, rz]);
      const head = new THREE.Group();
      head.position.set(rx, roofY + 3.5, rz);
      const hb = batch(u);
      hb.setTag('radarKit');
      hb.box(3.4, 1.3, 0.3, M.sensor, [0, 0.45, 0]);
      hb.box(3.6, 0.16, 0.55, M.steel, [0, -0.3, 0]);
      hb.cyl(0.32, 0.32, 0.5, 8, M.steel, [0, -0.5, 0]);
      buildBatch(u, hb, head);
      u.turretGroup.add(head);
      u._eqRadarHead = head;
    }
    if (has(u, 'jammer') && spot.jam) {
      // Máy gây nhiễu: hộp điện tử + 3 ăng-ten phát nhiễu ngắn chĩa xiên
      const host = T && u.turretGroup ? tur : hull, [jx, jz] = spot.jam;
      host.setTag('jammerKit');
      host.box(2.2, 1.1, 1.6, M.sensor, [jx, roofY + 0.55, jz]);
      host.box(2.4, 0.12, 1.8, M.steel, [jx, roofY + 1.12, jz]);
      for (const k of [-0.7, 0, 0.7]) host.strut([jx + k, roofY + 1.1, jz], [jx + k * 1.7, roofY + 3.3, jz + 0.3], 0.08, M.steel, 5, 0.04);
    }
    buildBatch(u, hull, u.chassisGroup);
    if (u.turretGroup) buildBatch(u, tur, u.turretGroup);
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
      if (u.isDead) continue;
      if (u._eqRadarHead) u._eqRadarHead.rotation.y += dt * 2.6;
      if (u.roofRadarHead && !lost(u, 'sradar')) u.roofRadarHead.rotation.y += dt * 2.2;   // radar trên chân đế nóc tháp
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
    has, equip, onRespawn, paidUsed, ammoDelta, startLife,
    armorMul, appliqueCovers, appliqueDamageMul, appliqueSplashMul, eraEffect, penMul, penLossMul, isTandem, splashMul, spallMul, slatDefeats, slatHit, slatSplash, apsLeft, apsTry, camoHidden, camoFactor, camoRadarFactor, fireMul, burnDamageMul, extHitMul, extFireChance, extIgniteMul,
    deploySmoke, triggerSmoke, smokeBlocks, clearSmoke, SmokeField, smokeSides, smokeMax, smokeCount, lockBlocked, SMOKE_GAP, SMOKE_LIFE, update, buildVisuals, FIT,
    kitMats, foliageMats, foliageClump,   // dùng lại ở trang render ảnh trang bị (equipment_thumbs.html)
    APS_CHARGES, outOfStockNote
  });
});
