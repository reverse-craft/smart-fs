/**
 * Tool aggregation module
 * Collects all tool definitions and exports them as a unified array.
 */

import { readCodeSmart } from './readCodeSmart.js';
import { applyCustomTransform, ApplyCustomTransformInputSchema } from './applyCustomTransform.js';
import { searchCodeSmart, SearchCodeSmartInputSchema } from './searchCodeSmart.js';
import { findUsageSmart, FindUsageSmartInputSchema } from './findUsageSmart.js';

/**
 * Array of all available MCP tool definitions.
 * To add a new tool:
 * 1. Create a new tool module in src/tools/
 * 2. Import it here
 * 3. Add it to this array
 */
export const tools = [
  readCodeSmart,
  applyCustomTransform,
  searchCodeSmart,
  findUsageSmart,
] as const;

// Re-export ToolDefinition interface and defineTool helper
export { ToolDefinition, defineTool } from './ToolDefinition.js';

// Re-export input schemas for testing
export { ApplyCustomTransformInputSchema, SearchCodeSmartInputSchema, FindUsageSmartInputSchema };
