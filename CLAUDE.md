# CLAUDE.md — Proje kuralları (Mohonaut / $MOHN)

Robinhood Chain (chain ID 4663 / testnet 46630) üzerinde, adil madencilik lansmanlı, şeffaf bir idle mining oyunu. Kurucu: @onderyazici. Dil: kullanıcıyla ve dokümanlarda **Türkçe**; kod, yorumlar, commit mesajları, oyun içi metinler ve X gönderi taslakları **İngilizce**.

## Doğruluk kaynakları (önce bunları oku)
- `docs/02_TOKENOMI_VE_OYUN_MATEMATIGI.md` — ekonominin **tek** kaynağı. Parametre değişikliği sırası: docs/02 → `sim/params.json` → sim testleri + senaryolar → `sim/vectors` → kontrat testleri.
- `docs/03_TEKNIK_MIMARI.md` — kontrat ve servis mimarisi, roller, ADR'ler.
- `docs/04_GUVENLIK_TEST_DENETIM.md` — tehdit modeli, invariant kataloğu, test ve CI kuralları.
- `docs/06_YOL_HARITASI_VE_PROMPTLAR.md` — hangi fazdayız, sıradaki adım ne.
- `reports/Robinhood Chain mining oyunu araştırması.md` — araştırma ve "yapmamız / asla yapmamamız gerekenler".

## Kırmızı çizgiler (asla)
- Tokende owner, ikinci minter, transfer vergisi, blacklist, pause, yükseltilebilirlik.
- Mint/ödül miktarını AMM spot fiyatından hesaplamak; `prevrandao`/`blockhash`/`timestamp` ile rastgelelik; tahakkukta `block.number`.
- Ekonomide rastgelelik (gacha, paket, şanslı upgrade, çökme riskli overclock).
- Makine başına sabit verim; mevcut makine istatistiklerini değiştirmek (geriye dönük nerf).
- Sınırsız döngü, push ile ETH ödemesi, sunucuda ödül imzalayan anahtar.
- Metinlerde ROI / APY / APR / passive income / guaranteed / "X days payback" / fiyat hedefi / listeleme vaadi; Türkçe "token al" çağrısı.
- Herkese açık hiçbir içerikte (site, oyun içi metin, X gönderisi, herkese açık dokümanlar, hibe başvuruları) rakip proje adları geçmez: [a competitor] / [a competitor] / [a competitor], [a competitor] / [a competitor] ve diğerleri. Rakip karşılaştırması yalnızca iç dokümanlarda (`reports/`, `research_notes/`, `docs/05 §9`). Oyun mekaniği, görselleri ve isimlendirmesi de bu projelere benzememeli.
- Test yazılmadan özellik "bitti" demek; CI kırmızıyken birleştirmek; ölü kod bırakmak.
- Gerçek özel anahtarları, `.env` dosyalarını, seed ifadelerini repoya koymak.

## Kontrat kuralları
- `.sol` dosyalarında **ASCII dışı karakter yok** (yorumlar dahil: ℓ, ×, —, § yazma). Solc bayt, Slither karakter ofseti sayıyor; satır içi istisnalar kayıyor.
- `dynamic_test_linking = false` kalmalı (açıkken Foundry testlerde `new X()`'i `vm.deployCode`'a çeviriyor, Halmos çalışmıyor).
- Satır içi istisna gerekiyorsa gerekçe yorumu şart; forge-lint `disable-next-line` ifadenin hemen üstünde, Slither için `slither-disable-start/end` bloğu.
- Foundry; OpenZeppelin 5.x; Solady matematik. Tüm bölmeler protokol lehine aşağı yuvarlanır.
- Her durum değiştiren fonksiyon önce global checkpoint, sonra hesap settle çağırır.
- Her `set*` fonksiyonu: yalnızca Timelock + kodlanmış sınır + hız limiti + olay.
- Her yeni invariant `docs/04 §2`'ye eklenir ve hem Foundry invariant hem Medusa/Echidna property olarak yazılır.
- Kapsam ≥ %95 (core), mutasyon öldürme ≥ %90.

## Sıfır bütçe kuralı
- Dış bütçe yok. Her araç seçiminde önce ücretsiz/self-host seçeneği öner; ücretli bir şey yalnızca oyunun ops geliriyle ve `docs/08 §3` sırasıyla açılır.
- Lansman öncesi ücretli denetim yok → korumalı lansman sınırları (`docs/04 §5.2`) pazarlık konusu değil; "Unaudited" bandı bağımsız denetime kadar kalır.

## Çalışma şekli
- Her iş ayrı branch; adım sonunda özet + test çıktısı + açık riskler; commit/PR kullanıcı onayıyla.
- Ücretli harici araç (ör. görsel üretim kredisi) kullanmadan önce maliyeti söyle ve onay al.

## Komutlar (Faz 1, 2026-10-11)
Windows'ta Foundry PATH'te değilse: `export PATH="$PATH:/c/Users/yazic/.foundry/bin"` (Git Bash).
npm komutlarını Git Bash yerine `cmd.exe /c "..."` veya PowerShell ile çalıştır (Git Bash'te npm/pnpm stdin yüzünden takılabiliyor). pnpm 12 bu makinede takılıyor; paket yöneticisi **npm workspaces**.

| İş | Komut (kökten) |
|---|---|
| TS: derle + tip + lint + test | `npx turbo run build typecheck lint test` |
| Ölü kod (TS) | `npx knip` |
| Biçim | `npx prettier --check .` (düzelt: `--write`) |
| Kontratlar: biçim / lint / derle / test | `cd contracts && forge fmt --check && forge lint && forge build --sizes && forge test` |
| Kontrat kapsam kapısı (%95) | `cd contracts && forge coverage --report lcov --report-file lcov.info --no-match-coverage "(test|script)/" && python ../tools/check_coverage.py lcov.info` |
| Derin fuzz | `cd contracts && FOUNDRY_PROFILE=deep forge test` |
| Simülatör testleri | `cd sim && .venv\Scripts\python.exe -m unittest discover -s tests -t .` |
| Simülatör lint / ölü kod | `cd sim && .venv\Scripts\python.exe -m ruff check . && .venv\Scripts\python.exe -m vulture engine tests run_scenarios.py make_vectors.py --min-confidence 80` |
| Vektörleri yeniden üret | `cd sim && .venv\Scripts\python.exe make_vectors.py` (çıktı değişmemeli) |
| Slither (yerel, WSL) | `wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/yazic/Desktop/crypto-game-project/contracts && forge clean && ~/halmos-venv/bin/slither . --config-file slither.config.json --fail-medium"` |
| Halmos (yerel, WSL) | `wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/yazic/Desktop/crypto-game-project/contracts && ~/halmos-venv/bin/halmos --function prove_"` |
| Aderyn (yerel, WSL; Windows sürümü yok) | `wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/yazic/Desktop/crypto-game-project/contracts && ~/bin/aderyn . --output /tmp/ad.md; grep '^## H-' /tmp/ad.md"` (çıktı boş olmalı) |
| Medusa / Echidna | CI'da (Linux) |

Sürümler: Node 24, npm 11, TypeScript 5.9, Foundry 1.8.5, solc 0.8.30 (`evm_version = prague`), OpenZeppelin 5.7.0, Solady 0.1.26, forge-std 1.17.0 (git submodule, sabit etiket).
