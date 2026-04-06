import { createMessageIR, IMessageIR } from './message-ir';
import { toAnthropicMessagesRequest } from './anthropic';
import { toOpenAIChatRequest } from './openai';
import { ICompiledModelCapabilities } from '../trigger/types';

function stringifyFallbackContent(value: any): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function applyCapabilityFallbacks(input: {
  ir: IMessageIR;
  request: Record<string, any>;
  capabilities?: ICompiledModelCapabilities;
}) {
  const diagnostics: string[] = [];
  const nextRequest = { ...input.request };
  const nextIR: IMessageIR = {
    ...input.ir,
    system: [...input.ir.system],
    messages: input.ir.messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => ({ ...part })),
    })),
    options: input.ir.options ? { ...input.ir.options } : undefined,
  };

  if (input.capabilities?.thinking.supported === false && nextIR.options?.thinking) {
    diagnostics.push('thinking_ignored');
    delete nextIR.options.thinking;
    delete nextRequest.thinking;
    if (nextIR.options && !Object.keys(nextIR.options).length) {
      delete nextIR.options;
    }
  }

  const hasImageParts = nextIR.messages.some((message) =>
    message.parts.some((part) => part.type === 'image')
  );
  if (input.capabilities?.images === false && hasImageParts) {
    diagnostics.push('images_text_fallback');
    nextIR.messages = nextIR.messages.map((message) => ({
      ...message,
      parts: message.parts.flatMap((part) => {
        if (part.type !== 'image') {
          return [part];
        }

        return [
          {
            type: 'text' as const,
            text: '[Image content omitted because the target model does not support image input.]',
          },
        ];
      }),
    }));
  }

  const hasToolParts = nextIR.messages.some((message) =>
    message.parts.some((part) => part.type === 'tool_call' || part.type === 'tool_result')
  );
  if (input.capabilities?.tools === false && (Array.isArray(nextRequest.tools) && nextRequest.tools.length || hasToolParts)) {
    diagnostics.push('tools_text_fallback');
    delete nextRequest.tools;
    delete nextRequest.tool_choice;
    nextIR.messages = nextIR.messages.map((message) => ({
      ...message,
      parts: message.parts.flatMap((part) => {
        if (part.type === 'tool_call') {
          return [
            {
              type: 'text' as const,
              text: `[Tool call omitted because the target model does not support tools] ${part.name}(${part.arguments})`,
            },
          ];
        }

        if (part.type === 'tool_result') {
          return [
            {
              type: 'text' as const,
              text: `[Tool result preserved as plain text] ${stringifyFallbackContent(part.content)}`,
            },
          ];
        }

        return [part];
      }),
    }));
  }

  return {
    diagnostics,
    ir: nextIR,
    request: nextRequest,
  };
}

function omitRequestFields(body: Record<string, any>) {
  const {
    model,
    messages,
    system,
    tools,
    thinking,
    metadata,
    max_tokens,
    ...rest
  } = body;

  return rest;
}

export function buildUpstreamRequestFromIR(input: {
  model: string;
  interface: 'openai' | 'anthropic';
  request: Record<string, any>;
  ir: IMessageIR;
  capabilities?: ICompiledModelCapabilities;
}) {
  const fallback = applyCapabilityFallbacks({
    ir: input.ir,
    request: input.request,
    capabilities: input.capabilities,
  });
  const passthrough = omitRequestFields(fallback.request);

  if (input.interface === 'anthropic') {
    return {
      diagnostics: fallback.diagnostics,
      ...passthrough,
      ...toAnthropicMessagesRequest({
        model: input.model,
        max_tokens: fallback.request.max_tokens,
        stream: fallback.request.stream,
        metadata: fallback.request.metadata,
        tools: fallback.request.tools,
        ir: fallback.ir,
      }),
    };
  }

  return {
    diagnostics: fallback.diagnostics,
    ...passthrough,
    ...toOpenAIChatRequest({
      model: input.model,
      max_completion_tokens: fallback.request.max_tokens ?? fallback.request.max_completion_tokens,
      stream: fallback.request.stream,
      tools: fallback.request.tools,
      tool_choice: fallback.request.tool_choice,
      ir: fallback.ir,
    }),
  };
}

export function buildUpstreamRequest(input: {
  model: string;
  interface: 'openai' | 'anthropic';
  request: Record<string, any>;
  capabilities?: ICompiledModelCapabilities;
}) {
  const ir = createMessageIR(input.request);
  const { diagnostics, ...body } = buildUpstreamRequestFromIR({
    model: input.model,
    interface: input.interface,
    request: input.request,
    ir,
    capabilities: input.capabilities,
  });

  return {
    ir,
    body,
    diagnostics,
  };
}
