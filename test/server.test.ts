import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { PostalKitClient } from "../src/client.js";
import { createServer } from "../src/server.js";

type FakeResponse = { status: number; body: unknown };

const requests: URL[] = [];
let headers: Headers | undefined;

function fakeFetch(responses: FakeResponse[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new URL(String(input)));
    headers = new Headers(init?.headers);
    const next = responses.shift();

    if (!next) {
      throw new TypeError("fetch failed");
    }

    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
}

async function connect(responses: FakeResponse[]): Promise<Client> {
  const api = new PostalKitClient({ apiKey: "test-key", fetch: fakeFetch(responses) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);

  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ type: string; text: string }>)[0].text;
}

afterEach(() => {
  requests.length = 0;
  headers = undefined;
});

describe("postalkit-mcp", () => {
  it("lists every tool as read-only", async () => {
    const client = await connect([]);
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "find_postal_codes_by_place",
      "geocode_postal_code",
      "get_usage",
      "list_municipalities",
      "list_municipality_colonias",
      "list_states",
      "lookup_postal_code",
      "reverse_geocode",
      "search_colonias",
      "search_postal_codes",
      "search_streets",
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("looks up a postal code with the bearer token", async () => {
    const data = { data: { code: "06600", municipality: { name: "Cuauhtémoc" } } };
    const client = await connect([{ status: 200, body: data }]);

    const result = await client.callTool({ name: "lookup_postal_code", arguments: { code: " 06600 " } });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual(data);
    expect(requests[0].href).toBe("https://api.postalkit.mx/v1/postal-codes/06600");
    expect(headers?.get("authorization")).toBe("Bearer test-key");
    expect(headers?.get("user-agent")).toMatch(/^postalkit-mcp\//);
  });

  it("rejects malformed postal codes before calling the API", async () => {
    const client = await connect([]);

    const result = await client.callTool({ name: "lookup_postal_code", arguments: { code: "123" } });

    expect(result.isError).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it.each([
    ["search_postal_codes", { prefix: "066", page: 2 }, "/v1/postal-codes?q=066&page=2"],
    ["find_postal_codes_by_place", { state: "Jalisco", municipality: "Guadalajara", exact: true }, "/v1/postal-codes/search?state=Jalisco&municipality=Guadalajara&exact=true"],
    ["find_postal_codes_by_place", { state: "Jalisco", exact: false }, "/v1/postal-codes/search?state=Jalisco"],
    ["search_colonias", { query: "Roma" }, "/v1/settlements?q=Roma"],
    ["list_states", {}, "/v1/states"],
    ["list_municipalities", { state_id: 9 }, "/v1/states/9/municipalities"],
    ["list_municipalities", { state_code: "09", state_id: 3 }, "/v1/states/by-code/09/municipalities"],
    ["list_municipality_colonias", { municipality_id: 15 }, "/v1/municipalities/15/settlements"],
    ["search_streets", { state_code: "09", municipality_code: "015", query: "Insurgentes", limit: 10 }, "/v1/streets?state_code=09&municipality_code=015&q=Insurgentes&limit=10"],
    ["geocode_postal_code", { code: "06600", street: "Medellín", number: "12" }, "/v1/postal-codes/06600/geocode?street=Medell%C3%ADn&number=12"],
    ["reverse_geocode", { lat: 19.4233, lng: -99.1637 }, "/v1/geocode/reverse?lat=19.4233&lng=-99.1637"],
    ["get_usage", {}, "/v1/account/usage"],
  ])("%s calls the right endpoint", async (name, args, expected) => {
    const client = await connect([{ status: 200, body: { data: [] } }]);

    const result = await client.callTool({ name, arguments: args });

    expect(result.isError).toBeFalsy();
    expect(requests[0].pathname + requests[0].search).toBe(expected);
  });

  it("asks for a state when list_municipalities gets neither id nor code", async () => {
    const client = await connect([]);

    const result = await client.callTool({ name: "list_municipalities", arguments: {} });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("state_id or state_code");
    expect(requests).toHaveLength(0);
  });

  it.each([
    [401, { error: "Unauthenticated", message: "A valid API key is required." }, "POSTALKIT_KEY"],
    [403, { message: "Account suspended." }, "POSTALKIT_KEY"],
    [404, { message: "Postal code '99999' not found." }, "not found"],
    [429, { error: "Too Many Requests", message: "Rate limit exceeded.", retry_after: 1800 }, "monthly quota"],
    [500, "<html>oops</html>", "HTTP 500"],
  ])("returns HTTP %i as a tool error", async (status, body, expected) => {
    const client = await connect([{ status, body }]);

    const result = await client.callTool({ name: "lookup_postal_code", arguments: { code: "99999" } });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain(`HTTP ${status}`);
    expect(text(result)).toContain(expected);
  });

  it("reports network failures as tool errors", async () => {
    const client = await connect([]);

    const result = await client.callTool({ name: "list_states", arguments: {} });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Could not reach the PostalKit API");
  });
});

describe("PostalKitClient", () => {
  it("requires an API key", () => {
    expect(() => new PostalKitClient({ apiKey: " " })).toThrow(/API key is required/);
  });

  it("strips trailing slashes from the base URL", async () => {
    const api = new PostalKitClient({ apiKey: "k", baseUrl: "https://staging.example.test//", fetch: fakeFetch([{ status: 200, body: {} }]) });

    await api.get("/v1/states");

    expect(requests[0].href).toBe("https://staging.example.test/v1/states");
  });
});
