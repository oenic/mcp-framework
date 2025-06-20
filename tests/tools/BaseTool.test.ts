import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CreateMessageRequest, CreateMessageResult, ElicitRequest, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import {RequestOptions} from '@modelcontextprotocol/sdk/shared/protocol.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    elicitInput: jest.fn(),
  })),
}));

describe('BaseTool', () => {
  describe('Legacy Pattern (Separate Schema Definition)', () => {
    interface TestToolInput {
      message: string;
      count?: number;
    }

    class TestTool extends MCPTool<TestToolInput> {
      name = 'test_tool';
      description = 'A tool for testing BaseTool functionality';

      protected schema = {
        message: {
          type: z.string(),
          description: 'Test message parameter',
        },
        count: {
          type: z.number().optional(),
          description: 'Optional count parameter',
        },
      };

      protected async execute(input: TestToolInput): Promise<unknown> {
        return {
          received: input.message,
          count: input.count ?? 0,
        };
      }
    }

    let testTool: TestTool;

    beforeEach(() => {
      testTool = new TestTool();
    });

    describe('toolDefinition', () => {
      it('should generate correct tool definition', () => {
        const definition = testTool.toolDefinition;

        expect(definition).toEqual({
          name: 'test_tool',
          description: 'A tool for testing BaseTool functionality',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message parameter',
              },
              count: {
                type: 'number',
                description: 'Optional count parameter',
              },
            },
            required: ['message'],
          },
        });
      });
    });

    describe('toolCall', () => {
      it('should execute successfully with valid input', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
            arguments: {
              message: 'Hello, World!',
              count: 42,
            },
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toEqual({
          type: 'text',
          text: '{"received":"Hello, World!","count":42}',
        });
      });

      it('should handle optional parameters', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
            arguments: {
              message: 'Test without count',
            },
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toEqual({
          type: 'text',
          text: '{"received":"Test without count","count":0}',
        });
      });

      it('should return error response for invalid input', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
            arguments: {
              count: 10,
            },
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('error');
        expect((response.content[0] as any).text).toContain('Required');
      });

      it('should handle empty arguments', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('error');
      });
    });

    describe('inputSchema', () => {
      it('should correctly identify required fields', () => {
        const { required } = testTool.inputSchema;
        expect(required).toEqual(['message']);
      });

      it('should include all defined properties', () => {
        const { properties } = testTool.inputSchema;
        expect(Object.keys(properties!)).toEqual(['message', 'count']);
      });
    });
  });

  describe('Zod Object Pattern (Direct Schema Definition)', () => {
    const FindProductsInput = z.object({
      query: z.string().optional().describe('The search query string.'),
      first: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe('Number of products per page.'),
      after: z
        .string()
        .optional()
        .describe('Cursor for pagination (from previous pageInfo.endCursor).'),
      sortKey: z
        .enum([
          'RELEVANCE',
          'TITLE',
          'PRICE',
          'CREATED_AT',
          'UPDATED_AT',
          'BEST_SELLING',
          'PRODUCT_TYPE',
          'VENDOR',
        ])
        .optional()
        .default('RELEVANCE')
        .describe(
          'Sort by relevance, title, price, created at, updated at, best selling, product type, or vendor.'
        ),
      reverse: z.boolean().optional().default(false).describe('Reverse the sort order.'),
    });

    type FindProductsInput = z.infer<typeof FindProductsInput>;

    class FindProductsTool extends MCPTool<FindProductsInput, typeof FindProductsInput> {
      name = 'find_products';
      description = 'Search for products in the catalog';
      schema = FindProductsInput;

      protected async execute(input: FindProductsInput): Promise<unknown> {
        return {
          query: input.query,
          first: input.first,
          after: input.after,
          sortKey: input.sortKey,
          reverse: input.reverse,
        };
      }
    }

    let findProductsTool: FindProductsTool;

    beforeEach(() => {
      findProductsTool = new FindProductsTool();
    });

    it('should generate correct tool definition from complex Zod schema', () => {
      const definition = findProductsTool.toolDefinition;

      expect(definition.name).toBe('find_products');
      expect(definition.description).toBe('Search for products in the catalog');
      expect(definition.inputSchema.type).toBe('object');
      expect(definition.inputSchema.properties).toBeDefined();
      expect(definition.inputSchema.required).toEqual([]);
    });

    it('should extract descriptions from Zod schema', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.query as any).description).toBe('The search query string.');
      expect((properties!.first as any).description).toBe('Number of products per page.');
      expect((properties!.after as any).description).toBe(
        'Cursor for pagination (from previous pageInfo.endCursor).'
      );
      expect((properties!.sortKey as any).description).toContain('Sort by relevance');
      expect((properties!.reverse as any).description).toBe('Reverse the sort order.');
    });

    it('should handle default values correctly', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.first as any).default).toBe(10);
      expect((properties!.sortKey as any).default).toBe('RELEVANCE');
      expect((properties!.reverse as any).default).toBe(false);
    });

    it('should handle enum types correctly', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.sortKey as any).type).toBe('string');
      expect((properties!.sortKey as any).enum).toEqual([
        'RELEVANCE',
        'TITLE',
        'PRICE',
        'CREATED_AT',
        'UPDATED_AT',
        'BEST_SELLING',
        'PRODUCT_TYPE',
        'VENDOR',
      ]);
    });

    it('should handle number constraints', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.first as any).type).toBe('integer');
      expect((properties!.first as any).minimum).toBe(1);
    });

    it('should validate input using the Zod schema', async () => {
      const validInput = {
        query: 'laptop',
        first: 20,
        sortKey: 'PRICE' as const,
        reverse: true,
      };

      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: validInput,
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      const result = JSON.parse((response.content[0] as any).text);
      expect(result.query).toBe('laptop');
      expect(result.first).toBe(20);
      expect(result.sortKey).toBe('PRICE');
      expect(result.reverse).toBe(true);
    });

    it('should use default values when fields are not provided', async () => {
      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: {},
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      const result = JSON.parse((response.content[0] as any).text);
      expect(result.first).toBe(10);
      expect(result.sortKey).toBe('RELEVANCE');
      expect(result.reverse).toBe(false);
    });

    it('should reject invalid enum values', async () => {
      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: {
            sortKey: 'INVALID_SORT_KEY',
          },
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('error');
    });

    it('should reject negative numbers for positive constraints', async () => {
      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: {
            first: -5,
          },
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('error');
    });
  });

  describe('JSON Schema Type Generation', () => {
    let comprehensiveTool: ComprehensiveTool;

    interface ComprehensiveToolInput {
      stringField: string;
      numberField: number;
      booleanField: boolean;
      arrayField: string[];
      objectField: { key: string };
      optionalString?: string;
      optionalNumber?: number;
    }

    class ComprehensiveTool extends MCPTool<ComprehensiveToolInput> {
      name = 'comprehensive_tool';
      description = 'A tool for testing all schema types';

      protected schema = {
        stringField: {
          type: z.string(),
          description: 'String field',
        },
        numberField: {
          type: z.number(),
          description: 'Number field',
        },
        booleanField: {
          type: z.boolean(),
          description: 'Boolean field',
        },
        arrayField: {
          type: z.array(z.string()),
          description: 'Array field',
        },
        objectField: {
          type: z.object({ key: z.string() }),
          description: 'Object field',
        },
        optionalString: {
          type: z.string().optional(),
          description: 'Optional string field',
        },
        optionalNumber: {
          type: z.number().optional(),
          description: 'Optional number field',
        },
      };

      protected async execute(input: ComprehensiveToolInput): Promise<unknown> {
        return { processed: true, input };
      }
    }

    beforeEach(() => {
      comprehensiveTool = new ComprehensiveTool();
    });

    it('should correctly map Zod types to JSON schema types', () => {
      const { properties } = comprehensiveTool.inputSchema;

      expect(properties).toBeDefined();
      expect(properties!.stringField).toEqual({
        type: 'string',
        description: 'String field',
      });
      expect(properties!.numberField).toEqual({
        type: 'number',
        description: 'Number field',
      });
      expect(properties!.booleanField).toEqual({
        type: 'boolean',
        description: 'Boolean field',
      });
      expect(properties!.arrayField).toEqual({
        type: 'array',
        description: 'Array field',
      });
      expect(properties!.objectField).toEqual({
        type: 'object',
        description: 'Object field',
      });
    });

    it('should correctly handle optional types', () => {
      const { properties, required } = comprehensiveTool.inputSchema;

      expect(properties!.optionalString).toEqual({
        type: 'string',
        description: 'Optional string field',
      });
      expect(properties!.optionalNumber).toEqual({
        type: 'number',
        description: 'Optional number field',
      });

      expect(required).toEqual([
        'stringField',
        'numberField',
        'booleanField',
        'arrayField',
        'objectField',
      ]);
      expect(required).not.toContain('optionalString');
      expect(required).not.toContain('optionalNumber');
    });

    it('should specifically verify number types are not strings', () => {
      const { properties } = comprehensiveTool.inputSchema;

      expect((properties!.numberField as any).type).toBe('number');
      expect((properties!.numberField as any).type).not.toBe('string');
      expect((properties!.optionalNumber as any).type).toBe('number');
      expect((properties!.optionalNumber as any).type).not.toBe('string');
    });

    it('should generate MCP-compliant tool definition with correct number types', () => {
      interface NumberTestInput {
        age: number;
        price: number;
        weight?: number;
      }

      class NumberTestTool extends MCPTool<NumberTestInput> {
        name = 'number_test_tool';
        description = 'Tool for testing number parameter types in MCP clients';

        protected schema = {
          age: {
            type: z.number().int().positive(),
            description: 'Age in years (positive integer)',
          },
          price: {
            type: z.number().positive(),
            description: 'Price in dollars (positive number)',
          },
          weight: {
            type: z.number().optional(),
            description: 'Weight in kg (optional)',
          },
        };

        protected async execute(input: NumberTestInput): Promise<unknown> {
          return { received: input };
        }
      }

      const tool = new NumberTestTool();
      const definition = tool.toolDefinition;

      expect(definition).toHaveProperty('name', 'number_test_tool');
      expect(definition).toHaveProperty('description');
      expect(definition).toHaveProperty('inputSchema');
      expect(definition.inputSchema).toHaveProperty('type', 'object');
      expect(definition.inputSchema).toHaveProperty('properties');
      expect(definition.inputSchema).toHaveProperty('required');

      const { properties, required } = definition.inputSchema;

      expect((properties!.age as any).type).toBe('number');
      expect((properties!.price as any).type).toBe('number');
      expect((properties!.weight as any).type).toBe('number');

      expect(required).toContain('age');
      expect(required).toContain('price');
      expect(required).not.toContain('weight');

      console.log('MCP Tool Definition for client debugging:');
      console.log(JSON.stringify(definition, null, 2));
    });
  });
  describe('Sampling Functionality', () => {
    // Common test objects
    const MOCK_SAMPLING_RESULT: CreateMessageResult = {
      model: 'test-model',
      role: 'assistant',
      content: { type: 'text', text: 'Sampled response' },
    };

    const BASIC_SAMPLING_REQUEST: CreateMessageRequest['params'] = {
      messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
      maxTokens: 100,
      temperature: 0.7,
      systemPrompt: 'Be helpful',
    };

    const COMPLEX_SAMPLING_REQUEST: CreateMessageRequest['params'] = {
      messages: [
        { role: 'user', content: { type: 'text', text: 'First message' } },
        { role: 'assistant', content: { type: 'text', text: 'Assistant response' } },
        { role: 'user', content: { type: 'text', text: 'Follow up' } },
      ],
      maxTokens: 500,
      temperature: 0.8,
      systemPrompt: 'You are a helpful assistant',
      includeContext: 'thisServer',
      modelPreferences: {
        hints: [{ name: 'claude-3' }],
        costPriority: 0.3,
        speedPriority: 0.7,
        intelligencePriority: 0.9,
      },
      stopSequences: ['END', 'STOP'],
      metadata: { taskType: 'analysis' },
    };

    const SAMPLING_REQUEST_OPTIONS: RequestOptions = {
      timeout: 5000,
      maxTotalTimeout: 10000,
      signal: new AbortController().signal,
      resetTimeoutOnProgress: true,
      onprogress: (progress) => {
        console.log('Progress:', progress);
      },
    };

    class SamplingTool extends MCPTool {
      name = 'sampling_tool';
      description = 'A tool that uses sampling';
      schema = z.object({
        prompt: z.string().describe('The prompt to sample'),
      });

      protected async execute(input: { prompt: string }): Promise<unknown> {
        const result = await this.samplingRequest({
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: input.prompt,
              },
            },
          ],
          maxTokens: 100,
        });

        return { sampledText: result.content.text };
      }
    }

    let samplingTool: SamplingTool;
    let mockServer: jest.Mocked<Server>;
    beforeEach(() => {
      samplingTool = new SamplingTool();
      mockServer = new Server(
        { name: 'test-server', version: '1.0.0' },
        { capabilities: {} }
      ) as jest.Mocked<Server>;
      mockServer.createMessage = jest.fn();
    });

    describe('Server Injection', () => {
      it('should allow server injection', () => {
        expect(() => samplingTool.injectServer(mockServer)).not.toThrow();
      });

      it('should prevent double injection', () => {
        samplingTool.injectServer(mockServer);
        expect(() => samplingTool.injectServer(mockServer)).toThrow(
          "Server reference has already been injected into 'sampling_tool' tool."
        );
      });
      
      it('should throw error when sampling without server injection', async () => {
        await expect(
          samplingTool.samplingRequest({
            messages: [{ role: 'user', content: { type: 'text', text: 'test' } }],
            maxTokens: 100,
          })
        ).rejects.toThrow("Server reference has not been injected into 'sampling_tool' tool.");
      });
    });

    describe('Sampling Requests', () => {
      beforeEach(() => {
        samplingTool.injectServer(mockServer);
      });

      it('should make sampling requests with correct parameters', async () => {
        mockServer.createMessage.mockResolvedValue(MOCK_SAMPLING_RESULT);

        const result = await samplingTool.samplingRequest(BASIC_SAMPLING_REQUEST);

        expect(mockServer.createMessage).toHaveBeenCalledWith(BASIC_SAMPLING_REQUEST, undefined);
        expect(result).toEqual(MOCK_SAMPLING_RESULT);
      });

      it('should handle sampling errors gracefully', async () => {
        mockServer.createMessage.mockRejectedValue(new Error('Sampling failed'));

        await expect(
          samplingTool.samplingRequest({
            messages: [{ role: 'user', content: { type: 'text', text: 'test' } }],
            maxTokens: 100,
          })
        ).rejects.toThrow('Sampling failed');
      });

      it('should support complex sampling requests with all parameters', async () => {
        const complexMockResult: CreateMessageResult = {
          model: 'claude-3-sonnet',
          role: 'assistant',
          content: { type: 'text', text: 'Complex response' },
          stopReason: 'endTurn',
        };
        mockServer.createMessage.mockResolvedValue(complexMockResult);

        const result = await samplingTool.samplingRequest(COMPLEX_SAMPLING_REQUEST, SAMPLING_REQUEST_OPTIONS);

        expect(mockServer.createMessage).toHaveBeenCalledWith(COMPLEX_SAMPLING_REQUEST, SAMPLING_REQUEST_OPTIONS);
        expect(result).toEqual(complexMockResult);
      });
    });
  });
  describe('Elicitation Functionality', () => {
    // Common test objects
    const MOCK_ELICIT_RESULT: ElicitResult = {
      action: 'accept',
    };

    const STANDARD_ELICIT_REQUEST: ElicitRequest['params'] = {
      message: 'What is your name?',
      requestedSchema: {
        type: 'object',
        properties: {
          userInput: {
            type: 'string',
            description: 'The input provided by the user',
          },
        },
      },
    };

    const STANDARD_REQUEST_OPTIONS = {
      timeout: 30000,
      signal: new AbortController().signal,
    };

    class ElicitationTool extends MCPTool {
      name = 'elicitation_tool';
      description = 'A tool that uses elicitation';
      schema = z.object({
        question: z.string().describe('The question to elicit input for'),
      });

      protected async execute(input: { question: string }): Promise<unknown> {
        const result = await this.elicitationRequest({
          message: input.question,
          requestedSchema: STANDARD_ELICIT_REQUEST.requestedSchema,
        });

        return { userInput: result.value };
      }
    }

    let elicitationTool: ElicitationTool;
    let mockServer: jest.Mocked<Server>;

    beforeEach(() => {
      elicitationTool = new ElicitationTool();
      mockServer = new Server(
        { name: 'test-server', version: '1.0.0' },
        { capabilities: {} }
      ) as jest.Mocked<Server>;
      mockServer.elicitInput = jest.fn();
    });

    describe('Server Injection for Elicitation', () => {
      it('should throw error when eliciting without server injection', async () => {
        await expect(
          elicitationTool.elicitationRequest(STANDARD_ELICIT_REQUEST)
        ).rejects.toThrow("Server reference has not been injected into 'elicitation_tool' tool.");
      });
    });

    describe('Elicitation Requests', () => {
      beforeEach(() => {
        elicitationTool.injectServer(mockServer);
      });

      it('should make elicitation requests with correct parameters', async () => {
        mockServer.elicitInput.mockResolvedValue(MOCK_ELICIT_RESULT);

        const result = await elicitationTool.elicitationRequest(STANDARD_ELICIT_REQUEST);

        expect(mockServer.elicitInput).toHaveBeenCalledWith(STANDARD_ELICIT_REQUEST, undefined);
        expect(result).toEqual(MOCK_ELICIT_RESULT);
      });

      it('should handle elicitation errors gracefully', async () => {
        mockServer.elicitInput.mockRejectedValue(new Error('Elicitation failed'));
        
        await expect(
          elicitationTool.elicitationRequest(STANDARD_ELICIT_REQUEST)
        ).rejects.toThrow('Elicitation failed');
      });

      it('should support elicitation with request options', async () => {
        mockServer.elicitInput.mockResolvedValue(MOCK_ELICIT_RESULT);

        const result = await elicitationTool.elicitationRequest(STANDARD_ELICIT_REQUEST, STANDARD_REQUEST_OPTIONS);

        expect(mockServer.elicitInput).toHaveBeenCalledWith(STANDARD_ELICIT_REQUEST, STANDARD_REQUEST_OPTIONS);
        expect(result).toEqual(MOCK_ELICIT_RESULT);
      });

      it('should support different schema configurations', async () => {
        const customRequest: ElicitRequest['params'] = {
          message: 'Enter multiple values:',
          requestedSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'User name',
              },
              age: {
                type: 'number',
                description: 'User age',
              },              preferences: {
                type: 'string',
                description: 'User preferences as comma-separated values',
              },
            },
            required: ['name'],
          },
        };

        mockServer.elicitInput.mockResolvedValue(MOCK_ELICIT_RESULT);

        const result = await elicitationTool.elicitationRequest(customRequest);

        expect(mockServer.elicitInput).toHaveBeenCalledWith(customRequest, undefined);
        expect(result).toEqual(MOCK_ELICIT_RESULT);
      });
    });
  });
});
