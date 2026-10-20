# 合成KPL · KPL Merge

2026-10-11 音乐规则修订：开局及重开默认正常版，右上角「正常版／小孩版」按钮统一切换所有等级的战歌；小孩版缺少时回退本队正常版，L7不再自动切换版本。保留独立静音与两版进度。

2026-10-09 玩法修订：首球最低阶L0，LGD/JDG随机担任L0；本命冲突选另一队。开局播放本局L0正常版，与首球一致。初期只抽L0/L1，合成L4后才抽L2。逐次加分第一行持续保留，连锁总分第二行；战歌按本局首次合成的最高等级推进：开局L0，首次L1/L2依次切歌，后续低等级或同级合成不切歌；到L7后持续播放本命战歌，重开回到L0。本命达成暂停画面，选择继续游玩或再来一局。

上一轮首球L1修订已被用户纠正，最新规则以本段和GAME_RULES为准；验证见[最新玩法修订](docs/GAMEPLAY_REVISION_20261008.md)。

选本命战队，沿本局随机队徽路线合成到本命。受 Suika 启发的纯前端 Matter.js 游戏；非官方粉丝项目。

**当前阶段：C 队徽原型及用户追加的合成战歌。** 当前使用官方2026年总KPL2026S3的12队：狼队、EDG.M、WB、KSG、Hero、DYG、TTG、RW侠、JDG、AG、TES.A、LGD。上一轮2025名单已纠正。本命固定L7及最低阶LGD/JDG及其余六队随机锁定路线。L3投放延后到首次合成L6，L4延后到首次合成L7；L5/L6仍不投放。开局播放本局L0战歌；只有本局首次合成更高等级才切换战歌，后续低等级或同级合成继续原曲。同曲不中断，各曲保存实际播放进度。已接入KPL GAME，正式路径为 /merge/；没有存档与玩法analytics。所有等级按右上角按钮选择正常版或小孩版，开局/重开默认正常版；小孩版缺少时使用本队正常版，不用《无双的王者》。最新验证见[正常版/小孩版战歌](docs/NORMAL_CHILD_AUDIO_20261008.md)。

2026-10-07 根据玩家反馈修订 B：增大球体，提高实际回弹，加入碰撞挤压/合成光圈，删除落点辅助线，逐次加分移到上方。后期少量解锁 L3/L4，已显示的 current/next 保持一致。最新验证和难度局限见 [B 手感修订](docs/B_TUNING_20261007.md)。仍只做本地占位物理，未进入 C/D/E/F。

同日第二轮反馈进一步改为桌面全窗口布局：总分在左、本次加分在右；删除可见的Next/L7合成次数。手机紧凑排列在箱体上方。移除蓝色焦点效果与全部扩散光圈，以球体弹动、数字弹动、投放进度和场内暂停/结束提示反馈；全屏按钮仅在浏览器支持时显示。前一轮布局/光圈描述为历史过程，当前行为见上述修订报告末节。

最新显示修订：没有新合成时，总分和上次合成加分持续保留；短暂浮分过期不会清空它们。游戏内队徽整体由1.24r放大到2r，保留宽高比，移除额外底板/灰框；碰撞半径与计分不变。封面队徽放大到桌面80px/手机64px，首次加载失败重试一次，不永久隐藏。

- [完整产品规则](docs/GAME_RULES.md)
- [模块与接口](docs/ARCHITECTURE.md)
- [参考实现与数据审计](docs/AUDIT.md)
- [可复查数据证据](docs/DATA_AUDIT.json)
- [分包验收与进度](docs/WORK_PACKAGES.md)
- [用户原始要求](docs/USER_BRIEF.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)
- [B 的文件、参数和验证报告](docs/B_REPORT.md)

## 独立运行

Node.js 24；Vite 7.3.6 / Matter.js 0.20.0 固定于 package.json 和 package-lock.json。

```sh
npm install
npm test
npm run build
npm run dev
```

无需本机kpl2k或任何数据同步，build只使用当前游戏代码和已生成的本地资源。选择本命后开始，鼠标移动/点击、触摸拖动松手、左右键+Space/Enter均可投放。可暂停、重开、选择战队、切换战歌版本和静音；游戏中心按钮返回当前网站根路径 `/`，用于平台 `/merge/` 接入及本地四入口预览。12队均有正常版，8队有小孩版。右上角按钮统一选择正常版或小孩版，L0～L7均遵循当前模式；WB/RW侠/JDG/LGD缺少小孩版，选择小孩版时回退本队正常版。每次开始或重开恢复正常版。点击开始后播放本局L0战歌；首次合成更高等级才切换战歌，按本局最高已合成等级续播，整曲结束自然循环。L5/L6/L7同样触发，按本局最高已合成等级选择；低等级及同级合成不切歌，重开回到L0。切歌保存实际currentTime，正常版/小孩版各自独立游标，同曲合成不重新加载或回退。当前访问期间重开/换队仍续播，刷新清空进度，不写localStorage。普通暂停、隐藏、结束、重开、换队或销毁停止并释放媒体；本命弹窗暂停物理时继续播放本命战歌；没有片段计时器。普通投球/取消/冷却拒绝/preview不切歌。暂停后继续、返回可见及取消静音时立即续播当前等级。开发固定场景仅用于物理验证，正式构建没有调试入口。

浏览器脚本可复用已有 Playwright（由 KPL_PLAYWRIGHT_PATH 指向包目录），启动 dev 后执行 npm run verify:browser。验证 build 时启动 preview --port 4197 并加 --built；KPL_MERGE_URL 可覆盖预览地址。Playwright 不属于游戏运行/build 依赖。记录和截图在忽略目录 reports/，汇总在 docs/VALIDATION_B.json。

战歌版本专项浏览器验证：配置同一 KPL_PLAYWRIGHT_PATH，开发版执行 node scripts/verify-audio-mode.mjs（默认端口4197）；静态 preview 使用端口4198，再执行 node scripts/verify-audio-mode.mjs --built。可用 KPL_MERGE_URL 覆盖地址。报告和截图在 reports/audio-mode-dev/ 与 reports/audio-mode-built/；检查版本统一、缺少音源回退、两版续播、暂停/静音/重开及320～1440px布局，不代表真机验收。

## A 阶段复查

需要 Node.js 24。当前审计脚本没有第三方运行依赖。

```sh
npm test
npm run audit:data -- --source <本地kpl2k路径> --as-of 2026-10-06 --output docs/DATA_AUDIT.json
```

审计仅读取 kpl2k；输出是审计记录，尚不是游戏快照。候选池来源是 canonical 中截至指定日期最新、已存在常规赛比赛记录的 KPL 赛季，目前为 KPL2026S2，共 18 支。名称和 ID 原样来自 canonical。这个口径表示“本地最新可用赛季参赛队”，不能保证等同 2026-10-06 现实最新联盟名单。

## 显式数据同步

```sh
npm run sync:teams -- --source <本地kpl2k路径> --as-of 2026-10-07 --pool annual
```

只在维护时运行，不作为prebuild。annual默认读取docs/annual-2026-source.json，也可用--annual-source指定保存的官方快照；严格指定KPL2026S3，不回退2025。名单来自腾讯官方季赛/擂台赛接口，大师/精英各6队；官方meta含“待定”项，以实际擂台赛12队为准。用唯一当前名称映射到2K的canonical ID/本地队徽，不修改2K主数据库。regular模式仍可审计常规赛。来源URL、请求body、获取时间及原响应保留在官方快照；映射/资源SHA256在docs/data-provenance.json。队徽保持本地2K资产；音源从app/data/team_anthems.json按canonical ID同步正常版/小孩版并校验哈希，不再解析旧championTrack或使用默认曲。未下载官方API给出的远程图片。同步仅清理旧快照明确管理但不再使用的资源，未知文件保留。运行时不读源仓库、不请求外部CDN；维护时才重新获取官方名单。

当前停在C加合成战歌，等待反馈/反向审计；不自动进入未来记录、结果页或平台发布。工作包顺序和发布限制见docs/WORK_PACKAGES.md。前面的B修订段落保留为历史记录，当前已使用真实队徽。
