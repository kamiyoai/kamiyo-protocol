import { describe, expect, it } from 'vitest';
import {
  getSapMetadata,
  getSapPricingManifest,
  getSapRegistrationProfile,
  SAP_ALLOWED_TOOL_NAMES,
} from '../sap';

describe('SAP shared profile contract', () => {
  const baseUrl = 'https://api.kamiyo.ai';

  it('keeps metadata and pricing aligned with the registration profile', () => {
    const metadata = getSapMetadata(baseUrl);
    const pricing = getSapPricingManifest(baseUrl);
    const profile = getSapRegistrationProfile(baseUrl);

    expect(metadata.name).toBe(profile.name);
    expect(metadata.description).toBe(profile.description);
    expect(metadata.protocols).toEqual(profile.protocols);
    expect(metadata.capabilities).toEqual(profile.capabilities);
    expect(metadata.endpoints.agentUri).toBe(profile.agentUri);
    expect(metadata.endpoints.execute).toBe(profile.x402Endpoint);
    expect(metadata.pricing).toEqual(pricing);
    expect(metadata.tools.map((tool) => tool.name)).toEqual([...SAP_ALLOWED_TOOL_NAMES]);
  });

  it('publishes per-tool schemas that match the execute request contract', () => {
    const profile = getSapRegistrationProfile(baseUrl);

    for (const tool of profile.tools) {
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            const: tool.name,
          },
          args: expect.any(Object),
        },
        required: ['tool', 'args'],
        additionalProperties: false,
      });
      expect(tool.outputSchema).toEqual(
        getSapMetadata(baseUrl).tools.find((item) => item.name === tool.name)?.outputSchema
      );
    }
  });
});
