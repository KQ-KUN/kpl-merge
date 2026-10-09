# 正常版与本命小孩版战歌 · 2026-10-08

本报告记录首次音源收录与接入验收；后续最低阶、连锁选曲、歌词进入点与本命弹窗以GAMEPLAY_REVISION_20261008.md为准。

用户提供的桌面“队歌正常版”有13首正常版和1首EDG.M小孩版。已收录全部14个文件，保留原件；新数据库app/data/team_anthems.json按canonical ID记录正常/小孩两版、原始文件名、来源、时长、格式、字节数与SHA256。13队包括当前年总12队及eStar；只收录eStar音源，不改变年总参赛池。数据库共13正常版+9小孩版（新增EDG.M，沿用旧8首），共22音源全部完整FFmpeg解码、哈希一致。

## 文件与维护

- tools/import_team_anthems.mjs：显式导入用户目录，先校验canonical身份、文件归属及音频容器，再写入；已有不同音源不覆盖。
- app/data/team_anthems.json：可复用的本地战歌数据库；新正常版在app/assets/audio/normal/，EDG.M小孩版在app/assets/audio/EDGM小孩.m4a，其他旧小孩版保持原位置。
- LGD的ldg战歌.mp3实际为裸AAC，使用FFmpeg的-c:a copy无损封装M4A，记录原文件和收录文件各自哈希，不重新编码；其余音源逐字节复制。
- merge/scripts/sync-teams.mjs：从数据库按ID取正常版/可选小孩版，校验名称/哈希/容器后生成独立schemaVersion=2快照。public/team-audio/normal有12首、child有8首；只清理上一快照明确管理且未再使用的资源，未知文件保留。
- 2K原championTrack与主数据库未改，合成游戏运行/build不读取桌面或父仓库，不调用同步、不请求外部音源。

导入命令：node tools/import_team_anthems.mjs "D:/HuaweiMoveData/Users/22974/Desktop/队歌正常版"。
同步命令（merge目录）：npm run sync:teams -- --source .. --as-of 2026-10-08 --pool annual。

## 游戏行为

点击开始播放本局L1的正常版；每次成功合成按输出等级切歌，持续到下一次合成。L0-L6只用正常版；L7是固定本命，优先用本队小孩版。WB/RW侠/JDG/LGD没有小孩版时使用本队正常版，绝不选择无双的王者。EDG.M现在有小孩版。普通投球、取消、冷却拒绝与preview不切歌。L7后再合成低等级时切回对应正常版。

每首正常版/小孩版分别保存实际播放游标，同源连续合成不重载。暂停/hidden/结束停止并释放src；继续/可见/取消静音续播当前等级。重开/换队重新从L1正常版选曲、保留各曲已有进度；刷新清空。每局仍只有1个Audio、2个监听、0个timer；旧Promise不覆盖新曲。计分、半径、生成概率、危险判定和无框队徽均未改变。

## 验证

- npm test：79/79通过，包括12队L0-L6正常版、L7选小孩/正常回退、双版本独立游标、路径/哈希与原物理/生命周期。
- npm run build通过，Vite7.3.6/Matter0.20.0无新增运行依赖。
- Edge154.0.4258.62：dev45项+built23项，共68项。两个版本20首音源逐首实际浏览器解码与时钟推进，含MP3、M4A及LGD封装版；真实Matter合成EDG.M本命播放新增小孩版，WB/RW侠/JDG/LGD本命各用正常版，无页面错误/404。8种视口、暂停/静音/连锁、30次重开/destroy等继续通过。
- 游戏音源合计63.42MiB，未压缩/重编码，媒体按当前曲加载；完整报告VALIDATION_NORMAL_CHILD_AUDIO.json，浏览器记录reports/browser-normal-child及browser-normal-child-built。

浏览器验证是解码、播放时间与资源清理证据，不等于真人声学试听或手机真机验收。未发布或接入Portal/analytics；音源权利不重新标为代码许可。
