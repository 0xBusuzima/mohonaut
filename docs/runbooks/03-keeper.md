# 3. Keeper anahtarı ele geçirildi (S1)

**Keeper ne yapabilir?** Yalnızca şunları yapabilir:

- `poke`, `openMarket`, `finalizeRefine` (bunları zaten herkes çağırabilir),
- `BuybackBurner` ve `LiquidityManager` üzerindeki `KEEPER_ROLE` işleri,
- testnet'te elle fiyat beslemesi.

Çalınan bir anahtar en kötü durumda **sınırlar içinde kötü zamanlı alım veya likidite ekleme** yapabilir:

- günlük tutar havuzun ETH'sinin bir kesriyle sınırlıdır,
- kayma ve sapma korumaları vardır (`MAX_PRICE_DEVIATION_BPS`).

Oyuncu varlıklarına erişemez. Hedef, zararı küçük tutmak ve rolü değiştirmektir.

## Adımlar

1. **Keeper'ı durdur.**
   - `ssh ops@<sunucu>` → `docker compose -p mohonaut stop keeper`.
   - Sızıntı sunucudan geldiyse: sunucuyu ağdan kes, disk görüntüsünü al ve `infra/RUNBOOK.md` ile **yeni** bir sunucu kur.
2. **Kalan ETH'yi güvenli adrese al.** Kendi bilgisayarında, eski keystore'la:
   ```bash
   cast send <güvenli adres> --value <bakiye - gas> --account keeper
   ```
   Saldırgan da hızlı davranabilir; bakiye zaten küçük tutulur.
3. **Yeni keeper anahtarı.**
   - Komut: `cast wallet import keeper2 --interactive`.
   - Parolayı kurucu girer. Yeni adresi `deployments/<ağ>.json`'a, `Keeper` alanı olarak yaz.
4. **Rolü değiştir (Params Timelock, 96 saat).** Tek teklifte dört çağrı:
   - `BuybackBurner.revokeRole(KEEPER_ROLE, eski)`,
   - `BuybackBurner.grantRole(KEEPER_ROLE, yeni)`,
   - aynı ikisi `LiquidityManager` için.

   Testnet'te `ManualEthUsdFeed`'in sahibi değişmez (`immutable`): çalınan keeper testnet'te fiyatı bozabilir. Değeri olmayan testnet için bu kabul edilen bir risktir; çözümü yeniden deploy'dur. Mainnet'te fiyat Chainlink'ten gelir ve keeper'ın fiyat üzerinde hiçbir yetkisi yoktur.

   ```bash
   KR=$(cast keccak "KEEPER_ROLE")
   cast calldata "revokeRole(bytes32,address)" $KR <eski>   # data 1 ve 3
   cast calldata "grantRole(bytes32,address)"  $KR <yeni>   # data 2 ve 4
   # Params Timelock scheduleBatch(targets[], values[], payloads[], predecessor, salt, delay):
   # Safe Transaction Builder'da "scheduleBatch" ile girilir; 96 saat sonra executeBatch.
   ```

   Bu dört çağrıyı `/ops` henüz tek dosyada üretmiyor (yalnızca `setParam` üretiyor).
5. **Bildir.**
   - docs/05 §7.3 **Hata** şablonu, uyarlanmış biçimde: buyback ve likidite işleri geçici olarak durdu; oyun ve tahakkuk etkilenmiyor.
   - Şeffaflık için eski keeper adresi yazılır.
6. **Keeper'ı yeniden başlat.**
   - Yeni keystore'u sunucuda `/etc/mohonaut/secrets/keeper_keystore` olarak yerleştir.
   - Rol değişikliği yürütüldükten sonra `sudo infra/stack/deploy.sh <ağ>`.
7. **Post-mortem.** Anahtar nasıl sızdı? Sunucu erişimi, keystore parolası ve yedekleri gözden geçir.
