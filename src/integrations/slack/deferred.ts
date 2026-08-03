export type AfterScheduler = (task: () => Promise<void>) => void;

export function scheduleSlackOperation(
  operation: () => Promise<unknown>,
  schedule: AfterScheduler,
  onError: (error: unknown) => void,
): void {
  schedule(async () => {
    try {
      await operation();
    } catch (error) {
      onError(error);
    }
  });
}
