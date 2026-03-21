/**
 * Agents Manager
 *
 * Agent 管理器
 */

import { IAgent } from "./type";
import { imageAgent } from "./image.agent";

/**
 * Agent 管理器类
 */
class AgentsManager {
  private agents: Map<string, IAgent> = new Map();

  /**
   * 注册一个 Agent
   */
  registerAgent(agent: IAgent): void {
    this.agents.set(agent.name, agent);
  }

  /**
   * 根据名称查找 Agent
   */
  getAgent(name: string): IAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * 获取所有已注册的 Agents
   */
  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取所有 Agent 的工具
   */
  getAllTools(): any[] {
    const allTools: any[] = [];
    for (const agent of this.agents.values()) {
      allTools.push(...agent.tools.values());
    }
    return allTools;
  }
}

const agentsManager = new AgentsManager();
agentsManager.registerAgent(imageAgent);

export default agentsManager;
