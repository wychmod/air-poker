# Air Poker film — autonomous production record

Date: 2026-11-09  
Mode: autonomous free creation  
Status: delivered; technical verification and independent review completed, no mandatory fixes

## Product brief

Air Poker is a single-player browser strategy game adapted from the Air Poker arc in Toshio Sako's manga _Usogui_ (volumes 40–43). Each round asks the player to assemble five distinct physical cards to a private target sum, then wager AIR against an opponent whose hand remains hidden until showdown. AIR also powers breathing: winning a pot does not by itself guarantee survival. The digital game runs locally in the browser and needs no account.

Primary audience: strategy-card-game players, manga readers, and people curious about unusual browser games. The film's central hook is the double use of AIR; the supporting proof is real card construction, hidden-information betting, the overlap penalty, and an auditable match record.

## Requirements translated into production choices

| Requirement / fact                                         | Production choice                                                                                                            | Proof / constraint                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The AIR economy is the distinct hook                       | Open with the product name, then elevate the real AIR resource area and breathing time                                       | Real local match capture; do not imply all 25 canisters are immediately spendable                                                       |
| Card construction is the core interaction                  | Show a real construction state and full five-card hand with target sum                                                       | Fresh browser capture; keep all five physical cards legible                                                                             |
| Opponent information is limited                            | Show actual betting state and say the opponent's hand stays hidden until reveal                                              | Current `game/engine.js` public snapshot and page copy                                                                                  |
| Overlap has a conditional penalty                          | Use the actual showdown capture, then a separate rules illustration of a valid overlap and 18→12 AIR loss                    | The rules illustration is built from `scripts/promo/prepare.js` facts and `settleBets`; identify it as an example, not a recorded match |
| Breathing continues beyond a single hand                   | Use the real match record to show round history and AIR accounting                                                           | Do not call the replay view live gameplay or say that a pot guarantees victory                                                          |
| Project is an unofficial manga adaptation                  | Credit in end card and the public description                                                                                | “改编自迫稔雄《噬谎者》第40–43卷「空气扑克」篇；非官方爱好者改编，数字版规则有调整”                                                     |
| Public demo data is allowed only after its status is clear | Freeze a locally generated demo match; no visitor counters or personal data                                                  | Capture manifest records the seed, browser, viewport and UI-action route                                                                |
| Visual style must grow from the product                    | Keep paper white, Songti-led editorial type, black ink, graphite rules, grey manga texture, and a small dark-red risk accent | Tokens below were read from `styles/shell.css`, `styles/hand-builder.css`, and current screenshots                                      |
| No music was specified                                     | Create an original restrained score from deterministic synthesis and keep it independently switchable                        | No sampled or downloaded song; no external SFX used                                                                                     |
| Existing promo artifacts are present                       | Make a new Remotion project and fresh capture set                                                                            | Preserve `promo/` canvas tools and historical renders                                                                                   |

## Visual directions considered

1. **Paper-table editorial (chosen):** the existing ivory paper, fine graphite lines, Songti display face, black cards and restrained oxblood risk accent. Real UI sits as a printed artifact on paper; small air particles and low-frequency water shading borrow from the game's own manga illustration. Motion: measured, weighty, precise.
2. **Deep-water monochrome:** use the game's underwater illustration as a full-frame stage with bright card faces. This retains the story image but competes with the actual UI and makes small account text difficult to read.
3. **Pure interface/documentary:** use only unadorned screen captures and minimal captions. It is accurate but misses the product's manga-paper identity and gives the film a screen-recording rhythm.

The chosen styleframe keeps the paper-table composition and real capture evidence. No unrelated neon, amber/blue tech palette, glossy glass, or invented application UI is introduced.

## Visual tokens

| Token            | Value / use                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paper            | `#f3f2ee` base; `#f8f7f2` card surface                                                                                                               |
| Ink              | `#171917` titles, rules, card backs                                                                                                                  |
| Graphite         | `#73766e` secondary labels; `#d8d8d0` fine rules                                                                                                     |
| Risk             | `#9c3737`, restricted to overlap, loss, or danger                                                                                                    |
| Display type     | `'Songti SC', 'Noto Serif CJK SC', 'SimSun', Georgia, serif`                                                                                         |
| Interface type   | `'Microsoft YaHei', 'PingFang SC', Arial, sans-serif`                                                                                                |
| Numeric type     | `ui-monospace, Consolas, monospace`                                                                                                                  |
| Layout           | Wide calm margins; restrained 12-column baseline; 1px rules; 2–4px card corner radius, matching the square-corner game UI                            |
| Material         | Matte paper, halftone/grain at low contrast, printed ink; no glow on every object                                                                    |
| Motion character | Deliberate, physical, restrained; 3–6f anticipation; out-cubic settle, only modest overshoot when an object lands; key information holds for reading |

`styleframe.html` and `styleframe.css` are a static HTML/CSS direction proof. They are not final screen captures and are not used as product footage.

## Function-to-shot mapping

| Product function                                   | Planned visual                                                                                            | Motion language / card                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Brand and product identity                         | Live homepage capture under a simple paper/ink title treatment                                            | `brand-ink-open` (adapt wordmark, palette, and kicker)                                                                                |
| AIR as spendable reserve and future breathing time | Live capture with the real AIR/reserve/breathing fields; isolate one resource group as focal subject      | `spotlight-hero-card` adapted to the actual resource panel; preserve the 3.6s+ focus→lift→reseat arc and high-contrast card-edge mask |
| Construct a valid five-card hand                   | Live hand-building capture and full five-card cutout strip                                                | Custom physical deal adapted from `deck-deal-flyin`; only five cards, so do not claim the demo's mass-grid/flood result               |
| Hidden-information betting                         | Live betting capture with the opponent cards still facedown                                               | Slow page-camera push; new semantics only, no fake player action or hidden opponent hand                                              |
| Overlap can burn reserve                           | Live showdown page plus a separately labeled rule illustration using the validated 18→12 ledger           | `crash-zoom-punch` on the actual AIR loss; six-frame crash and long post-hold, no whole-frame shake                                   |
| Match record                                       | Live review/ledger page                                                                                   | `row-embed`-style restrained row settlement, adapted to a real record screenshot                                                      |
| CTA / brand                                        | True wordmark, project URL, adaptation credit; representative real card and record crops settle around it | `outro-group-photo-launch`, adapted to paper/ink and restrained energy; brand hold ≥1 second                                          |

Gallery keys and selected variants are verified against the local `gallery/api/library.json`. Exact reference implementations are listed in the source manifest.

## Final storyboard

Target: 900 frames, 30 fps, 1920×1080, Chinese hard captions. A clean mix and a no-BGM mix use the same video timeline.

| #   | Time / frames        | Picture and page state                                                                              | One dominant motion                                                                               | Copy / caption                                               | Audio                        |
| --- | -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| 1   | 0–3.0s / 0–89        | Real home page capture; product name and manga adaptation credit from the first held end card       | Ink crosshair draws, Chinese wordmark presses in, then settles into the real homepage             | “空气扑克” / “你下注的，是下一口空气。”                      | Original ambient BGM; no SFX |
| 2   | 3.0–9.0s / 90–269    | Actual AIR balance, unopened reserve and breathing timer from the same frozen match                 | Warm-white paper spotlight locks the real resource cluster, lifts it, returns it to its page slot | “空气，是筹码，也是生存时间。”                               | Original ambient BGM; no SFX |
| 3   | 9.0–14.0s / 270–419  | Actual target and complete five-card hand; all distinct card entities remain visible                | Five real card cutouts deal into a row with hard-accelerating spacing, then rest                  | “五张不同的牌，凑出你的目标。”                               | Original ambient BGM; no SFX |
| 4   | 14.0–19.0s / 420–569 | Actual betting page; opponent hand remains facedown                                                 | A slow camera push across the current interface; a single pause on the facedown hand              | “下注之前，你看不见对手的牌。”                               | Original ambient BGM; no SFX |
| 5   | 19.0–23.5s / 570–704 | Actual showdown page; second half overlays a rules-verified, explicitly illustrative overlap ledger | A brief diagram punch, then a stable read; no live-balance crash zoom                             | “有效成手重叠，败者额外损失空气。” / “规则示例 · 非本局记录” | Original ambient BGM; no SFX |
| 6   | 23.5–30s / 705–899   | Actual match record resolves into end card with AIR Poker mark, URL and adaptation credit           | Review rows settle, representative cards and ledger elements converge around wordmark, then hold  | “打开浏览器，即刻入局。” / `wychmod.github.io/air-poker`     | Original ambient BGM; no SFX |

The final brand and URL hold for at least 30 frames. The five-card batch ends in a quiet rest. The adaptation credit is readable and does not imply official licensing. No match result, survival duration, odds, or opponent information is invented.

## Frame plan and self-check points

| Shot                 | Absolute range | Required stills    |
| -------------------- | -------------: | ------------------ |
| S1 brand             |           0–89 | 12, 55, 75         |
| S2 AIR hero          |         90–269 | 112, 158, 250      |
| S3 build hand        |        270–419 | 280, 342, 395      |
| S4 wager             |        420–569 | 432, 486, 548      |
| S5 overlap / loss    |        570–704 | 582, 610, 660, 695 |
| S6 ledger / sign-off |        705–899 | 720, 780, 840, 870 |

Frame ranges are the sole time source for the Remotion composition, captions, audio cues, and workbench manifest.

## Capture and asset record

Final textures are captured after this storyboard from a local server at 1920×1080 CSS px / device scale 2 with loaded fonts and settled live timers. Match actions use real `data-action` buttons. The capture manifest must distinguish viewport pages, element cutouts, generated illustrative rules data, and any excluded content. Each final asset receives a SHA-256 and a measured image size.

Screenshots show frozen local demo data only. The random seed is fixed; realtime match timers can change a new capture run’s outcome. Freeze any displayed balance/timer in the captured page texture. Do not include GitHub usernames, locally stored match archives, visitor counts, local paths, or external browser chrome.

## SFX and mix plan

Use a newly synthesized, deterministic low-register score as BGM; it has no sampled audio. A Freesound search returned a rate-limit response during asset selection, so the film uses no external SFX and does not silently substitute old sound files. Render with and without BGM from the same timeline. The film's timing does not depend on sound cues.

## Production limitations / facts

- A screenshot proves page appearance, not continuous interactive gameplay; all UI evidence is a real screenshot after button-driven local actions.
- The overlap ledger is an illustrative scenario verified by existing rule functions, not a captured user match.
- This is a fan adaptation of copyrighted source material and game imagery, with no claim of official affiliation or commercial authorization.
- The Context7 connector is not exposed in this session. Remotion dependencies will be pinned to the version already used by the local video workbench rather than claiming a Context7 documentation lookup.

## Final production amendments (autonomous decisions)

This section supersedes initial placeholder audio phrases and the literal Gallery staging above. No user-selected Gallery variant was requested; the cards serve as motion grammar references, not a claim of pixel-identical reproduction.

- The paper/ink direction takes precedence over the graphite theatre palettes in spotlight/deck/outro demos. AIR retains the exact 56–66 rise, 124–142 reseat and 34→142 3.6-second focus arc, two restrained ink outline passes and a locked end camera. Paper masking replaces the black theatre; the wide resource strip uses an 8-degree side view to keep both balances legible. This is an explicit adaptation of Q6/Q7.
- Five real card cutouts deal from a visible stack into their original slots. One 48px anticipation precedes accelerated cues at 36,54,66.6,73.8,75.6. Full hand is stationary after local frame 100. This is a five-card adaptation; the demo's 26-item flood/orbit is not claimed.
- Betting uses a slow frontal PageCam push. No simulated betting action, changed account value or opponent reveal is inserted.
- The loss section first shows the real showdown, then a separately labelled rule diagram. The comparison diagram settles with a short punch; unlike the Gallery crash-zoom demo, it does not enlarge a live AIR balance. This deliberate change prevents viewers from interpreting the illustrative 18→12 as a real match result. Winner is four of a kind; loser is three of a kind; both target 24. The loser already wagered 6 AIR and loses a further 6 from reserve 18. No private opponent information is shown before the showdown.
- Review uses two captured accounting half-rows settling at real page coordinates (cues 12/22, flight 12f). The final group comprises AIR, real cards, facedown cards and recorded loss accounting. Its crane angle is restrained to four degrees; no gold particles, neon or unrelated stage colour. The title/CTA holds from local frame 126 through 194.
- Brand title fully settles by f31 and holds through f62 (31 frames) before moving into a two-panel home layout. The adaptation credit is shown from f0. Non-narrative microtext belongs to screenshot texture; narration is 64px and URL 44px.
- Final captions are sourced only from src/timeline.ts. The final CTA lives in the end card once; the record caption is different.
- Audio is one newly generated ambient score. There is no external SFX, no narration and no strong drum grid; the initial storyboard's whoosh/impact/breath placeholders are superseded. The no-BGM version is silent. S1/S4 are intentional exceptions for the restrained manga direction and unavailable licensed SFX. No subjective listening claim is made by waveform measurement.
- Context7 tools were not exposed. Library implementation was based on the installed pinned Remotion 4.0.484 source/types and the local skill examples.

## Validation scope

The real capture run exercised product navigation, selection, construction, betting, showdown and record viewing through buttons, with no page errors. Runtime game modules were not changed. The root harness now excludes exactly this video project's dependency/cache/render directories; a regression checks that adjacent source and historical promo source remain scanned. Full npm run check passed with 203 tests.

## Final technical delivery

The MP4 video stream is 900 frames, 1920×1080 at 30fps. A packaging pass trims AAC container padding to an exact 30-second master without re-encoding video. The no-BGM file stream-copies all 900 video frames and contains no audio track, as this film has no SFX. FFmpeg full decode, frozen asset hashes, rule illustration and frame-based source checks passed. The measured final mix is −16 LUFS integrated, −7.86 dBTP true peak; subjective listening remains unverified.

The workbench imports six shots, six captions and one music track. Thirteen representative frames passed the skill’s pixel comparison threshold (channel tolerance 2, differing pixels <0.1%); twelve were exact, f486 differed in 0.0694% of pixels. Browser preview, language switching and text-property controls were exercised. The only console network failure was the workbench’s missing favicon. Its preview shows a one-second editing margin; renderExact exports the 900-frame content.

Independent review completed with no mandatory fixes under the documented paper/ink adaptation direction. It checked final MP4 keyframes, cut points and motion samples against all six reference clips; see ../../output/shotcraft-promo/independent-review.md. Suggested refinements concern microtext in small playback windows and the transition back to native remove buttons after the card deal. Audio was not subjectively auditioned.
