import { createMessageIR, IMessageIR } from './message-ir';
import { toAnthropicMessagesRequest } from './anthropic';
import { toOpenAIChatRequest } from './openai';
import { ICompiledModelCapabilities } from '../trigger/types';

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
  const diagnostics: string[] = [];
  const effectiveIR: IMessageIR = {
    ...input.ir,
    options: input.ir.options ? { ...input.ir.options } : undefined,
  };

  if (input.capabilities?.thinking.supported === false && effectiveIR.options?.thinking) {
    diagnostics.push('thinking_ignored');
    delete effectiveIR.options.thinking;
    if (effectiveIR.options && !Object.keys(effectiveIR.options).length) {
      delete effectiveIR.options;
    }
  }

  const hasImageParts = effectiveIR.messages.some((message) =>
    message.parts.some((part) => part.type === 'image')
  );
  if (input.capabilities?.images === false && hasImageParts) {
    diagnostics.push('images_passthrough_unsupported');
  }

  const hasToolCalls = effectiveIR.messages.some((message) =>
    message.parts.some((part) => part.type === 'tool_call' || part.type === 'tool_result')
  );
  if (input.capabilities?.tools === false && (input.request.tools?.length || hasToolCalls)) {
    diagnostics.push('tools_passthrough_unsupported');
  }

  const passthrough = omitRequestFields(input.request);

  if (input.interface === 'anthropic') {
    return {
      diagnostics,
      ...passthrough,
      ...toAnthropicMessagesRequest({
        model: input.model,
        max_tokens: input.request.max_tokens,
        stream: input.request.stream,
        metadata: input.request.metadata,
        tools: input.request.tools,
        ir: effectiveIR,
      }),
    };
  }

  return {
    diagnostics,
    ...passthrough,
    ...toOpenAIChatRequest({
      model: input.model,
      max_completion_tokens: input.request.max_tokens ?? input.request.max_completion_tokens,
      stream: input.request.stream,
      tools: input.request.tools,
      tool_choice: input.request.tool_choice,
      ir: effectiveIR,
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
