# 09 — Onboarding: İlk Temastan Cüzdandaki İlk Tokene (v0.1)

> **Durum:** v0.1 — 2026-10-10. Dayanak: `research_notes/` (iç notlar), araştırma raporu, Bigcoin / Sunflower Land / Gigaverse ek raporları (bu oturumda), `docs/ZINCIR_DOGRULAMA.md`. Ekonomi kuralları için `02`, ekranlar için `01`.
>
> **İç kullanım:** §1'deki rakip analizi yalnızca iç kullanım içindir. Herkese açık hiçbir metinde rakip adı geçmez (05 §6.4b).

---

## 1. Diğer oyunlarda gördüğümüz

_İç karşılaştırma `research_notes/rakip-karsilastirma.md` dosyasına taşındı (iç notlarla birlikte özel repoda tutulur; CLAUDE.md rakip adı kuralı)._

## 2. Bizim akışımız: altı aşama

```
T−42 … T−7         T−28 … T−7            T−7           T−24s … T0        T0 … T0+72s          T0+72s →
┌────────────┐   ┌──────────────────┐   ┌─────────┐   ┌────────────┐   ┌──────────────┐   ┌───────────────┐
│ Training   │──►│ Testnet Sezon 0  │──►│ Kontrat │──►│ Pre-fill   │──►│ Genesis Dig  │──►│ Market Open   │
│ Site       │   │ (kanıtlanmış     │   │ yayını  │   │ (kayıt +   │   │ (kazım, piyasa│   │ (havuz formülle│
│ (cüzdansız)│   │  oyun, rozet)    │   │ + rehber│   │  yakıt)    │   │  yok, rafine  │   │  kurulur,     │
└────────────┘   └──────────────────┘   └─────────┘   └────────────┘   │  kapalı)      │   │  rafine açılır)│
                                                                       └──────────────┘   └───────────────┘
```

### Aşama A — Training Site (cüzdansız, ücretsiz, anında)
- Landing'deki "Try the rig" butonu tarayıcıda çalışan bir **deneme sahası** açar. Cüzdan, kayıt ve sunucu gerektirmez; oyun formülleri (`packages/sdk`) yerel olarak çalışır.
- Oyuncu Pilot Rig'e yakıt koyar, kule alır, sahayı büyütür, kuyu logunun nasıl ilerlediğini görür. Zaman 60× hızlıdır. Token ve para yoktur; ekranda "simulation" etiketi durur.
- Amaç: ilk oturumu **ücretsiz ve tokensiz** yapmak (ders 1) ve oyuncuyu mainnet'e mekaniği bilerek getirmek.
- Paylaşım: "I ran a test rig in the Mohonaut training site" kartı (kazanç rakamı yok).

### Aşama B — Testnet Sezon 0 (bekleme listesinin yerine)
- Gerçek kontratlar testnet'te (46630). Giriş: cüzdan (RainbowKit + SIWE) veya e-posta (ücretsiz kademe).
- **Testnet ETH sorunu:** Faucet'ler mainnet ETH bakiyesi istiyor (Alchemy ≥ 0.001 ETH, Chainstack ≥ 0.08 ETH). Çözüm:
  1. Testnet'teki sahte fiyat beslemesi (`MockV3Aggregator`) yakıtı çok ucuza fiyatlar. Bir haftalık oyun ≈ 0.0005 testnet ETH tutar.
  2. **Kendi küçük faucet'imiz:** Turnstile + IP/cüzdan başına günlük limit; kurucu, ücretsiz faucet'lerden aldığı testnet ETH'yi buraya koyar.
- **Kanıt = oyun:** Beğen/RT görevi, XP sıralaması ve cüzdan adresi yapıştırma yok. Şu kilometre taşlarını tamamlayan oyuncu transfer edilemez **"Pioneer"** kozmetik rozetini kazanır: ilk yakıt → ilk kule → L3 → ilk rafine → crew'a katılma.
- Rozet mainnet'e **yalnızca kozmetik** olarak taşınır. Token, öncelik veya ekonomik avantaj vermez (hukuk ve bot dersi).
- Kişisel davet linki burada verilir (tek seviye). Mainnet'te `register` referrer'ına bağlanır.
- Sezon 0 aynı zamanda herkese açık betadır: hata bildirimi formu, cihaz/cüzdan matrisi, yük testi.

### Aşama C — Kontrat yayını (T−7)
- Mainnet kontratları deploy edilir, Blockscout'ta doğrulanır, roller devredilir. `/contracts` sayfası yayımlanır.
- **"Market Open'dan önce MOHN için hiçbir havuz yoktur. Gördüğünüz her havuz sahtedir."** uyarısı sitede ve sabit tweette yer alır.
- **"Robinhood Chain'e ETH nasıl getirilir" rehberi** yayımlanır (§5).
- Cüzdan uyarısı ön temizliği başlar (§6).
- **İlk çekim kuralları** yayımlanır ve dondurulur (§4).

### Aşama D — Pre-fill (T−24 saat → T0)
- Oyuncu sahasını açar ve tankını doldurur. **Tek işlem:** `buyFuel` kayıtlı olmayan hesabı otomatik kaydeder, ücretsiz Pilot Rig'i verir ve tankı doldurur.
- Genesis tank sınırı: tank en fazla Market Open + 24 saate kadar yeter (02 §11).
- Kazım herkes için **aynı anda T0'da** başlar. Ödül pay oranıyla bölündüğü için "ilk giren kazanır" yarışı yoktur; botların hız avantajı işe yaramaz.

### Aşama E — Genesis Dig (T0 → T0+72 saat)
- Kazım açık, piyasa yok, rafine kapalı. Canlı sayaç akar.
- Rafine edilmemiş MOHN oyun içinde harcanabilir: kule alımı, saha yükseltmesi.
- Tokenın oyunda görünür olduğu ama henüz cüzdana çekilemediği ilk andan itibaren ekranda kalıcı bir açıklama durur: "Refining opens at Market Open: [tarih/saat UTC]".

### Aşama F — Market Open (T0+72 saat) ve sonrası
- `openMarket()` formülle havuzu kurar (02 §11). İlk çağrıyı keeper yapar, ama herkes çağırabilir.
- Rafine açılır: **hızlı** (%8, anında) veya **standart** (72 saat, ücretsiz).
- Market Open'dan sonra katılan oyuncu için akış aynıdır, yalnızca genesis kısıtı yoktur: tek işlem → kazım başlar → istediği an rafine.

---

## 3. İlk 5 dakika (mainnet, yeni oyuncu)

| Adım | Ekran / metin (İngilizce) | Kural |
|---|---|---|
| 1 | Landing → **Play** (veya önce **Try the rig**) | Giriş zorunlu değil, saha görüntüleyici herkese açık |
| 2 | **Connect** — wallet (Robinhood Wallet, MetaMask, Rabby, Phantom, WalletConnect) or email | Mobil öncelikli; WalletConnect ilk günden |
| 3 | Tek imza (SIWE): "This signature only logs you in. It cannot move funds." | `eth_sign` asla; okunabilir mesaj; oturum başına bir imza |
| 4 | "Your Pilot Rig is ready. Fill the diesel tank to start drilling." Önerilen dolum: 48 saat. Gösterilen: ETH tutarı + gas + "≈ $1.2". | ETH yoksa → §5 rehberi |
| 5 | **Tek işlem** (`buyFuel`: kayıt + Pilot Rig + yakıt) | İşlem gönderilince Blockscout linki; ekran asla "kayboldu" durumuna düşmez (§7) |
| 6 | Canlı sayaç başlar + 4 adımlık rehber: kuyu logu → payın → tank → ekipman pazarı | Atlanabilir; tekrar açılabilir |
| 7 | İlk hedef: "Reach 150 MOHN → upgrade your site to L2" | İlerleme hissi ilk saatte |
| 8 | Bildirim izni (e-posta/Telegram): tank azalınca uyarı | Opsiyonel |

**Başlamak için gereken ETH:** Pilot Rig 0.25 ℓ/h × $0.10 = $0.60/gün. 48 saatlik ilk dolum ≈ $1.2 + gas (< $0.01). Önerilen başlangıç: **$2–5 değerinde ETH**.

**Neden ücretsiz yakıt yok?** Ücretsiz yakıt, sınırsız sahte hesabın emisyondan bedava pay alması demek. Ekonomimiz, her DP'nin yakıt maliyetinin doğrusal olmasıyla bot-nötr çalışıyor (02 §0). Ücretsizlik ihtiyacını Training Site ve testnet Sezon 0 karşılıyor.

---

## 4. İlk çekim kuralları (lansmandan önce yayımlanır, asla değişmez)

| Kural | Değer |
|---|---|
| Genesis boyunca rafine | Kapalı (T0 → T0+72 saat) |
| Market Open sonrası hızlı rafine | %8 ücret (%4 yakılır, %4 rezerve döner), anında |
| Standart rafine | Ücretsiz, 72 saat kuyruk |
| Minimum çekim / harcama şartı / itibar kapısı / KYC | **Yok** |
| İlk MOHN'un cüzdana gelebileceği en erken an | Hızlı rafine: T0+72 saat · Standart: T0+144 saat |
| Kurucu ve hazine çekimleri | Yalnızca standart kuyruk, herkese açık |

> Bu tablo `/docs/refining` sayfasında ve oyun içi Rafineri ekranında aynen yer alır. Değişmesi kontrat yükseltmesi gerektirir (7 gün timelock) ve kurucu politikası olarak **geriye dönük değişiklik yapılmaz**.

**Token arzı zaman çizelgesi (oyuncuya açıkça anlatılır):**
- T0'dan önce MOHN arzı **sıfırdır**. Premine yoktur.
- Genesis boyunca token **tahakkuk eder** ama basılmaz. Rafine edilmemiş bakiyeler zincirde kayıtlıdır.
- İlk basım Market Open'da gerçekleşir: havuz likiditesi (≤ 1M MOHN, formülle) ve ilk hızlı rafineler.
- Günlük mint tavanı: 500K MOHN (02 §2). Normal oyunda dolmaz; dolarsa standart kuyruk ertesi gün tamamlanır.

---

## 5. Robinhood Chain'e ETH getirme rehberi (2026-10-10'da canlı API'lerle doğrulandı)

> Ayrıntı ve kaynaklar: `research_notes/.../12_eth_getirme_yollari.md`. Ücretler ≈ $20'lık ETH için canlı tekliflerdir; lansmandan önce yeniden kontrol edilir.

| Oyuncu | Yol | Maliyet / süre | Not |
|---|---|---|---|
| ABD'de Robinhood kullanıcısı | Robinhood uygulaması → ETH'yi **Robinhood Chain ağında** gönder | Robinhood ücreti yok, ağ ücreti kuruşlar; yeni kullanıcıda transfer açılışı 5 iş gününe kadar | New York hariç; AB ve İngiltere uygulamasında bu ağ yok |
| Borsası olan herkes | Borsadan ETH'yi **Base veya Arbitrum**'a çek → **Relay / Across / Layerswap** ile Robinhood Chain'e | Borsa ücreti + köprü $0.01–0.04; 1–5 dk | En evrensel yol. Binance'te ETH için Robinhood ağı **yok** (yalnızca işlem görmeyen ayrı "ROBINETH" var); Base/Arbitrum üzerinden geç |
| KuCoin kullanıcısı | Doğrudan ETH çekimi, "Robinhood" ağı | 0.0002 ETH (~$0.50); min 0.0004 ETH | ABD dışı |
| Bitstamp kullanıcısı | Doğrudan ETH çekimi ("hoodeth" ağı) | Min 0.00015 ETH | Bitstamp bölgeleri |
| Hiç kriptosu olmayan | **MoonPay** (kartla ETH doğrudan Robinhood Chain'e) | Ücret widget'ta; min ~$5 | ABD (NY hariç), İngiltere, AB ve diğerlerinde açık |
| Hiç kriptosu olmayan (ABD ve AB dışı) | **Mercuryo** (kartla ETH doğrudan Robinhood Chain'e) | Ücret widget'ta | ABD ve AB'de kapalı |
| Ethereum'da ETH'si olan | Resmî Arbitrum köprüsü | Ethereum gas'ı (~$0.02–0.10); ≈ 10 dk; geri çekme ≈ 7 gün | Yalnızca resmî link: Robinhood dokümanındaki portal adresi |
| Robinhood Wallet kullanıcısı | Uygulama içi çapraz zincir swap (0x / LI.FI) | ~%0.85 + köprü ücreti | Cüzdan yaptırım altındaki ülkeler dışında her yerde kurulabiliyor |

**Cüzdanlar:** MetaMask, Rabby, Phantom, Coinbase Wallet / Base App, Trust Wallet, OKX Wallet, Binance Wallet, Rainbow, Bitget Wallet, Zerion ve Backpack zinciri destekliyor. Phantom'da ağ varsayılan olarak kapalı olabilir; rehberde nasıl açılacağı gösterilir.

**Ne kadar ETH gerekli?** Bir oyun işlemi ≈ $0.008 gas. $1'lık ETH 100'den fazla işlem demek. Önerilen başlangıç: $2–5.

**Kurallar:**
- Rehber yalnızca **Robinhood'un resmî dokümanında listelenen köprüleri** ve doğrulanmış sağlayıcıları gösterir. Sahte köprü ve kendini yok eden scam token uyarısı içerir.
- Sıfır bütçe: on-ramp entegrasyonu yok, yalnızca dış linkler. MoonPay/Mercuryo widget'ı gelirle ve hukuki görüşle değerlendirilir.
- Türkçe ETH/token edinme rehberi **yayımlanmaz** (05 §6.2). Türk oyuncular İngilizce genel rehberi kullanır. MoonPay ve Mercuryo Türkiye'de açık görünüyor, ama bunu Türkçe tanıtmak hukuki risk taşır.

---

## 6. Cüzdan uyarısı ön temizliği

> **Ne oldu? (araştırma, 2026-10-10; ayrıntı: `research_notes/.../11_cuzdan_uyarisi.md`)** Bir rakibin sitesi MetaMask'ın GitHub listesinde değildi. Uyarıyı Blockaid'in site taraması (BLOCK / DRAINER) verdi. Tetikleyen desen: ilk saatlerde ~1,000 yeni cüzdanın tek bir adrese küçük ETH tutarları göndermesi. GitHub başvurusu "not planned" diye kapatıldı. Uyarı Blockaid tarafında 1–2 günde kalktı.
>
> **Bizim için önemli:** Yakıt alımı da "çok sayıda yeni cüzdan → tek adrese küçük ETH" deseni üretir. Farkımız: alıcı **doğrulanmış bir kontrat**, fonksiyon adı okunabilir (`buyFuel`), approve yok. Yine de aşağıdaki önlemler zorunlu. Not: MetaMask, Robinhood Chain'de (4663) Blockaid **işlem simülasyonu** yapmıyor; site, adres ve token taraması ise bu zinciri kapsıyor.

**Kontratlar**
- Hepsi **en az 3 gün önce** (bizde T−7) deploy edilmiş ve Blockscout + Sourcify'da doğrulanmış olmalı. Rabby, son 3 günde deploy edilen kontratlar için uyarı veriyor.
- Hazine Safe'te tutulur; EIP-7702 delegasyonlu EOA olmaz (tarayıcılar bunu boşaltılmış cüzdan gibi görüyor). Hiçbir ödeme EOA'ya gitmez.
- Oyuncudan token approve istenmez. Yakıt düz ETH `payable` çağrısıyla alınır; harcamalar rafine edilmemiş bakiyeden yapılır. Cüzdandan ödeme gerekirse yalnızca tam tutar approve. `setApprovalForAll`, sınırsız allowance, permit/permit2 ve dApp kaynaklı EIP-7702 (type-4) işlemi yok; MetaMask bunları zaten reddediyor.
- Lansmandan sonra ani kontrat veya arayüz değişikliği yapılmaz (yeniden işaretlenme riski).

**İmza ve metin**
- SIWE (EIP-4361): `domain` = `window.location.host`, `URI` = tam origin, chainId 4663, sunucu nonce'u. `eth_sign` ve hex mesaj asla.
- Her imzadan önce okunabilir açıklama gösterilir. Arayüz etiketleri zincirde çağrılan fonksiyonla birebir uyuşur.
- Oyuncuya dönük metinlerde **"claim", "airdrop", "verify wallet", "sync", "revoke"** kelimeleri kullanılmaz; bizim terimimiz "Refine".

**Domain ve altyapı**
- Domain lansmandan **en az 30 gün önce** alınır ve gerçek içerikle yayına girer. Cloudflare "New Domains" kategorisi ve Phantom'un yeni domain uyarısı bu süreye bağlı.
- Kendi domainimiz kullanılır; `*.vercel.app` veya `*.pages.dev` olmaz. Domainde "robinhood" ya da "hood" geçmez, tüy logosu kullanılmaz.
- Landing sayfasının önüne Cloudflare challenge veya captcha konmaz; Turnstile yalnızca API uç noktalarında. Güvenlik tarayıcı botlarına (Blockaid, Google) izin verilir. Bota farklı içerik gösterilmez. Geo-block yalnızca hukuken zorunlu olanlar (yaptırımlar) için.
- `security.txt`, `/contracts` sayfası, Google Search Console, Reown Verify domain kaydı (AppKit metadata ile birebir aynı URL). Resmî linklerde URL kısaltıcı yok.

**Lansmandan önce yapılacak başvurular (T−7)**
1. **Blockaid "Developer – verify a project"** başvurusu: https://report.blockaid.io (domain + tüm kontrat adresleri + zincir Robinhood + e-posta).
2. Reown dashboard → Domain allowlist.
3. Google Search Console doğrulaması.
4. Taklit domain takibi: benzer adlar ChainPatrol, SEAL ve eth-phishing-detect'e bildirilir.

**Lansman operasyonu**
- T−24 saatten itibaren saatlik kontrol: `https://dapp-scanning.api.cx.metamask.io/v2/scan?url=<domain>` (NONE / WARN / BLOCK / VERIFIED).
- Hazır yanlış pozitif başvuruları:

| Nerede işaretlendi | Başvuru | Beklenen süre (anekdot) |
|---|---|---|
| MetaMask site uyarısı (scan = BLOCK) | report.blockaid.io/mistake + support@blockaid.co + MetaMask destek | 1–3 gün; temizlenince dakikalar içinde yayılır |
| eth-phishing-detect listesi | GitHub kaldırma şablonu + app.chainpatrol.io/dispute | SLA yok |
| Coinbase Wallet / Rainbow / Zerion / Ledger | report.blockaid.io/mistake | Blockaid ile aynı |
| Phantom | ~1 hafta bekle, sonra Phantom inceleme formu | Birkaç gün |
| Rabby | MetaMask ve ScamSniffer durumu + fun@scamsniffer.io | Bilinmiyor |
| Chrome "Deceptive site" | Search Console → Request Review (yalnızca sorun düzeltildikten sonra) | Günler–haftalar |

---

## 7. Lansman günü cüzdan ve işlem deneyimi kontrol listesi

- [ ] WalletConnect + mobil cüzdanlar (Robinhood Wallet dahil) testnet'te uçtan uca test edildi
- [ ] iOS Safari, Android Chrome, cüzdan içi tarayıcılar, X uygulama içi tarayıcı ("open in browser" yönlendirmesi)
- [ ] **Takılmayan ödeme durumu:** işlem hash'i saklanır, sayfa yenilense de makbuz yoklanır, her durumda Blockscout linki gösterilir — kod tarafı 2026-10-13 (`apps/web/src/game/pending.ts`, `useResumeTx`; anvil E2E). Testnet'te mobil cüzdanla elle doğrulanınca işaretlenir.
- [ ] İade veya iç işlem olursa (olmaması hedef) explorer'da "internal transactions" sekmesine giden link
- [ ] Oracle bayat → net mesaj: "Fuel purchases paused: price feed update pending. Your rigs keep drilling."
- [ ] Pause → durum sayfası + banner (05 §7 şablonları)
- [ ] Gas tahmini ve "yetersiz ETH" uyarısı işlem öncesinde
- [ ] Yük testi: lansman trafiğinin 10 katı (k6) ve RPC kotası alarmı
- [ ] Sahte site ve sahte havuz uyarısı her sayfanın altbilgisinde

---

## 8. Bot ve sahte hesap yaklaşımı

| Alan | Yaklaşım |
|---|---|
| Mainnet emisyonu | **Kapı yok.** Ekonomi bot-nötr: her DP doğrusal yakıt maliyeti öder. Hesap bölmek pay kazandırmaz (simülasyonla doğrulandı: aynı günde oran ≈ 1.0). |
| Referans kredisi | Zincir üstü koşul: davet edilen ≥ 0.003 ETH yakıt almış olmalı |
| Pioneer rozeti, crew ve sezon sıralamaları, Survey | Turnstile + IP/ASN/cüzdan kümeleme; işaretli hesaplar kozmetik ödül alamaz |
| Faucet (testnet) | Turnstile + günlük limit |
| Çekim | Kapı yok (bot-nötr ekonomi). Hiçbir oyuncunun zincir üstü bakiyesine el konmaz. |

---

## 9. Ölçüm (huni)

`landing → training site → connect → ilk yakıt (tek işlem) → L2 → ilk kule → ilk rafine → D1 / D7 / D30`

Ayrıca: imzadan işleme düşüş oranı, cüzdan ve cihaz dağılımı, işlem hatası oranı, ilk yakıta kadar geçen süre, "ETH yok" ekranından dönüş oranı, Sezon 0'da kilometre taşı hunisi. Herkese açık metriklerde **kaynak ve dönem** belirtilir (Robinhood ToS §5.7(k)).

---

## 10. Uygulama adımları (yol haritasına eklenenler)

| Adım | Nerede |
|---|---|
| Training Site (sdk formülleriyle yerel simülasyon) | 06 → Faz 4.2 (landing) |
| Testnet Sezon 0 + kendi faucet'imiz + Pioneer rozeti | 06 → 8.2 |
| `buyFuel` otomatik kayıt (tek işlem) | 06 → 2.3 |
| ETH getirme rehberi + doğrulama | 06 → 0.6 sonrası (Faz 0 kontrolü) |
| Cüzdan uyarısı ön temizliği | 06 → Faz 9 runbook |
| İlk çekim kuralları sayfası | 06 → 4.2 (/docs) |
