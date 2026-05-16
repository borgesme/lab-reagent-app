# Plan D — miniapp-uni 业务页 1:1 迁移（薄 plan）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **本 plan 的写法约定：** 与 plan A/B/C 不同,本 plan **不给完整可粘贴代码**——每页只列 (1) Taro 源文件路径 + 行数;(2) 关键差异点(管控试剂/二审按钮/角色矩阵...);(3) 必须用本工程已有的 hook/component(NavBar/TabBar/useRefreshList/useLoginCheck/api/modules)。具体 template/script 由执行者照着 Taro 版 + 本仓库 `apps/web` 同名页风格现场写。

**Goal:** 把 `apps/miniapp/src/pages/*`(Taro 版,7 页)1:1 迁到 `apps/miniapp-uni/src/pages/*`,并新增 mine 页;UI 全部 uview-plus 重写,emerald 主题。

**Architecture:**
- 每页 **必须** 用 `<NavBar />` + `<TabBar :current="N" />`(仅 tab 页)+ `<CustomBottomArea />`
- 列表页 **必须** 用 `useRefreshList` 包装 API,onShow 触发 `fetchListRefresh`
- 表单页用 `<u-form>` + `<u-form-item>` + `<u-input>` / `<u-textarea>` / `<u-picker>`(`mode="selector"`)
- 业务页 **只 import** `@/api/modules/*`(plan B 已完成),不直接 `apiRequest`
- 错误 toast 已在 `apiRequest` 内部统一处理,业务页 try/catch 仅决定"成功后做什么"
- 角色/scope:从 `useAuth().user.roles` 推断,用 `@app/shared` 的 `REPORT_SCOPE_MATRIX`

**Tech Stack:** 沿用 plan A/B/C,无新依赖。

**Spec:** [`docs/superpowers/specs/2026-05-14-miniapp-uni-design.md`](../specs/2026-05-14-miniapp-uni-design.md) §6 全部 + §4.4 反馈约定。

**前置:** Plan A/B/C 已完成。

---

## 全局映射:Taro / @tarojs/components → uview-plus / uni-app

执行迁移时,**逐页**用下表做机械替换;表里没列出的元素(`View`/`Text`/`Image` 等基础元素)直接换成对应 `view`/`text`/`image` uniapp 内置组件(全部小写)。

| Taro 端写法 | uniapp + uview-plus 替换 | 备注 |
|---|---|---|
| `<View />` | `<view />` | 基础容器 |
| `<Text />` | `<text />` | |
| `<Input value={x} onInput={e => set(e.detail.value)} />` | `<u-input v-model="x" />` | `u-input` 自动双向绑;`type="password"` 替代 Taro `password` |
| `<Textarea value={x} onInput={...} />` | `<u-textarea v-model="x" />` | |
| `<Button type="primary" onClick={fn}>X</Button>` | `<u-button type="primary" @click="fn" text="X" />` | 文字走 `text` prop,也可用 slot |
| `<Button size="mini" />` | `<u-button size="mini" />` 或 `<u-button :customStyle="{height:'56rpx',padding:'0 20rpx'}" />` | uview-plus 的 mini 体感与 Taro 不同,UI 走查可调 |
| `<Picker mode="selector" range={list.map(r=>r.name)} value={i} onChange={e=>set(e.detail.value)}>` | `<u-picker :show="show" :columns="[list.map(r=>r.name)]" @confirm="on" @cancel="show=false" />` + 触发器另写 | 体验更近 uview-plus 原生;参考 uview-plus 文档 |
| 内联 `style={{ padding:'24rpx' }}` | 用 plan A 的 `styles/common.scss`/`flex.scss` 工具类(`.p-24` `.mt-16` `.flex-center` 等),不再写内联 | emerald 工程的视觉一致性靠 utility classes 维护 |
| `useState` + 手动 fetch | 改用 `useRefreshList(api, opts)`(列表) / `ref` + `onShow`(详情) | onShow 来自 `@dcloudio/uni-app` |
| `useDidShow(() => refresh())` | `import { onShow } from '@dcloudio/uni-app'; onShow(() => list.fetchListRefresh())` | |
| Taro `useEffect` 取 router 参数 | `import { onLoad } from '@dcloudio/uni-app'; onLoad((options) => { keyword = options?.q ?? '' })` | uniapp 用 `onLoad(options)` 收页面参数 |
| `Taro.switchTab({ url })` | `uni.switchTab({ url })` | API 同名 |
| `Taro.navigateTo({ url })` | `uni.navigateTo({ url })` | |
| `Taro.reLaunch({ url })` | `uni.reLaunch({ url })` | |
| 错误 `setErr(e.message)` + 页内显示 | 删除——`apiRequest` 已内部 toast | 业务页 try/catch 留空 catch 或仅做"恢复 UI"(关 loading) |
| 硬编码中文 | 改 `$t('common.submit')` / `$t('toast.networkError')` 等;缺 key 时在 `src/locale/{zh-CN,en}.ts` **补一行**再用 | 见下文"i18n key 补充清单" |

---

## 文件对照表

| 序号 | uniapp 目标文件 | Taro 源参考 | 源行数 | 业务复杂度 |
|---|---|---|---|---|
| 1 | `apps/miniapp-uni/src/pages/login/index.vue` | `apps/miniapp/src/pages/login/index.tsx` | 86 | 低(plan C 已有临时版,本 plan 完善) |
| 2 | `apps/miniapp-uni/src/pages/home/index.vue` | `apps/miniapp/src/pages/home/index.tsx` | 128 | 低(plan C 已有占位壳,本 plan 完善) |
| 3 | `apps/miniapp-uni/src/pages/search/index.vue` | `apps/miniapp/src/pages/search/index.tsx` | 88 | 低 |
| 4 | `apps/miniapp-uni/src/pages/notifications/index.vue` | `apps/miniapp/src/pages/notifications/index.tsx` | 89 | 低 |
| 5 | `apps/miniapp-uni/src/pages/my-requests/index.vue` | `apps/miniapp/src/pages/my-requests/index.tsx` | 401 | **高** |
| 6 | `apps/miniapp-uni/src/pages/approvals/index.vue` | `apps/miniapp/src/pages/approvals/index.tsx` | 252 | 中 |
| 7 | `apps/miniapp-uni/src/pages/report-summary/index.vue` | `apps/miniapp/src/pages/report-summary/index.tsx` | 178 | 中(角色矩阵) |
| 8 | `apps/miniapp-uni/src/pages/mine/index.vue` | **新增** | — | 中(改密/语言/退出/scope) |

合计 7 迁移 + 1 新增 = 8 页。

---

## i18n key 补充清单(本 plan 落地时按需补到 `src/locale/{zh-CN,en}.ts`)

plan B 已就绪 `common` / `toast` / `tabBar` / `pageTitle`。本 plan 补充 `form` 命名空间:

```ts
form: {
  reagent: '试剂', email: '邮箱', password: '密码',
  quantity: '数量', unit: '单位', purpose: '用途', reason: '理由',
  batch: '批次', oldPassword: '当前密码', newPassword: '新密码',
  confirmPassword: '确认新密码', name: '姓名',
  controlledHint: '管控试剂请到 Web 端提交完整信息',
  passwordChanged: '密码已更新,其他设备需重新登录',
  selectReagent: '请选择试剂', selectBatch: '请选择批次',
}
```

EN 镜像翻译同步加。新增 key 时**先补 zh + en 两份再用**,避免运行时缺 key warning。

---

## Task D1: login 页正式版

**Files:** Modify `apps/miniapp-uni/src/pages/login/index.vue`

- [ ] **Step D1.1**: 在 plan C 临时版基础上完善
  - 顶部 NavBar(无返回箭头,因 login 是入口)
  - 表单字段用 `$t('form.email')` / `$t('form.password')`
  - 登录按钮 `:loading` 绑定;按钮文字 `$t('common.login')`
  - 错误处理:`apiRequest` 已 toast,catch 仅 `loading.value = false`
  - 登录成功 → `uni.switchTab({ url: '/pages/home/index' })`(plan C 已是这逻辑,确认保留)

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/login/index.tsx:1-86`)
  - Taro 版 `setSession(tokens, fake user)` 占位再 `auth.me()` 拿真实 user → uniapp 版用 plan B `authApi.login` + `authApi.me`,**保留先 `setTokens` 再 `me()`** 的两步(spec §5.2 `apiRequest` 读 store tokens 注入 Bearer)
  - 页内错误显示删除(`<Text style={{color:'#d33'}}>` 那一段不要),走 toast

- [ ] **Step D1.2**: commit

```bash
git commit -am "feat(miniapp-uni): login 页正式版（uview-plus + i18n + NavBar）"
```

---

## Task D2: home 页正式工作台

**Files:** Modify `apps/miniapp-uni/src/pages/home/index.vue`

- [ ] **Step D2.1**: 在 plan C "工作台壳" 基础上加业务
  - `onShow` 调 `notificationsApi.list(true)` 取未读数,显示徽标(用 `<u-badge :value="unread" />` 放在"消息"快捷入口的 `u-cell` 右侧)
  - 搜索框:`<u-search v-model="keyword" @search="goSearch" />` → `uni.navigateTo({ url: '/pages/search/index?q=' + encodeURIComponent(keyword) })`
  - 用户信息卡:`user.name` + `user.email` + `user.labId ?? $t('common.unassigned')`(注意补 i18n key `common.unassigned`)
  - 4 个快捷入口:我的申请 / 待办审批 / 搜索试剂 / 报表概览(plan C 已有 cell-group 雏形,本 plan 加图标 `<u-cell :icon="...">`,emerald 色)
  - 角色受限:`approvals` cell 仅 `roles` 包含 `LAB_ADMIN`/`PROCUREMENT`/`ADMIN` 时显示;`report-summary` cell 走 `REPORT_SCOPE_MATRIX` 任一报表可见

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/home/index.tsx:1-128`)
  - Taro 版搜索框就放在 home → uniapp 版**保留**(spec §6.2 表 2:home 包含 4 快捷入口,搜索是其中一个入口的形式),但用 `u-search`
  - "未读消息:N" 改为 cell 上的 badge,体验更接近 web 端

- [ ] **Step D2.2**: commit

---

## Task D3: search 页

**Files:** Create `apps/miniapp-uni/src/pages/search/index.vue`

- [ ] **Step D3.1**: 实现搜索 + 列表
  - 顶部 NavBar 标题 `$t('pageTitle.search')` + `showBack`(走 navBack)
  - `<u-search v-model="keyword" @search="onSearch" @clear="onClear" />`
  - 列表用 `useRefreshList(reagentsApi.list)` —— 注意 `reagentsApi.list(q?)` 不接 pageNum/pageSize,**本 plan 加 task D3.2 修整 api/modules/reagents.ts**
  - `onLoad(options)` 读 `options.q`,赋给 keyword + 立即 `fetchListRefresh()`
  - 列表项 `<u-cell>` 标题=试剂名;label 行=CAS + hazardLevel;管控用 `<u-tag type="error" text="管控" plain />`

- [ ] **Step D3.2**(可选): 如果后端 `/reagents` 不支持分页,`useRefreshList` 的 `extract` 自定义返回 `{ records: r, total: r.length }`,loadMore 不触发(直接进 `ended`)。`api/modules/reagents.ts` 暂不动。

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/search/index.tsx:1-88`)
  - Taro 版用 `useEffect` 读 `Taro.getCurrentInstance().router.params.q` → uniapp 版用 `onLoad(options)`
  - 无结果用 `<u-empty :text="$t('toast.noResults')" />`(补 i18n key)

- [ ] **Step D3.3**: commit

---

## Task D4: notifications 页

**Files:** Create `apps/miniapp-uni/src/pages/notifications/index.vue`(覆盖 plan C 占位)

- [ ] **Step D4.1**: 实现列表 + 标记已读
  - NavBar 左 slot 标题,**右 slot** 放"全部已读" `<u-button size="mini" :text="$t('common.readAll')" @click="markAll" />`
  - `useRefreshList(notificationsApi.list)` —— extract 同 D3,无分页
  - 列表项:未读黄底 `#fffbe6`,已读灰底 `#fafafa`;点击未读 → `notificationsApi.read(id)` → `list.fetchListRefresh()`
  - 时间戳 `new Date(n.createdAt).toLocaleString()`
  - 空态 `<u-empty :text="$t('toast.noNotifications')" />`(补 i18n key)

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/notifications/index.tsx:1-89`)
  - 头部"通知 + 全部已读"按钮 → 移到 NavBar right slot,腾出页面顶部空间

- [ ] **Step D4.2**: commit

---

## Task D5: my-requests 页(最复杂,401 行)

**Files:** Create `apps/miniapp-uni/src/pages/my-requests/index.vue`(覆盖 plan C 占位)

- [ ] **Step D5.1**: 顶部 tabs + 双列表
  - 顶部 `<u-tabs :list="[{name:'领用'},{name:'采购'}]" v-model:current="tab" />`
  - 两个 `<view v-if="tab===0">` / `<view v-if="tab===1">` 块
  - 每个块上半截:**表单**;下半截:**列表**

- [ ] **Step D5.2**: 领用表单(use)
  - 字段:reagent(picker) / stock(picker) / quantity(input) / unit(input) / purpose(textarea)
  - reagent 选了之后,stock picker 的 range 过滤 `stocks.filter(s => s.reagentId === reagent.id)`
  - **管控试剂红字**:`reagent.hazardLevel === 'CONTROLLED' || reagent.controlType` 时 `<u-tag type="error" :text="$t('form.controlledHint')" plain />` + `<u-button :disabled="true" />`
  - 数据源:`reagentsApi.list()` + `requestsApi.listMine()` + `apiRequest('/stocks')`(stocks 模块没单独建,直接用 apiRequest 临时加)。**或者**加 `api/modules/stocks.ts` 一个 `list()` 方法(推荐;30 秒工作量)

- [ ] **Step D5.3**: 采购表单(purchase)
  - 字段:reagent / quantity / unit / reason
  - 无管控分支,无 stock 选择

- [ ] **Step D5.4**: 两个列表块
  - 用 `useRefreshList`(分两个 hook 实例,因为是两个 API)
  - 列表项:试剂名 + 数量单位 + 状态 + 用途/理由 + 可选取消按钮(PENDING 时显示)

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/my-requests/index.tsx:1-401`)
  - Taro 版顶部用 `<Button>` 做 tab → uniapp 用 `u-tabs`,体验好很多
  - Taro 版 picker 用 `<Picker mode="selector">` + 显示值用 `<View>` → uniapp 版用 `u-picker` 弹窗(`:show` 控制),点击触发器打开
  - "管控请到 Web 端"提示 → 用 `u-tag` + 提交按钮 disable 而非纯 setErr

- [ ] **Step D5.5**: 提交后 `list.fetchListRefresh()` 刷新对应列表,表单 reset

- [ ] **Step D5.6**: commit

---

## Task D6: approvals 页

**Files:** Create `apps/miniapp-uni/src/pages/approvals/index.vue`(覆盖 plan C 占位)

- [ ] **Step D6.1**: 顶部 tabs(领用/采购)+ 卡片列表
  - 与 D5 同 tabs 模式
  - 领用 tab:`useRefreshList(() => requestsApi.listPending())`
  - 采购 tab:`apiRequest<PurRow[]>('/purchases')` 后端**返回平铺数组**,本页需要按 `batch.id` 分组成 `BatchGroup[]`(参考 Taro 版 line 38-44),没法直接套 `useRefreshList`;改用 `ref<BatchGroup[]>` + onShow 手动调

- [ ] **Step D6.2**: 领用卡片
  - 标题:试剂名 + 管控标志 `<u-tag>` (`r.reagent.hazardLevel === 'CONTROLLED' || r.reagent.controlType`)
  - 申请人 / 数量 / 用途
  - 备注 textarea `v-model="comment[r.id]"`
  - 按钮组:一审通过 / 一审拒绝;**管控试剂额外**显示 二审通过 / 二审拒绝
  - 提交后 `comment[r.id] = ''` + 刷新

- [ ] **Step D6.3**: 采购批次卡片
  - 批次 id + 试剂 + 总量
  - 内部子项列表(每个 applicant: 数量 + 理由)
  - 备注 textarea + 通过/拒绝按钮

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/approvals/index.tsx:1-252`)
  - 4 个按钮(一审/二审 × 通过/拒绝)用 `<u-button-group>` 排版,管控时显 4 个,普通时显 2 个
  - 卡片用 `<u-card>` 替代手写 border + padding

- [ ] **Step D6.4**: commit

---

## Task D7: report-summary 页

**Files:** Create `apps/miniapp-uni/src/pages/report-summary/index.vue`(覆盖 plan C 占位)

- [ ] **Step D7.1**: 3 张报表卡 + 角色矩阵
  - 引入 `import { REPORT_SCOPE_MATRIX, type ReportType, type RoleCode } from '@app/shared'`
  - 三个 `<u-card>`:近 30 天领用量 / 低库存数量 / 本月采购金额
  - 每张卡片:`can(slug)` 判断可见;loading/error/value 三态;error 时显"重试"`<u-button>`
  - API:`reportsApi.usageTrend({ range: '30d', summary: 1 })` 等(plan B `api/modules/reports.ts` 已建)
  - `onShow` 调 `loadAll()`(三个并发)

- [ ] **关键差异 vs Taro 版**(`apps/miniapp/src/pages/report-summary/index.tsx:1-178`)
  - `apiRequest<UsageTrendResponse>('/reports/usage-trend?range=30d&summary=1')` → `reportsApi.usageTrend({ range: '30d', summary: 1 })`(plan B 已提供 query 拼接)
  - 卡片视觉风格用 `u-card` + emerald accent;loading 用 `<u-loading-icon />`

- [ ] **Step D7.2**: commit

---

## Task D8: mine 页(全新)

**Files:** Create `apps/miniapp-uni/src/pages/mine/index.vue`(覆盖 plan C 占位)

- [ ] **Step D8.1**: cell-group 主结构
  - 顶部 NavBar `$t('pageTitle.mine')` + TabBar `:current="4"`
  - 卡片:头像(`<u-avatar />`,无图就显首字母) + name + role(`user.roles.join(', ')`)
  - `<u-cell-group>` 列出:
    1. 修改资料 → 弹 `<u-popup mode="bottom">` 含 `<u-form>` name 字段,提交调 `authApi.updateMe({ name })` → `useAuth().setUser({ name })`
    2. 修改密码 → 弹另一个 popup,3 字段(oldPassword/newPassword/confirmPassword),提交调 `authApi.changePassword({ oldPassword, newPassword })`;成功后**保留**当前 tokens(不踢自己),toast `$t('form.passwordChanged')`
    3. 报表概览 → 仅 `REPORT_SCOPE_MATRIX` 任一可见时显示;点击 navigateTo
    4. 语言 / Language → 弹 `<u-action-sheet>` 中文/English,选中 `setLocale(...)`(plan B `locale/index.ts` 已暴露)
    5. 关于 → 静态文字"实验室试剂 v0.1.0"
    6. **退出登录**(红色 cell)→ `<u-modal>` 确认后 `useAuth().clear() + uni.reLaunch({ url: '/pages/login/index' })`

- [ ] **Step D8.2**: 改密 tokenVersion 行为
  - 与 web 端一致:**当前会话不踢**,其他设备 tokenVersion 不匹配 → refresh 失败 → 强制登出(api/request.ts 已实现)
  - 本页面成功后 toast `$t('form.passwordChanged')`,不主动 clear

- [ ] **关键差异 vs Taro 版**:Taro 端**没有** mine 页,本页是新增,参考 web 端 `apps/web/src/app/(app)/my/profile/page.tsx`(如有)或 spec §6.2 第 8 行结构表

- [ ] **Step D8.3**: commit

---

## Task D9: 验收(DoD #3 端到端流程)+ plan D 完成

无新代码,纯手工 + 单测验证。

- [ ] **Step D9.1**: vitest 不退化

```bash
pnpm --filter @app/miniapp-uni test
```

预期:plan A/B/C 累计 ≈42 用例继续全过。本 plan **不新增测试用例**(业务页测试成本高,留以后单独 PR;DoD #3 端到端足够)。

- [ ] **Step D9.2**: H5 dev 端到端走通(spec DoD #3)

```bash
# 终端 1
pnpm --filter @app/api start:dev
# 终端 2
pnpm --filter @app/miniapp-uni dev:h5
```

按下面顺序操作,任一卡住即记 bug 留 fix task:

1. 浏览器进 home,未登录 → 跳 login
2. 用 admin@lab.local / admin123 登录 → switchTab 回 home,看到"Admin"和未读消息数
3. home 搜索框输"乙醇"/任意关键词 → 跳 search → 看到匹配项
4. switchTab "申请" → 切到领用 tab → picker 选试剂 + 批次 + 数量 + 用途 → 提交 → 列表新增一行 PENDING
5. **手动**切角色:用 web 端给同账号挂 LAB_ADMIN 角色,或直接用已有 admin 二审角色 → switchTab "审批" → 看到刚提交的 → 写备注 → 一审通过(管控试剂的话还有二审)→ 列表移除
6. switchTab "消息" → 看到"领用申请已通过"(后端通知系统应该产生)→ 点击未读 → 变已读;全部已读按钮可用
7. switchTab "我的" → 修改密码 → 输 admin123 + new + new → toast"密码已更新" → 重新发请求(如再点"修改资料")应仍能成功(当前 token 不踢)
8. 退出登录 → 回 login

- [ ] **Step D9.3**: build:h5 可构建

```bash
pnpm --filter @app/miniapp-uni build:h5
```

预期成功,产物 < 4 MB。

- [ ] **Step D9.4**: 写 plan D 完成 commit

```bash
git status --short
git commit --allow-empty -m "chore(miniapp-uni): plan D (业务页迁移) 完成"
```

- [ ] **Step D9.5**: 更新 MEMORY.md(可选)

加一行:

```
- [miniapp-uni plan D 完成](project_miniapp_uni_plan_d_status.md) — 8 页业务全迁完,admin 全链路 H5 端跑通
```

完成后即可进入 [Plan E(多端验收与发版)](./2026-05-14-miniapp-uni-e-acceptance.md)。

---

## Plan D 验收标准

1. ✅ 8 个页面文件全部存在并可访问:`pages/{login,home,search,notifications,my-requests,approvals,report-summary,mine}/index.vue`
2. ✅ vitest 不退化(≈42 用例继续全过)
3. ✅ DoD #3 端到端流程(Step D9.2 全 8 步)在 H5 端跑通
4. ✅ build:h5 成功
5. ✅ 老 `apps/miniapp`(Taro)仍可 dev/build

---

## 留给后续优化 PR(本 plan 不做)

- 表单校验细化(VeeValidate / 自实现)
- 列表骨架屏(`<u-skeleton />`)
- 错误重试网络层(`tryRefresh` 已覆盖 401;5xx 网络重试可后加)
- search 后端分页 → useRefreshList 真分页
- mine 页头像上传
- approvals 批量决策
- 业务页 vitest 用例(目前完全无)
- 微信 mp-weixin 端真机验收(留 plan E)
- 分包优化(search / report-summary 走 subPackage)

这些不阻塞 plan D 收尾。
