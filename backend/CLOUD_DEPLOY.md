# Deploy Streamix backend off your Mac (phone APK works anywhere)

Your APK only needs a **public API URL**. Two paths:

## A) Permanent (recommended) — free Oracle Cloud VM

1. Create an Always Free ARM instance (Ubuntu) at https://cloud.oracle.com  
   (4 OCPU / 24 GB RAM is enough for this stack.)
2. SSH in, install Docker:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker $USER && newgrp docker
   ```
3. Copy the `backend/` folder to the VM (scp/rsync/git clone).
4. On the VM:
   ```bash
   cd backend
   # put your TMDB_API_KEY in .env.cloud
   docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d --build
   curl http://127.0.0.1:4000/health
   ```
5. Open Oracle Security List / iptables for **TCP 4000** (or put nginx + HTTPS on 443).
6. Public URL example: `http://YOUR_VM_PUBLIC_IP:4000`
7. Set that URL in `StreamixApp/src/config.ts` → `PUBLIC_API_URL`, rebuild APK.

For HTTPS (better for Android): put **Caddy** or **nginx + Let's Encrypt** in front of port 4000.

## B) Quick tunnel while Mac is on (not Mac-free)

```bash
bash backend/scripts/public-tunnel.sh
# or: npx tunnelmole 4000
```

Copy the printed `https://….tunnelmole.net` URL into `PUBLIC_API_URL`, rebuild APK.  
Mac + Docker + tunnelmole must stay running. URL changes if you restart the tunnel.

## After you have a public URL

```ts
// StreamixApp/src/config.ts
export const PUBLIC_API_URL = 'https://your-host-or-tunnel';
```

```bash
cd StreamixApp/android
export JAVA_HOME="$HOME/.local/jdk-17/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew assembleRelease
# APK → app/build/outputs/apk/release/app-release.apk
```
