import { pathToFileURL } from "node:url";
import { projectEnvironment } from "./local-config.mjs";

export async function waitForApi(
  url,
  { request = fetch, timeoutMs = 30000, retryMs = 200 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await request(url, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(1000, deadline - Date.now())),
        ),
      });
      if (response.ok && (await response.json()).ok === true) return;
    } catch {}
    const remaining = deadline - Date.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(retryMs, remaining)),
      );
  }
  throw new Error(
    `API not ready at ${url}. Check the [api] startup output; the website has not been started.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(projectEnvironment().PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  console.log("Waiting for the API before starting the website…");
  try {
    await waitForApi(`http://127.0.0.1:${port}/api/health`);
    console.log("API ready. Starting the website.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
