#!/bin/bash
# Probe Z.ai API: which models does this key support? (text + vision candidates)
KEY="84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5"
URL="https://api.z.ai/api/paas/v4/chat/completions"

echo "===== TEXT MODELS ====="
for M in glm-5.3 glm-5.3-flash glm-5.3-flashx glm-5.2 glm-5.1 glm-5 glm-5-turbo glm-4.7 glm-4.6 glm-4.5 glm-4.5-air glm-4.6-flash glm-4.5-flash; do
  R=$(curl -sS -m 45 -X POST "$URL" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$M\",\"messages\":[{\"role\":\"user\",\"content\":\"say OK\"}],\"max_tokens\":8}" 2>&1)
  echo "--- $M => $(echo "$R" | head -c 200)"
done

echo "===== VISION MODELS ====="
IMG='{"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}}'
for M in glm-5.3v glm-5.3v-flash glm-5.3-flashv glm-5v glm-4.6v glm-4.5v glm-4v-flash; do
  R=$(curl -sS -m 45 -X POST "$URL" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$M\",\"messages\":[{\"role\":\"user\",\"content\":[$IMG,{\"type\":\"text\",\"text\":\"what color is this pixel? one word\"}]}],\"max_tokens\":12}" 2>&1)
  echo "--- VISION $M => $(echo "$R" | head -c 200)"
done
echo "DONE"
