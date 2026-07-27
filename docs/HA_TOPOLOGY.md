# High-Availability Topology (Redis + Postgres)

`docker-compose.ha.yml` is an HA overlay applied on top of
`docker-compose.prod.yml`:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.ha.yml up -d
./scripts/ha/chaos-drill.sh      # validate failover + no-data-loss
./scripts/ha/restore-drill.sh   # quarterly PITR restore verification
```

## Components

| Component | HA shape | Persistence | Purpose |
|-----------|----------|-------------|---------|
| Postgres | primary + streaming replica (replication slot) + WAL archive | WAL archiving for PITR | financial state; RPO=0 for committed txns |
| Redis | primary + replica + sentinel (AOF, appendfsync everysec) | AOF | rate-limit / idempotency / event-replay state |

## RPO / RTO targets
- **RPO (Postgres): 0** for committed transactions — streaming replication keeps
  the replica in lock-step; the chaos drill asserts a committed marker row is
  present on the replica before the primary is killed.
- **RTO (reads): <= 30s** — the hot-standby replica continues to serve reads
  while the primary is down; the chaos drill times this.
- **Redis RPO:** up to ~1s of non-replicated writes may be lost on a primary
  failure (AOF everysec + async replication). Because Redis backs rate-limit /
  idempotency state, this degrades *safely*: idempotency rejects duplicates
  conservatively rather than allowing replays (see issue #328). Document this
  eventual-consistency window in client expectations.

## Failover runbook
1. **Postgres primary down:** promote the replica
   (`pg_ctl promote` on `pg_replica`, or let a manager like patroni do it).
   Update `DATABASE_URL` to the promoted instance. The old primary rejoins as a
   standby after recovery.
2. **Redis primary down:** sentinel promotes `redis_replica` after
   `down-after-milliseconds` (5s). Clients reading the sentinel get the new
   primary. If using a single sentinel (dev), promotion is automatic but lacks
   split-brain protection — **production runs 3 sentinels with quorum=2**.
3. **WAL archive gap:** if the replica falls behind and WAL has been recycled
   before the replica caught up, re-seed with `pg_basebackup` (the replication
   slot prevents WAL removal while the replica is connected).

## Split-brain recovery
- Postgres: only one primary must accept writes. If both nodes think they are
  primary (partition), choose the one with the highest timeline/LSN, rebuild the
  other from `pg_basebackup`. Never merge divergent write histories.
- Redis: with 3 sentinels + quorum=2, a network partition cannot elect two
  primaries. With a single sentinel, treat any partition as requiring a manual
  reconciliation of the idempotency cache.

## Chaos validation (`scripts/ha/chaos-drill.sh`)
1. Records a baseline row count + inserts a committed marker row on the primary.
2. Asserts the marker replicated to the replica (RPO=0).
3. Kills the primary and times how long the replica continues to serve reads
   (RTO <= SLO_RTO_SEC, default 30s).
4. Asserts the marker row is still present on the replica after failover.
5. Restarts the primary and reports PASS/FAIL.

Run on each release + nightly in staging. Exits non-zero on RTO or RPO
violation so it can gate CI/CD.

## PITR restore drill (`scripts/ha/restore-drill.sh`)
Restores a throwaway cluster from the latest base backup + WAL archive to a
chosen `RECOVERY_TARGET_TIME`, then verifies expected rows are present and
post-target rows are absent. **Run quarterly** and log the result.

## Production hardening (follow-ups)
- Replace single-node sentinel with **3 sentinels (quorum=2)** for split-brain safety.
- Replace manual `pg_ctl promote` with **patroni + etcd** for fenced, automated
  Postgres failover.
- Use managed HA (RDS/Cloud SQL) where available; this overlay is for
  self-managed deployments.
- Add `pgbacks`/`pgBackRest` for tested base backups + retention.
