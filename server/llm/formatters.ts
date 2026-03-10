/**
 * Convert structured JSON output from LLM into readable Markdown for display.
 * Keeps the content human-friendly while maintaining structure.
 */

interface RoleNameResolver {
  (roleId: string): string;
}

export function formatAnalysisMarkdown(jsonStr: string, resolveRole: RoleNameResolver): string {
  try {
    const data = JSON.parse(jsonStr);
    const lines: string[] = [];

    lines.push(`## 冲突分析\n`);
    lines.push(`**概述**：${data.summary}\n`);

    if (data.conflicts?.length) {
      lines.push(`### 冲突点\n`);
      for (const c of data.conflicts) {
        const severityLabel = c.severity === 'high' ? '高' : c.severity === 'medium' ? '中' : '低';
        lines.push(`#### ${c.core}  \`${severityLabel}严重度\`\n`);
        lines.push(`**根本原因**：${c.rootCause}\n`);
        lines.push(`**各方立场**：\n`);
        for (const p of c.positions || []) {
          const name = resolveRole(p.roleId) || p.roleId;
          lines.push(`- **${name}**：${p.position}`);
        }
        lines.push('');
      }
    }

    if (data.focusQuestions?.length) {
      lines.push(`### 引导问题\n`);
      for (const q of data.focusQuestions) {
        lines.push(`- ${q}`);
      }
    }

    return lines.join('\n');
  } catch {
    return jsonStr;
  }
}

export function formatDesignConsensusMarkdown(jsonStr: string, resolveRole: RoleNameResolver): string {
  try {
    const data = JSON.parse(jsonStr);
    const lines: string[] = [];

    lines.push(`## 共识方案\n`);
    lines.push(`**结论**：${data.conclusion}\n`);

    if (data.compromises?.length) {
      lines.push(`### 各方妥协\n`);
      for (const c of data.compromises) {
        const name = c.roleName || resolveRole(c.roleId) || c.roleId;
        lines.push(`- **${name}**：${c.compromise}`);
      }
      lines.push('');
    }

    if (data.constraints?.length) {
      lines.push(`### 约束条件\n`);
      for (const c of data.constraints) {
        lines.push(`- ${c}`);
      }
      lines.push('');
    }

    if (data.prdSuggestions?.length) {
      lines.push(`### PRD 修改建议\n`);
      for (const s of data.prdSuggestions) {
        const typeLabel = s.type === 'add' ? '新增' : s.type === 'modify' ? '修改' : '删除';
        lines.push(`- **[${typeLabel}] ${s.section}**：${s.content}`);
        lines.push(`  > 原因：${s.reason}`);
      }
      lines.push('');
    }

    if (data.acceptanceCriteria?.length) {
      lines.push(`### 验收标准\n`);
      for (const a of data.acceptanceCriteria) {
        lines.push(`- ${a}`);
      }
      lines.push('');
    }

    if (data.unresolvedIssues?.length) {
      lines.push(`### 遗留问题\n`);
      for (const u of data.unresolvedIssues) {
        lines.push(`- ${u}`);
      }
    }

    return lines.join('\n');
  } catch {
    return jsonStr;
  }
}

export function formatAcceptanceConsensusMarkdown(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr);
    const lines: string[] = [];

    const verdictLabel = data.verdict === 'pass' ? '通过' : data.verdict === 'conditional_pass' ? '有条件通过' : '未通过';
    lines.push(`## 验收结论：${verdictLabel}\n`);

    if (data.metItems?.length) {
      lines.push(`### 已满足需求\n`);
      for (const m of data.metItems) lines.push(`- ${m}`);
      lines.push('');
    }

    if (data.deviations?.length) {
      lines.push(`### 偏差项\n`);
      for (const d of data.deviations) {
        lines.push(`- **${d.item}** \`${d.severity}\`：${d.description}`);
      }
      lines.push('');
    }

    if (data.improvements?.length) {
      lines.push(`### 改进项\n`);
      for (const i of data.improvements) {
        lines.push(`- **${i.item}** \`${i.priority}\` — 负责方：${i.assignee}`);
      }
      lines.push('');
    }

    if (data.unresolvedIssues?.length) {
      lines.push(`### 遗留问题\n`);
      for (const u of data.unresolvedIssues) lines.push(`- ${u}`);
    }

    return lines.join('\n');
  } catch {
    return jsonStr;
  }
}

export function formatOperationsConsensusMarkdown(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr);
    const lines: string[] = [];

    lines.push(`## 运营期共识\n`);

    if (data.insights?.length) {
      lines.push(`### 运营洞察\n`);
      for (const i of data.insights) lines.push(`- ${i}`);
      lines.push('');
    }

    if (data.optimizations?.length) {
      lines.push(`### 优化建议\n`);
      for (const o of data.optimizations) {
        lines.push(`- **${o.item}** \`${o.priority}\`：${o.expectedImpact}`);
      }
      lines.push('');
    }

    if (data.parameterChanges?.length) {
      lines.push(`### 参数调整\n`);
      lines.push(`| 参数 | 当前值 | 建议值 | 原因 |`);
      lines.push(`|------|--------|--------|------|`);
      for (const p of data.parameterChanges) {
        lines.push(`| ${p.parameter} | ${p.currentValue} | ${p.suggestedValue} | ${p.reason} |`);
      }
      lines.push('');
    }

    if (data.unresolvedIssues?.length) {
      lines.push(`### 遗留问题\n`);
      for (const u of data.unresolvedIssues) lines.push(`- ${u}`);
    }

    return lines.join('\n');
  } catch {
    return jsonStr;
  }
}

export function formatConsensusMarkdown(jsonStr: string, phase: string, resolveRole: RoleNameResolver): string {
  switch (phase) {
    case 'design': return formatDesignConsensusMarkdown(jsonStr, resolveRole);
    case 'acceptance': return formatAcceptanceConsensusMarkdown(jsonStr);
    case 'operations': return formatOperationsConsensusMarkdown(jsonStr);
    default: return formatDesignConsensusMarkdown(jsonStr, resolveRole);
  }
}

export function formatPrdCheckMarkdown(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr);
    const lines: string[] = [];

    const statusLabel = data.hasUnresolvedConflicts ? '存在未解决冲突' : '冲突已全部解决';
    lines.push(`## PRD 检查结果：${statusLabel}\n`);

    if (data.unresolvedPoints?.length) {
      lines.push(`### 未解决要点\n`);
      for (const u of data.unresolvedPoints) lines.push(`- ${u}`);
      lines.push('');
    }

    if (data.prdUpdates?.length) {
      lines.push(`### PRD 修改条目\n`);
      for (const u of data.prdUpdates) {
        const typeLabel = u.type === 'add' ? '新增' : u.type === 'modify' ? '修改' : '删除';
        lines.push(`#### [${typeLabel}] ${u.section}\n`);
        if (u.originalText) {
          lines.push(`**原文**：${u.originalText}\n`);
        }
        if (u.newText) {
          lines.push(`**新内容**：\n${u.newText}\n`);
        }
        lines.push(`> 原因：${u.reason}\n`);
      }
    }

    if (data.suggestedNextSteps?.length) {
      lines.push(`### 建议后续步骤\n`);
      for (const s of data.suggestedNextSteps) lines.push(`- ${s}`);
    }

    return lines.join('\n');
  } catch {
    return jsonStr;
  }
}
