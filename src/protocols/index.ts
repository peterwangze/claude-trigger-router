import { createMessageIR, IMessageIR } from './message-ir';
import { toAnthropicMessagesRequest } from './anthropic';
import { toOpenAIChatRequest } from './openai';

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
}) {
  const passthrough = omitRequestFields(input.request);

  if (input.interface === 'anthropic') {
    return {
      ...passthrough,
      ...toAnthropicMessagesRequest({
        model: input.model,
        max_tokens: input.request.max_tokens,
        stream: input.request.stream,
        metadata: input.request.metadata,
        tools: input.request.tools,
        ir: input.ir,
      }),
    };
  }

  return {
    ...passthrough,
    ...toOpenAIChatRequest({
      model: input.model,
      max_completion_tokens: input.request.max_tokens ?? input.request.max_completion_tokens,
      stream: input.request.stream,
      tools: input.request.tools,
      tool_choice: input.request.tool_choice,
      ir: input.ir,
    }),
  };
}

export function buildUpstreamRequest(input: {
  model: string;
  interface: 'openai' | 'anthropic';
  request: Record<string, any>;
}) {
  const ir = createMessageIR(input.request);

  return {
    ir,
    body: buildUpstreamRequestFromIR({
      model: input.model,
      interface: input.interface,
      request: input.request,
      ir,
    }),
  };
}
