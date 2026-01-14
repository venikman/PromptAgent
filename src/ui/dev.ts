#!/usr/bin/env -S deno run -A --watch=static/,routes/,islands/
import { Builder } from "@fresh/core/dev";
import { app } from "./app.ts";

const builder = new Builder({
  root: new URL(".", import.meta.url).toString(),
});

const mode = "production";
app.config.mode = mode;
const applySnapshot = await builder.build({ snapshot: "memory", mode });
applySnapshot(app);

await app.listen({ port: 8000 });
