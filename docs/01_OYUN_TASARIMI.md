# 01 — Oyun Tasarım Dokümanı (GDD v0.2)

> **Durum:** v0.2 — 2026-10-10. Ekonomi sayıları `02_TOKENOMI_VE_OYUN_MATEMATIGI.md` dosyasında; oyuncu girişi ve ilk oturum `09_ONBOARDING.md` dosyasında. Oyun **Mohonaut** ("Moho kâşifi"; kurucu onayı 2026-10-11, bkz. `ISIM_SPRINTI.md`), token **$MOHN**, hashpower **DP** (Drill Power).
>
> **v0.2 değişikliği (kurucu kararı: Robinhood Chain'deki diğer madencilik oyunlarına benzemesin):** Dikey yeraltı şaftı ve el aleti başlangıcı kaldırıldı. Yeni konsept, gece aydınlatmalı bir **yüzey sondaj sahası** ve bütün oyuncuların birlikte açtığı **tek bir ortak kuyu (World Bore)**. Enerji dili (kWh/kW) yerine **dizel yakıt** (litre, ℓ/h) kullanılıyor. Katman isimleri gerçek kabuk jeolojisinden alındı. Matematik değişmedi.

---

## 1. Vizyon

Dünyanın en derin kuyusunu herkes birlikte açıyor. Her oyuncu kendi **sondaj sahasını** (drill site) işletir: kuleler kurar, dizel tankını ETH ile doldurur ve ürettiği **Drill Power (DP)** oranında ortak kazımdan pay alır. Bütün sahaların açtığı metreler tek bir ortak kuyuda, **World Bore**'da toplanır. Kuyu derinleştikçe gerçek kabuk katmanlarından geçilir; yolda **Kola Line** (12,262 m, insanlığın gerçekte kazdığı en derin nokta) ve **Moho Line** (35,000 m, kabuk ile mantonun sınırı) var.

Ekonomi Bitcoin gibi işler: sabit ve yavaşça azalan emisyon, payına göre ödül, gerçek yakıt maliyeti. Getiri vaadi yoktur. Bütün kurallar önceden yayımlanır ve kontratta kilitlidir.

**Sloganlar:** "Not the moon. The Moho." / "Race to the Moho." / "Every token comes out of the ground." / "One bore. Every driller."

---

## 2. Konsept seçimi ve konumlanma (iç kullanım)

| Kriter | **A — Ortak Sondaj Sahası** (seçildi) | B — Yörünge Asteroit Filosu | C — Enerji Şebekesi + Veri Merkezi |
|---|---|---|---|
| Rakiplerden görsel ayrışma | **Çok yüksek**: gece ışıklı yüzey sahası + jeolojik kuyu logu | Yüksek (uzay/neon) | Düşük (donanım teması) |
| Ekonomiyle anlatı uyumu | **Mükemmel:** azalan emisyon = "derine indikçe kaya sertleşir"; arz = ortak kuyunun derinliği | İyi | İyi |
| Topluluk hedefi | Tek ortak kuyu, gerçek jeolojik kilometre taşları | Galaksi haritası | Şebeke kapasitesi |
| Üretim zorluğu (tek kişi + AI) | Orta (2.5D izometrik) | Orta-yüksek | Orta |

_İç karşılaştırma `research_notes/rakip-karsilastirma.md` dosyasına taşındı (iç notlarla birlikte özel repoda tutulur; CLAUDE.md rakip adı kuralı)._

---

## 3. Çekirdek döngü

```
       ┌────────────── Dizel doldur (ETH) ───────────────┐
       ▼                                                  │
  Kuleler çalışır → DP → ortak kazımdan pay (MOHN) ───────┤
       │                                                  │
       ▼                                                  │
  Rafine edilmemiş MOHN birikir (canlı sayaç)             │
       │                                                  │
       ├──► Yeniden yatır: kule al (VRGDA), sahayı büyüt, tier aç
       ├──► Optimize et: verimsiz kuleyi kapat, eski nesli hurdaya çıkar
       └──► Rafine et: 72s ücretsiz kuyruk veya %8 hızlı → cüzdana
                                                          │
  Sosyal katman: Crew, sezonlar, Survey koleksiyonları, World Bore katkı kartları
```

**Oyuncunun gerçek kararları:**
1. **Yatır mı, çek mi?** Rafine edilmemiş MOHN'u oyunda harcamak ücretsiz; çekmek ya bekleme ya ücret.
2. **Hangi tier?** Ucuz ama çok yakıt yakan T1 mi, primli ama verimli T5 mi? Cevap MOHN fiyatına ve dizel fiyatına göre değişir.
3. **Ne zaman kapatmalı?** DP başına gelir, DP başına yakıt maliyetinin altına düşerse eski kuleyi kapatmak kazandırır.
4. **Ped mi, yakıt hattı mı?** Saha seviyesi ikisini birlikte açar; kule karması iki kısıtı dengeler.
5. **Ne zaman almalı?** VRGDA fiyatı hedefin gerisinde düşer: sabırlı alıcı ucuza alır.

---

## 4. Sistemler

### 4.1 Sondaj sahası (Drill Site)
- Her cüzdan bir saha. Seviye 1–30. Seviye **ped** (kule yeri, slot) ve **yakıt hattı kapasitesi** (ℓ/h) verir (formüller: 02 §7).
- Görsel: gece, sodyum lambaları, buhar ve yağmur altında izometrik bir yüzey sahası. Kuleler, çamur pompaları, boru rafları, karot kulübesi. Her seviye sahaya yeni bir ped veya yapı ekler.
- Kişisel "kaç metre aşağıdayım" göstergesi **yok**. Derinlik ortaktır (§4.6).
- Saha ve kuleler hesaba bağlıdır, transfer edilemez (v1).

### 4.2 Kuleler (makineler)
- Gen-1: **Pilot Rig** (ücretsiz başlangıç, küçük motorlu kule) → Rotary Rig → Top Drive → Diamond Core Drill → Turbodrill → Plasma Bore.
- Üç istatistik: **DP**, **yakıt tüketimi (ℓ/h)**, **verim (DP/(ℓ/h))**. Yüksek tier daha verimlidir ve ped başına daha çok DP verir, ama DP başına daha pahalıdır.
- Her kule tek tek açılıp kapatılabilir.
- **Nesiller:** Yeni katmanlar açıldıkça yeni nesil eklenebilir (verim ≤ önceki en iyi +%15). Eskiler asla değiştirilmez.
- **Hurda:** Söküm %20 hurda kredisi verir (yalnızca alımda kullanılır).

### 4.3 Dizel deposu
- Tank modeli: litre satın alınır (ETH ile, USD sabit fiyat), aktif kuleler saat saat yakar.
- Arayüz: "Tank: 432 ℓ · current burn 12 ℓ/h · runs until Nov 12 14:00".
- Bildirim: tank %20'nin altına inince e-posta/Telegram bot.
- Oracle sorunu → yalnızca satın alma durur; çalışan kuleler etkilenmez.

### 4.4 Ekipman pazarı (VRGDA mağazası)
- Canlı fiyat: "1 DP = 9.42 MOHN (target −6%, price falling)".
- Toplu alımda kapalı form maliyet gösterilir; işlem başı üst sınır var. Son 7 günün fiyat grafiği şeffaflık için açık.

### 4.5 Rafineri
- Standart: 72 saat, ücretsiz. Hızlı: %8 (yarısı yakılır, yarısı rezerve döner).
- Kuyruk görünür; süre dolunca tek tıkla alınır (veya keeper otomatik tamamlar).

### 4.6 World Bore (ortak kuyu) ve katmanlar
- Ekranın kenarında oyunun imza öğesi: **kuyu logu**. Dikey bir karot sütunu; jeolojik katman bantları, metre işaretleri ve "şu an buradayız" çizgisi.
- Örnek: "World Bore: 1,184 m · Stratum I — Regolith · Next: Sediment Cover at 2,000 m".
- Katmanlar (02 §3.4): Regolith → Sediment Cover → Granite Basement → **Kola Line** → Archean Gneiss → Granulite Floor → **Moho Line** → Peridotite Zone → Asthenosphere → The Core.
- Her oyuncunun **katkısı** gösterilir: "You've cored 1,240 m of the World Bore". Bu kişisel bir derinlik değil, ortak kuyuya katkıdır.
- Eşik geçişleri topluluk etkinliğidir: yeni katman paleti, müzik, karot koleksiyonu, yeni nesil kule uygunluğu, sezon başlangıcı.

### 4.7 Crew (ekip)
- 5–25 kişi. Crew sancağı ve saha dekoru, crew'un World Bore'a katkı sıralaması, rozetler.
- Crew ekonomiye dokunmaz (DP havuzlama yok); yalnızca sosyal ve kozmetik.

### 4.8 Sezonlar ("Seasons"; ilki testnet'teki Season 0)
- ~8 hafta. Sıralamalar: World Bore katkısı, ortalama verim, crew, başarımlar.
- Ödüller: transfer edilemez rozet ve unvanlar + hazineden (%5 emisyon payı) önceden ilan edilmiş küçük MOHN ödülleri. Yeni emisyon basılmaz.

### 4.9 Survey ve Karot Koleksiyonu (ücretsiz, kumarsız)
- Günde 1 ücretsiz "Survey": kozmetik buluntu (fosil, karot numunesi, eski matkap ucu, tarihî sondaj ekipmanı). Ücret yok, satılamaz, ekonomik değeri yok → şans oyunu unsuru yok.
- Setler tamamlanınca unvan ve saha dekoru. Günlük giriş sebebi; ekonomiyi etkilemez.

### 4.10 Başarımlar, unvanlar, profil
- "Spud-In" (ilk yakıt; sondajcılıkta kuyuya başlamak), "Fuel Saver" (ortalama verim ≥ 80), "Kola Witness" (Kola Line geçilirken aktif), "Core Collector" vb.
- Herkese açık profil: saha görüntüleyici (cüzdan gerekmez), rozetler, crew, World Bore katkısı.

### 4.11 Katkı kartları (paylaşım)
- Otomatik görsel: "I've cored 1,240 m of the World Bore · Crew X · World depth 9,870 m · Race to the Moho" + davet linki.
- Birim: 1 m'nin altındaki katkılar cm/mm olarak gösterilir (ilk haftalarda küçük oyuncunun katkısı mm–cm düzeyinde).
- Kişisel hashrate veya sıralama değil, **ortak kuyuya katkı** öne çıkar. **Kazanç/USD rakamı içermez.**

### 4.12 Referans
- Tek seviye. Davet eden, davet edilenin madenci tahakkukunun %3'ünü **hazine payından** alır (davet edilenden kesilmez).
- Koşul: davet edilen ≥ 0.003 ETH yakıt almış olmalı.

### 4.13 Kozmetik mağaza (madenci dışı gerçek gelir)
- Saha temaları, kule boyaları, maskot kostümleri, profil çerçeveleri, sezon kozmetik paketleri (içeriği önceden belli, **rastgelelik yok**).
- ETH ile alınanlar madenci dışı gerçek gelirdir. MOHN ile alınanlar %100 yakılır.
- **Hiçbir kozmetik DP, verim veya emisyon payı vermez.**

---

## 5. İlerleme haritası

| Zaman | Oyuncu ne yapar | Hedef his |
|---|---|---|
| Lansman öncesi | Testnet Sezon 0'da gerçekten oynar (09 §3) | "Bunu anlıyorum, hazırım" |
| İlk 5 dk (mainnet) | Cüzdan/e-posta ile giriş → tek işlemde saha + Pilot Rig + ilk yakıt (≈ $1) → sayaç akar | "Çalışıyor" |
| İlk saat | İlk MOHN ile L2'ye çıkar, ilk Rotary Rig'i alır | İlk büyüme |
| İlk gün | 4 pedi doldurur, T2 için L3'ü hedefler, crew'a katılır, ilk Survey | Hedef ve topluluk |
| İlk hafta | Verim hesabını öğrenir (T2/T3), ilk standart rafine | Strateji |
| İlk ay | L10, Turbodrill, sezon sıralaması | Ustalık |
| 3+ ay | Nesil yükseltmeleri, katman kutlamaları, Kola Line etkinliği | Aidiyet |

---

## 6. Ekranlar

1. **Landing** (giriş yapmadan): canlı World Bore logu, nasıl çalışır, ekonomi özeti, CTA.
2. **Saha (ana ekran):** izometrik saha, kuleler, canlı MOHN sayacı, tank göstergesi; sağda kuyu logu.
3. **Ekipman pazarı:** tier kartları (DP, ℓ/h, verim, fiyat, kilit), VRGDA grafiği.
4. **Saha yükseltme:** seviye, ped, yakıt hattı, maliyet.
5. **Dizel deposu:** tank, tüketim, ETH ile doldurma, bitiş zamanı.
6. **Rafineri:** bakiye, kuyruk, standart/hızlı seçimi.
7. **Crew:** üyeler, katkı sıralaması; serbest sohbet yok (moderasyon yükü), yalnızca hazır sinyaller.
8. **Sezon ve sıralamalar.**
9. **Karot koleksiyonu ve profil.**
10. **Ekonomi (herkese açık şeffaflık):** emisyon, yakımlar, SR, RCR, P\*, rezerv, POL, hazine Safe, timelock kuyruğu, kontrat listesi.
11. **Dokümanlar:** oyuncu rehberi + formüller.

**Verim gösterimi (dürüst ve hukuken temkinli):**
- Gösterilen: "Your share: 0.42% of network DP · current estimate ≈ 18.3 MOHN/h · falls as others join".
- Gösterilen: "Your burn: 12 ℓ/h ≈ 0.00041 ETH/h".
- **Gösterilmeyen:** USD ROI, APR/APY, "X günde geri dönüş", fiyat tahmini.

---

## 7. Sanat ve ses yönü

- **Kurucu kararı (2026-10-13): oyun tam sayfa bir pixel-art oyunudur.** `/play` açılınca ekranın tamamı izometrik pixel sahadır (yükleme ekranı → karşılama penceresi → cüzdan → imza → saha adı → saha); her ekran sahanın üstünde açılan bir pencere (Market'te "rig seç" kartları, dizel deposu, rafineri, rig'lerim), HUD sahanın kenarlarında. Saha pixel art olarak kodla çizilir (`apps/web/src/game/pixel/`), oyun içi yazı pixel fontuyla (**Pixelify Sans**, SIL OFL). Sahaya tıklamak ilgili pencereyi açar (tank → dizel, konteyner → market, kulübe → rafineri, ped → rig'ler); telefonda saha sürüklenerek gezilir. Saha seviyeyle büyür: her dört pedlik sıra açıldıkça çit genişler.
- **Kurucu kararı (2026-10-13 sabah): görsel kalite "voxel diorama" seviyesine çıkar, dünya bizim kalır.** Kurucu, rakip bir oyunun görsel kalitesini örnek gösterdi; karar: o **kaliteyi** (yumuşak ortam gölgesi, yönlü ışık ve gölge, parlama, yoğun ayrıntı, minyatür maket hissi) alıyoruz, o oyunun **dünyasını ve arayüzünü almıyoruz**. Yasak: yüzen ada, pastel/çiçekli ağaç estetiği, krem kâğıt paneller, onların karşılama akışının ve kilitli parsel tabelalarının benzerleri. Bizim: gece sondaj platosu (kuleler, çamur havuzları, boru istifleri, dizel tankı, konteyner, alev bacaları, sodyum lambalar), bizim paletimiz, çelik/ikaz şeritli arayüzümüz. Teknik: çalışma anında 3B kütüphane yok (JS bütçesi); kodla tanımlanmış voxel modeller **derleme anında** kendi yazdığımız küçük bir voxel işleyiciyle (ortam gölgesi, gölge, yayan yüzeyler) izometrik PNG sprite'lara pişirilir, oyun bunları Canvas2D sahnesinde ve gece ışık katmanıyla kullanır (`apps/web/scripts/voxel/`). Dış model/sprite paketi yok; her model bizim.
- **Görünüm:** 2.5D izometrik **yüzey sondaj sahası, gece**. Grafit zemin, emniyet turuncusu ekipman, sodyum lamba ışığı, buhar; camgöbeği yalnızca enstrüman HUD'unda ve karot ışımasında.
- **İmza öğe:** kuyu logu / karot sütunu. Gerçek litolojiye göre renkli bantlar: Regolith ten rengi, Sediment bej, Granite pembe-gri, Gneiss bantlı gri, Granulite koyu, Peridotite zeytin yeşili, Asthenosphere turuncu-kırmızı.
- **Kaçınılanlar:** alet sallayan karakterler, yeraltı tünel/asansör görselleri, pastel ada estetiği, ada/ev/bilgisayar odası temaları. (Pixel font ve gece göğü 2026-10-13 kurucu kararıyla oyunda serbest; site ve marka yazıları Big Shoulders/Barlow'da kalır.)
- **Maskot:** tek maskot, **Foreman Mo**. Baretli, kafa lambalı köstebek ustabaşı (sezon kostümleri, meme yüzeyi). Yan karakter kadrosu yok.
- **Ses:** industrial ambient + kule ritmi (dizel motor, çamur pompası, boru sesi); her katman geçişinde yeni tema.
- **Teknoloji:** Canvas 2D, düşük çözünürlüklü tuval (~470×300 sanat pikseli) tam sayı katıyla büyütülür (`image-rendering: pixelated`); yalnızca tam sayı dikdörtgenler (kenar yumuşatma yok). Mobil öncelikli (telefonda en az 2x + sürükleme); düşük güç modunda tek kare. PixiJS kaldırıldı.
- **Varlıklar:** hepsi bizim tasarımımız ve özgün; dış görsel/sprite paketi kullanılmaz (docs/05 §2.6 özgünlük kuralı). Kuleler kodla çizilir (`apps/web/src/game/rigs.ts`).

---

## 8. Zincir üstü / zincir dışı ayrımı

| Zincir üstü (güven gerektiren her şey) | Zincir dışı (deneyim) |
|---|---|
| Token, emisyon, ödül muhasebesi | Görseller, animasyon, ses |
| Kule sahipliği, ped, yakıt hattı, yakıt tankı | Crew, sezon sıralamaları (indeksleyiciden) |
| VRGDA fiyatı, harcama/yakım | Survey, koleksiyonlar, başarımlar, unvanlar |
| Rafineri, referans kredisi | Katkı kartları, bildirimler |
| ETH gelir dağıtımı, buyback, POL | Profil, destek, duyurular |
| Parametreler, timelock, pause | Anti-bot (yalnızca zincir dışı ödüller için) |

Sunucu çökse bile oyun zincir üstünde çalışmaya devam eder; ön yüz kritik durumu doğrudan zincirden okur.

---

## 9. Bilinçli olarak OLMAYANLAR

- Gacha, loot box, ücretli paket, şanslı upgrade, çökme riskli overclock, "başarısızlıkta seviye kaybı".
- Kahraman, boss, savaş, oyun başına giriş ücreti, stamina; alet sallayan karakterler (tür bizim değil).
- Makine başına sabit verim, garanti getiri, USD ROI göstergesi.
- Oyun içi borsa/swap/pazar yeri (v1).
- Tweet-at-kazan, beğen/RT görevli bekleme listesi, etiketsiz influencer.
- PvP baskın/çalma.
- Ön satış, whitelist satışı, dev buy, takvim tarihli toplu unlock, satış vergisi.

---

## 10. Kararlar

| Karar | Durum |
|---|---|
| Konsept | ✅ A — ortak sondaj sahası (v0.2: yüzey sahası + World Bore, dizel yakıt) |
| İsim | ✅ **Mohonaut / $MOHN** — slogan "Not the moon. The Moho." / "Race to the Moho." Oyuncular: Mohonauts |
| ETH ops payı | ✅ %15 (55/30/15) |
| Bütçe | ✅ Dış bütçe yok; ücretli kalemler yalnızca oyun geliriyle (08) |
| Rakip adları | ✅ Herkese açık hiçbir yerde geçmez (05 §6.4b) |
| Hukuki görüş | ⏳ En az tek seferlik danışmanlık önerildi (06 → 0.2) |
| Mobil | ⏳ v1 yalnızca PWA (önerilen) |
