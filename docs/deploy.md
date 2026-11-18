# 部署到 Cloudflare

信件存 D1，音频存 R2，页面跑在 Workers 上（OpenNext 适配）。

## 一次性准备

1. 登录：`pnpm exec wrangler login`
2. 建数据库：`pnpm exec wrangler d1 create christmas-letters`，把输出的 `database_id` 填进 `wrangler.jsonc`。
3. 建音频桶：`pnpm exec wrangler r2 bucket create christmas-letters-audio`
4. 建表：`pnpm db:migrate:remote`

## 发布

```bash
pnpm cf:deploy
```

## 绑定自己的域名（必须）

`*.workers.dev` 在国内无法稳定访问，朋友在微信里会打不开。

当前线上地址：**https://3dcards.theliang.com**（2026-11-18 起）。

域名写在 `wrangler.jsonc` 的 `routes` 里（`custom_domain: true`），`pnpm cf:deploy` 时 Cloudflare 自动建 DNS 记录和证书，不用去控制台手动绑。要换域名，改这一行再部署即可（域名所在的 zone 必须在同一个 Cloudflare 账号下）。

之后发出的信件链接会用这个域名（链接取自打开页面时的地址）。

> 注意：`pnpm cf:deploy` 会跑 `next build`，覆盖 `.next`，正在运行的 `pnpm dev` 会因此报 500。部署后重启 dev（必要时先删 `.next`）。

## 本地验证

- 日常开发：`pnpm dev`（信件存 `data/letters.db`，音频存 `data/uploads/`）。
- 按 Workers 运行环境验证：`pnpm db:migrate:local && pnpm cf:preview`（本地模拟 D1 / R2）。
