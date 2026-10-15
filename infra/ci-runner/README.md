# CI runner'ları (kurucunun bilgisayarı, WSL)

Repo gizliyken GitHub'ın ücretsiz Actions dakikası CI'a yetmiyor: bir koşu yaklaşık 60 faturalı dakika, ayda 2.000 dakika var. Repo açılana kadar CI, kurucunun evdeki yedek laptopunda WSL Ubuntu 24.04 içindeki bir **self-hosted runner**'da koşar (ADR-018). Laptop Ryzen 7 3700U ve 8 GB RAM'li olduğu için tek runner çalışır ve WSL belleği `.wslconfig` ile 6 GB'a ayarlanır; laptopta dosyalar `C:\Users\yzcin\mohonaut-ci-runner` altındadır. Bu ücretsizdir; GitHub kendi makinende çalışan runner için ücret almıyor.

## Kurulum (bir kez, kurucu)

1. **Token al.** GitHub → repo → *Settings → Actions → Runners → New self-hosted runner* → Linux. Sayfadaki `./config.sh ... --token XXXX` satırındaki token'ı kopyala. Token bir sırdır ve bir saat geçerlidir; Claude'a veya sohbete yazma.
2. **WSL terminalinde** (Ubuntu) proje klasöründen çalıştır:
   ```bash
   cd /mnt/c/Users/<you>/Desktop/crypto-game-project   # the repository folder
   bash infra/ci-runner/setup-wsl.sh
   ```
   Betik önce sudo parolanı, sonra token'ı sorar; ikisi de ekranda görünmez. Ardından şunları yapar:
   - Docker, jq, age, cloud-init ve shellcheck'i kurar;
   - runner'ın sağlama toplamını GitHub'ın yayımladığıyla karşılaştırır;
   - 3 runner'ı systemd servisi olarak kaydeder (`RUNNERS=2 bash ...` ile sayı değişir).
3. **WSL'yi arka planda açık tut.** Windows PowerShell'de çalıştır:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\infra\ci-runner\keep-wsl-alive.ps1 -Distro Ubuntu
   ```
   WSL, son terminal kapanınca dağıtımı durdurur. Bu betik oturum açılışında ve sonra **her 5 dakikada bir** gizli bir `sleep infinity` başlatarak bunu önler; WSL bellek yetmezliği ya da güncelleme yüzünden kapanırsa birkaç dakikada kendiliğinden geri gelir. Betiği daha önce çalıştırdıysan bir kez daha çalıştır (görev güncellenir).
4. GitHub'daki *Runners* sayfasında 3 runner'ı **Idle** olarak gördüğünde Claude'a "runner kuruldu" de. Claude ardından:
   - `CI_RUNS_ON` repo değişkenini `["self-hosted","linux","x64","mohonaut"]` yapar;
   - Medusa süresi için `FUZZ_SECONDS` değişkenini `3600` yapar.

5. **İsteğe bağlı: canlı izleme.** `ci-monitor-shortcut.ps1` masaüstüne **Mohonaut CI** kısayolu koyar. Çift tıklayınca runner'ın kaydı canlı akar: hangi iş çalışıyor (`Running job: ...`) ve nasıl bitti (`... completed with result: Succeeded/Failed`). Pencereyi kapatmak runner'ı etkilemez.

## Bilinmesi gerekenler

- Bilgisayar kapalıyken ya da uykudayken CI koşmaz; işler kuyrukta bekler ve makine açılınca koşar.
- Bir koşu birkaç işi aynı anda çalıştırır ve 20–30 dakika CPU kullanır.
- Windows'taki Docker Desktop'ın **Ubuntu WSL entegrasyonunu açma**: runner'lar WSL içindeki kendi Docker'ını kullanır.
- **Güvenlik:** fork'lardan gelen PR'lar bu makinede **asla** koşmaz; workflow onları GitHub'ın runner'larına gönderir. Repo açıldığında `CI_RUNS_ON` silinir ve CI GitHub'ın ücretsiz runner'larına döner.
- **Kaldırma:** her `~/actions-runner/runner-N` klasöründe `sudo ./svc.sh stop && sudo ./svc.sh uninstall && ./config.sh remove` çalıştır; zamanlanmış görev için `Unregister-ScheduledTask -TaskName MohonautWslKeepAlive -Confirm:$false`.

## Runner "Offline" görünürse

GitHub *Runners* sayfasında runner **Offline** ise ya da bir iş "The self-hosted runner lost communication" hatasıyla düştüyse:

1. Laptop açık mı, uykuda mı? Güç ayarında **uyku: hiçbir zaman** olmalı (kapak kapalıyken de).
2. Windows güncellemesiyle yeniden başladıysa oturum açılmadan WSL başlamaz: laptopta bir kez oturum aç.
3. Bellek: `forge coverage` en ağır iştir. WSL'ye yeterli bellek ve takas alanı ver. Windows'ta `%UserProfile%\.wslconfig` dosyasına şunu yaz, sonra PowerShell'de `wsl --shutdown` çalıştır (görev 5 dakika içinde WSL'yi yeniden açar):
   ```ini
   [wsl2]
   memory=6GB
   swap=8GB
   ```
   (Laptopta 8 GB'den az bellek varsa `memory` değerini toplamın yarısı yap.)
4. Runner servisini kontrol: WSL terminalinde `systemctl status 'actions.runner.*'`.
