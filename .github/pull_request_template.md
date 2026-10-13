## What changes

<!-- One paragraph. Link the roadmap step (docs/06) this implements. -->

## Test evidence

- [ ] `forge test` / `npx turbo run test` / `python -m unittest` output pasted or linked
- [ ] New behaviour has tests (unit / fuzz / invariant as relevant)
- [ ] Coverage of `contracts/src` still ≥ 95% (lines and branches)

## Security impact

- [ ] Touches minting, accounting, roles, timelock, pause or ETH flows? If yes, explain the risk and which invariant (docs/04 §2) covers it
- [ ] No new admin power, unbounded loop, AMM-price dependency or randomness
- [ ] Economy parameters unchanged, or docs/02 + sim + vectors updated in this PR

## Public copy

- [ ] No banned wording (docs/05 §6) and no competitor names
