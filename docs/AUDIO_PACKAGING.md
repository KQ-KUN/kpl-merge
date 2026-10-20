# 运行音源与只读来源

当前运行资源是 audio-only、faststart 的 AAC-LC m4a。较大AAC/MP3转96 kbps stereo 44.1 kHz；原本约96 kbps（ffprobe不超过100000 bps）的AAC-LC直接复制压缩流，不二次有损编码。原快照 20 首源文件（含封面流、较高码率 AAC 与 MP3）全部按原路径与 SHA-256 保存于 audio-originals，文件只读，未裁曲、改速、改音量或改变歌词起点。audio-originals/manifest.json 保留原 teams、provenance 和 ffprobe 结果；它不放 public/dist。

显式维护命令：

```powershell
python scripts/prepare-audio.py --ffmpeg-dir $env:FFMPEG_DIR --source-commit 467e7e6b98fe11c83782e75c9849611cb22cf012 --samples-dir ../audio-samples
npm test
npm run build
```

重复运行总是从已归档原文件派生，不再次压缩运行文件。初次归档的 sourceCommit 指实际 Merge 冻结消费快照，原始上游链见保留 provenance，不宣称已取得未取得的录音母带。若显式重新同步 canonical/曲库，须重新审查 sourceCommit、归档新版本并生成清单，不覆盖已存在的只读来源。

本次提供正常/小孩版各 30 秒的 64/96/128 kbps 样本用于用户试听。96 kbps 是体积与通用音乐用途的保守工程选择；已验证编码、时长、seek和播放，不宣称经过人工听感验收或无损。样本路径和全部前后 bytes、ffprobe、duration delta 见 audio-compression.json。

public/data/manifest.json 的 outputs hash 在最终音源路径改写后计算，含 teams JSON、20 首运行音源和12队徽。build 只验证这些最终输出，不读外部 canonical 或原始音源，不自动同步。运行时只使用 createAnthemPlayer 的单个 Audio、preload=none；切歌/暂停/隐藏/静音保存游标并释放 src。正常/小孩版游标独立，曲目失败可以继续游戏。

本地 Range 206、缓存响应和真实 seek 是开发验证；线上 Range、CDN缓存、大陆网络、移动真机及人工试听须另验。本批不修改托管设施或部署。
