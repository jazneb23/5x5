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

## Verifying the lockfile

`npm audit` covers known advisories. It does not catch a package that was
pulled from the registry or whose contents no longer match what we locked,
so the sweep worth running after any dependency change is: every locked
version still resolves on npm, and every `integrity` hash still matches the
registry's. A version that has vanished, or a hash that has drifted, is the
signal actually worth chasing.
