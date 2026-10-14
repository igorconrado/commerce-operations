# Security scope

Synthetic local demonstration; not approved for public multiuser deployment. Identity and organization are loaded from PostgreSQL sessions, not GraphQL arguments. Session tokens are random, hashed at rest, expire after two hours and revoke on logout. Cookies are HttpOnly/SameSite=Strict; `COOKIE_SECURE=true` is required behind production HTTPS. Current local HTTP needs it unset. This explicit local configuration is not production hardening.

Server-side use cases enforce operator access and tenant predicates. SQL constraints prevent tenant-crossing references. Credentials use salted scrypt. Login budgets are durable, per normalized account hash, 20 attempts per 15 minutes. This is not an IP/global abuse defense and can cause temporary account denial; a public gateway/global budget remains required. The budget table needs periodic retention cleanup before unbounded public use.

GraphQL is POST-only, same-origin, JSON, with batching disabled, depth/list-depth/field limits and bounded order pagination. No browser-supplied tenant or role is trusted. Response errors hide SQL internals. Request IDs and timings are logged without query contents or credentials. No production security guarantee is inferred from negative tests.

## Dependency audit resolution

Observed 2026-10-14: npm audit reports [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces <=3.0.3`, through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`. The registry's latest braces version is 3.0.3, with no patched release available at inspection. npm suggests downgrading the Next ESLint configuration across majors, which is not a compatible fix.

Resolved before merge by replacing eslint-config-next with ESLint 10, typescript-eslint and the compatible React Hooks plugin. This removes the affected glob chain and peer-dependency conflicts instead of downgrading the application or suppressing the advisory. Both full and production audits now require zero advisories, with no allowlist. Accessibility checks remain browser-based; Next-specific ESLint rules are not claimed. The earlier narrow exception was removed.

No secrets from the supporting private notes were copied. Fixtures and local credentials are intentionally synthetic and must not be reused for a deployed environment. Git history scanning is included in CI.
