# bubbbly.com/christmas-cards 逆向分析（REA）

> 分析时间：2026-11-17 · 方法：REA 静态 bundle 分析（CDP）+ 反混淆阅读 + 无头 Chrome 实测截图
> 目的：为本项目（christmas-cards）的视觉与交互设计提供参照实现。

## 1. 分析方法与证据

| 步骤 | 工具 | 产出 |
|---|---|---|
| 页面抓取 | curl + HTML 解析 | `data-next-head`、`__NEXT_DATA__` → 确认 Next.js Pages Router |
| bundle 静态解析 | `rea: analyze_web_bundle`（CDP target） | 12 个脚本全部解析成功（276,044 个 AST 节点），vendor 指纹：**Next.js (high)**、React (medium)、three.js |
| chunk 指纹识别 | 反混淆 + prettier 格式化 | `dafad590`=three 核心（348KB，20+ WebGL 扩展探测）、`8fe9ca81`=three animation 子系统（263KB）、`865`=UnrealBloomPass + Pass 基类、`1569`=MaskPass/ClearMaskPass、`3822`=**全部业务逻辑**（卡片 viewer + 手写 GLSL） |
| 运行时验证 | `rea: capture_web_screenshot` | 页面渲染正常（Evidence `ev_c161ac…`） |
| 局限 | — | 无 source map；纯静态结论，未执行页面 JS 验证行为；服务端配置与素材生产管线不可见 |

产物留存：`/tmp/bubbbly-analysis/`（page.html + 8 chunk + 3 个 prettier 格式化版本，重启后丢失需重抓）。

## 2. 技术栈结论

- **Next.js（Pages Router）+ React**，App chunk 仅 22KB，viewer 全在共享 chunk
- **three.js 原生类用法**——没有 react-three-fiber、没有 GSAP、没有 framer-motion
- 后期：`EffectComposer` → **UnrealBloomPass**（发光体够亮才溢出）→ **自定义胶片噪点 pass**（亮度门控，只给中间调加噪）→ 输出
- `antialias: false` + `renderTarget samples: 4`（MSAA）；`prefers-reduced-motion` 时动画时长 ×1.6、幅度 ×0.35
- 字体 Caveat（手写体），next/font

## 3. 信封/卡片的实现（核心，全在 3822 chunk）

### 3.1 几何：铰链 + GLSL 弯曲

- 两块面板共享一条 `spine` 节点：`hinge.rotation.y = -th.x`，`th.x` 是开合角
- 顶点着色器 `bow()` 把卡片弯成圆弧（`uniform float uBend`）：
  ```glsl
  th = uBend * p.x / uSize.x;
  k  = uBend / uSize.x;
  return vec3(sin(th)/k - sin(th)*p.z, p.y, (1-cos(th))/k + cos(th)*p.z);
  ```
  法线同步旋转 `th`。合上/全开时 uBend→0，**开合中段弯曲最大**（正弦包络）
- 编译期宏派生 shader 变体：`FACE/PIECE/TOPPER/LIVE/SNOWFALL/GLOWS/MOVERS/PAINT`

### 3.2 材质：手写"纸 + 烫金"物理着色

每卡三张贴图：`{slug}.webp`（画）、`{slug}-fx.webp`（R=烫金区、G=光泽、B=浮雕强度）、`{slug}-lift.webp`（R=剪切遮罩、G=发光遮罩、B=雪遮罩）。

fragment shader 里的物理模拟：

- **摄影棚布光** `studio()`：软光箱（左上）+ 条形灯（右）+ 反光板（下）三个 box 光源，**随鼠标 `uLight` 微动**——这是 hover 光影流动的来源
- **指针灯** `uLamp`（view space）："the lamp that follows the pointer"——`pow(nh,220)` 白热高光 + `pow(nh,28)` 辉光，湿颜料/烫金上流动闪光
- **烫金**：`metal = base*(mix(0.42,1,caught) + glow*0.95) + tint*(0.6*caught³ + hot*2.4)`，镜面反射随布光角度闪白
- **珠光墨** `spectrum()`：随视角变色的缎面光泽
- **油画笔触（impasto）**：对贴图做屏幕空间差分求 bump（`hx/hy`），`#ifdef PAINT` 分支
- **纸纤维**：`noise()` 双向 hash 噪声，纸纹跨贴片边界连续
- **内页阴影** `uShade`："the cover shades the inside as it shuts"——盖子合上时内页变暗

### 3.3 交互状态机

`pointerdown` → `Raycaster.setFromCamera` → 逆变换到卡片局部坐标（`spine.matrixWorld` 求逆）：

1. **点在盖子自由边**（默认 24% 宽，`e1()` 判定）→ `mode:"open"`，拖拽实时映射开合角
2. 松手时：**甩动速度 `|vx|>600`** 或 **开角过半** → 弹开，否则弹回（`ej()`）；开合角由临界阻尼弹簧驱动（`v += (k*(target-x) - c*v)*dt`）
3. 快速横甩（`|vx|>800` 且位移 >50px）→ 切换上/下一张卡
4. 点卡身 → toggle 开/关；键盘：**O 开合、空格暂停、←→ 换卡**（含 sr-only 文案）

### 3.4 画面里的"活物"（物体系统）

全部在同一粒子池体系（24 个循环复用）+ uniform 数组传 shader：

| 系统 | 机制 |
|---|---|
| **GLOWS**（灯笼/烛火/星光） | `uGlowAt/Col/Light/Warm` 四组 vec4 数组；JS 侧按 `tap` 圆心命中检测，命中触发 **flare 爆闪** + 10~14 个粒子；火焰有专门多正弦闪烁曲线 `x(e,t)`；shader 里画光斑/光环/旋转光束（`cos(a*rays)`）并给全画面加暖色 screen |
| **MOVERS**（猫/灯笼等摆动物） | 每个 mover 带 pivot 的贴图区域，react 模式：spring/jiggle/twitch/blink/wave/sigh/flutter；**鼠标靠近高斯衰减 `exp(-(d/span)²)` 触发"风"**，甩卡速度向量 `K[0]/K[1]` 平滑后传导给它；shader 里 `unmove()/moved()` 做 UV 旋转/缩放/波纹形变 |
| **雪（双份）** | ① 画上的"玻璃后雪"：shader 程序化 3 层 cell noise（`snowfall()`，视差 70/52/34 cell）② 3D 粒子雪：flakes[] 每片 sway/turn/速度，落卡面化成水滴 |
| 其他 | 萤火虫（布朗游走）、流星、烟囱烟、落叶——同一粒子池 |

### 3.5 资源与加载

- 素材：`/cards/{slug}.webp`、`-fx.webp`、`-lift.webp`，雪共享 `snow.webp/-fx/-lift`
- `WebGLRenderer` 创建失败 → `onFail()` 显示 "This page needs WebGL..." 降级文案
- `?record=1` → `preserveDrawingBuffer` + 隐藏 dock/corner（录制模式）

## 4. 与本项目的对照结论

已按此文档实现的：开合弯曲（CPU 版 bow）、边缘拖拽开合（raycast + 26% 边缘区 + 速度判定）、内页 shade、foil metalness/roughness（canvas 派生）、雪视差层（cell noise 移植）、UnrealBloom + 亮度门控噪点 pass、惯性传导到浮雕贴片、键盘 O/空格、reduced-motion。

待调优的（按影响排序）：

1. **曝光平衡**：环境贴图（RoomEnvironment）只作金属反射内容，`environmentIntensity ≤ 0.25`，否则过曝；ambient/hemi 需相应下调（参照：bubbbly 完全没有环境贴图，全靠 shader 内手写 studio()）
2. **指针灯参数**：decay 2（物理衰减）、离卡面 ≥1 单位、强度 ≤2.4、打开超过 40% 时熄灭——否则会"写出一个太阳"
3. **foil 阈值**：`candidate - 0.66` 再三次方，只让近白高亮的暖区成金属；中调红绿必须保持哑光颜料，否则出现死黑块
4. bubbbly 的 studio() 三光源是 **shader 内求值**（`reflect(-V,Nb)` 采样 box 分布），本项目用真实灯 + normal map 是近似——高光"流动感"不如原版连续，可考虑后续 onBeforeCompile 注入
