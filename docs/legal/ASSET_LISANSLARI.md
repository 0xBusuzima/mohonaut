# Varlık lisansları

Projede kullanılan her görsel, font, ses ve aracın kaynağı ve lisansı (docs/05 §2.6–2.8, docs/08). Yeni bir varlık eklenince bu tabloya bir satır eklenir. Görsellerin hepsi bizim tasarımımızdır; dışarıdan gelen tek şey açık lisanslı fontlardır.

## Fontlar

| Font | Nerede | Lisans | Kaynak |
|---|---|---|---|
| Big Shoulders Display | Logo harfleri (yola çevrilmiş), site başlıkları, paylaşım kartları | SIL Open Font License 1.1 | Google Fonts; npm `@fontsource/big-shoulders-display`, `@expo-google-fonts/big-shoulders-display` |
| Barlow, Barlow Condensed | Arayüz, banner ve OG alt yazıları (yola çevrilmiş) | SIL OFL 1.1 | Google Fonts; `@fontsource/barlow*`, `@expo-google-fonts/barlow` |
| Saira Stencil One | Kısa şablon etiketleri | SIL OFL 1.1 | Google Fonts; `@fontsource/saira-stencil-one` |
| JetBrains Mono | Sayılar, kuyu logu, göstergeler | SIL OFL 1.1 | Google Fonts; `@fontsource/jetbrains-mono`, `@expo-google-fonts/jetbrains-mono` |
| Inter | API paylaşım kartları | SIL OFL 1.1 | `services/api` bağımlılığı |

OFL, fontların logo ve görsellerde ticari kullanımına izin verir. Harfleri yola çevirmek de serbesttir; tek koşul font dosyasının kendisinin ayrı olarak satılmamasıdır.

## Marka görselleri

| Varlık | Nasıl üretildi | Araç ve lisans | Kaynak dosya |
|---|---|---|---|
| Logo yönü A: wordmark, kuyu ağzı işareti, monogram, kilit (lockup); tek renk varyantları (2026-10-12, taslak) | Kodla çizilmiş vektör: halkalar ve cetvel geometrik şekiller, harfler Big Shoulders Display Black'ten yola çevrildi. Yapay zekâ görsel aracı **kullanılmadı** | `tools/brand/gen_brand.py` (fontTools, MIT lisansı) | `brand/logo/*.svg` |
| Gen-1 kule çizimleri (6 kule × 2 durum) | Kodla tanımlı voxel modeller, kendi derleme anı işleyicimizle (`apps/web/src/game/voxel/`); piksel sahne için kodla çizilmiş basit şekiller (`apps/web/src/game/rigs.ts`). Yapay zekâ görsel aracı ve dış model kullanılmadı | `apps/web/src/game/voxel/models.ts`, `apps/web/scripts/gen-voxel.mjs`, `apps/web/scripts/gen-rig-sheet.ts` | `brand/sprites/rig-sheet.png`, `apps/web/public/rigs/` |
| Uygulama ikonları, favicon, OG görseli, X avatarı ve banner'ı | Aynı vektörlerden PNG'ye çevrildi | `apps/web/scripts/gen-assets.mjs` (resvg-js, MPL-2.0) | `brand/social/*.svg` → `brand/png/`, `apps/web/public/`, `apps/web/src/app/` |

**Durum:** Bunlar **taslak**. docs/05 §2.8'e göre son logo, kurucunun bu taslağı Inkscape'te elle yeniden çizmesiyle (insan katkısı) ya da gelirle tutulacak bir tasarımcıyla kesinleşir; marka tescili de o sürümle yapılır.

## Kural

**Özgünlük kuralı (kurucu kararı, 2026-10-12):** Bütün görseller (logo, maskot, kuleler, saha, ikonlar, paylaşım kartları) **bizim tarafımızdan tasarlanır ve özgündür**. Başkasının logosu, görseli, sprite'ı ya da ikon paketi (CC0 ve "ücretsiz" olanlar dahil, ör. Kenney.nl) kullanılmaz. Yapay zekâ görsel araçları en fazla kendi aramızda fikir keşfi için kullanılabilir; hiçbir AI çıktısı ürüne, siteye ya da marka dosyalarına girmez. Fontlar dışarıdan gelir (yalnızca SIL OFL lisanslı yazı tipleri) ve hangi yerde kullanıldıkları `docs/legal/ASSET_LISANSLARI.md`'ye yazılır.
