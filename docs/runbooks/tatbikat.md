# Tatbikat: pause → bildirim → unpause (docs/04 §6.2, Kapı 6)

Yılda en az bir kez ve ilk kez **mainnet'ten önce** testnet'te yapılır. Amaç, gerçek bir olayda 15 dakikalık pause hedefinin tutulabildiğini ölçmektir.

## Otomatik prova (her PR'da)

`services/keeper/test/e2e/anvil.test.ts` → *"pause drill"* testi şu adımları anvil üzerinde, gerçek deploy script'iyle yapar:

1. Guardian `pause()` çağırır ve oyuncu işlemi `ProtocolPaused` ile geri döner.
2. İndeksleyici `Paused` olayını kritik uyarı olarak kaydeder.
3. Params Timelock'tan `unpause` teklif edilir; 96 saat sonra yürütülür.
4. Oyuncu işlemi yeniden çalışır.

Bu test, adımların ve dosyaların doğru olduğunu kanıtlar. **İnsan süresini** ölçmez.

## Testnet tatbikatı (kurucu)

Hazırlık: Guardian Safe imzacılarının cüzdanları erişilebilir olmalı, `/ops` açık olmalı, X taslağı hazır olmalı.

Kronometreyi başlat ve sırayla ilerle. Her adımda saati yaz.

| Adım | Ne | Saat (UTC) |
|---|---|---|
| T0 | "Uyarı geldi" kabulü (kurgu) | |
| T1 | `/ops` → *Emergency* → pause dosyası hazır | |
| T2 | Guardian Safe imzası + yürütme onaylandı | |
| T3 | `/ops` → *Emergency* "Paused" gösteriyor; Telegram'a `Paused` uyarısı düştü | |
| T4 | Bakım bandı yayında (`/ops` → *Announcements*) ve X taslağı hazır (testnet: yayınlanmaz ya da "drill" etiketiyle yayınlanır) | |
| T5 | `/ops` → *Parameters* değil, *Timelock* yolu: `unpause` teklifi schedule edildi (Safe dosyası el ile; bkz. aşağı) | |
| T6 | 96 saat sonra `unpause` yürütüldü; oyuncu işlemi çalışıyor | |

**Başarı ölçütü:** T2 − T0 ≤ 15 dk ve T4 − T0 ≤ 15 dk. Sonuç tablosu aşağıya eklenir.

`unpause` için Safe dosyası: `/ops` şu an yalnızca `setParam` üretiyor. `unpause` çağrısını Transaction Builder'da elle gir: Params Timelock → `schedule(target=MiningCore, value=0, data=0x3f4ba83a, predecessor=0x0…0, salt=<rastgele>, delay=345600)`. Burada `0x3f4ba83a`, `unpause()` seçicisidir. Ya da 72 saatin dolmasını bekle; pause kendiliğinden biter.

## Sonuçlar

| Tarih | Ağ | T2 − T0 | T4 − T0 | Not |
|---|---|---|---|---|
| | | | | |
