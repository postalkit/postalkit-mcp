import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PostalKitClient, PostalKitError, VERSION, segment, type Query } from "./client.js";

const readOnly = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;

const postalCode = z
  .string()
  .regex(/^\s*\d{5}\s*$/, "A Mexican postal code is exactly 5 digits, e.g. 06600.")
  .describe("Five-digit Mexican postal code (código postal), e.g. 06600");

const page = z.number().int().min(1).optional().describe("Page number for paginated results (default 1)");

/** Build the PostalKit MCP server around an API client. */
export function createServer(client: PostalKitClient): McpServer {
  const server = new McpServer(
    { name: "postalkit", title: "PostalKit: Mexican postal codes", version: VERSION },
    {
      instructions:
        "Tools for Mexican address data from the official SEPOMEX catalog, served by the PostalKit API (https://postalkit.mx). " +
        "Use lookup_postal_code when you have a 5-digit código postal. Use search_colonias or find_postal_codes_by_place when you only have place names. " +
        "Each call counts against the user's PostalKit monthly quota, so avoid unnecessary repeated calls.",
    },
  );

  const call = async (path: string, query: Query = {}): Promise<CallToolResult> => {
    try {
      const body = await client.get(path, query);

      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    } catch (error) {
      if (error instanceof PostalKitError) {
        const hint =
          error.status === 401 || error.status === 403
            ? " Check the POSTALKIT_KEY environment variable (get a key at https://postalkit.mx/dashboard)."
            : error.status === 429
              ? " The PostalKit rate limit or monthly quota was reached (see https://postalkit.mx/precios)."
              : "";

        return {
          isError: true,
          content: [{ type: "text", text: `PostalKit error (HTTP ${error.status}): ${error.message}${hint}` }],
        };
      }

      throw error;
    }
  };

  server.registerTool(
    "lookup_postal_code",
    {
      title: "Look up a postal code",
      description:
        "Get the state (estado), municipality (municipio/alcaldía), city and every colonia (settlement) for one Mexican postal code.",
      inputSchema: { code: postalCode },
      annotations: readOnly,
    },
    ({ code }) => call(`v1/postal-codes/${segment(code)}`),
  );

  server.registerTool(
    "search_postal_codes",
    {
      title: "Search postal codes by prefix",
      description: "List Mexican postal codes that start with a prefix, e.g. '066' for the codes around Colonia Roma in CDMX.",
      inputSchema: {
        prefix: z.string().regex(/^\d{1,5}$/, "Digits only, 1 to 5 of them.").describe("Leading digits of the postal code"),
        page,
      },
      annotations: readOnly,
    },
    ({ prefix, page }) => call("v1/postal-codes", { q: prefix, page }),
  );

  server.registerTool(
    "find_postal_codes_by_place",
    {
      title: "Find postal codes by place name",
      description:
        "Find the postal codes for a state, optionally narrowed by municipality and colonia names. Use this when the user knows the address but not the código postal.",
      inputSchema: {
        state: z.string().min(2).describe("State name, e.g. 'Jalisco' or 'Ciudad de México'"),
        municipality: z.string().min(2).optional().describe("Municipality or alcaldía name, e.g. 'Guadalajara'"),
        colonia: z.string().min(2).optional().describe("Colonia (settlement) name, e.g. 'Americana'"),
        exact: z.boolean().optional().describe("Match names exactly instead of partially"),
        page,
      },
      annotations: readOnly,
    },
    ({ state, municipality, colonia, exact, page }) =>
      call("v1/postal-codes/search", { state, municipality, colonia, exact: exact ? "true" : undefined, page }),
  );

  server.registerTool(
    "search_colonias",
    {
      title: "Search colonias",
      description: "Search Mexican colonias (settlements) by name across the country. Each result includes its postal code, municipality and state.",
      inputSchema: {
        query: z.string().min(2).describe("Part of the colonia name, at least 2 characters"),
        page,
      },
      annotations: readOnly,
    },
    ({ query, page }) => call("v1/settlements", { q: query, page }),
  );

  server.registerTool(
    "list_states",
    {
      title: "List states",
      description: "List Mexico's 32 states with their PostalKit IDs and two-digit INEGI codes.",
      annotations: readOnly,
    },
    () => call("v1/states"),
  );

  server.registerTool(
    "list_municipalities",
    {
      title: "List municipalities of a state",
      description: "List the municipalities (municipios, or alcaldías in CDMX) of a state, by PostalKit state ID or two-digit INEGI state code.",
      inputSchema: {
        state_id: z.number().int().positive().optional().describe("PostalKit state ID from list_states"),
        state_code: z.string().regex(/^\d{2}$/).optional().describe("Two-digit INEGI state code, e.g. '09' for Ciudad de México"),
      },
      annotations: readOnly,
    },
    async ({ state_id, state_code }) => {
      if (state_code) {
        return call(`v1/states/by-code/${segment(state_code)}/municipalities`);
      }

      if (state_id) {
        return call(`v1/states/${state_id}/municipalities`);
      }

      return { isError: true, content: [{ type: "text", text: "Pass either state_id or state_code." }] };
    },
  );

  server.registerTool(
    "list_municipality_colonias",
    {
      title: "List colonias of a municipality",
      description: "List every colonia (settlement) in a municipality, by PostalKit municipality ID.",
      inputSchema: {
        municipality_id: z.number().int().positive().describe("PostalKit municipality ID from list_municipalities"),
        page,
      },
      annotations: readOnly,
    },
    ({ municipality_id, page }) => call(`v1/municipalities/${municipality_id}/settlements`, { page }),
  );

  server.registerTool(
    "search_streets",
    {
      title: "Search streets",
      description: "Search the streets of a municipality by INEGI state and municipality codes, optionally filtered by name.",
      inputSchema: {
        state_code: z.string().regex(/^\d{2}$/).describe("Two-digit INEGI state code, e.g. '09'"),
        municipality_code: z.string().regex(/^\d{3}$/).describe("Three-digit INEGI municipality code, e.g. '015'"),
        query: z.string().min(2).optional().describe("Part of the street name"),
        locality_code: z.string().optional().describe("INEGI locality code"),
        limit: z.number().int().min(1).max(100).optional().describe("Results per page"),
        page,
      },
      annotations: readOnly,
    },
    ({ state_code, municipality_code, query, locality_code, limit, page }) =>
      call("v1/streets", { state_code, municipality_code, q: query, locality_code, limit, page }),
  );

  server.registerTool(
    "geocode_postal_code",
    {
      title: "Geocode a postal code",
      description: "Get latitude and longitude for a postal code, optionally refined with a street name and number.",
      inputSchema: {
        code: postalCode,
        street: z.string().optional().describe("Street name"),
        number: z.string().optional().describe("Street number"),
      },
      annotations: readOnly,
    },
    ({ code, street, number }) => call(`v1/postal-codes/${segment(code)}/geocode`, { street, number }),
  );

  server.registerTool(
    "reverse_geocode",
    {
      title: "Reverse geocode",
      description: "Find the nearest Mexican postal code (with its colonias, municipality and state) to a latitude/longitude.",
      inputSchema: {
        lat: z.number().min(-90).max(90).describe("Latitude, e.g. 19.4233"),
        lng: z.number().min(-180).max(180).describe("Longitude, e.g. -99.1637"),
      },
      annotations: readOnly,
    },
    ({ lat, lng }) => call("v1/geocode/reverse", { lat, lng }),
  );

  server.registerTool(
    "get_usage",
    {
      title: "Get API usage",
      description: "Show the PostalKit plan, monthly request limit and requests used this period.",
      annotations: readOnly,
    },
    () => call("v1/account/usage"),
  );

  return server;
}
