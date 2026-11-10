import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';
import { makeArchive } from './scripts/build-archive.mjs';

function projectArchive() {
  return {
    name: 'project-archive',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        try {
          const outDir = fileURLToPath(dir);
          const { zip, txt, count } = makeArchive();
          writeFileSync(join(outDir, 'pronine-alava-project.zip'), zip);
          writeFileSync(join(outDir, 'project-code.txt'), txt);
          logger.info(`Архив проекта готов: ${count} файлов`);
        } catch (error) {
          logger.warn(`Архив проекта не собран: ${error.message}`);
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://Dmitry-420.github.io',
  base: '/alava',
  integrations: [vue(), icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
