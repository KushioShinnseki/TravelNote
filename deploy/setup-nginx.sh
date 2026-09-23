#!/usr/bin/env bash
set -Eeuo pipefail

# Configure only the TravelNote virtual host. Existing Nginx sites are left intact.
DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="${TRAVELNOTE_ENV_FILE:-$PACKAGE_DIR/.env}"
SITE_NAME="travelnote"
SITE_AVAILABLE="/etc/nginx/sites-available/$SITE_NAME.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/$SITE_NAME.conf"
ACME_ROOT="/var/www/travelnote-letsencrypt"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "未找到环境文件：$ENV_FILE" >&2
  echo "请先执行：cp .env.example .env，并填写 TRAVELNOTE_DOMAIN 和 LETSENCRYPT_EMAIL。" >&2
  exit 1
fi

dotenv_value() {
  local key="$1"
  awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

DOMAIN="${TRAVELNOTE_DOMAIN:-$(dotenv_value TRAVELNOTE_DOMAIN)}"
EMAIL="${LETSENCRYPT_EMAIL:-$(dotenv_value LETSENCRYPT_EMAIL)}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "TRAVELNOTE_DOMAIN 和 LETSENCRYPT_EMAIL 必须配置在 $ENV_FILE 中。" >&2
  exit 1
fi
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "TRAVELNOTE_DOMAIN 不是有效的域名：$DOMAIN" >&2
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

if ! command -v nginx >/dev/null 2>&1 || ! command -v certbot >/dev/null 2>&1; then
  $SUDO apt-get update
  $SUDO apt-get install -y nginx certbot
fi

$SUDO mkdir -p "$ACME_ROOT" /etc/nginx/sites-available /etc/nginx/sites-enabled

# First publish an HTTP ACME endpoint so Let's Encrypt can validate the domain.
$SUDO tee "$SITE_AVAILABLE" >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root $ACME_ROOT;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

$SUDO ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
$SUDO nginx -t
$SUDO systemctl enable --now nginx
$SUDO systemctl reload nginx

$SUDO certbot certonly \
  --webroot \
  --webroot-path "$ACME_ROOT" \
  --non-interactive \
  --agree-tos \
  --no-eff-email \
  --email "$EMAIL" \
  --keep-until-expiring \
  -d "$DOMAIN"

$SUDO tee "$SITE_AVAILABLE" >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root $ACME_ROOT;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

$SUDO mkdir -p /etc/letsencrypt/renewal-hooks/deploy
$SUDO tee /etc/letsencrypt/renewal-hooks/deploy/travelnote-reload-nginx.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx
EOF
$SUDO chmod 755 /etc/letsencrypt/renewal-hooks/deploy/travelnote-reload-nginx.sh

$SUDO nginx -t
$SUDO systemctl reload nginx

echo "TravelNote Nginx 已配置：https://$DOMAIN"
echo "宿主机 Nginx 使用 80/443，Docker Web 服务继续监听 127.0.0.1:8080。"
