import { describe, it, expect, beforeEach } from 'vitest';
import { SmartRouterSelector } from './smart-router';
import { ISmartRouterConfig } from './types';

describe('SmartRouterSelector', () => {
  let selector: SmartRouterSelector;

  const baseConfig: ISmartRouterConfig = {
    enabled: true,
    router_model: 'test,model',
    candidates: [
      { model: 'provider,model-a', description: '擅长代码任务' },
      { model: 'provider,model-b', description: '擅长创意写作' },
    ],
    cache_ttl: 60000,
    max_tokens: 256,
    fallback: 'default',
  };

  beforeEach(() => {
    selector = new SmartRouterSelector();
    selector.clearCache();
  });

  // ============ 禁用/无效配置 ============

  it('should return null when config is disabled', async () => {
    const config = { ...baseConfig, enabled: false };
    const result = await selector.selectModel('hello', config);
    expect(result).toBeNull();
  });

  it('should return null when candidates list is empty', async () => {
    const config = { ...baseConfig, candidates: [] };
    const result = await selector.selectModel('hello', config);
    expect(result).toBeNull();
  });

  it('should return null when candidates list has only 1 item', async () => {
    const config = { ...baseConfig, candidates: [{ model: 'a,b', description: 'x' }] };
    const result = await selector.selectModel('hello', config);
    expect(result).toBeNull();
  });

  // ============ LLM 调用成功 ============

  it('should return selected model on valid LLM response', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              model: 'provider,model-a',
              confidence: 0.9,
              reasoning: 'Code task detected',
            }),
          },
        ],
      }),
    });

    const result = await selector.selectModel('写一段代码', baseConfig, 3456, mockFetch as any);
    expect(result).not.toBeNull();
    expect(result!.model).toBe('provider,model-a');
    expect(result!.confidence).toBe(0.9);
  });

  it('should return null when LLM returns unknown model', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              model: 'unknown,model-x',
              confidence: 0.9,
              reasoning: 'Unknown',
            }),
          },
        ],
      }),
    });

    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  // ============ 错误处理 ============

  it('should return null on fetch error', async () => {
    const mockFetch = async () => { throw new Error('Network error'); };
    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  it('should return null on non-OK response', async () => {
    const mockFetch = async () => ({ ok: false, status: 500 });
    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  it('should return null when response has no valid JSON', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ content: [{ text: 'no json here' }] }),
    });
    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  // ============ 缓存 ============

  it('should cache result and return cached value on second call', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                model: 'provider,model-a',
                confidence: 0.85,
                reasoning: 'test',
              }),
            },
          ],
        }),
      };
    };

    await selector.selectModel('写代码', baseConfig, 3456, mockFetch as any);
    await selector.selectModel('写代码', baseConfig, 3456, mockFetch as any);

    expect(callCount).toBe(1); // 第二次命中缓存，无需再次调用 LLM
  });

  it('should not use cache for different text', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                model: 'provider,model-a',
                confidence: 0.85,
                reasoning: 'test',
              }),
            },
          ],
        }),
      };
    };

    await selector.selectModel('写代码', baseConfig, 3456, mockFetch as any);
    await selector.selectModel('写文章', baseConfig, 3456, mockFetch as any);

    expect(callCount).toBe(2);
  });
});
