# Fate/Domination 重构版

这是 Fate/Domination 的独立规则引擎重构版，当前定位为可供前端接入的后端架构基线。旧开发版、发布版和旧 UI 不属于本目录，也不会由本项目运行时加载。

前端开发请先阅读 docs/frontend-integration-contract.md，只通过 GameApplication、CommandType 和玩家安全投影接入。

## 开发检查

npm test ； npm run validate ； npm run audit:skills

完整发布条件仍包括基础流程、角色能力、3X、存档、联机和投影回归全部通过；当前仍有 PARTIAL 技能，不应作为完整发布版使用。

这是与旧开发版完全隔离的 V2 工程。旧版只作为规则行为、内容数据和美术资源的迁移来源，不会被本工程修改。当前正式运行时骨架采用 TypeScript 领域模型；早期 JavaScript 文件仅保留为迁移期间的对照实现。

## 当前目标

- 规则、内容、界面、存档和联机分层。
- 所有实体使用稳定 ID，显示名称只负责展示。
- 单机与联机共用同一套规则引擎。
- 地图保持原图、原地点关系和原摆放语义。
- 所有异步选择均可序列化、取消并在重连后恢复。
- V2 的领域状态、命令、事件和基础规则入口位于 `src/domain`、`src/match-engine` 和 `src/rules-core`。

完整架构基线见 `docs/rules-engine-architecture-v2.md`。

## 本地验证

```powershell
npm test
npm run validate
```

项目仍处于核心架构建设阶段，旧版目前仍是可游玩的正式基线。
