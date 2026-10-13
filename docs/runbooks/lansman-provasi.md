# Lansman provası: deploy → Genesis → Market Open (docs/06 §9.1, docs/04 §4)

Mainnet lansmanı, testnet'te en az **iki kez** uçtan uca aynı komutlarla prova edilir (docs/04 §4.5). Testnet'te zaman hızlandırılmaz: Genesis'ten Market Open'a gerçek 72 saat geçer. Bu belge adımları, sorumlularını ve beklenen süreleri sıralar. Her provanın sonunda ölçülen saatler aşağıdaki "Prova kayıtları" bölümüne yazılır.

Sorumlular: **K** kurucu (anahtarlar, Safe'ler, X), **Ke** keeper servisi (otomatik), **C** Claude (kod, doğrulama, belge), **H** herkes (izinsiz çağrılar).

## Adımlar

| #   | Zaman       | Adım                                                                                               | Sorumlu        | Beklenen süre | Komut / yer                                                                                            | Kontrol                                                                                                                                            |
| --- | ----------- | -------------------------------------------------------------------------------------------------- | -------------- | ------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | T−7 g       | Sürüm dondurma: `main` yeşil, kontrat kodu etiketli, bytecode hash yayımlanmaya hazır              | C              | 1 saat        | `forge build --sizes`, etiket `vX.Y.Z`                                                                 | CI yeşil; `contracts/` değişmiyor                                                                                                                  |
| 2   | T−7 g       | Deploy + yapılandırma + devir (tek yayın)                                                          | K              | 15–30 dk      | testnet: `.\contracts\script\testnet\redeploy.ps1`; mainnet: `contracts/script/README.md` (`--ledger`) | Script sonunda `assertHandedOver` geçti; `deployments/<chainId>.json` yazıldı                                                                      |
| 3   | T−7 g       | Blockscout doğrulaması (implementasyon + proxy)                                                    | K → C          | 10–60 dk      | `--verify`; olmazsa `forge verify-contract` (docs/ZINCIR_DOGRULAMA.md §7)                              | Explorer'da kaynak kod yeşil tik                                                                                                                   |
| 4   | T−7 g       | Yayın: `/contracts` sayfası adresleri, roller, Safe sahipleri, timelock gecikmeleri, bytecode hash | C              | 1 saat        | `deployments/*.json` → web derlemesi                                                                   | `/contracts` canlı; X'te CA gönderisi (K)                                                                                                          |
| 5   | T−7 g       | Arka uç: indeksleyici başlangıç bloğundan, API, keeper yeni deployment dosyasıyla                  | K (sunucu) + C | 30 dk         | `infra/RUNBOOK.md` §4; keeper `DEPLOYMENT_FILE`                                                        | `/ops` → _Health_ yeşil; indeksleyici başa kadar işledi; keeper Genesis'ten en az 24 saat önce sürekli çalışıyor ve `poke`/besleme logları düşüyor |
| 6   | T−24 s      | Pre-fill penceresi: kayıt + yakıt alımı açık                                                       | H              | 24 saat       | oyun `/play`                                                                                           | Kayıt olayları indekste; beslemenin taze olduğu `/status`'ta görünüyor                                                                             |
| 7   | T0          | **Genesis Dig**: tahakkuk başlar, rafine kapalı                                                    | — (zamanla)    | anında        | `genesisTime`                                                                                          | İlk saatlik checkpoint (`poke`) ≤ 1 saat içinde; Keeper logu `poked`                                                                               |
| 8   | T0 … T+72 s | Saatlik checkpoint, besleme yenileme, rafine kuyruğu                                               | Ke             | sürekli       | keeper (`JOBS=feed,poke,…`)                                                                            | Checkpoint gecikmesi < 2 saat; besleme hiç bayatlamıyor                                                                                            |
| 9   | T+72 s      | **Market Open**: `openMarket()` (herkes çağırabilir; keeper ilk dener)                             | Ke / H         | 1 işlem       | keeper `openMarket` işi                                                                                | `MarketOpened` olayı; havuz başlatıldı; `/economy` havuzu gösteriyor                                                                               |
| 10  | T+72 s …    | İlk buyback ve POL dilimleri (3 saatlik dilimde en çok bir parça)                                  | Ke             | ilk 3 saat    | keeper `buyback`, `addLiquidity`                                                                       | `BuybackExecuted` / `LiquidityAdded`; fiyat sapması korumada                                                                                       |
| 11  | T+1 hf      | İlk haftalık ekonomi raporu (canlı ↔ sim)                                                          | C              | 2 saat        | `sim/beta_report.py`                                                                                   | Metrikler sim bantları içinde                                                                                                                      |

**Yayın günü site geçişi** (yalnızca mainnet, adım 4 ile aynı gün): Cloudflare Pages kök dizini `site` → `apps/web` (`infra/RUNBOOK.md` §3, madde 4).

## Durdurma koşulları (provada da gerçek gibi)

- Adım 2'de `assertHandedOver` düşerse: deploy edilen hiçbir adres yayımlanmaz, yeniden deploy edilir.
- Adım 8'de checkpoint 6 saatten fazla gecikirse: keeper runbook'u (`03-keeper.md`).
- Adım 9'da `openMarket` iki kez geri dönerse: neden explorer'da okunur; kod değişikliği gerekiyorsa Market Open ertelenir ve X'te duyurulur (docs/05 §7.3).

## Prova kayıtları

### Prova 1: testnet 46630, Genesis 2026-10-11 22:00 UTC

İlk testnet dağıtımı. Deploy adımları önceden yapılmıştı. **Kontratlar iç denetim düzeltmelerinden ve ekonomi v1.1'den (fiyat çapalı hook) önceki sürüm; keeper ise güncel kod.** Market Open sonrası buyback ve POL adımlarında bu fark görülebilir, kayda o gözle bakılır. Keeper ilk iki gün sürekli çalışmadı; bu provadan çıkan ders bu oldu.

| #   | Adım               | Saat (UTC)                    | Not                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2   | Deploy + devir     | 2026-10-11                    | `deployments/46630.json`; başlangıç bloğu 133161524                                                                                                                                                                                                                                                                                  |
| 7   | Genesis            | 2026-10-11 22:00              |                                                                                                                                                                                                                                                                                                                                      |
| 8   | Saatlik checkpoint | 2026-10-13 08:00              | **Bulgu:** keeper çalışmıyordu. Checkpoint 9 saat gecikti, besleme bayatladı ve yakıt alımı kendiliğinden durdu (tasarım gereği). 2026-10-13 11:44'te besleme yenilendi; 12:00'den beri keeper sürekli çalışıyor (`poked`). **Ders:** keeper, Genesis'ten önce en az bir gün sürekli çalışıyor olmalı; adım 5'in kontrolüne eklendi. |
| 9   | Market Open        | 2026-10-14 22:00 (bekleniyor) |                                                                                                                                                                                                                                                                                                                                      |
| 10  | İlk buyback / POL  | (bekleniyor)                  | Beklenti: bu eski kontratlarda `anchorTick()` yok. Keeper'ın buyback/POL işleri her turda hata yazıp atlar, servis çalışmaya devam eder. Bu adım Prova 2'de (güncel kod) ölçülür. `openMarket` imzası değişmedi.                                                                                                                     |

**İlk beta ekonomi raporu (2026-10-13 19:30 UTC, 2. gün):** [docs/kanit/beta/2026-10-13-testnet-gun2.md](../kanit/beta/2026-10-13-testnet-gun2.md). Testnet verisi yerel indeksleyici ve API ile okundu; `sim/beta_report.py` ile hazırlandı.

- **Emisyon:** 0. ve 1. günde takvimle birebir uyuyor. 2. günde %10 eksik: keeper çalışmadığı saatlerde checkpoint kapanmadı (yukarıdaki bulgu).
- **Yakma ve SR28:** bandın altında. Bunun iki nedeni var:
  - Testnet'te iki hesap var, simülasyon ise kalabalık bir oyuncu nüfusu varsayıyor.
  - Market Open'dan önce buyback yakması yok.

  Bu bir ekonomi hatası değil, nüfus farkı. Season 0'da gerçek oyuncularla yeniden bakılır.

### Prova 2

Prova 1 kapandıktan sonra `redeploy.ps1` ile yeni bir dağıtım yapılır (K). Aynı tablo doldurulur.
