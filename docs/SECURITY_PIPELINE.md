# Security Pipeline

A unified, fail-gated security pipeline runs on every pull request and nightly
on `main`. It combines SAST, SCA, secret scanning, IaC scanning, and SBOM
generation.

## Jobs

| Job | Tool | Scope | Gate |
|-----|------|-------|------|
| Secret scan | gitleaks | full repo history | fail on any new secret |
| SAST | Semgrep | TS/JS/Rust/Docker/OWASP | fail on new HIGH/CRITICAL |
| SCA + IaC | Trivy | filesystem vulns + IaC misconfigs | fail on HIGH/CRITICAL |
| SBOM | Syft (CycloneDX) | all layers (npm + Rust + Docker) | published as signed artifact |
| Report digest | security-tests scripts | aggregate | non-blocking |

## Policy

- **Fail-gates** block merge on: any new secret, any new HIGH/CRITICAL SAST
  finding, any HIGH/CRITICAL dependency vulnerability (unfixed), or any
  HIGH/CRITICAL IaC misconfiguration.
- **Baseline suppressions** are reviewed with an owner and an expiry date:
  - Secrets: `.github/security/gitleaks-allowlist.txt` (commit SHAs)
  - Semgrep: inline `# nosemgrep` preferred; see `semgrep-baseline.md`
  - Trivy: `.trivyignore` (with expiry comments) for vulns
- **SBOM**: a CycloneDX JSON is published as a build artifact on every run so we
  can answer "are we affected by CVE-X?" quickly. Re-scan the SBOM against new
  advisories nightly.

## Metrics tracked

- Mean-time-to-remediate by severity
- Count of open HIGH/CRITICAL findings trend
- Pipeline pass rate on PRs

## Local run

```bash
# Secrets
docker run --rm -v "$PWD":/repo zricethezav/gitleaks:latest detect --source /repo --config .github/security/gitleaks.toml

# SAST
semgrep ci --config p/typescript --config p/owasp-top-ten

# SCA + IaC
trivy fs --severity HIGH,CRITICAL --ignore-unfixed .
trivy config --severity HIGH,CRITICAL .

# SBOM
syft . -o cyclonedx-json=sbom.cyclonedx.json
```

## Notes

- This pipeline is additive to the existing `.github/workflows/security-tests.yml`
  (OWASP/penetration Jest suites). The new pipeline provides industry-standard
  SAST/SCA/secret/IaC/SBOM coverage with enforced fail-gates.
- SARIF outputs are uploaded to GitHub's Security tab for triage.
