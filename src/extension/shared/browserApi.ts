type StorageArea = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

interface RuntimeApi {
  id?: string;
  getURL?: (path: string) => string;
  openOptionsPage?: () => Promise<void> | void;
  sendMessage?: (message: unknown) => Promise<unknown>;
}

interface BrowserLike {
  storage?: {
    local?: StorageArea;
  };
  runtime?: RuntimeApi;
  tabs?: {
    create?: (createProperties: { url: string }) => Promise<unknown> | void;
  };
}

declare global {
  interface Window {
    browser?: BrowserLike;
    chrome?: BrowserLike;
  }
}

export const browserApi: BrowserLike = window.browser ?? window.chrome ?? {};
