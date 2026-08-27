import assert from "node:assert/strict";
import test from "node:test";
import { imagesFromResults, resolveSearchUrl, search } from "../client.ts";

const makeJwt = () => {
  const payload = { "https://api.openai.com/auth": { chatgpt_account_id: "acct_1" } };
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
};

const options = (overrides = {}) => ({
  token: makeJwt(),
  id: "search_1",
  model: "gpt-test",
  commands: { search_query: [{ q: "Codex" }] },
  ...overrides,
});

const mockFetch = (t, handler) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
};

test("uses the default Codex alpha search URL", async (t) => {
  let url;
  mockFetch(t, async (requestUrl) => {
    url = requestUrl;
    return new Response(JSON.stringify({ output: "done" }));
  });

  await search(options());

  assert.equal(url, "https://chatgpt.com/backend-api/codex/alpha/search");
});

test("joins a Codex base URL without duplicating codex", async (t) => {
  let url;
  mockFetch(t, async (requestUrl) => {
    url = requestUrl;
    return new Response(JSON.stringify({ output: "done" }));
  });

  await search(options({ baseUrl: "https://chatgpt.com/backend-api/codex" }));

  assert.equal(url, "https://chatgpt.com/backend-api/codex/alpha/search");
  assert.equal(
    resolveSearchUrl("https://chatgpt.com/backend-api/codex/alpha/search"),
    "https://chatgpt.com/backend-api/codex/alpha/search",
  );
});

test("posts only the Codex search request fields", async (t) => {
  let request;
  mockFetch(t, async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({ output: "done" }));
  });

  await search(options());

  const body = JSON.parse(request.body);
  assert.deepEqual(body, {
    id: "search_1",
    model: "gpt-test",
    commands: { search_query: [{ q: "Codex" }] },
    settings: { allowed_callers: ["direct"], external_web_access: true },
  });
  assert.equal("input" in body, false);
  assert.equal("reasoning" in body, false);
});

test("omits empty command arrays from the request body", async (t) => {
  let request;
  mockFetch(t, async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({ output: "done" }));
  });

  await search(
    options({
      commands: {
        search_query: [{ q: "Codex" }],
        image_query: [],
        open: [{ ref_id: "r1" }],
        click: [],
        find: [],
        screenshot: [],
        finance: [],
        weather: [],
        sports: [],
        time: [],
        response_length: "long",
      },
    }),
  );

  assert.deepEqual(JSON.parse(request.body).commands, {
    search_query: [{ q: "Codex" }],
    open: [{ ref_id: "r1" }],
    response_length: "long",
  });
});

test("sends only the required search headers", async (t) => {
  let headers;
  const token = makeJwt();
  mockFetch(t, async (_url, init) => {
    headers = init.headers;
    return new Response(JSON.stringify({ output: "done" }));
  });

  await search(options({ token }));

  assert.deepEqual(headers, {
    Authorization: `Bearer ${token}`,
    "chatgpt-account-id": "acct_1",
    originator: "codex_cli_rs",
    "content-type": "application/json",
  });
  assert.equal("OpenAI-Beta" in headers, false);
  assert.equal("accept" in headers, false);
  assert.equal("session-id" in headers, false);
});

test("returns output with optional results", async (t) => {
  let responseNumber = 0;
  mockFetch(t, async () => {
    responseNumber++;
    return new Response(
      JSON.stringify(
        responseNumber === 1
          ? { output: "with results", results: [{ ref_id: "r1" }] }
          : { output: "without results" },
      ),
    );
  });

  assert.deepEqual(await search(options()), {
    output: "with results",
    results: [{ ref_id: "r1" }],
    images: [],
  });
  assert.deepEqual(await search(options()), { output: "without results", images: [] });
});

test("extracts inline images from results", () => {
  assert.deepEqual(
    imagesFromResults([
      { mime_type: "image/png", data: "aaaa" },
      { nested: { image_url: "data:image/jpeg;base64,YmJiYg==" } },
      { mime_type: "image/png", data: "aaaa" },
    ]),
    [
      { mimeType: "image/png", data: "aaaa" },
      { mimeType: "image/jpeg", data: "YmJiYg==" },
    ],
  );
  assert.deepEqual(imagesFromResults([{ ref_id: "r1" }]), []);
});

test("skips non-base64 image data", () => {
  assert.deepEqual(
    imagesFromResults([{ mime_type: "image/png", data: "https://example.com/image.png" }]),
    [],
  );
});

test("uses the sibling mime type for data URI image data", () => {
  assert.deepEqual(
    imagesFromResults([{ mime_type: "image/png", data: "data:image/jpeg;base64,WA==" }]),
    [{ mimeType: "image/png", data: "WA==" }],
  );
});

test("extracts multiline data URI images", () => {
  assert.deepEqual(imagesFromResults([{ image_url: "data:image/jpeg;base64,YmJi\nYg==" }]), [
    { mimeType: "image/jpeg", data: "YmJiYg==" },
  ]);
});

test("rejects non-JWT api keys", async () => {
  await assert.rejects(search(options({ token: "api-key" })), {
    message: "Search token must be a JWT with a chatgpt_account_id claim",
  });
});

test("rejects non-JSON success responses", async (t) => {
  mockFetch(t, async () => new Response("not JSON"));

  await assert.rejects(search(options()), { message: "Search response is not valid JSON" });
});

test("rejects malformed success response bodies", async (t) => {
  mockFetch(t, async () => new Response(JSON.stringify({ results: [] })));

  await assert.rejects(search(options()), { message: "Search response is missing output" });
});

test("redacts the token from HTTP errors", async (t) => {
  const token = makeJwt();
  mockFetch(t, async () => new Response(`Unauthorized: ${token}`, { status: 401 }));

  await assert.rejects(search(options({ token })), (error) => {
    assert.match(error.message, /401/);
    assert.equal(error.message.includes(token), false);
    return true;
  });
});

test("passes the provided abort signal to fetch", async (t) => {
  let signal;
  const controller = new AbortController();
  mockFetch(t, async (_url, init) => {
    signal = init.signal;
    return new Response(JSON.stringify({ output: "done" }));
  });

  await search(options({ signal: controller.signal }));

  assert.equal(signal, controller.signal);
});
