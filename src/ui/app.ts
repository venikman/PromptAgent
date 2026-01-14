import "./polyfills.ts";
import { App, staticFiles } from "@fresh/core";
import twindConfig from "./twind.config.ts";
import { twindMiddleware } from "./twind_middleware.ts";

export const app = new App()
  .use(staticFiles())
  .use(twindMiddleware(twindConfig))
  .fsRoutes();
