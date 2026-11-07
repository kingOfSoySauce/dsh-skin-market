# DSH Skin Market <sub><a href="./README.md">中文</a></sub>

A community skin market embedded in DSH settings: browse, search, install, use, disable, pin, update, and uninstall DSH skins.

<p align="center">
  <img src="./docs/assets/skin-market-liang.png" alt="The skin market discovery page in DSH settings" width="70%">
</p>

<p align="center">
  <img src="./docs/assets/skin-market-deep-whale.png" alt="The Deep Whale skin details dialog in DSH Skin Market" width="70%">
</p>

## Online preview

[Open the online skin market](https://kingofsoysauce.github.io/dsh-skin-market/)

### Recently added

- **2026-11-07**: [Galaxy](https://github.com/haoranx98/dsh-skin-galaxy) (haoranx98). See the [recent additions log](./docs/recently-added.md#recent-2026-11-07-haoranx98-dsh-skin-galaxy).

<a id="manual-update"></a>
## Install and update

> If an update fails, first uninstall `dsh-skin-market`, then reinstall it using the installation method above. If uninstalling or reinstalling still fails, read the error message and copy the diagnostic log.

### Method 1: Command

Run this in a terminal:

```sh
dsh plugin --profile web add "dsh-skin-market@latest"
```

### Method 2: In the app

In the upper-left corner, select “Plugins → Add plugin” and enter:

```text
dsh-skin-market@latest
```

### Method 3: Update in the skin market

Click “Update” in Skin Market.

### Method 4: Get help from an Agent

Copy the prompt below to your DSH Agent. It will first determine whether the current DSH is Web or official Desktop. You still complete Desktop installation, enabling, and restart in the app.

<details>
<summary><strong>Click to expand the prompts</strong></summary>

**Installation prompt**

```text
Please help me install dsh-skin-market. First, use read-only checks to confirm whether the current DSH is Web or official Desktop, and identify the current DSH and actual profile. For Web, check dsh --version. For official Desktop, use the version shown in the app’s About screen; do not treat the npm dsh version in the system terminal as the Desktop version. If you cannot read the app information, ask me to provide the version. If you cannot determine the DSH, ask me first.

- Web: run dsh plugin --profile web add "dsh-skin-market@latest", then verify the dependency and bundle in the same web profile.
- Official Desktop: only perform read-only checks and give me instructions. I will complete installation, enabling, and restart in the app. Do not click Install or Enable for me, do not run dsh plugin --profile desktop, pnpm, or any other installation command, and do not modify the Desktop profile. Give me only the next action and wait for my feedback each time: open “Plugins → Add plugin”, enter dsh-skin-market@latest, confirm the installation result, and then follow the app’s prompt to enable it. If a restart is needed, guide me to fully quit and reopen the app.

This task installs only the skin market. Do not check for conflicts with other skins and do not ask me to disable them. Do not install other skins for me. After installation, tell me where to open “Skin Market”. For Desktop, verify the result from the plugin page and my actual actions; do not claim that installation or enabling succeeded until it has been verified. Do not read .env, credentials, or chat history.
```

**Update prompt**

```text
Please update the installed dsh-skin-market. First determine the current DSH and actual profile: for Web, check dsh --version; for official Desktop, check the version in the app’s About screen. Do not substitute the npm dsh version in the system terminal for the Desktop version. If you cannot determine the DSH, ask me first.

- Web: use read-only checks to confirm that dsh-skin-market is installed in the web profile, then run dsh plugin --profile web add "dsh-skin-market@latest".
- Official Desktop: use read-only checks for the version and plugin state, then guide me one step at a time to enter dsh-skin-market@latest in the Desktop app’s “Plugins → Add plugin”, confirm the update result, and follow the prompt to enable it. I will complete installation, enabling, and restart in the app. Do not operate the app for me, run a Desktop installation command, or modify the profile.

After a Web update, verify the dsh-skin-market dependency and bundle in the same DSH. For Desktop, verify the result from the plugin page and my actual feedback; do not claim success until it has been verified. Tell me the versions before and after the update and which DSH needs to be restarted. Do not update or uninstall other skins for me.
```

</details>

## Use skins

Open “Settings → Skin Market” or “Plugins → dsh-skin-market”.

### Install a specific skin from the market

Directly installable npm skins use an “Install” or “Install and use” flow. Official Desktop normally installs the package first and then asks for confirmation to use it. If you cancel the use confirmation, the skin package remains installed but is not enabled.

Skins marked “Manual installation required” are GitHub or monorepo subdirectory skins. Give the Agent the complete fixed target supplied by the market, then confirm it in the Desktop app under “Plugins → Add plugin”. Do not change the complete commit or `&path:/subdirectory` to `latest`, the repository’s default branch, or another package name.

<details>
<summary><strong>Click to expand the manual skin installation flow</strong></summary>

The Agent first uses read-only checks to confirm the current Desktop version and other skins that are enabled. If it finds a conflict, it lists the names, guides you to disable them in the app, and verifies the disabled state before continuing. If it cannot obtain the enabled state, it must ask you for the plugin list or the state shown in the UI; it must not treat “cannot confirm” as “no conflict”.

Use the complete fixed spec shown by the panel. Keep the complete commit for a GitHub target. For a monorepo subpackage, also keep `&path:/subdirectory`, for example `github:owner/repo#<full commit>&path:/packages/skin`. If there is no npm package, do not replace this target with a package name, `latest`, or the repository’s default branch.

The Agent guides you through one action at a time and waits for your feedback: open “Plugins → Add plugin”, paste the complete target, confirm the installation result, follow the prompt to enable it, and finally fully quit and reopen the app as required by the current version. The Agent does not click Install or Enable for you, run a Desktop installation command, or modify the profile. If the UI does not support the target or installation fails, first check the original error and the maintainer’s instructions before deciding what to do next. Skins with companion packages require checking the complete installation requirements.

These instructions do not change the market’s one-click npm installation flow, and they do not mean that every GitHub or subdirectory skin has completed official Desktop testing on a real device.

</details>

<a id="install-troubleshooting"></a>
<a id="configuration-override"></a>
## Common problems and troubleshooting

First follow the specific reason shown in the market dialog or banner. Do not reinstall just because a package is already installed, and do not uninstall the entire profile just because one enabling attempt failed.

| Situation | What to do first |
| --- | --- |
| Network or download timeout | Retry once. If it continues to fail, copy the market diagnostic log and check the network and install source actually used by DSH. |
| Installed but not in use | Open the skin details and click “Use”. Check whether it shows “Restart required” or “Not taking effect” and read the reason. |
| Enable/disable overridden by another setting | Follow the component-specific instructions in the dialog; do not reinstall repeatedly. When the market can safely locate the override, it provides a direct repair entry point. |
| Installation blocked by new-package protection | Allow only the exact version named in the error, or wait for the protection period to end. Do not disable global protection. |
| Operation result is still being confirmed | Wait for the market to verify the result from DSH. Do not click Install, Enable, or Uninstall again. |
| Installation/update fails with a 404 URL that points at another installed plugin (its upstream repository is gone) | Fully exit DSH, then repair the profile dependencies from an external terminal as described in “Installation blocked by an unreachable installed dependency” below |
| The page cannot be operated because of a skin conflict | Stop the relevant DSH Web process, then use the Web reset command below. |

<a id="release-wait"></a>
### Installation blocked by new-package protection

The market tries to merge exact-version exceptions already present in the current profile. If installation is still blocked, allow a version only after confirming that the package name and version came from this error. You can also wait for pnpm’s protection period to end. The market never disables protection for an entire package or for all future versions.

<details>
<summary><strong>Need an Agent to help with a new-package protection error?</strong></summary>

```text
Please handle this DSH Desktop new-package protection error. First confirm the actual Desktop profile name and directory. From the ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION diagnostic, confirm the exact package name and version that was blocked; do not assume that the skin currently being installed is the blocked package.

Only handle the minimumReleaseAgeExclude field in this profile’s pnpm-workspace.yaml. First merge versions already allowed by rules for the same package, while preserving other rules, comments, and the global age policy. If the exact version in the error does not already have an exception, show me the package name, version, and source, and add that exact version only after I confirm. Do not set minimumReleaseAge=0. Do not allow future versions of the entire package. Do not read .env, credentials, or other secret configuration. If a mixed configuration may contain secrets, first obtain narrowly scoped authorization to read the specified fields.

If you are running inside this DSH, do not modify its active combination configuration, restart it, or install the current DSH. First prepare a repeatable apply-and-rollback plan for an external terminal or independent Agent. I will perform Desktop package operations on the official page. Finally, verify the actual installed version and component state, and report the concrete result.
```

</details>

<a id="profile-dependency-repair"></a>
### Installation blocked by an unreachable installed dependency

The error looks like `ERR_PNPM_FETCH_404` with a URL under `codeload.github.com/...`, and that repository belongs to a plugin you installed **earlier**, not to the skin you are installing now. pnpm resolves every Git dependency in the profile on each install; once one upstream repository or commit is deleted, every install, update, uninstall, and market self-update fails.

The market cannot edit dependencies inside a running DSH. Fully exit DSH (closing the page is not enough), then run the repair command from an external terminal. The command ships with the market package and is fetched through `npx`, so it does not require updating the market inside the affected profile and does not run `pnpm add` against the running DSH.

```bash
# Read-only diagnosis: unreachable sources, lockfile drift, planned removals
npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile web

# After fully exiting DSH, apply the repair; --keep <package> preserves one unreachable plugin
npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile web --apply --yes --i-have-stopped-dsh

# Roll back when needed
npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile web --rollback ~/.dsh/profiles/web/.dsh-skin-market/backups/repair-<timestamp> --yes --i-have-stopped-dsh
```

The repair backs up `package.json` and `pnpm-lock.yaml` inside the profile first, removes only dependencies confirmed unreachable, then runs one `install --no-frozen-lockfile` with the same pnpm generation as the profile. It then verifies the remaining dependencies, lockfile consistency, and the installed market version. The run may need the network because pnpm re-fetches the other Git dependencies; do not disable integrity checks and do not delete the whole lockfile. When the catalog maintainers have moved a skin to a new repository or an npm source and provide the full pinned target, pass `--migrate package=<target>` to keep it instead of removing it (for example `--migrate dsh-dream-skin=dsh-dream-skin@11.7.0`). Migration targets must be confirmed by the maintainers; unreachable dependencies without a confirmed target are removed by default. Start DSH afterwards, verify the page version and the saved enable/disable selection, then retry the original installation. Both diagnosis and repair need `pnpm`; when it is not on PATH, pass `--pnpm <executable>` pointing at the same pnpm generation the profile used.

<details>
<summary><strong>Need an Agent to repair profile dependencies?</strong></summary>

```text
This DSH skin install/update failed during pnpm dependency resolution: the error points at a codeload.github.com 404 for an upstream repository of a plugin I already installed, not at the skin I am installing. Diagnose read-only first; do not retry the install or uninstall anything.

1. Confirm the DSH home, profile, and profile directory actually used by the running DSH; do not assume default paths.
2. Read package.json, pnpm-lock.yaml, and node_modules only, and identify which installed dependencies have unreachable upstream repositories/commits, where package.json and the lockfile disagree, and which packages are actually materialized. Do not read .env, credentials, or mixed configuration that may contain secrets.
3. Show me the diagnosis, the exact packages to remove, the backup directory, and the repair command. After I confirm, I will run it from an external terminal or through an independent Agent after fully exiting DSH. If you are running inside this DSH, do not modify your own active profile, install/uninstall the current DSH, or stop/restart yourself.
4. Keep a backup before repairing; remove only dependencies confirmed unreachable; do not disable integrity checks, relax allowBuild, delete the whole lockfile, or touch other skins.
5. After repairing, verify the installed versions, lockfile consistency, and the saved enable/disable selection. If you cannot read runtime state, ask me for the official page result and say it is unverified. Confirm the original failure cause is gone before retrying the original operation.
```

</details>

### Reset skins when the Web page is broken

If a skin conflict makes the DSH Web page unusable, stop the current DSH Web process first, then run:

```bash
~/.dsh/profiles/web/node_modules/.bin/dsh-skin-market-reset --profile web
```

This command disables skins managed by Skin Market and restores the default appearance, while keeping the installed skin packages and Skin Market. Then restart DSH Web. Do not run this Web profile command for official Desktop. Disable the conflicting skin in the app’s plugin manager or in the market instead.

## For developers

If you maintain a DSH skin, give one of the prompts below to an Agent to prepare a catalog entry or update its display fields. The market does not log in to GitHub for you or silently create a PR.

A new entry is a thin YAML file containing only `url`, `subpath`, `name`, `author`, `description`, and `screenshots`. If you write `name`, include both `zh` and `en`. CI reads the package, loader id, commit, license, and compatibility range from the skin repository. Do not write them into the YAML. A community PR changes exactly one `registry/skins/<owner>__<repo>.yml` and does not edit `data/catalog.json` or `data/catalog-copy.json`.

CI must be able to read the skin repository: a public GitHub repository or monorepo subdirectory; `package.json` with name, version, license, and `dsh.client`; and a matching loader row in `cordis.patch.yml`. Preview images must be png, jpg, webp, or gif files in the repository. It also helps to declare the DSH Web version range and a `dsh plugin add` command in the README, and to add the `dsh-plugin` topic.

An existing entry can change only `name.zh`, `name.en`, `author`, `description`, and `screenshots`. Do not change the id, install target, commit, package, or rowId. This PR does not refresh the pinned version. Acceptance is not a security certification.

Local acceptance steps are in [TESTING.md](./TESTING.md).

<details>
<summary><strong>Click to expand the skin submission prompt</strong></summary>

Copy the entire prompt below to your Agent:

```text
Please submit my DSH skin to DSH Skin Market.

Skin repository: <your skin repository URL>
Target catalog repository: https://github.com/kingOfSoySauce/dsh-skin-market
Catalog path: registry/skins

Follow these steps:
1. Use read-only checks to confirm that the skin repository is a public GitHub repository (or a monorepo subdirectory) and is an installable DSH Web skin. Do not read .env, credentials, or chat history.
2. Confirm that CI can read these materials from that repository. If any are missing, tell me first and do not invent them:
   - package.json has name, version, license, and dsh.client
   - cordis.patch.yml has a loader row matching the package name
   - the description is in the thin entry or package.json description
   - preview images are png, jpg, webp, or gif files in the repository, from screenshots.json relative paths, README images, or the thin entry screenshots field
   - the README should declare a DSH Web version range and include a dsh plugin add command; the repository should have the dsh-plugin topic
3. Fork or clone the catalog repository and create a branch. Add exactly one YAML file under registry/skins, named owner__repo.yml (owner__repo--path.yml for a subpackage). Do not overwrite an existing entry or edit data/catalog.json or data/catalog-copy.json.
4. The YAML must be a thin entry. Only these fields are allowed, and no others: url, subpath, name, author, description, screenshots. Adding package, rowId, category, tags, modes, compatibility, install, commit, or any other key fails the full schema check. The content may only be:

url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # only for a monorepo subpackage
# name:                       # optional; if present, include both zh and en
#   zh: Chinese name
#   en: English name
# author: owner               # optional; defaults to the GitHub owner
# description: one sentence about what the user sees
# screenshots:                # optional; repository-relative image paths only
#   - screenshots/home.png

5. Do not write the full schema or invent a commit SHA, rowId, or license. If npm run registry:check reports a missing id/install, remove every field outside the thin entry and rerun it. Do not fill in the schema to pass CI.
6. Run npm run registry:check in the catalog repository root. Do not install anything into my real DSH profile.
7. git diff --name-only must contain only registry/skins/<entry-file>.yml. Commit and create a PR titled feat(registry): add <skin-name>.
8. Return the PR link. If you do not have GitHub permission, only prepare the branch and copyable PR content.

Acceptance is not a security certification. Do not claim that DSH, a security team, or the market endorsed this skin.
```

</details>

<details>
<summary><strong>Click to expand the display-field update prompt</strong></summary>

Use this when changing only the name, author, description, or preview images. Fill in the fields and new text before copying.

```text
Please update the display fields of a skin already listed in DSH Skin Market.

Skin repository: <your skin repository URL>
Target catalog repository: https://github.com/kingOfSoySauce/dsh-skin-market
Catalog path: registry/skins
Fields to change: <which of name.zh, name.en, author, description, and screenshots, plus the new content>

Follow these steps:
1. Use read-only checks to confirm that this repository already has an entry under registry/skins and that its remote matches the entry repo. If you cannot find it, stop and ask me. Do not create a new entry. Do not read .env, credentials, or chat history.
2. Edit only that existing YAML file. A community PR may change exactly one registry/skins/<entry>.yml. Do not change other entries, data/catalog.json, or data/catalog-copy.json.
3. Change only these display fields: name.zh, name.en, author, description, and screenshots. name must keep both zh and en. description should say what the user sees. screenshots may use only png, jpg, webp, or gif files from the repository at the currently pinned commit. Do not switch them to a newer commit, SVG, a data URI, or a third-party image host.
4. Do not change id, repo, subpath, package, rowId, category, tags, modes, install, compatibility, review, health, license, featuredRank, star counts, or any timestamp. This PR does not refresh the pinned version. If a version refresh is needed, say so in the PR body and do not invent install.target.
5. Run npm run registry:check in the catalog repository root. Do not install anything into my real DSH profile.
6. git diff --name-only must contain only that one YAML file. Commit and create a PR titled feat(registry): update <skin-name> display fields.
7. Return the PR link. If you do not have GitHub permission, only prepare the branch and copyable PR content.

Do not claim that the fields are already live in the online catalog. After merge, catalog sync writes them into the catalog. Acceptance is not a security certification.
```

</details>

## License

[MIT](./LICENSE)
