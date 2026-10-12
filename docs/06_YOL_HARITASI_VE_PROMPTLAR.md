# 06 — Yol Haritası ve Adım Adım Promptlar (v0.1)

> **Nasıl kullanılır:** Fazlar sırayla ilerler; her fazın sonunda bir **kapı (gate)** vardır, kapı geçilmeden sonraki faza başlanmaz. Her adımın altında Claude Code'a kopyalayıp yapıştıracağın hazır bir **prompt** var. Promptlar bu repodaki dokümanlara referans verir; dokümanlar güncellendikçe promptlar da geçerli kalır.
>
> **Genel kurallar (her adımda geçerli):** Her iş ayrı bir git branch'inde yapılır. Test yazılmadan özellik "bitti" sayılmaz. Ekonomi parametresi değişirse önce `docs/02`, sonra `sim` güncellenir. Adım bitince Claude özet + test çıktısı + açık riskleri raporlar; commit/PR senin onayınla yapılır.

---

## Zaman çizelgesi (gerçekçi)

| Faz | İçerik | Süre | Paralel mi? |
|---|---|---|---|
| 0 | Kararlar, hukuk, hesaplar, zincir doğrulama, parametre dondurma | 1–3 hafta | — |
| 1 | Repo iskeleti + CI + güvenlik araç zinciri | 3–5 gün | — |
| 2 | Akıllı kontratlar + testler | 3–5 hafta | — |
| 3 | İndeksleyici, API, keeper, izleme | 2–3 hafta | 2'nin ikinci yarısıyla paralel |
| 4 | Oyun istemcisi ve web | 3–5 hafta | 3 ile paralel |
| 5 | Admin paneli | 1–2 hafta | 4 ile paralel |
| 6 | Altyapı ve operasyon | 1 hafta | 4–5 ile paralel |
| 7 | Çoklu AI denetimi + herkese açık inceleme (≥ 4 hafta) + testnet betası | 4–6 hafta | Sıfır bütçe: ücretli denetim lansmandan sonra, oyunun geliriyle (04 §5) |
| 8 | Marka, topluluk, X kampanyası | T−42 günden itibaren | 4–7 ile paralel |
| 9 | Mainnet lansmanı (Genesis + Market Open) | 1 hafta | — |
| 10 | Canlı operasyon, sezonlar, büyüme | Sürekli | — |

**Mainnet'e gerçekçi süre: ~4–5 ay.** ([a competitor] 13 günde çıktı ve ilk 48 saatte dokuz ayrı hata yaşadı. Hız değil, güven farklılaştırır.)

---

## FAZ 0 — Kararlar ve hazırlık

### 0.1 Konsept ve isim onayı (sen) — ✅ 2026-10-10: Konsept A (yeraltı sondaj kolonisi), **Mohonaut / $MOHN** (2026-10-11), ops payı %15, dış bütçe yok
- `docs/01_OYUN_TASARIMI.md` §2 konsept seçimi ve `docs/05_MARKA_LANSMAN_X.md` isim kısa listesi.
- **Kalan iş:** X handle'larını (@mohonaut, @playmohonaut, @mohonautgame, @mohonauthq, @mohonauts) ve mohonaut.com + mohonaut.gg'yi **isim ilan edilmeden hemen** rezerve et; domain lansmandan ≥ 30 gün önce yayında olmalı (09 §6). GitHub org aç.

### 0.2 Hukuki risk (sen)
- Bütçe yok; yine de **en az tek seferlik bir danışmanlık** öneriyorum (ücretsiz ilk görüşme veren bürolar dahil). `docs/07_HUKUK_SORU_LISTESI.md` A ve B bölümleri öncelikli.
- Danışmanlık yapılamazsa: 07 §4'teki en temkinli varyantlar uygulanır (İngilizce iletişim, Türkçe token tanıtımı yok, sezon ödülleri yalnızca kozmetik) ve kurucu riski bilerek üstlendiğini kayda geçirir.
- **Çıktı:** Görüş özeti `docs/legal/GORUS_OZETI.md` (gizli detaylar repoya konmaz). Gerekirse §4'teki tasarım varyantı seçilir.

### 0.3 Hesaplar ve donanım (sen)
- **En az 1 donanım cüzdanı** (atlanmaması gereken tek güvenlik harcaması), ücretsiz şifre yöneticisi (Bitwarden), ücretsiz hesaplar: Alchemy, Cloudflare, Sentry, GitHub, WalletConnect project ID; kurucu ve proje X hesapları (2FA).

### 0.6 Hibe başvuruları (sen + Claude)

```text
docs/08_ARACLAR_VE_MALIYET.md §4'teki programları (Arbitrum Open House, Robinhood Chain buildathon, Arbitrum ekosistemi denetim sübvansiyonları, hackathonlar) web'den güncel koşullarıyla araştır: açık mı, son tarih, uygunluk, istenen belgeler. Sonra docs/01–04'ü kullanarak her biri için İngilizce başvuru metni taslağı hazırla (proje özeti, adil madencilik lansmanı, güvenlik yaklaşımı, açık kaynak taahhüdü, yol haritası). Getiri/fiyat dili kullanma (05 §6) ve hiçbir rakip projenin adını anma (05 §6.4b). Taslakları docs/grants/ altına yaz.
```

### 0.4 Robinhood Chain gerçeklerini doğrulama — ✅ 2026-10-10 (`docs/ZINCIR_DOGRULAMA.md`)

```text
docs/03_TEKNIK_MIMARI.md içindeki ✱ işaretli tüm varsayımları Robinhood Chain testnet (46630) ve mainnet (4663) üzerinde doğrula. Hiçbir işlem gönderme, yalnızca okuma yap (RPC çağrıları, Blockscout, resmi dokümanlar). Kontrol listesi:
1) Chainlink ETH/USD fiyat beslemesi ve L2 Sequencer Uptime Feed adresleri (mainnet+testnet), heartbeat ve ondalık sayısı.
2) Uniswap v4 PoolManager, PositionManager, UniversalRouter, Permit2 adresleri (mainnet+testnet).
3) Safe singleton/factory adresleri ve Safe{Wallet} arayüz desteği; ERC-4337 EntryPoint v0.7/v0.8.
4) Desteklenen EVM sürümü: PUSH0, MCOPY, transient storage (TSTORE/TLOAD), EIP-7702 — testnet'e deploy etmeden, eth_call ile küçük bytecode simülasyonları veya resmi dokümanla doğrula; doğrulanamayanı açıkça belirt.
5) Dynamic ve Privy'nin Robinhood Chain gömülü cüzdan desteği ve ücretsiz kademe limitleri; RainbowKit/WalletConnect ile Robinhood Wallet bağlantısı; Alchemy ücretsiz kademe RPC/WSS limitleri.
6) Blockscout doğrulama komutu ve API.
Sonuçları kaynak linkleriyle docs/ZINCIR_DOGRULAMA.md dosyasına yaz; docs/03'teki ✱ işaretlerini doğrulananlar için kaldır, çelişenleri düzelt ve bana fark listesini raporla.
```

### 0.5 Ekonomi parametrelerini dondurma (v1) — ✅ 2026-10-11 (`docs/02` v1.0)

```text
docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md v0.2'yi ve sim/RAPOR.md'yi oku. Önce simülasyonu v0.2'ye eşitle: sim/params.json'u v0.2 değerlerine çek (r=2000, ETH 55/30/15, §12 müdahale kuralı, §13 yeni ölçüt tanımları) ve §11'deki genesis tank üst sınırını (Market Open + 24 saat) modele ekle; testleri ve 7 senaryoyu 200 tohumla yeniden koş (uzun koşuları arka planda çalıştır). Sonra sim/RAPOR.md'ye "v0.2 doğrulaması" bölümü ekle. Kalan önerileri docs/02 ile karşılaştır. Bana her öneri için: (a) gerekçe, (b) ölçülen etkisi, (c) kabul/ret önerin olan bir tablo sun. Ben onayladıktan sonra: docs/02'yi güncelle (sürümü v1.0 yap, değişiklik günlüğü ekle), sim/params.json'u eşitle, tüm sim testlerini ve senaryoları yeniden koş, kabul kriterleri tablosunu güncelle, sim/vectors altındaki test vektörlerini yeniden üret. Hiçbir kabul kriteri kırmızıysa beni uyar ve parametreyi dondurma.
```

**🚪 Kapı 0:** İsim + handle + alan adı alındı · hukuki görüş yazılı · zincir gerçekleri doğrulandı · `docs/02` v1.0 donduruldu · hibe başvuruları gönderildi.

---

## FAZ 1 — Repo iskeleti, CI ve kalite kapıları — ✅ yerelde tamam (2026-10-11); CI ilk push'ta doğrulanacak

### 1.1 Monorepo iskeleti

```text
docs/03_TEKNIK_MIMARI.md §2'deki monorepo yapısını kur: npm workspaces + Turborepo, Node 24, TypeScript strict. Klasörler: contracts, sim (mevcut, dokunma), apps/web, apps/admin, services/indexer, services/api, services/keeper, packages/sdk, packages/config, infra, docs. Her TS paketi için: tsconfig (packages/config'ten extend), eslint, prettier, vitest, knip yapılandırması. Kök scriptler: build, test, lint, typecheck, knip, format. .editorconfig, .gitignore (.env*, .venv, out, cache, broadcast), .nvmrc, CODEOWNERS, PR şablonu (test kanıtı + güvenlik etkisi bölümleriyle), SECURITY.md (sorumlu ifşa politikası). git init yap, main branch'i oluştur. Henüz uygulama kodu yazma; yalnızca boş ama derlenen iskelet ve her pakette 1 örnek test. Tüm komutları çalıştırıp yeşil olduğunu göster.
```

### 1.2 Foundry projesi ve güvenlik araç zinciri

```text
contracts/ altında Foundry projesini kur (Foundry ≥ 1.8, docs/ZINCIR_DOGRULAMA.md'deki EVM sürümüne göre foundry.toml). Bağımlılıklar: OpenZeppelin Contracts + Contracts Upgradeable (5.x, sabit sürüm), Solady (FixedPointMathLib), forge-std. Profiller: default (fuzz 10000, invariant runs 1000 depth 100), ci, deep (fuzz 100000). Ekle: slither.config.json (+ gerekçeli istisna dosyası şablonu), aderyn.toml, medusa.json ve echidna.yaml (Recon Chimera iskeleti ile ortak property dosyası), halmos yapılandırması, solhint. Makefile veya justfile: test, coverage (lcov + eşik kontrolü %95), snapshot, slither, aderyn, medusa, echidna, halmos, mutate. GitHub Actions: docs/04_GUVENLIK_TEST_DENETIM.md §3.2'deki contracts, sim, ts, security işleri ve nightly iş. Boş bir örnek kontrat + testle tüm hattın çalıştığını yerelde göster. Ölü kod araçlarının (slither dead-code, knip, vulture) CI'da hata verdiğini kasıtlı bir örnekle kanıtla, sonra örneği sil.
```

### 1.3 Proje hafızası

```text
Kök dizindeki CLAUDE.md dosyasını oku ve Faz 1 sonunda gerçek komutlarla (build/test/lint) güncelle. Kuralları koru, yalnızca komut ve yolları netleştir.
```

**🚪 Kapı 1:** `npx turbo run test`, `forge test`, `python -m unittest` ve tüm CI işleri yeşil · ölü kod araçları çalışıyor.

---

## FAZ 2 — Akıllı kontratlar

> Her alt adım: önce testler/özellikler (TDD), sonra kod. Her adım sonunda `slither`, `aderyn`, `forge coverage` raporu.

### 2.1 MohnToken — ✅ 2026-10-11

```text
docs/02 §2 ve docs/03 §3.2'ye göre contracts/src/MohnToken.sol yaz: ERC20 + ERC20Permit + ERC20Burnable, CAP=100_000_000e18 immutable, minter constructor'da immutable, owner/blacklist/vergi/pause YOK. Testler: unit (mint yetkisi, CAP sınırı, permit, burn), fuzz (rastgele mint dizileri CAP'i aşamaz), günlük mint tavanı (DAILY_MINT_CAP = 500_000e18 / UTC günü, immutable; tavan dolunca revert). Halmos ile biçimsel özellikler: prove_onlyMinterCanMint, prove_totalSupplyNeverExceedsCap, prove_dailyMintNeverExceedsCap. Mutasyon testiyle mutantların öldürüldüğünü göster. Kapsam %100.
```

### 2.2 Emisyon ve ödül muhasebesi çekirdeği — ✅ 2026-10-11 (`MiningAccounting.sol`)

```text
docs/02 §3–§4 ve docs/03 §3.4'e göre MiningCore'un emisyon/muhasebe çekirdeğini yaz: contracts/src/lib/EmissionLib.sol (saatlik epoch, rezerv tabanlı E_h = R·δ_h, WAD sabit nokta; δ_h değerini sim/vectors'taki tam tamsayı algoritmasıyla birebir aynı hesapla) ve MiningCore'da global checkpoint (_checkpoint), dpEndingAt / accAtHour takvimi, hesap _settle, PREC=1e36 akümülatör, %90/%5/%5 dağılım, poke() (MAX_HOURS_PER_POKE=168). Bu adımda makine/yakıt alımı yerine test için iç fonksiyonları kullanan bir test harness'ı yaz (hesaba doğrudan dp ve expiry atayan). Testler: (1) diferansiyel: sim/vectors'taki ilk 2000 saatin E_h ve R_h değerleriyle birebir eşitlik; (2) invariant handler: çok aktörlü, rastgele zaman atlamalı, saat sınırlarına özel ağırlıklı; docs/04 §2'deki E1–E6 invariant'ları; (3) kenar durumlar: H=0 süreleri (emisyon rezervde kalır), dt=0, aynı blokta çoklu işlem, 168 saatten uzun boşluk + çoklu poke, expiry tam saat sınırında, 1 DP'lik hesap ile 1e9 DP'lik hesap; (4) gas: 168 saatlik poke'un gas maliyeti raporu. UUPS + ERC-7201 depolama düzenini bu adımda kur.
```

### 2.3 Yakıt (Chainlink ile ETH ödemesi) — ✅ 2026-10-11 (`MiningCore.sol` yakıt modülü)

```text
docs/02 §5 ve docs/03 §3.3'e göre buyFuel() ve tank modelini MiningCore'a ekle: ETH → ℓ (Chainlink ETH/USD proxy adresi docs/ZINCIR_DOGRULAMA.md'den; bayatlık eşiği 26 saat; sequencer uptime feed bu zincirde YOK → feed adresi address(0) ise kontrol atlanır, tanımlıysa kontrol edilir; testnet'te MockV3Aggregator deploy et); buyFuel kayıtlı olmayan hesabı otomatik kaydeder (ilk giriş tek işlem), tank tüketimi, saat sınırına hizalı expiry, setActive(type,count), kapasite kontrolü, ETH'nin RevenueRouter'a iletimi (şimdilik basit bir mock router), π_ℓ parametresi (sınır + hız limiti). Testler: mock feed ile bayat/negatif/sequencer down senaryoları (yalnızca yakıt alımı durmalı, kazım devam etmeli), tank matematiği fuzz, expiry yuvarlama, invariant E3/E4'ün yakıt akışıyla korunması, reentrancy saldırgan kontratı, fork testi (testnet gerçek feed).
```

### 2.4 Kuleler, saha ve VRGDA — ✅ 2026-10-11 (`MiningCore.sol` makine/saha modülü, `lib/VrgdaMath.sol`)

> Uygulamadaki adlar (tema v0.2): `upgradeOutpost` → `upgradeSite`, `scrap` → `scrapMachines`, `setActive` → `setActiveRigs`, `addMachineType` → `addMachineGeneration` (bir seferde bir nesil). Kod boyutu için ADR-011.

```text
docs/02 §6–§7'ye göre katalog (Gen-1 tablosu, eklenebilir ama değiştirilemez), register(referrer) + ücretsiz Pilot Rig, buyMachines (LinearVRGDA kapalı form maliyet, Solady expWad/lnWad, tier primi, işlem başı üst sınır, maxCost slippage koruması, önce rafine edilmemiş bakiyeden ödeme, %80 kalıcı yakım/%20 rezerv), upgradeOutpost (150·L^2.2·idx, idx clamp), scrap (%20 hurda kredisi), slot/kapasite kısıtları, addMachineType (stratum eşiği + verim tavanı + 45 gün aralık; yalnızca timelock). Testler: sim/vectors VRGDA ve üs maliyeti vektörleriyle diferansiyel eşitlik; invariant V1, V2, S1, M1, M2; toplu alım indirimi olmadığının fuzz kanıtı; taşma sınırları (çok ileri/geri satış durumları); harcama sonrası E2 arz invariant'ı.
```

### 2.5 Rafineri ve referans — ✅ 2026-10-11 (`MiningCore.sol` rafineri modülü)

> Uygulamadaki adlar: `claimDev`/`claimTreasury` → `withdrawDevShare`/`withdrawTreasuryShare` (oyuncu metinlerinde "claim" yasak). Saatlik mint devre kesicisi (B1) ilk mint yoluyla birlikte bu adımda eklendi. Ücret ve kuyruk süresi ayarları ile hız limitleri Faz 2.7'de.

```text
docs/02 §8–§9'a göre refine(amount, fast) (%8 hızlı ücret: %4 yakım/%4 rezerv; standart 72 saat kuyruk), finalizeRefine (herkes çağırabilir), referans kredisi (%3, hazine payından, koşullar: davet edilen ≥0.003 ETH yakıt harcamış, davet eden aktif), claimDev/claimTreasury. Testler: kuyruk zamanlaması, çift finalize engeli, invariant R2 (referans ≤ hazine payı), E2 arz eşitliği tüm akışlarda, ücret sınırları ve hız limitleri.
```

### 2.6 Gelir yönlendirme, buyback, POL ve Market Open — ✅ 2026-10-11 (`RevenueRouter`, `BuybackBurner`, `LiquidityManager`, `MiningCore.openMarket`)

> Uygulama farkları: PositionManager yok, PoolManager ile doğrudan (ADR-013); LiquidityManager havuzun `beforeInitialize` hook'u (ADR-012). Fork testi yerine zincirdeki PoolManager kodu hash kontrollü yerleştirilir. L1 için Halmos Faz 2.9'da.

```text
docs/02 §10–§11 ve docs/03 §3.5–§3.7'ye göre RevenueRouter (kovalar, bps sınırları, pull ödeme), BuybackBurner (KEEPER, günlük tavan, minOut, Uniswap v4 swap, %100 yakım), LiquidityManager (openMarket: formül fiyatı → sqrtPriceX96, tam aralık pozisyon, likidite ÇEKME FONKSİYONU YOK; addLiquidity tavanlı; collectFees) ve MiningCore.openMarket() (genesis bitişinden sonra, bir kez, P0_USD ve MOHN_LP formülleri, 1M MOHN üst sınırı). Uniswap v4 adresleri docs/ZINCIR_DOGRULAMA.md'den. Testler: fork testleri (testnet v4), invariant R1, L1 (Halmos: likidite azaltılamaz), market open formülünün sim/vectors ile eşitliği, keeper tavan aşımı revert'leri, fiyat manipülasyonu senaryosu (havuzu pompalayıp buyback tetikleme → tavan zararı sınırlıyor mu).
```

### 2.7 Erişim kontrolü, timelock, pause, parametre sınırları — ✅ 2026-10-11 (`setParam`, Guardian pause, router/buyback setter'ları)

> Uygulama: tek tablo tabanlı `setParam`; Guardian pause'u 72 saat + 7 gün bekleme; yükseltme V1→V2 testi. TimelockController'ların kendisi ve rol devri Faz 2.8 deploy script'lerinde. `slither-check-upgradeability` WSL'de koşuldu.

```text
docs/03 §3.8 ve docs/02 §12'ye göre roller: TimelockController (96 saat; upgradeTo için 7 gün — ayrı bir gecikme mekanizması veya ayrı timelock), Guardian pause (en fazla 72 saat, otomatik biter, Guardian unpause edemez), KEEPER, tüm set* fonksiyonlarında kodlanmış sınırlar + hız limitleri (son değişiklik zamanı ve oranı), değiştirilemez parametrelerin gerçekten değiştirilemediğinin testi. UUPS _authorizeUpgrade yalnızca uzun timelock. Testler: her rol için yetkisiz çağrı revert matrisi (otomatik üretilen tablo testi), invariant P1/P2, storage layout uyumluluğu (V1→V2 sahte yükseltme), slither-check-upgradeability.
```

### 2.8 Deploy script'leri ve testnet — ✅ 2026-10-11/12: anvil + testnet 46630 (`deployments/46630*.json`, 9 kontrat Blockscout'ta doğrulandı); oyuncu akışı testnet'te gerçek işlemlerle (yakıt, makine, hızlı ve standart rafine). Denetim düzeltmeli kodla testnet yeniden deploy edilecek

> Uygulama: tek `Deploy.s.sol` (deploy → configure → hand over + `assertHandedOver`), `contracts/script/README.md`, `contracts/.env.example`. Anvil `--code-size-limit 98304` ile (ADR-011). Testnet'te Chainlink yok → keeper'ın güncellediği `ManualEthUsdFeed` (mainnet'te reddedilir).

```text
docs/04 §4'e göre contracts/script altında Deploy.s.sol (adres ön hesaplama: token minter = MiningCore proxy; assert), Configure.s.sol (Gen-1 katalog, parametreler), Handover.s.sol (tüm rolleri Timelock/Safe'e devret; deployer'ın hiçbir rolü kalmadığını assert et), Verify (Blockscout). Ortam değişkenleri .env.example ile belgelensin, gerçek anahtar asla dosyada olmasın (forge --account / donanım cüzdanı ile). Önce yerel anvil'de, sonra testnet 46630'da uçtan uca koş; deploy çıktısını deployments/testnet.json'a yaz; tüm kontratları Blockscout'ta doğrula. Testnet'te bir oyuncu akışını (register → yakıt → makine → bekle → rafine) cast komutlarıyla gerçekleştir ve tx linklerini raporla.
```

### 2.9 İç denetim turu — ✅ 2026-10-12 (`contracts/audits/`: SCOPE, TRACEABILITY, FINDINGS; `test/recon/` property harness)

> Çok ajanlı iç denetim: 7 uzman inceleyici + bulgu başına 3 karşıt doğrulayıcı + tamlık eleştirmeni → 14 doğrulanmış bulgu (1 yüksek), hepsi düzeltildi ya da gerekçeyle kabul edildi (`audits/FINDINGS.md`). Medusa ve Echidna kısa kampanyaları temiz; 6 saatlik kampanyalar gece CI'da. Mutasyon (Gambit) düzeltilmiş kodla yeniden koşuyor; sonuçlar `audits/mutation/results/`. Kalan: E2/P2/L1 için Halmos ispatları (bağımsız denetime not edildi).

```text
Denetçi gözüyle tüm contracts/src'yi incele: Slither ve Aderyn'i koştur ve her bulguyu düzelt ya da gerekçeli istisna dosyasına yaz; Medusa ve Echidna'yı 6'şar saat koştur; mutasyon testini çalıştır ve hayatta kalan her mutant için ya test ekle ya da eşdeğer mutant olduğunu gerekçelendir; docs/04 §1 tehdit modelindeki her satır için "nasıl test edildiğini" gösteren bir izlenebilirlik tablosu üret (contracts/audits/TRACEABILITY.md). Ölü kod, kullanılmayan değişken/olay/hata, gereksiz yetki, sınırsız döngü, yuvarlama yönü hatası ara. Sonra denetim kapsam dokümanını hazırla: contracts/audits/SCOPE.md (nSLOC, kontrat listesi, invariant listesi, bilinen sorunlar, güven varsayımları, harici bağımlılıklar).
```

**🚪 Kapı 2:** Kapsam ≥ %95 · mutasyon ≥ %90 · Slither/Aderyn temiz veya gerekçeli · Medusa/Echidna 6s temiz · testnet'te uçtan uca akış · SCOPE.md hazır → **Faz 7: çoklu AI denetimi + herkese açık inceleme.**

---

## FAZ 3 — İndeksleyici, API, keeper, izleme

### 3.1 İndeksleyici — ✅ 2026-10-12 (`services/indexer`, `packages/sdk` metrikleri ve ABI'ler)

> Testnet'te gerçek veriyle doğrulandı (iki dağıtım). Testler: şema = Drizzle, RPC eşlemesi, sim emisyon vektörüyle saatlik emisyon (wei'si wei'sine), yakım kaynakları ve gün metrikleri, dağılım (Gini/Nakamoto sim vektörüyle), timelock çözümleme, belirlenimcilik (tek parti / blok başına parti / yeniden kurma / yeniden indeksleme / kısılmış akış / aralık sınırlı sağlayıcı aynı tabloları verir). Açık not: saatlik emisyon ancak biri saat sınırından sonra checkpoint yapınca yazılır; keeper (3.3) saatlik `poke` atacak.

```text
services/indexer altında kendi log okuyucumuzu yaz (TypeScript + viem getLogs, Postgres; docs/03 §4.3 ve ADR-010): ~10 saniyede bir yalnızca bizim kontratlarımızın olaylarını blok aralıklarıyla çek, son işlenen bloğu sakla, idempotent upsert yap, RPC kotasını (Alchemy ücretsiz 30M CU/ay) ölçen bir metrik ekle. deployments/testnet.json'daki kontratları ve docs/03 §4.3'teki olayları indeksle. Türetilmiş tablolar: hesaplar, saatlik/günlük ekonomi (emisyon, yakım kaynağa göre, rezerv, H, SR, NE, RCR, P*), VRGDA durum geçmişi, kohortlar (katılım haftası), dağılım (Gini, top-10 payı, Nakamoto), sıralamalar, timelock kuyruğu. Metrik formülleri docs/02'den; packages/sdk'deki TS formülleriyle paylaşılsın. Testler: sabit olay fikstürlerinden beklenen metrik değerleri (sim ile çapraz kontrol), yeniden indeksleme determinizmi.
```

### 3.2 API ve kimlik doğrulama — ✅ 2026-10-12 (`services/api`)

> 44 test: SIWE ve hata durumları (tekrarlanan nonce, yabancı alan/zincir, süresi dolmuş, sahte imza), CSRF, harici JWT adaptörü, crew (5–25, kaptanlık devri), Survey (günde bir, belirlenimci, düzgün dağılımlı), bildirim tercihleri, dünya derinliği ve ekonomi (28 günlük SR), sıralamalar, profil rozetleri, paylaşım kartı (fiyat/kazanç içermez), **yetki matrisi** (6 uç × 6 kimlik), yalnızca eklemeli denetim kaydı, hız sınırları, OpenAPI kapsamı, şema. Canlı testnet verisiyle uçtan uca denendi. k6 yük betiği hazır (`services/api/k6/load.js`); yük testinin kendisi sunucu kurulunca (Faz 6) koşulacak. X hesabı bağlama Faz 4.4'e kaldı.

```text
services/api altında Hono + Zod + Drizzle + Postgres + Redis ile docs/03 §4.2 ve §4.4'ü uygula: SIWE oturumu (birincil), opsiyonel e-posta girişi için Dynamic/Privy JWT doğrulaması bir adaptör arkasında, kendi users tablomuz (auth_provider, provider_user_id, wallet, linked_x, risk_score), profil, crew (oluştur/katıl/ayrıl, 5–25 üye), günlük ücretsiz Survey (sunucu rastgeleliği, ekonomik değeri yok, günde 1, idempotent), başarımlar (indeksleyiciden türetilen), sezon sıralamaları, paylaşım kartı PNG üretimi (Satori + resvg; kazanç/USD rakamı içermez), bildirim tercihleri, admin API (RBAC + append-only audit log). Anti-bot: Cloudflare Turnstile sunucu doğrulaması, IP/ASN/cüzdan rate limit (Redis). OpenAPI şeması üret. Testler: vitest birim + supertest entegrasyon; yetki matrisi testi; rate limit testleri; k6 yük betiği.
```

### 3.3 Keeper — ✅ 2026-10-12 (`services/keeper`)

> Anvil üzerinde zaman atlamalı uçtan uca test: gerçek deploy script'i + zincirdeki PoolManager bytecode'u + 3 oyuncu + indeksleyici + keeper; ön dolum → genesis saatleri → Market Open → buyback → likidite ekleme → standart rafinenin tamamlanması. CI'da Postgres ile (iki keeper kilit testi dahil). Canlı testnet'te anahtarsız `DRY_RUN` ile doğrulandı. Not: playground2'de genesis sırasında yakıt alınmadığı için Market Open kalıcı olarak `NoGenesisActivity` ile reddediliyor (beklenen davranış).

```text
services/keeper altında docs/03 §4.5'teki işçileri yaz: saatlik poke (gerekliyse), olgun rafine kuyruklarını finalize, günlük executeBuyback ve addLiquidity (minOut zincir dışında hesaplanır, tavanlar kontrattan okunur), keeper bakiye ve son başarılı iş metrikleri (Prometheus). Anahtar yalnızca ortam/sır yöneticisinden; idempotent ve yeniden denemeli; aynı anda iki keeper çalışırsa çift işlem yapmasın (Redis kilit). Testler: anvil üzerinde zaman atlamalı entegrasyon.
```

### 3.4 İzleme ve uyarı — ✅ 2026-10-12 (`infra/monitoring`, `services/indexer/src/alerts`, ADR-014)

> OpenZeppelin Monitor yerine indeksleyici tabanlı zincir uyarıları (blok blok tarama ücretsiz RPC'ye sığmıyor). Prometheus kuralları `promtool` birim testleriyle, zincir kuralları ve Telegram teslimatı indeksleyici testleriyle kanıtlandı; Grafana panoları (indeksleyici, keeper, API), Loki + Alloy log toplama, Uptime Kuma durum sayfası tanımlı. **Kalan:** gerçek Telegram sohbetine canlı teslimat, kurucu botu açınca bir sonraki testnet dağıtımıyla (rol olayları) yapılacak; sunucu kurulumu Faz 6.

```text
infra/monitoring altında: OpenZeppelin Monitor (self-host) kuralları — emisyon eğrisinden sapan mint, rol/yükseltme/pause/timelock olayları, büyük transferler, LP olayları, keeper bakiyesi düşük; bildirim Telegram + e-posta. Prometheus + Grafana panoları (API, indeksleyici gecikmesi, keeper), Loki log toplama, Uptime Kuma + herkese açık /status. Her uyarıyı testnet'te sahte olayla tetikleyip ulaştığını kanıtla.
```

**🚪 Kapı 3:** Testnet verisiyle tüm metrikler sim ile tutarlı · API yük testi geçti · uyarılar test edildi.

---

## FAZ 4 — Oyun istemcisi ve web

### 4.1 Tasarım sistemi — ✅ 2026-10-12 (`apps/web`: Next.js 16 statik dışa aktarım, Tailwind v4)

> Token'lar `src/app/globals.css` (docs/05 palet ve tipografi; koyu birincil, açık tema uzun okuma için; durum renkleri temaya göre). Bileşenler: Button, Card, Badge/StratumBadge, Table, Counter (formülden canlı değer), BoreLog (imza öğe), TankGauge, Toast (polite/assertive), Modal (odak tuzağı). `/design` sayfası. Testler: WCAG kontrastı CSS'ten hesaplanır (her tema, her yüzey), bileşen davranışı (Vitest + Testing Library), Playwright ile axe taraması (0 ihlal), klavye ve azaltılmış hareket; görsel anlık görüntüler CI'daki resmi Playwright Linux imajında. Paylaşım kartı da marka paletine geçirildi.

```text
docs/05_MARKA_LANSMAN_X.md'deki marka kimliğine (renkler, tipografi, ton) göre apps/web'de Tailwind tabanlı tasarım sistemi kur: token'lar (renk/aralık/tipografi), bileşenler (buton, kart, tablo, sayaç, derinlik göstergesi, tank göstergesi, toast, modal), açık/koyu tema (oyun koyu birincil), erişilebilirlik (kontrast, klavye, reduced-motion). Storybook veya basit bir /design sayfası. Playwright görsel regresyon anlık görüntüleri.
```

### 4.2 Landing, dokümanlar, ekonomi ve kontrat sayfaları — ✅ 2026-10-12 (iskelet ve içerik; canlı veri API ile)

> Landing (docs/05 §3.2 S1–S12; "saatlik devre kesici" ifadesi v1.0.1'e göre "saatte en çok 150K mint" olarak güncellendi), /docs (oyuncu rehberi, ekonomi kâğıdı, rafineri, genesis; MDX), /economy (günlük ekonomi, 28 günlük SR, canlı timelock kuyruğu: yeni API ucu `/governance/timelock`), /contracts (deployments JSON'dan; testnet etiketiyle), /security, /faq (FAQPage JSON-LD), /status, /terms ve /privacy ("Draft" yer tutucu), 404. **Metin denetimi** `tools/lint_copy.mjs`: docs/05 §6 yasak ifadeleri, §2.2 kullanılmayan terimler, $MOHO; rakip adları SHA-256 özeti olarak (açık repoda ad geçmez); onaylı kalıplar istisna; CI'da build'i kırar. SEO: sitemap, robots (/play, /design hariç), OG/Twitter, JSON-LD; PWA manifest ve ikonlar (logo tasarlanana kadar yer tutucu). Next 16 statik dışa aktarım ön yükleme dosyası adlandırma sorunu için build sonrası düzeltme betiği. Testler: rig kataloğu `MiningCore.sol`'den çapraz kontrol, her sayfada axe (0 ihlal), konsol/404 hatası yok, tüm iç bağlantılar geçerli. Kalan: /train, /s/<id>, /timelock yönlendirmesi, /brand, /collab, /support (ilgili fazlarda).

```text
apps/web'de Next.js App Router ile: landing (docs/05'teki wireframe ve İngilizce metinler; canlı istatistikler indeksleyici API'sinden), /docs (MDX; oyuncu rehberi + docs/02'deki formüller oyuncu diliyle), /economy (docs/03 §5 herkese açık şeffaflık sayfası), /contracts (deployments/*.json'dan adresler + Blockscout linkleri + roller + timelock), /security (denetimler, bug bounty), /faq, /status linki, /terms ve /privacy (avukat metinleri gelene kadar yer tutucu ve "taslak" etiketi). docs/05 §6'daki yasaklı ifadeler listesini ve §6.4b'deki rakip adlarını ([a competitor], [a competitor], [a competitor], [a competitor], [a competitor], [a competitor] — büyük/küçük harf duyarsız) ve 05 §2/§6'daki kullanılmayan terimleri ($MOHO, superdeep, energy, kWh, outpost, claim, airdrop vb.) bir lint kuralına çevir: apps/web içeriği, MDX dokümanları ve docs/tweets altındaki gönderi taslaklarında geçerse build kırılsın. OG görselleri, SEO, PWA manifest.
```

### 4.3 Oyun istemcisi — ✅ 2026-10-12 (çekirdek döngü; görseller yer tutucu)

> `/play` (noindex, yalnızca tarayıcıda çizilir): RainbowKit (Reown proje kimliği varsa MetaMask, Rabby, Phantom, WalletConnect — Robinhood Wallet WalletConnect üzerinden; yoksa yalnızca tarayıcı cüzdanları), API ayarlıysa SIWE oturumu ("This signature only logs you in. It cannot move funds."). Durum tek multicall ile zincirden (Multicall3 4663 ve 46630'da aynı bayt kodu), 12 saniyede bir; ikinci aşamada saha yükseltme fiyatı ve son 10 rafine isteği. Akışlar: ilk yakıt alımı = kayıt (Pilot Rig), yakıt (ETH→litre önizleme, `?ref=` davet adresi), Ekipman Pazarı (canlı VRGDA fiyatı, %2 `maxCost` payı, her zaman `payFromWallet = false` — token onayı yok), saha yükseltme, aç/kapa, hurda, rafineri (standart/hızlı, kuyruk ve tamamlama; Market Open öncesi kapalı). HUD: canlı sayaç (tank boşsa durur), ağ payı, "current estimate … falls as others join", tank göstergesi (`maxTankHours` zincirden), Dünya Sondajı derinliği ve katman. Hata eşlemesi (oracle bayat, pause, kapasite, ağ/cüzdan reddi) kullanıcı diliyle; yanlış ağda ağ değiştirme; pause bandı; testnet bandı. PixiJS izometrik saha (çalışan rig'lerde buhar; azaltılmış harekette kapalı; aynı bilgi ekran okuyucu metni olarak). İşlemler önce gas tahmini (geri dönüş nedeni cüzdan açılmadan gösterilir), sonra %25 gas payı: anvil E2E, cüzdan tahmininin bir rig'i yeniden başlatırken yetmediğini yakaladı. Testler: yardımcılar ve hata eşlemesi (Vitest), `/play` bağlı değilken axe + noindex, **anvil E2E** (`npm run e2e:play`: gerçek deploy script, yerel zincire işaret eden build, wagmi mock bağlayıcı; yakıt al → saha açılır → rig durdur/başlat → axe). CI işi `web-play-e2e`. Kalan: rig sprite'ları ve derinlik arka planı (docs/06 8.1), toplu alım miktarı, e-posta/Google girişi (opsiyonel), Lighthouse turu (4.5).

```text
docs/01 §4 ve §6'ya göre /play: RainbowKit + SIWE ile cüzdan girişi (Robinhood Wallet, MetaMask, Rabby, Phantom, WalletConnect; birincil), e-posta/Google girişi adaptörle opsiyonel (ücretsiz kademe), X yalnızca bağlı hesap, register akışı, PixiJS izometrik üs kesit sahnesi (slotlar, makine sprite'ları, çalışma animasyonu, derinlik arka planı), HUD (canlı MOHN sayacı — zincir verisinden istemcide formülle türetilir; tank; dünya derinliği), Mağaza (VRGDA canlı fiyat + toplu maliyet önizleme + maxCost slippage), Üs yükseltme, Yakıt Deposu (ETH ile yakıt; maliyet önizleme), Aç/kapa, Hurda, Rafineri (standart/hızlı, kuyruk). Kritik durum viem multicall ile doğrudan zincirden. Verim gösterimi docs/01 §6'daki dürüst formatta (USD ROI/APR yok). v1'de sponsorlu gas yok (oyuncu kendi gas'ını öder; maliyet önizlemede gösterilir). Hata durumları (oracle bayat, pause, ağ kesintisi) kullanıcı dostu mesajlarla. Mobil öncelikli. Testler: Playwright E2E (anvil + deploy script), bileşen testleri.
```

### 4.4 Sosyal katman — ✅ 2026-10-12 (API ayarlıysa /play sekmeleri; X hesap bağlama kaldı)

> `/play` sekmeleri (WAI-ARIA tabs; API yoksa yalnızca saha): **Crew** (kur: ad/etiket, katıl, ayrıl; 5 üyede sıralamaya girer, 25 üst sınır; üye katkı tablosu; ekonomi ortaklığı yok), **Survey** (günde bir ücretsiz kozmetik buluntu, bugünkü durum ve sonraki UTC günü; Core Collection set ilerlemesi), **Seasons** (son sezon sıralaması + tüm zamanlar World Bore katkısı; kendi satırın işaretli), **Profile** (görünen ad, paylaşım kartı önizlemesi `/cards/<adres>`, X intent ile önceden doldurulmuş katkı gönderisi — docs/05 §3.4 metni, UTM'li davet linki, "(my invite link)"; davet linkini kopyala; bildirim tercihleri: olaylar, e-posta, Telegram chat id). Oturum gerektiren ekranlar SIWE ile ("Sign in" → RainbowKit imza adımı); oturum durumu tek sorgudan (`GET /me`). **Turnstile**: SIWE, crew kurma ve Survey isteklerinde `cf-turnstile-response` başlığı, her istek için yeni token (görünmez; gerekirse küçük meydan okuma); `NEXT_PUBLIC_TURNSTILE_SITE_KEY` yoksa gönderilmez — bu, 4.3'te üretimde SIWE'nin kırılacağı bir açığı da kapattı. **Herkese açık profil** `/s/<adres>` (cüzdansız; tek statik sayfa, Cloudflare `public/_redirects` yeniden yazımı): ad, katkı, crew, saha seviyesi ve rig'ler, rozetler, koleksiyon; "Start drilling" → `/play/?ref=<adres>` (davet → `buyFuel(referrer)`). Testler: paylaşım metni (tutar/kazanç/fiyat içermez), yol ayrıştırma, API hata metinleri, sekme klavye davranışı (Vitest); `/s/<adres>` axe (API'siz); **tam yığın E2E** (`npm run e2e:play`: anvil + gerçek indeksleyici ve API aynı süreçte, bellek içi veritabanı; SIWE → crew kur → Survey → ad → uyarılar → sezonlar → herkese açık sayfa, her adımda axe). Kalan: X hesap bağlama (API ucu yok; Faz 5'te), profil başına OG görseli (statik sitede yok; Cloudflare Pages Function ücretsiz kademesiyle sonra), sezon plaketi ve Pioneer rozeti görselleri (8.1).

```text
/play içine: Crew ekranı, sezon ve sıralamalar, Survey (günlük ücretsiz), koleksiyon ve başarımlar, herkese açık profil/saha görüntüleyici (cüzdansız), paylaşım kartı (X intent ile tek tık; metin şablonu docs/05'ten), davet linki (referrer parametresi register'a geçer), bildirim tercihleri (e-posta/Telegram). Testler: E2E.
```

### 4.5 Kalite turu

```text
apps/web için: Lighthouse (mobil performans ≥ 85, erişilebilirlik ≥ 95), knip ile ölü kod temizliği, bundle analizi, CSP + SRI başlıkları, hata sınırları, Sentry entegrasyonu, düşük güçlü cihaz modu. Bulduğun her sorunu düzelt ve önce/sonra raporla.
```

**🚪 Kapı 4:** Uçtan uca oyun testnet'te oynanabilir · E2E yeşil · Lighthouse hedefleri.

---

## FAZ 5 — Operatör (admin) paneli

```text
docs/03 §5'teki 12 modülü apps/admin'de Refine ile kur. Kimlik: Cloudflare Access arkasında + WebAuthn; roller admin/ekonomist/destek/moderatör; tüm işlemler append-only audit log'a (kim, ne, önce/sonra, gerekçe). Parametre merkezi: kontrattan güncel değerler ve sınırlar; "değişiklik öner" sihirbazı sınırları ve hız limitini istemcide de doğrular ve Safe Transaction Builder JSON dosyası üretir (panelde özel anahtar YOK). Bekleyen timelock kuyruğu ve geri sayım. Oyuncu arama, anti-hile (yalnızca zincir dışı ödülleri dondurma), sezon yöneticisi, duyuru CMS, destek gelen kutusu, sponsorluk politikası, keeper/altyapı sağlığı. Testler: yetki matrisi, audit log değiştirilemezliği, Safe JSON çıktısının testnet Safe'te başarıyla içe aktarılması.
```

**🚪 Kapı 5:** Bir parametre değişikliği panelden önerilip testnet Safe + Timelock ile uçtan uca uygulandı.

---

## FAZ 6 — Altyapı ve operasyon

### 6.1 Hetzner + Cloudflare

```text
infra/ altında docs/03 §6'ya göre: 2 Hetzner sunucusu için sertleştirme (SSH anahtar, firewall, otomatik güncellemeler, fail2ban, Tailscale), Coolify veya Dokploy kurulumu, servislerin docker-compose tanımları (web, api, indexer, keeper, monitor, postgres, redis), Cloudflare (DNS, proxy, WAF kuralları, rate limit, Turnstile, Access ile admin), Infisical/SOPS ile sırlar, Postgres günlük şifreli yedek → Storage Box + harici S3/R2 ve **geri yükleme testi**. GitHub Actions'tan staging (testnet) ve production (mainnet) ortamlarına deploy. Her şeyi bir RUNBOOK ile belgele.
```

### 6.2 Runbook'lar ve tatbikat

```text
docs/runbooks/ altında docs/04 §6.2'deki 6 senaryonun her biri için adım adım runbook yaz (kim, hangi araç, hangi Safe işlemi, hangi iletişim şablonu — docs/05'ten). Testnet'te pause → bildirim → unpause tatbikatını yap ve süreyi ölç.
```

**🚪 Kapı 6:** Yedekten geri yükleme ve pause tatbikatı başarılı.

---

## FAZ 7 — Çoklu AI denetimi, herkese açık inceleme ve testnet betası (sıfır bütçe)

### 7.1 Çoklu AI denetimi (her rol ayrı bir Claude oturumunda)

```text
Sen bağımsız bir akıllı kontrat denetçisisin ve rolün: <SALDIRGAN | MUHASEBECİ | SPESİFİKASYON DENETÇİSİ>. contracts/src, docs/02, docs/03, docs/04 ve contracts/audits/SCOPE.md'yi oku. SALDIRGAN: her dış fonksiyon için istismar senaryosu üret ve Foundry'de kanıt testi (PoC) yazmaya çalış; başarılı PoC = bulgu. MUHASEBECİ: docs/04 §2 invariant'larını bozacak işlem dizileri ara, yeni invariant'lar öner ve handler'a ekle. SPESİFİKASYON DENETÇİSİ: koddaki her formülü ve sabiti docs/02 ve sim/vectors ile satır satır karşılaştır, farkları listele. Bulguları önem derecesiyle contracts/audits/AI_REVIEW.md'ye yaz; düzeltme yapma, yalnızca raporla.
```

- Ardından bulgular tek tek düzeltilir (aşağıdaki prompt). Ek olarak başka bir AI asistanının ücretsiz katmanıyla aynı kapsam bir kez daha taranır.
- **Herkese açık inceleme:** repo ve kontratlar mainnet'ten ≥ 4 hafta önce herkese açık; SECURITY.md'de bulgu bildirimi ve ödül kuralları (hazine payından MOHN + ops gelirinden ETH taahhüdü).
- **Gelirle denetim:** bağımsız denetim lansmandan sonra, ops kasası 08 §3'teki eşiğe ulaşınca.

```text
contracts/audits/AI_REVIEW.md (veya herkese açık incelemeden / ileride bağımsız denetimden gelen rapor) içindeki her bulguyu tek tek ele al: her biri için ayrı commit, bulguyu yeniden üreten bir test (önce kırmızı), düzeltme (sonra yeşil), docs ve sim etkisi. Sonunda bulgu → commit → test eşleme tablosunu contracts/audits/FIXES.md'ye yaz. Kapsam, mutasyon ve fuzz kampanyalarını yeniden koş.
```

### 7.2 Herkese açık testnet betası (≥ 2 hafta)

```text
Testnet betası için: deployments/testnet.json'u güncel sürüme getir, web'de "TESTNET" bandı, testnet ETH faucet yönlendirmesi, beta sıralaması (mainnet'e yalnızca transfer edilemez rozet/unvan olarak taşınır — token ödülü YOK), hata bildirim formu, testnet bug bounty sayfası. Beta boyunca günlük ekonomi raporu üret (indeksleyiciden) ve sim tahminleriyle karşılaştır; sapmaları raporla.
```

**🚪 Kapı 7:** 3 rollü AI denetimi + ikinci AI taraması tamam ve tüm bulgular kapandı · ≥ 4 hafta herkese açık inceleme · korumalı lansman sınırları testli · beta ≥ 2 hafta · sim ile canlı veri tutarlı · "Unaudited" bandı ve gelirle denetim taahhüdü yayında · hukuki risk kararı kayıtlı (0.2).

---

## FAZ 8 — Marka, topluluk ve X kampanyası (T−42'den itibaren)

> Ayrıntılı takvim ve gönderi taslakları: `docs/05_MARKA_LANSMAN_X.md`.

### 8.1 Marka varlıkları

```text
docs/05'teki marka kimliğine göre: logo yönleri için AI görsel promptlarını kullanarak 3 yön × 4 varyasyon taslak üret (önce ücretsiz: Kenney.nl CC0 izometrik paketleri temel, Recraft/Ideogram ücretsiz kademeleri; Higgsfield kredi harcar — her üretimden önce bana maliyeti söyle ve onay al), seçilen yönü vektöre çevirme planı, X avatar/banner, OG görselleri, paylaşım kartı şablonları, makine sprite stil rehberi. Telif: kullanılan her aracın ticari kullanım şartlarını docs/legal/ASSET_LISANSLARI.md'ye yaz.
```

### 8.2 Testnet Sezon 0 (bekleme listesi yerine "kanıtlanmış oyun")

```text
docs/09_ONBOARDING.md §3'e göre Testnet Sezon 0'ı kur: apps/web'de testnet modunda tam oyun (testnet 46630, MockV3Aggregator, faucet yönlendirmesi ve faucet şartlarının açıklaması), giriş cüzdan (RainbowKit+SIWE) veya e-posta ile, Turnstile. Beğen/RT/yanıt görevi YOK, XP sıralaması YOK, cüzdan adresi yapıştırma YOK. Kanıt = oyun: belirli kilometre taşlarını (ilk yakıt, ilk kule, L3, ilk rafine, crew'a katılma) tamamlayan oyuncu transfer edilemez 'Pioneer' kozmetik rozetini kazanır; rozet mainnet'e yalnızca kozmetik olarak taşınır (token, öncelik veya ekonomik avantaj YOK). Kişisel davet linki (tek seviye; mainnet'te register referrer'ına bağlanır). Bot sinyalleri: IP/ASN kümeleri, eşzamanlı davranış; işaretli hesaplar rozet alamaz. Admin panelinde Sezon 0 analitiği (kayıt, kilometre taşı hunisi, D1/D7, cihaz/cüzdan dağılımı, hata oranları).
```

### 8.3 İçerik operasyonu
- docs/05 takvimine göre haftalık plan: X'in kendi zamanlayıcısında taslaklar, kurucu hesabı (@onderyazici) devlog, proje hesabı resmî bilgiler.

---

## FAZ 9 — Mainnet lansmanı

### 9.1 Prova

```text
docs/05'teki lansman günü runbook'u ve docs/04 §4 deploy prosedürünü testnet'te mainnet'in birebir kopyası olarak prova et: deploy → verify → handover assert → /contracts sayfası güncelle → pre-fill penceresi → T0 (Genesis Dig) → 72 saat (testnette hızlandırılmış zaman yok; gerçek süreyle) → openMarket → ilk buyback/POL. Her adımın süresini ve sorumlusunu çıkar; eksik olan her şeyi listele.
```

### 9.2 Mainnet

- T−7 gün: kontratlar deploy + doğrulama + handover (CA yayımlanır; havuz yok → snipe edilecek bir şey yok).
- T−24 saat: Pre-fill penceresi (kayıt + yakıt).
- **T0: Genesis Dig** (72 saat, rafine kapalı).
- **T+72s: Market Open** (`openMarket()` herkes çağırabilir; keeper ilk çağıran olur).
- T+1 hafta: ilk haftalık ekonomi raporu.

**🚪 Kapı 9:** Lansman sonrası 7 gün kritik olay yok · ekonomi metrikleri sim bantları içinde.

---

## FAZ 10 — Canlı operasyon ve büyüme

| Ritim | İş |
|---|---|
| Her gün | Keeper/uyarı kontrolü, destek kutusu, sayılar gönderisi |
| Her hafta | Herkese açık ekonomi raporu (SR, NE, RCR, P\*, Gini, kohortlar), patch notları |
| Her sezon (~8 hafta) | Yeni sezon, kozmetik set, crew turnuvası, retrospektif |
| Stratum eşiklerinde | Yeni nesil makine (timelock kuyruğunda ≥ 72s önceden), biyom/müzik |
| 6. ay | Sezon 2 özellik denetimi (kilitle-güçlendir) |
| Ops kasası eşiğinde (08 §3) | **Bağımsız denetim** → rapor → düzeltmeler → korumalı lansman sınırlarının kademeli gevşetilmesi → "Unaudited" bandının kaldırılması |
| 12. ay ve denetim sonrası | **Kemikleşme kararı** (yükseltme yetkisinin bırakılması), bağımsız Safe imzacıları |

### Canlı ekonomi incelemesi promptu (haftalık)

```text
Bu haftanın indeksleyici verilerini çek: emisyon, kaynağa göre yakım, rezerv, H, SR, NE, RCR, P*, VRGDA sapması, kohort geri dönüşleri, Gini/Nakamoto, satış oranı, yeni/dönen oyuncu. sim'i güncel durumdan başlatıp 90 günlük ileri projeksiyon koş. docs/02 §12'deki önceden ilan edilmiş müdahale politikası tetikleyicilerinden herhangi biri yaklaşıyor mu? Türkçe bir iç rapor ve İngilizce, yatırım dili içermeyen (docs/05 yasaklı ifadeler) bir herkese açık haftalık ekonomi raporu taslağı hazırla.
```
