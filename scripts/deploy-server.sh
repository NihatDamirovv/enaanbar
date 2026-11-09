#!/usr/bin/env bash
# ENA Anbar — serverə yükləmə: bash scripts/deploy-server.sh [--exe]
#   kod → /opt/ena-anbar/app, (--exe ilə) dist/ENA-Anbar-Setup-*.exe → /opt/ena-anbar/download
#   baza /opt/ena-anbar/data-da qalır (toxunulmur)
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="C:\Users\Nihat Damirov\Downloads\nihat.pem"
HOST="ubuntu@ec2-16-16-236-53.eu-north-1.compute.amazonaws.com"
SSH=(ssh -o BatchMode=yes -i "$KEY" "$HOST")

rm -rf .deploy-pkg && mkdir -p .deploy-pkg
cp -r server.js package.json package-lock.json src site scripts deploy .deploy-pkg/
mkdir -p .deploy-pkg/build && cp build/icon.png .deploy-pkg/build/
tar -czf .deploy-pkg.tgz -C .deploy-pkg .
scp -o BatchMode=yes -i "$KEY" .deploy-pkg.tgz "$HOST:/tmp/ena-anbar.tgz"
if [[ "${1:-}" == "--exe" ]]; then
  EXE=$(ls -t dist/ENA-Anbar-Setup-*.exe | head -1)
  echo "exe: $EXE"
  scp -o BatchMode=yes -i "$KEY" "$EXE" "$HOST:/tmp/"
fi
"${SSH[@]}" 'set -e
  sudo mkdir -p /opt/ena-anbar/app /opt/ena-anbar/data /opt/ena-anbar/download
  sudo chown -R ubuntu:ubuntu /opt/ena-anbar
  rm -rf /opt/ena-anbar/app.new && mkdir /opt/ena-anbar/app.new
  tar -xzf /tmp/ena-anbar.tgz -C /opt/ena-anbar/app.new && rm /tmp/ena-anbar.tgz
  cd /opt/ena-anbar/app.new && npm ci --omit=dev --no-audit --no-fund --loglevel=error
  rm -rf /opt/ena-anbar/app.old && { [ -d /opt/ena-anbar/app ] && mv /opt/ena-anbar/app /opt/ena-anbar/app.old || true; } && mv /opt/ena-anbar/app.new /opt/ena-anbar/app
  for f in /tmp/ENA-Anbar-Setup-*.exe; do [ -f "$f" ] && mv "$f" /opt/ena-anbar/download/; done
  ls -t /opt/ena-anbar/download/ENA-Anbar-Setup-*.exe 2>/dev/null | tail -n +4 | xargs -r rm -f
  sudo cp /opt/ena-anbar/app/deploy/ena-anbar.service /etc/systemd/system/ena-anbar.service
  sudo systemctl daemon-reload
  sudo systemctl enable ena-anbar.service >/dev/null 2>&1
  sudo systemctl restart ena-anbar.service
  sleep 2
  systemctl is-active ena-anbar.service
  curl -s http://127.0.0.1:3130/health; echo'
rm -rf .deploy-pkg .deploy-pkg.tgz
echo "✅ ENA Anbar serverə yükləndi"
