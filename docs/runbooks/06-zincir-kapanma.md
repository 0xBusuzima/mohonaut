# 6. Zincirin kapanma duyurusu (S1, yavaş gelişen)

**Tetikleyici:** Robinhood Chain'in kapanacağının ya da artık uygulama barındırmayacağının resmî olarak duyurulması.

Bu tür duyurular genellikle haftalar öncesinden gelir; panik yerine **planlı göç** yapılır.

## İlkeler

- Hiçbir oyuncunun kazancı göçte azalmaz. Göç, zincir üstü durumun **herkesin doğrulayabileceği** bir anlık görüntüsüdür.
- Anlık görüntü **iki bağımsız kaynaktan** alınır: kendi indeksleyicimiz ve doğrudan zincir okumaları. İkisi uyuşmazsa zincir esas alınır.
- Yeni zincirdeki devam, Merkle kökü ile yapılır: her hesap kendi kanıtıyla talep eder. Kimse başkası adına işlem yapmaz.

## Adımlar

1. **Bildir.**
   ```
   Robinhood Chain announced [what] on [date]. Your drill site, rigs and $MOHN will be carried over. Here is the plan and the dates: [link]. Nothing to do today. Ignore any "migration" link that is not on mohonaut.com and in our pinned post.
   ```
2. **Dondur (göç tarihinden önce).**
   - Params Timelock ile `extendPause` en fazla 30 gün sürebilir. Göç tarihinden en az 96 saat önce teklif et.
   - Pause yeni alımları durdurur; tahakkuk sürer, rafine ve makine işlemleri durur.
3. **Anlık görüntü (belirli bir blokta).**
   - Her hesap için: `siteOf` (seviye, DP, tank), `rigsOf` (tür başına sahip/aktif), `pendingOf`, açık rafine kuyruğu, MOHN bakiyesi.
   - Kaynaklar: zincir okumaları ve indeksleyicinin `accounts`, `rigs`, `refine_requests` ve `balances` tabloları.
   - Uyuşmazlık raporu sıfır olmalıdır.
4. **Merkle ağacı.**
   - Yaprak: `keccak(hesap, seviye, DP, makineler, bekleyen MOHN, rafine kuyruğu, bakiye)`.
   - Ağacı ve kökü yayınla: repoda, sitede ve IPFS'te. Kök, yeni kontratın kurulum parametresidir.
5. **Yeni zincir.**
   - Aynı kontratlar ve aynı parametreler, yeni bir deploy olarak kurulur.
   - Talep fonksiyonu kanıt ister ve her yaprak bir kez kullanılabilir.
   - Bu kontrat da aynı test, fuzz ve inceleme sürecinden geçer (docs/04).
6. **Kapanış.**
   - Eski zincirdeki havuz likiditesi: protokolün sahip olduğu LP için ayrı bir plan gerekir (timelock'lu çekim mümkün mü? `LiquidityManager` sınırları).
   - Hukuki görüş gerekir: göç bir "yeni token dağıtımı" sayılabilir mi?
