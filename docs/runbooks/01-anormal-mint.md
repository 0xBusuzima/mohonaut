# 1. Anormal mint / muhasebe şüphesi (S1)

**Tetikleyici:** Telegram'da `mint-above-emission` uyarısı (kritik; basılan toplam, kapanmış saatlerin emisyonunu aşıyor; ADR-014), rol veya yükseltme olayı, 50K'yı aşan beklenmedik bir mint/transfer, ya da oyuncudan gelen güvenilir bir rapor.

## Hedef süreler

| Adım | Hedef |
|---|---|
| Uyarı → pause imzası | ≤ 15 dk |
| İlk herkese açık bildirim | ≤ 15 dk |
| Güncellemeler | 60 dk'da bir |

## Adımlar

1. **Doğrula (≤ 5 dk).**
   - `/ops` → *Health* ve *Economy* ekranlarına bak (son saat emisyonu ve yakımlar).
   - Explorer'da son `Transfer(0x0 → …)` ve `Accrued` / `Refined` olaylarını incele.
   - Uyarı sahte görünse bile **pause'a karar vermek doğrulamadan ucuzdur**: pause oyuncunun varlığını almaz ve 72 saatte kendiliğinden biter.
2. **Pause.**
   - `/ops` → *Emergency* → **Prepare Guardian pause file**.
   - [app.safe.global](https://app.safe.global/) → Guardian Safe → *Apps* → *Transaction Builder* → dosyayı sürükle → imzala ve yürüt.
   - Sonuç: yakıt alımı, makine işlemleri, rafine ve `openMarket` 72 saat durur. Token transferleri ve havuz çalışmaya devam eder (tokende pause yoktur).
   - Guardian bu yetkiyi 7 günde yalnızca bir kez kullanabilir; ikinci bir pause gerekirse Params Timelock'tan `extendPause` (en fazla 30 gün) planla.
3. **Bildir (≤ 15 dk).**
   - docs/05 §7.3 **Exploit / pause (S1)** şablonunu kullan.
   - Aynı metni `/ops` → *Announcements*'tan *Maintenance* türünde yayınla.
   - "Hiçbir 'refund' veya 'migration' linkine tıklamayın" satırı şablondan çıkarılmaz.
4. **Tespit et.**
   - Hangi fonksiyon, hangi hesap, ne kadar MOHN basıldı?
   - İndeksleyici veritabanında `events` tablosunu ilgili blok aralığıyla sorgula.
   - Kontrat testini **önce kırmızı** yaz: olayı yeniden üreten bir Foundry testi.
5. **Düzelt.**
   - Hatanın kaynağı parametreyse: `/ops` → *Parameters* → Params Timelock (96 saat). Bu süre pause'un 72 saatini aştığı için **önce `extendPause` teklif et**.
   - Hatanın kaynağı kodsa: yükseltme Upgrade Timelock'tan geçer (7 gün). Bu durumda `extendPause` ile pause'u 30 güne kadar uzat.
   - Düzeltme PR'ı: test + düzeltme + yeni invariant (docs/04 §2), CI yeşil.
6. **Kapanış.**
   - `unpause` yalnızca düzeltme yürütüldükten sonra yapılır; bu da Params Timelock işlemidir. Pause kendiliğinden de bitebilir.
   - 72 saat içinde post-mortem yaz ve `/security` sayfasındaki olay geçmişine ekle.

## Ne yapılmaz

- Oyuncu bakiyelerini "düzeltme" vaadi verilmez. Bunu yapacak bir yetki zaten yoktur.
- Pause süresi tahmini bir rakam olarak söylenmez. Kontratın verdiği bitiş zamanı (`pausedUntil`) yazılır.
