import { IMessageIR } from './message-ir';

function toAnthropicContent(parts: IMessageIR['messages'][number]['parts']) {
  return parts.map((part) => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'image':
        return { type: 'image', source: part.source };
      case 'tool_call':
        return {
          type: 'tool_use',
          id: part.id,
          name: part.name,
          input: JSON.parse(part.arguments || '{}'),
        };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: part.tool_call_id,
          content: part.content,
        };
      default:
        return { type: 'text', text: '' };
    }
  });
}

export function toAnthropicMessagesRequest(input: {
  model: string;
  max_tokens?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
  tools?: any[];
  ir: IMessageIR;
}) {
  const body: Record<string, any> = {
    model: input.model,
    messages: input.ir.messages.map((message) => ({
      role: message.role,
      content: toAnthropicContent(message.parts),
    })),
  };

  if (input.max_tokens !== undefined) {
    body.max_tokens = input.max_tokens;
  }

  if (input.stream !== undefined) {
    body.stream = input.stream;
  }

  if (input.metadata) {
    body.metadata = input.metadata;
  }

  if (input.tools) {
    body.tools = input.tools.map((tool) => ({
      name: tool?.name ?? tool?.function?.name,
      description: tool?.description ?? tool?.function?.description,
      input_schema: tool?.input_schema ?? tool?.function?.parameters,
    }));
  }

  if (input.ir.system.length) {
    body.system = input.ir.system.map((text) => ({ type: 'text', text }));
  }

  if (input.ir.options?.thinking?.enabled) {
    body.thinking = {
      type: 'enabled',
      ...(input.ir.options.thinking.effort ? { effort: input.ir.options.thinking.effort } : {}),
      ...(input.ir.options.thinking.budget_tokens ? { budget_tokens: input.ir.options.thinking.budget_tokens } : {}),
    };
  }

  return body;
}
