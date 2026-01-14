import { virtualSheet } from "twind/sheets";
import { STATE_ELEMENT_ID, STYLE_ELEMENT_ID, setup, type Options } from "./twind_shared.ts";

type MappingState = Array<string | [string, string]>;

type TwindMiddleware = (ctx: { next: () => Promise<Response> }) => Promise<Response>;

const sheet = virtualSheet();

const injectIntoHtml = (html: string, injection: string) => {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${injection}</head>`);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}</body>`);
  }
  return html + injection;
};

export const twindMiddleware = (options: Options): TwindMiddleware => {
  setup(options, sheet);

  return async (ctx) => {
    sheet.reset(undefined);
    const res = await ctx.next();

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return res;
    }

    const html = await res.text();
    const cssTexts = [...sheet.target];
    const snapshot = sheet.reset();
    const precedences = snapshot[1] as number[];

    const cssText = cssTexts.map((cssText, index) => {
      const precedence = precedences[index] ?? 0;
      return `${cssText}/*${precedence.toString(36)}*/`;
    }).join("\n");

    const mappings: MappingState = [];
    for (const [key, value] of (snapshot[3] as Map<string, string>).entries()) {
      mappings.push(key === value ? key : [key, value]);
    }

    const styleTag = `<style id="${STYLE_ELEMENT_ID}">${cssText}</style>`;
    const stateTag =
      `<script id="${STATE_ELEMENT_ID}" type="application/json">${JSON.stringify(mappings)}</script>`;

    const updatedHtml = injectIntoHtml(html, `${styleTag}${stateTag}`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");

    return new Response(updatedHtml, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
};
