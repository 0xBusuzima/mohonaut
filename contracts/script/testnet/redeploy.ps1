# Redeploys the whole system on Robinhood Chain testnet (46630) with the current code.
# Run from the repository root in PowerShell:   .\contracts\script\testnet\redeploy.ps1
# Forge asks for the password of the "deployer" keystore (cast wallet import deployer --interactive).
# The previous deployment record is kept as deployments/46630-v1.json.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$forge = Join-Path $env:USERPROFILE '.foundry\bin\forge.exe'

# Public addresses only (the founder's testnet wallets).
$env:OPS_SAFE = '0xeC375d14d656216544443718bB160ce6Bc0207F4'
$env:GUARDIAN_SAFE = '0x0952b428618A26F9024C679b7cB22Ce601f56C26'
$env:KEEPER = '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c'
$env:DEV_RECIPIENT = $env:OPS_SAFE
$env:TREASURY_RECIPIENT = $env:OPS_SAFE
Remove-Item Env:ETH_USD_FEED -ErrorAction SilentlyContinue # testnet: keeper-owned manual feed

# Genesis two full hours from now: pre-fill is open at once, Market Open is 72 h after genesis.
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$env:GENESIS_TIME = [string]([math]::Floor($now / 3600) * 3600 + 2 * 3600)
Write-Host ("Genesis: {0} UTC" -f [DateTimeOffset]::FromUnixTimeSeconds([long]$env:GENESIS_TIME).UtcDateTime)

$current = Join-Path $root 'deployments\46630.json'
$previous = Join-Path $root 'deployments\46630-v1.json'
if ((Test-Path $current) -and -not (Test-Path $previous)) { Copy-Item $current $previous }

Push-Location (Join-Path $root 'contracts')
try {
  & $forge script script/Deploy.s.sol `
    --rpc-url https://rpc.testnet.chain.robinhood.com `
    --broadcast --account deployer `
    --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
  if ($LASTEXITCODE -ne 0) { throw "forge script failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}
Write-Host 'Done: deployments/46630.json updated. Tell Claude "testnet redeploy bitti".'
