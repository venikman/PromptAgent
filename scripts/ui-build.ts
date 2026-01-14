#!/usr/bin/env -S deno run -A
import { Builder } from "@fresh/core/dev";
import { fromFileUrl } from "@std/path";

const uiRootUrl = new URL("../src/ui/", import.meta.url);
const builder = new Builder({ root: uiRootUrl.toString() });

await builder.build({ snapshot: "disk", mode: "production" });

const patchFreshInternalImports = async (fileUrl: URL) => {
  const filePath = fromFileUrl(fileUrl);
  try {
    const contents = await Deno.readTextFile(filePath);
    if (!contents.includes('from "fresh/internal"')) return;
    const updated = contents.replaceAll(
      'from "fresh/internal"',
      'from "@fresh/core/internal"',
    );
    if (updated !== contents) {
      await Deno.writeTextFile(filePath, updated);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
};

const freshRootUrl = new URL("../src/ui/_fresh/", import.meta.url);
for (const fileName of ["snapshot.js", "server.js"]) {
  await patchFreshInternalImports(new URL(fileName, freshRootUrl));
}
