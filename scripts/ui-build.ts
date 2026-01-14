#!/usr/bin/env -S deno run -A
import { Builder } from "@fresh/core/dev";

const uiRootUrl = new URL("../src/ui/", import.meta.url);
const builder = new Builder({ root: uiRootUrl.toString() });

await builder.build({ snapshot: "disk", mode: "production" });
