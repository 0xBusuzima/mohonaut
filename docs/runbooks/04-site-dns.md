# 4. Site / DNS ele geçirildi (S1)

**Belirti:** mohonaut.com sahte bir sayfa gösteriyor, cüzdan uyarısı (BLOCK) çıkıyor, DNS kayıtları değişmiş ya da Cloudflare hesabında tanınmayan bir oturum var.

Kontratlar bundan etkilenmez: adresleri sabittir ve `/contracts` ile X'teki sabitlenmiş gönderide yayınlanmıştır. Asıl risk, oyuncuların sahte siteden kötü bir imza vermesidir.

## Adımlar

1. **Uyar (≤ 15 dk, siteyi düzeltmeden önce).** X'te yayınla:

   ```
   mohonaut.com is compromised right now. Do not connect your wallet or sign anything on it until we confirm it is fixed. The contracts are not affected; their addresses are in our pinned post. We will never ask you to "migrate", "claim" or "revoke".
   ```

   Gönderiyi sabitle. Yanıtlarda link paylaşma.
2. **Hesapları kilitle.**
   - Cloudflare: parolayı değiştir, tüm oturumları kapat, API token'larını iptal et, 2FA'yı yeniden kur, *Audit log*'u incele.
   - Alan adı kayıt firmasında (Spaceship): parola + 2FA, transfer kilidi açık mı? DNSSEC açık mı?
   - GitHub: oturumları ve deploy anahtarlarını kontrol et. Pages, `main` dalından derlenir.
3. **Siteyi geri al.**
   - Cloudflare Pages → *Deployments* → son bilinen iyi deploy → **Rollback**.
   - DNS kayıtlarını `infra/RUNBOOK.md §3` ile karşılaştır.
4. **Doğrula.**
   - Sayfadaki CSP meta etiketi ve script hash'leri bizim derlememizle aynı mı? Bunu `out/` ile karşılaştır.
   - `/contracts` sayfasındaki adresler değişmemiş olmalı.
5. **Cüzdan uyarı listeleri.** Yanlış BLOCK kaydı varsa MetaMask ve Blockaid'e başvur (docs/05 §3 ve docs/09 §6'daki şablonlar).
6. **Bildir ve kapat.**
   - "Fixed" gönderisi at: neyin değiştiğini ve oyuncuların ne yapması gerektiğini yaz. Sahte sitede imza verenlere [revoke.cash](https://revoke.cash/) yönlendirmesi yapılır. Bu link yalnızca resmî hesaptan paylaşılır; bizim akışımızda token onayı hiç yoktur.
   - Post-mortem yaz.
