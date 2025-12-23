import { z } from 'zod';
import { defineTool } from './ToolDefinition.js';
import { applyCustomTransform as runTransform } from '../transformer.js';

/**
 * Schema for apply_custom_transform tool input validation
 */
export const ApplyCustomTransformInputSchema = z.object({
  target_file: z.string().describe('Path to the JavaScript file to transform'),
  script_path: z.string().describe('Path to a JS file exporting a Babel Plugin function'),
  output_suffix: z.string().default('_deob').describe('Suffix for output file name'),
});

/**
 * apply_custom_transform tool definition
 * Apply a custom Babel transformation to deobfuscate JavaScript code.
 */
export const applyCustomTransform = defineTool({
  name: 'apply_custom_transform',
  description:
    'Apply a custom Babel transformation to deobfuscate JavaScript code. ' +
    'Takes a target JS file and a Babel plugin script, runs the transformation, ' +
    'and outputs the deobfuscated code with a cascaded source map that traces back to the original minified file. ' +
    'The plugin script should export a function that returns a Babel visitor object.',
  schema: {
    target_file: z.string().describe('Path to the JavaScript file to transform'),
    script_path: z.string().describe('Path to a JS file exporting a Babel Plugin function'),
    output_suffix: z.string().default('_deob').describe('Suffix for output file name'),
  },
  handler: async (params) => {
    const { target_file, script_path, output_suffix } = params;

    // Call the transform function
    const result = await runTransform(target_file, {
      scriptPath: script_path,
      outputSuffix: output_suffix,
    });

    // Return success message with created file paths
    const successMessage = [
      'Transform completed successfully!',
      '',
      `Output file: ${result.outputPath}`,
      `Source map: ${result.mapPath}`,
    ].join('\n');

    return successMessage;
  },
});
