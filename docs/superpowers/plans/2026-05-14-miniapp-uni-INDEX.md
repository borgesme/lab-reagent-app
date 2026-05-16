# miniapp-uni 重构实施计划 — 总览索引

**Spec:** [`docs/superpowers/specs/2026-05-14-miniapp-uni-design.md`](../specs/2026-05-14-miniapp-uni-design.md)

**Goal:** 以 `apps/Art-app` 为参考模板，新建 `apps/miniapp-uni`（uniapp + Vue3 + TS + uview-plus），与老 Taro 工程并存。

**拆分思路:** 50+ task 单 plan 难管理，按"工程切片"拆 5 个 plan，每个独立可 commit / 可验证 / 可回退。串行依赖：A → B → C → D → E。

---

## Plan A — 工程脚手架与 spike
**File:** [`2026-05-14-miniapp-uni-a-scaffold.md`](./2026-05-14-miniapp-uni-a-scaffold.md)

完成 spec §3.1-§3.4（目录骨架/技术栈/scripts/env vars）+ §4.1（uview-plus 接入）+ §4.3（全局样式骨架），含 Phase 0 spike S1/S2/S3 验证。

**验收:** `pnpm --filter @app/miniapp-uni dev:h5` 启动；浏览器看到占位 home 页，含 1 个 emerald `u-button`；spike S1（@app/shared 可 import）/S2（vitest 可跑）/S3（vue-i18n 可工作）全通过。

---

## Plan B — 基建：状态/i18n/网络
**File:** [`2026-05-14-miniapp-uni-b-infra.md`](./2026-05-14-miniapp-uni-b-infra.md)

完成 spec §5.1-§5.4（auth-store + api/request + 6 modules + hooks 之 useBootTokenRefresh）+ §4.6（vue-i18n）+ §3.4 `config/env.ts`。

**验收:** `pnpm --filter @app/miniapp-uni test` ≈35 用例全过；占位 home 页能调通 `auth.me()` 显示用户名（手动用 admin 登录后）。

---

## Plan C — UI 骨架：hooks + 自定义导航
**File:** [`2026-05-14-miniapp-uni-c-ui-shell.md`](./2026-05-14-miniapp-uni-c-ui-shell.md)

完成 spec §4.2 自定义导航（NavBar + TabBar）+ §4.4 反馈 + §4.5 列表 hook + 剩余 hooks（useRefreshList / useLoginCheck / useWxCapsuleRect）。占位页改造为带导航的 5 tab 壳。

**验收:** 5 tab 切换，每页顶部 NavBar 自动避让微信胶囊；vitest ≈3 个新增 hooks 用例全过（合计 ≈38）。

---

## Plan D — 业务页 1:1 迁移
**File:** [`2026-05-14-miniapp-uni-d-pages.md`](./2026-05-14-miniapp-uni-d-pages.md)

完成 spec §6 全部 8 页（含新 mine 页）。每页基于 Taro 版逻辑 1:1 迁移，UI 用 uview-plus 重写。

**验收:** DoD #3，H5 dev 用 admin 跑通：登录 → 工作台 → 搜索试剂 → 提交领用申请 → 切到审批通过 → 看到通知 → 我的页改密 → 退出登录。

---

## Plan E — 多端验收与发版
**File:** [`2026-05-14-miniapp-uni-e-acceptance.md`](./2026-05-14-miniapp-uni-e-acceptance.md)

完成 DoD #2、#4-#9 全部验收项 + 给工程打 tag。

**验收:** DoD 全 9 项过；tag `miniapp-uni-v1`；老 Taro 工程仍可 build。

---

## 串行依赖说明

- **A 是入口**：没 A 就没法跑 dev、没 vitest 跑测试
- **B 依赖 A**：stores/api 都需要 A 的 main.ts/config/env.ts 在位
- **C 依赖 B**：tab-bar 引用 i18n、NavBar 引用 store
- **D 依赖 C**：业务页用 NavBar/TabBar/CustomBottomArea/useRefreshList
- **E 依赖 D**：验收 DoD #3-#8 需要业务页全部就绪

每个 plan 完成后建议：commit + 在 MEMORY.md 加一条状态笔记，再开下一个 plan。这与本仓库 P6/P7/P8 的工程惯例一致。

---

## 关于 spike 失败的应急策略

Plan A 的 Phase 0 spike 任一不通过时：

| Spike | 失败时 |
|---|---|
| S1 `@app/shared` 消费失败 | 在 plan A 中加 task：临时把 shared 类型 copy 到 `apps/miniapp-uni/src/types/shared.ts`，并加 TODO 跟进 |
| S2 vitest 不能跑 | 整个测试基线降级为 jest（参考 apps/api 配置）；plan B 中所有测试 task 改写为 jest 语法 |
| S3 vue-i18n alpha 不兼容 | 整个 i18n 范围降级为手写 `t(key)` 工具函数（locale/index.ts 自己实现 `t(key, params?)`）；plan B 的 i18n 测试改为对自实现工具的测试 |

无论哪种降级，都不影响 plan C/D/E 的范围与执行。
