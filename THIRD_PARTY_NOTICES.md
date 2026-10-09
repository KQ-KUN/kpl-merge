# 第三方来源与许可

当前 C 是未发布的本地队徽原型，已安装固定 Vite/Matter，借鉴许可明确的机制并自行组织核心。build 将本文件和 licenses/ 复制到 dist；包含从本地2K同步的队徽及战歌，不包含参考Suika的水果/字体/声音。

| 项目 | 来源 | 借鉴范围 | 许可与状态 |
| --- | --- | --- | --- |
| moonfloof/suika-game | https://github.com/moonfloof/suika-game | 审阅三面墙、队列、中心合并与防重复设计，未复制执行代码/素材 | LICENSE 对 index.js/index.html/assets 声明 public domain，Unlicense 风格；内置 Matter 单独 MIT。许可证文本保留于 licenses/moonfloof-Unlicense.txt；Raw/API 暂 404，未锁定源码 commit。 |
| lee-JunR/std_Suika | https://github.com/lee-JunR/std_Suika/tree/987284d628d9809a9301d326c1f4cc02dcb96c83 | ESM/Vite/Matter 组织及 B 候选八级半径比例来源；没有复制 UI/水果/声音 | MIT，Copyright (c) 2023 JunR；原文 licenses/std_Suika-MIT.txt，逐文件哈希在 docs/REFERENCE_PROVENANCE.json。 |
| Matter.js | https://github.com/liabru/matter-js/tree/0.20.0 | B 的圆体/碰撞引擎，固定 0.20.0 | MIT；licenses/matter-js-MIT.txt 与实际 node_modules/matter-js/LICENSE 逐字节一致；锁于 package-lock.json。 |
| Vite | https://github.com/vitejs/vite | B 构建工具，固定 7.3.6 | 实际发布包的 MIT 与其 bundled dependencies 完整声明保留于 licenses/vite-7.3.6-LICENSE.md；不复用 std 的 gh-pages 发布流程。 |
| KPL 战队队徽与名称 | KQ-KUN/kpl2k/data/processed/franchises.json；app/assets/team_icons/；app/data/team_icons.json | C 同步2026年总12队的必要队徽，canonical来源和哈希在 docs/data-provenance.json；参赛名单补充自腾讯官方接口快照 | 品牌、队徽权利归各权利人；代码许可不覆盖品牌。仅名单联网核对，未下载远程队徽；未声称官方授权或合作。 |
| 队伍正常版与小孩版战歌 | 用户提供的桌面“队歌正常版”目录；2K既有小孩版；app/data/team_anthems.json | 用户指定收录：游戏使用12首正常版及8首小孩版，只有本命L7优先小孩版；缺少时用本队正常版，无默认曲。LGD裸AAC仅无损封装M4A，不重新编码 | 音源权利归原权利人，不重新标为MIT。原文件名、来源、双版本和哈希在本地数据库及 docs/data-provenance.json；不作官方授权声明，仍仅本地验证。 |

原始参考副本存 references/（忽略目录），只用于审计；不包含字体/音效/水果下载。A 阶段不为本项目整体选择新的开源许可证，尤其不能把队徽重新标为 MIT。后续公开发布应将自有代码许可与品牌资产权利分别说明。
