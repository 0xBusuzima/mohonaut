# Olay runbook'ları (docs/04 §6.2, Faz 6.2)

Her runbook dört soruyu yanıtlar: **kim**, **hangi araçla**, **hangi Safe işlemiyle** ve **hangi iletişim şablonuyla**. İletişim şablonları İngilizce olup `docs/05 §7.3`'tedir.

| # | Senaryo | Ciddiyet | İlk adım | Runbook |
|---|---|---|---|---|
| 1 | Anormal mint / muhasebe şüphesi | S1 | Guardian `pause()` (hedef ≤ 15 dk) | [01-anormal-mint.md](01-anormal-mint.md) |
| 2 | Oracle bayat / sequencer sorunu | S2 | Kendiliğinden: yakıt alımı durur | [02-oracle-sequencer.md](02-oracle-sequencer.md) |
| 3 | Keeper anahtarı ele geçirildi | S1 | Keeper'ı durdur, rolü timelock ile değiştir | [03-keeper.md](03-keeper.md) |
| 4 | Site / DNS ele geçirildi | S1 | Cloudflare kilidi, X'ten uyarı | [04-site-dns.md](04-site-dns.md) |
| 5 | Zincir kesintisi | S2 | İletişim; tahakkuk kendiliğinden doğru | [05-zincir-kesintisi.md](05-zincir-kesintisi.md) |
| 6 | Zincirin kapanma duyurusu | S1 (yavaş) | Anlık görüntü + göç planı | [06-zincir-kapanma.md](06-zincir-kapanma.md) |
| — | Tatbikat (pause → bildirim → unpause) | — | Yılda en az bir kez, testnet'te | [tatbikat.md](tatbikat.md) |

## Roller ve araçlar

| Rol | Kim | Ne yapabilir | Araç |
|---|---|---|---|
| Guardian Safe | Kurucu (+ yedek imzacı) | Yalnızca `pause()`: 72 saat sürer, kendiliğinden biter, 7 günde en fazla bir kez | Safe → Transaction Builder → `/ops` *Emergency* sekmesindeki hazır `guardian-pause.json` |
| Ops Safe → Params Timelock (96 saat) | Kurucu | Parametre değiştirme, `extendPause` (≤ 30 gün), `unpause`, rol verme/alma, katalog | `/ops` *Parameters* / *Timelock* sekmeleri, Safe dosyaları; Safe yoksa `cast` |
| Ops Safe → Upgrade Timelock (7 gün) | Kurucu | Kontrat yükseltmesi | Safe + `forge script` (yükseltme runbook'u ayrıca yazılacak) |
| Operatör | Kurucu | Banner, destek, oyuncu işaretleme | `mohonaut.com/ops/` |
| Altyapı | Kurucu | Servisleri durdurma/başlatma, deploy | `ssh ops@<sunucu>`, `infra/RUNBOOK.md` |

**Hiç kimse** oyuncuların zincir üstü varlıklarına dokunamaz. Tokenda sahip, pause ve kara liste yoktur (docs/02 §0). Pause yalnızca oyuncu eylemlerini (yakıt alımı, makine işlemleri, rafine) durdurur; transferler ve havuz işlemleri bundan etkilenmez.

## Her olayda ortak adımlar

1. **Tespit et**: Telegram uyarısı, `/ops` *Health* ekranı ve explorer kayıtları. Tahminle hareket etme; olay kaydını şimdi aç: `docs/runbooks/olaylar/AAAA-AA-GG-kisa-ad.md`. Kayıtta zaman çizelgesi UTC olarak tutulur.
2. **Sınırla**: ilgili runbook'un ilk adımını uygula.
3. **Bildir**: docs/05 §7.3 şablonunu kullan. X'te paylaş, `/ops` → *Announcements*'tan bakım bandını aç ve /status'u güncelle. Kanallar resmî hesap + site; DM yok.
4. **Düzelt**: düzeltme her zaman herkese açık timelock'tan geçer (96 saat veya 7 gün).
5. **Kapat**: 72 saat içinde post-mortem yaz (ne oldu, etki, kök neden, neyi değiştiriyoruz). `/security` sayfasındaki olay geçmişine ekle.
