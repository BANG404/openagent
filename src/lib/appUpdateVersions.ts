export type ComponentVersionTransition = {
  label: string;
  currentVersion?: string | null;
  candidateVersion: string;
};

export function formatComponentVersionTransitions(
  transitions: ComponentVersionTransition[],
): string {
  return transitions
    .map(({ label, currentVersion, candidateVersion }) =>
      currentVersion
        ? `${label} ${currentVersion} → ${candidateVersion}`
        : `${label} ${candidateVersion}`,
    )
    .join(", ");
}
