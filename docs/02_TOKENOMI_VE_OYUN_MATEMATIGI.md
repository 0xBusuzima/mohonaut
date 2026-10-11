# 02 — Tokenomi ve Oyun Matematiği (Kanonik Şartname v1.0 — DONDURULDU)

> **Durum:** **v1.0 — 2026-10-11, kurucu onayıyla donduruldu.** v0.1 ve v0.2 Monte Carlo simülasyonlarından geçti (`sim/RAPOR.md`, "v0.2 doğrulaması"). Bundan sonraki her değişiklik: yeni sürüm numarası + simülasyon + test vektörleri + değişiklik günlüğü.
>
> **İsimler (kurucu onayı, 2026-10-11):** Oyun **Mohonaut**, token **MOHN ($MOHN)**, hashpower birimi **`DP` (Drill Power)**. "Moho" kelimesi yalnızca jeolojik hedef için kullanılır (Moho Line, "Race to the Moho"). **Simülasyon kodu (`sim/`) ve test vektörlerinde token hâlâ `DIG` kod adıyla geçer; MOHN ile birebir aynıdır.**
>
> **Hukuki not:** Mainnet öncesi en az tek seferlik hukuki danışmanlık önerilir; yapılamazsa kurucu riski yazılı olarak üstlenir ve 07 §4'teki en temkinli varyantlar uygulanır (04 §8 ile aynı kural). Özellikle "ETH ile yakıt → token kazanımı" döngüsü ve market açılışındaki likidite oluşturma adımı avukata sorulacak (bkz. `07_HUKUK_SORU_LISTESI.md`).

---

## 0. Tasarım ilkeleri (araştırmadan çıkan 10 kural)

1. **Protokol emisyon takviminden fazlasını asla borçlanmaz.** Ödül = sabit/azalan emisyonun hashpower payı (`r_i = E·h_i/H`). Makine başına sabit verim yok.
2. **Dış gelir şart.** Yakıt (opex) ETH ile ödenir → gerçek gelir → buyback-burn + protokol likiditesi + operasyon.
3. **Harcama ertesi günün ödülü olmaz.** Oyun içi MOHN harcamasının %80'i kalıcı yakılır, %20'si yıllara yayılan rezerve döner ([a competitor]'nin %60 → ertesi gün ödül hatası yok).
4. **Değiştirilemeyenler değiştirilemez:** token, cap, emisyon takvimi, 90/5/5 dağılımı, %80/%20 yakım oranı, mevcut makinelerin istatistikleri.
5. **Ayarlanabilenler sınırlı ve timelock'lu:** her ayar kontratta kodlanmış alt/üst sınır + değişim hızı limiti + **96 saat** timelock (yükseltmeler 7 gün) + herkese açık canlı kuyruk linki.
6. **Geriye dönük nerf yok.** Yeni nesil makineler eklenebilir; eskiler aynı kalır.
7. **Rastgelelik ekonomide yok.** Gacha, paket, şanslı upgrade, çökme riskli overclock yok (7258 riski + Robinhood Chain'de VRF yok).
8. **Ön satış yok, dev buy yok, premine yok.** Her token "yerin altından" çıkar (madencilikle basılır).
9. **Bot-nötr ekonomi.** Hashpower'ı çalıştırmanın maliyeti doğrusal (ETH yakıt) → hesap bölmek emisyon payı kazandırmaz.
10. **USD ROI/APR dili yok.** Arayüz token ve ETH birimleriyle konuşur, formülü ve girdileri yayımlar.

---

## 1. Notasyon

| Sembol | Anlam | Birim |
|---|---|---|
| `t` | zaman | saniye (kontrat), saat/gün (doküman) |
| `R(t)` | Rezerv: henüz basılmamış + geri dönüşmüş MOHN | MOHN |
| `δ_d`, `δ_h` | günlük / saatlik emisyon oranı | – |
| `E_h` | saat `h`'nin emisyonu | MOHN/saat |
| `H(t)` | ağın aktif (yakıtlı) toplam DP'si | DP |
| `h_i` | oyuncu i'nin aktif DP'si | DP |
| `P` | MOHN fiyatı | USD |
| `π_ℓ` | yakıt fiyatı | USD/ℓ |
| `η` | makine verimi | DP/(ℓ/h) |
| `p(t,n)` | VRGDA DP birim fiyatı | MOHN/DP |
| `CAP` | maksimum arz | 100,000,000 MOHN |

---

## 2. Token: MOHN

| Özellik | Değer | Neden |
|---|---|---|
| Standart | ERC-20 + ERC20Permit + ERC20Burnable (yalnızca kendi bakiyesini yakma) | Basit, aggregator dostu |
| Maksimum arz (`CAP`) | **100,000,000 MOHN**, 18 ondalık | Sabit, constructor'da |
| Premine | **0** | Adil madencilik lansmanı |
| Minter | **Yalnızca `MiningCore`**; bir kez atanır, sonra değiştirilemez | Gala/PlayDapp sınıfı saldırıları imkânsız kılar |
| Owner / admin | **Yok** | Token kontratında hiçbir yetki yok |
| Transfer vergisi / blacklist / pause | **Yok** | Honeypot şüphesi yok, DEX/aggregator uyumlu |
| Yükseltilebilirlik | **Yok** (immutable) | — |
| **Günlük mint tavanı** | **500,000 MOHN / UTC günü** (%0.5 CAP), immutable | Denetimsiz lansmanın son savunma hattı. Simülasyonda (3.12M koşu-günü) en yüksek meşru gün 141K, P99.9 69K; market açılış günü LP basımı ≈ 40K. Tavan hiç devreye girmedi. Bir hata olursa günlük zarar 2M'ye göre 4 kat küçük. |
| **Saatlik mint sınırı** | **150,000 MOHN / kayan 60 dk** (MiningCore) | En yüksek meşru saat 71K (market açılış saati, LP dahil); açılıştan sonra 23K. Sınırı aşacak mint **geri çevrilir** (`MintWindowFull`) ve pencerede yer açılınca tekrar denenir. Rafine isteği başına en çok 100K. Acil durdurma Guardian pause'udur. (v1.0.1: eski "aşılırsa her şey durur" tasarımı herkesin bedavaya oyunu dondurmasına izin veriyordu, iç denetim.) |

**Invariant T1:** `totalSupply ≤ CAP` her durumda.
**Invariant T3:** Bir UTC gününde basılan toplam ≤ `DAILY_MINT_CAP` (500K). Tavan dolarsa mint revert eder; standart kuyruktaki çekimler ertesi gün tamamlanır (kaybolmaz).
**Invariant B1:** Kayan 60 dakikada basılan hiçbir zaman 150K'yı aşmaz (aşacak mint geri çevrilir).
**Invariant T2:** `mint` yalnızca `minter` adresinden çağrılabilir; `minter` atandıktan sonra değişmez.

---

## 3. Emisyon: rezerv tabanlı yumuşak azalma ("Derinlik")

### 3.1 Formül

Emisyon, kalan rezervin sabit bir oranıdır. Rezerv tükendikçe kazım zorlaşır — oyundaki anlatı: **"derine indikçe kaya sertleşir."**

```
δ_d = 0.0005                                  (günlük %0.05)
δ_h = 1 − (1 − δ_d)^(1/24) ≈ 2.08383 × 10⁻⁵    (saatlik)
E_h = R_h · δ_h                               (saat başında sabitlenir, saat içinde saniyeye eşit yayılır)
R_{h+1} = R_h − E_h_dağıtılan + geri_dönüşen_h
```

- Saat içinde emisyon hızı `E_h / 3600` MOHN/sn'dir ve **yalnızca `H > 0` iken** dağıtılır. Kimsenin kazmadığı süre rezervde kalır (yanmaz, kaybolmaz, ertelenir).
- Bu, sürekli azalma `E(t) = E0·e^(−λt)` ile eşdeğerdir; `λ = −ln(1−δ_d) ≈ 0.000500125/gün`.

### 3.2 Takvim (geri dönüşüm hariç, kesintisiz kazım varsayımıyla)

```
Gün 1 emisyonu      = 100,000,000 × 0.0005 = 50,000 MOHN
Yarılanma süresi    = ln2 / λ ≈ 1,386 gün ≈ 3.8 yıl   (Bitcoin'in ~4 yılına yakın, ama uçurumsuz)
Yıllık kalıcılık    = 0.9995^365 = 0.83314
Yıl n emisyonu      = CAP × 0.83314^(n−1) × 0.16686
```

| Yıl | O yılın emisyonu | Kümülatif | Ort. günlük |
|---|---|---|---|
| 1 | 16.69M | 16.69M (%16.7) | ~45.7K |
| 2 | 13.90M | 30.59M | ~38.1K |
| 3 | 11.58M | 42.17M | ~31.7K |
| 4 | 9.65M | 51.82M | ~26.4K |
| 5 | 8.04M | 59.86M | ~22.0K |
| 10 | 3.23M | 83.9M | ~8.8K |
| 20 | 0.52M | 97.4M | ~1.4K |

Rezerve geri dönen harcamalar (§6) bu eğriyi yukarı iter → oyun "bitmez", yalnızca yavaşlar. Bu, kullanıcının istediği **çok uzun ömür** şartının matematiksel karşılığıdır.

### 3.3 Emisyonun dağılımı (değiştirilemez)

| Alıcı | Pay | Not |
|---|---|---|
| Madenciler (pro-rata DP) | **%90** | `r_i = 0.90·E·h_i/H` |
| Kurucu/geliştirici akışı | **%5** | Zamana yayılı doğal vesting; cliff gerekmez. Kurucu satış politikasını önceden yayımlar. |
| Hazine (topluluk, sezon ödülleri, referans) | **%5** | Referans ödülleri buradan ödenir (§9) |

**Neden takım payı emisyondan?** Takım, oyun yaşadıkça kazanır; oyun ölürse kazanmaz. Premine/unlock uçurumu yok (DFK/Hamster dersleri).

**Kurucu ve hazine çekimleri de kuyruktan geçer ve sınırlıdır:** Talep başına ve gün başına **en fazla 100,000 MOHN**; hazine en az ayda bir çeker (birikmiş büyük bir tutar günlük tavana çarpmasın). Kurucu ve hazine payları yalnızca **standart 72 saatlik rafine kuyruğu** ile çekilebilir (hızlı seçenek yok). Böylece kurucunun her çekimi, token cüzdana ulaşmadan **72 saat önce** zincirde ve Ekonomi sayfasında görünür. Oyunculardan farklı bir ayrıcalık yoktur.

### 3.4 "Derinlik" göstergesi ve Strata

```
Dünya Derinliği (m) = kümülatif tahakkuk eden emisyon (MOHN) / 1,000
```

Gösterge **tahakkuk eden emisyonu** sayar: toplam arzı değil (yakımlar göstergeyi geri götürürdü), rafine edilmiş tokeni de değil (claim'lerin gerisinde kalırdı). Rezerve dönüp yeniden kazılan tokenlar da sayılır, bu yüzden derinlik uzun vadede 100,000 m'yi geçebilir: "The Core" açık uçludur.

| Stratum | Derinlik (m) | Yaklaşık gün* | Oyun içeriği |
|---|---|---|---|
| I — Regolith | 0 – 2,000 | 0 – 40 | Gen-1 makineler, başlangıç biyomu |
| II — Sediment Cover | 2,000 – 6,000 | 40 – 124 | Gen-2 uygun hale gelir, yeni kozmetik set |
| III — Granite Basement | 6,000 – 12,262 | 124 – 262 | Gen-3; **Kola Line** (12,262 m: insanlığın kazdığı en derin delik, Kola Superdeep Borehole) |
| IV — Archean Gneiss | 12,262 – 20,000 | 262 – 446 | Gen-4, yeni müzik/biyom |
| V — Granulite Floor | 20,000 – 35,000 | 446 – 861 | Gen-5; **Moho Line** (35,000 m: ortalama kıta kabuğu kalınlığı, kabuk–manto sınırı) |
| VI — Peridotite Zone | 35,000 – 60,000 | 861 – 1,832 | Gen-6 |
| VII — Asthenosphere | 60,000 – 85,000 | 1,832 – 3,793 | Gen-7 |
| VIII — The Core | 85,000+ | 3,793+ | Final içerik, açık uçlu |

\* Rezerv geri dönüşümü hariç, kesintisiz kazım varsayımıyla: `gün = −ln(1 − derinlik/100,000) / λ`. Geri dönüşüm emisyonu artırdığı için gerçek tarihler biraz daha erken gelir. İlk strata hızlı gelir (ilk aylarda sık içerik), sonrakiler yavaşlar (emisyonla aynı ritim).

Yeni nesil makine ekleme yetkisi **stratum eşiğine bağlıdır** (kontrat kontrol eder): içerik takvimi tarihe değil zincir üstü ilerlemeye bağlanır → herkes ne zaman geleceğini hesaplayabilir.

---

## 4. Ödül muhasebesi (MasterChef tipi akümülatör + saatlik bitiş takvimi)

```
acc  += (dağıtılan_madenci_DIG × 1e18) / H          (her checkpoint'te)
pending_i = h_i × (acc_bitiş − debt_i) / 1e18
acc_bitiş = (now < expiry_i) ? acc_şimdi : accAtHour[expiry_i]
```

- Her hesabın tek bir **yakıt bitiş saati** (`expiry_i`, saat sınırına hizalı) vardır. Global `dpEndingAt[saat]` tablosu, o saatte yakıtı biten DP'yi tutar.
- Global checkpoint, son checkpoint'ten bu yana geçen her saat sınırında: (1) o saatin emisyonunu dağıtır, (2) `accAtHour[saat]` anlık görüntüsünü yazar, (3) `H -= dpEndingAt[saat]`, (4) `R` ve `E_h`'yi günceller.
- Döngü çağrı başına en fazla `MAX_HOURS_PER_POKE = 168` saat işler; `poke()` herkese açıktır (keeper saatlik çağırır, gas ≈ $0.006).
- Yuvarlama her zaman **protokol lehine aşağı**.

**Invariant E1:** `Σ pending + Σ claimed_madenci ≤ Σ dağıtılan_madenci`
**Invariant E2:** `totalSupply + Σ pending(tüm alıcılar) + refineKuyruğu + R + burnedForever ≤ CAP` (eşitlik, yuvarlama tozu hariç)
**Invariant E3:** `H == Σ_i h_i` (yalnızca `expiry_i > now` olanlar)
**Invariant E4:** Yakıtı bitmiş hesap bitiş saatinden sonra tek wei bile kazanmaz.
**Invariant E5:** Bir saatte dağıtılan ≤ `E_h` (+ toz).

---

## 5. Yakıt (opex, ETH ile)

### 5.1 Depo (tank) modeli

```
Saatlik tüketim (ℓ/h)      = Σ aktif makinelerin ℓ/h tüketimi  (≤ saha yakıt hattı kapasitesi)
Tank (ℓ)                = satın alınan − tüketilen
Bitiş zamanı              = floor_saat( now + tank / aktif_kW )
ETH maliyeti              = ℓ × π_ℓ / ETHUSD          (Chainlink ETH/USD; sequencer uptime feed bu zincirde yok → kontrolü opsiyonel)
```

| Parametre | Başlangıç | Sınır (timelock'lu) | Değişim hızı |
|---|---|---|---|
| `π_ℓ` | **$0.10** | $0.03 – $0.50 | ±%25 / 7 gün |
| Tank üst sınırı | kapasite × 720 saat (30 gün) | 168–2,160 saat | — |
| Oracle bayatlık eşiği | **26 saat** (ETH/USD heartbeat 24 saat + tampon; sapma eşiği %0.5) | 25–30 saat | — |
| Sequencer uptime feed | **Yok** (Robinhood Chain için Chainlink'te bulunmuyor; adres `address(0)` ise kontrol atlanır, ileride eklenirse timelock ile bağlanır) | — | — |
| Testnet | Chainlink beslemesi yok → `MockV3Aggregator` | — | — |

- Oracle bayat → **yalnızca yakıt satın alma** durur; çalışan kuleler etkilenmez. 24 saatlik heartbeat nedeniyle fiyat %0.5'e kadar eski olabilir; bu, yakıt fiyatı için önemsiz bir sapmadır (zincir doğrulaması: `docs/ZINCIR_DOGRULAMA.md`).
- Oyuncu makineleri tek tek açıp kapatabilir (kârsız eski makineyi kapatmak = gerçek madencilik kararı).

### 5.2 Neden ETH? (serbest giriş dengesi)

```
H* = 0.90 · E · P / c_DP,        c_DP = π_ℓ · 24 / η     (USD/DP/gün)
```

- Fiyat düşerse `H*` düşer: kârsız madenciler kapanır, kalanların payı artar → **kendiliğinden dengelenme** (Bitcoin dinamiği).
- Yakıt tamamen MOHN ile olsaydı `H*` fiyattan bağımsız kalır, çöküşte ağ küçülmez, rahatlama olmazdı.
- Hesabı bölmek avantaj sağlamaz: her DP'nin yakıt maliyeti doğrusal → **sybil-nötr**.

**Örnek:** `E=50,000/gün`, `P=$0.15` → madenci geliri `0.9×50,000×0.15 = $6,750/gün`. Gen-1 T1 (η=50) için `c_DP = 0.10×24/50 = $0.048` → yalnızca opex'e göre denge `H* ≈ 140,600 DP`. Capex eklendiğinde denge daha düşük olur.

---

## 6. Makineler ve VRGDA fiyatlaması (capex, MOHN ile)

### 6.1 Gen-1 katalog

| ID | Makine | DP | ℓ/h | η (DP/(ℓ/h)) | Prim | Fiyat @ p0=10 | Kilit |
|---|---|---|---|---|---|---|---|
| 0 | Pilot Rig (başlangıç) | 10 | 0.25 | 40 | — | **Ücretsiz, hesap başı 1** | — |
| 1 | Rotary Rig | 50 | 1.0 | 50 | %0 | 500 | Saha L1 |
| 2 | Top Drive | 150 | 2.5 | 60 | %8 | 1,620 | Saha L3 |
| 3 | Diamond Core Drill | 420 | 6.0 | 70 | %17 | 4,914 | Saha L6 |
| 4 | Turbodrill | 1,000 | 12.5 | 80 | %27 | 12,700 | Saha L10 |
| 5 | Plasma Bore | 2,700 | 30.0 | 90 | %40 | 37,800 | Saha L15 |

**Kural "pahalı = daha verimli, daha ucuz hash değil":** DP başına fiyat tier ile artar (prim), karşılığında ℓ/h başına DP artar (yakıt tasarrufu) ve slot başına DP artar. [a competitor]'nin ucuz PC'lerinin kuralı bozup nerf'e yol açması burada tasarım gereği imkânsız.

**Prim geri dönüşü örneği:** T5'in T1'e göre yakıt tasarrufu `0.10×24×(1/50−1/90) = $0.0213/DP/gün`; prim `4 MOHN/DP`. `P=$0.15` iken prim `$0.60/DP` → **~28 günde** kendini çıkarır. Fiyat ve yakıt değiştikçe bu karar değişir → gerçek strateji.

### 6.2 Neden VRGDA? (oracle'sız, otomatik fiyat)

Makine fiyatları MOHN cinsindendir ama MOHN'un USD fiyatı bilinmez. Kendi tokenimiz için fiyat oracle'ı kullanmak (AMM spot/TWAP) manipülasyon riski taşır (PancakeBunny dersi). Çözüm: **Variable Rate Gradual Dutch Auction** (Paradigm, Art Gobblers'ta denetlenmiş):

```
p(t, n) = p0 · (1 − k)^(t − n/r)
```

- `t`: lansmandan beri gün, `n`: bugüne kadar satılan toplam DP birimi, `r`: hedef DP/gün, `k`: satış yokken günlük fiyat düşüşü.
- Satış hedefin önündeyse fiyat üstel artar; gerisindeyse düşer. MOHN ucuzlarsa makineler USD'de ucuzlar → talep artar → MOHN fiyatı yükselir: **fiyat kendini piyasaya göre ayarlar, kimse düğmeye basmaz.**

**q birimlik alımın toplam maliyeti (kapalı form):**

```
a = (1 − k)^(−1/r)
Maliyet(q) = p(t, n) · (a^q − 1) / (a − 1)
Tier maliyeti = Maliyet(DP_tier) × (1 + prim_tier)
```

| Parametre | Başlangıç | Sınır | Değişim hızı |
|---|---|---|---|
| `p0` | 10 MOHN/DP | sabit (deploy) | — |
| `k` | 0.15 | 0.05 – 0.35 | ±%25 / 30 gün |
| `r` | **2,000 DP/gün** (v0.1: 8,000) | 1,000 – 100,000 | ±%25 / 30 gün |
| İşlem başı üst sınır | 10,000 DP birimi | — | — |

> **Simülasyon dersi (en önemli bulgu):** `r`, ağın yakıtla taşıyabileceği DP birikimiyle uyumlu olmalı. Yakıt maliyeti aktif ağı birkaç yüz bin DP ile sınırlıyor; `r = 8,000` yılda 2.9M DP satış hedefliyordu. Satışlar hedefin gerisinde kalınca fiyat günde %15 düştü, makineler 12. ayda p0'ın %5'ine indi, ana sink kayboldu ve kohortların yalnızca %15'i yatırımını 365 günde (MOHN cinsinden) geri alabildi. `r = 2,000` ile bu oran %69'a çıkıyor (ETH dağılımı değişikliğiyle birlikte %97). Bedeli: erken dönemde DP daha kıt, 12. ay Gini'si 0.20 → 0.56; yeni oyuncu için giriş daha pahalı. `r`'nin doğru değeri talebe bağlıdır; bu yüzden §12'deki müdahale kuralı canlı veriye göre ayarlar.

### 6.3 Harcamanın akıbeti (değiştirilemez)

```
Her MOHN harcaması (kule, saha; kozmetik hariç):  %80 → kalıcı yakım (burnedForever)
                                                 %20 → Rezerv (yıllara yayılarak yeniden kazılır)
Kozmetik MOHN harcamaları:                        %100 kalıcı yakım
```

### 6.4 Hurdaya çıkarma (scrap)

Makine söküldüğünde, o makinenin DP birimleri × güncel `p(t,n)` × **%20** kadar **hurda kredisi** verilir. Kredi transfer edilemez, çekilemez; yalnızca yeni kule/saha alımında kullanılır. Slot yönetimi ve nesil yükseltmesi içindir; net etkisi yine sink'tir.

---

## 7. Sondaj sahası (Drill Site): ped (slot) ve yakıt hattı kapasitesi

```
slot(L)      = 3 + L                       (L1: 4 → L30: 33)
kapasite(L)  = 6 · 1.22^(L−1) ℓ/h            (L1: 6 ℓ/h → L15: 97 ℓ/h → L30: ~1,909 ℓ/h)
yükseltme(L→L+1) = 150 · L^2.2 · idx  MOHN
idx          = clamp( p(t,n) / p0 , 0.25 , 4 )
```

| L | Slot | Kapasite (ℓ/h) | Sonraki seviye maliyeti (idx=1) |
|---|---|---|---|
| 1 | 4 | 6.0 | 150 |
| 5 | 8 | 13.3 | 5,180 |
| 10 | 13 | 35.9 | 23,800 |
| 15 | 18 | 97.1 | 58,000 |
| 20 | 23 | 262 | 109,000 |
| 29 | 32 | ~1,565 | 247,000 |

- Polinom (`L^2.2`) maliyet, üstel'den daha nazik → çok yıllık ilerleme. L30'a toplam ≈ 2.3M MOHN (idx=1).
- `idx`, saha maliyetlerini makine fiyat endeksine bağlar → USD karşılığı makul kalır, oracle gerekmez.
- Dışbükey hesap başı maliyet = balinaya artan maliyet; hesap bölmek yalnızca ucuz ilk seviyeleri çoğaltır, yakıt yine doğrusal ödenir.

---

## 8. Rafineri (claim)

| Yol | Ücret | Süre | Ücretin akıbeti |
|---|---|---|---|
| **Standart rafine** | %0 | 72 saat kuyruk | — |
| **Hızlı rafine** | %8 | anında | %4 kalıcı yakım + %4 Rezerv |
| **Oyun içi harcama** | %0 | anında | Rafine edilmemiş bakiyeden doğrudan harcanır |

- Satış vergisi yerine claim anında sink (aggregator dostu; ORE "refining" emsali).
- Kuyruktaki MOHN kazım yapmaz, transfer edilemez; 72 saat sonra herkes (keeper dahil) `finalize` çağırabilir, token kullanıcıya basılır.
- Sınırlar: hızlı ücret %0–12, kuyruk 24–168 saat (timelock'lu).

---

## 9. Referans (tek seviye, emisyonu artırmaz)

```
Davet edenin kredisi = davet edilenin madenci tahakkukunun %3'ü
Kaynak             = hazinenin %5'lik emisyon payı (davet edilenden kesilmez, yeni emisyon basılmaz)
Koşullar           = davet edilenin toplam yakıt harcaması ≥ 0.003 ETH ve davet edenin aktif yakıtı var
```

- En kötü durumda (herkesin davet edeni var): `%3 × %90 = %2.7 < %5` → **hazine payını asla aşamaz**.
- Koşul sağlanmazsa kredi hazinede kalır. Çok seviyeli referans yok (MLM görüntüsü yok).

---

## 10. ETH gelir yönlendirme

| Hedef | Pay | Sınır | Açıklama |
|---|---|---|---|
| Buyback & Burn | **%55** (v0.1: %40) | %30–60 | Keeper rolü, günlük tavan, slippage sınırı; alınan MOHN %100 yakılır |
| Protokol Likiditesi (POL) | **%30** | %20–50 | Tam aralık Uniswap v4 pozisyonu, **çekilemez** |
| Operasyon (Safe) | **%15** (v0.1: %30) | %10–35 | Sunucu, bağımsız denetim fonu, bug bounty, giriş servisi, ekip; aylık rapor (08 §3 sırası) |

> **Neden 55/30/15?** Ops payı, gelirin MOHN piyasasından kalıcı olarak çıkan kısmıdır; buyback ise dış gelirin tokene dönen tek kanalıdır. Simülasyonda tek başına bu değişiklik SR'yi 0.65 → 0.86'ya çıkardı ve en yüksek Gini'yi 0.74 → 0.56'ya indirdi. Simülasyonun mutlak gelir rakamları uydurma bir talep kalibrasyonuna dayandığı için ops payının nihai değeri gerçek bütçeye göre seçilir. Kural: kötü senaryoda ops geliri aylık bütçenin ≈ 2 katını karşılamalı. **Bu oran kurucunun kararıdır.**

**Sıfır enflasyon fiyatı (P\*), RCR ve dürüst bir not:**

```
SP  = E · P · s                         (s = basılanın satılan oranı)
B   = R_ETH · α / P                     (geri alınan MOHN, α = 0.55)
NE  = E − yakım_harcama − B             (net emisyon)
P*  = R_ETH · α · β / E                 (β = 1)
RCR = (ETH buyback USD) / (E · P)
```

**Simülasyonun gösterdiği yapısal gerçek:** Araştırmadaki "RCR ≥ s" Ponzi testi bu tasarımda **hiçbir senaryoda sağlanmıyor ve sağlanamaz**. Yakıt ETH'sini madencilerin kendisi öder. Serbest giriş dengesinde yakıt gideri madenci gelirine yaklaşır, buyback de bunun yalnızca bir kısmıdır. Bu yüzden `P* ≤ α · 0.9 · P`'dir. Bu durum Bitcoin dahil her madencilik tokeni için geçerlidir: fiyat sonuçta MOHN'a olan talebe (makine almak isteyen yeni oyuncular ve piyasa) dayanır.

Tasarımı Ponzi'den ayıran şey bu test değil, şunlardır: (1) protokolün hiçbir getiri borcu yoktur, ödeme pro-rata emisyondur; (2) getiri vaadi yoktur; (3) harcama ertesi günün ödülüne dönmez.

RCR bu nedenle geçti/kaldı kriteri değil, **izlenen bir sağlık metriğidir** ve gerçekten madenci dışı gelirle iyileştirilir. Bu gelir kaynakları: ETH ile satılan kozmetikler ve sezon kozmetik paketleri (ekonomik avantajsız), POL işlem ücretleri.

Bu metrikler herkese açık Ekonomi sayfasında canlı yayımlanır.

---

## 11. Genesis ve Market Açılışı

| Aşama | Süre | Kurallar |
|---|---|---|
| **Pre-fill** | T0 − 24s → T0 | Hesap açma, başlangıç makinesi, yakıt tankı doldurma |
| **Genesis Dig** | T0 → T0 + 72s | Kazım aktif; **rafine kapalı**; rafine edilmemiş MOHN oyun içinde harcanabilir |
| **Market Open** | T0 + 72s | `openMarket()` herkes tarafından çağrılabilir; formülle POL oluşturulur |

```
P0_USD   = Genesis yakıt harcaması (USD) / Genesis madenci tahakkuku (MOHN)     → madencilerin ortalama maliyeti
MOHN_LP   = min( POL_ETH × ETHUSD / P0_USD , 1,000,000 , saatlik mint sınırında kalan yer )  → rezervden basılır
            (pratikte = 0.30 × genesis madenci tahakkuku ≈ 40K; tavanlar hiç bağlamaz)
            LP kırpılırsa havuz yine P0'da açılır; yalnızca LP ile eşleşen POL ETH kullanılır, kalan ETH
            POL kovasında addLiquidity için bekler (v1.0.1)
Havuz    = Uniswap v4, ETH/MOHN, tam aralık, pozisyon NFT'si çekilemez kontratta
```

- **Genesis'te tank üst sınırı:** Pre-fill ve Genesis boyunca bir hesabın tankı en fazla **Market Open + 24 saat** sonrasına kadar yetecek kadar doldurulabilir. Böylece "genesis yakıt harcaması" ≈ genesis'te gerçekten tüketilen yakıt olur. 30 günlük ön doldurma P0'ı 3–4 kat şişirirdi.
- **Genesis'teki buyback payı:** Market açılmadan buyback yapılamaz. Bu süredeki buyback kovası birikir ve Market Open'dan sonra günlük tavanla harcanır (simülasyondaki davranış).
- Takım alım yapmaz; açılış fiyatı formülle, zincir üstü verilerle belirlenir; kimsenin takdir yetkisi yok.
- Açılış havuzu sığ başlar: tank sınırıyla genesis yakıt harcaması ≈ $5.4K, P0 ≈ $0.04 (sınırsız tankta $0.11), açılış POL'ü ≈ 0.55 ETH + ≈ 40K MOHN. Fiyat açılıştan sonraki 2 günde ~3 katına çıkabiliyor; 12. ayda iki yol birleşiyor. Asıl önlemler: "açılış fiyatı oynaktır" iletişimi ve opsiyonel anti-snipe ücret hook'u.
- CA günler önceden yayımlanabilir: havuz `openMarket()` anına kadar yoktur → snipe edilecek bir şey yok.
- (Opsiyonel, denetim kapsamı kararı) İlk 60 dakika alımlarda %20'den %1'e düşen dinamik ücret hook'u; ücret POL'e/yakıma gider.

---

## 12. Ayarlanabilir / değiştirilemez parametreler

| Değiştirilemez (kodda sabit) | Ayarlanabilir (Safe → Timelock **96s**, sınırlı) |
|---|---|
| CAP, token kontratı, minter | `π_ℓ` ($0.03–0.50, ±%25/7g) |
| Emisyon oranı δ_d ve takvim | VRGDA `r`, `k` (sınırlar §6.2) |
| 90/5/5 emisyon dağılımı | ETH gelir dağılımı (sınırlar §10) |
| %80/%20 yakım/rezerv oranı | Rafineri ücreti ve kuyruk süresi (§8) |
| Mevcut makinelerin DP/(ℓ/h)/prim değerleri | Yeni nesil ekleme (stratum eşiği + verim ≤ önceki en iyi +%15, ≤ 1 nesil/45 gün) |
| Genesis/Market Open formülü | Saha maliyet tabanı (±%25/30g) |
| Referans oranı ve kaynağı | Keeper adresi, günlük buyback tavanı |

**Önceden ilan edilmiş müdahale politikası** (yumuşak, otomatik değil; her biri timelock kuyruğunda herkese görünür):

- ("4 hafta" = 4 ardışık haftalık ölçüm.) 4 hafta üst üste `SR < 0.5` **veya** `p(t,n)/p0 < 0.25` → **`r` %25 azaltılır** (v0.1'deki "r artır" kuralı ters yöndeydi: simülasyonda r büyüdükçe SR ve geri dönüş düşüyor).
- 4 hafta üst üste VRGDA satışları hedefin ≥ %50 önündeyse (fiyat p0'ın 4 katını aşıyor) → `r` %25 artırılır (yeni oyuncu giriş maliyetini sınırlamak için).
- RCR 8 hafta üst üste düşüş trendindeyse → buyback payı artışı (üst sınır %60) veya yeni ETH kozmetik içerik önerilir.
- Hashpower Gini > 0.8 veya Nakamoto < 10 → bir sonraki nesil verim tavanı düşük tutulur.

---

## 13. Simülasyon ve kabul kriterleri

Simülasyon `/sim` altında, bu dokümandaki formüllerle **günlük adımlı, ajan tabanlı Monte Carlo** olarak koşar.

**Ajan tipleri:** sıradan madenci, yeniden yatırımcı (optimizer), balina (büyük gir, düşüşte çık), bot çiftliği (claim'in %100'ünü satar), kozmetik harcayan, spekülatör/LP.

**Senaryolar (her biri ≥ 200 tohum):** baz, ayı (talep −%70 şoku), derin ayı (−%90), balina (H'nin %20'si, 30 gün sonra çıkış), churn (3. aydan sonra yeni giriş −%80), sybil (1,000 cüzdan), hype (2 hafta 10x giriş).

**Kabul kriterleri (v1.0 sonuçları: 7 senaryo × 200 tohum):**

> **`r` değişiklikleri fiyat sürekliliğini korumalı:** Değişiklik anında VRGDA yeniden çapalanır: `p = p0·(1−k)^(s_a + (t−t_a) − (n−n_a)/r)`. Test vektörleri: `sim/vectors/vrgda_reanchor.json`. Aksi halde (1M DP satılmışken) %25'lik bir değişiklik takvimi ~167 gün kaydırır ve fiyat sıçrar.

| Metrik | Tanım | Hedef | v0.1 sonucu | v0.2 sonucu |
|---|---|---|---|---|
| Fiyat dayanıklılığı | P(24. ay ort. fiyat > %30 × **2. ay** ort.)¹ | ≥ 0.5 (baz) | GEÇTİ | GEÇTİ |
| Kohort geri dönüşü | Haftalık kohortun ilk 14 günlük capex'inin, o DP'nin net (yakıt sonrası) MOHN üretimiyle geri ödendiği gün; kohort medyanı | ≥ %70 kohortta < 365 gün (baz) | **KALDI (0.15)** | **GEÇTİ (0.95; medyan 96 gün)** |
| Sink oranı SR | 12. ay, 28 günlük ortalama | ≥ 0.6 (baz), ≥ 0.3 (ayı) | GEÇTİ | **GEÇTİ (0.72 / 0.65; derin ayı 0.81)** |
| Yoğunlaşma | Cüzdan bazında, aktif DP, 3–36. ayların aylık en yüksek Gini'si | < 0.8 (7 senaryo) | 5/7 | **7/7 (en yüksek 0.775, derin ayı)** |
| Sybil-nötrlük | Aynı gün, aynı makine tipiyle ℓ başına emisyon oranı (sybil / normal) | ≤ 1 + referans oranı | GEÇTİ (1.006) | GEÇTİ (1.026) |
| Ops runway | En kötü %5 hariç | > 12 ay | GEÇTİ | GEÇTİ |
| RCR | Sağlık metriği (§10), kriter değil | Trend izlenir | 0.36 | 0.15 |

¹ "1. ay ortalaması" lansman dinamiğine çok duyarlı çıktı; referans 2. aya taşındı.

**Önemli uyarı:** Simülasyondaki mutlak fiyat ve gelir seviyeleri, gerçek veri olmadan kurulmuş bir talep kalibrasyonuna dayanır. Önerilerin **yönü** talep yarıya indirildiğinde ve ikiye katlandığında da korunuyor; **seviyeleri** korunmuyor. Hiçbir simülasyon sonucu dışarıya fiyat veya getiri beklentisi olarak sunulmaz.

**v1.0 doğrulaması tamamlandı:** Genesis tank sınırı, §12 müdahale kuralı ve mint tavanları modele eklendi; 7 senaryo × 200 tohum, talep ×0.5 / ×2 sağlamlık testi ve 96 saatlik timelock kontrolü geçti. Arz invariant'ı her koşunun her gününde tuttu. En zayıf nokta: derin ayıda Gini 0.775 (sınıra yakın), 36. ayda Nakamoto ≈ 8 → canlıda izlenir.

| Ek kriter | Sonuç |
|---|---|
| Günlük mint tavanı hiç bağlamaz | GEÇTİ (3.12M koşu-gününde 0) |
| RCR (izlenen metrik) | 0.14 |

**Canlı sağlık metrikleri:** NE, SR, RCR, P\*, kohort geri dönüşü, Gini/Nakamoto, satış oranı (DEX'te satılan / rafine edilen), yeniden yatırım oranı, yeni/dönen DAU, D1/D7/D30, oyuncu başı DP.

---

## 14. Sonraki sürümler (v1'de YOK, denetim kapsamını küçük tutmak için)

- **Kilitle-güçlendir (Sezon 2):** `boost = 1 + 0.25 · min(1, ve_i / (h_i · β))`, `ve = kilitli × kalan_süre/180g` (Curve tarzı, %25 tavan, DP'ye orantılı kilit şartı).
- **Ligler:** emisyonu değil yalnızca kozmetik sıralamayı böler.
- **Anti-snipe hook'u** (§11) — denetim bütçesine göre v1'e alınabilir.
- **Makine pazarı:** v1'de makineler hesaba bağlıdır (transfer yok). Pazar yeri = KVHS/borsa riski + ödül muhasebesi hata sınıfı (Popsicle) → hukuki görüş olmadan eklenmez.

---

## Değişiklik günlüğü

| Sürüm | Tarih | Değişiklik | Gerekçe |
|---|---|---|---|
| v0.1 | 2026-10-10 | İlk şartname | Araştırma raporu |
| v0.1+ | 2026-10-10 | Kurucu/hazine çekimleri yalnızca 72s kuyruk; Dünya Derinliği tahakkuk eden emisyona göre, strata metre cinsinden (Kola Line, Moho Line) | Şeffaflık; marka çalışması |
| v0.2 | 2026-10-10 | VRGDA `r` 8,000 → 2,000; ETH dağılımı 40/30/30 → 55/30/15; §12 müdahale kuralı yönü düzeltildi; genesis tank üst sınırı ve genesis buyback kovası tanımlandı; §13 tanımları netleştirildi; RCR kriterden sağlık metriğine alındı | `sim/RAPOR.md` §1, §7 |
| v0.2+ | 2026-10-10 | Tema: enerji (kWh/kW) → dizel yakıt (ℓ, ℓ/h), üs → sondaj sahası, makine ve katman isimleri yenilendi (matematik aynı); parametre timelock'u 72s → 96s; oracle bayatlık eşiği 26s, sequencer feed opsiyonel, testnet mock (0.4 zincir doğrulaması) | Kurucu kararı (rakiplere benzememe), `docs/ZINCIR_DOGRULAMA.md` |
| v1.0.1 | 2026-10-12 | **Güvenlik düzeltmeleri (iç denetim, ekonomi parametreleri değişmedi):** saatlik mint devre kesicisi → katı saatlik mint sınırı (aşan mint geri çevrilir; global durdurma yok); rafine isteği başına ≤ 100K; Market Open LP'si mint sınırına kırpılır (fiyat P0'da kalır); referans kredisinin %3'lük bütçesi hazine payı içinde ayrılır, hazine çekemez | `contracts/audits/FINDINGS.md` |
| **v1.0** | **2026-10-11** | **Donduruldu.** İsim Mohonaut / $MOHN; günlük mint tavanı 2M → 500K; saatlik mint devre kesicisi 150K; kurucu/hazine çekimi talep ve gün başına ≤ 100K; VRGDA `r` değişiklikleri fiyat sürekli (yeniden çapalama); §13 sonuçları v0.2 simülasyonuyla güncellendi | `sim/RAPOR.md` "v0.2 doğrulaması", kurucu onayı |
