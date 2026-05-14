# Reagents 模块 CRUD 设计

**日期**：2026-05-14
**目标文件**：`apps/web/src/app/(app)/reagents/page.tsx` + 同目录 `__tests__/page.test.tsx`
**关联后端**：`apps/api/src/modules/reagents/` (CRUD 已存在,软删,`SYS_ADMIN`/`REAGENT_ADMIN` 写)

## 背景

试剂百科页 (`/reagents`) 当前是只读列表 + 搜索 (`useApiQuery + debounce 300ms`)。后端 `ReagentsController` 已实现完整 CRUD：

- `POST /reagents` — 新增
- `PATCH /reagents/:id` — 更新（DTO 全字段 optional）
- `DELETE /reagents/:id` — 软删（`deletedAt=now()`）

写操作均挂 `@Roles('SYS_ADMIN','REAGENT_ADMIN')` + `@Audit`。前端目前没有写入口，本设计补齐 UI。

## 范围

**包含**：
- 顶部"+ 添加试剂"按钮（角色门控）
- 行末 DropdownMenu 操作菜单 → 编辑 / 删除（角色门控）
- 创建 / 编辑 FormDialog（8 字段，含 hazardLevel↔controlType 联动）
- 删除 ConfirmDialog（二次确认）
- 写成功后 `qc.invalidateQueries` 刷新列表
- 页面级 vitest 用例补全（现有 3 用例保留 + 新增 7 用例）

**不包含**：
- MSDS 文件上传（`msdsFileUrl` 本次仅作 URL 文本输入）
- 软删/恢复 UI（后端是软删，本设计不做"已删除列表 / 恢复"入口）
- 批量操作
- 修改侧栏 `nav.ts` 路由可见性（保持 `roles: '*'`）

## 架构

### 数据流

- **读**：`useApiQuery<Reagent[]>('/reagents', { params: { q }, queryKey: ['reagents', debouncedQ] })`（已有，不动）
- **写**：直接 `apiFetch(path, { method, token, body })`，跟 `admin/users` + `admin/labs` 同款
- **刷新**：写成功后 `qc.invalidateQueries({ queryKey: ['reagents'] })` — 前缀匹配，会刷掉所有 `['reagents', *]` 变体

### 权限门控

```ts
const roles = useAuth((s) => s.user?.roles ?? []);
const canWrite =
  roles.includes('SYS_ADMIN') || roles.includes('REAGENT_ADMIN');
```

- `useAuth().user.roles` 类型是 `RoleCode[]`（来自 `UserSummary`，见 `packages/shared/src/api-types.ts:18`），是字符串数组而非嵌套对象
- `canWrite=false` 时不渲染 `+ 添加试剂` 按钮 + 不渲染行末 actions 列
- 后端 `@Roles` 是硬墙（双层防御）

### 数据模型

字段全集（与后端 `CreateReagentDto` 同构）：

| 字段 | 类型 | 必填 | UI |
|------|------|------|----|
| name | string | ✓ | Input |
| cas | string | - | Input |
| formula | string | - | Input |
| specification | string | - | Input |
| category | string | - | Input |
| hazardLevel | `NORMAL` \| `DANGEROUS` \| `CONTROLLED` | ✓ | Select |
| controlType | `DRUG_PRECURSOR` \| `EXPLOSIVE_PRECURSOR` \| `TOXIC` \| `NARCOTIC` | - | Select（联动） |
| msdsFileUrl | string (url) | - | Input |

**Zod schema**：

```ts
const schema = z.object({
  name: z.string().min(1, '名称必填'),
  cas: z.string().optional(),
  formula: z.string().optional(),
  specification: z.string().optional(),
  category: z.string().optional(),
  hazardLevel: z.enum(['NORMAL', 'DANGEROUS', 'CONTROLLED']),
  controlType: z
    .enum(['DRUG_PRECURSOR', 'EXPLOSIVE_PRECURSOR', 'TOXIC', 'NARCOTIC'])
    .optional(),
  msdsFileUrl: z
    .string()
    .url('需要合法 URL')
    .optional()
    .or(z.literal('')),
});
```

### hazardLevel ↔ controlType 联动

- `form.watch('hazardLevel')` 监听当前 hazardLevel
- `hazardLevel !== 'CONTROLLED'` 时：
  - controlType FormField 不渲染
  - `useEffect` → `setValue('controlType', undefined)`
- 提交 body 时把 `controlType: ''` 标准化为 `undefined`，把 `msdsFileUrl: ''` 也标准化为 `undefined`，对齐 DTO

### 编辑 vs 创建

跟 `admin/users` 模板一致：两个独立 FormDialog 实例，state 分别 `creating: boolean`、`editing: Reagent | null`。共用 `schema` + `fields` 渲染函数；defaultValues 不同（创建给空，编辑给 `editing` 注入）。

## UI 组件树

```
<div data-testid="reagents-page">
  <PageHeader title="试剂百科" subtitle="..."
    actions={canWrite && (
      <Button data-testid="reagents-create-btn" onClick={() => setCreating(true)}>
        <Plus /> 添加试剂
      </Button>
    )}
  />
  <Toolbar filters={<Input ... />} />
  <Card>
    <DataTable
      columns={[
        ...baseCols,
        canWrite && {
          id: 'actions',
          cell: ({ row }) => (
            <DropdownMenu>
              <DropdownMenuTrigger data-testid={`reagents-row-${id}-actions`} />
              <DropdownMenuContent>
                <DropdownMenuItem data-testid={`reagents-row-${id}-edit`} onClick={() => setEditing(row.original)}>编辑</DropdownMenuItem>
                <DropdownMenuItem data-testid={`reagents-row-${id}-delete`} className="text-destructive" onClick={() => setDeleting(row.original)}>删除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        },
      ].filter(Boolean)}
      ...
    />
  </Card>

  <FormDialog testId="reagents-create" open={creating} ... />
  <FormDialog testId="reagents-edit" open={!!editing} ... />
  <ConfirmDialog testId="reagents-delete" open={!!deleting} ... />
</div>
```

## testid 命名约定

对齐 `admin/labs` 风格（无 `admin-` 前缀，因为 `/reagents` 不在 admin 路由下）：

| 元素 | testid |
|------|--------|
| 页面根 | `reagents-page` |
| 顶部新增按钮 | `reagents-create-btn` |
| 行末菜单触发 | `reagents-row-{id}-actions` |
| 行末编辑菜单项 | `reagents-row-{id}-edit` |
| 行末删除菜单项 | `reagents-row-{id}-delete` |
| 创建 dialog 字段 | `reagents-create-name`、`-cas`、`-formula`、`-specification`、`-category`、`-msds`、`-hazard`、`-control` |
| 创建 dialog 提交/取消 | `reagents-create-submit` / `reagents-create-cancel`（FormDialog 自动派生） |
| 编辑 dialog 字段 | `reagents-edit-name`、`-cas`、`-formula`、`-specification`、`-category`、`-msds`、`-hazard`、`-control` |
| 编辑 dialog 提交/取消 | `reagents-edit-submit` / `reagents-edit-cancel` |
| 删除确认/取消 | `reagents-delete-confirm` / `reagents-delete-cancel`（ConfirmDialog 自动派生） |

## 错误处理

- 写操作失败 → `toast.error(e.message ?? '操作失败')`，dialog 保持打开（由 FormDialog/ConfirmDialog 自身处理 `throw` 不关闭）
- 加载失败 → 已有 `useEffect` 监听 `reagentsQuery.error` 触发 `toast.error`，不变

## 测试用例计划

**现有 3 用例保留**：渲染列表 / 搜索 debounce 后 GET 带 q / 加载失败 → toast.error

**新增 7 用例**：

| 用例 | 断言重点 |
|------|---------|
| canWrite=false（PLAIN_USER） → 无 create-btn / 行末无 actions | role gate |
| 添加试剂 happy → POST /reagents body 8 字段映射正确 + dialog 关 | create happy |
| 添加失败 → toast.error + dialog 不关 | create error |
| 编辑试剂 happy → PATCH /reagents/{id} body 含改动字段 + dialog 关 | edit happy |
| 删除试剂 happy → DELETE /reagents/{id} + toast 含 reagent.name | delete happy |
| hazardLevel=CONTROLLED → controlType Select 显示并能选 + body 带 controlType | 联动 happy |
| hazardLevel=NORMAL → controlType 字段不渲染 + body 不带 controlType | 联动 negative |

## 风险与权衡

- **客户端权限 vs 后端权限差异**：`canWrite` 用 `RoleCode[]` 判断时，store 中的 user 可能没及时刷新（如管理员撤销角色后未重登）。这种情况下用户点按钮 → API 返回 403 → toast.error。可接受，匹配 admin/users 同款行为
- **联动副作用**：用 `useEffect` 监听 hazardLevel 清空 controlType 时，要保证 `setValue` 的 `shouldDirty: false`（避免不必要的 dirty state），但 react-hook-form 默认就是不触发 dirty，无需特殊处理
- **invalidateQueries 范围**：`['reagents']` 前缀会刷掉所有 `['reagents', debouncedQ]` 变体，搜索状态下写入后会同时刷新当前搜索结果 — 行为正确

## 关联代码位置

- 后端 controller: `apps/api/src/modules/reagents/reagents.controller.ts:21-59`
- 后端 service（含软删）: `apps/api/src/modules/reagents/reagents.service.ts:11-48`
- 后端 DTO: `apps/api/src/modules/reagents/dto/create-reagent.dto.ts:4-13`
- Prisma 模型 + 枚举: `apps/api/prisma/schema.prisma:94-128`
- 共享类型: `packages/shared/src/api-types.ts:1-38`
- 现有 page: `apps/web/src/app/(app)/reagents/page.tsx`
- 现有测试: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`
- 模板参考: `apps/web/src/app/(app)/admin/labs/page.tsx`（最接近形态，仅 lab 无角色 + 字段简单）
- FormDialog: `apps/web/src/components/data/FormDialog.tsx`（testId base + `-submit`/`-cancel` 自动派生）
- ConfirmDialog: `apps/web/src/components/data/ConfirmDialog.tsx`（testId base + `-confirm`/`-cancel` 自动派生）
