export async function runQuickChatSubmission(
  startSubmission: () => Promise<void>,
  restoreMainWindow: () => Promise<void>,
  reportError: (error: unknown) => void,
): Promise<void> {
  try {
    await startSubmission();
  } catch (error) {
    reportError(error);
  } finally {
    await restoreMainWindow();
  }
}
