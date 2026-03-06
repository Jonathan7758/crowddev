# CrowdDev — 众开协商引擎

> **本文件是 Claude Code 开发的入口。开始任何开发任务前请先阅读本文件和 docs/ 下的参考文档。**

## 项目概述

CrowdDev 是一个 AI 多角色协商设计工具。让 AI 模拟的多角色群体通过结构化协商共同塑造产品设计，通过冲突暴露和协商达成共识，驱动系统迭代。

- **首个应用场景：** CityMatrix 城市安防运营系统
- **核心理念：** 众开模式——产品由多角色 AI Agent 协商共创
- **当前阶段：** MVP Phase 1（核心协商闭环）

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + Zustand |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| LLM | Anthropic Claude API (claude-sonnet-4-20250514) |
| 文档解析 | markdown-it + js-yaml |
| 测试 | Vitest + Playwright |

## 四大引擎

### 1. 角色引擎 (Role Engine)
管理角色档案（身份、职能、认知、人格、关切），版本化演化，自动生成角色扮演 prompt。

### 2. 协商引擎 (Negotiation Engine)
四步协商：表态 → 冲突分析 → 辩论回应 → 共识生成。三阶段模型：设计期/验收期/运营期，各有引导策略模板。

### 3. 文档引擎 (Document Engine)
PRD 智能拆解：文档读取 → AI 预筛评分 → 议题提取 → 共识回写 PRD。

### 4. 演化引擎 (Evolution Engine)
角色版本追踪、决策沉淀、阶段统计、趋势分析。

## 核心文档

| 需要了解 | 文档路径 |
|---------|---------|
| 蓝图方案 | `docs/blueprint.md` |
| MVP PRD | `docs/prd.md` |
| 技术架构 | `docs/architecture.md` |
| CityMatrix 项目文档 | `project-docs/` 目录 |

## 开发规范

- **TypeScript：** strict 模式，所有函数显式类型标注
- **React：** 函数组件 + Hooks，Zustand 状态管理
- **API：** RESTful，协商流程用 SSE 推送进度
- **Prompt：** 模板存放在 `server/llm/templates/`，业务逻辑不硬编码 prompt
- **测试：** 核心引擎单元测试覆盖 >80%

## 当前进度

- [x] 蓝图方案文档
- [x] MVP PRD 文档  
- [x] 技术架构文档
- [ ] 项目初始化
- [ ] Week 1-2: 基础设施 + 角色引擎
- [ ] Week 3-4: 协商引擎核心
- [ ] Week 5-6: 文档引擎
- [ ] Week 7-8: 演化追踪 + E2E 测试
