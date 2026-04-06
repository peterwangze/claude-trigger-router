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
        return [{ type: 'image', source: item.source ?? item.image_url ?? item.url }];
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

export function createMessageIR(input: {
  system?: any;
  messages?: any[];
  thinking?: any;
}): IMessageIR {
  const system = typeof input.system === 'string'
    ? [input.system]
    : Array.isArray(input.system)
      ? input.system.flatMap((item) => item?.type === 'text' && typeof item.text === 'string' ? [item.text] : [])
      : [];

  const messages = Array.isArray(input.messages)
    ? input.messages
        .filter((item) => item?.role)
        .map((item) => ({
          role: item.role,
          parts: normalizeContentParts(item.content),
        }))
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
