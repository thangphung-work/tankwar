/**
 * TÌNH BÁO CHIẾN TRƯỜNG (sương mù chiến tranh)
 * - Mỗi xe chỉ thấy địch trong TẦM NHÌN của chính nó (xe trinh sát nhìn xa & rộng hơn xe tăng thường).
 * - Xe núp trong bụi rậm: xe tăng thường KHÔNG phát hiện được (trừ khi xe đó vừa nổ súng -> lộ vị trí).
 * - Xe có radar (xe trinh sát): ăng-ten radar quay tròn thật, mỗi vòng quét đi qua hướng nào thì bắt mục tiêu
 *   ở hướng đó (kể cả xe núp bụi) trong bán kính radar.
 * - Xe trinh sát KHÓA mục tiêu đang nằm trong vùng radar -> liên tục BÁO VỊ TRÍ cho đồng đội (bản đồ, khung 3D,
 *   đồng đội khóa & bắn được mục tiêu đó, kể cả pháo tự hành bắn xa ngoài tầm nhìn).
 * - Radar bị bắn hỏng (mất cụm cảm biến) -> mất toàn bộ chức năng radar.
 */
const TeamIntel = (() => {
  // Tầm nhìn trực tiếp (kính ngắm / quan sát bằng mắt) theo loại xe — 1 đơn vị game hiển thị là "1 m"
  const SIGHT = { ALL_ROUNDER: 520, GATLING: 480, ARTILLERY: 420, SCOUT: 720 };
  const RADAR_RANGE = 950;                     // bán kính radar trinh sát
  const RADAR_RPS = 0.4;                       // 0.4 vòng/giây (1 vòng 2.5 s)
  const CONTACT_TTL = 1 / RADAR_RPS + 0.8;     // vết radar giữ hơn 1 vòng quét một chút
  const REPORT_TTL = 4.0;                      // báo cáo vị trí hết hạn nếu không được làm mới
  const REPORT_EVERY = 0.4;                    // nhịp làm mới báo cáo / gửi mạng
  const LOST_GHOST_TTL = 5.0;                  // dấu "vị trí cuối cùng" trên bản đồ sau khi mất dấu
  const TWO_PI = Math.PI * 2;
  // Rừng rậm: xe nằm trong rừng chỉ bị nhìn thấy khi địch ở gần (trừ khi vừa nổ súng);
  // đường ngắm xuyên quá FOREST_LOS đơn vị rừng rậm thì bị che khuất hoàn toàn
  const FOREST_SPOT = 170;
  const FOREST_LOS = 100;
  const LOS_TTL = 0.25;                        // kết quả kiểm tra đường ngắm giữ 0.25 s (đỡ tốn CPU khi 10v10)
  const losCache = new Map();

  let time = 0;
  const reports = new Map();     // `${team}|${targetId}` -> { team, target, spotter, t, first }
  const ghosts = new Map();      // targetId -> { x, z, t, type }  (chỉ cho người chơi tại máy này)
  let game = null;

  function bind(g) { game = g; }

  function reset() {
    losCache.clear();
    reports.clear();
    ghosts.clear();
    time = 0;
  }

  function hasRadar(u) {
    if (!u || u.isDead || u.tankType !== 'SCOUT') return false;
    if (u.dmg && u.dmg.lost && u.dmg.lost.has('sensor')) return false;   // cụm radar bị bắn bay
    return true;
  }
  function radarRange(u) {
    return u.reconRadius || RADAR_RANGE;
  }
  function sightRange(u) {
    let r = SIGHT[u.tankType] || 500;
    // Mất kính ngắm / kính chỉ huy: tầm quan sát giảm
    if (u.dmg && u.dmg.lost) {
      if (u.dmg.lost.has('opticGunner')) r *= 0.85;
      if (u.dmg.lost.has('opticCdr')) r *= 0.85;
    }
    return r;
  }
  function inBushHidden(t) {
    return !!t.isInBush && (t.revealTimer || 0) <= 0;
  }

  // Thấy trực tiếp: trong tầm nhìn và không núp bụi (xe trinh sát có radar nhìn xuyên ngụy trang trong vùng radar)
  function seesDirect(viewer, t) {
    const d = Math.hypot(t.x - viewer.x, t.z - viewer.z);
    if (d > sightRange(viewer)) return false;
    if (inBushHidden(t)) return false;
    const dense = typeof BattleTerrain3D !== 'undefined' ? BattleTerrain3D.FOREST_DENSE : 10;
    if ((t.forestDens || 0) >= dense && d > FOREST_SPOT && !((t.revealTimer || 0) > 0)) return false;
    if (forestBlocked(viewer, t)) return false;
    return true;
  }

  // Đường ngắm xuyên rừng rậm quá dày -> không thấy (nhớ tạm theo cặp xe)
  function forestBlocked(viewer, t) {
    const terr = game && game.terrain;
    if (!terr || !terr.forestLOS) return false;
    const key = viewer.id + '|' + t.id;
    const c = losCache.get(key);
    if (c && time - c.t < LOS_TTL) return c.v;
    const v = terr.forestLOS(viewer.x, viewer.z, t.x, t.z, FOREST_LOS) > FOREST_LOS;
    losCache.set(key, { t: time, v });
    if (losCache.size > 2000) losCache.clear();
    return v;
  }

  function radarContact(viewer, t) {
    if (!hasRadar(viewer) || !viewer.radarContacts) return null;
    const c = viewer.radarContacts.get(t.id);
    if (!c || time - c.t > CONTACT_TTL) return null;
    return c;
  }

  function reportOf(team, t) {
    const r = reports.get(team + '|' + t.id);
    if (!r || time - r.t > REPORT_TTL || r.target.isDead) return null;
    return r;
  }

  /** Xe `viewer` có biết vị trí của `t` không (đồng minh luôn biết) */
  function knows(viewer, t) {
    if (!viewer || !t) return false;
    if (t === viewer || t.team === viewer.team) return true;
    if (t.isDead) return true;     // xác xe thì ai cũng thấy
    if (t._netHidden) return false;   // máy chủ không gửi vị trí (khuất tầm nhìn cả phe)
    if (seesDirect(viewer, t)) return true;
    if (radarContact(viewer, t)) return true;
    if (reportOf(viewer.team, t)) return true;
    return false;
  }

  /** Mức thông tin để vẽ: 'direct' | 'radar' | 'report' | null */
  function knowledge(viewer, t) {
    if (!viewer || !t) return null;
    if (t.team === viewer.team || t.isDead) return 'direct';
    if (t._netHidden) return null;
    if (seesDirect(viewer, t)) return 'direct';
    if (radarContact(viewer, t)) return 'radar';
    if (reportOf(viewer.team, t)) return 'report';
    return null;
  }

  // ---------------------------------------------------------------------------
  // BÁO VỊ TRÍ
  // ---------------------------------------------------------------------------
  function report(spotter, target, fromNet) {
    if (!spotter || !target || target.isDead || spotter.team === target.team) return;
    const key = spotter.team + '|' + target.id;
    const prev = reports.get(key);
    const fresh = !prev || time - prev.t > REPORT_TTL;
    reports.set(key, { team: spotter.team, target, spotter, t: time, first: fresh ? time : prev.first });
    if (fresh) onNewReport(spotter, target);
    // Máy điều khiển xe trinh sát gửi báo cáo cho các máy khác
    if (!fromNet && game && game.netSync && game.netSync.sendSpot && game.netSync.owns(spotter)) {
      game.netSync.sendSpot(spotter, target);
    }
  }

  function typeName(t) {
    return t.tankType === 'ALL_ROUNDER' ? 'XE TĂNG ĐA DỤNG' : t.tankType === 'GATLING' ? 'XE TĂNG 6 NÒNG'
      : t.tankType === 'ARTILLERY' ? 'PHÁO TỰ HÀNH' : t.tankType === 'SCOUT' ? 'XE TRINH SÁT' : 'XE ĐỊCH';
  }

  function onNewReport(spotter, target) {
    if (!game || !game.player || spotter.team !== game.player.team || typeof game.addCombatLog !== 'function') return;
    const me = game.player;
    const dist = Math.round(Math.hypot(target.x - me.x, target.z - me.z));
    if (spotter === me) {
      game.addCombatLog(`[[radar-2]] ĐÃ BÁO VỊ TRÍ ${typeName(target)} CHO ĐỒNG ĐỘI (radar đang bám mục tiêu)`, 'tip');
    } else {
      game.addCombatLog(`[[radar-2]] ${spotter.name} BÁO VỊ TRÍ: ${typeName(target)} cách bạn ${dist}M — [TAB] để khóa`, 'tip');
      if (window.soundEngine && typeof window.soundEngine.playReconPing === 'function') window.soundEngine.playReconPing();
    }
  }

  // ---------------------------------------------------------------------------
  // CẬP NHẬT MỖI KHUNG
  // ---------------------------------------------------------------------------
  // Góc quét theo quy ước azimuth của game: 0 = hướng -Z, tăng theo chiều kim đồng hồ nhìn từ trên
  function bearing(from, to) {
    let a = Math.atan2(to.x - from.x, -(to.z - from.z));
    if (a < 0) a += TWO_PI;
    return a;
  }

  function updateRadar(u, units, dt) {
    if (!hasRadar(u)) {
      if (u.radarContacts) u.radarContacts.clear();
      return;
    }
    if (!u.radarContacts) u.radarContacts = new Map();
    const prev = u.radarSweep === undefined ? Math.random() * TWO_PI : u.radarSweep;
    const step = TWO_PI * RADAR_RPS * dt;
    const next = (prev + step) % TWO_PI;
    u.radarSweep = next;
    const R = radarRange(u);
    for (const e of units) {
      if (e.isDead || e.team === u.team) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      if (d > R) continue;
      // Tia quét vừa đi qua hướng mục tiêu (hoặc mục tiêu sát bên xe)
      let rel = bearing(u, e) - prev;
      if (rel < 0) rel += TWO_PI;
      if (rel <= step + 1e-4 || d < 40) {
        const c = u.radarContacts.get(e.id) || {};
        c.x = e.x; c.z = e.z; c.t = time; c.inBush = !!e.isInBush; c.unit = e;
        u.radarContacts.set(e.id, c);
      }
    }
    for (const [id, c] of u.radarContacts) {
      if (time - c.t > CONTACT_TTL || !c.unit || c.unit.isDead) u.radarContacts.delete(id);
    }
  }

  // Bot trinh sát tự khóa mục tiêu radar gần nhất (để báo vị trí cho đồng đội)
  function botPickLock(u) {
    if (u.isPlayer || u._netProxy || !hasRadar(u)) return;
    const cur = u.intelLock;
    if (cur && !cur.isDead && radarContact(u, cur) && (u._intelLockHold || 0) > 0) return;
    let best = null, bd = Infinity;
    for (const c of u.radarContacts.values()) {
      if (!c.unit || c.unit.isDead || time - c.t > CONTACT_TTL) continue;
      const d = Math.hypot(c.x - u.x, c.z - u.z);
      if (d < bd) { bd = d; best = c.unit; }
    }
    u.intelLock = best;
    u._intelLockHold = best ? 4 : 0;
  }

  function update(dt, units, player, lockedTarget) {
    if (!units) return;
    time += dt;
    // Người chơi: mục tiêu đang khóa là mục tiêu báo cáo
    if (player) player.intelLock = player.isDead ? null : (lockedTarget || null);
    for (const u of units) {
      if (u.tankType !== 'SCOUT') continue;
      if (u.isDead) { u.intelLock = null; if (u.radarContacts) u.radarContacts.clear(); continue; }
      // Xe từ máy khác: radar chỉ để quay ăng-ten cho đẹp, báo cáo do máy chủ quản gửi sang
      updateRadar(u, units, dt);
      if (u._intelLockHold > 0) u._intelLockHold -= dt;
      botPickLock(u);
      const T = u.intelLock;
      if (u._netProxy || !T || T.isDead || T.team === u.team) continue;
      // Chỉ báo được khi mục tiêu nằm trong vùng radar & đang có vết radar
      const inRange = Math.hypot(T.x - u.x, T.z - u.z) <= radarRange(u);
      if (!inRange || !radarContact(u, T)) continue;
      u._reportAcc = (u._reportAcc || 0) - dt;
      if (u._reportAcc <= 0) {
        u._reportAcc = REPORT_EVERY;
        report(u, T, false);
      }
    }
    for (const [k, r] of reports) if (time - r.t > REPORT_TTL || r.target.isDead) reports.delete(k);

    // Dấu "vị trí cuối" cho người chơi: lúc địch vừa khuất khỏi tầm biết
    if (player) {
      for (const u of units) {
        if (u.team === player.team || u.isDead) { ghosts.delete(u.id); continue; }
        const k = knows(player, u);
        if (k) { u._intelKnownAt = time; ghosts.delete(u.id); }
        else if (u._intelKnownAt !== undefined && time - u._intelKnownAt < 0.2 && !ghosts.has(u.id)) {
          ghosts.set(u.id, { x: u.x, z: u.z, t: time, type: u.tankType });
        }
      }
      for (const [id, g] of ghosts) if (time - g.t > LOST_GHOST_TTL) ghosts.delete(id);
    }
  }

  // ---------------------------------------------------------------------------
  // VẼ LÊN BẢN ĐỒ (minimap & bản đồ chiến thuật). toScreen(x, z) -> {x, y}; pxPerUnit: tỉ lệ
  // ---------------------------------------------------------------------------
  function drawOnMap(ctx, viewer, units, toScreen, pxPerUnit, opts) {
    if (!viewer) return;
    const o = Object.assign({ dot: 3.2, playerDot: 4.5, labels: false }, opts || {});
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.save();
    // Vùng nhìn của mình + radar quét (xe trinh sát)
    if (!viewer.isDead) {
      const s = toScreen(viewer.x, viewer.z);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(s.x, s.y, sightRange(viewer) * pxPerUnit, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      if (hasRadar(viewer)) {
        const R = radarRange(viewer) * pxPerUnit;
        ctx.strokeStyle = 'rgba(110,231,183,0.45)';
        ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, TWO_PI); ctx.stroke();
        // tia quét đúng góc ăng-ten radar thật (azimuth 0 = lên trên bản đồ)
        const a = (viewer.radarSweep || 0) - Math.PI / 2;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
        g.addColorStop(0, 'rgba(110,231,183,0)'); g.addColorStop(1, 'rgba(110,231,183,0.28)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, R, a - 0.45, a); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(110,231,183,0.85)';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R); ctx.stroke();
      }
    }
    // Vị trí cuối cùng của địch vừa mất dấu
    for (const g of ghosts.values()) {
      const s = toScreen(g.x, g.z);
      const k = 1 - (time - g.t) / LOST_GHOST_TTL;
      ctx.strokeStyle = `rgba(255,120,100,${0.6 * k})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(s.x, s.y, o.dot + 2, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,140,120,${0.8 * k})`;
      ctx.font = `bold ${Math.round(o.dot * 3)}px Share Tech Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('?', s.x, s.y + o.dot);
    }
    for (const u of units) {
      if (u.isDead) continue;
      const lv = knowledge(viewer, u);
      if (!lv) continue;
      const ally = u.team === viewer.team;
      let x = u.x, z = u.z;
      if (lv === 'radar') { const c = radarContact(viewer, u); x = c.x; z = c.z; }
      const s = toScreen(x, z);
      const r = u === viewer ? o.playerDot : o.dot;
      if (ally) {
        ctx.fillStyle = u.team === 'BLUE' ? '#00e5ff' : '#ff3b30';
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TWO_PI); ctx.fill();
        if (u !== viewer && u.intelLock && hasRadar(u) && reportOf(u.team, u.intelLock)) {
          // đường liên kết từ xe trinh sát đến mục tiêu đang báo
          const t = toScreen(u.intelLock.x, u.intelLock.z);
          ctx.strokeStyle = 'rgba(110,231,183,0.35)'; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.setLineDash([]);
        }
        continue;
      }
      const col = u.team === 'BLUE' ? '0,229,255' : '255,59,48';
      if (lv === 'direct') {
        ctx.fillStyle = `rgb(${col})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TWO_PI); ctx.fill();
      } else if (lv === 'radar') {
        // vết radar: ô vuông rỗng mờ dần theo thời gian kể từ lần quét
        const c = radarContact(viewer, u);
        const a = Math.max(0.25, 1 - (time - c.t) / CONTACT_TTL);
        ctx.strokeStyle = `rgba(110,231,183,${a})`; ctx.lineWidth = 1.5;
        ctx.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.55, 0, TWO_PI); ctx.fill();
      }
      if (reportOf(viewer.team, u)) {
        // địch được đồng đội báo vị trí: hình thoi nhấp nháy
        const k = r + 3 + pulse * 2;
        ctx.strokeStyle = `rgba(255,214,10,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(s.x, s.y - k); ctx.lineTo(s.x + k, s.y); ctx.lineTo(s.x, s.y + k); ctx.lineTo(s.x - k, s.y); ctx.closePath(); ctx.stroke();
        if (lv === 'report') { ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.8, 0, TWO_PI); ctx.fill(); }
        if (o.labels) {
          ctx.fillStyle = '#ffd60a'; ctx.font = '10px Share Tech Mono, monospace'; ctx.textAlign = 'center';
          const lbl = typeName(u), lw = ctx.measureText(lbl).width;
          ctx.fillText(lbl, s.x + 7, s.y - k - 4);
          ctx.font = '11px "tabler-icons"';
          ctx.fillText(UIIcons.glyph('radar-2'), s.x - lw / 2 - 1, s.y - k - 4);
        }
      }
    }
    ctx.restore();
  }

  return {
    SIGHT, RADAR_RANGE,
    bind, reset, update, knows, knowledge, report, hasRadar, radarRange, sightRange, seesDirect, radarContact, reportOf, drawOnMap, typeName,
    get time() { return time; },
    get reports() { return reports; }
  };
})();

if (typeof window !== 'undefined') window.TeamIntel = TeamIntel;
