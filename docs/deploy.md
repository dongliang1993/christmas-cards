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

1. 把域名加到 Cloudflare（Websites → Add a site），按提示改 NS。
2. Workers & Pages → `christmas-letters` → Settings → Domains & Routes → Add → Custom domain，填例如 `letters.你的域名`。
3. 之后发出的信件链接会用这个域名（链接取自打开页面时的地址）。

## 本地验证

- 日常开发：`pnpm dev`（信件存 `data/letters.db`，音频存 `data/uploads/`）。
- 按 Workers 运行环境验证：`pnpm db:migrate:local && pnpm cf:preview`（本地模拟 D1 / R2）。
