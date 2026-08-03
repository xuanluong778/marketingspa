export class MessagingProviderRegistry {
  get(_channel: string): { send?: (...args: any[]) => any; validate?: (...args: any[]) => any } | undefined {
    return undefined;
  }
}
