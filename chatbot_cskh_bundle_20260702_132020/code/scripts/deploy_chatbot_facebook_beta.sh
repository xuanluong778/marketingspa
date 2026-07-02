#!/usr/bin/env bash
set -euo pipefail
PROD="/var/www/seoauto_vn_usr4940/data/www/seoauto.vn"
DEV="/var/www/seoauto_vn_usr/data/www"

FILES=(
  app/models/chatbot_cskh.py
  app/migrations/ensure_chatbot_cskh_facebook.py
  app/services/chatbot_cskh_facebook_service.py
  app/services/chatbot_cskh_entitlement.py
  app/services/chatbot_cskh_inbox_service.py
  app/core/security.py
  app/routers/chatbot_cskh_facebook.py
  app/routers/chatbot_cskh_platform.py
  main.py
  templates/chatbot_cskh.html
  static/js/chatbot-cskh.js
  static/css/chatbot-cskh.css
)

for f in "${FILES[@]}"; do
  install -D "$DEV/$f" "$PROD/$f"
done

cd "$PROD"
PYTHONPATH=. .venv/bin/python - <<'PY'
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path("env.local"))
from app.migrations.ensure_chatbot_cskh_facebook import ensure_chatbot_cskh_facebook
print(ensure_chatbot_cskh_facebook())
PY

systemctl restart digiseo.service
echo "Deployed Facebook CSKH beta."
