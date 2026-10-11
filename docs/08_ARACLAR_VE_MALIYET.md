# 08 — Araçlar ve Sıfır Bütçe Planı (v0.2)

> **Kurucu kararı (2026-10-10):** Dışarıdan bütçe yok ve olmayacak; her şeyi kendimiz yapacağız. Bu doküman buna göre yeniden yazıldı. Kural: **Önce ücretsiz ve self-host; ücretli bir şey yalnızca oyunun kendi geliri (ETH gelirinin %15'lik ops payı) onu karşıladığında ve önceden ilan edilmiş bir sırayla açılır.**

---

## 1. Neden sıfır bütçe bu tasarımda mümkün?

| Kalem | Neden kurucu sermayesi gerekmiyor |
|---|---|
| Token likiditesi | Adil madencilik lansmanı: premine, dev buy, ön satış yok. Açılış havuzunu **oyuncuların yakıt ödemelerinin POL payı** oluşturur (02 §11). Kurucu tek kuruş koymaz. |
| Deploy | Robinhood Chain'de işlem ≈ $0.006; tüm kontrat deploy'u birkaç dolar. |
| Keeper | Saatlik poke + günlük işlemler ≈ ayda birkaç dolar gas. |
| Sunucu | Hetzner zaten var. |
| Giriş | Cüzdanla giriş (WalletConnect/RainbowKit) ücretsiz ve sınırsız. |
| Gas | v1'de sponsorlu gas yok; oyuncu kendi gas'ını öder (işlem başı ≈ $0.006). |

---

## 2. Ücretsiz araç yığını

| Alan | Araç | Not |
|---|---|---|
| Geliştirme | Claude Code, GitHub (ücretsiz org + Actions), Foundry, Node, npm, Python | Açık repo → Actions dakikaları ücretsiz |
| Güvenlik | Slither, Aderyn, Medusa, Echidna, Halmos, Certora (açık kaynak), Gambit / Foundry mutasyon, Semgrep, gitleaks, OWASP ZAP | Hepsi ücretsiz |
| İkinci AI görüşü | Başka bir AI kod asistanının ücretsiz katmanı (ör. Gemini Code Assist) + farklı rol promptlarıyla ayrı Claude oturumları | Yalnızca ön tarama; denetimin yerini tutmaz |
| RPC | Alchemy ücretsiz plan (birincil; Robinhood Chain dahil, 30M CU/ay, WSS var ama yeni blok aboneliği kotayı aşar), public RPC (yedek; WebSocket yok) | Doğrulandı (0.4) |
| Cüzdan bağlantısı | wagmi + viem + RainbowKit (veya Reown AppKit ücretsiz katman) + WalletConnect project ID + SIWE | Robinhood Wallet, MetaMask, Rabby, Phantom |
| E-posta/Google girişi (opsiyonel) | Dynamic ücretsiz katman (≤ 1,000 MAU) veya Privy (≤ 499 MAU) | Limit aşılınca ücretli kademe ops gelirinden (bkz. §3) |
| İndeksleyici | Kendi log okuyucumuz (viem getLogs + Postgres) | Ponder ücretsiz RPC'ye sığmıyor (~843K blok/gün; 03 ADR-010) |
| Veritabanı | Postgres + Redis (self-host) | Hetzner'de |
| Deploy | Coolify veya Dokploy (self-host) | |
| CDN / güvenlik | Cloudflare ücretsiz plan (DNS, proxy, temel WAF, Turnstile, Access ≤ 50 kullanıcı) | |
| İzleme | OpenZeppelin Monitor, Prometheus, Grafana, Loki, Uptime Kuma (hepsi self-host); Sentry ücretsiz katman | |
| E-posta bildirimi | Resend ücretsiz katman veya yalnızca Telegram bot (ücretsiz) | |
| Analitik | PostHog ücretsiz katman veya self-host Plausible/Umami | |
| Görsel üretim | **Kenney.nl** izometrik paketleri (CC0, ticari kullanım serbest) + Recraft / Ideogram ücretsiz katmanları + bu oturumdaki Higgsfield bağlantısı (kredi harcar — her kullanımda önce sor) | Her varlığın lisansı `docs/legal/ASSET_LISANSLARI.md`'ye yazılır |
| Sprite düzenleme | Pixelorama veya LibreSprite (ücretsiz), Krita, Inkscape (vektör logo) | |
| Tasarım | Figma ücretsiz katman veya Penpot (açık kaynak) | |
| Müzik/ses | Lisansı açık kaynaklar (CC0 / ticari kullanıma izin veren kütüphaneler); AI müzik araçlarının **ücretsiz katmanları genelde ticari kullanıma izin vermez**, kontrol et | |
| Fontlar | Google Fonts (SIL OFL) | 05 §2.5 |
| Topluluk | X (2 hesap), salt okunur Telegram kanalı, Discord (opsiyonel) | |
| Gönderi planlama | X'in kendi zamanlayıcısı | Typefully vb. gerekmez |

---

## 3. Gelirle açılan harcamalar (önceden ilan edilen sıra)

Lansmandan sonra ops payı Ops Safe'te birikir. Aşağıdaki sıra **lansmandan önce herkese açık ilan edilir** ve her harcama aylık ops raporunda gösterilir. Eşikler kurucu tarafından doldurulacak; örnek değerler verildi.

| Sıra | Ops kasası eşiği (örnek) | Harcama | Neden |
|---|---|---|---|
| 1 | İlk gelir | Domain yenileme, X Premium (opsiyonel) | Temel |
| 2 | $2K | **Bug bounty fonu** (ETH, kritik bulgu için) | Güvenlik |
| 3 | $5K | Hukuki danışmanlık (hâlâ yapılmadıysa) | Kurucunun kişisel riski |
| 4 | $15K–40K | **Bağımsız güvenlik denetimi** | "Denetlenmedi" etiketini kaldırmak ve korumalı lansman sınırlarını gevşetmek için şart |
| 5 | Kullanıma göre | E-posta/Google girişinin ücretli kademesi, sponsorlu gas | Onboarding |
| 6 | Kullanıma göre | İnsan illüstratör (maskot, ana sahne) | Marka kalitesi |

> Kemikleşme (yükseltme yetkisinin bırakılması) ve korumalı lansman sınırlarının kaldırılması **bağımsız denetimden sonra** yapılır (04 §5).

---

## 4. Hibe ve destek başvuruları (ücretsiz para)

| Program | Ne sağlayabilir | Durum |
|---|---|---|
| Arbitrum Open House (Robinhood'un $1M taahhüdü) | Kurucu programı, destek, görünürlük | Araştırma raporunda geçiyor; başvuru koşulları Faz 0'da kontrol edilecek |
| Robinhood Chain buildathon ($115K, Robinhood Chain projelerine podyum) | Ödül parası → denetim bütçesi | Takvim Faz 0'da kontrol edilecek |
| Arbitrum ekosistemi denetim sübvansiyonları | Denetim maliyetinin bir kısmı | Programın 2026'da hâlâ açık olup olmadığı doğrulanacak |
| Hackathon ödülleri (ETHGlobal vb.) | Para + görünürlük | Takvime göre |

---

## 5. Kaçınılması zor küçük maliyetler

| Kalem | Tahmini | Not |
|---|---|---|
| Domain (mohonaut.com + savunma domainleri) | ~$30–100/yıl | .gg tek başına ~$30–70/yıl; savunma domainleri sonra |
| **Donanım cüzdanı ×1 (en az)** | ~$60–80 | Safe imzacısı için. Yazılım cüzdanla Safe yönetmek Bybit tipi riskleri büyütür. Atlanmaması gereken tek güvenlik harcaması. |
| X Premium | $0–8/ay | Opsiyonel |

---

## 6. Sıfır bütçenin dürüst bedeli

| Vazgeçilen | Bedeli | Telafi |
|---|---|---|
| Lansman öncesi ücretli denetim | Araştırmaya göre AI denetçiler hataların ~%50–65'ini buluyor, ama gerçek istismarı yeniden üretmede başarıları %0. Denetimsiz kontrat en büyük teknik risk. | Küçük kapsam + biçimsel ispat + herkese açık inceleme + korumalı lansman sınırları + gelirle denetim (04 §5) |
| Hukuki görüş | Kurucunun Türkiye'deki kişisel cezai riski (7518, 7258) | **Tek seferlik bir danışmanlık bile riski büyük ölçüde azaltır**; en az bunun yapılmasını öneriyorum. Tasarımdaki risk azaltıcılar: İngilizce iletişim, Türkçe token tanıtımı yok, kumar mekaniği yok, saklama/swap yok (07). |
| Ücretli giriş servisi | E-posta ile giriş ilk günden sınırsız olmayabilir | Cüzdan girişi sınırsız; e-posta ücretsiz kademe limitinde |
| İnsan illüstratör | Marka tutarlılığı | CC0 paketler + AI + tutarlı stil rehberi; gelirle illüstratör |
