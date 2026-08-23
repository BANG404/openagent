# Design QA: Windows 11-inspired onboarding

## Evidence

- Source truth: `C:\Users\wyh13\AppData\Local\Raycast\caches\clipboard\file-2ae46695ba2f369ae41ec9781285e656.png`
- Source dimensions: 612 × 344 px; the setup-window crop is 429 × 270 px and was normalized to 960 × 640 for composition comparison.
- Implementation viewport: 960 × 640 CSS px at DPR 1.
- Light / Chinese capture: `C:\Users\wyh13\AppData\Local\Temp\openagent-onboarding-qa\implementation-light-zh-960x640.png`
- Dark / English capture: `C:\Users\wyh13\AppData\Local\Temp\openagent-onboarding-qa\implementation-dark-en-960x640.png`
- Source / implementation comparison: `C:\Users\wyh13\AppData\Local\Temp\openagent-onboarding-qa\comparison-source-vs-implementation.png`
- Native light / Chinese capture: `C:\Users\wyh13\AppData\Local\Temp\openagent-onboarding-qa\native-onboarding-window.png`
- Native dark / English capture: `C:\Users\wyh13\AppData\Local\Temp\openagent-onboarding-qa\native-onboarding-dark-en.png`

The full 960 × 640 window was compared because the reference's defining qualities are its overall OOBE composition: a quiet illustration field on the left, a compact setup task on the right, and persistent actions at the lower edge.

## Verification

- Compared typography hierarchy, 46 / 54 column balance, illustration scale and placement, form alignment, footer position, borders, shadows, radii, and blue accent treatment.
- Exercised Continue, Back, completed-step navigation, language and theme selectors, Add Service, and the internally scrolling provider step.
- Verified light / dark and Chinese / English combinations at the fixed viewport.
- Verified the native Win32 window through DesktopDriver: title `OpenAgent Setup`, 960 × 640 client area at 96 DPI, `CanResize=False`, and `CanMaximize=False`.
- Confirmed the generated illustration loads and that the browser console has no errors in the verified flow.

## Comparison history

The first implementation used a 38 / 62 split. Comparison against the reference showed a P2 composition mismatch: the illustration sat too high and the form column began too far left. The final pass changed the split to 46 / 54, increased the illustration to a 320 px maximum width, lowered it with a 72 px top offset, and aligned the right-side content with 32 px top padding.

Post-fix review found no actionable P0, P1, or P2 differences. The generated illustration is intentionally a little more dimensional than the flat Windows reference; this is an accepted P3 difference because it remains within OpenAgent's blue, pearl, and ink visual language.

## Final result

Passed.
