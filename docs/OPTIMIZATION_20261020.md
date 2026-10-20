# Merge 本地音源与维护记录

起始版本 467e7e6b98fe11c83782e75c9849611cb22cf012；首批 BFCache 同会话、暂停与统计幂等保留。本批只改运行音源编码/容器和对应路径、hash、manifest与维护文档，没有修改队伍身份、计分、歌词起点或选曲规则。12正常版、8小孩版全部保留；两个MP3运行路径改为m4a，原始MP3及其余18首全部按原字节归档 audio-originals，完整20文件原hash均核验。

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 20首音源磁盘字节 | 66,505,007 | 38,467,380 |
| dist 文件数 / 磁盘字节 | 40 / 66,890,830 | 41 / 38,863,336 |
| 390px选队首屏资源请求 | 14 | 14 |
| 首屏资源transferSize | 275,707 | 275,707 |
| 首屏 DOM / Audio实例 / 音源请求 | 120 / 0 / 0 | 120 / 0 / 0 |
| 开局后资源请求 / Audio实例 /音源种数 | 15 / 1 / 1 | 15 / 1 / 1 |
| 本次开局曲10031 transferSize | 2,813,197 | 2,813,073 |
| 390px选队页观测完成时间 ms | 637.5 | 619.3 |

总音源少28,037,627B（42.16%），但此次开局选到的10031原本约96kbps，采用流复制所以传输几乎不变；不能把全曲库压缩率宣称为每次首屏改善。磁盘总量、浏览器资源传输和时间分别测量。Edge155.0.4283.45，Windows，同机localhost静态HTTP，390/1440px、390 reduced-motion，未限速，每配置一次。时间在ready后等待networkidle时观测，含空闲等待，不能当线上加载速度；transferSize不含导航/TCP/TLS，报告另保留CDP实际接收bodyBytes。

实际执行：npm test 99/99；build前验证33份最终资源hash后Vite构建通过；Edge4个前后视口配置、20首真实解码/歌词起点播放/75%时点seek、单Audio按需加载、暂停/继续/静音通过；本地Range请求206/1024B/Content-Range和ETag条件304通过。原始证据 reports/audio-packaging-browser.json，截图 reports/audio-after-390.png。统计只写本地stub，网络禁止真实产品事件。

保留首批浏览器 reports/first-batch-bfcache.json 的7组成功证据：原生前进后退实际命中BFCache、26分与路线/球体/队列/暂停保留、同session/Audio、连续恢复1RAF、正常重开与退出清理。该份是保留的先前实测，没有改写成今日重跑。

正常/小孩版各30秒的64/96/128kbps样本位于交付工作区 audio-samples/；样本精确路径/大小/编码/sha及全部20首前后对比见 docs/audio-compression.json。**未人工试听**；96kbps是工程初选，解码/播放成功不代表听感验收。原始上游录音母带链未补齐，保留历史provenance。线上CDN Range/缓存、大陆网络、移动真机和人工听感均待后续验证，本批未修改设施或部署。

独立命令：npm test；npm run build；配置已有Playwright后 `node scripts/verify-audio-packaging.mjs --baseline <previous-Merge-dist>`，可用KPL_BROWSER_CHANNEL指定Edge。压缩/同步只用AUDIO_PACKAGING中的显式维护命令，正式build不自动重编码。当前规则、历史记录、未完成边界分别见 README、HISTORY_*、WORK_PACKAGES。
