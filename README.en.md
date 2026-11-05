# DSH Skin Market <sup><a href="./README.md">中文</a></sup>

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

- **2026-11-05**: [Something11235/dsh-video-skin](https://github.com/Something11235/dsh-video-skin) (`0.1.6`) — dsh-video-skin. See the [recent additions log](./docs/recently-added.md#自动同步更新).

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

### Reset skins when the Web page is broken

If a skin conflict makes the DSH Web page unusable, stop the current DSH Web process first, then run:

```bash
~/.dsh/profiles/web/node_modules/.bin/dsh-skin-market-reset --profile web
```

This command disables skins managed by Skin Market and restores the default appearance, while keeping the installed skin packages and Skin Market. Then restart DSH Web. Do not run this Web profile command for official Desktop. Disable the conflicting skin in the app’s plugin manager or in the market instead.

## Online catalog

New skins and catalog information update independently; you do not need to upgrade the market plugin first:

- When the market opens, it reads the latest catalog. While the page remains open, it checks about every 5 minutes and checks again when it regains focus.
- The browser keeps the most recent valid catalog and prefers the cache when the network is unavailable.
- Search and sorting cover the full catalog, and the list loads in batches.
- Installation targets in the catalog are fixed to the version or complete commit recorded when the skin was accepted. The market checks the target and entry point before installation.
- Community skins are not a security endorsement from DSH or the market. Read the skin repository, license, and compatibility range before using one.

## Submit your skin

If you develop a DSH skin, prepare a public GitHub repository and submit one `registry/skins/<owner>__<repo>.yml` file to this repository. The catalog entry contains submission information only; CI fills in the package, commit, loader ID, and preview image.

```yaml
url: https://github.com/<owner>/<repo>
```

For a monorepo subpackage, also add `subpath:`. YAML may contain only `url`, `subpath`, `name`, `author`, `description`, and `screenshots`. Do not write `package`, `rowId`, `category`, `tags`, or `install`. The generated catalog file `data/catalog.json` does not need to be maintained in a community PR.

Requirements:

- It must be a public, installable DSH Web skin repository or monorepo subpackage.
- The install source must be fixed to a complete 40-character commit SHA.
- The repository or package metadata must provide the package, row ID, license, and DSH compatibility range.
- Preview images must be real screenshots of the interface from the repository.
- Acceptance is not security certification or official endorsement.

<details>
<summary><strong>Click to expand the skin submission prompt</strong></summary>

Copy the entire prompt below to your Agent:

```text
Please submit my DSH skin to DSH Skin Market.

Skin repository: <your skin repository URL>
Target directory repository: https://github.com/kingOfSoySauce/dsh-skin-market
Directory path: registry/skins

Please complete the following steps:
1. Use read-only checks to confirm that the skin repository is a public GitHub repository (or a monorepo subdirectory) and is an installable DSH Web skin. Do not read .env, credentials, or chat history.
2. Fork or clone the target directory repository and create a new branch. Add only one YAML file under registry/skins. Do not overwrite existing entries or modify data/catalog.json.
3. The YAML must be a thin entry. Only url, subpath, name, author, description, and screenshots are allowed. Adding package, rowId, category, tags, modes, compatibility, install, or other fields will fail. CI fills in the remaining fields from the skin repository:

url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # only for a monorepo subpackage

4. Put preview images in screenshots.json or the README in the skin repository. Do not use SVG, data URI, or a third-party image host.
5. Do not write the full schema. If registry:check reports missing id/install, remove the extra fields and run it again; do not fill in the schema.
6. Run npm run registry:check in the root of the target directory repository. Do not install anything into my real DSH profile.
7. git diff --name-only must contain only registry/skins/<entry-file>.yml. Commit the change and create a PR in the target directory repository with the title feat(registry): add <skin-name>.
8. Return the PR link. If you do not have GitHub permission, only prepare the branch and copyable PR content.

Acceptance is not security certification. Do not claim that this skin has been endorsed by DSH, a security team, or the market.
```

</details>

## Safety and boundaries

- The market installs only skin identifiers listed in the catalog. It does not accept arbitrary commands or installation addresses.
- The market does not log in to GitHub for you or silently create a PR. Whether to fork, commit, or create a PR is decided by you and the Agent’s actual actions.
- Community skins are not security certifications from DSH or the market. Before installing, review the skin repository, license, compatibility range, and source.

## Local development

Node.js 22 or higher is required.

```bash
git clone https://github.com/kingOfSoySauce/dsh-skin-market.git
cd dsh-skin-market
npm install
npm run dev
```

`npm run dev` starts a preview page using Mock Host data and does not modify any DSH profile.

When developing local catalog entries, you can make the market read the catalog bundled with the current build:

```sh
DSH_SKIN_MARKET_LOCAL_CATALOG=1 dsh web
```

Common checks:

```bash
npm run registry
npm test
npm run typecheck
npm run build
```

See [TESTING.md](./TESTING.md) for the complete local installation and manual acceptance steps.

## License

[MIT](./LICENSE)
