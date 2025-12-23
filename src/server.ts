import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { tools } from './tools/index.js';

// Create MCP Server instance
const server = new McpServer({
  name: 'smart-fs',
  version: '1.0.0',
});

/**
 * Register a tool with the MCP server.
 * Converts ToolDefinition to MCP tool registration format.
 * 
 * @param tool - The tool definition to register
 */
function registerTool(tool: {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (params: Record<string, unknown>) => Promise<string>;
}): void {
  // Create Zod object schema from raw shape for validation
  const zodSchema = z.object(tool.schema);

  // Register the tool with MCP server using registerTool API
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
    },
    async (params, _extra) => {
      try {
        // Validate and parse input using the Zod schema
        const validatedParams = zodSchema.parse(params);
        const result = await tool.handler(validatedParams as Record<string, unknown>);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

// Register all tools from the tools array
for (const tool of tools) {
  registerTool(tool as unknown as {
    name: string;
    description: string;
    schema: z.ZodRawShape;
    handler: (params: Record<string, unknown>) => Promise<string>;
  });
}

// Main entry point
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Smart FS MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
