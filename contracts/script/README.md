# Deploying Mohonaut

`Deploy.s.sol` deploys, wires and hands over the whole system in one broadcast, then asserts that
the deployer holds no role on any contract. Addresses are written to `deployments/<chainId>.json`.

| Step | What happens |
|---|---|
| deploy | RevenueRouter · ETH/USD feed (testnet: `ManualEthUsdFeed`, refused on mainnet) · MiningCore implementation · MohnToken with `minter` = the predicted proxy (asserted) · MiningCore UUPS proxy · LiquidityManager via CREATE2 at an address whose low 14 bits are `0x2000` (Uniswap v4 `beforeInitialize` hook) · BuybackBurner · 96 h and 7-day `TimelockController` (proposer: ops Safe, executor: anyone, no admin) |
| configure | Router buckets (core deposits; LM/BB fee deposits; LM POL; BB buyback; ops Safe ops) · keeper on LM and BB · Guardian on MiningCore · one-time `wireLiquidityManager` |
| hand over | MiningCore admin + catalog → 96 h Timelock, upgrader → 7-day Timelock, router/LM/BB admin → 96 h Timelock; the deployer renounces everything; `assertHandedOver` checks it |

## Local (anvil)

Robinhood Chain accepts 96 KB contracts (ADR-011), so anvil must run with the same limit, and the
Uniswap v4 PoolManager must exist at its canonical address:

```bash
anvil --code-size-limit 98304
```

Put the PoolManager runtime code (`test/fixtures/PoolManager.runtime.hex`, the chain's code) at
`0x8366a39CC670B4001A1121B8F6a443A643e40951` with `anvil_setCode`, export the variables of
`.env.example` (anvil accounts are fine), then:

```bash
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

## Testnet (46630) and mainnet (4663)

```bash
cast wallet import deployer --interactive
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast --account deployer --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
```

Mainnet uses `https://rpc.mainnet.chain.robinhood.com` and
`https://robinhoodchain.blockscout.com/api/`, a hardware wallet (`--ledger`), real Safes, and the
Chainlink feed in `ETH_USD_FEED`. The mainnet explorer API sits behind a Cloudflare challenge from
some networks; if `--verify` fails, verify later with `forge verify-contract` (docs/ZINCIR_DOGRULAMA.md §7).

After deploying, the 96 h Timelock is the only way to change anything: the ops Safe proposes
(`schedule`), everyone can see the call for 96 hours, then anyone executes it.
