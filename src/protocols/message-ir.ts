export type TMessageIRRole = 'system' | 'user' | 'assistant' | 'tool';

export type TMessageIRPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: any }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; tool_call_id: string; content: any };

export interface IMessageIRMessage {
  role: Exclude<TMessageIRRole, 'system'>;
  parts: TMessageIRPart[];
}

export interface IMessageIR {
  system: string[];
  messages: IMessageIRMessage[];
  options?: {
    thinking?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
      budget_tokens?: number;
    };
  };
}

function toTextPart(text: string): TMessageIRPart {
  return { type: 'text', text };
}

function normalizeContentParts(content: any): TMessageIRPart[] {
  if (typeof content === 'string') {
    return [toTextPart(content)];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    switch (item.type) {
      case 'text':
        return typeof item.text === 'string' ? [{ type: 'text', text: item.text }] : [];
      case 'image':
      case 'image_url':
        return [{
          type: 'image',
          source: item.source
            ?? (item.image_url
              ? {
                  ...item.image_url,
                  ...(item.media_type ? { media_type: item.media_type } : {}),
                }
              : item.url),
        }];
      case 'tool_use':
        return item.id && item.name
          ? [{ type: 'tool_call', id: item.id, name: item.name, arguments: JSON.stringify(item.input ?? {}) }]
          : [];
      case 'tool_result':
        return item.tool_use_id
          ? [{ type: 'tool_result', tool_call_id: item.tool_use_id, content: item.content }]
          : [];
      default:
        return [];
    }
  });
}

function normalizeOpenAIToolCalls(toolCalls: any): TMessageIRPart[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.flatMap((toolCall) => {
    const id = toolCall?.id;
    const name = toolCall?.function?.name;
    const args = toolCall?.function?.arguments;
    if (!id || !name) {
      return [];
    }

    return [{
      type: 'tool_call' as const,
      id,
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
    }];
  });
}

export function createMessageIR(input: {
  system?: any;
  messages?: any[];
  thinking?: any;
}): IMessageIR {
  const system = typeof input.system === 'string'
    ? [input.system]
    : Array.isArray(input.system)
      ? input.system.flatMap((item) =>
          typeof item === 'string'
            ? [item]
            : item?.type === 'text' && typeof item.text === 'string'
              ? [item.text]
              : []
        )
      : [];

  const messages = Array.isArray(input.messages)
    ? input.messages
        .filter((item) => item?.role)
        .flatMap((item) => {
          if (item.role === 'system') {
            const systemParts = typeof item.content === 'string'
              ? [item.content]
              : normalizeContentParts(item.content)
                  .filter((part) => part.type === 'text')
                  .map((part) => part.text);
            system.push(...systemParts);
            return [];
          }

          if (item.role === 'tool' && item.tool_call_id) {
            return [{
              role: 'user' as const,
              parts: [{
                type: 'tool_result' as const,
                tool_call_id: item.tool_call_id,
                content: item.content,
              }],
            }];
          }

          const parts = [
            ...normalizeContentParts(item.content),
            ...(item.role === 'assistant' ? normalizeOpenAIToolCalls(item.tool_calls) : []),
          ];

          return [{
            role: item.role,
            parts,
          }];
        })
    : [];

  const thinking = input.thinking
    ? {
        enabled: input.thinking?.type === 'enabled' || input.thinking?.enabled === true,
        effort: input.thinking?.effort,
        budget_tokens: input.thinking?.budget_tokens,
      }
    : undefined;

  return {
    system,
    messages,
    options: thinking ? { thinking } : undefined,
  };
}

export function createSingleUserTextIR(prompt: string, options?: IMessageIR['options']): IMessageIR {
  return {
    system: [],
    messages: [
      {
        role: 'user',
        parts: [toTextPart(prompt)],
      },
    ],
    options,
  };
}
