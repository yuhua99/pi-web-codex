import assert from "node:assert/strict";
import test from "node:test";
import extension from "../index.ts";
import { webParameters } from "../schema.ts";

const makeJwt = () => {
  const payload = { "https://api.openai.com/auth": { chatgpt_account_id: "acct_1" } };
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
};

const register = () => {
  let tool;
  extension({ registerTool(definition) { tool = definition; } });
  return tool;
};

const context = ({ auth, model } = {}) => ({
  modelRegistry: {
    getProviderAuth: async () => auth,
    getProvider: () => undefined,
  },
  sessionManager: { getSessionId: () => "session_1" },
  model,
});

const mockFetch = (t, handler) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
};

test("registers the web tool", () => {
  const tool = register();

  assert.equal(tool.name, "web");
  assert.equal(tool.parameters, webParameters);
  assert.equal(tool.promptSnippet, "Search the web, open pages, look up finance, weather, sports, and time");
  assert.equal(tool.promptGuidelines.every((guideline) => guideline.includes("web")), true);
});

test("rejects four search queries without medium or long response_length", async () => {
  await assert.rejects(
    register().execute(
      "call_1",
      { search_query: [{ q: "a" }, { q: "b" }, { q: "c" }, { q: "d" }] },
      undefined,
      undefined,
      context(),
    ),
    /response_length/,
  );
});

test("requires openai-codex auth before fetching", async (t) => {
  let fetched = false;
  mockFetch(t, async () => {
    fetched = true;
    return new Response();
  });

  await assert.rejects(register().execute("call_1", {}, undefined, undefined, context()), /\/login openai-codex/);
  assert.equal(fetched, false);
});

test("returns search output and results", async (t) => {
  let url;
  mockFetch(t, async (requestUrl) => {
    url = requestUrl;
    return new Response(JSON.stringify({ output: "done", results: [{ ref_id: "r1" }] }));
  });

  const result = await register().execute(
    "call_1",
    { search_query: [{ q: "Codex" }] },
    undefined,
    undefined,
    context({ auth: { auth: { apiKey: makeJwt() } } }),
  );

  assert.deepEqual(result.content, [{ type: "text", text: "done" }]);
  assert.deepEqual(result.details, { results: [{ ref_id: "r1" }] });
  assert.equal(url, "https://chatgpt.com/backend-api/codex/alpha/search");
});

test("returns screenshot images in content", async (t) => {
  mockFetch(t, async () => {
    return new Response(
      JSON.stringify({ output: "done", results: [{ mime_type: "image/png", data: "aaaa" }] }),
    );
  });

  const result = await register().execute(
    "call_1",
    { screenshot: [{ ref_id: "https://example.com/a.pdf", pageno: 0 }] },
    undefined,
    undefined,
    context({ auth: { auth: { apiKey: makeJwt() } } }),
  );

  assert.deepEqual(result.content, [
    { type: "text", text: "done" },
    { type: "image", data: "aaaa", mimeType: "image/png" },
  ]);
});

test("uses the Codex fallback model for an anthropic model", async (t) => {
  let authProvider;
  let body;
  mockFetch(t, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ output: "done" }));
  });
  const auth = { auth: { apiKey: makeJwt() } };
  const ctx = context({ auth, model: { provider: "anthropic", id: "claude-sonnet-4" } });
  ctx.modelRegistry.getProviderAuth = async (provider) => {
    authProvider = provider;
    return auth;
  };

  await register().execute("call_1", {}, undefined, undefined, ctx);

  assert.equal(authProvider, "openai-codex");
  assert.equal(body.model, "gpt-5.6-luna");
});

test("uses the active openai-codex model", async (t) => {
  let body;
  mockFetch(t, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ output: "done" }));
  });

  await register().execute(
    "call_1",
    {},
    undefined,
    undefined,
    context({ auth: { auth: { apiKey: makeJwt() } }, model: { provider: "openai-codex", id: "gpt-5.5-codex" } }),
  );

  assert.equal(body.model, "gpt-5.5-codex");
});
