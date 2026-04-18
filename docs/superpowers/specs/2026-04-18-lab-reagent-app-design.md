# 实验室试剂预约 APP 设计文档

- **日期**：2026-04-18
- **状态**：草稿 · 待评审
- **作者**：设计讨论整理

## 1. 背景与目标

为院系级实验室（50–500 人规模）提供一套覆盖 **试剂百科 / 领用申请 / 库存管理 / 采购申请 / 管控试剂合规** 的全流程管理系统。支持 Web 与微信小程序双端，云端 SaaS 部署。

### 目标用户
- 普通使用者（学生 / 研究员）
- 实验室负责人（PI）
- 试剂管理员（含安全员子角色）
- 系统管理员

### 核心价值
- 把线下纸质领用台账电子化，支持管控试剂的合规可追溯
- 减少库存浪费、过期、重复采购
- 领导可见实时统计

## 2. 范围

### In Scope
- 试剂主数据与批次库存管理
- 领用型（消耗）申请、审批、发放流程
- 管控试剂（易制毒 / 易制爆 / 剧毒 / 麻精）双人见证 + 全链路审计
- 采购申请与入库
- 库存预警（有效期、安全阈值）
- 多实验室数据隔离
- Web（桌面浏览器）+ 微信小程序 双端

### Out of Scope（本期不做）
- 硬件集成（条码枪 / RFID / 智能柜 / 电子秤）
- 借用型（归还式）流程
- 私有化部署
- 原生 iOS / Android APP
- 跨校 / 跨公司 SaaS 租户自助注册（预留多租户结构，但运营侧手动开通）

## 3. 技术架构

### 3.1 技术栈
| 层 | 选型 | 备注 |
|---|---|---|
| Web 前端 | Next.js 14 + React 18 + TypeScript + Tailwind + shadcn/ui | App Router |
| 小程序 | Taro 4 + React 语法 | 与 Web 共享业务 hook / 类型 |
| 后端 API | NestJS 10 + TypeScript | 独立服务，非 Next.js API Routes |
| ORM | Prisma 5 | PostgreSQL migrations |
| 主数据库 | PostgreSQL 16 | |
| 缓存 / 队列 | Redis 7 + BullMQ | 审批流状态、定时提醒 |
| 对象存储 | 阿里云 OSS（可替换为 MinIO） | MSDS、发票、电子签名 |
| 通知 | 邮件（SMTP）+ 小程序订阅消息 | |
| 鉴权 | JWT（access + refresh）+ 小程序 code2session | |
| 部署 | Docker + 阿里云 K8s（前期可 Vercel + Railway） | |

### 3.2 架构图

```
┌─────────────┐    ┌─────────────┐
│  Web 端      │    │ 微信小程序    │
│ Next.js/React│    │   Taro      │
└──────┬──────┘    └──────┬──────┘
       │ HTTPS + JWT      │
       └────────┬─────────┘
                ▼
      ┌──────────────────┐
      │  NestJS API       │
      │  (权限/审批/审计)  │
      └────────┬──────────┘
               │
     ┌─────────┼──────────────┬───────────┐
     ▼         ▼              ▼           ▼
 PostgreSQL  Redis       对象存储     邮件/订阅消息
```

### 3.3 关键决策
- **后端独立 NestJS**：审批流、定时任务、拦截器式权限在 NestJS 里结构更清晰；Web 与小程序共用同一套 API
- **多租户 = 实验室**：数据按 `labId` 行级隔离，预留 `tenantId` 字段为后续跨院系扩展
- **全链路审计**：所有写操作经统一拦截器写入 `AuditLog`，管控试剂操作额外增强
- **软删除**：业务表均含 `deletedAt`，合规要求数据可追溯

## 4. 数据模型

### 4.1 实体关系
```
User ──┬── belongsTo ──► Lab
       └── hasRole ────► Role (多对多)

Reagent (试剂主数据)
  └─ hasMany ──► ReagentStock (批次)

Request (领用申请)
  ├─ belongsTo Reagent & ReagentStock
  ├─ hasMany Approval
  └─ hasOne IssueRecord

PurchaseRequest
  └─ 入库后关联 ReagentStock

AuditLog (不可变)
```

### 4.2 主要字段
| 实体 | 关键字段 |
|---|---|
| User | id, name, email, phone, labId, roles[], wechatOpenId, deletedAt |
| Lab | id, name, building, contactUserId, tenantId |
| Role | PLAIN_USER / LAB_HEAD / REAGENT_ADMIN / SAFETY_OFFICER / SYS_ADMIN |
| Reagent | id, name, cas, formula, hazardLevel(普通/危险/管控), controlType(易制毒/易制爆/剧毒/麻精/null), msdsFileUrl, category |
| ReagentStock | id, reagentId, labId, batchNo, mfgDate, expireDate, initialQty, currentQty, unit, location, supplier, purchasePrice |
| Request | id, applicantId, reagentId, stockId, quantity, purpose, projectRef, useLocation, status(draft→pending→approved→issued→closed / rejected / cancelled), needDoubleWitness |
| Approval | requestId, approverId, level, action, comment, createdAt |
| IssueRecord | requestId, issuerId, receiverId, actualQty, witnessId, signatureUrl, createdAt |
| PurchaseRequest | id, reagentId, quantity, reason, status(pending→approved→ordered→received), linkedStockId |
| AuditLog | actorId, action, entityType, entityId, before(JSON), after(JSON), ip, createdAt |

## 5. 业务流程

### 5.1 普通试剂领用
```
申请(draft) → 提交(pending) → 实验室负责人审批(approved)
            → 管理员发放(issued) → 自动扣减库存 → 关闭(closed)
```
- 库存不足时提交按钮禁用
- 48h 未审批自动提醒；7 天未处理自动取消

### 5.2 管控试剂领用（强合规）
```
申请(必填 ≥50 字用途、项目、使用地点)
  → 负责人审批
  → 安全员二审
  → 管理员 + 见证人 双人同时发放
  → 领用人电子签名
  → 全量写入 AuditLog
```
- 每月自动生成管控试剂使用台账（Excel）
- 见证人必须与发放人不同

### 5.3 采购申请
```
任何人提需求 → 管理员汇总（可合并同试剂多人需求）
  → 负责人审批预算 → 线下下单 → 到货入库生成新批次
```

### 5.4 库存预警（定时任务）
每日 08:00 扫描：
- 有效期 < 30 天
- 库存 < 安全阈值
- 管控试剂余量对账异常

推送给对应实验室管理员（订阅消息 + 邮件）。

## 6. 权限矩阵

| 模块 | 普通 | 负责人 | 管理员 | 系统管理员 |
|---|:-:|:-:|:-:|:-:|
| 查试剂 / MSDS | ✅ | ✅ | ✅ | ✅ |
| 提交领用 | ✅ | ✅ | ✅ | — |
| 审批普通试剂 | — | ✅（本 lab）| — | — |
| 管控二审（安全员）| — | — | ✅ | ✅ |
| 库存增删 / 调拨 | — | — | ✅ | ✅ |
| 发放试剂 | — | — | ✅ | — |
| 管控见证 | — | ✅ | ✅ | — |
| 采购发起 | ✅ | ✅ | ✅ | — |
| 采购审批 | — | ✅ | — | ✅ |
| 统计报表 | 本人 | 本 lab | 本 lab | 全部 |
| 管控台账导出 | — | ✅ | ✅ | ✅ |
| 用户 / 角色管理 | — | — | — | ✅ |
| 审计日志 | — | — | — | ✅ |

角色可叠加；数据边界按 `labId` 过滤。

## 7. 模块划分

### Web 端
- 工作台
- 试剂百科（搜索 / MSDS 查看）
- 领用申请（发起 / 我的 / 待我审批）
- 库存管理（总览 / 入库 / 调拨 / 发放台账 / 过期预警）
- 采购管理
- 管控台账
- 统计报表
- 系统设置（用户 / 角色 / 实验室 / 柜位 / 审计日志）

### 小程序端（精简高频）
- 工作台
- 扫码查试剂（暂用搜索代替扫码）
- 我的申请
- 待办审批
- 消息通知

## 8. 非功能需求

| 项 | 目标 |
|---|---|
| 性能 | 500 在线用户，P95 接口 < 300ms |
| 可用性 | 99.5%（SaaS 单区域） |
| 数据合规 | 管控试剂日志 10 年不可删改 |
| 安全 | HTTPS 全链路、密码 bcrypt、管控操作强制 2FA（预留） |
| 可观测 | 结构化日志 + Sentry + 基础 Prometheus 指标 |
| 国际化 | 仅简体中文（本期） |

## 9. 交付与里程碑（预估）

| 阶段 | 产出 | 预估工期 |
|---|---|---|
| M1 基础设施 | 项目骨架、鉴权、用户/实验室/角色 | 1.5 周 |
| M2 试剂与库存 | 试剂百科、批次库存、入库 | 2 周 |
| M3 领用流程 | 普通试剂申请 / 审批 / 发放 | 2 周 |
| M4 管控合规 | 双人见证、审计、台账导出 | 1.5 周 |
| M5 采购与预警 | 采购流程 + 定时任务 | 1 周 |
| M6 小程序 | Taro 端 4 大高频场景 | 2 周 |
| M7 报表与联调 | 统计报表、UAT、上线 | 1.5 周 |
| **合计** | | **约 11.5 周** |

## 10. 风险与未决项

- **管控试剂合规口径**：不同高校/公司执行尺度不同，需在 M4 前与实际合规方核对一次
- **电子签名法律效力**：本期使用图片签名，如需 CA 证书签名需额外对接第三方
- **小程序订阅消息模板**：需提前在微信公众平台申请并审核
- **MSDS 数据来源**：首期人工上传，未来可接入第三方 MSDS 数据库（如 ChemBK）

## 11. 后续（Out of Scope 中的 future work）

- 硬件集成（条码 / RFID / 智能柜）
- 借用型流程扩展
- AI 辅助：MSDS 自动解析、用量预测、采购推荐
- 跨租户 SaaS 自助注册
