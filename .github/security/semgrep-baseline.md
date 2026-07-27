# Semgrep Baseline Policy

New HIGH or CRITICAL findings from Semgrep fail the security pipeline.
Accepted/false-positive findings should be suppressed inline in code with
`# nosemgrep: <rule-id>` and a short rationale comment, rather than added to
a global allowlist, so the suppression is reviewed at the code site.

If a global suppression is unavoidable, add the rule id below with an owner
and an expiry date. The security team reviews this file quarterly.

| Rule ID | Reason | Owner | Expiry |
|--------|--------|-------|--------|
| _(none)_ | | | |
