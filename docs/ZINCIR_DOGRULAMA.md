# Zincir Doğrulama — Robinhood Chain (4663 / 46630)

> **Tarih:** 2026-10-10, RPC ölçümleri ~18:59–19:15 UTC arası.
> **Yöntem:** Tamamen salt okuma. Kullanılan RPC çağrıları: `eth_chainId`, `eth_gasPrice`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`, `eth_call` (kontrat oluşturma calldata'sı ile simülasyon dahil; bakiye için yalnızca simülasyonluk state override), `eth_estimateGas`, `eth_getLogs`. Bunlara resmî dokümanlar, GitHub depoları ve explorer/servis API'leri eklendi. Hiçbir işlem gönderilmedi, hiçbir şey imzalanmadı, hesap açılmadı.
> **RPC'ler:** `https://rpc.mainnet.chain.robinhood.com` (mainnet), `https://rpc.testnet.chain.robinhood.com` (testnet).
> **Durum etiketleri:** **VERIFIED** (doğrulandı) · **CONTRADICTS DOC** (docs/03 ya da araştırma raporuyla çelişiyor) · **NOT FOUND** (bulunamadı ya da doğrulanamadı).

---

## Özet: tasarımı etkileyen bulgular

1. **Robinhood Chain için Chainlink L2 Sequencer Uptime Feed yok.** Chainlink'in resmî listesinde bu zincir geçmiyor. Robinhood dokümanı feed'in kullanılmasını öneriyor ama adres vermiyor. docs/03'teki "Sequencer Uptime Feed canlı" ifadesi yanlış.
2. **Testnette hiçbir Chainlink beslemesi yok.** ETH/USD yalnızca mainnet'te var. Testnet için `MockV3Aggregator` deploy edilmeli.
3. **ETH/USD heartbeat'i 24 saat (86400 sn), sapma eşiği %0,5.** Bayatlık kontrolü 1 saat gibi kısa bir değerle yazılırsa `buyEnergy` sık sık revert eder. Eşik en az `86400 + tampon` olmalı.
4. **Uniswap v4 mainnet'te resmî ve aktif.** Son 200 blokta PoolManager 482 log üretti. Aynı adresler testnette de zincirde mevcut, ama Uniswap'in resmî listesinde yer almıyor. Universal Router 2.1.2 testnette yok.
5. **EVM:** PUSH0, MCOPY, TSTORE/TLOAD, CLZ (Osaka) ve BLS12-381 precompile'ları (Prague) çalışıyor. `SLOTNUM` (Amsterdam) çalışmıyor, `BLOBBASEFEE` hata veriyor. **`evm_version = "prague"` (ya da `"osaka"`) güvenli, `"amsterdam"` değil.** ArbOS sürümü 61.
6. **Public RPC'de JSON-RPC WebSocket yok.** Dokümandaki `wss://feed.*` adresi, Nitro sequencer yayın akışı. `eth_subscribe` için kullanılamıyor.
7. **Sıfır bütçe:** Cüzdan girişi (RainbowKit + WalletConnect) ücretsiz. Ücretsiz Reown projectId'si gerekiyor. Robinhood Wallet, WalletConnect üzerinden Robinhood Chain'i destekliyor. Dynamic ≤ 1.000 MAU, Privy 0–499 MAU ücretsiz.
   - **Alchemy'nin ücretsiz planı (30M CU/ay), 100 ms bloklu zincirde her bloğu çeken bir indeksleyiciye (Ponder realtime) ya da `newHeads` aboneliğine yetmiyor.** Tahminen 8–17 kat aşım var (§10).
8. **Mainnet Blockscout API'si (`robinhoodchain.blockscout.com/api`) bu ortamdan Cloudflare challenge (HTTP 403) döndürdü.** Testnet explorer API'si sorunsuz. `forge verify` CI'da takılabilir; yedek yol §7'de.

---

## 1. Zincir kimliği, blok aralığı, gas

| Kalem | Ağ | Değer | Nasıl doğrulandı | Tarih | Durum |
|---|---|---|---|---|---|
| `eth_chainId` | Mainnet | `0x1237` = **4663** | RPC | 2026-10-10 | VERIFIED |
| `eth_chainId` | Testnet | `0xb626` = **46630** | RPC | 2026-10-10 | VERIFIED |
| İstemci | İkisi de | `nitro/v3.12.1-rc.2` (`web3_clientVersion`) | RPC | 2026-10-10 | VERIFIED (Arbitrum Nitro) |
| ArbOS sürümü | İkisi de | **61** (`ArbSys.arbOSVersion()` = 116 = 55+61; `mixHash` içindeki 3. kelime `0x3d` = 61) | RPC `eth_call` → `0x…64` | 2026-10-10 | VERIFIED |
| Üst zincir | Mainnet / Testnet | `l1BlockNumber` 26.163.979 (Ethereum) / 11.886.480 (Sepolia aralığı, çıkarım) | Blok başlığı | 2026-10-10 | VERIFIED (testnet = Sepolia çıkarımı) |
| Ölçüm anındaki son blok | Mainnet / Testnet | 85.226.287 / 132.466.773 | `eth_blockNumber` | 2026-10-10 | — |
| Blok aralığı | Mainnet | Ardışık 20 blok, 2 sn'lik zaman damgası aralığına sığıyor (timestamp çözünürlüğü 1 sn). Ortalama: 1.000 blok → **102,0 ms**, 10.000 → 102,2 ms, 100.000 → **102,5 ms** | `eth_getBlockByNumber` | 2026-10-10 | VERIFIED (~100 ms) |
| Blok aralığı | Testnet | 1.000 → 113,0 ms, 10.000 → 114,5 ms, 100.000 → 116,3 ms (Blockscout `average_block_time` = 111 ms) | RPC + testnet explorer API | 2026-10-10 | VERIFIED (~110–116 ms) |
| `eth_gasPrice` | Mainnet | `0x13328d0` = 20.129.488 wei ≈ **0,0201 gwei**. baseFee 20.160.000 wei. Asgari gas fiyatı (`ArbGasInfo.getMinimumGasPrice()`) **0,02 gwei** | RPC | 2026-10-10 | VERIFIED (raporda yazan "0,02 gwei taban" doğru) |
| `eth_gasPrice` | Testnet | `0x989680` = 10.000.000 wei = **0,01 gwei** (asgari de 0,01 gwei) | RPC | 2026-10-10 | VERIFIED |
| Priority fee | Mainnet | `eth_maxPriorityFeePerGas` = `0x0`. Dokümana göre FCFS | RPC + [RH Differences](https://docs.robinhood.com/chain/differences-from-ethereum) | 2026-10-10 | VERIFIED |
| Örnek maliyet | Mainnet | Sıfır değerli transfer `eth_estimateGas` = 21.190 gas (190'ı L1 bileşeni) ≈ 4,3e-7 ETH ≈ **$0,0011**. 120K / 250K gas'lık oyun işlemi ≈ **$0,006 / $0,013** (ETH = $2.501,62 ile hesap) | RPC + hesap | 2026-10-10 | VERIFIED (docs/03 §4.2'deki "≈ $0,006" yaklaşık 120K gas'a denk geliyor) |
| L1 veri fiyatı | Mainnet | `ArbGasInfo.getPricesInWei()` ile L1 calldata baytı 3.211.728 wei. 24 KB bytecode ≈ 8e-8 ETH (ihmal edilebilir). 5M gas'lık deploy ≈ 1e-4 ETH ≈ $0,25 | RPC + hesap | 2026-10-10 | Bilgi |

---

## 2. Chainlink (ETH/USD, Sequencer Uptime, VRF)

Kaynaklar: [Chainlink RDD JSON (robinhood-mainnet)](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json), [Chainlink docs zincir yapılandırması `chains.ts`](https://github.com/smartcontractkit/documentation/blob/main/src/features/data/chains.ts), [Fiyat besleme sayfası](https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood), [L2 Sequencer Feeds](https://docs.chain.link/data-feeds/l2-sequencer-feeds), [VRF v2.5 ağları](https://docs.chain.link/vrf/v2-5/supported-networks), [RH Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds).

| Kalem | Ağ | Değer / adres | Nasıl doğrulandı | Tarih | Durum |
|---|---|---|---|---|---|
| **ETH/USD proxy** (kullanılacak adres) | Mainnet | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | RDD JSON + `eth_getCode` (9.571 bayt) | 2026-10-10 | VERIFIED |
| ETH/USD aggregator | Mainnet | `0x6091E64eb7138EEF066a80FD3A0d7427B91f2721` (`proxy.aggregator()` aynı adresi döndürüyor) | RDD + `eth_call` | 2026-10-10 | VERIFIED |
| ETH/USD SVR (secondary) proxy | Mainnet | `0x5058aDee53b04e374d8bEDbAD634Bc4778F50b22` ("Shared SVR"; aynı cevabı veriyor) | RDD + `eth_call` | 2026-10-10 | VERIFIED (biz standart proxy'yi kullanırız) |
| `decimals()` / `description()` / `version()` | Mainnet | **8** / `"ETH / USD"` / 6 | `eth_call` | 2026-10-10 | VERIFIED |
| `latestRoundData()` | Mainnet | roundId 18446744073709554237 (phase 1, round 2621). answer 250162074183 = **$2.501,62**. startedAt 1791642493. updatedAt **1791642505 (2026-10-10T14:28:25Z)**. answeredInRound = roundId | `eth_call` (`0xfeaf968c`), çözülerek | 2026-10-10 19:02Z | VERIFIED |
| Heartbeat / sapma | Mainnet | **86400 sn (24 saat) / %0,5**. Kategori "low", 8 ondalık | RDD JSON | 2026-10-10 | VERIFIED |
| Gerçek güncelleme sıklığı | Mainnet | Son ~7 günde (6M blok) 77 `AnswerUpdated`. Ortalama aralık 2,07 sa, **en uzun 15,95 sa** | `eth_getLogs` | 2026-10-10 | VERIFIED |
| ETH/USD | **Testnet** | **Yok.** Chainlink `chains.ts` Robinhood için yalnızca mainnet tanımlıyor (`feeds-robinhood-mainnet.json`), testnet RDD'si 404. Mainnet adreslerinde testnette kod yok | `chains.ts` + RDD + `eth_getCode` = 0 | 2026-10-10 | **NOT FOUND** → testnette `MockV3Aggregator` gerekli |
| **L2 Sequencer Uptime Feed** | Mainnet + Testnet | **Yok.** `chains.ts`'te Robinhood için `l2SequencerFeed: true` yok, `supportedFeatures: ["feeds"]`. L2 Sequencer Feeds sayfası 11 ağ listeliyor, Robinhood aralarında değil. RH dokümanı kullanılmasını öneriyor ama adres vermiyor. Arbitrum One feed adresinde (`0xFdB6…697D`) de kod yok | Doküman + GitHub + `eth_getCode` | 2026-10-10 | **CONTRADICTS DOC** (docs/03: "Sequencer Uptime Feed canlı") |
| Chainlink VRF | İkisi de | **Yok.** VRF v2.5 ağ listesinde Robinhood yok, `supportedFeatures` yalnızca `feeds` | Doküman | 2026-10-10 | VERIFIED (VRF yok) |

**Tasarım notu (yalnızca bulgu, docs/03 değiştirilmedi):**
- `buyEnergy` için bayatlık eşiği `≥ 86400 + tampon (ör. 1–2 sa)` olmalı.
- Sequencer feed adresi `address(0)` ise kontrol atlanacak şekilde opsiyonel tasarlanmalı. Chainlink ileride feed eklerse Timelock ile bağlanabilir.
- Testnet için mock aggregator gerekli.
- Mainnet'te bile fiyatın 24 saate kadar eski olabileceği (ama sapmanın ≤ %0,5 kalacağı) ekonomi tarafında kabul edilmeli.

---

## 3. Uniswap v4

Kaynak: [Uniswap v4 Deployments](https://developers.uniswap.org/contracts/v4/deployments), içerik [llms.mdx](https://developers.uniswap.org/llms.mdx/docs/protocols/v4/deployments) üzerinden okundu. Resmî listede yalnızca **"Robinhood Chain: 4663"** başlığı var. Testnet bölümünde Robinhood geçmiyor.

| Kontrat | Adres | Mainnet `eth_getCode` | Testnet `eth_getCode` | Durum |
|---|---|---|---|---|
| PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | 24.009 bayt | 24.009 bayt (kod hash'i mainnet ile **aynı**) | Mainnet VERIFIED (resmî). Testnet zincirde VERIFIED, resmî listede yok |
| PositionManager | `0x58daec3116aae6d93017baaea7749052e8a04fa7` | 23.877 | 23.877 (`poolManager()` → PoolManager, iki ağda da) | Aynı |
| PositionDescriptor | `0x9639443158e8c5efa35bd45287bf2effd3d8dc06` | 752 (proxy) | 752 | Aynı |
| V4Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | 6.118 | 6.118 (hash aynı) | Aynı |
| StateView | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | 3.531 | 3.531 (hash aynı) | Aynı |
| ReservesLens | `0x0000001b173C3bbF3984D417d8614E3eed34865B` | 14.142 | 14.142 | Aynı |
| UniversalRouter | `0x8876789976decbfcbbbe364623c63652db8c0904` | 24.546 | 24.546 | Aynı |
| UniversalRouter 2.1.2 | `0x204FAca1764B154221e35c0d20aBb3c525710498` | 24.380 | **0** | Mainnet VERIFIED. **Testnette yok** |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9.152 | 9.152 | VERIFIED (iki ağda) |

Ek gözlemler (2026-10-10):
- PoolManager `owner()`: mainnet `0x2bad8182c09f50c8318d769245bea52c32be46cd`, testnet `0x9701fb0ade1e269c8f64ec0c7b3cfadb31a13a52`.
- Mainnet `protocolFeeController()` = `0x6d0009504d129cf5002dba61d9ae8575aa79314c`.
- PositionManager, UniversalRouter ve Permit2'nin kod hash'leri ağlar arasında farklı. Bu, chainId'ye bağlı immutable'lardan (EIP-712 domain) beklenen bir durum.
- Mainnet'te son 200 blokta PoolManager **482 log** üretti, yani v4 aktif.
- "Pons, Pools.trade v4 kullanıyor" iddiası ayrıca doğrulanmadı (kapsam dışı).

---

## 4. Safe

Kaynaklar: [safe-deployments](https://github.com/safe-global/safe-deployments/tree/main/src/assets) (`networkAddresses` içinde `4663` ve `46630` ikisi de var), Safe Client Gateway (`safe-client.safe.global/v1/chains/{id}`), Safe Transaction Service (`api.safe.global/tx-service/{slug}/api/v1/about/`).

| Kontrat | Adres | Mainnet kod | Testnet kod | Durum |
|---|---|---|---|---|
| **Safe 1.5.0 Safe** (singleton) | `0xFf51A5898e281Db6DfC7855790607438dF2ca44b` | 21.451 | 21.451 | VERIFIED |
| **Safe 1.5.0 SafeL2** | `0xEdd160fEBBD92E350D4D398fb636302fccd67C7e` | 22.231 | 22.231 | VERIFIED |
| **Safe 1.5.0 SafeProxyFactory** | `0x14F2982D601c9458F93bd70B218933A6f8165e7b` | 3.321 | 3.321 | VERIFIED |
| Safe 1.5.0 CompatibilityFallbackHandler | `0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4` | 6.294 | 6.294 | VERIFIED |
| Safe 1.5.0 MultiSend / MultiSendCallOnly | `0x218543288004CD07832472D464648173c77D7eB7` / `0xA83c336B20401Af773B6219BA5027174338D1836` | 640 / 421 | 640 / 421 | VERIFIED |
| Safe 1.4.1 Safe / SafeL2 | `0x41675C099F32341bf84BFc5382aF534df5C7461a` / `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | 23.579 / 24.421 | aynı | VERIFIED |
| Safe 1.4.1 SafeProxyFactory | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | 3.054 | 3.054 | VERIFIED |
| Safe 1.4.1 CompatibilityFallbackHandler | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` | 5.637 | 5.637 | VERIFIED |
| Safe 1.4.1 MultiSend / MultiSendCallOnly | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` / `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` | 629 / 410 | aynı | VERIFIED |
| Safe 1.4.1 SignMessageLib / CreateCall / SimulateTxAccessor | `0xd53cd0aB83D845Ac265BE939c57F53AD838012c9` / `0x9b35Af71d77eaf8d7e40252370304687390A1A52` / `0x3d4BA2E0884aa488718476ca2FB8Efc291A46199` | var | var | VERIFIED |
| Safe 1.3.0 (canonical) GnosisSafe / L2 / ProxyFactory | `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` / `0x3E5c63644E683549055b9Be8653de26E0B4CD36E` / `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` | var | var | VERIFIED (eip155 varyantları da var) |
| Safe 4337 Module v0.3.0 / SafeModuleSetup v0.3.0 | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` / `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | 8.373 / 547 | aynı | VERIFIED ([RH AA](https://docs.robinhood.com/chain/account-abstraction) ile uyumlu) |
| **Safe{Wallet} arayüzü** | 4663 | `chainName: "Robinhood Chain"`, `shortName: robinhood`, `l2: true`, **önerilen sürüm 1.5.0**. Tx servisi `https://api.safe.global/tx-service/robinhood` (HTTP 200). Özellikler: TX_SIMULATION, NATIVE_SWAPS, MULTI_CHAIN_SAFE_CREATION vb. | Client Gateway + tx-service `about` | 2026-10-10 | VERIFIED |
| **Safe{Wallet} arayüzü** | 46630 | `chainName: "Robinhood Testnet"`, `shortName: robinhood-testnet`, `isTestnet: true`. Tx servisi `…/tx-service/robinhood-testnet` (HTTP 200). `features: []` (simülasyon vb. yok) | Aynı | 2026-10-10 | VERIFIED |

---

## 5. ERC-4337 EntryPoint ve EIP-7702

| Kontrat | Adres | Mainnet | Testnet | Durum |
|---|---|---|---|---|
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | 23.689 bayt | 23.689 | VERIFIED |
| **EntryPoint v0.7** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16.035 bayt | 16.035 (hash aynı) | **VERIFIED** |
| **EntryPoint v0.8** | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` | 21.738 bayt | 21.738 (hash farklı: chainId'ye bağlı EIP-712 immutable) | **VERIFIED** |
| EntryPoint v0.9 (ek) | `0x433709009B8330FDa32311DF1C2AFA402eD8D009` | 22.425 bayt | 22.425 | VERIFIED (dokümanda geçmiyor) |
| EIP-7702 | Mainnet | Son 200 blokta 2 adet type-`0x4` işlem görüldü, ör. `0x95b458c30d36af7cecd23cdbb0a7eb0164d5db3f21d1f54f6acde1e8445f5cd4` (1 yetkilendirme, `to` = EntryPoint v0.8) | `eth_getBlockByNumber(…, true)` + [RH AA](https://docs.robinhood.com/chain/account-abstraction) | 2026-10-10 | VERIFIED (mainnet). Testnette doküman + ArbOS 61'e dayanıyor |
| Yardımcılar (ek) | İkisi de | Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`, CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`, Arachnid CREATE2 `0x4e59b44847b379578588920cA78FbF26c0B4956C`, Safe Singleton Factory `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` | `eth_getCode` (hepsi var) | 2026-10-10 | VERIFIED |

---

## 6. EVM özellik desteği (eth_call ile kontrat oluşturma simülasyonu)

Her test, `to` alanı olmayan bir `eth_call` ile init code çalıştırıp sonucu 32 bayt olarak döndürüyor. İki ağda da sonuçlar aynı çıktı. Hex dizilerindeki boşluklar yalnızca okunabilirlik için. `…` ile kısaltılan son ek her testte `6000526020 6000f3` (`mstore(0,x); return(0,32)`).

| Opcode / özellik | Test init code (hex) | Mainnet sonucu | Testnet sonucu | Durum |
|---|---|---|---|---|
| PUSH0 (`0x5f`, Shanghai) | `602a5f5260205ff3` | `…2a` | `…2a` | VERIFIED |
| TSTORE/TLOAD (`0x5d/0x5c`, Cancun) | `600760015d60015c6000526020 6000f3` | `…07` | `…07` | VERIFIED |
| MCOPY (`0x5e`, Cancun) | `602a600052 602060006020 5e 60206020f3` | `…2a` | `…2a` | VERIFIED |
| BASEFEE (`0x48`) | `48…` | gasPrice olmadan 0 (eth_call kuralı). `gasPrice` verilip simülasyonluk bakiye override edilince **20.152.000** wei | 10.000.000 wei | VERIFIED |
| PREVRANDAO/DIFFICULTY (`0x44`) | `44…` | **1** (sabit; blok başlığında `difficulty = 0x1`) | **1** | VERIFIED (sabit 1, rastgelelik yok) |
| NUMBER (`0x43`) ve `ArbSys.arbBlockNumber()` | `43…` / `0xa3b1b31d` → `0x…64` | NUMBER = 26.164.016 (**L1 tahmini**), arbBlockNumber = 85.227.058 (L2) | NUMBER = 11.886.484, arbBlockNumber = 132.467.554 | VERIFIED |
| CHAINID (`0x46`) | `46…` | 4663 | 46630 | VERIFIED |
| CLZ (`0x1e`, **Osaka**) | `60011e…` | 255 (doğru) | 255 | VERIFIED (Osaka opcode'u çalışıyor) |
| BLS12-381 precompile (`0x0b`, **Prague** EIP-2537) | G1ADD(∞+∞), 256 sıfır bayt | 128 bayt sıfır (geçerli) | aynı | VERIFIED |
| KZG point eval (`0x0a`) | Boş girdi | `invalid input length` (precompile var) | aynı | VERIFIED |
| BLOBBASEFEE (`0x4a`) | `4a…` | **Hata:** `BLOBBASEFEE is not supported on Arbitrum` | aynı | Kullanılmamalı |
| BLOBHASH (`0x49`) | `600049…` | 0 | 0 | Anlamsız (blob yok) |
| SLOTNUM (`0x4b`, **Amsterdam**) | `4b…` | **`invalid opcode: SLOTNUM`** | aynı | Desteklenmiyor |
| GASLIMIT / COINBASE | — | `0x4000000000000` (2^50) / `0xA4B000000000000000000073657175656e636572` | aynı | Bilgi (anlamsız değerler, kullanılmamalı) |
| P256VERIFY (`0x100`) | `eth_getCode` | Kod yok (precompile'larda kod olmaz; test vektörü denenmedi) | aynı | NOT FOUND (test edilmedi) |
| **Maks. kontrat boyutu** | 24.577 / 98.304 / 98.305 bayt döndüren init code | 98.304 OK. 98.305 → `max code size exceeded: … limit 98304` | aynı | **VERIFIED: 96 KB (98.304)** |
| **Maks. init code** | 196.609 bayt init code | `max initcode size exceeded: … limit 196608` | aynı | **VERIFIED: 192 KB** |

**Hangi `evmVersion` güvenli?**
- `cancun`, `prague` ve `osaka` güvenli: tüm opcode ve precompile testleri geçti. **`amsterdam` güvensiz.**
- Solc ≥ 0.8.31 varsayılan olarak `osaka` kullanıyor ([v0.8.31 notları](https://github.com/argotorg/solidity/releases/tag/v0.8.31)), 0.8.30 `prague` kullanıyordu. Son sürüm **0.8.37** (2026-09-10, iki "important" güvenlik düzeltmesi içeriyor).
- **Öneri:** `foundry.toml` içinde `evm_version = "prague"` açıkça sabitlenmeli. Analiz ve fuzz araçlarıyla uyum en geniş bu sürümde. Zincir tarafında `osaka` da çalışıyor.
- `block.blobbasefee` ve Amsterdam özellikleri (`block.slotnum`) kullanılmamalı.

---

## 7. Blockscout'ta kontrat doğrulama

Kaynaklar: [RH Deploy](https://docs.robinhood.com/chain/deploy-smart-contracts), [Blockscout Foundry](https://docs.blockscout.com/devs/verification/foundry-verification).

| Kalem | Ağ | Değer | Nasıl doğrulandı | Tarih | Durum |
|---|---|---|---|---|---|
| Explorer | Mainnet | `https://robinhoodchain.blockscout.com` | RH docs, viem, Safe config | 2026-10-10 | VERIFIED |
| Explorer | Testnet | `https://explorer.testnet.chain.robinhood.com` (Blockscout; `/api/v2/stats` yanıt verdi, `x-ratelimit-limit: 300`) | RH docs + API | 2026-10-10 | VERIFIED |
| API URL | Mainnet | `https://robinhoodchain.blockscout.com/api/` | RH docs | 2026-10-10 | VERIFIED (doküman). **Bu ortamdan curl ve WebFetch ile HTTP 403 (Cloudflare managed challenge)** |
| API URL | Testnet | `https://explorer.testnet.chain.robinhood.com/api/` | RH docs + API HTTP 200 | 2026-10-10 | VERIFIED |
| Foundry zincir takma adı | — | `alloy-chains` içinde "robinhood" yok. `--chain-id` / `--chain 4663` sayısal verilmeli | GitHub `alloy-rs/chains` | 2026-10-10 | Bilgi |

Mainnet için:
```bash
forge verify-contract <ADRES> src/X.sol:X \
  --chain-id 4663 --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/
```

Testnet için:
```bash
forge verify-contract <ADRES> src/X.sol:X \
  --chain-id 46630 --rpc-url https://rpc.testnet.chain.robinhood.com \
  --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
```

Self-hosted Blockscout'ta API anahtarı gerekmiyor. `--etherscan-api-key` verilmeyebilir ya da boş olmayan herhangi bir dizge yazılabilir.

**Yedek yol (403 sorununa karşı):**
- Blockscout PRO API: `--verifier-url "https://api.blockscout.com/v2/api?chain_id=4663" --etherscan-api-key <PRO_KEY>`. Ücretsiz anahtar dev.blockscout.com'dan alınıyor. Anahtarsız istek `HTTP 402 "Proceed with API key or make a X402 payment"` döndürdü, bu yüzden 4663'ün PRO API'de desteklendiği teyit edilemedi.
- Son çare: explorer arayüzünden "Standard JSON input" ile elle doğrulama.

---

## 8. Cüzdan ve giriş araçları (sıfır bütçe)

| Kalem | Değer | Nasıl doğrulandı | Tarih | Durum |
|---|---|---|---|---|
| (a) viem yerleşik zincirleri | `robinhood` (id 4663, `blockTime: 100`, multicall3 `0xca11…ca11`, explorer Blockscout) ve `robinhoodTestnet` (46630) mevcut. İlk ekleme 2026-07-08 (PR #4818). Son sürüm viem@2.57.4 (2026-10-08) paketinde dosya var | GitHub `wevm/viem/src/chains/definitions/robinhood*.ts` + unpkg | 2026-10-10 | VERIFIED |
| (a) Uyarı | viem'in varsayılan `rpcUrls` listesinde 3. taraf `https://rpc.ordofi.network` (ve `wss://rpc.ordofi.network`) var. Üretimde `transports` açıkça yazılmalı. Not: `rpc.ordofi.network` ve `robinhood.drpc.org` `eth_chainId` = 4663 döndürdü | GitHub + RPC | 2026-10-10 | Bilgi |
| (b) RainbowKit | Her wagmi/viem zinciri `getDefaultConfig({ chains: [robinhood, robinhoodTestnet] })` ile eklenebiliyor. Özel ikon için `iconUrl`/`iconBackground` kullanılıyor. **WalletConnect `projectId` zorunlu** (ücretsiz Reown Cloud hesabı) | [RainbowKit custom chains](https://rainbowkit.com/docs/custom-chains) | 2026-10-10 | VERIFIED |
| (b) Reown ücretsiz plan | $0. **500 MAU** (yalnızca gömülü cüzdan ve kimlik doğrulama için), 2,5M RPC/ay, 1 proje. Düz cüzdan bağlantısı ("500+ wallet") tüm planlarda var | [Reown pricing](https://reown.com/pricing) | 2026-10-10 | VERIFIED |
| (b) Robinhood Wallet ve WalletConnect | Destek makalesi: WalletConnect ile "Ethereum, Polygon, Arbitrum, Optimism, Base, and Robinhood Chain" dapp'lerine bağlanılabiliyor (iOS, Android, web QR) | [Robinhood: Connect to dapps](https://robinhood.com/us/en/support/articles/connect-to-dapps/) | 2026-10-10 | VERIFIED (mainnet). Testnet desteği belirtilmemiş → testte MetaMask/Rabby |
| (c) **Privy** | Ücretsiz **0–499 MAU**. Aylık 50K imza ve $1M işlem hacmi dahil. Core $299/ay (500–2.499), Scale $499/ay (2.500–9.999), 10K+ için $2.000 + $0,05/MAU. Native gas sponsorship listesinde **"Robinhood Chain"** ve **"Robinhood Testnet"** var | [Privy pricing](https://www.privy.io/pricing), [Privy gas](https://docs.privy.io/wallets/gas-and-asset-management/gas/overview) | 2026-10-10 | VERIFIED (docs/03'teki "≤ 499 MAU" doğru) |
| (c) **Dynamic** | Self-Serve ücretsiz **≤ 1.000 MAU** ("rate limits apply"). 1.000–5.000 MAU $249/ay, sonrası $0,05/MAU. Zincir: Tier 1 "Ethereum (+ all EVM networks)", Robinhood dokümanda isimle geçmiyor (custom network olarak eklenir). RH AA sayfası Dynamic'i listeliyor | [Dynamic pricing](https://www.dynamic.xyz/pricing), [Dynamic chains](https://dynamic.xyz/docs/overview/wallets-and-chains/overview), [RH AA](https://docs.robinhood.com/chain/account-abstraction) | 2026-10-10 | VERIFIED (limit). Zincir desteği genel EVM olarak var, isimle doğrulanamadı |
| (d) **Alchemy ücretsiz** | **30M CU/ay**, "15 requests per second", 5 app ve 5 webhook. **"All mainnets & testnets"** ücretsiz planda. "Smart websockets" dahil. Uçlar: `https://robinhood-mainnet.g.alchemy.com/v2/KEY`, `wss://robinhood-mainnet.g.alchemy.com/v2/KEY`, `https://robinhood-testnet.g.alchemy.com/v2/KEY` | [Alchemy pricing](https://www.alchemy.com/pricing), [Alchemy Robinhood](https://www.alchemy.com/rpc/robinhood), [RH Connecting](https://docs.robinhood.com/chain/connecting) | 2026-10-10 | VERIFIED |
| (d) Alchemy CU maliyeti | `eth_getBlockByNumber` 20, `eth_getLogs` 60, `eth_call` 26, `eth_blockNumber` 10, `eth_subscribe` 10/olay | [CU costs](https://www.alchemy.com/docs/reference/compute-unit-costs) | 2026-10-10 | VERIFIED |
| (d) Sıfır bütçe hesabı | ~843K blok/gün. `newHeads` aboneliği ≈ 8,4M CU/gün ≈ **253M CU/ay**. Her bloğu çekmek (`getBlockByNumber`) ≈ **506M CU/ay**. İkisi de 30M sınırının çok üstünde. Yalnızca kendi kontratlarımızın logları (`eth_subscribe logs` ya da 10 sn'de bir `eth_getLogs` ≈ 15,5M CU/ay) sığıyor | Hesap | 2026-10-10 | **CONTRADICTS DOC** (docs/03 §6 "Alchemy birincil, WSS": ücretsiz planda yalnızca dar kullanımla mümkün) |
| Public RPC WSS | Dokümanda `wss://feed.mainnet.chain.robinhood.com` ve `wss://feed.testnet…` geçiyor. Bunlar **Nitro sequencer yayın akışı** (bağlanınca `{"version":1,"messages":[{"sequenceNumber":…}]}` yolluyor), JSON-RPC değil. `wss://rpc.*.chain.robinhood.com` bağlantıyı reddetti | Node WebSocket testi | 2026-10-10 | **CONTRADICTS DOC** (WSS JSON-RPC yok) |
| Public RPC limitleri | `eth_getLogs` tek seferde en fazla **10.000.000 blok**. `debug_traceBlockByNumber` **yok**. `eth_getBlockReceipts` ve `eth_feeHistory` var. Doküman: "rate-limited and not recommended for production" | RPC + [RH Connecting](https://docs.robinhood.com/chain/connecting) | 2026-10-10 | VERIFIED |

---

## 9. Testnet faucet'leri

| Faucet | Miktar / sıklık | Şartlar | Nasıl doğrulandı | Tarih | Durum |
|---|---|---|---|---|---|
| Resmî: `https://faucet.testnet.chain.robinhood.com/` | Arama özeti: 0,1 ETH/24 sa, hesap gerekmiyor. 3. taraf kaynak test Stock Token'ları da verdiğini yazıyor | Bilinmiyor | Sayfa Vercel Security Checkpoint'in arkasında (HTTP 429). İçerik okunamadı, bot korumasını aşma denenmedi | 2026-10-10 | **NOT FOUND** (limitler doğrulanamadı) |
| Alchemy: `https://www.alchemy.com/faucets/robinhood-testnet` | **0,1 ETH / 24 sa** | Alchemy hesabı gerekmiyor. **Ethereum mainnet'te ≥ 0,001 ETH** ve mainnet işlem geçmişi şart. Testnet bakiyesi düşük olmalı | Faucet sayfası | 2026-10-10 | VERIFIED |
| Chainstack: `https://faucet.chainstack.com/robinhood-chain-testnet-faucet` | **1 ETH'ye kadar / 24 sa** (bakiyeyi 1 ETH'ye tamamlıyor) | **Chainstack API anahtarı** (ücretsiz hesap). **Mainnet'te ≥ 0,08 ETH** ve holding geçmişi şart | Faucet sayfası | 2026-10-10 | VERIFIED |
| QuickNode, ethfaucet.com, Chainlink (yalnızca 25 test LINK) | 3. taraf makale: QuickNode 12 sa, ethfaucet 0,1 ETH/24 sa | — | Yalnızca [datawallet](https://www.datawallet.com/crypto/get-robinhood-chain-testnet-tokens) | 2026-10-10 | NOT FOUND (birincil kaynakta doğrulanmadı) |

**Sıfır bütçe notu:** Testnet gas 0,01 gwei olduğundan 5M gas'lık bir deploy ≈ 5e-5 ETH tutuyor. 0,1 ETH yüzlerce deploy'a yeter. Alchemy ve Chainstack faucet'leri gerçek mainnet ETH bakiyesi istiyor (0,001 ve 0,08 ETH).

---

## 10. İndeksleme

| Kalem | Değer | Nasıl doğrulandı | Tarih | Durum |
|---|---|---|---|---|
| Ponder ve düz RPC | Zincirden bağımsız (`chains: { robinhood: { id: 4663, rpc, ws?, pollingInterval, ethGetLogsBlockRange } }`). Özel zincir desteği gerekmiyor. Birden çok RPC verilirse yük dengeliyor. Son sürüm 0.18.x | [Ponder chains](https://ponder.sh/docs/config/chains) | 2026-10-10 | VERIFIED |
| **Ponder caveat (önemli)** | Realtime senkronizasyon **her bloğu** `eth_getBlockByNumber(n, true)` ile çekiyor (`MAX_QUEUED_BLOCKS = 50`; `eth_getLogs` yalnızca bloom eşleşirse atlanıyor). 100 ms blokta bu **~10 istek/sn ve ~843K istek/gün** demek. Alchemy free (15 rps, 30M CU) bunu kaldırmaz. Public RPC üretim için önerilmiyor. `debug_*` olmadığı için call-trace indeksleme public RPC ile yapılamaz | Kaynak kod: `packages/core/src/sync-realtime/index.ts` (L998–1027) | 2026-10-10 | VERIFIED (tasarım riski) |
| Envio HyperSync / HyperRPC | **Yalnızca mainnet** (`https://4663.hypersync.xyz` = `https://robinhood.hypersync.xyz`, `/height` = 85.234.440). `46630.hypersync.xyz` çözülmedi. **API token zorunlu.** Kişisel hesaba 1 ücretsiz token ("fair-use" limit). Starter $70/ay | Endpoint testi + [Envio chains](https://envio.dev/chains/robinhood) + [API tokens](https://docs.envio.dev/docs/HyperSync/api-tokens) + [pricing](https://envio.dev/pricing/hypersync) | 2026-10-10 | VERIFIED (testnet yok) |
| Envio HyperIndex barındırma | Ücretsiz geliştirme planı: 100K olay / 5 GB / 30 gün sonra silinir. Dockerfile ile self-host mümkün | [Envio pricing](https://envio.dev/pricing) | 2026-10-10 | VERIFIED (üretim için uygun değil) |
| Goldsky | `robinhood` (4663) ve **`robinhood-testnet`** (46630) destekleniyor: Subgraphs, Turbo, Compose, Edge RPC. **Starter ücretsiz, kredi kartı istemiyor:** 3 sürekli açık subgraph (2.250 worker-saat), 100K entity, 20 istek/10 sn | [Goldsky Robinhood](https://goldsky.com/chains/robinhood), [Goldsky pricing](https://goldsky.com/pricing) | 2026-10-10 | VERIFIED |

**Sıfır bütçe değerlendirmesi:**
- Self-hosted Ponder, ücretsiz RPC'lerle realtime modda sürdürülebilir değil.
- Seçenekler:
  - (1) Goldsky Starter subgraph (testnet + mainnet).
  - (2) Ponder'ı birden çok ücretsiz RPC ile (public + dRPC + OrdoFi) yük dengeli çalıştırmak. Denenmedi, rate-limit riski var.
  - (3) Kendi basit `eth_getLogs` poller'ımız (10 sn aralıkla Alchemy free'ye sığar).
  - (4) Gelir gelince ücretli RPC veya kendi Nitro düğümümüz.

---

## 11. Robinhood Chain kullanım koşulları (ToS)

Kaynak: [docs.robinhood.com/chain/terms-of-service](https://docs.robinhood.com/chain/terms-of-service). Sayfada **"Last Updated: August 24, 2026"** yazıyor. Arama motoru indeksinde hâlâ eski "February 10, 2026" başlığı görünüyor.

| Madde | İçerik (özet) | Oyuna etkisi | Durum |
|---|---|---|---|
| §2.2 Uygunluk | En az **18 yaş** ve tam ehliyet. Yaptırım altındaki kişiler ve yaptırımlı yargı bölgeleri yasak. Kısıtları aşmak için **VPN/proxy kullanımı yasak** | Oyun ToS'unda 18+ ve yaptırım beyanı. Ön yüzde coğrafi uyarı | VERIFIED |
| §2.3 Yasak kullanımlar | Hukuka aykırı faaliyet, istismar, dolandırıcılık. "Network Abuse": "use of automated tools (such as bots, scrapers, or spiders)", DoS ve teknik kısıtları aşma. Oyun, kumar ya da piramit için ayrıca bir madde yok | Keeper ve botlarımız ağı bozmayacak hızda, rate-limit'li çalışmalı. Oyuncu botlarına karşı politika yazılmalı | VERIFIED |
| §2.1 Sequencer / RPC | Sequencer ve public RPC için çalışma süresi garantisi yok, kesintiden doğan kayıplara sorumluluk kabul edilmiyor. "Robinhood does not control what third parties build" | Kesintide oyuncu cezalandırılmamalı (docs/03 ile uyumlu). Üretimde public RPC'ye dayanılmamalı | VERIFIED |
| §2.5 Testnet | Testnet tokenlarının değeri yok ve Robinhood ödüllerine dönüşmüyor | Testnet teşvik vaadi verilmemeli | VERIFIED |
| §5.5 İşaretler | "ROBINHOOD CHAIN" kelime markası, zincir bağlamında "ROBINHOOD" ve resmî logo/rozetler | — | VERIFIED |
| §5.6 Ön onaylı kullanım | "Compatible with / Deployed on / **Built on Robinhood Chain**", geliştirici araçları, editoryal içerik, uyarılı topluluk girişimleri | Pazarlamada yalnızca bu kalıplar kullanılmalı | VERIFIED |
| §5.7(b) | Resmî statü ya da onay ima edilemez. Topluluk kanallarında "not affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc." uyarısı zorunlu | Site, Discord ve X'te bu uyarı yer almalı | VERIFIED |
| §5.7(d) | İşaretler kendi markamızda, alan adında, **sosyal medya kullanıcı adında, token adında** ya da başka ayırt edici tanımlayıcıda kullanılamaz | "Mohonaut / $MOHN" uygun. Alan adında ve handle'da "robinhood" kullanılmamalı | VERIFIED |
| §5.7(h) | "No Use in NFTs, Digital Collectibles, or **Token Metadata**": işaretler NFT görsellerinde, metadata'da ya da kontrat özniteliklerinde yer alamaz | Token logosu ve metadata'sında Robinhood Chain logosu kullanılmamalı. İleride NFT olursa da aynı kural geçerli | VERIFIED (raporda yazan "işaret kullanımı" kapsamı doğru, başlık artık "Token Metadata"yı da içeriyor) |
| §5.7(i)–(k) | (i) İşaretler yapay zekâyla üretilmiş medyada kullanılamaz. (j) "Stock Tokens" terimi zorunlu, "tokenized stocks" denemez. (k) **Büyüme metriklerinde türetme yöntemi, zaman aralığı ve kaynak belirtilmeli** | Pazarlamadaki oyuncu ve hacim iddiaları kaynaklı olmalı | VERIFIED |
| §6 Adres engelleme | "…including by **restricting or blocking specific wallet addresses** from participating on Robinhood Chain" | Kontratlar, engellenmiş adreslerin varlığına dayanmamalı. Göç planı gerekiyor (docs/03 ile uyumlu) | VERIFIED |
| §12–13 Uyuşmazlık | FAA, Delaware hukuku, bağlayıcı tahkim, toplu dava feragati. Marka ve fikrî mülkiyet uyuşmazlıkları için mahkeme istisnası (§12.14) | Hukuki görüş dokümanına (07) not | VERIFIED |
| §15 Değişiklikler | Değişiklikler yayımlandığı anda yürürlüğe giriyor, kullanmaya devam etmek kabul sayılıyor | Periyodik ToS kontrolü (runbook) | VERIFIED |

---

## docs/03 ile farklar

### ✱ işaretli varsayımlar

| # | docs/03'teki ifade (satır) | Sonuç | Doğru değer / not |
|---|---|---|---|
| ✱0 | "Faz 0'da her adres ve sürüm testnet'te yeniden doğrulanacak" (s.4) | Bu dokümanla yapıldı | Adresler §2–§5 tablolarında |
| ✱1a | Chainlink: "Fiyat beslemeleri … canlı" + "ETH/USD enerji fiyatlaması ✱" (s.17) | **VERIFIED (mainnet)** | ETH/USD proxy `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`, 8 ondalık, heartbeat **86400 sn**, sapma **%0,5** |
| ✱1b | Aynı satır: testnette kullanım (06 §0.4 "mainnet+testnet") | **CONTRADICTS DOC** | **Testnette Chainlink beslemesi yok** → `MockV3Aggregator` |
| ✱1c | "L2 Sequencer Uptime Feed canlı" (s.17) | **CONTRADICTS DOC** | **Chainlink'te Robinhood için Sequencer Uptime Feed yok** (iki ağda da). Kontrol opsiyonel ya da feature-flag olmalı. Bayatlık eşiği ≥ 24 sa + tampon |
| ✱1d | "VRF listede yok" (s.17) | **VERIFIED** | VRF v2.5 listesinde yok, `supportedFeatures: ["feeds"]` |
| ✱2 | Uniswap v4: "POL ve buyback v4 üzerinde ✱" (s.21) | **VERIFIED** | Mainnet resmî: PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`, PositionManager `0x58daec3116aae6d93017baaea7749052e8a04fa7`, UniversalRouter `0x8876789976decbfcbbbe364623c63652db8c0904`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`, StateView `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b`, Quoter `0x8dc178efb8111bb0973dd9d722ebeff267c98f94`. Testnette aynı adreslerde zincirde var ama **resmî listede yok**. UR 2.1.2 testnette yok |
| ✱2b | "Pons, Pools.trade v4 kullanıyor" (s.21) | Doğrulanamadı (kapsam dışı) | v4 mainnet'te aktif (son 200 blokta 482 PoolManager logu) |
| ✱3 | Safe: "Lansmandan beri canlı — Ops/Guardian Safe'leri ✱" (s.22) | **VERIFIED** | Safe 1.3.0, 1.4.1 ve 1.5.0 iki ağda da var. Safe{Wallet} 4663 (`robinhood`) ve 46630'u (`robinhood-testnet`) destekliyor. **Önerilen sürüm 1.5.0**: SafeL2 `0xEdd160fEBBD92E350D4D398fb636302fccd67C7e`, ProxyFactory `0x14F2982D601c9458F93bd70B218933A6f8165e7b`, FallbackHandler `0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4`, MultiSend `0x218543288004CD07832472D464648173c77D7eB7` |
| ✱4 | "Foundry ≥ 1.8 ✱" (s.47) | **VERIFIED** | Son kararlı sürüm v1.8.5 (2026-10-05). Not: Foundry'de "robinhood" takma adı yok, `--chain-id 4663` kullanılmalı |
| ✱5 | "Solidity 0.8.30+ (EVM hedefi testnet'te doğrulanacak ✱)" (s.47) | **VERIFIED** | cancun, prague ve osaka güvenli (PUSH0, MCOPY, TSTORE/TLOAD, CLZ, BLS ✔), amsterdam değil (SLOTNUM ✘), BLOBBASEFEE ✘. Öneri: `evm_version = "prague"` sabitlenmeli. Solc 0.8.31+ varsayılanı `osaka` (o da çalışıyor). Güncel solc 0.8.37 |

### ✱ olmayan ama kontrol edilen satırlar

| docs/03 ifadesi | Sonuç | Not |
|---|---|---|
| Chain ID 4663 / 46630 (s.12) | VERIFIED | — |
| Arbitrum Nitro tabanlı L2, ETH gas (s.13) | VERIFIED | Nitro v3.12.1-rc.2, ArbOS 61 |
| ~100 ms, FCFS, priority fee yok (s.14) | VERIFIED | Mainnet ort. 102,5 ms, testnet ~116 ms. `eth_maxPriorityFeePerGas` = 0 |
| `block.number` L1 tahmini döndürür (s.15) | VERIFIED | NUMBER 26.164.016, `arbBlockNumber` 85.227.058. Not: `block.timestamp` 1 sn çözünürlüklü, ~10 L2 bloğu aynı damgayı paylaşıyor |
| `prevrandao` sabit (s.16) | VERIFIED | Değeri **1** |
| ERC-4337 EntryPoint v0.6/0.7/0.8 + EIP-7702 (s.18) | VERIFIED | v0.9 de mevcut. Mainnet'te type-4 işlemler görüldü |
| Kontrat boyutu 96 KB (s.19) | VERIFIED | Limit 98.304 bayt, init code 196.608 bayt (ampirik) |
| Explorer Blockscout, `forge verify-contract --verifier blockscout` (s.20) | VERIFIED | Testnet explorer `explorer.testnet.chain.robinhood.com`. Mainnet API bu ortamdan Cloudflare 403 verdi (§7) |
| İşlem başı ≈ $0,006 (§4.2) | Makul | ≈120K gas'a denk geliyor. 250K gas ≈ $0,013 (baseFee 0,02016 gwei, ETH $2.501,62) |
| Dynamic ≤ 1.000 MAU, Privy ≤ 499 MAU ücretsiz (§4.2) | VERIFIED | Privy'de ek olarak aylık 50K imza ve $1M hacim. Privy gas sponsorship Robinhood mainnet ve testnet'i destekliyor |
| RainbowKit + WalletConnect, Robinhood Wallet (§4.2) | VERIFIED | Ücretsiz Reown `projectId` gerekiyor. Robinhood Wallet, WalletConnect ile Robinhood Chain'e bağlanabiliyor |
| Ponder; yedek Envio HyperSync veya Goldsky (§4.3) | Kısmen | Ponder çalışıyor ama realtime modda ~843K blok/gün çekiyor (ücretsiz RPC'lere sığmıyor). Envio yalnızca mainnet'te ve token istiyor. Goldsky mainnet ve testnet'te ücretsiz Starter planıyla var |
| RPC: Alchemy (birincil, WSS + webhook) (§6) | **Kısmen çelişiyor** | Alchemy free'de Robinhood ve WSS var, ama 30M CU/ay `newHeads` ya da blok başı indeksleme için ~8–17 kat yetersiz. Public RPC'de JSON-RPC WSS yok (`wss://feed.*` sequencer akışı) |

---

### Ana kaynaklar
- Robinhood: [Connecting](https://docs.robinhood.com/chain/connecting), [Differences](https://docs.robinhood.com/chain/differences-from-ethereum), [Deploy](https://docs.robinhood.com/chain/deploy-smart-contracts), [Oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds), [Account abstraction](https://docs.robinhood.com/chain/account-abstraction), [Add network](https://docs.robinhood.com/chain/add-network-to-wallet), [ToS](https://docs.robinhood.com/chain/terms-of-service), [Connect to dapps](https://robinhood.com/us/en/support/articles/connect-to-dapps/)
- Chainlink: [RDD robinhood-mainnet](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json), [chains.ts](https://github.com/smartcontractkit/documentation/blob/main/src/features/data/chains.ts), [L2 Sequencer Feeds](https://docs.chain.link/data-feeds/l2-sequencer-feeds), [VRF v2.5 networks](https://docs.chain.link/vrf/v2-5/supported-networks)
- Uniswap: [v4 deployments](https://developers.uniswap.org/contracts/v4/deployments)
- Safe: [safe-deployments](https://github.com/safe-global/safe-deployments), Client Gateway `safe-client.safe.global/v1/chains/4663` ve `/46630`
- viem: [robinhood.ts](https://github.com/wevm/viem/blob/main/src/chains/definitions/robinhood.ts), [robinhoodTestnet.ts](https://github.com/wevm/viem/blob/main/src/chains/definitions/robinhoodTestnet.ts)
- Solidity: [releases](https://github.com/argotorg/solidity/releases). Foundry: [releases](https://github.com/foundry-rs/foundry/releases)
- Fiyatlandırma ve servisler: [Privy](https://www.privy.io/pricing), [Dynamic](https://www.dynamic.xyz/pricing), [Reown](https://reown.com/pricing), [Alchemy](https://www.alchemy.com/pricing), [Alchemy CU](https://www.alchemy.com/docs/reference/compute-unit-costs), [Envio](https://envio.dev/pricing), [Goldsky](https://goldsky.com/pricing)
- Faucet'ler: [Alchemy](https://www.alchemy.com/faucets/robinhood-testnet), [Chainstack](https://faucet.chainstack.com/robinhood-chain-testnet-faucet)
- Ponder: [chains config](https://ponder.sh/docs/config/chains), [sync-realtime kaynak kodu](https://github.com/ponder-sh/ponder/blob/main/packages/core/src/sync-realtime/index.ts)
