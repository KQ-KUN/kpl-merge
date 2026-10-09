# C 队徽与投放战歌 · 2026-10-07

本文保留首轮18队接入的历史证据。用户随后要求年总12队与延后L3/L4投放，当前实现/验证见C_TUNING_20261007.md和VALIDATION_C_TUNING.json。

本轮响应用户“下一步队徽”和“投放对应队伍战歌”，实现本地C及单媒体音源，不进入records/result/Portal/analytics或生产发布。B已有计分、L7、多L7、后期投球、物理半径和越线判定保持现值。

## 实际文件结构

新增src/data/{teams.json,team-data.js}、src/game/{progression.js,anthem.js}、scripts/sync-teams.mjs、tests/{teams.test.mjs,anthem.test.mjs}、public/team-icons/18张PNG、public/team-audio/9个M4A、docs/{data-provenance.json,C_REPORT.md,VALIDATION_C.json}。选队直接组合在main.js，没有为了目标架构提前拆picker/hud/progression-view。main/session/renderer、页面与样式、浏览器检查、现有session/renderer测试及文档相应更新。固定Vite7.3.6、Matter.js0.20.0、Node24；没有增加第三方依赖。

## 数据与队徽

显式命令`npm run sync:teams -- --source .. --as-of 2026-10-07`复用A审计，选KPL2026S2常规赛18/18队。canonical ID/名称/简称原样保留，不把本地快照描述为现实当天名单。源commit、输入文件与每张PNG的SHA256、音源映射和每首M4A的SHA256均在data-provenance.json。build只用本游戏已生成快照和public资源，不在prebuild同步、不抓取CDN。

开始前选本命，本命固定L7；其余池部分Fisher-Yates无偏抽取并排列七队，每局路线冻结。重开重新生成；更换本命先清理旧局。未做localStorage。穷举八队池的7!=5040种等概率选择路径，每种七队排列恰好一次；重复ID/未知本命/不足8队/非法RNG拒绝。

renderer接收本局八张图片，按真实宽高比contain到球内安全区域；真实碰撞半径仍是config的[20,28,38,50,64,82,104,132]。未加载/失败用简称回退。队徽球采用暖纸底、常驻中性轮廓，L7红色轮廓，无蓝色/扩散光圈。常驻免责声明可见。用户删除的Next和L7次数没有恢复。

## 投放战歌

映射直接读取2K的app/js/ui.js:championTrack，不凭印象补曲。专属8队：狼队、AG、ES、TTG、KSG、Hero、DYG、TES.A；其他10队用同一默认《无双的王者》。单局仅一个Audio，音量0.3、从头播放、不循环；每次成功用户投放切换源并停止上一首。冷却拒绝/取消手势/重复release/preview/合成不播放。只有pointerup/keydown中的成功投放调用play，选队不会自动播放。

暂停、document.hidden、结束进入settling、重开、更换本命、pagehide和destroy停止并清空src。静音立即停止；重新开声音等待下次投放。play的异步结果有递增序号，旧结果不能覆盖新状态；destroy幂等、媒体监听由AbortController移除，无音频timer。媒体失败保留物理并报告状态，不产生未处理Promise。

## 验证与限度

`npm test`65/65通过，含原55项、队徽contain/失败回退、路线与本地资产哈希、战歌异步竞态/静音/销毁、成功用户投放事件与生命周期。`npm run build`通过。独立验收副本reports/standalone-c-20261007-152747只复制本游戏文件，无2K输入目录；普通`npm ci --no-audit --no-fund`、65项test及build通过。第一次`npm ci --offline`因缓存缺source-map-js tarball失败，后改为正常锁文件安装成功；不能声称首次安装完全离线。

Edge154的dev26项、built15项通过，均无页面错误/资源404；8种视口390x844、390x667、430x932、768x900、1024x600、1366x768、1440x900、1920x1080。18张图片真实解码、桌面/手机布局、鼠标/键盘/模拟触控、连锁+58、两L7继续、稳定越线、30次重开、暂停、reduced-motion、全屏、换队/刷新均验证。媒体实际检查currentTime推进、WB默认曲及DYG专属曲地址、暂停/静音及旧音源清空；这不是声学试听或实体手机证据。截图和逐项日志在reports/browser-c及browser-c-built；摘要在VALIDATION_C.json。

最后以当前构建在`/nested/merge/`路径另跑15项通过，所有队徽和音源保持同源子路径，无404。加上dev26项及根路径built15项，共56项浏览器检查记录。独立副本和当前构建的JS产物同为index-DB6exPdW.js。

风险：短屏最小球队徽仍偏小，半径不宣布冻结；连续快速投放频繁从歌曲开头切换，可能来不及进入有辨识度的段落，起播点待实际试听。歌曲响度未统一，音源为2K原文件。真实Android/iOS音频手势、设备音量及听感仍需真机；当前仅本地原型，停止等待反馈/反向审计。
