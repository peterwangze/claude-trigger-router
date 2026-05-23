import type { ICompiledModelRef } from '../models/compile';
import type { IAgent, ITool } from './type';

export interface IToolCapabilityDecision {
  agent: string;
  tool: string;
  allowed: boolean;
  reason: string;
  requiredModelCapabilities: string[];
  modelId?: string;
}

export function evaluateToolCapabilityGuardrail(
  agent: Pick<IAgent, 'name'>,
  tool: ITool,
  compiledModel?: ICompiledModelRef
): IToolCapabilityDecision {
  const requiredModelCapabilities = tool.capabilities?.requiredModelCapabilities ?? [];
  const missing = requiredModelCapabilities.filter((capability) => {
    if (!compiledModel) {
      return false;
    }
    if (capability === 'tools') {
      return compiledModel.capabilities.tools === false;
    }
    if (capability === 'images') {
      return compiledModel.capabilities.images === false;
    }
    return false;
  });

  if (missing.length) {
    return {
      agent: agent.name,
      tool: tool.name,
      allowed: false,
      reason: `model_missing_${missing.join('_')}`,
      requiredModelCapabilities,
      modelId: compiledModel?.id,
    };
  }

  return {
    agent: agent.name,
    tool: tool.name,
    allowed: true,
    reason: compiledModel ? 'capabilities_satisfied' : 'model_capabilities_unknown',
    requiredModelCapabilities,
    modelId: compiledModel?.id,
  };
}
