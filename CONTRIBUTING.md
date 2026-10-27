# Contributing to Tactical SPG Command 3D

Thanks for helping build the game! Contributions of every kind are welcome:
code, art, audio, maps, translations, testing and documentation.

Merged work earns points in the [Contributor Rewards Program](REWARDS.md).
When the game makes money, part of the revenue is shared with contributors.

## Before you start

1. **Sign the CLA.** On your first pull request, a bot will ask you to sign
   the [Contributor License Agreement](CLA.md) by posting a comment.
   Pull requests cannot be merged without a signed CLA.
2. **Pick or open an issue.** Look for issues with a `points:N` label. For new
   ideas, open an issue first, so we can agree on the approach and the points
   before you spend time on it.
3. **Say you're working on it.** Comment on the issue, so two people don't
   end up doing the same work.

## Running the game locally

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start          # http://localhost:8080
npm run dev        # dev mode: the page reloads when you save a file
npm run build      # production bundle in dist/
```

On Windows you can also use `run-game.bat` or `dev.bat`.

## Pull request checklist

- [ ] One topic per pull request. Keep it focused.
- [ ] You tested the change in the browser, and there are no new console errors.
- [ ] You checked performance if you touched rendering, effects or physics.
- [ ] Your pull request links the issue it solves (`Closes #123`).
- [ ] Third-party code or assets are disclosed with their source and license.
- [ ] Parts produced with AI tools are disclosed.
- [ ] No secrets, passwords, API keys or personal data in the change.

## Assets

Art, audio and video you contribute must be **your own work**, or released
under a license that allows inclusion (for example CC0). Contributed assets
are distributed under the project's [Assets License](ASSETS_LICENSE.md).

## In-game text

Signs and labels **inside the 3D world** are written in English. UI text
follows the project's existing languages.

## Licensing summary

| Part | License |
|---|---|
| Source code | [GNU AGPL v3.0](LICENSE) |
| Images, video, audio in `assets/` and other media files | [All rights reserved](ASSETS_LICENSE.md) |
| Game name and logos | [Trademark policy](TRADEMARK.md) |
| Bundled libraries | [Their own licenses](THIRD_PARTY_NOTICES.md) |

## Reporting security issues

Do **not** open a public issue for security problems, such as account,
login or server vulnerabilities. Use GitHub's private
[security advisory](https://github.com/thangphung-work/tankwar/security/advisories/new)
form instead.
