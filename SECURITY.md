# Security policy

Mohonaut's contracts are **unaudited** until an independent audit is funded from game revenue
(see `docs/04_GUVENLIK_TEST_DENETIM.md` §5). Guarded-launch limits apply until then.

## Reporting a vulnerability

- Email **security@mohonaut.com** with a description, impact and a proof of concept if possible.
- Please do not open public issues or post on social media before a fix is deployed.
- We acknowledge reports within 48 hours and keep you updated until resolution.

## Rewards

Rewards are paid in ETH from operations revenue and in MOHN from the treasury share. MOHN rewards
are paid through the standard refine queue and the treasury's daily withdrawal limit, so a large
reward may arrive over several days. Amounts are fixed; we state no value for MOHN.

| Severity | Examples | ETH | MOHN |
|---|---|---|---|
| Critical | Theft of players' ETH or MOHN; minting outside the caps; permanently frozen funds; getting around a role or the timelock | up to the whole fund, at most 1 ETH | 250,000 |
| High | Temporarily frozen funds; one player taking more than the guarded limits allow; draining buyback or protocol liquidity past the keeper limits | at most 0.25 ETH | 100,000 |
| Medium | Blocking another player's actions (not by volume); an oracle or sequencer guard that fails; the site proposing a wrong transaction | 0.05 ETH | 25,000 |
| Low | Rounding against the protocol; wrong event or read data | — | 10,000 |

Rules:
- A proof of concept is required: a Foundry test or steps that reproduce it on testnet.
- First valid report wins; duplicates are credited, not paid.
- Never exploit an issue on mainnet beyond what is needed to show it. Doing so voids the reward.
- Testnet findings that also affect the mainnet contracts qualify for this table.
- Out of scope: third-party services, social engineering, denial of service by volume, issues
  already listed in our public findings (contracts/audits).
- We pay to the address you give us. We never ask for seed phrases or private keys.
- Reporting in good faith under these rules: we will not take legal action against you.

## Testnet Season 0

Findings on testnet are welcome by the same e-mail. Valid ones are credited at
mohonaut.com/security (opt-in). An issue that would also affect the mainnet contracts qualifies
for the rewards above. Stay on testnet and on your own accounts.

## Scope

Contracts under `contracts/src`, the web app and the API. Out of scope: third-party services,
social engineering, denial of service by volume.

We never DM first and never ask for funds or seed phrases.
