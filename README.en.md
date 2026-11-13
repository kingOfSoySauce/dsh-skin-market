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

- **2026-11-13**: [Naiwa Studio](https://github.com/alaricchanchs-crypto/dsh-naiwa-studio) (alaricchanchs-crypto). See the [recent additions log](./docs/recently-added.md#recent-2026-11-13-alaricchanchs-crypto-dsh-naiwa-studio).

See the [recent additions log](./docs/recently-added.md).

<a id="manual-update"></a>
## Install and update

Works with DSH Web `>=0.1.0-rc.6` and official Desktop `>=0.2.0-rc.1`.

> If an update fails, follow the reason in the dialog before uninstalling anything: on official Desktop, removing the market unloads the running plugin. Web can reinstall directly; on Desktop, open “Plugins → Add plugin” and add `dsh-skin-market@latest` again. If that still fails, copy the diagnostic log.

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

Copy the prompt below to your DSH Agent. It will first determine whether the current DSH is Web or official Desktop. For Web, the Agent runs the commands. For official Desktop, when the current DSH exposes a plugin manager (plugin_manager), the Agent may install/enable after you confirm the exact target and profile; when the tool is unavailable or the app needs your confirmation, the Agent guides you through “Plugins → Add plugin”. You still perform the restart.

<details>
<summary><strong>Click to expand the prompts</strong></summary>

**Installation prompt**

```text
Please help me install dsh-skin-market. First, use read-only checks to confirm whether the current DSH is Web or official Desktop, and identify the current DSH and actual profile. For Web, check dsh --version. For official Desktop, use the version shown in the app’s About screen; do not treat the npm dsh version in the system terminal as the Desktop version. If you cannot read the app information, ask me to provide the version. If you cannot determine the DSH, ask me first.

- Web: run dsh plugin --profile web add "dsh-skin-market@latest", then verify the dependency and bundle in the same web profile.
- Official Desktop: first read-only confirm the current profile and installed version. When the current host exposes a plugin manager (plugin_manager) and you can confirm the profile, send me the exact target to install/update and the profile you will modify; after I confirm, install and enable it, then verify the actual version, enabled state, and whether a restart is needed. If the tool is unavailable, the host refuses, or I must confirm in the app, guide me to open “Plugins → Add plugin”, enter dsh-skin-market@latest, and let me click install and follow the app prompts. Do not run dsh plugin --profile desktop, write the Desktop profile with npm/pnpm, or edit the profile. I will restart. Give me one action at a time and wait for my feedback.

This task installs only the skin market. Do not check for conflicts with other skins and do not ask me to disable them. Do not install other skins for me. After installation, tell me where to open “Skin Market”. For Desktop, verify the result from the plugin page and my actual actions; do not claim that installation or enabling succeeded until it has been verified. Do not read .env, credentials, or chat history.
```

**Update prompt**

```text
Please update the installed dsh-skin-market. First determine the current DSH and actual profile: for Web, check dsh --version; for official Desktop, check the version in the app’s About screen. Do not substitute the npm dsh version in the system terminal for the Desktop version. If you cannot determine the DSH, ask me first.

- Web: use read-only checks to confirm that dsh-skin-market is installed in the web profile, then run dsh plugin --profile web add "dsh-skin-market@latest".
- Official Desktop: first read-only check the version and plugin state. When the current host exposes a plugin manager (plugin_manager) and you can confirm the profile, send me the exact target to update and the profile you will modify; after I confirm, update and enable it, then verify the actual version, enabled state, and whether a restart is needed. If the tool is unavailable, the host refuses, or I must confirm in the app, guide me to enter dsh-skin-market@latest in “Plugins → Add plugin”, confirm the update result, and follow the prompt to enable it. Do not run dsh plugin --profile desktop, write the Desktop profile with npm/pnpm, or edit the profile. I will restart.

After a Web update, verify the dsh-skin-market dependency and bundle in the same DSH. For Desktop, verify the result from the plugin page and my actual feedback; do not claim success until it has been verified. Tell me the versions before and after the update and which DSH needs to be restarted. Do not update or uninstall other skins for me.
```

</details>

## Use skins

Open “Settings → Skin Market” or “Plugins → dsh-skin-market”.

### Install a specific skin from the market

Directly installable npm skins use an “Install” or “Install and use” flow. Official Desktop normally installs the package first and then asks for confirmation to use it. If you cancel the use confirmation, the skin package remains installed but is not enabled.

Skins marked “Manual installation required” must receive a complete pinned target from the market. When an npm package is published, use `name@version` (prebuilt); use the complete GitHub commit and `&path:/subdirectory` only when there is no npm package. Do not substitute an unbuilt GitHub source for the npm package, or change the commit/subdirectory to `latest`, the repository’s default branch, or another package name.

<details>
<summary><strong>Click to expand the manual skin installation flow</strong></summary>

The Agent first uses read-only checks to confirm the current Desktop version and other skins that are enabled. If it finds a conflict, it lists the names, guides you to disable them in the app, and verifies the disabled state before continuing. If it cannot obtain the enabled state, it must ask you for the plugin list or the state shown in the UI; it must not treat “cannot confirm” as “no conflict”.

Use the complete pinned spec shown by the panel. Prefer `name@version` when an npm package exists; otherwise keep the complete GitHub commit and, for a monorepo subpackage, `&path:/subdirectory`, for example `github:owner/repo#<full commit>&path:/packages/skin`. Do not change the target to `latest` or the repository’s default branch.

When the current host exposes a plugin manager (plugin_manager), the Agent sends you the final exact target and the profile it will modify for confirmation, then may install it (not enabled by default); to enable it, it checks for conflicts and asks you again. If the tool is unavailable, the host refuses, or you must handle build approval in the app, the Agent guides you to open “Plugins → Add plugin”, paste the complete target, confirm the installation result, follow the prompt to enable it, and finally fully quit and reopen the app as required by the current version. The Agent does not run `dsh plugin --profile desktop` or edit the profile; build approval is confirmed item by item using only the exact keys the host returned; you perform the restart. If the UI does not support the target or installation fails, first check the original error and the maintainer’s instructions before deciding what to do next. Skins with companion packages require checking the complete installation requirements.

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
| Install, update, or uninstall is blocked by another installed plugin’s dead repository | Follow the three folded steps in the failure dialog: remove that dependency by hand, quit DSH and run the repair command, or give the prompt to an agent outside this DSH. Do not uninstall that plugin inside Market |
| The page cannot be operated because of a skin conflict | Stop the relevant DSH Web process, then use the Web reset command below. |
| The market disappears from the plugin list after clicking Update | The old Desktop self-update removed the market before reinstalling, and the reinstall could not run. Open “Plugins → Add plugin”, install `dsh-skin-market@latest`, and enable it |

### The market disappeared after an update

On official Desktop, older builds removed `dsh-skin-market` when you clicked “Update”, then tried to reinstall it. Removing the bundle unloads the running market, so the reinstall never ran and the profile was left without it.

1. Do not click “Update” in the market again; that repeats the same step.
2. Open DSH’s “Plugins → Add plugin”, enter `dsh-skin-market@latest`, and enable it when asked.
3. If the in-app install is refused, quit DSH completely (closing the window is not enough), run `pnpm add dsh-skin-market@latest` in the profile directory (usually `~/.dsh/profiles/desktop`; on Windows `%USERPROFILE%\.dsh\profiles\desktop`), confirm both `dependencies` and `dsh.profile.bundles` contain `dsh-skin-market`, then reopen.

Fixed builds overlay the new package in place with the pnpm DSH publishes, without removing the market. A restart is still required to load the new code.

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

The failure dialog has the same three steps, folded by default. The market cannot edit dependencies inside a running DSH. Fully exit DSH (closing the page is not enough), then run the repair command from an external terminal. The command ships with the market package and is fetched through `npx`, so it does not require updating the market inside the affected profile and does not run `pnpm add` against the running DSH.

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

A new entry is a thin YAML file; fields and priority are in the table below. `url` is required; the name, author, description, category, tags, modes, preview images, and subpath are optional — fill in what you can confirm and CI derives the rest. CI reads the package, loader id, commit, license, and compatibility range from the skin repository. Do not write them into the YAML. A community PR changes exactly one `registry/skins/<owner>__<repo>.yml` and does not edit `data/catalog.json` or `data/catalog-copy.json`.

<!-- submission-contract:START -->
| Group | Fields / items | Rule |
| --- | --- | --- |
| Author (thin entry) | `url`, `subpath`, `name`, `author`, `description`, `category`, `tags`, `modes`, `screenshots` | Write only these. If you write `name`, include both `zh` and `en`. Every field except `url` may be omitted; CI derives the default: `name`=repository name (subdirectory name for a subpackage), `author`=GitHub owner, `description`=`package.json` description, `category`=`skin`, `tags`=`appearance`, `modes`=`light` and `dark`, `screenshots`=repository `screenshots.json` or README images. |
| Filled by CI | `package`, `rowId`, `install`, `license`, `compatibility` | Do not write these; the schema rejects them. |
| Soft-required (non-blocking, enters the completion queue) | a usable preview image (upstream or captured), bilingual display name / description, motion GIF, splash launchGif | An entry may merge without them; it is recorded in the daily completeness report and enters the completion queue once enabled. |
| Recommended (advisory only) | captured `marketScreenshots`, cover `listScreenshot`, WebP `media`, README install command / version range (Web and official Desktop) / `dsh-plugin` topic, Desktop install support (npm package or manual install notes) | Never blocks a merge. |
<!-- submission-contract:END -->

CI must be able to read the skin repository: a public GitHub repository or monorepo subdirectory; `package.json` with name, version, license, and `dsh.client`; and a matching loader row in `cordis.patch.yml`. Preview images must be png, jpg, webp, or gif files in the repository. It also helps to declare the DSH Web and official Desktop version ranges and a `dsh plugin add` command in the README, and to add the `dsh-plugin` topic.

An existing entry can change only `name.zh`, `name.en`, `author`, `description`, `category`, `tags`, `modes`, and `screenshots`. Do not change the id, install target, commit, package, or rowId. This PR does not refresh the pinned version. Acceptance is not a security certification.

Local acceptance steps are in [TESTING.md](./TESTING.md).

<details>
<summary><strong>Click to expand the skin submission prompt</strong></summary>

Copy the entire prompt below to your Agent:

```text
Help me submit a DSH skin to DSH Skin Market.

Skin repository: <your skin repository URL>
Target catalog repository: https://github.com/kingOfSoySauce/dsh-skin-market
Catalog path: registry/skins

Follow these steps:
1. Use read-only checks to confirm that the skin repository is a public GitHub repository (or a monorepo subdirectory) and is an installable DSH skin (Web and official Desktop share the Web client). Do not read .env, credentials, or chat history.
2. Confirm that CI can read these materials from that repository. If any are missing, tell me first and do not invent them:
   - package.json has name, version, license, and dsh.client
   - cordis.patch.yml has a loader row matching the package name
   - the description is in the thin entry description or package.json description
   - preview images are png, jpg, webp, or gif files in the repository, from screenshots.json relative paths, README repository images, or the thin entry screenshots field (https image URLs)
   - the README should declare the DSH Web and official Desktop version ranges and include a dsh plugin add command; the repository should have the dsh-plugin topic
3. Fork or clone the catalog repository and create a branch. Add exactly one YAML file under registry/skins, named owner__repo.yml (owner__repo--path.yml for a subpackage). Do not overwrite an existing entry or edit data/catalog.json or data/catalog-copy.json.
4. The YAML must be a thin entry. Only these fields are allowed, and no others:
   - url (required): the public GitHub repository; use subpath or the repository tree path for a monorepo subpackage
   - optional fields: name.zh, name.en, author, description, category, tags, modes, screenshots
   Every field except url may be omitted, and CI derives the default: name from the repository name, author from the GitHub owner, description from package.json description, category defaults to skin, tags to appearance, modes to light and dark, and screenshots from repository preview images. To keep the catalog useful, fill in the optional fields you can confirm, especially both name.zh and name.en, plus author, description, category, tags, applicable modes, and preview images.
   Allowed values: category is one of skin, pet, player, or splash; tags is a non-empty array of strings; modes is a non-empty subset of light and dark; screenshots holds https image URLs, or put images in the repository screenshots.json / README. package, rowId, install, license, compatibility, and commit are still read by CI from the repository; do not hand-write them. The content may only be:
url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # only for a monorepo subpackage
# name:                       # optional; if present, include both zh and en
#   zh: Chinese name
#   en: English name
# author: owner               # optional; defaults to the GitHub owner
# description: one sentence about what the user sees  # optional; defaults to package.json description
# category: skin              # optional; skin, pet, player, or splash
# tags:                       # optional; non-empty array of strings
#   - appearance
# modes:                      # optional; non-empty subset of light and dark
#   - light
#   - dark
# screenshots:                # optional; https image URLs; repository screenshots.json or README is preferred
#   - https://.../screenshots/home.png

5. Do not write the full schema or invent a commit SHA, rowId, or license. If npm run registry:check reports a missing id/install, remove every field outside the thin entry and rerun it. Do not fill in the schema to pass CI.
6. Run npm run registry:check in the catalog repository root. Do not install anything into my real DSH profile.
7. git diff --name-only must contain only registry/skins/<entry-file>.yml. Commit and create a PR against https://github.com/kingOfSoySauce/dsh-skin-market titled feat(registry): add <skin-name>.
8. Return the PR link. If you do not have GitHub permission, only prepare the branch and copyable PR content.

A catalog entry is not a safety certification. Do not claim that DSH, a security team, or the market endorsed this skin.
```

</details>

<details>
<summary><strong>Click to expand the display-field update prompt</strong></summary>

Use this when changing only the display fields. Fill in the fields and new text before copying.

```text
Please update the display fields of a skin already listed in DSH Skin Market.

Skin repository: <your skin repository URL>
Target catalog repository: https://github.com/kingOfSoySauce/dsh-skin-market
Catalog path: registry/skins
Fields to change: <which of name.zh, name.en, author, description, category, tags, modes, and screenshots, plus the new content>

Follow these steps:
1. Use read-only checks to confirm that this repository already has an entry under registry/skins and that its remote matches the entry repo. If you cannot find it, stop and ask me. Do not create a new entry. Do not read .env, credentials, or chat history.
2. Edit only that existing YAML file. A community PR may change exactly one registry/skins/<entry>.yml. Do not change other entries, data/catalog.json, or data/catalog-copy.json.
3. Change only these display fields: name.zh, name.en, author, description, category, tags, modes, and screenshots. name must keep both zh and en. description should say what the user sees. category must be one of skin, pet, player, or splash; tags must be a non-empty array of strings; modes may contain only light and dark and must not be empty. screenshots may use only png, jpg, webp, or gif files from the repository at the currently pinned commit. Do not switch them to a newer commit, SVG, a data URI, or a third-party image host.
4. Do not change id, repo, subpath, package, rowId, install, compatibility, review, health, license, featuredRank, star counts, or any timestamp. This PR does not refresh the pinned version. If a version refresh is needed, say so in the PR body and do not invent install.target.
5. Run npm run registry:check in the catalog repository root. Do not install anything into my real DSH profile.
6. git diff --name-only must contain only that one YAML file. Commit and create a PR titled feat(registry): update <skin-name> display fields.
7. Return the PR link. If you do not have GitHub permission, only prepare the branch and copyable PR content.

Note: `description` and `screenshots` are display fields the author can change directly; when the PR changes only your own single YAML entry, CI will not reject it merely because the description or screenshots changed. CI does not verify entry ownership — the one-YAML rule and human review limit the scope. If this entry already has maintainer-approved display copy in `data/catalog-copy.json`, the YAML change will not automatically change the copy shown in the plugin or site. Include the Chinese and English text you want synced in the PR body; a maintainer will update the display layer after merge. Do not edit `data/catalog-copy.json` in this PR.

Do not claim that the fields are already live in the online catalog. After merge, catalog sync writes them into the catalog. Acceptance is not a security certification.
```

</details>

## License

[MIT](./LICENSE)
