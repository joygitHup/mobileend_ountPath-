// declarations.d.ts

declare module 'expo-file-system/legacy' {
  export * from 'expo-file-system';
}

declare module 'expo-speech' {
  export function speak(
    text: string,
    options?: { language?: string; rate?: number; pitch?: number }
  ): void;
  export function stop(): void;
  export function isSpeakingAsync(): Promise<boolean>;
}
