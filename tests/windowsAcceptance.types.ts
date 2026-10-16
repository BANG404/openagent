// Keep installer automation in the repository TypeScript check without running
// native installers as a side effect of the portable unit-test suite.
export type AcceptanceBuild =
  typeof import("../scripts/build-windows-acceptance.mjs").buildWindowsAcceptance;
export type AcceptanceSubmit =
  typeof import("../scripts/submit-windows-acceptance.mjs").submitWindowsAcceptance;
export type AcceptanceTest =
  typeof import("../scripts/test-windows-acceptance.mjs").testWindowsAcceptance;
