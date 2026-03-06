import { describe, it, expect } from 'vitest';
import type { Role, Phase } from '../../src/types/role.js';

// Import buildRolePrompt directly — it's a pure function with no side effects
import { buildRolePrompt } from '../../server/llm/prompt-builder.js';

function createMockRole(overrides?: Partial<Role>): Role {
  return {
    id: 'role-001',
    name: '张伟',
    title: '安全运营主管',
    organization: '城市安防中心',
    avatar: '👮',
    responsibilities: ['监控城市安全态势', '协调安全事件响应', '管理安防设备'],
    decisionPowers: ['安全等级调整', '紧急响应启动'],
    expertise: ['城市安防', '视频监控', '应急管理'],
    personality: ['谨慎', '注重细节', '有责任心'],
    concerns: ['系统误报率', '隐私保护合规', '响应速度'],
    version: '1.0.0',
    history: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildRolePrompt', () => {
  const mockRole = createMockRole();

  describe('identity block', () => {
    it('should include the role name', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('张伟');
    });

    it('should include the organization', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('城市安防中心');
    });

    it('should include the title', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('安全运营主管');
    });

    it('should contain identity section marker', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('[身份]');
    });
  });

  describe('function block', () => {
    it('should include responsibilities', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('监控城市安全态势');
      expect(prompt).toContain('协调安全事件响应');
      expect(prompt).toContain('管理安防设备');
    });

    it('should include decision powers', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('安全等级调整');
      expect(prompt).toContain('紧急响应启动');
    });

    it('should contain function section marker', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('[职能]');
    });
  });

  describe('cognition block', () => {
    it('should include expertise areas', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('城市安防');
      expect(prompt).toContain('视频监控');
      expect(prompt).toContain('应急管理');
    });

    it('should contain cognition section marker', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('[认知背景]');
    });
  });

  describe('personality block', () => {
    it('should include personality traits', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('谨慎');
      expect(prompt).toContain('注重细节');
      expect(prompt).toContain('有责任心');
    });

    it('should include concerns', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('系统误报率');
      expect(prompt).toContain('隐私保护合规');
      expect(prompt).toContain('响应速度');
    });

    it('should contain personality section marker', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('[人格特征]');
    });
  });

  describe('phase-specific guidance', () => {
    it('should include design phase guidance for design phase', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('[阶段引导 - 设计期]');
      expect(prompt).toContain('设计评审');
    });

    it('should include acceptance phase guidance for acceptance phase', () => {
      const prompt = buildRolePrompt(mockRole, 'acceptance');
      expect(prompt).toContain('[阶段引导 - 验收期]');
      expect(prompt).toContain('验收评审');
    });

    it('should include operations phase guidance for operations phase', () => {
      const prompt = buildRolePrompt(mockRole, 'operations');
      expect(prompt).toContain('[阶段引导 - 运营期]');
      expect(prompt).toContain('已上线运营');
    });

    it('should not include other phase guidance', () => {
      const designPrompt = buildRolePrompt(mockRole, 'design');
      expect(designPrompt).not.toContain('[阶段引导 - 验收期]');
      expect(designPrompt).not.toContain('[阶段引导 - 运营期]');
    });
  });

  describe('behavior block', () => {
    it('should include behavior constraints', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).toContain('[行为约束]');
      expect(prompt).toContain('200 字以内');
      expect(prompt).toContain('第一人称');
    });
  });

  describe('context block', () => {
    it('should include context when provided', () => {
      const context = '当前讨论的是视频监控模块的设计方案';
      const prompt = buildRolePrompt(mockRole, 'design', context);
      expect(prompt).toContain('[附加上下文]');
      expect(prompt).toContain(context);
    });

    it('should not include context block when context is not provided', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt).not.toContain('[附加上下文]');
    });

    it('should not include context block when context is undefined', () => {
      const prompt = buildRolePrompt(mockRole, 'design', undefined);
      expect(prompt).not.toContain('[附加上下文]');
    });
  });

  describe('overall prompt structure', () => {
    it('should produce a non-empty string', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should contain all major section markers', () => {
      const prompt = buildRolePrompt(mockRole, 'design');
      const expectedMarkers = ['[身份]', '[职能]', '[认知背景]', '[人格特征]', '[行为约束]'];
      for (const marker of expectedMarkers) {
        expect(prompt).toContain(marker);
      }
    });

    it('should produce different output for different phases', () => {
      const design = buildRolePrompt(mockRole, 'design');
      const acceptance = buildRolePrompt(mockRole, 'acceptance');
      const operations = buildRolePrompt(mockRole, 'operations');
      expect(design).not.toBe(acceptance);
      expect(design).not.toBe(operations);
      expect(acceptance).not.toBe(operations);
    });

    it('should produce different output for different roles', () => {
      const role2 = createMockRole({ name: '李华', title: '数据分析师', organization: '数据部门' });
      const prompt1 = buildRolePrompt(mockRole, 'design');
      const prompt2 = buildRolePrompt(role2, 'design');
      expect(prompt1).not.toBe(prompt2);
      expect(prompt2).toContain('李华');
      expect(prompt2).toContain('数据分析师');
      expect(prompt2).toContain('数据部门');
    });
  });
});
