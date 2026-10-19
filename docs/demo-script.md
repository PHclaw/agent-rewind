# Demo GIF 制作说明

README 第一屏的 `docs/demo.gif` 由 **`scripts/make-demo-gif.js`** 程序化生成
（Node + ffmpeg，无原生依赖，完全可复现——改文案就是改脚本里的 `SCRIPT` 数组）。

```bash
node scripts/make-demo-gif.js          # 输出到 docs/demo.gif
node scripts/make-demo-gif.js out.gif  # 或指定输出路径
```

依赖：`ffmpeg`（在 PATH 里）；字体（Windows: Consolas + Segoe UI Symbol；
Linux: DejaVu Sans Mono）。

## 分镜（12.5s @ 10fps，1040×640）

| 时间 | 画面 |
|------|------|
| 0:00–0:45 | 终端窗口 chrome + 标题「agent-rewind — an undo button for AI coding agents」 |
| 0:45–2:30 | 逐字打出 `$ agent-rewind start --agent claude-code`（块光标跟随），输出 `✓ watching /repo — snapshot every 30s` |
| 3:10–5:00 | agent 开砸：黄色行动日志 + 红色烂代码逐行砸出来（`Math.random()` bug 版）+ 删文件 + 留垃圾 |
| 5:30–6:55 | 逐字打出 `$ agent-rewind ls`，快照表格逐行出现（+/− 绿红着色） |
| 7:00–8:20 | 逐字打出 `$ agent-rewind go 5m` |
| 8:20–10:00 | 蓝色 `← rewinding to ...` → 灰色细节行 → 绿色粗体 `✓ restored 4 file(s)` |
| 10:00–12:50 | 定格收尾行：`git log untouched · git status clean` |

## 设计要点

1. **前 3 秒必须出现"能跑的东西"**——不要 logo 动画
2. 破坏用**红色**、行动日志用**黄色**、恢复用**绿色**、时间旅行用**蓝色**——颜色即语义
3. 表格数据跟真实 `ls` 输出同格式（同 padding 函数），不是手排的
4. 结尾定格在 `git log untouched · git status clean`——这是和"又一个 git 包装器"建立信任的关键一帧
5. 全部 drawtext 走 `textfile=`（避免 ffmpeg filter 语法的引号/冒号转义地狱）；Windows 下字体用相对路径引用（绕开 `C:` 冒号冲突）
6. GIF 走 `palettegen`(128 色) + `paletteuse`(bayer 抖动)，54KB，GitHub 加载无感

## 想改内容？

编辑 `scripts/make-demo-gif.js` 里的 `SCRIPT` 数组：每条是
`{ kind: 'prompt' | 'line' | 'blank', t, ... }`，`prompt` 会自动生成逐字动画和光标。
改完重跑脚本即可。QA 时脚本会顺带在临时目录渲一张 `poster.png`（t=12s 的全景帧）。

## 真机演示素材

`arw-demo` 真机演示（见提交历史/聊天记录）里的输出全部来自真实 CLI——
GIF 里的表格、`← rewinding to`、`safety snapshot` 等行与真实输出逐字一致。
