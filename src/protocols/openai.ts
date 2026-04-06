import { IMessageIR } from './message-ir';

function toOpenAIContent(parts: IMessageIR['messages'][number]['parts']) {
  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }

  return parts.map((part) => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'image':
        return { type: 'image_url', image_url: { url: part.source?.url ?? part.source } };
      case 'tool_call':
        return {
          type: 'tool_call',
          id: part.id,
          function: {
            name: part.name,
            arguments: part.arguments,
          },
        };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_call_id: part.tool_call_id,
          content: typeof part.content === 'string' ? part.content : JSON.stringify(part.content),
        };
      default:
        return { type: 'text', text: '' };
    }
  });
}

export function toOpenAIChatRequest(input: {
  model: string;
  max_completion_tokens?: number;
  stream?: boolean;
  ir: IMessageIR;
}) {
  const messages = [
    ...input.ir.system.map((text) => ({ role: 'system', content: text })),
    ...input.ir.messages.map((message) => ({
      role: message.role,
      content: toOpenAIContent(message.parts),
    })),
  ];

  const body: Record<string, any> = {
    model: input.model,
    messages,
  };

  if (input.max_completion_tokens !== undefined) {
    body.max_completion_tokens = input.max_completion_tokens;
  }

  if (input.stream !== undefined) {
    body.stream = input.stream;
  }

  if (input.ir.options?.thinking?.enabled) {
    body.reasoning = {
      ...(input.ir.options.thinking.effort ? { effort: input.ir.options.thinking.effort } : {}),
    };
  }

  return body;
}
