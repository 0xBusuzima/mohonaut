# Marka varlıkları (taslak, docs/05 §2.4–2.6, yön A "Casing Wordmark")

| Klasör | İçerik |
|---|---|
| `logo/` | Vektör logolar, yalnızca yollardan oluşur (font gerekmez): wordmark (turuncu, kömür zeminli, siyah, beyaz), kuyu ağzı işareti (`mohonaut-mark`), monogram (işaret + inen kuyu + derinlik çentikleri), yatay kilit |
| `social/` | Uygulama ikonu, maskable ikon, X avatarı (400×400), X banner'ı (1500×500), OG görseli (1200×630) |
| `sprites/` | Gen-1 kule stil sayfası: 6 kule × çalışıyor/kapalı (`rig-sheet.svg/png`). Çizimler `apps/web/src/game/rigs.ts`'ten gelir; oyun sahnesi de aynı çizimi kullanır. Yeniden üretmek için: `cd apps/web && node scripts/gen-rig-sheet.ts` |
| `png/` | Hepsinin PNG'leri (logolar 1x/2x); X'e ve basın kitine yüklenecek dosyalar |

**Kural:** Küçük boyutlarda (favicon, ikon, avatar) yalnızca halkalı işaret kullanılır; sapı ve çentikleri olan monogram 64 piksel altında anahtar gibi okunuyor.

**Yeniden üretme:**
```bash
sim/.venv/Scripts/python.exe tools/brand/gen_brand.py   # SVG (Big Shoulders ve Barlow'dan yollar)
cd apps/web && node scripts/gen-assets.mjs              # PNG + sitenin ikonları ve OG görseli
```
CI `--check` ile SVG'lerin üreticiyle aynı olduğunu denetler.

Lisanslar: `docs/legal/ASSET_LISANSLARI.md`. Son sürüm, kurucunun bu taslağı Inkscape'te elle yeniden çizmesiyle kesinleşir (docs/05 §2.8).
