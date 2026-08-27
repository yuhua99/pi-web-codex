import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

const searchQuery = Type.Object(
  {
    q: Type.String({ description: "Search query." }),
    recency: Type.Optional(
      Type.Integer({ description: "Number of recent days to filter by.", minimum: 0 }),
    ),
    domains: Type.Optional(Type.Array(Type.String(), { description: "Domains to filter by." })),
  },
  { additionalProperties: false },
);

const openOperation = Type.Object(
  {
    ref_id: Type.String({ description: "Reference id or URL to open." }),
    lineno: Type.Optional(
      Type.Integer({ description: "Line number to position the page at.", minimum: 0 }),
    ),
  },
  { additionalProperties: false },
);

const clickOperation = Type.Object(
  {
    ref_id: Type.String({ description: "Reference id containing the numbered link." }),
    id: Type.Integer({ description: "Numbered link id to open.", minimum: 0 }),
  },
  { additionalProperties: false },
);

const findOperation = Type.Object(
  {
    ref_id: Type.String({ description: "Reference id or URL to search within." }),
    pattern: Type.String({ description: "Text pattern to find." }),
  },
  { additionalProperties: false },
);

const screenshotOperation = Type.Object(
  {
    ref_id: Type.String({ description: "Reference id or URL to screenshot." }),
    pageno: Type.Integer({ description: "Zero-indexed PDF page number.", minimum: 0 }),
  },
  { additionalProperties: false },
);

const financeOperation = Type.Object(
  {
    ticker: Type.String({ description: "Ticker symbol to look up." }),
    type: StringEnum(["equity", "fund", "crypto", "index"] as const, {
      description: "Asset type to look up.",
    }),
    market: Type.Optional(
      Type.String({
        description: 'ISO 3166-1 alpha-3 country code, "OTC", or "" for cryptocurrency.',
      }),
    ),
  },
  { additionalProperties: false },
);

const weatherOperation = Type.Object(
  {
    location: Type.String({ description: 'Location in "Country, Area, City" format.' }),
    start: Type.Optional(
      Type.String({ description: "Start date in YYYY-MM-DD format. Defaults to today." }),
    ),
    duration: Type.Optional(
      Type.Integer({ description: "Number of days to return. Defaults to 7.", minimum: 0 }),
    ),
  },
  { additionalProperties: false },
);

const sportsOperation = Type.Object(
  {
    tool: Type.Optional(
      StringEnum(["sports"] as const, { description: "Tool name for sports requests." }),
    ),
    fn: StringEnum(["schedule", "standings"] as const, {
      description: "Sports function to call.",
    }),
    league: StringEnum(
      ["nba", "wnba", "nfl", "nhl", "mlb", "epl", "ncaamb", "ncaawb", "ipl"] as const,
      { description: "League to look up." },
    ),
    team: Type.Optional(
      Type.String({
        description: "Team to look up, using the common 3 or 4 letter alias used in broadcasts.",
      }),
    ),
    opponent: Type.Optional(
      Type.String({ description: "Opponent to use with `team` when narrowing the lookup." }),
    ),
    date_from: Type.Optional(Type.String({ description: "Start date in YYYY-MM-DD format." })),
    date_to: Type.Optional(Type.String({ description: "End date in YYYY-MM-DD format." })),
    num_games: Type.Optional(
      Type.Integer({ description: "Number of games to return.", minimum: 0 }),
    ),
    locale: Type.Optional(Type.String({ description: "Locale for the lookup." })),
  },
  { additionalProperties: false },
);

const timeOperation = Type.Object(
  {
    utc_offset: Type.String({ description: 'UTC offset formatted like "+03:00".' }),
  },
  { additionalProperties: false },
);

export const webParameters = Type.Object(
  {
    search_query: Type.Optional(
      Type.Array(searchQuery, {
        description: "Query the internet search engine for a given list of queries.",
        maxItems: 4,
      }),
    ),
    image_query: Type.Optional(
      Type.Array(searchQuery, {
        description: "Query the image search engine for a given list of queries.",
      }),
    ),
    open: Type.Optional(
      Type.Array(openOperation, { description: "Open pages by reference id or URL." }),
    ),
    click: Type.Optional(
      Type.Array(clickOperation, { description: "Open links from previously opened pages." }),
    ),
    find: Type.Optional(Type.Array(findOperation, { description: "Find text patterns in pages." })),
    screenshot: Type.Optional(
      Type.Array(screenshotOperation, { description: "Take screenshots of PDF pages." }),
    ),
    finance: Type.Optional(
      Type.Array(financeOperation, { description: "Look up prices for the given stock symbols." }),
    ),
    weather: Type.Optional(
      Type.Array(weatherOperation, { description: "Look up weather forecasts." }),
    ),
    sports: Type.Optional(
      Type.Array(sportsOperation, { description: "Look up sports schedules and standings." }),
    ),
    time: Type.Optional(
      Type.Array(timeOperation, { description: "Get time for the given UTC offsets." }),
    ),
    response_length: Type.Optional(
      StringEnum(["short", "medium", "long"] as const, {
        description: "Set the length of the response to be returned.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type WebParameters = Static<typeof webParameters>;

export function assertWebParameters(commands: WebParameters) {
  const tooManyQueries = (commands.search_query?.length ?? 0) > 3;
  const shortResponse =
    commands.response_length !== "medium" && commands.response_length !== "long";
  if (tooManyQueries && shortResponse) {
    throw new Error("search_query length greater than 3 requires response_length medium or long");
  }
}
