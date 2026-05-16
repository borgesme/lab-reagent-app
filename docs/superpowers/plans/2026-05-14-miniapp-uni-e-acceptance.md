# Plan E — miniapp-uni 多端验收与发版

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **本 plan 的写法约定：** 与 plan A-D 不同,本 plan **以"验收 + 实测"为主,几乎不动代码**——每个 task 对应一条 DoD 验收项,给出可执行命令 + 期望输出 + 卡住时的诊断分支。本 plan 完成 = miniapp-uni v1 可发版。

**Goal:** 完成 spec §8 全部 9 项 DoD(plan D 已覆盖 #3,plan A/B/C 已覆盖 #1 基线);打 tag `miniapp-uni-v1`;确认老 Taro 工程 `apps/miniapp` 仍可 build/dev。

**Architecture:** 无新代码架构。如某项 DoD 卡住,**就地小修**(<30 行),不重构;修不动的留 fix task 推到后续 PR。

**Tech Stack:** 沿用 plan A-D,无新依赖。微信开发者工具(用户本地安装)用于 DoD #4。

**Spec:** [`docs/superpowers/specs/2026-05-14-miniapp-uni-design.md`](../specs/2026-05-14-miniapp-uni-design.md) §8 全 9 项 DoD。

**前置:** Plan A/B/C/D 已完成。`pnpm --filter @app/miniapp-uni dev:h5` 可正常启动;DoD #3 端到端流程在 H5 跑通(plan D 已验证)。

---

## DoD 矩阵(本 plan 完成时全 9 项打勾)

| # | DoD | 由哪个 plan 覆盖 | 本 plan task |
|---|---|---|---|
| 1 | vitest 38+ 用例全过 | plan A/B/C 累计 ~42(plan D 不增减) | E1(确认不退化) |
| 2 | build:h5 + build:mp-weixin 双成功 | plan D Step D9.3 仅 h5 | E2(补 mp-weixin) |
| 3 | H5 admin 端到端 8 步跑通 | plan D Step D9.2 已完成 | — |
| 4 | 微信开发者工具同链路跑通 | — | E3 |
| 5 | 401 自动 refresh 实测 | plan B 单测覆盖逻辑,本项实测 | E4 |
| 6 | tokenVersion 失效实测 | plan B 单测覆盖逻辑,本项实测 | E5 |
| 7 | 三个环境变量在 build:production 后正确 | plan A 已就位 dev,本项验 prod | E6 |
| 8 | i18n 切换中英重启后保留 | plan B locale.ts + plan D mine 页 | E7 |
| 9 | 老 Taro 工程不动可继续 build | — | E8 |

末尾 **E9** 打 tag + MEMORY.md。

---

## Task E1: vitest 不退化(DoD #1)

**Files:** 无修改

- [ ] **Step E1.1**: 跑全量测试

```bash
pnpm --filter @app/miniapp-uni test
```

**预期输出:**
- Test Files **≥6** passed(plan A:1 + plan B:5 + plan C:0~1)
- Tests **≥38** passed(spec DoD 下限),实际累计 ≈42(plan B ≈29 新 + plan A ≈3 + plan C ≈3 hooks 单测)
- 0 failed

**卡住时:**
- 个别用例红:看 stderr,大概率 plan D 引入的页面 import 触发副作用——把违规 import 改成 lazy 或加 vitest `vi.mock`
- 全部红/启动失败:`pnpm --filter @app/miniapp-uni install` 重装一次;检查 `vitest.setup.ts` 是否被 plan D 误改

- [ ] **Step E1.2**: 截图/记笔记后**继续**(无 commit,本 step 只是验证)

---

## Task E2: build:h5 + build:mp-weixin 双成功(DoD #2)

**Files:** 可能需要 `vite.config.ts` 微调(若 mp-weixin 报某模块解析失败)

- [ ] **Step E2.1**: H5 生产 build

```bash
pnpm --filter @app/miniapp-uni build:h5
```

**预期:**
- 退出码 0
- 产物 `apps/miniapp-uni/dist/build/h5/` 生成
- 主 chunk size **< 4 MB**(plan A spec §9.1 风险表,微信小程序 2MB 主包是 mp 端约束,H5 宽松些)
- 控制台无 `optimizeDeps` warning

**卡住时:**
- `@app/shared` 解析失败:回看 plan A Phase 0 spike S1 备选(临时 `src/types/shared.ts` 副本)
- uview-plus easycom 报错:看是否 plan D 误删 `vite.config.ts` 的 `uni()` 默认 easycom 配置

- [ ] **Step E2.2**: 微信小程序 build

```bash
pnpm --filter @app/miniapp-uni build:mp-weixin
```

**预期:**
- 退出码 0
- 产物 `apps/miniapp-uni/dist/build/mp-weixin/` 生成
- 主包大小 ≤ 1.8 MB(预留 0.2 MB buffer,微信限 2 MB)
- 各子包(search、report-summary、my-requests、approvals 等若已分包)各 ≤ 1.5 MB(微信单分包 2 MB 上限)
- 控制台无 path 解析错误、无 `Cannot find` 缺包错

**卡住时(高概率,uview-plus + uniapp alpha 在 mp-weixin 上 corner case 多):**

| 错误 | 处置 |
|---|---|
| `Error: Cannot find module 'uview-plus/components/...'` | 检查 `manifest.json` 的 `mp-weixin.optimization` `subPackages` 是否误配置;清 `node_modules/.cache` 重试 |
| 主包 > 2 MB | 紧急把 `pages/search` `pages/report-summary` 加入分包:`pages.json` `subPackages` 数组加 `{ root: 'package-business', pages: [...] }`(spec §6.2 已规划) |
| `wx.xxx is not a function` 链路报错 | 大概率 plan D 某页用了 `Taro.xxx` 没替换;搜索 `Taro\\.` 全文清理 |
| theme.scss `@import` 解析失败 | uview-plus 在 mp 端某 alpha 版需要 `manifest.json` mp-weixin `setting.compileType` 调整;查 uview-plus issue 区 |

- [ ] **Step E2.3**: 若 E2.2 卡在主包大小,做**最小分包**(只动 `pages.json`,不改任何 .vue 文件):

```jsonc
{
  "pages": [
    // 保留:login、home、my-requests、approvals、notifications、mine
  ],
  "subPackages": [
    {
      "root": "package-business",
      "pages": [
        "pages/search/index",
        "pages/report-summary/index"
      ]
    }
  ]
}
```

并把对应 .vue 物理路径从 `src/pages/search/` 移到 `src/package-business/pages/search/`(或软链/复制再清旧路径,任选)。
TabBar 与 home 中跳转 url 改成 `/package-business/pages/search/index`。`uni.navigateTo` 自动按 manifest 找到分包。

- [ ] **Step E2.4**: 两端构建成功后 commit

```bash
git add apps/miniapp-uni
git commit -m "chore(miniapp-uni): build:h5 + build:mp-weixin 双双成功（DoD #2）"
```

---

## Task E3: 微信开发者工具跑通同链路(DoD #4)

**Files:** 无修改

- [ ] **Step E3.1**: 启动 dev:mp-weixin

```bash
# 终端 1:后端
pnpm --filter @app/api start:dev

# 终端 2:miniapp-uni 微信端 dev
pnpm --filter @app/miniapp-uni dev:mp-weixin
```

第二条命令会持续 watch,产物输出到 `apps/miniapp-uni/dist/dev/mp-weixin/`。

- [ ] **Step E3.2**: 打开微信开发者工具
  - 项目目录:`apps/miniapp-uni/dist/dev/mp-weixin/`
  - AppID:`touristappid`(spec §8 DoD #4 指定)
  - 不校验合法域名/不校验 HTTPS:开发设置勾选(测试 dev 后端用 http)

- [ ] **Step E3.3**: 按 plan D Step D9.2 同 8 步操作:

1. 启动看到 login 页(custom 导航栏 + 微信胶囊不重叠)
2. admin@lab.local / admin123 登录 → 切到 home tab → 显示用户名 + 未读数
3. home 搜索"乙醇" → 进 search 页 → 列表正常
4. switchTab 申请 → 切领用 → picker 弹出能选 → 提交 → 列表多一条
5. switchTab 审批 → 一审通过 → 列表移除该条
6. switchTab 消息 → 收到通知 → 标记已读
7. switchTab 我的 → 改密码 → toast"密码已更新" → 当前 session 没被踢
8. 我的页 → 退出登录 → 回 login

**所有步骤通过 = DoD #4 ✓**。

**卡住时:**
- 网络请求失败:检查"不校验合法域名"是否生效;检查 `.env.development` `VITE_BASE_URL` 在 mp 端是不是 `http://localhost:3001/api/v1`(mp 端必须完整 URL)
- 胶囊重叠:NavBar `paddingRight: capsuleRightSpace` 是不是在 `#ifdef MP-WEIXIN` 条件分支里(plan C useWxCapsuleRect hook 的实现)
- u-picker 弹不出:uview-plus 在 mp-weixin alpha 通道有时需要 `<u-overlay>` 配套;按官方 issue 处理

- [ ] **Step E3.4**: commit(可空)

```bash
git commit --allow-empty -m "chore(miniapp-uni): 微信开发者工具端到端跑通（DoD #4）"
```

---

## Task E4: 401 自动 refresh 实测(DoD #5)

**Files:** 无修改

- [ ] **Step E4.1**: 在 H5 dev 环境登录后,**手动改坏 access token**
  - 浏览器 DevTools → Application → Local Storage → `mp.tokens` 这一项
  - 把 `accessToken` 改成 `"INVALID_TOKEN_XXX"`(refreshToken 别动)

- [ ] **Step E4.2**: 触发任意需要鉴权的请求
  - 最简单:home 页拉一下(下拉刷新或重进)
  - 或者点"我的申请" tab

- [ ] **Step E4.3**: 观察 Network 面板
  - 第 1 个请求 → 401(响应 body code 1001 或 status 401,具体看 `api/request.ts` 的判别逻辑)
  - 自动发出 `/auth/refresh` → 200,返回新 tokens
  - 自动重发原请求 → 200,返回业务数据
  - **业务页面正常显示,用户无感知**

**期望:** 用户体感**没有被踢,没有 toast**。Local Storage `mp.tokens` 已更新为新 accessToken。

**卡住时:**
- 重发原请求又 401 死循环:`api/request.ts` 的 `refreshInflight` 锁可能没正确释放——加 `console.log` 看 refresh promise 是不是有泄漏
- 直接被踢到 login:可能 refresh 请求本身被走了"401 触发 refresh"分支——检查 `request.ts` 是否对 `/auth/refresh` 加了 bypass

- [ ] **Step E4.4**: commit(可空)

---

## Task E5: tokenVersion 失效实测(DoD #6)

**Files:** 无修改

- [ ] **Step E5.1**: 同时开 2 个浏览器(或一个普通窗口 + 一个无痕)
  - 窗口 A:`apps/web` dev,登录 admin
  - 窗口 B:`apps/miniapp-uni` H5 dev,登录 admin(注意同一 admin 账号)

- [ ] **Step E5.2**: 窗口 A → 改密码
  - profile 页改 admin123 → admin456 → 成功 toast
  - 当前 web session 不被踢(P0-3 验证过)
  - **服务端 admin 的 tokenVersion 已 ++**

- [ ] **Step E5.3**: 窗口 B(miniapp-uni)→ 触发任意请求
  - 点击 home 或下拉刷新
  - 第 1 个请求(用旧 access token) → 401 → 自动 refresh → refresh 也 401(因为 refresh token 也带 tokenVersion 不匹配)→ `useAuth().clear()` → `uni.reLaunch('/pages/login/index')`

**期望:** miniapp-uni 端自动回到 login 页,看到 toast"登录已失效"(或类似 i18n key)。

**卡住时:**
- 用旧密码还能用:web 端改密没生效,看 `apps/api` `/auth/change-password` 是不是真有 tokenVersion 自增逻辑(P0-3 commit `299821a` 已实装)
- 一直 401 不跳:`api/request.ts` 的 403/refresh-failed 分支可能没调 `useAuth().clear()`——回看 plan B B5

- [ ] **Step E5.4**: 改回原密码(admin456 → admin123),方便后续测试

- [ ] **Step E5.5**: commit(可空)

---

## Task E6: 环境变量 build:production 实测(DoD #7)

**Files:** 无修改

- [ ] **Step E6.1**: 临时在 `apps/miniapp-uni/src/pages/login/index.vue` 顶部 `<script setup>` 加调试 log:

```ts
import { env } from '@/config/env';
console.log('[env]', env);
```

- [ ] **Step E6.2**: build prod

```bash
pnpm --filter @app/miniapp-uni build:h5 --mode production
```

(uniapp+vite 默认 `build:h5` 已是 prod mode;若需要可加 `--mode production` 显式)

- [ ] **Step E6.3**: serve 起 `dist/build/h5/`

```bash
# 用任意静态服务器,如 npx
npx serve apps/miniapp-uni/dist/build/h5 -p 5180
```

打开 `http://localhost:5180` → DevTools Console 看 `[env] { appEnv: 'production', routerBase: '/', baseUrl: 'https://api.example.com/api/v1', isProd: true, isDev: false }`(具体 baseUrl 看 `.env.production` 的实际值)。

**期望:** 三个变量值与 `.env.production` 一致;不是 dev 默认值;`isProd === true`。

- [ ] **Step E6.4**: 删除 E6.1 临时 log,**不留 console**

- [ ] **Step E6.5**: commit

```bash
git commit -am "chore(miniapp-uni): 环境变量 build:production 实测通过（DoD #7）"
```

---

## Task E7: i18n 切换实测(DoD #8)

**Files:** 无修改

- [ ] **Step E7.1**: H5 dev 启动,login 进 mine 页

- [ ] **Step E7.2**: 点"语言 / Language" cell → action-sheet 选 `English`
  - **预期立即生效**:
    - TabBar 5 个名称变 `Home / Apply / Approve / Notice / Mine`(或 spec 约定的英文名)
    - 当前页所有 cell 标题、按钮文字变英文
    - NavBar 标题变英文

- [ ] **Step E7.3**: 触发一次失败请求(比如改密 oldPassword 输错)
  - toast 应是英文 `Network error` / `Wrong password` 等

- [ ] **Step E7.4**: 关掉浏览器 tab,重开 dev URL
  - 进 mine 页,**仍是英文**(`mp.locale` 持久化)

- [ ] **Step E7.5**: 切回中文,关 tab 再开,**仍是中文**

**期望全程:**
- 无运行时缺 key warning(`[intlify] Not found 'xxx.yyy' key`)
- 所有 `$t(...)` 引用立即更新,不需要 reload

**卡住时:**
- 切了语言不变:vue-i18n composition 模式下,`useI18n()` 拿到的 `t` 不是响应式根?——检查 plan B `locale/index.ts` 是不是用了 `legacy: false` + globalInjection
- toast 还是中文:`apiRequest` 用的 `i18n.global.t(...)` 没在 setLocale 后切换?——`setLocale` 应该同时改 `i18n.global.locale.value`

- [ ] **Step E7.6**: commit(可空)

---

## Task E8: 老 Taro 工程不动可继续 build(DoD #9)

**Files:** 无修改(若发现被改动,直接 `git checkout apps/miniapp`)

- [ ] **Step E8.1**: 看 git history 期间 `apps/miniapp/` 是否被动过

```bash
git log --oneline -- apps/miniapp/ | head -20
```

**预期:** 自 plan A 开工(commit `318f876` 之后)无任何 `apps/miniapp/` 提交。

- [ ] **Step E8.2**: 跑老 Taro 的 dev

```bash
pnpm --filter @app/miniapp dev:h5
```

**预期:** 启动成功(取 P6/P7 状态),浏览器进首页能看到 Taro 版 login 页。

- [ ] **Step E8.3**: 跑老 Taro 的 build

```bash
pnpm --filter @app/miniapp build:h5
```

**预期:** 退出码 0,产物 `apps/miniapp/dist/` 生成。

**卡住时:**
- pnpm-workspace 公共依赖被 miniapp-uni 升级带飞:看 `pnpm-lock.yaml` diff,若 Taro 用的 `@tarojs/cli`/`taro` 版本被改动,**回退** `pnpm-lock.yaml`(`git checkout pnpm-lock.yaml`)然后 `pnpm install --frozen-lockfile`
- `@app/shared` build 改了类型导出,Taro 端 ts 报错:回看 plan A 是否为兼容性而升级 shared 的导出格式

- [ ] **Step E8.4**: commit(可空)

```bash
git commit --allow-empty -m "chore: 老 Taro 工程 apps/miniapp 仍可 dev/build（DoD #9）"
```

---

## Task E9: 打 tag + MEMORY.md(收官)

**Files:** Modify `MEMORY.md`(根目录)+ 加新 memory file

- [ ] **Step E9.1**: 最后一次 git status 自检

```bash
git status --short
git log --oneline -20
```

确认:
- 工作区 clean(或仅 MEMORY.md 这一改)
- 提交链路完整,plan A→B→C→D→E 每个 plan 至少一个 commit

- [ ] **Step E9.2**: 打 tag

```bash
git tag -a miniapp-uni-v1 -m "miniapp-uni v1 — uniapp+Vue3+TS+uview-plus, DoD 全 9 项通过"
# 用户决定是否 push:
# git push origin miniapp-uni-v1
```

**注意:** push 是远端可见操作,本 plan 不自动 push;让用户决定。

- [ ] **Step E9.3**: 写 memory file

`C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_miniapp_uni_complete.md`

```markdown
---
name: miniapp-uni v1 完成
description: uniapp+Vue3+TS+uview-plus 工程落地,8 页业务全迁,DoD 全 9 项通过,tag miniapp-uni-v1
type: project
---

miniapp-uni v1 完成,与老 Taro 工程 `apps/miniapp` 并存。

**Why:** Taro 端三端打包问题与 uview-plus 生态匹配度,通过 uniapp+Vue3 alpha 通道重构;Art-app 作参考。

**How to apply:**
- 5 plan(A 脚手架、B 基建、C UI 骨架、D 业务页、E 验收)全部完成,各自有 commit
- vitest ≈42 用例,build:h5 + build:mp-weixin 双成功
- 老 `apps/miniapp` 不动,可继续 dev/build
- 后续优化以单独 PR 推进:表单校验、骨架屏、search 分页、mine 头像、approvals 批量、业务页 vitest、微信真机回归、分包优化
```

- [ ] **Step E9.4**: 更新根 `MEMORY.md` 加一行

```
- [miniapp-uni v1 完成](project_miniapp_uni_complete.md) — uniapp+Vue3+TS+uview-plus 8 页全迁,DoD 全 9 项,tag miniapp-uni-v1
```

- [ ] **Step E9.5**: 收官 commit

```bash
git add MEMORY.md  # 实际是 ~/.claude/.../memory/,看仓库是否纳管;若不纳管这一步跳过
git commit --allow-empty -m "chore: miniapp-uni v1 发版（DoD 全 9 项 + tag miniapp-uni-v1）"
```

---

## Plan E 验收标准(= 全 spec 验收)

1. ✅ DoD #1:`pnpm --filter @app/miniapp-uni test` ≥38 用例全过
2. ✅ DoD #2:build:h5 + build:mp-weixin 双成功
3. ✅ DoD #3:H5 admin 端到端 8 步跑通(plan D 已覆盖)
4. ✅ DoD #4:微信开发者工具 8 步跑通
5. ✅ DoD #5:401 自动 refresh 用户无感知
6. ✅ DoD #6:web 端改密 → miniapp-uni 自动登出
7. ✅ DoD #7:三个环境变量在 production build 后正确
8. ✅ DoD #8:中英切换立即生效,重启保留
9. ✅ DoD #9:老 `apps/miniapp` 仍可 dev/build
10. ✅ tag `miniapp-uni-v1` 已打
11. ✅ MEMORY.md 收录完成笔记

---

## 留给后续优化 PR(本 plan 不做,与 plan D 末尾"留给后续"合并)

**P1(高优,建议两周内):**
- 业务页 vitest 用例(目前业务页 0 测试)
- 微信小程序真机回归(开发者工具 ≠ 真机,iOS/Android 各扫码一次)
- 分包优化按 spec §6.2 完整落地(search/report-summary/my-requests/approvals 进 `package-business/`)
- 错误重试网络层:5xx 自动重试 1 次

**P2(随业务推进):**
- 表单校验细化(VeeValidate 或自实现)
- 列表骨架屏 `<u-skeleton />`
- search 后端分页 + `useRefreshList` 真分页
- mine 页头像上传
- approvals 批量决策
- 推送通知 / 网络断线监听
- i18n 业务文案全量(目前仅按钮+toast+tabBar+NavBar 标题)

**P3(长尾):**
- 微信一键登录 / 手机号登录
- 老 Taro 工程归档/删除决策
- 内测水印 / 调试面板(`config/env.ts` 已暴露 isDev)

---

## 收尾说明

完成本 plan 时,工程整体状态:

| 维度 | 状态 |
|---|---|
| 代码 | `apps/miniapp-uni/` 8 页完整 + 6 api modules + 3 hooks + 2 navigation 组件 + i18n + auth-store + persist |
| 测试 | vitest ≈42 用例(plan A:3 + plan B:~29 + plan C:~3 + 复用 plan A spike) |
| 构建 | h5 + mp-weixin 双双成功;主包 < 2 MB(分包后) |
| 发版 | tag `miniapp-uni-v1` |
| 共存 | `apps/miniapp`(Taro)和 `apps/miniapp-uni` 并存,后续灰度切流逐步淘汰 Taro |
| 文档 | spec + 5 plan + MEMORY.md 笔记 |

**下游 PR 起点:** 在本 tag 基础上开 PR;不与本 plan 同 PR 混提。
