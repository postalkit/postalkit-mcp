# PostalKit MCP server

[![npm](https://img.shields.io/npm/v/postalkit-mcp.svg)](https://www.npmjs.com/package/postalkit-mcp)
[![tests](https://github.com/postalkit/postalkit-mcp/actions/workflows/tests.yml/badge.svg)](https://github.com/postalkit/postalkit-mcp/actions/workflows/tests.yml)

An [MCP](https://modelcontextprotocol.io) server that gives Claude, Cursor, VS Code and other AI assistants accurate Mexican address data: postal codes (códigos postales), colonias, municipalities, states, streets and geocoding, from the official SEPOMEX catalog via the [PostalKit API](https://postalkit.mx/).

> **Español:** servidor MCP para consultar códigos postales, colonias, municipios y estados de México desde Claude, Cursor y otros asistentes de IA, con datos oficiales de SEPOMEX a través de la [API de PostalKit](https://postalkit.mx/).

Ask things like:

- "¿Qué colonias tiene el código postal 06600?"
- "What's the postal code for Colonia Americana in Guadalajara?"
- "Validate these 200 shipping addresses and flag any postal code that doesn't match its colonia."
- "Which postal code is closest to 19.4233, -99.1637?"

## Get an API key

Create a free account at [postalkit.mx](https://postalkit.mx/register) (100 requests/month on the free plan) and copy your key from the dashboard.

## Install

### Claude Code

```bash
claude mcp add postalkit --env POSTALKIT_KEY=your-api-key -- npx -y postalkit-mcp
```

### Claude Desktop, Cursor, Windsurf, VS Code and other clients

Add this to your client's MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "postalkit": {
      "command": "npx",
      "args": ["-y", "postalkit-mcp"],
      "env": {
        "POSTALKIT_KEY": "your-api-key"
      }
    }
  }
}
```

Requires Node.js 20 or newer.

## Tools

All tools are read-only.

| Tool | What it does |
| --- | --- |
| `lookup_postal_code` | State, municipality, city and every colonia for a 5-digit postal code |
| `search_postal_codes` | Postal codes that start with a prefix |
| `find_postal_codes_by_place` | Postal codes for a state, municipality and/or colonia name |
| `search_colonias` | Colonias by name, nationwide |
| `list_states` | The 32 states with INEGI codes |
| `list_municipalities` | Municipalities of a state, by ID or INEGI code |
| `list_municipality_colonias` | Every colonia in a municipality |
| `search_streets` | Streets of a municipality, by name |
| `geocode_postal_code` | Latitude/longitude for a postal code (optionally street and number) |
| `reverse_geocode` | Nearest postal code to a coordinate |
| `get_usage` | Your plan, monthly limit and requests used |

Each tool call is one API request against your PostalKit quota.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `POSTALKIT_KEY` | (required) | Your API key (`POSTALKIT_API_KEY` also works) |
| `POSTALKIT_BASE` | `https://api.postalkit.mx` | API base URL |

## Development

```bash
npm install
npm test          # unit tests, no network
npm run build
npm run inspector # try the tools in the MCP Inspector
```

## Links

- Website: [postalkit.mx](https://postalkit.mx/)
- API reference: [postalkit.mx/docs](https://postalkit.mx/docs)
- PHP / Laravel SDK: [postalkit-php](https://github.com/postalkit/postalkit-php)

## License

MIT
