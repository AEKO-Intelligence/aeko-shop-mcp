import { AuthRequiredError } from "./errors.js";

export async function asTextResult(fn: () => Promise<unknown>) {
  try {
    const value = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { content: [{ type: "text" as const, text: `Authorize AEKO Shop first:\n${error.authorizeUrl}` }], isError: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}
