type FetchTextResponse =
  | { ok: true; text: string }
  | { ok: false; error?: string };

declare const chrome: {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
};

export async function extensionFetchText(url: string): Promise<string> {
  const response = (await chrome.runtime.sendMessage({
    type: "ylang:fetchText",
    url
  })) as FetchTextResponse;

  if (!response?.ok) {
    throw new Error(response?.error ?? "Extension fetch failed.");
  }

  return response.text;
}

export async function extensionFetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await extensionFetchText(url)) as T;
}
