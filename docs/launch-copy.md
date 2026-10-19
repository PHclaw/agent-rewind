# 发布文案库

发布节奏：**英文社区先行（周二/周四，美西时间上午 8–10 点）→ 24–48h 后中文社区**。每个渠道的文案别照搬，按社区语气改。

---

## 1. Hacker News（Show HN）

**Title:**
```
Show HN: Agent-rewind – an undo button for AI coding agents
```

**Text:**
```
Hi HN — I kept losing work to AI coding agents: Claude Code would go off
the rails mid-refactor and my only recovery options were `git stash`
(fights with the agent) or `git reset --hard` (nukes my own work too).

So I built agent-rewind. It snapshots your working tree automatically
while an agent works, and lets you rewind with one command:

    agent-rewind start --agent claude-code
    agent-rewind go 5m

How it works: snapshots are real git commits on hidden refs
(refs/agent-rewind/*), so they're fast and deduplicated. Restores use a
throwaway index — your branches, HEAD, history and staging area are
never touched. Every rewind takes a safety snapshot first, so the
rewind itself is undoable. Snapshots are byte-exact (autocrlf is
forced off), which matters on Windows.

Zero runtime dependencies, MIT, works in repos with no commits yet.
There's a smoke test with 46 end-to-end checks if you want to kick the
tires.

I'd love feedback on the UX — especially whether `go <time>` parsing
(10m / 14:30 / dates) matches how people actually think about
"roll back to before that thing happened".
```

---

## 2. Reddit

**r/ClaudeAI / r/codex / r/cursor:**
```
Title: I built an undo button for coding agents (auto-snapshots + one-command rewind)

Body: （同 HN，砍掉一半长度，加一句）
Works with any agent, not just this one — run the watcher in a second
terminal or hook it into your tool of choice. Repo: <link>
```

**r/programming:**
```
Title: Agent-rewind: hidden git-ref snapshots as an undo history for AI coding agents
Body: 重点讲实现（hidden refs / throwaway index / tree-hash comparison），
HN 那群人吃技术细节。
```

---

## 3. X / Twitter

```
Your AI agent just destroyed your repo.
git stash won't save you. reset --hard nukes your own work.

I built agent-rewind: auto-snapshots while the agent works,
one command back:

  agent-rewind go 5m

- hidden git refs, your history untouched
- rewind is itself undoable
- zero deps, MIT

[demo.gif]

github.com/PHclaw/agent-rewind
```

配 demo.gif 单独发一条，quote 自己的介绍帖。

---

## 4. 掘金 / V2EX / 知乎

**标题（掘金）：**
```
给 AI 编码 Agent 装上撤销键：agent-rewind 开源了
```

**正文开头（V2EX 风格，直接、不装）：**
```
如题。起因是 Claude Code 有次半夜把我的仓库重构成一坨，
git stash 跟它打架，reset --hard 又怕把自己白天的活儿炸了。

于是写了个小工具：agent 干活时自动快照，一条命令回到过去：

    agent-rewind start --agent claude-code   # 自动快照
    agent-rewind go 5m                       # 回到 5 分钟前

几个设计点：
1. 快照是藏在 refs/agent-rewind/* 上的真 git commit，不碰你的分支和历史
2. 恢复用一次性临时索引，git status 不会被污染
3. 每次回滚前自动打安全快照——撤销键本身也能被撤销
4. 字节级精确，Windows 上不会把你的 LF 改成 CRLF
5. 零依赖，MIT

repo: https://github.com/PHclaw/agent-rewind
求 star，求拍。
```

---

## 5. 发布后 72 小时 checklist

- [ ] 每一条评论都回（前 6 小时是算法加权期）
- [ ] 被质疑"和 X 有什么区别"时，甩对比表，不吵架
- [ ] issue 当天响应，哪怕只是 "looking into it"
- [ ] 把 HN/Reddit 的讨论里最有价值的反馈整理成 issue
- [ ] 第二波：把 demo gif 单独发 X + 即刻，@ 几个 agent 赛道的中文 KOL
- [ ] 第三波（一周后）：写篇《agent-rewind 是怎么用隐藏 git ref 做快照的》技术文，吃长尾
