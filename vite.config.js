import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  base: './',
  // Windows 写入报告/许可证时可能短暂锁文件，这些文件不参与开发热更新。
  server: { watch: { ignored: ['**/reports/**', '**/docs/**', '**/licenses/**', '**/references/**'] } },
  plugins: [{
    name: 'license-notices',
    async writeBundle(options) {
      const output = path.resolve(root, options.dir ?? 'dist');
      await fs.cp(path.join(root, 'licenses'), path.join(output, 'licenses'), { recursive: true });
      await fs.copyFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'THIRD_PARTY_NOTICES.md'));
    }
  }]
});
