import assert from "node:assert/strict";
import test from "node:test";
import { assertWebParameters, webParameters } from "../schema.ts";

const commandNames = [
  "search_query",
  "image_query",
  "open",
  "click",
  "find",
  "screenshot",
  "finance",
  "weather",
  "sports",
  "time",
  "response_length",
];

const operationSchema = (name) => webParameters.properties[name].items;

test("defines only SearchCommands fields", () => {
  assert.deepEqual(Object.keys(webParameters.properties), commandNames);
  assert.equal(webParameters.additionalProperties, false);
  for (const name of ["id", "model", "input", "settings", "commands"]) {
    assert.equal(name in webParameters.properties, false);
  }
});

test("keeps response_length alongside commands", () => {
  assert.equal(webParameters.properties.response_length.enum.includes("short"), true);
  assert.equal("options" in webParameters.properties, false);
  assert.equal("response_length" in webParameters.properties.search_query.items.properties, false);
});

test("uses the Codex command enum values", () => {
  assert.deepEqual(webParameters.properties.response_length.enum, ["short", "medium", "long"]);
  assert.deepEqual(operationSchema("finance").properties.type.enum, ["equity", "fund", "crypto", "index"]);
  assert.deepEqual(operationSchema("sports").properties.tool.enum, ["sports"]);
  assert.deepEqual(operationSchema("sports").properties.fn.enum, ["schedule", "standings"]);
  assert.deepEqual(operationSchema("sports").properties.league.enum, [
    "nba",
    "wnba",
    "nfl",
    "nhl",
    "mlb",
    "epl",
    "ncaamb",
    "ncaawb",
    "ipl",
  ]);
});

test("disallows additional properties on every command object", () => {
  assert.equal(operationSchema("search_query").additionalProperties, false);
  assert.equal(operationSchema("image_query").additionalProperties, false);
  for (const name of ["open", "click", "find", "screenshot", "finance", "weather", "sports", "time"]) {
    assert.equal(operationSchema(name).additionalProperties, false);
  }
});

test("caps search_query at 4 and integers at 0", () => {
  assert.equal(webParameters.properties.search_query.maxItems, 4);
  assert.equal(operationSchema("search_query").properties.recency.minimum, 0);
  assert.equal(operationSchema("open").properties.lineno.minimum, 0);
  assert.equal(operationSchema("click").properties.id.minimum, 0);
  assert.equal(operationSchema("screenshot").properties.pageno.minimum, 0);
  assert.equal(operationSchema("weather").properties.duration.minimum, 0);
  assert.equal(operationSchema("sports").properties.num_games.minimum, 0);
});

test("requires medium or long response_length for 4 search queries", () => {
  assert.doesNotThrow(() => assertWebParameters({ search_query: [{ q: "a" }, { q: "b" }, { q: "c" }] }));
  assert.doesNotThrow(() =>
    assertWebParameters({
      search_query: [{ q: "a" }, { q: "b" }, { q: "c" }, { q: "d" }],
      response_length: "medium",
    }),
  );
  assert.throws(
    () => assertWebParameters({ search_query: [{ q: "a" }, { q: "b" }, { q: "c" }, { q: "d" }] }),
    /response_length/,
  );
});

test("requires the Rust struct required fields", () => {
  assert.deepEqual(operationSchema("search_query").required, ["q"]);
  assert.deepEqual(operationSchema("image_query").required, ["q"]);
  assert.deepEqual(operationSchema("open").required, ["ref_id"]);
  assert.deepEqual(operationSchema("click").required, ["ref_id", "id"]);
  assert.deepEqual(operationSchema("find").required, ["ref_id", "pattern"]);
  assert.deepEqual(operationSchema("screenshot").required, ["ref_id", "pageno"]);
  assert.deepEqual(operationSchema("finance").required, ["ticker", "type"]);
  assert.deepEqual(operationSchema("weather").required, ["location"]);
  assert.deepEqual(operationSchema("sports").required, ["fn", "league"]);
  assert.deepEqual(operationSchema("time").required, ["utc_offset"]);
});
