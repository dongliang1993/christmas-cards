---
name: 3d-card-master
description: 用本地模板制作和修改能转动、翻开、活起来的 3D 纸雕贺卡，保留棉纸浮雕、独立纸层、局部烫金、微风摆动与烛光星火。用于「做一张生日卡 / 贺年卡 / 立体邀请卡」「把这张插画做成纸雕卡」「替换祝福、落款或装饰」；交付可在本机浏览器预览的目录，不用于寄送、托管或部署。
---

# 3d-card-master

最终交付一张有棉纸纹理、真实分层厚度、烫金反光和生命力的 3D 贺卡，而不是扁平效果图或设计建议。使用随包的 **冬夜月光** 真卡作起点，无需 AI 绘图账号、npm 或 CDN。制作端需要 Python 3（换图烘焙需要 Pillow 与 NumPy）；3D 预览需要支持 WebGL2 的浏览器，不能启用时仍可看平面版和祝福。

## 先做出第一张

1. 从用户的话中提取主题、称呼、正文和落款。保留原话；没给名字不要编造。只改祝福时别换封面。如果用户已经有输出目录，先检查并只修改所需文件，不要重新生成覆盖它。
2. 定位**本 SKILL.md 所在目录**。用下面的脚本在用户工作区创建独立输出目录。这里的 `SKILL_DIR` 要替换为实际路径；不要假定当前目录就是 Skill。传递任意用户文案时使用参数数组（如 `subprocess.run([...], check=True)`），不要把文案插进 shell 命令。也可以先生成，再用 JSON 编辑器填写文案。

   ```sh
   python3 "$SKILL_DIR/scripts/create_card.py" ./my-card
   ```

3. 编辑输出的 `card.json`（UTF-8）。`title` 是预览标题；内页沿用原站的三槽手写排版（默认使用原站 `English` / `hand-en` 槽位手写体，英文为 Bradley Hand、中文为手札体 Hannotate SC / 翩翩体，离线内置 Caveat / Long Cang 回退，直接绘制在 3D 纸面上随纸张弯曲转动）：
   - `greeting`：写收件人名字（如 `"Lan"`）会自动印成 `Dear Lan,`；写中文称呼（如 `"亲爱的 Lan，"`）则原样显示。
   - `message`：正文支持换行，自动折行并在框内自适应字号。
   - `signature`：落款会自动补上 `— ` 前缀（如 `"Leon"` → `— Leon`）。
   - 也可按需加入可选字段 `"font"`（默认 `"hand-en"`，可选 `"hand-zh"` / `"serif"`）和 `"ink"`（`"black"` / `"red"` / `"gold"`）。生成时也支持 `--title`、`--greeting`、`--message`、`--signature` 直接传入。
4. 需要换主题时，先读 [纸雕素材与验收](references/paper-art.md)。换入新底图与透明前景后，运行随包脚本完成抠图与浮雕烫金烘焙，并在 `art/layout.json` 配齐 `glow`、`particles` 与 `live`（让局部随微风摆动、点亮处炸出星火）：

   ```sh
   python3 "$SKILL_DIR/scripts/cutout_element.py" raw.png ./my-card/art/elements/flower.webp
   python3 "$SKILL_DIR/scripts/bake_card.py" ./my-card
   ```

   **先有素材再承诺画面**：没有新图时，先让对方选「保留冬夜月光、改内页」或由你用本地出图/矢量渲染生成一套分层素材，不把冬景换个标题就称为新封面。
5. 仅在回环地址提供静态文件，在空闲端口启动：

   ```sh
   python3 -m http.server 8000 --bind 127.0.0.1 --directory ./my-card
   ```

   打开 `http://127.0.0.1:8000/`；端口占用则换一个。修改后刷新。不要通过 `file://` 双击打开（浏览器会阻止模块或贴图读取）。不创建隧道、不部署、不加入统计。
6. 在浏览器确认**正面、按住拖拽侧转、点击封面翻开、合上**四个状态；用窄屏再读一遍祝福。若显示平面预览提示，不把它当成已经验证 3D。交给用户本地地址、目录、修改入口和停止服务的方法（前台运行时 Ctrl+C）。

## 保留权利声明

随成品保留生成的 `LICENSE` 以及 `vendor/` 内的第三方许可。原项目和随包美术按 PolyForm Noncommercial 1.0.0 提供；不要将其称为可自由商用素材。换入素材之前确认用户有使用权，不抓取参考站的插画、字体或代码。
