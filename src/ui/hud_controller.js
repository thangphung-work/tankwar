/**
 * Module Điều Khiển Giao Diện Tác Chiến HUD & Nhật Ký Chiến Đấu (Tactical HUD Controller)
 * - Thanh trạng thái đối đầu: Bảng tỷ số K/D, dải 10 icon xe co giãn mượt mà của 2 phe
 * - Bảng điều khiển hỏa lực: Thanh đạn dược theo từng loại xe, nạp lại, góc ngắm, tốc độ
 * - Bản đồ radar chiến thuật mini ở góc phải
 * - Nhật ký chiến đấu combat log hiển thị các diễn biến nảy lửa thời gian thực
 */
class HUDController {
  constructor(game) {
    this.game = game;
  }

  updateTargetLockUI() {
    const box = document.getElementById('target-lock-stat-box');
    const textEl = document.getElementById('target-lock-text');
    const subEl = document.getElementById('target-lock-sub');
    if (!box || !textEl) return;

    if (this.game.lockedTarget && !this.game.lockedTarget.isDead) {
      box.classList.add('locked');
      let tankName = 'XE ĐỊCH';
      if (this.game.lockedTarget.tankType === 'ALL_ROUNDER') tankName = 'TĂNG ĐA DỤNG';
      else if (this.game.lockedTarget.tankType === 'GATLING') tankName = 'TĂNG 6 NÒNG';
      else if (this.game.lockedTarget.tankType === 'ARTILLERY') tankName = 'PHÁO TỰ HÀNH';
      else if (this.game.lockedTarget.tankType === 'SCOUT') tankName = 'XE TRINH SÁT';

      const dist = Math.round(Math.hypot(this.game.lockedTarget.x - this.game.player.x, this.game.lockedTarget.z - this.game.player.z));
      const hpPercent = Math.round((this.game.lockedTarget.hp / this.game.lockedTarget.maxHp) * 100);

      textEl.textContent = `${tankName} (${hpPercent}%)`;
      if (subEl) subEl.textContent = `[${dist}M // TAB: CHUYỂN]`;
    } else {
      box.classList.remove('locked');
      textEl.textContent = 'CHƯA KHÓA';
      if (subEl) subEl.textContent = '[TAB: KHÓA ĐỊCH GẦN]';
    }
  }

  updateTeamScoreUI() {
    const blueLivesEl = document.getElementById('blue-lives-count');
    const redLivesEl = document.getElementById('red-lives-count');
    const blueKdEl = document.getElementById('blue-kd-val');
    const redKdEl = document.getElementById('red-kd-val');
    const blueUnitsEl = document.getElementById('blue-units-count');
    const redUnitsEl = document.getElementById('red-units-count');
    const scoreBlueEl = document.getElementById('score-blue-val');
    const scoreRedEl = document.getElementById('score-red-val');

    const bKills = (this.game && typeof this.game.blueKills === 'number') ? this.game.blueKills : 0;
    const bDeaths = (this.game && typeof this.game.blueDeaths === 'number') ? this.game.blueDeaths : 0;
    const rKills = (this.game && typeof this.game.redKills === 'number') ? this.game.redKills : 0;
    const rDeaths = (this.game && typeof this.game.redDeaths === 'number') ? this.game.redDeaths : 0;

    if (blueLivesEl) blueLivesEl.textContent = '∞ (10s)';
    if (redLivesEl) redLivesEl.textContent = '∞ (10s)';
    if (blueKdEl) blueKdEl.textContent = `${bKills}/${bDeaths}`;
    if (redKdEl) redKdEl.textContent = `${rKills}/${rDeaths}`;

    if (this.game.units) {
      const blueUnits = this.game.units.filter(u => u.team === 'BLUE');
      const redUnits = this.game.units.filter(u => u.team === 'RED');
      const blueAlive = blueUnits.filter(u => !u.isDead).length;
      const redAlive = redUnits.filter(u => !u.isDead).length;

      if (blueUnitsEl) blueUnitsEl.textContent = blueAlive.toString();
      if (redUnitsEl) redUnitsEl.textContent = redAlive.toString();
      // Hiển thị Điểm Hạ Gục tại bảng điểm trung tâm
      if (scoreBlueEl) scoreBlueEl.textContent = bKills.toString();
      if (scoreRedEl) scoreRedEl.textContent = rKills.toString();

      // Cập nhật thanh ưu thế hạ gục thế trận
      const momentumBlue = document.getElementById('kill-momentum-blue');
      const momentumRed = document.getElementById('kill-momentum-red');
      if (momentumBlue && momentumRed) {
        const totalKills = bKills + rKills;
        let bluePct = 50;
        if (totalKills > 0) {
          bluePct = Math.max(15, Math.min(85, Math.round((bKills / totalKills) * 100)));
        }
        momentumBlue.style.width = `${bluePct}%`;
        momentumRed.style.width = `${100 - bluePct}%`;
      }

      // Cập nhật danh sách icon xe tăng hàng ngang của Phe Xanh
      const blueTankIconsContainer = document.getElementById('blue-tank-icons');
      if (blueTankIconsContainer) {
        const html = this.renderTankIconsHTML(blueUnits, 'BLUE');
        if (html !== blueTankIconsContainer._html) {
          blueTankIconsContainer._html = html;
          blueTankIconsContainer.innerHTML = html;
        }
      }

      // Cập nhật danh sách icon xe tăng hàng ngang của Phe Đỏ
      const redTankIconsContainer = document.getElementById('red-tank-icons');
      if (redTankIconsContainer) {
        const html = this.renderTankIconsHTML(redUnits, 'RED');
        if (html !== redTankIconsContainer._html) {
          redTankIconsContainer._html = html;
          redTankIconsContainer.innerHTML = html;
        }
      }
    }
  }

  // Hình bóng xe nhìn ngang (dùng cho dải xe 2 phe và ô thông tin xe của mình)
  tankSvg(type) {
    if (type === 'GATLING') {
      return `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <rect x="2" y="14" width="26" height="5.5" rx="1.5" />
            <polygon points="3,14 27,14 29,9 4,9" />
            <rect x="7" y="5.5" width="14" height="5.5" rx="1.5" />
            <rect x="21" y="6.5" width="11" height="1.6" rx="0.5" />
            <rect x="21" y="9" width="11" height="1.6" rx="0.5" />
            <circle cx="33" cy="8.5" r="2.2" />
          </svg>`;
    }
    if (type === 'ARTILLERY') {
      return `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <rect x="1" y="15" width="31" height="5" rx="1.5" />
            <polygon points="2,15 32,15 34,10.5 3,10.5" />
            <rect x="4" y="6" width="16" height="6.5" rx="1.5" />
            <g transform="rotate(-15 16 9)">
              <rect x="15" y="8" width="18" height="2.2" rx="0.5" />
              <rect x="24" y="7" width="3.5" height="4.2" rx="0.8" opacity="0.9" />
            </g>
          </svg>`;
    }
    if (type === 'SCOUT') {
      return `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <circle cx="5" cy="16.5" r="3.2" />
            <circle cx="12" cy="16.5" r="3.2" />
            <circle cx="19" cy="16.5" r="3.2" />
            <circle cx="26" cy="16.5" r="3.2" />
            <polygon points="2,13.5 29,13.5 33,9.5 4,9.5" />
            <polygon points="10,9.5 21,9.5 23,6.5 12,6.5" />
            <rect x="21" y="7.5" width="11" height="1.4" rx="0.4" />
            <line x1="13" y1="6.5" x2="13" y2="2" stroke="currentColor" stroke-width="1.2" />
            <circle cx="13" cy="2" r="1.5" />
          </svg>`;
    }
    return `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <rect x="2" y="14.5" width="28" height="5" rx="1.8" />
            <polygon points="3,14.5 29,14.5 33,9.5 5,9.5" />
            <polygon points="8,9.5 24,9.5 27,5 11,5" />
            <rect x="24" y="6.5" width="11" height="2" rx="0.5" />
            <rect x="28" y="5.5" width="3.2" height="4" rx="0.6" opacity="0.9" />
          </svg>`;
  }

  renderTankIconsHTML(units, team) {
    const isBlue = team === 'BLUE';
    return units.map((u, idx) => {
      const isDead = !!u.isDead;
      const isPlayer = !!u.isPlayer;
      const statusClass = isDead ? 'dead' : 'alive';
      const teamClass = isBlue ? 'blue-unit' : 'red-unit';
      const playerClass = isPlayer ? 'is-player' : '';
      const unitName = u.name || (isBlue ? `Pháo Xanh #${idx + 1}` : `Pháo Đỏ #${idx + 1}`);
      const maxHp = u.maxHp || 2;
      const currentHp = Math.max(0, u.hp || 0);
      const hpPercent = Math.max(0, Math.min(100, Math.round((currentHp / maxHp) * 100)));

      // Lấy thời gian chờ tái xuất kích nếu xe đang chết
      const respawnItem = this.game.respawnQueue ? this.game.respawnQueue.find(r => r.unit === u) : null;
      const respawnSec = (respawnItem && respawnItem.timer > 0) ? Math.ceil(respawnItem.timer) : '';

      const tooltip = `${unitName} (${u.tankType || 'ALL_ROUNDER'}) // ${isDead ? `ĐÃ BỊ TIÊU DIỆT ${respawnSec ? `(Tái xuất sau ${respawnSec}s)` : ''}` : `MÁU: ${currentHp.toFixed(1)}/${maxHp}`}`;

      const svgContent = this.tankSvg(u.tankType || 'ALL_ROUNDER');

      return `
        <div class="tank-status-icon ${teamClass} ${statusClass} ${playerClass}" title="${tooltip}" data-unit-id="${u.id || idx}">
          ${isPlayer ? '<span class="player-pip-tag">BẠN</span>' : ''}
          <div class="tank-svg-wrap">
            ${svgContent}
          </div>
          ${isDead ? `
            <div class="dead-overlay">
              <span class="dead-cross"><i class="ti ti-x" aria-hidden="true"></i></span>
              ${respawnSec ? `<span class="respawn-mini-sec">${respawnSec}s</span>` : ''}
            </div>
          ` : `
            <div class="tank-hp-bar">
              <div class="tank-hp-fill" style="width: ${hpPercent}%"></div>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  initHUD() {
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
      fireBtn.addEventListener('click', () => this.triggerPlayerFire());
    }

    // Nút chọn Liều phóng 1-5
    const chargeBtns = document.querySelectorAll('.charge-btn');
    chargeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const c = parseInt(btn.getAttribute('data-charge'), 10);
        this.selectCharge(c);
      });
    });

    // Nút chọn Loại đạn pháo: NORMAL (Thường), AP (Xuyên phá), HE (Nổ mạnh)
    const ammoBtns = document.querySelectorAll('.ammo-tab');
    ammoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const ammo = btn.getAttribute('data-ammo');
        this.selectAmmoType(ammo);
      });
    });


    const restartBtn = document.getElementById('restart-game-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartMatch());
    }
  }

  // Câu nhắc kho vật tư khi bắn hết 1 loại đạn (Equipment.outOfStockNote)
  stockNote(k) {
    const P = this.player || (this.game && this.game.player);
    return (typeof Equipment !== 'undefined' && Equipment.outOfStockNote && P) ? Equipment.outOfStockNote(P, k) : '';
  }

  selectAmmoType(ammoType) {
    if (!this.game.player) return;
    // đang dùng súng máy nóc tháp [4]: chọn đạn pháo = quay về pháo chính
    if (this.game.player.mgActive && this.game.selectMG) this.game.selectMG(false);
    if (this.game.player.ewActive && this.game.selectJammer) this.game.selectJammer(false);

    // Kiểm tra cơ số đạn nâng cao
    if (ammoType === 'AP' && (this.game.player.apAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn xuyên phá! Nhặt hòm tiếp tế trên map' + this.stockNote('AP'), 'alert');
      return;
    }
    if (ammoType === 'HE' && (this.game.player.heAmmoCount || 0) <= 0 && this.game.player.tankType !== 'ARTILLERY') {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn nổ mạnh! Nhặt hòm tiếp tế trên map' + this.stockNote('HE'), 'alert');
      return;
    }
    if (ammoType === 'CLUSTER' && (this.game.player.clusterAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn chùm nổ trên không! Nhặt hòm tiếp tế trên map' + this.stockNote('CLUSTER'), 'alert');
      return;
    }
    if (ammoType === 'INCENDIARY' && (this.game.player.incendiaryAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn cháy! Súng chuyển về đạn thường' + this.stockNote('INCENDIARY'), 'alert');
      return;
    }
    if (ammoType === 'ANTI_TANK_MISSILE' && (this.game.player.missileAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết tên lửa! Nhặt hòm tiếp tế trên map' + this.stockNote('ANTI_TANK_MISSILE'), 'alert');
      return;
    }

    const changed = this.game.player.selectedAmmo !== ammoType;
    this.game.player.selectedAmmo = ammoType;
    this.updateAmmoUI();
    if (changed && window.soundEngine && typeof window.soundEngine.playAmmoSwitch === 'function') {
      window.soundEngine.playAmmoSwitch(ammoType);
    }

    let name = 'ĐẠN CƠ BẢN 120MM (ST 1.6)';
    if (ammoType === 'AP') {
      name = 'ĐẠN XUYÊN GIÁP APFSDS LÕI URANI NGHÈO (ST 2.3 · BAY NHANH, XUYÊN SÂU, HỎNG BỘ PHẬN BÊN TRONG)';
    } else if (ammoType === 'HE') {
      name = this.game.player.tankType === 'ARTILLERY' ? 'ĐẠN NỔ MẠNH 155MM (ST 3.6 · NỔ LAN 135M)' : 'ĐẠN NỔ MẠNH 120MM (ST 2.0 · NỔ LAN 75M)';
    } else if (ammoType === 'CLUSTER') {
      name = 'ĐẠN CHÙM DPICM (NỔ TRÊN KHÔNG, BUNG 18 ĐẠN CON ĐÁNH VÀO NÓC GIÁP MỎNG)';
    } else if (ammoType === 'INCENDIARY') {
      name = 'ĐẠN CHÁY (ST 0.16 · THIÊU ĐỐT, CHÁY THỦNG BÌNH XĂNG XE NHẸ)';
    } else if (ammoType === 'ANTI_TANK_MISSILE') {
      name = 'TÊN LỬA CHỐNG TĂNG DẪN HƯỚNG (KHÓA XE ĐỊCH ĐANG NHÌN THẤY RỒI BẤM SPACE · GIỮ XE SỐNG TỚI KHI TRÚNG)';
    } else if (ammoType === 'GATLING_BULLET') {
      name = 'ĐẠN 30MM NỔ-CHÁY 6 NÒNG (TẦM ~1000M · XÉ GIÁP NHẸ, YẾU VỚI XE TĂNG)';
    } else if (ammoType === 'SCOUT_BULLET') {
      name = 'ĐẠN SÚNG MÁY 12.7MM (TẦM ~700M · THỦNG LỐP, PHỤ KIỆN, GIÁP NHẸ)';
    }

    this.addCombatLog(`Đã nạp: ${name}`, 'tip');
  }

  updateAmmoUI() {
    if (!this.game.player) return;
    const ammoContainer = document.getElementById('ammo-selector');
    if (!ammoContainer) return;

    const p = this.game.player;
    const ammos = p.availableAmmos || ['NORMAL', 'AP', 'HE'];
    const artyHe = p.tankType === 'ARTILLERY';

    // Tên ngắn, số lượng, màu nhận diện của từng loại đạn
    const info = (type) => {
      switch (type) {
        case 'AP': return { name: 'XUYÊN GIÁP', qty: p.apAmmoCount || 0, color: '#3cc8ff' };
        case 'HE': return { name: 'NỔ MẠNH', qty: artyHe && !(p.heAmmoCount > 0) ? Infinity : (p.heAmmoCount || 0), color: '#ffb020' };
        case 'CLUSTER': return { name: 'ĐẠN CHÙM', qty: p.clusterAmmoCount || 0, color: '#5cf08a' };
        case 'INCENDIARY': return { name: 'ĐẠN CHÁY', qty: p.incendiaryAmmoCount || 0, color: '#ff6a2b' };
        case 'ANTI_TANK_MISSILE': return { name: 'TÊN LỬA', qty: p.missileAmmoCount || 0, color: '#ff8c42' };
        case 'GATLING_BULLET': return { name: '30MM', qty: Infinity, color: '#ffd166' };
        case 'SCOUT_BULLET': return { name: '12.7MM', qty: Infinity, color: '#ffd166' };
        default: return { name: 'THƯỜNG', qty: Infinity, color: '#e4edf2' };
      }
    };

    const armorTag = document.getElementById('reactive-armor-tag');
    if (armorTag) {
      armorTag.classList.toggle('hidden', !p.hasReactiveArmor);
    }

    const list = ammos.map(type => ({ type, ...info(type) }));
    // Xe tăng: ô [4] súng máy 7.62mm nóc tháp — số đạn còn trong dây, đang thay hộp thì hiện "NẠP"
    const mg = p.tankType === 'ALL_ROUNDER' && p.rcwsGun;
    if (mg) {
      const S = p._rcws;
      list.push({ type: 'MG762', name: 'SÚNG MÁY', qty: S ? (S.reload > 0 ? 'NẠP' : S.mag) : 200, color: '#c8d6a0', mg: true });
    }
    // Xe tăng: ô [4] máy phá sóng chống UAV — đang phát: giây còn lại; tắt: % pin (dưới mức bật được thì "SẠC")
    const ew = p.tankType === 'ALL_ROUNDER' && p.jammer && typeof EWJammer !== 'undefined';
    const ewOn = ew && this.game.jamming && this.game.jamming(p);
    if (ew) {
      const J = p._jam || { e: 1 }, EC = EWJammer.C, lost = !this.game.canJam(p);
      const qty = lost ? 'HỎNG' : ewOn ? `${Math.ceil(J.e * EC.ON)}S` : J.e < EC.MIN ? `SẠC ${Math.round(J.e * 100)}%` : `${Math.round(J.e * 100)}%`;
      list.push({ type: 'EW', name: ewOn ? 'ĐANG PHÁ SÓNG' : 'PHÁ SÓNG', qty, color: '#7fd3ff', ew: true });
    }
    // Chỉ dựng lại khi có thay đổi (hàm này được gọi mỗi khung hình; dựng lại liên tục làm nút mất cú nhấp)
    const sig = p.selectedAmmo + (p.mgActive ? '+mg' : '') + (p.ewActive ? '+ews' : '') + (ewOn ? '+ew' : '') + '|' + list.map(a => a.type + ':' + a.qty).join(',');
    if (ammoContainer._sig === sig) return;
    ammoContainer._sig = sig;

    ammoContainer.innerHTML = list.map((a, idx) => {
      const isActive = a.ew ? !!p.ewActive : a.mg ? !!p.mgActive : (!p.mgActive && !p.ewActive && p.selectedAmmo === a.type);
      const qtyStr = typeof a.qty === 'string' ? a.qty : a.qty === Infinity ? '∞' : `×${a.qty}`;
      const empty = typeof a.qty === 'number' && a.qty !== Infinity && a.qty <= 0;
      return `
        <button class="ammo-tab ${isActive ? 'active' : ''} ${empty ? 'empty' : ''}" data-ammo="${a.type}" id="ammo-tab-${a.type}" title="[${idx + 1}] ${a.name}" style="--ammo: ${a.color}">
          <span class="hx-ammo-key">${idx + 1}</span>
          <svg class="hx-ammo-icon" viewBox="0 0 24 24">
            <path d="M12 2.5 L15 8 L9 8 Z" fill="${a.color}"/>
            <rect x="9" y="8" width="6" height="10.5" fill="#5b6b78"/>
            <rect x="8.5" y="18.5" width="7" height="2.5" fill="#c9a24a"/>
          </svg>
          <span class="hx-ammo-name">${a.name}</span>
          <span class="hx-ammo-qty">${qtyStr}</span>
        </button>
      `;
    }).join('');

    // Gán lại sự kiện click cho các nút đạn
    ammos.forEach(type => {
      const btn = document.getElementById(`ammo-tab-${type}`);
      if (btn) {
        btn.addEventListener('click', () => this.selectAmmoType(type));
      }
    });
    if (mg) {
      const btn = document.getElementById('ammo-tab-MG762');
      if (btn) btn.addEventListener('click', () => this.game.selectMG(true));
    }
    if (ew) {
      const btn = document.getElementById('ammo-tab-EW');
      if (btn) btn.addEventListener('click', () => this.game.selectJammer());
    }
  }

  selectCharge(chargeNum) {
    if (!this.game.player || chargeNum < 1 || chargeNum > 10) return;
    this.game.player.charge = chargeNum;

    const chargeBtns = document.querySelectorAll('.charge-btn');
    chargeBtns.forEach(btn => {
      if (parseInt(btn.getAttribute('data-charge'), 10) === chargeNum) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }



  updateHUDValues() {
    const battleTimerEl = document.getElementById('battle-timer');
    if (battleTimerEl) {
      const elapsedSecs = Math.max(0, Math.floor((Date.now() - this.matchStartTime) / 1000));
      const remainingSecs = Math.max(0, (this.game.matchDuration || 600) - elapsedSecs);
      const m = Math.floor(remainingSecs / 60).toString().padStart(2, '0');
      const s = (remainingSecs % 60).toString().padStart(2, '0');
      battleTimerEl.textContent = `${m}:${s}`;

      // Hết 10 phút thi đấu: Kết thúc trận chiến và tính điểm Kills
      if (remainingSecs <= 0 && !this.isGameOver && this.isGameStarted) {
        this.finishMatchByTime();
      }
    }

    if (!this.game.player) return;

    const hpBar = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    if (hpBar && hpText) {
      const hpPct = Math.max(0, (this.game.player.hp / this.game.player.maxHp) * 100);
      hpBar.style.width = `${hpPct}%`;
      hpText.textContent = `${this.game.player.hp}/${this.game.player.maxHp} MÁU`;
    }

    this.updateAmmoUI();

    const reloadBar = document.getElementById('reload-bar');
    const reloadText = document.getElementById('reload-text');
    const fireBtn = document.getElementById('fire-btn');
    const fireMainText = (fireBtn && typeof fireBtn.querySelector === 'function') ? fireBtn.querySelector('.fire-main-text') : null;

    if (fireMainText) {
      if (this.game.player.mgActive) {
        const S = this.game.player._rcws;
        fireMainText.textContent = S && S.reload > 0 ? 'SÚNG MÁY [THAY HỘP]' : `SÚNG MÁY [${S ? S.mag : 200}]`;
        fireMainText.style.color = '#c8d6a0';
      } else if (this.game.player.selectedAmmo === 'AP') {
        fireMainText.textContent = `XUYÊN PHÁ [${this.game.player.apAmmoCount}]`;
        fireMainText.style.color = '#5fb0dc';
      } else if (this.game.player.selectedAmmo === 'HE') {
        fireMainText.textContent = `NỔ MẠNH [${this.game.player.heAmmoCount}]`;
        fireMainText.style.color = '#e0675c';
      } else {
        fireMainText.textContent = 'KHAI HỎA (THƯỜNG)';
        fireMainText.style.color = '#ffffff';
      }
    }

    if (reloadBar && reloadText) {
      if (this.game.player.reloadTimer <= 0) {
        reloadBar.style.width = '100%';
        reloadText.textContent = 'SẴN SÀNG';
        reloadText.style.color = '#8fc46f';
        if (fireBtn) fireBtn.disabled = false;
      } else {
        const reloadPct = ((this.game.player.reloadDuration - this.game.player.reloadTimer) / this.game.player.reloadDuration) * 100;
        reloadBar.style.width = `${reloadPct}%`;
        reloadText.textContent = `${this.game.player.reloadTimer.toFixed(1)}S`;
        reloadText.style.color = '#e7a63a';
        if (fireBtn) fireBtn.disabled = true;
      }
    }

    const speedText = document.getElementById('speed-text');
    if (speedText) {
      const speedKmH = Math.round(typeof GameTiming !== 'undefined' ? GameTiming.kmh(Math.abs(this.game.player.speed)) : Math.abs(this.game.player.speed) * 0.45);
      speedText.textContent = `${speedKmH} KM/H`;
    }

    const boostTag = document.getElementById('speed-boost-tag');
    if (boostTag) {
      if (this.game.player.speedBoostTimer > 0) {
        boostTag.classList.remove('hidden');
        UIIcons.set(boostTag, `[[bolt]] TĂNG TỐC: ${Math.ceil(this.game.player.speedBoostTimer)}S`);
      } else {
        boostTag.classList.add('hidden');
      }
    }

    const stealthBanner = document.getElementById('stealth-banner');
    const stealthOverlay = document.getElementById('stealth-camo-overlay');
    const BB = typeof TeamIntel !== 'undefined' && TeamIntel.bushBanner ? TeamIntel.bushBanner(this.game.player) : null;
    const isPlayerInBush = !!BB && BB.cover;
    const isPlayerRevealed = isPlayerInBush && BB.warn;

    if (stealthBanner) {
      if (BB) {
        stealthBanner.classList.remove('hidden');
        stealthBanner.innerHTML = `<span class="stealth-pulse-dot ${BB.warn ? 'red' : 'green'}"></span> ${BB.html}`;
        stealthBanner.classList.toggle('revealed', BB.warn);
      } else {
        stealthBanner.classList.add('hidden');
      }
    }

    if (stealthOverlay) {
      if (isPlayerInBush) {
        stealthOverlay.classList.add('active');
        if (isPlayerRevealed) {
          stealthOverlay.classList.add('revealed');
        } else {
          stealthOverlay.classList.remove('revealed');
        }
      } else {
        stealthOverlay.classList.remove('active');
        stealthOverlay.classList.remove('revealed');
      }
    }

    const terrainText = document.getElementById('terrain-text');
    if (terrainText) {
      const tInfo = this.game.terrain.getTerrainInfoAt(this.game.player.x, this.game.player.z, this.game.player.currentPitch);
      terrainText.textContent = tInfo.name;
    }

    const windValEl = document.getElementById('hud-wind-val');
    if (windValEl && this.ballistics && this.ballistics.wind) {
      const dir = Math.round(this.ballistics.wind.direction);
      let dirName = 'BẮC';
      if (dir >= 22.5 && dir < 67.5) dirName = 'ĐÔNG BẮC';
      else if (dir >= 67.5 && dir < 112.5) dirName = 'ĐÔNG';
      else if (dir >= 112.5 && dir < 157.5) dirName = 'ĐÔNG NAM';
      else if (dir >= 157.5 && dir < 202.5) dirName = 'NAM';
      else if (dir >= 202.5 && dir < 247.5) dirName = 'TÂY NAM';
      else if (dir >= 247.5 && dir < 292.5) dirName = 'TÂY';
      else if (dir >= 292.5 && dir < 337.5) dirName = 'TÂY BẮC';
      windValEl.textContent = `${dirName} (${dir}°) // ${this.ballistics.wind.speed.toFixed(1)} M/S`;
    }

    // Cập nhật thông tin binh chủng xe tăng đang điều khiển trên HUD
    const tankClassText = document.getElementById('tank-class-text');
    const gatlingSpinTag = document.getElementById('gatling-spin-tag');
    const gatlingMagTag = document.getElementById('gatling-mag-tag');
    const gatlingHeatTag = document.getElementById('gatling-heat-tag');
    const artyDeployTag = document.getElementById('arty-deploy-tag');
    const scoutMissileTag = document.getElementById('scout-missile-tag');
    const scoutRadarTag = document.getElementById('scout-radar-tag');

    if (tankClassText) {
      if (this.game.player.tankType === 'GATLING') {
        UIIcons.set(tankClassText, '[[bolt]] 6 NÒNG CẬN CHIẾN');
        tankClassText.style.color = '#e7a63a';
      } else if (this.game.player.tankType === 'ARTILLERY') {
        UIIcons.set(tankClassText, '[[crosshair]] PHÁO CAO XẠ TỰ HÀNH');
        tankClassText.style.color = '#e0675c';
      } else if (this.game.player.tankType === 'SCOUT') {
        UIIcons.set(tankClassText, '[[radar-2]] XE TRINH SÁT');
        tankClassText.style.color = '#8fc46f';
      } else {
        UIIcons.set(tankClassText, '[[shield]] TANK ĐA DỤNG');
        tankClassText.style.color = '#5fb0dc';
      }
    }

    // 1. XE TĂNG 6 NÒNG (GATLING)
    if (this.game.player.tankType === 'GATLING') {
      if (gatlingSpinTag) {
        gatlingSpinTag.classList.remove('hidden');
        const spinPct = Math.round((this.game.player.spinUpTime / this.game.player.spinRequired) * 100);
        if (spinPct >= 100) {
          UIIcons.set(gatlingSpinTag, '[[bolt]] 100% FULL CÔNG SUẤT!');
          gatlingSpinTag.style.color = '#8fc46f';
        } else if (spinPct > 0) {
          UIIcons.set(gatlingSpinTag, `[[bolt]] KHỞI ĐỘNG: ${spinPct}% (3S)`);
          gatlingSpinTag.style.color = '#e7a63a';
        } else {
          UIIcons.set(gatlingSpinTag, '[[bolt]] GIỮ SPACE: QUAY NÒNG');
          gatlingSpinTag.style.color = '#8d978b';
        }
      }
      if (gatlingMagTag) {
        gatlingMagTag.classList.remove('hidden');
        if (this.game.player.reloadTimer > 0) {
          UIIcons.set(gatlingMagTag, `[[hourglass]] NẠP BĂNG: ${this.game.player.reloadTimer.toFixed(1)}S`);
          gatlingMagTag.style.color = '#e0675c';
        } else {
          gatlingMagTag.textContent = `BĂNG: ${this.game.player.gatlingMag}/${this.game.player.gatlingMagMax}`;
          gatlingMagTag.style.color = '#8fc46f';
        }
      }
      if (gatlingHeatTag) {
        gatlingHeatTag.classList.remove('hidden');
        const heatPct = Math.round((this.game.player.barrelHeat || 0) * 100);
        if (this.game.player.isOverheated) {
          UIIcons.set(gatlingHeatTag, `[[flame]] QUÁ NHIỆT (${heatPct}%) ĐANG NGUỘI...`);
          gatlingHeatTag.style.color = '#e0675c';
        } else {
          UIIcons.set(gatlingHeatTag, `[[flame]] NHIỆT NÒNG: ${heatPct}%`);
          if (heatPct > 65) gatlingHeatTag.style.color = '#e7a63a';
          else if (heatPct > 25) gatlingHeatTag.style.color = '#e7a63a';
          else gatlingHeatTag.style.color = '#8d978b';
        }
      }
      if (artyDeployTag) artyDeployTag.classList.add('hidden');
      if (scoutMissileTag) scoutMissileTag.classList.add('hidden');
      if (scoutRadarTag) scoutRadarTag.classList.add('hidden');

    // 2. PHÁO CAO XẠ TỰ HÀNH (ARTILLERY)
    } else if (this.game.player.tankType === 'ARTILLERY') {
      if (gatlingSpinTag) gatlingSpinTag.classList.add('hidden');
      if (gatlingMagTag) gatlingMagTag.classList.add('hidden');
      if (gatlingHeatTag) gatlingHeatTag.classList.add('hidden');
      if (scoutMissileTag) scoutMissileTag.classList.add('hidden');
      if (scoutRadarTag) scoutRadarTag.classList.add('hidden');

      if (artyDeployTag) {
        artyDeployTag.classList.remove('hidden');
        if (this.game.player.isDeployed) {
          UIIcons.set(artyDeployTag, '[[anchor]] CHÂN CHỐNG: ĐÃ HẠ (SẴN SÀNG KHAI HỎA)');
          artyDeployTag.style.color = '#8fc46f';
        } else if (this.game.player.standStillTimer > 0) {
          const pct = Math.round((this.game.player.deployProgress || 0) * 100);
          UIIcons.set(artyDeployTag, `[[anchor]] ĐANG HẠ CÀNG: ${pct}% (DỪNG 2S)...`);
          artyDeployTag.style.color = '#e7a63a';
        } else {
          UIIcons.set(artyDeployTag, '[[anchor]] CHƯA HẠ CÀNG: DỪNG XE 2S ĐỂ HẠ');
          artyDeployTag.style.color = '#e0675c';
        }
      }

    // 3. XE TRINH SÁT (SCOUT)
    } else if (this.game.player.tankType === 'SCOUT') {
      if (gatlingSpinTag) gatlingSpinTag.classList.add('hidden');
      if (gatlingHeatTag) gatlingHeatTag.classList.add('hidden');
      if (artyDeployTag) artyDeployTag.classList.add('hidden');
      if (gatlingMagTag) {
        gatlingMagTag.classList.remove('hidden');
        if (this.game.player.reloadTimer > 0) {
          UIIcons.set(gatlingMagTag, `[[hourglass]] NẠP SÚNG MÁY: ${this.game.player.reloadTimer.toFixed(1)}S`);
          gatlingMagTag.style.color = '#e0675c';
        } else {
          gatlingMagTag.textContent = `SÚNG MÁY: ${this.game.player.gatlingMag}/${this.game.player.gatlingMagMax}`;
          gatlingMagTag.style.color = '#8fc46f';
        }
      }
      if (scoutMissileTag) {
        scoutMissileTag.classList.remove('hidden');
        if (this.game.player.antiTankCooldown > 0) {
          UIIcons.set(scoutMissileTag, `[[rocket]] TÊN LỬA: NẠP ${this.game.player.antiTankCooldown.toFixed(1)}S`);
          scoutMissileTag.style.color = '#e7a63a';
        } else {
          UIIcons.set(scoutMissileTag, `[[rocket]] TÊN LỬA ×${this.game.player.missileAmmoCount || 0} · BẤM 3`);
          scoutMissileTag.style.color = '#8fc46f';
        }
      }
      if (scoutRadarTag) {
        scoutRadarTag.classList.remove('hidden');
        UIIcons.set(scoutRadarTag, `[[radar-2]] TRINH SÁT: QUÉT 650M`);
        scoutRadarTag.style.color = '#8fc46f';
      }

    // 4. XE ĐA DỤNG (ALL-ROUNDER)
    } else {
      if (gatlingSpinTag) gatlingSpinTag.classList.add('hidden');
      if (gatlingMagTag) gatlingMagTag.classList.add('hidden');
      if (gatlingHeatTag) gatlingHeatTag.classList.add('hidden');
      if (artyDeployTag) artyDeployTag.classList.add('hidden');
      if (scoutMissileTag) scoutMissileTag.classList.add('hidden');
      if (scoutRadarTag) scoutRadarTag.classList.add('hidden');
    }
  }

  syncHUDControls() {
    if (!this.game.player) return;

    const azSlider = document.getElementById('azimuth-slider');
    const azValEl = document.getElementById('azimuth-val');
    if (azSlider && azValEl) {
      azSlider.value = this.game.player.azimuth;
      azValEl.textContent = `${this.game.player.azimuth.toFixed(1).padStart(5, '0')}°`;
    }

    const elSlider = document.getElementById('elevation-slider');
    const elValEl = document.getElementById('elevation-val');
    const fireModeHint = document.getElementById('fire-mode-hint');

    const isFixedGatling = (this.game.player.canElevate === false || this.game.player.tankType === 'GATLING');

    // Cập nhật hướng dẫn phím bấm nâng hạ nòng trên HUD
    const aimGuideEl = document.querySelector('.aim-keys-guide');
    if (aimGuideEl) {
      if (isFixedGatling) {
        aimGuideEl.innerHTML = `
          <span class="key-pill"><b>← / →</b>: Quay tháp pháo</span>
          <span class="key-pill" style="color: #e7a63a; border-color: rgba(231, 166, 58, 0.4);"><b>↑ / ↓</b>: Máy tính tự nâng nòng</span>
          <span class="key-pill"><b>W A S D</b>: Lái xe</span>
        `;
      } else {
        aimGuideEl.innerHTML = `
          <span class="key-pill"><b>← / →</b>: Quay tháp pháo</span>
          <span class="key-pill"><b>↑ / ↓</b>: Nâng / hạ nòng pháo</span>
          <span class="key-pill"><b>W A S D</b>: Lái xe</span>
        `;
      }
    }

    if (elSlider && elValEl) {
      if (isFixedGatling) {
        this.game.player.elevation = 0;
        elSlider.value = 0;
        elValEl.textContent = 'CỐ ĐỊNH 0.0°';
        elValEl.style.color = '#e7a63a';

        if (fireModeHint) {
          fireModeHint.textContent = '[CẬN CHIẾN // NÒNG CỐ ĐỊNH 0°]';
          fireModeHint.style.color = '#e7a63a';
        }
      } else {
        elSlider.value = this.game.player.elevation;
        elValEl.textContent = `${this.game.player.elevation.toFixed(1)}°`;
        elValEl.style.color = '';

        if (fireModeHint) {
          const pred = this.currentPrediction || this.ballistics.predictTrajectoryImpact(
            this.game.player.x, this.game.player.y, this.game.player.z,
            this.game.player.azimuth, this.game.player.elevation, this.game.player.charge,
            this.game.terrain, this.game.player
          );
          // flightTime tính theo giây mô phỏng (= giây thật x bulletSpeedMultiplier) -> đổi về giây thật
          const fT = pred ? (pred.flightTime || 0) / ((this.ballistics && this.ballistics.bulletSpeedMultiplier) || 1) : 0;
          const distStr = pred ? ` // ĐIỂM RƠI: ${pred.distance}M (${fT.toFixed(1)}S)` : '';
          if (this.game.player.elevation < 0) {
            fireModeHint.textContent = `[HẠ NÒNG ÂM]${distStr}`;
            fireModeHint.style.color = '#8fc46f';
          } else if (this.game.player.elevation <= 15) {
            fireModeHint.textContent = `[BẮN THẲNG]${distStr}`;
            fireModeHint.style.color = '#8fc46f';
          } else {
            fireModeHint.textContent = `[CẦU VỒNG]${distStr}`;
            fireModeHint.style.color = '#e7a63a';
          }
        }
      }
    }

    this.selectCharge(this.game.player.charge);
  }

  showGatlingFixedBarrelNotice() {
    const now = Date.now();
    if (!this._lastGatlingNotice || now - this._lastGatlingNotice > 3000) {
      this._lastGatlingNotice = now;
      this.addCombatLog('Xe 6 nòng là xe càn quét cận chiến có nòng cố định trực diện (0°), không thể nâng hạ nòng!', 'alert');
      if (window.soundEngine && typeof window.soundEngine.playTargetLost === 'function') {
        window.soundEngine.playTargetLost();
      }
    }
  }

  addCombatLog(text, type = 'system') {
    const logBox = document.getElementById('combat-log');
    if (!logBox) return;

    // Chặn trùng lặp tin nhắn giống hệt vừa mới hiển thị
    const lastEntry = logBox.lastElementChild;
    if (lastEntry && lastEntry._iconRaw === text) {
      return;
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    UIIcons.set(entry, text);
    logBox.appendChild(entry);

    // Tự động mờ dần và biến mất sau 3.2 giây để giữ màn hình sạch sẽ
    setTimeout(() => {
      entry.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      entry.style.opacity = '0';
      entry.style.transform = 'translateY(-4px)';
      setTimeout(() => {
        if (entry.parentElement) entry.remove();
      }, 400);
    }, 3200);

    if (logBox.children.length > 5) {
      logBox.removeChild(logBox.children[0]);
    }
  }

  render() {
    // 1. Render Scene 3D Three.js
    this.renderer.render(this.scene, this.camera);

    // 2. Render Minimap chuẩn Art of War 3
    this.renderAOWMinimap();

    // 3. Render Tactical Map nếu đang mở
    if (this.tacticalMap.isOpen) {
      this.tacticalMap.render();
    }
  }

  renderAOWMinimap() {
    if (!this.miniCtx || !this.miniCanvas || !this.game.player) return;
    const ctx = this.miniCtx;
    const w = this.miniCanvas.width;
    const h = this.miniCanvas.height;
    const scale = w / this.worldWidth;

    ctx.clearRect(0, 0, w, h);

    // Dựng nền bản đồ
    ctx.drawImage(this.game.terrain.mapCanvas, 0, 0, w, h);

    // Vòng bo
    this.game.zone.renderOnTacticalMap(ctx, scale);

    // Vùng khoanh radar
    this.radar.renderOnTacticalMap(ctx, scale);

    // Vẽ 3 Cứ Điểm Chiến Lược A, B, C trên Minimap
    if (this.game.capturePoints && this.game.capturePoints.length > 0) {
      this.game.capturePoints.forEach(cp => {
        const cx = (cp.x + this.worldWidth / 2) * scale;
        const cz = (cp.z + this.worldDepth / 2) * scale;
        const rMini = (cp.radius / this.worldWidth) * w;

        ctx.save();
        let cpColor = '#ffffff';
        if (cp.owner === 'BLUE') cpColor = '#5fb0dc';
        else if (cp.owner === 'RED') cpColor = '#e0675c';

        // Vòng ranh giới cứ điểm
        ctx.strokeStyle = cpColor;
        ctx.lineWidth = cp.isDisputed ? 2 : 1.2;
        if (cp.isDisputed) ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cz, rMini, 0, Math.PI * 2);
        ctx.stroke();

        // Nút tròn tâm có chữ A, B, C
        ctx.fillStyle = cpColor;
        ctx.beginPath();
        ctx.arc(cx, cz, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 7px Chakra Petch';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cp.id, cx, cz);

        // Vòng đếm thời gian giữ 60s
        if (cp.owner !== 'NEUTRAL') {
          const holdRatio = Math.min(1, cp.holdTimer / 60.0);
          ctx.strokeStyle = '#e7a63a';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(cx, cz, 6.5, -Math.PI / 2, -Math.PI / 2 + holdRatio * Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      });
    }

    // Vẽ Các Hòm Tiếp Tế Rải Rác trên Minimap
    if (this.game.supplyCrates && this.game.supplyCrates.length > 0) {
      this.game.supplyCrates.forEach(crate => {
        if (crate.active) {
          const cx = (crate.x + this.worldWidth / 2) * scale;
          const cz = (crate.z + this.worldDepth / 2) * scale;
          ctx.save();
          const pulse = 4.2 + Math.sin(Date.now() * 0.008 + crate.x) * 1.5;
          ctx.strokeStyle = '#e7a63a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cz, pulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#e7a63a';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.fillRect(cx - 3, cz - 3, 6, 6);
          ctx.strokeRect(cx - 3, cz - 3, 6, 6);

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 1.5, cz - 0.5, 3, 1);
          ctx.fillRect(cx - 0.5, cz - 1.5, 1, 3);
          ctx.restore();
        }
      });
    }

    // Vẽ Hòm Tiếp Tế Thả Dù trên Minimap nếu có
    if (this.game.airdrop && !this.game.airdrop.collected) {
      const ax = (this.game.airdrop.x + this.worldWidth / 2) * scale;
      const az = (this.game.airdrop.z + this.worldDepth / 2) * scale;
      ctx.save();
      ctx.fillStyle = '#e7a63a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, az, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5c46b';
      ctx.font = 'bold 8px Chakra Petch';
      ctx.textAlign = 'center';
      ctx.fillText('HÒM THẢ DÙ', ax, az - 6);
      ctx.restore();
    }

    // Khung nhìn camera Viewport (chuẩn Art of War 3)
    const px = (this.game.player.x + this.worldWidth / 2) * scale;
    const pz = (this.game.player.z + this.worldDepth / 2) * scale;

    // VÒNG TRÒN BÁN KÍNH TẦM BẮN & ĐIỂM RƠI DỰ KIẾN TRÊN MINIMAP
    const pred = this.currentPrediction || this.ballistics.predictTrajectoryImpact(
      this.game.player.x, this.game.player.y, this.game.player.z,
      this.game.player.azimuth, this.game.player.elevation, this.game.player.charge,
      this.game.terrain, this.game.player
    );

    // 1. Vòng tròn bán kính tầm bắn tối đa của liều phóng hiện tại
    const maxRangeMini = (pred.maxRange / this.worldWidth) * w;
    ctx.save();
    ctx.strokeStyle = 'rgba(223, 228, 217, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(px, pz, maxRangeMini, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Tia laser dẫn bắn từ xe đến điểm rơi trên Minimap
    const impX = (pred.impactX + this.worldWidth / 2) * scale;
    const impZ = (pred.impactZ + this.worldDepth / 2) * scale;

    ctx.strokeStyle = pred.hitType === 'WALL' ? 'rgba(255, 59, 48, 0.75)' : 'rgba(231, 166, 58, 0.75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(impX, impZ);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Tâm ngắm điểm rơi trên Minimap
    ctx.strokeStyle = pred.hitType === 'WALL' ? '#e0675c' : '#e7a63a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(impX, impZ, 3.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = pred.hitType === 'WALL' ? '#e0675c' : '#e7a63a';
    ctx.beginPath();
    ctx.arc(impX, impZ, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3b. Vẽ các cụm bụi rậm ngụy trang trên Minimap
    if (this.game.terrain && this.game.terrain.bushClusters) {
      ctx.save();
      ctx.fillStyle = 'rgba(46, 125, 50, 0.4)';
      ctx.strokeStyle = 'rgba(76, 175, 80, 0.65)';
      ctx.lineWidth = 1;
      this.game.terrain.bushClusters.forEach(bc => {
        const bx = (bc.x + this.worldWidth / 2) * scale;
        const bz = (bc.z + this.worldDepth / 2) * scale;
        const br = bc.radius * scale;
        ctx.beginPath();
        ctx.arc(bx, bz, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    // 4. Vẽ các xe pháo 2 phe trên Minimap (Xe địch núp bụi tàng hình sẽ không vẽ)
    this.game.units.forEach(u => {
      if (u.isDead) return;
      if (u.isHiddenFromPlayer) return; // Địch chưa bị phát hiện (vd núp bụi ở xa): Không hiển thị trên Minimap!

      const ux = (u.x + this.worldWidth / 2) * scale;
      const uz = (u.z + this.worldDepth / 2) * scale;
      const isBlue = u.team === 'BLUE';

      ctx.fillStyle = isBlue ? '#8fc46f' : '#e0675c';
      ctx.beginPath();
      ctx.arc(ux, uz, u.isPlayer ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Khung nhìn camera Viewport (chuẩn Art of War 3)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px - 18, pz - 14, 36, 28);

    // Hướng nòng pháo trên Minimap
    const barrelRad = (this.game.player.azimuth * Math.PI) / 180;
    ctx.strokeStyle = '#8fc46f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + Math.sin(barrelRad) * 12, pz - Math.cos(barrelRad) * 12);
    ctx.stroke();

    // Tia quét radar
    const sweepRad = (this.miniScannerAngle * Math.PI) / 180;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.arc(w / 2, h / 2, w * 0.7, sweepRad - 0.35, sweepRad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.fill();
    ctx.restore();
  }


}
