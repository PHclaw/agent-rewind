<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.svg">
    <img src="docs/banner.svg" alt="agent-rewind —— 给 AI 编码 Agent 装上撤销键" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agent-rewind"><img src="https://img.shields.io/npm/v/agent-rewind.svg" alt="npm"></a>
  <a href="https://github.com/PHclaw/agent-rewind/stargazers"><img src="https://img.shields.io/github/stars/PHclaw/agent-rewind" alt="stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="node">
  <img src="https://img.shields.io/badge/dependencies-0-orange.svg" alt="零依赖">
</p>

> Agent 刚刚把你的仓库"重构"成了一片废墟。`agent-rewind` 自动快照每一次改动——一条命令，回到过去。

[English](README.md) | 中文

## 🎬 演示

<!-- 录制完成后替换为 demo.gif，拍摄脚本见 docs/demo-script.md -->
![demo](docs/demo.gif)

```
$ agent-rewind start --agent claude-code
✓ watching /repo — snapshot every 30s

# ... agent 干活，快照自动堆积 ...
✓ k3f9ab  14:32:01  agent:claude-code  4 files +312 −187
✓ k3f9cd  14:32:31  agent:claude-code  2 files +12 −96

# ... 灾难降临 ...
$ agent-rewind ls
ID          TIME                 AGENT         FILES  CHANGES
k3f9cd      10-19 14:32:31       claude-code      2  +12 −96
k3f9ab      10-19 14:32:01       claude-code      4  +312 −187

$ agent-rewind go 5m
⏪ rewinding to k3f9ab (2026-10-19 14:32:01, 4m ago)
   4 file(s) differ from that snapshot
   safety snapshot: m4x2cd
✓ restored 4 file(s)
   undo this rewind: agent-rewind go m4x2cd
```

## 为什么需要它

AI 编码 Agent（Claude Code、Codex、Cursor……）每个会话会改动几百个文件，而 git 救不了你：

- agent 提交得一塌糊涂——或者根本不提交
- `git stash` 会和 agent 自己的改动打架
- `git reset --hard` 把 agent 的烂摊子和**你自己的**工作一起炸掉

你需要的安全网应该：

- **自动快照**——不需要 git 洁癖，不需要自觉
- **知道是谁干的**——哪个 agent、哪个会话、哪条消息
- **一条命令回到过去**——而且回滚本身也能被撤销
- **绝不碰你的 git 状态**——分支、HEAD、历史、暂存区原封不动

## 30 秒快速开始

```bash
# 1. 进入任意仓库（连一次 commit 都没有的仓库也能用）
npx agent-rewind start --agent claude-code

# 2. 让 agent 干活——每 30s 自动快照，也可以手动来一个：
agent-rewind once --agent codex --msg "before deploy"

# 3. 出事？回滚：
agent-rewind ls
agent-rewind go 5m
```

就这样。零配置、无守护进程、不上云。

## 工作原理

- 快照是**隐藏在 `refs/agent-rewind/*` 上的真实 git commit**——快、去重、没改动的文件不占额外空间
- 恢复时用一次性临时索引，**你的分支、HEAD、历史和暂存区分毫不动**
- 每次回滚前先打**安全快照**，所以撤销键本身也能被撤销
- 快照**字节级精确**——永远不改写行结尾（强制 `core.autocrlf=false`）
- 元数据存在仓库内的 `.agent-rewind/`（纯本地；可以加进 `.gitignore`）
- 零运行时依赖，一个文件就能审完

## 命令一览

| 命令 | 作用 |
|:-----|:-----|
| `start [--agent X] [--every 30s]` | 定时自动快照（Ctrl+C 停止） |
| `once [--agent X] [--msg "..."]` | 打一个快照——适合 hook 和 CI |
| `ls [--json]` | 列出快照：id、时间、agent、文件数、+/− |
| `go <id\|10m\|2h\|14:30> [--prune] [--yes]` | 回滚到某个时刻 |
| `diff [<a>] [<b>] [--full]` | 看两个快照之间改了什么 |
| `status` | 快照数量和最新状态 |
| `hooks` | 打印 Claude Code / Codex / 自定义 agent 的配置 |

`go` 支持快照 id、相对时间（`10m`、`2h`、`1d`）、时刻（`14:30`）或绝对日期（`2026-10-19 14:30`）。

## 适配任何 agent

```bash
# Claude Code —— 每轮对话结束后自动快照（.claude/settings.json）
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command",
        "command": "npx agent-rewind once --agent claude-code --msg \"turn done\"" }] }
    ]
  }
}
```

```bash
# 任意 agent / CI —— 在任务前后各打一个快照
agent-rewind once --agent my-bot --msg "before run"
# ... 跑你的 agent ...
agent-rewind once --agent my-bot --msg "after run"

# Codex / Cursor / 自定义 agent —— 另开一个终端跑 watcher
agent-rewind start --agent cursor
```

## 对比

| | agent-rewind | `git stash` | `git reset --hard` | IDE 本地历史 |
|:--|:--|:--|:--|:--|
| 自动快照 | ✅ 定时 | ❌ 手动 | ❌ | ✅（仅编辑器） |
| 扛得住 agent 折腾 | ✅ | ❌ | ❌ | 部分 |
| 跨 agent、跨工具 | ✅ | — | — | ❌ |
| 不动 git 状态 | ✅ | ✅ | ❌ | ✅ |
| 回滚本身可撤销 | ✅ | ❌ | ❌ | ❌ |
| 终端原生、可脚本化 | ✅ | ✅ | ✅ | ❌ |

## 路线图

- [ ] 事件驱动快照（fs.watch），不止定时
- [ ] `git gc` 保留策略助手（`agent-rewind gc`）
- [ ] 快照包：导出/导入某个回滚点
- [ ] 浏览快照历史的 Web UI

## 开发

```bash
npm install
npm run build
npm run smoke   # 46 项端到端检查，在临时 git 仓库里跑
```

需要安装 `git`。如果 `git` 不在 `PATH` 里，设置 `AGENT_REWIND_GIT=/path/to/git`。

## 常见问题

**它是来替代 git 的吗？** 不是，它长在 git 上面，你的工作流完全不用变。

**数据存在哪？** 仓库里的 `.agent-rewind/`，加上被 `refs/agent-rewind/*` 引用的 git 对象（只要 ref 在，`git gc` 不会清掉它们）。

**怎么删快照？** `git update-ref -d refs/agent-rewind/<id>`，再从 `.agent-rewind/snapshots.jsonl` 删掉对应行。其余都是标准 git 操作。

**Windows 能用吗？** 能——在 Windows + Git for Windows 上实测通过，包括没有任何 commit 的仓库。

## License

[MIT](LICENSE)
