const apiOrigin = process.env.CARENOW_API_URL;

export function getApiOrigin(): string {
  if (!apiOrigin) {
    throw new Error("CARENOW_API_URL is not configured");
  }

  return apiOrigin.replace(/\/$/, "");
}
