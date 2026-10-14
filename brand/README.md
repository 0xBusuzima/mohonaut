# Marka varlıkları (taslak, docs/05 §2.4–2.6, yön A "Casing Wordmark")

| Klasör | İçerik |
|---|---|
| `logo/` | Vektör logolar, yalnızca yollardan oluşur (font gerekmez): wordmark (turuncu, kömür zeminli, siyah, beyaz), kuyu ağzı işareti (`mohonaut-mark`), monogram (işaret + inen kuyu + derinlik çentikleri), yatay kilit |
| `social/` | Uygulama ikonu, maskable ikon, X avatarı (400×400), X banner'ı (1500×500), OG görseli (1200×630), olay kartları (1200×675: gecikme, bilinen sorun, durduruldu, mint sınırı, çözüldü; metinleri docs/05 §7.3 ile uyumlu) |
| `sprites/` | Gen-1 kule stil sayfası: 6 kule × çalışıyor/kapalı (`rig-sheet.png`), oyunun voxel kule portrelerinden (`apps/web/scripts/gen-voxel.mjs`, modeller `apps/web/src/game/voxel/models.ts`). Yeniden üretmek için: `cd apps/web && npm run build && node scripts/gen-rig-sheet.ts` |
| `devlog/`, `video/` | Oyun sahnesinden üretilen klipler ve teaser (repoda değil, büyük dosyalar): `apps/web/scripts/capture-scene.mjs`, `tools/brand/teaser.sh` |
| `png/` | Hepsinin PNG'leri (logolar 1x/2x); X'e ve basın kitine yüklenecek dosyalar. Foreman Mo karakter sayfası `foreman-mo-poses.png` (7 poz): `python tools/brand/gen_mo_sheet.py` |

**Kural:** Küçük boyutlarda (favicon, ikon, avatar) yalnızca halkalı işaret kullanılır; sapı ve çentikleri olan monogram 64 piksel altında anahtar gibi okunuyor.

**Yeniden üretme:**
```bash
sim/.venv/Scripts/python.exe tools/brand/gen_brand.py   # SVG (Big Shoulders ve Barlow'dan yollar)
cd apps/web && node scripts/gen-assets.mjs              # PNG + sitenin ikonları ve OG görseli
```
CI `--check` ile SVG'lerin üreticiyle aynı olduğunu denetler.

Lisanslar: `docs/legal/ASSET_LISANSLARI.md`. Son sürüm, kurucunun bu taslağı Inkscape'te elle yeniden çizmesiyle kesinleşir (docs/05 §2.8).
