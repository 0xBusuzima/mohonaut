# 04 — Güvenlik, Test ve Denetim Planı (v0.2 — sıfır bütçe)

> **Amaç:** Açık, suistimal, ölü kod ve gereksiz kod bırakmayan; her iddiası otomatik testle kanıtlanan bir sistem. Kural: **"Test edilmemiş iddia yoktur."** Her invariant'ın bir test dosyası, her parametre sınırının bir revert testi vardır.

---

## 1. Tehdit modeli

> "Kanıt" sütunundaki dosya adları planlama aşamasından kalmadır; gerçek test dosyaları ve fonksiyonları için güncel eşleme: `contracts/audits/TRACEABILITY.md` (Faz 2.9).

| # | Tehdit | Örnek olay | Önlem | Kanıt (test) |
|---|---|---|---|---|
| T1 | Yetkili anahtarla sınırsız mint | Gala (2024), PlayDapp (2024) | Token immutable, tek minter = MiningCore, CAP | `MohnToken.t.sol`, Halmos `prove_capNeverExceeded` |
| T2 | Kötü niyetli/hatalı yükseltme | Munchables ($62.5M), Ronin 2024 initializer | 7g timelock, doğrulanmış implementasyon, `_disableInitializers`, storage layout CI | `Upgrade.t.sol`, `slither-check-upgradeability` |
| T3 | Ödül muhasebesi hatası | Idols (self-transfer), Popsicle (reward debt), Cover (bayat state), Balancer (yuvarlama) | Tek akümülatör, her değişiklikten önce settle, transfer edilemez pozisyon, aşağı yuvarlama | Invariant E1–E5, fuzz kenar durumları (H=1, dt=0, saat sınırı) |
| T4 | Fiyat manipülasyonu | PancakeBunny | Mint/ödül asla AMM fiyatından hesaplanmaz; VRGDA zaman/satış tabanlı | `VRGDA.t.sol`, grep kuralı (CI) |
| T5 | Oracle sorunu | Bayat Chainlink (heartbeat 24s), sequencer kesintisi (bu zincirde uptime feed yok) | 26s bayatlık eşiği; sequencer feed opsiyonel (adres tanımlıysa kontrol); sorun → yalnızca yakıt alımı durur; kazım etkilenmez | `FuelOracle.t.sol` (mock feed) |
| T6 | Rastgelelik istismarı | Meebits | Ekonomide rastgelelik yok | Tasarım (ADR-005) |
| T7 | Döngü/DoS | Akutars (11,539 ETH kilit) | Sınırlı döngü (≤168 saat/poke), pull ödeme, sınırsız dizi yok | Gas fuzz, `MAX_HOURS_PER_POKE` testi |
| T8 | Reentrancy | Klasik | CEI + `nonReentrant` (ETH çıkışları), ERC777 yok | Saldırgan kontrat testleri |
| T9 | Keeper anahtarı ele geçirilmesi | — | Keeper yalnızca tavanlı işlemler: günde buyback kovasının en çok 1/20'si, POL kovasının 1/7'si (JIT likidite şişiremez) ve swap'lar hook'un 1 saatlik fiyat çapasından en çok %3 uzağa (v1.1, ADR-017) | `integration/Market.t.sol` (bütçe aşımı, çapa, `test_jitLiquidityDoesNotRaiseTheCaps`, `test_stolenKeeperSandwichIsBounded`), `unit/PriceAnchor.t.sol` |
| T10 | Safe/arayüz ele geçirilmesi | Bybit ($1.46B, kör imza) | Donanım cüzdan, net imzalama, `safe-tx-hashes-util` ile bağımsız hash kontrolü, 2 arayüz | Runbook + tatbikat |
| T11 | Bot/sybil | Hamster (2.3M ban), Pixels (%40 bot) | Ekonomi bot-nötr (doğrusal ETH yakıt); zincir dışı ödüllerde Turnstile + kümeleme | Sim sybil senaryosu |
| T12 | Lansman sniping | Pump.fun (%87 kârlı snipe), lansmandan önce yayımlanan token adresinde havuz sniping | Premine yok; havuz `openMarket()` ile formülle; opsiyonel azalan ücret hook'u | `OpenMarket.t.sol` |
| T13 | Web2 saldırıları | DNS/arayüz ele geçirme, XSS, oltalama | Cloudflare, CSP, SRI, DNSSEC, registrar kilidi, 2FA donanım anahtarı | Pentest + ZAP taraması |
| T14 | Tedarik zinciri | Kötü npm paketi | Lockfile, Renovate, `npm audit`, Socket.dev, sabitlenmiş sürümler | CI |
| T15 | Zincir kesintisi / kapanması | RH 4 Eylül 2026, Abstract kapanışı | Zaman damgası tabanlı tahakkuk, idempotent işlemler, göç planı | `Outage.t.sol` (zaman atlama) |

---

## 2. Invariant kataloğu (kontratın "anayasası")

| Kod | Invariant |
|---|---|
| T1 | `totalSupply ≤ CAP` |
| T2 | Yalnızca `minter` mint edebilir; `minter` değişmez |
| T3 | Bir UTC gününde basılan toplam ≤ `DAILY_MINT_CAP` (500K MOHN, immutable) |
| B1 | Kayan 60 dakikada basılan ≤ 150K; aşacak mint geri çevrilir (v1.0.1; test: handler her mint'i zamanıyla kaydeder, kayan 60 dakikada toplam ≤ 150K; bakiyesi olmayan çağıran pencereye dokunamaz) |
| E1 | `Σ pending_madenci + Σ claimed_madenci ≤ Σ dağıtılan_madenci` |
| E2 | `totalSupply + Σ pending(tümü) + refineKuyruğu + R + burnedForever + dışYakım == CAP` (± toz). `dışYakım`: kontrat dışından yakılan MOHN (oyuncunun `burn`'ü, buyback ve LP ücreti yakımları); bu terim olmadan ilk dış yakımda yanlış olur (AI review ACC-3) |
| E3 | `H == Σ dp_i` (yakıtı aktif olanlar) |
| E4 | Yakıtı bitmiş hesabın `pending`'i bitiş saatinden sonra artmaz |
| E5 | Bir saatte dağıtılan ≤ `E_h` |
| E6 | `E_h == floor(R_h · δ_h)` her saat başında |
| M1 | `Σ owned[type] ≤ slot(level)`; `Σ active ℓ/h ≤ kapasite(level)` |
| M2 | Katalogdaki mevcut makine alanları asla değişmez |
| V1 | VRGDA toplu maliyet ≥ birim maliyetlerin toplamı − toz (toplu alım indirimi yok) |
| V2 | Satış önündeyken fiyat artar, gerisindeyken azalır (monotonluk) |
| S1 | Her MOHN harcamasında: yakılan = %80, rezerve = %20 (± toz) |
| R1 | Router: `balance ≥ buyback + pol + ops` (SELFDESTRUCT ile zorla gönderilen ETH bakiyeyi kovaların üstüne çıkarabilir ve orada kilitli kalır; eşitlik yalnızca zorla gönderim yoksa geçerlidir — AI review ATK-6 / ACC-2) |
| R2 | Referans kredisi toplamı ≤ hazine payı toplamı (test: `referralPaid ≤ %3 × minersDistributed`, yani emisyonun ≤ %2.7'si; kaynağın hazine olduğu E2 ile kanıtlanır) |
| P1 | Her parametre kendi sınırları içinde; hız limiti aşılamaz; yalnızca Timelock (test: her parametre için sınır/adım/bekleme birim testi; rastgele değişiklik invariant'ı; rol matrisi; durum değiştiren fonksiyonların ABI'deki gözden geçirilmiş listeye eşitliği) |
| P2 | Pause en fazla 72s; Guardian unpause edemez (test: Guardian pause'u hiçbir zaman şimdi + 72s'yi aşmaz invariant'ı; iki pause arası 7 gün; unpause yalnızca Timelock) |
| K1 | Bir UTC gününde buyback harcaması ≤ o günün bütçesi (`spentInDay ≤ dayBudget`; bütçe günün ilk buyback'inde kovanın `dailyBps`'i). POL için aynısı: `addedInDay ≤ addBudget` (kovanın 1/7'si). Bütçe havuz likiditesine bağlı değildir (v1.1) |
| K2 | Keeper swap'ı (buyback, LP yarım-swap) fiyatı çapanın 296 tick altından öteye taşıyamaz (karşılaştırma tick'le değil fiyatla yapılır: başlatılmış bir tick sınırında havuz, sınır fiyatının kendisi için tick − 1 gösterir; bunu Medusa buldu); fiyat zaten oradaysa işlem yapılmaz. LP ekleme yalnızca çapanın ±296 tick'i içinde (v1.1) |
| K3 | Çapa aynı blok içinde değişmez; her güncelleme eski ortalama ile o ana kadar geçerli tick arasında kalır (`PriceAnchor.fold`) |
| L1 | POL pozisyonundan likidite çıkarılamaz (fonksiyon yok + Halmos). Faz 2.6 testleri: derlenmiş ABI'nin izinli fonksiyon listesine birebir eşitliği (yeni fonksiyon eklenirse test kırılır) ve işlem/ücret/ekleme döngülerinde pozisyon likiditesinin hiç azalmaması. Halmos ispatı sembolik PoolManager gerektirdiği için Faz 2.9'da |

**Ek invariantlar (AI denetimi, ACC-5).** Muhasebeci denetçinin önerdiği invariantlar ana pakete alındı. Kodlar `contracts/audits/ai/ACCOUNTANT.md` §5'tekilerle aynıdır.

| Kod | Invariant | Foundry | Medusa / Echidna |
|---|---|---|---|
| NEW-1 | E2, kontrat dışı yakımlar dahil (oyuncu `burn`'ü) | `invariant/system/System.invariant.t.sol` | `CryticTester` E2 (dış yakım yok) |
| NEW-2 | `emitted` = madenci + kurucu + hazine payları (çekilenler dahil) + referans | aynı | — |
| NEW-3 | `reserve + emitted == CAP + geri dönüşen` | aynı | — |
| NEW-4 | referans ayrımı ≤ hazine payı; R2 | aynı | `CryticTester` R2 |
| NEW-5 | E1 kesin + kayıpsız (yakalama sonrası, en çok 1e6 wei toz) | aynı (durum anlık görüntüsüyle) | — (anlık görüntü yok) |
| NEW-6 | `activeDp` = bitiş takvimindeki DP | aynı | `CryticTester` E3 |
| NEW-7 | yakıt ödenmiş: aktif süre tankla karşılanır | aynı | — |
| NEW-8 | VRGDA satış sayacı, yeniden çapalama sürekliliği, hurda kredisi formülü | aynı | — |
| NEW-9 | B1 penceresi birebir; T3 bütünleşik sistemde | aynı | `CryticTester` B1 |
| NEW-10 | Market Open girdileri genesis'ten sonra donar | aynı | — |
| NEW-11 | R1 köken bazında (her kova, `setSplit` dahil) | aynı | `CryticTester` R1 |
| NEW-12 | P2 modeli (pause, uzatma, kaldırma) | aynı | `CryticTester` P2 |
| NEW-13 | E5/E6 her `HourClosed`'da | aynı | — |
| NEW-14 | S1 cüzdan ödemesi dahil | aynı | `CryticTester` S1 |
| NEW-15 | M2 eklemeli katalog | aynı | `CryticTester` M2 |
| NEW-17 | L1 rastgele işlem dizilerinde (üçüncü taraf alım/satım, JIT, buyback, ekleme, ücret) | `invariant/market/Market.invariant.t.sol` | `recon/market/CryticMarketTester` |
| NEW-18 | BuybackBurner'dan geçen ETH korunur; kontratta ETH kalmaz | aynı | aynı |
| NEW-19 | POL kovası ve MOHN yakımları korunur; R1 | aynı | aynı |
| NEW-20 | Market Open bir kez | aynı | aynı |
| NEW-25b | Her başarılı yakıt alımından hemen sonra tank, o anki tavanın (yakıt hattı kapasitesi × `maxTankHours`) altındadır. Tavan geriye dönük değildir: sonradan düşürülen tavan, alınmış yakıtı tankta bırakır. Bu yüzden "tank ≤ tavan her an" bir kontrat özelliği değildir (AI denetimi ACC-6) | `invariant/MiningCoreFuel.invariant.t.sol` (Timelock tavan değişikliği dahil) | `CryticTester` |
| K1–K3 | (yukarıda) | aynı + `unit/PriceAnchor.t.sol`, `integration/Market.t.sol` | aynı |

Medusa/Echidna sütununda "—" olanlar Foundry'ye özgü araçlara dayanır: durum anlık görüntüsü ya da olay okuma. Bunlar Foundry'nin derin profilinde (`FOUNDRY_PROFILE=deep`) uzun koşar. Piyasa özellikleri için ayrı bir test kontratı var: MiningCore ile Uniswap kodu tek kontrata 96 KB sınırı içinde sığmıyor. Bu kontratta MiningCore'un rolünü tester üstlenir: minter, yatıran ve `openMarket` çağıran tester'dır.

Her invariant için: **Foundry invariant handler** (çok aktörlü rastgele işlem dizileri + zaman atlama) + gece **Medusa/Echidna** kampanyası (Chimera iskeleti, aynı özellikler) + kritik olanlar (T1, T2, E2, L1, P2) için **Halmos/Certora** biçimsel ispat.

---

## 3. Test piramidi ve araçlar

| Katman | Araç | Kapsam / hedef |
|---|---|---|
| Birim | `forge test` | Her fonksiyon, her revert yolu; satır + dal kapsamı **≥ %95** (core) |
| Fuzz | Foundry fuzz (10,000 koşu CI, 100,000 gece) | Sayısal kenarlar: 0, 1 wei, max, saat sınırları |
| Invariant | Foundry invariant (1,000 koşu × derinlik 100) | §2 kataloğu |
| Uzun kampanya | **Medusa** + **Echidna** (Recon **Chimera**) | Gece ve denetim öncesi 24–72 saat |
| Biçimsel | **Halmos** (açık), **Certora** (açık kaynak sürümü) | T1, T2, E2, L1, P2 |
| Diferansiyel | `/sim/vectors/*.json` ↔ Solidity | Emisyon, VRGDA, saha maliyeti, market açılışı formülleri birebir |
| Mutasyon | **Gambit** (Certora, açık kaynak) — Foundry 1.8.5'te yerleşik mutasyon testi yok (araştırmadaki bilgi yanlıştı) | Mutant öldürme oranı ≥ %90 (core) |
| Fork | Testnet 46630 fork | Chainlink feed, Uniswap v4, Safe, EntryPoint gerçek adresleri. Uniswap v4: PoolManager'ın zincirdeki runtime kodu `test/fixtures`'ta; testler onu kanonik adrese yerleştirir ve kod hash'ini mainnet/testnet'ten okunan `0xbd38…5626` ile karşılaştırır (CI'da RPC gerekmez) |
| Statik | **Slither**, **Aderyn**, `forge lint --deny warnings`, Solhint | Sıfır yüksek/orta bulgu (veya gerekçeli istisna dosyası) |
| Gas | `forge snapshot --check` | Regresyon > %5 → CI kırmızı |
| AI ön tarama | 2–3 farklı AI denetçi (yalnızca ön tarama) | Bulgular issue'ya; denetimin yerini **tutmaz** |
| TS birim | Vitest | sdk formülleri (sim ile parite), API mantığı |
| E2E | **Playwright** + anvil (yerel zincir) | Kayıt → yakıt → makine → rafine akışı, mobil viewport |
| Yük | k6 | API ve indeksleyici (lansman günü × 10 trafik) |
| Web güvenlik | OWASP ZAP, Semgrep, gitleaks, CSP denetimi | CI + lansman öncesi manuel pentest |

### 3.1 Ölü ve gereksiz kod politikası

- Solidity: Slither `dead-code` + `unused-state` + `unused-return` dedektörleri, Aderyn kullanılmayan kod uyarıları, kapsam raporunda **erişilemeyen dal = hata**.
- TypeScript: **knip** (kullanılmayan dosya/export/bağımlılık), `tsc --noUnusedLocals --noUnusedParameters`, ESLint `no-unused-vars`, `depcheck`.
- Python (sim): `ruff` (F401/F841), `vulture`.
- CI bunlardan herhangi biri bulgu verirse **birleştirme yasak**.

### 3.2 CI hattı (GitHub Actions, her PR)

```
contracts:  forge fmt --check → forge lint --deny warnings → forge build --sizes
            → forge test (fuzz 10k, invariant 1k) → forge coverage (eşik) → forge snapshot --check
            → slither (config + istisna dosyası) → aderyn → halmos (kritik özellikler)
            → diferansiyel testler (sim vektörleri)
sim:        ruff → vulture → python -m unittest → kısa senaryo koşusu (kabul kriterleri)
ts:         npm ci → typecheck → eslint → knip → vitest → build
e2e:        anvil + deploy script → playwright
security:   gitleaks → semgrep → npm audit → dependency review
nightly:    medusa 6s + echidna 6s → fuzz 100k → mutasyon testi → rapor artefaktı
```

Branch koruması: `main`'e doğrudan push yok, en az 1 inceleme (AI + insan), tüm kontroller yeşil.

---

## 4. Dağıtım (deploy) prosedürü

1. **Deterministik build:** sabitlenmiş solc ve bağımlılık sürümleri; bytecode hash'i yayımlanır.
2. **Script:** `Deploy.s.sol` → adresleri önceden hesaplar (token minter = MiningCore proxy), deploy eder, `Configure.s.sol` parametreleri ayarlar, `Handover.s.sol` tüm rolleri Timelock/Safe'e devreder ve **deployer'ın hiçbir rolü kalmadığını assert eder**.
3. **Doğrulama:** tüm kontratlar Blockscout'ta doğrulanır (implementasyon + proxy).
4. **Yayın:** `/contracts` sayfası + GitHub: adresler, roller, Safe sahipleri, timelock gecikmesi, bytecode hash, denetim raporları.
5. **Testnet provası:** aynı script testnet'te en az 2 kez uçtan uca koşulur; mainnet'te birebir aynı komutlar.

---

## 5. Bütçesiz güvenlik planı: katmanlı savunma + korumalı lansman + gelirle denetim

> **Kurucu kararı:** Lansman öncesi ücretli denetim bütçesi yok. Bu, projenin en büyük teknik riski. Aşağıdaki plan riski sıfırlamaz. Amacı, (1) hata olasılığını ücretsiz araçlarla en aza indirmek, (2) bir hata olursa zararın boyutunu kontratta kodlanmış sınırlarla küçültmek ve (3) oyunun kendi geliriyle bağımsız denetimi lansmandan sonra yaptırmak.

### 5.1 Hata olasılığını azalt

| Katman | Ne yapılır |
|---|---|
| Kapsamı küçült | v1'de NFT, pazar yeri, kilit-güçlendirme, anti-snipe hook'u, sponsorlu gas yok. Hedef v1 kapsamı **≤ 1,200 nSLOC**. Her satır bir saldırı yüzeyi. |
| Denetlenmiş yapı taşları | OpenZeppelin (ERC20, Permit, AccessControl, Timelock, UUPS), Solady matematik, Paradigm VRGDA referans mantığı; kendi kodumuzda tekerleği yeniden icat etme |
| Ücretsiz araçların tamamı | §3'teki tüm katmanlar: fuzz, invariant, Medusa/Echidna 72 saat, mutasyon ≥ %90, Slither/Aderyn temiz |
| Biçimsel ispat | Halmos ile T1, T2, E2, L1, P2 ve "günlük mint tavanı aşılamaz" özellikleri **ispatlanır** (test değil, ispat) |
| Çoklu AI denetimi | En az 3 ayrı oturum, farklı rollerle: "saldırgan" (istismar yazmaya çalışır), "muhasebeci" (invariant'ları bozmaya çalışır), "spesifikasyon denetçisi" (kod ↔ docs/02 farkı). Ek olarak başka bir AI asistanının ücretsiz katmanı. Her bulgu → issue → test → düzeltme. |
| Herkese açık inceleme dönemi | Kontratlar mainnet'ten **≥ 4 hafta önce** GitHub'da açık + testnet betası. X'te "kırmaya çalışın" çağrısı. |
| Hibe | Denetim sübvansiyonu ve buildathon başvuruları (08 §4) |

### 5.2 Hatanın zararını sınırla (korumalı lansman / "Guarded Launch")

| Sınır | Nerede | Değer (simülasyonla doğrulanacak) | Neyi önler |
|---|---|---|---|
| **Günlük mint tavanı** | MohnToken (**immutable**) | 500,000 MOHN / UTC günü (%0.5 CAP; en yüksek meşru gün 141K) | Sonsuz mint açığı bile günde en fazla %0.5 basabilir; pause için zaman kazandırır |
| Saatlik mint sınırı | MiningCore | Kayan 60 dakikada en çok 150K; aşacak mint geri çevrilir; izleme uyarısı → Guardian pause (≤ 15 dk hedef) | Anormal mint'i saatte 150K ile sınırlar; kimse sınırı kötüye kullanıp oyunu donduramaz |
| ETH kovalarının günlük süpürülmesi | Router + Keeper | Ops → Safe her gün; buyback/POL günlük tavanla harcanır | Kontratlarda bekleyen ETH = birkaç günlük gelir |
| İşlem başı ve hesap başı sınırlar | MiningCore | 02 §6.2 işlem başı üst sınır; genesis tank üst sınırı | Tek işlemle büyük hasar |
| Pause | Guardian | ≤ 72 saat, otomatik biter | Hızlı müdahale, kalıcı hapis yok |
| Açık uyarı | Web sitesi | **"Unaudited — use at your own risk"** bandı, bağımsız denetim tamamlanana kadar | Dürüstlük; araştırma: "denetim raporu ya da açık bir 'denetlenmedi' uyarısı" |

### 5.3 Gelirle denetim (lansman sonrası)

1. Lansmandan önce ilan edilir: "Ops kasası X'e ulaşınca bağımsız denetim yaptırılacak." (08 §3)
2. Bug bounty fonu (ETH) ops gelirinden; ek olarak hazine payından MOHN. Ödül tablosu SECURITY.md'de.
3. Denetim tamamlanana kadar: "Unaudited" bandı kalır, Guarded Launch sınırları gevşetilmez, **kemikleşme yapılmaz**.
4. Denetimden sonra: rapor yayımlanır, bulgular düzeltilir (timelock'lu yükseltme), sınırlar timelock ile kademeli gevşetilir.

**Denetçiye hazırlık paketi (ileride):** mimari doküman, invariant listesi, tehdit modeli, sim raporu, %95+ kapsam raporu, Halmos ispatları, AI denetim bulguları ve düzeltmeleri, bilinen sorunlar, deploy script'i.

---

## 6. Operasyon güvenliği

### 6.1 Anahtar yönetimi
- Safe imzacıları: **donanım cüzdanı** (Ledger/Trezor/Keystone; net imzalama destekli), her imzacıya ayrı adres, kurtarma ifadeleri fiziksel olarak ayrı yerlerde.
- Her Safe işleminde hash, `safe-tx-hashes-util` ile bağımsız doğrulanır; iki farklı arayüzde kontrol.
- Keeper sıcak anahtarı: KMS/Infisical'da, düşük bakiye, yalnızca KEEPER rolü.
- Sunucuda **ödül imzalayan anahtar yok** (ADR-007).

### 6.2 Olay müdahale runbook'ları (`docs/runbooks/`)
1. **Anormal mint / muhasebe şüphesi:** Guardian `pause()` (≤ 15 dk hedef) → durum tespiti → herkese açık bildirim (şablon 05'te) → düzeltme + timelock'lu yükseltme veya unpause.
2. **Oracle bayat (> 26s) / sequencer sorunu:** otomatik (yakıt alımı durur) → durum sayfası güncellemesi.
3. **Keeper ele geçirildi:** Timelock ile keeper değiştir (96s); tavanlar zararı sınırlar.
4. **Arayüz/DNS ele geçirildi:** Cloudflare kilidi, X'ten uyarı, kontrat adresleri sabit.
5. **Zincir kesintisi:** iletişim; tahakkuk otomatik doğru.
6. **Zincir kapanma duyurusu:** göç planı: son durum anlık görüntüsü (indeksleyici + zincir), yeni zincirde Merkle tabanlı devam.

Yılda en az bir **tatbikat** (pause → bildirim → unpause, testnet'te).

**Uygulama (Faz 6.2, 2026-10-12):** `docs/runbooks/` altında her senaryo için ayrı dosya var: kim, hangi araç, hangi Safe işlemi, hangi şablon. Tatbikat prosedürü ve sonuç tablosu `tatbikat.md`'de. Otomatik prova keeper anvil E2E'sinde: Guardian pause → oyuncu işlemi simülasyonda `ProtocolPaused` ile reddediliyor → indeksleyicide kritik `MiningCore.Paused` uyarısı → Params Timelock'tan `unpause` (96 saat) → oyuncu yeniden yakıt alıyor.

---

## 7. Gizlilik ve veri

- KVKK/GDPR: toplanan veri en az (e-posta varsa giriş sağlayıcısında; biz yalnızca sağlayıcı kullanıcı kimliği + cüzdan + bağlı X kullanıcı adı). Aydınlatma metni ve gizlilik politikası.
- IP logları kısa süre saklanır (anti-bot), sonra anonimleştirilir.
- 18+ yaş beyanı, yaptırım taraması (Chainalysis ücretsiz oracle/API), kapsamlı yaptırım altındaki ülkelerin geo-block'u (hukuki görüşe göre genişletilir).

---

## 8. Lansman öncesi güvenlik kontrol listesi

- [ ] Tüm CI kontrolleri yeşil; kapsam ≥ %95; mutasyon ≥ %90
- [ ] Medusa/Echidna 72 saat kampanyası temiz
- [ ] Halmos/Certora kritik özellikler ispatlandı
- [ ] Çoklu AI denetimi (≥ 3 rol) tamamlandı; her bulgu test + düzeltme ile kapatıldı (`contracts/audits/AI_REVIEW.md`)
- [ ] Kontratlar ≥ 4 hafta herkese açık GitHub'da; gelen tüm bulgular kapatıldı
- [ ] Testnet betası ≥ 2 hafta, bilinen kritik/yüksek bulgu yok
- [ ] Korumalı lansman sınırları (§5.2) kontratta ve testli: günlük mint tavanı (Halmos ispatı), saatlik devre kesicisi, ETH süpürme
- [ ] Sitede "Unaudited" bandı ve gelirle denetim taahhüdü yayında
- [ ] Deploy script'i testnet'te 2 kez uçtan uca koştu; Handover assert'leri geçti
- [ ] Tüm kontratlar Blockscout'ta doğrulandı; `/contracts` sayfası yayında
- [ ] Safe imzacısı en az 1 donanım cüzdanlı; tatbikat yapıldı
- [ ] OZ Monitor uyarıları test edildi (sahte olaylarla)
- [ ] SECURITY.md + bug bounty kuralları yayında (ödül: hazine payından MOHN + ops gelirinden ETH taahhüdü)
- [ ] ZAP taraması temiz; CSP/SRI/DNSSEC/registrar kilidi aktif
- [ ] Hukuki risk: en az tek seferlik danışmanlık yapıldı **veya** kurucu riski bilerek üstlendiğini kayda geçirdi; metinler 05 §6 dil rehberine uygun
