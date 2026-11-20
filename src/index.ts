#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PostalKitClient } from "./client.js";
import { createServer } from "./server.js";

const apiKey = process.env.POSTALKIT_KEY ?? process.env.POSTALKIT_API_KEY ?? "";

if (!apiKey.trim()) {
  console.error("postalkit-mcp: set POSTALKIT_KEY to your PostalKit API key. Get a free one at https://postalkit.mx/register.");
  process.exit(1);
}

const client = new PostalKitClient({
  apiKey,
  baseUrl: process.env.POSTALKIT_BASE,
});

await createServer(client).connect(new StdioServerTransport());
