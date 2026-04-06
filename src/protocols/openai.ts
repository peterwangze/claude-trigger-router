import { IMessageIR } from './message-ir';

function toOpenAIContent(parts: IMessageIR['messages'][number]['parts']) {
  const contentParts = parts.filter(
    (part) => part.type === 'text' || part.type === 'image'
  );

  if (!contentParts.length) {
    return null;
  }

  if (contentParts.length === 1 && contentParts[0].type === 'text') {
    return contentParts[0].text;
  }

  return contentParts.map((part) => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'image':
        return { type: 'image_url', image_url: { url: part.source?.url ?? part.source } };
      default:
        return { type: 'text', text: '' };
    }
  });
}

function toOpenAIToolCalls(parts: IMessageIR['messages'][number]['parts']) {
  return parts
    .filter((part) => part.type === 'tool_call')
    .map((part) => ({
      id: part.id,
      type: 'function',
      function: {
        name: part.name,
        arguments: part.arguments,
      },
    }));
}

function toOpenAIToolResultMessages(parts: IMessageIR['messages'][number]['parts']) {
  return parts
    .filter((part) => part.type === 'tool_result')
    .map((part) => ({
      role: 'tool',
      tool_call_id: part.tool_call_id,
      content: typeof part.content === 'string' ? part.content : JSON.stringify(part.content),
    }));
}

function toOpenAITools(tools?: any[]) {
  if (!Array.isArray(tools) || !tools.length) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

function toOpenAIToolChoice(toolChoice?: any) {
  if (!toolChoice) {
    return undefined;
  }

  if (typeof toolChoice === 'string') {
    return toolChoice;
  }

  if (toolChoice.type === 'auto') {
    return 'auto';
  }

  if (toolChoice.type === 'any') {
    return 'required';
  }

  if (toolChoice.type === 'tool' && toolChoice.name) {
    return {
      type: 'function',
      function: {
        name: toolChoice.name,
      },
    };
  }

  return toolChoice;
}

export function toOpenAIChatRequest(input: {
  model: string;
  max_completion_tokens?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  ir: IMessageIR;
}) {
  const messages = [
    ...input.ir.system.map((text) => ({ role: 'system', content: text })),
    ...input.ir.messages.flatMap((message) => {
      const content = toOpenAIContent(message.parts);
      const toolCalls = message.role === 'assistant'
        ? toOpenAIToolCalls(message.parts)
        : [];
      const toolResults = toOpenAIToolResultMessages(message.parts);
      const nextMessages: any[] = [];

      if (content !== null || toolCalls.length) {
        nextMessages.push({
          role: message.role,
          content,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        });
      }

      if (toolResults.length) {
        nextMessages.push(...toolResults);
      }

      return nextMessages;
    }),
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

  const tools = toOpenAITools(input.tools);
  if (tools) {
    body.tools = tools;
  }

  const toolChoice = toOpenAIToolChoice(input.tool_choice);
  if (toolChoice !== undefined) {
    body.tool_choice = toolChoice;
  }

  if (input.ir.options?.thinking?.enabled) {
    body.reasoning = {
      ...(input.ir.options.thinking.effort ? { effort: input.ir.options.thinking.effort } : {}),
    };
  }

  return body;
}
