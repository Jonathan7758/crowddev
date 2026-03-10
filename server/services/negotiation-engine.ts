import { roleRepo, sessionRepo, messageRepo, evolutionRepo } from '../db/repository.js';
import { roleEngine } from './role-engine.js';
import { llmComplete, llmCompleteJson } from '../llm/llm-router.js';
import { buildRolePrompt } from '../llm/prompt-builder.js';
import { CONFLICT_ANALYSIS_SYSTEM, buildAnalysisUserMessage } from '../llm/templates/conflict-analysis.js';
import { getConsensusTemplate, buildConsensusUserMessage } from '../llm/templates/consensus.js';
import { PRD_UPDATE_SYSTEM, buildPrdUpdateUserMessage } from '../llm/templates/prd-update.js';
import { formatAnalysisMarkdown, formatConsensusMarkdown, formatPrdCheckMarkdown } from '../llm/formatters.js';
import { logger } from '../logger.js';
import type { Session, SessionStatus } from '../../src/types/session.js';
import type { Message, NegotiationEvent, ConflictAnalysis } from '../../src/types/message.js';
import type { Phase } from '../../src/types/role.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ['opinions_running'],
  opinions_running: ['opinions_done'],
  opinions_done: ['analysis_running'],
  analysis_running: ['analysis_done'],
  analysis_done: ['debate_running', 'consensus_running'],
  debate_running: ['debate_done'],
  debate_done: ['debate_running', 'analysis_running', 'consensus_running'],
  consensus_running: ['consensus_reached'],
  consensus_reached: ['prd_check_running'],
  prd_check_running: ['prd_check_done'],
  prd_check_done: [],
};

function validateTransition(current: string, next: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

function transitionStatus(sessionId: string, from: string, to: SessionStatus): void {
  if (!validateTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
  sessionRepo.updateStatus(sessionId, to);
}

function safeTransition(sessionId: string, expectedStatuses: string[], to: SessionStatus): void {
  const session = sessionRepo.getById(sessionId);
  if (!session) throw new Error('Session not found');
  if (!expectedStatuses.includes(session.status)) {
    throw new Error(`Cannot transition: session is in '${session.status}', expected one of [${expectedStatuses.join(', ')}]`);
  }
  transitionStatus(sessionId, session.status, to);
}

/** Resolve roleId to display name */
function resolveRoleName(roleId: string): string {
  const role = roleRepo.getById(roleId);
  return role?.name || roleId;
}

export const negotiationEngine = {
  async *runOpinions(session: Session): AsyncGenerator<NegotiationEvent> {
    safeTransition(session.id, ['created'], 'opinions_running');

    for (const roleId of session.participantIds) {
      const role = roleRepo.getById(roleId);
      if (!role) continue;

      yield { event: 'role_thinking', roleId: role.id, roleName: role.name, step: 'opinion' };

      const systemPrompt = buildRolePrompt(role, session.phase as Phase);
      const userMsg = `议题：${session.topic}\n\n${session.description || ''}\n\n请从你的角色立场出发，对这个议题发表你的看法和立场。`;

      try {
        const content = await llmComplete('role_opinion', systemPrompt, [{ role: 'user', content: userMsg }]);
        const message = messageRepo.create({
          sessionId: session.id,
          roleId: role.id,
          roleName: role.name,
          roleAvatar: role.avatar,
          type: 'opinion',
          content,
          phase: session.phase,
        });
        yield { event: 'role_done', message };
      } catch (error: any) {
        logger.error(`Opinion failed for ${role.name}`, { error: error.message });
        yield { event: 'error', error: `${role.name} 表态失败: ${error.message}` };
      }
    }

    transitionStatus(session.id, 'opinions_running', 'opinions_done');
    yield { event: 'complete', sessionStatus: 'opinions_done' };
  },

  async *runAnalysis(session: Session): AsyncGenerator<NegotiationEvent> {
    safeTransition(session.id, ['opinions_done', 'debate_done'], 'analysis_running');
    yield { event: 'role_thinking', roleId: '', roleName: '协商引擎', step: 'analysis' };

    const opinions = messageRepo.listBySessionAndType(session.id, 'opinion');
    const rebuttals = messageRepo.listBySessionAndType(session.id, 'rebuttal');
    const allOpinions = [...opinions, ...rebuttals];
    const opinionData = allOpinions.map(m => ({
      roleName: m.roleName || '未知',
      roleId: m.roleId || '',
      content: m.content,
    }));

    try {
      const userMsg = buildAnalysisUserMessage(session.topic, opinionData);
      const rawJson = await llmComplete('conflict_analysis', CONFLICT_ANALYSIS_SYSTEM, [{ role: 'user', content: userMsg }]);
      const content = formatAnalysisMarkdown(rawJson, resolveRoleName);
      const message = messageRepo.create({
        sessionId: session.id,
        roleId: null,
        type: 'analysis',
        content,
        phase: session.phase,
      });
      yield { event: 'analysis_done', message };
    } catch (error: any) {
      logger.error('Analysis failed', { error: error.message });
      yield { event: 'error', error: `冲突分析失败: ${error.message}` };
    }

    transitionStatus(session.id, 'analysis_running', 'analysis_done');
    yield { event: 'complete', sessionStatus: 'analysis_done' };
  },

  async *runDebate(session: Session, moderatorPrompt?: string): AsyncGenerator<NegotiationEvent> {
    safeTransition(session.id, ['analysis_done', 'debate_done'], 'debate_running');

    const allMessages = messageRepo.listBySession(session.id);
    const recentHistory = allMessages.slice(-10).map(m => `【${m.roleName || '协商引擎'}】[${m.type}]: ${m.content}`).join('\n\n');

    for (const roleId of session.participantIds) {
      const role = roleRepo.getById(roleId);
      if (!role) continue;

      yield { event: 'role_thinking', roleId: role.id, roleName: role.name, step: 'debate' };

      const systemPrompt = buildRolePrompt(role, session.phase as Phase);
      let userMsg = `议题：${session.topic}\n\n之前的讨论记录：\n${recentHistory}\n\n`;
      if (moderatorPrompt) {
        userMsg += `主持人引导问题：${moderatorPrompt}\n\n`;
      }
      userMsg += `请基于之前的讨论，回应其他角色的观点。你可以坚持立场、做出妥协、或提出新方案。`;

      try {
        const content = await llmComplete('role_debate', systemPrompt, [{ role: 'user', content: userMsg }]);
        const message = messageRepo.create({
          sessionId: session.id,
          roleId: role.id,
          roleName: role.name,
          roleAvatar: role.avatar,
          type: 'rebuttal',
          content,
          phase: session.phase,
        });
        yield { event: 'role_done', message };
      } catch (error: any) {
        logger.error(`Debate failed for ${role.name}`, { error: error.message });
        yield { event: 'error', error: `${role.name} 辩论失败: ${error.message}` };
      }
    }

    transitionStatus(session.id, 'debate_running', 'debate_done');
    yield { event: 'complete', sessionStatus: 'debate_done' };
  },

  async *runConsensus(session: Session): AsyncGenerator<NegotiationEvent> {
    safeTransition(session.id, ['analysis_done', 'debate_done'], 'consensus_running');
    yield { event: 'role_thinking', roleId: '', roleName: '协商引擎', step: 'consensus' };

    const allMessages = messageRepo.listBySession(session.id);
    const systemPrompt = getConsensusTemplate(session.phase as Phase);
    const userMsg = buildConsensusUserMessage(
      session.topic,
      allMessages.map(m => ({ roleName: m.roleName || '协商引擎', type: m.type, content: m.content }))
    );

    try {
      const rawJson = await llmComplete('consensus', systemPrompt, [{ role: 'user', content: userMsg }]);
      const content = formatConsensusMarkdown(rawJson, session.phase, resolveRoleName);
      const message = messageRepo.create({
        sessionId: session.id,
        roleId: null,
        type: 'consensus',
        content,
        phase: session.phase,
      });
      yield { event: 'consensus_done', message };

      evolutionRepo.log('consensus_reached', session.id, session.topic, {
        phase: session.phase,
        rawConsensus: rawJson,
      });
    } catch (error: any) {
      logger.error('Consensus failed', { error: error.message });
      yield { event: 'error', error: `共识生成失败: ${error.message}` };
    }

    transitionStatus(session.id, 'consensus_running', 'consensus_reached');
    yield { event: 'complete', sessionStatus: 'consensus_reached' };
  },

  async *runPrdCheck(session: Session): AsyncGenerator<NegotiationEvent> {
    safeTransition(session.id, ['consensus_reached'], 'prd_check_running');

    const consensusMessages = messageRepo.listBySessionAndType(session.id, 'consensus');
    const lastConsensus = consensusMessages[consensusMessages.length - 1];
    if (!lastConsensus) {
      yield { event: 'error', error: '没有找到共识记录' };
      return;
    }

    yield { event: 'role_thinking', roleId: '', roleName: '协商引擎', step: 'prd-check' };

    try {
      const userMsg = buildPrdUpdateUserMessage(session.topic, lastConsensus.content, session.prdSection || '');
      const rawJson = await llmComplete('prd_update', PRD_UPDATE_SYSTEM, [{ role: 'user', content: userMsg }]);
      const content = formatPrdCheckMarkdown(rawJson);
      const message = messageRepo.create({
        sessionId: session.id,
        roleId: null,
        type: 'prd_update',
        content,
        phase: session.phase,
      });
      yield { event: 'prd_check_done', message };

      evolutionRepo.log('prd_updated', session.id, session.topic, {
        rawPrdUpdate: rawJson,
        phase: session.phase,
      });
    } catch (error: any) {
      logger.error('PRD check failed', { error: error.message });
      yield { event: 'error', error: `PRD检查失败: ${error.message}` };
    }

    transitionStatus(session.id, 'prd_check_running', 'prd_check_done');
    yield { event: 'complete', sessionStatus: 'prd_check_done' };
  },

  /** Run the full negotiation pipeline: opinions → analysis → debate → consensus → prd-check */
  async *runFull(session: Session): AsyncGenerator<NegotiationEvent> {
    const steps = [
      { label: '表态', run: (s: Session) => this.runOpinions(s), doneStatus: 'opinions_done' },
      { label: '冲突分析', run: (s: Session) => this.runAnalysis(s), doneStatus: 'analysis_done' },
      { label: '辩论回应', run: (s: Session) => this.runDebate(s), doneStatus: 'debate_done' },
      { label: '寻求共识', run: (s: Session) => this.runConsensus(s), doneStatus: 'consensus_reached' },
      { label: 'PRD检查', run: (s: Session) => this.runPrdCheck(s), doneStatus: 'prd_check_done' },
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      // Emit step progress so frontend can update the label
      yield { event: 'step_progress', stepLabel: step.label, stepNumber: i + 1, totalSteps: steps.length } as any;

      // Re-read session from DB (except first step which uses the original)
      const currentSession = i === 0 ? session : sessionRepo.getById(session.id);
      if (!currentSession) return;

      // Run the step, forwarding all events except intermediate 'complete'
      for await (const event of step.run(currentSession)) {
        if (event.event === 'complete') {
          // Only forward the final complete (last step)
          if (i === steps.length - 1) {
            yield event;
          }
          break;
        }
        yield event;
      }

      // Verify the step completed successfully
      const afterSession = sessionRepo.getById(session.id);
      if (!afterSession || afterSession.status !== step.doneStatus) {
        // Step didn't complete — emit error and final complete with current status
        yield { event: 'error', error: `步骤"${step.label}"未能成功完成` } as any;
        yield { event: 'complete', sessionStatus: afterSession?.status || 'created' } as any;
        return;
      }
    }
  },
};
