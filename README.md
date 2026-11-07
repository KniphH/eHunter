[中文版](https://github.com/KniphH/eHunter/blob/ehunter-enhanced/README_CN.md)

# eHunter
Provide scroll mode and book mode for a better reading experience.

> **eHunter Enhanced v1.0.0** (branch `ehunter-enhanced`) is an MIT-licensed enhanced fork of [hanFengSan/eHunter](https://github.com/hanFengSan/eHunter). Original author Alex Chen, Copyright (c) 2017 Alex; see [LICENSE](LICENSE). It uses its own 1.0.0 version line and a distinct userscript identity, so it can be installed alongside the original.
>
> Added on top of upstream master (`43a0a13`): a WebGL2 Anime4K super-resolution pipeline with custom `.glsl` pass stacking, a render timing stats overlay, selectable output encoding (PNG / WebP / JPEG), pixiv platform support, and an improved image source retry policy.
>
> Install from this repository's Releases (`ehunter-enhanced.user.js`). Please file issues [here](https://github.com/KniphH/eHunter/issues), not upstream. The original documentation is kept below.

# Preview
<img src="https://raw.githubusercontent.com/hanFengSan/eHunter/master/github_image/github_preview_4.png" style="width: 800px; display: block; padding: 10px;"/>
<img src="https://raw.githubusercontent.com/hanFengSan/eHunter/master/github_image/github_preview_5_1.png" style="width: 800px; display: block; padding: 10px;"/>
<img src="https://raw.githubusercontent.com/hanFengSan/eHunter/master/github_image/github_preview_3.jpg" style="width: 800px; display: block; padding: 10px;"/>

# Use on iPhone and iPad
eHunter can run on iPhone and iPad. See the guides below:

CN: [Link](https://github.com/hanFengSan/eHunter/blob/master/misc/iphone_ipad_cn.md)
EN: [Link](https://github.com/hanFengSan/eHunter/blob/master/misc/iphone_ipad_en.md)
JP: [Link](https://github.com/hanFengSan/eHunter/blob/master/misc/iphone_ipad_jp.md)

## Implementation Overview
eHunter creates a new node on the original page and mounts Vue to that node.
Content crawling/parsing is handled by fetch-based logic.
The architecture isolates platform-specific behavior from reader UI logic, making migration to other comic platforms easier.

## Install
Tampermonkey/userscript: [openuserjs](https://openuserjs.org/scripts/alexchen/eHunter)

## Run
1. Run `npm install`, then `npm run dev` for development mode.
2. Run `npm run build-prod` to generate the userscript build.

## Project Architecture
The current project is based on `Vite + Vue 3 + TypeScript`, with two main goals:
1. Inject a reader UI into target site pages.
2. Keep platform parsing logic and reader rendering logic layered for maintainability and extension.

Main directory responsibilities:

```
|-eHunter
  |-src
  |  |-main.ts               // Entry: initialize and mount app (currently test mounting by default)
  |  |-config.ts             // Runtime config
  |  |-platform/             // Platform layer (site detection, initialization, service factory)
  |     |-detector.ts        // Host/environment detection
  |     |-initializer.ts     // Platform initialization flow
  |     |-factory.ts         // Platform service creation
  |     |-eh/                // EH/EXH implementation
  |     |-nh/                // NH implementation
  |     |-base/              // Cross-platform base capabilities (request, queue, retry)
  |
  |-core
  |  |-App.vue               // Reader root component
  |  |-components/           // View layer: book mode, scroll mode, thumbnails, top bar, dialogs
  |  |-service/              // Business services (album data, download, retry policy)
  |  |-store/                // State management (app state, event bus, i18n, layout preference)
  |  |-model/                // Domain models (layout, book spread, thumb expand)
  |  |-utils/                // Utilities
  |  |-style/                // Global styles and theme variables
  |
  |-public/                  // Static assets
  |-dist/                    // Build output
  |-specs/                   // Feature/design specs
  |-misc/                    // Docs and supporting materials
```

Simplified call flow:
`main.ts -> platform initialization (detect site + create platform services) -> core reader mount -> component rendering/interaction -> service/store coordinate data loading and state updates`.
