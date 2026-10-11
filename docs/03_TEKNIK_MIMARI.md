# 03 — Teknik Mimari (v0.1)

> **Durum:** Taslak v0.1 — 2026-10-10. Ekonomi formülleri: `02_TOKENOMI_VE_OYUN_MATEMATIGI.md`. Güvenlik ve test: `04_GUVENLIK_TEST_DENETIM.md`.
> Robinhood Chain gerçekleri **Faz 0.4'te salt okuma çağrılarıyla doğrulandı** (2026-10-10). Bütün adresler, komutlar ve kanıtlar: `docs/ZINCIR_DOGRULAMA.md`.

---

## 1. Zincir gerçekleri ve tasarıma etkisi

| Gerçek | Değer | Tasarıma etkisi |
|---|---|---|
| Mainnet / testnet chain ID | 4663 / 46630 | Her imzada chainId (EIP-712) |
| Yığın | Arbitrum Nitro tabanlı L2, ETH gas | Foundry/Hardhat, standart EVM |
| Blok süresi / sıralama | ~100 ms, FCFS, priority fee yok | Mempool yarışı yok ama gecikme-optimizasyonlu botlar var → zaman penceresi yarışı tasarlama |
| `block.number` | L1 tahmini döndürür | **Tahakkuk yalnızca `block.timestamp`** |
| `prevrandao` | Sabit | **Ekonomide rastgelelik yok** |
| Chainlink | Mainnet ETH/USD canlı: proxy `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`, 8 ondalık, **heartbeat 24 saat**, sapma %0.5. **Sequencer Uptime Feed yok. Testnet'te hiç besleme yok. VRF yok.** | Yakıt fiyatlaması: bayatlık eşiği 26 saat, sequencer kontrolü opsiyonel, testnet'te `MockV3Aggregator` |
| ERC-4337 / EIP-7702 | EntryPoint v0.6/0.7/0.8 + 7702 destekli | İleride (gelirle) gömülü cüzdan + sponsorlu gas; v1'de yok |
| Kontrat boyutu | 96 KB | Rahat, ama denetim için modüler tut |
| Explorer | Blockscout | `forge verify-contract --verifier blockscout` |
| Uniswap v4 | Mainnet'te aktif. PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`, PositionManager `0x58daec3116aae6d93017baaea7749052e8a04fa7`, UniversalRouter `0x8876789976decbfcbbbe364623c63652db8c0904`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`. Testnet'te aynı adresler (UniversalRouter 2.1.2 yok) | POL ve buyback v4 üzerinde |
| Safe | 1.3.0 / 1.4.1 / 1.5.0 her iki ağda; Safe{Wallet} arayüzü 4663 ve 46630'u destekliyor. Önerilen sürüm 1.5.0 | Ops/Guardian Safe'leri |
| EVM | ArbOS 61; PUSH0, MCOPY, TSTORE/TLOAD, CLZ test edildi | `evm_version = "prague"` sabitlenir |
| RPC | Public RPC'de JSON-RPC WebSocket yok; ~843K blok/gün | Her bloğu çeken indeksleyiciler (Ponder) ücretsiz kotaya sığmaz → log tabanlı okuyucu (§4.3) |
| Merkeziyet | L2BEAT: Stage 0 altı, 7/8 multisig anında yükseltme | Göç planı + zincir kesintisinde oyuncu cezalandırılmaz |

---

## 2. Monorepo yapısı

```
/contracts            Foundry projesi
  /src                MohnToken, MiningCore (+ lib/), RevenueRouter, BuybackBurner, LiquidityManager
  /test               unit/ fuzz/ invariant/ fork/ differential/ (sim vektörleri)
  /script             Deploy.s.sol, Verify, Configure, Handover (rolleri timelock'a devret)
  /audits             denetim raporları ve kapsam dokümanları
/sim                  Python ekonomi simülatörü + test vektörleri (bkz. sim/README.md)
/apps/web             Next.js oyun istemcisi + landing + /docs + /economy
/apps/admin           Refine tabanlı operatör paneli (ayrı alan adı, Cloudflare Access arkasında)
/services/indexer     log okuyucu (viem getLogs → Postgres)
/services/api         Hono API: oturum, profil, crew, survey, sezon, paylaşım kartı, bildirim, admin API
/services/keeper      poke / rafine tamamlama / buyback / POL / sağlık kontrolü işçileri
/packages/sdk         ABI'ler (wagmi CLI), tipler, ekonomi formüllerinin TS kopyası (sim ile parite testli)
/packages/config      ortak eslint/tsconfig/prettier
/infra                docker-compose, Coolify/Dokploy, Cloudflare, Grafana/Prometheus/Loki, yedekleme
/docs                 tasarım dokümanları, ADR'ler, runbook'lar
```

Araçlar: **npm workspaces + Turborepo** (pnpm 12 Windows'ta takıldığı için Faz 1'de değiştirildi), Node 24 LTS, TypeScript strict, Foundry ≥ 1.8 (doğrulandı: v1.8.5), Solidity 0.8.30+ (`evm_version = "prague"`), OpenZeppelin Contracts 5.7.0 (+ Upgradeable 5.7.0), Solady (expWad/lnWad).

---

## 3. Akıllı kontratlar

### 3.1 Genel bakış

```
                ┌────────────────────┐
  Oyuncu ──────►│   MiningCore (UUPS) │──mint──► MohnToken (immutable, CAP, tek minter)
   ETH ────────►│  hesap/saha/kule    │
                │  yakıt/emisyon     │──ETH──► RevenueRouter ──► BuybackBurner ──(v4 swap, burn)
                │  VRGDA/rafineri     │                       ├──► LiquidityManager ──(v4 POL, kilitli)
                └─────────▲──────────┘                       └──► Ops Safe
                          │ parametre (sınırlı)
              Safe (Ops) ─► TimelockController (96s; yükseltme 7g) ──► MiningCore / Router / Burner / LM
              Safe (Guardian) ─► pause() (≤72s otomatik biter)
              Keeper (yetkisiz sıcak anahtar) ─► poke(), finalizeRefine(), executeBuyback(), addPOL()
              Chainlink ETH/USD (24s heartbeat) ─► MiningCore (yalnızca yakıt alımı)
```

### 3.2 MohnToken (immutable)

- `ERC20("…","MOHN")`, `ERC20Permit`, `ERC20Burnable`; `CAP = 100_000_000e18`.
- `minter` **constructor'da immutable** olarak MiningCore proxy adresine ayarlanır (adres deploy script'inde önceden hesaplanır ve doğrulanır). Setter yok, owner yok.
- `mint(to, amount)`: `msg.sender == minter`, `totalSupply + amount ≤ CAP` ve **o UTC gününde basılan + amount ≤ `DAILY_MINT_CAP` (500K, immutable)**.
- MiningCore ayrıca saatlik mint sınırı taşır (`MINT_BREAKER_LIMIT` = 150K / kayan 60 dk, 04 §5.2). Uygulama: 5 dakikalık 13 kovalık halka; pencere 60–65 dakikayı kapsar (güvenli tarafta fazla sayar). Sınırı aşacak mint `MintWindowFull` ile geri çevrilir; global bir "durdurma" durumu yoktur (iç denetim: eski tasarımda bakiyesi olmayan biri bile kesiciyi atıp tüm mint'leri dondurabiliyordu). Rafine isteği başına en çok 100K. Market Open LP'si pencerede kalan yere kırpılır. Acil durdurma Guardian pause'u.

### 3.3 MiningCore (UUPS proxy, ERC-7201 depolama)

**Neden yükseltilebilir?** Uzun ömürlü bir oyunda hata düzeltme yolu gerekir. Risk dengesi:
- Yükseltme yalnızca Safe → Timelock (**7 gün** gecikme, diğer parametrelerden uzun) ile.
- `_disableInitializers()`, ERC-7201 namespaced storage, CI'da `slither-check-upgradeability` + OZ upgrades storage layout kontrolü.
- **Kemikleşme (ossification) taahhüdü:** 2 denetim + 12 ay sorunsuz çalışmadan sonra `upgradeTo` yetkisi kalıcı olarak bırakılır (renounce). Bu tarih yol haritasında ilan edilir.
- Token ayrı ve immutable olduğu için en kötü senaryoda bile CAP aşılamaz.

**Durum (özet):**

```
Global:  acc, lastUpdate, currentHour, H, R, E_h, emitted, burnedForever, unrefinedSpent, devPending,
         treasuryPending, dpEndingAt[hour], accAtHour[hour], vrgda{lnP0, decay, r, sold},
         generations, lastGenerationTime, bestEfficiency, genesis{fuelUsd, minerDig}, params{...}
Hesap:   dp, burn, tank, lastFuelSettle, expiryHour, debt, unrefined, level, rigs, scrapCredit,
         rigs[type]{owned, active}, referrer, fuelSpentWei, refineQueue[]
Katalog: machineType{dp, burn, premiumBps, minLevel, generation} — eklenir, asla değiştirilmez
```

**Dış fonksiyonlar:**

| Fonksiyon | Kim | Açıklama |
|---|---|---|
| (kayıt) | herkes | Ayrı bir `register` fonksiyonu yok: ilk `buyFuel(referrer)` sahayı (L1 + Pilot Rig) açar ve referrer'ı bir kez ayarlar → **ilk giriş tek işlem** |
| `buyFuel()` payable | oyuncu | ETH → ℓ (Chainlink, 26s bayatlık kontrolü; sequencer feed adresi tanımlıysa onu da kontrol eder); gerekirse önce kayıt; ETH Router'a |
| `buyMachines(typeId, qty, maxCost, payFromWallet)` | oyuncu | VRGDA kapalı form maliyet × (1 + prim), yuvarlama yukarı; işlem başı ≤ 10.000 DP birimi; ped, yakıt hattı ve saha seviyesi kontrolü; alınan makineler hemen çalışır. Ödeme sırası: hurda kredisi → rafine edilmemiş bakiye → (isteğe bağlı) cüzdan (`burnFrom`, onay/permit gerekir). MOHN kısmı %80 kalıcı yakım / %20 rezerv |
| `setActiveRigs(typeId, active)` | oyuncu | Bir türden tam olarak `active` adet makine çalışır (yakıt hattı kontrolü); Pilot Rig de kapatılabilir |
| `upgradeSite(maxCost, payFromWallet)` | oyuncu | `150·L^2.2·idx`, idx = clamp(p/p0, 0.25, 4), yuvarlama yukarı; L30 sonrası revert |
| `scrapMachines(typeId, qty)` | oyuncu | Önce boştaki makineler sökülür; kredi = DP × güncel p(t,n) × %20 (aşağı yuvarlanır). Ücretsiz Pilot Rig kredi vermez, yalnızca pedi boşaltır. Söküm `vrgdaSold`'u azaltmaz |
| `refine(amount, fast)` | oyuncu | Hızlı: %8 ücret (yukarı yuvarlanır; yarısı kalıcı yakım, yarısı rezerv), anında mint · Standart: ücretsiz, 72s kuyruk. Genesis boyunca kapalı (`RefineClosed`) |
| `finalizeRefine(account, id)` | herkes | Süresi dolan isteği sahibine mint eder; çift finalize `AlreadyFinalized` |
| `poke()` | herkes | Global checkpoint (en fazla 168 saat/çağrı) |
| `openMarket()` | herkes | Genesis bitince formülle POL oluşturur (LiquidityManager) |
| `withdrawDevShare(amount)` / `withdrawTreasuryShare(amount)` | ilgili alıcı (`initialize`'da verilir; Faz 2.7'de Timelock ile değişir) | Payları **yalnızca 72s standart kuyruğa** alır (hızlı seçenek yok); talep ve UTC günü başına ≤ 100K; kuyruk herkese açık |
| `resetMintBreaker()` | admin → Faz 2.7'de Timelock | Atmış mint devre kesicisini sıfırlar ve pencereyi temizler |
| Referans kredisi (iç kanca) | — | Davet edilenin her tahakkukunda (`_settle` → `_onAccrued`) %3, hazine payından davet edenin rafine edilmemiş bakiyesine; hazine payında yeterli yoksa olan kadarı ödenir |
| `set*` parametreler | Timelock | Kodlanmış sınır + hız limiti kontrolü |
| `addMachineGeneration(types[])` | `CATALOG_ROLE` → Faz 2.7'de Timelock | Bir seferde bir nesil (1–8 tür): Dünya Derinliği nesnin stratum eşiğine ulaşmış olmalı (Gen-2: 2.000 m … Gen-8+: 85.000 m), son nesilden ≥ 45 gün, her türün verimi ≤ en iyi × 1,15, DP ≤ 10.000, prim ≤ %100, minLevel 1–30. Mevcut türler asla değişmez (M2) |
| `pause()` / `unpause()` | Guardian / Timelock | Pause en fazla 72s, sonra otomatik biter; uzatma yalnızca Timelock |

### 3.4 Ödül muhasebesi algoritması

Global checkpoint (her durum değiştiren çağrının başında):

```solidity
// sözde kod — gerçek kod: contracts/src/lib/EmissionLib.sol
while (lastUpdate < now && iter < MAX_HOURS_PER_POKE) {
    hourEnd = (currentHour + 1) * 3600;
    segEnd  = min(now, hourEnd);
    if (H > 0) {
        amount = E_h * (segEnd - lastUpdate) / 3600;        // aşağı yuvarla
        acc   += amount * 90% * PREC / H;
        devPending += amount * 5%; treasuryPending += amount - %90 - %5;
        R     -= amount;
    }
    lastUpdate = segEnd;
    if (segEnd == hourEnd) {
        currentHour++;
        accAtHour[currentHour] = acc;          // saat sınırı anlık görüntüsü
        H   -= dpEndingAt[currentHour];         // yakıtı bu saatte bitenler düşer
        E_h  = R * DELTA_H / WAD;               // yeni saatin emisyonu
    }
}
```

Hesap uzlaştırma (`_settle`):

```solidity
endAcc  = (expiryHour <= currentHour) ? accAtHour[expiryHour] : acc;
earned  = dp * (endAcc - debt) / PREC;
unrefined += earned;
_creditReferral(earned);                       // hazine payından %3, koşullu
tank    -= burn * (min(now, expiryHour*3600) - lastSettle) / 3600;   // tüketim
debt = acc; lastSettle = now;
```

Durum değişikliği (makine/yakıt/aç-kapa) sonrası:

```solidity
if (expiryHour > currentHour) { dpEndingAt[expiryHour] -= dp; H -= dp; }   // eski takvimi kaldır
// ... dp / burn / tank güncellenir ...
expiryHour = (now + tank * 3600 / burn) / 3600;                              // saat sınırına aşağı
if (expiryHour > currentHour) { dpEndingAt[expiryHour] += dp; H += dp; debt = acc; }
```

- Tüm bölmeler aşağı yuvarlanır (protokol lehine). Toz rezervde kalır.
- `PREC = 1e36` (küçük H ve büyük emisyon kombinasyonlarında hassasiyet; taşma sınırları fuzz ile test edilir).
- Zincir kesintisi: tahakkuk zaman damgasıyla hesaplandığı için kesinti boyunca yakıt ve kazım birlikte "akar"; kimse cezalandırılmaz.

### 3.5 RevenueRouter

- `deposit()` (yalnızca MiningCore) → kovalar: `buyback`, `pol`, `ops` (bps; sınırlar 02 §10).
- `withdrawOps()` → Ops Safe (pull). `pullBuyback(amount)` / `pullPol(amount)` yalnızca ilgili kontratlar.
- ETH muhasebesi invariant'ı: `balance == buyback + pol + ops` (toz hariç).
- Uygulama (Faz 2.6): roller `DEPOSITOR_ROLE` (MiningCore), `FEE_DEPOSITOR_ROLE` ve `POL_ROLE` (LiquidityManager), `BUYBACK_ROLE` (BuybackBurner), `OPS_ROLE` (ops Safe). Bölüşüm yuvarlama tozu ops kovasına gider. Oran ayarı (sınır + hız limiti + Timelock) Faz 2.7'de.

### 3.6 BuybackBurner

- `executeBuyback(ethIn, minMohnOut)`: yalnızca KEEPER; `ethIn ≤ dailyCap`, günlük toplam tavanı; Uniswap v4 swap; alınan MOHN'un **%100'ü yakılır**.
- Keeper anahtarı ele geçirilirse en kötü durum: günlük tavan dahilinde kötü fiyatla alım (sınırlı kayıp). Keeper başka hiçbir yetkiye sahip değil.
- Mint/ödül miktarı **asla** AMM fiyatından hesaplanmaz.
- Uygulama (Faz 2.6): günlük tavan = havuzun ETH derinliğinin **%2'si** (`sim/params.json` `buyback_max_daily_frac_of_pool_eth`). Havuz derinliği yalnızca tavanı boyutlamak için okunur. Genesis'te biriken kova bu tavanla günlere yayılarak harcanır.

### 3.7 LiquidityManager (POL)

- `openMarket(...)` (MiningCore üzerinden, genesis sonrası, bir kez): v4 havuzunu başlatır, `sqrtPriceX96` = formül fiyatı, tam aralık pozisyon.
- `addLiquidity(ethIn, minDig)`: KEEPER, tavanlı; yarım-swap + ekleme.
- `collectFees()`: herkes; MOHN ücretleri yakılır, ETH ücretleri buyback kovasına.
- **Likidite çekme fonksiyonu yok.** Pozisyon NFT'si kontratta kalıcı kilitli.
- Uygulama (Faz 2.6, ADR-012/013): PositionManager/NFT kullanılmaz; pozisyon doğrudan PoolManager'da LiquidityManager adına tutulur ve kontratta likidite azaltan hiçbir yol yoktur. Havuz: ETH (currency0) / MOHN, ücret %0,3 (`sim/params.json` amm.fee), tick aralığı 60, tam aralık. LiquidityManager aynı zamanda havuzun hook'udur (yalnızca `beforeInitialize`); havuzu başkası Market Open'dan önce kendi fiyatıyla başlatamaz. Adresinin düşük 14 biti `0x2000` olmalıdır (deploy'da CREATE2 salt'ı aranır). `addLiquidity` günlük tavanı havuz ETH'sinin %4'ü (yarısı swap edildiği için fiyat etkisi buyback tavanıyla aynı). MiningCore, LiquidityManager'ı `wireLiquidityManager` ile **bir kez** bağlar.
- `MiningCore.openMarket()`: Market Open'dan sonra herkes, bir kez çağırır. P0 = genesis yakıt USD'si / genesis madenci tahakkuku (Market Open saat sınırında muhasebede kaydedilir); LP MOHN'u rezervden basılır (≤ 1M, devre kesiciden geçer); fiyat Chainlink ETH/USD ile `sqrtPriceX96`'ya çevrilir. AMM fiyatı hiçbir yerde okunmaz.

### 3.8 Roller ve anahtarlar

| Rol | Sahibi | Yetkisi | Yetkisi OLMAYAN |
|---|---|---|---|
| Timelock (96s; yükseltme 7g) | Ops Safe önerir, herkes yürütür | Sınırlı parametreler, katalog ekleme, yükseltme, unpause | Token, CAP, emisyon takvimi, mevcut makineler |
| Ops Safe | Başlangıç 2/3 (kurucunun 2 donanım cüzdanı + bağımsız 1 imzacı), hedef 3/5 | Timelock'a öneri, ops ETH alımı | Doğrudan parametre değişimi |
| Guardian Safe | 1/2 | `pause()` (≤72s) | Fon hareketi, unpause, parametre |
| Keeper | Sunucudaki sıcak anahtar, az ETH | poke, finalize, tavanlı buyback/POL | Her şey dışında |
| Deployer | Tek kullanımlık | Deploy + rolleri devretme | Devirden sonra hiçbir şey (script doğrular) |

**Kontrattaki karşılıkları (Faz 2.7):** `DEFAULT_ADMIN_ROLE` ve `CATALOG_ROLE` → 96 saatlik Timelock; `UPGRADER_ROLE` → 7 günlük ayrı Timelock (UUPS `_authorizeUpgrade`); `GUARDIAN_ROLE` → Guardian Safe; router/LM/BB'de `KEEPER_ROLE` ve kova rolleri. Devir ve "deployer'da rol kalmadı" kontrolü Faz 2.8 `Handover.s.sol`'da.

**Parametreler (`setParam`, tek fonksiyon, tablo tabanlı; invariant P1):**

| Parametre | Sınır | Adım | Bekleme |
|---|---|---|---|
| Yakıt fiyatı π_ℓ | $0,03–0,50 | ±%25 | 7 gün |
| VRGDA `r` | 1.000–100.000 DP/gün | ±%25 | 30 gün (değişimde yeniden çapalama) |
| VRGDA `k` | 0,05–0,35 | ±%25 | 30 gün (yeniden çapalama) |
| Hızlı rafine ücreti | %0–12 | serbest | 7 gün |
| Rafine kuyruğu | 24–168 saat | serbest | 7 gün |
| Tank üst sınırı | 168–2.160 saat | serbest | 7 gün |
| Oracle bayatlık eşiği | 25–30 saat | serbest | 7 gün |
| Saha maliyet ölçeği | 0,5×–2× | ±%25 | 30 gün |

Ayrıca: `setRecipients` (kurucu/hazine alıcıları, sıfır olamaz, 30 günde bir), `setSequencerFeed` (30 günde bir), router `setSplit` (buyback %30–60, POL %20–50, ops %10–35, 30 günde bir), BuybackBurner `setDailyBps` (havuz ETH'sinin %0,5–5'i, 7 günde bir). Saha maliyet ölçeğinin 0,5×–2× mutlak sınırı docs/02'de yok; uygulama seçimidir (kurucu onayı bekliyor). Yeniden çapalama: `r` veya `k` değiştiğinde eğri o anki fiyattan, o anki zaman ve satıştan yeniden başlar (`sim/vectors/vrgda_reanchor.json`, fiyat sıçramaz). Bunların dışında hiçbir ekonomi değeri değiştirilemez; testler MiningCore'un durum değiştiren fonksiyon listesini derlenmiş ABI ile birebir karşılaştırır.

**Pause (invariant P2):** Guardian `pause()` oyuncu işlemlerini (yakıt, makine, saha, rafine, finalize, pay çekimi, openMarket) **72 saat** durdurur ve kendiliğinden biter. Guardian pause'u kaldıramaz. İki Guardian pause'u arasında en az **7 gün** olmalıdır; kaybolan bir Guardian anahtarı oyuncuları kalıcı olarak kilitleyemez. Timelock `unpause()` ile bitirir, `extendPause` ile en çok 30 gün uzatabilir. Muhasebe (`poke`) ve görünümler pause sırasında da çalışır. Bilinen bedel: pause boyunca oyuncular yakıt alamaz; tanklar boşalmaya devam eder.

> Dürüst not: Tek kurucu için 2/3 Safe hâlâ fiilen tek kişi kontrolüdür. Bu ilk günden açıkça yazılır; bağımsız imzacılar eklendikçe güncellenir.

---

## 4. Zincir dışı servisler

### 4.1 Web istemcisi (`apps/web`)
- Next.js (App Router), React, Tailwind, **wagmi + viem**, **RainbowKit + SIWE** (opsiyonel e-posta girişi için Dynamic/Privy adaptörü), **PixiJS** (izometrik sahne), Zustand.
- Kritik oyun durumu **doğrudan zincirden** (viem multicall) okunur; indeksleyici yalnızca geçmiş/toplamlar için.
- Canlı sayaç istemcide formülden türetilir (zincir işlemi gerektirmez).
- Dil: İngilizce birincil. Türkçe arayüz hukuki görüşe bağlı (bkz. 07).
- PWA, mobil öncelikli, WalletConnect zorunlu.

### 4.2 Giriş katmanı

> **Sıfır bütçe kararı (08):** v1'de birincil giriş ücretsiz ve sınırsız olan cüzdan bağlantısıdır. E-posta/Google girişi bir sağlayıcının ücretsiz kademesiyle sunulur; limit aşılınca ücretli kademe oyunun ops gelirinden karşılanır. Kod, sağlayıcıyı değiştirmeyi kolaylaştıracak bir adaptör katmanının arkasında yazılır.

| Yol | Araç | Maliyet | Not |
|---|---|---|---|
| **Harici cüzdan** (Robinhood Wallet, MetaMask, Rabby, Phantom, WalletConnect ile mobil cüzdanlar) | wagmi + viem + **RainbowKit** (veya Reown AppKit ücretsiz kademe) + **SIWE (EIP-4361)** oturum | **Ücretsiz, sınırsız** | v1'in birincil yolu |
| E-posta / Google (Gmail) | **Dynamic** (≤ 1,000 MAU ücretsiz) veya **Privy** (≤ 499 MAU ücretsiz) gömülü cüzdan | Limit aşılınca ops gelirinden | Kripto bilmeyen oyuncu için; anahtar export'u şart |
| X (Twitter) | Bağlı hesap (OAuth 2.0 PKCE, `users.read`) — yalnızca giriş anında kullanıcı adı; X API okuma çağrısı yapılmaz (ücretli) | Ücretsiz | **Saklama kökü değil**; yalnızca profil ve referans gösterimi |

- **Gas:** v1'de sponsorlu gas yok; oyuncu kendi gas'ını öder (işlem başı ≈ $0.006). Gelir geldikçe izinli seçicilerle sınırlı sponsorluk açılabilir (`buyMachines`, `setActive`, `upgradeOutpost`, `refine`, `finalizeRefine`; kullanıcı başı günlük tavan + toplam bütçe alarmı).
- Kendi `users` tablomuz: `{id, auth_provider, provider_user_id, wallet, linked_x, created_at, risk_score}` → tedarikçiye kilitlenmeyi azaltır.

### 4.3 İndeksleyici (`services/indexer`)
- **Kendi log okuyucumuz** (TypeScript + viem `getLogs`, Postgres): ~10 saniyede bir yalnızca kendi kontratlarımızın olaylarını blok aralıklarıyla çeker, son işlenen bloğu saklar, idempotent upsert yapar. Alchemy ücretsiz kotasına (30M CU/ay) sığar. Ponder, canlı modda her bloğu çektiği için (~843K blok/gün) ücretsiz RPC ile çalışmaz. Olaylar: Register, FuelBought, MachinesBought, Activated, OutpostUpgraded, Scrapped, Refined, RefineQueued/Finalized, Checkpoint(hour), Burned, ReserveReturned, Buyback, PolAdded, ParamQueued/Executed, Paused.
- Çıktılar: sıralamalar, ekonomi metrikleri (SR, NE, RCR, P\*, Gini, Nakamoto), kohort tabloları, herkese açık `/economy` API'si.
- Ücretsiz alternatifler: Goldsky Starter (mainnet+testnet), Envio HyperSync (yalnızca mainnet, ücretsiz token).

### 4.4 API (`services/api`)
- **Hono** (Node 22), Zod doğrulama, Drizzle ORM, Postgres, Redis (rate limit, sıralama önbelleği, pub/sub).
- Uç noktalar: oturum (SIWE; opsiyonel e-posta sağlayıcısı JWT doğrulaması adaptörle), profil, crew, survey (günlük ücretsiz; sunucu rastgeleliği — ekonomik değeri yok), başarımlar, sezon, paylaşım kartı (Satori + resvg ile PNG), bildirimler (e-posta: Resend/Postmark; Telegram bot), admin API (RBAC).
- Anti-bot (yalnızca zincir dışı ödüller ve referans gösterimi için): Cloudflare Turnstile (sunucu doğrulamalı), IP/ASN/cüzdan rate limit, kümeleme (ortak fonlama adresi, referans ağacı şekli, senkron davranış).

### 4.5 Keeper (`services/keeper`)
- Saatlik `poke()`, olgun rafine kuyruklarını `finalizeRefine`, günlük `executeBuyback` ve `addLiquidity` (tavanlı, slippage hesabı zincir dışında), sağlık kontrolleri.
- Anahtar: ayrı, düşük bakiyeli; yetkisi yalnızca KEEPER rolü. Bakiye alarmı.

### 4.6 İzleme ve uyarı
- **Zincir:** OpenZeppelin Monitor (açık kaynak, self-host) — emisyon eğrisine göre anormal mint, rol/yükseltme/pause olayları, timelock kuyruğu, büyük transferler, LP olayları, keeper bakiyesi. Bildirim: Telegram + e-posta + (kritikte) telefon.
- **Altyapı:** Prometheus + Grafana + Loki, Uptime Kuma (veya BetterStack) + herkese açık `/status`.
- **Uygulama:** Sentry.

---

## 5. Oyun yaratıcısı (operatör) paneli — `apps/admin`

**Evet, olmalı; hazırı yok, biz kuruyoruz.** Refine (React) + shadcn/Ant Design; ayrı alan adı; **Cloudflare Access (Zero Trust)** + donanım anahtarı (WebAuthn) zorunlu; panelde **hiçbir özel anahtar yok**.

| Modül | İçerik |
|---|---|
| 1. Ekonomi panosu | Saatlik/günlük emisyon, rezerv, yakımlar (kaynağa göre), SR, NE, RCR, P\*, H ve dağılımı (Gini, top-10 payı, Nakamoto), VRGDA fiyat/hedef sapması, kohort geri dönüşleri, POL derinliği, Router kovaları, sponsorlu gas harcaması |
| 2. Parametre merkezi | Güncel değerler + kontrattaki sınırlar; "değişiklik öner" sihirbazı → **Safe Transaction Builder JSON** üretir (imza Safe arayüzünde); bekleyen timelock kuyruğu ve geri sayım |
| 3. Acil durum | Guardian pause butonu değil, **runbook + Safe linki**; pause durumu ve kalan süre |
| 4. Oyuncu arama | Cüzdan ↔ giriş sağlayıcısı kullanıcısı ↔ bağlı X/Google; makineler, yakıt, rafine geçmişi, referans ağacı, risk skoru |
| 5. Anti-hile | İşaretle, zincir dışı ödülleri dondur, yeniden doğrulama iste. **Zincir üstü varlığa el koyma yetkisi yok** (tasarım gereği) |
| 6. Sezon ve görev yöneticisi | Sezon tarihleri, sıralama kuralları, hazineden ödenecek ödül listesi (Safe işlemi olarak) |
| 7. Duyuru CMS | Oyun içi banner, bakım bildirimi, changelog, patch notları |
| 8. Referans yönetimi | Kod istatistikleri, şüpheli ağaçlar (yalnızca gösterim ve zincir dışı ödüller) |
| 9. Destek | Oyun içi form → gelen kutusu, oyuncu aramasına bağlı |
| 10. Sponsorluk politikası | Seçici izin listesi, kullanıcı başı tavan, bütçe, harcama grafiği |
| 11. RBAC + denetim kaydı | Roller: admin / ekonomist / destek / moderatör; her işlem için kim-ne-önce-sonra-gerekçe, yalnızca eklenebilir (append-only) tablo |
| 12. Keeper ve altyapı | Keeper bakiyesi, son poke, kuyruk uzunluğu, RPC sağlığı, indeksleyici gecikmesi |

**Panelin herkese açık yüzü:** `/economy` sayfası aynı indeksleyiciden beslenir — emisyon, yakımlar, SR/RCR/P\*, hazine ve Ops Safe bakiyeleri, POL, bekleyen timelock işlemleri (ETA ile), doğrulanmış kontrat listesi (Blockscout linkleri), denetim raporları.

---

## 6. Altyapı (Hetzner + Cloudflare)

| Bileşen | Öneri |
|---|---|
| Sunucu 1 (uygulama) | web (SSR), api, indexer, keeper, OZ Monitor — Docker, **Coolify** veya **Dokploy** ile |
| Sunucu 2 (veri) | Postgres 16/17, Redis; günlük şifreli yedek → Hetzner Storage Box + harici S3/R2 |
| Önde | Cloudflare: DNS, WAF, L7 DDoS, rate limit, Turnstile, Access (admin) |
| RPC | Alchemy ücretsiz plan (birincil; 30M CU/ay; yeni blok aboneliği yok, yalnızca log okuma) + public RPC yedek (viem `fallback`; viem'in hazır `robinhood` zincir tanımındaki üçüncü taraf RPC kullanılmaz, RPC'ler açıkça ayarlanır). Oyuncu tarayıcıları kendi okumalarını yapar. Gelirle: ücretli RPC veya Hetzner'de kendi Nitro düğümümüz |
| Sırlar | Infisical veya SOPS+age; `.env` dosyası repoda asla yok |
| CI/CD | GitHub Actions → imajlar GHCR → Coolify/Dokploy deploy; ortamlar: `local` (anvil) → `testnet` (46630) → `mainnet` (4663) |
| Erişim | SSH yalnızca anahtar + Tailscale/WireGuard; Hetzner firewall; otomatik güvenlik güncellemeleri |

---

## 7. Mimari karar kayıtları (ADR özeti)

| # | Karar | Gerekçe | Alternatif |
|---|---|---|---|
| ADR-001 | Adil madencilik lansmanı (premine/dev buy/ön satış yok) | Sniper ve "insider" riskini ortadan kaldırır; [a competitor]'den net ayrışma | Pons/Pools.trade lansmanı |
| ADR-002 | Yakıt ETH ile, USD sabit fiyat (Chainlink) | Dış gelir + fiyat duyarlı hashpower + sybil-nötr | Yakıt MOHN ile (yapışkan H, gelir yok) |
| ADR-003 | Makineler hesaba bağlı, NFT değil (v1) | Pazar yeri = KVHS riski + transfer muhasebe hataları; daha küçük denetim kapsamı | ERC-1155 makineler |
| ADR-004 | MiningCore UUPS + 7g timelock + kemikleşme taahhüdü; token immutable | Hata düzeltme yolu ile güven dengesi | Tam immutable + göç |
| ADR-005 | Ekonomide rastgelelik yok | Zincirde VRF yok + 7258 riski | commit-reveal |
| ADR-006 | VRGDA ile MOHN fiyatlaması | Kendi tokenimiz için oracle yok | Sabit fiyat + manuel ayar |
| ADR-007 | Sunucu imzalı ödül voucher'ı yok | İmza anahtarı saldırı yüzeyi yok | Off-chain oyun + voucher |
| ADR-008 | Cüzdan girişi (RainbowKit + SIWE) birincil; e-posta/Google ücretsiz kademeli Dynamic/Privy adaptörüyle; X yalnızca bağlı kimlik; v1'de sponsorlu gas yok | Sıfır bütçe; cüzdan girişi sınırsız ve ücretsiz | Baştan Privy ücretli kademe |
| ADR-009 | Korumalı lansman: immutable günlük mint tavanı + saatlik devre kesicisi + "Unaudited" bandı; bağımsız denetim gelirle yapılır | Lansman öncesi denetim bütçesi yok; hata olasılığı sıfırlanamıyorsa zarar boyutu sınırlanır | Lansmanı denetime kadar ertelemek |
| ADR-010 | İndeksleyici: kendi log okuyucumuz (getLogs, ~10 sn) | ~843K blok/gün; Ponder'in her bloğu çekmesi ücretsiz RPC kotasını aşar; az olaylı tek kontrat seti için basit okuyucu yeterli | Ponder + ücretli RPC, Goldsky, Envio |
| ADR-012 | LiquidityManager havuzun `beforeInitialize` hook'u | MOHN adresi lansmandan önce yayımlanır; hook'suz havuz anahtarı tahmin edilebilir ve herkes havuzu Market Open'dan önce kendi fiyatıyla başlatabilirdi (openMarket ya kilitlenir ya da yanlış fiyattan açılırdı) | Hook'suz havuz + "önceden başlatılmışsa fiyatı swap ile taşı" (likidite eklenmişse güvenilmez) |
| ADR-013 | v4 PoolManager ile doğrudan çalışma (unlock callback); PositionManager/NFT yok | Daha az bağımlılık; pozisyon kontratın kendisinde, NFT transfer yüzeyi yok; L1 (likidite azaltılamaz) ABI'den doğrulanabilir | PositionManager + NFT'yi kontratta kilitlemek |
| ADR-011 | MiningCore tek kontrat kalır; kod boyutu sınırı olarak zincirin doğrulanmış 96 KB sınırı kullanılır (`code_size_limit = 98304`) | Faz 2.4 sonunda MiningCore 23.7 KB; rafineri, market açılışı ve timelock eklenince 24 KB (EIP-170) aşılır. Robinhood Chain 98.304 bayta kadar kabul ediyor (mainnet + testnet, `ZINCIR_DOGRULAMA.md` §6). Bölmek delegatecall/kütüphane bağlama ve ek denetim yüzeyi getirir. Bedel: kod başka EVM zincirlerine olduğu gibi taşınamaz | Modül başına ayrı kontrat, harici kütüphaneler, diamond |
