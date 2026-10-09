# WORK PACKAGE A 审计 · 2026-10-06

A 的产品规则、数据来源和模块边界已确定，可以进入占位物理 MVP。这里的“完成”只指审计与设计；没有运行游戏、构建游戏、接入 Portal 或部署。

## 已读取的本地资料

KQ-KUN/kpl2k 当前 HEAD：e6d65d36a03823b1be7cfd0abc206c1c676e764c。根目录就是该仓库，不存在额外 kpl2k/ 子目录。本地有多个无关代码改动，数据审计涉及的源文件和队徽目录未改动。

KQ-KUN/kplgame 当前 HEAD：4ab703ef12664b949c10756dcf96186933d0073b。已有未提交注册表、统计文档/脚本等，本轮未修改。已读其 AGENTS、总交接、UI_STANDARD v2、EDITORIAL_IMPLEMENTATION、DATA_HANDOFF、GAME_INTEGRATION、NEW_GAME_CHECKLIST、新游戏模板、现有 registry/build/collect/analytics/weekly parser。

## 战队池与队徽

franchises.json 没有 active 标记；包含 current_names、abbreviations、names_by_season、seasons。app/data/manifest.json 虽叫 teams2026，其生成代码 tools/build_web.py 明确读取 **KPL2026S1**，不能证明最新赛季。canonical seasons 的最新可用常规赛为 **KPL2026S2**，开始 2026-06-17；两者相差四个身份。

选择规则：截至 as-of 日期，按 start_time 选最新已有已赛常规赛证据的 KPL 联赛赛季；从其 canonical formats 的分组与已赛 round_robin 取交集；要求唯一 franchise_id、唯一非空当前名称、赛季关联、有效本地 PNG 和有效队徽索引。杯赛、仅历史图片、仅未开赛赛程不入池。不用排名、冠军数、热度或手写名单。来源标注为“本地最新可用赛季参赛队”，不冒充现实当天名单。

实测候选 **18 支，18 支全部合格，排除 0**。名称与简称原样来自 canonical，全部队徽具有可读取尺寸，PNG CRC、压缩数据检查和 Pillow verify/full decode 通过。来源 JSON、build_web.py、每张 PNG 的 SHA256 与 ID 列表见 DATA_AUDIT.json。

| canonical ID | 当前名称 | 简称 |
| --- | --- | --- |
| 10001 | 重庆狼队 | 狼队 |
| 10002 | 上海EDG.M | EDG.M |
| 10003 | 北京WB | WB |
| 10005 | KSG | KSG |
| 10006 | 武汉eStarPro | ES |
| 10007 | 南通Hero久竞 | Hero |
| 10008 | 深圳DYG | DYG |
| 10009 | 上海RNG.M | RNG.M |
| 10010 | 西安WE | WE |
| 10016 | 佛山DRG | DRG |
| 10017 | 广州TTG | TTG |
| 10018 | 济南RW侠 | RW侠 |
| 10020 | 北京JDG | JDG |
| 10027 | 成都AG超玩会 | AG |
| 10028 | 长沙TES.A | TES.A |
| 10031 | 杭州LGD.NBW | LGD |
| 10910 | WST | WST |
| 12202 | SYG | SYG |

春季 display pool 额外有 10601 无锡TCG、10903 桐乡情久；夏季 canonical 改为 10910 WST、12202 SYG。本游戏不猜测这些 ID 是不是实体继承或现实转会，不在新游戏里把 WST/SYG 改成 TCG/情久。

本地 PNG 均为 150×150，索引内嵌 PNG 为 64×64；二者哈希不同是缩略流程导致。tools/build_team_icons.py 用 Pillow thumbnail/LANCZOS 从本地 PNG 生成索引，不能要求两个文件逐字节一致。C 复制 150px 原文件，保持 contain，不复制低分辨率内联缩略图。

C 将提交最小 teams.json 和只使用的 18 张 PNG，sync 命令接受显式 --source。名字从 franchises、参赛证据从 processed seasons/formats、资产从 app/assets/team_icons、索引检查从 app/data/team_icons.json；输入哈希和 source commit 一并记录。独立 build 不执行同步、不读另一个 checkout。

## 两个开源实现

| 参考 | 读取与许可 | 有用机制 | 不能照搬的行为 |
| --- | --- | --- | --- |
| [moonfloof/suika-game](https://github.com/moonfloof/suika-game) | GitHub 网页 index.js/许可证已读；公开领域 Unlicense 风格，内置 Matter 另为 MIT；Raw/API 返回 404，未取到 upstream commit | 圆体/三面墙、下一球队列、中心合并、popped 防重复、半径表、CSS 等比缩放 | 顶级回到最小级、碰撞时立即判负、preview 放 world、巨型 Game 对象、直接 JSON.parse、鼠标专用与声音/水果 UI |
| [lee-JunR/std_Suika](https://github.com/lee-JunR/std_Suika) | 固定 commit 987284d628d9809a9301d326c1f4cc02dcb96c83；main/fruits/vite/package/LICENSE 完整读取并逐文件对照 SHA256；MIT ©2023 JunR | Vite ESM、Matter Engine/Bodies/Events/World、圆体与墙、半径 progression、投放冷却、顶级不再合并 | 单文件 main、preview 的 sleeping body 放 world、即时 sensor 碰线判负、无 consumed 认领保护、键盘 interval、固定大 Canvas、合成位置取单个 support 点 |

来源文件清单与版本证据见 REFERENCE_PROVENANCE.json。std_Suika 参考副本留忽略目录 references/，不加入游戏源码；其 MIT 原文已放 licenses/。moonfloof 无可锁定源码，B **只借鉴审阅机制**，以固定 std_Suika 与官方 Matter API 组织自己的实现，不阻塞在不可下载仓库，也不从未知许可源码补缺。

实际提炼：Matter 负责成熟物理；本项目负责固定步长、预览与 world 分离、同级合成事务、防重复、稳定计时、DPR/坐标映射。采用 std 首八级比例作为候选尺寸，B 再验证。物理适配器与规则状态分开，避免巨大 game.js。

不复制参考 UI、水果、字体、声音。参考代码许可和战队 Logo 品牌权利分开记录；MIT/Unlicense 不能授权队徽。既有 canonical 本地资产来源沿用，不额外联网抓图，也不宣称已取得战队授权。Matter 官方 LICENSE 已保留；Vite 实际锁定安装后在 B 更新依赖 notice，并在 build 分发。

## 已确定的产品/工程选择

规则以 GAME_RULES.md 和 USER_BRIEF.md 为准：8 等级、本命 L7、7 个其他唯一随机队、一次锁定、准确分数、顶级留场和继续游玩全部固化。物理参数只作候选，不把手感未测的值写成已验证。

采用 JS ESM、Vite、Matter、Canvas、原生 DOM；config → 纯规则 → physics/UI → main，接口用参数和 callbacks 单向组合。不建后端、账号或共享框架。Canvas world 400×600 是适配候选；CSS 等比缩放、DPR backing store 保持高清。首轮本命反馈为短放大+光圈+文字，不使用额外图片生成，因此不需要图片生成授权。

localStorage 使用版本化结构、字段校验与失败回退；记录和浮分只在状态变化产生。hidden 停模拟时钟；重开逐项清理引擎、监听、RAF、Observer 和 timers。结束是持续稳定越线，preview 和瞬时弹跳不触发。

## 现有平台接入约束

registry 禁用项不 checkout/build/collect，也不生成 Portal 卡片。因此 enabled:false 与“新游戏 production smoke”不能在同一次未发布阶段同时完成：F 可验证现有聚合和事件文件，真正 /merge/ 生产验收需后续启用/发布证据。本轮不修改 registry、analytics 或线上资源。

统一统计目前客户端和服务端都有固定 allowlist，weekly 的 PV/点击/游戏行为数组也只含三个游戏。F 按用户给定六事件 additive 扩展，增加 start/PV、final/start、gameover/start 的事件比语义；不按队伍拼 URL，不重构统计。平台自动 pageview 与游戏初始化 pageview 必须去重，并在初始化成功时满足用户定义。

## A 验证及剩余风险

- 数据脚本选择规则/身份/异常图片测试通过；实测 18/18 队徽有效，无 canonical 修改。
- std 参考源码固定版本/哈希一致，许可证保存；moonfloof 可审阅网页但版本未固定，不直接导入。
- 文档相互链接与 JSON、脚本语法检查见最终报告。没有游戏测试、游戏 build、浏览器、真机或生产证据。
- 小球队徽辨识度、实际物理手感、长期 stacking 与误判/泄漏都待 B～E 验证。
- 最新本地赛季不是现实当天名单证明；不根据外网叙述篡改 canonical。

下一包：B，用占位圆球证明物理/原子合并/计分/结束正确，再进入 C 加队徽与随机路线。
