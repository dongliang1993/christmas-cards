# 贺卡编辑器与寄信流程 · 设计

> 2026-11-17 · 需求讨论记录：[贺卡编辑器 · 需求讨论](https://claude.ai/artifact/7amPk2WiJUysQkDt9g1XEQ)（Claude Doc，两轮问答；本文是它的最终版本）
>
> 标注说明：没有标注的条目是讨论中定下的；标「我的判断」的是我替你做的决定，请重点检查。

## 1. 意图

把现在「选模板 → 写一句话 → 分享链接」的流程，变成**亲手做一张卡、封进信封、盖上火漆寄给朋友，然后等它送到**。

第一个用户是你自己：圣诞前一周（约 12 月 18 日）开始，为朋友们一人做一封，做完生成链接发给他们。

动手感来自三件事：选材质、写文字、盖火漆。寄出之后的等待，就像从前等邮差送信，也是体验的一部分，不是要消除的延迟。

## 2. 目标 / 不做 / 反目标

**目标**

- 寄件人直接在 3D 卡片上布置内页：摆贴纸、写字、换卡纸。
- 封装是一个有仪式感的步骤：卡片滑进信封，选火漆颜色和印章，按住压印。
- 定时送达：送达前，朋友只能看到一封「在路上」、拆不开的信；到时间后掰开火漆，抽出卡片。
- 寄件人有一个「寄件箱」，能看到每封信是已寄出、已送达还是已拆封。
- 12 月 15 日前上线第一版，桌面和手机都能用。

**不做（本期）**

- 用户上传自己的图片当贴纸。
- 在封面上加东西：封面只能换模板；背面不开放。
- 自由排版（任意字号、行距、对齐）。
- 账号登录。
- 一张卡群发给所有人。

**反目标（做了就偏了）**

- 做成「左边表单、右边预览」的填表工具：编辑必须发生在那张 3D 卡上。
- 链接一点开就能看到全部内容：等待是体验的一部分。
- 让用户能做出难看的卡：选项少，但每个都好看。

## 3. 约束

- **时间**：第一版在 2026-12-15 前上线并自测过一遍。来不及时，「自选送达日期」和「拆封的具体时间」可以往后放。
- **技术栈**：沿用现有的 Next.js 15 + React 19 + three.js 0.172，不引入新的 3D 框架。延续已经做好的白色摄影棚布景、纸面浮雕和指针灯（`src/lib/cardStage.ts`、`src/lib/cardRelief.ts`）。
- **部署**：Cloudflare Workers（通过 `@opennextjs/cloudflare`）。卡片数据存 D1，上传的音频存 R2。用你已有的域名（部署时确认具体是哪个）。必须绑定自己的域名，因为 `*.workers.dev` 和 `*.vercel.app` 在国内都不能稳定访问，而朋友多半在微信里打开链接。（选 Cloudflare 是我的判断，你说两家都行）
- **素材由你准备**：一套冬日主题贴纸，约 12 张透明背景 PNG，由你用附录 A 的 prompt 生图。素材到位之前，开发先用从现有封面里抠出来的占位图。火漆印章的图案由开发用矢量图绘制，不需要生图。
- **隐私**：只在朋友第一次拆封时记录一次时间，不收集其他信息。

## 4. 寄件人流程

1. **选模板**：沿用现有 4 张模板（封面画面不变）。
2. **选卡纸**：冷压水彩纸（现在这种）、牛皮纸、珠光卡纸，三选一。卡纸只影响内页和纸边，封面保持模板原画的纸。（「封面不随卡纸变」是我的判断）
3. **布置内页**：卡片固定在打开状态。左内页和右侧插页都可以：
   - **摆贴纸**：从底部的贴纸托盘里选。桌面上可以直接拖到纸面；手机上点一下，贴纸落在当前页中央。之后单指拖动，双指缩放和旋转；桌面上用贴纸四角的手柄。
   - **写字**：点纸面的空白处，在那里新建一段文字。可选 3 种字体（手写英文、手写中文、衬线）和 3 种墨色（黑、红、烫金），文字也可以拖动。右侧插页默认带一段祝福语和落款，沿用现在的「写文字」内容。
   - **删除和撤销**：选中后点删除，或者拖回托盘；撤销最近 20 步。（撤销步数是我的判断）
4. **写收件人**：填朋友的名字，会写在信封正面。
5. **封装**：
   1. 卡片合上，滑进信封；信封颜色有 4 种，搭配所选卡纸。
   2. 选火漆颜色（红、墨绿、金、深蓝）和印章图案（约 6 种：雪花、星星、冬青、驯鹿、礼物，以及你名字的首字母）。
   3. 按住印章 1 秒压下去：火漆在 3D 里摊开、冷却、凝固，印出图案。中途松手就取消，可以重来。
6. **选送达时间**：立刻、平安夜（12 月 24 日）、圣诞节（12 月 25 日），或者自选日期。日期按寄件人当地时间 0 点送达。（「0 点」是我的判断）
7. **寄出**：得到这封信的链接，可以复制或用系统分享。这封信同时进入寄件箱。
8. **再写一封**：在寄件箱或寄出页点「复制一封」。卡纸、贴纸、火漆、送达时间都沿用；收件人和祝福语清空，等你重新填。

进行中的草稿自动保存在浏览器本地，刷新页面不会丢。

## 5. 收件人流程

1. 打开链接，看到一封信封：上面写着他的名字，盖着火漆和邮戳。
2. **送达之前**：信封标着「在路上 · 预计 12 月 24 日送达」，拆不开。点信封只会轻轻晃一下。
3. **送达之后**：信封可以拆了。拖动或点击把火漆掰开，翻开封口，抽出卡片。
4. 卡片的交互和现在一样：开合、指针灯、浮雕光泽；有音乐就播放音乐。卡片只能看，不能改。
5. 第一次掰开火漆时，记录一次拆封时间。

开启了「减少动态效果」时，掰火漆和抽卡片变成一次点击加淡入淡出。

## 6. 寄件箱

- **入口**：第一次寄信时生成一个私密的寄件箱链接（`/outbox/<secret>`）。这个链接会存在浏览器本地，也会显示出来让你自己收藏；换设备时靠它找回寄件箱。
- **列表**：每封信一行，显示收件人、送达时间、状态（已寄出 → 已送达 → 已拆封）和拆封时间。
- **操作**：可以复制链接、复制一封，或撤回尚未送达的信。（撤回是我的判断：寄错人时能补救）

## 7. 具体规格（已定）

| 项目       | 规格                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| 可编辑的面 | 左内页、右侧插页                                                       |
| 贴纸       | 一套冬日主题，约 12 张透明 PNG；每张标一种材质：厚涂颜料 / 烫金 / 珠光 |
| 每页上限   | 20 个贴纸、5 段文字（我的判断）                                        |
| 字体       | 手写英文（Caveat）、手写中文、衬线                                     |
| 墨色       | 黑、红、烫金（烫金字会被指针灯照亮）                                   |
| 卡纸       | 冷压水彩纸、牛皮纸、珠光卡纸                                           |
| 信封颜色   | 4 种，搭配卡纸                                                         |
| 火漆颜色   | 红、墨绿、金、深蓝                                                     |
| 印章图案   | 约 6 种，含名字首字母                                                  |
| 送达时间   | 立刻 / 12 月 24 日 / 12 月 25 日 / 自选日期                            |
| 收件人视角 | 只读                                                                   |
| 平台       | 桌面 + 手机（包括微信内置浏览器）                                      |

## 8. 数据模型

```ts
type Face = 'inside-left' | 'inside-right'
type Ink = 'black' | 'red' | 'gold'
type FontId = 'hand-en' | 'hand-zh' | 'serif'
type PaperStock = 'cold-press' | 'kraft' | 'pearl'
type SealColor = 'red' | 'green' | 'gold' | 'navy'

interface Placement {
  face: Face
  x: number // 0..1, relative to the face's width
  y: number // 0..1, relative to the face's height
  scale: number
  rotation: number // radians
  z: number // stacking order on the face
}

type CardElement =
  | ({ kind: 'sticker'; stickerId: string } & Placement)
  | ({ kind: 'text'; text: string; font: FontId; ink: Ink } & Placement)

interface Letter {
  id: string // public: /letter/<id>
  outboxId: string // secret: /outbox/<outboxId>
  templateId: CardTemplateId
  paper: PaperStock
  envelopeColor: string
  seal: { color: SealColor; stamp: string; initials?: string }
  recipientName: string
  elements: CardElement[]
  audioUrl: string | null
  deliverAt: string // ISO UTC
  createdAt: string
  openedAt: string | null
  recalledAt: string | null
}
```

- 位置用相对坐标，渲染端按同样的方法重画；浮雕和光泽在收件人那边自然一致。
- **服务端校验**：所有写入用 zod 校验，并限制元素数量、文字长度（单段 ≤ 200 字）和 `stickerId` 的取值。
- **送达前不泄露内容**：`deliverAt` 之前，`GET /api/letters/<id>` 只返回信封信息（收件人名、火漆、送达时间），不返回 `elements` 和音频。

## 9. 渲染方案

- **贴纸**：每张贴纸是贴在纸面上方的一个独立平面网格，挂在对应面板下。好处是拖动、缩放、旋转都不用重新烘焙整页；网格旋转时法线的切线空间会跟着转，光照自然正确。每张贴纸素材在第一次用到时，用 `cardRelief` 的方法烘焙一次法线和粗糙度/金属度贴图，并缓存起来。开合时贴纸要跟着面板的弯曲一起弯。
- **文字**：同样是独立网格，用 canvas 画字。黑、红墨是哑光；烫金墨是金属材质，会被指针灯照亮。
- **卡纸**：三种卡纸是内页材质的三组参数：
  - 冷压水彩纸：现在这种。
  - 牛皮纸：棕色底，纤维更粗。
  - 珠光卡纸：粗糙度更低，带一点 `iridescence`，要用 `MeshPhysicalMaterial`。
- **信封**：用几个平面拼出来，封口是一个能绕折线转动的面板。
- **火漆**：一个边缘不规则的圆片网格，印章图案做成法线贴图。压印动画分几个阶段：
  - 摊开：一团火漆从中心铺开，半径随时间变大。
  - 冷却：自发光从亮橙渐暗到火漆本色，粗糙度从低变高。
  - 掰开：裂成两半，各自翻转着掉落。
- **选中与编辑**：只有寄件人那边有这些交互（选中描边、手柄、托盘）；收件人那边用同一套渲染，但只读。

## 10. 接口

| 接口                           | 用途                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `POST /api/letters`            | 寄出一封信。没有 `outboxId` 时新建一个，返回 `{ id, outboxId }` |
| `GET /api/letters/:id`         | 收件人读取。送达前只返回信封信息                                |
| `POST /api/letters/:id/opened` | 第一次拆封时记录 `openedAt`；只在送达后、且尚未记录时生效       |
| `GET /api/outbox/:outboxId`    | 寄件箱列表                                                      |
| `POST /api/letters/:id/recall` | 撤回尚未送达的信，需要带 `outboxId`                             |
| `POST /api/upload`             | 沿用，存储改为 R2                                               |

返回格式沿用项目里现有的 `ApiResponse<T>`。

## 11. 留给开发者决定的

- 页面路由的拆分：编辑器、封装、寄出、寄件箱、收件人页。
- 3D 信封和火漆的建模细节，以及动画曲线。
- 托盘、手柄、选中态的视觉细节（沿用现有底部工具栏的风格）。
- D1 表结构和迁移方式。
- 贴纸缓存策略，以及烘焙放不放 Web Worker（目前烘焙一张封面约 400ms）。
- 现有 `data/cards.json` 和 `/card/[id]`：它们只是本地测试数据，可以不迁移。（我的判断）

## 12. 相关产物

- 需求讨论（Claude Doc，两轮）：<https://claude.ai/artifact/7amPk2WiJUysQkDt9g1XEQ>。第 1 轮定了编辑方式、可编辑的面、贴纸、文字、手机操作和保存方式；第 2 轮定了定时送达、寄件箱、信封火漆、卡纸、一人一封、部署平台和时间线。结论都已写进本文。
- 视觉参照：<https://www.bubbbly.com/christmas-cards>（布景、纸面和指针灯）。逆向分析在 `docs/bubbbly-rea-analysis.md`。

## 13. 第二版：首页与编辑器布局（2026-11-17 验收后的修改）

起因：第一版一进来就是做卡，太生硬；编辑页的顶部功能混杂、右侧缺少工具上下文、底部编辑和导航割裂、画布空间分配不平衡。布局参照你的线稿：顶部流程导航 + 左侧轻工具栏 + 中央画布 + 右侧上下文面板。

**定位**：不做成 Canva 或 Figma 那样的复杂设计工具。用户主要是挑款式、写一段话、加少量装饰。

### 13.1 首页 `/`：先逛，再动手

- 和参考站一样：中间一张大的 3D 贺卡（封面），可以翻开看内页。
- 底部控制栏：预制贺卡缩略图 ｜ 翻开/合上 ｜【制作贺卡】。
- 选中的那张贺卡，底部控制栏最右侧出现【制作贺卡】按钮，点击进入 `/editor?template=<款式>`。
- 首页不出现任何编辑功能。

### 13.2 编辑器 `/editor`

| 区域                       | 内容                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| 顶部                       | 只放流程级功能：「‹ 圣诞信」（返回首页）· 步骤「做卡 › 信封 › 封装」· 右侧黑色主按钮「下一步」 |
| 左侧工具栏（约 64px）      | 款式、贴纸、文字、纸张，所有编辑入口统一在这里；以后加图片、手绘只是多一个图标                 |
| 右侧上下文面板（约 280px） | 跟着当前操作变化（见下）                                                                       |
| 中央画布                   | 其余空间都给卡片；卡片下方是翻页器「‹ 封面 · 1/2 ›」「‹ 内页 · 2/2 ›」                         |
| 底部工具条                 | 缩放（− 100% +）｜撤销、重做 ｜预览                                                            |

右侧面板的内容：

- 什么都没选中：显示当前工具的内容。款式是模板列表；贴纸是贴纸网格；文字是「加一段文字」和几种预设样式；纸张是三种卡纸。
- 选中贴纸：大小、旋转、上移一层/下移一层、删除。（我的判断）
- 选中文字：文字内容、字体、墨色、删除。

### 13.3 页面模型（你定的）

- 只有两页：第 1 页是封面，第 2 页是内页。内页把左页和右页作为一个跨页同时编辑，不拆开。
- 封面不能添加元素，可以在「款式」里换封面。翻页就是 3D 卡片合上或打开。
- 预览和编辑共用同一个页面模型和同一个翻页器。预览只隐藏工具栏和面板，页码和翻页顺序都不变。

### 13.4 交互细节（你定的）

- 点左页或右页上的文字、贴纸，直接进入对应的编辑状态。去掉「左页/右页」指示。
- 从面板新加的贴纸或文字，放在最后点过的那一页的中央；那一页有一个淡淡的高亮，内页默认是右页。（我的判断）

### 13.5 其他（我的判断）

- 缩放范围 60%–200%，只改变画布上卡片的大小，不影响卡片数据。
- 重做和撤销一样，最多 20 步；做了新的修改后，重做记录清空。
- 手机上：左侧工具栏变成底部标签栏，右侧面板变成从底部弹出的面板，缩放隐藏。
- 「信封」和「封装」两步沿用第一版，只换上新的顶部导航。

## 附录 A：贴纸生图 prompt

每张贴纸的 prompt = **共用风格** + **材质句** + **主体**。用英文 prompt，生图模型的效果更稳定。

**共用风格**（每张都带上）：

```text
A single die-cut Christmas sticker of {SUBJECT}. Hand-painted in thick gouache impasto with visible directional brush strokes and slightly raised paint edges, cozy storybook illustration style, warm muted winter palette. Soft, even, diffuse lighting with no cast shadow. Viewed straight on, centered, filling about 80% of the frame with a small empty margin. Isolated on a fully transparent background (if transparency is not supported: a flat solid #808080 grey background). No text, no border, no white sticker outline, no drop shadow. Not photorealistic, not a 3D render. Do not paint a checkerboard transparency pattern. Square, 1024x1024.
```

**材质句**（加在共用风格后面）：

- 颜料：不加。
- 烫金：`Rendered as embossed gold foil: warm metallic gold, brighter on the raised ridges, darker antique gold in the recesses.`
- 珠光：`Painted in pearlescent white with a faint iridescent pink-and-blue sheen.`

**12 张贴纸**：

| 文件名            | 材质 | 主体（替换 `{SUBJECT}`）                                                                   |
| ----------------- | ---- | ------------------------------------------------------------------------------------------ |
| `star-gold.png`   | 烫金 | an eight-pointed north star with long vertical rays and a few small sparkle dots around it |
| `sparkles.png`    | 烫金 | a loose cluster of five small four-pointed sparkles of different sizes                     |
| `bell.png`        | 烫金 | a pair of jingle bells tied with a small red ribbon bow                                    |
| `moon.png`        | 烫金 | a slim crescent moon with a sleepy closed eye and a tiny star beside it                    |
| `snowflake.png`   | 珠光 | one large six-armed snowflake with delicate branching tips                                 |
| `cloud.png`       | 珠光 | a soft rounded winter cloud with three puffs                                               |
| `holly.png`       | 颜料 | a sprig of three glossy holly leaves with a cluster of red berries                         |
| `pine-tree.png`   | 颜料 | a small snow-dusted pine tree on a little mound of snow                                    |
| `gift.png`        | 颜料 | a square gift box wrapped in cream paper with a red ribbon and bow                         |
| `bow.png`         | 颜料 | a single red satin ribbon bow with two flowing tails                                       |
| `gingerbread.png` | 颜料 | a gingerbread man cookie with white icing details and two red buttons                      |
| `stocking.png`    | 颜料 | a red knitted Christmas stocking with a white fluffy cuff                                  |

**交付方式**：

- 每个主体可以多生几张，挑一张最好的。12 张放在一起看时，笔触粗细和饱和度要一致。
- 生好的原图按上表的文件名，放到 `assets-src/stickers/winter/`，然后运行 `python3 scripts/stickers/cutout.py`。脚本会抠掉背景、裁到主体，输出 1024×1024 的透明 PNG 到 `public/assets/stickers/winter/`，并生成 `manifest.json`。
- 抠图对纯色底、深色底和假透明棋盘格都有效，但主体本身最好不要用和背景接近的颜色。
- 如果要加表外的新贴纸，在脚本的 `CATALOGUE` 里登记名称和材质。
