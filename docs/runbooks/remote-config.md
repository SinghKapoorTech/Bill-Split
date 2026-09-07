# Runbook — Remote Config (free-tier caps + version gate)

**Never publish Remote Config from the Firebase console.** Use:

```bash
npm run rc:publish -- beta            # or: prod
npm run rc:publish -- prod --dry-run  # show what would happen
```

Source of truth lives in the repo:

| File                             | Project       |
| -------------------------------- | ------------- |
| `config/remote-config/beta.json` | `divit-beta`  |
| `config/remote-config/prod.json` | `divit-6d217` |

Edit the JSON, run the command. Auth uses `gcloud auth print-access-token`
(`gcloud auth login` if it fails) — the Firebase CLI cannot do this, see below.

## Why a script instead of the console

Firebase keeps **two separate Remote Config templates** and gives no hint the
second exists:

| Namespace         | Read by                                  | Parameters                                                      |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `firebase`        | the app's JS SDK (client)                | `minimum_supported_version`                                     |
| `firebase-server` | `getServerTemplate()` in Cloud Functions | `paywall_enabled`, `free_active_groups`, `free_scans_per_month` |

The console shows the **client** template by default. The
`firebase remoteconfig:*` CLI commands and the Admin SDK's `publishTemplate()`
also write the **client** template. So the obvious way to "turn the paywall on"
writes a template no server code ever reads.

The resulting failure is safe but silent: the functions log one NOT_FOUND per
instance, fall back to defaults — which include `paywall_enabled: false` — and
every cap computes `wouldBlock` correctly and then **permits the action anyway**.

This is not theoretical. Measured on beta, 2026-09-07:

| Server template | Log                                                          | Unarchive at the cap |
| --------------- | ------------------------------------------------------------ | -------------------- |
| missing         | `group cap would block (enforcement dark)`, `activeCount: 2` | **succeeded** (200)  |
| published       | —                                                            | **blocked** (429)    |

Identical request, identical data, identical code. The only variable was which
namespace held the values.

The script publishes **both** namespaces from one file, so they cannot drift.

## Turning enforcement on

`paywall_enabled` is the master switch. It ships **`false`** — every cap
evaluates and logs but never blocks. That is deliberate: it exercises the whole
path in production, including the aggregation queries, before it can lock anyone
out.

To enable, set `"paywall_enabled": { "defaultValue": { "value": "true" } }` in
the environment's JSON and publish. For prod the script **refuses without an
explicit confirmation**, because switching it on starts refusing actions for
real users:

```bash
I_MEAN_IT=1 npm run rc:publish -- prod
```

Propagation is up to **5 minutes** (the functions cache the template) plus
instance recycling. A failed fetch retries after 30s.

## Parameters

| Key                         | Default | Meaning                                                                            |
| --------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `paywall_enabled`           | `false` | Master switch for cap ENFORCEMENT. `false` = evaluate + log only.                  |
| `free_active_groups`        | `2`     | Max owned ACTIVE events on free. Clamped to `[1,1000]` server-side.                |
| `free_scans_per_month`      | `5`     | Max AI scans per UTC month on free. Clamped to `[1,1000]` server-side.             |
| `minimum_supported_version` | `""`    | Native update wall. Empty = no floor. See `docs/runbooks/minimum-version-gate.md`. |

**A missing or misspelled key reads as absent, and absent always means the safe
direction** — no cap enforcement, no version floor. A typo can never brick the
app or lock users out; it can only fail to turn something on. `getNumber()`
returns `0` for an absent key, which the server treats as "use the default"
rather than clamping to the minimum — otherwise one typo would hand every user
a limit of 1.

## If enforcement isn't working

Check the function logs first:

```bash
firebase functions:log --only createEvent,unarchiveEvent,analyzeBill --project <beta|prod>
```

| Log line                                               | Meaning                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `SERVER Remote Config template is missing` (**error**) | The server namespace was never published. Run `rc:publish`.      |
| `group cap would block (enforcement dark)`             | Working correctly — `paywall_enabled` is `false`.                |
| `value(s) clamped or defaulted`                        | A published value was out of range; the clamped value is logged. |
| `active-group count failed, allowing`                  | The aggregation query failed; the cap failed open by design.     |

## Related

- `functions/src/remoteConfigLimits.ts` — fetch, clamp, cache, and the namespace warning.
- `shared/monetizationLimits.ts` — bounds and why `0` means "absent".
- `docs/runbooks/minimum-version-gate.md` — the native update wall.
