#!/usr/bin/env bash
# Cài (hoặc cập nhật) máy chủ game lên máy ảo Ubuntu — ví dụ Oracle Cloud Always Free.
#   Lần đầu:      bash oracle-setup.sh
#   Cập nhật code: chạy lại đúng lệnh đó (lấy code mới nhất từ GitHub rồi khởi động lại)
# Game chạy ở cổng 80 (http://<IP máy chủ>), tự bật lại khi máy chủ khởi động lại.
# Dữ liệu tài khoản nằm ở /var/lib/tankwar (ngoài thư mục code, cập nhật code không đụng tới).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/thangphung-work/tankwar.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-80}"
APP_DIR=/opt/tankwar
DATA_DIR=/var/lib/tankwar
SERVICE=tankwar

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Script này dành cho Ubuntu (khi tạo máy ảo hãy chọn ảnh Ubuntu)." >&2
  exit 1
fi

echo "==> Cài gói cần thiết"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates

echo "==> Kiểm tra Node.js (cần bản 22.13 trở lên)"
node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'
}
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node_ok || { echo "Không cài được Node.js >= 22.13" >&2; exit 1; }
NODE_BIN="$(command -v node)"
echo "    Node $(node -v)"

echo "==> Tạo tài khoản hệ thống và thư mục dữ liệu"
if ! id "$SERVICE" >/dev/null 2>&1; then
  sudo useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE"
fi
sudo mkdir -p "$DATA_DIR"
sudo chown "$SERVICE:$SERVICE" "$DATA_DIR"
sudo chmod 700 "$DATA_DIR"

echo "==> Lấy code mới nhất (nhánh $BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  sudo git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  sudo git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  sudo git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
# Lần cài đầu: nếu repo còn file tài khoản cũ thì chép sang thư mục dữ liệu để giữ tài khoản
if [ -f "$APP_DIR/data/accounts.db" ] && ! sudo test -f "$DATA_DIR/accounts.db"; then
  sudo cp "$APP_DIR/data/accounts.db" "$DATA_DIR/accounts.db"
  sudo chown "$SERVICE:$SERVICE" "$DATA_DIR/accounts.db"
  echo "    Đã chép tài khoản cũ từ repo sang $DATA_DIR"
fi
# Bỏ thư mục data/ trong code: máy chủ dùng $DATA_DIR, để lại thì file này tải được qua web
sudo rm -rf "$APP_DIR/data"

echo "==> Tạo dịch vụ chạy nền ($SERVICE)"
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<EOF
[Unit]
Description=Tankwar game server
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=NO_BROWSER=1
Environment=ACCOUNTS_DIR=$DATA_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null
sudo systemctl restart "$SERVICE"

echo "==> Mở cổng $PORT trên tường lửa của máy ảo"
# Ảnh Ubuntu của Oracle chặn mọi cổng trừ 22 bằng iptables: thêm luật cho phép lên đầu danh sách
if command -v iptables >/dev/null 2>&1; then
  if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 1 -p tcp --dport "$PORT" -j ACCEPT
  fi
  if command -v netfilter-persistent >/dev/null 2>&1; then
    sudo netfilter-persistent save >/dev/null 2>&1 || true
  fi
fi
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow "$PORT/tcp" >/dev/null
fi

sleep 2
if sudo systemctl is-active --quiet "$SERVICE"; then
  IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<IP công khai của máy ảo>')"
  echo
  echo "XONG! Mở trình duyệt: http://$IP$( [ "$PORT" = 80 ] || echo ":$PORT" )"
  echo "Xem nhật ký máy chủ: sudo journalctl -u $SERVICE -f"
else
  echo "Máy chủ chưa chạy được. Xem lỗi: sudo journalctl -u $SERVICE -n 50" >&2
  exit 1
fi
