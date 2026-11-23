# Security Hardening Report — FluxaPay Repository

**Date:** November 4, 2026  
**Repository:** MetroLogic/fluxapay  
**Prepared by:** Victor Peter  
**Trigger:** Malware advisory notification from Drips/Wave Program

---

## Background

On October 20, 2026, the Wave team at Drips notified us that our repository was flagged as potentially affected by a malware campaign publicly tracked as "PolinRider." This campaign has been spreading across thousands of open-source GitHub repositories since early 2026, primarily targeting developer credentials (npm tokens, GitHub tokens, SSH keys) to propagate further.

The advisory recommended scanning the repository for specific markers, cleaning any found payloads, and implementing preventive security measures including signed commits and branch protection.

---

## Part 1: Malware Scan

A comprehensive scan was performed across all three remote branches (`main`, `feat/SOE`, `revert-1407-fix/payout-refund-fee-fx-issues`) and the full reachable git history (224+ commits). Every indicator listed in the Drips advisory was checked.

### Indicators Checked

| Indicator | Method | Result |
|---|---|---|
| Known string markers (`rmcej%otb%`, `Cot%3t=shtP`, `_$_1e42`) | Full-text search across all branches and commits | Not found |
| `.vscode/tasks.json` with `runOn: folderOpen` | File search + content search | No `.vscode` directory exists |
| `task.allowAutomaticTasks: "on"` in settings | Content search | Not found |
| `dist/setup.js` referenced in `preinstall` scripts | File search + content search | Not found |
| Suspicious font files (`fa-solid-500.woff2`, `fa-solid-600.eot`, `fa-solid.lfk`, `fa-solid-300.llf`) | File search | Not found |
| Suspicious `api.js` file with `node api.js` in start/dev scripts | File search + content search | Not found |
| Injected code after `export default`/`module.exports` in config files | Manual review of postcss, eslint, next, jest configs | All clean |
| `.devcontainer/` directory | File search | Not found |
| `eval(Buffer.from/atob/base64)` obfuscation patterns | Full-text search | Not found |
| Suspicious file additions in git history | `git log --diff-filter=A` across all branches | None found |
| Active git hooks in `.git/hooks/` | Directory listing | Only inactive `.sample` templates |
| `child_process` usage for unexpected execution | Full-text search | All instances are legitimate build/dev tooling |

### Scan Conclusion

**No PolinRider markers were found.** The repository appears clean. The notification was likely part of a broad sweep sent to thousands of repositories, rather than a confirmed detection.

---

## Part 2: Security Hardening

### 2.1 Commit Signing

Implemented SSH-based cryptographic commit signing (no GPG installation required, using Git 2.34+ native SSH signing support).

**Actions taken:**

1. Generated a dedicated ed25519 SSH signing key (`~/.ssh/fluxapay_signing_key`)
2. Uploaded the public key to GitHub as a **signing key** (distinct from authentication keys)
3. Configured git to automatically sign all commits:
   - `gpg.format = ssh`
   - `commit.gpgsign = true`
   - `user.signingkey` set to the signing key
   - `gpg.ssh.program = ssh-keygen`
4. Set up an `allowed_signers` file for local signature verification

**Result:** All commits made from this machine are now automatically signed and verifiable by GitHub (shown with a "Verified" badge).

### 2.2 Branch Protection on `main`

Applied the following protection rules to the `main` branch via the GitHub API:

| Protection Rule | Setting | Purpose |
|---|---|---|
| Require signed commits | Enabled | Prevents unsigned commits from being merged |
| Require pull request before merging | Enabled | Blocks direct pushes to main |
| Required approving reviews | 1 | Ensures peer review before merge |
| Dismiss stale reviews on new push | Enabled | Forces re-review after changes |
| Required CI status checks | `build-and-test`, `e2e-cross-browser` | Ensures tests pass before merge |
| Strict status checks (up-to-date) | Enabled | Branch must be current before merging |
| Enforce rules for administrators | Enabled | Admins cannot bypass protection |
| Block force pushes | Enabled | Prevents history rewriting |
| Block branch deletion | Enabled | Prevents accidental or malicious deletion |
| Require linear history | Enabled | Prevents merge commits (clean history) |

**Result:** No one — including repository admins — can push directly to `main` or force-push history changes. All changes must go through a signed, reviewed pull request that passes CI.

---

## Part 3: Documentation Update

Updated `CONTRIBUTING.md` with a new "Signed Commits Required" section, added to the Table of Contents and placed prominently before the "Getting Started" section.

The documentation covers:

- Why signed commits are required (PolinRider prevention)
- Step-by-step setup guide for SSH commit signing:
  1. Generate a dedicated SSH signing key
  2. Upload the public key to GitHub as a signing key
  3. Configure git locally (with repo-level and global options)
  4. Verify the setup with a test commit
- Troubleshooting for GitHub CLI permission errors
- How to verify signatures locally and on GitHub

This commit (`f8ade8e`) was the repository's first signed commit, pushed to `main` on November 4, 2026.

---

## Part 4: Repository Pull

Before pulling, 224 new commits on `origin/main` were scanned for all PolinRider markers. No suspicious files or strings were found. The pull completed as a fast-forward merge with no conflicts.

---

## Current Security Posture

| Area | Status |
|---|---|
| Malware scan | Complete — no indicators found |
| Commit signing | Active — all commits signed with verified SSH key |
| Branch protection | Active on `main` — signed commits, PR reviews, CI checks enforced |
| Force push protection | Active — history cannot be rewritten |
| Documentation | Updated — signing requirements documented for contributors |

## Recommendations for Ongoing Security

1. **Require signed commits on `develop`** — Apply the same branch protection to the `develop` branch if used as a merge target.
2. **Require 2FA for all collaborators** — Ensure all repository contributors have two-factor authentication enabled on their GitHub accounts.
3. **Use short-lived tokens** — Prefer fine-grained, short-lived GitHub access tokens over long-lived personal access tokens.
4. **Periodic re-scanning** — Re-run the malware marker scan periodically, especially after merging contributions from external forks.
5. **Review new dependencies carefully** — Scrutinize changes to `package.json`, lifecycle scripts, and binary/font files in pull requests.
6. **Rotate credentials** — If this machine was used with VSCode workspace trust or Cursor before the scan, rotate GitHub tokens, SSH keys, and npm credentials as a precaution.
