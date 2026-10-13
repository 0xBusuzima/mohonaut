# 5. Zincir kesintisi (S2)

**Belirti:** Robinhood Chain blok üretmiyor ya da RPC'ler yanıt vermiyor.

Bu durumda:

- `/ops` → *Health*: "behind" sütunu büyüyor ya da "RPC unknown" görünüyor,
- keeper `error` sonuçları üretiyor,
- Telegram'da servis uyarıları geliyor (Prometheus).

## Ne olur?

- Tahakkuk saate bağlıdır (`block.timestamp`, docs/02). Zincir döndüğünde ilk `poke`, kaçan saatleri **kendiliğinden** kapatır. Bir çağrıda en fazla `MAX_HOURS_PER_POKE` saat kapanır; keeper birkaç turda yetişir.
- Sequencer beslemesi bağlıysa, kesintiden sonraki 1 saat yakıt alımı kapalı kalır (`SEQUENCER_GRACE`).
- Tanklar kesinti süresince "yanmış" sayılır. Bu tasarım gereğidir: tahakkuk ve yakıt aynı saatleri kullanır.

## Adımlar

1. **Doğrula.** Bizim RPC'miz mi, zincir mi? Explorer'a ve public RPC'ye bak. Sorun yalnızca bizim RPC sağlayıcımızdaysa indeksleyici ve keeper için yedek RPC'ye geç (`RPC_URL`, şifreli env → `deploy.sh`).
2. **Bildir.**
   ```
   Robinhood Chain is not producing blocks since [time] UTC (not a Mohonaut issue). Nothing to do on your side: when the chain resumes, the missed hours close automatically and accruals catch up. Live status: mohonaut.com/status
   ```
3. **Zincir dönünce.** Keeper'ın `poke` çıktılarını izle (`poked N`), `/ops` → *Health*'te gecikmenin sıfıra indiğini ve son saat kapanışının güncellendiğini doğrula.
4. **Kapat.** Kesinti 6 saati aştıysa kısa bir not yaz: süre ve etkisi.
