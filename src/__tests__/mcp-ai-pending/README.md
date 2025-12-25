# MCP/AI Pending Tests

These test files are temporarily moved here because they depend on MCP tools (`zod` package) or AI tools that will be migrated to separate packages:

- `aiFindJsvmpDispatcher.test.ts` → Will move to `ai-tools` package (Task 11)
- `detectJsvmp.property.test.ts` → Will move to `ai-tools` package (Task 11)
- `formatCode.property.test.ts` → Will move to `ai-tools` package (Task 11)
- `schema.property.test.ts` → Will move to `smart-fs-mcp` package (Task 10)
- `transformer.test.ts` → Will move to `smart-fs-mcp` package (Task 10)

These tests import from `src/tools/` directory which depends on `zod`, but `zod` is not a dependency of the core `smart-fs` library.

Once Tasks 10-12 are completed, these tests should be migrated to their respective packages.
