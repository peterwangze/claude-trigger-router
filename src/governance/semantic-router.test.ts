import { describe, expect, it } from 'vitest';
import { SemanticRouter } from './semantic-router';

describe('SemanticRouter', () => {
  const router = new SemanticRouter();

  it('returns null when semantic routing is disabled', () => {
    expect(
      router.analyze('请帮我做架构设计', {
        enabled: false,
        prototypes: {
          architectural_change: '架构设计 模块拆分 系统设计',
        },
      })
    ).toBeNull();
  });

  it('matches the best prototype when threshold is met', () => {
    const result = router.analyze('请帮我做架构设计和模块拆分', {
      enabled: true,
      threshold: 0.4,
      prototypes: {
        architectural_change: '架构设计 模块拆分 系统设计',
        documentation: '文档 撰写 说明 总结',
      },
    });

    expect(result?.intent).toBe('architectural_change');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result?.evidence?.length).toBeGreaterThan(0);
  });

  it('returns null when no prototype reaches threshold', () => {
    const result = router.analyze('今天天气怎么样', {
      enabled: true,
      threshold: 0.6,
      prototypes: {
        architectural_change: '架构设计 模块拆分 系统设计',
      },
    });

    expect(result).toBeNull();
  });
});
