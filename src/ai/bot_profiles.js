/**
 * Hồ sơ bot (Bot Profiles): danh sách chiến binh do máy điều khiển — tên, biệt hiệu, xe sở trường, tay nghề, lối đánh.
 * - Chủ phòng bốc hồ sơ khi lấp bot vào ô trống (matchmaking.js fillBotSlot): ưu tiên hồ sơ có xe sở trường đúng loại
 *   xe của ô, không trùng hồ sơ trong phòng; mã hồ sơ (slot.botId) gửi kèm danh sách slot -> mọi máy cùng tên / tay nghề
 * - skill: hệ số nhân sai số ngắm + nhịp phản xạ của BotAIController (0.8 giỏi nhất .. 1.25 kém nhất); vào trận
 *   game.balanceBotSkill đưa trung bình mỗi phe về cùng mức, giữ chênh lệch giữa các bot
 * - style: lối đánh, chỉnh vài ngưỡng hành vi của AI (xem STYLES)
 * - Trang bị KHÔNG gắn vào hồ sơ: mỗi trận bot vẫn nhận bộ trang bị ngẫu nhiên (Equipment.botKit theo hạt giống trận)
 */
(function () {
  // Lối đánh: fortHp / holdHp = ngưỡng máu (tỉ lệ) để lui vào công sự / còn đứng giữ cứ điểm;
  // fireGap = nhân khoảng nghỉ giữa các lượt bắn; scoot = nhân quãng đổi chỗ sau khi bắn; crate = nhân tầm đi nhặt hòm tiếp tế
  const STYLES = {
    BALANCED:   { label: 'BALANCED',   fortHp: 0.35, holdHp: 0.35, fireGap: 1,    scoot: 1,    crate: 1 },
    AGGRESSIVE: { label: 'AGGRESSIVE', fortHp: 0.2,  holdHp: 0.2,  fireGap: 0.85, scoot: 0.6,  crate: 0.8 },
    CAUTIOUS:   { label: 'CAUTIOUS',   fortHp: 0.5,  holdHp: 0.5,  fireGap: 1.1,  scoot: 1.35, crate: 1.2 },
    SCAVENGER:  { label: 'SCAVENGER',  fortHp: 0.35, holdHp: 0.35, fireGap: 1,    scoot: 1.1,  crate: 1.6 }
  };

  // [tên, biệt hiệu, xe sở trường, tay nghề, lối đánh] — 12 xe tăng · 12 xe 6 nòng · 8 pháo · 8 trinh sát
  // (đủ lấp 20 ô theo tỉ lệ chuẩn 3 · 3 · 2 · 2 mỗi phe mà vẫn còn hồ sơ dư để bốc ngẫu nhiên)
  const RAW = [
    ['BLACK PANTHER',       'PANTHER',   'ALL_ROUNDER', 0.86, 'AGGRESSIVE'],
    ['IRON VANGUARD',       'VANGUARD',  'ALL_ROUNDER', 1.02, 'BALANCED'],
    ['FEDERAL HUNTER',      'HUNTER',    'ALL_ROUNDER', 0.92, 'BALANCED'],
    ['ARCTIC CRUSADER',     'ARCTIC',    'ALL_ROUNDER', 1.14, 'CAUTIOUS'],
    ['ARES 02',             'ARES',      'ALL_ROUNDER', 0.82, 'AGGRESSIVE'],
    ['WHITE STALLION',      'STALLION',  'ALL_ROUNDER', 0.98, 'CAUTIOUS'],
    ['DESERT LION',         'LION',      'ALL_ROUNDER', 1.08, 'AGGRESSIVE'],
    ['IRON DRAGON',         'DRAGON',    'ALL_ROUNDER', 0.9,  'BALANCED'],
    ['STEEL WARRIOR',       'STEEL',     'ALL_ROUNDER', 1.2,  'SCAVENGER'],
    ['STEEL RHINO',         'RHINO',     'ALL_ROUNDER', 1.05, 'AGGRESSIVE'],
    ['FRONTLINE HAMMER',    'HAMMER',    'ALL_ROUNDER', 0.95, 'BALANCED'],
    ['BRONZE BULWARK',      'BULWARK',   'ALL_ROUNDER', 1.1,  'CAUTIOUS'],

    ['HELLFIRE LEOPARD',    'LEOPARD',   'GATLING', 0.88, 'AGGRESSIVE'],
    ['SANDSTORM',           'DUNE',      'GATLING', 1.04, 'BALANCED'],
    ['IRON SCORPION',       'SCORPION',  'GATLING', 0.94, 'AGGRESSIVE'],
    ['URBAN BEAST',         'BEAST',     'GATLING', 1.12, 'SCAVENGER'],
    ['PUNISHER 01',         'PUNISHER',  'GATLING', 0.84, 'BALANCED'],
    ['FIRE EAGLE',          'EAGLE',     'GATLING', 1.0,  'CAUTIOUS'],
    ['FOREST GUNNER',       'GUNNER',    'GATLING', 1.16, 'BALANCED'],
    ['BROKEN WING',         'WING',      'GATLING', 1.22, 'AGGRESSIVE'],
    ['STEEL RAIN',          'RAINMAKER', 'GATLING', 0.9,  'BALANCED'],
    ['DELTA CYCLONE',       'CYCLONE',   'GATLING', 0.97, 'AGGRESSIVE'],
    ['STEEL HORNET',        'HORNET',    'GATLING', 1.06, 'SCAVENGER'],
    ['BORDER WYRM',         'WYRM',      'GATLING', 1.1,  'CAUTIOUS'],

    ['LONG-RANGE REAPER',   'REAPER',    'ARTILLERY', 0.84, 'CAUTIOUS'],
    ['HAWKEYE GUNNER',      'HAWKEYE',   'ARTILLERY', 1.0,  'BALANCED'],
    ['SWIFT BATTERY',       'SWIFT',     'ARTILLERY', 0.94, 'AGGRESSIVE'],
    ['LAKE THUNDER',        'THUNDER',   'ARTILLERY', 1.12, 'BALANCED'],
    ['DOOM CANNON',         'DOOM',      'ARTILLERY', 0.9,  'AGGRESSIVE'],
    ['FAR-SIGHT FALCON',    'FALCON',    'ARTILLERY', 1.06, 'CAUTIOUS'],
    ['PEAK MARKSMAN',       'SUMMIT',    'ARTILLERY', 0.98, 'CAUTIOUS'],
    ['SIEGE INFERNO',       'INFERNO',   'ARTILLERY', 1.18, 'BALANCED'],

    ['PHANTOM BOLT',        'PHANTOM',   'SCOUT', 0.86, 'AGGRESSIVE'],
    ['FACELESS RIDER',      'RIDER',     'SCOUT', 1.02, 'SCAVENGER'],
    ['FROST LIGHTNING',     'FROST',     'SCOUT', 0.92, 'AGGRESSIVE'],
    ['STEALTH JAGUAR',      'JAGUAR',    'SCOUT', 0.96, 'CAUTIOUS'],
    ['HIGHLAND GREY WOLF',  'WOLF',      'SCOUT', 1.1,  'BALANCED'],
    ['JUNGLE SHARPSHOOTER', 'JUNGLE',    'SCOUT', 1.04, 'CAUTIOUS'],
    ['SNOW YETI',           'YETI',      'SCOUT', 1.16, 'SCAVENGER'],
    ['SILVER FOX',          'FOX',       'SCOUT', 0.9,  'BALANCED']
  ];

  const LIST = RAW.map(([name, callsign, tank, skill, style], i) => ({
    id: 'bp' + String(i + 1).padStart(2, '0'), name, callsign, tank, skill, style
  }));
  const BY_ID = {};
  LIST.forEach(p => { BY_ID[p.id] = p; });

  window.BotProfiles = {
    STYLES,
    list: LIST,
    byId(id) { return (id && BY_ID[id]) || null; },
    style(key) { return STYLES[key] || STYLES.BALANCED; },
    // Bốc 1 hồ sơ chưa dùng: ưu tiên xe sở trường = tankType, hết thì lấy hồ sơ bất kỳ còn lại (null nếu dùng hết)
    pick(tankType, usedIds, rnd = Math.random) {
      const free = LIST.filter(p => !(usedIds && usedIds.has(p.id)));
      const fit = free.filter(p => p.tank === tankType);
      const pool = fit.length ? fit : free;
      return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
    }
  };
})();
