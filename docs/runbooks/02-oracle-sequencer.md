# 2. Oracle bayat / sequencer sorunu (S2)

**Tetikleyici:**

- ETH/USD fiyatı `OracleStaleness` süresinden (25–30 saat, varsayılan 26 saat) eskiyse,
- ya da sequencer beslemesi bağlıysa ve zincir kesintiden yeni çıktıysa (`SEQUENCER_GRACE` = 1 saat),

yakıt alımı **kendiliğinden** durur (`OracleStale` / sequencer hatası). Başka hiçbir şey etkilenmez: çalışan kuleler kazmaya devam eder, tanklar normal hızda boşalır.

## Adımlar

1. **Doğrula.**
   - `/ops` → *Health* ekranına ve beslemenin son güncelleme zamanına bak.
   - Testnet'te besleme `ManualEthUsdFeed`'dir ve keeper'ın `feed` işi bunu tazeler. Keeper metriklerinde `task="feed"` çıktısını kontrol et.
2. **Bildir.** docs/05 §7.3 **Oracle bayatlığı (S2)** şablonu + /status. Ek bir eylem gerekmez; besleme güncellenince yakıt alımı kendiliğinden açılır.
3. **Testnet'te keeper sorunluysa.**
   - `ssh ops@<sunucu>` → `docker compose -p mohonaut logs --tail 200 keeper`.
   - Keeper cüzdanında ETH bakiyesi var mı? (`/ops` → *Health* → "top up" uyarısı.)
   - Beslemeyi elle tazelemek için: `cast send <EthUsdFeed> "set(int256)" <fiyat×1e8> --account keeper`. Parolayı kurucu kendisi girer.
4. **Mainnet'te Chainlink beslemesi saatlerce durduysa.**
   - Bu bir dış bağımlılık sorunudur; iletişim dışında yapılacak bir şey yoktur.
   - Kesinti sürerse eşiği yükseltmek de 96 saatlik timelock'tan geçer (`OracleStaleness` üst sınırı 30 saat).
   - Başka bir beslemeye geçmek kontrat değişikliği gerektirir (docs/02 §5.1).

## Ne yapılmaz

- Sabit veya elle girilmiş bir fiyatla "geçici" çözüm yapılmaz. Mainnet'te fiyat yalnızca beslemeden okunur.
