# 05 — Marka, Web Sitesi ve X Lansman Planı (v0.3)

> **Durum:** v0.3 — 2026-10-11. İsim (**Mohonaut / $MOHN**), görsel konsept (gece aydınlatmalı yüzey sondaj sahası + tek ortak kuyu **World Bore**), dizel yakıt dili, bekleme listesi yerine **Training Site + Testnet Season 0**, 96 saatlik timelock, sıfır bütçe ve Robinhood Chain ToS kuralları işlendi. Bu doküman marka kimliği, web sitesi, X stratejisi, içerik takvimi, lansman iletişimi ve pazarlama KPI'larının tek doğruluk kaynağıdır. Çelişki olursa ekonomi sayıları için **02 v1.0**, oyun sistemleri ve görsel dil için **01 v0.2**, oyuncu girişi ve cüzdan uyarısı için **09** geçerlidir; burası onlara göre güncellenir.
>
> **Dayanak:** `01_OYUN_TASARIMI.md` (GDD v0.2), `02_TOKENOMI_VE_OYUN_MATEMATIGI.md` (v1.0, donduruldu), `04_GUVENLIK_TEST_DENETIM.md` §5 (korumalı lansman), `08_ARACLAR_VE_MALIYET.md` (sıfır bütçe), `09_ONBOARDING.md`, `ISIM_SPRINTI.md` (isim kararı), `ZINCIR_DOGRULAMA.md` §11 (Robinhood Chain ToS), `reports/Robinhood Chain mining oyunu araştırması.md` ve `research_notes/.../07_launch_branding_x_strategy.md`. §1'deki kanıt tabloları 2026-10-10 kontrolleridir ve tarihsel olarak korunmuştur.
>
> **Hukuki uyarı:** Bu doküman hukuki tavsiye değildir. §6'daki dil rehberi, tüm tweet ve site metinleri, referans ve sezon ödülleri ile Türkçe iletişim kuralları yayımlanmadan önce hukuki gözden geçirmeden geçmelidir. Hedef: Türk sermaye piyasası + şans oyunları alanında **en az tek seferlik danışmanlık** (06 → 0.2; 08 §6). Danışmanlık yapılamazsa kurucu riski yazılı olarak üstlenir (04 §8) ve **[avukat]** işaretli taslaklar ya yayımlanmaz ya da en temkinli alternatifleriyle değiştirilir. Kurucu kimliği açık bir Türk vatandaşı olduğu için en yüksek risk kurucunun kişisel sorumluluğudur (araştırma raporu, "Hukuki çerçeve").
>
> **Bütçe (kurucu kararı, 2026-10-10):** Dış bütçe yok. Bu dokümandaki ücretli kalemler (X Ads, X Verified Organizations, X Premium, DexScreener ücretli profil, marka tescil ücretleri ve marka vekili, ücretli AI görsel planları ve Higgsfield kredisi, insan illüstratör, savunma domainleri) **opsiyoneldir** ve yalnızca oyunun ops geliriyle, `08` §3'teki ilan edilmiş sırayla açılır. Kredi harcayan bir araç kullanılmadan önce maliyet söylenir ve kurucu onayı alınır. Ücretsiz karşılıklar: TMview/USPTO'da kendi ön aramamız, kendi çizdiğimiz özgün görseller (dış görsel ya da paket yok, §2.6), Inkscape/Krita, X'in kendi zamanlayıcısı.
>
> **Gizlilik ve iç kullanım:** Bu doküman **iç kullanım** içindir; herkese açık dokümantasyon sitesine kopyalanmaz. Rakip adları yalnızca §1'de (tarihsel kanıt), §6.4b'de (yasak listesinin tanımı) ve §9'da (**İÇ KULLANIM** etiketli rakip analizi) geçer. §2–§8'deki her İngilizce taslak herkese açık metin olarak yazıldı ve rakip adı ya da imâsı içermez (§6.4b).
>
> **Dil kuralı:** Doküman Türkçe; tweet, site metni, görsel prompt'ları ve Space konuşma metinleri İngilizce. Taslaklar özgündür; başka projelerin gönderileri kopyalanmadı. Taslaklarda bilerek emoji kullanılmadı.
>
> **Adlandırma kuralları (özet; ayrıntı §2.1–§2.2):** Oyun **Mohonaut**; token **MOHN**, ticker **$MOHN**; topluluk **Mohonauts**. "Moho" tek başına yalnızca jeolojik hedef için kullanılır (Moho Line, "Race to the Moho"). **$MOHO hiçbir yerde kullanılmaz** (Robinhood Chain'de 4 ölü kontratla çakışıyor; `ISIM_SPRINTI.md` §3.4). Yakıt dizeldir (ℓ, ℓ/h); "energy", "kWh", "kW" yok. Simülasyon kodundaki `DIG` kod adı yalnızca iç kullanımdır ve hiçbir herkese açık metne çıkmaz.

---

## 0. Özet kararlar (TL;DR)

| Konu | Karar |
|---|---|
| Oyun / marka adı | **Mohonaut** (kurucu kararı 2026-10-11, `ISIM_SPRINTI.md`). Anlamı: "Moho explorer". Moho = Mohorovičić süreksizliği, kabuk ile manto arasındaki sınır; *-naut* = yolcu, kâşif. Türkçede "Mohonot" diye okunur |
| Token | **MOHN / $MOHN**. CoinGecko, DexScreener ve GeckoTerminal'de (Robinhood ağı dahil) temiz; ilan öncesi ve T−10'da kontrol tekrarlanır |
| Sloganlar | Birincil: **"Not the moon. The Moho."** · İkincil: **"Race to the Moho."** ve **"Every token comes out of the ground."** · Oyun içi: "One bore. Every driller." (01 §1) |
| Topluluk | Oyuncular **Mohonauts**, loncalar **Crews** |
| Maskot | **Foreman Mo** (ad korundu, gerekçe §2.3): baretli, kafa lambalı köstebek ustabaşı. Tek maskot, yan karakter yok |
| Kanonik domain | **mohonaut.com**; `mohonaut.gg` 301 ile buraya yönlenir |
| Proje X hesabı | **@playmohonaut** (`@mohonaut` alınamıyor; izleme listesinde, §4.5) |
| Savunma hesapları | **@mohonauts**, **@mohonautgame**, **@mohonauthq** (gönderisiz, kilitli; §0.1) |
| Kurucu hesabı | **@onderyazici** (bio ve içerik hijyeni, §4.2) |
| Görsel yön | Gece aydınlatmalı 2.5D izometrik **yüzey sondaj sahası**; bütün oyuncular tek bir ortak kuyu açar: **World Bore**. İmza öğe: **kuyu logu / karot sütunu**, gerçek litoloji renk bantlarıyla. Grafit zemin, emniyet turuncusu ekipman, sodyum lamba ışığı, buhar ve yağmur; camgöbeği yalnızca enstrüman HUD'unda |
| Oyun görünümü | **Tam sayfa pixel-art oyun** (kurucu kararı 2026-10-13, 01 §7): gece sondaj sahası pixel art, oyun içi yazı Pixelify Sans (OFL). Site, logo ve X görselleri bu tablodaki marka fontlarında kalır |
| Kaçınılanlar | Yeraltı tüneli, şaft, asansör/kafes, alet sallayan karakter, mücevher/kristal/damar, ay/roket/astronot görseli, pastel ve mor, ada/ev/bilgisayar odası teması, "lofi" (yerine "industrial ambient") |
| Paylaşım kartı | World Bore'a katkı: "I've cored 1,240 m of the World Bore · Crew X". Kişisel hashrate, sıralama, kazanç ve USD yok |
| Lansman öncesi oyun | Bekleme listesi yok. Ücretsiz, cüzdansız **Training Site** (T−35'ten) + oynanabilir **Testnet Season 0** (T−28 → T−8) ve kozmetik, devredilemez **Pioneer** rozeti (09 §2). Beğen/RT/yanıt görevi, XP sıralaması ve cüzdan adresi yapıştırma yok |
| Lansman mekaniği | Ön satış, dev buy, premine yok. Kontratlar T−7'de doğrulanmış olarak yayımlanır. Pre-fill T0−24 saat. **Genesis Dig 72 saat** (rafine kapalı). Havuz yalnızca **Market Open**'da (T0+72 saat) formülle kurulur → "snipe edilecek bir şey yok" |
| Yönetişim dili | Parametre değişiklikleri **96 saat** timelock, yükseltmeler **7 gün**. Her anılışta canlı kuyruk linki: `mohonaut.com/timelock` |
| Güvenlik dili | Lansman öncesi ücretli denetim yok → sitede **"Unaudited — use at your own risk"** bandı, korumalı lansman sınırları (günlük mint tavanı 500,000 MOHN, saatlik devre kesici 150,000 MOHN) ve gelirle bağımsız denetim taahhüdü (04 §5) |
| Robinhood | Yalnızca **"Built on Robinhood Chain"** kalıbı. Site altbilgisi ve topluluk kanallarında "not affiliated with Robinhood" uyarısı. Ad, domain, handle, token metadata ve AI görsellerinde Robinhood markası yok. Büyüme metriklerinde yöntem, dönem ve kaynak (ToS §5.6, §5.7) |
| Topluluk kanalları | X (2 hesap) + site + **salt okunur** Telegram duyuru kanalı; Discord opsiyonel, salt okunur, DM kapalı |
| Bütçe | Dış bütçe yok. Ücretli her kalem opsiyonel ve yalnızca ops geliriyle (08 §3) |

**Bugün yapılacaklar (24 saat içinde, isim ilan edilmeden):** §0.1'deki handle ve domainler; TMview (TÜRKPATENT dahil) ve USPTO ön aramasının "MOHONAUT" ve "MOHN" için tekrarı; MOBONAUT (EUIPO, sınıf 9/35) ve "MOHO" unsuru (Smith Micro, OnePlus, EUIPO sınıf 9) notlarının `07_HUKUK_SORU_LISTESI.md`'ye eklenmesi; repo herkese açılana kadar ($MOHN, T−35) ticker'ın hiçbir yerde anılmaması.

### 0.1 Güncel rezervasyon listesi (Mohonaut)

| Tür | Öğe | Not |
|---|---|---|
| X (proje) | **@playmohonaut** | Ana resmî hesap. `@mohonaut` alınamadı; sahibi ve durumu bilinmiyor → taklit izleme listesinde (§4.5) |
| X (savunma) | **@mohonauts**, **@mohonautgame**, **@mohonauthq**; opsiyonel `@mohonaut_xyz` | Avatar + "Not used. The only official Mohonaut account is @playmohonaut." bio, gönderi yok, DM kapalı. "support", "help", "claim", "airdrop" içeren hesap **açılmaz** (dolandırıcılık görüntüsü verir) |
| Domain (kanonik) | **mohonaut.com** | Hemen alınır. Lansmandan **≥ 30 gün önce gerçek içerikle** yayında olmalı (09 §6) |
| Domain (yönlendirme) | **mohonaut.gg** → 301 → mohonaut.com | Kaçınılmaz küçük maliyet (08 §5) |
| Domain (savunma, gelirle) | `mohonautgame.com`, `mohonauts.com`, `playmohonaut.com`, `getmohonaut.com`, `mohonaut.xyz`, `.game`, `.io`, `.app`, `.fun` | Opsiyonel, ops geliriyle (08 §3 sıra 1). Hepsi 301 → mohonaut.com |
| Domain (gerekmeyenler) | `moho.gg`, `moho.game`, `playmoho.com`, `mohogame.com`, `superdeep.*` | $MOHO ve Superdeep kullanılmıyor. Yalnızca sahte "MOHO/MOHN claim" siteleri için izlenir |
| Marka | TMview + USPTO ön tarama (ücretsiz, kendimiz). TÜRKPATENT "MOHONAUT" (+ logo) başvurusu **opsiyonel, gelirle** | Sınıf 9 ve 41 (gerekirse 28, 35, 42). Avukata: MOBONAUT ve "MOHO" unsuru |
| E-posta | `mohonaut.com` için SPF + DKIM + DMARC `p=reject` | Ücretsiz; kurumsal e-posta taklidine karşı |
| Ticker | $MOHN; repo herkese açılınca (T−35) kamuya çıkar | T−10'da CoinGecko + DexScreener + GeckoTerminal (Robinhood) kontrolü tekrarlanır. İlan anında taklit token açılacağı varsayılır |

---

## 1. İsim kısa listesi ve uygunluk kontrolü

> **Not (v0.3, 2026-10-11) — bu bölüm tarihsel kanıttır.** Aşağıdaki tablolar 2026-10-10 kontrolleridir ve değiştirilmedi. **Son karar Mohonaut / $MOHN'dir** (`ISIM_SPRINTI.md` §5, 01 §10, 02 v1.0); bu bölümdeki "Superdeep / $MOHO önerilir" sonucu geçersizdir. İki düzeltme: (1) §1.5'teki "$MOHO temiz" sonucu eksikti; GeckoTerminal'de Robinhood Chain üzerinde 4 ölü MOHO/Moho kontratı var (`ISIM_SPRINTI.md` §3.4), bu yüzden $MOHO hiçbir yerde kullanılmaz. (2) §1.9 rezervasyon listesi Superdeep içindi; güncel liste §0.1'dedir. §1.7'deki lore notunun strata adları da eskidir; güncel adlar 02 §3.4'te. Bölümde geçen proje, token ve handle adları yalnızca kanıt amaçlıdır ve hiçbir herkese açık içeriğe taşınmaz.

### 1.1 Yöntem (tümü 2026-10-10, UTC)

| Kontrol | Araç / uç nokta | Saat (UTC) | Yorum kuralı |
|---|---|---|---|
| X handle | x-radar skill → twitterapi.io `user` (`x.mjs user <handle> --json`) | 12:55–12:58 | "user not found" = aktif hesap yok (boş, rezerve ya da yakın zamanda kapatılmış olabilir; kesin sonuç ancak kayıt denemesinde). "unavailable" = askıya alınmış/kısıtlı, sahiplenilemez. |
| .com | RDAP `https://rdap.verisign.com/com/v1/domain/<d>` | 12:55–12:57 | 404 = kayıtlı değil |
| .xyz / .game | RDAP `https://rdap.centralnic.com/{xyz,game}/domain/<d>` | 12:55–13:05 | 404 = kayıtlı değil (premium fiyat olabilir) |
| .io | RDAP `https://rdap.identitydigital.services/rdap/domain/<d>` | 12:55–12:57 | IANA bootstrap'ta .io yok; doğrudan registry RDAP kullanıldı |
| .gg | WHOIS `whois.gg:43` | 12:55–12:57 | IANA bootstrap'ta .gg yok; "NOT FOUND" = kayıtlı değil |
| .app / .fun | RDAP `https://pubapi.registry.google/rdap/...`, `https://rdap.radix.host/rdap/...` | ~13:05 | yalnızca ilk 3 aday için |
| Ticker | `https://api.coingecko.com/api/v3/search?query=<q>` + `https://api.dexscreener.com/latest/dex/search?q=<q>` | 12:55–13:02 | Tam sembol eşleşmesi; DexScreener araması ~30 pair döndürür, çok küçük tokenlar kaçabilir |
| Marka (ön tarama) | USPTO public search `https://tmsearch.uspto.gov/` (wordmark sorgusu) | 12:57–12:58 | **Knock-out taraması**, tescil uygunluk görüşü değildir |
| Oyun/yazılım çakışması | Steam `store.steampowered.com/api/storesearch/?term=<q>`, Apple `itunes.apple.com/search?term=<q>&entity=software`, Wikipedia opensearch | 12:56–13:05 | Aynı ad + aynı tür = yüksek risk |
| X sohbeti | x-radar `search` ("$MOHO", "superdeep", "mohole", "undercrust") | ~13:10 | Kripto kullanımı var mı |

**Kontrol edilemeyenler:** Genel web araması (oturumun WebSearch bütçesi 200/200 tükenmişti), TÜRKPATENT, EUIPO, WIPO Global Brand DB (girişsiz/JS'siz API yok), Google Play, itch.io, Epic Games Store, domain satış fiyatları ve premium durumları, X handle'ların gerçekten kayıt edilebilirliği. **Resmî TÜRKPATENT/EUIPO/USPTO araştırması bir marka vekili veya avukat tarafından yapılmalıdır.**

### 1.2 Puanlama (18 aday: 10 verilen + 8 ek)

Ölçek 1–5 (5 = en iyi). "Çakışma" sütununda 5 = düşük risk. Ticker sütunu, isimle doğal eşleşen **temiz** bir ticker bulunup bulunmadığını puanlar.

| # | Aday | Ticker | Akılda kalıcılık | Meme | Ticker | Handle | Domain | Çakışma | **Toplam /30** | Karar |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Superdeep** | $MOHO | 4 | 5 | 5 | 5 | 3 | 5 | **27** | **Önerilen** |
| 2 | **Mohole** *(ek)* | $MOHO | 3 | 4 | 5 | 4 | 5 | 5 | **26** | Yedek 1 |
| 3 | **MOHO** | $MOHO | 5 | 4 | 5 | 4 | 3 | 2 | **23** | Yedek 2 (avukat şartlı) |
| 4 | Undercrust *(ek)* | $MOHO ($CRUST dolu) | 3 | 3 | 3 | 4 | 5 | 5 | 23 | Rezerv |
| 5 | Moleworks | $MOLE (dolu) | 4 | 4 | 1 | 4 | 4 | 4 | 21 | — |
| 6 | Overburden | $BURDEN | 2 | 2 | 4 | 3 | 4 | 5 | 20 | — |
| 7 | Borehole *(ek)* | $BORE | 3 | 3 | 4 | 4 | 3 | 3 | 20 | — |
| 8 | Rockbit *(ek)* | $RBIT | 3 | 2 | 3 | 4 | 3 | 5 | 20 | — |
| 9 | Gneiss *(ek)* | $GNEISS | 2 | 3 | 5 | 4 | 2 | 4 | 20 | — |
| 10 | Ironshaft | $SHAFT/$IRON (dolu) | 3 | 2 | 1 | 3 | 4 | 5 | 18 | — |
| 11 | Deepvein | $VEIN | 4 | 3 | 2 | 4 | 3 | 1 | 17 | **Elendi** |
| 12 | Subterra *(ek)* | $SUBT | 3 | 2 | 4 | 4 | 3 | 1 | 17 | Elendi |
| 13 | Kola *(ek)* | $KOLA | 4 | 3 | 4 | 2 | 1 | 2 | 16 | — |
| 14 | Groundbreak | $GRND (dolu) | 3 | 2 | 1 | 3 | 3 | 3 | 15 | — |
| 15 | Lodestone | $LODE (dolu) | 4 | 3 | 1 | 3 | 2 | 1 | 14 | **Elendi** |
| 16 | Deepshaft *(ek)* | $SHAFT (dolu) | 3 | 2 | 1 | 4 | 3 | 1 | 14 | Elendi |
| 17 | Delve | $DELVE | 4 | 3 | 2 | 1 | 1 | 1 | 12 | **Elendi** |
| 18 | Depth | $DEPTH | 4 | 2 | 2 | 1 | 1 | 1 | 11 | **Elendi** |

### 1.3 X handle matrisi (x-radar / twitterapi.io, 2026-10-10 12:55–12:58 UTC)

"yok" = API "user not found" döndürdü (muhtemelen alınabilir, kayıt denemesiyle teyit edilmeli).

| Aday | @bare | @play… | @…game | @…_xyz | @…hq |
|---|---|---|---|---|---|
| MOHO | var (31 takipçi, 2007, 8 gönderi, atıl) | yok | yok | yok | yok |
| Deepvein | var (4, 2009) | yok | yok | yok | yok |
| Lodestone | var (575, 2008) | yok | var (1, 2023) | yok | var (50, 2025) |
| **Superdeep** | **yok** | **yok** | **yok** | **yok** | **yok** |
| Overburden | askıda/erişilemez | yok | yok | yok | yok |
| Groundbreak | var (11, 2008) | yok | var (0, 2023) | yok | var (0, 2025) |
| Moleworks | var (0, 2022) | yok | yok | yok | yok |
| Ironshaft | askıda/erişilemez | yok | yok | yok | yok |
| Delve | var (4, 2019) | **var — "Real Rewards" oyunu, 2026-05-31** | var (0, 2017) | yok | var (0, 2020) |
| Depth | var (211, 2019) | var (67, 2018) | var (1,976, 2013 — Steam oyunu "Depth") | yok | var (3, 2018) |
| Mohole | var (3, 2008, atıl) | yok | yok | yok | yok |
| Undercrust | var (0, 2023) | yok | yok | yok | yok |
| Borehole | var (3, 2013) | yok | yok | yok | yok |
| Rockbit | var (1, 2009) | yok | yok | yok | yok |
| Deepshaft | var (0, 2009) | yok | var (0, 2012) | yok | yok |
| Subterra | var (142, 2023) | yok | var (2, 2014 — "Sub-Terra" oyunu) | yok | yok |
| Kola | var (137, 2007) | var (1, 2014) | askıda/erişilemez | var (0, 2023) | yok |
| Gneiss | var (64, 2014) | yok | var (0, 2021) | yok | yok |

Ek: `@racetothemoho` → yok; `@worlddepth` → var (0, 2023). Atıl ("dormant") bare handle'lar X tarafından kendiliğinden serbest bırakılmaz; satın alma/devir yolu belirsizdir, plan buna dayanmamalı.

### 1.4 Domain matrisi (RDAP/WHOIS, 2026-10-10 12:55–12:57 UTC)

**boş** = sorgu anında kayıtlı değil. Parantez içi = kayıt yılı.

| Aday | .com | .xyz | .gg | .io | play….com | play….xyz | …game.com | get….xyz |
|---|---|---|---|---|---|---|---|---|
| MOHO | dolu (2001) | dolu (2022) | **boş** | dolu (2016) | **boş** | **boş** | **boş** | **boş** |
| Deepvein | dolu (2004) | dolu (2026-09-08) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Lodestone | dolu (2003) | dolu (2026) | dolu (2022) | dolu (2018) | **boş** | **boş** | dolu (2007) | **boş** |
| **Superdeep** | dolu (1997) | dolu (2025-08-28, park edilmiş) | **boş** | dolu (2026-08-23, kullanılmıyor) | **boş** | **boş** | **boş** | **boş** |
| Overburden | dolu (2003) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Groundbreak | dolu (1998) | dolu (2019) | **boş** | dolu (2013) | **boş** | **boş** | **boş** | **boş** |
| Moleworks | dolu (2002) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Ironshaft | dolu (2008) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Delve | dolu (1995) | **boş** | dolu (2019) | dolu (2012) | dolu (2016) | **boş** | dolu (2024) | dolu (2024) |
| Depth | dolu (1997) | dolu (2014) | dolu (2026) | dolu (2018) | dolu (2013) | **boş** | dolu (2010) | **boş** |
| Mohole | dolu (2003) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Undercrust | dolu (2026-01-25, "satılık" sayfası) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Borehole | dolu (2000) | dolu (2026) | **boş** | dolu (2022) | **boş** | **boş** | **boş** | **boş** |
| Rockbit | dolu (1998) | **boş** | **boş** | dolu (2026) | **boş** | **boş** | **boş** | **boş** |
| Deepshaft | dolu (2011) | dolu (2026-09-11) | **boş** | **boş** | **boş** | **boş** | **boş** | **boş** |
| Subterra | dolu (1995) | dolu (2026) | **boş** | dolu (2023) | **boş** | **boş** | **boş** | **boş** |
| Kola | dolu (1993) | dolu (2021) | dolu (2026) | dolu (2022) | **boş** | **boş** | dolu (2021, redemption) | **boş** |
| Gneiss | dolu (2001) | dolu (2021) | **boş** | dolu (2016) | **boş** | **boş** | **boş** | **boş** |

Ek TLD'ler (~13:05 UTC): `superdeep.game` **boş**, `superdeep.fun` **boş**, `getsuperdeep.com` **boş**, `superdeepmine.com` **boş**, `superdeep.app` dolu; `mohole.game/.app/.fun` **boş**; `moho.game` **boş**, `moho.app` dolu. `superdeep.xyz` nameserver'ı `parklogic.com` (park edilmiş, muhtemelen satılık); `superdeep.io` Spaceship varsayılan nameserver'ında (kayıtlı, yayında site yok). Sahipleri RDAP'ta gizli; yakın tarihli kayıtlar (2025-08, 2026-08) başka bir projeye işaret edebilir, izlenmeli.

### 1.5 Ticker çakışmaları (CoinGecko + DexScreener, 2026-10-10 12:55–13:02 UTC)

| Sorgu | CoinGecko (tam sembol) | DexScreener (tam sembol; zincir, ad, likidite, pair tarihi) | Sonuç |
|---|---|---|---|
| **MOHO** | yok | yok | **Temiz.** X'te yalnızca 2024'ten dağınık cashtag anımları (ör. [Mithu6Mithu](https://x.com/Mithu6Mithu/status/1778773288963207668)); listelenmiş token bulunamadı |
| superdeep / SDEEP | yok | `sDEEP` (Sui, staked DEEP türevi, ~$8) | "SDEEP" kullanma (DEEP ailesiyle karışır) |
| mohole | yok | yok | Temiz (ama $MOHO önerilir) |
| HOLE | yok | **robinhood: "BLACK HOLE" (2026-10-09)** + Base/BSC kopyaları | Dolu |
| VEIN | (CyberVein CVT ada benzer) | arc: "Veinloot" ($2.7K, 2026-09-27) | Dolu |
| LODE | **LODE "Lode" #7193** | **robinhood: "Lode Markets" ($4.9K, 2026-09-19)**; base: Lodestar ($23.7K) | Dolu |
| MOLE | "Molecular Token" | **robinhood: "Mole Staking Syndicate" ($5.0K, 2026-10-10)**; solana: Mole dot gg ($11.4K); bsc ($11.4K) | Dolu |
| SHAFT | SHAFT #8608 | solana: SHAFT Foundation ($21.3K) | Dolu |
| IRON | Iron Fish #1644 | ethereum: Iron Fish (~$95M) | Dolu |
| GRND | SuperWalk GRND #1349; Grindr tokenized stock | robinhood: Grindr tokenized stock | Dolu |
| CRUST | Crustafarianism #6938, Crust Exchange | solana/base: çok sayıda | Dolu |
| DELVE | yok | base: "DELVE" ($2.6K) | Dolu |
| DEPTH | yok | abstract: "Depth Token" ($1.9K) | Dolu |
| BURDEN, BORE, SUBT, KOLA, GNEISS | yok | yok | Temiz |
| RBIT | yok | arbitrum: ölü "RBIT" ($0) | Zayıf |
| **DIG** (mevcut kod adı) | — | **robinhood: "Dig" ($1.9K, 2026-09-19)**; solana: DIG ($19.2K), "Digby the Mole" (2026-10-09) | **Dolu → kod adı değişmeli** |
| DRILL | — | **robinhood: "Project Mars" ($101.9K, 2026-09-09)** | Dolu (aynı nişte rakip) |

Önceden dışlananlar (görev tanımı): ORE, RIG, DEEP, CORE, SEAM, DIGG, STRAT.

### 1.6 Marka ve oyun adı çakışmaları (ön tarama)

| Aday | USPTO (canlı marka, 2026-10-10) | Steam / App Store / diğer | Risk |
|---|---|---|---|
| **Superdeep** | 1 canlı: SUPERDEEP, IC 008 el aletleri (Imperial-Newton Corp, sn 90069147). Sınıf 9/28/41'de yok | Oyun yok. 2020 Rus korku filmi *The Superdeep* (Wikipedia). İlgili tema: Steam "Kola Abyss" (Kola kuyusunda geçen korku oyunu, ad farklı) | **Düşük** |
| **Mohole** | 0 kayıt | Oyun yok. Wikipedia: Project Mohole (1960'lar, Moho'ya kadar sondaj girişimi) | **Düşük** |
| **MOHO** | 4 canlı birebir: **Smith Micro Software IC 009 (animasyon yazılımı "Moho", sn 87074493)**, **OnePlus IC 009 (cihazlar, sn 90619047)**, IC 021, IC 043 | Steam "Moho-Moho DX"; iOS "moho" (küçük oyun), "MOHO" sosyal uygulama; Wikipedia "Moho (software)". İspanyolcada *moho* = küf | **Orta-yüksek** (marka olarak). Ticker olarak daha düşük ama avukata sorulmalı |
| Undercrust | 0 | yok | Düşük |
| Moleworks | 0 | yok | Düşük ("mole" = muhbir; TR "köstebek" aynı yan anlam) |
| Overburden | 0 | Steam "I Am Overburdened" (farklı ad) | Düşük |
| Ironshaft | 0 | yok | Düşük ("shaft" argo çağrışımı) |
| Borehole | 0 birebir | **Steam "Drill Deal: Borehole (Alpha)"** (sondaj oyunu) | Orta |
| Rockbit | 0 canlı | yok | Düşük |
| Gneiss | 1 canlı (giyim, IC 025) | yok | Düşük |
| Kola | birebir yok, 28 canlı ilgili | Steam "Kola Abyss"; KOLA radyo vb. | Orta |
| Groundbreak | GroundBreak Coalition (IC 036) | App Store: Procore "Groundbreak 2026" konferans uygulaması | Orta |
| Subterra | 7 canlı birebir (IC 009 dahil) | **Steam "Subterra"**, "Sub Terra" | Yüksek |
| Deepvein | 0 | **Steam "Deepvein"; iOS "Deepvein: Idle Mining Game"** (aynı tür!) | **Çok yüksek** |
| Deepshaft | 0 | **iOS "Deepshaft"; "Deep Shaft: Idle Miner"** (aynı tür!) | **Çok yüksek** |
| Lodestone | **Square Enix "THE LODESTONE" IC 009/041 (sn 85940634)** + 2 canlı IC 009 | Steam "Lodestone – …" | **Çok yüksek** |
| Delve | 34 canlı (20 birebir; Google IC 009/042 dahil) | **@playdelve: Abstract'ta "Real Rewards… guaranteed payouts" oyunu** ([tweet](https://x.com/playdelve/status/2062156927245660312)); Steam'de 10+ "Delve" | **Çok yüksek** |
| Depth | **DEPTH IC 009 "computer game software" (Digital Confectioners, sn 79194635)** | Steam "Depth" (@depthgame, 1,976 takipçi) | **Çok yüksek** |

### 1.7 İlk 3 ve öneri

**1. SUPERDEEP (oyun) + $MOHO (token) — önerilen.**
- *Neden:* Temiz isim (USPTO'da yalnızca alakasız IC 008; oyun/kripto kullanımı yok), **bare handle dahil tüm X varyantları boş görünüyor**, `superdeep.gg`, `superdeep.game`, `playsuperdeep.com`, `superdeepgame.com`, `getsuperdeep.com` boş. Kendiliğinden yaşayan bir meme zemini var: Kola Superdeep Borehole (1989'da 12,262 m) X'te her gün organik olarak paylaşılıyor ([örnek](https://x.com/KiranKS/status/2106997906398122263), [örnek](https://x.com/WellPastFatigue/status/2108640397178306835)); "World Depth" sayacı bu hikâyeye doğrudan bağlanır ("Kola Line").
- *Ticker:* İsimden türeyen `SDEEP` Sui'deki sDEEP ile karışıyor; bu yüzden token **$MOHO** (CoinGecko ve DexScreener'da temiz). Slogan "Race to the Moho" isim ile ticker'ı birbirine bağlar. Oyun adı ile token adının farklı olması sektörde olağan (Axie→AXS/SLP, Off The Grid→GUN); ayrıca markayı fiyat konuşmasından ayırır.
- *Zayıf yanlar:* .com/.xyz/.io başkalarında (`.xyz` park edilmiş → aracı ile anonim teklif denenebilir; `.io` 2026-08'de kaydedilmiş, izlenmeli). "Super dip" kelime oyunu fiyat düşerse alay malzemesi olabilir (Türkçede "dip" = taban); tonla karşılanmalı ("We go deep, not dip" gibi şakalardan kaçının, konuyu açmayın).

**2. MOHOLE + $MOHO — yedek 1.**
- *Neden:* USPTO'da 0 kayıt, Steam/App Store'da 0; `mohole.xyz/.gg/.io/.game/.app/.fun`, `playmohole.com`, `moholegame.com` boş. Gerçek tarih: 1960'ların Project Mohole'u "uzay yarışının yeraltı ikizi" olarak anılır; "1961'de başladılar, bitiremediler; biz birlikte bitiriyoruz" anlatısı çok güçlü. İsim ve ticker birebir eşleşir.
- *Zayıf yanlar:* Bare `@mohole` atıl bir hesapta (3 takipçi, 2008) → `@playmohole`. İngilizce argoda "hole" kaba esprilere açık. $HOLE Robinhood Chain'de dolu ("BLACK HOLE", 2026-10-09).

**3. MOHO + $MOHO — yedek 2, yalnızca avukat onayıyla.**
- *Neden:* En kısa ve en akılda kalan ad; ticker temiz; `@playmoho`, `@mohogame`, `@racetothemoho`, `moho.gg`, `moho.game`, `playmoho.com` boş.
- *Zayıf yanlar:* USPTO'da **Smith Micro'nun "Moho" animasyon yazılımı (IC 009)** ve OnePlus'ın IC 009 tescilleri canlı; bir oyun da IC 009'a girer → marka olarak en riskli seçenek. `moho.com/.xyz/.io/.app` dolu. İspanyolcada "küf" anlamı.

**Rezerv:** Undercrust (marka/oyun çakışması yok, `.xyz/.gg/.io` boş, `.com` satılık sayfası var) — ama ticker'ı ($CRUST) dolu ve hikâyesi zayıf.

**Öneri:** **Superdeep / $MOHO** ile ilerleyin. Kayıt ve rezervasyonlar (§1.9) tamamlanmadan ve TÜRKPATENT ön araştırması gelmeden isim kamuya açıklanmamalı. $MOHO ticker'ı üç seçenekte de ortak olduğu için marka adı son anda değişse bile token tarafı etkilenmez.

**Lead designer'a lore notu:** Oyun ölçeğinde World Depth (m) = basılan arz / 1,000 (max 100,000 m). Gerçek kıtasal kabuk ortalama ~35 km (kaynaklara göre 30–50 km) olduğundan **"Moho Line" = 35,000 m** (%35 basılmış) hem gerçekçi hem erişilebilir olur: yayımlanmış emisyonla ≈ 860 gün (~2.4 yıl; geri dönüşüm hariç). Ara hedef **"Kola Line" = 12,262 m** (≈ 262. gün). Bu durumda strata isimleri (ör. "Mantle Rim" %85'te) gözden geçirilebilir; karar lead designer'ındır. Ayrıca **derinlik sayacı monoton olmalı ve kümülatif dağıtılan emisyona (tahakkuk) dayanmalı**; `totalSupply` ya da rafine edilerek basılan miktar değil. `totalSupply` kullanılırsa yakımlar koloniyi "yukarı çıkarır"; rafine edilen miktar kullanılırsa (`02` §8: token rafine sonunda basılır) sayaç oyuncuların claim davranışına göre gecikir.

### 1.8 Doğrulanamayanlar ve açık riskler

- X: "user not found" dönen handle'ların (özellikle `@superdeep`) gerçekten kayıt edilebilir olduğu ancak kayıt denemesiyle anlaşılır (X bazı adları rezerve eder, kapatılan hesaplar 30 gün bekletilir).
- Domain: Fiyat/premium durumu ve `superdeep.xyz`/`superdeep.io`/`undercrust.com` sahiplerinin kimliği ve satış istekliliği bilinmiyor.
- Marka: TÜRKPATENT, EUIPO, WIPO sorgulanamadı; USPTO taraması yalnızca wordmark bazlı knock-out. Ses/anlam benzerliği ("Super Deep", "SuperDeep Games" vb.) ve Nice sınıf analizi avukatın işi.
- Web: Genel web araması yapılamadığı için Google Play, itch.io, Epic, Kickstarter ve şirket sicilleri taranmadı.
- Ticker: DexScreener aramasının kapsamı sınırlı; lansmandan önce (T−10) aynı kontroller **tekrar** koşulmalı, çünkü Robinhood Chain'de günde binlerce token açılıyor ve $MOHO ilan edildiği anda taklitleri çıkabilir.

### 1.9 Rezervasyon listesi (isim ilan edilmeden önce)

| Tür | Öğe | Not |
|---|---|---|
| X (proje) | `@superdeep` → olmazsa `@playsuperdeep` | Hemen dene; ikisinden hangisi alınırsa ana hesap o |
| X (savunma) | `@playsuperdeep`, `@superdeepgame`, `@superdeephq`, `@superdeep_xyz`, `@racetothemoho`, `@playmoho`, `@mohogame`, `@moho_xyz`, `@mohohq` | Boş bırakılmaz: avatar + "Not used. Official: @superdeep" bio, gönderi yok, DM kapalı. "support/help/claim/airdrop" içeren hesap **açma** (dolandırıcılık görüntüsü verir) |
| Domain (kanonik) | `superdeep.gg` | Site + e-posta |
| Domain (yönlendirme) | `playsuperdeep.com`, `superdeepgame.com`, `getsuperdeep.com`, `superdeep.game`, `superdeep.fun`, `playsuperdeep.xyz`, `getsuperdeep.xyz` | 301 → superdeep.gg |
| Domain (token savunma) | `moho.gg`, `moho.game`, `playmoho.com`, `mohogame.com` | Taklit "claim" sitelerine karşı |
| Domain (opsiyonel) | `superdeep.xyz` (park), `superdeep.io` | Aracıyla, proje adı açıklanmadan |
| Marka | TÜRKPATENT "SUPERDEEP" (+ logo); token adı "MOHO" için avukat görüşü | Sınıflar (9, 41; gerekirse 28, 35, 42) ve EUIPO/USPTO/Madrid zamanlaması avukatla |
| E-posta | SPF + DKIM + DMARC `p=reject` | Kurumsal e-posta taklidine karşı |

---

## 2. Marka kimliği

### 2.1 İsim, anlatı ve konumlandırma

**İsim:** *Mohonaut* = Moho + *-naut*. Moho (Mohorovičić süreksizliği), kıtalarda ortalama ~35 km derinlikte kabuğun bittiği ve mantonun başladığı sınırdır; oyunda **Moho Line = 35,000 m** (02 §3.4). *-naut* Yunanca *nautēs*'ten gelir: yolcu, denizci (astronaut, aquanaut). Mohonaut, Moho'ya giden kâşiftir.

**Anlatı:** Kriptoda herkes bir şeyi "aya" götürmeye çalışıyor. Biz aşağı iniyoruz: birlikte, ölçülebilir şekilde ve herkesin görebileceği tek bir kuyuda. Hedef bir fiyat değil, bir derinlik: **Kola Line** (12,262 m, insanların gerçekten kazdığı en derin nokta) ve **Moho Line** (35,000 m). "-naut" yalnızca kelimede yaşar: görsel dünyada uzay, ay, roket ya da astronot kaskı yoktur; her şey yeryüzündeki gece sondaj sahasında geçer.

**Kullanım kuralları:**
- "Mohonaut" = oyun; "a Mohonaut / the Mohonauts" = oyuncular; "$MOHN" = token (bir gönderide ilk geçişinde mümkünse `mohonaut.com/contracts` linkiyle); "the Moho" = jeolojik hedef.
- **"Not the moon. The Moho."** yalnızca bu sabit biçimde kullanılır. "Moon" kelimesi başka hiçbir kalıpta geçmez ("to the moon", "mooning" vb. yasak, §6.1).
- "Driller" genel bir isim olarak serbesttir ("One bore. Every driller."), ama topluluğun adı **Mohonauts**'tur.

**Konumlandırma (İngilizce; site ve pitch):**
> For players who like slow, readable strategy and are tired of launches built for insiders, **Mohonaut** is an on-chain idle drilling game where everyone cores one shared hole: the World Bore. Instead of promising yields, Mohonaut publishes a formula: your share of each hour's emission is your active Drill Power divided by everyone's. Every $MOHN comes out of the ground: no presale, no team buy, no premine.

**Türkçe (iç kullanım):** Mohonaut, "getiri vaadi" yerine "yayımlanmış formül" sunan, gece sondaj sahası estetiğinde kolektif bir derinlik yarışıdır. Fark üç doğrulanabilir kanıtla anlatılır: değiştirilemez token ve sınırlı, 96 saat timelock'lu parametreler (canlı kuyruk linkiyle); snipe edilemeyen açılış (havuz yalnızca formülle, T0+72 saat); kaynağı ve dönemi belli sayılarla konuşan iletişim. Rakip anılmaz (§6.4b); fark yalnızca kendi özelliklerimizle anlatılır.

**Marka sütunları:** (1) *Fair by construction*: adalet koda gömülü. (2) *One bore, not a casino*: ortak hedef var, şans satılmıyor. (3) *Numbers over adjectives*: her iddia bir kaynak, dönem ve link taşır. (4) *Slow and deep*: emisyonun yarılanma süresi ~3.8 yıl; oyun yıllara yayılır.

### 2.2 Ses tonu ve sözlük

Sondaj ustabaşı gibi konuş: kısa, net, kuru mizah, abartısız. Vardiya raporu formatı.

| Yap | Yapma |
|---|---|
| Sayı + kaynak + dönem + link ("1,240 drill sites with fuel, Oct 20–27 UTC, chain data: …") | Sıfat yığını ("massive", "insane", "huge") ya da kaynaksız büyüme iddiası |
| Kötü haberi ilk sen ver, saatiyle | Sessiz kalmak, sonradan düzeltmek |
| "Formula", "share", "Drill Power", "emission", "fuel", "refine" | "Earn", "yield", "profit", "returns", "passive", "claim", "airdrop" |
| Sondaj jargonu, ölçülü: "spud in", "core sample", "bore log", "make a connection", "shift report" | Fiyat, grafik, "wen" sorularına cevap |
| Oyunculara "Mohonauts", loncalara "Crews" | "Holders", "investors", "fam, we're early" |
| Kurucu: birinci tekil, hesap verebilir | Kurucu: başka tokenları/CA'ları tavsiye etmek |
| Robinhood'dan söz gerekiyorsa yalnızca "Built on Robinhood Chain" | "Robinhood's game", "powered by Robinhood", "official Robinhood …" |

**Sözlük (oyuncuya dönük terimler, 01 v0.2 ile uyumlu):**

| Terim (EN) | Anlam | Not |
|---|---|---|
| Drill Site | Oyuncunun sahası (seviye 1–30) | "outpost" kullanılmaz |
| Pad | Kule yeri (slot) | `slot(L) = 3 + L` |
| Fuel line | Sahanın yakıt hattı kapasitesi (ℓ/h) | |
| Rig | Kule / makine | Gen-1: Pilot Rig, Rotary Rig, Top Drive, Diamond Core Drill, Turbodrill, Plasma Bore |
| Drill Power (DP) | Hashpower birimi | |
| Diesel tank | Yakıt deposu; litre, ETH ile dolar | "Tank: 432 ℓ · burn 12 ℓ/h · runs until …" |
| Burn | Saatlik yakıt tüketimi (ℓ/h) | |
| Efficiency | DP per ℓ/h | "energy", "kW", "kWh" yok |
| Equipment Market | VRGDA kule mağazası | |
| Scrap credit | Söküm kredisi (%20, yalnızca alımda) | |
| World Bore | Ortak kuyu; derinliği metre | "World Depth" yerine |
| Bore log | Kuyu logu / karot sütunu; imza UI öğesi | |
| Strata | Regolith, Sediment Cover, Granite Basement, Archean Gneiss, Granulite Floor, Peridotite Zone, Asthenosphere, The Core | 02 §3.4 |
| Kola Line / Moho Line | 12,262 m / 35,000 m kilometre taşları | |
| Contribution | "You've cored X m of the World Bore" | Kişisel derinlik değil, ortak kuyuya katkı |
| Survey · Core Collection | Günlük ücretsiz keşif; kozmetik karot koleksiyonu | |
| Crew | 5–25 kişilik ekip, kozmetik | |
| Season | ~8 haftalık sezon; **Season 0** = testnet | 01 §4.8 "Shifts" takma adı için §10 açık kararlar |
| Refine / Refinery | Çekim: 72 saat ücretsiz ya da %8 anında | **"claim" asla** (09 §6) |
| Training Site | Cüzdansız, tarayıcıda çalışan deneme sahası | 09 §2-A |
| Pioneer badge | Season 0 kozmetik rozeti, devredilemez | 09 §2-B |
| Pre-fill · Genesis Dig · Market Open | Lansman aşamaları | 02 §11 |
| Spud-In, Fuel Saver, Kola Witness, Core Collector | Başarımlar | 01 §4.10 |
| Shift Report | Haftalık herkese açık ekonomi raporu | |
| Rig Notes | Patch notları | |
| Shift Change | Haftalık X Space | |

**Kullanılmayan terimler (marka kuralı; CI lint listesine eklenir):** energy, kWh, kW, power plant, electricity · outpost, shaft, tunnel, cave, mine/mines (mekân anlamında), elevator, lift, seam, vein, gem, crystal, ore, pickaxe · World Depth · Drillers (topluluk adı olarak) · lofi · claim, airdrop, verify wallet, sync, revoke · Superdeep, $MOHO. "Mine/mining" yalnızca ekonomik anlamda kullanılabilir ("every $MOHN is mined"); mekânı anlatırken "drill site", "rig", "bore", "core" denir.

### 2.3 Maskot: Foreman Mo

**Karar: adı korundu (Foreman Mo).** Gerekçe: (1) "Mo", hem Moho'nun hem Mohonaut'un ilk hecesi; maskot ile marka birbirini çağırıyor ve isim değişikliği bu bağı güçlendirdi. (2) Tek heceli ad sticker, emoji ve meme yüzeyinde iyi çalışır ("Mo says no"). (3) 01 v0.2 ve `ISIM_SPRINTI.md` zaten bu adı kullanıyor; yeniden öğretme maliyeti yok. (4) "Foreman" herkesin anladığı bir unvan. Değerlendirilen alternatif "Toolpush Mo" (sondaj kulesi şefinin gerçek argo unvanı, *toolpusher*) daha otantik ama jargon; bu yüzden lore'da Mo'nun iş unvanı olarak kalabilir ("Mo, the site's toolpusher"), adı olarak değil. Ad için ayrı marka/çakışma taraması yapılmadı (§10).

- **Kim:** Sahanın köstebek ustabaşı. Turuncu baret, **sıcak beyaz** ışık veren kafa lambası (camgöbeği yalnızca enstrüman HUD'una ayrılmış, §2.4), yansıtıcı şeritli turuncu yelek, elinde pano (clipboard) ve analog basınç/derinlik göstergesi. Kalın yuvarlak gözlük (köstebeklerin zayıf görüşü şakası: "I can't read a price chart. I can read a bore log.").
- **Mekân:** Yerin altında değil, sahada: kulenin yanında, karot kulübesinde, yağmurda dizel tankını kontrol ederken.
- **Kişilik:** Huysuz ama adil; iş güvenliğine takıntılı; her litreyi iki kez sayar. Kısayoldan nefret eder.
- **Kullanım:** Avatar alternatifi, olay iletişimi (uyarı pozu), kilometre taşı kartları, Survey sonuçları, 404/bakım sayfaları, Rig Notes, sezon kostümleri (kozmetik mağaza, 01 §4.13).
- **Pozlar (karakter sayfası, 7):** nötr; kuyu loguna işaret ediyor; kutlama (baretini kaldırıyor); uyarı (avucunu kaldırmış "stop" pozu); bakım (pano + "out of service" etiketi; **alet sallamıyor**); gece vardiyası (termosla taburede uyukluyor); Survey (bir karot numunesini kafa lambasına tutuyor).
- **Özgünlük:** Bilinen oyun köstebeklerine ve köstebek temalı tokenlara benzememeli; uzay kaskı, roket, kazma, kürek yok. Alet sallayan karakter yok (01 §7).
- **Ses kuralları:** Foreman Mo **asla** fiyat, kâr ya da "buy" konuşmaz; yalnızca kuyu, güvenlik, yakıt ve vardiya.
- **Üretim:** AI keşfi + kurucunun Inkscape'te elle vektörleştirmesi (insan katkısı, §2.8); insan illüstratör yalnızca gelirle (08 §3 sıra 6).

### 2.4 Renk paleti

Hex değerleri v0.1'le aynı (kontrastlar korunur), adlar yeni konsepte göre değişti. Kontrast oranları WCAG formülüyle Charcoal `#16191D` zemin üzerinde hesaplandı (2026-10-11 yeniden doğrulandı).

| Token | Hex | Kullanım | Kontrast |
|---|---|---|---|
| Night Black | `#0E1013` | En koyu zemin: gece gökyüzü, log sütununun dibi | — |
| Charcoal | `#16191D` | Ana zemin | — |
| Graphite | `#22272D` | Kart/panel yüzeyi, ıslak zemin | — |
| Steel | `#39414A` | Kenarlık, ayırıcı (metin için değil) | 1.70 |
| Concrete | `#8B939C` | İkincil metin | 5.67 (AA) |
| Bone | `#ECE7DC` | Ana metin, log üzerindeki Kola/Moho çizgileri | 14.30 (AAA) |
| **Safety Orange** | `#FF6B1A` | Ana marka rengi, CTA, baret, kule boyası | 6.19 (AA); **CTA üzerinde koyu metin** (beyaz metin 2.85 = yetersiz) |
| Sodium Amber | `#FFB31A` | Sodyum lamba ışığı (illüstrasyon), uyarı, bekleyen timelock | 9.84 |
| **Gauge Cyan** | `#2EE6D6` | Yalnızca enstrüman HUD'u, canlı veri, logdaki "we are here" çizgisi, karot ışıması | 11.26 |
| Gauge Teal | `#0D6E6A` | Cyan'ın sönük hali, grafik dolgusu | 2.90 (metin için değil) |
| Alarm Red | `#FF3D2E` | Olay/pause, hata, devre kesici | 5.00 |
| Status Green | `#8CFF6A` | "OK" durumu, çok seyrek | 13.96 |

**Litoloji bantları (kuyu logu, karot numuneleri, stratum rozetleri; 01 §7):**

| Stratum | Renk tanımı | Hex | Kontrast | Not |
|---|---|---|---|---|
| I — Regolith | Ten rengi | `#B08A5E` | 5.58 | |
| II — Sediment Cover | Bej | `#D8C8A0` | 10.65 | |
| III — Granite Basement | Pembe-gri | `#B79A9A` | 6.80 | |
| IV — Archean Gneiss | Bantlı gri | `#7E8288` + bant `#5A5E64` | 4.56 | Yatay foliasyon deseni |
| V — Granulite Floor | Koyu | `#4A4444` | 1.85 | Steel/Bone ince kenar çizgisi şart |
| VI — Peridotite Zone | Zeytin yeşili | `#6E7D3C` | 3.91 | |
| VII — Asthenosphere | Turuncu-kırmızı | `#D2512B` | 4.16 | Yalnızca logda; Safety Orange ile aynı öğede kullanılmaz |
| VIII — The Core | Altın | `#FFE27A` | 13.78 | |

**Oran kuralı:** Ekranın ~%70'i Night Black/Charcoal/Graphite (gece), ~%20 Bone metin, turuncu ≤ %7 (ekipman, eylem), camgöbeği ≤ %3 (enstrüman, veri). Sodyum amber ışık havuzları illüstrasyonda serbesttir ama arayüzde yalnızca uyarı rengidir. Turuncu "insan/eylem", camgöbeği "ölçüm/veri" demektir; ikisi aynı öğede birleşmez. Pastel, mor ve lacivert-siyah zemin yok (01 §7).

### 2.5 Tipografi (hepsi Google Fonts, SIL OFL lisanslı)

| Rol | Font | Neden |
|---|---|---|
| Başlık / logo | **Big Shoulders Display** (700–900) | Endüstriyel tabela ve kule plakası hissi, dar ve sert |
| Stencil vurgu | **Saira Stencil One** | Kule, tank ve sandık üzerindeki şablon boyalı etiketler; yalnızca kısa etiketler |
| Arayüz | **Barlow** ve **Barlow Condensed** | DIN benzeri, mobilde okunaklı, çok ağırlık |
| Sayılar / log / gösterge | **JetBrains Mono** (tabular) | Kuyu logundaki metre etiketleri, tank ve sayaçlar; sabit genişlikli rakamlar titremez |

v0.1'deki VT323 (CRT fontu) kaldırıldı. **Oyun içi** (`/play`) yazılar 2026-10-13 kurucu kararıyla **Pixelify Sans** (SIL OFL, `@fontsource/pixelify-sans`, yalnızca 500/700); site ve marka yüzeylerinde aşağıdaki fontlar kalır. CRT tarama çizgisi efekti yok; gösterge dili "enstrüman paneli + kuyu logu kâğıdı" (ince ızgara, metre cetveli).

Kurallar: Rakamlarda `font-variant-numeric: tabular-nums`. Gövde metni 16 px altına inmez. Logo ve Big Shoulders yalnızca İngilizce büyük harfle; Türkçe karakter gerekirse Barlow.

### 2.6 Logo yönleri (3) ve hazır yapay zekâ prompt'ları

**Özgünlük kuralı (kurucu kararı, 2026-10-12):** Bütün görseller (logo, maskot, kuleler, saha, ikonlar, paylaşım kartları) **bizim tarafımızdan tasarlanır ve özgündür**. Başkasının logosu, görseli, sprite'ı ya da ikon paketi (CC0 ve "ücretsiz" olanlar dahil, ör. Kenney.nl) kullanılmaz. Yapay zekâ görsel araçları en fazla kendi aramızda fikir keşfi için kullanılabilir; hiçbir AI çıktısı ürüne, siteye ya da marka dosyalarına girmez. Fontlar dışarıdan gelir (yalnızca SIL OFL lisanslı yazı tipleri) ve hangi yerde kullanıldıkları `docs/legal/ASSET_LISANSLARI.md`'ye yazılır. Aşağıdaki prompt'lar yalnızca fikir keşfi içindir.

**Genel kurallar:**
- Sıra: **keşif** (Ideogram ücretsiz kademe, metin doğruluğu için) → **vektör taslak** (Recraft ücretsiz kademe, SVG) → **final vektör** (kurucu, Inkscape'te elle; gelirle profesyonel tasarımcı, §2.8). Midjourney ücretlidir, opsiyoneldir; Higgsfield kredi harcar, her kullanımdan önce maliyet söylenir ve onay alınır.
- Prompt'larda başka markaların, sanatçıların, rakip projelerin ya da "Robinhood"un adı geçmez. Robinhood işaretleri AI üretimi medyada kullanılamaz (ToS §5.7(i)).
- **Standart negatif liste** (her prompt'a eklenir): `underground tunnel, mine shaft, cave, elevator, cage lift, pickaxe, shovel, character swinging a tool, gems, crystals, ore veins, moon, rocket, astronaut, space helmet, pastel colors, purple, navy blue background, extra text, watermark`.

**Yön A — "Casing Wordmark" (wordmark + kuyu ağzı monogramı).** MOHONAUT yazısı dar, kalın endüstriyel büyük harflerle; ilk "O" yukarıdan görülen bir kuyu ağzıdır: iç içe üç çelik muhafaza (casing) halkası. Kelimenin altında ince bir metre cetveli. Monogram: üç halkalı kuyu ağzı + aşağı inen kısa bir çizgi ve derinlik çentikleri. Ölçeklenebilir; favicon ve avatar için en iyisi.

```
Ideogram (keşif, metin doğruluğu):
A flat vector wordmark logo that reads "MOHONAUT" in tall, condensed, bold industrial capital letters. The first letter O is drawn as a drilled well seen from directly above: three concentric steel casing rings. Under the word runs a thin horizontal depth ruler with small tick marks. Safety orange #FF6B1A letters on a dark charcoal #16191D background. Clean geometric shapes, no gradients, no 3D, no extra words.

Recraft (Vector illustration / Logo, SVG çıktı — monogram):
Icon logo: a well seen from above, three concentric rings like steel well casing, with a short vertical line dropping from the bottom of the outer ring and four tiny horizontal depth ticks along that line. Two colors only: safety orange #FF6B1A and bone #ECE7DC on a transparent background. Thick uniform strokes, readable at 16 px, flat, SVG-friendly.

Midjourney (ücretli, opsiyonel):
minimal industrial logo, wordmark "MOHONAUT" in tall condensed bold sans serif, the first letter O drawn as three concentric well casing rings seen from above, thin depth ruler under the word, safety orange on charcoal, flat vector, no gradients, centered, generous margins, brand identity sheet --style raw --ar 3:2 --no mascot, photo, texture, shadows, moon, rocket, pickaxe, crystals, extra text
```

**Yön B — "Core Column Badge" (amblem).** Dikey kapsül biçiminde bir karot numunesi: içinde gerçek litoloji renklerinde 8 yatay bant (§2.4), iki ince Bone çizgi (Kola Line, Moho Line), tepede tek sodyum lambalı küçük bir sondaj kulesi silueti. Üstte "MOHONAUT", altta "NOT THE MOON. THE MOHO." Merch, sezon rozetleri, Pioneer rozeti tabanı ve X banner'ı için.

```
Ideogram:
A vertical industrial badge logo shaped like a cylindrical rock core sample. Inside, eight stacked horizontal rock layers in real geology colors: tan, beige, pinkish grey, banded grey, near-black, olive green, orange-red, and a thin gold band at the bottom. Two thin off-white lines cross the column, one about a third of the way down and one lower. On top sits a small silhouette of a drilling rig tower with one warm amber work light. Text at the top reads "MOHONAUT", text at the bottom reads "NOT THE MOON. THE MOHO." Flat vector, charcoal background, safety orange outline.

Recraft:
Flat vector emblem: a vertical capsule shape like a rock core sample with a safety orange outline, eight horizontal bands inside in muted earth tones (tan, beige, pink-grey, grey with fine banding, dark grey, olive, orange-red, gold), two thin bone-colored horizontal marker lines, a small drill rig silhouette on top, no text, symmetrical, consistent 2 px stroke, SVG-friendly.
```

**Yön C — "Foreman Mo" (maskot işareti).** Baretli köstebek kafası; kafa lambasının sıcak beyaz huzmesi dümdüz aşağı iner ve bir kuyu çizgisine dönüşür. Avatar alternatifi, sticker ve olay iletişimi için.

```
Ideogram:
A bold flat vector mascot head: a mole wearing an orange construction hard hat with a headlamp, thick round glasses, the collar of a high-visibility vest with reflective stripes, serious expression with a slight smile. A warm white headlamp beam points straight down and becomes a thin vertical line. Charcoal circular background. No text, no tools. Simple shapes readable at small sizes.

Recraft:
Vector mascot icon, mole face in front view, orange hard hat with headlamp, round thick glasses, hi-vis vest collar, three colors plus charcoal, thick outlines, geometric simplification, transparent background, no tools in hands, no text.
```

### 2.7 Diğer üretim prompt'ları

```
X banner (1500x500):
wide isometric 2.5D view of a surface drilling site at night, one tall drilling rig under sodium vapor work lights, steam and light rain, mud pumps, pipe racks and a small core shack, wet ground reflecting warm orange light, safety orange equipment against charcoal and graphite tones, on the right edge a vertical well log column with geological color bands and a thin cyan "current depth" line, empty negative space on the left third for a logo, clean stylized game art, no people --ar 3:1 (+ standart negatif liste)

Landing hero / key art (16:9 ve 9:16):
isometric 2.5D night drill site on open ground, four drilling pads, one small engine-driven rig working on the first pad, a diesel tank with an analog gauge, pipe rack, core shack with a lit window, sodium lights, drifting steam, rain, clean stylized game art, charcoal palette with safety orange equipment, everything above ground, no cutaway view (+ standart negatif liste)

Kule sprite'ı (yalnızca fikir keşfi; ürün çizimleri bizim, `apps/web/src/game/rigs.ts`):
isometric 2.5D game sprite of a [Top Drive drilling rig], compact surface drilling rig on a steel skid with a diesel engine, safety orange paint with charcoal steel parts, small cyan status light on the control panel, clean outlines, consistent 30-degree isometric angle, transparent background, three states: idle, drilling with the drill string turning and exhaust puffs, shut down with lights off

Stratum tema paketi — karot numunesi (Core Collection ve log için):
game asset, five cylindrical rock core samples of [granite: pink-grey, coarse-grained] lying in a wooden core tray with small depth labels, three-quarter top-down view, realistic geology colors, soft neutral light, transparent background, no text

Stratum tema paketi — log bandı dokusu:
seamless vertical texture for a well log column, [archean gneiss: grey rock with fine light and dark banding], flat and subtle, tileable vertically, 512x512, no text, no shading

Paylaşım kartı arka planı:
dark charcoal card background styled like well log chart paper: faint fine grid, a vertical depth ruler on the left edge, a narrow column of geological color bands, empty space for numbers, flat, no text --ar 16:9

Pioneer rozeti (Season 0):
flat vector badge, small drilling rig silhouette above a short core sample, text "PIONEER" and "SEASON 0", a small "TESTNET" stamp, charcoal background, safety orange and bone only, symmetrical, readable at 64 px
```

### 2.8 Yapay zekâ mı, insan mı? (sıfır bütçe sürümü)

| İş | Şimdi (ücretsiz) | Gelirle (08 §3) | Neden |
|---|---|---|---|
| Logo keşfi, moodboard | Kendi eskizlerimiz; AI araçları yalnızca fikir için, çıktısı kullanılmaz | — | Hızlı yön bulma |
| **Final logo vektörü** | Kurucu, AI taslağını referans alıp Inkscape'te **elle yeniden çizer** | Profesyonel tasarımcı (sıra 6) | Yalnızca yapay zekâyla üretilmiş görsel ABD'de genellikle telif korumasına girmez; marka tescili ve taklitle mücadele için insan katkılı, özgünlüğü kontrol edilmiş vektör gerekir |
| **Maskot karakter sayfası** | AI keşfi + kurucunun vektör temizliği + tutarlılık rehberi | İnsan illüstratör (sıra 6) | Pozlar arası tutarlılık, özgünlük |
| Kule sprite setleri (6 kule × 3 durum) | Kodla çizilen özgün vektörler (`rigs.ts`, stil sayfası `brand/sprites`) | İllüstratör | Tutarlı açı, ölçek ve palet; dış paket yok |
| Stratum tema paketleri, log dokuları | Kendi çizimimiz (kod ya da elle) | — | Özgünlük |
| X banner, OG, paylaşım kartı şablonları | AI + Satori şablonları | — | Şablon işi |
| Teaser / trailer | Oyunun kendisinden (pixel saha) ekran kaydı + ücretsiz kurgu aracı | Key art için illüstratör | "AI slop" eleştirisini önler: gerçek oyun görüntüsü |
| Müzik ve SFX | CC0 / ticari kullanıma izin veren kütüphaneler; "industrial ambient" + dizel motor, çamur pompası, boru sesi | — | AI müzik araçlarının ücretsiz kademeleri genellikle ticari kullanıma izin vermez (08 §2) |

Kural: Kullanılan her aracın ticari kullanım koşulları (ücretsiz kademeler dahil) ve her varlığın kaynağı `docs/legal/ASSET_LISANSLARI.md`'ye yazılır; final varlıkların kaynak dosyaları (SVG/PSD/Krita) saklanır. İleride illüstratörle sözleşmede telif devri ve "başka projede kullanmama" maddesi olur.

### 2.9 Varlık kontrol listesi

| Varlık | Boyut / format | Faz |
|---|---|---|
| Logo: ana wordmark, yatay, dikey, monogram, tek renk (siyah/beyaz), turuncu/kömür | SVG + PNG @1x/2x | T−45 |
| Favicon 16/32/48, apple-touch 180, PWA ikon 192/512 (maskable) | PNG/ICO/SVG | T−45 |
| X avatarları (proje + 3 savunma hesabı) | 400×400, daire güvenli alan | T−45 |
| X banner (proje + kurucu için ortak tasarım) | 1500×500, sol alt köşe avatar güvenli alanı | T−36 |
| OG görselleri: varsayılan + her sayfa | 1200×630 | T−36 |
| Gen-1 kule sprite'ları: Pilot Rig, Rotary Rig, Top Drive, Diamond Core Drill, Turbodrill, Plasma Bore × idle / drilling / shut down | Sprite atlas (WebP/AVIF) | T−36 (Training Site için) |
| Saha katmanları: zemin, pedler, yakıt hattı, dizel tankı, boru rafı, karot kulübesi, sodyum lambalar, buhar/yağmur | Sprite atlas | T−36 |
| Kuyu logu bileşeni: 8 litoloji bandı dokusu, Kola/Moho çizgileri, "we are here" çizgisi, metre cetveli | SVG + doku | T−36 |
| UI kit: kuyu logu, dizel tank göstergesi (ℓ, ℓ/h, bitiş zamanı), yakıt hattı göstergesi, DP payı, timelock kuyruğu bileşeni, "Unaudited" bandı, "SIMULATION" ve "TESTNET" şeritleri | Figma/Penpot + SVG | T−36 |
| Training Site paylaşım kartı | 1200×630 | T−36 — ✅ 2026-10-13: `apps/web/scripts/gen-voxel.mjs` derlemede oyunun kendi voxel kulelerinden üretiyor (`/og-train.png`; 2026-10-13 piksel sürümünden voxel'e geçti) |
| Teaser (15–20 sn) | MP4, 16:9 + 9:16 | T−36 |
| Dinamik OG: katkı kartı, kilometre taşı, Survey bulgusu, Crew, Shift Report, Pioneer rozeti | 1200×630 + 1080×1350 | T−29 |
| Paylaşım kartı şablonları (Satori) | JSX + font dosyaları | T−29 |
| Pioneer rozeti | SVG/PNG | T−29 |
| Müzik: stratum başına industrial ambient döngü + kule SFX | OGG/MP3 | T−29 |
| Maskot karakter sayfası (7 poz) | SVG/PNG | T−27 |
| Survey / Core Collection kozmetikleri (karot numuneleri, fosiller, eski matkap uçları, tarihî sondaj ekipmanı) | Sprite | T−25 |
| Stratum tema paketleri | Regolith T−36; diğerleri eşik yaklaştıkça | — |
| Basın kiti (/brand): logo paketi, ekran görüntüleri, kurucu fotoğrafı, tek sayfalık özet | ZIP + sayfa | T−18 |
| Trailer (45–60 sn), devlog video şablonu | MP4 | T−10 |
| Olay grafikleri: delay, known issue, paused, breaker, resolved | 1200×675 | T−10 |
| Crew sancak/amblem şablonları | SVG | T+10 |

---

## 3. Web sitesi

### 3.1 Site haritası

Tek kanonik domain: **mohonaut.com** (`mohonaut.gg` 301 ile yönlenir). Lansmana kadar site yalnızca **İngilizce**; Türkçe arayüz hukuki gözden geçirmeden önce açılmaz (§6.2). Domain lansmandan ≥ 30 gün önce gerçek içerikle yayında olmalı (09 §6): T−42'de reklamsız bir ön sayfa (ad, tek paragraf, Training Site önizlemesi) açılır, landing T−35'te tamamlanır.

| Yol | Amaç | Ne zaman |
|---|---|---|
| `/` | Landing (§3.2) | Ön sayfa T−42; tam landing T−35 |
| `/train` | **Training Site** ("Try the rig"): cüzdan, kayıt ve sunucu yok; `packages/sdk` formülleri tarayıcıda, 60× hız, kalıcı "SIMULATION" şeridi | T−35 |
| `/play` | Oyun (PWA). T−28 → T−8 testnet (46630), kalıcı "TESTNET · SEASON 0" şeridiyle; mainnet Pre-fill'le (T−1) açılır | T−28 |
| `/season0` | Season 0 kuralları: kilometre taşları, Pioneer rozeti, faucet şartları, bot politikası, davet linki | T−29 |
| `/s/<id>` | **Cüzdansız saha görüntüleyici** (paylaşım kartlarının hedefi, dinamik OG) | T−28 |
| `/docs` | Oyuncu rehberi: kuleler, dizel, rafineri, Crews, Survey, sezonlar, referans | İskelet T−35, tam T−28 |
| `/docs/economy` | Ekonomi kâğıdı (02 v1.0'ın kamuya açık sürümü): formüller, parametreler, sınırlar, "değiştiremeyeceklerimiz" tablosu | T−18 |
| `/docs/refining` | İlk çekim kuralları (09 §4): Genesis'te kapalı, %8 hızlı / 72 saat ücretsiz, minimum ve KYC yok | Taslak T−18, T−7'de dondurulur |
| `/docs/genesis` | Pre-fill, Genesis tank sınırı, Market Open, açılış oranı formülü | T−10 |
| `/docs/eth` | Robinhood Chain'e ETH getirme rehberi (09 §5): yalnızca resmî dokümanda listelenen köprüler ve doğrulanmış sağlayıcılar | T−7 |
| `/economy` | Canlı şeffaflık panosu (§3.3), Shift Report arşivi, aylık ops raporu | Testnet T−28; mainnet T0 |
| `/timelock` | **Canlı timelock kuyruğu** (`/economy#timelock`'a yönlenir): bekleyen değişiklik, eski/yeni değer, sınır, en erken yürütme zamanı, tx linkleri. Yönetişimden söz eden her metin buraya link verir | Testnet T−28; mainnet T−7 |
| `/contracts` | Tüm adresler, Blockscout + Sourcify doğrulama linkleri, roller, Safe imzacıları ve eşikleri, timelock gecikmeleri (96 saat / 7 gün), bytecode hash, deploy tx'leri. **"Get addresses only from this page and the pinned post of @playmohonaut."** | T−7 |
| `/security` | Güvenlik durumu: **Unaudited** + yerine yapılanlar (çok rollü AI incelemesi, Halmos ispatları, fuzz kampanyaları, ≥ 4 hafta herkese açık inceleme), bulgu/düzeltme tablosu, korumalı lansman sınırları, Guardian pause kapsamı (≤ 72 saat, kendiliğinden biter), bug bounty kuralları, gelirle denetim taahhüdü (08 §3), olay geçmişi ve post-mortem'ler, bilinen taklit listesi | Durum sayfası T−35; inceleme raporu T−12 |
| `/status` | RPC, indeksleyici, keeper `poke`, oracle tazeliği, bugünkü mint / 500K tavan, saatlik devre kesici durumu, açık olaylar | T−28 |
| `/faq` | Kısa SSS (fiyat yok, "ne zaman listeleme" yok) | T−35 |
| `/terms` | Kullanım koşulları: 18+, yasaklı yargı bölgeleri ve VPN ile kısıt aşma yasağı (ToS §2.2), risk açıklamaları, "yatırım değildir" | T−35 (hukuki gözden geçirmeyle) |
| `/privacy` | KVKK + GDPR: cüzdan/e-posta girişi, Turnstile, analitik, saklama süreleri | T−35 |
| `/brand` | Basın kiti, logo kullanım kuralları | T−18 |
| `/collab` | İşbirliği başvuru formu + **kamuya açık işbirliği ve ifşa kaydı** (§4.8) | T−35 |
| `/support` | Bilet formu (DM yerine); "we never DM first" | T−28 |
| `/.well-known/security.txt` | Güvenlik iletişimi | T−42 |

### 3.2 Landing sayfası: bölüm bölüm wireframe ve İngilizce metin

**S0 — Üst şerit (sabit):** Logo · Play · Try the rig · Docs · Economy · Contracts · FAQ · [X ikonu] · sağda küçük **"Official links"** düğmesi (/contracts).
Altında iki ince bant:
- Bağımsız denetime kadar (04 §5.2): `Unaudited — use at your own risk. What we did instead, and when an independent audit happens: /security`
- Market Open'a kadar: `There is no $MOHN market until Market Open. Anything you can buy before that is fake.` → Market Open'dan sonra: `The only $MOHN contract is listed on /contracts. We never DM first.`

**S1 — Hero.** Masaüstü: solda gece sondaj sahası illüstrasyonu (çalışan kule, yağmur, sodyum ışığı, buhar), sağda canlı **kuyu logu** sütunu (imza öğe). Mobil: saha üstte, log sağ kenarda dar bir sütun.
- H1: **Not the moon. The Moho.**
- Alt başlık: *Mohonaut is an on-chain idle drilling game. Run a drill site, fuel your rigs with diesel, and core one shared hole with every other player: the World Bore. Every $MOHN comes out of the ground.*
- Birincil CTA, faza göre: **Try the rig** (T−35 → T−29; cüzdan yok) · **Play Season 0 on testnet** (T−28 → T−8) · **Fill your tank** (Pre-fill, T−1) · **Start drilling** (T0 sonrası)
- İkincil CTA: *Try the rig, no wallet needed* (birincil "Play" iken) · *Read the economy paper*
- Kuyu logu bileşeni (canlı): `WORLD BORE 0 m · STRATUM I — REGOLITH · NEXT: SEDIMENT COVER AT 2,000 m`. T0'dan önce: `WORLD BORE 0 m · DRILLING STARTS [date] 15:00 UTC`.

**S2 — Canlı şerit (7 kutucuk; her biri /economy'deki kaynağına link ve "source · period · updated" satırı taşır, ToS §5.7(k)):** World Bore depth · Active Drill Power · Drill sites with fuel · Emission this hour · $MOHN burned for good · ETH from diesel → buyback & burn / protocol liquidity / operations · Pending timelock changes (→ /timelock). T0'dan önce şerit Season 0 sayılarını "TESTNET" etiketiyle gösterir.
Kutucuk altı örneği: `Source: Robinhood Chain via the Mohonaut indexer · last 24h · updated 14:05 UTC`

**S3 — How it works (3 adım):**
1. **Build.** *Every drill site starts with a free Pilot Rig. Level up your site for more pads and more fuel-line capacity.*
2. **Fuel.** *Rigs burn diesel, measured in litres per hour. You fill your tank with ETH. When a rig isn't worth its fuel, shut it down.*
3. **Drill.** *Every hour the network cores a fixed slice of what's left in the reserve. 90% goes to players, split by Drill Power: your share is your active DP divided by everyone's.*
Altında: *The deeper the bore, the harder the rock: the hourly slice shrinks as the reserve does.* ve tek satır formül: `your share of hour h = E_h × 0.90 × your DP ÷ network DP` → "How emission works" linki.

**S4 — Fair launch kutusu (kömür zemin, turuncu çerçeve):**
- *No presale. No team buy. No premine.*
- *The emission split is fixed in code: 90% players, 5% team, 5% treasury. The team's share accrues hour by hour and can only leave through the same public 72-hour refine queue as everyone else's. Founder's selling policy: [link].*
- *Contracts are deployed and verified 7 days before Genesis. There is no pool to snipe: the contract creates it 72 hours after Genesis starts, at a ratio computed from Genesis data.*

**S5 — The rigs (yatay kaydırmalı kart dizisi):** Her kart: sprite, ad, DP, ℓ/h, DP per ℓ/h, kilit seviyesi (02 §6.1). Kart altı not: *Bigger rigs buy fuel efficiency, not cheaper Drill Power. Existing rigs never change: the contracts have no function to edit them, and any upgrade waits 7 days in a public queue.*

**S6 — World Bore & strata (dikey kuyu logu):** 8 stratum, eşikler metre cinsinden (02 §3.4); Kola Line ve Moho Line işaretli. Metin: *World Bore depth = all $MOHN mined so far ÷ 1,000, in metres. New rig generations, palettes and music unlock when the bore crosses each line, not when a calendar says so. Anyone can check how deep we are.*

**S7 — Crews · Seasons · Survey (3 sütun):**
- *Crews: 5 to 25 players under one banner. Crew ranks are cosmetic; emission is never split by crew.*
- *Seasons: about eight weeks each, ranked on World Bore contribution, fuel efficiency and crew play. Rewards are badges and titles.* (Hazineden MOHN sezon ödülü hukuki gözden geçirme olmadan metne girmez; §6.)
- *Survey: once a day, free. Bring back a core sample, a fossil or a piece of drilling history for your Core Collection. Nothing in Mohonaut is a paid roll.*

**S8 — Trust & safety:**
- *Verified contracts, published 7 days before Genesis.*
- *Immutable token: no owner, one minter, no tax, no blacklist, no pause. Hard cap 100,000,000. At most 500,000 $MOHN can be minted per UTC day, and that limit is written into the token.*
- *Adjustable settings have hard limits in code and wait 96 hours in a public queue. Contract upgrades wait 7 days.* → **Live queue**
- *Unaudited. What we did instead: multi-role AI review, formal proofs of the mint limits, fuzzing campaigns, four weeks of public code review and a public testnet season. An independent audit is the first big item paid for from operations revenue.* → /security
- *Guarded launch: an hourly breaker stops minting automatically, ETH is swept out of contracts daily, and an emergency pause expires on its own after 72 hours.*
- *Status page · Bug bounty · We never DM first. Support lives at /support.*

**S9 — Founder kartı:** Fotoğraf, ad soyad, @onderyazici, iki cümle: *I'm building Mohonaut under my own name. Ask me anything on X, in public.* + doxx videosu linki.

**S10 — Roadmap (tarih değil kapı):** Training Site → Testnet Season 0 → Economy paper → Public code review → Contracts live → Pre-fill → Genesis Dig → Market Open → Crews → Season 1 → Independent audit (funded from operations revenue). Her adımın yanında "done / next".

**S11 — FAQ önizleme (6 soru):**
- *What is $MOHN used for?* → *Buying rigs and site upgrades in the Equipment Market. 80% of in-game $MOHN spend is burned for good; 20% returns to the reserve.*
- *How is my share calculated?* → formül + link.
- *What do I pay ETH for?* → *Diesel. ETH from fuel is routed 55% to buyback & burn, 30% to protocol liquidity that can't be withdrawn, 15% to operations. Published weekly.*
- *Can the team change the rules?* → *Some things can't change at all: the token, the cap, the emission schedule, the 90/5/5 split, the burn ratio and existing rigs. Everything else has hard limits in code and waits 96 hours in a public queue: [live queue].*
- *Is it audited?* → *Not yet. Here is what we did instead and when an independent audit happens: /security.*
- *When can I withdraw my $MOHN?* → *Mined $MOHN goes through the Refinery: free with a 72-hour queue, or instant for an 8% fee (half burned, half returned to the reserve). Refining is closed during the 72 hours of Genesis, and there is no pool before Market Open. We don't comment on price.*
- Tam /faq'ta ek: *Is $MOHO your token?* → *No. Our ticker is $MOHN, and the only address is on /contracts.*

**S12 — Footer:**
`Mohonaut is a game. Nothing on this site is an offer, investment advice or a promise of value. Tokens can lose all value. 18+. Not available in restricted jurisdictions; see Terms.`
`Built on Robinhood Chain. Mohonaut is not affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc.`
`Fake sites and fake pools exist. Official links live on mohonaut.com/contracts.` (09 §7)
+ Terms · Privacy · Brand · Status · Security · Contracts · X · Telegram (announcements).

### 3.3 Canlı istatistikler (/economy ve hero şeridi)

Hepsi aynı indeksleyiciden, **token, ℓ ve ETH biriminde**; USD karşılığı ve "getiri" hesaplayıcısı yok. **Her sayının yanında yöntem, zaman aralığı ve kaynak** (Blockscout/indeksleyici linki) ve "son güncelleme" zamanı bulunur (ToS §5.7(k)).

| Grup | Metrik | Kaynak (`02` §) |
|---|---|---|
| İlerleme | World Bore (m), mevcut stratum, sonraki eşiğe kalan, Kola/Moho Line'a kalan (emisyon takvimine göre tahmini gün, "estimate" etiketiyle) | §3.4 |
| Ağ | Aktif DP (`H`), yakıtı olan saha sayısı, ortalama/medyan DP, Gini ve Nakamoto katsayısı, en büyük 10 sahanın DP payı | §4, §12 |
| Emisyon | Bu saatin emisyonu `E_h`, rezerv `R`, bugüne kadar tahakkuk eden, oyuncu/takım/hazine akışları (90/5/5) | §3 |
| Mint güvenliği | Bugün basılan / 500,000 günlük tavan; kayan 60 dk basım / 150,000 devre kesici; kesici durumu | §2 |
| Sink | Kalıcı yakılan, rezerve geri dönen, rafineri kuyruğu, hızlı rafine ücretleri | §6.3, §8 |
| Takım ve hazine | Kuyruktaki takım/hazine rafineleri (her çekim cüzdana ulaşmadan 72 saat önce görünür; talep ve gün başına ≤ 100,000 MOHN) | §3.3 |
| Gelir | Dizelden gelen ETH; buyback & burn / POL / operasyon dağılımı (55/30/15); POL pozisyonu (NFT linki); aylık ops harcaması 08 §3 sırasıyla | §10 |
| Sağlık | Net emisyon (NE), sink oranı (SR), RCR | §10, §13 |
| Yönetişim | **Timelock kuyruğu** (parametre, eski/yeni değer, sınır, yürürlük zamanı), Safe imzacıları, pause durumu ve kalan süre | §12 |
| Sistem | Son `poke()` zamanı, oracle tazeliği (26 saat eşiği), RPC/blok üretimi | §4, §5 |

**Dikkat:** `02` §10'daki "sıfır enflasyon fiyatı" `P*` kamuya **fiyat hedefi gibi okunabilir**. Panoda gösterilecekse "the price at which buybacks offset emission at current revenue — not a target, forecast or floor" açıklamasıyla ve hukuki gözden geçirmeyle gösterilmeli; tercihen yalnızca RCR ve NE gösterilsin. **[avukat]**

### 3.4 Paylaşım kartı döngüsü

```
Oyuncu olayı ──► "Share" düğmesi ──► sunucu kartı üretir (/s/<id>?card=...)
     ▲                                         │
     │                                         ▼
Kayıt + Pilot Rig ◄── /s/<id> (cüzdansız) ◄── X intent (önceden doldurulmuş metin + link + ref)
```

- **Tetikleyiciler:** Training Site turu, Pioneer rozeti, Spud-In (ilk yakıt), yeni kule tipi, saha seviyesi, katkı eşikleri, Survey bulgusu ve Core Collection seti, Crew'a katılma, stratum geçişi (herkes için), Kola Witness, sezon plaketi. **Durum (2026-10-13):** oyunda "Share on X" düğmesi olanlar: Training Site turu, katkı kartı (profil penceresi), vardiya raporu, Survey bulgusu, stratum geçişi, yeni rozet (Pioneer dahil; Foreman Mo bir kez verir), saha seviyesi ve bir rig tipinin ilki (Mo bir kez söyler; seviye 1 ve Pilot Rig saha açılışıyla geldiği için sayılmaz). Paylaşılan profil/davet linki X'te oyuncunun kendi kartını gösterir (Pages Function; kartta kazanılan rozetler). Sezon plaketi (2026-10-13): biten bir sezonun World Bore katkı sıralamasında ilk 10 (işaretli hesaplar sıra almaz; 1. altın, 2–3 gümüş, 4–10 bronz) kulübe duvarında pixel plaka, profil penceresinde ve herkese açık sayfada liste; paylaşımı kart ve profil linkiyle (ayrı düğme yok). İlk 10 sınırı varsayılan; kurucu değiştirebilir (`PLAQUE_RANKS`, services/api/src/data.ts).
- **Kartta olanlar:** saha görüntüsü, **World Bore'a katkı** ("I've cored [x] m of the World Bore"), Crew, World Bore derinliği, stratum, "Race to the Moho". **Kartta olmayanlar:** kişisel DP/hashrate, sıralama, MOHN miktarı, kazanç, USD, APR, fiyat (01 §4.11).
- **Önceden doldurulmuş metin (katkı):** `I've cored 1,240 m of the World Bore with Crew [Name]. The bore is at 9,870 m, Stratum III: Granite Basement. Race to the Moho. mohonaut.com/s/7Q2K (my invite link)`
- **Önceden doldurulmuş metin (Training Site):** `I ran a test rig on the Mohonaut training site. No wallet, no tokens, just a bore log that only goes down. mohonaut.com/train`
- **Önceden doldurulmuş metin (Pioneer):** `Season 0 done: Pioneer badge on my Mohonaut drill site. Testnet, cosmetic, and mine to keep. mohonaut.com/s/7Q2K (my invite link)`
- **Birim notu:** Katkı (m) = oyuncunun tahakkuk eden MOHN'u / 1,000. Küçük oyuncuların katkısı ilk haftalarda milimetre–santimetre düzeyinde olacak; kartta < 1 m için cm/mm gösterimi ya da kartın bir eşikten sonra açılması gerekir (§10 açık karar, lead designer).
- **Kurallar:** Kullanıcı kendisi tıklayıp gönderir (otomatik gönderim yok). Paylaşmanın kendisi **hiçbir şey kazandırmaz** (X'in Ocak 2026 InfoFi yasağı). Davet linki içeren metin "(my invite link)" ifadesini taşır. UTM: `utm_source=x&utm_medium=sharecard&utm_campaign=<card_type>`.
- **Ölçüm:** kart üretimi, intent tıklaması, /s/ ziyaretleri, /s/'den Training Site'a ve kayda geçiş (KPI §8).

### 3.5 Mobil öncelik ve PWA

- **Portre öncelikli:** saha üstte, kuyu logu sağ kenarda dar bir sütun; masaüstü genişletilmiş görünüm.
- Kurulabilir PWA (manifest, maskable ikon, offline "bakım" ekranı); opt-in web push: "tank below 20%", "Survey ready", "refine complete".
- Giriş (09 §3): cüzdan (Robinhood Wallet, MetaMask, Rabby, Phantom ve **ilk günden WalletConnect**) veya e-posta (ücretsiz kademe). Tek SIWE imzası: *"This signature only logs you in. It cannot move funds."*
- Performans bütçesi: orta segment Android'de LCP < 2.5 sn, ilk yük < 1.5 MB, sprite atlas (WebP/AVIF), font alt kümeleri (Big Shoulders, Barlow, JetBrains Mono), ses tembel yüklenir.
- Erişilebilirlik: kontrast tablosu (§2.4); `prefers-reduced-motion` ile yağmur, buhar ve kule animasyonları durur; sayılar ekran okuyucuya metin olarak verilir; Granulite bandı kenar çizgisiyle ayrılır.
- Test matrisi (Season 0): iOS Safari 16+, Android Chrome, cüzdan içi tarayıcılar, X uygulama içi tarayıcı ("open in browser" yönlendirmesi), MetaMask mobil, Rabby, Coinbase Wallet / Base App, Phantom (ağın açılması), Robinhood Wallet, e-posta girişi; yatay ve dikey.

### 3.6 SEO ve OG temelleri

- Her sayfada benzersiz `<title>` ve `meta description`; kanonik URL; `sitemap.xml`, `robots.txt` (`/status`, `/s/*`, `/docs/*` indekslenebilir; `/play` noindex).
- OG/Twitter: `og:title`, `og:description`, `og:image` (1200×630), `twitter:card=summary_large_image`, `twitter:site=@playmohonaut`, `twitter:creator=@onderyazici`.
- JSON-LD: `VideoGame` (ad, tür "Idle", platform "Web browser"), `Organization` (sameAs: @playmohonaut, kurucu), `FAQPage` (/faq).
- Örnek: title `Mohonaut — Not the moon. The Moho.` · description `An on-chain idle drilling game. Run a drill site, fuel your rigs and core one shared hole with everyone else. Every token comes out of the ground.`
- Marka araması savunması: "Mohonaut official", "Mohonaut contract", "MOHN contract" sorgularında /contracts sayfası üstte çıkmalı (başlıkta "Official contracts").

### 3.7 Güven, oltalama ve cüzdan uyarısı altyapısı (09 §6)

**Domain ve altyapı**
- `mohonaut.com` hemen alınır ve lansmandan **≥ 30 gün önce gerçek içerikle** yayına girer (Cloudflare "New Domains" kategorisi ve Phantom'un yeni domain uyarısı bu süreye bağlı). Yalnızca kendi domainimiz; `*.vercel.app` / `*.pages.dev` yok. Hiçbir domainde "robinhood" ya da "hood" geçmez; tüy logosu yok (ToS §5.7(d)).
- Cloudflare ücretsiz plan: DNS, proxy, temel WAF, HSTS, CSP, SRI, DNSSEC, registrar kilidi. **Landing'in önüne challenge veya captcha konmaz**; Turnstile yalnızca API uç noktalarında. Güvenlik tarayıcı botlarına (Blockaid, Google) izin verilir; bota farklı içerik gösterilmez. Geo-block yalnızca hukuken zorunlu olanlar (yaptırımlar) için.
- `security.txt`, `/contracts`, Google Search Console, Reown Verify domain kaydı (AppKit metadata ile birebir aynı URL). Resmî linklerde URL kısaltıcı yok.

**Kontratlar ve imza**
- Kontratlar **en az 3 gün önce** (bizde T−7) deploy edilir ve Blockscout + Sourcify'da doğrulanır (Rabby son 3 günde deploy edilen kontratlara uyarı veriyor). Hazine Safe'te; EIP-7702 delegasyonlu EOA yok; hiçbir ödeme EOA'ya gitmez.
- Oyuncudan token approve istenmez: yakıt düz `payable` `buyFuel` çağrısıyla alınır, harcamalar rafine edilmemiş bakiyeden yapılır. `setApprovalForAll`, sınırsız allowance, permit/permit2 ve dApp kaynaklı type-4 işlem yok.
- SIWE (EIP-4361): `domain` = host, tam origin, chainId 4663, sunucu nonce'u; `eth_sign` ve hex mesaj asla. Arayüz etiketleri zincirde çağrılan fonksiyonla birebir uyuşur.
- Oyuncuya dönük metinlerde **"claim", "airdrop", "verify wallet", "sync", "revoke"** yok; bizim terimimiz **"Refine"**.
- Lansmandan sonra ani kontrat veya arayüz değişikliği yapılmaz (yeniden işaretlenme riski).

**Başvurular ve izleme**
- **T−7:** Blockaid "Developer – verify a project" (report.blockaid.io; domain + tüm kontrat adresleri + zincir + e-posta), Reown domain allowlist, Google Search Console doğrulaması.
- **T−24 saatten itibaren saatlik:** MetaMask dapp-scanning API kontrolü (NONE / WARN / BLOCK / VERIFIED); yanlış pozitif başvuru şablonları 09 §6 tablosuna göre önceden doldurulmuş hazır bekler.
- Haftalık taklit domain taraması (`mohonaut-*.com`, `mohn-*.xyz`, `mohonaut.app` vb. varyantlar, "claim/airdrop" içerenler); bulunanlar ChainPatrol, SEAL ve eth-phishing-detect'e bildirilir ve /security'de listelenir.

---

## 4. X stratejisi

### 4.1 İki hesaplı yapı

| | **Kurucu — @onderyazici** | **Proje — @playmohonaut** |
|---|---|---|
| Rol | Hikâye, hesap verebilirlik, "building", kararların gerekçesi, özür ve post-mortem | Resmî bilgi: duyuru, adres, takvim, Shift Report, Rig Notes, durum ve olay |
| Dil | **Proje hakkında İngilizce.** Türkçe yalnızca oyunun kendisi hakkında (devlog); token, CA, fiyat yok (§6.2) | Yalnızca İngilizce |
| CA paylaşır mı? | **Hayır, asla yazmaz.** Yalnızca proje hesabının CA gönderisini alıntılar | Evet, **yalnızca** sabit gönderi + /contracts |
| Takip ettikleri | Serbest | Yalnızca @onderyazici ve gerekli altyapı hesapları (≤ 5); taklit yüzeyi daralır |
| Yanıt | Gerçek sorulara kişisel yanıt (§4.6) | Az; yalnızca doküman/durum linkiyle |
| DM | Açık olabilir ama **"I never DM first"**; proje işi DM'den yürümez | **Kapalı** |
| Ritim | Günde 1–3 gönderi + yanıtlar | Günde 0–2 gönderi; lansman haftası olay odaklı |

### 4.2 Kurucu hesabının geçişi (T−45'ten önce)

x-radar ile 2026-10-10'da okunan durum: 112.7K takipçi, 15.2K gönderi, İstanbul; bio `money hunter | degen | content creator | dm for collab |`; son gönderiler çoğunlukla Türkçe ve başka projelerin WL/davet kodu/perp/borç kampanyaları, bir gönderide bir Solana CA'sı; tipik görüntülenme 1–5K.

Öneriler (karar kurucunundur; hukuki boyutları danışmanlıkta netleşir):
1. **Bio değişsin** (§4.3). "dm for collab" kaldırılsın: DM'den işbirliği daveti taklitçilerin en sık kullandığı kancadır. "money hunter | degen" ifadeleri, "miner ponzi" kalıbına sokulmaya hazır bir nişte kurucunun güvenilirliğini zayıflatır.
2. **Çıkar çatışması hijyeni:** Mohonaut süresince başka tokenların CA'larını, alım/işlem/borç kampanyalarını ve davet kodlarını paylaşmayı bırakmak; herhangi bir menfaat varsa her gönderinin başında #reklam / #işbirliği / #ad (TKHK md. 62).
3. **Takipçi ≠ erişim:** 112.7K takipçiye karşın gönderi başı ~1–5K görüntülenme, kurucu hesabının tek başına bir lansman kanalı olmadığını gösteriyor. Büyüme proje hesabından, Training Site / Season 0 döngüsünden ve paylaşım kartlarından gelmeli.
4. **Dil ayrımı:** Kurucunun doğal kitlesi Türkçe; hukuken en riskli kitle de bu. Token, CA, fiyat, "al" çağrısı Türkçe **hiç** yazılmaz (§6.2).
5. **Doxx:** Reveal günü kısa bir yüz-kamerası videosu + ad soyad. Vaat edip geciktirmek yerine reveal'da yayımlanır (gerekçe §9).
6. **Kurucu satış politikası:** Takımın %5'lik emisyon akışı yalnızca standart 72 saatlik kuyrukla ve talep/gün başına ≤ 100,000 MOHN ile çekilebilir (02 §3.3). Bunun üstüne kurucunun gönüllü satış politikası (ör. ilk N gün satış yok, sonrasında haftalık üst sınır) T−18'de yayımlanır; rakamlar kurucu kararı, metin hukuki gözden geçirmeyle. **[avukat]**

### 4.3 Bio şablonları (X sınırı 160 karakter; sayımlar 2026-10-11)

```
Kurucu (@onderyazici) — 141 karakter:
Founder of @playmohonaut, an on-chain drilling game. Doxxed. I never DM first and never ask for funds. Official links: mohonaut.com/contracts

Proje (@playmohonaut) — T−35 → T−8 — 156 karakter:
Not the moon. The Moho. Idle drilling game: everyone cores one shared bore. No presale, no premine. Built on Robinhood Chain; not affiliated with Robinhood.

Proje (@playmohonaut) — T−7 sonrası — 146 karakter:
Not the moon. The Moho. Only official $MOHN address: mohonaut.com/contracts. We never DM. Built on Robinhood Chain; not affiliated with Robinhood.

Savunma hesapları (@mohonauts, @mohonautgame, @mohonauthq):
Not used. The only official Mohonaut account is @playmohonaut.
```

- Profil "website" alanı: `mohonaut.com`.
- **Robinhood ToS:** Yalnızca ön onaylı kalıp "Built on Robinhood Chain" (§5.6) kullanılır. Bio'daki kısa uyarı ("not affiliated with Robinhood") yer kısıtı nedeniyledir; tam metin (`Mohonaut is not affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc.`) site altbilgisinde, Telegram kanal açıklamasında, Discord'da (açılırsa), sabit gönderi thread'inin son mesajında ve her Space açılışında yer alır (§5.7(b)). Kısa biçimin yeterliliği hukuki gözden geçirmede teyit edilir. **[avukat]** Logo/tüy simgesi, "RH" ya da "hood" ekli ad ve Robinhood'u ima eden görsel **hiç** kullanılmaz.

### 4.4 Sabit gönderi planı (proje hesabı)

| Dönem | Sabit gönderi |
|---|---|
| T−35 → T−34 | Reveal (P-01) |
| T−33 → T−29 | Training Site (P-04) |
| T−28 → T−19 | Season 0 canlı (P-14) |
| T−18 → T−11 | Ekonomi kâğıdı thread'i (P-16); son mesajında "market açılmadan $MOHN alınamaz" kuralı (P-17) ve Robinhood uyarısı |
| T−10 → T−8 | Genesis takvimi (P-20) |
| **T−7 → kalıcı** | **Kontrat adresleri (P-22)**: lansmandan sonra da sabit kalır; tüm kurucu ve proje gönderileri buna alıntıyla bağlanır |

Kurucu hesabının sabiti T−35'ten itibaren reveal thread'i (F-05), T−7'den sonra P-22'nin alıntısı (F-11).

### 4.5 Taklit (impersonation) savunması

1. **Tek kaynak kuralı:** Adres yalnızca @playmohonaut'un sabit gönderisinde ve `mohonaut.com/contracts`'ta. Kurucu adresi kendisi yazmaz; yanıtlarda adres paylaşılmaz.
2. **Erken ve kesin tanım:** "There is no $MOHN market until Market Open" cümlesi T−34'ten (ticker'ın kamuya çıktığı repo yayını sonrası) Market Open'a kadar her önemli gönderide tekrarlanır. "$MOHO bizim değildir" bilgisi /faq'ta durur (tweet'te $MOHO adı anılmaz; ölü kontratlara trafik çekmemek için).
3. **`@mohonaut` bizim değil.** Sahibi bilinmiyor. Haftalık kontrol edilir; aktifleşir ve projeyi taklit ederse X'e raporlanır ve /security'deki taklit listesine eklenir. Gerekirse sabit gönderiye "@mohonaut is not affiliated with us" notu eklenir.
4. **Varyant handle'lar** §0.1'deki gibi rezerve ve kilitli.
5. **Doğrulama rozeti:** X Premium (proje ve kurucu, $8/ay) ve Verified Organizations ücretlidir → opsiyonel, yalnızca gelirle (08 §3 sıra 1).
6. **Yanıt temizliği:** CA gönderisinin altına "DM me for support" botları gelir. Proje hesabı yanıtları "takip ettiklerin ve bahsettiklerin" ile sınırlamayı değerlendirir; dolandırıcı yanıtlar gizlenir ve raporlanır. Sessize alınacak kelimeler: "support", "DM", "airdrop", "claim", "presale", "whitelist", "wallet validation", "sync", "revoke".
7. **Haftalık tarama:** x-radar ile "mohonaut", "$MOHN", "mohn airdrop", "mohonaut presale", "mohonaut claim" aramaları; taklitler /security'de listelenir ve X'e raporlanır.
8. **Ekip kuralları:** Hiçbir ekip üyesi önce DM atmaz, hiçbir yerde "doğrulama" için imza istemez; kurucu ve proje hesaplarında 2FA donanım anahtarıyla.

### 4.6 Yanıt politikası

- **Toplu yanıt yok.** X ürün tarafı toplu yanıtın erişimi düşürdüğünü söyledi ([Backpack Learn](https://learn.backpack.exchange/zh-tw/articles/nikita-bier-crypto-twitter)). Kurucu günde en fazla ~20–30 özenli yanıt verir; aynı soru 3+ kez gelirse yanıt yerine bir SSS gönderisi yazılır ve alıntılanır.
- **Yanıtlanmayanlar:** fiyat, "wen market/listing", "is it safe to buy", "how much will I make". Tek tip cevap gerekiyorsa: `We don't talk about price. Here's how your share is calculated: mohonaut.com/docs/economy`
- **Her zaman yanıtlananlar:** hata bildirimi (→ /support + teşekkür), adalet/kural soruları (→ doküman linki; yönetişim sorusunda /timelock), eleştiri (kısa, sayılı, savunmacı değil), "is it audited?" (→ dürüst cevap + /security).
- **Proje hesabı** yalnızca resmî bilgi gerekirse yanıt verir; oyuncu içeriğini RT/alıntı ile öne çıkarır (topluluk rehberleri en iyi organik içeriktir).
- **Türkçe yanıtlar** (kurucu): oyun desteği olabilir; token/fiyat/al-sat sorusuna Türkçe yanıt verilmez, İngilizce dokümana yönlendirilir.

### 4.7 X Spaces: "Shift Change"

- Haftalık, 30–45 dk, sabit saat (ör. Çarşamba 17:00 UTC = 20:00 TR, 13:00 ET). Konuşmacılar: kurucu + bir konuk (geliştirici, ekonomi, güvenlik, başka bir oyun ekibi). Konuk seçiminde ve konuşma metinlerinde rakip proje adı geçmez (§6.4b).
- Planlanan bölümler: #1 Ekonomi kâğıdı (T−17) · #2 Güvenlik, "Unaudited" ve lansman mekaniği (T−5) · #3 Genesis canlı (T0−15dk → T0+45dk) · #4 Market Open sonrası (T+4) · haftalık rapor sonrası (T+7, T+14, T+21, T+28).
- Açılış metni (sabit): `Quick ground rules: no price talk, no financial advice, and we'll never DM you after this Space. Mohonaut is built on Robinhood Chain and isn't affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc.`
- Kayıt + 5 maddelik özet her Space'ten sonra paylaşılır. Fiyat sorusu sahneye alınmaz.
- Türkçe Space: yalnızca oyun/geliştirme, token konuşulmaz, hukuki gözden geçirmeyle.

### 4.8 İşbirlikleri: ücretli ve etiketsiz tanıtım yok

**2026 platform kuralları (araştırma raporu, "X stratejisi ve 2026 platform kuralları"):**
- X, kullanıcılara gönderi karşılığı ödeme yapan uygulamaların API erişimini **2026-01-15**'te kalıcı olarak kesti (InfoFi / "yap-to-earn" sona erdi).
- Kripto, X'in Paid Partnerships programında **2026-03-01**'den beri yasak; yalnızca resmî X Ads, izin verilen ülkelerde (ücretli → opsiyonel, gelirle; Türkiye durumu teyit edilemedi).

**Yapılabilir (ücretsiz, değer aktarımı yok):**
- Başka toplulukların Crew'ları için ortak kozmetik (sancak, kule boyası) ve Crew'lar arası kozmetik turnuvalar.
- Ortak Space'ler, oyun ekipleriyle çapraz devlog.
- İçerik üreticilerine **Season 0 rehberi + basın kiti** (ödeme yok); bunu ifşa etmeleri istenir.
- Oyuncu rehberlerini RT/alıntı ile öne çıkarmak.

**Yapılmaz:** gönderi karşılığı token/ETH/rozet/öncelik vermek; "post to earn" panoları; etkileşim puanı sıralamaları; KOL'e ödeme yapıp etiketsiz paylaşım; sosyal paylaşım ödül havuzları (X'in yasakladığı modele çok yakın; §9).

**İfşa kuralları (bir değer aktarımı olursa: para, token, ETH, değerli kozmetik, öncelikli erişim):**
- Gönderinin **başında** `#ad` (İngilizce) ve Türkçe içerikte `#reklam` veya `#işbirliği`. "NFA/DYOR" ifşa yerine geçmez.
- /collab sayfasında kamuya açık kayıt: tarih, kişi/hesap, verilen değer, gönderi linki.
- Sözleşmede: fiyat/getiri/listeleme ifadesi ve rakip adı yasak; onaylı dil rehberi (§6) ek olarak verilir.
- **Davet linkleri** de bir menfaattir: paylaşım metinlerinde "(my invite link)" standarttır.

### 4.9 Topluluk kanalları

| Kanal | Durum | Kural |
|---|---|---|
| X (2 hesap) | Ana kanal | §4.1–4.6 |
| Web sitesi | Doğruluk kaynağı | /status, /contracts, /timelock, /docs, /support |
| Telegram duyuru kanalı | **Salt okunur** (yalnızca yayın) | Her X duyurusunun aynası; sohbet grubu açılmaz (DM dolandırıcılığı). Kanal açıklamasında tam Robinhood uyarısı |
| Discord | **Opsiyonel**; açılırsa salt okunur kanallar + bilet botu, **üyeler arası DM kapalı**, tam Robinhood uyarısı | Taklit dolandırıcılıkları 2025'te ~%1,400 arttı (araştırma notu 07) |
| E-posta / Telegram bot | Opt-in bildirimler (tank azaldı, rafine tamamlandı) + kritik duyurular | DMARC `p=reject`; e-postada asla link ile imza ya da "claim" istenmez |

### 4.10 Training Site, Testnet Season 0 ve tek seviyeli referans (bekleme listesinin yerine)

**Neden bekleme listesi yok:** Etkileşim kapılı formlar erişimi optimize eder, kanıtı değil; bot ve spam üretir, toplu yanıt X erişimini düşürür (09 §1 ders 4). Bizim kanıtımız oyunun kendisidir.

**Training Site (T−35'ten, `/train`):**
- Cüzdan, kayıt ve sunucu gerektirmez; oyun formülleri (`packages/sdk`) tarayıcıda yerel çalışır. Zaman 60× hızlı. Token ve para yok; ekranda kalıcı "SIMULATION" etiketi.
- Oyuncu Pilot Rig'e yakıt koyar, kule alır, sahayı büyütür, kuyu logunun ilerleyişini görür.
- Paylaşım kartı: "I ran a test rig on the Mohonaut training site" (kazanç rakamı yok).

**Testnet Season 0 (T−28 → T−8, `/play` + `/season0`):**
- Gerçek kontratlar testnet'te (46630). Giriş: cüzdan (RainbowKit + SIWE) veya e-posta (ücretsiz kademe). Cloudflare Turnstile.
- **Testnet ETH:** Testnet'teki sahte fiyat beslemesi (`MockV3Aggregator`) yakıtı çok ucuza fiyatlar (bir haftalık oyun ≈ 0.0005 testnet ETH). **Kendi küçük faucet'imiz:** Turnstile + IP/cüzdan başına günlük limit; kurucu ücretsiz faucet'lerden aldığı testnet ETH'yi buraya koyar.
- **Yok:** beğen/RT/yanıt/alıntı görevi, XP sıralaması, forma cüzdan adresi yapıştırma.
- **Pioneer rozeti:** Beş kilometre taşı: ilk yakıt → ilk kule → saha L3 → ilk rafine → Crew'a katılma. Rozet devredilemez ve mainnet'e **yalnızca kozmetik** olarak taşınır; token, öncelik ya da ekonomik avantaj vermez. Robinhood ToS §2.5 gereği testnet tokenlarının değeri yoktur ve hiçbir metinde testnet teşviki vaat edilmez.
- Season 0 aynı zamanda herkese açık betadır: hata bildirimi formu, cihaz/cüzdan matrisi, yük testi, testnet bug bounty kuralları (/security).
- **Bot politikası:** IP/ASN/cüzdan kümeleme ve eşzamanlı davranış sinyalleri; işaretli hesaplar rozet alamaz. Her sayı gönderisinde doğrulanmış ve işaretlenen hesap sayısı birlikte, kaynak ve dönemle verilir.

**Referans:**
- Kişisel davet linki Season 0'da verilir (tek seviye); mainnet'te `register` referrer'ına bağlanır.
- Mainnet kuralı (02 §9): davet eden, davet edilenin madenci tahakkukunun %3'ü kadar kredi alır; **hazinenin %5'lik payından** ödenir, davet edilenden kesilmez, yeni emisyon basılmaz; davet edilenin toplam yakıt harcaması ≥ 0.003 ETH ve davet edenin aktif yakıtı olmalı. Pazarlama metninde "earn" yerine "referral credit (see docs)" denir. **[avukat]** Token cinsinden referans kredisinin TR/ABD/AB'de nasıl nitelendirileceği.

---

## 5. İçerik takvimi: T−42 → T+30

### 5.0 Ön koşullar ve kapılar

**T−42'den önce bitmiş olmalı:** §0.1 rezervasyonları · en az tek seferlik hukuki danışmanlık **ya da** kurucunun risk kabul kaydı (04 §8) · tüzel kişilik kararı · Training Site build'inin T−36'da, Season 0 testnet build'inin T−29'da hazır olacak durumda olması · repo'nun T−35'te herkese açılmaya hazır olması (sırlar ve `.env` taranmış, gitleaks temiz) · `mohonaut.com` ön sayfası (gerçek içerik, reklamsız) · logo/avatar/banner · doxx videosu çekilmiş · testnet faucet'i fonlanmış.

**T0 sabit bir tarih değildir; kapılardan türetilir:** `T0 ≥ (Season 0 başlangıcı + 28 gün)` ve `T0 ≥ (repo'nun herkese açılması + 35 gün)` (deploy T−7'de → herkese açık inceleme ≥ 4 hafta, 04 §5.1) ve `T0 ≥ (çok rollü AI incelemesinin son bulgusunun kapanması + 12 gün)`. Örnek saat: **Salı 15:00 UTC** (18:00 TR, 11:00 ET; ABD, AB ve TR örtüşmesi).

| Kapı | Ne zaman | Geçme şartı | Geçmezse |
|---|---|---|---|
| G1 Reveal | T−35 | §6 dil rehberi ve şablonlar hukuki gözden geçirmeden geçti (ya da risk kabul kaydı var); handle ve domain elde; repo herkese açılmaya hazır; Training Site orta segment telefonda akıcı | Reveal ertelenir (kamu bilmediği için maliyet yok) |
| G2 Güvenlik incelemesi | T−12 | 3 rollü AI incelemesi + ikinci AI taraması tamam ve tüm bulgular test + düzeltmeyle kapalı; Halmos ispatları (mint tavanı dahil) geçti; Medusa/Echidna 72 saat temiz; herkese açık incelemeden gelen bulgular kapalı; Season 0'da açık S1/S2 yok | Lansman saati **ilan edilmez**; "security review status" gönderisi |
| G3 Saat ilanı | T−10 | G2 + yük testi (10× trafik) + korumalı lansman sınırları testli | Tarih verilmez |
| G4 Deploy | T−7 | Herkese açık inceleme ≥ 4 hafta; deploy script'i testnet'te 2 kez uçtan uca koştu ve ikinci bir göz inceledi; Handover assert'leri geçti; Safe imzacılarından en az biri donanım cüzdanlı; timelock 96 saat / yükseltme 7 gün | Gecikme şablonu (§7.3), yeni saatli plan |
| G5 Genesis | T0−60dk | /status yeşil; keeper, oracle ve indeksleyici sağlıklı; MetaMask taraması NONE/VERIFIED | Gecikme şablonu |

### 5.1 Günlük tablo

"—" = planlı gönderi yok (spontane devlog serbest, ama §6 kurallarıyla). Taslak kodları §5.2'de.

| Gün | Faz | Kurucu (@onderyazici) | Proje (@playmohonaut) | Site / ürün / operasyon | Taslak |
|---|---|---|---|---|---|
| T−42 | Stealth devlog | Devlog başlar; gece sondaj sahası WIP klibi, isim yok | Hesap rezerve, gönderisiz | `mohonaut.com` ön sayfası (reklamsız, gerçek içerik), security.txt | F-01 |
| T−41 | Stealth | "Kendime koyduğum kurallar" thread'i | — | — | F-02 |
| T−40 | Stealth | Palet ve izometrik saha WIP görseli (yorumsuz) | — | Marka varlıkları final | — |
| T−39 | Stealth | Turbodrill test klibi | — | — | F-03 |
| T−38 | Stealth | Opsiyonel Türkçe devlog (yalnızca oyun) | — | Training Site QA | — |
| T−37 | Stealth | "Ölen madencilik oyunlarını ne öldürdü?" sorusu; 5–10 özenli yanıt | — | — | F-04 |
| T−36 | Stealth | Tek satır: "Tomorrow it gets a name." | Avatar/banner yüklenir, hâlâ gönderisiz | Landing staging, sprite ve log varlıkları | F-04b |
| **T−35** | **Reveal** | Reveal thread + doxx videosu, sabitle | Teaser videosu, sabitle | Landing + `/train` (Training Site) + /docs iskeleti + /faq /terms /privacy /collab /security (durum) · **repo herkese açık** | P-01, F-05 |
| T−34 | Reveal | P-02'yi alıntılar | Oynanış ilk bakış; "nasıl çalışır" thread'i; sahte token kuralı ilk kez | — | P-02, P-03, P-17 |
| **T−33** | **Training Site** | "Kafanı karıştıran her şey benim hatam" notu | Training Site duyurusu (sabitle) | `/train` paylaşım kartı | P-04, F-06 |
| T−32 | Lore | — | World Bore ve strata | /docs/strata | P-09 |
| T−31 | Kule serisi | — | Rig 0: Pilot Rig | /docs/rigs | P-07 |
| T−30 | Kule serisi | Opsiyonel Türkçe devlog | Rig 1: Rotary Rig | — | P-07 şablonu |
| T−29 | Season 0 duyurusu | Test cihazı çağrısı (iPhone/Android/cüzdanlar) | Season 0 tarih/saat + kurallar thread'i; akşam Rig 2: Top Drive | /season0, faucet, Pioneer rozeti, dinamik OG | P-13, P-05, P-07 şablonu |
| **T−28** | **Testnet Season 0** | "Saat 1" notu | Season 0 canlı (sabitle) | `/play` (TESTNET şeridiyle), /status, /economy + /timelock (testnet), /support, testnet bug bounty | P-14, F-07 |
| T−27 | Season 0 | Hata bildirenlere teşekkür (izinle, isimle) | Rig Notes #1; akşam Rig 3: Diamond Core Drill | Günlük patch | P-15, P-07 şablonu |
| T−26 | Maskot | Foreman Mo eskiz süreci | Foreman Mo tanıtımı; akşam Rig 4: Turbodrill | Maskot sayfası | P-08, P-07 şablonu |
| T−25 | Kule serisi | "Pahalı = verimli, ucuz DP değil" gerekçesi | Rig 5: Plasma Bore | — | P-10 |
| T−24 | Survey | "Neden ücretli rastgelelik yok" (kısa, kişisel) | Survey ve Core Collection | /docs/survey | P-11 |
| T−23 | Crews | — | Crews | /docs/crews | P-12 |
| T−22 | Season 0 | — | Season 0 ara sayıları | Yük testi | P-06 şablonu |
| T−21 | Herkese açık inceleme | "Kontratlarımızı kırın" çağrısını alıntılar | Herkese açık inceleme çağrısı | /security kapsamı ve bounty kuralları | P-19a |
| T−20 | Season 0 | Bir Season 0 sahası vitrini (izinle) | Rig Notes | — | P-15 şablonu |
| T−19 | Season 0 | — | Haftalık mini özet | — | P-06 şablonu |
| **T−18** | **Ekonomi kâğıdı** | "Bensiz çalışan ekonomi" + kurucu satış politikası | Ekonomi kâğıdı thread'i (sabitle) + sahte token kuralı | /docs/economy, /docs/refining (taslak), /brand | P-16, P-17, F-08 |
| T−17 | Ekonomi | Space #1'i sunar | Space #1 duyurusu ve kaydı | Space özeti | P-18 |
| T−16 | Season 0 | En çok sorulan 5 ekonomi sorusu (thread) | Rig Notes | — | P-15 şablonu |
| T−15 | Season 0 | — | Season 0 ara sayıları | — | P-06 şablonu |
| T−14 | Season 0 | Pioneer hunisinden bir ders (hangi kilometre taşında takılıyorlar) | — | Onboarding düzeltmeleri | — |
| T−13 | Season 0 | Hata/düzeltme özet videosu | Rig Notes | G2 hazırlığı | P-15 şablonu |
| **T−12** | **Güvenlik incelemesi** | "Denetimsiz başlıyoruz, açıkça söylüyorum" + en utandırıcı bulgu | İnceleme raporu + sınırlar | /security raporu, G2 | P-19, F-09 |
| T−11 | Season 0 | — | "Season 0'ın son haftası" | — | — |
| **T−10** | **Lansman saati** | "Tutabileceğim bir tarih" | Genesis takvimi (sabitle) + açılış oranı formülü | /docs/genesis, G3; ticker ve handle kontrollerini tekrarla | P-20, P-21, F-10 |
| T−9 | Season 0 | Genesis SSS thread'i | Trailer (45–60 sn) | — | — |
| T−8 | Season 0 kapanış | Season 0 teşekkürü | Season 0 kapandı; Pioneer rozetleri anlık görüntüsü | Testnet reset | P-37 |
| **T−7** | **Kontratlar** | CA gönderisini alıntılar | Kontrat adresleri (kalıcı sabit) | /contracts, /timelock (mainnet), Blockscout + Sourcify doğrulama, G4; Blockaid "verify a project", Reown allowlist, Search Console; /docs/refining dondurulur; /docs/eth | P-22, F-11 |
| T−6 | Rehber | "Kontratlarımızı kendin nasıl doğrularsın" (Blockscout adımları) | Rehber: Robinhood Chain'e ETH getirme | — | P-36 |
| T−5 | Space #2 | Space #2: güvenlik, "Unaudited" ve lansman mekaniği | Duyuru + kayıt | — | — |
| T−4 | Rehber | — | Rehber: dizel tankı ve Pre-fill | — | P-38 |
| T−3 | Rehber | — | Genesis kontrol listesi | /status yeşil | P-23 |
| T−2 | Son hazırlık | Kısa kişisel not | P-17 tekrar (sahte token uyarısı) | Go/no-go toplantısı | P-17 |
| **T−1** | **Pre-fill (T0−24s)** | Pre-fill'e katılır, ekran görüntüsü | Pre-fill açık | Pre-fill canlı; MetaMask taraması saatlik | P-24 |
| **T0** | **Genesis Dig** | "Kazıyoruz" + Space #3 (T0−15dk → T0+45dk) | Genesis canlı; 1. ve 6. saat sayıları | Runbook §7 | P-25, P-26, F-12 |
| T+1 | Genesis | Gün 1 notları, hatalar ve düzeltmeler | Gün 1 özeti; Rig Notes | — | P-27 |
| T+2 | Genesis | "Market Open'da yapmayacağım şeyler" | Market Open adım adım (thread) | Market Open provası (fork üzerinde) | P-28 |
| **T+3** | **Market Open (T0+72s)** | "Fiyat yorumu yapmayacağım" | Market Open sonucu + sahte havuz uyarısı | `openMarket()`, POL, rafineri açılır | P-29, P-30, F-13 |
| T+4 | Market | Space #4 | Rafineri rehberi | — | P-39 |
| T+5 | Market | Oyun içi strateji: "kule ne zaman kapatılır" | Rig Notes | — | F-15, P-15 şablonu |
| T+6 | Market | — | İlk standart rafine kuyrukları tamamlanıyor: hatırlatma | Keeper `finalize` izleme | — |
| **T+7** | **Shift Report #1** | Raporu alıntılar + 1 ders | Shift Report #1 | /economy/reports/1 | P-31 |
| T+8 | Topluluk | Oyuncu sahası vitrini (izinle) | — | — | — |
| T+9 | Topluluk | — | "Crews yarın açılıyor" | — | — |
| **T+10** | **Crews** | Kendi Crew'unu kurmaz (tarafsızlık) | Crews açık | /crews | P-32 |
| T+11 | Ürün | Crew sancağı örnekleri | Rig Notes | — | P-15 şablonu |
| T+12 | Topluluk | Opsiyonel Türkçe devlog (oyun) | — | — | — |
| T+13 | Topluluk | — | Survey / Core Collection vitrini | — | — |
| **T+14** | **Shift Report #2** | Space #5 | Shift Report #2 | /economy/reports/2 | P-31 şablonu |
| T+15 | — | — | — | — | — |
| T+16 | Ürün | Yeni nesil kulelerin stratum eşiğine bağlı olduğunu anlatır (Sediment Cover ≈ 2,000 m) | — | — | — |
| T+17 | — | — | Rig Notes | — | P-15 şablonu |
| T+18 | Topluluk | Oyuncu rehberlerini RT/alıntı | — | — | — |
| T+19 | — | — | — | — | — |
| T+20 | Kilometre taşı (veriye bağlı, ≈ T+20/21) | Kola Line hakkında kısa not | "World Bore 1,000 m" (eşik geçildiği an) | Kilometre taşı kartı | P-33 |
| **T+21** | **Shift Report #3 · Season 1** | Sezon kurallarını alıntılar | Shift Report #3 + Season 1 başlangıcı | /seasons/1 | P-31 şablonu, P-34 |
| T+22 | Sezon | — | Sezonun ilk günü: Crew katkı kartı | — | — |
| T+23 | Sezon | Opsiyonel Türkçe devlog | — | — | — |
| T+24 | Sezon | — | Rig Notes | — | P-15 şablonu |
| T+25 | Sezon | Oyuncu Crew hikâyesi (izinle) | — | — | — |
| T+26 | Sezon | — | Survey / kozmetik vitrini | — | — |
| T+27 | Sezon | — | — | Aylık ops raporu hazırlığı | — |
| **T+28** | **Shift Report #4 + ilk aylık ops raporu** | Raporu alıntılar | 30 gün özeti | /economy/ops/1 | P-35, P-31 şablonu |
| T+29 | — | — | — | — | — |
| **T+30** | **Retrospektif** | 30 gün thread'i: ne çalıştı, ne bozuldu | Alıntı | — | F-14 |

Ritim kuralları: Proje hesabı reveal'dan sonra günlük ana gönderisini **her gün aynı saatte** (ör. 17:00 UTC) atar. Lansman haftası dışında günde en fazla 2 proje gönderisi. "Sayılar" gönderileri yalnızca zincir verisiyle (Season 0'da testnet verisiyle) doğrulanabilen rakamlar içerir ve **yöntem, dönem ve kaynak** belirtir (ToS §5.7(k)). Timelock'tan söz eden her gönderi `mohonaut.com/timelock` linkini taşır. Planlama X'in kendi zamanlayıcısıyla (ücretsiz, 08 §2).

### 5.2 Tweet taslakları (İngilizce)

Köşeli parantezler doldurulacak alanlardır. **Tüm taslaklar yayından önce §6.5 kontrol listesinden ve hukuki gözden geçirmeden geçer**; **[avukat]** işaretliler özellikle. Taslaklar standart 280 karakter sınırına göre yazıldı (URL'ler X'te 23 karakter sayılır); "/" ile ayrılanlar tek gönderinin satırlarıdır.

**Stealth devlog**

- **F-01 (T−42):** `I've been quiet because I've been building. It's an idle game where everyone drills the same hole. No name yet, no token talk. Just one rig, at night, in the rain. I'll post the devlog here as I go.` [WIP klip: gece sondaj sahası]
- **F-02 (T−41, thread):**
  1. `Before writing any game code, I wrote down rules I'm not allowed to break. Posting them so you can hold me to them.`
  2. `The game never owes more than a fixed emission schedule. No daily percentages, no per-rig promises.`
  3. `No presale. No team buy. No premine. If a token exists, someone drilled for it.`
  4. `Nothing random costs money. Free daily stuff can be random. Anything you pay for is deterministic.`
  5. `Nothing gets nerfed after you've paid for it. New rigs can come later. Old ones stay exactly as sold.`
  6. `Every adjustable number gets hard limits in code and a public 96-hour delay before it changes. Contract upgrades wait 7 days. More soon.`
- **F-03 (T−39):** `Rig test: a Turbodrill spinning up under sodium lights. The rain is placeholder. The orange is not.` [klip]
- **F-04 (T−37):** `If you've played an on-chain mining game that died, what killed it for you? Not looking for names. Looking for failure modes. I'm reading every reply.`
- **F-04b (T−36):** `Tomorrow it gets a name.`

**Devlog cephanesi (2026-10-13'te oyuna eklenenler; isimsiz, stealth dönemine uygun, kurucu hesabı)**

- **D-01:** `Built a thing tonight: come back to your drill site after a while and the foreman hands you a shift log. What your rigs cored, the diesel they burned, how much deeper the shared hole got. No fireworks. Just the log.` [ekran görüntüsü]
- **D-02:** `Finish a set in the daily survey and it ends up on your site: an old wooden derrick, a rack of core samples, an ammonite in a glass case. Free, once a day, nothing to buy. It changes nothing in the economy.` [ekran görüntüsü]
- **D-03:** `Your crew's tag now flies on the flagpole of your core shack. I had to draw a 3x5 pixel alphabet for it. M and W didn't fit in three pixels. They get five.` [ekran görüntüsü]
- **D-04:** `Transparency detail nobody asked for: the equipment market shows what Drill Power cost on each of the last 7 days, read from the chain. Prices come from a public formula. Nobody sets them by hand.` [ekran görüntüsü]
- **D-05:** `If your transaction is slow, the game keeps its hash, tells you it is still on its way, and won't let you pay twice. Reload the page and it picks it up again. Boring. Important.` [ekran görüntüsü]
- **D-06:** `Season reward design, settled: the top ten in World Bore contribution get a plaque screwed to the wall of their core shack. Gold, silver, bronze, 5x4 pixels each. Cosmetic. It also shows on your share card.` [ekran görüntüsü: kulübe duvarı + kart]
- **D-07:** `Small one: when your site levels up or your first rig of a new type lands on its pad, the foreman says so once. You can share it. Level 1 and the free starter rig don't count, because everyone gets those.` [ekran görüntüsü]

**Reveal**

- **P-01 (T−35):** `This is Mohonaut. An idle drilling game, on-chain. Run a drill site. Fuel your rigs. Core one shared hole with everyone else: the World Bore. Not the moon. The Moho. Built on Robinhood Chain. Try the rig, no wallet needed: mohonaut.com` [20 sn teaser]
- **F-05 (T−35, thread):**
  1. `I'm [Full Name] (@onderyazici). I've spent years on CT watching other people's launches. Now I'm shipping one under my own name and face. It's called Mohonaut. What it is, and what it will never do:`
  2. `Mohonaut is an idle game on-chain. You run a drill site, add rigs that produce Drill Power, and fuel them with diesel. Every site drills into one shared hole, the World Bore. Its depth is public, and it only goes down.`
  3. `Every token comes out of the ground. No presale, no team buy, no premine. The team gets 5% of the emission stream, accrued hour by hour, and withdraws it through the same public 72-hour queue as everyone else.`
  4. `Your share of each hour's emission = your active Drill Power ÷ the network's. That's the whole mechanism. The formula and every parameter go public before launch.`
  5. `What you won't find here: paid loot boxes, upgrade gambles, price talk, or promises.`
  6. `The honest part: there's no budget for a paid audit before launch. So the code is public from today, launch limits are written into the contracts, and the site says "Unaudited" until an independent audit is done. Repo: [link]`
  7. `60 seconds on why I'm doing this: [video] Follow @playmohonaut. The training site is live at mohonaut.com. I will never DM you first.`
- **P-02 (T−34):** `First look at gameplay. One drill site at night. Four pads, a free Pilot Rig, a diesel tank, and a bore log on the right that only goes one way.` [video]
- **P-03 (T−34, thread):**
  1. `How Mohonaut works, in four posts.`
  2. `Build. Every drill site starts with a free Pilot Rig. Levelling up the site adds pads and fuel-line capacity.`
  3. `Fuel. Rigs burn diesel, in litres per hour, and you fill the tank with ETH. When a rig isn't worth its fuel, shut it down. That's a real decision, not a menu item.`
  4. `Drill. Every hour the network cores a fixed slice of what's left in the reserve: 90% to players, split by Drill Power. The deeper the bore, the harder the rock, so the slice shrinks as the reserve does. 80% of in-game $MOHN spend is burned for good.`
- **P-17 (T−34; T−18; T−2 tekrar):** `A rule that makes fakes easy to spot: there is no $MOHN market until Market Open, 72 hours after Genesis starts. If you can buy $MOHN before then, it isn't ours.`

**Training Site**

- **P-04 (T−33, sabit):** `The Mohonaut training site is open: mohonaut.com/train. No wallet, no sign-up, no tokens. Fuel a Pilot Rig, buy rigs, level up and watch the bore log move at 60x speed. Same emission formula as the real game, illustrative prices. The only thing missing is the chain.`
- **F-06 (T−33):** `If something on the training site confuses you, that's a bug in my design, not in you. Tell me what you expected to happen. Replies or mohonaut.com/support. Never DMs.`

**Lore, kule serisi, maskot, sistemler**

- **P-09 (T−32, iki gönderi):**
  - `World Bore depth = all $MOHN mined so far ÷ 1,000, in metres. Eight strata between the regolith and the core. New rigs, palettes and music unlock when the bore crosses each line, not on a date we pick. Anyone can check how deep we are.`
  - `Two lines worth watching. The Kola Line, 12,262 m: the deepest hole people have ever drilled. And the Moho Line, 35,000 m: where the crust ends and the mantle begins.`
- **P-07 (T−31):** `Rig 0: Pilot Rig. 10 Drill Power · 0.25 ℓ/h · 40 DP per ℓ/h. Free, one per drill site. Small engine, small rig, slow on purpose. Every Mohonaut starts here.`
  - Şablon: `Rig [n]: [Name]. [DP] DP · [ℓ/h] ℓ/h · [η] DP per ℓ/h. Unlocks at site level [L]. [one line of character].`
  - T−30: `Rig 1: Rotary Rig. 50 DP · 1.0 ℓ/h · 50 DP per ℓ/h. Site level 1. The workhorse.`
  - T−29: `Rig 2: Top Drive. 150 DP · 2.5 ℓ/h · 60 DP per ℓ/h. Site level 3. Turns the whole string from the top and complains about it all shift.`
  - T−27: `Rig 3: Diamond Core Drill. 420 DP · 6.0 ℓ/h · 70 DP per ℓ/h. Site level 6. Brings up the core samples.`
  - T−26: `Rig 4: Turbodrill. 1,000 DP · 12.5 ℓ/h · 80 DP per ℓ/h. Site level 10. The bit spins on mud pressure, not on the pipe.`
- **P-10 (T−25):** `Rig 5: Plasma Bore. 2,700 DP · 30 ℓ/h · 90 DP per ℓ/h, the most fuel-efficient rig in Gen-1. It costs more per Drill Power and saves diesel every hour. Bigger rigs buy efficiency, not a shortcut. That rule lives in the contract.`
- **P-08 (T−26):** `Meet Foreman Mo. Hard hat, headlamp, zero patience for shortcuts. Runs safety on every shift, counts every litre twice, and can't read a price chart. He reads the bore log just fine.`
- **P-11 (T−24):** `Survey: once a day, free. Your crew goes out and comes back with something for your Core Collection: a core sample, a fossil, an old drill bit. Finish a set for a title and site decor. Nothing in Mohonaut is a paid roll. No packs, no upgrade gambles.`
- **P-12 (T−23):** `Crews: 5 to 25 drill sites under one banner. Crew ranks, banners and seasons are cosmetic. Emission is never split by crew; your share is always your Drill Power ÷ the network's.`

**Testnet Season 0**

- **P-13 (T−29):** `Testnet Season 0 starts [Day] at 15:00 UTC. Real contracts, test ETH from our own faucet, the whole game. Finish five milestones for a Pioneer badge: cosmetic, non-transferable, carried to mainnet as a cosmetic only. Rules: mohonaut.com/season0`
- **P-05 (T−29, thread):**
  1. `Season 0 rules, so nobody has to guess.`
  2. `No like, repost or reply tasks. No XP leaderboard. Nobody pastes a wallet address into a form. You play the game; the game is the proof.`
  3. `Pioneer milestones: first fuel, first rig, site level 3, first refine, join a crew. That's it.`
  4. `Testnet ETH and testnet $MOHN have no value, by design. The badge gives no tokens, no priority and no in-game advantage. It's a badge.`
  5. `You get one invite link. One level only: your invites' invites don't count for you. Accounts flagged by bot checks don't get badges, and we publish how many we flagged.`
- **P-14 (T−28, sabit):** `Testnet Season 0 is live. Break it. Every bug you report makes mainnet safer, and five Pioneer milestones are waiting. Testnet only: nothing here has value. mohonaut.com/play`
- **F-07 (T−28):** `Season 0, hour one (testnet, our indexer): [n] drill sites, [b] bugs reported, [f] already fixed. Thank you. Rig Notes #1 tomorrow. Keep breaking things.`
- **P-15 (T−27, şablon):** `Rig Notes #[n]. Fixed: [..]. Changed: [..]. Known issues: [..]. Existing rig stats: unchanged. Details: mohonaut.com/status`
- **P-06 (T−22, T−19, T−15; şablon):** `Season 0, [date] 15:00 to [date] 15:00 UTC (testnet; source: Mohonaut indexer): [N] drill sites, [P] Pioneer badges earned, [B] bugs fixed, [F] accounts flagged by bot checks. We'll keep publishing both numbers.`
- **P-19a (T−21):** `Our contracts have been public for two weeks. Try to break them. Scope, rules and bounty terms: mohonaut.com/security. Findings go through GitHub or the form there, never DMs.`
- **P-37 (T−8):** `Season 0 is closed. [P] Pioneer badges earned and [B] bugs fixed ([date] to [date] UTC, testnet, source: Mohonaut indexer). Badges carry over to your mainnet drill site as cosmetics. The testnet resets tonight. Thank you, Mohonauts.`

**Ekonomi kâğıdı**

- **P-16 (T−18, thread, sabit):**
  1. `The Mohonaut economy paper is out. Every formula, every limit, and the list of things nobody can change, including us: mohonaut.com/docs/economy`
  2. `Token: $MOHN. Hard cap 100,000,000. Premine 0. Each day 0.05% of the remaining reserve is mined: 90% to players by Drill Power, 5% team stream, 5% treasury.`
  3. `In-game $MOHN spend: 80% burned for good, 20% back to the reserve to be drilled again over the years. ETH from diesel: 55% buyback & burn, 30% protocol liquidity that can't be withdrawn, 15% operations.`
  4. `Guard rails in the token itself: at most 500,000 $MOHN can be minted per UTC day. An hourly breaker in the mining contract stops minting if more than 150,000 go out in 60 minutes.`
  5. `Adjustable settings have hard limits in code and wait 96 hours in a public queue. Upgrades wait 7 days. Live queue: mohonaut.com/timelock`
  6. `There is no $MOHN market until Market Open. Mohonaut is built on Robinhood Chain and isn't affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc.`
- **F-08 (T−18):** `I tried to write an economy that doesn't need me. Immutable token. Fixed emission schedule. Hard limits on every adjustable number, and a public 96-hour queue before any change: mohonaut.com/timelock. My selling policy for the team stream is in the paper too.`
- **P-18 (T−17):** `Shift Change #1 today at 17:00 UTC: the economy paper, line by line, with @onderyazici. Bring hard questions. Price questions get muted, nothing personal.`

**Güvenlik incelemesi ve lansman saati**

- **P-19 (T−12, iki gönderi):**
  - `Security review report is public. No paid audit yet, so here's what we did instead: a three-role AI review, formal proofs of the mint limits, 72-hour fuzz campaigns and [N] weeks of public review. [x] findings, all fixed and retested: mohonaut.com/security`
  - `What limits the damage if we missed something: a 500,000 $MOHN daily mint cap in the token, an hourly mint breaker, ETH swept out of contracts daily, and an emergency pause that ends on its own after 72 hours. The site says "Unaudited" until an independent audit is done.`
- **F-09 (T−12):** `I'd rather say it plainly: Mohonaut launches without a paid audit. An independent audit is the first big thing operations revenue pays for, and the "Unaudited" banner stays until it's done. The finding I'm least proud of, and how we fixed it: mohonaut.com/security#[id]`
- **P-20 (T−10, sabit):** `Genesis Dig: [Day, Month Date], 15:00 UTC.` / `T−7d: contracts deployed and verified` / `T−24h: Pre-fill. Set up your drill site, fill your tank` / `T0: drilling starts, refining closed` / `T+72h: Market Open. Anyone can call openMarket()` / `The team buys nothing. mohonaut.com/docs/genesis`
- **P-21 (T−10) [avukat]:** `How the opening ratio is set: Genesis fuel spend ÷ $MOHN accrued by players during Genesis. At Market Open the contract pairs protocol-owned ETH with up to 1,000,000 $MOHN from the reserve at that ratio. The position can't be withdrawn. Nobody picks the number, including us.`
- **F-10 (T−10):** `I picked a date I can keep. If a gate fails (a security fix, a legal check, a Season 0 bug), I'll post a new date with an hour-by-hour plan the same day. No silent slips.`

**Kontratlar ve Genesis hazırlığı**

- **P-22 (T−7, kalıcı sabit, 2 gönderi):**
  1. `Mohonaut mainnet contracts are deployed and verified.` / `$MOHN token: 0x[40 hex]` / `Supply right now: 0. Only the mining contract can mint, never more than 500,000 per UTC day.` / `There is no pool. It only exists after Market Open.`
  2. `This account and mohonaut.com/contracts are the only places we post addresses. Every role, Safe signer and timelock delay is listed there. Live timelock queue: mohonaut.com/timelock`
- **F-11 (T−7, P-22'yi alıntılar):** `Our token address is public a week early because there's nothing to snipe. Supply is zero until people drill, and there's no pool until the contract makes one. Verify it yourself on Blockscout.`
- **P-36 (T−6):** `Getting ETH onto Robinhood Chain for Mohonaut: mohonaut.com/docs/eth. We only list bridges and on-ramps named in Robinhood Chain's official docs. A Pilot Rig burns about $0.60 of diesel a day, so $2–5 of ETH is plenty to start. Never use a bridge link from a DM or a reply.`
- **P-38 (T−4):** `Pre-fill, explained. 24 hours before Genesis you can open your drill site and fill your diesel tank in one transaction. During Pre-fill and Genesis a tank holds at most enough fuel to last until 24 hours after Market Open. That keeps the opening ratio honest.`
- **P-23 (T−3):** `Genesis checklist:` / `1. Log in at mohonaut.com/play (wallet or email)` / `2. Pre-fill opens [time] UTC: one transaction sets up your site, free Pilot Rig and tank` / `3. Drilling starts for everyone at once` / `4. Don't buy anything called $MOHN. There is no market yet.`
- **P-24 (T−1):** `Pre-fill is open. One transaction: your drill site, your free Pilot Rig and a full tank. Drilling starts in 24 hours, [time] UTC, for everyone at once. Refining stays closed for the 72 hours of Genesis. mohonaut.com/play`

**Genesis 72 saat**

- **P-25 (T0):** `Genesis Dig is live. The World Bore is open: mohonaut.com/play. Contracts (unchanged since [date]): mohonaut.com/contracts. There is no $MOHN market yet. Anything you can trade today is fake.`
- **F-12 (T0):** `We're drilling. Thank you for the patience, the bug reports and the hard questions. I'm on a Space for the first hour. Known issues will be on mohonaut.com/status before they're anywhere else.`
- **P-26 (T0+1s / +6s, şablon):** `Genesis, hour [6] ([time] UTC; source: chain data via Mohonaut indexer): [N] drill sites · [X] Drill Power active · World Bore [y] m · [z] ℓ of diesel in tanks. Every number links to chain data: mohonaut.com/economy`
- **P-27 (T+1):** `Genesis day 1 ([date] 15:00 to [date] 15:00 UTC; chain data): [N] drill sites · [X] DP · World Bore [y] m · [b] bugs fixed. Refining opens at Market Open, in 48 hours. mohonaut.com/economy`
- **P-28 (T+2, thread):**
  1. `24 hours to Market Open. Exactly what happens:`
  2. `At [time] UTC anyone can call openMarket(). Our keeper calls it if nobody else does.`
  3. `The contract reads Genesis fuel spend and $MOHN accrued by players, computes the ratio, and creates the ETH/$MOHN pool with protocol-owned ETH.`
  4. `The pool position can't be withdrawn. The team doesn't buy. A brand-new pool is thin and can move sharply in either direction. That's a risk, not a forecast.` **[avukat]**
  5. `Refining opens at the same time: instant for an 8% fee (half burned, half back to the reserve) or free through the 72-hour queue. The token address doesn't change: mohonaut.com/contracts. Anything else is fake.`

**Market Open**

- **P-29 (T+3):** `Market Open: openMarket() was called at [time] UTC (tx [link]). Inputs: [E] ETH of Genesis fuel spend, [M] $MOHN accrued by players. The contract created the ETH/$MOHN pool with [a] ETH + [b] $MOHN. The protocol owns the position; it can't be withdrawn. Team purchases: 0.`
- **P-30 (T+3):** `Fake $MOHN pools are already showing up. The only $MOHN is 0x[...]. Check mohonaut.com/contracts before you sign anything. We will never DM you.`
- **F-13 (T+3):** `The market is open. I won't comment on price, today or later. My team-stream selling policy is public and unchanged, and every team withdrawal shows up in the 72-hour queue first. Back to fixing what you reported.`
- **P-39 (T+4):** `Refining, explained. Standard: free, 72 hours in a public queue. Fast: instant, 8% fee, half burned and half back to the reserve. Or skip it: unrefined $MOHN can be spent in game directly. Team and treasury use the standard queue only. mohonaut.com/docs/refining`
- **F-15 (T+5):** `A question I keep getting: when should you shut a rig down? When its diesel burn per hour costs more than its share of Drill Power is worth to you. Older, less efficient rigs hit that line first. That's not a bug. That's the game.` **[avukat]**

**Haftalık raporlar, Crews, sezon**

- **P-31 (T+7, şablon, 2 gönderi + rapor kartı görseli):**
  1. `Shift Report #[n] · [date] to [date] UTC · source: chain data via Mohonaut indexer` / `Mined: [x] $MOHN · Burned for good: [y] · Back to reserve: [z]` / `ETH from diesel: [r] → buyback & burn [a] / protocol liquidity [b] / operations [c]`
  2. `Net emission: [ne] · Sink ratio: [sr]` / `Top-10 drill sites' share of Drill Power: [g]%` / `Team & treasury refines in queue: [t] $MOHN` / `Timelock: [k] pending, mohonaut.com/timelock` / `Full report: mohonaut.com/economy/reports/[n]`
- **P-32 (T+10):** `Crews are open. Found one, join one, fly a banner. 5 to 25 drill sites per crew. Crew ranks are cosmetic, and emission is still split only by Drill Power. mohonaut.com/crews`
- **P-33 (≈T+20, eşik geçildiğinde):** `The World Bore just passed 1,000 m. The deepest hole people ever drilled, on the Kola Peninsula, stopped at 12,262 m in 1989. On the published schedule we reach the Kola Line around [month year]. That's an estimate, not a promise. Keep drilling.`
- **P-34 (T+21):** `Season 1: Regolith. About eight weeks. Ranks for World Bore contribution, fuel efficiency and crews. Rewards are badges, titles and site plaques, all cosmetic. Rules and scoring: mohonaut.com/seasons/1` *(Hazineden MOHN sezon ödülü düşünülürse hukuki gözden geçirme olmadan duyurulmaz. **[avukat]**)*
- **P-35 (T+28):** `30 days of drilling ([date] to [date] UTC, chain data): [N] drill sites, World Bore [y] m, [b] bugs fixed, [p] parameter changes, all via the 96h queue: mohonaut.com/timelock. Shift Report #4 + the first monthly ops report (where ops ETH went): mohonaut.com/economy`
- **F-14 (T+30, thread iskeleti):** `30 days of Mohonaut. What worked, what broke, what I'd do differently.` → 2/ `What worked: [..]` → 3/ `What broke: [..] and how we fixed it` → 4/ `What I got wrong: [..]` → 5/ `What's next, tied to the bore, not to dates: [..]`

---

## 6. Hukuken güvenli dil rehberi

> **ÖNEMLİ — HUKUKİ GÖZDEN GEÇİRME ŞART:** Bu bölüm bir başlangıç listesidir, hukuki görüş değildir. Final ifadeler, şablonlar ve Türkçe iletişim kuralları Türk sermaye piyasası + şans oyunları alanında en az tek seferlik danışmanlıkta gözden geçirilmelidir; ABD/AB erişimi ayrıca değerlendirilir. Danışmanlık yapılamazsa kurucu riski yazılı olarak üstlenir (04 §8) ve **[avukat]** işaretli taslaklar en temkinli alternatifleriyle değiştirilir. Dayanak: araştırma raporu "Hukuki çerçeve" ve "Asla yapmamamız gerekenler" (2, 3, 4, 13). Örnek riskler: Texas'ın NFT başına kâr projeksiyonu yapan bir projeye acil durdurma emri; MiCA md. 4(4)'te işlem görme niyetinin duyurulmasıyla muafiyetlerin düşmesi; Türkiye'de lisanssız kripto hizmeti tanıtımı ve pump amaçlı tanıtımın (SPK md. 107) yaptırımları; TKHK md. 62 kapsamında etiketsiz reklam cezaları.

### 6.1 Yasak ifadeler ve onaylı alternatifler

| Yasak (EN) | Yasak (TR) | Neden | Onaylı alternatif |
|---|---|---|---|
| ROI, APY, APR, yield, returns, profit, "earn X per day", "earn $MOHN", mining rewards (getiri anlamında) | getiri, kâr, kazanç, "günde X kazan" | Kâr beklentisi = yatırım sözleşmesi riski | `Your share of each hour's emission = your active Drill Power ÷ the network's. Formula: [link]` |
| passive income, "money while you sleep" | pasif gelir | Aynı | `It's an idle game: your rigs keep drilling while you're away.` (oyun anlatımı, para değil) |
| guaranteed, risk-free, safe investment, "audited", "secure" (denetim yokken) | garantili, risksiz, güvenli yatırım, denetlendi | Vaat; yanıltıcı güvenlik iddiası | `Unaudited. What we did instead, and the limits in code: mohonaut.com/security` |
| "pays for itself in X days", payback, break-even | "X günde kendini çıkarır", amorti | Getiri projeksiyonu | Verim yalnızca oyun biriminde: `90 DP per ℓ/h`. USD/zaman bazlı geri dönüş hesaplayıcısı yok |
| price targets, "$1 soon", floor, undervalued, pump | fiyat hedefi, taban, "uçacak", "pump" | Piyasa manipülasyonu / fiyat beklentisi | Alternatif yok. **Fiyat konuşulmaz.** Tek istisna, hukuki gözden geçirmeli risk cümlesi (P-28/4) |
| "listing soon", "CEX listing", "[borsa adı] next" | "listeleniyor", "borsaya geliyor" | MiCA 4(4); listeleme beklentisi | `Market Open is when the contract creates the pool. [mekanizma linki]` |
| 100x, moon, "to the moon", gem, "early = rich", "don't miss", "last chance" | x katı, erken giren kazanır, kaçırma | FOMO, kâr beklentisi | `Genesis starts [date] at [time] UTC.` · "moon" yalnızca sabit slogan **"Not the moon. The Moho."** içinde |
| investment, investors, holders, bags | yatırım, yatırımcı | Yatırım çerçevesi | players, Mohonauts, Crews |
| airdrop, free tokens, claim (pazarlama veya oyuncu arayüzünde) | airdrop, bedava token | Ücretsiz dağıtım istisnaları ve kişisel veri karşılığı dağıtım; cüzdan uyarısı tetikleyicisi (09 §6) | `There is no airdrop.` · çekim için `Refine` |
| verify wallet, validate, sync, revoke, connect to claim | cüzdanını doğrula | Oltalama kalıpları; cüzdan güvenlik tarayıcılarını tetikler | `Log in` (SIWE: "This signature only logs you in. It cannot move funds.") |
| presale, whitelist allocation, private round | ön satış, WL tahsisi | Yoklar; "ilk satış" riski | — |
| play-to-earn, mine-to-earn, drill-to-earn | oyna-kazan | Kazanç çerçevesi | play, drill, core |
| revenue share, dividends, real yield, "buyback will pump" | kâr payı, temettü | Kâr paylaşımı = menkul kıymet göstergesi | `ETH from diesel is routed: 55% buyback & burn, 30% protocol liquidity, 15% operations. Published weekly.` |
| lottery, jackpot, lucky, loot box, gacha, mystery box | piyango, şanslı kutu, çekiliş | 7258/5602, TCK 228 riski | `Survey (free, cosmetic, once a day)` |
| Testnet ödül vaadi ("testnet points convert", "early tester allocation") | testnet ödülü | ToS §2.5: testnet tokenlarının değeri yok; ayrıca ödül vaadi | `Testnet only: nothing here has value. The Pioneer badge is cosmetic.` |
| Kaynaksız büyüme iddiası ("10,000 players!", "fastest-growing") | kaynaksız sayı | ToS §5.7(k): yöntem, dönem ve kaynak zorunlu | `[N] drill sites with fuel, [date] to [date] UTC, source: chain data via Mohonaut indexer [link]` |
| "Robinhood's game", "official Robinhood …", "powered by / partnered with Robinhood", Robinhood veya Robinhood Chain logosu/tüyü, ad/handle/domain/token metadata'sında "Robinhood", "RH", "hood"; AI görsellerinde Robinhood işaretleri; "tokenized stocks" | — | ToS §5.6, §5.7(b), (d), (h), (i), (j) | Yalnızca `Built on Robinhood Chain` (ya da "Deployed on / Compatible with") + topluluk kanallarında `Mohonaut is not affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc.` Stock Tokens konusuna hiç girilmez |
| Rakip proje adı, ticker'ı, handle'ı ya da imâsı | — | Kurucu kararı (§6.4b) | Kendi doğrulanabilir özelliklerimiz |

### 6.2 Türkçe iletişim kuralları (kurucu ve tüm ekip)

1. Türkçe içerikte **$MOHN, CA, fiyat, market, rafine, "al/sat", "listeleme" geçmez.** Türkçe yalnızca oyunun geliştirilmesi, mekaniği ve görselleri.
2. Türkçe "token al" çağrısı, Türkçe token pazarlaması, Türk kullanıcıya özel kampanya, TL ödeme entegrasyonu, Türkçe arayüz ve **Türkçe ETH/token edinme rehberi** hukuki gözden geçirme olmadan **yok** (09 §5; araştırma raporu: bunlar hedefleme göstergesi sayılıyor).
3. Oyun içinde swap/borsa/saklama yok. Site, Market Open sonrasında "where to trade" linki vermez.
4. Türk içerik üreticileriyle herhangi bir değer aktarımlı işbirliği: `#reklam` veya `#işbirliği` gönderinin başında; token içeriği yok.

### 6.3 Görsel ve format yasakları

- **Hukuki/finansal:** USD kazanç grafikleri, "profit calculator", para/altın yığını, roket/Lambo/ay görselleri, geri sayım + "kaçırma" kombinasyonu, fiyat grafiği RT'leri, "next 100x" alıntıları.
- **Marka (01 §7, §2):** yeraltı tüneli/şaft/asansör, kazma sallayan karakter, mücevher/kristal/damar, astronot/uzay kaskı, pastel ve mor tonlar, Robinhood işaretleri (AI üretimi medyada da).

### 6.4 İşbirliği ifşası

- Her türlü değer aktarımında (para, token, ETH, değerli kozmetik, öncelikli erişim) gönderinin **başında** `#ad` / `#reklam` / `#işbirliği`. "NFA", "DYOR" ifşa değildir.
- Kamuya açık /collab kaydı (tarih, hesap, değer, link).
- Davet linki içeren her paylaşım: `(my invite link)`.
- X'te kripto için Paid Partnerships etiketi kullanılamıyor (2026-03-01'den beri); ücretli tanıtım yalnızca resmî X Ads ile, izin verilen ülkelerde, hukuki gözden geçirmeyle ve yalnızca gelirle (08 §3).

### 6.4b Rakip adları: herkese açık hiçbir yerde yok (kurucu kararı, 2026-10-10)

- Rakip projelerin (liste: `research_notes/rakip-karsilastirma.md`; metin denetiminde SHA-256 özetleri) adları, ticker'ları, handle'ları ve görselleri **sitede, oyun içinde, dokümantasyon sitesinde, X gönderilerinde, X Spaces konuşma metinlerinde, logo ve görsel prompt'larında, hibe başvurularında ve basın metinlerinde geçmez.** Dolaylı ima da yok ("diğer madencilik oyunlarının aksine…", "PC oyunu gibi değil" vb.).
- Oyun mekaniği, görselleri ve isimlendirmesi de bu projelere benzememeli (CLAUDE.md).
- Farkımızı rakibi anarak değil, **kendi doğrulanabilir özelliklerimizle** anlatırız: "No presale. No team buy. Every token comes out of the ground." / "Every contract verified a week before Genesis." / "Existing rigs never change." / "Every change waits 96 hours in a public queue."
- Rakip karşılaştırmaları yalnızca iç dokümanlarda kalır (`research_notes/` ve `reports/`; repo açılmadan önce özel repoya taşınır). Bu bölümler hiçbir zaman herkese açık siteye veya herkese açık dokümantasyon klasörüne kopyalanmaz.
- Teknik uygulama: web içeriği, MDX dokümanları ve `docs/tweets` altındaki gönderi taslakları için CI'daki yasaklı kelime kontrolü (06 → 4.2) bu adları, §6.1'deki yasak ifadeleri, §2.2'deki kullanılmayan marka terimlerini ve "$MOHO"yu yakalar.

### 6.5 Yayın öncesi kontrol listesi (12 soru)

1. Bir rakip projenin adı, ticker'ı, handle'ı geçiyor ya da ima ediliyor mu? (Geçiyorsa yayımlanmaz.)
2. Fiyat, getiri, zaman-içinde-geri-dönüş ya da listeleme ima ediyor mu?
3. Rastgele + ücretli + değerli üçlüsünden ikisini birden çağrıştırıyor mu?
4. Türkçe ise token/CA/fiyat içeriyor mu?
5. Değer aktarımı var mı, varsa etiket başta mı?
6. Her sayı zincir verisine ya da dokümana bağlanıyor mu; büyüme metriğinde **yöntem, dönem ve kaynak** yazıyor mu (ToS §5.7(k))?
7. Robinhood'dan söz ediliyorsa yalnızca "Built on Robinhood Chain" kalıbı mı; topluluk kanalında tam uyarı var mı; görselde Robinhood işareti yok mu?
8. Yönetişimden (parametre, yükseltme, timelock) söz ediyorsa doğru gecikme (96 saat / 7 gün) ve `mohonaut.com/timelock` linki var mı?
9. Ekonomi rakamları 02 v1.0 ile birebir aynı mı (90/5/5, 80/20, 55/30/15, 500K günlük tavan, 150K saatlik kesici, %8 / 72 saat, ≤ 1M LP)?
10. Oyuncuya dönük metinde "claim", "airdrop", "verify wallet", "sync", "revoke" var mı?
11. Marka dili doğru mu: $MOHN (asla $MOHO), Mohonaut, dizel/ℓ (energy/kWh değil), drill site (outpost değil), World Bore (World Depth değil)?
12. Duyurulmuş bir rakamı değiştiriyor mu? (Değiştiriyorsa yayımlanmaz; önce kurucu, sonra hukuki gözden geçirme.)

Onay akışı: Şablonlar (P-xx/F-xx) toplu olarak önceden gözden geçirilir → şablon dışı her yeni metin aynı kontrolden geçer → olay şablonları (§7.3) acil durum için önceden onaylıdır.

---

## 7. Lansman günü iletişim runbook'u ve olay şablonları

### 7.1 Roller

| Rol | Kim | Sorumluluk |
|---|---|---|
| Ses | Kurucu | Space, kurucu gönderileri, kararlar, özür |
| İletişim operatörü | Gönüllü / ekip üyesi (kurucu olmamalı) | Proje hesabı, Telegram aynası, /status güncellemeleri, hazır taslakları yayımlama |
| On-call geliştirici | Ekip üyesi veya kurucu | Kontrat/keeper/indeksleyici/site; olay sınıflandırması; Guardian Safe imzacısı |
| İzleme | Gönüllü veya otomatik uyarılar | /economy, mint tavanı ve devre kesici, oracle, Blockscout, DexScreener/GeckoTerminal'de sahte havuz taraması, MetaMask taraması |
| Moderasyon | Gönüllü | Yanıt temizliği, taklit raporlama, /support kuyruğu |

Sıfır bütçe gerçeği: Tek kişilik bir kurucu bu günlerde **en az 2 kişiyle** çalışmalı (gönüllü bir arkadaş bile olur); aksi halde moderasyon ve izleme OZ Monitor / Uptime Kuma / Telegram bot uyarılarına devredilir. Kural: **önce /status, sonra X**; X'e giden her olay bilgisi /status'ta zaten yazılıdır.

### 7.2 Dakika dakika akış (örnek T0 = 15:00 UTC)

**Lansman öncesi (cüzdan uyarısı ön temizliği, 09 §6)**

| Zaman | Eylem | Kanal |
|---|---|---|
| T−7 | Deploy + doğrulama (Blockscout + Sourcify) + Handover; /contracts ve /timelock yayında; Blockaid "Developer – verify a project" başvurusu; Reown allowlist; Search Console; /docs/refining dondurulur | Zincir, site |
| T−7 → T−1 | Günlük sahte token/domain taraması (x-radar, GeckoTerminal, DexScreener, domain izleme) | İç |
| T0−24s | MetaMask dapp-scanning API saatlik kontrolü başlar; yanlış pozitif başvuru şablonları doldurulmuş hazır | İç |

**Genesis**

| Zaman | Eylem | Kanal |
|---|---|---|
| T0−24s (15:00, bir önceki gün) | Pre-fill açılır; P-24 | X, TG, /status |
| T0−6s | Go/no-go #1: kontratlar, keeper, oracle, RPC, indeksleyici, site yük testi, mint tavanı/kesici panoları; taslaklar yüklü | İç |
| T0−2s | Sahte token/hesap taraması (x-radar, GeckoTerminal, DexScreener) | İç |
| T0−60dk | Go/no-go #2 (G5); /status: "Genesis in 60 minutes" | /status |
| T0−30dk | Proje: `30 minutes to Genesis. Checklist: [P-23 link]. There is no $MOHN market.` | X, TG |
| T0−15dk | Space #3 başlar (kurucu; sabit açılış metniyle) | X Spaces |
| T0−5dk | Keeper ve `poke()` hazır; operatör P-25'i kuyrukta tutar | İç |
| **T0** | Kazım açık → P-25; TG aynası; /status "Genesis live" | X, TG, /status |
| T0+2dk | F-12 (kurucu, P-25'i alıntılar) | X |
| T0+5dk | İlk işlemlerin başarısı kontrol; sorun varsa ≤ 10 dk içinde "known issue" şablonu | /status → X |
| T0+15dk | Moderasyon taraması (sahte destek yanıtları gizlenir); MetaMask taraması | X, iç |
| T0+30dk | /status güncellemesi (yeşil/sorunlar) | /status |
| T0+60dk | P-26 (1. saat sayıları, kaynak ve dönemle); Space biter, kayıt linki | X |
| T0+6s, +12s | P-26 (6. saat), gerekirse Rig Notes | X |
| T0+24s | P-27 | X, TG |
| T0+48s | P-28 thread'i; Market Open provası (fork) | X |

**Market Open (MO = T0+72s = 15:00 UTC, T+3)**

| Zaman | Eylem | Kanal |
|---|---|---|
| MO−2s | Sahte havuz taraması; P-30 adresle hazırlanır | İç |
| MO−60dk | Go/no-go: oracle taze, POL ETH bakiyesi doğru, `openMarket()` fork simülasyonu başarılı, bugünkü mint tavanında LP basımı (≈ 40K, ≤ 1M) için yer var | İç |
| MO−15dk | Proje: `Market Open in 15 minutes. The token address doesn't change: mohonaut.com/contracts` | X, TG |
| **MO** | `openMarket()` çağrısı (herhangi biri; değilse keeper tam zamanında) → onay beklenir → havuz Blockscout'ta doğrulanır | Zincir |
| MO+5dk | P-29 (tx linki + girdiler) | X, TG, /status |
| MO+10dk | P-30 sahte havuz uyarısı | X, TG |
| MO+30dk | F-13 | X |
| MO+60dk | /status: rafineri açık, kuyruk sayıları, bugünkü mint / 500K; fiyat **yok** | /status |
| MO+24s | Space #4 | X Spaces |

**Lansman günü yasakları:** fiyat yorumu, fiyat grafiği RT'si, şaka da olsa "buy", parametre değişikliği (zaten 96 saat timelock'lu), yeni mekanik duyurusu, ani kontrat veya arayüz değişikliği (cüzdan uyarısı riski; gerekçe §9).

### 7.3 Olay şablonları (İngilizce; önceden gözden geçirilmiş)

**Ciddiyet ve süreler:**

| Seviye | Örnek | İlk bildirim | Güncelleme sıklığı |
|---|---|---|---|
| S1 | Exploit şüphesi, fon riski, Guardian pause, saatlik mint devre kesicisinin tetiklenmesi | ≤ 15 dk | 60 dk'da bir |
| S2 | Çekirdek fonksiyon bozuk (yakıt alımı, rafine, `poke`), oracle bayatlığı, cüzdan uyarısı (BLOCK) | ≤ 30 dk | 2 saatte bir |
| S3 | Arayüz hatası, tek cihazda sorun, günlük mint tavanının dolması | ≤ 2 saat | Çözülünce |
| Gecikme | Kapı geçilemedi | Karar verildiği gün | Yeni plan + günlük |

**Gecikme (delay):**
```
Genesis is moving from [old date/time] to [new date/time] UTC.
Why: [one sentence: which gate didn't pass].
What doesn't change: contracts, the order of steps, Pre-fill rules, the opening formula.
Your drill site and tank: [state, e.g. "untouched; nothing is drilling yet"].
Hour-by-hour plan: mohonaut.com/status. Next update: [time] UTC.
```

**Hata (kritik olmayan):**
```
Known issue: [symptom] on [platform/wallet].
Not affected: your Drill Power, your diesel and your accrued $MOHN. On-chain state is fine.
Workaround: [step]. Fix expected: [time] UTC.
Tracking: mohonaut.com/status. Reports go to mohonaut.com/support, never DMs.
```

**Exploit / pause (S1):**
```
We paused [module] with the guardian role at [time] UTC after detecting [behavior, one line].
Still working: [list]. Paused: [list]. The pause ends on its own at [time + 72h] UTC; only the public timelock can extend it.
Funds and accruals: [what we know now / "still assessing"].
Do NOT use any "fix", "refund" or "migration" link you see in replies or DMs. We will never DM you.
Next update by [time] UTC on mohonaut.com/status. A full post-mortem follows within 72 hours.
```
Kural: Guardian yalnızca pause eder (≤ 72 saat, kendiliğinden biter); uzatma ve her düzeltme 96 saatlik timelock kuyruğundan (kontrat yükseltmesi 7 gün) geçer (`mohonaut.com/timelock`) ve /security'de görünür.

**Saatlik mint sınırı (S2; kontrattaki davranışa göre düzeltildi, 2026-10-12):** Sınır bir şalter değil, hız sınırıdır. Son 60–65 dakikada basılan miktarı 150K'nın üstüne çıkaracak bir mint geri döner (`MintWindowFull`) ve **sonra yeniden denenebilir**. Kimse mintleri başkaları için durduramaz ve sınırı sıfırlamak için timelock gerekmez (MiningCore NatSpec, invariant B1). Bu yüzden sınırın dolması tek başına S1 değildir. Sınır, beklenmedik bir mint artışıyla birlikte doluyorsa runbook 1 (anormal mint) uygulanır.
```
Refines are queuing for a moment: more than 150,000 $MOHN were minted in the last hour, the safety limit in the contract. Minting resumes by itself as the hour rolls on; anything that waits can simply be retried. Nothing in your unrefined balance is lost, and drilling continues as normal.
Live numbers: mohonaut.com/status
```

**Günlük mint tavanı doldu (S3):**
```
Today's mint cap (500,000 $MOHN per UTC day, fixed in the token) was reached at [time] UTC.
Standard refines that come due after that complete after 00:00 UTC, and fast refines are unavailable until then. Nothing is lost, and drilling continues as normal.
Live numbers: mohonaut.com/status
```

**Oracle bayatlığı (S2):**
```
Diesel purchases are paused: the ETH/USD price feed has been stale since [time] UTC.
Running rigs keep drilling and tanks drain at the normal rate. Nothing else is affected.
Purchases resume automatically when the feed updates. No action needed.
Live status: mohonaut.com/status
```

**Cüzdan uyarısı (S2):**
```
Some wallets are showing a warning on mohonaut.com since [time] UTC. Our contracts are verified and unchanged: mohonaut.com/contracts.
We've asked the wallet security provider to review it. We will never ask you to ignore a wallet warning. If you're unsure, wait for the next update.
Only use mohonaut.com, typed by hand. Updates: mohonaut.com/status
```

**Zincir/sequencer kesintisi:**
```
Robinhood Chain is [degraded / not producing blocks] since [time] UTC. Mohonaut accrual is time-based, so your share is calculated from the schedule once blocks resume. Don't resend transactions repeatedly. Updates: mohonaut.com/status
```
(Zincir adının kullanımı olgusal bilgidir; §4.3 notu geçerli.)

**Taklit/sahte token alarmı:**
```
Heads up: an account/site/token pretending to be Mohonaut is live: [handle/domain, no clickable link].
The only official account is @playmohonaut. The only $MOHN address is on mohonaut.com/contracts. We never DM first and never ask you to "validate" a wallet.
```

**Çözüm + post-mortem:**
```
Resolved: [issue] as of [time] UTC.
What happened: [2–3 lines]. Impact: [who, how much, on-chain links].
What we changed: [list]. Any fix to contracts goes through the public timelock: mohonaut.com/timelock.
Refunds/compensation: [policy, from where, by when].
Full post-mortem: mohonaut.com/security/incidents/[id]
```
Kurucu, S1/S2 sonrası kendi hesabından kısa bir sorumluluk notu atar. Dürüst kötü haber güven inşa eder (araştırma raporu).

---

## 8. Pazarlama KPI panosu

Hedefler **hipotezdir**; Season 0 verisiyle T−10'da güncellenir. Kamuya açıklanan her KPI'da yöntem, dönem ve kaynak yazılır (ToS §5.7(k)). Kıyas noktaları (araştırma raporu ve notları): idle/madencilik oyunlarında D1 ~%25–55, D7 ~%20, D30 ~%10; Telegram oyunları %5–20. Rakip kıyasları §9'da.

| Aşama | KPI | Tanım / kaynak | Hedef (hipotez) | Alarm |
|---|---|---|---|---|
| Farkındalık | Proje hesabı takipçi büyümesi | X Analytics, günlük | T−1'de 10K+ | Haftalık büyüme < %10 (T−33 → T−8) |
| Farkındalık | Etkileşim oranı | (beğeni+RT+yanıt+alıntı)/görüntülenme | ≥ %2 | < %0.8 |
| Training Site | Oturum | `/train` benzersiz oturum (analitik, çerez onayıyla) | izlenir | — |
| Training Site | Tamamlama | Training Site'ta saha L3'e ulaşan / oturum | ≥ %30 | < %15 (tasarım sorunu) |
| Training Site | Season 0'a geçiş | `/train` → `/play` (testnet) kayıt | ≥ %15 | < %5 |
| Season 0 | **Doğrulanmış oyuncu** | Turnstile + küme analizi sonrası en az 1 yakıt alan hesap | T−8'de ≥ 5K | Günlük yeni doğrulanmış < 100 (T−25 sonrası) |
| Season 0 | İşaretlenen oranı | işaretlenen / toplam | < %30 | > %40 (faucet veya kampanya bot çekiyor) |
| Season 0 | Pioneer hunisi | ilk yakıt → ilk kule → L3 → ilk rafine → Crew (adım adım dönüşüm) | Rozet ≥ kayıtların %35'i | Herhangi bir adımda > %50 düşüş |
| Season 0 | D1 / D7 | Season 0 kohortu | ≥ %40 / ≥ %20 | < %25 / < %10 |
| Season 0 | Hata akışı | bildirim, çözüm süresi | S1/S2 = 0 açık @T−10 | Açık S1/S2 |
| Season 0 | Cihaz/cüzdan dağılımı, işlem hatası oranı | indeksleyici + istemci telemetrisi | hata < %2 | > %5 |
| Referans | K-faktörü | doğrulanmış davet / davet eden | 0.3–0.6 | > 1.5 (sybil şüphesi) |
| Genesis | Pre-fill hesapları | Pre-fill'de saha açıp yakıt alan | ≥ Season 0 doğrulanmış oyuncularının %30'u | < %15 |
| Genesis | İmzadan işleme düşüş | SIWE → `buyFuel` | < %20 düşüş | > %40 |
| Genesis | "ETH yok" ekranından dönüş | /docs/eth → ilk yakıt | izlenir | — |
| Mainnet | D1 / D7 / D30 | kohort, saha bazında | ≥ %40 / ≥ %20 / ≥ %10 | D7 < %10 |
| Mainnet | DAU, yeni/dönen | indeksleyici + site | izlenir | Yeni DAU 7 gün üst üste düşüş |
| Viral döngü | **Paylaşım kartı paylaşımları** | intent tıklaması + X'te `mohonaut.com/s/` araması | DAU'nun ≥ %3'ü/gün | < %1 |
| Viral döngü | Kart → kayıt dönüşümü | /s/ ziyaret → Training Site veya kayıt (UTM) | ≥ %5 | < %2 |
| İçerik | Shift Report erişimi | görüntülenme, /economy ziyareti | rapor başı ≥ 20K görüntülenme | — |
| İçerik | Space dinleyicisi | canlı + kayıt | ≥ 300 canlı | — |
| Kanal | Telegram duyuru abonesi | TG | izlenir | — |
| Destek | İlk yanıt süresi | /support | < 4 saat | > 12 saat |
| Olay | S1 bildirim süresi | olay kaydı | ≤ 15 dk | > 30 dk |
| Güven | Taklit hesap/site/token | x-radar + GeckoTerminal + DexScreener + domain izleme | tespit → rapor < 24 saat | Kaldırılmayan taklit > 72 saat |
| Güven | Cüzdan uyarısı | MetaMask taraması (NONE/WARN/BLOCK/VERIFIED), Phantom, Rabby | Hiç BLOCK yok | Herhangi bir BLOCK |
| Duygu | Örneklem analizi | Haftalık 100 rastgele bahsetme, elle etiket (olumlu/nötr/olumsuz, "ponzi/scam" geçişi) | "ponzi/scam" < %5 | > %15 |
| Ekonomi (salt okunur) | Gini, ilk 10 DP payı, NE, SR, RCR, günlük mint / tavan | /economy | `02` §13 hedefleri | `02` §12 müdahale eşikleri |

Pano: İndeksleyici + X Analytics + site analitiği (PostHog ücretsiz kademe veya self-host Plausible/Umami, çerez onayıyla) + haftalık elle duygu örneklemi. Haftalık Shift Report'la aynı gün iç değerlendirme.

---

## 9. Rakiplerden çıkarılan dersler

_İç karşılaştırma `research_notes/rakip-karsilastirma.md` dosyasına taşındı (iç notlarla birlikte özel repoda tutulur; CLAUDE.md rakip adı kuralı)._

## 10. Açık kararlar (sahibi)

| Karar | Sahibi | Not |
|---|---|---|
| Maskot adı: "Foreman Mo" korunsun mu? | Kurucu | Öneri: korunsun (§2.3). Alternatif: lore unvanı "toolpusher". Ad için çakışma taraması yapılmadı |
| Sezonların herkese açık adı | Kurucu + lead designer | 01 §4.8 sezonlara "Shifts" diyor; 09 ve bu doküman "Season" (Season 0) kullanıyor ve "Shift" haftalık rapor (Shift Report) ile Space'te (Shift Change) geçiyor. Öneri: herkese açık ad "Season"; 01'deki takma ad kaldırılsın |
| Katkı kartında birim | Lead designer | Küçük oyuncuların katkısı mm–cm düzeyinde (§3.4); < 1 m için cm/mm gösterimi ya da eşik |
| Kurucu satış politikası rakamları | Kurucu (+ hukuki gözden geçirme) | 02 §3.3 tavanlarının üstüne gönüllü politika; T−18'de yayımlanır |
| Token cinsinden referans kredisi ve hazineden MOHN sezon ödülleri | Hukuki gözden geçirme | Gözden geçirilene kadar metinlerde yalnızca "referral credit (see docs)" ve kozmetik ödüller |
| Bio'daki kısa Robinhood uyarısının yeterliliği | Hukuki gözden geçirme | Tam metin site, Telegram, Discord, sabit thread ve Space açılışında (§4.3) |
| P-21, P-28/4 ve F-15 metinleri | Hukuki gözden geçirme | Açılış oranı formülü, "thin pool" risk cümlesi, kule kapatma kararı |
| ABD/AB erişimi ve geo-block kapsamı | Hukuki gözden geçirme | 04 §7 |
| `@mohonaut`'un durumu | Kurucu | Bilinmiyor; izleniyor. Satın alma/devir yolu planı yapılmaz |
| Savunma domainleri ve X Premium / Verified Organizations | Kurucu | Yalnızca gelirle (08 §3 sıra 1) |
| TÜRKPATENT başvurusu (MOHONAUT + logo) | Kurucu | Gelirle; MOBONAUT ve "MOHO" sınıf 9 notları hukuki soru listesinde |

---

## Değişiklik günlüğü

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| v0.1 | 2026-10-10 | İlk taslak: isim kontrolleri (§1), marka, site, X, takvim, dil rehberi, runbook, KPI, dersler. Aynı gün ayrı sürüm almadan eklenenler: sıfır bütçe notu, rakip adı yasağı (§6.4b), bekleyen revizyon notu |
| **v0.3** | **2026-10-11** | **Mohonaut / $MOHN revizyonu.** İsim, ticker, sloganlar ("Not the moon. The Moho." birincil), topluluk adı Mohonauts; @playmohonaut + savunma hesapları; kanonik `mohonaut.com` (`.gg` yönlendirme); güncel rezervasyon listesi §0.1'e taşındı, §1 tarihsel kanıt olarak korundu ve başına not eklendi ($MOHO'nun Robinhood Chain'deki 4 ölü kontratla çakışması). Görsel konsept 01 v0.2'ye göre yeniden yazıldı: gece yüzey sondaj sahası, World Bore, kuyu logu imza öğesi, litoloji renk bantları, palet adları, VT323/CRT kaldırıldı, üç logo yönü ve tüm AI prompt'ları yenilendi (standart negatif liste). Dizel dili (ℓ, ℓ/h), yeni kule ve katman adları, sözlük ve kullanılmayan terimler listesi. Maskot adı korundu (gerekçeli). Paylaşım kartı World Bore katkısına çevrildi. Bekleme listesi kaldırıldı → Training Site + Testnet Season 0 + Pioneer rozeti; takvim T−42 → T+30 ve tüm tweet taslakları yeniden yazıldı. Timelock 96 saat / yükseltme 7 gün, canlı kuyruk linki (`/timelock`). Ekonomi rakamları 02 v1.0 ile eşlendi (55/30/15, 500K günlük mint tavanı, 150K saatlik kesici, ≤ 100K kurucu/hazine çekimi, Genesis tank sınırı). Sıfır bütçe: ücretli denetim kapısı "güvenlik incelemesi" kapısına çevrildi, "Unaudited" bandı ve gelirle denetim taahhüdü eklendi, ücretli kalemler opsiyonel. Robinhood ToS kuralları (Built on, uyarı, işaret yasağı, metriklerde kaynak/dönem). Cüzdan uyarısı ön temizliği (09 §6) site ve runbook'a işlendi; yeni olay şablonları (mint devre kesici, günlük tavan, cüzdan uyarısı). Rakip adları §2–§8'den çıkarıldı; §9 "İÇ KULLANIM" olarak etiketlendi ve ikinci rakip tablosu (§9.3) eklendi. §6 dil rehberi ve kontrol listesi (12 soru) genişletildi. Açık kararlar §10'a taşındı. "BEKLEYEN REVİZYON" notu kaldırıldı |
