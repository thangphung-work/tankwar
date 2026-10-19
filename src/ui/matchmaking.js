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
class MatchmakingController {
  constructor(game) {
    this.game = game;
    this.channelName = 'spg_tactical_matchmaking_v1';
    this.channel = null;

    // Danh tính người chơi hiện tại
    this.myPeerId = 'pilot_' + Math.random().toString(36).substring(2, 8);
    this.defaultNames = [
      'CHỈ HUY LIÊN MINH',
      'CHIẾN BINH SÓI BẠC',
      'PHÁO THỦ BÁO ĐEN',
      'THIẾT GIÁP ĐẠI BÀNG',
      'HỎA THẦN SA MẠC',
      'XẠ THỦ BẮC CỰC'
    ];
    this.myName = this.defaultNames[Math.floor(Math.random() * this.defaultNames.length)];

    this.selectedTankType = 'ALL_ROUNDER'; // 'ALL_ROUNDER' | 'GATLING' | 'ARTILLERY'
    this.selectedMapType = 'DESERT'; // 'DESERT' | 'URBAN' | 'JUNGLE' | 'HIGHLAND' | 'RIVER_LAKE'

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
      'BÁO ĐEN SA MẠC', 'TỬ THẦN TẦM XA', 'THIẾT GIÁP ĐỒNG NAI', 'HỎA LỰC HẮC BÁO',
      'BÃO CÁT CHIẾN THUẬT', 'THỢ SĂN LIÊN BANG', 'PHÁO THỦ ĐẠI BÀNG', 'SẤM SÉT VÔ HÌNH',
      'ĐẠI BÀNG LỬA', 'CHIẾN XA BẮC CỰC', 'HỔ CÁP THIẾT GIÁP', 'PHÁO BINH THẦN TỐC',
      'XẠ THỦ RỪNG RẬM', 'KỴ BINH VÔ DIỆN', 'TIA CHỚP BĂNG GIÁ', 'SÓI XÁM CAO NGUYÊN',
      'HỎA THẦN VÂY HÃM', 'MÃNH THÚ ĐÔ THỊ', 'THIÊN PHÁO SÔNG HỒ', 'KẺ TRỪNG PHẠT 01',
      'CHIẾN THẦN 02', 'BẠCH MÃ CHIẾN TƯỚNG', 'SƯ TỬ SA MẠC', 'BẢO LÂM XẠ THỦ',
      'ĐẠI BÀNG GÃY CÁNH', 'LONG THẦN THIẾT GIÁP', 'CHIẾN BINH THÉP', 'XẠ THỦ ĐỈNH NÚI',
      'THẦN ƯNG TẦM XA', 'BÁO ĐỐM TÀNG HÌNH', 'ĐẠI PHÁO TỬ THẦN', 'SÓI TUYẾT DÃ CHIẾN'
    ];

    // Bản mẫu để làm mới sảnh khi quay lại sau trận (chế độ nhiều người chơi)
    this.slotTemplate = JSON.parse(JSON.stringify(this.slots));
    this.botNamesTemplate = this.botNamesPool.slice();

    // Hạt giống bản đồ: chế độ độc lập tự sinh cục bộ, chế độ mạng do chủ phòng quyết định
    this.mapSeed = (typeof NetUtil !== 'undefined') ? NetUtil.randomSeed() : (Math.floor(Math.random() * 0x100000000) >>> 0);
    this.preparedMapKey = null;
    this.net = null;

    // Ở sảnh (chưa bấm tìm trận) máy này tự quyết bản đồ; vào phòng mạng rồi mới biết ai là chủ phòng
    this.isHost = true;
    this.netPending = false; // Đang kết nối / chờ chủ phòng nhận vào: chưa được tự lấp bot hay xuất trận
    this.searchTime = 0; // Đếm số giây tìm kiếm
    this.maxWaitTime = 8; // 8 giây chờ người chơi thực rồi mới lấp máy (người chơi không thấy phân biệt người / máy)
    this.tickMs = 250;
    this.state = 'IDLE'; // IDLE -> SEARCHING -> FILLING_BOTS -> COUNTDOWN -> IN_GAME
    this.countdown = 3;

    this.initElements();
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
    if (window.soundEngine && window.soundEngine.playRadioChirp) {
      try { window.soundEngine.playRadioChirp(); } catch (e) {}
    }
    this.state = 'SEARCHING';
    this.searchTime = 0;
    this.isHost = true;
    this.resetRoster();
    this.prepareSelectedMap();
    this.setSearchView(true);

    if (typeof NetTransport !== 'undefined') {
      this.netPending = true;
      if (!this.net) this.initNetwork();
      else this.net.rejoin();
    } else {
      this.netPending = false;
    }
    this.renderLobby();
    this.startSearchingLoop();
  }

  // Nút "HỦY": rời phòng chờ, quay lại sảnh (không hủy được khi đã đếm ngược)
  cancelSearch() {
    if (this.state !== 'SEARCHING' && this.state !== 'FILLING_BOTS') return;
    clearInterval(this.searchInterval);
    clearTimeout(this.discoverTimer);
    if (this.net) this.net.leave();
    this.state = 'IDLE';
    this.netPending = false;
    this.isHost = true;
    this.searchTime = 0;
    this.resetRoster();
    if (this.statusTextEl) this.statusTextEl.classList.remove('highlight-amber');
    this.setSearchView(false);
    this.renderLobby();
  }

  // Bật / tắt màn chờ ghép trận (sảnh ẩn, bản đồ 3D quay toàn cảnh bên dưới)
  setSearchView(on) {
    if (this.overlay) this.overlay.classList.toggle('mm-searching', !!on);
    document.body.classList.toggle('mm-searching', !!on);
    if (this.searchHudEl) {
      this.searchHudEl.classList.toggle('hidden', !on);
      this.searchHudEl.classList.remove('is-counting');
    }
    if (this.countdownEl) this.countdownEl.classList.add('hidden');
  }

  // Cập nhật bảng trạng thái ghép trận
  updateSearchHUD() {
    if (!this.searchHudEl || this.state === 'IDLE' || this.state === 'IN_GAME') return;
    const filled = this.slots.filter(s => s.ready).length;
    const total = this.slots.length;
    if (this.countEl) this.countEl.textContent = `${filled}/${total}`;
    if (this.progressBarEl) this.progressBarEl.style.width = `${Math.max(5, filled / total * 100)}%`;
    const t = Math.floor(this.searchTime);
    if (this.timerEl) this.timerEl.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    if (this.mapNameEl) this.mapNameEl.textContent = this.mapName(this.selectedMapType);
    if (!this.statusTextEl) return;
    let text;
    if (this.state === 'COUNTDOWN') text = 'ĐÃ ĐỦ NGƯỜI · TRẬN ĐẤU SẮP BẮT ĐẦU';
    else if (this.netPending) text = 'ĐANG KẾT NỐI...';
    else text = 'ĐANG TÌM TRẬN ĐẤU...';
    this.statusTextEl.textContent = text;
  }

  mapName(mapType) {
    return { DESERT: 'SA MẠC LỬA', URBAN: 'ĐÔ THỊ ĐỔ NÁT', JUNGLE: 'RỪNG RẬM', HIGHLAND: 'CAO NGUYÊN', RIVER_LAKE: 'SÔNG HỒ' }[mapType] || 'SA MẠC LỬA';
  }

  initElements() {
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

    if (this.nameInput) {
      this.nameInput.value = this.myName;
      this.nameInput.addEventListener('input', (e) => {
        this.myName = e.target.value.trim() || 'CHIẾN BINH VÔ DANH';
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
    window.netTransport = this.net;

    const lobbyTypes = ['DISCOVER_ROOM', 'DISCOVER_ROOM_ACK', 'ROOM_FULL', 'ROOM_UPDATE', 'MAP_CHANGE', 'MAP_REQUEST',
      'SLOT_UPDATE', 'REQUEST_LAUNCH', 'START_COUNTDOWN', 'LAUNCH_GAME_NOW'];
    lobbyTypes.forEach(type => {
      this.net.on(type, (data, from) => this.handleChannelMessage(Object.assign({}, data || {}, { type, _from: from })));
    });
    this.net.on('$ready', () => this.onNetReady());
    this.net.on('$peer_leave', (d, id) => this.onPeerLeave(id));
    this.net.on('$host', () => this.onHostChange());

    this.net.connect();
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
      if (attempts >= 3) {
        // Chủ phòng không phản hồi: chơi độc lập để không bị kẹt ở sảnh
        console.warn('Chủ phòng không phản hồi. Chuyển sang chế độ chơi độc lập.');
        this.net.goOffline('host did not answer DISCOVER_ROOM');
        return;
      }
      attempts++;
      const mySlot = this.slots.find(s => s.isMe);
      this.net.sendTo(this.net.hostId, 'DISCOVER_ROOM', {
        peerId: this.myPeerId,
        name: this.myName,
        tankType: mySlot ? mySlot.tankType : this.selectedTankType
      });
      clearTimeout(this.discoverTimer);
      this.discoverTimer = setTimeout(discover, 1500);
    };
    discover();
  }

  // Trở thành chủ phòng (mở phòng mới, hoặc được bầu lại khi chủ phòng cũ rời đi)
  becomeHost() {
    this.isHost = true;
    this.netPending = false;
    this.hasReceivedHostAck = true;
    clearTimeout(this.discoverTimer);
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

  // Người mới vào phòng: xếp vào phe đang ít người thật hơn (hòa thì phe Xanh), ưu tiên ô còn trống rồi mới thay bot
  pickSlotForNewHuman() {
    const humans = team => this.slots.filter(s => s.team === team && s.isHuman).length;
    const order = humans('RED') < humans('BLUE') ? ['RED', 'BLUE'] : ['BLUE', 'RED'];
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
  }

  onPeerLeave(peerId) {
    if (this.state === 'IN_GAME' || this.state === 'IDLE' || !this.isHost) return;
    const slot = this.slots.find(s => s.peerId === peerId);
    if (slot) {
      this.freeSlot(slot);
      this.renderLobby();
      this.broadcastRoomUpdate();
    }
  }

  onHostChange() {
    if (!this.net) return;
    if (this.state === 'IDLE') return;
    if (this.net.isHost && !this.isHost) {
      if (this.state === 'IN_GAME' || this.state === 'COUNTDOWN') this.isHost = true;
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
      tankType: mySlot ? mySlot.tankType : this.selectedTankType
    });
  }

  // Người chơi bấm chọn bản đồ: chủ phòng (hoặc chơi độc lập) sinh hạt giống mới; khách gửi yêu cầu cho chủ phòng
  selectMap(mapType) {
    if (this.isNetGuest()) {
      this.net.sendTo(this.net.hostId, 'MAP_REQUEST', { mapType });
      return;
    }
    this.selectMapAsHost(mapType);
  }

  selectMapAsHost(mapType) {
    const seed = (typeof NetUtil !== 'undefined') ? NetUtil.randomSeed() : (Math.floor(Math.random() * 0x100000000) >>> 0);
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
    if (mapType !== this.selectedMapType) {
      this.selectedMapType = mapType;
    }
    this.mapSeed = seed;
    this.setMapSelectionUI(this.selectedMapType);
    this.prepareSelectedMap();
  }

  setMapSelectionUI(mapType) {
    const mapCards = document.querySelectorAll('.mm-map-card');
    mapCards.forEach(c => c.classList.toggle('active', c.getAttribute('data-map-type') === mapType));
    this.updateLobbyBackground(mapType);
  }

  // Dựng bản đồ theo (loại, hạt giống) — chỉ dựng lại khi cặp này thay đổi
  prepareSelectedMap(force) {
    const key = this.selectedMapType + ':' + (this.mapSeed >>> 0);
    const game = this.game;
    if (!game) return false; // Game chưa khởi tạo: onGameAttached() sẽ dựng sau
    if (!force && this.preparedMapKey === key) return true;
    this.preparedMapKey = key;
    try {
      if (typeof game.prepareMap === 'function') {
        game.prepareMap(this.selectedMapType, this.mapSeed >>> 0);
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
    if (this.state !== 'IN_GAME') this.prepareSelectedMap();
  }

  // Được game.js gọi khi quay về sảnh sau trận (restartMatch)
  onReturnToLobby() {
    if (this.game && this.game.netSync && typeof this.game.netSync.detach === 'function') {
      this.game.netSync.detach();
    }
    this.preparedMapKey = null;
    clearInterval(this.searchInterval);
    clearInterval(this.countdownTimer);
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
    this.renderLobby();
    this.prepareSelectedMap();
  }

  // Chủ phòng phát lệnh xuất trận cho mọi máy
  sendLaunch() {
    if (!this.net || !this.net.isOnline || !this.isHost) return;
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
      if (this.isHost && from && (this.state === 'COUNTDOWN' || this.state === 'IN_GAME')) {
        // Trận sắp bắt đầu: báo đầy để máy kia tự chơi với máy / tìm phòng khác
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
        slot.name = msg.name || 'CHIẾN BINH MỚI';
        if (msg.tankType) slot.tankType = msg.tankType;
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
        this.slots = msg.slots;
        this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
      }
      this.applyMapSelection(msg.mapType, msg.mapSeed);
      this.renderLobby();
    }

    // 2.b. Phòng đã đủ 20 người thật
    else if (msg.type === 'ROOM_FULL') {
      if (!this.isHost && this.net) this.net.goOffline('room full');
    }

    // 3. Đồng bộ danh sách slot, loại bản đồ và hạt giống từ chủ phòng
    else if (msg.type === 'ROOM_UPDATE') {
      if (!this.isHost && fromHost && this.state !== 'IN_GAME' && this.state !== 'IDLE') {
        if (Array.isArray(msg.slots)) {
          this.slots = msg.slots;
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
          if (typeof msg.name === 'string' && msg.name.trim()) slot.name = msg.name.trim().slice(0, 40);
          if (msg.tankType) slot.tankType = msg.tankType;
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
    else if (msg.type === 'START_COUNTDOWN' || msg.type === 'LAUNCH_GAME_NOW') {
      if (!this.isHost && fromHost && this.state !== 'IN_GAME' && this.state !== 'IDLE') {
        if (Array.isArray(msg.slots)) {
          this.slots = msg.slots;
          this.slots.forEach(s => { s.isMe = (s.peerId === this.myPeerId); });
        }
        if (msg.mapType) {
          this.selectedMapType = msg.mapType;
          if (typeof msg.mapSeed === 'number') this.mapSeed = msg.mapSeed >>> 0;
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
        // Hết thời gian chờ người chơi thực -> lấp dần máy vào chỗ trống
        if (this.state === 'SEARCHING' && this.searchTime >= this.maxWaitTime) this.state = 'FILLING_BOTS';

        if (this.state === 'FILLING_BOTS') {
          const emptySlot = this.slots.find(slot => !slot.isHuman && !slot.peerId && !slot.ready);
          if (emptySlot) {
            this.fillBotSlot(emptySlot);
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
    const randomBotName = this.botNamesPool.shift() || `CHIẾN BINH #${slot.id + 1}`;
    slot.name = randomBotName;
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
    if (this.state === 'COUNTDOWN' || this.state === 'IN_GAME') return;
    clearInterval(this.searchInterval);
    this.renderLobby(); // cân bằng đội hình lần cuối trước khi gửi
    // Hạt giống vị trí xuất phát ngẫu nhiên của trận này (mọi máy dùng chung -> cùng vị trí)
    this.spawnSeed = (typeof NetUtil !== 'undefined') ? NetUtil.randomSeed() : (Math.floor(Math.random() * 0x100000000) >>> 0);
    if (this.net && this.net.isOnline && this.isHost) {
      this.net.lockRoom(true);
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
    this.prepareSelectedMap();
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
      humanCountEl.textContent = '10 VS 10 · 20 CHIẾN BINH MỖI TRẬN';
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
      overlay.style.background = `linear-gradient(180deg, rgba(3, 7, 16, 0.78) 0%, rgba(2, 5, 12, 0.86) 50%, rgba(1, 3, 8, 0.94) 100%), url('${cfg.bg}') center/cover no-repeat`;
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
