# Altyapı runbook'u (Faz 6.1)

Arka uç tek bir Linux sunucuda çalışır. Site (`apps/web`) Cloudflare Pages'tedir; burada sunucu yoktur.

Bileşenler (`infra/stack/compose.yml`):

- Postgres 17 ve Valkey (Redis protokolü),
- indeksleyici, API ve keeper,
- Cloudflare Tunnel (`cloudflared`).

Dışarıya **hiç port açılmaz**. `api.mohonaut.com`'a gelen istek Cloudflare'den tünel üzerinden API'ye ulaşır. Metrikler yalnızca `127.0.0.1`'de dinler; izleme yığını (`infra/monitoring`) aynı sunucudadır.

Her şey ücretsiz araçlarla kuruludur: cloud-init, Docker, SOPS + age, rclone, Cloudflare Tunnel / Access / Pages / R2 (ücretsiz kademe). Ücretli olabilen tek kalem sunucunun kendisidir (aşağıda §1).

## 1. Sunucu

| Seçenek | Maliyet | Not |
|---|---|---|
| Oracle Cloud Always Free (Ampere A1, 4 OCPU / 24 GB) | 0 | Kayıt kart doğrulaması ister; kapasite her bölgede olmayabilir. arm64 (imajlar çok mimarili tabanlarla derlenir) |
| Hetzner CAX11 / CX22 | ~4–5 €/ay | En basit; ödeme gerekir → sıfır bütçe kuralı gereği gelir gelene kadar ertelenir |
| Kendi bilgisayarın (WSL/Ubuntu) | 0 | Yalnızca testnet için; uyku ve elektrik kesintisi riski |

Kurulum adımları:

1. Ubuntu 24.04 ile makine aç ve `infra/server/cloud-init.yaml`'ı "user data" olarak ver. Önce içindeki SSH **public key** satırını kendi anahtarınla değiştir.
2. Açıldıktan sonra `ssh ops@<ip>` ile bağlan. Parolayla giriş ve root girişi kapalıdır; güvenlik duvarı yalnızca SSH'a izin verir.
3. Repoyu indir: `sudo git clone https://github.com/0xBusuzima/mohonaut /opt/mohonaut`. Repo özel olduğu sürece bir deploy anahtarı (salt okunur) gerekir.

## 2. Sırlar

Sırlar SOPS + age ile şifrelenir ve repoya yalnızca şifreli hâlleri girer.

| Dosya | Nerede | Ne |
|---|---|---|
| `infra/stack/secrets.<ağ>.enc.env` | repo (şifreli) | RPC URL'si (Alchemy anahtarıyla), DATABASE_URL, SURVEY_SECRET, TURNSTILE_SECRET, ADMIN_WALLETS, TUNNEL_TOKEN … (`secrets.example.env`) |
| `/etc/mohonaut/age.key` | sunucu, root 600 | sunucunun age **özel** anahtarı (env dosyasını çözer) |
| `/etc/mohonaut/secrets/postgres_password` | sunucu, root 600 | Postgres parolası (DATABASE_URL'dekiyle aynı) |
| `/etc/mohonaut/secrets/keeper_keystore` + `keeper_password` | sunucu, root 600 | keeper'ın Foundry keystore'u ve parolası |
| `/etc/mohonaut/backup-recipients.txt` | sunucu | yedeklerin şifrelendiği **açık** anahtar(lar); karşılığı olan özel anahtar sunucuda **yoktur** |

İlk kurulum. Komutları kurucu çalıştırır; parola ve anahtarlar hiçbir yere kopyalanmaz.

```bash
# Sunucuda: sunucunun age anahtarı
sudo age-keygen -o /etc/mohonaut/age.key && sudo chmod 600 /etc/mohonaut/age.key
sudo age-keygen -y /etc/mohonaut/age.key          # çıkan age1... (açık) anahtarı .sops.yaml'a yaz
# Kendi bilgisayarında: kurucu anahtarı ve yedek anahtarı (yedek anahtarı çevrimdışı sakla)
age-keygen -o ~/.config/sops/age/keys.txt
age-keygen -o ~/mohonaut-backup.key               # açık anahtarı sunucuda backup-recipients.txt'ye
# .sops.yaml'daki iki age1... satırını gerçek açık anahtarlarla değiştir, sonra:
cp infra/stack/secrets.example.env /tmp/s.env && $EDITOR /tmp/s.env
sops --encrypt --input-type dotenv --output-type dotenv /tmp/s.env > infra/stack/secrets.testnet.enc.env
shred -u /tmp/s.env
```

## 3. Cloudflare

1. **Tünel**: Zero Trust → *Networks* → *Tunnels* → *Create* (cloudflared) → token'ı `TUNNEL_TOKEN` olarak şifreli env dosyasına koy → *Public hostname*: `api.mohonaut.com` → `http://api:8787`.
2. **Access**: `mohonaut.com/ops*` (operatör paneli; KURUCU listesinde). Grafana ve Prometheus internete açılmaz; kurucu SSH tüneliyle bakar: `ssh -L 3000:127.0.0.1:3000 ops@<sunucu>` → `http://localhost:3000`.
3. **Koruma** (ücretsiz planda regex kuralı yoktur):
   - *Security* → *Bots* → **Bot Fight Mode** açık.
   - *Security* → *Settings* → güvenlik seviyesi *Medium*.
   - Tek ücretsiz hız sınırı kuralı: `http.host eq "api.mohonaut.com" and (starts_with(http.request.uri.path, "/auth") or starts_with(http.request.uri.path, "/support"))` → IP başına 10 sn'de 20 istek → 10 sn blok. Bu, API'nin kendi sınırlarının önünde ikinci bir katmandır.
4. **Pages**: proje `mohonaut`, build komutu `npm ci && npx turbo run build --filter=@mohonaut/web...`, çıktı `apps/web/out`. Ortam değişkenleri: `NEXT_PUBLIC_API_URL=https://api.mohonaut.com`, `NEXT_PUBLIC_WC_PROJECT_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SENTRY_DSN` (hepsi herkese açık değerlerdir).

## 4. Deploy

```bash
cd /opt/mohonaut && sudo infra/stack/deploy.sh testnet
```

Betik sırasıyla şunları yapar:

1. `git pull --ff-only`,
2. SOPS ile sırları **yalnızca belleğe** (`/run/mohonaut`) çözer,
3. imajları derler,
4. servisleri başlatır (migration'lar başlangıçta kendiliğinden çalışır),
5. hepsi sağlıklı olana kadar bekler,
6. `healthz`, `/world` ve indeksleyici metrikleriyle duman testi yapar.

Başarısız olursa çıkış kodu 1'dir; eski konteynerler yerinde kalır (`docker compose ps`, `docker compose logs <servis>`).

- **Geri alma**: `git checkout <önceki commit>` → `sudo infra/stack/deploy.sh testnet`.
- **Mainnet**: aynı betik, `mainnet` argümanı ve `secrets.mainnet.enc.env` ile. Mainnet sunucusu testnet'ten ayrı olmalıdır.

## 5. Yedekler

- **Ne zaman**: her gün 03:17 UTC, `systemd` zamanlayıcısıyla.
  ```bash
  sudo cp infra/backup/mohonaut-backup.{service,timer} /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now mohonaut-backup.timer
  ```
- **Nasıl**: `pg_dump` (sunucuyla aynı sürüm, konteyner içinde) çıktısı doğrudan age ile şifrelenir; şifresiz döküm diske hiç yazılmaz. Dosyalar 14 gün `/var/backups/mohonaut` altında tutulur.
- **Nereye**:
  1. rclone ile Cloudflare R2'ye (ücretsiz: 10 GB, çıkış ücretsiz). Kurulum: `rclone config` → *s3* → *Cloudflare* (R2 *API token*: yalnızca bu bucket'a yazma).
  2. `/etc/mohonaut/backup.env` içine `BACKUP_REMOTE=r2:mohonaut-backups` yaz.
- **Geri yükleme testi (Kapı 6)**: CI her PR'da bu testi gerçek şemayla yapar (`infra` işi). Gerçek yedekle elle de yapılmalıdır, ayda bir ve her büyük değişiklikten sonra:
  ```bash
  # Kurucunun bilgisayarında (yedek özel anahtarı burada):
  rclone copy r2:mohonaut-backups/<dosya>.dump.age . && rclone copy r2:mohonaut-backups/<dosya>.dump.age.sha256 .
  docker run -d --name scratch -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:17-bookworm
  infra/backup/restore-test.sh <dosya>.dump.age ~/mohonaut-backup.key postgres://postgres:x@127.0.0.1:5433/scratch
  ```
  Çıktıdaki tablo sayıları ve `restored in N s` süresi `docs/04 §6`'ya kaydedilir.

## 6. Sağlık ve olaylar

- **Panel**: `mohonaut.com/ops/` → *Health* (indeksleyici gecikmesi, son saat kapanışı, keeper bakiyesi), *Emergency* (pause dosyası).
- **Uyarılar**: Telegram (`infra/monitoring`, ADR-014).
- **Senaryo runbook'ları** `docs/runbooks/` altındadır (Faz 6.2).
