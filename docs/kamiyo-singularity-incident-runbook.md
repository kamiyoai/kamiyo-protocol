# KAMIYO Singularity Incident Runbook

## Severity
- SEV-0: fee misrouting, exploit, oracle manipulation with incorrect market settlement
- SEV-1: market creation/trading/resolution outage, dispute workflow unavailable
- SEV-2: partial degradation, delayed resolution, non-critical UI/API failures

## First 5 Minutes
1. Confirm blast radius:
   - affected markets
   - affected wallets
   - affected instructions
2. Freeze risk paths if needed:
   - disable new market creation UI
   - disable order placement UI
3. Capture evidence:
   - transaction signatures
   - program logs
   - vault balances and account snapshots

## Containment
- For fee anomalies:
  - block additional settlements at application layer until verified
  - verify protocol fee vault owner and mint constraints on chain
- For oracle anomalies:
  - halt market resolution path
  - route affected markets into dispute escalation

## Recovery
1. Patch and verify with reproducible test cases.
2. Re-run unit and integration suites.
3. Dry-run against devnet scenarios matching incident signatures.
4. Resume functionality in staged order:
   - read-only -> create market -> trade -> resolve

## Postmortem (within 48h)
- Root cause
- Detection gap
- Code fix
- Monitoring rule added
- Test added to prevent recurrence
- User-facing impact statement
