# @app/miniapp-uni

uniapp + Vue3 + TypeScript + uview-plus 工程，重构 `apps/miniapp` (Taro) 的目标产物。

## 命令

> 包依赖独立管理，不要从仓库根目录用 `pnpm --filter`，所有命令都在本目录内跑。

```bash
cd apps/miniapp-uni

npm install                 # 首次安装
npm run dev:h5              # H5 dev server, port 3003
npm run dev:mp-weixin       # 微信小程序 dev，产物 dist/dev/mp-weixin/，用微信开发者工具打开
npm run build:h5            # H5 生产构建，产物 dist/build/h5/
npm run build:mp-weixin     # 微信小程序生产构建
npm test                    # vitest run
npm run test:watch          # vitest watch
npm run type-check          # vue-tsc --noEmit
```

其它平台（`mp-alipay` / `mp-baidu` / `mp-toutiao` / `mp-qq` / `mp-jd` / `mp-kuaishou` / `mp-lark` / `mp-xhs` / `mp-harmony` / `app` / `quickapp-webview`）在 `package.json` 都有对应 `dev:` / `build:` 脚本。

## monorepo 共享代码

`@app/shared` 通过三处 alias 接管，不要在 `package.json` 里写 `workspace:*`（npm 不识别会报 `EUNSUPPORTEDPROTOCOL`）：

- 运行时（H5/小程序）：`vite.config.ts` 的 `resolve.alias['@app/shared']`
- 测试时：`vitest.config.ts` 的 `resolve.alias['@app/shared']`
- 类型解析：`tsconfig.json` 的 `compilerOptions.paths['@app/shared']`

三处都指向 `../../packages/shared/src/index.ts`。

## 实施计划

见 [`../../docs/superpowers/plans/2026-05-14-miniapp-uni-INDEX.md`](../../docs/superpowers/plans/2026-05-14-miniapp-uni-INDEX.md)
