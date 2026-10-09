# 分包状态与验收门槛

用户已确认A通过反向审计，B及两轮手感调整已完成。2026-10-07用户授权下一步队徽及投放战歌，本轮为C加单媒体播放；验证后停止，不自动进入未来D/E/F工作。

| 包 | 状态 | 范围和进入下一包的证据 |
| --- | --- | --- |
| A | 已完成 | 源数据/本地队徽审计、可复查许可证、完整产品规则和单向架构；npm test 仅为审计工具测试。 |
| B | 已完成，等待反向审计 | 占位圆球、真实 Matter、固定步长、稳定事务/精确分数、窗口越线判定、重开销毁；45/45 test、build、浏览器 14 项+构建预览8项通过。未做真机或后续阶段。 |
| C | 已实现，当前修订见C_2026_AUDIO_20261007.md | 官方2026年总12队，纠正上一轮2025；显式同步/实际队徽/本命选择/锁定路线；7队专属及默认战歌按实际进度续播2秒。L3/L4投放延后到合成L6/L7；L5/L6不投放。 |
| D | 未开始 | 手机布局、HUD/next/route、反馈/结算/记录、Pointer/键盘/暂停/reduced-motion；真实浏览器及视口截图验收。 |
| E | 未开始 | 独立审计方式：先只读逐条查失败路径，再跑与实现无关的黑盒/真实 Matter 场景；不要求新建用户聊天；如使用子代理须依当前环境授权。检查重复合并、泄漏、资源、许可证、import 循环。 |
| F | 未开始 | 独立验证后再 additive Portal/analytics；disabled 注册项不出线上卡片。aggregate build/validate、周报测试、子路径浏览器 smoke。远端创建/发布/真机和生产证据分别标注。 |

## A 实际产物

2026-10-07 B 手感修订已完成：52/52 tests、build通过。增大圆球、后期少量L3/L4、回弹与碰撞视觉、去掉落点辅助线、加分置顶；最新浏览器结果与难度局限见 B_TUNING_20261007.md。C/D/E/F仍未开始。

同日第二轮窗口/反馈修订：55/55 tests、build通过；桌面侧边大字记分、完整显示游戏箱、可选全屏，删除可见L7次数/Next和蓝圈，保留投放/碰撞挤压。范围仍为用户授权的本地占位游戏调整；当前浏览器逐项结果在VALIDATION_B_TUNING.json。

AGENTS.md、README.md、docs/USER_BRIEF.md、GAME_RULES.md、ARCHITECTURE.md、AUDIT.md、DATA_AUDIT.json、REFERENCE_PROVENANCE.json、VALIDATION_A.json、本文件、THIRD_PARTY_NOTICES.md、licenses/、scripts/audit-teams.mjs、tests/audit-teams.test.mjs、package.json、.gitignore。

实际验证：审计工具 npm test 7/7、18/18 本地 PNG CRC/压缩检查和 Pillow 完整像素解码、5 个 std_Suika 固定版本文件哈希、7 个本地文档链接、JSON 与 Node 语法检查通过。证据在 VALIDATION_A.json。尚未运行游戏 build、物理、浏览器、真机、聚合或生产验收。

审计参考源码仅留在忽略的 references/，没有放入游戏 src，也没有复制 UI、字体、声音或水果。A 不安装 Vite/Matter、不写大量 gameplay、不修改 canonical 或平台已有改动。

## 后续明确边界

- 数据源按本地 canonical 最新赛季定义，不能把 2026 夏季快照称为现实当天名单；如果要补数据，另立源仓库维护任务，不在游戏里改名换 ID。
- B 已具备独立 npm test/build；A 工具测试只作为历史数据审计证据。B 的实际验证见 B_REPORT.md 和 VALIDATION_B.json。
- moonfloof 的网页代码可审阅，Raw/API 404，未锁定 upstream commit；B 使用可固定来源的 std_Suika + 官方 Matter APIs，不依赖无法取回的代码。
- 本地目录尚不是已创建的 GitHub 仓库。发布不能仅靠构建成功，disabled 也不能声称 /merge/ 已在线。
- Android Chrome/iOS Safari/真机触摸/大陆网络最终由真实设备证据确认；浏览器仿真独立列为模拟验收。
