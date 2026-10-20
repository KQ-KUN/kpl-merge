# KPL Merge · 合成KPL

先读 README.md、docs/GAME_RULES.md、docs/ARCHITECTURE.md、docs/AUDIT.md、docs/WORK_PACKAGES.md。完整用户要求在 docs/USER_BRIEF.md。

- 2026-10-19 当前授权为本地第二/三批性能、来源清单和规范整理。保留首批 BFCache 同会话恢复及已有统计幂等，不进入发布、注册表或新增玩法。docs/WORK_PACKAGES.md 的 A～F 是历史记录，不作为当前阶段事实。
- 用户明确指定2026年总12队：使用docs/annual-2026-source.json中腾讯官方KPL2026S3名单，映射现有canonical ID/队徽，不能回退2025。战歌从app/data/team_anthems.json生成独立快照：12队正常版、8队小孩版；只有本命L7优先小孩版，缺少时播放本队正常版，不使用无双默认曲。点击开始播放本局L0战歌；每次成功合成切到输出等级战歌，持续到下一次合成，包括L5/L6/L7。普通投球不切歌。切歌保存实际进度，每队正常版/小孩版独立游标，同曲连续合成不打断，不设固定时长；暂停后继续/返回可见/取消静音续播当前等级。首次合成L6后抽L3、首次合成L7后抽L4；不投放L5/L6。权重集中config。dev-only场景只用于验证。
- 本目录是独立游戏源码边界，目标仓库 KQ-KUN/kpl-merge，未来路径 /merge/。平台只维护注册表、Portal、统一统计与发布。
- 复用kpl2k canonical ID/当前名称/本地资产；年总参赛关系取显式保存的2026官方擂台赛快照，要求大师/精英各6队、12队唯一映射及已赛证据；不改2K主数据库、不手写名单、不抓队徽。app/data/manifest.json的teams2026固定来自春季赛，不能当年总名单。web检索报网络错误时先用命令行连接既有官方公开API核对，不能据此声称整机无法联网。
- 编码遵循 docs/ARCHITECTURE.md 的单向依赖；纯规则能注入 RNG/clock/storage；Matter world、Canvas 和 DOM 各自清理。
- 8 等级，本命固定 L7，L0～6 为其他 7 支唯一队伍的无偏随机排列；一局锁定。唯一计分配置为 6/26/32/219/335/606/5408，仅合成加分。L7 不再合并、不结束游戏。
- 默认采用 KQ-KUN/kplgame 的 UI_STANDARD v2：暖纸色、衬线标题、无衬线正文、小圆角、细线、无投影。当前工作区规范在 ../kplgame/docs/UI_STANDARD.md 和 EDITORIAL_IMPLEMENTATION.md；独立 checkout 可查上游文档。用户已删除光圈，保留球体弹动/挤压及 reduced-motion 降级，不做装饰性循环粒子。
- 正式 build 只使用仓库内已生成快照与资源并验证 public/data/manifest.json；同步/压缩是显式维护命令，不能作为 prebuild。base './'，核心资源同源。audio-originals 是只读来源，不进 public/dist；运行资源使用单个按需 Audio，不预载全曲库。曲目、歌词起点、正常/小孩版回退和独立游标语义不变。
- 参考实现只提炼机制，不复制 UI/水果/声音/字体。保留 THIRD_PARTY_NOTICES.md 与 licenses/；moonfloof 直接下载暂不可用，不把网页读取证据冒充已锁定 commit 的源码。
- 每个工作包先验证再进入下一包；如实区分逻辑/真实 Matter/浏览器模拟/真机/线上证据。当前 npm test 包含 A 审计工具及 B 规则、真实 Matter 和生命周期测试；浏览器脚本独立执行，不当真机证据。
- 平台接入状态以实际注册表为准；本批不修改注册表、不重构统计、不按战队拼事件或 URL。生产/Range/缓存结论必须独立线上验证，本地服务器证据不能代替线上。
- 保留工作区无关改动。外部仓库创建、push、部署以具体授权范围为准；不自动购买服务、改 DNS 或扩大权限。
