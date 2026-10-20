# 合成KPL · KPL Merge

选本命战队，沿本局锁定随机路线合成到本命。独立 Vite/Matter.js 静态游戏，base `./`，支持 `/merge/` 子路径；非官方粉丝项目。当前源码包括2026年总12队快照、单播放器双版战歌、暂停/重开、本命达成弹窗、BFCache保留同一局和每局统计幂等。本批仅本地优化，生产状态由平台注册表与真实发布证据确认。

```sh
npm ci
npm test
npm run build
```

正式构建只验证并消费已生成资源，不自动同步其他仓库。运行音源为 audio-only AAC-LC，以96 kbps为编码目标；原本约96 kbps的 AAC-LC 直接复制压缩流避免二次有损编码。所有原文件完整保存在只读 `audio-originals/`，不会进入 public/dist。最终资源hash见 `public/data/manifest.json`，显式准备命令与样本说明见 [AUDIO_PACKAGING](docs/AUDIO_PACKAGING.md)。尚未人工试听，不把编码/播放/seek验证当作听感验收。

最低阶L0从LGD/JDG选取，本命固定L7，其余六级随机锁定；同级合并加分，L7不再合并、不结束游戏。每局首球L0，current/next已显示队列不追溯改变。开局/重开默认正常版，所有等级遵循正常/小孩版开关，无小孩版时用本队正常版，各曲/版本保存独立游标。音乐只在首次合成更高等级时切换，不预载曲库；暂停、隐藏、静音停止并释放源，恢复续播。BFCache返回保留分数、路线、球体、队列、暂停、模式与游标，不算新局、不重复统计；完整重载存档未实现。

规则/接口/来源见 [GAME_RULES](docs/GAME_RULES.md)、[ARCHITECTURE](docs/ARCHITECTURE.md)、[AUDIT](docs/AUDIT.md)、[当前验证边界](docs/WORK_PACKAGES.md)。历史开发叙述保存在 [旧README](docs/HISTORY_README_20261019.md) 与 [A～F历史分包](docs/HISTORY_WORK_PACKAGES_20261019.md)，其中过时阶段标记不能当当前状态。
