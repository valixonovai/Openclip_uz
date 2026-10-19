export {};

declare global {
  interface Window {
    uzclip: {
      openVideo(): Promise<string | null>;
      saveVideo(suggestedName?: string): Promise<string | null>;
      mediaUrl(projectId: string): Promise<string>;
      request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
      onEvent(listener: (payload: { event: string; data: Record<string, unknown> }) => void): () => void;
    };
  }
}
