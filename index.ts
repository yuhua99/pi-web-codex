import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { search } from "./client.ts";
import { assertWebParameters, webParameters } from "./schema.ts";

const descriptionIntro = "Access the internet for search, pages, images, finance, weather, sports, and time.";
const usageHints = `## Usage hints

* Use multiple commands and queries in one call to get more results faster.
* Omit \`response_length\` when it would be \`short\`.
* Only write required parameters. Omit empty lists and nulls.
* \`search_query\` must have length at most 4 in each call. If it has length greater than 3, \`response_length\` must be \`medium\` or \`long\`.`;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web",
    label: "web",
    parameters: webParameters,
    promptSnippet: "Search the web, open pages, look up finance, weather, sports, and time",
    description: `${descriptionIntro} Today's date is ${localDate()}.\n\n${usageHints}`,
    promptGuidelines: [
      "Use web when facts may have changed, the user asks to look it up, or a URL is given without contents.",
      "Use multiple web commands in one call.",
      "Cite sources from web with markdown links. Do not expose web ref_ids such as turn0search0 in the final reply.",
    ],
    async execute(_toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
      assertWebParameters(params);
      const auth = await ctx.modelRegistry.getProviderAuth("openai-codex");
      if (!auth?.auth.apiKey) throw new Error("Log in with /login openai-codex");
      const { output, results, images } = await search({
        token: auth.auth.apiKey,
        baseUrl: auth.auth.baseUrl ?? ctx.modelRegistry.getProvider("openai-codex")?.baseUrl,
        id: ctx.sessionManager.getSessionId(),
        model: ctx.model?.provider === "openai-codex" ? ctx.model.id : "gpt-5.6-luna",
        commands: params,
        signal,
      });
      return {
        content: [
          { type: "text", text: output },
          ...images.map((image) => ({ type: "image" as const, data: image.data, mimeType: image.mimeType })),
        ],
        details: results ? { results } : {},
      };
    },
  });
}
