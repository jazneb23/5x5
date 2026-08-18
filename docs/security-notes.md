# Security notes

Not a spec. A record of dependency-scanner findings and what was done about
them, so the same investigation is not repeated on every scan.

## `obug` — flagged critical/malicious, false positive

Scanners (Aikido among them) flag `obug` in `package-lock.json` as critical
malware with the reason **"Package removed by NPM team."** It is a false
positive. The finding matches on the package *name*, not on the code we
actually install.

The name has two unrelated lives on npm. An `obug@1.0.1` published in
December 2016 — a typosquat of `debug` — was removed by npm's security team,
and that removal is what the malware databases remember. The name was later
reclaimed: the current package was first published 2025-11-11 by Kevin Deng
(`sxzz`) and is a legitimate ESM/TypeScript fork of `debug`. The 2016 entry
still lingers in the registry's `time` map, which is what makes the
name-based match fire.

We do not depend on it directly. `vitest` requires `obug: ^2.1.1`, so it
arrives as a transitive **dev** dependency and never reaches the built app.

Verified before accepting the risk:

- The locked version exists on npm and its tarball hash matches the
  `integrity` in `package-lock.json` byte for byte.
- The tarball is a LICENSE, a README, and four `dist/` files. No install
  hooks of any kind — no `preinstall`, `install`, or `postinstall`.
- The shipped code reads exactly one environment variable, `process.env.DEBUG`,
  and writes to stderr. No network calls, no `child_process`, no `eval`, no
  obfuscation.
- It is published through npm trusted publishing (GitHub OIDC) and carries a
  SLSA provenance attestation tying the tarball to a GitHub-hosted Actions
  run building `github.com/sxzz/obug` at the matching release tag.

Suppress it in the scanner rather than pinning around it. Removing `obug`
would mean downgrading `vitest`, which trades a real toolchain for an
imaginary threat.

## `5x5` — flagged critical/malicious, false positive

Aikido flags `5x5@0.0.0` in `package-lock.json` as critical malware with the
remediation "Uninstall the package as soon as possible." It is a false
positive, and the remediation is impossible to follow: the flagged package
was this project.

`package-lock.json` records the root project in its `packages[""]` entry,
carrying the `name` and `version` from `package.json`. Ours read `5x5` and
`0.0.0`. A package named `5x5` also existed on npm, and its malicious
release was version `0.0.0` — an exact name-and-version collision with our
own root entry, which is what the scanner matched on. The finding arrived
with `issue_title: "Unknown"` and no advisory body, because there was no
real record to attach to it.

The npm-side history, for the record: `5x5` published `0.0.0` (2018-12-18),
then `0.20.22` and `0.20.2204867` (2022). All three were removed. What
remains is `0.0.1-security` — npm's `security-holder` placeholder, published
from `npm/security-holder` with an empty maintainer list, the marker of a
name seized by npm's security team.

Verified before concluding it was ours:

- No `node_modules/5x5` entry exists anywhere in `package-lock.json`. The
  only occurrences of the string were the two root `name` declarations.
- Nothing resolves, downloads, or installs under that name — the root entry
  has no `resolved` or `integrity` field, because it is not fetched.

Fixed rather than suppressed. The package is `private: true`, so its name is
never published and means nothing outside this repo; renaming it to
`five-by-five` costs nothing and removes the collision at the source. That
is preferable to an ignore rule, which would leave a permanent critical
exception for someone to re-reason about later. Unlike [`obug`](#obug--flagged-criticalmalicious-false-positive),
the colliding string was ours to change.

## Verifying the lockfile

`npm audit` covers known advisories. It does not catch a package that was
pulled from the registry or whose contents no longer match what we locked,
so the sweep worth running after any dependency change is: every locked
version still resolves on npm, and every `integrity` hash still matches the
registry's. A version that has vanished, or a hash that has drifted, is the
signal actually worth chasing.
