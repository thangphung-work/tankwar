/**
 * Module Trí Tuệ Nhân Tạo Xe Tăng Chiến Đấu (Tactical Tank Bot AI)
 * - Tự động ra quyết định di chuyển: Chạy bo, né đạn pháo, chiếm cứ điểm A/B/C, nhặt hòm tiếp tế
 * - Giải thuật ngắm bắn đường đạn: Tính toán góc ngắm và cự ly bắn chuẩn xác
 * - Chiến thuật tác chiến theo dòng xe:
 *   + ARTILLERY: Tuyến sau đóng quân cắm chân chống thủy lực bắn chi viện tầm xa, không lao lên xáp lá cà
 *   + SCOUT: Cơ động tốc độ cao ra 2 cánh chiếm cứ điểm A/C, núp bụi rậm bắn tỉa tên lửa chống tăng
 *   + ALL_ROUNDER: Tiên phong dẫn đầu đội hình chiếm cứ điểm B trung tâm
 *   + GATLING: Tuần tra bọc lót sườn, áp sát xả 6 nòng liên thanh
 * - Cơ chế phân tán đội hình: Tự động giữ khoảng cách an toàn 50-70m với đồng đội, không chụm đầu dồn cục
 * - Cơ chế tự động lùi thoát kẹt: Nhận biết khi bị kẹt bờ tường công sự, vào số lùi bẻ lái thoát hiểm
 */
class BotAIController {
  constructor(unit) {
    this.unit = unit;

    // Cơ chế chống kẹt xe thông minh
    this.stuckTimer = 0;
    this.stuckCount = 0;
    this.reverseSteer = 1;
    this.lastCheckPos = { x: unit.x, z: unit.z };
    this.posCheckTimer = 0;

    // Vị trí đóng quân chiến lược cho pháo tự hành
    this.assignedCampPos = null;
  }

  update(dt, terrain, ballistics, radar, zone, allUnits, airdrop = null, supplyCrates = null, capturePoints = null) {
    this.unit.aiTimer -= dt;
    // Phát bắn đang chờ: tháp quay / nòng nâng xong (hoặc quá 4 s) mới khai hỏa
    if (this.pendingShot) {
      const S = this.pendingShot;
      S.t += dt;
      if (this.unit.isDead) this.pendingShot = null;
      else if (this.unit.aimAz === undefined || S.t > 4) {
        if (this.unit.tankType !== 'ARTILLERY' || this.unit.isDeployed) {
          if (S.anti && this.unit.antiTankCooldown <= 0) {
            this.unit.missileTarget = S.mt || null;   // tên lửa dẫn hướng bám đúng xe / điểm bot đã chọn
            this.unit.fireAntiTank(S.ballistics, S.radar);
          }
          else this.unit.fire(S.ballistics, S.radar);
          this.unit.isFiringGatling = S.burst;
        }
        this.pendingShot = null;
      }
    }
    if (this.unit.evadeTimer > 0) this.unit.evadeTimer -= dt;

    const zoneCenterX = zone.current.x - 1800;
    const zoneCenterZ = zone.current.y - 1800;
    const distToZone = Math.hypot(this.unit.x - zoneCenterX, this.unit.z - zoneCenterZ);

    // 0. CƠ CHẾ PHÁT HIỆN KẸT XE & TỰ ĐỘNG LÙI THOÁT HIỂM (ANTI-STUCK & REVERSE)
    this.posCheckTimer += dt;
    if (this.posCheckTimer >= 0.8) {
      this.posCheckTimer = 0;
      const movedDist = Math.hypot(this.unit.x - this.lastCheckPos.x, this.unit.z - this.lastCheckPos.z);
      // Nếu xe đang muốn nhấn ga mà thực tế chỉ nhích < 5.0m trong 0.8s
      if (Math.abs(this.unit.speed) > 12 && movedDist < 5.0) {
        this.stuckCount++;
        if (this.stuckCount >= 2) {
          // Kẹt quá 1.6 giây: Kích hoạt chế độ lùi xe bẻ lái
          this.stuckTimer = 1.5;
          this.reverseSteer = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4);
          this.stuckCount = 0;
        }
      } else {
        this.stuckCount = Math.max(0, this.stuckCount - 1);
      }
      this.lastCheckPos = { x: this.unit.x, z: this.unit.z };
    }

    if (this.stuckTimer > 0) {
      this.stuckTimer -= dt;
      // Vào số lùi và bẻ lái để thoát khỏi góc tường công sự
      this.unit.bodyAngle += this.reverseSteer * this.unit.turnRate * dt;
      this.unit.speed = -this.unit.baseMaxSpeed * 0.65;
      return;
    }

    // ƯU TIÊN 1: Chạy vào vòng bo an toàn nếu đang ở ngoài hoặc sát mép bo
    if (distToZone > zone.current.radius * 0.78) {
      // Pháo tự hành phải nhổ chân chống để chạy bo
      if (this.unit.tankType === 'ARTILLERY') {
        this.unit.isDeployed = false;
        this.assignedCampPos = null;
      }
      this.driveTowards(zoneCenterX, zoneCenterZ, dt, false, allUnits);
      return;
    }

    // ƯU TIÊN 2: Né đạn pháo khẩn cấp khi nghe tiếng rít đạn rơi
    if (this.unit.evadeTimer > 0 && this.unit.evadeTarget) {
      if (this.unit.tankType === 'ARTILLERY') {
        this.unit.isDeployed = false;
        this.assignedCampPos = null;
      }
      const distEvade = Math.hypot(this.unit.evadeTarget.x - this.unit.x, this.unit.evadeTarget.z - this.unit.z);
      if (distEvade > 30) {
        this.driveTowards(this.unit.evadeTarget.x, this.unit.evadeTarget.z, dt, true, allUnits);
        return;
      } else {
        this.unit.evadeTarget = null;
      }
    }

    // ƯU TIÊN 3: CHIẾN THUẬT RIÊNG CHO PHÁO TỰ HÀNH (ARTILLERY)
    // Pháo tự hành chỉ huy tuyến sau: không lao lên phía trước, đứng yên hạ càng cắm đất bắn chi viện
    if (this.unit.tankType === 'ARTILLERY') {
      const isBlue = (this.unit.team === 'BLUE');
      if (!this.assignedCampPos && typeof this.unit.spawnX === 'number') {
        // Xuất phát ở vị trí ngẫu nhiên trên bản đồ: lập trận địa ngay quanh chỗ xuất phát
        this.assignedCampPos = { x: this.unit.spawnX, z: this.unit.spawnZ };
      }
      if (!this.assignedCampPos) {
        // Chọn vị trí trận địa tuyến sau phù hợp với phe
        const baseZ = isBlue ? 950 : -950;
        // Phân tán theo chiều ngang từ -550 đến +550 để không trùng nhau
        const laneOffset = ((this.unit.id || Math.random()) % 5 - 2) * 220;
        this.assignedCampPos = {
          x: Math.max(-650, Math.min(650, laneOffset)),
          z: baseZ + (Math.random() - 0.5) * 150
        };
      }

      const distToCamp = Math.hypot(this.unit.x - this.assignedCampPos.x, this.unit.z - this.assignedCampPos.z);
      if (distToCamp > 60) {
        this.unit.isDeployed = false;
        this.driveTowards(this.assignedCampPos.x, this.assignedCampPos.z, dt, false, allUnits);
        return;
      } else {
        // Đã tới vị trí trận địa: Dừng xe hẳn và hạ chân chống thủy lực cắm đất
        this.unit.speed = 0;
        this.unit.isDeployed = true;
        // Chuyển sang thực hiện ngắm bắn phản pháo ở dưới
      }
    }

    // ƯU TIÊN 4: CỐ THỦ CÔNG SỰ MÓNG NGỰA CHỈ KHI BỊ THƯƠNG NẶNG (MÁU < 35%)
    // Và mỗi công sự chỉ cho phép tối đa 1 xe vào nấp
    if (this.unit.tankType !== 'ARTILLERY' && this.unit.hp < this.unit.maxHp * 0.35 && terrain.horseshoeForts && terrain.horseshoeForts.length > 0) {
      const inFort = terrain.isUnitInsideHorseshoe(this.unit.x, this.unit.z);
      if (!inFort.inside) {
        let bestFort = null;
        let minDist = Infinity;

        for (const fort of terrain.horseshoeForts) {
          const fortDistToZone = Math.hypot(fort.x - zoneCenterX, fort.z - zoneCenterZ);
          if (fortDistToZone < zone.current.radius * 0.75) {
            // Kiểm tra xem đã có xe nào đang ở trong công sự này chưa
            const isOccupied = (allUnits || []).some(u => {
              if (u === this.unit || u.isDead) return false;
              const d = Math.hypot(u.x - fort.x, u.z - fort.z);
              return d < (fort.armLength || 76) + 25;
            });

            if (!isOccupied) {
              const d = Math.hypot(fort.x - this.unit.x, fort.z - this.unit.z);
              if (d < minDist) {
                minDist = d;
                bestFort = fort;
              }
            }
          }
        }

        if (bestFort && minDist < 650) {
          const armLen = bestFort.armLength || 76;
          // Điểm tiếp cận ngoài cổng an toàn (cách cổng mở 45m theo hướng cửa mở)
          const gateOuterX = bestFort.x + Math.cos(bestFort.openAngle) * (armLen + 45);
          const gateOuterZ = bestFort.z + Math.sin(bestFort.openAngle) * (armLen + 45);
          const distToGate = Math.hypot(this.unit.x - gateOuterX, this.unit.z - gateOuterZ);

          if (distToGate > 35) {
            this.driveTowards(gateOuterX, gateOuterZ, dt, false, allUnits);
            return;
          } else {
            // Đã tới cửa mở: Lái thẳng vào trong lòng móng ngựa
            const insideX = bestFort.x + Math.cos(bestFort.openAngle) * (armLen * 0.4);
            const insideZ = bestFort.z + Math.sin(bestFort.openAngle) * (armLen * 0.4);
            this.driveTowards(insideX, insideZ, dt, false, allUnits);
            return;
          }
        }
      }
    }

    // ƯU TIÊN 5: Tranh chấp Hòm Tiếp Tế Rơi Dù nếu đang rơi hoặc đã tiếp đất
    if (this.unit.tankType !== 'ARTILLERY' && airdrop && !airdrop.collected && airdrop.landed) {
      const distToDrop = Math.hypot(airdrop.x - this.unit.x, airdrop.z - this.unit.z);
      if (distToDrop < 650) {
        this.driveTowards(airdrop.x, airdrop.z, dt, true, allUnits);
      }
    }

    // ƯU TIÊN 5b: Tranh chấp các Hòm Tiếp Tế Rải Rác ở gần
    if (this.unit.tankType !== 'ARTILLERY' && supplyCrates && Array.isArray(supplyCrates)) {
      let nearestCrate = null;
      let minCrateDist = (this.unit.hp < this.unit.maxHp * 0.7) ? 450 : 250;
      for (const crate of supplyCrates) {
        if (crate.active) {
          const d = Math.hypot(crate.x - this.unit.x, crate.z - this.unit.z);
          if (d < minCrateDist) {
            minCrateDist = d;
            nearestCrate = crate;
          }
        }
      }
      if (nearestCrate) {
        this.driveTowards(nearestCrate.x, nearestCrate.z, dt, true, allUnits);
      }
    }

    // ƯU TIÊN 5c: TRANH CHẤP & BẢO VỆ CỨ ĐIỂM CHIẾN LƯỢC A, B, C THEO PHÂN CÔNG TÁC CHIẾN
    if (capturePoints && Array.isArray(capturePoints) && capturePoints.length > 0 && this.unit.tankType !== 'ARTILLERY') {
      // 1. Tình huống khẩn cấp: Địch sắp giữ đủ 60s để thắng!
      let urgentEnemyCp = null;
      let maxHoldTime = 0;
      for (const cp of capturePoints) {
        if (cp.owner && cp.owner !== this.unit.team && cp.holdTimer > 25.0) {
          if (cp.holdTimer > maxHoldTime) {
            maxHoldTime = cp.holdTimer;
            urgentEnemyCp = cp;
          }
        }
      }

      if (urgentEnemyCp) {
        const distToCp = Math.hypot(urgentEnemyCp.x - this.unit.x, urgentEnemyCp.z - this.unit.z);
        if (distToCp > urgentEnemyCp.radius * 0.6) {
          this.driveTowards(urgentEnemyCp.x, urgentEnemyCp.z, dt, true, allUnits);
        }
      } else {
        // 2. Bình thường: Phân công chiếm cứ điểm theo dòng xe
        let targetCp = null;
        if (this.unit.tankType === 'SCOUT') {
          // Xe trinh sát: Ưu tiên chiếm 2 cánh (Cứ điểm A hoặc C)
          const flankCps = capturePoints.filter(cp => cp.owner !== this.unit.team && (cp.id === 'point-A' || cp.id === 'point-C' || Math.abs(cp.x) > 300));
          if (flankCps.length > 0) {
            targetCp = flankCps[Math.floor(Math.random() * flankCps.length)];
          }
        } else if (this.unit.tankType === 'ALL_ROUNDER') {
          // Xe tiên phong: Ưu tiên chiếm trung tâm (Cứ điểm B)
          targetCp = capturePoints.find(cp => cp.owner !== this.unit.team && (cp.id === 'point-B' || Math.abs(cp.x) <= 300));
        }

        // Nếu chưa chọn được, tìm cứ điểm gần nhất chưa thuộc phe mình
        if (!targetCp) {
          let minCpDist = Infinity;
          for (const cp of capturePoints) {
            if (cp.owner !== this.unit.team) {
              const d = Math.hypot(cp.x - this.unit.x, cp.z - this.unit.z);
              if (d < minCpDist) {
                minCpDist = d;
                targetCp = cp;
              }
            }
          }
        }

        if (targetCp) {
          const distToCp = Math.hypot(targetCp.x - this.unit.x, targetCp.z - this.unit.z);
          if (distToCp > targetCp.radius * 0.65) {
            this.driveTowards(targetCp.x, targetCp.z, dt, true, allUnits);
          }
        }
      }
    }

    // ƯU TIÊN 6: TẤN CÔNG PHẢN PHÁO BẰNG GIẢI THUẬT ĐƯỜNG ĐẠN TỰ ĐỘNG
    if (this.unit.aiTimer <= 0 && this.unit.reloadTimer === 0) {
      this.unit.aiTimer = (this.unit.tankType === 'ARTILLERY') ? (2.2 + Math.random() * 1.5) : (2.6 + Math.random() * 2.2);

      let targetX = null;
      let targetZ = null;
      let targetUnit = null;

      // Bot cũng chỉ biết vị trí địch như người chơi: tự nhìn thấy (không thấy xe núp bụi), radar của chính nó
      // (xe trinh sát), hoặc đồng đội trinh sát báo vị trí
      const enemyUnits = (allUnits || []).filter(u => {
        if (u.isDead || u.team === this.unit.team) return false;
        if (typeof TeamIntel !== 'undefined') return TeamIntel.knows(this.unit, u);
        return !(u.isInBush && (u.revealTimer || 0) <= 0);
      });

      if (this.unit.lastAttackerPos) {
        targetX = this.unit.lastAttackerPos.x + (Math.random() - 0.5) * 40;
        targetZ = this.unit.lastAttackerPos.z + (Math.random() - 0.5) * 40;
        this.unit.lastAttackerPos = null;
      } else {
        const targetDetection = radar.detections.find(d => {
          const shooterUnit = (allUnits || []).find(u => u.id === d.shooterId);
          return shooterUnit && shooterUnit.team !== this.unit.team && d.alpha > 0.35;
        });

        if (targetDetection) {
          targetX = targetDetection.originX - 1800 + (Math.random() - 0.5) * targetDetection.currentRadius * 0.4;
          targetZ = targetDetection.originY - 1800 + (Math.random() - 0.5) * targetDetection.currentRadius * 0.4;
        } else if (enemyUnits.length > 0) {
          const targetEnemy = enemyUnits[Math.floor(Math.random() * enemyUnits.length)];
          targetUnit = targetEnemy;
          targetX = targetEnemy.x + (Math.random() - 0.5) * 50;
          targetZ = targetEnemy.z + (Math.random() - 0.5) * 50;
        }
      }

      // Lựu pháo không bắn được mục tiêu dưới cự ly tối thiểu (quỹ đạo cầu vồng)
      if (targetX !== null && this.unit.tankType === 'ARTILLERY' && Math.hypot(targetX - this.unit.x, targetZ - this.unit.z) < (this.unit.minFiringDist || 440)) {
        targetX = targetZ = null;
      }

      if (targetX !== null && targetZ !== null) {
        const sol = ballistics.solveAimingForTarget(this.unit.x, this.unit.y, this.unit.z, targetX, targetZ, terrain, this.unit);
        if (sol) {
          // Tháp quay dần tới hướng bắn (không nhảy tức thì); bắn khi tháp đã quay xong (xem pendingShot)
          this.unit.charge = sol.charge;
          if (this.unit.canElevate) this.unit.aimTo(sol.azimuth, sol.elevation);
          else {
            this.unit.aimTo(sol.azimuth);
            // Xe 6 nòng: máy tính hỏa lực tự nâng hạ nòng vào tâm mục tiêu
            this.unit.fcsTarget = { x: targetX, z: targetZ, y: terrain.getElevationAt(targetX, targetZ) + 9, el: sol.reachable ? sol.elevation : undefined };
          }

          // Pháo tự hành: Bắt buộc dừng xe hạ càng cắm đất mới bắn
          if (this.unit.tankType === 'ARTILLERY') {
            this.unit.speed = 0;
            if (!this.unit.isDeployed) {
              return;
            }
          }

          // Xe trinh sát hoặc xe 6 nòng xả đạn súng máy cận chiến (sau khi tháp quay tới)
          const distToTarget = Math.hypot(targetX - this.unit.x, targetZ - this.unit.z);
          // tầm hiệu quả súng (số liệu thật x tỉ lệ game): 30mm ~1000, 12.7mm ~700
          const gunCap = ballistics.maxTravelFor ? ballistics.maxTravelFor(this.unit.tankType === 'GATLING' ? 'GATLING_BULLET' : 'SCOUT_BULLET', this.unit) : 700;
          const burst = (this.unit.tankType === 'SCOUT' || this.unit.tankType === 'GATLING') && distToTarget <= gunCap * 0.92;
          this.unit.isFiringGatling = false;
          const mt = targetUnit ? { unit: targetUnit } : { point: { x: targetX, y: terrain.getElevationAt(targetX, targetZ) + 7, z: targetZ } };
          this.pendingShot = { t: 0, anti: this.unit.tankType === 'SCOUT' && this.unit.antiTankCooldown <= 0, burst, ballistics, radar, mt };

          // Pháo tự hành đứng yên bắn tiếp, các xe khác đổi vị trí sau khi bắn
          if (this.unit.tankType !== 'ARTILLERY') {
            const scootAngle = Math.random() * Math.PI * 2;
            const scootDist = 180 + Math.random() * 200;
            this.unit.aiShootAndScootDest = {
              x: Math.max(-1500, Math.min(1500, this.unit.x + Math.cos(scootAngle) * scootDist)),
              z: Math.max(-1500, Math.min(1500, this.unit.z + Math.sin(scootAngle) * scootDist))
            };
            this.unit.aiState = 'fleeing';
          }
        }
      }
    }

    // Cơ động đổi vị trí sau khi bắn cho các xe không phải pháo tự hành
    if (this.unit.tankType !== 'ARTILLERY' && this.unit.aiState === 'fleeing' && this.unit.aiShootAndScootDest) {
      const dist = Math.hypot(this.unit.aiShootAndScootDest.x - this.unit.x, this.unit.aiShootAndScootDest.z - this.unit.z);
      if (dist > 40) {
        this.driveTowards(this.unit.aiShootAndScootDest.x, this.unit.aiShootAndScootDest.z, dt, false, allUnits);
      } else {
        this.unit.aiState = 'patrol';
        this.unit.aiShootAndScootDest = null;
        this.unit.speed = 0;
      }
    }
  }

  /**
   * Điều khiển xe di chuyển tới tọa độ mục tiêu kết hợp lực đẩy phân tán đội hình
   * Giúp xe giữ cự ly an toàn 50-70m với đồng đội, không bị dồn cục
   */
  driveTowards(targetX, targetZ, dt, isBoost = false, allUnits = null) {
    let dx = targetX - this.unit.x;
    let dz = targetZ - this.unit.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.001) {
      dx /= dist;
      dz /= dist;
    }
    // Tìm đường né nhà, đá tảng, tường công sự / cứ điểm và sườn quá dốc với loại xe này
    const terrain = window.game && window.game.terrain;
    if (typeof Navigator !== 'undefined' && terrain && dist > 30) {
      this._nav = this._nav || {};
      const st = Navigator.steer(this.unit, this._nav, terrain, targetX, targetZ, dt, 20);
      if (!st.arrived) { dx = st.dx; dz = st.dz; }
    }

    // Lực đẩy phân tán đội hình (Flocking Separation): Đẩy xe dạt ra khi quá gần đồng đội
    if (allUnits && Array.isArray(allUnits)) {
      for (const other of allUnits) {
        if (other !== this.unit && !other.isDead) {
          const sepX = this.unit.x - other.x;
          const sepZ = this.unit.z - other.z;
          const sepDist = Math.hypot(sepX, sepZ);
          const safeRadius = (other.team === this.unit.team) ? 75 : 55;
          if (sepDist > 0.001 && sepDist < safeRadius) {
            const pushWeight = ((safeRadius - sepDist) / safeRadius) * 2.2;
            dx += (sepX / sepDist) * pushWeight;
            dz += (sepZ / sepDist) * pushWeight;
          }
        }
      }
    }

    // Kẹt ở sườn quá dốc (vd pháo tự hành trước ụ cứ điểm): rẽ ngang đi vòng một lúc
    if (this.unit.climbStall) this._stallT = (this._stallT || 0) + dt; else this._stallT = Math.max(0, (this._stallT || 0) - dt);
    if (this._stallT > 0.6 && !(this._detour > 0)) { this._detour = 1.8; this._detourSide = Math.random() < 0.5 ? -1 : 1; this._stallT = 0; }
    if (this._detour > 0) {
      this._detour -= dt;
      const s = this._detourSide;
      const ndx = -dz * s, ndz = dx * s;
      dx = ndx; dz = ndz;
    }

    this.unit.steer(dx, dz, dt, isBoost);
  }
}

if (typeof window !== 'undefined') {
  window.BotAIController = BotAIController;
}
if (typeof module !== 'undefined') {
  module.exports = BotAIController;
}
