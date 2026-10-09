# WORK PACKAGE B 完成报告

本页是2026-10-06的历史验收快照。2026-10-07用户授权修订尺寸/后期生成/弹性/反馈位置，最新结果见 [B_TUNING_20261007.md](B_TUNING_20261007.md)，不要把本页参数视为修订后的当前值。

日期：2026-10-06。仅占位圆球物理 MVP，B 已完成并停止，等待反向审计。没有接真实队徽、战队选择/随机队伍路线、records/result page、Portal、analytics 或生产发布。A 的规则保持冻结。

## 1. 实际文件结构

```text
merge/
  index.html
  package.json
  package-lock.json
  vite.config.js
  src/
    main.js                 # 薄应用入口、重开与简单状态文本
    style.css               # 验证用界面，不是最终视觉
    game/
      config.js             # 唯一半径/分数/权重/物理参数
      spawn.js              # 注入 RNG 的 current/next 队列
      merge.js              # 排序、认领与合成输出描述
      game-over.js          # 窗口/滞回/稳定越线计时
      physics.js            # Matter world 和事务提交
      renderer.js           # 占位圆球/preview/浮分绘制
      session.js            # 每局输入/RAF/Observer/清理所有权
  tests/
    audit-teams.test.mjs     # 保留 A 的7项审计工具测试
    physics.test.mjs         # 真实 Matter 世界验证
    rules.test.mjs           # RNG/危险判定边界
    session.test.mjs         # 真实事件目标与注入 RAF 清理验证
  scripts/
    audit-teams.mjs          # 保留 A；build 不运行
    verify-browser.mjs       # 可选现有 Playwright 验证
  licenses/
    matter-js-MIT.txt
    std_Suika-MIT.txt
    moonfloof-Unlicense.txt
    vite-7.3.6-LICENSE.md
  docs/
    B_REPORT.md
    VALIDATION_B.json
    ...                     # 保留 A 的审计/规则/目标架构等
  README.md / AGENTS.md / THIRD_PARTY_NOTICES.md / .gitignore
  reports/                  # 忽略的浏览器结果与截图
  dist/                     # 忽略的独立构建产物
```

没有创建 team-picker/team-data/progression-view/analytics/records/result 模块。计分字段留在 physics，不为少量状态拆额外文件。每个实际 src 文件约几十至百余行，依赖单向，不用巨大 game.js。现有 A 资料按历史快照保留；README、AGENTS、WORK_PACKAGES 与架构页已更新当前阶段。

## 2. 固定依赖版本

Vite **7.3.6**、Matter.js **0.20.0**，package.json 用精确版本，package-lock.json 固定安装树。验证 Node 为 v24.19.0。npm install 安装本游戏依赖；npm test/build 不要求 kpl2k 存在。浏览器验证复用已有 Playwright，不是游戏运行/build 依赖。

Matter MIT 与实际安装包 LICENSE 逐字节一致；Vite 原始完整 LICENSE（含 bundled dependencies）保留并随 build 复制。没有导入参考 UI/素材。源码参考机制仍记于 THIRD_PARTY_NOTICES.md。

## 3. 当前物理参数

所有以下数值来自 src/game/config.js；半径是 **B 调试值，未最终冻结**。

| 参数 | 当前值 |
| --- | --- |
| world | 400×600；侧墙厚40，侧墙向上延伸600；无天花板；地面 y=600 |
| 半径 L0～L7 | 10.6452 / 15.4839 / 19.6774 / 22.2581 / 28.7097 / 36.7742 / 41.6129 / 50.3226 |
| 来源 | std_Suika 首八级 [16.5,24,30.5,34.5,44.5,57,64.5,78] ×400/620 |
| step | 1000/60ms；单帧最多5步；后台恢复不补现实离开时间 |
| gravity | y=1、scale=0.001 |
| restitution | 0.12 |
| friction / frictionStatic / frictionAir | 0.08 / 0.2 / 0.006 |
| density | 0.001 |
| positionIterations / velocityIterations | 8 / 8；sleeping=false |
| 速度上限 | 12 世界像素/60Hz tick |
| spawn | y=36；仅 L0/L1/L2，50%/35%/15%；冷却500ms |
| 新球/合成球 grace | 1000ms / 500ms，只保护对应球 |
| danger line | y=90；退出滞回6px |
| stability | 窗口300ms；稳定持续1800ms；平均速度≤1px/tick；窗口位移范围≤8px |
| jitter | 位移≤2px 时接受有界的速度抖动；不逐帧清零 |
| 实际越线约束 | 窗口至少50%采样球顶在线上方；判负当帧也必须实际上越线 |
| 不稳定容忍 | 连续不稳定200ms后清零稳定计时；正在明显移动时不判负 |
| 结束稳定 | 600ms；期间禁止新增球与合成/加分，之后停止 RAF |
| 浮分 | 800ms；至多32条；reduced-motion 原位显示；无 DOM/timer 动画 |

L7 直径约占世界宽25%，一次可存在多颗。各等级只由 level 控制半径，不由战队控制。preview 只是绘制，world 开局恰好只有两面墙和地面。

## 4. merge transaction 防重复方式

collisionStart 和 collisionActive 只收集候选对，不立即修改世界。每个固定步长结束、Engine.update 返回后，归一化每对 ID 为 min/max，去重并按数字 ID 对排序。

依次检查两个 ID 仍存在、未 consumed、同级且低于 L7；同步标记 consumed 后才提交：移除两个旧 body/映射，创建中心附近的新 body，限幅的质量加权速度继承，按唯一 MERGE_SCORES 加一次分。新输出下一 physics tick 才能参与后续合成。两条事件重复同一对、相邻 tick 保留旧碰撞、共享输入 ID 都被 consumed/映射检查挡住。

输出位置按新半径 clamp 到侧墙与地面内。自然 drop 不加分，preview 队列只有成功投放才推进；拒绝冷却投放和 RNG 失败都不推进预览。分数表始终 6/26/32/219/335/606/5408，没有连锁倍率。

## 5. 三球同时碰撞

纯事务测试把 A-B、B-C、反向重复对按两种相反事件顺序输入，结果完全一致：只认领按 ID 最小的 A-B，中间球 B 不参与第二次。

真实 Matter 同 tick 实际报告两条共享球碰撞，提交 **1 个合成、+26、剩余2颗球**，被消费标记 [true,true,false]，world 剩3墙+2球；继续模拟不再加分。浏览器固定三球场景同样 +26、剩2球。

测试场景使用明确接触的圆体间距；Matter 的 Bodies.circle 本身使用内接多边形近似，不能把数学绘制圆刚好相切当作引擎必定碰撞。此近似是物理手感风险之一，未更改半径来掩盖它。

## 6. chain merge

真实 Matter：两颗 L1 先产生 L2，第一 tick +26；新 L2 在下一 tick 接触已有 L2，+32，最终 **58分、1颗 L3、2条独立反馈事件**，后续不重复计分。浏览器固定连锁场景也得到58。

两组 L6 同局各合成 L7，得到 **10816分、finalCount=2**；两个 L7 接触不合并、不产生 L8，之后仍可投放新低级球。Node 与浏览器均验证。

## 7. Game Over 最终判定

仅 released=true、未消费、grace 已过的真实球进入 detector；球顶 y-radius 进入危险线上方后逐球建立窗口。球回到危险线下超过6px立刻清历史；仅轻微跨线抖动保留滞回，但窗口至少一半采样真实越线，且结束当帧必须真实越线，防止永久落在线下却因旧历史误判。

完整300ms窗口满足空间和速度稳定条件后开始1800ms稳定计时。轻微有界抖动不每帧重置；大幅位移/高速度持续200ms重置。无关球新生成或连锁不重置别的堆积球。模拟暂停/hidden 不推进该时钟。

稳定且仍越线达到门槛后转 settling，立刻阻止投放/合成/分数，世界继续600ms，然后 over 并取消 RAF。已过 grace 的完全静止球，最早约300+1800=2100ms判定；新投球另加1000ms grace。不是单次碰线失败。

测试覆盖 preview、弹高落回、长期堆积、轻微抖动、刚投放、合成输出弹高、连锁剧烈位移、多球越线、无关球 grace、已消费/移除清理、滞回线下恢复；真实 Matter 的动态圆体在静态测试平台上持续越线及持续轻微抖动均能结束，正常掉落/向上合成弹跳不结束。平台只是固定场景支撑，非自然掉落规则。

## 8. Restart / destroy 资源检查

每次 Restart 先 destroy 旧 session，再创建新的：AbortController 移除本局8个 pointer/key/visibility/blur listeners，取消当前 RAF，disconnect ResizeObserver，移除两条 Matter collision listeners，Composite.clear + Engine.clear，清空 ball map/candidates/danger tracks/pairs/detector bodies/Canvas feedback。无 setTimeout/setInterval；动画使用模拟时钟。destroy 幂等，旧 RAF 即便被人为调用也不会更新或再次排队。

Node 的真实 EventTarget+注入 RAF 循环 **50次重开**：旧 world/body/listener/RAF/Observer/反馈均归零。Edge 浏览器 **30次重开**：旧 world/body/engine listener/pairs/detector/RAF/反馈归零，新局只有1个待执行 RAF、3个墙体、8个会话监听，实际释放只投1球。Game Over 和总 destroy 后 pending RAF=0。

这是明确的资源所有权/清理证据，不等同进行了长时间 heap profiler 证明。实际 Android/iOS 硬件内存与帧率尚未验证。

## 9. npm test

**45/45 通过，失败0**：7项 A 工具测试保留，38项 B 规则/真实 Matter/会话验证。包含全部七档精确计分、共享/重复碰撞、真正连锁、多L7、spawn/next、危险判定和重开清理。

## 10. npm run build 与浏览器

**npm run build 通过**：Vite 7.3.6，15个模块，HTML 2.03kB，CSS约2.24kB，JS约98.35kB（gzip约32.82kB）。产物不含 debug API、队徽或 Analytics 代码；许可文件已复制。独立 preview 两次自然 L0 投放实际合成+6，刷新正常，资源/控制台错误0。

Edge/Chromium 154.0.4258.53：dev 14项、built 8项验证通过。390/430/768/1440px 无横向溢出、Canvas backing store 按 DPR、控件至少44px；鼠标横移/释放、键盘、390px CDP 触摸拖动松手均正常，页面 scrollY 不变，投放在墙内；固定三球、连锁、多个L7、越线结束、重开、暂停、reduced-motion、destroy 均验证。已查看390/1440和结束截图。

证据：docs/VALIDATION_B.json；reports/browser-b/results.json、browser-built/results.json 及视口截图。CDP 是模拟触控，不是真实手机验收；没有宣称已完成 Android Chrome 或 iOS Safari 真机手感验证。

本机一次快速写入 LICENSE 时触发 Windows FS watcher EBUSY，Vite dev 暂时退出；已把不参与热更新的 docs/licenses/reports/references 加入 watch 忽略，并恢复 dev 后完成验证。这与物理无关，记录以便复查。

## 11. 当前物理手感风险

- 半径来自成熟实现的前八级比例，未冻结；小球在 C 的真实队徽辨识度必须另测。
- Matter 圆体内部为多边形近似，视觉相切和真实接触可能有亚像素/小像素差异。
- 半径增长导致对邻球的挤压、速度上限/阻尼、连锁拥挤的手感仍需真实玩家调试；固定场景通过不证明长期可玩性。
- 稠密长局在真实低端 Android/iOS 上的 FPS、热量和内存未验证；固定步长补步上限遇到卡顿会让模拟放慢。
- 1800ms稳定阈值、空间滞回与短暂运动容忍仍是调试参数；已有边界场景通过，不等于所有堆形误判都已排除。

当前停止 B，等待下一轮反向审计。
