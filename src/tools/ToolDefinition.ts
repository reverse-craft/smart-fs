import { z } from 'zod';

/**
 * Tool definition interface for MCP tools.
 * Each tool has a name, description, schema (Zod raw shape), and async handler.
 */
export interface ToolDefinition<TSchema extends z.ZodRawShape = z.ZodRawShape> {
  /** Unique tool name (e.g., 'read_code_smart') */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Zod schema object defining input parameters */
  schema: TSchema;
  /** Async handler function that processes the tool request */
  handler: (params: z.infer<z.ZodObject<TSchema>>) => Promise<string>;
}

/**
 * Helper function to create a type-safe tool definition.
 * Validates the tool definition structure at compile time.
 * 
 * @param definition - The tool definition object
 * @returns The same definition with proper typing
 */
export function defineTool<TSchema extends z.ZodRawShape>(
  definition: ToolDefinition<TSchema>
): ToolDefinition<TSchema> {
  return definition;
}
